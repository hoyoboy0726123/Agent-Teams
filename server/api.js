// REST API. Every route is permission-checked; secrets never leave the server.
import { Router, fail, readJson, send } from './http.js';
import { all, get, getSetting, setSetting, audit, run } from './db.js';
import * as users from './users.js';
import * as ch from './channels.js';
import * as agents from './agents/store.js';
import * as prov from './providers/index.js';
import * as mem from './memory/store.js';
import * as arts from './artifacts/store.js';
import * as wf from './workflows/engine.js';
import { renderArtifact, downloadName } from './artifacts/render.js';
import { handleHumanMessage, runChain, enqueue } from './agents/orchestrator.js';
import { stopMessage } from './agents/runtime.js';
import { emit } from './bus.js';

const { atLeast } = users;
export const router = new Router();
const r = router;

const need = (user, role = 'member') => { if (!user) fail(401, 'Sign in required'); if (!atLeast(user, role)) fail(403, 'You do not have permission to do that'); };
const readable = (user, cid) => { const c = ch.getChannel(cid); if (!c || !ch.canRead(user, c)) fail(404, 'Channel not found'); return c; };
const actor = (user) => ({ type: 'user', id: user.id });

const SETTINGS_DEFAULTS = {
  workspaceName: 'Agent Teams',
  allowRegistration: false,
  router: null,          // { providerId, model } LLM router for "auto" channels
  utilityModel: null,    // { providerId, model } for summaries & memory extraction
  memory: { autoExtract: true, autoSummarize: true, defaultTtlDays: null },
  synthesis: true,
};
export const settings = () => Object.fromEntries(Object.entries(SETTINGS_DEFAULTS).map(([k, v]) => [k, getSetting(k, v)]));

// ------------------------------------------------------------------ auth

r.get('/api/bootstrap', ({ user }) => ({
  needsSetup: users.userCount() === 0,
  user,
  workspaceName: getSetting('workspaceName', 'Agent Teams'),
  allowRegistration: !!getSetting('allowRegistration', false),
}));

r.post('/api/auth/register', async ({ req, res }) => {
  const body = await readJson(req);
  const first = users.userCount() === 0;
  if (!first && !getSetting('allowRegistration', false)) fail(403, 'Registration is closed. Ask an admin to create your account.');
  const u = users.createUser({ ...body, role: 'member' });
  if (first) {
    if (body.workspaceName) setSetting('workspaceName', String(body.workspaceName).slice(0, 60));
    const { seedWorkspace } = await import('./seed.js');
    seedWorkspace(u);
  } else {
    for (const c of all("SELECT id FROM channels WHERE private = 0 AND kind = 'channel' AND archived = 0")) ch.addMember(c.id, 'user', u.id);
  }
  const token = users.createSession(u.id);
  setCookie(res, token);
  return { user: u };
});

r.post('/api/auth/login', async ({ req, res }) => {
  const { username, password } = await readJson(req);
  const out = users.login(username, password);
  if (!out) fail(401, 'Wrong username or password');
  setCookie(res, out.token);
  audit('user', out.user.id, 'auth.login', out.user.id);
  return { user: out.user };
});

r.post('/api/auth/logout', ({ token, res }) => {
  if (token) users.logout(token);
  res.setHeader('set-cookie', 'at_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return { ok: true };
});

function setCookie(res, token) {
  res.setHeader('set-cookie', `at_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`);
}

// ------------------------------------------------------------------ state

r.get('/api/state', ({ user }) => {
  need(user, 'guest');
  const admin = atLeast(user, 'admin');
  return {
    user,
    users: users.listUsers(),
    agents: agents.listAgents(),
    channels: ch.listChannelsFor(user),
    providers: prov.listProviders().map((p) => (admin ? p : { id: p.id, name: p.name, type: p.type, kind: p.kind, enabled: p.enabled })),
    catalog: prov.catalog(),
    agentTemplates: agents.TEMPLATES,
    agentTools: agents.TOOLS,
    settings: settings(),
  };
});

// ------------------------------------------------------------------ users

r.get('/api/users', ({ user }) => { need(user, 'guest'); return users.listUsers(); });
r.post('/api/users', async ({ user, req }) => {
  need(user, 'admin');
  const b = await readJson(req);
  if (b.role === 'owner') fail(400, 'There can only be one owner');
  const u = users.createUser(b);
  for (const c of all("SELECT id FROM channels WHERE private = 0 AND kind = 'channel' AND archived = 0")) ch.addMember(c.id, 'user', u.id);
  audit('user', user.id, 'user.invite', u.id, { role: u.role });
  return u;
});
r.patch('/api/users/:id', async ({ user, req, params }) => {
  need(user, 'guest');
  const b = await readJson(req);
  const self = params.id === user.id;
  if (!self) need(user, 'admin');
  const target = users.getUser(params.id) || fail(404, 'User not found');
  if (b.role && (!atLeast(user, 'admin') || target.role === 'owner' || b.role === 'owner')) delete b.role;
  if (b.password && !self && !atLeast(user, 'admin')) delete b.password;
  const u = users.updateUser(params.id, b);
  audit('user', user.id, 'user.update', params.id, { role: b.role });
  return u;
});
r.delete('/api/users/:id', ({ user, params }) => {
  need(user, 'admin');
  const t = users.getUser(params.id) || fail(404, 'User not found');
  if (t.role === 'owner') fail(400, 'The owner cannot be removed');
  run("DELETE FROM memories WHERE scope = 'user' AND scope_id = ?", t.id);
  users.deleteUser(t.id);
  audit('user', user.id, 'user.delete', t.id);
  return { ok: true };
});

// ------------------------------------------------------------------ providers

r.get('/api/providers', ({ user }) => { need(user, 'admin'); return prov.listProviders(); });
r.post('/api/providers', async ({ user, req }) => {
  need(user, 'admin');
  const p = prov.createProvider(await readJson(req));
  audit('user', user.id, 'provider.create', p.id, { type: p.type });
  return p;
});
r.patch('/api/providers/:id', async ({ user, req, params }) => {
  need(user, 'admin');
  const p = prov.updateProvider(params.id, await readJson(req)) || fail(404, 'Provider not found');
  audit('user', user.id, 'provider.update', p.id);
  return p;
});
r.delete('/api/providers/:id', ({ user, params }) => {
  need(user, 'admin');
  prov.deleteProvider(params.id);
  audit('user', user.id, 'provider.delete', params.id);
  return { ok: true };
});
r.get('/api/providers/:id/models', async ({ user, params }) => { need(user, 'member'); return prov.listModels(params.id); });
r.post('/api/providers/:id/test', async ({ user, params, req }) => {
  need(user, 'admin');
  const { model } = await readJson(req);
  const t0 = Date.now();
  try {
    const text = await prov.complete(params.id, { model, system: 'You are a connectivity check.', messages: [{ role: 'user', content: 'Reply with exactly: OK' }], maxTokens: 400 });
    return { ok: true, reply: text.trim().slice(0, 200), ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e.message, ms: Date.now() - t0 };
  }
});

// ------------------------------------------------------------------ agents

r.get('/api/agents', ({ user }) => { need(user, 'guest'); return agents.listAgents({ includeArchived: atLeast(user, 'admin') }); });
r.post('/api/agents', async ({ user, req }) => { need(user, 'member'); return agents.createAgent(await readJson(req), user); });
r.post('/api/agents/from-templates', async ({ user, req }) => {
  need(user, 'member');
  const { keys = [], providerId, model, channelId } = await readJson(req);
  const out = [];
  for (const k of keys) {
    const t = agents.TEMPLATES.find((x) => x.key === k);
    if (!t) continue;
    let handle = t.handle;
    for (let i = 2; agents.getAgentByHandle(handle); i++) handle = `${t.handle}${i}`;
    const a = agents.createAgent({ ...t, handle, providerId, model }, user);
    if (channelId) ch.addMember(channelId, 'agent', a.id);
    out.push(a);
  }
  return out;
});
const editableAgent = (user, id) => {
  const a = agents.getAgent(id) || fail(404, 'Agent not found');
  if (!atLeast(user, 'admin') && a.createdBy !== user.id) fail(403, 'Only the creator or an admin can change this agent');
  return a;
};
r.patch('/api/agents/:id', async ({ user, req, params }) => { need(user, 'member'); editableAgent(user, params.id); return agents.updateAgent(params.id, await readJson(req), user); });
r.delete('/api/agents/:id', ({ user, params }) => { need(user, 'member'); editableAgent(user, params.id); agents.deleteAgent(params.id, user); return { ok: true }; });

// ------------------------------------------------------------------ channels

r.get('/api/channels', ({ user }) => { need(user, 'guest'); return ch.listChannelsFor(user); });
r.post('/api/channels', async ({ user, req }) => {
  need(user, 'member');
  const b = await readJson(req);
  const c = ch.createChannel({ ...b, isPrivate: b.private }, user);
  if (!b.private) for (const u of users.listUsers()) if (u.role !== 'guest') ch.addMember(c.id, 'user', u.id);
  return c;
});
r.patch('/api/channels/:id', async ({ user, req, params }) => {
  const c = readable(user, params.id);
  const b = await readJson(req);
  if (!ch.canManage(user, c) && Object.keys(b).some((k) => k !== 'topic')) fail(403, 'Only the channel creator or an admin can change these settings');
  return ch.updateChannel(c.id, b, user);
});
r.delete('/api/channels/:id', ({ user, params }) => {
  const c = readable(user, params.id);
  if (!ch.canManage(user, c)) fail(403, 'Only the channel creator or an admin can delete it');
  ch.deleteChannel(c.id, user);
  run("DELETE FROM memories WHERE scope = 'channel' AND scope_id = ?", c.id);
  return { ok: true };
});
r.post('/api/channels/:id/members', async ({ user, req, params }) => {
  const c = readable(user, params.id);
  need(user, 'member');
  const { type, id } = await readJson(req);
  if (!['user', 'agent'].includes(type)) fail(400, 'type must be user or agent');
  if (type === 'user' && c.private && !ch.isMember(c.id, 'user', user.id) && !atLeast(user, 'admin')) fail(403, 'Not allowed');
  if (type === 'agent' && !agents.getAgent(id)) fail(404, 'Agent not found');
  if (type === 'user' && !users.getUser(id)) fail(404, 'User not found');
  ch.addMember(c.id, type, id);
  audit('user', user.id, 'channel.member.add', c.id, { type, id });
  return { ok: true, members: ch.members(c.id) };
});
r.delete('/api/channels/:id/members/:type/:mid', ({ user, params }) => {
  const c = readable(user, params.id);
  const self = params.type === 'user' && params.mid === user.id;
  if (!self) need(user, 'member');
  ch.removeMember(c.id, params.type, params.mid);
  audit('user', user.id, 'channel.member.remove', c.id, { type: params.type, id: params.mid });
  return { ok: true, members: ch.members(c.id) };
});
r.post('/api/channels/:id/join', ({ user, params }) => { const c = readable(user, params.id); ch.addMember(c.id, 'user', user.id); return { ok: true }; });
r.post('/api/channels/:id/clear', ({ user, params }) => {
  const c = readable(user, params.id);
  if (!ch.canManage(user, c)) fail(403, 'Not allowed');
  const n = run('DELETE FROM messages WHERE channel_id = ?', c.id).changes;
  run("UPDATE channels SET summary = '', summary_upto = 0 WHERE id = ?", c.id);
  audit('user', user.id, 'channel.clear', c.id, { deleted: n });
  emit('channel.updated', { channelId: c.id, cleared: true });
  return { ok: true, deleted: n };
});

// Direct conversation with one agent (private to the user).
r.post('/api/dm', async ({ user, req }) => {
  need(user, 'guest');
  const { agentId } = await readJson(req);
  const a = agents.getAgent(agentId) || fail(404, 'Agent not found');
  const existing = all(`SELECT c.id FROM channels c
    JOIN channel_members mu ON mu.channel_id = c.id AND mu.member_type = 'user' AND mu.member_id = ?
    JOIN channel_members ma ON ma.channel_id = c.id AND ma.member_type = 'agent' AND ma.member_id = ?
    WHERE c.kind = 'dm' AND c.archived = 0`, user.id, a.id)
    .find((row) => { const m = ch.members(row.id); return m.users.length === 1 && m.agents.length === 1; });
  if (existing) return ch.getChannel(existing.id);
  return ch.createChannel({ name: a.name, kind: 'dm', isPrivate: true, mode: 'auto', agentIds: [a.id] }, user);
});

// ------------------------------------------------------------------ messages

r.get('/api/channels/:id/messages', ({ user, params, query }) => {
  readable(user, params.id);
  return ch.listMessages(params.id, { before: Number(query.get('before')) || undefined, limit: Math.min(Number(query.get('limit')) || 60, 200) });
});

r.post('/api/channels/:id/messages', async ({ user, req, params }) => {
  const c = readable(user, params.id);
  const { content } = await readJson(req);
  if (!String(content || '').trim()) fail(400, 'Message is empty');
  if (!ch.isMember(c.id, 'user', user.id)) ch.addMember(c.id, 'user', user.id);
  const m = ch.createMessage({ channelId: c.id, authorType: 'user', authorId: user.id, content: String(content).slice(0, 100_000) });
  handleHumanMessage(m, user).catch((e) => console.error('[orchestrator]', e));
  return m;
});

r.patch('/api/messages/:id', async ({ user, req, params }) => {
  const m = ch.getMessage(params.id) || fail(404, 'Message not found');
  readable(user, m.channelId);
  if (!(m.authorType === 'user' && m.authorId === user.id)) fail(403, 'You can only edit your own messages');
  const { content } = await readJson(req);
  return ch.updateMessage(m.id, { content: String(content || ''), meta: { edited: Date.now() } });
});

r.delete('/api/messages/:id', ({ user, params }) => {
  const m = ch.getMessage(params.id) || fail(404, 'Message not found');
  const c = readable(user, m.channelId);
  if (!(m.authorType === 'user' && m.authorId === user.id) && !ch.canManage(user, c) && m.authorType !== 'agent') fail(403, 'Not allowed');
  stopMessage(m.id);
  ch.deleteMessage(m.id);
  audit('user', user.id, 'message.delete', m.id, { channelId: m.channelId });
  return { ok: true };
});

r.post('/api/messages/:id/stop', ({ user, params }) => {
  const m = ch.getMessage(params.id) || fail(404, 'Message not found');
  readable(user, m.channelId);
  return { ok: stopMessage(m.id) };
});

// Ask the same agent (or a different one) to answer again.
r.post('/api/messages/:id/regenerate', async ({ user, req, params }) => {
  const m = ch.getMessage(params.id) || fail(404, 'Message not found');
  readable(user, m.channelId);
  if (m.authorType !== 'agent') fail(400, 'Only agent messages can be regenerated');
  const { agentId } = await readJson(req);
  const target = agentId || m.authorId;
  stopMessage(m.id);
  ch.deleteMessage(m.id);
  enqueue(m.channelId, () => runChain(m.channelId, [{ agentId: target, depth: 0 }], { userId: user.id, parentId: m.parentId })).catch(() => {});
  return { ok: true };
});

r.get('/api/search', ({ user, query }) => {
  need(user, 'guest');
  const q = String(query.get('q') || '').trim();
  const visible = new Set(ch.listChannelsFor(user).map((c) => c.id));
  return {
    messages: ch.searchMessages(user, q, 40),
    memories: q ? mem.listMemories({ scopes: memoryScopesFor(user), q, limit: 20 }) : [],
    artifacts: q ? arts.listArtifacts({ channelIds: [...visible], q }).slice(0, 20) : [],
  };
});

// ------------------------------------------------------------------ memory

// Every (scope, scopeId) the user may see.
function memoryScopesFor(user) {
  const s = [['workspace', null], ['user', user.id]];
  for (const c of ch.listChannelsFor(user)) s.push(['channel', c.id]);
  if (user.role !== 'guest') for (const a of agents.listAgents()) s.push(['agent', a.id]);
  return s;
}

function checkScope(user, scope, scopeId, write) {
  if (!mem.SCOPES.includes(scope)) fail(400, 'Invalid scope');
  if (scope === 'user' && scopeId !== user.id) fail(403, 'Personal memories are private');
  if (scope === 'channel') readable(user, scopeId);
  if (scope === 'agent') { need(user, 'member'); if (write && !atLeast(user, 'admin') && agents.getAgent(scopeId)?.createdBy !== user.id) fail(403, 'Only the agent owner or an admin can change its private memory'); }
  if (scope === 'workspace' && write) need(user, 'member');
}

r.get('/api/memories', ({ user, query }) => {
  need(user, 'guest');
  const scope = query.get('scope');
  const q = query.get('q') || '';
  let scopes = memoryScopesFor(user);
  if (scope) {
    const sid = query.get('scopeId') || (scope === 'user' ? user.id : null);
    checkScope(user, scope, sid, false);
    scopes = [[scope, scope === 'workspace' ? null : sid]];
  } else if (query.get('channelId')) {
    const cid = query.get('channelId');
    readable(user, cid);
    scopes = [['workspace', null], ['channel', cid], ['user', user.id]];
  }
  return mem.listMemories({ scopes, q, limit: 500 });
});

r.post('/api/memories', async ({ user, req }) => {
  const b = await readJson(req);
  const scopeId = b.scope === 'workspace' ? null : b.scope === 'user' ? user.id : b.scopeId;
  checkScope(user, b.scope, scopeId, true);
  const ttl = b.ttlDays ?? getSetting('memory', {})?.defaultTtlDays ?? null;
  const m = mem.addMemory({ scope: b.scope, scopeId, content: b.content, byType: 'user', byId: user.id, pinned: !!b.pinned, ttlDays: ttl });
  emit('memory.updated', { channelId: b.scope === 'channel' ? scopeId : null });
  return m;
});

function editableMemory(user, id) {
  const m = mem.getMemory(id) || fail(404, 'Memory not found');
  checkScope(user, m.scope, m.scopeId, true);
  if (m.scope === 'workspace' && !atLeast(user, 'admin') && !(m.createdByType === 'user' && m.createdById === user.id)) fail(403, 'Only admins can change shared workspace memory created by others');
  return m;
}

r.patch('/api/memories/:id', async ({ user, req, params }) => {
  const m = editableMemory(user, params.id);
  const out = mem.updateMemory(m.id, await readJson(req), actor(user));
  emit('memory.updated', { channelId: m.scope === 'channel' ? m.scopeId : null });
  return out;
});
r.delete('/api/memories/:id', ({ user, params }) => {
  const m = editableMemory(user, params.id);
  mem.deleteMemory(m.id, actor(user));
  emit('memory.updated', { channelId: m.scope === 'channel' ? m.scopeId : null });
  return { ok: true };
});
r.post('/api/memories/clear', async ({ user, req }) => {
  const { scope, scopeId } = await readJson(req);
  const sid = scope === 'workspace' ? null : scope === 'user' ? user.id : scopeId;
  checkScope(user, scope, sid, true);
  if (scope === 'workspace' || scope === 'channel') { const c = scope === 'channel' ? ch.getChannel(sid) : null; if (!atLeast(user, 'admin') && !(c && ch.canManage(user, c))) fail(403, 'Not allowed'); }
  const n = mem.clearScope(scope, sid, actor(user));
  emit('memory.updated', { channelId: scope === 'channel' ? sid : null });
  return { ok: true, deleted: n };
});

// ------------------------------------------------------------------ artifacts

const readableArtifact = (user, id, version) => {
  const a = arts.getArtifact(id, version) || fail(404, 'Artifact not found');
  if (a.channelId) readable(user, a.channelId);
  return a;
};

r.get('/api/artifacts', ({ user, query }) => {
  need(user, 'guest');
  const cid = query.get('channelId');
  const visible = cid ? [readable(user, cid).id] : ch.listChannelsFor(user).map((c) => c.id);
  return arts.listArtifacts({ channelIds: visible, q: query.get('q') || '' }).filter((a) => !cid || a.channelId === cid);
});
r.get('/api/artifacts/:id', ({ user, params, query }) => readableArtifact(user, params.id, Number(query.get('version')) || undefined));
r.post('/api/artifacts', async ({ user, req }) => {
  need(user, 'member');
  const b = await readJson(req);
  if (b.channelId) readable(user, b.channelId);
  return arts.createArtifact({ channelId: b.channelId || null, type: b.type, title: b.title, content: String(b.content || ''), byType: 'user', byId: user.id });
});
r.put('/api/artifacts/:id', async ({ user, req, params }) => {
  need(user, 'member');
  readableArtifact(user, params.id);
  const b = await readJson(req);
  return arts.addVersion(params.id, { content: String(b.content ?? ''), title: b.title, byType: 'user', byId: user.id });
});
r.delete('/api/artifacts/:id', ({ user, params }) => {
  need(user, 'member');
  readableArtifact(user, params.id);
  arts.deleteArtifact(params.id, actor(user));
  return { ok: true };
});
// Rendered preview. The CSP sandbox gives the page an opaque origin, so agent-written
// HTML/JS can never read the user's session or call the API.
r.get('/api/artifacts/:id/render', ({ user, params, query, res }) => {
  const a = readableArtifact(user, params.id, Number(query.get('version')) || undefined);
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "sandbox allow-scripts allow-popups allow-modals; default-src 'none'; img-src * data: blob:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; script-src 'unsafe-inline'; media-src * data: blob:",
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  });
  res.end(renderArtifact(a));
  return undefined;
});
r.get('/api/artifacts/:id/download', ({ user, params, query, res }) => {
  const a = readableArtifact(user, params.id, Number(query.get('version')) || undefined);
  const md = a.type === 'document' || a.type === 'research';
  const body = md ? a.content : renderArtifact(a);
  res.writeHead(200, {
    'content-type': md ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadName(a))}`,
    'content-security-policy': 'sandbox',
  });
  res.end(body);
  return undefined;
});

// ------------------------------------------------------------------ workflows

r.get('/api/workflows', ({ user }) => { need(user, 'guest'); return wf.listWorkflows(); });
r.get('/api/workflows/templates', ({ user }) => { need(user, 'guest'); return wf.WORKFLOW_TEMPLATES; });
r.post('/api/workflows', async ({ user, req }) => { need(user, 'member'); return wf.saveWorkflow(await readJson(req), user); });
r.patch('/api/workflows/:id', async ({ user, req, params }) => {
  need(user, 'member');
  const w = wf.getWorkflow(params.id) || fail(404, 'Workflow not found');
  if (!atLeast(user, 'admin') && w.createdBy !== user.id) fail(403, 'Only the creator or an admin can edit this workflow');
  return wf.saveWorkflow({ ...w, ...(await readJson(req)) }, user, w.id);
});
r.delete('/api/workflows/:id', ({ user, params }) => {
  need(user, 'member');
  const w = wf.getWorkflow(params.id) || fail(404, 'Workflow not found');
  if (!atLeast(user, 'admin') && w.createdBy !== user.id) fail(403, 'Not allowed');
  wf.deleteWorkflow(w.id, user);
  return { ok: true };
});
r.post('/api/workflows/:id/run', async ({ user, req, params }) => {
  need(user, 'member');
  const { input = '', channelId } = await readJson(req);
  const w = wf.getWorkflow(params.id) || fail(404, 'Workflow not found');
  readable(user, channelId || w.channelId || fail(400, 'Choose a channel'));
  const { runId, channelId: cid } = wf.startWorkflow(w.id, { input, channelId, user });
  return { runId, channelId: cid };
});
r.get('/api/workflows/:id/runs', ({ user, params }) => { need(user, 'guest'); return wf.listRuns(params.id); });

// ------------------------------------------------------------------ admin

r.get('/api/settings', ({ user }) => { need(user, 'guest'); return settings(); });
r.patch('/api/settings', async ({ user, req }) => {
  need(user, 'admin');
  const b = await readJson(req);
  for (const k of Object.keys(SETTINGS_DEFAULTS)) if (k in b) setSetting(k, b[k]);
  audit('user', user.id, 'settings.update', null, { keys: Object.keys(b) });
  return settings();
});

r.get('/api/audit', ({ user, query }) => {
  need(user, 'admin');
  const limit = Math.min(Number(query.get('limit')) || 200, 1000);
  return all('SELECT * FROM audit ORDER BY id DESC LIMIT ?', limit).map((a) => ({ ...a, detail: JSON.parse(a.detail_json) }));
});

r.get('/api/usage', ({ user, query }) => {
  need(user, 'admin');
  const since = Date.now() - (Number(query.get('days')) || 30) * 86400000;
  return {
    byAgent: all(`SELECT agent_id AS agentId, COUNT(*) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output, CAST(AVG(latency_ms) AS INT) AS avgMs, SUM(1 - ok) AS errors FROM usage WHERE created_at > ? GROUP BY agent_id ORDER BY calls DESC`, since),
    byModel: all(`SELECT provider_id AS providerId, model, COUNT(*) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output, CAST(AVG(latency_ms) AS INT) AS avgMs, SUM(1 - ok) AS errors FROM usage WHERE created_at > ? GROUP BY provider_id, model ORDER BY calls DESC`, since),
    daily: all(`SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS calls, SUM(input_tokens + output_tokens) AS tokens FROM usage WHERE created_at > ? GROUP BY day ORDER BY day`, since),
  };
});

// Full export (no secrets). Data portability is a feature, not an afterthought.
r.get('/api/export', ({ user, res }) => {
  need(user, 'admin');
  const dump = {
    exportedAt: new Date().toISOString(),
    settings: settings(),
    users: users.listUsers(),
    agents: agents.listAgents({ includeArchived: true }),
    providers: prov.listProviders().map(({ keyPreview, hasKey, ...p }) => p),
    channels: all('SELECT * FROM channels'),
    channelMembers: all('SELECT * FROM channel_members'),
    messages: all('SELECT * FROM messages ORDER BY created_at'),
    memories: all('SELECT * FROM memories'),
    artifacts: all('SELECT * FROM artifacts'),
    artifactVersions: all('SELECT * FROM artifact_versions'),
    workflows: all('SELECT * FROM workflows'),
  };
  audit('user', user.id, 'data.export');
  res.writeHead(200, { 'content-type': 'application/json', 'content-disposition': `attachment; filename="agent-teams-export-${Date.now()}.json"` });
  res.end(JSON.stringify(dump, null, 2));
  return undefined;
});

// "Forget me": delete my personal memories and optionally my messages.
r.post('/api/me/forget', async ({ user, req }) => {
  need(user, 'guest');
  const { messages } = await readJson(req);
  const m = mem.clearScope('user', user.id, actor(user));
  const n = messages ? run("DELETE FROM messages WHERE author_type = 'user' AND author_id = ?", user.id).changes : 0;
  audit('user', user.id, 'data.forget', user.id, { memories: m, messages: n });
  return { ok: true, memories: m, messages: n };
});

r.get('/api/health', () => ({ ok: true, version: '0.1.0', time: Date.now() }));

export async function handleApi(ctx) {
  const m = router.match(ctx.req.method, ctx.path);
  if (!m) return send(ctx.res, 404, { error: 'Not found' });
  const out = await m.handler({ ...ctx, params: m.params });
  if (out !== undefined && !ctx.res.headersSent) send(ctx.res, 200, out);
}

export { get };
