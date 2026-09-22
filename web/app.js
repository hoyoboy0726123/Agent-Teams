// Agent Teams web client: auth, layout, channels, realtime chat.
import { markdown } from './md.js';
import { t, getLang, setLang } from './i18n.js';
import { $, $$, esc, api, toast, safe, modal, confirmBox, promptBox, formData, clock, dayLabel, initials } from './ui.js';
import { renderPanel, openWorkflowEditor } from './panels.js';
import { openSettings, openAgentEditor, openTeamTemplates } from './settings.js';
import { openStudio, openArtifact, draftDoc, onStudioEvent } from './studio.js';
import { renderView, VIEWS, onViewEvent } from './views.js';

export const S = {
  user: null, users: [], agents: [], channels: [], providers: [], catalog: [], settings: {}, agentTemplates: [], agentTools: [],
  current: null, messages: new Map(), hasMore: new Map(), panel: null, unread: new Set(), typing: new Map(), online: new Set(),
  sidebarOpen: false, view: 'chat', drafts: new Map(), bookmarks: new Set(), pendingFiles: [],
};

export const agentById = (id) => S.agents.find((a) => a.id === id);
export const userById = (id) => S.users.find((u) => u.id === id);
export const channelById = (id) => S.channels.find((c) => c.id === id);
export const currentChannel = () => channelById(S.current);
export const isAdmin = () => ['owner', 'admin'].includes(S.user?.role);

// ------------------------------------------------------------------ theme

function applyTheme() {
  let th = null;
  try { th = localStorage.getItem('theme'); } catch {}
  if (th) document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme;
}
function toggleTheme() {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  try { localStorage.setItem('theme', dark ? 'light' : 'dark'); } catch {}
  applyTheme();
}
applyTheme();

// ------------------------------------------------------------------ boot / auth

async function boot() {
  const b = await api('GET', '/api/bootstrap');
  document.title = b.workspaceName || 'Agent Teams';
  if (!b.user) return renderAuth(b);
  await loadState();
  renderShell();
  connectWs();
  api('GET', '/api/bookmarks/ids').then((ids) => { S.bookmarks = new Set(ids.map((b) => `${b.kind}:${b.id}`)); }).catch(() => {});
  route();
}

// #/c/<channel> | #/agents | #/automations | #/tasks | #/memory | #/outputs
function route() {
  const h = location.hash;
  const view = /^#\/(\w+)$/.exec(h)?.[1];
  if (view && VIEWS[view]) return openView(view);
  const fromHash = /^#\/c\/(.+)$/.exec(h)?.[1];
  openChannel(channelById(fromHash)?.id || channelById(S.current)?.id || S.channels.find((c) => c.name === 'general')?.id || S.channels[0]?.id);
}

export function openView(name) {
  S.view = name;
  S.sidebarOpen = false;
  if (location.hash !== `#/${name}`) history.replaceState(null, '', `#/${name}`);
  $('#chat-view').hidden = true;
  $('#view').hidden = false;
  S.panel = null;
  syncOverlays();
  renderSidebar();
  renderView(name, $('#view'));
}

export async function loadState() {
  const st = await api('GET', '/api/state');
  Object.assign(S, st);
  document.title = S.settings.workspaceName || 'Agent Teams';
}

function renderAuth(b) {
  const setup = b.needsSetup;
  document.body.innerHTML = `<main class="auth">
    <div class="auth-card">
      <div class="brand"><span class="logo">🤝</span><div><h1>${esc(b.workspaceName || 'Agent Teams')}</h1><p>${t('appTagline')}</p></div></div>
      <h2>${setup ? t('setupTitle') : t('loginTitle')}</h2>
      ${setup ? `<p class="muted small">${t('setupHint')}</p>` : ''}
      <form id="auth-form">
        ${setup ? `<label class="field"><span>${t('workspaceName')}</span><input name="workspaceName" value="My Team" required></label>
        <label class="field"><span>${t('displayName')}</span><input name="displayName" required autocomplete="name"></label>` : ''}
        <label class="field"><span>${t('username')}</span><input name="username" required autocomplete="username" pattern="[A-Za-z0-9_.\\-]{2,32}"></label>
        <label class="field"><span>${t('password')}</span><input name="password" type="password" required minlength="6" autocomplete="${setup ? 'new-password' : 'current-password'}"></label>
        <button class="btn primary block" type="submit">${setup ? t('create') : t('signIn')}</button>
        ${!setup && !b.allowRegistration ? `<p class="muted small center">${t('noAccount')}</p>` : ''}
        ${!setup && b.allowRegistration ? `<p class="center small"><a href="#" id="to-register">${t('signUp')}</a></p>` : ''}
      </form>
      <p class="center small"><a href="#" id="lang-toggle">${t('language')}</a></p>
    </div></main>`;
  let registering = setup;
  $('#auth-form').onsubmit = safe(async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = t('loading');
    try {
      await api('POST', registering ? '/api/auth/register' : '/api/auth/login', formData(e.target));
      location.reload();
    } finally { btn.disabled = false; btn.textContent = registering ? t('create') : t('signIn'); }
  });
  const reg = $('#to-register');
  if (reg) reg.onclick = (e) => { e.preventDefault(); registering = true; $('#auth-form button[type=submit]').textContent = t('create'); reg.remove(); };
  $('#lang-toggle').onclick = (e) => { e.preventDefault(); setLang(getLang() === 'en' ? 'zh-TW' : 'en'); renderAuth(b); };
}

// ------------------------------------------------------------------ shell

function renderShell() {
  document.body.innerHTML = `
  <div class="app" id="app">
    <aside class="sidebar" id="sidebar"></aside>
    <main class="main">
      <section class="chat-view" id="chat-view">
        <header class="chan-header" id="chan-header"></header>
        <div class="messages" id="messages" aria-live="polite"></div>
        <div class="typing" id="typing"></div>
        <form class="composer" id="composer">
          <div class="mention-pop" id="mention-pop" hidden></div>
          <div class="pending-files" id="pending-files" hidden></div>
          <textarea id="input" rows="1" autocomplete="off"></textarea>
          <div class="composer-bar">
            <label class="icon-btn attach" title="${t('attach')}">📎<input type="file" id="file-input" multiple hidden></label>
            <span class="muted small grow" id="mode-hint"></span>
            <button class="btn primary" type="submit" id="send-btn">${t('send')} ↵</button>
          </div>
        </form>
      </section>
      <section class="view" id="view" hidden></section>
    </main>
    <aside class="panel" id="panel" hidden></aside>
    <div class="scrim" id="scrim"></div>
  </div>`;
  renderSidebar();
  bindComposer();
  $('#messages').addEventListener('click', onMessageClick);
  $('#messages').addEventListener('scroll', onMessagesScroll);
  $('#scrim').onclick = () => { S.sidebarOpen = false; S.panel = null; syncOverlays(); };
}

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && S.user) { e.preventDefault(); openSearch(); }
});

function syncOverlays() {
  $('#app').classList.toggle('sidebar-open', S.sidebarOpen);
  $('#app').classList.toggle('panel-open', !!S.panel);
  $('#panel').hidden = !S.panel;
}

export function renderSidebar() {
  const el = $('#sidebar');
  if (!el) return;
  const chans = S.channels.filter((c) => c.kind === 'channel');
  const dms = S.channels.filter((c) => c.kind === 'dm');
  const dmAgent = (c) => agentById(c.members.agents[0]);
  el.innerHTML = `
    <div class="ws-head">
      <span class="logo">🤝</span><strong class="grow ellipsis">${esc(S.settings.workspaceName || 'Agent Teams')}</strong>
      <button class="icon-btn" data-act="search" title="${t('search')} (Ctrl+K)">🔍</button>
    </div>
    <nav>
      <div class="view-nav">${Object.entries(VIEWS).map(([k, v]) => `<button class="view-item${S.view === k ? ' on' : ''}" data-view="${k}"><span>${v.icon}</span><span>${t('view_' + k)}</span></button>`).join('')}</div>
      <div class="nav-title"><span>${t('channels')}</span>${S.user.role !== 'guest' ? `<button class="icon-btn sm" data-act="new-channel" title="${t('newChannel')}">＋</button>` : ''}</div>
      ${chans.map((c) => `<a href="#/c/${c.id}" class="nav-item${c.id === S.current && S.view === 'chat' ? ' active' : ''}${S.unread.has(c.id) ? ' unread' : ''}" data-channel="${c.id}">
        <span class="hash">${c.private ? '🔒' : '#'}</span><span class="ellipsis">${esc(c.name)}</span></a>`).join('')}
      <div class="nav-title"><span>${t('directMessages')}</span></div>
      ${dms.map((c) => { const a = dmAgent(c); return `<a href="#/c/${c.id}" class="nav-item${c.id === S.current && S.view === 'chat' ? ' active' : ''}${S.unread.has(c.id) ? ' unread' : ''}" data-channel="${c.id}">
        <span class="mini-av" style="--c:${esc(a?.color || '#888')}">${esc(a?.avatar || '🤖')}</span><span class="ellipsis">${esc(a?.name || c.name)}</span></a>`; }).join('')}
      <div class="nav-title"><span>${t('agents')}</span>${S.user.role !== 'guest' ? `<button class="icon-btn sm" data-act="new-agent" title="${t('newAgent')}">＋</button>` : ''}</div>
      ${S.agents.map((a) => `<div class="nav-item agent-row" data-dm="${a.id}" title="${esc(a.description)}">
        <span class="mini-av" style="--c:${esc(a.color)}">${esc(a.avatar)}</span><span class="ellipsis grow">${esc(a.name)}</span>
        ${!a.providerId ? `<span class="warn-dot" title="${t('noProvider')}">!</span>` : ''}
        ${S.user.role !== 'guest' ? `<button class="icon-btn sm hover-only" data-edit-agent="${a.id}" title="${t('edit')}">✎</button>` : ''}</div>`).join('')}
      ${S.user.role !== 'guest' ? `<button class="nav-item subtle" data-act="team">＋ ${t('addTeam')}</button>` : ''}
    </nav>
    <div class="me">
      <span class="avatar sm user">${esc(initials(S.user.displayName))}</span>
      <div class="grow ellipsis"><div class="ellipsis">${esc(S.user.displayName)}</div><div class="muted small">${t('role_' + S.user.role)}</div></div>
      <button class="icon-btn" data-act="lang" title="Language">🌐</button>
      <button class="icon-btn" data-act="theme" title="${t('theme')}">◐</button>
      <button class="icon-btn" data-act="settings" title="${t('settings')}">⚙</button>
      <button class="icon-btn" data-act="logout" title="${t('logout')}">⎋</button>
    </div>`;
  el.onclick = safe(async (e) => {
    const v = e.target.closest('[data-view]')?.dataset.view;
    if (v) { openView(v); return; }
    const chan = e.target.closest('[data-channel]');
    if (chan) { e.preventDefault(); openChannel(chan.dataset.channel); return; }
    const edit = e.target.closest('[data-edit-agent]');
    if (edit) { e.stopPropagation(); openAgentEditor(agentById(edit.dataset.editAgent)); return; }
    const dm = e.target.closest('[data-dm]');
    if (dm) { const c = await api('POST', '/api/dm', { agentId: dm.dataset.dm }); await refreshChannels(); openChannel(c.id); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'new-channel') openChannelEditor();
    if (act === 'new-agent') openAgentEditor();
    if (act === 'team') openTeamTemplates();
    if (act === 'settings') openSettings();
    if (act === 'search') openSearch();
    if (act === 'theme') toggleTheme();
    if (act === 'lang') { setLang(getLang() === 'en' ? 'zh-TW' : 'en'); renderShell(); route(); }
    if (act === 'logout') { await api('POST', '/api/auth/logout', {}); location.reload(); }
  });
}

export async function refreshChannels() {
  S.channels = await api('GET', '/api/channels');
  renderSidebar();
  if (S.current && !channelById(S.current)) openChannel(S.channels[0]?.id);
  else renderHeader();
}

export async function refreshAgents() {
  S.agents = await api('GET', '/api/agents');
  renderSidebar();
  renderHeader();
}

// ------------------------------------------------------------------ channel view

export async function openChannel(cid) {
  if (!cid) { $('#messages').innerHTML = `<div class="empty">${t('welcomeEmpty')}</div>`; return; }
  S.current = cid;
  S.view = 'chat';
  $('#chat-view').hidden = false;
  $('#view').hidden = true;
  S.unread.delete(cid);
  S.sidebarOpen = false;
  if (location.hash !== `#/c/${cid}`) history.replaceState(null, '', `#/c/${cid}`);
  renderSidebar();
  renderHeader();
  syncOverlays();
  $('#messages').innerHTML = `<div class="empty">${t('loading')}</div>`;
  const list = await api('GET', `/api/channels/${cid}/messages?limit=60`);
  if (S.current !== cid) return;
  S.messages.set(cid, list);
  S.hasMore.set(cid, list.length >= 60);
  renderMessages(true);
  renderTyping();
  if (S.panel) renderPanel();
  $('#input')?.focus();
}

const MODE_LABEL = { auto: 'modeAuto', mention: 'modeMention', roundtable: 'modeRoundtable' };

export function renderHeader() {
  const c = currentChannel();
  const el = $('#chan-header');
  if (!el || !c) return;
  const dmA = c.kind === 'dm' ? agentById(c.members.agents[0]) : null;
  const agentsIn = c.members.agents.map(agentById).filter(Boolean);
  el.innerHTML = `
    <button class="icon-btn only-mobile" data-act="menu" aria-label="menu">☰</button>
    <div class="grow chan-title">
      <h1 class="ellipsis">${dmA ? `<span class="mini-av" style="--c:${esc(dmA.color)}">${esc(dmA.avatar)}</span> ${esc(dmA.name)}` : `${c.private ? '🔒' : '#'} ${esc(c.name)}`}</h1>
      <div class="muted small ellipsis">${esc(dmA ? dmA.description : c.topic || '')}</div>
    </div>
    ${c.kind === 'channel' ? `<select class="mode-select" data-act="mode" title="${t('mode')}">${Object.entries(MODE_LABEL).map(([k, v]) => `<option value="${k}"${c.mode === k ? ' selected' : ''}>${t(v)}</option>`).join('')}</select>` : ''}
    <div class="stack" data-act="members" title="${t('members')}">${agentsIn.slice(0, 5).map((a) => `<span class="mini-av" style="--c:${esc(a.color)}">${esc(a.avatar)}</span>`).join('')}${agentsIn.length > 5 ? `<span class="mini-av more">+${agentsIn.length - 5}</span>` : ''}</div>
    <div class="tabs">
      ${['memory', 'artifacts', 'workflows', 'members'].map((p) => `<button class="tab${S.panel === p ? ' on' : ''}" data-panel="${p}">${{ memory: '🧠', artifacts: '📄', workflows: '⚡', members: '👥' }[p]}<span class="hide-sm"> ${t(p)}</span></button>`).join('')}
    </div>
    ${c.kind === 'channel' ? `<button class="icon-btn" data-act="chan-settings" title="${t('channelSettings')}">⋯</button>` : ''}`;
  el.onclick = (e) => {
    const p = e.target.closest('[data-panel]')?.dataset.panel;
    if (p) { S.panel = S.panel === p ? null : p; syncOverlays(); renderHeader(); if (S.panel) renderPanel(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'menu') { S.sidebarOpen = !S.sidebarOpen; syncOverlays(); }
    if (act === 'members') { S.panel = 'members'; syncOverlays(); renderHeader(); renderPanel(); }
    if (act === 'chan-settings') openChannelEditor(c);
  };
  const sel = el.querySelector('[data-act=mode]');
  if (sel) sel.onchange = safe(async () => { await api('PATCH', `/api/channels/${c.id}`, { mode: sel.value }); c.mode = sel.value; renderModeHint(); });
  renderModeHint();
}

function renderModeHint() {
  const c = currentChannel();
  const el = $('#mode-hint');
  if (!el || !c) return;
  el.textContent = c.kind === 'dm' ? t('dmHint') : t({ auto: 'modeAutoHint', mention: 'modeMentionHint', roundtable: 'modeRoundtableHint' }[c.mode]);
  $('#input').placeholder = c.kind === 'dm' ? t('composerPlaceholderDm', agentById(c.members.agents[0])?.name || c.name) : t('composerPlaceholder', c.name);
}

// ------------------------------------------------------------------ messages

function authorOf(m) {
  if (m.authorType === 'agent') { const a = agentById(m.authorId); return { name: a?.name || 'Agent', avatar: a?.avatar || '🤖', color: a?.color || '#888', agent: a }; }
  if (m.authorType === 'user') { const u = userById(m.authorId); return { name: u?.displayName || 'User', avatar: initials(u?.displayName), user: u }; }
  return { name: 'System' };
}

const TYPE_BADGE = { slides: 'SLIDES', dashboard: 'DASHBOARD', website: 'WEB', research: 'RESEARCH', document: 'DOC' };
const TYPE_ICON = { slides: '🎞️', dashboard: '📊', website: '🌐', research: '🔬', document: '📄' };

// Deliverable card with a live, sandboxed preview of the artifact.
function artifactCard(id, meta) {
  const a = meta?.artifacts?.find((x) => x.id === id) || { type: 'document', title: 'Artifact', version: 1 };
  return `<div class="deliverable" data-type="${esc(a.type)}">
    <button class="deliv-head" data-artifact="${esc(id)}"><span>${TYPE_ICON[a.type] || '📄'}</span><strong class="ellipsis grow">${esc(a.title)}</strong><span class="type-badge t-${esc(a.type)}">${TYPE_BADGE[a.type] || 'DOC'}</span></button>
    <div class="deliv-preview" data-artifact="${esc(id)}"><iframe loading="lazy" tabindex="-1" sandbox="allow-scripts" src="/api/artifacts/${esc(id)}/render" title="${esc(a.title)}"></iframe><span class="deliv-expand">⤢</span></div>
    <div class="deliv-foot"><span class="muted small">v${a.version} · ${t('type_' + a.type)}</span><span class="grow"></span>
      <button class="icon-btn sm" data-bookmark-art="${esc(id)}" title="${t('bookmark')}">${S.bookmarks.has('artifact:' + id) ? '🔖' : '📑'}</button>
      <button class="btn primary sm" data-artifact="${esc(id)}">${t('openStudio')}</button></div>
  </div>`;
}

// While the agent is still writing: a live preview that re-renders as tokens stream in.
function draftCard(messageId, title) {
  const d = S.drafts.get(messageId);
  return `<div class="deliverable drafting" data-draft="${esc(messageId)}">
    <div class="deliv-head"><span class="spin">✍️</span><strong class="ellipsis grow">${esc(t('drafting', title))}</strong><span class="type-badge live">LIVE</span></div>
    <div class="deliv-preview">${d ? `<iframe tabindex="-1" sandbox="allow-scripts" srcdoc="${esc(draftDoc(d))}"></iframe>` : `<div class="deliv-skeleton"><i></i><i></i><i></i></div>`}</div>
  </div>`;
}

export function renderBody(m) {
  const tokens = [];
  const src = m.content.replace(/\[\[(artifact|artifact-draft|tool-running)(?::([^\]]*))?\]\]/g, (_, kind, arg) => {
    tokens.push(kind === 'artifact' ? artifactCard(arg, m.meta)
      : kind === 'artifact-draft' ? draftCard(m.id, arg)
        : `<div class="tool-running"><span class="spin">⚙️</span> ${t('usingTools')}</div>`);
    return `\n\n\u0001${tokens.length - 1}\u0001\n\n`;
  });
  let html = markdown(src, { mentions: true });
  html = html.replace(/<p>\u0001(\d+)\u0001<\/p>/g, (_, i) => tokens[+i]).replace(/\u0001(\d+)\u0001/g, (_, i) => tokens[+i]);
  return html;
}

function messageHtml(m, prev) {
  if (m.authorType === 'system') return `<div class="msg system" data-id="${m.id}"><div class="body">${markdown(m.content, { mentions: true })}</div></div>`;
  const au = authorOf(m);
  const grouped = prev && prev.authorType === m.authorType && prev.authorId === m.authorId && m.createdAt - prev.createdAt < 5 * 60_000 && prev.status !== 'error' && !m.meta?.artifacts?.length;
  const streaming = m.status === 'streaming';
  const empty = !m.content.trim();
  const tools = (m.meta?.tools || []).map((x) => `<span class="chip ${x.ok ? '' : 'bad'}" title="${esc(x.summary || '')}">🔧 ${esc(x.name)} ${x.ok ? '✓' : '✗'}</span>`).join('');
  const mems = (m.meta?.memories || []).map((x) => `<span class="chip mem" title="${esc(x.content)}">🧠 ${esc(x.content.slice(0, 48))}${x.content.length > 48 ? '…' : ''}</span>`).join('');
  const model = au.agent ? (au.agent.model || S.providers.find((p) => p.id === au.agent.providerId)?.name || '') : '';
  const files = (m.meta?.files || []).map((f) => /^image\//.test(f.mime)
    ? `<a class="file-thumb" href="/api/files/${esc(f.id)}" target="_blank" rel="noopener"><img src="/api/files/${esc(f.id)}" alt="${esc(f.name)}" loading="lazy"></a>`
    : `<a class="file-chip" href="/api/files/${esc(f.id)}" target="_blank" rel="noopener">📎 ${esc(f.name)} <span class="muted small">${Math.max(1, Math.round(f.size / 1024))} KB</span></a>`).join('');
  const approvals = (m.meta?.approvals || []).map((ap) => `<div class="approval ${esc(ap.status)}">
      <div>🔐 <strong>${esc(au.name)}</strong> ${t('wantsToRun')} <code>${esc(ap.tool)}</code></div>
      <pre class="approval-args">${esc(JSON.stringify(ap.args ?? {}, null, 2)).slice(0, 1200)}</pre>
      ${ap.status === 'pending' ? (S.user.role !== 'guest' ? `<div class="row"><button class="btn primary sm" data-approve="${esc(ap.id)}">✓ ${t('approve')}</button><button class="btn sm" data-deny="${esc(ap.id)}">✕ ${t('deny')}</button></div>` : `<span class="muted small">${t('waitingApproval')}</span>`)
        : `<span class="chip ${ap.status === 'approved' ? 'ok' : 'bad'}">${t('approval_' + ap.status)}</span>`}</div>`).join('');
  const tasks = (m.meta?.tasks || []).map((x) => `<span class="chip task" data-goto-tasks>✅ ${esc(x.title)}${x.assigneeId ? ` → ${esc(x.assigneeType === 'agent' ? '@' + (agentById(x.assigneeId)?.handle || '') : userById(x.assigneeId)?.displayName || '')}` : ''}</span>`).join('');
  const suggestions = !streaming && m.meta?.suggestions?.length ? `<div class="suggestions">${m.meta.suggestions.map((x) => `<button class="suggest" data-suggest="${esc(x)}">↗ ${esc(x)}</button>`).join('')}</div>` : '';
  const fb = m.meta?.feedback || {};
  const secs = m.meta?.durationMs ? Math.max(1, Math.round(m.meta.durationMs / 1000)) : 0;
  const footer = m.authorType === 'agent' && !streaming && m.status !== 'error' ? `<div class="msg-foot">
      ${secs ? `<span class="muted small" title="${t('genTime')}">⏱ ${secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`}</span>` : ''}
      ${m.meta?.tools?.length ? `<span class="muted small">· 🔧 ${m.meta.tools.length}</span>` : ''}
      <span class="grow"></span>
      <button class="icon-btn sm${fb.mine === 1 ? ' on' : ''}" data-fb-up="${m.id}" title="${t('helpful')}">👍${fb.up ? ` ${fb.up}` : ''}</button>
      <button class="icon-btn sm${fb.mine === -1 ? ' on' : ''}" data-fb-down="${m.id}" title="${t('notHelpful')}">👎${fb.down ? ` ${fb.down}` : ''}</button>
      <button class="icon-btn sm" data-bookmark-msg="${m.id}" title="${t('bookmark')}">${S.bookmarks.has('message:' + m.id) ? '🔖' : '📑'}</button>
    </div>` : '';
  return `<div class="msg${grouped ? ' grouped' : ''}${streaming ? ' streaming' : ''}${m.status === 'error' ? ' error' : ''}" data-id="${m.id}">
    <div class="gutter">${grouped ? `<span class="hover-time">${clock(m.createdAt)}</span>` : au.agent ? `<span class="avatar agent" style="--c:${esc(au.color)}">${esc(au.avatar)}</span>` : `<span class="avatar user">${esc(au.avatar)}</span>`}</div>
    <div class="content">
      ${grouped ? '' : `<div class="meta"><strong>${esc(au.name)}</strong>${au.agent ? `<span class="badge">AI</span>${model ? `<span class="muted small">${esc(model)}</span>` : ''}` : ''}<span class="muted small">${clock(m.createdAt)}</span>${m.meta?.edited ? `<span class="muted small">(edited)</span>` : ''}</div>`}
      ${files ? `<div class="files">${files}</div>` : ''}
      <div class="body">${empty && streaming ? `<span class="dots"><i></i><i></i><i></i></span>` : renderBody(m)}</div>
      ${approvals}
      ${tools || mems || tasks ? `<div class="chips">${tools}${mems}${tasks}</div>` : ''}
      ${suggestions}${footer}
      ${m.status === 'error' ? `<div class="err-box">⚠️ ${t('errorReply')}: ${esc(m.meta?.error || '')} <button class="btn sm" data-regen="${m.id}">${t('retry')}</button></div>` : ''}
    </div>
    <div class="msg-actions">
      ${streaming ? `<button class="icon-btn sm" data-stop="${m.id}" title="${t('stop')}">■</button>` : `
      <button class="icon-btn sm" data-copy="${m.id}" title="${t('copy')}">⧉</button>
      <button class="icon-btn sm" data-quote="${m.id}" title="${t('reply')}">❝</button>
      <button class="icon-btn sm" data-remember="${m.id}" title="${t('rememberThis')}">🧠</button>
      ${m.authorType === 'agent' ? `<button class="icon-btn sm" data-regen="${m.id}" title="${t('regenerate')}">↻</button>` : ''}
      ${m.authorType === 'agent' || m.authorId === S.user.id || isAdmin() ? `<button class="icon-btn sm" data-del="${m.id}" title="${t('delete')}">🗑</button>` : ''}`}
    </div>
  </div>`;
}

function emptyState() {
  const c = currentChannel();
  const agentsIn = (c?.members.agents || []).map(agentById).filter(Boolean);
  const starters = agentsIn.flatMap((a) => (a.starters || []).slice(0, c?.kind === 'dm' ? 4 : 1).map((x) => ({ a, x }))).slice(0, 6);
  const dmA = c?.kind === 'dm' ? agentsIn[0] : null;
  return `<div class="empty-chat">
    ${dmA ? `<span class="avatar agent xl" style="--c:${esc(dmA.color)}">${esc(dmA.avatar)}</span><h2>${esc(dmA.name)}</h2><p class="muted">${esc(dmA.description)}</p>` : `<div class="big-emoji">👋</div><p class="muted">${t('welcomeEmpty')}</p>`}
    ${starters.length ? `<div class="starters">${starters.map(({ a, x }) => `<button class="starter" data-suggest="${esc(c?.kind === 'dm' ? x : `@${a.handle} ${x}`)}"><span class="mini-av" style="--c:${esc(a.color)}">${esc(a.avatar)}</span>${esc(x)}</button>`).join('')}</div>` : ''}
  </div>`;
}

export function renderMessages(scrollToEnd = false) {
  const box = $('#messages');
  const list = S.messages.get(S.current) || [];
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (!list.length) { box.innerHTML = emptyState(); return; }
  let html = S.hasMore.get(S.current) ? `<button class="btn ghost sm load-older" data-older>${t('loadOlder')}</button>` : '';
  let lastDay = '';
  list.forEach((m, i) => {
    const day = new Date(m.createdAt).toDateString();
    if (day !== lastDay) { html += `<div class="day-sep"><span>${dayLabel(m.createdAt)}</span></div>`; lastDay = day; }
    html += messageHtml(m, i && new Date(list[i - 1].createdAt).toDateString() === day ? list[i - 1] : null);
  });
  box.innerHTML = html;
  if (scrollToEnd || nearBottom) box.scrollTop = box.scrollHeight;
}

function patchMessage(m) {
  const list = S.messages.get(m.channelId);
  if (!list) return;
  const i = list.findIndex((x) => x.id === m.id);
  if (i === -1) return;
  list[i] = m;
  if (m.channelId !== S.current) return;
  const el = $(`#messages [data-id="${m.id}"]`);
  if (!el) return renderMessages();
  const box = $('#messages');
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  el.outerHTML = messageHtml(m, i ? list[i - 1] : null);
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

async function onMessagesScroll(e) {
  if (e.target.scrollTop > 40 || !S.hasMore.get(S.current) || S.loadingOlder) return;
  loadOlder();
}

async function loadOlder() {
  const cid = S.current;
  const list = S.messages.get(cid) || [];
  if (!list.length) return;
  S.loadingOlder = true;
  try {
    const older = await api('GET', `/api/channels/${cid}/messages?before=${list[0].createdAt}&limit=60`);
    if (S.current !== cid) return;
    const box = $('#messages');
    const prevH = box.scrollHeight;
    S.messages.set(cid, [...older, ...list]);
    S.hasMore.set(cid, older.length >= 60);
    renderMessages();
    box.scrollTop = box.scrollHeight - prevH;
  } finally { S.loadingOlder = false; }
}

const onMessageClick = safe(async (e) => {
  const d = (k) => e.target.closest(`[data-${k}]`)?.dataset[k.replace(/-(\w)/g, (_, c) => c.toUpperCase())];
  const findMsg = (id) => (S.messages.get(S.current) || []).find((m) => m.id === id);
  if (e.target.closest('[data-older]')) return loadOlder();
  const art = d('artifact');
  if (art) return openStudio(art);
  if (d('suggest')) { const input = $('#input'); input.value = d('suggest'); autoGrow(input); input.focus(); return; }
  if (e.target.closest('[data-goto-tasks]')) return openView('tasks');
  if (d('approve') || d('deny')) { await api('POST', `/api/approvals/${d('approve') || d('deny')}`, { approve: !!d('approve') }); return; }
  if (d('fb-up') || d('fb-down')) {
    const mid = d('fb-up') || d('fb-down');
    const m = findMsg(mid);
    const mine = m.meta?.feedback?.mine;
    const value = d('fb-up') ? (mine === 1 ? 0 : 1) : (mine === -1 ? 0 : -1);
    let comment = '';
    if (value === -1) comment = (await promptBox(t('whatWentWrong'), { placeholder: t('feedbackHint'), multiline: true, ok: t('send') })) ?? '';
    const r = await api('POST', `/api/messages/${mid}/feedback`, { value, comment });
    m.meta = { ...m.meta, feedback: { up: r.up, down: r.down, mine: r.value } };
    patchMessage(m);
    if (comment) toast(t('feedbackLearned'), 'ok');
    return;
  }
  if (d('bookmark-msg') || d('bookmark-art')) {
    const kind = d('bookmark-msg') ? 'message' : 'artifact';
    const tid = d('bookmark-msg') || d('bookmark-art');
    const on = !S.bookmarks.has(`${kind}:${tid}`);
    await api('POST', '/api/bookmarks', { kind, id: tid, on });
    if (on) S.bookmarks.add(`${kind}:${tid}`); else S.bookmarks.delete(`${kind}:${tid}`);
    toast(on ? t('bookmarked') : t('unbookmarked'));
    renderMessages();
    return;
  }
  const mention = e.target.closest('.mention')?.dataset.handle;
  if (mention) { const a = S.agents.find((x) => x.handle.toLowerCase() === mention.toLowerCase()); if (a) return openAgentEditor(a, { readOnly: S.user.role === 'guest' }); }
  if (d('stop')) return api('POST', `/api/messages/${d('stop')}/stop`, {});
  if (d('regen')) return api('POST', `/api/messages/${d('regen')}/regenerate`, {});
  if (d('del')) { if (await confirmBox(t('delete') + '?')) await api('DELETE', `/api/messages/${d('del')}`); return; }
  if (d('copy')) { await navigator.clipboard.writeText(findMsg(d('copy'))?.content || ''); return toast(t('copied')); }
  if (d('quote')) {
    const m = findMsg(d('quote'));
    const input = $('#input');
    input.value = `> ${m.content.split('\n').slice(0, 6).join('\n> ')}\n\n${input.value}`;
    autoGrow(input); input.focus();
    return;
  }
  if (d('remember')) {
    const m = findMsg(d('remember'));
    await api('POST', '/api/memories', { scope: 'channel', scopeId: S.current, content: m.content.replace(/\[\[[^\]]+\]\]/g, '').slice(0, 1500) });
    toast(t('remembered'), 'ok');
  }
});

// ------------------------------------------------------------------ composer

function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 240) + 'px'; }

function bindComposer() {
  const input = $('#input');
  const pop = $('#mention-pop');
  let sel = 0, items = [], typingSent = 0;

  const candidates = (q) => {
    const c = currentChannel();
    const inCh = new Set(c?.members.agents || []);
    const agents = S.agents.map((a) => ({ handle: a.handle, label: a.name, icon: a.avatar, color: a.color, sub: inCh.has(a.id) ? a.description : `+ ${a.description}` }));
    const people = S.users.filter((u) => u.id !== S.user.id).map((u) => ({ handle: u.username, label: u.displayName, icon: initials(u.displayName), sub: '' }));
    const all = [{ handle: 'all', label: '@all', icon: '📣', sub: t('modeRoundtableHint') }, ...agents, ...people];
    const ql = q.toLowerCase();
    return all.filter((x) => x.handle.toLowerCase().startsWith(ql) || x.label.toLowerCase().includes(ql)).slice(0, 8);
  };
  const currentToken = () => {
    const upto = input.value.slice(0, input.selectionStart);
    return /(?:^|[\s(（])@([\p{L}\p{N}_-]*)$/u.exec(upto);
  };
  const showPop = () => {
    const m = currentToken();
    if (!m) { pop.hidden = true; return; }
    items = candidates(m[1]);
    if (!items.length) { pop.hidden = true; return; }
    sel = Math.min(sel, items.length - 1);
    pop.innerHTML = items.map((x, i) => `<div class="mention-item${i === sel ? ' on' : ''}" data-i="${i}"><span class="mini-av" style="--c:${esc(x.color || '#94a3b8')}">${esc(x.icon)}</span><strong>@${esc(x.handle)}</strong><span class="muted small ellipsis">${esc(x.label !== '@all' ? x.label : '')} ${esc(x.sub || '')}</span></div>`).join('');
    pop.hidden = false;
  };
  const pick = (i) => {
    const m = currentToken();
    if (!m) return;
    const start = input.selectionStart - m[1].length;
    input.value = input.value.slice(0, start) + items[i].handle + ' ' + input.value.slice(input.selectionStart);
    input.selectionStart = input.selectionEnd = start + items[i].handle.length + 1;
    pop.hidden = true;
    input.focus();
  };
  pop.addEventListener('mousedown', (e) => { const it = e.target.closest('[data-i]'); if (it) { e.preventDefault(); pick(+it.dataset.i); } });

  input.addEventListener('input', () => {
    autoGrow(input);
    showPop();
    if (Date.now() - typingSent > 2500 && input.value) { typingSent = Date.now(); ws?.readyState === 1 && ws.send(JSON.stringify({ kind: 'typing', channelId: S.current, on: true })); }
  });
  input.addEventListener('keydown', (e) => {
    if (!pop.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % items.length; showPop(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; showPop(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(sel); return; }
      if (e.key === 'Escape') { pop.hidden = true; return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
  });
  $('#composer').onsubmit = safe(async (e) => {
    e.preventDefault();
    const content = input.value.trim();
    const ready = S.pendingFiles.filter((f) => f.id);
    if ((!content && !ready.length) || !S.current) return;
    if (S.pendingFiles.some((f) => !f.id)) return toast(t('uploading'));
    input.value = '';
    autoGrow(input);
    pop.hidden = true;
    const fileIds = ready.map((f) => f.id);
    S.pendingFiles = [];
    renderPendingFiles();
    try { await api('POST', `/api/channels/${S.current}/messages`, { content, fileIds }); }
    catch (err) { input.value = content; throw err; }
  });
  $('#file-input').onchange = (e) => { uploadFiles([...e.target.files]); e.target.value = ''; };
  input.addEventListener('paste', (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); uploadFiles(fs); } });
  const comp = $('#composer');
  comp.addEventListener('dragover', (e) => { e.preventDefault(); comp.classList.add('drop'); });
  comp.addEventListener('dragleave', () => comp.classList.remove('drop'));
  comp.addEventListener('drop', (e) => { e.preventDefault(); comp.classList.remove('drop'); uploadFiles([...e.dataTransfer.files]); });
  $('#pending-files').onclick = (e) => { const i = e.target.closest('[data-rm-file]')?.dataset.rmFile; if (i != null) { S.pendingFiles.splice(+i, 1); renderPendingFiles(); } };
}

function renderPendingFiles() {
  const el = $('#pending-files');
  el.hidden = !S.pendingFiles.length;
  el.innerHTML = S.pendingFiles.map((f, i) => `<span class="file-chip${f.id ? '' : ' uploading'}">${f.id ? '📎' : '<span class="spin">⏳</span>'} ${esc(f.name)}<button type="button" class="icon-btn sm" data-rm-file="${i}">✕</button></span>`).join('');
}

const readB64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file); });

async function uploadFiles(list) {
  const cid = S.current;
  for (const file of list) {
    if (file.size > 15 * 1024 * 1024) { toast(`${file.name}: > 15 MB`, 'error'); continue; }
    const entry = { name: file.name, id: null };
    S.pendingFiles.push(entry);
    renderPendingFiles();
    try {
      const f = await api('POST', `/api/channels/${cid}/files`, { name: file.name, mime: file.type || 'application/octet-stream', data: await readB64(file) });
      entry.id = f.id;
      if (!f.hasText && !/^image\//.test(f.mime)) toast(`${file.name}: ${t('fileNotReadable')}`);
    } catch (e) {
      S.pendingFiles.splice(S.pendingFiles.indexOf(entry), 1);
      toast(e.message, 'error');
    }
    renderPendingFiles();
  }
}

// ------------------------------------------------------------------ typing indicator

function renderTyping() {
  const el = $('#typing');
  if (!el) return;
  const map = S.typing.get(S.current);
  const names = map ? [...map.values()] : [];
  const agentNames = names.filter((n) => n.agent).map((n) => n.name);
  const userNames = names.filter((n) => !n.agent).map((n) => n.name);
  el.innerHTML = [agentNames.length ? `<span class="dots"><i></i><i></i><i></i></span> ${esc(t('areTyping', agentNames.join(', ')))}` : '', userNames.length ? esc(t('isTyping', userNames.join(', '))) : ''].filter(Boolean).join(' · ');
}

function setTyping(channelId, key, name, on, agent) {
  if (!S.typing.has(channelId)) S.typing.set(channelId, new Map());
  const m = S.typing.get(channelId);
  if (on) m.set(key, { name, agent }); else m.delete(key);
  if (!agent && on) setTimeout(() => { m.delete(key); if (channelId === S.current) renderTyping(); }, 4000);
  if (channelId === S.current) renderTyping();
}

// ------------------------------------------------------------------ realtime

let ws;
let wsRetry = 0;
let refreshTimer;
const debounced = (fn, ms = 250) => { clearTimeout(refreshTimer); refreshTimer = setTimeout(fn, ms); };

function connectWs() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    if (wsRetry) { toast('✓ reconnected', 'ok', 1500); if (S.current) openChannel(S.current); }
    wsRetry = 0;
  };
  ws.onclose = () => { setTimeout(connectWs, Math.min(1000 * 2 ** wsRetry++, 15000)); };
  ws.onmessage = (e) => {
    let ev;
    try { ev = JSON.parse(e.data); } catch { return; }
    onEvent(ev);
  };
}

function onEvent(ev) {
  switch (ev.kind) {
    case 'message.created': {
      const list = S.messages.get(ev.channelId);
      if (list && !list.some((m) => m.id === ev.message.id)) {
        list.push(ev.message);
        if (ev.channelId === S.current) renderMessages(ev.message.authorType === 'user' && ev.message.authorId === S.user.id);
      }
      if (ev.channelId !== S.current && ev.message.authorType !== 'system') { S.unread.add(ev.channelId); renderSidebar(); }
      if (!channelById(ev.channelId)) debounced(refreshChannels);
      break;
    }
    case 'message.delta': {
      const m = (S.messages.get(ev.channelId) || []).find((x) => x.id === ev.messageId);
      if (!m) break;
      m.content = ev.content;
      if (ev.channelId !== S.current) break;
      const el = $(`#messages [data-id="${ev.messageId}"] .body`);
      if (el) {
        const box = $('#messages');
        const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
        el.innerHTML = renderBody(m);
        if (nearBottom) box.scrollTop = box.scrollHeight;
      }
      break;
    }
    case 'message.updated': {
      const prev = (S.messages.get(ev.channelId) || []).find((x) => x.id === ev.message.id);
      if (prev?.meta?.feedback?.mine != null && ev.message.meta?.feedback) ev.message.meta.feedback.mine = prev.meta.feedback.mine;
      if (ev.message.status !== 'streaming') S.drafts.delete(ev.message.id);
      patchMessage(ev.message);
      break;
    }
    case 'message.deleted': {
      const list = S.messages.get(ev.channelId);
      if (list) { S.messages.set(ev.channelId, list.filter((m) => m.id !== ev.messageId)); if (ev.channelId === S.current) renderMessages(); }
      break;
    }
    case 'typing': {
      if (ev.agentId) setTyping(ev.channelId, ev.agentId, agentById(ev.agentId)?.name || 'Agent', ev.on, true);
      else if (ev.userId) setTyping(ev.channelId, ev.userId, userById(ev.userId)?.displayName || '', ev.on, false);
      break;
    }
    case 'channel.updated':
      if (ev.cleared && ev.channelId === S.current) { S.messages.set(ev.channelId, []); renderMessages(); }
      debounced(refreshChannels);
      break;
    case 'agent.updated': debounced(refreshAgents); break;
    case 'presence': S.online = new Set(ev.online); if (S.panel === 'members') renderPanel(); break;
    case 'artifact.draft': {
      S.drafts.set(ev.messageId, { title: ev.title, type: ev.type, content: ev.content });
      const frame = $(`#messages [data-draft="${ev.messageId}"] .deliv-preview`);
      if (frame) {
        const doc = draftDoc(S.drafts.get(ev.messageId));
        const iframe = frame.querySelector('iframe');
        if (iframe) iframe.srcdoc = doc; else frame.innerHTML = `<iframe tabindex="-1" sandbox="allow-scripts" srcdoc="${esc(doc)}"></iframe>`;
      }
      onStudioEvent(ev);
      break;
    }
    case 'memory.updated': if (S.panel === 'memory') renderPanel(); onViewEvent(ev); break;
    case 'artifact.updated': if (S.panel === 'artifacts') renderPanel(); onStudioEvent(ev); onViewEvent(ev); break;
    case 'workflow.updated': if (S.panel === 'workflows') renderPanel(); onViewEvent(ev); break;
    case 'task.updated': onViewEvent(ev); break;
    case 'approval.updated': onViewEvent(ev); break;
  }
}

// ------------------------------------------------------------------ channel editor

export function openChannelEditor(c = null) {
  const m = modal({
    title: c ? t('channelSettings') : t('newChannel'),
    body: `<form id="ch-form" class="form">
      <label class="field"><span>${t('name')}</span><input name="name" required maxlength="80" value="${esc(c?.name || '')}" placeholder="product-launch"></label>
      <label class="field"><span>${t('topic')}</span><input name="topic" value="${esc(c?.topic || '')}"></label>
      <label class="field"><span>${t('mode')}</span><select name="mode">${Object.entries(MODE_LABEL).map(([k, v]) => `<option value="${k}"${(c?.mode || 'auto') === k ? ' selected' : ''}>${t(v)} — ${t(k === 'auto' ? 'modeAutoHint' : k === 'mention' ? 'modeMentionHint' : 'modeRoundtableHint')}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="private"${c?.private ? ' checked' : ''}> ${t('privateChannel')}</label>
      <label class="check"><input type="checkbox" name="memoryEnabled"${c ? (c.memoryEnabled ? ' checked' : '') : ' checked'}> ${t('memoryEnabled')}</label>
      ${c ? '' : `<div class="field"><span>${t('aiMembers')}</span><div class="pick-grid">${S.agents.map((a) => `<label class="pick"><input type="checkbox" name="agentIds" data-multi="1" value="${a.id}" checked><span class="mini-av" style="--c:${esc(a.color)}">${esc(a.avatar)}</span>${esc(a.name)}</label>`).join('')}</div></div>`}
    </form>
    ${c ? `<div class="danger-zone"><button class="btn ghost" data-clear>${t('clearHistory')}</button><button class="btn danger" data-del>${t('deleteChannel')}</button></div>` : ''}`,
    footer: `<button class="btn ghost" data-close2>${t('cancel')}</button><button class="btn primary" form="ch-form">${c ? t('save') : t('create')}</button>`,
  });
  m.el.querySelector('[data-close2]').onclick = m.close;
  m.el.querySelector('#ch-form').onsubmit = safe(async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (c) { await api('PATCH', `/api/channels/${c.id}`, f); await refreshChannels(); }
    else { const nc = await api('POST', '/api/channels', f); await refreshChannels(); openChannel(nc.id); }
    m.close();
  });
  m.el.querySelector('[data-clear]')?.addEventListener('click', safe(async () => { if (await confirmBox(t('clearHistory') + '?')) { await api('POST', `/api/channels/${c.id}/clear`, {}); m.close(); } }));
  m.el.querySelector('[data-del]')?.addEventListener('click', safe(async () => { if (await confirmBox(t('deleteChannel') + ` #${c.name}?`)) { await api('DELETE', `/api/channels/${c.id}`); m.close(); await refreshChannels(); } }));
}

// ------------------------------------------------------------------ search

function openSearch() {
  const m = modal({ title: t('search'), wide: true, body: `<input class="search-input" placeholder="${t('searchPlaceholder')}"><div class="search-results"></div>` });
  const input = m.el.querySelector('input');
  const out = m.el.querySelector('.search-results');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(safe(async () => {
      const q = input.value.trim();
      if (!q) { out.innerHTML = ''; return; }
      const r = await api('GET', `/api/search?q=${encodeURIComponent(q)}`);
      const hl = (s) => esc(s.slice(0, 220)).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (x) => `<mark>${x}</mark>`);
      out.innerHTML = (r.messages.length + r.memories.length + r.artifacts.length === 0) ? `<p class="muted">${t('noResults')}</p>` : `
        ${r.artifacts.length ? `<h4>${t('artifacts')}</h4>${r.artifacts.map((a) => `<div class="result" data-art="${a.id}">📄 <strong>${esc(a.title)}</strong> <span class="muted small">${t('type_' + a.type)}</span></div>`).join('')}` : ''}
        ${r.memories.length ? `<h4>${t('memory')}</h4>${r.memories.map((x) => `<div class="result">🧠 ${hl(x.content)} <span class="muted small">${t('scope_' + x.scope)}</span></div>`).join('')}` : ''}
        ${r.messages.length ? `<h4>${t('messages')}</h4>${r.messages.map((x) => `<div class="result" data-chan="${x.channelId}"><span class="muted small">#${esc(channelById(x.channelId)?.name || '')} · ${clock(x.createdAt)}</span><div>${hl(x.content)}</div></div>`).join('')}` : ''}`;
    }), 200);
  });
  out.onclick = (e) => {
    const c = e.target.closest('[data-chan]')?.dataset.chan;
    if (c) { m.close(); openChannel(c); }
    const a = e.target.closest('[data-art]')?.dataset.art;
    if (a) { m.close(); openArtifact(a); }
  };
}

export { openWorkflowEditor, openArtifact };

window.addEventListener('hashchange', () => {
  const view = /^#\/(\w+)$/.exec(location.hash)?.[1];
  if (view && VIEWS[view]) { if (view !== S.view) openView(view); return; }
  const id = /^#\/c\/(.+)$/.exec(location.hash)?.[1];
  if (!id || (id === S.current && S.view === 'chat')) return;
  if (channelById(id)) openChannel(id);
  else refreshChannels().then(() => { if (channelById(id)) openChannel(id); }).catch(() => {});
});

boot().catch((e) => { document.body.innerHTML = `<div class="empty">⚠️ ${esc(e.message)}</div>`; });
