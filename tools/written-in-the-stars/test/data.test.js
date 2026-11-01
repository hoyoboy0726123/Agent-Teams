// Sanity checks on the US statistics (src/data/us-rates.js, made by src/data/build-us-rates.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../src/data/us-rates.js";

const SEXES = ["male", "female"];
const interp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return pts[pts.length - 1][1];
};
// Life expectancy at birth from q(0..84) x 1e6 and the remaining life expectancy at 85.
const e0 = (q, e85) => {
  let l = 1, e = 0;
  for (let x = 0; x < q.length; x++) { const d = l * q[x] / 1e6; e += l - d / 2; l -= d; }
  return e + l * e85;
};
const row = y => R.LIFE_TABLES.find(t => t[0] === y);
const both = y => { const r = row(y); return (e0(r[1], r[4][0]) + e0(r[2], r[4][1])) / 2; };
const isProb = v => Number.isFinite(v) && v >= 0 && v <= 1;
const isSorted = xs => xs.every((v, i) => i === 0 || v > xs[i - 1]);

test("life tables: shape, every year 1950-2023, probabilities in 0..1", () => {
  for (let y = 1950; y <= 2023; y++) assert.ok(row(y), `missing ${y}`);
  assert.ok(isSorted(R.LIFE_TABLES.map(t => t[0])));
  assert.ok(R.LIFE_TABLES.at(-1)[0] >= 2125);
  for (const [y, m, f, e, e85] of R.LIFE_TABLES) {
    for (const q of [m, f]) {
      assert.equal(q.length, 85, `${y} has ${q.length} ages`);
      assert.ok(q.every(v => Number.isInteger(v) && isProb(v / 1e6)), `${y} q out of range`);
    }
    assert.ok(e.length === 2 && e85.length === 2 && e85.every(v => v > 3 && v < 12), `${y} e85 ${e85}`);
  }
});

test("life tables: the rows give back their own e0", () => {
  for (const [y, m, f, e, e85] of R.LIFE_TABLES) {
    assert.ok(Math.abs(e0(m, e85[0]) - e[0]) < 0.1, `${y} male ${e0(m, e85[0]).toFixed(2)} vs ${e[0]}`);
    assert.ok(Math.abs(e0(f, e85[1]) - e[1]) < 0.1, `${y} female ${e0(f, e85[1]).toFixed(2)} vs ${e[1]}`);
  }
});

test("life expectancy at birth is about right", () => {
  const e1950 = both(1950), e2021 = both(2021), e2022 = both(2022);
  assert.ok(e1950 > 68 && e1950 < 70, `1950 ${e1950.toFixed(2)}`);           // NCHS 1950: 68.2
  assert.ok(e2021 > 76 && e2021 < 77, `2021 ${e2021.toFixed(2)}`);           // NCHS 2021: 76.4
  assert.ok(e2022 > 76.5 && e2022 < 78, `2022 ${e2022.toFixed(2)}`);         // NCHS 2022: 77.5
  for (const y of [1950, 1980, 2021]) {                                     // women outlive men by 5-8 years
    const r = row(y), gap = e0(r[2], r[4][1]) - e0(r[1], r[4][0]);
    assert.ok(gap > 4.5 && gap < 8.5, `${y} gap ${gap.toFixed(2)}`);
  }
  assert.ok(row(2020)[3][0] < row(2019)[3][0], "COVID-19 dip in 2020");
  const p = R.E0_PROJECTION;                                                 // the projection keeps rising
  assert.ok(p.every(([, m, f], i) => i === 0 || (m >= p[i - 1][1] && f >= p[i - 1][2])));
  assert.ok(p.at(-1)[1] < 92 && p.at(-1)[2] < 95);
});

test("causes of death: shapes, no gaps, shares in 0..1, sensible levels", () => {
  for (const [table, causes] of [[R.CAUSE_SHARES, ["cancer", "heart", "stroke"]], [R.EXTERNAL_CAUSE_SHARES, ["accidents", "suicide"]]]) {
    assert.ok(isSorted(table.map(r => r[0])));
    for (const [y, rec] of table) for (const s of SEXES) {
      let sum = new Array(R.CAUSE_AGES.length).fill(0);
      for (const c of causes) {
        const v = rec[s][c];
        assert.equal(v.length, R.CAUSE_AGES.length, `${y} ${s} ${c}`);
        assert.ok(v.every(x => Number.isInteger(x) && isProb(x / 1e4)), `${y} ${s} ${c}`);
        sum = sum.map((a, i) => a + v[i]);
      }
      assert.ok(sum.every(x => x <= 1e4), `${y} ${s} shares add to more than all deaths`);
    }
  }
  const at = (y, s, c, age) => R.CAUSE_SHARES.find(r => r[0] === y)[1][s][c][R.CAUSE_AGES.indexOf(age)] / 1e4;
  // heart disease fell and cancer rose as a share of deaths at 65-69 (NCHS trends)
  assert.ok(at(1970, "male", "heart", 65) > 0.4 && at(2018, "male", "heart", 65) < 0.3);
  assert.ok(at(2018, "male", "cancer", 65) > at(1970, "male", "cancer", 65));
  // accidents lead at 15-24; overdose dominates deaths at 25-39 by 2020
  const acc = R.EXTERNAL_CAUSE_SHARES.find(r => r[0] === 2018)[1].male.accidents[R.CAUSE_AGES.indexOf(20)] / 1e4;
  assert.ok(acc > 0.3 && acc < 0.6, `accidents 20-24 ${acc}`);
  for (const [, rec] of R.OVERDOSE_SHARES) for (const s of SEXES) assert.ok(rec[s].length === R.CAUSE_AGES.length && rec[s].every(x => isProb(x / 1e4)));
  const od = R.OVERDOSE_SHARES.find(r => r[0] === 2020)[1].male[R.CAUSE_AGES.indexOf(30)] / 1e4;
  assert.ok(od > 0.2 && od < 0.4, `overdose 30-34 men 2020 ${od}`);
});

test("chronic conditions and population: shapes and ranges", () => {
  assert.equal(R.CHRONIC_AGES.length, 18);
  for (const s of SEXES) for (const c of ["hypertension", "diabetes"]) {
    const v = R.CHRONIC_RATES[s][c];
    assert.equal(v.length, R.CHRONIC_AGES.length);
    assert.ok(v.every(x => isProb(x / 1e5)));
    assert.ok(v.every((x, i) => i === 0 || x >= v[i - 1]), `${s} ${c} should not fall with age`);
  }
  assert.ok(R.CHRONIC_RATES.male.hypertension[R.CHRONIC_AGES.indexOf(70)] / 1e5 > 0.5);   // most 70-year-olds
  const pop = R.POPULATION_2020, total = [...pop.male, ...pop.female].reduce((a, b) => a + b, 0);
  assert.ok(total > 325e6 && total < 336e6, `2020 population ${total}`);                  // Census: 331.5 million
  const std = R.US_STANDARD_2000.reduce((a, [, w]) => a + w, 0);
  assert.ok(Math.abs(std - 1e6) <= 2, `standard population sums to ${std}`);
});

test("first marriage: median ages for 1960 and 2020 and the trend", () => {
  const m = new Map(R.MEDIAN_FIRST_MARRIAGE.male), f = new Map(R.MEDIAN_FIRST_MARRIAGE.female);
  for (const t of [m, f]) for (let y = 1947; y <= 2025; y++) assert.ok(t.has(y), `missing ${y}`);
  assert.ok(Math.abs(m.get(1960) - 22.8) <= 0.2 && Math.abs(f.get(1960) - 20.3) <= 0.2, `1960 ${m.get(1960)} / ${f.get(1960)}`);   // Census MS-2
  assert.ok(Math.abs(m.get(2020) - 30.5) <= 0.3 && Math.abs(f.get(2020) - 28.1) <= 0.3, `2020 ${m.get(2020)} / ${f.get(2020)}`);
  for (const y of [1950, 1980, 2000, 2024]) assert.ok(m.get(y) > f.get(y), `men marry later (${y})`);
  for (const [, pts] of [...R.FIRST_MARRIAGE_BY_AGE.female, ...R.FIRST_MARRIAGE_BY_AGE.male]) assert.ok(pts.every(([, p], i) => isProb(p) && (i === 0 || p >= pts[i - 1][1])));
});

test("births: total fertility near the published TFR and the age pattern adds up", () => {
  const tfr = new Map(R.TFR);
  for (let y = 1960; y <= 2023; y++) assert.ok(tfr.has(y), `missing ${y}`);
  const near = (y, v, tol) => assert.ok(Math.abs(tfr.get(y) - v) <= tol, `${y} ${tfr.get(y)} vs ${v}`);
  near(1960, 3.654, 0.01); near(1976, 1.738, 0.005); near(1990, 2.081, 0.005); near(2007, 2.122, 0.005); near(2023, 1.621, 0.005);   // NCHS
  for (const [y, groups] of R.ASFR_BY_YEAR) {
    const sum = 5 * groups.reduce((a, [, r]) => a + r, 0);
    assert.ok(groups.every(([, r]) => isProb(r)));
    assert.ok(Math.abs(sum - interp(R.TFR, y)) < 0.01, `${y} ASFR x 5 = ${sum.toFixed(3)} vs TFR ${interp(R.TFR, y)}`);
  }
  assert.ok(R.NONMARITAL_BIRTH_SHARE.every(([, p]) => isProb(p)) && interp(R.NONMARITAL_BIRTH_SHARE, 2023) > 0.35);
  assert.ok(R.MARRIED_SHARE.every(([, p]) => isProb(p)) && R.COHABITING_SHARE.every(([, p]) => isProb(p)));
});

test("divorce, school, home, work: ranges and gaps", () => {
  const years = t => t.map(r => r[0]);
  for (const t of [R.DIVORCE_TREND, R.DIVORCE_REFINED, R.MARRIAGE_RATE, R.TFR, R.HOMEOWNERSHIP_RATE, R.UNEMPLOYMENT_RATE, R.MOVER_RATE, R.COLLEGE_ENROLLMENT]) assert.ok(isSorted(years(t)));
  assert.ok(Math.max(...R.DIVORCE_TREND.map(r => r[1])) <= 5.3 && interp(R.DIVORCE_TREND, 1979) > 5);   // the 1979-81 peak
  assert.ok(Math.abs(R.DIVORCE_DURATION.shares.reduce((a, [, p]) => a + p, 0) - 1) < 0.005);
  for (let y = 1950; y <= 2024; y++) assert.ok(R.UNEMPLOYMENT_RATE.some(r => r[0] === y), `unemployment ${y}`);
  assert.ok(R.UNEMPLOYMENT_RATE.every(([, u]) => u > 2 && u < 11));
  assert.ok(R.RECESSIONS.every(([p, t]) => p < t) && R.RECESSION_YEARS.includes(2009));
  for (let y = 1964; y <= 2024; y++) assert.ok(R.HOMEOWNERSHIP_RATE.some(r => r[0] === y), `homeownership ${y}`);
  for (const [, v] of R.HOMEOWNERSHIP_BY_AGE) {
    assert.equal(v.length, R.HOMEOWNERSHIP_AGES.length);
    assert.ok(v.every(p => p > 5 && p < 95) && v[0] < v[3] && v[3] < v[8]);   // ownership rises with age
  }
  for (const k of ["highSchool", "bachelor", "bachelorMale", "bachelorFemale"]) {
    const t = R.EDUCATION_25_29[k];
    assert.ok(t.every(([, p], i) => p > 0 && p < 100 && (i === 0 || t[i][0] === t[i - 1][0] + 1)), `${k} has a gap`);
  }
  assert.ok(Math.abs(interp(R.EDUCATION_25_29.highSchool, 1970) - 75.4) < 0.5 && Math.abs(interp(R.EDUCATION_25_29.bachelor, 1970) - 16.4) < 0.5);   // CPS A-2
  for (const [, rec] of R.EDUCATION_BY_COHORT) for (const s of SEXES) {
    const e = rec[s], above = e.someCollege + e.associate + e.bachelor + e.graduate;
    assert.ok(Object.values(e).every(isProb) && above <= e.highSchool + 1e-9);
  }
  for (const s of SEXES) assert.ok(R.RETIREMENT_AWARD_AGE[s].every(([, a]) => a > 62 && a < 70) && R.RETIREMENT_AT_62[s].every(([, p]) => isProb(p)));
  assert.ok(R.PAY_BY_AGE.every(([, r]) => r > 0.4 && r < 1.5));
});

test("every export named in APPROX and SOURCES exists", () => {
  for (const k of R.APPROX) assert.ok(k.split(/[:.]/)[0] in R, k);
  for (const k of Object.keys(R.SOURCES)) assert.ok(k in R, k);
});
