// With the chart's influence switched off and the calendar frozen at 2024, a population of simulated lives must
// reproduce the official 2024 statistics that rates.js cites. This is the gate for "the distribution is sensible".
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { prepare } from "../src/sim/setup.js";
import { runLife } from "../src/sim/life.js";
import { freezeYear } from "../src/sim/rates.js";
import { DOMAINS } from "../src/core/luck.js";

freezeYear(2024);
after(() => freezeYear(null));

function population(sex, n) {
  const chart = computeChart({ date: { y: 1990, m: 6, d: 1 }, time: { h: 12, mi: 0 }, place: findPlace("臺北市"), sex });
  const { analysis, luck } = prepare(chart);
  const neutral = luck.map(y => ({ ...y, L: 0, reasons: [], m: Object.fromEntries(Object.keys(DOMAINS).map(d => [d, { good: 0, bad: 0, change: 0 }])) }));
  const out = { kids: 0, first: [], never: 0, at37: 0, marriedYears: 0, durations: [], retire: [], own: 0, alive50: 0, uni: 0, n };
  for (let i = 0; i < n; i++) {
    const { log, state: s } = runLife({ chart, analysis, luck: neutral, seed: 31000 + i });
    out.kids += s.kids.length;
    const first = s.spells.length ? s.spells[0].from : null;
    if (first !== null) out.first.push(first);
    if (s.age >= 37) { out.at37++; if (first === null || first > 37) out.never++; }
    for (const spell of s.spells) {
      out.marriedYears += (spell.to ?? s.age) - spell.from;
      if (spell.end === "divorce") out.durations.push(spell.to - spell.from);
    }
    const r = log.find(e => e.id === "retire");
    if (r) out.retire.push(r.age);
    if (s.age >= 50) { out.alive50++; if (s.ownedAt !== undefined && s.ownedAt <= 50) out.own++; }
    if (["大學", "科大", "碩士", "博士"].includes(s.edu)) out.uni++;
  }
  return out;
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const near = (value, target, tol, label) => assert.ok(Math.abs(value - target) <= tol, `${label}: ${value.toFixed(3)} vs ${target} ± ${tol}`);

// 2,500 lives per sex: the means are fitted to the targets (rates.js), and at this size the seed-to-seed spread
// (about 0.3 years on men's first-marriage age) stays well inside every tolerance, so adding a story event does not
// flip the test by chance.
const women = population("female", 2500), men = population("male", 2500);

test("births: about 0.885 children per woman (2024 total fertility rate)", () => {
  near(women.kids / women.n, 0.885, 0.12, "children per woman");
});

test("first marriage: mean age 31.1 for women and 33.1 for men; 42 % of men unmarried at 35–39", () => {
  near(mean(women.first), 31.1, 1.2, "women's first marriage age");
  near(mean(men.first), 33.1, 1.2, "men's first marriage age");
  near(men.never / men.at37, 0.422, 0.07, "men never married at 35–39");
});

test("divorce: 10.5 per 1,000 married people a year; a third within five years of marriage", () => {
  const years = women.marriedYears + men.marriedYears, d = women.durations.concat(men.durations);
  near(d.length / years, 0.0105, 0.002, "divorces per married year");
  near(d.filter(x => x < 5).length / d.length, 0.336, 0.06, "share within 5 years");
  near(d.filter(x => x >= 5 && x < 10).length / d.length, 0.236, 0.06, "share at 5–9 years");
});

test("retirement around 61.4 for women and 64.3 for men", () => {
  near(mean(women.retire), 61.4, 1.5, "women's retirement age");
  near(mean(men.retire), 64.3, 1.5, "men's retirement age");
});

test("about 84 % own a home by 50, and about 82 % reach college", () => {
  near((women.own + men.own) / (women.alive50 + men.alive50), 0.844, 0.08, "home owners by 50");
  near((women.uni + men.uni) / (women.n + men.n), 0.819, 0.06, "college or above");
});
