// OpenAI Chat Completions and every OpenAI-compatible endpoint
// (OpenRouter, DeepSeek, Groq, Mistral, xAI, Together, Qwen, Moonshot, LM Studio, vLLM...).
import { sse, httpError } from './sse.js';

function makeCompatible({ type, label, baseUrl, needsKey = true, defaultModel, fallbackModels = [], docs, headers = {} }) {
  return {
    type, label, kind: needsKey ? 'api' : 'local', needsKey, defaultBaseUrl: baseUrl, defaultModel, fallbackModels, docs,

    headers(p) {
      const h = { 'content-type': 'application/json', ...headers };
      if (p.apiKey) h.authorization = `Bearer ${p.apiKey}`;
      return h;
    },

    async listModels(p) {
      const res = await fetch(`${(p.baseUrl || baseUrl).replace(/\/$/, '')}/models`, { headers: this.headers(p) });
      if (!res.ok) throw await httpError(res, label);
      const j = await res.json();
      return (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean).sort();
    },

    async *stream(p, { model, system, messages, temperature, maxTokens, signal }) {
      const body = {
        model,
        stream: true,
        stream_options: { include_usage: true },
        messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      };
      if (temperature != null) body.temperature = temperature;
      if (maxTokens) body.max_completion_tokens = maxTokens;
      const res = await fetch(`${(p.baseUrl || baseUrl).replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', headers: this.headers(p), body: JSON.stringify(body), signal,
      });
      if (!res.ok) throw await httpError(res, label);
      let usage = null;
      for await (const { data } of sse(res)) {
        if (data === '[DONE]') break;
        let j;
        try { j = JSON.parse(data); } catch { continue; }
        if (j.error) throw new Error(`${label}: ${j.error.message || JSON.stringify(j.error)}`);
        const delta = j.choices?.[0]?.delta;
        if (delta?.content) yield { type: 'text', text: delta.content };
        if (j.usage) usage = j.usage;
      }
      if (usage) yield { type: 'usage', input: usage.prompt_tokens || 0, output: usage.completion_tokens || 0 };
    },
  };
}

export const openaiFamily = [
  makeCompatible({ type: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-5', fallbackModels: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'], docs: 'https://platform.openai.com/api-keys' }),
  makeCompatible({ type: 'openrouter', label: 'OpenRouter (300+ models)', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'anthropic/claude-sonnet-5', docs: 'https://openrouter.ai/keys', headers: { 'x-title': 'Agent Teams' } }),
  makeCompatible({ type: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', fallbackModels: ['deepseek-chat', 'deepseek-reasoner'], docs: 'https://platform.deepseek.com/api_keys' }),
  makeCompatible({ type: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', docs: 'https://console.groq.com/keys' }),
  makeCompatible({ type: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-large-latest', docs: 'https://console.mistral.ai/api-keys' }),
  makeCompatible({ type: 'xai', label: 'xAI Grok', baseUrl: 'https://api.x.ai/v1', defaultModel: 'grok-4', docs: 'https://console.x.ai' }),
  makeCompatible({ type: 'together', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', docs: 'https://api.together.ai/settings/api-keys' }),
  makeCompatible({ type: 'qwen', label: 'Qwen (DashScope)', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-max', docs: 'https://dashscope.console.aliyun.com/apiKey' }),
  makeCompatible({ type: 'moonshot', label: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.ai/v1', defaultModel: 'kimi-k2-0905-preview', docs: 'https://platform.moonshot.ai/console/api-keys' }),
  makeCompatible({ type: 'lmstudio', label: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', needsKey: false, defaultModel: '' }),
  makeCompatible({ type: 'openai-compatible', label: 'Custom OpenAI-compatible (vLLM, LiteLLM, ...)', baseUrl: 'http://localhost:8000/v1', needsKey: false, defaultModel: '' }),
];
