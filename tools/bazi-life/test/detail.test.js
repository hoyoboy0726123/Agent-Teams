// 命盤細節：神煞、刑沖合害、旺相休囚死、太歲、調候用神。
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { analyse } from "../src/core/analysis.js";
import {
  natalStars, luckStars, relationsAmong, natalRelations, luckRelations, seasonalStates, taisui, strengthFactors, elementRoles,
  tiaohouStems, punish, STARS, SPIRITS,
} from "../src/core/detail.js";

const chart = (y, m, d, h, mi, sex = "male") => computeChart({ date: { y, m, d }, time: h === null ? null : { h, mi }, place: findPlace("臺北市"), sex });
const items = list => list.map(([role, name]) => ({ role, stem: name[0], branch: name[1], name }));
const kinds = rel => rel.map(r => r.kind).sort();

test("natal stars of 戊辰 甲寅 辛丑 戊子 (1988-02-15 23:30, male) follow the classical tables", () => {
  const c = chart(1988, 2, 15, 23, 30);
  assert.deepEqual(c.pillars.map(p => p.name), ["戊辰", "甲寅", "辛丑", "戊子"]);
  assert.deepEqual(natalStars(c), {
    year: ["太極貴人", "空亡"],                                              // 戊 → 辰戌丑未; 辰 is in the day's 旬空 辰巳
    month: ["天乙貴人", "太極貴人", "驛馬", "飛刃", "劫煞"],                   // 辛 → 午寅; 辰 → 驛馬寅; 丑 → 劫煞寅
    day: ["天乙貴人", "太極貴人", "國印貴人", "月德合", "天醫", "寡宿", "勾絞"],  // 戊 → 丑未; 寅月 → 天醫丑; 辰 → 寡宿丑
    hour: ["文昌貴人", "天廚貴人", "學堂", "將星"],                           // 辛 → 文昌子; 辰 → 將星子
  });
  for (const list of Object.values(natalStars(c))) for (const s of list) assert.ok(STARS[s], s);
});

test("the stars that differ between schools use the documented choice", () => {
  // 寡宿 from the year branch: 寅卯辰 → 丑 (not the 流霞 table); 十惡大敗 includes 己丑.
  const c = chart(1988, 2, 15, 23, 30);
  assert.ok(natalStars(c).day.includes("寡宿"));
  // 60 consecutive days cover every day pillar once.
  const days = Array.from({ length: 60 }, (_, i) => { const d = new Date(Date.UTC(1990, 0, 1 + i)); return chart(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 12, 0); });
  const dayOf = name => days.find(x => x.pillars[2].name === name);
  assert.ok(natalStars(dayOf("己丑")).day.includes("十惡大敗"));
  assert.ok(!natalStars(dayOf("壬戌")).day.includes("十惡大敗"));
  assert.ok(natalStars(dayOf("庚辰")).day.includes("魁罡"));
  // 陰干羊刃 is the branch before the 祿 (乙寅、丁巳): an 乙 day sees 寅 as 羊刃 in a luck pillar.
  const yi = days.find(x => x.dayMaster.name === "乙");
  assert.ok(luckStars(yi, "丙寅").includes("羊刃"));
  assert.ok(luckStars(yi, "甲申").includes("飛刃"));
});

test("branch and stem relations: 合、沖、刑、害、破、半合、拱合、三合、三會", () => {
  const pair = (a, b) => kinds(relationsAmong(items([["year", a], ["day", b]])));
  assert.deepEqual(pair("甲子", "丙午"), ["六沖"]);
  assert.deepEqual(pair("甲子", "丁丑"), ["六合"]);
  assert.deepEqual(pair("甲子", "丁未"), ["六害"]);
  assert.deepEqual(pair("甲子", "丁酉"), ["相破"]);
  assert.deepEqual(pair("甲子", "丙辰"), ["半合"]);
  assert.deepEqual(pair("甲申", "丙辰"), ["拱合"]);
  assert.deepEqual(pair("甲子", "丁卯"), ["相刑"]);
  assert.deepEqual(pair("甲辰", "丙辰"), ["自刑"]);
  assert.deepEqual(pair("甲子", "己卯"), ["天干五合", "相刑"]);
  assert.deepEqual(pair("甲子", "庚午"), ["六沖", "天干相沖"]);
  assert.equal(punish("寅", "巳"), "無恩之刑");
  assert.equal(punish("丑", "戌"), "恃勢之刑");
  const three = relationsAmong(items([["year", "甲申"], ["month", "丙子"], ["day", "戊辰"]]));
  assert.ok(three.some(r => r.kind === "三合" && r.element === "水"));
  const meet = relationsAmong(items([["year", "乙亥"], ["month", "戊子"], ["day", "己丑"]]));
  assert.ok(meet.some(r => r.kind === "三會" && r.element === "水"));
  const xing = relationsAmong(items([["year", "甲寅"], ["month", "己巳"], ["day", "庚申"]]));
  assert.ok(xing.some(r => r.kind === "三刑" && r.name === "無恩之刑"));
  assert.deepEqual(natalRelations(["戊辰", "甲寅", "辛丑", "戊子"]).map(r => r.kind).sort(), ["六合", "半合", "相破"]);
});

test("luck pillars: 伏吟, 反吟 and 歲運並臨", () => {
  const natal = ["戊辰", "甲寅", "辛丑", "戊子"];
  assert.ok(luckRelations(natal, "丙辰", "辛丑").some(r => r.kind === "伏吟"));
  assert.ok(luckRelations(natal, "甲午", "甲午").some(r => r.kind === "歲運並臨"));
  const r = luckRelations(natal, "丙辰", "甲午");
  assert.ok(r.some(x => x.kind === "反吟" && x.roles.includes("hour")));   // 甲剋戊、午沖子
  assert.ok(r.some(x => x.kind === "六沖" && x.roles.includes("hour")));
  assert.ok(r.every(x => x.roles.includes("flow")));
});

test("旺相休囚死 by the month branch", () => {
  assert.deepEqual(seasonalStates("寅"), { 木: "旺", 火: "相", 水: "休", 金: "囚", 土: "死" });
  assert.deepEqual(seasonalStates("午"), { 火: "旺", 土: "相", 木: "休", 水: "囚", 金: "死" });
  assert.deepEqual(seasonalStates("戌"), { 土: "旺", 金: "相", 火: "休", 木: "囚", 水: "死" });
  assert.deepEqual(seasonalStates("子"), { 水: "旺", 木: "相", 金: "休", 土: "囚", 火: "死" });
});

test("太歲: the twelve spirits and 值、沖、刑、害、破", () => {
  assert.deepEqual(taisui("子", "子"), { spirit: "太歲", kinds: ["值太歲"] });
  assert.deepEqual(taisui("午", "子"), { spirit: "歲破", kinds: ["沖太歲"] });
  assert.deepEqual(taisui("寅", "子").spirit, "喪門");
  assert.deepEqual(taisui("申", "子").spirit, "白虎");
  assert.deepEqual(taisui("亥", "子").spirit, "病符");
  assert.deepEqual(taisui("卯", "子").kinds, ["刑太歲"]);
  assert.deepEqual(taisui("未", "子").kinds, ["害太歲"]);
  assert.deepEqual(taisui("酉", "子").kinds, ["破太歲"]);
  assert.deepEqual(taisui("午", "午").kinds, ["值太歲", "刑太歲"]);   // 午 is a 自刑 branch
  for (const s of Object.keys(SPIRITS)) assert.ok(SPIRITS[s].text.length > 8);
});

test("strength factors, element roles and 調候用神", () => {
  const names = ["戊辰", "甲寅", "辛丑", "戊子"];
  const f = strengthFactors(names);
  assert.equal(f.state, "囚");   // 金 in spring
  assert.equal(f.ling, false);
  assert.deepEqual(f.roots, [{ role: "day", branch: "丑", strength: "餘氣" }]);
  assert.equal(f.born.length, 4);
  const a = analyse(names), roles = elementRoles(a);
  assert.equal(roles[a.useful[0]], "用神");
  for (const e of a.useful.slice(1)) assert.equal(roles[e], "喜神");
  if (a.avoid.length) assert.equal(roles[a.avoid[0]], "忌神");
  assert.deepEqual(tiaohouStems("辛", "寅"), ["己", "壬", "庚"]);
  assert.deepEqual(tiaohouStems("甲", "子"), ["丁", "庚", "丙"]);
});

test("charts without an hour still get their stars", () => {
  const c = chart(1990, 6, 1, null, 0, "female");
  const s = natalStars(c);
  assert.deepEqual(Object.keys(s), ["year", "month", "day"]);
});
