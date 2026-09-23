// AI video generation: an agent calls generate_video, a human approves, the clip is stored as
// media and can be dropped into a video storyboard that exports with the clip's soundtrack.
process.env.AGENT_TEAMS_DB = ':memory:';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const { adapters, createProvider } = await import('../server/providers/index.js');
const { createUser } = await import('../server/users.js');
const { createAgent } = await import('../server/agents/store.js');
const { createChannel, createMessage } = await import('../server/channels.js');
const { handleHumanMessage } = await import('../server/agents/orchestrator.js');
const { decide } = await import('../server/approvals.js');
const { bus } = await import('../server/bus.js');
const { setSetting } = await import('../server/db.js');
const { mediaByToken } = await import('../server/media/store.js');
const { createArtifact } = await import('../server/artifacts/store.js');
const videoExport = await import('../server/media/video-export.js');
const { renderMarkdown } = { renderMarkdown: (await import('../web/md.js')).markdown };

const hasFfmpeg = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']).status === 0;

adapters.clipscript = {
  type: 'clipscript', kind: 'local', needsKey: false,
  async listModels() { return []; },
  async *stream(_p, { system, messages }) {
    const last = messages.at(-1).content;
    if (!/"name":"generate_video"/.test(system)) { yield { type: 'text', text: 'NO TOOL' }; return; }
    if (!/Tool results|failed/.test(last)) yield { type: 'text', text: '```tool\n{"name":"generate_video","args":{"prompt":"a latte being poured, slow motion","seconds":3,"aspect":"16:9"}}\n```' };
    else {
      const url = /(\/media\/[A-Za-z0-9_-]+\.mp4)/.exec(last)?.[1];
      yield { type: 'text', text: url ? `Here is the clip:\n\n${url}` : 'NO CLIP' };
    }
  },
};

const owner = createUser({ username: 'vg-owner', password: 'secret123' });
const prov = createProvider({ type: 'clipscript' });

async function ask(handle, approve) {
  const agent = createAgent({ name: handle, handle, providerId: prov.id }, owner);
  const ch = createChannel({ name: `vg-${handle}`, agentIds: [agent.id] }, owner);
  const onEvent = (ev) => { if (ev.kind === 'approval.updated' && ev.approval.status === 'pending') setTimeout(() => decide(ev.approval.id, approve, owner), 20); };
  bus.on('event', onEvent);
  try {
    const [reply] = await handleHumanMessage(createMessage({ channelId: ch.id, authorType: 'user', authorId: owner.id, content: `@${handle} make a clip` }), owner);
    return reply;
  } finally { bus.off('event', onEvent); }
}

test('generate_video is only offered when video generation is configured', async () => {
  setSetting('videoGen', null);
  const reply = await ask('clipoff', true);
  assert.match(reply.content, /NO TOOL/);
});

test('an approved clip is stored, playable in chat and usable in an exported video', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not installed');
  setSetting('videoGen', { providerId: 'demo' });
  const reply = await ask('clipper', true);
  assert.equal(reply.status, 'done', reply.meta?.error);
  const call = reply.meta.tools.find((x) => x.name === 'generate_video');
  assert.equal(call.ok, true, call.summary);
  assert.equal(call.approval, 'approved');
  const url = reply.meta.media[0].url;
  assert.match(reply.content, new RegExp(url.replace(/[.]/g, '\\.')));
  const media = mediaByToken(/\/media\/([^.]+)\./.exec(url)[1]);
  assert.ok(media && existsSync(media.path));
  assert.equal(media.meta.prompt, 'a latte being poured, slow motion');
  assert.match(renderMarkdown(reply.content), /<video class="md-video"[^>]+src="\/media\//);

  // The clip inside a storyboard: exported MP4 carries the clip's audio.
  const caps = await videoExport.capabilities();
  if (!caps.chromium) return t.skip('Chromium not installed');
  setSetting('tts', null);
  const a = createArtifact({ type: 'video', title: 'With clip', byType: 'user', byId: owner.id, content: JSON.stringify({ scenes: [
    { layout: 'clip', clip: url, title: 'Pour', duration: 2 },
    { layout: 'end', title: 'Fin', duration: 1 },
  ] }) });
  videoExport.startExport(a, {});
  const deadline = Date.now() + 90_000;
  while (!['done', 'error'].includes(videoExport.exportStatus(a.id, a.viewing).status) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 300));
  const st = videoExport.exportStatus(a.id, a.viewing);
  assert.equal(st.status, 'done', st.error);
  const info = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-i', videoExport.outputPath(a.id, a.viewing)]).stderr.toString();
  assert.match(info, /Audio: aac/);
  assert.match(info, /Duration: 00:00:03/);
});

test('a declined clip is never generated', async () => {
  setSetting('videoGen', { providerId: 'demo' });
  const reply = await ask('clipno', false);
  const call = reply.meta.tools.find((x) => x.name === 'generate_video');
  assert.equal(call.ok, false);
  assert.equal(call.approval, 'denied');
  assert.equal(reply.meta.media, undefined);
  assert.match(reply.content, /NO CLIP/);
});
