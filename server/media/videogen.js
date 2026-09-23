// AI video clips for agents (the generate_video tool): OpenAI Sora or Google Veo with your own
// key, or an offline demo clip. Jobs are asynchronous on the provider side, so we submit, poll
// and download. Every call is approved by a human first (see agents/runtime.js).
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getSetting } from '../db.js';
import { getProvider, adapters } from '../providers/index.js';

export const videoGenConfig = () => getSetting('videoGen', null);
export const VIDEO_GEN_TYPES = ['openai', 'gemini'];

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('Stopped')); }, { once: true });
});

async function demoClip({ seconds, aspect }) {
  const [w, h] = aspect === '9:16' ? [720, 1280] : aspect === '1:1' ? [720, 720] : [1280, 720];
  const dir = await mkdtemp(join(tmpdir(), 'agent-teams-clip-'));
  const out = join(dir, 'clip.mp4');
  await new Promise((resolve, reject) => {
    const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `testsrc2=size=${w}x${h}:rate=24:duration=${seconds}`,
      '-f', 'lavfi', '-i', `sine=frequency=330:duration=${seconds}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', () => reject(new Error('ffmpeg is needed for demo clips')));
    p.on('close', (c) => (c ? reject(new Error(`ffmpeg: ${err.slice(-200)}`)) : resolve()));
  });
  try { return await readFile(out); } finally { await rm(dir, { recursive: true, force: true }); }
}

async function sora(p, { prompt, seconds, aspect, model, signal, onProgress }) {
  const base = (p.baseUrl || adapters.openai.defaultBaseUrl).replace(/\/$/, '');
  const auth = { authorization: `Bearer ${p.apiKey}` };
  const form = new FormData();
  form.set('model', model || 'sora-2');
  form.set('prompt', prompt);
  form.set('seconds', String([4, 8, 12].reduce((a, b) => (Math.abs(b - seconds) < Math.abs(a - seconds) ? b : a), 8)));
  form.set('size', aspect === '9:16' ? '720x1280' : '1280x720');
  const res = await fetch(`${base}/videos`, { method: 'POST', headers: auth, body: form, signal });
  if (!res.ok) throw new Error(`Sora ${res.status}: ${(await res.text()).slice(0, 300)}`);
  let job = await res.json();
  const until = Date.now() + 20 * 60_000;
  while (!['completed', 'failed', 'cancelled'].includes(job.status)) {
    if (Date.now() > until) throw new Error('Sora did not finish within 20 minutes');
    await sleep(5000, signal);
    const r = await fetch(`${base}/videos/${job.id}`, { headers: auth, signal });
    if (!r.ok) throw new Error(`Sora ${r.status}: ${(await r.text()).slice(0, 300)}`);
    job = await r.json();
    onProgress?.(job.progress ?? null);
  }
  if (job.status !== 'completed') throw new Error(`Sora ${job.status}: ${job.error?.message || 'no video'}`);
  const file = await fetch(`${base}/videos/${job.id}/content`, { headers: auth, signal });
  if (!file.ok) throw new Error(`Sora download ${file.status}`);
  return Buffer.from(await file.arrayBuffer());
}

async function veo(p, { prompt, aspect, model, signal, onProgress }) {
  const base = adapters.gemini.base(p);
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': p.apiKey };
  const res = await fetch(`${base}/models/${model || 'veo-3.0-fast-generate-001'}:predictLongRunning`, {
    method: 'POST', headers, signal,
    body: JSON.stringify({ instances: [{ prompt }], parameters: { aspectRatio: aspect === '9:16' ? '9:16' : '16:9' } }),
  });
  if (!res.ok) throw new Error(`Veo ${res.status}: ${(await res.text()).slice(0, 300)}`);
  let op = await res.json();
  const until = Date.now() + 20 * 60_000;
  let polls = 0;
  while (!op.done) {
    if (Date.now() > until) throw new Error('Veo did not finish within 20 minutes');
    await sleep(8000, signal);
    const r = await fetch(`${base}/${op.name}`, { headers, signal });
    if (!r.ok) throw new Error(`Veo ${r.status}: ${(await r.text()).slice(0, 300)}`);
    op = await r.json();
    onProgress?.(Math.min(95, ++polls * 8));
  }
  if (op.error) throw new Error(`Veo: ${op.error.message}`);
  const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error('Veo returned no video (it may have been filtered)');
  const file = await fetch(uri, { headers: { 'x-goog-api-key': p.apiKey }, signal });
  if (!file.ok) throw new Error(`Veo download ${file.status}`);
  return Buffer.from(await file.arrayBuffer());
}

// → Buffer (mp4)
export async function generateVideo({ prompt, seconds = 8, aspect = '16:9', signal, onProgress }, cfg = videoGenConfig()) {
  if (!cfg?.providerId) throw new Error('AI video generation is not set up (Settings → Workspace → Video)');
  prompt = String(prompt || '').trim().slice(0, 2000);
  if (!prompt) throw new Error('A prompt is required');
  seconds = Math.min(12, Math.max(2, Number(seconds) || 8));
  if (!['16:9', '9:16', '1:1'].includes(aspect)) aspect = '16:9';
  if (cfg.providerId === 'demo') return demoClip({ seconds, aspect });
  const p = getProvider(cfg.providerId);
  if (!p) throw new Error('The video provider no longer exists');
  if (p.type === 'openai') return sora(p, { prompt, seconds, aspect, model: cfg.model, signal, onProgress });
  if (p.type === 'gemini') return veo(p, { prompt, aspect, model: cfg.model, signal, onProgress });
  throw new Error(`${p.name} cannot generate video — use an OpenAI (Sora) or Gemini (Veo) key`);
}
