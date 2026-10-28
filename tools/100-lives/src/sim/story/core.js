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
  scene, cap, an, they, them, their, kidWord, RELATIONS, sibName, isBrother, bornSibs, listWords, grandWord, parentWord, isAre,
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
  s.studying = false; s.flags.serviceUntil = s.age + years; s.flags.served = { branch, from: s.age };
}
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
      const lb = 5 + ctx.rng.int(5), oz = ctx.rng.int(16), intro = introOf(ctx);
      const dad = s.year < 1972 ? "{Your father paced the waiting room with a pack of cigars in his pocket, as fathers did then.|Your father got the news from a nurse in the waiting room and called everyone he knew from the pay phone.}" : "{Your dad was in the delivery room, a little green, holding the camera.|Your mom said later that you came out yelling and never really stopped.}";
      const text = ctx.w([
        `You were born in ${here(s)} in ${s.year}, ${lb} pounds ${oz} ounces. ${dad}`,
        `You arrived in ${s.year} in ${here(s)}, ${lb} pounds ${oz} ounces, with {a full head of dark hair|no hair at all|the family nose}. ${dad}`,
        `${s.year}, ${here(s)}: you were born {just before dawn|in the middle of a thunderstorm|on a quiet Sunday afternoon|an hour after the nurses changed shifts}, ${lb} pounds ${oz} ounces.`,
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
    id: "knownSibling", when: s => s.siblings.list.some(x => !x.born && x.bornAt === s.age), p: () => 1,
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
      return { text: ctx.w(["You started high school, a freshman again, {in a building three times the size of your old one.|with a schedule printed on a computer card.|with a locker on the far side of the school from every class.}", "Freshman year: {homecoming posters in the halls|a pep rally in the gym|seniors who seemed to own the parking lot}, and you {trying to look like you knew where you were going.|already counting the years.}", "High school started. {You signed up for {band|JV soccer|the school paper|drama club} the first week.|You found your people at the lunch table by the windows.|You discovered that freshmen do not sit on the senior benches.}"]), mood: 1 };
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
      const enter = rate(ctx, "college", s.year, s.track), cc = rate(ctx, "communityShare", s.year), en = Math.min(0.5, rate(ctx, "enlist", s.sex, s.year));
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
          { id: "senior.state", label: L.state[0], hint: L.state[1], act: "study", style: "learn", weight: enter * (1 - cc) * 0.72, apply: (s2, c) => { done(s2); s2.track = "college"; s2.flags.uniAt = s2.age; s2.debt += loan; return { text: c.w(`You went off to the state university. ${ok} {${cap(parent)} helped you carry a mini fridge up four flights of stairs.|Your dorm room was the size of a closet, and you loved it.|Your roommate had a lava lamp and opinions about music.}`), mood: good ? 7 : 4 }; } },
          { id: "senior.away", label: L.away[0], hint: L.away[1], act: "study", style: "risk", weight: enter * (1 - cc) * 0.28, apply: (s2, c) => { done(s2); s2.track = "college"; s2.flags.uniAt = s2.age; s2.flags.awayCollege = true; s2.debt += loan * 2; return { text: c.w(`You went away to college, {a small campus with ivy on the brick|a school three states from home|a place with more snow than you had ever seen}. ${ok} {The loan papers were thick, but so was the course catalog.|You called home every Sunday from the hall phone.}`), mood: good ? 7 : 4, big: true }; } },
          { id: "senior.cc", label: L.cc[0], hint: L.cc[1], act: "study", style: "safe", weight: enter * cc, apply: (s2, c) => { done(s2); s2.track = "community"; s2.flags.ccAt = s2.age; return { text: c.w("You enrolled at the community college, {living at home and working weekends.|taking night classes and a lunch shift.|with a plan to transfer in two years.} {The parking lot was always full.|Your English professor changed how you read.}"), mood: 3 }; } },
          { id: "senior.trade", label: L.trade[0], hint: L.trade[1], act: "careerSwitch", style: "safe", weight: (1 - enter) * 0.22, apply: (s2, c) => { done(s2); s2.track = "trade"; s2.flags.tradeAt = s2.age; s2.flags.trade = trade; return { text: c.w(`You signed up for trade school in ${trade}. {The instructor had forty years in the business and no patience for excuses.|You liked going home tired from doing something real.}`), mood: 3 }; } },
          { id: "senior.enlist", label: L.enlist[0], hint: L.enlist[1], act: "workAbroad", style: "risk", weight: (1 - enter) * en, apply: (s2, c) => { done(s2); leaveSchool(s2); enlist(s2, c, branch, 4); return { text: c.w(`You enlisted in the ${branch}. {Basic training took your hair and gave you a lot of push-ups.|${cap(parent)} drove you to the recruiting office and did not say much on the way home.|The bus to boot camp left at five in the morning.}`), mood: 2, big: true }; } },
          { id: "senior.work", label: L.work[0], hint: L.work[1], act: "jobSearch", style: "self", weight: (1 - enter) * Math.max(0, 0.78 - en), apply: (s2, c) => { done(s2); leaveSchool(s2); return { text: c.w("With your diploma in hand, you decided to start working {right away.|and figure out the rest later.|and stop being broke.}"), mood: 1 }; } },
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
      return { text: ctx.w([`You finished trade school in ${t} and {passed the licensing exam on the first try.|got your certificate in the mail and had it laminated.}`, `Trade school in ${t}, done. {Your instructor shook your hand and said you had good hands.|You already had two shops asking about you.}`, `You earned your certificate in ${t}{, the first credential anyone in the family had framed| and celebrated with burgers}.`]), mood: 4 };
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
      startJob(s, ctx, ["resident physician", 1.05, "health", null]);
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
      const br = (s.flags.served && s.flags.served.branch) || "service";
      const years = s.age - ((s.flags.served && s.flags.served.from) ?? s.age - 4);
      const lead = scene(ctx, [
        `Your ${years} years in the ${br} are almost up.`,
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
          { id: "layoff.retrain", label: retrain[0], hint: retrain[1], act: "careerSwitch", style: "learn", weight: 0.17, apply: (s2, c) => { s2.flags.retrained = true; s2.income *= 1.08; return { text: c.w(`${then}, you used the time to ${retrain[0].toLowerCase()}, {studying at the kitchen table after the kids went to bed.|the oldest one in the class, and the most focused.}`), mood: -5 }; } },
          { id: "layoff.gov", label: s.year < 1990 ? "Apply at the post office" : "Apply for a government job", hint: "steady, if you get it", act: "civilService", style: "safe", weight: 0.06, apply: (s2, c) => {
            if (c.roll("career", "good", 0.5)) { startJob(s2, c, [s2.year < 1990 ? "postal carrier" : "county clerk", 0.95, "government", null]); return { text: `${then}, you applied for a government job, passed the test, and started as ${s2.year < 1990 ? "a postal carrier" : "a county clerk"} with a pension plan.`, mood: 2 }; }
            return { text: `${then}, you applied for a government job and took the test, but the list was long. You kept looking.`, mood: -6 };
          } },
          { id: "layoff.rest", label: ctx.rng.pick(["Take a few months to breathe", "Spend time with family first"]), hint: "take care of yourself", act: "rest", style: "self", weight: 0.13, apply: (s2, c) => { s2.happiness += 4; return { text: c.w(`${then}, you let yourself take a few months off, {fixing things around the house you had ignored for years.|taking long walks and cooking real dinners.}`), mood: -4 }; } },
          { id: "layoff.gig", label: cap(gig), hint: "some money coming in", act: "sideJob", style: "safe", weight: 0.16, apply: s2 => { s2.income = Math.max(0.4, s2.income * 0.5); return { text: `${then}, you decided to ${gig} to keep the lights on while you looked.`, mood: -6 }; } },
          { id: "layoff.own", label: "Use the severance to start a business", hint: "be your own boss", act: "startup", style: "risk", weight: 0.05, when: s2 => s2.age >= 25 && s2.age <= 60, apply: (s2, c) => {
            const kind = c.rng.pick(s2.year >= 2005 ? ["food truck", "online store", "consulting business", "landscaping company"] : ["diner", "hardware store", "consulting business", "landscaping company"]);
            startJob(s2, c, [`owner of a small ${kind}`, c.roll("career", "good", 0.5) ? 1.1 : 0.75, "self-employed", null]);
            return { text: `${then}, you put everything into opening a ${kind}. The first year was terrifying and yours.`, mood: -1, big: true };
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
// ---------- more of the core follows ----------
];
