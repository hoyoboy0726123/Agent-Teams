// The official statistics behind death and illness (src/sim/official-data.js, made by scripts/official-stats.py):
// every 內政部 life table gives back its own life expectancy, the years after 2025 reach 國發會's 2070 projection, the
// cancer curve reproduces 國健署's 2023 registry, and simulated lives die of cancer, stroke and heart disease, and
// get 三高, about as often as 死因統計 and 健保 say.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIFE_TABLES, CAUSE_SHARES, CAUSE_AGES, CHRONIC_RATES, CHRONIC_AGES, POPULATION_2024 } from "../src/sim/official-data.js";
import { lifeTable, expectancy, deathRaw, incidence, causeShare, serious, seriousType, chronic, CANCER_2023, LATEST_TABLE_YEAR, WHO_STANDARD as WHO } from "../src/sim/rates.js";
import { computeChart } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { prepare } from "../src/sim/setup.js";
import { createLife } from "../src/sim/life.js";
import { DOMAINS } from "../src/core/luck.js";
import { makeRng } from "../src/sim/rng.js";

const SEXES = ["male", "female"];

test("the 內政部 tables run from 1956–58 to 2025, every year from 1970, with the official 2024 and 2025 life expectancy", () => {
  const years = LIFE_TABLES.map(t => t[0]);
  assert.deepEqual(years.slice(0, 3), [1957, 1966.5, 1970]);
  for (let y = 1970; y <= 2025; y++) assert.ok(years.includes(y), `${y}`);
  assert.equal(LATEST_TABLE_YEAR, 2025);
  const at = y => LIFE_TABLES.find(t => t[0] === y);
  assert.deepEqual(at(2024)[3], [77.42, 84.3]);    // 內政部 113年簡易生命表
  assert.deepEqual(at(2025)[3], [77.93, 84.75]);   // 114年
  assert.deepEqual(at(2000)[3], [73.83, 79.56]);   // 89年 (內政部's current table, not the older copy elsewhere)
  for (const t of LIFE_TABLES) for (const col of [1, 2]) {
    assert.equal(t[col].length, 85);
    assert.ok(t[col].every(v => Number.isInteger(v) && v > 0 && v < 1e6), `${t[0]}`);
  }
});

test("each table, carried past 85, gives back its official life expectancy at birth and at 85", () => {
  for (const [year, , , e0, e85] of LIFE_TABLES) {
    if (!Number.isInteger(year)) continue;   // 1966–67 sits at 1966.5; whole years in between are interpolated
    SEXES.forEach((sex, i) => {
      const q = lifeTable(sex, year);
      assert.equal(q.length, 121);
      assert.equal(q[120], 1);
      assert.ok(Math.abs(expectancy(q) - e0[i]) < 0.03, `${year} ${sex}: ${expectancy(q).toFixed(3)} vs ${e0[i]}`);
      assert.ok(Math.abs(expectancy(q.slice(85)) - e85[i]) < 0.02, `${year} ${sex} at 85: ${expectancy(q.slice(85)).toFixed(3)} vs ${e85[i]}`);
      for (let x = 86; x < 120; x++) assert.ok(q[x] >= q[x - 1] - 1e-12 && q[x] < 1, `${year} ${sex} q${x}`);
    });
  }
});

test("between tables q(x) runs log-linearly, before 1957 the 1956–58 table holds, and after 2025 the projection reaches 國發會's 2070", () => {
  for (const sex of SEXES) {
    const a = lifeTable(sex, 1957), b = lifeTable(sex, 1966), c = lifeTable(sex, 1970);
    for (const x of [0, 30, 70]) assert.ok(b[x] < a[x] && b[x] > c[x] * 0.8, `${sex} ${x}`);
    assert.deepEqual(Array.from(lifeTable(sex, 1930)), Array.from(a));
    const e = y => expectancy(lifeTable(sex, y));
    assert.ok(Math.abs(e(2070) - { male: 84.41, female: 90.52 }[sex]) < 0.01, `${sex} 2070: ${e(2070)}`);
    for (let y = 2026; y <= 2070; y += 4) assert.ok(e(y) > e(y - 4) - 1e-9, `${sex} ${y}`);
    assert.equal(e(2100), e(2070));
    assert.equal(deathRaw(200, sex, 2030), 1);
  }
});

test("the 死因統計 shares are shares, and they follow the anchor years: less stroke and more cancer since the 1990s", () => {
  assert.equal(CAUSE_AGES.length, 22);
  for (const [year, bySex] of CAUSE_SHARES) for (const sex of SEXES) {
    const { cancer, heart, stroke } = bySex[sex];
    for (let g = 0; g < CAUSE_AGES.length; g++) assert.ok(cancer[g] + heart[g] + stroke[g] <= 10000, `${year} ${sex} ${g}`);
  }
  for (const sex of SEXES) {
    assert.ok(causeShare("中風", 72, sex, 1993) > causeShare("中風", 72, sex, 2024) * 1.5);
    assert.ok(causeShare("癌症", 62, sex, 2024) > causeShare("癌症", 62, sex, 1993));
    assert.equal(causeShare("癌症", 62, sex, 1980), causeShare("癌症", 62, sex, 1993));   // held before the first anchor
    assert.equal(causeShare("癌症", 62, sex, 2060), causeShare("癌症", 62, sex, 2024));   // and after the last
  }
});

// The 2024 mid-year population, per single year of age.
const perYear = (sex, age) => {
  const P = POPULATION_2024, g = P.ages.findLastIndex(a => a <= age), width = g + 1 < P.ages.length ? P.ages[g + 1] - P.ages[g] : 15;
  return P[sex][g] / width;
};

test("cancer reproduces 國健署's 2023 registry: the standardised rate and the new cases by sex, and a median age near 65", () => {
  const byAge = [];
  for (const sex of SEXES) {
    const asr = WHO.reduce((s, [a, w]) => s + w / 100 * [0, 1, 2, 3, 4].reduce((t, d) => t + incidence("癌症", a + d, sex, 2023), 0) / 5, 0);
    assert.ok(Math.abs(asr / CANCER_2023.asr[sex] - 1) < 0.005, `${sex} ASR ${(asr * 1e5).toFixed(1)}`);
    let n = 0;
    for (let a = 0; a < 100; a++) { const c = perYear(sex, a) * incidence("癌症", a, sex, 2023); n += c; byAge[a] = (byAge[a] || 0) + c; }
    assert.ok(Math.abs(n / CANCER_2023.cases[sex] - 1) < 0.01, `${sex} cases ${Math.round(n)}`);
    assert.ok(incidence("癌症", 75, sex, 2023) > incidence("癌症", 45, sex, 2023) * 3);
  }
  const total = byAge.reduce((a, b) => a + b, 0);
  let acc = 0;
  const median = byAge.findIndex(c => (acc += c) >= total / 2);
  assert.ok(Math.abs(median - CANCER_2023.median) <= 2, `median age ${median}`);
  // Women's cancers come earlier (breast, thyroid): more diagnoses than men's at 40, fewer at 75.
  assert.ok(incidence("癌症", 40, "female", 2023) > incidence("癌症", 40, "male", 2023));
  assert.ok(incidence("癌症", 75, "female", 2023) < incidence("癌症", 75, "male", 2023));
});

test("a serious illness is a probability, named by the three illnesses' weights at that age", () => {
  const r = makeRng(7);
  for (const sex of SEXES) for (const age of [20, 50, 80]) {
    const p = serious(age, sex, 2024);
    assert.ok(p > 0 && p < 1, `${sex} ${age}`);
    const n = { 癌症: 0, 中風: 0, 心臟病: 0 };
    for (let i = 0; i < 3000; i++) n[seriousType(age, sex, 2024, r)]++;
    for (const t of Object.keys(n)) {
      const want = incidence(t, age, sex, 2024) / p;
      assert.ok(Math.abs(n[t] / 3000 - want) < 0.04, `${sex} ${age} ${t}: ${n[t] / 3000} vs ${want.toFixed(3)}`);
    }
  }
});

test("simulated lives die of cancer, stroke and heart disease about as 死因統計 says, and 三高 by 70 follows 健保", () => {
  const LIVES = 1000;
  for (const sex of SEXES) {
    const chart = computeChart({ date: { y: 1955, m: 6, d: 1 }, time: { h: 12, mi: 0 }, place: findPlace("臺北市"), sex });
    const { analysis, luck } = prepare(chart);
    const neutral = luck.map(y => ({ ...y, L: 0, reasons: [], m: Object.fromEntries(Object.keys(DOMAINS).map(d => [d, { good: 0, bad: 0, change: 0 }])) }));
    const seen = { 癌症: 0, 中風: 0, 心臟病: 0 }, want = { 癌症: 0, 中風: 0, 心臟病: 0 };
    let deaths = 0, at70 = 0, chronic70 = 0;
    for (let i = 0; i < LIVES; i++) {
      const life = createLife({ chart, analysis, luck: neutral, seed: 40000 + i, auto: true });
      let counted = false;
      while (!life.done) {
        life.step();
        if (!counted && life.state.age === 70 && life.state.alive !== false) { counted = true; at70++; if (life.state.health.chronic) chronic70++; }
      }
      const d = life.log.find(e => e.id === "death");
      if (!d || d.age < 60 || d.age > 89) continue;
      deaths++;
      for (const t of Object.keys(seen)) { if (d.text.includes(`因為${t}`)) seen[t]++; want[t] += causeShare(t, d.age, sex, 1955 + d.age); }
    }
    const all = Object.keys(seen).reduce((s, t) => s + seen[t], 0) / Object.keys(want).reduce((s, t) => s + want[t], 0);
    assert.ok(all > 0.8 && all < 1.2, `${sex}: the three together ${all.toFixed(2)} of 死因統計`);
    for (const t of Object.keys(seen)) assert.ok(seen[t] / want[t] > 0.6 && seen[t] / want[t] < 1.5, `${sex} ${t}: ${seen[t]} vs ${want[t].toFixed(1)}`);
    const mid = CHRONIC_AGES.map((a, g) => (g + 1 < CHRONIC_AGES.length ? (a + CHRONIC_AGES[g + 1]) / 2 : a + 2.5));
    const rate = (r, age) => { const g = mid.findLastIndex(m => m <= age); return (r[g] + (r[g + 1] - r[g]) * (age - mid[g]) / (mid[g + 1] - mid[g])) / 1e5; };
    const official = 1 - (1 - rate(CHRONIC_RATES[sex].hypertension, 70)) * (1 - rate(CHRONIC_RATES[sex].diabetes, 70));
    assert.ok(Math.abs(chronic70 / at70 - official) < 0.07, `${sex} 三高 at 70: ${(chronic70 / at70).toFixed(3)} vs ${official.toFixed(3)}`);
    assert.ok(chronic(25, sex) < chronic(45, sex) && chronic(45, sex) < chronic(65, sex));
  }
});
