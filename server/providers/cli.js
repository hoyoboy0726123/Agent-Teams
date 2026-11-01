// Subscription-backed providers: drive the official CLIs that the user has already
// logged into with their Claude (Pro/Max) or ChatGPT (Plus/Pro) subscription.
// No API key is needed — auth stays inside the vendor's own CLI.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Spawn a process, write `input` to stdin, yield stdout line-by-line.
async function* runLines(bin, args, { input, env, signal, timeoutMs = 10 * 60_000, cwd }) {
  const child = spawn(bin, args, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  let spawnError = null;
  child.on('error', (e) => { spawnError = e; });
  child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
  const kill = () => child.kill('SIGTERM');
  signal?.addEventListener('abort', kill, { once: true });
  const timer = setTimeout(kill, timeoutMs);
  const exited = new Promise((r) => child.on('close', (code) => r(code)));
  try {
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    let buf = '';
    for await (const chunk of child.stdout) {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) yield line;
      }
    }
    if (buf.trim()) yield buf.trim();
    const code = await exited;
    if (spawnError) throw new Error(spawnError.code === 'ENOENT' ? `"${bin}" not found. Install it and log in first.` : spawnError.message);
    if (code !== 0 && !signal?.aborted) throw new Error(`${bin} exited with code ${code}: ${stderr.trim().slice(-600)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', kill);
    if (child.exitCode == null) child.kill('SIGTERM');
  }
}

async function version(bin) {
  let out = '';
  for await (const line of runLines(bin, ['--version'], { input: '', env: process.env, timeoutMs: 20_000 })) out += line;
  return out;
}

// Flatten a chat into one prompt for CLIs that take a single message.
export function transcript(messages) {
  if (messages.length === 1) return messages[0].content;
  return messages.map((m) => (m.role === 'assistant' ? `[You previously replied]\n${m.content}` : m.content)).join('\n\n');
}

export const claudeCode = {
  type: 'claude-code',
  label: 'Claude subscription (Claude Code CLI)',
  kind: 'subscription',
  needsKey: false,
  defaultModel: 'sonnet',
  fallbackModels: ['opus', 'sonnet', 'haiku', 'claude-opus-5', 'claude-sonnet-5', 'claude-fable-5-1'],
  docs: 'https://docs.claude.com/en/docs/claude-code/setup',
  hint: 'Install Claude Code, then run `claude` once and log in with your Claude Pro/Max account.',

  bin(p) { return p.extra?.bin || 'claude'; },
  async listModels(p) { await version(this.bin(p)); return this.fallbackModels; },
  async test(p) { return version(this.bin(p)); },

  async *stream(p, { model, system, messages, signal, nativeSearch }) {
    const env = { ...process.env };
    // Force subscription auth even if an API key happens to be in the environment.
    if (p.extra?.forceSubscription !== false) delete env.ANTHROPIC_API_KEY;
    const cwd = mkdtempSync(join(tmpdir(), 'agent-teams-claude-'));
    // Built-in tools stay off (no shell, no file access). With nativeSearch, only Claude's own
    // WebSearch / WebFetch are enabled and pre-approved; everything else is still refused.
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--no-session-persistence',
      ...(nativeSearch ? ['--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch', '--permission-mode', 'dontAsk'] : ['--tools', ''])];
    if (model) args.push('--model', model);
    if (system) args.push('--system-prompt', system);
    let sawDelta = false;
    let assistantText = '';
    try {
      for await (const line of runLines(this.bin(p), args, { input: transcript(messages), env, signal, cwd })) {
        let j;
        try { j = JSON.parse(line); } catch { continue; }
        if (j.type === 'stream_event' && j.event?.type === 'content_block_delta' && j.event.delta?.type === 'text_delta') {
          sawDelta = true;
          yield { type: 'text', text: j.event.delta.text };
        } else if (j.type === 'assistant') {
          for (const c of j.message?.content || []) {
            if (c.type === 'text' && !sawDelta) assistantText += c.text;
            if (c.type === 'tool_use') yield { type: 'tool', id: c.id, name: c.name, args: c.input };
          }
        } else if (j.type === 'user') {
          for (const c of j.message?.content || []) {
            if (c.type !== 'tool_result') continue;
            const text = Array.isArray(c.content) ? c.content.map((x) => x.text || '').join(' ') : String(c.content || '');
            yield { type: 'tool_result', id: c.tool_use_id, ok: !c.is_error, summary: text.replace(/\s+/g, ' ').slice(0, 160) };
            if (sawDelta) yield { type: 'text', text: '\n\n' };
          }
        } else if (j.type === 'result') {
          if (j.is_error) throw new Error(`Claude Code: ${j.result || j.subtype}`);
          if (!sawDelta) yield { type: 'text', text: assistantText || j.result || '' };
          yield { type: 'usage', input: j.usage?.input_tokens || 0, output: j.usage?.output_tokens || 0 };
        }
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  },
};

export const codex = {
  type: 'codex',
  label: 'ChatGPT subscription (OpenAI Codex CLI)',
  kind: 'subscription',
  needsKey: false,
  defaultModel: '',
  fallbackModels: ['gpt-5-codex', 'gpt-5', 'o4-mini'],
  docs: 'https://github.com/openai/codex',
  hint: 'Install with `npm i -g @openai/codex`, then run `codex login` with your ChatGPT Plus/Pro account.',

  bin(p) { return p.extra?.bin || 'codex'; },
  async listModels(p) { await version(this.bin(p)); return this.fallbackModels; },
  async test(p) { return version(this.bin(p)); },

  async *stream(p, { model, system, messages, signal, nativeSearch }) {
    const cwd = mkdtempSync(join(tmpdir(), 'agent-teams-codex-'));
    const lastFile = join(cwd, 'last.txt');
    const args = ['exec', '--json', '--skip-git-repo-check', '-s', 'read-only', '--output-last-message', lastFile];
    if (model) args.push('-m', model);
    if (nativeSearch) args.push('-c', 'tools.web_search=true');
    args.push('-');
    const prompt = (system ? `<instructions>\n${system}\n</instructions>\n\n` : '') + transcript(messages);
    let streamed = '';
    let usage = null;
    try {
      for await (const line of runLines(this.bin(p), args, { input: prompt, env: process.env, signal, cwd })) {
        let j;
        try { j = JSON.parse(line); } catch { continue; }
        // New event format (item.*) and legacy format (msg.*) are both handled.
        const msg = j.msg || {};
        if (msg.type === 'agent_message_delta' && msg.delta) { streamed += msg.delta; yield { type: 'text', text: msg.delta }; }
        else if (j.type === 'item.completed' && j.item?.type === 'agent_message' && j.item.text && !streamed) {
          streamed += j.item.text; yield { type: 'text', text: j.item.text };
        } else if (msg.type === 'agent_message' && msg.message && !streamed) {
          streamed += msg.message; yield { type: 'text', text: msg.message };
        } else if (j.type === 'turn.completed' && j.usage) usage = j.usage;
        else if (msg.type === 'token_count' && msg.info?.total_token_usage) usage = msg.info.total_token_usage;
        else if (j.type === 'error' || msg.type === 'error') throw new Error(`Codex: ${j.message || msg.message}`);
      }
      if (!streamed) {
        try { const last = readFileSync(lastFile, 'utf8'); if (last) yield { type: 'text', text: last }; } catch {}
      }
      if (usage) yield { type: 'usage', input: usage.input_tokens || 0, output: usage.output_tokens || 0 };
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  },
};

export const geminiCli = {
  type: 'gemini-cli',
  label: 'Google account (Gemini CLI)',
  kind: 'subscription',
  needsKey: false,
  defaultModel: '',
  fallbackModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  docs: 'https://github.com/google-gemini/gemini-cli',
  hint: 'Install with `npm i -g @google/gemini-cli`, then run `gemini` once and sign in with Google.',

  bin(p) { return p.extra?.bin || 'gemini'; },
  async listModels(p) { await version(this.bin(p)); return this.fallbackModels; },
  async test(p) { return version(this.bin(p)); },

  async *stream(p, { model, system, messages, signal }) {
    const cwd = mkdtempSync(join(tmpdir(), 'agent-teams-gemini-'));
    const args = ['-p', ''];
    if (model) args.push('-m', model);
    const prompt = (system ? `<instructions>\n${system}\n</instructions>\n\n` : '') + transcript(messages);
    try {
      for await (const line of runLines(this.bin(p), args, { input: prompt, env: process.env, signal, cwd })) {
        yield { type: 'text', text: line + '\n' };
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  },
};
