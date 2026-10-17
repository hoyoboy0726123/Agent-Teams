// 自己寫的決定送出前，先拿掉玩家打的名字。Kept apart from interpret.js, which the Worker imports, so the Worker does
// not carry the name tables.
import { callName } from "./words.js";

// The names the player typed (their own and the family's), each with the word that stands in for it before a written
// choice leaves the phone: 王小美 and 小美 → 伴侶, 哥哥志明 → 哥哥, your own name → 你. Longest first, so a full name
// goes before its given name. A one-character name is left alone: it would hit ordinary words.
export function nameSwaps({ name = "", members = [] } = {}) {
  const swaps = new Map();
  const add = (raw, word, withWord) => {
    const full = String(raw || "").replace(/\s+/g, "");
    if (full.length < 2) return;
    const call = callName(full);
    for (const n of [...(withWord ? [word + full, word + call] : []), full, call]) if (n.length >= 2 && !swaps.has(n)) swaps.set(n, word);
  };
  add(name, "你", false);
  for (const m of members) if (m && m.label) add(m.name, m.label, true);
  return [...swaps].sort((a, b) => b[0].length - a[0].length);
}

// A written choice with those names swapped out of every text it carries: the question, the context, the buttons and
// the sentence itself.
export function withoutNames(payload, swaps) {
  if (!swaps.length) return payload;
  const fix = s => (typeof s === "string" ? swaps.reduce((t, [from, to]) => t.split(from).join(to), s) : s);
  return {
    ...payload,
    situation: fix(payload.situation), context: fix(payload.context), text: fix(payload.text),
    options: Array.isArray(payload.options) ? payload.options.map(o => ({ ...o, label: fix(o.label) })) : payload.options,
  };
}
