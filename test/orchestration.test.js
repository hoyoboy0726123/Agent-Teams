// Unit tests for routing, hand-offs, synthesis, the tool loop and memory recall,
// using a scripted in-process provider.
process.env.AGENT_TEAMS_DB = ':memory:';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { adapters, createProvider } = await import('../server/providers/index.js');
const { createUser } = await import('../server/users.js');
const { createAgent } = await import('../server/agents/store.js');
const { createChannel, createMessage, listMessages, getChannel } = await import('../server/channels.js');
const { handleHumanMessage, pickResponders, mentionHandles, resolveAgent } = await import('../server/agents/orchestrator.js');
const { buildContext } = await import('../server/agents/runtime.js');
const { addMemory, recall } = await import('../server/memory/store.js');
const { bm25, tokenize } = await import('../server/memory/search.js');
const { extractBlocks, displayText, calc } = await import('../server/agents/tools.js');
const { stages, render } = await import('../server/workflows/engine.js');

// Scripted provider: reply depends on which agent is speaking (parsed from the system prompt).
const calls = [];
adapters.script = {
  type: 'script', kind: 'local', needsKey: false, fallbackModels: [],
  async listModels() { return []; },
  async *stream(_p, { system, messages }) {
    const handle = /\(@([^)]+)\)/.exec(system)[1];
    const last = messages[messages.length - 1].content;
    calls.push({ handle, system, last });
    let out = `${handle} says hi`;
    if (handle === 'lead' && /synthesise/.test(system)) out = 'FINAL: combined answer';
    else if (handle === 'lead') out = 'Plan: @researcher find data, @writer draft the memo.';
    else if (handle === 'researcher' && !/Tool results/.test(last)) out = 'Let me compute.\n```tool\n{"name":"calc","args":{"expression":"6*7"}}\n```';
    else if (handle === 'researcher') out = `The answer is ${/Result of calc:\n(\d+)/.exec(last)?.[1]}`;
    yield { type: 'text', text: out };
  },
};

const owner = createUser({ username: 'owner', password: 'secret123', displayName: 'Owner' });
const prov = createProvider({ type: 'script' });
const mk = (handle, extra = {}) => createAgent({ name: handle, handle, providerId: prov.id, description: `${handle} role`, ...extra }, owner);
const lead = mk('lead', { description: 'coordinates plans and delegates' });
const researcher = mk('researcher', { description: 'research data facts sources statistics' });
const writer = mk('writer', { description: 'writes memos documents emails' });
const outsider = mk('outsider');
const ch = createChannel({ name: 'team', mode: 'auto', agentIds: [lead.id, researcher.id, writer.id] }, owner);

const settle = async (p) => { await p; await new Promise((r) => setTimeout(r, 20)); };

test('mention parsing handles CJK and punctuation', () => {
  assert.deepEqual(mentionHandles('hi @lead, and（@研究員）@writer'), ['lead', '研究員', 'writer']);
  assert.deepEqual(mentionHandles('email me at a@b.com'), []);
  assert.deepEqual(mentionHandles('請@writer幫忙'), ['writer幫忙']);
});

test('CJK text running into a handle still resolves to the agent', () => {
  assert.equal(resolveAgent('writer幫忙', [lead, writer]).id, writer.id);
  assert.equal(resolveAgent('nobody', [lead, writer]), null);
});

test('lead delegates via @mentions, teammates reply, then lead synthesises', async () => {
  calls.length = 0;
  const m = createMessage({ channelId: ch.id, authorType: 'user', authorId: owner.id, content: '@lead prepare a memo on churn' });
  const results = await handleHumanMessage(m, owner);
  assert.deepEqual(results.map((r) => r.authorId), [lead.id, researcher.id, writer.id, lead.id]);
  assert.equal(results.at(-1).content, 'FINAL: combined answer');
  assert.ok(results.every((r) => r.status === 'done'));
});

test('tool calls run and their results are fed back into the same reply', async () => {
  const research = listMessages(ch.id).find((x) => x.authorId === researcher.id);
  assert.match(research.content, /The answer is 42/);
  assert.doesNotMatch(research.content, /```tool/);
  assert.equal(research.meta.tools[0].name, 'calc');
  assert.equal(research.meta.tools[0].ok, true);
});

test('auto mode routes by role description; mention of an outside agent adds it to the channel', async () => {
  const m1 = createMessage({ channelId: ch.id, authorType: 'user', authorId: owner.id, content: 'please write an email memo document' });
  const [pick] = await pickResponders(getChannel(ch.id), m1, owner);
  assert.equal(pick.id, writer.id);
  const m2 = createMessage({ channelId: ch.id, authorType: 'user', authorId: owner.id, content: '@outsider join us' });
  const r = await pickResponders(getChannel(ch.id), m2, owner);
  assert.equal(r[0].id, outsider.id);
  assert.ok(listMessages(ch.id).some((x) => x.authorType === 'system' && /outsider joined/.test(x.content)));
});

test('mention-only channels stay quiet without a mention; roundtable asks everyone', async () => {
  const quiet = createChannel({ name: 'quiet', mode: 'mention', agentIds: [lead.id, writer.id] }, owner);
  const m = createMessage({ channelId: quiet.id, authorType: 'user', authorId: owner.id, content: 'just humans talking' });
  assert.equal((await pickResponders(getChannel(quiet.id), m, owner)).length, 0);
  const rt = createChannel({ name: 'rt', mode: 'roundtable', agentIds: [lead.id, writer.id] }, owner);
  const m2 = createMessage({ channelId: rt.id, authorType: 'user', authorId: owner.id, content: 'thoughts?' });
  assert.equal((await pickResponders(getChannel(rt.id), m2, owner)).length, 2);
});

test('agent context includes roster, memory and alternating turns ending with the user', () => {
  addMemory({ scope: 'channel', scopeId: ch.id, content: 'Budget for Q4 is 2 million TWD', byType: 'user', byId: owner.id });
  addMemory({ scope: 'user', scopeId: owner.id, content: 'Owner prefers concise bullet points', byType: 'user', byId: owner.id });
  createMessage({ channelId: ch.id, authorType: 'user', authorId: owner.id, content: 'what is our budget?' });
  const ctx = buildContext({ agent: researcher, channel: getChannel(ch.id), userId: owner.id });
  assert.match(ctx.system, /@lead/);
  assert.match(ctx.system, /Budget for Q4/);
  assert.match(ctx.system, /concise bullet points/);
  assert.equal(ctx.messages.at(-1).role, 'user');
  for (let i = 1; i < ctx.messages.length; i++) assert.notEqual(ctx.messages[i].role, ctx.messages[i - 1].role);
  const other = buildContext({ agent: researcher, channel: getChannel(ch.id), userId: null });
  assert.doesNotMatch(other.system, /concise bullet points/, 'personal memory only visible to its owner');
});

test('memory de-duplicates near-identical facts and recall ranks by relevance (CJK)', () => {
  const a = addMemory({ scope: 'workspace', content: '產品發表會訂在十一月三日', byType: 'user' });
  const b = addMemory({ scope: 'workspace', content: '產品發表會訂在十一月三日。', byType: 'user' });
  assert.equal(a.id, b.id);
  addMemory({ scope: 'workspace', content: '辦公室的咖啡機壞了', byType: 'user' });
  const hits = recall({ scopes: [['workspace', null]], query: '發表會是哪天？', limit: 1 });
  assert.match(hits[0].content, /發表會/);
  assert.ok(tokenize('發表會').includes('發表'));
  assert.equal(bm25('launch date', [{ id: 1, text: 'the launch date is set' }, { id: 2, text: 'coffee' }])[0].id, 1);
});

test('directive parsing and display', () => {
  const text = 'Here.\n```artifact type="slides" title="Deck"\n# A\n```\n```remember\nfact\n```\nDone';
  const blocks = extractBlocks(text);
  assert.deepEqual(blocks.map((b) => [b.kind, b.attrs.title]), [['artifact', 'Deck'], ['remember', undefined]]);
  assert.equal(displayText(text, { artifacts: { Deck: 'art_1' } }), 'Here.\n[[artifact:art_1]]\n\nDone');
  assert.equal(displayText('Wait ```tool\n{"na'), 'Wait [[tool-running]]');
});

test('calc is safe and correct', () => {
  assert.equal(calc('2+3*4'), 14);
  assert.equal(calc('(1,200 + 800) / 4'), 500);
  assert.equal(calc('max(1, 5) - sqrt(9)'), 2);
  assert.throws(() => calc('process.exit()'));
  assert.throws(() => calc('constructor'));
});

test('workflow helpers group parallel steps and render variables', () => {
  const g = stages([{ id: 1 }, { id: 2, parallel: true }, { id: 3, parallel: true }, { id: 4 }]);
  assert.deepEqual(g.map((x) => x.map((s) => s.id)), [[1], [2, 3], [4]]);
  assert.equal(render('Topic: {{input}} / {{prev}} / {{nope}}', { input: 'A', prev: 'B' }), 'Topic: A / B / {{nope}}');
});
