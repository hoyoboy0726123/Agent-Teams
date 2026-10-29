// The natal reading in English (README「英文版（翻譯層）」, core/tr.js): the 詳批 of reading-natal.js, the three schools'
// views (analysis.js describeViews) and the detail layer's own text (detail.js: relations, symbolic stars, Tai Sui
// spirits, palaces, element roles) for the 40 charts of the Chinese digest and 200 more random births. Nothing Chinese
// may be left, apart from a Chinese term kept on purpose in brackets after its English ("Day Master (日主, …)"), and no
// template may leak a brace, undefined or NaN. The Chinese itself is test/lang-readings.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { birth, chartOf } from "./helpers/readings.js";
import { computeChart } from "../src/core/chart.js";
import { PLACES } from "../src/core/places.js";
import { prepare } from "../src/sim/setup.js";
import { makeRng } from "../src/sim/rng.js";
import { makeLang } from "../src/sim/lang.js";
import { storyBundle } from "../scripts/story-bundle.mjs";
import { setReadingLang, readingLang, trw } from "../src/core/tr.js";
import { natalReading, SECTION_IDS } from "../src/core/reading-natal.js";
import { describeViews } from "../src/core/analysis.js";
import { natalRelations, luckRelations, natalStars, STARS, SPIRITS, PALACE, taisui, elementRoles, BRANCHES } from "../src/core/detail.js";

const CJK = /[　-〿㐀-鿿豈-﫿＀-￯]/;
// A Chinese term in brackets right after its English: "(日主, the stem…)", "(窮通寶鑑)".
const kept = t => t.replace(/\(([㐀-鿿]{1,12})(?=[,)])/g, "(");
const BROKEN = /[{}]|undefined|NaN/;

// Every string of a reading, except the table's colouring keys (the five-element names stay Chinese there on purpose).
function strings(x, out = [], key = "") {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) for (const v of x) strings(v, out, key);
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) if (k !== "elements" || !Array.isArray(v) || key !== "row") strings(v, out, k === "rows" ? "row" : k);
  return out;
}

function births() {
  const list = Array.from({ length: 40 }, (_, i) => { const b = birth(i); return { chart: chartOf(b), name: b.name }; });
  const rng = makeRng(20261028);
  for (let i = 0; i < 200; i++) {
    const y = 1900 + rng.int(126), m = 1 + rng.int(12), d = 1 + rng.int(28);
    const time = rng() < 0.2 ? null : { h: rng.int(24), mi: rng.int(60) };
    const options = { solar: rng.pick(["true", "mean", "clock"]), zi: rng.pick(["early", "late"]) };
    list.push({ chart: computeChart({ date: { y, m, d }, time, place: rng.pick(PLACES), sex: rng() < 0.5 ? "male" : "female", options }), name: rng.pick(["陳怡君", "林志明", "王小美", ""]) });
  }
  return list;
}

test("the natal reading, the schools' views and the detail texts are English: 240 charts", async () => {
  setReadingLang(makeLang(await storyBundle()));
  try {
    assert.equal(readingLang(), "en");
    const problems = new Map();
    const check = (where, text) => {
      const t = String(text);
      if (CJK.test(kept(t)) || BROKEN.test(t)) problems.set(t, where);
    };
    for (const { chart, name } of births()) {
      const id = chart.pillars.map(p => p.name).join(" ");
      const prep = prepare(chart, { name }), a = prep.analysis, names = chart.pillars.map(p => p.name);
      const r = natalReading(chart, a, { name: prep.name ? prep.name.full : null });
      assert.deepEqual(r.sections.map(s => s.id), SECTION_IDS, id);
      for (const t of strings(r)) check(`${id} natal`, t);
      for (const t of describeViews(a)) check(`${id} views`, t);
      for (const rel of natalRelations(names)) check(`${id} relation`, rel.text);
      for (const dec of chart.luck.decades) {
        for (const rel of luckRelations(names, dec.name)) check(`${id} decade relation`, rel.text);
        for (const rel of luckRelations(names, dec.name, names[0])) check(`${id} flow relation`, rel.text);
      }
      for (const list of Object.values(natalStars(chart))) for (const s of list) { check(`${id} star`, trw(s)); check(`${id} star text`, STARS[s].text); }
      for (const b of BRANCHES) {
        const ts = taisui(chart.pillars[0].branch.name, b);
        check(`${id} spirit`, trw(ts.spirit)); check(`${id} spirit text`, SPIRITS[ts.spirit].text);
        for (const k of ts.kinds) check(`${id} tai sui`, trw(k));
      }
      for (const role of Object.values(elementRoles(a))) check(`${id} role`, trw(role));
    }
    for (const p of Object.values(PALACE)) for (const t of [p.stem, p.branch, p.life]) check("palace", t);
    assert.deepEqual([...problems].slice(0, 10), [], `${problems.size} English strings with Chinese or a broken template`);
  } finally {
    setReadingLang(null);
  }
  assert.equal(readingLang(), "zh");
});
