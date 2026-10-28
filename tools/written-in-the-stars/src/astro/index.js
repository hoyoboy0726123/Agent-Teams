// The astro side of the seam (PLAN.md "The seam between the chart and the engine").
//
// prepareChart({ date: { y, m, d }, time: { h, mi } | null, place, sex }) →
//   { chart, luck, traits0, jobFit, intro, timeline }
//   chart     computeChart (chart.js)
//   luck      luck[age] for ages 0–110 (luck.js): { age, L, score, m, reasons, profection, facts }
//   traits0   { drive, caution, warmth, curiosity, health }, each 0–1 (traits.js)
//   jobFit    job → −1..1 for a job tagged { title, house?, signs?, elements? } (traits.js)
//   intro     "Sun in Leo, Moon in Pisces, Scorpio rising"
//   timeline  the year-by-year timing facts the luck came from (timing.js)
import { computeChart, longitudeOf, signIndexOf, SIGNS } from "./chart.js";
import { localToUtc } from "./time.js";
import { timeline as lifeTimeline, SPAN } from "./timing.js";
import { lifeLuck } from "./luck.js";
import { computeTraits, jobFit } from "./traits.js";

export { computeChart } from "./chart.js";
export { PLACES, ALL_PLACES, findPlace, placeLabel } from "./places.js";
export { lifeLuck, tilt, DOMAINS, CHANNELS } from "./luck.js";
export { computeTraits, jobFit } from "./traits.js";
export { localToUtc } from "./time.js";

// The Moon's signs over the birth day (local midnight to midnight), for an unknown birth time: one or two.
export function moonSignsOfDay(date, tz) {
  const from = localToUtc(date, { h: 0, mi: 0 }, tz).ms, to = localToUtc(date, { h: 23, mi: 59 }, tz).ms;
  const a = signIndexOf(longitudeOf("moon", new Date(from))), b = signIndexOf(longitudeOf("moon", new Date(to)));
  return a === b ? [SIGNS[a]] : [SIGNS[a], SIGNS[b]];
}

// "Sun in Leo, Moon in Pisces, Scorpio rising". Without a birth time: "Sun in Leo, Moon in Pisces (birth time
// unknown, so no rising sign)", and "Moon in Pisces or Aries" when the Moon changed sign that day.
export function introOf(chart) {
  const { sun, moon, rising } = chart.bigThree;
  if (rising) return `Sun in ${sun}, Moon in ${moon}, ${rising} rising`;
  const moons = moonSignsOfDay(chart.input.date, chart.input.place.tz);
  return `Sun in ${sun}, Moon in ${moons.length > 1 ? moons.join(" or ") : moon} (birth time unknown, so no rising sign)`;
}

export function prepareChart({ date, time = null, place, sex = null }) {
  const chart = computeChart({ date, time, place });
  chart.input.sex = sex;
  const timeline = lifeTimeline(chart, SPAN);
  const luck = lifeLuck(chart, SPAN, timeline);
  return {
    chart, luck, timeline,
    traits0: computeTraits(chart),
    jobFit: job => jobFit(chart, job),
    intro: introOf(chart),
  };
}
