// Video artifacts: storyboard rendering, the deterministic player, and MP4 export
// (demo voice-over + headless Chromium + ffmpeg). Export checks skip when the tools are missing.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, waitFor } from './helpers.js';

const { renderArtifact } = await import('../web/render.js');
const { parseVideo, sceneDuration, timeline } = await import('../web/video.js');
const app = await boot();
after(() => app.close());
const owner = app.client();
await owner.call('POST', '/api/auth/register', { username: 'owner', password: 'secret123' });
const sample = readFileSync(new URL('./fixtures/sample-video.json', import.meta.url), 'utf8');

test('storyboards parse, time themselves from narration and render every layout', () => {
  const v = parseVideo(sample);
  assert.equal(v.scenes.length, 6);
  assert.equal(sceneDuration({ duration: 4 }), 4);
  assert.ok(sceneDuration({ narration: '這是一段大約二十個字的中文旁白，用來估算時間長度。' }) > 5);
  assert.equal(sceneDuration({ layout: 'clip' }), 6);
  const tl = timeline(v);
  assert.equal(tl[1].start, tl[0].duration);
  const html = renderArtifact({ type: 'video', title: 'Sample', content: sample });
  assert.match(html, /window\.__video|__video/);
  assert.match(html, /class="count" data-to="94"/);
  assert.match(html, /<svg/);
  assert.equal((html.match(/<section class="scene/g) || []).length, 6);
  assert.throws(() => parseVideo('{"scenes":[]}'), /non-empty/);
  // Hostile values stay inert.
  const evil = renderArtifact({ type: 'video', title: 'x', content: JSON.stringify({ theme: { bg: 'red;}</style><script>alert(1)</script>' }, scenes: [{ title: '<img src=x onerror=alert(1)>', image: 'javascript:alert(1)' }] }) });
  assert.ok(!evil.includes('<img src=x'));
  assert.ok(!evil.includes('javascript:alert'));
  assert.ok(!evil.includes('</style><script>alert'));
  assert.match(renderArtifact({ type: 'video', title: 'bad', content: 'not json' }), /could not be parsed/);
});

test('video artifacts export to MP4 with a voice-over track', async (t) => {
  const caps = (await owner.call('GET', '/api/video/capabilities')).data;
  if (!caps.ffmpeg || !caps.chromium) return t.skip('ffmpeg or Chromium not installed');
  await owner.call('PATCH', '/api/settings', { tts: { providerId: 'demo' } });
  const short = JSON.stringify({ title: 'Short', scenes: [
    { layout: 'title', title: 'Hello', narration: 'Hi there' },
    { layout: 'stat', value: '42%', label: 'Growth', duration: 1.5 },
  ] });
  const { data: a } = await owner.call('POST', '/api/artifacts', { type: 'video', title: 'Short clip', content: short });
  assert.equal((await owner.call('POST', `/api/artifacts/${a.id}/export-video`, { narration: true })).data.status, 'running');
  const st = await waitFor(async () => {
    const s = (await owner.call('GET', `/api/artifacts/${a.id}/video/status`)).data;
    return ['done', 'error'].includes(s.status) && s;
  }, { timeout: 90_000, every: 300 });
  assert.equal(st.status, 'done', st.error);

  const res = await fetch(`${app.base}/api/artifacts/${a.id}/video`, { headers: { cookie: owner.cookie, range: 'bytes=0-99' } });
  assert.equal(res.status, 206);
  const head = Buffer.from(await res.arrayBuffer());
  assert.equal(head.length, 100);
  assert.equal(head.subarray(4, 8).toString(), 'ftyp');
  const full = await fetch(`${app.base}/api/artifacts/${a.id}/video?download=1`, { headers: { cookie: owner.cookie } });
  assert.match(full.headers.get('content-disposition'), /Short-clip\.mp4/);
  assert.ok(Number(full.headers.get('content-length')) > 5000);

  // Not exportable: other types, broken storyboards; not visible without a session.
  const { data: doc } = await owner.call('POST', '/api/artifacts', { type: 'document', title: 'Doc', content: 'x' });
  assert.equal((await owner.call('POST', `/api/artifacts/${doc.id}/export-video`, {})).status, 400);
  const { data: bad } = await owner.call('POST', '/api/artifacts', { type: 'video', title: 'Bad', content: '{' });
  assert.equal((await owner.call('POST', `/api/artifacts/${bad.id}/export-video`, {})).status, 422);
  assert.equal((await fetch(`${app.base}/api/artifacts/${a.id}/video`)).status, 401);
});
