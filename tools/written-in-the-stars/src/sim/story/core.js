// The skeleton of a life: school, work, love, kids, a home, retirement, serious illness and death. The odds of these
// events come from US statistics (rates.js, through `rate()` in common.js), and test/calibration.test.js checks that
// the simulated population still matches them, so the probabilities here and the weights of the calibrated choices
// are not to be changed freely.
//
// Event fields (see story/README.md for the whole list):
//   domain, channel   which yearly luck channel tilts it; omitted for fixed milestones
//   ages, when        when it can happen; once / cooldown / max limit repeats
//   p(s, ctx)         base probability for this year
//   apply(s, ctx)     what happens → { text, mood, big }
//   choice(s, ctx)    instead of apply → { prompt, options: [{ id, label, hint, act, style, weight, when, apply }] }
import { jobsFor, startJob, otherJob, moveTo, jobFit } from "../world.js";
import { newKid, meetPlace, realPartnerDue, realPartnerAhead, realPartnerEngaged, realPartnerWeddingDue, realPartnerPlan, realPartner, realPartnerWaiting, keptForPartner, realPartnerSteady, surnameIn, sameSexCouple, canMarry, datingSex } from "../people.js";
import { marry, endRelationship, closeSpell, ownHome } from "../act.js";
import {
  scene, cap, an, they, them, their, kidWord, kidNoun, RELATIONS, sibName, sibsWord, yearsWord, isBrother, bornSibs, listWords, grandWord, parentWord, isAre,
  leaveSchool, WORK_ACTIONS, middleName, inHigh, fullRetirementAge, stateOf, stateCode, stateName, regionOf, inStates,
  rate, illnessWord, isCancer, chatOf,
} from "./common.js";

// Same-sex couples could marry nationwide from June 26, 2015 (Obergefell v. Hodges); many who had waited married in
// the first two years (people.js canMarry holds the rule).
const SAME_SEX_MARRIAGE = 2015;
const yearsMarried = s => (s.since === null || s.since === undefined ? 0 : s.age - s.since);
const motherAge = s => (s.sex === "female" ? s.age : s.partner ? s.partner.age : 99);
// The state you live in, as words ("Ohio"); "home" when the story does not know it.
const here = s => stateName(stateOf(s)) || "your hometown";
// A place moveTo() returned, as words.
const placeWords = x => stateName(stateCode(x)) || String(x || "a new state");
// The chart in one line, for the birth (prep.intro: "Sun in Leo, Moon in Pisces, Scorpio rising").
const introOf = ctx => (ctx.prep && ctx.prep.intro) || (ctx.analysis && ctx.analysis.intro) || "";
// How well a job suits the chart, −1..1 (prep.jobFit; world.js jobFit as in bazi-life otherwise).
function fitOf(ctx, job) {
  const f = ctx.prep && typeof ctx.prep.jobFit === "function" ? ctx.prep.jobFit(job) : Math.log(Math.max(0.2, jobFit(ctx.analysis, job, ctx.name) || 1));
  return Math.max(-1, Math.min(1.5, Number(f) || 0));
}

// ---------- military service ----------
// Service is a job (field "military") that ends at s.flags.serviceUntil; serviceEnd asks what comes next.
const BRANCH_JOB = { Army: "soldier in the Army", Navy: "sailor in the Navy", "Air Force": "airman in the Air Force", Marines: "Marine", "Coast Guard": "Coast Guard seaman" };
export function enlist(s, ctx, branch, years) {
  startJob(s, ctx, [BRANCH_JOB[branch] || "soldier", 0.8, "military", null]);
  s.job.branch = `the ${branch}`;
  s.studying = false; s.flags.serviceUntil = s.age + years; s.flags.served = { branch, from: s.age };
}
// The branch as a name for a sentence ("Army"), whether it was stored as "Army" or as "the Army" (act.js).
const branchName = s => String((s.flags.served && s.flags.served.branch) || (s.job && s.job.branch) || "service").replace(/^the /, "");
export const inService = s => s.flags.serviceUntil !== undefined && s.flags.serviceUntil > s.age && s.job && s.job.field === "military";
const pickBranch = ctx => ctx.rng.weighted([["Army", 0.4], ["Navy", 0.24], ["Air Force", 0.2], ["Marines", 0.13], ["Coast Guard", 0.03]]);

// How two people met, as the start of a sentence. The keys are people.js meetPlace() values; anything else reads
// as "You met".
const MET = {
  classmate: "In class you met", "old classmate": "At a reunion you ran into an old classmate,", coworker: "At work you met", friends: "Friends set you up with",
  "set up": "Friends set you up with", club: "At a club meeting you met", church: "At church you met", "blind date": "On a blind date you met",
  "chat room": "In an AOL chat room you met", online: "Online you met", "dating app": "On a dating app you matched with", gym: "At the gym you met",
  travel: "On a trip you met", bar: "At a bar one Friday night you met", neighbor: "Next door you met", wedding: "At a friend's wedding you met",
  dance: "At a dance you met", party: "At a party you met", volunteer: "Volunteering one Saturday, you met",
};
const metLead = p => MET[p.how] || "You met";

// The first job's question opens with how the search went: right after the service, after a long search, or one of
// several ways the offers came, by era.
function jobSearchLead(s, ctx) {
  if (s.flags.served && s.flags.serviceUntil !== undefined && s.age - s.flags.serviceUntil <= 1) return ctx.rng.pick(["You got out of the service and started looking for work.", "Back in civilian clothes, you started job hunting the week you got home.", "Your discharge papers were barely in the drawer when you started looking for work."]);
  if (s.flags.leftSchool !== undefined && s.age - s.flags.leftSchool >= 2) return ctx.rng.pick(["The job hunt took a while, but finally a few offers came.", "After months of applications and odd jobs, a few real offers came in.", "You had been patching together part-time work; now a few real offers came."]);
  const ads = s.year < 1998 ? "You circled want ads in the Sunday paper and called every number." : s.year < 2010 ? "You posted your résumé on Monster.com and sent out dozens more." : "You applied to forty jobs on LinkedIn and Indeed, and a few wrote back.";
  return ctx.rng.pick([ads, "Your uncle knew a guy who knew a guy, and a couple of other places called too.", s.edu === "bachelor" ? "At the campus career fair you handed out résumés until your hand hurt." : "You filled out applications all over town, and a few places called back."]);
}

// A quarrel with one parent, as a choice: teenagers fight about school and curfew, adults about work and love.
function parentClash(who) {
  const label = who === "father" ? "Dad" : "Mom", he = who === "father" ? "he" : "she", him = who === "father" ? "him" : "her";
  const id = `${who}Clash`;
  return {
    id, domain: "family", channel: "bad", tags: [who], about: who, ages: [13, 30], cooldown: 4, when: s => s[who].alive,
    p: () => 0.03,
    choice: (s, ctx) => {
      const topic = ctx.rng.pick(s.age <= 18 ? ["your grades", "curfew", "the friends you hang out with", "the phone bill", "your hair", "the car"] : s.rel === "dating" ? ["the person you are dating", "when you are getting married"] : s.rel === "married" ? ["where to spend Thanksgiving", "how you raise the kids"] : ["your job", "moving out", "how you spend money"]);
      const lead = scene(ctx, [
        `You and ${label} got into it about ${topic}, and both of you said things you didn't mean.`,
        `${label} lectured you about ${topic} for an hour, and you finally snapped back.`,
        `Dinner turned into a shouting match about ${topic}, and nobody finished the meatloaf.`,
        s.age >= 19 ? `A phone call home turned into a fight about ${topic}, and ${label} hung up first.` : null,
      ]);
      const letter = s.year >= 2005 && s.age >= 14, mediator = ctx.rng.pick(["Grandma", "your aunt", "your older cousin", "a family friend"]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you handle it?"])}`,
        options: [
          { id: `${id}.sorry`, label: ctx.rng.pick(["Apologize first", "Be the bigger person"]), hint: "take a step back", act: "reconcile", style: "family", weight: 0.25, apply: (s2, c) => ({ text: c.w(`After the fight with ${label} about ${topic}, you apologized first. ${cap(he)} {didn't say much, but left a plate warming in the oven for you.|hugged you a beat longer than usual.|said, “Me too, kiddo.”}`), mood: 1 }) },
          { id: `${id}.talk`, label: ctx.rng.pick(["Talk it out later", "Sit down and really talk"]), hint: "say what you actually think", act: "talk", style: "social", weight: 0.35, apply: (s2, c) => ({ text: c.w(`After the fight with ${label} about ${topic}, {a few days later|that weekend} you two sat {at the kitchen table|on the porch} and talked, and you found out ${he} had mostly been worried about you.`), mood: 2 }) },
          { id: `${id}.letter`, label: letter ? `Text ${label} instead` : "Write a note", hint: "easier than saying it", act: "talk", style: "family", weight: 0.1, apply: (s2, c) => ({ text: letter ? c.w(`After the fight with ${label} about ${topic}, you sent ${him} a long text. {An hour later ${he} wrote back: “Love you. Dinner's at six.”|${cap(he)} replied with a single heart and, a minute later, a second one.}`) : c.w(`After the fight with ${label} about ${topic}, you left a note on the kitchen counter. {The next morning there was an answer on the back.|${cap(he)} kept it in ${who === "father" ? "his wallet" : "her jewelry box"} for years.}`), mood: 2 }) },
          { id: `${id}.help`, label: `Ask ${mediator} to step in`, hint: "a peacemaker helps", act: "seekHelp", style: "social", weight: 0.1, apply: (s2, c) => ({ text: c.w(`After the fight with ${label} about ${topic}, ${mediator} played referee, and you both gave a little.`), mood: 1 }) },
          { id: `${id}.cold`, label: ctx.rng.pick(["Give each other the silent treatment", "Cool off for a while"]), hint: "wait it out", act: "avoid", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`After the fight with ${label} about ${topic}, {the house was very quiet for a few weeks.|you two passed each other in the hallway like strangers for a while.}`), mood: -4 }) },
        ],
      };
    },
  };
}

export const CORE = [
  // ---------- birth and childhood ----------
  {
    id: "birth", once: true, ages: [0, 0], big: true, p: () => 1,
    apply: (s, ctx) => {
      const lb = 5 + ctx.rng.int(5), oz0 = ctx.rng.int(16), oz = `${oz0} ounce${oz0 === 1 ? "" : "s"}`, intro = introOf(ctx);
      const dad = s.year < 1972 ? "{Your father paced the waiting room with a pack of cigars in his pocket, as fathers did then.|Your father got the news from a nurse in the waiting room and called everyone he knew from the pay phone.}" : "{Your dad was in the delivery room, a little green, holding the camera.|Your mom said later that you came out yelling and never really stopped.}";
      const text = ctx.w([
        `You were born in ${here(s)} in ${s.year}, ${lb} pounds ${oz}. ${dad}`,
        `You arrived in ${s.year} in ${here(s)}, ${lb} pounds ${oz}, with {a full head of dark hair|no hair at all|the family nose}. ${dad}`,
        `${s.year}, ${here(s)}: you were born {just before dawn|in the middle of a thunderstorm|on a quiet Sunday afternoon|an hour after the nurses changed shifts}, ${lb} pounds ${oz}.`,
      ]);
      return { text: intro ? `${text} The sky that hour: ${intro}.` : text, mood: 0, big: true };
    },
  },
  {
    id: "sibling", domain: "family", channel: "good", tags: ["siblings"], ages: [1, 12], when: s => s.siblings.unborn > 0,
    p: () => 0.32,
    apply: (s, ctx) => {
      const relation = ctx.rng() < 0.5 ? "youngerBrother" : "youngerSister";
      s.siblings.unborn -= 1;
      s.siblings.list.push({ relation, label: RELATIONS[relation], name: "", older: false, bornAt: s.age, born: true });
      const x = RELATIONS[relation];
      return { text: ctx.w(["You got a {x}, and the house got louder.", "Your {x} was born, and you {announced to your whole class that you were in charge now.|checked on the crib every five minutes.|were not impressed at first.}", "The day your {x} was born, you waited at Grandma's with a coloring book and {ate three grilled cheeses.|asked every ten minutes if it was done yet.}"], { x }), mood: 3 };
    },
  },
  {
    // A younger brother or sister from the family input, born in the year of their birth date.
    id: "knownSibling", rare: true, when: s => s.siblings.list.some(x => !x.born && x.bornAt === s.age), p: () => 1,
    apply: (s, ctx) => {
      const now = s.siblings.list.filter(x => !x.born && x.bornAt === s.age);
      for (const x of now) x.born = true;
      const who = listWords(now.map(sibName));
      if (s.age === 0) return { text: `That same year, ${who} arrived too.`, mood: 2 };
      return { text: now.length > 1 ? `${cap(who)} were born, and the house was suddenly full.` : ctx.w(["{x} was born, and the house got louder.", "{x} was born. You felt very grown up all of a sudden."], { x: cap(who) }), mood: 3 };
    },
  },
  {
    id: "kindergarten", once: true, ages: [5, 5], p: (s, ctx) => rate(ctx, "kindergarten", s.year),
    apply: (s, ctx) => ({ text: ctx.w(["You started kindergarten and cried at the door {for exactly one day.|until the teacher let you feed the class hamster.}", "Kindergarten: {nap mats, finger paint and graham crackers.|you learned to tie your shoes and to share, mostly.|you came home every day with a new song.}", `On the first day of kindergarten you carried {a ${s.year < 1980 ? "metal lunchbox" : "lunchbox"} bigger than your head|a backpack you had picked yourself} and {made a friend before lunch.|told the teacher your whole life story.}`]), mood: 1 }),
  },
  {
    id: "primary", once: true, ages: [6, 7], p: s => (s.age === 7 ? 1 : 0.9),
    apply: (s, ctx) => {
      s.edu = "elementary"; s.studying = true; s.track = "elementary";
      const box = s.year < 1965 ? "a Roy Rogers lunchbox" : s.year < 1977 ? "a lunchbox with the Partridge Family on it" : s.year < 1985 ? "a Star Wars lunchbox" : s.year < 2000 ? "a Lunchables tray Mom swore was a treat" : "a lunch bag with your name in Sharpie";
      return { text: ctx.w([`First grade: {you rode the big yellow bus for the first time|Mom walked you to the classroom door|you walked to school with the neighbor kids}, carrying ${box}.`, "You started first grade {and learned to read on a book about a dog named Spot.|and your teacher had a voice like warm milk.|and the kid next to you shared his crayons.}", "First grade, {room 104|Mrs. Hall's class|the classroom with the turtle tank}: {you could not wait for recess.|you loved the smell of new pencils.|you learned your phone number by heart.}"]), mood: 2 };
    },
  },
  {
    id: "childIllness", domain: "health", channel: "bad", grave: true, ages: [0, 12], cooldown: 4, p: () => 0.006,
    apply: (s, ctx) => ({ text: ctx.w(["You got very sick with pneumonia and spent two weeks in the hospital; your parents took turns in the chair by your bed. You pulled through.", "A fever that would not break landed you in the hospital {for a week.|overnight, then for six more days.} {The nurses let you keep the plastic bracelet.|You came home thinner, and Mom let you eat ice cream for dinner.}", "Your appendix burst, and you had emergency surgery. {You were proud of the scar for years.|The whole class signed a get-well card the size of a poster.}"]), mood: -6 }),
  },
  {
    id: "familyMove", domain: "move", channel: "change", ages: [1, 17], cooldown: 3, p: () => 0.03,
    apply: (s, ctx) => {
      const to = placeWords(moveTo(s, ctx));
      return { text: ctx.w(["The family moved to {to}, and you had to start over at a new school.", `${s.father.alive ? "Dad got transferred" : "Mom took a new job"}, and the whole family moved to {to}. {You cried saying goodbye to your best friend.|The new house had a yard, and you got your own room.|You rode the whole way in the back of the station wagon with the dog.}`, "You moved to {to}{ in a rented U-Haul| behind a moving van}. {The first night you all ate pizza on the floor.|You learned that every school has its own rules for kickball.}"], { to }), mood: -1 };
    },
  },
  {
    id: "parentsDivorce", once: true, domain: "family", channel: "bad", tags: ["father", "mother"], ages: [2, 17], when: s => s.father.alive && s.mother.alive,
    p: (s, ctx) => rate(ctx, "divorce", s.age + 3, s.year) * 0.8,
    apply: (s, ctx) => {
      s.flags.parentsSplit = true;
      return { text: ctx.w(["Your parents got divorced. They both told you, more than once, that it was not your fault.", "Mom and Dad split up, and {every other weekend you packed a bag for the other house.|you had two birthdays that year, one at each place.|the house got very quiet.}", "Your parents divorced. {Dad moved into an apartment with a pullout couch that became yours on weekends.|You learned to keep a toothbrush at both houses.}"]), mood: -10 };
    },
  },
  {
    id: "siblingRivalry", domain: "family", channel: "bad", tags: ["siblings"], about: "siblings", ages: [5, 17], cooldown: 3,
    when: s => bornSibs(s, 3).length > 0, p: () => 0.07,
    apply: (s, ctx) => {
      const x = sibName(ctx.rng.pick(bornSibs(s, 3)));
      return { text: ctx.w(["You and {x} fought over {the remote|the front seat|the last Popsicle} until you both got sent to your rooms.", "You and {x} drew a line down the middle of the back seat, and {nobody crossed it for three hundred miles.|the whole trip was a border dispute.}", "You were sure Mom liked {x} better, and you sulked about it for {a week|days}.", "{x} broke your {favorite toy|model airplane|diary lock}, and you {cried|stopped speaking to them} for a whole day."], { x }), mood: -2 };
    },
  },

  // ---------- school ----------
  {
    // Middle school (grades 6–8) from the mid-1980s in most districts; junior high (7–9) before.
    id: "middle", once: true, ages: [11, 12], when: s => s.edu === "elementary" && s.studying,
    p: (s, ctx) => (s.age === 12 || s.year >= 1985 ? rate(ctx, "juniorHigh", s.year) : 0),
    apply: (s, ctx) => {
      s.edu = "middle"; s.track = "middle";
      const m = middleName(s.year);
      return { text: ctx.w([`You started ${m} and {spent the first week fighting your locker combination.|had seven teachers instead of one.|learned that the cafeteria tables had rules no one wrote down.}`, `${cap(m)}: {changing classes when the bell rang|a gym teacher with a whistle|homework in every subject}, and {you felt very grown up.|you missed recess more than you admitted.}`, `First day of ${m}. {You wore the new sneakers you had begged for.|The eighth graders looked like adults.|You got lost twice looking for the science room.}`]), mood: 1 };
    },
  },
  {
    id: "highSchool", once: true, ages: [14, 15], when: s => s.edu === "middle" && s.studying && s.track === "middle", p: s => (s.age === 14 ? 0.97 : 1),
    apply: (s, ctx) => {
      s.track = "high"; s.flags.trackAt = s.age;
      return { text: ctx.w([`You started high school, a freshman again, {in a building three times the size of your old one.|${s.year < 1985 ? "with a class schedule printed on a computer punch card." : "with a printed schedule you checked forty times a day."}|with a locker on the far side of the school from every class.}`, "Freshman year: {homecoming posters in the halls|a pep rally in the gym|seniors who seemed to own the parking lot}, and you {trying to look like you knew where you were going.|already counting the years.}", "High school started. {You signed up for {band|JV soccer|the school paper|drama club} the first week.|You found your people at the lunch table by the windows.|You discovered that freshmen do not sit on the senior benches.}"]), mood: 1 };
    },
  },
  {
    // Dropping out at 16 or 17. The event comes at half the status dropout rate each of those years, divided by the
    // share of its options that leave (0.6), so the weights reproduce the rate.
    id: "hsDropout", calibrated: true, ages: [16, 17], max: 1, when: s => inHigh(s),
    p: (s, ctx) => Math.min(1, rate(ctx, "hsDropout", s.year) / 0.6),
    choice: (s, ctx) => {
      const money = s.flags.homeMoney === "tight";
      // Each scene: the question (now) and how the result line starts (then).
      const [lead, then] = scene(ctx, [
        ["You are failing three classes and skipping more days than you show up.", "Failing three classes and skipping more days than you showed up"],
        [`You are working thirty hours a week at the ${s.year < 1980 ? "gas station" : "grocery store"}, and school feels like the part-time job.`, `Working thirty hours a week at the ${s.year < 1980 ? "gas station" : "grocery store"}`],
        money ? ["Money at home is tight, and a full-time paycheck would help more than a report card.", "With money tight at home"] : null,
        ["You got held back a year, and now you are the oldest kid in every class.", "Held back a year and the oldest kid in every class"],
        [s.flags.parentsSplit ? "Your family has been stretched thin since the divorce, and you keep wondering why you are still in school." : "Your friends have already dropped out, and you keep wondering why you are still going.", s.flags.parentsSplit ? "With the family stretched thin since the divorce" : "With your friends already gone from school"],
      ]);
      const dropText = (c, also) => c.w(`${then}, you dropped out of high school${also}. {Your ${s.mother.alive ? "mom" : "family"} cried, then helped you look for work.|The school mailed a form to your house, and that was that.|You told yourself you would go back someday.}`);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "Do you stay in school?"])}`,
        options: [
          { id: "hsDropout.work", label: ctx.rng.pick(["Drop out and work full-time", "Leave school and get a real job"]), hint: "a paycheck now", act: "jobSearch", style: "self", weight: 0.42, apply: (s2, c) => { leaveSchool(s2); s2.flags.dropout = s2.age; return { text: dropText(c, ""), mood: -3 }; } },
          { id: "hsDropout.ged", label: "Leave now, get a GED later", hint: "the same diploma, by exam", act: "jobSearch", style: "risk", weight: 0.18, apply: (s2, c) => { leaveSchool(s2); s2.flags.dropout = s2.age; s2.flags.gedPlan = true; return { text: dropText(c, " and promised yourself a GED"), mood: -2 }; } },
          { id: "hsDropout.counselor", label: "Talk to the guidance counselor", hint: "someone in your corner", act: "seekHelp", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${then}, you went to see the guidance counselor, who {cleared your schedule of the worst class and checked on you every Monday.|found you a tutor and a teacher who believed in you.} You stayed.`), mood: 2 }) },
          { id: "hsDropout.summer", label: "Go to summer school and catch up", hint: "lose a summer, save a year", act: "study", style: "learn", weight: 0.12, apply: (s2, c) => ({ text: c.w(`${then}, you spent the summer in a hot classroom making up credits, {and by August you were back on track.|and the teacher brought popsicles on Fridays.}`), mood: 0 }) },
          { id: "hsDropout.vocational", label: s.year < 1990 ? "Switch to the vo-tech school" : "Switch to a career and technical program", hint: "learn something with your hands", act: "careerSwitch", style: "safe", weight: 0.13, apply: (s2, c) => { s2.flags.vocational = true; return { text: c.w(`${then}, you transferred to the {vo-tech|career center} half days, learning {auto shop|welding|cosmetology|carpentry|health careers}, and for the first time school made sense.`), mood: 3 }; } },
        ],
        // Answers about working leave school; anything else stays.
        onFree: (action, s2) => { if (WORK_ACTIONS.has(action)) { leaveSchool(s2); s2.flags.dropout = s2.age; } },
      };
    },
  },
  {
    id: "ged", once: true, ages: [17, 50], when: s => !s.studying && s.edu === "middle" && s.done.has("highSchool"),
    p: (s, ctx) => rate(ctx, "ged", s.age) * (s.flags.gedPlan ? 2.5 : 1),
    apply: (s, ctx) => {
      s.edu = "ged";
      return { text: ctx.w(["You studied at night for months and passed the GED. {You framed it.|Your mom put it on the fridge.|Nobody threw you a party, so you bought yourself a cake.}", "You passed the GED on the first try, {in a church basement test center|at the community college on a Saturday morning}, {and walked out a little taller.|and called home from the parking lot.}", "{At {age}|Years after leaving}, you finally got your GED. {The diploma came in the mail in a cardboard sleeve.|It opened doors you had been knocking on for a long time.}"]), mood: 5 };
    },
  },
  {
    // Graduation, and what comes next. The weights reproduce the share who enroll in college right after high school
    // (rate college), the share of them at a two-year school (communityShare) and, among the rest, the share who
    // enlist (enlist).
    id: "senior", calibrated: true, ages: [17, 20], when: s => inHigh(s) && s.age >= (s.flags.trackAt ?? 14) + 4 && !s.flags.doneSenior, p: () => 1,
    choice: (s, ctx) => {
      s.edu = "high";
      // The five shares after graduation: rates.js afterHighSchool when it has them, else composed from the parts.
      const ahs = ctx.R && typeof ctx.R.afterHighSchool === "function" ? ctx.R.afterHighSchool(s.year, s.sex, s.birthYear) : null;
      const enter = rate(ctx, "college", s.year, s.track), cc = rate(ctx, "communityShare", s.year), en = Math.min(0.5, rate(ctx, "enlist", s.sex, s.year));
      const W = ahs || { college: enter * (1 - cc), community: enter * cc, trade: (1 - enter) * 0.22, military: (1 - enter) * en, work: (1 - enter) * Math.max(0, 0.78 - en) };
      const good = ctx.rng() < ctx.odds("study", "good", 0.35);
      const done = s2 => { s2.flags.doneSenior = true; };
      const parent = parentWord(s, ctx), first = s.year < 1990 ? ctx.rng() < 0.35 : ctx.rng() < 0.2;
      const test = s.year < 1960 ? "your grades" : ctx.rng.pick(["your SAT scores", "your ACT score"]);
      const letter = s.year < 2005 ? "a thick envelope" : "an email that started with “Congratulations”";
      const lead = scene(ctx, [
        `You graduated from high school${s.year >= 2020 && s.year <= 2021 ? " in a drive-through ceremony, honking in the parking lot" : ", throwing your cap with everyone else"}.`,
        good ? `${cap(test)} came back better than you hoped, and ${letter} came from the college you wanted.` : `${cap(test)} came back about where you expected, and you have your diploma.`,
        `At graduation ${parent} ${isAre(parent) === "are" ? "were" : "was"} in the bleachers, yelling your name louder than anyone.`,
        first ? "You would be the first in your family to go to college, if you go." : null,
        s.year >= 1992 ? `The guidance counselor handed you a FAFSA form and a list of deadlines.` : `The guidance counselor handed you a stack of college brochures and a list of deadlines.`,
        s.sex === "male" && s.year >= 1980 ? "A recruiter set up a table in the cafeteria every Friday of senior year." : null,
      ]);
      const trade = ctx.rng.pick(["electrician", "welding", "cosmetology", "HVAC", "auto mechanics", "plumbing", "dental assisting", "practical nursing"]);
      const branch = pickBranch(ctx);
      const L = {
        state: ctx.rng.pick([["Go to the state university", "four years, in-state tuition"], ["Go to the big state school", "football Saturdays, big lectures"]]),
        away: ctx.rng.pick([["Go away to a private college", "smaller classes, bigger loans"], ["Go to a college out of state", "far from home, on purpose"]]),
        cc: ctx.rng.pick([["Start at community college", "cheap, close, and you can transfer"], ["Two years at the community college first", "save money, figure things out"]]),
        trade: [`Go to trade school for ${trade}`, "a skill and a paycheck sooner"],
        enlist: [`Enlist in the ${branch}`, s.year >= 1973 ? "the GI Bill, travel, discipline" : "serve, and get it done"],
        work: ctx.rng.pick([["Get a job", "start earning now"], ["Start working full-time", "school can wait"]]),
      };
      const ok = good ? "{It was the one you wanted.|You opened the letter in the driveway and screamed.}" : "{It was not your first choice, but it felt right.|You were nervous and excited in equal parts.}";
      const loan = s.year >= 2000 ? 0.4 : s.year >= 1980 ? 0.25 : 0.1;
      return {
        prompt: `${lead} ${ctx.rng.pick(["What comes next?", "What's the plan?", "Where do you go from here?"])}`,
        options: [
          { id: "senior.state", label: L.state[0], hint: L.state[1], act: "study", style: "learn", weight: W.college * 0.72, apply: (s2, c) => { done(s2); s2.track = "college"; s2.flags.uniAt = s2.age; s2.debt += loan; return { text: c.w(`You went off to the state university. ${ok} {${cap(parent)} helped you carry a mini fridge up four flights of stairs.|Your dorm room was the size of a closet, and you loved it.|Your roommate had a lava lamp and opinions about music.}`), mood: good ? 7 : 4 }; } },
          { id: "senior.away", label: L.away[0], hint: L.away[1], act: "study", style: "risk", weight: W.college * 0.28, apply: (s2, c) => { done(s2); s2.track = "college"; s2.flags.uniAt = s2.age; s2.flags.awayCollege = true; s2.debt += loan * 2; return { text: c.w(`You went away to college, {a small campus with ivy on the brick|a school three states from home|a place with more snow than you had ever seen}. ${ok} {The loan papers were thick, but so was the course catalog.|You called home every Sunday from the hall phone.}`), mood: good ? 7 : 4, big: true }; } },
          { id: "senior.cc", label: L.cc[0], hint: L.cc[1], act: "study", style: "safe", weight: W.community, apply: (s2, c) => { done(s2); s2.track = "community"; s2.flags.ccAt = s2.age; return { text: c.w("You enrolled at the community college, {living at home and working weekends.|taking night classes and a lunch shift.|with a plan to transfer in two years.} {The parking lot was always full.|Your English professor changed how you read.}"), mood: 3 }; } },
          { id: "senior.trade", label: L.trade[0], hint: L.trade[1], act: "careerSwitch", style: "safe", weight: W.trade, apply: (s2, c) => { done(s2); s2.track = "trade"; s2.flags.tradeAt = s2.age; s2.flags.trade = trade; return { text: c.w(`You signed up for trade school in ${trade}. {The instructor had forty years in the business and no patience for excuses.|You liked going home tired from doing something real.}`), mood: 3 }; } },
          { id: "senior.enlist", label: L.enlist[0], hint: L.enlist[1], act: "workAbroad", style: "risk", weight: W.military, apply: (s2, c) => { done(s2); leaveSchool(s2); enlist(s2, c, branch, 4); return { text: c.w(`You enlisted in the ${branch}. {Basic training took your hair and gave you a lot of push-ups.|${cap(parent)} drove you to the recruiting office and did not say much on the way home.|The bus to boot camp left at five in the morning.}`), mood: 2, big: true }; } },
          { id: "senior.work", label: L.work[0], hint: L.work[1], act: "jobSearch", style: "self", weight: W.work, apply: (s2, c) => { done(s2); leaveSchool(s2); return { text: c.w("With your diploma in hand, you decided to start working {right away.|and figure out the rest later.|and stop being broke.}"), mood: 1 }; } },
        ],
        // Studying (here or abroad) is college; any other answer leaves school.
        onFree: (action, s2) => {
          done(s2);
          if (action === "study" || action === "studyAbroad") { s2.track = "college"; s2.flags.uniAt = s2.age; } else leaveSchool(s2);
        },
      };
    },
  },
  {
    id: "tradeDone", once: true, ages: [18, 30], when: s => s.studying && s.track === "trade" && s.age >= (s.flags.tradeAt ?? 18) + 1,
    p: s => (s.age >= (s.flags.tradeAt ?? 18) + 2 ? 1 : 0.5),
    apply: (s, ctx) => {
      s.edu = "certificate"; leaveSchool(s);
      const t = s.flags.trade || "your trade";
      return { text: ctx.w([`You finished trade school in ${t} and {passed the licensing exam on the first try.|got your certificate in the mail and had it laminated.}`, `Trade school in ${t}, done. {Your instructor shook your hand and said you had good hands.|You already had two places asking about you.}`, `You earned your certificate in ${t}{, the first credential anyone in the family had framed| and celebrated with burgers}.`]), mood: 4 };
    },
  },
  {
    // Community college, two years: transfer to a four-year school (rate transfer), or go to work.
    id: "ccDone", once: true, ages: [19, 30], when: s => s.studying && s.track === "community" && s.age >= (s.flags.ccAt ?? 18) + 2, p: () => 1,
    choice: (s, ctx) => {
      s.edu = "associate";
      const t = Math.min(0.8, rate(ctx, "transfer", s.year));
      const lead = scene(ctx, [
        "You finished your associate's degree at the community college.",
        "You walked across the stage at the community college gym with your associate's degree.",
        `Two years of night classes and ${s.year < 1990 ? "a bus pass" : "a used car"} later, you have an associate's degree.`,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What's next?", "Now what?"])}`,
        options: [
          { id: "ccDone.transfer", label: "Transfer to the state university", hint: "two more years for a bachelor's", act: "study", style: "learn", weight: t * 0.8, apply: (s2, c) => { s2.track = "college"; s2.flags.uniAt = s2.age - 2; return { text: c.w("You transferred to the state university as a junior, {and the credits mostly came with you.|and found the big lectures less scary than you expected.}"), mood: 4 }; } },
          { id: "ccDone.away", label: "Transfer to a school farther away", hint: "a fresh start", act: "study", style: "risk", weight: t * 0.2, apply: (s2, c) => { s2.track = "college"; s2.flags.uniAt = s2.age - 2; s2.debt += 0.3; return { text: c.w("You transferred to a four-year school {across the state|out of state}, packed the car, and {did not look back.|cried a little at the first rest stop.}"), mood: 4 }; } },
          { id: "ccDone.work", label: "Go to work", hint: "the degree is enough for now", act: "jobSearch", style: "safe", weight: (1 - t) * 0.77, apply: (s2, c) => { leaveSchool(s2); return { text: c.w("With your associate's degree, you {went straight to work.|started looking for a real job.|took the job offer from your internship.}"), mood: 3 }; } },
          { id: "ccDone.night", label: "Work, and keep taking classes at night", hint: "slow, but no new loans", act: "study", style: "safe", weight: (1 - t) * 0.12, apply: s2 => { leaveSchool(s2); s2.flags.nightSchool = { from: s2.age }; return { text: "You took a full-time job and kept taking a class or two at night, chipping away at a bachelor's.", mood: 2 }; } },
          { id: "ccDone.rest", label: "Take a break and figure it out", hint: "no rush", act: "rest", style: "self", weight: (1 - t) * 0.11, apply: (s2, c) => { leaveSchool(s2); return { text: c.w("With the associate's degree done, you {took a summer off to think.|worked odd jobs and figured out what you wanted.}"), mood: 2 }; } },
        ],
        onFree: (action, s2) => { if (action === "study" || action === "studyAbroad") { s2.track = "college"; s2.flags.uniAt = s2.age - 2; } else leaveSchool(s2); },
      };
    },
  },
  {
    // Not everyone who starts college finishes (about 6 in 10 finish a bachelor's within six years; far fewer from
    // community college). rate collegeDropout is the yearly share who leave.
    id: "uniDropout", calibrated: true, once: true, ages: [18, 30],
    when: s => s.studying && !s.abroad && ((s.track === "college" && s.age > (s.flags.uniAt ?? 18) && s.age < (s.flags.uniAt ?? 18) + 4) || (s.track === "community" && s.age >= (s.flags.ccAt ?? 18) && s.age < (s.flags.ccAt ?? 18) + 2)),
    p: (s, ctx) => rate(ctx, "collegeDropout", s.year, s.track),
    apply: (s, ctx) => {
      const where = s.track === "community" ? "community college" : "college";
      leaveSchool(s); s.flags.dropout = s.age;
      return { text: ctx.w([`You left ${where} {after your sophomore year|halfway through junior year|after one hard semester}. {The money ran out before the credits did.|You had changed majors three times and still did not know.|Your family needed you at home.}`, `You stopped going to ${where}. {The loans were piling up and the classes felt pointless.|A full-time job was already eating your weekdays.} {Your parents were quiet about it, which was worse.|You kept the textbooks for years, just in case.}`, `You withdrew from ${where} {with a semester of incompletes|on a gray Tuesday in February}, {and told yourself it was a pause.|and felt lighter and worse at the same time.}`]), mood: -3 };
    },
  },
  {
    // Graduation from a four-year college: work, or graduate school (rate master).
    id: "graduateUni", calibrated: true, once: true, ages: [21, 34], when: s => s.studying && s.track === "college" && s.age >= (s.flags.uniAt ?? 18) + 4, p: () => 1,
    choice: (s, ctx) => {
      s.edu = "bachelor";
      const p = Math.min(0.6, rate(ctx, "master", s.year));
      const med = /bio|chem|nurs|pre-?med|neuro/i.test(s.flags.collegeMajor || "") || ctx.rng() < 0.35;
      const gap = s.year >= 1961 ? ctx.rng.pick([...(s.year >= 1961 ? ["Join the Peace Corps"] : []), ...(s.year >= 1994 ? ["Do a year of AmeriCorps"] : []), ...(s.year >= 1990 ? ["Teach for two years in a rural school"] : []), "Backpack through Europe"]) : "Backpack through Europe";
      const lead = scene(ctx, [
        "You graduated from college!",
        `You walked across the stage in a rented gown, and ${parentWord(s, ctx)} took about four hundred photos.`,
        s.year >= 2008 && s.year <= 2010 ? "You graduated from college right into the Great Recession, and half your friends moved back home." : null,
        s.year === 2020 || s.year === 2021 ? "Your college graduation happened on a laptop screen, and the job market was frozen." : null,
        s.year >= 1980 && s.year <= 1982 ? "You graduated from college into a recession, with interest rates through the roof." : null,
        "A professor asked whether you had thought about graduate school, and your roommates all had different plans.",
      ]);
      const L = {
        work: ctx.rng.pick([["Get a job", "start paying off the loans"], ["Start job hunting", "be a grown-up for real"]]),
        city: ctx.rng.pick([["Move to a big city for work", "New York, Chicago, the West Coast"], ["Chase a job in the big city", "expensive, exciting"]]),
        gap: [gap, gap.startsWith("Join") ? "two years abroad, serving" : "see something before the desk job"],
        master: ctx.rng.pick([["Go to grad school", "a master's in two years"], ["Get a master's degree", "more school, better odds"]]),
        pro: med ? ["Apply to medical school", "four years, then residency"] : ["Go to law school", "three years, then the bar"],
        phd: ["Start a PhD", "five or six years of research"],
      };
      const proTrack = med ? "med" : "law";
      return {
        prompt: `${lead} ${ctx.rng.pick(["What's next?", "Where do you go from here?", "What do you do now?"])}`,
        options: [
          { id: "graduateUni.work", label: L.work[0], hint: L.work[1], act: "jobSearch", style: "safe", weight: (1 - p) * 0.78, apply: (s2, c) => { leaveSchool(s2); return { text: c.w(["With your bachelor's degree, you {started applying everywhere.|rewrote your résumé six times.|moved back home just for the summer, you said.}", "Diploma in a frame, you {started the job hunt.|bought your first suit for interviews.|printed fifty copies of your résumé at the campus library.}"]), mood: 3 }; } },
          { id: "graduateUni.city", label: L.city[0], hint: L.city[1], act: "moveHome", style: "risk", weight: (1 - p) * 0.1, apply: (s2, c) => { leaveSchool(s2); const to = placeWords(moveTo(s2, c, [["NY", 3], ["CA", 3], ["IL", 1.5], ["TX", 1.5], ["DC", 1], ["MA", 1], ["WA", 1]])); return { text: c.w(`Fresh out of college, you moved to ${to} with {two suitcases and a futon|a friend from school and a lease you could barely afford|$800 and a lot of nerve}.`), mood: 4, big: true }; } },
          { id: "graduateUni.gap", label: L.gap[0], hint: L.gap[1], act: "travel", style: "learn", weight: (1 - p) * 0.12, apply: (s2, c) => {
            leaveSchool(s2);
            if (gap === "Join the Peace Corps") { s2.abroad = c.rng.pick(["Kenya", "Guatemala", "the Philippines", "Morocco", "Ukraine", "Peru"]); s2.leftAt = s2.age; s2.flags.backAt = s2.age + 2; return { text: `After college you joined the Peace Corps and spent two years in ${s2.abroad}, teaching and learning far more than you taught.`, mood: 6, big: true }; }
            if (gap === "Backpack through Europe") return { text: c.w("After college you backpacked through Europe {with a Eurail pass and a paperback guidebook|sleeping in hostels and eating bread and cheese}, {and came home broke and happy.|and still talk about the night train to Rome.}"), mood: 6, big: true };
            return { text: c.w(`After college you ${gap === "Do a year of AmeriCorps" ? "did a year of AmeriCorps, {tutoring kids in a city school|building houses}" : "taught for two years in a rural school, {where the kids called you by your first name by October|coaching basketball on the side}"}.`), mood: 5, big: true };
          } },
          { id: "graduateUni.master", label: L.master[0], hint: L.master[1], act: "study", style: "learn", weight: p * 0.6, apply: (s2, c) => { s2.track = "grad"; s2.flags.gradAt = s2.age; s2.debt += 0.3; return { text: c.w("You went straight into a master's program, {with a teaching assistantship that covered most of the tuition.|living on ramen and library hours.|with a new set of very serious friends.}"), mood: 4 }; } },
          { id: "graduateUni.pro", label: L.pro[0], hint: L.pro[1], act: "study", style: "risk", weight: p * 0.28, apply: (s2, c) => { s2.track = proTrack; s2.flags.gradAt = s2.age; s2.debt += proTrack === "med" ? 1.5 : 1; return { text: proTrack === "med" ? c.w("You got into medical school. {The white coat ceremony made your mother cry.|The first anatomy lab you will never forget.}") : c.w("You started law school, {and the first-year reading list weighed more than your backpack.|where the professors called on you without warning.}"), mood: 5, big: true }; } },
          { id: "graduateUni.phd", label: L.phd[0], hint: L.phd[1], act: "study", style: "learn", weight: p * 0.12, apply: (s2, c) => { s2.track = "phd"; s2.flags.gradAt = s2.age; return { text: c.w("You started a PhD, {with a small stipend and a big question.|in a lab that ran on coffee and deadlines.}"), mood: 4 }; } },
        ],
        onFree: (action, s2) => { if (action === "study" || action === "studyAbroad") { s2.track = "grad"; s2.flags.gradAt = s2.age; } else leaveSchool(s2); },
      };
    },
  },
  {
    // Graduate school ends: a master's in 2 years, law school in 3 (then the bar), med school in 4 (then the Match and a
    // residency, which is a job), a PhD in 5–6.
    id: "graduateMaster", once: true, ages: [23, 40],
    when: s => s.studying && ["grad", "law", "med", "phd"].includes(s.track) && s.age >= (s.flags.gradAt ?? 22) + { grad: 2, law: 3, med: 4, phd: 5 }[s.track],
    p: s => (s.track === "phd" && s.age < (s.flags.gradAt ?? 22) + 6 ? 0.5 : 1),
    apply: (s, ctx) => {
      const t = s.track;
      leaveSchool(s);
      if (t === "grad") { s.edu = "master"; return { text: ctx.w(["You finished your master's degree, {thesis and all.|and your parents drove four hours to see you hooded.|and celebrated with your cohort at the cheap bar near campus.}", "Master's degree: done. {You slept for two days.|You framed it next to your bachelor's.}"]), mood: 5 }; }
      if (t === "phd") { s.edu = "doctorate"; return { text: ctx.w(["You defended your dissertation, and your committee called you Doctor for the first time. {You cried in the hallway.|Your advisor popped a bottle of cheap champagne.}", "After {five|six} years, a few hundred pages and one crisis of faith, you earned your PhD."]), mood: 7, big: true }; }
      s.edu = "professional";
      if (t === "law") {
        const pass = ctx.roll("study", "good", 0.78);
        return { text: pass ? ctx.w("You graduated from law school and {passed the bar on the first try.|studied all summer for the bar and passed.} {You read the results three times to be sure.|Your name was in the state bar's list, and your mom printed it out.}") : "You graduated from law school but missed the bar by a few points. You took it again in February and passed.", mood: pass ? 7 : 2, big: true };
      }
      startJob(s, ctx, ["resident physician", 1.05, "health care", null]);
      return { text: ctx.w("You graduated from medical school, and on Match Day you opened the envelope {with shaking hands|in a room full of screaming classmates}. {Residency started in July, and so did the eighty-hour weeks.|You were a doctor, and a very tired one.}"), mood: 8, big: true };
    },
  },
  {
    id: "studyAward", domain: "study", channel: "good", ages: [7, 24], cooldown: 3, when: s => s.studying, p: () => 0.05,
    apply: (s, ctx) => ({ text: ctx.w(s.age <= 13 ? ["You won the school spelling bee {on the word “chrysanthemum.”|and your picture was in the local paper.}", "You made the honor roll, and {there was a bumper sticker for the car to prove it.|Grandma mailed you five dollars.}", "Your science fair project on {plant growth and music|which paper towel is strongest|a homemade battery} won first place."] : s.age <= 18 ? ["You made the honor roll {every quarter that year.|and the principal shook your hand.}", "You won {a state essay contest|the regional science fair|a debate tournament}{, and the trophy was taller than you expected.|.}", "You got a perfect score on the {AP Calculus|AP History|AP Biology} exam."] : ["You made the Dean's List, and your parents put the letter on the fridge.", "You won a scholarship that covered next year's tuition, and called home from the pay phone in the dorm hallway.", "A professor asked to publish your paper in the department journal."]), mood: 4 }),
  },
  {
    id: "studySetback", domain: "study", channel: "bad", ages: [10, 24], cooldown: 3, when: s => s.studying, p: () => 0.04,
    apply: (s, ctx) => ({ text: ctx.w(s.age <= 18 ? ["Your report card came home with a D in {math|science|Spanish}, and {you hid it in your backpack for a week.|the conference with your teacher was very long.}", "You failed a test you thought you aced, and {it stung for days.|your parents took away the TV until you brought it up.}", "You got a progress report that said “not working to potential,” and {Mom read it aloud at dinner.|you started doing homework at the kitchen table where someone could see you.}"] : ["You failed {organic chemistry|calculus|statistics} and had to retake it {in summer session.|while everyone else went home.}", "You landed on academic probation and {got serious about the library.|met with your advisor every two weeks.}", "You bombed a midterm so badly that the professor asked you to stay after class."]), mood: -3 }),
  },
  {
    // The end of a tour of service: the GI Bill, a civilian job, another tour, or a career in uniform.
    id: "serviceEnd", ages: [19, 60], when: s => s.flags.serviceUntil === s.age && s.job && s.job.field === "military", p: () => 1,
    choice: (s, ctx) => {
      const br = branchName(s);
      const years = s.age - ((s.flags.served && s.flags.served.from) ?? s.age - 4);
      const lead = scene(ctx, [
        `Your ${yearsWord(years)} in the ${br} are almost up.`,
        `Your enlistment in the ${br} ends this year, and your sergeant asked about your plans.`,
        s.rel === "married" && s.partner ? `Your time in the ${br} is ending, and ${s.partner.call} has been asking where you will be living next year.` : null,
        `A re-enlistment bonus offer showed up the same week as the GI Bill paperwork. Your ${br} contract ends soon.`,
      ]);
      const out = s2 => { s2.employed = false; s2.job = null; s2.flags.vet = true; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "What's next?"])}`,
        options: [
          { id: "serviceEnd.college", label: "Use the GI Bill for college", hint: "school, paid for", act: "study", style: "learn", weight: 0.25, apply: (s2, c) => { out(s2); s2.studying = true; s2.track = "college"; s2.flags.uniAt = s2.age; return { text: c.w(`You left the ${br} and used the GI Bill to go to college, {a few years older than everyone in your classes.|and found that the discipline made you a good student.}`), mood: 4, big: true }; } },
          { id: "serviceEnd.civilian", label: "Get a civilian job", hint: "home, and a regular life", act: "jobSearch", style: "safe", weight: 0.35, apply: (s2, c) => { out(s2); return { text: c.w(`You got out of the ${br} and came home{, and the first night you slept for fourteen hours.|, and it took a while to stop waking up at five.|, ready for a regular job.}`), mood: 2 }; } },
          { id: "serviceEnd.trade", label: "Take the skill you learned to a civilian job", hint: "the service trained you", act: "careerSwitch", style: "safe", weight: 0.12, apply: (s2, c) => { out(s2); const title = startJob(s2, c, otherJob(s2, c)); return { text: c.w(`You left the ${br} and went straight to work as ${an(title)}, {using what you learned in uniform.|with a reference from your old commanding officer.}`), mood: 3 }; } },
          { id: "serviceEnd.reup", label: "Re-enlist for another tour", hint: "the bonus, the brotherhood", act: "pushThrough", style: "risk", weight: 0.2, apply: (s2, c) => { s2.flags.serviceUntil = s2.age + 4; s2.career = Math.min(5, s2.career + 1); return { text: c.w(`You re-enlisted in the ${br} for four more years, {and made rank that spring.|and got orders for a new base.}`), mood: 1 }; } },
          { id: "serviceEnd.career", label: "Make it a career", hint: "twenty years, a pension", act: "pushThrough", style: "family", weight: 0.08, apply: (s2, c) => { s2.flags.serviceUntil = Math.max(s2.age + 8, ((s2.flags.served && s2.flags.served.from) ?? s2.age) + 20); s2.career = Math.min(5, s2.career + 1); return { text: c.w(`You decided to make the ${br} your career, {all the way to a pension.|moving your family from base to base.}`), mood: 2 }; } },
        ],
        onFree: (action, s2) => { if (action === "pushThrough") s2.flags.serviceUntil = s2.age + 4; else { s2.employed = false; s2.job = null; s2.flags.vet = true; if (action === "study") { s2.studying = true; s2.track = "college"; s2.flags.uniAt = s2.age; } } },
      };
    },
  },

  // ---------- work ----------
  {
    // The first job: a few offers, likelier the ones that suit the chart (prep.jobFit).
    id: "firstJob", calibrated: true, once: true, ages: [16, 40], when: s => !s.studying && !s.employed && !s.arcs.startup && !s.arcs.civil && !inService(s),
    p: (s, ctx) => rate(ctx, "jobFind", s.age),
    choice: (s, ctx) => {
      const list = jobsFor(s).slice(), offers = [];
      while (offers.length < Math.min(4, list.length)) {
        const j = ctx.rng.weighted(list.map(x => [x, Math.exp(fitOf(ctx, x))]));
        offers.push(j); list.splice(list.indexOf(j), 1);
      }
      const fits = offers.map(j => Math.exp(fitOf(ctx, j))), total = fits.reduce((a, b) => a + b, 0) || 1;
      const hint = job => { const f = fitOf(ctx, job); return `${job[2] || "work"}${f > 0.3 ? " · suits your chart" : f < -0.3 ? " · against your chart's grain" : ""}`; };
      const done = (s2, job) => {
        const title = startJob(s2, ctx, job), lead = fitOf(ctx, job) > 0.3 ? " Your chart would say it suits you." : "";
        return { text: ctx.w(["Your first real job: {title}.{lead}", "You started your first job as {aTitle}, and {your first paycheck went to a used car.|you bought a new shirt for the first day.|your first paycheck bought dinner for your parents.}{lead}", "You got hired as {aTitle}, {starting at the bottom and glad to be there.|with a name tag and a locker.|and called home from the parking lot.}{lead}"], { title, aTitle: an(title), lead }), mood: 5, big: true };
      };
      return {
        prompt: `${jobSearchLead(s, ctx)} ${ctx.rng.pick(["Which job do you take?", "Which one do you choose?", "Which offer do you say yes to?"])}`,
        options: [
          ...offers.map((job, i) => ({ id: `firstJob.${i}`, label: cap(job[0]), hint: hint(job), act: "jobSearch", weight: 0.92 * fits[i] / total, apply: s2 => done(s2, job) })),
          { id: "firstJob.wait", label: "None of these. Keep looking", hint: "it could take a while", act: "wait", style: "self", weight: 0.08, apply: () => ({ text: "None of the offers felt right, so you kept looking.", mood: -1 }) },
        ],
      };
    },
  },
  {
    id: "findJob", domain: "career", channel: "good", ages: [16, 70], when: s => !s.studying && !s.employed && s.done.has("firstJob") && !s.retired && !s.arcs.startup && !s.arcs.civil && !inService(s),
    p: () => 0.6,
    apply: (s, ctx) => {
      const first = !(s.jobsHeld || []).length && !s.job;
      const title = startJob(s, ctx);
      return first
        ? { text: ctx.w(["After a longer search, you landed your first real job: {title}.", "{Forty applications later|Thanks to a friend's referral}, you got your first real job, as {aTitle}."], { title, aTitle: an(title) }), mood: 6, big: true }
        : { text: ctx.w(["You found work again, as {aTitle}.", "{After months of applications|Through someone at church|Through an old coworker}, you got a new job as {aTitle}.", "You started a new job as {aTitle}, {and the relief felt physical.|and bought a new pair of work shoes.}"], { aTitle: an(title) }), mood: 6 };
    },
  },
  {
    id: "promotion", domain: "career", channel: "good", ages: [20, 70], cooldown: 2, when: s => s.employed && !s.retired && s.career < 5 && s.job,
    p: (s, ctx) => rate(ctx, "promotion", s.age),
    apply: (s, ctx) => {
      s.career += 1; s.income *= ctx.rng.between(1.08, 1.22);
      if (s.job.field === "military") return { text: ctx.w(["You {made sergeant|got promoted|picked up a stripe}, and {sewed the new patch on yourself.|called home that night.}", "You were promoted, and your commanding officer pinned the new rank on you in front of the unit."]), mood: 6 };
      const boss = ctx.rng.pick(["your manager", "your boss", "the regional director", "the owner"]);
      return { text: ctx.w(["You got promoted{ to {shift lead|assistant manager|senior|team lead|manager|director}}, and {the raise was real.|your business cards changed.|you called home before you told anyone else.}", "One {Friday afternoon|morning after the quarterly meeting}, {boss} called you in: “{Starting next month|Starting in January}, {the team|the project|the new department} is yours.”", "{Your work finally got noticed|The project you had carried for two years paid off}, and you were promoted. {You grinned the whole drive home.|You bought donuts for the whole team.|You slept like a baby that night.}"], { boss }), mood: 6 };
    },
  },
  {
    id: "jobChange", domain: "career", channel: "change", ages: [20, 64], cooldown: 2, when: s => s.employed && !s.retired && s.job && s.job.field !== "military" && s.job.field !== "family",
    p: (s, ctx) => rate(ctx, "jobChange", s.age),
    apply: (s, ctx) => {
      const before = s.job.title;
      s.income *= ctx.rng.between(0.92, 1.25);
      if (ctx.rng() < 0.25) { const [title, factor, field, element] = otherJob(s, ctx); s.job = { title, factor, field, element, since: s.age }; return { text: ctx.w(["You changed careers, from {before} to {title}.", "You traded being {aBefore} for a new life as {aTitle}, {and your friends said they saw it coming.|and the first month was humbling.}"], { before, title, aBefore: an(before), aTitle: an(title) }), mood: 2 }; }
      return { text: ctx.w(["You took a job at another company, still as {aT}, {with better people.|with a much shorter commute.|for a bit more money.}", "You jumped to {a competitor|a bigger company|a startup|a smaller shop with a better boss}, still working as {aT}{, and finally had a window.|, and the 401(k) match was better.|.}", "{A recruiter called|An old coworker brought you over|You saw a posting you could not ignore}, and you moved to a new company as {aT}."], { aT: an(before) }), mood: 2 };
    },
  },
  {
    // A layoff: the yearly risk follows US displacement rates, higher in recessions (rate layoff).
    id: "layoff", calibrated: true, domain: "career", channel: "bad", ages: [18, 70], cooldown: 3, when: s => s.employed && !s.retired && s.job && s.job.field !== "military" && s.job.field !== "family" && s.job.field !== "government",
    p: (s, ctx) => rate(ctx, "layoff", s.year),
    choice: (s, ctx) => {
      s.employed = false; s.unemployedFor = 1;
      const rust = inStates(s, ["OH", "MI", "PA", "IN", "IL", "WI", "NY"]);
      // Each scene: the question (now) and the opening of the result line (then).
      const [lead, then] = scene(ctx, [
        ["Your company is laying people off, and your name is on the list.", "Laid off in a round of cuts"],
        ["The company folded, and just like that you are out of work.", "When the company folded"],
        ["Your whole department was cut, and you got a box for your desk and two weeks' severance.", "With your department cut and two weeks' severance in hand"],
        s.year >= 1979 && s.year <= 1987 && rust ? ["The plant is closing for good, and the last shift walked out together.", "When the plant closed for good"] : null,
        s.year >= 1973 && s.year <= 1975 ? ["With the oil crisis and the recession, your company let half the floor go, you included.", "Laid off in the oil-crisis recession"] : null,
        s.year >= 1980 && s.year <= 1982 ? ["The recession hit, interest rates were sky-high, and you were laid off.", "Laid off in the recession"] : null,
        s.year >= 1990 && s.year <= 1992 ? ["The company was “restructuring,” a new word that year, and you were restructured out.", "Restructured out of a job"] : null,
        s.year >= 2001 && s.year <= 2002 ? ["The dot-com bubble burst, and your company shrank overnight. You are out.", "When the dot-com bubble took your job"] : null,
        s.year >= 2008 && s.year <= 2010 ? ["The Great Recession reached your office, and HR scheduled a fifteen-minute meeting with you.", "Laid off in the Great Recession"] : null,
        s.year === 2020 ? ["The pandemic shut everything down, and you were laid off by email.", "Laid off by email when the pandemic hit"] : null,
      ]);
      const gig = s.year >= 2014 ? "drive for Uber and deliver for DoorDash" : s.year >= 1975 ? "take temp jobs through an agency" : "pick up odd jobs";
      const retrain = s.year >= 2013 ? ["Learn to code at a bootcamp", "twelve weeks, a new career"] : ["Retrain at the community college", "slower, maybe better"];
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do now?", "What's your next move?", "How do you get through it?"])}`,
        options: [
          { id: "layoff.search", label: ctx.rng.pick(["File for unemployment and job hunt", "Start applying the same day"]), hint: "get the income back fast", act: "jobSearch", style: "safe", weight: 0.43, apply: (s2, c) => ({ text: c.w(`${then}, you filed for unemployment and {sent out résumés every morning like it was your job.|called everyone you had ever worked with.|bought a new tie for interviews.}`), mood: -8 }) },
          { id: "layoff.retrain", label: retrain[0], hint: retrain[1], act: "careerSwitch", style: "learn", weight: 0.17, apply: (s2, c) => { s2.flags.retrained = true; s2.income *= 1.08; return { text: c.w(`${then}, you used the time to ${retrain[0].toLowerCase()}, {${s.kids.length ? "studying at the kitchen table after the kids went to bed." : "studying at the kitchen table until midnight."}|the oldest one in the class, and the most focused.}`), mood: -5 }; } },
          { id: "layoff.gov", label: s.year < 1990 ? "Apply at the post office" : "Apply for a government job", hint: "steady, if you get it", act: "civilService", style: "safe", weight: 0.06, apply: (s2, c) => {
            if (c.roll("career", "good", 0.5)) { startJob(s2, c, [s2.year < 1990 ? "postal carrier" : "county clerk", 0.95, "government", null]); return { text: `${then}, you applied for a government job, passed the test, and started as ${s2.year < 1990 ? "a postal carrier" : "a county clerk"} with a pension plan.`, mood: 2 }; }
            return { text: `${then}, you applied for a government job and took the test, but the list was long. You kept looking.`, mood: -6 };
          } },
          { id: "layoff.rest", label: ctx.rng.pick(["Take a few months to breathe", "Spend time with family first"]), hint: "take care of yourself", act: "rest", style: "self", weight: 0.13, apply: (s2, c) => { s2.happiness += 4; return { text: c.w(`${then}, you let yourself take a few months off, {fixing things around the house you had ignored for years.|taking long walks and cooking real dinners.}`), mood: -4 }; } },
          { id: "layoff.gig", label: cap(gig), hint: "some money coming in", act: "sideJob", style: "safe", weight: 0.16, apply: s2 => { s2.income = Math.max(0.4, s2.income * 0.5); return { text: `${then}, you decided to ${gig} to keep the lights on while you looked.`, mood: -6 }; } },
          { id: "layoff.own", label: "Use the severance to start a business", hint: "be your own boss", act: "startup", style: "risk", weight: 0.05, when: s2 => s2.age >= 25 && s2.age <= 60, apply: (s2, c) => {
            const kind = c.rng.pick(s2.year >= 2005 ? ["food truck", "online store", "consulting business", "landscaping company"] : ["diner", "hardware store", "consulting business", "landscaping company"]);
            startJob(s2, c, [`owner of a small ${kind}`, c.roll("career", "good", 0.5) ? 1.1 : 0.75, "self-employed", null]);
            return { text: `${then}, you put everything into opening ${an(kind)}. The first year was terrifying and yours.`, mood: -1, big: true };
          } },
        ],
      };
    },
  },
  {
    id: "burnout", calibrated: true, domain: "health", channel: "bad", ages: [25, 64], cooldown: 5, when: s => s.employed && !s.retired, p: () => 0.02,
    choice: (s, ctx) => {
      const boss = ctx.rng.pick(["your boss", "your manager", "the VP"]);
      const lead = scene(ctx, [
        "Work has you so stressed that you can't sleep, and your body is starting to complain.",
        `Months of overtime, and now ${ctx.rng.pick(["your head pounds in every meeting", "your stomach hurts before work every morning", "you can't remember the last weekend you had off"])}.`,
        `${cap(boss)} dropped another project on your desk, and you realized you don't care about any of it anymore.`,
        s.rel === "married" && s.partner ? `You were answering work emails at midnight again, and ${s.partner.call} said you looked gray.` : null,
        s.year >= 2010 ? "Your phone buzzes with work messages at dinner, at bedtime, at your kid's recital. You've stopped sleeping well." : null,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you deal with it?"])}`,
        options: [
          { id: "burnout.leave", label: s.year >= 1993 ? "Take medical leave" : "Take a leave of absence", hint: "less money, more you", act: "rest", style: "health", weight: 0.35, apply: (s2, c) => { s2.income *= 0.95; return { text: c.w("Burned out at work, you took a few weeks of leave and {slept for most of the first one.|drove to the coast and sat on a lot of porches.|walked the same park loop every morning until you felt human.}"), mood: 2 }; } },
          { id: "burnout.doctor", label: s.year >= 1990 ? "See a therapist" : "See a doctor", hint: "get real help", act: "counsel", style: "health", weight: 0.15, apply: s2 => { s2.health.stress = Math.max(0, s2.health.stress - 0.2); return { text: `Burned out at work, you went to see ${s2.year >= 1990 ? "a therapist" : "your doctor"}, who said the quiet part out loud: you need real rest.`, mood: 1 }; } },
          { id: "burnout.talk", label: `Talk to ${boss} about the workload`, hint: "it might change things", act: "negotiate", style: "social", weight: 0.15, apply: (s2, c) => (c.roll("career", "good", 0.5) ? { text: `Burned out at work, you told ${boss} the truth, and ${boss} moved two projects off your plate.`, mood: 3 } : { text: `Burned out at work, you talked to ${boss}, who said everyone is stretched thin right now.`, mood: -2 }) },
          { id: "burnout.push", label: ctx.rng.pick(["Grit your teeth and push through", "Get through this quarter first"]), hint: "your body keeps score", act: "pushThrough", style: "risk", weight: 0.3, apply: s2 => { s2.health.hr *= 1.05; return { text: "Burned out at work, you pushed through anyway. You made the deadline, and your body remembered the year.", mood: -5 }; } },
          { id: "burnout.quit", label: ctx.rng.pick(["Quit", "Put in your two weeks"]), hint: "nothing is worth this", act: "quitJob", style: "self", weight: 0.05, apply: s2 => { s2.employed = false; s2.unemployedFor = 1; return { text: "Burned out at work, you put in your two weeks. The last day, you left your badge on the desk and felt the air come back.", mood: 1 }; } },
        ],
      };
    },
  },
  {
    // Retirement. Nine in ten options retire, so the event's chance is the rate divided by 0.9. Social Security can be
    // claimed from 62 (reduced) and in full at 66–67 (fullRetirementAge), with a bigger check for waiting to 70.
    id: "retire", calibrated: true, ages: [55, 80], when: s => s.employed && !s.retired && s.job && s.job.field !== "military",
    p: (s, ctx) => Math.min(1, rate(ctx, "retire", s.age, s.sex, s.year) / 0.9),
    choice: (s, ctx) => {
      const fra = fullRetirementAge(s.birthYear), early = s.age < 62, reduced = !early && s.age < fra;
      const lead = scene(ctx, [
        early ? "The company is offering an early-retirement package, and your number came up." : reduced ? `You are ${s.age}. You could start Social Security now, at a reduced rate, or keep going.` : `You are ${s.age}, past full retirement age, and the office birthday cakes are getting a lot of candles.`,
        `${s.rel === "married" && s.partner ? `${s.partner.call} has been circling dates on the calendar` : "You have been circling dates on the calendar"}, and HR sent over the retirement paperwork.`,
        s.kids.length ? `Your ${s.kids.length > 1 ? "kids keep" : "kid keeps"} asking when you will finally retire.` : null,
        "You did the math on the 401(k) at the kitchen table, twice, and it says you could stop.",
      ]);
      const go = (s2, text, mood = 4) => { s2.retired = true; s2.employed = false; return { text, mood, big: true }; };
      const party = ctx.rng.pick(["Your coworkers threw you a sheet cake party in the break room.", "The young folks on the team gave you a card everyone had signed.", "Your boss gave a speech that was surprisingly moving."]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["Are you ready to retire?", "Is it time?", "What do you do?"])}`,
        options: [
          { id: "retire.now", label: early ? "Take the package and retire" : "Retire and start Social Security", hint: reduced ? "a smaller check, starting now" : "you've earned it", act: "retire", style: "self", weight: 0.4, apply: (s2, c) => go(s2, c.w(`You retired at ${s2.age}. ${party} {The first Monday, you still woke up at six.|You cleaned out your desk and found your first business card.|You stood in the parking lot a long minute before driving home.}`)) },
          { id: "retire.delay", label: "Retire, but wait to claim until 70", hint: "live on savings, bigger checks later", act: "save", style: "safe", weight: 0.15, when: s2 => s2.age < 70, apply: (s2, c) => { s2.flags.ssDelay = true; return go(s2, c.w(`You retired at ${s2.age} and decided to wait until 70 to claim Social Security, living on savings for now. ${party}`)); } },
          { id: "retire.phase", label: "Retire, then work part-time", hint: "ease out of it", act: "sideJob", style: "safe", weight: 0.2, apply: (s2, c) => { s2.flags.partTimeRetired = true; return go(s2, c.w(`You retired at ${s2.age} and {picked up a few shifts a week at the hardware store.|took on a little consulting from home.|became a part-time greeter and knew everyone in town.}`)); } },
          { id: "retire.travel", label: s.year >= 1970 ? "Retire and buy the RV" : "Retire and see the country", hint: "the open road", act: "travel", style: "risk", weight: 0.15, apply: (s2, c) => { s2.savings = Math.max(0, s2.savings - 0.3); return go(s2, c.w(`You retired at ${s2.age} and hit the road{ in a used RV|}, {seeing the Grand Canyon, Yellowstone and every diner in between.|with a map of the national parks you checked off one by one.}`), 6); } },
          { id: "retire.notYet", label: "Not yet. Keep working", hint: "you like it, or you need it", act: "pushThrough", style: "risk", weight: 0.1, apply: () => ({ text: "You thought about retiring, then decided you were not done yet.", mood: 0 }) },
        ],
      };
    },
  },
  // ---------- love ----------
  {
    id: "crush", domain: "love", channel: "good", ages: [11, 18], cooldown: 3, p: () => 0.15,
    apply: (s, ctx) => {
      const chat = chatOf(s.year);
      return { text: ctx.w(s.year < 1990 ? ["You had a crush on someone in {homeroom|band|the grade above you} and {doodled their initials in every notebook.|walked the long way home past their house.}", "Someone slipped you a note that said “Do you like me? Check yes or no.” {You checked yes.|You checked “maybe” and regretted it for a week.}", `You talked to your crush on ${chat} for two hours, {stretching the cord into the pantry for privacy.|until your dad picked up the other line.}`] : s.year < 2010 ? ["You had a crush on someone in {homeroom|band|your lab group} and {wrote their name in your notebook margins.|saved their away message in a file.}", `You stayed up talking to your crush on ${chat}, {and rewrote every message three times.|and were exhausted for first period.}`, "You slow-danced with your crush at the school dance, {at arm's length, to a song that lasted forever.|and your friends would not stop talking about it.}"] : ["You had a crush on someone in {homeroom|band|your lab group} and {checked whether they had liked your post.|made a playlist you never sent.}", `You and your crush talked in ${chat} until midnight, {and you screenshotted the good parts.|and a single “haha” kept you up thinking.}`, "Your crush asked you to the school dance {with a poster and a box of donuts.|by text, which still counted.}"]), mood: 2 };
    },
  },
  {
    // The partner from the family input, when there is one, is the first partner once you are both adults
    // (people.js realPartnerDue); everyone else is drawn at random.
    id: "dating", domain: "love", channel: "good", tags: ["spouse"], ages: [17, 80], when: (s, ctx) => (s.rel === "single" || s.rel === "divorced" || s.rel === "widowed") && !realPartnerWaiting(s, ctx),
    p: (s, ctx) => rate(ctx, "dating", s.age, s.rel, s.year, s.sex) * (s.flags.pursueUntil >= s.age ? 1.8 : 1) * (keptForPartner(s, ctx) ? 2 : 1),
    apply: (s, ctx) => {
      s.prevRel = s.rel; s.rel = "dating"; s.datingSince = s.age;
      const real = realPartnerDue(s, ctx);
      let p;
      if (real) { p = realPartner(s, ctx, real); s.flags.realPartnerMet = s.age; }
      else {
        const partnerAge = Math.max(17, s.age + Math.round(ctx.rng.between(-3, 4)) * (s.sex === "male" ? -1 : 1));
        p = ctx.person({ role: "partner", sex: datingSex(s, ctx), birthYear: s.year - partnerAge, how: meetPlace(s, ctx) });
        p.age = partnerAge;
      }
      s.partner = p;
      const met = metLead(p), word = p.nature && p.nature.word ? p.nature.word : "kind";
      const again = s.prevRel === "divorced" || s.prevRel === "widowed";
      return { text: ctx.w([`${met} {name}, ${an(word)} person, and {you started seeing each other.|it was serious within a month.}`, `${met} {name}, and {you talked until the restaurant stacked the chairs.|the first date lasted nine hours.|you both laughed at the same wrong moment in the movie.}`, `${met} {name}. {Your first impression: ${word}.|You went home and told ${again ? "a friend" : "your roommate"} you had met someone.} {Soon you were a couple.|A few months later you were official.}`], { name: p.call }), mood: 6, big: !!p.real };
    },
  },
  {
    // The year given for getting together with the family input's partner: they come into the story that year.
    id: "realPartnerMeet", domain: "love", channel: "good", tags: ["spouse"], rare: true, once: true, ages: [14, 95],
    when: (s, ctx) => { const m = realPartnerDue(s, ctx); return !!m && realPartnerPlan(m).meet !== null && s.rel !== "married"; },
    p: () => 1,
    apply: (s, ctx) => {
      let before = "";
      if (s.rel === "dating" && s.partner) { before = `After you and ${s.partner.call} broke up, `; endRelationship(s, ctx); }
      const m = realPartnerDue(s, ctx);
      s.prevRel = s.rel; s.rel = "dating"; s.datingSince = s.age;
      const p = realPartner(s, ctx, m);
      s.flags.realPartnerMet = s.age; s.partner = p;
      const met = before ? metLead(p).replace(/^./, ch => ch.toLowerCase()) : metLead(p);
      return { text: ctx.w(`${before}${met} {name}, {and you were together almost right away.|and something just clicked.|and that was that.}`, { name: p.call }), mood: 6, big: true };
    },
  },
  {
    // The wedding year given for the family input's partner: you marry that year.
    id: "realPartnerWedding", domain: "love", channel: "good", tags: ["spouse"], about: "partner", rare: true, once: true, ages: [16, 95],
    when: (s, ctx) => realPartnerWeddingDue(s, ctx) && canMarry(s),
    p: () => 1,
    apply: (s, ctx) => {
      const name = s.partner.call;
      marry(s);
      return { text: ctx.w(`You married ${name}! {${s.father.alive || s.mother.alive ? "Your parents cried harder than you did." : "You felt your parents there anyway."}|Both families squeezed into one reception hall, and everyone danced.|You signed the license at the courthouse and laughed the whole way home.}`), mood: 10, big: true };
    },
  },
  {
    id: "breakup", domain: "love", channel: "bad", tags: ["spouse"], about: "partner", cooldown: 1, when: (s, ctx) => s.rel === "dating" && s.age > s.datingSince && !realPartnerEngaged(s, ctx) && !realPartnerSteady(s, ctx),
    p: (s, ctx) => rate(ctx, "breakup", s.age, s.year, s.sex) * (s.guard > 0 ? 0.6 : 1) * (s.crisis > 0 ? 1.5 : 1),
    apply: (s, ctx) => {
      const name = s.partner ? s.partner.call : "them", pr = they(s.partner);
      endRelationship(s, ctx);
      return { text: ctx.w(["You and {name} broke up, and it hurt for a long time.", "You and {name} wanted different lives, and you ended it kindly.", `{name} said ${pr} needed space, and the space got bigger until it was the whole thing.`, "The night you and {name} broke up, you {drove around for an hour with the radio off.|put the photos in a shoebox on the top shelf.|ate a whole pint of ice cream standing up.}"], { name }), mood: -6 };
    },
  },
  {
    id: "proposal", calibrated: true, domain: "love", channel: "good", tags: ["spouse"], about: "partner",
    when: (s, ctx) => s.rel === "dating" && s.age > s.datingSince && !realPartnerAhead(s, ctx) && !realPartnerEngaged(s, ctx) && !realPartnerWeddingDue(s, ctx) && canMarry(s),
    p: (s, ctx) => { const q = rate(ctx, "proposal", s.age, s.sex, s.year, s.marriages); return sameSexCouple(s) && s.year <= SAME_SEX_MARRIAGE + 1 ? Math.max(0.5, q) : q; },
    choice: (s, ctx) => {
      const name = s.partner ? s.partner.call : "your partner", P = s.partner;
      const again = s.marriages > 0, years = Math.max(1, s.age - s.datingSince);
      const wed = (s2, text) => { marry(s2); return { text: again ? ctx.w([`You married ${name}, and this time you both knew what you were promising.`, `After one marriage behind you, you married ${name}, more carefully and more gladly.`]) : text, mood: 10, big: true }; };
      const lead = scene(ctx, [
        `You and ${name} have been together ${years === 1 ? "a year" : `${years} years`}, and the question of marriage is on the table.`,
        `${name} got down on one knee ${ctx.rng.pick(["at the overlook where you had your first date", "in the middle of the kitchen", "on the beach at sunset", "on Christmas morning, next to the tree"])}.`,
        s.year >= 1990 ? `Your names lit up on the Jumbotron at a ballgame: ${name} was proposing.` : null,
        `You and ${name} started looking at apartments together, and ${they(P)} asked what you thought about forever.`,
        `Your friends are all getting married. ${name} looked at the stack of wedding invitations on the fridge and said, “What about us?”`,
        sameSexCouple(s) && s.year >= 2015 && s.year <= 2016 ? `When the Supreme Court ruled in June 2015, ${name} turned to you on the couch and said, “So. Should we?”` : null,
        s.year < 1975 && s.sex === "female" && P && P.sex === "male" && s.father.alive ? `${name} asked your father's blessing first, the way people did then, and then asked you.` : null,
        s.year >= 2020 && s.year <= 2021 ? `The pandemic canceled half the weddings you were invited to, and ${name} asked if you wanted to get married anyway.` : null,
      ]);
      const L = {
        big: s.year < 1990 ? ctx.rng.pick([["A church wedding with everyone", "the whole family, the whole town"], ["A big wedding and a reception hall", "Mom has a list"]]) : ctx.rng.pick([["A big wedding with everyone", "a DJ, a dance floor, all the cousins"], ["A wedding at a barn venue", "string lights and mason jars"]]),
        small: ctx.rng.pick([["City hall, then a nice dinner", "simple and official"], ["A small backyard wedding", "only the people you love most"]]),
        elope: ["Elope to Las Vegas", "a chapel, an Elvis, no fuss"],
        wait: ctx.rng.pick([["Not yet", "you're not ready"], ["Wait until you've saved some money", "get on solid ground first"], ["Wait until work settles down", "the timing is wrong"]]),
        no: ctx.rng.pick([["Break up", "you want different futures"], ["Tell the truth and part ways", "better now than later"]]),
      };
      const bigText = L.big[0].includes("barn") ? `You married ${name} in a barn strung with lights, {and your uncle gave a toast nobody will forget.|and the DJ played your song twice.}` : `You married ${name}! {${s.father.alive || s.mother.alive ? "Your parents cried harder than you did." : "You wished your parents could have seen it."}|The reception ran until the hall turned the lights on.|Every cousin you have was on the dance floor.}`;
      const smallText = L.small[0].startsWith("City hall") ? `You and ${name} got married at city hall {with two friends as witnesses,|on a Tuesday lunch break,} then {had the best steak dinner of your lives.|went out for pancakes.}` : `You married ${name} in a backyard full of folding chairs, {and the neighbor's dog crashed the vows.|and your best friend officiated.}`;
      const waitText = L.wait[0].startsWith("Wait until you've saved") ? `${name} was ready to get married. You wanted some money in the bank first, so you waited.` : L.wait[0].startsWith("Wait until work") ? `${name} was ready to get married. You wanted work to settle down first, so you waited.` : `${name} was ready to get married. You weren't, not yet, and you said so.`;
      return {
        prompt: `${lead} ${ctx.rng.pick(["Do you get married?", "What's your answer?", "Is this it?"])}`,
        options: [
          { id: "proposal.big", label: L.big[0], hint: L.big[1], act: "marry", style: "family", weight: 0.42, apply: s2 => { s2.savings = Math.max(0, s2.savings - 0.2); return wed(s2, ctx.w(bigText)); } },
          { id: "proposal.small", label: L.small[0], hint: L.small[1], act: "marry", style: "safe", weight: 0.35, apply: s2 => wed(s2, ctx.w(smallText)) },
          { id: "proposal.elope", label: L.elope[0], hint: L.elope[1], act: "marry", style: "risk", weight: 0.08, apply: s2 => wed(s2, ctx.w(`You and ${name} flew to Las Vegas and got married in a little chapel{, with an Elvis impersonator as a witness.|, and called your parents from the hotel.|, still in your travel clothes.}`)) },
          { id: "proposal.wait", label: L.wait[0], hint: L.wait[1], act: "wait", style: "safe", weight: 0.11, apply: () => ({ text: waitText, mood: -1 }) },
          { id: "proposal.no", label: L.no[0], hint: L.no[1], act: "separate", style: "self", weight: 0.04, apply: (s2, c) => { endRelationship(s2, c); return { text: c.w(`When marriage came up, you and ${name} realized you wanted different futures, {and you broke up.|and after a long talk, you let each other go.}`), mood: -6 }; } },
        ],
      };
    },
  },
  {
    id: "crisis", calibrated: true, domain: "love", channel: "bad", tags: ["spouse"], about: "partner", cooldown: 4, when: s => s.rel === "married",
    p: (s, ctx) => rate(ctx, "crisis", yearsMarried(s)) * (s.partner && s.partner.nature && s.partner.nature.crisis ? s.partner.nature.crisis : 1),
    choice: (s, ctx) => {
      const name = s.partner ? s.partner.call : "your spouse", P = s.partner;
      const topic = ctx.rng.pick(s.kids.length ? ["money", "the kids", "who does the dishes", "whose family gets Thanksgiving", "work eating every evening"] : ["money", "whether to have kids", "who does the dishes", "whose family gets Thanksgiving", "work eating every evening"]);
      const little = s.kids.find(k => k.age >= 4 && k.age <= 15);
      const lead = scene(ctx, [
        `You and ${name} keep fighting about ${topic}, and the marriage feels shaky.`,
        `Another fight about ${topic}: ${name} grabbed the car keys and didn't come home until after midnight.`,
        `You and ${name} have barely spoken in days over ${topic}. Dinner is just forks on plates.`,
        little ? `During the last fight about ${topic}, you saw ${little.call} listening from the top of the stairs.` : null,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you face it?", "Where does the marriage go from here?"])}`,
        options: [
          { id: "crisis.talk", label: ctx.rng.pick(["Really talk it through", "Sit down, phones off, and talk"]), hint: "say the hard things kindly", act: "talk", style: "social", weight: 0.37, apply: s2 => { s2.guard = 3; return { text: ctx.w(`After months of fighting about ${topic}, you and ${name} {finally sat down and talked it all out,|took a long drive and said the hard things,} and slowly things warmed up again.`), mood: -2 }; } },
          { id: "crisis.counsel", label: ctx.rng.pick(["Go to couples counseling", "Find a marriage counselor"]), hint: "a third person helps", act: "counsel", style: "health", weight: 0.17, apply: s2 => { s2.guard = 5; return { text: `After months of fighting about ${topic}, you and ${name} started seeing a counselor every Thursday and learned to fight fair.`, mood: -1 }; } },
          { id: "crisis.trip", label: ctx.w("Take a trip together to {trip}"), hint: "remember why", act: "travel", style: "family", weight: 0.08, apply: (s2, c) => { s2.guard = 2; s2.savings = Math.max(0, s2.savings - 0.1); return { text: c.w(`After months of fighting about ${topic}, ${s2.kids.length ? "you left the kids with family and " : "you and " + name + " "}went to {trip} for a few days, and came back {laughing again.|with a standing date night.}`), mood: 1 }; } },
          { id: "crisis.cold", label: ctx.rng.pick(["Let it go cold", "Give it space"]), hint: "maybe it passes", act: "avoid", style: "self", weight: 0.3, apply: s2 => { s2.crisis = 3; return { text: `After months of fighting about ${topic}, neither of you would go first, and the house got quieter and quieter.`, mood: -6 }; } },
          { id: "crisis.split", label: ctx.rng.pick(["Ask for a divorce", "Say the word “divorce”"]), hint: "you're tired", act: "separate", style: "self", weight: 0.08, apply: s2 => { s2.crisis = 6; s2.flags.askedDivorce = s2.age; return { text: `After months of fighting about ${topic}, you said it: “I want a divorce.” ${name} went very still and said ${they(P)} needed to think.`, mood: -8 }; } },
        ],
      };
    },
  },
  {
    // Not in the wedding year itself: a wedding and a divorce in the same year read as a slip.
    id: "divorce", domain: "love", channel: "bad", tags: ["spouse"], about: "partner", when: s => s.rel === "married" && yearsMarried(s) >= 1,
    p: (s, ctx) => rate(ctx, "divorce", yearsMarried(s), s.year) * (s.guard > 0 ? 0.4 : 1) * (s.crisis > 0 ? 2.5 : 1) * (s.flags.askedDivorce >= s.age - 1 ? 3 : 1),
    apply: (s, ctx) => {
      const name = s.partner ? s.partner.call : "your spouse", n = Math.max(1, yearsMarried(s));
      const kids = s.kids.some(k => k.alive !== false && k.age < 18);
      endRelationship(s, ctx);
      return { text: ctx.w(["You and {name} divorced. At the lawyer's office you were both strangely calm.", "After {n} years, you and {name} decided to end the marriage.", kids ? "You and {name} divorced, and {you explained it to the kids at the kitchen table, as gently as two people can.|the kids started splitting their weeks between two houses.}" : "You and {name} divorced. {On moving day you left your key on the counter.|You split the books and the dishes and, somehow, the friends.}"], { name, n }), mood: -12, big: true };
    },
  },
  {
    id: "widowed", domain: "family", channel: "bad", tags: ["spouse"], grave: true, when: s => s.rel === "married" && s.partner,
    p: (s, ctx) => rate(ctx, "deathRaw", s.partner.age, s.partner.sex, s.year),
    apply: (s, ctx) => {
      const name = s.partner.call, P = s.partner;
      P.alive = false; s.exes.push(P); s.partner = null; s.rel = "widowed"; s.since = null; closeSpell(s, "widowed");
      return { text: ctx.w([`${name} died, and the house became very quiet. You kept ${their(P)} coffee mug on the hook.`, `After all those years, you let go of ${name}'s hand. You are learning to live alone, one breakfast at a time.`, `${name} died {on a gray morning in late fall.|with you holding ${their(P)} hand.} {For months you still bought two of everything.|You slept on your own side of the bed for a long time.}`]), mood: -16, big: true };
    },
  },

  // ---------- family ----------
  {
    // Births to a woman and a man, married or together (rates.js birth gives the rate per married or per partnered
    // woman, so about four in ten US births today come to couples who are not married). Same-sex couples have
    // familyPlan below. A couple together less than a year has no baby yet.
    id: "baby", domain: "family", channel: "good", tags: ["children"],
    when: s => (s.rel === "married" || (s.rel === "dating" && s.age > (s.datingSince ?? s.age))) && !s.flags.noMoreKids && !sameSexCouple(s),
    p: (s, ctx) => Math.min(0.9, rate(ctx, "birth", motherAge(s), s.kids.length, s.year, s.rel === "married") * (s.flags.tryUntil >= s.age ? 1.8 : 1)),
    apply: (s, ctx) => {
      const kid = newKid(s, ctx);
      s.kids.push(kid);
      const first = s.kids.length === 1, w = kidNoun(kid);
      if (s.rel === "dating") {
        const name = s.partner ? s.partner.call : "your partner";
        return { text: first ? ctx.w([`You and ${name} weren't married, and then {kid} arrived, a ${w}, and the two of you {figured it out one diaper at a time.|were suddenly a family.}`, `{kid} was born, a ${w}. You and ${name} hadn't planned it this soon, and {you wouldn't change a thing.|your mother cried happy tears in the hospital hallway.}`, `{kid} was born, and you and ${name} {turned the spare room into a nursery in one frantic weekend.|stared at the tiny face for an hour without talking.}`], { kid: kid.call }) : ctx.w(`{kid}, a ${w}, was born, and you and ${name} {bought a bigger car seat for the older one.|were outnumbered.}`, { kid: kid.call }), mood: 8, big: first };
      }
      const dad = s.year < 1972 ? "{The father paced the waiting room, as fathers did then.|The nurses brought the baby out to the window for the family to see.}" : "{You cried. Everyone cried.|The car seat took forty minutes to install.}";
      return { text: first ? ctx.w([`You became a parent! {name} was born, a ${w}, tiny and furious and perfect. ${dad}`, "Your first child was born: a {w} named {name}. {You did not sleep for about four months.|You counted the fingers and toes twice.}", "{name} was born. {You held your baby and forgot how to talk.|You drove home from the hospital at twenty miles an hour.}"], { name: kid.call, w }) : ctx.w(["Baby number {n}, {name}, was born, a {w}.", "{name} was born, a {w}, and the older {kids} fought over who got to hold the baby."], { n: s.kids.length, name: kid.call, w, kids: s.kids.length > 2 ? "kids" : "one" }), mood: 9, big: first };
    },
  },
  {
    // A married same-sex couple and children: adoption, fostering, IVF or surrogacy, or a family of two. Not calibrated
    // to a statistic (the numbers are small); about a third of same-sex married couples raise children.
    id: "familyPlan", rare: true, domain: "family", channel: "good", tags: ["children"], cooldown: 3, max: 3, ages: [24, 48],
    when: s => s.rel === "married" && sameSexCouple(s) && !s.flags.noMoreKids && s.kids.length < 3, p: () => 0.12,
    choice: (s, ctx) => {
      const name = s.partner ? s.partner.call : "your spouse", two = s.sex === "female";
      const lead = scene(ctx, [
        s.kids.length ? `${s.kids[s.kids.length - 1].call} is growing up fast, and you and ${name} are talking about another child.` : `You and ${name} keep coming back to the same question: do you want to raise a kid?`,
        `Your friends just adopted a baby, and ${name} has been looking at the photos for a long time.`,
        `At Thanksgiving, ${parentWord(s, ctx)} asked, carefully, whether you two had thought about kids.`,
      ]);
      const join = (s2, c, age, how) => { const k = newKid(s2, c); k.age = age; k.birthYear = s2.year - age; s2.kids.push(k); return k; };
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you decide?", "What do you two do?"])}`,
        options: [
          { id: "familyPlan.adopt", label: "Adopt", hint: "a long process, a lot of paperwork", act: "haveChild", style: "family", weight: 0.3, apply: (s2, c) => { if (!c.roll("family", "good", 0.6)) return { text: `You and ${name} started the adoption process: home studies, background checks, a profile book. The wait went on into next year.`, mood: 0 }; const k = join(s2, c, c.rng.int(4)); return { text: c.w(`You and ${name} adopted ${k.call}, ${k.age ? `${k.age} years old` : "a baby"}. {The first night home, nobody slept.|The judge let ${k.call} bang the gavel.}`), mood: 9, big: true }; } },
          { id: "familyPlan.foster", label: "Become foster parents", hint: "kids who need a home now", act: "care", style: "social", weight: 0.15, apply: (s2, c) => { if (!c.roll("family", "good", 0.5)) return { text: `You and ${name} became foster parents. Two kids came and went home to their families, and you missed them both.`, mood: 1 }; const k = join(s2, c, 3 + c.rng.int(7)); return { text: c.w(`You and ${name} fostered ${k.call}, and a year later the adoption was final. {${k.call} picked the cake.|There were balloons at the courthouse.}`), mood: 9, big: true }; } },
          { id: "familyPlan.ivf", label: two ? "Try IVF with a donor" : "Work with a surrogate", hint: "expensive, hopeful", act: "haveChild", style: "risk", weight: 0.2, apply: (s2, c) => { s2.savings = Math.max(0, s2.savings - (two ? 0.3 : 0.8)); if (!c.roll("family", "good", 0.55)) return { text: `You and ${name} started ${two ? "IVF" : "the surrogacy process"}. The first round did not take, and you held each other in the parking lot.`, mood: -4 }; const k = join(s2, c, 0); return { text: c.w(`After ${two ? "two rounds of IVF" : "a year with a wonderful surrogate"}, ${k.call} was born. {You and ${name} took turns crying.|The nurses said ${k.call} had the loudest lungs on the floor.}`), mood: 9, big: true }; } },
          { id: "familyPlan.later", label: "Not yet", hint: "the timing isn't right", act: "wait", style: "safe", weight: 0.15, apply: () => ({ text: `You and ${name} decided to wait a little longer before thinking about kids.`, mood: 0 }) },
          { id: "familyPlan.none", label: s.kids.length ? "Our family is complete" : "Happy as two", hint: "a full life as it is", act: "noChild", style: "self", weight: 0.2, apply: s2 => { s2.flags.noMoreKids = true; return { text: s2.kids.length ? `You and ${name} decided your family was complete.` : `You and ${name} decided your family was the two of you, and the dog, and that was plenty.`, mood: 1 }; } },
        ],
      };
    },
  },
  {
    id: "moreKids", calibrated: true, domain: "family", channel: "change", tags: ["children"], cooldown: 3, when: s => s.rel === "married" && !sameSexCouple(s) && s.kids.length >= 1 && !s.flags.noMoreKids && motherAge(s) <= 42 && s.kids[s.kids.length - 1].age >= 1,
    p: () => 0.35,
    choice: (s, ctx) => {
      const one = s.kids.length === 1, name = s.partner ? s.partner.call : "your spouse", k0 = s.kids[0];
      return {
        prompt: `${scene(ctx, [
          `${one ? k0.call : "The kids"} ${one ? "is" : "are"} growing up, and you and ${name} are talking about having another.`,
          "At the family reunion, an aunt asked, loudly, when the next one was coming.",
          one && k0.age >= 3 ? `${k0.call} has been begging for a little brother or sister.` : null,
          `A friend just had a baby, and ${name} held it for a long time.`,
        ])} ${ctx.rng.pick(["Do you want another child?", "What do you think?", "Another one?"])}`,
        options: [
          { id: "moreKids.more", label: one ? ctx.rng.pick(["Have another", `Give ${k0.call} a sibling`]) : ctx.rng.pick(["Have another", "One more"]), hint: ctx.rng.pick(["a fuller house", "they'd have each other"]), act: "haveChild", style: "family", weight: one ? 0.4 : 0.13, apply: () => ({ text: `You and ${name} decided to try for another baby.`, mood: 1 }) },
          { id: "moreKids.ask", label: "Ask the kids what they think", hint: "a little brother or sister?", act: "talk", style: "social", weight: one ? 0.1 : 0.04, when: s2 => s2.kids[0].age >= 4, apply: (s2, c) => { const yes = c.rng() < 0.5, k = s2.kids[0].call; if (!yes) s2.flags.noMoreKids = true; return { text: c.w(yes ? `You asked ${k} about a little brother or sister, and ${k} {jumped up and down.|offered to share a room.} You decided to try for another.` : `You asked ${k} about a little brother or sister, and ${k} said “No thank you.” You laughed and decided the family was just right.`), mood: 2 }; } },
          { id: "moreKids.enough", label: ctx.rng.pick(["We're good", one ? "One is perfect" : "This is the right size"]), hint: "focus on the kids you have", act: "noChild", style: "safe", weight: one ? 0.35 : 0.68, apply: s2 => { s2.flags.noMoreKids = true; return { text: `You and ${name} decided your family was complete.`, mood: 1 }; } },
          { id: "moreKids.later", label: ctx.rng.pick(["Maybe in a few years", "When money is better"]), hint: "not now", act: "wait", style: "safe", weight: 0.08, apply: (s2, c) => ({ text: c.w("You decided to wait a few years, until {the mortgage|work|everyone's sleep} was under control."), mood: 0 }) },
          { id: "moreKids.fund", label: s.year >= 1997 ? "Start a 529 college fund first" : "Start a college savings account first", hint: "get ready first", act: "save", style: "safe", weight: 0.07, apply: s2 => { s2.flags.frugalUntil = s2.age + 2; return { text: "You decided to start saving for college before thinking about another baby.", mood: 0 }; } },
        ],
      };
    },
  },
  {
    id: "kidMilestone", ages: [22, 100], cooldown: 3, when: s => s.kids.some(k => [5, 11, 16, 18, 22].includes(k.age)), p: () => 0.6,
    apply: (s, ctx) => {
      const k = s.kids.find(x => [5, 11, 16, 18, 22].includes(x.age));
      const t = {
        5: ["{name} started kindergarten and did not look back once. You did.", "You walked {name} to kindergarten and stood at the fence long after the bell."],
        11: [`{name} started ${middleName(s.year)} and suddenly needed you to drop them off a block away.`, "{name} finished elementary school, and the class walked through the halls while the little kids cheered."],
        16: ["{name} got a driver's license, and you aged a year every time the car left the driveway.", "You taught {name} to drive in the church parking lot, gripping the dashboard."],
        18: ["{name} graduated from high school, and you yelled loudest in the bleachers.", "{name} moved into a dorm, and the house went quiet in a way you were not ready for."],
        22: ["{name} graduated from college, and you took about four hundred photos.", "{name} got a first real job and called to tell you before anyone else."],
      }[k.age];
      return { text: ctx.w(t, { name: k.call }), mood: 4 };
    },
  },
  parentClash("father"),
  parentClash("mother"),
  {
    id: "parentCare", domain: "family", channel: "bad", tags: ["father", "mother"], cooldown: 6, when: s => s.age >= 25 && ((s.father.alive && s.father.age >= 72) || (s.mother.alive && s.mother.age >= 72)), p: () => 0.05,
    choice: (s, ctx) => {
      const who = s.father.alive && s.father.age >= 72 ? "Dad" : "Mom", pr = who === "Dad" ? "him" : "her";
      const adults = bornSibs(s, 18), with_ = adults.length === 1 ? sibName(adults[0]) : "your siblings";
      const [why, past] = ctx.rng.pick([[`${who} fell and can't manage the stairs anymore`, `${who} fell and couldn't manage the stairs anymore`], [`${who} has been forgetting things: the stove, the bills, your name once`, `${who} started forgetting things, the stove, the bills, your name once`], [`${who} lives alone and you worry every night`, `you worried every night about ${who} living alone`], [`${who} came home from the hospital needing daily help`, `${who} came home from the hospital needing daily help`], [`a neighbor found ${who} lost in the grocery store parking lot`, `a neighbor found ${who} lost in the grocery store parking lot`], [`${who}'s doctor said ${pr} shouldn't drive anymore`, `${who}'s doctor said ${pr} shouldn't drive anymore`]]);
      return {
        prompt: `${cap(why)}. ${ctx.rng.pick(["How do you take care of things?", "What do you do?"])}`,
        options: [
          { id: "parentCare.self", label: ctx.rng.pick(["Cut back at work and care for them yourself", "Take care of them yourself"]), hint: "exhausting, but you're there", act: "care", style: "family", weight: 0.27, apply: s2 => { s2.income *= 0.92; return { text: `When ${past}, you cut back your hours and took care of ${pr} yourself. It was exhausting, and you were there.`, mood: -4 }; } },
          { id: "parentCare.move", label: `Move ${who} in with you`, hint: "rearrange the house", act: "care", style: "family", weight: 0.13, apply: (s2, c) => ({ text: c.w(`When ${past}, ${who} moved into your spare room. {The kids got a live-in storyteller.|There were adjustments, and also a lot of card games.}`), mood: -2 }) },
          { id: "parentCare.aide", label: "Hire a home health aide", hint: "costly, but professional", act: "hireCare", style: "safe", weight: 0.2, apply: s2 => { s2.savings = Math.max(0, s2.savings - 0.5); return { text: `When ${past}, you hired a home health aide and visited every weekend.`, mood: -2 }; } },
          { id: "parentCare.facility", label: s.year >= 1990 ? "Find a good assisted living place" : "Find a good nursing home", hint: "people who know how", act: "hireCare", style: "safe", weight: 0.18, apply: s2 => { s2.savings = Math.max(0, s2.savings - 0.4); return { text: `When ${past}, you toured six places and found one with a garden; ${who} complained for a month, then made friends.`, mood: -2 }; } },
          { id: "parentCare.share", label: `Split it with ${with_}`, hint: "a schedule, a group text", act: "shareCare", style: "social", weight: 0.22, when: () => adults.length > 0, apply: () => ({ text: `When ${past}, you and ${with_} made a schedule and took turns.`, mood: -2 }) },
        ],
      };
    },
  },
  {
    id: "fatherDeath", domain: "family", channel: "bad", tags: ["father"], grave: true, when: s => s.father.alive, p: (s, ctx) => rate(ctx, "deathRaw", s.father.age, "male", s.year),
    apply: (s, ctx) => {
      s.father.alive = false; s.savings += s.age >= 25 ? ctx.rng.between(0, 1) : 0;
      return { text: ctx.w(["Your father died at {a}. There were so many things you had meant to ask him.", "Dad died at {a}. {Going through his things, you found every report card you ever brought home.|At the funeral you kept thinking about him running behind your bike, holding the seat.}", "Your father died at {a}. {His old flannel shirt still smelled like him.|The neighbors brought casseroles for two weeks.|You kept his last voicemail and played it more than once.}"], { a: s.father.age }), mood: -14, big: true };
    },
  },
  {
    id: "motherDeath", domain: "family", channel: "bad", tags: ["mother"], grave: true, when: s => s.mother.alive, p: (s, ctx) => rate(ctx, "deathRaw", s.mother.age, "female", s.year),
    apply: (s, ctx) => {
      s.mother.alive = false; s.savings += s.age >= 25 ? ctx.rng.between(0, 1) : 0;
      return { text: ctx.w(["Your mother died at {a}. Nobody will ever make that pot roast again.", "Mom died at {a}. {You found her recipe cards in her handwriting and could not throw out a single one.|There was a casserole of hers still in the freezer.}", "Your mother died at {a}. {You kept paying her phone bill for a while, just to have her number.|At the funeral, people you had never met told you how she had helped them.}"], { a: s.mother.age }), mood: -15, big: true };
    },
  },
  {
    id: "inheritance", once: true, domain: "family", channel: "bad", tags: ["siblings"], about: "siblings",
    when: s => !s.father.alive && !s.mother.alive && s.age >= 25 && Math.max(s.last.fatherDeath ?? -9, s.last.motherDeath ?? -9) >= s.age - 1 && bornSibs(s, 18).length > 0,
    p: () => 0.25,
    choice: (s, ctx) => {
      const sibs = bornSibs(s, 18), x = sibs.length <= 3 ? sibsWord(sibs) : "your siblings";
      const asset = ctx.rng.pick(["the house you grew up in", "the house you grew up in", "the family farm", "the cabin on the lake", "Dad's old shop"]);
      const lead = scene(ctx, [
        `Your parents are both gone, and they left ${asset}. You and ${x} don't agree on what to do with it.`,
        `After the funeral, you and ${x} sat in the old kitchen and started talking about ${asset}.`,
        `${sibs.length === 1 ? cap(x) : "One of your siblings"} called to talk about ${asset}, and the conversation got tense fast.`,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you divide it?"])}`,
        options: [
          { id: "inheritance.split", label: "Split it evenly, as the will says", hint: "fair is fair", act: "negotiate", style: "safe", weight: 0.4, apply: s2 => { s2.savings += 0.5; return { text: `You and ${x} split ${asset} evenly, as the will said. It was sad, and nobody fought.`, mood: -1 }; } },
          { id: "inheritance.sell", label: "Sell it and divide the money", hint: "clean and simple", act: "sellAsset", style: "safe", weight: 0.15, apply: s2 => { s2.savings += 0.6; return { text: `You and ${x} sold ${asset} and divided the money. At the closing, you took one last walk through the empty rooms.`, mood: -2 }; } },
          { id: "inheritance.keep", label: "Keep it in the family for now", hint: "a place to come home to", act: "wait", style: "family", weight: 0.1, apply: () => ({ text: `You and ${x} agreed to keep ${asset} for now, so there would still be a place to gather for the holidays.`, mood: 1 }) },
          { id: "inheritance.give", label: sibs.length === 1 ? `Let ${x} have it` : "Let the others have it", hint: "less money, more family", act: "reconcile", style: "family", weight: 0.15, apply: () => ({ text: `You let ${x} have ${asset}. You all promised to keep coming home for Thanksgiving.`, mood: 1 }) },
          { id: "inheritance.insist", label: ctx.rng.pick(["Fight for your share", "Get a lawyer"]), hint: "it could cost the relationship", act: "insist", style: "self", weight: 0.2, apply: s2 => { s2.savings += 1; s2.flags.estranged = true; return { text: `You fought for your share of ${asset}, and you got it. You and ${x} barely speak now.`, mood: -7 }; } },
        ],
      };
    },
  },
  {
    id: "siblingHelp", domain: "family", channel: "good", tags: ["siblings"], about: "siblings", ages: [18, 95], cooldown: 5,
    when: s => !s.flags.estranged && bornSibs(s, 18).length > 0, p: s => (s.unemployedFor || s.health.serious ? 0.25 : 0.04),
    apply: (s, ctx) => {
      const sib = ctx.rng.pick(bornSibs(s, 18)), x = sibName(sib);
      if (s.health.serious) return { text: `While you were sick, ${x} drove you to appointments and kept your fridge full.`, mood: 4 };
      if (s.unemployedFor) return { text: `When you were out of work, ${x} lent you money without being asked and sent you every job posting ${isBrother(sib) ? "he" : "she"} saw.`, mood: 4 };
      return { text: ctx.w(["At Thanksgiving you and {x} told the old stories and laughed until you cried.", "You and {x} took a road trip together, just the two of you, for the first time since you were kids.", "{x} took a day off to help you move, and complained about every box.", "When you were low, {x} stayed on the phone with you past midnight."], { x }), mood: 3 };
    },
  },
  {
    // A grandchild is born to a son or daughter of 24–45.
    id: "grandchild", ages: [42, 105], cooldown: 4, when: s => s.kids.some(k => k.age >= 24 && k.age <= 45), p: () => 0.11,
    apply: (s, ctx) => {
      s.flags.grandkids = (s.flags.grandkids || 0) + 1;
      const k = ctx.rng.pick(s.kids.filter(x => x.age >= 24 && x.age <= 45));
      const sex = ctx.rng() < 0.512 ? "male" : "female";
      const g = ctx.person({ role: "grandkid", sex, birthYear: s.year, surname: k.sex === "male" ? surnameIn(k.name) : null });
      g.parent = k.call; (s.grandkids = s.grandkids || []).push(g);
      const w = sex === "male" ? "grandson" : "granddaughter";
      return { text: s.flags.grandkids === 1 ? ctx.w(`${k.call}'s baby, {g}, was born, and you became ${grandWord(s)}. {Your hands shook the first time you held {w}.|You made the baby's picture your phone background within the hour.|You bought a ridiculous number of tiny socks.}`, { g: g.call, w: sex === "male" ? "him" : "her" }) : ctx.w(`${k.call} had another baby, {g}, and you have a new ${w}.`, { g: g.call }), mood: 7 };
    },
  },
  {
    id: "siblingDeath", domain: "family", channel: "bad", tags: ["siblings"], grave: true, when: s => bornSibs(s).some(x => s.age - x.bornAt >= 40),
    p: (s, ctx) => 1 - bornSibs(s).filter(x => s.age - x.bornAt >= 40).reduce((q, x) => q * (1 - rate(ctx, "deathRaw", s.age - x.bornAt, isBrother(x) ? "male" : "female", s.year)), 1),
    apply: (s, ctx) => {
      const list = bornSibs(s).filter(x => s.age - x.bornAt >= 40);
      const x = ctx.rng.weighted(list.map(y => [y, rate(ctx, "deathRaw", s.age - y.bornAt, isBrother(y) ? "male" : "female", s.year) + 1e-6]));
      x.alive = false;
      return { text: ctx.w(["{who} died at {a}. {You kept thinking about the two of you fighting over the front seat.|At the service you told the story about the tree house, and everyone laughed and cried.}", "{who} died at {a}. {You found an old photo of the two of you in matching Halloween costumes and looked at it for a long time.|The family is smaller now, and the holidays feel it.}"], { who: cap(sibName(x)), a: s.age - x.bornAt }), mood: -10, big: true };
    },
  },

  // ---------- money and home ----------
  {
    id: "buyHome", calibrated: true, domain: "wealth", channel: "good", tags: ["home"], ages: [22, 70], cooldown: 2, when: (s, ctx) => s.home !== "own" && s.savings >= rate(ctx, "DOWN_PAYMENT") && s.employed,
    p: (s, ctx) => rate(ctx, "homeBuy", s.age),
    choice: (s, ctx) => {
      const buy = (s2, kind) => { const first = !s2.flags.ownedBefore; ownHome(s2); s2.flags.ownedBefore = true; s2.savings -= rate(ctx, "DOWN_PAYMENT"); return { text: ctx.w(`You bought ${first ? "your first home" : "a new place"} in ${here(s2)}: ${kind}. {The night you got the keys, you sat on the bare floor and ate pizza out of the box.|Thirty years of mortgage, and you had never felt steadier.|You carried each other over the threshold as a joke, and it was not a joke.}`), mood: 8, big: true }; };
      const starter = ctx.rng.pick([["Buy a starter home", ctx.rng.pick(["a little starter home with a chain-link fence", "a brick bungalow with a big maple out front"])], ["Buy a little ranch house", "a three-bedroom ranch with a carport"]]);
      const rateWord = s.year >= 1979 && s.year <= 1985 ? "Mortgage rates are near 18 percent, but" : s.year >= 2020 && s.year <= 2021 ? "Mortgage rates are under 3 percent, and" : s.year >= 2004 && s.year <= 2006 ? "Every bank is handing out mortgages, and" : null;
      const lead = scene(ctx, [
        "You've saved enough for a down payment.",
        rateWord ? `${rateWord} you finally have a down payment saved.` : null,
        s.kids.length ? "The kids are outgrowing the rental, and the down payment fund is finally full." : null,
        s.rel === "married" && s.partner ? `You and ${s.partner.call} have spent every Sunday at open houses, and the savings account says you can do it.` : null,
        s.home === "rent" ? "Your landlord is raising the rent again, and you ran the numbers: you could buy." : null,
        s.flags.vet ? "As a veteran you qualify for a VA loan, and you have enough saved for closing costs." : null,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["Do you buy a home?", "Is it time to buy?", "Do you make an offer?"])}`,
        options: [
          { id: "buyHome.starter", label: starter[0], hint: "small yard, room to grow", act: "buyHome", style: "family", weight: 0.32, apply: s2 => buy(s2, starter[1]) },
          { id: "buyHome.suburb", label: s.year < 1975 ? "Buy a new house in the suburbs" : "Buy new construction in the suburbs", hint: "a cul-de-sac and a commute", act: "buyHome", style: "safe", weight: 0.2, apply: s2 => buy(s2, ctx.rng.pick(["a brand-new house on a cul-de-sac", "a split-level in a new subdivision", "a house in the suburbs with a two-car garage"])) },
          { id: "buyHome.condo", label: "Buy a condo", hint: "no lawn to mow", act: "buyHome", style: "safe", weight: 0.15, apply: s2 => buy(s2, ctx.rng.pick(["a condo with a balcony", "a townhouse near the train", "a two-bedroom condo downtown"])) },
          { id: "buyHome.fixer", label: "Buy a fixer-upper", hint: "cheap, and a lot of weekends", act: "buyHome", style: "risk", weight: 0.15, apply: s2 => buy(s2, ctx.rng.pick(["a fixer-upper with good bones and terrible carpet", "an old farmhouse that needed everything", "a foreclosure with a roof you would replace yourself"])) },
          { id: "buyHome.rent", label: ctx.rng.pick(["Keep renting", "Not yet"]), hint: "stay flexible", act: "wait", style: "self", weight: 0.12, apply: () => ({ text: "You had the down payment, but you decided to keep renting and stay flexible for now.", mood: 0 }) },
          { id: "buyHome.parents", label: "Move back in with your parents and save more", hint: "free rent, less privacy", act: "moveHome", style: "family", weight: 0.06, when: s2 => (s2.father.alive || s2.mother.alive) && s2.age <= 35, apply: s2 => { s2.home = "parents"; return { text: "You had a down payment saved, but you moved back in with your parents to save even more. Your old bedroom still had the posters.", mood: 0 }; } },
        ],
      };
    },
  },
  {
    id: "windfall", domain: "wealth", channel: "good", ages: [20, 95], cooldown: 3, p: () => 0.03,
    apply: (s, ctx) => {
      const x = ctx.rng.between(0.3, 2); s.savings += x;
      const y = s.year;
      return { text: ctx.w([
        "{An investment you had forgotten about|Some stock you bought years ago} paid off, and {you put it toward the mortgage.|you took everyone out to dinner.|you, wisely, left it alone.}",
        "Your year-end bonus was {much|a lot} bigger than you expected, and {you looked at the deposit twice.|you finally took the family on a real vacation.}",
        y >= 1985 ? "A {scratch-off|lottery} ticket from the gas station hit for a few thousand dollars, {and you checked the numbers four times.|and you split it with the friend who lent you the dollar.}" : "You found a savings bond your grandparents bought when you were born, worth more than you ever guessed.",
        y >= 1997 && y <= 2000 ? "Your tech stocks doubled in the bubble, and you sold some just in time." : y >= 2017 ? "The crypto your coworker talked you into actually went up, and you cashed out before it came back down." : "A great-aunt you barely knew left you a little money in her will.",
        "You sold {the old car|some furniture from the garage|a box of baseball cards} for far more than you expected.",
      ]), mood: 6 };
    },
  },
  {
    id: "loss", domain: "wealth", channel: "bad", ages: [20, 95], cooldown: 3, p: () => 0.03,
    apply: (s, ctx) => {
      s.savings = Math.max(0, s.savings - ctx.rng.between(0.3, 1.5));
      const y = s.year;
      const scam = y >= 2018 ? "A stranger who texted you about crypto investing turned out to be a scammer" : y >= 2012 ? "A caller claiming to be from the IRS scared you into sending gift cards" : y >= 1998 ? "An email from a “prince” who needed help moving money cost you real money" : "A smooth-talking salesman sold you shares in a company that did not exist";
      return { text: ctx.w([
        "An investment {went bad|tanked|turned out to be a terrible idea}, and {a big chunk of your savings disappeared.|you lost a few years of saving.|you did not sleep for a week.}",
        "You lent money to {a friend|an old classmate|a cousin}, and {never saw it again.|they stopped answering your calls.|you lost the money and the friendship.}",
        `${scam}. {You were embarrassed, then angry.|The police said there was little they could do.|You warned everyone you know.}`,
        y >= 1985 ? "A hospital bill showed up that insurance would not cover, and it took a long time to pay down." : "The car's transmission died, and so did a good part of your savings.",
      ]), mood: -7 };
    },
  },

  // ---------- health ----------
  {
    id: "chronic", domain: "health", channel: "bad", ages: [30, 100], when: s => !s.health.chronic, p: (s, ctx) => rate(ctx, "chronic", s.age, s.sex),
    apply: (s, ctx) => { s.health.chronic = true; s.health.hr *= 1.3; return { text: ctx.w(["At a checkup your blood pressure was high, and {you started a pill every morning.|the doctor told you to watch the salt.|you bought a cuff to check it at home.}", "You were diagnosed with type 2 diabetes and {learned to read every nutrition label.|started checking your blood sugar every day.|said a long goodbye to soda.}", "Your {cholesterol|blood sugar|blood pressure} numbers came back high, and your doctor wants you to {cut back on fried food|walk thirty minutes a day|come back every three months}."]), mood: -3 }; },
  },
  {
    id: "checkups", calibrated: true, once: true, ages: [40, 40], p: () => 1,
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        "You turned 40, and your doctor's office sent a reminder about a full physical.",
        `Forty, and ${s.year >= 2014 ? "your insurance now covers a free preventive checkup" : "your company offers a free checkup"}.`,
        `A coworker's ${ctx.rng.pick(["blood sugar", "blood pressure", "cholesterol"])} came back alarming at a routine checkup, and you got your own reminder letter.`,
        s.father.alive || s.mother.alive ? "Your parents have more pill bottles every time you visit, and you are holding a checkup reminder." : null,
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["Do you start getting regular checkups?", "Do you go?", "What do you do?"])}`,
        options: [
          { id: "checkups.yearly", label: ctx.rng.pick(["Get a physical every year", "Put a checkup on the calendar every year"]), hint: "catch things early", act: "seeDoctor", style: "health", weight: 0.32, apply: (s2, c) => { s2.health.checkups = true; return { text: c.w("You started getting a physical every year, {and still hated the needle.|and the numbers got a little better each time.|and your doctor started saying “keep it up.”}"), mood: 0 }; } },
          { id: "checkups.full", label: "Get the full workup", hint: "every test, out of pocket", act: "seeDoctor", style: "health", weight: 0.08, apply: s2 => { s2.health.checkups = true; s2.savings = Math.max(0, s2.savings - 0.05); return { text: "You paid for the full workup, every scan and blood test, and kept going every year after.", mood: 0 }; } },
          { id: "checkups.basic", label: s.year >= 2014 ? "Do the free preventive visit" : "Do the basic checkup", hint: "the essentials", act: "seeDoctor", style: "safe", weight: 0.15, apply: s2 => { s2.health.checkups = true; return { text: "You did the basic checkup: blood pressure, blood work, a talk about your habits. You went back every few years.", mood: 0 }; } },
          { id: "checkups.habits", label: ctx.rng.pick(["Start with better habits", "Walk more, snack less"]), hint: "checkup next year", act: "quitHabit", style: "health", weight: 0.12, apply: (s2, c) => { s2.health.hr = Math.max(0.8, s2.health.hr * 0.98); return { text: c.w("You decided to start with habits first: {no more late-night snacks,|ten thousand steps a day,|bed before eleven,} and a checkup next year."), mood: 1 }; } },
          { id: "checkups.later", label: ctx.rng.pick(["Skip it for now", "When things calm down"]), hint: "you feel fine", act: "wait", style: "risk", weight: 0.33, apply: (s2, c) => ({ text: c.w("You felt fine, so {the reminder went into a drawer.|you meant to call the doctor and then forgot.|you put it off until after the busy season, which never ended.}"), mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "serious", domain: "health", channel: "bad", grave: true, ages: [1, 110], when: s => !s.health.serious, p: (s, ctx) => rate(ctx, "serious", s.age, s.sex, s.year),
    apply: (s, ctx) => {
      const type = rate(ctx, "seriousType", s.age, s.sex, s.year, ctx.rng), words = illnessWord(type);
      s.health.serious = { type, since: s.age }; s.health.everSerious = (s.health.everSerious || 0) + 1;
      const found = s.health.checkups && isCancer(type) ? " Your yearly checkup caught it early." : "";
      const text = ctx.w([`You were diagnosed with ${words}, and treatment started right away. Your family took turns driving you.`, `${cap(words)} came out of nowhere, and you were admitted to the hospital.`, `The doctor came in with the test results: ${words}. {You sat in your car in the parking lot for a long time.|You didn't say a word on the drive home.}`]);
      return { text: text + found, mood: -15, big: true };
    },
  },
  {
    id: "recovered", when: s => s.health.serious && s.age - s.health.serious.since >= 5, p: () => 1,
    apply: (s, ctx) => {
      const t = illnessWord(s.health.serious.type); s.health.serious = null;
      return { text: ctx.w(`Five years after ${t}, {your doctor said the words you had been waiting for: you're in the clear.|you filed away the last follow-up appointment card.|you rang the bell at the clinic one more time, just for luck.}`), mood: 8 };
    },
  },
  {
    id: "accident", domain: "health", channel: "bad", ages: [5, 90], cooldown: 5, p: () => 0.008,
    apply: (s, ctx) => ({ text: ctx.w([s.age >= 16 ? "Someone ran a red light and hit your car, and {your arm was in a cast for two months.|you spent six weeks in physical therapy.}" : "You fell off your bike and broke your arm, and {everyone signed the cast.|you learned to write left-handed.}", "You {tore a ligament playing pickup basketball|broke your ankle skiing|threw out your back moving a couch}, and {spent weeks on crutches.|went to physical therapy twice a week.}", "You {slipped on the ice in the driveway|fell off a ladder cleaning the gutters|tripped on the stairs in the dark}, {broke a wrist,|cracked a rib,} and took it easy for a month."]), mood: -5 }),
  },

  // ---------- moving ----------
  {
    id: "move", domain: "move", channel: "change", ages: [18, 85], cooldown: 3, when: s => !s.abroad && !s.studying && !inService(s), p: (s, ctx) => rate(ctx, "move", s.age),
    apply: (s, ctx) => {
      const c = placeWords(moveTo(s, ctx));
      return { text: ctx.w(["You moved to {c} and started over.", "{A new job|A fresh start|A cheaper rent} took you to {c}.", "You packed everything into a {U-Haul|rented truck|car with a mattress on the roof} and moved to {c}. {The first neighbor you met brought cookies.|It took a year to find a good pizza place.}"], { c }), mood: 1 };
    },
  },
  {
    id: "abroad", calibrated: true, domain: "move", channel: "change", ages: [22, 55], cooldown: 5, when: s => !s.abroad && !s.studying && !inService(s), p: (s, ctx) => rate(ctx, "abroad", s.age),
    choice: (s, ctx) => {
      const where = ctx.rng.weighted([["London", 3], ["Tokyo", 2], ["Germany", 2], ["Toronto", 1.5], ["Mexico City", 1.2], ["Singapore", 1], ["Dubai", 0.6], ["Sydney", 0.8], ["Hong Kong", 0.8]]);
      s.flags.offerAbroad = where;
      const family = s.rel === "married";
      return {
        prompt: `${scene(ctx, [
          `You've been offered a job in ${where}.`,
          s.employed ? `Your company is opening an office in ${where}, and your boss asked if you'd go for a few years.` : null,
          `An old college friend in ${where} says their company is hiring, and they gave your name.`,
          s.year >= 1995 ? `A recruiter called about a role in ${where} that pays a lot more than you make now.` : null,
        ])} ${ctx.rng.pick(["Do you go?", "What do you decide?", "Do you take it?"])}`,
        options: [
          { id: "abroad.go", label: family ? "Go first, alone" : ctx.rng.pick(["Go", "Take the job", "Pack your bags"]), hint: ctx.rng.pick(["see the world", "now or never"]), act: "workAbroad", style: "risk", weight: 0.32, apply: s2 => { s2.abroad = where; s2.leftAt = s2.age; s2.income *= 1.2; return { text: ctx.w(`You moved to ${where} for work{ and started over from scratch.| and got lost on the subway the first week.}${family ? " Your family stayed home, and you video-called every night." : ""}`), mood: 4, big: true }; } },
          { id: "abroad.family", label: "Move the whole family", hint: "new schools for the kids", act: "workAbroad", style: "family", weight: 0.08, when: () => family, apply: s2 => { s2.abroad = where; s2.leftAt = s2.age; s2.income *= 1.15; return { text: `The whole family moved to ${where}, and the kids started at an international school.`, mood: 3, big: true }; } },
          { id: "abroad.negotiate", label: "Negotiate first", hint: "more money, or a shorter stint", act: "negotiate", style: "social", weight: 0.05, apply: (s2, c) => { if (!c.roll("career", "good", 0.5)) return { text: `You tried to negotiate the move to ${where}, the company wouldn't budge, and you stayed home.`, mood: -1 }; s2.abroad = where; s2.leftAt = s2.age; s2.income *= 1.3; return { text: `You negotiated a raise and a flight home every quarter, and moved to ${where}.`, mood: 4, big: true }; } },
          { id: "abroad.partner", label: "Ask your partner to come", hint: "a decision for two", act: "talk", style: "social", weight: 0.05, when: s2 => s2.rel === "dating" && s2.partner, apply: (s2, c) => { const P = s2.partner; if (c.rng() < 0.5) { s2.abroad = where; s2.leftAt = s2.age; s2.income *= 1.2; return { text: `You asked ${P.call} to come to ${where} with you, and ${they(P)} said yes. You moved together.`, mood: 5, big: true }; } return { text: `You asked ${P.call} to come to ${where} with you, but ${they(P)} couldn't leave. You stayed.`, mood: -1 }; } },
          { id: "abroad.visit", label: "Visit first and decide", hint: "see it for yourself", act: "wait", style: "safe", weight: 0.06, apply: (s2, c) => ({ text: c.w(`You spent two weeks in ${where} on a work trip {and realized the pace wasn't for you.|and missed home more than you expected.|and decided the timing was wrong.} You stayed.`), mood: 0 }) },
          { id: "abroad.stay", label: ctx.rng.pick(["Stay home", "Turn it down"]), hint: ctx.rng.pick(["your people are here", "you've got a good thing here"]), act: "wait", style: "family", weight: 0.44, apply: () => ({ text: `You thought hard about the job in ${where} and decided to stay home.`, mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "returnHome", when: s => s.abroad && !s.flags.emigrated && s.age - (s.leftAt ?? s.age) >= 2, p: s => (s.flags.backAt !== undefined && s.age >= s.flags.backAt ? 1 : 0.2),
    apply: (s, ctx) => {
      const was = s.abroad; s.abroad = null; delete s.flags.backAt;
      return { text: ctx.w(`After your years in ${was}, you moved back to the States{, and the first thing you did was get a cheeseburger.|, and the grocery stores looked enormous.|, with a suitcase of souvenirs and a slightly different accent.}`), mood: 3 };
    },
  },

  // ---------- later life ----------
  {
    id: "hobby", ages: [60, 100], cooldown: 8, when: s => s.retired || s.age >= 66, p: () => 0.12,
    apply: (s, ctx) => ({ text: ctx.w([s.year >= 2012 ? "You took up pickleball and {now play four mornings a week.|are, frankly, a menace at the net.}" : "You took up golf and {played every Tuesday with the same three friends.|bought far more clubs than you needed.}", "You joined a {bowling league|church choir|book club|quilting circle|woodworking club}, {and never missed a week.|and made more friends than you had in years.}", "You started volunteering at {the library|the hospital gift shop|the food bank|an elementary school reading program}, {two mornings a week.|and the regulars all know your name.}", s.year >= 1996 ? "You got into genealogy and traced the family back {to a farm in Ireland|to a village in Italy|through five generations}, {calling every cousin with updates.|filling three binders.}" : "You started a vegetable garden and {grew enough tomatoes to feed the street.|fought a long war with the rabbits.}"]), mood: 4 }),
  },
  {
    // Looking back on a big moment from at least twenty years ago.
    id: "memoryLane", ages: [55, 105], cooldown: 7, when: s => s.memory.some(m => s.age - m.age >= 20 && m.kind !== "memoryLane" && m.text), p: () => 0.1,
    apply: (s, ctx) => {
      const m = ctx.rng.pick(s.memory.filter(x => s.age - x.age >= 20 && x.kind !== "memoryLane" && x.text));
      const gist = m.text.split(/(?<=[.!?])\s/)[0].replace(/^You /, "you ").replace(/[.!?]$/, "");
      const end = m.mood < 0 ? "{You said a few quiet words to yourself.|Your eyes got a little wet.|You can still feel exactly how that felt.}" : "{It feels like last week.|You smiled.|Where did the time go?}";
      return { text: ctx.w([`{Going through old photos|Cleaning out a closet|Over coffee with an old friend|When a grandkid asked about the old days}, you remembered being {a}: {gist}. ${end}`, `You told the story again of being {a}, when {gist}. {The family knows it by heart.|It gets better every time.}`], { a: m.age, gist }), mood: m.mood < 0 ? -1 : 2 };
    },
  },
  {
    id: "milestoneAge", ages: [80, 110], when: s => s.age === 80 || s.age === 90 || s.age === 100, p: () => 1,
    apply: (s, ctx) => ({ text: s.age === 100 ? "You turned 100! A card arrived from the White House, and the local paper sent a photographer." : ctx.w(`For your ${s.age}th birthday, ${s.kids.length > 1 ? "your kids" : s.kids.length ? `your ${kidWord(s.kids[0])}` : "your friends"} threw you a party{ with a sheet cake the size of a door.| in the church basement.| at your favorite diner.} {You made a wish and didn't tell anyone.|Everybody lined up for a photo with you.}`), mood: 4 }),
  },
];

// Every core event draws from the separate fate stream in life.js.
for (const ev of CORE) ev.core = true;

// Not in the yearly list: life.js checks death at the end of each year.
export const deathEvent = {
  id: "death", domain: "health", channel: "bad", grave: true, big: true,
  apply: (s, ctx) => {
    const age = s.age;
    let text;
    if (s.health.diedOf) text = ctx.w([`You died of ${illnessWord(s.health.diedOf)} at ${age}, with your family close.`, `At ${age}, after a long fight with ${illnessWord(s.health.diedOf)}, you died.`]);
    else if (age >= 85) text = ctx.w([`You died peacefully at ${age}, in your sleep.`, `At ${age}, with your family around you, you quietly reached the end of a long life.`]);
    else if (age < 40) text = `An accident on an ordinary day ended your life at ${age}.`;
    else text = ctx.w([`You died at ${age} after an illness.`, `At ${age}, your body finally gave out, and you died.`]);
    return { text, mood: 0, big: true };
  },
};
