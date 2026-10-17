// 填到一半的表單：重新整理網頁也不會不見。
// The values live in sessionStorage: they stay through a reload of this tab and are gone when the tab is closed.
// Nothing is sent anywhere. Where storage is blocked (some private windows, a sandboxed preview) nothing is kept.

export function draftStore(key) {
  return {
    load() { try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
    save(data) { try { sessionStorage.setItem(key, JSON.stringify(data)); } catch { /* storage blocked or full */ } },
    clear() { try { sessionStorage.removeItem(key); } catch { /* storage blocked */ } },
  };
}

// The values of fields by id: inputs and selects keep their value, checkboxes and radios whether checked, <details>
// whether open.
export function readIds(ids) {
  const out = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    out[id] = el.tagName === "DETAILS" ? el.open : el.type === "checkbox" || el.type === "radio" ? el.checked : el.value;
  }
  return out;
}

// Puts saved values back. A select keeps its value only when that option still exists.
export function writeIds(values) {
  for (const [id, v] of Object.entries(values || {})) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.tagName === "DETAILS") el.open = !!v;
    else if (el.type === "checkbox" || el.type === "radio") el.checked = !!v;
    else if (typeof v === "string" && (el.tagName !== "SELECT" || [...el.options].some(o => o.value === v))) el.value = v;
  }
}

// Calls fn once typing stops for a moment; flush() runs it right away (before the page goes away).
export function later(fn, ms = 300) {
  let timer = null;
  const run = () => { clearTimeout(timer); timer = null; fn(); };
  const soon = () => { clearTimeout(timer); timer = setTimeout(run, ms); };
  soon.flush = () => { if (timer) run(); };
  return soon;
}
