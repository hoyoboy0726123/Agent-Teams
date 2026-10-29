// The middle of a life, about 30–60: the 401(k) form and the mortgage refinance, the credit card you finally pay off,
// a college fund; daycare, the PTA, Saturday soccer, a teenager out past curfew, college applications and the empty
// nest; date nights, rough patches, anniversaries, a stepfamily after a remarriage; aging parents and the sandwich
// years, Thanksgiving with the one uncle, the family reunion, the HOA and the neighbor's tree, a kitchen remodel; and
// midlife itself: a marathon, a motorcycle, a twentieth reunion, friends' divorces, a layoff at fifty, volunteering, a
// congregation, and the technology of each decade arriving in the living room.
//
// The probabilities are assumptions (no statistics exist for these events): most are 0.02–0.06 a year, limited by
// once / max / cooldown (and PACE at the end of the file), so the thirty years hold about twenty of these stories,
// about eight of them asked choices. Parenting events are gated on having children of the right age (s.kids, by k.age). Every choice picks one
// scene for this life and builds its question, buttons and results from it; option ids, acts, styles, weights and
// effects stay the same across scenes.
//
// To keep core.js's calibration (test/calibration.test.js), this file never marries, divorces, has a baby, buys or
// sells a home, retires, ends a job, kills anyone or makes anyone seriously ill. A stepchild is a story person in
// s.flags.stepKid, not in s.kids. Marriage effects are small and go both ways (s.guard up to 3, s.crisis up to 4 for
// crossing a line); money moves stay within a few tenths of a year's pay, with about as much spent as gained; health
// changes are hr ×0.98 (training) or ×1.02 (the motorcycle, the stress) at most. A layoff at fifty is the story after
// core.js's own layoff, not a new one.
//
// Left for later modules:
//   s.flags.retire401k   "match" | "max" | "target" | "stock" | "planner" | "skip" (the first 401(k) choice)
//   s.flags.ira          "roth" | "ira" | "cd" | "index"            s.flags.collegeFund  "529" | "bonds" | "grandparents" | "index" | "none"
//   s.flags.refi         the age of the last refinance             s.flags.will         the guardian chosen ("sibling", "parents"…)
//   s.flags.hotTip       { at, year, kind, size } until resolved   s.flags.kidCare      "center" | "grandparent" | "home" | "nanny" | "shifts" | "parttime"
//   s.flags.familyDog    { name, since }                           s.flags.pta          the age you joined the PTA board
//   s.flags.stepKid      { name, call, sex, birthYear, marriage, bond }   (a story person, not in s.kids)
//   s.flags.marathonAt   the age you started training               s.flags.midlife      what the midlife reckoning turned into
//   s.flags.volunteer    the cause ("food bank", "Habitat"…)       s.flags.congregation the age you joined one
//   s.flags.hostedHoliday the age you first hosted                 s.flags.affair       the age a line was crossed (as act.js)
//   memory kinds "a_marathon", "a_anniversary", "a_kidWedding", "a_comingOut", "a_emptyNest", "a_estate"
// Read from elsewhere: s.last.fatherDeath / motherDeath / divorce / widowed / layoff (core.js), s.flags.estranged
// (core.js inheritance), s.flags.firstLove (teen.js), s.flags.parentsSplit, s.flags.faith (child.js faithOf).
import {
  scene, cap, they, them, their, kidWord, sibName, bornSibs, listWords, yearsWord, bestFriend, makeFriend, stateOf, stateName, inStates, snowy, middleName,
} from "./common.js";
import { faithOf } from "./child.js";

// ---------- helpers ----------
// A plain event: its lines (templates, or a function of s and ctx giving them), its mood, and the usual fields.
function A(id, ages, p, lines, { mood = 2, effect = null, ...more } = {}) {
  return {
    id, ages, ...more, p: typeof p === "function" ? p : () => p,
    apply: (s, ctx) => { const text = ctx.w(typeof lines === "function" ? lines(s, ctx) : lines); if (effect) effect(s, ctx); return { text, mood: typeof mood === "function" ? mood(s) : mood }; },
  };
}
const home = s => !s.abroad;
const married = s => s.rel === "married" && !!s.partner;
// A couple: married, or together two years or more (before 2015 many same-sex couples could not marry).
const together = s => !!s.partner && (s.rel === "married" || (s.rel === "dating" && s.age - (s.datingSince ?? s.age) >= 2));
const pn = s => (s.partner ? s.partner.call : "your partner");
const spouseWord = s => (!s.partner || s.rel !== "married" ? "your partner" : s.partner.sex === "female" ? "your wife" : "your husband");
const yearsWed = s => (s.since === null || s.since === undefined ? 0 : s.age - s.since);
const kidsLive = s => s.kids.filter(k => k.alive !== false);
const kidsAged = (s, lo, hi) => kidsLive(s).filter(k => k.age >= lo && k.age <= hi);
const hasKid = (lo, hi) => s => kidsAged(s, lo, hi).length > 0;
const kidIn = (s, ctx, lo, hi) => ctx.rng.pick(kidsAged(s, lo, hi));
const atHomeKids = s => kidsAged(s, 0, 17);
// "Emma", "Emma and Jack", "the kids".
const kidsCall = list => (list.length === 1 ? list[0].call : list.length === 2 ? `${list[0].call} and ${list[1].call}` : "the kids");
const working = s => s.employed && !!s.job && !s.retired;
const jobWord = s => (s.job ? s.job.title : "work");
const parentsAlive = s => s.father.alive || s.mother.alive;
// One living parent as you call them now, else null.
const aParent = (s, ctx) => (s.father.alive && s.mother.alive ? ctx.rng.pick(["Mom", "Dad"]) : s.father.alive ? "Dad" : s.mother.alive ? "Mom" : null);
const parentsWord = s => (s.father.alive && s.mother.alive ? "your parents" : s.father.alive ? "Dad" : s.mother.alive ? "Mom" : "your parents");
const grandsWord = s => (s.father.alive && s.mother.alive && !s.flags.parentsSplit ? "Grandma and Grandpa" : s.mother.alive ? "Grandma" : "Grandpa");
const oldestParentAge = s => Math.max(s.father.alive ? s.father.age : 0, s.mother.alive ? s.mother.age : 0);
const adultSibs = s => (s.flags.estranged ? [] : bornSibs(s, 18));
// Money and the like.
const spend = (s, x) => { const paid = Math.min(s.savings, x); s.savings -= paid; return paid; };
const owe = (s, x) => { s.debt = (s.debt || 0) + x; };
const frugal = (s, n) => { s.flags.frugalUntil = Math.max(s.flags.frugalUntil || 0, s.age + n); };
const stress = (s, d) => { s.health.stress = Math.max(0, Math.min(1, (s.health.stress ?? 0.3) + d)); };
const guardUp = (s, n) => { s.guard = Math.max(s.guard || 0, n); };
const crisisUp = (s, n) => { s.crisis = Math.max(s.crisis || 0, n); };
const fitter = s => { s.health.hr = Math.max(0.6, s.health.hr * 0.98); s.health.fitness = Math.min(1, (s.health.fitness ?? 0.5) + 0.1); };
const riskier = s => { s.health.hr *= 1.02; };
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
// A number in words up to ninety-nine ("seventeen", "thirty-two").
const words = n => (n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "") : String(n));
const ordWord = n => ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"][n] || `${n}th`;
// "your seven-year-old", "your sixteen-year-old daughter".
const kidAgeWord = k => `${words(k.age)}-year-old`;
// A pay unit in the dollars of the year, rounded the way people say it ("$4,000"). rates.js `dollars` when present.
const AWI = [[1950, 2800], [1960, 4000], [1970, 6200], [1980, 12500], [1990, 21000], [2000, 32200], [2010, 41700], [2020, 55600], [2023, 66600]];
const interp = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return pts[pts.length - 1][1]; };
function usd(ctx, s, units) {
  const raw = ctx.R && typeof ctx.R.dollars === "function" ? ctx.R.dollars(units, s.year) : units * 58000 * interp(AWI, s.year) / 66600;
  const step = raw < 1000 ? 50 : raw < 10000 ? 100 : 1000;
  return "$" + Math.max(step, Math.round(raw / step) * step).toLocaleString("en-US");
}
// NBER recession years (as rates.js), when rates.js has no isRecession.
const RECESSION = new Set([1953, 1954, 1957, 1958, 1960, 1961, 1970, 1974, 1975, 1980, 1981, 1982, 1990, 1991, 2001, 2008, 2009, 2020]);
const recession = (ctx, y) => (ctx.R && typeof ctx.R.isRecession === "function" ? ctx.R.isRecession(y) : RECESSION.has(y));
// The family holiday, by the faith you grew up in.
const holidayOf = (s, ctx) => ({ christian: "Christmas", jewish: "Hanukkah", muslim: "Eid", hindu: "Diwali", none: "Christmas" })[faithOf(s, ctx)];
// The thirty-year fixed rate in the years refinancing swept the country (Freddie Mac averages, rounded).
const REFI = { 1986: "10", 1987: "9", 1992: "8", 1993: "7", 1998: "7", 2001: "7", 2002: "6.5", 2003: "5.8", 2009: "5", 2010: "4.7", 2011: "4.5", 2012: "3.7", 2013: "4", 2016: "3.6", 2020: "3", 2021: "3" };
// How the family watched a movie at home, by year.
const movieWay = y => (y < 1982 ? "the Sunday night movie on TV" : y < 1999 ? "a VHS tape from the video store" : y < 2008 ? "a DVD from the Netflix envelope" : "whatever was streaming");
// How you took pictures of the kids.
const camera = y => (y < 1985 ? "the Instamatic" : y < 2003 ? "the camcorder" : y < 2009 ? "the digital camera" : "your phone");
// Dog names, by era.
const dogName = (ctx, y) => ctx.rng.pick(y < 1990 ? ["Buster", "Lady", "Duke", "Sandy", "Rusty", "Pepper"] : y < 2010 ? ["Max", "Bailey", "Molly", "Buddy", "Lucy", "Cooper"] : ["Luna", "Bear", "Charlie", "Waffles", "Nova", "Moose"]);

export const ADULT = [
  // ---------- money ----------
  {
    // 401(k) plans spread after the IRS rules of 1981; automatic enrollment after the Pension Protection Act of 2006.
    id: "a_401k", domain: "wealth", channel: "good", once: true, ages: [28, 50], when: s => working(s) && s.year >= 1982 && s.job.field !== "military" && !s.flags.retire401k, p: () => 0.055,
    choice: (s, ctx) => {
      const [lead, then] = scene(ctx, [
        ["The benefits packet from HR is on your desk, and the 401(k) form is on top.", "When the 401(k) form came in your benefits packet,"],
        ["A coworker leaned over in the break room: “You're taking the match, right? It's free money.”", "When a coworker told you the 401(k) match was free money,"],
        ["HR held a retirement seminar in the conference room, with free bagels and a chart that went up and to the right.", "After the retirement seminar with the free bagels,"],
        s.savings < 0.5 ? [`You did the math on a napkin: you are ${s.age} and have almost nothing saved for retirement.`, `When you realized you were ${s.age} with almost nothing saved,`] : null,
        s.year >= 2007 ? ["Your company signed you up for the 401(k) automatically at three percent. You could change it.", "When the company auto-enrolled you at three percent,"] : null,
      ]);
      const set = (k, text, mood = 1, fx = null) => (s2, c) => { s2.flags.retire401k = k; if (fx) fx(s2, c); return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["How much do you put in?", "What do you do with the 401(k)?", "Do you sign up?"])}`,
        options: [
          { id: "a_401k.match", label: "Put in enough to get the match", hint: "free money is free money", act: "save", style: "safe", weight: 0.36, apply: set("match", `${then} you put in just enough to get the company match, {and forgot about it, which was the point.|and watched the balance creep up every quarter.}`, 1, s2 => frugal(s2, 2)) },
          { id: "a_401k.max", label: "Max it out", hint: "future you says thanks", act: "save", style: "self", weight: 0.14, apply: set("max", `${then} you maxed it out. {The paycheck got thinner, and the account got serious.|You brown-bagged lunch for a year and did not mind.}`, 0, s2 => frugal(s2, 4)) },
          { id: "a_401k.target", label: s.year >= 2000 ? "Pick a target-date fund and forget it" : "Pick the balanced fund and forget it", hint: "boring on purpose", act: "invest", style: "learn", weight: 0.16, apply: set("target", `${then} you chose ${s.year >= 2000 ? "a target-date fund" : "the balanced fund"} and never looked at it during a bad week. {It was the smartest lazy thing you ever did.|Boring turned out to be a strategy.}`, 1, s2 => frugal(s2, 2)) },
          { id: "a_401k.stock", label: "Put it all in the company stock", hint: "you believe in the place", act: "invest", style: "risk", weight: 0.09, apply: set("stock", `${then} you put it all in company stock. {Some years it soared, and some years you didn't open the statements.|Your financial-planner cousin winced audibly.}`, 0, (s2, c) => { s2.savings = Math.max(0, s2.savings + (c.roll("wealth", "good", 0.5) ? 0.15 : -0.1)); }) },
          { id: "a_401k.planner", label: "Sit down with a financial planner", hint: "a grown-up conversation", act: "seekHelp", style: "learn", weight: 0.1, apply: set("planner", `${then} you sat down with a financial planner, {who asked about goals and did not laugh at yours.|and left with a plan in a folder, which you actually followed.}`, 1, s2 => { spend(s2, 0.01); frugal(s2, 3); }) },
          { id: "a_401k.skip", label: "Skip it for now", hint: "you need the paycheck today", act: "wait", style: "self", weight: 0.15, apply: set("skip", `${then} you skipped it for now. The paycheck was already spoken for, {and retirement felt like someone else's problem.|and you told yourself next year.}`, 0) },
        ],
      };
    },
  },
  {
    // IRAs open to every worker from 1982; the Roth IRA from 1998.
    id: "a_ira", domain: "wealth", channel: "good", once: true, ages: [30, 58], when: s => home(s) && s.year >= 1982 && s.savings >= 0.3, p: s => (s.flags.retire401k === "skip" || !working(s) ? 0.05 : 0.025),
    choice: (s, ctx) => {
      const roth = s.year >= 1998;
      const lead = scene(ctx, [
        `At tax time, the preparer said an ${roth ? "IRA" : "IRA contribution"} could lower your bill and asked if you had one.`,
        roth ? "A friend would not stop talking about a Roth IRA at a barbecue, and you finally asked what it was." : "The bank put up a poster: “Open an IRA by April 15!”",
        !working(s) || s.job.field === "family" ? "Nobody is putting anything away for your retirement but you." : `You realized the ${s.flags.retire401k === "skip" ? "401(k) you skipped" : "pension talk at work"} will not be enough on its own.`,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do with your savings?", "Where do you put the money?"])}`,
        options: [
          { id: "a_ira.roth", label: roth ? "Open a Roth IRA" : "Open an IRA at the bank", hint: roth ? "pay the tax now, never again" : "a tax break now", act: "save", style: "safe", weight: 0.32, apply: (s2, c) => { s2.flags.ira = roth ? "roth" : "ira"; frugal(s2, 2); return { text: c.w(`You opened ${roth ? "a Roth IRA" : "an IRA"} and set up a little transfer every month, {and felt about ten years more grown up.|and the number grew quietly in the background of your life.}`), mood: 1 }; } },
          { id: "a_ira.index", label: s.year >= 1990 ? "Buy an index fund" : "Buy a mutual fund", hint: "own a little of everything", act: "invest", style: "learn", weight: 0.22, apply: (s2, c) => { s2.flags.ira = "index"; s2.savings += 0.1 * Math.max(-1, Math.min(1, (c.R && c.R.marketReturn ? c.R.marketReturn(s2.year) : 0.08) * 3)); return { text: c.w(`You read one book about investing and put your savings into ${s2.year >= 1990 ? "an index fund" : "a mutual fund"}. {You checked it more than you should have.|Some years it went down, and you held on anyway.}`), mood: 1 }; } },
          { id: "a_ira.cd", label: "Buy a CD at the bank", hint: "safe and dull", act: "save", style: "safe", weight: 0.16, apply: (s2, c) => { s2.flags.ira = "cd"; s2.savings += 0.03; return { text: c.w(`You put your savings into a certificate of deposit at the bank{, and the teller gave you a free toaster| and slept very well}.`), mood: 0 }; } },
          { id: "a_ira.trip", label: "Spend it on a real vacation", hint: "you only live once", act: "travel", style: "self", weight: 0.12, apply: (s2, c) => { spend(s2, 0.15); return { text: c.w("You thought about an IRA and then booked a trip to {trip} instead. {The photos are still on the fridge.|You regret nothing, mostly.}"), mood: 3 }; } },
          { id: "a_ira.later", label: "Look into it next year", hint: "there's always April", act: "wait", style: "safe", weight: 0.18, apply: (s2, c) => ({ text: c.w("You meant to open a retirement account, {and the brochure sat on the counter until spring cleaning.|and next year turned into the year after.}"), mood: 0 }) },
        ],
      };
    },
  },
  {
    // A refinance wave: homeowners when rates fell well below what they were paying.
    id: "a_refi", domain: "wealth", channel: "good", ages: [28, 65], cooldown: 6, max: 2, when: s => home(s) && s.home === "own" && REFI[s.year] !== undefined, p: () => 0.2,
    choice: (s, ctx) => {
      const r = REFI[s.year];
      const lead = scene(ctx, [
        `Mortgage rates have dropped to about ${r} percent, and the neighbors are all refinancing.`,
        `A letter from a mortgage broker says you could save hundreds a month at ${r} percent.`,
        `Rates fell to ${r} percent, and ${married(s) ? pn(s) : "your brother-in-law"} printed out an amortization table and left it on your pillow.`,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["Do you refinance?", "What do you do with the mortgage?"])}`,
        options: [
          { id: "a_refi.lower", label: "Refinance to the lower rate", hint: "a smaller payment every month", act: "borrow", style: "safe", weight: 0.4, apply: (s2, c) => { s2.flags.refi = s2.age; spend(s2, 0.03); frugal(s2, 3); return { text: c.w(`You refinanced at ${r} percent, signed your name about ninety times at the closing, and {the monthly payment dropped enough to feel.|put the difference toward the kids' future.|celebrated with takeout.}`), mood: 3 }; } },
          { id: "a_refi.fifteen", label: "Switch to a 15-year mortgage", hint: "pay it off while you're young", act: "save", style: "self", weight: 0.14, apply: (s2, c) => { s2.flags.refi = s2.age; spend(s2, 0.03); return { text: c.w(`You refinanced into a 15-year mortgage at ${r} percent. {The payment went up, and the finish line came into view.|You marked the payoff year on the calendar and circled it twice.}`), mood: 2 }; } },
          { id: "a_refi.cash", label: "Take some cash out", hint: "for the roof, or the tuition", act: "borrow", style: "risk", weight: 0.16, apply: (s2, c) => { s2.flags.refi = s2.age; s2.savings += 0.25; owe(s2, 0.25); return { text: c.w(`You did a cash-out refinance at ${r} percent and {finally fixed the roof.|paid off the credit cards.|set money aside for college.} The house was a little less yours, and the year was a lot easier.`), mood: 1 }; } },
          { id: "a_refi.shop", label: "Call your bank and negotiate", hint: "they want to keep you", act: "negotiate", style: "social", weight: 0.12, apply: (s2, c) => { s2.flags.refi = s2.age; frugal(s2, 2); return { text: c.w(`You called your bank, mentioned the ${r} percent the broker offered, and {they matched it with lower fees.|got a supervisor who knocked off the closing costs.}`), mood: 3 }; } },
          { id: "a_refi.stay", label: "Leave it alone", hint: "the paperwork is not worth it", act: "wait", style: "safe", weight: 0.18, apply: (s2, c) => ({ text: c.w("Rates had dropped, but you left the mortgage alone. {The closing costs and the paperwork weren't worth it to you.|You were planning to pay it off early anyway.}"), mood: 0 }) },
        ],
      };
    },
  },
  {
    // Bank cards spread through the 1970s; the CARD Act of 2009 put the “minimum payment warning” on statements.
    id: "a_creditCard", domain: "wealth", channel: "bad", ages: [28, 58], cooldown: 7, max: 2, when: s => home(s) && s.year >= 1972, p: s => (s.unemployedFor ? 0.05 : s.kids.length ? 0.02 : 0.015),
    choice: (s, ctx) => {
      const how = ctx.rng.pick([s.kids.length ? "braces, a broken water heater and Christmas" : "a broken water heater, a wedding and Christmas", "a car repair, then another, then the vet", s.unemployedFor ? "groceries while you were out of work" : "a lot of small things that added up"]);
      const lead = scene(ctx, [
        `The credit card balance crept up: ${how}. Now it's ${usd(ctx, s, 0.14)}.`,
        s.year >= 2010 ? `The statement says that at the minimum payment, you'll pay off the ${usd(ctx, s, 0.14)} balance in twenty-two years.` : `The credit card statement came, and the balance is ${usd(ctx, s, 0.14)}, mostly ${how}.`,
        s.year >= 1992 ? `Another 0 percent balance-transfer offer came in the mail, and the card you already have is up to ${usd(ctx, s, 0.14)}.` : null,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you dig out?"])}`,
        options: [
          { id: "a_creditCard.plan", label: "Make a plan and pay it down", hint: "highest interest first", act: "save", style: "safe", weight: 0.32, apply: (s2, c) => { owe(s2, 0.1); frugal(s2, 2); return { text: c.w(`You owed ${usd(c, s2, 0.14)} on the credit card. You made a spreadsheet, {paid the highest-interest card first,|taped the balance to the fridge,} and in two years it was gone.`), mood: 2 }; } },
          { id: "a_creditCard.savings", label: "Pay it off from savings", hint: "rip off the bandage", act: "sellAsset", style: "safe", weight: 0.2, when: s2 => s2.savings >= 0.25, apply: (s2, c) => { spend(s2, 0.2); return { text: c.w(`You paid off the ${usd(c, s2, 0.14)} credit card balance from savings in one go. {It hurt, and then it felt wonderful.|You called to close the account and the rep tried three times to keep you.}`), mood: 2 }; } },
          { id: "a_creditCard.transfer", label: s.year >= 1992 ? "Move it to a 0 percent card" : "Take a consolidation loan", hint: "buy some time", act: "borrow", style: "risk", weight: 0.15, apply: (s2, c) => { owe(s2, 0.15); return { text: c.w(`You moved the ${usd(c, s2, 0.14)} balance to ${s2.year >= 1992 ? "a 0 percent card" : "a consolidation loan"}. {You paid it off just before the rate jumped.|The rate jumped before you finished, but you got there.}`), mood: 0 }; } },
          { id: "a_creditCard.scissors", label: "Cut up the cards", hint: "cash only now", act: "quitHabit", style: "self", weight: 0.13, apply: (s2, c) => { owe(s2, 0.15); frugal(s2, 3); return { text: c.w(`You owed ${usd(c, s2, 0.14)}, so you cut up the credit cards at the kitchen table and went cash only. {You froze the last one in a block of ice, just in case.|The envelope system felt silly and worked.}`), mood: 1 }; } },
          { id: "a_creditCard.second", label: "Pick up extra shifts", hint: "more money in", act: "sideJob", style: "risk", weight: 0.1, apply: (s2, c) => { owe(s2, 0.05); stress(s2, 0.05); return { text: c.w(`To pay down the ${usd(c, s2, 0.14)} card, you {picked up weekend shifts|did freelance work at night|drove for a delivery app} for a year. You were tired and you were free.`), mood: 1 }; } },
          { id: "a_creditCard.min", label: "Keep paying the minimum", hint: "it's under control", act: "wait", style: "self", weight: 0.1, apply: (s2, c) => { owe(s2, 0.25); return { text: c.w(`You kept paying the minimum on the ${usd(c, s2, 0.14)} balance, {and somehow it was bigger by summer.|and tried not to read the interest line.}`), mood: -2 }; } },
        ],
      };
    },
  },
  {
    // 529 plans from 1996 (tax-free withdrawals from 2002); before that, savings bonds and a passbook account.
    id: "a_collegeFund", domain: "wealth", channel: "good", tags: ["children"], once: true, ages: [26, 50], when: s => home(s) && hasKid(0, 10)(s), p: () => 0.06,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 0, 10), plan = s.year >= 1997 ? "a 529 plan" : "a college savings account";
      const lead = scene(ctx, [
        `A coworker's ${ctx.rng.pick(["son", "daughter"])} just got the first tuition bill, and the number has stayed with you all week.`,
        `${k.call} announced at dinner, “I'm going to be ${ctx.rng.pick(["a doctor", "an astronaut", "a veterinarian", "a paleontologist"])},” and you thought about tuition.`,
        parentsAlive(s) ? `${parentsWord(s)} offered to help put something away for ${k.call}'s college.` : null,
        s.year >= 1997 ? "Your state's 529 plan sent a brochure with a smiling graduate on the front." : `The bank has a sign about saving for your children's education with U.S. savings bonds.`,
      ]);
      const set = (k2, text, mood = 1, fx = null) => (s2, c) => { s2.flags.collegeFund = k2; if (fx) fx(s2, c); return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["Do you start saving for college?", "What do you do about college?"])}`,
        options: [
          { id: "a_collegeFund.plan", label: s.year >= 1997 ? "Open a 529 plan" : "Open a college savings account", hint: "a little every month", act: "save", style: "family", weight: 0.36, apply: set(s.year >= 1997 ? "529" : "bonds", `You opened ${plan} for ${k.call} and set up ${usd(ctx, s, 0.002)} a {week|paycheck}. {Birthday money from relatives went in too.|It wouldn't cover everything, and it would cover something.}`, 2, s2 => frugal(s2, 3)) },
          { id: "a_collegeFund.bonds", label: "Buy savings bonds", hint: "the way your grandparents did", act: "save", style: "safe", weight: 0.12, apply: set("bonds", `You started buying U.S. savings bonds for ${k.call}'s college{, one every birthday| and kept them in a folder in the desk}.`, 1, s2 => frugal(s2, 1)) },
          { id: "a_collegeFund.grand", label: `Let ${parentsWord(s)} help`, hint: parentsWord(s) === "your parents" ? "they want to" : "it would mean a lot", act: "seekHelp", style: "family", weight: 0.14, when: parentsAlive, apply: set("grandparents", `${cap(parentsWord(s))} started putting money away for ${k.call}'s college. {You found out ${parentsWord(s) === "your parents" ? "they had" : parentsWord(s) === "Mom" ? "she had" : "he had"} been doing it for a year already.|At every birthday there was a card that said “for college” in shaky handwriting.}`, 3, s2 => { s2.savings += 0.05; }) },
          { id: "a_collegeFund.index", label: "Invest it yourself", hint: "more growth, more nerves", act: "invest", style: "risk", weight: 0.1, apply: set("index", `You opened a brokerage account for ${k.call}'s college and invested it yourself{, checking it every morning with your coffee|, then mostly left it alone}.`, 1, s2 => frugal(s2, 2)) },
          { id: "a_collegeFund.later", label: "Pay down the mortgage first", hint: "one thing at a time", act: "wait", style: "safe", weight: 0.16, apply: set("none", `You decided to pay down ${s.home === "own" ? "the mortgage" : "your debts"} before saving for ${k.call}'s college. {Tuition would be future you's problem.|There were still years to go.}`, 0) },
          { id: "a_collegeFund.scholar", label: "Count on scholarships and work", hint: "you worked your way through", act: "insist", style: "self", weight: 0.12, apply: set("none", `You decided ${k.call} would do what you did: {scholarships, a campus job and summer work.|a cheap state school and a part-time job.} College could wait in your budget.`, 0) },
        ],
      };
    },
  },
  {
    // Tax season, by era: the 1040 at the kitchen table, TurboTax from the 1990s, e-filing becoming the norm in the 2000s.
    id: "a_taxes", domain: "wealth", channel: "change", ages: [28, 60], cooldown: 6, max: 2, when: s => home(s) && (working(s) || s.home === "own"), p: () => 0.02,
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        s.year < 1995 ? "It is April 13th, and a shoebox of receipts and a blank 1040 are waiting on the kitchen table." : "It is April 12th, and the tax software keeps asking questions you don't know the answers to.",
        s.kids.length ? `It's tax season, and between the kids, ${s.home === "own" ? "the mortgage interest" : "the child care receipts"} and a W-2 that came late, this year's return is a puzzle.` : "It's tax season, and this year there was a side job, a 1099 and a mystery form from the bank.",
        s.year < 2005 ? "Tax day is tomorrow, and you know the post office stays open until midnight." : "The IRS website says you can file for an extension, and that is very tempting.",
      ]);
      const finish = (s2, c, text, mood) => {
        const [what, x] = c.rng.pick([["You got a refund, which felt like winning.", 0.04], ["You owed a little and paid it with a sigh.", -0.03], ["It came out about even, which was its own kind of victory.", 0]]);
        s2.savings = Math.max(0, s2.savings + x);
        return { text: `${text} ${what}`, mood: mood + (x > 0 ? 2 : x < 0 ? -1 : 0) };
      };
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you do your taxes?", "What do you do?"])}`,
        options: [
          { id: "a_taxes.self", label: s.year < 1995 ? "Do them yourself with a calculator" : "Do them yourself", hint: "how hard can it be", act: "study", style: "learn", weight: 0.28, apply: (s2, c) => finish(s2, c, c.w(`You did your taxes yourself ${s2.year < 1995 ? "with a calculator and the IRS booklet" : "online"}, {swearing quietly at line 12,|on the living room floor at midnight,} and filed them.`), 0) },
          { id: "a_taxes.pro", label: s.year < 1990 ? "Take them to H&R Block" : "Pay an accountant", hint: "someone who knows", act: "seekHelp", style: "safe", weight: 0.3, apply: (s2, c) => { spend(s2, 0.005); return finish(s2, c, c.w("You handed the whole shoebox to {an accountant|a tax preparer at the strip mall} who {said “hmm” a lot|found a deduction you didn't know about}."), 1); } },
          { id: "a_taxes.extension", label: "File for an extension", hint: "October you can deal with it", act: "wait", style: "self", weight: 0.14, apply: (s2, c) => finish(s2, c, "You filed for an extension and did the taxes in October, which was just April with worse weather.", 0) },
          { id: "a_taxes.partner", label: together(s) ? `Let ${pn(s)} handle it` : "Ask a friend who's good at this", hint: "trade for cooking dinner", act: "shareCare", style: "social", weight: 0.14, apply: (s2, c) => finish(s2, c, together(s2) ? `${pn(s2)} did the taxes this year while you cooked every dinner for a week, which was the deal.` : "A friend who was good with numbers did your taxes in exchange for a dinner, and found a deduction you missed.", 1) },
          { id: "a_taxes.midnight", label: s.year < 2005 ? "Race to the post office at midnight" : "File at 11:58 p.m.", hint: "the tradition", act: "pushThrough", style: "risk", weight: 0.14, apply: (s2, c) => finish(s2, c, s2.year < 2005 ? c.w("You finished the return at 11:15 and raced to the post office, where {a line of cars wound around the block and a radio station was handing out aspirin.|a clerk in a party hat stamped your envelope.}") : "You filed your taxes online at 11:58 p.m. on April 15 and felt like a bank robber driving away.", 1) },
        ],
      };
    },
  },
  A("a_audit", [30, 65], 0.003, (s, ctx) => [
    "A letter came from the IRS, and your stomach dropped. It turned out to be about a math mistake on line 14, and you owed {forty-one dollars|less than dinner out}.",
    "The IRS asked to see your receipts for the home office. You spent a weekend with a shoebox and a highlighter, and they {accepted everything.|let you off with a small adjustment.}",
    "An IRS notice said you had underreported some interest. You called, waited on hold for {two hours|ninety minutes} with the hold music, and {sorted it out in five minutes.|paid it, mostly to make it go away.}",
  ], { domain: "wealth", channel: "bad", once: true, mood: -2, when: s => home(s) && (working(s) || s.home === "own"), effect: s => spend(s, 0.01) }),
  {
    // A sum you didn't expect: a bonus, a tax refund, a settlement, a lottery scratch-off.
    id: "a_bonus", domain: "wealth", channel: "good", ages: [30, 60], cooldown: 8, max: 2, when: home, p: () => 0.02,
    choice: (s, ctx) => {
      const amt = usd(ctx, s, 0.3);
      const [lead, then] = scene(ctx, [
        working(s) ? [`Your year-end bonus came in at ${amt}, much more than you expected.`, `When the ${amt} bonus came,`] : null,
        [`A class-action settlement you forgot you'd joined sent you a check for ${amt}.`, `When the ${amt} settlement check arrived,`],
        s.year >= 1985 ? [`A scratch-off ticket from the gas station hit for ${amt}.`, `When the scratch-off hit for ${amt},`] : [`A savings bond your grandmother bought you matured at ${amt}.`, `When the old savings bond came to ${amt},`],
        [`A great-aunt you met twice left you ${amt} in her will, with a note that said “Do something nice.”`, `When your great-aunt left you ${amt},`],
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do with it?", "How do you spend it?"])}`,
        options: [
          { id: "a_bonus.debt", label: s.home === "own" ? "Put it on the mortgage" : "Pay off debt", hint: "the sensible thing", act: "save", style: "safe", weight: 0.3, apply: (s2, c) => { const paid = Math.min(s2.debt || 0, 0.3); s2.debt = (s2.debt || 0) - paid; s2.savings += 0.3 - paid; return { text: c.w(`${then} you put every dollar toward ${s2.home === "own" ? "the mortgage" : "your debt"}. {Your friends called you boring and you felt rich.|It was the least fun and the best feeling.}`), mood: 2 }; } },
          { id: "a_bonus.save", label: "Save and invest it", hint: "let it grow", act: "invest", style: "safe", weight: 0.24, apply: (s2, c) => { s2.savings += 0.25; return { text: c.w(`${then} you {invested it and left it alone.|put it in savings and slept better.}`), mood: 2 }; } },
          { id: "a_bonus.trip", label: "Take the family somewhere", hint: "memories over money", act: "travel", style: "family", weight: 0.2, apply: (s2, c) => { s2.savings += 0.1; return { text: c.w(`${then} you took ${s2.kids.length ? "the whole family" : together(s2) ? pn(s2) : "yourself"} to {trip}. {You still talk about it.|It rained twice, and nobody cared.}`), mood: 5 }; } },
          { id: "a_bonus.give", label: "Give some of it away", hint: "pass it on", act: "donate", style: "social", weight: 0.12, apply: (s2, c) => { s2.savings += 0.15; return { text: c.w(`${then} you gave a good part of it to {the food bank|your old school's scholarship fund|a neighbor who was struggling} and kept the rest.`), mood: 4 }; } },
          { id: "a_bonus.splurge", label: ctx.rng.pick(["Buy the thing you always wanted", "Splurge, just once"]), hint: "a hot tub? a boat?", act: "vice", style: "self", weight: 0.14, apply: (s2, c) => { s2.savings += 0.05; return { text: c.w(`${then} you bought {a hot tub|a used boat|the guitar you'd wanted since high school|a really good grill}. {You use it more than anyone predicted.|You have no regrets at all.}`), mood: 4 }; } },
        ],
      };
    },
  },
  {
    // An only child settles the estate after the last parent dies (with brothers or sisters, core.js `inheritance`).
    id: "a_estate", domain: "family", channel: "change", tags: ["father", "mother"], once: true, ages: [28, 70],
    when: s => !s.father.alive && !s.mother.alive && Math.max(s.last.fatherDeath ?? -9, s.last.motherDeath ?? -9) >= s.age - 1 && bornSibs(s, 18).length === 0, p: () => 0.6,
    choice: (s, ctx) => {
      const asset = ctx.rng.pick(["the house you grew up in", "the house you grew up in", "your parents' condo", "the old farmhouse", "the little house by the lake"]);
      const lead = scene(ctx, [
        `As the only child, you are the executor. There is a folder of papers, a lawyer's number, and ${asset}.`,
        `Your parents are both gone now, and everything in ${asset} is yours to decide about: the furniture, the photos, the coffee cans of buttons.`,
        `You let yourself into ${asset} with your old key. It smells exactly the same, and somebody has to decide what happens next.`,
      ]);
      const done = (s2, c, x, text, mood) => { s2.savings += x; c.remember("a_estate", text); return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you settle things?"])}`,
        options: [
          { id: "a_estate.sell", label: "Sell it and keep a few things", hint: "the practical choice", act: "sellAsset", style: "safe", weight: 0.4, apply: (s2, c) => done(s2, c, 0.4, `You sold ${asset} and kept {the kitchen table and a box of photographs.|your father's toolbox and your mother's recipe cards.|the clock from the mantel.} On the last day you stood in the empty living room for a long time.`, -2) },
          { id: "a_estate.rent", label: "Keep it and rent it out", hint: "a landlord now", act: "invest", style: "risk", weight: 0.14, apply: (s2, c) => done(s2, c, 0.15, `You kept ${asset} and rented it to a young family. {It was strange to see their bikes on the lawn, and nice.|The tenants send a card at Christmas.}`, 0) },
          { id: "a_estate.give", label: "Donate most of it", hint: "let it help someone", act: "donate", style: "social", weight: 0.14, apply: (s2, c) => done(s2, c, 0.2, `You donated most of what was in ${asset} to {the church rummage sale|a family who had lost everything in a fire|the thrift store your mother loved} and sold the rest. It felt like something they would have done.`, 0) },
          { id: "a_estate.lawyer", label: "Hire someone to handle it", hint: "you can't face it yet", act: "hireCare", style: "self", weight: 0.14, apply: (s2, c) => done(s2, c, 0.3, `You hired an estate lawyer and a cleanout company to handle ${asset}. You went back once, for a single afternoon, and took only what you could carry.`, -2) },
          { id: "a_estate.slow", label: "Take your time, one room at a time", hint: "no rush", act: "wait", style: "family", weight: 0.18, apply: (s2, c) => done(s2, c, 0.3, `You went through ${asset} one room a weekend for a whole year. {You found your kindergarten drawings in a dresser drawer.|You found love letters your parents wrote in the ${Math.floor((s.birthYear - 4) / 10) * 10}s, and read every one.}`, -1) },
        ],
      };
    },
  },
  {
    id: "a_bigRepair", domain: "wealth", channel: "bad", ages: [28, 62], cooldown: 6, max: 2, when: home, p: s => (s.home === "own" ? 0.024 : 0.012),
    choice: (s, ctx) => {
      const own = s.home === "own";
      const thing = own ? scene(ctx, [snowy(s) ? "the furnace died in January" : "the air conditioning died in August", "the water heater burst and flooded the basement", "the roof started leaking into the upstairs bedroom", "a tree came down on the garage in a storm"]) : ctx.rng.pick(["the transmission went on the car", "the car failed inspection, badly", "the laptop you work on died"]);
      const cost = usd(ctx, s, 0.12);
      const sibs = adultSibs(s);
      return {
        prompt: `${cap(thing)}, and the estimate is ${cost}. ${ctx.rng.pick(["How do you handle it?", "What do you do?"])}`,
        options: [
          { id: "a_bigRepair.pay", label: "Pay for it from savings", hint: "that's what it's for", act: "save", style: "safe", weight: 0.36, apply: (s2, c) => { spend(s2, 0.12); return { text: c.w(`When ${thing}, you paid the ${cost} from savings. {The emergency fund did its job.|It stung, but it was done by Friday.}`), mood: -2 }; } },
          { id: "a_bigRepair.card", label: "Put it on the credit card", hint: "deal with it later", act: "borrow", style: "risk", weight: 0.18, apply: (s2, c) => { owe(s2, 0.12); return { text: c.w(`When ${thing}, you put the ${cost} on the credit card and {paid it off over the next year.|tried not to think about the interest.}`), mood: -3 }; } },
          { id: "a_bigRepair.diy", label: s.year >= 2008 ? "Fix it yourself with YouTube" : "Fix it yourself with a library book", hint: "how hard can it be", act: "hobby", style: "learn", weight: 0.16, apply: (s2, c) => { if (c.roll("wealth", "good", 0.55)) { spend(s2, 0.02); return { text: c.w(`When ${thing}, you fixed it yourself ${s2.year >= 2008 ? "with a YouTube video" : "with a library book"} and three trips to the hardware store. {You told everyone.|You still tell everyone.}`), mood: 3 }; } spend(s2, 0.14); return { text: `When ${thing}, you tried to fix it yourself, made it worse, and then paid the professional who had quoted ${cost}, plus a little more.`, mood: -3 }; } },
          { id: "a_bigRepair.family", label: sibs.length ? `Call ${sibName(sibs[0])}, who knows this stuff` : "Call your handy brother-in-law", hint: "family discount", act: "seekHelp", style: "social", weight: 0.16, apply: (s2, c) => { spend(s2, 0.03); return { text: c.w(`When ${thing}, you called ${sibs.length ? sibName(sibs[0]) : "your handy brother-in-law"}, who showed up with a toolbox and {fixed it for the price of a pizza.|complained the whole time and did it right.}`), mood: 2 }; } },
          { id: "a_bigRepair.patch", label: "Patch it and hope", hint: "duct tape is a tool", act: "wait", style: "self", weight: 0.14, apply: (s2, c) => { spend(s2, 0.04); return { text: c.w(`When ${thing}, you patched it {with duct tape and optimism|as well as you could} and put the real repair off. {It held, mostly.|It lasted until the next storm.}`), mood: -1 }; } },
        ],
      };
    },
  },
  {
    // A will, and a guardian for the children.
    id: "a_will", domain: "family", channel: "change", tags: ["children"], once: true, ages: [28, 50], when: s => home(s) && hasKid(0, 12)(s), p: () => 0.035,
    choice: (s, ctx) => {
      const sibs = adultSibs(s), kids = kidsCall(atHomeKids(s));
      const lead = scene(ctx, [
        `A friend's sudden scare got you thinking: if anything happened to you, who would raise ${kids}?`,
        `The lawyer handed you a form for your will and a blank line marked “Guardian of minor children.” You have been staring at it.`,
        together(s) ? `You and ${pn(s)} were flying without the kids for the first time, and you realized you have no will.` : `You are raising ${kids} on your own, and you realized there is no plan if something happened to you.`,
      ]);
      const set = (k, text) => (s2, c) => { s2.flags.will = k; return { text: c.w(text), mood: 1 }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["Who would you choose?", "What do you do?"])}`,
        options: [
          { id: "a_will.sibling", label: sibs.length ? `Ask ${sibName(sibs[0])}` : "Ask your closest cousin", hint: "family who'd love them", act: "talk", style: "family", weight: 0.32, apply: set("sibling", `You made a will and asked ${sibs.length ? sibName(sibs[0]) : "your closest cousin"} to be guardian for ${kids}. {There were tears and a very long hug.|The answer was “Of course,” before you even finished the question.}`) },
          { id: "a_will.parents", label: `Ask ${parentsWord(s)}`, hint: "they've done it before", act: "talk", style: "family", weight: 0.16, when: parentsAlive, apply: set("parents", `You made a will and named ${parentsWord(s)} as ${parentsWord(s) === "your parents" ? "guardians" : "guardian"} for ${kids}, with a backup, because you can count.`) },
          { id: "a_will.friend", label: "Ask your best friend", hint: "chosen family", act: "socialize", style: "social", weight: 0.16, apply: set("friend", `You made a will and asked your best friend to be guardian for ${kids}. {They said yes on the spot, then called back an hour later to say it again.|They were already on the school's emergency contact list, so it felt like a formality.}`) },
          { id: "a_will.lawyer", label: "Do the whole thing properly", hint: "will, trust, life insurance", act: "insurance", style: "safe", weight: 0.16, apply: (s2, c) => { spend(s2, 0.02); s2.flags.will = "trust"; s2.flags.insured = true; return { text: c.w(`You did the whole thing properly: a will, a guardian for ${kids}, a trust and a life insurance policy. {You put the folder in a fireproof box and felt lighter.|The lawyer's office smelled of old carpet and peace of mind.}`), mood: 1 }; } },
          { id: "a_will.later", label: "Put it off", hint: "nothing's going to happen", act: "wait", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You meant to write a will and name a guardian for ${kids}, {but the form stayed in the drawer.|but choosing felt impossible, so you didn't, yet.}`), mood: 0 }) },
        ],
      };
    },
  },
  {
    // The family car: station wagons until the minivan (1984), then SUVs from the 1990s, hybrids from the 2000s.
    id: "a_familyCar", domain: "wealth", channel: "change", tags: ["children"], once: true, ages: [28, 50], when: s => home(s) && atHomeKids(s).length >= 2, p: () => 0.06,
    choice: (s, ctx) => {
      const k = atHomeKids(s);
      const lead = scene(ctx, [
        `With ${kidsCall(k)}, the car seats, the stroller and a week of groceries, the car is officially too small.`,
        "The old car made a noise on the highway that the mechanic described as “expensive.”",
        `${k[0].call} asked why everyone else's family has a car ${s.year >= 1984 ? "where the doors slide" : "with a seat that faces backward"}.`,
      ]);
      const buy = (x, text, mood = 2) => (s2, c) => { spend(s2, x); return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you drive now?", "What car do you get?"])}`,
        options: [
          { id: "a_familyCar.van", label: s.year >= 1984 ? "Get a minivan" : "Get a station wagon", hint: s.year >= 1984 ? "you swore you never would" : "wood paneling and a way-back", act: "care", style: "family", weight: 0.36, apply: buy(0.1, s.year >= 1984 ? "You bought a minivan, the thing you swore you would never drive, and {loved the sliding doors with your whole heart.|found French fries in it for the next ten years.}" : "You bought a station wagon with wood paneling, and the kids fought over the way-back every single trip.") },
          { id: "a_familyCar.suv", label: s.year >= 1991 ? "Get an SUV" : "Get a big sedan", hint: "room and a little pride", act: "vice", style: "self", weight: 0.22, apply: buy(0.14, s.year >= 1991 ? "You bought an SUV that had never been off-road and never would be, and you {felt very tall at the school pickup line.|parked it badly everywhere.}" : "You bought a big sedan with a bench seat, and three kids fit across the back if nobody breathed.") },
          { id: "a_familyCar.used", label: "Buy used and keep the money", hint: "a car is a car", act: "save", style: "safe", weight: 0.22, apply: buy(0.05, "You bought a used {wagon|van|sedan} with a hundred thousand miles from a {neighbor|guy on the other side of town|lot with balloons}, and it ran forever.") },
          { id: "a_familyCar.green", label: s.year >= 2012 ? "Go electric" : s.year >= 2004 ? "Get a hybrid" : "Get the small car with good mileage", hint: "the gas money adds up", act: "save", style: "learn", weight: 0.1, apply: buy(0.12, s.year >= 2012 ? "You bought an electric car and became, for a while, a person who talked about charging stations at parties." : s.year >= 2004 ? "You bought a hybrid and watched the mileage number on the dashboard like it was a game." : "You bought a small car with good mileage and folded the family into it like origami.") },
          { id: "a_familyCar.keep", label: "Make the old one last", hint: "one more year", act: "wait", style: "safe", weight: 0.1, apply: buy(0.02, "You put new tires on the old car and kept driving it, with one kid's knees in another kid's back, {for two more years.|until the floor rusted through.}", 0) },
        ],
      };
    },
  },
  {
    // A sure thing, by era: gold in 1979–80, tech stocks in 1997–2000, crypto and meme stocks in 2017–22.
    id: "a_hotTip", domain: "wealth", channel: "change", once: true, ages: [28, 60], when: s => home(s) && s.savings >= 0.4 && !s.flags.hotTip, p: s => ((s.year >= 1997 && s.year <= 2000) || (s.year >= 2017 && s.year <= 2021) ? 0.05 : 0.012),
    choice: (s, ctx) => {
      const y = s.year, kind = y >= 1979 && y <= 1980 ? "gold" : y >= 1997 && y <= 2000 ? "tech" : y >= 2017 && y <= 2021 ? "crypto" : "stock";
      const lead = {
        gold: "Gold just passed $800 an ounce, and your neighbor has bought coins and a safe to keep them in.",
        tech: ctx.rng.pick(["Everybody at work is day-trading tech stocks at lunch, and one guy just bought a boat.", "Your brother-in-law made a fortune on an internet stock whose name ends in “.com,” and he has a tip for you."]),
        crypto: ctx.rng.pick(["Your nephew will not stop talking about Bitcoin, and he's not wrong that it went up a lot.", "A meme stock your coworker bought has gone up tenfold, and everyone online says it's just getting started."]),
        stock: ctx.rng.pick(["A friend from the gym has a hot stock tip: a little company that is about to be huge.", "A guy at your cousin's barbecue swore by a stock in a company that makes a part for something important."]),
      }[kind];
      const set = size => (s2, c) => { s2.flags.hotTip = { at: s2.age, year: s2.year, kind, size }; spend(s2, size); };
      return {
        prompt: `${lead} ${ctx.rng.pick(["Do you buy in?", "Do you put money in?"])}`,
        options: [
          { id: "a_hotTip.big", label: "Go big", hint: "fortune favors the bold", act: "invest", style: "risk", weight: 0.14, apply: (s2, c) => { set(0.35)(s2, c); return { text: c.w(`You put a big chunk of your savings into ${kind === "gold" ? "gold" : kind === "tech" ? "tech stocks" : kind === "crypto" ? "the thing everyone was talking about" : "the hot tip"}. {You checked the price forty times a day.|You started reading the business pages in the bathroom.}`), mood: 2 }; } },
          { id: "a_hotTip.little", label: "Put in a little, for fun", hint: "money you can lose", act: "invest", style: "safe", weight: 0.3, apply: (s2, c) => { set(0.08)(s2, c); return { text: c.w(`You put in a small amount you could afford to lose{, and called it your “fun money.”| and tried to act casual about it.}`), mood: 1 }; } },
          { id: "a_hotTip.index", label: "Stick with your boring index fund", hint: "slow and steady", act: "save", style: "safe", weight: 0.26, apply: (s2, c) => ({ text: c.w(`Everyone was talking about ${kind === "crypto" ? "crypto" : kind === "tech" ? "tech stocks" : kind === "gold" ? "gold" : "the hot tip"}, and you stuck with your boring index fund. {You felt left out at parties.|Your nephew called you a dinosaur.}`), mood: 0 }) },
          { id: "a_hotTip.research", label: "Read up before you decide", hint: "do the homework", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => { if (c.rng() < 0.5) { set(0.12)(s2, c); return { text: "You spent a month reading about it, understood about half, and bought a modest amount.", mood: 1 }; } return { text: "You spent a month reading about it, understood about half, and decided you didn't buy things you couldn't explain.", mood: 0 }; } },
          { id: "a_hotTip.no", label: "Laugh and change the subject", hint: "if it sounds too good…", act: "avoid", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w("You laughed off the hot tip and changed the subject{ to the weather| to the game}. Things that sounded too good usually were."), mood: 0 }) },
        ],
      };
    },
  },
  {
    // What came of the hot tip, a year or two later, by when it was bought.
    id: "a_hotTipResult", domain: "wealth", channel: "change", once: true, ages: [29, 66], when: s => !!s.flags.hotTip && s.age >= s.flags.hotTip.at + 1, p: s => (s.flags.hotTip.kind === "tech" && s.year < 2001 ? 0.3 : 0.7),
    apply: (s, ctx) => {
      const t = s.flags.hotTip, y = t.year;
      const bust = (t.kind === "tech" && y >= 1999) || (t.kind === "crypto" && y >= 2021) || t.kind === "gold";
      const win = !bust && (t.kind === "tech" || t.kind === "crypto" ? ctx.rng() < 0.6 : ctx.roll("wealth", "good", 0.35));
      s.flags.hotTip = null;
      if (win) {
        s.savings += t.size * 2.2;
        return { text: ctx.w(["The {stock tip|investment} you took a chance on actually paid off. You sold half, {bought everyone dinner,|paid down the mortgage,} and never told anyone the exact number.", "Against all odds, the hot tip was real. {You sold at the top by pure luck.|You took your money out and promised yourself you would quit while you were ahead.}"]), mood: 5 };
      }
      s.savings += t.size * (bust ? 0.25 : 0.6);
      return { text: ctx.w([
        t.kind === "tech" ? "When the dot-com bubble burst, the tech stocks you bought fell {to almost nothing.|faster than you could say “pets.com.”} You kept one share as a souvenir." : t.kind === "crypto" ? "In 2022 the crypto market crashed, and what you had put in {lost most of its value.|became a story you tell as a warning.}" : t.kind === "gold" ? "Gold fell by half after 1980, and the coins in the drawer were worth a lot less than you paid." : "The hot tip turned out to be lukewarm. The company {quietly went under.|was bought for pennies.}",
        "The investment everyone was sure about went down instead of up. {You learned a lesson that cost exactly what it cost.|You laughed about it eventually, a few years later.}",
      ]), mood: bust ? -4 : -2 };
    },
  },

  // ---------- parenting: babies and little kids ----------
  {
    // Who watches the baby: day care centers spread from the 1970s; grandparents and the neighbor down the street before.
    id: "a_daycare", domain: "family", channel: "change", tags: ["children"], once: true, ages: [20, 48], when: s => home(s) && working(s) && hasKid(0, 2)(s), p: () => 0.25,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 0, 2), two = together(s), name = pn(s);
      const [lead, then] = scene(ctx, [
        [`Your leave is almost over, and ${k.call} needs somewhere to go during the day.`, `When your leave ran out,`],
        s.year >= 1990 ? [`The day care with the good reviews has a waiting list of eight months, and it costs about as much as ${s.home === "own" ? "the mortgage" : "the rent"}.`, "Faced with an eight-month waiting list and a bill like a second mortgage,"] : [`The lady down the street watches five kids in her living room, and the day care by the church has an opening.`, "With the lady down the street and the church day care both offering,"],
        [`${k.call} is ${k.age ? "a toddler now" : "almost three months old"}, and your boss asked, nicely, when you'll be back full time.`, "When your boss asked when you'd be back full time,"],
      ]);
      const set = (key, text, mood = 1, fx = null) => (s2, c) => { s2.flags.kidCare = key; if (fx) fx(s2, c); return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["Who takes care of the baby?", "What do you do about child care?"])}`,
        options: [
          { id: "a_daycare.center", label: "A day care center", hint: "licensed, expensive, other kids", act: "hireCare", style: "safe", weight: 0.32, apply: set("center", `${then} you enrolled ${k.call} in a day care center. {The first drop-off, you cried in the car for ten minutes.|Within a month ${k.call} came home singing songs you didn't know.|${k.call} caught every cold in the county, and made a best friend named after a vegetable.}`, 0, s2 => spend(s2, 0.08)) },
          { id: "a_daycare.grand", label: `Ask ${grandsWord(s)}`, hint: "free, and full of opinions", act: "shareCare", style: "family", weight: 0.22, when: s2 => parentsAlive(s2) && oldestParentAge(s2) < 80, apply: set("grandparent", `${then} ${grandsWord(s)} took ${k.call} during the day. {${k.call} came home with cookies and new words.|There were opinions about naps, and there was so much love.}`, 3) },
          { id: "a_daycare.home", label: "A neighbor who watches kids at home", hint: "cozy and cheaper", act: "hireCare", style: "social", weight: 0.16, apply: set("home", `${then} a neighbor who watched a few kids at home took ${k.call}. {Her house smelled like grilled cheese and crayons.|She sent you a note every day about what ${k.call} ate.}`, 2, s2 => spend(s2, 0.04)) },
          { id: "a_daycare.shifts", label: two ? `Work opposite shifts with ${name}` : "Rework your schedule", hint: "you'll see each other at the door", act: "care", style: "family", weight: 0.12, apply: set("shifts", two ? `${then} you and ${name} worked opposite shifts and handed ${k.call} off at the door like a relay baton. {You talked mostly in sticky notes for two years.|It was exhausting, and ${k.call} always had a parent.}` : `${then} you rebuilt your whole schedule around ${k.call}, with a sitter for the gaps.`, 0, s2 => stress(s2, 0.05)) },
          { id: "a_daycare.parttime", label: "Go part-time for a while", hint: "less money, more baby", act: "care", style: "self", weight: 0.1, apply: set("parttime", `${then} you went part-time for a while to be home with ${k.call}. {The money was tight and the afternoons were wonderful.|You learned every word of every picture book in the house.}`, 2, s2 => { s2.income *= 0.9; }) },
          { id: "a_daycare.nanny", label: s.year >= 2005 ? "A nanny share with another family" : "Hire a babysitter", hint: "one person who knows them", act: "hireCare", style: "risk", weight: 0.08, apply: set("nanny", s.year >= 2005 ? `${then} you split a nanny with another family, and ${k.call} got a best friend and a second set of rules.` : `${then} you hired a college student to watch ${k.call}, and she stayed three years.`, 1, s2 => spend(s2, 0.1)) },
        ],
      };
    },
  },
  A("a_newborn", [20, 50], 0.28, (s, ctx) => {
    const k = kidsAged(s, 0, 0)[0], n = k.call;
    return [
      `${n} woke up every two hours. {At 3 a.m. you knew every infomercial by heart.|You fell asleep sitting up at a stoplight, just for a second.|You discovered that you could fold laundry with one hand.}`,
      s.year < 1985 ? `You washed cloth diapers in the bathtub and hung them on the line, and ${n} {spat up on every clean shirt you owned.|slept best in the car, so you drove around at midnight.}` : s.year < 2005 ? `You read “What to Expect” cover to cover and ${n} {did none of it.|did all of it, in the wrong order.}` : `You downloaded three baby-tracking apps, and ${n} {ignored all of them.|slept best to the sound of the vacuum on YouTube.}`,
      `${n} smiled for the first time, {probably gas, and you didn't care.|right at you,} and {you called everyone you knew.|the whole sleepless year made sense for a second.}`,
    ];
  }, { tags: ["children"], once: true, mood: 3, when: s => home(s) && kidsAged(s, 0, 0).length > 0 }),
  A("a_toddler", [20, 52], 0.14, (s, ctx) => {
    const k = kidIn(s, ctx, 2, 3), n = k.call, toy = s.year < 1990 ? "the cassette player" : s.year < 2010 ? "the VCR" : "the TV remote";
    return [
      `${n} learned the word “no” and used it {as a complete sentence.|forty times before breakfast.|on the pediatrician.}`,
      `${n} put a peanut butter sandwich in ${toy}, and {you found it a week later.|it never played again.}`,
      `In the grocery store, ${n} lay down in the cereal aisle and {screamed like it was opera.|refused to move until a stranger laughed.} You stood there and {waited it out.|ate a cracker from the box.}`,
      `${n} asked “why?” {about the sky, the dog, the mailman and death, all in one car ride.|until you said “because” and hated yourself a little.}`,
    ];
  }, { tags: ["children"], once: true, mood: 2, when: s => home(s) && hasKid(2, 3)(s) }),
  {
    // A sick kid on a workday: chicken pox until the vaccine (1995), ear infections, the stomach bug, a note about lice.
    id: "a_sickDay", domain: "family", channel: "bad", tags: ["children"], ages: [22, 55], cooldown: 4, max: 2, when: s => home(s) && working(s) && hasKid(1, 10)(s), p: () => 0.045,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 1, 10), n = k.call, two = together(s);
      const what = scene(ctx, [s.year < 1996 ? "chicken pox" : "the stomach bug that's going around", "a fever of 102", "an ear infection", k.age >= 5 ? "lice" : "pinkeye"]);
      const lead = scene(ctx, [
        `${k.age >= 5 ? "The school nurse" : "The day care"} called at 10 a.m.: ${n} has ${what}. You have a big meeting at two.`,
        `${n} woke up with ${what}, and today is the worst possible day to miss work.`,
      ]);
      const back = `When ${n} had ${what},`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["Who stays home?", "What do you do?"])}`,
        options: [
          { id: "a_sickDay.you", label: "Stay home yourself", hint: "the meeting will survive", act: "care", style: "family", weight: 0.34, apply: (s2, c) => ({ text: c.w(`${back} you stayed home, {watched the same cartoon eleven times,|made toast and flat ginger ale,} and the meeting survived without you.`), mood: 1 }) },
          { id: "a_sickDay.partner", label: two ? `Ask ${pn(s)} to take it` : s.exes.length ? `Call ${n}'s other parent` : "Call a friend", hint: two ? "it's their turn" : "you'd do it for them", act: "shareCare", style: "social", weight: 0.2, apply: (s2, c) => ({ text: two ? c.w(`${back} ${pn(s2)} took the day, and you took the next one. {You kept a running tally on the fridge.|It was the most romantic negotiation of the year.}`) : s2.exes.length ? `${back} you called ${n}'s other parent, who came, for once without being asked twice.` : `${back} a friend took the afternoon shift, and you owe them a casserole.`, mood: 0 }) },
          { id: "a_sickDay.grand", label: `Call ${grandsWord(s)}`, hint: "the cavalry", act: "seekHelp", style: "family", weight: 0.16, when: parentsAlive, apply: (s2, c) => ({ text: c.w(`${back} ${grandsWord(s2)} came over with {soup and a deck of cards|a thermometer older than you}, and ${n} recovered suspiciously fast.`), mood: 2 }) },
          { id: "a_sickDay.split", label: s.year >= 2005 ? "Work from the couch" : "Bring work home", hint: s.year >= 2005 ? "laptop and a bucket" : "paperwork and a bucket", act: "pushThrough", style: "risk", weight: 0.18, apply: (s2, c) => { stress(s2, 0.03); return { text: c.w(`${back} you {${s2.year >= 2005 ? "took the meeting from the couch" : "made your calls from the kitchen phone"} with ${n} asleep on your feet,|did paperwork between juice boxes,} and nobody at work noticed, or they were kind about it.`), mood: 0 }; } },
          { id: "a_sickDay.sitter", label: "Call the backup sitter", hint: "worth every dollar", act: "hireCare", style: "safe", weight: 0.12, apply: (s2, c) => { spend(s2, 0.005); return { text: `${back} you called the backup sitter, made the meeting, and came home to a kid who said the sitter was more fun than you.`, mood: 0 }; } },
        ],
      };
    },
  },
  A("a_birthdayParty", [22, 55], 0.05, (s, ctx) => {
    const k = kidIn(s, ctx, 3, 10), n = k.call, y = s.year;
    const place = y < 1978 ? "in the backyard, with a sheet cake and pin the tail on the donkey" : y < 1995 ? "at Chuck E. Cheese, with tokens and a giant mouse" : y < 2008 ? "with a rented bounce house on the front lawn" : "at the trampoline park, after you spent a week on the Pinterest invitations";
    return [
      `You threw ${n}'s ${ordWord(k.age)} birthday party ${place}. {Someone cried. Someone threw up. Everyone said it was the best party ever.|You were finding confetti until spring.}`,
      `For ${n}'s birthday you made a cake shaped like {a castle|a dinosaur|a race car} that looked, everyone agreed, like {a potato.|a hat.} ${n} said it was perfect.`,
      `${n} invited the whole class, and {nineteen kids|twenty-two kids} came to the party ${place}. You {lay on the floor afterward and stared at the ceiling.|swore next year would be small, and lied.}`,
    ];
  }, { tags: ["children"], cooldown: 3, max: 1, mood: 3, when: s => home(s) && hasKid(3, 10)(s) }),
  A("a_halloween", [22, 55], 0.045, (s, ctx) => {
    const k = kidIn(s, ctx, 3, 11), n = k.call, y = s.year;
    const costume = y < 1985 ? ctx.rng.pick(["a ghost made from a bedsheet", "a hobo with a burnt-cork beard", "a store-bought witch with a plastic mask"]) : y < 1995 ? ctx.rng.pick(["a Ninja Turtle", "a Ghostbuster", "a California Raisin"]) : y < 2005 ? ctx.rng.pick(["a Power Ranger", "Harry Potter", "a Pokemon"]) : y < 2015 ? ctx.rng.pick(["a Transformer", "Hannah Montana", "a Minion"]) : ctx.rng.pick(["Elsa", "a Minecraft creeper", "a very determined dinosaur"]);
    return [
      `For Halloween ${n} went as ${costume}, and {you sewed until midnight.|it rained, so the costume went over a winter coat.|you carried ${them(k)} home at the end, still holding the candy bag.}`,
      `You took ${n} trick-or-treating as ${costume}, and {you ate all the Butterfingers when ${they(k)} went to bed.|${n} said “trick or treat” to every house and “thank you” to none.|the neighbor with the full-size candy bars became a legend.}`,
      `${n} changed ${their(k)} mind about the costume three times, and on the night went as ${costume}. {You were proud of the cardboard.|The photo is still on your fridge.}`,
    ];
  }, { tags: ["children"], cooldown: 3, max: 2, mood: 3, when: s => home(s) && hasKid(3, 11)(s) }),
  A("a_kidTalk", [28, 60], 0.18, (s, ctx) => {
    const k = kidIn(s, ctx, 10, 12), n = k.call, other = together(s) ? (s.partner.sex === "female" ? "Mom" : "Dad") : "a kid on the bus";
    return [
      `You had “the talk” with ${n}, {using a library book with diagrams.|in the car, so nobody had to make eye contact.|and ${they(k)} said, “I know, ${other} told me,” which was a relief.}`,
      `${n} asked a question at dinner about where babies come from, {and ${together(s) ? pn(s) : "you"} choked on a green bean.|and you answered it honestly, and then ${they(k)} asked for dessert.}`,
      `You sat on the edge of ${n}'s bed and explained puberty. ${cap(they(k))} {pulled the covers over ${their(k)} head and said “okay, okay, OKAY.”|listened, nodded, and then asked if the dog would also go through it.}`,
    ];
  }, { tags: ["children"], once: true, mood: 1, when: s => home(s) && hasKid(10, 12)(s) }),

  // ---------- parenting: school years ----------
  {
    id: "a_pta", domain: "family", channel: "good", tags: ["children"], once: true, ages: [25, 55], when: s => home(s) && hasKid(5, 11)(s), p: () => 0.05,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 5, 11), n = k.call;
      const [lead, then] = scene(ctx, [
        [`A sign-up sheet came home in ${n}'s backpack: the PTA needs a treasurer, room parents and someone for the bake sale.`, "When the PTA sign-up sheet came home,"],
        [`At back-to-school night, the PTA president looked right at you and said, “We could really use someone like you.”`, "When the PTA president singled you out at back-to-school night,"],
        [`${n}'s school is raising money for ${s.year < 1995 ? "new library books" : "new playground equipment"}, and it's ${s.year < 2000 ? "wrapping paper" : "a fun run"} season again.`, "When the school fundraiser came around,"],
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you get involved?", "Do you volunteer?"])}`,
        options: [
          { id: "a_pta.board", label: "Join the PTA board", hint: "meetings, and power", act: "volunteer", style: "social", weight: 0.2, apply: (s2, c) => { s2.flags.pta = s2.age; return { text: c.w(`${then} you joined the PTA board. {You learned more about the politics of the snack table than about anything at work.|You ran a carnival that cleared ${usd(c, s2, 0.1)} and you still dream about the dunk tank.}`), mood: 2 }; } },
          { id: "a_pta.bake", label: "Bake for the bake sale", hint: "brownies are diplomacy", act: "hobby", style: "family", weight: 0.26, apply: (s2, c) => ({ text: c.w(`${then} you baked {four dozen brownies|a lemon cake that sold out in nine minutes|cookies that ${n} decorated with too many sprinkles} and felt like a pillar of the community.`), mood: 2 }) },
          { id: "a_pta.room", label: "Be a room parent", hint: "class parties and field trips", act: "volunteer", style: "family", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${then} you became ${n}'s room parent: {the Valentine's party, two field trips and a class pet that came home for spring break.|you organized the class party and learned twenty-six names.}`), mood: 3 }) },
          { id: "a_pta.check", label: "Write a check instead", hint: "time is money", act: "donate", style: "safe", weight: 0.2, apply: (s2, c) => { spend(s2, 0.01); return { text: c.w(`${then} you wrote a check and {stayed out of the meetings.|bought forty rolls of wrapping paper you still have.}`), mood: 0 }; } },
          { id: "a_pta.avoid", label: "Stay out of school politics", hint: "you've heard stories", act: "avoid", style: "self", weight: 0.18, apply: (s2, c) => ({ text: c.w(`${then} you {smiled, nodded and backed slowly out of the gym.|let the other parents handle it and showed up for the play.}`), mood: 0 }) },
        ],
      };
    },
  },
  {
    // Kids' sports: Little League from 1939, youth soccer booming from the 1970s, travel teams from the 1990s.
    id: "a_kidSports", domain: "family", channel: "good", tags: ["children"], ages: [25, 58], cooldown: 4, max: 2, when: s => home(s) && hasKid(5, 14)(s), p: () => 0.045,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 5, 14), n = k.call, sport = s.year >= 1975 ? ctx.rng.pick(["soccer", "soccer", "Little League", "basketball", k.sex === "female" ? "softball" : "hockey"]) : ctx.rng.pick(["Little League", "basketball", "swim team"]);
      const [lead] = scene(ctx, [
        [`${n}'s ${sport} team lost its coach, and the league ${s.year >= 1998 ? "emailed" : "called"} every parent asking for a volunteer.`, `When ${n}'s ${sport} team needed a coach,`],
        [`${n} has ${sport} practice three nights a week and games at 8 a.m. on Saturdays.`, `With ${sport} three nights a week and 8 a.m. Saturday games,`],
        k.age >= 9 && s.year >= 1990 ? [`${n}'s ${sport} coach says ${they(k)} should try out for the travel team. It costs ${usd(ctx, s, 0.05)} a season plus weekends in hotels.`, `When the coach suggested the ${sport} travel team,`] : null,
        [`${n} came home from ${sport} and said ${they(k)} hates it and wants to quit.`, `When ${n} wanted to quit ${sport},`],
      ]);
      const then = `That ${sport} season,`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you handle it?"])}`,
        options: [
          { id: "a_kidSports.coach", label: "Volunteer to coach", hint: "you watched a video once", act: "volunteer", style: "social", weight: 0.18, apply: (s2, c) => { fitter(s2); return { text: c.w(`${then} you ended up coaching the team. {You went two and nine, and every kid got a trophy and a hug.|You learned that eight-year-olds run in a herd.|The orange slices were the most organized part of the season.}`), mood: 4 }; } },
          { id: "a_kidSports.cheer", label: "Drive, cheer, bring snacks", hint: "the parent in the folding chair", act: "care", style: "family", weight: 0.32, apply: (s2, c) => ({ text: c.w(`${then} you {drove carpool, brought the snacks and yelled from a folding chair|stood on the sidelines in every kind of weather} all season. ${n} {scored once and looked straight at you.|mostly waved at you from the field.}`), mood: 3 }) },
          { id: "a_kidSports.travel", label: "Go all in on the travel team", hint: "money, hotels, maybe a scholarship", act: "invest", style: "risk", weight: 0.14, apply: (s2, c) => { spend(s2, 0.06); stress(s2, 0.03); return { text: c.w(`${then} you went all in: travel team, private lessons, weekend tournaments in {Ohio|three states|hotels with indoor pools}. ${n} got really good, and the family calendar became a spreadsheet.`), mood: 1 }; } },
          { id: "a_kidSports.quit", label: `Let ${n} take a break from ${sport}`, hint: "it's supposed to be fun", act: "rest", style: "self", weight: 0.14, apply: (s2, c) => ({ text: c.w(`${then} you let ${n} take a break from ${sport}. {${cap(they(k))} took up drawing instead and was happier.|Saturday mornings became pancakes.}`), mood: 1 }) },
          { id: "a_kidSports.finish", label: "Finish the season, then decide", hint: "you don't let the team down", act: "insist", style: "safe", weight: 0.22, apply: (s2, c) => ({ text: c.w(`${then} you told ${n} to finish what ${they(k)} started and decide after. {${cap(they(k))} grumbled, then made a friend on the bench.|${cap(they(k))} finished, quit, and was proud of finishing.}`), mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "a_conference", domain: "study", channel: "bad", tags: ["children"], ages: [25, 58], cooldown: 4, max: 2, when: s => home(s) && hasKid(6, 15)(s), p: () => 0.04,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 6, 15), n = k.call;
      const [issue, was] = ctx.rng.pick([["is falling behind in reading", "was falling behind in reading"], ["is struggling with math", "was struggling with math"], ["can't sit still and seems far away in class", "couldn't sit still and seemed far away in class"], ["has stopped turning in homework", "had stopped turning in homework"], ["talks through every lesson", "talked through every lesson"]]);
      const lead = scene(ctx, [
        `At the parent-teacher conference, sitting in a tiny chair, you heard that ${n} ${issue}.`,
        `${n}'s report card came home, and a note from the teacher says ${n} ${issue}.`,
        `${n}'s teacher ${s.year >= 1998 ? "emailed" : "called"} to say ${n} ${issue}, and asked if things were okay at home.`,
      ]);
      const back = `When the teacher said ${n} ${was},`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you help?"])}`,
        options: [
          { id: "a_conference.tutor", label: "Get a tutor", hint: "a fresh voice", act: "seekHelp", style: "learn", weight: 0.22, apply: (s2, c) => { spend(s2, 0.03); return { text: c.w(`${back} you found a tutor, {a retired teacher who believed in index cards.|a college student ${n} thought was very cool.} By spring ${n} was caught up.`), mood: 2 }; } },
          { id: "a_conference.eval", label: "Ask the school for an evaluation", hint: "maybe there's a reason", act: "counsel", style: "health", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${back} you asked the school for an evaluation. ${s2.year >= 1990 ? "{It turned out there was a reason, and a plan, and a teacher who knew what to do.|The evaluation found a learning difference, and things got easier once it had a name.}" : `{The counselor tested ${n} and found nothing wrong but nerves.|The school moved ${n} to the front row and checked in weekly.}`}`), mood: 2 }) },
          { id: "a_conference.together", label: "Do homework together every night", hint: "the kitchen table", act: "study", style: "family", weight: 0.26, apply: (s2, c) => ({ text: c.w(`${back} you sat with ${n} at the kitchen table every night after dinner. {You relearned long division and were not happy about it.|By the end of the year ${n} needed you less, which was the point.}`), mood: 2 }) },
          { id: "a_conference.talk", label: `Ask ${n} what's going on`, hint: "maybe it isn't school", act: "talk", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${back} you took ${n} for ice cream and asked what was going on. {It turned out a friend had moved away.|${cap(they(k))} was being picked on at recess.|${cap(they(k))} needed glasses and hadn't wanted to say.} Things got better from there.`), mood: 2 }) },
          { id: "a_conference.strict", label: "No screens until grades come up", hint: "consequences", act: "insist", style: "safe", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${back} you took away ${s2.year < 1985 ? "the TV" : s2.year < 2008 ? "the video games" : "the phone"} until the grades came up. {There was a cold war, and then a B-plus.|${n} sulked for a month and then got organized.}`), mood: 0 }) },
        ],
      };
    },
  },
  {
    // What the kids want to stare at, by era.
    id: "a_screens", domain: "family", channel: "change", tags: ["children"], once: true, ages: [25, 58], when: s => home(s) && s.year >= 1980 && hasKid(6, 15)(s), p: () => 0.05,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 6, 15), n = k.call, y = s.year;
      const thing = y < 1990 ? "the Nintendo" : y < 2000 ? (k.age >= 12 ? "AOL chat rooms" : "the PlayStation") : y < 2010 ? (k.age >= 12 ? "MySpace and the Xbox" : "the Game Boy") : y < 2020 ? (k.age >= 11 ? "Instagram and YouTube" : "Minecraft on the iPad") : (k.age >= 11 ? "TikTok" : "Roblox");
      const lead = scene(ctx, [
        `${n} spends every free minute on ${thing}, and you have started finding ${them(k)} at it at midnight.`,
        `${n} said all ${their(k)} friends get unlimited ${thing}, and you are the only mean parent in the world.`,
        `You counted: ${n} was on ${thing} for six hours on Saturday.`,
      ]);
      const back = `With ${n} on ${thing} all the time,`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What are the rules?", "What do you do?"])}`,
        options: [
          { id: "a_screens.limit", label: "Set a strict time limit", hint: "one hour, then outside", act: "insist", style: "safe", weight: 0.26, apply: (s2, c) => ({ text: c.w(`${back} you set a one-hour limit {with a kitchen timer.|${y >= 2015 ? "with a parental-control app" : "and hid the power cord"}.} There was outrage, and then, eventually, books.`), mood: 0 }) },
          { id: "a_screens.rules", label: "Make the rules together", hint: "buy-in", act: "talk", style: "social", weight: 0.24, apply: (s2, c) => ({ text: c.w(`${back} you sat down with ${n} and wrote the rules together: {no screens at dinner, none after nine, and you follow them too.|homework first, then ${thing}.} ${n} held you to your own rules, ruthlessly.`), mood: 1 }) },
          { id: "a_screens.join", label: "Play with them", hint: "know what it is", act: "socialize", style: "family", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${back} you sat down and tried ${thing} yourself. {${n} was delighted to show you how it all worked.|You understood it a little better, and ${n} liked having you there.}`), mood: 3 }) },
          { id: "a_screens.outside", label: "Sign them up for something outside", hint: "fresh air", act: "exercise", style: "health", weight: 0.18, apply: (s2, c) => ({ text: c.w(`${back} you signed ${n} up for {swim lessons|a hiking club|scouts|a summer day camp}, and ${they(k)} came home sunburned and tired and happy.`), mood: 2 }) },
          { id: "a_screens.let", label: "Let it go", hint: "you watched plenty of TV", act: "wait", style: "self", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${back} you let it go. You watched plenty of TV as a kid{, and you turned out mostly fine.|, and ${n} grew out of it, mostly.}`), mood: 0 }) },
        ],
      };
    },
  },
  {
    // A first phone: flip phones in the 2000s, smartphones from about 2010; the “Wait Until 8th” pledge from 2017.
    id: "a_firstPhone", domain: "family", channel: "change", tags: ["children"], once: true, ages: [30, 60], when: s => home(s) && s.year >= 2004 && hasKid(10, 14)(s), p: () => 0.12,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 10, 14), n = k.call, smart = s.year >= 2010;
      const lead = scene(ctx, [
        `${n} is the last kid in ${their(k)} class without a phone, according to ${n}.`,
        `${n} has started walking home from school, and you want to be able to reach ${them(k)}.`,
        smart ? `For ${their(k)} birthday, ${n} has asked for exactly one thing: a smartphone.` : `${n} wants a cell phone, the kind that flips, with a ringtone.`,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["Do you get one?", "What do you decide?"])}`,
        options: [
          { id: "a_firstPhone.smart", label: smart ? "Get a smartphone" : "Get the flip phone", hint: "everyone has one", act: "care", style: "family", weight: 0.3, apply: (s2, c) => { spend(s2, 0.01); return { text: c.w(`You got ${n} ${smart ? "a smartphone" : "a flip phone"}. {The first text said “hi its me,” and you saved it.|${cap(they(k))} changed the ringtone nine times the first night.}`), mood: 2 }; } },
          { id: "a_firstPhone.basic", label: smart ? "A basic phone, calls and texts only" : "A prepaid phone for emergencies", hint: "reachable, not online", act: "save", style: "safe", weight: 0.22, apply: (s2, c) => ({ text: c.w(`You got ${n} a basic phone for calls and texts. {${cap(they(k))} called it “a brick” and used it constantly.|It was enough, mostly.}`), mood: 1 }) },
          { id: "a_firstPhone.wait", label: s.year >= 2017 ? "Wait until eighth grade" : "Wait until high school", hint: "a little longer", act: "wait", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You told ${n} to wait until ${s2.year >= 2017 ? "eighth grade" : "high school"} for a phone. {There was a long speech about fairness.|Two other families agreed to wait too, which helped.}`), mood: 0 }) },
          { id: "a_firstPhone.contract", label: "A phone with a signed contract", hint: "rules in writing", act: "negotiate", style: "learn", weight: 0.18, apply: (s2, c) => ({ text: c.w(`You and ${n} wrote and signed a phone contract: {it charges in the kitchen overnight, and you know the passcode.|no phones at dinner, for anybody.} ${n} framed it, sarcastically.`), mood: 1 }) },
          { id: "a_firstPhone.earn", label: "They pay for half", hint: "chores, savings", act: "insist", style: "self", weight: 0.1, apply: (s2, c) => ({ text: c.w(`You told ${n} to earn half the phone. {${cap(they(k))} mowed lawns all summer and treated it like a crown jewel.|${cap(they(k))} sold old toys on the internet and paid it off in a month.}`), mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "a_bully", domain: "family", channel: "bad", tags: ["children"], once: true, ages: [25, 58], when: s => home(s) && hasKid(7, 14)(s), p: () => 0.025,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 7, 14), n = k.call;
      const lead = scene(ctx, [
        `${n} has been coming home quiet and going straight to ${their(k)} room. Finally ${they(k)} told you: some kids at school have been picking on ${them(k)}.`,
        s.year >= 2008 ? `You saw the messages on ${n}'s phone: a group of kids from school, saying cruel things.` : `${n} came home with a torn jacket and wouldn't say how.`,
        `${n} has been begging to stay home sick, and you found out ${they(k)} eats lunch alone in the library to avoid a group of kids.`,
      ]);
      const back = `When you learned ${n} was being picked on,`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you help?"])}`,
        options: [
          { id: "a_bully.school", label: "Go to the principal", hint: "it's their job", act: "seekHelp", style: "safe", weight: 0.32, apply: (s2, c) => ({ text: c.w(`${back} you went to the principal ${s2.year >= 2008 ? "with screenshots" : "with notes"}. {The school called the other parents, and it stopped.|It took two meetings, but the teachers started watching.}`), mood: 1 }) },
          { id: "a_bully.listen", label: "Listen first, and make a plan together", hint: "it's their life", act: "talk", style: "family", weight: 0.26, apply: (s2, c) => ({ text: c.w(`${back} you listened, for a long time, and made a plan with ${n}: {who to sit with, which teacher to tell, and a code word for coming home early.|a new lunch table and a standing Friday treat.} ${n} said it helped just to say it out loud.`), mood: 2 }) },
          { id: "a_bully.parents", label: "Call the other kid's parents", hint: "parent to parent", act: "negotiate", style: "risk", weight: 0.12, apply: (s2, c) => ({ text: c.w(`${back} you called the other kid's parents. {It was awkward and it worked; the boy came over to apologize.|They hung up on you, and you went to the school after all.}`), mood: 0 }) },
          { id: "a_bully.class", label: s.year >= 1975 ? "Sign them up for karate" : "Sign them up for boxing at the Y", hint: "confidence", act: "exercise", style: "health", weight: 0.14, apply: (s2, c) => ({ text: c.w(`${back} you signed ${n} up for ${s2.year >= 1975 ? "karate" : "boxing at the Y"}. ${cap(they(k))} never threw a punch at school, {and walked differently by spring.|and made two friends in the class.}`), mood: 2 }) },
          { id: "a_bully.move", label: "Switch schools", hint: "a fresh start", act: "avoid", style: "safe", weight: 0.08, apply: (s2, c) => ({ text: `${back} you moved ${n} to a different school. The first week was hard, and by October ${n} had a friend named after a superhero.`, mood: 1 }) },
          { id: "a_bully.cousin", label: "Ask an older cousin to look out for them", hint: "family has your back", act: "socialize", style: "social", weight: 0.08, apply: (s2, c) => ({ text: `${back} you asked an older cousin at the same school to keep an eye out. Nobody bothered ${n} after the cousin started saying hi in the hallway.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "a_vacation", domain: "family", channel: "good", tags: ["children"], ages: [26, 58], cooldown: 4, max: 3, when: s => home(s) && hasKid(4, 15)(s), p: () => 0.06,
    choice: (s, ctx) => {
      const kids = kidsAged(s, 4, 15), who = kidsCall(kids), tight = s.savings < 0.3;
      const lead = scene(ctx, [
        `Summer is coming, and ${who} ${kids.length > 1 ? "have" : "has"} been asking where you're going.`,
        tight ? "Money is tight this year, but everyone needs a break." : "You have some vacation days saved up, and a little money too.",
        `${s.year >= 1971 ? "A coworker just came back from Disney World with a tan and a haunted look." : "The neighbors just came back from a trip out West with a slide show."}`,
      ]);
      const go = (x, text, mood = 4) => (s2, c) => { spend(s2, x); return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["Where do you go?", "What's the family vacation?"])}`,
        options: [
          { id: "a_vacation.disney", label: s.year >= 1971 ? "Disney World" : "Disneyland", hint: "the magic, and the lines", act: "travel", style: "family", weight: 0.2, apply: go(0.12, `You took ${who} to ${s.year >= 1971 ? "Disney World" : "Disneyland"}. {There were lines, and meltdowns, and one perfect moment at the fireworks.|You waited an hour for a ride that lasted ninety seconds, and ${who} would have done it again.}`, 5) },
          { id: "a_vacation.road", label: "A road trip", hint: "are we there yet", act: "travel", style: "risk", weight: 0.24, apply: go(0.05, `You packed ${who} into the car for a road trip to {the Grand Canyon|Mount Rushmore|Yellowstone|the Smokies}. {Somebody got carsick in Nebraska.|You played license-plate bingo for two thousand miles.} It is the trip everyone still talks about.`, 5) },
          { id: "a_vacation.camp", label: "Camping at a state park", hint: "cheap, and mosquitoes", act: "exercise", style: "health", weight: 0.18, apply: go(0.02, `You took ${who} camping at a state park. {It rained on the tent the first night, and the s'mores were perfect anyway.|${who} saw a deer and talked about nothing else for a week.}`, 4) },
          { id: "a_vacation.beach", label: "A week at the beach", hint: "sand in everything", act: "rest", style: "self", weight: 0.2, apply: go(0.06, `You rented a place at the beach for a week. {${who} dug a hole you could stand in.|Everyone got sunburned the first day and was nicer for it.}`, 4) },
          { id: "a_vacation.home", label: "A staycation", hint: "the pool, the zoo, the backyard", act: "save", style: "safe", weight: 0.18, apply: go(0, `You stayed home for vacation and did {the zoo, the public pool and a backyard campout|the free museum, a minor-league game and a lot of popsicles}. ${who} called it “the best week,” which you will not forget.`, 3) },
        ],
      };
    },
  },
  A("a_recital", [25, 60], 0.035, (s, ctx) => {
    const k = kidIn(s, ctx, 5, 16), n = k.call, cam = camera(s.year);
    const [what, how] = ctx.rng.pick([["school play", "forgot one line and improvised a better one"], ["band concert", "played one wrong note, proudly"], ["dance recital", "went left when everyone went right, and smiled the whole time"], ["spelling bee", "spelled “necessary” correctly and looked straight at you"]]);
    return [
      `You went to ${n}'s ${what} and recorded the whole thing on ${cam}. ${n} ${how}.`,
      `${n} was {a tree in the school play|third clarinet in the winter concert|a snowflake in the recital}, and you {clapped like it was Broadway.|took more photos than the yearbook.}`,
      `At ${n}'s {piano recital|science fair|art show}, ${they(k)} looked for you in the crowd, found you, and {relaxed.|grinned.} You were exactly where you were supposed to be.`,
    ];
  }, { tags: ["children"], cooldown: 4, max: 2, mood: 4, when: s => home(s) && hasKid(5, 16)(s) }),
  {
    // The family dog: the kids beg, you give in, or you don't.
    id: "a_kidDog", domain: "family", channel: "good", tags: ["children"], once: true, ages: [26, 55], when: s => home(s) && hasKid(5, 13)(s) && !s.flags.familyDog, p: () => 0.05,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 5, 13), n = k.call, dog = dogName(ctx, s.year);
      const lead = scene(ctx, [
        `${n} has been begging for a dog for two years, and just presented you with a hand-drawn chart of who will walk it.`,
        `A neighbor's dog had puppies, and ${n} has been sitting at their fence every afternoon.`,
        `${n} wrote “a dog” at the top of ${their(k)} birthday list, underlined it four times, and left the list on your pillow.`,
      ]);
      const adopt = (text, mood = 6) => (s2, c) => { s2.flags.familyDog = { name: dog, since: s2.age }; return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["Do you get a dog?", "What do you say?"])}`,
        options: [
          { id: "a_kidDog.shelter", label: "Adopt from the shelter", hint: "a mutt who needs you", act: "care", style: "family", weight: 0.34, apply: adopt(`You took ${n} to the shelter and came home with a mutt named ${dog}. {${dog} slept on ${n}'s bed from the first night.|${dog} ate a shoe the first week, and was forgiven.}`) },
          { id: "a_kidDog.puppy", label: "Get a puppy", hint: "chewing, crying, love", act: "care", style: "risk", weight: 0.2, apply: adopt(`You got a puppy and ${n} named it ${dog}. {The puppy cried every night for a week, and so, nearly, did you.|The carpet did not survive, and nobody cared.}`) },
          { id: "a_kidDog.fish", label: "Start with a goldfish", hint: "a test of responsibility", act: "wait", style: "safe", weight: 0.16, apply: (s2, c) => ({ text: c.w(`You got ${n} a goldfish as a test of responsibility. {The goldfish lived for nine years, which proved something.|${n} named it ${dog} anyway.}`), mood: 2 }) },
          { id: "a_kidDog.cat", label: "Get a cat instead", hint: "lower maintenance", act: "care", style: "self", weight: 0.14, apply: (s2, c) => ({ text: c.w(`You compromised on a cat. ${n} named her ${dog}, {and she chose you as her favorite, which was unfair to everyone.|and she ignored everyone equally and was adored.}`), mood: 4 }) },
          { id: "a_kidDog.no", label: "Say no", hint: "you know who'd end up walking it", act: "insist", style: "safe", weight: 0.16, apply: (s2, c) => ({ text: c.w(`You said no to a dog, because you knew who would be walking it in the rain. ${n} {sulked, and then walked the neighbor's dog for money.|said you were ruining ${their(k)} childhood, in writing.}`), mood: -1 }) },
        ],
      };
    },
  },
  A("a_oldDog", [30, 75], 0.3, (s, ctx) => {
    const d = s.flags.familyDog.name;
    return [
      `${d} got old: a gray muzzle, slow on the stairs, still waiting at the door every evening. When it was time, the whole family was there at the vet's, {and you held ${d}'s paw.|and the kids said goodbye one at a time.}`,
      `${d} died at home, asleep in a patch of sun. {You buried ${d} under the maple in the backyard, and the kids made a sign.|For weeks you still looked for ${d} when you came in the door.}`,
      `You said goodbye to ${d} after {twelve|thirteen|eleven} years. The leash still hangs by the back door, {and nobody wants to move it.|and you can't bring yourself to put it away.}`,
    ];
  }, { domain: "family", channel: "bad", once: true, mood: -5, when: s => !!s.flags.familyDog && s.age - s.flags.familyDog.since >= 10, effect: s => { s.flags.familyDog = null; } }),
  A("a_movieNight", [26, 60], 0.03, (s, ctx) => {
    const kids = kidsCall(kidsAged(s, 4, 14)), way = movieWay(s.year);
    return [
      `Friday became family movie night: ${way}, a bowl of popcorn and ${kids} piled on the couch. {Somebody always fell asleep before the end.|You argued every week about who picked.}`,
      s.year >= 1985 && s.year < 2008 ? `You took ${kids} to the video store every Friday, and the fight in the new-releases aisle {was the real entertainment.|ended with the same movie as last week.}` : `You watched ${way} with ${kids}, and {you were the one who cried.|${kids} quoted it for a year.}`,
      `On a snow day you made a fort out of couch cushions and watched ${way} with ${kids}. {It was the best day of the winter.|Nobody wanted to clean up the fort, so it stayed a week.}`,
    ];
  }, { tags: ["children"], cooldown: 5, max: 2, mood: 3, when: s => home(s) && hasKid(4, 14)(s) }),
  A("a_proudKid", [28, 70], 0.025, (s, ctx) => {
    const k = kidIn(s, ctx, 6, 20), n = k.call;
    return [
      `${n} {stood up for a kid who was being teased|gave ${their(k)} birthday money to a classmate whose house burned down|helped an old man across the parking lot without being asked}, and the school called to tell you. You sat in the car afterward and just smiled.`,
      `${n} {won the science fair with a project about mold|made the honor roll|got a part in the school musical|finished a 5K} and pretended it was no big deal. You pretended too, and then told everyone you knew.`,
      `You overheard ${n} talking to a friend, and ${they(k)} said, “My ${s.sex === "female" ? "mom" : "dad"} always says…” and then said something you say. {You had to leave the room for a minute.|You had no idea ${they(k)} were listening.}`,
    ];
  }, { tags: ["children"], cooldown: 4, max: 3, mood: 5, when: s => hasKid(6, 20)(s) }),
  A("a_remoteSchool", [26, 70], 0.8, (s, ctx) => {
    const kids = kidsCall(kidsAged(s, 5, 17));
    return [
      `When the schools closed, ${kids} did school on Zoom at the kitchen table, and you {worked from the laundry room.|learned how to unmute twenty times a day.|became an IT department, a lunch lady and a gym teacher.}`,
      `Remote school meant ${kids} and you shared the Wi-Fi, {and it gave out every day at 10 a.m.|and you heard a lot of fourth-grade math through the wall.}`,
      `You watched ${kids} wave at classmates in little squares on a screen, and {it broke your heart a little.|you were proud of how they adapted.}`,
    ];
  }, { tags: ["children"], once: true, years: [2020, 2021], mood: -1, when: s => home(s) && (s.year === 2020 || s.year === 2021) && hasKid(5, 17)(s) }),

  // ---------- parenting: teenagers ----------
  {
    id: "a_curfew", domain: "family", channel: "bad", tags: ["children"], ages: [30, 65], cooldown: 3, max: 2, when: s => home(s) && hasKid(14, 17)(s), p: () => 0.05,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 14, 17), n = k.call;
      const [lead, then] = scene(ctx, [
        [`It's 1:30 a.m., ${n}'s curfew was midnight, and ${s.year >= 2000 ? `${their(k)} phone goes straight to voicemail` : "the phone hasn't rung"}.`, `The night ${n} came home an hour and a half after curfew,`],
        [`You checked on ${n} at midnight and found a pile of pillows under the blanket and an open window.`, `The night you found pillows under ${n}'s blanket,`],
        [`Another parent called: there was a party with no adults and plenty of beer, and ${n} was there.`, `When you found out ${n} had been at a party with beer,`],
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you handle it?"])}`,
        options: [
          { id: "a_curfew.ground", label: "Ground them", hint: "two weeks, no car", act: "insist", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${then} you grounded ${them(k)} for two weeks. {${n} slammed doors in ways you didn't know a door could be slammed.|${n} was furious, and then very polite, which was worse.}`), mood: -1 }) },
          { id: "a_curfew.talk", label: "Wait up, then talk calmly", hint: "scared, not angry", act: "talk", style: "social", weight: 0.26, apply: (s2, c) => ({ text: c.w(`${then} you waited up at the kitchen table and told ${them(k)} you had been scared, not angry. {${n} cried, which you did not expect.|It was the first real conversation in months.}`), mood: 1 }) },
          { id: "a_curfew.ride", label: "Promise a no-questions ride home", hint: "call me, anytime", act: "care", style: "family", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${then} you made ${n} a deal: call you anytime, from anywhere, and you'll come with no questions asked. {Two months later, at 2 a.m., the phone rang, and you went.|${n} never had to use it, and you both knew it was there.}`), mood: 2 }) },
          { id: "a_curfew.track", label: s.year >= 2012 ? "Turn on location sharing" : "Call every parent in the school", hint: "trust, but verify", act: "insist", style: "risk", weight: 0.14, apply: (s2, c) => ({ text: s2.year >= 2012 ? c.w(`${then} you turned on location sharing on ${n}'s phone. {${n} called it a surveillance state.|You checked the little dot more often than you would admit.}`) : `${then} you started calling every parent whose house ${n} said ${they(k)} would be at. ${n} found it humiliating and was home on time.`, mood: 0 }) },
          { id: "a_curfew.remember", label: "Remember being seventeen", hint: "you did worse", act: "wait", style: "self", weight: 0.14, apply: (s2, c) => ({ text: c.w(`${then} you remembered being seventeen yourself and {let it go with a warning.|just said “Never again, okay?” and went to bed.}`), mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "a_fenderBender", domain: "family", channel: "bad", tags: ["children"], once: true, ages: [32, 65], when: s => home(s) && hasKid(16, 18)(s), p: () => 0.06,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 16, 18), n = k.call;
      const what = ctx.rng.pick(["backed the car into a mailbox", "rear-ended someone at a red light, slowly", "scraped the whole side of the car on the garage door", "slid into a ditch on an icy road"]);
      return {
        prompt: `${n} called, shaking: ${they(k)} ${what}. Nobody is hurt; the car is another story. ${ctx.rng.pick(["What do you do?", "How do you handle it?"])}`,
        options: [
          { id: "a_fenderBender.pay", label: "They pay for the repair", hint: "a summer of shifts", act: "insist", style: "safe", weight: 0.28, apply: (s2, c) => ({ text: c.w(`When ${n} ${what}, you made ${them(k)} pay for the repair. {${cap(they(k))} worked at the ice cream shop all summer and became the most careful driver in the family.|It took four months of babysitting money.}`), mood: 0 }) },
          { id: "a_fenderBender.hug", label: "Hug them first", hint: "the car is just a car", act: "care", style: "family", weight: 0.28, apply: (s2, c) => ({ text: c.w(`When ${n} ${what}, you drove over and hugged ${them(k)} before you even looked at the car. {${n} still remembers that.|The car got fixed, and so did ${their(k)} nerves.}`), mood: 2 }) },
          { id: "a_fenderBender.insurance", label: "File the insurance claim", hint: "that's what it's for", act: "insurance", style: "safe", weight: 0.16, apply: (s2, c) => { spend(s2, 0.02); return { text: `When ${n} ${what}, you filed the insurance claim, and the premium for a teenage driver went up again, as you had been warned it would.`, mood: -1 }; } },
          { id: "a_fenderBender.lesson", label: "Take them driving every weekend", hint: "practice, practice", act: "study", style: "learn", weight: 0.16, apply: (s2, c) => ({ text: c.w(`When ${n} ${what}, you took ${them(k)} out driving every Sunday for two months: {parallel parking, the highway, the parking lot in the rain.|you gripped the door handle less every week.}`), mood: 1 }) },
          { id: "a_fenderBender.keys", label: "Take the keys for a month", hint: "rides from you, again", act: "insist", style: "self", weight: 0.12, apply: (s2, c) => ({ text: `When ${n} ${what}, you took the keys for a month and went back to driving ${them(k)} everywhere, which punished you about as much as it punished ${them(k)}.`, mood: -1 }) },
        ],
      };
    },
  },
  {
    // A child comes out. Share of young adults who identify as LGBT: a few percent in surveys before 2000, about one in
    // five of Gen Z by the 2020s (Gallup); coming out to parents grew far more common over the period.
    id: "a_comingOut", domain: "family", channel: "change", tags: ["children"], once: true, ages: [30, 70], when: s => home(s) && hasKid(14, 24)(s), p: s => (s.year < 1990 ? 0.003 : s.year < 2010 ? 0.007 : 0.012),
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 14, 24), n = k.call, is = ctx.rng() < 0.6 ? "is gay" : "is bisexual";
      const lead = scene(ctx, [
        `${n} asked to talk, sat on the edge of the couch, and told you ${they(k)} ${is}. ${cap(they(k))} is watching your face.`,
        k.age >= 18 ? `${n} called ${s.year >= 2008 ? "from the dorm" : "from college"} and, after a long pause, said ${they(k)} ${is} and wanted you to know.` : `${n} left a letter on your pillow: ${they(k)} ${is}, and ${they(k)} had been scared to say it out loud.`,
        `On a long drive, looking straight ahead at the road, ${n} said ${they(k)} ${is}.`,
      ]);
      const done = (text, mood = 4) => (s2, c) => { c.remember("a_comingOut", text); return { text: c.w(text), mood, big: true }; };
      const year = s.year;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you say?", "How do you respond?"])}`,
        options: [
          { id: "a_comingOut.love", label: "“I love you. Nothing changes.”", hint: "say it first", act: "talk", style: "family", weight: 0.36, apply: done(`When ${n} came out to you, you said, “I love you. Nothing changes,” and held on for a long time. {${n} said later that was the moment ${they(k)} could breathe again.|You both cried, and then you ordered pizza.}`, 5) },
          { id: "a_comingOut.knew", label: "Tell them you kind of knew", hint: "with a smile", act: "talk", style: "social", weight: 0.18, apply: done(`When ${n} came out to you, you smiled and said you had kind of known for a while, and that you were glad ${they(k)} told you. ${n} laughed, “Seriously?” and everything got lighter.`, 5) },
          { id: "a_comingOut.learn", label: year >= 1973 ? "Ask how to help, and find PFLAG" : "Ask how you can help", hint: "learn what you don't know", act: "seekHelp", style: "learn", weight: 0.18, apply: done(`When ${n} came out to you, you asked how you could help, and ${year >= 1973 ? "went to a PFLAG meeting the next month, where the other parents handed you coffee and good advice." : "read everything the library had, which was not much, and asked ${n} to teach you the rest."}`, 4) },
          { id: "a_comingOut.time", label: "Be honest: you need a little time", hint: "and then come around", act: "wait", style: "safe", weight: 0.14, apply: done(`When ${n} came out to you, you were honest that you needed a little time, and you told ${them(k)} you loved ${them(k)} while you took it. {By Thanksgiving you were asking about ${their(k)} friends by name.|It took a few months, and then you were the parent at the front of the parade.}`, 2) },
          { id: "a_comingOut.party", label: "Make a celebration of it", hint: "cake with a rainbow", act: "socialize", style: "risk", weight: 0.14, apply: done(`When ${n} came out to you, you {baked a cake with a rainbow on it, slightly crooked.|took ${them(k)} out for a fancy dinner and toasted with sparkling cider.} ${n} said “You're so embarrassing,” and kept the photo.`, 5) },
        ],
      };
    },
  },
  {
    // College applications: the Common App from 1975 (online from 1998), FAFSA from 1992, the SAT throughout.
    id: "a_collegeApps", domain: "study", channel: "change", tags: ["children"], once: true, ages: [34, 65], when: s => home(s) && hasKid(17, 17)(s), p: () => 0.5,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 17, 17), n = k.call;
      const lead = scene(ctx, [
        `It's ${n}'s senior year, and the kitchen table is covered in college brochures and ${s.year >= 1992 ? "the FAFSA" : "financial aid forms"}.`,
        `${n} has a college essay due in a week and has written one sentence: “Ever since I was a child…”`,
        `${n} wants to apply to ${ctx.rng.pick(["a school three thousand miles away", "a school you've never heard of", "the school you went to", "twelve schools"])}, and you are trying to have opinions quietly.`,
      ]);
      const back = `During ${n}'s college applications,`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you help?", "What's your role?"])}`,
        options: [
          { id: "a_collegeApps.visit", label: "Take a road trip to visit schools", hint: "campus tours and diners", act: "travel", style: "family", weight: 0.26, apply: (s2, c) => { spend(s2, 0.03); return { text: c.w(`${back} you drove ${n} to visit schools: {six campuses in five days, a lot of diners, and one tour guide who walked backward the whole way.|${n} knew the moment ${they(k)} stepped onto one quad, and you saw it happen.}`), mood: 4 }; } },
          { id: "a_collegeApps.essay", label: "Help with the essay, gently", hint: "read, don't write", act: "study", style: "learn", weight: 0.22, apply: (s2, c) => ({ text: c.w(`${back} you read ${n}'s essay drafts and resisted rewriting them. {The final one was about ${their(k)} grandmother, and you had to step out of the room.|You only suggested one comma, and ${they(k)} took it out.}`), mood: 3 }) },
          { id: "a_collegeApps.handsOff", label: "Let them run it", hint: "their future, their forms", act: "wait", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${back} you let ${n} run the whole thing. {${cap(they(k))} missed one deadline and made every other one.|You learned where ${they(k)} applied mostly from the mail.}`), mood: 1 }) },
          { id: "a_collegeApps.money", label: "Have the money talk early", hint: "what you can actually pay", act: "talk", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${back} you sat down with ${n} and laid out what you could actually pay. {It was a hard talk, and it made the choices clearer.|${n} added two state schools to the list, on ${their(k)} own.}`), mood: 1 }) },
          { id: "a_collegeApps.counselor", label: s.year >= 2000 ? "Hire a college counselor" : "Pay for an SAT prep course", hint: "every advantage", act: "hireCare", style: "risk", weight: 0.12, apply: (s2, c) => { spend(s2, 0.05); return { text: c.w(`${back} you paid for ${s2.year >= 2000 ? "a private college counselor" : "an SAT prep course"}. {It helped, and so did the four hundred practice questions.|${n} said it was stressful, and the score went up.}`), mood: 1 }; } },
        ],
      };
    },
  },
  {
    // Paying for college: the 529 or the savings bonds if there were any, loans, community college first.
    id: "a_tuition", domain: "wealth", channel: "bad", tags: ["children"], ages: [36, 68], cooldown: 2, max: 3, when: s => home(s) && hasKid(18, 18)(s), p: () => 0.5,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 18, 18), n = k.call, fund = s.flags.collegeFund && s.flags.collegeFund !== "none";
      const bill = usd(ctx, s, s.year < 1980 ? 0.25 : s.year < 2000 ? 0.4 : 0.5);
      const lead = scene(ctx, [
        `${n} got into college. The first-year bill is ${bill}.`,
        fund ? `${n} is going to college, and the ${s.flags.collegeFund === "529" ? "529 plan" : "college fund"} you started years ago will cover part of the ${bill} bill.` : `${n} is going to college in the fall, and you have not saved nearly enough for the ${bill} bill.`,
        `The financial aid letter came: ${n}'s first year will cost the family ${bill} after the grants.`,
      ]);
      const back = `When ${n}'s first college bill came,`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you pay for it?", "What's the plan?"])}`,
        options: [
          { id: "a_tuition.fund", label: fund ? "Use the college fund, then savings" : "Pay from savings", hint: "what it was for", act: "save", style: "family", weight: 0.3, apply: (s2, c) => { spend(s2, fund ? 0.12 : 0.3); return { text: c.w(fund ? `${back} the college fund covered most of it. {You thought of every small deposit over the years and felt very wise.|You made the final payment and took ${n} out to dinner.}` : `${back} you paid it from savings, and the savings got a lot smaller. {It was worth it, you decided, every time you saw the sweatshirt.|You stopped eating out for a year.}`), mood: 1 }; } },
          { id: "a_tuition.loans", label: "Student loans in their name", hint: "they'll have skin in the game", act: "borrow", style: "self", weight: 0.24, apply: (s2, c) => ({ text: c.w(`${back} ${n} took out student loans for most of it. {You helped with books and the phone bill.|${cap(they(k))} read the loan papers twice, which you took as a good sign.}`), mood: 0 }) },
          { id: "a_tuition.plus", label: s.year >= 1980 ? "Take out a parent loan" : "Borrow against the house", hint: "you'll carry it", act: "borrow", style: "risk", weight: 0.14, apply: (s2, c) => { owe(s2, 0.3); return { text: c.w(`${back} you took out ${s2.year >= 1980 ? "a Parent PLUS loan" : "a loan against the house"} so ${n} could start without debt. {You will be paying it a while.|You framed the first statement as a joke and it was not funny.}`), mood: -1 }; } },
          { id: "a_tuition.cc", label: "Two years at community college first", hint: "half the price, same degree", act: "save", style: "safe", weight: 0.16, apply: (s2, c) => { spend(s2, 0.06); return { text: c.w(`${back} you and ${n} agreed on two years at community college first, then a transfer. {${cap(they(k))} lived at home and saved a fortune.|${n} was annoyed for one semester, and then loved a professor there.}`), mood: 1 }; } },
          { id: "a_tuition.job", label: "Pick up a second job", hint: "whatever it takes", act: "sideJob", style: "family", weight: 0.16, apply: (s2, c) => { stress(s2, 0.05); return { text: c.w(`${back} you picked up {weekend shifts|a second job at night|freelance work} to cover the bill. You were tired for four years, and you were at graduation.`), mood: 0 }; } },
        ],
      };
    },
  },
  A("a_kidCalls", [36, 70], 0.06, (s, ctx) => {
    const k = kidIn(s, ctx, 18, 22), n = k.call, via = s.year < 1995 ? "collect from the pay phone in the dorm" : s.year < 2008 ? "from a cell phone with terrible reception" : "on FaceTime, from under a pile of laundry";
    return [
      `${n} called ${via} to ask how to {do laundry without turning everything pink.|cook rice.|get a stain out of a borrowed shirt.} You explained, and hung up smiling.`,
      `${n} called ${via}, and after ten minutes of small talk asked for money. You sent it, {plus a care package of cookies.|and a lecture, which was free.}`,
      `You mailed ${n} a care package: {cookies, socks, quarters for the laundry and a note.|instant noodles, a sweatshirt and a newspaper clipping about ${their(k)} old team.} ${n} called to say thanks and sounded, for a second, about eight years old.`,
    ];
  }, { tags: ["children"], cooldown: 3, max: 2, mood: 3, when: s => hasKid(18, 22)(s) }),
  {
    // The last child leaves: the empty nest.
    id: "a_emptyNest", domain: "family", channel: "change", tags: ["children"], once: true, ages: [38, 70], when: s => kidsLive(s).length > 0 && kidsLive(s).every(k => k.age >= 18) && kidsLive(s).some(k => k.age <= 19), p: () => 0.5,
    choice: (s, ctx) => {
      const last = kidsLive(s).reduce((a, b) => (a.age <= b.age ? a : b)), n = last.call, two = together(s);
      const lead = scene(ctx, [
        `You helped ${n} carry the last box out, and now the house is very quiet.`,
        `${n} moved out, and you keep cooking for ${words(kidsLive(s).length + (two ? 2 : 1))}.`,
        `With ${n} gone, you walked past the empty bedroom three times today${two ? `, and so did ${pn(s)}` : ""}.`,
      ]);
      const done = (text, mood = 2, fx = null) => (s2, c) => { if (fx) fx(s2, c); const t = c.w(text); c.remember("a_emptyNest", t); return { text: t, mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do with the empty nest?", "What now?"])}`,
        options: [
          { id: "a_emptyNest.trip", label: two ? `Travel with ${pn(s)}` : "Travel", hint: "finally", act: "travel", style: "self", weight: 0.24, apply: done(two ? `With ${n} gone, you and ${pn(s)} went to {trip}, just the two of you, for the first time in twenty years. {You remembered you like each other.|You held hands at dinner like teenagers.}` : `With ${n} gone, you went to {trip} on your own, and ordered dessert first.`, 4, s2 => { spend(s2, 0.08); if (two) guardUp(s2, 2); }) },
          { id: "a_emptyNest.room", label: "Turn their room into something", hint: "a gym? an office? a craft room?", act: "hobby", style: "self", weight: 0.2, apply: done(`With ${n} gone, you turned ${n}'s bedroom into {a home gym that became a laundry room.|an office with a door that closes.|a craft room, and ${n} was outraged.}`, 2) },
          { id: "a_emptyNest.hobby", label: "Pick up something new", hint: "pottery, golf, a band", act: "hobby", style: "learn", weight: 0.18, apply: done(`With ${n} gone, you {took a pottery class and made eleven lopsided bowls.|joined a community choir.|learned to play golf, badly, with great joy.}`, 3) },
          { id: "a_emptyNest.call", label: "Call them, maybe a little too often", hint: "just checking in", act: "talk", style: "family", weight: 0.2, apply: done(`With ${n} gone, you ${s.year >= 2010 ? "texted" : "called"} ${them(last)} every day until ${they(last)} gently suggested Sundays. Sundays became the best part of the week.`, 1) },
          { id: "a_emptyNest.work", label: "Throw yourself into work", hint: "fill the evenings", act: "pushThrough", style: "risk", weight: 0.1, apply: done(`With ${n} gone, you threw yourself into work and stayed late most nights. {It filled the hours, if not the house.|Your boss noticed; so did you, eventually.}`, 0, s2 => stress(s2, 0.04)) },
          { id: "a_emptyNest.dog", label: "Get a dog", hint: "someone to take care of", act: "care", style: "family", weight: 0.08, when: s2 => !s2.flags.familyDog, apply: (s2, c) => { const d = dogName(c, s2.year); s2.flags.familyDog = { name: d, since: s2.age }; const t = c.w(`With ${n} gone, you got a dog named ${d}. ${n} came home at Thanksgiving and said, “So you replaced me,” and you said yes.`); c.remember("a_emptyNest", t); return { text: t, mood: 5 }; } },
        ],
      };
    },
  },
  {
    // Grown kids moving back home: more common after 2008 and in 2020.
    id: "a_boomerang", domain: "family", channel: "change", tags: ["children"], ages: [42, 75], cooldown: 6, max: 2, when: s => home(s) && hasKid(22, 30)(s), p: s => ((s.year >= 2009 && s.year <= 2013) || s.year === 2020 ? 0.06 : 0.03),
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 22, 30), n = k.call;
      const why = scene(ctx, [s.year === 2020 ? "the pandemic closed everything" : "the job fell through", "rent in the city got impossible", "a breakup ended the lease", "student loans ate the paycheck"]);
      const lead = `${n} called: ${why}, and could ${they(k)} move back home for a while?`;
      const back = `When ${n} moved back home because ${why},`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you say?", "What are the terms?"])}`,
        options: [
          { id: "a_boomerang.yes", label: "Of course, come home", hint: "the porch light is on", act: "care", style: "family", weight: 0.34, apply: (s2, c) => ({ text: c.w(`${back} you said “of course.” {${cap(they(k))} stayed a year, cooked on Thursdays, and left with savings.|It was crowded, and you got to know the grown-up version of ${them(k)}.}`), mood: 2 }) },
          { id: "a_boomerang.rent", label: "Yes, with a little rent", hint: "responsibility", act: "negotiate", style: "safe", weight: 0.22, apply: (s2, c) => ({ text: c.w(`${back} you said yes, for a small rent. {You secretly saved every check and gave it back when ${they(k)} moved out.|${cap(they(k))} paid on time, mostly.}`), mood: 1 }) },
          { id: "a_boomerang.deadline", label: "Yes, until a set date", hint: "a plan, not a forever", act: "insist", style: "self", weight: 0.18, apply: (s2, c) => ({ text: c.w(`${back} you said yes, until June. {The date helped. ${cap(they(k))} was out by May.|It slipped to August, and that was fine.}`), mood: 1 }) },
          { id: "a_boomerang.help", label: "Help them find a job first", hint: "the résumé, the calls", act: "seekHelp", style: "learn", weight: 0.14, apply: (s2, c) => ({ text: c.w(`${back} you sat with ${them(k)} every evening to {fix the résumé and practice interviews.|call everyone you knew.} The job came in three months, and so did the apartment.`), mood: 2 }) },
          { id: "a_boomerang.basement", label: "Fix up the basement for them", hint: "separate, but close", act: "hobby", style: "family", weight: 0.12, apply: (s2, c) => { spend(s2, 0.04); return { text: `${back} you fixed up the basement into a little apartment. ${n} called it “the bunker” and stayed longer than anyone planned, happily.`, mood: 2 }; } },
        ],
      };
    },
  },
  {
    // A grown child marries (same-sex couples from 2015 nationwide).
    id: "a_kidWedding", domain: "family", channel: "good", tags: ["children"], ages: [44, 80], cooldown: 4, max: 2, when: s => home(s) && hasKid(23, 38)(s), p: () => 0.035,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 23, 38), n = k.call;
      const same = s.year >= 2015 && ctx.rng() < 0.05;
      const sp = ctx.person({ role: "friend", sex: same ? k.sex : k.sex === "male" ? "female" : "male", birthYear: s.year - k.age - ctx.rng.int(5) + 2 });
      const lead = scene(ctx, [
        `${n} called: ${they(k)} and ${sp.call} are engaged! The wedding is next fall.`,
        `${n} and ${sp.call} came over for dinner, held hands under the table, and told you they're getting married.`,
        `${n} is marrying ${sp.call}, and the wedding plans have started arriving ${s.year >= 2000 ? "in your inbox" : "in the mail"}.`,
      ]);
      const done = (x, text, mood = 6) => (s2, c) => { spend(s2, x); const t = c.w(text); c.remember("a_kidWedding", t, { name: n }); return { text: t, mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you help?", "What's your part in it?"])}`,
        options: [
          { id: "a_kidWedding.pay", label: "Pay for the wedding", hint: "the old tradition", act: "care", style: "family", weight: 0.2, apply: done(0.25, `You paid for ${n} and ${sp.call}'s wedding. {You danced with ${n} and forgot every invoice.|It cost more than your first car, and you'd do it again.}`) },
          { id: "a_kidWedding.chip", label: "Write a generous check", hint: "help, not control", act: "donate", style: "safe", weight: 0.26, apply: done(0.1, `You gave ${n} and ${sp.call} a check toward the wedding and kept your opinions about the flowers to yourself. {Mostly.|Almost entirely.}`) },
          { id: "a_kidWedding.toast", label: "Give the toast of your life", hint: "practice in the mirror", act: "talk", style: "social", weight: 0.22, apply: done(0.03, `At ${n}'s wedding to ${sp.call} you gave a toast {about the time ${n} was five and wanted to marry the dog.|that made the whole room cry, including the caterers.}`) },
          { id: "a_kidWedding.backyard", label: "Offer the backyard", hint: "string lights and folding chairs", act: "hobby", style: "family", weight: 0.14, apply: done(0.05, `${n} and ${sp.call} got married in your backyard, under string lights, with folding chairs from the church. {It rained for ten minutes, and nobody minded.|You mowed the lawn four times that week.}`) },
          { id: "a_kidWedding.back", label: "Stay out of the planning", hint: "it's their day", act: "avoid", style: "self", weight: 0.18, apply: done(0.03, `You stayed out of ${n} and ${sp.call}'s wedding plans entirely, showed up, and {cried in the second row.|danced to every song.} ${n} said it was the nicest thing you did.`) },
        ],
      };
    },
  },

  // ---------- parenting on your own ----------
  {
    id: "a_singleParent", domain: "family", channel: "bad", tags: ["children"], ages: [24, 60], cooldown: 4, max: 2, when: s => home(s) && !s.partner && hasKid(0, 14)(s), p: () => 0.06,
    choice: (s, ctx) => {
      const kids = kidsCall(kidsAged(s, 0, 14));
      const lead = scene(ctx, [
        `Raising ${kids} on your own means work, dinner, homework, baths and bills, and then you lie awake.`,
        `You were late to pickup again, and ${kids} ${kidsAged(s, 0, 14).length > 1 ? "were" : "was"} the last one waiting with the teacher.`,
        `The washing machine broke, the car is making a noise, and ${kids} ${kidsAged(s, 0, 14).length > 1 ? "have" : "has"} a fever. It's a Tuesday.`,
      ]);
      const back = `Raising ${kids} on your own,`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you keep it together?", "What do you do?"])}`,
        options: [
          { id: "a_singleParent.family", label: `Lean on ${parentsAlive(s) ? parentsWord(s) : "family"}`, hint: "let them help", act: "seekHelp", style: "family", weight: 0.28, apply: (s2, c) => ({ text: c.w(`${back} you let ${parentsAlive(s2) ? parentsWord(s2) : "your family"} help: {Sunday dinners, school pickups on Wednesdays, a casserole when you needed it.|someone to call at 9 p.m. when you had nothing left.}`), mood: 2 }) },
          { id: "a_singleParent.parents", label: "Team up with other single parents", hint: "a carpool, a phone tree", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => { makeFriend(s2, c, "parent", 0.6); return { text: c.w(`${back} you teamed up with another single parent from school: {carpools, swapped Saturdays, and a lot of laughing in the kitchen.|you watched each other's kids and kept each other sane.}`), mood: 3 }; } },
          { id: "a_singleParent.overtime", label: "Pick up overtime", hint: "money first", act: "pushThrough", style: "risk", weight: 0.16, apply: (s2, c) => { stress(s2, 0.05); s2.savings += 0.05; return { text: c.w(`${back} you picked up overtime to stay ahead. {The bills got paid, and you missed a few things you wish you hadn't.|You fell asleep at the kitchen table more than once.}`), mood: -1 }; } },
          { id: "a_singleParent.mess", label: "Let the house be messy", hint: "good enough is good enough", act: "rest", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${back} you decided the house could be messy and dinner could be cereal sometimes. {Years later, the cereal dinners were remembered as a treat.|You read bedtime stories instead of doing dishes, and never regretted it.}`), mood: 2 }) },
          { id: "a_singleParent.sitter", label: "Find a sitter for one night a week", hint: "an evening for you", act: "hireCare", style: "health", weight: 0.16, apply: (s2, c) => { spend(s2, 0.02); return { text: c.w(`${back} you hired a sitter one night a week and {went to a movie alone.|took a class at the community college.|sat in a diner with a book.} You came home a better parent.`), mood: 3 }; } },
        ],
      };
    },
  },
  {
    // After a divorce with children: two houses, a schedule, and an ex.
    id: "a_coParent", domain: "family", channel: "change", tags: ["children"], ages: [24, 62], cooldown: 3, max: 3, when: s => home(s) && s.divorces > 0 && s.exes.length > 0 && hasKid(3, 16)(s), p: () => 0.07,
    choice: (s, ctx) => {
      const kids = kidsCall(kidsAged(s, 3, 16)), ex = s.exes[s.exes.length - 1], x = ex.call;
      const [lead, then] = scene(ctx, [
        [`${x} is late for the pickup again, and ${kids} ${kidsAged(s, 3, 16).length > 1 ? "are" : "is"} sitting on the steps with backpacks.`, `When ${x} kept being late for pickups,`],
        [`${x} has a new partner, and ${kids} met them last weekend.`, `When ${x}'s new partner came into the picture,`],
        [`${x} wants to switch holidays this year: ${x} gets Thanksgiving and Christmas, and you get New Year's.`, `When ${x} wanted to switch the holidays,`],
        [`${x} is thinking about moving two states away for a job.`, `When ${x} talked about moving away,`],
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you handle it?", "What do you do?"])}`,
        options: [
          { id: "a_coParent.flex", label: "Be flexible", hint: "for the kids", act: "reconcile", style: "family", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${then} you chose to be flexible, for ${kids}. {It was not always fair, and it was mostly peaceful.|${x} noticed, and started being flexible back.}`), mood: 1 }) },
          { id: "a_coParent.firm", label: "Stick to the schedule", hint: "the agreement is the agreement", act: "insist", style: "safe", weight: 0.22, apply: (s2, c) => ({ text: c.w(`${then} you held to the custody schedule, politely and exactly. {It felt cold, and it kept the peace.|${kids} liked knowing what came next.}`), mood: 0 }) },
          { id: "a_coParent.mediate", label: "See a mediator together", hint: "a neutral room", act: "counsel", style: "health", weight: 0.16, apply: (s2, c) => { spend(s2, 0.01); return { text: c.w(`${then} you and ${x} saw a mediator. {You left with a calendar you both could live with.|It was the first calm hour you had spent together in years.}`), mood: 1 }; } },
          { id: "a_coParent.kids", label: `Ask ${kids} what they want`, hint: "they have a say", act: "talk", style: "social", weight: 0.18, apply: (s2, c) => ({ text: c.w(`${then} you asked ${kids} what they wanted, and listened. {The answer surprised you, and it was right.|${kids} mostly wanted you two to stop fighting, so you tried.}`), mood: 1 }) },
          { id: "a_coParent.lawyer", label: "Call your lawyer", hint: "make it official", act: "dispute", style: "risk", weight: 0.14, apply: (s2, c) => { spend(s2, 0.04); return { text: c.w(`${then} you called your lawyer. {You won the point and lost a few months of peace.|It got settled in court, and nobody felt good about it.}`), mood: -2 }; } },
        ],
      };
    },
  },
  A("a_auntUncle", [28, 60], 0.03, (s, ctx) => {
    const sib = ctx.rng.pick(adultSibs(s)), role = s.sex === "female" ? "aunt" : "uncle";
    return [
      `You are officially the fun ${role}: {you taught ${sibName(sib)}'s kids to play poker.|you gave ${sibName(sib)}'s kids a drum set, and have not been forgiven.|${sibName(sib)}'s kids call you first when they need advice they can't ask their parents.}`,
      `You took ${sibName(sib)}'s kids for a whole weekend {to the beach|to the city|camping}, and returned them sugared up and happy. ${cap(sibName(sib))} said thank you through gritted teeth.`,
      `${cap(sibName(sib))}'s oldest called you, not their parents, {about a broken heart.|to ask about your job.|when they got their first paycheck.} You took that seriously.`,
    ];
  }, { domain: "family", channel: "good", tags: ["siblings"], cooldown: 4, max: 3, mood: 3, when: s => home(s) && kidsLive(s).length === 0 && adultSibs(s).length > 0 && s.age >= 30 }),

  // ---------- marriage and partnership ----------
  {
    id: "a_dateNight", domain: "love", channel: "good", tags: ["spouse"], about: "partner", ages: [26, 60], cooldown: 4, max: 3, when: s => home(s) && together(s) && hasKid(0, 12)(s), p: () => 0.05,
    choice: (s, ctx) => {
      const name = pn(s), littles = kidsAged(s, 0, 12), kids = kidsCall(littles);
      const lead = scene(ctx, [
        `You and ${name} realized the last time you went out, just the two of you, was ${ctx.rng.pick([`before ${littles.length > 1 ? "the kids were" : `${kids} was`} born`, "two summers ago", "a wedding, which doesn't count"])}.`,
        `${name} said, at the end of a long day, “We only talk about ${kids} and the schedule anymore.”`,
        `A friend offered to watch ${kids} on Saturday night, “no excuses.”`,
      ]);
      const back = `With ${kids} at home and no time for the two of you,`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you make time for each other?"])}`,
        options: [
          { id: "a_dateNight.standing", label: "A standing date night with a sitter", hint: "every other Friday", act: "socialize", style: "family", weight: 0.3, apply: (s2, c) => { guardUp(s2, 2); spend(s2, 0.02); return { text: c.w(`${back} you and ${name} started a standing date night every other Friday. {Half the time you just talked about the kids anyway, and it was still good.|You found a diner you both love and became regulars.}`), mood: 3 }; } },
          { id: "a_dateNight.home", label: "Date night at home after bedtime", hint: "takeout and no phones", act: "rest", style: "safe", weight: 0.26, apply: (s2, c) => { guardUp(s2, 1); return { text: c.w(`${back} you and ${name} started having date night at home after bedtime: {takeout on the living room floor and a movie neither of you finished.|a card game and a bottle of wine, phones in a drawer.}`), mood: 2 }; } },
          { id: "a_dateNight.away", label: "A weekend away", hint: "the grandparents can handle it", act: "travel", style: "risk", weight: 0.14, apply: (s2, c) => { guardUp(s2, 2); spend(s2, 0.04); return { text: c.w(`${back} you and ${name} left ${kids} with family and went away for a weekend {to a bed-and-breakfast with too many doilies.|to a cabin with no Wi-Fi.} You slept until nine and felt like newlyweds.`), mood: 4 }; } },
          { id: "a_dateNight.new", label: "Try something new together", hint: "a class, a hike, an adventure", act: "hobby", style: "learn", weight: 0.16, apply: (s2, c) => { guardUp(s2, 2); return { text: c.w(`${back} you and ${name} signed up for {a salsa class|a pottery class|a cooking class|${s2.year >= 2015 ? "an escape room" : "a bowling league"}} and were terrible at it together, which was the point.`), mood: 3 }; } },
          { id: "a_dateNight.later", label: "Too tired; maybe later", hint: "the couch is calling", act: "rest", style: "self", weight: 0.14, apply: (s2, c) => ({ text: c.w(`${back} you and ${name} agreed you were too tired for date night{, and fell asleep on the couch by nine.| and promised each other next month.}`), mood: 0 }) },
        ],
      };
    },
  },
  {
    // A rough patch that is not a crisis: two people who have become roommates. (core.js `crisis` is the big fight.)
    id: "a_roughPatch", domain: "love", channel: "bad", tags: ["spouse"], about: "partner", ages: [28, 62], cooldown: 6, max: 2, when: s => home(s) && married(s) && yearsWed(s) >= 4, p: () => 0.03,
    choice: (s, ctx) => {
      const name = pn(s), P = s.partner;
      const [lead, then] = scene(ctx, [
        [`You and ${name} haven't fought in months. You haven't really talked, either. You've become very polite roommates.`, `When you and ${name} had turned into polite roommates,`],
        [`${name} said, out of nowhere, “Are we okay?” and you didn't know what to say.`, `When ${name} asked if you two were okay,`],
        [`You realized you know more about your coworkers' weekends than about ${name}'s.`, `When you noticed how far apart you and ${name} had drifted,`],
        hasKid(0, 17)(s) ? [`Between the kids, work and ${s.home === "own" ? "the house" : "the bills"}, you and ${name} only talk in logistics.`, `When you and ${name} only talked in logistics,`] : null,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you find your way back?"])}`,
        options: [
          { id: "a_roughPatch.therapy", label: "Try couples therapy", hint: "a tune-up, not a last resort", act: "counsel", style: "health", weight: 0.22, apply: (s2, c) => { guardUp(s2, 3); spend(s2, 0.02); return { text: c.w(`${then} you suggested couples therapy. {The therapist had a box of tissues and a good sense of humor, and you both needed both.|It was awkward for three sessions and then, quietly, it worked.|You learned that ${name} had been lonely too.}`), mood: 1 }; } },
          { id: "a_roughPatch.walk", label: "Take a walk together every evening", hint: "side by side is easier", act: "talk", style: "social", weight: 0.24, apply: (s2, c) => { guardUp(s2, 2); fitter(s2); return { text: c.w(`${then} you started taking a walk with ${name} after dinner every evening. {Some nights you didn't say much. Some nights you said everything.|By fall you were holding hands again without noticing.}`), mood: 2 }; } },
          { id: "a_roughPatch.book", label: s.year >= 1992 ? "Read “The Five Love Languages” together" : "Read a marriage book together", hint: "homework for two", act: "study", style: "learn", weight: 0.12, apply: (s2, c) => { guardUp(s2, 1); return { text: c.w(`${then} you and ${name} read ${s2.year >= 1992 ? "“The Five Love Languages”" : "a marriage book from the library"} together. {It turned out ${name}'s was quality time and yours was being helped with the dishes.|You both rolled your eyes at it, and both did the exercises.}`), mood: 1 }; } },
          { id: "a_roughPatch.trip", label: "Go back to where you met", hint: "remember who you were", act: "travel", style: "family", weight: 0.14, apply: (s2, c) => { guardUp(s2, 2); spend(s2, 0.04); return { text: c.w(`${then} you took ${name} back to where you met {and found the old diner still open.|and sat on the same bench.} You laughed about who you used to be, and liked who you'd become.`), mood: 3 }; } },
          { id: "a_roughPatch.work", label: "Bury yourself in work", hint: "it'll pass", act: "pushThrough", style: "self", weight: 0.14, apply: (s2, c) => { crisisUp(s2, 2); stress(s2, 0.04); return { text: c.w(`${then} you buried yourself in work. {${cap(they(P))} noticed, and the silence got heavier.|The house got quieter, and the evenings got longer.}`), mood: -2 }; } },
          { id: "a_roughPatch.wait", label: "Wait it out", hint: "every marriage has seasons", act: "wait", style: "safe", weight: 0.14, apply: (s2, c) => { if (c.rng() < 0.5) { crisisUp(s2, 1); return { text: `${then} you decided to wait it out. The distance stayed, and neither of you knew how to cross it.`, mood: -2 }; } return { text: `${then} you decided every marriage has seasons, and waited. One morning ${name} made your coffee the way you like it without asking, and it was spring again.`, mood: 1 }; } },
        ],
      };
    },
  },
  {
    // Round-number anniversaries: tin (10), crystal (15), china (20), silver (25), pearl (30).
    id: "a_anniversary", domain: "love", channel: "good", tags: ["spouse"], about: "partner", ages: [28, 75], cooldown: 4, when: s => home(s) && married(s) && [10, 15, 20, 25, 30].includes(yearsWed(s)), p: () => 0.35,
    choice: (s, ctx) => {
      const name = pn(s), n = yearsWed(s), word = { 10: "tin", 15: "crystal", 20: "china", 25: "silver", 30: "pearl" }[n];
      const nth = { 10: "tenth", 15: "fifteenth", 20: "twentieth", 25: "twenty-fifth", 30: "thirtieth" }[n];
      const lead = scene(ctx, [
        `It's your ${nth} wedding anniversary${n === 25 ? ", the silver one" : ""}.`,
        `You and ${name} have been married ${words(n)} years this month. ${n === 25 ? "Twenty-five." : "Somehow."}`,
        `${cap(words(n))} years ago you married ${name}, and the ${word} anniversary is next week.`,
      ]);
      const done = (text, mood = 4, fx = null) => (s2, c) => { guardUp(s2, 1); if (fx) fx(s2, c); const t = c.w(text); c.remember("a_anniversary", t, { years: n }); return { text: t, mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you celebrate?", "What do you do?"])}`,
        options: [
          { id: "a_anniversary.trip", label: "A trip, just the two of you", hint: "somewhere new", act: "travel", style: "self", weight: 0.28, apply: done(`For your ${nth} anniversary you and ${name} went to {trip}. {You got lost, argued, found a tiny restaurant, and called it the best night of the trip.|You watched the sunset and didn't take a single photo.}`, 5, s2 => spend(s2, 0.06)) },
          { id: "a_anniversary.vows", label: n >= 20 ? "Renew your vows" : "Write each other letters", hint: "say it again", act: "talk", style: "family", weight: 0.16, apply: done(n >= 20 ? `For your ${nth} anniversary you and ${name} renewed your vows {in the backyard with the kids as witnesses.|at the same church, with fewer people and better shoes.} This time you knew exactly what you were promising.` : `For your ${nth} anniversary you and ${name} wrote each other letters and read them aloud. {You both cried at the same line.|${name}'s letter is in your nightstand.}`, 6) },
          { id: "a_anniversary.dinner", label: "Dinner where you had your first date", hint: "if it's still there", act: "socialize", style: "family", weight: 0.24, apply: done(`For your ${nth} anniversary you took ${name} to the place where you had your first date. {It was a nail salon now, so you got takeout and ate in the car, laughing.|The same waitress was still there and remembered you, or said she did.}`, 4) },
          { id: "a_anniversary.party", label: "Throw a party", hint: "everyone who was there", act: "socialize", style: "social", weight: 0.12, apply: done(`For your ${nth} anniversary you threw a party for everyone who had been at the wedding, {and played the same song for the first dance.|and somebody brought the old wedding album.}`, 5, s2 => spend(s2, 0.03)) },
          { id: "a_anniversary.forgot", label: "Wait, that's today?", hint: "oh no", act: "avoid", style: "risk", weight: 0.08, apply: (s2, c) => { const t = c.w(`You forgot your ${nth} anniversary until ${name} handed you a card at breakfast. {You went straight out and came back with flowers from the gas station.|You will be hearing about it at your ${n + 10}th.}`); return { text: t, mood: -1 }; } },
          { id: "a_anniversary.quiet", label: "A quiet night at home", hint: "the best kind", act: "rest", style: "safe", weight: 0.12, apply: done(`For your ${nth} anniversary you and ${name} stayed home, {ordered the same thing you always order, and looked through the wedding album.|danced in the kitchen to the radio.}`, 4) },
        ],
      };
    },
  },
  {
    // Who does what at home: the second shift (Hochschild, 1989), the mental load (2017).
    id: "a_chores", domain: "love", channel: "bad", tags: ["spouse"], about: "partner", once: true, ages: [26, 58], when: s => home(s) && together(s) && hasKid(0, 15)(s), p: () => 0.04,
    choice: (s, ctx) => {
      const name = pn(s);
      const [lead, then] = scene(ctx, [
        [`You did the math: you handle the dentist, the permission slips, the birthday presents, the dog's shots and dinner. ${name} takes out the trash.`, `When you realized how much of the house you carried,`],
        [`${name} said, “Just tell me what to do,” and you realized that is exactly the problem.`, `When ${name} asked to be told what to do,`],
        [`You came home to a sink full of dishes and ${name} asleep on the couch, and you stood there for a long moment.`, `The night of the sink full of dishes,`],
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you split the work?"])}`,
        options: [
          { id: "a_chores.chart", label: "Make a chore chart for the grown-ups", hint: "in writing, on the fridge", act: "negotiate", style: "safe", weight: 0.26, apply: (s2, c) => { guardUp(s2, 1); return { text: c.w(`${then} you made a chore chart for the adults and put it on the fridge. {${name} took it seriously, which surprised you both.|It lasted three months, and some of it stuck.}`), mood: 1 }; } },
          { id: "a_chores.talk", label: "Have the real conversation", hint: "about the invisible work", act: "talk", style: "social", weight: 0.26, apply: (s2, c) => { guardUp(s2, 2); return { text: c.w(`${then} you sat ${name} down and talked about the invisible work: {remembering, planning, worrying.|the list in your head that never stopped.} ${name} took over the school forms and the doctor, and kept them.`), mood: 2 }; } },
          { id: "a_chores.hire", label: "Hire a cleaner twice a month", hint: "buy back some peace", act: "hireCare", style: "self", weight: 0.16, apply: (s2, c) => { spend(s2, 0.04); return { text: `${then} you hired a cleaner twice a month. It was the best money you ever spent, and you stopped fighting about the bathroom.`, mood: 3 }; } },
          { id: "a_chores.swap", label: "Swap jobs for a month", hint: "walk in each other's shoes", act: "shareCare", style: "learn", weight: 0.14, apply: (s2, c) => { guardUp(s2, 1); return { text: c.w(`${then} you and ${name} swapped all the household jobs for a month. {${name} lasted nine days before apologizing.|You both learned the other's jobs were harder than they looked.}`), mood: 2 }; } },
          { id: "a_chores.blow", label: "Lose your temper", hint: "it's been building", act: "dispute", style: "risk", weight: 0.18, apply: (s2, c) => { crisisUp(s2, 1); return { text: c.w(`${then} you finally lost your temper, {and a dish towel was thrown.|and said things you had been saving for years.} The next week, things around the house were very different, and a little tense.`), mood: -2 }; } },
        ],
      };
    },
  },
  {
    id: "a_inLaws", domain: "family", channel: "bad", tags: ["spouse"], about: "partner", ages: [26, 62], cooldown: 5, max: 2, when: s => home(s) && married(s) && s.partner.age <= 62, p: () => 0.035,
    choice: (s, ctx) => {
      const name = pn(s), mil = ctx.rng() < 0.6 ? "mother-in-law" : "father-in-law";
      const [lead, then] = scene(ctx, [
        [`Your ${mil} is staying for two weeks, and on day three ${mil === "mother-in-law" ? "she" : "he"} reorganized your kitchen.`, `When your ${mil} reorganized your kitchen,`],
        [`Your ${mil} has opinions about ${s.kids.length ? "how you raise the kids" : "why you haven't had kids"}, and shares them at every meal.`, `When your ${mil} kept sharing opinions,`],
        [`${name}'s parents want to stay with you for the whole holiday season, again, in the guest room next to yours.`, `When your in-laws settled in for the holidays,`],
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you handle it?", "What do you do?"])}`,
        options: [
          { id: "a_inLaws.smile", label: "Smile and wait it out", hint: "it won't last forever", act: "avoid", style: "safe", weight: 0.26, apply: (s2, c) => ({ text: c.w(`${then} you smiled, kept the peace, and {counted the days on a calendar inside a cabinet.|vented to your best friend on the phone from the car.}`), mood: -1 }) },
          { id: "a_inLaws.partner", label: `Ask ${name} to handle their family`, hint: "their parent, their job", act: "talk", style: "social", weight: 0.26, apply: (s2, c) => { guardUp(s2, 1); return { text: c.w(`${then} you asked ${name} to talk to ${their(s2.partner)} ${mil === "mother-in-law" ? "mother" : "father"}, and ${they(s2.partner)} did, kindly and clearly. {You married the right person.|Things got easier after that.}`), mood: 2 }; } },
          { id: "a_inLaws.win", label: "Win them over", hint: "ask for the recipe", act: "socialize", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${then} you asked your ${mil} to teach you {the family stuffing recipe|how to fix the porch swing|to play cribbage}, and somewhere in there you became friends.`), mood: 3 }) },
          { id: "a_inLaws.rules", label: "Set a boundary, politely", hint: "your house, your rules", act: "insist", style: "self", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${then} you set a boundary, politely: {visits are a week, not two.|holidays alternate, every year, no exceptions.} It was uncomfortable for a month, and it held.`), mood: 1 }) },
          { id: "a_inLaws.hotel", label: "Book them a nice hotel nearby", hint: "close, but not that close", act: "negotiate", style: "risk", weight: 0.12, apply: (s2, c) => { spend(s2, 0.02); return { text: `${then} you booked them a lovely hotel ten minutes away, “for their comfort.” Everyone was happier, and nobody said why.`, mood: 2 }; } },
        ],
      };
    },
  },
  {
    // The partner's turn: a big offer, a dream, going back to school.
    id: "a_partnerDream", domain: "love", channel: "change", tags: ["spouse"], about: "partner", once: true, ages: [28, 58], when: s => home(s) && together(s), p: () => 0.025,
    choice: (s, ctx) => {
      const name = pn(s), P = s.partner;
      const [lead, what, joint] = scene(ctx, [
        [`${name} got an offer: a big promotion, but it means two years of weekly travel.`, "the promotion", `you took over the weeknights and met ${name} on the road one weekend a month`],
        [`${name} wants to go back to school for ${ctx.rng.pick(["nursing", "a master's degree", "law", "teaching"])}, nights and weekends, for three years.`, "going back to school", `you quizzed ${name} with flash cards at the kitchen table`],
        [`${name} wants to quit to ${ctx.rng.pick(["open a bakery", "start a landscaping business", "write a novel", "restore old furniture for a living"])}, and has a business plan in a folder.`, "the dream in the folder", "you became the unpaid assistant, accountant and cheerleader"],
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you say?", "How do you answer?"])}`,
        options: [
          { id: "a_partnerDream.yes", label: "“Go for it. I've got us.”", hint: "your turn will come", act: "care", style: "family", weight: 0.34, apply: (s2, c) => { guardUp(s2, 2); stress(s2, 0.03); return { text: c.w(`You told ${name} to go for ${what}, and you carried the house for a while. {${cap(they(P))} never forgot it.|It was hard, and you were proud of ${them(P)} every day.}`), mood: 3 }; } },
          { id: "a_partnerDream.plan", label: "Yes, with a plan and a budget", hint: "dreams need numbers", act: "negotiate", style: "safe", weight: 0.26, apply: (s2, c) => { guardUp(s2, 1); frugal(s2, 2); return { text: c.w(`You said yes to ${what}, with a budget, a timeline and a check-in every month. {The spreadsheet was romantic in its way.|It worked because you both knew the numbers.}`), mood: 2 }; } },
          { id: "a_partnerDream.later", label: "Ask to wait a year", hint: "the timing is hard", act: "wait", style: "safe", weight: 0.16, apply: (s2, c) => ({ text: c.w(`You asked ${name} to wait a year on ${what}. {${cap(they(P))} agreed, a little quietly.|${cap(they(P))} waited, and then did it, and you were glad you had both waited.}`), mood: 0 }) },
          { id: "a_partnerDream.no", label: "Say the family can't manage it now", hint: "honest, and hard to hear", act: "insist", style: "self", weight: 0.1, apply: (s2, c) => { crisisUp(s2, 1); return { text: `You told ${name} the family couldn't manage ${what} right now. It was honest, and it sat between you at dinner for a long time.`, mood: -2 }; } },
          { id: "a_partnerDream.both", label: "Make it a joint adventure", hint: "you're in it too", act: "pursue", style: "risk", weight: 0.14, apply: (s2, c) => { guardUp(s2, 2); spend(s2, 0.05); return { text: `You made ${what} a joint adventure: ${joint}. It brought you and ${name} closer than anything in years.`, mood: 3 }; } },
        ],
      };
    },
  },
  {
    // Temptation, and the line. Kept off the page; an affair raises the risk of core.js's crisis and divorce.
    id: "a_temptation", domain: "love", channel: "bad", tags: ["spouse"], about: "partner", once: true, ages: [28, 60], when: s => home(s) && married(s) && yearsWed(s) >= 3 && s.flags.affair === undefined, p: () => 0.012,
    choice: (s, ctx) => {
      const name = pn(s);
      const other = ctx.person({ role: "friend", sex: s.partner.sex, birthYear: s.birthYear + ctx.rng.int(9) - 4 });
      const [lead, then] = scene(ctx, [
        [`${other.call} from work has been lingering at your desk, and at the conference last week you two stayed at the hotel bar until it closed.`, `When ${other.call} from work started lingering at your desk,`],
        s.year >= 2008 ? [`An old flame, ${other.call}, found you on Facebook, and the messages have gotten longer and later.`, `When an old flame started messaging you late at night,`] : [`An old flame, ${other.call}, called out of the blue, and you've had lunch twice now without mentioning it at home.`, `When an old flame called out of the blue,`],
        [`${other.call}, ${s.kids.length ? "a parent from your kid's school" : "a regular at your gym"}, makes you laugh in a way that you notice.`, `When ${other.call} started making you laugh a little too much,`],
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "Where do you draw the line?"])}`,
        options: [
          { id: "a_temptation.stop", label: "Shut it down, kindly", hint: "and mean it", act: "avoid", style: "safe", weight: 0.4, apply: (s2, c) => { guardUp(s2, 1); return { text: c.w(`${then} you shut it down, kindly and completely. {You drove home the long way and were glad you had.|It was a little sad, and absolutely right.}`), mood: 0 }; } },
          { id: "a_temptation.tell", label: `Tell ${name} about it`, hint: "say it out loud", act: "talk", style: "family", weight: 0.2, apply: (s2, c) => { guardUp(s2, 2); return { text: c.w(`${then} you told ${name} about it, which was the hardest conversation of the year. {${name} was quiet, then grateful, then took your hand.|Saying it out loud took all the air out of it.}`), mood: 0 }; } },
          { id: "a_temptation.counsel", label: "Talk to a counselor", hint: "what is this really about?", act: "counsel", style: "health", weight: 0.14, apply: (s2, c) => { guardUp(s2, 1); spend(s2, 0.01); return { text: c.w(`${then} you talked to a counselor about it. {It turned out to be about being forty, more than about anyone in particular.|It was about feeling invisible at home, and you took that home to fix.}`), mood: 1 }; } },
          { id: "a_temptation.flirt", label: "Enjoy the attention, nothing more", hint: "a harmless spark?", act: "socialize", style: "risk", weight: 0.16, apply: (s2, c) => { crisisUp(s2, 1); return { text: c.w(`${then} you let yourself enjoy the attention, and told yourself it was harmless. {${name} noticed you checking your phone and smiling.|It never went anywhere, and it took up more room in your head than you'd like.}`), mood: 0 }; } },
          { id: "a_temptation.cross", label: "Cross the line", hint: "you know what this costs", act: "affair", style: "self", weight: 0.1, apply: (s2, c) => { crisisUp(s2, 4); s2.flags.affair = s2.age; return { text: c.w(`${then} you crossed a line you had promised not to cross. {For a few months you lived two lives, and slept badly in both.|You told yourself it was nobody's business, and you knew better.}`), mood: -5 }; } },
        ],
      };
    },
  },
  A("a_partnerHobby", [28, 65], 0.016, (s, ctx) => {
    const name = pn(s), P = s.partner, y = s.year;
    const hobby = ctx.rng.pick([y >= 2018 ? "pickleball" : "racquetball", "golf", y >= 2008 ? "CrossFit" : "jogging", "sourdough", "birdwatching", "model trains", y >= 2010 ? "a podcast nobody listens to" : "ham radio", "fantasy football"]);
    return [
      `${name} got really into ${hobby}. {There is equipment in every closet.|You now know far more about ${hobby} than you ever asked to.|You learned to nod at the right moments.}`,
      `${name} took up ${hobby} and talks about it at every dinner party. {You find it annoying and secretly adorable.|You joined ${them(P)} once, and were surprisingly good, and will never go again.}`,
      `${name}'s new ${hobby} obsession started as a phase and is now, apparently, a lifestyle. {You've made peace with it.|You bought ${them(P)} a book about it for ${their(P)} birthday, and ${they(P)} cried.}`,
    ];
  }, { tags: ["spouse"], cooldown: 6, max: 2, mood: 2, when: s => home(s) && together(s) }),
  A("a_longMarried", [35, 75], 0.018, (s, ctx) => {
    const name = pn(s), P = s.partner, n = yearsWed(s);
    return [
      `After ${words(n)} years, you and ${name} can have a whole argument with one look across a room, {and make up with another.|and you both know how it ends.}`,
      `${name} still {brings you coffee in bed on Sundays|leaves notes in your lunch|warms up your side of the car in winter}, ${words(n)} years in. You stopped taking it for granted a long time ago.`,
      `You caught ${name} singing in the kitchen, badly, to a song from the year you met. {You joined in. Badly.|You stood in the doorway and didn't say anything for a while.}`,
      `${name} finished your sentence at a dinner party, and the whole table laughed, and you realized that after ${words(n)} years ${they(P)} knows you better than you know yourself.`,
    ];
  }, { tags: ["spouse"], cooldown: 5, max: 3, mood: 3, when: s => home(s) && married(s) && yearsWed(s) >= 12 }),

  // ---------- after a marriage ends, and again ----------
  {
    // A remarriage and a blended family. The stepchild is a story person (s.flags.stepKid), not one of s.kids.
    id: "a_blended", domain: "family", channel: "change", tags: ["spouse", "children"], once: true, ages: [26, 62],
    when: s => home(s) && married(s) && s.marriages >= 2 && yearsWed(s) <= 2, p: s => (kidsAged(s, 2, 17).some(k => k.age > yearsWed(s)) ? 0.8 : 0.4),
    choice: (s, ctx) => {
      const name = pn(s), P = s.partner;
      const mine = kidsAged(s, 2, 17).filter(k => k.age > yearsWed(s));
      let step = null;
      if (!mine.length || ctx.rng() < 0.4) {
        const sx = ctx.rng() < 0.51 ? "male" : "female";
        const p0 = ctx.person({ role: "kid", sex: sx, birthYear: s.year - (4 + ctx.rng.int(11)) });
        step = { name: p0.name, call: p0.call, sex: sx, birthYear: p0.birthYear, marriage: s.marriages, bond: 0.4 };
      }
      const yours = mine.length ? kidsCall(mine) : null, theirs = step ? step.call : null;
      const all = [yours, theirs].filter(Boolean).join(" and ");
      const lead = scene(ctx, [
        step && yours ? `You and ${name} have blended two families: your ${mine.length > 1 ? "kids" : kidWord(mine[0])} ${yours} and ${name}'s ${step.sex === "male" ? "son" : "daughter"} ${theirs}, and two sets of rules.` : step ? `${name}'s ${step.sex === "male" ? "son" : "daughter"} ${theirs} is ${s.year - step.birthYear} and spends half of every week with you now.` : `${yours} ${mine.length > 1 ? "are" : "is"} getting used to ${name} living in the house, and nobody quite knows what to call ${them(P)}.`,
        `At dinner, ${step ? step.call : mine[0].call} said to ${step ? "you" : name}, “You're not my real ${step ? (s.sex === "female" ? "mom" : "dad") : P.sex === "female" ? "mom" : "dad"},” and the table went silent.`,
        `The first holiday as a blended family is coming, with two sets of traditions and ${all} watching to see whose win.`,
      ]);
      const finish = (text, mood, bond) => (s2, c) => { if (step) { step.bond = bond; s2.flags.stepKid = step; } return { text: c.w(text), mood }; };
      const blend = `Blending a family with ${name} and ${all},`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you make a family?", "What do you do?"])}`,
        options: [
          { id: "a_blended.slow", label: "Go slow; don't push", hint: "earn it", act: "wait", style: "safe", weight: 0.28, apply: finish(`${blend} you went slow. {You showed up for every game and never tried to be a replacement.|It took two years before ${theirs || yours} asked you for help with homework, and you nearly cried.}`, 2, 0.6) },
          { id: "a_blended.meetings", label: "Family meetings every Sunday", hint: "everyone gets a say", act: "talk", style: "social", weight: 0.22, apply: finish(`${blend} you started Sunday family meetings with snacks. {They were ridiculous and they worked.|Somebody always stormed out, and somebody always came back.}`, 2, 0.6) },
          { id: "a_blended.traditions", label: "Start new traditions together", hint: "something that's only yours", act: "socialize", style: "family", weight: 0.2, apply: finish(`${blend} you started something new that belonged to all of you: {pancakes shaped like states on Saturdays.|a camping trip every August.|a ridiculous holiday sweater contest.} It became the thing everyone looked forward to.`, 3, 0.7) },
          { id: "a_blended.therapist", label: "See a family therapist", hint: "a guide for new territory", act: "counsel", style: "health", weight: 0.14, apply: (s2, c) => { spend(s2, 0.02); return finish(`${blend} you found a family therapist who specialized in stepfamilies. {It helped everyone say the unsayable things in a safe room.|${theirs || yours} rolled their eyes for a month and then started talking.}`, 2, 0.65)(s2, c); } },
          { id: "a_blended.rules", label: "One house, one set of rules", hint: "consistency", act: "insist", style: "self", weight: 0.16, apply: finish(`${blend} you and ${name} insisted on one set of house rules for everyone. {There was a mutiny, and then a truce, and then, eventually, a family.|It was rough, and nobody could say it was unfair.}`, 0, 0.45) },
        ],
      };
    },
  },
  {
    // The stepchild growing up with you.
    id: "a_stepKid", domain: "family", channel: "change", tags: ["children"], ages: [27, 70], cooldown: 4, max: 2,
    when: s => home(s) && married(s) && !!s.flags.stepKid && s.flags.stepKid.marriage === s.marriages && s.year - s.flags.stepKid.birthYear >= 8 && s.year - s.flags.stepKid.birthYear <= 22, p: () => 0.08,
    choice: (s, ctx) => {
      const st = s.flags.stepKid, n = st.call, age = s.year - st.birthYear, he = st.sex === "female" ? "she" : "he", him = st.sex === "female" ? "her" : "him", his = st.sex === "female" ? "her" : "his";
      const [lead, then] = scene(ctx, [
        age >= 15 ? [`Your stepchild ${n} asked if you would teach ${him} to drive, “since you're less stressed than ${pn(s)}.”`, `When ${n} asked you to teach ${him} to drive,`] : [`Your stepchild ${n} has a school event and asked, shyly, if you would come.`, `When ${n} asked you to the school event,`],
        [`${n} had a bad day and slammed the door and yelled, “You can't tell me what to do!”`, `The day ${n} yelled that you couldn't tell ${him} what to do,`],
        [`${n}'s other parent missed ${his} birthday again, and ${he} is pretending not to care.`, `When ${n}'s other parent missed ${his} birthday,`],
      ]);
      const bond = (d, text, mood) => (s2, c) => { s2.flags.stepKid.bond = Math.max(0, Math.min(1, (s2.flags.stepKid.bond ?? 0.5) + d)); return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you show up?"])}`,
        options: [
          { id: "a_stepKid.show", label: "Show up, every time", hint: "consistency is love", act: "care", style: "family", weight: 0.34, apply: bond(0.15, `${then} you showed up, the way you always did. {Years later ${n} called you “my bonus ${s.sex === "female" ? "mom" : "dad"}” in a toast, and you had to sit down.|${cap(he)} didn't say anything, and ${he} sat next to you.}`, 3) },
          { id: "a_stepKid.space", label: "Give them space", hint: "not your fight to win", act: "wait", style: "safe", weight: 0.22, apply: bond(0.05, `${then} you gave ${him} space and let ${pn(s)} take the lead. {A week later ${n} knocked on your door with a question about homework.|It wasn't your moment, and you knew it.}`, 1) },
          { id: "a_stepKid.talk", label: "Talk one-on-one", hint: "just the two of you", act: "talk", style: "social", weight: 0.2, apply: bond(0.1, `${then} you took ${n} out for {burgers|a drive|ice cream} and said you weren't trying to replace anyone, you just wanted to be there. ${cap(he)} said, “Okay,” which meant a lot.`, 2) },
          { id: "a_stepKid.rules", label: "Hold the line on house rules", hint: "same for everyone", act: "insist", style: "self", weight: 0.14, apply: bond(-0.05, `${then} you held the line on the house rules, calmly. {${n} didn't speak to you for a week, and then asked you to pass the salt.|It was fair, and ${he} knew it was fair, and ${he} hated that.}`, 0) },
          { id: "a_stepKid.partner", label: `Let ${pn(s)} handle it`, hint: "their kid, their call", act: "shareCare", style: "safe", weight: 0.1, apply: bond(0, `${then} you stepped back and let ${pn(s)} handle it. ${n} noticed that, too, in ${his} way.`, 0) },
        ],
      };
    },
  },
  {
    // The year after a divorce.
    id: "a_afterDivorce", domain: "love", channel: "change", tags: ["spouse"], ages: [26, 65], cooldown: 8, max: 2, when: s => home(s) && s.rel === "divorced" && (s.last.divorce ?? -9) >= s.age - 1, p: () => 0.5,
    choice: (s, ctx) => {
      const x = s.exes.length ? s.exes[s.exes.length - 1].call : "your ex";
      const lead = scene(ctx, [
        `The divorce from ${x} is final. You are standing in ${s.home === "own" ? "a house" : "an apartment"} that is very quiet, with half the furniture.`,
        `It's been a few months since the divorce, and you still reach for your phone to tell ${x} things.`,
        `Your first ${ctx.rng.pick(["Thanksgiving", "birthday", "summer"])} after the divorce from ${x} is coming up.`,
      ]);
      const back = "After the divorce,";
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you start over?", "What helps?"])}`,
        options: [
          { id: "a_afterDivorce.therapy", label: "See a therapist", hint: "sort it out properly", act: "counsel", style: "health", weight: 0.22, apply: (s2, c) => { spend(s2, 0.02); return { text: c.w(`${back} you saw a therapist every week for a year. {You learned more about yourself than in the whole marriage.|By spring you could say ${x}'s name without your jaw tightening.}`), mood: 2 }; } },
          { id: "a_afterDivorce.friends", label: "Let your friends carry you", hint: "the couch, the wine, the stories", act: "socialize", style: "social", weight: 0.26, apply: (s2, c) => ({ text: c.w(`${back} your friends took turns {showing up with takeout and bad movies.|dragging you to trivia night.} You laughed for the first time in months, at something stupid, and it felt like air.`), mood: 3 }) },
          { id: "a_afterDivorce.gym", label: "Get in the best shape of your life", hint: "the revenge body", act: "exercise", style: "health", weight: 0.18, apply: (s2, c) => { fitter(s2); return { text: c.w(`${back} you {started running at dawn|joined a gym and actually went|took up cycling and bought the shorts}, and got stronger than you had been since you were twenty-five.`), mood: 3 }; } },
          { id: "a_afterDivorce.travel", label: "Take a trip on your own", hint: "a table for one", act: "travel", style: "self", weight: 0.14, apply: (s2, c) => { spend(s2, 0.05); return { text: c.w(`${back} you took a trip to {trip} by yourself, ate at a table for one, and found out you are pretty good company.`), mood: 4 }; } },
          { id: "a_afterDivorce.dating", label: s.year >= 2012 ? "Download the dating apps" : s.year >= 1996 ? "Try online dating" : "Let friends set you up", hint: "get back out there", act: "pursue", style: "risk", weight: 0.12, apply: (s2, c) => ({ text: c.w(`${back} you ${s2.year >= 2012 ? "downloaded the dating apps" : s2.year >= 1996 ? "made a profile on a dating site" : "let your friends set you up"} and went on {a string of first dates, one of them memorably terrible.|three dates with three people who all talked about their exes.} It was a start.`), mood: 1 }) },
          { id: "a_afterDivorce.work", label: "Throw yourself into work", hint: "something to hold on to", act: "pushThrough", style: "safe", weight: 0.08, apply: (s2, c) => { stress(s2, 0.04); return { text: `${back} you threw yourself into work. It held you up when nothing else did, and one day you noticed you were okay.`, mood: 0 }; } },
        ],
      };
    },
  },
  {
    // The first year or two after losing a spouse (core.js `widowed`).
    id: "a_widowed", domain: "family", channel: "change", tags: ["spouse"], once: true, ages: [28, 70], when: s => home(s) && s.rel === "widowed" && (s.last.widowed ?? -9) >= s.age - 2 && (s.last.widowed ?? -9) < s.age, p: () => 0.6,
    choice: (s, ctx) => {
      const ex = s.exes.length ? s.exes[s.exes.length - 1] : null, name = ex ? ex.call : "your spouse";
      const lead = scene(ctx, [
        `It's been months since ${name} died. People have stopped bringing casseroles, and the quiet is the hardest part.`,
        `You found ${name}'s handwriting on a grocery list in a coat pocket and sat down on the floor of the closet.`,
        hasKid(5, 17)(s) ? `The kids are grieving ${name} in their own ways, and you're trying to hold everyone up, including yourself.` : `The first anniversary of ${name}'s death is coming, and you don't know what to do with the day.`,
      ]);
      const back = `In the year after ${name} died,`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What helps?", "How do you go on?"])}`,
        options: [
          { id: "a_widowed.group", label: "Join a grief group", hint: "people who understand", act: "seekHelp", style: "social", weight: 0.24, apply: (s2, c) => ({ text: c.w(`${back} you joined a grief group that met in a church basement on Tuesdays. {Nobody said “at least.” Everyone understood.|You made a friend there you still have.}`), mood: 1 }) },
          { id: "a_widowed.faith", label: "Lean on your faith", hint: "or find one", act: "spiritual", style: "safe", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${back} you {went back to services and sat in the same pew you two used to share.|found comfort in prayer, and in the people who prayed with you.}`), mood: 1 }) },
          { id: "a_widowed.family", label: "Let your family close", hint: "you don't have to do this alone", act: "talk", style: "family", weight: 0.24, apply: (s2, c) => ({ text: c.w(`${back} you let your family close: {Sunday dinners, a sister who called every night, the kids sleeping in your room for a while.|you said yes every time someone asked to help.}`), mood: 2 }) },
          { id: "a_widowed.trip", label: "Take the trip you planned together", hint: "for both of you", act: "travel", style: "self", weight: 0.12, apply: (s2, c) => { spend(s2, 0.05); return { text: c.w(`${back} you took the trip you and ${name} had always planned, to {trip}. {You talked to ${name} the whole way, out loud, and it felt right.|You left a small photo of ${name} somewhere beautiful.}`), mood: 2 }; } },
          { id: "a_widowed.help", label: "Help someone else", hint: "give the love somewhere", act: "volunteer", style: "social", weight: 0.12, apply: (s2, c) => ({ text: c.w(`${back} you started volunteering at {a hospice|the food bank|an after-school program}. It gave your days a shape, and somewhere to put the love.`), mood: 2 }) },
          { id: "a_widowed.still", label: "Sit with it", hint: "grief takes its time", act: "rest", style: "health", weight: 0.12, apply: (s2, c) => ({ text: c.w(`${back} you let yourself grieve slowly, without a plan. {You slept in ${name}'s sweater some nights.|One morning you laughed at something on the radio and didn't feel guilty.}`), mood: 0 }) },
        ],
      };
    },
  },
  A("a_backOut", [32, 62], 0.05, (s, ctx) => {
    const via = s.year < 1995 ? "a personal ad in the weekly paper" : s.year < 2012 ? "a dating website" : "an app";
    return [
      `You went on your first date in years, through ${via}. {Your date brought their mother.|It was nice and went nowhere, and you were proud of yourself for going.|You talked for four hours and never saw each other again.}`,
      `A friend set you up with someone ${s.age >= 45 ? "else who was starting over" : "from their office"}. {You both admitted, over dessert, how nervous you were, and it was the best part of the night.|There was no spark, and there was a very good pie.}`,
      `You tried ${via} for a month and got {a lot of messages that just said “hey.”|one wonderful conversation about dogs.|a date who looked nothing like the photo but was lovely anyway.} The world of dating had changed, and so had you.`,
    ];
  }, { domain: "love", channel: "change", once: true, mood: 1, when: s => home(s) && (s.rel === "divorced" || s.rel === "widowed") && !s.partner && Math.max(s.last.divorce ?? -9, s.last.widowed ?? -9) <= s.age - 1 }),

  // ---------- aging parents ----------
  {
    // The sandwich years: kids at home and a parent who needs you (core.js `parentCare` is the big decision about care).
    id: "a_sandwich", domain: "family", channel: "bad", tags: ["father", "mother", "children"], ages: [32, 62], cooldown: 5, max: 2, when: s => home(s) && hasKid(0, 17)(s) && parentsAlive(s) && oldestParentAge(s) >= 70, p: () => 0.05,
    choice: (s, ctx) => {
      const who = aParent(s, ctx), kids = kidsCall(atHomeKids(s)), sibs = adultSibs(s), two = together(s);
      const lead = scene(ctx, [
        `This week: ${who}'s cardiology appointment Tuesday, ${kids}'s ${ctx.rng.pick(["band concert", "soccer game", "science fair", "dentist"])} Thursday, and a deadline at work Friday.`,
        `${who} called three times today about the remote control, and ${kids} need${atHomeKids(s).length > 1 ? "" : "s"} a ride in ten minutes.`,
        `You're driving between ${who}'s place and the school so often the car knows the way by itself.`,
      ]);
      const back = `Caught between ${who} and ${kids},`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you keep it all going?", "What gives?"])}`,
        options: [
          { id: "a_sandwich.siblings", label: sibs.length ? `Make a schedule with ${sibName(sibs[0])}` : "Ask the cousins to pitch in", hint: "a shared calendar", act: "shareCare", style: "social", weight: 0.24, apply: (s2, c) => ({ text: c.w(`${back} you set up a shared calendar with ${sibs.length ? sibName(sibs[0]) : "the cousins"}. {It was not perfectly fair, and it was so much better.|The group text became the family's whole life for a while.}`), mood: 1 }) },
          { id: "a_sandwich.kids", label: `Bring ${kids} along`, hint: "grandparent time", act: "care", style: "family", weight: 0.22, apply: (s2, c) => ({ text: c.w(`${back} you started bringing ${kids} along to ${who}'s. {${who} taught them card games, and they taught ${who} the phone.|The visits got loud and much happier.}`), mood: 3 }) },
          { id: "a_sandwich.partner", label: two ? `Ask ${pn(s)} to take over the kids' schedule` : "Ask a neighbor for help with the kids", hint: "hand something off", act: "talk", style: "safe", weight: 0.18, apply: (s2, c) => { if (two) guardUp(s2, 1); return { text: two ? `${back} you asked ${pn(s2)} to take over the kids' schedule for a while, and ${they(s2.partner)} did, without a single complaint you heard.` : `${back} you asked for help, and a neighbor started taking ${kids} to school with hers and wouldn't hear of thanks.`, mood: 2 }; } },
          { id: "a_sandwich.leave", label: s.year >= 1993 ? "Take family leave for a few weeks" : "Take unpaid time off", hint: "work can wait", act: "care", style: "family", weight: 0.12, when: working, apply: (s2, c) => { s2.savings = Math.max(0, s2.savings - 0.04); return { text: `${back} you took ${s2.year >= 1993 ? "a few weeks of family leave" : "a few weeks of unpaid time off"} to get ${who} settled. It cost something, and you were glad every day.`, mood: 1 }; } },
          { id: "a_sandwich.aide", label: "Hire help a few days a week", hint: "an aide, a driver", act: "hireCare", style: "safe", weight: 0.12, apply: (s2, c) => { spend(s2, 0.08); return { text: c.w(`${back} you hired someone to help ${who} a few days a week. {${who} grumbled and then adored her.|It cost a lot, and it gave you your evenings back.}`), mood: 1 }; } },
          { id: "a_sandwich.push", label: "Just push through", hint: "you can sleep later", act: "pushThrough", style: "risk", weight: 0.12, apply: (s2, c) => { stress(s2, 0.06); riskier(s2); return { text: c.w(`${back} you just pushed through, {sleeping five hours a night and living on drive-through coffee.|keeping a spreadsheet of everybody's needs but your own.} It worked until you caught every cold of the winter.`), mood: -3 }; } },
        ],
      };
    },
  },
  {
    // Parents leaving the family home: retiring to Florida or Arizona, downsizing to a condo, or moving near the kids.
    id: "a_parentsMove", domain: "family", channel: "change", tags: ["father", "mother"], once: true, ages: [30, 62], when: s => home(s) && parentsAlive(s) && oldestParentAge(s) >= 62 && oldestParentAge(s) <= 82, p: () => 0.04,
    choice: (s, ctx) => {
      const p = parentsWord(s), pl = p === "your parents", isAre = pl ? "are" : "is";
      const th = pl ? "they" : p === "Mom" ? "she" : "he", tm = pl ? "them" : p === "Mom" ? "her" : "him", tr = pl ? "their" : p === "Mom" ? "her" : "his";
      const where = ctx.rng.pick(inStates(s, ["FL", "AZ"]) ? ["a condo across town", "a retirement community", "a smaller place near you"] : ["Florida", "Arizona", "a condo across town", "a retirement community", "a smaller place near you"]);
      const lead = `${cap(p)} ${isAre} selling the house you grew up in and moving to ${where}.`;
      const back = `When ${p} sold the house you grew up in,`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you help?"])}`,
        options: [
          { id: "a_parentsMove.pack", label: `Help ${tm} pack`, hint: "fifty years in boxes", act: "care", style: "family", weight: 0.34, apply: (s2, c) => ({ text: c.w(`${back} you spent three weekends helping pack {forty years of National Geographic,|a basement of Christmas decorations,} and on the last day you walked through every empty room, touching the doorframe where your heights were marked.`), mood: -1 }) },
          { id: "a_parentsMove.keep", label: "Rescue your childhood things", hint: "the trophies, the yearbooks", act: "hobby", style: "self", weight: 0.18, apply: (s2, c) => ({ text: c.w(`${back} you rescued {a box of your old report cards and a trophy for “most improved.”|your Little League glove and a mixtape with your handwriting.|the yearbooks, the diary, and a very bad poem.} Your own kids found it all hilarious.`), mood: 2 }) },
          { id: "a_parentsMove.near", label: `Ask ${tm} to move near you instead`, hint: "close enough for Sunday dinner", act: "talk", style: "family", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${back} you asked ${tm} to move near you instead, and {${th} did, ten minutes away, and Sunday dinner became a standing thing.|${th} thought about it and chose ${where} anyway, and you visited every winter.}`), mood: 2 }) },
          { id: "a_parentsMove.argue", label: `Try to talk ${tm} out of it`, hint: "it's home", act: "insist", style: "risk", weight: 0.12, apply: (s2, c) => ({ text: `${back} you tried to talk ${tm} out of it, and ${th} reminded you, gently, that it was ${tr} house and ${tr} life. ${cap(th)} ${pl ? "were" : "was"} right.`, mood: -1 }) },
          { id: "a_parentsMove.visit", label: `Go help ${tm} settle in`, hint: "set up the new place", act: "travel", style: "social", weight: 0.2, apply: (s2, c) => { spend(s2, 0.02); return { text: c.w(`${back} you went to help ${tm} settle into ${where}: {you hung pictures, programmed the TV, and met every neighbor.|you put together a bed frame and watched ${tm} make a new life with alarming speed.}`), mood: 2 }; } },
        ],
      };
    },
  },
  A("a_parentTech", [30, 65], 0.022, (s, ctx) => {
    const who = aParent(s, ctx), y = s.year;
    const thing = y < 1996 ? "the VCR, which had been blinking 12:00 for three years" : y < 2004 ? "email, and the difference between “reply” and “reply all”" : y < 2010 ? "a cell phone, and how to text" : y < 2020 ? "FaceTime, mostly a view of the ceiling fan" : "Zoom, and where the mute button is";
    return [
      `You taught ${who} ${thing}. {${who} called you two days later to ask again.|${who} took notes on an index card and taped it to the table.|${who} then taught it to the neighbors, badly, with total confidence.}`,
      `${who} called with a tech emergency: ${thing}. You explained it over the phone {for forty-five minutes.|three times, slower each time.} You were patient, because ${who} once taught you to tie your shoes.`,
      y >= 2008 ? `${who} discovered ${y >= 2012 ? "Facebook" : "the internet"} and now {comments “Love, ${who}” on every photo you post.|forwards you every warning about microwaves.|sends you a joke every morning at 6 a.m.}` : `${who} got ${y < 1990 ? "a microwave" : "a cordless phone"} and called you about it like it was the moon landing.`,
    ];
  }, { domain: "family", channel: "good", tags: ["father", "mother"], cooldown: 6, max: 2, mood: 2, when: s => home(s) && parentsAlive(s) && oldestParentAge(s) >= 60 && s.year >= 1984 }),
  {
    // A widowed parent falls in love again.
    id: "a_parentDating", domain: "family", channel: "change", tags: ["father", "mother"], once: true, ages: [28, 68],
    when: s => home(s) && s.father.alive !== s.mother.alive && Math.max(s.last.fatherDeath ?? -9, s.last.motherDeath ?? -9) <= s.age - 1 && Math.max(s.last.fatherDeath ?? -99, s.last.motherDeath ?? -99) >= 0 && oldestParentAge(s) <= 88, p: () => 0.05,
    choice: (s, ctx) => {
      const who = s.father.alive ? "Dad" : "Mom", pr = who === "Dad" ? "he" : "she", pos = who === "Dad" ? "his" : "her", obj = who === "Dad" ? "him" : "her";
      const nw = ctx.person({ role: "friend", sex: who === "Dad" ? "female" : "male", birthYear: s.birthYear - 25 - ctx.rng.int(10) });
      const lead = scene(ctx, [
        `${who} has a “friend” named ${nw.call} from the senior center, and ${pr} giggled on the phone.`,
        `${who} told you, a little nervously, that ${pr} has been seeing someone: ${nw.call}, from church.`,
        `You stopped by and found ${who} dressed up for a date with ${nw.call}, wearing ${who === "Dad" ? "cologne" : "perfume"} you've never smelled before.`,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you feel about it?", "What do you say?"])}`,
        options: [
          { id: "a_parentDating.happy", label: "Be happy for them", hint: "they deserve it", act: "talk", style: "family", weight: 0.36, apply: (s2, c) => ({ text: c.w(`When ${who} started seeing ${nw.call}, you said you were happy for ${obj}, and meant it. {${who} looked ten years younger by summer.|You hadn't heard ${obj} laugh like that in years.}`), mood: 3 }) },
          { id: "a_parentDating.dinner", label: "Invite them both to dinner", hint: "meet this person", act: "socialize", style: "social", weight: 0.24, apply: (s2, c) => ({ text: c.w(`When ${who} started seeing ${nw.call}, you had them both to dinner. ${nw.call} {brought a pie and asked about your work and you liked ${them(nw)} immediately.|told a story about ${who} you had never heard.}`), mood: 3 }) },
          { id: "a_parentDating.wary", label: "Ask some careful questions", hint: "protect them", act: "insist", style: "safe", weight: 0.14, apply: (s2, c) => ({ text: `When ${who} started seeing ${nw.call}, you asked some careful questions about money and family. ${who} said, “I'm old, not foolish,” and you backed off.`, mood: 0 }) },
          { id: "a_parentDating.time", label: "Admit it's hard", hint: "you miss the other one", act: "wait", style: "self", weight: 0.14, apply: (s2, c) => ({ text: `When ${who} started seeing ${nw.call}, you admitted it was hard; you missed your ${who === "Dad" ? "mother" : "father"}. ${who} hugged you and said, “So do I. Every day.”`, mood: -1 }) },
          { id: "a_parentDating.wedding", label: "Help plan the wedding", hint: "they're serious", act: "care", style: "family", weight: 0.12, apply: (s2, c) => ({ text: c.w(`${who} and ${nw.call} got married at the courthouse, and you were the witness. {You gave a toast at the diner afterward.|${who} cried more than at ${pos} first wedding, ${pr} said.}`), mood: 5 }) },
        ],
      };
    },
  },
  {
    // The golden anniversary: fifty years married.
    id: "a_parents50th", domain: "family", channel: "good", tags: ["father", "mother"], once: true, ages: [32, 62], when: s => home(s) && s.father.alive && s.mother.alive && !s.flags.parentsSplit && Math.min(s.father.age, s.mother.age) >= 70, p: () => 0.12,
    choice: (s, ctx) => {
      const sibs = adultSibs(s);
      const lead = scene(ctx, [
        "Your parents' fiftieth wedding anniversary is in June.",
        `Fifty years ago this summer, your parents got married ${ctx.rng.pick(["in a church hall with a sheet cake", "at the courthouse on a lunch break", "in your grandmother's backyard"])}.`,
        `Mom mentioned, casually, three times, that their fiftieth anniversary is coming up.`,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you celebrate?", "What do you plan?"])}`,
        options: [
          { id: "a_parents50th.party", label: "Throw a big party", hint: "everyone, and a DJ", act: "socialize", style: "social", weight: 0.3, apply: (s2, c) => { spend(s2, 0.04); return { text: c.w("For your parents' fiftieth, you threw a party at the {VFW hall|church fellowship hall|best restaurant in town}, and {they danced to their wedding song while eighty people cheered.|Dad gave a speech nobody knew he had in him.}"), mood: 5 }; } },
          { id: "a_parents50th.trip", label: "Send them on a trip", hint: "the honeymoon they never had", act: "donate", style: "family", weight: 0.2, apply: (s2, c) => { spend(s2, 0.05); return { text: c.w("For their fiftieth, you sent your parents on the trip they never took, to {trip}. {They called every night to describe dinner.|They came back with matching sun hats and a lot of photos of each other.}"), mood: 5 }; } },
          { id: "a_parents50th.slides", label: "Make a slideshow of their life", hint: "fifty years of photos", act: "hobby", style: "learn", weight: 0.18, apply: (s2, c) => ({ text: c.w(`For their fiftieth, you made a slideshow of your parents' life ${s2.year < 2000 ? "with a carousel projector" : "on the TV"}: {the wedding, the first house, you as a baby with bad hair.|five decades of haircuts.} Mom cried; Dad pretended he had something in his eye.`), mood: 5 }) },
          { id: "a_parents50th.share", label: sibs.length ? `Plan it with ${sibName(sibs[0])}` : "Plan it with the cousins", hint: "a team effort", act: "shareCare", style: "family", weight: 0.16, apply: (s2, c) => ({ text: c.w(`You planned your parents' fiftieth with ${sibs.length ? sibName(sibs[0]) : "the cousins"}: {a surprise dinner, which Mom figured out in about a day.|a backyard barbecue where all the grandkids performed a skit.}`), mood: 4 }) },
          { id: "a_parents50th.simple", label: "A quiet family dinner", hint: "what they'd want", act: "rest", style: "safe", weight: 0.16, apply: (s2, c) => ({ text: c.w("For their fiftieth, you had a quiet family dinner at home. {Dad told the story of how they met, and Mom corrected every detail.|They held hands under the table the whole time.}"), mood: 4 }) },
        ],
      };
    },
  },
  A("a_firstHoliday", [25, 75], 0.3, (s, ctx) => {
    const dad = (s.last.fatherDeath ?? -9) >= (s.last.motherDeath ?? -9), who = dad ? "Dad" : "Mom", pos = dad ? "his" : "her", hol = ctx.rng.pick(["Thanksgiving", holidayOf(s, ctx)]);
    const task = { Thanksgiving: "carve the turkey", Christmas: "carve the ham", Hanukkah: "light the menorah", Eid: "lead the morning prayer", Diwali: "light the first lamp" }[hol];
    return [
      `The first ${hol} without ${who}, somebody had to ${task}, and nobody wanted to sit in ${pos} chair. {In the end you set ${pos} place anyway.|You told stories about ${who} until midnight, and laughed more than you expected.}`,
      `On the first ${hol} after ${who} died, you made ${pos} ${dad ? "chili" : "stuffing"} from the recipe in ${pos} handwriting. {It wasn't quite right, and everyone had seconds.|It tasted exactly right, and you had to step outside for a minute.}`,
      `The first ${hol} without ${who} was quieter. {You went for a walk after dinner, the route ${who} always took.|${cap(pos)} favorite song came on the radio while you were doing the dishes, and you let it play.}`,
    ];
  }, { domain: "family", channel: "bad", tags: ["father", "mother"], once: true, mood: -3, when: s => home(s) && Math.max(s.last.fatherDeath ?? -9, s.last.motherDeath ?? -9) >= s.age - 1 }),
  A("a_parentThings", [25, 75], 0.16, (s, ctx) => {
    const dad = (s.last.fatherDeath ?? -9) >= (s.last.motherDeath ?? -9), who = dad ? "your father" : "your mother", pos = dad ? "his" : "her";
    return [
      `Going through ${who}'s things, you found {a shoebox of every card you ever made ${dad ? "him" : "her"}|${pos} high school diploma, folded into a book|a savings passbook with your name on it, opened the year you were born}. You sat on the floor with it for an hour.`,
      `In ${who}'s desk you found {a letter ${dad ? "he" : "she"} wrote to you and never sent.|a list, in ${pos} handwriting, of things ${dad ? "he" : "she"} was proud of; you were on it, three times.|${pos} reading glasses, folded on a crossword ${dad ? "he" : "she"} never finished.}`,
      `You kept one thing of ${who}'s: {${pos} watch, which still runs.|a coffee mug with a chip in it.|${pos} old flannel shirt, which you wear when it's cold.} You use it every day.`,
    ];
  }, { domain: "family", channel: "bad", tags: ["father", "mother"], once: true, mood: -2, when: s => home(s) && Math.max(s.last.fatherDeath ?? -9, s.last.motherDeath ?? -9) >= s.age - 1 }),

  // ---------- siblings, holidays, the extended family ----------
  {
    // Thanksgiving with the whole family, and the one relative.
    id: "a_thanksgiving", domain: "family", channel: "change", tags: ["siblings"], ages: [28, 62], cooldown: 4, max: 3, when: home, p: () => 0.03,
    choice: (s, ctx) => {
      const y = s.year, uncle = ctx.rng.pick(["Uncle Rick", "Uncle Dale", "Uncle Gary", "Aunt Linda", "your cousin's husband"]);
      const [lead, then] = scene(ctx, [
        [`At Thanksgiving dinner, ${uncle} brought up politics before the rolls were passed.`, `When ${uncle} brought up politics at Thanksgiving,`],
        [`At Thanksgiving, ${uncle} has been explaining ${y >= 2017 ? "cryptocurrency" : y >= 1998 ? "the stock market" : "a new diet"} to the whole table for forty minutes.`, `When ${uncle} wouldn't stop explaining things at Thanksgiving,`],
        [`Thanksgiving is the same every year: the same fight about ${ctx.rng.pick(["the stuffing", "the football game", "who brings what", "where everyone sits"])}, and it has started again.`, "When the same old Thanksgiving fight started up,"],
        ["Two of your relatives have not spoken since last Thanksgiving, and they are now seated across from each other.", "With two relatives glaring across the Thanksgiving table,"],
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you save Thanksgiving?"])}`,
        options: [
          { id: "a_thanksgiving.pie", label: "Change the subject to pie", hint: "a diplomat with a whisk", act: "avoid", style: "social", weight: 0.28, apply: (s2, c) => ({ text: c.w(`${then} you {loudly asked who wanted pumpkin or pecan.|announced it was time for pie, and the whole table gratefully agreed.} Dessert saved the holiday, as it usually does.`), mood: 2 }) },
          { id: "a_thanksgiving.football", label: "Get everyone outside for touch football", hint: "fresh air, fewer words", act: "exercise", style: "health", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${then} you got everyone out in the yard for touch football. {${cap(uncle)} pulled a hamstring and peace was restored.|The kids won, and nobody remembered what the argument was about.}`), mood: 3 }) },
          { id: "a_thanksgiving.argue", label: "Say what you think", hint: "you're not twelve anymore", act: "dispute", style: "risk", weight: 0.14, apply: (s2, c) => ({ text: c.w(`${then} you said what you thought, clearly. {There was a long silence, and then someone passed the gravy.|${cap(uncle)} called you the next week to keep arguing, which was nearly affectionate.}`), mood: -1 }) },
          { id: "a_thanksgiving.kids", label: "Escape to the kids' table", hint: "the fun end", act: "socialize", style: "family", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${then} you picked up your plate and moved to the kids' table, where {there was a fierce game of Uno.|they were building a fort out of dinner rolls.} It was the best seat in the house.`), mood: 3 }) },
          { id: "a_thanksgiving.dishes", label: "Volunteer to do all the dishes", hint: "the kitchen is quiet", act: "care", style: "self", weight: 0.12, apply: (s2, c) => ({ text: c.w(`${then} you volunteered to do every dish, and spent a peaceful hour at the sink {with the radio on.|with your favorite cousin drying.}`), mood: 2 }) },
          { id: "a_thanksgiving.nap", label: "Eat, watch football, nap", hint: "the true tradition", act: "rest", style: "safe", weight: 0.14, apply: (s2, c) => ({ text: c.w(`${then} you ate too much, watched ${y >= 1966 ? "the Cowboys game" : "the Lions game"}, and fell asleep on the couch with your mouth open. {Someone took a photo.|It was perfect.}`), mood: 2 }) },
        ],
      };
    },
  },
  {
    // The family reunion: matching T-shirts, a church picnic shelter; DNA kits from about 2012.
    id: "a_reunion", domain: "family", channel: "good", tags: ["siblings"], ages: [30, 62], cooldown: 8, max: 2, when: home, p: () => 0.018,
    choice: (s, ctx) => {
      const side = ctx.rng.pick(["your mom's side", "your dad's side", "the whole clan"]);
      const lead = scene(ctx, [
        `The family reunion for ${side} is in July, at a picnic shelter in a state park, with matching T-shirts.`,
        `A cousin you haven't seen since you were twelve ${s.year >= 2008 ? "made a Facebook group" : "mailed out flyers"} for a family reunion on ${side}.`,
        `${cap(side)} is having its first reunion in twenty years, and your great-aunt wants everyone there “while she still can.”`,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["Do you go?", "What do you do?"])}`,
        options: [
          { id: "a_reunion.go", label: "Go, and bring the potato salad", hint: "it's family", act: "socialize", style: "family", weight: 0.36, apply: (s2, c) => ({ text: c.w(`You went to the reunion for ${side}, {won the three-legged race with a second cousin you'd just met,|ate four kinds of potato salad,} and came home with a sunburn and forty new relatives.`), mood: 4 }) },
          { id: "a_reunion.organize", label: "Volunteer to organize the next one", hint: "somebody has to", act: "volunteer", style: "social", weight: 0.14, apply: (s2, c) => ({ text: c.w(`You went to the reunion for ${side} and somehow volunteered to organize the next one. {You now have a binder.|You spent two years tracking down cousins in four states.}`), mood: 3 }) },
          { id: "a_reunion.tree", label: s.year >= 2012 ? "Take a DNA test and build the family tree" : "Research the family tree", hint: "where you come from", act: "study", style: "learn", weight: 0.18, apply: (s2, c) => ({ text: s2.year >= 2012 ? c.w(`Before the reunion, you took a DNA test and built the family tree. {It turned out you are three percent something nobody expected.|You found a cousin in another state who looked exactly like your grandmother.}`) : c.w(`Before the reunion, you researched the family tree {at the county courthouse and in old church records.|on microfilm at the library, squinting for weeks.} You brought a chart, and the old folks corrected it happily.`), mood: 3 }) },
          { id: "a_reunion.skip", label: "Skip it", hint: "too far, too many people", act: "avoid", style: "self", weight: 0.18, apply: (s2, c) => ({ text: c.w(`You skipped the reunion for ${side}. {Somebody mailed you a T-shirt anyway.|You saw the photos later and felt a little left out.}`), mood: 0 }) },
          { id: "a_reunion.elders", label: "Go to record the old stories", hint: "before they're gone", act: "talk", style: "family", weight: 0.14, apply: (s2, c) => ({ text: c.w(`At the reunion for ${side}, you sat with the oldest relatives and recorded their stories on ${s2.year < 2008 ? "a cassette recorder" : "your phone"}. {Years later, those recordings were the most precious thing the family had.|Your great-aunt told a story about your grandfather that nobody had ever heard.}`), mood: 4 }) },
        ],
      };
    },
  },
  {
    // The first time you host the big family holiday.
    id: "a_hostHoliday", domain: "family", channel: "good", once: true, ages: [28, 55], when: s => home(s) && (s.home === "own" || married(s)) && !s.flags.hostedHoliday, p: () => 0.04,
    choice: (s, ctx) => {
      const hol = ctx.rng.pick(["Thanksgiving", holidayOf(s, ctx)]), n = 10 + ctx.rng.int(12);
      const lead = scene(ctx, [
        `For the first time, the family is coming to your place for ${hol}: ${words(n)} people, including ${parentsAlive(s) ? parentsWord(s) : "the aunts"}.`,
        `${parentsAlive(s) ? cap(parentsWord(s)) : "The aunts"} officially handed you ${hol} this year, along with a recipe card and a look.`,
      ]);
      const set = (text, mood = 3, x = 0.02) => (s2, c) => { s2.flags.hostedHoliday = s2.age; spend(s2, x); return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you pull it off?", "What's the plan?"])}`,
        options: [
          { id: "a_hostHoliday.scratch", label: "Make everything from scratch", hint: "the whole production", act: "pushThrough", style: "family", weight: 0.26, apply: set(`You hosted ${hol} for the first time and made everything from scratch. {You were up at five and asleep by eight, and it was glorious.|The gravy had lumps, and nobody cared.}`, 4, 0.03) },
          { id: "a_hostHoliday.potluck", label: "Make it a potluck", hint: "everyone brings a dish", act: "shareCare", style: "social", weight: 0.28, apply: set(`You hosted ${hol} for the first time as a potluck. {You ended up with three green bean casseroles and no rolls.|Everybody brought their best dish, and it was the best meal in years.}`) },
          { id: "a_hostHoliday.order", label: "Order the whole meal", hint: "no shame", act: "hireCare", style: "self", weight: 0.14, apply: set(`You hosted ${hol} for the first time and ordered the whole meal from {the grocery store|a restaurant}, then hid the containers. Your ${parentsAlive(s) ? (s.mother.alive ? "mother" : "father") : "aunt"} asked for the recipe.`, 3, 0.04) },
          { id: "a_hostHoliday.new", label: "Add your own tradition", hint: "your house, your twist", act: "hobby", style: "learn", weight: 0.16, apply: set(`You hosted ${hol} for the first time and added your own tradition: {a walk after dinner for everyone|a gratitude jar|a game of touch football in the yard}. It stuck.`) },
          { id: "a_hostHoliday.small", label: "Keep it small this year", hint: "just the closest people", act: "rest", style: "safe", weight: 0.16, apply: set(`You hosted a small ${hol} this year, just the closest family, {and it was cozy and calm and perfect.|and you actually got to sit down and eat.}`, 2, 0.01) },
        ],
      };
    },
  },
  {
    id: "a_sibLoan", domain: "family", channel: "bad", tags: ["siblings"], about: "siblings", once: true, ages: [28, 65], when: s => home(s) && adultSibs(s).length > 0 && s.savings >= 0.3, p: () => 0.02,
    choice: (s, ctx) => {
      const sib = ctx.rng.pick(adultSibs(s)), x = sibName(sib), [now, why] = ctx.rng.pick([["lost a job", "lost a job"], ["has a stack of medical bills", "had a stack of medical bills"], ["is behind on the rent", "was behind on the rent"], ["wants to start a business", "wanted to start a business"]]);
      const amt = usd(ctx, s, 0.12);
      return {
        prompt: `${cap(x)} ${now} and asked to borrow ${amt}. ${ctx.rng.pick(["What do you say?", "Do you lend it?"])}`,
        options: [
          { id: "a_sibLoan.lend", label: "Lend it", hint: "family helps family", act: "lend", style: "family", weight: 0.34, apply: (s2, c) => { spend(s2, 0.2); s2.flags.lent = { to: "sibling", at: s2.age }; if (c.rng() < 0.55) { s2.savings += 0.18; return { text: c.w(`When ${x} ${why}, you lent ${amt}. {${cap(x)} paid it back, every dollar, over two years, with a thank-you card.|It came back slowly, in odd amounts, and in full.}`), mood: 2 }; } return { text: `When ${x} ${why}, you lent ${amt}. You never saw it again, and you decided, eventually, that it had been a gift.`, mood: -2 }; } },
          { id: "a_sibLoan.give", label: "Give it, no strings", hint: "a loan can ruin things", act: "donate", style: "social", weight: 0.16, apply: (s2, c) => { spend(s2, 0.2); return { text: `When ${x} ${why}, you gave ${amt} as a gift, not a loan, so it could never come between you.`, mood: 2 }; } },
          { id: "a_sibLoan.part", label: "Lend part of it", hint: "what you can spare", act: "negotiate", style: "safe", weight: 0.2, apply: (s2, c) => { spend(s2, 0.08); return { text: `When ${x} ${why}, you lent what you could spare, about a third of it, and said so honestly. ${cap(x)} understood.`, mood: 1 }; } },
          { id: "a_sibLoan.help", label: "Help another way", hint: "a job lead, a budget, your couch", act: "seekHelp", style: "learn", weight: 0.16, apply: (s2, c) => ({ text: c.w(`When ${x} ${why}, you helped another way: {sat down together and made a budget|called everyone you knew about work|offered your spare room for a few months}. It helped more than money would have.`), mood: 1 }) },
          { id: "a_sibLoan.no", label: "Say no", hint: "it's happened before", act: "insist", style: "self", weight: 0.14, apply: (s2, c) => ({ text: c.w(`When ${x} ${why}, you said no. {It had happened before, and you couldn't again.|${cap(x)} was hurt, and things were cool between you until the holidays.}`), mood: -2 }) },
        ],
      };
    },
  },
  A("a_sibTime", [28, 65], 0.018, (s, ctx) => {
    const sib = ctx.rng.pick(adultSibs(s)), x = sibName(sib);
    return [
      `You and ${x} took a trip together, just the two of you, {to the town where you grew up.|to a ballgame two states away.|to the beach you went to as kids.} You talked about your parents for hours, and about yourselves for the first time in years.`,
      `${cap(x)} called on your birthday and sang, badly, the song your mother used to sing. {You laughed until you cried.|You saved the voicemail.}`,
      `You and ${x} started ${s.year >= 2010 ? "a group text" : "a standing Sunday phone call"} that turned into {the best part of your week.|a running argument about whose memory was right.}`,
    ];
  }, { domain: "family", channel: "good", tags: ["siblings"], about: "siblings", cooldown: 6, max: 2, mood: 3, when: s => home(s) && adultSibs(s).length > 0 }),
  {
    // Making peace after a falling-out (core.js `inheritance` can leave s.flags.estranged).
    id: "a_estranged", domain: "family", channel: "change", tags: ["siblings"], about: "siblings", once: true, ages: [28, 75], when: s => !!s.flags.estranged && bornSibs(s, 18).length > 0, p: () => 0.06,
    choice: (s, ctx) => {
      const sib = ctx.rng.pick(bornSibs(s, 18)), x = sibName(sib);
      const lead = scene(ctx, [
        `It's been years since you and ${x} really spoke. You heard ${x} ${ctx.rng.pick(["became a grandparent", "had surgery", "moved house"])}, from a cousin.`,
        `You found an old photo of you and ${x} as kids, arms around each other, missing teeth.`,
        `A wedding invitation came, and ${x} will be there.`,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["Do you reach out?", "What do you do?"])}`,
        options: [
          { id: "a_estranged.call", label: "Call", hint: "just pick up the phone", act: "reconcile", style: "family", weight: 0.3, apply: (s2, c) => { if (c.roll("family", "good", 0.65)) { s2.flags.estranged = false; return { text: c.w(`You called ${x}. {There was a long silence, and then ${x} said your old nickname.|You both apologized at the same time and then laughed.} It wasn't fixed, but it had started.`), mood: 5, big: true }; } return { text: `You called ${x}, and it went to voicemail. You left a message, and you are still waiting, and you are glad you called.`, mood: 0 }; } },
          { id: "a_estranged.letter", label: "Write a letter", hint: "say it carefully", act: "talk", style: "safe", weight: 0.22, apply: (s2, c) => { if (c.rng() < 0.6) { s2.flags.estranged = false; return { text: `You wrote ${x} a long letter, by hand. A month later a reply came, shorter, but it ended with “love.”`, mood: 4, big: true }; } return { text: `You wrote ${x} a long letter, by hand. No reply has come yet, and you said what you needed to say.`, mood: 0 }; } },
          { id: "a_estranged.wedding", label: "Talk at the next family event", hint: "neutral ground", act: "socialize", style: "social", weight: 0.18, apply: (s2, c) => { if (c.rng() < 0.5) { s2.flags.estranged = false; return { text: `At the next family wedding you walked over to ${x} with two drinks. You talked for an hour by the coat rack, and it was a beginning.`, mood: 4 }; } return { text: `At the next family wedding you and ${x} nodded at each other across the room. It was something.`, mood: 0 }; } },
          { id: "a_estranged.wait", label: "Wait for them to come to you", hint: "you were the one wronged", act: "wait", style: "self", weight: 0.18, apply: () => ({ text: `You decided to wait for ${x} to reach out first. The silence went on another year.`, mood: -1 }) },
          { id: "a_estranged.let", label: "Let it be", hint: "some things stay broken", act: "cutOff", style: "self", weight: 0.12, apply: () => ({ text: `You decided to let it be with ${x}. You still think of ${/Sister/.test(sib.relation || "") ? "her" : "him"} on birthdays.`, mood: -2 }) },
        ],
      };
    },
  },

  // ---------- home and the neighbors ----------
  {
    // Homeowners' associations: rare before 1970, about a quarter of Americans live under one by the 2020s.
    id: "a_hoa", domain: "move", channel: "bad", tags: ["home"], ages: [28, 75], cooldown: 8, max: 2, when: s => home(s) && s.home === "own" && s.year >= 1975, p: s => (inStates(s, ["FL", "TX", "AZ", "CA", "NV", "CO", "NC", "GA"]) ? 0.03 : 0.014),
    choice: (s, ctx) => {
      const [what, was] = ctx.rng.pick([["your grass is a quarter inch too long", "your grass was a quarter inch too long"], ["your mailbox is an unapproved shade of blue", "your mailbox was an unapproved shade of blue"], ["your holiday lights are still up in February", "your holiday lights were still up in February"], ["the boat in your driveway violates section 4.2(b)", "the boat in your driveway violated section 4.2(b)"], ["your garbage cans are visible from the street", "your garbage cans were visible from the street"]]);
      const lead = `A letter from the homeowners' association says ${what}. There is a fine.`;
      const back = `When the HOA wrote that ${was},`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you respond?"])}`,
        options: [
          { id: "a_hoa.comply", label: "Fix it and move on", hint: "pick your battles", act: "wait", style: "safe", weight: 0.32, apply: (s2, c) => ({ text: c.w(`${back} you fixed it and paid the fine{, muttering.| without a word, and thought about it for weeks.}`), mood: -1 }) },
          { id: "a_hoa.meeting", label: "Fight it at the meeting", hint: "bring a folder", act: "dispute", style: "risk", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${back} you went to the HOA meeting with a folder of {photos of four other houses doing the same thing.|bylaws, highlighted.} {You won, and became a neighborhood folk hero.|You lost, but the rule got changed the next year.}`), mood: 2 }) },
          { id: "a_hoa.board", label: "Run for the HOA board", hint: "change it from inside", act: "volunteer", style: "social", weight: 0.14, apply: (s2, c) => ({ text: c.w(`${back} you ran for the HOA board, and won, {and spent three years arguing about mulch.|and discovered that everyone writes to the board about everything.} The fines got friendlier.`), mood: 1 }) },
          { id: "a_hoa.charm", label: "Bring the board president cookies", hint: "kill them with kindness", act: "negotiate", style: "family", weight: 0.16, apply: (s2, c) => ({ text: `${back} you brought the HOA president a plate of cookies and a sincere apology. The fine disappeared, and you got invited to the Fourth of July party.`, mood: 2 }) },
          { id: "a_hoa.ignore", label: "Ignore it", hint: "what are they going to do?", act: "avoid", style: "self", weight: 0.18, apply: (s2, c) => { spend(s2, 0.01); return { text: c.w(`${back} you ignored it. {The fines piled up until you paid them, grumbling.|They sent a second letter, in red.}`), mood: -2 }; } },
        ],
      };
    },
  },
  {
    id: "a_neighbor", domain: "move", channel: "change", ages: [28, 75], cooldown: 8, max: 2, when: home, p: () => 0.018,
    choice: (s, ctx) => {
      const nb = ctx.person({ role: "friend", sex: ctx.rng() < 0.5 ? "male" : "female", birthYear: s.birthYear + ctx.rng.int(30) - 15 });
      const [lead, then] = scene(ctx, [
        s.home === "own" ? [`Your neighbor ${nb.call}'s oak tree keeps dropping branches on your roof, and ${they(nb)} says it's your problem.`, `When ${nb.call}'s tree kept dropping branches on your roof,`] : [`Your upstairs neighbor ${nb.call} plays the drums at 11 p.m.`, `When ${nb.call} upstairs kept drumming at night,`],
        [`${nb.call} next door runs a leaf blower every Saturday at seven in the morning.`, `When ${nb.call} started leaf-blowing at 7 a.m. Saturdays,`],
        [`${nb.call}'s dog next door barks from the minute ${they(nb)} leaves for work until ${they(nb)} gets home.`, `When ${nb.call}'s dog kept barking all day,`],
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you handle it?"])}`,
        options: [
          { id: "a_neighbor.talk", label: "Knock on their door", hint: "neighbor to neighbor", act: "talk", style: "social", weight: 0.3, apply: (s2, c) => { s2.friends.push(nb); return { text: c.w(`${then} you knocked on ${nb.call}'s door. {You talked for an hour, and now you water each other's plants.|It turned out ${they(nb)} had no idea, and fixed it the same week.}`), mood: 3 }; } },
          { id: "a_neighbor.food", label: "Bring something over", hint: "banana bread works", act: "socialize", style: "family", weight: 0.24, apply: (s2, c) => ({ text: c.w(`${then} you brought ${nb.call} {a loaf of banana bread|a casserole|a six-pack and a smile}. {It started a friendship that lasted as long as you lived on that street.|${nb.call} brought the dish back full, which is how you know.}`), mood: 3 }) },
          { id: "a_neighbor.deal", label: "Work out a deal", hint: "split the cost, set some hours", act: "negotiate", style: "safe", weight: 0.18, apply: (s2, c) => { spend(s2, 0.01); return { text: `${then} you and ${nb.call} worked out a deal and shook on it over the fence. It held, mostly.`, mood: 1 }; } },
          { id: "a_neighbor.city", label: s.home === "own" ? "Call the city" : "Complain to the landlord", hint: "make it official", act: "dispute", style: "risk", weight: 0.12, apply: (s2, c) => ({ text: `${then} you made it official. The problem got solved, and ${nb.call} stopped waving at you.`, mood: -1 }) },
          { id: "a_neighbor.let", label: "Live with it", hint: "nobody's perfect", act: "avoid", style: "self", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${then} you decided to live with it. {You bought earplugs.|You figured you were probably somebody's annoying neighbor too.}`), mood: 0 }) },
        ],
      };
    },
  },
  A("a_neighborly", [28, 75], 0.02, (s, ctx) => {
    const nb = ctx.person({ role: "friend", sex: ctx.rng() < 0.5 ? "male" : "female", birthYear: s.birthYear - 25 - ctx.rng.int(10) }), n = nb.call;
    return [
      `${n} across the street is in ${their(nb)} eighties and lives alone. When you hadn't seen the lights on for two days you knocked, and found ${them(nb)} fine but out of groceries. After that you {shopped for ${them(nb)} every Saturday.|stopped by every Sunday with the newspaper.}`,
      "A new family moved in next door, and you brought over {a pie|a plate of cookies|a six-pack and the name of a good plumber}. {Their kids and yours were inseparable by summer.|They became the friends you call when the power goes out.}",
      snowy(s) ? `In a snowstorm, ${n} next door {shoveled your whole driveway before you woke up.|jumped your car without being asked.} You returned the favor with a pie and a long talk over the fence.` : `After a big storm, ${n} next door {cleared the branches off your driveway before you woke up.|jumped your car without being asked.} You returned the favor with a pie and a long talk over the fence.`,
    ];
  }, { domain: "move", channel: "good", once: true, mood: 3, when: home }),
  {
    // A remodel, in the taste of its decade: avocado and harvest gold, oak and brass, granite and stainless, open concept.
    id: "a_remodel", domain: "wealth", channel: "change", tags: ["home"], ages: [30, 68], cooldown: 8, max: 2, when: s => home(s) && s.home === "own", p: () => 0.03,
    choice: (s, ctx) => {
      const y = s.year, room = ctx.rng.pick(["kitchen", "kitchen", "bathroom", "basement"]), e = y < 1980 ? 0 : y < 1995 ? 1 : y < 2010 ? 2 : 3;
      const style = {
        kitchen: ["harvest gold appliances and avocado countertops", "oak cabinets and brass fixtures", "granite countertops and stainless steel", "an open concept, white cabinets and a farmhouse sink"],
        bathroom: ["an avocado-green tub and a shag bath mat", "brass fixtures and a big garden tub", "a tiled walk-in shower and double sinks", "subway tile and a rain shower"],
        basement: ["wood paneling and a wet bar", "a rec room with a big-screen TV", "a home theater with a popcorn machine", "a guest suite and a home gym"],
      }[room][e];
      const lead = scene(ctx, [
        `The ${room} hasn't been touched since ${y < 1990 ? "the Eisenhower years" : y < 2010 ? "the 1970s" : "the 1990s"}, and you have been dreaming of ${style}.`,
        `You've been watching ${y >= 2006 ? "HGTV" : y >= 1979 ? "This Old House" : "home shows"} for months, and now you want to redo the ${room}.`,
        `The ${room} ${room === "basement" ? "flooded" : "sink cracked"}, and it seems like the moment to redo the whole thing.`,
      ]);
      const back = `When you remodeled the ${room},`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you do it?", "What's the plan?"])}`,
        options: [
          { id: "a_remodel.pro", label: "Hire a contractor and go all in", hint: "it's done right", act: "hireCare", style: "risk", weight: 0.24, apply: (s2, c) => { spend(s2, 0.25); if (c.rng() < 0.3) return { text: c.w(`${back} you hired a contractor who {disappeared for three weeks in the middle.|went over budget and over schedule.} It ended beautifully, two months late, and you ${room === "kitchen" ? "washed dishes in the bathtub" : room === "bathroom" ? "showered at the gym" : "lived around the sawdust"} for most of the spring.`), mood: 0 }; return { text: `${back} you hired a contractor and went all in: ${style}. You stood in it the first morning with coffee and felt like someone in a magazine.`, mood: 4 }; } },
          { id: "a_remodel.diy", label: "Do it yourself, weekends", hint: "sweat equity", act: "hobby", style: "learn", weight: 0.24, apply: (s2, c) => { spend(s2, 0.08); fitter(s2); return { text: c.w(`${back} you did it yourself, every weekend for a year. {You learned to tile, swear and apologize, in that order.|One wall is slightly crooked, and you love it.}`), mood: 3 }; } },
          { id: "a_remodel.loan", label: y >= 1987 ? "Take out a home equity loan" : "Take out a home improvement loan", hint: "the house pays for itself", act: "borrow", style: "risk", weight: 0.14, apply: (s2, c) => { owe(s2, 0.2); return { text: `${back} you took out ${y >= 1987 ? "a home equity loan" : "a home improvement loan"} to pay for ${style}. It was gorgeous, and you'd be paying for it for a while.`, mood: 3 }; } },
          { id: "a_remodel.paint", label: "Paint, new handles, done", hint: "the budget remodel", act: "save", style: "safe", weight: 0.24, apply: (s2, c) => { spend(s2, 0.02); return { text: c.w(`${back} you did the budget version: {new paint, new cabinet handles and a better light fixture.|paint, a new faucet and a rug.} It looked twice as good for a tenth of the price.`), mood: 2 }; } },
          { id: "a_remodel.wait", label: "Save up first", hint: "next year, for real", act: "wait", style: "safe", weight: 0.14, apply: (s2, c) => { frugal(s2, 1); return { text: `You decided to save up before remodeling the ${room}. The magazine clippings stayed on the fridge another year.`, mood: 0 }; } },
        ],
      };
    },
  },
  {
    // The school district question, and the move to the suburbs.
    id: "a_schoolDistrict", domain: "move", channel: "change", tags: ["children"], once: true, ages: [28, 50], when: s => home(s) && hasKid(3, 10)(s), p: () => 0.03,
    choice: (s, ctx) => {
      const k = kidIn(s, ctx, 3, 10), n = k.call, y = s.year;
      const lead = scene(ctx, [
        `${n} is starting school soon, and the parents at the playground all talk about the school district across town.`,
        `${n}'s school ${y >= 2002 ? "got low test scores again" : "lost its art and music programs"}, and you're wondering about your options.`,
        `Your friends just moved to the suburbs for the schools, and they keep sending you real estate listings.`,
      ]);
      const back = `When you thought about ${n}'s schooling,`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "What's best for the kids?"])}`,
        options: [
          { id: "a_schoolDistrict.move", label: "Move to the suburbs for the schools", hint: "a longer commute", act: "moveHome", style: "family", weight: 0.24, apply: (s2, c) => { spend(s2, 0.1); stress(s2, 0.02); return { text: c.w(`${back} you moved across town to the suburbs, into ${s2.home === "own" ? "a house" : "a rental"} in the good district. {The commute got longer, and the backyard got bigger.|${n} made a best friend on the new street the first week.}`), mood: 2 }; } },
          { id: "a_schoolDistrict.stay", label: "Stay and get involved", hint: "make the school better", act: "volunteer", style: "social", weight: 0.28, apply: (s2, c) => ({ text: c.w(`${back} you stayed and got involved: {the PTA, a school garden and a lot of meetings.|you volunteered in ${n}'s classroom every Friday.} The school got a little better, and so did the neighborhood.`), mood: 2 }) },
          { id: "a_schoolDistrict.private", label: y < 1990 ? "Send them to the Catholic school" : "Pay for a private school", hint: "tuition, uniforms", act: "study", style: "safe", weight: 0.16, apply: (s2, c) => { spend(s2, 0.12); return { text: c.w(`${back} you paid for ${y < 1990 ? "the parish school, uniforms and all" : "a private school"}. {It meant no vacations for a while.|${n} hated the uniform and loved the teachers.}`), mood: 1 }; } },
          { id: "a_schoolDistrict.lottery", label: y >= 1995 ? "Enter the charter and magnet lotteries" : "Apply to the magnet school", hint: "a lottery for a seat", act: "lottery", style: "risk", weight: 0.14, apply: (s2, c) => (c.rng() < 0.4 ? { text: `${back} you entered the school lottery and won a seat for ${n}. You cried in the school office, a little.`, mood: 4 } : { text: `${back} you entered the school lottery and didn't get a seat. ${n} went to the neighborhood school and did just fine.`, mood: 0 }) },
          { id: "a_schoolDistrict.home", label: "Homeschool for a while", hint: "you'll be the teacher", act: "care", style: "self", weight: 0.08, apply: (s2, c) => { stress(s2, 0.03); return { text: c.w(`${back} you homeschooled ${n} for a couple of years. {The kitchen table became a science lab.|You learned more history than you ever did in school.}`), mood: 1 }; } },
          { id: "a_schoolDistrict.fine", label: "The neighborhood school is fine", hint: "you went to one", act: "wait", style: "safe", weight: 0.1, apply: (s2, c) => ({ text: `${back} you decided the neighborhood school was fine. ${n} walked there with the kids from the street, and you never regretted it.`, mood: 1 }) },
        ],
      };
    },
  },
  A("a_lawn", [30, 75], 0.014, (s, ctx) => [
    "You became a lawn person. {You know the names of the grasses.|You edge the sidewalk with a precision that worries your family.|You have strong feelings about the neighbor's dandelions.}",
    `You spent a whole weekend ${snowy(s) ? "putting up the storm windows and raking leaves" : "fighting the crabgrass"}, {then sat on the porch with a cold drink and surveyed your kingdom.|and the kids jumped in the leaf pile before you could bag it.}`,
    "You bought a riding mower {and drove it like a race car.|and the neighbor's kid asked for a turn.} The grass has never looked better.",
  ], { domain: "move", channel: "good", tags: ["home"], cooldown: 5, max: 2, mood: 2, when: s => home(s) && s.home === "own" }),
  A("a_blockParty", [28, 75], 0.012, (s, ctx) => [
    `Your street had a block party: {sawhorses at both ends, three grills going and kids on bikes everywhere.|a potluck on folding tables and a water balloon fight.} You met neighbors you'd waved at for years.`,
    `For the Fourth of July the whole street {set off fireworks in the cul-de-sac|had a parade of kids on decorated bikes|grilled together}, and you {stayed out until the fireflies came.|ended up in charge of the hot dogs.}`,
    "The neighborhood started a monthly potluck, and {it became the best night of the month.|you met a couple who became your closest friends.}",
  ], { domain: "family", channel: "good", cooldown: 6, max: 2, mood: 3, when: home }),
  A("a_garageSale", [28, 75], 0.012, (s, ctx) => {
    const where = s.year < 2000 ? "a garage sale with hand-lettered signs" : s.year < 2016 ? "Craigslist" : "Facebook Marketplace";
    return [
      `You cleaned out the garage and sold everything through ${where}. {You made two hundred dollars and spent it at someone else's yard sale.|A stranger haggled for twenty minutes over a lamp worth a dollar.}`,
      `You sold ${s.kids.length ? "the old crib, the baby swing and a box of toys" : "the treadmill you used as a coat rack"} through ${where}, {and felt lighter.|and immediately missed one thing.}`,
      `You decluttered the house and gave away {four bags of clothes,|a bread maker used once,} and {found a twenty-dollar bill in an old coat.|discovered you owned seven spatulas.}`,
    ];
  }, { domain: "wealth", channel: "good", cooldown: 6, max: 2, mood: 2, when: home, effect: s => { s.savings += 0.01; } }),

  // ---------- midlife ----------
  {
    // The midlife reckoning, around 40–52.
    id: "a_midlife", domain: "health", channel: "change", once: true, ages: [39, 54], when: home, p: () => 0.05,
    choice: (s, ctx) => {
      const [lead, then] = scene(ctx, [
        [`You turned ${s.age} and caught yourself in a store window: when did you get to be ${s.age}?`, `At ${s.age}, looking at yourself in a store window,`],
        [`A college friend ${ctx.rng.pick(["ran a marathon", "bought a sailboat", "quit to open a brewery", "learned to fly a plane"])}, and you've been thinking about it for a month.`, "Inspired by an old friend's reinvention,"],
        [`You realized you've done the same commute, the same ${working(s) ? "job" : "week"} and the same Saturday for ${yearsWord(Math.min(12, 5 + ctx.rng.int(8)))}.`, "Tired of every week looking the same,"],
      ]);
      const set = (key, text, mood = 3, fx = null) => (s2, c) => { s2.flags.midlife = key; if (fx) fx(s2, c); return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do about it?", "What's the midlife plan?"])}`,
        options: [
          { id: "a_midlife.marathon", label: "Train for a marathon", hint: "26.2 miles", act: "exercise", style: "health", weight: 0.22, apply: set("marathon", `${then} you signed up for a marathon and started training {at 5 a.m. in the dark.|with a group that met at a bagel shop.} Your knees filed a complaint.`, 3, s2 => { s2.flags.marathonAt = s2.age; fitter(s2); }) },
          { id: "a_midlife.bike", label: "Buy a motorcycle", hint: "the open road", act: "vice", style: "risk", weight: 0.14, apply: set("motorcycle", `${then} you bought a motorcycle, {a used Harley with a lot of chrome.|a sensible bike you rode in a very unsensible jacket.} ${together(s) ? `${pn(s)} rolled ${their(s.partner)} eyes and then asked for a ride.` : "You rode it to work on sunny days and grinned the whole way."}`, 4, s2 => { spend(s2, 0.1); riskier(s2); }) },
          { id: "a_midlife.band", label: "Pick up the guitar again", hint: "start a band in the garage", act: "hobby", style: "learn", weight: 0.2, apply: set("band", `${then} you dug out the guitar and {started a band with three other parents that played one bar, twice a year.|took lessons from a teenager who called you “sir” or “ma'am” and was very patient.}`, 4) },
          { id: "a_midlife.car", label: "Buy the convertible", hint: "life is short", act: "vice", style: "self", weight: 0.12, apply: set("car", `${then} you bought a convertible. {It was impractical for nine months of the year and perfect for three.|You drove it with the top down in October, shivering and happy.}`, 4, s2 => spend(s2, 0.15)) },
          { id: "a_midlife.class", label: "Take a night class", hint: "something you always wanted to learn", act: "study", style: "learn", weight: 0.16, apply: set("class", `${then} you signed up for a night class in {Spanish|astronomy|woodworking|creative writing|photography} at the community college, and were the oldest and most enthusiastic person in the room.`, 3, s2 => spend(s2, 0.01)) },
          { id: "a_midlife.trip", label: "Take a real trip, alone", hint: "the one you keep postponing", act: "travel", style: "self", weight: 0.16, apply: set("trip", `${then} you finally took the trip you'd been postponing for twenty years, to {trip}. {You came back a little different.|You walked everywhere and ate whatever you wanted.}`, 4, s2 => spend(s2, 0.08)) },
        ],
      };
    },
  },
  A("a_marathon", [40, 60], 0.9, (s, ctx) => [
    "You ran the marathon. {Mile 20 was the worst hour of your life, and you crossed the finish line crying.|You finished in five hours and twelve minutes, and the medal hangs in the hallway.|Your family held a sign that said “WORST PARADE EVER,” and you laughed through mile 23.}",
    "Race day came, and you ran the whole marathon {without walking once, which you will mention forever.|and walked a little, and finished, which is all that matters.}",
    "You crossed the marathon finish line {holding hands with a stranger who had run beside you for ten miles.|with your arms in the air.} You couldn't walk down stairs for a week, and you signed up for another.",
  ], { domain: "health", channel: "good", once: true, mood: 7, when: s => s.flags.marathonAt === s.age - 1, effect: (s, ctx) => { fitter(s); ctx.remember("a_marathon", "You ran a marathon."); } }),
  {
    // High school reunions: the twentieth, twenty-fifth and thirtieth.
    id: "a_hsReunion", domain: "family", channel: "change", tags: ["friends"], ages: [37, 49], cooldown: 5, max: 2, when: s => home(s) && [38, 43, 48].includes(s.age) && !["none", "elementary", "middle"].includes(s.edu), p: () => 0.35,
    choice: (s, ctx) => {
      const n = s.age - 18, fl = s.flags.firstLove;
      const lead = scene(ctx, [
        `Your ${n === 20 ? "twentieth" : n === 25 ? "twenty-fifth" : "thirtieth"} high school reunion is next month, in the same gym, with the same DJ, probably.`,
        s.year >= 2008 ? `The invitation for your ${n}-year high school reunion came through Facebook, and you already know what everyone looks like.` : `The invitation for your ${n}-year high school reunion came in the mail, with a photo of the class in ${s.year - n}.`,
        fl ? `Your ${n}-year reunion is coming up, and you wonder if ${fl.name} will be there.` : null,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["Do you go?", "What do you do?"])}`,
        options: [
          { id: "a_hsReunion.go", label: "Go, and have fun", hint: "everyone's older now", act: "socialize", style: "social", weight: 0.36, apply: (s2, c) => ({ text: c.w(`You went to your ${n}-year reunion. {The football captain was bald and lovely now, and the shyest girl in class owned three restaurants.|You danced to the same songs and stayed until they turned the lights on.|Nobody cared who had been cool, and you all looked at photos of each other's kids.}`), mood: 4 }) },
          { id: "a_hsReunion.shape", label: "Get in shape first", hint: "three months, twenty pounds", act: "exercise", style: "health", weight: 0.16, apply: (s2, c) => { fitter(s2); return { text: c.w(`You spent three months getting in shape for your ${n}-year reunion, {and nobody noticed, and you felt great anyway.|and kept the habit long after the reunion.}`), mood: 3 }; } },
          { id: "a_hsReunion.love", label: fl ? `Look for ${fl.name}` : "Look up your old crush", hint: "just to say hi", act: "pursue", style: "risk", weight: 0.12, apply: (s2, c) => ({ text: c.w(`At your ${n}-year reunion you found ${fl ? fl.name : "your old high school crush"} by the punch bowl. {You talked for an hour about everything, and it was sweet and it was enough.|${fl ? fl.name : "They"} said, “I always wondered about you,” and you both laughed.}`), mood: 3 }) },
          { id: "a_hsReunion.organize", label: "Help organize it", hint: "the committee needs you", act: "volunteer", style: "family", weight: 0.12, apply: (s2, c) => ({ text: c.w(`You joined the committee for your ${n}-year reunion, tracked down eighty classmates, and {made a slideshow that made the whole room cry.|argued for a month about the menu.}`), mood: 3 }) },
          { id: "a_hsReunion.skip", label: "Skip it", hint: "you see who you want to see", act: "avoid", style: "self", weight: 0.24, apply: (s2, c) => ({ text: c.w(`You skipped your ${n}-year reunion. {You saw the photos later and felt fine about it.|You had dinner with your two real friends from high school instead.}`), mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "a_friendDivorce", domain: "family", channel: "bad", tags: ["friends"], ages: [30, 62], cooldown: 8, max: 2, when: home, p: () => 0.022,
    choice: (s, ctx) => {
      const bf = bestFriend(s), f = bf || ctx.person({ role: "friend", sex: s.sex, birthYear: s.birthYear }), name = f.call;
      const both = together(s);
      const lead = scene(ctx, [
        `${name} called late at night: ${they(f)} and ${their(f)} spouse are getting divorced.`,
        both ? `${name} and ${their(f)} spouse were your favorite couple to have dinner with, and now they're splitting up, and both want you on their side.` : `${name} is getting divorced and asked if ${they(f)} could stay on your couch for a while.`,
        `At ${name}'s birthday party, ${they(f)} told everyone the marriage was over, and the room went quiet.`,
      ]);
      const then = `When ${name}'s marriage ended,`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you help?", "What do you do?"])}`,
        options: [
          { id: "a_friendDivorce.there", label: "Be there, whatever it takes", hint: "late-night calls, moving boxes", act: "care", style: "family", weight: 0.32, apply: (s2, c) => ({ text: c.w(`${then} you were there: {late-night calls, moving boxes, a lot of pizza.|you helped ${them(f)} find an apartment and put up shelves.} ${name} said later you were the reason ${they(f)} made it through that year.`), mood: 2 }) },
          { id: "a_friendDivorce.couch", label: "Offer your couch", hint: "as long as it takes", act: "care", style: "social", weight: 0.16, apply: (s2, c) => ({ text: c.w(`${then} you offered ${them(f)} your couch, and ${name} stayed {six weeks|two months}. {It was crowded and full of late-night talks you'll never forget.|${cap(they(f))} made breakfast every morning to earn ${their(f)} keep.}`), mood: 2 }) },
          { id: "a_friendDivorce.neutral", label: "Stay neutral", hint: "you love them both", act: "avoid", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: `${then} you tried to stay neutral, because you cared about both of them. It was harder than it sounded, and both of them mostly understood.`, mood: -1 }) },
          { id: "a_friendDivorce.side", label: "Take their side, loudly", hint: "loyalty", act: "insist", style: "self", weight: 0.14, apply: (s2, c) => ({ text: c.w(`${then} you took ${name}'s side completely. {You lost a friend in the other spouse, and kept the one who mattered more.|You said some things about the ex at a barbecue that got back to the ex.}`), mood: 0 }) },
          { id: "a_friendDivorce.out", label: "Get them out of the house", hint: "a game, a hike, karaoke", act: "socialize", style: "social", weight: 0.18, apply: (s2, c) => ({ text: c.w(`${then} you dragged ${name} out every weekend: {ballgames, hikes, and one regrettable karaoke night.|a cooking class where ${they(f)} set a towel on fire.} ${name} laughed again by summer.`), mood: 3 }) },
        ],
      };
    },
  },
  {
    id: "a_volunteer", domain: "family", channel: "good", once: true, ages: [30, 62], when: home, p: () => 0.03,
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        "A flyer at the grocery store says the food bank needs volunteers on Saturdays.",
        `After a long week, you realized you'd like to do something that has nothing to do with ${working(s) ? "your job" : "your own life"}.`,
        `${s.kids.length ? "Your kid's school" : "Your neighbor"} asked if you could help with something for a few hours a week.`,
      ]);
      const set = (key, text, mood = 4) => (s2, c) => { s2.flags.volunteer = key; return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["Where do you give your time?", "What do you do?"])}`,
        options: [
          { id: "a_volunteer.food", label: "The food bank", hint: "Saturday mornings", act: "volunteer", style: "social", weight: 0.24, apply: set("food bank", "You started volunteering at the food bank on Saturday mornings, {sorting canned goods with a retired mailman who told the best stories.|and you learned the names of the families who came every week.}") },
          { id: "a_volunteer.build", label: s.year >= 1977 ? "Habitat for Humanity" : "Fix up homes with the church", hint: "swing a hammer", act: "volunteer", style: "health", weight: 0.18, apply: set("Habitat", `You started building houses with ${s.year >= 1977 ? "Habitat for Humanity" : "a church group"}. {The first family to move in hugged every volunteer.|You were bad with a hammer and good at carrying things.}`) },
          { id: "a_volunteer.mentor", label: "Mentor a kid", hint: "an hour a week", act: "volunteer", style: "family", weight: 0.2, apply: set("mentor", "You signed up to mentor a kid through {Big Brothers Big Sisters|an after-school program}. {Years later you went to the kid's high school graduation.|Mostly you played basketball and listened, and that was the point.}") },
          { id: "a_volunteer.shelter", label: "The animal shelter", hint: "walk the dogs", act: "volunteer", style: "self", weight: 0.14, apply: set("animal shelter", "You started walking dogs at the animal shelter every Sunday. {You almost adopted all of them.|You were the one who stayed to sit with the scared ones.}") },
          { id: "a_volunteer.check", label: "Give money instead of time", hint: "you're stretched thin", act: "donate", style: "safe", weight: 0.14, apply: (s2, c) => { spend(s2, 0.02); return { text: "You didn't have the hours, so you set up a monthly donation to the food bank, and gave a little more every year.", mood: 1 }; } },
          { id: "a_volunteer.later", label: "Maybe when things calm down", hint: "someday", act: "wait", style: "safe", weight: 0.1, apply: () => ({ text: "You meant to volunteer when things calmed down, and things kept not calming down.", mood: 0 }) },
        ],
      };
    },
  },
  {
    // A congregation: church, synagogue, mosque, temple, or a community that is not religious.
    id: "a_faith", domain: "family", channel: "change", once: true, ages: [30, 62], when: home, p: s => (hasKid(3, 12)(s) ? 0.03 : 0.02),
    choice: (s, ctx) => {
      const f = faithOf(s, ctx), place = { christian: "church", jewish: "synagogue", muslim: "mosque", hindu: "temple", none: "Sunday gathering" }[f];
      const lead = scene(ctx, [
        hasKid(3, 12)(s) ? `${kidIn(s, ctx, 3, 12).call} asked what happens after we die, and you realized you don't have a ready answer.` : "You've been feeling unmoored lately, as if the weeks don't add up to anything.",
        f === "none" ? "A friend invited you to a Sunday gathering that is not exactly religious: coffee, singing, and a talk about kindness." : `A friend invited you to services at the ${place} near your house, the way your family used to go.`,
        `You went to a funeral at a ${place} and were surprised by how much the community moved you.`,
      ]);
      const set = (text, mood = 3, join = false) => (s2, c) => { if (join) s2.flags.congregation = s2.age; return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "Where do you look?"])}`,
        options: [
          { id: "a_faith.join", label: f === "none" ? "Join a community group" : `Join the ${place}`, hint: "show up every week", act: "spiritual", style: "family", weight: 0.3, apply: set(`You started going to the ${place} every week. {You found people who brought soup when you were sick.|The ${f === "none" ? "Sunday singing" : "old hymns"} undid something in you, in a good way.}`, 4, true) },
          { id: "a_faith.choir", label: "Join the choir", hint: "sing in the back row", act: "hobby", style: "social", weight: 0.16, apply: set(`You joined the choir at the ${place}, {sang in the back row, slightly flat,|and made five friends who could all harmonize better than you} and looked forward to Thursday rehearsals all week.`, 4, true) },
          { id: "a_faith.quiet", label: s.year >= 1990 ? "Try meditation or yoga" : "Take long walks and think", hint: "quiet, on your own", act: "rest", style: "health", weight: 0.2, apply: set(s.year >= 1990 ? "You started {meditating ten minutes every morning|going to a Tuesday yoga class}, and found a little quiet you didn't know you needed." : "You started taking long walks alone on Sunday mornings, and found that the quiet answered some things.", 3) },
          { id: "a_faith.serve", label: `Help with the ${place}'s food pantry`, hint: "faith with sleeves rolled up", act: "volunteer", style: "social", weight: 0.14, apply: set(`You started helping with the food pantry at the ${place}, which was the part that made the most sense to you.`, 3, true) },
          { id: "a_faith.read", label: "Read about other traditions", hint: "ask the big questions", act: "study", style: "learn", weight: 0.1, apply: set("You read about traditions you'd never studied, {Buddhist, Quaker, Jewish and more,|from the library shelf marked “religion,”} and came away with more questions and a little more peace.", 2) },
          { id: "a_faith.sleep", label: "Sleep in on Sunday", hint: "that's your ritual", act: "rest", style: "self", weight: 0.1, apply: set("You decided Sunday morning was for pancakes and the newspaper, and that was its own kind of faith.", 1) },
        ],
      };
    },
  },
  A("a_forty", [40, 40], 0.3, (s, ctx) => [
    `For your fortieth birthday, ${together(s) ? pn(s) : "your friends"} threw a surprise party with black balloons that said “Over the Hill.” {You were genuinely surprised and pretended to be insulted.|You laughed harder than you had in a year.}`,
    `You turned forty and {found your first gray hair, and then nine more.|threw out your back picking up a sock.|realized the music on the oldies station was yours.}`,
    `On your fortieth birthday you {went to bed at nine and woke up delighted.|took the day off and did exactly what you wanted, which was mostly nothing.|wrote a letter to yourself at fifty.}`,
  ], { once: true, mood: 3, when: home }),
  A("a_fifty", [50, 50], 0.3, (s, ctx) => [
    `You turned fifty, and ${s.year >= 1958 ? "the AARP membership card arrived in the mail that same week, with your name on it, which felt personal" : "your friends gave you a cane as a joke"}. {You put it on the fridge as a joke and kept it.|You laughed, and then you joined.}`,
    `For your fiftieth, ${hasKid(10, 40)(s) ? "the kids" : together(s) ? pn(s) : "your oldest friends"} made a slideshow of your life, {with far too many photos of your hair from ${s.birthYear + 20}.|and you realized it's been a good one so far.}`,
    "You turned fifty and {decided you no longer cared what anyone thought of your sandals.|went skydiving, or at least looked into it seriously.|found that you liked yourself more than you had at thirty.}",
  ], { once: true, mood: 3, when: home }),
  A("a_readers", [42, 48], 0.07, (s, ctx) => [
    "You found yourself holding the menu at arm's length, and the optometrist said the word “readers.” {You now own eleven pairs, and can never find one.|You bought a pair at the drugstore and felt about a hundred.}",
    "You needed reading glasses, and {got a chain to wear them around your neck, ironically, then sincerely.|kept pushing them up on your head and then searching for them.}",
    "The print on the medicine bottle got smaller, or so you claimed, until you gave in and bought reading glasses. The world was suddenly very sharp.",
  ], { once: true, mood: 0, when: home }),
  {
    // An old friend you have drifted from.
    id: "a_oldFriend", domain: "family", channel: "change", tags: ["friends"], once: true, ages: [30, 62], when: s => home(s) && !!bestFriend(s), p: () => 0.03,
    choice: (s, ctx) => {
      const f = bestFriend(s), name = f.call;
      const lead = scene(ctx, [
        `You realized you haven't really talked to ${name} in ${yearsWord(3 + ctx.rng.int(5))}. You used to talk every day.`,
        `${name}'s ${s.year >= 2008 ? "post" : "Christmas card"} said ${they(f)} ${ctx.rng.pick(["moved", "got remarried", "lost a parent", "started a new job"])}, and you hadn't even known.`,
        `A song from high school came on the radio and you thought of ${name} so suddenly you had to pull over.`,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["Do you reach out?", "What do you do?"])}`,
        options: [
          { id: "a_oldFriend.call", label: "Call, right now", hint: "before you think about it", act: "talk", style: "social", weight: 0.3, apply: (s2, c) => { f.bond = Math.min(1, (f.bond || 0.5) + 0.2); return { text: c.w(`You called ${name}, and ${they(f)} picked up on the second ring and said, “I was just thinking about you.” {You talked for two hours.|It was as if no time had passed.}`), mood: 5 }; } },
          { id: "a_oldFriend.trip", label: "Plan a weekend together", hint: "like the old days", act: "travel", style: "family", weight: 0.2, apply: (s2, c) => { f.bond = Math.min(1, (f.bond || 0.5) + 0.2); spend(s2, 0.03); return { text: c.w(`You and ${name} planned a weekend together, {at a cabin with bad Wi-Fi and good whiskey.|in the old college town.} You laughed at the same dumb things, and promised to do it every year, and did.`), mood: 5 }; } },
          { id: "a_oldFriend.letter", label: "Send a card or a letter", hint: "something in their mailbox", act: "talk", style: "safe", weight: 0.16, apply: (s2, c) => ({ text: c.w(`You wrote ${name} a real letter, on paper. {A month later a reply came, four pages long.|${cap(they(f))} called the day it arrived.}`), mood: 3 }) },
          { id: "a_oldFriend.visit", label: "Just show up", hint: "with pie", act: "socialize", style: "risk", weight: 0.12, apply: (s2, c) => ({ text: `You drove to ${name}'s house with a pie and knocked. ${cap(they(f))} opened the door, screamed, and hugged you on the porch.`, mood: 5 }) },
          { id: "a_oldFriend.let", label: "Let it be", hint: "friendships have seasons", act: "wait", style: "self", weight: 0.22, apply: (s2, c) => { f.bond = Math.max(0, (f.bond || 0.5) - 0.1); return { text: `You decided some friendships have seasons, and let it be. You still think of ${name} when that song comes on.`, mood: -1 }; } },
        ],
      };
    },
  },
  {
    // After core.js's layoff, at 47 or older: starting over in your fifties.
    id: "a_laidOff50", domain: "career", channel: "bad", once: true, ages: [47, 62], when: s => home(s) && !s.employed && !s.retired && (s.last.layoff ?? -9) >= s.age - 1, p: () => 0.6,
    choice: (s, ctx) => {
      const y = s.year;
      const lead = scene(ctx, [
        `You're ${s.age}, laid off, and the job listings all seem to want someone with “five years of experience and a lot of energy.”`,
        `After ${words(10 + ctx.rng.int(11))} years at the same place, you're ${s.age} and starting over.`,
        `You were laid off at ${s.age}${y >= 1986 ? ", the COBRA paperwork is on the counter," : ""} and you have a lot of experience and a little panic.`,
      ]);
      const back = `Laid off at ${s.age},`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What's your next move?", "What do you do?"])}`,
        options: [
          { id: "a_laidOff50.network", label: y >= 2005 ? "Update LinkedIn and call everyone" : "Call everyone you've ever worked with", hint: "your network is your net worth", act: "jobSearch", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${back} you ${y >= 2005 ? "updated your LinkedIn and" : "got out your Rolodex and"} called everyone you had ever worked with. {Coffee by coffee, the leads started coming.|An old colleague said, “Why didn't you call me sooner?”}`), mood: 1 }) },
          { id: "a_laidOff50.retrain", label: "Go back to school for something new", hint: "a certificate, a new field", act: "study", style: "learn", weight: 0.18, apply: (s2, c) => { s2.flags.retrained = s2.age; spend(s2, 0.03); return { text: c.w(`${back} you enrolled in a certificate program at the community college in {medical billing|IT support|project management|HVAC}. You were the oldest in class, and the one who did the reading.`), mood: 2 }; } },
          { id: "a_laidOff50.consult", label: "Freelance, using what you know", hint: "be your own boss", act: "sideJob", style: "risk", weight: 0.18, apply: (s2, c) => { s2.savings += 0.05; return { text: c.w(`${back} you started freelancing in your old field. {The first client was your old company, which was satisfying.|It was uneven money, and every check felt earned.}`), mood: 2 }; } },
          { id: "a_laidOff50.gig", label: y >= 2013 ? "Drive for a ride app while you look" : "Take any job while you look", hint: "keep the money coming", act: "sideJob", style: "safe", weight: 0.14, apply: (s2, c) => { s2.savings += 0.04; return { text: c.w(`${back} you ${y >= 2013 ? "drove for a ride app" : "took part-time work at a hardware store"} while you looked. {You met interesting people and learned the whole city.|It was humbling, and it paid the bills.}`), mood: 0 }; } },
          { id: "a_laidOff50.rest", label: "Take a few months to breathe", hint: "you've earned a pause", act: "rest", style: "health", weight: 0.1, apply: (s2, c) => ({ text: c.w(`${back} you took a few months to breathe: {you slept, walked, fixed the porch, and figured out what you actually wanted.|for the first time since you were sixteen, you had nowhere to be.}`), mood: 2 }) },
          { id: "a_laidOff50.angry", label: "Let yourself be angry first", hint: "twenty years, and a box", act: "avoid", style: "self", weight: 0.1, apply: () => ({ text: `${back} you let yourself be angry first: about the years, the cardboard box, the security guard. Then you got up one Monday and started again.`, mood: -2 }) },
        ],
      };
    },
  },
  A("a_survivor", [32, 64], 0.1, (s, ctx) => [
    `In the ${s.year} downturn, half your department was let go, and you kept your job. {You felt lucky and guilty in equal parts.|You did the work of three people for a year and didn't complain out loud.}`,
    `The company froze pay${s.year >= 2008 && s.year <= 2010 ? " and gave everyone two unpaid furlough days a month" : ""}. {You cut back on eating out.|You were grateful to be working at all.}`,
    `There were layoffs at work in the ${s.year} recession, and your name wasn't on the list. You helped a friend who was laid off pack ${s.year >= 1995 ? "a box and a laptop bag" : "a box"}, and you took them to lunch the next week.`,
  ], { domain: "career", channel: "change", once: true, mood: -1, when: (s, ctx) => home(s) && working(s) && s.job.field !== "military" && recession(ctx, s.year), effect: s => spend(s, 0.03) }),
  A("a_youngBoss", [45, 64], 0.018, (s, ctx) => [
    `Your new boss is {twenty-nine|younger than your oldest kid|young enough to be your child}, and called you “a legend” in the first meeting. {You decided to take it as a compliment.|You taught them how things really work there, and they taught you three shortcuts.}`,
    `A new manager half your age asked you, very politely, if you were comfortable with ${s.year >= 2015 ? "Slack" : s.year >= 2000 ? "the new software" : "computers"}. You smiled and said, “I'll manage,” and you did.`,
    "Your new boss is young, sharp and nervous, and by the end of the year you were the one they came to for advice, which was its own kind of promotion.",
  ], { domain: "career", channel: "change", once: true, mood: 0, when: s => home(s) && working(s) && s.job.field !== "military" }),
  A("a_crew", [30, 65], 0.014, (s, ctx) => {
    const y = s.year, thing = ctx.rng.pick([y < 1995 ? "a bowling league" : y >= 2018 ? "a pickleball group" : "a softball team", y >= 1996 ? "a book club that mostly drank wine" : "a book club", "a monthly poker night", y >= 2002 ? "a fantasy football league" : "a Friday golf foursome", "a trivia team at the bar down the street"]);
    return [
      `You joined ${thing} with a few people from {work|the neighborhood|church}, and {it became the best night of the month.|you have been losing gracefully ever since.|it lasted twenty years.}`,
      `Your friends started ${thing}, and {you were terrible and kept going.|the group text became your favorite place on earth.}`,
      `${thing.replace(/^a /, "The ")} you joined became the place you told the truth about your week. {You laughed more there than anywhere.|When things got hard, they showed up with casseroles.}`,
    ];
  }, { domain: "family", channel: "good", tags: ["friends"], cooldown: 6, max: 2, mood: 3, when: home }),

  // ---------- the times, as a grown-up met them ----------
  A("a_inflation", [28, 60], 0.5, (s, ctx) => [
    `Inflation hit thirteen percent, and {the price of hamburger went up every week.|the bank paid twelve percent on a CD, and your car loan cost eighteen.|you started clipping coupons and saving the twist ties.}`,
    `With prices rising every month, you {sat at the kitchen table with a budget and a calculator.|bought a chest freezer and stocked it with sale meat.} ${s.home === "own" ? "The mortgage you already had looked like a bargain now." : "Buying a house felt farther away than ever."}`,
    "Everything cost more every time you went to the store, and {the grocery receipt became a nightly news story at your house.|you turned the thermostat down to 65 and wore sweaters.}",
  ], { once: true, years: [1979, 1981], mood: -2, when: s => home(s) && s.year >= 1979 && s.year <= 1981, effect: s => spend(s, 0.02) }),
  A("a_officeEmail", [28, 60], 0.2, (s, ctx) => [
    "The office got email, and {your first message went to the whole company by mistake.|someone printed every email and put it in your inbox, the wooden one.|the IT guy taught everyone to double-click, one at a time.}",
    `You got a computer on your desk at work and an email address that was your name with numbers in it. {Within a year you got fifty emails a day.|You still called people to ask if they got your email.}`,
    "At work, the memos stopped coming on paper and started coming by email, and {you learned the terror of “reply all.”|you discovered solitaire.}",
  ], { once: true, years: [1992, 1999], mood: 1, when: s => home(s) && working(s) && s.year >= 1992 && s.year <= 1999 }),
  A("a_cellPhone", [28, 60], 0.12, (s, ctx) => [
    `You got your first cell phone, ${s.year < 1998 ? "a big Motorola" : "a Nokia"}, “just for emergencies.” {Within a month you called home from the grocery store to ask about milk.|It rang in a movie theater once and you nearly died.}`,
    `You bought a cell phone and paid by the minute, so {you talked very fast.|you only turned it on to make calls.} ${s.year >= 1999 ? "You played Snake on it in waiting rooms." : "It was the size of a shoe."}`,
    "You got a cell phone, and for the first time you could be reached anywhere, which you weren't sure was an improvement.",
  ], { once: true, years: [1994, 2003], mood: 1, when: s => home(s) && s.year >= 1994 && s.year <= 2003 }),
  A("a_onlineShop", [28, 60], 0.1, (s, ctx) => [
    `You bought your first thing online, {a book from Amazon|a used camera on eBay|plane tickets}, and checked the mailbox every day until it came.`,
    `You won an eBay auction for {a lamp exactly like your grandmother's|a box of old baseball cards|a vintage lunchbox} in the last ten seconds, and felt like a spy.`,
    "You typed your credit card number into a website for the first time, nervously, and the package actually arrived. Christmas shopping was never the same.",
  ], { once: true, years: [1998, 2006], mood: 1, when: s => home(s) && s.year >= 1998 && s.year <= 2006 }),
  A("a_alwaysOn", [28, 60], 0.06, (s, ctx) => [
    `Work gave you a ${s.year < 2010 ? "BlackBerry" : "smartphone"}, and now {the office follows you to the kids' games.|you check email at red lights, which you know you shouldn't.|you sleep with it on the nightstand like a pager.}`,
    `You answered a work email at 11 p.m. ${hasKid(4, 15)(s) ? "from the bleachers at the school play" : "from bed"}, and decided {you needed rules.|this could not be your whole life.}`,
    "Your boss started emailing at midnight and expecting answers by six, and you {turned off notifications after dinner, and the company survived.|got very good at sounding busy from the beach.}",
  ], { domain: "career", channel: "bad", once: true, years: [2004, 2014], mood: -1, when: s => home(s) && working(s) && s.year >= 2004 && s.year <= 2014, effect: s => stress(s, 0.03) }),
  {
    // Facebook opened to everyone in 2006; most adults were on it by the early 2010s.
    id: "a_facebook", domain: "family", channel: "change", tags: ["friends"], once: true, years: [2008, 2014], ages: [28, 64], when: s => home(s) && s.year >= 2008 && s.year <= 2014, p: () => 0.12,
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        `${hasKid(13, 25)(s) ? "Your kids say nobody uses it anymore, but" : "Everyone you know is on it, and"} you finally made a Facebook account.`,
        "Your high school class is organizing a reunion on Facebook, so you made an account, and the friend requests started pouring in.",
        parentsAlive(s) ? `${aParent(s, ctx)} joined Facebook and sent you a friend request, and you have to decide what to do.` : "A coworker set up your Facebook profile for you, and now you have one.",
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["How do you use it?", "What kind of Facebook person are you?"])}`,
        options: [
          { id: "a_facebook.friends", label: "Friend everyone from high school", hint: "find out what happened to them", act: "socialize", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w("You friended everyone from high school and {found out the class clown is a pediatrician now.|reconnected with a friend you'd lost touch with for twenty years.|spent a whole evening clicking through strangers' vacation photos.}"), mood: 3 }) },
          { id: "a_facebook.kids", label: s.kids.length ? "Post only photos of the kids" : "Post only photos of the dog", hint: "the proud parent", act: "talk", style: "family", weight: 0.24, apply: (s2, c) => ({ text: s2.kids.length ? c.w("You used Facebook for one thing: photos of the kids. {Your mother liked every single one within a minute.|The kids, later, asked you to take some down.}") : "You used Facebook for one thing: photos of the dog, who developed a modest following.", mood: 2 }) },
          { id: "a_facebook.lurk", label: "Read everything, post nothing", hint: "the quiet observer", act: "avoid", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w("You made a Facebook account with no profile picture and {read everything and posted nothing.|knew everyone's news and shared none of your own.}"), mood: 0 }) },
          { id: "a_facebook.argue", label: "Get into it in the comments", hint: "someone is wrong online", act: "dispute", style: "risk", weight: 0.12, apply: (s2, c) => ({ text: c.w("You got into a long comment argument on Facebook with {a cousin|a high school acquaintance|a total stranger} about {politics|a recipe|a football call}. {Nobody changed their mind.|You won, technically, and felt terrible.}"), mood: -2 }) },
          { id: "a_facebook.quit", label: "Delete it after a month", hint: "life is short", act: "quitHabit", style: "health", weight: 0.14, apply: (s2, c) => ({ text: c.w("You deleted Facebook after a month. {You felt lighter, and missed a few birthdays.|Your evenings got quieter, and better.}"), mood: 1 }) },
        ],
      };
    },
  },
  A("a_videoCall", [30, 65], 0.07, (s, ctx) => {
    const g = grandsWord(s), kids = kidsCall(kidsAged(s, 1, 15)), pl = kidsAged(s, 1, 15).length > 1;
    const gt = g.includes(" and ") ? "them" : g === "Grandma" ? "her" : "him", gy = g.includes(" and ") ? "they" : g === "Grandma" ? "she" : "he";
    return [
      `${g} learned to video call, and now ${kids} {${pl ? "show" : "shows"} ${gt} every drawing, every loose tooth and every new pair of shoes.|${pl ? "read" : "reads"} bedtime stories with ${gt} every Sunday night across the country.} Mostly the screen shows their foreheads.`,
      `You set up a tablet for ${g} so ${gy} could see ${kids}, and {the first call was ten minutes of “Can you hear me?”|now ${gy} ${gy === "they" ? "call" : "calls"} more than you do.}`,
      `${kids} ${kidsAged(s, 1, 15).length > 1 ? "blow" : "blows"} kisses at ${g} on the screen every night before bed, and ${g} ${g.includes(" and ") ? "blow" : "blows"} them back.`,
    ];
  }, { domain: "family", channel: "good", tags: ["father", "mother", "children"], once: true, mood: 3, when: s => home(s) && s.year >= 2011 && parentsAlive(s) && hasKid(1, 15)(s) }),
  A("a_prices", [28, 64], 0.22, (s, ctx) => (s.year === 2008 ? [
    "Gas hit four dollars a gallon, and you {started combining errands like a general planning a campaign.|watched the numbers on the pump spin with real fear.|joined a carpool with two coworkers.}",
    "With gas at four dollars, you {left the SUV in the driveway and dusted off the bike.|drove five miles out of your way to save three cents a gallon, which you knew made no sense.}",
    "The price of gas went up every week that summer, and {the family road trip shrank to a day at the lake.|you finally did the math on a smaller car.}",
  ] : [
    "Grocery prices jumped, and {a dozen eggs cost what a whole dinner used to.|you started buying the store brand of everything.|you stood in the cereal aisle doing math.}",
    "With prices up everywhere, you {canceled three streaming services.|started meal planning on Sundays.|learned to love beans.} Gas was nearly five dollars that summer.",
    "Everything cost more, from rent to coffee, and {your paycheck went a lot less far.|you cut back and talked about money at dinner more than ever.}",
  ]), { domain: "wealth", channel: "bad", once: true, years: [2008, 2023], mood: -2, when: s => home(s) && (s.year === 2008 || s.year === 2022 || s.year === 2023), effect: s => spend(s, 0.02) }),
  A("a_kidsTech", [35, 65], 0.022, (s, ctx) => {
    const k = kidIn(s, ctx, 10, 25), n = k.call, y = s.year;
    const thing = y < 2007 ? "how to burn a CD" : y < 2012 ? "how to text with the little keyboard" : y < 2018 ? "what an emoji means, which you'd been using wrong" : "how to make your phone's text bigger";
    return [
      `${n} showed you ${thing}, {sighing the way you used to sigh at your parents.|with enormous patience, which surprised you.}`,
      `${n} explained ${thing} three times, slowly, and you realized the roles had reversed. {You were proud of ${them(k)}.|You remembered teaching ${them(k)} to tie ${their(k)} shoes.}`,
      `${n} set up your new ${y < 2008 ? "computer" : "phone"} in four minutes while you were still looking for the instructions.`,
    ];
  }, { domain: "family", channel: "good", tags: ["children"], cooldown: 6, max: 2, mood: 2, when: s => home(s) && s.year >= 2000 && hasKid(10, 25)(s) }),
];

// Pacing: a life holds about forty choices in all, and the years 30–60 already have core.js's big decisions, so the
// everyday choices here are scaled to ask about seven over those thirty years. Follow-ups and moments that come once
// at a fixed point (the tuition bill, the empty nest, the estate, the year after a divorce) keep their odds.
const PACE = 0.62;
const KEEP = new Set(["a_estate", "a_tuition", "a_collegeApps", "a_emptyNest", "a_afterDivorce", "a_widowed", "a_laidOff50", "a_blended", "a_anniversary", "a_hsReunion", "a_estranged", "a_parents50th", "a_comingOut"]);
for (const ev of ADULT) if (ev.choice && !KEEP.has(ev.id)) { const p = ev.p; ev.p = (s, ctx) => p(s, ctx) * PACE; }
