// The English of the 大運 and 流年 readings (core/reading-year.js), the 命理 reasons of story events (eventReason) and
// the yearly luck reasons (core/luck.js): for the 40 charts of the Chinese digest and 200 random births, every decade,
// every age 0–100 and every kind of event in every channel reads in English. A Chinese term may stay only in brackets
// after its English ("Fan Yin (反吟)", "Bing Wu (丙午)"); no braces, undefined or NaN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { birth, chartOf } from "./helpers/readings.js";
import { findPlace } from "../src/core/places.js";
import { prepare } from "../src/sim/setup.js";
import { yearReading, decadeReading, eventReason, yearTag } from "../src/core/reading-year.js";
import { lifeLuck } from "../src/core/luck.js";
import { EVENT_KINDS } from "../src/sim/reason-kinds.js";
import { setReadingLang } from "../src/core/tr.js";
import { makeLang, hasCJK } from "../src/sim/lang.js";
import { storyBundle } from "../scripts/story-bundle.mjs";

const PLACES = ["臺北市", "臺中市西屯", "新北市板橋", "基隆市"];
// A random birth from a small seeded generator, so a failure can be reproduced.
function randomBirth(k) {
  let x = (k + 1) * 2654435761 >>> 0;
  const r = n => { x = (x * 1103515245 + 12345) >>> 0; return x % n; };
  const y = 1920 + r(106), m = 1 + r(12), d = 1 + r(28);
  return { date: { y, m, d }, time: r(5) === 0 ? null : { h: r(24), mi: r(60) }, place: findPlace(PLACES[r(PLACES.length)]), sex: r(2) ? "female" : "male", name: "" };
}

const BRACKETED = /\([㐀-鿿豈-﫿、]{1,12}\)/g;
const problems = new Map();   // the problem (without where) → the first place it was seen
function look(text, where) {
  if (text === undefined || text === null) return;
  const t = String(text);
  const add = p => { if (!problems.has(p)) problems.set(p, where); };
  if (hasCJK(t.replace(BRACKETED, ""))) add(`Chinese: ${t}`);
  if (/[{}]/.test(t)) add(`brace: ${t}`);
  if (/undefined|NaN|null/.test(t)) add(`undefined: ${t}`);
  if (!t.trim()) add("empty");
}
const lookSignal = (s, where) => {
  look(s.text, `${where} ${s.id} text`); look(s.short, `${where} ${s.id} short`);
  if (s.headline) look(s.headline, `${where} ${s.id} headline`);
  for (const [k, v] of Object.entries(s.notes || {})) look(v, `${where} ${s.id} note.${k}`);
  for (const [k, v] of Object.entries(s.shorts || {})) look(v, `${where} ${s.id} shorts.${k}`);
};
function lookYear(y, where) {
  look(y.headline, `${where} headline`);
  y.points.forEach((p, i) => look(p, `${where} point ${i}`));
  for (const [k, v] of Object.entries(y.domains)) look(v.text, `${where} domain ${k}`);
  look(y.taisui.text, `${where} taisui`);
  for (const s of y.stars) look(s.text, `${where} star ${s.name}`);
  for (const s of y.signals) lookSignal(s, where);
  if (y.decade) { look(y.decade.theme, `${where} decade theme`); for (const s of y.decade.signals) lookSignal(s, `${where} decade`); }
  look(yearTag(y), `${where} tag`); look(yearTag(y, { full: true }), `${where} full tag`);
}
function lookDecade(d, where) {
  look(d.headline, `${where} headline`); look(d.text, `${where} text`);
  for (const s of d.stars) look(s.text, `${where} star ${s.name}`);
  for (const k of d.keyYears) look(k.note, `${where} key year ${k.year}`);
  for (const s of d.signals) lookSignal(s, where);
}

test("year and decade readings, event reasons and luck reasons are English for 240 charts", async () => {
  const en = makeLang(await storyBundle());
  const kinds = [...new Set(Object.values(EVENT_KINDS))];
  const births = [...Array.from({ length: 40 }, (_, i) => birth(i)), ...Array.from({ length: 200 }, (_, k) => randomBirth(k))];
  let readings = 0, reasons = 0;
  try {
    births.forEach((b, i) => {
      setReadingLang(null);
      const chart = chartOf(b), prep = prepare(chart, {}), a = prep.analysis;
      setReadingLang(en);
      const where = `chart ${i}`;
      chart.luck.decades.forEach((_, k) => { lookDecade(decadeReading(chart, a, k), `${where} decade ${k}`); readings++; });
      for (let age = 0; age <= 100; age++) {
        const y = yearReading(chart, a, age);
        if (!y) continue;
        lookYear(y, `${where} age ${age}`); readings++;
        for (const kind of kinds) for (const channel of ["good", "bad", "change"]) {
          const r = eventReason(kind, y, { sex: b.sex, channel });
          if (!r) continue;
          look(r.short, `${where} age ${age} ${kind}/${channel} short`); look(r.why, `${where} age ${age} ${kind}/${channel} why`); reasons++;
        }
      }
      const natal = chart.pillars.map(p => p.name);
      const decadeAt = age => { const d = chart.luck.decades.find(x => age >= x.startAge && age <= x.endAge); return d ? d.name : null; };
      const yearAt = age => (chart.years[age - 1] || chart.years[chart.years.length - 1]).name;
      for (const l of lifeLuck(a, natal, b.sex, decadeAt, yearAt, 100)) for (const r of l.reasons) look(r.text, `${where} luck ${l.age}`);
    });
  } finally {
    setReadingLang(null);
  }
  assert.ok(readings > 20000 && reasons > 100000, `${readings} readings, ${reasons} reasons`);
  assert.deepEqual([...problems].slice(0, 20).map(([p, where]) => `${where}: ${p}`), []);
  // English that keeps a bracketed term ("Fan Yin (反吟)") and is passed on as a value is not a missing translation.
  assert.deepEqual([...en.missing].filter(m => hasCJK(m.replace(BRACKETED, ""))).slice(0, 15), [], "Chinese with no English");
});
