// The English edition of the engine's own text (README「英文版（翻譯層）」).
//
// The story is written in Chinese and stays Chinese inside the engine: the state, the choices and every random draw
// are the same in both languages, so one seed is one life in either. English is put in at the edges:
//   ctx.w(template, vars)   the Chinese template is expanded as always (same draws, same picks); its English, looked
//                           up by the Chinese template as written, is then rendered with the same picks (grammar.js
//                           render) and English values for the variables
//   ctx.f(template, vars)   the same for a template without alternatives (what was a `…${x}…` template literal)
//   text, prompt, label, hint, choice   a plain Chinese string the story shows is looked up as it stands
// The catalog is the bundle the page fetches only in English (public/i18n/story-en.json, built from src/i18n/en/):
//   story  { Chinese template or string: English }
//   words  { Chinese word: English }   jobs, places, relations, pronouns, the slots' defaults ("另一半" → your partner)
//   names  { surnames: { 陳: "Chen" }, chars: { 天: "tien" } }   for romanising names (romanise below)
// A Chinese value with no English is left as it is and listed in `missing`, so a test can say what is still to do.
import { render, fill } from "./grammar.js";

const CJK = /[㐀-鿿豈-﫿]/;
export const hasCJK = t => CJK.test(String(t));

// ---------- English grammar ----------
const PRONOUNS = {
  he: { subj: "he", obj: "him", pos: "his", poss: "his", refl: "himself" },
  she: { subj: "she", obj: "her", pos: "her", poss: "hers", refl: "herself" },
  they: { subj: "they", obj: "them", pos: "their", poss: "theirs", refl: "themselves" },
};
// he / she / they for a person's sex ("male" | "female" | anything else), in a form: subj, obj, pos, poss, refl.
export const pronoun = (sex, form = "subj") => PRONOUNS[sex === "male" ? "he" : sex === "female" ? "she" : "they"][form];
export const capitalize = t => String(t).replace(/^(\W*)(\w)/, (all, lead, c) => lead + c.toUpperCase());
// a / an by sound: an hour, an MRT station, a university, a one-off, a LINE group.
export function article(word) {
  const w = String(word).trim();
  if (/^(?:LINE|URL|USB|UN|UK|US)\b/.test(w)) return "a";
  if (/^[A-Z]{2,}\b/.test(w)) return "AEFHILMNORSX".includes(w[0]) ? "an" : "a";
  if (/^(?:hour|honest|honou?r|heir)/i.test(w)) return "an";
  if (/^(?:uni|use|usu|ura|ure|uro|eu|ewe|one\b|once)/i.test(w)) return "a";
  return /^[aeiou]/i.test(w) ? "an" : "a";
}
export const withArticle = word => `${article(word)} ${word}`;
// plural(3, "child", "children") → "children"; the word alone, as t() does on the page.
export const plural = (n, one, many = `${one}s`) => (Number(n) === 1 ? one : many);
// 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st
export function ordinal(n) {
  const v = Math.abs(Math.trunc(Number(n))), t = v % 100;
  const suffix = t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][v % 10] || "th";
  return `${n}${suffix}`;
}

// {name:filter:arg…} in an English template:
//   cap   capital first letter          a     with a / an (an engineer)       lower  all small letters
//   obj pos poss refl   another form of a pronoun value (he → him, his, his, himself)
//   th    ordinal (3 → 3rd)             s     "s" unless the value is 1
//   {n:child:children}   the first word when n is 1, else the second
const FILTERS = {
  cap: v => capitalize(v), a: v => withArticle(v), lower: v => String(v).toLowerCase(), th: v => ordinal(v),
  s: v => (Number(v) === 1 ? "" : "s"),
};
for (const form of ["obj", "pos", "poss", "refl"]) {
  FILTERS[form] = v => { const p = PRONOUNS[String(v).toLowerCase()]; const out = p ? p[form] : v; return /^[A-Z]/.test(v) ? capitalize(out) : out; };
}
export function applyFilters(value, filters) {
  if (filters.length === 2 && !FILTERS[filters[0]]) return plural(value, filters[0], filters[1]);
  return filters.reduce((v, f) => (FILTERS[f] ? FILTERS[f](v) : v), value);
}

// ---------- names ----------
// Romanised the way Taiwanese passports write names (Wade–Giles without apostrophes or umlauts, the surnames in
// their usual spellings): 李天賜 → Lee Tien-tzu, 志明 → Chih-ming, 阿明 → Ah-ming, 小美 → Hsiao-mei. Null when a
// character is not in the table (a name the player typed with rarer characters), so the caller can fall back.
const PREFIX = { 阿: "Ah", 小: "Hsiao", 老: "Lao" };
export function romanise(zh, names) {
  if (!names) return null;
  const t = String(zh).replace(/\s+/g, ""), chars = [...t];
  if (!chars.length || !chars.every(c => CJK.test(c))) return null;
  const syl = c => (names.chars && names.chars[c]) || (names.surnames && names.surnames[c] && names.surnames[c].toLowerCase()) || null;
  const given = list => { const s = list.map(syl); return s.every(Boolean) && s.length ? capitalize(s.join("-")) : null; };
  if (chars.length === 2 && PREFIX[chars[0]]) { const g = syl(chars[1]); return g ? `${PREFIX[chars[0]]}-${g}` : null; }
  const two = chars.length >= 3 && names.surnames[chars.slice(0, 2).join("")];
  const one = !two && chars.length >= 2 && names.surnames[chars[0]] && (chars.length >= 3 || !(names.chars && names.chars[chars[0]]));
  if (two || one) {
    const g = given(chars.slice(two ? 2 : 1));
    return g ? `${two || names.surnames[chars[0]]} ${g}` : null;
  }
  return given(chars);
}

// ---------- the translator ----------
export function makeLang(bundle) {
  if (!bundle || typeof bundle.story !== "object") throw new Error("English needs its catalog (public/i18n/story-en.json)");
  const story = bundle.story, words = bundle.words || {}, missing = new Set();
  const has = (m, k) => Object.hasOwn(m, k);
  // A value in English: a number or English as it is; Chinese from the words, the story, or as a name.
  function word(v) {
    if (v === undefined || v === null) return v;
    const t = String(v);
    if (!hasCJK(t)) return t;
    if (has(words, t)) return words[t];
    if (has(story, t)) return story[t];
    const name = romanise(t, bundle.names);
    if (name) return name;
    missing.add(t);
    return t;
  }
  const value = vars => spec => {
    const [name, ...filters] = spec.split(":");
    let v = vars[name];
    if (typeof v === "function") v = v();
    if (v === undefined || v === null) return `{${spec}}`;
    return applyFilters(word(v), filters);
  };
  return {
    missing, word,
    // A plain string the story shows: its English, or the Chinese when there is none yet.
    text: t => (t === undefined || t === null ? t : word(t)),
    // ctx.w: `trace` holds the picks of the Chinese expansion, `zh` the Chinese sentence it made.
    w(template, vars, trace, zh) {
      if (!has(story, template)) { missing.add(template); return zh; }
      return render(story[template], trace, value(vars));
    },
    // ctx.f
    f(template, vars) {
      if (!has(story, template)) { missing.add(template); return fill(template, vars); }
      return render(story[template], [], value(vars));
    },
  };
}

// The page fetches the bundle only when English is on, so the Chinese page does not carry it.
export async function loadStoryBundle(url = "/i18n/story-en.json") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`story-en.json: ${res.status}`);
  return res.json();
}
