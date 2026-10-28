// The same chart, 100 lives. Every result is told as "in N of the lives", so that one life's ending is only one of
// the ways it could go.
import { runLife } from "./life.js";
import { hashSeed } from "./rng.js";
import { partnerMember, realPartnerOutcome } from "./people.js";
import { eduAtLeast } from "./world.js";
import { normalizeLuck } from "./seam.js";

const HURDLE_DOMAINS = {
  health: { label: "Health hurdles", channel: "bad", ages: [30, 95], events: ["serious", "chronic", "burnout"] },
  love: { label: "Relationship hurdles", channel: "bad", ages: [25, 75], events: ["divorce", "crisis", "breakup"] },
  career: { label: "Career hurdles", channel: "bad", ages: [22, 64], events: ["layoff", "startupFail"] },
  wealth: { label: "Money hurdles", channel: "bad", ages: [25, 85], events: ["loss", "startupFail"] },
};

function quantile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}

// Run i of a chart uses the seed hashSeed(`${key}#${i}`), so the same key gives the same 100 lives.
//   prep   setup.js prepare (or seam.js neutralPrep)        key   what identifies the chart (the page builds it)
//   sex    defaults to the prep's input                     place { state, city } instead of the input's birthplace
export function rerun({ prep, sex = null, place = null, runs = 100, key = "", events = undefined }) {
  const lives = [];
  for (let i = 0; i < runs; i++) lives.push(runLife({ prep, sex, place, seed: hashSeed(`${key}#${i}`), ...(events ? { events } : {}) }));
  const count = fn => lives.filter(fn).length;
  const ages = lives.map(l => l.state.age).sort((a, b) => a - b);
  const birthYear = lives.length ? lives[0].state.birthYear : 0;
  const luck = prep.luck && prep.luck.normalized ? prep.luck : normalizeLuck(prep.luck);

  const bins = [];
  for (let lo = 0; lo <= 105; lo += 5) bins.push({ from: lo, to: lo === 105 ? 110 : lo + 4, n: ages.filter(a => a >= lo && (lo === 105 || a <= lo + 4)).length });

  const band = [];
  for (let age = 0; age <= 110; age++) {
    const vals = lives.map(l => l.kline[age] && l.kline[age].close).filter(v => v !== undefined).sort((a, b) => a - b);
    if (vals.length < Math.max(3, runs * 0.1)) break;
    band.push({ age, p10: quantile(vals, 0.1), p50: quantile(vals, 0.5), p90: quantile(vals, 0.9), alive: vals.length });
  }

  // Hurdle years: the ages where this chart's luck tilts a domain's bad events most, with how many of the lives
  // actually had such an event within a year of that age. `body` is a hook for the chart engine (prep.bodyAt).
  const hurdles = Object.entries(HURDLE_DOMAINS).map(([domain, h]) => {
    const years = luck.filter(y => y.age >= h.ages[0] && y.age <= h.ages[1]).map(y => ({ age: y.age, year: birthYear + y.age, lnm: y.m[domain][h.channel], reason: (y.reasons.find(r => r.domains.includes(domain)) || {}).text || null }));
    const top = years.filter(y => y.lnm >= 0.2).sort((a, b) => b.lnm - a.lnm).slice(0, 3).sort((a, b) => a.age - b.age);
    return {
      domain, label: h.label,
      years: top.map(y => ({
        ...y,
        hits: count(l => l.log.some(e => h.events.includes(e.id) && Math.abs(e.age - y.age) <= 1)),
        body: domain === "health" && typeof prep.bodyAt === "function" ? prep.bodyAt(y.age) : null,
      })),
    };
  });

  return {
    runs,
    lifespan: { median: quantile(ages, 0.5), p10: quantile(ages, 0.1), p25: quantile(ages, 0.25), p75: quantile(ages, 0.75), p90: quantile(ages, 0.9), bins, under60: count(l => l.state.age < 60), over90: count(l => l.state.age >= 90) },
    seriousBefore60: count(l => l.log.some(e => e.id === "serious" && e.age < 60)),
    seriousEver: count(l => l.log.some(e => e.id === "serious")),
    married: count(l => l.state.marriages > 0),
    divorced: count(l => l.state.divorces > 0),
    kids: [0, 1, 2, 3].map(n => ({ n, runs: count(l => (n === 3 ? l.state.kids.length >= 3 : l.state.kids.length === n)) })),
    college: count(l => eduAtLeast(l.state.edu, "bachelor")),
    homeOwner: count(l => l.state.home === "own"),
    abroad: count(l => l.state.flags.livedAbroad !== undefined),
    served: count(l => !!l.state.flags.served || l.state.jobsHeld.some(j => j.field === "military")),
    family: {
      fatherClash: count(l => l.log.some(e => e.id === "fatherClash")),
      motherClash: count(l => l.log.some(e => e.id === "motherClash")),
      siblingRivalry: count(l => l.log.some(e => e.id === "siblingRivalry")),
      siblingHelp: count(l => l.log.some(e => e.id === "siblingHelp")),
      parentsDivorce: count(l => l.log.some(e => e.id === "parentsDivorce")),
    },
    // The partner from the family hook: in how many lives you met, married, and divorced that person.
    partner: partnerSummary(prep.family, lives.map(l => realPartnerOutcome(l.state))),
    band,
    hurdles,
  };
}

function partnerSummary(family, outcomes) {
  const m = partnerMember(family);
  if (!m) return null;
  const count = key => outcomes.filter(o => o[key]).length;
  return { name: m.name, met: count("met"), married: count("married"), divorced: count("divorced") };
}
