// Persistent, governable memory. Every memory has an explicit scope, provenance,
// optional expiry, and can be listed / edited / pinned / deleted / exported by humans.
import { all, get, run, id, now, audit } from '../db.js';
import { bm25, similarity } from './search.js';

export const SCOPES = ['workspace', 'channel', 'agent', 'user'];

const toMemory = (r) => r && ({
  id: r.id, scope: r.scope, scopeId: r.scope_id, content: r.content, sourceMessageId: r.source_message_id,
  createdByType: r.created_by_type, createdById: r.created_by_id, pinned: !!r.pinned,
  expiresAt: r.expires_at, createdAt: r.created_at, updatedAt: r.updated_at,
});

const LIVE = '(expires_at IS NULL OR expires_at > ?)';

export function purgeExpired() {
  return run('DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at <= ?', now()).changes;
}

// Which (scope, scopeId) pairs a given context is allowed to read.
export function visibleScopes({ channelId, agentId, userId }) {
  const s = [['workspace', null]];
  if (channelId) s.push(['channel', channelId]);
  if (agentId) s.push(['agent', agentId]);
  if (userId) s.push(['user', userId]);
  return s;
}

function scopeWhere(scopes) {
  const parts = scopes.map(([s, sid]) => (sid == null ? '(scope = ? AND scope_id IS NULL)' : '(scope = ? AND scope_id = ?)'));
  const params = scopes.flatMap(([s, sid]) => (sid == null ? [s] : [s, sid]));
  return { sql: parts.join(' OR '), params };
}

export function listMemories({ scopes, q, limit = 200 }) {
  const w = scopeWhere(scopes);
  const rows = all(`SELECT * FROM memories WHERE (${w.sql}) AND ${LIVE} ORDER BY pinned DESC, updated_at DESC LIMIT ?`, ...w.params, now(), 2000);
  let list = rows.map(toMemory);
  if (q) {
    const hits = new Map(bm25(q, list.map((m) => ({ id: m.id, text: m.content }))).map((h) => [h.id, h.score]));
    list = list.filter((m) => hits.has(m.id) || m.content.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (hits.get(b.id) || 0) - (hits.get(a.id) || 0));
  }
  return list.slice(0, limit);
}

// Retrieval for prompt context: pinned first, then BM25 matches, then a little recency.
export function recall({ scopes, query, limit = 12 }) {
  const all_ = listMemories({ scopes, limit: 2000 });
  const pinned = all_.filter((m) => m.pinned).slice(0, 8);
  const rest = all_.filter((m) => !m.pinned);
  const scored = bm25(query || '', rest.map((m) => ({ id: m.id, text: m.content, m })));
  const picked = new Set(pinned.map((m) => m.id));
  const out = [...pinned];
  for (const h of scored) { if (out.length >= limit) break; if (!picked.has(h.id)) { out.push(h.m); picked.add(h.id); } }
  // Always surface a few of the most recent memories too (continuity even with no keyword overlap).
  let recent = 0;
  for (const m of rest) { if (out.length >= limit || recent >= 4) break; if (!picked.has(m.id)) { out.push(m); picked.add(m.id); recent++; } }
  return out;
}

export function getMemory(mid) { return toMemory(get('SELECT * FROM memories WHERE id = ?', mid)); }

// Adds a memory unless a near-duplicate already exists in the same scope (then refreshes it).
export function addMemory({ scope, scopeId = null, content, sourceMessageId = null, byType, byId = null, pinned = false, ttlDays = null }) {
  if (!SCOPES.includes(scope)) throw Object.assign(new Error('Invalid memory scope'), { status: 400 });
  content = String(content || '').trim().slice(0, 2000);
  if (!content) return null;
  const same = all('SELECT * FROM memories WHERE scope = ? AND scope_id IS ? ORDER BY updated_at DESC LIMIT 500', scope, scopeId);
  const dup = same.find((r) => similarity(r.content, content) >= 0.8);
  const t = now();
  if (dup) {
    run('UPDATE memories SET updated_at = ?, content = ? WHERE id = ?', t, content.length >= dup.content.length ? content : dup.content, dup.id);
    return getMemory(dup.id);
  }
  const mid = id('mem_');
  run(`INSERT INTO memories(id, scope, scope_id, content, source_message_id, created_by_type, created_by_id, pinned, expires_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    mid, scope, scopeId, content, sourceMessageId, byType, byId, pinned ? 1 : 0, ttlDays ? t + ttlDays * 86400000 : null, t, t);
  audit(byType, byId, 'memory.create', mid, { scope, scopeId });
  return getMemory(mid);
}

export function updateMemory(mid, patch, actor) {
  const m = getMemory(mid);
  if (!m) return null;
  run('UPDATE memories SET content = ?, pinned = ?, expires_at = ?, updated_at = ? WHERE id = ?',
    patch.content != null ? String(patch.content).slice(0, 2000) : m.content,
    patch.pinned != null ? (patch.pinned ? 1 : 0) : m.pinned ? 1 : 0,
    patch.ttlDays !== undefined ? (patch.ttlDays ? now() + patch.ttlDays * 86400000 : null) : m.expiresAt,
    now(), mid);
  audit(actor.type, actor.id, 'memory.update', mid, {});
  return getMemory(mid);
}

export function deleteMemory(mid, actor) {
  const ok = run('DELETE FROM memories WHERE id = ?', mid).changes > 0;
  if (ok) audit(actor.type, actor.id, 'memory.delete', mid, {});
  return ok;
}

export function clearScope(scope, scopeId, actor) {
  const n = run('DELETE FROM memories WHERE scope = ? AND scope_id IS ?', scope, scopeId ?? null).changes;
  audit(actor.type, actor.id, 'memory.clear', `${scope}:${scopeId ?? ''}`, { deleted: n });
  return n;
}
