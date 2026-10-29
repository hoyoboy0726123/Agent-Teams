// A stand-in for src/sim/story/index.js, for the engine tests: a bare US life skeleton (school, work, love, kids, a
// home, illness, retirement) on the same event API, calling the same rates.js and world.js functions the real
// story/core.js is expected to call. One plain line per event; the real story is the story track's.
import { jobsFor, pickJob, startJob, jobHint, moveTo, yearsMarried, militaryJob, setJob } from "../../src/sim/world.js";
import { newKid, meetPlace, datingSex, canMarry, sameSexCouple, MEET_WORDS } from "../../src/sim/people.js";
import { marry, endRelationship, closeSpell, ownHome } from "../../src/sim/act.js";
import { birthText } from "../../src/sim/words.js";

const leaveSchool = s => { s.studying = false; s.flags.leftSchool = s.age; };
const motherAge = s => (s.sex === "female" ? s.age : s.partner ? s.partner.age : 99);

export const CORE = [
  { id: "birth", once: true, ages: [0, 0], p: () => 1, apply: (s, ctx) => ({ text: birthText(s, ctx.prep), mood: 0, big: true }) },
  { id: "sibling", domain: "family", channel: "good", ages: [1, 12], when: s => s.siblings.unborn > 0, p: () => 0.32, apply: s => { s.siblings.unborn -= 1; s.siblings.list.push({ relation: "youngerBrother", label: "younger brother", short: "little brother", name: "", older: false, bornAt: s.age, born: true }); return { text: "Your little brother was born.", mood: 3 }; } },
  { id: "kindergarten", once: true, ages: [5, 5], p: (s, ctx) => ctx.R.kindergarten(s.year), apply: () => ({ text: "You started kindergarten.", mood: 1 }) },
  { id: "elementary", once: true, ages: [6, 6], p: () => 1, apply: s => { s.edu = "elementary"; s.track = "elementary"; s.studying = true; return { text: "First day of first grade.", mood: 1 }; } },
  { id: "middle", once: true, ages: [11, 11], p: (s, ctx) => ctx.R.juniorHigh(s.year), apply: s => { s.edu = "middle"; s.track = "middle"; return { text: "You started middle school.", mood: 0 }; } },
  { id: "high", once: true, ages: [14, 14], when: s => s.studying, p: () => 1, apply: s => { s.track = "high"; return { text: "You started high school.", mood: 1 }; } },
  { id: "hsDropout", calibrated: true, once: true, ages: [16, 17], when: s => s.track === "high" && s.studying, p: (s, ctx) => ctx.R.hsDropout(s.year), apply: s => { leaveSchool(s); return { text: "You dropped out of high school.", mood: -3 }; } },
  { id: "ged", ages: [17, 30], when: s => s.edu === "middle" && !s.studying, p: (s, ctx) => ctx.R.ged(s.age), apply: s => { s.edu = "ged"; return { text: "You passed the GED.", mood: 3 }; } },
  {
    id: "senior", calibrated: true, once: true, ages: [18, 18], when: s => s.track === "high" && s.studying, p: () => 1,
    choice: (s, ctx) => {
      const w = ctx.R.afterHighSchool(s.year, s.sex, s.birthYear);
      s.edu = "high";
      const go = (track, text, more = () => {}) => s2 => { s2.track = track; s2.flags.uniAt = s2.age; more(s2); return { text, mood: 3 }; };
      return {
        prompt: "You graduated from high school. What's next?",
        options: [
          { id: "senior.college", label: "Go to a four-year college", act: "study", style: "learn", weight: w.college, apply: go("college", "You went off to college.") },
          { id: "senior.community", label: "Community college", act: "study", style: "safe", weight: w.community, apply: go("community", "You enrolled at the community college.") },
          { id: "senior.trade", label: "Trade school", act: "careerSwitch", style: "safe", weight: w.trade, apply: go("trade", "You started trade school.") },
          { id: "senior.military", label: "Enlist", act: "enlist", style: "risk", weight: w.military, apply: (s2, c) => { leaveSchool(s2); setJob(s2, c, militaryJob(c.rng, s2.year)); s2.done.add("firstJob"); s2.flags.serviceUntil = s2.age + 4; return { text: "You enlisted.", mood: 2 }; } },
          { id: "senior.work", label: "Get a job", act: "jobSearch", style: "self", weight: w.work, apply: s2 => { leaveSchool(s2); return { text: "You decided to go to work.", mood: 0 }; } },
        ],
        onFree: (action, s2) => { if (action !== "study") leaveSchool(s2); else s2.track = "college"; },
      };
    },
  },
  { id: "tradeDone", once: true, when: s => s.studying && s.track === "trade" && s.age >= (s.flags.uniAt ?? 18) + 1, p: () => 1, apply: s => { s.edu = "certificate"; leaveSchool(s); return { text: "You finished trade school.", mood: 3 }; } },
  { id: "dropoutCollege", when: s => s.studying && (s.track === "college" || s.track === "community"), p: (s, ctx) => ctx.R.collegeDropout(s.year, s.track), apply: s => { leaveSchool(s); s.track = null; return { text: "You left college without a degree.", mood: -2 }; } },
  { id: "ccDone", once: true, when: s => s.studying && s.track === "community" && s.age >= (s.flags.uniAt ?? 18) + 2, p: () => 1, apply: (s, ctx) => { s.edu = "associate"; if (ctx.rng() < ctx.R.transfer()) { s.track = "college"; s.flags.uniAt = s.age - 2; return { text: "Associate degree done; you transferred.", mood: 3 }; } leaveSchool(s); return { text: "You earned your associate degree.", mood: 3 }; } },
  { id: "graduateUni", once: true, when: s => s.studying && s.track === "college" && s.age >= (s.flags.uniAt ?? 18) + 4, p: () => 1, apply: (s, ctx) => { s.edu = "bachelor"; const g = ctx.R.gradSchool(s.year); if (ctx.rng() < g.master + g.professional + g.phd) { s.track = "grad"; s.flags.gradAt = s.age; return { text: "You graduated and went on to grad school.", mood: 4 }; } leaveSchool(s); return { text: "You graduated from college.", mood: 5, big: true }; } },
  { id: "gradDone", once: true, when: s => s.studying && s.track === "grad" && s.age >= (s.flags.gradAt ?? 22) + 2, p: () => 1, apply: s => { s.edu = "master"; leaveSchool(s); return { text: "You finished your master's.", mood: 4 }; } },
  { id: "serviceEnd", when: s => s.job && s.job.field === "military" && s.flags.serviceUntil !== undefined && s.age >= s.flags.serviceUntil, p: () => 1, apply: s => { s.employed = false; s.job = null; s.flags.served = s.flags.served || { from: s.age - 4 }; delete s.flags.serviceUntil; return { text: "Your service ended.", mood: 2 }; } },
  {
    id: "firstJob", calibrated: true, once: true, ages: [16, 40], when: s => !s.studying && !s.employed, p: (s, ctx) => ctx.R.jobFind(s.age),
    choice: (s, ctx) => {
      const list = jobsFor(s), offers = [];
      while (offers.length < Math.min(3, list.length)) { const j = pickJob(s, ctx, list.filter(x => !offers.includes(x))); offers.push(j); }
      return {
        prompt: "A few offers came in. Which one do you take?",
        options: [
          ...offers.map((job, i) => ({ id: `firstJob.${i}`, label: job.title, hint: jobHint(ctx, job), act: "jobSearch", weight: 1, apply: (s2, c) => ({ text: `Your first job: ${startJob(s2, c, job)}.`, mood: 5 }) })),
          { id: "firstJob.wait", label: "Keep looking", act: "wait", style: "self", weight: 0.08, apply: () => ({ text: "None of them felt right.", mood: -1 }) },
        ],
      };
    },
  },
  { id: "findJob", domain: "career", channel: "good", ages: [16, 66], when: s => !s.studying && !s.employed && !s.retired && s.done.has("firstJob"), p: () => 0.6, apply: (s, ctx) => ({ text: `You found work: ${startJob(s, ctx)}.`, mood: 5 }) },
  { id: "promotion", domain: "career", channel: "good", ages: [22, 64], cooldown: 2, when: s => s.employed && s.career < 5, p: (s, ctx) => ctx.R.promotion(s.age), apply: s => { s.career += 1; s.income *= 1.12; return { text: "You got promoted.", mood: 4 }; } },
  {
    id: "layoff", calibrated: true, domain: "career", channel: "bad", ages: [20, 64], cooldown: 3, when: s => s.employed && s.job && s.job.field !== "military", p: (s, ctx) => ctx.R.layoff(s.year),
    choice: s => { s.employed = false; s.unemployedFor = 1; return { prompt: "Your company is laying people off, and your name is on the list. What now?", options: [
      { id: "layoff.search", label: "Look for work", act: "jobSearch", style: "safe", weight: 0.6 },
      { id: "layoff.rest", label: "Take a break", act: "rest", style: "self", weight: 0.25 },
      { id: "layoff.retrain", label: "Retrain", act: "careerSwitch", style: "learn", weight: 0.15 },
    ] }; },
  },
  { id: "retire", once: true, ages: [55, 80], when: s => s.employed && !s.retired, p: (s, ctx) => ctx.R.retire(s.age, s.sex, s.year), apply: s => { s.retired = true; s.employed = false; return { text: "You retired.", mood: 4, big: true }; } },
  {
    id: "dating", domain: "love", channel: "good", ages: [16, 80], when: s => ["single", "divorced", "widowed"].includes(s.rel), p: (s, ctx) => ctx.R.dating(s.age, s.rel, s.year, s.sex),
    apply: (s, ctx) => { s.prevRel = s.rel; s.rel = "dating"; s.datingSince = s.age; const age = Math.max(16, s.age + ctx.rng.int(5) - 2); const how = meetPlace(s, ctx); s.partner = ctx.person({ role: "partner", sex: datingSex(s, ctx), birthYear: s.year - age, how }); s.partner.age = age; return { text: `You met ${s.partner.call} ${MEET_WORDS[how]}.`, mood: 5 }; },
  },
  { id: "breakup", domain: "love", channel: "bad", tags: ["spouse"], about: "partner", when: s => s.rel === "dating" && s.age > s.datingSince, p: (s, ctx) => ctx.R.breakup(s.age), apply: (s, ctx) => { const n = s.partner.call; endRelationship(s, ctx); return { text: `You and ${n} broke up.`, mood: -5 }; } },
  {
    id: "proposal", calibrated: true, domain: "love", channel: "good", tags: ["spouse"], about: "partner", when: s => s.rel === "dating" && s.age > s.datingSince && canMarry(s), p: (s, ctx) => ctx.R.proposal(s.age, s.sex, s.year, s.marriages),
    choice: s => ({ prompt: `You and ${s.partner.call} have talked about the future. Get married?`, options: [
      { id: "proposal.yes", label: "Yes", act: "marry", style: "family", weight: 0.85, apply: s2 => { marry(s2); return { text: "You got married.", mood: 9, big: true }; } },
      { id: "proposal.wait", label: "Wait", act: "wait", style: "safe", weight: 0.15 },
    ] }),
  },
  { id: "divorce", domain: "love", channel: "bad", tags: ["spouse"], about: "partner", when: s => s.rel === "married" && yearsMarried(s) >= 1, p: (s, ctx) => ctx.R.divorce(yearsMarried(s), s.year) * (s.guard > 0 ? 0.4 : 1), apply: (s, ctx) => { endRelationship(s, ctx); return { text: "You got divorced.", mood: -12, big: true }; } },
  { id: "widowed", domain: "family", channel: "bad", grave: true, when: s => s.rel === "married" && s.partner, p: (s, ctx) => ctx.R.deathRaw(s.partner.age, s.partner.sex, s.year), apply: s => { s.partner.alive = false; s.exes.push(s.partner); s.partner = null; s.rel = "widowed"; s.since = null; closeSpell(s, "widowed"); return { text: "Your spouse died.", mood: -14, big: true }; } },
  { id: "baby", domain: "family", channel: "good", tags: ["children"], when: s => s.rel === "married" && !sameSexCouple(s) && !s.flags.noMoreKids, p: (s, ctx) => ctx.R.birth(motherAge(s), s.kids.length, s.year, true), apply: (s, ctx) => { const k = newKid(s, ctx); s.kids.push(k); return { text: `${k.call} was born.`, mood: 8, big: true }; } },
  {
    id: "buyHome", calibrated: true, domain: "wealth", channel: "good", tags: ["home"], ages: [22, 70], cooldown: 2, when: (s, ctx) => s.home !== "own" && s.savings >= ctx.R.DOWN_PAYMENT && s.employed, p: (s, ctx) => ctx.R.homeBuy(s.age),
    choice: () => ({ prompt: "You have enough for a down payment. Buy?", options: [
      { id: "buyHome.yes", label: "Buy", act: "buyHome", style: "safe", weight: 0.8, apply: (s2, c) => { ownHome(s2); s2.savings -= c.R.DOWN_PAYMENT; return { text: `You bought a house in ${s2.city || s2.county}.`, mood: 7, big: true }; } },
      { id: "buyHome.rent", label: "Keep renting", act: "wait", style: "risk", weight: 0.2 },
    ] }),
  },
  { id: "move", domain: "move", channel: "change", ages: [18, 80], cooldown: 3, when: s => !s.abroad, p: (s, ctx) => ctx.R.move(s.age, s.year), apply: (s, ctx) => ({ text: `You moved to ${moveTo(s, ctx)}.`, mood: 1 }) },
  { id: "chronic", domain: "health", channel: "bad", ages: [25, 100], when: s => !s.health.chronic, p: (s, ctx) => ctx.R.chronic(s.age, s.sex), apply: (s, ctx) => { s.health.chronic = true; s.health.hr *= ctx.R.CHRONIC_HR; return { text: "Your doctor found high blood pressure.", mood: -3 }; } },
  { id: "checkups", calibrated: true, once: true, ages: [40, 40], p: () => 1, choice: () => ({ prompt: "You turned 40. Regular checkups?", options: [
    { id: "checkups.yes", label: "Every year", act: "seeDoctor", style: "health", weight: 0.55, apply: s => { s.health.checkups = true; return { text: "You started yearly checkups.", mood: 1 }; } },
    { id: "checkups.no", label: "Later", act: "wait", style: "self", weight: 0.45 },
  ] }) },
  { id: "serious", domain: "health", channel: "bad", grave: true, ages: [1, 110], when: s => !s.health.serious, p: (s, ctx) => ctx.R.serious(s.age, s.sex, s.year), apply: (s, ctx) => { const type = ctx.R.seriousType(s.age, s.sex, s.year, ctx.rng); s.health.serious = { type, since: s.age }; return { text: `You were diagnosed with ${type}.`, mood: -10, big: true }; } },
  { id: "recovered", when: s => s.health.serious && s.age - s.health.serious.since >= 5, p: () => 1, apply: s => { s.health.serious = null; return { text: "Five years clear.", mood: 6 }; } },
  { id: "fatherDeath", domain: "family", channel: "bad", grave: true, tags: ["father"], when: s => s.father.alive, p: (s, ctx) => ctx.R.deathRaw(s.father.age, "male", s.year), apply: s => { s.father.alive = false; return { text: "Your dad died.", mood: -10, big: true }; } },
  { id: "motherDeath", domain: "family", channel: "bad", grave: true, tags: ["mother"], when: s => s.mother.alive, p: (s, ctx) => ctx.R.deathRaw(s.mother.age, "female", s.year), apply: s => { s.mother.alive = false; return { text: "Your mom died.", mood: -10, big: true }; } },
];
for (const ev of CORE) { ev.core = true; ev.major = true; }

// A few everyday events: one choice that goes through the general actions, one plain line.
export const EVERYDAY = [
  {
    id: "c_bullied", domain: "family", channel: "bad", ages: [7, 12], cooldown: 3, when: s => s.studying, p: () => 0.05,
    choice: () => ({ prompt: "Some kids at school keep picking on you. What do you do?", options: [
      { id: "c_bullied.teacher", label: "Tell your teacher", act: "seekHelp", style: "social", weight: 0.4 },
      { id: "c_bullied.ignore", label: "Ignore them", act: "avoid", style: "safe", weight: 0.3 },
      { id: "c_bullied.friend", label: "Stick with friends", act: "socialize", style: "social", weight: 0.3 },
    ] }),
  },
  { id: "a_trip", domain: "family", channel: "good", ages: [25, 80], cooldown: 4, p: () => 0.08, apply: (s, ctx) => ({ text: ctx.w(["You {spent a week|took a long weekend} in {trip}.", "A road trip to {trip}, {just because|with the windows down}."]), mood: 3 }) },
];

export const ALL_EVENTS = [...CORE, ...EVERYDAY];
