// End-to-end MCP: a real stdio MCP server, an agent calling its tools, and a human approving
// the side-effecting call.
process.env.AGENT_TEAMS_DB = ':memory:';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const { adapters, createProvider } = await import('../server/providers/index.js');
const { createUser } = await import('../server/users.js');
const { createAgent } = await import('../server/agents/store.js');
const { createChannel, createMessage } = await import('../server/channels.js');
const { handleHumanMessage } = await import('../server/agents/orchestrator.js');
const mcp = await import('../server/mcp/index.js');
const { decide } = await import('../server/approvals.js');
const { bus } = await import('../server/bus.js');

const fixture = fileURLToPath(new URL('./fixtures/notes-mcp-server.js', import.meta.url));
after(() => mcp.closeAll());

adapters.mcpscript = {
  type: 'mcpscript', kind: 'local', needsKey: false,
  async listModels() { return []; },
  async *stream(_p, { system, messages }) {
    const last = messages.at(-1).content;
    if (!/Connected tools \(MCP\)/.test(system)) { yield { type: 'text', text: 'no tools visible' }; return; }
    if (!/Tool results/.test(last)) yield { type: 'text', text: '```tool\n{"name":"notes.search_notes","args":{"query":"launch"}}\n```' };
    else if (/found \d+ notes/.test(last) && !/saved note|declined/.test(last)) yield { type: 'text', text: '```tool\n{"name":"notes.create_note","args":{"text":"launch on Nov 3"}}\n```' };
    else yield { type: 'text', text: `Done. ${/saved note #1/.test(last) ? 'NOTE SAVED' : 'NOT SAVED'}` };
  },
};

const owner = createUser({ username: 'owner', password: 'secret123' });
const prov = createProvider({ type: 'mcpscript' });

test('MCP presets fill arguments, env and headers', () => {
  const fs = mcp.fromPreset('filesystem', { FOLDER: '/srv/docs' });
  assert.deepEqual(fs.args, ['-y', '@modelcontextprotocol/server-filesystem', '/srv/docs']);
  const gh = mcp.fromPreset('github', { Authorization: 'ghp_x' });
  assert.equal(gh.headers.Authorization, 'Bearer ghp_x');
  assert.equal(gh.transport, 'http');
});

test('server secrets are encrypted and masked', () => {
  const s = mcp.saveServer({ name: 'Secret', transport: 'stdio', command: 'echo', env: { TOKEN: 'super-secret-value' } }, owner);
  assert.equal(s.env.TOKEN, '••••');
  assert.equal(mcp.getServer(s.id, true).env.TOKEN, 'super-secret-value');
  // Saving back the masked value keeps the real secret.
  mcp.saveServer({ ...s, env: { TOKEN: '••••' } }, owner, s.id);
  assert.equal(mcp.getServer(s.id, true).env.TOKEN, 'super-secret-value');
  mcp.deleteServer(s.id, owner);
});

test('agent lists and calls MCP tools; side-effecting calls wait for human approval', async () => {
  const server = mcp.saveServer({ name: 'notes', slug: 'notes', transport: 'stdio', command: process.execPath, args: [fixture] }, owner);
  const tools = await mcp.listTools(server.id);
  assert.deepEqual(tools.map((t) => t.name).sort(), ['create_note', 'search_notes']);
  assert.equal(mcp.needsApproval(server, tools.find((t) => t.name === 'search_notes')), false);
  assert.equal(mcp.needsApproval(server, tools.find((t) => t.name === 'create_note')), true);

  const agent = createAgent({ name: 'Ops', handle: 'ops', providerId: prov.id, mcpServers: [server.id] }, owner);
  const ch = createChannel({ name: 'ops', agentIds: [agent.id] }, owner);
  const seen = [];
  const onEvent = (ev) => { if (ev.kind === 'approval.updated' && ev.approval.status === 'pending') { seen.push(ev.approval); setTimeout(() => decide(ev.approval.id, true, owner), 20); } };
  bus.on('event', onEvent);
  try {
    const m = createMessage({ channelId: ch.id, authorType: 'user', authorId: owner.id, content: '@ops save a note about the launch' });
    const [reply] = await handleHumanMessage(m, owner);
    assert.equal(reply.status, 'done', reply.meta?.error);
    assert.match(reply.content, /NOTE SAVED/);
    assert.deepEqual(reply.meta.tools.map((t) => [t.name, t.ok]), [['notes.search_notes', true], ['notes.create_note', true]]);
    assert.equal(seen.length, 1, 'only the write call needed approval');
    assert.equal(seen[0].tool, 'notes.create_note');
    assert.equal(reply.meta.approvals[0].status, 'approved');
  } finally { bus.off('event', onEvent); }
});

test('denied approvals block the action', async () => {
  const server = mcp.listServers().find((s) => s.slug === 'notes');
  const agent = createAgent({ name: 'Ops2', handle: 'ops2', providerId: prov.id, mcpServers: [server.id] }, owner);
  const ch = createChannel({ name: 'ops2', agentIds: [agent.id] }, owner);
  const onEvent = (ev) => { if (ev.kind === 'approval.updated' && ev.approval.status === 'pending') setTimeout(() => decide(ev.approval.id, false, owner), 20); };
  bus.on('event', onEvent);
  try {
    const [reply] = await handleHumanMessage(createMessage({ channelId: ch.id, authorType: 'user', authorId: owner.id, content: '@ops2 go' }), owner);
    assert.match(reply.content, /NOT SAVED/);
    const write = reply.meta.tools.find((t) => t.name === 'notes.create_note');
    assert.equal(write.ok, false);
    assert.equal(write.approval, 'denied');
  } finally { bus.off('event', onEvent); }
});
