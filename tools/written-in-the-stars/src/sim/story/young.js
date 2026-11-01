// Young adulthood, 18–30: a dorm room and a roommate with opinions, rush week, a major, a semester abroad, spring
// break, finals, a campus job and the financial aid letter; trade school and an apprenticeship; a deployment and
// coming home; a gap year; a first apartment, a first lease, a first credit card and a first car payment; dating by
// personal ad, website or app, friends' weddings, meeting the parents, moving in together; a first boss, a raise, a
// job in another city, the quarter-life wobble and a first therapist; road trips, a passport, a dog, a hobby, and
// friends who drift.
//
// The probabilities are assumptions (no statistics exist for these events), mostly 0.04–0.3 a year with once / max /
// cooldown, so the years from 18 to 30 hold a dozen or so stories, six to eight of them choices once the core's big
// decisions are asked. Nothing here changes schooling, s.rel, births, home ownership or retirement (core.js has those,
// calibrated); a job may be quit or changed and health stress nudged, and small debts come and go with era-sized
// numbers (student loans, a car loan, a credit card).
//
// Left for later modules:
//   s.flags.collegeMajor  "biology", "English"… (core.js graduateUni reads it for medical school)
//   s.flags.greek         true after rush            s.flags.semesterAbroad  the city of a semester abroad
//   s.flags.campusJob     the college job            s.flags.internship      the summer internship
//   s.flags.firstPlace    { age, kind: "studio" | "roommates" | "partner" | "room" | "home" }
//   s.flags.livingTogether the age you moved in with a partner (s.rel does not change)
//   s.flags.card          "paid" | "minimum" | "emergency" | "none" | "spree"   s.flags.carLoan  { car, age, how }
//   s.flags.retirementPlan "match" | "max" | "ira" | "none" | "asked"         s.flags.insurance "plan" | "none" | "job" | "clinic"
//   s.flags.pet           { kind, name, noun, since } (the shape child.js uses), when a new pet joins
//   s.flags.hobby         running, music, league, craft, games, climbing      s.flags.therapy  the age of a first therapist
//   s.flags.deployed      { where, age }             s.flags.union  { since, role } (an apprentice's union card; work.js too)
import {
  scene, cap, an, they, them, their, sibName, olderSibs, bornSibs, parentWord, bestFriend, makeFriend, homeMoney,
  carOf, chatOf, stateOf, stateCode, stateName, inStates, snowy, hasDegree,
} from "./common.js";
import { moveTo, startJob, otherJob } from "../world.js";
import { inService } from "./core.js";

// ---------- helpers ----------
const interp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return pts[pts.length - 1][1];
};
// Consumer prices relative to 2020 (BLS CPI-U, annual averages, rounded), to put a 2020 price into another year's
// dollars for a sentence.
const CPI = [[1950, 0.093], [1960, 0.114], [1965, 0.122], [1970, 0.15], [1975, 0.207], [1980, 0.317], [1985, 0.415], [1990, 0.504], [1995, 0.585], [2000, 0.665], [2005, 0.737], [2010, 0.843], [2015, 0.916], [2020, 1], [2022, 1.15], [2024, 1.21], [2030, 1.38]];
const nice = v => (v >= 10000 ? Math.round(v / 1000) * 1000 : v >= 1000 ? Math.round(v / 100) * 100 : v >= 100 ? Math.round(v / 10) * 10 : Math.max(1, Math.round(v)));
// "$1,150": a 2020 price in the dollars of `year`.
export const usd = (year, x2020) => `$${nice(x2020 * interp(CPI, year)).toLocaleString("en-US")}`;
// A one-bedroom's monthly rent (Census median gross rent, roughly: $108 in 1970, $447 in 1990, $855 in 2010).
export const rentOf = year => `$${(Math.round(interp([[1950, 45], [1960, 70], [1970, 110], [1980, 245], [1990, 450], [2000, 600], [2010, 850], [2015, 950], [2020, 1150], [2024, 1450], [2030, 1700]], year) / 25) * 25).toLocaleString("en-US")}`;
// The average student debt of a borrower at graduation (College Board and NCES figures, roughly).
export const loanOf = year => `$${nice(interp([[1960, 1500], [1975, 2500], [1985, 7000], [1993, 10000], [2000, 17000], [2005, 19000], [2010, 25000], [2015, 30000], [2020, 29000], [2030, 32000]], year)).toLocaleString("en-US")}`;
// A place moveTo() returned, as words ("Denver, Colorado" or the state).
const placeWords = x => (/,/.test(String(x || "")) ? String(x) : stateName(stateCode(x)) || String(x || "a new city"));
const here = s => stateName(stateOf(s)) || "your hometown";
const atHome = s => !s.abroad;
// The trade from core.js (s.flags.trade: "electrician", "welding", "HVAC"…) as a noun for a sentence, and whether it
// is a building or mechanical trade (job sites, apprenticeships) rather than a salon or a clinic.
const TRADE_WORD = { electrician: "electrical work", "auto mechanics": "auto repair", "practical nursing": "practical nursing", "dental assisting": "dental assisting" };
const tradeWord = t => TRADE_WORD[t] || t || "your trade";
const BUILD_TRADES = ["electrician", "welding", "HVAC", "plumbing", "auto mechanics"];
// At a four-year college now, and which year of it: 0 freshman, 1 sophomore, 2 junior, 3 senior.
const inUni = s => s.studying && !s.abroad && s.track === "college";
const uniYear = s => s.age - (s.flags.uniAt ?? s.age);
const inCC = s => s.studying && !s.abroad && s.track === "community";
const inTrade = s => s.studying && !s.abroad && s.track === "trade";
const inGrad = s => s.studying && !s.abroad && ["grad", "law", "med", "phd"].includes(s.track);
const atCollege = s => inUni(s) || inCC(s);
// Out of school and on your own: not studying, not in uniform, in the States.
const grownUp = s => !s.studying && !s.abroad && !inService(s);
const working = s => s.employed && s.job && s.job.field !== "military" && !s.retired;
const single = s => s.rel === "single" || s.rel === "divorced" || s.rel === "widowed";
const dating = s => s.rel === "dating" && !!s.partner;
// "they", "she" or "he" for a parentWord() answer ("your parents", "Mom", "Dad", "Grandma").
const pro = who => (who === "your parents" ? "they" : who === "Dad" ? "he" : "she");
const debt = (s, x) => { s.debt = Math.max(0, (s.debt || 0) + x); };
const spend = (s, x) => { s.savings = Math.max(0, s.savings - x); };
const stress = (s, x) => { s.health.stress = Math.max(0, Math.min(1, (s.health.stress ?? 0.3) + x)); };
// A plain event: its lines (templates, or a function of s and ctx giving them), its mood, and the usual fields.
function A(id, ages, p, lines, { mood = 2, ...more } = {}) {
  return { id, ages, once: true, ...more, p: typeof p === "function" ? p : () => p, apply: (s, ctx) => ({ text: ctx.w(typeof lines === "function" ? lines(s, ctx) : lines), mood: typeof mood === "function" ? mood(s) : mood }) };
}
// The phone in your pocket, or on the wall, by year.
export const phoneOf = y => (y < 1990 ? "the phone on the kitchen wall" : y < 2000 ? "your pager" : y < 2008 ? "your flip phone" : "your phone");
// How people looked for dates, by year.
function datingWay(y, ctx) {
  if (y < 1965) return { tool: "the young adults' group at church", how: "went to the Sunday socials", noun: "social" };
  if (y < 1980) return ctx.rng.pick([{ tool: "a computer dating questionnaire", how: "filled out the questionnaire and mailed it in", noun: "match" }, { tool: "the singles bar downtown", how: "went to the singles bar on Thursdays", noun: "night out" }]);
  if (y < 1995) return ctx.rng.pick([{ tool: "a personal ad in the alt-weekly", how: "placed a personal ad in the alt-weekly", noun: "reply" }, { tool: "a video dating service", how: "recorded a video for the dating service", noun: "match" }]);
  if (y < 2004) return ctx.rng.pick([{ tool: "Match.com", how: "made a Match.com profile", noun: "match" }, { tool: "AOL personals", how: "posted on AOL personals", noun: "message" }]);
  if (y < 2012) return ctx.rng.pick([{ tool: "OkCupid", how: "answered three hundred OkCupid questions", noun: "match" }, { tool: "eHarmony", how: "took the eHarmony personality test", noun: "match" }]);
  return ctx.rng.pick([{ tool: "Tinder", how: "downloaded Tinder", noun: "match" }, { tool: "Hinge", how: "made a Hinge profile", noun: "match" }, { tool: "Bumble", how: "downloaded Bumble", noun: "match" }]);
}
// A music festival of the era, for a road trip.
const festivalOf = y => (y < 1967 ? "the Newport Folk Festival" : y < 1970 ? "Woodstock" : y < 1985 ? "a three-day outdoor rock festival" : y < 1991 ? "a stadium show three states away" : y < 1999 ? "Lollapalooza" : y < 2002 ? "Coachella" : y < 2010 ? "Bonnaroo" : y < 2020 ? "Coachella" : "a music festival in the desert");
// Where spring break went.
const springSpot = (s, ctx) => (s.year < 1965 ? "Fort Lauderdale" : s.year < 1986 ? ctx.rng.pick(["Fort Lauderdale", "Daytona Beach"]) : s.year < 1996 ? ctx.rng.pick(["Daytona Beach", "South Padre Island", "Panama City Beach"]) : ctx.rng.pick(["Cancún", "Panama City Beach", "South Padre Island", "Miami"]));
// A big city to move to for work.
const BIG = [["NY", 3], ["CA", 3], ["IL", 1.5], ["TX", 2], ["DC", 1], ["MA", 1], ["WA", 1], ["GA", 1], ["CO", 0.8], ["NC", 0.8]];
const PET = {
  dog: { noun: "dog", names: y => (y >= 2005 ? ["Luna", "Cooper", "Biscuit", "Murphy", "Bear", "Penny", "Moose", "Daisy"] : ["Max", "Buster", "Sadie", "Duke", "Rusty", "Lady", "Bear", "Daisy"]) },
  cat: { noun: "cat", names: y => (y >= 2005 ? ["Mochi", "Olive", "Jasper", "Pickles", "Cleo", "Milo"] : ["Smokey", "Tiger", "Mittens", "Oliver", "Boots", "Cleo"]) },
};

export const YOUNG = [
  // ---------- college ----------
  {
    id: "y_roommate", once: true, ages: [17, 24], when: s => inUni(s) && uniYear(s) <= 1, p: () => 0.3,
    choice: (s, ctx) => {
      const y = s.year, album = y < 1968 ? "the same Kingston Trio record" : y < 1976 ? "Led Zeppelin IV" : y < 1985 ? "the same Journey album" : y < 1995 ? "the same Pearl Jam CD" : y < 2005 ? "Dave Matthews Band" : y < 2015 ? "the same Drake mixtape" : "the same three viral songs";
      const from = ctx.rng.pick(["Lagos", "Seoul", "rural Montana", "the Bronx", "a town of four hundred people in Nebraska", "Mumbai", "suburban Phoenix"]);
      const [lead, then] = scene(ctx, [
        [`Your freshman roommate plays ${album} on a loop and thinks two in the morning is early.`, "With a roommate who thought two in the morning was early,"],
        [`Your freshman roommate grew up in ${from}, and neither of you has ever lived with a stranger before.`, `Sharing a cinderblock room with a stranger from ${from},`],
        ["Your roommate's significant other has more or less moved into your dorm room, toothbrush and all.", "With a third person living in your two-person room,"],
        ["Your roommate is up at five for crew practice, asleep by nine, and alarmed by your existence.", "With a roommate on a crew team's schedule,"],
        y >= 2008 ? ["You and your assigned roommate followed each other online all summer, and in person you have nothing to say.", "After a summer of following each other online and an awkward first week,"] : null,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you make it work?"])}`,
        options: [
          { id: "y_roommate.rules", label: "Write up a roommate agreement", hint: "quiet hours, guests, the mini fridge", act: "negotiate", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${then} you sat down and wrote a roommate agreement on notebook paper{, taped it to the closet door, and both of you mostly kept it.|: quiet hours, guest rules and who owned which shelf of the mini fridge.|, and the RA said it was the most thorough one she had ever seen.}`), mood: 2 }) },
          { id: "y_roommate.friends", label: "Decide to be friends", hint: "you're stuck together anyway", act: "socialize", style: "social", weight: 0.25, apply: (s2, c) => { makeFriend(s2, c, "college", 0.7); return { text: c.w(`${then} you decided to make it work, and ended up {talking until three in the morning about everything|eating every dinner together in the dining hall|splitting a pizza every Thursday}. {You still text each other on birthdays.|It was the first friendship you ever chose all by yourself.}`), mood: 4 }; } },
          { id: "y_roommate.swap", label: "Ask the RA for a room swap", hint: "a clean start", act: "seekHelp", style: "self", weight: 0.12, apply: (s2, c) => ({ text: c.w(`${then} you asked the RA for a room swap, {and by October you had moved two floors up with a quiet engineering major.|filled out three forms, and got a single by spring.}`), mood: 1 }) },
          { id: "y_roommate.cope", label: s.year < 1980 ? "Buy earplugs and live with it" : "Buy good headphones and live with it", hint: "it's only a year", act: "avoid", style: "safe", weight: 0.23, apply: (s2, c) => ({ text: c.w(`${then} you {bought ${s2.year < 1980 ? "earplugs in bulk" : "the best headphones you could afford"} and made your peace.|learned to sleep through anything, a skill that lasted the rest of your life.|counted down to May and survived with your sense of humor.}`), mood: 0 }) },
          { id: "y_roommate.library", label: "Basically live at the library", hint: "a carrel of your own", act: "study", style: "learn", weight: 0.1, apply: (s2, c) => ({ text: c.w(`${then} you more or less moved into the library, {and your grades were spectacular.|and found a carrel on the fourth floor that became yours.}`), mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "y_homesick", domain: "family", channel: "bad", once: true, ages: [17, 23], when: s => inUni(s) && uniYear(s) <= 1, p: s => (s.flags.awayCollege ? 0.4 : 0.25),
    choice: (s, ctx) => {
      const phone = s.year < 1990 ? "the pay phone at the end of the hall" : s.year < 2005 ? "the phone on your desk" : "your phone";
      const [lead, then] = scene(ctx, [
        ["It's October, and you're more homesick than you expected. You miss your own bed and the dog.", "Homesick that first October,"],
        [`You called home from ${phone} and couldn't figure out why your voice cracked.`, "Homesick in your first semester,"],
        ["Everyone on your floor seems to have found their people already, and you eat dinner alone a lot.", "Lonely that first fall,"],
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "y_homesick.call", label: "Call home every night", hint: "a voice you know", act: "talk", style: "family", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${then} you called home every night from ${phone}, {and by Thanksgiving you called once a week.|and ${parentWord(s2, c)} read you the local news.} It got easier.`), mood: 1 }) },
          { id: "y_homesick.club", label: "Join something, anything", hint: "a reason to leave your room", act: "socialize", style: "social", weight: 0.3, apply: (s2, c) => { makeFriend(s2, c, "college", 0.7); return { text: c.w(`${then} you joined {the ultimate Frisbee club|the campus choir|a volunteer tutoring group|the film society}, and by November you had somewhere to be and someone to sit with.`), mood: 3 }; } },
          { id: "y_homesick.weekends", label: "Go home on weekends", hint: "the bus on Friday", act: "care", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you went home most weekends, {doing laundry in your parents' basement,|working shifts at your old job,} and campus stayed a weekday place for a while.`), mood: 0 }) },
          { id: "y_homesick.tough", label: "Tough it out", hint: "it gets better", act: "pushThrough", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you toughed it out, and somewhere around the first snow {you realized campus felt like home.|someone down the hall knocked and asked if you wanted to get pizza.}`), mood: 1 }) },
          { id: "y_homesick.counsel", label: "Go to the counseling center", hint: "this is what it's for", act: "counsel", style: "health", weight: 0.1, apply: (s2, c) => { stress(s2, -0.05); return { text: c.w(`${then} you went to the campus counseling center, {where a kind woman with a bowl of candy said it was the most normal thing in the world.|and it helped more than you expected.}`), mood: 2 }; } },
        ],
      };
    },
  },
  {
    id: "y_greek", once: true, ages: [17, 24], when: s => inUni(s) && uniYear(s) <= 1, p: s => (s.year >= 1967 && s.year <= 1976 ? 0.15 : 0.25),
    choice: (s, ctx) => {
      const house = s.sex === "female" ? ctx.rng.pick(["Alpha Phi", "Delta Gamma", "Kappa Kappa Gamma", "Chi Omega", "Alpha Kappa Alpha"]) : ctx.rng.pick(["Sigma Chi", "Kappa Sigma", "Pi Kappa Alpha", "Phi Delta Theta", "Alpha Phi Alpha"]);
      const word = s.sex === "female" ? "sorority" : "fraternity";
      const club = ctx.rng.pick([s.year >= 1968 ? "the Black Student Union" : "the campus newspaper", "the campus radio station", "the outing club", "a co-ed service fraternity", s.year >= 1985 ? "the Asian American Student Association" : "the debate society", "the student government"]);
      const lead = scene(ctx, [
        "Rush week: every house on Greek Row has a banner out, and somebody slipped a flyer under your door.",
        `A kid on your floor is rushing ${house} and wants you to come to the open house.`,
        s.year >= 1967 && s.year <= 1976 ? "Half your hall says fraternities and sororities are relics. The other half is rushing anyway." : null,
        "The activities fair takes up the whole quad, and three different people have handed you a pen.",
      ]);
      return {
        prompt: `${lead} What do you join?`,
        options: [
          { id: "y_greek.rush", label: `Rush ${an(word)}`, hint: "letters, dues, a hundred new friends", act: "socialize", style: "social", weight: 0.25, apply: (s2, c) => { s2.flags.greek = true; debt(s2, 0.02); makeFriend(s2, c, "college"); return { text: c.w(`You rushed ${house}, {got a bid from the house you wanted,|survived pledge semester and learned a great many songs,} and {the composite photo of your class hung in the hallway for decades.|you had somewhere to be every Friday for four years.|the dues were steep and the friendships were steeper.}`), mood: 4 }; } },
          { id: "y_greek.parties", label: "Go to the parties, skip the pledging", hint: "all of the fun, none of the dues", act: "socialize", style: "risk", weight: 0.25, apply: (s2, c) => ({ text: c.w("You skipped rush but went to every party on Greek Row, {and learned to play quarters badly.|and woke up on a stranger's couch exactly once.|and became famous at three houses without joining any.}"), mood: 2 }) },
          { id: "y_greek.club", label: `Join ${club} instead`, hint: "your kind of people", act: "hobby", style: "learn", weight: 0.2, apply: (s2, c) => { makeFriend(s2, c, "college", 0.7); return { text: c.w(`You skipped Greek life and joined ${club}, {where you found your people by the second meeting.|which ate most of your evenings and none of your regrets.}`), mood: 3 }; } },
          { id: "y_greek.sports", label: "Sign up for intramurals", hint: "flag football, broomball, glory", act: "exercise", style: "health", weight: 0.12, apply: (s2, c) => ({ text: c.w("You skipped rush and signed up for intramurals, {and your team of strangers won the {flag football|volleyball|inner-tube water polo} championship and a T-shirt.|losing nearly every game with total joy.}"), mood: 3 }) },
          { id: "y_greek.none", label: "Skip all of it", hint: "class, work, sleep", act: "rest", style: "self", weight: 0.18, apply: (s2, c) => ({ text: c.w("You skipped rush and the clubs and spent your evenings {at the movies with your floor.|working a shift at the pizza place.|sleeping, gloriously.}"), mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "y_major", domain: "study", channel: "change", once: true, ages: [18, 26], when: s => inUni(s) && uniYear(s) >= 1 && uniYear(s) <= 2 && !s.flags.collegeMajor, p: s => (uniYear(s) === 2 ? 0.6 : 0.3),
    choice: (s, ctx) => {
      const y = s.year, parent = parentWord(s, ctx);
      const love = ctx.rng.pick(["English", "history", "art history", "philosophy", "music", "theater", y >= 1972 ? "film studies" : "French", "anthropology"]);
      const sure = ctx.rng.pick(["business", "accounting", "mechanical engineering", y >= 1980 ? "computer science" : "electrical engineering", "nursing", "economics"]);
      const theirs = ctx.rng.pick(["accounting", "pre-law political science", "engineering", "pharmacy", "business"]);
      const lead = scene(ctx, [
        "It's time to declare a major, and the registrar keeps sending reminders in red ink.",
        "Your advisor asked where you see yourself in ten years, and you said “employed,” which made her laugh.",
        `${cap(parent)} ${parent === "your parents" ? "keep" : "keeps"} asking what you're going to do with your degree, as if you know.`,
        `You fell for an intro ${love} class, and you also did the math on your loans.`,
      ]);
      const set = (major, text, mood = 3) => (s2, c) => { s2.flags.collegeMajor = major; return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} What do you major in?`,
        options: [
          { id: "y_major.love", label: `Major in ${love}`, hint: "the class you can't stop thinking about", act: "study", style: "learn", weight: 0.25, apply: set(love, `You declared ${love} as your major, {and the first seminar felt like coming home.|and your relatives asked what you planned to do with it at every holiday.|and filled your shelves with paperbacks full of underlining.}`, 4) },
          { id: "y_major.sure", label: `Major in ${sure}`, hint: "a straight line to a paycheck", act: "study", style: "safe", weight: 0.3, apply: set(sure, `You declared ${sure}, {the sensible choice, and found you were good at it.|and spent a lot of nights in study groups that ran on vending-machine coffee.|and the career office started emailing you about internships.}`) },
          { id: "y_major.premed", label: "Go pre-med", hint: "biology, organic chemistry, nerves", act: "study", style: "risk", weight: 0.13, apply: set("biology (pre-med)", "You declared biology and went pre-med, {and organic chemistry tried its best to stop you.|volunteering at the hospital on weekends.|with a color-coded plan taped above your desk.}") },
          { id: "y_major.theirs", label: `Pick ${theirs}, like ${parent} ${parent === "your parents" ? "want" : "wants"}`, hint: "keep the peace at home", act: "reconcile", style: "family", weight: 0.12, apply: set(theirs, `You declared ${theirs}, the major ${parent} had hoped for, {and it was fine, mostly.|and took ${love} electives on the side to stay sane.}`, 1) },
          { id: "y_major.double", label: `Double major: ${sure} and ${love}`, hint: "twice the work, both doors open", act: "study", style: "learn", weight: 0.08, apply: set(`${sure} and ${love}`, `You double-majored in ${sure} and ${love}, {and your schedule was a work of art.|and slept about five hours a night for two years.}`) },
          { id: "y_major.wait", label: "Stay undecided a little longer", hint: "more intro classes", act: "wait", style: "self", weight: 0.12, apply: set("general studies", "You stayed undecided a while longer, took intro classes in everything, and finally landed in general studies, which turned out to suit you.", 1) },
        ],
      };
    },
  },
  {
    id: "y_studyAbroad", domain: "move", channel: "change", once: true, ages: [19, 25], when: s => inUni(s) && uniYear(s) === 2 && s.year >= 1955, p: () => 0.25,
    choice: (s, ctx) => {
      const y = s.year;
      const place = ctx.rng.pick(["London", "Florence", "Madrid", "Paris", "Dublin", ...(y >= 1980 ? ["Tokyo", "Seville"] : []), ...(y >= 1992 ? ["Prague", "Buenos Aires", "Cape Town"] : []), ...(y >= 1995 ? ["Beijing"] : []), ...(y >= 2005 ? ["Copenhagen", "Sydney"] : [])]);
      const cost = usd(y, 8000);
      const lead = scene(ctx, [
        `The study-abroad office has a poster of ${place} in the window, and the deadline is Friday.`,
        `Your advisor says a semester in ${place} would count toward your major, and the program costs about ${cost} more than staying.`,
        `Your best friend from your hall is going to ${place} next spring and wants you to come.`,
      ]);
      const go = (s2, c, text) => { s2.flags.semesterAbroad = place; return { text: c.w(text), mood: 6, big: true }; };
      return {
        prompt: `${lead} Do you go?`,
        options: [
          { id: "y_studyAbroad.semester", label: `Spend a semester in ${place}`, hint: "a passport stamp and a new life", act: "studyAbroad", style: "risk", weight: 0.35, apply: (s2, c) => { debt(s2, 0.04); return go(s2, c, `You spent a semester in ${place}, {${s2.year < 2005 ? "and called home from a phone booth that ate your coins." : "and video-called home at strange hours from a café with bad Wi-Fi."}|and learned to read a train schedule, order a coffee and be homesick in a second language.|and came back with a new way of walking around your own campus.} {You still dream about the bakery on the corner.|Your host family sent Christmas cards for twenty years.|You saved the transit pass in a shoebox.}`); } },
          { id: "y_studyAbroad.summer", label: "Do a short summer program instead", hint: "six weeks, less money", act: "studyAbroad", style: "safe", weight: 0.2, apply: (s2, c) => go(s2, c, `You did six weeks in ${place} over the summer, {in a dorm with students from nine countries.|taking one class and seeing every museum.} {It was short and it rearranged something in you.|You came home with a sunburn and a new favorite food.}`) },
          { id: "y_studyAbroad.grant", label: "Apply for a scholarship to cover it", hint: "a long essay, a long shot", act: "study", style: "learn", weight: 0.12, apply: (s2, c) => (c.roll("study", "good", 0.45) ? go(s2, c, `You won a scholarship for a semester in ${place}, {and read the letter twice in the mailroom.|and spent it walking everywhere and writing everything down.}`) : { text: `You applied for a study-abroad scholarship to ${place} and didn't get it. You stayed and promised yourself you would go someday.`, mood: -1 }) },
          { id: "y_studyAbroad.stay", label: "Stay and keep your job and your friends", hint: "the campus you know", act: "wait", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You skipped the semester in ${place} and stayed on campus, {kept your job at the library, and had the best spring of college.|and your friends who went sent postcards you kept on the fridge.}`), mood: 0 }) },
          { id: "y_studyAbroad.money", label: "Can't afford it. Work extra shifts", hint: "maybe someday", act: "sideJob", style: "safe", weight: 0.13, apply: (s2, c) => ({ text: c.w(`${place} was not in the budget, so you picked up extra shifts instead, {and put a picture of ${place} inside your locker.|and swore you would see it with your own money one day.}`), mood: -1 }) },
        ],
      };
    },
  },
  {
    id: "y_springBreak", once: true, ages: [18, 25], when: s => (inUni(s) && uniYear(s) >= 1) || inCC(s), p: () => 0.25,
    choice: (s, ctx) => {
      const spot = springSpot(s, ctx), odd = ctx.rng.pick(["New Orleans", "Nashville", "the Grand Canyon", "Austin", "the Florida Keys"]);
      const lead = scene(ctx, [
        `Spring break is coming, and half your friends are driving to ${spot} in one car.`,
        `Someone found a motel in ${spot} that sleeps eight if nobody minds the floor.`,
        `Spring break: you could go to ${spot}, or ${odd}, or home to sleep and do laundry.`,
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "y_springBreak.beach", label: `Go to ${spot}`, hint: "sun, sand, bad decisions", act: "travel", style: "risk", weight: 0.35, apply: (s2, c) => { spend(s2, 0.02); return { text: c.w(`On spring break you went to ${spot} with {seven friends in a car built for five|your whole floor}, {and got the worst sunburn of your life.|and slept on a motel floor and regretted nothing.|and came back with a T-shirt and stories you would tell for decades, edited.}`), mood: 5 }; } },
          { id: "y_springBreak.trip", label: `Road trip to ${odd}`, hint: "the road less sunburned", act: "travel", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(`On spring break you and two friends drove to ${odd}, {ate at every diner on the way,|took turns choosing the music,} and {it became the story you tell about college.|got a flat tire in the middle of nowhere and fixed it yourselves.}`), mood: 5 }) },
          { id: "y_springBreak.serve", label: s.year >= 1976 ? "Build houses with Habitat for Humanity" : "Go on a service trip", hint: "spring break with a hammer", act: "volunteer", style: "family", weight: 0.12, apply: (s2, c) => ({ text: c.w("On spring break you went on a service trip, {framing walls for a family who brought you lunch every day,|helping rebuild after a flood,} and {came back sore and full.|it changed what you wanted to do with your life, a little.}"), mood: 5 }) },
          { id: "y_springBreak.home", label: "Go home, sleep, do laundry", hint: "your mother's cooking", act: "rest", style: "family", weight: 0.23, apply: (s2, c) => ({ text: c.w(`On spring break you went home, slept until noon, did four loads of laundry and let ${parentWord(s2, c)} feed you. {It was exactly right.|You were bored by Wednesday and grateful by Friday.}`), mood: 2 }) },
          { id: "y_springBreak.work", label: "Work extra shifts", hint: "time and a half, an empty campus", act: "sideJob", style: "safe", weight: 0.15, apply: (s2, c) => ({ text: c.w("On spring break you worked double shifts {on a deserted campus|at the restaurant}, and {the money covered next semester's books.|the quiet was its own kind of vacation.}"), mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "y_finals", domain: "study", channel: "change", max: 1, ages: [18, 30], when: s => atCollege(s) || inGrad(s), p: () => 0.15,
    choice: (s, ctx) => {
      const subj = ctx.rng.pick(inGrad(s) ? ["your qualifying exam", "the statistics final", s.track === "law" ? "the contracts final" : "the biochemistry final"] : ["organic chemistry", "Calculus II", "macroeconomics", "the history survey", "physics"]);
      const fuel = s.year < 1990 ? "a pot of coffee and a box of No-Doz" : s.year < 2005 ? "a pot of coffee and a bag of pretzels" : "two energy drinks and a family-size bag of chips";
      const [lead, then] = scene(ctx, [
        [`Finals week. ${cap(subj)} is in three days, and you understand about half of it.`, `With ${subj} three days off,`],
        [`You have three exams and a paper due in four days, and ${subj} is the one that scares you.`, `Facing three exams, a paper and ${subj},`],
        ["The library is open all night for finals, and every table is taken by someone who looks calmer than you.", "In the all-night library during finals,"],
      ]);
      const grade = (s2, c, p) => (c.roll("study", "good", p) ? "{You got a B+ and danced in the hallway.|You aced it, and called home to brag.|You pulled an A-, the best grade of your year.}" : "{You passed, barely, and slept for fourteen hours.|You got a C and decided that was a win.}");
      return {
        prompt: `${lead} How do you study?`,
        options: [
          { id: "y_finals.allnight", label: "Pull an all-nighter", hint: fuel, act: "pushThrough", style: "risk", weight: 0.25, apply: (s2, c) => { stress(s2, 0.03); return { text: c.w(`${then} you pulled an all-nighter on ${fuel}. ${grade(s2, c, 0.4)}`), mood: 0 }; } },
          { id: "y_finals.group", label: "Join a study group", hint: "misery loves company", act: "socialize", style: "social", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${then} you joined a study group in a borrowed classroom, {and explaining it to others finally made it click.|and one person brought homemade cookies, which helped more than the notes.} ${grade(s2, c, 0.55)}`), mood: 2 }) },
          { id: "y_finals.office", label: "Go to office hours", hint: "the professor is a person", act: "seekHelp", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you finally went to office hours, {and the professor drew the whole thing on a napkin.|and found out the professor was kind and slightly lonely.} ${grade(s2, c, 0.6)}`), mood: 2 }) },
          { id: "y_finals.plan", label: "Make a color-coded schedule", hint: "a plan for every hour", act: "study", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you made a color-coded study schedule and {actually followed it,|followed about half of it,} {with highlighters in four colors.|crossing off every hour.} ${grade(s2, c, 0.5)}`), mood: 1 }) },
          { id: "y_finals.break", label: "Go for a run and sleep eight hours", hint: "a rested brain", act: "rest", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you went for a run, ate a real dinner and slept eight hours while everyone else panicked. ${grade(s2, c, 0.5)}`), mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "y_campusJob", domain: "career", channel: "good", once: true, ages: [18, 26], when: s => atCollege(s), p: () => 0.22,
    choice: (s, ctx) => {
      const y = s.year, money = homeMoney(s, ctx) === "tight";
      const off = ctx.rng.pick(["delivering pizza", "waiting tables at the diner by campus", "bartending at the college bar", y >= 1995 ? "working the campus IT help desk" : "shelving books at the bookstore"]);
      const set = (job, text, extra) => (s2, c) => { s2.flags.campusJob = job; if (extra) extra(s2); return { text: c.w(text), mood: 2 }; };
      return {
        prompt: `${money ? "Money is tight, and your financial aid doesn't cover everything." : "You want some money of your own while you're in school."} ${ctx.rng.pick(["Where do you work?", "What job do you take?"])}`,
        options: [
          { id: "y_campusJob.dining", label: "The dining hall", hint: "early shifts, free meals", act: "sideJob", style: "safe", weight: 0.25, apply: set("the dining hall", "You took a job in the dining hall, {running the dish machine on the breakfast shift.|and learned exactly what goes into the mystery casserole.|and made friends with the cooks, who saved you the good cookies.}") },
          { id: "y_campusJob.library", label: "The library desk", hint: "quiet, and you can study", act: "sideJob", style: "learn", weight: 0.2, apply: set("the library", "You worked the circulation desk at the library, {doing your homework between checkouts.|and became an expert on the call numbers nobody else could find.|and fell in love with the smell of the stacks.}") },
          { id: "y_campusJob.ra", label: "Be an RA", hint: "free room, a hall full of freshmen", act: "sideJob", style: "social", weight: 0.15, apply: set("an RA", "You became a resident advisor, {with free room and board and forty freshmen who needed you at 2 a.m.|and wrote up exactly one noise complaint and a hundred birthday cards.}", s2 => debt(s2, -0.05)) },
          { id: "y_campusJob.off", label: cap(off), hint: "better tips, later nights", act: "sideJob", style: "risk", weight: 0.2, apply: set(off, `You started ${off}, {and the tips paid for your books.|working until one in the morning and dragging yourself to your nine o'clock.|and learned more about people than in any class.}`, s2 => { s2.savings += 0.04; }) },
          { id: "y_campusJob.none", label: "No job. Focus on classes", hint: "grades first", act: "study", style: "learn", weight: 0.2, apply: set("none", "You decided not to work and put everything into your classes, {and the Dean's List noticed.|and spent your free afternoons in the library, mostly.}") },
        ],
      };
    },
  },
  {
    id: "y_aid", domain: "wealth", channel: "bad", once: true, ages: [17, 26], when: s => (inUni(s) && uniYear(s) <= 2) || inCC(s), p: () => 0.25,
    choice: (s, ctx) => {
      const y = s.year, gap = usd(y, ctx.rng.pick([4000, 6000, 8000])), form = y >= 1992 ? "the FAFSA" : y >= 1972 ? "the financial aid forms" : "the scholarship office's forms";
      const lead = scene(ctx, [
        `The financial aid letter came, and there's a gap of ${gap} a year that nobody is covering.`,
        `You filled out ${form} with ${parentWord(s, ctx)} at the kitchen table, and the number at the bottom still doesn't add up.`,
        s.flags.parentsSplit ? `Your parents' divorce made ${form} a nightmare of two households, and now there's a gap of ${gap}.` : null,
        y >= 2010 ? `Tuition went up again, and your loan servicer's website says your balance is already ${loanOf(y)} and climbing.` : null,
      ]);
      return {
        prompt: `${lead} How do you pay for school?`,
        options: [
          { id: "y_aid.loans", label: "Take out more student loans", hint: "future you can deal with it", act: "borrow", style: "safe", weight: 0.35, apply: (s2, c) => { debt(s2, 0.1); return { text: c.w(`To cover the gap, you signed for more student loans, {and the promissory note was eleven pages long.|and tried not to look at the total.|and promised yourself you would pay them off by thirty.}`), mood: -2 }; } },
          { id: "y_aid.work", label: "Work more hours", hint: "thirty a week, somehow", act: "sideJob", style: "self", weight: 0.2, apply: (s2, c) => { stress(s2, 0.05); return { text: c.w("To cover the gap, you picked up a second job, {and did your reading on the bus.|and learned to nap anywhere, including the stairwell.|and your grades dipped but held.}"), mood: -2 }; } },
          { id: "y_aid.scholarship", label: "Apply for every scholarship you can find", hint: "fifty essays", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => { if (c.roll("study", "good", 0.4)) { debt(s2, -0.05); return { text: c.w("To cover the gap, you applied for every scholarship you could find, {from the Rotary Club to the Daughters of somebody,|writing the same essay forty different ways,} and won two. You framed the smaller check's letter."), mood: 4 }; } return { text: "To cover the gap, you applied for every scholarship you could find and won a hundred dollars from the local Elks lodge. It was something.", mood: 0 }; } },
          { id: "y_aid.family", label: "Ask family for help", hint: "a hard phone call", act: "seekHelp", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(`To cover the gap, you asked family for help, and {your grandparents quietly sent a check every semester.|${parentWord(s2, c)} took on extra hours without telling you.|an aunt you barely knew offered to pay for books.} You never forgot it.`), mood: 2 }) },
          { id: "y_aid.cheap", label: "Cut costs to the bone", hint: "ramen and used textbooks", act: "save", style: "safe", weight: 0.1, apply: (s2, c) => ({ text: c.w(`To cover the gap, you cut costs everywhere: {used textbooks with someone else's highlighting,|a basement apartment shared with three people,} {and a great deal of ramen.|and a bike instead of a car.}`), mood: -1 }) },
        ],
      };
    },
  },
  {
    // Credit card companies set up tables on campus from the 1980s until the CARD Act of 2009 restricted it.
    id: "y_cardTable", once: true, ages: [18, 24], when: s => inUni(s) && s.year >= 1985 && s.year <= 2009, p: () => 0.25,
    choice: (s, ctx) => ({
      prompt: `${scene(ctx, ["A credit card company has a table outside the student union, giving away free T-shirts to anyone who signs up.", "A pre-approved credit card offer came to your dorm mailbox, with your name already printed on the card.", "A guy at a folding table is offering a free pizza and a credit card with a $500 limit."])} What do you do?`,
      options: [
        { id: "y_cardTable.shirt", label: "Sign up for the T-shirt, never use the card", hint: "free stuff", act: "save", style: "safe", weight: 0.25, apply: s2 => { s2.flags.card = "none"; return { text: "You signed up for a credit card for the free T-shirt, put the card in a drawer and never used it. You wore the shirt for a decade.", mood: 1 }; } },
        { id: "y_cardTable.use", label: "Sign up and use it for everything", hint: "pizza, textbooks, spring break", act: "borrow", style: "risk", weight: 0.3, apply: (s2, c) => { s2.flags.card = "minimum"; debt(s2, 0.06); return { text: c.w("You signed up for a credit card and used it for {pizza, textbooks and a spring break you couldn't afford,|everything,} {and by graduation the balance had a life of its own.|and learned what compound interest means the hard way.}"), mood: -1 }; } },
        { id: "y_cardTable.emergency", label: "Sign up, for emergencies only", hint: "a flat tire, a bus ticket home", act: "insurance", style: "safe", weight: 0.2, apply: s2 => { s2.flags.card = "emergency"; return { text: "You signed up for a credit card and kept it for emergencies only. The only emergency, it turned out, was a flat tire, and you paid it off the next month.", mood: 1 }; } },
        { id: "y_cardTable.pass", label: "Walk right past", hint: "you've heard the stories", act: "avoid", style: "self", weight: 0.15, apply: () => ({ text: "You walked past the credit card table without slowing down. Later you watched your roommate's balance climb and felt very wise.", mood: 1 }) },
        { id: "y_cardTable.three", label: "Sign up for three of them", hint: "more shirts", act: "borrow", style: "risk", weight: 0.1, apply: s2 => { s2.flags.card = "spree"; debt(s2, 0.1); return { text: "You signed up for three credit cards in one week and had three free T-shirts and, by spring, three minimum payments.", mood: -2 }; } },
      ],
    }),
  },
  {
    id: "y_internship", domain: "career", channel: "good", once: true, ages: [19, 26], when: s => inUni(s) && uniYear(s) >= 2, p: () => 0.3,
    choice: (s, ctx) => {
      const city = ctx.rng.pick(["New York", "Washington", "Chicago", "San Francisco", "Boston", "Atlanta"]);
      const set = (what, text, mood = 3, extra) => (s2, c) => { s2.flags.internship = what; if (extra) extra(s2); return { text: c.w(text), mood }; };
      return {
        prompt: `${scene(ctx, [`It's the summer before senior year, and you got an unpaid internship offer in ${city}.`, "The career office says this summer matters, and you have three options and no plan.", `A professor asked if you'd like to do research in her lab this summer, and an internship in ${city} came through the same week.`])} What do you do this summer?`,
        options: [
          { id: "y_internship.city", label: `Intern in ${city}`, hint: s.year >= 1990 && s.year <= 2015 ? "unpaid, but it's a foot in the door" : "a foot in the door", act: "jobSearch", style: "risk", weight: 0.3, apply: set(`interning in ${city}`, `You spent the summer interning in ${city}, {sharing a sublet with four strangers,|making coffee and copies and, finally, one real project,} and {came home broke with a reference letter.|learned you loved the work, or at least the city.}`, 4, s2 => spend(s2, 0.05)) },
          { id: "y_internship.lab", label: "Do research with a professor", hint: "your name on a poster", act: "study", style: "learn", weight: 0.2, apply: set("research", "You spent the summer doing research with a professor, {pipetting things at seven in the morning|coding data in a basement office}, and {your name went on a poster at a conference.|she wrote you a recommendation that opened doors.}", 4) },
          { id: "y_internship.paid", label: "A paid summer job at home", hint: "you need the money", act: "sideJob", style: "safe", weight: 0.25, apply: set("a summer job", "You went home and worked a paid summer job {at the county parks department|at a warehouse|at the bank where your mom knew everyone}, {and saved every check.|and ate dinner with your family most nights, which you would miss later.}", 2, s2 => { s2.savings += 0.05; }) },
          { id: "y_internship.camp", label: "Be a summer camp counselor", hint: "lake, cabins, kids", act: "care", style: "social", weight: 0.15, apply: set("camp", "You spent the summer as a camp counselor at a lake, {teaching canoeing badly and campfire songs well.|and one homesick kid wrote you a letter every year after.}", 4) },
          { id: "y_internship.travel", label: "Travel and figure it out", hint: "one last free summer", act: "travel", style: "self", weight: 0.1, apply: set("travel", "You spent the summer traveling on the cheap {with a friend and a road atlas|on Greyhound buses}, and figured out a few things about yourself, though not what to do for a living.", 3, s2 => spend(s2, 0.04)) },
        ],
      };
    },
  },
  {
    // Campus moments that made the evening news, told as a student met them; no side is the right one.
    id: "y_protest", once: true, ages: [18, 24], when: s => inUni(s) && ((s.year >= 1965 && s.year <= 1972) || (s.year >= 1985 && s.year <= 1987) || s.year === 2003 || s.year === 2020), p: () => 0.4,
    choice: (s, ctx) => {
      const y = s.year, cause = y <= 1972 ? "the war in Vietnam" : y <= 1987 ? "the college's investments in apartheid South Africa" : y === 2003 ? "the coming war in Iraq" : "racial justice, after George Floyd's murder";
      const where = y === 2020 ? "downtown, masks on" : y <= 1987 && y >= 1985 ? "on the quad, where students built shanties out of plywood" : "on the quad";
      return {
        prompt: `There's a protest about ${cause} ${where}, and your whole campus is arguing about it. What do you do?`,
        options: [
          { id: "y_protest.march", label: "March", hint: "be counted", act: "socialize", style: "risk", weight: 0.3, apply: (s2, c) => ({ text: c.w(`You marched in the protest about ${cause}, {with a cardboard sign you made the night before,|arm in arm with people you had never met,} and {you were proud of it all your life.|your parents saw you on the evening news.}`), mood: 3, big: true }) },
          { id: "y_protest.organize", label: "Help organize a teach-in", hint: "talk it through", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w(`Instead of only marching, you helped organize a teach-in about ${cause}, {and four hundred students crowded into the lecture hall.|where professors and students argued until midnight.}`), mood: 3 }) },
          { id: "y_protest.cover", label: "Cover it for the student paper", hint: "a notebook and a camera", act: "hobby", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w(`You covered the protest about ${cause} for the student paper, {interviewing people on every side,|with a borrowed camera,} and your story ran on the front page.`), mood: 2 }) },
          { id: "y_protest.study", label: "Keep your head down and study", hint: "finals are coming either way", act: "study", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w(`While the campus argued about ${cause}, you kept studying, {and watched it all from the library window.|and talked it over with your roommate late at night instead.}`), mood: 0 }) },
          { id: "y_protest.debate", label: "Argue the other side over dinner", hint: "someone has to", act: "talk", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w(`When everyone around you was sure about ${cause}, you argued the other side over dinner in the dining hall, {and made two friends and one enemy.|and found out you were more sure of yourself than of the answer.}`), mood: 1 }) },
        ],
      };
    },
  },
  A("y_dorm", [17, 23], 0.35, s => {
    const y = s.year;
    return [
      y < 1990 ? "Your dorm had one phone at the end of the hall, and whoever answered it shouted your name down the corridor like a train conductor." : y < 2004 ? "Your dorm room had a landline, a lofted bed held up by cinderblocks, and a poster of a band you no longer admit to liking." : "Your dorm room had a mini fridge, a microwave the RA pretended not to see, and a Wi-Fi password that changed every month.",
      "The fire alarm went off at 3 a.m. {three times in one week,|again,} and your whole floor stood in the snow in pajamas, {which is how you met half of your friends.|bonding over the person who had burned the popcorn.}",
      y >= 1999 && y <= 2001 ? "Your whole dorm floor downloaded music on Napster over the campus network until the school cut it off." : y >= 2004 && y <= 2007 ? "Somebody on your floor got you to join the Facebook, which was only for college students then, and you spent a whole weekend poking people." : "You and your hallmates ordered pizza at midnight {so often the delivery guy knew your names.|and argued about everything that mattered until sunrise.}",
    ];
  }, { when: inUni, mood: 3 }),
  A("y_professor", [18, 26], 0.15, ["A professor {wrote “See me” on your paper|kept you after class}, and you were terrified, and it turned out she wanted you in her advanced seminar. You never forgot that someone saw something in you.", "Your {philosophy|biology|literature|economics} professor {wore the same tweed jacket every day and|paced the stage like a preacher and} changed the way you think about {almost everything.|the world.}", "You took a class just to fill a requirement, and the professor made it the best class of your college years. {You still have the notes.|You changed your whole plan because of it.}"], { when: s => atCollege(s), mood: 3 }),
  A("y_gameDay", [18, 23], 0.12, s => [`On football Saturdays you {tailgated in the parking lot from nine in the morning|painted your face in the school colors|sat in the student section and lost your voice}, and {the team lost, and it didn't matter at all.|the team won in overtime, and the whole town honked their horns.}`, "You went to every home game {with your hallmates|with a flask and a stadium blanket|in the marching band's rain ponchos}, and learned the fight song by heart.", "Homecoming weekend: {the parade, the alumni, the float your dorm built out of chicken wire and tissue paper.|you rushed the field when the team upset a rival, and somebody tore the goalpost down.}"], { when: inUni, mood: 3 }),
  A("y_freshman15", [18, 20], 0.12, ["The all-you-can-eat dining hall {and its soft-serve machine|and its waffle station} got the better of you, and the “freshman fifteen” was, for you, closer to ten.", "You discovered that college food is mostly beige and that you could eat a lot of it, and by spring your jeans had opinions.", "You gained a few pounds your freshman year, {started walking to every class the long way,|joined an intramural team,} and made your peace with it."], { when: s => inUni(s) && uniYear(s) <= 1, mood: 0 }),
  A("y_paper", [18, 26], 0.15, s => [s.year < 1985 ? "You typed your term paper on a Smith-Corona at 4 a.m., with a bottle of Wite-Out beside you and no room for mistakes." : s.year < 1997 ? "You wrote your term paper in the computer lab at three in the morning and waited forty minutes for the dot-matrix printer." : "Your laptop crashed the night before your paper was due, and you learned, permanently, to save your work.", "You wrote a paper you were proud of, and the professor wrote “Yes!” in the margin three times. You kept it.", "You pulled your first all-nighter on a paper about {the French Revolution|Moby-Dick|the Great Depression}, and turned it in with ten minutes to spare."], { when: s => atCollege(s) || inGrad(s), mood: 1 }),
  A("y_ccLife", [18, 30], 0.3, (s, ctx) => ["At the community college {half your classmates had kids and full-time jobs,|the parking lot filled up by seven-thirty,} and {you learned more from them than from the textbook.|you liked being in a room full of people who had chosen to be there.}", `Your ${ctx.rng.pick(["English", "algebra", "biology", "accounting"])} instructor at the community college worked days at {a law office|the hospital|an engineering firm}, and taught at night because she loved it. You could tell.`, "You took classes at the community college {in the morning and worked a lunch shift after,|at night, three evenings a week,} and the routine was hard and steady and yours."], { when: inCC, mood: 2 }),
  A("y_tradeShop", [18, 26], 0.35, s => {
    const t = tradeWord(s.flags.trade);
    if (!BUILD_TRADES.includes(s.flags.trade)) return [`In your ${t} program an instructor with thirty years in the field watched you work and said, “Again.” You did it again, and better.`, `You learned ${t} hands-on, {on practice mannequins and then on real, nervous people,|in a classroom that smelled of disinfectant,} and found a pride you hadn't felt in high school.`, `Your first real client in ${t} {tipped you in quarters and came back every month for years.|told you that you had a gentle touch, and you thought about it all week.}`];
    return [`In the trade school shop, an old instructor with forty years in ${t} watched you work and said, “Again.” You did it again, and better.`, `You learned ${t} with your hands: {burned fingertips, a scar on your thumb,|steel-toed boots and a lunch pail,} and a pride you hadn't felt in a classroom before.`, "On your first real job site you made every rookie mistake once, {and the journeyman who trained you never let you make the same one twice.|and somebody sent you to look for a left-handed wrench.}"];
  }, { when: s => inTrade(s) || (s.edu === "certificate" && s.age <= 24), mood: 3 }),
  A("y_gradLife", [21, 32], 0.3, s => {
    const t = s.track;
    if (t === "law") return ["In law school a professor cold-called you on the first day, and you answered something about contracts that may have been in English.", "You spent your 1L year in the law library with a mountain of casebooks and a study group that ran on spite and coffee.", "Your law school study group met every Sunday night, and one of them became a lifelong friend."];
    if (t === "med") return ["In your first anatomy lab you met the body donor you would learn from all year, and you never forgot their gift.", "Medical school was a firehose: {flash cards in the shower,|lectures at double speed,} and the first time a patient called you Doctor, by mistake.", "You studied for the boards for six weeks straight and dreamed in drug names."];
    if (t === "phd") return ["In grad school you taught your first discussion section, and a student asked a question you couldn't answer, and you said so, and it went fine.", "Your experiment failed for the ninth time in a row, and your advisor said that is what research is. On the tenth try it worked.", "You lived on a graduate stipend, a used bicycle and free food from department seminars."];
    return ["In your master's program you were older than half the class and younger than the other half, and everyone was tired.", "Grad school: {a teaching assistantship,|a cubicle in the basement,} and a cohort that became your family for two years.", "You presented your work at your first conference, in a hotel ballroom with bad coffee, and someone asked a good question."];
  }, { when: inGrad, mood: 2 }),
  A("y_residency", [25, 32], 0.6, ["Residency: thirty-hour shifts, a pager that never stopped, and a cafeteria that knew your order. The first time you saved someone, you went to the stairwell and shook.", "You slept in the call room between pages, ate graham crackers from the nurses' station, and learned the most from the nurses who had seen everything.", "In residency your attending made you present every patient at five in the morning, and by spring you could do it in your sleep, which was how you did it."], { when: s => s.job && s.job.title === "resident physician", mood: 1 }),

  // ---------- service ----------
  {
    id: "y_deployment", domain: "move", channel: "change", max: 2, cooldown: 2, ages: [18, 30], when: s => inService(s), p: () => 0.3,
    choice: (s, ctx) => {
      const y = s.year, br = String((s.flags.served && s.flags.served.branch) || (s.job && s.job.branch) || "Army").replace(/^the /, "");
      const sea = /Navy|Coast/.test(br);
      const where = br === "Coast Guard" ? ctx.rng.pick(["a cutter in the Bering Sea", "hurricane duty on the Gulf Coast", "drug patrols in the Caribbean"])
        : y <= 1953 ? "Korea" : y <= 1964 ? ctx.rng.pick(["West Germany", "Okinawa", sea ? "a destroyer in the Mediterranean" : "South Korea"])
        : y <= 1972 ? (sea ? "a carrier off the coast of Vietnam" : "Vietnam") : y <= 1989 ? ctx.rng.pick(["West Germany", "South Korea", sea ? "an aircraft carrier in the Mediterranean" : "a base in Italy"])
        : y <= 1991 ? "Saudi Arabia for Desert Storm" : y <= 2000 ? ctx.rng.pick(["Bosnia", "South Korea", sea ? "a ship in the Persian Gulf" : "Kosovo"])
        : y <= 2002 ? "Afghanistan" : y <= 2011 ? ctx.rng.pick(["Iraq", "Afghanistan"]) : y <= 2014 ? "Afghanistan" : ctx.rng.pick(["Kuwait", "Poland", sea ? "a destroyer in the Pacific" : "South Korea", "Djibouti"]);
      const months = ctx.rng.pick(["nine months", "year", "seven months", "fifteen months"]), span = months === "year" ? "a year" : months;
      const mail = y < 1995 ? "letters" : y < 2007 ? "emails from a tent with a satellite connection" : "video calls that froze every few seconds";
      const back = "{You came home thinner and quieter, to a sign taped to the garage door.|You came home in the middle of the night, and your family was at the gate anyway.|You came home and stood in the kitchen a long time, just looking at it.}";
      const go = (s2, c, text, mood = 0) => { s2.flags.deployed = { where, age: s2.age }; return { text: c.w(`${text} ${back}`), mood, big: true }; };
      return {
        prompt: `Your ${sea && br !== "Coast Guard" ? "ship" : "unit"} got orders: ${span} in ${where}. You leave in three weeks. How do you spend the time before you go?`,
        options: [
          { id: "y_deployment.home", label: "Spend your leave at home", hint: "your mother's kitchen", act: "care", style: "family", weight: 0.3, apply: (s2, c) => go(s2, c, `Before your ${months} in ${where}, you spent your leave at home, {fixing things around the house that didn't need fixing|eating everything ${parentWord(s2, c)} cooked}. Then you shipped out, and the months were long and mostly the same day over and over.`, 1) },
          { id: "y_deployment.letters", label: "Promise to write every week", hint: mail, act: "talk", style: "social", weight: 0.2, apply: (s2, c) => go(s2, c, `Before your ${months} in ${where}, you promised everyone you would write, and you did: ${mail}, every week, about the food and the weather and nothing that would worry them.`, 1) },
          { id: "y_deployment.buddies", label: "Road trip with your unit friends", hint: "one more good week", act: "travel", style: "risk", weight: 0.15, apply: (s2, c) => go(s2, c, `Before your ${months} in ${where}, you and three friends from your unit took a road trip {to the beach|to Vegas|to a lake cabin someone's uncle owned}, and it held you together for the months after.`, 2) },
          { id: "y_deployment.course", label: "Sign up for a course while you're there", hint: "come back with a skill", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => { s2.career = Math.min(5, s2.career + 1); return go(s2, c, `You spent your ${months} in ${where} doing your job and taking every course on offer, {and came back with a certification and a promotion.|studying by flashlight between shifts.}`, 1); } },
          { id: "y_deployment.save", label: "Save every dollar of deployment pay", hint: "come home to something", act: "save", style: "safe", weight: 0.2, apply: (s2, c) => { s2.savings += 0.3; return go(s2, c, `You spent your ${months} in ${where} and saved nearly every dollar of the deployment pay, {and came home to more money than you had ever seen in one place.|with a plan for every cent.}`, 1); } },
        ],
      };
    },
  },
  A("y_baseLife", [18, 30], 0.12, s => [`You were stationed at {Fort Bragg in North Carolina|Camp Lejeune|Naval Station Norfolk|a base outside San Diego|Ramstein in Germany|a base in Okinawa}, {and learned to love the chow hall's Sunday breakfast.|and the guys in your barracks became the closest thing you had to brothers and sisters.|where you learned to iron a crease you could cut yourself on.}`, "Mail call was the best part of the week: {a box of Grandma's cookies, mostly crumbs,|a letter from home with a newspaper clipping,|a care package from a church you had never been to,} and you shared it with everyone.", "On base you {made rank faster than you expected|got your GED and then some college credits|learned to drive a five-ton truck}, and {a sergeant who yelled at everyone quietly told you that you were good at this.|you started to think about what came after.}"], { when: s => inService(s), mood: 2 }),
  A("y_homecoming", [19, 31], 0.8, ["Coming home, you found that {the world had kept going without you, and the songs on the radio were all new.|your little cousin had grown a foot.|the grocery store was too bright and too full of choices.} {It took a while to stop waking at five.|You slept in your old room for a week before you could talk about any of it.}", "At the airport there was a hand-lettered sign with your name on it, and {you were fine until you saw your father's face.|a stranger in the terminal shook your hand and said thank you.}", "Back home, you went to the VFW hall with your uncle, who had served too, and {neither of you said much, and that was the point.|he bought you a beer and told you a story he'd never told anyone.}"], { when: s => s.flags.deployed && s.age - s.flags.deployed.age === 1, mood: 3 }),
  {
    id: "y_vetLife", domain: "health", channel: "change", once: true, ages: [19, 35], when: s => s.flags.vet && !inService(s) && s.flags.serviceUntil !== undefined && s.age - s.flags.serviceUntil <= 2, p: () => 0.4,
    choice: (s, ctx) => {
      const [lead, then] = scene(ctx, [
        ["It's been a few months since you got out, and civilian life feels strangely loose. Nobody tells you when to eat.", "Out of uniform and a little adrift,"],
        ["You miss the people from your unit more than you expected, and nobody at home really gets it.", "Missing your unit,"],
        ["Fireworks on the Fourth made you jump, and your family pretended not to notice.", "Still jumpy after getting out,"],
      ]);
      const vet = s.year >= 1979 ? "the Vet Center" : "the VA";
      return {
        prompt: `${lead} What helps?`,
        options: [
          { id: "y_vetLife.counsel", label: `Talk to someone at ${vet}`, hint: "they've heard it all", act: "counsel", style: "health", weight: 0.2, apply: (s2, c) => { stress(s2, -0.15); s2.flags.therapy = s2.flags.therapy ?? s2.age; return { text: c.w(`${then} you went to ${vet} and talked to a counselor {who had served too.|every Tuesday for a year.} {It helped more than you thought it would.|Some weeks you just sat there, and that helped too.}`), mood: 3 }; } },
          { id: "y_vetLife.legion", label: "Find other veterans", hint: "the Legion hall, a veterans' group", act: "socialize", style: "social", weight: 0.25, apply: (s2, c) => { stress(s2, -0.08); return { text: c.w(`${then} you started going to {the American Legion hall|a veterans' group that met at the library|a weekly breakfast with other vets}, and {nobody needed anything explained.|you ended up running the coffee pot.}`), mood: 3 }; } },
          { id: "y_vetLife.work", label: "Throw yourself into work", hint: "structure helps", act: "pushThrough", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you threw yourself into work and routine, {up at five, at the job by six,|and the structure held you up} while the rest slowly settled.`), mood: 1 }) },
          { id: "y_vetLife.call", label: "Call your old buddies", hint: "they'll pick up", act: "talk", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you called the people from your unit, one by one, {and the calls got longer and the jokes got better.|and started ${s2.year >= 2008 ? "a group chat" : "a phone chain"} that ran for decades.|and planned a reunion for the following summer.}`), mood: 3 }) },
          { id: "y_vetLife.outdoors", label: "Get outside: fishing, hiking, the open road", hint: "quiet and sky", act: "rest", style: "self", weight: 0.2, apply: (s2, c) => { stress(s2, -0.05); return { text: c.w(`${then} you spent a lot of early mornings {fishing on a lake with nobody else on it|hiking until your head was quiet|riding a used motorcycle on back roads}, and slowly came home all the way.`), mood: 2 }; } },
        ],
      };
    },
  },
  {
    id: "y_gapYear", domain: "move", channel: "change", once: true, ages: [18, 20],
    when: s => !s.studying && !s.employed && !s.abroad && !inService(s) && s.flags.doneSenior && s.flags.leftSchool !== undefined && s.age - s.flags.leftSchool <= 1 && s.flags.uniAt === undefined && s.flags.ccAt === undefined && s.flags.tradeAt === undefined, p: () => 0.3,
    choice: (s, ctx) => {
      const y = s.year, serve = y >= 1994 ? "Join AmeriCorps for a year" : y >= 1965 ? "Volunteer with VISTA" : "Go on a church mission trip";
      return {
        prompt: `${scene(ctx, ["You're out of high school, not in school, and not sure what's next. Everyone keeps asking.", `${cap(parentWord(s, ctx))} said you can take a year to figure things out, as long as you do something with it.`, "Your friends have all scattered to colleges and jobs, and you have a whole year in front of you."])} What do you do with it?`,
        options: [
          { id: "y_gapYear.save", label: "Work and save", hint: "money for whatever's next", act: "sideJob", style: "safe", weight: 0.35, apply: (s2, c) => { s2.savings += 0.1; return { text: c.w("You spent the year after high school working {at a lumberyard|at a restaurant|at a big-box store} and saving almost everything, {with a coffee can of cash and a plan forming.|and figured out what you didn't want to do, which was a start.}"), mood: 1 }; } },
          { id: "y_gapYear.travel", label: y >= 1981 ? "Travel: a working holiday abroad" : "Travel and see the country", hint: "the world is big", act: "travel", style: "risk", weight: 0.15, apply: (s2, c) => { spend(s2, 0.08); return { text: c.w(y >= 1981 ? "You spent the year after high school traveling, {picking grapes in Australia on a working holiday visa,|working in a hostel in Ireland,|backpacking with a guidebook that fell apart by March,} and came home a slightly different person." : "You spent the year after high school seeing the country {by Greyhound bus,|with a friend in a car that barely ran,} and sent postcards from every state."), mood: 5, big: true }; } },
          { id: "y_gapYear.serve", label: serve, hint: "do some good", act: "volunteer", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(y >= 1965 ? `You spent a year in ${y >= 1994 ? "AmeriCorps" : "VISTA"}, {tutoring kids in a city school,|building trails in a national forest,|working at a food bank,} for a tiny stipend and a lot of meaning.` : "You went on a church mission trip, {building a schoolhouse,|teaching Sunday school in a town far from home,} and came back with calluses and conviction."), mood: 4, big: true }) },
          { id: "y_gapYear.family", label: "Help out at home", hint: "they need you", act: "care", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(`You spent the year after high school helping out at home, {driving your grandmother to her appointments,|watching your younger cousins,|fixing what was broken around the house,} and ${parentWord(s2, c)} said it was the best year of having you around.`), mood: 2 }) },
          { id: "y_gapYear.drift", label: "Sleep in and figure it out", hint: "no plan is a plan", act: "rest", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w("You spent the year after high school sleeping late, {reading everything in the library,|playing a lot of video games,|driving around with friends,} and, slowly, starting to want something."), mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "y_apprentice", domain: "career", channel: "good", once: true, ages: [18, 27], when: s => s.edu === "certificate" && s.employed && BUILD_TRADES.includes(s.flags.trade) && !s.studying && s.job && s.job.field !== "military", p: () => 0.35,
    choice: (s, ctx) => {
      const t = tradeWord(s.flags.trade), local = ctx.rng.pick(["the union hall", "the local", "the apprenticeship office downtown"]);
      return {
        prompt: `${scene(ctx, [`You have your certificate in ${t}, and ${local} is taking applications for a four-year apprenticeship.`, `The shop where you work in ${t} pays fine, and the owner says you could run the place someday.`, `A recruiter is offering big money for ${t} work on the road, six weeks on and two off.`])} What do you do?`,
        options: [
          { id: "y_apprentice.union", label: "Join the union apprenticeship", hint: "four years, a pension, a card", act: "study", style: "learn", weight: 0.3, apply: (s2, c) => { s2.flags.union = { since: s2.age, role: "apprentice" }; s2.career = Math.min(5, s2.career + 1); return { text: c.w(`You joined the union apprenticeship in ${t}, {classes two nights a week and the job site by day,|with a journeyman who had trained a hundred apprentices and liked about ten of them,} and {you got your union card.|the pay went up every year like clockwork.}`), mood: 4 }; } },
          { id: "y_apprentice.shop", label: "Stay at the shop and learn from the boss", hint: "steady, a good boss", act: "jobSearch", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w(`You stayed at the shop and learned ${t} from an owner {who taught you everything, including how to bid a job.|who paid on Fridays in cash and never once missed.}`), mood: 2 }) },
          { id: "y_apprentice.license", label: "Stack up more licenses", hint: "the next level, then the next", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => { s2.income *= 1.06; return { text: c.w(`You studied nights for your next license in ${t}, {passed it on the second try,|passed it, then signed up for the one after that,} and the pay followed.`), mood: 3 }; } },
          { id: "y_apprentice.road", label: "Take the road work", hint: "big money, motel rooms", act: "workAbroad", style: "risk", weight: 0.15, apply: (s2, c) => { s2.income *= 1.15; stress(s2, 0.05); return { text: c.w(`You took the ${t} work on the road, {living out of motels in North Dakota and Texas,|six weeks on, two weeks off,} and {saved more in a year than in the three before.|missed every birthday that year.}`), mood: 1 }; } },
          { id: "y_apprentice.own", label: "Start taking side jobs of your own", hint: "your own truck, your own name", act: "startup", style: "risk", weight: 0.1, apply: (s2, c) => { s2.income *= 1.05; return { text: c.w(`You started taking ${t} side jobs on weekends, {with magnetic signs on your truck|with business cards from the copy shop}, and by the end of the year you had a list of regulars.`), mood: 3 }; } },
        ],
      };
    },
  },
  // ---------- a place of your own ----------
  {
    id: "y_firstPlace", domain: "move", channel: "change", once: true, ages: [19, 28], when: s => grownUp(s) && s.employed && s.home !== "own" && !s.flags.firstPlace, p: s => (s.home === "parents" ? 0.35 : 0.25),
    choice: (s, ctx) => {
      const y = s.year, rent = rentOf(y), P = dating(s) ? s.partner : null;
      const ad = y < 1996 ? "in the Sunday classifieds: “Sunny 1BR, heat incl., no pets”" : y < 2013 ? "on Craigslist: “cozy studio, must see, no flakes”" : "on a rental app: “charming 400 sq ft, in-unit laundry, sorry no dogs”";
      const lead = scene(ctx, [
        `A studio near work is ${rent} a month, which is a big piece of your paycheck.`,
        `You found a listing ${ad}.`,
        s.home === "parents" ? `${cap(parentWord(s, ctx))} said, kindly, that it might be time for a place of your own.` : null,
        P && s.home === "rent" ? `${P.call} keeps leaving a toothbrush at your place, and your lease is up next month.` : null,
        P && s.home === "parents" ? `${P.call} keeps sending you apartment listings with notes like “for us?”` : null,
      ]);
      const set = (kind, text, mood = 4, home = "rent") => (s2, c) => { s2.flags.firstPlace = { age: s2.age, kind }; s2.home = home; if (kind === "partner") s2.flags.livingTogether = s2.age; return { text: c.w(text), mood, big: kind !== "home" }; };
      return {
        prompt: `${lead} Where do you live?`,
        options: [
          { id: "y_firstPlace.studio", label: "A studio of your own", hint: `about ${rent} a month, all yours`, act: "moveHome", style: "self", weight: 0.25, apply: set("studio", `You signed a lease on a studio for about ${rent} a month, {with a radiator that clanked like a ghost,|with one window that looked at a brick wall,|above a laundromat that smelled like warm cotton,} and {the first night you ate cereal for dinner on the floor, a king.|you bought a plant and named it.}`) },
          { id: "y_firstPlace.roommates", label: "Split a place with roommates", hint: "cheaper, louder", act: "moveHome", style: "social", weight: 0.3, apply: set("roommates", `You split a {three-bedroom|run-down house|two-bedroom with a living room someone slept in} with {two friends|a coworker and a stranger from an ad|${s.flags.uniAt !== undefined ? "college friends" : "friends from high school"}}, {and the fridge became a negotiated border.|and Sunday pancakes became a house religion.|and it was the most fun and least sleep of your life.}`) },
          { id: "y_firstPlace.partner", label: P ? `Move in with ${P.call}` : "Move in with your partner", hint: "two names on the lease", act: "moveHome", style: "family", weight: 0.15, when: () => !!P, apply: set("partner", `You and ${P ? P.call : "your partner"} signed a lease together, {merged two sets of mismatched dishes,|argued about where the couch went and found out you were good at arguing,} and {it felt like playing house, and then it felt like home.|you put both your names on the mailbox.}`, 5) },
          { id: "y_firstPlace.room", label: "Rent a room in an old house", hint: "a landlady, a creaky staircase", act: "moveHome", style: "safe", weight: 0.1, apply: set("room", "You rented a room in an old house {from a widow who left soup outside your door,|with a shared bathroom and a porch swing,} and {it was cheap and strange and fine.|you saved more than any of your friends.}") },
          { id: "y_firstPlace.stay", label: "Stay home a while and save", hint: "free rent, a curfew of sorts", act: "save", style: "family", weight: 0.2, apply: set("home", `You decided to stay home a while longer and save, {and ${parentWord(s, ctx)} stopped asking when you were moving out.|paying a little rent to your parents, which they quietly saved for you.|and your savings account finally looked like something.}`, 1, s.home === "parents" ? "parents" : s.home) },
        ],
      };
    },
  },
  {
    id: "y_roommateWar", domain: "family", channel: "bad", once: true, ages: [19, 30], when: s => grownUp(s) && s.home === "rent" && s.flags.firstPlace && s.flags.firstPlace.kind === "roommates", p: () => 0.3,
    choice: (s, ctx) => {
      const [lead, then] = scene(ctx, [
        ["The dishes in the sink have become a tower, and nobody will admit the pot with the green thing is theirs.", "With the dishes piled to the ceiling,"],
        ["Your roommate came up short on rent again and promised to pay you back Friday, again.", "With a roommate short on rent again,"],
        ["Your roommate's partner has basically moved in and never pays for anything, including the hot water.", "With a fourth roommate nobody had agreed to,"],
        ["The thermostat war has gone on since October: one roommate wants sixty-two, one wants seventy-five.", "In the middle of the thermostat war,"],
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "y_roommateWar.meeting", label: "Call a house meeting", hint: "everyone in the living room", act: "talk", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${then} you called a house meeting in the living room, {and it went better than anyone expected.|and it got loud, and then it got fair.} {There was a new rule and everyone mostly kept it.|Someone made a spreadsheet.}`), mood: 1 }) },
          { id: "y_roommateWar.chart", label: "Make a chore chart", hint: "a whiteboard and some magnets", act: "negotiate", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${then} you made a chore chart on a whiteboard, {with gold stars, sarcastically at first and then sincerely.|and it worked for exactly six weeks, which was a record.}`), mood: 1 }) },
          { id: "y_roommateWar.notes", label: "Leave passive-aggressive notes", hint: "“Some of us like clean forks :)”", act: "avoid", style: "risk", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you started leaving notes on the fridge {with smiley faces that fooled nobody,|in increasingly elaborate handwriting,} and your roommate started leaving notes back. It became a kind of art form.`), mood: -1 }) },
          { id: "y_roommateWar.fix", label: "Just handle it yourself", hint: "peace at any price", act: "care", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you {did the dishes yourself|covered the difference yourself|let it go} and kept the peace, {which cost you a little and taught you something about yourself.|and resented it only on Sundays.}`), mood: -1 }) },
          { id: "y_roommateWar.leave", label: "Move out at the end of the lease", hint: "a place of your own", act: "moveHome", style: "self", weight: 0.15, apply: (s2, c) => { s2.flags.firstPlace.kind = "studio"; return { text: c.w(`${then} you decided you were done and got a place of your own when the lease ended, {and the silence was glorious.|and you stayed friends, mostly, from a distance.}`), mood: 2 }; } },
        ],
      };
    },
  },
  {
    id: "y_landlord", domain: "wealth", channel: "bad", once: true, ages: [19, 30], when: s => grownUp(s) && s.home === "rent", p: () => 0.08,
    choice: (s, ctx) => {
      const cold = snowy(s);
      const [lead, then] = scene(ctx, [
        cold ? ["It's January, the heat in your apartment has been out for four days, and the landlord isn't answering.", "With the heat out in January,"] : ["It's August, the air conditioning died a week ago, and the landlord isn't answering.", "With the air conditioning dead in August,"],
        ["A brown stain on the ceiling has started to drip into a bucket, and the bucket is filling faster.", "With the ceiling dripping into a bucket,"],
        ["Your landlord kept your whole security deposit for “cleaning,” and you left the place spotless.", "Out a whole security deposit,"],
        ["The mice in your kitchen have grown bold enough to watch you cook.", "With mice in the kitchen,"],
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "y_landlord.insist", label: "Call every day and put it in writing", hint: "a paper trail", act: "insist", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${then} you called every day and sent a letter by certified mail, {and on day nine a repairman finally showed up.|and the landlord, sick of you, fixed it.}`), mood: 0 }) },
          { id: "y_landlord.fix", label: "Fix it yourself", hint: s.year >= 2007 ? "a hardware store and a YouTube video" : "a hardware store and a borrowed manual", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you went to the hardware store and fixed it yourself, {with advice from a man in an orange apron who had clearly been waiting all day for someone to ask.|badly, then well.} You deducted the parts from the rent and dared the landlord to object.`), mood: 2 }) },
          { id: "y_landlord.city", label: s.year >= 1970 ? "Call the city housing inspector" : "Get the neighbors together", hint: "strength in numbers", act: "seekHelp", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you {called the city's housing inspector|knocked on every door in the building}, and {the landlord got a citation and a sudden interest in maintenance.|five neighbors signed a letter, and things got fixed in a week.}`), mood: 2 }) },
          { id: "y_landlord.dispute", label: "Take it to small-claims court", hint: "your day in court", act: "dispute", style: "risk", weight: 0.12, apply: (s2, c) => (c.roll("wealth", "good", 0.55) ? { text: `${then} you took your landlord to small-claims court with a folder of photos and receipts, and the judge ruled for you in about four minutes.`, mood: 4 } : { text: `${then} you took your landlord to small-claims court, and the judge split the difference. You got half back and a story.`, mood: 0 }) },
          { id: "y_landlord.move", label: "Move out", hint: "life is too short", act: "moveHome", style: "self", weight: 0.18, apply: (s2, c) => ({ text: c.w(`${then} you decided life was too short, found a new place {across town|closer to work}, and {left the old keys in the drop box with a note.|never looked back.}`), mood: 1 }) },
        ],
      };
    },
  },
  A("y_furniture", [19, 30], 0.25, s => [`Your first furniture was {a futon that was never comfortable as a couch or a bed,|a kitchen table from a yard sale,|cinderblocks and a plank for a bookshelf,} and {a ${s.year >= 1985 ? "lamp from IKEA you built with one missing screw" : "lamp from the Salvation Army"}.|a TV on a milk crate.}`, "You and a friend carried a couch home from the curb {three blocks|up four flights of stairs}, and it was the best couch you ever owned.", `Your ${s.year >= 2010 ? "first apartment" : "first place"} had {one fork, two plates and a mattress on the floor|a hand-me-down recliner from your uncle and nothing else|a card table and four mismatched chairs}, and it was perfect.`], { when: s => grownUp(s) && s.flags.firstPlace && s.flags.firstPlace.kind !== "home", mood: 2 }),
  A("y_moveDay", [19, 30], 0.12, s => [`Moving day: {four friends, a rented ${s.year >= 1975 ? "U-Haul" : "truck"}, and a couch that would not fit through the door|you, your dad's pickup and a mattress tied on with clothesline}, {paid for in pizza.|and nobody's back was the same after.}`, "You moved {on the hottest day of July|in a sleet storm}, and by midnight you were sitting on boxes in your new place, eating cold lo mein, happy.", "You moved apartments and found out how much stuff you owned, and that most of it was cords and coffee mugs."], { when: s => grownUp(s) && s.home === "rent", mood: 1 }),
  A("y_apartmentLife", [19, 30], 0.12, s => ["Your upstairs neighbor {played the tuba at seven every morning|had a dog that ran laps at midnight|seemed to be bowling}, and you got to know each other's lives through the ceiling.", `${snowy(s) ? "The radiator in your apartment clanked all winter, and you learned to dry socks on it." : "The ceiling fan in your apartment wobbled like it was thinking about leaving, and you slept under it anyway."} {You loved that place.|Every apartment after was nicer and none was better.}`, s.year < 1995 ? "You did laundry at the laundromat on Sunday nights with a roll of quarters and a paperback, and it became the quietest hour of your week." : "You did laundry in the building's basement, where one machine ate quarters and the other ate socks."], { when: s => grownUp(s) && s.home === "rent", mood: 2 }),

  // ---------- money ----------
  {
    id: "y_creditCard", domain: "wealth", channel: "change", once: true, ages: [19, 27], when: s => grownUp(s) && s.employed && s.year >= 1958 && !s.flags.card, p: () => 0.15,
    choice: (s, ctx) => {
      const y = s.year;
      const card = y < 1966 ? "a charge card from Sears" : y < 1976 ? "a BankAmericard" : y < 2015 ? "a pre-approved credit card" : "a credit card with a cash-back offer";
      const big = y < 1980 ? "a stereo" : y < 2000 ? "a big TV" : y < 2015 ? "a new laptop" : "a new phone";
      return {
        prompt: `${scene(ctx, [`${cap(card)} came in the mail, already in your name, with a limit higher than your rent.`, `The cashier offered you ${card} and ten percent off today's purchase.`, `Your first real paycheck came, and so did an offer for ${card}.`])} What do you do?`,
        options: [
          { id: "y_creditCard.paid", label: "Use it, pay it off every month", hint: "build credit, owe nothing", act: "save", style: "safe", weight: 0.3, apply: s2 => { s2.flags.card = "paid"; return { text: `You got ${card} and paid the whole balance every month, and your credit score quietly grew into something the bank would love later.`, mood: 1 }; } },
          { id: "y_creditCard.minimum", label: "Use it and pay the minimum", hint: "future you", act: "borrow", style: "risk", weight: 0.25, apply: (s2, c) => { s2.flags.card = "minimum"; debt(s2, 0.08); return { text: c.w(`You got ${card} and paid the minimum each month, {and the balance grew like a houseplant you never watered and somehow never died.|until a statement showed how much was interest, and you felt a little sick.}`), mood: -2 }; } },
          { id: "y_creditCard.emergency", label: "Keep it for emergencies", hint: "in the glove box", act: "insurance", style: "family", weight: 0.2, apply: s2 => { s2.flags.card = "emergency"; return { text: `You got ${card} and kept it in the glove box for emergencies. It rescued you exactly once, from a tow-truck bill, and went back in the glove box.`, mood: 1 }; } },
          { id: "y_creditCard.cut", label: "Cut it up", hint: "cash only", act: "avoid", style: "self", weight: 0.1, apply: s2 => { s2.flags.card = "none"; return { text: `You got ${card}, cut it into pieces over the trash can and stuck with cash, which drove every landlord and rental-car counter a little crazy.`, mood: 0 }; } },
          { id: "y_creditCard.spree", label: `Buy ${big} with it right now`, hint: "you deserve it", act: "borrow", style: "risk", weight: 0.15, apply: (s2, c) => { s2.flags.card = "spree"; debt(s2, 0.05); return { text: c.w(`You got ${card} and bought ${big} the same afternoon, {and it was wonderful for about a month.|and spent the next year paying it off, one small check at a time.}`), mood: 0 }; } },
        ],
      };
    },
  },
  {
    id: "y_carLoan", domain: "wealth", channel: "change", once: true, ages: [20, 30], when: s => grownUp(s) && s.employed && !s.flags.carLoan, p: () => 0.15,
    choice: (s, ctx) => {
      const y = s.year, old = s.flags.firstCar ? s.flags.firstCar.name : ctx.rng.pick(carOf(y));
      const fresh = y < 1975 ? "a new Ford Mustang" : y < 1985 ? "a new Honda Accord" : y < 1995 ? "a new Ford Ranger pickup" : y < 2005 ? "a new Toyota Camry" : y < 2015 ? "a new Honda Civic" : "a new Toyota RAV4";
      const price = usd(y, ctx.rng.pick([24000, 28000, 32000]));
      const lead = scene(ctx, [
        `${cap(old)} died in a parking lot for the third time this month.`,
        `The dealer says you can drive ${fresh} home today for “just” a monthly payment. The sticker says ${price}.`,
        `Your commute is forty minutes, and ${old} sounds like it's chewing gravel.`,
      ]);
      const set = (how, car) => s2 => { s2.flags.carLoan = { car, age: s2.age, how }; };
      return {
        prompt: `${lead} What do you drive?`,
        options: [
          { id: "y_carLoan.new", label: `Buy ${fresh} on a five-year loan`, hint: `${price}, sixty payments`, act: "borrow", style: "risk", weight: 0.25, apply: (s2, c) => { set("loan", fresh)(s2); debt(s2, 0.2); return { text: c.w(`You bought ${fresh} on a sixty-month loan, {and the new-car smell lasted about a year; the payment lasted five.|and drove it home with the windows down and the radio up, a little terrified.}`), mood: 4, big: true }; } },
          { id: "y_carLoan.used", label: "Buy a reliable used car with cash", hint: "boring and paid for", act: "save", style: "safe", weight: 0.3, apply: (s2, c) => { const car = c.rng.pick(carOf(y)); set("cash", car)(s2); spend(s2, 0.15); return { text: c.w(`You bought ${car} with cash after {a mechanic friend looked it over|reading every review you could find}, and {it ran forever.|it was boring and paid for, which was the whole idea.}`), mood: 2 }; } },
          { id: "y_carLoan.lease", label: y >= 1988 ? "Lease something" : "Buy it on the dealer's payment plan", hint: "a low monthly number", act: "borrow", style: "self", weight: 0.15, apply: (s2, c) => { set("lease", fresh)(s2); debt(s2, 0.1); return { text: c.w(y >= 1988 ? `You leased ${fresh}, {and checked the mileage every month like a stock price.|and turned it in three years later with a coffee stain you hoped they wouldn't see.}` : `You bought ${fresh} on the dealer's payment plan, and made every payment in person at the dealership on the first of the month.`), mood: 2 }; } },
          { id: "y_carLoan.fix", label: "Keep the old car running", hint: "one more year", act: "wait", style: "safe", weight: 0.2, apply: (s2, c) => { set("kept", old)(s2); return { text: c.w(`You kept ${old} alive {with duct tape, a used alternator and prayer,|by getting on a first-name basis with the mechanic,} and it outlived everyone's expectations, including the mechanic's.`), mood: 0 }; } },
          { id: "y_carLoan.none", label: "Go without a car", hint: "bike, bus, train", act: "exercise", style: "health", weight: 0.1, apply: (s2, c) => { set("none", "no car")(s2); return { text: c.w(`You sold ${old} for scrap and got around by {bike and bus|train and your own two feet}, and {your legs got strong and your savings got bigger.|you read forty books that year on the bus.}`), mood: 1 }; } },
        ],
      };
    },
  },
  {
    // 401(k) plans from 1981 (the IRS rules under section 401(k) of the 1978 Revenue Act); IRAs from 1974, Roth IRAs
    // from 1998.
    id: "y_401k", domain: "wealth", channel: "good", once: true, ages: [21, 30], when: s => working(s) && s.year >= 1982 && !s.flags.retirementPlan, p: () => 0.2,
    choice: (s, ctx) => {
      const ira = s.year >= 1998 ? "a Roth IRA" : "an IRA";
      return {
        prompt: `${scene(ctx, ["HR handed you a thick packet about the 401(k): the company matches the first few percent.", "A coworker who is about to retire told you the best thing he ever did was start saving at your age.", "Your paycheck came with a little card that said “Have you enrolled in the retirement plan?”"])} What do you do?`,
        options: [
          { id: "y_401k.match", label: "Put in enough to get the match", hint: "free money", act: "save", style: "safe", weight: 0.35, apply: s2 => { s2.flags.retirementPlan = "match"; return { text: "You signed up for the 401(k) and put in just enough to get the company match, and you mostly forgot about it, which was the point.", mood: 1 }; } },
          { id: "y_401k.max", label: "Put in as much as you can", hint: "future you says thanks", act: "save", style: "learn", weight: 0.1, apply: (s2, c) => { s2.flags.retirementPlan = "max"; return { text: c.w("You signed up for the 401(k) and put in as much as you could stand, {and lived on rice and beans for a while.|and checked the balance like a garden.}"), mood: 1 }; } },
          { id: "y_401k.later", label: "Not yet. You need the money now", hint: "rent first", act: "wait", style: "self", weight: 0.3, apply: s2 => { s2.flags.retirementPlan = "none"; return { text: "You put the 401(k) packet in a drawer. Rent came first, and retirement felt like something that happened to other people.", mood: 0 }; } },
          { id: "y_401k.ira", label: `Open ${ira} on your own`, hint: "your money, your choices", act: "invest", style: "risk", weight: 0.1, apply: (s2, c) => { s2.flags.retirementPlan = "ira"; return { text: c.w(`You opened ${ira} on your own and {read three books about index funds.|put in fifty dollars a month and never stopped.}`), mood: 1 }; } },
          { id: "y_401k.ask", label: "Ask someone who knows", hint: "a parent, an uncle, a mentor", act: "seekHelp", style: "family", weight: 0.15, apply: (s2, c) => { s2.flags.retirementPlan = "asked"; const who = parentWord(s2, c); return { text: c.w(`You called ${who} about the 401(k), {and got a forty-minute lecture on compound interest you were secretly glad of.|and found out ${pro(who)} had wished someone had told ${pro(who) === "they" ? "them" : pro(who) === "he" ? "him" : "her"} at your age.} You signed up for the match.`), mood: 2 }; } },
        ],
      };
    },
  },
  {
    // Health insurance: most Americans get it through work; from 2010 the Affordable Care Act let children stay on a
    // parent's plan until 26, and from 2014 its marketplace sold plans to everyone.
    id: "y_insurance", domain: "health", channel: "change", once: true, ages: [22, 30], when: s => grownUp(s) && s.year >= 1970 && !s.flags.insurance, p: () => 0.08,
    choice: (s, ctx) => {
      const y = s.year, market = y >= 2014 ? "a marketplace plan" : "an individual policy";
      const lead = scene(ctx, [
        y >= 2011 && s.age === 26 ? "You just turned 26, and the letter came: you're off your parents' health insurance." : "Your job doesn't come with health insurance, and you've been telling yourself you're young and fine.",
        "You sprained your ankle playing pickup basketball, and the urgent-care bill made you sit down.",
        s.employed ? "Your company switched insurance plans, and your share of the premium doubled." : "Between jobs, a COBRA letter came offering to keep your old insurance at a price that made you laugh.",
      ]);
      return {
        prompt: `${lead} What do you do about health insurance?`,
        options: [
          { id: "y_insurance.plan", label: `Buy ${market}`, hint: "a monthly bill, some peace", act: "insurance", style: "safe", weight: 0.35, apply: s2 => { s2.flags.insurance = "plan"; spend(s2, 0.04); return { text: `You bought ${market}, which cost more than your phone and less than your rent, and you slept better knowing it was there.`, mood: 1 }; } },
          { id: "y_insurance.none", label: "Go without and be careful", hint: "young and invincible", act: "avoid", style: "risk", weight: 0.25, apply: (s2, c) => { s2.flags.insurance = "none"; return { text: c.w("You went without health insurance for a while, {and looked both ways twice at every crosswalk.|and treated every cold with soup and stubbornness.|and were lucky, and knew it.}"), mood: -1 }; } },
          { id: "y_insurance.job", label: "Find a job with benefits", hint: "the real reason people take jobs", act: "jobHop", style: "safe", weight: 0.2, apply: (s2, c) => { s2.flags.insurance = "job"; return { text: c.w(`You started looking for work with benefits, and {a hospital, a school district and a grocery chain all called back.|you found one, and the first thing you did was get your teeth cleaned.}`), mood: 1 }; } },
          { id: "y_insurance.clinic", label: "Use the community health clinic", hint: "sliding scale", act: "seeDoctor", style: "health", weight: 0.12, apply: s2 => { s2.flags.insurance = "clinic"; return { text: "You found the community health clinic, which charged on a sliding scale, and a nurse practitioner there became your doctor for years.", mood: 1 }; } },
          { id: "y_insurance.family", label: "Ask family how they did it", hint: "someone has been here", act: "seekHelp", style: "family", weight: 0.08, apply: (s2, c) => { s2.flags.insurance = "plan"; const who = parentWord(s2, c); return { text: c.w(`You asked ${who} what to do about insurance, and ${pro(who)} helped you pick a plan at the kitchen table, {reading the fine print out loud.|with a highlighter and a pot of coffee.}`), mood: 2 }; } },
        ],
      };
    },
  },
  {
    // Moving back home: about a third of 18–34-year-olds lived with their parents around 2015, more after 2008 and
    // in 2020.
    id: "y_boomerang", domain: "move", channel: "change", once: true, ages: [21, 29], when: s => grownUp(s) && !s.employed && s.done.has("firstJob") && s.home === "rent" && (s.mother.alive || s.father.alive), p: () => 0.3,
    choice: (s, ctx) => {
      const y = s.year, bad = (y >= 2008 && y <= 2011) || y === 2020;
      const [lead, then] = scene(ctx, [
        [bad ? "The economy is a mess, your savings are almost gone, and rent is due." : "You're between jobs, your savings are almost gone, and rent is due.", "Out of work with rent due,"],
        [`${cap(parentWord(s, ctx))} called and said, “Your old room is still there,” in a voice that wasn't quite a joke.`, "Out of work and out of savings,"],
        ["Your roommate is moving out, the lease is up, and you have no job and no plan.", "With no job and the lease up,"],
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "y_boomerang.home", label: "Move back in with your parents", hint: "your old room, your old posters", act: "moveHome", style: "family", weight: 0.35, apply: (s2, c) => { s2.home = "parents"; return { text: c.w(`${then} you moved back into your old room, {under the same glow-in-the-dark stars on the ceiling.|and your parents were thrilled and then, by week three, a little less thrilled.|and paid your rent in yard work and dinner dishes.}`), mood: -1 }; } },
          { id: "y_boomerang.couch", label: "Couch-surf with friends", hint: "a month here, a month there", act: "socialize", style: "risk", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you couch-surfed with friends for a few months, {repaying them in cooking and dog walking,|learning the sound of every couch spring in town,} and found out who your real friends were. All of them, it turned out.`), mood: -1 }) },
          { id: "y_boomerang.shifts", label: "Pick up any shifts you can", hint: "keep the lights on", act: "sideJob", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${then} you picked up {temp work and weekend shifts|restaurant shifts and day labor|${y >= 2014 ? "delivery gigs" : "odd jobs"}} and kept the apartment, barely, while you looked for something real.`), mood: -2 }) },
          { id: "y_boomerang.cheaper", label: "Move somewhere cheaper", hint: "a fresh start, lower rent", act: "moveHome", style: "risk", weight: 0.1, apply: (s2, c) => { const to = placeWords(moveTo(s2, c)); return { text: c.w(`${then} you packed your car and moved to ${to}, where the rent was half and {the people were friendly|the job listings were longer}.`), mood: 1 }; } },
          { id: "y_boomerang.split", label: "Find a roommate to split the rent", hint: "half the bill", act: "negotiate", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you posted for a roommate and found {a nursing student who was never home|a quiet guy who played chess|a coworker of a friend}, and the rent was suddenly survivable.`), mood: 1 }) },
        ],
      };
    },
  },
  A("y_budget", [19, 28], 0.1, s => [s.year >= 2007 ? "You downloaded a budgeting app, connected every account, and discovered you spent a truly unreasonable amount on takeout." : "You started a budget in a spiral notebook, with envelopes for rent, groceries and fun, and the fun envelope was always empty first.", `Payday was every other Friday, and by the Thursday before, you were eating {ramen with a hard-boiled egg|peanut butter on everything|whatever was left in the freezer}. You learned to cook rice twelve ways.`, "Your first big grown-up bill came {from the dentist|from the car shop|from the vet}, and you sat at the kitchen table doing math you had been avoiding."], { when: s => grownUp(s) && s.employed, mood: 0 }),
  A("y_taxes", [19, 26], 0.12, s => [s.year < 1983 ? "You did your first tax return on the kitchen table with a pencil and the instruction booklet, and you got a refund of forty dollars and felt like a tycoon." : s.year < 2018 ? "You filed your first tax return on a 1040EZ and got a refund that you spent before it arrived." : "You filed your first tax return with an app, which asked you a hundred questions and then charged you to file.", "Tax season: you waited in line at the {H&R Block in the strip mall|library's free tax help table}, holding a shoebox of W-2s and receipts.", "You owed taxes for the first time, which nobody had warned you about, and you {paid it in installments.|called your dad, who laughed for a full minute.}"], { when: s => grownUp(s) && s.employed, mood: 0 }),
  A("y_carBreakdown", [19, 30], 0.08, (s, ctx) => [`Your car broke down {on the interstate at night|in the drive-through|on the way to a job interview}, and {a trucker stopped and helped you change the tire.|you called ${parentWord(s, ctx)} from the side of the road.|the tow truck driver told you his whole life story.}`, "Your car's check-engine light came on and stayed on for a year, and you learned to put a piece of tape over it.", "The transmission went on your car, and the repair cost more than the car was worth. You fixed it anyway, because you had to get to work."], { when: s => grownUp(s) && s.employed, mood: -2 }),

  // ---------- love and friends ----------
  {
    id: "y_datingScene", domain: "love", channel: "change", once: true, ages: [19, 30], when: s => atHome(s) && single(s), p: () => 0.1,
    choice: (s, ctx) => {
      const d = datingWay(s.year, ctx), f = bestFriend(s);
      const lead = scene(ctx, [
        `Everyone you know met someone through ${d.tool}, and your friends have been nagging you to try it.`,
        `You've been single a while, and one lonely Saturday night you looked at ${d.tool}.`,
        `${f ? f.call : "Your best friend"} sat you down and said it was time to put yourself out there, and suggested ${d.tool}.`,
      ]);
      return {
        prompt: `${lead} How do you go about it?`,
        options: [
          { id: "y_datingScene.honest", label: "Be completely yourself", hint: "the real you, typos and all", act: "pursue", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w(`You ${d.how} and were completely yourself, {weird hobbies and all,|including the thing about your houseplants,} and {the people who replied were your kind of weird.|you went on four dates, made one friend, and learned what you were looking for.}`), mood: 3 }) },
          { id: "y_datingScene.friend", label: f ? `Let ${f.call} handle it` : "Let a friend help", hint: "someone who knows you", act: "seekHelp", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(`You let ${f ? f.call : "a friend"} help, and ${f ? they(f) : "they"} {wrote a description of you that was kinder than you would have been,|vetoed three of your choices and was right every time,} and {you laughed about it for years.|it led to the best first date you had that year.}`), mood: 3 }) },
          { id: "y_datingScene.yes", label: "Say yes to every first date for a month", hint: "volume is a strategy", act: "pursue", style: "risk", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You ${d.how} and said yes to every first date for a month: {a man who talked only about his ex,|a woman who brought her own hot sauce,|a mini-golf game that went to extra holes,|someone who turned out to be your coworker's cousin,} and {at least two you'd see again.|a lot of stories for your friends.}`), mood: 2 }) },
          { id: "y_datingScene.picky", label: "Be picky. Really picky.", hint: "you know what you want", act: "wait", style: "safe", weight: 0.15, apply: (s2, c) => ({ text: c.w(`You ${d.how} and were very picky, {turning down everyone who listed their favorite movie as a sports highlight reel.|and went on exactly one date, which was fine.} You decided you were fine on your own for now.`), mood: 0 }) },
          { id: "y_datingScene.real", label: "Skip it and meet people in real life", hint: "a class, a league, a bar", act: "socialize", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You skipped ${d.tool} and signed up for {a cooking class|a kickball league|a running club|trivia night at the bar}, and {met a lot of people, a few of whom you liked.|didn't meet anyone special, but made three new friends.}`), mood: 3 }) },
        ],
      };
    },
  },
  A("y_badDate", [19, 30], 0.06, s => [`On a first date {your date ordered for you|your date's mom called three times|the restaurant caught fire, a little|you both realized you'd gone to the same summer camp and hated it}, and {you laughed about it with your friends for years.|you went home and ate cereal, relieved.}`, s.year >= 2012 ? "You matched with someone whose photos turned out to be eight years old and taken from a very flattering angle. You had a nice time anyway." : "You went on a blind date your aunt set up, and the date spent the whole dinner talking about their boat.", "Your first date was at a bowling alley, and you bowled a 42, and your date bowled a 210 and was very nice about it."], { when: s => atHome(s) && single(s), mood: 1 }),
  {
    id: "y_friendsWedding", domain: "family", channel: "good", max: 2, cooldown: 2, ages: [21, 30], when: s => atHome(s) && !s.studying, p: s => (s.age >= 25 ? 0.15 : 0.08),
    choice: (s, ctx) => {
      const f = bestFriend(s), name = f ? f.call : ctx.rng.pick(["your college roommate", "your oldest friend", "your friend from work"]);
      const role = s.sex === "female" ? "bridesmaid" : "groomsman", outfit = s.sex === "female" ? "the dress, the shoes and the bachelorette weekend" : "the tux rental and the bachelor party";
      const where = ctx.rng.pick(["a barn upstate", "a hotel ballroom", "a church you grew up in", s.year >= 1990 ? "a beach in Mexico" : "a lake resort", "a winery", "a backyard"]);
      const lead = scene(ctx, [
        `${cap(name)} is getting married at ${where}, and asked you to be a ${role}.`,
        `It's your third wedding this summer, and now ${name}'s invitation is on the fridge too.`,
        s.year >= 2015 ? `${cap(name)} and ${f ? their(f) : "their"} partner are finally getting married, and you're on the short list.` : `${cap(name)} is getting married, and the save-the-date has a photo of them at the county fair.`,
      ]);
      return {
        prompt: `${lead} How do you handle it?`,
        options: [
          { id: "y_friendsWedding.party", label: `Say yes to being a ${role}`, hint: outfit, act: "socialize", style: "family", weight: 0.3, apply: (s2, c) => { spend(s2, 0.03); return { text: c.w(`You were a ${role} at ${name}'s wedding, {paid for ${outfit}, and cried at the vows anyway.|and held the rings, nervously, the whole ceremony.|and danced with ${name}'s grandmother to a Motown song.}`), mood: 4 }; } },
          { id: "y_friendsWedding.toast", label: "Give a toast", hint: "two minutes, one embarrassing story", act: "talk", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`At ${name}'s wedding you gave a toast {that started with a joke and ended with the whole room crying,|that ran a little long but got a standing ovation from the uncles,} and people came up to you about it all night.`), mood: 4 }) },
          { id: "y_friendsWedding.date", label: dating(s) ? `Bring ${s.partner.call}` : "Bring a friend as your plus-one", hint: "someone to dance with", act: "pursue", style: "risk", weight: 0.15, apply: (s2, c) => ({ text: c.w(dating(s2) ? `You brought ${s2.partner.call} to ${name}'s wedding, {and everyone asked when it would be your turn.|and the two of you closed down the dance floor.}` : `You brought a friend as your plus-one to ${name}'s wedding, {and the two of you won the dance-off.|and you sat at the singles table and had the best time in the room.}`), mood: 3 }) },
          { id: "y_friendsWedding.solo", label: "Go solo and dance with everyone", hint: "the singles table is fun", act: "socialize", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You went to ${name}'s wedding alone and {danced with everyone, including the flower girl,|caught the bouquet by accident,|stayed until the staff stacked the chairs}, and it was one of the best nights of the year.`), mood: 3 }) },
          { id: "y_friendsWedding.regrets", label: "Send a nice gift and your regrets", hint: "your budget says no", act: "save", style: "safe", weight: 0.15, apply: (s2, c) => ({ text: c.w(`You couldn't afford ${name}'s wedding, so you sent {a good stand mixer from the registry|a card with a long letter inside} and your regrets, and ${name} {called to say thank you.|understood, and sent you a slice of cake in the mail.}`), mood: 0 }) },
        ],
      };
    },
  },
  A("y_bachelor", [21, 30], 0.05, s => [`You went to a ${s.sex === "female" ? "bachelorette" : "bachelor"} party in {Las Vegas|Nashville|New Orleans|a rented lake house|Atlantic City}, and {what happened there stayed there, mostly.|you were the one who made sure everyone got home.|someone lost a shoe and nobody ever found it.}`, `The ${s.sex === "female" ? "bachelorette" : "bachelor"} weekend involved matching T-shirts, a party bus and a karaoke version of “{Don't Stop Believin'|Sweet Caroline|I Will Survive}” that you'll never live down.`, "You helped plan a friend's bachelor-or-bachelorette weekend, made a spreadsheet for the costs, and became the group's treasurer for life."], { when: s => atHome(s) && !s.studying, mood: 3 }),
  {
    id: "y_meetParents", domain: "love", channel: "change", tags: ["spouse"], about: "partner", once: true, ages: [19, 30], when: s => atHome(s) && dating(s) && s.age > (s.datingSince ?? s.age), p: () => 0.25,
    choice: (s, ctx) => {
      const P = s.partner, n = P.call;
      const [lead, then, gift, gifted] = scene(ctx, [
        [`${n} invited you home for Thanksgiving to meet the whole family, including a grandmother who is “very direct.”`, `Meeting ${n}'s family at Thanksgiving,`, "Bring something homemade", "{a homemade pie|your grandmother's banana bread|a casserole you had practiced twice}"],
        [`You're meeting ${n}'s parents for the first time, at a steakhouse ${their(P)} dad picked.`, `Meeting ${n}'s parents at a steakhouse,`, "Bring flowers for the table", "{flowers for the table|a little box of chocolates from a good bakery}"],
        [`${n}'s family reunion is this weekend, and you're the new person everyone will be looking at.`, `At ${n}'s family reunion,`, "Bring a dish for the potluck", "{a big bowl of potato salad|a pan of brownies|your famous baked beans}"],
      ]);
      return {
        prompt: `${lead} How do you make a good impression?`,
        options: [
          { id: "y_meetParents.pie", label: gift, hint: "it never hurts", act: "care", style: "family", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${then} you brought ${gifted}, and ${n}'s mother {made a fuss over it.|said it was the nicest thing anyone had brought in years.}`), mood: 3 }) },
          { id: "y_meetParents.honest", label: "Answer every question honestly", hint: "the job, the plans, the debt", act: "talk", style: "social", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${then} you answered every question honestly, {even about your student loans,|even the one about your intentions,} and ${n}'s ${c.rng.pick(["father", "mother", "grandmother"])} said later that ${n} had found someone straightforward.`), mood: 3 }) },
          { id: "y_meetParents.common", label: "Find common ground", hint: "football, gardening, old movies", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you {talked football with ${n}'s dad for an hour|helped ${n}'s mom in the garden|watched an old western with ${n}'s grandfather}, and {you were in.|${n} looked at you like you had performed a miracle.}`), mood: 4 }) },
          { id: "y_meetParents.dishes", label: "Offer to do the dishes", hint: "the oldest trick", act: "care", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you got up and did the dishes without being asked, {and ${n}'s aunt told everyone.|and ended up having the best conversation of the day at the sink.}`), mood: 3 }) },
          { id: "y_meetParents.short", label: "Keep it short and polite", hint: "in and out", act: "avoid", style: "safe", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you kept it polite and short, {and ${n} said it went fine, which you chose to believe.|and it was fine, and the second visit was much easier.}`), mood: 0 }) },
        ],
      };
    },
  },
  {
    // Living together without marrying: rare before the 1970s, common by the 1990s; s.rel does not change.
    id: "y_movingIn", domain: "love", channel: "change", tags: ["spouse"], about: "partner", once: true, ages: [20, 30],
    when: s => grownUp(s) && dating(s) && s.age - (s.datingSince ?? s.age) >= 1 && !s.flags.livingTogether, p: s => (s.year < 1970 ? 0.05 : s.year < 1985 ? 0.15 : 0.25),
    choice: (s, ctx) => {
      const P = s.partner, n = P.call, old = s.year < 1975;
      const lead = scene(ctx, [
        `You and ${n} spend every night at one place or the other, and you're paying two rents.`,
        `${n} asked, over takeout, whether you two should just get a place together.`,
        old ? `You and ${n} want to live together, and ${parentWord(s, ctx)} would be scandalized.` : `${n}'s lease is up, and the two of you have been looking at apartments "just for fun."`,
      ]);
      return {
        prompt: `${lead} Do you move in together?`,
        options: [
          { id: "y_movingIn.yes", label: "Move in together", hint: "one lease, one couch", act: "moveHome", style: "family", weight: 0.4, apply: (s2, c) => { s2.flags.livingTogether = s2.age; s2.home = s2.home === "own" ? "own" : "rent"; return { text: c.w(`You and ${n} moved in together, {and discovered that one of you folds towels in thirds and the other is wrong.|and the first night you assembled a bookshelf without breaking up.|and put both names on the mailbox with a label maker.}`), mood: 5, big: true }; } },
          { id: "y_movingIn.wait", label: "Not until you're sure", hint: "no rush", act: "wait", style: "safe", weight: 0.25, apply: () => ({ text: `You told ${n} you wanted to wait a little before moving in together. ${cap(they(P))} understood, mostly.`, mood: 0 }) },
          { id: "y_movingIn.separate", label: "Keep your own places", hint: "you like your space", act: "avoid", style: "self", weight: 0.12, apply: () => ({ text: `You and ${n} decided to keep your own places, and to be honest you both liked having somewhere to go home to.`, mood: 0 }) },
          { id: "y_movingIn.pet", label: "Adopt a pet together first", hint: "a trial run", act: "care", style: "social", weight: 0.13, apply: (s2, c) => { const k = c.rng() < 0.6 ? "dog" : "cat", name = c.rng.pick(PET[k].names(s2.year)); if (!s2.flags.pet || s2.age - s2.flags.pet.since >= 10) s2.flags.pet = { kind: k, name, noun: PET[k].noun, since: s2.age }; return { text: `You and ${n} adopted a ${k} named ${name} as a “trial run,” and within a month you had moved in together because ${name} needed a stable home.`, mood: 5 }; } },
          { id: "y_movingIn.ask", label: "Ask your family what they think", hint: "for better or worse", act: "talk", style: "family", weight: 0.1, apply: (s2, c) => { const who = parentWord(s2, c), p0 = pro(who), poss = p0 === "they" ? "their" : p0 === "he" ? "his" : "her"; return { text: c.w(old ? `You asked ${who} about moving in with ${n}, and {the silence on the phone was very long.|${p0} said ${p0 === "they" ? "they'd" : `${p0}'d`} rather you got married first, and you decided to wait a while.}` : `You asked ${who} about moving in with ${n}, and ${p0} said, “Finally,” {which settled it.|and offered ${poss} old dining table.}`), mood: 1 }; } },
        ],
      };
    },
  },
  {
    id: "y_longDistance", domain: "love", channel: "bad", tags: ["spouse"], about: "partner", once: true, ages: [19, 30], when: s => atHome(s) && dating(s), p: () => 0.06,
    choice: (s, ctx) => {
      const P = s.partner, n = P.call, y = s.year;
      const city = ctx.rng.pick(["Seattle", "Atlanta", "Denver", "Boston", "Minneapolis", "Houston", "Phoenix"]);
      const talk = y < 1990 ? "long phone calls after eleven, when the rates went down" : y < 2005 ? "late-night phone calls and long emails" : y < 2011 ? "Skype every night" : "FaceTime every night";
      const lead = scene(ctx, [
        `${n} got a job offer in ${city}, and ${they(P)} want${they(P) === "they" ? "" : "s"} to take it.`,
        `${n} got into a graduate program in ${city}, two time zones away.`,
        `${n} has to move to ${city} to take care of a parent, maybe for a year.`,
      ]);
      return {
        prompt: `${lead} What do you two do?`,
        options: [
          { id: "y_longDistance.calls", label: "Make it work long-distance", hint: talk, act: "talk", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w(`When ${n} moved to ${city}, you made it work with ${talk}, {and you learned to talk about everything because you couldn't just sit together.|and fell asleep on the phone more nights than not.}`), mood: 1 }) },
          { id: "y_longDistance.visit", label: "Visit once a month", hint: "frequent flier", act: "travel", style: "risk", weight: 0.2, apply: (s2, c) => { spend(s2, 0.05); return { text: c.w(`When ${n} moved to ${city}, you visited once a month, {and the airport became a place of very good and very bad goodbyes.|and learned every cheap flight and every bus route between you.}`), mood: 2 }; } },
          { id: "y_longDistance.follow", label: `Move to ${city} too`, hint: "a leap", act: "moveHome", style: "risk", weight: 0.15, when: s2 => !s2.studying, apply: (s2, c) => { moveTo(s2, c); return { text: c.w(`When ${n} took the move to ${city}, you went too, {packing a U-Haul with everything you owned,|leaving a job you liked for a person you loved,} and {it was the right call.|the first winter was hard, and you got through it together.}`), mood: 3, big: true }; } },
          { id: "y_longDistance.stay", label: `Ask ${n} to stay`, hint: "say what you want", act: "insist", style: "self", weight: 0.15, apply: (s2, c) => (c.roll("love", "good", 0.4) ? { text: `You asked ${n} not to move to ${city}, and after a long weekend of talking, ${they(P)} stayed. You hoped it was the right thing for both of you.`, mood: 2 } : { text: `You asked ${n} not to move to ${city}, and ${they(P)} went anyway, and the two of you tried to make the distance work.`, mood: -2 }) },
          { id: "y_longDistance.wait", label: "Take it a month at a time", hint: "no promises", act: "wait", style: "safe", weight: 0.2, apply: () => ({ text: `When ${n} moved to ${city}, you agreed to take it a month at a time, without any big promises, and it was easier than you feared.`, mood: 0 }) },
        ],
      };
    },
  },
  A("y_holidayQuestions", [23, 30], 0.07, ["At Thanksgiving your aunt asked whether you were seeing anyone, and then whether you had tried church, and then whether you had tried her neighbor's son.", "At every holiday a relative asked about your love life, and you developed a short, cheerful answer that ended the conversation in eleven seconds.", "Your grandmother asked if you were “still single,” and you said yes, and she said, “Good, take your time,” and you loved her for it."], { when: s => atHome(s) && single(s), mood: 1 }),
  {
    id: "y_friendDrift", domain: "family", channel: "bad", once: true, ages: [21, 30], when: s => atHome(s) && !!bestFriend(s), p: () => 0.1,
    choice: (s, ctx) => {
      const f = bestFriend(s), n = f.call;
      const [lead, then] = scene(ctx, [
        [`You realized you haven't talked to ${n} in four months, and you used to talk every day.`, `After four months of silence with ${n},`],
        [`${n} moved across the country, and the calls have gotten shorter and further apart.`, `With ${n} across the country,`],
        [`${n} has a new life, new friends and a new way of talking, and you're not sure where you fit.`, `Feeling ${n} drift into a new life,`],
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "y_friendDrift.call", label: `Call ${n} tonight`, hint: "just pick up the phone", act: "talk", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${then} you called ${them(f)}, and {the two of you talked for three hours like no time had passed.|${n} said, “I was just thinking about you,” and meant it.}`), mood: 4 }) },
          { id: "y_friendDrift.trip", label: "Plan a trip together", hint: "a weekend, just the two of you", act: "travel", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you planned a weekend trip together {to a cabin with no Wi-Fi|to the town where you grew up|to {trip}}, and {it became a yearly tradition.|you laughed so hard you had to pull the car over.}`), mood: 5 }) },
          { id: "y_friendDrift.letter", label: "Write a real letter", hint: "paper and a stamp", act: "talk", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you wrote ${n} a real letter, on paper, about {what ${their(f)} friendship had meant to you|the summer you were both sixteen}, and ${they(f)} kept it on ${their(f)} fridge for years.`), mood: 4 }) },
          { id: "y_friendDrift.let", label: "Let it be. People drift", hint: "no hard feelings", act: "avoid", style: "self", weight: 0.2, apply: () => ({ text: `${then} you let it be. Some friendships go quiet without ending, and you still smile when ${n}'s name comes up.`, mood: -1 }) },
          { id: "y_friendDrift.online", label: s.year >= 2006 ? "Like everything they post" : "Send a card on holidays", hint: "the small threads", act: "socialize", style: "safe", weight: 0.15, apply: (s2, c) => ({ text: s2.year >= 2006 ? `${then} you kept up by liking everything ${n} posted, which was not the same as talking, but it was something.` : `${then} you sent ${n} a card every Christmas and on ${their(f)} birthday, and ${they(f)} always sent one back.`, mood: 0 }) },
        ],
      };
    },
  },
  A("y_newFriends", [23, 30], 0.08, ["Making friends as a grown-up turned out to require a schedule: {trivia night on Tuesdays,|a book club that rarely read the book,|a kickball league with a lot of beer,} and slowly a few strangers became your people.", "You and a coworker started getting lunch on Fridays, and somewhere around the third month you realized you had a new best friend.", "You met your neighbors at a {building barbecue|block party|snowed-in night when the power went out}, and two of them became the friends you called when anything happened."], { when: s => grownUp(s), mood: 3 }),
  A("y_reunion", [27, 29], 0.35, s => [`You went to your ten-year high school reunion {in the school gym|at a hotel ballroom|at a bar downtown}, and {the popular kids were nicer now,|everyone looked older except your old chemistry teacher,|you danced to ${s.year < 1990 ? "the same songs from senior prom" : "songs you had forgotten you knew"},} and you drove home thinking about who you used to be.`, s.year >= 2008 ? "You skipped your ten-year reunion because you had already seen everyone's lives on Facebook, and then you looked at the photos and wished you had gone." : "You got the invitation to your ten-year reunion and went, nervous, and it turned out everyone else was nervous too.", "At your ten-year reunion, {the class clown was a dentist now,|your old crush was married with three kids,|somebody had brought the old yearbook,} and {you laughed more than you had in months.|you exchanged numbers with three people you actually called.}"], { when: s => atHome(s), mood: 3 }),

  // ---------- work ----------
  A("y_firstWeek", [18, 28], 0.4, s => [`Your first week as ${s.job ? an(s.job.title) : "a new hire"}: {a badge photo you hated,|a desk that wobbled,|a locker and a name tag,} {and a coworker who showed you where the good coffee was hidden.|and a training binder thicker than a phone book.|and a boss who remembered your name on day one.}`, "On your first day at the new job you got there forty minutes early and sat in your car in the parking lot, too nervous to go in.", `At your first real job you learned {where the copier jammed,|which manager to avoid,|that “quick question” never means quick,} and {by Friday you felt like you belonged.|by Friday you were too tired to go out.}`], { when: s => working(s) && s.job.since === s.age, mood: 2 }),
  {
    id: "y_badBoss", domain: "career", channel: "bad", once: true, ages: [19, 30], when: s => working(s), p: () => 0.06,
    choice: (s, ctx) => {
      const [lead, then] = scene(ctx, [
        ["Your boss took credit for your project in a meeting, using your exact words.", "After your boss took credit for your work,"],
        ["Your manager yells, in front of customers, about things that aren't your fault.", "With a manager who yelled in front of customers,"],
        [s.year >= 2005 ? "Your boss texts you at eleven at night and expects an answer by eleven-oh-five." : "Your boss calls you at home on Sundays and expects you to pick up.", "With a boss who never let you off the clock,"],
        ["Your manager changes your schedule with a day's notice, every week.", "With a schedule that changed every week,"],
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "y_badBoss.document", label: "Write it all down and go to HR", hint: "dates, times, a paper trail", act: "seekHelp", style: "safe", weight: 0.2, apply: (s2, c) => (c.roll("career", "good", 0.45) ? { text: c.w(`${then} you kept a log and took it to HR, and a month later your boss was {quietly moved to another department.|suddenly very polite.}`), mood: 3 } : { text: `${then} you kept a log and took it to HR, who thanked you for your feedback, and nothing changed except your boss's mood.`, mood: -2 }) },
          { id: "y_badBoss.talk", label: "Talk to your boss directly", hint: "calm, specific, scary", act: "talk", style: "social", weight: 0.2, apply: (s2, c) => (c.roll("career", "good", 0.5) ? { text: c.w(`${then} you asked for ten minutes and said it plainly, and your boss {was quiet a long time and then said, “Fair.”|apologized, awkwardly, and things got better.}`), mood: 3 } : { text: `${then} you talked to your boss directly, and it went about as badly as you'd feared. At least now you knew.`, mood: -2 }) },
          { id: "y_badBoss.mentor", label: "Find a mentor and keep your head down", hint: "outlast them", act: "pushThrough", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${then} you found an older coworker who {had survived three bosses like this one,|knew where all the bodies were buried, figuratively,} and kept your head down. {Eighteen months later the boss left, and you were still there.|You learned more from that coworker than from any training.}`), mood: 0 }) },
          { id: "y_badBoss.transfer", label: "Ask for a transfer", hint: "another team, another store", act: "jobHop", style: "risk", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you asked for a transfer to {another team|the store across town|the night shift}, {and got it, and the new boss was a decent human being.|and the relief was almost physical.}`), mood: 2 }) },
          { id: "y_badBoss.quit", label: "Quit", hint: "life is too short", act: "quitJob", style: "self", weight: 0.15, apply: (s2, c) => { s2.employed = false; s2.unemployedFor = 1; return { text: c.w(`${then} you quit, {and on your last day you left a thank-you card for everyone except your boss.|and walked out into a sunny afternoon feeling lighter than you had in a year.}`), mood: 1 }; } },
        ],
      };
    },
  },
  {
    id: "y_raise", domain: "career", channel: "good", once: true, ages: [22, 30], when: s => working(s) && s.age - (s.job.since ?? s.age) >= 1, p: () => 0.08,
    choice: (s, ctx) => {
      const site = s.year >= 2008 ? "Glassdoor" : s.year >= 1998 ? "salary websites" : "the help-wanted ads";
      const [lead, then] = scene(ctx, [
        [`You looked at ${site} and found out you're paid less than everyone doing your job.`, `Underpaid by the going rate,`],
        ["A new hire mentioned their salary at lunch, and it's more than yours.", "After learning the new hire made more than you,"],
        ["You've been doing two people's jobs since your coworker quit, and your pay hasn't moved.", "Doing two people's jobs for one paycheck,"],
      ]);
      return {
        prompt: `${lead} Do you ask for a raise?`,
        options: [
          { id: "y_raise.ask", label: "Ask, with the numbers in hand", hint: "a folder of facts", act: "negotiate", style: "risk", weight: 0.3, apply: (s2, c) => { if (c.roll("career", "good", 0.5)) { s2.income *= 1.08; return { text: c.w(`${then} you walked in with the numbers and asked for a raise, {and got it, plus an apology.|and your boss said yes before you finished your speech.}`), mood: 5 }; } return { text: `${then} you asked for a raise with the numbers in hand, and got a smaller one than you asked for. It was still more than you had.`, mood: 1 }; } },
          { id: "y_raise.offer", label: "Get another offer first", hint: "leverage", act: "jobHop", style: "risk", weight: 0.15, apply: (s2, c) => { if (c.roll("career", "good", 0.5)) { s2.income *= 1.12; return { text: `${then} you interviewed elsewhere, came back with an offer, and your company matched it. You stayed, for now, with a lot more money.`, mood: 4 }; } s2.income *= 1.1; return { text: `${then} you interviewed elsewhere and your company wouldn't match the offer, so you took the new job and left with a handshake.`, mood: 2 }; } },
          { id: "y_raise.wait", label: "Work harder and wait for review season", hint: "let the work speak", act: "wait", style: "safe", weight: 0.3, apply: (s2, c) => { if (c.roll("career", "good", 0.3)) { s2.income *= 1.04; return { text: `${then} you kept your head down until review season, and the raise was a little better than average.`, mood: 1 }; } return { text: `${then} you waited for review season, and got the standard two percent and a pizza party.`, mood: -1 }; } },
          { id: "y_raise.mentor", label: "Ask a mentor how to do it", hint: "practice the speech", act: "seekHelp", style: "learn", weight: 0.15, apply: (s2, c) => { s2.income *= 1.05; return { text: c.w(`${then} you asked a mentor how to ask for a raise, practiced the speech {in the car|in the mirror} six times, and got a modest raise and a lot more confidence.`), mood: 3 }; } },
          { id: "y_raise.no", label: "Don't rock the boat", hint: "you're lucky to have a job", act: "avoid", style: "self", weight: 0.1, apply: () => ({ text: `${then} you decided not to ask, telling yourself you were lucky to have a job. You weren't sure you believed it.`, mood: -2 }) },
        ],
      };
    },
  },
  {
    id: "y_moveForWork", domain: "move", channel: "change", once: true, ages: [22, 30], when: s => working(s) && atHome(s), p: () => 0.05,
    choice: (s, ctx) => {
      const to = ctx.rng.weighted(BIG.filter(([c]) => c !== stateOf(s))), place = to === "DC" ? "Washington" : stateName(to);
      const P = dating(s) ? s.partner : null;
      const lead = scene(ctx, [
        `A company in ${place} offered you a job with a real raise and a moving allowance.`,
        `Your company is opening an office in ${place}, and they want you there by spring.`,
        `A friend from school in ${place} says there's a job on her team with your name on it.`,
      ]);
      const go = (s2, c, raise, text) => { moveTo(s2, c, [[to, 1]]); s2.income *= raise; return { text: c.w(text), mood: 4, big: true }; };
      return {
        prompt: `${lead} Do you move?`,
        options: [
          { id: "y_moveForWork.go", label: `Move to ${place}`, hint: "new city, new life", act: "moveHome", style: "risk", weight: 0.3, apply: (s2, c) => go(s2, c, 1.1, `You took the job and moved to ${place}, {knowing exactly one person there.|with a car full of boxes and a plant on the passenger seat.} {The first month you ate dinner alone a lot; by the sixth you had a favorite bar.|You got lost on the way to work every day for a week.}`) },
          { id: "y_moveForWork.negotiate", label: "Negotiate first", hint: "more money, more time", act: "negotiate", style: "social", weight: 0.15, apply: (s2, c) => (c.roll("career", "good", 0.5) ? go(s2, c, 1.15, `You negotiated a bigger raise and an extra month, then moved to ${place}, feeling like you'd won something.`) : { text: `You tried to negotiate the job in ${place}, and they offered it to someone else. You stayed put, a little relieved.`, mood: -1 }) },
          { id: "y_moveForWork.partner", label: P ? `Go only if ${P.call} comes` : "Go only if a friend comes too", hint: "a decision for two", act: "talk", style: "family", weight: 0.15, apply: (s2, c) => (c.rng() < 0.5 ? go(s2, c, 1.08, P ? `You asked ${P.call} to come to ${place}, and ${they(P)} said yes. You moved together, and the new apartment felt like an adventure.` : `You talked a friend into moving to ${place} with you, and you split an apartment with a view of a parking garage.`) : { text: P ? `You asked ${P.call} to come to ${place}, and ${they(P)} couldn't. You turned the job down.` : `Nobody could come with you to ${place}, and you decided not to go alone.`, mood: -1 }) },
          { id: "y_moveForWork.remote", label: s.year >= 2020 ? "Ask to do the job remotely" : "Ask to do the job from here", hint: "the best of both", act: "negotiate", style: "safe", weight: 0.1, apply: (s2, c) => (s2.year >= 2020 && c.rng() < 0.6 ? (() => { s2.income *= 1.06; return { text: `You asked to do the job in ${place} from home, and they said yes. You flew out once a quarter and kept your life where it was.`, mood: 4 }; })() : { text: `You asked to do the job in ${place} from where you were, and they said the job was in ${place}. You stayed.`, mood: -1 }) },
          { id: "y_moveForWork.stay", label: "Stay", hint: "your people are here", act: "wait", style: "family", weight: 0.3, apply: () => ({ text: `You thought hard about the job in ${place} and stayed where your people were. On hard days you wondered; on most days you didn't.`, mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "y_quarterLife", domain: "career", channel: "change", once: true, ages: [24, 30], when: s => grownUp(s), p: () => 0.08,
    choice: (s, ctx) => {
      const feed = s.year >= 2010 ? "Instagram" : s.year >= 2006 ? "Facebook" : "the alumni newsletter";
      const [lead, then] = scene(ctx, [
        [`You're ${s.age}, and on ${feed} everyone seems to be getting promoted, engaged or moving to Bali.`, `At ${s.age}, comparing yourself to ${feed},`],
        ["You lay awake at three in the morning wondering if this is it: this job, this apartment, this life.", "Lying awake wondering if this was it,"],
        ["You did everything you were supposed to, and you feel completely lost.", "Feeling lost after doing everything right,"],
      ]);
      return {
        prompt: `${lead} What do you do with the feeling?`,
        options: [
          { id: "y_quarterLife.therapy", label: "Talk to a therapist", hint: "someone outside your life", act: "counsel", style: "health", weight: 0.15, apply: (s2, c) => { stress(s2, -0.1); s2.flags.therapy = s2.flags.therapy ?? s2.age; return { text: c.w(`${then} you found a therapist, {a calm woman with a lot of plants,|a man with a cardigan and good questions,} and started to untangle what you actually wanted from what you'd been told to want.`), mood: 3 }; } },
          { id: "y_quarterLife.travel", label: "Take a big trip", hint: "see what's out there", act: "travel", style: "risk", weight: 0.1, apply: (s2, c) => { spend(s2, 0.1); return { text: c.w(`${then} you took two weeks and went to {trip}, {alone,|with a backpack and a notebook,} and came home not with answers but with better questions.`), mood: 4 }; } },
          { id: "y_quarterLife.family", label: "Call someone older who's been there", hint: "a parent, an uncle", act: "talk", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you called ${parentWord(s2, c)}, who said {they had felt exactly the same at your age, and it passed.|that nobody knows what they're doing, and the trick is to keep going anyway.} It helped.`), mood: 2 }) },
          { id: "y_quarterLife.run", label: "Start running, or writing, or both", hint: "move your body, empty your head", act: "exercise", style: "health", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you started {running before work|writing three pages every morning|running at dawn and writing at night}, and {the middle-of-the-night feelings got quieter.|you found out you had more to say than you thought.}`), mood: 3 }) },
          { id: "y_quarterLife.plan", label: "Make a five-year plan", hint: "a list makes it real", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you made a five-year plan on a legal pad, {and it changed four times in the first year, and that was fine.|and taped it inside a kitchen cabinet.}`), mood: 2 }) },
          { id: "y_quarterLife.accept", label: "Accept that nobody knows", hint: "you're right on time", act: "rest", style: "self", weight: 0.15, apply: () => ({ text: `${then} you decided that nobody really knows what they're doing at ${s.age}, and that you were right on time. You slept better.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "y_therapy", domain: "health", channel: "change", once: true, ages: [19, 30], when: s => atHome(s) && s.year >= 1965 && s.flags.therapy === undefined, p: () => 0.04,
    choice: (s, ctx) => {
      const y = s.year, online = y >= 2015;
      const [lead, then] = scene(ctx, [
        ["Your heart races before every meeting, and lately it races for no reason at all.", "With your heart racing for no reason,"],
        ["You haven't slept well in months, and you snap at people you love.", "After months of bad sleep,"],
        ["A sad thing happened this year, and you can't seem to put it down.", "Carrying a sadness you couldn't put down,"],
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "y_therapy.find", label: online ? "Find a therapist, maybe online" : "Find a therapist", hint: "a professional ear", act: "counsel", style: "health", weight: 0.3, apply: (s2, c) => { stress(s2, -0.15); s2.flags.therapy = s2.age; return { text: c.w(`${then} you found a therapist${online ? " who saw you by video on Tuesday nights" : ""}, {and the first session you cried in the first five minutes, and that was fine.|and learned that what you were feeling had a name and that names help.} Slowly, it got better.`), mood: 3 }; } },
          { id: "y_therapy.eap", label: s.employed ? "Use the free sessions through work" : "Try a free clinic", hint: "already paid for", act: "seekHelp", style: "safe", weight: 0.15, apply: (s2, c) => { stress(s2, -0.1); s2.flags.therapy = s2.age; return { text: c.w(`${then} you ${s2.employed ? "used the free counseling sessions your job offered" : "went to a sliding-scale clinic"}, {and six sessions turned out to be just enough to get your footing.|and a counselor taught you a breathing trick you used for the rest of your life.}`), mood: 2 }; } },
          { id: "y_therapy.doctor", label: "Talk to your doctor", hint: "start with a checkup", act: "seeDoctor", style: "health", weight: 0.15, apply: (s2, c) => { stress(s2, -0.08); return { text: c.w(`${then} you told your doctor, who {listened, ran some tests, and gave you a referral and a plan.|said you were far from the only one, and helped.}`), mood: 2 }; } },
          { id: "y_therapy.friend", label: "Tell a friend", hint: "say it out loud", act: "talk", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you told {friend} over coffee, and {friend} said, “Me too,” and the two of you checked on each other every week after that.`), mood: 2 }) },
          { id: "y_therapy.busy", label: "Keep busy and push it down", hint: "it'll pass", act: "pushThrough", style: "risk", weight: 0.2, apply: s2 => { stress(s2, 0.05); return { text: `${then} you kept busy and pushed it down. It didn't go away, but it got quieter, and you promised yourself you'd deal with it later.`, mood: -2 }; } },
        ],
      };
    },
  },
  A("y_mentor", [20, 30], 0.06, s => [`An older ${s.job ? s.job.title : "coworker"} took you under their wing, {taught you how things really worked,|took you to lunch once a month and asked hard questions,} and {you still hear that voice in your head when you're stuck.|years later you did the same for someone else.}`, "Your first boss {sat you down after a mistake and said, “Everybody does that once. Don't do it twice.”|gave you a book that changed how you think about work.} You never forgot it.", "A woman two desks over who had been there twenty years showed you the shortcuts, the politics and where the good snacks were, and became the first real mentor of your life."], { when: working, mood: 3 }),
  A("y_officeParty", [21, 30], 0.08, s => ["At the office holiday party you {won the white-elephant gift exchange with a lava lamp|ended up singing karaoke with the CFO|ate an entire tray of pigs in a blanket}, and {nobody let you forget it.|it was, honestly, a good night.}", `At the company picnic you were drafted onto the ${s.year < 1990 ? "softball" : "kickball"} team and made a catch people talked about until Monday.`, "Your coworkers threw you a surprise birthday party in the break room with a grocery-store sheet cake, and you were more moved than you let on."], { when: working, mood: 3 }),
  A("y_shifts", [18, 30], 0.12, s => ["Working {doubles on the weekend|the closing shift|the breakfast rush}, you learned to carry four plates, read a customer in three seconds, and count tips at one in the morning at the bar with the cooks.", `You worked {Black Friday|the holiday rush|inventory night} at the store and saw humanity at its best and worst, sometimes in the same aisle.`, "On the night shift you and your coworkers had a whole society of your own: inside jokes, a radio station, and a vending machine everyone knew how to trick."], { when: s => working(s) && ["food service", "retail", "hospitality", "services"].includes(s.job.field), mood: 1 }),
  A("y_impostor", [22, 30], 0.06, ["At your first big meeting you were sure everyone could tell you didn't belong, and then a senior person asked your opinion and actually wrote it down.", "You spent a year convinced you would be found out at work, and then you trained the new hire and realized how much you knew.", "Someone called you “the expert” on something at work, and you went to the bathroom to laugh, and then you realized it was true."], { when: working, mood: 2 }),
  A("y_workFriend", [20, 30], 0.08, ["Your work best friend saved you a seat at every meeting, and you had a whole language of looks across the conference table.", "You and a coworker took your lunch breaks on the loading dock every day, talking about everything except work, for years.", "A coworker covered your shift the day your car died, and you covered theirs the next month, and that was the start of a long friendship."], { when: working, mood: 3 }),

  // ---------- the good stuff ----------
  {
    id: "y_roadTrip", once: true, ages: [19, 30], when: s => atHome(s) && !inService(s), p: () => 0.08,
    choice: (s, ctx) => {
      const car = s.flags.firstCar ? s.flags.firstCar.name : ctx.rng.pick(carOf(s.year - 5)), fest = festivalOf(s.year), f = bestFriend(s);
      const who = f ? f.call : "two friends";
      return {
        prompt: `${scene(ctx, [`You and ${who} have a week off at the same time and ${car} with a full tank.`, `${f ? f.call : "A friend"} called with an idea: a road trip, this summer, no plan.`, "You've been staring at a road atlas for weeks."])} Where do you go?`,
        options: [
          { id: "y_roadTrip.parks", label: "The national parks", hint: "Yellowstone, Zion, the Grand Canyon", act: "travel", style: "health", weight: 0.25, apply: (s2, c) => ({ text: c.w(`You and ${who} drove ${car} through the national parks, {camping in a tent that leaked,|watching the sun come up over the Grand Canyon,|seeing a bison stop traffic for twenty minutes,} and {it was one of the best weeks of your life.|you still have the park map, coffee-stained.}`), mood: 6, big: true }) },
          { id: "y_roadTrip.festival", label: `Go to ${fest}`, hint: "music, mud, no sleep", act: "travel", style: "risk", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You and ${who} drove to ${fest}, {slept in the car,|lost each other twice in the crowd,} and {heard a band you'd never heard of that became your favorite.|came home sunburned, broke and transformed.}`), mood: 6, big: true }) },
          { id: "y_roadTrip.cross", label: "Coast to coast", hint: "three thousand miles of diners", act: "travel", style: "risk", weight: 0.15, apply: (s2, c) => ({ text: c.w(`You and ${who} drove coast to coast in ${car}, {on Route 66 where you could find it,|on back roads through towns of a hundred people,} {eating pie in every state.|with ${s2.year >= 2000 ? "a playlist" : "a cassette"} of the same twelve songs.}`), mood: 6, big: true }) },
          { id: "y_roadTrip.beach", label: "Split a beach house eight ways", hint: "cheap, crowded, perfect", act: "socialize", style: "social", weight: 0.25, apply: (s2, c) => ({ text: c.w("You and seven friends split a beach house for a week, {with one bathroom and a sandy floor,|and cooked giant dinners every night,} and {it became a tradition you kept for years.|you laughed until your face hurt.}"), mood: 5 }) },
          { id: "y_roadTrip.save", label: "Skip it and save the money", hint: "next year", act: "save", style: "safe", weight: 0.15, apply: () => ({ text: "You skipped the road trip and put the money in savings. Your friends sent photos, and you told yourself next year.", mood: -1 }) },
        ],
      };
    },
  },
  {
    id: "y_passport", domain: "move", channel: "change", once: true, ages: [21, 30], when: s => grownUp(s) && s.year >= 1958 && !s.flags.semesterAbroad, p: () => 0.06,
    choice: (s, ctx) => {
      const y = s.year;
      const roots = ctx.rng.pick(["a village in Ireland", "a town in southern Italy", "a city in Mexico", "a village in Poland", "a town in Germany", "a city in the Philippines", "a village in Ghana"]);
      const far = y >= 1980 ? ctx.rng.pick(["Japan", "Thailand", "Peru", "Morocco", "Vietnam"]) : ctx.rng.pick(["Greece", "Spain", "Mexico"]);
      return {
        prompt: `${scene(ctx, ["Your passport came in the mail, and its pages are completely empty.", `You've saved some money and you have two weeks of vacation, and you've never left the country.`, `Your grandmother keeps talking about ${roots}, where the family came from.`])} Where do you go?`,
        options: [
          { id: "y_passport.europe", label: "Backpack through Europe", hint: y >= 1960 ? "a rail pass and hostels" : "trains and cheap hotels", act: "travel", style: "learn", weight: 0.3, apply: (s2, c) => { spend(s2, 0.08); return { text: c.w("You backpacked through Europe {with a rail pass and a paperback guidebook,|sleeping in hostels and eating bread and cheese on train platforms,} and {got lost in Rome on purpose.|stood in front of a painting you had only seen in books and couldn't speak.}"), mood: 6, big: true }; } },
          { id: "y_passport.beach", label: y >= 1975 ? "A beach in Mexico or the Caribbean" : "A beach in Mexico", hint: "sun and nothing to do", act: "travel", style: "self", weight: 0.25, apply: (s2, c) => { spend(s2, 0.05); return { text: c.w("You flew to a beach {in Mexico|in the Caribbean} and did nothing for a week, {reading three novels and drinking out of coconuts.|and came home tan and very calm.}"), mood: 5, big: true }; } },
          { id: "y_passport.far", label: `Go somewhere far: ${far}`, hint: "a different world", act: "travel", style: "risk", weight: 0.15, apply: (s2, c) => { spend(s2, 0.1); return { text: c.w(`You went to ${far}, {pointing at menus and eating whatever came,|getting lost and getting found by strangers who walked you to the train,} and {it rearranged your sense of the world.|you came home and cooked the food for everyone you knew.}`), mood: 6, big: true }; } },
          { id: "y_passport.roots", label: `Visit ${roots}`, hint: "the family's old country", act: "travel", style: "family", weight: 0.15, apply: (s2, c) => { spend(s2, 0.08); return { text: c.w(`You went to ${roots}, where your family came from, {found your great-grandparents' names in a church record book,|met a distant cousin who had your grandmother's eyes,} and called home crying.`), mood: 7, big: true }; } },
          { id: "y_passport.save", label: "Save it for later", hint: "the passport keeps", act: "save", style: "safe", weight: 0.15, apply: () => ({ text: "You put the passport in a drawer and the money in savings. The empty pages waited, patiently.", mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "y_pet", domain: "family", channel: "good", once: true, ages: [20, 30], when: s => grownUp(s) && s.home !== "parents" && (!s.flags.pet || s.age - s.flags.pet.since >= 10), p: () => 0.08,
    choice: (s, ctx) => {
      const dog = ctx.rng.pick(PET.dog.names(s.year)), cat = ctx.rng.pick(PET.cat.names(s.year));
      const keep = (s2, kind, name) => { s2.flags.pet = { kind, name, noun: PET[kind] ? PET[kind].noun : kind, since: s2.age }; };
      const lead = scene(ctx, [
        `The animal shelter's website has a photo of a dog named ${dog} who looks like he's been waiting for you.`,
        `A coworker's cat had kittens, and one of them, ${cat}, keeps climbing into your bag.`,
        "Your apartment is very quiet when you come home at night.",
      ]);
      return {
        prompt: `${lead} Do you get a pet?`,
        options: [
          { id: "y_pet.dog", label: `Adopt ${dog} from the shelter`, hint: "walks, hair, love", act: "care", style: "family", weight: 0.3, apply: (s2, c) => { keep(s2, "dog", dog); return { text: c.w(`You adopted ${dog} from the shelter, {and he ate one shoe the first week and your heart the second.|and your walks around the block became the best part of every day.|and the landlord pretended not to notice.}`), mood: 6, big: true }; } },
          { id: "y_pet.cat", label: `Take ${cat} home`, hint: "independent, judgmental", act: "care", style: "self", weight: 0.25, apply: (s2, c) => { keep(s2, "cat", cat); return { text: c.w(`You took ${cat} home, {and ${cat} immediately claimed the best chair.|and ${cat} slept on your chest every night like a warm loaf of bread.}`), mood: 5, big: true }; } },
          { id: "y_pet.foster", label: "Foster first", hint: "see if you're ready", act: "volunteer", style: "social", weight: 0.15, apply: (s2, c) => { if (c.rng() < 0.5) { keep(s2, "dog", dog); return { text: `You signed up to foster ${dog} for a few weeks, and failed spectacularly: you adopted him a month later.`, mood: 6, big: true }; } return { text: c.w("You fostered three dogs that year, {and cried every time one went to a forever home.|and each one went home with a note about their favorite toy.}"), mood: 3 }; } },
          { id: "y_pet.small", label: "Start with a fish tank", hint: "the lease says no dogs", act: "hobby", style: "safe", weight: 0.1, apply: s2 => { keep(s2, "fish", "Captain"); return { text: "Your lease said no dogs, so you set up a fish tank with a goldfish named Captain, who outlived two of your relationships and one job.", mood: 3 }; } },
          { id: "y_pet.not", label: "Not now. Your life is too busy", hint: "someday", act: "wait", style: "safe", weight: 0.2, apply: () => ({ text: "You decided your life was too busy for a pet right now, and followed three shelter accounts instead, which was its own kind of heartbreak.", mood: 0 }) },
        ],
      };
    },
  },
  A("y_petLife", [20, 31], 0.12, s => { const p = s.flags.pet, told = s.year >= 2006 ? "you put a video of it online." : "you told the whole story in a letter home."; return [`${p.name} the ${p.noun} {chewed through the couch cushion|learned to open the kitchen cabinet|figured out exactly when you came home} and {you were furious for about ten seconds.|${told}}`, `On a bad day you came home and ${p.name} was waiting by the door, and that was enough.`, `${p.name} got sick and you spent a week's pay at the vet without thinking twice, and ${p.name} was fine, and you were broke and happy.`]; }, { when: s => s.flags.pet && ["dog", "cat"].includes(s.flags.pet.kind) && s.age - s.flags.pet.since >= 1 && s.age - s.flags.pet.since <= 8 && !s.studying, mood: 3 }),
  {
    id: "y_hobby", once: true, ages: [20, 30], when: s => grownUp(s), p: () => 0.1,
    choice: (s, ctx) => {
      const y = s.year;
      const games = y < 1977 ? "pinball at the bar down the street" : y < 1985 ? "Atari" : y < 2000 ? "video games" : "online games with friends", gamesLabel = y < 1977 ? "Pinball at the bar" : y < 1985 ? "Get into Atari" : y < 2000 ? "Get into video games" : "Online games with friends";
      const climb = y >= 1990 ? "rock climbing at the gym" : "hiking the trails outside town";
      const set = (h, text, mood = 3, extra) => (s2, c) => { s2.flags.hobby = h; if (extra) extra(s2); return { text: c.w(text), mood }; };
      return {
        prompt: `${scene(ctx, ["Work is fine, but your evenings feel empty. You want something of your own.", "A coworker keeps inviting you to try her new thing, and you keep saying next week.", "You looked at your weekend and realized you couldn't remember the last time you did something just for fun."])} What do you take up?`,
        options: [
          { id: "y_hobby.run", label: "Running", hint: "a 5K, then who knows", act: "exercise", style: "health", weight: 0.22, apply: set("running", "You started running, {wheezing around the block the first week,|with a couch-to-5K plan taped to the fridge,} and {signed up for your first race by spring.|found it was the only time your head was quiet.}", 3, s2 => { s2.health.fitness = Math.min(1, (s2.health.fitness ?? 0.5) + 0.05); }) },
          { id: "y_hobby.music", label: "Join a band or a choir", hint: "make some noise", act: "hobby", style: "social", weight: 0.15, apply: set("music", "You joined {a community choir|a cover band that played birthday parties|a church praise band}, {and Thursday rehearsals became sacred.|and played your first gig in a bar for twelve people and a dog.}") },
          { id: "y_hobby.league", label: "A rec league", hint: "softball, bowling, kickball", act: "socialize", style: "social", weight: 0.2, apply: set("league", "You joined a {softball|bowling|kickball|volleyball} league, {and your team was terrible and the post-game pizza was great.|and the team became your weekend family.}") },
          { id: "y_hobby.craft", label: "Make something with your hands", hint: "pottery, woodworking, knitting", act: "hobby", style: "learn", weight: 0.15, apply: set("craft", "You took up {pottery at the community center|woodworking in your uncle's garage|knitting from library books}, {and everyone you knew got a slightly lopsided gift that year.|and it was the most peaceful hour of your week.}") },
          { id: "y_hobby.games", label: gamesLabel, hint: "the guilt-free kind of lazy", act: "hobby", style: "self", weight: 0.15, apply: set("games", `You got deep into ${games}, {and your friends became a team that played every Thursday night.|and it was a good place to rest your brain.}`, 2) },
          { id: "y_hobby.climb", label: cap(climb), hint: "fear, then joy", act: "exercise", style: "risk", weight: 0.13, apply: set("climbing", `You took up ${climb}, {and your forearms have never been the same.|and found a crowd of friendly, chalk-covered people who became your friends.}`) },
        ],
      };
    },
  },
  A("y_race", [20, 31], 0.4, s => [`You ran your first {5K|10K|half marathon} {in a turkey costume on Thanksgiving morning|in the rain|with ${s.flags.pet && s.flags.pet.kind === "dog" ? s.flags.pet.name : "a friend"} at the finish line}, and {cried a little at the end.|bought the race photo, even though you looked terrible in it.}`, "You trained for months and ran a marathon, and at mile twenty a stranger handed you an orange slice, and you thought about that kindness for years.", "You did your first race and finished near the back, ahead of a man pushing a stroller, and you were prouder than of anything you'd done at work."], { when: s => s.flags.hobby === "running" && atHome(s), mood: 4 }),
  {
    id: "y_volunteer", domain: "family", channel: "good", once: true, ages: [20, 30], when: s => grownUp(s), p: () => 0.05,
    choice: (s, ctx) => {
      const vote = s.year % 4 === 0;
      return {
        prompt: `${scene(ctx, ["Your church, or your company, or your conscience, is asking for volunteers.", "You saw a sign at the library asking for volunteers, and you can't stop thinking about it.", vote ? "It's an election year, and a campaign office opened on your street." : "A friend roped you into helping at a charity drive and you liked it more than you expected."])} Where do you give your time?`,
        options: [
          { id: "y_volunteer.kitchen", label: "Serve at the soup kitchen", hint: "Saturday mornings", act: "volunteer", style: "family", weight: 0.25, apply: (s2, c) => ({ text: c.w("You started serving breakfast at the soup kitchen on Saturdays, {and learned the names and stories of the regulars.|and a man named Earl told you a joke every single week.}"), mood: 4 }) },
          { id: "y_volunteer.mentor", label: "Mentor a kid", hint: "Big Brothers Big Sisters", act: "care", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w("You signed up to mentor a kid through Big Brothers Big Sisters, {and spent Saturdays at the zoo, the library and the batting cages.|and years later got a graduation invitation in the mail.}"), mood: 5 }) },
          { id: "y_volunteer.build", label: s.year >= 1976 ? "Build houses with Habitat for Humanity" : "Help build the new church hall", hint: "a hammer and a hard hat", act: "volunteer", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w("You spent Saturdays framing walls and hanging drywall, {and were there when a family got their keys.|and learned to use a nail gun without fear.}"), mood: 4 }) },
          { id: "y_volunteer.coach", label: "Coach a kids' team", hint: "Little League, rec soccer", act: "care", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w("You coached a {Little League|rec soccer|kids' basketball} team that won two games all season, {and every kid got a trophy and a hug.|and one shy kid scored a goal and you yelled louder than any parent.}"), mood: 5 }) },
          { id: "y_volunteer.campaign", label: vote ? "Volunteer for a campaign" : "Volunteer at the animal shelter", hint: vote ? "doors and phones" : "dogs need walking", act: "volunteer", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: vote ? c.w("You volunteered for a local campaign, {knocking on doors in the rain|making phone calls from a folding table}, and learned more about your neighbors than in all the years before.") : c.w("You walked dogs at the animal shelter every Sunday, {and every one of them was the best dog.|and cried a little whenever one got adopted.}"), mood: 4 }) },
          { id: "y_volunteer.money", label: "Give money instead of time", hint: "you're stretched thin", act: "donate", style: "safe", weight: 0.1, apply: s2 => { spend(s2, 0.01); return { text: "You were stretched thin, so you set up a small monthly donation instead, and felt a little better every time the receipt came.", mood: 1 }; } },
        ],
      };
    },
  },
  A("y_tech", [18, 30], 0.12, s => {
    const y = s.year;
    if (y < 1985) return ["You bought your first answering machine, recorded a greeting six times, and still sounded like a hostage.", `You got cable TV in your apartment, and lost a whole summer to ${y >= 1981 ? "MTV" : "late-night movies"}.`, "You bought a stereo with a turntable, a tape deck and speakers bigger than your nightstand, on layaway."];
    if (y < 1997) return ["You got your first computer, a beige box with a monitor the size of a microwave, and spent a weekend just figuring out where to plug things in.", "You got a pager, and when it buzzed you felt very important, even when it was your mother.", "You got your first email address, and printed out the first email you ever received."];
    if (y < 2008) return ["You got a flip phone and spent a weekend choosing a ringtone that embarrassed you within the year.", y >= 2003 ? "You made a MySpace page and agonized over your Top 8 like it was a cabinet appointment." : "You built a personal home page with a visitor counter and a GIF of a spinning globe, and checked the counter every day.", `You bought your first ${y >= 2001 ? "iPod" : "MP3 player"} and spent a week ripping every CD you owned onto it.`];
    return ["You got your first smartphone, and from that day on you never once knew where your evenings went.", `You joined ${y >= 2010 ? "Instagram" : "Facebook"}, posted a photo of your breakfast, and got four likes, one of them from your mother.`, "You set up your first group chat with your college friends, and it never, ever went quiet again."];
  }, { when: atHome, mood: 2 }),
  A("y_cooking", [20, 30], 0.08, ["You learned to cook {from a library cookbook|from your grandmother over the phone|from YouTube videos}, and your first dinner party was {four friends, one pot of chili and a burnt loaf of garlic bread.|a disaster of timing and a triumph of company.}", "You hosted your first Thanksgiving for friends who couldn't go home, {with a turkey that came out at ten p.m.|with a turkey you forgot to thaw}, and everyone said it was the best Thanksgiving ever, and they meant it.", "You mastered exactly one impressive dish, {a lasagna|a curry|a pot roast}, and made it for every occasion for the next five years."], { when: s => grownUp(s) && s.home !== "parents", mood: 2 }),
  A("y_vegas", [21, 30], 0.05, ["You went to Las Vegas for a weekend, {won forty dollars at blackjack and lost sixty at the slots,|saw a show with a lot of feathers,|stayed up until sunrise and swore never again,} and drove home through the desert feeling a hundred years old.", "You took a weekend trip to Atlantic City, ate at a buffet three times, and came home with exactly what you left with, which you counted as a win.", "You and your friends went to Vegas for a birthday, and the birthday person got lost in the casino for an hour and came back with a free shrimp cocktail."], { when: s => grownUp(s) && s.year >= 1955, mood: 3 }),
  A("y_jury", [21, 30], 0.04, ["You got called for jury duty, sat in a room with a vending machine for two days, and got picked for a trial about a fender bender. You took it very seriously.", "Jury duty: you were picked for a real trial, listened to every word, and came out with a lot of respect for how hard it is to be fair.", "You got a jury summons, showed up at seven-thirty, and were sent home at noon with a check for fifteen dollars and a free parking voucher."], { when: s => grownUp(s), mood: 0 }),
  A("y_ticket", [19, 30], 0.06, s => ["You got a speeding ticket {on the interstate|on a road where the limit dropped from 55 to 35 without warning|on the way to your grandmother's}, and {went to traffic school on a Saturday.|paid it and drove like a grandmother for months.}", "You got so many parking tickets one year that you started to recognize the meter maid, and she started to recognize you.", `A cop pulled you over for a busted taillight and let you off with a warning and some advice about your ${s.flags.firstCar ? s.flags.firstCar.name : "car"}.`], { when: s => grownUp(s), mood: -1 }),

  // ---------- family ----------
  {
    id: "y_parentsMoney", domain: "family", channel: "bad", tags: ["father", "mother"], once: true, ages: [22, 30], when: s => grownUp(s) && s.employed && (s.father.alive || s.mother.alive), p: (s, ctx) => (homeMoney(s, ctx) === "tight" ? 0.08 : 0.04),
    choice: (s, ctx) => {
      const who = s.father.alive && s.mother.alive && !s.flags.parentsSplit ? "your parents" : s.mother.alive ? "Mom" : "Dad";
      const sibs = bornSibs(s, 20), share = sibs.length === 1 ? sibName(sibs[0]) : "your siblings";
      const [lead, then] = scene(ctx, [
        [`${cap(who)} ${who === "your parents" ? "are" : "is"} behind on the mortgage, and you found out by accident.`, `When you found out ${who} ${who === "your parents" ? "were" : "was"} behind on the mortgage,`],
        [`${cap(who)} called, embarrassed, to ask if you could help with a big repair bill.`, `When ${who} asked for help with a repair bill,`],
        [`${cap(who)}'s hours got cut at work, and the fridge at home looks thin when you visit.`, `When ${who === "your parents" ? "your parents'" : `${who}'s`} hours got cut,`],
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "y_parentsMoney.send", label: "Send money every month", hint: "your turn to help", act: "care", style: "family", weight: 0.3, apply: (s2, c) => { spend(s2, 0.15); return { text: c.w(`${then} you started sending money every month, {and ${who} cried on the phone the first time.|and never once mentioned it at the dinner table.}`), mood: 1 }; } },
          { id: "y_parentsMoney.visit", label: "Help in person on weekends", hint: "time, a toolbox", act: "care", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you spent your weekends at home {fixing the gutters and the leaky sink|driving ${who} to appointments|cooking big batches of food for the freezer}, saving them what you could.`), mood: 1 }) },
          { id: "y_parentsMoney.share", label: `Split it with ${share}`, hint: "a family plan", act: "shareCare", style: "social", weight: 0.2, when: () => sibs.length > 0, apply: () => ({ text: `${then} you called ${share}, and together you worked out a plan and split the cost. Nobody had to carry it alone.`, mood: 2 }) },
          { id: "y_parentsMoney.budget", label: "Sit down and help them budget", hint: "a spreadsheet and patience", act: "talk", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then} you sat down with ${who} at the kitchen table with every bill and {made a budget,|called the bank together,} and it was the first time you felt like the grown-up in the room.`), mood: 1 }) },
          { id: "y_parentsMoney.cant", label: "Tell them you can't right now", hint: "you're barely making it", act: "avoid", style: "self", weight: 0.15, apply: () => ({ text: `${then} you told ${who === "your parents" ? "them" : who === "Mom" ? "her" : "him"} the truth: you were barely making it yourself. ${cap(who)} said ${who === "your parents" ? "they" : who === "Mom" ? "she" : "he"} understood, and you felt terrible anyway.`, mood: -3 }) },
        ],
      };
    },
  },
  {
    id: "y_holiday", domain: "family", channel: "change", once: true, ages: [21, 30], when: s => grownUp(s), p: () => 0.08,
    choice: (s, ctx) => {
      const P = dating(s) ? s.partner : null, fg = s.year >= 2007 ? "Friendsgiving" : "dinner with friends";
      return {
        prompt: `${scene(ctx, ["Thanksgiving is coming, and the plane ticket home costs as much as your rent.", P ? `${P.call}'s family wants you both for the holidays, and so does yours.` : "Your manager asked who could work the holiday shift for double pay.", "Your friends who can't go home are planning a holiday dinner, and asked you to come."])} Where do you spend the holiday?`,
        options: [
          { id: "y_holiday.home", label: "Go home", hint: "whatever it costs", act: "care", style: "family", weight: 0.35, apply: (s2, c) => { spend(s2, 0.02); return { text: c.w(`You went home for the holidays, {and your old bedroom smelled exactly the same.|and the one uncle said the one thing, and you laughed instead of arguing.|and ${parentWord(s2, c)} made your favorite dish without being asked.}`), mood: 4 }; } },
          { id: "y_holiday.friends", label: `Do ${fg}`, hint: "a potluck of strays", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You spent the holiday at ${fg}, {with four kinds of mashed potatoes and no turkey,|crammed around two tables pushed together,} and {it became a tradition.|you called home and passed the phone around.}`), mood: 4 }) },
          { id: "y_holiday.partner", label: P ? `Go to ${P.call}'s family` : "Go to a friend's family", hint: "somebody else's traditions", act: "socialize", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(`You spent the holiday with ${P ? `${P.call}'s` : "a friend's"} family, {learning a card game with rules nobody would explain,|eating a dish you'd never heard of and going back for thirds,} and you called your own family from the guest room.`), mood: 3 }) },
          { id: "y_holiday.work", label: "Work the holiday shift", hint: "double pay", act: "sideJob", style: "safe", weight: 0.15, apply: s2 => { s2.savings += 0.02; return { text: "You worked the holiday shift for double pay, and your coworkers brought in food, and it was a strange and lovely little holiday of its own.", mood: 1 }; } },
          { id: "y_holiday.serve", label: "Serve dinner at a shelter", hint: "the holiday, turned outward", act: "volunteer", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w("You spent the holiday serving dinner at a shelter, {and a little girl asked you for extra cranberry sauce three times.|and it was the best holiday you'd had in years.}"), mood: 4 }) },
        ],
      };
    },
  },
  A("y_auntUncle", [19, 30], 0.12, s => { const sib = olderSibs(s).find(x => s.age - x.bornAt >= 24); const x = sib ? sibName(sib) : "your sister"; const w = s.sex === "female" ? "an aunt" : "an uncle"; return [`${cap(x)} had a baby, and you became ${w}. {You held the baby in the hospital and didn't want to give it back.|You bought the loudest toy you could find.|You were the one who could always stop the crying, somehow.}`, `You became ${w} when ${x} had a baby, and {you started babysitting on Saturdays.|you were already planning the trips you'd take them on.}`, `${cap(x)}'s baby was born, and you drove four hours to meet the baby and stayed the whole weekend.`]; }, { when: s => atHome(s) && olderSibs(s).some(x => s.age - x.bornAt >= 24), mood: 4 }),
  A("y_sibWedding", [19, 30], 0.08, s => { const sib = bornSibs(s, 22)[0]; const x = sib ? sibName(sib) : "your sibling"; return [`${cap(x)} got married, and you {gave a toast that made your parents cry|danced with every aunt|held the rings and did not drop them}.`, `At ${x}'s wedding the whole family was in one room for the first time in years, {and nobody argued, which was a miracle.|and your grandmother danced.}`, `You helped plan ${x}'s wedding and found out that ${x} had grown up when you weren't looking.`]; }, { when: s => atHome(s) && bornSibs(s, 22).length > 0, mood: 4 }),
  A("y_grandparents", [18, 28], 0.06, ["You started calling your grandmother every Sunday, and she told you stories about her own twenties that she had never told anyone.", "You drove your grandfather to his old neighborhood, and he pointed out where everything used to be, and you wrote it all down later.", "Your grandparents' fiftieth anniversary party was in a church hall with a sheet cake, and you watched them dance and understood something about time."], { when: s => atHome(s) && s.birthYear >= 1950, mood: 3 }),
];
