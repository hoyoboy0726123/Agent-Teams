import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, waitFor } from './helpers.js';

let app, owner, st;
before(async () => {
  app = await boot();
  owner = app.client();
  const r = await owner.call('POST', '/api/auth/register', { username: 'alice', password: 'secret123', displayName: 'Alice' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, 'owner');
  st = (await owner.call('GET', '/api/state')).data;
});
after(() => app.close());

const general = () => st.channels.find((c) => c.name === 'general');
const messages = async (cid) => (await owner.call('GET', `/api/channels/${cid}/messages`)).data;

test('first run seeds a team, channels and the demo provider', () => {
  assert.ok(st.agents.length >= 5);
  assert.ok(general());
  assert.equal(st.providers[0].type, 'demo');
  assert.ok(st.agents.every((a) => a.providerId === st.providers[0].id));
});

test('registration is closed after the owner signs up; login works', async () => {
  const bob = app.client();
  assert.equal((await bob.call('POST', '/api/auth/register', { username: 'bob', password: 'secret123' })).status, 403);
  assert.equal((await owner.call('POST', '/api/users', { username: 'bob', password: 'secret123', role: 'member' })).status, 200);
  assert.equal((await bob.call('POST', '/api/auth/login', { username: 'bob', password: 'nope' })).status, 401);
  assert.equal((await bob.call('POST', '/api/auth/login', { username: 'bob', password: 'secret123' })).status, 200);
  assert.equal((await bob.call('GET', '/api/providers')).status, 403, 'members cannot see provider config');
});

test('non-JSON writes are rejected (CSRF guard)', async () => {
  const res = await fetch(app.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(res.status, 415);
});

test('@mention routes to that agent and streams a reply', async () => {
  const cid = general().id;
  const r = await owner.call('POST', `/api/channels/${cid}/messages`, { content: '@writer hello there' });
  assert.equal(r.status, 200);
  const writer = st.agents.find((a) => a.handle === 'writer');
  const reply = await waitFor(async () => (await messages(cid)).find((m) => m.authorId === writer.id && m.status === 'done'));
  assert.match(reply.content, /hello there/);
});

test('agents publish artifacts and they render sandboxed', async () => {
  const cid = general().id;
  await owner.call('POST', `/api/channels/${cid}/messages`, { content: '@designer 做一份簡報 about launch' });
  const msg = await waitFor(async () => (await messages(cid)).find((m) => m.meta?.artifacts?.length && m.status === 'done'));
  const art = msg.meta.artifacts[0];
  assert.equal(art.type, 'slides');
  assert.match(msg.content, /\[\[artifact:/);
  const page = await fetch(`${app.base}/api/artifacts/${art.id}/render`, { headers: { cookie: owner.cookie } });
  assert.match(page.headers.get('content-security-policy'), /sandbox/);
  assert.match(await page.text(), /class="slide/);
  await owner.call('POST', `/api/channels/${cid}/messages`, { content: '@analyst dashboard please' });
  await waitFor(async () => (await messages(cid)).find((m) => m.meta?.artifacts?.some((x) => x.type === 'dashboard') && m.status === 'done'));
});

test('agents store memories via directives; humans can list, edit and delete them', async () => {
  const cid = general().id;
  await owner.call('POST', `/api/channels/${cid}/messages`, { content: '@lead 請記住 launch date is Nov 3' });
  const mem = await waitFor(async () => (await owner.call('GET', `/api/memories?channelId=${cid}`)).data.find((m) => /Nov 3/.test(m.content)));
  assert.equal(mem.scope, 'channel');
  const upd = await owner.call('PATCH', `/api/memories/${mem.id}`, { pinned: true, content: 'Launch date: Nov 3' });
  assert.equal(upd.data.pinned, true);
  assert.equal((await owner.call('DELETE', `/api/memories/${mem.id}`)).status, 200);
  assert.ok(!(await owner.call('GET', `/api/memories?channelId=${cid}`)).data.some((m) => m.id === mem.id));
});

test('personal memories are private to their owner', async () => {
  const m = await owner.call('POST', '/api/memories', { scope: 'user', content: 'Alice prefers bullet points' });
  assert.equal(m.status, 200);
  const bob = app.client();
  await bob.call('POST', '/api/auth/login', { username: 'bob', password: 'secret123' });
  const list = (await bob.call('GET', '/api/memories')).data;
  assert.ok(!list.some((x) => x.id === m.data.id));
  assert.equal((await bob.call('DELETE', `/api/memories/${m.data.id}`)).status, 403);
});

test('private channels are invisible to non-members', async () => {
  const c = (await owner.call('POST', '/api/channels', { name: 'secret', private: true })).data;
  const bob = app.client();
  await bob.call('POST', '/api/auth/login', { username: 'bob', password: 'secret123' });
  assert.equal((await bob.call('GET', `/api/channels/${c.id}/messages`)).status, 404);
  assert.ok(!(await bob.call('GET', '/api/channels')).data.some((x) => x.id === c.id));
});

test('workflows run steps in order inside a channel', async () => {
  const cid = general().id;
  const tpl = (await owner.call('GET', '/api/workflows/templates')).data.find((t) => t.key === 'kpi-dashboard');
  const w = (await owner.call('POST', '/api/workflows', { ...tpl, channelId: cid })).data;
  const r = await owner.call('POST', `/api/workflows/${w.id}/run`, { input: 'dashboard for sign-ups' });
  assert.equal(r.status, 200);
  const run = await waitFor(async () => (await owner.call('GET', `/api/workflows/${w.id}/runs`)).data.find((x) => x.status !== 'running'));
  assert.equal(run.status, 'done', run.error);
  assert.equal(run.outputs.length, 1);
});

test('direct messages create a private 1:1 channel', async () => {
  const researcher = st.agents.find((a) => a.handle === 'researcher');
  const a = (await owner.call('POST', '/api/dm', { agentId: researcher.id })).data;
  const b = (await owner.call('POST', '/api/dm', { agentId: researcher.id })).data;
  assert.equal(a.id, b.id);
  assert.equal(a.kind, 'dm');
});

test('provider API keys are encrypted and never returned', async () => {
  const p = (await owner.call('POST', '/api/providers', { type: 'openai', apiKey: 'sk-test-1234567890abcdef' })).data;
  assert.equal(p.hasKey, true);
  assert.ok(!JSON.stringify(p).includes('1234567890abcdef'));
  const all = (await owner.call('GET', '/api/providers')).data;
  assert.ok(!JSON.stringify(all).includes('1234567890abcdef'));
});

test('audit log and export are admin-only', async () => {
  assert.equal((await owner.call('GET', '/api/audit')).status, 200);
  const bob = app.client();
  await bob.call('POST', '/api/auth/login', { username: 'bob', password: 'secret123' });
  assert.equal((await bob.call('GET', '/api/audit')).status, 403);
  assert.equal((await bob.call('GET', '/api/export')).status, 403);
});

test('slides and dashboards export to real .pptx files', async () => {
  const arts = (await owner.call('GET', '/api/artifacts')).data;
  for (const type of ['slides', 'dashboard']) {
    const a = arts.find((x) => x.type === type);
    assert.ok(a, `has a ${type} artifact`);
    const res = await fetch(`${app.base}/api/artifacts/${a.id}/download?format=pptx`, { headers: { cookie: owner.cookie } });
    assert.equal(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 2).toString(), 'PK', 'pptx is a zip');
    assert.ok(buf.includes(Buffer.from('ppt/slides/slide1.xml')));
  }
});
