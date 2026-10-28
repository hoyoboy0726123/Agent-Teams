// Work storylines over several years: a business of your own (a food truck, an Etsy shop, a startup, the hardware
// store on Main Street), a side hustle by era (a cab on weekends, eBay, Uber), going back to school at night or
// online, a civil-service exam, a career change in your thirties (nursing, a coding bootcamp, a teaching
// certificate, a trade), a union card and a strike, working from home after 2020 and the call back to the office,
// the step up into management, and a sabbatical after burning out.
//
// Arcs keep their state in s.arcs[id] (ctx.arc.start / at / go / end; a stage fires once its year comes). Each
// storyline's choices give onFree, so a written answer moves the story on too. act.js opens three of these arcs from
// written answers and leaves them here to close: "startup" ({ kind, from }), "civil" ({ tries, quit }) and "study"
// ({ kind, from }); core.js firstJob / findJob wait while "startup" or "civil" is open. core.js ccDone leaves
// s.flags.nightSchool = { from } (a job by day, a bachelor's at night), which w_nightMid and w_nightDone finish.
//
// The probabilities are assumptions (no statistic exists for "a friend asks you to open a food truck"): the openings
// are 0.5–3 % a year, so a life holds two to four of these storylines. Going back to school is kept rare (0.5 % a
// year), since a finished night degree raises s.edu to a bachelor's and the share of bachelor's degrees is calibrated.
// Nothing here marries, has a baby, buys a home or retires anyone.
//
// Left for later modules:
//   s.flags.arc_startup  "success" | "failed" | "closed"   s.flags.stake  { kind, at, who } (money put into a friend's business)
//   s.flags.nightDegree  the age a night or online bachelor's was finished;  s.flags.nightSchoolLeft  the age it was dropped
//   s.flags.union        { since, role: "member" | "steward" | "covered" | "apprentice" | "no" }
//   s.flags.remote       { since, moved }   s.flags.managerPath  "manager" | "craft" | "declined" | "stepBack"
//   s.flags.sabbatical   the age of a sabbatical      s.flags.switched  { from, to, age } after a career change
import { scene, cap, an, they, them, their, bestFriend, parentWord, hasDegree, inStates, stateOf } from "./common.js";
import { startJob, otherJob, moveTo } from "../world.js";
import { inService } from "./core.js";
import { usd } from "./young.js";

// ---------- helpers ----------
const EDU = ["none", "elementary", "middle", "high", "ged", "certificate", "associate", "bachelor", "master", "professional", "doctorate"];
// Raises the schooling to `level` if it is lower (never lowers it).
const raiseEdu = (s, level) => { if (EDU.indexOf(s.edu) < EDU.indexOf(level)) s.edu = level; };
const atHome = s => !s.abroad;
const working = s => s.employed && s.job && s.job.field !== "military" && !s.retired;
const spend = (s, x) => { const paid = Math.min(s.savings, x); s.savings -= paid; return paid; };
const stress = (s, x) => { s.health.stress = Math.max(0, Math.min(1, (s.health.stress ?? 0.3) + x)); };
const loseJob = s => { s.employed = false; s.unemployedFor = 1; };
// A friend from the story, or someone the story can name without having met them.
function pal(s, ctx, fallback) {
  const f = bestFriend(s) || ctx.rng.pick(s.friends.filter(x => x && x.alive !== false && x.call).concat([null]));
  return f ? { name: f.call, p: f } : { name: fallback || ctx.rng.pick(["your old college roommate", "your cousin", "a friend from high school"]), p: null };
}
const FIELD_SHOP = {
  construction: "contracting business", "health care": "home-care agency", health: "home-care agency", tech: "software consultancy", "food service": "restaurant",
  beauty: "salon", marketing: "small agency", design: "design studio", media: "video production company", finance: "bookkeeping firm", repair: "auto repair shop",
  education: "tutoring center", "child care": "daycare", fitness: "fitness studio", "real estate": "real estate brokerage", logistics: "trucking company",
  law: "law practice", insurance: "insurance agency", retail: "shop of your own", hospitality: "catering company", engineering: "engineering firm",
};
// Fields where people did their jobs from home after March 2020.
const OFFICE = ["tech", "finance", "office", "marketing", "consulting", "insurance", "design", "media", "management", "sales", "law", "research", "government", "engineering", "communications", "language", "nonprofit", "real estate", "health"];
const office = s => working(s) && OFFICE.includes(s.job.field) && !/nurse|physician|aide|medical assistant|dental|technician|therapist|EMT/i.test(s.job.title);
// Fields with unions: manufacturing, trucking, building trades, schools, hospitals, public jobs; shops and coffee
// counters in the drives of the early 2020s.
const UNION = ["manufacturing", "logistics", "construction", "education", "health care", "health", "public safety", "government", "communications", "travel", "arts", "repair"];
const unionable = s => working(s) && (UNION.includes(s.job.field) || (["food service", "retail"].includes(s.job.field) && (s.year >= 2021 || s.year < 1975)));
// Right-to-work states (where joining is optional), roughly as of the 2010s.
const RTW = ["AL", "AZ", "AR", "FL", "GA", "ID", "IN", "IA", "KS", "KY", "LA", "MS", "NE", "NV", "NC", "ND", "OK", "SC", "SD", "TN", "TX", "UT", "VA", "WV", "WI", "WY"];

// ---------- a business of your own ----------
// Who brings the idea and what it is, so the offer reads differently from life to life. Each scene names the
// business (`kind`) and the owner's title (`title`), says who is in it with you (`who`), and gives the question
// (`lead`) and how each answer reads (`goEnd`, `side`, `stake`, `ask`, `stayEnd`).
function startupScenes(s, ctx) {
  const y = s.year, f = pal(s, ctx), who = f.name, field = s.job ? s.job.field : "";
  const co = ctx.person({ role: "coworker", sex: ctx.rng() < 0.5 ? "male" : "female", birthYear: s.birthYear + ctx.rng.int(9) - 4, how: "coworker" });
  const food = y >= 2009 ? "food truck" : y >= 1975 ? "sandwich shop" : "diner";
  const made = ctx.rng.pick(["candles", "quilts", "hand-thrown mugs", "leather wallets", "jars of hot sauce", "dog sweaters"]);
  const craft = y >= 2006 ? "Etsy shop" : y >= 1998 ? "eBay store" : "mail-order business";
  const tech = y >= 1977 && y <= 1990 ? "software company" : y >= 1995 && y <= 2001 ? "dot-com startup" : y >= 2008 && y <= 2022 ? "app startup" : y >= 2023 ? "AI startup" : null;
  const shop = ctx.rng.pick(["hardware store", "bakery", "bookstore", "flower shop", "diner"]);
  const fr = y >= 2008 && y <= 2015 ? "frozen-yogurt franchise" : y >= 2010 ? ctx.rng.pick(["fitness franchise", "sub shop franchise"]) : y >= 1965 ? ctx.rng.pick(["burger franchise", "sub shop franchise", "pizza franchise"]) : "ice cream stand";
  const own = FIELD_SHOP[field] || "consulting business";
  return [
    {
      kind: food, title: `${food} owner`, who, w: 1.2,
      lead: ctx.w(`${cap(who)} wants to open a ${food} {and already has a name for it|and has been testing recipes on everyone you know for a year}, and asked you to go in on it`),
      goEnd: "{On opening day the line went around the block, mostly relatives.|You burned the first batch and nailed the second.}", side: `working the ${food} with ${who} on nights and weekends`, ask: `open a ${food}`,
      stayEnd: `{${cap(who)} said the first meal was on the house anyway.|You promised to be the first customer, and you were.}`,
    },
    {
      kind: craft, title: `${craft} owner`, who: "you", w: 1,
      lead: `The ${made} you make on weekends keep selling out ${y >= 1998 ? "online" : "at craft fairs"}, and ${who} says you could make a real business of it`,
      goEnd: "{The spare room turned into a warehouse of boxes and bubble wrap.|You shipped forty orders the first week and learned the post office staff by name.}", side: `making ${made} after work and shipping orders on your lunch break`, ask: `turn the ${made} into a business`,
      stayEnd: `{You kept making ${made} for friends, which was its own kind of payment.|You still sell a few at the holiday fair every year.}`,
    },
    tech && (hasDegree(s) || field === "tech") && {
      kind: tech, title: `founder of ${an(tech)}`, who: co.call, w: field === "tech" ? 2 : 0.8, tech: true,
      lead: `${co.call}, the smartest ${field === "tech" ? "engineer" : "person"} you know, is quitting to start ${an(tech)} and wants you as cofounder`,
      goEnd: y <= 1990 ? "{You worked out of a garage with a space heater and two computers.|You wrote the business plan on a legal pad at a Denny's at midnight.}" : "{You worked out of a coworking space with free cold brew and no windows.|You pitched investors in borrowed blazers.}", side: `building the ${tech} with ${co.call} on nights and weekends`, ask: `cofound ${an(tech)}`,
      stayEnd: `{You and ${co.call} stayed friends, and you watched the company's news with interest.|${co.call} said the offer stood if you ever changed your mind.}`,
    },
    s.job && field !== "self-employed" && {
      kind: own, title: `owner of ${an(own)}`, who: co.call, w: 1.5,
      lead: `${co.call}, the coworker you trust most, wants to leave and start ${an(own)} of your own, and asked you to come`,
      goEnd: "{Your old boss shook your hand and said, “I'd have done the same.”|You printed business cards and gave out every one at a church pancake breakfast.}", side: `taking the first clients with ${co.call} on evenings and weekends`, ask: `start ${an(own)}`,
      stayEnd: `{You took ${co.call} out for a goodbye lunch.|You inherited half of ${co.call}'s clients at work, which was its own kind of promotion.}`,
    },
    {
      kind: shop, title: `owner of the ${shop}`, who, w: 0.8,
      lead: `The ${shop} on Main Street, open for ${ctx.rng.pick(["thirty", "forty", "fifty"])} years, is for sale: the owner is retiring and would rather sell to someone local, and ${who} wants to buy it with you`,
      goEnd: "{The old owner stayed a month to teach you everything, including which customers to give credit to.|The regulars said it felt exactly the same, which was the highest praise.}", side: `helping ${who} run the ${shop} on Saturdays`, stake: `You put money into the ${shop} with ${who} and kept your job; ${who} ran the place.`, ask: `buy the ${shop}`,
      stayEnd: `{The ${shop} sold to a couple from out of town, and you still shop there.|You bought one last thing from the old owner and wished them well.}`,
    },
    {
      kind: fr, title: `${fr} owner`, who, w: 0.6,
      lead: `${cap(who)} came back from a franchise expo with a binder about opening ${an(fr)} and a very good spreadsheet`,
      goEnd: "{Corporate sent a trainer for two weeks and a lot of laminated rules.|The grand opening had a man in a costume and a line out the door.}", side: `working shifts at the ${fr} with ${who} on weekends`, stake: `You put half the franchise fee into ${who}'s ${fr} and kept your job.`, ask: `open ${an(fr)}`,
      stayEnd: "{You gave back the binder and said you'd stick to being a customer.|You did the math twice and couldn't make the fee work.}",
    },
  ];
}

export const WORK = [
  {
    id: "startupOffer", domain: "career", channel: "change", max: 2, cooldown: 10, ages: [24, 55],
    when: s => working(s) && atHome(s) && s.savings >= 0.8 && !s.arcs.startup && !s.arcs.civil, p: () => 0.015,
    choice: (s, ctx) => {
      const sc = ctx.rng.weighted(startupScenes(s, ctx).filter(Boolean).map(x => [x, x.w ?? 1]));
      const { kind, title } = sc, job = s.job.title;
      const own = sc.who === "you";
      return {
        prompt: `${sc.lead}. You have some savings to fall back on. Do you go for it?`,
        options: [
          { id: "startupOffer.go", label: "Quit and go all in", hint: "your savings on the line", act: "startup", style: "risk", weight: 0.22, apply: (s2, c) => { const put = spend(s2, 1); if (put < 0.6) s2.debt += 0.5; loseJob(s2); s2.unemployedFor = 0; c.arc.start("startup", { kind, title, from: s2.age, who: sc.who, tech: !!sc.tech }, 1); return { text: c.w(`You quit your job as ${an(job)} ${own ? "and" : `and went in with ${sc.who}:`} ${own ? `turned the side project into ${an(kind)}.` : `${an(kind)} of your own.`} ${sc.goEnd}`), mood: 4, big: true }; } },
          { id: "startupOffer.side", label: "Start it on nights and weekends", hint: "keep the paycheck", act: "sideJob", style: "safe", weight: 0.2, apply: (s2, c) => { spend(s2, 0.3); stress(s2, 0.05); c.arc.start("startup", { kind, title, from: s2.age, who: sc.who, side: true, tech: !!sc.tech }, 1); return { text: c.w(`You kept your job and started ${own ? `your ${kind}` : `the ${kind}`} on the side, ${sc.side}, {and slept about five hours a night.|and your lunch breaks disappeared.}`), mood: 2 }; } },
          { id: "startupOffer.invest", label: own ? "Pay someone else to run it" : "Put in money, keep your job", hint: "a stake, not a second job", act: "invest", style: "safe", weight: 0.1, apply: s2 => { spend(s2, 0.5); s2.flags.stake = { kind, at: s2.age, who: own ? "a friend" : sc.who }; return { text: sc.stake || (own ? `You put money into the ${kind} and hired a friend to run it, and went back to your day job.` : `You put money into ${sc.who}'s ${kind} as a silent partner and kept your job.`), mood: 1 }; } },
          { id: "startupOffer.learn", label: "Take a small-business class first", hint: "learn the numbers", act: "study", style: "learn", weight: 0.05, when: s2 => !s2.arcs.study, apply: (s2, c) => { c.arc.start("study", { kind: "a small-business class at the community college", from: s2.age, biz: kind }, 1); return { text: `You wanted to learn the numbers first, so you signed up for a small-business class at the community college, writing a plan for ${an(kind)} as your class project.`, mood: 1 }; } },
          { id: "startupOffer.stay", label: "Keep your job", hint: "a steady check is a beautiful thing", act: "wait", style: "safe", weight: 0.43, apply: (s2, c) => ({ text: c.w(`You thought about it for a long time and decided not to ${sc.ask}. ${sc.stayEnd}`), mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "startupYear1", domain: "wealth", channel: "change", ages: [18, 80], when: (s, ctx) => ctx.arc.at("startup", "start"), p: () => 1,
    choice: (s, ctx) => {
      const a = s.arcs.startup.data, kind = a.kind || "business", side = !!a.side && s.employed;
      const busy = ctx.roll("wealth", "good", 0.45), truck = /truck|diner|sandwich|restaurant|bakery|franchise|coffee/.test(kind), tech = a.tech || /startup|software|app/.test(kind);
      const lead = busy
        ? (tech ? `A year into the ${kind}, people are signing up faster than you can handle, and the bank account still says five months.` : truck ? `A year into the ${kind}, the lunch line is long and you are working eighty-hour weeks, short-handed.` : `A year into the ${kind}, business is better than you hoped, and you are exhausted and behind on everything.`)
        : (tech ? `A year into the ${kind}, a few users love it, nobody else has noticed, and the money runs out in five months.` : `A year into the ${kind}, the regulars love it, the rest of town hasn't noticed, and every month burns a little more of your savings.`);
      const go = (s2, push, text, mood = 1) => { a.push = (a.push || 0) + push; ctx.arc.go("startup", "year2", 1); s2.unemployedFor = 0; return { text: ctx.w(text), mood }; };
      const grow = busy ? (tech ? "Raise money from investors" : truck ? (/truck/.test(kind) ? "Buy a second truck" : "Open a second location") : "Rent space and hire help") : (s.year >= 2010 ? "Spend on online ads" : s.year >= 1995 ? "Build a website and buy ads" : "Buy ads in the paper");
      const pivot = tech ? "sell to businesses instead" : truck ? "add catering for offices and weddings" : "sell wholesale to shops";
      return {
        prompt: `${lead} What now?`,
        options: [
          { id: "startupYear1.grow", label: grow, hint: "put more in", act: "invest", style: "risk", weight: busy ? 0.35 : 0.2, apply: s2 => { s2.debt += busy ? 0.6 : 0.3; return go(s2, busy ? 0.25 : 0.12, `With the ${kind} a year old, you decided to ${grow.toLowerCase()}, {signing papers you read three times.|and lay awake doing math at night.}`, 1); } },
          { id: "startupYear1.hold", label: "Keep it steady", hint: "no new risks", act: "pushThrough", style: "safe", weight: 0.3, apply: s2 => go(s2, 0.05, `With the ${kind} a year old, you kept it steady, {putting everything into the people who already loved it.|fixing what was broken before adding anything new.}`, 0) },
          { id: "startupYear1.pivot", label: `Change course: ${pivot}`, hint: "a different bet", act: "careerSwitch", style: "learn", weight: busy ? 0.07 : 0.2, apply: s2 => go(s2, 0.1, `With the ${kind} a year old, you changed course to ${pivot}, {and the first new customer called within a week.|which meant a month of rebuilding everything.}`, 1) },
          side
            ? { id: "startupYear1.full", label: "Quit your day job and go full-time", hint: "the leap", act: "startup", style: "risk", weight: busy ? 0.2 : 0.1, apply: s2 => { loseJob(s2); s2.unemployedFor = 0; a.side = false; return go(s2, 0.15, `With the ${kind} a year old, you quit your day job to run it full-time, {and the first Monday felt like jumping off a dock.|and your old coworkers bought you a cake shaped like a cash register.}`, 2); } }
            : { id: "startupYear1.full", label: tech ? "Bring in a cofounder with money" : "Take on a partner with money", hint: "less yours, more runway", act: "negotiate", style: "social", weight: busy ? 0.2 : 0.1, apply: s2 => { s2.savings += 0.3; return go(s2, 0.08, `With the ${kind} a year old, you took on a partner who brought money and a calm head, {and gave up a third of it, gladly.|and finally took a weekend off.}`, 1); } },
          { id: "startupYear1.close", label: "Close it while you can", hint: "cut your losses", act: "quitJob", style: "safe", weight: busy ? 0.08 : 0.2, apply: s2 => { ctx.arc.end("startup", "closed"); spend(s2, 0.2); if (!s2.employed) loseJob(s2); return { text: ctx.w(`After a year you closed the ${kind} while the losses were still small. {You sold the equipment to a young couple starting their own.|On the last day you gave away everything that was left.}${side ? " Your day job was still there, thank goodness." : ""}`), mood: -4 }; } },
        ],
        // A written answer moves the story on too: giving up closes the business, anything else carries on.
        onFree: (id, s2) => { if (["quitJob", "jobSearch", "jobHop", "careerSwitch", "civilService", "sellAsset", "retire", "workAbroad", "emigrate"].includes(id)) { ctx.arc.end("startup", "closed"); if (!s2.employed) loseJob(s2); } else { ctx.arc.go("startup", "year2", 1); s2.unemployedFor = 0; } },
      };
    },
  },
  {
    id: "startupYear2", domain: "wealth", channel: "change", ages: [18, 80], when: (s, ctx) => ctx.arc.at("startup", "year2"), p: () => 1,
    apply: (s, ctx) => {
      const a = s.arcs.startup.data, kind = a.kind || "business", tech = a.tech || /startup|software|app/.test(kind);
      const title = a.title || `owner of ${an(kind)}`;
      if (ctx.roll("wealth", "good", 0.35 + (a.push || 0))) {
        ctx.arc.end("startup", "success");
        startJob(s, ctx, [title, tech ? 2.2 : 1.5, "self-employed", 1]);
        s.savings += tech ? 2.5 : 1.2; s.career = Math.min(5, s.career + 1);
        if (tech && ctx.rng() < 0.3) { s.savings += 3; return { text: ctx.w(`The ${kind} took off, and a bigger company bought it. {You read the offer letter in the parking lot and called home shaking.|You stayed on to run your old team, now with a lot of stock.}`), mood: 12, big: true }; }
        return { text: ctx.w(`{You made it through the hardest years, and|Word of mouth did what ads never could, and} the ${kind} {turned a real profit.|started paying you a real salary.|became the place people in town recommend.} {You hung the first dollar you ever made behind the register.|You finally took a vacation, and it ran fine without you.}`), mood: 10, big: true };
      }
      ctx.arc.end("startup", "failed");
      spend(s, 0.8);
      if (s.employed && a.side) return { text: ctx.w(`The ${kind} couldn't make it, and you closed it. {Thank goodness you never quit your day job; the losses got paid down slowly.|You kept the sign in your garage.}`), mood: -5 };
      loseJob(s);
      return { text: ctx.w(`The ${kind} couldn't make it, and you closed it {with some debt and a lot of lessons.|on a rainy Saturday, and your regulars came to say goodbye.} {It was the hardest thing you'd ever done, and you'd never regret trying.|You slept for a week, then started looking for work.}`), mood: -10, big: true };
    },
  },
  {
    id: "w_stake", once: true, domain: "wealth", channel: "change", ages: [25, 80], when: s => s.flags.stake && s.age - s.flags.stake.at >= 3, p: () => 0.5,
    apply: (s, ctx) => {
      const { kind, who } = s.flags.stake;
      if (ctx.roll("wealth", "good", 0.4)) { s.savings += 1.2; return { text: ctx.w(`The ${kind} you put money into with ${who} {turned a profit, and the checks started coming.|paid you back twice over.} {You framed the first one.|You bought ${who} dinner.}`), mood: 6 }; }
      return { text: ctx.w(`The ${kind} you put money into with ${who} closed, and your money went with it. {You stayed friends, which was worth more.|You still have a coffee mug with the logo.}`), mood: -4 };
    },
  },

  // ---------- side hustles, by era ----------
  {
    id: "w_sideHustle", domain: "wealth", channel: "good", max: 2, cooldown: 8, ages: [19, 60], when: s => working(s) && atHome(s) && !s.arcs.hustle && !s.arcs.startup, p: () => 0.02,
    choice: (s, ctx) => {
      const y = s.year;
      const gig = y >= 2014 ? ["Drive for Uber and DoorDash", "driving for the apps"] : y >= 2012 ? ["Drive for a ride-share app", "driving for a ride-share app"] : y >= 1975 ? ["Deliver pizzas on weekends", "delivering pizzas on weekends"] : ["Drive a cab on weekends", "driving a cab on weekends"];
      const make = y >= 2006 ? ["Sell what you make on Etsy", "selling what you make on Etsy"] : y >= 1997 ? ["Sell on eBay", "selling on eBay"] : ["Sell crafts at fairs and flea markets", "selling crafts at fairs"];
      const skill = y >= 2015 ? ["Freelance online", "freelancing online"] : ["Freelance on the side", "freelancing on the side"];
      const party = y >= 2010 ? ["Rent out your spare room", "renting out your spare room", false] : y >= 1985 ? ["Join a friend's multi-level marketing business", "selling for a multi-level marketing company", true] : ["Host home parties selling kitchenware", "hosting kitchenware parties", false];
      const lead = scene(ctx, [
        `${s.kids && s.kids.length ? "The kids need braces, the car needs tires," : "Rent went up again,"} and your paycheck isn't keeping up.`,
        `A coworker makes an extra ${usd(y, 800)} a month on the side and won't stop talking about it.`,
        "You have a few free evenings a week and a savings account that could use them.",
      ]);
      const start = (s2, c, k, desc, mlm, text) => { s2.income *= 1.05; stress(s2, 0.05); c.arc.start("hustle", { kind: k, desc, mlm, from: s2.age }, 2); return { text: c.w(text), mood: 1 }; };
      return {
        prompt: `${lead} Do you pick up a side hustle?`,
        options: [
          { id: "w_sideHustle.gig", label: gig[0], hint: "your own hours, your own car", act: "sideJob", style: "safe", weight: 0.3, apply: (s2, c) => start(s2, c, "gig", gig[1], false, `You started ${gig[1]}, {learning every shortcut in town,|with a phone mount and a bag of mints for passengers,|listening to audiobooks between runs,} and the extra money covered the bills that kept you up at night.`) },
          { id: "w_sideHustle.make", label: make[0], hint: "the thing you're good at", act: "startup", style: "learn", weight: 0.2, apply: (s2, c) => start(s2, c, "make", make[1], false, `You started ${make[1]}: {candles, then soap, then a waiting list|refurbished furniture you found on the curb|vintage clothes you hunted down on weekends}, {and your living room became a shipping department.|and the first sale to a stranger felt like magic.}`) },
          { id: "w_sideHustle.skill", label: skill[0], hint: s.job ? `be ${an(s.job.title)} for yourself` : "sell your skills", act: "sideJob", style: "learn", weight: 0.2, apply: (s2, c) => start(s2, c, "skill", skill[1], false, `You started ${skill[1]}, {doing for clients at night what you did all day at work,|tutoring, bookkeeping, a little of everything,} {and your rates went up twice the first year.|and found out you liked being your own boss.}`) },
          { id: "w_sideHustle.party", label: party[0], hint: party[2] ? "your friend swears it works" : "money from what you already have", act: party[2] ? "invest" : "sideJob", style: "risk", weight: 0.1, apply: (s2, c) => { if (party[2]) spend(s2, 0.05); return start(s2, c, "party", party[1], party[2], party[2] ? `You started ${party[1]}, {buying a starter kit and a stack of brochures,|calling everyone in your phone, including your dentist,} and {your aunt bought something out of pity.|your garage filled up with inventory.}` : `You started ${party[1]}, {and met people from all over the world at your kitchen table.|and learned more about strangers' habits than you ever wanted to know.}`); } },
          { id: "w_sideHustle.no", label: "No. Your evenings are yours", hint: "rest is worth something", act: "rest", style: "self", weight: 0.2, apply: () => ({ text: "You decided not to pick up a side hustle. Your evenings were for dinner, a walk and the people you loved, and you made the budget work another way.", mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "w_hustleYear", domain: "wealth", channel: "change", ages: [19, 80], when: (s, ctx) => ctx.arc.at("hustle", "start"), p: () => 1,
    choice: (s, ctx) => {
      const a = s.arcs.hustle.data, good = ctx.roll("wealth", "good", a.mlm ? 0.15 : 0.4), desc = a.desc || "your side hustle";
      const biz = a.kind === "make" ? (s.year >= 2006 ? "online shop" : "craft business") : a.kind === "skill" ? "consulting business" : a.kind === "gig" ? "delivery business" : "small business";
      const end = (out, text, mood) => { ctx.arc.end("hustle", out); return { text: ctx.w(text), mood }; };
      return {
        prompt: good ? `After two years of ${desc}, the side money is almost a second paycheck. What now?` : `After two years of ${desc}, it eats your evenings and pays for about half a tank of gas. What now?`,
        options: [
          { id: "w_hustleYear.business", label: `Make it a full-time ${biz}`, hint: "quit the day job", act: "startup", style: "risk", weight: good ? 0.2 : 0.05, when: s2 => !s2.arcs.startup, apply: s2 => { ctx.arc.end("hustle", "business"); loseJob(s2); s2.unemployedFor = 0; ctx.arc.start("startup", { kind: biz, title: `owner of ${an(biz)}`, from: s2.age, push: good ? 0.15 : 0 }, 1); return { text: ctx.w(`After two years of ${desc}, you quit your day job to make it a full-time ${biz}, {and your coworkers threw you a goodbye party with a cake that said “Boss.”|and the first morning you didn't set an alarm, then woke at six anyway.}`), mood: 4, big: true }; } },
          { id: "w_hustleYear.keep", label: "Keep it on the side", hint: "a nice cushion", act: "sideJob", style: "safe", weight: good ? 0.35 : 0.25, apply: s2 => { s2.savings += good ? 0.3 : 0.05; return end("kept", good ? `After two years of ${desc}, you kept it as a side thing, {and it paid for a family vacation every summer.|and the extra money became the emergency fund you'd never had.}` : `After two years of ${desc}, you kept at it a few nights a month, mostly out of habit.`, 1); } },
          { id: "w_hustleYear.raise", label: good ? "Raise your prices" : "Get pickier about it", hint: "less work, more money", act: "negotiate", style: "learn", weight: good ? 0.15 : 0.1, apply: s2 => { s2.savings += good ? 0.2 : 0.05; return end("kept", good ? `After two years of ${desc}, you raised your prices, lost the worst customers and kept the best, {and made more money in fewer hours.|and wondered why you hadn't done it sooner.}` : `After two years of ${desc}, you got picky, cut everything that didn't pay, and kept only the best of it.`, 2); } },
          { id: "w_hustleYear.quit", label: "Give it up and get your evenings back", hint: "enough", act: "rest", style: "health", weight: good ? 0.2 : 0.5, apply: s2 => { stress(s2, -0.05); return end("quit", a.mlm ? `After two years of ${desc}, you quit, sold the leftover inventory at a yard sale, and apologized to your aunt.` : `After two years of ${desc}, you gave it up {and had dinner with your family every night that week.|and slept like a stone.}`, 1); } },
          { id: "w_hustleYear.family", label: "Bring the family in on it", hint: "everyone pitches in", act: "familyBusiness", style: "family", weight: 0.1, apply: s2 => { s2.savings += 0.15; return end("family", `After two years of ${desc}, you brought the family in, {and the kids learned to make change and keep a ledger.|and ${s2.rel === "married" && s2.partner ? s2.partner.call : "your sister"} turned out to be better at it than you.|and Sunday afternoons became a team sport.}`, 2); } },
        ],
        onFree: (id, s2) => { if (id === "startup" && !s2.arcs.startup) { ctx.arc.end("hustle", "business"); ctx.arc.start("startup", { kind: biz, from: s2.age }, 1); } else ctx.arc.end("hustle", id === "quitJob" || id === "rest" ? "quit" : "kept"); },
      };
    },
  },

  // ---------- school at night ----------
  {
    // Rare on purpose: a finished degree raises s.edu, and bachelor's attainment by cohort is calibrated.
    id: "w_backToSchool", domain: "study", channel: "good", once: true, ages: [24, 50],
    when: s => working(s) && atHome(s) && !s.studying && ["high", "ged", "certificate", "associate"].includes(s.edu) && !s.flags.nightSchool && !s.flags.nightDegree && !s.arcs.study, p: () => 0.005,
    choice: (s, ctx) => {
      const y = s.year, kid = (s.kids || []).find(k => k.age >= 7 && k.age <= 17);
      const lead = scene(ctx, [
        `Every job posting you want says “bachelor's degree required,” and you're tired of being ${s.edu === "associate" ? "halfway there" : "screened out"}.`,
        "Your company offers tuition help for employees, and a flyer about it has been on the break room wall for a year.",
        kid ? `${kid.call} asked why you never finished college, and you didn't have a good answer.` : null,
        "A coworker ten years younger got the promotion you wanted. She has a degree; you have more experience.",
        y >= 2010 ? "An ad for an online degree for working adults keeps following you around the internet." : null,
      ]);
      const online = y >= 1998 ? "Enroll in an online degree program" : "Sign up for weekend college";
      const go = (s2, kind, text, extra = {}) => { s2.flags.nightSchool = { from: s2.age, kind, ...extra }; return { text: ctx.w(text), mood: 2 }; };
      return {
        prompt: `${lead} Do you go back to school?`,
        options: [
          { id: "w_backToSchool.night", label: "Take night classes at the state college", hint: "two nights a week, for years", act: "study", style: "learn", weight: 0.3, apply: s2 => { spend(s2, 0.1); return go(s2, "night", "You enrolled in night classes at the state college, {two evenings a week after work,|with a backpack that felt ridiculous at your age and then didn't,} {sitting next to a retired mailman and a nineteen-year-old.|and the first A felt better than any raise.}"); } },
          { id: "w_backToSchool.online", label: online, hint: y >= 1998 ? "classes after the kids are asleep" : "Saturdays on campus", act: "study", style: "safe", weight: 0.2, apply: s2 => { spend(s2, 0.1); return go(s2, y >= 1998 ? "online" : "weekend", y >= 1998 ? "You enrolled in an online degree program, {doing coursework at the kitchen table after everyone was asleep,|logging in from your lunch break,} and learned to love a discussion board more than you'd admit." : "You signed up for weekend college, {spending every Saturday on campus with other working adults,|with a thermos of coffee and a stack of library books,} and it was hard and it was yours."); } },
          { id: "w_backToSchool.employer", label: "Get your company to pay for it", hint: "tuition help, if they say yes", act: "negotiate", style: "social", weight: 0.15, apply: (s2, c) => (c.roll("career", "good", 0.55) ? go(s2, "night", "You asked about tuition help at work, and your company agreed to pay for most of it if you stayed two more years. You started night classes that fall.", { paid: true }) : (() => { spend(s2, 0.1); return go(s2, "night", "You asked about tuition help, and work said the budget was frozen. You signed up for night classes anyway and paid your own way."); })()) },
          { id: "w_backToSchool.cert", label: "Get a shorter certificate instead", hint: "a year, a skill, a raise", act: "study", style: "safe", weight: 0.1, when: s2 => !s2.arcs.study, apply: (s2, c) => { spend(s2, 0.05); c.arc.start("study", { kind: c.rng.pick(["a certificate program in project management", "a certificate program in medical billing", "a welding certificate", "a certificate in bookkeeping", "an IT certification"]), from: s2.age, cert: true }, 1); return { text: "Instead of a whole degree, you signed up for a one-year certificate program at the community college, three nights a week.", mood: 1 }; } },
          { id: "w_backToSchool.no", label: "Not now. Life is full", hint: "maybe later", act: "wait", style: "family", weight: 0.25, apply: () => ({ text: "You thought about going back to school and decided your life was too full right now. You kept the course catalog in a drawer.", mood: 0 }) },
        ],
      };
    },
  },
  {
    // The middle of night school: core.js ccDone ("work, and keep taking classes at night") and w_backToSchool both
    // lead here two years in.
    id: "w_nightMid", domain: "study", channel: "change", ages: [19, 75], when: s => s.flags.nightSchool && !s.flags.nightSchool.mid && s.age >= (s.flags.nightSchool.from ?? s.age) + 2, p: () => 1,
    choice: (s, ctx) => {
      const ns = s.flags.nightSchool, kid = (s.kids || []).find(k => k.age <= 12);
      const [lead, then] = scene(ctx, [
        ["You're halfway to a bachelor's degree at night, running on coffee and the parking lot's vending machine.", "Halfway through night school,"],
        [kid ? `${kid.call} keeps asking why you're always at "your school," and you missed another bedtime.` : "You fell asleep in class last Tuesday, and the professor let you.", "Two years into night school and very tired,"],
        [s.employed ? "Work is busier than ever, and the semester's two hardest classes are coming up." : "You lost your job, which gives you time for class and no money for tuition.", "Two years into night school,"],
      ]);
      const mid = extra => { Object.assign(ns, { mid: true, midAt: s.age }, extra); };
      return {
        prompt: `${lead} Do you keep going?`,
        options: [
          { id: "w_nightMid.keep", label: "Keep going, one class at a time", hint: "slow is still moving", act: "pushThrough", style: "safe", weight: 0.4, apply: s2 => { mid({}); stress(s2, 0.03); return { text: ctx.w(`${then} you kept going, one class at a time, {doing reading on the bus|writing papers in the car at lunch}, and crossed off every semester on a calendar on the fridge.`), mood: 1 }; } },
          { id: "w_nightMid.speed", label: "Take a full load and finish sooner", hint: "one brutal year", act: "study", style: "risk", weight: 0.12, apply: s2 => { mid({ fast: true }); stress(s2, 0.08); return { text: `${then} you doubled up and took a full load, and for one year you did nothing but work, class and sleep, in that order.`, mood: -1 }; } },
          { id: "w_nightMid.online", label: s.year >= 1998 ? "Switch to online classes" : "Switch to weekend classes", hint: "more flexible", act: "study", style: "learn", weight: 0.15, apply: s2 => { mid({ kind: s2.year >= 1998 ? "online" : "weekend" }); return { text: s2.year >= 1998 ? `${then} you switched to online classes and did your coursework after everyone was asleep, which turned out to suit you.` : `${then} you switched to weekend classes, giving up your Saturdays but getting your weeknights back.`, mood: 1 }; } },
          { id: "w_nightMid.pause", label: "Put it on hold for a while", hint: "the credits keep", act: "wait", style: "family", weight: 0.18, apply: s2 => { mid({ paused: true }); return { text: `${then} you put school on hold for a couple of years to breathe, telling yourself the credits would keep. They did.`, mood: 0 }; } },
          { id: "w_nightMid.quit", label: "Stop for good", hint: "you know enough", act: "avoid", style: "self", weight: 0.15, apply: s2 => { delete s2.flags.nightSchool; s2.flags.nightSchoolLeft = s2.age; return { text: `${then} you stopped for good. You had learned what you needed, you told yourself, and you got your evenings back.`, mood: -1 }; } },
        ],
        onFree: (id, s2) => { if (["quitJob", "avoid", "rest", "retire"].includes(id)) { delete s2.flags.nightSchool; s2.flags.nightSchoolLeft = s2.age; } else mid({}); },
      };
    },
  },
  {
    id: "w_nightDone", domain: "study", channel: "good", ages: [20, 80],
    when: s => { const ns = s.flags.nightSchool; return !!ns && ns.mid && s.age >= (ns.from ?? s.age) + (ns.fast ? 3 : 4) + (ns.paused ? 2 : 0); }, p: () => 1,
    apply: (s, ctx) => {
      const ns = s.flags.nightSchool, years = s.age - (ns.from ?? s.age), online = ns.kind === "online";
      delete s.flags.nightSchool; s.flags.nightDegree = s.age;
      raiseEdu(s, "bachelor");
      if (s.employed) { s.income *= 1.08; if (ctx.roll("career", "good", 0.5)) s.career = Math.min(5, s.career + 1); }
      const crowd = (s.kids || []).length ? "your kids in the bleachers holding a sign" : s.rel === "married" && s.partner ? `${s.partner.call} cheering from the bleachers` : "your family yelling your name";
      return { text: ctx.w([`After ${years} years of ${online ? "late nights at the laptop" : "night classes"}, you walked across the stage at ${s.age} to get your bachelor's degree, with ${crowd}.`, `You finished your bachelor's degree at ${s.age}, ${years} years after you started, {and hung the diploma where you'd see it every morning.|and your mother framed a copy of her own.|and took the whole family out for pancakes in your cap and gown.}`, `{The registrar's letter came on a Tuesday:|At ${s.age}, finally:} a bachelor's degree, earned ${online ? "online, one late night at a time" : "at night, one class at a time"}. {You cried in the car.|Your coworkers decorated your desk.}`]), mood: 9, big: true };
    },
  },
  {
    // Closes the "study" arc that act.js opens for a written answer (and the class above): a certificate, a
    // master's, a few night classes.
    id: "w_studyDone", domain: "study", channel: "good", ages: [14, 90], when: (s, ctx) => ctx.arc.at("study", "start"), p: () => 1,
    apply: (s, ctx) => {
      const a = s.arcs.study.data, kind = a.kind || "the program", long = s.age - (a.from ?? s.age) >= 2;
      ctx.arc.end("study", "done");
      if (/master|MBA/i.test(kind) && hasDegree(s)) raiseEdu(s, "master");
      else if (a.cert || /certificate|certification/i.test(kind)) raiseEdu(s, "certificate");
      else if (long && /online degree|night school|community college/i.test(kind)) raiseEdu(s, "associate");
      if (a.biz) return { text: ctx.w(`You finished ${kind}, and the business plan you wrote for ${an(a.biz)} {got an A and went into a drawer, ready.|made you see exactly where the money would go, and where it wouldn't.}`), mood: 3 };
      if (s.employed && ctx.roll("career", "good", 0.5)) { s.income *= 1.08; s.career = Math.min(5, s.career + 1); return { text: ctx.w(`You finished ${kind}, {and put the certificate up at your desk.|and used what you learned at work the very next week.} {Your boss noticed, and so did your paycheck.|A promotion followed that spring.}`), mood: 6 }; }
      if (!s.employed && s.done.has("firstJob") && !s.retired && ctx.roll("career", "good", 0.6)) return { text: ctx.w("You finished {kind}, and it got you hired as {aTitle}.", { kind, aTitle: an(startJob(s, ctx)) }), mood: 6 };
      return { text: ctx.w(`You finished ${kind}. {Nothing changed right away, but you felt steadier.|It was a lot of tired evenings, and you were proud of every one.}`), mood: 3 };
    },
  },

  // ---------- a government job ----------
  {
    id: "w_civilOffer", domain: "career", channel: "good", once: true, ages: [20, 45],
    when: s => atHome(s) && !s.studying && !inService(s) && !s.arcs.civil && !s.arcs.startup && !s.retired && (!s.job || !["government", "public safety"].includes(s.job.field)), p: () => 0.006,
    choice: (s, ctx) => {
      const y = s.year, f = pal(s, ctx, "a friend from church");
      const lead = scene(ctx, [
        y < 2000 ? "The post office is hiring, and the next civil service exam is in the spring." : `A federal job listing on USAJOBS caught your eye: a pension, real health insurance, and an exam to get in.`,
        "The city posted openings for police officers and firefighters, with a written test in March and a physical after.",
        `${cap(f.name)}, who works for the county, says the benefits are the best in town and the exam is coming up.`,
      ]);
      const start = (s2, c, data, text) => { c.arc.start("civil", { tries: 0, ...data }, 1); return { text: c.w(text), mood: 1 }; };
      return {
        prompt: `${lead} Do you go for a government job?`,
        options: [
          { id: "w_civilOffer.study", label: "Sign up and study at night", hint: "keep your job meanwhile", act: "civilService", style: "safe", weight: 0.35, apply: (s2, c) => start(s2, c, { quit: false }, "You signed up for the civil service exam and {studied a practice book every night after dinner.|took the practice tests on your lunch break.}") },
          { id: "w_civilOffer.quit", label: "Quit and study full-time", hint: "all in", act: "civilService", style: "risk", weight: 0.1, when: s2 => s2.employed, apply: (s2, c) => { loseJob(s2); s2.unemployedFor = 0; return start(s2, c, { quit: true }, "You quit your job to study full-time for the civil service exam, {at the library from nine to five, like a job.|with flash cards taped all over the bathroom mirror.}"); } },
          { id: "w_civilOffer.prep", label: "Take a prep course", hint: "a classroom and a coach", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => { spend(s2, 0.05); return start(s2, c, { prep: true }, "You paid for a prep course for the civil service exam, {in a strip-mall classroom on Tuesday nights,|with an instructor who had taken it nine times and knew every trick.}"); } },
          { id: "w_civilOffer.ask", label: "Ask someone who works there first", hint: "what's it really like?", act: "talk", style: "social", weight: 0.15, apply: (s2, c) => (c.rng() < 0.55 ? start(s2, c, { quit: false }, `You asked ${f.name} what the job was really like, heard "boring and steady and good," and signed up for the exam.`) : { text: `You asked ${f.name} what the job was really like, and decided the paperwork and the pace weren't for you.`, mood: 0 }) },
          { id: "w_civilOffer.no", label: "Not for you", hint: "you'd rather stay where you are", act: "wait", style: "self", weight: 0.25, apply: () => ({ text: "You thought about the government job, the pension and the exam, and decided you'd rather stay on the path you were on.", mood: 0 }) },
        ],
      };
    },
  },
  {
    // The exam: a pass brings the offers to choose from; a miss, the question of trying again.
    id: "civilExam", domain: "career", channel: "good", ages: [18, 70], when: (s, ctx) => ctx.arc.at("civil", "start"), p: () => 1,
    choice: (s, ctx) => {
      const a = s.arcs.civil.data;
      a.tries = (a.tries || 0) + 1;
      const pass = ctx.roll("career", "good", Math.min(0.75, 0.25 + 0.1 * a.tries + (a.prep ? 0.1 : 0)));
      const tryWord = a.tries > 1 ? ` on try number ${a.tries}` : "";
      if (pass) {
        const take = (job, text) => s2 => { ctx.arc.end("civil", "passed"); startJob(s2, ctx, job); s2.studying = false; return { text: ctx.w(text), mood: 8, big: true }; };
        const mail = s.year < 1971 ? "the Post Office" : "the Postal Service";
        return {
          prompt: `You passed the civil service exam${tryWord}, and the offers came. Which job do you take?`,
          options: [
            { id: "civilExam.mail", label: "Mail carrier", hint: "your own route, all weather", act: "civilService", style: "safe", weight: 0.25, apply: take(["mail carrier", 0.97, "government", 3], `After passing the exam${tryWord}, you went to work for ${mail} as a mail carrier, {with a route of four hundred houses and a dog at every fifth one.|and learned every street in your part of town.}`) },
            { id: "civilExam.clerk", label: "County clerk", hint: "a desk, a pension", act: "civilService", style: "safe", weight: 0.25, apply: take(["county clerk", 0.9, "government", 10], `After passing the exam${tryWord}, you started as a county clerk, {stamping things that mattered to people's lives,|helping people at the counter on the worst and best days of their lives,} with a pension plan and every federal holiday off.`) },
            { id: "civilExam.police", label: "Police academy", hint: "the academy first", act: "civilService", style: "risk", weight: 0.17, when: s2 => s2.age >= 21 && s2.age <= 40, apply: take(["police officer", 1.29, "public safety", 10], `After passing the exam${tryWord}, you went through the police academy, {running in formation at dawn,|learning the law and the radio codes,} and pinned on a badge at a ceremony your family drove three hours to see.`) },
            { id: "civilExam.fire", label: "Firefighter", hint: "the station, the truck", act: "civilService", style: "health", weight: 0.12, when: s2 => s2.age <= 35, apply: take(["firefighter", 0.98, "public safety", 1], `After passing the written test and the physical${tryWord}, you joined the fire department, {and learned to cook for twelve at the station.|and the first call you rode on, your hands shook and your training held.}`) },
            { id: "civilExam.federal", label: "Federal analyst", hint: "a federal building, a GS number", act: "civilService", style: "learn", weight: 0.11, when: s2 => hasDegree(s2), apply: take(["federal program analyst", 1.4, "government", 10], `After passing the exam${tryWord}, you took a federal job as a program analyst, {with a badge, a cubicle and a pension,|and learned a whole language of acronyms.}`) },
            { id: "civilExam.decline", label: "Turn them down after all", hint: "it was good to know you could", act: "wait", style: "self", weight: 0.1, apply: s2 => { ctx.arc.end("civil", "declined"); return { text: `You passed the civil service exam${tryWord}, and then turned the offers down. It was good to know you could.`, mood: 2 }; } },
          ],
          onFree: (id, s2) => { ctx.arc.end("civil", "passed"); if (["civilService", "jobSearch", "careerSwitch", "pushThrough"].includes(id)) startJob(s2, ctx, ["county clerk", 0.9, "government", 10]); },
        };
      }
      const again = a.tries < 3;
      return {
        prompt: `The exam results came: you missed the cutoff by a few points${tryWord}. Do you try again?`,
        options: [
          { id: "civilExam.again", label: "Try again next year", hint: "so close", act: "civilService", style: "risk", weight: again ? 0.4 : 0.15, apply: () => { ctx.arc.go("civil", "start", 1); return { text: `You missed the civil service cutoff by a few points${tryWord}, wrote down every question you got wrong, and signed up again for next year.`, mood: -3 }; } },
          { id: "civilExam.prep", label: "Take a prep course this time", hint: "do it differently", act: "study", style: "learn", weight: 0.15, apply: s2 => { spend(s2, 0.05); a.prep = true; ctx.arc.go("civil", "start", 1); return { text: `You missed the civil service cutoff${tryWord}, so you paid for a prep course and studied with people who had passed.`, mood: -2 }; } },
          { id: "civilExam.work", label: "Work while you study", hint: "money coming in", act: "jobSearch", style: "safe", weight: 0.2, apply: s2 => { if (!s2.employed && !s2.retired) startJob(s2, ctx); ctx.arc.go("civil", "start", 1); return { text: `You missed the civil service cutoff${tryWord}, ${s2.employed ? "kept working" : "found work in the meantime"}, and studied on nights and weekends for the next one.`, mood: -2 }; } },
          { id: "civilExam.other", label: "Try a different exam", hint: "better odds elsewhere", act: "civilService", style: "safe", weight: again ? 0.1 : 0.05, apply: () => { ctx.arc.go("civil", "start", 1); return { text: `You missed the cutoff${tryWord}, looked at which exams had the most openings, and signed up for a different one.`, mood: -2 }; } },
          { id: "civilExam.quit", label: "Let it go", hint: "another path", act: "jobSearch", style: "safe", weight: again ? 0.15 : 0.45, apply: () => { ctx.arc.end("civil", "gaveUp"); return { text: `You missed the civil service cutoff${tryWord} and decided to let it go. There were other paths, and you took one.`, mood: -3 }; } },
        ],
        // A written answer: studying on (or waiting) means another try next year; anything else lets it go.
        onFree: id => (["civilService", "study", "pushThrough", "wait", "sideJob", "rest", "spiritual"].includes(id) ? ctx.arc.go("civil", "start", 1) : ctx.arc.end("civil", "gaveUp")),
      };
    },
  },

  // ---------- a second career ----------
  {
    id: "w_careerChange", domain: "career", channel: "change", once: true, ages: [30, 45],
    when: s => working(s) && atHome(s) && !s.arcs.switch && !s.arcs.startup && !s.arcs.study, p: () => 0.012,
    choice: (s, ctx) => {
      const y = s.year, job = s.job.title, field = s.job.field;
      const lead = scene(ctx, [
        `You've been ${an(job)} for years, and Sunday nights feel like dread.`,
        s.mother.alive || s.father.alive ? `When ${s.mother.alive ? "Mom" : "Dad"} was in the hospital, you watched the nurses and thought, “I could do that.”` : "When a friend was in the hospital, you watched the nurses and thought, “I could do that.”",
        y >= 2013 ? "A friend left her office job for a coding bootcamp and now makes more than you, and won't stop talking about it." : `A friend changed careers at ${s.age + 2} and says it was the best thing he ever did.`,
        ["manufacturing", "retail", "media", "office"].includes(field) ? `Your industry keeps shrinking, and ${an(job)} at ${s.age} has to think about what's next.` : null,
        (s.kids || []).some(k => k.age >= 6 && k.age <= 14) ? "You coached your kid's team and helped with homework all year, and lit up in a way you never do at work." : null,
      ]);
      const begin = (s2, c, to, years, text, extra) => { c.arc.start("switch", { to, from: s2.age, old: job, years, boost: 0 }, 1); if (extra) extra(s2); return { text: c.w(text), mood: 3, big: true }; };
      const code = y >= 2012 ? ["Do a coding bootcamp", "nights and weekends, twelve weeks of code"] : ["Learn programming at night", "a community college course, then another"];
      return {
        prompt: `${lead} Do you change careers?`,
        options: [
          { id: "w_careerChange.nurse", label: "Go back to school for nursing", hint: "two years of science and clinicals", act: "careerSwitch", style: "family", weight: 0.18, when: s2 => !/nurse/i.test(s2.job.title), apply: (s2, c) => begin(s2, c, "nurse", 2, `You enrolled in ${hasDegree(s2) ? "an accelerated nursing program" : "the nursing program at the community college"} at ${s2.age}, {cutting back your hours at work,|the oldest one in anatomy lab,} {with a used stethoscope ${s2.year >= 1998 ? "from eBay" : "from a classified ad"} and a lot of nerve.|and bought your first pair of scrubs.}`, s3 => { s3.income *= 0.75; spend(s3, 0.1); }) },
          { id: "w_careerChange.code", label: code[0], hint: code[1], act: "careerSwitch", style: "risk", weight: 0.15, when: s2 => s2.year >= 1985 && s2.job.field !== "tech", apply: (s2, c) => begin(s2, c, "code", 1, y >= 2012 ? "You signed up for a part-time coding bootcamp, {writing JavaScript at the kitchen table until midnight,|in a class where everyone was a former something: a chef, a teacher, a paralegal,} and broke your first website on the first night." : "You signed up for programming classes at night, {with a textbook as thick as a brick,|on a computer in the community college lab,} and wrote your first program, which printed your name forty times.", s3 => spend(s3, 0.2)) },
          { id: "w_careerChange.teach", label: "Get a teaching certificate", hint: "a classroom of your own", act: "careerSwitch", style: "social", weight: 0.15, when: s2 => hasDegree(s2) && s2.job.field !== "education", apply: (s2, c) => begin(s2, c, "teach", 1, `You enrolled in a teaching certification program for career changers, {taking education classes at night,|observing classrooms on your days off,} and bought a cardigan with elbow patches, ironically at first.`, s3 => spend(s3, 0.1)) },
          { id: "w_careerChange.trade", label: "Apprentice in a trade", hint: "electrician, with your hands", act: "careerSwitch", style: "health", weight: 0.1, when: s2 => s2.job.field !== "construction", apply: (s2, c) => begin(s2, c, "trade", 2, "You signed on as an electrician's apprentice at {an age when most apprentices could be your kids,|thirty-something, with a new tool belt that squeaked,} {and your hands remembered how to work.|and went to class two nights a week.}", s3 => { s3.income *= 0.8; }) },
          { id: "w_careerChange.talk", label: "Talk to people in the field first", hint: "shadow someone for a day", act: "seekHelp", style: "learn", weight: 0.12, apply: (s2, c) => ({ text: c.w("You spent a few Saturdays shadowing people in the jobs you dreamed about, {and learned the dream had paperwork too.|and realized the grass was greener in some ways and browner in others.} You stayed put for now, with your eyes open."), mood: 1 }) },
          { id: "w_careerChange.stay", label: "Stay. It pays the bills", hint: "a steady check, a known life", act: "wait", style: "safe", weight: 0.3, apply: () => ({ text: `You thought hard about a second career and stayed ${an(job)}. Some days you wondered; you found other ways to feel alive.`, mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "w_switchYear", domain: "study", channel: "change", ages: [30, 70], when: (s, ctx) => ctx.arc.at("switch", "start"), p: () => 1,
    choice: (s, ctx) => {
      const a = s.arcs.switch.data, to = a.to;
      const T = {
        nurse: { lead: "Nursing school: clinicals start at six in the morning, and pharmacology is kicking you around the room.", pivot: ["Become an LPN first", "faster, then keep going"], help: "Ask your family to take over dinners and pickups" },
        code: { lead: s.year >= 2012 ? "Bootcamp is done. You've sent 140 applications and gotten two interviews." : "You've finished the programming courses, and every job wants experience you don't have.", pivot: ["Take an IT support job to get in the door", "a foot in the door"], help: "Ask a friend in tech for a referral" },
        teach: { lead: "Student teaching: twenty-eight eighth graders, one stapler, and a mentor teacher who has seen it all.", pivot: ["Substitute teach for a year first", "try the classroom on for size"], help: "Ask your mentor teacher for help" },
        trade: { lead: "Second year as an apprentice: your back hurts, your hands are cut up, and the licensing exam is next.", pivot: ["Switch to a different trade", "HVAC, plumbing, something kinder on the knees"], help: "Ask the journeyman to tutor you for the exam" },
      }[to] || { lead: "Your career change is halfway there, and it is harder than you expected.", pivot: ["Try a related job first", "a step to the side"], help: "Ask for help" };
      const done = (s2, boost, text, mood = 1) => { a.boost = (a.boost || 0) + boost; ctx.arc.go("switch", "done", Math.max(1, (a.years || 1) - 1)); return { text: ctx.w(text), mood }; };
      return {
        prompt: `${T.lead} What do you do?`,
        options: [
          { id: "w_switchYear.push", label: "Push through", hint: "it's supposed to be hard", act: "pushThrough", style: "risk", weight: 0.35, apply: s2 => { stress(s2, 0.05); return done(s2, 0.1, `In the hardest stretch of your career change, you pushed through, {studying in the hospital parking lot before shifts,|with color-coded flash cards and very little sleep,|treating every rejection as practice,} and kept going.`); } },
          { id: "w_switchYear.help", label: T.help, hint: "you can't do it alone", act: "seekHelp", style: "family", weight: 0.2, apply: s2 => done(s2, 0.1, `In the hardest stretch of your career change, you asked for help, and {${s2.rel === "married" && s2.partner ? s2.partner.call : "your family"} took over dinners for a semester.|someone you barely knew spent an hour on the phone with you.|the help came faster than you expected.}`, 2) },
          { id: "w_switchYear.cut", label: "Cut back hours to make room", hint: "less money, more time", act: "rest", style: "safe", weight: 0.15, apply: s2 => { s2.income *= 0.85; stress(s2, -0.05); return done(s2, 0.05, "In the hardest stretch of your career change, you cut back your hours at work to make room, and lived on less for a while, which turned out to be possible."); } },
          { id: "w_switchYear.pivot", label: T.pivot[0], hint: T.pivot[1], act: "careerSwitch", style: "learn", weight: 0.15, apply: s2 => { a.alt = true; return done(s2, 0.15, `In the hardest stretch of your career change, you took a step to the side: ${T.pivot[0].toLowerCase()}. It was not the dream, exactly, but it was the door.`); } },
          { id: "w_switchYear.quit", label: "Go back to what you know", hint: "you gave it a real try", act: "avoid", style: "self", weight: 0.15, apply: () => { ctx.arc.end("switch", "quit"); return { text: `In the hardest stretch of your career change, you decided to go back to being ${an(a.old || "what you were")}. You had given it a real try, and some days that was enough.`, mood: -3 }; } },
        ],
        onFree: id => (["quitJob", "avoid", "rest", "retire"].includes(id) ? ctx.arc.end("switch", "quit") : ctx.arc.go("switch", "done", 1)),
      };
    },
  },
  {
    id: "w_switchDone", domain: "career", channel: "good", ages: [31, 75], when: (s, ctx) => ctx.arc.at("switch", "done"), p: () => 1,
    apply: (s, ctx) => {
      const a = s.arcs.switch.data, to = a.to, y = s.year;
      if (s.retired || !ctx.roll("study", "good", Math.min(0.92, 0.7 + (a.boost || 0)))) {
        ctx.arc.end("switch", "failed");
        return { text: ctx.w(`You finished the training for your second career, but {the jobs went to people with more experience,|the timing was wrong,} and you went on as ${an(s.job ? s.job.title : a.old || "before")}. {You kept the textbooks. They meant something.|Nothing you learned was wasted.}`), mood: -3 };
      }
      const J = {
        nurse: a.alt ? ["licensed practical nurse", 1.0, "health care", 6] : ["registered nurse", 1.48, "health care", 6],
        code: a.alt ? ["computer support specialist", 1.03, "tech", 11] : y >= 1996 ? ["web developer", 1.45, "tech", 11] : ["computer programmer", 1.4, "tech", 11],
        teach: a.alt ? ["substitute teacher", 0.6, "education", 3] : ["middle school teacher", 1.1, "education", 3],
        trade: a.alt ? ["HVAC technician", 0.98, "construction", 4] : ["electrician", 1.06, "construction", 4],
      }[to] || ["career changer", 1, "office", 6];
      if (to === "nurse") raiseEdu(s, a.alt ? "certificate" : "associate");
      if (to === "trade") raiseEdu(s, "certificate");
      ctx.arc.end("switch", "done");
      s.flags.switched = { from: a.old || "", to: J[0], age: s.age };
      startJob(s, ctx, J);
      const lines = {
        nurse: [`You passed the ${a.alt ? "LPN" : "NCLEX"} exam and started as ${an(J[0])}, {and the first patient who squeezed your hand undid you a little.|on the night shift, with a badge that finally said what you were.}`, `At ${s.age} you became ${an(J[0])}. {Your first shift you ran on adrenaline and the kindness of the charge nurse.|Your old coworkers sent flowers to the nurses' station.}`],
        code: [`You got your first job as ${an(J[0])} at ${s.age}, {and your first pull request had nineteen comments, all of them fair.|and called the friend who'd told you to try it.}`, `After months of applications, an offer came: ${J[0]}. {You read the email four times.|You were the oldest junior on the team and the most grateful.}`],
        teach: [`You got your own classroom at ${s.age}, {and spent your own money decorating it, like every teacher.|and on the first day a kid called you "Mom" by accident, and you both laughed.}`, `You became ${an(J[0])}. {By October you knew all hundred and twenty names.|The first time a kid said "Oh, I get it now," you understood why people do this.}`],
        trade: [`You passed the licensing exam and became ${an(J[0])} at ${s.age}, {with your name on the permit and your own truck.|and wired your sister's new kitchen for free.}`, `At ${s.age}, a licensed ${J[0]}: {the hardest-won card in your wallet.|your back hurt, your heart didn't.}`],
      }[to] || [`You started your second career as ${an(J[0])}.`, `At ${s.age} you began again, as ${an(J[0])}.`, `Your second career began at ${s.age}.`];
      return { text: ctx.w(lines), mood: 8, big: true };
    },
  },

  // ---------- a union card ----------
  {
    // Union membership: about a third of US workers in the 1950s, about a tenth today; organizing drives came back at
    // coffee chains and warehouses in the early 2020s.
    id: "w_union", domain: "career", channel: "change", once: true, ages: [19, 60], when: s => unionable(s) && atHome(s) && !s.flags.union && !s.arcs.union, p: () => 0.02,
    choice: (s, ctx) => {
      const y = s.year, field = s.job.field;
      const established = (y < 1980 && ["manufacturing", "logistics", "construction", "communications", "government", "public safety", "repair"].includes(field)) || ["education", "public safety", "government"].includes(field);
      const rtw = inStates(s, RTW);
      const where = { manufacturing: "the plant", logistics: "the warehouse", construction: "the job site", education: "school", "health care": "the hospital", health: "the hospital", "food service": "the store", retail: "the store" }[field] || "work";
      const lead = established
        ? scene(ctx, [`Your first week at ${where}, the shop steward handed you a union card and a pen.`, `At ${where} the union has been around longer than you've been alive, and the steward wants to know if you're in.`, rtw ? `You work in a right-to-work state, so the union at ${where} is optional, and the steward is asking anyway.` : `The union meeting at ${where} is Thursday night at the hall, and the steward says new members get the good coffee.`])
        : scene(ctx, [`Some coworkers at ${where} are organizing a union, and they meet in a back booth at the diner after shifts.`, `A coworker slid a union card across the break room table at ${where} and said, "Think about it."`, `Management at ${where} called a meeting about "the union question," and now everyone's talking.`]);
      const set = (role, pro, text, mood = 1) => (s2, c) => {
        if (established) { if (role !== "no") s2.income *= 1.05; s2.flags.union = { since: s2.age, role }; }
        else c.arc.start("union", { pro, against: role === "no", from: s2.age }, 1, "vote");
        return { text: c.w(text), mood };
      };
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "w_union.join", label: established ? "Join, and go to meetings" : "Sign the card", hint: "strength in numbers", act: "socialize", style: "social", weight: 0.35, apply: set("member", 1, established ? `You joined the union at ${where} and went to the meetings, {where an old-timer explained the contract to you line by line.|and learned that the coffee was terrible and the people were not.}` : `You signed the union card at ${where} {and felt your heart pound doing it.|and talked two coworkers into signing too.}`, 2) },
          { id: "w_union.lead", label: established ? "Run for shop steward" : "Help organize", hint: "out front", act: "negotiate", style: "risk", weight: 0.15, apply: set("steward", 2, established ? `You ran for shop steward at ${where} and won, {and spent your breaks answering everyone's questions.|and learned the contract better than the managers did.}` : `You helped organize the union drive at ${where}, {collecting cards in the parking lot,|making flyers at the copy shop at midnight,} and management started learning your name.`, 2) },
          { id: "w_union.quiet", label: established ? "Join, but stay out of the politics" : "Keep your head down", hint: "do your job", act: "wait", style: "safe", weight: 0.25, apply: set("member", 0, established ? `You joined the union at ${where}, paid your dues and stayed out of the politics.` : `You kept your head down while the union drive went on around you at ${where}, and listened to both sides.`, 0) },
          { id: "w_union.no", label: established ? (rtw ? "Opt out" : "Pay the fee, skip the meetings") : "Vote no", hint: "you'd rather deal on your own", act: "avoid", style: "self", weight: 0.15, apply: set("no", -1, established ? `You stayed out of the union at ${where}, and some coworkers were cooler to you after that.` : `You decided you were against the union at ${where}, and said so when asked. It made for some quiet lunches.`, -1) },
          { id: "w_union.ask", label: "Ask someone you trust first", hint: "a parent, an old-timer", act: "talk", style: "family", weight: 0.1, apply: (s2, c) => set("member", 0.5, `You asked ${s2.father.alive || s2.mother.alive ? parentWord(s2, c) : "an old-timer at work"} about the union, {and heard a long story about a strike in 1959.|and got an earful of good advice.} Then you signed.`, 1)(s2, c) },
        ],
        onFree: (id, s2) => { if (established) s2.flags.union = { since: s2.age, role: ["avoid", "quitJob"].includes(id) ? "no" : "member" }; else ctx.arc.start("union", { pro: 0, from: s2.age }, 1, "vote"); },
      };
    },
  },
  {
    id: "w_unionVote", domain: "career", channel: "good", ages: [20, 70], when: (s, ctx) => ctx.arc.at("union", "vote"), p: () => 1,
    apply: (s, ctx) => {
      const a = s.arcs.union.data;
      ctx.arc.end("union", "voted");
      if (!s.employed) return { text: "The union vote happened at your old job after you'd left, and a former coworker texted you the result with a lot of exclamation points.", mood: 1 };
      if (ctx.roll("career", "good", 0.45 + 0.05 * (a.pro || 0))) {
        s.flags.union = { since: s.age, role: a.against ? "covered" : (a.pro || 0) >= 2 ? "steward" : "member" }; s.income *= 1.06;
        return { text: ctx.w(a.against ? "The union won the vote at work, even without you, and the first contract raised your pay anyway. You went to the next meeting, a little sheepish." : "The union won the vote at work {by eleven votes,|after a count that ran past midnight,} and the first contract brought a raise and a real grievance process. {You hugged a coworker you'd never spoken to.|Someone brought a sheet cake.}"), mood: a.against ? 1 : 6, big: !a.against };
      }
      return { text: ctx.w(a.against ? "The union lost the vote at work, as you'd hoped, and things went on much as before." : "The union lost the vote at work {by a handful of votes,|after weeks of meetings with management,} and some of the organizers left within the year. You kept the button in a drawer."), mood: a.against ? 1 : -3 };
    },
  },
  {
    id: "w_strike", domain: "career", channel: "bad", max: 2, cooldown: 6, ages: [20, 65], when: s => working(s) && atHome(s) && s.flags.union && ["member", "steward", "covered"].includes(s.flags.union.role) && !s.arcs.strike, p: () => 0.025,
    choice: (s, ctx) => {
      const y = s.year, field = s.job.field;
      const lead = scene(ctx, [
        "Contract talks broke down, and the union voted to strike. The picket lines go up Monday.",
        field === "education" ? (y >= 2018 ? "Teachers across the state are walking out over pay and class sizes, and your local voted to join them." : "The teachers' union set a strike date, and the school board says it won't budge.") : null,
        ["health care", "health"].includes(field) ? "The nurses' union set a strike date over staffing; you've been working short for a year." : null,
        field === "manufacturing" && y >= 2023 ? "The union walked out at the plant, and the news trucks are parked across the road." : null,
        field === "logistics" && y >= 1997 ? "The Teamsters called a strike, and the trucks sit in the yard." : null,
        field === "arts" && y === 2023 ? "The writers and actors are on strike, and every studio in town has gone quiet." : null,
      ]);
      const begin = (s2, side, text, mood = -2) => { s2.income *= side === "cross" ? 1 : 0.92; ctx.arc.start("strike", { side, from: s2.age }, 1); return { text: ctx.w(text), mood }; };
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "w_strike.picket", label: "Walk the picket line", hint: "strike pay and solidarity", act: "insist", style: "social", weight: 0.4, apply: s2 => begin(s2, "picket", `When the strike came, you walked the picket line {every morning in the cold with a thermos of coffee,|with a sign you hand-lettered yourself,} and {strangers honked and brought donuts.|you got to know coworkers you had only ever nodded at.}`) },
          { id: "w_strike.side", label: "Picket, and pick up side work", hint: "the bills don't strike", act: "sideJob", style: "safe", weight: 0.2, apply: s2 => begin(s2, "picket", "When the strike came, you picketed in the mornings and picked up side work in the afternoons, {driving, painting, whatever paid,|because the mortgage didn't care about the contract.}", -2) },
          { id: "w_strike.kitchen", label: "Help run the strike kitchen", hint: "an army runs on soup", act: "care", style: "family", weight: 0.15, apply: s2 => begin(s2, "kitchen", "When the strike came, you helped run the strike kitchen at the union hall, {feeding two hundred people a day on donations,|making chili in a pot the size of a bathtub,} and it was the proudest you had felt in years.", 0) },
          { id: "w_strike.cross", label: "Cross the picket line", hint: "you can't afford it", act: "pushThrough", style: "self", weight: 0.1, apply: s2 => begin(s2, "cross", "When the strike came, you crossed the picket line because you couldn't afford not to, and the shouting at the gate followed you home every night.", -5) },
          { id: "w_strike.settle", label: "Push to take the company's offer", hint: "half a loaf, now", act: "negotiate", style: "safe", weight: 0.15, apply: s2 => begin(s2, "settle", "When the strike came, you argued at the union meeting for taking the company's offer, {and the vote was close.|and not everyone thanked you for it.}", -1) },
        ],
        onFree: (id, s2) => { ctx.arc.start("strike", { side: ["pushThrough", "quitJob"].includes(id) ? "cross" : "picket", from: s2.age }, 1); },
      };
    },
  },
  {
    id: "w_strikeEnd", domain: "career", channel: "good", ages: [21, 70], when: (s, ctx) => ctx.arc.at("strike", "start"), p: () => 1,
    apply: (s, ctx) => {
      const a = s.arcs.strike.data;
      ctx.arc.end("strike", "over");
      const won = ctx.roll("career", "good", a.side === "settle" ? 0.4 : 0.55);
      if (s.employed && won) s.income *= 1.1;
      if (a.side === "cross") return { text: won ? "The strike ended with a better contract, and the raise applied to you too. Some coworkers didn't speak to you for a year; one never did." : "The strike ended with a thin contract, and the coworkers who'd been on the line remembered who hadn't been.", mood: -2 };
      return won
        ? { text: ctx.w(`The strike ended {after six weeks|after a long winter} with a new contract: {better pay, real staffing rules and a signing bonus.|a raise every year and health care that held.} {You framed the picket sign.|Everyone went back on the same morning, together.}`), mood: 7, big: true }
        : { text: ctx.w("The strike ended with a contract that was {less than you'd hoped and more than they'd offered,|about what the company had put on the table in the first place,} and you went back to work tired, a little poorer, and closer to the people beside you."), mood: -1 };
    },
  },

  // ---------- working from home ----------
  {
    id: "w_remote", domain: "career", channel: "change", once: true, ages: [20, 70], when: s => office(s) && atHome(s) && s.year >= 2020 && s.year <= 2021, p: () => 0.6,
    choice: (s, ctx) => {
      const kids = (s.kids || []).some(k => k.age >= 4 && k.age <= 14);
      const [lead, then] = scene(ctx, [
        ["In March 2020 your office sent everyone home with a laptop and a monitor. Months later, nobody knows when you're going back.", "Working from home that first year,"],
        [kids ? "Your kitchen table is an office, a classroom and a cafeteria, and your video calls have a soundtrack of fourth-grade math." : "Your commute is twelve steps, your coworkers are squares on a screen, and you haven't worn real pants since spring.", "With work moved into the house,"],
        ["Your company says the office will stay closed through next year, and rent in your city is brutal.", "With the office closed for the foreseeable future,"],
      ]);
      const start = (s2, c, moved, text, mood = 2) => { s2.flags.remote = { since: s2.age, moved }; c.arc.start("remote", { moved }, Math.max(1, 2022 - s2.year), "rto"); return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} What do you do with it?`,
        options: [
          { id: "w_remote.move", label: "Move somewhere cheaper", hint: "a bigger place, a smaller rent", act: "moveHome", style: "risk", weight: 0.15, apply: (s2, c) => { moveTo(s2, c, [["ID", 1], ["MT", 1], ["TN", 1.2], ["NC", 1.2], ["ME", 1], ["CO", 1], ["TX", 1.2], ["FL", 1.2], ["VT", 0.6], ["AZ", 1]]); return start(s2, c, true, `${then} you packed up and moved somewhere cheaper, {to a house with a yard and an office with a door,|to a small town with one coffee shop and a view of the mountains,} and kept your job from a desk by the window.`, 4); } },
          { id: "w_remote.office", label: "Build a real office in the corner", hint: "a door, a ring light, a routine", act: "wait", style: "safe", weight: 0.3, apply: (s2, c) => start(s2, c, false, `${then} you built a real office {in a converted closet|in the corner of the bedroom|in the garage, with a space heater}, bought a ring light and a good chair, and worked out a routine that held.`) },
          { id: "w_remote.time", label: "Use the commute time for yourself", hint: "an hour a day back", act: "exercise", style: "health", weight: 0.2, apply: (s2, c) => { stress(s2, -0.05); return start(s2, c, false, `${then} you took back the hour you used to spend commuting, {walking every morning before your first call,|learning to bake bread,|riding a bike you bought used,} and felt better than you had in years.`, 3); } },
          { id: "w_remote.back", label: "Go back in as soon as they let you", hint: "you miss people", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => start(s2, c, false, `${then} you missed people more than you expected, and the day the office reopened you were {one of six people on the whole floor.|there at eight, with donuts.}`, 1) },
          { id: "w_remote.family", label: "Lean into time with family", hint: "lunch with the people you love", act: "care", style: "family", weight: 0.15, apply: (s2, c) => start(s2, c, false, `${then} you ate lunch with your family every day for the first time ever, {and learned what your house sounds like at two in the afternoon.|and took walks around the block between meetings.}`, 3) },
        ],
        onFree: (id, s2) => { s2.flags.remote = { since: s2.age, moved: id === "moveHome" }; ctx.arc.start("remote", { moved: id === "moveHome" }, Math.max(1, 2022 - s2.year), "rto"); },
      };
    },
  },
  {
    id: "w_rto", domain: "career", channel: "bad", ages: [21, 75], when: (s, ctx) => ctx.arc.at("remote", "rto") && working(s), p: () => 1,
    choice: (s, ctx) => {
      const a = s.arcs.remote.data, days = ctx.rng.pick(["three days a week", "four days a week", "five days a week"]);
      const lead = a.moved ? `Your company announced everyone back in the office ${days}, and you now live a long way from the office.` : `Your company announced a return to the office: ${days}, starting next month.`;
      const end = (text, mood) => { ctx.arc.end("remote", "decided"); return { text: ctx.w(text), mood }; };
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "w_rto.back", label: "Go back", hint: "it's the job", act: "wait", style: "safe", weight: 0.35, apply: s2 => { if (a.moved) stress(s2, 0.05); return end(a.moved ? `When the office called everyone back ${days}, you went, {driving two hours each way and listening to every podcast ever made.|renting a room near the office for the weekdays.}` : `When the office called everyone back ${days}, you went back, {and found your old desk exactly as you left it, including a calendar from March 2020.|and admitted, privately, that you'd missed the free coffee and the gossip.}`, 0); } },
          { id: "w_rto.remoteJob", label: "Find a fully remote job", hint: "they're out there", act: "jobHop", style: "risk", weight: 0.2, apply: s2 => { s2.income *= ctx.rng.between(0.97, 1.12); return end(`When the office called everyone back, you found a fully remote job, still as ${an(s2.job.title)}, {and gave notice on a video call.|and kept your desk by the window.}`, 2); } },
          { id: "w_rto.exception", label: "Ask for an exception", hint: "your numbers are good", act: "negotiate", style: "social", weight: 0.2, apply: () => (ctx.roll("career", "good", 0.4) ? end("When the office called everyone back, you made your case with your numbers, and your boss signed off on staying remote. You didn't tell anyone why.", 3) : end(`When the office called everyone back, you asked for an exception and didn't get one. You went in ${days}, grumbling.`, -1)) },
          { id: "w_rto.minimum", label: "Badge in, grab coffee, leave", hint: "technically compliant", act: "avoid", style: "self", weight: 0.1, apply: () => end("When the office called everyone back, you badged in, got a coffee, said hello to three people and went home to work. It was technically compliant.", 1) },
          { id: "w_rto.quit", label: "Quit", hint: "you've changed", act: "quitJob", style: "self", weight: 0.15, apply: s2 => { loseJob(s2); return end("When the office called everyone back, you quit. Somewhere in those years at home you had become someone who wouldn't go back.", 0); } },
        ],
        onFree: () => ctx.arc.end("remote", "decided"),
      };
    },
  },

  // ---------- management, or the work itself ----------
  {
    id: "w_manager", domain: "career", channel: "good", once: true, ages: [26, 58], when: s => working(s) && atHome(s) && s.career >= 2 && !s.flags.managerPath && !s.arcs.manage && s.job.field !== "self-employed", p: () => 0.03,
    choice: (s, ctx) => {
      const job = s.job.title;
      const lead = scene(ctx, [
        "Your manager is leaving, and the director asked if you want the job.",
        `You're the best ${job} on the team, and HR says the next step up is managing the people you work beside.`,
        "There's an opening to lead the team, and your coworkers keep saying it should be you.",
      ]);
      return {
        prompt: `${lead} Do you take it?`,
        options: [
          { id: "w_manager.take", label: "Take it", hint: "more money, more meetings", act: "pushThrough", style: "risk", weight: 0.35, apply: (s2, c) => { s2.career = Math.min(5, s2.career + 1); s2.income *= 1.12; stress(s2, 0.05); s2.flags.managerPath = "manager"; c.arc.start("manage", { from: s2.age }, 1); return { text: c.w(`You took the manager's job, {moved into an office with a door,|got a new title and a lot more email,} and {found out the hardest part was the people, not the work.|spent the first month learning to stop doing everyone's job yourself.}`), mood: 5, big: true }; } },
          { id: "w_manager.craft", label: "Stay hands-on", hint: "do the work you love", act: "study", style: "learn", weight: 0.25, apply: (s2, c) => { s2.flags.managerPath = "craft"; s2.income *= 1.04; return { text: c.w(`You turned the manager's job down to keep doing the work, {and they gave you a "senior" title and a small raise to keep you happy.|and became the person everyone came to with the hard problems.}`), mood: 3 }; } },
          { id: "w_manager.trial", label: "Ask to try it for six months", hint: "a way back if it's wrong", act: "negotiate", style: "safe", weight: 0.15, apply: (s2, c) => { s2.income *= 1.06; s2.flags.managerPath = "manager"; c.arc.start("manage", { from: s2.age, trial: true }, 1); return { text: "You asked to try the manager's job for six months, with a way back if it didn't fit, and your boss agreed.", mood: 3 }; } },
          { id: "w_manager.coach", label: "Take it, but keep doing the work too", hint: "a player-coach", act: "insist", style: "self", weight: 0.1, apply: (s2, c) => { s2.career = Math.min(5, s2.career + 1); s2.income *= 1.1; stress(s2, 0.08); s2.flags.managerPath = "manager"; c.arc.start("manage", { from: s2.age, coach: true }, 1); return { text: "You took the manager's job and kept doing your old work too, which meant two jobs and one paycheck, and some very long evenings.", mood: 2, big: true }; } },
          { id: "w_manager.recommend", label: "Recommend a coworker instead", hint: "the right person isn't you", act: "reconcile", style: "family", weight: 0.15, apply: s2 => { s2.flags.managerPath = "declined"; return { text: "You turned the manager's job down and recommended a coworker who was better with people. She got it, and she never forgot.", mood: 2 }; } },
        ],
        onFree: (id, s2) => { if (["pushThrough", "negotiate", "insist", "jobSearch"].includes(id)) { s2.flags.managerPath = "manager"; ctx.arc.start("manage", { from: s2.age }, 1); } else s2.flags.managerPath = "declined"; },
      };
    },
  },
  {
    id: "w_managerYear", domain: "career", channel: "change", ages: [27, 75], when: (s, ctx) => ctx.arc.at("manage", "start") && working(s), p: () => 1,
    choice: (s, ctx) => {
      const a = s.arcs.manage.data;
      const co = ctx.person({ role: "coworker", sex: ctx.rng() < 0.5 ? "male" : "female", birthYear: s.birthYear + ctx.rng.int(9) - 4, how: "coworker" });
      const [lead, then] = scene(ctx, [
        [`${co.call}, your work friend for years, now reports to you and keeps coming in late.`, `With ${co.call} coming in late,`],
        ["Budget cuts came down from above: you have to let one person on your team go.", "With a layoff to hand down,"],
        ["Your team has missed three deadlines in a row, and your boss wants to know why.", "With your team missing deadlines,"],
        [`${co.call}, your best person, wants a raise you have no budget to give.`, `With ${co.call} asking for a raise you couldn't give,`],
      ]);
      const end = (path, text, mood) => { ctx.arc.end("manage", path); return { text: ctx.w(text), mood }; };
      return {
        prompt: `${a.trial ? "You're six months into your trial as a manager." : "It's your first year as a manager."} ${lead} What do you do?`,
        options: [
          { id: "w_managerYear.hard", label: "Have the hard conversation", hint: "kind and clear", act: "talk", style: "social", weight: 0.3, apply: () => end("manager", `${then} you had the hard conversation, {kind and clear and fifteen minutes long,|in a conference room with a box of tissues you didn't need,} and {it went better than the one you'd rehearsed in the shower.|you learned that clear is kind.}`, 2) },
          { id: "w_managerYear.cover", label: "Absorb it yourself", hint: "protect your people", act: "care", style: "family", weight: 0.15, apply: s2 => { stress(s2, 0.06); return end("manager", `${then} you absorbed it yourself, {staying late to cover the gap|taking the heat from upstairs}, and your team never knew how much you'd shielded them.`, -1); } },
          { id: "w_managerYear.hr", label: "Bring in HR and follow the playbook", hint: "by the book", act: "seekHelp", style: "safe", weight: 0.15, apply: () => end("manager", `${then} you brought in HR and followed the playbook to the letter, and it was fair and cold and done.`, 0) },
          { id: "w_managerYear.grow", label: "Get some management training", hint: "nobody's born knowing this", act: "study", style: "learn", weight: 0.25, apply: s2 => { stress(s2, -0.05); return end("manager", `${then} you signed up for management training, {a three-day course in a hotel conference room,|a coach who met you every other Friday,} and came back with better words for the things you'd been doing by instinct.`, 3); } },
          { id: "w_managerYear.back", label: "Step back to hands-on work", hint: "you miss the work", act: "careerSwitch", style: "self", weight: 0.15, apply: s2 => { s2.career = Math.max(0, s2.career - 1); s2.income *= 0.94; stress(s2, -0.1); s2.flags.managerPath = "stepBack"; return end("stepBack", `${then} you realized you missed the work itself, and asked to step back to it. It cost you a little money and gave you back your evenings.`, 2); } },
        ],
        onFree: (id, s2) => { if (["quitJob", "careerSwitch", "rest"].includes(id)) s2.flags.managerPath = "stepBack"; ctx.arc.end("manage", "manager"); },
      };
    },
  },

  // ---------- a sabbatical ----------
  {
    id: "w_sabbatical", domain: "health", channel: "change", once: true, ages: [30, 62],
    when: s => working(s) && atHome(s) && !s.arcs.sabbatical && (s.done.has("burnout") || (s.health.stress ?? 0) >= 0.55 || (["education", "academia", "tech"].includes(s.job.field) && s.age - (s.job.since ?? s.age) >= 6)), p: () => 0.02,
    choice: (s, ctx) => {
      const prof = s.job.field === "academia" || /professor/i.test(s.job.title);
      const lead = scene(ctx, [
        prof ? "Your seventh year has come around, and with it a sabbatical you've been too busy to plan." : "Your company offers unpaid leave after enough years, and you have more than enough.",
        s.done.has("burnout") ? "After the year you burned out, your doctor said the words “real time off,” and meant months." : "You have years in, a little saved, and a tiredness that weekends don't touch.",
        "A coworker came back from a three-month sabbatical looking ten years younger, and you've thought about it every day since.",
      ]);
      const start = (s2, c, what, cost, text, mood = 4) => { spend(s2, cost); s2.flags.sabbatical = s2.age; c.arc.start("sabbatical", { what }, 1); return { text: c.w(text), mood, big: true }; };
      return {
        prompt: `${lead} Do you take time off?`,
        options: [
          { id: "w_sabbatical.travel", label: "Travel", hint: "somewhere far", act: "travel", style: "risk", weight: 0.25, apply: (s2, c) => start(s2, c, "travel", 0.4, "You took a sabbatical and went to {trip}, {for longer than you had ever been anywhere,|with a backpack and no itinerary,} and {for the first week you checked your work email, and then you stopped.|learned to do nothing, slowly, like a language.}", 5) },
          { id: "w_sabbatical.rest", label: "Rest at home", hint: "a garden, a library card, naps", act: "rest", style: "health", weight: 0.25, apply: (s2, c) => { stress(s2, -0.2); return start(s2, c, "rest", 0.2, "You took a sabbatical and stayed home, {planting a garden you actually tended,|reading the books stacked by your bed for years,|sleeping nine hours a night,} and slowly remembered who you were before work."); } },
          { id: "w_sabbatical.learn", label: "Learn something new", hint: "a language, an instrument, a craft", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => start(s2, c, "learn", 0.25, "You took a sabbatical to learn {Spanish, with classes every morning,|the guitar, badly and then less badly,|woodworking at a school in the mountains,} and felt like a student again, in the best way.") },
          { id: "w_sabbatical.give", label: "Volunteer", hint: "do good for a season", act: "volunteer", style: "social", weight: 0.1, apply: (s2, c) => start(s2, c, "give", 0.2, "You took a sabbatical and spent it volunteering, {building houses after a hurricane,|teaching adults to read at the library,|at a food bank three states away,} and came back with calluses and perspective.") },
          { id: "w_sabbatical.no", label: "Not now. Push through", hint: "there's never a good time", act: "pushThrough", style: "safe", weight: 0.25, apply: s2 => { stress(s2, 0.05); return { text: "You thought about a sabbatical and decided there was never a good time. You took a long weekend instead, and promised yourself next year.", mood: -2 }; } },
        ],
        onFree: (id, s2) => { if (!["pushThrough", "wait", "avoid"].includes(id)) { s2.flags.sabbatical = s2.age; ctx.arc.start("sabbatical", { what: "rest" }, 1); } },
      };
    },
  },
  {
    id: "w_sabbaticalBack", domain: "career", channel: "change", ages: [31, 75], when: (s, ctx) => ctx.arc.at("sabbatical", "start"), p: () => 1,
    choice: (s, ctx) => {
      const what = s.arcs.sabbatical.data.what, job = s.job ? s.job.title : "your job";
      const end = (text, mood) => { ctx.arc.end("sabbatical", "back"); return { text: ctx.w(text), mood }; };
      const away = { travel: "months away", rest: "months at home", learn: "months of learning", give: "months of volunteering" }[what] || "months off";
      return {
        prompt: `After ${away}, your sabbatical is ending. Monday you're due back as ${an(job)}. What do you do?`,
        options: [
          { id: "w_sabbaticalBack.back", label: "Go back, rested", hint: "same job, new you", act: "wait", style: "safe", weight: 0.4, when: s2 => s2.employed, apply: s2 => { stress(s2, -0.15); return end(`After ${away}, you went back to work {and found it smaller and kinder than you remembered.|with new rules: no email after seven, lunch away from your desk.|and people said you looked different, and you were.}`, 4); } },
          { id: "w_sabbaticalBack.part", label: "Ask to come back part-time", hint: "less money, more life", act: "negotiate", style: "self", weight: 0.2, when: s2 => s2.employed, apply: s2 => { s2.income *= 0.8; stress(s2, -0.2); return end(`After ${away}, you asked to come back four days a week instead of five, and they said yes, and Fridays became the best day of your life.`, 4); } },
          { id: "w_sabbaticalBack.new", label: "Find a new job instead", hint: "a fresh start", act: "jobHop", style: "risk", weight: 0.15, apply: (s2, c) => { const t = startJob(s2, c, otherJob(s2, c)); return end(`After ${away}, you realized you couldn't go back, and found a new job as ${an(t)}, {with better people and a shorter commute.|starting the Monday you were due back at the old one.}`, 3); } },
          { id: "w_sabbaticalBack.quit", label: "Quit and figure out what's next", hint: "the sabbatical changed you", act: "quitJob", style: "self", weight: 0.15, when: s2 => s2.employed, apply: s2 => { loseJob(s2); return end(`After ${away}, you gave notice instead of going back. You didn't know what was next, only that it wasn't that.`, 1); } },
          { id: "w_sabbaticalBack.extend", label: "Stretch it a few more months", hint: "unpaid, worth it", act: "rest", style: "health", weight: 0.1, apply: s2 => { spend(s2, 0.1); stress(s2, -0.1); return end(`After ${away}, you asked for a few more unpaid months, got them, and went back in the fall, finally ready.`, 3); } },
        ],
        onFree: (id, s2) => { ctx.arc.end("sabbatical", "back"); if (id === "quitJob" && s2.employed) loseJob(s2); },
      };
    },
  },
];
