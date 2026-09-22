// Versioned artifacts produced by agents or humans: documents, research reports,
// slide decks, dashboards and websites.
import { all, get, run, id, now, audit, tx } from '../db.js';
import { emit } from '../bus.js';

export const TYPES = ['document', 'research', 'slides', 'dashboard', 'website'];

const toArtifact = (r) => r && ({
  id: r.id, channelId: r.channel_id, type: r.type, title: r.title, createdByType: r.created_by_type,
  createdById: r.created_by_id, version: r.current_version, createdAt: r.created_at, updatedAt: r.updated_at,
});

export function listArtifacts({ channelIds, q } = {}) {
  let rows = all('SELECT * FROM artifacts ORDER BY updated_at DESC LIMIT 500').map(toArtifact);
  if (channelIds) { const set = new Set(channelIds); rows = rows.filter((a) => !a.channelId || set.has(a.channelId)); }
  if (q) rows = rows.filter((a) => a.title.toLowerCase().includes(q.toLowerCase()));
  return rows;
}

export function getArtifact(aid, version) {
  const a = toArtifact(get('SELECT * FROM artifacts WHERE id = ?', aid));
  if (!a) return null;
  const v = get('SELECT * FROM artifact_versions WHERE artifact_id = ? AND version = ?', aid, version || a.version);
  const versions = all('SELECT version, author_type, author_id, created_at FROM artifact_versions WHERE artifact_id = ? ORDER BY version DESC', aid)
    .map((r) => ({ version: r.version, authorType: r.author_type, authorId: r.author_id, createdAt: r.created_at }));
  return { ...a, content: v?.content ?? '', viewing: v?.version ?? a.version, versions };
}

export function findByTitle(channelId, title) {
  return toArtifact(get('SELECT * FROM artifacts WHERE channel_id IS ? AND lower(title) = lower(?) ORDER BY updated_at DESC LIMIT 1', channelId, title));
}

export function createArtifact({ channelId = null, type, title, content, byType, byId }) {
  if (!TYPES.includes(type)) type = 'document';
  title = String(title || 'Untitled').slice(0, 120);
  const aid = id('art_');
  const t = now();
  tx(() => {
    run('INSERT INTO artifacts(id, channel_id, type, title, created_by_type, created_by_id, current_version, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)',
      aid, channelId, type, title, byType, byId, t, t);
    run('INSERT INTO artifact_versions(artifact_id, version, content, author_type, author_id, created_at) VALUES (?,?,?,?,?,?)', aid, 1, content, byType, byId, t);
  });
  audit(byType, byId, 'artifact.create', aid, { type, title });
  emit('artifact.updated', { channelId, artifactId: aid });
  return getArtifact(aid);
}

export function addVersion(aid, { content, title, byType, byId }) {
  const a = getArtifact(aid);
  if (!a) return null;
  const v = a.version + 1;
  const t = now();
  tx(() => {
    run('INSERT INTO artifact_versions(artifact_id, version, content, author_type, author_id, created_at) VALUES (?,?,?,?,?,?)', aid, v, content, byType, byId, t);
    run('UPDATE artifacts SET current_version = ?, updated_at = ?, title = ? WHERE id = ?', v, t, title || a.title, aid);
  });
  audit(byType, byId, 'artifact.version', aid, { version: v });
  emit('artifact.updated', { channelId: a.channelId, artifactId: aid });
  return getArtifact(aid);
}

// Create, or add a new version if an artifact with the same title exists in the channel.
export function upsertArtifact({ channelId, type, title, content, byType, byId }) {
  const existing = findByTitle(channelId, title);
  return existing ? addVersion(existing.id, { content, byType, byId }) : createArtifact({ channelId, type, title, content, byType, byId });
}

export function deleteArtifact(aid, actor) {
  const a = getArtifact(aid);
  if (!a) return false;
  run('DELETE FROM artifacts WHERE id = ?', aid);
  audit(actor.type, actor.id, 'artifact.delete', aid, {});
  emit('artifact.updated', { channelId: a.channelId, artifactId: aid, deleted: true });
  return true;
}
