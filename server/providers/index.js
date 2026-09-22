// Provider registry + persistence. Adapters expose { listModels(p), stream(p, opts) }.
import { anthropic } from './anthropic.js';
import { openaiFamily } from './openai.js';
import { gemini } from './gemini.js';
import { ollama } from './ollama.js';
import { claudeCode, codex, geminiCli } from './cli.js';
import { demo } from './demo.js';
import { all, get, run, id, now, json } from '../db.js';
import { encrypt, decrypt, mask } from '../secrets.js';

export const adapters = Object.fromEntries(
  [claudeCode, codex, geminiCli, anthropic, ...openaiFamily, gemini, ollama, demo].map((a) => [a.type, a]),
);

export function catalog() {
  return Object.values(adapters).map((a) => ({
    type: a.type, label: a.label, kind: a.kind, needsKey: a.needsKey,
    defaultBaseUrl: a.defaultBaseUrl || '', defaultModel: a.defaultModel || '',
    models: a.fallbackModels || [], docs: a.docs || '', hint: a.hint || '',
  }));
}

function hydrate(row) {
  if (!row) return null;
  return { id: row.id, type: row.type, name: row.name, baseUrl: row.base_url || '', apiKey: decrypt(row.api_key_enc), extra: json(row.extra_json, {}), enabled: !!row.enabled };
}

// Safe for the browser: never includes the key itself.
export function publicProvider(row) {
  const p = hydrate(row);
  const a = adapters[p.type];
  return { id: p.id, type: p.type, name: p.name, baseUrl: p.baseUrl, extra: p.extra, enabled: p.enabled,
    hasKey: !!p.apiKey, keyPreview: mask(p.apiKey), kind: a?.kind, label: a?.label, createdAt: row.created_at };
}

export const listProviders = () => all('SELECT * FROM providers ORDER BY created_at').map(publicProvider);
export const getProvider = (pid) => hydrate(get('SELECT * FROM providers WHERE id = ?', pid));

export function createProvider({ type, name, baseUrl, apiKey, extra }) {
  if (!adapters[type]) throw Object.assign(new Error(`Unknown provider type: ${type}`), { status: 400 });
  const pid = id('prv_');
  run('INSERT INTO providers(id, type, name, base_url, api_key_enc, extra_json, enabled, created_at) VALUES (?,?,?,?,?,?,1,?)',
    pid, type, name || adapters[type].label || type, baseUrl || null, encrypt(apiKey), JSON.stringify(extra || {}), now());
  return publicProvider(get('SELECT * FROM providers WHERE id = ?', pid));
}

export function updateProvider(pid, patch) {
  const row = get('SELECT * FROM providers WHERE id = ?', pid);
  if (!row) return null;
  run('UPDATE providers SET name = ?, base_url = ?, api_key_enc = ?, extra_json = ?, enabled = ? WHERE id = ?',
    patch.name ?? row.name,
    patch.baseUrl !== undefined ? patch.baseUrl || null : row.base_url,
    patch.apiKey !== undefined && patch.apiKey !== '' ? encrypt(patch.apiKey) : patch.clearKey ? null : row.api_key_enc,
    patch.extra !== undefined ? JSON.stringify(patch.extra) : row.extra_json,
    patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : row.enabled,
    pid);
  return publicProvider(get('SELECT * FROM providers WHERE id = ?', pid));
}

export const deleteProvider = (pid) => run('DELETE FROM providers WHERE id = ?', pid).changes > 0;

export async function listModels(pid) {
  const p = getProvider(pid);
  if (!p) throw Object.assign(new Error('Provider not found'), { status: 404 });
  const a = adapters[p.type];
  try {
    const models = await a.listModels(p);
    return { ok: true, models: models.length ? models : a.fallbackModels || [] };
  } catch (e) {
    return { ok: false, error: e.message, models: a.fallbackModels || [] };
  }
}

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

// Stream a completion, with retry on transient failures before the first token and usage logging.
export async function* streamChat(pid, opts, meta = {}) {
  const p = getProvider(pid);
  if (!p) throw new Error('This agent has no model provider configured. Open Settings → Providers.');
  if (!p.enabled) throw new Error(`Provider "${p.name}" is disabled.`);
  const a = adapters[p.type];
  if (a.needsKey && !p.apiKey) throw new Error(`Provider "${p.name}" is missing an API key.`);
  const model = opts.model || p.extra?.defaultModel || a.defaultModel;
  const started = Date.now();
  let input = 0, output = 0, ok = 1, emitted = false;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        for await (const ev of a.stream(p, { ...opts, model })) {
          if (ev.type === 'usage') { input += ev.input; output += ev.output; continue; }
          emitted = true;
          yield ev;
        }
        break;
      } catch (e) {
        if (emitted || attempt >= 2 || opts.signal?.aborted || !(RETRYABLE.has(e.status) || /ECONNRESET|fetch failed/i.test(e.message))) throw e;
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
      }
    }
  } catch (e) {
    ok = 0;
    throw e;
  } finally {
    run('INSERT INTO usage(agent_id, provider_id, model, input_tokens, output_tokens, latency_ms, ok, created_at) VALUES (?,?,?,?,?,?,?,?)',
      meta.agentId || null, pid, model || null, input, output, Date.now() - started, ok, now());
  }
}

// Non-streaming convenience wrapper.
export async function complete(pid, opts, meta) {
  let text = '';
  for await (const ev of streamChat(pid, opts, meta)) if (ev.type === 'text') text += ev.text;
  return text;
}
