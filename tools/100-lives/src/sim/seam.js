// The seam between the chart and the engine (PLAN.md, "The seam").
//
// The engine knows nothing about astrology. Per life it reads a `prep`:
//   prep.luck[age]   { age, L, score, m, reasons } for ages 0..MAX_AGE (the year the person is `age`)
//     m[domain][channel]  ln-odds tilt, clamped here to ±ln 2, whatever the chart engine sends
//     L                   the year's overall tone, −1..1          score   0..100, for the life chart
//     reasons             [{ domains: [...], tags?: [...], text }], a one-line English "why" for the year
//   prep.traits0     { drive, caution, warmth, curiosity, health }, each 0..1 (about 0.5 on average)
//   prep.jobFit(job) −1..1, how well a job (world.js JOBS entry) suits the chart
//   prep.intro       one line: "Sun in Leo, Moon in Pisces, Scorpio rising"
// This module checks and normalises that shape, so a slip in the chart engine can never push an event's odds past
// the bounds, and gives a neutral prep for tests and calibration (no chart at all).
export const DOMAINS = ["career", "wealth", "love", "health", "study", "family", "move"];
export const CHANNELS = ["good", "bad", "change"];
export const TRAITS = ["drive", "caution", "warmth", "curiosity", "health"];
export const LN2 = Math.log(2);
// The oldest age a life can reach; luck has an entry for every age 0..MAX_AGE.
export const MAX_AGE = 110;

const finite = (x, d = 0) => (Number.isFinite(x) ? x : d);
export const clampLnm = x => Math.max(-LN2, Math.min(LN2, finite(x)));
const clamp = (x, lo, hi, d) => Math.max(lo, Math.min(hi, finite(x, d)));

// p' = logit⁻¹(logit p + lnm): the base probability tilted by an ln-odds shift.
export function tilt(p, lnm) {
  if (!(p > 0)) return 0;
  if (p >= 1) return 1;
  const z = Math.log(p / (1 - p)) + finite(lnm);
  return 1 / (1 + Math.exp(-z));
}

export const zeroM = () => Object.fromEntries(DOMAINS.map(d => [d, Object.fromEntries(CHANNELS.map(c => [c, 0]))]));

// One year of luck in the engine's shape: every domain and channel present and clamped, L in −1..1, score 0..100,
// reasons a list of { domains, tags?, text } with English text.
export function normalizeYear(entry, age) {
  const e = entry || {};
  const m = zeroM();
  for (const d of DOMAINS) for (const c of CHANNELS) m[d][c] = clampLnm(e.m && e.m[d] && e.m[d][c]);
  const reasons = Array.isArray(e.reasons) ? e.reasons.filter(r => r && typeof r.text === "string" && Array.isArray(r.domains)) : [];
  return { ...e, age, L: clamp(e.L, -1, 1, 0), score: clamp(e.score, 0, 100, 50), m, reasons };
}

// The whole life's luck, ages 0..maxAge: missing ages repeat the nearest one before (or a neutral year).
export function normalizeLuck(luck, maxAge = MAX_AGE) {
  const byAge = new Map((Array.isArray(luck) ? luck : []).filter(Boolean).map((e, i) => [Number.isInteger(e.age) ? e.age : i, e]));
  const out = [];
  let last = null;
  for (let age = 0; age <= maxAge; age++) {
    const e = byAge.has(age) ? byAge.get(age) : last;
    out.push(normalizeYear(e, age));
    if (byAge.has(age)) last = byAge.get(age);
  }
  return out;
}

export const neutralLuck = (maxAge = MAX_AGE) => normalizeLuck([], maxAge);
export const neutralTraits = () => Object.fromEntries(TRAITS.map(k => [k, 0.5]));

export function normalizeTraits(t) {
  return Object.fromEntries(TRAITS.map(k => [k, clamp(t && t[k], 0, 1, 0.5)]));
}

// jobFit, guarded: a missing or throwing function, or a value out of range, reads as no fit (0).
export function safeJobFit(fn) {
  if (typeof fn !== "function") return () => 0;
  return job => { try { return clamp(fn(job), -1, 1, 0); } catch { return 0; } };
}

// A prep the engine can run: the chart engine's output checked, plus the birth input it came from.
//   input  { date: {y,m,d}, time: {h,mi} | null, place: { name, state, lat, lon, tz }, sex: "male" | "female" }
export function makePrep({ chart = null, luck = null, traits0 = null, jobFit = null, intro = "" } = {}, { input = null, name = "", family = null, maxAge = MAX_AGE } = {}) {
  return {
    chart, input: input || (chart && chart.input) || null,
    luck: normalizeLuck(luck, maxAge), traits0: normalizeTraits(traits0), jobFit: safeJobFit(jobFit),
    intro: typeof intro === "string" ? intro : "", name: typeof name === "string" ? name.trim() : "",
    // The family hook: null for now. A later family input would set { members, tilt(ev, s, ctx), reason(ev, s, ctx) }.
    family: family || null,
  };
}

// A prep with no chart at all: every year neutral, the traits at 0.5, no job fits. For tests and calibration.
export const neutralPrep = (input, opts = {}) => makePrep({ intro: "" }, { ...opts, input });
