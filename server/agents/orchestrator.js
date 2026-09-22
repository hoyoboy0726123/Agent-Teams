// Decides which agents respond to a message, runs them in order, follows agent→agent
// hand-offs (@mentions) and performs background memory upkeep afterwards.
import { config } from '../config.js';
import { getSetting, setSetting, all, run } from '../db.js';
import { getChannel, members, addMember, createMessage, listMessages } from '../channels.js';
import { getAgent, getAgentByHandle } from './store.js';
import { listUsers, atLeast } from '../users.js';
import { runAgent } from './runtime.js';
import { complete } from '../providers/index.js';
import { bm25 } from '../memory/search.js';
import { addMemory } from '../memory/store.js';
import { emit } from '../bus.js';

const EVERYONE = new Set(['all', 'everyone', 'team', '所有人', '大家', '全員']);
const MAX_TURNS_PER_MESSAGE = 10;
const queues = new Map(); // channelId → Promise (serialises runs per channel)

export const mentionHandles = (text) => [...String(text).matchAll(/(?:^|[\s(（,，])@([\p{L}\p{N}_-]+)/gu)].map((m) => m[1]);

function channelAgents(channelId) {
  return members(channelId).agents.map(getAgent).filter((a) => a && !a.archived);
}

// Returns the agents that should answer a human message, in order.
export async function pickResponders(channel, message, user) {
  const inChannel = channelAgents(channel.id);
  const handles = mentionHandles(message.content);
  if (handles.some((h) => EVERYONE.has(h.toLowerCase()))) return inChannel;

  const mentioned = [];
  for (const h of handles) {
    const a = getAgentByHandle(h);
    if (!a || mentioned.some((x) => x.id === a.id)) continue;
    if (!inChannel.some((x) => x.id === a.id)) {
      if (!atLeast(user, 'member')) continue;
      addMember(channel.id, 'agent', a.id);
      createMessage({ channelId: channel.id, authorType: 'system', content: `@${a.handle} joined the channel (mentioned by @${user.username}).` });
    }
    mentioned.push(a);
  }
  if (mentioned.length) return mentioned;

  // Talking to a human only? Stay quiet.
  const humans = new Set(listUsers().map((u) => u.username));
  if (handles.some((h) => humans.has(h.toLowerCase()))) return [];

  if (channel.kind === 'dm') return inChannel;
  if (!inChannel.length || channel.mode === 'mention') return [];
  if (channel.mode === 'roundtable') return inChannel;
  if (inChannel.length === 1) return inChannel;
  const chosen = await route(channel, message, inChannel);
  return chosen ? [chosen] : [];
}

// "auto" mode: an optional LLM router, else lexical match on role descriptions,
// with conversational stickiness toward the agent that spoke last.
async function route(channel, message, agents) {
  const router = getSetting('router', null);
  if (router?.providerId) {
    try {
      const list = agents.map((a) => JSON.stringify({ handle: a.handle, name: a.name, role: a.description })).join('\n');
      const recent = listMessages(channel.id, { limit: 6 }).map((m) => `${m.authorType}: ${m.content.slice(0, 300)}`).join('\n');
      const out = await complete(router.providerId, {
        model: router.model,
        system: 'Pick the best agent to respond to the latest message in a team chat. Reply with ONLY the agent handle, or "none" if the message is addressed to humans or needs no AI reply.',
        messages: [{ role: 'user', content: `Agents:\n${list}\n\nRecent conversation:\n${recent}\n\nLatest message:\n${message.content}` }],
        maxTokens: 20,
      });
      const h = out.trim().replace(/^@/, '').split(/\s/)[0].toLowerCase();
      if (h === 'none') return null;
      const hit = agents.find((a) => a.handle.toLowerCase() === h);
      if (hit) return hit;
    } catch (e) {
      console.warn('[router] falling back to heuristic:', e.message);
    }
  }
  const scored = bm25(message.content, agents.map((a) => ({ id: a.id, text: `${a.name} ${a.handle} ${a.description} ${a.systemPrompt.slice(0, 400)}` })));
  const prev = listMessages(channel.id, { limit: 4 }).reverse().find((m) => m.id !== message.id && m.authorType !== 'system');
  const sticky = prev?.authorType === 'agent' && Date.now() - prev.createdAt < 20 * 60_000 ? agents.find((a) => a.id === prev.authorId) : null;
  if (scored[0] && (!sticky || scored[0].score >= 1.5)) return agents.find((a) => a.id === scored[0].id);
  if (sticky) return sticky;
  return agents.find((a) => a.handle === 'lead') || agents[0];
}

// Entry point for every human message.
export function handleHumanMessage(message, user) {
  const channel = getChannel(message.channelId);
  if (!channel) return Promise.resolve([]);
  return enqueue(channel.id, async () => {
    const responders = await pickResponders(channel, message, user);
    return runChain(channel.id, responders.map((a) => ({ agentId: a.id, depth: 0 })), { userId: user.id, parentId: message.id });
  });
}

export function enqueue(channelId, job) {
  const prev = queues.get(channelId) || Promise.resolve();
  const next = prev.catch(() => {}).then(job);
  queues.set(channelId, next);
  next.finally(() => { if (queues.get(channelId) === next) queues.delete(channelId); }).catch(() => {});
  return next;
}

// Run agents one after another; agents may pull in teammates by @mentioning them.
export async function runChain(channelId, queue, { userId, parentId, extraInstruction } = {}) {
  const results = [];
  let turns = 0;
  while (queue.length && turns < MAX_TURNS_PER_MESSAGE) {
    const { agentId, depth, instruction, synthesis } = queue.shift();
    turns++;
    const msg = await runAgent({ agentId, channelId, userId, parentId, depth, extraInstruction: instruction || extraInstruction });
    results.push(msg);
    if (msg.status !== 'done' || synthesis || depth >= config.maxHandoffDepth) continue;
    const agent = getAgent(agentId);
    if (!agent?.tools.includes('handoff')) continue;
    const inChannel = channelAgents(channelId);
    const delegated = [];
    for (const h of mentionHandles(msg.content)) {
      const target = inChannel.find((a) => a.handle.toLowerCase() === h.toLowerCase());
      if (!target || target.id === agentId || queue.some((q) => q.agentId === target.id)) continue;
      queue.push({ agentId: target.id, depth: depth + 1 });
      delegated.push(target.handle);
    }
    // The delegating agent gets the last word: it synthesises its teammates' answers.
    if (delegated.length && getSetting('synthesis', true) !== false) {
      queue.push({
        agentId, depth: depth + 1, synthesis: true,
        instruction: `You delegated to ${delegated.map((h) => '@' + h).join(', ')} and they have replied above. Now synthesise their input into one clear final answer for the humans (decisions, deliverables, next steps). Do not delegate again and do not repeat their messages verbatim.`,
      });
    }
  }
  const last = results.filter((m) => m.status === 'done').pop();
  if (last) maintainChannel(channelId, getAgent(last.authorId)).catch((e) => console.warn('[memory]', e.message));
  return results;
}

// ------------------------------------------------------------ memory upkeep

function utilityModel(fallbackAgent) {
  const u = getSetting('utilityModel', null);
  if (u?.providerId) return u;
  return fallbackAgent?.providerId ? { providerId: fallbackAgent.providerId, model: fallbackAgent.model } : null;
}

const fmt = (msgs) => msgs.map((m) => {
  const who = m.authorType === 'agent' ? `@${getAgent(m.authorId)?.handle || 'agent'}` : m.authorType === 'user' ? (listUsers().find((u) => u.id === m.authorId)?.displayName || 'user') : 'system';
  return `${who}: ${m.content.replace(/\[\[[^\]]+\]\]/g, '').slice(0, 1500)}`;
}).join('\n');

export async function maintainChannel(channelId, agent) {
  const channel = getChannel(channelId);
  if (!channel?.memoryEnabled) return;
  const mem = getSetting('memory', { autoExtract: true, autoSummarize: true });
  const um = utilityModel(agent);
  if (!um) return;

  // 1) Rolling summary of messages that fell out of the verbatim context window.
  if (mem.autoSummarize !== false) {
    const row = all('SELECT summary_upto FROM channels WHERE id = ?', channelId)[0];
    const older = all(`SELECT * FROM messages WHERE channel_id = ? AND status = 'done' AND created_at > ? ORDER BY created_at DESC LIMIT -1 OFFSET ?`,
      channelId, row.summary_upto, config.contextMessages).reverse();
    if (older.length >= 10) {
      const batch = older.slice(0, 80).map((r) => ({ authorType: r.author_type, authorId: r.author_id, content: r.content }));
      const summary = await complete(um.providerId, {
        model: um.model,
        system: 'Summarize this team conversation for future context. Merge it with the previous summary. Keep decisions, owners, deadlines, open questions and key facts. Max 250 words, bullet points, same language as the conversation.',
        messages: [{ role: 'user', content: `Previous summary:\n${channel.summary || '(none)'}\n\nNew messages:\n${fmt(batch)}` }],
        maxTokens: 800,
      });
      run('UPDATE channels SET summary = ?, summary_upto = ? WHERE id = ?', summary.trim(), older[Math.min(79, older.length - 1)].created_at, channelId);
      emit('channel.updated', { channelId });
    }
  }

  // 2) Automatic extraction of durable facts into channel memory.
  if (mem.autoExtract !== false) {
    const key = `extractUpto:${channelId}`;
    const upto = getSetting(key, 0);
    const fresh = all(`SELECT * FROM messages WHERE channel_id = ? AND status = 'done' AND created_at > ? ORDER BY created_at LIMIT 40`, channelId, upto);
    if (fresh.length >= 6) {
      const batch = fresh.map((r) => ({ authorType: r.author_type, authorId: r.author_id, content: r.content }));
      const out = await complete(um.providerId, {
        model: um.model,
        system: 'Extract durable facts worth remembering from this team conversation: decisions, commitments, deadlines, preferences, project facts, names/roles. Skip small talk and anything temporary. Never include secrets. Return ONLY a JSON array of short standalone strings (same language as the conversation), or [] if nothing qualifies.',
        messages: [{ role: 'user', content: fmt(batch) }],
        maxTokens: 600,
      });
      const json = /\[[\s\S]*\]/.exec(out)?.[0];
      let facts = [];
      try { facts = JSON.parse(json || '[]'); } catch {}
      for (const f of facts.filter((x) => typeof x === 'string').slice(0, 8)) {
        addMemory({ scope: 'channel', scopeId: channelId, content: f, byType: 'system', byId: 'auto-extract' });
      }
      setSetting(key, fresh[fresh.length - 1].created_at);
      if (facts.length) emit('memory.updated', { channelId });
    }
  }
}
