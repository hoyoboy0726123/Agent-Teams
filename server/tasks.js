// Team task board. Humans and agents create tasks; tasks assigned to an agent can be
// executed by that agent, which posts its work back into the channel.
import { all, get, run, id, now, audit } from './db.js';
import { emit } from './bus.js';
import { getAgent, getAgentByHandle } from './agents/store.js';


const toTask = (r) => r && ({
  id: r.id, channelId: r.channel_id, title: r.title, description: r.description, status: r.status,
  assigneeType: r.assignee_type, assigneeId: r.assignee_id, dueAt: r.due_at, createdByType: r.created_by_type,
  createdById: r.created_by_id, sourceMessageId: r.source_message_id, resultMessageId: r.result_message_id,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

export const getTask = (tid) => toTask(get('SELECT * FROM tasks WHERE id = ?', tid));

export function listTasks({ channelIds, status } = {}) {
  let rows = all('SELECT * FROM tasks ORDER BY CASE status WHEN \'doing\' THEN 0 WHEN \'todo\' THEN 1 ELSE 2 END, COALESCE(due_at, 9e15), created_at DESC LIMIT 1000').map(toTask);
  if (channelIds) { const set = new Set(channelIds); rows = rows.filter((t) => !t.channelId || set.has(t.channelId)); }
  if (status) rows = rows.filter((t) => t.status === status);
  return rows;
}

// "@writer" / "writer" / "alice" → { type, id }
export function resolveAssignee(a) {
  if (!a) return { type: null, id: null };
  if (typeof a === 'object') return { type: a.type || null, id: a.id || null };
  const h = String(a).trim().replace(/^@/, '');
  const agent = getAgentByHandle(h);
  if (agent) return { type: 'agent', id: agent.id };
  const u = get('SELECT id FROM users WHERE username = ?', h.toLowerCase());
  return u ? { type: 'user', id: u.id } : { type: null, id: null };
}

const parseDue = (d) => { if (!d) return null; const t = Date.parse(d); return Number.isFinite(t) ? t : null; };

export function createTask({ channelId = null, title, description = '', assignee, due, byType, byId, sourceMessageId = null }) {
  title = String(title || '').trim().slice(0, 200);
  if (!title) throw Object.assign(new Error('Task title required'), { status: 400 });
  const as = resolveAssignee(assignee);
  const tid = id('tsk_');
  const t = now();
  run(`INSERT INTO tasks(id, channel_id, title, description, status, assignee_type, assignee_id, due_at, created_by_type, created_by_id, source_message_id, created_at, updated_at)
       VALUES (?,?,?,?,'todo',?,?,?,?,?,?,?,?)`, tid, channelId, title, String(description).slice(0, 4000), as.type, as.id, parseDue(due), byType, byId ?? null, sourceMessageId, t, t);
  audit(byType, byId, 'task.create', tid, { title });
  emit('task.updated', { channelId, taskId: tid });
  return getTask(tid);
}

export function updateTask(tid, patch, actor) {
  const t = getTask(tid);
  if (!t) return null;
  const as = patch.assignee !== undefined ? resolveAssignee(patch.assignee) : { type: t.assigneeType, id: t.assigneeId };
  run('UPDATE tasks SET title=?, description=?, status=?, assignee_type=?, assignee_id=?, due_at=?, result_message_id=?, updated_at=? WHERE id=?',
    patch.title ?? t.title, patch.description ?? t.description, ['todo', 'doing', 'done'].includes(patch.status) ? patch.status : t.status,
    as.type, as.id, patch.due !== undefined ? parseDue(patch.due) : t.dueAt, patch.resultMessageId ?? t.resultMessageId, now(), tid);
  if (actor) audit(actor.type, actor.id, 'task.update', tid, { status: patch.status });
  emit('task.updated', { channelId: t.channelId, taskId: tid });
  return getTask(tid);
}

export function deleteTask(tid, actor) {
  const t = getTask(tid);
  if (!t) return false;
  run('DELETE FROM tasks WHERE id = ?', tid);
  audit(actor.type, actor.id, 'task.delete', tid, {});
  emit('task.updated', { channelId: t.channelId, taskId: tid, deleted: true });
  return true;
}

// Let the assigned agent do the task inside the task's channel.
export async function executeTask(tid, { user, runChain, enqueue }) {
  const t = getTask(tid);
  if (!t) throw Object.assign(new Error('Task not found'), { status: 404 });
  if (t.assigneeType !== 'agent' || !getAgent(t.assigneeId)) throw Object.assign(new Error('Assign this task to an agent first'), { status: 400 });
  if (!t.channelId) throw Object.assign(new Error('Task has no channel'), { status: 400 });
  updateTask(tid, { status: 'doing' });
  const instruction = `You are completing an assigned task.\nTask: ${t.title}${t.description ? `\nDetails: ${t.description}` : ''}${t.dueAt ? `\nDue: ${new Date(t.dueAt).toISOString().slice(0, 10)}` : ''}\nDeliver the finished work now (use an artifact for documents, decks, dashboards or pages).`;
  const job = enqueue(t.channelId, () => runChain(t.channelId, [{ agentId: t.assigneeId, depth: 0, instruction }], { userId: user?.id }));
  job.then((results) => {
    const done = results.find((m) => m.authorId === t.assigneeId && m.status === 'done');
    updateTask(tid, done ? { status: 'done', resultMessageId: done.id } : { status: 'todo' });
  }).catch(() => updateTask(tid, { status: 'todo' }));
  return { ok: true };
}
