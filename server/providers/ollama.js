// Ollama local models (http://localhost:11434). No key, fully offline.
import { ndjson, httpError } from './sse.js';

export const ollama = {
  type: 'ollama',
  label: 'Ollama (local models)',
  kind: 'local',
  needsKey: false,
  defaultBaseUrl: 'http://localhost:11434',
  defaultModel: 'llama3.1',
  fallbackModels: ['llama3.1', 'qwen2.5', 'gemma3', 'mistral'],
  docs: 'https://ollama.com/download',

  base(p) { return (p.baseUrl || this.defaultBaseUrl).replace(/\/$/, ''); },

  async listModels(p) {
    const res = await fetch(`${this.base(p)}/api/tags`);
    if (!res.ok) throw await httpError(res, 'Ollama');
    const j = await res.json();
    return (j.models || []).map((m) => m.name);
  },

  async *stream(p, { model, system, messages, temperature, maxTokens, signal }) {
    const body = {
      model,
      stream: true,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      options: {},
    };
    if (temperature != null) body.options.temperature = temperature;
    if (maxTokens) body.options.num_predict = maxTokens;
    if (p.extra?.numCtx) body.options.num_ctx = Number(p.extra.numCtx);
    const res = await fetch(`${this.base(p)}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal,
    });
    if (!res.ok) throw await httpError(res, 'Ollama');
    for await (const j of ndjson(res)) {
      if (j.error) throw new Error(`Ollama: ${j.error}`);
      if (j.message?.content) yield { type: 'text', text: j.message.content };
      if (j.done) yield { type: 'usage', input: j.prompt_eval_count || 0, output: j.eval_count || 0 };
    }
  },
};
