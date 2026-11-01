// Anthropic Claude via the official SDK (API key billing).
import Anthropic from '@anthropic-ai/sdk';

// Models where sampling params were removed and adaptive thinking is the default.
const NO_SAMPLING = /claude-(opus-4-[78]|opus-5|sonnet-5|fable|mythos)/;
// Models that support the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_OK = /claude-(opus-5|fable-5)/;

export const anthropic = {
  type: 'anthropic',
  label: 'Anthropic (Claude API)',
  kind: 'api',
  needsKey: true,
  defaultBaseUrl: 'https://api.anthropic.com',
  defaultModel: 'claude-opus-5',
  fallbackModels: ['claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-haiku-4-5'],
  docs: 'https://console.anthropic.com/settings/keys',

  client(p) {
    return new Anthropic({ apiKey: p.apiKey, baseURL: p.baseUrl || undefined });
  },

  async listModels(p) {
    const out = [];
    for await (const m of this.client(p).models.list()) out.push(m.id);
    return out;
  },

  async *stream(p, { model, system, messages, temperature, maxTokens, signal }) {
    const client = this.client(p);
    const params = {
      model,
      max_tokens: maxTokens || 64000,
      system: system || undefined,
      messages: normalizeTurns(messages),
    };
    if (temperature != null && !NO_SAMPLING.test(model)) params.temperature = temperature;
    const useFallback = p.extra?.refusalFallback !== false && FALLBACK_OK.test(model);
    const stream = useFallback
      ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
      : client.messages.stream(params, { signal });

    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') yield { type: 'text', text: ev.delta.text };
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') yield { type: 'text', text: '\n\n_(The model declined this request.)_' };
    yield { type: 'usage', input: final.usage?.input_tokens || 0, output: final.usage?.output_tokens || 0 };
  },
};

// Claude requires the first turn to be `user`; merge any leading assistant turns into context.
export function normalizeTurns(messages) {
  const out = [];
  for (const m of messages) {
    if (!out.length && m.role !== 'user') {
      out.push({ role: 'user', content: `(Earlier in the conversation)\n${m.content}` });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  if (!out.length || out[out.length - 1].role !== 'user') out.push({ role: 'user', content: '(continue)' });
  return out;
}
