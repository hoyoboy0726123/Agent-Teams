// 從格與專旺：each kind turns up in random charts, its 喜忌 follow what the 詳批 says it fears, and 調候 and 格局 step aside.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { analyse, FOLLOW } from "../src/core/analysis.js";
import { natalReading } from "../src/core/reading-natal.js";
import { makeRng } from "../src/sim/rng.js";

const KINDS = [...Object.keys(FOLLOW), "專旺", "從強"];
// Lean charts (no 排盤-page extras) keep the scans of thousands of births quick; the readings are the same.
const chartAt = (y, m, d, h, sex = "male") => computeChart({ date: { y, m, d }, time: { h, mi: 0 }, place: findPlace("臺北市"), sex }, { lean: true });

const found = new Map();
function specials(n, seed) {
  const key = `${n}|${seed}`;
  if (!found.has(key)) found.set(key, scan(n, seed));
  return found.get(key);
}
function scan(n, seed) {
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

// The review examples: a 食傷生財 chart with almost no metal is 從兒, a 財官 pair with no 食傷 does not like 食傷, and a
// 子-month water chart whose metal (印) outweighs its water is 從強, not 潤下.
test("從勢 needs all three drains, a pair names its own flow, and 印 heavier than 比劫 is 從強", () => {
  const at = (d, h, sex) => { const [y, m, dd] = d.split("-").map(Number), c = chartAt(y, m, dd, h, sex); return analyse(c.pillars.map(p => p.name)); };
  const er = at("1978-06-12", 2, "female");
  assert.equal(er.special.name, "從兒格");
  assert.ok(!er.useful.includes("金"), "the missing 官殺 is not a 喜神");
  const cai = at("1963-12-02", 21, "female");
  assert.equal(cai.special.name, "從財格");
  assert.ok(!cai.useful.includes("金"), "食傷 with a strong 官殺 beside 財 is not liked");
  const qiang = at("2002-01-05", 16, "male");
  assert.equal(qiang.special.name, "從強格");
  assert.ok(!qiang.useful.includes("木") && qiang.useful.includes("金"), "從強 likes 印 and not 食傷");

  for (const { c, a } of specials(8000, 11)) {
    const id = c.pillars.map(p => p.name).join(" "), score = g => a.scores[a.groups[g]];
    if (a.strength === "從弱") {
      const ranked = ["食傷", "財", "官殺"].sort((x, y) => score(y) - score(x));
      assert.ok(a.useful.includes(a.groups[ranked[0]]), `${id}: the heaviest drain is always liked`);
      if (a.special.kind === "從勢") {
        const pair = new Set(ranked.slice(0, 2));
        assert.ok(score(ranked[2]) >= 0.6 * score(ranked[1]) - 0.011 || (pair.has("食傷") && pair.has("官殺")), `${id}: 從勢 only when all three are heavy, or 食傷 faces 官殺`);
        assert.ok(a.favor[a.groups.財] >= a.favor[a.groups.官殺] && a.favor[a.groups.官殺] >= a.favor[a.groups.食傷], `${id}: 從勢 likes 財 most`);
      }
    } else {
      const own = a.scores[a.dayMaster.element], seal = score("印");
      if (a.special.kind === "從強") assert.ok(seal > own - 0.011 && !a.useful.includes(a.groups.食傷), `${id}: 從強 has more 印 and does not like 食傷`);
      else assert.ok(own >= seal - 0.011, `${id}: ${a.special.name} has at least as much 比劫 as 印`);
    }
  }
});

test("the 詳批 of a 從格 or 專旺 chart keeps to its own likes: no 身弱 labels, no warning against its 用神, no stale 調候", () => {
  for (const { c, a } of specials(8000, 11)) {
    const id = c.pillars.map(p => p.name).join(" "), r = natalReading(c, a);
    const sec = k => JSON.stringify(r.sections.find(s => s.id === k));
    if (a.strength === "從弱") {
      assert.doesNotMatch(sec("character"), /財多身弱|官殺重而身弱/, `${id}: character`);
      assert.doesNotMatch(sec("summary"), /古訣/, `${id}: no 古訣 warning against what a 從格 follows`);
    }
    assert.doesNotMatch(sec("pattern"), /行運中兼顧/, `${id}: 調候 steps aside`);
    if (a.schools.調候.stems && a.schools.調候.stems.length) assert.match(sec("pattern"), /調候讓位/, `${id}`);
    if (a.special.kind !== "從勢") assert.doesNotMatch(JSON.stringify(r), /日主從勢/, `${id}: only a 從勢 chart is called 從勢`);
    if (a.dayMaster.stem === "壬") assert.doesNotMatch(JSON.stringify(r), /通根透癸/, `${id}: a 從 or 專旺 壬 does not rush like a rooted one`);
    assert.ok(r.basics.find(b => b.label === "命局").value.includes(a.special.name), `${id}: 命局 names ${a.special.name}`);
  }
});

test("the yearly texts of a 從格 or 專旺 chart do not call it 身弱 or 身強 where it likes the opposite", async () => {
  const { yearReading } = await import("../src/core/reading-year.js");
  let seen = 0;
  for (const { c, a } of specials(8000, 11).slice(0, 40)) {
    for (let age = 1; age <= 80; age += 1) {
      const t = JSON.stringify(yearReading(c, a, age));
      if (a.strength === "專旺") assert.doesNotMatch(t, /身弱逢刃|身弱得比劫/, `${a.special.name} ${age}`);
      if (a.strength === "從弱") assert.doesNotMatch(t, /身強逢/, `${a.special.name} ${age}`);
      seen++;
    }
  }
  assert.ok(seen > 1000);
});

test("a single school chosen by the reader is not set aside by a 從格", () => {
  const [{ c }] = specials(8000, 11).filter(x => x.a.strength === "從弱");
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
