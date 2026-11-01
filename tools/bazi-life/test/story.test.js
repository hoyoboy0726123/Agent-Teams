// The story library as a whole: well-formed events, readable sentences in every kind of life, enough options per
// choice, and every general action usable from any choice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace, PLACE_GROUPS } from "../src/core/places.js";
import { prepare } from "../src/sim/setup.js";
import { createLife } from "../src/sim/life.js";
import { makeRng } from "../src/sim/rng.js";
import { ALL_EVENTS, MODULES } from "../src/sim/story/index.js";
import { ACTION_IDS } from "../src/sim/actions.js";

const BROKEN = /[{}]|undefined|null|NaN|\[object|function/;
const TAIWAN = PLACE_GROUPS.filter(g => g.group.startsWith("臺灣・")).map(g => g.places[0]);

// Lives with random births 1950–2025 across Taiwan; choices answered at random, sometimes by a general action.
function lives(n, seed, { freeText = false } = {}) {
  const rng = makeRng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const y = 1950 + rng.int(76), m = 1 + rng.int(12), d = 1 + rng.int(28);
    const chart = computeChart({ date: { y, m, d }, time: { h: rng.int(24), mi: rng.int(60) }, place: rng.pick(TAIWAN), sex: rng() < 0.5 ? "male" : "female" });
    const prep = prepare(chart);
    const life = createLife({ chart, analysis: prep.analysis, luck: prep.luck, seed: seed * 1000 + i });
    const choices = [];
    let guard = 0;
    while (!life.done && guard++ < 6000) {
      const p = life.pending;
      if (p) {
        choices.push({ id: p.id, n: p.options.length, prompt: p.prompt, labels: p.options.map(o => o.label) });
        if (freeText && rng() < 0.5) {
          const r = life.chooseAction({ action: rng.pick(ACTION_IDS), summary: "你決定照自己的想法做" });
          if (r.infeasible) { assert.ok(typeof r.infeasible === "string" && r.infeasible.length > 2); life.choose(rng.int(p.options.length)); }
        } else life.choose(rng.int(p.options.length));
      } else life.step();
    }
    assert.ok(life.done, "life finished");
    out.push({ life, choices });
  }
  return out;
}

test("events are well formed and ids are unique", () => {
  const ids = new Set();
  for (const ev of ALL_EVENTS) {
    assert.ok(ev.id && !ids.has(ev.id), `duplicate or missing id ${ev.id}`);
    ids.add(ev.id);
    assert.equal(typeof ev.p, "function", `${ev.id}: p`);
    assert.ok(!!ev.apply !== !!ev.choice, `${ev.id}: exactly one of apply / choice`);
    if (ev.channel) assert.ok(["good", "bad", "change"].includes(ev.channel) && ev.domain, `${ev.id}: channel needs a domain`);
  }
});

test("500 lives across eras and places read cleanly, and choices offer enough options", () => {
  const all = lives(500, 7);
  const counts = [];
  for (const { life, choices } of all) {
    for (const e of life.log) assert.ok(e.text && !BROKEN.test(e.text), `${e.id}: ${e.text}`);
    for (const c of choices) {
      assert.ok(c.prompt && !BROKEN.test(c.prompt), `${c.id} prompt: ${c.prompt}`);
      assert.ok(c.labels.every(l => l && !BROKEN.test(l)), `${c.id} labels`);
      assert.ok(c.n >= 2, `${c.id} has ${c.n} options`);
      counts.push(c.n);
    }
  }
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  assert.ok(mean >= 4, `options per choice ${mean.toFixed(2)}`);
});

test("every story module's events happen somewhere in 500 lives", () => {
  const fired = new Set();
  for (const { life } of lives(500, 11)) for (const e of life.log) fired.add(e.id);
  for (const [name, events] of Object.entries(MODULES)) {
    const silent = events.filter(e => !e.rare && !fired.has(e.id)).map(e => e.id);
    assert.ok(silent.length <= Math.max(1, Math.floor(events.length * 0.1)), `${name}: never happened: ${silent.join(", ")}`);
  }
});

test("every general action can answer any choice without breaking the story", () => {
  for (const { life } of lives(120, 23, { freeText: true })) {
    for (const e of life.log) assert.ok(e.text && !BROKEN.test(e.text), `${e.id}: ${e.text}`);
  }
});

// A life born in 1995 in Taipei, played by `answer(life, pending)` until it ends.
function play(seed, answer, opts = {}) {
  const chart = computeChart({ date: { y: 1995, m: 3, d: 8 }, time: { h: 9, mi: 30 }, place: findPlace("臺北市"), sex: seed % 2 ? "male" : "female" });
  const prep = prepare(chart);
  const life = createLife({ chart, analysis: prep.analysis, luck: prep.luck, seed, ...opts });
  let guard = 0;
  while (!life.done && guard++ < 6000) {
    if (life.pending) answer(life, life.pending); else life.step();
  }
  return life;
}

test("a child or a teen who writes an adult decision is told why it cannot happen yet", () => {
  const ADULT = ["marry", "buyHome", "lottery", "borrow", "emigrate", "affair", "noChild", "careerSwitch"];
  let asked = 0;
  for (let seed = 1; seed <= 40 && asked < 30; seed++) {
    play(seed, (life, p) => {
      const s = life.state;
      if (s.age < 15 && asked < 30) {
        asked++;
        for (const id of ADULT) {
          const r = life.chooseAction({ action: id, summary: "你決定這麼做" });
          assert.ok(r.infeasible, `${id} at ${s.age}`);
        }
        // 進修 for a child means studying harder, not an adult course
        const r = life.chooseAction({ action: "study", summary: "你決定更用功" });
        assert.ok(!r.infeasible && !s.arcs.study, "a child's study is not an adult course");
        return;
      }
      life.choose(0);
    });
  }
  assert.ok(asked >= 10, `only ${asked} childhood choices found`);
});

test("a written answer opens with what the choice was about", () => {
  let checked = 0;
  for (let seed = 50; seed <= 60; seed++) {
    play(seed, (life, p) => {
      const m = /^([^。？?！!]+)[。！!]/.exec(p.prompt);
      if (m && life.state.age >= 20 && checked < 20) {
        const before = life.log.length;
        const r = life.chooseAction({ action: "rest", summary: "你決定先休息一下" });
        if (!r.infeasible) {
          checked++;
          const e = life.log.slice(before).find(x => x.id === p.id);
          assert.ok(e && e.text.startsWith(`${m[1].trim()}。你決定先休息一下。`), e && e.text);
          return;
        }
      }
      life.choose(0);
    });
  }
  assert.ok(checked >= 10, `only ${checked} written answers checked`);
});

test("a storyline moves on after a written answer instead of asking the same thing again", () => {
  let seen = 0;
  for (let seed = 100; seed <= 160 && seen < 6; seed++) {
    let started = false, answered = null;
    play(seed, (life, p) => {
      const s = life.state;
      if (!started && s.age >= 25 && s.age <= 45) {
        // start a startup storyline by writing it
        if (!life.chooseAction({ action: "startup", summary: "你決定自己開店" }).infeasible) { started = true; return; }
      }
      if (p.id === "startupYear1") {
        // the same storyline (same start) is never asked its first-year question twice
        assert.notEqual(s.arcs.startup.since, answered, "startupYear1 asked again after a written answer");
        answered = s.arcs.startup.since; seen++;
        life.chooseAction({ action: "wait", summary: "你決定先觀察看看" });
        return;
      }
      life.choose(p.options.length - 1);
    });
  }
  assert.ok(seen >= 3, `startupYear1 reached in only ${seen} lives`);
});

test("with 只問人生大事, only the big decisions are asked and the rest follow the personality", () => {
  const major = new Set([...MODULES.CORE, ...MODULES.WORK].map(e => e.id));
  let picked = 0;
  for (let seed = 200; seed < 210; seed++) {
    const life = play(seed, (l, p) => { assert.ok(major.has(p.id), `${p.id} asked`); l.choose(0); }, { majorOnly: true });
    picked += life.log.filter(e => e.picked).length;
  }
  assert.ok(picked > 50, `${picked} everyday choices followed the personality`);
});

test("story choices are paced: at most one a year besides the core ones", () => {
  const core = new Set(MODULES.CORE.map(e => e.id));
  for (const { life } of lives(60, 31)) {
    const byYear = new Map();
    for (const e of life.log) if (e.asked && !core.has(e.id)) byYear.set(e.age, (byYear.get(e.age) || 0) + 1);
    for (const [age, n] of byYear) assert.ok(n <= 1, `${n} story choices at ${age}`);
  }
});
