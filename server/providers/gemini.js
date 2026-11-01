// Google Gemini (Generative Language API, streaming).
import { sse, httpError } from './sse.js';

export const gemini = {
  type: 'gemini',
  label: 'Google Gemini',
  kind: 'api',
  needsKey: true,
  defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  defaultModel: 'gemini-2.5-pro',
  fallbackModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  docs: 'https://aistudio.google.com/apikey',

  base(p) { return (p.baseUrl || this.defaultBaseUrl).replace(/\/$/, ''); },

  async listModels(p) {
    const res = await fetch(`${this.base(p)}/models?pageSize=200`, { headers: { 'x-goog-api-key': p.apiKey } });
    if (!res.ok) throw await httpError(res, 'Gemini');
    const j = await res.json();
    return (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''));
  },

  async *stream(p, { model, system, messages, temperature, maxTokens, signal }) {
    const body = {
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: {},
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (temperature != null) body.generationConfig.temperature = temperature;
    if (maxTokens) body.generationConfig.maxOutputTokens = maxTokens;
    const res = await fetch(`${this.base(p)}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': p.apiKey },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw await httpError(res, 'Gemini');
    let usage;
    for await (const { data } of sse(res)) {
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      for (const part of j.candidates?.[0]?.content?.parts || []) if (part.text && !part.thought) yield { type: 'text', text: part.text };
      if (j.usageMetadata) usage = j.usageMetadata;
    }
    if (usage) yield { type: 'usage', input: usage.promptTokenCount || 0, output: usage.candidatesTokenCount || 0 };
  },
};
