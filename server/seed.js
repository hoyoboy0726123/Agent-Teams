// First-run setup: auto-detect available model backends and create a ready-to-use team.
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { listProviders, createProvider } from './providers/index.js';
import { createAgent, TEMPLATES } from './agents/store.js';
import { createChannel, createMessage } from './channels.js';

export function onPath(bin) {
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    for (const ext of process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']) {
      try { accessSync(join(dir, bin + ext), constants.X_OK); return true; } catch {}
    }
  }
  return false;
}

async function ollamaUp() {
  try { const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(800) }); return r.ok; } catch { return false; }
}

const ENV_KEYS = [
  ['anthropic', 'ANTHROPIC_API_KEY'], ['openai', 'OPENAI_API_KEY'], ['gemini', 'GEMINI_API_KEY'], ['gemini', 'GOOGLE_API_KEY'],
  ['openrouter', 'OPENROUTER_API_KEY'], ['deepseek', 'DEEPSEEK_API_KEY'], ['groq', 'GROQ_API_KEY'], ['mistral', 'MISTRAL_API_KEY'], ['xai', 'XAI_API_KEY'],
];

// Detect what can be used right now. Returns created providers, best first.
export async function detectProviders() {
  const have = new Set(listProviders().map((p) => p.type));
  const made = [];
  const add = (type, extra = {}) => { if (have.has(type)) return; have.add(type); made.push(createProvider({ type, ...extra })); };
  if (process.env.AGENT_TEAMS_NO_DETECT === '1') { add('demo'); return made; }
  if (onPath('claude')) add('claude-code');
  for (const [type, env] of ENV_KEYS) if (process.env[env]) add(type, { apiKey: process.env[env] });
  if (onPath('codex')) add('codex');
  if (onPath('gemini')) add('gemini-cli');
  if (await ollamaUp()) add('ollama');
  add('demo');
  return made;
}

const PRIORITY = ['claude-code', 'anthropic', 'codex', 'openai', 'openrouter', 'gemini', 'gemini-cli', 'deepseek', 'mistral', 'xai', 'groq', 'ollama', 'demo'];

export async function seedWorkspace(owner) {
  await detectProviders();
  const providers = listProviders();
  const best = PRIORITY.map((t) => providers.find((p) => p.type === t)).find(Boolean);
  const team = TEMPLATES.filter((t) => ['lead', 'researcher', 'writer', 'designer', 'analyst', 'critic'].includes(t.key))
    .map((t) => createAgent({ ...t, providerId: best?.id }, owner));
  const general = createChannel({ name: 'general', topic: 'Team-wide chat with your AI teammates', mode: 'auto', agentIds: team.map((a) => a.id) }, owner);
  createChannel({ name: 'research-lab', topic: 'Deep dives. Mention @researcher, @critic and @writer.', mode: 'mention', agentIds: team.filter((a) => ['researcher', 'critic', 'writer'].includes(a.handle)).map((a) => a.id) }, owner);
  createMessage({
    channelId: general.id, authorType: 'system',
    content: `👋 Welcome! Your AI team is ready — model backend: **${best?.label || best?.name || 'none'}**.

Try:
- \`@lead 幫我規劃一個新產品發表會\` — the lead delegates to teammates and synthesises
- \`@designer make a 5-slide deck about our Q3 goals\`
- \`@analyst build a KPI dashboard: MAU 12k (+8%), churn 3.1%, NPS 46\`
- \`@all what should we watch out for?\`

Connect Claude / ChatGPT subscriptions, API keys or local Ollama models in **Settings → Providers**.`,
  });
  return { general, team, provider: best };
}
