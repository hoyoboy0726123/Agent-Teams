process.env.AGENT_TEAMS_DB = ':memory:';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const { parseDuckDuckGo } = await import('../server/agents/tools.js');
const { unzip } = await import('../server/files.js');
const { renderArtifact } = await import('../web/render.js');
const { createUser } = await import('../server/users.js');
const { createAgent } = await import('../server/agents/store.js');
const { createTask, resolveAssignee, listTasks } = await import('../server/tasks.js');

test('DuckDuckGo HTML results are parsed and redirect links decoded', () => {
  const html = `<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fmodelcontextprotocol.io%2F&amp;rut=x">Model <b>Context</b> Protocol</a>
    <a class="result__snippet" href="#">An open protocol for <b>tools</b>.</a></div>
    <div class="result"><a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Ad</a></div>`;
  const r = parseDuckDuckGo(html);
  assert.equal(r.length, 1);
  assert.equal(r[0].url, 'https://modelcontextprotocol.io/');
  assert.equal(r[0].title, 'Model Context Protocol');
  assert.match(r[0].snippet, /open protocol for tools/);
});

// Build a tiny zip in memory to exercise the Office extractor.
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text));
    const n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(data.length, 20); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(offset, 42);
    parts.push(local, n, data); central.push(cen, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

test('Office zip containers are read', () => {
  const z = unzip(zip({ 'word/document.xml': '<w:p><w:t>Hello 世界</w:t></w:p>' }));
  assert.match(z['word/document.xml']().toString(), /Hello 世界/);
  const real = unzip(readFileSync(new URL('../examples/launch-strategy/上市策略簡報.pptx', import.meta.url)));
  assert.ok(Object.keys(real).some((k) => /^ppt\/slides\/slide1\.xml$/.test(k)));
});

test('website previews get a storage fallback injected into <head>', () => {
  const html = renderArtifact({ type: 'website', title: 't', content: '<!doctype html><html><head><title>x</title></head><body>hi</body></html>' });
  assert.match(html, /<head><script>\(function\(\)\{function m\(\)/);
  assert.match(html, /<body>hi<\/body>/);
});

test('tasks resolve @agent and username assignees', () => {
  const u = createUser({ username: 'amy', password: 'secret123' });
  const a = createAgent({ name: 'Writer', handle: 'writer' }, u);
  assert.deepEqual(resolveAssignee('@writer'), { type: 'agent', id: a.id });
  assert.deepEqual(resolveAssignee('amy'), { type: 'user', id: u.id });
  assert.deepEqual(resolveAssignee('@nobody'), { type: null, id: null });
  const t = createTask({ title: 'Draft post', assignee: '@writer', due: '2026-10-01', byType: 'user', byId: u.id });
  assert.equal(t.assigneeId, a.id);
  assert.equal(new Date(t.dueAt).toISOString().slice(0, 10), '2026-10-01');
  assert.throws(() => createTask({ title: ' ', byType: 'user' }));
  assert.equal(listTasks({ status: 'todo' }).length, 1);
});

test('chart axis labels are compact', async () => {
  const { compact } = await import('../web/render.js');
  assert.equal(compact(294042), '294K');
  assert.equal(compact(23083589), '23.08M');
  assert.equal(compact(12.345), '12.35');
});
