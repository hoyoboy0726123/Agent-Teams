// 家人合盤：爸爸、媽媽、兄弟姊妹、伴侶（都是選填）的命盤和主角的關係。
//
// Family charts only adjust event probabilities, by at most about ±15 %, and choices can offset them (研究四).
// The wording is 磨合 (working things out) and 互補 (complementing); a person is never said to 剋 another.
import { fourPillars } from "./chart.js";
import { analyse, pillarOf, elementScores, ELEMENTS } from "./analysis.js";
import { clashes, combines } from "./luck.js";

const STEM_COMBOS = ["甲己", "乙庚", "丙辛", "丁壬", "戊癸"];
const GENERATES = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const CONTROLS = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
const ZODIAC = { 子: "鼠", 丑: "牛", 寅: "虎", 卯: "兔", 辰: "龍", 巳: "蛇", 午: "馬", 未: "羊", 申: "猴", 酉: "雞", 戌: "狗", 亥: "豬" };
const TRINES = ["申子辰", "亥卯未", "寅午戌", "巳酉丑"];
const HARMS = ["子未", "丑午", "寅巳", "卯辰", "申亥", "酉戌"];
const PUNISH = ["寅巳", "巳申", "寅申", "丑戌", "戌未", "丑未", "子卯"];
const pair = (list, a, b) => list.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
const CAP = 0.15;

export const RELATIONS = { father: "爸爸", mother: "媽媽", olderBrother: "哥哥", olderSister: "姊姊", youngerBrother: "弟弟", youngerSister: "妹妹", partner: "伴侶" };
export const isSibling = r => /Brother|Sister/.test(r);
export const isOlder = r => r === "olderBrother" || r === "olderSister";
export const sexOf = r => (r === "father" || /Brother/.test(r) ? "male" : "female");

// A family member's chart. Their birthplace is taken to be the protagonist's; without a birth time it has three
// pillars, like the protagonist's chart when the hour is unknown.
export function memberChart(member, place) {
  const pillars = Object.values(fourPillars({ date: member.date, time: member.time || null, place }));
  return { ...member, pillars, analysis: analyse(pillars) };
}

// How two charts get along: each relation adds to 互補 (complement) or 磨合 (tension).
//   me, other: { pillars: [year, month, day, hour?], analysis }
export function relate(me, other) {
  const a = me.pillars.map(pillarOf), b = other.pillars.map(pillarOf);
  const notes = [];
  const add = (score, text, short) => notes.push({ score, text, short });
  const [ya, yb] = [a[0].branch, b[0].branch];
  if (combines(ya, yb)) add(1, `生肖六合（${ZODIAC[ya]}和${ZODIAC[yb]}）`, "生肖六合");
  else if (ya !== yb && TRINES.some(t => t.includes(ya) && t.includes(yb))) add(0.6, `生肖三合（${ZODIAC[ya]}和${ZODIAC[yb]}）`, "生肖三合");
  if (clashes(ya, yb)) add(-1, `生肖相沖（${ZODIAC[ya]}和${ZODIAC[yb]}）`, "生肖相沖");
  if (pair(HARMS, ya, yb)) add(-0.6, `生肖相害（${ZODIAC[ya]}和${ZODIAC[yb]}）`, "生肖相害");
  if (pair(PUNISH, ya, yb)) add(-0.5, `生肖相刑（${ZODIAC[ya]}和${ZODIAC[yb]}）`, "生肖相刑");

  const [da, db] = [a[2], b[2]];
  const mine = `${da.stem}${da.stemEl}`, theirs = `${db.stem}${db.stemEl}`;
  if (STEM_COMBOS.includes(da.stem + db.stem) || STEM_COMBOS.includes(db.stem + da.stem)) add(1, `日干相合（${da.stem}${db.stem}合，天合）`, "日干相合");
  else if (CONTROLS[db.stemEl] === da.stemEl) add(-0.4, `對方的日干${theirs}約束你的日干${mine}（${db.stemEl}剋${da.stemEl}）：對方比較會管你`, "對方的日干約束你");
  else if (CONTROLS[da.stemEl] === db.stemEl) add(-0.2, `你的日干${mine}約束對方的日干${theirs}（${da.stemEl}剋${db.stemEl}）：你在對方面前比較有主見`, "你的日干約束對方");
  else if (GENERATES[db.stemEl] === da.stemEl) add(0.4, `對方的日干${theirs}生你的日干${mine}（${db.stemEl}生${da.stemEl}）：對方比較會照顧你`, "對方的日干生你");
  else if (GENERATES[da.stemEl] === db.stemEl) add(0.2, `你的日干${mine}生對方的日干${theirs}（${da.stemEl}生${db.stemEl}）：你比較會照顧對方`, "你的日干生對方");
  if (combines(da.branch, db.branch)) add(0.8, `日支六合（${da.branch}${db.branch}合，地合）`, "日支六合");
  if (clashes(da.branch, db.branch)) add(-0.8, `日支相沖（${da.branch}${db.branch}沖）`, "日支相沖");

  const scores = elementScores(other.pillars);
  const strongest = ELEMENTS.slice().sort((x, y) => scores[y] - scores[x])[0];
  if (me.analysis.useful.includes(strongest)) add(0.5, `對方命盤${strongest}最旺，正是你的喜用`, `對方${strongest}旺，是你的喜用`);
  else if (me.analysis.avoid.includes(strongest)) add(-0.5, `對方命盤${strongest}最旺，是你比較忌的五行`, `對方${strongest}旺，是你忌的五行`);

  const complement = notes.filter(n => n.score > 0).reduce((s, n) => s + n.score, 0);
  const tension = -notes.filter(n => n.score < 0).reduce((s, n) => s + n.score, 0);
  const net = Math.max(-1, Math.min(1, (complement - tension) / 2));
  const tone = net >= 0.3 ? "互補" : net <= -0.3 ? "需要磨合" : "平穩";
  return { notes, complement, tension, net: Math.round(net * 100) / 100, tone };
}

// One relation between your chart and your partner's (a note of relate()) as a line for the story, when it explains
// a love event: what brings you closer (sign > 0) or what takes 磨合 (sign < 0). `prefer` names a note (its
// `short`) to use when the two charts have it; otherwise the day branches (日支, the 夫妻宮) come first, then the
// strongest relation. Never says that one person 剋 the other: a stem that controls the other is 約束.
const PARTNER_LINES = {
  生肖六合: ["你們的生肖六合", "相處起來比較順"],
  生肖三合: ["你們的生肖三合", "個性容易合得來"],
  生肖相沖: ["你們的生肖相沖", "脾氣容易互不相讓，需要多一點磨合"],
  生肖相害: ["你們的生肖相害", "容易有小誤會，需要多一點磨合"],
  生肖相刑: ["你們的生肖相刑", "相處上需要多一點磨合"],
  日干相合: ["你們的日干相合", "彼此容易有默契"],
  日支六合: ["你們的日支相合", "感情容易有黏著力"],
  日支相沖: ["你們的日支相沖", "生活節奏容易不同，需要多一點磨合"],
};
const STEM_LINES = { 對方的日干生你: "對方比較會照顧你", 你的日干生對方: "你比較會照顧對方", 對方的日干約束你: "對方比較會管你，需要多一點磨合", 你的日干約束對方: "你在對方面前比較有主見，需要多一點磨合" };
export function partnerNote(bond, sign, prefer = null) {
  const notes = bond ? bond.notes.filter(n => Math.sign(n.score) === Math.sign(sign)) : [];
  if (!notes.length) return null;
  const n = notes.find(x => x.short === prefer) || notes.find(x => x.short.startsWith("日支")) || notes.slice().sort((x, y) => Math.abs(y.score) - Math.abs(x.score))[0];
  const [head, tail] = PARTNER_LINES[n.short] || [];
  const detail = (/（([^，）]+)/.exec(n.text) || [])[1];   // 子丑合, 龍和雞
  if (head) return `${head}${detail ? `（${detail}）` : ""}，${tail}`;
  // 對方的日干戊土生你的日干辛金, without the elements in brackets (they would say 剋)
  if (STEM_LINES[n.short]) return `${n.text.split("（")[0]}，${STEM_LINES[n.short]}`;
  return `${n.text}，${n.score > 0 ? "和對方在一起比較順" : "相處上需要多一點磨合"}`;   // the strongest element
}

// Everything the simulation needs from the optional family input.
//   input: { father?, mother?, siblings: [{ relation, name, date, time }], onlyChild?, partner? }, each member
//          { name, date, time }; the partner also { sex: "male" | "female" }, by default the opposite of yours
//   me:    { pillars, analysis, sex } of the protagonist
// Each member: { relation, label, name, date, sex, chart, bond }; without a birth date chart and bond are null.
export function buildFamily(input, me, place) {
  if (!input) return null;
  const members = [];
  for (const role of ["father", "mother"]) {
    const m = input[role];
    if (m && (m.date || m.name)) members.push({ relation: role, ...m });
  }
  for (const s of input.siblings || []) if (s && RELATIONS[s.relation] && isSibling(s.relation) && (s.date || s.name)) members.push({ ...s });
  const p = input.partner;
  if (p && (p.date || p.name)) {
    const sex = p.sex === "male" || p.sex === "female" ? p.sex : me && me.sex === "male" ? "female" : me && me.sex === "female" ? "male" : null;
    members.push({ ...p, relation: "partner", sex });
  }
  if (!members.length && !input.onlyChild) return null;
  const out = members.map(m => {
    const base = { relation: m.relation, label: RELATIONS[m.relation], name: m.name || "", date: m.date || null, sex: m.relation === "partner" ? m.sex : sexOf(m.relation), ...(m.relation === "partner" ? { metYear: Number.isInteger(m.metYear) ? m.metYear : null, marriedYear: Number.isInteger(m.marriedYear) ? m.marriedYear : null, only: !!m.only } : {}) };
    if (!m.date) return { ...base, chart: null, bond: null };
    const chart = memberChart(m, place);
    return { ...base, chart, bond: relate(me, chart) };
  });
  return { members: out, onlyChild: !!input.onlyChild && !out.some(m => isSibling(m.relation)) };
}

// Problems with the family input, for the form: parents born well before the protagonist, older siblings before
// and younger ones after (twins may share the date), a partner born within 30 years of you.
// Same-sex marriage is legal in Taiwan from 24 May 2019 (司法院釋字第七四八號解釋施行法).
export const SAME_SEX_MARRIAGE = 2019;

// `sex` is yours: with a partner of the same sex, a wedding year before SAME_SEX_MARRIAGE is turned away.
export function checkFamily(input, birth, sex = null) {
  if (!input) return [];
  const key = d => d.y * 10000 + d.m * 100 + d.d;
  const me = key(birth), errors = [];
  for (const role of ["father", "mother"]) {
    const m = input[role];
    if (!m || !m.date) continue;
    const gap = birth.y - m.date.y;
    if (gap < 12 || gap > 70) errors.push(`${RELATIONS[role]}的出生年份要比你早 12 到 70 年。`);
  }
  for (const s of input.siblings || []) {
    if (!s || !s.date || !isSibling(s.relation)) continue;
    const label = RELATIONS[s.relation], k = key(s.date);
    if (isOlder(s.relation) && k > me) errors.push(`${label}${s.name ? `（${s.name}）` : ""}的生日比你晚，要改成${s.relation === "olderBrother" ? "弟弟" : "妹妹"}嗎？`);
    if (!isOlder(s.relation) && k < me) errors.push(`${label}${s.name ? `（${s.name}）` : ""}的生日比你早，要改成${s.relation === "youngerBrother" ? "哥哥" : "姊姊"}嗎？`);
    if (Math.abs(s.date.y - birth.y) > 30) errors.push(`${label}${s.name ? `（${s.name}）` : ""}和你差了 30 年以上，請檢查出生年份。`);
  }
  const p = input.partner;
  if (p && p.date && Math.abs(p.date.y - birth.y) > 30) errors.push(`${RELATIONS.partner}${p.name ? `（${p.name}）` : ""}和你差了 30 年以上，請檢查出生年份。`);
  if (p && p.metYear !== undefined && p.metYear !== null) {
    const earliest = Math.max(birth.y, p.date ? p.date.y : birth.y) + 14;
    if (!Number.isInteger(p.metYear) || p.metYear < earliest || p.metYear > birth.y + 95) errors.push(`和${RELATIONS.partner}開始交往的年份要在你們都滿 14 歲以後（${earliest} 年以後）。`);
  }
  if (p && p.marriedYear !== undefined && p.marriedYear !== null) {
    const earliest = Math.max(birth.y, p.date ? p.date.y : birth.y) + 18;
    if (!Number.isInteger(p.marriedYear) || p.marriedYear < earliest || p.marriedYear > birth.y + 95) errors.push(`和${RELATIONS.partner}的結婚年份要在你們都滿 18 歲以後（${earliest} 年以後）。`);
    else if (Number.isInteger(p.metYear) && p.marriedYear < p.metYear) errors.push(`結婚年份不能早於開始交往的年份。`);
    else if (sex && p.sex === sex && p.marriedYear < SAME_SEX_MARRIAGE) errors.push(`同性婚姻在 ${SAME_SEX_MARRIAGE} 年 5 月才合法，結婚年份請填 ${SAME_SEX_MARRIAGE} 年以後，或留空。`);
  }
  return errors;
}

// Ln-odds tilts from the family charts, each within ±0.15 (about ±15 % in odds):
//   childhood  family events up to 17, from both parents (mother 0.09, father 0.06 per unit of net)
//   study      study events (father 0.05, mother 0.03)
//   bond       events between you and one person (a quarrel, help): 0.15 × that person's net; for siblings the
//              average over the siblings with a known birth date; `partner` tilts the love events with the partner
//              from the family input, only while that person is your partner (life.js)
export function familyTilts(family) {
  const t = { childhood: 0, study: 0, bond: { father: 0, mother: 0, siblings: 0, partner: 0 } };
  if (!family) return t;
  const sibs = [];
  for (const m of family.members) {
    if (!m.bond) continue;
    const n = m.bond.net;
    if (m.relation === "father") { t.childhood += 0.06 * n; t.study += 0.05 * n; t.bond.father = CAP * n; }
    else if (m.relation === "mother") { t.childhood += 0.09 * n; t.study += 0.03 * n; t.bond.mother = CAP * n; }
    else if (m.relation === "partner") t.bond.partner = CAP * n;
    else sibs.push(n);
  }
  if (sibs.length) t.bond.siblings = CAP * sibs.reduce((a, b) => a + b, 0) / sibs.length;
  const cap = v => Math.max(-CAP, Math.min(CAP, v));
  t.childhood = cap(t.childhood); t.study = cap(t.study);
  for (const k of Object.keys(t.bond)) t.bond[k] = cap(t.bond[k]);
  return t;
}

// Plain-language summary of the family tilts, as percentages of odds.
export function describeFamilyTilts(t) {
  const pct = v => `${v > 0 ? "+" : "−"}${Math.abs(Math.round((Math.exp(v) - 1) * 100))}%`;
  const lines = [];
  if (Math.abs(t.childhood) >= 0.005) lines.push(`17 歲以前的家庭事件：好事 ${pct(t.childhood)}、壞事 ${pct(-t.childhood)}`);
  if (Math.abs(t.study) >= 0.005) lines.push(`學業：好事 ${pct(t.study)}、壞事 ${pct(-t.study)}`);
  for (const [k, label] of [["father", "爸爸"], ["mother", "媽媽"], ["siblings", "兄弟姊妹"]]) {
    if (Math.abs(t.bond[k]) >= 0.005) lines.push(`和${label}之間：互相幫忙 ${pct(t.bond[k])}、吵架衝突 ${pct(-t.bond[k])}`);
  }
  const p = t.bond.partner || 0;
  if (Math.abs(p) >= 0.005) lines.push(`和${RELATIONS.partner}之間：感情順利 ${pct(p)}、感情摩擦 ${pct(-p)}`);
  return lines;
}
