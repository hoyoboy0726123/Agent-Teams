// The people in the story: partners, kids, friends, coworkers. Each has a name, an age and a nature, and the story
// keeps calling them by name.
//
// The partner from a family input (the "real partner" of bazi-life's couple mode) is a hook: with no family input
// (prep.family null, the default for now) every function about it is inactive and every partner is drawn at random.
import { givenName, randomSurname, nicknameOf } from "./random-name.js";
import { callName } from "./words.js";
import { stateCode } from "./world.js";

// How the protagonist calls family members, by relation.
export const RELATIONS = { father: "dad", mother: "mom", olderBrother: "older brother", olderSister: "older sister", youngerBrother: "younger brother", youngerSister: "younger sister", partner: "partner" };
// The everyday word ("your brother Mike").
export const SHORT_RELATIONS = { olderBrother: "brother", olderSister: "sister", youngerBrother: "little brother", youngerSister: "little sister" };
export const isSibling = r => /Brother|Sister/.test(r);
export const isOlder = r => r === "olderBrother" || r === "olderSister";
export const sexOf = r => (r === "father" || /Brother/.test(r) ? "male" : "female");

// A partner's nature changes the odds of a marriage crisis a little; the multipliers average 1 across the list, so
// the calibrated divorce rate holds.
export const PARTNER_NATURES = [
  { word: "gentle", crisis: 0.9 }, { word: "outspoken", crisis: 1.05 }, { word: "funny", crisis: 1 }, { word: "down-to-earth", crisis: 1 },
  { word: "romantic", crisis: 1 }, { word: "driven", crisis: 1.1 }, { word: "family-minded", crisis: 0.9 }, { word: "free-spirited", crisis: 1.1 },
];
const FRIEND_NATURES = ["outgoing", "loyal", "quiet", "hilarious", "bookish", "athletic", "up for anything", "sentimental"];

const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;
// The surname in a full name ("Jane Doe" → "Doe", "Martin Luther King Jr." → "King"), or null for a single name.
export function surnameIn(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(p => p && !SUFFIX.test(p));
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}

// The protagonist's surname: from the name given, else the father's, else drawn once (with `rng`) and kept, so all
// your children share it. Without `rng`, null when neither name has one.
export function surnameOf(s, rng = null) {
  if (!s.surname) s.surname = surnameIn(s.name) || surnameIn(s.father.name) || (rng ? randomSurname(rng) : null);
  return s.surname;
}

// How the protagonist calls someone: friends often by a nickname (Mike, Jen), everyone else by their first name.
function callOf(role, given, rng) {
  return role === "friend" && rng() < 0.4 ? nicknameOf(given, rng) : given;
}

//   role: "partner" | "kid" | "friend" | "grandkid" | "coworker"   sex: "male" | "female"   birthYear: their birth year
//   name: a full name to use instead of a random one (a partner from the family input); they are called by its first name
export function newPerson(s, ctx, { role, sex, birthYear, surname = null, how = "", nature = null, name = null }) {
  const rng = ctx.rng;
  let full, call;
  if (name) { full = String(name).trim().replace(/\s+/g, " "); call = callName(full); }
  else { const given = givenName(rng, birthYear, sex); full = `${given} ${surname || randomSurname(rng)}`; call = callOf(role, given, rng); }
  return {
    id: `${role}${(s.seq = (s.seq || 0) + 1)}`, role, sex, birthYear, name: full, call, how,
    nature: nature || (role === "partner" ? rng.pick(PARTNER_NATURES) : role === "friend" || role === "coworker" ? rng.pick(FRIEND_NATURES) : null),
    bond: 0.5, alive: true,
  };
}
export const ageOf = (s, p) => s.year - p.birthYear;

// he / she, him / her, his / her
export const pronoun = p => (p && p.sex === "female" ? "she" : "he");
export const objectPronoun = p => (p && p.sex === "female" ? "her" : "him");
export const possessive = p => (p && p.sex === "female" ? "her" : "his");

// ---------- marriage law ----------
// Same-sex couples can marry nationwide from 2015 (Obergefell v. Hodges); some states earlier, by court ruling or law
// (the first full year it was possible there).
export const SAME_SEX_MARRIAGE = 2015;
const SAME_SEX_BY_STATE = {
  MA: 2004, CT: 2008, IA: 2009, VT: 2009, NH: 2010, DC: 2010, NY: 2011, WA: 2012, ME: 2012, MD: 2013, CA: 2013, DE: 2013,
  RI: 2013, MN: 2013, NJ: 2013, HI: 2013, NM: 2013, IL: 2014, OR: 2014, PA: 2014, IN: 2014, OK: 2014, UT: 2014, VA: 2014,
  WI: 2014, CO: 2014, NV: 2014, WV: 2014, NC: 2014, ID: 2014, AK: 2014, AZ: 2014, WY: 2014, MT: 2014, SC: 2014, KS: 2014, FL: 2015,
};
export const sameSexMarriageYear = state => SAME_SEX_BY_STATE[stateCode(state)] || SAME_SEX_MARRIAGE;
// Two people of the same sex: they can marry from their state's year on (story/core.js has no births for them).
export const sameSexCouple = s => !!(s.partner && s.partner.sex === s.sex);
export const canMarry = s => !sameSexCouple(s) || s.year >= sameSexMarriageYear(s.county);
// The sex of someone you date: the partner hook's (family input, or s.flags.partnerSex set by the page), else the
// other sex.
export function datingSex(s, ctx) {
  const m = partnerMember(ctx.family);
  if (m && m.sex) return m.sex;
  if (s.flags && (s.flags.partnerSex === "male" || s.flags.partnerSex === "female")) return s.flags.partnerSex;
  return s.sex === "male" ? "female" : "male";
}

// A child usually takes the father's surname in the US: yours if you are the father, else your husband's, else yours.
export function newKid(s, ctx) {
  const sex = ctx.rng() < 0.512 ? "male" : "female";   // about 105 boys per 100 girls at birth
  const husband = s.sex === "female" && s.partner && s.partner.sex === "male" ? surnameIn(s.partner.name) : null;
  const kid = newPerson(s, ctx, { role: "kid", sex, birthYear: s.year, surname: husband || surnameOf(s, ctx.rng) });
  kid.age = 0;
  return kid;
}

// Where two people meet, by age and era (after Rosenfeld and colleagues' "How Couples Meet and Stay Together": friends
// and school lead until the 1990s, dating sites from the late 1990s, apps from about 2012, and online is the first
// way couples meet by the late 2010s). Returns an id; MEET_WORDS has the words.
export const MEET_WORDS = {
  classmate: "in class", oldClassmate: "at a high school reunion", college: "in college", coworker: "at work", friends: "through friends",
  church: "at church", bar: "at a bar", family: "through family", neighbor: "in the neighborhood", party: "at a party",
  online: "on a dating site", app: "on a dating app", gym: "at the gym", travel: "while traveling",
};
export function meetPlace(s, ctx, { classmates = true } = {}) {
  const options = [];
  if (s.age <= 24 && classmates) options.push(s.studying ? [s.track === "college" || s.track === "community" ? "college" : "classmate", 3] : ["oldClassmate", 0.8]);
  if (s.employed) options.push(["coworker", 2]);
  options.push(["friends", s.year < 2010 ? 3 : 2], ["party", 1], ["neighbor", s.year < 1980 ? 1 : 0.4], ["family", s.year < 1990 ? 1 : 0.5]);
  options.push(["church", s.year < 1990 ? 1.2 : 0.5], ["bar", s.year >= 1965 && s.age >= 21 ? 1.2 : 0.2]);
  if (s.year >= 1996 && s.year < 2016) options.push(["online", s.year < 2005 ? 0.8 : 2.2]);
  if (s.year >= 2012) options.push(["app", s.age <= 40 ? 3.5 : 1.2]);
  if (s.year >= 1980) options.push(["gym", 0.4]);
  options.push(["travel", 0.3]);
  return ctx.rng.weighted(options);
}

// ---------- the partner from a family input (a hook; inactive with no family input) ----------
export const partnerMember = family => (family && Array.isArray(family.members) && family.members.find(m => m.relation === "partner")) || null;
// The age both of you must have reached before the real partner can be the one you date, when you did not say when
// you got together (US first marriages come at 28–30, so meeting from the early twenties makes a plausible spouse).
export const REAL_PARTNER_AGE = 21;
export function realPartnerPlan(m) {
  const wed = m && Number.isInteger(m.marriedYear) ? m.marriedYear : null;
  const meet = m && Number.isInteger(m.metYear) ? m.metYear : wed !== null ? wed - 2 : null;
  return { meet, wed };
}
// The family's partner when this year's new relationship is with them, else null.
export function realPartnerDue(s, ctx) {
  const m = partnerMember(ctx.family);
  if (!m || s.flags.realPartnerMet !== undefined) return null;
  const plan = realPartnerPlan(m);
  if (plan.meet !== null) return s.year >= plan.meet ? m : null;
  const min = REAL_PARTNER_AGE;
  if (s.age < min) return null;
  if (m.date && s.year - m.date.y < min) return null;
  const both = m.date ? Math.max(min, m.date.y + min - s.birthYear) : min;
  return s.spells.some(x => x.from <= both && (x.to === null || x.to > both)) ? null : m;
}
export const onlyPartner = ctx => { const m = partnerMember(ctx.family); return !!(m && m.only); };
export const keptForPartner = (s, ctx) => onlyPartner(ctx) && s.flags.realPartnerMet === undefined;
export const realPartnerWaiting = (s, ctx) => keptForPartner(s, ctx) && !realPartnerDue(s, ctx);
const datingReal = s => s.rel === "dating" && s.partner && s.partner.real;
export const realPartnerSteady = (s, ctx) => onlyPartner(ctx) && datingReal(s);
export function realPartnerAhead(s, ctx) {
  const m = partnerMember(ctx.family), plan = realPartnerPlan(m);
  return !!(m && plan.meet !== null && s.flags.realPartnerMet === undefined && s.year < plan.meet);
}
export function realPartnerEngaged(s, ctx) {
  const wed = realPartnerPlan(partnerMember(ctx.family)).wed;
  return wed !== null && datingReal(s) && s.year < wed;
}
export function realPartnerWeddingDue(s, ctx) {
  const wed = realPartnerPlan(partnerMember(ctx.family)).wed;
  return wed !== null && datingReal(s) && s.year >= wed;
}
export function realPartner(s, ctx, m) {
  const age = m.date ? s.year - m.date.y : Math.max(18, s.age + Math.round(ctx.rng.between(-3, 4)) * (s.sex === "male" ? -1 : 1));
  const how = meetPlace(s, ctx, { classmates: Math.abs(s.age - age) <= 3 });
  const sex = m.sex || (s.sex === "male" ? "female" : "male");
  const p = newPerson(s, ctx, { role: "partner", sex, birthYear: s.year - age, how, name: m.name || null });
  p.age = age; p.real = true;
  return p;
}
// How the story went with the real partner, for the 100 reruns: met, married (life.js records the age), divorced.
export function realPartnerOutcome(s) {
  const p = [s.partner, ...s.exes].find(x => x && x.real);
  const married = !!p && s.flags.realPartnerWed !== undefined;
  return { met: !!p, married, divorced: married && p !== s.partner && p.alive !== false };
}
