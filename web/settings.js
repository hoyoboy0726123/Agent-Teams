// Settings: providers, workspace, users, usage, audit, data; agent editor and team templates.
import { t } from './i18n.js';
import { $, esc, api, toast, safe, modal, confirmBox, formData, timeAgo, fmtNum, initials } from './ui.js';
import { S, isAdmin, agentById, loadState, renderSidebar, refreshAgents, refreshChannels, currentChannel } from './app.js';

const KIND_ORDER = ['subscription', 'api', 'local'];
const KIND_LABEL = { subscription: 'subscription', api: 'apiProviders', local: 'local' };

// ------------------------------------------------------------------ settings modal

export function openSettings(tab) {
  const admin = isAdmin();
  const tabs = [
    ...(admin ? [['providers', '🧠'], ['integrations', '🔌'], ['workspace', '🏢'], ['users', '👤'], ['usage', '📈'], ['audit', '📜']] : []),
    ['data', '🔐'],
  ];
  tab ||= tabs[0][0];
  const m = modal({
    title: t('settings'), wide: true,
    body: `<div class="settings"><nav class="set-nav">${tabs.map(([k, i]) => `<button data-tab="${k}"${k === tab ? ' class="on"' : ''}>${i} ${t(k)}</button>`).join('')}</nav><section class="set-body" id="set-body"></section></div>`,
  });
  const show = safe(async (k) => {
    m.el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
    const body = m.el.querySelector('#set-body');
    body.innerHTML = `<p class="muted">${t('loading')}</p>`;
    await ({ providers: providersTab, integrations: integrationsTab, workspace: workspaceTab, users: usersTab, usage: usageTab, audit: auditTab, data: dataTab })[k](body);
  });
  m.el.querySelector('.set-nav').onclick = (e) => { const k = e.target.closest('[data-tab]')?.dataset.tab; if (k) show(k); };
  show(tab);
}

// ------------------------------------------------------------------ providers

async function providersTab(body) {
  const list = await api('GET', '/api/providers');
  S.providers = list;
  const cat = S.catalog;
  body.innerHTML = `
    <div class="row"><h3 class="grow">${t('providers')}</h3></div>
    <div class="prov-list">${list.map((p) => {
      const c = cat.find((x) => x.type === p.type);
      return `<div class="prov${p.enabled ? '' : ' off'}" data-id="${p.id}">
        <div class="grow"><strong>${esc(p.name)}</strong> <span class="chip">${t('kind_' + (c?.kind || 'api'))}</span>
          <div class="muted small">${esc(c?.label || p.type)}${p.baseUrl ? ` · ${esc(p.baseUrl)}` : ''}${p.hasKey ? ` · 🔑 ${esc(p.keyPreview)}` : ''}${p.extra?.defaultModel ? ` · ${esc(p.extra.defaultModel)}` : ''}</div>
          <div class="test-out small" data-out="${p.id}"></div></div>
        <button class="btn sm" data-test="${p.id}">${t('test')}</button>
        <button class="btn ghost sm" data-edit="${p.id}">✎</button>
        <button class="icon-btn sm" data-del="${p.id}">🗑</button></div>`;
    }).join('')}</div>
    <h3>${t('addProvider')}</h3>
    ${KIND_ORDER.map((k) => `<h4 class="muted">${t(KIND_LABEL[k])}</h4><div class="cat-grid">${cat.filter((c) => c.kind === k).map((c) => `<button class="cat" data-add="${c.type}"><strong>${esc(c.label)}</strong>${c.hint ? `<span class="muted small">${esc(c.hint)}</span>` : ''}</button>`).join('')}</div>`).join('')}`;
  body.onclick = safe(async (e) => {
    const d = (k) => e.target.closest(`[data-${k}]`)?.dataset[k];
    if (d('add')) providerForm(cat.find((c) => c.type === d('add')), null, () => providersTab(body));
    if (d('edit')) { const p = list.find((x) => x.id === d('edit')); providerForm(cat.find((c) => c.type === p.type), p, () => providersTab(body)); }
    if (d('del')) { if (await confirmBox(t('delete') + '?')) { await api('DELETE', `/api/providers/${d('del')}`); providersTab(body); } }
    if (d('test')) {
      const out = body.querySelector(`[data-out="${d('test')}"]`);
      out.textContent = t('loading');
      const r = await api('POST', `/api/providers/${d('test')}/test`, {});
      out.innerHTML = r.ok ? `<span class="ok-text">✓ ${esc(r.reply)} · ${r.ms}ms</span>` : `<span class="danger-text">✗ ${esc(r.error)}</span>`;
    }
  });
}

function providerForm(c, p, done) {
  const extra = p?.extra || {};
  const isCli = c.kind === 'subscription';
  const m = modal({
    title: `${p ? t('edit') : t('addProvider')}: ${c.label}`,
    body: `<form id="prov-form" class="form">
      ${c.hint ? `<p class="hint">💡 ${esc(c.hint)}</p>` : ''}
      ${c.docs ? `<p class="small"><a href="${esc(c.docs)}" target="_blank" rel="noopener">${c.needsKey ? t('getKey') : 'Docs'} ↗</a></p>` : ''}
      <label class="field"><span>${t('name')}</span><input name="name" value="${esc(p?.name || c.label)}"></label>
      ${c.needsKey || ['openai-compatible', 'lmstudio'].includes(c.type) ? `<label class="field"><span>${t('apiKey')}</span><input name="apiKey" type="password" autocomplete="off" placeholder="${p?.hasKey ? esc(p.keyPreview) + ' — ' + t('keySaved') : ''}"></label>` : ''}
      ${isCli ? `<label class="field"><span>${t('cliPath')}</span><input name="bin" value="${esc(extra.bin || '')}" placeholder="${c.type === 'claude-code' ? 'claude' : c.type === 'codex' ? 'codex' : 'gemini'}"></label>` : ''}
      ${c.defaultBaseUrl ? `<label class="field"><span>${t('baseUrl')}</span><input name="baseUrl" value="${esc(p?.baseUrl || '')}" placeholder="${esc(c.defaultBaseUrl)}"></label>` : ''}
      <label class="field"><span>${t('defaultModel')}</span><input name="defaultModel" list="dl-models" value="${esc(extra.defaultModel || '')}" placeholder="${esc(c.defaultModel)}"><datalist id="dl-models">${c.models.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
      ${c.type === 'ollama' ? `<label class="field"><span>num_ctx</span><input name="numCtx" type="number" value="${esc(extra.numCtx || '')}" placeholder="8192"></label>` : ''}
      ${p ? `<label class="check"><input type="checkbox" name="enabled"${p.enabled ? ' checked' : ''}> ${t('enabled')}</label>` : ''}
    </form>`,
    footer: `<button class="btn ghost" data-cancel>${t('cancel')}</button><button class="btn primary" form="prov-form">${t('save')}</button>`,
  });
  m.el.querySelector('[data-cancel]').onclick = m.close;
  m.el.querySelector('#prov-form').onsubmit = safe(async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const payload = {
      name: f.name, baseUrl: f.baseUrl, apiKey: f.apiKey || undefined,
      extra: { ...extra, defaultModel: f.defaultModel || undefined, bin: f.bin || undefined, numCtx: f.numCtx || undefined },
    };
    if (p) await api('PATCH', `/api/providers/${p.id}`, { ...payload, enabled: f.enabled });
    else {
      const created = await api('POST', '/api/providers', { type: c.type, ...payload });
      // Offer: point agents without a working model at this provider.
      const orphans = S.agents.filter((a) => !a.providerId || S.providers.find((x) => x.id === a.providerId)?.type === 'demo');
      if (orphans.length && await confirmBox(`Use “${created.name}” for ${orphans.length} agent(s) currently on the demo / no model?`, { danger: false, ok: t('ok') })) {
        for (const a of orphans) await api('PATCH', `/api/agents/${a.id}`, { providerId: created.id, model: f.defaultModel || null });
        await refreshAgents();
      }
    }
    toast(t('saved'), 'ok');
    m.close();
    await loadState();
    renderSidebar();
    done();
  });
}

// ------------------------------------------------------------------ integrations (MCP)

const STATUS_ICON = { connected: '🟢', connecting: '🟡', error: '🔴', idle: '⚪' };

async function integrationsTab(body) {
  const [servers, presets] = await Promise.all([api('GET', '/api/mcp/servers'), api('GET', '/api/mcp/presets')]);
  body.innerHTML = `<h3>🔌 ${t('integrations')}</h3><p class="muted small">${t('mcpIntro')}</p>
    <div class="prov-list">${servers.map((sv) => `<div class="prov${sv.enabled ? '' : ' off'}">
      <div class="grow"><strong>${esc(presets.find((p) => p.key === sv.preset)?.icon || '🧩')} ${esc(sv.name)}</strong> <code class="small">${esc(sv.slug)}.*</code>
        <div class="muted small">${STATUS_ICON[sv.status?.state] || '⚪'} ${esc(sv.status?.state || 'idle')}${sv.status?.tools ? ` · ${sv.status.tools} tools` : ''}${sv.status?.error ? ` · ${esc(sv.status.error.slice(0, 160))}` : ''} · ${t('approval')}: ${t('approvalPolicy_' + sv.approval)}</div>
        <div class="test-out small" data-out="${sv.id}"></div></div>
      <button class="btn sm" data-connect="${sv.id}">${t('testConnection')}</button>
      <button class="btn ghost sm" data-edit="${sv.id}">✎</button>
      <button class="icon-btn sm" data-del="${sv.id}">🗑</button></div>`).join('') || `<p class="muted small">${t('noIntegrations')}</p>`}</div>
    <h3>${t('addIntegration')}</h3>
    <div class="cat-grid">${presets.map((p) => `<button class="cat" data-preset="${p.key}"><strong>${p.icon} ${esc(p.name)}</strong><span class="muted small">${esc(p.description)}</span></button>`).join('')}</div>`;
  body.onclick = safe(async (e) => {
    const d = (k) => e.target.closest(`[data-${k}]`)?.dataset[k];
    if (d('preset')) mcpForm(presets.find((p) => p.key === d('preset')), null, () => integrationsTab(body));
    if (d('edit')) { const sv = servers.find((x) => x.id === d('edit')); mcpForm(presets.find((p) => p.key === sv.preset) || presets.find((p) => p.key === (sv.transport === 'stdio' ? 'custom-stdio' : 'custom-http')), sv, () => integrationsTab(body)); }
    if (d('del')) { if (await confirmBox(t('delete') + '?')) { await api('DELETE', `/api/mcp/servers/${d('del')}`); integrationsTab(body); } }
    if (d('connect')) {
      const out = body.querySelector(`[data-out="${d('connect')}"]`);
      out.innerHTML = `<span class="spin">⏳</span> ${t('connecting')}`;
      const r = await api('POST', `/api/mcp/servers/${d('connect')}/connect`, {});
      out.innerHTML = r.ok ? `<span class="ok-text">✓ ${r.tools.length} tools</span><div class="tool-list">${r.tools.map((x) => `<span class="chip${x.approval ? ' warn' : ''}" title="${esc(x.description)}">${x.approval ? '🔐 ' : ''}${esc(x.name)}</span>`).join('')}</div>` : `<span class="danger-text">✗ ${esc(r.error)}</span>`;
    }
  });
}

function mcpForm(p, sv, done) {
  const custom = p.key.startsWith('custom');
  const isStdio = (sv?.transport || p.transport) === 'stdio';
  const m = modal({
    title: `${p.icon} ${sv ? t('edit') : t('addIntegration')}: ${p.name}`, wide: true,
    body: `<form class="form" id="mcp-form">
      <p class="muted small">${esc(p.description)} ${p.docs ? `<a href="${esc(p.docs)}" target="_blank" rel="noopener">Docs ↗</a>` : ''}</p>
      ${p.note ? `<p class="hint">💡 ${esc(p.note)}</p>` : ''}
      <label class="field"><span>${t('name')}</span><input name="name" value="${esc(sv?.name || p.name)}"></label>
      ${sv || custom ? `
        <label class="field"><span>Transport</span><select name="transport">${['stdio', 'http', 'sse'].map((x) => `<option value="${x}"${(sv?.transport || p.transport) === x ? ' selected' : ''}>${x === 'stdio' ? 'stdio (local command)' : x === 'http' ? 'Streamable HTTP' : 'SSE (legacy)'}</option>`).join('')}</select></label>
        <label class="field" data-t="stdio"><span>${t('command')}</span><input name="command" value="${esc(sv?.command || p.command || '')}" placeholder="npx"></label>
        <label class="field" data-t="stdio"><span>${t('argsOnePerLine')}</span><textarea name="args" rows="3" class="mono">${esc((sv?.args || p.args || []).join('\n'))}</textarea></label>
        <label class="field" data-t="stdio"><span>${t('envVars')} (KEY=value)</span><textarea name="env" rows="3" class="mono">${esc(Object.entries(sv?.env || {}).map(([k, v]) => `${k}=${v}`).join('\n'))}</textarea></label>
        <label class="field" data-t="http sse"><span>URL</span><input name="url" value="${esc(sv?.url || p.url || '')}" placeholder="https://example.com/mcp"></label>
        <label class="field" data-t="http sse"><span>${t('headers')} (Name: value)</span><textarea name="headers" rows="2" class="mono">${esc(Object.entries(sv?.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n'))}</textarea></label>`
      : `${(p.fields || []).map((f) => `<label class="field"><span>${esc(f.label)}</span><input name="v_${f.key}" ${f.secret ? 'type="password"' : ''} placeholder="${esc(f.placeholder || '')}" required></label>`).join('')}
         ${(p.env || []).map((f) => `<label class="field"><span>${esc(f.label)}</span><input name="v_${f.key}" ${f.secret ? 'type="password" autocomplete="off"' : ''} required></label>`).join('')}
         ${(p.headers || []).map((f) => `<label class="field"><span>${esc(f.label)}</span><input name="v_${f.key}" ${f.secret ? 'type="password" autocomplete="off"' : ''} required></label>`).join('')}
         ${p.command ? `<p class="muted small">${t('willRun')}: <code>${esc([p.command, ...(p.args || [])].join(' '))}</code></p>` : `<p class="muted small">URL: <code>${esc(p.url)}</code></p>`}`}
      <label class="field"><span>${t('approval')}</span><select name="approval">${['auto', 'always', 'never'].map((x) => `<option value="${x}"${(sv?.approval || 'auto') === x ? ' selected' : ''}>${t('approvalPolicy_' + x)}</option>`).join('')}</select><small class="muted">${t('approvalHint')}</small></label>
      ${sv ? `<label class="check"><input type="checkbox" name="enabled"${sv.enabled ? ' checked' : ''}> ${t('enabled')}</label>` : ''}
      <label class="field"><span>${t('grantAgents')}</span><div class="pick-grid">${S.agents.map((a) => `<label class="pick"><input type="checkbox" name="agents" data-multi="1" value="${a.id}"${sv && (a.mcpServers || []).includes(sv.id) ? ' checked' : ''}><span class="mini-av" style="--c:${esc(a.color)}">${esc(a.avatar)}</span>${esc(a.name)}</label>`).join('')}</div></label>
    </form>`,
    footer: `<button class="btn ghost" data-cancel>${t('cancel')}</button><button class="btn primary" form="mcp-form">${t('save')}</button>`,
  });
  const syncT = () => { const tr = m.el.querySelector('[name=transport]')?.value; m.el.querySelectorAll('[data-t]').forEach((x) => { x.hidden = !x.dataset.t.split(' ').includes(tr); }); };
  m.el.querySelector('[name=transport]')?.addEventListener('change', syncT);
  syncT();
  m.el.querySelector('[data-cancel]').onclick = m.close;
  m.el.querySelector('#mcp-form').onsubmit = safe(async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const kv = (txt, sep) => Object.fromEntries(String(txt || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf(sep); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }).filter(([k]) => k));
    let saved;
    if (sv || custom) {
      const payload = { name: f.name, transport: f.transport, command: f.command, args: f.args, env: kv(f.env, '='), url: f.url, headers: kv(f.headers, ':'), approval: f.approval, enabled: sv ? f.enabled : true, preset: p.key };
      saved = sv ? await api('PATCH', `/api/mcp/servers/${sv.id}`, payload) : await api('POST', '/api/mcp/servers', payload);
    } else {
      const values = Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith('v_')).map(([k, v]) => [k.slice(2), v]));
      saved = await api('POST', '/api/mcp/servers', { preset: p.key, values: { ...values, name: f.name, approval: f.approval } });
    }
    // Grant / revoke per agent.
    for (const a of S.agents) {
      const has = (a.mcpServers || []).includes(saved.id);
      const want = f.agents.includes(a.id);
      if (has !== want) await api('PATCH', `/api/agents/${a.id}`, { mcpServers: want ? [...(a.mcpServers || []), saved.id] : a.mcpServers.filter((x) => x !== saved.id) });
    }
    await refreshAgents();
    toast(t('saved'), 'ok');
    m.close();
    done();
  });
}

// ------------------------------------------------------------------ workspace

const modelPicker = (name, val, allowOff = true) => `<div class="row">
  <select name="${name}_provider">${allowOff ? `<option value="">${t('off')}</option>` : ''}${S.providers.map((p) => `<option value="${p.id}"${val?.providerId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
  <input name="${name}_model" placeholder="${t('model')}" value="${esc(val?.model || '')}"></div>`;

async function workspaceTab(body) {
  const [s, search] = await Promise.all([api('GET', '/api/settings'), api('GET', '/api/settings/search')]);
  body.innerHTML = `<form class="form" id="ws-form">
    <label class="field"><span>${t('workspaceName')}</span><input name="workspaceName" value="${esc(s.workspaceName)}"></label>
    <div class="field"><span>${t('router')}</span>${modelPicker('router', s.router)}<small class="muted">${t('routerHint')}</small></div>
    <div class="field"><span>${t('utilityModel')}</span>${modelPicker('utility', s.utilityModel)}<small class="muted">${t('utilityHint')}</small></div>
    <label class="check"><input type="checkbox" name="autoExtract"${s.memory?.autoExtract !== false ? ' checked' : ''}> ${t('autoExtract')}</label>
    <label class="check"><input type="checkbox" name="autoSummarize"${s.memory?.autoSummarize !== false ? ' checked' : ''}> ${t('autoSummarize')}</label>
    <label class="field"><span>${t('defaultTtl')}</span><input name="defaultTtlDays" type="number" min="1" value="${s.memory?.defaultTtlDays || ''}"></label>
    <label class="check"><input type="checkbox" name="synthesis"${s.synthesis !== false ? ' checked' : ''}> ${t('synthesis')}</label>
    <label class="check"><input type="checkbox" name="allowRegistration"${s.allowRegistration ? ' checked' : ''}> ${t('allowRegistration')}</label>
    <label class="field"><span>${t('timezone')}</span><input name="timezone" list="tz-list" value="${esc(s.timezone || '')}" placeholder="${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}"><datalist id="tz-list">${(Intl.supportedValuesOf?.('timeZone') || []).map((z) => `<option value="${z}">`).join('')}</datalist></label>
    <div class="field"><span>${t('searchProvider')}</span><div class="row"><select name="searchProvider">${['duckduckgo', 'tavily', 'brave'].map((p) => `<option value="${p}"${search.provider === p ? ' selected' : ''}>${p === 'duckduckgo' ? 'DuckDuckGo (free)' : p === 'tavily' ? 'Tavily' : 'Brave Search'}</option>`).join('')}</select>
      <input name="searchKey" type="password" placeholder="${search.hasKey ? t('keySaved') : t('apiKey')}"></div><small class="muted">${t('searchHint')}</small></div>
    <div><button class="btn primary">${t('save')}</button></div></form>`;
  body.querySelector('#ws-form').onsubmit = safe(async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    S.settings = await api('PATCH', '/api/settings', {
      workspaceName: f.workspaceName,
      router: f.router_provider ? { providerId: f.router_provider, model: f.router_model || null } : null,
      utilityModel: f.utility_provider ? { providerId: f.utility_provider, model: f.utility_model || null } : null,
      memory: { autoExtract: f.autoExtract, autoSummarize: f.autoSummarize, defaultTtlDays: f.defaultTtlDays || null },
      synthesis: f.synthesis,
      allowRegistration: f.allowRegistration,
      timezone: f.timezone || null,
    });
    await api('PATCH', '/api/settings/search', { provider: f.searchProvider, apiKey: f.searchKey || undefined });
    renderSidebar();
    toast(t('saved'), 'ok');
  });
}

// ------------------------------------------------------------------ users

async function usersTab(body) {
  const users = await api('GET', '/api/users');
  S.users = users;
  const roles = ['admin', 'member', 'guest'];
  body.innerHTML = `
    <ul class="member-list">${users.map((u) => `<li><span class="avatar user sm">${esc(initials(u.displayName))}</span><div class="grow"><strong>${esc(u.displayName)}</strong> <span class="muted small">@${esc(u.username)} · ${timeAgo(u.createdAt)}</span></div>
      ${u.role === 'owner' ? `<span class="chip">${t('role_owner')}</span>` : `<select data-role="${u.id}">${roles.map((r) => `<option value="${r}"${u.role === r ? ' selected' : ''}>${t('role_' + r)}</option>`).join('')}</select>
      <button class="icon-btn sm" data-del="${u.id}">🗑</button>`}</li>`).join('')}</ul>
    <h3>${t('inviteUser')}</h3>
    <form class="form row wrap" id="invite">
      <input name="displayName" placeholder="${t('displayName')}" required>
      <input name="username" placeholder="${t('username')}" required>
      <input name="password" type="password" placeholder="${t('password')}" required minlength="6">
      <select name="role">${roles.map((r) => `<option value="${r}"${r === 'member' ? ' selected' : ''}>${t('role_' + r)}</option>`).join('')}</select>
      <button class="btn primary">${t('add')}</button>
    </form>`;
  body.querySelector('#invite').onsubmit = safe(async (e) => { e.preventDefault(); await api('POST', '/api/users', formData(e.target)); toast(t('created'), 'ok'); usersTab(body); });
  body.onchange = safe(async (e) => { const id = e.target.dataset.role; if (id) { await api('PATCH', `/api/users/${id}`, { role: e.target.value }); toast(t('saved'), 'ok'); } });
  body.onclick = safe(async (e) => { const id = e.target.closest('[data-del]')?.dataset.del; if (id && await confirmBox(t('delete') + '?')) { await api('DELETE', `/api/users/${id}`); usersTab(body); } });
}

// ------------------------------------------------------------------ usage

async function usageTab(body) {
  const u = await api('GET', '/api/usage?days=30');
  const provName = (id) => S.providers.find((p) => p.id === id)?.name || id || '—';
  const max = Math.max(1, ...u.daily.map((d) => d.calls));
  body.innerHTML = `<h3>${t('usage')} · ${t('last30')}</h3>
    <div class="bars" role="img" aria-label="daily calls">${u.daily.map((d) => `<div class="bar" style="--h:${(d.calls / max) * 100}%" title="${d.day}: ${d.calls} ${t('calls')}, ${fmtNum(d.tokens)} tokens"></div>`).join('') || `<p class="muted">—</p>`}</div>
    <h4>${t('byAgent')}</h4>
    <div class="table-wrap"><table><thead><tr><th>Agent</th><th>${t('calls')}</th><th>${t('inputTokens')}</th><th>${t('outputTokens')}</th><th>${t('avgLatency')}</th><th>${t('errors')}</th></tr></thead><tbody>
    ${u.byAgent.map((r) => { const a = agentById(r.agentId); return `<tr><td>${a ? `${esc(a.avatar)} ${esc(a.name)}` : '⚙️ system'}</td><td>${fmtNum(r.calls)}</td><td>${fmtNum(r.input)}</td><td>${fmtNum(r.output)}</td><td>${fmtNum(r.avgMs)} ms</td><td>${r.errors || 0}</td></tr>`; }).join('')}</tbody></table></div>
    <h4>${t('byModel')}</h4>
    <div class="table-wrap"><table><thead><tr><th>${t('provider')}</th><th>${t('model')}</th><th>${t('calls')}</th><th>${t('inputTokens')}</th><th>${t('outputTokens')}</th><th>${t('avgLatency')}</th></tr></thead><tbody>
    ${u.byModel.map((r) => `<tr><td>${esc(provName(r.providerId))}</td><td>${esc(r.model || '')}</td><td>${fmtNum(r.calls)}</td><td>${fmtNum(r.input)}</td><td>${fmtNum(r.output)}</td><td>${fmtNum(r.avgMs)} ms</td></tr>`).join('')}</tbody></table></div>`;
}

// ------------------------------------------------------------------ audit

async function auditTab(body) {
  const rows = await api('GET', '/api/audit?limit=300');
  const who = (r) => r.actor_type === 'agent' ? `${agentById(r.actor_id)?.avatar || '🤖'} ${agentById(r.actor_id)?.name || r.actor_id}` : r.actor_type === 'user' ? `👤 ${S.users.find((u) => u.id === r.actor_id)?.displayName || r.actor_id || ''}` : `⚙️ ${r.actor_id || r.actor_type}`;
  body.innerHTML = `<div class="table-wrap"><table class="audit"><thead><tr><th>${t('when')}</th><th>${t('who')}</th><th>${t('action')}</th><th>${t('target')}</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="nowrap">${new Date(r.created_at).toLocaleString()}</td><td>${esc(who(r))}</td><td><code>${esc(r.action)}</code></td><td class="muted small">${esc(r.target || '')}</td><td class="muted small">${esc(JSON.stringify(r.detail)).slice(0, 120)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

// ------------------------------------------------------------------ data & privacy

async function dataTab(body) {
  body.innerHTML = `
    ${isAdmin() ? `<h3>${t('exportData')}</h3><p class="muted small">${t('exportHint')}</p><a class="btn" href="/api/export">⬇ ${t('exportData')}</a>` : ''}
    <h3>${t('forgetMe')}</h3>
    <label class="check"><input type="checkbox" id="forget-msgs"> ${t('forgetMeAndMessages')}</label>
    <div><button class="btn danger" data-forget>${t('forgetMe')}</button></div>`;
  body.querySelector('[data-forget]').onclick = safe(async () => {
    if (!(await confirmBox(t('forgetMe') + '?'))) return;
    const r = await api('POST', '/api/me/forget', { messages: body.querySelector('#forget-msgs').checked });
    toast(`${t('deleted')}: ${r.memories} / ${r.messages}`, 'ok');
  });
}

// ------------------------------------------------------------------ agents

const PRESET_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b'];

export function openAgentEditor(agent = null, { readOnly = false } = {}) {
  const a = agent || { name: '', handle: '', avatar: '🤖', color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)], description: '', systemPrompt: '', providerId: S.providers.find((p) => p.type !== 'demo')?.id || S.providers[0]?.id, model: '', tools: S.agentTools, memoryEnabled: true };
  const canEdit = !readOnly && S.user.role !== 'guest' && (!agent || isAdmin() || agent.createdBy === S.user.id);
  const m = modal({
    title: agent ? `${a.avatar} ${a.name}` : t('newAgent'), wide: true,
    body: `<form id="agent-form" class="form"${canEdit ? '' : ' inert'}>
      <div class="row wrap">
        <label class="field" style="width:90px"><span>${t('avatar')}</span><input name="avatar" value="${esc(a.avatar)}" maxlength="4" class="center big"></label>
        <label class="field grow"><span>${t('name')}</span><input name="name" required value="${esc(a.name)}"></label>
        <label class="field"><span>${t('handle')}</span><input name="handle" value="${esc(a.handle)}" placeholder="researcher"></label>
        <label class="field"><span>${t('color')}</span><input name="color" type="color" value="${esc(a.color)}"></label>
      </div>
      <label class="field"><span>${t('description')}</span><input name="description" value="${esc(a.description)}"></label>
      <label class="field"><span>${t('systemPrompt')}</span><textarea name="systemPrompt" rows="7">${esc(a.systemPrompt)}</textarea></label>
      <div class="row wrap">
        <label class="field grow"><span>${t('provider')}</span><select name="providerId"><option value="">—</option>${S.providers.map((p) => `<option value="${p.id}"${p.id === a.providerId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="field grow"><span>${t('model')}</span><input name="model" list="agent-models" value="${esc(a.model || '')}" placeholder="default"><datalist id="agent-models"></datalist></label>
        <label class="field" style="width:110px"><span>${t('temperature')}</span><input name="temperature" type="number" step="0.1" min="0" max="2" value="${a.temperature ?? ''}"></label>
      </div>
      <div class="field"><span>${t('tools')}</span><div class="pick-grid">${S.agentTools.map((x) => `<label class="pick"><input type="checkbox" name="tools" data-multi="1" value="${x}"${a.tools.includes(x) ? ' checked' : ''}> ${t('tool_' + x)}</label>`).join('')}</div></div>
      <label class="check"><input type="checkbox" name="memoryEnabled"${a.memoryEnabled ? ' checked' : ''}> ${t('agentMemory')}</label>
      <div class="field" data-mcp-box><span>🔌 ${t('integrations')}</span><div class="pick-grid muted small">${t('loading')}</div></div>
      <label class="field"><span>${t('starters')}</span><textarea name="startersText" rows="3" placeholder="${t('startersHint')}">${esc((a.starters || []).join('\n'))}</textarea></label>
    </form>`,
    footer: canEdit ? `${agent ? `<button class="btn danger" data-del>${t('delete')}</button>` : ''}<span class="grow"></span>
      ${agent ? `<button class="btn" data-dm>💬 ${t('chatWith')}</button>` : ''}
      <button class="btn ghost" data-cancel>${t('cancel')}</button><button class="btn primary" form="agent-form">${t('save')}</button>`
      : agent ? `<button class="btn" data-dm>💬 ${t('chatWith')}</button>` : '',
  });
  const provSel = m.el.querySelector('[name=providerId]');
  const loadModels = async () => {
    const dl = m.el.querySelector('#agent-models');
    dl.innerHTML = '';
    if (!provSel.value) return;
    try {
      const r = await api('GET', `/api/providers/${provSel.value}/models`);
      dl.innerHTML = r.models.slice(0, 300).map((x) => `<option value="${esc(x)}">`).join('');
    } catch {}
  };
  provSel.onchange = loadModels;
  loadModels();
  api('GET', '/api/mcp/servers').then((servers) => {
    const box = m.el.querySelector('[data-mcp-box] .pick-grid');
    box.classList.remove('muted', 'small');
    box.innerHTML = servers.length ? servers.map((sv) => `<label class="pick"><input type="checkbox" name="mcpServers" data-multi="1" value="${sv.id}"${(a.mcpServers || []).includes(sv.id) ? ' checked' : ''}> ${esc(sv.name)}</label>`).join('') : `<span class="muted small">${t('noIntegrations')}</span>`;
  }).catch(() => {});
  m.el.querySelector('[data-cancel]')?.addEventListener('click', m.close);
  m.el.querySelector('[data-dm]')?.addEventListener('click', safe(async () => {
    const c = await api('POST', '/api/dm', { agentId: agent.id });
    m.close();
    await refreshChannels();
    location.hash = `#/c/${c.id}`;
  }));
  m.el.querySelector('[data-del]')?.addEventListener('click', safe(async () => {
    if (await confirmBox(`${t('delete')} ${agent.name}?`)) { await api('DELETE', `/api/agents/${agent.id}`); m.close(); await refreshAgents(); await refreshChannels(); }
  }));
  m.el.querySelector('#agent-form').onsubmit = safe(async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    f.starters = String(f.startersText || '').split('\n').map((x) => x.trim()).filter(Boolean);
    delete f.startersText;
    if (!f.mcpServers) delete f.mcpServers;
    if (agent) await api('PATCH', `/api/agents/${agent.id}`, f);
    else {
      const created = await api('POST', '/api/agents', f);
      const c = currentChannel();
      if (c?.kind === 'channel') await api('POST', `/api/channels/${c.id}/members`, { type: 'agent', id: created.id }).catch(() => {});
    }
    toast(t('saved'), 'ok');
    m.close();
    await refreshAgents();
    await refreshChannels();
  });
}

export function openTeamTemplates() {
  const taken = new Set(S.agents.map((a) => a.handle));
  const m = modal({
    title: t('addTeam'), wide: true,
    body: `<form id="tpl-form" class="form">
      <div class="field"><span>${t('pickTemplates')}</span><div class="tpl-grid">${S.agentTemplates.map((x) => `<label class="tpl"><input type="checkbox" name="keys" data-multi="1" value="${x.key}"${taken.has(x.handle) ? '' : ' checked'}>
        <span class="avatar agent sm" style="--c:${esc(x.color)}">${esc(x.avatar)}</span><span><strong>${esc(x.name)}</strong><span class="muted small">${esc(x.description)}</span></span></label>`).join('')}</div></div>
      <div class="row"><label class="field grow"><span>${t('provider')}</span><select name="providerId">${S.providers.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field grow"><span>${t('model')}</span><input name="model" placeholder="default"></label></div>
    </form>`,
    footer: `<button class="btn ghost" data-cancel>${t('cancel')}</button><button class="btn primary" form="tpl-form">${t('add')}</button>`,
  });
  m.el.querySelector('[data-cancel]').onclick = m.close;
  m.el.querySelector('#tpl-form').onsubmit = safe(async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const c = currentChannel();
    await api('POST', '/api/agents/from-templates', { ...f, model: f.model || null, channelId: c?.kind === 'channel' ? c.id : undefined });
    m.close();
    await refreshAgents();
    await refreshChannels();
    toast(t('created'), 'ok');
  });
}
