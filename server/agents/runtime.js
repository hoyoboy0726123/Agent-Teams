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
import { extractBlocks, displayText, runTool, TOOL_DOCS, parseAttrs } from './tools.js';
import { toolsForAgent, describeTool, needsApproval, callTool } from '../mcp/index.js';
import { requestApproval } from '../approvals.js';
import { createTask } from '../tasks.js';
import { fileContext } from '../files.js';
import { generateVideo, videoGenConfig } from '../media/videogen.js';
import { saveMedia } from '../media/store.js';

const GENERATE_VIDEO_DOC = '{"name":"generate_video","args":{"prompt":"one shot: subject, action, setting, camera, lighting, style","seconds":8,"aspect":"16:9|9:16"}} — generate a short AI video clip (a human approves each call; it costs money). Returns a /media/… URL to use in a video artifact "clip" scene. Use sparingly.';

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
export const VIDEO_SCHEMA = `{"title","format":"16:9|9:16|1:1","theme":{"bg":"#hex","fg":"#hex","accent":"#hex","font":"sans|serif|rounded"},"scenes":[{"layout":"title|bullets|stat|quote|image|chart|split|clip|end","title","subtitle","kicker","icon":"one emoji","items":["≤5 short lines"],"value":"94%","label","caption","text","author","image":"https URL","chart":{"type":"bar|line|pie","labels":[],"series":[{"name","data":[]}]},"clip":"/media/… URL from generate_video","narration":"what the voice says (1–2 sentences)","duration":seconds (optional),"animation":"rise|zoom|slide|fade"}]}. 5–10 scenes, one idea per scene, on-screen text much shorter than the narration, strong hook first, call to action last.`;

const historyText = (m) => fileContext(m) + m.content.replace(/\[\[artifact:([^\]]+)\]\]/g, (_, id) => {
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
    proto.push(`- Publish a deliverable (document, report, deck, dashboard, website, video) as an artifact instead of pasting it into chat:
\`\`\`artifact type="document|research|slides|dashboard|website|video" title="Short title"
...full content...
\`\`\`
Reusing an existing title creates a new version of that artifact. Keep your chat message around the block short.
A "video" artifact is a JSON storyboard the app animates and exports to MP4 with voice-over: ${VIDEO_SCHEMA}`);
  }
  if (tools.includes('remember')) {
    proto.push(`- Save durable facts, decisions or preferences worth knowing in future conversations (one per line; scope is "channel" by default, "workspace" for org-wide facts, "agent" for your private notes):
\`\`\`remember scope="channel"
The launch date is 2026-11-03 (decided by Alice)
\`\`\`
Only remember things that will still matter later. Never store secrets or passwords.`);
  }
  if (tools.includes('tasks')) {
    proto.push(`- Create trackable tasks only when a human asks for a plan / breakdown, or when a concrete follow-up must be tracked beyond this conversation (not for review notes or things you do right now). At most 8 per reply, each with a short title (under 60 characters) on the first line and details below. One block per task; assignee is an @handle of a teammate or human, due is optional (YYYY-MM-DD):
\`\`\`task assignee="@writer" due="2026-10-01"
Draft the launch blog post
Optional details on the next lines
\`\`\``);
  }
  proto.push(`- Optionally end with up to 3 short follow-up suggestions the human might click next (same language as the conversation):
\`\`\`suggest
Turn this into a one-page PDF summary
Compare with last quarter
\`\`\``);
  const callable = Object.entries(TOOL_DOCS).filter(([k]) => tools.includes(k));
  if (tools.includes('artifacts') && videoGenConfig()?.providerId) callable.push(['generate_video', GENERATE_VIDEO_DOC]);
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
  const started = Date.now();
  const meta = { tools: [], artifacts: [], memories: [], tasks: [], suggestions: [], approvals: [], startedAt: started };
  const savedArtifacts = {};
  let full = '';      // everything the agent wrote across tool rounds (display source)
  let lastEmit = 0;
  let lastDraft = 0;
  const push = (force = false) => {
    const t = Date.now();
    if (!force && t - lastEmit < 60) return;
    lastEmit = t;
    emit('message.delta', { channelId, messageId: msg.id, content: displayText(full, { artifacts: savedArtifacts }) });
    // Live preview: stream the artifact being written so the UI can render it as it grows.
    if (t - lastDraft > 450) {
      const open = /```artifact([^\n]*)\n([\s\S]*)$/.exec(full);
      if (open && !/\n```\s*$/.test(open[2])) {
        lastDraft = t;
        const a = parseAttrs(open[1]);
        emit('artifact.draft', { channelId, messageId: msg.id, title: a.title || 'Untitled', type: a.type || 'document', content: open[2] });
      }
    }
  };

  // External tools from MCP servers this agent may use.
  let mcpTools = [];
  if (agent.mcpServers?.length) {
    mcpTools = await toolsForAgent(agent);
    if (mcpTools.length) {
      ctx.system += `\n\n## Connected tools (MCP)
Call these exactly like other tools, using the full dotted name, e.g. {"name": "${mcpTools[0].fq}", "args": {...}}. Actions with side effects may wait for a human to approve them.
${mcpTools.slice(0, 60).map((t) => `  • ${describeTool(t)}`).join('\n')}`;
    }
  }

  try {
    const convo = [...ctx.messages];
    const failures = new Map(); // tool name → consecutive failures
    let unanswered = false;     // loop ended while the agent still wanted tools
    const stream = async () => {
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
      return chunk;
    };
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const chunk = await stream();
      await applyDirectives(chunk, { agent, channel, msg, meta, savedArtifacts, userId });
      const calls = extractBlocks(chunk).filter((b) => b.kind === 'tool');
      if (!calls.length) break;
      if (round === MAX_TOOL_ROUNDS) { unanswered = true; convo.push({ role: 'assistant', content: chunk }); break; }

      const results = [];
      for (const b of calls) {
        let call;
        try { call = JSON.parse(b.body); } catch { results.push('Tool error: tool block must contain valid JSON {"name": ..., "args": {...}}'); continue; }
        const trace = { name: call.name, args: call.args, ok: true };
        try {
          const mcp = mcpTools.find((t) => t.fq === call.name && t.tool);
          let out;
          if (mcp) {
            if (needsApproval(mcp.server, mcp.tool)) {
              trace.approval = 'pending';
              updateMessage(msg.id, { meta });
              const status = await requestApproval({
                channelId, messageId: msg.id, agentId: agent.id, tool: call.name, args: call.args, signal: ctl.signal,
                onCreate: (a) => { meta.approvals.push({ id: a.id, tool: a.tool, args: a.args, status: 'pending' }); updateMessage(msg.id, { meta }); },
              });
              const entry = meta.approvals[meta.approvals.length - 1];
              entry.status = status;
              trace.approval = status;
              updateMessage(msg.id, { meta });
              if (status !== 'approved') throw new Error(`A human ${status === 'expired' ? 'did not respond to' : 'declined'} this action. Do not retry it; tell the team what you would have done.`);
            }
            out = await callTool(mcp.server.id, mcp.tool.name, call.args, { signal: ctl.signal });
          } else if (call.name === 'generate_video' && agent.tools.includes('artifacts') && videoGenConfig()?.providerId) {
            // Paid and slow: always ask a human first.
            trace.approval = 'pending';
            updateMessage(msg.id, { meta });
            const status = await requestApproval({
              channelId, messageId: msg.id, agentId: agent.id, tool: 'generate_video', args: call.args, signal: ctl.signal,
              onCreate: (a) => { meta.approvals.push({ id: a.id, tool: a.tool, args: a.args, status: 'pending' }); updateMessage(msg.id, { meta }); },
            });
            meta.approvals[meta.approvals.length - 1].status = status;
            trace.approval = status;
            updateMessage(msg.id, { meta });
            if (status !== 'approved') throw new Error(`A human ${status === 'expired' ? 'did not respond to' : 'declined'} this video generation. Do not retry it; continue without the clip.`);
            const args = call.args || {};
            const buf = await generateVideo({ prompt: args.prompt, seconds: args.seconds, aspect: args.aspect, signal: ctl.signal });
            const media = saveMedia({ buf, ext: 'mp4', kind: 'video', channelId, meta: { prompt: String(args.prompt || '').slice(0, 500), seconds: args.seconds, aspect: args.aspect, provider: videoGenConfig().providerId }, byType: 'agent', byId: agent.id });
            meta.media = [...(meta.media || []), { id: media.id, url: media.url, prompt: media.meta.prompt }];
            out = `Video clip ready: ${media.url} (${Math.round(buf.length / 1024)} KB). Use it in a video artifact scene as {"layout":"clip","clip":"${media.url}"}, or put the URL on its own line in chat to show it.`;
          } else {
            out = await runTool(call, { tools: ctx.tools, scopes: ctx.scopes, channelId, signal: ctl.signal });
          }
          results.push(`Result of ${call.name}:\n${out}`);
          trace.summary = out.slice(0, 160);
          failures.delete(call.name);
        } catch (e) {
          trace.ok = false;
          trace.summary = e.message;
          const n = (failures.get(call.name) || 0) + 1;
          failures.set(call.name, n);
          results.push(`Tool ${call.name} failed: ${e.message}${n >= 2 ? `\n${call.name} appears to be unavailable right now. Do NOT call it again; continue from your own knowledge and say clearly that live data could not be retrieved.` : ''}`);
        }
        meta.tools.push(trace);
        audit('agent', agent.id, 'tool.call', call.name, { channelId, ok: trace.ok, args: call.args });
      }
      updateMessage(msg.id, { meta });
      convo.push({ role: 'assistant', content: chunk });
      const last = round === MAX_TOOL_ROUNDS - 1 ? '\nThis was your last tool round: write your answer now without calling more tools.' : '';
      convo.push({ role: 'user', content: `[Tool results]\n${results.join('\n\n')}\n\nContinue your reply to the team using these results. Do not repeat what you already wrote.${last}` });
      full += '\n\n';
    }
    // Never end a turn with nothing to show: if the tool budget ran out (or only tool calls were
    // written), give the agent one final, tool-free round to answer.
    if (unanswered || !displayText(full, { artifacts: savedArtifacts }).trim()) {
      convo.push({ role: 'user', content: '[System] Tool budget reached. Write your final answer to the team now, from what you already know and found. Do not call any tools.' });
      full += '\n\n';
      const chunk = (await stream()).replace(/```tool[\s\S]*?(```|$)/g, '');
      await applyDirectives(chunk, { agent, channel, msg, meta, savedArtifacts, userId });
    }
    meta.durationMs = Date.now() - started;
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
      meta: { ...meta, durationMs: Date.now() - started, error: aborted ? undefined : e.message },
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
      const art = upsertArtifact({ channelId: channel.id, type: b.attrs.type || 'document', title, content: b.body, byType: 'agent', byId: agent.id, baseAt: msg.createdAt });
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
    } else if (b.kind === 'task' && agent.tools.includes('tasks')) {
      if (meta.tasks.length >= 8) continue;
      let [title, ...rest] = b.body.split('\n');
      title = title.trim();
      if (!title) continue;
      // Keep board titles scannable; overflow goes into the description.
      if (title.length > 80) { rest = [title, ...rest]; title = title.slice(0, 77).replace(/[，,、：:；;\s]+\S*$/, '') + '…'; }
      const t = createTask({
        channelId: channel.id, title: title.trim(), description: rest.join('\n').trim(), assignee: b.attrs.assignee, due: b.attrs.due,
        byType: 'agent', byId: agent.id, sourceMessageId: msg.id,
      });
      meta.tasks.push({ id: t.id, title: t.title, assigneeType: t.assigneeType, assigneeId: t.assigneeId });
    } else if (b.kind === 'suggest') {
      meta.suggestions = b.body.split('\n').map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, '').trim()).filter(Boolean).slice(0, 3);
    }
  }
  if (meta.artifacts.length || meta.memories.length || meta.tasks.length || meta.suggestions.length) updateMessage(msg.id, { meta });
}

export { getMessage };
