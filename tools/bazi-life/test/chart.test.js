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

test("a lean chart (for the AI reading) is the same chart without the 排盤 page's extras", () => {
  const inputs = [
    [1988, 2, 15, 23, 30], [1990, 6, 21, 12, 0, {}, taipei, "female"], [2024, 2, 4, 16, 20], [1959, 11, 3, null, null],
    [1979, 7, 10, 6, 45, {}, findPlace("高雄市鳳山")], [1985, 3, 12, 9, 15, {}, findPlace("紐約"), "female"], [2001, 1, 1, 0, 10, { zi: "late" }],
  ];
  for (const [y, m, d, h, mi, options = {}, place = taipei, sex = "male"] of inputs) {
    const input = { date: { y, m, d }, time: h === null ? null : { h, mi }, place, sex, options };
    const full = computeChart(input), lean = computeChart(input, { lean: true });
    assert.deepEqual(lean.sensitivity, []);
    assert.deepEqual(lean.variants, []);
    const rest = c => ({ ...c, sensitivity: null, variants: null, warnings: c.warnings.filter(w => w.kind !== "jie") });
    assert.deepEqual(rest(lean), rest(full), `${y}-${m}-${d}`);
  }
  // Only the unknown-hour note about a solar term that day is left out.
  const input = { date: { y: 2024, m: 2, d: 4 }, time: null, place: taipei, sex: "male" };
  assert.ok(computeChart(input).warnings.some(w => w.kind === "jie"));
  assert.ok(!computeChart(input, { lean: true }).warnings.some(w => w.kind === "jie"));
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

// 時辰: the hour given as 午時 and the like (shichen.js).
import { SHICHEN, shichenTime, timeText } from "../src/core/shichen.js";
import { fourPillars } from "../src/core/chart.js";

test("a chosen 時辰 is the hour pillar, even where solar time would move a clock reading", () => {
  const urumqi = findPlace("烏魯木齊（北京時間）"), wu = shichenTime("wu");
  const byClock = computeChart({ date: { y: 2000, m: 6, d: 21 }, time: { h: 12, mi: 0 }, place: urumqi, sex: "male" });
  const byShichen = computeChart({ date: { y: 2000, m: 6, d: 21 }, time: wu, place: urumqi, sex: "male" });
  assert.equal(byClock.pillars[3].name[1], "巳", "noon on Beijing time is 巳時 in Ürümqi solar time");
  assert.equal(byShichen.pillars[3].name[1], "午");
  assert.equal(byShichen.time.shichen, "午");
  assert.ok(byShichen.warnings.some(w => w.kind === "shichen"));
  assert.equal(gz(byClock).slice(0, 5), gz(byShichen).slice(0, 5), "year and month still come from the real moment");
  assert.equal(fourPillars({ date: { y: 2000, m: 6, d: 21 }, time: wu, place: urumqi }).hour, byShichen.pillars[3].name);
  assert.deepEqual(byShichen.variants.map(v => Object.keys(v.options)), [["zi"]], "the solar settings cannot change a chosen 時辰, so only the 子時 rule is compared");
});

test("with a 時辰 the year and month read the real moment, whatever the solar setting", () => {
  // 2024 立春 is 16:27 Beijing time. 辰時 in New York that morning is 21:00 Beijing time, after it; read as a Beijing
  // clock (the 不校正 setting for clock times), 08:00 would still be before it.
  const ny = findPlace("紐約"), date = { y: 2024, m: 2, d: 4 }, chen = shichenTime("chen");
  const at = solar => computeChart({ date, time: chen, place: ny, options: { solar } });
  for (const solar of ["true", "mean", "clock"]) {
    assert.deepEqual(at(solar).pillars.map(p => p.name), ["甲辰", "丙寅", ...at("true").pillars.slice(2).map(p => p.name)], solar);
    assert.equal(at(solar).pillars[3].name[1], "辰", solar);
  }
  assert.equal(at("clock").terms.prev.time.slice(0, 16), "2024-02-04 03:27", "the term is shown on the New York clock");
  assert.equal(computeChart({ date, time: { h: 8, mi: 0 }, place: ny, options: { solar: "clock" } }).pillars[0].name, "癸卯", "a clock time under 不校正 still reads the clock as Beijing time");
});

test("every 時辰 gives its own branch, and 子時 at either end of the date lands on the right day", () => {
  for (const s of SHICHEN) assert.equal(computeChart({ date: { y: 1990, m: 5, d: 20 }, time: shichenTime(s.key), place: taipei }).pillars[3].name[1], s.branch, s.key);
  const at = (key, zi) => computeChart({ date: { y: 2000, m: 6, d: 21 }, time: shichenTime(key), place: taipei, options: { zi } });
  const day = at("wu", "early").pillars[2].name, next = computeChart({ date: { y: 2000, m: 6, d: 22 }, time: shichenTime("wu"), place: taipei }).pillars[2].name;
  assert.equal(at("zi-am", "early").pillars[2].name, day, "子時 after midnight belongs to the date");
  assert.equal(at("zi-pm", "early").pillars[2].name, next, "with 23 點換日, 子時 before midnight is the next day");
  assert.equal(at("zi-pm", "late").pillars[2].name, day, "with 夜子時, it stays on the date");
  assert.equal(timeText(shichenTime("hai")), "亥時");
  assert.equal(timeText({ h: 9, mi: 5 }), "09:05");
  assert.equal(shichenTime("nope"), null);
});

test("summer time already taken off at home: the chart says which time to enter and which pillars change", () => {
  const morning = chart(1979, 8, 1, 7, 30).warnings.find(w => w.kind === "dst-entered");
  assert.ok(morning, "a DST birth gets the hint");
  assert.match(morning.text, /請改填 08:30：時柱己卯會變成庚辰/);
  assert.equal(chart(1979, 8, 1, 8, 30).pillars[3].name, "庚辰", "entering the hinted time gives that pillar");
  const night = chart(1979, 8, 1, 23, 30).warnings.find(w => w.kind === "dst-entered");
  assert.match(night.text, /8 月 2 日 00:30.*日柱庚子會變成辛丑/);
  assert.ok(!chart(1990, 8, 1, 7, 30).warnings.some(w => w.kind === "dst-entered"), "no hint without summer time");
  const byShichen = computeChart({ date: { y: 1979, m: 8, d: 1 }, time: { h: 7, mi: 0, branch: "辰" }, place: taipei, sex: "male" });
  assert.ok(!byShichen.warnings.some(w => w.kind === "dst-entered"), "a chosen 時辰 is taken as it is");
  assert.ok(!chart(1979, 8, 1, 7, 30, { solar: "clock" }).warnings.some(w => w.kind === "dst-entered"), "不校正 takes no summer time off");
  // In the hour repeated when summer time ends, a time written in standard time is the 2nd one, not an hour later.
  const repeated = chart(1979, 9, 30, 23, 50).warnings.find(w => w.kind === "dst-entered");
  assert.match(repeated.text, /請改選第 2 次出現的時間/);
  assert.doesNotMatch(repeated.text, /10 月 1 日/);
  assert.equal(repeated.occurrence, 1);
  assert.deepEqual(repeated.changed, {}, "the 2nd 23:50 is still 戊子");
  assert.equal(chart(1979, 9, 30, 23, 50, { occurrence: 1 }).pillars[3].name, "戊子");
  // Across New Year the hint names the year.
  const sydney = chart(1990, 12, 31, 23, 30, {}, findPlace("雪梨")).warnings.find(w => w.kind === "dst-entered");
  assert.match(sydney.text, /請改填 1991 年 1 月 1 日 00:30/);
});
