import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, waitFor } from './helpers.js';

const sched = await import('../server/workflows/schedule.js');

test('cron parsing and matching respect the time zone', () => {
  const c = sched.parseCron('*/15 9-17 * * mon-fri');
  assert.ok(c.minute.has(45) && !c.minute.has(50));
  assert.deepEqual([...c.dow].sort(), [1, 2, 3, 4, 5]);
  // 2026-09-21 is a Monday. 00:30 UTC == 08:30 in Taipei.
  const at = new Date('2026-09-21T00:30:00Z');
  assert.equal(sched.matches({ kind: 'daily', time: '08:30', days: [1, 2, 3, 4, 5] }, at, 'Asia/Taipei'), true);
  assert.equal(sched.matches({ kind: 'daily', time: '08:30' }, at, 'UTC'), false);
  assert.equal(sched.matches({ kind: 'weekly', day: 1, time: '08:30' }, at, 'Asia/Taipei'), true);
  assert.equal(sched.matches({ kind: 'monthly', date: 21, time: '08:30' }, at, 'Asia/Taipei'), true);
  assert.throws(() => sched.parseCron('61 * * * *'));
  assert.throws(() => sched.validateSchedule({ kind: 'daily', time: '25:00' }));
});

test('next runs and human labels', () => {
  const from = new Date('2026-09-21T00:00:00Z'); // Mon 08:00 Taipei
  const next = sched.nextRuns({ kind: 'daily', time: '08:30', days: [1, 2, 3, 4, 5] }, { tz: 'Asia/Taipei', from, count: 2 });
  assert.equal(next[0].toISOString(), '2026-09-21T00:30:00.000Z');
  assert.equal(next[1].toISOString(), '2026-09-22T00:30:00.000Z');
  assert.equal(sched.describe({ kind: 'daily', time: '08:30', days: [1, 2, 3, 4, 5] }, 'zh'), '平日 08:30');
  assert.equal(sched.describe({ kind: 'weekly', day: 5, time: '17:00' }, 'en'), 'Weekly on Fri 17:00');
});

let app, owner;
before(async () => {
  app = await boot();
  owner = app.client();
  await owner.call('POST', '/api/auth/register', { username: 'alice', password: 'secret123' });
});
after(() => app.close());

test('agent library has many roles and one-click teams create a channel', async () => {
  const lib = (await owner.call('GET', '/api/library')).data;
  assert.ok(lib.agents.length >= 40);
  assert.ok(lib.teams.length >= 6);
  const st = (await owner.call('GET', '/api/state')).data;
  const r = await owner.call('POST', '/api/teams/engineering', { providerId: st.providers[0].id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.agents.length, 6);
  const again = await owner.call('POST', '/api/teams/engineering', { providerId: st.providers[0].id });
  assert.deepEqual(again.data.agents.map((a) => a.id), r.data.agents.map((a) => a.id), 'reuses agents made from the same template');
});

test('automation templates install agents, a channel and a schedule; the scheduler fires them', async () => {
  const st = (await owner.call('GET', '/api/state')).data;
  const w = (await owner.call('POST', '/api/automations/templates/competitor-watch', { values: { targets: 'Acme, Globex' }, providerId: st.providers[0].id })).data;
  assert.equal(w.trigger, 'schedule');
  assert.match(w.steps[0].instruction, /Acme, Globex/);
  assert.ok(w.nextRuns.length >= 1);
  assert.equal(w.scheduleLabel.zh, '平日 09:00');
  // Fire deterministically at a matching minute in the workspace zone.
  await owner.call('PATCH', '/api/settings', { timezone: 'Asia/Taipei' });
  const { tickScheduler } = await import('../server/workflows/engine.js');
  const monday0900 = new Date('2026-09-21T01:00:00Z');
  assert.ok(tickScheduler(monday0900).includes(w.id));
  assert.ok(!tickScheduler(monday0900).includes(w.id), 'fires once per slot');
  await waitFor(async () => (await owner.call('GET', `/api/workflows/${w.id}/runs`)).data.find((x) => x.status !== 'running'));
  // Disabled automations never fire.
  await owner.call('POST', `/api/workflows/${w.id}/enabled`, { enabled: false });
  assert.ok(!tickScheduler(new Date('2026-09-22T01:00:00Z')).includes(w.id));
});

test('webhook-triggered automations run with the posted payload', async () => {
  const st = (await owner.call('GET', '/api/state')).data;
  const w = (await owner.call('POST', '/api/automations/templates/kpi-weekly', { trigger: 'webhook', values: { metrics: 'MAU' }, providerId: st.providers[0].id })).data;
  assert.ok(w.hookToken);
  const res = await fetch(`${app.base}/hooks/${w.hookToken}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'MAU 12,000' }) });
  assert.equal(res.status, 202);
  const run = await waitFor(async () => (await owner.call('GET', `/api/workflows/${w.id}/runs`)).data[0]);
  assert.equal(run.input, 'MAU 12,000');
  assert.equal((await fetch(`${app.base}/hooks/not-a-real-token-xxxxxxxx`, { method: 'POST' })).status, 404);
});

test('briefing digest only includes public channels', async () => {
  const { buildDigest } = await import('../server/workflows/digest.js');
  const secret = (await owner.call('POST', '/api/channels', { name: 'secret-plans', private: true })).data;
  await owner.call('POST', `/api/channels/${secret.id}/messages`, { content: 'TOP SECRET merger' });
  const st = (await owner.call('GET', '/api/state')).data;
  await owner.call('POST', `/api/channels/${st.channels.find((c) => c.name === 'general').id}/messages`, { content: 'public update about pricing' });
  const d = buildDigest();
  assert.match(d, /public update about pricing/);
  assert.doesNotMatch(d, /TOP SECRET/);
});
