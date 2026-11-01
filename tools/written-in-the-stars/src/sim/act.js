// What an action does: whether it was a button or the player's own words, it follows the same rules.
//
// act(id, s, ctx, sit) returns { text, mood, big? }, or { infeasible: reason } when the action cannot happen now
// (no partner to marry, no money for a down payment). `sit` says where it was chosen:
//   situation  the event id        domain  the event's domain      about  the family member it is about
//   summary    the player's own words, when they wrote the choice     label  the button text, when they tapped one
//   topic      the situation in a few words (life.js topicOf)
// Effects stay within what the buttons of the same kind do, so writing a choice never beats the rules.
import { ACTIONS } from "./actions.js";
import { startJob, otherJob, setJob, moveTo, ABROAD, bornSiblings, yearsMarried, SPECIAL_JOBS, militaryJob, eduAtLeast } from "./world.js";
import { siblingCall, an } from "./words.js";
import { sameSexCouple, canMarry } from "./people.js";
import { tidy } from "./grammar.js";

// The situation in a few words, then the player's own words, so the line reads on its own in the story.
const lead = sit => [sit.topic, sit.summary].filter(Boolean).map(x => `${String(x).trim().replace(/[.,;:!?\s]+$/, "")}. `).join("");
const no = infeasible => ({ infeasible });
// The youngest age for each action: work from 14 (the federal child-labor rules allow non-farm work at 14, with limited
// hours), adult matters from 18 (marriage without consent, contracts, loans, lottery tickets in most states).
const MIN_AGE = {
  jobSearch: 14, jobHop: 14, sideJob: 14, quitJob: 14, careerSwitch: 18, civilService: 18, startup: 18, dispute: 18, workAbroad: 18, retire: 30, enlist: 17,
  invest: 18, buyHome: 18, sellAsset: 18, borrow: 18, lend: 18, insurance: 18, lottery: 18,
  marry: 18, haveChild: 18, noChild: 18, affair: 18, hireCare: 18, shareCare: 18, moveHome: 18, emigrate: 18,
  pursue: 12, vice: 13, studyAbroad: 15, volunteer: 10,
};
function tooYoung(id, s) {
  if (!MIN_AGE[id] || s.age >= MIN_AGE[id]) return null;
  if (MIN_AGE[id] === 14) return "You're not old enough to work yet (14 in most states). For now, just be a kid.";
  if (id === "retire") return "It's a little early to talk about retiring.";
  if (id === "pursue") return "You're still young. Be good friends for now.";
  if (id === "studyAbroad") return "You're too young to study abroad on your own. Maybe in high school.";
  if (id === "enlist") return "You have to be 17, with a parent's consent, to enlist.";
  if (s.age < 13) return "That's a grown-up thing. It can wait until you're older.";
  return "You're not 18 yet. That has to wait until you're an adult.";
}
// A child or a teen still at school: some actions mean something smaller (tutoring instead of a degree).
const young = s => s.age < 18;
// Where a choice belongs: its domain first, then the core event ids known to be about work or love.
const WORK_IDS = ["layoff", "burnout", "firstJob", "startupOffer", "startupYear1", "civilExam"];
const LOVE_IDS = ["crisis", "proposal", "a_temptation", "a_chores", "a_inlaws"];
const work = sit => sit.domain === "career" || WORK_IDS.includes(sit.situation);
const love = sit => sit.domain === "love" || LOVE_IDS.includes(sit.situation);
const at = (sit, re) => re.test(sit.situation || "");

// Marriages are kept as spells { from, to, end } for the statistics.
export function closeSpell(s, end) {
  const last = s.spells[s.spells.length - 1];
  if (last && last.to === null) { last.to = s.age; last.end = end; }
}
export function endRelationship(s, ctx) {
  if (s.rel === "married") {
    s.rel = "divorced"; s.divorces += 1; if (s.partner) s.exes.push(s.partner); s.partner = null; s.since = null;
    closeSpell(s, "divorce");
    return "married";
  }
  if (s.rel === "dating") {
    s.rel = s.prevRel === "divorced" || s.prevRel === "widowed" ? s.prevRel : "single"; if (s.partner) s.exes.push(s.partner); s.partner = null;
    return "dating";
  }
  return null;
}
export function marry(s) {
  s.rel = "married"; s.marriages += 1; s.since = s.age; s.crisis = 0; s.guard = 0;
  s.spells.push({ from: s.age, to: null, end: null });
  if (s.home === "parents") s.home = "rent";
}
export function ownHome(s) {
  s.home = "own";
  if (s.ownedAt === undefined) s.ownedAt = s.age;
}
export const loseJob = s => { s.employed = false; s.unemployedFor = 1; };
export const spend = (s, x) => { const paid = Math.min(s.savings, x); s.savings -= paid; return paid; };

const HANDLERS = {
  // ---------- work and study ----------
  jobSearch(s, ctx, sit) {
    if (s.retired || s.age >= 67) return no("You're past retirement age; a new job is hard to come by now.");
    // At a graduation question going to work is one of the answers.
    if (s.studying && s.age < 18 && !at(sit, /^(senior|exam18|hsDropout|graduate)/)) return no("You're still in school. Finish that first.");
    if (s.employed) {
      s.income *= ctx.rng.between(0.95, 1.18);
      return { text: lead(sit) + ctx.w("You {sent out a few applications|had a friend put in a word for you}, and {two months later|before long} you moved to another company, still as {ajob}."), mood: 2 };
    }
    if (ctx.roll("career", "good", 0.6)) {
      const first = !s.jobsHeld.length && !s.job;
      return { text: lead(sit) + ctx.w(`You {sent out two dozen applications|went to interview after interview}, and {finally|in the third month} landed ${first ? "your first job" : "a new job"}: {title}.`, { title: startJob(s, ctx) }), mood: 5 };
    }
    return { text: lead(sit) + ctx.w("{Most of your applications went unanswered|A few interviews led nowhere}, so you {picked up odd jobs while you kept looking|kept looking}."), mood: -3 };
  },
  jobHop(s, ctx, sit) {
    if (s.retired || s.age >= 67) return no("You've already retired.");
    if (!s.employed && !s.done.has("firstJob")) return no("You haven't started working yet.");
    const job = otherJob(s, ctx), before = s.job ? s.job.title : "";
    setJob(s, ctx, job, { pay: ctx.rng.between(0.95, 1.15) });
    s.health.stress = Math.max(0, s.health.stress - 0.1);
    return { text: lead(sit) + ctx.w("You {moved to a new company|jumped ship}, {going from {before} to {title}|now working as {atitle}}. {There's a lot to learn again, but you feel lighter.|The pay is about the same and the stress is a lot less.|Your new coworkers are good people.}", { before: before || "your old job", title: job.title, atitle: an(job.title) }), mood: 3 };
  },
  careerSwitch(s, ctx, sit) {
    if (s.age >= 60) return no("Starting a whole new career at this age would be hard going.");
    const job = otherJob(s, ctx);
    setJob(s, ctx, job, { pay: 0.85 }); s.career = Math.max(0, s.career - 1); s.flags.retrained = true;
    ctx.nudge("curiosity", 0.03);
    return { text: lead(sit) + ctx.w("{You spent a year learning something new|You started from scratch} and became {title}. {The pay dropped at first,|You were the new kid again,} {but it felt worth it.|and somehow you sleep better.}", { title: an(job.title) }), mood: 2 };
  },
  study(s, ctx, sit) {
    if (at(sit, /^(senior|exam18)/)) {
      s.flags[`retake_${sit.situation}`] = true; s.done.delete(sit.situation);
      return { text: lead(sit) + ctx.w("You decided to {take a year to study and apply again|retake the test and try again next year}."), mood: -2 };
    }
    if (young(s) || (s.studying && s.age < 25)) {
      ctx.nudge("curiosity", 0.02);
      return { text: lead(sit) + ctx.w("{You got a tutor|You studied an extra hour every night|You made flash cards for everything you didn't get}, {and your grades slowly came up.|and it was tiring, but you could see it working.|and you started to actually like the subject.}"), mood: 1 };
    }
    if (s.age >= 70) return no("At this age, take a class for the fun of it.");
    if (s.arcs.study) return no("You're already in a program. Finish that first.");
    const kind = ctx.rng.pick(eduAtLeast(s.edu, "bachelor") ? ["a master's program", "a night MBA", "a certificate program", "an online degree"] : ["community college classes", "a certificate program", "night school", "an online degree"]);
    ctx.arc.start("study", { kind, from: s.age }, ctx.rng.chance(0.5) ? 1 : 2);
    spend(s, 0.3); ctx.nudge("curiosity", 0.03);
    return { text: lead(sit) + ctx.w("You signed up for {kind} and {went back to class after work|spent your weekends with textbooks again}.", { kind }), mood: 1 };
  },
  studyAbroad(s, ctx, sit) {
    if (s.age > 40) return no("A degree abroad is a stretch at this point; a short course abroad might work.");
    if (s.age >= 25 && s.savings < 1) return no("You don't have the savings to study abroad.");
    const where = ctx.rng.weighted([["the UK", 3], ["Spain", 2], ["Italy", 1.5], ["France", 1.5], ["Japan", 1], ["Germany", 1], ["Australia", 1], ["Ireland", 1]]);
    if (s.age >= 25) spend(s, 1);
    s.abroad = where; s.leftAt = s.age; s.flags.studyAbroad = s.age;
    return { text: lead(sit) + ctx.w("You flew to {where} to study, and {were homesick the whole first month.|made friends from a dozen countries in a week.}", { where }), mood: 3, big: true };
  },
  civilService(s, ctx, sit) {
    if (s.age < 18 || s.age > 57) return no("The civil service exams don't really fit your age.");
    if (s.job && s.job.field === "government") return no("You already work for the government.");
    ctx.arc.start("civil", { tries: 0, quit: !s.employed || ctx.rng.chance(0.3) }, 1);
    if (s.arcs.civil.data.quit && s.employed) loseJob(s);
    return { text: lead(sit) + ctx.w("You {bought the study guides|signed up for a prep course} and {studied every night|set your whole schedule around it}, aiming for {a government job|the civil service exam} next year."), mood: -1 };
  },
  startup(s, ctx, sit) {
    if (s.age < 18) return no("You're too young. Get some experience first.");
    if (s.arcs.startup) return no("You're already running a business.");
    if (s.retired && s.age >= 75) return no("Running a business is a lot at this age. Try it as a hobby.");
    const kind = ctx.rng.pick(s.year >= 2005 ? ["coffee shop", "online store", "food truck", "small agency", "fitness studio", "bakery", "app"] : ["diner", "hardware store", "barbershop", "small print shop", "flower shop", "bakery", "auto shop"]);
    const money = Math.min(s.savings, 1);
    if (money < 0.3) s.debt += 0.8; else spend(s, money);
    if (s.employed) loseJob(s);
    s.unemployedFor = 0;
    ctx.arc.start("startup", { kind, from: s.age, cash: 0 }, 1);
    ctx.nudge("drive", 0.04);
    return { text: lead(sit) + ctx.w("{You quit your job|You put your savings on the line} and started a {kind}. {On opening day, the flowers from friends filled the doorway.|You designed the logo yourself.}", { kind }), mood: 4, big: true };
  },
  sideJob(s, ctx, sit) {
    if (s.age < 14) return no("You're too young for that.");
    const gig = ctx.rng.pick(s.year >= 2014 ? ["driving for a delivery app", "freelancing", "tutoring", "babysitting", "selling things online"] : ["waiting tables on weekends", "tutoring", "babysitting", "mowing lawns", "working a night shift"]);
    if (s.employed) s.income *= 1.08; else s.income = Math.max(s.income * 0.5, 0.35);
    s.health.stress = Math.min(1, s.health.stress + 0.05);
    return { text: lead(sit) + ctx.w("You started {gig} {after work|whenever you had time}. {Every bit helps.|It's tiring, but watching your savings grow is calming.}", { gig }), mood: 0 };
  },
  negotiate(s, ctx, sit) {
    if (work(sit)) {
      if (!s.employed) return no("You don't have a job to negotiate right now.");
      if (ctx.roll("career", "good", 0.4)) { s.income *= 1.08; return { text: lead(sit) + ctx.w("You {came in with a whole folder of numbers|picked your moment}, and {your boss said yes.|to your surprise, the company agreed.}"), mood: 4 }; }
      return { text: lead(sit) + ctx.w("You worked up the nerve to ask, and {your boss said they'd think about it. You never heard back.|the company said not right now.}"), mood: -2 };
    }
    return { text: lead(sit) + ctx.w("{You laid it all out, point by point,|Everyone gave a little,} {and you found a deal everyone could live with.|and after a few long evenings, you agreed on something.}"), mood: 1 };
  },
  dispute(s, ctx, sit) {
    if (at(sit, /inherit/)) { s.savings += 0.5; s.flags.estranged = ctx.rng.chance(0.5); return { text: lead(sit) + ctx.w("{You hired a lawyer,|It went to probate court,} {and two years later it was finally settled,|and it was split by the book,} but {things between you and your siblings|the family} {never went back to how they were.|carry a scar now.}"), mood: -4 }; }
    if (work(sit)) {
      if (ctx.rng.chance(0.55)) { s.savings += 0.2; return { text: lead(sit) + ctx.w("{You filed a complaint with the labor board,|You found an employment lawyer,} and {the company paid a settlement.|you got the severance you were owed.}"), mood: 2 }; }
      return { text: lead(sit) + ctx.w("{You filed with HR and then the state,|You went through two rounds of mediation,} {and it didn't go your way.|and the company gave only the legal minimum.}"), mood: -3 };
    }
    return { text: lead(sit) + ctx.w("{You talked to a lawyer|You called a legal aid clinic}, {and now you know your rights.|and you feel steadier knowing where you stand.}"), mood: 0 };
  },
  quitJob(s, ctx, sit) {
    if (!s.employed) return no("You don't have a job right now.");
    loseJob(s); s.health.stress = Math.max(0, s.health.stress - 0.2);
    return { text: lead(sit) + ctx.w("{You handed in your notice.|On your last day, you packed a box.} {Walking out of the building, your shoulders felt lighter.|You were a little sad to clean out your desk.}"), mood: 1 };
  },
  workAbroad(s, ctx, sit) {
    if (s.age > 60) return no("Moving abroad for work at this age would be tough.");
    if (s.age < 18) return no("You're too young for that.");
    const where = at(sit, /abroad/) && s.flags.offerAbroad ? s.flags.offerAbroad : ctx.rng.weighted(ABROAD);
    s.abroad = where; s.leftAt = s.age;
    if (s.employed) s.income *= 1.15; else startJob(s, ctx);
    return { text: lead(sit) + ctx.w("You moved to {where} for work. {Everything started over.|You lived in a tiny furnished apartment.|For the first month, even the grocery store was confusing.}", { where }), mood: 3, big: true };
  },
  familyBusiness(s, ctx, sit) {
    if (!s.father.alive && !s.mother.alive) return no("Your parents are gone, and there's no family business to take over.");
    // A child, or a teen still at school, helps out at home; only a grown-up takes over the family trade.
    if (s.age < 14 || (young(s) && s.studying)) return { text: lead(sit) + ctx.w("You helped out {after school|on weekends} {at the family store|around the house|on the farm}. {Your parents said you were growing up.|You learned to make change at the register.|It was tiring, and you felt proud.}"), mood: 1 };
    if (s.birthCounty) { s.county = s.birthCounty; s.city = s.birthCity || s.city; s.cityState = s.county; }
    s.done.add("firstJob");
    const what = ctx.rng.pick(["the family store", "the family farm", "the family's small shop"]);
    setJob(s, ctx, [what, SPECIAL_JOBS.familyBusiness.factor, "family", SPECIAL_JOBS.familyBusiness.house]);
    return { text: lead(sit) + ctx.w("You went back to {city} and {worked alongside your parents|started early every morning} at {what}. {The money is less, but you eat dinner with family again.|Your parents don't say it, but they're thrilled.}", { what }), mood: 2 };
  },
  pushThrough(s, ctx, sit) {
    s.health.stress = Math.min(1, s.health.stress + 0.1);
    if (at(sit, /burnout/)) s.health.hr *= 1.03;
    return { text: lead(sit) + ctx.w("{You gritted your teeth|You told yourself to hang on a little longer} {and kept going.|and the days went on.} {Some nights you still couldn't sleep.|You made it through, but it took a lot out of you.}"), mood: -3 };
  },
  retire(s, ctx, sit) {
    if (s.retired) return no("You've already retired.");
    if (s.age < 50 && s.savings < 10) return no("You haven't saved enough to retire early.");
    if (s.age < 60 && s.savings < 4) return no("You haven't saved enough to retire yet.");
    s.retired = true; s.employed = false;
    return { text: lead(sit) + ctx.w("{You filed your retirement papers|You handed off your last project} and {started living on your own schedule.|slept in on the first Monday, no alarm.}"), mood: 4, big: true };
  },
  enlist(s, ctx, sit) {
    if (s.age > 39) return no("You're past the age limit to enlist.");
    if (s.job && s.job.field === "military") return no("You're already serving.");
    const job = militaryJob(ctx.rng, s.year);
    if (s.studying) { s.studying = false; s.flags.leftSchool = s.age; }
    setJob(s, ctx, job); s.done.add("firstJob");
    s.flags.served = { branch: job.branch, from: s.age }; s.flags.serviceUntil = s.age + 4;
    ctx.nudge("drive", 0.02);
    return { text: lead(sit) + ctx.w("You signed up with {branch}. {Boot camp was the hardest thing you'd ever done.|You shipped out to basic training with a buzz cut and a duffel bag.}", { branch: job.branch }), mood: 2, big: true };
  },

  // ---------- money ----------
  save(s, ctx, sit) {
    if (young(s)) return { text: lead(sit) + ctx.w("You {put your allowance in a jar|saved your birthday money} and {held off on the thing you wanted.|watched the pile slowly grow.}"), mood: 0 };
    s.flags.frugalUntil = s.age + 3;
    return { text: lead(sit) + ctx.w("{You started tracking every dollar|You cut your spending in half} and {packed your lunch every day.|saved wherever you could.}"), mood: -1 };
  },
  invest(s, ctx, sit) {
    if (s.savings < 0.2) return no("You don't have much saved. Build a cushion first.");
    const stake = Math.min(s.savings, Math.max(0.3, s.savings * 0.5));
    // The year's market (rates.js marketReturn) less wage growth, since savings are counted in years of pay.
    const r = Math.max(-0.6, 0.8 * (ctx.R.marketReturn(s.year) - 0.04) + 0.15 * ctx.rng.normal() + (ctx.odds("wealth", "good", 0.5) - 0.5) * 0.3);
    s.savings += stake * r;
    return r >= 0
      ? { text: lead(sit) + ctx.w("{You put part of your savings in the market|You started buying index funds}, {and by the end of the year you were up.|and your timing turned out pretty good.}"), mood: 3 }
      : { text: lead(sit) + ctx.w("{You put part of your savings in the market|You jumped in when everyone else did}, {and then it dropped hard.|and the account was a sea of red.}"), mood: -4 };
  },
  buyHome(s, ctx, sit) {
    if (s.home === "own") return no("You already own your home.");
    if (s.savings < ctx.R.DOWN_PAYMENT) return no("You don't have enough saved for a down payment.");
    ownHome(s); s.savings -= ctx.R.DOWN_PAYMENT;
    return { text: lead(sit) + ctx.w("You bought a place in {city}. {The night you got the keys, you couldn't sleep.|Thirty years of mortgage, and it still felt like the steadiest thing you'd ever done.}"), mood: 7, big: true };
  },
  sellAsset(s, ctx, sit) {
    if (at(sit, /inherit/)) { s.savings += 0.8; return { text: lead(sit) + ctx.w("You sold the old house and {split the money.|everyone took their share.} {On closing day you looked at it a little longer.|Packing up, you found boxes of your childhood photos.}"), mood: -1 }; }
    if (s.home !== "own") return no("You don't own a home to sell.");
    s.home = "rent"; s.savings += 2;
    return { text: lead(sit) + ctx.w("You sold the house. {Now you have cash in hand.|You moved into a rental, and it felt a little empty.}"), mood: -2 };
  },
  borrow(s, ctx, sit) {
    s.savings += 0.6; s.debt += 0.7;
    return { text: lead(sit) + ctx.w("{You took out a loan|You borrowed from family} and {now there's a payment every month.|got through the rough patch for now.}"), mood: -1 };
  },
  lend(s, ctx, sit) {
    if (s.savings < 0.3) return no("You don't have much saved yourself.");
    spend(s, 0.3); s.flags.lent = { age: s.age, back: ctx.rng.chance(0.55) };
    return { text: lead(sit) + ctx.w("{Without a second thought|After a night of thinking it over}, you lent them the money."), mood: 0 };
  },
  insurance(s, ctx, sit) {
    s.flags.insured = true; spend(s, 0.05);
    return { text: lead(sit) + ctx.w("{You sat down with an agent|You compared a few plans} and got {life insurance|disability insurance|a better health plan}. {One more monthly bill,|You feel a bit safer,} just in case."), mood: 1 };
  },
  lottery(s, ctx, sit) {
    spend(s, 0.01);
    if (ctx.rng() < 0.0003) { s.savings += 8; return { text: lead(sit) + "Your hands shook as you checked the numbers: you hit the jackpot!", mood: 15, big: true }; }
    if (ctx.rng() < 0.05) { s.savings += 0.02; return { text: lead(sit) + ctx.w("{You won a small prize|Two numbers matched}, {and you bought everyone coffee.|and treated yourself to a nice dinner.}"), mood: 2 }; }
    return { text: lead(sit) + ctx.w("{You bought a few tickets|You tried your luck}, and {not a single number matched.|won exactly nothing.}"), mood: 0 };
  },
  donate(s, ctx, sit) {
    const gave = spend(s, Math.min(1, s.savings * 0.3));
    ctx.nudge("warmth", 0.03);
    return { text: lead(sit) + ctx.w(gave > 0.01 ? "You gave {a good sum|money} to {a children's hospital|a rural school|a food bank|an animal shelter}, {and felt at peace.|and got a handwritten thank-you card.}" : "{Money was tight,|There wasn't much to give,} so you {volunteered for a day|gave what you could}."), mood: 3 };
  },

  // ---------- love and family ----------
  talk(s, ctx, sit) {
    if (love(sit) && (s.rel === "married" || s.rel === "dating")) {
      s.guard = Math.max(s.guard, 3); s.crisis = Math.max(0, s.crisis - 2);
      return { text: lead(sit) + ctx.w("{One quiet evening|With the kids at their grandparents'}, you and {partner} {finally talked it all out.|had a real conversation.} {You both cried, and you both felt lighter.|Not everything was solved, but things slowly warmed up again.}"), mood: 2 };
    }
    return { text: lead(sit) + ctx.w("{You sat down and talked it through|You said what had been on your mind}, {and they listened more than you expected.|and it was awkward, but you felt better after.}"), mood: 2 };
  },
  counsel(s, ctx, sit) {
    if (young(s)) {
      s.health.stress = Math.max(0, s.health.stress - 0.15);
      return { text: lead(sit) + ctx.w("{You went to see the school counselor a few times|You set up a time with the school counselor}, {and it helped more than you thought.|and it was good to know someone would listen.}"), mood: 2 };
    }
    spend(s, 0.05);
    if (love(sit) && s.partner) { s.guard = Math.max(s.guard, 5); return { text: lead(sit) + ctx.w("{You and {partner} started couples counseling|Every week you went to see a therapist together}, and {learned to fight differently.|for the first time you understood what {partner} was really upset about.}"), mood: 1 }; }
    s.health.stress = Math.max(0, s.health.stress - 0.2);
    return { text: lead(sit) + ctx.w("{You found a therapist|You talked to someone for a while}, {and slowly started sleeping again.|and realized you weren't alone in this.}"), mood: 3 };
  },
  avoid(s, ctx, sit) {
    if (love(sit) && s.partner) s.crisis = Math.max(s.crisis, 3);
    return { text: lead(sit) + ctx.w("{Neither of you wanted to speak first|You set it aside for now}, {and the house got quieter and quieter.|and on the surface, everything was fine.}"), mood: -4 };
  },
  separate(s, ctx, sit) {
    const years = Math.max(1, yearsMarried(s));
    const was = endRelationship(s, ctx);
    if (!was) return no("You're not dating or married right now.");
    return was === "married"
      ? { text: lead(sit) + ctx.w("{After {n} years,|On the day you signed the papers,} {you decided to go your separate ways.|you were both very calm.}", { n: years }), mood: -10, big: true }
      : { text: lead(sit) + ctx.w("{You broke up|You talked it through and parted on good terms}, {and it hurt for a long while.|and it took you half a year to get over it.}"), mood: -5 };
  },
  marry(s, ctx, sit) {
    if (s.rel === "married") return no("You're already married.");
    if (s.rel !== "dating" || !s.partner) return no("You're not seeing anyone right now.");
    if (!canMarry(s)) return no("Same-sex couples can't marry here yet (nationwide from 2015).");
    marry(s);
    return { text: lead(sit) + ctx.w("You married {partner}! {Your parents cried harder than you did.|You kept it simple at the courthouse, then dinner with both families.}"), mood: 9, big: true };
  },
  wait(s, ctx, sit) {
    return { text: lead(sit) + ctx.w("{You decided to wait|You held off on deciding} {and see how things go.|and let time give the answer.}"), mood: 0 };
  },
  pursue(s, ctx, sit) {
    if (s.rel === "married") { s.guard = Math.max(s.guard, 2); return { text: lead(sit) + ctx.w("{You courted {partner} all over again|You planned a surprise date}: {a table at the restaurant of your first date.|that thing {partner} had wanted for ages.}"), mood: 3 }; }
    if (young(s) && s.rel !== "dating") return { text: lead(sit) + ctx.w("{You got up your nerve|Between classes,} {and passed a note to your crush.|and asked your crush to study together.} {Your heart was pounding.|They smiled.}"), mood: 2 };
    s.flags.pursueUntil = s.age + 1;
    return { text: lead(sit) + ctx.w("{You got up your nerve|You stopped waiting for fate} {and asked someone out.|and started going out more and meeting new people.}"), mood: 2 };
  },
  haveChild(s, ctx, sit) {
    if (s.rel !== "married") return no("You're not married right now.");
    if (sameSexCouple(s)) return no("The story doesn't have same-sex couples having children yet.");
    const motherAge = s.sex === "female" ? s.age : s.partner ? s.partner.age : 99;
    if (motherAge > 45) return no("It's past the age for having a baby.");
    s.flags.noMoreKids = false; s.flags.tryUntil = s.age + 3;
    return { text: lead(sit) + ctx.w("You and {partner} {talked it over|decided}: {you want a baby.|one more.}"), mood: 2 };
  },
  noChild(s, ctx, sit) {
    s.flags.noMoreKids = true;
    return { text: lead(sit) + ctx.w("{You decided not to have {more|} kids|You two agreed}, {and to make a good life of what you have.|and to be there for the family you've got.}"), mood: 1 };
  },
  care(s, ctx, sit) {
    ctx.nudge("warmth", 0.03);
    if (young(s)) return { text: lead(sit) + ctx.w("{You came straight home after school|You pitched in around the house} {and kept your family company.|and your parents said you'd grown up.}"), mood: 1 };
    if (s.employed) s.income *= 0.92;
    // Who needs care: the parent the choice is about, else an elderly parent who is still alive.
    const who = sit.about === "father" && s.father.alive ? "Dad" : sit.about === "mother" && s.mother.alive ? "Mom"
      : sit.situation === "parentCare" ? (s.mother.alive && s.mother.age >= 70 ? "Mom" : s.father.alive ? "Dad" : null) : null;
    return { text: lead(sit) + ctx.w(who ? "{You cut back your hours|You moved back in} to take care of {who} yourself. {It's exhausting, but you see {who} every day.|You watch TV together, walk the block, and go to the appointments.}" : "{You spent more time with family|You put family first again}, {and there was more laughter at home.|and life slowed down.}", { who: who || "" }), mood: 1 };
  },
  hireCare(s, ctx, sit) {
    spend(s, 0.6);
    return { text: lead(sit) + ctx.w("{You hired a home health aide|You found a good assisted-living place} {and visited every weekend.|and felt better knowing professionals were there.}"), mood: -1 };
  },
  shareCare(s, ctx, sit) {
    const adults = bornSiblings(s, 18);
    if (!adults.length) return no("You don't have brothers or sisters to share it with.");
    const who = adults.length === 1 ? siblingCall(adults[0]) : "your siblings";
    return { text: lead(sit) + ctx.w("You and {who} {made a schedule|split it up}, {taking turns.|sharing the time and the money.}", { who }), mood: -1 };
  },
  reconcile(s, ctx, sit) {
    if (love(sit) && s.partner) { s.guard = Math.max(s.guard, 2); s.crisis = 0; }
    if (at(sit, /inherit/)) s.flags.estranged = false;
    ctx.nudge("warmth", 0.02);
    return { text: lead(sit) + ctx.w("{You took a step back|You chose to forgive}, {and the knot in your chest slowly loosened.|and things went back to how they were.}"), mood: 2 };
  },
  insist(s, ctx, sit) {
    if (at(sit, /inherit/)) { s.savings += 1; s.flags.estranged = true; return { text: lead(sit) + ctx.w("{You held out for your share|You didn't give an inch}, {and you got the money,|and it got settled,} {but your siblings barely call now.|and the holidays have never been the same.}"), mood: -6 }; }
    if (work(sit) && s.employed) {
      if (ctx.roll("career", "good", 0.35)) { s.income *= 1.1; return { text: lead(sit) + "You held your ground, and in the end they gave way.", mood: 3 }; }
      return { text: lead(sit) + ctx.w("{You held your ground|You wouldn't budge}, {and things with your boss got icy.|and nothing changed except your reputation as difficult.}"), mood: -4 };
    }
    return { text: lead(sit) + ctx.w("{You stood your ground|You didn't back down}, {and in the end they accepted it.|and after a few fights it was settled.}"), mood: 0 };
  },
  cutOff(s, ctx, sit) {
    if (sit.about === "siblings" || at(sit, /inherit|sibling/)) s.flags.estranged = true;
    return { text: lead(sit) + ctx.w("{You blocked their number|You stopped answering}. {There's a hole where they used to be,|Out of sight, out of mind,} {but you don't regret it.|and life got quieter.}"), mood: -3 };
  },
  seekHelp(s, ctx, sit) {
    const sibs = bornSiblings(s, 18);
    const helper = s.friends.length && ctx.rng() < 0.5 ? ctx.rng.pick(s.friends).call : sibs.length ? siblingCall(ctx.rng.pick(sibs)) : "an old friend";
    if (work(sit) && !s.employed && ctx.rng.chance(0.5)) return { text: lead(sit) + ctx.w("{You called {helper}|You asked {helper} for help}, {and they knew of an opening: {title}.|and they put you in touch with someone. You got the job: {title}.}", { helper, title: startJob(s, ctx) }), mood: 4 };
    if (love(sit) && s.partner) s.guard = Math.max(s.guard, 2);
    return { text: lead(sit) + ctx.w("You {talked it over with|asked for help from} {helper}, {who showed up without a second thought.|and afterward you could see it all more clearly.}", { helper }), mood: 2 };
  },
  affair(s, ctx, sit) {
    if (s.rel !== "married" && s.rel !== "dating") return no("You're not with anyone right now.");
    s.crisis = Math.max(s.crisis, 4); s.flags.affair = s.age;
    if (ctx.rng.chance(0.5)) { s.guard = 0; return { text: lead(sit) + ctx.w("{You crossed a line with someone else|You started something you shouldn't have}, {and {partner} found out soon enough.|and {partner} saw the messages on your phone.} The house blew up."), mood: -6, big: true }; }
    return { text: lead(sit) + ctx.w("{You crossed a line with someone else|You started a secret relationship}, {and spent every day on edge.|and the guilt kept growing.}"), mood: -2 };
  },

  // ---------- health and self ----------
  rest(s, ctx, sit) {
    if (s.employed && at(sit, /burnout/)) s.income *= 0.95;
    s.health.stress = Math.max(0, s.health.stress - 0.25);
    if (young(s)) return { text: lead(sit) + ctx.w("{You spent a whole weekend doing nothing|You went to bed early} {and slept like a log.|and let your mind wander for a day.} {You felt so much better.|Everything felt lighter.}"), mood: 2 };
    return { text: lead(sit) + ctx.w("{You took a long leave|You did nothing at all} {and slept for a month.|and woke up without an alarm every day.} {Your body slowly came back.|You finally unclenched.}"), mood: 3 };
  },
  travel(s, ctx, sit) {
    if (young(s)) return { text: lead(sit) + ctx.w("{Over the holidays|On a long weekend}, {the family drove|you all went} to {trip} for a few days, {and came back in a much better mood.|and took a hundred pictures.}"), mood: 3 };
    spend(s, 0.1);
    if (love(sit) && s.partner) s.guard = Math.max(s.guard, 2);
    return { text: lead(sit) + ctx.w("{You spent a few days in {trip}|You went to {trip} on your own|You took a trip to {trip}}, {and came back in a much better mood.|and took a hundred pictures.|and felt like yourself again.}"), mood: 4 };
  },
  exercise(s, ctx, sit) {
    s.health.fitness = Math.min(1, s.health.fitness + 0.15); s.health.hr = Math.max(0.8, s.health.hr * 0.97); ctx.nudge("health", 0.05);
    const sport = ctx.rng.pick(["running", "swimming", "hiking", "cycling", "lifting at the gym", "pickup basketball", "a dance class", ...(s.year >= 2015 ? ["pickleball"] : [])]);
    return { text: lead(sit) + ctx.w("You took up {sport} {every day|three days a week}, and {three months later|after half a year} {you had a lot more energy.|your pants were a size looser.}", { sport }), mood: 3 };
  },
  seeDoctor(s, ctx, sit) {
    if (s.age >= 40) s.health.checkups = true;
    if (s.health.chronic) s.health.hr = Math.max(0.8, s.health.hr * 0.97);
    s.health.stress = Math.max(0, s.health.stress - 0.1);
    return { text: lead(sit) + ctx.w("{You made a doctor's appointment|You got a full checkup}, {and the doctor told you to take better care of yourself.|and you took the meds and kept the follow-ups.}"), mood: 1 };
  },
  quitHabit(s, ctx, sit) {
    s.health.smoke = false; s.health.drink = false; s.health.hr = Math.max(0.8, s.health.hr * 0.97); ctx.nudge("health", 0.05);
    if (young(s)) return { text: lead(sit) + ctx.w("{You stopped staying up so late|You cut your {video game|phone} time in half|You started eating your vegetables}. {The first few days were rough,|At first everything felt off,} {but then you had more energy.|and your parents noticed the change.}"), mood: 1 };
    return { text: lead(sit) + ctx.w("{You decided to quit your bad habits|You gave up smoking and drinking and fixed your sleep}. {The first two weeks were brutal,|At first everything felt off,} {but you got more energy every week.|and your body felt years younger.}"), mood: 1 };
  },
  vice(s, ctx, sit) {
    if (young(s)) {
      s.health.smoke = true; s.health.hr *= 1.02;
      return { text: lead(sit) + ctx.w("{You tried a cigarette behind the gym|A friend gave you your first cigarette}, {and coughed your lungs out.|and got caught by a teacher and a week of detention.|and chewed a whole pack of gum before going home.}"), mood: -1 };
    }
    s.health.drink = true; s.health.hr *= 1.03;
    return { text: lead(sit) + ctx.w("{You needed a couple of drinks every night to fall asleep|You drowned your worries}, {and the next morning, the problems were still there.|and your body started to complain.}"), mood: -1 };
  },
  hobby(s, ctx, sit) {
    spend(s, 0.05); ctx.nudge("curiosity", 0.03);
    const h = ctx.rng.pick(["learning guitar", "watercolor painting", "photography", "baking bread", "woodworking", "gardening", "writing short stories"]);
    return { text: lead(sit) + ctx.w("You started {h}, {with a class every week.|and couldn't stop once you'd started.}", { h }), mood: 3 };
  },
  volunteer(s, ctx, sit) {
    ctx.nudge("warmth", 0.03);
    return { text: lead(sit) + ctx.w("{You volunteered at {a hospital|the library|a food bank|a beach cleanup}|You started helping out one afternoon a week}, {and met a lot of new people.|and it felt good to be useful.}"), mood: 3 };
  },
  socialize(s, ctx, sit) {
    const f = ctx.person({ role: "friend", sex: ctx.rng() < 0.5 ? "male" : "female", birthYear: s.birthYear + (young(s) ? 0 : ctx.rng.int(5) - 2), how: young(s) ? "classmate" : "party" });
    s.friends.push(f);
    if (young(s)) return { text: lead(sit) + ctx.w("{You asked a kid from class to hang out|You joined a club} and met {f}, {and you two were best friends in no time.|and you walked home together every day after that.}", { f: f.call }), mood: 3 };
    return { text: lead(sit) + ctx.w("{You went to more get-togethers|You started inviting people to dinner} and met {f}, {who soon became someone you could tell anything.|and you clicked right away.}", { f: f.call }), mood: 3 };
  },
  moveHome(s, ctx, sit) {
    const to = moveTo(s, ctx);
    return { text: lead(sit) + ctx.w("{You moved to {to}|You found a new place in {to}} {and started a new life.|and started over.}", { to }), mood: 1 };
  },
  emigrate(s, ctx, sit) {
    if (s.savings < 1 && !s.employed) return no("You don't have the savings to move abroad.");
    const where = ctx.rng.weighted([["Canada", 2.5], ["Mexico", 1.5], ["the UK", 1.5], ["Portugal", 1], ["Australia", 1], ["Germany", 0.8], ["Costa Rica", 0.8], ["New Zealand", 0.6]]);
    s.abroad = where; s.leftAt = s.age; s.flags.emigrated = true; spend(s, 0.8);
    return { text: lead(sit) + ctx.w("{You did the paperwork|You sold most of what you owned} and moved to {where} for good. {At the airport you hugged your family for a long time.|A new country, a new start.}", { where }), mood: 2, big: true };
  },
  spiritual(s, ctx, sit) {
    const l = ctx.luckAt(s.age);
    const reason = l && l.reasons.length ? String(ctx.rng.pick(l.reasons).text).replace(/[.\s]+$/, "") : "";
    return { text: lead(sit) + ctx.w(reason ? "{You booked an astrology reading|A friend who reads charts looked at yours|You pulled a tarot card and then looked up your transits}: \"{reason}.\" {You only half believe it, but you feel calmer.|It steadied you a little.}" : "{You went to church and prayed|You sat quietly and asked for a sign}, {and felt calmer.|and came away a little steadier.}", { reason }), mood: 2 };
  },
};

export function act(id, s, ctx, sit = {}) {
  const h = HANDLERS[id];
  if (!h) return { text: tidy(`${lead(sit)}You did it your own way.`, { first: true }), mood: 0 };
  const why = tooYoung(id, s);
  if (why) return no(why);
  const out = h(s, ctx, sit);
  return out && out.text ? { ...out, text: tidy(out.text, { first: true }) } : out;
}
export const HANDLED = Object.keys(HANDLERS);
export const UNHANDLED = Object.keys(ACTIONS).filter(id => !HANDLERS[id]);
