// 台灣統計：模擬裡每件事的基礎機率（一年內發生的機率）。
//
// Sources are named next to each table. Death, serious illness and 三高 come from official tables by single age
// or age group (official-data.js, made by scripts/official-stats.py: 內政部 life tables, 衛生福利部 死因統計 and
// 健保醫療統計); how an illness unfolds after its diagnosis is a stated design (FATALITY) whose level is checked
// against 國健署's cancer registry. Where no official statistic exists at all (dating, breakups, promotions), the
// value is a design parameter, marked "design", and is tuned so the population results match the official figures
// that do exist.
import { LIFE_TABLES, CAUSE_AGES, CAUSE_SHARES, CHRONIC_AGES, CHRONIC_RATES } from "./official-data.js";

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

// ---------- mortality ----------
// 內政部「簡易生命表」(全國): the probability of dying at each single age 0–84 for every year from 1970 to 2025,
// and the 1956–58 and 1966–67 tables before that. A year between two tables takes q(x) log-linearly between them;
// years before 1957 use the 1956–58 table.
// Ages 85 and over: the tables end with an open 85+ group, so a Kannisto curve (the old-age model the Human
// Mortality Database uses) continues each table, its slope from ages 75–84 and its level set so that the remaining
// life expectancy at 85 is the table's own; each table then gives back its official life expectancy at birth.
// Years after 2025: 國發會 人口推估 (2024–2070, medium variant) puts life expectancy at birth in 2070 at 84.41 (men)
// and 90.52 (women). The 2025 table's hazards are scaled to reach the straight line from 2025 to 2070.
const MAX = 120, OPEN = 85;
const FIRST = LIFE_TABLES[0][0], LAST = LIFE_TABLES[LIFE_TABLES.length - 1][0];
export const LATEST_TABLE_YEAR = LAST;
const E0_2070 = { male: 84.41, female: 90.52 };
const COLUMN = { male: 1, female: 2 };
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

export function expectancy(q) {
  let l = 1, e = 0;
  for (let x = 0; x < q.length; x++) { const d = l * q[x]; e += l - d / 2; l -= d; }
  return e;
}

// The official q(0..84) and remaining life expectancy at 85 for a calendar year.
function officialAt(sex, year) {
  const c = COLUMN[sex], s = c - 1, q = t => t[c].map(v => Math.max(v, 1) / 1e6);
  if (year <= FIRST) return { q: q(LIFE_TABLES[0]), e85: LIFE_TABLES[0][4][s] };
  const k = LIFE_TABLES.findIndex(t => t[0] >= year), b = LIFE_TABLES[k];
  if (b[0] === year) return { q: q(b), e85: b[4][s] };
  const a = LIFE_TABLES[k - 1], w = (year - a[0]) / (b[0] - a[0]), qa = q(a), qb = q(b);
  return { q: qa.map((v, x) => Math.exp((1 - w) * Math.log(v) + w * Math.log(qb[x]))), e85: a[4][s] + w * (b[4][s] - a[4][s]) };
}

// q(85..MAX) from a Kannisto hazard μ(x) = a·e^{b(x−85)} / (1 + a·e^{b(x−85)}): b from the logit of the hazard at
// ages 75–84, a so that the life expectancy at 85 is e85.
function oldAges(q, e85) {
  const xs = [], ys = [];
  for (let x = 75; x < OPEN; x++) { const mu = -Math.log(1 - q[x]); xs.push(x + 0.5 - OPEN); ys.push(Math.log(mu / (1 - mu))); }
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
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (expectancy(tail(mid)) > e85) lo = mid; else hi = mid; }
  return tail((lo + hi) / 2);
}

// A year after the last table: its hazards scaled by k (q' = 1 − (1 − q)^k) to the projected life expectancy.
function projected(sex, year) {
  const base = lifeTable(sex, LAST);
  const target = interp([[LAST, expectancy(base)], [2070, E0_2070[sex]]], year);
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
    else { const t = officialAt(sex, y); q = Float64Array.from([...t.q, ...oldAges(t.q, t.e85)]); }
    tables.set(key, q);
  }
  return tables.get(key);
}
// Probability of dying within the year at `age`, from the period table of calendar year `year`.
export const deathRaw = (age, sex, year) => lifeTable(sex, year)[Math.min(MAX, Math.max(0, Math.round(age)))];

// ---------- serious illness: cancer, stroke, heart disease ----------
// How many people die of each, at each age, is official: the life table's q(x) times that cause's share of all
// deaths at the age in 死因統計 (衛生福利部統計處: 惡性腫瘤, 腦血管疾病, 心臟疾病（高血壓性疾病除外）; three years
// pooled around each anchor year, the shares running straight between the age groups' middles and between the
// anchor years, and held outside them). In the story such an illness is diagnosed first and kills, if it does,
// within five years (FATALITY, from typical survival: 15–20 % of stroke and heart patients die in the first year);
// so the diagnoses at an age are the deaths a year older divided by the five-year case fatality.
// Cancer: its fatality is FATALITY.癌症 × e^(α + β·(age at diagnosis − 65)/10) for each sex (CANCER_FATALITY), with
// α and β solved by scripts/cancer-fatality.mjs so that the 2023 diagnoses reproduce 國健署's cancer registry:
// age-standardised (WHO 2000 standard population) 350.8 per 100,000 men and 318.9 per 100,000 women, and 71,244 and
// 66,807 new cases (with the 2024 mid-year population; 衛生福利部 press release on the 112年 癌症登記報告; the
// registry's median age at diagnosis, 65, is checked in test/official-data.test.js). Younger patients survive far
// more often, and a regular health check lowers the fatality by a quarter (design).
export const WHO_STANDARD = [[0, 8.86], [5, 8.69], [10, 8.60], [15, 8.47], [20, 8.22], [25, 7.93], [30, 7.61], [35, 7.15], [40, 6.59], [45, 6.04], [50, 5.37], [55, 4.55], [60, 3.72], [65, 2.96], [70, 2.21], [75, 1.52], [80, 0.91], [85, 0.63]];
export const CANCER_2023 = { asr: { male: 350.8e-5, female: 318.9e-5 }, cases: { male: 71244, female: 66807 }, median: 65 };
const FATALITY = { 癌症: [0.15, 0.1, 0.07, 0.05, 0.04], 中風: [0.17, 0.06, 0.05, 0.04, 0.04], 心臟病: [0.14, 0.05, 0.04, 0.04, 0.03] };
export const CANCER_FATALITY = { male: [0.5374, 0.2696], female: [0.1, 0.4262] };   // [α, β], scripts/cancer-fatality.mjs
const CAUSE = { 癌症: "cancer", 中風: "stroke", 心臟病: "heart" };
export const SERIOUS_TYPES = Object.keys(CAUSE);
const CHECKUP_SHARE = 0.55;   // matches the auto policy for the 40-year health check choice (checkups in story/core.js)
const MIDDLES = CAUSE_AGES.map((a, i) => (i + 1 < CAUSE_AGES.length ? (a + CAUSE_AGES[i + 1]) / 2 : a + 2));

// The cause's share of all deaths at `age` in `year`.
export function causeShare(type, age, sex, year) {
  const at = rec => interp(MIDDLES.map((m, g) => [m, rec[1][sex][CAUSE[type]][g] / 1e4]), age);
  const k = CAUSE_SHARES.findIndex(r => r[0] >= year);
  if (k === -1) return at(CAUSE_SHARES[CAUSE_SHARES.length - 1]);   // after the last anchor year
  if (k === 0) return at(CAUSE_SHARES[0]);                         // before the first
  const a = CAUSE_SHARES[k - 1], b = CAUSE_SHARES[k], w = (year - a[0]) / (b[0] - a[0]);
  return (1 - w) * at(a) + w * at(b);
}
// The yearly fatality k years after a diagnosis at `age`, with or without a regular health check (`checkups`, or
// null for the population's mix from 40 on).
function fatality(type, k, age, sex, checkups) {
  const f = FATALITY[type][Math.min(4, Math.max(0, k))];
  if (type !== "癌症") return f;
  const check = checkups === null ? (age >= 40 ? 1 - 0.25 * CHECKUP_SHARE : 1) : checkups ? 0.75 : 1;
  const [a, b] = CANCER_FATALITY[sex];
  return Math.min(0.9, f * Math.exp(a + b * (age - 65) / 10) * check);
}
function caseFatality(type, age, sex) {
  let alive = 1;
  for (let k = 0; k < 5; k++) alive *= 1 - fatality(type, k, age, sex, null);
  return 1 - alive;
}
// New diagnoses a year at each age 0..MAX in `year`: the cause's deaths a year older over the five-year case
// fatality. Kept per type, sex and year (the simulation asks every year of every life).
const incidences = new Map();
function incidenceTable(type, sex, year) {
  const key = `${type}:${sex}:${year}:${CANCER_FATALITY[sex]}`;
  let out = incidences.get(key);
  if (!out) {
    out = new Float64Array(MAX + 1);
    for (let x = 0; x <= MAX; x++) out[x] = deathRaw(x + 1, sex, year) * causeShare(type, x + 1, sex, year) / caseFatality(type, x, sex);
    incidences.set(key, out);
  }
  return out;
}
export const incidence = (type, age, sex, year) => incidenceTable(type, sex, Math.round(year))[Math.min(MAX, Math.max(0, Math.round(age)))];
export const serious = (age, sex, year) => clamp01(incidence("癌症", age, sex, year) + incidence("中風", age, sex, year) + incidence("心臟病", age, sex, year));
export function seriousType(age, sex, year, rng) {
  const w = SERIOUS_TYPES.map(t => incidence(t, age, sex, year)), total = w.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return SERIOUS_TYPES[i]; }
  return SERIOUS_TYPES[w.length - 1];
}
// Extra probability of dying in the k-th year after the diagnosis.
export const seriousFatality = (type, years, checkups, diagnosedAt = 70, sex = "male") => fatality(type, years, diagnosedAt, sex, !!checkups);

// ---------- 三高: high blood pressure or diabetes ----------
// 健保 2024 (全民健康保險醫療統計 表1): people treated for 高血壓性疾病 or 糖尿病 per 100,000 at each age (either one,
// taking the two as independent; straight between the age groups' middles). The share treated rises with age, and
// the yearly onset is that rise over the share not yet treated. From 75 on the share stops rising (those treated
// die sooner), so the onset stays at its level at 75.
const CHRONIC_MIDDLES = CHRONIC_AGES.map((a, i) => (i + 1 < CHRONIC_AGES.length ? (a + CHRONIC_AGES[i + 1]) / 2 : a + 2.5));
const chronicShare = (age, sex) => {
  const r = CHRONIC_RATES[sex], at = rates => interp(CHRONIC_MIDDLES.map((m, g) => [m, rates[g] / 1e5]), age);
  return 1 - (1 - at(r.hypertension)) * (1 - at(r.diabetes));
};
const ONSET = Object.fromEntries(["male", "female"].map(sex => {
  const out = [];
  for (let x = 0; x <= MAX; x++) {
    const a = Math.min(x, 75), p = chronicShare(a, sex);
    out.push(Math.max(0, (chronicShare(a + 1, sex) - p) / (1 - p)));
  }
  return [sex, out];
}));
export const chronic = (age, sex) => ONSET[sex][Math.min(MAX, Math.max(0, Math.round(age)))];
export const CHRONIC_HR = 1.3;

// The life table already includes deaths from serious illness and the extra risk of chronic disease, so the
// healthy baseline is the table minus those. A small Markov chain over the states the simulation uses (healthy,
// or k years after a diagnosis; with or without chronic disease) solves, age by age, for the baseline that makes
// the population's expected death probability equal the table.
// The fatality k years after a diagnosis at `diagnosedAt`, averaged over the three illnesses as they are diagnosed
// in `year`: [age][k], kept per sex and year.
const fatalities = new Map();
function fatalityTable(sex, year) {
  const key = `${sex}:${year}:${CANCER_FATALITY[sex]}`;
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
    // events within the year: recovery after five years, new diagnoses, new chronic disease
    const inc = serious(x, sex, Math.round(year)), chr = chronic(x, sex);
    const next = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
    for (const c of [0, 1]) {
      const healthy = pop[c][0] + pop[c][5];               // state 5 = ill for 5 years → recovered this year
      next[c][1] += healthy * inc; next[c][0] += healthy * (1 - inc);
      for (let k = 1; k < 5; k++) next[c][k + 1] += pop[c][k];
    }
    for (let st = 0; st < 6; st++) { const move = next[0][st] * chr; next[0][st] -= move; next[1][st] += move; }
    // deaths at the end of the year
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
export const death = (age, sex, year) => baseline(sex, year)[Math.min(MAX, Math.max(0, Math.round(age)))];

// ---------- tests can freeze the calendar to check calibration against one year's statistics ----------
let frozenYear = null;
export const freezeYear = y => { frozenYear = y; };
const yr = year => (frozenYear === null ? year : frozenYear);

// ---------- births ----------
// Total fertility rate by year: 內政部 (1951 7.04, 1961 5.59, 1971 3.71, 1981 2.46, 1984 2.06, 2010 0.90, 2023 0.87),
// 行政院 國情簡介 (2024 0.885), 2025 0.695, and 國發會 2026–2075 medium projection (2026 0.64, 2034 0.55, 2050 0.6,
// 2060 0.78, 2075 0.8). Years between anchors are interpolated (1985–2009 has no anchor here, so it is rough).
export const TFR = [[1951, 7.04], [1955, 6.53], [1961, 5.59], [1970, 4.0], [1971, 3.71], [1981, 2.46], [1984, 2.06], [2010, 0.9], [2023, 0.87], [2024, 0.885], [2025, 0.695], [2026, 0.64], [2034, 0.55], [2050, 0.6], [2060, 0.78], [2075, 0.8]];
// Age pattern of births, per woman per year, 2024: 25–29 0.042, 30–34 0.064, 35–39 0.041 (內政部). The other
// age groups were not available and are fitted so the rates add up to the 2024 total fertility rate.
const ASFR_2024 = [[15, 0.003], [20, 0.014], [25, 0.042], [30, 0.064], [35, 0.041], [40, 0.012], [45, 0.001], [50, 0]];
const asfr = age => (age < 15 || age >= 50 ? 0 : ASFR_2024.reduce((v, [a, r]) => (age >= a ? r : v), 0));
// Births happen to married couples in the simulation, so the rate per married woman is the population rate
// divided by the share of women who are married at that age; MARRIED_SHARE and PARITY are tuned by
// test/calibration.test.js to reproduce the 2024 total fertility rate.
const MARRIED_SHARE = [[18, 0.03], [22, 0.12], [26, 0.32], [30, 0.5], [34, 0.62], [38, 0.68], [45, 0.7], [50, 0.7]];
const PARITY = [2.1, 1.75, 0.8, 0.45, 0.22];
export const birth = (motherAge, parity, year) => clamp01(asfr(Math.round(motherAge)) / interp(MARRIED_SHARE, motherAge) * PARITY[Math.min(4, parity)] * interp(TFR, yr(year)) / 0.885);
export function siblings(birthYear, rng) {
  const tfr = interp(TFR, birthYear);
  let n = 0;
  for (let i = 1; i < 8; i++) if (rng() < Math.min(0.95, Math.max(0, tfr - 1) / i)) n++;
  const older = Math.floor(rng() * (n + 1));
  return { older, younger: n - older };
}

// ---------- marriage ----------
// 內政部 2024: mean age at first marriage, men 33.1, women 31.1; 2020 (主計總處): 42.2 % of men aged 35–39 never
// married. No official dating statistics exist, so dating, breakups and proposals are design parameters tuned by
// test/calibration.test.js to reproduce those figures. Historical marriage ages were not available, so every
// period uses today's timing.
export const dating = (age, rel) => (rel === "single" ? interp([[17, 0.1], [22, 0.26], [30, 0.3], [40, 0.18], [55, 0.08], [70, 0.03]], age) : interp([[30, 0.2], [45, 0.12], [60, 0.05], [75, 0.02]], age));
export const breakup = age => interp([[18, 0.4], [25, 0.3], [35, 0.25], [50, 0.2]], age);
// Fitted so the simulated first marriages match 2024: mean age 31.1 (women) and 33.1 (men), 42 % of men unmarried at 35–39.
export const proposal = (age, sex, year, marriages) => interp(sex === "female" ? [[18, 0.035], [22, 0.18], [25, 0.31], [27, 0.35], [30, 0.29], [35, 0.18], [45, 0.09], [60, 0.04]] : [[20, 0.025], [24, 0.11], [27, 0.23], [30, 0.28], [34, 0.22], [39, 0.14], [48, 0.065], [60, 0.03]], age) * (marriages ? 0.6 : 1);

// ---------- divorce ----------
// 內政部 2024: 10.5 divorces per 1,000 married people a year; median length of marriage at divorce 8.3 years;
// 33.6 % of divorces within 5 years and 23.6 % at 5–9 years. The duration curve is tuned by
// test/calibration.test.js. Later and earlier years scale with the crude divorce rate (1996 1.67, 2003 2.87,
// 2010 2.51, 2023 2.18, 2024 2.28, 2025 2.23 per 1,000); years before 1996 use 1996.
const DIVORCE_TREND = [[1996, 1.67], [2003, 2.87], [2010, 2.51], [2023, 2.18], [2024, 2.28], [2025, 2.23]];
// By years married, from the first year after the wedding (story/core.js has no divorce in the wedding year itself);
// fitted with the crisis choices so a third of divorces come within five years and a quarter at 5–9.
const DIVORCE_BY_YEARS = [[1, 0.032], [2, 0.036], [5, 0.024], [9, 0.014], [15, 0.0085], [25, 0.005], [40, 0.003]];
export const divorce = (years, year) => interp(DIVORCE_BY_YEARS, years) * interp(DIVORCE_TREND, yr(year)) / 2.28;
export const crisis = years => interp([[0, 0.03], [3, 0.06], [10, 0.04], [25, 0.02]], years);

// ---------- education ----------
// 教育部 113 學年度: 96.7 % of general high school graduates and 84.6 % of vocational graduates go on to study.
// 19.9 % of daytime bachelor's graduates (2010–2012 cohorts) went on to a master's (教育部 2016 report).
// Nine-year compulsory education started in 1968. Historical continuation rates were not available, so earlier
// periods use today's rates except for junior high before 1968 (design value).
export const kindergarten = () => 0.95;   // design
export const juniorHigh = year => (year >= 1968 ? 1 : 0.6);
export const seniorHigh = () => ({ 高中: 0.58, 高職: 0.36, 五專: 0.05, 就業: 0.01 });   // design
export const college = (year, track) => (track === "高中" ? 0.967 : 0.846);
export const master = () => 0.199;

// ---------- military service (男性) ----------
// By the year of service: 2 years before 2000, stepping down to 1 year by 2008; 4 months of training for men born
// 1994 or later until 2023; 1 year from 2024. (From the conscription history; to be checked against 役政署.)
export function military(birthYear, year = birthYear + 22) {
  if (year >= 2024 && birthYear >= 1994) return { months: 12, text: "入伍當兵一年，在營區度過了好多個站哨的夜晚。" };
  if (birthYear >= 1994) return { months: 4, text: "去當了四個月的兵，學會在五分鐘內整理好內務。" };
  if (year >= 2008) return { months: 12, text: "入伍當兵一年，交到幾個一輩子的朋友。" };
  if (year >= 2000) return { months: 18, text: "入伍當兵一年多，退伍那天把軍帽丟得好高。" };
  return { months: 24, text: "入伍當了兩年兵，在部隊裡交到一輩子的朋友。" };
}

// ---------- work ----------
// 主計總處 2024: median annual total salary NT$546,000; by age, under 30 468,000, 30–39 581,000, 40–49 620,000,
// 50–64 579,000, 65+ 439,000 (the curve below is these divided by the overall median).
// Unemployment 3.35 % (2025). Retirement: labour insurance old-age benefits start on average at 61.5 (men 61.7,
// women 61.4, 2025); people leave the labour market on average at 64.3 (men) and 61.4 (women). Job finding,
// promotions, job changes and layoffs are design parameters.
export const PAY_BY_AGE = [[20, 0.78], [27, 0.86], [35, 1.06], [45, 1.14], [57, 1.06], [65, 0.8]];
export const jobFind = age => (age < 18 ? 0.6 : 0.85);
export const promotion = age => interp([[23, 0.07], [35, 0.09], [50, 0.05], [64, 0.02]], age);
export const jobChange = age => interp([[22, 0.18], [30, 0.12], [40, 0.07], [55, 0.03]], age);
export const layoff = () => 0.025;
export const retire = (age, sex) => (sex === "female"
  ? (age >= 65 ? 0.7 : age >= 60 ? 0.24 : age >= 55 ? 0.06 : 0)
  : (age >= 65 ? 0.6 : age >= 60 ? 0.07 : age >= 55 ? 0.02 : 0));

// ---------- home and moves ----------
// 主計總處 2024: 84.4 % of households own their home (about 90 % counting homes owned by close family).
// 內政部 2024: 76.1 moves per 1,000 people (all kinds); about 46 % of people moving in came from another
// county. 主計總處 2024: 666,000 Taiwanese work overseas. The probabilities below are tuned to those figures.
export const homeBuy = age => interp([[25, 0.1], [32, 0.24], [45, 0.2], [60, 0.1]], age);
export const DOWN_PAYMENT = 2;   // years of median pay (design)
export const move = age => interp([[18, 0.05], [25, 0.06], [35, 0.04], [50, 0.02], [70, 0.01]], age);
export const abroad = age => interp([[22, 0.015], [30, 0.025], [40, 0.02], [50, 0.008]], age);
