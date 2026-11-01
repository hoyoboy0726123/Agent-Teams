// Real-time co-editing of artifacts with Yjs (CRDT) over the app's WebSocket.
// One room per artifact holds the shared document while anyone has it open. Edits merge
// character by character; cursors travel as awareness updates. The room is saved as a normal
// version when asked, after a quiet minute, and when the last editor leaves. Versions written
// by agents or the REST API while a room is open are merged into it instead of replacing it.
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { randomBytes } from 'node:crypto';
import { getArtifact, addVersion, setLiveMerge, versionContent } from './artifacts/store.js';
import { getChannel, canRead } from './channels.js';
import { diffLines, merge3 } from './artifacts/merge.js';

const IDLE_SAVE_MS = Number(process.env.COLLAB_IDLE_SAVE_MS || 60_000);
const ROOM_TTL_MS = 10 * 60_000;
const rooms = new Map(); // artifactId → room

const b64 = (u8) => Buffer.from(u8).toString('base64');
const u8 = (s) => new Uint8Array(Buffer.from(String(s || ''), 'base64'));
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

function canOpen(user, a) {
  if (!a || !user) return false;
  if (!a.channelId) return true;
  const c = getChannel(a.channelId);
  return !!c && canRead(user, c);
}

function openRoom(a) {
  let room = rooms.get(a.id);
  if (room) { clearTimeout(room.ttl); return room; }
  const doc = new Y.Doc();
  const text = doc.getText('content');
  text.insert(0, a.content);
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);
  awareness._checkInterval?.unref?.();
  room = {
    id: randomBytes(6).toString('hex'), artifactId: a.id, channelId: a.channelId, doc, text, awareness,
    sockets: new Set(), version: a.version, saved: a.content, editors: new Set(), lastEditor: null,
    forks: new Map([[a.version, Y.encodeStateAsUpdate(doc)]]), idle: null, ttl: null,
  };
  doc.on('update', (update, origin) => {
    for (const ws of room.sockets) if (ws !== origin) send(ws, { kind: 'doc.update', artifactId: a.id, update: b64(update) });
    if (origin !== 'external') {
      clearTimeout(room.idle);
      room.idle = setTimeout(() => save(room), IDLE_SAVE_MS);
      room.idle.unref?.();
    }
  });
  awareness.on('update', ({ added, updated, removed }, origin) => {
    if (origin && typeof origin === 'object' && origin.collabClients) for (const c of [...added, ...updated]) origin.collabClients.add(`${a.id}:${c}`);
    const changed = [...added, ...updated, ...removed];
    const update = b64(awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
    for (const ws of room.sockets) if (ws !== origin) send(ws, { kind: 'doc.awareness', artifactId: a.id, update });
  });
  rooms.set(a.id, room);
  return room;
}

// Save the shared text as a new version (no-op when unchanged).
export function save(room, user = null) {
  clearTimeout(room.idle);
  const content = room.text.toString();
  if (content === room.saved) return room.version;
  const byId = user?.id || room.lastEditor;
  const a = addVersion(room.artifactId, { content, byType: 'user', byId, live: false });
  if (!a) return room.version;
  room.version = a.version;
  room.saved = content;
  room.forks.set(a.version, Y.encodeStateAsUpdate(room.doc));
  for (const ws of room.sockets) send(ws, { kind: 'doc.saved', artifactId: room.artifactId, version: a.version, by: byId });
  return a.version;
}

function leave(room, ws) {
  room.sockets.delete(ws);
  const mine = [...(ws.collabClients || [])].filter((k) => k.startsWith(`${room.artifactId}:`)).map((k) => Number(k.split(':')[1]));
  if (mine.length) awarenessProtocol.removeAwarenessStates(room.awareness, mine, 'leave');
  for (const k of [...(ws.collabClients || [])]) if (k.startsWith(`${room.artifactId}:`)) ws.collabClients.delete(k);
  if (!room.sockets.size) {
    save(room);
    room.ttl = setTimeout(() => { if (!room.sockets.size) { rooms.delete(room.artifactId); room.awareness.destroy(); room.doc.destroy(); } }, ROOM_TTL_MS);
    room.ttl.unref?.();
  }
}

// WebSocket messages with kind "doc.*" (see ws.js).
export function handleCollabMessage(ws, m) {
  const user = ws.user;
  ws.collabClients ||= new Set();
  ws.collabRooms ||= new Set();
  const aid = String(m.artifactId || '');
  if (m.kind === 'doc.join') {
    const a = getArtifact(aid);
    if (!canOpen(user, a)) return send(ws, { kind: 'doc.error', artifactId: aid, error: 'Artifact not found' });
    const room = openRoom(a);
    room.sockets.add(ws);
    ws.collabRooms.add(aid);
    const states = [...room.awareness.getStates().keys()];
    send(ws, {
      kind: 'doc.sync', artifactId: aid, roomId: room.id, version: room.version, readOnly: user.role === 'guest',
      state: b64(Y.encodeStateAsUpdate(room.doc)),
      awareness: states.length ? b64(awarenessProtocol.encodeAwarenessUpdate(room.awareness, states)) : null,
    });
    return;
  }
  const room = rooms.get(aid);
  if (!room || !room.sockets.has(ws)) return;
  if (m.kind === 'doc.update') {
    if (user.role === 'guest') return send(ws, { kind: 'doc.error', artifactId: aid, error: 'Read-only' });
    try {
      Y.applyUpdate(room.doc, u8(m.update), ws);
      room.editors.add(user.id);
      room.lastEditor = user.id;
    } catch { send(ws, { kind: 'doc.error', artifactId: aid, error: 'Bad update' }); }
  } else if (m.kind === 'doc.awareness') {
    try { awarenessProtocol.applyAwarenessUpdate(room.awareness, u8(m.update), ws); } catch {}
  } else if (m.kind === 'doc.save') {
    if (user.role !== 'guest') save(room, user);
  } else if (m.kind === 'doc.leave') {
    ws.collabRooms.delete(aid);
    leave(room, ws);
  }
}

export function onSocketClose(ws) {
  for (const aid of ws.collabRooms || []) { const room = rooms.get(aid); if (room) leave(room, ws); }
}

// Turn `ytext` into `next` with small edits: line diff first, then trim each changed block to
// the characters that really differ, so concurrent edits elsewhere are untouched.
export function applyTextDiff(ytext, next) {
  const tok = (s) => s.match(/[^\n]*\n|[^\n]+$/g) || [];
  const prev = ytext.toString();
  const a = tok(prev), b = tok(next);
  const offsets = [0];
  for (const t of a) offsets.push(offsets.at(-1) + t.length);
  for (const h of diffLines(a, b).reverse()) {
    let from = offsets[h.start];
    let oldSeg = a.slice(h.start, h.end).join('');
    let newSeg = h.lines.join('');
    let p = 0;
    while (p < oldSeg.length && p < newSeg.length && oldSeg[p] === newSeg[p]) p++;
    let q = 0;
    while (q < oldSeg.length - p && q < newSeg.length - p && oldSeg[oldSeg.length - 1 - q] === newSeg[newSeg.length - 1 - q]) q++;
    from += p;
    oldSeg = oldSeg.slice(p, oldSeg.length - q);
    newSeg = newSeg.slice(p, newSeg.length - q);
    if (oldSeg.length) ytext.delete(from, oldSeg.length);
    if (newSeg.length) ytext.insert(from, newSeg);
  }
}

// A version arriving from elsewhere (agent, REST) while people are editing: replay its change
// against the room state of the version it was based on, then merge that into the live document.
setLiveMerge((aid, { content, baseVersion }) => {
  const room = rooms.get(aid);
  if (!room) return null;
  let base = baseVersion;
  if (!room.forks.has(base)) {
    // Based on a version older than the room: rebase the change onto the room's version first.
    const baseText = versionContent(aid, baseVersion);
    base = room.version;
    if (baseText != null) content = merge3(baseText, content, versionContent(aid, base) ?? room.saved, { prefer: 'ours' }).text;
  }
  const fork = new Y.Doc();
  Y.applyUpdate(fork, room.forks.get(base));
  const before = Y.encodeStateVector(fork);
  fork.transact(() => applyTextDiff(fork.getText('content'), content));
  Y.applyUpdate(room.doc, Y.encodeStateAsUpdate(fork, before), 'external');
  fork.destroy();
  const merged = room.text.toString();
  return {
    content: merged,
    saved(version) {
      room.version = version;
      room.saved = merged;
      room.forks.set(version, Y.encodeStateAsUpdate(room.doc));
      for (const ws of room.sockets) send(ws, { kind: 'doc.saved', artifactId: aid, version, external: true });
    },
  };
});

export const roomInfo = (aid) => {
  const r = rooms.get(aid);
  return r && { version: r.version, sockets: r.sockets.size, text: r.text.toString(), dirty: r.text.toString() !== r.saved };
};

export function flushAll() { for (const r of rooms.values()) save(r); }
