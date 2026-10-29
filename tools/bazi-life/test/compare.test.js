// 準爸媽模式的比較：候選名字跑同一組人生（同樣的種子），所以差別只來自名字；出生時段只比較滿 39 週到 42 週。
import { test } from "node:test";
import assert from "node:assert/strict";
import { findPlace } from "../src/core/places.js";
import { babyCharts, nameCandidates, runSlice, statsOf, simulate, gestation, slotRange, checkSlot, slotEntry, slotOutlook, rankSlots, EARLIEST_WEEKS } from "../src/sim/compare.js";

const place = findPlace("臺北市");
const birth = { date: { y: 2027, m: 3, d: 15 }, time: { h: 10, mi: 0 }, place, sex: "female" };

test("one chart for a known sex, two (same pillars, both sexes) while it is unknown", () => {
  const one = babyCharts(birth), two = babyCharts({ ...birth, sex: "unknown" });
  assert.equal(one.length, 1);
  assert.deepEqual(two.map(c => c.sex), ["male", "female"]);
  assert.deepEqual(two[0].chart.pillars.map(p => p.name), two[1].chart.pillars.map(p => p.name));
  assert.ok(two[0].prep.luck.length > 80 && two[1].prep.luck.length > 80);
});

test("candidate names are read with the baby's chart; a name without Kangxi strokes says so", () => {
  const [c] = babyCharts(birth);
  const list = nameCandidates("林", ["怡君", "宥辰", "㐀㐁"], c.prep.analysis);
  assert.equal(list[0].full, "林怡君");
  assert.ok(list[0].reading.score >= 50 && list[0].reading.score <= 100);
  assert.ok(list[0].info.effects);
  assert.ok(list[2].error && !list[2].reading);
});

test("every name lives the same lives: the same seeds give the same result, slices add up to the whole", () => {
  const charts = babyCharts(birth);
  const [a] = nameCandidates("林", ["怡君"], charts[0].prep.analysis);
  const whole = simulate({ charts, name: a.info, key: "t", runs: 12 });
  assert.deepEqual(simulate({ charts, name: a.info, key: "t", runs: 12 }), whole);
  const sliced = statsOf([...runSlice({ charts, name: a.info, key: "t", runs: 12, from: 0, to: 5 }), ...runSlice({ charts, name: a.info, key: "t", runs: 12, from: 5, to: 12 })]);
  assert.deepEqual(sliced, whole);
  assert.equal(whole.runs, 12);
  for (const k of ["university", "married", "divorced", "home", "promoted"]) assert.ok(whole[k] >= 0 && whole[k] <= 12, k);
  assert.ok(whole.mood >= 0 && whole.mood <= 100);
});

test("with the sex unknown, the runs are split between the boy's and the girl's chart", () => {
  const charts = babyCharts({ ...birth, sex: "unknown" });
  const lives = runSlice({ charts, key: "u", runs: 10 });
  assert.deepEqual(lives.map(l => l.state.sex), [...Array(5).fill("male"), ...Array(5).fill("female")]);
});

test("pregnancy weeks from the due date; slots compare only from 39 weeks to 42 weeks", () => {
  const due = { y: 2027, m: 3, d: 22 };
  assert.equal(gestation(due, due).label, "40 週 0 天");
  assert.equal(gestation({ y: 2027, m: 3, d: 15 }, due).label, "39 週 0 天");
  assert.equal(gestation({ y: 2027, m: 3, d: 14 }, due).label, "38 週 6 天");
  assert.deepEqual(slotRange(due), { from: { y: 2027, m: 3, d: 15 }, to: { y: 2027, m: 4, d: 5 } });
  assert.equal(checkSlot({ date: { y: 2027, m: 3, d: 15 }, time: { h: 9, mi: 0 } }, due), null);
  assert.match(checkSlot({ date: { y: 2027, m: 3, d: 14 }, time: { h: 9, mi: 0 } }, due), new RegExp(`還不到 ${EARLIEST_WEEKS} 週`));
  assert.match(checkSlot({ date: { y: 2027, m: 4, d: 6 }, time: { h: 9, mi: 0 } }, due), /超過 42 週/);
  assert.match(checkSlot({ date: { y: 2027, m: 3, d: 16 }, time: null }, due), /完整/);
  // Across a year boundary.
  assert.deepEqual(slotRange({ y: 2027, m: 1, d: 3 }).from, { y: 2026, m: 12, d: 27 });
});

test("slots are read by their 大運 and ranked by it, then by the simulated mood", () => {
  const due = { y: 2027, m: 3, d: 22 };
  const slots = [{ date: { y: 2027, m: 3, d: 15 }, time: { h: 9, mi: 0 } }, { date: { y: 2027, m: 3, d: 16 }, time: { h: 15, mi: 0 } }];
  const entries = slots.map(s => slotEntry(s, birth));
  for (const e of entries) {
    assert.ok(e.outlook.score >= -1 && e.outlook.score <= 1);
    assert.ok(e.outlook.good + e.outlook.hard <= e.outlook.total);
    assert.equal(checkSlot(e.slot, due), null);
  }
  const ranked = rankSlots(entries.map(e => ({ ...e, stats: { mood: 50 } })));
  assert.ok(ranked[0].outlook.score >= ranked[1].outlook.score);
  // A tie on the outlook falls back to the mood.
  const tie = rankSlots([{ outlook: { score: 0.2 }, stats: { mood: 40 } }, { outlook: { score: 0.2 }, stats: { mood: 60 } }]);
  assert.equal(tie[0].stats.mood, 60);
  // The unknown-sex entry averages both charts' outlooks.
  const both = slotEntry(slots[0], { ...birth, sex: "unknown" });
  assert.equal(both.outlook.parts.length, 2);
  const [m, f] = both.charts.map(c => slotOutlook(c.chart, c.prep.analysis).score);
  assert.equal(both.outlook.score, Math.round((m + f) / 2 * 100) / 100);
});
