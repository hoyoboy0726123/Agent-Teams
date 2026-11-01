// Per-age tilts for the life engine, from the timing facts (timing.js), in the shape of PLAN.md "The seam":
//   luck[age] = { age, L, score, m: { domain: { good, bad, change } }, reasons: [{ domains, tags?, text }] }
//
// Probabilities tilt in logit space, p' = logit⁻¹(logit p₀ + m), with m clamped to ±ln 2, so the chart shifts the
// odds but statistics and the player's choices still decide most of a life. Two kinds of effect feed m:
//   favor     the natal condition of the lord of the year (benefic or malefic, sect, dignity, aspects, house):
//             a well-placed lord turns good up and bad down in the domains of the activated house, a strained
//             one the reverse, plus a small share of the year's tone L in every domain. This is what makes one
//             chart luckier than another; across a population it averages out (Q_BIAS below).
//   triggers  the activated house, the lord's own house, Saturn and Jupiter contacts, returns, the Uranus
//             opposition and the houses Saturn and Jupiter are passing through. These say WHEN things happen,
//             so they are centred on each chart's own lifetime mean (as ../bazi-life/src/core/luck.js does):
//             they move events in time without making them more common, and a whole population of charts
//             keeps the US base rates.
import { timeline, ordinal, SPAN } from "./timing.js";
import { BENEFICS, MALEFICS, SECT_OF, LABELS, aspectsOf, houseFrom } from "./chart.js";

export const DOMAINS = ["career", "wealth", "love", "health", "study", "family", "move"];
export const CHANNELS = ["good", "bad", "change"];
const LN2 = Math.log(2);
const ln = Math.log;
const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

// What each whole-sign house is about: [domain, weight, fixed channel?]. A fixed channel is the house's own lean
// (the 6th, 8th and 12th lean to bad health, the 8th to money changing hands, the 11th to gains). `tags` name the
// people of the house, for the engine's person-specific events.
export const HOUSES = {
  1: { topics: [["health", 1], ["career", 0.5]], focus: "the spotlight is on you, your health and your direction", noun: "you and your body" },
  2: { topics: [["wealth", 1]], focus: "money and what you own are in focus", noun: "money" },
  3: { topics: [["study", 1], ["family", 0.5], ["move", 0.5]], tags: { family: ["siblings"] }, focus: "learning, siblings and short trips come up", noun: "learning and siblings" },
  4: { topics: [["family", 1], ["move", 1]], tags: { family: ["home", "father", "mother"] }, focus: "home and family take center stage", noun: "home and family" },
  5: { topics: [["love", 1], ["family", 0.7]], tags: { family: ["children"] }, focus: "romance, fun and children are in the air", noun: "romance and children" },
  6: { topics: [["health", 1, "bad"], ["career", 0.6]], focus: "work routines and health habits need attention", noun: "work and health habits" },
  7: { topics: [["love", 1]], tags: { love: ["spouse"] }, focus: "partnership is the theme", noun: "partnership" },
  8: { topics: [["wealth", 0.8, "change"], ["health", 0.6, "bad"]], focus: "shared money, debt and deep change are in play", noun: "shared money and deep change" },
  9: { topics: [["study", 1], ["move", 1]], focus: "study, travel and big ideas call", noun: "study and travel" },
  10: { topics: [["career", 1]], focus: "career is in the spotlight", noun: "career" },
  11: { topics: [["wealth", 0.8, "good"], ["career", 0.4]], tags: { wealth: ["friends"] }, focus: "friends, groups and gains help you along", noun: "friends and gains" },
  12: { topics: [["health", 0.8, "bad"], ["family", 0.3]], focus: "a quieter year for rest, retreat and loose ends", noun: "rest and the inner life" },
};
// What a natal point stands for, when Saturn or Jupiter touches it.
const POINTS = {
  sun: { topics: [["career", 1], ["health", 0.6]], tags: { family: ["father"] } },
  moon: { topics: [["family", 1], ["love", 0.6], ["health", 0.6]], tags: { family: ["mother"] } },
  asc: { topics: [["health", 1], ["move", 0.6]] },
  mc: { topics: [["career", 1], ["wealth", 0.5]] },
};
const VERB = { conjunction: "meets", square: "squares", opposition: "opposes" };
const CONTACT_TEXT = {
  saturn: {
    sun: "a test of stamina and ambition; slow and steady wins",
    moon: "heavier feelings and family duties; lean on the people who show up",
    asc: "time to look after your body and your boundaries",
    mc: "career pressure, and the chance to earn your stripes",
  },
  jupiter: {
    sun: "confidence, visibility and a lucky break or two",
    moon: "a warmer, fuller home life",
    asc: "you feel like yourself, and doors open",
    mc: "a boost at work and in your reputation",
  },
};

// The population mean of the raw lord condition over the seven traditional planets of random charts (0.008,
// measured on 2,000 charts 1930–2025), subtracted so the favor part averages out to zero; test/astro-luck.test.js
// checks the population means of m.
export const Q_BIAS = 0.008;

// The natal condition of a planet as lord of the year: q in −1..1, and short notes on why.
export function lordCondition(chart, planet) {
  const b = chart.bodies[planet];
  let q = 0;
  const notes = [];
  if (BENEFICS.includes(planet)) { q += 0.35; notes.push("a benefic"); }
  if (MALEFICS.includes(planet)) { q -= 0.35; notes.push("a malefic"); }
  if (chart.sect) {
    const own = SECT_OF[planet] === chart.sect;
    if (MALEFICS.includes(planet)) { q += own ? 0.15 : -0.15; if (!own) notes.push("out of sect"); }
    else if (BENEFICS.includes(planet)) { q += own ? 0.15 : -0.05; if (own) notes.push("in sect"); }
    else if (planet === "sun" || planet === "moon") q += own ? 0.1 : -0.1;
  }
  const DIGNITY = { domicile: 0.3, exaltation: 0.25, detriment: -0.25, fall: -0.3 };
  if (b.dignity) { q += DIGNITY[b.dignity]; notes.push(`in its ${b.dignity}`); }
  for (const a of aspectsOf(chart, planet)) {
    if (MALEFICS.includes(a.other)) q -= a.type === "square" || a.type === "opposition" ? 0.12 : a.type === "conjunction" ? 0.08 : -0.03;
    else if (BENEFICS.includes(a.other)) q += a.hard ? 0.03 : 0.1;
  }
  if (b.retro) { q -= 0.08; notes.push("retrograde"); }
  const h = houseFrom(chart, b.signIndex);
  if (chart.timeKnown) {
    if ([1, 4, 7, 10].includes(h)) q += 0.1;
    else if ([6, 8, 12].includes(h)) q -= 0.12;
  }
  return { q: clamp(q - Q_BIAS), house: h, notes };
}

const empty = () => Object.fromEntries(DOMAINS.map(d => [d, { good: 0, bad: 0, change: 0 }]));
const domainsOf = topics => topics.map(([d]) => d);

// Reasons for a house or point: one untagged line for all its domains, and a tagged copy for the domain whose
// events are about a person (the engine prefers a tagged reason for a tagged event).
function pushReason(reasons, src, text) {
  reasons.push({ domains: domainsOf(src.topics), text });
  for (const [d, tags] of Object.entries(src.tags || {})) reasons.push({ domains: [d], tags, text });
}

// One year's raw effects.
export function yearEffects(chart, year, lords) {
  const favor = empty(), trig = empty(), reasons = [];
  const { house, lord } = year.profection;
  const H = HOUSES[house], cond = lords[lord];
  const q = cond.q;
  let tone = 0, amplify = 1;

  // The activated house: change in its domains, its own lean, and the lord's condition as favor.
  for (const [d, w, ch] of H.topics) {
    trig[d].change += w * ln(1.25);
    if (ch) trig[d][ch] += w * ln(1.2);
    favor[d].good += w * 0.3 * q; favor[d].bad -= w * 0.3 * q;
  }
  pushReason(reasons, H, `A ${ordinal(house)}-house profection year: ${H.focus} (lord of the year: ${LABELS[lord]}).`);
  if (q >= 0.3) reasons.push({ domains: domainsOf(H.topics), text: `${LABELS[lord]}, the lord of the year, is well placed in your chart: the year's themes tend to go your way.` });
  else if (q <= -0.3) reasons.push({ domains: domainsOf(H.topics), text: `${LABELS[lord]}, the lord of the year, is under strain in your chart: the year's themes take more effort.` });
  // The house the lord sits in natally is stirred too.
  if (cond.house !== house) for (const [d, w] of HOUSES[cond.house].topics) trig[d].change += 0.5 * w * ln(1.15);

  const seen = new Set();
  for (const f of year.facts) {
    if (f.kind === "contact") {
      const P = POINTS[f.point], w = f.aspect === "conjunction" ? 1 : 0.85;
      const key = `${f.planet}-${f.point}`;
      if (seen.has(key)) continue;   // a square on both sides, or a conjunction and a square, counts once
      seen.add(key);
      for (const [d, k] of P.topics) {
        if (f.planet === "saturn") { trig[d].bad += w * k * ln(1.2); trig[d].change += w * k * ln(1.12); }
        else { trig[d].good += w * k * ln(1.2); trig[d].change += w * k * ln(1.08); }
      }
      tone += (f.planet === "saturn" ? -0.25 : 0.2) * w;
      if (f.planet === lord) amplify = Math.max(amplify, 1.2);   // the lord of the year itself is on the move
      const label = { sun: "Sun", moon: "Moon", asc: "Ascendant", mc: "Midheaven" }[f.point];
      pushReason(reasons, P, `${LABELS[f.planet]} ${VERB[f.aspect]} your ${label}: ${CONTACT_TEXT[f.planet][f.point]}.`);
    } else if (f.kind === "saturn-return") {
      for (const [d, k] of [["career", 1], ["love", 0.8], ["move", 0.6]]) trig[d].change += k * ln(1.35);
      trig.career.bad += ln(1.1);
      tone -= 0.3;
      const text = [
        "Saturn return: a reality check on the life you built.",
        "Saturn return: a reality check on the life you built.",
        "Second Saturn return: time to decide what the next chapter is for.",
        "Third Saturn return: a long look back, and a lighter load.",
      ][Math.min(3, f.n)];
      reasons.push({ domains: ["career", "love", "move"], text });
    } else if (f.kind === "saturn-opposition") {
      trig.career.change += ln(1.2); trig.career.bad += ln(1.08);
      tone -= 0.1;
      reasons.push({ domains: ["career"], text: "Saturn opposite its place at your birth: a halfway checkpoint on your goals." });
    } else if (f.kind === "jupiter-return") {
      for (const [d, k] of [["career", 0.8], ["wealth", 0.8], ["study", 0.6], ["move", 0.4]]) trig[d].good += k * ln(1.15);
      trig.move.change += ln(1.1);
      tone += 0.25;
      reasons.push({ domains: ["career", "wealth", "study", "move"], text: "Jupiter return: a fresh twelve-year cycle of growth begins." });
    } else if (f.kind === "uranus-opposition") {
      for (const d of ["career", "love", "move"]) trig[d].change += ln(1.3);
      reasons.push({ domains: ["career", "love", "move"], text: "Uranus opposition: the classic midlife shake-up; something wants to change." });
    } else if (f.kind === "ingress") {
      const T = HOUSES[f.house];
      for (const [d, w] of T.topics) trig[d].change += w * ln(1.08);
      pushReason(reasons, T, f.planet === "saturn"
        ? `Saturn moves into your ${ordinal(f.house)} house: the next couple of years ask for commitment around ${T.noun}.`
        : `Jupiter moves into your ${ordinal(f.house)} house: a lucky stretch for ${T.noun}.`);
    }
  }
  // Where Saturn and Jupiter spend most of the year.
  for (const [d, w] of HOUSES[year.transitHouses.saturn].topics) { trig[d].bad += w * ln(1.1); trig[d].change += w * ln(1.06); }
  for (const [d, w] of HOUSES[year.transitHouses.jupiter].topics) { trig[d].good += w * ln(1.12); trig[d].change += w * ln(1.04); }

  return { q, tone: clamp(tone), favor, trig, amplify, reasons };
}

// lifeLuck(chart) → luck[0..span]. Also returns the timing facts on each entry (`facts`, `profection`).
export function lifeLuck(chart, span = SPAN, years = timeline(chart, span)) {
  const lords = {};
  for (const p of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]) lords[p] = lordCondition(chart, p);
  const raw = years.map(y => yearEffects(chart, y, lords));
  const mean = empty();
  let meanTone = 0;
  for (const r of raw) {
    meanTone += r.tone / raw.length;
    for (const d of DOMAINS) for (const c of CHANNELS) mean[d][c] += r.trig[d][c] / raw.length;
  }
  return raw.map((r, i) => {
    const L = clamp(0.55 * r.q + 0.45 * (r.tone - meanTone));
    const m = empty();
    for (const d of DOMAINS) for (const c of CHANNELS) {
      const v = (r.favor[d][c] + (c === "good" ? 0.1 * L : c === "bad" ? -0.1 * L : 0) + r.trig[d][c] - mean[d][c]) * r.amplify;
      m[d][c] = clamp(v, -LN2, LN2);
    }
    const y = years[i];
    return {
      age: y.age, L, score: Math.round(50 + 40 * clamp(L * r.amplify)), m, reasons: r.reasons,
      profection: y.profection, facts: y.facts.map(f => f.name),
    };
  });
}

// p' = logit⁻¹(logit p + m)
export function tilt(p, lnm) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const z = Math.log(p / (1 - p)) + lnm;
  return 1 / (1 + Math.exp(-z));
}
