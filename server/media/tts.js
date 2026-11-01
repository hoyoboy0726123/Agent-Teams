// Text-to-speech for video narration. Uses a provider you already configured (OpenAI or any
// OpenAI-compatible /audio/speech endpoint, or Gemini TTS), a local command (e.g. Piper), or
// the offline demo voice (a soft tone, for tests and demos).
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSetting } from '../db.js';
import { getProvider, adapters } from '../providers/index.js';
import { edgeSpeak, EDGE_VOICES } from './edge-tts.js';

const OPENAI_LIKE = new Set(['openai', 'openai-compatible', 'groq']);
// Provider types that can speak; shown in the narration voice picker.
export const TTS_TYPES = [...OPENAI_LIKE, 'gemini'];

export const ttsConfig = () => getSetting('tts', null);

export function ttsLabel(cfg = ttsConfig()) {
  if (!cfg?.providerId) return null;
  if (cfg.providerId === 'demo') return 'Demo voice (offline tone)';
  if (cfg.providerId === 'edge') return `Edge voice (free) · ${EDGE_VOICES.find((v) => v.id === cfg.voice)?.label || cfg.voice || 'auto'}`;
  if (cfg.providerId === 'command') return process.env.TTS_COMMAND ? `Local command: ${process.env.TTS_COMMAND.split(' ')[0]}` : null;
  const p = getProvider(cfg.providerId);
  return p ? `${p.name}${cfg.voice ? ` · ${cfg.voice}` : ''}` : null;
}

// PCM s16le mono → WAV container.
export function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function demoVoice(text) {
  const rate = 16000;
  const secs = Math.min(20, 0.6 + String(text).length * 0.09);
  const pcm = Buffer.alloc(Math.floor(secs * rate) * 2);
  for (let i = 0; i < pcm.length / 2; i++) {
    const t = i / rate;
    const env = Math.min(1, t * 8, (secs - t) * 8) * (0.55 + 0.45 * Math.sin(t * 6));
    pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * t) * 2500 * env), i * 2);
  }
  return { buf: wav(pcm, rate), ext: 'wav' };
}

function commandVoice(text) {
  // TTS_COMMAND reads text on stdin and writes audio to the path given as {out}.
  const out = join(tmpdir(), `tts-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  const cmd = process.env.TTS_COMMAND.replace('{out}', out);
  return new Promise((resolve, reject) => {
    const p = spawn('sh', ['-c', cmd], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-500); });
    p.on('error', reject);
    p.on('close', async (code) => {
      if (code) return reject(new Error(`TTS command failed: ${err.trim()}`));
      const { readFile, rm } = await import('node:fs/promises');
      try { resolve({ buf: await readFile(out), ext: 'wav' }); } catch (e) { reject(e); } finally { rm(out, { force: true }).catch(() => {}); }
    });
    p.stdin.end(text);
  });
}

// → { buf, ext }
export async function synthesize(text, cfg = ttsConfig()) {
  if (!cfg?.providerId) throw new Error('No narration voice configured (Settings → Workspace → Video narration)');
  if (cfg.providerId === 'demo') return demoVoice(text);
  if (cfg.providerId === 'edge') return edgeSpeak(text, { voice: cfg.voice || undefined, rate: cfg.rate || undefined });
  if (cfg.providerId === 'command') {
    if (!process.env.TTS_COMMAND) throw new Error('TTS_COMMAND is not set');
    return commandVoice(text);
  }
  const p = getProvider(cfg.providerId);
  if (!p) throw new Error('The narration provider no longer exists');
  const signal = AbortSignal.timeout(90_000);
  if (p.type === 'gemini') {
    const base = adapters.gemini.base(p);
    const res = await fetch(`${base}/models/${cfg.model || 'gemini-2.5-flash-preview-tts'}:generateContent`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': p.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice || 'Kore' } } } },
      }),
    });
    if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    const data = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData)?.inlineData;
    if (!data) throw new Error('Gemini TTS returned no audio');
    const rate = Number(/rate=(\d+)/.exec(data.mimeType || '')?.[1]) || 24000;
    return { buf: wav(Buffer.from(data.data, 'base64'), rate), ext: 'wav' };
  }
  if (OPENAI_LIKE.has(p.type)) {
    const base = (p.baseUrl || adapters[p.type]?.defaultBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/audio/speech`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', ...(p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {}) },
      body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini-tts', voice: cfg.voice || 'alloy', input: text, response_format: 'mp3' }),
    });
    if (!res.ok) throw new Error(`${p.name} TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { buf: Buffer.from(await res.arrayBuffer()), ext: 'mp3' };
  }
  throw new Error(`${p.name} (${p.type}) cannot synthesize speech — pick an OpenAI-compatible or Gemini provider`);
}
