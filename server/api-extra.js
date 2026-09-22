// REST routes for integrations (MCP), approvals, tasks, files, feedback, bookmarks and sharing.
import { randomBytes } from 'node:crypto';
import { router as r, need, readable, actor, readableArtifact } from './api.js';
import { fail, readJson } from './http.js';
import { all, get, run, now, audit, setSetting, getSetting } from './db.js';
import { atLeast } from './users.js';
import * as ch from './channels.js';
import * as agents from './agents/store.js';
import * as mcp from './mcp/index.js';
import * as approvals from './approvals.js';
import * as tasks from './tasks.js';
import * as files from './files.js';
import { addMemory } from './memory/store.js';
import { runChain, enqueue, handleHumanMessage } from './agents/orchestrator.js';
import { encrypt } from './secrets.js';
import { emit } from './bus.js';

const visibleChannelIds = (user) => ch.listChannelsFor(user).map((c) => c.id);

// ------------------------------------------------------------------ MCP

r.get('/api/mcp/presets', ({ user }) => { need(user, 'member'); return mcp.PRESETS; });
r.get('/api/mcp/servers', ({ user }) => {
  need(user, 'guest');
  const list = mcp.listServers();
  return atLeast(user, 'admin') ? list : list.map(({ id, name, slug, preset, enabled, status }) => ({ id, name, slug, preset, enabled, status }));
});
r.post('/api/mcp/servers', async ({ user, req }) => {
  need(user, 'admin');
  const b = await readJson(req);
  return mcp.saveServer(b.preset && b.values ? mcp.fromPreset(b.preset, b.values) : b, user);
});
r.patch('/api/mcp/servers/:id', async ({ user, req, params }) => {
  need(user, 'admin');
  return mcp.saveServer({ ...mcp.getServer(params.id), ...(await readJson(req)) }, user, params.id) || fail(404, 'MCP server not found');
});
r.delete('/api/mcp/servers/:id', ({ user, params }) => { need(user, 'admin'); mcp.deleteServer(params.id, user); return { ok: true }; });
// Connect (or reconnect) and list the server's tools.
r.post('/api/mcp/servers/:id/connect', async ({ user, params }) => {
  need(user, 'admin');
  mcp.disconnect(params.id);
  try {
    const tools = await mcp.listTools(params.id);
    const s = mcp.getServer(params.id);
    return { ok: true, tools: tools.map((t) => ({ name: t.name, description: t.description || '', approval: mcp.needsApproval(s, t) })) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ------------------------------------------------------------------ approvals

r.get('/api/approvals', ({ user }) => { need(user, 'guest'); return approvals.pendingApprovals(visibleChannelIds(user)); });
r.post('/api/approvals/:id', async ({ user, req, params }) => {
  need(user, 'member');
  const a = approvals.getApproval(params.id) || fail(404, 'Approval not found');
  if (a.channelId) readable(user, a.channelId);
  const { approve } = await readJson(req);
  return approvals.decide(a.id, !!approve, user);
});

// ------------------------------------------------------------------ tasks

r.get('/api/tasks', ({ user, query }) => {
  need(user, 'guest');
  const cid = query.get('channelId');
  return tasks.listTasks({ channelIds: cid ? [readable(user, cid).id] : visibleChannelIds(user), status: query.get('status') || undefined })
    .filter((t) => !cid || t.channelId === cid);
});
r.post('/api/tasks', async ({ user, req }) => {
  need(user, 'member');
  const b = await readJson(req);
  if (b.channelId) readable(user, b.channelId);
  return tasks.createTask({ ...b, byType: 'user', byId: user.id });
});
const editableTask = (user, tid) => { const t = tasks.getTask(tid) || fail(404, 'Task not found'); if (t.channelId) readable(user, t.channelId); return t; };
r.patch('/api/tasks/:id', async ({ user, req, params }) => { need(user, 'member'); editableTask(user, params.id); return tasks.updateTask(params.id, await readJson(req), actor(user)); });
r.delete('/api/tasks/:id', ({ user, params }) => { need(user, 'member'); editableTask(user, params.id); tasks.deleteTask(params.id, actor(user)); return { ok: true }; });
r.post('/api/tasks/:id/run', async ({ user, params }) => { need(user, 'member'); editableTask(user, params.id); return tasks.executeTask(params.id, { user, runChain, enqueue }); });

// ------------------------------------------------------------------ files

r.post('/api/channels/:id/files', async ({ user, req, params }) => {
  need(user, 'guest');
  const c = readable(user, params.id);
  const b = await readJson(req, 22_000_000);
  const f = await files.saveUpload({ channelId: c.id, name: b.name, mime: b.mime, data: b.data, userId: user.id });
  audit('user', user.id, 'file.upload', f.id, { name: f.name, size: f.size });
  return f;
});
r.get('/api/channels/:id/files', ({ user, params }) => files.listFiles(readable(user, params.id).id));
r.get('/api/files/:id', ({ user, params, res }) => {
  const f = files.getFile(params.id) || fail(404, 'File not found');
  if (f.channelId) readable(user, f.channelId);
  const inline = /^image\/(png|jpe?g|gif|webp)$/.test(f.mime) || f.mime === 'application/pdf';
  res.writeHead(200, {
    'content-type': inline ? f.mime : 'application/octet-stream',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    'content-security-policy': 'sandbox', 'x-content-type-options': 'nosniff',
  });
  res.end(files.fileBytes(f.id));
  return undefined;
});
r.delete('/api/files/:id', ({ user, params }) => {
  const f = files.getFile(params.id) || fail(404, 'File not found');
  if (f.channelId) readable(user, f.channelId);
  if (f.createdBy !== user.id) need(user, 'admin');
  files.deleteFile(f.id);
  return { ok: true };
});

// ------------------------------------------------------------------ feedback (agents learn from it)

r.post('/api/messages/:id/feedback', async ({ user, req, params }) => {
  const m = ch.getMessage(params.id) || fail(404, 'Message not found');
  readable(user, m.channelId);
  if (m.authorType !== 'agent') fail(400, 'Only agent replies can be rated');
  const { value, comment = '' } = await readJson(req);
  const v = value > 0 ? 1 : value < 0 ? -1 : 0;
  if (!v) { run('DELETE FROM feedback WHERE message_id = ? AND user_id = ?', m.id, user.id); }
  else {
    run(`INSERT INTO feedback(message_id, user_id, agent_id, value, comment, created_at) VALUES (?,?,?,?,?,?)
         ON CONFLICT(message_id, user_id) DO UPDATE SET value = excluded.value, comment = excluded.comment, created_at = excluded.created_at`,
      m.id, user.id, m.authorId, v, String(comment).slice(0, 1000), now());
    // Written feedback becomes the agent's private memory so future replies improve.
    if (comment.trim()) {
      addMemory({ scope: 'agent', scopeId: m.authorId, content: `${v > 0 ? 'Team liked' : 'Team disliked'} a reply ("${m.content.replace(/\[\[[^\]]+\]\]/g, '').slice(0, 80)}…"): ${comment.trim()}`, byType: 'user', byId: user.id, sourceMessageId: m.id });
    }
  }
  const agg = get('SELECT SUM(value = 1) AS up, SUM(value = -1) AS down FROM feedback WHERE message_id = ?', m.id);
  ch.updateMessage(m.id, { meta: { feedback: { up: agg.up || 0, down: agg.down || 0 } } });
  return { ok: true, value: v, up: agg.up || 0, down: agg.down || 0 };
});
r.get('/api/feedback/summary', ({ user }) => {
  need(user, 'admin');
  return all(`SELECT agent_id AS agentId, SUM(value = 1) AS up, SUM(value = -1) AS down, COUNT(*) AS total FROM feedback GROUP BY agent_id`);
});

// ------------------------------------------------------------------ bookmarks

r.get('/api/bookmarks', ({ user }) => {
  need(user, 'guest');
  const visible = new Set(visibleChannelIds(user));
  return all('SELECT * FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC', user.id).map((b) => {
    if (b.kind === 'message') { const m = ch.getMessage(b.target_id); return m && visible.has(m.channelId) ? { kind: 'message', createdAt: b.created_at, message: m } : null; }
    const a = get('SELECT id, channel_id, type, title, updated_at FROM artifacts WHERE id = ?', b.target_id);
    return a && (!a.channel_id || visible.has(a.channel_id)) ? { kind: 'artifact', createdAt: b.created_at, artifact: { id: a.id, channelId: a.channel_id, type: a.type, title: a.title, updatedAt: a.updated_at } } : null;
  }).filter(Boolean);
});
r.post('/api/bookmarks', async ({ user, req }) => {
  need(user, 'guest');
  const { kind, id, on = true } = await readJson(req);
  if (!['message', 'artifact'].includes(kind)) fail(400, 'kind must be message or artifact');
  if (kind === 'message') { const m = ch.getMessage(id) || fail(404, 'Not found'); readable(user, m.channelId); } else readableArtifact(user, id);
  if (on) run('INSERT OR IGNORE INTO bookmarks(user_id, kind, target_id, created_at) VALUES (?,?,?,?)', user.id, kind, id, now());
  else run('DELETE FROM bookmarks WHERE user_id = ? AND kind = ? AND target_id = ?', user.id, kind, id);
  return { ok: true, on: !!on };
});
r.get('/api/bookmarks/ids', ({ user }) => { need(user, 'guest'); return all('SELECT kind, target_id AS id FROM bookmarks WHERE user_id = ?', user.id); });

// ------------------------------------------------------------------ public share links for artifacts

r.post('/api/artifacts/:id/share', async ({ user, req, params }) => {
  need(user, 'member');
  readableArtifact(user, params.id);
  const { on = true } = await readJson(req);
  const token = on ? randomBytes(18).toString('base64url') : null;
  run('UPDATE artifacts SET share_token = ? WHERE id = ?', token, params.id);
  audit('user', user.id, on ? 'artifact.share' : 'artifact.unshare', params.id);
  return { ok: true, token, url: token ? `/s/${token}` : null };
});

// ------------------------------------------------------------------ settings: web search

r.get('/api/settings/search', ({ user }) => { need(user, 'admin'); const s = getSetting('search', {}) || {}; return { provider: s.provider || 'duckduckgo', hasKey: !!s.apiKeyEnc }; });
r.patch('/api/settings/search', async ({ user, req }) => {
  need(user, 'admin');
  const { provider, apiKey } = await readJson(req);
  const prev = getSetting('search', {}) || {};
  setSetting('search', { provider: ['duckduckgo', 'tavily', 'brave'].includes(provider) ? provider : 'duckduckgo', apiKeyEnc: apiKey ? encrypt(apiKey) : prev.apiKeyEnc || null });
  audit('user', user.id, 'settings.search', null, { provider });
  return { ok: true };
});

export { handleHumanMessage, emit };
