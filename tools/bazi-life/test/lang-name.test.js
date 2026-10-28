// The English of the name analysis (core/name.js, core/name-reading.js, the 81 numbers, 三才 and 三運 of
// name-texts.js) and of the 準爸媽 name comparison (sim/compare.js nameCandidates, as baby-app.js shows it): 300 names
// over many charts, with one-character given names, compound surnames, rare and disputed characters, names that
// cannot be analysed and readings without a chart, show no Chinese but the name itself and terms in brackets, and
// nothing unfilled. The fields the code compares stay Chinese and have English words for the page; the numbers are
// the same in both languages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { prepare } from "../src/sim/setup.js";
import { analyseName, describeEffects, LEVEL_NAME, COMPOUND_SURNAMES, shownName } from "../src/core/name.js";
import { nameReading, chartTerm } from "../src/core/name-reading.js";
import { BY_STROKES, ALTERNATIVES } from "../src/core/name-data.js";
import { ALL_NAME_PARTS } from "../src/sim/random-name.js";
import { nameCandidates } from "../src/sim/compare.js";
import { setReadingLang, trw } from "../src/core/tr.js";
import { makeLang } from "../src/sim/lang.js";
import { storyBundle } from "../scripts/story-bundle.mjs";

const L = makeLang(await storyBundle());
const HAN = /[　-〿㐀-鿿豈-﫿＀-￯\u{20000}-\u{3ffff}]/u;
const BROKEN = /[{}]|undefined|NaN|\[object/;
// Chinese terms the English keeps in brackets after their English: "the Five Grids (五格)".
const bracketed = t => t.replace(/\(([㐀-鿿豈-﫿、]{1,12})\)/g, "");
// What is left of a shown string once the name's own characters and the bracketed terms are taken out.
const leftover = (text, full) => bracketed(String(text)).replace(new RegExp(`[${[...full].join("")}]`, "gu"), "");

// The fields of a reading that the code compares or that are the name itself: Chinese on purpose.
const ID = new Set(["key", "element", "level", "from", "to", "elements", "ch", "form", "number", "formRole", "numberRole", "roles", "useful", "avoid", "full", "surname", "given"]);
function shownStrings(x, path = "", out = []) {
  if (typeof x === "string") out.push([path, x]);
  else if (Array.isArray(x)) x.forEach((v, i) => shownStrings(v, `${path}[${i}]`, out));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) if (!ID.has(k)) shownStrings(v, path ? `${path}.${k}` : k, out);
  return out;
}
function assertEnglish(reading, full, where) {
  for (const [path, text] of shownStrings(reading)) {
    const rest = leftover(text, full);
    assert.ok(!HAN.test(rest), `${where} ${path}: Chinese left: ${text}`);
    assert.ok(!BROKEN.test(text), `${where} ${path}: unfilled: ${text}`);
  }
}
// The terms the page shows with trw(): grid names, elements, levels, the three lucks, the 三才 combination.
function assertTerms(r, where) {
  const terms = [...r.grids.flatMap(g => [g.key, g.element, g.level]), r.sancai.elements, r.sancai.level, ...Object.keys(r.yunshi), ...Object.values(r.yunshi).map(y => y.level),
    ...r.elements.chars.flatMap(c => [c.formRole, c.numberRole].filter(Boolean)), ...Object.values(r.elements.roles)];
  for (const t of terms) assert.ok(!HAN.test(trw(t)), `${where}: no English for the term ${t}`);
}
const strip = x => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === "string" && !ID.has(k) ? "" : v)));

// 300 names: common names of every decade, compound surnames, one-character given names, rare characters (the most
// strokes), disputed characters, names of three given characters, and some that cannot be analysed.
const chars = Object.entries(BY_STROKES).sort(([a], [b]) => Number(a) - Number(b)).map(([, s]) => [...s]);
const rare = chars.slice(-8).flat();
const disputed = Object.keys(ALTERNATIVES);
const pick = (list, i) => list[(i * 7919 + 13) % list.length];
const NAMES = ["陳怡君", "林志明", "王小美", "張簡宏明", "歐陽娜娜", "司馬懿", "諸葛亮", "李白", "林硏", "王一", "萬俟卨", "范姜", "黃𠀋", "林 ", "陳ABC"];
for (let i = 0; NAMES.length < 300; i++) {
  const surname = i % 9 === 0 ? pick(COMPOUND_SURNAMES, i) : pick(ALL_NAME_PARTS.surnames, i);
  const kind = i % 6;
  const given = kind === 0 ? pick(ALL_NAME_PARTS.given, i)[0]                                   // one character
    : kind === 1 ? pick(rare, i) + pick(rare, i + 3)                                            // rare
    : kind === 2 ? pick(disputed, i) + pick(ALL_NAME_PARTS.given, i)[1]                         // disputed
    : kind === 3 ? pick(ALL_NAME_PARTS.given, i) + pick(chars[(i % 20) + 1], i)                 // three characters
    : pick(ALL_NAME_PARTS.given, i);
  NAMES.push(surname + given);
}

const PLACE = findPlace("臺北市");
const CHARTS = Array.from({ length: 30 }, (_, i) => {
  const chart = computeChart({ date: { y: 1935 + ((i * 37) % 90), m: 1 + ((i * 5) % 12), d: 1 + ((i * 11) % 28) }, time: i % 4 === 3 ? null : { h: (i * 7) % 24, mi: 0 }, place: PLACE, sex: i % 2 ? "female" : "male", options: { solar: "true" } });
  return prepare(chart, {}).analysis;
});

test("300 names read in English: no Chinese but the name and bracketed terms, nothing unfilled, every term has English", () => {
  let read = 0, failed = 0, romanised = 0;
  for (const [i, full] of NAMES.entries()) {
    const analysis = i % 10 === 9 ? null : CHARTS[i % CHARTS.length];
    setReadingLang(null);
    const zhInfo = analyseName(full, analysis), zh = nameReading(zhInfo, analysis);
    setReadingLang(L);
    const info = analyseName(full, analysis), r = nameReading(info, analysis);
    try {
      if (r.error) {
        failed++;
        assertEnglish(r, full, full);
        assert.ok(zh.error && HAN.test(zh.error), `${full}: the Chinese error`);
        continue;
      }
      read++;
      assertEnglish(r, full, full);
      assertTerms(r, full);
      // Same numbers, levels and characters in both languages.
      assert.deepEqual(strip(r), strip(zh), `${full}: the data differ between the languages`);
      for (const line of describeEffects(info.effects)) assert.ok(!HAN.test(line) && !BROKEN.test(line), `${full}: ${line}`);
      if (/\([A-Z][a-z]+/.test(r.summary)) romanised++;
    } finally { setReadingLang(null); }
  }
  assert.equal(read + failed, 300);
  assert.ok(read >= 270, `${read} names read`);
  assert.ok(failed >= 3, `${failed} names that cannot be analysed`);
  assert.ok(romanised >= 150, `${romanised} names romanised`);
});

test("the English reading names the person in characters with the romanisation, and explains the Five Grids", () => {
  setReadingLang(L);
  try {
    const r = nameReading(analyseName("陳怡君", CHARTS[0]), CHARTS[0]);
    assert.match(r.summary, /^陳怡君 \(Chen Yi-chun\): /);
    assert.equal(shownName("陳怡君").char("怡"), "怡 (Yi)");
    assert.match(r.notes[0], /Five Grids \(五格\)/);
    assert.match(r.notes[0], /strokes/);
    assert.equal(r.grids[0].formula, "陳 16 + 1 (borrowed) = 17");
    assert.equal(LEVEL_NAME[1], "Favourable");
    assert.match(analyseName("黃𠀋").error, /^No Kangxi stroke count could be found for 𠀋\.$/);
    assert.match(analyseName("林").error, /surname and a given name/);
    // A chart's strength or structure without a shared English word is still English, with the term in brackets.
    for (const term of ["從弱", "專旺", "身強", "正官格", "從財格", "曲直格"]) assert.ok(!HAN.test(bracketed(chartTerm(term))), `${term}: ${chartTerm(term)}`);
  } finally { setReadingLang(null); }
  assert.equal(LEVEL_NAME[1], "吉");
  assert.equal(shownName("陳怡君").name, "陳怡君");
});

test("準爸媽: candidate names compared in English, with the same scores as in Chinese", () => {
  const sets = [["林", ["怡君", "沐希", "宥蓁"]], ["陳", ["一", "宇", "安"]], ["歐陽", ["娜娜", "宏", "心怡", "品妍", "子晴"]], ["張簡", ["宏明", "𠀋"]], ["王", ["鬱", "豔麗", "宇翔"]]];
  for (let k = 0; k < 20; k++) sets.push([pick(ALL_NAME_PARTS.surnames, k + 50), [0, 1, 2].map(j => pick(ALL_NAME_PARTS.given, k * 3 + j))]);
  for (const [n, [surname, givens]] of sets.entries()) {
    const analysis = CHARTS[n % CHARTS.length];
    setReadingLang(null);
    const zh = nameCandidates(surname, givens, analysis);
    setReadingLang(L);
    try {
      const enNames = nameCandidates(surname, givens, analysis);
      enNames.forEach((c, i) => {
        if (c.error) { assert.ok(zh[i].error); assert.ok(!HAN.test(leftover(c.error, c.full)), c.error); return; }
        assertEnglish(c.reading, c.full, c.full);
        assert.equal(c.reading.score, zh[i].reading.score, `${c.full}: the score`);
        assert.deepEqual(c.info.effects, zh[i].info.effects, `${c.full}: the effect on the lives`);
      });
    } finally { setReadingLang(null); }
  }
});
