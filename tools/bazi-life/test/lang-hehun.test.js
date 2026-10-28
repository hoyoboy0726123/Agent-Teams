// The English 合婚 (README「英文版（翻譯層）」): hehunReading, partnerReading and the family notes through core/tr.js
// with the shipped catalog (scripts/story-bundle.mjs, as the page fetches it). 200 random couples, a quarter of them of
// the same sex and a quarter with a birth time unknown: everything the page shows is English (Chinese only as a term
// in brackets, "Spouse Palace (夫妻宮: …)"), with no {slot}, undefined or NaN, and nothing from these files left without
// English. The Chinese is the same before and after English was on (test/lang-readings.test.js checks it against the
// digest recorded before the translation).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { storyBundle } from "../scripts/story-bundle.mjs";
import { scan } from "../scripts/extract-strings.mjs";
import { makeLang } from "../src/sim/lang.js";
import { setReadingLang } from "../src/core/tr.js";
import { computeChart } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { analyse } from "../src/core/analysis.js";
import { hehunReading } from "../src/core/hehun.js";
import { partnerReading } from "../src/core/partner.js";
import { relate, noteText, describeFamilyTilts, checkFamily } from "../src/core/family.js";

const L = makeLang(await storyBundle());
const PLACES = ["臺北市", "臺中市西屯", "新北市板橋", "基隆市"];
const NAMES = ["", "", "阿明", "小美", "陳怡君", "Amy"];

// The i-th couple: births 1940–2019, every fourth couple of the same sex, about a quarter of the births without an hour.
function couple(i) {
  let seed = 9001 + i * 7919;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const birth = sex => ({
    date: { y: 1940 + Math.floor(rnd() * 80), m: 1 + Math.floor(rnd() * 12), d: 1 + Math.floor(rnd() * 28) },
    time: rnd() < 0.25 ? null : { h: Math.floor(rnd() * 24), mi: Math.floor(rnd() * 60) },
    place: findPlace(PLACES[Math.floor(rnd() * PLACES.length)]), sex, name: NAMES[Math.floor(rnd() * NAMES.length)],
  });
  const sa = rnd() < 0.5 ? "male" : "female";
  const a = birth(sa), b = birth(i % 4 === 0 ? sa : sa === "male" ? "female" : "male");
  const chart = x => computeChart({ date: x.date, time: x.time, place: x.place, sex: x.sex, options: { solar: "true" } }, { lean: true });
  return { a, b, ca: chart(a), cb: chart(b) };
}
function readings({ a, b, ca, cb }) {
  const pa = ca.pillars.map(p => p.name), pb = cb.pillars.map(p => p.name);
  const hehun = hehunReading({ a: { chart: ca, sex: a.sex, name: a.name }, b: { chart: cb, sex: b.sex, name: b.name }, now: 2026 });
  const partner = partnerReading({ me: { pillars: pa, sex: a.sex, name: a.name }, partner: { pillars: pb, sex: b.sex, name: b.name } });
  const bond = relate({ pillars: pa, analysis: analyse(pa) }, { pillars: pb, analysis: analyse(pb) });
  const tilts = describeFamilyTilts({ childhood: 0.08, study: -0.04, bond: { father: 0.1, mother: -0.12, siblings: 0.05, partner: 0.15 * bond.net || 0.01 } });
  const checks = checkFamily({
    father: { date: { y: a.date.y - 5, m: 1, d: 1 } },
    siblings: [{ relation: "olderSister", name: b.name, date: { y: a.date.y + 2, m: 1, d: 1 } }],
    partner: { name: b.name, date: b.date, sex: b.sex, metYear: a.date.y + 10, marriedYear: a.date.y + 9 },
  }, a.date, a.sex, { english: true });
  return { hehun, partner, notes: bond.notes.map(noteText), tilts, checks };
}
// Every string the page shows: the values it sorts or styles by, and the people's Chinese data, are left out.
const KEPT = /^\.hehun\.(people|tone|net|neutral|luck\.elements)|\.(id|kind|state|level|verdict|pillar|tones|harmony|complement)(\.|$)|^\.partner\.(tone|net|neutral)/;
function shown(x, path = "", out = []) {
  if (KEPT.test(path)) return out;
  if (typeof x === "string") out.push([path, x]);
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) shown(v, `${path}.${k}`, out);
  return out;
}
// Chinese is allowed only as a term in brackets: "(夫妻宮: …)", "(正緣)", "(立春)".
const TERM = /\(([㐀-鿿]{1,12})(?=[:,)])/g;
const CJK = /[　-〿㐀-鿿豈-﫿＀-￯]/;

test("200 couples in English: no Chinese outside bracketed terms, no slots, undefined or NaN, glosses once", () => {
  const zhBefore = readings(couple(0));
  setReadingLang(L);
  try {
    let sameSex = 0, hourless = 0;
    for (let i = 0; i < 200; i++) {
      const c = couple(i);
      if (c.a.sex === c.b.sex) sameSex++;
      if (!c.a.time || !c.b.time) hourless++;
      const r = readings(c);
      for (const [path, text] of shown(r)) {
        assert.ok(!CJK.test(text.replace(TERM, "(")), `${i} ${path}: ${text}`);
        assert.ok(!/[{}]|undefined|NaN|null/.test(text), `${i} ${path}: ${text}`);
        assert.ok(!/\s[,.;:]|\s{2}/.test(text), `${i} ${path}: spacing in ${text}`);
      }
      // Each term is glossed at its first use only, as in the Chinese.
      const prose = shown(r.partner).map(([, t]) => t).join(" ");
      for (const m of new Set([...prose.matchAll(/\(([㐀-鿿]{1,12}):/g)].map(x => x[1]))) {
        assert.equal(prose.split(`(${m}:`).length - 1, 1, `${i}: ${m} glossed more than once`);
      }
      assert.ok(/^[A-Z]/.test(r.hehun.summary) && /[.!?]$/.test(r.hehun.summary), r.hehun.summary);
      if (c.a.sex === c.b.sex) assert.ok(/Partner Star/.test(JSON.stringify(r.hehun.checks)) && !/Wife Star|Husband Star/.test(JSON.stringify(r.hehun.checks)), `${i}: same sex reads the Partner Star`);
    }
    assert.ok(sameSex >= 40 && hourless >= 40, `${sameSex} same-sex couples, ${hourless} with an hour unknown`);
  } finally { setReadingLang(null); }
  assert.deepEqual(readings(couple(0)), zhBefore, "the Chinese is the same after English was on");
});

test("nothing in the 合婚 files is left without English", async () => {
  const mine = new Set();
  for (const f of ["core/hehun.js", "core/partner.js", "core/family.js", "hehun-app.js"]) {
    for (const s of scan(await readFile(new URL(`../src/${f}`, import.meta.url), "utf8"))) mine.add(s.value);
  }
  setReadingLang(L);
  try { for (let i = 0; i < 200; i++) readings(couple(i)); } finally { setReadingLang(null); }
  const left = [...L.missing].filter(m => mine.has(m));
  assert.deepEqual(left, []);
});

test("you and a name read alike: the forms of a person", () => {
  setReadingLang(L);
  try {
    const c = couple(3);
    const plain = readings({ ...c, a: { ...c.a, name: "" }, b: { ...c.b, name: "" } }).hehun;
    const named = readings({ ...c, a: { ...c.a, name: "阿明" }, b: { ...c.b, name: "小美" } }).hehun;
    const all = r => shown(r).map(([, t]) => t).join(" ");
    // "you is", "you has", "you's" (but "one of you has" is fine)
    const wrong = /\byou's\b|(?<!\b(?:of|both of|each of) )\byou (?:is|has|was|likes|needs|tends|keeps)\b/i;
    assert.ok(!wrong.test(all(plain)), all(plain).match(new RegExp(`.{0,40}(?:${wrong.source}).{0,20}`, "i")));
    assert.ok(/\bAh-ming\b/.test(all(named)) && /\bHsiao-mei\b/.test(all(named)) && /\bAh-ming's\b/.test(all(named)));
    assert.equal(plain.people[0].n, "you");
    assert.equal(plain.people[1].n, "your partner");
  } finally { setReadingLang(null); }
});
