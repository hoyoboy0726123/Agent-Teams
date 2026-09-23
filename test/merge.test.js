// Three-way merge of concurrent artifact edits: humans get auto-merge or a 409 with the merged
// text; agents' output never silently discards a human edit made during their turn.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

const { merge3, diffLines } = await import('../server/artifacts/merge.js');
const app = await boot();
after(() => app.close());
const alice = app.client();
await alice.call('POST', '/api/auth/register', { username: 'alice', password: 'secret123' });

const doc = ['# Plan', '', 'Intro line', '', '## Budget', 'Total: 100', '', '## Team', 'Alice', 'Bob'].join('\n');

test('diffLines finds minimal hunks', () => {
  assert.deepEqual(diffLines(['a', 'b', 'c'], ['a', 'x', 'c']), [{ start: 1, end: 2, lines: ['x'] }]);
  assert.deepEqual(diffLines(['a', 'c'], ['a', 'b', 'c']), [{ start: 1, end: 1, lines: ['b'] }]);
  assert.deepEqual(diffLines(['a', 'b'], ['a', 'b']), []);
});

test('merge3 combines edits to different parts and flags edits to the same lines', () => {
  const ours = doc.replace('Intro line', 'Intro line, rewritten');
  const theirs = doc.replace('Total: 100', 'Total: 250').concat('\nCarol');
  const m = merge3(doc, ours, theirs);
  assert.equal(m.ok, true);
  assert.match(m.text, /Intro line, rewritten/);
  assert.match(m.text, /Total: 250/);
  assert.match(m.text, /Carol$/);

  const same = merge3(doc, doc.replace('Bob', 'Bobby'), doc.replace('Bob', 'Bobby'));
  assert.equal(same.ok, true);

  const clash = merge3(doc, doc.replace('Total: 100', 'Total: 120'), doc.replace('Total: 100', 'Total: 90'), { theirsLabel: 'v3' });
  assert.equal(clash.ok, false);
  assert.equal(clash.conflicts, 1);
  assert.match(clash.text, /<<<<<<< yours\nTotal: 120\n=======\nTotal: 90\n>>>>>>> v3/);

  // Both inserting at the same spot is a conflict, not a silent interleave.
  assert.equal(merge3('a\nb', 'a\nX\nb', 'a\nY\nb').ok, false);
});

test('saving from a stale version merges or returns 409 with the merged text', async () => {
  const { data: a } = await alice.call('POST', '/api/artifacts', { type: 'document', title: 'Plan', content: doc });
  // Bob (same session here) saves v2 first.
  const v2 = (await alice.call('PUT', `/api/artifacts/${a.id}`, { content: doc.replace('Total: 100', 'Total: 250'), baseVersion: 1 })).data;
  assert.equal(v2.version, 2);
  // Alice was still on v1: her edit elsewhere is merged on top of v2.
  const v3 = (await alice.call('PUT', `/api/artifacts/${a.id}`, { content: doc.replace('Intro line', 'Better intro'), baseVersion: 1 })).data;
  assert.equal(v3.version, 3);
  assert.deepEqual(v3.merge, { from: 1, into: 2 });
  assert.match(v3.content, /Better intro/);
  assert.match(v3.content, /Total: 250/);

  // Same line changed on both sides: 409, nothing saved, merged text offered for manual resolution.
  const r = await alice.call('PUT', `/api/artifacts/${a.id}`, { content: doc.replace('Total: 100', 'Total: 999'), baseVersion: 1 });
  assert.equal(r.status, 409);
  assert.equal(r.data.conflict, true);
  assert.equal(r.data.currentVersion, 3);
  assert.match(r.data.merged, /<<<<<<< yours[\s\S]*Total: 999[\s\S]*Total: 250/);
  assert.equal((await alice.call('GET', `/api/artifacts/${a.id}`)).data.version, 3);

  // Explicit overwrite still works.
  const forced = (await alice.call('PUT', `/api/artifacts/${a.id}`, { content: 'restored', baseVersion: 1, force: true })).data;
  assert.equal(forced.version, 4);
  assert.equal(forced.content, 'restored');
});

test('an agent writing a new version keeps a human edit saved during its turn', async () => {
  const { createUser } = await import('../server/users.js');
  const { createChannel } = await import('../server/channels.js');
  const { upsertArtifact, addVersion, getArtifact } = await import('../server/artifacts/store.js');
  const u = createUser({ username: 'agentmerge', password: 'secret123' });
  const c = createChannel({ name: 'merge-room' }, u);
  const a = upsertArtifact({ channelId: c.id, type: 'document', title: 'Spec', content: doc, byType: 'user', byId: u.id });
  const turnStarted = Date.now();
  await new Promise((r) => setTimeout(r, 5));
  addVersion(a.id, { content: doc.replace('Bob', 'Bob (lead)'), byType: 'user', byId: u.id, baseVersion: 1 });
  const out = upsertArtifact({ channelId: c.id, type: 'document', title: 'Spec', content: doc.replace('## Budget', '## Budget (Q3)'), byType: 'agent', byId: 'agt_x', baseAt: turnStarted });
  assert.equal(out.version, 3);
  assert.match(out.content, /Bob \(lead\)/);
  assert.match(out.content, /Budget \(Q3\)/);
  assert.equal(getArtifact(a.id).version, 3);
});
