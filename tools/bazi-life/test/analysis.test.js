import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, groupOf, elementScores, describeViews, ELEMENTS } from "../src/core/analysis.js";
import { yearEffects, lifeLuck, tilt, clashes, combines, DOMAINS, CHANNELS } from "../src/core/luck.js";
import { fourPillars } from "../src/core/chart.js";

const EXAMPLE = ["戊辰", "甲寅", "辛丑", "戊子"];   // 1988-02-15 23:30, Taipei

test("ten-god groups for a metal day master", () => {
  assert.deepEqual(ELEMENTS.map(e => groupOf("金", e)), ["財", "官殺", "印", "比劫", "食傷"]);
});

test("element scores: stems count 1, branches split by hidden stems, month branch doubled, day stem left out", () => {
  const s = elementScores(EXAMPLE);
  // stems 戊 甲 戊 → 土 2, 木 1; 辰 = 戊 5/8 乙 2/8 癸 1/8; 寅 ×2 = 甲 10/8 丙 4/8 戊 2/8; 丑 = 己 5/8 癸 2/8 辛 1/8; 子 = 癸 1
  assert.equal(+s.土.toFixed(3), 2 + 5 / 8 + 2 / 8 + 5 / 8);
  assert.equal(+s.木.toFixed(3), 1 + 2 / 8 + 10 / 8);
  assert.equal(+s.水.toFixed(3), 1 / 8 + 2 / 8 + 1);
  assert.equal(+s.金.toFixed(3), 1 / 8);
  assert.equal(+s.火.toFixed(3), 4 / 8);
});

test("1988 example: strong metal, 正財格, spring birth so 調候 abstains", () => {
  const a = analyse(EXAMPLE);
  assert.equal(a.strength, "身強");
  assert.equal(a.pattern, "正財格");
  assert.equal(a.schools.調候.abstain, true);
  assert.deepEqual(a.useful.sort(), ["木", "水", "火"].sort());
  assert.deepEqual(a.avoid.sort(), ["土", "金"].sort());
  assert.ok(describeViews(a).some(l => l === "2 派中有 2 派認為喜火（扶抑、格局）"));
});

test("winter and summer births: 調候 votes for fire or water", () => {
  const winter = analyse(["甲子", "丙子", "甲子", "甲子"]);
  assert.equal(winter.season, "冬生");
  assert.equal(winter.schools.調候.element.火, 1);
  assert.equal(winter.schools.調候.element.水, -1);
  const summer = analyse(["甲午", "庚午", "甲午", "庚午"]);
  assert.equal(summer.schools.調候.element.水, 1);
});

test("the strength classes split random charts into three sizeable groups", () => {
  let seed = 11;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const place = { name: "x", lon: 120, lat: 25, tz: "Asia/Shanghai" };
  const count = {};
  for (let i = 0; i < 1200; i++) {
    const d = new Date(Date.UTC(1930, 0, 1) + random() * 90 * 365.25 * 86400000);
    const p = fourPillars({ date: { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }, time: { h: d.getUTCHours(), mi: d.getUTCMinutes() }, place, options: { solar: "clock" } });
    const s = analyse(Object.values(p)).strength;
    count[s] = (count[s] || 0) + 1;
  }
  for (const k of ["身強", "身弱", "中和"]) assert.ok(count[k] / 1200 > 0.18 && count[k] / 1200 < 0.5, `${k} ${count[k]}`);
  assert.ok(((count.從弱 || 0) + (count.專旺 || 0)) / 1200 < 0.03);
});

test("branch relations", () => {
  assert.ok(clashes("子", "午") && clashes("巳", "亥") && !clashes("子", "丑"));
  assert.ok(combines("子", "丑") && combines("寅", "亥") && combines("午", "未") && !combines("子", "午"));
});

test("a year that clashes the day branch makes love and moving more likely to change", () => {
  const a = analyse(EXAMPLE);
  const e = yearEffects(a, EXAMPLE, "乙卯", "辛未", "male");   // 未 clashes 丑
  assert.ok(e.trig.love.change > 0 && e.trig.move.change > 0 && e.trig.health.bad > 0);
  assert.ok(e.reasons.some(r => r.text.includes("沖日支") && r.domains.includes("love")));
  const calm = yearEffects(a, EXAMPLE, "乙卯", "庚子", "male");  // 子 combines 丑
  assert.ok(calm.trig.love.good > 0 && calm.trig.love.change === 0);
});

test("歲運並臨 amplifies, and every multiplier stays within 0.5–2", () => {
  const a = analyse(EXAMPLE);
  const decades = ["乙卯", "丙辰", "丁巳", "戊午", "己未", "庚申", "辛酉", "壬戌", "癸亥", "甲子"];
  const yearAt = age => "甲子乙丑丙寅丁卯戊辰己巳庚午辛未壬申癸酉甲戌乙亥丙子丁丑戊寅己卯庚辰辛巳壬午癸未甲申乙酉丙戌丁亥戊子己丑庚寅辛卯壬辰癸巳甲午乙未丙申丁酉戊戌己亥庚子辛丑壬寅癸卯甲辰乙巳丙午丁未戊申己酉庚戌辛亥壬子癸丑甲寅乙卯丙辰丁巳戊午己未庚申辛酉壬戌癸亥".match(/../g)[(age + 3) % 60];
  const decadeAt = age => age < 7 ? null : decades[Math.min(9, Math.floor((age - 7) / 10))];
  const life = lifeLuck(a, EXAMPLE, "male", decadeAt, yearAt);
  assert.equal(life.length, 100);
  for (const y of life) for (const d of Object.keys(DOMAINS)) for (const c of CHANNELS) assert.ok(Math.abs(y.m[d][c]) <= Math.log(2) + 1e-9);
  assert.ok(life.some(y => y.reasons.some(r => r.text.startsWith("歲運並臨"))));
  for (const d of Object.keys(DOMAINS)) {
    const mean = life.reduce((s, y) => s + y.m[d].change, 0) / life.length;
    assert.ok(Math.abs(mean) < 0.02, `${d} change mean ${mean}`);
  }
});

test("tilt follows the logit rule and is neutral at m = 1", () => {
  assert.equal(tilt(0.2, 0), 0.2);
  assert.ok(Math.abs(tilt(0.2, Math.log(2)) - 1 / 3) < 1e-12);   // odds 0.25 → 0.5
  assert.equal(tilt(0, 1), 0);
});
