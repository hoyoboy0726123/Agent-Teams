// The chart against the Swiss Ephemeris (test/fixtures/astro-swe.json, from scripts/astro-fixtures.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeChart, BODIES, SIGNS, separation, signIndexOf, dignityOf, RULER, aspectBetween } from "../src/astro/chart.js";
import { findPlace } from "../src/astro/places.js";

const { cases } = JSON.parse(readFileSync(new URL("./fixtures/astro-swe.json", import.meta.url), "utf8"));
const nearCusp = (lon, tol) => { const d = lon % 30; return d < tol || d > 30 - tol; };

test("positions, signs, Ascendant and MC match the Swiss Ephemeris", () => {
  const max = Object.fromEntries([...BODIES, "asc", "mc"].map(k => [k, 0]));
  let retroChecked = 0;
  for (const c of cases) {
    const chart = computeChart({ date: c.date, time: c.time, place: c.place });
    const label = `${c.kind} ${c.place.name} ${JSON.stringify(c.date)} ${JSON.stringify(c.time)}`;
    assert.equal(chart.utc, c.utc, `UTC instant, ${label}`);
    for (const b of BODIES) {
      const ours = chart.bodies[b], ref = c.bodies[b];
      const err = separation(ours.lon, ref.lon);
      max[b] = Math.max(max[b], err);
      assert.ok(err < 0.02, `${b} off by ${err.toFixed(4)}°, ${label}`);
      if (!nearCusp(ref.lon, 0.02)) assert.equal(ours.sign, SIGNS[signIndexOf(ref.lon)], `${b} sign, ${label}`);
      if (Math.abs(ref.speed) > 0.01) { assert.equal(ours.retro, ref.speed < 0, `${b} retrograde, ${label}`); retroChecked++; }
    }
    if (!c.time) { assert.equal(chart.asc, null); continue; }
    const ea = separation(chart.asc.lon, c.asc), em = separation(chart.mc.lon, c.mc);
    max.asc = Math.max(max.asc, ea); max.mc = Math.max(max.mc, em);
    assert.ok(ea < 0.02, `Ascendant off by ${ea.toFixed(4)}°, ${label}`);
    assert.ok(em < 0.02, `MC off by ${em.toFixed(4)}°, ${label}`);
    if (!nearCusp(c.asc, 0.05)) assert.equal(chart.asc.sign, SIGNS[signIndexOf(c.asc)], `Ascendant sign, ${label}`);
    if (!nearCusp(c.mc, 0.02)) assert.equal(chart.mc.sign, SIGNS[signIndexOf(c.mc)], `MC sign, ${label}`);
  }
  console.log(`  ${cases.length} charts, ${retroChecked} retrograde flags; max error in arc-seconds:`,
    Object.fromEntries(Object.entries(max).map(([k, v]) => [k, +(v * 3600).toFixed(1)])));
});

test("Whole Sign houses, big three and sect", () => {
  const chart = computeChart({ date: { y: 1985, m: 7, d: 23 }, time: { h: 14, mi: 35 }, place: findPlace("Austin", "TX") });
  const ascSign = chart.asc.signIndex;
  assert.equal(chart.houses.length, 12);
  assert.equal(chart.houses[0], chart.asc.sign);
  for (const b of BODIES) assert.equal(chart.bodies[b].house, ((chart.bodies[b].signIndex - ascSign + 12) % 12) + 1);
  assert.deepEqual(chart.bigThree, { sun: "Leo", moon: "Libra", rising: "Scorpio" });
  // 2:35 pm in July: the Sun is up.
  assert.equal(chart.sect, "day");
  assert.equal(chart.bodies.sun.house, 10);
  const night = computeChart({ date: { y: 1985, m: 7, d: 23 }, time: { h: 23, mi: 0 }, place: findPlace("Austin", "TX") });
  assert.equal(night.sect, "night");
  const unknown = computeChart({ date: { y: 1985, m: 7, d: 23 }, time: null, place: findPlace("Austin", "TX") });
  assert.equal(unknown.timeKnown, false);
  assert.equal(unknown.houses, null);
  assert.equal(unknown.bigThree.rising, null);
  assert.equal(unknown.sect, null);
  assert.equal(unknown.bodies.sun.house, null);
});

test("rulers and dignities", () => {
  assert.equal(RULER[7], "mars");      // Scorpio, traditional
  assert.equal(RULER[10], "saturn");   // Aquarius, traditional
  assert.equal(dignityOf("sun", 4), "domicile");
  assert.equal(dignityOf("sun", 0), "exaltation");
  assert.equal(dignityOf("sun", 10), "detriment");
  assert.equal(dignityOf("sun", 6), "fall");
  assert.equal(dignityOf("venus", 5), "fall");
  assert.equal(dignityOf("mars", 9), "exaltation");
  assert.equal(dignityOf("saturn", 3), "detriment");
  assert.equal(dignityOf("pluto", 7), null);
});

test("aspects use the stated orbs", () => {
  assert.equal(aspectBetween(0, 7.9).type, "conjunction");
  assert.equal(aspectBetween(0, 8.1), null);
  assert.equal(aspectBetween(0, 9.5, 2).type, "conjunction");
  assert.equal(aspectBetween(10, 100).type, "square");
  assert.equal(aspectBetween(10, 75), null);           // 65°: outside the 4° sextile orb
  assert.equal(aspectBetween(350, 112).type, "trine");
  assert.equal(aspectBetween(0, 181).type, "opposition");
});
