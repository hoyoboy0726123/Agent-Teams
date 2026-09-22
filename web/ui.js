// UI helpers: escaping, API client, modals, toasts, formatting.
import { esc } from './md.js';
import { t } from './i18n.js';

export { esc };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(data?.error || `${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function toast(msg, kind = 'info', ms = 3200) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

export const safe = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, 'error', 5000); } };

// Modal with arbitrary HTML body. Returns { el, close }.
export function modal({ title, body, wide = false, onClose, footer = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="${t('close')}">✕</button></header>
    <div class="modal-body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape' && [...document.querySelectorAll('.modal-backdrop')].pop() === wrap) close(); };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector('[data-close]').onclick = close;
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  setTimeout(() => wrap.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea, select')?.focus(), 30);
  return { el: wrap, close };
}

export function confirmBox(message, { danger = true, ok = t('confirm') } = {}) {
  return new Promise((resolve) => {
    const m = modal({
      title: t('areYouSure'),
      body: `<p>${esc(message)}</p>`,
      footer: `<button class="btn ghost" data-no>${t('cancel')}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button>`,
      onClose: () => resolve(false),
    });
    m.el.querySelector('[data-no]').onclick = () => m.close();
    m.el.querySelector('[data-yes]').onclick = () => { resolve(true); m.el.remove(); };
  });
}

export function promptBox(title, { label = '', value = '', multiline = false, placeholder = '', ok = t('ok') } = {}) {
  return new Promise((resolve) => {
    const field = multiline
      ? `<textarea rows="5" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input value="${esc(value)}" placeholder="${esc(placeholder)}">`;
    const m = modal({
      title,
      body: `<label class="field">${label ? `<span>${esc(label)}</span>` : ''}${field}</label>`,
      footer: `<button class="btn ghost" data-no>${t('cancel')}</button><button class="btn primary" data-yes>${esc(ok)}</button>`,
      onClose: () => resolve(null),
    });
    const input = m.el.querySelector('input, textarea');
    const done = () => { resolve(input.value); m.el.remove(); };
    m.el.querySelector('[data-no]').onclick = () => m.close();
    m.el.querySelector('[data-yes]').onclick = done;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); done(); } });
  });
}

// Read all [name] fields of a container into an object.
export function formData(root) {
  const out = {};
  for (const el of root.querySelectorAll('[name]')) {
    if (el.type === 'checkbox') {
      if (el.dataset.multi) { (out[el.name] ||= []); if (el.checked) out[el.name].push(el.value); }
      else out[el.name] = el.checked;
    } else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value;
  }
  return out;
}

export function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 45) return t('justNow');
  if (d < 3600) return t('minAgo', Math.round(d / 60));
  if (d < 86400) return t('hrAgo', Math.round(d / 3600));
  return new Date(ts).toLocaleDateString();
}
export const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const dayLabel = (ts) => {
  const d = new Date(ts), today = new Date();
  if (d.toDateString() === today.toDateString()) return t('today');
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === y.toDateString()) return t('yesterday');
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};

export const initials = (name) => String(name || '?').trim().slice(0, 1).toUpperCase();
export const fmtNum = (n) => new Intl.NumberFormat().format(n || 0);
