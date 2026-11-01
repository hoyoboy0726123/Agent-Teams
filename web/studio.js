// Studio: full-screen workspace for a deliverable — live preview (with device sizes),
// source editing, version history, review comments, "ask AI to edit" and sharing.
import { t } from './i18n.js';
import { $, esc, api, toast, safe, confirmBox, timeAgo, modal } from './ui.js';
import { renderArtifact } from './render.js';
import { S, agentById, userById } from './app.js';
import { openCollabEditor, colorFor } from './collab.js';

const TYPE_ICON = { slides: '🎞️', dashboard: '📊', website: '🌐', research: '🔬', document: '📄', video: '🎬' };
let current = null; // { id, el, artifact, revising, device, tab }

// Best-effort render of a partially written artifact (used for live previews).
export function draftDoc(d) {
  let content = d.content || '';
  if (d.type === 'dashboard' || d.type === 'video') {
    try { JSON.parse(content.trim()); } catch {
      return `<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;display:grid;place-items:center;height:90vh;color:#667085;background:#f7f8fb">${d.type === 'video' ? `🎬 ${esc(t('buildingVideo'))}` : `📊 ${esc(t('buildingDashboard'))}`}…</body>`;
    }
  }
  if (d.type === 'website' && !/<\/html>\s*$/i.test(content)) content += '\n</body></html>';
  try { return renderArtifact({ type: d.type, title: d.title, content }); } catch { return '<!doctype html><body></body>'; }
}

export const openArtifact = (id, version) => openStudio(id, version);

export async function openStudio(id, version) {
  const a = await api('GET', `/api/artifacts/${id}${version ? `?version=${version}` : ''}`).catch((e) => { toast(e.message, 'error'); return null; });
  if (!a) return;
  if (current?.el) current.el.remove();
  const el = document.createElement('div');
  el.className = 'studio';
  document.body.append(el);
  current = { id, el, artifact: a, revising: false, device: 'desktop', tab: 'preview', collab: null, peers: [] };
  document.addEventListener('keydown', onKey);
  render();
  syncCollab();
}

// Live co-editing runs while the latest version is open; older versions use the plain editor.
async function syncCollab() {
  const c = current;
  if (!c) return;
  const latest = c.artifact.viewing === c.artifact.version;
  if (!latest) { c.collab?.destroy(); c.collab = null; return; }
  if (c.collab || c.collabStarting) return;
  c.collabStarting = true;
  try {
    const collab = await openCollabEditor({
      artifactId: c.id, type: c.artifact.type, user: S.user,
      onText: (text) => { if (current === c) livePreview(text); },
      onSaved: (ev) => { if (current === c) { if (ev.by === S.user.id && !ev.external) toast(t('savedAs', ev.version), 'ok'); reload(); } },
      onPeers: (list) => { if (current === c) { c.peers = list; showPeers(); } },
      onStatus: (s) => { if (s === 'reloaded') toast(t('collabReloaded'), 'info'); if (s === 'synced' && current === c) mountEditor(); },
    });
    if (current !== c) return collab.destroy();
    c.collab = collab;
    render();
  } catch (e) {
    console.warn('Live editing unavailable, using the plain editor', e);
  } finally { c.collabStarting = false; }
}

function mountEditor() {
  const host = current?.el.querySelector('.editor-host');
  if (host && current.collab && current.collab.dom.parentNode !== host) host.append(current.collab.dom);
}

let previewTimer;
function livePreview(text) {
  const a = current.artifact;
  current.liveText = text;
  const note = current.el.querySelector('[data-unsaved]');
  if (note) note.hidden = text === a.content;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const frame = current?.el.querySelector('.studio-frame');
    if (!frame || current.revising) return;
    if (text === a.content && !frame.srcdoc) return;
    frame.removeAttribute('src');
    frame.srcdoc = draftDoc({ type: a.type, title: a.title, content: text });
  }, 700);
}

function showPeers() {
  const box = current?.el.querySelector('[data-peers]');
  if (!box) return;
  box.innerHTML = current.peers.map((u) => `<span class="peer" style="--c:${esc(u.color || colorFor(u.id))}" title="${esc(u.name)} ${t('isEditing')}">${esc(String(u.name || '?').slice(0, 1).toUpperCase())}</span>`).join('');
  box.title = current.peers.length ? current.peers.map((u) => u.name).join(', ') : '';
}

function close() {
  current?.collab?.destroy();
  current?.el.remove();
  current = null;
  document.removeEventListener('keydown', onKey);
}
const onKey = (e) => { if (e.key === 'Escape' && current && !document.querySelector('.modal-backdrop')) close(); };

async function reload(version) {
  if (!current) return;
  current.artifact = await api('GET', `/api/artifacts/${current.id}${version ? `?version=${version}` : ''}`);
  render();
  syncCollab();
}

function render() {
  const { el, artifact: a } = current;
  const canEdit = S.user.role !== 'guest';
  const agents = S.agents.filter((x) => (x.tools || []).includes('artifacts'));
  const defaultAgent = a.createdByType === 'agent' ? a.createdById : agents.find((x) => x.handle === 'designer')?.id;
  const isLatest = a.viewing === a.version;
  el.innerHTML = `
    <header class="studio-bar">
      <button class="icon-btn" data-close aria-label="${t('close')}">✕</button>
      <span class="studio-icon">${TYPE_ICON[a.type] || '📄'}</span>
      <span class="peers" data-peers></span>
      <div class="grow ellipsis"><strong>${esc(a.title)}</strong> <span class="type-badge t-${esc(a.type)}">${esc(t('type_' + a.type))}</span>
        <div class="muted small">${t('version')} ${a.viewing}/${a.version}${isLatest ? '' : ` · ${t('olderVersion')}`}</div></div>
      <select data-ver title="${t('version')}">${a.versions.map((v) => `<option value="${v.version}"${v.version === a.viewing ? ' selected' : ''}>v${v.version} · ${v.authorType === 'agent' ? esc(agentById(v.authorId)?.name || 'agent') : esc(userById(v.authorId)?.displayName || 'user')} · ${timeAgo(v.createdAt)}</option>`).join('')}</select>
      ${canEdit ? `<button class="btn sm" data-share>${a.shareToken ? '🔗 ' + t('shared') : '🔗 ' + t('share')}</button>` : ''}
      <a class="btn sm" href="/api/artifacts/${a.id}/render?version=${a.viewing}" target="_blank" rel="noopener">↗</a>
      <a class="btn sm" href="/api/artifacts/${a.id}/download?version=${a.viewing}">⬇</a>
      ${a.type === 'slides' || a.type === 'dashboard' ? `<a class="btn sm" href="/api/artifacts/${a.id}/download?version=${a.viewing}&format=pptx">📊 PPTX</a>` : ''}
      ${a.type === 'video' ? `<span class="video-export" data-vstatus></span>` : ''}
      ${canEdit ? `<button class="icon-btn" data-del title="${t('delete')}">🗑</button>` : ''}
    </header>
    <div class="studio-body">
      <section class="studio-main">
        <div class="studio-tabs">
          <button class="tab${current.tab === 'preview' ? ' on' : ''}" data-tab="preview">👁 ${t('preview')}</button>
          <button class="tab${current.tab === 'code' ? ' on' : ''}" data-tab="code">‹/› ${t('source')}</button>
          <span class="grow"></span>
          ${current.tab === 'preview' ? ['desktop', 'tablet', 'mobile'].map((d) => `<button class="tab${current.device === d ? ' on' : ''}" data-device="${d}">${{ desktop: '🖥', tablet: '📱↔', mobile: '📱' }[d]}</button>`).join('') : ''}
        </div>
        <div class="studio-stage" ${current.tab === 'preview' ? '' : 'hidden'}>
          <div class="device ${current.device}">
            ${current.revising ? `<div class="revising-badge"><span class="spin">✍️</span> ${t('revising')}</div>` : ''}
            <iframe class="studio-frame" sandbox="allow-scripts allow-popups allow-modals" src="/api/artifacts/${a.id}/render?version=${a.viewing}" title="${esc(a.title)}"></iframe>
          </div>
        </div>
        <form class="studio-code" ${current.tab === 'code' ? '' : 'hidden'}>
          ${current.collab ? `<div class="editor-host"></div>` : `<textarea class="mono" spellcheck="false" ${canEdit ? '' : 'readonly'}>${esc(a.content)}</textarea>`}
          ${canEdit ? `<div class="row"><span class="muted small grow">${current.collab ? `🟢 ${t('liveEditing')} <span class="unsaved" data-unsaved ${current.liveText != null && current.liveText !== a.content ? '' : 'hidden'}>· ${t('unsavedChanges')}</span>` : t('codeHint')}</span><button class="btn sm" type="button" data-quote>💬 ${t('commentSelection')}</button><button class="btn primary sm">${t('saveVersion')}</button></div>` : ''}
        </form>
      </section>
      <aside class="studio-side">
        ${canEdit ? `<form class="ask-ai" data-ask>
          <h3>✨ ${t('askAiEdit')}</h3>
          <select name="agentId">${agents.map((x) => `<option value="${x.id}"${x.id === defaultAgent ? ' selected' : ''}>${esc(x.avatar)} ${esc(x.name)}</option>`).join('')}</select>
          <textarea name="instruction" rows="3" placeholder="${t('askAiPlaceholder')}"></textarea>
          <label class="check small"><input type="checkbox" name="includeComments" checked> ${t('includeComments')}</label>
          <button class="btn primary" ${current.revising ? 'disabled' : ''}>${current.revising ? t('revising') : t('applyChanges')}</button>
        </form>` : ''}
        <div class="comments">
          <h3>💬 ${t('comments')}</h3>
          <div data-comments><p class="muted small">${t('loading')}</p></div>
          <form class="comment-add" data-add-comment>
            <input name="quote" placeholder="${t('quoteOptional')}">
            <textarea name="body" rows="2" placeholder="${t('commentPlaceholder')}" required></textarea>
            <button class="btn sm">${t('addComment')}</button>
          </form>
        </div>
      </aside>
    </div>`;
  bind();
  mountEditor();
  showPeers();
  loadComments();
  if (a.type === 'video') loadVideoStatus();
}

// ---- MP4 export (video artifacts)

async function loadVideoStatus() {
  const a = current.artifact;
  const st = await api('GET', `/api/artifacts/${a.id}/video/status?version=${a.viewing}`).catch(() => ({ status: 'none' }));
  showVideoStatus(st);
}

function showVideoStatus(st) {
  const box = current?.el.querySelector('[data-vstatus]');
  if (!box) return;
  const a = current.artifact;
  const canEdit = S.user.role !== 'guest';
  const url = `/api/artifacts/${a.id}/video?version=${a.viewing}`;
  if (st.status === 'running') {
    box.innerHTML = `<span class="chip"><span class="spin">🎬</span> ${t('videoStage_' + (st.stage || 'prepare'))} ${st.pct || 0}%</span>`;
  } else if (st.status === 'done') {
    box.innerHTML = `<a class="btn sm" href="${url}" target="_blank" rel="noopener">▶ MP4</a><a class="btn sm" href="${url}&download=1">⬇ MP4</a>${canEdit ? `<button class="icon-btn sm" data-export-video title="${t('reExport')}">↻</button>` : ''}`;
  } else {
    box.innerHTML = `${st.status === 'error' ? `<span class="danger-text small" title="${esc(st.error || '')}">✗ ${esc((st.error || '').slice(0, 60))}</span>` : ''}${canEdit ? `<button class="btn sm primary" data-export-video>🎬 ${t('exportMp4')}</button>` : ''}`;
  }
  box.querySelector('[data-export-video]')?.addEventListener('click', safe(exportDialog));
}

async function exportDialog() {
  const a = current.artifact;
  const caps = await api('GET', '/api/video/capabilities');
  const missing = [!caps.chromium && 'Chromium (npm i playwright-core && npx playwright install chromium)', !caps.ffmpeg && 'ffmpeg'].filter(Boolean);
  const m = modal({
    title: `🎬 ${t('exportMp4')}`,
    body: missing.length ? `<p>${t('videoMissing')}</p><ul>${missing.map((x) => `<li><code>${esc(x)}</code></li>`).join('')}</ul>`
      : `<form class="form" id="vx">
        <label class="check"><input type="checkbox" name="narration" ${caps.tts ? 'checked' : 'disabled'}> ${t('videoNarration')} ${caps.tts ? `<span class="muted small">(${esc(caps.ttsLabel || '')})</span>` : `<span class="muted small">— ${t('videoNoVoice')}</span>`}</label>
        <label class="check"><input type="checkbox" name="hd"> ${t('videoHd')}</label>
        <p class="muted small">${t('videoExportHint')}</p></form>`,
    footer: missing.length ? '' : `<button class="btn primary" form="vx">${t('exportMp4')}</button>`,
  });
  m.el.querySelector('#vx')?.addEventListener('submit', safe(async (e) => {
    e.preventDefault();
    const st = await api('POST', `/api/artifacts/${a.id}/export-video`, { version: a.viewing, narration: e.target.narration.checked, hd: e.target.hd.checked });
    m.close();
    showVideoStatus(st);
  }));
}

async function loadComments() {
  if (!current) return;
  const box = current.el.querySelector('[data-comments]');
  const list = await api('GET', `/api/artifacts/${current.id}/comments`).catch(() => []);
  const open = list.filter((c) => c.status === 'open');
  const done = list.filter((c) => c.status !== 'open');
  const item = (c) => `<div class="comment ${c.status}">
      ${c.quote ? `<blockquote>${esc(c.quote)}</blockquote>` : ''}
      <div>${esc(c.body)}</div>
      <div class="muted small">${esc(userById(c.authorId)?.displayName || '')} · v${c.version} · ${timeAgo(c.createdAt)}
        <button class="link" data-resolve="${c.id}" data-status="${c.status === 'open' ? 'resolved' : 'open'}">${c.status === 'open' ? '✓ ' + t('resolve') : '↺ ' + t('reopen')}</button>
        ${c.authorId === S.user.id ? `<button class="link" data-del-comment="${c.id}">${t('delete')}</button>` : ''}</div></div>`;
  box.innerHTML = list.length ? `${open.map(item).join('')}${done.length ? `<details><summary class="muted small">${t('resolved')} (${done.length})</summary>${done.map(item).join('')}</details>` : ''}` : `<p class="muted small">${t('noComments')}</p>`;
}

function bind() {
  const { el, artifact: a } = current;
  el.querySelector('[data-close]').onclick = close;
  el.querySelector('[data-ver]').onchange = (e) => reload(+e.target.value);
  el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { current.tab = b.dataset.tab; render(); }; });
  el.querySelectorAll('[data-device]').forEach((b) => { b.onclick = () => { current.device = b.dataset.device; render(); }; });
  el.querySelector('[data-share]')?.addEventListener('click', safe(async () => {
    if (a.shareToken) {
      const url = `${location.origin}/s/${a.shareToken}`;
      const off = await confirmBox(`${url}\n\n${t('shareOffConfirm')}`, { ok: t('stopSharing') });
      if (off) { await api('POST', `/api/artifacts/${a.id}/share`, { on: false }); toast(t('sharingStopped')); reload(a.viewing); }
      else { await navigator.clipboard?.writeText(url).catch(() => {}); }
      return;
    }
    const r = await api('POST', `/api/artifacts/${a.id}/share`, { on: true });
    const url = `${location.origin}${r.url}`;
    await navigator.clipboard?.writeText(url).catch(() => {});
    toast(`${t('linkCopied')}: ${url}`, 'ok', 5000);
    reload(a.viewing);
  }));
  el.querySelector('[data-del]')?.addEventListener('click', safe(async () => {
    if (await confirmBox(`${t('delete')} “${a.title}”?`)) { await api('DELETE', `/api/artifacts/${a.id}`); close(); }
  }));
  const code = el.querySelector('.studio-code');
  const ta = code.querySelector('textarea');
  if (ta) ta.oninput = () => { current.dirty = true; };
  code.onsubmit = safe(async (e) => {
    e.preventDefault();
    if (current.collab) return current.collab.save();
    await saveSource(ta.value);
  });
  el.querySelector('[data-quote]')?.addEventListener('click', () => {
    const sel = (current.collab ? current.collab.selection() : ta.value.slice(ta.selectionStart, ta.selectionEnd)).trim();
    const q = el.querySelector('[data-add-comment] [name=quote]');
    q.value = sel.slice(0, 300);
    el.querySelector('[data-add-comment] [name=body]').focus();
  });
  el.querySelector('[data-ask]')?.addEventListener('submit', safe(async (e) => {
    e.preventDefault();
    const f = e.target;
    await api('POST', `/api/artifacts/${a.id}/revise`, { agentId: f.agentId.value, instruction: f.instruction.value, includeComments: f.includeComments.checked });
    current.revising = true;
    current.tab = 'preview';
    render();
    toast(t('revisionStarted'), 'ok');
  }));
  el.querySelector('[data-add-comment]').onsubmit = safe(async (e) => {
    e.preventDefault();
    await api('POST', `/api/artifacts/${a.id}/comments`, { quote: e.target.quote.value, body: e.target.body.value, version: a.viewing });
    e.target.reset();
    loadComments();
  });
  el.querySelector('[data-comments]').onclick = safe(async (e) => {
    const r = e.target.closest('[data-resolve]');
    if (r) { await api('PATCH', `/api/artifact-comments/${r.dataset.resolve}`, { status: r.dataset.status }); loadComments(); }
    const d = e.target.closest('[data-del-comment]')?.dataset.delComment;
    if (d) { await api('DELETE', `/api/artifact-comments/${d}`); loadComments(); }
  });
}

// Save the source as a new version. The server three-way merges edits made from an older
// version; on a real conflict the user picks: resolve the merged text by hand, overwrite, or discard.
async function saveSource(content, { force = false } = {}) {
  const a = current.artifact;
  // Editing an older version and saving it is an explicit restore.
  const restoring = a.viewing !== a.version && !current.base;
  try {
    const r = await api('PUT', `/api/artifacts/${a.id}`, { content, baseVersion: current.base || a.viewing, force: force || restoring });
    toast(r.merge?.from ? t('mergedAuto', r.merge.into) : t('saved'), 'ok');
    current.base = null;
    current.dirty = false;
    current.tab = 'preview';
    reload();
  } catch (err) {
    if (err.status !== 409 || !err.data?.conflict) throw err;
    const choice = await conflictBox(err.data);
    if (choice === 'merge') {
      current.base = err.data.currentVersion;
      const ta = current.el.querySelector('.studio-code textarea');
      ta.value = err.data.merged;
      const at = ta.value.indexOf('<<<<<<<');
      ta.focus();
      if (at >= 0) ta.setSelectionRange(at, at);
      toast(t('resolveMarkers'), 'info', 6000);
    } else if (choice === 'force') await saveSource(content, { force: true });
    else if (choice === 'discard') { current.base = null; current.dirty = false; reload(); }
  }
}

function conflictBox(d) {
  return new Promise((resolve) => {
    const m = modal({
      title: `⚠️ ${t('editConflict')}`,
      body: `<p>${esc(t('editConflictBody', d.currentVersion, d.conflicts))}</p>`,
      footer: `<button class="btn ghost" data-c="discard">${t('discardMine')}</button><button class="btn danger" data-c="force">${t('overwriteLatest')}</button><button class="btn primary" data-c="merge">${t('resolveByHand')}</button>`,
      onClose: () => resolve(null),
    });
    m.el.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { resolve(b.dataset.c); m.el.remove(); }; });
  });
}

// Realtime: live drafts of this artifact, new versions and comment changes.
export function onStudioEvent(ev) {
  if (!current) return;
  if (ev.kind === 'video.export' && ev.artifactId === current.id && ev.version === current.artifact.viewing) {
    showVideoStatus(ev);
    if (ev.status === 'done') toast(t('videoReady'), 'ok');
    if (ev.status === 'error') toast(ev.error, 'error', 6000);
    return;
  }
  if (ev.kind === 'artifact.draft' && ev.title === current.artifact.title) {
    current.revising = true;
    const frame = current.el.querySelector('.studio-frame');
    if (frame && current.tab === 'preview') { frame.removeAttribute('src'); frame.srcdoc = draftDoc(ev); }
    if (!current.el.querySelector('.revising-badge')) current.el.querySelector('.device')?.insertAdjacentHTML('afterbegin', `<div class="revising-badge"><span class="spin">✍️</span> ${t('revising')}</div>`);
  }
  if (ev.kind === 'artifact.updated' && ev.artifactId === current.id) {
    if (ev.deleted) return close();
    if (ev.comments) return loadComments();
    current.revising = false;
    // Don't wipe unsaved source edits; saving will merge with the new version.
    if (!current.collab && current.tab === 'code' && current.dirty) { toast(t('newVersionWhileEditing'), 'info', 6000); return; }
    reload();
  }
}
