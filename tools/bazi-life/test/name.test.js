import { test } from "node:test";
import assert from "node:assert/strict";
import { strokesOf, splitName, fiveGrids, shuli, sancai, analyseName, nameTilt, describeEffects } from "../src/core/name.js";
import { personalTilt } from "../src/sim/life.js";
import { EVENTS, deathEvent } from "../src/sim/events.js";
import { familyTilts } from "../src/core/family.js";
import { ALL_NAME_PARTS } from "../src/sim/random-name.js";
import { DOMAINS } from "../src/core/luck.js";

test("Kangxi strokes count radicals in their full form, and disputed characters keep every reading", () => {
  // 氵 counts as 水 (4), 阝 as 阜 or 邑 (8 or 7), 艹 as 艸 (6), 忄 as 心 (4)
  const expected = { 王: 4, 河: 9, 陳: 16, 陽: 17, 華: 14, 芳: 10, 怡: 9, 君: 7, 張: 11, 簡: 18, 歐: 15, 范: 11, 岳: 8 };
  for (const [ch, n] of Object.entries(expected)) assert.equal(strokesOf(ch).primary, n, ch);
  // numerals count by value; 萬 is 15 under 艸; 研 is 11 in its Kangxi form 硏
  assert.deepEqual(strokesOf("四").all, [4, 5]);
  assert.deepEqual(strokesOf("萬").all, [15, 13]);
  assert.deepEqual(strokesOf("研").all, [9, 11]);
  assert.equal(strokesOf("𠀋"), null);
});

test("the five grids follow the formulas for single and compound surnames", () => {
  assert.deepEqual(fiveGrids([16], [9, 7]), { 天格: 17, 人格: 25, 地格: 16, 外格: 8, 總格: 32 });        // 陳怡君
  assert.deepEqual(fiveGrids([4], [8]), { 天格: 5, 人格: 12, 地格: 9, 外格: 2, 總格: 12 });            // 王明: 假一 on both ends
  assert.deepEqual(fiveGrids([11, 18], [6, 9]), { 天格: 29, 人格: 24, 地格: 15, 外格: 20, 總格: 44 });  // 張簡成研
  assert.deepEqual(fiveGrids([15, 17], [8]), { 天格: 32, 人格: 25, 地格: 9, 外格: 16, 總格: 40 });      // 歐陽明
  assert.equal(fiveGrids([30], [30, 30]).總格, 10);   // past 81 the count starts over (90 − 80)
});

test("compound surnames are recognised only with a given name after them", () => {
  assert.deepEqual(splitName("張簡成研"), { surname: ["張", "簡"], given: ["成", "研"] });
  assert.deepEqual(splitName("歐陽 娜娜"), { surname: ["歐", "陽"], given: ["娜", "娜"] });
  assert.deepEqual(splitName("張簡"), { surname: ["張"], given: ["簡"] });
  assert.deepEqual(splitName("陳怡君"), { surname: ["陳"], given: ["怡", "君"] });
});

test("the two 81-number tables agree on 75 numbers; where they differ the number counts as 半吉", () => {
  const differ = [];
  for (let n = 1; n <= 81; n++) if (!shuli(n).agree) differ.push(n);
  assert.deepEqual(differ, [38, 40, 42, 55, 58, 73]);
  for (const n of differ) assert.equal(shuli(n).level, 0);
  assert.equal(shuli(1).level, 1);
  assert.equal(shuli(2).level, -1);
  assert.equal(shuli(81).level, shuli(1).level);   // 81 returns to 1
});

test("a full analysis: 陳怡君 is 吉 in every grid with 三才 金土土; unknown characters are reported", () => {
  const a = analyseName("陳怡君");
  for (const k of ["人格", "地格", "外格", "總格"]) assert.equal(a.grids[k].level, 1, k);
  assert.deepEqual(sancai(17, 25, 16), { elements: "金土土", level: 2, name: "大吉" });
  assert.equal(a.sancai.name, "大吉");
  const disputed = analyseName("陳研");
  assert.equal(disputed.grids.總格.readings, 2);
  assert.deepEqual(disputed.disputed, ["研"]);
  assert.deepEqual(analyseName("王𠀋").missing, ["𠀋"]);
  assert.ok(analyseName("王").error);
});

test("the name tilts each domain by at most ±0.05 and leaves the change channel alone", () => {
  const chartLike = { useful: ["水", "金"], avoid: ["火"] };
  for (const full of ["陳怡君", "王明", "張簡成研", "林美玲", "黃志明"]) {
    const { effects } = analyseName(full, chartLike);
    for (const part of [effects.young, effects.old]) for (const v of Object.values(part)) assert.ok(Math.abs(v) <= 0.05 + 1e-12, `${full}: ${v}`);
    for (const d of Object.keys(DOMAINS)) {
      assert.equal(nameTilt(effects, 20, d, "change"), 0);
      assert.equal(nameTilt(effects, 20, d, "good"), -nameTilt(effects, 20, d, "bad") || 0);
    }
    assert.ok(describeEffects(effects).every(line => /^36 歲以(前|後)：/.test(line)));
  }
});

test("neither the name nor the family charts ever tilt a death or a serious illness", () => {
  const huge = { young: Object.fromEntries(Object.keys(DOMAINS).map(d => [d, 3])), old: Object.fromEntries(Object.keys(DOMAINS).map(d => [d, 3])), split: 36 };
  const tilts = familyTilts({ members: [{ relation: "father", bond: { net: 1 } }, { relation: "mother", bond: { net: 1 } }, { relation: "olderBrother", bond: { net: 1 } }] });
  const grave = [...EVENTS, deathEvent].filter(e => e.grave).map(e => e.id).sort();
  assert.deepEqual(grave, ["childIllness", "death", "fatherDeath", "motherDeath", "serious", "widowed"]);
  for (const age of [5, 30, 70]) {
    for (const ev of [...EVENTS, deathEvent].filter(e => e.grave)) assert.equal(personalTilt(ev, { age, tilts }, huge), 0, ev.id);
    assert.ok(personalTilt(EVENTS.find(e => e.id === "chronic"), { age, tilts }, huge) < 0);
  }
});

test("every random name has Kangxi strokes for each character", () => {
  for (const s of ALL_NAME_PARTS.surnames) for (const g of ALL_NAME_PARTS.given) assert.ok(!analyseName(s + g).error, s + g);
});
