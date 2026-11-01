// Timing (profections, returns), the luck tilts and the traits, one chart at a time and over a population.
import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareChart, ALL_PLACES, findPlace, DOMAINS, CHANNELS } from "../src/astro/index.js";
import { RULER, SIGNS } from "../src/astro/chart.js";
import { lordCondition } from "../src/astro/luck.js";

const LN2 = Math.log(2);
// A small deterministic generator, so the population is the same on every run.
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
function randomInput(r, unknownShare = 0.1) {
  const place = ALL_PLACES[Math.floor(r() * ALL_PLACES.length)];
  const date = { y: 1930 + Math.floor(r() * 96), m: 1 + Math.floor(r() * 12), d: 1 + Math.floor(r() * 28) };
  const time = r() < unknownShare ? null : { h: Math.floor(r() * 24), mi: Math.floor(r() * 60) };
  return { date, time, place };
}
const firstAge = (p, kind, n = null) => { const y = p.timeline.find(y => y.facts.some(f => f.kind === kind && (n === null || f.n === n))); return y ? y.age : null; };

test("profections cycle every 12 years, from the Ascendant or the Sun", () => {
  const p = prepareChart({ date: { y: 1985, m: 7, d: 23 }, time: { h: 14, mi: 35 }, place: findPlace("Austin", "TX") });
  const asc = SIGNS.indexOf(p.chart.asc.sign);
  for (const l of p.luck) {
    assert.equal(l.profection.house, (l.age % 12) + 1);
    assert.equal(l.profection.sign, SIGNS[(asc + l.age) % 12]);
    assert.equal(l.profection.lord, RULER[(asc + l.age) % 12]);
    if (l.age + 12 < p.luck.length) assert.deepEqual(p.luck[l.age + 12].profection, l.profection);
  }
  assert.equal(p.luck[9].profection.house, 10);
  assert.match(p.luck[9].reasons[0].text, /^A 10th-house profection year: career is in the spotlight \(lord of the year: \w+\)\.$/);
  const solar = prepareChart({ date: { y: 1985, m: 7, d: 23 }, time: null, place: findPlace("Austin", "TX") });
  assert.equal(solar.luck[0].profection.sign, "Leo");
  assert.equal(solar.luck[3].profection.sign, "Scorpio");
  assert.match(solar.intro, /^Sun in Leo, Moon in \w+( or \w+)? \(birth time unknown, so no rising sign\)$/);
  assert.equal(p.intro, "Sun in Leo, Moon in Libra, Scorpio rising");
});

test("Saturn returns at about 29.5 and 59, Jupiter returns every 12 years, Uranus opposition around 40", () => {
  const r = rng(42), first = [], second = [], uranus = [];
  for (let i = 0; i < 150; i++) {
    const p = prepareChart(randomInput(r, 0));
    const a1 = firstAge(p, "saturn-return", 1), a2 = firstAge(p, "saturn-return", 2), u = firstAge(p, "uranus-opposition");
    assert.ok(a1 >= 27 && a1 <= 30, `first Saturn return at ${a1}`);
    assert.ok(a2 >= 56 && a2 <= 60, `second Saturn return at ${a2}`);
    assert.ok(u >= 36 && u <= 45, `Uranus opposition at ${u}`);
    const jr = p.timeline.filter(y => y.facts.some(f => f.kind === "jupiter-return")).map(y => y.age);
    for (let k = 1; k <= 8; k++) assert.ok(jr.some(a => Math.abs(a - 11.86 * k) <= 1.5), `Jupiter return ${k} near ${(11.86 * k).toFixed(1)}: ${jr}`);
    first.push(a1); second.push(a2); uranus.push(u);
  }
  const mean = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
  // A return year starts at the birthday, so a return at 29.4 years falls in the year of age 29.
  console.log(`  first exact pass of the first Saturn return: mean age ${mean(first)}, second ${mean(second)}, Uranus opposition ${mean(uranus)}`);
  assert.ok(Math.abs(mean(first) - 28.8) < 0.8);
});

test("luck stays within its bounds and in the seam's shape", () => {
  const r = rng(7);
  for (let i = 0; i < 60; i++) {
    const p = prepareChart(randomInput(r, 0.3));
    assert.equal(p.luck.length, 111);
    p.luck.forEach((l, age) => {
      assert.equal(l.age, age);
      assert.ok(l.L >= -1 && l.L <= 1, `L ${l.L}`);
      assert.ok(Number.isInteger(l.score) && l.score >= 0 && l.score <= 100);
      assert.deepEqual(Object.keys(l.m).sort(), [...DOMAINS].sort());
      for (const d of DOMAINS) for (const c of CHANNELS) {
        assert.ok(Number.isFinite(l.m[d][c]) && Math.abs(l.m[d][c]) <= LN2 + 1e-12, `${d}.${c} ${l.m[d][c]}`);
      }
      assert.ok(l.reasons.length >= 1);
      for (const x of l.reasons) {
        assert.ok(x.domains.length && x.domains.every(d => DOMAINS.includes(d)));
        assert.ok(typeof x.text === "string" && x.text.length > 10 && x.text.length < 140 && /[.]$/.test(x.text), x.text);
      }
    });
    for (const k of ["drive", "caution", "warmth", "curiosity", "health"]) assert.ok(p.traits0[k] >= 0 && p.traits0[k] <= 1);
  }
});

test("a population of 2,000 random charts keeps m centred and traits near 0.5", () => {
  const r = rng(2026), N = 2000;
  const sum = Object.fromEntries(DOMAINS.map(d => [d, { good: 0, bad: 0, change: 0 }]));
  const traits = { drive: 0, caution: 0, warmth: 0, curiosity: 0, health: 0 };
  let n = 0, L = 0, q = 0, fit = 0;
  const JOBS = [
    { title: "Accountant", house: 2, signs: ["Virgo", "Capricorn"], elements: ["earth"] },
    { title: "Actor", house: 5, signs: ["Leo"], elements: ["fire"] },
    { title: "Nurse", house: 6, signs: ["Virgo", "Cancer", "Pisces"], elements: ["water"] },
    { title: "Software engineer", house: 11, signs: ["Aquarius", "Gemini"], elements: ["air"] },
  ];
  for (let i = 0; i < N; i++) {
    const p = prepareChart(randomInput(r));
    for (const k in traits) traits[k] += p.traits0[k] / N;
    for (const pl of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]) q += lordCondition(p.chart, pl).q / (7 * N);
    for (const j of JOBS) { const f = p.jobFit(j); assert.ok(f >= -1 && f <= 1); fit += f / (JOBS.length * N); }
    for (const l of p.luck) {
      if (l.age === 0) continue;   // the engine does not tilt the year of birth
      n++; L += l.L;
      for (const d of DOMAINS) for (const c of CHANNELS) sum[d][c] += l.m[d][c];
    }
  }
  const means = {};
  for (const d of DOMAINS) for (const c of CHANNELS) means[`${d}.${c}`] = +(sum[d][c] / n).toFixed(4);
  console.log("  mean m over", N, "charts:", means);
  console.log("  mean L", +(L / n).toFixed(4), "mean lord condition", +q.toFixed(4), "mean jobFit", +fit.toFixed(4));
  console.log("  mean traits", Object.fromEntries(Object.entries(traits).map(([k, v]) => [k, +v.toFixed(4)])));
  for (const [k, v] of Object.entries(means)) assert.ok(Math.abs(v) < 0.015, `${k} mean ${v}`);
  assert.ok(Math.abs(L / n) < 0.02);
  for (const [k, v] of Object.entries(traits)) assert.ok(Math.abs(v - 0.5) < 0.02, `${k} mean ${v}`);
  assert.ok(Math.abs(fit) < 0.05);
});

test("jobFit follows the chart", () => {
  const p = prepareChart({ date: { y: 1985, m: 7, d: 23 }, time: { h: 14, mi: 35 }, place: findPlace("Austin", "TX") });
  // Sun and Mercury in Leo: a Leo, fire job fits better than a Virgo, earth one.
  assert.ok(p.jobFit({ title: "Actor", signs: ["Leo"], elements: ["fire"] }) > p.jobFit({ title: "Accountant", signs: ["Virgo"], elements: ["earth"] }));
  assert.equal(p.jobFit({ title: "Clerk" }), 0);
});
