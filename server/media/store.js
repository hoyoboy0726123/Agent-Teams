// Generated media (AI video clips, narration, exported videos) stored under the data dir.
// Clips are served at unguessable /media/<token>.<ext> URLs so sandboxed previews can load them.
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { get, all, run, id, now, json } from '../db.js';

export const mediaDir = (sub = 'media') => { const d = join(config.dataDir, sub); mkdirSync(d, { recursive: true }); return d; };

const MIME = { mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
export const mimeFor = (ext) => MIME[ext] || 'application/octet-stream';

const toMedia = (r) => r && ({
  id: r.id, kind: r.kind, mime: r.mime, bytes: r.bytes, channelId: r.channel_id, meta: json(r.meta_json, {}),
  url: `/media/${r.token}.${r.file.split('.').pop()}`, path: join(mediaDir(), r.file), createdAt: r.created_at,
});

export function saveMedia({ buf, ext, kind = 'video', channelId = null, meta = {}, byType = null, byId = null }) {
  const mid = id('med_');
  const token = randomBytes(18).toString('base64url');
  const file = `${mid}.${ext}`;
  writeFileSync(join(mediaDir(), file), buf);
  run('INSERT INTO media(id, token, kind, mime, file, bytes, channel_id, meta_json, created_by_type, created_by_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    mid, token, kind, mimeFor(ext), file, buf.length, channelId, JSON.stringify(meta), byType, byId, now());
  return getMedia(mid);
}

export const getMedia = (mid) => toMedia(get('SELECT * FROM media WHERE id = ?', mid));
export const mediaByToken = (token) => toMedia(get('SELECT * FROM media WHERE token = ?', token));
export const listMedia = (channelIds) => all('SELECT * FROM media ORDER BY created_at DESC LIMIT 200').map(toMedia).filter((m) => !m.channelId || channelIds.includes(m.channelId));

// "/media/<token>.mp4" (or a full URL on this server) → local file path, if it is ours.
export function localMediaPath(url) {
  const m = /\/media\/([A-Za-z0-9_-]{20,})\.\w+$/.exec(String(url || ''));
  const row = m && mediaByToken(m[1]);
  return row && existsSync(row.path) ? row.path : null;
}

export function deleteMedia(mid) {
  const m = getMedia(mid);
  if (!m) return false;
  rmSync(m.path, { force: true });
  run('DELETE FROM media WHERE id = ?', mid);
  return true;
}
