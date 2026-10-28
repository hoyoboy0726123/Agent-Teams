// Calibration: with no chart at all, a population of auto-played lives born 1950–2000 must reproduce the US statistics
// that rates.js cites (us-rates.js), cohort by cohort; and with random charts the population must stay where it is,
// because every chart's luck is centred on its own lifetime (PLAN.md, "The seam").
//
//   npm test                 the quick run: 2,000 lives without a chart and 1,000 with one (the same people and seeds,
//                            five lives per chart), spread over worker threads; pooled checks with tolerances of about
//                            three standard errors
//   CAL=full npm test        20,000 + 10,000 lives: every check by sex and birth cohort, tighter (minutes)
//   CAL=fit node --test test/calibration.test.js
//                            also measures the birth exposures (rates.js EXPOSURE) on 16,000 women and prints the
//                            table for rates.js (run it again after changing marriage, divorce or the family events)
//
// The targets are us-rates.js tables, read for each simulated person's own birth year (or the calendar year of the
// event), so a check compares the simulated mean with the mean of the official figure over the same people.
import { Worker, isMainThread, workerData, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";

const SRC = new URL("../src/", import.meta.url);
const imp = path => import(new URL(path, SRC).href);
const [seam, L, R, D, S, A, RNG, STORY] = await Promise.all(["sim/seam.js", "sim/life.js", "sim/rates.js", "data/us-rates.js", "sim/setup.js", "astro/index.js", "sim/rng.js", "sim/story/index.js"].map(imp));

const MODE = process.env.CAL === "full" ? "full" : process.env.CAL === "fit" ? "fit" : "quick";
const PLAN = MODE === "full" ? { plain: 20000, chart: 10000 } : { plain: 2000, chart: 1000 };
const PER_CHART = 5, YEARS = [1950, 2000], SEED = 610000;
const EDU = { none: "lt", elementary: "lt", middle: "lt", high: "hs", ged: "hs", certificate: "hs", associate: "associate", bachelor: "bachelor", master: "graduate", professional: "graduate", doctorate: "graduate" };

// Person `unit` of the plan: sex, birth year and a birth input (the chart run uses it; five lives share one chart).
function person(unit) {
  const r = RNG.makeRng(((SEED + unit * 7919) ^ 0x9e3779b9) >>> 0);
  r(); r();
  const sex = r() < 0.5 ? "male" : "female", by = YEARS[0] + Math.floor(r() * (YEARS[1] - YEARS[0] + 1));
  const place = A.ALL_PLACES[Math.floor(r() * A.ALL_PLACES.length)];
  return { sex, by, input: { date: { y: by, m: 1 + Math.floor(r() * 12), d: 1 + Math.floor(r() * 28) }, time: { h: Math.floor(r() * 24), mi: Math.floor(r() * 60) }, place, sex } };
}

// One life, reduced to what the checks need.
function live(prep, sex, by, seed) {
  const life = L.createLife({ prep, sex, birthYear: by, seed, auto: true });
  const s = life.state, luck = prep.luck;
  const r = { sex, by, births: [], q: 0, qv: 0, qt: 0 };
  let kids = 0;
  while (!life.done) {
    const a = s.age, y = s.year;
    life.step();
    for (let i = kids; i < s.kids.length; i++) if (s.kids[i].age <= 1) r.births.push([y, a, s.rel === "married" ? 1 : 0]);
    kids = s.kids.length;
    // The year's chance of dying as life.js computes it, and the life table's, for the mortality checks.
    const sv = s.health.serious;
    const ill = sv ? R.seriousFatality(sv.type, a - sv.since, s.health.checkups, sv.since, s.sex) : 0;
    const q = a >= L.MAX_AGE ? 1 : seam.tilt(Math.min(0.999, R.death(a, sex, y) * s.health.hr + ill), a > 0 ? luck[a].m.health.bad : 0);
    r.q += q; r.qv += q * (1 - q); r.qt += R.deathRaw(a, sex, y);
    if (a === 30) { r.edu30 = EDU[s.edu] || "lt"; r.attended = s.flags.uniAt !== undefined || s.flags.ccAt !== undefined; }
    if (a === 45) r.edu45 = EDU[s.edu] || "lt";
    if (a === 35 && s.alive) r.own35 = s.home === "own" ? 1 : 0;
    if (a === 50 && s.alive) r.own50 = s.home === "own" ? 1 : 0;
    if (s.retired && r.retire === undefined) { r.retire = a; r.delay = !!s.flags.ssDelay; }
  }
  const first = s.spells[0];
  Object.assign(r, { death: s.age, diedOf: s.health.diedOf || null, served: s.flags.served ? 1 : 0, married: first ? first.from : null, mEnd: first ? first.end : null, mTo: first ? first.to ?? s.age : null });
  return r;
}

function runChunk({ kind, from, to }) {
  const out = [];
  let unit = -1, p = null, prep = null;
  for (let i = from; i < to; i++) {
    const u = Math.floor(i / PER_CHART);
    if (u !== unit) { unit = u; p = person(u); prep = kind === "chart" ? S.prepare(p.input) : seam.neutralPrep(p.input); }
    out.push(live(prep, p.sex, p.by, SEED + i));
  }
  return out;
}

// CAL=fit: the PARITY-weighted share of women who could have a baby (rates.js EXPOSURE), by age group and year node.
function measureExposure({ from, to }) {
  const YRS = R.BIRTH_EXPOSURE.years, Z = () => YRS.map(() => new Array(7).fill(0)), acc = { N: Z(), married: Z(), partnered: Z() };
  const hat = y => { if (y <= YRS[0]) return [[0, 1]]; if (y >= YRS[YRS.length - 1]) return [[YRS.length - 1, 1]]; const i = YRS.findIndex(t => t > y) - 1, w = (y - YRS[i]) / (YRS[i + 1] - YRS[i]); return [[i, 1 - w], [i + 1, w]]; };
  let cur = null;
  const events = STORY.ALL_EVENTS.map(ev => (ev.id !== "baby" ? ev : { ...ev, p: (s, ctx) => {
    if (s === cur && s.age >= 15 && s.age < 50) {
      const g = Math.floor((s.age - 15) / 5), w = R.PARITY[Math.min(4, s.kids.length)] * (s.flags.tryUntil >= s.age ? 1.8 : 1);
      for (const [j, h] of hat(s.year)) acc[s.rel === "married" ? "married" : "partnered"][j][g] += h * w;
    }
    return ev.p(s, ctx);
  } }));
  for (let i = from; i < to; i++) {
    const by = 1950 + (i % 76), prep = seam.neutralPrep({ date: { y: by, m: 6, d: 1 }, time: null, place: null, sex: "female" });
    const life = L.createLife({ prep, sex: "female", birthYear: by, seed: SEED + 500000 + i, auto: true, events });
    cur = life.state;
    while (!life.done && cur.age < 50) { const a = cur.age, y = cur.year; life.step(); if (a >= 15) for (const [j, h] of hat(y)) acc.N[j][Math.floor((a - 15) / 5)] += h; }
  }
  return acc;
}

if (!isMainThread) {
  parentPort.postMessage(workerData.kind === "exposure" ? measureExposure(workerData) : runChunk(workerData));
} else {
  const { test } = await import("node:test");
  const assert = (await import("node:assert/strict")).default;
  const workers = Math.max(1, Math.min(4, availableParallelism ? availableParallelism() : 2));
  const jobs = [];
  for (const [kind, n] of [["plain", PLAN.plain], ["chart", PLAN.chart]]) {
    const per = Math.ceil(n / (PER_CHART * workers)) * PER_CHART;
    for (let from = 0; from < n; from += per) jobs.push({ kind, from, to: Math.min(n, from + per) });
  }
  if (MODE === "fit") for (let w = 0; w < workers; w++) jobs.push({ kind: "exposure", from: w * 4000, to: (w + 1) * 4000 });
  // A small pool: at most `workers` threads at a time.
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < jobs.length) {
      const k = next++;
      results[k] = await new Promise((ok, no) => { const w = new Worker(new URL(import.meta.url), { workerData: jobs[k] }); w.once("message", ok); w.once("error", no); });
    }
  }));
  const plain = jobs.flatMap((j, k) => (j.kind === "plain" ? results[k] : []));
  const chart = jobs.flatMap((j, k) => (j.kind === "chart" ? results[k] : []));

  // ---------- helpers ----------
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const share = (list, f) => mean(list.map(r => (f(r) ? 1 : 0)));
  const near = (value, target, tol, label) => assert.ok(Math.abs(value - target) <= tol, `${label}: simulated ${value.toFixed(3)}, US ${target.toFixed(3)} (± ${tol})`);
  const lines = [];
  const note = (label, sim, us) => lines.push(`${label.padEnd(58)} ${typeof sim === "number" ? sim.toFixed(3) : sim}  ${typeof us === "number" ? us.toFixed(3) : us}`);
  const FULL = MODE === "full";
  const SEXES = ["male", "female"];
  const BINS = FULL ? [[1950, 1959], [1960, 1969], [1970, 1979], [1980, 1989], [1990, 2000]] : [[1950, 1974], [1975, 2000]];
  const inBin = ([a, b]) => r => r.by >= a && r.by <= b;
  const label = ([a, b]) => `${a}–${b}`;
  // Cohort life expectancy from the period tables along the diagonal (the year the person is each age).
  const e0s = new Map();
  const cohortE0 = (sex, by) => {
    const k = `${sex}${by}`;
    if (!e0s.has(k)) { let l = 1, e = 0; for (let x = 0; x <= 120; x++) { const d = l * R.deathRaw(x, sex, by + x); e += l - d / 2; l -= d; } e0s.set(k, e); }
    return e0s.get(k);
  };
  // The cohort's median age at first marriage: MS-2's median in the year the cohort reaches it.
  const medianTarget = (sex, by) => { let m = 25; for (let i = 0; i < 8; i++) m = R.interp(D.MEDIAN_FIRST_MARRIAGE[sex], by + m); return m; };
  const median = list => {
    const s = list.slice().sort((a, b) => a - b), h = s.length / 2, m = s[Math.floor(h)];
    const below = s.filter(x => x < m).length, at = s.filter(x => x === m).length;
    return m + (h - below) / at;   // ages are whole years: the median within the year
  };
  // Share ever married by 45 (Census CPS/ACS, never married at 40–44: about 10 % of the 1950s cohorts, a quarter of
  // men and a fifth of women of the 1980s ones; approximately, not in us-rates.js; NSFG 2006–10 gives a first
  // marriage by 40 for 84 % of women and 78 % of men of the 1960s cohorts, FIRST_MARRIAGE_BY_AGE).
  const EVER_MARRIED_45 = { male: [[1950, 0.9], [1960, 0.85], [1970, 0.8], [1980, 0.76], [1990, 0.73], [2000, 0.72]], female: [[1950, 0.92], [1960, 0.89], [1970, 0.85], [1980, 0.81], [1990, 0.78], [2000, 0.77]] };
  // Completed fertility of a cohort: the age-specific rates along its diagonal (rates.js asfr: us-rates.js
  // ASFR_BY_YEAR scaled to TFR, then the Trustees' projection).
  const cohortTFR = by => { let t = 0; for (let a = 10; a < 50; a++) t += R.asfr(a, by + a); return t; };
  // Home ownership by the householder's age (us-rates.js HOMEOWNERSHIP_BY_AGE, HVS; 1985 before 1985, 2024 after):
  // the mean of the two five-year groups around `age`, in the year the person is that age.
  const hvs = (year, age) => {
    const T = D.HOMEOWNERSHIP_BY_AGE, G = D.HOMEOWNERSHIP_AGES;
    const k = T.findIndex(t => t[0] >= year);
    const row = k === -1 ? T[T.length - 1][1] : k === 0 ? T[0][1] : T[k - 1][1].map((v, i) => v + (T[k][1][i] - v) * (year - T[k - 1][0]) / (T[k][0] - T[k - 1][0]));
    const i = G.findLastIndex(g => g <= age);
    return (row[i - 1] + row[i]) / 200;
  };
  // First marriages ending in divorce by `t` years (Kaplan–Meier: a death or a widowing ends the follow-up).
  const divorcedBy = (list, t) => {
    let S = 1;
    for (let d = 0; d <= t; d++) {
      const atRisk = list.filter(r => r.mTo - r.married > d || (r.mTo - r.married === d && r.mEnd === "divorce")).length;
      const ev = list.filter(r => r.mEnd === "divorce" && r.mTo - r.married === d).length;
      if (atRisk) S *= 1 - ev / atRisk;
    }
    return 1 - S;
  };
  const claimAge = r => (r.delay ? Math.max(70, r.retire) : Math.max(62, r.retire));

  // ---------- the checks ----------
  test(`lifespan and mortality follow the cohort life tables (${plain.length} lives without a chart)`, () => {
    const checks = [];
    for (const sex of SEXES) {
      const g = plain.filter(r => r.sex === sex), tableDeaths = g.reduce((s, r) => s + r.qt, 0), risk = g.reduce((s, r) => s + r.q, 0);
      note(`${sex}: deaths / life-table deaths along the same lives (SMR)`, g.length / tableDeaths, 1);
      note(`${sex}: the engine's yearly risk / the table's`, risk / tableDeaths, 1);
      checks.push([g.length / tableDeaths, 1, FULL ? 0.04 : 0.1, `${sex}: deaths over the life table's (SMR)`]);
      checks.push([risk / tableDeaths, 1, 0.04, `${sex}: the engine's risk over the table's, along the same lives`]);
      for (const bin of FULL ? BINS : [[1950, 2000]]) {
        const c = g.filter(inBin(bin));
        const sim = mean(c.map(r => r.death + 0.5)), us = mean(c.map(r => cohortE0(sex, r.by)));
        note(`${sex} ${label(bin)}: life expectancy at birth`, sim, us);
        checks.push([sim, us, FULL ? 1 : 1.5, `${sex} born ${label(bin)}: life expectancy`]);
      }
    }
    // The deaths follow the engine's own yearly risk (the draw is unbiased).
    const z = (plain.length - plain.reduce((s, r) => s + r.q, 0)) / Math.sqrt(plain.reduce((s, r) => s + r.qv, 0));
    note("deaths vs the engine's yearly risk (z)", z, 0);
    for (const c of checks) near(...c);
    assert.ok(Math.abs(z) < 4, `deaths vs the engine's risk: z = ${z.toFixed(2)}`);
  });

  test("marriage: the share ever married by 45 and the median age at first marriage, by cohort", () => {
    for (const sex of SEXES) for (const bin of BINS) {
      const c = plain.filter(r => r.sex === sex && inBin(bin)(r));
      const a45 = c.filter(r => r.death >= 45);
      const ever = share(a45, r => r.married !== null && r.married <= 45), us = mean(a45.map(r => R.interp(EVER_MARRIED_45[sex], r.by)));
      note(`${sex} ${label(bin)}: ever married by 45`, ever, us);
      near(ever, us, FULL ? 0.04 : 0.07, `${sex} born ${label(bin)}: ever married by 45`);
      const ages = c.filter(r => r.married !== null && r.married <= 50).map(r => r.married);
      const med = median(ages), usMed = mean(c.map(r => medianTarget(sex, r.by)));
      note(`${sex} ${label(bin)}: median age at first marriage`, med, usMed);
      near(med, usMed, FULL ? 1 : 1.5, `${sex} born ${label(bin)}: median age at first marriage`);
    }
    // NSFG 2006–10: a first marriage by 40 (us-rates.js FIRST_MARRIAGE_BY_AGE, 2008), the cohorts born 1960–1972.
    const nsfg = D.FIRST_MARRIAGE_BY_AGE;
    for (const sex of SEXES) {
      const c = plain.filter(r => r.sex === sex && r.by >= 1960 && r.by <= 1972 && r.death >= 40);
      const us = nsfg[sex].find(([y]) => y === 2008)[1].find(([a]) => a === 40)[1];
      note(`${sex} 1960–1972: first married by 40 (NSFG 2006–10)`, share(c, r => r.married !== null && r.married <= 40), us);
      near(share(c, r => r.married !== null && r.married <= 40), us, 0.08, `${sex}: first married by 40`);
    }
  });

  test("births: completed fertility by cohort, and the share born outside marriage by year", () => {
    const women = plain.filter(r => r.sex === "female" && r.death >= 45);
    const kidsBy45 = r => r.births.filter(b => b[1] < 45).length;
    for (const bin of BINS) {
      const c = women.filter(inBin(bin));
      note(`women ${label(bin)}: children by 45`, mean(c.map(kidsBy45)), mean(c.map(r => cohortTFR(r.by))));
      near(mean(c.map(kidsBy45)), mean(c.map(r => cohortTFR(r.by))), FULL ? 0.1 : 0.2, `women born ${label(bin)}: children by 45`);
    }
    const old = women.filter(r => r.by < 1980), young = women.filter(r => r.by >= 1990);
    assert.ok(mean(old.map(kidsBy45)) >= 1.85 && mean(old.map(kidsBy45)) <= 2.3, `older cohorts: ${mean(old.map(kidsBy45)).toFixed(2)} children`);
    assert.ok(mean(young.map(kidsBy45)) < mean(old.map(kidsBy45)) - 0.1, "fertility falls for the cohorts born in the 1990s");
    // rates.js spreads each year's nonmarital share over the mother's ages so that it adds up to the NCHS figure.
    for (const y of [1950, 1960, 1970, 1980, 1990, 2000, 2009, 2023]) {
      let all = 0, nm = 0;
      for (let a = 15; a < 50; a++) { all += R.asfr(a, y); nm += R.asfr(a, y) * R.nonmaritalShare(a, y); }
      near(nm / all, R.interp(D.NONMARITAL_BIRTH_SHARE, y), 0.005, `${y}: nonmarital share of births in rates.js`);
    }
    // The simulated mothers have them: the share unmarried at the birth, against rates.js at the same ages and years.
    const births = plain.filter(r => r.sex === "female").flatMap(r => r.births);
    for (const [y0, y1] of FULL ? [[1968, 1979], [1980, 1989], [1990, 1999], [2000, 2009], [2010, 2019], [2020, 2045]] : [[1968, 1989], [1990, 2009], [2010, 2045]]) {
      const b = births.filter(x => x[0] >= y0 && x[0] <= y1);
      const sim = 1 - mean(b.map(x => x[2])), us = mean(b.map(x => R.nonmaritalShare(x[1], x[0])));
      note(`births ${y0}–${y1}: share to unmarried mothers (at the US share for their ages)`, sim, us);
      near(sim, us, FULL ? 0.04 : 0.07, `births ${y0}–${y1}: nonmarital share`);
    }
  });

  test("divorce: the share of first marriages ending in divorce within 5, 10 and 20 years", () => {
    // NSFG 2006–10 (us-rates.js FIRST_MARRIAGE_SURVIVAL): still intact (neither divorced nor separated) after 5, 10 and
    // 20 years, women and men averaged. A divorce comes a little after a separation, and a few separations never
    // become one, so the simulated divorces may sit a few points under the share no longer intact.
    const S = D.FIRST_MARRIAGE_SURVIVAL, ended = t => 1 - (R.interp(S.female, t) + R.interp(S.male, t)) / 2;
    const first = plain.filter(r => r.married !== null && r.by + r.married >= 1975 && r.by + r.married <= 2009);
    for (const t of [5, 10, 20]) {
      const sim = divorcedBy(first, t);
      note(`first marriages 1975–2009: divorced within ${t} years (NSFG: no longer intact)`, sim, ended(t));
      assert.ok(sim <= ended(t) + 0.04 && sim >= ended(t) - 0.1, `divorced within ${t} years: ${sim.toFixed(3)} vs ${ended(t).toFixed(3)} no longer intact`);
    }
    const later = plain.filter(r => r.married !== null && r.by + r.married >= 2010);
    note("first marriages from 2010: divorced within 10 years", divorcedBy(later, 10), "lower");
    assert.ok(divorcedBy(later, 10) < divorcedBy(first, 10), "fewer divorces in the marriages of the 2010s");
  });

  test("schooling by cohort: high school, some college or an associate degree, a bachelor's or more, graduate degrees", () => {
    for (const sex of SEXES) for (const bin of BINS) {
      const c = plain.filter(r => r.sex === sex && inBin(bin)(r) && r.edu30);
      const t = c.map(r => R.educationTarget(r.by, sex)), tm = k => mean(t.map(x => x[k]));
      const checks = [
        ["high school or more at 30", share(c, r => r.edu30 !== "lt"), tm("highSchool"), FULL ? 0.03 : 0.05],
        ["some college or an associate degree at 30", share(c, r => (r.edu30 === "hs" && r.attended) || r.edu30 === "associate"), tm("someCollege") + tm("associate"), FULL ? 0.04 : 0.07],
        ["a bachelor's or more at 30", share(c, r => r.edu30 === "bachelor" || r.edu30 === "graduate"), tm("bachelor") + tm("graduate"), FULL ? 0.035 : 0.06],
      ];
      for (const [what, sim, us, tol] of checks) { note(`${sex} ${label(bin)}: ${what}`, sim, us); near(sim, us, tol, `${sex} born ${label(bin)}: ${what}`); }
    }
    const ba = plain.filter(r => r.edu45 === "bachelor" || r.edu45 === "graduate");
    const us = mean(ba.map(r => { const t = R.educationTarget(r.by, r.sex); return t.graduate / (t.bachelor + t.graduate); }));
    note("graduate degrees among bachelor's or more at 45", share(ba, r => r.edu45 === "graduate"), us);
    near(share(ba, r => r.edu45 === "graduate"), us, 0.07, "graduate degrees among bachelor's or more");
  });

  test("home ownership at 35 and 50 (Census HVS, by the householder's age)", () => {
    // HVS counts householders; a person living with parents or roommates is not one, so the simulated people may own
    // a little less often than householders of their age.
    for (const bin of BINS) for (const [age, key] of [[35, "own35"], [50, "own50"]]) {
      const c = plain.filter(r => inBin(bin)(r) && r[key] !== undefined);
      const sim = mean(c.map(r => r[key])), us = mean(c.map(r => hvs(r.by + age, age)));
      note(`born ${label(bin)}: own their home at ${age}`, sim, us);
      near(sim, us, FULL ? 0.06 : 0.09, `born ${label(bin)}: owners at ${age}`);
    }
  });

  test("causes of death by age: cancer, heart disease and stroke (NCHS / CDC WONDER shares)", () => {
    for (const [a0, a1] of [[45, 69], [70, 84], [85, 110]]) {
      const g = plain.filter(r => r.death >= a0 && r.death <= a1);
      for (const t of R.SERIOUS_TYPES) {
        const sim = share(g, r => r.diedOf === t), us = mean(g.map(r => R.causeShare(t, r.death, r.sex, r.by + r.death)));
        note(`deaths at ${a0}–${a1}: ${t}`, sim, us);
        near(sim, us, t === "stroke" ? 0.03 : FULL ? 0.03 : 0.05, `deaths at ${a0}–${a1} from ${t}`);
      }
    }
    // The cancer registry: the simulated diagnoses of 2019, standardised on the 2000 US population (rates.js
    // diagnosisRate: the diagnoses among people not already ill), against U.S. Cancer Statistics 2019–23.
    const STD = D.US_STANDARD_2000, I = D.CANCER_INCIDENCE;
    for (const sex of SEXES) {
      let sum = 0, w = 0;
      STD.forEach(([a, wt], i) => {
        const b = i + 1 < STD.length ? STD[i + 1][0] : 100;
        let r = 0, n = 0;
        for (let x = a; x < b; x++) { const lw = a >= 85 ? Math.exp(-0.15 * (x - 85)) : 1; r += lw * R.diagnosisRate("cancer", x, sex, 2019); n += lw; }
        sum += wt * r / n; w += wt;
      });
      note(`${sex}: cancer diagnoses per 100,000, age-standardised (2019)`, 1e5 * sum / w, 1e5 * I.asr[sex]);
      near(sum / w / I.asr[sex], 1, 0.03, `${sex}: age-standardised cancer incidence over the registry's`);
    }
  });

  test("military service: the draft-lottery cohorts and the volunteer force", () => {
    const men = plain.filter(r => r.sex === "male" && r.death >= 25);
    const groups = [[1950, 1955], [1956, 1964], [1965, 1979], [1980, 2000]];
    const sims = groups.map(([a, b]) => {
      const c = men.filter(r => r.by >= a && r.by <= b);
      const sim = share(c, r => r.served), us = mean(c.map(r => R.interp(D.MILITARY_SERVICE_SHARE, r.by)));
      note(`men born ${a}–${b}: ever served`, sim, us);
      near(sim, us, a === 1950 ? 0.1 : FULL ? 0.03 : 0.06, `men born ${a}–${b}: ever served`);
      return sim;
    });
    assert.ok(sims[0] > sims[2] + 0.08, "the Vietnam-era cohorts served far more often than later ones");
    const women = plain.filter(r => r.sex === "female" && r.death >= 25);
    assert.ok(share(women, r => r.served) < 0.04, "few women served");
  });

  test("retirement: the age at claiming Social Security and the share who claim at 62 (SSA)", () => {
    for (const sex of SEXES) {
      const c = plain.filter(r => r.sex === sex && r.by <= 1960 && r.retire !== undefined);
      const sim = mean(c.map(claimAge)), us = mean(c.map(r => R.interp(D.RETIREMENT_AWARD_AGE[sex], r.by + claimAge(r))));
      note(`${sex} 1950–1960: mean age at claiming`, sim, us);
      near(sim, us, FULL ? 0.5 : 0.8, `${sex} born 1950–1960: claiming age`);
      const at62 = share(c, r => claimAge(r) === 62), us62 = mean(c.map(r => R.interp(D.RETIREMENT_AT_62[sex], r.by + 62)));
      note(`${sex} 1950–1960: share claiming at 62`, at62, us62);
      near(at62, us62, FULL ? 0.06 : 0.1, `${sex} born 1950–1960: claiming at 62`);
    }
  });

  test(`random charts do not move the population (${chart.length} lives, ${chart.length / PER_CHART} charts, the same people and seeds)`, () => {
    // The chart run lives the first lives of the plan again, with a chart: compare each aggregate on the same people.
    const base = plain.slice(0, chart.length);
    const pairs = [
      ["life expectancy at birth", rs => mean(rs.map(r => r.death + 0.5)), FULL ? 0.5 : 1],
      ["ever married by 45", rs => share(rs.filter(r => r.death >= 45), r => r.married !== null && r.married <= 45), FULL ? 0.025 : 0.05],
      ["median age at first marriage", rs => median(rs.filter(r => r.married !== null && r.married <= 50).map(r => r.married)), FULL ? 0.5 : 1],
      ["women's children by 45", rs => mean(rs.filter(r => r.sex === "female" && r.death >= 45).map(r => r.births.filter(b => b[1] < 45).length)), FULL ? 0.08 : 0.15],
      ["births outside marriage", rs => 1 - mean(rs.filter(r => r.sex === "female").flatMap(r => r.births).map(b => b[2])), FULL ? 0.03 : 0.06],
      ["first marriages divorced within 20 years", rs => divorcedBy(rs.filter(r => r.married !== null), 20), FULL ? 0.03 : 0.06],
      ["a bachelor's or more at 30", rs => share(rs.filter(r => r.edu30), r => r.edu30 === "bachelor" || r.edu30 === "graduate"), FULL ? 0.025 : 0.05],
      ["own their home at 50", rs => mean(rs.filter(r => r.own50 !== undefined).map(r => r.own50)), FULL ? 0.03 : 0.06],
      ["deaths from cancer, heart disease or stroke", rs => share(rs, r => r.diedOf !== null), FULL ? 0.025 : 0.05],
      ["men who served", rs => share(rs.filter(r => r.sex === "male" && r.death >= 25), r => r.served), FULL ? 0.02 : 0.04],
      ["age at claiming Social Security", rs => mean(rs.filter(r => r.retire !== undefined).map(claimAge)), FULL ? 0.3 : 0.5],
    ];
    for (const [what, f, tol] of pairs) {
      const a = f(base), b = f(chart);
      note(`with random charts: ${what}`, b, a);
      near(b, a, tol, `with charts vs without: ${what}`);
    }
  });

  test("calibration summary", () => {
    console.log(`\n# Calibration (${MODE}): simulated | US\n${lines.map(l => `#   ${l}`).join("\n")}`);
    if (MODE === "fit") {
      const acc = jobs.map((j, k) => (j.kind === "exposure" ? results[k] : null)).filter(Boolean).reduce((a, b) => { for (const key in a) a[key] = a[key].map((row, i) => row.map((v, g) => v + b[key][i][g])); return a; });
      const E = R.BIRTH_EXPOSURE, fmt = key => E[key].map((row, i) => `    [${row.map((old, g) => (acc.N[i][g] < 150 ? old : +Math.exp(0.6 * Math.log(Math.max(0.005, acc[key][i][g] / acc.N[i][g])) + 0.4 * Math.log(old)).toPrecision(3))).join(", ")}],`).join("\n");
      console.log(`\n# rates.js EXPOSURE, measured (60 % of the way from the current table; cells with few women kept):\nconst EXPOSURE = {\n  married: [\n${fmt("married")}\n  ],\n  partnered: [\n${fmt("partnered")}\n  ],\n};`);
    }
  });
}
