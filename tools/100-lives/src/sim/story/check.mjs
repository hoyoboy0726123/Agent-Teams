// A self-check of the story events, independent of the engine: it loads every event module (with the engine's
// helpers stubbed, unless --real), then for each event draws sample lives where it can happen and runs it.
//
//   node src/sim/story/check.mjs [--real] [--samples 40] [--verbose] [--show id,id] [--lives 300]
//
// --lives N also runs N whole lives through a minimal yearly loop (the same queue, pacing and choice rules as
// bazi-life's life.js, without the chart's tilt) and reports choices per life, story events per stage, rough
// demographics, broken lines, and the events that never happened.
//
// Errors (exit code 1):
//   ids        unique event ids; option ids in `event.option` form with the event's own id, unique everywhere
//   options    4–6 options in every choice (before `when`), at least 2 on offer in every sampled situation
//   weights    the options' weights add up to about 1 (0.9–1.1)
//   templates  every template given to ctx.w() has balanced braces; no prompt, label, hint or line has a brace or
//              reads undefined / null / NaN / [object / function
//   language   no Chinese characters in any file here
//   fields     ages within 0–110; p is a function; exactly one of apply / choice; known domain, channel, style, act
// Warnings: events never possible in the samples, moods outside −16..12, events whose line never varies.
import { register } from "node:module";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const REAL = args.includes("--real"), VERBOSE = args.includes("--verbose");
const SAMPLES = Number(args[args.indexOf("--samples") + 1]) || 40;
// --show id[,id…]: print the prompts, buttons and lines of those events, to proofread them.
const SHOW = args.includes("--show") ? new Set(args[args.indexOf("--show") + 1].split(",")) : null;

// ---------- stand-ins for the engine's helpers (world.js, people.js, act.js, words.js) ----------
const STUB = String.raw`
const STATES = ["CA","TX","FL","NY","PA","IL","OH","GA","NC","MI","NJ","VA","WA","AZ","MA","TN","IN","MO","MD","WI","CO","MN","SC","AL","LA","KY","OR","OK","CT","UT","IA","NV","AR","MS","KS","NM","NE","ID","WV","HI","NH","ME","MT","RI","DE","SD","ND","AK","VT","WY","DC"];
export const JOBS = {
  basic: [["cashier", 0.7, "retail"], ["warehouse worker", 0.8, "logistics"], ["line cook", 0.72, "food service"], ["construction laborer", 0.85, "construction"], ["truck driver", 0.95, "transportation"], ["janitor", 0.7, "services"]],
  high: [["retail store manager", 0.85, "retail"], ["factory technician", 0.92, "manufacturing"], ["office clerk", 0.85, "office"], ["electrician", 1.05, "construction"], ["hairstylist", 0.8, "services"], ["auto mechanic", 0.95, "manufacturing"], ["bank teller", 0.8, "finance"]],
  college: [["sales rep", 1.0, "sales"], ["software engineer", 1.4, "tech"], ["registered nurse", 1.15, "health"], ["accountant", 1.05, "finance"], ["graphic designer", 0.95, "design"], ["teacher", 0.95, "education"], ["marketing coordinator", 0.95, "marketing"], ["social worker", 0.85, "social services"], ["reporter", 0.9, "media"]],
  graduate: [["research scientist", 1.3, "research"], ["pharmacist", 1.45, "health"], ["data scientist", 1.45, "tech"], ["professor", 1.2, "education"], ["product manager", 1.5, "tech"], ["lawyer", 1.6, "law"], ["architect", 1.3, "construction"]],
};
export const tier = edu => ({ high: "high", ged: "high", certificate: "high", associate: "college", bachelor: "college", master: "graduate", professional: "graduate", doctorate: "graduate" })[edu] || "basic";
export const jobsFor = (s, list = JOBS[tier(s.edu)]) => list;
export const pickJob = (s, ctx, list = JOBS[tier(s.edu)]) => ctx.rng.pick(list);
export const jobFit = () => 1;
export const wage = (s, factor) => factor;
export function startJob(s, ctx, pick = null) {
  const [title, factor, field, element] = pick || pickJob(s, ctx);
  s.employed = true; s.job = { title, factor, field, element, since: s.age }; s.unemployedFor = 0; s.done.add("firstJob"); s.income = factor;
  return title;
}
export const otherJob = (s, ctx) => ctx.rng.pick(JOBS[tier(s.edu)].filter(([t]) => !s.job || t !== s.job.title));
export function moveTo(s, ctx, options = null) { const list = options ? options.map(x => x[0]) : STATES; s.county = ctx.rng.pick(list.filter(c => c !== s.county)); return s.county; }
export const yearsMarried = s => (s.since === null ? 0 : s.age - s.since);
export const bornSiblings = (s, minAge = 0) => s.siblings.list.filter(x => x.born && x.alive !== false && s.age - x.bornAt >= minAge);
export const regionOf = () => "south";
export const COUNTIES = STATES.map(c => [c, 1]);
export function newKid(s, ctx) { const k = ctx.person({ role: "kid", sex: ctx.rng() < 0.512 ? "male" : "female", birthYear: s.year }); k.age = 0; return k; }
export const meetPlace = (s, ctx) => ctx.rng.pick(["classmate", "coworker", "friends", "church", "dating app", "chat room", "bar", "something unheard of"]);
export const realPartnerDue = () => null;
export const realPartnerAhead = () => false, realPartnerEngaged = () => false, realPartnerWeddingDue = () => false, realPartnerWaiting = () => false, keptForPartner = () => false, realPartnerSteady = () => false;
export const realPartnerPlan = () => ({ meet: null });
export const realPartner = (s, ctx) => ctx.person({ role: "partner", sex: "female", birthYear: s.year - s.age });
export const surnameIn = full => String(full || "").split(" ").pop() || null;
export const sameSexCouple = s => !!(s.partner && s.partner.sex === s.sex);
export const canMarry = s => !sameSexCouple(s) || s.year >= 2015;
export const datingSex = (s, ctx) => (ctx.rng() < 0.05 ? s.sex : s.sex === "male" ? "female" : "male");
export const pronoun = p => (p && p.sex === "female" ? "she" : "he");
export function closeSpell(s, end) { const l = s.spells[s.spells.length - 1]; if (l && l.to === null) { l.to = s.age; l.end = end; } }
export function endRelationship(s) {
  if (s.rel === "married") { s.rel = "divorced"; s.divorces += 1; if (s.partner) s.exes.push(s.partner); s.partner = null; s.since = null; closeSpell(s, "divorce"); return "married"; }
  if (s.rel === "dating") { s.rel = "single"; if (s.partner) s.exes.push(s.partner); s.partner = null; return "dating"; }
  return null;
}
export function marry(s) { s.rel = "married"; s.marriages += 1; s.since = s.age; s.spells.push({ from: s.age, to: null, end: null }); if (s.home === "parents") s.home = "rent"; }
export function ownHome(s) { s.home = "own"; }
export const siblingCall = x => x.label;
export const listWords = items => items.join(" and ");
export const chatTool = () => "the phone";
export const tripPlace = () => "Yellowstone";
`;

// Engine modules a story file imports (anything outside this folder) get the stub.
if (!REAL) {
  const hooks = `
    const stub = ${JSON.stringify(STUB)};
    const story = ${JSON.stringify(pathToFileURL(HERE + "/").href)};
    export async function resolve(spec, context, next) {
      if (context.parentURL && context.parentURL.startsWith(story) && spec.startsWith("../")) return { url: "stub:" + spec, shortCircuit: true };
      return next(spec, context);
    }
    export async function load(url, context, next) {
      if (url.startsWith("stub:")) return { format: "module", source: stub, shortCircuit: true };
      return next(url, context);
    }`;
  register("data:text/javascript," + encodeURIComponent(hooks));
}

// ---------- the same randomness and templates as the engine (rng.js, grammar.js) ----------
function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.int = n => Math.floor(next() * n);
  next.pick = list => list[Math.floor(next() * list.length)];
  next.chance = p => next() < p;
  next.between = (a, b) => a + (b - a) * next();
  next.normal = () => { let u = 0; while (u === 0) u = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next()); };
  next.weighted = pairs => { const total = pairs.reduce((a, [, w]) => a + w, 0); let x = next() * total; for (const [item, w] of pairs) { x -= w; if (x < 0) return item; } return pairs[pairs.length - 1][0]; };
  return next;
}
function closing(t, i) { let d = 0; for (let j = i; j < t.length; j++) { if (t[j] === "{") d++; else if (t[j] === "}" && --d === 0) return j; } return -1; }
function alternatives(inner) { const parts = []; let d = 0, start = 0; for (let j = 0; j < inner.length; j++) { const c = inner[j]; if (c === "{") d++; else if (c === "}") d--; else if (c === "|" && d === 0) { parts.push(inner.slice(start, j)); start = j + 1; } } parts.push(inner.slice(start)); return parts; }
function expand(template, vars, rng) {
  let out = "";
  for (let i = 0; i < template.length;) {
    if (template[i] !== "{") { out += template[i++]; continue; }
    const end = closing(template, i);
    if (end < 0) { out += template.slice(i); break; }
    const inner = template.slice(i + 1, end), parts = alternatives(inner);
    if (parts.length > 1) out += expand(parts[Math.floor(rng() * parts.length)], vars, rng);
    else if (/^\w+$/.test(inner)) { const v = vars[inner]; out += v === undefined || v === null ? `{${inner}}` : String(typeof v === "function" ? v() : v); }
    else out += expand(inner, vars, rng);
    i = end + 1;
  }
  return out;
}
const balanced = t => { let d = 0; for (const c of t) { if (c === "{") d++; else if (c === "}" && --d < 0) return false; } return d === 0; };

// ---------- sample lives ----------
const STATES = ["CA", "TX", "FL", "NY", "PA", "IL", "OH", "GA", "NC", "MI", "LA", "WA", "AZ", "MA", "CO", "MN", "OK", "MO", "OR", null];
const NATURES = [{ word: "kind", crisis: 0.9 }, { word: "funny", crisis: 1 }, { word: "stubborn", crisis: 1.1 }, { word: "easygoing", crisis: 0.95 }];
const NAMES = { male: ["James", "Michael", "David", "Jayden", "Luis", "Tyrone", "Kenji"], female: ["Mary", "Linda", "Jennifer", "Ashley", "Maria", "Keisha", "Mei"] };
let seq = 0;
function person(rng, { role, sex, birthYear, how = "" }, year) {
  const first = rng.pick(NAMES[sex] || NAMES.male);
  return { id: `${role}${++seq}`, role, sex, birthYear, name: `${first} ${rng.pick(["Smith", "Garcia", "Johnson", "Nguyen", "Okafor"])}`, call: first, how, nature: role === "partner" ? rng.pick(NATURES) : { word: "loyal" }, bond: 0.5, alive: true, age: year - birthYear };
}
const EDU_BY_AGE = a => (a < 6 ? "none" : a < 11 ? "elementary" : a < 18 ? "middle" : null);
function sampleState(rng, ev) {
  let birthYear, age;
  if (ev.years) { const year = ev.years[0] + rng.int(ev.years[1] - ev.years[0] + 1); age = ev.ages ? ev.ages[0] + rng.int(ev.ages[1] - ev.ages[0] + 1) : rng.int(100); birthYear = year - age; }
  else { age = ev.ages ? ev.ages[0] + rng.int(Math.min(110, ev.ages[1]) - ev.ages[0] + 1) : rng.int(101); birthYear = 1950 + rng.int(76); }
  const year = birthYear + age, sex = rng() < 0.5 ? "male" : "female";
  const s = {
    sex, birthYear, age, year, alive: true, county: rng.pick(STATES), abroad: rng() < 0.03 ? "London" : null, name: "", edu: "none", studying: false, track: null,
    employed: false, job: null, career: rng.int(4), income: 0, savings: rng.between(0, 4), debt: rng() < 0.3 ? rng.between(0, 1) : 0, retired: false, unemployedFor: 0,
    rel: "single", partner: null, exes: [], since: null, marriages: 0, divorces: 0, guard: 0, crisis: 0, spells: [],
    kids: [], friends: [], siblings: { list: [], unborn: rng.int(2) }, tilts: { bond: {}, childhood: 0, study: 0 },
    traits: { drive: rng(), caution: rng(), warmth: rng(), health: rng(), curiosity: rng() },
    health: { chronic: rng() < 0.2, serious: rng() < 0.05 ? { type: rng.pick(["cancer", "heart", "stroke"]), since: Math.max(0, age - rng.int(6)) } : null, checkups: rng() < 0.4, hr: 1, fitness: 0.5, smoke: false, drink: false, stress: 0.3 },
    father: { alive: rng() < (age < 40 ? 0.95 : 0.5), age: age + 28 + rng.int(8), name: "" }, mother: { alive: rng() < (age < 40 ? 0.97 : 0.6), age: age + 26 + rng.int(8), name: "" },
    home: age < 20 ? "parents" : rng.pick(["rent", "own", "parents"]), happiness: 60, done: new Set(), count: {}, last: {}, flags: {}, arcs: {}, memory: [], jobsHeld: [], lean: { offered: 0, followed: 0 }, written: 0, used: new Set(),
  };
  s.birthCounty = rng() < 0.7 ? s.county : rng.pick(STATES);
  // schooling, by age
  const e = EDU_BY_AGE(age);
  if (age >= 6 && age <= 10) { s.edu = "elementary"; s.studying = true; s.track = "elementary"; }
  else if (age >= 11 && age <= 13) { s.edu = rng() < 0.5 && age === 11 ? "elementary" : "middle"; s.studying = true; s.track = s.edu; }
  else if (age >= 14 && age <= 17) { s.edu = "middle"; s.studying = rng() < 0.92; s.track = rng() < 0.1 && age === 14 ? "middle" : "high"; s.flags.trackAt = 14; }
  else if (age >= 18) {
    s.edu = rng.pick(["middle", "high", "high", "ged", "certificate", "associate", "bachelor", "bachelor", "master", "professional", "doctorate"]);
    if (age <= 35 && rng() < 0.45) {
      s.studying = true;
      const t = rng.pick(age <= 19 ? ["high", "college", "community", "trade"] : age <= 23 ? ["college", "community", "trade", "grad"] : ["grad", "law", "med", "phd", "college"]);
      s.track = t;
      if (t === "high") { s.edu = "middle"; s.flags.trackAt = age - 4; }
      if (t === "college") { s.edu = "high"; s.flags.uniAt = age - rng.int(6); }
      if (t === "community") { s.edu = "high"; s.flags.ccAt = age - rng.int(4); }
      if (t === "trade") { s.edu = "high"; s.flags.tradeAt = age - rng.int(3); s.flags.trade = "welding"; }
      if (["grad", "law", "med", "phd"].includes(t)) { s.edu = "bachelor"; s.flags.gradAt = age - rng.int(7); }
    }
  }
  if (e === null && !s.studying) s.done.add("highSchool");
  // work
  if (!s.studying && age >= 16) {
    s.flags.leftSchool = Math.max(16, age - rng.int(10));
    if (age >= 62 && rng() < 0.6) { s.retired = true; s.done.add("firstJob"); }
    else if (rng() < 0.8) {
      const mil = rng() < 0.08 && age <= 45;
      s.employed = true; s.done.add("firstJob");
      s.job = mil ? { title: "soldier in the Army", factor: 0.8, field: "military", since: age - 2 } : { title: rng.pick(["nurse", "electrician", "teacher", "cashier", "software engineer"]), factor: 1, field: rng.pick(["health", "construction", "education", "retail", "tech", "government", "family"]), since: age - rng.int(8) };
      s.income = rng.between(0.5, 2);
      if (mil) { s.flags.serviceUntil = age + (rng() < 0.4 ? 0 : rng.int(3)); s.flags.served = { branch: "Army", from: age - 3 }; }
    } else if (rng() < 0.7) { s.done.add("firstJob"); s.unemployedFor = 1 + rng.int(2); }
  }
  // love
  if (age >= 17) {
    s.rel = rng.pick(age < 22 ? ["single", "single", "dating"] : ["single", "dating", "married", "married", "divorced", ...(age > 60 ? ["widowed"] : [])]);
    if (s.rel === "dating" || s.rel === "married") {
      const same = rng() < 0.1, pAge = Math.max(17, age + rng.int(7) - 3);
      s.partner = person(rng, { role: "partner", sex: same ? sex : sex === "male" ? "female" : "male", birthYear: year - pAge, how: "friends" }, year);
      if (s.rel === "married") { s.marriages = 1; s.since = Math.max(18, age - rng.int(20)); s.spells.push({ from: s.since, to: null, end: null }); }
      else s.datingSince = age - rng.int(4);
    }
    if (s.rel === "divorced") { s.marriages = 1; s.divorces = 1; }
  }
  // kids, siblings, friends
  if (age >= 22) for (let i = rng.int(4); i > 0; i--) { const k = person(rng, { role: "kid", sex: rng() < 0.5 ? "male" : "female", birthYear: year - rng.int(Math.min(50, age - 18)) }, year); s.kids.push(k); }
  s.kids.sort((a, b) => b.age - a.age);
  for (let i = rng.int(4); i > 0; i--) { const older = rng() < 0.5, relation = (older ? "older" : "younger") + (rng() < 0.5 ? "Brother" : "Sister"); s.siblings.list.push({ relation, label: { olderBrother: "big brother", olderSister: "big sister", youngerBrother: "little brother", youngerSister: "little sister" }[relation], name: rng() < 0.5 ? rng.pick(NAMES.female) : "", older, bornAt: older ? -1 - rng.int(6) : 1 + rng.int(8), born: older || rng() < 0.8 }); }
  for (let i = rng.int(3); i > 0; i--) s.friends.push(person(rng, { role: "friend", sex, birthYear }, year));
  if (s.friends.length && rng() < 0.7) s.flags.bff = s.friends[0].id;
  if (rng() < 0.2) s.flags.parentsSplit = true;
  if (rng() < 0.3) s.flags.homeMoney = "tight";
  if (s.abroad) s.leftAt = age - rng.int(5);
  if (rng() < 0.1) s.flags.draftLow = year;
  if (age >= 30 && rng() < 0.1) { s.father.alive = false; s.mother.alive = false; s.last.fatherDeath = age; }
  if (rng() < 0.3) s.flags.pet = { ...rng.pick([{ kind: "dog", name: "Biscuit", noun: "dog" }, { kind: "fish", name: "Goldie", noun: "goldfish" }]), since: Math.max(0, age - 3) };
  if (rng() < 0.3) s.flags.talent = rng.pick(["piano", "soccer", "art"]);
  if (rng() < 0.3) s.flags.firstCar = { name: "a Ford Escort", age: 16 };
  if (rng() < 0.5) s.flags.license = 16;
  if (age >= 14 && age <= 19) {
    if (rng() < 0.4) s.flags.firstLove = { name: "Sam", sex: sex === "male" ? "female" : "male", age: age - rng.int(3), way: "asked" };
    if (rng() < 0.4) s.flags.parttime = "bagging groceries at the A&P";
    if (rng() < 0.5) { s.flags.club = rng.pick(["sports", "band", "theater", "debate", "paper", "none"]); s.flags.sport = "soccer"; }
    if (rng() < 0.3) s.flags.talent = "scouts";
  }
  if (age >= 40) s.memory.push({ kind: "graduateUni", text: "You graduated from college!", age: age - 25, year: year - 25, mood: 3 }, { kind: "divorce", text: "You and Sam divorced.", age: age - 21, year: year - 21, mood: -12 });
  // a few done events, so `done.has` conditions can hold
  for (const id of ["primary", "middle", "kindergarten", "crush", "senior"]) if (rng() < 0.5) s.done.add(id);
  return s;
}

function makeCtx(rng, s, R, seen, scene = {}) {
  const slots = () => ({ city: s.abroad || s.county || "Ohio", job: s.job ? s.job.title : "work", partner: s.partner ? s.partner.call : "your partner", kid: s.kids.length ? s.kids[s.kids.length - 1].call : "your kid", kids: s.kids.length > 1 ? "kids" : "kid", friend: () => (scene.friend ??= (s.friends.length ? s.friends[0].call : "an old friend")), trip: () => (scene.trip ??= rng.pick(["Yellowstone", "Disney World", "the Grand Canyon", "Paris"])), age: s.age, year: s.year });
  const ctx = {
    scene, rng, R, s, prep: { intro: "Sun in Leo, Moon in Pisces, Scorpio rising", jobFit: () => rng.between(-1, 1) }, analysis: null, family: null, name: null,
    w(templates, vars = {}) {
      const list = Array.isArray(templates) ? templates : [templates];
      for (const t of list) { if (typeof t !== "string") seen.errors.push(`ctx.w got a ${typeof t}`); else if (!balanced(t)) seen.errors.push(`unbalanced braces in template: ${t.slice(0, 120)}`); seen.templates.push(t); }
      return expand(rng.pick(list), { ...slots(), ...vars }, rng);
    },
    odds: (d, c, p) => p, roll: (d, c, p) => rng() < p,
    person: o => person(rng, o, s.year),
    remember: (kind, text, extra = {}) => s.memory.push({ kind, text, age: s.age, ...extra }),
    nudge: (k, d) => { s.traits[k] = Math.max(0, Math.min(1, (s.traits[k] ?? 0.5) + d)); },
    luckAt: () => ({ reasons: [], L: 0, score: 50 }),
    arc: {
      start: (id, data = {}, inYears = 1, stage = "start") => s.arcs[id] || (s.arcs[id] = { stage, next: s.age + inYears, since: s.age, data }),
      at: (id, stage) => !!s.arcs[id] && s.arcs[id].stage === stage && s.age >= s.arcs[id].next,
      go: (id, stage, inYears = 1) => { if (s.arcs[id]) { s.arcs[id].stage = stage; s.arcs[id].next = s.age + inYears; } },
      end: (id, outcome = true) => { delete s.arcs[id]; s.flags[`arc_${id}`] = outcome; },
      get: id => s.arcs[id] || null,
    },
  };
  return ctx;
}

// ---------- the checks ----------
const DOMAINS = new Set(["career", "wealth", "love", "health", "study", "family", "move"]), CHANNELS = new Set(["good", "bad", "change"]);
const STYLES = new Set(["risk", "safe", "family", "self", "health", "social", "learn"]);
const ACTS = new Set("jobSearch jobHop careerSwitch study studyAbroad civilService startup sideJob negotiate dispute quitJob workAbroad familyBusiness pushThrough retire save invest buyHome sellAsset borrow lend insurance lottery donate talk counsel avoid separate marry wait pursue haveChild noChild care hireCare shareCare reconcile insist cutOff seekHelp affair rest travel exercise seeDoctor quitHabit vice hobby volunteer socialize moveHome emigrate spiritual".split(" "));
const BROKEN = /[{}]|undefined|null|NaN|\[object|function/;
const CJK = new RegExp("[\\u2e80-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef]");

const errors = [], warnings = [];
const err = (id, m) => errors.push(`${id}: ${m}`), warn = (id, m) => warnings.push(`${id}: ${m}`);

for (const f of readdirSync(HERE).filter(f => /\.(m?js)$/.test(f))) {
  const lines = readFileSync(join(HERE, f), "utf8").split("\n");
  lines.forEach((l, i) => { if (CJK.test(l)) err(f, `Chinese characters on line ${i + 1}`); });
}

const index = await import(pathToFileURL(join(HERE, "index.js")).href);
const R = REAL && existsSync(join(HERE, "../rates.js")) ? await import(pathToFileURL(join(HERE, "../rates.js")).href) : {};
const modules = index.MODULES;
const all = Object.values(modules).flat();
const ids = new Set(), optionIds = new Map();
const rng = makeRng(20261028);
const stats = {};

for (const [name, events] of Object.entries(modules)) {
  stats[name] = { events: events.length, choices: events.filter(e => e.choice).length, never: 0 };
  for (const ev of events) {
    const id = ev.id;
    if (!id || typeof id !== "string") { err(name, "an event without an id"); continue; }
    if (ids.has(id)) err(id, "duplicate event id"); ids.add(id);
    if (typeof ev.p !== "function") err(id, "p is not a function");
    if (!!ev.apply === !!ev.choice) err(id, "needs exactly one of apply / choice");
    if (ev.channel && (!CHANNELS.has(ev.channel) || !DOMAINS.has(ev.domain))) err(id, `bad domain/channel ${ev.domain}/${ev.channel}`);
    if (ev.domain && !DOMAINS.has(ev.domain)) err(id, `bad domain ${ev.domain}`);
    if (ev.ages && !(ev.ages.length === 2 && ev.ages[0] >= 0 && ev.ages[1] <= 110 && ev.ages[0] <= ev.ages[1])) err(id, `ages ${JSON.stringify(ev.ages)} not within 0–110`);
    if (ev.years && !(ev.years[0] >= 1940 && ev.years[1] <= 2030 && ev.years[0] <= ev.years[1])) err(id, `years ${JSON.stringify(ev.years)}`);

    // sample situations where the event can happen, and run it
    let runs = 0;
    const texts = new Set();
    for (let tries = 0; tries < 4000 && runs < SAMPLES; tries++) {
      const s = sampleState(rng, ev), seen = { errors: [], templates: [] }, ctx = makeCtx(rng, s, R, seen);
      if (ev.ages && (s.age < ev.ages[0] || s.age > ev.ages[1])) continue;
      let ok;
      try { ok = !ev.when || ev.when(s, ctx); } catch (e) { err(id, `when() threw: ${e.message}`); break; }
      if (!ok) continue;
      runs++;
      try {
        const p = ev.p(s, ctx);
        if (!(typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1.0001)) err(id, `p() gave ${p}`);
        if (ev.choice) {
          const c = ev.choice(s, ctx);
          if (!c) continue;
          const opts = c.options || [];
          if (!c.prompt || BROKEN.test(c.prompt)) err(id, `prompt: ${c.prompt}`);
          if (SHOW && SHOW.has(id)) console.log(`\n[${id}] age ${s.age}, ${s.year}: ${c.prompt}`);
          if (opts.length < 4 || opts.length > 6) err(id, `${opts.length} options`);
          let total = 0;
          for (const o of opts) {
            if (!o.id || !o.id.startsWith(`${id}.`) || !/^[\w]+\.[\w]+$/.test(o.id)) err(id, `option id ${o.id} is not ${id}.option`);
            const owner = optionIds.get(o.id);
            if (owner && owner !== id) err(id, `option id ${o.id} also used by ${owner}`); optionIds.set(o.id, id);
            if (!o.label || BROKEN.test(o.label)) err(o.id, `label: ${o.label}`);
            if (o.hint && BROKEN.test(o.hint)) err(o.id, `hint: ${o.hint}`);
            if (o.style && !STYLES.has(o.style)) err(o.id, `style ${o.style}`);
            if (!o.act || !ACTS.has(o.act)) err(o.id, `act ${o.act}`);
            const w = typeof o.weight === "function" ? o.weight(s, ctx) : o.weight ?? 1;
            if (!(Number.isFinite(w) && w >= 0)) err(o.id, `weight ${w}`);
            total += w;
          }
          if (opts.length && (total < 0.9 || total > 1.1)) err(id, `weights add up to ${total.toFixed(2)}`);
          const offered = opts.filter(o => !o.when || o.when(s, ctx));
          if (offered.length < 2) err(id, `only ${offered.length} option(s) on offer (age ${s.age}, ${s.year})`);
          else if (offered.length < 3) warn(id, `only ${offered.length} options on offer at age ${s.age} in ${s.year}`);
          for (const o of offered) {
            const s2 = structuredClone(s), ctx2 = makeCtx(rng, s2, R, seen, ctx.scene);
            const out = o.apply ? o.apply(s2, ctx2) : null;
            if (o.apply && (!out || !out.text || BROKEN.test(out.text))) err(o.id, `line: ${out && out.text}`);
            if (out && typeof out.mood === "number" && (out.mood < -16 || out.mood > 12)) warn(o.id, `mood ${out.mood}`);
            if (out && out.text) texts.add(out.text);
            if (SHOW && SHOW.has(id)) console.log(`   (${o.label} | ${o.hint || ""}) ${out && out.text}`);
          }
          if (c.onFree) for (const a of ["study", "jobSearch", "rest", "pushThrough"]) c.onFree(a, structuredClone(s), ctx);
        } else {
          const out = ev.apply(s, ctx);
          if (!out || !out.text || BROKEN.test(out.text)) err(id, `line: ${out && out.text}`);
          else texts.add(out.text);
          if (SHOW && SHOW.has(id)) console.log(`[${id}] age ${s.age}, ${s.year}: ${out && out.text}`);
          if (out && typeof out.mood === "number" && (out.mood < -16 || out.mood > 12)) warn(id, `mood ${out.mood}`);
        }
      } catch (e) { err(id, `threw: ${e.stack.split("\n").slice(0, 2).join(" ")}`); break; }
      for (const m of seen.errors) err(id, m);
    }
    if (!runs) { stats[name].never++; if (!ev.rare) warn(id, "never possible in the sample lives"); }
    else if (runs >= 8 && texts.size < 2) warn(id, `the same line in all ${runs} samples`);
  }
}
// The death line.
if (index.deathEvent) for (const age of [5, 30, 60, 90]) {
  const s = sampleState(rng, { ages: [age, age] }), seen = { errors: [], templates: [] }, ctx = makeCtx(rng, s, R, seen);
  s.health.diedOf = age === 60 ? "cancer" : null;
  const out = index.deathEvent.apply(s, ctx);
  if (!out || !out.text || BROKEN.test(out.text)) err("death", `line: ${out && out.text}`);
}

// ---------- whole lives (--lives N) ----------
const LIVES = args.includes("--lives") ? Number(args[args.indexOf("--lives") + 1]) || 300 : 0;
if (LIVES) {
  const { FALLBACK } = await import(pathToFileURL(join(HERE, "common.js")).href);
  const order = index.ALL_EVENTS, fired = new Map(), stage = { child: [], teen: [] }, perLife = [];
  const demo = { college: 0, degree: 0, married35: 0, firstMarriage: [], divorced: 0, kids: [], women: 0, own45: 0, alive45: 0, retireAge: [], death: [], served: 0, men: 0, dropout: 0 };
  for (let n = 0; n < LIVES; n++) {
    const s = sampleState(rng, { ages: [0, 0] });
    Object.assign(s, { edu: "none", studying: false, track: null, employed: false, job: null, rel: "single", partner: null, kids: [], friends: [], marriages: 0, divorces: 0, savings: 0, debt: 0, home: "parents", done: new Set(), last: {}, count: {}, flags: {}, memory: [], spells: [], since: null, career: 0, retired: false, unemployedFor: 0, health: { chronic: false, serious: null, checkups: false, hr: 1, fitness: 0.5, smoke: false, drink: false, stress: 0.3 } });
    s.father = { alive: true, age: 26 + rng.int(10), name: "" }; s.mother = { alive: true, age: 24 + rng.int(8), name: "" };
    s.siblings = { list: [], unborn: rng.int(3) };
    for (let i = rng.int(3); i > 0; i--) s.siblings.list.push({ relation: rng() < 0.5 ? "olderBrother" : "olderSister", label: "", name: "", older: true, bornAt: -2 * i, born: true });
    let choices = 0, cStory = 0, cChoice = 0, tStory = 0, tChoice = 0;
    while (s.alive && s.age <= 110) {
      let thisYear = 0;
      for (const ev of order) {
        if (ev.choice && !ev.core && thisYear > 0) continue;
        if (ev.once && s.done.has(ev.id)) continue;
        if (ev.max && (s.count[ev.id] || 0) >= ev.max) continue;
        if (ev.ages && (s.age < ev.ages[0] || s.age > ev.ages[1])) continue;
        if (ev.cooldown && s.last[ev.id] !== undefined && s.age - s.last[ev.id] < ev.cooldown) continue;
        const seen = { errors: [], templates: [] }, ctx = makeCtx(rng, s, R, seen);
        if (ev.when && !ev.when(s, ctx)) continue;
        if (!(rng() < ev.p(s, ctx))) continue;
        s.done.add(ev.id); s.count[ev.id] = (s.count[ev.id] || 0) + 1; s.last[ev.id] = s.age;
        fired.set(ev.id, (fired.get(ev.id) || 0) + 1);
        let out;
        if (ev.choice) {
          const c = ev.choice(s, ctx);
          if (!c) continue;
          const opts = c.options.filter(o => !o.when || o.when(s, ctx));
          if (!opts.length) continue;
          if (opts.length > 1) { thisYear++; choices++; }
          const o = rng.weighted(opts.map(x => [x, Math.max(0.0001, typeof x.weight === "function" ? x.weight(s, ctx) : x.weight ?? 1)]));
          out = o.apply(s, ctx);
          if (!out || !out.text || BROKEN.test(out.text)) err(o.id, `line in a life: ${out && out.text}`);
        } else {
          out = ev.apply(s, ctx);
          if (!out || !out.text || BROKEN.test(out.text)) err(ev.id, `line in a life: ${out && out.text}`);
        }
        for (const m of seen.errors) err(ev.id, m);
        if (out && out.big && ev.id !== "birth") s.memory.push({ kind: ev.id, text: out.text, age: s.age, year: s.year, mood: out.mood || 0 });
        if (/^c_/.test(ev.id)) { cStory++; if (ev.choice) cChoice++; }
        if (/^t_/.test(ev.id)) { tStory++; if (ev.choice) tChoice++; }
        if (ev.id === "senior" || ev.id === "serviceEnd") demo.college += s.track === "college" || s.track === "community" ? 1 : 0;
        if (s.rel === "married" && !demo.firstMarriage[n]) demo.firstMarriage[n] = s.age;
      }
      // the end of the year, roughly as life.js
      const q = Math.min(0.999, FALLBACK.deathRaw(s.age, s.sex) * s.health.hr + (s.health.serious && s.age - s.health.serious.since < 5 ? 0.08 : 0));
      if (s.age >= 110 || rng() < q) { s.alive = false; demo.death.push(s.age); break; }
      if (s.age === 45) { demo.alive45++; if (s.home === "own") demo.own45++; }
      s.age++; s.year++; s.father.age++; s.mother.age++;
      if (s.partner) s.partner.age++;
      for (const k of s.kids) k.age++;
      if (s.guard > 0) s.guard--; if (s.crisis > 0) s.crisis--;
      if (!s.employed && s.done.has("firstJob") && !s.retired) s.unemployedFor++;
      if (s.employed) s.savings += 0.15 * (s.income || 1) * (s.rel === "married" ? 1.5 : 1) - 0.04 * s.kids.filter(k => k.age < 22).length;
      if (s.debt > 0) { const pay = Math.min(s.debt, 0.15, Math.max(0, s.savings)); s.debt -= pay; s.savings -= pay; }
      s.savings = Math.max(0, s.savings);
    }
    perLife.push(choices); stage.child.push([cStory, cChoice]); stage.teen.push([tStory, tChoice]);
    if (["bachelor", "master", "professional", "doctorate"].includes(s.edu)) demo.degree++;
    if (demo.firstMarriage[n] !== undefined && demo.firstMarriage[n] <= 35) demo.married35++;
    if (s.divorces) demo.divorced++;
    if (s.sex === "female") { demo.women++; demo.kids.push(s.kids.length); } else demo.men++;
    if (s.flags.served) demo.served++;
    if (s.flags.dropout !== undefined && s.edu === "middle") demo.dropout++;
    if (s.done.has("retire") && s.retired) demo.retireAge.push(s.last.retire);
  }
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0), pct = x => `${(100 * x / LIVES).toFixed(0)}%`;
  console.log(`\n${LIVES} lives (no chart tilt; stand-in engine and design rates where rates.js is missing)`);
  console.log(`  choices per life ${mean(perLife).toFixed(1)}   childhood stories ${mean(stage.child.map(x => x[0])).toFixed(1)} (${mean(stage.child.map(x => x[1])).toFixed(1)} choices)   teen stories ${mean(stage.teen.map(x => x[0])).toFixed(1)} (${mean(stage.teen.map(x => x[1])).toFixed(1)} choices)`);
  const fm = demo.firstMarriage.filter(x => x !== undefined);
  console.log(`  bachelor's+ ${pct(demo.degree)}   married by 35 ${pct(demo.married35)}   first marriage at ${mean(fm).toFixed(1)}   ever divorced ${pct(demo.divorced)}   kids per woman ${mean(demo.kids).toFixed(2)}`);
  console.log(`  own a home at 45 ${demo.alive45 ? `${(100 * demo.own45 / demo.alive45).toFixed(0)}%` : "-"}   retire at ${mean(demo.retireAge).toFixed(1)}   age at death ${mean(demo.death).toFixed(1)}   served ${demo.men ? `${(100 * demo.served / demo.men).toFixed(0)}% of men` : "-"}   no diploma ${pct(demo.dropout)}`);
  if (args.includes("--rates")) for (const [name, events] of Object.entries(modules)) if (events.length) console.log(`  ${name}: ` + events.map(e => [e.id, (fired.get(e.id) || 0) / LIVES]).sort((a, b) => b[1] - a[1]).map(([i, r]) => `${i} ${r.toFixed(2)}`).join(", "));
  for (const [name, events] of Object.entries(modules)) {
    const silent = events.filter(e => !e.rare && !fired.has(e.id)).map(e => e.id);
    if (silent.length) warn(name, `never happened in ${LIVES} lives: ${silent.join(", ")}`);
  }
}

console.log("module    events  choices");
for (const [name, x] of Object.entries(stats)) console.log(`${name.padEnd(9)} ${String(x.events).padStart(6)} ${String(x.choices).padStart(8)}`);
console.log(`total     ${String(all.length).padStart(6)} ${String(all.filter(e => e.choice).length).padStart(8)}`);
const show = (title, list) => { if (!list.length) return; const uniq = [...new Set(list)]; console.log(`\n${title} (${uniq.length})`); for (const m of VERBOSE ? uniq : uniq.slice(0, 60)) console.log("  " + m); if (!VERBOSE && uniq.length > 60) console.log(`  … ${uniq.length - 60} more (--verbose)`); };
show("warnings", warnings);
show("errors", errors);
console.log(errors.length ? `\n${new Set(errors).size} error(s).` : "\nNo errors.");
process.exit(errors.length ? 1 : 0);
