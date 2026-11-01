// Personality from the chart, and how well a job fits it.
//
// traits0 = { drive, caution, warmth, curiosity, health }, each 0–1, the starting personality the engine's auto
// player leans on (see ../bazi-life/src/sim/traits.js: styleWeight; the engine adds its own noise and lets choices
// move them). Each starts at 0.5 and moves with what the chart emphasises:
//   drive      fire, cardinal signs, a strong or angular Mars
//   caution    earth, fixed signs, a strong or angular Saturn
//   warmth     water, a strong Venus or Moon
//   curiosity  air, mutable signs, a strong Mercury, planets in the 3rd and 9th houses
//   health     (looking after the body) Virgo and the 6th house emphasised, a little earth; a Mars–Saturn
//              square, opposition or conjunction (strain, pushing through) lowers it
// Emphasis is weighted: Sun 3, Moon 3, Ascendant 2.5 (with a known time), Mercury, Venus and Mars 1, Jupiter and
// Saturn 0.5; the outer planets are generational and left out. Every term is a deviation from its expected value
// over random charts (an element's share 1/4, a modality's 1/3…), so a population averages 0.5
// (test/astro-luck.test.js prints the means).
import { elementOf, modalityOf, ELEMENTS, MODALITIES, SIGNS, RULER, houseFrom, signOfHouse, aspectBetween } from "./chart.js";
import { lordCondition } from "./luck.js";

const WEIGHTS = { sun: 3, moon: 3, mercury: 1, venus: 1, mars: 1, jupiter: 0.5, saturn: 0.5 };
const ASC_WEIGHT = 2.5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// [{ key, signIndex, w }] of the weighted points of the chart.
function points(chart) {
  const list = Object.entries(WEIGHTS).map(([key, w]) => ({ key, signIndex: chart.bodies[key].signIndex, w }));
  if (chart.timeKnown) list.push({ key: "asc", signIndex: chart.asc.signIndex, w: ASC_WEIGHT });
  return list;
}

// Shares of the four elements and three modalities (each set sums to 1), and of each sign.
export function balance(chart) {
  const pts = points(chart), total = pts.reduce((a, p) => a + p.w, 0);
  const element = Object.fromEntries(ELEMENTS.map(e => [e, 0]));
  const modality = Object.fromEntries(MODALITIES.map(m => [m, 0]));
  const sign = new Array(12).fill(0);
  for (const p of pts) {
    element[elementOf(p.signIndex)] += p.w / total;
    modality[modalityOf(p.signIndex)] += p.w / total;
    sign[p.signIndex] += p.w / total;
  }
  return { element, modality, sign, total };
}

// Planet strength −1..1.5: dignity (domicile or exaltation +1, detriment or fall −1), and +0.5 on an angle
// (houses 1, 4, 7, 10; known time only), each minus its expected value.
function strength(chart, planet) {
  const b = chart.bodies[planet];
  const dig = b.dignity === "domicile" || b.dignity === "exaltation" ? 1 : b.dignity === "detriment" || b.dignity === "fall" ? -1 : 0;
  const angular = chart.timeKnown ? ([1, 4, 7, 10].includes(b.house) ? 1 : 0) - 1 / 3 : 0;
  return dig + 0.5 * angular;
}

// Share of the seven planets' weight in the given houses, minus the expected share.
function houseEmphasis(chart, houses) {
  let w = 0, total = 0;
  for (const [key, k] of Object.entries(WEIGHTS)) {
    total += k;
    if (houses.includes(houseFrom(chart, chart.bodies[key].signIndex))) w += k;
  }
  return w / total - houses.length / 12;
}

// P(a Mars–Saturn aspect is a conjunction, square or opposition) over random charts: (16 + 28 + 16) / 360.
const MARS_SATURN_HARD = 60 / 360;

export function computeTraits(chart) {
  const { element, modality, sign } = balance(chart);
  const ms = aspectBetween(chart.bodies.mars.lon, chart.bodies.saturn.lon);
  const msHard = (ms && ms.hard ? 1 : 0) - MARS_SATURN_HARD;
  const t = {
    drive: 0.5 + 0.55 * (element.fire - 0.25) + 0.25 * (modality.cardinal - 1 / 3) + 0.05 * strength(chart, "mars"),
    caution: 0.5 + 0.55 * (element.earth - 0.25) + 0.25 * (modality.fixed - 1 / 3) + 0.05 * strength(chart, "saturn"),
    warmth: 0.5 + 0.55 * (element.water - 0.25) + 0.035 * (strength(chart, "venus") + strength(chart, "moon")),
    curiosity: 0.5 + 0.55 * (element.air - 0.25) + 0.25 * (modality.mutable - 1 / 3) + 0.05 * strength(chart, "mercury") + 0.3 * houseEmphasis(chart, [3, 9]),
    health: 0.5 + 0.8 * (sign[5] - 1 / 12) + 0.6 * houseEmphasis(chart, [6]) + 0.2 * (element.earth - 0.25) - 0.08 * msHard,
  };
  for (const k in t) t[k] = clamp(t[k], 0.05, 0.95);
  return t;
}

// How well a job fits the chart, −1..1 (0 for no signal).
//
// A job is tagged { title, house?, signs?, elements? }:
//   house     the whole-sign house the work belongs to: 10 for career in general (the default), 2 money and
//             selling goods, 3 teaching, writing, media, driving, 4 real estate, building, food, the home,
//             5 entertainment, the arts, sports, childcare, 6 healthcare, trades, service, admin, 7 law in court,
//             counselling, consulting, client sales, 8 insurance, finance, surgery, research, investigation,
//             9 universities, publishing, travel, religion, 11 tech, nonprofits, groups, 12 hospitals, prisons,
//             labs, behind-the-scenes work
//   signs     signs whose style the job has, e.g. an accountant ["Virgo", "Capricorn"], a nurse ["Virgo", "Cancer",
//             "Pisces"], a firefighter ["Aries", "Scorpio"]
//   elements  elements of the work, e.g. an engineer ["air", "earth"], a chef ["fire", "water"]
// Each given tag scores −1..1 and the fit is their mean, stretched a little:
//   elements  the chart's weighted share of those elements against 1/4 each
//   signs     the chart's weighted share in those signs (Sun, Moon, Ascendant, MC, personal planets) against
//             1/12 each
//   house     planets in that house against 1/12, the natal condition of the house's ruler, and a link with the
//             10th (its ruler in the 10th, or the 10th's ruler in it)
// The engine can turn it into a pick weight as, for instance, exp(0.7 × fit) (0.5–2).
export function jobFit(chart, job) {
  if (!job) return 0;
  const parts = [];
  const { element, sign } = balance(chart);
  if (job.elements && job.elements.length) {
    const share = job.elements.reduce((a, e) => a + (element[e] || 0), 0) / job.elements.length;
    parts.push(clamp(4 * (share - 0.25), -1, 1));
  }
  if (job.signs && job.signs.length) {
    const idx = job.signs.map(s => SIGNS.findIndex(x => x.toLowerCase() === String(s).toLowerCase())).filter(i => i >= 0);
    let share = idx.reduce((a, i) => a + sign[i], 0);
    // The MC's sign counts too, with a known time: it is the sign of the career.
    if (chart.timeKnown && idx.includes(chart.mc.signIndex)) share += 0.1;
    parts.push(clamp(3 * (share - idx.length / 12), -1, 1));
  }
  if (job.house) {
    const h = clamp(Math.round(job.house), 1, 12);
    const ruler = RULER[signOfHouse(chart, h)];
    const tenthRuler = RULER[signOfHouse(chart, 10)];
    let v = 3 * houseEmphasis(chart, [h]) + 0.6 * lordCondition(chart, ruler).q;
    if (h !== 10 && (houseFrom(chart, chart.bodies[ruler].signIndex) === 10 || houseFrom(chart, chart.bodies[tenthRuler].signIndex) === h)) v += 0.3;
    parts.push(clamp(v, -1, 1));
  }
  if (!parts.length) return 0;
  return clamp(1.25 * parts.reduce((a, b) => a + b, 0) / parts.length, -1, 1);
}

