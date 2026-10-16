import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace, PLACES } from "../src/core/places.js";

const taipei = findPlace("臺北市");
const chart = (y, m, d, h, mi, options = {}, place = taipei, sex = "male") =>
  computeChart({ date: { y, m, d }, time: h === null ? null : { h, mi }, place, sex, options });
const gz = c => c.pillars.map(p => p.name).join(" ");

test("1988-02-15 23:30: 23 點換日 vs 夜子時", () => {
  assert.equal(gz(chart(1988, 2, 15, 23, 30, { solar: "clock" })), "戊辰 甲寅 辛丑 戊子");
  assert.equal(gz(chart(1988, 2, 15, 23, 30, { solar: "clock", zi: "late" })), "戊辰 甲寅 庚子 戊子");
});

test("year and month pillars change at the exact moment of 立春 2024 (16:27 in Taiwan)", () => {
  assert.equal(gz(chart(2024, 2, 4, 16, 20)).slice(0, 5), "癸卯 乙丑");
  assert.equal(gz(chart(2024, 2, 4, 16, 35)).slice(0, 5), "甲辰 丙寅");
});

test("true solar time moves the hour pillar: Taiwan summer time 1979", () => {
  const c = chart(1979, 8, 1, 7, 30);
  assert.equal(c.time.termClock, "1979-08-01 06:30:00");
  assert.equal(c.pillars[3].name, "己卯");
  assert.ok(c.warnings.some(w => w.kind === "dst"));
  assert.equal(chart(1979, 8, 1, 7, 30, { solar: "clock" }).pillars[3].name, "庚辰");
  assert.deepEqual(c.variants.find(v => v.options.solar === "clock").changed, ["hour"]);
});

test("Taiwan war time 1940: entered 09:20 is 08:20 in UTC+8", () => {
  const c = chart(1940, 6, 15, 9, 20);
  assert.equal(c.time.termClock, "1940-06-15 08:20:00");
  assert.equal(c.pillars[3].name, "戊辰");
  assert.ok(c.warnings.some(w => w.kind === "standard"));
});

test("far west on Beijing time: Ürümqi noon is 09:49 solar time, 01:00 is the previous evening", () => {
  const urumqi = findPlace("烏魯木齊（北京時間）");
  const noon = chart(2000, 6, 21, 12, 0, {}, urumqi);
  assert.equal(noon.time.solarClock.slice(0, 16), "2000-06-21 09:48");
  assert.equal(noon.pillars[3].name, "辛巳");
  const late = chart(2000, 6, 21, 1, 0, {}, urumqi);
  assert.equal(late.time.solarClock.slice(0, 10), "2000-06-20");
  assert.equal(late.pillars[2].name, "己酉");
});

test("born abroad: New York 10:00 EST is 23:00 in UTC+8 for the solar terms", () => {
  const c = chart(1990, 3, 10, 10, 0, {}, findPlace("紐約"));
  assert.equal(c.time.termClock, "1990-03-10 23:00:00");
  assert.equal(c.pillars[3].name, "己巳");
  assert.deepEqual(c.warnings, []);
});

test("an ambiguous reading can be computed either way", () => {
  const first = chart(1979, 9, 30, 23, 30), second = chart(1979, 9, 30, 23, 30, { occurrence: 1 });
  assert.equal(first.time.status, "ambiguous");
  assert.equal(first.time.termClock, "1979-09-30 22:30:00");
  assert.equal(second.time.termClock, "1979-09-30 23:30:00");
  assert.ok(first.warnings.some(w => w.kind === "ambiguous"));
});

test("a reading that never happened is treated as standard time", () => {
  const c = chart(1979, 7, 1, 0, 30);
  assert.equal(c.time.status, "gap");
  assert.equal(c.time.termClock, "1979-07-01 00:30:00");
  assert.deepEqual(c.warnings.map(w => w.kind), ["gap"]);
});

test("luck cycles: 1988-02-15 23:30 male starts after 6 years 2 months 26 days, 乙卯 first", () => {
  const c = chart(1988, 2, 15, 23, 30, { solar: "clock" });
  assert.equal(c.luck.forward, true);
  assert.deepEqual([c.luck.start.years, c.luck.start.months, c.luck.start.days], [6, 2, 26]);
  assert.equal(c.luck.start.date, "1994-05-12");
  assert.equal(c.luck.start.age, 7);
  assert.deepEqual(c.luck.decades.slice(0, 3).map(d => d.name), ["乙卯", "丙辰", "丁巳"]);
  const f = chart(1988, 2, 15, 23, 30, { solar: "clock" }, taipei, "female");
  assert.equal(f.luck.forward, false);
  assert.deepEqual(f.luck.decades.slice(0, 2).map(d => d.name), ["癸丑", "壬子"]);
});

test("the four 起運 methods all run and agree on the year count here", () => {
  const years = ["default", "china95", "sect1", "sect2"].map(yun => chart(1988, 2, 15, 23, 30, { solar: "clock", yun }).luck.start.years);
  assert.deepEqual(years, [6, 6, 6, 6]);
});

test("details: hidden stems, ten gods, 納音, Traditional Chinese names", () => {
  const c = chart(1988, 2, 15, 23, 30, { solar: "clock" });
  const year = c.pillars[0];
  assert.equal(year.stem.god, "正印");
  assert.deepEqual(year.branch.hidden.map(h => `${h.name}${h.type}${h.god}`), ["戊本氣正印", "乙中氣偏財", "癸餘氣食神"]);
  assert.equal(year.nayin, "大林木");
  assert.equal(c.pillars[3].nayin, "霹靂火");
  assert.equal(c.pillars[2].stem.god, "日主");
  assert.equal(c.zodiac, "龍");
  assert.equal(c.lunar, "農曆丁卯年十二月廿八");
  assert.deepEqual(c.elements, { 木: 2, 火: 0, 土: 4, 金: 1, 水: 1 });
  assert.deepEqual(c.missing, ["火"]);
  assert.equal(c.terms.prev.name, "立春");
  assert.equal(c.terms.next.name, "驚蟄");
  assert.ok(!/[财伤杀炉长带临绝养惊蛰龙马鸡猪农历闰]/.test(JSON.stringify(c)));
});

test("sensitivity says how far each pillar is from changing", () => {
  const c = chart(1988, 2, 15, 23, 30);
  const hour = c.sensitivity.find(s => s.role === "hour");
  assert.equal(hour.earlier.becomes, "丁亥");
  assert.ok(Math.abs(hour.earlier.minutes - 22) < 1);
  const day = c.sensitivity.find(s => s.role === "day");
  assert.equal(day.earlier.becomes, "庚子");
});

test("unknown hour: three pillars, and a solar term that day leaves the month open", () => {
  const c = chart(2024, 2, 4, null, null);
  assert.equal(c.pillars.length, 3);
  assert.equal(c.hourKnown, false);
  const jie = c.warnings.find(w => w.kind === "jie");
  assert.ok(jie && /16:27/.test(jie.text) && /乙丑/.test(jie.text) && /丙寅/.test(jie.text), jie && jie.text);
  assert.ok(!chart(2024, 2, 10, null, null).warnings.some(w => w.kind === "jie"));
});

test("every place has a working time zone and a sane position", () => {
  for (const p of PLACES) {
    assert.ok(p.lon >= -180 && p.lon <= 180 && p.lat >= -90 && p.lat <= 90, p.name);
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en", { timeZone: p.tz }), p.name);
  }
  for (const p of PLACES.filter(p => p.tz === "Asia/Taipei")) assert.ok(p.lon > 118 && p.lon < 122.1 && p.lat > 21.8 && p.lat < 26.4, p.name);
});

test("流年 cover all ten 大運", () => {
  const c = chart(1988, 2, 15, 23, 30);
  assert.equal(c.years.length, c.luck.decades[9].endAge);
  assert.ok(c.years.length >= 100);
  assert.deepEqual(c.years.slice(0, 3).map(y => `${y.year}${y.name}${y.age}`), ["1988戊辰1", "1989己巳2", "1990庚午3"]);
  assert.equal(c.luck.decades.length, 10);
});
