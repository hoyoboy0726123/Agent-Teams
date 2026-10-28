// Later life, about 60 and up: the first Monday of retirement, Social Security and Medicare, a part-time gig, the RV
// and the winters in Florida or Arizona, downsizing, a 55+ community, the grandkids (what they call you, the
// sleepovers, what you teach them), family reunions, the 50th anniversary, life after a husband or wife dies and
// dating again, old friends and the Christmas card list, the scrapbooks and the memoir, FaceTime and the first
// smartphone, volunteering, faith, the senior center, pickleball, hearing aids, cataracts, a new knee and the car keys.
//
// Every probability here is an assumption (a design value: no statistic counts "you learned FaceTime"), mostly
// 0.03–0.12 a year with once / max / cooldown, so the years after 60 hold a dozen or so of these stories, a handful of
// them choices. The real dates behind the wording: Social Security from 62 (reduced 5/9 % a month for the first 36
// months before full retirement age and 5/12 % after; 8 % a year more for waiting, up to 70; full retirement age by
// birth year in common.js; paper checks ended in 2013; the cost-of-living raises in COLA below); Medicare at 65 (Part D
// from 2006, new cards without the Social Security number from 2018); required withdrawals from retirement accounts
// at 72 for people born in 1950, 73 for 1951–1959 and 75 from 1960 (SECURE 2.0); the lifetime senior pass to the
// national parks ($10 until August 2017, $80 after); 529 college plans from 1996; consumer DNA kits from 2007, with a
// boom around 2017; FaceTime from 2010; grandparents joining Facebook from about 2009; pickleball's boom from about
// 2015; the Red Hat Society from 1998; over-the-counter hearing aids from October 2022. Later than about 2035 the
// wording stays general (a video call, the newest gadget), because nobody knows yet what those years will hold.
//
// Nothing here marries, divorces, has a baby, buys a first home, retires, kills anyone or makes anyone seriously ill:
// those are core.js's. Friends who pass away are acquaintances at the edge of the story, never a person in s.friends,
// and nobody's state changes. A partner's death is core.js `widowed` (it keeps the partner in s.exes with alive =
// false and sets s.rel = "widowed"); this file only tells the years after. The health risk moves through hr() below,
// at most ×0.97 or ×1.03 at a time, with this file's own share kept within ±5 % (s.flags.lHr).
//
// Reads: s.retired, s.last.retire, s.flags.ssDelay and partTimeRetired (core.js retire); s.grandkids and
// s.flags.grandkids (core.js grandchild); s.exes and s.last.widowed (core.js widowed); s.flags.firstLove, bff, talent,
// faith (child.js faithOf), firstCar, served / vet, pet.
// Leaves for others:
//   s.flags.ssClaimed   the age Social Security started    s.flags.ssWaitUntil  the age you chose to wait for
//   s.flags.medicare    "original" | "advantage" | "work" | "help"
//   s.flags.grandName   what the grandkids call you ("Nana", "Pop-Pop")
//   s.flags.snowbird    "Florida" | "Arizona" | "Texas" | "moved"     s.flags.rv  true once you own an RV
//   s.flags.downsized   the age you sold the big house               s.flags.community  "55plus" | "independent" | "ccrc"
//   s.flags.will, memoir, volunteerAs, pickleball, hearingAids, carKeys (the age you gave them up), widowDating,
//   s.flags.partTimeDone (the age the part-time gig ended), s.flags.livesWithKid (that child's name)
import { scene, cap, they, them, their, kidWord, grandWord, bestFriend, makeFriend, fullRetirementAge, snowy, kidsCulture, stateCode, stateName } from "./common.js";
import { faithOf } from "./child.js";
import { moveTo } from "../world.js";

// ---------- helpers ----------
// A plain event: its lines (templates, or a function of s and ctx giving them; empty entries are left out), its mood,
// an optional effect `fx(s, ctx)` run first, and the usual fields.
function A(id, ages, p, lines, { mood = 2, fx = null, ...more } = {}) {
  return {
    id, ages, once: true, ...more, p: typeof p === "function" ? p : () => p,
    apply: (s, ctx) => {
      if (fx) fx(s, ctx);
      const l = typeof lines === "function" ? lines(s, ctx) : lines;
      return { text: ctx.w(Array.isArray(l) ? l.filter(Boolean) : l), mood: typeof mood === "function" ? mood(s) : mood, ...(more.big ? { big: true } : {}) };
    },
  };
}
const usHome = s => !s.abroad;
const married = s => s.rel === "married" && !!s.partner;
const yearsMarried = s => (s.since === null || s.since === undefined ? 0 : s.age - s.since);
const pName = s => (s.partner ? s.partner.call : "your partner");
const spend = (s, x) => { s.savings = Math.max(0, s.savings - x); };
const placeWords = x => stateName(stateCode(x)) || String(x || "a new state");
// The husband or wife who died (core.js widowed keeps them in s.exes with alive = false).
const lateSpouse = s => [...(s.exes || [])].reverse().find(p => p.alive === false) || null;
const lateName = s => { const p = lateSpouse(s); return p ? p.call : s.sex === "female" ? "your husband" : "your wife"; };
const lateHis = s => { const p = lateSpouse(s); return p ? their(p) : s.sex === "female" ? "his" : "her"; };
const lateHim = s => { const p = lateSpouse(s); return p ? them(p) : s.sex === "female" ? "him" : "her"; };
// Years since the partner died (1 when the story does not know), −1 when not widowed.
const widowedFor = s => (s.rel !== "widowed" ? -1 : s.last.widowed === undefined ? 1 : s.age - s.last.widowed);
const adultKids = (s, min = 22) => s.kids.filter(k => k.alive !== false && k.age >= min);
// Grandchildren, as core.js grandchild names them, by their age this year.
const grands = s => (s.grandkids || []).filter(g => g.alive !== false);
const gAge = (s, g) => s.year - g.birthYear;
const grandsIn = (s, a, b) => grands(s).filter(g => gAge(s, g) >= a && gAge(s, g) <= b);
const gWord = g => (g.sex === "male" ? "grandson" : "granddaughter");
// What the grandkids call you.
const gName = s => s.flags.grandName || grandWord(s);
// Retired within the last n years (a retirement written in by the player may have no s.last.retire).
const justRetired = (s, n) => s.retired && s.age - (s.last.retire ?? s.age) <= n;
const retiredOr = (s, age) => s.retired || (!s.employed && s.age >= age);
// The death-risk multiplier, by f (0.97–1.03), with this file's share kept within ±5 %.
function hr(s, f) {
  const before = s.flags.lHr ?? 1, after = Math.max(0.95, Math.min(1.05, before * f));
  s.flags.lHr = after; s.health.hr *= after / before;
}
// An old friend already in the story, or a new one about your age.
function oldFriend(s, ctx, how = "neighbor") {
  const alive = s.friends.filter(f => f.alive !== false);
  if (alive.length) return bestFriend(s) || ctx.rng.pick(alive);
  return makeFriend(s, ctx, how, 0.7);
}
// A video call, by year: FaceTime from 2010; later than 2035 just "a video call".
const videoCall = y => (y < 2010 ? "a phone call" : y < 2020 ? "FaceTime" : y < 2036 ? "FaceTime or Zoom" : "a video call");
const future = s => s.year > 2035;

// ---------- Social Security ----------
const fra = s => fullRetirementAge(s.birthYear);
const fraWords = s => { const f = fra(s), y = Math.floor(f + 1e-9), m = Math.round((f - y) * 12); return m ? `${y} and ${m} months` : String(y); };
// The share of the full benefit when claimed at `age`, in percent.
function ssShare(s, age) {
  const months = Math.round((fra(s) - age) * 12);
  if (months <= 0) return Math.round(100 + Math.max(0, Math.min(70, age) - fra(s)) * 8);
  return Math.round(100 - Math.min(36, months) * 5 / 9 - Math.max(0, months - 36) * 5 / 12);
}
// The age Social Security started: a claim told here, or core.js's retirement at 62 or later (its buttons start the
// benefit, except "wait until 70").
function ssClaimedAt(s) {
  if (s.flags.ssClaimed !== undefined) return s.flags.ssClaimed;
  if (s.retired && !s.flags.ssDelay && s.last.retire !== undefined && s.last.retire >= 62) return s.last.retire;
  return undefined;
}
// The cost-of-living raise each January (SSA).
const COLA = { 2012: 3.6, 2013: 1.7, 2014: 1.5, 2015: 1.7, 2016: 0, 2017: 0.3, 2018: 2, 2019: 2.8, 2020: 1.6, 2021: 1.3, 2022: 5.9, 2023: 8.7, 2024: 3.2, 2025: 2.5 };
// Required withdrawals from a 401(k) or IRA start at 72, 73 or 75 by birth year.
const rmdAge = by => (by <= 1950 ? 72 : by < 1960 ? 73 : 75);

// ---------- the grandkids' history lesson ----------
// Something you lived through, for a grandchild's school project, by your birth year.
function historyYouSaw(s) {
  const y = s.birthYear;
  if (y <= 1957) return ["the moon landing on a black-and-white TV", "the day President Kennedy was shot", "duck-and-cover drills under your school desk"];
  if (y <= 1966) return ["watching the moon landing past your bedtime", "the gas lines of 1979", "the Challenger launch on the TV your teacher wheeled in"];
  if (y <= 1980) return ["the Challenger on the classroom TV", "the morning of September 11", "the first time you heard a modem screech"];
  if (y <= 1995) return ["the morning of September 11", "the crash of 2008", "the spring of 2020, when everything closed"];
  return ["the spring of 2020, when school moved to a laptop", "the first phones that fit in a pocket", "the year everyone wore masks"];
}

export const LATER = [
  // ---------- retirement ----------
  A("l_firstMonday", [55, 90], s => (justRetired(s, 1) ? 0.5 : 0), s => [
    "The first Monday of retirement, you {woke up at six anyway|made a full breakfast just because you could|stood in the kitchen wondering what people do at ten on a Tuesday}, and {by noon you had reorganized the garage.|by Wednesday you had a list of projects longer than your arm.|by Friday you had mostly stopped checking your work email.}",
    "Retired, you learned that every day is Saturday and that Saturday is somehow still busy. {The lawn has never looked better.|You took a nap at two in the afternoon and felt like you were getting away with something.|You finally read the books stacked on the nightstand.}",
    married(s) ? `Retired, you and ${pName(s)} found out you had never spent this many weekday hours in the same house. {There were negotiations about the thermostat.|You took over the grocery shopping and were told you were doing it wrong.|You started taking a long walk together every morning.}` : null,
    "Your first week of retirement, {you set the alarm out of habit and turned it off with great ceremony.|a coworker texted a question and you answered it, then felt silly.|you drove past the old parking lot and kept going.}",
  ], { mood: 3, domain: "career", channel: "change", when: s => s.retired }),
  {
    id: "l_retiredDays", once: true, domain: "career", channel: "change", ages: [55, 85], when: s => s.retired && (s.last.retire === undefined || (s.age - s.last.retire >= 1 && s.age - s.last.retire <= 4)), p: () => 0.13,
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        "A year into retirement, the days have started to blur together.",
        married(s) ? `${pName(s)} says you have rearranged the spice rack three times this month.` : null,
        "Your old coworkers still text you the office gossip, and you miss being needed more than you expected.",
        "For the first time in forty years, the calendar on the fridge is empty.",
      ]);
      return {
        prompt: `${lead} How do you fill your days?`,
        options: [
          { id: "l_retiredDays.volunteer", label: ctx.rng.pick(["Volunteer somewhere", "Find somewhere that needs help"]), hint: "be needed again", act: "volunteer", style: "social", weight: 0.22, apply: (s2, c) => ({ text: c.w("With the days in retirement blurring together, you started volunteering {at the food bank on Tuesdays|at the hospital information desk|with a literacy program at the library}, {and within a month they gave you a key.|and the regulars started asking for you by name.}"), mood: 4 }) },
          { id: "l_retiredDays.parttime", label: "Pick up a part-time job", hint: "a little structure, a little money", act: "sideJob", style: "safe", weight: 0.15, apply: (s2, c) => { s2.flags.partTimeRetired = true; s2.savings += 0.05; return { text: c.w("With the days in retirement blurring together, you took a part-time job {at the garden center|as a school crossing guard|doing tax returns every spring|as a park ranger's helper in the summer}, {and liked it far more than you expected.|three mornings a week, no meetings.}"), mood: 3 }; } },
          { id: "l_retiredDays.learn", label: "Take a class", hint: "the community college lets seniors audit", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w("With the days in retirement blurring together, you signed up for {a history class at the community college|a watercolor class at the senior center|a course on the Civil War, sitting in the front row}, {and did all the reading.|and the professor started calling on you to keep the young ones honest.}"), mood: 3 }) },
          { id: "l_retiredDays.hobby", label: "Finally build the workshop", hint: "the project you always put off", act: "hobby", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w("With the days in retirement blurring together, you finally set up {the woodshop in the garage and built a rocking chair for every grandkid you had and some you didn't yet.|a sewing room and made quilts for half the family.|raised beds in the yard and grew enough tomatoes for the whole street.}"), mood: 4 }) },
          { id: "l_retiredDays.travel", label: "Travel while you can", hint: "the savings can take it", act: "travel", style: "risk", weight: 0.13, apply: (s2, c) => { spend(s2, 0.15); return { text: c.w("With the days in retirement blurring together, you booked {a trip to {trip}|a bus tour of New England in the fall|a train across the country}, {and came home with three hundred photos.|and started planning the next one on the flight home.}"), mood: 5 }; } },
          { id: "l_retiredDays.rest", label: "Do nothing for a while", hint: "you earned the porch", act: "rest", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w("With the days in retirement blurring together, you decided that was fine, and spent a long season {on the porch with the crossword.|reading every mystery at the library, in order.|sleeping late and walking the dog twice a day.}"), mood: 2 }) },
        ],
      };
    },
  },
  {
    // Claiming Social Security, for anyone 62–69 not working who has not claimed: early retirees, people who stayed
    // home, retirements written in by the player.
    id: "l_socialSecurity", once: true, domain: "wealth", channel: "change", ages: [62, 69],
    when: s => !s.employed && ssClaimedAt(s) === undefined && !s.flags.ssDelay && (s.flags.ssWaitUntil === undefined || s.age >= s.flags.ssWaitUntil),
    p: s => (s.age >= fra(s) - 0.01 ? 0.9 : s.age === 62 ? 0.5 : 0.25),
    choice: (s, ctx) => {
      const share = ssShare(s, s.age), full = s.age >= fra(s) - 0.01, day = ctx.rng.pick(["second", "third", "fourth"]);
      const lead = scene(ctx, [
        full ? `You have reached full retirement age, ${fraWords(s)}, and Social Security will pay you all of it.` : `You are ${s.age}. You could start Social Security now, at about ${share} percent of the full amount, or wait.`,
        `The Social Security statement says ${share} percent of your full benefit if you start now, and a lot more if you wait until 70.`,
        married(s) ? `You and ${pName(s)} spread the Social Security statements across the kitchen table and argued about when to claim.` : null,
        "Your brother-in-law has a strong opinion about when to claim Social Security, and so does everyone at church.",
      ]);
      const claim = (s2, text) => { s2.flags.ssClaimed = s2.age; return { text, mood: 2 }; };
      return {
        prompt: `${lead} When do you claim?`,
        options: [
          { id: "l_socialSecurity.now", label: "Claim now", hint: full ? "the full amount" : `${share} percent, starting now`, act: "retire", style: "self", weight: 0.4, apply: (s2, c) => claim(s2, c.w(`You filed for Social Security at ${s2.age}, at ${full ? "the full amount" : `about ${share} percent of the full amount`}, and the first deposit landed on the ${day} Wednesday of the month, {right on schedule.|and you checked the bank app twice.|which you celebrated with pie.}`)) },
          { id: "l_socialSecurity.full", label: `Wait for full retirement age, ${fraWords(s)}`, hint: "live on savings a few years", act: "save", style: "safe", weight: 0.22, when: s2 => s2.age < fra(s2) - 0.01, apply: s2 => { s2.flags.ssWaitUntil = Math.ceil(fra(s2)); spend(s2, 0.2); return { text: `You decided to wait to claim Social Security until your full retirement age, ${fraWords(s2)}, and lived on savings in the meantime.`, mood: 0 }; } },
          { id: "l_socialSecurity.seventy", label: "Hold out until 70", hint: "the biggest check, if you're patient", act: "save", style: "safe", weight: 0.1, apply: s2 => { s2.flags.ssDelay = true; spend(s2, 0.3); return { text: `You decided to wait until 70 to claim Social Security, for a check about ${ssShare(s2, 70)} percent of the full amount, and tightened the budget to get there.`, mood: 0 }; } },
          { id: "l_socialSecurity.split", label: `Split it: one of you claims now`, hint: "the bigger earner waits", act: "negotiate", style: "family", weight: 0.13, when: married, apply: (s2, c) => claim(s2, c.w(`You and ${pName(s2)} split the Social Security plan: you claimed at ${s2.age}, and the bigger check waits to grow. {A financial planner on the radio would have approved.|It took four spreadsheets.}`)) },
          { id: "l_socialSecurity.office", label: "Ask at the Social Security office", hint: "someone who knows", act: "seekHelp", style: "social", weight: 0.15, apply: (s2, c) => { if (c.rng() < 0.5 || full) return claim(s2, c.w(`The woman at the Social Security office, who had clearly explained this nine thousand times, walked you through it, and you filed for Social Security at ${s2.age} that same afternoon.`)); s2.flags.ssWaitUntil = Math.ceil(fra(s2)); return { text: `The man at the Social Security office drew you a little chart on the back of a form, and you decided to wait until ${fraWords(s2)} to claim.`, mood: 1 }; } },
        ],
      };
    },
  },
  A("l_ssFull", [63, 70], 1, s => [
    `You reached your full retirement age, ${fraWords(s)}, and filed for Social Security at last. {The first deposit was worth the wait.|You took the whole family out for pancakes on the first deposit.|You felt like you had won a long, slow game.}`,
    `At ${fraWords(s)} you started your full Social Security benefit, {and the budget finally relaxed.|and told anyone who would listen that patience pays.}`,
    `The waiting was over: at ${fraWords(s)}, your full Social Security check started, {and you moved the savings back where it belongs.|and you bought the good coffee again.}`,
  ], { mood: 3, when: s => s.flags.ssWaitUntil !== undefined && s.age >= s.flags.ssWaitUntil && s.flags.ssClaimed === undefined, fx: s => { s.flags.ssClaimed = s.age; } }),
  A("l_ssAt70", [70, 72], 1, s => [
    `You turned 70 and filed for Social Security. Waiting had made each check about ${ssShare(s, 70)} percent of the full amount, {and you treated yourself to a steak dinner with the first one.|and you felt, briefly, like a financial genius.|which you mentioned at every family dinner for a year.}`,
    `At 70 you finally claimed Social Security, ${s.employed ? "still working, since there is no reason to wait any longer," : "after years of living lean,"} and the check came in about ${ssShare(s, 70) - 100} percent bigger than at full retirement age.`,
    `Seventy, and your Social Security started at its biggest. {You framed the first statement as a joke.|The budget let out a long breath.|You called your sister to brag a little.}`,
  ], { mood: 3, when: s => ssClaimedAt(s) === undefined && (s.flags.ssDelay || s.employed), fx: s => { s.flags.ssClaimed = s.age; } }),
  A("l_ssFirstCheck", [62, 81], 0.6, [
    "Your first Social Security deposit arrived {on the second Wednesday of the month,|right on schedule,} {and you looked at it the way you once looked at your first paycheck.|and you realized you had been paying into it since your first summer job.}",
    "The first Social Security deposit hit your account, {and you set aside a little of it for the grandkids.|and you did the math on how many years of paychecks it took to earn it.|and you finally believed you were retired.}",
    "Social Security started paying {on a Wednesday, which felt like a strange day for a payday.|and for the first time in decades, money came in without you going anywhere.}",
  ], { mood: 2, domain: "wealth", channel: "good", when: s => s.flags.ssClaimed === undefined && ssClaimedAt(s) !== undefined && s.age - ssClaimedAt(s) <= 1, fx: s => { s.flags.ssClaimed = ssClaimedAt(s); } }),
  {
    id: "l_cola", domain: "wealth", channel: "change", ages: [63, 105], cooldown: 5, max: 3, when: s => ssClaimedAt(s) !== undefined && usHome(s), p: () => 0.026,
    apply: (s, ctx) => {
      const c = COLA[s.year];
      if (c === 0) return { text: "This January, Social Security gave no cost-of-living raise at all, and the price of eggs did not get the memo.", mood: -1 };
      if (c >= 5) return { text: ctx.w(`Social Security's cost-of-living raise came in at ${c} percent this year, the biggest in decades, {and it all went to groceries anyway.|and you still winced at the gas pump.|which tells you everything about the price of groceries.}`), mood: 1 };
      if (c !== undefined) return { text: ctx.w(`The Social Security raise this January was ${c} percent, {and the Medicare premium went up about the same.|enough for a few more tanks of gas.|and you read the letter twice to be sure.}`), mood: 0 };
      return { text: ctx.w(["The yearly Social Security letter arrived with a small raise, {and the Medicare premium ate half of it.|enough for one more dinner out a month.}", "Your Social Security went up a little this January, {and you set it aside for the property taxes.|and the grocery store raised its prices the same week.|which you spent on birdseed, mostly.}", "This year's cost-of-living raise was modest, {and you kept your coupons.|and you said so loudly at the senior center.}"]), mood: 0 };
    },
  },
  {
    id: "l_medicare", once: true, ages: [65, 65], when: usHome, p: () => 1,
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        "You turn 65 this year, and your mailbox is suddenly full of Medicare plan brochures.",
        "Your 65th birthday is coming, and the TV ads telling you to call now about your Medicare benefits have started.",
        s.year >= 2018 ? "Your red, white and blue Medicare card arrived, with a number on it that is not your Social Security number for once." : "Your red, white and blue Medicare card arrived in the mail.",
        "Medicare starts at 65, and the website has a lot of letters: Parts A, B, C and D.",
      ]);
      const set = (how, text, mood = 1) => (s2, c) => { s2.flags.medicare = how; return { text: c.w(text), mood }; };
      const kid = adultKids(s, 25)[0];
      return {
        prompt: `${lead} How do you set up your coverage?`,
        options: [
          { id: "l_medicare.original", label: "Original Medicare and a Medigap plan", hint: "any doctor, a monthly premium", act: "insurance", style: "safe", weight: 0.34, apply: (s2, c) => { spend(s2, 0.03); return set("original", "At 65 you signed up for Original Medicare, a supplement plan and a drug plan, {and the paperwork filled a whole binder.|and went to the doctor you had seen for twenty years without a single referral.}")(s2, c); } },
          { id: "l_medicare.advantage", label: "A Medicare Advantage plan", hint: "low premium, a network, extras", act: "insurance", style: "risk", weight: 0.3, apply: set("advantage", "At 65 you picked a Medicare Advantage plan, {mostly for the free gym membership, which you actually used.|which came with dental and a doctor network you had to learn.|and spent one afternoon making sure your doctors were in it.}") },
          { id: "l_medicare.work", label: "Keep the plan from work for now", hint: "Part A only, for now", act: "insurance", style: "safe", weight: 0.11, when: s2 => s2.employed, apply: set("work", "You were still working at 65, so you signed up for Medicare Part A only and kept your job's health plan, {with a note on the calendar for later.|which HR assured you was fine.}", 0) },
          { id: "l_medicare.help", label: "Sit down with a free Medicare counselor", hint: "the state program, no sales pitch", act: "seekHelp", style: "social", weight: 0.15, apply: set("help", "At 65 you sat down with a volunteer Medicare counselor at the library, {who untangled the whole alphabet in an hour.|who had a highlighter for every part.} You left with a plan that fit and a new respect for volunteers.", 2) },
          { id: "l_medicare.kid", label: kid ? `Have ${kid.call} help with the website` : "Have one of the kids help with the website", hint: "they're good with this stuff", act: "seekHelp", style: "family", weight: 0.1, when: s2 => adultKids(s2, 25).length > 0, apply: set("help", `At 65 ${kid ? kid.call : "your oldest"} sat with you at the computer and signed you up for Medicare, {and only sighed twice.|and you made ${kid ? them(kid) : "them"} lunch for the trouble.}`, 2) },
        ],
      };
    },
  },
  {
    id: "l_partTime", domain: "career", channel: "good", ages: [56, 85], cooldown: 4, max: 2, when: s => s.retired && s.flags.partTimeRetired && s.flags.partTimeDone === undefined, p: () => 0.091,
    apply: (s, ctx) => { s.savings += 0.04; return { text: ctx.w(["Your part-time job {at the hardware store|at the garden center|at the golf course} {is the best job you ever had, mostly because you can leave at noon.|has made you the person everyone in town asks about paint colors.|pays in a small check and a lot of conversation.}", "Three mornings a week at your part-time job, {you trained a nineteen-year-old who called you “boss” as a joke and then not as a joke.|you knew every regular's name and most of their dogs.}", "{Every tax season|Every summer|Every holiday rush} you went back to your part-time job, {and the place ran better with you there.|and you liked being needed for exactly that long.}"]), mood: 3 }; },
  },
  A("l_partTimeEnd", [66, 90], 0.078, [
    "You hung up the part-time apron for good, {and the staff threw you a party with a sheet cake.|and went in the next week anyway, as a customer, to check on things.|and slept in on a Tuesday without guilt.}",
    "You gave your notice at the part-time job, {and the young manager hugged you.|and they asked you to come back every holiday rush, which you did once.}",
    "After a few good years, you retired from your retirement job too. {Your name stayed on the schedule board for a month.|You kept the name tag.}",
  ], { mood: 2, when: s => s.retired && s.flags.partTimeRetired && s.flags.partTimeDone === undefined && s.age >= 68, fx: s => { s.flags.partTimeDone = s.age; } }),
  {
    id: "l_unretire", once: true, domain: "career", channel: "good", ages: [62, 76], when: s => s.retired && !s.flags.partTimeRetired, p: () => 0.026,
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        "Your old boss called: they are short-handed and want you back as a consultant, a few days a month.",
        "A neighbor who runs a small shop asks if you could help out on weekends.",
        "The tax-prep office downtown is hiring seasonal help, and the sign in the window has your name on it, practically.",
        s.year >= 2012 ? "A former coworker started a company and needs someone who remembers how things used to be done." : null,
      ]);
      return {
        prompt: `${lead} Do you go back to work?`,
        options: [
          { id: "l_unretire.yes", label: "Say yes, part-time", hint: "a little money, a reason to dress up", act: "sideJob", style: "risk", weight: 0.3, apply: (s2, c) => { s2.flags.partTimeRetired = true; s2.savings += 0.15; return { text: c.w("Retired but called back, you said yes to part-time work, {and found you still liked being good at something.|and spent the first check on a new set of golf clubs.|and loved leaving at three while everyone else stayed.}"), mood: 3 }; } },
          { id: "l_unretire.terms", label: "Only on your terms", hint: "Tuesdays and Thursdays, no meetings", act: "negotiate", style: "self", weight: 0.15, apply: (s2, c) => { s2.flags.partTimeRetired = true; s2.savings += 0.1; return { text: c.w("Retired but called back, you agreed to part-time work on your own terms: two days a week, no meetings, {and they said yes to everything.|and a parking spot by the door.}"), mood: 4 }; } },
          { id: "l_unretire.volunteer", label: "Help for free instead", hint: "no taxes, no boss", act: "volunteer", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w("Retired but called back, you turned down the paycheck and offered to help for free {now and then.|whenever they were really stuck.} Everyone was happier that way."), mood: 2 }) },
          { id: "l_unretire.no", label: "No thanks", hint: "retired means retired", act: "rest", style: "health", weight: 0.3, apply: (s2, c) => ({ text: c.w("Retired but called back, you said no thanks, {and went fishing that afternoon.|and felt a little flattered all week.|and recommended a younger friend instead.}"), mood: 1 }) },
          { id: "l_unretire.family", label: "Ask the family first", hint: "it's their time too", act: "talk", style: "family", weight: 0.1, apply: (s2, c) => { const yes = c.rng() < 0.5; if (yes) s2.flags.partTimeRetired = true; return { text: yes ? "Retired but called back, you asked the family first, and they said go, you were getting restless. You went back part-time." : `Retired but called back, you asked the family first, and ${married(s2) ? pName(s2) : "your kids"} said you had promised them these years. You stayed retired.`, mood: 1 }; } },
        ],
      };
    },
  },
  {
    id: "l_rv", once: true, domain: "move", channel: "change", ages: [60, 80], when: s => s.retired && usHome(s) && s.savings >= 0.3 && s.year >= 1970, p: () => 0.026,
    choice: (s, ctx) => {
      const name = ctx.rng.pick(["the Land Yacht", "Big Bertha", "the Rolling Stone", "Betsy", "the Mothership"]);
      const route = ctx.rng.pick(["Route 66 end to end", "the Blue Ridge Parkway", "every national park in Utah", "the Pacific Coast Highway", "the Alaska Highway"]);
      const lead = scene(ctx, [
        married(s) ? `${pName(s)} keeps leaving RV brochures on the kitchen table.` : "The RV dealer on the highway has a used Winnebago with a sign that says “Make an offer.”",
        "Your neighbors just got back from four months in an Airstream with three hundred photos of Utah.",
        "You finally have the time, and the country is big.",
      ]);
      return {
        prompt: `${lead} Do you hit the road?`,
        options: [
          { id: "l_rv.buy", label: "Buy a used RV", hint: "home is where you park it", act: "travel", style: "risk", weight: 0.25, apply: (s2, c) => { s2.flags.rv = true; spend(s2, 0.4); return { text: c.w(`You bought a used RV, named it ${name}, and drove ${route}, {learning the hard way how to back into a campsite.|waving at every other RV on the road.|with a map on the wall you colored in state by state.}`), mood: 6, big: true }; } },
          { id: "l_rv.rent", label: "Rent one for a summer", hint: "try before you buy", act: "travel", style: "safe", weight: 0.25, apply: (s2, c) => { spend(s2, 0.1); return { text: c.w(`You rented an RV for one summer and drove ${route}. {It was glorious, and you were glad to give it back.|You learned that a thirty-foot vehicle does not fit in a Dairy Queen drive-through.}`), mood: 5 }; } },
          { id: "l_rv.camper", label: "Get a little teardrop camper", hint: "small, cheap, cozy", act: "travel", style: "self", weight: 0.15, apply: (s2, c) => { s2.flags.rv = true; spend(s2, 0.15); return { text: c.w(`You bought a little teardrop camper, hitched it to the car and drove ${route}, {cooking eggs on the tailgate every morning.|stopping at every roadside pie stand you passed.}`), mood: 5 }; } },
          { id: "l_rv.fly", label: "Fly and stay in hotels", hint: "someone else makes the bed", act: "travel", style: "safe", weight: 0.15, apply: (s2, c) => { spend(s2, 0.1); return { text: c.w("You skipped the RV and flew to {the Grand Canyon|Yellowstone|Glacier National Park}, staying in lodges with real beds and somebody else doing the dishes. No regrets."), mood: 4 }; } },
          { id: "l_rv.home", label: "Stay home", hint: "the backyard is a national park too", act: "wait", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w("You decided against the RV and stayed home, {where the grandkids could find you.|where the bed is the right size.|and put the money toward the deck you had always wanted.}"), mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "l_rvLife", domain: "move", channel: "good", ages: [60, 88], cooldown: 3, max: 3, when: s => s.flags.rv && usHome(s), p: () => 0.163,
    apply: (s, ctx) => ({ text: ctx.w(["At a campground in {Montana|New Mexico|Tennessee|Maine}, {the other RVers threw a potluck and you brought the deviled eggs.|you met a couple from Ohio who became friends for life.|a ranger told you about a lake nobody else knew.}", "On the road again in the RV, {you crossed your thirtieth state line and honked about it.|you watched a thunderstorm roll across the plains from the folding chairs.|you found the best diner in America, by your count, in a town of four hundred people.}", "The RV {broke down outside Amarillo, and a mechanic named Earl fixed it and refused extra money.|got a new set of state stickers on the back window.|spent the winter in the driveway, and you visited it like a horse in a stable.}"]), mood: 4 }),
  },
  {
    id: "l_snowbird", once: true, domain: "move", channel: "change", ages: [62, 85], when: s => s.retired && usHome(s) && snowy(s) && !["Florida", "Arizona", "Texas", "FL", "AZ", "TX"].includes(s.county), p: () => 0.039,
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        "You shoveled the driveway three times this week, and your back has filed a formal complaint.",
        "Half your friends from church now spend January to March in Florida, and they send pictures of their tans.",
        married(s) ? `${pName(s)} looked at the gray sky in February and said, “We could be somewhere warm, you know.”` : "In February the sky has been gray for six weeks straight.",
      ]);
      const winter = (place, text) => (s2, c) => { s2.flags.snowbird = place; spend(s2, 0.15); return { text: c.w(text), mood: 5 }; };
      return {
        prompt: `${lead} What do you do about winter?`,
        options: [
          { id: "l_snowbird.florida", label: "Winter in Florida", hint: "early-bird dinners and shuffleboard", act: "travel", style: "social", weight: 0.25, apply: winter("Florida", "You became a snowbird and spent the winters in {a rented condo in Fort Myers|a mobile home park in Sarasota|a little place near Daytona}, {and learned the fine art of the 4:30 dinner special.|where everyone you met was from somewhere colder.|going to spring training games in March.}") },
          { id: "l_snowbird.arizona", label: "Winter in Arizona", hint: "dry heat and sunsets", act: "travel", style: "self", weight: 0.15, apply: winter("Arizona", "You became a snowbird and spent the winters in {Mesa|Tucson|Yuma}, {where it was seventy-five in January and you told everyone back home.|hiking in the desert in the morning and playing cards at night.|with a lemon tree in the yard, which felt like cheating.}") },
          { id: "l_snowbird.texas", label: "Go down to the Rio Grande Valley", hint: "the Winter Texans", act: "travel", style: "social", weight: 0.08, apply: winter("Texas", "You joined the Winter Texans and spent the cold months in the Rio Grande Valley, {at an RV park with a dance every Saturday.|eating the best tacos of your life and birdwatching at dawn.}") },
          { id: "l_snowbird.move", label: "Move south for good", hint: "sell the snow shovel", act: "moveHome", style: "risk", weight: 0.12, apply: (s2, c) => { const to = placeWords(moveTo(s2, c, [["Florida", 4], ["Arizona", 2], ["South Carolina", 1], ["North Carolina", 1], ["Texas", 1]])); s2.flags.snowbird = "moved"; return { text: c.w(`You moved to ${to} for good, {and gave your snow shovel to the neighbor in a small ceremony.|and the first winter there, you called home every snowstorm just to gloat.|and found out what humidity is.}`), mood: 4, big: true }; } },
          { id: "l_snowbird.stay", label: "Stay put and shovel", hint: "winter is home", act: "wait", style: "family", weight: 0.4, apply: (s2, c) => ({ text: c.w("You thought about wintering somewhere warm and stayed home. {You like the first snow too much.|The grandkids sled down your hill.|You hired the neighbor kid to shovel, which solved most of it.}"), mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "l_snowbirdLife", domain: "move", channel: "good", ages: [62, 90], cooldown: 3, max: 3, when: s => ["Florida", "Arizona", "Texas"].includes(s.flags.snowbird), p: () => 0.163,
    apply: (s, ctx) => {
      const w = s.flags.snowbird;
      return { text: ctx.w([`Another winter in ${w}: {the condo association had a new feud about parking spaces.|you drove a golf cart to the grocery store.|your tan lines lasted until May.}`, `In ${w} for the winter, {you saw a spring training game from the lawn seats.|you joined a card group that took gin rummy very seriously.|you went to bed early and felt great about it.}`, `Driving back north from ${w} in April, {you stopped at the same motel as every year.|you got a speeding ticket in Georgia and laughed about it all the way home.|the car was full of oranges for the neighbors.}`]), mood: 3 };
    },
  },
  {
    id: "l_bucketList", once: true, domain: "move", channel: "good", ages: [62, 82], when: s => retiredOr(s, 66) && s.savings >= 0.2, p: () => 0.033,
    choice: (s, ctx) => {
      const lead = scene(ctx, ["You wrote a bucket list at the kitchen table, and one line is circled twice.", "A friend's travel slideshow at church made up your mind: you want one big trip while your knees still work.", married(s) ? `For your anniversary, ${pName(s)} handed you a stack of travel brochures and a pen.` : null]);
      const go = (text, cost = 0.2) => (s2, c) => { spend(s2, cost); return { text: c.w(text), mood: 6, big: true }; };
      return {
        prompt: `${lead} Where do you go?`,
        options: [
          { id: "l_bucketList.alaska", label: "An Alaska cruise", hint: "glaciers and buffets", act: "travel", style: "safe", weight: 0.25, apply: go("You took the Alaska cruise from your bucket list, {and a whale breached right by the ship while you were holding your coffee.|watched a glacier calve and forgot to take the picture.|ate at the midnight buffet twice and regretted nothing.}") },
          { id: "l_bucketList.europe", label: "A river cruise in Europe", hint: "a castle every morning", act: "travel", style: "learn", weight: 0.2, apply: go("You crossed off a river cruise in Europe from your bucket list, {past castles on the Rhine,|through Vienna and Budapest,} {and bought far too many Christmas ornaments.|and learned to say thank you in four languages.}", 0.3) },
          { id: "l_bucketList.roots", label: "Visit the old country", hint: "where the family came from", act: "travel", style: "family", weight: 0.15, apply: go("You visited the country your family came from, {found the village church where your great-grandparents married,|ate at a table with cousins who shared your nose,} {and cried a little at the airport.|and came home with a box of photographs.}", 0.3) },
          { id: "l_bucketList.parks", label: "The national parks, one by one", hint: "the senior pass pays off", act: "travel", style: "health", weight: 0.2, apply: go("You set out to see the national parks on your bucket list, {Yellowstone, Yosemite, the Everglades,|Arches, Zion, the Smokies,} {collecting a stamp at every ranger station.|and walked every trail your knees allowed.}", 0.15) },
          { id: "l_bucketList.family", label: "Take the whole family somewhere", hint: "memories over souvenirs", act: "travel", style: "family", weight: 0.2, when: s2 => s2.kids.length > 0, apply: go("You took the whole family on one big trip to {trip}, {and paid for everyone, which you had dreamed of doing for years.|in matching T-shirts, over the grandkids' protests.} Nobody will forget it.", 0.4) },
        ],
      };
    },
  },
  A("l_parksPass", [62, 90], 0.013, s => {
    const price = s.year <= 2017 ? "ten dollars" : "eighty dollars";
    return [
      `You bought the lifetime senior pass to the national parks for ${price}, {and decided it was the best deal in America.|and kept it in your wallet next to the grandkids' photos.|and used it at a park the same afternoon.}`,
      `At the ranger station you handed over ${price} for a lifetime senior parks pass, {and the ranger said, “Welcome to the best club in the country.”|and planned three trips on the drive home.}`,
      `With your lifetime senior pass (${price}, forever), {you started visiting a national park every year.|you waved through the entrance gate like a regular.}`,
    ];
  }, { mood: 2, when: usHome }),
  A("l_rmd", [72, 75], s => (s.age === rmdAge(s.birthYear) ? 0.7 : 0), [
    "The IRS says you have to start taking money out of your retirement account this year, {and you were oddly offended at being told to spend.|so you took the first required withdrawal and put some in the grandkids' college funds.|and your accountant said, “Congratulations, you saved enough to be told to spend it.”}",
    "Your first required withdrawal from the 401(k) came this year, {and you moved it straight into savings out of habit.|and you finally fixed the roof with it.}",
    "A letter explained the required minimum distribution from your IRA, {and you read it three times before calling your son.|and you treated it like a bill from your younger self.|and you gave a chunk of it to the church.}",
  ], { mood: 0, when: s => s.savings >= 0.5 && usHome(s) }),

  // ---------- home ----------
  {
    id: "l_downsize", once: true, domain: "move", channel: "change", tags: ["home"], ages: [63, 88], when: s => s.home === "own" && usHome(s) && !s.flags.community,
    p: s => 0.03 + (s.rel === "widowed" ? 0.03 : 0) + (s.kids.length && s.kids.every(k => k.age >= 25) ? 0.01 : 0),
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        `The house has more bedrooms than people, and the stairs get a little steeper every year.`,
        s.rel === "widowed" ? `Since ${lateName(s)} died, the house has felt far too big.` : null,
        "A realtor left a card in your door saying homes on your street are selling for crazy money.",
        s.kids.length ? "The kids' old rooms are full of boxes nobody has opened since the nineties." : "The gutters, the roof and the lawn have become a full-time job.",
      ]);
      return {
        prompt: `${lead} Do you stay or downsize?`,
        options: [
          { id: "l_downsize.condo", label: "Sell and buy something smaller", hint: "one floor, less to clean", act: "moveHome", style: "safe", weight: 0.25, apply: (s2, c) => { s2.flags.downsized = s2.age; s2.savings += 0.6; return { text: c.w("You sold the big house and moved into {a one-story ranch across town|a condo with an elevator|a little cottage with a garden just big enough}, {and gave away forty years of stuff one carload at a time.|and the first night there, you slept better than you had in years.|and the kids took one last walk through their old rooms.}"), mood: 2, big: true }; } },
          { id: "l_downsize.55", label: "Move to a 55-plus community", hint: "a clubhouse and a pool", act: "moveHome", style: "social", weight: 0.17, apply: (s2, c) => { s2.flags.downsized = s2.age; s2.flags.community = "55plus"; s2.savings += 0.3; return { text: c.w("You sold the house and moved into a 55-plus community with {a pool, a clubhouse and a calendar so full you needed a planner.|golf carts in every driveway and a book club every Tuesday.|neighbors who knocked the day you moved in with a casserole.}"), mood: 4, big: true }; } },
          { id: "l_downsize.stay", label: "Stay and fix it up for the long haul", hint: "grab bars and a stair lift", act: "wait", style: "family", weight: 0.35, apply: (s2, c) => { spend(s2, 0.1); return { text: c.w("You decided to stay in the house and {added grab bars, a walk-in shower and better lights.|moved your bedroom to the first floor.|put in a stair lift the grandkids ride for fun.} This is home."), mood: 1 }; } },
          { id: "l_downsize.rent", label: "Sell and rent near the kids", hint: "no more roof repairs, ever", act: "moveHome", style: "self", weight: 0.1, when: s2 => adultKids(s2).length > 0, apply: (s2, c) => { s2.flags.downsized = s2.age; s2.home = "rent"; s2.savings += 1; return { text: c.w("You sold the house and rented an apartment near the kids, {and when the dishwasher broke you called the landlord and went back to your crossword.|ten minutes from the grandkids' school.}"), mood: 3, big: true }; } },
          { id: "l_downsize.room", label: "Rent out a room", hint: "company and a little income", act: "sideJob", style: "risk", weight: 0.13, apply: (s2, c) => { s2.savings += 0.1; return { text: c.w("You stayed in the house and rented the spare room to {a nursing student|a young teacher|a grad student from overseas}, {who fixed your Wi-Fi and ate your leftovers.|who became like family.}"), mood: 2 }; } },
        ],
      };
    },
  },
  {
    id: "l_retirementCommunity", once: true, domain: "move", channel: "change", tags: ["home"], ages: [76, 100], when: s => usHome(s) && s.flags.community !== "ccrc" && s.flags.community !== "independent", p: () => 0.033,
    choice: (s, ctx) => {
      const kid = adultKids(s, 30)[0];
      const lead = scene(ctx, [
        "The doctor, the kids and your own knees agree: living alone is getting harder.",
        kid ? `${kid.call} brought over brochures for a retirement community and said, “Just look.”` : "A friend from church moved into a retirement community and keeps inviting you to lunch there.",
        "The winter was long, the driveway was icy, and you did not leave the house for nine days.",
      ]);
      return {
        prompt: `${lead} Where do you want to live?`,
        options: [
          { id: "l_retirementCommunity.independent", label: "Independent living", hint: "your own apartment, meals downstairs", act: "hireCare", style: "social", weight: 0.25, apply: (s2, c) => { s2.flags.community = "independent"; s2.home = "rent"; spend(s2, 0.3); return { text: c.w("You moved into an independent living community, {with a one-bedroom apartment and dinner in the dining room at five.|where a van took everyone to the grocery store on Thursdays.} {Within a month you were running the trivia night.|You complained about the food and went to every meal.}"), mood: 2, big: true }; } },
          { id: "l_retirementCommunity.ccrc", label: "A community with care if you need it", hint: "pay once, stay for good", act: "hireCare", style: "safe", weight: 0.15, apply: (s2, c) => { s2.flags.community = "ccrc"; s2.home = "rent"; spend(s2, 0.8); return { text: c.w("You moved into a continuing care community, {so whatever came next, nobody would have to scramble.|with a garden plot, a library and nurses down the hall.} {The kids slept better.|It cost a lot, and it bought a lot of peace.}"), mood: 2, big: true }; } },
          { id: "l_retirementCommunity.kid", label: kid ? `Move in with ${kid.call}` : "Move in with family", hint: "a room of your own, family down the hall", act: "care", style: "family", weight: 0.2, when: s2 => adultKids(s2, 30).length > 0, apply: (s2, c) => { const k = adultKids(s2, 30)[0]; s2.flags.livesWithKid = k.call; return { text: c.w(`You moved in with ${k.call}, into {the room over the garage|a little apartment they built out back|the old guest room}, {and the grandkids came to you for homework help.|and you took over the cooking, to everyone's relief.|and there were adjustments, and a lot of good dinners.}`), mood: 3, big: true }; } },
          { id: "l_retirementCommunity.help", label: "Stay home, with help", hint: "an aide a few days a week", act: "hireCare", style: "safe", weight: 0.25, apply: (s2, c) => { spend(s2, 0.25); return { text: c.w("You stayed in your own home and hired {an aide who came three days a week|a woman named Rosa who came mornings and became a friend}, {and a neighbor checked on you every evening.|and you kept your garden going.}"), mood: 1 }; } },
          { id: "l_retirementCommunity.stay", label: "Stay home, on your own", hint: "you'll manage", act: "insist", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w("You told everyone you were staying in your own home, thank you, {and wore the emergency button around your neck to keep the peace.|and called your daughter every morning so she would stop worrying.|and you managed, with a lot of help from the neighbors.}"), mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "l_communityLife", domain: "family", channel: "good", ages: [60, 105], cooldown: 3, max: 3, when: s => !!s.flags.community, p: () => 0.163,
    apply: (s, ctx) => ({ text: ctx.w(["At the community, {the dining room has assigned seats, and the politics would shame Congress.|the activities director signed you up for everything, and you went to most of it.|you won the Tuesday bingo three weeks running and are now under suspicion.}", "Your neighbor down the hall {turned 99 and still beats everyone at bridge.|organized a happy hour at four, and you went every day.|knows everybody's business, including yours, before you do.}", "At the community, {you started a walking group that meets at seven, rain or shine.|you joined the choir, which sang at every holiday whether asked or not.|a new resident moved in who went to your high school, sixty years ago.}"]), mood: 3 }),
  },
  A("l_garage", [62, 92], 0.016, s => {
    const car = s.flags.firstCar && s.flags.firstCar.name ? `the keys to ${s.flags.firstCar.name}, your first car` : "the keys to a car you sold in the eighties";
    return [
      `Cleaning out the attic, you found {your high school yearbook|a shoebox of letters|the kids' report cards} and ${car}, {and sat on the floor reading for two hours.|and nothing else got cleaned that day.}`,
      "You finally cleaned out the garage and found {a box of Christmas decorations from 1979|a bowling trophy you had forgotten winning|a cassette labeled in your own handwriting}, {and kept every single thing.|and called your sister to laugh about it.}",
      "In the back of a closet you found {the dress you wore to your wedding|your old uniform|the kids' finger paintings}, {and decided some things don't need to be thrown out.|and gave half of it to the grandkids, who were thrilled.}",
    ];
  }, { mood: 2 }),
  {
    id: "l_moveNearKids", once: true, domain: "move", channel: "change", ages: [65, 88], when: s => usHome(s) && adultKids(s, 30).length > 0 && !s.flags.livesWithKid && s.flags.snowbird !== "moved", p: () => 0.019,
    choice: (s, ctx) => {
      const k = ctx.rng.pick(adultKids(s, 30)), g = grands(s).length;
      return {
        prompt: `${k.call} keeps saying you should move closer${g ? ", so the grandkids could see you every week" : ""}. What do you do?`,
        options: [
          { id: "l_moveNearKids.go", label: `Move near ${k.call}`, hint: "family close, friends far", act: "moveHome", style: "family", weight: 0.25, apply: (s2, c) => { const to = placeWords(moveTo(s2, c)); return { text: c.w(`You moved to ${to} to be near ${k.call}, {and the hardest part was leaving your friends.|and Sunday dinners became a standing thing.|and within a year you knew more people at the new church than ${k.call} did.}`), mood: 3, big: true }; } },
          { id: "l_moveNearKids.stay", label: "Stay where your life is", hint: "your friends, your doctor, your church", act: "wait", style: "self", weight: 0.35, apply: () => ({ text: `${k.call} asked you to move closer, and you stayed where your life is: your friends, your doctor and your pew. You visit often.`, mood: 0 }) },
          { id: "l_moveNearKids.split", label: "Spend summers near them", hint: "the best of both", act: "travel", style: "social", weight: 0.15, apply: (s2, c) => { spend(s2, 0.1); return { text: c.w(`Instead of moving near ${k.call}, you started spending summers nearby {in a rented cottage|in their guest room}, and came home in the fall with stories.`), mood: 3 }; } },
          { id: "l_moveNearKids.visit", label: "Visit more often", hint: "a standing trip every season", act: "travel", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(`You stayed put but started visiting ${k.call} every season, {with a cooler full of food each time.|and the grandkids kept a calendar counting down to it.}`), mood: 2 }) },
          { id: "l_moveNearKids.ask", label: "Suggest they move closer to you", hint: "worth a try", act: "insist", style: "risk", weight: 0.1, apply: () => ({ text: `When ${k.call} asked you to move closer, you suggested ${they(k)} move closer to you instead. Everyone laughed, and nobody moved, and you visit a lot.`, mood: 1 }) },
        ],
      };
    },
  },

  // ---------- the grandkids ----------
  {
    id: "l_grandName", once: true, domain: "family", channel: "good", tags: ["children"], ages: [42, 100], when: s => grandsIn(s, 1, 4).length > 0, p: () => 0.6,
    choice: (s, ctx) => {
      const g = grandsIn(s, 1, 4)[0], f = s.sex === "female";
      const pick = list => ctx.rng.pick(list);
      const N = {
        classic: f ? "Grandma" : "Grandpa",
        sweet: f ? pick(["Nana", "Mimi", "Grammy", "Granny"]) : pick(["Pop-Pop", "Papa", "Gramps", "Grandad"]),
        heritage: f ? pick(["Abuela", "Bubbe", "Oma", "Nonna", "Lola"]) : pick(["Abuelo", "Zayde", "Opa", "Nonno", "Lolo"]),
        baby: f ? pick(["Gaga", "Mimaw", "Bobo", "Nonnie"]) : pick(["Bop", "Papaw", "Boppy", "Gee"]),
        cool: f ? pick(["Gigi", "G-Ma", "Glamma"]) : pick(["Pops", "G-Pa", "Skip"]),
      };
      const set = (k, text) => (s2, c) => { s2.flags.grandName = N[k]; return { text: c.w(text), mood: 4 }; };
      return {
        prompt: `${g.call} is starting to talk, and the family wants to know: what should the grandkids call you?`,
        options: [
          { id: "l_grandName.classic", label: `Plain “${N.classic}”`, hint: "it was good enough for yours", act: "talk", style: "safe", weight: 0.3, apply: set("classic", `You told everyone you would be plain “${N.classic},” and the first time ${g.call} said it, {you made ${g.parent || "the baby's parent"} record it.|you had to sit down.}`) },
          { id: "l_grandName.sweet", label: `“${N.sweet}”`, hint: "softer, sweeter", act: "talk", style: "family", weight: 0.25, apply: set("sweet", `You picked “${N.sweet},” and ${g.call} {yelled it across every parking lot.|said it with such joy that it became your name to everyone, even the mailman.}`) },
          { id: "l_grandName.heritage", label: `“${N.heritage},” like your own grandparents`, hint: "the family's old word", act: "talk", style: "family", weight: 0.15, apply: set("heritage", `You chose “${N.heritage},” the word you once used for your own grandparent, and hearing ${g.call} say it {made you feel the whole family line at once.|brought tears to your eyes the first time.}`) },
          { id: "l_grandName.baby", label: "Let the baby decide", hint: "whatever comes out", act: "wait", style: "social", weight: 0.2, apply: set("baby", `You let ${g.call} decide, and what came out was “${N.baby}.” {It stuck, forever.|Now even your friends call you that.}`) },
          { id: "l_grandName.cool", label: `Something cooler: “${N.cool}”`, hint: "you are not old", act: "insist", style: "self", weight: 0.1, apply: set("cool", `You insisted on “${N.cool},” because you are not old, {and ${g.call} went along with it, mostly.|and the other grandparents rolled their eyes.}`) },
        ],
      };
    },
  },
  {
    id: "l_grandBabysit", once: true, domain: "family", channel: "change", tags: ["children"], ages: [44, 90], when: s => grandsIn(s, 0, 3).length > 0 && usHome(s), p: () => 0.098,
    choice: (s, ctx) => {
      const g = ctx.rng.pick(grandsIn(s, 0, 3)), par = g.parent || "your kid";
      const lead = scene(ctx, [
        `${par} is going back to work, and daycare for ${g.call} costs more than the mortgage.`,
        `${par} called in tears: the daycare closed, and there's nowhere for ${g.call} to go on weekdays.`,
        `${par} asked, a little nervously, whether you would ever want to watch ${g.call} during the week.`,
      ]);
      return {
        prompt: `${lead} What do you offer?`,
        options: [
          { id: "l_grandBabysit.weekdays", label: "Be the weekday babysitter", hint: "tiring, and the best job you'll ever have", act: "care", style: "family", weight: 0.25, apply: (s2, c) => ({ text: c.w(`You became ${g.call}'s weekday babysitter, {and your house filled up with sippy cups and board books.|and you were there for the first steps, which you told ${par} about very gently.|and you were exhausted by three and happy all day.}`), mood: 5, big: true }) },
          { id: "l_grandBabysit.some", label: "A couple of days a week", hint: "share it with the other side", act: "shareCare", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w(`You took ${g.call} two days a week, and the other grandparents took the rest. {Tuesdays and Thursdays became your favorite days.|You and ${g.call} had a standing date at the library story time.}`), mood: 4 }) },
          { id: "l_grandBabysit.pay", label: "Help pay for daycare", hint: "money, not diapers", act: "donate", style: "safe", weight: 0.15, when: s2 => s2.savings >= 0.3, apply: s2 => { spend(s2, 0.25); return { text: `You helped ${par} pay for daycare for ${g.call}, and visited on Saturdays with donuts.`, mood: 2 }; } },
          { id: "l_grandBabysit.backup", label: "Be the backup for sick days", hint: "on call, not on duty", act: "shareCare", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You told ${par} you would be the backup for sick days and snow days, {and got called more than anyone expected.|and kept a box of toys ready by the door.}`), mood: 2 }) },
          { id: "l_grandBabysit.no", label: "Say you can't", hint: "your own life, your own health", act: "avoid", style: "health", weight: 0.1, apply: () => ({ text: `You told ${par} gently that you couldn't watch ${g.call} every week. It was hard to say, and ${par} understood.`, mood: -1 }) },
        ],
      };
    },
  },
  {
    id: "l_grandSleepover", domain: "family", channel: "good", tags: ["children"], ages: [44, 100], cooldown: 4, max: 2, when: s => grandsIn(s, 4, 10).length > 0, p: () => 0.039,
    apply: (s, ctx) => {
      const g = ctx.rng.pick(grandsIn(s, 4, 10)), show = ctx.rng.pick(kidsCulture(s.year).watch).replace(/^watched /, "");
      return { text: ctx.w([`${g.call} slept over at ${gName(s)}'s house: {pancakes shaped like Mickey Mouse,|a blanket fort in the living room,|popcorn and a movie past bedtime,} and {cartoons at six in the morning.|a secret that you both kept from ${g.parent || "the parents"}.}`, `At the sleepover, you and ${g.call} {watched ${show} together on the couch.|built the tallest LEGO tower in family history.|baked cookies and ate most of the dough.} {${cap(they(g))} fell asleep on your arm, and you didn't move for an hour.|It was the best night of your month.}`, `${g.call} came for a weekend and {asked you four hundred questions about when you were little.|beat you at Go Fish six times in a row.|made you promise to do it again next month.}`]), mood: 4 };
    },
  },
  {
    id: "l_grandTeach", once: true, domain: "family", channel: "good", tags: ["children"], ages: [48, 100], when: s => grandsIn(s, 6, 14).length > 0, p: () => 0.065,
    choice: (s, ctx) => {
      const g = ctx.rng.pick(grandsIn(s, 6, 14)), talent = s.flags.talent && s.flags.talent !== "none" ? s.flags.talent : null;
      const T = { piano: "play the piano", baseball: "throw a curveball", soccer: "bend a soccer ball", scouts: "tie six knots and build a fire", dance: "waltz", karate: "do a proper front kick", art: "draw", code: "write a little computer program", ballet: "dance", swim: "swim the butterfly", chess: "play chess" };
      const teach = talent && T[talent] ? T[talent] : "play the harmonica";
      return {
        prompt: `${g.call} is ${gAge(s, g)} and spends a lot of time at your house. What do you teach ${them(g)}?`,
        options: [
          { id: "l_grandTeach.fish", label: "How to fish", hint: "patience and worms", act: "hobby", style: "health", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You taught ${g.call} to fish {off the dock at the lake|at the pond behind the church|on a creek you had fished as a kid}, and ${they(g)} {caught a sunfish the size of a cracker and wanted it mounted.|untangled ${their(g)} own line by the end of the summer.}`), mood: 4 }) },
          { id: "l_grandTeach.bake", label: "The family recipe", hint: "the one nobody writes down", act: "hobby", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You taught ${g.call} the family recipe for {the Christmas cookies|Sunday biscuits|the pie everyone fights over}, with a pinch of this and a handful of that, {and ${they(g)} wrote it all down on a card in crayon.|and flour ended up on the ceiling.}`), mood: 4 }) },
          { id: "l_grandTeach.cards", label: "Poker, or gin rummy", hint: "a lifelong skill", act: "socialize", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(`You taught ${g.call} {poker, for pennies,|gin rummy at the kitchen table|how to shuffle like a Vegas dealer}, and within a year ${they(g)} {was taking your pennies.|had a better poker face than you.}`), mood: 4 }) },
          { id: "l_grandTeach.fix", label: "How to fix things", hint: "a toolbox of their own", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w(`You gave ${g.call} a little toolbox and taught ${them(g)} {to change a tire|to patch a bike tube|to sew on a button and hem a pair of pants|to fix a leaky faucet}, {and ${they(g)} went home and fixed something nobody asked ${them(g)} to.|and ${they(g)} were very proud.}`), mood: 4 }) },
          { id: "l_grandTeach.talent", label: `How to ${teach}`, hint: "the thing you were good at as a kid", act: "study", style: "learn", weight: 0.1, apply: (s2, c) => ({ text: c.w(`You taught ${g.call} how to ${teach}, the way someone once taught you, {and the first time ${they(g)} got it right you both cheered.|and it turned out ${they(g)} had your knack for it.}`), mood: 5 }) },
          { id: "l_grandTeach.learn", label: `Let ${g.call} teach you something`, hint: "a video game, a dance", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You let ${g.call} teach you {${future(s2) ? "a new game" : s2.year >= 2012 ? "Minecraft" : "a video game"}|a dance everyone at school was doing|a card trick}, and you were terrible at it, {which ${they(g)} found hilarious.|and ${they(g)} were a very patient teacher.}`), mood: 4 }) },
        ],
      };
    },
  },
  {
    id: "l_grandGame", domain: "family", channel: "good", tags: ["children"], ages: [48, 100], cooldown: 3, max: 2, when: s => grandsIn(s, 5, 17).length > 0, p: () => 0.039,
    apply: (s, ctx) => {
      const g = ctx.rng.pick(grandsIn(s, 5, 17));
      return { text: ctx.w([`You sat on cold bleachers at ${g.call}'s {soccer game|Little League game|swim meet|basketball game} and cheered loud enough to embarrass ${them(g)}, {which was the point.|and ${they(g)} waved at you anyway.}`, `${g.call}'s {spring recital|school play|band concert} was {two hours long and ${they(g)} were on stage for ninety seconds,|in a gym that smelled like floor wax,} and {you clapped like it was Carnegie Hall.|you saved the program in your Bible.}`, `At ${g.call}'s {science fair|spelling bee|art show}, {you told every stranger which one was your ${gWord(g)}.|you took forty photos of the same poster board.}`]), mood: 4 };
    },
  },
  {
    id: "l_grandTeen", once: true, domain: "family", channel: "good", tags: ["children"], ages: [55, 105], when: s => grandsIn(s, 14, 19).length > 0, p: () => 0.052,
    apply: (s, ctx) => {
      const g = ctx.rng.pick(grandsIn(s, 14, 19));
      return { text: ctx.w([`${g.call}, now a teenager, {got a learner's permit and drove you to the grocery store, and you gripped the door handle the whole way, which felt like justice.|texted you a photo of a homecoming outfit and asked what you thought.|came over to do homework because your house is quieter.}`, `${g.call} {taught you what half the words in ${their(g)} texts mean.|asked you about your first job and actually listened.|showed you a song and you showed ${them(g)} the original.}`, `Your teenage ${gWord(g)} ${g.call} {still hugs you in public, which you know is rare.|called you for advice before calling ${their(g)} parents, and you kept the secret.}`]), mood: 4 };
    },
  },
  {
    id: "l_grandGrad", domain: "family", channel: "good", tags: ["children"], ages: [55, 110], cooldown: 2, max: 2, when: s => grandsIn(s, 18, 18).length > 0 || grandsIn(s, 22, 22).length > 0, p: () => 0.35,
    apply: (s, ctx) => {
      const g = ctx.rng.pick([...grandsIn(s, 18, 18), ...grandsIn(s, 22, 22)]), college = gAge(s, g) >= 22;
      return { text: ctx.w([`${g.call} graduated from ${college ? "college" : "high school"}, and {you cried when they called ${their(g)} name.|you sat in the front row with a sign you made yourself.|you tucked a check into the card with a note in your best handwriting.}`, `At ${g.call}'s ${college ? "college" : "high school"} graduation, {you got a photo with ${them(g)} in the cap and gown and put it on the fridge that night.|you thought about your own graduation and how fast it all goes.}`, `${g.call} walked across the stage at ${college ? "college" : "high school"} graduation, {and you remembered holding ${them(g)} the day ${they(g)} were born.|and threw you a little wave from the stage.}`]), mood: 6, big: true };
    },
  },
  A("l_grandWedding", [68, 110], 0.052, (s, ctx) => {
    const g = ctx.rng.pick(grandsIn(s, 23, 40));
    return [
      `At ${g.call}'s wedding you were the oldest person on the dance floor, {and you stayed out there until the last song.|and the DJ dedicated a song to you.|and ${g.call} came over for a slow dance with ${gName(s)}.}`,
      `${g.call} got married, and {you gave a toast that made the whole tent cry.|you sat at the front with a corsage and a handkerchief.|you gave ${them(g)} the ring that had been in the family for three generations.}`,
      `Your ${gWord(g)} ${g.call}'s wedding {was the happiest day you had in years.|had a photo booth, and you used it eleven times.}`,
    ];
  }, { mood: 7, big: true, domain: "family", channel: "good", tags: ["children"], when: s => grandsIn(s, 23, 40).length > 0 }),
  A("l_greatGrand", [70, 110], 0.033, [
    "You became a great-grandparent, and {the family took a photo of four generations on the couch.|you held the baby and could not believe your own baby's baby had a baby.|you started a new photo album, the fourth one.}",
    "A great-grandchild was born, {and the family drove for hours so you could hold the baby first.|and you wrote the baby a letter to open at eighteen.}",
    "Four generations: your first great-grandchild arrived, {and someone had to explain the family tree twice at the hospital.|and you were the proudest person in the room.}",
  ], { mood: 7, big: true, domain: "family", channel: "good", tags: ["children"], when: s => grandsIn(s, 24, 45).length > 0, fx: s => { s.flags.greatGrand = s.age; } }),
  {
    id: "l_grandCollege", once: true, domain: "wealth", channel: "change", tags: ["children"], ages: [45, 95], when: s => grandsIn(s, 0, 8).length > 0 && s.savings >= 0.3, p: () => 0.052,
    choice: (s, ctx) => {
      const g = ctx.rng.pick(grandsIn(s, 0, 8)), plan = s.year >= 1997;
      return {
        prompt: `College is a long way off for ${g.call}, but you keep reading what tuition costs. Do you put something aside?`,
        options: [
          { id: "l_grandCollege.plan", label: plan ? "Open a 529 college plan" : "Open a college savings account", hint: "a little every birthday", act: "invest", style: "safe", weight: 0.3, apply: s2 => { spend(s2, 0.2); return { text: `You opened a ${plan ? "529 college plan" : "college savings account"} for ${g.call} and added to it every birthday instead of buying another toy.`, mood: 3 }; } },
          { id: "l_grandCollege.bonds", label: "Buy savings bonds, like your grandparents did", hint: "old-fashioned and safe", act: "save", style: "family", weight: 0.15, apply: s2 => { spend(s2, 0.1); return { text: `You bought ${g.call} savings bonds every Christmas, just like your own grandparents did for you, and kept them in an envelope in the desk.`, mood: 2 }; } },
          { id: "l_grandCollege.later", label: "Help when the time comes", hint: "keep the money flexible", act: "wait", style: "self", weight: 0.2, apply: () => ({ text: `You decided to help ${g.call} with college when the time comes and to keep your savings flexible for now.`, mood: 0 }) },
          { id: "l_grandCollege.teach", label: "Teach them to save instead", hint: "a piggy bank and a lesson", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You gave ${g.call} a piggy bank and {matched every quarter ${they(g)} saved.|took ${them(g)} to open a first bank account, and ${they(g)} were very serious about it.}`), mood: 3 }) },
          { id: "l_grandCollege.time", label: "Spend time, not money", hint: "memories compound too", act: "socialize", style: "family", weight: 0.15, apply: () => ({ text: `You decided your gift to ${g.call} would be time instead of money: a standing Saturday together, every week you could.`, mood: 3 }) },
        ],
      };
    },
  },
  {
    id: "l_grandSpoil", domain: "family", channel: "good", tags: ["children"], ages: [44, 100], cooldown: 4, max: 2, when: s => grandsIn(s, 2, 12).length > 0, p: () => 0.033,
    apply: (s, ctx) => {
      const g = ctx.rng.pick(grandsIn(s, 2, 12));
      return { text: ctx.w([`At ${gName(s)}'s house the rules were different: {ice cream before dinner,|bedtime was a suggestion,|soda with breakfast on birthdays,} and ${g.call} {knew it and used it.|told ${their(g)} parents nothing.}`, `You bought ${g.call} {the toy ${they(g)} had been asking for since Easter|a bike with streamers|a pair of light-up sneakers}, and {${g.parent || "the parents"} gave you a look.|you would do it again tomorrow.}`, `${g.call} {has a drawer in your kitchen that is all ${their(g)} snacks.|knows exactly where you hide the good cookies.|calls you before calling anyone else when ${they(g)} have news.}`]), mood: 4 };
    },
  },
  {
    id: "l_reunion", domain: "family", channel: "good", ages: [60, 92], cooldown: 8, max: 1, when: usHome, p: () => 0.016,
    choice: (s, ctx) => {
      const lead = scene(ctx, ["Your cousin is trying to organize the first family reunion in years.", "Your side of the family hasn't all been together since the last funeral, and somebody said, “Let's fix that.”", "The family reunion is coming up, and everyone assumed you would be in charge."]);
      return {
        prompt: `${lead} How do you handle it?`,
        options: [
          { id: "l_reunion.host", label: "Host it in your backyard", hint: "folding tables and a borrowed grill", act: "socialize", style: "family", weight: 0.25, apply: (s2, c) => { spend(s2, 0.05); return { text: c.w("You hosted the family reunion in your backyard, {with folding tables from the church and two borrowed grills.|and sixty relatives showed up, including some nobody could place.} {Your cousin's potato salad was the hit, again.|The kids ran through the sprinkler until dark.}"), mood: 5 }; } },
          { id: "l_reunion.shirts", label: "Order matching T-shirts", hint: "go big", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w("You ordered matching reunion T-shirts {in a color nobody looked good in|with the family name and the year}, {and everybody complained and everybody wore them.|and the group photo is now on six refrigerators.}"), mood: 5 }) },
          { id: "l_reunion.park", label: "Rent a pavilion at the state park", hint: "lakeside, no cleanup", act: "socialize", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w("You reserved a pavilion at the state park for the reunion, {with a lake, a softball game and four kinds of baked beans.|and the old uncles played horseshoes until the rangers closed the gate.}"), mood: 4 }) },
          { id: "l_reunion.tree", label: "Bring the family tree", hint: "everyone finds their name", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w("You brought a family tree to the reunion, printed on six feet of paper, {and the cousins argued happily over who belonged where.|and the youngest cousin found the family name on it and took a selfie.}"), mood: 4 }) },
          { id: "l_reunion.skip", label: "Skip it this time", hint: "family drama, no thanks", act: "avoid", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w("You skipped the family reunion this time, {and saw the photos online.|and your sister called with every bit of the drama, so you didn't miss a thing.}"), mood: -1 }) },
        ],
      };
    },
  },
  A("l_holidayHandoff", [62, 95], 0.026, s => {
    const k = adultKids(s, 28)[0];
    const who = k ? k.call : "your oldest";
    return [
      `This year ${who} hosted Thanksgiving for the first time, and you were told to bring only a pie. {The turkey was a little dry, and you said nothing, which was your gift.|You sat in the living room with nothing to do and found you liked it.|You watched ${who} carve and remembered teaching ${k ? them(k) : "them"} how.}`,
      `The family Christmas moved to ${who}'s house this year, and {you brought your famous stuffing in the old dish.|for the first time in forty years you didn't do the dishes.}`,
      `You handed the holiday dinner over to ${who}, along with {the good gravy boat|the recipe cards|the folding table from the garage}, and {it was a little sad and mostly wonderful.|everybody said it tasted just like yours.}`,
    ];
  }, { mood: 3, domain: "family", channel: "change", tags: ["children"], when: s => adultKids(s, 28).length > 0 }),
  {
    id: "l_kidTrouble", once: true, domain: "family", channel: "bad", tags: ["children"], ages: [56, 88], when: s => adultKids(s, 25).length > 0, p: () => 0.023,
    choice: (s, ctx) => {
      const k = ctx.rng.pick(adultKids(s, 25)), w = kidWord(k), trouble = ctx.rng.pick(["lost a job", "is going through a divorce", "is buried in debt", "had to close a business"]);
      return {
        prompt: `Your ${w} ${k.call} ${trouble} and called you, trying not to cry. How do you help?`,
        options: [
          { id: "l_kidTrouble.home", label: "Offer your spare room", hint: "home is home", act: "care", style: "family", weight: 0.25, apply: (s2, c) => ({ text: c.w(`When ${k.call} ${trouble}, you made up the spare room, and ${k.call} lived with you for {a few months|most of a year}. {It was crowded and it was good.|You cooked ${their(k)} favorite dinners and asked very few questions.}`), mood: 1 }) },
          { id: "l_kidTrouble.money", label: "Help with money", hint: "what are savings for", act: "lend", style: "family", weight: 0.2, when: s2 => s2.savings >= 0.3, apply: s2 => { spend(s2, 0.3); return { text: `When ${k.call} ${trouble}, you wrote a check and said it wasn't a loan, though ${k.call} paid some of it back anyway.`, mood: 0 }; } },
          { id: "l_kidTrouble.listen", label: "Just listen", hint: "advice can wait", act: "talk", style: "social", weight: 0.25, apply: () => ({ text: `When ${k.call} ${trouble}, you mostly listened, on the phone for an hour every Sunday, and only gave advice when asked. ${cap(they(k))} said later it was what got ${them(k)} through.`, mood: 1 }) },
          { id: "l_kidTrouble.connect", label: "Call people you know", hint: "a lifetime of contacts", act: "seekHelp", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w(`When ${k.call} ${trouble}, you called everyone you knew, {and an old friend's company had an opening.|and found a good lawyer from church.|and set up three lunches with people who could help.}`), mood: 2 }) },
          { id: "l_kidTrouble.tough", label: "Tell them to figure it out", hint: "they're grown", act: "insist", style: "self", weight: 0.15, apply: () => ({ text: `When ${k.call} ${trouble}, you said you loved ${them(k)} and that ${they(k)} could figure it out. ${cap(they(k))} did, slowly, and you two talk about that year carefully now.`, mood: -2 }) },
        ],
      };
    },
  },

  // ---------- the two of you ----------
  {
    id: "l_homeTogether", once: true, domain: "love", channel: "change", tags: ["spouse"], about: "partner", ages: [58, 88], when: s => married(s) && s.retired, p: () => 0.065,
    choice: (s, ctx) => {
      const n = pName(s), P = s.partner;
      const lead = scene(ctx, [`You and ${n} are both home all day now, and you have started to step on each other's toes.`, `${n} has opinions about how you load the dishwasher, now that ${they(P)} watch you do it every day.`, `Forty years of marriage, and you and ${n} are learning how to be retired together.`]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "l_homeTogether.space", label: "Separate hobbies, separate rooms", hint: "miss each other a little", act: "hobby", style: "self", weight: 0.25, apply: (s2, c) => ({ text: c.w(`Retired together, you and ${n} agreed on separate days out: {you took the golf course and ${they(P)} took the garden club.|you got the garage and ${they(P)} got the sunroom.} Dinners got a lot more interesting.`), mood: 3 }) },
          { id: "l_homeTogether.dance", label: "Take dance lessons together", hint: "ballroom, or line dancing", act: "hobby", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`Retired together, you and ${n} signed up for {ballroom lessons at the community center|line dancing at the VFW hall|square dancing on Friday nights}, {and stepped on each other's feet for months and laughed every time.|and won a ribbon at the spring social.}`), mood: 5 }) },
          { id: "l_homeTogether.project", label: "Take on a project together", hint: "a boat, a garden, a quilt", act: "hobby", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(`Retired together, you and ${n} took on a project: {restoring an old wooden boat in the garage.|turning the backyard into a vegetable garden.|a quilt with a square for every year you'd been married.} You argued and finished it anyway.`), mood: 4 }) },
          { id: "l_homeTogether.walk", label: "A walk together every morning", hint: "the same loop, the same talks", act: "exercise", style: "health", weight: 0.2, apply: (s2, c) => { hr(s2, 0.99); return { text: c.w(`Retired together, you and ${n} started walking the same loop every morning, {and talked about things you hadn't talked about in years.|and said good morning to every dog in the neighborhood.}`), mood: 4 }; } },
          { id: "l_homeTogether.counsel", label: "See a counselor together", hint: "a tune-up", act: "counsel", style: "social", weight: 0.15, apply: () => ({ text: `Retired together and bickering, you and ${n} saw a counselor for a few months, and learned to say what you needed instead of slamming the cupboards.`, mood: 3 }) },
        ],
      };
    },
  },
  {
    id: "l_fiftieth", once: true, domain: "love", channel: "good", tags: ["spouse"], about: "partner", ages: [60, 110], when: s => married(s) && yearsMarried(s) >= 50 && yearsMarried(s) <= 51, p: () => 1,
    choice: (s, ctx) => {
      const n = pName(s), P = s.partner;
      return {
        prompt: `You and ${n} have been married fifty years. How do you celebrate your golden anniversary?`,
        options: [
          { id: "l_fiftieth.vows", label: "Renew your vows", hint: "same promises, older knees", act: "spiritual", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(`For your fiftieth anniversary, you and ${n} renewed your vows {in the church where you married|in the backyard, with the grandkids as the wedding party}, and {this time you didn't forget the words.|${n} wore something gold and cried first.}`), mood: 8, big: true }) },
          { id: "l_fiftieth.party", label: "A party with everyone", hint: "a sheet cake with your wedding photo", act: "socialize", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w(`The family threw a party for your fiftieth anniversary {in the church hall|at the VFW|at your favorite restaurant}, with a sheet cake printed with your wedding photo, {and you and ${n} danced to your wedding song.|and somebody played a slideshow that made the whole room cry.}`), mood: 8, big: true }) },
          { id: "l_fiftieth.honeymoon", label: "Go back to your honeymoon spot", hint: "fifty years later", act: "travel", style: "family", weight: 0.2, apply: (s2, c) => { spend(s2, 0.1); return { text: c.w(`For your fiftieth anniversary, you and ${n} went back to where you honeymooned, {and the motel was gone, but the beach was the same.|and you found the same booth at the same diner.|and took the same photo in the same spot, fifty years apart.}`), mood: 8, big: true }; } },
          { id: "l_fiftieth.cruise", label: "A cruise, just the two of you", hint: "no dishes for a week", act: "travel", style: "risk", weight: 0.15, apply: (s2, c) => { spend(s2, 0.2); return { text: c.w(`For your fiftieth anniversary, you and ${n} took a cruise, {and the captain announced it at dinner and the whole dining room clapped.|and spent every evening on the deck, holding hands like teenagers.}`), mood: 8, big: true }; } },
          { id: "l_fiftieth.quiet", label: "A quiet dinner, the two of you", hint: "the best kind", act: "talk", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w(`For your fiftieth anniversary, you and ${n} had a quiet dinner at home, {and ${they(P)} gave you a letter that you will keep forever.|and looked through the wedding album, page by page.|and agreed that fifty years went by in about a week.}`), mood: 7, big: true }) },
        ],
      };
    },
  },
  A("l_fortieth", [58, 105], 0.8, s => {
    const n = pName(s);
    return [
      `You and ${n} reached your fortieth anniversary, {and the kids gave you a ruby-red cake.|and you went to the steakhouse where ${n} had proposed.|and you agreed you'd do it all again, maybe with fewer moves.}`,
      `Forty years married: you and ${n} {celebrated with a weekend at a bed-and-breakfast.|got a card from every grandchild, some of them legible.|still finish each other's crossword clues.}`,
      `On your fortieth anniversary, ${n} {surprised you with your wedding song on the radio, by calling in a request.|framed the receipt from your first date, which ${their(s.partner)} had saved all along.}`,
    ];
  }, { mood: 5, domain: "love", channel: "good", tags: ["spouse"], when: s => married(s) && yearsMarried(s) >= 40 && yearsMarried(s) <= 41 }),
  {
    id: "l_partnerSurgery", domain: "love", channel: "bad", tags: ["spouse"], about: "partner", ages: [60, 100], cooldown: 6, max: 2, when: s => married(s) && s.partner.age >= 64, p: () => 0.026,
    apply: (s, ctx) => {
      const n = pName(s), P = s.partner;
      return { text: ctx.w([`${n} had a {knee|hip} replaced, and you were the nurse for six weeks. ${cap(they(P))} {were a terrible patient,|complained about everything,} and {you were secretly glad to be needed.|you both laughed about it later.}`, `${n} had cataract surgery and {wore the big dark glasses for a week like a movie star.|kept saying how bright your face looked, which you decided to take as a compliment.}`, `${n} had back surgery, and you {learned to do everything ${they(P)} usually did around the house.|drove ${them(P)} to physical therapy three times a week and read magazines in the waiting room.}`]), mood: -1 };
    },
  },
  {
    id: "l_coupleRoutine", domain: "love", channel: "good", tags: ["spouse"], about: "partner", ages: [64, 105], cooldown: 5, max: 3, when: married, p: () => 0.046,
    apply: (s, ctx) => {
      const n = pName(s);
      return { text: ctx.w([`You and ${n} {do the crossword together every morning, one in pen and one in pencil.|have eaten at the same diner booth every Friday for twenty years.|still hold hands in the grocery store.}`, `You and ${n} {bicker about the thermostat, then share a blanket.|have the same three arguments, and they've gotten funny.|finish each other's sentences, mostly wrong.}`, `Every evening you and ${n} {sit on the porch and watch the street go by.|watch Jeopardy and shout the answers at each other.|take a slow walk around the block after dinner.}`]), mood: 3 };
    },
  },
  A("l_blended", [60, 100], 0.5, [
    "Married again later in life, you {had two sets of grandkids at Christmas and a very long table.|learned a whole new family's holiday traditions, and kept the best ones.|agreed with {partner} on everything except the thermostat.}",
    "Your second marriage at this age came with {a second family's birthdays to remember|a whole new set of in-laws, some of them younger than you}, {and you wrote them all on the big calendar.|and it was more than you expected and better too.}",
    "Your kids and {partner}'s kids {met for the first time at Thanksgiving and got along suspiciously well.|took a while to warm up, and then started a group chat without you.}",
  ], { mood: 4, domain: "love", channel: "good", tags: ["spouse"], when: s => married(s) && s.marriages >= 2 && yearsMarried(s) <= 3 }),

  // ---------- after a husband or wife dies ----------
  {
    id: "l_griefYear", domain: "family", channel: "change", tags: ["spouse"], ages: [60, 105], cooldown: 6, max: 2, when: s => widowedFor(s) >= 0 && widowedFor(s) <= 1, p: () => 0.6,
    choice: (s, ctx) => {
      const n = lateName(s), his = lateHis(s);
      const lead = scene(ctx, [
        `Since ${n} died, the house is so quiet you can hear the clock in the hall.`,
        `The casseroles have stopped coming and the kids have gone home. It's you, and ${n}'s side of the closet.`,
        `It has been a few months since ${n} died. People keep asking how you are, and you keep saying fine.`,
      ]);
      return {
        prompt: `${lead} How do you get through the first year?`,
        options: [
          { id: "l_griefYear.group", label: "Join a grief support group", hint: "people who understand", act: "counsel", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`After ${n} died, you joined a grief group {at the church|at the hospice center} on Tuesday nights, {and found people who didn't need you to explain.|and a widow named Dot became your best friend.} It didn't fix anything, and it helped.`), mood: 3 }) },
          { id: "l_griefYear.kids", label: "Lean on the kids", hint: "let them help", act: "talk", style: "family", weight: 0.25, when: s2 => adultKids(s2).length > 0, apply: (s2, c) => ({ text: c.w(`After ${n} died, you let the kids carry you for a while: {Sunday dinners, daily phone calls,|a grandchild sleeping over every Friday,} {and you didn't pretend to be fine.|until one day you noticed you were laughing again.}`), mood: 3 }) },
          { id: "l_griefYear.busy", label: "Stay busy", hint: "volunteer, fix, help", act: "volunteer", style: "learn", weight: 0.2, apply: (s2, c) => ({ text: c.w(`After ${n} died, you kept your hands busy: {the food bank on Mondays, the church on Thursdays,|repainting every room in the house,} and {on the hard days, busy helped.|by spring you could talk about ${lateHim(s2)} without your voice breaking.}`), mood: 2 }) },
          { id: "l_griefYear.walk", label: "Keep the routine: walk every morning", hint: "one foot in front of the other", act: "exercise", style: "health", weight: 0.15, apply: (s2, c) => { hr(s2, 0.99); return { text: c.w(`After ${n} died, you walked every morning, the same loop you two used to walk, {and the neighbors waved and sometimes walked with you.|and talked to ${lateHim(s2)} a little, out loud, when no one was around.}`), mood: 2 }; } },
          { id: "l_griefYear.alone", label: "Give yourself time alone", hint: "grief takes its time", act: "rest", style: "self", weight: 0.2, apply: (s2, c) => { hr(s2, 1.01); return { text: c.w(`After ${n} died, you kept to yourself for a long while, {with ${his} reading glasses still on the nightstand.|sleeping on your own side of the bed.} Slowly, the days got a little lighter.`), mood: 0 }; } },
        ],
      };
    },
  },
  A("l_firstHolidays", [60, 105], 0.5, s => {
    const n = lateName(s), his = lateHis(s);
    return [
      `The first Christmas without ${n}, {you hung ${his} stocking anyway.|the family set a candle at ${his} place at the table.|you couldn't face the ornaments, and a grandkid decorated the tree for you.}`,
      `The first Thanksgiving without ${n}, {nobody knew who should carve, and your son finally did it badly, and everyone laughed and cried.|you made ${his} cranberry recipe and it tasted almost right.}`,
      `Your first anniversary alone, {you went to ${n}'s favorite restaurant and ordered ${his} usual.|you read old love letters from the shoebox.|a friend took you out to lunch without saying why, because she knew.}`,
    ];
  }, { mood: -3, domain: "family", channel: "bad", tags: ["spouse"], when: s => widowedFor(s) >= 0 && widowedFor(s) <= 1 }),
  A("l_aloneSkills", [60, 105], 0.163, s => {
    const n = lateName(s);
    return [
      `After ${n} was gone, you learned {to pay the bills online, which ${n} had always done.|to work the grill, badly at first.|to cook for one, which mostly meant learning to freeze things.|to change the furnace filter, with a video and a lot of muttering.}`,
      `Living alone, you found that {the TV remote is always exactly where you left it, which is lonely and convenient.|you talk to the cat now, and the cat is a good listener.|you can eat cereal for dinner and nobody says a word.}`,
      `You figured out the things ${n} used to handle: {the taxes, with help from your daughter.|the lawn mower, which hates you.|the car's oil changes, where the mechanic now knows you by name.}`,
    ];
  }, { mood: 1, domain: "family", channel: "change", when: s => widowedFor(s) >= 1 && widowedFor(s) <= 4 }),
  {
    id: "l_datingAgain", once: true, domain: "love", channel: "change", tags: ["spouse"], ages: [60, 90], when: s => widowedFor(s) >= 2, p: () => 0.052,
    choice: (s, ctx) => {
      const n = lateName(s), k = adultKids(s, 25)[0], years = Math.max(2, widowedFor(s));
      const lead = scene(ctx, [
        k && s.year >= 2005 ? `${k.call} set up a dating profile for you without asking and is very pleased about it.` : null,
        "Someone at church has started saving you a seat, and it's been noticed by everyone.",
        "Your friend wants to drag you to the dance at the senior center on Friday.",
        `It's been ${years} years since ${n} died, and you are surprised to find you're lonely for company.`,
      ]);
      return {
        prompt: `${lead} Are you ready to date again?`,
        options: [
          { id: "l_datingAgain.online", label: s.year >= 2005 ? "Try a dating site" : "Answer a personal ad", hint: "there are a lot of you out there", act: "pursue", style: "risk", weight: 0.2, apply: (s2, c) => { s2.flags.pursueUntil = s2.age + 2; s2.flags.widowDating = s2.age; return { text: c.w(s2.year >= 2005 ? "Years after losing your spouse, you tried online dating, {and your profile photo took the grandkids an hour.|and your first date was a retired dentist who talked about fishing for two hours, and you went out again anyway.|and learned what “swipe” means.}" : "Years after losing your spouse, you answered a personal ad in the paper, {and met for coffee at a diner, both of you nervous as teenagers.|and wrote letters for a month before meeting.}"), mood: 3 }; } },
          { id: "l_datingAgain.yes", label: "Say yes to coffee", hint: "it's just coffee", act: "pursue", style: "social", weight: 0.25, apply: (s2, c) => { s2.flags.pursueUntil = s2.age + 2; s2.flags.widowDating = s2.age; return { text: c.w("Years after losing your spouse, you said yes to coffee, {and it turned into lunch.|and you talked until they flipped the sign to closed.|and you went home and sat in the car for a minute, smiling.}"), mood: 4 }; } },
          { id: "l_datingAgain.friends", label: "Company, not romance", hint: "a supper club, a card group", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w("Years after losing your spouse, you decided you wanted company but not romance, and started {a supper club with other widows and widowers.|a Wednesday card game that runs late.|traveling with a group from church.}"), mood: 3 }) },
          { id: "l_datingAgain.notYet", label: "Not ready yet", hint: "maybe someday", act: "wait", style: "safe", weight: 0.15, apply: () => ({ text: `Years after ${n} died, you thought about dating and decided you weren't ready. Maybe someday. You kept ${lateHis(s)} picture on the mantel.`, mood: 0 }) },
          { id: "l_datingAgain.alone", label: "Happy on your own", hint: "a full life already", act: "avoid", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w("Years after losing your spouse, you decided you are happy on your own: {a dog, a book club and a garden.|your friends, your grandkids and your own schedule.} Nobody needs to fix that."), mood: 2 }) },
        ],
      };
    },
  },
  A("l_lateLove", [62, 100], 0.3, s => {
    const n = pName(s);
    return [
      `Dating ${n} at ${s.age}, you {held hands at the movies like you were sixteen.|bought new clothes for the first time in years.|found yourself humming in the kitchen.}`,
      `Your grandkids asked if you and ${n} were serious, {and you blushed, which settled it.|and you said “Mind your business,” which settled it too.}`,
      `You and ${n} {started taking Sunday drives with no destination.|met each other's kids at a very nervous brunch.|have a standing date on Saturday nights.}`,
    ];
  }, { mood: 4, domain: "love", channel: "good", tags: ["spouse"], when: s => s.rel === "dating" && !!s.partner }),
  A("l_companionPet", [62, 92], 0.026, s => [
    "Living alone, you adopted {a gray-muzzled senior dog from the shelter|a big orange cat with opinions|a little terrier who had been returned twice}, and {you two took a slow walk every morning.|now someone is always glad when you come home.|the house stopped being so quiet.}",
    s.flags.pet && s.flags.pet.name ? `You adopted a ${s.flags.pet.noun || "dog"} and, without quite meaning to, named it ${s.flags.pet.name}, after the pet you had as a kid. {It sleeps on your feet.|It was the best decision of the year.}` : null,
    "The shelter had a program matching older pets with older people, and {you went home with a beagle named Duke.|you came home with a cat named Princess who runs the house now.}",
  ], { mood: 4, domain: "family", channel: "good", when: s => s.rel !== "married" && s.rel !== "dating" && !s.flags.community }),

  // ---------- old friends ----------
  {
    // Friends who pass away are unnamed people at the edge of the story; nobody's state changes.
    id: "l_friendGone", domain: "family", channel: "bad", ages: [62, 105], cooldown: 4, max: 3, p: s => 0.02 + (s.age >= 75 ? 0.02 : 0),
    apply: (s, ctx) => {
      const who = ctx.rng.pick(["your old college roommate", "your carpool buddy from the old job", "a neighbor from the street where you raised the kids", "your bowling teammate of thirty years", "the friend who stood up at your wedding", s.flags.served ? "an old buddy from the service" : "your first boss, who taught you more than anyone"]);
      return { text: ctx.w([`${cap(who)} passed away this year. {You drove three hours to the service and told the story about the time the two of you got lost on the way to the lake.|You found an old photo of the two of you and mailed it to the family.|You sat in the back of the church and remembered the good years.}`, `You got the call that ${who} had died. {You went out to the porch for a long while.|You raised a glass that night, the cheap beer the two of you used to drink.|You wrote a letter to the family with every good story you had.}`, `The obituary page had ${who} in it this week. {You cut it out and kept it.|You called another old friend just to hear a voice from those days.}`]), mood: -3 };
    },
  },
  A("l_cardList", [72, 105], 0.026, [
    "Writing your Christmas cards this year, {you crossed a few names out of the old address book, gently,|you noticed the list was shorter,} and {added the grandkids' new addresses in their place.|wrote longer notes to the ones still on it.}",
    "The holiday card list {had more grandkids and fewer old friends than it used to.|took you an afternoon and a pot of coffee.} {You signed every card yourself.|You called the friends you couldn't write to.}",
    "You looked through the address book with pages of crossed-out names and {decided to call everyone left in it, one a week.|started a new book, with your grandkids' phone numbers on page one.}",
  ], { mood: 0, domain: "family", channel: "change" }),
  A("l_coffeeCrew", [62, 95], 0.019, s => [
    `Every morning you meet the same crew {at the McDonald's for senior coffee|at the counter of the diner|at the bench outside the hardware store}, {where you solve the world's problems by eight-thirty.|where the arguments about baseball have gone on for twenty years.|and if somebody doesn't show, somebody checks on them.}`,
    s.sex === "female" && s.year >= 1998 ? "You joined a Red Hat Society chapter and wore a purple dress and a red hat to lunch with a dozen women who laugh louder than anyone in the restaurant." : "You joined a lunch bunch that meets every second Tuesday and has outlasted three restaurants.",
    "Your Thursday breakfast group {calls itself the Liars' Club, for good reason.|has a table at the diner with a reserved sign the owner made.|keeps a running bet on the weather.}",
  ], { mood: 3, domain: "family", channel: "good", when: usHome }),
  {
    id: "l_newFriend", domain: "family", channel: "good", ages: [62, 98], cooldown: 6, max: 1, p: () => 0.019,
    apply: (s, ctx) => {
      const where = ctx.rng.pick(["at water aerobics", "at the senior center", "in the church choir", "at the dog park", "when they moved in next door", "in a watercolor class"]);
      const f = makeFriend(s, ctx, "neighbor", 0.75);
      return { text: ctx.w([`You met ${f.call} ${where}, and {you were friends by the end of the week.|it turned out you had grown up two towns apart.|you have been on the phone every day since.}`, `${f.call}, whom you met ${where}, {became the friend you didn't know you needed at this age.|drives you to appointments and you make ${them(f)} soup.}`, `At ${s.age} you made a new friend: ${f.call}, ${where}. {You laughed at the same things.|You traded books and recipes and complaints.}`]), mood: 4 };
    },
  },
  {
    id: "l_classReunion", once: true, domain: "family", channel: "good", ages: [67, 69], when: s => usHome(s) && ["high", "ged", "certificate", "associate", "bachelor", "master", "professional", "doctorate"].includes(s.edu), p: s => (s.age === 68 ? 0.6 : 0.2),
    choice: (s, ctx) => {
      const fl = s.flags.firstLove && s.flags.firstLove.name ? s.flags.firstLove.name : null;
      return {
        prompt: `Your fiftieth high school reunion is this fall, in the ${ctx.rng.pick(["school gym", "VFW hall", "banquet room of the Holiday Inn"])}. Do you go?`,
        options: [
          { id: "l_classReunion.go", label: "Go", hint: "name tags with your senior photo", act: "socialize", style: "social", weight: 0.35, apply: (s2, c) => ({ text: c.w("You went to your fiftieth high school reunion and wore a name tag with your senior photo on it, {and recognized almost nobody until they laughed.|and danced to the same songs from the same prom.|and the class clown was still the class clown.}"), mood: 4 }) },
          { id: "l_classReunion.organize", label: "Help organize it", hint: "find everyone", act: "volunteer", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w("You helped organize your fiftieth high school reunion, {tracking down classmates in eleven states,|making the slideshow of yearbook photos,} and {it was the best one yet.|people thanked you for months.}"), mood: 5 }) },
          { id: "l_classReunion.flame", label: fl ? `Go, and look for ${fl}` : "Go, and look for your old crush", hint: "just to say hello", act: "socialize", style: "risk", weight: 0.15, apply: (s2, c) => ({ text: c.w(`At your fiftieth reunion you looked for ${fl || "your old high school crush"}, {and you two talked by the punch bowl like no time had passed.|and found out you were both grandparents now, with photos to prove it.|who said, “I always wondered what happened to you.”}`), mood: 4 }) },
          { id: "l_classReunion.online", label: s.year >= 2010 ? "Skip it, but join the Facebook group" : "Skip it, but send a letter", hint: "the reunion from your couch", act: "talk", style: "self", weight: 0.15, apply: () => ({ text: "You skipped your fiftieth high school reunion, but you caught up with old classmates from your couch and saw every photo.", mood: 1 }) },
          { id: "l_classReunion.skip", label: "Skip it", hint: "those weren't your years", act: "avoid", style: "safe", weight: 0.2, apply: () => ({ text: "You skipped your fiftieth high school reunion. Those weren't your years, and these are.", mood: 0 }) },
        ],
      };
    },
  },
  A("l_oldFriendTrip", [62, 90], 0.019, s => {
    const f = bestFriend(s), n = f ? f.call : "your oldest friend";
    return [
      `You and ${n} took the road trip you'd talked about since you were young, {stopping at every roadside attraction between here and the coast.|with the old songs on the radio and the windows down.|and argued about directions the whole way, just like old times.}`,
      `You flew out to see ${n}, {and the two of you stayed up past midnight on the back porch.|and it took about four minutes to feel like teenagers again.}`,
      `${cap(n)} came to visit for a week, and {you went to the old places in town that are still there.|you looked at old photos and laughed until you couldn't breathe.}`,
    ];
  }, { mood: 5, domain: "family", channel: "good", when: s => !!bestFriend(s) }),
  A("l_friendMoves", [65, 92], 0.016, [
    "Your neighbor of thirty years moved to {Arizona|Florida|be near the grandkids in Texas}, {and you text a photo of the old street every week.|and you helped pack the last boxes and cried in the driveway.|and the new neighbors are nice but not the same.}",
    "Your best friend from church moved {into a retirement community across the state|in with her daughter in Ohio}, {and you two talk on the phone every Sunday after service.|and you visit twice a year.}",
    "Your card group lost a player when {the Hendersons moved south|Marge moved closer to her kids}, {and you all chipped in for a going-away cake.|and you found a new fourth, who cheats.}",
  ], { mood: -1, domain: "family", channel: "change" }),

  // ---------- legacy ----------
  {
    id: "l_scrapbook", once: true, domain: "family", channel: "good", ages: [62, 95], p: () => 0.019,
    choice: (s, ctx) => {
      const lead = scene(ctx, ["The hall closet holds eleven shoeboxes of photos and a carousel of slides nobody has seen since 1978.", "Your daughter asked who all the people in the old photo albums are, and you realized you are the only one who knows.", "The basement has forty years of photos, half of them in envelopes from the drugstore."]);
      return {
        prompt: `${lead} What do you do with them?`,
        options: [
          { id: "l_scrapbook.scan", label: s.year >= 2005 ? "Scan everything" : "Make copies for everyone", hint: "a big job, done once", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => ({ text: c.w(s2.year >= 2005 ? "You scanned every family photo, one box a week, {and sent the whole family a link they actually opened.|and found a picture of your parents young and in love that you had never seen.}" : "You had copies made of the best family photos for each of the kids, {and labeled every one on the back.|and they called you crying.}"), mood: 4 }) },
          { id: "l_scrapbook.albums", label: "An album for each kid", hint: "their life, in order", act: "hobby", style: "family", weight: 0.25, apply: (s2, c) => ({ text: c.w("You made each of the kids an album of their own life, {from the hospital photo to the wedding,|with captions in your best handwriting,} {and gave them out at Christmas.|and the room went very quiet as they turned the pages.}"), mood: 5 }) },
          { id: "l_scrapbook.names", label: "Write the names on the back", hint: "before nobody remembers", act: "study", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w("You sat with the old photos and wrote on the back of every one: {who, where, what year, and what they were laughing at.|the names of great-aunts and second cousins nobody else would know.}"), mood: 3 }) },
          { id: "l_scrapbook.night", label: "Throw a slideshow night", hint: "the old projector still works", act: "socialize", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w("You dug out the old slide projector and had the family over for a slideshow night, {and the grandkids could not believe your hair.|and everyone shouted names and stories at the screen.}"), mood: 5 }) },
          { id: "l_scrapbook.later", label: "Leave them in the boxes for now", hint: "someday", act: "wait", style: "self", weight: 0.2, apply: () => ({ text: "You looked at the boxes of old photos, picked one out to put on the fridge, and closed the closet door for another year.", mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "l_memoir", once: true, domain: "study", channel: "good", ages: [65, 98], p: () => 0.026,
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        "Your grandkids keep asking about the old days, and you keep telling the same three stories.",
        s.year >= 2014 ? "The kids gave you a gift subscription: every week, an email with a question about your life, and at the end a book." : "The library is starting a memoir-writing class for seniors.",
        "You realized the only person who remembers your grandparents' farm is you.",
      ]);
      return {
        prompt: `${lead} Do you write your life down?`,
        options: [
          { id: "l_memoir.class", label: "Take a memoir class", hint: "the library, Tuesday mornings", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => { s2.flags.memoir = "book"; return { text: c.w("You took a memoir class at the library and wrote your life story, {one chapter a week,|with a teacher who made you cut every adjective,} and had copies bound for the whole family."), mood: 5, big: true }; } },
          { id: "l_memoir.weekly", label: s.year >= 2014 ? "Answer one question a week" : "Write one story a week", hint: "a little at a time", act: "talk", style: "family", weight: 0.25, apply: (s2, c) => { s2.flags.memoir = "stories"; return { text: c.w("Once a week for a year, you wrote down one story from your life, {starting with the house you grew up in,|starting with your first job,} and at the end it was a book the family keeps on the shelf."), mood: 5, big: true }; } },
          { id: "l_memoir.letters", label: "Write a letter to each grandchild", hint: "to open someday", act: "talk", style: "family", weight: 0.2, apply: (s2, c) => { s2.flags.memoir = "letters"; return { text: c.w("You wrote a letter to each grandchild, about {what you learned the hard way,|what you hope for them,} and sealed them in envelopes {marked “Open at 18.”|in the desk drawer.}"), mood: 4 }; } },
          { id: "l_memoir.record", label: s.year >= 2010 ? "Record videos of the stories" : "Record the stories on tape", hint: "your own voice", act: "talk", style: "social", weight: 0.15, apply: (s2, c) => { s2.flags.memoir = "recorded"; return { text: c.w(`${s2.year >= 2010 ? "A grandkid set up the phone" : "You set up a cassette recorder"}, and you told the old family stories {one evening a week|over a whole long weekend}, {laughing at the good parts and pausing at the hard ones.|in your own voice, for people not born yet.}`), mood: 4 }; } },
          { id: "l_memoir.no", label: "Not your thing", hint: "you'd rather live it", act: "avoid", style: "self", weight: 0.2, apply: () => ({ text: "You decided writing a memoir wasn't for you. You'd rather keep telling the stories out loud at dinner, a little better every time.", mood: 0 }) },
        ],
      };
    },
  },
  A("l_heirloom", [65, 105], 0.019, (s, ctx) => {
    const g = grands(s).filter(x => gAge(s, x) >= 14), kid = adultKids(s)[0];
    const to = g.length ? ctx.rng.pick(g).call : kid ? kid.call : "your niece";
    const thing = ctx.rng.pick(["your mother's wedding ring", "your father's pocket watch", "the cast-iron skillet that has cooked four generations of breakfasts", "the quilt your grandmother made", s.flags.served ? "your service medals in their case" : "the family Bible with everyone's birthdays in it", "the recipe box, grease stains and all"]);
    return [
      `You gave ${thing} to ${to}, {and told the whole story behind it.|and asked only that it keep getting passed down.|and watched ${to} hold it like it might break.}`,
      `On ${to}'s birthday you handed over ${thing}, {and you both pretended not to cry.|with a note explaining where it came from.}`,
      `You decided ${to} should have ${thing} now instead of someday, {so you could see ${to}'s face.|and it was the best present you ever gave.}`,
    ];
  }, { mood: 4, domain: "family", channel: "good", when: s => s.kids.length > 0 || grands(s).length > 0 }),
  A("l_dnaKit", [58, 98], 0.016, [
    "The kids gave you a DNA kit for Christmas, and the results said you are {twelve percent Scandinavian, which nobody can explain.|exactly what Grandma always said, to the decimal point.|part Irish, which you had suspected from your temper.}",
    "You spit in a tube, mailed it off, and {found a second cousin in Ohio who now sends you a Christmas card.|learned your family's story was a little different than you were told.|printed the pie chart and put it on the fridge.}",
    "Your DNA results came back and {a distant cousin messaged you about a family reunion in Kentucky.|you spent the next six months building a family tree online.|your brother refused to believe a word of it.}",
  ], { mood: 2, domain: "family", channel: "change", when: s => s.year >= 2012 }),
  A("l_recipeBook", [62, 98], 0.013, [
    "You typed up the family recipes, {including the ones that just said “bake until done,”|with notes in the margins about who liked what,} and {had them printed as a little book for everyone.|gave a copy to every grandkid who could hold a spoon.}",
    "You spent a winter writing down every family recipe, {the pierogi, the gumbo, the Christmas fudge,|the Sunday sauce and the funeral potatoes,} {before they were gone with you.|and tested each one twice, for science.}",
    "The family cookbook you made {has a stain on every page now, which is the point.|became the most-used book in five kitchens.}",
  ], { mood: 3, domain: "family", channel: "good" }),
  A("l_historyInterview", [55, 110], 0.065, (s, ctx) => {
    const g = ctx.rng.pick(grandsIn(s, 9, 17)), h = ctx.rng.pick(historyYouSaw(s));
    return [
      `${g.call} interviewed you for a school project about history, and you talked about ${h}. {${cap(they(g))} got an A, and you got a copy.|${cap(they(g))} looked at you like you had walked out of a textbook.}`,
      `For ${g.call}'s history class, you told ${them(g)} about ${h}, {and realized you are now somebody's primary source.|and ${they(g)} recorded every word on ${their(g)} phone.}`,
      `${g.call} asked what it was like to live through ${h}, {and you talked for an hour without looking at the clock.|and you found yourself remembering things you hadn't thought of in years.}`,
    ];
  }, { mood: 3, domain: "family", channel: "good", tags: ["children"], when: s => grandsIn(s, 9, 17).length > 0 }),
  {
    id: "l_will", once: true, domain: "wealth", channel: "change", ages: [60, 88], p: () => 0.026,
    choice: (s, ctx) => {
      const lead = scene(ctx, ["A friend's family spent two years untangling an estate with no will, and it scared you.", "Your lawyer, who is now younger than your kids, says you should really have a will.", "At the bank, a pamphlet about estate planning caught your eye: “Don't leave a mess.”"]);
      return {
        prompt: `${lead} How do you put your affairs in order?`,
        options: [
          { id: "l_will.lawyer", label: "A will and a trust, with a lawyer", hint: "done right", act: "save", style: "safe", weight: 0.3, apply: s2 => { s2.flags.will = "lawyer"; spend(s2, 0.05); return { text: "You sat down with a lawyer and wrote a will and a trust, named who gets what and who decides what, and slept better that night.", mood: 2 }; } },
          { id: "l_will.kit", label: s.year >= 2000 ? "Do it online" : "Use a will kit from the store", hint: "cheap and simple", act: "save", style: "self", weight: 0.15, apply: s2 => { s2.flags.will = "kit"; return { text: `You wrote your own will with ${s2.year >= 2000 ? "an online form" : "a kit from the office supply store"}, had two neighbors witness it, and put it in the freezer, where everyone would find it.`, mood: 1 }; } },
          { id: "l_will.talk", label: "Talk it through with the family", hint: "including what you want at the end", act: "talk", style: "family", weight: 0.25, apply: (s2, c) => { s2.flags.will = "talked"; return { text: c.w("You gathered the family and talked it through: the will, the house, {and what kind of care you'd want at the end, written in an advance directive.|and who should get Grandma's china, which caused more debate than the money.} It was a hard conversation and a kind one."), mood: 2 }; } },
          { id: "l_will.funeral", label: "Plan the whole thing, even the songs", hint: "nobody should have to guess", act: "save", style: "learn", weight: 0.1, apply: (s2, c) => { s2.flags.will = "planned"; spend(s2, 0.05); return { text: c.w("You made a will and planned your own funeral down to the hymns, {and gave the kids a folder labeled “When the Time Comes.”|and chose a song that would make everyone laugh at the end.}"), mood: 1 }; } },
          { id: "l_will.later", label: "Put it off", hint: "you've got time", act: "wait", style: "risk", weight: 0.2, apply: () => ({ text: "You meant to write a will and put it off again. It sat on the to-do list next to cleaning the gutters.", mood: 0 }) },
        ],
      };
    },
  },

  // ---------- learning something new ----------
  {
    id: "l_facetime", once: true, domain: "study", channel: "good", ages: [58, 105], when: s => s.year >= 2011 && (grands(s).length > 0 || adultKids(s).length > 0), p: () => 0.052,
    choice: (s, ctx) => {
      const call = videoCall(s.year), g = grands(s)[0], who = g ? g.call : adultKids(s)[0] ? adultKids(s)[0].call : "the family";
      return {
        prompt: `${cap(who)} wants to see you on ${call}, and the phone keeps showing you a close-up of your own ear. How do you learn it?`,
        options: [
          { id: "l_facetime.kid", label: "Have the family show you", hint: "for the fourth time", act: "seekHelp", style: "family", weight: 0.3, apply: (s2, c) => ({ text: c.w(`The family taught you ${call}, {four times, very patiently,|with a note taped to the tablet that says “green button”,} and now you see ${who} every Sunday, {mostly from the forehead up.|and you know how to unmute yourself, usually.}`), mood: 4 }) },
          { id: "l_facetime.class", label: "Take the class at the library", hint: "seniors and tablets", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You took a tech class for seniors at the library, {where a teenager with a lot of patience|where a retired engineer} taught you ${call}, and {you went home and called ${who} right away.|you started teaching your friends.}`), mood: 4 }) },
          { id: "l_facetime.self", label: "Figure it out yourself", hint: "how hard can it be", act: "study", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You figured out ${call} yourself, {after a week of calling the wrong people at the wrong time.|after holding the phone to your ear during your first video call.} Now you call ${who} so often they joke about it.`), mood: 3 }) },
          { id: "l_facetime.tablet", label: "Let them send you a tablet set up for you", hint: "one button", act: "seekHelp", style: "safe", weight: 0.15, apply: (s2, c) => ({ text: c.w(`The family sent you a tablet already set up with ${who}'s face on one big button, {and it became your favorite thing in the house.|and you started reading the news on it too.}`), mood: 4 }) },
          { id: "l_facetime.phone", label: "Stick with the phone", hint: "voices are enough", act: "wait", style: "self", weight: 0.15, apply: () => ({ text: `You decided you didn't need to see anybody's face on a screen; you called ${who} on the regular phone, every Sunday, as always.`, mood: 0 }) },
        ],
      };
    },
  },
  A("l_smartphone", [60, 98], 0.052, [
    "You got your first smartphone {and set the font so big that four words fit on the screen.|and discovered you could talk to it, which you did, politely.|and the grandkids put a picture of themselves as the background.}",
    "With your first smartphone you {texted by voice and said “period” out loud at the end of every sentence.|sent your whole family a photo of your thumb.|figured out the flashlight and felt like a genius.}",
    "Your new smartphone {buzzed with forty messages from the family group chat in one afternoon.|took you a month to learn, and now you can't put it down.}",
  ], { mood: 2, domain: "study", channel: "good", when: s => s.year >= 2011 && s.year <= 2030 }),
  A("l_facebook", [56, 98], 0.046, [
    "You joined Facebook and {commented on every one of your grandkids' posts, signed “Love, Grandma.”|found your best friend from third grade in about ten minutes.|typed a search into your status by mistake, which the whole family saw.}",
    "On Facebook you {found three old classmates and a cousin you had lost touch with.|learned to share photos of your garden, and your tomatoes got eighty likes.|shared a joke that turned out to be twenty years old.}",
    "Your kids were not thrilled when you joined Facebook, {because you comment on everything.|and especially when you friended their college roommates.}",
  ], { mood: 2, domain: "study", channel: "good", when: s => s.year >= 2009 && s.year <= 2022 }),
  A("l_scamSaved", [64, 105], 0.016, s => [
    `A caller said, “${gName(s)}, it's me, I'm in trouble and I need bail money,” {and you hung up and called your grandkid, who was at soccer practice.|and you asked what the dog's name was, and they hung up.}`,
    "A pop-up on the computer said your computer had a virus and to call a number, {and you unplugged the whole thing and called your son instead.|and you knew better, because you had just read about it in the AARP magazine.}",
    "A man on the phone said he was from Medicare and needed your number, {and you told him Medicare doesn't call, and hung up proud.|and you reported him to the police, who thanked you.}",
  ], { mood: 2, domain: "wealth", channel: "good", when: s => s.year >= 2005 }),
  {
    id: "l_classes", once: true, domain: "study", channel: "good", ages: [62, 92], p: () => 0.026,
    choice: (s, ctx) => {
      return {
        prompt: `${scene(ctx, ["You've always meant to learn something just for the joy of it, and now there's time.", "The senior center's new catalog of classes came in the mail, with a lot of things circled by you.", "A friend dared you to learn something new this year."])} What do you take up?`,
        options: [
          { id: "l_classes.language", label: s.year >= 2013 ? "A language, with an app" : "A language, with tapes", hint: "for the big trip", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => ({ text: c.w(s2.year >= 2013 ? "You started learning {Spanish|Italian|French} on an app and kept a streak going for {three hundred days|over a year}, {and the owl reminders became part of your morning.|and finally ordered dinner in it on a trip.}" : "You learned {Spanish|Italian|French} from tapes in the car, {repeating phrases at red lights.|and practiced on the waiter at the one Italian place in town.}"), mood: 4 }) },
          { id: "l_classes.art", label: "Painting", hint: "watercolors at the senior center", act: "hobby", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w("You took a painting class and discovered you were {not bad at all.|terrible, and loved it anyway.} {Your watercolor of a barn now hangs in your daughter's hallway.|You give paintings as Christmas presents now, whether people want them or not.}"), mood: 4 }) },
          { id: "l_classes.college", label: "Audit a college course", hint: "free for seniors in many states", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => ({ text: c.w("You audited a college course on {astronomy|American history|Shakespeare}, {and sat in the front row while the kids slept in the back.|and the professor asked you to share what you remembered about the era.}"), mood: 4 }) },
          { id: "l_classes.music", label: "Music lessons, finally", hint: "the piano you always wanted", act: "hobby", style: "learn", weight: 0.2, apply: (s2, c) => ({ text: c.w(`At ${s2.age} you started {piano|guitar|ukulele} lessons, {and your first recital was alongside a row of eight-year-olds.|and played “Happy Birthday” for the whole family at Thanksgiving.}`), mood: 5 }) },
          { id: "l_classes.cook", label: "A cooking class", hint: "something that isn't meatloaf", act: "hobby", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w("You took a cooking class and learned {Thai food|to make fresh pasta|French sauces}, {which the family now requests by name.|and set off the smoke alarm only once.}"), mood: 4 }) },
        ],
      };
    },
  },
  A("l_newGadget", [62, 110], 0.019, [
    "Your grandkids set up a new gadget in your house that {talks back, which you find rude but useful.|reminds you of your appointments in a cheerful voice.|turns on the lights when you ask nicely.}",
    "You asked the voice assistant on your phone {for a pot roast recipe and argued with it about the onions.|to call your daughter, and it called your dentist.|what the weather was, and then told it thank you, out of habit.}",
    "The family bought you {a new kind of TV that needs three remotes|a doorbell with a camera, and now you watch the mail carrier like a nature show|a robot vacuum, which you named and talk to}.",
  ], { mood: 2, domain: "study", channel: "good", when: s => s.year >= 2016 }),

  // ---------- purpose ----------
  {
    id: "l_volunteer", once: true, domain: "family", channel: "good", ages: [60, 90], p: () => 0.026,
    choice: (s, ctx) => {
      const set = (as, text, mood = 4) => (s2, c) => { s2.flags.volunteerAs = as; return { text: c.w(text), mood }; };
      return {
        prompt: `${scene(ctx, ["The church bulletin says they need volunteers, in big bold letters.", "You have time, a car and a lifetime of know-how, and you want it to go somewhere.", "A friend volunteers three days a week and says it's the best part of her life."])} Where do you sign up?`,
        options: [
          { id: "l_volunteer.meals", label: "Deliver Meals on Wheels", hint: "hot lunch and a hello", act: "volunteer", style: "social", weight: 0.25, apply: set("meals", "You started delivering Meals on Wheels {on Mondays and Thursdays,|twice a week,} {and for some people on your route you were the only visitor they had all week.|and Mr. Alvarez always had a joke ready at the door.}") },
          { id: "l_volunteer.read", label: "Read with kids at the elementary school", hint: "a reading buddy", act: "volunteer", style: "family", weight: 0.2, apply: set("reading", "You became a reading buddy at the elementary school, {and a shy second-grader read a whole chapter book to you by spring.|and the kids called you by your first name, which you allowed.}", 5) },
          { id: "l_volunteer.taxes", label: "Help people with their taxes", hint: "free tax help every spring", act: "volunteer", style: "learn", weight: 0.15, apply: set("taxes", "Every spring you volunteered at the free tax-help table at the library, {and got a family a refund that paid for a car repair.|and became the person everyone's mother told them to see.}") },
          { id: "l_volunteer.nicu", label: "Rock the babies in the hospital", hint: "the newborn unit needs cuddlers", act: "volunteer", style: "health", weight: 0.15, apply: set("cuddler", "You became a volunteer baby cuddler in the hospital's newborn unit, {rocking tiny babies whose parents couldn't be there that night.|and it was the most peaceful four hours of your week.}", 5) },
          { id: "l_volunteer.build", label: "Build houses", hint: "a hammer and a hard hat", act: "volunteer", style: "risk", weight: 0.1, apply: set("builder", "You signed up to build houses with a volunteer crew {and hung drywall alongside college kids half your age.|and were at the dedication when the family got their keys.}") },
          { id: "l_volunteer.polls", label: "Work the polls on Election Day", hint: "a long day for democracy", act: "volunteer", style: "safe", weight: 0.15, apply: set("polls", "You signed up as a poll worker, {and spent a fourteen-hour Election Day handing out “I Voted” stickers.|and helped a first-time voter who was so nervous, and so proud.}", 3) },
        ],
      };
    },
  },
  {
    id: "l_faith", once: true, domain: "family", channel: "change", ages: [60, 95], p: () => 0.026,
    choice: (s, ctx) => {
      const f = faithOf(s, ctx), where = { christian: "church", jewish: "synagogue", muslim: "mosque", hindu: "temple" }[f] || null;
      const study = { christian: "a Bible study", jewish: "a Torah study group", muslim: "a Quran study circle", hindu: "a scripture study group" }[f] || "a philosophy discussion group";
      const lead = where ? scene(ctx, [`The ${where} is asking for help, and someone mentioned your name.`, `You have more time for the ${where} now, and you keep thinking about what it means to you.`, `After a hard year, you found yourself sitting in the ${where} on a weekday, just thinking.`]) : scene(ctx, ["A friend keeps inviting you to her church, just for the coffee hour.", "With more time on your hands, you've been thinking about the big questions."]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "l_faith.serve", label: where ? `Take on a role at the ${where}` : "Join a community group", hint: "a committee, a role, a key", act: "spiritual", style: "social", weight: 0.25, apply: (s2, c) => { s2.flags.faithLater = "serve"; return { text: c.w(where ? `You took on a role at the ${where}, {running the food pantry,|greeting people at the door,|on the committee nobody else wanted,} and {it gave your week a center.|you were there more than at home some weeks.}` : "You joined a community service group that meets every Thursday, and it gave your week a center."), mood: 4 }; } },
          { id: "l_faith.choir", label: "Join the choir", hint: "you can't sing, and that's fine", act: "hobby", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You joined the ${where ? `${where} choir` : "community choir"}, {and were seated next to the loudest alto in the county.|and sang the holiday concert with your whole family in the third row.}`), mood: 4 }) },
          { id: "l_faith.study", label: `Join ${study}`, hint: "the old questions, out loud", act: "spiritual", style: "learn", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You joined ${study} that meets {Wednesday mornings|Sunday evenings}, {and the arguments over coffee were the best part.|and it made you think harder than you had in years.}`), mood: 3 }) },
          { id: "l_faith.return", label: where ? "Go back more often" : "Try a service or two", hint: "after years away", act: "spiritual", style: "family", weight: 0.15, apply: (s2, c) => { s2.flags.faithLater = "return"; return { text: c.w(where ? `You started going back to the ${where} after years away, {and an old friend saved you a seat.|and it felt like coming home.}` : "You tried a service or two at your friend's church, {and liked the coffee hour best.|and found it more peaceful than you expected.}"), mood: 3 }; } },
          { id: "l_faith.private", label: "Keep it private", hint: "your faith, your way", act: "rest", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w("You kept your beliefs your own, {with a quiet walk every morning that felt like prayer.|and a few words of gratitude each night.}"), mood: 1 }) },
        ],
      };
    },
  },
  A("l_seniorCenter", [64, 100], 0.019, [
    "You started going to the senior center, {where lunch is three dollars and the gossip is free.|where the chair yoga instructor is eighty-eight and tougher than any drill sergeant.|where bingo on Wednesdays is a blood sport.}",
    "At the senior center {you joined a line-dancing class and learned the Electric Slide properly at last.|you started a woodworking club in the basement.|you met a group who goes on a bus trip somewhere every month.}",
    "The senior center {put you in charge of the coffee, a position of great power.|gave you a ride to the doctor when your car was in the shop.|asked you to teach a class on what you used to do for a living.}",
  ], { mood: 3, domain: "family", channel: "good", when: usHome }),
  {
    id: "l_pickleball", once: true, domain: "health", channel: "good", ages: [55, 85], when: s => s.year >= 2013 && usHome(s), p: () => 0.019,
    choice: (s, ctx) => {
      return {
        prompt: `${scene(ctx, ["Your neighbor won't stop talking about pickleball.", "The tennis courts at the park have been painted over with pickleball lines, and they're full at seven in the morning.", "The grandkids say pickleball is cool now, which you find hard to believe."])} Do you play?`,
        options: [
          { id: "l_pickleball.league", label: "Join the morning league", hint: "four mornings a week", act: "exercise", style: "health", weight: 0.3, apply: (s2, c) => { s2.flags.pickleball = true; hr(s2, 0.99); return { text: c.w("You joined the morning pickleball league, {and now you play four mornings a week and talk about your dink shot to anyone.|and made a dozen new friends who all have opinions about paddles.}"), mood: 5 }; } },
          { id: "l_pickleball.tournament", label: "Go all in, enter a tournament", hint: "glory", act: "exercise", style: "risk", weight: 0.15, apply: (s2, c) => { s2.flags.pickleball = true; hr(s2, 0.99); return { text: c.w(c.rng() < 0.4 ? "You took up pickleball and entered a senior tournament, and you won a medal in your age group, which hangs on the fridge." : "You took up pickleball and entered a senior tournament, {and lost in the first round to a 79-year-old with a vicious serve.|and went home with a sore knee and a lot of new friends.}"), mood: 4 }; } },
          { id: "l_pickleball.grandkids", label: "Play with the grandkids", hint: "they think it's cool", act: "exercise", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w("You took up pickleball with the grandkids {in the driveway with a portable net,|at the park on Saturdays,} and {beat them, which they did not see coming.|they let you win, which you noticed.}"), mood: 5 }) },
          { id: "l_pickleball.tennis", label: "Stick with tennis", hint: "the real thing", act: "exercise", style: "self", weight: 0.15, apply: () => ({ text: "You refused to take up pickleball on principle and kept playing tennis, on the two courts the park left for people like you.", mood: 1 }) },
          { id: "l_pickleball.no", label: "Watch from a bench", hint: "your knees vote no", act: "avoid", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w("You passed on pickleball and watched from a bench with a coffee, {heckling your friends lovingly.|keeping score better than the players.|and the pock-pock-pock of the paddles became the sound of your mornings.}"), mood: 1 }) },
        ],
      };
    },
  },
  A("l_mentor", [60, 85], 0.013, s => {
    const job = s.job && s.job.title ? s.job.title : "your old trade";
    return [
      `You started mentoring a young person just starting out as ${/^[aeiou]/i.test(job) ? "an" : "a"} ${job}, {and you met for coffee once a month.|and they called you before every big decision.|and you saw yourself at that age, nervous and trying hard.}`,
      `A kid from the neighborhood asked how you got started, and {you ended up teaching ${s.sex === "male" ? "him" : "her"} everything you knew.|you ended up writing a reference letter that got them the job.}`,
      "Through a program for retirees, you mentored a young business owner, {and her shop is still open on Main Street.|and you learned more about the internet than you taught about business.}",
    ];
  }, { mood: 3, domain: "career", channel: "good" }),

  // ---------- the body at this age ----------
  {
    id: "l_hearing", once: true, domain: "health", channel: "bad", ages: [62, 98], p: s => 0.04 + (s.age >= 75 ? 0.03 : 0),
    choice: (s, ctx) => {
      const who = married(s) ? pName(s) : s.kids.length ? "the kids" : "your friends";
      return {
        prompt: `You keep asking people to repeat themselves, and ${who} say the TV is loud enough to hear from the driveway. What do you do?`,
        options: [
          { id: "l_hearing.aids", label: "See an audiologist", hint: "proper hearing aids", act: "seeDoctor", style: "health", weight: 0.35, apply: (s2, c) => { s2.flags.hearingAids = true; spend(s2, 0.08); hr(s2, 0.99); return { text: c.w("You got fitted for hearing aids and {heard birds in the backyard you hadn't heard in years.|realized the refrigerator hums.|could finally follow the conversation at the dinner table, which was mostly about you.}"), mood: 3 }; } },
          { id: "l_hearing.otc", label: s.year >= 2023 ? "Buy hearing aids at the drugstore" : "Try a cheap amplifier", hint: "quick and affordable", act: "seeDoctor", style: "safe", weight: 0.2, apply: (s2, c) => { s2.flags.hearingAids = true; spend(s2, 0.02); return { text: c.w(s2.year >= 2023 ? "You bought hearing aids off the shelf at the drugstore, {and set them up with the help of an app and a grandkid.|and they worked well enough that you stopped saying “What?”}" : "You tried an inexpensive hearing amplifier, {and it whistled at the worst moments.|and it helped, mostly, in quiet rooms.}"), mood: 2 }; } },
          { id: "l_hearing.captions", label: "Turn on the captions", hint: "problem solved, sort of", act: "wait", style: "self", weight: 0.2, apply: () => ({ text: "You turned the captions on the TV and decided that was enough for now. You read your shows now.", mood: 0 }) },
          { id: "l_hearing.ignore", label: "Everyone just mumbles", hint: "it's them, not you", act: "avoid", style: "risk", weight: 0.25, apply: (s2, c) => { hr(s2, 1.01); return { text: c.w(`You decided the problem was that everyone mumbles, {and ${who} started writing things down for you, a little pointedly.|and you nodded through a lot of conversations.}`), mood: -1 }; } },
        ],
      };
    },
  },
  A("l_cataract", [64, 98], 0.019, [
    "You had cataract surgery, and afterward {colors were so bright you thought someone had repainted the house.|you noticed the kitchen was dirtier than you had thought.|you could read road signs again and stopped pretending you could.}",
    "The eye doctor fixed your cataracts {one eye at a time,|in a surgery that took fifteen minutes,} and {you wore the giant dark glasses home like a rock star.|the world came back into focus.}",
    "After cataract surgery, {you saw every wrinkle in the mirror, which was a mixed blessing.|you went back to reading the paper without a magnifying glass.}",
  ], { mood: 2, domain: "health", channel: "good" }),
  {
    id: "l_knee", once: true, domain: "health", channel: "bad", ages: [60, 90], p: () => 0.026,
    choice: (s, ctx) => {
      const joint = ctx.rng.pick(["knee", "knee", "hip"]);
      return {
        prompt: `Your ${joint} has been complaining for years, and now the stairs are a negotiation. The orthopedist says you have options. What do you do?`,
        options: [
          { id: "l_knee.replace", label: `Get the ${joint} replaced`, hint: "a rough recovery, then a new one", act: "seeDoctor", style: "health", weight: 0.3, apply: (s2, c) => { hr(s2, 0.99); return { text: c.w(`You had your ${joint} replaced, {did your physical therapy like a religion,|complained through six weeks of physical therapy,} and {were walking the dog farther than before by summer.|set off the airport metal detector for the rest of your life.}`), mood: 3 }; } },
          { id: "l_knee.pt", label: "Physical therapy first", hint: "strengthen around it", act: "exercise", style: "safe", weight: 0.25, apply: (s2, c) => { hr(s2, 0.99); return { text: c.w(`You tried physical therapy for your ${joint} first, {and the exercises with the rubber bands actually worked.|and it bought you a few more good years.}`), mood: 2 }; } },
          { id: "l_knee.water", label: "Water aerobics", hint: "the pool takes the weight", act: "exercise", style: "social", weight: 0.15, apply: (s2, c) => { hr(s2, 0.99); return { text: c.w(`For your ${joint}, you joined water aerobics at the Y, {where the class sings along to Motown.|and the pool took the weight off and put some friends on.}`), mood: 3 }; } },
          { id: "l_knee.shots", label: "Shots and a cane", hint: "manage it", act: "seeDoctor", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w(`You managed your ${joint} with a shot every few months and {a cane with a carved handle.|a cane the grandkids decorated with stickers.}`), mood: 0 }) },
          { id: "l_knee.push", label: "Push through it", hint: "you've had worse", act: "pushThrough", style: "risk", weight: 0.15, apply: s2 => { hr(s2, 1.01); return { text: `You pushed through the bad ${joint} and kept going, slower on the stairs and stubborn about it.`, mood: -1 }; } },
        ],
      };
    },
  },
  {
    id: "l_carKeys", once: true, domain: "move", channel: "change", ages: [78, 102], when: s => usHome(s) && s.flags.carKeys === undefined, p: s => 0.06 + (s.age >= 85 ? 0.06 : 0),
    choice: (s, ctx) => {
      const k = adultKids(s, 30)[0];
      const lead = scene(ctx, [
        "You clipped the mailbox backing out, and it wasn't the first time.",
        k ? `${k.call} sat you down for a talk about your driving, and you could tell ${they(k)} had rehearsed it.` : "Your doctor asked, carefully, how the driving is going.",
        "Driving at night has gotten hard: the headlights look like starbursts.",
      ]);
      return {
        prompt: `${lead} What do you do about the car?`,
        options: [
          { id: "l_carKeys.give", label: "Hand over the keys", hint: "it's time", act: "wait", style: "family", weight: 0.25, apply: s2 => { s2.flags.carKeys = s2.age; return { text: "You handed over the car keys. It was harder than retiring, and the family took turns driving you everywhere, which you secretly enjoyed.", mood: -2, big: true }; } },
          { id: "l_carKeys.daytime", label: "Daytime and local only", hint: "no highways, no night", act: "wait", style: "safe", weight: 0.3, apply: () => ({ text: "You stopped driving at night and on the highway and kept your car for the grocery store, the church and the doctor.", mood: 0 }) },
          { id: "l_carKeys.course", label: "Take a driving refresher course", hint: "prove it", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w("You took a senior driving refresher course {and passed with flying colors.|and learned you'd been doing a few things wrong for sixty years.} Your insurance went down, too."), mood: 2 }) },
          { id: "l_carKeys.rides", label: s.year >= 2014 ? "Use a rideshare app and the senior van" : "Use the senior van and taxis", hint: "someone else drives", act: "seekHelp", style: "social", weight: 0.15, apply: (s2, c) => { s2.flags.carKeys = s2.age; return { text: c.w(s2.year >= 2014 ? "You sold the car and started taking rideshares and the senior van, {and you now know half the drivers in town by name.|and the money from the car paid for a year of rides.}" : "You sold the car and used the senior center's van and the town's taxi, {and the drivers all knew you by name.|and it was cheaper than insurance anyway.}"), mood: 0 }; } },
          { id: "l_carKeys.keep", label: "Keep driving", hint: "nobody takes your keys", act: "insist", style: "risk", weight: 0.15, apply: () => ({ text: "You told everyone you were perfectly fine to drive, and kept your keys. The family worried; you drove slower and very carefully.", mood: 0 }) },
        ],
      };
    },
  },
  A("l_mallWalk", [62, 95], 0.016, s => [
    s.year < 2015 ? "You joined the mall walkers who do laps before the stores open, {three miles past the dark shop windows every morning.|and stop for coffee at the food court after.}" : "You joined a walking group that meets at the track at seven, {three laps and a lot of talking.|rain or shine, mostly shine.}",
    "You started tai chi in the park with a group of early risers, {and your balance got better than it was at fifty.|and the slow moves made the morning feel long in a good way.}",
    "You took up water aerobics at the Y, {with a class that sings along to the oldies.|and your knees thanked you.|and the instructor, who is twenty-two, calls everybody “my friends.”}",
  ], { mood: 3, domain: "health", channel: "good", fx: s => hr(s, 0.99) }),
];
