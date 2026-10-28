// US base rates: the chance of each thing in the simulation happening within one year.
//
// The big official tables (life tables, causes of death, chronic disease) come from src/data/us-rates.js, which has
// the same export names and shapes as bazi-life's official-data.js: LIFE_TABLES, CAUSE_AGES, CAUSE_SHARES,
// CHRONIC_AGES, CHRONIC_RATES (and POPULATION_* for checks). How an illness unfolds after its diagnosis is a stated
// design (FATALITY). The smaller figures below (fertility, marriage, divorce, schooling, pay, homes, moves) carry
// their source next to them; where no statistic exists at all (dating, breakups, promotions), the value is a design
// parameter, marked "design", to be tuned by a calibration test so the simulated population matches the US figures
// that do exist. us-rates.js may also export any of the smaller tables under the same names (TFR, ASFR, …); then
// its figures win over the ones written here.
import * as D from "../data/us-rates.js";

const { LIFE_TABLES, CAUSE_AGES, CAUSE_SHARES, CHRONIC_AGES, CHRONIC_RATES } = D;
const clamp01 = p => Math.max(0, Math.min(1, p));
// Piecewise-linear interpolation over [[x, y], …] (sorted by x), flat outside the range.
export function interp(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

// ---------- tests can freeze the calendar to check calibration against one year's statistics ----------
let frozenYear = null;
export const freezeYear = y => { frozenYear = y; };
const yr = year => (frozenYear === null ? year : frozenYear);

// ---------- mortality ----------
// LIFE_TABLES rows: [year, male q(x) × 1e6, female q(x) × 1e6, [male e0, female e0], [male eΩ, female eΩ]] for the
// single ages 0..Ω−1 of the table (Ω = 85 in bazi-life's data; any open age works) and the remaining life expectancy at
// the open age Ω. A year between two tables takes q(x) log-linearly between them; years before the first table use it.
// From the open age on, a Kannisto curve (the old-age model of the Human Mortality Database) continues each table, its
// slope from the last ten single ages and its level set so that the remaining life expectancy at Ω is the table's.
// Years after the last table: the last table's hazards are scaled so that life expectancy at birth runs straight to
// the projection (E0_PROJECTION: us-rates.js's figure when it has one; otherwise about the Social Security Trustees'
// intermediate assumption for 2070, to be replaced by the data track's sourced figure).
const MAX = 120;
const OPEN = LIFE_TABLES[0][1].length;
const FIRST = LIFE_TABLES[0][0], LAST = LIFE_TABLES[LIFE_TABLES.length - 1][0];
export const LATEST_TABLE_YEAR = LAST;
export const E0_PROJECTION = D.E0_PROJECTION || { year: 2070, male: 82.4, female: 86.3 };
const COLUMN = { male: 1, female: 2 };

export function expectancy(q) {
  let l = 1, e = 0;
  for (let x = 0; x < q.length; x++) { const d = l * q[x]; e += l - d / 2; l -= d; }
  return e;
}

// The official q(0..Ω−1) and remaining life expectancy at Ω for a calendar year.
function officialAt(sex, year) {
  const c = COLUMN[sex], s = c - 1, q = t => t[c].map(v => Math.max(v, 1) / 1e6);
  if (year <= FIRST) return { q: q(LIFE_TABLES[0]), eOpen: LIFE_TABLES[0][4][s] };
  const k = LIFE_TABLES.findIndex(t => t[0] >= year), b = LIFE_TABLES[k];
  if (b[0] === year) return { q: q(b), eOpen: b[4][s] };
  const a = LIFE_TABLES[k - 1], w = (year - a[0]) / (b[0] - a[0]), qa = q(a), qb = q(b);
  return { q: qa.map((v, x) => Math.exp((1 - w) * Math.log(v) + w * Math.log(qb[x]))), eOpen: a[4][s] + w * (b[4][s] - a[4][s]) };
}

// q(Ω..MAX) from a Kannisto hazard μ(x) = a·e^{b(x−Ω)} / (1 + a·e^{b(x−Ω)}).
function oldAges(q, eOpen) {
  const xs = [], ys = [];
  for (let x = Math.max(0, OPEN - 10); x < OPEN; x++) { const mu = -Math.log(1 - q[x]); xs.push(x + 0.5 - OPEN); ys.push(Math.log(mu / (1 - mu))); }
  const mx = mean(xs), my = mean(ys);
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const b = Math.min(0.16, Math.max(0.05, slope));
  const tail = lnA => {
    const out = [];
    for (let x = OPEN; x < MAX; x++) { const z = Math.exp(lnA + b * (x + 0.5 - OPEN)); out.push(1 - Math.exp(-z / (1 + z))); }
    out.push(1);
    return out;
  };
  let lo = -12, hi = 4;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (expectancy(tail(mid)) > eOpen) lo = mid; else hi = mid; }
  return tail((lo + hi) / 2);
}

function projected(sex, year) {
  const base = lifeTable(sex, LAST);
  const target = interp([[LAST, expectancy(base)], [E0_PROJECTION.year, E0_PROJECTION[sex]]], year);
  const scaled = k => base.map((q, x) => (x === MAX ? 1 : 1 - Math.pow(1 - q, k)));
  let lo = 0.05, hi = 1.5;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (expectancy(scaled(mid)) > target) lo = mid; else hi = mid; }
  return scaled((lo + hi) / 2);
}

const tables = new Map();
// q(0..MAX) for a calendar year (whole years; the last age always dies).
export function lifeTable(sex, year) {
  const y = Math.round(year), key = `${sex}:${y}`;
  if (!tables.has(key)) {
    let q;
    if (y > LAST) q = projected(sex, y);
    else { const t = officialAt(sex, y); q = Float64Array.from([...t.q, ...oldAges(t.q, t.eOpen)]); }
    tables.set(key, q);
  }
  return tables.get(key);
}
// Probability of dying within the year at `age`, from the period table of calendar year `year`.
export const deathRaw = (age, sex, year) => lifeTable(sex, year)[Math.min(MAX, Math.max(0, Math.round(age)))];

// ---------- serious illness: cancer, stroke, heart disease ----------
// How many people die of each, at each age, is official: the life table's q(x) times that cause's share of all deaths
// at the age (CAUSE_SHARES, shares × 1e4 by sex and age group, running straight between the groups' middles and
// between the anchor years, held outside them). In the story such an illness is diagnosed first and kills, if it
// does, within five years (FATALITY, from typical survival: 15–20 % of stroke and heart patients die in the first
// year); so the diagnoses at an age are the deaths a year older divided by the five-year case fatality.
// Cancer's fatality is FATALITY.cancer × e^(α + β·(age at diagnosis − 65)/10) for each sex (CANCER_FATALITY): younger
// patients survive far more often, and a regular health check lowers the fatality by a quarter (design). α and β are
// to be solved so the simulated diagnoses reproduce the US cancer registry (us-rates.js CANCER_FATALITY when it has
// them); until then they are bazi-life's values for Taiwan, which give a five-year survival a little below the US one.
export const WHO_STANDARD = [[0, 8.86], [5, 8.69], [10, 8.60], [15, 8.47], [20, 8.22], [25, 7.93], [30, 7.61], [35, 7.15], [40, 6.59], [45, 6.04], [50, 5.37], [55, 4.55], [60, 3.72], [65, 2.96], [70, 2.21], [75, 1.52], [80, 0.91], [85, 0.63]];
export const CANCER_REFERENCE = D.CANCER_REFERENCE || null;
const FATALITY = { cancer: [0.15, 0.1, 0.07, 0.05, 0.04], stroke: [0.17, 0.06, 0.05, 0.04, 0.04], "heart disease": [0.14, 0.05, 0.04, 0.04, 0.03] };
export const CANCER_FATALITY = D.CANCER_FATALITY || { male: [0.5374, 0.2696], female: [0.1, 0.4262] };   // [α, β]
const CAUSE = { cancer: "cancer", stroke: "stroke", "heart disease": "heart" };
export const SERIOUS_TYPES = Object.keys(CAUSE);
const CHECKUP_SHARE = 0.55;   // the share of people who keep up regular checkups from 40 (story/core.js `checkups`)
const MIDDLES = CAUSE_AGES.map((a, i) => (i + 1 < CAUSE_AGES.length ? (a + CAUSE_AGES[i + 1]) / 2 : a + 2));

// The cause's share of all deaths at `age` in `year`.
export function causeShare(type, age, sex, year) {
  const at = rec => interp(MIDDLES.map((m, g) => [m, rec[1][sex][CAUSE[type]][g] / 1e4]), age);
  const k = CAUSE_SHARES.findIndex(r => r[0] >= year);
  if (k === -1) return at(CAUSE_SHARES[CAUSE_SHARES.length - 1]);
  if (k === 0) return at(CAUSE_SHARES[0]);
  const a = CAUSE_SHARES[k - 1], b = CAUSE_SHARES[k], w = (year - a[0]) / (b[0] - a[0]);
  return (1 - w) * at(a) + w * at(b);
}
// The yearly fatality k years after a diagnosis at `age`, with or without a regular health check (`checkups`, or
// null for the population's mix from 40 on).
function fatality(type, k, age, sex, checkups) {
  const f = FATALITY[type][Math.min(4, Math.max(0, k))];
  if (type !== "cancer") return f;
  const check = checkups === null ? (age >= 40 ? 1 - 0.25 * CHECKUP_SHARE : 1) : checkups ? 0.75 : 1;
  const [a, b] = CANCER_FATALITY[sex];
  return Math.min(0.9, f * Math.exp(a + b * (age - 65) / 10) * check);
}
function caseFatality(type, age, sex) {
  let alive = 1;
  for (let k = 0; k < 5; k++) alive *= 1 - fatality(type, k, age, sex, null);
  return 1 - alive;
}
const incidences = new Map();
function incidenceTable(type, sex, year) {
  const key = `${type}:${sex}:${year}`;
  let out = incidences.get(key);
  if (!out) {
    out = new Float64Array(MAX + 1);
    for (let x = 0; x <= MAX; x++) out[x] = deathRaw(x + 1, sex, year) * causeShare(type, x + 1, sex, year) / caseFatality(type, x, sex);
    incidences.set(key, out);
  }
  return out;
}
export const incidence = (type, age, sex, year) => incidenceTable(type, sex, Math.round(year))[Math.min(MAX, Math.max(0, Math.round(age)))];
export const serious = (age, sex, year) => clamp01(SERIOUS_TYPES.reduce((s, t) => s + incidence(t, age, sex, year), 0));
export function seriousType(age, sex, year, rng) {
  const w = SERIOUS_TYPES.map(t => incidence(t, age, sex, year)), total = w.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return SERIOUS_TYPES[i]; }
  return SERIOUS_TYPES[w.length - 1];
}
// Extra probability of dying in the k-th year after the diagnosis.
export const seriousFatality = (type, years, checkups, diagnosedAt = 70, sex = "male") => fatality(type, years, diagnosedAt, sex, !!checkups);

// ---------- chronic disease: high blood pressure or diabetes ----------
// CHRONIC_RATES: people with each per 100,000 by sex and age group (either one, taking the two as independent;
// straight between the groups' middles). The share rises with age, and the yearly onset is that rise over the share
// not yet affected. From 75 on the share stops rising (those affected die sooner), so the onset stays at its level at 75.
// The story finds it from CHRONIC_FROM on (story/core.js `chronic`, ages 30+), so the onset at that age is the whole
// share reached by then (about one in ten at 30), none before: the share by age then follows the table from 30 on,
// and the mortality baseline below sees the same onsets as the lives.
export const CHRONIC_FROM = 30;
const CHRONIC_MIDDLES = CHRONIC_AGES.map((a, i) => (i + 1 < CHRONIC_AGES.length ? (a + CHRONIC_AGES[i + 1]) / 2 : a + 2.5));
export const chronicShare = (age, sex) => {
  const r = CHRONIC_RATES[sex], at = rates => interp(CHRONIC_MIDDLES.map((m, g) => [m, rates[g] / 1e5]), age);
  return 1 - (1 - at(r.hypertension)) * (1 - at(r.diabetes));
};
const ONSET = Object.fromEntries(["male", "female"].map(sex => {
  const out = [];
  for (let x = 0; x <= MAX; x++) {
    const a = Math.min(x, 75), p = chronicShare(a, sex);
    out.push(x < CHRONIC_FROM ? 0 : x === CHRONIC_FROM ? chronicShare(a + 1, sex) : Math.max(0, (chronicShare(a + 1, sex) - p) / (1 - p)));
  }
  return [sex, out];
}));
export const chronic = (age, sex) => ONSET[sex][Math.min(MAX, Math.max(0, Math.round(age)))];
export const CHRONIC_HR = 1.3;

// The life table already includes deaths from serious illness and the extra risk of chronic disease, so the healthy
// baseline is the table minus those. A small Markov chain over the states the simulation uses (healthy, or k years
// after a diagnosis; with or without chronic disease) solves, age by age, for the baseline that makes the
// population's expected death probability equal the table.
const fatalities = new Map();
function fatalityTable(sex, year) {
  const key = `${sex}:${year}`;
  let out = fatalities.get(key);
  if (!out) {
    out = [];
    for (let a = 0; a <= MAX; a++) {
      const w = SERIOUS_TYPES.map(t => incidence(t, a, sex, year)), total = w.reduce((x, y) => x + y, 0);
      out.push([0, 1, 2, 3, 4].map(k => (total ? SERIOUS_TYPES.reduce((s, t, i) => s + w[i] / total * fatality(t, k, a, sex, null), 0) : 0)));
    }
    fatalities.set(key, out);
  }
  return out;
}
const fatalityAt = (table, diagnosedAt, k) => (diagnosedAt < 0 ? 0 : table[Math.min(MAX, diagnosedAt)][k]);
const baselines = new Map();
function baseline(sex, year) {
  const key = `${sex}:${Math.round(year)}`;
  if (baselines.has(key)) return baselines.get(key);
  const q = lifeTable(sex, year), out = new Array(q.length), fat = fatalityTable(sex, Math.round(year));
  // fractions of the living population: [chronic? 0/1][state], state 0 = not ill, 1..5 = ill in year k = state-1
  let pop = [[1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
  for (let x = 0; x < q.length; x++) {
    const inc = serious(x, sex, Math.round(year)), chr = chronic(x, sex);
    const next = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
    for (const c of [0, 1]) {
      const healthy = pop[c][0] + pop[c][5];               // state 5 = ill for 5 years → recovered this year
      next[c][1] += healthy * inc; next[c][0] += healthy * (1 - inc);
      for (let k = 1; k < 5; k++) next[c][k + 1] += pop[c][k];
    }
    for (let st = 0; st < 6; st++) { const move = next[0][st] * chr; next[0][st] -= move; next[1][st] += move; }
    let illDeaths = 0, weight = 0;
    for (const c of [0, 1]) for (let st = 0; st < 6; st++) {
      const share = next[c][st]; if (!share) continue;
      weight += share * (c ? CHRONIC_HR : 1);
      if (st >= 1 && st <= 5) illDeaths += share * fatalityAt(fat, x - (st - 1), st - 1);
    }
    const total = next[0].reduce((a, b) => a + b, 0) + next[1].reduce((a, b) => a + b, 0);
    const b = Math.max(0.25 * q[x], (q[x] * total - illDeaths) / weight);
    out[x] = b;
    for (const c of [0, 1]) for (let st = 0; st < 6; st++) {
      const die = Math.min(1, b * (c ? CHRONIC_HR : 1) + (st >= 1 && st <= 5 ? fatalityAt(fat, x - (st - 1), st - 1) : 0));
      next[c][st] *= 1 - die;
    }
    const alive = next[0].reduce((a, b) => a + b, 0) + next[1].reduce((a, b) => a + b, 0);
    pop = next.map(row => row.map(v => v / alive));
  }
  baselines.set(key, out);
  return out;
}
// The healthy baseline: what life.js uses each year, raised by chronic disease (CHRONIC_HR) and a serious illness.
export const death = (age, sex, year) => baseline(sex, year)[Math.min(MAX, Math.max(0, Math.round(age)))];

// ---------- births ----------
// Total fertility rate by year (us-rates.js TFR, NCHS: 3.09 in 1950, 3.65 in 1960, 2.48 in 1970, the low of 1.74 in
// 1976, 2.08 in 1990, 2.12 in 2007, 1.64 in 2020, 1.62 in 2023); after 2023 the Social Security Trustees' intermediate
// path (TFR_PROJECTION, back up to 1.9 by 2050).
export const TFR = D.TFR || [[1950, 3.03], [1957, 3.77], [1960, 3.65], [1965, 2.91], [1970, 2.48], [1973, 1.88], [1976, 1.74], [1980, 1.84], [1985, 1.84], [1990, 2.08], [1995, 1.98], [2000, 2.06], [2007, 2.12], [2010, 1.93], [2015, 1.84], [2020, 1.64], [2021, 1.66], [2023, 1.62]];
const TFR_PROJECTION = D.TFR_PROJECTION || [[2023, 1.62], [2050, 1.9], [2150, 1.9]];
const TFR_LAST = TFR[TFR.length - 1][0];
export const tfrAt = year => (year <= TFR_LAST ? interp(TFR, year) : interp(TFR_PROJECTION, year));
// Births per woman per year by mother's age group (us-rates.js ASFR_BY_YEAR, NCHS: anchor years 1950–2023, 10–14,
// 15–19, …, 45–49), straight between the anchors and scaled to the year's TFR; after 2023, 2023's ages scaled to the
// projected TFR.
const ASFR_2023 = [[10, 0.0002], [15, 0.0131], [20, 0.0577], [25, 0.091], [30, 0.0943], [35, 0.0543], [40, 0.0125], [45, 0.0011], [50, 0]];
const ASFR_BY_YEAR = D.ASFR_BY_YEAR || [[2023, ASFR_2023]];
const groupRate = (row, age) => row.reduce((v, [a, r]) => (age >= a ? r : v), 0);
const asfrRows = new Map();
function asfrRow(year) {
  const y = Math.round(year);
  if (!asfrRows.has(y)) {
    const k = ASFR_BY_YEAR.findIndex(t => t[0] >= y);
    const last = ASFR_BY_YEAR[ASFR_BY_YEAR.length - 1];
    let row;
    if (k === -1) row = last[1].map(([a, r]) => [a, r]);
    else if (k === 0 || ASFR_BY_YEAR[k][0] === y) row = ASFR_BY_YEAR[k][1].map(([a, r]) => [a, r]);
    else {
      const [y0, r0] = ASFR_BY_YEAR[k - 1], [y1, r1] = ASFR_BY_YEAR[k], w = (y - y0) / (y1 - y0);
      row = r0.map(([a, r], i) => [a, (1 - w) * r + w * r1[i][1]]);
    }
    const total = 5 * row.reduce((t, [, r]) => t + r, 0), k2 = tfrAt(y) / total;
    asfrRows.set(y, row.map(([a, r]) => [a, r * k2]));
  }
  return asfrRows.get(y);
}
// The population's births per woman of `age` in `year`.
export const asfr = (age, year = 2023) => (age < 10 || age >= 50 ? 0 : groupRate(asfrRow(yr(year)), age));
// The share of births to unmarried mothers (us-rates.js NONMARITAL_BIRTH_SHARE, NCHS: 3.9 % in 1950, 5.3 % in 1960,
// 10.7 % in 1970, 18.4 % in 1980, 28 % in 1990, 33 % in 2000, 41 % at the 2009 peak, 40 % in 2023), spread over the
// mother's age as in recent years (NCHS, approximately: under 20 about 9 in 10, 20–24 two thirds, 25–29 two in five,
// 30–34 a quarter, 35+ a fifth): each year's age profile is moved in log-odds so the year's births add up to its share.
export const NONMARITAL_BIRTH_SHARE = D.NONMARITAL_BIRTH_SHARE || [[1950, 0.039], [1960, 0.053], [1970, 0.107], [1980, 0.184], [1990, 0.28], [2000, 0.332], [2009, 0.41], [2023, 0.4]];
const NONMARITAL_BY_AGE = [[10, 0.95], [15, 0.89], [20, 0.66], [25, 0.4], [30, 0.24], [35, 0.21], [40, 0.24], [45, 0.25]];
const logit = p => Math.log(p / (1 - p)), expit = z => 1 / (1 + Math.exp(-z));
const nonmaritalShifts = new Map();
function nonmaritalShift(year) {
  const y = Math.round(year);
  if (!nonmaritalShifts.has(y)) {
    const row = asfrRow(y), target = interp(NONMARITAL_BIRTH_SHARE, y), total = row.reduce((t, [, r]) => t + r, 0);
    const share = d => row.reduce((t, [a, r]) => t + r * expit(logit(groupRate(NONMARITAL_BY_AGE, a)) + d), 0) / total;
    let lo = -8, hi = 8;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (share(mid) < target) lo = mid; else hi = mid; }
    nonmaritalShifts.set(y, (lo + hi) / 2);
  }
  return nonmaritalShifts.get(y);
}
export const nonmaritalShare = (age, year) => expit(logit(groupRate(NONMARITAL_BY_AGE, Math.max(10, age))) + nonmaritalShift(yr(year)));
// Births by how many children came before (design: in the simulation births come to couples, and the order shapes
// family sizes; the US has more third children than bazi-life's Taiwan).
export const PARITY = [1.55, 1.45, 0.95, 0.6, 0.3];
// In the simulation births come only to couples: married, or together a year or more (story/core.js `baby`), who have
// not decided against more children. EXPOSURE is, per 5-year age group (15–19 … 45–49) and year, the share of all women
// who are such couples, weighted by PARITY and by the "trying" boost (×1.8 for three years after deciding to have a
// child), measured on the simulated population itself (fitted: test/calibration.test.js prints it with CAL=fit). The
// rate per couple is then the population rate for married (or unmarried) mothers over that share, so the simulated
// population has the US births by age, year and marital status.
const EXPOSURE_YEARS = [1965, 1970, 1975, 1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025, 2030, 2035];
// BEGIN EXPOSURE (fitted)
const EXPOSURE = {
  married: [
    [0.0356, 0.7, 1.1, 1, 0.75, 0.5, 0.3],
    [0.1139, 0.5457, 1.05, 1, 0.75, 0.5, 0.3],
    [0.1083, 0.5245, 0.4356, 1, 0.75, 0.5, 0.3],
    [0.085, 0.4877, 0.4379, 0.2303, 0.75, 0.5, 0.3],
    [0.0574, 0.4364, 0.4202, 0.2234, 0.1106, 0.5, 0.3],
    [0.0475, 0.3842, 0.4088, 0.2331, 0.1146, 0.0764, 0.3],
    [0.0361, 0.3344, 0.3905, 0.2378, 0.1232, 0.0704, 0.0668],
    [0.0274, 0.2958, 0.3601, 0.2461, 0.1308, 0.0761, 0.0737],
    [0.0249, 0.27, 0.3472, 0.2322, 0.1231, 0.0761, 0.0755],
    [0.0182, 0.2336, 0.3481, 0.2383, 0.1109, 0.0686, 0.066],
    [0.0122, 0.1934, 0.3462, 0.2559, 0.118, 0.0761, 0.0725],
    [0.0074, 0.1598, 0.3383, 0.2922, 0.1446, 0.0788, 0.0893],
    [0.005, 0.1185, 0.3407, 0.3051, 0.1826, 0.09, 0.0861],
    [0.005, 0.1222, 0.3285, 0.3227, 0.2024, 0.1058, 0.0953],
    [0.0055, 0.1308, 0.3445, 0.341, 0.2208, 0.1381, 0.1335],
  ],
  partnered: [
    [0.0236, 0.2, 0.15, 0.1, 0.08, 0.06, 0.05],
    [0.0807, 0.1583, 0.15, 0.1, 0.08, 0.06, 0.05],
    [0.084, 0.1532, 0.0945, 0.11, 0.08, 0.06, 0.05],
    [0.09, 0.156, 0.1027, 0.0898, 0.09, 0.06, 0.05],
    [0.0779, 0.1357, 0.1209, 0.1029, 0.088, 0.07, 0.05],
    [0.0778, 0.1466, 0.1148, 0.113, 0.0899, 0.0678, 0.05],
    [0.0758, 0.1645, 0.1149, 0.1091, 0.1001, 0.0818, 0.0848],
    [0.0763, 0.1834, 0.1292, 0.107, 0.097, 0.0974, 0.0877],
    [0.0737, 0.1855, 0.1395, 0.1181, 0.1019, 0.093, 0.0919],
    [0.0626, 0.2029, 0.1408, 0.1226, 0.1094, 0.0948, 0.0822],
    [0.0632, 0.2156, 0.1501, 0.1171, 0.1108, 0.1011, 0.0942],
    [0.0476, 0.2109, 0.1608, 0.1195, 0.1056, 0.0917, 0.099],
    [0.0426, 0.2048, 0.1591, 0.1369, 0.0967, 0.0908, 0.0839],
    [0.048, 0.2062, 0.1579, 0.1476, 0.1061, 0.0901, 0.0793],
    [0.0552, 0.2188, 0.1596, 0.1359, 0.1194, 0.1027, 0.0967],
  ],
};
// END EXPOSURE
export const BIRTH_EXPOSURE = { years: EXPOSURE_YEARS, ...EXPOSURE };
export function exposure(kind, age, year) {
  const g = Math.max(0, Math.min(6, Math.floor((age - 15) / 5))), rows = EXPOSURE[kind], y = yr(year);
  const pts = EXPOSURE_YEARS.map((t, i) => [t, rows[i][g]]);
  return Math.max(0.005, interp(pts, y));
}
// The chance of a birth this year for a woman of `motherAge` with `parity` children, married (or, with
// married = false, together with a partner a year or more).
export function birth(motherAge, parity, year, married = true) {
  const a = Math.round(motherAge);
  if (a < 15 || a >= 50) return 0;
  const nm = nonmaritalShare(a, year), base = asfr(a, year) * (married ? 1 - nm : nm);
  return clamp01(base / exposure(married ? "married" : "partnered", a, year) * PARITY[Math.min(4, parity)]);
}
export function siblings(birthYear, rng) {
  const tfr = tfrAt(birthYear);
  let n = 0;
  for (let i = 1; i < 8; i++) if (rng() < Math.min(0.95, Math.max(0, tfr - 1) / i)) n++;
  const older = Math.floor(rng() * (n + 1));
  return { older, younger: n - older };
}

// ---------- marriage ----------
// Median age at first marriage (Census Bureau, Current Population Survey, table MS-2; us-rates.js, every year
// 1947–2025): men 22.8 and women 20.3 in 1950, 23.2 and 20.8 in 1970, 26.1 and 23.9 in 1990, 26.8 and 25.1 in 2000,
// 28.2 and 26.1 in 2010, 30.5 and 28.1 in 2020, 30.2 and 28.6 in 2024. Every age curve below is read at the age's
// 2024 equivalent, x = age − (the year's median − 2024's median), so the timing follows the era. Dating, breakups and
// proposals have no official statistic: they are design curves (their shape from bazi-life) with an era level, fitted
// in a micro-simulation of core.js's love events and checked by test/calibration.test.js against the cohorts' median
// age at first marriage (MS-2 in the year they married) and the share ever married by 45 (Census CPS/ACS: about 9 in
// 10 of the 1950s cohorts, three quarters of men and four in five women of the 1980s ones; NSFG 2006–10, probability
// of a first marriage by 40: women 0.84, men 0.78).
export const MEDIAN_FIRST_MARRIAGE = D.MEDIAN_FIRST_MARRIAGE || {
  male: [[1950, 22.8], [1960, 22.8], [1970, 23.2], [1980, 24.7], [1990, 26.1], [2000, 26.8], [2010, 28.2], [2020, 30.5], [2024, 30.2]],
  female: [[1950, 20.3], [1960, 20.3], [1970, 20.8], [1980, 22.0], [1990, 23.9], [2000, 25.1], [2010, 26.1], [2020, 28.1], [2024, 28.6]],
};
const sexKey = sex => (sex === "female" ? "female" : "male");
export const marriageShift = (sex, year) => interp(MEDIAN_FIRST_MARRIAGE[sexKey(sex)], yr(year)) - interp(MEDIAN_FIRST_MARRIAGE[sexKey(sex)], 2024);
const eqAge = (age, sex, year) => age - marriageShift(sex, year);
// Era levels (fitted): more dating and more proposals while the whole country married young.
const DATING_ERA = [[1960, 2.43], [1985, 1.2], [2024, 1]];
const PROPOSAL_ERA = [[1960, 1.57], [1985, 1.37], [2005, 1.04], [2024, 1]];
// The proposal curves' centres in 2024-equivalent ages (fitted), and their slower decline after 27 (+40 % by 37).
const CENTRE = { female: 0.33, male: 0.54 };
export const dating = (age, rel, year = 2024, sex = "female") => {
  if (rel !== "single") return interp([[30, 0.2], [45, 0.12], [60, 0.05], [75, 0.02]], age);
  const x = Math.max(15, eqAge(age, sex, year));
  return Math.min(0.9, 0.766 * interp(DATING_ERA, yr(year)) * interp([[15, 0.08], [17, 0.12], [22, 0.28], [30, 0.3], [40, 0.18], [55, 0.08], [70, 0.03]], x));
};
export const breakup = (age, year = 2024, sex = "female") => 1.013 * interp([[18, 0.4], [25, 0.3], [35, 0.25], [50, 0.2]], eqAge(age, sex, year));
export function proposal(age, sex, year = 2024, marriages = 0) {
  const curve = sex === "female"
    ? [[18, 0.035], [22, 0.18], [25, 0.31], [27, 0.35], [30, 0.29], [35, 0.18], [45, 0.09], [60, 0.04]]
    : [[20, 0.025], [24, 0.11], [27, 0.23], [30, 0.28], [34, 0.22], [39, 0.14], [48, 0.065], [60, 0.03]];
  if (marriages) return interp(curve, age) * 0.6;
  const x = eqAge(age, sex, year) + CENTRE[sexKey(sex)];
  return Math.min(0.9, 1.09 * interp(PROPOSAL_ERA, yr(year)) * interp(curve, x) * (1 + 0.4 * Math.max(0, Math.min(1, (x - 27) / 10))));
}

// ---------- divorce ----------
// The refined divorce rate, divorces per 1,000 married women a year (CDC/NCHS and the National Center for Family &
// Marriage Research, approximately): 10.3 in 1950, 9.2 in 1960, 14.9 in 1970, 22.6 in 1980, 20.9 in 1990, about 19.5
// in 2000, 19.8 in 2010, 15.5 in 2019, 14.6 in 2022, 14.4 in 2023. The duration curve (by years married, from the
// first year after the wedding) is bazi-life's, fitted there with the crisis choices to a rate of 10.5 per 1,000, so it
// is scaled by the US rate over 10.5. Lifetime: roughly 40 % of first marriages end in divorce.
export const REFINED_DIVORCE = D.REFINED_DIVORCE || [[1950, 10.3], [1960, 9.2], [1970, 14.9], [1975, 20.3], [1980, 22.6], [1990, 20.9], [2000, 19.5], [2008, 20.5], [2010, 19.8], [2015, 16.9], [2019, 15.5], [2020, 14.0], [2022, 14.6], [2023, 14.4]];
const DIVORCE_BY_YEARS = [[1, 0.032], [2, 0.036], [5, 0.024], [9, 0.014], [15, 0.0085], [25, 0.005], [40, 0.003]];
export const divorce = (years, year) => interp(DIVORCE_BY_YEARS, years) * interp(REFINED_DIVORCE, yr(year)) / 10.5;
export const crisis = years => interp([[0, 0.03], [3, 0.06], [10, 0.04], [25, 0.02]], years);   // design
// Same-sex couples can marry nationwide from 2015 (Obergefell v. Hodges), in some states earlier (people.js).
export const SAME_SEX_MARRIAGE = 2015;

// ---------- school ----------
// Kindergarten: about 60 % of five-year-olds in the mid-1960s, near universal from the 1980s (NCES, approximately).
export const kindergarten = year => interp([[1955, 0.55], [1965, 0.62], [1975, 0.85], [1985, 0.93], [2000, 0.95]], yr(year));
// Middle school / junior high: everyone of school age (compulsory schooling).
export const juniorHigh = () => 1;
// Finishing high school, a diploma or a GED, by the year you turn 18 (NCES Digest table 104.20, people aged 25–29 who
// completed high school, read back to their graduation year: about 61 % in 1960, 75 % in 1970, 85 % in 1980, 88 % in
// 2000, 89 % in 2010, 95 % in 2020). About 4 points of that is a GED taken later.
export const HIGH_SCHOOL = D.HIGH_SCHOOL || [[1950, 0.6], [1962, 0.75], [1972, 0.85], [1982, 0.86], [1992, 0.87], [2002, 0.89], [2012, 0.92], [2020, 0.95]];
export const highSchoolGrad = year => interp(HIGH_SCHOOL, yr(year));
// The chance of dropping out in each of the years at 16 and 17 (legal from 16 in most states), so that the diploma
// share on time is the completion share less the GEDs; a dropout earns a GED with GED_RATE a year from 17 to 30 (design).
export const hsDropout = year => 1 - Math.sqrt(Math.max(0.3, highSchoolGrad(year) - 0.04));
export const GED_RATE = 0.035;
export const ged = age => (age >= 17 && age <= 30 ? GED_RATE : 0);
// College right after high school: the share of new graduates enrolled that fall (NCES Digest table 302.10: 45 % in
// 1960, 52 % in 1970, 49 % in 1980, 60 % in 1990, 63 % in 2000, 70 % in 2009, 66 % in 2019, 62 % in 2022), about a
// third of them in a two-year community college from the 1970s (fewer before). Trade school and enlisting are the
// usual other paths; the rest go to work.
export const ENROLLMENT = D.ENROLLMENT || [[1955, 0.42], [1960, 0.45], [1965, 0.51], [1970, 0.52], [1980, 0.49], [1985, 0.58], [1990, 0.6], [1995, 0.62], [2000, 0.63], [2005, 0.69], [2009, 0.7], [2015, 0.69], [2019, 0.66], [2020, 0.63], [2022, 0.62]];
export const college = year => interp(ENROLLMENT, yr(year));
export const communityShare = year => interp([[1960, 0.2], [1972, 0.33], [2022, 0.33]], yr(year));
// The weights of the choice after graduation: { college, community, trade, military, work }, summing to 1.
export function afterHighSchool(year, sex = "male", birthYear = year - 18) {
  const enroll = college(year), cc = communityShare(year), mil = military(birthYear, year, sex).p * 0.6;
  const trade = 0.05;
  return { college: enroll * (1 - cc), community: enroll * cc, trade, military: mil, work: Math.max(0.02, 1 - enroll - trade - mil) };
}
// Finishing: about 62–64 % of four-year starters finish a bachelor's within six years (NCES), about a third of
// community-college starters finish an associate degree and a third transfer to a four-year school (design from
// National Student Clearinghouse figures). Yearly dropout rates that give those shares (design).
export const collegeDropout = (year, track = "college") => (track === "community" ? 0.2 : 0.11);
export const transfer = () => 0.33;
// Graduate school straight after a bachelor's (design, from NCES: about 14 % of adults hold an advanced degree, about
// 37 % of bachelor's holders, many of them years later): a master's or MBA, law or medicine, or a PhD.
export const gradSchool = () => ({ master: 0.15, professional: 0.05, phd: 0.02 });
export const master = () => { const g = gradSchool(); return g.master + g.professional + g.phd; };

// ---------- military service ----------
// The Vietnam-era draft (lotteries 1969–1972; the last inductions in 1972, the all-volunteer force from 1973) and
// enlistment since: about 12 % of young men in the 1970s–80s and about 7 % now, about 1.5 % of young women
// (Department of Defense accession figures, approximately). `draft` marks a man of draft age in the lottery years
// (era.js tells the lottery). p is the chance of serving at 18–22.
export function military(birthYear, year = birthYear + 18, sex = "male") {
  const y = yr(year);
  if (sex === "female") return { p: interp([[1970, 0.005], [1980, 0.012], [2000, 0.015]], y), draft: false, years: 4 };
  const draft = birthYear <= 1953 && y <= 1972;
  return { p: draft ? 0.3 : interp([[1973, 0.14], [1990, 0.12], [1995, 0.08], [2005, 0.075], [2020, 0.07]], y), draft, years: draft ? 2 : 4 };
}

// The chance that someone finishing high school in `year` enlists (the choice after graduation; story/core.js).
export const enlist = (sex, year) => military(year - 18, year, sex).p;

// ---------- work ----------
// One unit of pay is the median annual earnings of a full-time worker (BLS, usual weekly earnings, 2023: $1,117 a week,
// about $58,000 a year). Pay by age relative to it (BLS Current Population Survey, 2024 annual averages,
// approximately: 20–24 0.68, 25–34 0.94, 35–44 1.14, 45–54 1.16, 55–64 1.13, 65+ 1.03). Job finding, promotions and
// job changes are design parameters (median job tenure 3.9 years, 2.7 for ages 25–34: BLS 2024).
export const PAY_BY_AGE = [[17, 0.53], [22, 0.68], [30, 0.94], [40, 1.14], [50, 1.16], [60, 1.13], [68, 1.03]];
export const jobFind = age => (age < 18 ? 0.6 : 0.85);
export const promotion = age => interp([[23, 0.08], [35, 0.09], [50, 0.05], [64, 0.02]], age);
export const jobChange = age => interp([[22, 0.24], [30, 0.16], [40, 0.09], [55, 0.04]], age);
// Layoffs: about 3 % of workers a year in an ordinary year (design, after BLS Displaced Worker Surveys), nearly twice
// that in the recession years (NBER dates).
const RECESSIONS = new Set([1953, 1954, 1957, 1958, 1960, 1961, 1970, 1974, 1975, 1980, 1981, 1982, 1990, 1991, 2001, 2008, 2009, 2020]);
export const isRecession = year => RECESSIONS.has(yr(year));
export const layoff = year => 0.03 * (isRecession(year) ? 1.8 : 1);
// Retiring: Social Security from 62 (most claim between 62 and the full retirement age of 66–67); the average
// retirement age is about 62 (Gallup 2024) and labour-force participation falls from about 65 % at 55–64 to 19 % at 65+
// (BLS). Yearly chances by age (design, fitted to those).
export const retire = (age, sex) => (age < 55 ? 0 : age < 62 ? (sex === "female" ? 0.05 : 0.04) : age === 62 ? 0.22 : age < 65 ? 0.12 : age < 67 ? 0.28 : age < 70 ? 0.2 : 0.3);
// Social Security's national average wage index (1951 $2,799, 1960 $4,007, 1970 $6,186, 1980 $12,513, 1990 $21,028,
// 2000 $32,155, 2010 $41,674, 2020 $55,629, 2023 $66,622), for turning pay units into the dollars of a year; the
// median full-time earnings were about 0.87 of it in 2023. After 2023, wages grow 3.5 % a year (design).
const AWI = [[1951, 2799], [1955, 3301], [1960, 4007], [1965, 4659], [1970, 6186], [1975, 8631], [1980, 12513], [1985, 16823], [1990, 21028], [1995, 24706], [2000, 32155], [2005, 36953], [2010, 41674], [2015, 48099], [2020, 55629], [2021, 60575], [2022, 63795], [2023, 66622]];
export const MEDIAN_PAY_2023 = 58000;
export function dollars(units, year) {
  const y = Math.max(1951, year), w = y <= 2023 ? interp(AWI, y) : 66622 * Math.pow(1.035, y - 2023);
  return Math.round(units * MEDIAN_PAY_2023 * w / 66622);
}
// S&P 500 total returns by year (nominal, as commonly published, e.g. in Damodaran's historical returns table), for
// what an investment does in a year; other years take the long-run average of about 10 %.
const SP500 = { 1950: 31.7, 1951: 24.0, 1952: 18.4, 1953: -1.0, 1954: 52.6, 1955: 31.6, 1956: 6.6, 1957: -10.8, 1958: 43.4, 1959: 12.0, 1960: 0.5, 1961: 26.9, 1962: -8.7, 1963: 22.8, 1964: 16.5, 1965: 12.5, 1966: -10.1, 1967: 24.0, 1968: 11.1, 1969: -8.5, 1970: 4.0, 1971: 14.3, 1972: 19.0, 1973: -14.7, 1974: -26.5, 1975: 37.2, 1976: 23.8, 1977: -7.2, 1978: 6.6, 1979: 18.4, 1980: 32.4, 1981: -4.9, 1982: 21.4, 1983: 22.5, 1984: 6.3, 1985: 32.2, 1986: 18.5, 1987: 5.2, 1988: 16.8, 1989: 31.5, 1990: -3.1, 1991: 30.5, 1992: 7.6, 1993: 10.1, 1994: 1.3, 1995: 37.6, 1996: 23.0, 1997: 33.4, 1998: 28.6, 1999: 21.0, 2000: -9.1, 2001: -11.9, 2002: -22.1, 2003: 28.7, 2004: 10.9, 2005: 4.9, 2006: 15.8, 2007: 5.5, 2008: -37.0, 2009: 26.5, 2010: 15.1, 2011: 2.1, 2012: 16.0, 2013: 32.4, 2014: 13.7, 2015: 1.4, 2016: 12.0, 2017: 21.8, 2018: -4.4, 2019: 31.5, 2020: 18.4, 2021: 28.7, 2022: -18.1, 2023: 26.3, 2024: 25.0 };
export const marketReturn = year => (SP500[yr(year)] ?? 10) / 100;

// ---------- home and moves ----------
// Home ownership (Census Bureau, Housing Vacancies and Homeownership, 2024): 65.6 % of households; by the householder's
// age about 37 % under 35, 62 % at 35–44, 70 % at 45–54, 75 % at 55–64, 79 % at 65+. The median first-time buyer was 38
// in 2024 and about 30 through the 1980s–2000s (National Association of Realtors). Yearly chances (design, fitted to
// those); the down payment is in years of median pay (a typical first-time buyer puts down 6–9 % of a home costing
// about seven years of median pay, plus closing costs: design).
export const homeBuy = age => interp([[22, 0.03], [25, 0.07], [30, 0.11], [35, 0.11], [45, 0.08], [60, 0.04], [75, 0.01]], age);
export const DOWN_PAYMENT = 0.8;
// Moving to another state (Census Bureau, CPS mobility: about 3 % of people a year through the 1950s–80s, 2.5 % around
// 2000, 1.5 % from the 2010s; most for young adults): yearly chances by age and era (design, to those figures).
// Without a year, the era factor is left out (1).
export const move = (age, year = null) => interp([[18, 0.035], [25, 0.05], [35, 0.03], [50, 0.015], [70, 0.01]], age) * (year === null ? 1 : interp([[1950, 1.25], [1985, 1.15], [2000, 1.0], [2015, 0.7], [2024, 0.65]], yr(year)));
// Working abroad: about 3 million Americans live abroad (State Department estimates), a small yearly chance (design).
export const abroad = age => interp([[22, 0.004], [30, 0.006], [40, 0.004], [50, 0.002]], age);
