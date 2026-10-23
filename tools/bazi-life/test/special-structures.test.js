// 從格與專旺：each kind turns up in random charts, its 喜忌 follow what the 詳批 says it fears, and 調候 and 格局 step aside.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { analyse, FOLLOW } from "../src/core/analysis.js";
import { natalReading } from "../src/core/reading-natal.js";
import { makeRng } from "../src/sim/rng.js";

const KINDS = [...Object.keys(FOLLOW), "專旺"];
const chartAt = (y, m, d, h, sex = "male") => computeChart({ date: { y, m, d }, time: { h, mi: 0 }, place: findPlace("臺北市"), sex });

function specials(n, seed) {
  const rng = makeRng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const c = chartAt(1930 + rng.int(96), 1 + rng.int(12), 1 + rng.int(28), rng.int(24), rng() < 0.5 ? "male" : "female");
    const a = analyse(c.pillars.map(p => p.name));
    if (a.special) out.push({ c, a });
  }
  return out;
}

test("in 8,000 random charts every kind of 從格 and 專旺 turns up, and each one's 喜忌 match what it fears", () => {
  const found = specials(8000, 11), seen = Object.fromEntries(KINDS.map(k => [k, 0]));
  for (const { c, a } of found) {
    const id = c.pillars.map(p => p.name).join(" "), fav = g => a.favor[a.groups[g]];
    seen[a.special.kind]++;
    assert.ok(a.schools.調候.abstain && a.schools.格局.abstain, `${id}: the other schools step aside`);
    if (a.strength === "從弱") {
      assert.ok(fav("印") < 0, `${id} ${a.special.name}: 印 is feared`);
      if (a.special.kind !== "從兒") assert.ok(fav("比劫") < 0, `${id} ${a.special.name}: 比劫 is feared`);
      if (a.special.kind === "從殺") assert.ok(fav("食傷") < 0, `${id}: 從殺 fears 食傷`);
      if (a.special.kind === "從兒") assert.ok(fav("官殺") < 0 && fav("食傷") > 0, `${id}: 從兒 likes 食傷 and not 官殺`);
      for (const g of ["印", "比劫"]) assert.ok(!a.useful.includes(a.groups[g]), `${id}: ${g} is not useful`);
    } else {
      assert.ok(fav("官殺") < 0 && fav("比劫") > 0, `${id} ${a.special.name}`);
      const season = { 曲直格: "寅卯辰", 炎上格: "巳午未", 稼穡格: "辰戌丑未", 從革格: "申酉戌", 潤下格: "亥子丑" }[a.special.name];
      if (season) assert.ok(season.includes(c.pillars[1].branch.name), `${id}: ${a.special.name} only in its season`);
    }
    // The 詳批 names the structure, and its 用神 section takes the same side.
    const r = natalReading(c, a), text = JSON.stringify(r);
    assert.ok(text.includes(a.special.name), `${id}: the reading names ${a.special.name}`);
    assert.ok(!/寒暖適中/.test(text), `${id}: no stale 調候 line`);
  }
  for (const k of KINDS) assert.ok(seen[k] > 0, `${k} never turned up: ${JSON.stringify(seen)}`);
});

test("a single school chosen by the reader is not set aside by a 從格", () => {
  const [{ c }] = specials(3000, 11).filter(x => x.a.strength === "從弱");
  const names = c.pillars.map(p => p.name);
  for (const school of ["調候", "格局"]) {
    const a = analyse(names, { school });
    assert.ok(!a.schools[school].abstain, school);
    assert.ok(Object.values(a.favor).some(v => v !== 0), `${school}: the chosen school still votes`);
  }
});

// Every 成格 and 破格 rule of the 詳批 fires somewhere, and three of them agree with a check written from the stems alone.
import { patternFacts } from "../src/core/reading-natal.js";
const STEM_EL = { 甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水" };
const GEN = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" }, CTRL = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
const yang = s => "甲丙戊庚壬".includes(s);
function godOf(dm, s) {   // the ten god of stem s for day stem dm, from the elements alone
  const a = STEM_EL[dm], b = STEM_EL[s], same = yang(dm) === yang(s);
  if (a === b) return same ? "比肩" : "劫財";
  if (GEN[a] === b) return same ? "食神" : "傷官";
  if (CTRL[a] === b) return same ? "偏財" : "正財";
  if (CTRL[b] === a) return same ? "七殺" : "正官";
  return same ? "偏印" : "正印";
}
test("every 成格／破格 rule fires in random charts, and 傷官見官、官殺混雜、梟神奪食 match a check from the stems", () => {
  const rng = makeRng(23), fired = new Set();
  const RULES = ["傷官見官", "官殺混雜", "梟神奪食", "財多身弱", "奪財之憂", "身弱難以任官", "財星生殺而無制", "身弱殺重而無制化", "財星透出壞印", "印多身旺而缺少出口", "身弱洩氣太過", "比劫透出而無制", "缺少透出的官殺或食傷來疏導",
    "食神制殺", "傷官駕殺", "印星化殺", "傷官佩印", "食神生財", "傷官生財", "建祿用官", "官星制刃", "陽刃駕殺", "食傷洩秀"];
  for (let i = 0; i < 6000; i++) {
    const c = chartAt(1930 + rng.int(96), 1 + rng.int(12), 1 + rng.int(28), rng.int(24));
    const names = c.pillars.map(p => p.name), a = analyse(names), f = patternFacts(c, a);
    const text = [...f.good, ...f.bad].join("；");
    for (const r of RULES) if (text.includes(r)) fired.add(r);
    if (a.special) { assert.ok(!f.good.length && !f.bad.length, `${names}: a special structure has no ordinary 成敗`); continue; }
    const dm = names[2][0], others = names.filter((_, k) => k !== 2).map(n => n[0]), gods = new Set(others.map(s => godOf(dm, s)));
    if (a.pattern === "正官格") {
      assert.equal(text.includes("官殺混雜"), gods.has("七殺"), `${names}: 官殺混雜`);
    }
    if (a.pattern === "偏印格" && text.includes("梟神奪食")) assert.ok(gods.has("食神"), `${names}: 梟神奪食 needs a visible 食神`);
    if (text.includes("傷官見官")) assert.ok(gods.has("傷官") || a.pattern === "傷官格", `${names}: 傷官見官 needs 傷官`);
  }
  const missing = RULES.filter(r => !fired.has(r));
  assert.deepEqual(missing, [], `rules that never fired: ${missing.join("、")}`);
});
