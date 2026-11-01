// Recomputes the four pillars without tyme4ts, from an independent ephemeris (astronomy-engine) and the textbook
// rules, for random moments 1900–2100, and checks that the engine agrees:
//   year   立春 to 立春; index (year − 4) mod 60
//   month  the last 節 before the moment gives the branch; 五虎遁 gives the stem from the year stem
//   day    Julian day number: index (JDN + 49) mod 60, the day changing at 23:00
//   hour   two-hour branches starting 23:00; 五鼠遁 gives the stem from the day stem
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Astronomy from "astronomy-engine";
import { computeChart, fourPillars } from "../src/core/chart.js";
import { msToFields } from "../src/core/time.js";

const STEMS = "甲乙丙丁戊己庚辛壬癸", BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const cycle = (stem, branch) => { for (let i = 0; i < 60; i++) if (i % 10 === stem && i % 12 === branch) return i; };
const name = i => STEMS[i % 10] + BRANCHES[i % 12];
const jdn = (y, m, d) => {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
};

// Every 節 from 1899 to 2101: the Sun at ecliptic longitude 285°, 315°, 345°, 15°, … (every 30°).
const jie = [];
for (let y = 1899; y <= 2101; y++) {
  for (let k = 0; k < 12; k++) {
    const lon = (285 + 30 * k) % 360;
    const guess = Date.UTC(y, 0, 6) + k * 30.44 * 86400000;
    jie.push({ ms: Astronomy.SearchSunLongitude(lon, new Date(guess - 10 * 86400000), 20).date.getTime(), lon });
  }
}
jie.sort((a, b) => a.ms - b.ms);
const lastJie = ms => { let lo = 0, hi = jie.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (jie[mid].ms <= ms) lo = mid; else hi = mid - 1; } return lo; };

function expected(utc) {
  const j = lastJie(utc), k = ((jie[j].lon - 315) / 30 + 12) % 12;   // 0 = 寅 month … 11 = 丑 month
  let spring = j; while (jie[spring].lon !== 315) spring--;
  const year = ((new Date(jie[spring].ms).getUTCFullYear() - 4) % 60 + 60) % 60;
  const month = cycle((2 + 2 * (year % 10 % 5) + k) % 10, (2 + k) % 12);
  const f = msToFields(utc + 8 * 3600000);
  const day = (jdn(f.y, f.m, f.d) + (f.h >= 23 ? 1 : 0) + 49) % 60;
  const hb = Math.floor((f.h + 1) / 2) % 12;
  const hour = cycle((2 * (day % 10 % 5) + hb) % 10, hb);
  return { f, names: [year, month, day, hour].map(name), nearJie: Math.min(Math.abs(utc - jie[j].ms), Math.abs((jie[j + 1]?.ms ?? Infinity) - utc)) };
}

test("four pillars match an independent recomputation at 2,000 random moments, 1900–2100", () => {
  let seed = 20261016;
  const random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const from = Date.UTC(1900, 1, 10), to = Date.UTC(2100, 11, 31);
  const place = { name: "東八區", lon: 120, lat: 25, tz: "Asia/Shanghai" };
  let checked = 0;
  for (let n = 0; n < 2000; n++) {
    const utc = Math.floor((from + random() * (to - from)) / 60000) * 60000;
    const e = expected(utc);
    if (e.nearJie < 2 * 60000) continue;   // the two ephemerides differ by up to about a minute
    const input = { date: { y: e.f.y, m: e.f.m, d: e.f.d }, time: { h: e.f.h, mi: e.f.mi }, place, options: { solar: "clock" } };
    const got = n % 20 === 0 ? computeChart(input).pillars.map(p => p.name) : Object.values(fourPillars(input));
    assert.deepEqual(got, e.names, `${e.f.y}-${e.f.m}-${e.f.d} ${e.f.h}:${e.f.mi} UTC+8`);
    checked++;
  }
  assert.ok(checked > 1990, `checked ${checked}`);
});
