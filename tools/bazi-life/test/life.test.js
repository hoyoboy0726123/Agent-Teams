import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { prepare } from "../src/sim/setup.js";
import { createLife, runLife, MAX_AGE } from "../src/sim/life.js";
import { rerun } from "../src/sim/monte.js";
import { deathRaw } from "../src/sim/rates.js";
import { DOMAINS, CHANNELS } from "../src/core/luck.js";

const chartOf = (y, m, d, h, mi, sex = "male") => computeChart({ date: { y, m, d }, time: { h, mi }, place: findPlace("臺北市"), sex });
const chart = chartOf(1988, 2, 15, 23, 30);
const { analysis, luck } = prepare(chart);
const neutral = luck.map(y => ({ ...y, L: 0, score: 50, reasons: [], m: Object.fromEntries(Object.keys(DOMAINS).map(d => [d, Object.fromEntries(CHANNELS.map(c => [c, 0]))])) }));

test("a life runs from birth to death and the K-line has one candle per year", () => {
  const life = runLife({ chart, analysis, luck, seed: 7 });
  assert.equal(life.done, true);
  assert.ok(life.state.age >= 0 && life.state.age <= MAX_AGE);
  assert.equal(life.kline.length, life.state.age + 1);
  assert.equal(life.log[0].id, "birth");
  assert.equal(life.log[life.log.length - 1].id, "death");
});

test("a written answer kept as written (照我寫的就好) goes into the story with its words and an even outcome", () => {
  const life = createLife({ chart, analysis, luck, seed: 3 });
  let guard = 0;
  while (!life.pending && !life.done && guard++ < 200) life.step();
  assert.ok(life.pending && life.pending.free, "a choice that takes a written answer");
  const mood = life.state.happiness;
  const r = life.chooseAction({ action: "own", summary: "你決定先去環島一圈" });
  assert.ok(!r.infeasible && r.entries.length >= 1);
  const e = r.entries[0];
  assert.equal(e.free, true);
  assert.equal(e.choice, "你決定先去環島一圈");
  assert.match(e.text, /你決定先去環島一圈。你照自己的意思去做了。/);
  assert.equal(e.mood, 0);
  assert.ok(Math.abs(life.state.happiness - mood) < 15, "no big swing from the answer itself");
});

test("the same seed replays the same life", () => {
  const a = runLife({ chart, analysis, luck, seed: 99 }), b = runLife({ chart, analysis, luck, seed: 99 });
  assert.deepEqual(a.log.map(e => e.text), b.log.map(e => e.text));
});

test("interactive mode stops at each choice and finishes after choose()", () => {
  const life = createLife({ chart, analysis, luck, seed: 3 });
  let choices = 0, guard = 0;
  while (!life.done && guard++ < 1000) {
    if (life.pending) { assert.ok(life.pending.options.length >= 2 && life.pending.prompt); life.choose(choices % life.pending.options.length); choices++; }
    else life.step();
  }
  assert.equal(life.done, true);
  assert.ok(choices >= 2, `choices ${choices}`);
});

test("300 lives: no broken text and no contradictory events", () => {
  for (let i = 0; i < 300; i++) {
    const life = runLife({ chart, analysis, luck, seed: 1000 + i });
    for (const e of life.log) assert.ok(e.text && !/[{}]|undefined|null|NaN/.test(e.text), `${e.id}: ${e.text}`);
    const ids = new Set(life.log.map(e => e.id));
    assert.equal(life.state.spells.length, life.state.marriages);
    assert.ok(life.state.spells.every(x => x.to !== null || x === life.state.spells[life.state.spells.length - 1]), "only the last marriage can be open");
    const ids2 = life.log.map(e => e.id);
    assert.ok(ids2.filter(id => id === "startupYear2").length <= ids2.filter(id => id === "startupYear1").length, "every startup outcome follows its first year");
  }
});

test("with neutral luck, simulated lifespans match the life table", () => {
  for (const sex of ["male", "female"]) {
    const c = chartOf(1988, 2, 15, 23, 30, sex);
    const runs = 1500;
    let total = 0;
    for (let i = 0; i < runs; i++) total += runLife({ chart: c, analysis, luck: neutral, seed: 50000 + i }).state.age + 0.5;
    let l = 1, expected = 0;
    for (let age = 0; age <= MAX_AGE; age++) { const q = deathRaw(age, sex, 1988 + age); expected += l * (1 - q / 2); l *= 1 - q; }
    assert.ok(Math.abs(total / runs - expected) < 1.5, `${sex}: simulated ${(total / runs).toFixed(1)} vs table ${expected.toFixed(1)}`);
  }
});

test("100 runs give counts out of 100 and a K-line band", () => {
  const r = rerun({ chart, analysis, luck, runs: 100, key: "t" });
  assert.equal(r.runs, 100);
  assert.equal(r.lifespan.bins.reduce((s, b) => s + b.n, 0), 100);
  for (const k of ["seriousBefore60", "married", "divorced", "university", "homeOwner"]) assert.ok(r[k] >= 0 && r[k] <= 100, k);
  assert.ok(r.band.length > 60 && r.band.every(b => b.p10 <= b.p50 && b.p50 <= b.p90));
  assert.equal(r.hurdles.length, 4);
});

test("each simulated year uses its own 流年: luck[age] is the pillar of birth year + age", async () => {
  const { SixtyCycleYear } = await import("tyme4ts");
  for (const [y, sex] of [[1988, "male"], [2015, "female"], [1953, "male"]]) {
    const c = chartOf(y, 3, 8, 9, 30, sex), p = prepare(c);
    for (const age of [0, 1, 30, 60, 99]) {
      assert.equal(p.luck[age].age, age);
      assert.equal(p.luck[age].xu, age + 1);   // 虛歲
      assert.equal(p.luck[age].year, SixtyCycleYear.fromYear(y + age).getSixtyCycle().getName(), `${y} + ${age}`);
    }
  }
  const life = runLife({ chart, analysis, luck, seed: 7 });
  for (const k of life.kline) assert.equal(k.luck, luck[k.age].score, `age ${k.age}`);
});
