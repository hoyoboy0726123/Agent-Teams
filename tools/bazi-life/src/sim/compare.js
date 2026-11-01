// 準爸媽模式：替寶寶比較候選名字，以及比較可能的出生時段。
//
// Names: every candidate lives the same 100 lives. Run i of each name uses the same random seed, so a difference
// between two names comes from the names (their small tilts, 研究三), not from one name drawing luckier dice.
// Birth slots: only slots at 39 weeks of pregnancy or later can be compared (研究四: elective deliveries before 39
// weeks carry risks for the newborn), and the comparison leaves out lifespan and health, so that it never reads as
// "this hour lives longer".
// When the baby's sex is not known yet, half the runs use the boy's chart and half the girl's (the 大運 run forward
// or backward by sex), with the same seeds.
import { computeChart } from "../core/chart.js";
import { analyseName } from "../core/name.js";
import { nameReading } from "../core/name-reading.js";
import { decadeReading } from "../core/reading-year.js";
import { prepare } from "./setup.js";
import { runLife } from "./life.js";
import { hashSeed } from "./rng.js";

export const MAX_NAMES = 5;
export const MAX_SLOTS = 6;
export const RUNS = 100;
// Weeks of pregnancy, counted from the due date (which is 40 weeks).
export const EARLIEST_WEEKS = 39, LATEST_WEEKS = 42;
const DAY = 86400000;

// The baby's chart for each sex that is possible: one, or both while the sex is unknown.
//   birth: { date: {y,m,d}, time: {h,mi} | null, place, sex: "male" | "female" | "unknown" }
//   family: the parents (family.js input), for the simulation and the parent–child charts
export function babyCharts(birth, family = null) {
  const sexes = birth.sex === "unknown" ? ["male", "female"] : [birth.sex];
  return sexes.map(sex => {
    const chart = computeChart({ date: birth.date, time: birth.time, place: birth.place, sex, options: { solar: "true" } });
    return { sex, chart, prep: prepare(chart, { family }) };
  });
}

// Each candidate given name with the surname: the name analysis (for the simulation) and its reading (for the page).
export function nameCandidates(surname, givens, analysis) {
  return givens.map(given => {
    const full = `${surname}${given}`;
    const info = analyseName(full, analysis);
    if (info.error) return { given, full, info: null, reading: null, error: info.error };
    return { given, full, info, reading: nameReading(info, analysis), error: null };
  });
}

// Lives from..to-1 of one candidate (a name, or a birth slot's charts), with the shared seeds. The page runs a slice
// at a time so that it can show progress between slices.
//   charts: [{ sex, chart, prep }]; the runs are split evenly over them
export function runSlice({ charts, name = null, key, runs = RUNS, from = 0, to = runs }) {
  const lives = [];
  for (let i = from; i < Math.min(to, runs); i++) {
    const c = charts[Math.floor(i * charts.length / runs)];
    lives.push(runLife({ chart: c.chart, analysis: c.prep.analysis, luck: c.prep.luck, sex: c.sex, seed: hashSeed(`${key}#${i}`), name, family: c.prep.family }));
  }
  return lives;
}

// What the comparison shows, counted over the lives ("N 次裡有幾次"); mood is the life's average K-line close.
export function statsOf(lives) {
  const count = fn => lives.filter(fn).length;
  const mood = l => l.kline.reduce((s, k) => s + k.close, 0) / Math.max(1, l.kline.length);
  return {
    runs: lives.length,
    mood: lives.length ? Math.round(lives.reduce((s, l) => s + mood(l), 0) / lives.length) : null,
    university: count(l => ["大學", "科大", "碩士", "博士"].includes(l.state.edu)),
    married: count(l => l.state.marriages > 0),
    divorced: count(l => l.state.divorces > 0),
    home: count(l => l.state.home === "own"),
    promoted: count(l => l.log.some(e => e.id === "promotion")),
  };
}

// The whole comparison of one candidate at once (tests, scripts); the page uses runSlice.
export function simulate({ charts, name = null, key, runs = RUNS }) {
  return statsOf(runSlice({ charts, name, key, runs }));
}

// ---------- birth slots ----------
const dayNumber = d => Date.UTC(d.y, d.m - 1, d.d) / DAY;

// Weeks and days of pregnancy on a date, given the due date (40 weeks + 0 days).
export function gestation(date, due) {
  const days = 280 - (dayNumber(due) - dayNumber(date));
  return { days, weeks: Math.floor(days / 7), rest: ((days % 7) + 7) % 7, label: `${Math.floor(days / 7)} 週 ${((days % 7) + 7) % 7} 天` };
}

// The first and last dates a slot may fall on: 39 weeks + 0 days to 42 weeks + 0 days.
export function slotRange(due) {
  const at = days => { const t = new Date((dayNumber(due) + days - 280) * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
  return { from: at(EARLIEST_WEEKS * 7), to: at(LATEST_WEEKS * 7) };
}

// Why a slot cannot be compared, or null. Slots are { date: {y,m,d}, time: {h,mi} }.
export function checkSlot(slot, due) {
  if (!slot || !slot.date || !slot.time) return "請填完整的日期和時間。";
  const g = gestation(slot.date, due);
  if (g.days < EARLIEST_WEEKS * 7) return `這個時段只有 ${g.label}，還不到 ${EARLIEST_WEEKS} 週。${EARLIEST_WEEKS} 週以前的擇期剖腹會增加新生兒的風險，所以這裡不提供比較。`;
  if (g.days > LATEST_WEEKS * 7) return `這個時段已經 ${g.label}，超過 ${LATEST_WEEKS} 週，請和醫師討論，這裡不提供比較。`;
  return null;
}

// How a chart's ten-year luck runs over the working and later years (大運 starting at 虛歲 17 to 67): the mean of the
// decades' 喜忌 scores, with the best and the hardest decade, for ranking slots and explaining the rank.
export function slotOutlook(chart, analysis) {
  const decades = chart.luck.decades.map((_, i) => decadeReading(chart, analysis, i)).filter(d => d && d.startAge >= 17 && d.startAge <= 67);
  if (!decades.length) return { score: 0, good: 0, hard: 0, best: null, worst: null };
  const score = decades.reduce((s, d) => s + d.favor.score, 0) / decades.length;
  const best = decades.reduce((a, b) => (b.favor.score > a.favor.score ? b : a));
  const worst = decades.reduce((a, b) => (b.favor.score < a.favor.score ? b : a));
  return {
    score: Math.round(score * 100) / 100,
    good: decades.filter(d => d.tone === "吉").length, hard: decades.filter(d => d.tone === "凶").length, total: decades.length,
    best: best.tone === "吉" ? best : null, worst: worst.tone === "凶" ? worst : null,
  };
}

// One slot: the baby's chart(s) at that time and the outlook. With the sex unknown, both charts are read and the
// scores averaged (the boy's 大運 run forward or backward, the girl's the other way).
export function slotEntry(slot, birth, family = null) {
  const charts = babyCharts({ ...birth, date: slot.date, time: slot.time }, family);
  const parts = charts.map(c => ({ sex: c.sex, ...slotOutlook(c.chart, c.prep.analysis) }));
  const mean = k => Math.round(parts.reduce((s, p) => s + p[k], 0) / parts.length * 100) / 100;
  const outlook = parts.length === 1 ? parts[0] : { score: mean("score"), good: mean("good"), hard: mean("hard"), total: parts[0].total, best: null, worst: null, parts };
  return { slot, charts, outlook };
}

// Slots ranked: by the outlook score, then by the simulated mood. Each entry: { slot, charts, outlook, stats }.
export function rankSlots(entries) {
  return entries.slice().sort((a, b) => (b.outlook.score - a.outlook.score) || ((b.stats ? b.stats.mood : 0) - (a.stats ? a.stats.mood : 0)));
}
