// Live co-editing: two browsers edit the same artifact through the WebSocket, an agent's new
// version lands in the open document without wiping anyone's typing, and permissions hold.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { boot, waitFor } from './helpers.js';

process.env.COLLAB_IDLE_SAVE_MS = '600000';
const app = await boot();
const owner = app.client();
await owner.call('POST', '/api/auth/register', { username: 'owner', password: 'secret123' });
const { addVersion, getArtifact } = await import('../server/artifacts/store.js');
const sockets = [];
after(async () => { for (const s of sockets) s.close(); await app.close(); });

async function member(username, role = 'member') {
  const c = app.client();
  await owner.call('POST', '/api/users', { username, password: 'secret123', role });
  await c.call('POST', '/api/auth/login', { username, password: 'secret123' });
  return c;
}

// A minimal collaborating client: joins, mirrors the shared doc, sends its own edits.
async function join(client, artifactId) {
  const ws = new WebSocket(`${app.base.replace('http', 'ws')}/ws`, { headers: { cookie: client.cookie } });
  sockets.push(ws);
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  const doc = new Y.Doc();
  const inbox = [];
  const peer = { ws, doc, text: doc.getText('content'), inbox, synced: null };
  doc.on('update', (u, origin) => { if (origin !== 'remote') ws.send(JSON.stringify({ kind: 'doc.update', artifactId, update: Buffer.from(u).toString('base64') })); });
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (!m.kind?.startsWith('doc.')) return;
    inbox.push(m);
    if (m.kind === 'doc.sync') { Y.applyUpdate(doc, Buffer.from(m.state, 'base64'), 'remote'); peer.synced = m; }
    if (m.kind === 'doc.update') Y.applyUpdate(doc, Buffer.from(m.update, 'base64'), 'remote');
  });
  ws.send(JSON.stringify({ kind: 'doc.join', artifactId }));
  await waitFor(() => peer.synced || inbox.find((m) => m.kind === 'doc.error'));
  return peer;
}
const send = (p, msg) => p.ws.send(JSON.stringify(msg));

test('two editors converge, save a version, and see an agent revision merge live', async () => {
  const bob = await member('bob');
  const start = 'Title\n\nParagraph one.\n\nParagraph two.\n\nFooter';
  const { data: a } = await owner.call('POST', '/api/artifacts', { type: 'document', title: 'Shared', content: start });
  const A = await join(owner, a.id);
  const B = await join(bob, a.id);
  assert.equal(A.text.toString(), start);
  assert.equal(A.synced.readOnly, false);

  // Concurrent typing in different places.
  A.text.insert(A.text.toString().indexOf('one.') + 4, ' (Alice)');
  B.text.insert(B.text.toString().indexOf('two.') + 4, ' (Bob)');
  await waitFor(() => A.text.toString() === B.text.toString() && A.text.toString().includes('(Bob)') && A.text.toString().includes('(Alice)'));

  // An agent writes v2 from v1 (it never saw the typing): its change merges into the live doc.
  const agentVersion = start.replace('Title', 'Better title').replace('Footer', 'Footer — contact us');
  const v2 = addVersion(a.id, { content: agentVersion, byType: 'agent', byId: 'agt_x', baseVersion: 1 });
  assert.equal(v2.version, 2);
  for (const s of ['Better title', '(Alice)', '(Bob)', 'contact us']) assert.ok(v2.content.includes(s), s);
  await waitFor(() => A.text.toString() === v2.content && B.text.toString() === v2.content);
  assert.ok(A.inbox.some((m) => m.kind === 'doc.saved' && m.version === 2 && m.external));

  // More typing, then an explicit save.
  B.text.insert(0, '# ');
  await waitFor(() => A.text.toString().startsWith('# '));
  send(A, { kind: 'doc.save', artifactId: a.id });
  await waitFor(() => B.inbox.some((m) => m.kind === 'doc.saved' && m.version === 3));
  assert.equal(getArtifact(a.id).content, A.text.toString());

  // REST saves from someone not in the room merge too (no 409).
  const put = await owner.call('PUT', `/api/artifacts/${a.id}`, { content: getArtifact(a.id).content + '\nAppendix', baseVersion: 3 });
  assert.equal(put.status, 200);
  await waitFor(() => B.text.toString().endsWith('Appendix'));

  // The last editor leaving saves pending changes.
  A.text.insert(A.text.toString().length, '\nPS');
  await waitFor(() => B.text.toString().endsWith('PS'));
  send(A, { kind: 'doc.leave', artifactId: a.id });
  send(B, { kind: 'doc.leave', artifactId: a.id });
  await waitFor(() => getArtifact(a.id).content.endsWith('PS'));
});

test('guests are read-only and private artifacts stay private', async () => {
  const guest = await member('gwen', 'guest');
  const { data: a } = await owner.call('POST', '/api/artifacts', { type: 'document', title: 'Guest view', content: 'hello' });
  const G = await join(guest, a.id);
  assert.equal(G.synced.readOnly, true);
  G.text.insert(0, 'hacked ');
  await waitFor(() => G.inbox.some((m) => m.kind === 'doc.error' && /Read-only/.test(m.error)));
  const A = await join(owner, a.id);
  assert.equal(A.text.toString(), 'hello');

  const { data: ch } = await owner.call('POST', '/api/channels', { name: 'secret-room', private: true });
  const { data: secret } = await owner.call('POST', '/api/artifacts', { channelId: ch.id, type: 'document', title: 'Secret', content: 'classified' });
  const outsider = await member('otto');
  const O = await join(outsider, secret.id);
  assert.equal(O.synced, null);
  assert.equal(O.inbox[0].kind, 'doc.error');
  assert.equal(O.text.toString(), '');
});
