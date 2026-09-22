// Agent runtime: builds each agent's context (persona + team roster + shared memory +
// channel summary + recent conversation), streams the reply into the channel, runs the
// tool loop and applies directives (artifacts, memories).
import { config } from '../config.js';
import { getSetting, audit } from '../db.js';
import { emit } from '../bus.js';
import { streamChat } from '../providers/index.js';
import { getChannel, members, listMessages, createMessage, updateMessage, deleteMessage, getMessage } from '../channels.js';
import { listAgents, getAgent } from './store.js';
import { listUsers } from '../users.js';
import { recall, visibleScopes, addMemory } from '../memory/store.js';
import { listArtifacts, upsertArtifact } from '../artifacts/store.js';
import { extractBlocks, displayText, runTool, TOOL_DOCS } from './tools.js';

const MAX_TOOL_ROUNDS = 5;
const PASS = /^\s*\[?\s*pass\s*\]?\s*\.?\s*$/i;
const running = new Map(); // messageId → AbortController

export function stopMessage(messageId) {
  const c = running.get(messageId);
  if (c) { c.abort(); return true; }
  return false;
}
export const isRunning = (messageId) => running.has(messageId);

function authorName(m, cache) {
  if (m.authorType === 'agent') {
    const a = cache.agents.get(m.authorId);
    return a ? `${a.name} (@${a.handle})` : 'Agent';
  }
  if (m.authorType === 'user') {
    const u = cache.users.get(m.authorId);
    return u ? `${u.displayName} (@${u.username})` : 'User';
  }
  return 'System';
}

// Strip machine placeholders before feeding history back to a model.
const historyText = (m) => m.content.replace(/\[\[artifact:([^\]]+)\]\]/g, (_, id) => {
  const a = m.meta?.artifacts?.find((x) => x.id === id);
  return a ? `(published artifact "${a.title}" — ${a.type})` : '(artifact)';
}).replace(/\[\[[^\]]+\]\]/g, '');

export function buildContext({ agent, channel, userId, extraInstruction }) {
  const cache = {
    agents: new Map(listAgents({ includeArchived: true }).map((a) => [a.id, a])),
    users: new Map(listUsers().map((u) => [u.id, u])),
  };
  const mem = members(channel.id);
  const teammates = mem.agents.filter((id) => id !== agent.id).map((id) => cache.agents.get(id)).filter((a) => a && !a.archived);
  const humans = mem.users.map((id) => cache.users.get(id)).filter(Boolean);
  const history = listMessages(channel.id, { limit: config.contextMessages }).filter((m) => m.status !== 'streaming' && m.content.trim());
  const lastHuman = [...history].reverse().find((m) => m.authorType === 'user');
  const query = history.slice(-4).map((m) => m.content).join('\n');

  const scopes = visibleScopes({ channelId: channel.id, agentId: agent.memoryEnabled ? agent.id : null, userId });
  const memories = channel.memoryEnabled ? recall({ scopes, query, limit: 14 }) : [];
  const artifacts = listArtifacts({ channelIds: [channel.id] }).slice(0, 15);
  const tools = agent.tools || [];
  const workspace = getSetting('workspaceName', 'Agent Teams');

  const sys = [];
  sys.push(`You are "${agent.name}" (@${agent.handle}), an AI teammate working alongside humans and other AI agents in the "${workspace}" workspace.`);
  if (agent.description) sys.push(`Your role: ${agent.description}`);
  if (agent.systemPrompt) sys.push(agent.systemPrompt);

  sys.push(`## Where you are
Channel: #${channel.name}${channel.topic ? ` — ${channel.topic}` : ''}${channel.kind === 'dm' ? ' (private direct conversation)' : ''}
Humans here: ${humans.map((u) => `${u.displayName} (@${u.username})`).join(', ') || 'none'}
AI teammates here: ${teammates.length ? '' : 'none'}
${teammates.map((a) => `- @${a.handle} — ${a.name}: ${a.description || 'general assistant'}`).join('\n')}`);

  if (teammates.length && tools.includes('handoff')) {
    sys.push(`## Collaboration
To delegate, @mention a teammate with a specific, self-contained request (e.g. "@researcher please find 3 recent sources on X"). They will reply right after you. Only mention a teammate when you really need them; never mention yourself; don't mention someone just to thank them.`);
  }

  if (channel.summary) sys.push(`## Earlier in this channel (summary)\n${channel.summary}`);

  if (memories.length) {
    sys.push(`## Team memory (persistent context shared with you)\n${memories.map((m) => `- [${m.scope}] ${m.content}`).join('\n')}`);
  }

  if (artifacts.length) {
    sys.push(`## Artifacts in this channel\n${artifacts.map((a) => `- "${a.title}" (${a.type}, v${a.version})`).join('\n')}`);
  }

  const proto = [];
  if (tools.includes('artifacts')) {
    proto.push(`- Publish a deliverable (document, report, deck, dashboard, website) as an artifact instead of pasting it into chat:
\`\`\`artifact type="document|research|slides|dashboard|website" title="Short title"
...full content...
\`\`\`
Reusing an existing title creates a new version of that artifact. Keep your chat message around the block short.`);
  }
  if (tools.includes('remember')) {
    proto.push(`- Save durable facts, decisions or preferences worth knowing in future conversations (one per line; scope is "channel" by default, "workspace" for org-wide facts, "agent" for your private notes):
\`\`\`remember scope="channel"
The launch date is 2026-11-03 (decided by Alice)
\`\`\`
Only remember things that will still matter later. Never store secrets or passwords.`);
  }
  const callable = Object.entries(TOOL_DOCS).filter(([k]) => tools.includes(k));
  if (callable.length) {
    proto.push(`- Call a tool by replying with ONLY a tool block, then wait for the result:
\`\`\`tool
{"name": "...", "args": {...}}
\`\`\`
Available tools:
${callable.map(([, d]) => `  • ${d}`).join('\n')}`);
  }
  if (proto.length) sys.push(`## Actions you can take\n${proto.join('\n')}`);

  sys.push(`## Style
- Reply in the language of the most recent human message${lastHuman ? '' : ' (default: the language the channel uses)'}.
- This is a team chat: be concise, lead with the answer, use markdown when it helps.
- You are not the only agent: stay in your lane, build on teammates' messages instead of repeating them.
- If you were only mentioned in passing and there is nothing useful for you to add, reply with exactly [pass] and nothing else.
- Today is ${new Date().toISOString().slice(0, 10)}.`);
  if (extraInstruction) sys.push(`## Current task\n${extraInstruction}`);

  // Conversation → alternating turns. Own messages are `assistant`, everyone else is `user`.
  const turns = [];
  for (const m of history) {
    const own = m.authorType === 'agent' && m.authorId === agent.id;
    const text = own ? historyText(m) : `[${authorName(m, cache)}]: ${historyText(m)}`;
    const role = own ? 'assistant' : 'user';
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n\n${text}`;
    else turns.push({ role, content: text });
  }
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    turns.push({ role: 'user', content: extraInstruction ? `[System]: ${extraInstruction}` : '[System]: Continue with your part of the task.' });
  }
  if (turns[0].role === 'assistant') {
    const first = turns.shift();
    if (turns[0]) turns[0].content = `[Your earlier message]: ${first.content}\n\n${turns[0].content}`;
  }

  return { system: sys.join('\n\n'), messages: turns, scopes, tools };
}

// Run one agent turn in a channel. Returns the finished message.
export async function runAgent({ agentId, channelId, userId = null, parentId = null, extraInstruction = null, depth = 0, workflowRunId = null }) {
  const agent = getAgent(agentId);
  const channel = getChannel(channelId);
  if (!agent || !channel) throw new Error('Agent or channel not found');

  const msg = createMessage({ channelId, authorType: 'agent', authorId: agent.id, content: '', parentId, status: 'streaming', meta: { depth, workflowRunId, model: agent.model } });
  const ctl = new AbortController();
  running.set(msg.id, ctl);
  emit('typing', { channelId, agentId: agent.id, on: true });

  const ctx = buildContext({ agent, channel, userId, extraInstruction });
  const meta = { tools: [], artifacts: [], memories: [] };
  const savedArtifacts = {};
  let full = '';      // everything the agent wrote across tool rounds (display source)
  let lastEmit = 0;
  const push = (force = false) => {
    const t = Date.now();
    if (!force && t - lastEmit < 60) return;
    lastEmit = t;
    emit('message.delta', { channelId, messageId: msg.id, content: displayText(full, { artifacts: savedArtifacts }) });
  };

  try {
    const convo = [...ctx.messages];
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      let chunk = '';
      for await (const ev of streamChat(agent.providerId, {
        model: agent.model, system: ctx.system, messages: convo, temperature: agent.temperature ?? undefined, signal: ctl.signal,
      }, { agentId: agent.id })) {
        if (ev.type !== 'text') continue;
        chunk += ev.text;
        full += ev.text;
        push();
        // Stop streaming as soon as a complete tool call has been written.
        if (/```tool[^\n]*\n[\s\S]*?\n?```/.test(chunk)) break;
      }
      await applyDirectives(chunk, { agent, channel, msg, meta, savedArtifacts, userId });
      const calls = extractBlocks(chunk).filter((b) => b.kind === 'tool');
      if (!calls.length || round === MAX_TOOL_ROUNDS) break;

      const results = [];
      for (const b of calls) {
        let call;
        try { call = JSON.parse(b.body); } catch { results.push('Tool error: tool block must contain valid JSON {"name": ..., "args": {...}}'); continue; }
        const trace = { name: call.name, args: call.args, ok: true };
        try {
          const out = await runTool(call, { tools: ctx.tools, scopes: ctx.scopes, channelId, signal: ctl.signal });
          results.push(`Result of ${call.name}:\n${out}`);
          trace.summary = out.slice(0, 160);
        } catch (e) {
          trace.ok = false;
          trace.summary = e.message;
          results.push(`Tool ${call.name} failed: ${e.message}`);
        }
        meta.tools.push(trace);
        audit('agent', agent.id, 'tool.call', call.name, { channelId, ok: trace.ok, args: call.args });
      }
      updateMessage(msg.id, { meta });
      convo.push({ role: 'assistant', content: chunk });
      convo.push({ role: 'user', content: `[Tool results]\n${results.join('\n\n')}\n\nContinue your reply to the team using these results. Do not repeat what you already wrote.` });
      full += '\n\n';
    }
    const content = displayText(full, { artifacts: savedArtifacts }) || '_(no reply)_';
    // Agents that have nothing to add stay silent instead of cluttering the channel.
    if (PASS.test(content) && !meta.artifacts.length && !meta.memories.length) {
      deleteMessage(msg.id);
      return { ...msg, content, status: 'passed', meta };
    }
    return updateMessage(msg.id, { content, status: 'done', meta });
  } catch (e) {
    const aborted = ctl.signal.aborted;
    const content = displayText(full, { artifacts: savedArtifacts });
    return updateMessage(msg.id, {
      content: aborted ? `${content}\n\n_(stopped)_`.trim() : content,
      status: aborted ? 'done' : 'error',
      meta: { ...meta, error: aborted ? undefined : e.message },
    });
  } finally {
    running.delete(msg.id);
    emit('typing', { channelId, agentId: agent.id, on: false });
  }
}

async function applyDirectives(text, { agent, channel, msg, meta, savedArtifacts, userId }) {
  for (const b of extractBlocks(text)) {
    if (b.kind === 'artifact' && agent.tools.includes('artifacts')) {
      const title = (b.attrs.title || 'Untitled').trim();
      const art = upsertArtifact({ channelId: channel.id, type: b.attrs.type || 'document', title, content: b.body, byType: 'agent', byId: agent.id });
      savedArtifacts[title] = art.id;
      meta.artifacts.push({ id: art.id, title: art.title, type: art.type, version: art.version });
    } else if (b.kind === 'remember' && agent.tools.includes('remember') && channel.memoryEnabled) {
      const scope = ['channel', 'workspace', 'agent'].includes(b.attrs.scope) ? b.attrs.scope : 'channel';
      const scopeId = scope === 'channel' ? channel.id : scope === 'agent' ? agent.id : null;
      for (const line of b.body.split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).slice(0, 10)) {
        const m = addMemory({ scope, scopeId, content: line, sourceMessageId: msg.id, byType: 'agent', byId: agent.id });
        if (m) meta.memories.push({ id: m.id, content: m.content, scope });
      }
      emit('memory.updated', { channelId: channel.id });
    }
  }
  if (meta.artifacts.length || meta.memories.length) updateMessage(msg.id, { meta });
}

export { getMessage };
