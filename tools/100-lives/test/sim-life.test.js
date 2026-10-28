// The life engine: a whole life, choices, determinism, the 100 reruns, and the bounds of the chart's tilts.
// Modules of the other tracks that are not in yet (data, chart engine, story) are replaced by the stand-ins in
// test/sim-stubs/; the engine checks run on the stand-in story so they do not move when the real story changes, and a
// last test runs the real story when it is there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSim } from "./sim-stubs/load.js";

const m = await loadSim();
const { seam, life: L, monte, rates: R } = m;
const STUB = m.stubStory.ALL_EVENTS;
const input = (y = 1988, sex = "female") => ({ date: { y, m: 8, d: 3 }, time: { h: 14, mi: 30 }, place: { name: "Columbus", state: "OH", lat: 39.96, lon: -83.0, tz: "America/New_York" }, sex });
const prep = m.setup.prepare(input(), { name: "Jane Doe" });

test("a life runs from birth to death, one K-line candle a year", () => {
  for (const seed of [1, 7, 42]) {
    const life = L.runLife({ prep, seed, events: STUB });
    assert.equal(life.done, true);
    assert.ok(life.state.age >= 0 && life.state.age <= L.MAX_AGE);
    assert.equal(life.kline.length, life.state.age + 1);
    assert.equal(life.log[0].id, "birth");
    assert.equal(life.log[life.log.length - 1].id, "death");
    assert.match(life.log[0].text, /Columbus, Ohio/);
    for (const e of life.log) assert.ok(typeof e.text === "string" && e.text.length && !/[{}]|undefined|NaN/.test(e.text), e.text);
  }
});

test("the prep follows the seam: luck for every age, traits in 0..1, a guarded jobFit, an intro", () => {
  assert.equal(prep.luck.length, L.MAX_AGE + 1);
  for (const [i, y] of prep.luck.entries()) {
    assert.equal(y.age, i);
    assert.ok(y.L >= -1 && y.L <= 1 && y.score >= 0 && y.score <= 100);
    for (const d of seam.DOMAINS) for (const c of seam.CHANNELS) assert.ok(Math.abs(y.m[d][c]) <= seam.LN2 + 1e-12);
  }
  for (const k of seam.TRAITS) assert.ok(prep.traits0[k] >= 0 && prep.traits0[k] <= 1);
  const f = prep.jobFit(m.world.JOBS.college[0]);
  assert.ok(f >= -1 && f <= 1);
  assert.equal(typeof prep.intro, "string");
  assert.equal(prep.name, "Jane Doe");
  assert.equal(prep.family, null);
  assert.equal(prep.input.date.y, 1988);
});

test("the same seed lives the same life; another seed another", () => {
  const a = L.runLife({ prep, seed: 11, events: STUB }), b = L.runLife({ prep, seed: 11, events: STUB }), c = L.runLife({ prep, seed: 12, events: STUB });
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(a.kline, b.kline);
  assert.notDeepEqual(a.log.map(e => e.text), c.log.map(e => e.text));
});

test("the 100 reruns are deterministic per key, and differ between keys", () => {
  const one = monte.rerun({ prep, runs: 40, key: "jane-1988", events: STUB });
  const two = monte.rerun({ prep, runs: 40, key: "jane-1988", events: STUB });
  const other = monte.rerun({ prep, runs: 40, key: "someone-else", events: STUB });
  assert.deepEqual(one, two);
  assert.notDeepEqual(one.lifespan, other.lifespan);
  assert.equal(one.runs, 40);
  assert.equal(one.lifespan.bins.reduce((s, b) => s + b.n, 0), 40);
  assert.equal(one.kids.reduce((s, k) => s + k.runs, 0), 40);
  for (const h of one.hurdles) for (const y of h.years) assert.ok(y.lnm >= 0.2 && y.hits >= 0 && y.hits <= 40);
  assert.equal(one.partner, null);
});

test("a choice stops the year; a button, a written action and the player's own words all go on", () => {
  const life = L.createLife({ prep, seed: 3, events: STUB });
  let guard = 0;
  while (!life.pending && !life.done && guard++ < 200) life.step();
  assert.ok(life.pending && life.pending.options.length >= 2 && life.pending.free, "a choice that takes a written answer");
  const age = life.state.age;
  const r = life.chooseAction({ action: L.OWN, summary: "You decide to hitchhike to California" });
  assert.ok(!r.infeasible && r.entries.length >= 1);
  assert.equal(r.entries[0].free, true);
  assert.match(r.entries[0].text, /You decide to hitchhike to California\. You did it your own way\./);
  assert.equal(r.entries[0].mood, 0);
  assert.ok(life.state.age === age + 1 || life.done);
  // Next choice: a button.
  guard = 0;
  while (!life.pending && !life.done && guard++ < 200) life.step();
  if (life.pending) { const n = life.log.length; life.choose(0); assert.ok(life.log.length > n); }
  // Something impossible right now comes back with the reason, and the choice stays open.
  guard = 0;
  while (!life.pending && !life.done && guard++ < 200) life.step();
  if (life.pending && life.state.rel !== "dating") {
    const r2 = life.chooseAction({ action: "marry", summary: "" });
    assert.ok(r2.infeasible && /seeing anyone|already married|marry/.test(r2.infeasible));
    assert.ok(life.pending, "still waiting for an answer");
  }
});

test("a written answer is told after the situation it answers (topicOf)", () => {
  assert.equal(L.topicOf({ prompt: "Your company is laying people off, and your name is on the list. What now?" }), "Your company is laying people off, and your name is on the list");
  assert.equal(L.topicOf({ prompt: "Dr. Patel says the results are in. What do you do?" }), "Dr. Patel says the results are in");
  assert.equal(L.topicOf({ prompt: "What do you do?" }), "");
  assert.equal(L.topicOf({ prompt: "x", topic: "A friend wants to open a food truck with you" }), "A friend wants to open a food truck with you");
  assert.match(L.situationContext({ age: 34, sex: "female", studying: false, retired: false, employed: true, job: { title: "registered nurse" }, done: new Set(["firstJob"]), rel: "married", kids: [1, 2], savings: 1.2 }), /^34 years old, female, works as a registered nurse, married, 2 children, some savings$/);
});

test("the chart's tilts stay within ±ln 2, whatever the chart engine sends", () => {
  // A broken chart engine: huge, missing and non-numeric tilts, a reason without text, scores out of range.
  const wild = seam.makePrep({
    luck: Array.from({ length: 60 }, (_, age) => ({ age, L: 9, score: 400, m: { career: { good: 50, bad: -50 }, love: { change: NaN }, health: { bad: age % 2 ? 7 : -7 } }, reasons: [{ text: 5 }, { domains: ["career"], text: "Mars on your Midheaven" }] })),
    traits0: { drive: 3, caution: -1 }, jobFit: () => 99, intro: 42,
  }, { input: input() });
  assert.equal(wild.luck.length, L.MAX_AGE + 1);
  for (const y of wild.luck) {
    assert.ok(y.L === 1 && y.score === 100);
    assert.equal(y.reasons.length, 1);
    for (const d of seam.DOMAINS) for (const c of seam.CHANNELS) assert.ok(Number.isFinite(y.m[d][c]) && Math.abs(y.m[d][c]) <= seam.LN2);
  }
  assert.equal(wild.jobFit(m.world.JOBS.basic[0]), 1);
  assert.deepEqual([wild.traits0.drive, wild.traits0.caution, wild.traits0.warmth], [1, 0, 0.5]);
  assert.equal(wild.intro, "");
  // In a life, every domain's odds each year sit between p tilted by −ln 2 and by +ln 2, and the birth year is untilted.
  const life = L.createLife({ prep: wild, seed: 5, auto: true, events: STUB });
  const p = 0.2, lo = seam.tilt(p, -seam.LN2), hi = seam.tilt(p, seam.LN2);
  for (let year = 0; year < 70 && !life.done; year++) {
    for (const d of seam.DOMAINS) for (const c of seam.CHANNELS) {
      const q = life.ctx.odds(d, c, p);
      assert.ok(q >= lo - 1e-12 && q <= hi + 1e-12, `${d}.${c} at ${life.state.age}: ${q}`);
      if (life.state.age === 0) assert.equal(q, p);
    }
    assert.equal(life.ctx.odds("nonsense", "good", p), p, "an unknown domain is not tilted");
    life.step();
  }
  // ±ln 2 is at most a doubling of the odds.
  assert.ok(Math.abs(hi / (1 - hi) / (p / (1 - p)) - 2) < 1e-9);
});

test("the family hook tilts within ±0.15, never a grave event, and is off by default", () => {
  const s = {};
  const ctx = { family: { tilt: () => 5 } };
  assert.equal(L.personalTilt({ domain: "love", channel: "good" }, s, ctx), L.FAMILY_TILT);
  assert.equal(L.personalTilt({ domain: "love", channel: "bad" }, s, { family: { tilt: () => -5 } }), -L.FAMILY_TILT);
  assert.equal(L.personalTilt({ domain: "health", channel: "bad", grave: true }, s, ctx), 0);
  assert.equal(L.personalTilt({ domain: "love", channel: "good" }, s, { family: null }), 0);
  assert.equal(L.personalTilt({ domain: "love" }, s, ctx), 0);
});

test("the personality starts from traits0 and stays within 0.05..0.95", () => {
  const lean = seam.makePrep({ luck: [], traits0: { drive: 0.9, caution: 0.1, warmth: 0.5, curiosity: 0.5, health: 0.5 } }, { input: input() });
  let drive = 0, caution = 0;
  for (let i = 0; i < 60; i++) {
    const life = L.runLife({ prep: lean, seed: 100 + i, events: STUB });
    for (const v of Object.values(life.state.traits)) assert.ok(v >= 0.05 && v <= 0.95);
    drive += life.state.traitBase.drive; caution += life.state.traitBase.caution;
  }
  assert.ok(drive / 60 > 0.75 && caution / 60 < 0.25);
});

test("with no chart at all, lifespan follows the life tables (within 2 years)", () => {
  for (const [sex, y] of [["male", 1960], ["female", 1975]]) {
    const neutral = seam.neutralPrep(input(y, sex));
    let l = 1, e = 0;
    for (let x = 0; x <= 120; x++) { const d = l * R.deathRaw(x, sex, y + x); e += l - d / 2; l -= d; }
    let sum = 0;
    const n = 800;
    for (let i = 0; i < n; i++) sum += L.runLife({ prep: neutral, seed: 5000 + i, events: STUB }).state.age + 0.5;
    assert.ok(Math.abs(sum / n - e) < 2, `${sex} ${y}: simulated ${(sum / n).toFixed(2)} vs table ${e.toFixed(2)}`);
  }
});

test("the real story runs whole lives on the engine", { skip: m.stubbed["sim/story/index.js"] && "story track not in yet" }, () => {
  assert.ok(Array.isArray(m.story.ALL_EVENTS) && m.story.ALL_EVENTS.length > 10);
  for (const seed of [1, 2, 3, 4, 5]) {
    const life = L.runLife({ prep, seed });
    assert.equal(life.log[0].id, "birth");
    assert.equal(life.log[life.log.length - 1].id, "death");
    assert.equal(life.kline.length, life.state.age + 1);
  }
  const r = monte.rerun({ prep, runs: 20, key: "real-story" });
  assert.equal(r.runs, 20);
});

test("expecting parents: birth slots from 39 weeks, the same seeds for every slot", () => {
  const { compare } = m;
  const due = { y: 2026, m: 6, d: 15 };
  assert.equal(compare.gestation(due, due).label, "40 weeks 0 days");
  assert.deepEqual(compare.slotRange(due), { from: { y: 2026, m: 6, d: 8 }, to: { y: 2026, m: 6, d: 29 } });
  assert.match(compare.checkSlot({ date: { y: 2026, m: 6, d: 1 }, time: { h: 9, mi: 0 } }, due), /before 39 weeks/);
  assert.equal(compare.checkSlot({ date: { y: 2026, m: 6, d: 10 }, time: { h: 9, mi: 0 } }, due), null);
  const birth = { place: input().place, sex: "unknown" };
  const entry = compare.slotEntry({ date: { y: 2026, m: 6, d: 12 }, time: { h: 9, mi: 0 } }, birth);
  assert.equal(entry.charts.length, 2);
  assert.ok(entry.outlook.score >= 0 && entry.outlook.score <= 100);
  const a = compare.simulate({ charts: entry.charts, key: "slot", runs: 10, events: STUB }), b = compare.simulate({ charts: entry.charts, key: "slot", runs: 10, events: STUB });
  assert.deepEqual(a, b);
  assert.equal(a.runs, 10);
});
