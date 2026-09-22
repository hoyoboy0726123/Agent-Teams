// Right-hand panel (memory, artifacts, workflows, members) and the artifact / workflow modals.
import { t } from './i18n.js';
import { $, esc, api, toast, safe, modal, confirmBox, promptBox, formData, timeAgo, initials } from './ui.js';
import { markdown } from './md.js';
import { S, agentById, userById, currentChannel, isAdmin, refreshChannels, openChannel } from './app.js';
import { openStudio as openArtifact } from './studio.js';
import { scheduleEditorHtml, bindScheduleEditor, readSchedule, renderView } from './views.js';
export { openArtifact };

const TYPE_ICON = { slides: '🎞️', dashboard: '📊', website: '🌐', research: '🔬', document: '📄' };

export async function renderPanel() {
  const el = $('#panel');
  const c = currentChannel();
  if (!el || !S.panel || !c) return;
  const head = (title, extra = '') => `<header class="panel-head"><h2>${title}</h2>${extra}<button class="icon-btn" data-close-panel aria-label="${t('close')}">✕</button></header>`;
  el.onclick = null;
  try {
    if (S.panel === 'memory') await memoryPanel(el, c, head);
    else if (S.panel === 'artifacts') await artifactsPanel(el, c, head);
    else if (S.panel === 'workflows') await workflowsPanel(el, c, head);
    else if (S.panel === 'members') membersPanel(el, c, head);
  } catch (e) {
    el.innerHTML = head(t(S.panel)) + `<p class="err-box">${esc(e.message)}</p>`;
  }
  el.querySelector('[data-close-panel]')?.addEventListener('click', () => {
    S.panel = null;
    $('#app').classList.remove('panel-open');
    el.hidden = true;
    document.querySelectorAll('.tabs .tab.on').forEach((x) => x.classList.remove('on'));
  });
}

// ------------------------------------------------------------------ memory

let memFilter = 'all';
let memQuery = '';

async function memoryPanel(el, c, head) {
  const list = await api('GET', `/api/memories?channelId=${c.id}${memQuery ? `&q=${encodeURIComponent(memQuery)}` : ''}`);
  const agentsIn = c.members.agents.map(agentById).filter(Boolean);
  const agentMem = memFilter.startsWith('agent:') ? await api('GET', `/api/memories?scope=agent&scopeId=${memFilter.slice(6)}`) : [];
  const shown = memFilter === 'all' ? list : memFilter.startsWith('agent:') ? agentMem : list.filter((m) => m.scope === memFilter);
  const creator = (m) => m.createdByType === 'agent' ? `${agentById(m.createdById)?.avatar || '🤖'} ${agentById(m.createdById)?.name || 'agent'}`
    : m.createdByType === 'user' ? `👤 ${userById(m.createdById)?.displayName || 'user'}` : '⚙️ auto';
  el.innerHTML = head(`🧠 ${t('memory')}`) + `
    <div class="panel-body">
      <p class="muted small">${t('memoryIntro')}</p>
      ${c.summary ? `<details class="summary-box"><summary>📝 ${t('summary')}</summary><div class="md">${markdown(c.summary)}</div></details>` : ''}
      <form class="mem-add" id="mem-add">
        <textarea name="content" rows="2" placeholder="${t('memoryPlaceholder')}" required></textarea>
        <div class="row"><select name="scope">
          <option value="channel">${t('scope_channel')}</option><option value="workspace">${t('scope_workspace')}</option><option value="user">${t('scope_user')}</option>
        </select><label class="check small"><input type="checkbox" name="pinned"> 📌 ${t('pin')}</label><button class="btn primary sm">${t('add')}</button></div>
      </form>
      <div class="row filters">
        <select id="mem-filter">
          <option value="all">${t('memory')}: ${list.length}</option>
          ${['channel', 'workspace', 'user'].map((s) => `<option value="${s}"${memFilter === s ? ' selected' : ''}>${t('scope_' + s)}</option>`).join('')}
          ${agentsIn.map((a) => `<option value="agent:${a.id}"${memFilter === 'agent:' + a.id ? ' selected' : ''}>${esc(a.avatar)} ${esc(a.name)} — ${t('scope_agent')}</option>`).join('')}
        </select>
        <input id="mem-q" type="search" placeholder="${t('search')}" value="${esc(memQuery)}">
      </div>
      <ul class="mem-list">
        ${shown.length ? shown.map((m) => `<li class="mem${m.pinned ? ' pinned' : ''}" data-id="${m.id}">
          <div class="mem-text">${esc(m.content)}</div>
          <div class="mem-meta muted small"><span class="scope s-${m.scope}">${t('scope_' + m.scope)}</span> · ${esc(creator(m))} · ${timeAgo(m.updatedAt)}${m.expiresAt ? ` · ⏳ ${t('expiresIn', Math.max(0, Math.ceil((m.expiresAt - Date.now()) / 86400000)))}` : ''}</div>
          <div class="mem-actions">
            <button class="icon-btn sm" data-pin="${m.id}" title="${m.pinned ? t('unpin') : t('pin')}">${m.pinned ? '📌' : '📍'}</button>
            <button class="icon-btn sm" data-edit="${m.id}" title="${t('edit')}">✎</button>
            <button class="icon-btn sm" data-del="${m.id}" title="${t('delete')}">🗑</button>
          </div></li>`).join('') : `<li class="muted small empty-li">${t('noMemories')}</li>`}
      </ul>
      ${memFilter !== 'all' && shown.length ? `<button class="btn ghost danger-text sm" data-clear>${t('forgetAll')}</button>` : ''}
    </div>`;
  const byId = (id) => shown.find((m) => m.id === id);
  $('#mem-add', el).onsubmit = safe(async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    await api('POST', '/api/memories', { ...f, scopeId: f.scope === 'channel' ? c.id : undefined });
    toast(t('saved'), 'ok');
    renderPanel();
  });
  $('#mem-filter', el).onchange = (e) => { memFilter = e.target.value; renderPanel(); };
  let qt;
  $('#mem-q', el).oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { memQuery = e.target.value; renderPanel(); }, 250); };
  el.querySelector('.mem-list').onclick = safe(async (e) => {
    const d = (k) => e.target.closest(`[data-${k}]`)?.dataset[k];
    if (d('pin')) { await api('PATCH', `/api/memories/${d('pin')}`, { pinned: !byId(d('pin')).pinned }); renderPanel(); }
    if (d('del')) { await api('DELETE', `/api/memories/${d('del')}`); renderPanel(); }
    if (d('edit')) {
      const m = byId(d('edit'));
      const v = await promptBox(t('edit'), { value: m.content, multiline: true });
      if (v != null && v.trim()) { await api('PATCH', `/api/memories/${m.id}`, { content: v.trim() }); renderPanel(); }
    }
  });
  el.querySelector('[data-clear]')?.addEventListener('click', safe(async () => {
    if (!(await confirmBox(t('forgetAll') + '?'))) return;
    const [scope, sid] = memFilter.includes(':') ? memFilter.split(':') : [memFilter, memFilter === 'channel' ? c.id : null];
    await api('POST', '/api/memories/clear', { scope, scopeId: sid });
    renderPanel();
  }));
}

// ------------------------------------------------------------------ artifacts

async function artifactsPanel(el, c, head) {
  const list = await api('GET', `/api/artifacts?channelId=${c.id}`);
  el.innerHTML = head(`📄 ${t('artifacts')}`, S.user.role !== 'guest' ? `<button class="btn sm" data-new>＋</button>` : '') + `
    <div class="panel-body">
      ${list.length ? `<div class="art-list">${list.map((a) => `<button class="artifact-card" data-artifact="${a.id}"><span class="art-icon">${TYPE_ICON[a.type] || '📄'}</span>
        <span class="grow"><strong>${esc(a.title)}</strong><span class="muted small">${t('type_' + a.type)} · v${a.version} · ${timeAgo(a.updatedAt)}${a.createdByType === 'agent' ? ` · ${esc(agentById(a.createdById)?.avatar || '')} ${esc(agentById(a.createdById)?.name || '')}` : ''}</span></span></button>`).join('')}</div>`
        : `<p class="muted small">${t('noArtifacts')}</p>`}
    </div>`;
  el.querySelector('.panel-body').onclick = (e) => { const a = e.target.closest('[data-artifact]')?.dataset.artifact; if (a) openArtifact(a); };
  el.querySelector('[data-new]')?.addEventListener('click', () => newArtifact(c));
}

function newArtifact(c) {
  const m = modal({
    title: t('newArtifact'), wide: true,
    body: `<form id="art-new" class="form">
      <div class="row"><label class="field grow"><span>${t('name')}</span><input name="title" required></label>
      <label class="field"><span>Type</span><select name="type">${['document', 'research', 'slides', 'dashboard', 'website'].map((x) => `<option value="${x}">${t('type_' + x)}</option>`).join('')}</select></label></div>
      <label class="field"><span>Content</span><textarea name="content" rows="14" class="mono"></textarea></label></form>`,
    footer: `<button class="btn primary" form="art-new">${t('create')}</button>`,
  });
  m.el.querySelector('#art-new').onsubmit = safe(async (e) => {
    e.preventDefault();
    const a = await api('POST', '/api/artifacts', { ...formData(e.target), channelId: c.id });
    m.close();
    openArtifact(a.id);
  });
}

// ------------------------------------------------------------------ workflows

async function workflowsPanel(el, c, head) {
  const list = await api('GET', '/api/workflows');
  el.innerHTML = head(`⚡ ${t('workflows')}`, S.user.role !== 'guest' ? `<button class="btn sm" data-new>＋</button>` : '') + `
    <div class="panel-body">
      <p class="muted small">${t('templateVars')}</p>
      ${list.length ? list.map((w) => `<div class="wf-card" data-id="${w.id}">
        <div class="row"><strong class="grow">${esc(w.name)}</strong>${w.trigger !== 'manual' ? `<span class="chip">${w.trigger === 'webhook' ? '🔗' : '⏰'} ${esc(w.scheduleLabel?.zh || '')}</span>` : ''}</div>
        ${w.description ? `<div class="muted small">${esc(w.description)}</div>` : ''}
        <div class="wf-steps">${w.steps.map((s, i) => { const a = agentById(s.agentId); return `${i ? `<span class="muted">${s.parallel ? '∥' : '→'}</span>` : ''}<span class="mini-av" title="${esc(a?.name || '?')}: ${esc(s.instruction)}" style="--c:${esc(a?.color || '#888')}">${esc(a?.avatar || '?')}</span>`; }).join('')}</div>
        <div class="row">${S.user.role !== 'guest' ? `<button class="btn primary sm" data-run="${w.id}">▶ ${t('run')}</button><button class="btn ghost sm" data-edit="${w.id}">✎</button>` : ''}
          ${w.lastRunAt ? `<span class="muted small">${timeAgo(w.lastRunAt)}</span>` : ''}</div>
      </div>`).join('') : `<p class="muted small">${t('noWorkflows')}</p>`}
    </div>`;
  el.querySelector('[data-new]')?.addEventListener('click', () => openWorkflowEditor(null, c));
  el.querySelector('.panel-body').onclick = safe(async (e) => {
    const run = e.target.closest('[data-run]')?.dataset.run;
    if (run) {
      const input = await promptBox(t('runWorkflow'), { label: t('workflowInput'), multiline: true, ok: `▶ ${t('run')}` });
      if (input == null) return;
      await api('POST', `/api/workflows/${run}/run`, { input, channelId: c.id });
      toast(t('workflowStarted'), 'ok');
    }
    const ed = e.target.closest('[data-edit]')?.dataset.edit;
    if (ed) openWorkflowEditor(list.find((w) => w.id === ed), c);
  });
}

export async function openWorkflowEditor(w, c) {
  const templates = await api('GET', '/api/workflows/templates');
  let steps = w ? w.steps.map((s) => ({ ...s })) : [{ agentId: S.agents[0]?.id, instruction: '{{input}}', parallel: false }];
  const runs = w ? await api('GET', `/api/workflows/${w.id}/runs`) : [];
  const agentOpts = (sel) => S.agents.map((a) => `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${esc(a.avatar)} ${esc(a.name)} (@${esc(a.handle)})</option>`).join('');
  const m = modal({
    title: w ? w.name : t('newWorkflow'), wide: true,
    body: `<form id="wf-form" class="form">
      ${w ? '' : `<label class="field"><span>${t('fromTemplate')}</span><select data-tpl><option value="">—</option>${templates.map((x) => `<option value="${x.key}">${esc(x.name)} — ${esc(x.description)}</option>`).join('')}</select></label>`}
      <div class="row"><label class="field grow"><span>${t('name')}</span><input name="name" required value="${esc(w?.name || '')}"></label>
      <label class="field grow"><span>${t('channels')}</span><select name="channelId">${S.channels.map((x) => `<option value="${x.id}"${(w?.channelId || c?.id || S.current) === x.id ? ' selected' : ''}>${x.kind === 'dm' ? '💬' : '#'} ${esc(x.name)}</option>`).join('')}</select></label></div>
      <label class="field"><span>${t('wfDescription')}</span><input name="description" value="${esc(w?.description || '')}"></label>
      <div class="field"><span>${t('steps')}</span><div class="steps" id="wf-steps"></div><button type="button" class="btn ghost sm" data-add>＋ ${t('addStep')}</button><p class="muted small">${t('templateVars')}</p></div>
      <div class="field"><span>${t('when')}</span>${scheduleEditorHtml(w?.trigger || 'manual', w?.schedule)}</div>
      <label class="field"><span>${t('scheduleInput')}</span><input name="scheduleInput" value="${esc(w?.scheduleInput || '')}"></label>
      ${w?.hookToken && w.trigger === 'webhook' ? `<p class="small">Webhook: <code>${esc(location.origin)}/hooks/${esc(w.hookToken)}</code></p>` : ''}
    </form>
    ${runs.length ? `<h4>${t('runs')}</h4><ul class="runs">${runs.map((r) => `<li><span class="chip ${r.status === 'error' ? 'bad' : ''}">${r.status}</span> ${timeAgo(r.startedAt)} ${r.input ? `— ${esc(r.input.slice(0, 80))}` : ''} ${r.error ? `<span class="danger-text small">${esc(r.error)}</span>` : ''}</li>`).join('')}</ul>` : ''}`,
    footer: `${w ? `<button class="btn danger" data-delwf>${t('delete')}</button><span class="grow"></span>` : ''}<button class="btn ghost" data-cancel>${t('cancel')}</button><button class="btn primary" form="wf-form">${t('save')}</button>`,
  });
  bindScheduleEditor(m.el);
  const box = m.el.querySelector('#wf-steps');
  const draw = () => {
    box.innerHTML = steps.map((s, i) => `<div class="step" data-i="${i}">
      <div class="row"><span class="step-n">${i + 1}</span><select data-k="agentId">${agentOpts(s.agentId)}</select>
        <span class="grow"></span>
        <button type="button" class="icon-btn sm" data-up="${i}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-btn sm" data-down="${i}" ${i < steps.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="icon-btn sm" data-rm="${i}">✕</button></div>
      <textarea data-k="instruction" rows="2" placeholder="${t('instruction')}">${esc(s.instruction)}</textarea>
      ${i ? `<label class="check small"><input type="checkbox" data-k="parallel"${s.parallel ? ' checked' : ''}> ∥ ${t('parallel')}</label>` : ''}
    </div>`).join('');
  };
  draw();
  box.addEventListener('input', (e) => {
    const i = +e.target.closest('[data-i]').dataset.i;
    const k = e.target.dataset.k;
    if (k) steps[i][k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (k === 'parallel') steps[i - 1].parallel = steps[i].parallel || steps[i - 1].parallel;
  });
  box.addEventListener('click', (e) => {
    const d = (k) => e.target.closest(`[data-${k}]`)?.dataset[k];
    if (d('rm') != null) { steps.splice(+d('rm'), 1); draw(); }
    if (d('up') != null) { const i = +d('up'); [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; draw(); }
    if (d('down') != null) { const i = +d('down'); [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; draw(); }
  });
  m.el.querySelector('[data-add]').onclick = () => { steps.push({ agentId: S.agents[0]?.id, instruction: '', parallel: false }); draw(); };
  m.el.querySelector('[data-cancel]').onclick = m.close;
  m.el.querySelector('[data-tpl]')?.addEventListener('change', (e) => {
    const tpl = templates.find((x) => x.key === e.target.value);
    if (!tpl) return;
    m.el.querySelector('[name=name]').value = tpl.name;
    m.el.querySelector('[name=description]').value = tpl.description;
    steps = tpl.steps.map((s) => ({ agentId: S.agents.find((a) => a.handle === s.handle)?.id || S.agents[0]?.id, instruction: s.instruction, parallel: !!s.parallel }));
    draw();
  });
  m.el.querySelector('#wf-form').onsubmit = safe(async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const body = { name: f.name, description: f.description, channelId: f.channelId, scheduleInput: f.scheduleInput, trigger: f.trigger, schedule: readSchedule(f), steps, icon: w?.icon, category: w?.category };
    if (w) await api('PATCH', `/api/workflows/${w.id}`, body); else await api('POST', '/api/workflows', body);
    toast(t('saved'), 'ok');
    m.close();
    if (S.panel === 'workflows') renderPanel();
    if (S.view === 'automations') renderView('automations', document.querySelector('#view'));
  });
  m.el.querySelector('[data-delwf]')?.addEventListener('click', safe(async () => {
    if (await confirmBox(`${t('delete')} “${w.name}”?`)) { await api('DELETE', `/api/workflows/${w.id}`); m.close(); renderPanel(); }
  }));
}

// ------------------------------------------------------------------ members

function membersPanel(el, c, head) {
  const people = c.members.users.map(userById).filter(Boolean);
  const bots = c.members.agents.map(agentById).filter(Boolean);
  const others = S.agents.filter((a) => !c.members.agents.includes(a.id));
  const outsiders = S.users.filter((u) => !c.members.users.includes(u.id));
  const canEdit = S.user.role !== 'guest';
  el.innerHTML = head(`👥 ${t('members')}`) + `
    <div class="panel-body">
      <h4>${t('aiMembers')} (${bots.length})</h4>
      <ul class="member-list">${bots.map((a) => `<li><span class="avatar agent sm" style="--c:${esc(a.color)}">${esc(a.avatar)}</span><div class="grow"><strong>${esc(a.name)}</strong> <span class="muted small">@${esc(a.handle)}</span><div class="muted small">${esc(a.description)}</div></div>
        ${canEdit && c.kind === 'channel' ? `<button class="icon-btn sm" data-rm-agent="${a.id}" title="${t('remove')}">✕</button>` : ''}</li>`).join('')}</ul>
      ${canEdit && others.length && c.kind === 'channel' ? `<div class="row"><select id="add-agent">${others.map((a) => `<option value="${a.id}">${esc(a.avatar)} ${esc(a.name)}</option>`).join('')}</select><button class="btn sm" data-add-agent>${t('add')}</button></div>` : ''}
      <h4>${t('humans')} (${people.length})</h4>
      <ul class="member-list">${people.map((u) => `<li><span class="avatar user sm">${esc(initials(u.displayName))}${S.online.has(u.id) ? '<i class="online-dot"></i>' : ''}</span><div class="grow"><strong>${esc(u.displayName)}</strong> <span class="muted small">@${esc(u.username)} · ${t('role_' + u.role)}</span></div>
        ${(canEdit && c.kind === 'channel' && (isAdmin() || u.id === S.user.id)) ? `<button class="icon-btn sm" data-rm-user="${u.id}" title="${t('remove')}">✕</button>` : ''}</li>`).join('')}</ul>
      ${canEdit && outsiders.length && c.kind === 'channel' ? `<div class="row"><select id="add-user">${outsiders.map((u) => `<option value="${u.id}">${esc(u.displayName)} (@${esc(u.username)})</option>`).join('')}</select><button class="btn sm" data-add-user>${t('add')}</button></div>` : ''}
    </div>`;
  el.querySelector('.panel-body').onclick = safe(async (e) => {
    const d = (k) => e.target.closest(`[data-${k}]`)?.dataset[k.replace(/-(\w)/g, (_, x) => x.toUpperCase())];
    if (e.target.closest('[data-add-agent]')) await api('POST', `/api/channels/${c.id}/members`, { type: 'agent', id: $('#add-agent', el).value });
    else if (e.target.closest('[data-add-user]')) await api('POST', `/api/channels/${c.id}/members`, { type: 'user', id: $('#add-user', el).value });
    else if (d('rm-agent')) await api('DELETE', `/api/channels/${c.id}/members/agent/${d('rm-agent')}`);
    else if (d('rm-user')) {
      await api('DELETE', `/api/channels/${c.id}/members/user/${d('rm-user')}`);
      if (d('rm-user') === S.user.id && c.private) { await refreshChannels(); return openChannel(S.channels[0]?.id); }
    } else return;
    await refreshChannels();
    renderPanel();
  });
}
