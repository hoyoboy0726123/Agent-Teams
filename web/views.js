// Full-page views: agent directory & teams, automations, task board, memory, outputs gallery.
import { t, getLang } from './i18n.js';
import { $, esc, api, toast, safe, modal, confirmBox, promptBox, formData, timeAgo, initials } from './ui.js';
import { S, agentById, userById, channelById, refreshAgents, refreshChannels, openChannel, openView, isAdmin } from './app.js';
import { openStudio } from './studio.js';
import { openAgentEditor } from './settings.js';
import { openWorkflowEditor } from './panels.js';

export const VIEWS = {
  agents: { icon: '🤖' },
  automations: { icon: '⚡' },
  tasks: { icon: '✅' },
  memory: { icon: '🧠' },
  outputs: { icon: '📦' },
};

const L = (o) => (typeof o === 'string' ? o : o?.[getLang() === 'en' ? 'en' : 'zh'] ?? o?.en ?? '');
const state = { agentsTab: 'library', category: 'all', q: '', autoTab: 'mine', taskChannel: '', memScope: 'all', memQ: '', outTab: 'all' };
let el = null;
let active = null;

export function renderView(name, container) {
  el = container;
  active = name;
  const head = `<header class="view-head"><button class="icon-btn only-mobile" data-menu>☰</button><h1>${VIEWS[name].icon} ${t('view_' + name)}</h1><span class="grow"></span><div class="view-actions"></div></header><div class="view-body"><p class="muted">${t('loading')}</p></div>`;
  el.innerHTML = head;
  el.querySelector('[data-menu]').onclick = () => { S.sidebarOpen = true; $('#app').classList.add('sidebar-open'); };
  ({ agents: agentsView, automations: automationsView, tasks: tasksView, memory: memoryView, outputs: outputsView })[name]().catch((e) => {
    el.querySelector('.view-body').innerHTML = `<p class="err-box">${esc(e.message)}</p>`;
  });
}

const rerender = () => { if (active && S.view === active) renderView(active, el); };
let evTimer;
export function onViewEvent(ev) {
  if (S.view === 'chat' || !active) return;
  const relevant = { automations: ['workflow.updated'], tasks: ['task.updated', 'approval.updated'], memory: ['memory.updated'], outputs: ['artifact.updated'] }[active] || [];
  if (!relevant.includes(ev.kind)) return;
  if (document.activeElement && el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  clearTimeout(evTimer);
  evTimer = setTimeout(rerender, 400);
}

const body = () => el.querySelector('.view-body');
const actions = () => el.querySelector('.view-actions');
const bestProvider = () => S.providers.find((p) => p.enabled !== false && p.type !== 'demo') || S.providers[0];
const providerSelect = (name = 'providerId') => `<select name="${name}">${S.providers.map((p) => `<option value="${p.id}"${p.id === bestProvider()?.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;

async function dmAgent(agentId) {
  const c = await api('POST', '/api/dm', { agentId });
  await refreshChannels();
  openChannel(c.id);
}

// ------------------------------------------------------------------ agents

async function agentsView() {
  const lib = await api('GET', '/api/library');
  const byTemplate = new Map(S.agents.filter((a) => a.templateKey).map((a) => [a.templateKey, a]));
  const canEdit = S.user.role !== 'guest';
  actions().innerHTML = canEdit ? `<button class="btn sm" data-import>⬆ ${t('importAgent')}</button><button class="btn primary sm" data-new>＋ ${t('newAgent')}</button>` : '';
  const tabs = `<div class="seg">${['library', 'teams', 'mine'].map((k) => `<button class="${state.agentsTab === k ? 'on' : ''}" data-tab="${k}">${t('agentsTab_' + k)}</button>`).join('')}</div>`;
  let content = '';
  if (state.agentsTab === 'library') {
    const q = state.q.toLowerCase();
    const list = lib.agents.filter((a) => (state.category === 'all' || a.category === state.category) && (!q || `${a.name} ${a.description} ${a.handle}`.toLowerCase().includes(q)));
    content = `<div class="row wrap filters-bar"><input type="search" data-q placeholder="${t('searchAgents')}" value="${esc(state.q)}">
      <div class="chips-row">${[{ key: 'all', zh: '全部', en: 'All' }, ...lib.categories].map((c) => `<button class="chip-btn${state.category === c.key ? ' on' : ''}" data-cat="${c.key}">${esc(L(c))}</button>`).join('')}</div></div>
      <div class="card-grid">${list.map((a) => { const have = byTemplate.get(a.key); return `<div class="agent-card">
        <span class="avatar agent lg" style="--c:${esc(a.color)}">${esc(a.avatar)}</span>
        <div class="grow"><strong>${esc(a.name)}</strong> <span class="muted small">@${esc(a.handle)}</span>
          <p class="muted small clamp2">${esc(a.description)}</p>
          ${a.starters?.length ? `<div class="muted tiny clamp1">💬 ${esc(a.starters[0])}</div>` : ''}</div>
        <div class="card-actions">${canEdit ? (have ? `<button class="btn primary sm" data-chat="${have.id}">${t('chat')}</button><span class="muted tiny">✓ ${t('added')}</span>` : `<button class="btn primary sm" data-add="${a.key}" data-then="chat">${t('chat')}</button><button class="btn sm" data-add="${a.key}">＋ ${t('add')}</button>`) : ''}</div>
      </div>`; }).join('') || `<p class="muted">${t('noResults')}</p>`}</div>`;
  } else if (state.agentsTab === 'teams') {
    const byKey = Object.fromEntries(lib.agents.map((a) => [a.key, a]));
    content = `<p class="muted small">${t('teamsIntro')}</p><div class="card-grid wide">${lib.teams.map((tm) => `<div class="team-card">
      <div class="row"><span class="team-icon">${tm.icon}</span><div class="grow"><strong>${esc(tm.name)}</strong><p class="muted small">${esc(tm.description)}</p></div></div>
      <div class="row wrap">${tm.members.map((k) => byKey[k]).filter(Boolean).map((a) => `<span class="member-pill"><span class="mini-av" style="--c:${esc(a.color)}">${esc(a.avatar)}</span>${esc(a.name.split(' ')[0])}</span>`).join('')}</div>
      <div class="row"><span class="muted tiny grow">${t('mode')}: ${t(tm.mode === 'roundtable' ? 'modeRoundtable' : 'modeAuto')}</span>${canEdit ? `<button class="btn primary sm" data-team="${tm.key}">🚀 ${t('createTeam')}</button>` : ''}</div>
    </div>`).join('')}</div>`;
  } else {
    const stats = isAdmin() ? await api('GET', '/api/feedback/summary').catch(() => []) : [];
    const st = Object.fromEntries(stats.map((x) => [x.agentId, x]));
    content = `<div class="card-grid">${S.agents.map((a) => `<div class="agent-card">
      <span class="avatar agent lg" style="--c:${esc(a.color)}">${esc(a.avatar)}</span>
      <div class="grow"><strong>${esc(a.name)}</strong> <span class="muted small">@${esc(a.handle)}</span>
        <p class="muted small clamp2">${esc(a.description)}</p>
        <div class="muted tiny">${esc(S.providers.find((p) => p.id === a.providerId)?.name || t('noProvider'))}${a.model ? ` · ${esc(a.model)}` : ''}${a.mcpServers?.length ? ` · 🔌 ${a.mcpServers.length}` : ''}${st[a.id] ? ` · 👍 ${st[a.id].up || 0} 👎 ${st[a.id].down || 0}` : ''}</div></div>
      <div class="card-actions"><button class="btn primary sm" data-chat="${a.id}">${t('chat')}</button>
        ${canEdit ? `<button class="btn sm" data-edit="${a.id}">✎</button><a class="btn sm" href="/api/agents/${a.id}/export" download="${esc(a.handle)}.agent.json" data-export>⬇</a>` : ''}</div>
    </div>`).join('')}</div>`;
  }
  body().innerHTML = tabs + content;
  bindAgents(lib);
}

function bindAgents(lib) {
  const b = body();
  b.querySelectorAll('[data-tab]').forEach((x) => { x.onclick = () => { state.agentsTab = x.dataset.tab; agentsView(); }; });
  b.querySelectorAll('[data-cat]').forEach((x) => { x.onclick = () => { state.category = x.dataset.cat; agentsView(); }; });
  let qt;
  const q = b.querySelector('[data-q]');
  if (q) q.oninput = () => { clearTimeout(qt); qt = setTimeout(() => { state.q = q.value; agentsView().then(() => { const n = body().querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 250); };
  b.onclick = safe(async (e) => {
    const d = (k) => e.target.closest(`[data-${k}]`);
    if (d('chat')) return dmAgent(d('chat').dataset.chat);
    if (d('edit')) return openAgentEditor(agentById(d('edit').dataset.edit));
    if (d('add')) {
      const btn = d('add');
      const a = await api('POST', `/api/library/${btn.dataset.add}/add`, { providerId: bestProvider()?.id });
      await refreshAgents();
      if (btn.dataset.then === 'chat') return dmAgent(a.id);
      toast(`${a.avatar} ${a.name} ✓`, 'ok');
      return agentsView();
    }
    if (d('team')) {
      const key = d('team').dataset.team;
      const tm = lib.teams.find((x) => x.key === key);
      const m = modal({
        title: `${tm.icon} ${tm.name}`,
        body: `<form class="form" id="team-form"><p class="muted small">${esc(tm.description)}</p>
          <label class="field"><span>${t('channelName')}</span><input name="name" value="${esc(tm.name.split(' ')[0])}"></label>
          <label class="field"><span>${t('provider')}</span>${providerSelect()}</label>
          <label class="field"><span>${t('model')}</span><input name="model" placeholder="default"></label></form>`,
        footer: `<button class="btn primary" form="team-form">🚀 ${t('createTeam')}</button>`,
      });
      m.el.querySelector('#team-form').onsubmit = safe(async (ev) => {
        ev.preventDefault();
        const r = await api('POST', `/api/teams/${key}`, formData(ev.target));
        m.close();
        await refreshAgents();
        await refreshChannels();
        openChannel(r.channel.id);
      });
    }
  });
  actions().onclick = safe(async (e) => {
    if (e.target.closest('[data-new]')) openAgentEditor();
    if (e.target.closest('[data-import]')) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = safe(async () => {
        const def = JSON.parse(await input.files[0].text());
        const a = await api('POST', '/api/agents/import', { ...def, providerId: bestProvider()?.id });
        await refreshAgents();
        toast(`${a.avatar} ${a.name} ✓`, 'ok');
        state.agentsTab = 'mine';
        agentsView();
      });
      input.click();
    }
  });
}

// ------------------------------------------------------------------ schedule editor (shared)

const DAY_NAMES = () => (getLang() === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['日', '一', '二', '三', '四', '五', '六']);

export function scheduleEditorHtml(trigger = 'manual', s = null) {
  const kind = s?.kind || 'daily';
  const days = new Set(s?.days || [0, 1, 2, 3, 4, 5, 6]);
  return `<div class="sched" data-sched>
    <div class="seg">${['manual', 'schedule', 'webhook'].map((k) => `<button type="button" class="${trigger === k ? 'on' : ''}" data-trigger="${k}">${t('trigger_' + k)}</button>`).join('')}</div>
    <input type="hidden" name="trigger" value="${trigger}">
    <div class="sched-body" ${trigger === 'schedule' ? '' : 'hidden'}>
      <div class="row wrap">
        <select name="s_kind">${['daily', 'weekly', 'monthly', 'interval', 'cron'].map((k) => `<option value="${k}"${kind === k ? ' selected' : ''}>${t('sched_' + k)}</option>`).join('')}</select>
        <input type="time" name="s_time" value="${esc(s?.time || '09:00')}" data-for="daily weekly monthly">
        <select name="s_day" data-for="weekly">${DAY_NAMES().map((d, i) => `<option value="${i}"${(s?.day ?? 1) === i ? ' selected' : ''}>${d}</option>`).join('')}</select>
        <label data-for="monthly" class="row">${t('dayOfMonth')} <input type="number" name="s_date" min="1" max="28" value="${s?.date || 1}" style="width:70px"></label>
        <label data-for="interval" class="row">${t('every')} <input type="number" name="s_minutes" min="5" value="${s?.minutes || 60}" style="width:90px"> ${t('minutes')}</label>
        <input name="s_expr" data-for="cron" placeholder="0 9 * * 1-5" value="${esc(s?.expr || '')}">
      </div>
      <div class="day-picks" data-for="daily">${DAY_NAMES().map((d, i) => `<label class="day"><input type="checkbox" name="s_days" data-multi="1" value="${i}"${days.has(i) ? ' checked' : ''}><span>${d}</span></label>`).join('')}</div>
      <div class="muted small" data-preview></div>
    </div>
    <p class="muted small" ${trigger === 'webhook' ? '' : 'hidden'} data-webhook-hint>${t('webhookHint')}</p>
  </div>`;
}

export function readSchedule(f) {
  if (f.trigger !== 'schedule') return null;
  const k = f.s_kind;
  if (k === 'interval') return { kind: k, minutes: Number(f.s_minutes) };
  if (k === 'cron') return { kind: k, expr: f.s_expr };
  if (k === 'weekly') return { kind: k, time: f.s_time, day: Number(f.s_day) };
  if (k === 'monthly') return { kind: k, time: f.s_time, date: Number(f.s_date) };
  return { kind: 'daily', time: f.s_time, days: (f.s_days || []).map(Number) };
}

export function bindScheduleEditor(root) {
  const box = root.querySelector('[data-sched]');
  if (!box) return;
  const form = box.closest('form');
  const sync = () => {
    const kind = box.querySelector('[name=s_kind]').value;
    box.querySelectorAll('[data-for]').forEach((x) => { x.hidden = !x.dataset.for.split(' ').includes(kind); });
  };
  let pt;
  const preview = () => {
    clearTimeout(pt);
    pt = setTimeout(async () => {
      const s = readSchedule(formData(form));
      const out = box.querySelector('[data-preview]');
      if (!s) { out.textContent = ''; return; }
      try {
        const r = await api('POST', '/api/schedule/preview', { schedule: s });
        out.textContent = `${L(r.label)} · ${t('nextRuns')}: ${r.next.map((x) => new Date(x).toLocaleString([], { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })).join(' / ')} (${r.tz})`;
      } catch (e) { out.textContent = `⚠️ ${e.message}`; }
    }, 250);
  };
  box.querySelectorAll('[data-trigger]').forEach((b) => {
    b.onclick = () => {
      box.querySelectorAll('[data-trigger]').forEach((x) => x.classList.toggle('on', x === b));
      box.querySelector('[name=trigger]').value = b.dataset.trigger;
      box.querySelector('.sched-body').hidden = b.dataset.trigger !== 'schedule';
      box.querySelector('[data-webhook-hint]').hidden = b.dataset.trigger !== 'webhook';
      preview();
    };
  });
  box.addEventListener('input', () => { sync(); preview(); });
  box.addEventListener('change', () => { sync(); preview(); });
  sync();
  preview();
}

// ------------------------------------------------------------------ automations

async function automationsView() {
  const [templates, flows] = await Promise.all([api('GET', '/api/automations/templates'), api('GET', '/api/workflows')]);
  const canEdit = S.user.role !== 'guest';
  actions().innerHTML = canEdit ? `<button class="btn sm" data-manual>⚙️ ${t('manualSetup')}</button>` : '';
  const tabs = `<div class="seg">${['mine', 'work', 'life'].map((k) => `<button class="${state.autoTab === k ? 'on' : ''}" data-tab="${k}">${t('autoTab_' + k)}${k === 'mine' ? ` (${flows.length})` : ''}</button>`).join('')}</div>`;
  let content;
  if (state.autoTab === 'mine') {
    content = flows.length ? `<div class="auto-list">${flows.map((w) => `<div class="auto-row${w.enabled ? '' : ' off'}">
      <span class="auto-icon">${esc(w.icon || '⚡')}</span>
      <div class="grow"><strong>${esc(w.name)}</strong>
        <div class="muted small">${esc(L(w.scheduleLabel))}${w.trigger === 'webhook' ? ' · Webhook' : ''}${w.channelId ? ` · #${esc(channelById(w.channelId)?.name || '')}` : ''}${w.nextRuns?.length && w.enabled ? ` · ${t('nextRun')} ${new Date(w.nextRuns[0]).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}${w.lastRunAt ? ` · ${t('lastRun')} ${timeAgo(w.lastRunAt)}` : ''}</div>
        <div class="wf-steps">${w.steps.map((s, i) => { const a = agentById(s.agentId); return `${i ? `<span class="muted">${s.parallel ? '∥' : '→'}</span>` : ''}<span class="mini-av" title="${esc(a?.name || '?')}" style="--c:${esc(a?.color || '#888')}">${esc(a?.avatar || '?')}</span>`; }).join('')}</div></div>
      ${canEdit ? `<div class="auto-actions">
        ${w.trigger === 'webhook' && w.hookToken ? `<button class="btn sm" data-hook="${esc(w.hookToken)}">🔗 URL</button>` : ''}
        <button class="btn sm" data-run="${w.id}">▶ ${t('run')}</button>
        <button class="btn ghost sm" data-edit="${w.id}">✎</button>
        ${w.trigger !== 'manual' ? `<label class="switch" title="${t('enabled')}"><input type="checkbox" data-toggle="${w.id}"${w.enabled ? ' checked' : ''}><span></span></label>` : ''}
      </div>` : ''}
    </div>`).join('')}</div>` : `<div class="empty-block"><div class="big-emoji">⚡</div><p class="muted">${t('noAutomations')}</p><button class="btn primary" data-tab="work">${t('browseTemplates')}</button></div>`;
  } else {
    content = `<div class="template-list">${templates.filter((x) => x.category === state.autoTab).map((x) => `<button class="template-row" data-tpl="${x.key}">
      <span class="tpl-icon">${x.icon}</span><span class="grow"><strong>${esc(L(x.name))}</strong><span class="muted small">${esc(L(x.description))}</span></span>
      <span class="muted tiny">${x.trigger === 'schedule' ? '⏰' : '▶'}</span></button>`).join('')}</div>`;
  }
  body().innerHTML = tabs + content;
  const b = body();
  b.querySelectorAll('[data-tab]').forEach((x) => { x.onclick = () => { state.autoTab = x.dataset.tab; automationsView(); }; });
  b.onclick = safe(async (e) => {
    const d = (k) => e.target.closest(`[data-${k}]`)?.dataset[k];
    if (d('tpl')) return installTemplate(templates.find((x) => x.key === d('tpl')));
    if (d('run')) {
      const input = await promptBox(t('runWorkflow'), { label: t('workflowInput'), multiline: true, ok: `▶ ${t('run')}` });
      if (input == null) return;
      const r = await api('POST', `/api/workflows/${d('run')}/run`, { input });
      toast(t('workflowStarted'), 'ok');
      openChannel(r.channelId);
    }
    if (d('edit')) return openWorkflowEditor(flows.find((w) => w.id === d('edit')), channelById(flows.find((w) => w.id === d('edit')).channelId));
    if (d('hook')) {
      const url = `${location.origin}/hooks/${d('hook')}`;
      await navigator.clipboard?.writeText(url).catch(() => {});
      toast(`${t('linkCopied')}: ${url}`, 'ok', 6000);
    }
  });
  b.onchange = safe(async (e) => {
    const id = e.target.dataset.toggle;
    if (id) { await api('POST', `/api/workflows/${id}/enabled`, { enabled: e.target.checked }); toast(e.target.checked ? t('automationOn') : t('automationOff')); }
  });
  actions().onclick = (e) => { if (e.target.closest('[data-manual]')) openWorkflowEditor(null, null); };
}

function installTemplate(tpl) {
  const m = modal({
    title: `${tpl.icon} ${L(tpl.name)}`, wide: true,
    body: `<form class="form" id="tpl-install"><p class="muted">${esc(L(tpl.description))}</p>
      ${(tpl.fields || []).map((f) => `<label class="field"><span>${esc(L(f.label))}</span><input name="v_${f.key}" placeholder="${esc(f.placeholder || '')}"></label>`).join('')}
      <div class="field"><span>${t('when')}</span>${scheduleEditorHtml(tpl.trigger, tpl.schedule)}</div>
      <div class="row wrap"><label class="field grow"><span>${t('postIn')}</span><select name="channelId"><option value="">${t('newPrivateChannel')}</option>${S.channels.map((c) => `<option value="${c.id}">${c.kind === 'dm' ? '💬' : '#'} ${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field grow"><span>${t('provider')}</span>${providerSelect()}</label></div>
      <p class="muted small">${t('templateAgents')}: ${tpl.steps.map((s) => '@' + s.agent).join(' → ')}</p></form>`,
    footer: `<button class="btn ghost" data-cancel>${t('cancel')}</button><button class="btn primary" form="tpl-install">${t('install')}</button>`,
  });
  bindScheduleEditor(m.el);
  m.el.querySelector('[data-cancel]').onclick = m.close;
  m.el.querySelector('#tpl-install').onsubmit = safe(async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const values = Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith('v_')).map(([k, v]) => [k.slice(2), v]));
    const w = await api('POST', `/api/automations/templates/${tpl.key}`, { values, channelId: f.channelId || undefined, providerId: f.providerId, trigger: f.trigger, schedule: readSchedule(f) });
    m.close();
    await refreshAgents();
    await refreshChannels();
    toast(`${w.icon} ${w.name} ✓ ${L(w.scheduleLabel)}`, 'ok', 4000);
    state.autoTab = 'mine';
    if (w.trigger === 'manual') {
      const input = await promptBox(t('runWorkflow'), { label: t('workflowInput'), multiline: true, ok: `▶ ${t('run')}` });
      if (input != null) { const r = await api('POST', `/api/workflows/${w.id}/run`, { input }); openChannel(r.channelId); return; }
    }
    automationsView();
  });
}

// ------------------------------------------------------------------ tasks

async function tasksView() {
  const [tasks, approvals] = await Promise.all([
    api('GET', `/api/tasks${state.taskChannel ? `?channelId=${state.taskChannel}` : ''}`),
    api('GET', '/api/approvals'),
  ]);
  const canEdit = S.user.role !== 'guest';
  actions().innerHTML = `<select data-chan><option value="">${t('allChannels')}</option>${S.channels.map((c) => `<option value="${c.id}"${state.taskChannel === c.id ? ' selected' : ''}>${c.kind === 'dm' ? '💬' : '#'} ${esc(c.name)}</option>`).join('')}</select>${canEdit ? `<button class="btn primary sm" data-new>＋ ${t('newTask')}</button>` : ''}`;
  const who = (tk) => tk.assigneeType === 'agent' ? (() => { const a = agentById(tk.assigneeId); return a ? `<span class="mini-av" style="--c:${esc(a.color)}">${esc(a.avatar)}</span> ${esc(a.name)}` : ''; })()
    : tk.assigneeType === 'user' ? `<span class="mini-av">${esc(initials(userById(tk.assigneeId)?.displayName))}</span> ${esc(userById(tk.assigneeId)?.displayName || '')}` : `<span class="muted">${t('unassigned')}</span>`;
  const card = (tk) => `<div class="task-card" draggable="${canEdit}" data-task="${tk.id}">
    <div class="task-title">${esc(tk.title)}</div>
    ${tk.description ? `<div class="muted small clamp2">${esc(tk.description)}</div>` : ''}
    <div class="task-meta">${who(tk)}${tk.dueAt ? `<span class="due${tk.status !== 'done' && tk.dueAt < Date.now() ? ' late' : ''}">📅 ${new Date(tk.dueAt).toLocaleDateString()}</span>` : ''}${tk.channelId ? `<button class="link small" data-goto="${tk.channelId}">#${esc(channelById(tk.channelId)?.name || '')}</button>` : ''}</div>
    ${canEdit ? `<div class="task-actions">${tk.assigneeType === 'agent' && tk.status !== 'done' ? `<button class="btn primary sm" data-runtask="${tk.id}">▶ ${t('letAgentDo')}</button>` : ''}
      <select data-status="${tk.id}">${['todo', 'doing', 'done'].map((s) => `<option value="${s}"${tk.status === s ? ' selected' : ''}>${t('status_' + s)}</option>`).join('')}</select>
      <button class="icon-btn sm" data-deltask="${tk.id}">🗑</button></div>` : ''}
  </div>`;
  body().innerHTML = `
    ${approvals.length ? `<div class="approvals-box"><h3>🔐 ${t('pendingApprovals')} (${approvals.length})</h3>${approvals.map((ap) => `<div class="approval pending"><div>${esc(agentById(ap.agentId)?.avatar || '🤖')} <strong>${esc(agentById(ap.agentId)?.name || '')}</strong> ${t('wantsToRun')} <code>${esc(ap.tool)}</code> · <button class="link" data-goto="${ap.channelId}">#${esc(channelById(ap.channelId)?.name || '')}</button></div>
      <pre class="approval-args">${esc(JSON.stringify(ap.args, null, 2)).slice(0, 800)}</pre>
      ${canEdit ? `<div class="row"><button class="btn primary sm" data-approve="${ap.id}">✓ ${t('approve')}</button><button class="btn sm" data-deny="${ap.id}">✕ ${t('deny')}</button></div>` : ''}</div>`).join('')}</div>` : ''}
    <div class="board">${['todo', 'doing', 'done'].map((s) => `<div class="col" data-col="${s}"><h3>${t('status_' + s)} <span class="muted">${tasks.filter((x) => x.status === s).length}</span></h3>${tasks.filter((x) => x.status === s).map(card).join('') || `<p class="muted small drop-hint">${t('dropHere')}</p>`}</div>`).join('')}</div>`;
  const b = body();
  b.onclick = safe(async (e) => {
    const d = (k) => e.target.closest(`[data-${k}]`)?.dataset[k];
    if (d('goto')) return openChannel(d('goto'));
    if (d('runtask')) { await api('POST', `/api/tasks/${d('runtask')}/run`, {}); toast(t('agentWorking'), 'ok'); return; }
    if (d('deltask')) { if (await confirmBox(t('delete') + '?')) { await api('DELETE', `/api/tasks/${d('deltask')}`); tasksView(); } return; }
    if (d('approve') || d('deny')) { await api('POST', `/api/approvals/${d('approve') || d('deny')}`, { approve: !!d('approve') }); tasksView(); }
  });
  b.onchange = safe(async (e) => { const id = e.target.dataset.status; if (id) { await api('PATCH', `/api/tasks/${id}`, { status: e.target.value }); tasksView(); } });
  b.addEventListener('dragstart', (e) => { const c = e.target.closest('[data-task]'); if (c) e.dataTransfer.setData('text/task', c.dataset.task); });
  b.querySelectorAll('[data-col]').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', safe(async (e) => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer.getData('text/task'); if (id) { await api('PATCH', `/api/tasks/${id}`, { status: col.dataset.col }); tasksView(); } }));
  });
  actions().onchange = (e) => { if (e.target.matches('[data-chan]')) { state.taskChannel = e.target.value; tasksView(); } };
  actions().onclick = (e) => { if (e.target.closest('[data-new]')) newTask(); };
}

function newTask() {
  const m = modal({
    title: t('newTask'),
    body: `<form class="form" id="task-form">
      <label class="field"><span>${t('taskTitle')}</span><input name="title" required></label>
      <label class="field"><span>${t('description')}</span><textarea name="description" rows="3"></textarea></label>
      <div class="row wrap">
        <label class="field grow"><span>${t('assignee')}</span><select name="assignee"><option value="">${t('unassigned')}</option>
          <optgroup label="${t('agents')}">${S.agents.map((a) => `<option value="@${esc(a.handle)}">${esc(a.avatar)} ${esc(a.name)}</option>`).join('')}</optgroup>
          <optgroup label="${t('humans')}">${S.users.map((u) => `<option value="${esc(u.username)}">${esc(u.displayName)}</option>`).join('')}</optgroup></select></label>
        <label class="field"><span>${t('due')}</span><input type="date" name="due"></label>
      </div>
      <label class="field"><span>${t('channels')}</span><select name="channelId">${S.channels.map((c) => `<option value="${c.id}"${(state.taskChannel || S.current) === c.id ? ' selected' : ''}>${c.kind === 'dm' ? '💬' : '#'} ${esc(c.name)}</option>`).join('')}</select></label>
    </form>`,
    footer: `<button class="btn primary" form="task-form">${t('create')}</button>`,
  });
  m.el.querySelector('#task-form').onsubmit = safe(async (e) => { e.preventDefault(); await api('POST', '/api/tasks', formData(e.target)); m.close(); tasksView(); });
}

// ------------------------------------------------------------------ memory

async function memoryView() {
  const list = await api('GET', `/api/memories${state.memQ ? `?q=${encodeURIComponent(state.memQ)}` : ''}`);
  const scopeName = (m) => m.scope === 'channel' ? `#${channelById(m.scopeId)?.name || '?'}` : m.scope === 'agent' ? `${agentById(m.scopeId)?.avatar || '🤖'} ${agentById(m.scopeId)?.name || ''}` : t('scope_' + m.scope);
  const shown = state.memScope === 'all' ? list : list.filter((m) => m.scope === state.memScope);
  const counts = Object.fromEntries(['workspace', 'channel', 'agent', 'user'].map((s) => [s, list.filter((m) => m.scope === s).length]));
  body().innerHTML = `<p class="muted small">${t('memoryIntro')}</p>
    <form class="mem-add wide" data-add><textarea name="content" rows="2" placeholder="${t('memoryPlaceholder')}" required></textarea>
      <div class="row"><select name="scope"><option value="workspace">${t('scope_workspace')}</option><option value="user">${t('scope_user')}</option></select><label class="check small"><input type="checkbox" name="pinned"> 📌 ${t('pin')}</label><input type="number" name="ttlDays" min="1" placeholder="${t('ttlDays')}" style="width:180px"><button class="btn primary sm">${t('add')}</button></div></form>
    <div class="row wrap filters-bar"><div class="chips-row">${['all', 'workspace', 'channel', 'agent', 'user'].map((s) => `<button class="chip-btn${state.memScope === s ? ' on' : ''}" data-scope="${s}">${s === 'all' ? t('all') : t('scope_' + s)} ${s === 'all' ? list.length : counts[s]}</button>`).join('')}</div><input type="search" data-q placeholder="${t('search')}" value="${esc(state.memQ)}"></div>
    <ul class="mem-list">${shown.map((m) => `<li class="mem${m.pinned ? ' pinned' : ''}"><div class="mem-text">${esc(m.content)}</div>
      <div class="mem-meta muted small"><span class="scope s-${m.scope}">${esc(scopeName(m))}</span> · ${timeAgo(m.updatedAt)}${m.expiresAt ? ` · ⏳ ${t('expiresIn', Math.max(0, Math.ceil((m.expiresAt - Date.now()) / 86400000)))}` : ''}</div>
      <div class="mem-actions"><button class="icon-btn sm" data-pin="${m.id}" data-v="${m.pinned ? 0 : 1}">${m.pinned ? '📌' : '📍'}</button><button class="icon-btn sm" data-edit="${m.id}">✎</button><button class="icon-btn sm" data-del="${m.id}">🗑</button></div></li>`).join('') || `<li class="muted small">${t('noMemories')}</li>`}</ul>`;
  const b = body();
  b.querySelector('[data-add]').onsubmit = safe(async (e) => { e.preventDefault(); await api('POST', '/api/memories', formData(e.target)); memoryView(); });
  b.querySelectorAll('[data-scope]').forEach((x) => { x.onclick = () => { state.memScope = x.dataset.scope; memoryView(); }; });
  let qt;
  b.querySelector('[data-q]').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { state.memQ = e.target.value; memoryView(); }, 300); };
  b.querySelector('.mem-list').onclick = safe(async (e) => {
    const d = (k) => e.target.closest(`[data-${k}]`);
    if (d('pin')) { await api('PATCH', `/api/memories/${d('pin').dataset.pin}`, { pinned: d('pin').dataset.v === '1' }); memoryView(); }
    if (d('del')) { await api('DELETE', `/api/memories/${d('del').dataset.del}`); memoryView(); }
    if (d('edit')) {
      const m = shown.find((x) => x.id === d('edit').dataset.edit);
      const v = await promptBox(t('edit'), { value: m.content, multiline: true });
      if (v?.trim()) { await api('PATCH', `/api/memories/${m.id}`, { content: v.trim() }); memoryView(); }
    }
  });
}

// ------------------------------------------------------------------ outputs gallery

async function outputsView() {
  const [arts, marks] = await Promise.all([api('GET', '/api/artifacts'), api('GET', '/api/bookmarks')]);
  const tabs = ['all', 'slides', 'dashboard', 'website', 'document', 'research', 'saved'];
  const shown = state.outTab === 'saved' ? [] : arts.filter((a) => state.outTab === 'all' || a.type === state.outTab);
  body().innerHTML = `<div class="chips-row">${tabs.map((k) => `<button class="chip-btn${state.outTab === k ? ' on' : ''}" data-tab="${k}">${k === 'all' ? t('all') : k === 'saved' ? `🔖 ${t('savedTab')}` : t('type_' + k)} ${k === 'all' ? arts.length : k === 'saved' ? marks.length : arts.filter((a) => a.type === k).length}</button>`).join('')}</div>
    ${state.outTab === 'saved' ? (marks.length ? `<div class="saved-list">${marks.map((b) => b.kind === 'artifact'
      ? `<button class="saved" data-art="${b.artifact.id}">📦 <strong>${esc(b.artifact.title)}</strong> <span class="muted small">${t('type_' + b.artifact.type)}</span></button>`
      : `<button class="saved" data-chan="${b.message.channelId}"><span class="muted small">#${esc(channelById(b.message.channelId)?.name || '')} · ${timeAgo(b.message.createdAt)} · ${esc(b.message.authorType === 'agent' ? agentById(b.message.authorId)?.name || '' : userById(b.message.authorId)?.displayName || '')}</span><div class="clamp2">${esc(b.message.content.replace(/\[\[[^\]]+\]\]/g, '📦'))}</div></button>`).join('')}</div>` : `<p class="muted">${t('noSaved')}</p>`)
    : shown.length ? `<div class="gallery">${shown.map((a) => `<button class="gallery-card" data-art="${a.id}">
      <div class="thumb"><iframe loading="lazy" tabindex="-1" sandbox="allow-scripts" src="/api/artifacts/${a.id}/render"></iframe></div>
      <div class="gallery-meta"><strong class="ellipsis">${esc(a.title)}</strong><span class="muted small">${t('type_' + a.type)} · v${a.version} · ${timeAgo(a.updatedAt)}${a.channelId ? ` · #${esc(channelById(a.channelId)?.name || '')}` : ''}</span></div></button>`).join('')}</div>`
      : `<div class="empty-block"><div class="big-emoji">📦</div><p class="muted">${t('noArtifacts')}</p></div>`}`;
  const b = body();
  b.querySelectorAll('[data-tab]').forEach((x) => { x.onclick = () => { state.outTab = x.dataset.tab; outputsView(); }; });
  b.onclick = (e) => {
    const a = e.target.closest('[data-art]')?.dataset.art;
    if (a) openStudio(a);
    const c = e.target.closest('[data-chan]')?.dataset.chan;
    if (c) openChannel(c);
  };
}

export { openView };
