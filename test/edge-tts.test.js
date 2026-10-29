// Edge free voice-over, against a local stand-in for Microsoft's speech WebSocket: token and
// headers, SSML framing and escaping, binary audio frames, errors, and the settings preview.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { boot } from './helpers.js';

const hasFfmpeg = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']).status === 0;
// A real 1.5 s MP3 when ffmpeg is around (so durations can be checked), else arbitrary bytes.
const mp3 = hasFfmpeg
  ? spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5', '-c:a', 'libmp3lame', '-f', 'mp3', '-'], { maxBuffer: 1 << 24 }).stdout
  : Buffer.from('ID3fake-audio');

const seen = [];
const wss = new WebSocketServer({ port: 0 });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const conn = { query: Object.fromEntries(url.searchParams), origin: req.headers.origin, texts: [] };
  seen.push(conn);
  ws.on('message', (data) => {
    const s = data.toString();
    conn.texts.push(s);
    if (!/Path:ssml/.test(s)) return;
    if (/Nobody/.test(s)) { ws.send('X-RequestId:1\r\nPath:turn.end\r\n\r\n{}'); return; }
    ws.send('X-RequestId:1\r\nContent-Type:application/json\r\nPath:turn.start\r\n\r\n{}');
    // Send the audio in two binary frames: [2-byte header length][header][audio bytes].
    for (const part of [mp3.subarray(0, mp3.length >> 1), mp3.subarray(mp3.length >> 1)]) {
      const header = Buffer.from('X-RequestId:1\r\nContent-Type:audio/mpeg\r\nPath:audio\r\n');
      const len = Buffer.alloc(2); len.writeUInt16BE(header.length);
      ws.send(Buffer.concat([len, header, part]));
    }
    ws.send('X-RequestId:1\r\nPath:turn.end\r\n\r\n{}');
  });
});
await new Promise((r) => wss.once('listening', r));
process.env.EDGE_TTS_URL = `ws://127.0.0.1:${wss.address().port}/edge/v1`;

const { edgeSpeak, secMsGec, defaultVoice } = await import('../server/media/edge-tts.js');
const app = await boot();
after(async () => { wss.close(); await app.close(); });

test('Edge voice sends a valid token and SSML and returns the audio', async () => {
  const { buf, ext } = await edgeSpeak('早安 <大家> & "你好"', { voice: 'zh-TW-YunJheNeural' });
  assert.equal(ext, 'mp3');
  assert.ok(buf.equals(mp3));
  const c = seen.at(-1);
  assert.equal(c.query.TrustedClientToken, '6A5AA1D4EAFF4E9FB37E23D68491D6F4');
  assert.equal(c.query['Sec-MS-GEC'], secMsGec());
  assert.match(c.query['Sec-MS-GEC-Version'], /^1-\d+\./);
  assert.equal(c.origin, 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold');
  assert.match(c.texts[0], /Path:speech\.config[\s\S]*audio-24khz-48kbitrate-mono-mp3/);
  assert.match(c.texts[1], /<voice name='zh-TW-YunJheNeural'>/);
  assert.match(c.texts[1], /早安 &lt;大家&gt; &amp; &quot;你好&quot;/);
});

test('token is stable within five minutes and voices default by language', () => {
  const t = Date.UTC(2026, 8, 23, 10, 0, 0);
  assert.equal(secMsGec(t), secMsGec(t + 299_000));
  assert.notEqual(secMsGec(t), secMsGec(t + 300_000));
  assert.match(secMsGec(t), /^[0-9A-F]{64}$/);
  assert.equal(defaultVoice('今天天氣很好'), 'zh-TW-HsiaoChenNeural');
  assert.equal(defaultVoice('こんにちは'), 'ja-JP-NanamiNeural');
  assert.equal(defaultVoice('Hello there'), 'en-US-AvaNeural');
});

test('bad voices and empty replies fail clearly', async () => {
  await assert.rejects(edgeSpeak('hi', { voice: "x'><script>" }), /Unknown Edge voice/);
  await assert.rejects(edgeSpeak('Nobody', { voice: 'en-US-AvaNeural' }), /no audio/);
});

test('Settings can preview the Edge voice and export uses it', async (t) => {
  const owner = app.client();
  await owner.call('POST', '/api/auth/register', { username: 'owner', password: 'secret123' });
  const caps = (await owner.call('GET', '/api/video/capabilities')).data;
  assert.ok(caps.edgeVoices.some((v) => v.id === 'zh-TW-HsiaoChenNeural'));
  const res = await fetch(`${app.base}/api/video/tts-preview`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: owner.cookie }, body: JSON.stringify({ providerId: 'edge', voice: 'zh-TW-HsiaoChenNeural' }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'audio/mpeg');
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(mp3));

  await owner.call('PATCH', '/api/settings', { tts: { providerId: 'edge', voice: 'zh-TW-HsiaoChenNeural' } });
  assert.match((await owner.call('GET', '/api/video/capabilities')).data.ttsLabel, /Edge voice \(free\) · 曉臻/);
  if (!caps.ffmpeg || !caps.chromium) return t.skip('ffmpeg or Chromium not installed');
  const { data: a } = await owner.call('POST', '/api/artifacts', { type: 'video', title: 'Edge narrated', content: JSON.stringify({ scenes: [{ layout: 'title', title: 'Hi', narration: '大家好', duration: 1 }] }) });
  await owner.call('POST', `/api/artifacts/${a.id}/export-video`, { narration: true });
  let st;
  for (let i = 0; i < 200; i++) { st = (await owner.call('GET', `/api/artifacts/${a.id}/video/status`)).data; if (['done', 'error'].includes(st.status)) break; await new Promise((r) => setTimeout(r, 300)); }
  assert.equal(st.status, 'done', st.error);
  // The 1 s scene was stretched to fit the 1.5 s voice (+ padding).
  assert.ok(st.duration >= 2.2, `duration ${st.duration}`);
});
