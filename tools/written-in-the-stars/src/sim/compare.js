// Expecting parents: compare possible birth times.
//
// Every slot lives the same 100 lives: run i of each slot uses the same random seed, so a difference between two
// slots comes from their charts, not from one slot drawing luckier dice. Only slots at 39 weeks of pregnancy or later
// can be compared (an elective delivery before 39 weeks carries risks for the newborn, ACOG), and the comparison leaves
// out lifespan and health, so that it never reads as "this hour lives longer". When the baby's sex is not known yet,
// half the runs use a boy and half a girl, with the same seeds.
// (bazi-life also compares candidate names by name numerology; names do not tilt anything here, so that part is not ported.)
import { prepare } from "./setup.js";
import { runLife } from "./life.js";
import { hashSeed } from "./rng.js";
import { eduAtLeast } from "./world.js";

export const MAX_SLOTS = 6;
export const RUNS = 100;
// Weeks of pregnancy, counted from the due date (which is 40 weeks).
export const EARLIEST_WEEKS = 39, LATEST_WEEKS = 42;
const DAY = 86400000;

// The baby's prep for each sex that is possible: one, or both while the sex is unknown.
//   birth: { date: {y,m,d}, time: {h,mi} | null, place, sex: "male" | "female" | "unknown" }
export function babyCharts(birth, { family = null, prepareFn = prepare } = {}) {
  const sexes = birth.sex === "unknown" ? ["male", "female"] : [birth.sex];
  return sexes.map(sex => ({ sex, prep: prepareFn({ date: birth.date, time: birth.time, place: birth.place, sex }, { family }) }));
}

// Lives from..to-1 of one candidate (a birth slot's preps), with the shared seeds. The page runs a slice at a time so
// that it can show progress between slices.
//   charts: [{ sex, prep }]; the runs are split evenly over them
export function runSlice({ charts, key, runs = RUNS, from = 0, to = runs, events = undefined }) {
  const lives = [];
  for (let i = from; i < Math.min(to, runs); i++) {
    const c = charts[Math.floor(i * charts.length / runs)];
    lives.push(runLife({ prep: c.prep, sex: c.sex, seed: hashSeed(`${key}#${i}`), ...(events ? { events } : {}) }));
  }
  return lives;
}

// What the comparison shows, counted over the lives ("in N of the lives"); mood is the life's average close.
export function statsOf(lives) {
  const count = fn => lives.filter(fn).length;
  const mood = l => l.kline.reduce((s, k) => s + k.close, 0) / Math.max(1, l.kline.length);
  return {
    runs: lives.length,
    mood: lives.length ? Math.round(lives.reduce((s, l) => s + mood(l), 0) / lives.length) : null,
    college: count(l => eduAtLeast(l.state.edu, "bachelor")),
    married: count(l => l.state.marriages > 0),
    divorced: count(l => l.state.divorces > 0),
    home: count(l => l.state.home === "own"),
    promoted: count(l => l.log.some(e => e.id === "promotion")),
  };
}

export function simulate({ charts, key, runs = RUNS, events = undefined }) {
  return statsOf(runSlice({ charts, key, runs, events }));
}

// ---------- birth slots ----------
const dayNumber = d => Date.UTC(d.y, d.m - 1, d.d) / DAY;

// Weeks and days of pregnancy on a date, given the due date (40 weeks + 0 days).
export function gestation(date, due) {
  const days = 280 - (dayNumber(due) - dayNumber(date));
  const weeks = Math.floor(days / 7), rest = ((days % 7) + 7) % 7;
  return { days, weeks, rest, label: `${weeks} weeks ${rest} day${rest === 1 ? "" : "s"}` };
}

// The first and last dates a slot may fall on: 39 weeks + 0 days to 42 weeks + 0 days.
export function slotRange(due) {
  const at = days => { const t = new Date((dayNumber(due) + days - 280) * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
  return { from: at(EARLIEST_WEEKS * 7), to: at(LATEST_WEEKS * 7) };
}

// Why a slot cannot be compared, or null. Slots are { date: {y,m,d}, time: {h,mi} }.
export function checkSlot(slot, due) {
  if (!slot || !slot.date || !slot.time) return "Please enter a full date and time.";
  const g = gestation(slot.date, due);
  if (g.days < EARLIEST_WEEKS * 7) return `This slot is at ${g.label}, before ${EARLIEST_WEEKS} weeks. An elective delivery before ${EARLIEST_WEEKS} weeks carries risks for the baby, so it can't be compared here.`;
  if (g.days > LATEST_WEEKS * 7) return `This slot is at ${g.label}, past ${LATEST_WEEKS} weeks. Please talk with your doctor; it can't be compared here.`;
  return null;
}

// How a chart's years run over working life (ages 16–75): the mean of the yearly scores (0–100), with the best and the
// hardest decade, for ranking slots and explaining the rank.
export function slotOutlook(prep) {
  const decades = [];
  for (let from = 16; from <= 66; from += 10) {
    const years = prep.luck.filter(y => y.age >= from && y.age < from + 10);
    if (years.length) decades.push({ from, to: from + 9, score: years.reduce((s, y) => s + y.score, 0) / years.length });
  }
  if (!decades.length) return { score: 50, good: 0, hard: 0, total: 0, best: null, worst: null };
  const score = decades.reduce((s, d) => s + d.score, 0) / decades.length;
  const best = decades.reduce((a, b) => (b.score > a.score ? b : a)), worst = decades.reduce((a, b) => (b.score < a.score ? b : a));
  return {
    score: Math.round(score * 10) / 10,
    good: decades.filter(d => d.score >= 58).length, hard: decades.filter(d => d.score <= 42).length, total: decades.length,
    best: best.score >= 58 ? best : null, worst: worst.score <= 42 ? worst : null,
  };
}

// One slot: the baby's prep(s) at that time and the outlook. With the sex unknown, both are read and averaged.
export function slotEntry(slot, birth, opts = {}) {
  const charts = babyCharts({ ...birth, date: slot.date, time: slot.time }, opts);
  const parts = charts.map(c => ({ sex: c.sex, ...slotOutlook(c.prep) }));
  const mean = k => Math.round(parts.reduce((s, p) => s + p[k], 0) / parts.length * 10) / 10;
  const outlook = parts.length === 1 ? parts[0] : { score: mean("score"), good: mean("good"), hard: mean("hard"), total: parts[0].total, best: null, worst: null, parts };
  return { slot, charts, outlook };
}

// Slots ranked: by the outlook score, then by the simulated mood. Each entry: { slot, charts, outlook, stats }.
export function rankSlots(entries) {
  return entries.slice().sort((a, b) => (b.outlook.score - a.outlook.score) || ((b.stats ? b.stats.mood : 0) - (a.stats ? a.stats.mood : 0)));
}
