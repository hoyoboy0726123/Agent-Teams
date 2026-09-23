// MP4 export for video artifacts: narrate each scene (TTS), stretch scenes to fit the voice,
// record the deterministic player frame by frame in headless Chromium, and encode with ffmpeg
// (H.264 + AAC, narration and clip audio mixed at their scene offsets).
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, rename, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderArtifact } from '../../web/render.js';
import { parseVideo, timeline, FORMATS } from '../../web/video.js';
import { emit } from '../bus.js';
import { audit } from '../db.js';
import { synthesize, ttsConfig } from './tts.js';
import { mediaDir, localMediaPath } from './store.js';

const FFMPEG = () => process.env.FFMPEG_PATH || 'ffmpeg';

function runFfmpeg(args, { stdin = false } = {}) {
  const p = spawn(FFMPEG(), ['-hide_banner', '-loglevel', 'error', ...args], { stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
  const done = new Promise((resolve, reject) => {
    p.on('error', (e) => reject(new Error(`ffmpeg not available (${e.code || e.message}) — install ffmpeg or set FFMPEG_PATH`)));
    p.on('close', (code) => (code ? reject(new Error(`ffmpeg failed: ${err.trim().split('\n').slice(-3).join(' ')}`)) : resolve()));
  });
  return { proc: p, done };
}

// Duration in seconds, read from ffmpeg's banner (works without ffprobe).
async function mediaInfo(file) {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG(), ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let out = '';
    p.stderr.on('data', (d) => { out += d; });
    p.on('error', () => resolve({ duration: 0, audio: false }));
    p.on('close', () => {
      const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
      resolve({ duration: m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0, audio: /Stream #.*Audio:/.test(out) });
    });
  });
}

async function loadBrowser() {
  let pw = null;
  for (const name of ['playwright-core', 'playwright']) {
    try { pw = await import(name); break; } catch {}
  }
  const chromium = pw?.chromium || pw?.default?.chromium;
  if (!chromium) throw new Error('Headless Chromium is not available — run `npm install playwright-core` and `npx playwright install chromium` (or set CHROMIUM_PATH)');
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage'] });
}

export async function capabilities() {
  const ffmpeg = await new Promise((resolve) => {
    const p = spawn(FFMPEG(), ['-version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (c) => resolve(c === 0));
  });
  let chromium = false;
  for (const name of ['playwright-core', 'playwright']) {
    try { await import(name); chromium = true; break; } catch {}
  }
  return { ffmpeg, chromium, tts: !!ttsConfig()?.providerId };
}

export const outputPath = (aid, version) => join(mediaDir('videos'), `${aid}-v${version}.mp4`);
const jobs = new Map(); // `${aid}:${version}` → { status, pct, stage, error, startedAt }

export function exportStatus(aid, version) {
  const j = jobs.get(`${aid}:${version}`);
  if (j) return j;
  return existsSync(outputPath(aid, version)) ? { status: 'done', pct: 100 } : { status: 'none' };
}

// Output size: 720p by default (fast), 1080p with hd.
const outSize = ([W, H], hd) => {
  const k = hd ? 1 : 2 / 3;
  return [Math.round((W * k) / 2) * 2, Math.round((H * k) / 2) * 2];
};

export function startExport(a, { narration = true, hd = false, fps = 30, user } = {}) {
  const key = `${a.id}:${a.viewing}`;
  const running = jobs.get(key);
  if (running?.status === 'running') return running;
  const job = { status: 'running', pct: 0, stage: 'prepare', error: null, startedAt: Date.now() };
  jobs.set(key, job);
  const update = (patch) => {
    Object.assign(job, patch);
    emit('video.export', { channelId: a.channelId, artifactId: a.id, version: a.viewing, ...job });
  };
  update({});
  exportVideo(a, { narration, hd, fps, update })
    .then(() => { update({ status: 'done', pct: 100, stage: 'done' }); audit('user', user?.id, 'artifact.video_export', a.id, { version: a.viewing, seconds: Math.round((Date.now() - job.startedAt) / 1000) }); })
    .catch((e) => update({ status: 'error', error: e.message }))
    .finally(() => setTimeout(() => { if (jobs.get(key) === job && job.status !== 'running') jobs.delete(key); }, 60_000).unref?.());
  return job;
}

async function exportVideo(a, { narration, hd, fps, update }) {
  const v = parseVideo(a.content);
  const tmp = await mkdtemp(join(tmpdir(), 'agent-teams-video-'));
  let browser;
  try {
    // 1. Narration: one audio file per scene; a scene lasts at least as long as its voice.
    const voices = [];
    if (narration && ttsConfig()?.providerId) {
      const todo = v.scenes.map((s, i) => [s, i]).filter(([s]) => String(s.narration || '').trim());
      for (const [n, [s, i]] of todo.entries()) {
        update({ stage: 'narration', pct: Math.round((n / todo.length) * 15) });
        const { buf, ext } = await synthesize(String(s.narration).trim());
        const file = join(tmp, `voice-${i}.${ext}`);
        await writeFile(file, buf);
        const { duration } = await mediaInfo(file);
        voices[i] = { file, duration };
        s.duration = Math.max(3, Math.round((duration + 0.8) * 10) / 10, Number(s.duration) || 0);
      }
    }
    const tl = timeline(v);
    const total = tl.at(-1).start + tl.at(-1).duration;

    // Open-source Chromium builds cannot decode H.264, so clips are recorded from VP8 proxies
    // (keyframe every 6 frames for fast, exact seeks). Their audio is mixed by ffmpeg below.
    const proxies = new Map();
    for (const s of v.scenes) {
      const local = s.layout === 'clip' ? localMediaPath(s.clip || s.src) : null;
      if (!local || proxies.has(local)) continue;
      update({ stage: 'prepare', pct: 15 });
      const out = join(tmp, `clip-${proxies.size}.webm`);
      await runFfmpeg(['-y', '-i', local, '-an', '-c:v', 'libvpx', '-b:v', '5M', '-g', '6', '-deadline', 'realtime', '-cpu-used', '8', out]).done;
      proxies.set(local, out);
    }

    // 2. Player page, served from a private origin; /media/ files come straight from disk.
    const html = renderArtifact({ ...a, type: 'video', content: JSON.stringify(v) });
    const [w, h] = outSize(FORMATS[v.format] || FORMATS['16:9'], hd);
    update({ stage: 'launch', pct: 16 });
    browser = await loadBrowser();
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === 'http://video.local/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      const local = url.startsWith('http://video.local/media/') ? localMediaPath(url) : null;
      if (local) {
        // Media elements seek with Range requests; answer them so clips can be scrubbed frame by frame.
        const file = proxies.get(local) || local;
        const buf = await readFile(file);
        const type = /\.webm$/.test(file) ? 'video/webm' : /\.mp4$/.test(file) ? 'video/mp4' : 'application/octet-stream';
        const m = /bytes=(\d*)-(\d*)/.exec(route.request().headers().range || '');
        if (!m) return route.fulfill({ status: 200, body: buf, headers: { 'content-type': type, 'accept-ranges': 'bytes' } });
        const start = m[1] ? Number(m[1]) : Math.max(0, buf.length - Number(m[2]));
        const end = m[1] && m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
        return route.fulfill({ status: 206, body: buf.subarray(start, end + 1), headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${buf.length}` } });
      }
      if (url.startsWith('http://video.local/')) return route.fulfill({ status: 404, body: '' });
      return route.continue();
    });
    await page.addInitScript(() => { window.__EXPORT = true; });
    await page.goto('http://video.local/', { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => window.__video, null, { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // 3. Audio graph: narration + clip soundtracks placed at their scene start.
    const inputs = [], filters = [], labels = [];
    const addAudio = (args, start, idx) => {
      inputs.push(...args);
      filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)}[a${idx}]`);
      labels.push(`[a${idx}]`);
    };
    let idx = 1;
    for (const [i, s] of v.scenes.entries()) {
      if (voices[i]) addAudio(['-i', voices[i].file], tl[i].start + 0.3, idx++);
      const clip = s.layout === 'clip' ? localMediaPath(s.clip || s.src) : null;
      if (clip && (await mediaInfo(clip)).audio) addAudio(['-ss', String(Number(s.from) || 0), '-t', String(tl[i].duration), '-i', clip], tl[i].start, idx++);
    }
    const out = outputPath(a.id, a.viewing);
    const part = `${out}.part.mp4`;
    const audioArgs = labels.length
      ? ['-filter_complex', `${filters.join(';')};${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,apad[aout]`, '-map', '0:v', '-map', '[aout]']
      : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a'];
    const args = labels.length
      ? ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', ...inputs, ...audioArgs]
      : ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', ...audioArgs];
    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '20', '-r', String(fps),
      '-c:a', 'aac', '-b:a', '160k', '-t', total.toFixed(2), '-movflags', '+faststart', part);
    const ff = runFfmpeg(args, { stdin: true });
    ff.done.catch(() => {});

    // 4. Frames.
    const frames = Math.ceil(total * fps);
    for (let f = 0; f < frames; f++) {
      await page.evaluate((t) => window.__video.seek(t), f / fps);
      const jpg = await page.screenshot({ type: 'jpeg', quality: 90 });
      if (ff.proc.exitCode !== null) break;
      if (!ff.proc.stdin.write(jpg)) await new Promise((r) => ff.proc.stdin.once('drain', r));
      if (f % Math.max(1, Math.round(fps / 2)) === 0) update({ stage: 'frames', pct: 18 + Math.round((f / frames) * 77) });
    }
    ff.proc.stdin.end();
    update({ stage: 'encode', pct: 96 });
    await ff.done;
    await rename(part, out);
    const { size } = await stat(out);
    update({ bytes: size, duration: Math.round(total * 10) / 10 });
  } finally {
    await browser?.close().catch(() => {});
    await rm(tmp, { recursive: true, force: true });
    await rm(`${outputPath(a.id, a.viewing)}.part.mp4`, { force: true });
  }
}
