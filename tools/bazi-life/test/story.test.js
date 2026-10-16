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
