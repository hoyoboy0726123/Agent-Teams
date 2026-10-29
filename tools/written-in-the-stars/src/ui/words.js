// The page's own words about the chart and the life: sign blurbs for the Big Three, house topics for the profection
// pill, the share card's label ("The Late Bloomer"), and the fate-or-luck verdict of the 100 lives. Plain functions,
// tested in node (test/site-ui.test.js).
import { EDU_WORDS, eduAtLeast } from "../sim/world.js";

export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
// Text presentation (U+FE0E) so a phone does not draw them as emoji.
export const GLYPH = Object.fromEntries(SIGNS.map((s, i) => [s, String.fromCodePoint(0x2648 + i) + "︎"]));
export const ELEMENT = Object.fromEntries(SIGNS.map((s, i) => [s, ["fire", "earth", "air", "water"][i % 4]]));
// A few words per sign, written to work as the Sun (your core), the Moon (your inner weather) and the Rising sign
// (how you come across). Tendencies, never verdicts.
export const SIGN_WORDS = {
  Aries: "bold, first through the door", Taurus: "steady, loyal to comfort", Gemini: "curious, always mid-conversation",
  Cancer: "protective, home at heart", Leo: "warm, built for the spotlight", Virgo: "precise, quietly helpful",
  Libra: "fair-minded, a people person", Scorpio: "intense, all or nothing", Sagittarius: "restless, chasing horizons",
  Capricorn: "ambitious, playing the long game", Aquarius: "original, a little contrarian", Pisces: "dreamy, feels every room",
};
export const ROLE = { sun: "Sun", moon: "Moon", rising: "Rising" };
export const ROLE_HINT = { sun: "your core", moon: "your inner world", rising: "how you come across" };

export const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
export const HOUSE_TOPIC = {
  1: "you and your body", 2: "money and values", 3: "siblings and learning", 4: "home and family", 5: "joy, romance and kids",
  6: "work and health", 7: "partners", 8: "shared money and change", 9: "travel and big ideas", 10: "career and reputation",
  11: "friends and hopes", 12: "rest and retreat",
};
export const PLANET = { sun: "the Sun", moon: "the Moon", mercury: "Mercury", venus: "Venus", mars: "Mars", jupiter: "Jupiter", saturn: "Saturn" };
export const planetName = p => (PLANET[p] || String(p || "")).replace(/^the /, "");

// "6th house · work and health", and a sentence for its title.
export function profectionText(pr, timeKnown = true) {
  if (!pr || !pr.house) return { short: "", long: "" };
  const lord = planetName(pr.lord);
  return {
    short: `${ordinal(pr.house)} house year · ${lord}`,
    long: `Annual profection${timeKnown ? "" : " (counted from your Sun sign, since the birth time is unknown)"}: each birthday moves the spotlight to the next house of your chart. This year it is the ${ordinal(pr.house)} house, ${HOUSE_TOPIC[pr.house]}, in ${pr.sign}, so ${lord} is the lord of the year.`,
  };
}

// ---------- fate or luck ----------
// How often something happened in the 100 lives → a verdict. Almost every life (or almost none): written in the
// stars. Close to half: luck. In between: the chart leans.
export function verdictOf(n, runs = 100) {
  const p = n / Math.max(1, runs);
  if (p >= 0.8 || p <= 0.2) return { key: "fate", word: "Written in the stars", short: "Fate" };
  if (p >= 0.35 && p <= 0.65) return { key: "luck", word: "Pure luck", short: "Luck" };
  return { key: "lean", word: "The stars lean", short: "Leaning" };
}

// The headline facts of the 100 lives as [{ key, n, did, text }]: n lives of 100; did: this life did it.
export function hundredFacts(summary, s) {
  const kidsAny = 100 - (summary.kids[0] ? summary.kids[0].runs : 0);
  return [
    { key: "married", n: summary.married, did: s.marriages > 0, yes: "got married", no: "never married" },
    { key: "kids", n: kidsAny, did: s.kids.length > 0, yes: "had kids", no: "had no kids" },
    { key: "home", n: summary.homeOwner, did: s.home === "own", yes: "owned a home", no: "never owned a home" },
    { key: "college", n: summary.college, did: eduAtLeast(s.edu, "bachelor"), yes: "finished college", no: "skipped a four-year degree" },
    { key: "over90", n: summary.lifespan.over90, did: s.age >= 90, yes: "made it past 90", no: "didn't reach 90" },
  ];
}

// The one line for the share card: the most fate-like of the facts, told the way it went in most lives.
export function hundredLine(summary, s) {
  const facts = hundredFacts(summary, s);
  const best = facts.slice().sort((a, b) => Math.abs(b.n - 50) - Math.abs(a.n - 50))[0];
  const n = best.n >= 50 ? best.n : 100 - best.n;
  return { n, text: best.n >= 50 ? best.yes : best.no, key: best.key };
}

// ---------- the share card's label ----------
// The life in two words, from what happened. The first rule that fits wins; the rarer ones come first.
export function labelOf({ s, kline = [], log = [] }) {
  const closes = kline.map(k => k.close);
  const avg = closes.length ? closes.reduce((a, b) => a + b, 0) / closes.length : 50;
  const peak = kline.reduce((a, b) => (b.close > a.close ? b : a), kline[0] || { age: 0, close: 0 });
  const firstWedding = log.find(e => e.id === "proposal" || e.id === "realPartnerWedding");
  const sd = closes.length ? Math.sqrt(closes.reduce((t, v) => t + (v - avg) ** 2, 0) / closes.length) : 0;
  const span = (a, b) => { const v = kline.filter(k => k.age >= a && k.age <= b).map(k => k.close); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : avg; };
  let comeback = 0, low = Infinity;
  for (const v of closes) { low = Math.min(low, v); comeback = Math.max(comeback, v - low); }
  const rules = [
    [s.age >= 100, "The Centenarian", "Made it to triple digits."],
    [s.marriages >= 3, "The Eternal Romantic", "Said “I do” more than twice."],
    [s.flags && s.flags.livedAbroad !== undefined, "The Wanderer", "Packed up and lived abroad."],
    [eduAtLeast(s.edu, "professional"), "The Overachiever", `Collected ${EDU_WORDS[s.edu] || "a big degree"}.`],
    [s.kids.length >= 4, "The Full House", `Raised ${s.kids.length} kids.`],
    [s.age >= 60 && ((peak.age >= 60 && span(50, 120) - span(18, 40) >= 8) || (firstWedding && firstWedding.age >= 40)), "The Late Bloomer", firstWedding && firstWedding.age >= 40 && peak.age < 60 ? `Found love at ${firstWedding.age}.` : `Best year came at ${peak.age}.`],
    [comeback >= 45 && s.age >= 30, "The Comeback Kid", "Hit bottom, then climbed all the way back."],
    [s.age < 45, "The Shooting Star", "Bright, and over too soon."],
    [s.marriages === 0 && s.kids.length === 0 && s.age >= 60, "The Free Spirit", "No ring, no kids, no regrets."],
    [(s.jobsHeld || []).length >= 6, "The Reinventor", `Tried ${(s.jobsHeld || []).length} different jobs.`],
    [avg >= 66, "The Golden Retriever", "Happy most of the way through."],
    [s.marriages === 1 && s.divorces === 0 && s.age >= 70, "The Ride-or-Die", "One love, for the long haul."],
    [sd <= 9, "The Steady Hand", "Kept an even keel for decades."],
    [s.home === "own" && s.kids.length >= 1, "The Homemaker", "A house, a family, a porch light on."],
  ];
  for (const [ok, title, line] of rules) if (ok) return { title, line };
  return { title: "The Old Soul", line: "Took life one honest year at a time." };
}

// "Aug 3, 1995"
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dateText = d => `${MONTHS[d.m - 1]} ${d.d}, ${d.y}`;
export const timeText = t => (t ? `${((t.h + 11) % 12) + 1}:${String(t.mi).padStart(2, "0")} ${t.h < 12 ? "AM" : "PM"}` : "time unknown");
export const decadeOf = y => (y < 1950 ? "before 1950" : y >= 2030 ? "the future" : `the ’${String(Math.floor(y / 10) * 10).slice(2)}s`);
