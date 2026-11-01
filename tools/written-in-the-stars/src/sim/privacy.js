// Before a written decision leaves the browser, the names the player typed are taken out. Kept apart from
// interpret.js, which the Worker imports, so the Worker does not carry this.
import { callName } from "./words.js";

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The names the player typed (their own and the family's), each with the word that stands in for it: "Jane Doe" and
// "Jane" → "you", "my brother Mike" and "Mike" → "my brother", a partner's name → "my partner". Longest first, so a
// full name goes before its first name. A name shorter than two letters is left alone: it would hit ordinary words.
//   members: [{ name, label }], label being how the player would say it ("my dad", "my sister", "my partner")
export function nameSwaps({ name = "", members = [] } = {}) {
  const swaps = new Map();
  const add = (raw, word) => {
    const full = String(raw || "").trim().replace(/\s+/g, " ");
    if (full.length < 2) return;
    const first = callName(full);
    for (const n of [full, first]) if (n.length >= 2 && !swaps.has(n.toLowerCase())) swaps.set(n.toLowerCase(), [n, word]);
  };
  add(name, "you");
  for (const m of members) if (m && m.label) add(m.name, m.label);
  return [...swaps.values()].sort((a, b) => b[0].length - a[0].length);
}

// One text with the names swapped, as whole words and in any case: "Jane's" becomes "your", and "Mike's" becomes "my
// brother's"; a label already in front of the name ("my brother Mike") is not doubled.
export function swapNames(text, swaps) {
  if (typeof text !== "string" || !swaps.length) return text;
  let out = text;
  for (const [from, to] of swaps) {
    const label = to === "you" ? null : escape(to);
    const re = new RegExp(`${label ? `(?:\\b${label}\\s+)?` : ""}\\b${escape(from)}\\b('s)?`, "gi");
    out = out.replace(re, (_, poss) => (poss ? (to === "you" ? "your" : `${to}'s`) : to));
  }
  return out;
}

// A written choice with those names swapped out of every text it carries: the question, the context, the buttons and
// the sentence itself.
export function withoutNames(payload, swaps) {
  if (!swaps.length) return payload;
  const fix = s => swapNames(s, swaps);
  return {
    ...payload,
    situation: fix(payload.situation), context: fix(payload.context), text: fix(payload.text),
    options: Array.isArray(payload.options) ? payload.options.map(o => ({ ...o, label: fix(o.label), ...(o.hint ? { hint: fix(o.hint) } : {}) })) : payload.options,
  };
}
