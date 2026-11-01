// Channels, membership, messages and access control.
import { all, get, run, id, now, json, audit } from './db.js';
import { atLeast } from './users.js';
import { emit } from './bus.js';

const toChannel = (r) => r && ({
  id: r.id, name: r.name, topic: r.topic, kind: r.kind, private: !!r.private, mode: r.mode,
  memoryEnabled: !!r.memory_enabled, summary: r.summary, createdBy: r.created_by, createdAt: r.created_at, archived: !!r.archived,
});

export const toMessage = (r) => r && ({
  id: r.id, channelId: r.channel_id, authorType: r.author_type, authorId: r.author_id, content: r.content,
  parentId: r.parent_id, status: r.status, meta: json(r.meta_json, {}), createdAt: r.created_at,
});

export const getChannel = (cid) => toChannel(get('SELECT * FROM channels WHERE id = ?', cid));

export function members(cid) {
  const rows = all('SELECT member_type, member_id FROM channel_members WHERE channel_id = ?', cid);
  return { users: rows.filter((r) => r.member_type === 'user').map((r) => r.member_id), agents: rows.filter((r) => r.member_type === 'agent').map((r) => r.member_id) };
}

export const isMember = (cid, type, mid) => !!get('SELECT 1 FROM channel_members WHERE channel_id = ? AND member_type = ? AND member_id = ?', cid, type, mid);

export function canRead(user, ch) {
  if (!ch || !user) return false;
  if (isMember(ch.id, 'user', user.id)) return true;
  if (ch.kind === 'dm') return false;
  if (atLeast(user, 'admin')) return true;
  return !ch.private && user.role !== 'guest';
}
export const canManage = (user, ch) => atLeast(user, 'admin') || ch.createdBy === user.id;

export function listChannelsFor(user) {
  return all('SELECT * FROM channels WHERE archived = 0 ORDER BY kind, name').map(toChannel)
    .filter((c) => canRead(user, c))
    .map((c) => ({ ...c, members: members(c.id), joined: isMember(c.id, 'user', user.id), unreadHint: lastMessageAt(c.id) }));
}

const lastMessageAt = (cid) => get('SELECT MAX(created_at) AS t FROM messages WHERE channel_id = ?', cid).t || 0;

export function createChannel({ name, topic = '', kind = 'channel', isPrivate = false, mode = 'auto', agentIds = [], userIds = [] }, user) {
  name = String(name || '').trim().slice(0, 80);
  if (!name) throw Object.assign(new Error('Channel name required'), { status: 400 });
  const cid = id('ch_');
  run('INSERT INTO channels(id, name, topic, kind, private, mode, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
    cid, name, topic, kind, isPrivate || kind === 'dm' ? 1 : 0, ['mention', 'auto', 'roundtable'].includes(mode) ? mode : 'auto', user?.id ?? null, now());
  addMember(cid, 'user', user.id);
  for (const u of userIds) addMember(cid, 'user', u);
  for (const a of agentIds) addMember(cid, 'agent', a);
  audit('user', user.id, 'channel.create', cid, { name });
  const ch = getChannel(cid);
  emit('channel.updated', { channelId: cid });
  return ch;
}

export function updateChannel(cid, patch, user) {
  const c = getChannel(cid);
  if (!c) return null;
  run('UPDATE channels SET name = ?, topic = ?, private = ?, mode = ?, memory_enabled = ?, archived = ? WHERE id = ?',
    patch.name ?? c.name, patch.topic ?? c.topic, patch.private != null ? (patch.private ? 1 : 0) : c.private ? 1 : 0,
    ['mention', 'auto', 'roundtable'].includes(patch.mode) ? patch.mode : c.mode,
    patch.memoryEnabled != null ? (patch.memoryEnabled ? 1 : 0) : c.memoryEnabled ? 1 : 0,
    patch.archived != null ? (patch.archived ? 1 : 0) : c.archived ? 1 : 0, cid);
  audit('user', user?.id, 'channel.update', cid, patch);
  emit('channel.updated', { channelId: cid });
  return getChannel(cid);
}

export function deleteChannel(cid, user) {
  run('DELETE FROM channels WHERE id = ?', cid);
  audit('user', user?.id, 'channel.delete', cid, {});
  emit('channel.updated', { channelId: cid, deleted: true });
}

export function addMember(cid, type, mid) {
  run('INSERT OR IGNORE INTO channel_members(channel_id, member_type, member_id) VALUES (?,?,?)', cid, type, mid);
  emit('channel.updated', { channelId: cid });
}
export function removeMember(cid, type, mid) {
  run('DELETE FROM channel_members WHERE channel_id = ? AND member_type = ? AND member_id = ?', cid, type, mid);
  emit('channel.updated', { channelId: cid });
}

export function listMessages(cid, { before, limit = 60 } = {}) {
  const rows = before
    ? all('SELECT * FROM messages WHERE channel_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?', cid, before, limit)
    : all('SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?', cid, limit);
  return rows.reverse().map(toMessage);
}

export const getMessage = (mid) => toMessage(get('SELECT * FROM messages WHERE id = ?', mid));

let lastTs = 0;
const monotonic = () => (lastTs = Math.max(now(), lastTs + 1));

export function createMessage({ channelId, authorType, authorId, content, parentId = null, status = 'done', meta = {} }) {
  const mid = id('msg_');
  run('INSERT INTO messages(id, channel_id, author_type, author_id, content, parent_id, status, meta_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    mid, channelId, authorType, authorId ?? null, content, parentId, status, JSON.stringify(meta), monotonic());
  const m = getMessage(mid);
  emit('message.created', { channelId, message: m });
  return m;
}

export function updateMessage(mid, patch) {
  const m = getMessage(mid);
  if (!m) return null;
  run('UPDATE messages SET content = ?, status = ?, meta_json = ? WHERE id = ?',
    patch.content ?? m.content, patch.status ?? m.status, JSON.stringify({ ...m.meta, ...(patch.meta || {}) }), mid);
  const u = getMessage(mid);
  emit('message.updated', { channelId: m.channelId, message: u });
  return u;
}

export function deleteMessage(mid) {
  const m = getMessage(mid);
  if (!m) return false;
  run('DELETE FROM messages WHERE id = ?', mid);
  emit('message.deleted', { channelId: m.channelId, messageId: mid });
  return true;
}

export function searchMessages(user, q, limit = 50) {
  const visible = listChannelsFor(user).map((c) => c.id);
  if (!visible.length || !q) return [];
  const rows = all(`SELECT * FROM messages WHERE channel_id IN (${visible.map(() => '?').join(',')}) AND content LIKE ? ORDER BY created_at DESC LIMIT ?`,
    ...visible, `%${q}%`, limit);
  return rows.map(toMessage);
}
