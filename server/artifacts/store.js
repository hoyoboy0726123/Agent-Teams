// Versioned artifacts produced by agents or humans: documents, research reports,
// slide decks, dashboards and websites.
import { all, get, run, id, now, audit, tx } from '../db.js';
import { emit } from '../bus.js';
import { merge3 } from './merge.js';

export const TYPES = ['document', 'research', 'slides', 'dashboard', 'website', 'video'];

const toArtifact = (r) => r && ({
  id: r.id, channelId: r.channel_id, type: r.type, title: r.title, createdByType: r.created_by_type,
  createdById: r.created_by_id, version: r.current_version, createdAt: r.created_at, updatedAt: r.updated_at,
  shareToken: r.share_token || null,
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

export const versionContent = (aid, version) => get('SELECT content FROM artifact_versions WHERE artifact_id = ? AND version = ?', aid, version)?.content;

// Newest version that existed at a point in time (what an agent saw when its turn started).
export const versionAt = (aid, t) => get('SELECT max(version) AS v FROM artifact_versions WHERE artifact_id = ? AND created_at <= ?', aid, t)?.v || null;

// Hook for live collaboration: when people are editing the artifact right now, a new version
// is merged into their shared document instead of replacing it (set by collab.js).
let liveMerge = null;
export const setLiveMerge = (fn) => { liveMerge = fn; };

// `baseVersion` is the version the author started from. If someone saved in between, the two
// edits are three-way merged. Humans get a 409 on a real conflict (unless `force`); agents' output
// is kept as the new version (the human's edit stays in history) and the conflict is reported.
export function addVersion(aid, { content, title, byType, byId, baseVersion, force = false }) {
  const a = getArtifact(aid);
  if (!a) return null;
  let merge = null;
  const live = liveMerge?.(aid, { content, baseVersion: baseVersion || a.version, byType, byId });
  if (live != null) { content = live; merge = { live: true }; }
  else if (baseVersion && baseVersion < a.version && !force) {
    const base = versionContent(aid, baseVersion) ?? '';
    const m = merge3(base, content, a.content, { oursLabel: byType === 'agent' ? 'agent' : 'yours', theirsLabel: `v${a.version}` });
    if (m.ok) { content = m.text; merge = { from: baseVersion, into: a.version }; }
    else if (byType === 'user') {
      throw Object.assign(new Error(`Someone saved v${a.version} while you were editing v${baseVersion}`), {
        status: 409, body: { conflict: true, currentVersion: a.version, merged: m.text, conflicts: m.conflicts },
      });
    } else merge = { from: baseVersion, into: a.version, conflicts: m.conflicts, kept: 'agent' };
  }
  if (content === a.content && (!title || title === a.title)) return { ...a, merge, unchanged: true };
  const v = a.version + 1;
  const t = now();
  tx(() => {
    run('INSERT INTO artifact_versions(artifact_id, version, content, author_type, author_id, created_at) VALUES (?,?,?,?,?,?)', aid, v, content, byType, byId, t);
    run('UPDATE artifacts SET current_version = ?, updated_at = ?, title = ? WHERE id = ?', v, t, title || a.title, aid);
  });
  audit(byType, byId, 'artifact.version', aid, { version: v, ...(merge ? { merge } : {}) });
  emit('artifact.updated', { channelId: a.channelId, artifactId: aid });
  return { ...getArtifact(aid), merge };
}

// Create, or add a new version if an artifact with the same title exists in the channel.
export function upsertArtifact({ channelId, type, title, content, byType, byId, baseAt }) {
  const existing = findByTitle(channelId, title);
  if (!existing) return createArtifact({ channelId, type, title, content, byType, byId });
  return addVersion(existing.id, { content, byType, byId, baseVersion: baseAt ? versionAt(existing.id, baseAt) || undefined : undefined });
}

export function deleteArtifact(aid, actor) {
  const a = getArtifact(aid);
  if (!a) return false;
  run('DELETE FROM artifacts WHERE id = ?', aid);
  audit(actor.type, actor.id, 'artifact.delete', aid, {});
  emit('artifact.updated', { channelId: a.channelId, artifactId: aid, deleted: true });
  return true;
}
