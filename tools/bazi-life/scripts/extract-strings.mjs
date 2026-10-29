// The Chinese the engine can show, for the English edition (README「英文版（翻譯層）」).
//
//   node scripts/extract-strings.mjs                 writes src/i18n/catalog-zh.json and prints a summary per file
//   node scripts/extract-strings.mjs --list [part]   every Chinese string or template with file:line (files whose
//                                                    path contains `part`); ${}-mixed ones are marked "refactor"
//   node scripts/extract-strings.mjs --mixed [part]  only the template literals that mix Chinese with ${…}
//   node scripts/extract-strings.mjs --todo <part>   the story strings of those files that have no English yet, as
//                                                    JSON to paste into src/i18n/en/<file>.json
//   node scripts/extract-strings.mjs --check         the English catalogs (src/i18n/en/*.json): every story key is a
//                                                    Chinese string in the code, the English keeps its {vars} and the
//                                                    parts of each top-level {a|b}, and no English has Chinese in it
//
// It reads src/sim and src/core with a small JavaScript tokenizer (strings, template literals and their ${…},
// comments, regular expressions), which is enough for this code base: no build step or parser package is needed.
// Each string is classed by where it stands: an argument of ctx.w / ctx.f ("w", "f"), the value of a prompt, label,
// hint, text or topic field, or "other" (ids, field names, comparisons, which are not shown as such). The key of an
// entry is <file>.<hash of the Chinese>, so it stays the same when lines move; the English catalog itself is keyed by
// the Chinese as written, which is what the engine looks up at run time.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative, join, basename } from "node:path";
import { shape } from "../src/sim/lang.js";
import { english } from "./story-bundle.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// Folders, and single files of the page that write reading and result text through core/tr.js.
const DIRS = ["src/sim", "src/core", "src/report.js", "src/life-app.js", "src/hehun-app.js", "src/baby-app.js", "src/pixel-app.js"];
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
const CJK_ANY = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;   // Han, and CJK and full-width punctuation
const SHOWN = new Set(["w", "f", "tr", "trw", "prompt", "label", "hint", "text", "topic"]);
const KEYS = new Set(["prompt", "label", "hint", "text", "topic"]);

// ---------- tokenizer ----------
const REGEX_AFTER_KW = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "instanceof", "yield", "await"]);
const ESC = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" };

export function scan(src) {
  const found = [];
  let i = 0, line = 1;
  // The bracket stack: each frame may carry a call context ("w", "f") or the field name the value belongs to.
  const stack = [{ key: null, call: null }];
  let prev = null, prev2 = null;   // the last two significant tokens: { t: type, v: value }
  const push = tok => { prev2 = prev; prev = tok; };
  const context = () => {
    for (let k = stack.length - 1; k >= 0; k--) { if (stack[k].call) return stack[k].call; if (stack[k].key) return stack[k].key; }
    return "other";
  };
  const cook = (raw) => raw.replace(/\\(u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|\r?\n|.)/g, (all, e, cp, u4, x2) => {
    if (cp) return String.fromCodePoint(parseInt(cp, 16));
    if (u4) return String.fromCharCode(parseInt(u4, 16));
    if (x2) return String.fromCharCode(parseInt(x2, 16));
    if (e === "\n" || e === "\r\n") return "";
    return ESC[e] ?? e;
  });
  // Chinese strings, and templates of ctx.w / ctx.f without Chinese ("{lead}{ask}"), which have English too.
  const record = (value, at, mixed, kind) => {
    const use = context();
    if (CJK.test(value) || ((use === "w" || use === "f" || use === "tr") && /\{\w+\}/.test(value))) found.push({ value, line: at, mixed, use, kind });
  };

  function quoted(q) {
    const start = i, at = line;
    i++;
    while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; else if (src[i] === "\n") line++; i++; }
    const raw = src.slice(start + 1, i);
    i++;
    record(cook(raw), at, false, "string");
    push({ t: "str" });
  }
  function template() {
    const at = line;
    let text = "", mixed = false;
    i++;
    let chunk = "";
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") { chunk += src[i] + src[i + 1]; if (src[i + 1] === "\n") line++; i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") {
        text += cook(chunk); chunk = "";
        i += 2;
        const from = i;
        stack.push({ key: null, call: null, tpl: true });
        code(true);
        stack.pop();
        text += "${" + src.slice(from, i).trim() + "}";
        mixed = true;
        i++;   // the closing }
        continue;
      }
      if (src[i] === "\n") line++;
      chunk += src[i++];
    }
    text += cook(chunk);
    i++;
    record(text, at, mixed, "template");
    push({ t: "str" });
  }
  function regex() {
    i++;
    let cls = false;
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "[") cls = true; else if (c === "]") cls = false;
      else if (c === "/" && !cls) break;
      else if (c === "\n") break;
      i++;
    }
    i++;
    while (/[a-z]/i.test(src[i] || "")) i++;
    push({ t: "regex" });
  }
  const regexAllowed = () => !prev || (prev.t === "punct" && !")]}".includes(prev.v)) || (prev.t === "ident" && REGEX_AFTER_KW.has(prev.v));

  // Reads code until the end, or (inside ${…}) until the } that closes it.
  function code(inTemplate) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i], d = src[i + 1];
      if (c === "\n") { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === "/" && d === "*") { const end = src.indexOf("*/", i + 2); const stop = end < 0 ? src.length : end + 2; for (let k = i; k < stop; k++) if (src[k] === "\n") line++; i = stop; continue; }
      if (c === '"' || c === "'") { quoted(c); continue; }
      if (c === "`") { template(); continue; }
      if (c === "/" && regexAllowed()) { regex(); continue; }
      if (/[A-Za-z_$À-￿]/.test(c)) {
        let j = i; while (j < src.length && /[\w$À-￿]/.test(src[j])) j++;
        push({ t: "ident", v: src.slice(i, j) }); i = j; continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(d))) {
        let j = i + 1; while (j < src.length && /[\w.]/.test(src[j])) j++;
        push({ t: "num" }); i = j; continue;
      }
      // punctuation
      if (c === "(" || c === "[" || c === "{") {
        // ctx.w( … ) and ctx.f( … ): a call whose strings are templates
        // and tr( … ) / trw( … ) of the readings (core/tr.js), called as plain functions
        const call = c === "(" && prev && prev.t === "ident" && ((prev.v === "w" || prev.v === "f") && prev2 && prev2.t === "punct" && prev2.v === "." || (prev.v === "tr" || prev.v === "trw") && !(prev2 && prev2.t === "punct" && prev2.v === ".")) ? prev.v : null;
        stack.push({ key: null, call });
        if (c === "{") depth++;
        push({ t: "punct", v: c }); i++; continue;
      }
      if (c === ")" || c === "]" || c === "}") {
        if (c === "}" && inTemplate && depth === 0) return;
        if (c === "}") depth--;
        if (stack.length > 1) stack.pop();
        push({ t: "punct", v: c }); i++; continue;
      }
      if (c === ":" && prev && prev.t === "ident" && KEYS.has(prev.v) && !(prev2 && prev2.t === "punct" && prev2.v === "?")) {
        stack[stack.length - 1].key = prev.v;
        push({ t: "punct", v: c }); i++; continue;
      }
      if (c === ",") { stack[stack.length - 1].key = null; push({ t: "punct", v: c }); i++; continue; }
      if (c === "=" && d === ">") { push({ t: "punct", v: "=>" }); i += 2; continue; }
      push({ t: "punct", v: c }); i++;
    }
  }
  code(false);
  return found;
}

// ---------- the catalog ----------
export function fnv(text) {
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) { h ^= text.charCodeAt(k); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function files() {
  const out = [];
  const walk = async dir => {
    for (const e of await readdir(join(ROOT, dir), { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(".js")) out.push(p);
    }
  };
  for (const d of DIRS) { if (d.endsWith(".js")) out.push(d); else await walk(d); }
  return out.sort();
}

// English may keep a Chinese term in brackets after its English, the way the readings explain terms: "your Day Master
// (日主)". Bracketed Chinese of up to 12 characters is allowed; any other Chinese in the English is a problem.
const bare = text => String(text).replace(/\(([\u3400-\u9fff\uf900-\ufaff、]{1,12})\)/g, "");

export async function extract() {
  const entries = {}, perFile = {};
  for (const file of await files()) {
    const src = await readFile(join(ROOT, file), "utf8");
    const base = basename(file, ".js");
    const stats = perFile[file] = { strings: 0, shown: 0, mixed: 0, chars: 0 };
    for (const f of scan(src)) {
      const key = `${base}.${fnv(f.value)}`;
      stats.strings++; stats.chars += (f.value.match(/[㐀-鿿]/g) || []).length;
      if (SHOWN.has(f.use)) stats.shown++;
      if (f.mixed) stats.mixed++;
      const at = `${file}:${f.line}`;
      if (entries[key]) { entries[key].at.push(at); if (SHOWN.has(f.use) && !SHOWN.has(entries[key].use)) entries[key].use = f.use; continue; }
      entries[key] = { zh: f.value, at: [at], use: f.use, ...(f.mixed ? { mixed: true } : {}), ...(f.kind === "template" && !f.mixed ? { literal: true } : {}) };
    }
  }
  return { entries, perFile };
}

// Problems with the English: { key, file, problem }.
export function check(zhStrings, en) {
  const problems = [];
  const sameList = (a, b) => a.length === b.length && a.every((x, k) => x === b[k]);
  for (const [zh, text] of Object.entries(en.story)) {
    const where = en.from[zh];
    if (!zhStrings.has(zh)) problems.push({ where, zh, problem: "no such Chinese string in the scanned code (changed or removed?)" });
    if (typeof text !== "string" || !text.trim()) { problems.push({ where, zh, problem: "empty English" }); continue; }
    if (CJK_ANY.test(bare(text))) problems.push({ where, zh, problem: `Chinese left in the English: ${text}` });
    const a = shape(zh), b = shape(text);
    if (!sameList(a.vars, b.vars)) problems.push({ where, zh, problem: `{vars} differ: ${a.vars.join(",") || "none"} vs ${b.vars.join(",") || "none"}` });
    if (!sameList(a.alts, b.alts)) problems.push({ where, zh, problem: `top-level {a|b} parts differ: [${a.alts}] vs [${b.alts}]` });
    else for (let g = 0; g < a.byPart.length; g++) for (let p = 0; p < a.byPart[g].length; p++) {
      for (const lazy of ["friend", "trip"]) if (a.byPart[g][p].includes(lazy) !== b.byPart[g][p].includes(lazy)) problems.push({ where, zh, problem: `{${lazy}} must be in the same part of group ${g + 1} (part ${p + 1})` });
    }
    if ((text.match(/\{/g) || []).length !== (text.match(/\}/g) || []).length) problems.push({ where, zh, problem: "unbalanced braces" });
  }
  for (const [zh, text] of Object.entries(en.words)) if (CJK_ANY.test(text)) problems.push({ where: "words", zh, problem: `Chinese left in the English: ${text}` });
  return problems;
}

// ---------- command line ----------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2), flag = f => args.includes(f), after = f => { const k = args.indexOf(f); return k >= 0 ? args[k + 1] || "" : null; };
  const { entries, perFile } = await extract();
  const en = await english();
  const all = Object.values(entries);
  if (flag("--check")) {
    const problems = check(new Set(all.map(e => e.zh)), en);
    for (const p of problems) console.log(`${p.where}: ${JSON.stringify(p.zh).slice(0, 80)}\n    ${p.problem}`);
    console.log(problems.length ? `${problems.length} problem(s)` : `ok: ${Object.keys(en.story).length} story strings, ${Object.keys(en.words).length} words`);
    process.exit(problems.length ? 1 : 0);
  }
  const part = after("--list") ?? after("--mixed") ?? after("--todo");
  if (part !== null) {
    const pick = all.filter(e => !part || e.at.some(a => a.includes(part)));
    if (flag("--todo")) {
      // "maybe": strings outside a shown field (picked into a label later, or only compared against); translate the
      // ones the reader sees and drop the rest.
      const todo = {}, maybe = {};
      for (const e of pick) if (!e.mixed && !Object.hasOwn(en.story, e.zh) && !Object.hasOwn(en.words, e.zh)) (SHOWN.has(e.use) ? todo : maybe)[e.zh] = "";
      console.log(JSON.stringify({ story: todo, maybe }, null, 2));
    } else {
      for (const e of pick) {
        if (flag("--mixed") && !e.mixed) continue;
        const done = Object.hasOwn(en.story, e.zh) ? "en" : "  ";
        console.log(`${e.at[0]}${e.at.length > 1 ? ` (+${e.at.length - 1})` : ""}\t${e.use}${e.mixed ? "\trefactor" : ""}\t${done}\t${e.zh}`);
      }
    }
    process.exit(0);
  }
  // One object per file: { strings, shown, mixed, chars, entries: { hash: [Chinese, use, [lines], "mixed"?] } }. The
  // stable key of an entry is <file>#<hash>, e.g. sim/story/era.js#1a2b3c4d.
  const byFile = {};
  for (const [key, e] of Object.entries(entries)) {
    const file = e.at[0].replace(/:\d+$/, "").replace(/^src\//, ""), hash = key.split(".").pop();
    const lines = e.at.filter(a => a.replace(/:\d+$/, "").replace(/^src\//, "") === file).map(a => Number(a.split(":").pop()));
    (byFile[file] ||= {})[hash] = [e.zh, e.use, lines, ...(e.mixed ? ["mixed"] : [])];
  }
  const catalog = {
    _: "Generated by scripts/extract-strings.mjs; do not edit. Every Chinese string and template in src/sim and src/core, by file: entries[hash] = [Chinese, use, lines, \"mixed\"?], and the stable key of an entry is <file>#<hash of the Chinese> (it stays when lines move). use: where it stands (w / f: a ctx.w or ctx.f template; prompt, label, hint, text, topic: that field; other: ids, field names, comparisons, or a string picked into a field later). mixed: a template literal with ${…} that must become a {var} template before it can be translated. The English is in src/i18n/en/, keyed by the Chinese itself.",
    files: Object.fromEntries(Object.entries(perFile).filter(([, st]) => st.strings).map(([f, st]) => {
      const name = f.replace(/^src\//, "");
      const list = Object.entries(byFile[name] || {}).sort(([, a], [, b]) => a[2][0] - b[2][0]);
      return [name, { ...st, entries: Object.fromEntries(list) }];
    })),
  };
  const text = JSON.stringify(catalog).replace(/\],"(?=[0-9a-f]{8}":)/g, '],\n"').replace(/\}\},"(?=sim\/|core\/)/g, '}},\n"');
  await writeFile(join(ROOT, "src/i18n/catalog-zh.json"), text + "\n");
  const enSet = new Set(Object.keys(en.story));
  console.log("file\tstrings\tshown\tmixed\tCJK chars\tEnglish");
  let tot = { strings: 0, shown: 0, mixed: 0, chars: 0, en: 0 };
  for (const [file, s] of Object.entries(perFile)) {
    if (!s.strings) continue;
    const done = all.filter(e => e.at.some(a => a.startsWith(file + ":")) && enSet.has(e.zh)).length;
    console.log(`${relative(ROOT, join(ROOT, file))}\t${s.strings}\t${s.shown}\t${s.mixed}\t${s.chars}\t${done}`);
    for (const k of Object.keys(tot)) tot[k] += k === "en" ? done : s[k];
  }
  console.log(`total\t${tot.strings}\t${tot.shown}\t${tot.mixed}\t${tot.chars}\t${tot.en}`);
  console.log(`wrote src/i18n/catalog-zh.json: ${Object.keys(entries).length} distinct strings`);
}
