// The natal reading (src/astro/reading.js) and its page pieces (src/ui/reading-view.js, src/ui/wheel.js): every
// chapter for every chart, no template leaks, charts that read differently, and a timeline tied to the ages of the life.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart, ALL_PLACES, findPlace } from "../src/astro/index.js";
import { timeline } from "../src/astro/timing.js";
import { natalReading, readingTexts, CHAPTERS } from "../src/astro/reading.js";
import { readingHTML } from "../src/ui/reading-view.js";
import { wheelSVG, spread } from "../src/ui/wheel.js";
import { IN_SIGN } from "../src/astro/text/planets.js";
import { IN_HOUSE } from "../src/astro/text/houses.js";
import { PAIR } from "../src/astro/text/aspects.js";
import { SUN, MOON, RISING } from "../src/astro/text/signs.js";
import { SIGNS, BODIES } from "../src/astro/chart.js";

// A small seeded generator, so the 300 charts are the same every run.
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const DOMAINS = ["career", "wealth", "love", "health", "study", "family", "move"];
// A stand-in life: one event a year, every fifth one big.
const fakeLife = (birthYear, age) => ({ age, log: Array.from({ length: age + 1 }, (_, a) => ({ age: a, year: birthYear + a, id: a === 0 ? "birth" : `e${a}`, domain: DOMAINS[a % 7], text: `Life event at age ${a}`, big: a % 5 === 0, mood: (a % 3) - 1 })) });

const R = rng(20261028);
const charts = Array.from({ length: 300 }, (_, i) => {
  const y = 1950 + Math.floor(R() * 76), m = 1 + Math.floor(R() * 12), d = 1 + Math.floor(R() * 28);
  const place = ALL_PLACES[Math.floor(R() * ALL_PLACES.length)];
  const time = i % 2 ? null : { h: Math.floor(R() * 24), mi: Math.floor(R() * 60) };
  const age = 20 + Math.floor(R() * 80);
  return { chart: computeChart({ date: { y, m, d }, time, place }), age, own: i % 3 !== 0 };
});
const TODAY = Date.UTC(2026, 9, 28);
const readings = charts.map(({ chart, age, own }) => natalReading(chart, { life: fakeLife(chart.input.date.y, age), own, today: TODAY }));

test("the text tables are complete: every planet in every sign and house, every pair, every Big Three sign", () => {
  for (const p of ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]) for (const s of SIGNS) assert.ok(IN_SIGN[p][s] && IN_SIGN[p][s].length > 40, `${p} in ${s}`);
  for (const p of BODIES) for (let h = 1; h <= 12; h++) assert.ok(IN_HOUSE[p][h] && IN_HOUSE[p][h].length > 30, `${p} in ${h}`);
  for (let i = 0; i < BODIES.length; i++) for (let j = i + 1; j < BODIES.length; j++) {
    const p = PAIR[`${BODIES[i]}-${BODIES[j]}`];
    assert.ok(p && p.theme && p.blend && p.flow && p.friction, `${BODIES[i]}-${BODIES[j]}`);
  }
  for (const s of SIGNS) { assert.equal(SUN[s].length, 2); assert.equal(MOON[s].length, 2); assert.equal(RISING[s].length, 2); }
});

test("300 random charts (known and unknown time): every chapter, no undefined, NaN or template leaks", () => {
  let words = 0;
  for (const [k, r] of readings.entries()) {
    const { chart } = charts[k];
    assert.deepEqual(r.chapters.map(c => c.id), CHAPTERS, `chart ${k}`);
    for (const ch of r.chapters) {
      assert.ok(ch.title && ch.summary && ch.blocks.length >= 2, `${k} ${ch.id}`);
      assert.ok(ch.blocks.some(b => b.type === "p" || b.type === "list"), `${k} ${ch.id} has text`);
    }
    const texts = readingTexts(r);
    for (const t of texts) {
      assert.equal(typeof t, "string", `${k}: ${t}`);
      assert.ok(!/undefined|NaN|\{|\}|\[object|null|\$\{/.test(t), `chart ${k} leaks: ${t}`);
      assert.ok(!/\s\.|\.\.(?!\.)|\s{2}|\s,/.test(t), `chart ${k} punctuation: ${t}`);
    }
    const html = readingHTML(r, chart);
    assert.ok(!/undefined|NaN|\[object/.test(html), `html ${k}`);
    assert.equal((html.match(/<details class="chapter"/g) || []).length, 7);
    assert.ok(html.includes('<svg class="wheel"'));
    words += texts.join(" ").split(/\s+/).length;
    if (!chart.timeKnown) {
      assert.ok(!r.chapters.find(c => c.id === "bigthree").blocks.some(b => b.type === "h" && /rising ·/.test(b.text)), "no Rising sign without a time");
      assert.ok(/solar houses/.test(texts.join(" ")), "solar houses are flagged");
    }
  }
  console.log(`  average reading: ${Math.round(words / readings.length)} words`);
});

test("two charts read differently", () => {
  const sig = id => new Set(readings.map(r => readingTexts({ ...r, chapters: r.chapters.filter(c => c.id === id) }).join("|")));
  for (const id of CHAPTERS.filter(c => c !== "timeline")) assert.ok(sig(id).size >= 280, `${id}: ${sig(id).size} distinct of 300`);
  const all = new Set(readings.map(r => readingTexts(r).join("|")));
  assert.equal(all.size, readings.length);
});

test("an unknown birth time on a day the Moon changed sign gives both Moons", () => {
  // Aug 3, 1995 in Austin: the Moon went from Libra to Scorpio.
  const chart = computeChart({ date: { y: 1995, m: 8, d: 3 }, time: null, place: findPlace("Austin", "TX") });
  const r = natalReading(chart, {});
  assert.deepEqual(r.moons, ["Libra", "Scorpio"]);
  const big = readingTexts({ ...r, chapters: r.chapters.filter(c => c.id === "bigthree") }).join(" ");
  assert.match(big, /If your Moon is in Libra/);
  assert.match(big, /If your Moon is in Scorpio/);
  assert.match(big, /needs a birth time/);
  assert.ok(!readingTexts(r).some(t => /Moon (square|trine|sextile|opposition|conjunction)/.test(t)), "no Moon aspects without a time");
});

test("the timeline ties to the ages of this life: cycles, decades and the next ten years", () => {
  for (const [k, r] of readings.entries()) {
    const { chart, age } = charts[k];
    const years = timeline(chart);
    const tl = r.chapters.find(c => c.id === "timeline");
    const lists = tl.blocks.filter(b => b.type === "list");
    const cycles = lists[0].items, decades = lists[1].items;
    // The first Saturn return is where the timing engine puts it, and points at what happened that year (or the next).
    const sr = years.find(y => y.facts.some(f => f.kind === "saturn-return"));
    const item = cycles.find(i => /^Saturn return I ·/.test(i.label));
    assert.ok(sr && item, `chart ${k}: a first Saturn return`);
    assert.equal(Number(item.label.match(/age (\d+)/)[1]), sr.age);
    if (sr.age <= age) assert.match(item.life, new RegExp(`^At (${sr.age}|${sr.age + 1}) \\(\\d{4}\\): Life event at age (${sr.age}|${sr.age + 1})\\.$`));
    else assert.ok(!item.life && /ended before/.test(item.text));
    // One entry per decade lived, each naming its angular profection years and pointing at a year of that decade.
    assert.equal(decades.length, Math.floor(Math.min(age, 99) / 10) + 1, `chart ${k}`);
    for (const [i, d] of decades.entries()) {
      if (d.life) { const a = Number(d.life.match(/^At (\d+)/)[1]); assert.ok(a >= i * 10 && a <= i * 10 + 9 && a <= age, `${k}: ${d.label} → ${d.life}`); }
      for (const m of d.text.matchAll(/(\d+) is an? (\d+)\w\w-house year/g)) assert.equal((Number(m[1]) % 12) + 1, Number(m[2]));
    }
    // The outlook starts at the real age today, for births the player typed in.
    const out = lists[2];
    if (charts[k].own) {
      const now = Math.floor((TODAY - chart.ms) / (365.2425 * 86400000));
      assert.equal(out.items.length, 10);
      assert.equal(Number(out.items[0].label.match(/^Age (\d+)/)[1]), now);
      assert.match(out.items[0].text, new RegExp(`${(now % 12) + 1}\\w\\w-house year`));
    } else assert.ok(!out && /random birth/.test(tl.blocks[tl.blocks.length - 1].text));
  }
});

test("the planets point at events of this life in their own profection years", () => {
  const chart = computeChart({ date: { y: 1995, m: 8, d: 3 }, time: { h: 14, mi: 30 }, place: findPlace("Austin", "TX") });
  const r = natalReading(chart, { life: fakeLife(1995, 80) });
  const years = timeline(chart);
  const pl = r.chapters.find(c => c.id === "planets");
  for (const b of pl.blocks.filter(x => x.type === "life")) {
    const planet = b.text.match(/^(\w+) was lord/)[1].toLowerCase();
    const at = Number(b.text.match(/In this life: at (\d+)/)[1]);
    assert.equal(years[at].profection.lord, planet, b.text);
  }
  // No life, no pointers.
  const bare = natalReading(chart, {});
  assert.ok(!bare.chapters.some(c => c.blocks.some(b => b.type === "life" || (b.items || []).some(i => i.life))));
});

test("the wheel: one glyph per body, aspect lines, the angles, accessible", () => {
  const chart = computeChart({ date: { y: 1988, m: 3, d: 21 }, time: { h: 6, mi: 10 }, place: findPlace("Chicago", "IL") });
  const svg = wheelSVG(chart);
  assert.match(svg, /role="img"/);
  assert.match(svg, /<title id="wheel-t">/);
  assert.match(svg, /<desc id="wheel-d">[^<]*rising/);
  assert.equal((svg.match(/class="w-planet /g) || []).length, 10);
  assert.equal((svg.match(/class="w-sglyph"/g) || []).length, 12);
  assert.equal((svg.match(/class="w-asp /g) || []).length, chart.aspects.filter(a => a.type !== "conjunction").length);
  assert.match(svg, />AC</);
  assert.ok(!/NaN|undefined/.test(svg));
  const unknown = wheelSVG(computeChart({ date: { y: 1988, m: 3, d: 21 }, time: null, place: findPlace("Chicago", "IL") }));
  assert.ok(!/>AC</.test(unknown) && /Birth time unknown/.test(unknown));
  // Crowded glyphs are pushed apart, but stay near their places.
  const s = spread([10, 11, 12, 200], 9);
  assert.ok(s[1] - s[0] >= 8.9 && s[2] - s[1] >= 8.9 && Math.abs(s[3] - 200) < 0.01);
});
