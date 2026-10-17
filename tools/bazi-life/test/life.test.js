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

// Plays a life, answering the questions with `answer(pending, life)`: { button }, { action }, or nothing for the
// auto choice. Returns what was asked (age, id, prompt) and the state at the end.
function drive({ sex = "female", seed = 11, until = 32, year = 1980, answer }) {
  const c = chartOf(year, 3, 5, 9, 0, sex), p = prepare(c);
  const life = createLife({ chart: c, analysis: p.analysis, luck: p.luck, seed });
  const asked = [];
  for (let guard = 0; guard < 600 && !life.done && life.state.age <= until; guard++) {
    if (!life.pending) { life.step(); continue; }
    const q = life.pending;
    asked.push({ age: life.state.age, id: q.id, prompt: q.prompt, labels: q.options.map(o => o.label) });
    const a = answer(q, life);
    if (a && a.button) life.choose(q.options.findIndex(o => o.id === a.button));
    else if (a && a.action) life.chooseAction({ action: a.action, summary: "你決定照自己的想法走" });
    else life.autoChoose();
  }
  return { asked, s: life.state, log: life.log };
}
const vocational = q => (q.id === "exam15" ? { button: "exam15.vocational" } : null);

test("the first job's question does not tell the graduation again; right after the service it says 退伍", () => {
  for (const sex of ["female", "male"]) {
    const { asked } = drive({ sex, answer: q => vocational(q) || (q.id === "exam18" ? { button: "exam18.work" } : null) });
    const job = asked.find(x => x.id === "firstJob");
    assert.ok(job, sex);
    assert.doesNotMatch(job.prompt, /畢業/, `${sex}: ${job.prompt}`);
    assert.match(job.prompt, sex === "male" ? /^退伍了，開始找工作/ : /^開始找工作了/, job.prompt);
  }
});

test("a written answer at a school gate closes it: the question is not asked again, and a graduate leaves school", () => {
  for (const action of ["own", "jobSearch", "travel"]) {
    const { asked } = drive({ answer: q => vocational(q) || (q.id === "exam18" ? { action } : null) });
    assert.equal(asked.filter(x => x.id === "exam18").length, 1, `exam18 asked again after a written ${action}`);
  }
  const retake = drive({ answer: q => vocational(q) || (q.id === "exam18" && !q.prompt.includes("重考") ? { action: "study" } : null) });
  assert.ok(retake.asked.filter(x => x.id === "exam18").length >= 2, "a written 重考 sits the exam again");
  for (const action of ["own", "travel"]) {
    const { asked, s } = drive({ answer: q => (q.id === "exam15" ? { button: "exam15.high" } : q.id === "exam18" ? { button: "exam18.go" } : q.id === "graduateUni" ? { action } : null) });
    assert.ok(asked.some(x => x.id === "graduateUni"), action);
    assert.equal(s.studying, false, `still a student after a written ${action} at graduation`);
    assert.ok(asked.some(x => x.id === "firstJob"), `no first job after a written ${action} at graduation`);
  }
  const fifteen = drive({ until: 20, answer: q => (q.id === "exam15" ? { action: "own" } : null) });
  assert.ok(fifteen.asked.some(x => x.id === "exam18"), "a written answer at 15 goes on to 高中 and its exam at 18");
  const work15 = drive({ until: 20, answer: q => (q.id === "exam15" ? { action: "jobSearch" } : null) });
  assert.ok(!work15.asked.some(x => x.id === "exam18") && !work15.s.studying, "a written answer about working at 15 leaves school");
});

test("the exam after 高職 is the vocational one into 科大, and after 高中 the university one", () => {
  const cases = [
    { year: 1980, track: "exam15.vocational", exam: "四技二專聯招", go: "去讀科大" },
    { year: 1990, track: "exam15.vocational", exam: "統測", go: "去讀科大" },
    { year: 1980, track: "exam15.high", exam: "大學聯考", go: "去讀大學" },
    { year: 1990, track: "exam15.high", exam: "學測", go: "去讀大學" },
  ];
  for (const c of cases) {
    const { asked } = drive({ year: c.year, until: 19, answer: q => (q.id === "exam15" ? { button: c.track } : q.id === "exam18" ? { button: "exam18.go" } : null) });
    const q = asked.find(x => x.id === "exam18");
    assert.ok(q && q.prompt.includes(c.exam), `${c.year} ${c.track}: ${q && q.prompt}`);
    assert.ok(q.labels.includes(c.go), `${c.year} ${c.track}: ${q.labels.join("/")}`);
    if (c.track === "exam15.vocational") assert.doesNotMatch(q.prompt, /大學聯考|學測/);
  }
  // Through to graduation the story names the school: 科大畢業, not 大學畢業.
  for (const button of ["uni.work", "uni.master", "uni.rest"]) {
    const { asked, log } = drive({ until: 24, answer: q => (q.id === "exam15" ? { button: "exam15.vocational" } : q.id === "exam18" ? { button: "exam18.go" } : q.id === "graduateUni" ? { button } : null) });
    const grad = log.find(e => e.id === "graduateUni");
    assert.ok(asked.some(x => x.id === "graduateUni" && /^科大畢業了/.test(x.prompt)) && grad, button);
    assert.match(grad.text, /科大|四年|學士服/, grad.text);
    assert.doesNotMatch(grad.text, /大學畢業/, grad.text);
  }
});
