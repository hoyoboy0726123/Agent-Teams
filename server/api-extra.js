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

// ------------------------------------------------------------------ agent library & teams

import { LIBRARY, TEAMS, CATEGORIES, libraryAgent } from './agents/library.js';

r.get('/api/library', ({ user }) => { need(user, 'guest'); return { categories: CATEGORIES, agents: LIBRARY, teams: TEAMS }; });

// Reuse an existing agent made from the same template, otherwise create it.
function ensureFromTemplate(key, { providerId, model }, user) {
  const tpl = libraryAgent(key);
  if (!tpl) return null;
  const existing = agents.listAgents().find((x) => x.templateKey === key);
  if (existing) return existing;
  let handle = tpl.handle;
  for (let i = 2; agents.getAgentByHandle(handle); i++) handle = `${tpl.handle}${i}`;
  return agents.createAgent({ ...tpl, handle, providerId, model }, user);
}

r.post('/api/teams/:key', async ({ user, req, params }) => {
  need(user, 'member');
  const team = TEAMS.find((t) => t.key === params.key) || fail(404, 'Team template not found');
  const { providerId, model, name } = await readJson(req);
  const members = team.members.map((k) => ensureFromTemplate(k, { providerId, model }, user)).filter(Boolean);
  const channel = ch.createChannel({ name: name || team.name.replace(/\s+[A-Za-z].*$/, '') || team.key, topic: team.description, mode: team.mode, agentIds: members.map((m) => m.id) }, user);
  for (const u of (await import('./users.js')).listUsers()) if (u.role !== 'guest') ch.addMember(channel.id, 'user', u.id);
  ch.createMessage({ channelId: channel.id, authorType: 'system', content: `${team.icon} **${team.name}** — ${members.map((m) => `@${m.handle}`).join(' ')}\n\n${team.kickoff}` });
  audit('user', user.id, 'team.create', channel.id, { team: team.key });
  return { channel, agents: members };
});

r.post('/api/library/:key/add', async ({ user, req, params }) => {
  need(user, 'member');
  const { providerId, model, channelId } = await readJson(req);
  const a = ensureFromTemplate(params.key, { providerId, model }, user) || fail(404, 'Template not found');
  if (channelId) { readable(user, channelId); ch.addMember(channelId, 'agent', a.id); }
  return a;
});

// Portable agent definitions (share / fork between workspaces).
r.get('/api/agents/:id/export', ({ user, params }) => {
  need(user, 'member');
  const a = agents.getAgent(params.id) || fail(404, 'Agent not found');
  const { name, handle, avatar, color, description, systemPrompt, model, temperature, tools, memoryEnabled, category, starters } = a;
  return { format: 'agent-teams/agent@1', agent: { name, handle, avatar, color, description, systemPrompt, model, temperature, tools, memoryEnabled, category, starters } };
});
r.post('/api/agents/import', async ({ user, req }) => {
  need(user, 'member');
  const b = await readJson(req);
  const def = b.agent || b;
  if (!def?.name) fail(400, 'Not an agent definition');
  let handle = agents.normalizeHandle(def.handle || def.name);
  for (let i = 2; agents.getAgentByHandle(handle); i++) handle = `${agents.normalizeHandle(def.handle || def.name)}${i}`;
  return agents.createAgent({ ...def, handle, providerId: b.providerId || null, mcpServers: [] }, user);
});

// ------------------------------------------------------------------ automations

import * as wf from './workflows/engine.js';
import { validateSchedule, nextRuns, describe } from './workflows/schedule.js';
import { render as renderTpl } from './workflows/engine.js';

r.get('/api/automations/templates', ({ user }) => { need(user, 'guest'); return wf.AUTOMATION_TEMPLATES; });

// Install a template: creates the agents it needs, a channel to post in and the automation.
r.post('/api/automations/templates/:key', async ({ user, req, params }) => {
  need(user, 'member');
  const tpl = wf.AUTOMATION_TEMPLATES.find((t) => t.key === params.key) || fail(404, 'Template not found');
  const { values = {}, channelId, schedule, providerId, model, name, trigger } = await readJson(req);
  const stepAgents = tpl.steps.map((s) => ensureFromTemplate(s.agent, { providerId, model }, user));
  let cid = channelId;
  if (cid) { readable(user, cid); for (const a of stepAgents) ch.addMember(cid, 'agent', a.id); }
  else {
    const c = ch.createChannel({ name: `${tpl.icon} ${name || tpl.name.zh}`, topic: tpl.description.zh, isPrivate: true, mode: 'mention', agentIds: stepAgents.map((a) => a.id) }, user);
    cid = c.id;
  }
  // Fill form fields now; runtime variables ({{input}}, {{digest}}, …) stay for each run.
  const filled = Object.fromEntries((tpl.fields || []).map((f) => [f.key, String(values[f.key] ?? '').trim() || f.placeholder || '']));
  const runtime = new Set(['input', 'prev', 'date', 'digest', 'digest_week']);
  const steps = tpl.steps.map((s, i) => ({
    agentId: stepAgents[i].id, parallel: !!s.parallel,
    instruction: s.instruction.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (runtime.has(k) || /^step\d+$/.test(k) ? m : filled[k] ?? m)),
  }));
  const trig = trigger || tpl.trigger;
  const w = wf.saveWorkflow({
    name: name || tpl.name.zh, description: tpl.description.zh, steps, channelId: cid, trigger: trig,
    schedule: trig === 'schedule' ? schedule || tpl.schedule : null, category: tpl.category, icon: tpl.icon, templateKey: tpl.key,
    scheduleInput: values.input || '',
  }, user);
  ch.createMessage({ channelId: cid, authorType: 'system', content: `${tpl.icon} Automation **${w.name}** is set up — ${w.scheduleLabel.zh}${trig === 'webhook' ? ' (webhook)' : ''}.` });
  return w;
});

r.post('/api/workflows/:id/enabled', async ({ user, req, params }) => {
  need(user, 'member');
  const w = wf.getWorkflow(params.id) || fail(404, 'Workflow not found');
  if (!atLeast(user, 'admin') && w.createdBy !== user.id) fail(403, 'Only the creator or an admin can change this automation');
  const { enabled } = await readJson(req);
  return wf.setEnabled(w.id, !!enabled, user);
});

r.post('/api/schedule/preview', async ({ user, req }) => {
  need(user, 'guest');
  const { schedule } = await readJson(req);
  const s = validateSchedule(schedule);
  const tz = wf.workspaceTz();
  return { tz, label: { zh: describe(s, 'zh'), en: describe(s, 'en') }, next: nextRuns(s, { tz, count: 3 }).map((d) => d.getTime()) };
});

export { renderTpl };

// ------------------------------------------------------------------ studio: comments & AI revisions

import { getArtifact } from './artifacts/store.js';
import { id as newId } from './db.js';

const toComment = (c) => ({ id: c.id, artifactId: c.artifact_id, version: c.version, quote: c.quote, body: c.body, authorType: c.author_type, authorId: c.author_id, status: c.status, createdAt: c.created_at });

r.get('/api/artifacts/:id/comments', ({ user, params }) => {
  readableArtifact(user, params.id);
  return all('SELECT * FROM artifact_comments WHERE artifact_id = ? ORDER BY created_at', params.id).map(toComment);
});
r.post('/api/artifacts/:id/comments', async ({ user, req, params }) => {
  need(user, 'guest');
  const a = readableArtifact(user, params.id);
  const { body, quote = '', version } = await readJson(req);
  if (!String(body || '').trim()) fail(400, 'Comment is empty');
  const cid = newId('cmt_');
  run('INSERT INTO artifact_comments(id, artifact_id, version, quote, body, author_type, author_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
    cid, a.id, version || a.version, String(quote).slice(0, 500), String(body).slice(0, 2000), 'user', user.id, now());
  emit('artifact.updated', { channelId: a.channelId, artifactId: a.id, comments: true });
  return toComment(get('SELECT * FROM artifact_comments WHERE id = ?', cid));
});
r.patch('/api/artifact-comments/:id', async ({ user, req, params }) => {
  const c = get('SELECT * FROM artifact_comments WHERE id = ?', params.id) || fail(404, 'Comment not found');
  const a = readableArtifact(user, c.artifact_id);
  const { status } = await readJson(req);
  run('UPDATE artifact_comments SET status = ? WHERE id = ?', status === 'resolved' ? 'resolved' : 'open', c.id);
  emit('artifact.updated', { channelId: a.channelId, artifactId: a.id, comments: true });
  return { ok: true };
});
r.delete('/api/artifact-comments/:id', ({ user, params }) => {
  const c = get('SELECT * FROM artifact_comments WHERE id = ?', params.id) || fail(404, 'Comment not found');
  readableArtifact(user, c.artifact_id);
  if (c.author_id !== user.id) need(user, 'admin');
  run('DELETE FROM artifact_comments WHERE id = ?', c.id);
  return { ok: true };
});

// Ask an agent to produce the next version, addressing an instruction and/or all open comments.
r.post('/api/artifacts/:id/revise', async ({ user, req, params }) => {
  need(user, 'member');
  const a = readableArtifact(user, params.id);
  if (!a.channelId) fail(400, 'Only artifacts that belong to a channel can be revised by an agent');
  const { instruction = '', agentId, includeComments = true } = await readJson(req);
  const agentRow = agents.getAgent(agentId || (a.createdByType === 'agent' ? a.createdById : null)) || fail(400, 'Choose an agent to make the revision');
  const open = includeComments ? all("SELECT * FROM artifact_comments WHERE artifact_id = ? AND status = 'open' ORDER BY created_at", a.id) : [];
  if (!instruction.trim() && !open.length) fail(400, 'Describe the change or add comments first');
  ch.addMember(a.channelId, 'agent', agentRow.id);
  const list = open.map((c, i) => `${i + 1}. ${c.quote ? `On "${c.quote}": ` : ''}${c.body}`).join('\n');
  const text = `@${agentRow.handle} please revise “${a.title}” (v${a.version}).${instruction.trim() ? `\n${instruction.trim()}` : ''}${list ? `\n\nReview comments to address:\n${list}` : ''}`;
  const msg = ch.createMessage({ channelId: a.channelId, authorType: 'user', authorId: user.id, content: text, meta: { studio: { artifactId: a.id } } });
  const task = `Revise the existing artifact titled "${a.title}" (type ${a.type}). Its current content (v${a.version}) is below. Output the COMPLETE updated artifact in an artifact block with exactly the same title and type so it becomes version ${a.version + 1}. Keep everything that was not asked to change. After the block, list the changes in 1–4 short bullets.\n\n<current_artifact>\n${a.content.slice(0, 60000)}\n</current_artifact>`;
  enqueue(a.channelId, () => runChain(a.channelId, [{ agentId: agentRow.id, depth: 99, instruction: task }], { userId: user.id, parentId: msg.id }))
    .then((results) => {
      const updated = getArtifact(a.id);
      if (updated.version > a.version && open.length) {
        run(`UPDATE artifact_comments SET status = 'resolved' WHERE id IN (${open.map(() => '?').join(',')})`, ...open.map((c) => c.id));
        emit('artifact.updated', { channelId: a.channelId, artifactId: a.id, comments: true });
      }
      return results;
    }).catch(() => {});
  return { ok: true, messageId: msg.id };
});

// ------------------------------------------------------------------ translation

import { complete } from './providers/index.js';

r.post('/api/messages/:id/translate', async ({ user, req, params }) => {
  const m = ch.getMessage(params.id) || fail(404, 'Message not found');
  readable(user, m.channelId);
  const { lang = 'zh-TW' } = await readJson(req);
  const target = { 'zh-TW': 'Traditional Chinese (Taiwan)', en: 'English' }[lang] || lang;
  if (m.meta?.translations?.[lang]) return { text: m.meta.translations[lang], cached: true };
  const util = getSetting('utilityModel', null);
  const agent = m.authorType === 'agent' ? agents.getAgent(m.authorId) : null;
  const fallback = agents.listAgents().find((a) => a.providerId);
  const providerId = util?.providerId || agent?.providerId || fallback?.providerId || fail(400, 'No model available for translation');
  const model = util?.providerId ? util.model : (agent || fallback)?.model;
  const text = await complete(providerId, {
    model,
    system: `Translate the user's message into ${target}. Keep markdown, code, links, @mentions and [[...]] placeholders exactly as they are. Output only the translation.`,
    messages: [{ role: 'user', content: m.content }],
  });
  ch.updateMessage(m.id, { meta: { translations: { ...(m.meta?.translations || {}), [lang]: text.trim() } } });
  return { text: text.trim() };
});
