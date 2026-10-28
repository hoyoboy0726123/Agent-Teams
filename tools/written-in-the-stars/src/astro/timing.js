// Year-by-year timing: annual profections and the transits of Saturn, Jupiter and Uranus.
//
// Year n of life (age n) runs from the n-th birthday to the next (n × 365.2425 days after the birth instant).
//   Annual profection  at age n the activated house is (n mod 12) + 1, counted in whole signs from the Ascendant
//                      (from the Sun's sign when the birth time is unknown); the lord of the year is the
//                      traditional ruler of that sign.
//   Transit contacts   Saturn and Jupiter conjunct, square or opposite the natal Sun, Moon, Ascendant and MC
//                      (the angles only with a known birth time). A contact counts in a year when the transiting
//                      planet passes the exact aspect in it, or comes within 1° and turns back (a station).
//   Cycles             Saturn returns (≈29.5, 59, 88), Saturn opposite its natal place (≈14, 44, 73), Jupiter
//                      returns (every ≈11.9 years) and the Uranus opposition (≈40–42).
//   Ingresses          Saturn or Jupiter moving on into the next sign, i.e. the next whole-sign house; going back
//                      into the previous sign while retrograde, and returning, is not counted again.
// The planets are sampled every few days on a grid shared by all charts and cached, so a population of charts
// costs little after the first.
import { longitudeOf, diff180, signIndexOf, RULER, SIGNS, LABELS, houseFrom } from "./chart.js";

const DAY = 86400000;
export const YEAR_DAYS = 365.2425;
export const SPAN = 110;
const STEP = { saturn: 4, jupiter: 4, uranus: 8 };   // days between samples
const J2000 = Date.UTC(2000, 0, 1, 12);
const cache = { saturn: new Map(), jupiter: new Map(), uranus: new Map() };

// Longitude of a slow planet at grid point k (k × STEP days from J2000), cached.
function gridLon(planet, k) {
  const c = cache[planet];
  let v = c.get(k);
  if (v === undefined) { v = longitudeOf(planet, new Date(J2000 + k * STEP[planet] * DAY)); c.set(k, v); }
  return v;
}
// Samples { ms: [...], lon: [...] } of a planet in [from, to), with one grid point either side so a crossing at the
// edge is seen.
function samples(planet, from, to) {
  const step = STEP[planet] * DAY;
  const k0 = Math.floor((from - J2000) / step), k1 = Math.ceil((to - J2000) / step);
  const n = k1 - k0 + 1, ms = new Float64Array(n), lon = new Float64Array(n);
  for (let i = 0; i < n; i++) { ms[i] = J2000 + (k0 + i) * step; lon[i] = gridLon(planet, k0 + i); }
  return { ms, lon };
}

export const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const POINT_LABEL = { sun: "Sun", moon: "Moon", asc: "Ascendant", mc: "Midheaven", saturn: "Saturn", jupiter: "Jupiter", uranus: "Uranus" };
const CONTACTS = [{ aspect: "conjunction", offsets: [0] }, { aspect: "square", offsets: [90, 270] }, { aspect: "opposition", offsets: [180] }];
const ORDINAL_WORD = ["", "First", "Second", "Third", "Fourth"];

// Passes of `planet` over (natal + offset) in [from, to): { passes, closest }. A pass is a change of sign of the
// difference between two samples (while it is small); a near miss within 1° counts as one pass too (a station).
function contact(list, natalLon, offsets, from, to) {
  const { ms, lon } = list, n = ms.length;
  let passes = 0, closest = 180;
  for (const off of offsets) {
    const target = natalLon + off;
    // Jupiter, the fastest of the three, moves under 45° in a year: far from the target at the start, no contact.
    if (Math.abs(diff180(lon[0], target)) > 70) continue;
    let pd = 0;
    for (let i = 0; i < n; i++) {
      const d = diff180(lon[i], target), ad = Math.abs(d);
      if (ms[i] >= from && ms[i] < to && ad < closest) closest = ad;
      if (i > 0 && ad < 20 && Math.abs(pd) < 20 && (pd < 0) !== (d < 0)) {
        // Credit the pass to the year that holds the moment of crossing (linear interpolation).
        const at = ms[i - 1] + (ms[i] - ms[i - 1]) * (Math.abs(pd) / (Math.abs(pd) + ad));
        if (at >= from && at < to) passes++;
      }
      pd = d;
    }
  }
  if (!passes && closest <= 1) passes = 1;
  return { passes, closest };
}

const profectionName = (house, lord) => `${ordinal(house)}-house profection year (lord of the year: ${LABELS[lord]})`;

// timeline(chart) → [{ age, start, end, profection: { house, sign, lord }, transitHouses: { saturn, jupiter },
//   facts: [{ kind, name, planet?, point?, aspect?, house?, sign?, passes?, n? }] }] for ages 0..span.
// Fact kinds: "profection", "contact", "saturn-return", "saturn-opposition", "jupiter-return", "uranus-opposition",
// "ingress". `name` is a plain English label.
export function timeline(chart, span = SPAN) {
  const natal = { sun: chart.bodies.sun.lon, moon: chart.bodies.moon.lon };
  if (chart.timeKnown) { natal.asc = chart.asc.lon; natal.mc = chart.mc.lon; }
  const birth = chart.ms;
  const lastIngress = {
    saturn: signIndexOf(chart.bodies.saturn.lon), jupiter: signIndexOf(chart.bodies.jupiter.lon),
  };
  const years = [];
  for (let age = 0; age <= span; age++) {
    const from = birth + age * YEAR_DAYS * DAY, to = birth + (age + 1) * YEAR_DAYS * DAY;
    const house = (age % 12) + 1, sign = (chart.baseSign + age) % 12, lord = RULER[sign];
    const facts = [{ kind: "profection", name: profectionName(house, lord), house, sign: SIGNS[sign], planet: lord }];
    const list = { saturn: samples("saturn", from, to), jupiter: samples("jupiter", from, to), uranus: samples("uranus", from, to) };

    for (const planet of ["saturn", "jupiter"]) {
      for (const [point, lon] of Object.entries(natal)) for (const { aspect, offsets } of CONTACTS) {
        const c = contact(list[planet], lon, offsets, from, to);
        if (c.passes) facts.push({ kind: "contact", name: `${LABELS[planet]} ${aspect} natal ${POINT_LABEL[point]}`, planet, point, aspect, passes: c.passes, closest: c.closest });
      }
    }
    if (age >= 5) {
      const sr = contact(list.saturn, chart.bodies.saturn.lon, [0], from, to);
      if (sr.passes) {
        const n = Math.max(1, Math.round(age / 29.46));
        facts.push({ kind: "saturn-return", name: `${ORDINAL_WORD[n] || ordinal(n)} Saturn return`, planet: "saturn", n, passes: sr.passes });
      }
      const so = contact(list.saturn, chart.bodies.saturn.lon, [180], from, to);
      if (so.passes) facts.push({ kind: "saturn-opposition", name: "Saturn opposite natal Saturn", planet: "saturn", passes: so.passes });
      const jr = contact(list.jupiter, chart.bodies.jupiter.lon, [0], from, to);
      if (jr.passes) {
        const n = Math.max(1, Math.round(age / 11.86));
        facts.push({ kind: "jupiter-return", name: `Jupiter return (${ordinal(n)})`, planet: "jupiter", n, passes: jr.passes });
      }
      const uo = contact(list.uranus, chart.bodies.uranus.lon, [180], from, to);
      if (uo.passes) facts.push({ kind: "uranus-opposition", name: "Uranus opposition", planet: "uranus", passes: uo.passes });
    }

    // Where Saturn and Jupiter spend most of the year, and the signs they move on into.
    const transitHouses = {};
    for (const planet of ["saturn", "jupiter"]) {
      const count = new Array(12).fill(0);
      const { ms, lon } = list[planet];
      for (let i = 0; i < ms.length; i++) {
        if (ms[i] < from || ms[i] >= to) continue;
        const si = signIndexOf(lon[i]);
        count[si]++;
        if (si === (lastIngress[planet] + 1) % 12) {
          lastIngress[planet] = si;
          const h = houseFrom(chart, si);
          facts.push({ kind: "ingress", name: `${LABELS[planet]} enters your ${ordinal(h)} house (${SIGNS[si]})`, planet, house: h, sign: SIGNS[si] });
        }
      }
      transitHouses[planet] = houseFrom(chart, count.indexOf(Math.max(...count)));
    }
    years.push({ age, start: new Date(from).toISOString(), end: new Date(to).toISOString(), profection: { house, sign: SIGNS[sign], lord }, transitHouses, facts });
  }
  return years;
}
