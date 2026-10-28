// 姓名學：康熙筆畫、五格、81 數理、三才、字的五行，以及名字對模擬的小小影響。
//
// The name is a small coefficient: at most ±5 % (in odds) per domain, it only tilts tendencies, and it never
// touches death or serious illness (研究三). Where a character's stroke count is disputed, every reading is
// computed, and the page says how many of the readings come out 吉.
import { BY_STROKES, ALTERNATIVES, FORM_ELEMENT, SHULI_SHUNSHI, SANCAI } from "./name-data.js";
import { tr, trw, trJoin, readingLang } from "./tr.js";

const STROKES = new Map();
for (const [n, chars] of Object.entries(BY_STROKES)) for (const ch of chars) STROKES.set(ch, Number(n));
const FORM = new Map();
for (const [el, chars] of Object.entries(FORM_ELEMENT)) for (const ch of chars) FORM.set(ch, el);

export const COMPOUND_SURNAMES = ["歐陽", "司馬", "上官", "諸葛", "東方", "皇甫", "尉遲", "公孫", "慕容", "長孫", "宇文", "司徒", "夏侯", "令狐", "端木", "張簡", "范姜", "鍾離", "西門", "南宮", "軒轅", "左丘", "呼延", "澹臺", "東郭", "百里", "第五", "萬俟"];
const ELEMENTS = "木火土金水";
export const numberElement = n => "水木木火火土土金金水"[n % 10];

// The 81-number table as commonly published in Taiwan (熊崎氏), three levels, compiled for this project:
// G 吉, H 半吉, X 凶.
const SHULI_COMMON = "GXGXGGGGXX" + "GXGXGGGGXX" + "GXGGGXHXGH" + "GGGXGXGHGX" + "GXXXGXGGHH" + "HGHXHXGHXX" + "GXGXGXGGXX" + "HXHXHXHHXXG";
const THREE = { G: 1, H: 0, X: -1 };
const fromFive = d => (d >= 3 ? 1 : d === 2 ? 0 : -1);   // 大吉/吉 → 吉, 半吉, 凶/大凶 → 凶
// The levels as the code compares them (and as the Chinese page shows them).
export const LEVEL_ZH = { 1: "吉", 0: "半吉", "-1": "凶" };
// The levels as the page shows them: the Chinese, or their English when the readings are English (core/tr.js).
export const LEVEL_NAME = { get 1() { return trw("吉"); }, get 0() { return trw("半吉"); }, get "-1"() { return trw("凶"); } };

// Both tables agree → that level; they differ → 半吉 (研究三: numbers one level apart count as 半吉).
export function shuli(n) {
  const k = ((n - 1) % 80) + 1;
  const a = THREE[SHULI_COMMON[k - 1]], b = fromFive(Number(SHULI_SHUNSHI[k - 1]));
  return { number: n, level: a === b ? a : 0, agree: a === b, tables: [LEVEL_ZH[a], LEVEL_ZH[b]] };
}

const SANCAI_NAMES = ["大凶", "凶", "半吉", "吉", "大吉"];
export function sancai(tian, ren, di) {
  const e = [tian, ren, di].map(numberElement);
  const code = Number(SANCAI[ELEMENTS.indexOf(e[0]) * 25 + ELEMENTS.indexOf(e[1]) * 5 + ELEMENTS.indexOf(e[2])]);
  return { elements: e.join(""), level: code - 2, name: SANCAI_NAMES[code] };
}

export function strokesOf(ch) {
  const primary = STROKES.get(ch);
  if (primary === undefined) return null;
  return { primary, all: [primary, ...(ALTERNATIVES[ch] || [])] };
}

export function splitName(full) {
  const name = [...String(full).replace(/\s+/g, "")];
  if (name.length >= 3 && COMPOUND_SURNAMES.includes(name[0] + name[1])) return { surname: name.slice(0, 2), given: name.slice(2) };
  return { surname: name.slice(0, 1), given: name.slice(1) };
}

// 五格 from stroke counts (研究三):
//   天格 single surname S1 + 1, compound S1 + S2        人格 last surname character + first given character
//   地格 single given name G1 + 1, otherwise their sum  外格 (compound ? S1 : 1) + (two or more given ? last : 1)
//   總格 every character, no 假一; over 81 counts on from 1 (minus 80)
export function fiveGrids(s, g) {
  const sum = a => a.reduce((x, y) => x + y, 0);
  const tian = s.length > 1 ? s[0] + s[1] : s[0] + 1;
  const ren = s[s.length - 1] + g[0];
  const di = g.length > 1 ? sum(g) : g[0] + 1;
  const wai = (s.length > 1 ? s[0] : 1) + (g.length > 1 ? g[g.length - 1] : 1);
  let zong = sum(s) + sum(g);
  while (zong > 81) zong -= 80;
  return { 天格: tian, 人格: ren, 地格: di, 外格: wai, 總格: zong };
}

// Every combination of disputed readings, at most 16.
function combinations(lists) {
  let out = [[]];
  for (const list of lists) out = out.flatMap(prefix => list.map(n => [...prefix, n])).slice(0, 16);
  return out;
}

const GRID_ROLES = {
  天格: "祖先運，多數流派不論吉凶",
  人格: "主運，影響性格、事業與感情",
  地格: "前運，影響 36 歲以前的學業與家庭",
  外格: "副運，影響人際與外在機會",
  總格: "後運，影響 36 歲以後的財富與晚年",
};

export function analyseName(full, analysis = null) {
  const { surname, given } = splitName(full);
  if (!surname.length || !given.length) return { error: tr("請輸入姓和名。") };
  const chars = [...surname, ...given].map(ch => ({ ch, strokes: strokesOf(ch), form: FORM.get(ch) || null }));
  const missing = chars.filter(c => !c.strokes).map(c => c.ch);
  if (missing.length) return { error: trAs("查不到「{chars}」的康熙筆畫。", {}, { chars: trJoin(missing) }), missing };
  for (const c of chars) c.number = numberElement(c.strokes.primary);

  const s = chars.slice(0, surname.length), g = chars.slice(surname.length);
  const primary = fiveGrids(s.map(c => c.strokes.primary), g.map(c => c.strokes.primary));
  const variants = combinations(chars.map(c => c.strokes.all)).map(list => fiveGrids(list.slice(0, s.length), list.slice(s.length)));
  const grids = Object.fromEntries(Object.entries(primary).map(([k, v]) => {
    const levels = variants.map(x => shuli(x[k]).level);
    return [k, { value: v, element: numberElement(v), ...shuli(v), role: GRID_ROLES[k], readings: variants.length, good: levels.filter(l => l > 0).length, mean: levels.reduce((a, b) => a + b, 0) / levels.length }];
  }));
  const sc = sancai(primary.天格, primary.人格, primary.地格);
  const out = { full: [...surname, ...given].join(""), surname: surname.join(""), given: given.join(""), chars, grids, sancai: sc, disputed: chars.filter(c => c.strokes.all.length > 1).map(c => c.ch) };
  out.supplement = analysis ? supplement(g, analysis) : null;
  out.effects = effects(out, analysis);
  return out;
}

// 名字補八字: the given name's 數理五行 against the chart's useful and avoided elements.
function supplement(given, analysis) {
  const useful = given.filter(c => analysis.useful.includes(c.number)).map(c => c.ch);
  const avoid = given.filter(c => analysis.avoid.includes(c.number)).map(c => c.ch);
  return { useful, avoid, score: (useful.length - avoid.length) / given.length };
}

const CAP = 0.05;
// ln-odds tilts per domain, split by life stage: { young: {...}, old: {...} } with { good, bad } per domain.
function effects(n, analysis) {
  const add = (o, domain, x) => { o[domain] = (o[domain] || 0) + x; };
  const young = {}, old = {};
  const g = n.grids;
  for (const d of ["career", "love", "wealth"]) { add(young, d, 0.04 * g.人格.mean); add(old, d, 0.04 * g.人格.mean); }
  for (const d of ["study", "family", "love"]) add(young, d, 0.03 * g.地格.mean);
  for (const d of ["wealth", "career", "family"]) add(old, d, 0.03 * g.總格.mean);
  for (const d of ["love", "move"]) { add(young, d, 0.02 * g.外格.mean); add(old, d, 0.02 * g.外格.mean); }
  for (const d of ["health", "family"]) { add(young, d, 0.02 * n.sancai.level / 2); add(old, d, 0.02 * n.sancai.level / 2); }
  if (n.supplement) for (const d of ["career", "wealth", "love", "health", "study", "family", "move"]) { add(young, d, 0.02 * n.supplement.score); add(old, d, 0.02 * n.supplement.score); }
  const cap = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.max(-CAP, Math.min(CAP, v))]));
  return { young: cap(young), old: cap(old), split: 36 };
}

// The tilt for one event: good events up and bad events down by the same amount; change events untouched.
export function nameTilt(effects, age, domain, channel) {
  if (!effects || channel === "change") return 0;
  const v = (age < effects.split ? effects.young : effects.old)[domain] || 0;
  return channel === "good" ? v : -v;
}

// Plain-language summary of what the name does, as percentages of odds.
const DOMAIN_LINE = { career: "事業好事 {pct}", wealth: "財富好事 {pct}", love: "感情好事 {pct}", health: "健康好事 {pct}", study: "學業好事 {pct}", family: "家庭好事 {pct}", move: "遷移好事 {pct}" };
export function describeEffects(effects) {
  const pct = v => `${v > 0 ? "+" : "−"}${Math.abs(Math.round((Math.exp(v) - 1) * 100))}%`;
  const lines = [];
  for (const [label, part] of [["36 歲以前", effects.young], ["36 歲以後", effects.old]]) {
    const items = Object.entries(part).filter(([, v]) => Math.abs(v) >= 0.005).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([k, v]) => tr(DOMAIN_LINE[k], { pct: pct(v) }));
    if (items.length) lines.push(readingLang() === "en" ? `${tr(label)}: ${trJoin(items)}` : `${label}：${items.join("、")}`);
  }
  return lines;
}

// ---------- the English page ----------
const HAN = /[\u3400-\u9fff\uf900-\ufaff]/;
// tr() with some values put in as they stand (a name, its characters): in English the translator would otherwise look
// them up as words. In Chinese it is tr() itself, so the Chinese is what it always was.
export function trAs(template, vars, raw) {
  if (readingLang() !== "en") return tr(template, { ...vars, ...raw });
  const keys = Object.keys(raw), mark = i => `\u0001${i}\u0001`;
  let out = tr(template, { ...vars, ...Object.fromEntries(keys.map((k, i) => [k, mark(i)])) });
  keys.forEach((k, i) => { out = out.split(mark(i)).join(raw[k]); });
  return out;
}
// A name as the English page shows it: the characters with their romanisation, 陳怡君 (Chen Yi-chun), and each
// character with its syllable, 怡 (Yi). In Chinese, and where the romaniser does not know a character, the characters
// alone (a rare character has no romanisation; the analysis works on the characters either way).
export function shownName(full) {
  const plain = { name: full, char: ch => ch };
  if (readingLang() !== "en") return plain;
  const r = trw(full);
  if (!r || r === full || HAN.test(r)) return plain;
  const { surname, given } = splitName(full), cap = t => t.charAt(0).toUpperCase() + t.slice(1), syl = {};
  const [sur, giv] = r.includes(" ") ? r.split(/ (.*)/s) : [null, r];
  const tokens = giv.split("-");
  const own = sur ? given : [...surname, ...given];
  if (tokens.length === own.length) own.forEach((ch, i) => { syl[ch] ||= cap(tokens[i]); });
  if (sur && surname.length === 1) syl[surname[0]] ||= sur;
  return { name: `${full} (${r})`, char: ch => (syl[ch] ? `${ch} (${syl[ch]})` : ch) };
}
