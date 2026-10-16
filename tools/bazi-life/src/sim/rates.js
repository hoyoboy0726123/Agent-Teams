// 台灣統計：模擬裡每件事的基礎機率（一年內發生的機率）。
//
// Sources are named next to each table. Several official tables (single-age death probabilities, cancer
// incidence by age) could not be opened from the build environment, so those curves are FITTED: their shape is a
// stated assumption and their level is solved to reproduce the official totals named beside them.
// Where no official statistic exists at all (dating, breakups, promotions), the value is a design parameter,
// marked "design", and is tuned so the population results match the official figures that do exist.

export const PROVISIONAL = true;   // family, education and work tables still to be replaced with sourced values

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
const logInterp = (points, x) => Math.exp(interp(points.map(([a, b]) => [a, Math.log(b)]), x));

// ---------- mortality ----------
// 內政部 114 年（2025）簡易生命表：life expectancy at birth, male 77.93, female 84.75 (2024: 77.42, 84.30).
// The single-age qx could not be read, so q(x) comes from a Gompertz–Makeham curve with a fixed shape
// (assumption below) whose level is solved to reproduce each year's life expectancy exactly.
const SHAPE = {
  male: { q0: 0.0045, child: 0.00016, makeham: 0.0005, slope: 0.093, hump: 0.0004 },
  female: { q0: 0.0038, child: 0.00012, makeham: 0.00025, slope: 0.105, hump: 0 },
};
// Anchors: 內政部 簡易生命表 (1971, 2000, 2024, 2025) and 國發會 人口推估 2024–2070 medium variant (2070).
// Years before 1971 use the 1971 table; years in between are interpolated.
export const LIFE_EXPECTANCY = {
  male: [[1971, 67.19], [2000, 73.8], [2024, 77.42], [2025, 77.93], [2070, 84.41]],
  female: [[1971, 72.08], [2000, 79.6], [2024, 84.30], [2025, 84.75], [2070, 90.52]],
};
const MAX = 120;

function hazards(sex, level) {
  const s = SHAPE[sex], mu = new Float64Array(MAX + 1);
  for (let x = 0; x <= MAX; x++) {
    if (x === 0) mu[x] = -Math.log(1 - s.q0);
    else if (x < 15) mu[x] = s.child + level * Math.exp(s.slope * x);
    else mu[x] = s.makeham + level * Math.exp(s.slope * x) + (x >= 17 && x <= 35 ? s.hump : 0);
  }
  return mu;
}
export function expectancy(q) {
  let l = 1, e = 0;
  for (let x = 0; x < q.length; x++) { const d = l * q[x]; e += l - d / 2; l -= d; }
  return e;
}
const toQ = (mu, k = 1) => Array.from(mu, (m, x) => (x === MAX ? 1 : 1 - Math.exp(-m * k)));

// Level for the reference shape that gives the target life expectancy.
function solveLevel(sex, target) {
  let lo = 1e-7, hi = 1e-3;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    if (expectancy(toQ(hazards(sex, mid))) > target) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}
const tables = new Map();
export function lifeTable(sex, year) {
  const target = interp(LIFE_EXPECTANCY[sex], year);
  const key = `${sex}:${target.toFixed(3)}`;
  if (!tables.has(key)) tables.set(key, toQ(hazards(sex, solveLevel(sex, target))));
  return tables.get(key);
}
// Probability of dying within the year at `age`, from the period table of calendar year `year`.
export const deathRaw = (age, sex, year) => lifeTable(sex, year)[Math.min(MAX, Math.max(0, Math.round(age)))];

// ---------- serious illness: cancer, stroke, heart attack ----------
// 國健署 112 年（2023）癌症登記：138,051 new cases; age-standardised incidence (WHO 2000 standard population)
// 350.8 per 100,000 for men, 318.9 for women; median age at diagnosis 65. Incidence by age could not be read, so
// the age curve below is an assumed shape (women higher at 30–55 from breast and thyroid cancer, men higher
// after 60) scaled to those standardised rates.
// Stroke: about 30,000–50,000 new cases a year (健保署); heart attack: age-standardised about 57 per 100,000
// (健保 2013). Both are folded in with an assumed steeper age curve.
const WHO_STANDARD = [[0, 8.86], [5, 8.69], [10, 8.60], [15, 8.47], [20, 8.22], [25, 7.93], [30, 7.61], [35, 7.15], [40, 6.59], [45, 6.04], [50, 5.37], [55, 4.55], [60, 3.72], [65, 2.96], [70, 2.21], [75, 1.52], [80, 0.91], [85, 0.63]];
const CANCER_SHAPE = {
  male: [[0, 0.012], [15, 0.014], [25, 0.03], [35, 0.07], [45, 0.22], [55, 0.55], [65, 1.1], [75, 1.55], [85, 1.75], [100, 1.8]],
  female: [[0, 0.012], [15, 0.016], [25, 0.05], [35, 0.15], [45, 0.38], [55, 0.6], [65, 0.8], [75, 1.05], [85, 1.25], [100, 1.3]],
};
const CANCER_ASR = { male: 350.8e-5, female: 318.9e-5 };
const VASCULAR_SHAPE = [[0, 0.00002], [30, 0.00008], [45, 0.0006], [55, 0.0015], [65, 0.0035], [75, 0.0075], [85, 0.013], [100, 0.016]];
const cancerScale = Object.fromEntries(["male", "female"].map(sex => {
  const asr = WHO_STANDARD.reduce((s, [a, w]) => s + w / 100 * logInterp(CANCER_SHAPE[sex], a + 2), 0);
  return [sex, CANCER_ASR[sex] / asr];
}));
export function cancerIncidence(age, sex) { return cancerScale[sex] * logInterp(CANCER_SHAPE[sex], age); }
export function vascularIncidence(age, sex) { return logInterp(VASCULAR_SHAPE, age) * (sex === "male" ? 1.25 : 0.75); }
export const serious = (age, sex) => clamp01(cancerIncidence(age, sex) + vascularIncidence(age, sex));
export function seriousType(age, sex, rng) {
  const c = cancerIncidence(age, sex), v = vascularIncidence(age, sex);
  if (rng() < c / (c + v)) return "癌症";
  return rng() < 0.6 ? "中風" : "心臟病";
}
// Extra probability of dying in the k-th year after diagnosis (design, from typical survival: about 60 % of cancer
// patients alive after five years, 15–20 % of stroke and heart-attack patients dying within a year). Cancers found
// in younger women (breast, thyroid) and younger men survive far more often, so cancer fatality scales with age.
const FATALITY = { 癌症: [0.15, 0.1, 0.07, 0.05, 0.04], 中風: [0.17, 0.06, 0.05, 0.04, 0.04], 心臟病: [0.14, 0.05, 0.04, 0.04, 0.03] };
const CANCER_AGE = { male: [[30, 0.6], [55, 0.8], [70, 1], [80, 1.15]], female: [[30, 0.3], [55, 0.45], [70, 0.9], [80, 1.1]] };
export function seriousFatality(type, years, checkups, diagnosedAt = 70, sex = "male") {
  const f = FATALITY[type][Math.min(4, Math.max(0, years))];
  if (type !== "癌症") return f;
  return f * interp(CANCER_AGE[sex], diagnosedAt) * (checkups ? 0.75 : 1);
}

// Chronic disease (high blood pressure or diabetes): onset per year (design until the prevalence survey is in).
export const chronic = (age, sex) => clamp01(interp([[30, 0.004], [40, 0.012], [50, 0.025], [60, 0.04], [70, 0.05], [85, 0.05]], age) * (sex === "male" ? 1.1 : 0.9));
export const CHRONIC_HR = 1.3;

// The life table already includes deaths from serious illness and the extra risk of chronic disease, so the
// healthy baseline is the table minus those. A small Markov chain over the states the simulation uses (healthy,
// or k years after a diagnosis; with or without chronic disease) solves, age by age, for the baseline that makes
// the population's expected death probability equal the table.
const CHECKUP_SHARE = 0.55;   // matches the auto policy for the 40-year health check choice in events.js
function fatalityAt(sex, diagnosedAt, k) {
  const c = cancerIncidence(diagnosedAt, sex), v = vascularIncidence(diagnosedAt, sex), cancerShare = c / (c + v);
  const cancer = FATALITY.癌症[k] * interp(CANCER_AGE[sex], diagnosedAt) * (diagnosedAt >= 40 ? 1 - 0.25 * CHECKUP_SHARE : 1);
  return cancerShare * cancer + (1 - cancerShare) * (0.6 * FATALITY.中風[k] + 0.4 * FATALITY.心臟病[k]);
}
const baselines = new Map();
function baseline(sex, year) {
  const key = `${sex}:${interp(LIFE_EXPECTANCY[sex], year).toFixed(3)}`;
  if (baselines.has(key)) return baselines.get(key);
  const q = lifeTable(sex, year), out = new Array(q.length);
  // fractions of the living population: [chronic? 0/1][state], state 0 = not ill, 1..5 = ill in year k = state-1
  let pop = [[1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
  for (let x = 0; x < q.length; x++) {
    // events within the year: recovery after five years, new diagnoses, new chronic disease
    const inc = serious(x, sex), chr = chronic(x, sex);
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
      if (st >= 1 && st <= 5) illDeaths += share * fatalityAt(sex, x - (st - 1), st - 1);
    }
    const total = next[0].reduce((a, b) => a + b, 0) + next[1].reduce((a, b) => a + b, 0);
    const b = Math.max(0.25 * q[x], (q[x] * total - illDeaths) / weight);
    out[x] = b;
    for (const c of [0, 1]) for (let st = 0; st < 6; st++) {
      const die = Math.min(1, b * (c ? CHRONIC_HR : 1) + (st >= 1 && st <= 5 ? fatalityAt(sex, x - (st - 1), st - 1) : 0));
      next[c][st] *= 1 - die;
    }
    const alive = next[0].reduce((a, b2) => a + b2, 0) + next[1].reduce((a, b2) => a + b2, 0);
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
export const proposal = (age, sex, year, marriages) => interp(sex === "female" ? [[18, 0.025], [22, 0.13], [25, 0.26], [28, 0.34], [32, 0.28], [37, 0.18], [45, 0.09], [60, 0.04]] : [[20, 0.02], [24, 0.1], [27, 0.22], [30, 0.31], [34, 0.26], [39, 0.16], [48, 0.08], [60, 0.04]], age) * (marriages ? 0.6 : 1);

// ---------- divorce ----------
// 內政部 2024: 10.5 divorces per 1,000 married people a year; median length of marriage at divorce 8.3 years;
// 33.6 % of divorces within 5 years and 23.6 % at 5–9 years. The duration curve is tuned by
// test/calibration.test.js. Later and earlier years scale with the crude divorce rate (1996 1.67, 2003 2.87,
// 2010 2.51, 2023 2.18, 2024 2.28, 2025 2.23 per 1,000); years before 1996 use 1996.
const DIVORCE_TREND = [[1996, 1.67], [2003, 2.87], [2010, 2.51], [2023, 2.18], [2024, 2.28], [2025, 2.23]];
const DIVORCE_BY_YEARS = [[0, 0.017], [2, 0.03], [5, 0.021], [9, 0.013], [15, 0.009], [25, 0.005], [40, 0.003]];
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
