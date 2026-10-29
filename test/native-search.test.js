// Per-agent "model's own search": Claude Code gets only WebSearch/WebFetch enabled and
// pre-approved, and each search shows up in the message's process view.
process.env.AGENT_TEAMS_DB = ':memory:';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const { createProvider } = await import('../server/providers/index.js');
const { createUser } = await import('../server/users.js');
const { createAgent, TOOLS } = await import('../server/agents/store.js');
const { createChannel, createMessage } = await import('../server/channels.js');
const { handleHumanMessage } = await import('../server/agents/orchestrator.js');

const bin = fileURLToPath(new URL('./fixtures/fake-claude.js', import.meta.url));
const owner = createUser({ username: 'ns-owner', password: 'secret123' });
const prov = createProvider({ type: 'claude-code', extra: { bin } });

async function ask(handle, tools) {
  const agent = createAgent({ name: handle, handle, providerId: prov.id, tools }, owner);
  const ch = createChannel({ name: `ns-${handle}`, agentIds: [agent.id] }, owner);
  const [reply] = await handleHumanMessage(createMessage({ channelId: ch.id, authorType: 'user', authorId: owner.id, content: `@${handle} what is the latest Node LTS?` }), owner);
  return { agent, reply };
}

test('native search is opt-in and off by default', async () => {
  assert.ok(TOOLS.includes('native_search'));
  const { agent, reply } = await ask('plain');
  assert.ok(!agent.tools.includes('native_search'));
  assert.match(reply.content, /NO SEARCH \(tools=""\)/);
});

test('with the switch on, Claude searches with its own tools and the search is logged', async () => {
  const { reply } = await ask('searcher', ['native_search', 'recall']);
  assert.equal(reply.status, 'done', reply.meta?.error);
  assert.match(reply.content, /Node\.js 24 is the active LTS/);
  const s = reply.meta.tools.find((x) => x.native);
  assert.equal(s.name, 'WebSearch');
  assert.deepEqual(s.args, { query: 'node lts' });
  assert.equal(s.ok, true);
  assert.match(s.summary, /active LTS/);
});
