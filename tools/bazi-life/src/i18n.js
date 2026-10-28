// 中／英切換 for the page's own words. The source of truth stays the Traditional-Chinese markup; EN (i18n/en.json) maps
// each piece of it to English, and PATTERNS cover the few shapes the apps fill with numbers ("30 歲"). applyLang() walks
// the page and swaps text nodes and a few attributes whose Chinese it knows, remembering the Chinese so it can swap back;
// while English is on, a MutationObserver does the same for whatever the apps write later. Containers the engine fills
// with the story and the readings carry data-no-i18n and are left alone: that text stays Chinese for now, and the page
// says so in English mode. Strings an app builds itself go through t() and are redrawn on the "langchange" event.
import EN from "./i18n/en.json";

export const LANG_KEY = "bazi-life.lang";
const LANGS = ["zh", "en"];
let current = "zh";

const GOD = { 比肩: "Companion", 劫財: "Rob Wealth", 食神: "Eating God", 傷官: "Hurting Officer", 正財: "Direct Wealth", 偏財: "Indirect Wealth", 正官: "Direct Officer", 七殺: "Seven Killings", 正印: "Direct Resource", 偏印: "Indirect Resource" };
const PATTERNS = [
  [/^(\d+) 歲$/, m => `Age ${m[1]}`],
  [/^(\d{4}) 年$/, m => m[1]],
  [/^這一次，你活到 (\d+) 歲。$/, m => `This time, you lived to ${m[1]}.`],
  [/^(\d+) 歲（(\d{4}) 年）$/, m => `Age ${m[1]} (${m[2]})`],
  [/^(\d+) 次$/, m => `${m[1]} time${m[1] === "1" ? "" : "s"}`],
  [/^(\d+) 個孩子$/, m => `${m[1]} child${m[1] === "1" ? "" : "ren"}`],
  [/^(\d+) 次婚姻(?:，離婚 (\d+) 次)?$/, m => `Married ${m[1]} time${m[1] === "1" ? "" : "s"}${m[2] ? `, divorced ${m[2]}` : ""}`],
  [/^退休（最後是(.+)）$/, m => `Retired (last job: ${m[1]})`],
  [/^今天 ([\d,]+) 段人生$/, m => `${m[1]} lives today`],
  [/^臺北 (\d\d:\d\d)$/, m => `Taipei ${m[1]}`],
  [/^(\S{2})・(\S{2})$/, m => (GOD[m[1]] && GOD[m[2]] ? `${GOD[m[1]]} · ${GOD[m[2]]}` : null)],
];
function english(zh) {
  if (Object.hasOwn(EN, zh)) return EN[zh];
  for (const [re, fn] of PATTERNS) { const m = zh.match(re); if (m) { const s = fn(m); if (s) return s; } }
  return null;
}

// The language to start in: the one chosen before in this browser, else Chinese. (Not the browser's language: the
// story and the readings are Chinese either way, so English is something a visitor asks for.)
export function initLang() {
  let saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch {}
  current = LANGS.includes(saved) ? saved : "zh";
  return current;
}
export const lang = () => current;
export function setLang(l) {
  if (!LANGS.includes(l) || l === current) return;
  current = l;
  try { localStorage.setItem(LANG_KEY, l); } catch {}
  applyLang();
  document.dispatchEvent(new CustomEvent("langchange", { detail: l }));
}

// t("{n} 歲", { n: 30 }): the English with the values filled in, or the Chinese itself in Chinese mode or when there is
// no English for it.
export function t(zh, vars) {
  let s = current === "en" && Object.hasOwn(EN, zh) ? EN[zh] : zh;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP = new Set(["script", "style", "canvas", "noscript"]);
const skipped = el => SKIP.has(el.localName) || el.hasAttribute("data-no-i18n");
// node (or element + attribute) → { zh: the Chinese it had, out: what we wrote }. When the app has written something
// else since, that new text is the Chinese to start from.
const memo = new WeakMap();
function swap(node, attr) {
  const now = attr ? node.getAttribute(attr) : node.nodeValue;
  if (now == null) return;
  let store = memo.get(node);
  const key = attr || "#text", seen = store && store[key];
  const zh = seen && seen.out === now ? seen.zh : now;
  const trimmed = zh.trim();
  if (!trimmed || !/[\u3400-\u9fff]/.test(trimmed)) return;
  const en = current === "en" ? english(trimmed) : null;
  const value = en == null ? zh : zh.replace(trimmed, en);
  if (!store) { store = {}; memo.set(node, store); }
  store[key] = { zh, out: value };
  if (value === now) return;
  if (attr) node.setAttribute(attr, value); else node.nodeValue = value;
}
function walk(node) {
  if (node.nodeType === 3) return swap(node);
  if (node.nodeType !== 1 || skipped(node)) return;
  for (const a of ATTRS) if (node.hasAttribute(a)) swap(node, a);
  for (const c of node.childNodes) walk(c);
}
const inSkipped = node => { const el = node.nodeType === 1 ? node : node.parentElement; return !el || !!el.closest("[data-no-i18n], script, style"); };

let observer = null;
function observe(on) {
  if (!observer) observer = new MutationObserver(list => {
    observer.disconnect();
    for (const m of list) {
      if (m.type === "childList") { for (const n of m.addedNodes) if (!inSkipped(n)) walk(n); }
      else if (!inSkipped(m.target)) swap(m.target, m.type === "attributes" ? m.attributeName : undefined);
    }
    observe(current === "en");
  });
  observer.disconnect();
  if (on) observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// Swaps everything on the page to the current language. Safe to call again after the page changes.
export function applyLang(root = document.body) {
  const en = current === "en";
  if (observer) observer.disconnect();
  walk(root);
  document.documentElement.lang = en ? "en" : "zh-Hant-TW";
  const title = document.querySelector("title");
  if (title) { const s = memo.get(title) || { zh: title.textContent }; memo.set(title, s); title.textContent = en ? english(s.zh.trim()) || s.zh : s.zh; }
  for (const n of document.querySelectorAll(".en-note")) n.hidden = !en;
  const b = document.getElementById("lang-toggle");
  if (b) { b.textContent = en ? "中文" : "EN"; b.setAttribute("aria-label", en ? "切換到中文" : "Switch to English"); b.lang = en ? "zh-Hant" : "en"; }
  observe(en);
}
export function initI18n() {
  initLang();
  const b = document.getElementById("lang-toggle");
  if (b) b.addEventListener("click", () => setLang(current === "en" ? "zh" : "en"));
  applyLang();
}
