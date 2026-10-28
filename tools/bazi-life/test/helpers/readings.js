// Every reading the site writes, for a fixed set of charts, as one object per chart: the Chinese digest test
// (test/lang-readings.test.js) and the English tests use it.
import { computeChart } from "../../src/core/chart.js";
import { findPlace } from "../../src/core/places.js";
import { prepare } from "../../src/sim/setup.js";
import { natalReading } from "../../src/core/reading-natal.js";
import { yearReading, decadeReading, eventReason } from "../../src/core/reading-year.js";
import { overallReading } from "../../src/core/reading-overall.js";
import { nameReading } from "../../src/core/name-reading.js";
import { partnerReading } from "../../src/core/partner.js";
import { hehunReading } from "../../src/core/hehun.js";
import { describeViews } from "../../src/core/analysis.js";
import { reportHTML } from "../../src/report.js";
import { EVENT_KINDS } from "../../src/sim/reason-kinds.js";

const PLACES = ["臺北市", "臺中市西屯", "新北市板橋", "基隆市"];
const NAMES = ["陳怡君", "林志明", "王小美", ""];
// The i-th test birth: dates across 1930–2025, both sexes, every fourth with the hour unknown.
export function birth(i) {
  const y = 1930 + ((i * 37) % 96), m = 1 + ((i * 5) % 12), d = 1 + ((i * 11) % 28);
  const time = i % 4 === 3 ? null : { h: (i * 7) % 24, mi: (i * 13) % 60 };
  return { date: { y, m, d }, time, place: findPlace(PLACES[i % PLACES.length]), sex: i % 2 ? "female" : "male", name: NAMES[i % NAMES.length] };
}
export function chartOf(b) {
  return computeChart({ date: b.date, time: b.time, place: b.place, sex: b.sex, options: { solar: "true" } });
}
// All the readings of one chart (and a partner and a 合婚 with the next birth).
export function readingsOf(i) {
  const b = birth(i), chart = chartOf(b), prep = prepare(chart, { name: b.name });
  const a = prep.analysis;
  const natal = natalReading(chart, a, { name: prep.name ? prep.name.full : null });
  const decades = chart.luck.decades.map((_, k) => decadeReading(chart, a, k));
  const years = [0, 7, 18, 25, 33, 41, 50, 64, 77, 88].map(age => yearReading(chart, a, age));
  const kinds = [...new Set(Object.values(EVENT_KINDS))];
  const reasons = kinds.flatMap(kind => ["good", "bad", "change"].map(channel => eventReason(kind, years[3 + (i % 5)], { sex: b.sex, channel })));
  const name = prep.name ? nameReading(prep.name, a) : null;
  const overall = overallReading(a, { decades, name });
  const o = birth(i + 1), oc = chartOf(o), op = prepare(oc, {});
  const partner = partnerReading({ me: { pillars: prep.natal, analysis: a, sex: b.sex, name: b.name }, partner: { pillars: op.natal, analysis: op.analysis, sex: o.sex, name: "王小美" } });
  const hehun = hehunReading({ a: { chart, sex: b.sex, name: "阿明" }, b: { chart: oc, sex: o.sex, name: "小美" }, now: 2026 });
  const report = reportHTML(chart, { natal, decades, years, events: [], name, overall, partner, yearsTitle: "近十年流年（2026–2035）" });
  return { natal, decades, years, reasons, name, overall, partner, hehun, views: describeViews(a), report };
}
