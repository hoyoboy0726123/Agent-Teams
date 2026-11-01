// The teen years, 13–18: the lunch table, a team or the band or the school play, a first job at the mall or the
// Dairy Queen, a learner's permit and a first car with a tape deck, homecoming and prom, a first love and a first
// heartbreak, the SAT, a party with no parents home, a first concert, curfew, a phone of your own, and figuring out
// who you are.
//
// The probabilities are assumptions (no statistics exist for these events), mostly 0.04–0.15 a year with once / max /
// cooldown, so the teen years hold seven or eight stories, three or four of them choices. Common choices come in
// several scenes, by era and situation. Nothing here changes schooling (core.js `senior`, `hsDropout`) or `s.rel`: a
// teenage romance stays in the story and in memory, so the calibrated dating and marriage ages hold. A teen job is not
// `s.employed`.
//
// Left for later modules:
//   s.flags.club       "sports" | "band" | "theater" | "debate" | "paper" | "none", with s.flags.sport (football, track…)
//   s.flags.parttime   the teen job ("bagging groceries at the A&P")   s.flags.license  the age you got your license
//   s.flags.firstCar   { name, age }                                     s.flags.firstLove { name, sex, age }
//   s.flags.out        the age you came out to someone                   s.flags.prom    how prom went
//   s.flags.honest     +1 / −1 for honesty tests (child.js too)          memory kinds "firstLove", "firstConcert"
import {
  scene, pickScene, cap, an, they, them, their, sibName, sibShort, olderSibs, youngerSibs, bornSibs, grownUp, parentWord, isAre,
  bestFriend, friendName, makeFriend, homeMoney, middleName, inMiddle, inHigh, musicOf, chatOf, carOf, screenOf, stateOf, inStates, snowy, gradeWord,
} from "./common.js";
import { faithOf } from "./child.js";

// ---------- helpers ----------
function A(id, ages, p, lines, { mood = 2, ...more } = {}) {
  return { id, ages, once: true, ...more, p: typeof p === "function" ? p : () => p, apply: (s, ctx) => ({ text: ctx.w(typeof lines === "function" ? lines(s, ctx) : lines), mood: typeof mood === "function" ? mood(s) : mood }) };
}
const atHome = s => !s.abroad;
// At school as a teenager: middle school (13) or high school.
const teenSchool = s => s.studying && !s.abroad && (s.track === "middle" || s.track === "high");
const hs = s => inHigh(s);
// Someone to have a crush on or date, for the story only (s.rel does not change). Mostly the other sex; the same sex
// for a teen who has come out.
function teenCrush(s, ctx) {
  const same = s.flags.out !== undefined ? ctx.rng() < 0.7 : ctx.rng() < 0.04;
  return ctx.person({ role: "friend", sex: same ? s.sex : s.sex === "male" ? "female" : "male", birthYear: s.birthYear + ctx.rng.int(3) - 1, how: "school" });
}
// The hit song of a slow dance, by year.
const slowSong = y => (y < 1965 ? "“Earth Angel”" : y < 1975 ? "“Hey Jude”" : y < 1983 ? "“Stairway to Heaven,” all eight minutes of it" : y < 1990 ? "“Careless Whisper”" : y < 1997 ? "“I'll Make Love to You”" : y < 2004 ? "“I Don't Want to Miss a Thing”" : y < 2012 ? "“Hey There Delilah”" : y < 2020 ? "“Perfect”" : "a slow song nobody admitted to knowing all the words to");
// A TV show teenagers watched, by year.
const teenShow = y => (y < 1963 ? "American Bandstand" : y < 1970 ? "The Monkees" : y < 1976 ? "The Brady Bunch" : y < 1983 ? "Happy Days" : y < 1988 ? "Family Ties" : y < 1994 ? "Saved by the Bell" : y < 2000 ? "Friends" : y < 2004 ? "Dawson's Creek" : y < 2009 ? "The O.C." : y < 2013 ? "Glee" : y < 2019 ? "Stranger Things" : "Euphoria");
// A first concert, by year.
const concertOf = y => (y < 1966 ? "the Beatles" : y < 1972 ? "the Rolling Stones" : y < 1978 ? "Led Zeppelin" : y < 1983 ? "Bruce Springsteen" : y < 1988 ? "Madonna" : y < 1992 ? "Bon Jovi" : y < 1996 ? "Nirvana" : y < 2001 ? "the Backstreet Boys" : y < 2006 ? "Green Day" : y < 2011 ? "Taylor Swift" : y < 2017 ? "One Direction" : y < 2023 ? "Billie Eilish" : "Taylor Swift on the Eras Tour");
// The fashion that made you cringe at the photos later.
const fashionOf = y => (y < 1965 ? "a poodle skirt and saddle shoes" : y < 1975 ? "bell-bottoms and a fringed vest" : y < 1983 ? "feathered hair and a satin jacket" : y < 1990 ? "parachute pants and a perm" : y < 1997 ? "a flannel shirt over everything" : y < 2005 ? "frosted tips and puka shells" : y < 2012 ? "skinny jeans and a side-swept fringe" : "a hoodie, joggers and very expensive sneakers");

export const TEEN = [
  {
    id: "t_prom", once: true, ages: [17, 18], when: hs, p: () => 0.55,
    choice: (s, ctx) => {
      const c0 = s.flags.firstLove && s.age - s.flags.firstLove.age < 1 ? null : teenCrush(s, ctx), f = bestFriend(s);
      const ask = s.year >= 2010 ? "with a promposal: a poster, a box of donuts and a crowd" : "at their locker, with your voice cracking";
      const set = (how, text, mood = 5) => (s2, c) => { s2.flags.prom = how; return { text: c.w(text), mood, big: true }; };
      return {
        prompt: `${scene(ctx, ["Prom is a month away, and everyone is pairing off.", s.year >= 2010 ? "Prom is coming, and the promposals have started: someone spelled out a question in the parking lot with candles." : "Prom is coming, and the tuxedo-rental flyers are taped up in every hallway.", s.year === 2020 ? "Prom is supposed to be in May, though nobody knows if it will happen." : null])} How do you go?`,
        options: [
          { id: "t_prom.ask", label: c0 ? `Ask ${c0.call}` : "Ask your crush", hint: ask, act: "pursue", style: "risk", weight: 0.3, apply: (s2, c) => (c.rng() < 0.6 ? set("date", `You asked ${c0 ? c0.call : "your crush"} to prom ${ask}, and got a yes. {You took photos on the front lawn while your parents fussed with the corsage.|You danced to every slow song and ate nothing.}`)(s2, c) : set("solo", `You asked ${c0 ? c0.call : "your crush"} to prom ${ask}, and got a polite no. You went anyway with friends, and had more fun than the couples.`, 3)(s2, c)) },
          { id: "t_prom.group", label: "Go with a group of friends", hint: "no pressure", act: "socialize", style: "social", weight: 0.3, apply: set("group", "You went to prom with a big group of friends, {split a rented limo nine ways,|took a hundred photos in someone's backyard,} and danced until the DJ played the last song.") },
          { id: "t_prom.friend", label: f ? `Go with ${f.call}, as friends` : "Go with your best friend", hint: "the safest date", act: "socialize", style: "family", weight: 0.2, apply: set("friend", `You went to prom with ${f ? f.call : "your best friend"}, just as friends, and it was one of the best nights of high school.`) },
          { id: "t_prom.skip", label: "Skip it", hint: "overrated", act: "avoid", style: "self", weight: 0.12, apply: set("skipped", "You skipped prom and spent the night {at a diner with the other holdouts,|watching movies at a friend's house,} and you don't regret it at all.", 2) },
          { id: "t_prom.work", label: "Work that night", hint: "time and a half", act: "sideJob", style: "safe", weight: 0.08, apply: set("worked", "You worked a shift on prom night, and served milkshakes to couples in tuxedos at midnight. The tips were great.", 1) },
        ],
      };
    },
  },
  {
    // The driver's license: driver's ed at 15 or 16, a learner's permit, the road test.
    id: "t_license", once: true, ages: [15, 17], when: s => atHome(s) && s.flags.license === undefined, p: s => (s.age === 16 ? 0.7 : 0.3),
    choice: (s, ctx) => {
      const who = s.father.alive && !s.flags.parentsSplit ? ctx.rng.pick(["Dad", "Mom"]) : grownUp(s, ctx);
      const car = s.year < 1990 ? "the family station wagon" : s.year < 2010 ? "the family minivan" : "the family SUV";
      return {
        prompt: `You're old enough for your learner's permit, and ${who} has offered to teach you in ${car}. How do you learn?`,
        options: [
          { id: "t_license.parent", label: `Let ${who} teach you`, hint: "white knuckles", act: "seekHelp", style: "family", weight: 0.35, apply: s2 => { s2.flags.license = s2.age; return { text: `${who} taught you to drive in ${car}, gripping the dashboard and stomping an imaginary brake. You passed the road test on the first try, and ${who} took you out for a milkshake.`, mood: 5, big: true }; } },
          { id: "t_license.class", label: "Take driver's ed at school", hint: "the instructor has a brake too", act: "study", style: "safe", weight: 0.3, apply: (s2, c) => { s2.flags.license = s2.age; return { text: c.w("You took driver's ed, watched the scary safety films, and {passed the road test with one rolling stop.|failed parallel parking the first time and passed the second.}"), mood: 4, big: true }; } },
          { id: "t_license.sib", label: olderSibs(s).length ? `Get ${sibShort(olderSibs(s)[0])} to teach you` : "Practice with a friend's older brother", hint: "cooler, maybe worse", act: "socialize", style: "risk", weight: 0.1, apply: s2 => { s2.flags.license = s2.age; return { text: `${olderSibs(s2).length ? cap(sibName(olderSibs(s2)[0])) : "A friend's older brother"} taught you to drive on back roads with the radio up. You passed, eventually, after learning a few habits the examiner did not love.`, mood: 3 }; } },
          { id: "t_license.wait", label: "Wait a year", hint: "no rush", act: "wait", style: "safe", weight: 0.15, apply: () => ({ text: "You decided to wait a year for your license, and kept bumming rides off friends.", mood: 0 }) },
          { id: "t_license.never", label: "Ride your bike and take the bus", hint: "freedom on two wheels", act: "exercise", style: "health", weight: 0.1, apply: () => ({ text: "You skipped the driver's license for now and got around by bike and bus, and knew every shortcut in town.", mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "t_firstLove", domain: "love", channel: "good", once: true, ages: [15, 18], when: s => atHome(s) && s.rel === "single", p: () => 0.18,
    choice: (s, ctx) => {
      const c0 = teenCrush(s, ctx), chat = chatOf(s.year);
      const remember = (s2, way) => { s2.flags.firstLove = { name: c0.call, sex: c0.sex, age: s2.age, way }; ctx.remember("firstLove", c0.call, { name: c0.call, call: c0.call, sex: c0.sex }); };
      const [lead, then] = scene(ctx, [
        [`You can't stop thinking about ${c0.call} from your ${ctx.rng.pick(["chemistry", "English", "history"])} class.`, `Crazy about ${c0.call} from class,`],
        [`You and ${c0.call} have been talking on ${chat} every night for weeks.`, `After weeks of talking to ${c0.call} on ${chat},`],
        [`${c0.call} keeps finding reasons to walk past your locker.`, `With ${c0.call} walking past your locker every day,`],
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "t_firstLove.ask", label: "Ask them out", hint: "a movie, a milkshake", act: "pursue", style: "risk", weight: 0.3, apply: (s2, c) => { remember(s2, "asked"); return { text: c.w(`${then} you asked ${c0.call} out, and ${they(c0)} said yes. {You went to the movies and held hands in the dark.|You split a milkshake at the diner with two straws.} It was your first love, and you knew it.`), mood: 7, big: true }; } },
          { id: "t_firstLove.note", label: s.year < 2000 ? "Write them a letter" : "Send a long message", hint: "easier on paper", act: "talk", style: "social", weight: 0.2, apply: (s2, c) => { const yes = c.rng() < 0.6; if (yes) remember(s2, "wrote"); return { text: yes ? `${then} you poured your heart into ${s2.year < 2000 ? "a letter folded into a tiny triangle" : "a long message you rewrote eleven times"}, and ${c0.call} wrote back: “Me too.”` : `${then} you poured your heart into ${s2.year < 2000 ? "a letter" : "a long message"}, and ${c0.call} wrote back kindly that ${they(c0)} just wanted to be friends. It stung, and it passed.`, mood: yes ? 7 : -3, big: yes }; } },
          { id: "t_firstLove.friend", label: "Ask your best friend to find out", hint: "intelligence first", act: "seekHelp", style: "social", weight: 0.2, apply: (s2, c) => { const yes = c.rng() < 0.5; if (yes) remember(s2, "friend"); return { text: yes ? `${then} you sent your best friend to find out. The report came back positive, and by Friday you and ${c0.call} were going out.` : `${then} you sent your best friend to find out. The report came back: ${c0.call} liked someone else. You played sad songs for a week.`, mood: yes ? 6 : -3, big: yes }; } },
          { id: "t_firstLove.wait", label: "Wait and see", hint: "too nervous", act: "wait", style: "safe", weight: 0.2, apply: () => ({ text: `${then} you never said a word, and by summer ${c0.call} had moved on. You thought about ${them(c0)} for a long time.`, mood: -1 }) },
          { id: "t_firstLove.focus", label: "Focus on school instead", hint: "no distractions", act: "study", style: "learn", weight: 0.1, apply: () => ({ text: `${then} you decided to focus on school instead. ${c0.call} signed your yearbook “Wish we'd talked more,” and you read it a hundred times.`, mood: 0 }) },
        ],
      };
    },
  },
  {
    // The SAT (from 1926) or the ACT (from 1959), in junior year, for those headed toward college.
    id: "t_sat", domain: "study", channel: "good", once: true, ages: [16, 17], when: s => hs(s) && s.year >= 1960, p: () => 0.5,
    choice: (s, ctx) => {
      const test = s.year < 1975 ? "the SAT" : ctx.rng.pick(["the SAT", "the ACT"]), bare = test.slice(4), course = s.year >= 1980 ? "a Kaplan prep course" : "a prep class at the library";
      return {
        prompt: `${cap(test)} is in six weeks, and everyone says it will decide where you go to college. How do you prepare?`,
        options: [
          { id: "t_sat.course", label: `Take ${course}`, hint: "costly, structured", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => { const ok = c.roll("study", "good", 0.5); s2.flags.testScore = ok ? "high" : "mid"; return { text: ok ? `You took ${course} and drilled vocabulary flash cards for weeks. Your ${bare} score came back higher than you dreamed.` : `You took ${course}, and your ${bare} score came back fine, about where you started.`, mood: ok ? 5 : 1 }; } },
          { id: "t_sat.book", label: "Study from a big prep book", hint: "on your own", act: "study", style: "safe", weight: 0.35, apply: (s2, c) => { const ok = c.roll("study", "good", 0.4); s2.flags.testScore = ok ? "high" : "mid"; return { text: ok ? `You worked through a prep book the size of a phone book, a section a night, and your ${bare} score made your parents call relatives.` : `You studied from a prep book every night, and your ${bare} score came back solid, if not spectacular.`, mood: ok ? 4 : 1 }; } },
          { id: "t_sat.cold", label: "Take it cold", hint: "you test well", act: "wait", style: "risk", weight: 0.2, apply: (s2, c) => { const ok = c.roll("study", "good", 0.3); s2.flags.testScore = ok ? "high" : "low"; return { text: ok ? `You took ${test} without studying and did great, which annoyed everyone you knew.` : `You took ${test} without studying, and the score was a wake-up call.`, mood: ok ? 4 : -2 }; } },
          { id: "t_sat.retake", label: "Plan to take it twice", hint: "the second time is better", act: "pushThrough", style: "learn", weight: 0.15, apply: s2 => { s2.flags.testScore = "mid"; return { text: `You took ${test} twice: the first time to see it, the second to beat it. You raised your score and got very good at bubbling.`, mood: 2 }; } },
          { id: "t_sat.skip", label: "Skip it", hint: "not college-bound, for now", act: "avoid", style: "self", weight: 0.1, apply: s2 => { s2.flags.testScore = "none"; return { text: `You decided to skip ${test} for now. Plenty of paths don't start with a number two pencil.`, mood: 0 }; } },
        ],
      };
    },
  },
  {
    // A first job, by era: bagging groceries, a drive-in, a mall food court, a movie theater, a lifeguard chair.
    id: "t_job", domain: "career", channel: "good", once: true, ages: [15, 17], when: s => s.studying && atHome(s), p: () => 0.3,
    choice: (s, ctx) => {
      const y = s.year, money = homeMoney(s, ctx) === "tight";
      const food = y < 1970 ? "the A&W drive-in" : y < 1990 ? "the Dairy Queen" : y < 2005 ? "the Orange Julius at the mall" : "a Chick-fil-A";
      const store = y < 1975 ? "the A&P" : y < 2000 ? "the grocery store" : "Target";
      const set = (job, text, mood = 3) => (s2, c) => { s2.flags.parttime = job; return { text: c.w(text), mood }; };
      return {
        prompt: `${money ? "Money at home is tight, and you want a job to help out and have something of your own." : "You want money of your own, and you're old enough to get a job."} Where do you apply?`,
        options: [
          { id: "t_job.food", label: `Work at ${food}`, hint: "free food, greasy hair", act: "sideJob", style: "social", weight: 0.3, apply: set(`working at ${food}`, `You got your first job at ${food}, {and came home smelling like fryer oil.|and learned to smile at customers who did not deserve it.|and ate so much free food you couldn't look at it by August.}`) },
          { id: "t_job.store", label: `Bag groceries at ${store}`, hint: "steady hours", act: "sideJob", style: "safe", weight: 0.25, apply: set(`bagging groceries at ${store}`, `You got a job bagging groceries at ${store}, {and learned that eggs go on top.|and old ladies tipped you in butterscotch candies.|and your manager taught you more about work than any class.}`) },
          { id: "t_job.lifeguard", label: "Become a lifeguard at the pool", hint: "a whistle and a tan", act: "sideJob", style: "health", weight: 0.15, apply: set("lifeguarding at the pool", "You got certified and worked as a lifeguard at the town pool, {blowing your whistle at kids running on the deck.|with a sunburn that never quite faded.}") },
          { id: "t_job.theater", label: y < 1980 ? "Usher at the movie theater" : "Work at the movie theater", hint: "free movies", act: "sideJob", style: "self", weight: 0.15, apply: set("working at the movie theater", "You got a job at the movie theater, {sweeping popcorn and seeing every movie for free.|tearing tickets and quoting films for years after.}") },
          { id: "t_job.sit", label: "Babysit and mow lawns", hint: "be your own boss", act: "startup", style: "learn", weight: 0.1, apply: set("babysitting and mowing lawns", "You worked for yourself: babysitting on weekends and mowing lawns, with your own price list and a waiting list of neighbors.") },
          { id: "t_job.family", label: "Help at a family business", hint: "an uncle's shop", act: "familyBusiness", style: "family", weight: 0.05, apply: set("helping at the family business", "You worked at your uncle's shop after school, {and he paid you in cash and life advice.|learning how a business really runs.}") },
        ],
      };
    },
  },
  {
    id: "t_activity", domain: "study", channel: "good", once: true, ages: [14, 16], when: s => hs(s) && !s.flags.club, p: () => 0.3,
    choice: (s, ctx) => {
      const sport = ctx.rng.pick(s.sex === "male" ? ["football", "basketball", "wrestling", "track", "soccer", "baseball"] : s.year < 1975 ? ["cheerleading", "the girls' track team", "field hockey"] : ["volleyball", "basketball", "soccer", "track", "softball", "swimming"]);
      const title = s.year >= 1973 || s.sex === "male" ? sport : sport;
      const set = (club, text, extra = {}) => (s2, c) => { s2.flags.club = club; Object.assign(s2.flags, extra); return { text: c.w(text), mood: 4 }; };
      return {
        prompt: `${scene(ctx, ["The activities fair is in the gym, a long row of folding tables and sign-up sheets.", `Tryouts for ${title} are next week, and the band director keeps waving you over too.`, "Your guidance counselor says colleges like to see something besides grades."])} What do you join?`,
        options: [
          { id: "t_activity.sport", label: `Try out for ${title}`, hint: "early practices, Friday nights", act: "exercise", style: "health", weight: 0.32, apply: set("sports", `You tried out for ${title} and made the team, {and practice at 6 a.m. became your whole life.|and the bus rides to away games were the best part.|and your parents never missed a game.}`, { sport }) },
          { id: "t_activity.band", label: s.year < 1965 ? "Join the marching band" : "Join the band", hint: "halftime shows and band camp", act: "hobby", style: "social", weight: 0.2, apply: set("band", "You joined the band, {played the {trumpet|clarinet|drums|tuba} at every halftime show,|survived band camp in August,} and {made friends for life.|learned to march in the rain.}") },
          { id: "t_activity.theater", label: "Audition for the school play", hint: "spotlight or stage crew", act: "hobby", style: "risk", weight: 0.15, apply: set("theater", "You auditioned for the school play, {got a part with exactly one line, and delivered it magnificently.|ended up on stage crew and loved it more than acting.|got the lead, to everyone's surprise including yours.}") },
          { id: "t_activity.debate", label: "Join debate or the school paper", hint: "words as a weapon", act: "study", style: "learn", weight: 0.13, apply: (s2, c) => { const paper = c.rng() < 0.5; s2.flags.club = paper ? "paper" : "debate"; return { text: paper ? c.w("You joined the school paper, {wrote a scathing review of the cafeteria food,|interviewed the principal,} and saw your name in print for the first time.") : c.w("You joined the debate team, {traveled to tournaments with a tub of index cards,|learned to argue either side of anything,} and your parents regretted it at dinner."), mood: 4 }; } },
          { id: "t_activity.work", label: "Skip it and get a job", hint: "money over trophies", act: "sideJob", style: "self", weight: 0.12, apply: set("none", "You skipped activities and got a part-time job instead, {and liked having your own money.|and the after-school hours belonged to the time clock.}") },
          { id: "t_activity.none", label: "Nothing. You have enough going on", hint: "free afternoons", act: "rest", style: "safe", weight: 0.08, apply: set("none", "You didn't join anything, and spent your afternoons {with friends at the diner|reading in your room|helping at home}.") },
        ],
      };
    },
  },
  {
    id: "t_firstCar", domain: "wealth", channel: "change", once: true, ages: [16, 18], when: s => atHome(s) && s.flags.license !== undefined && !s.flags.firstCar, p: () => 0.35,
    choice: (s, ctx) => {
      const car = ctx.rng.pick(carOf(s.year)), tape = s.year < 1975 ? "an AM radio" : s.year < 1995 ? "a tape deck" : s.year < 2010 ? "a CD player" : "a phone mount";
      const keep = (s2, name) => { s2.flags.firstCar = { name, age: s2.age }; };
      return {
        prompt: `${scene(ctx, [`There's ${car} for sale on a lawn down the street, with ${tape} and a hand-lettered sign.`, `${grownUp(s, ctx)} says you can have ${car} if you pay for the gas and the insurance.`, `You've saved some money from your job, and ${car} at the used-car lot is almost in reach.`])} What do you do?`,
        options: [
          { id: "t_firstCar.buy", label: `Buy ${car} with your savings`, hint: "all of it", act: "invest", style: "risk", weight: 0.3, apply: s2 => { keep(s2, car); return { text: `You bought ${car} with every dollar you had. It had ${tape}, a mysterious smell and a door that only opened from the inside, and it was freedom.`, mood: 6, big: true }; } },
          { id: "t_firstCar.hand", label: "Take the hand-me-down", hint: "free, mostly", act: "wait", style: "family", weight: 0.3, apply: s2 => { keep(s2, car); return { text: `You got ${car} as a hand-me-down, and you put a little air freshener on the mirror and drove it everywhere.`, mood: 5, big: true }; } },
          { id: "t_firstCar.share", label: "Share the family car", hint: "negotiate every Friday", act: "negotiate", style: "social", weight: 0.2, apply: () => ({ text: "You shared the family car, and every Friday night was a negotiation about gas, chores and curfew.", mood: 2 }) },
          { id: "t_firstCar.save", label: "Save for something better", hint: "patience", act: "save", style: "safe", weight: 0.12, apply: () => ({ text: "You passed on the first car you could afford and kept saving. By graduation you had real money in the bank.", mood: 1 }) },
          { id: "t_firstCar.fix", label: "Buy a junker and fix it up", hint: "learn the engine", act: "study", style: "learn", weight: 0.08, apply: s2 => { keep(s2, car); return { text: `You bought ${car} that didn't run and spent a whole summer under it in the driveway. When it started, the neighbors clapped.`, mood: 6, big: true }; } },
        ],
      };
    },
  },
  // ---------- finding your people ----------
  {
    id: "t_lunchTable", once: true, ages: [13, 15], when: teenSchool, p: () => 0.12,
    choice: (s, ctx) => {
      const f = bestFriend(s);
      return {
        prompt: `${scene(ctx, [`First week of ${s.track === "middle" ? middleName(s.year) : "high school"}, and the cafeteria has invisible borders.`, f ? `${f.call} is sitting with a new crowd at lunch, and there's a seat open next to ${them(f)}.` : null, "You stood in the cafeteria with your tray and looked for somewhere to sit."])} Where do you sit?`,
        options: [
          { id: "t_lunchTable.band", label: "With the band and theater kids", hint: "loud, weird, kind", act: "socialize", style: "social", weight: 0.22, apply: (s2, c) => { makeFriend(s2, c, "school"); return { text: c.w("You sat with the band and theater kids, who {sang show tunes at the table|had inside jokes going back years}, and they made room without asking."), mood: 3 }; } },
          { id: "t_lunchTable.team", label: "With the kids from the team", hint: "jerseys on game day", act: "socialize", style: "risk", weight: 0.2, apply: (s2, c) => { makeFriend(s2, c, "school"); return { text: c.w("You sat with the kids from the team, {who talked about practice the whole time|and you suddenly cared a lot about Friday nights}."), mood: 3 }; } },
          { id: "t_lunchTable.brains", label: "With the honors kids", hint: "study hall all day", act: "study", style: "learn", weight: 0.18, apply: (s2, c) => { makeFriend(s2, c, "school"); return { text: c.w("You sat with the honors kids, {who argued about books and video games with equal passion|and somebody always had the homework done}."), mood: 2 }; } },
          { id: "t_lunchTable.old", label: f ? `With ${f.call}, like always` : "With your old friends", hint: "loyal", act: "reconcile", style: "family", weight: 0.25, apply: () => ({ text: f ? `You sat with ${f.call}, like always, and the two of you claimed the corner table for four years.` : "You found your old friends from grade school and sat with them, like always.", mood: 2 }) },
          { id: "t_lunchTable.alone", label: "Eat in the library", hint: "quiet, and a book", act: "avoid", style: "self", weight: 0.15, apply: () => ({ text: "You ate lunch in the library with a book, and the librarian pretended not to see the sandwich. It was the best part of the day.", mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "t_dance", once: true, ages: [13, 14], when: teenSchool, p: () => 0.12,
    choice: (s, ctx) => {
      const c0 = teenCrush(s, ctx), song = slowSong(s.year);
      return {
        prompt: `At the school dance in the gym, they started playing ${song}, and ${c0.call} is standing alone by the bleachers. What do you do?`,
        options: [
          { id: "t_dance.ask", label: `Ask ${c0.call} to dance`, hint: "your heart is pounding", act: "pursue", style: "risk", weight: 0.3, apply: (s2, c) => (c.rng() < 0.6 ? { text: `At the school dance you asked ${c0.call} to slow-dance to ${song}. You swayed at arm's length, staring over each other's shoulders, and it was perfect.`, mood: 6 } : { text: `At the school dance you asked ${c0.call} to dance, and ${they(c0)} said, “Maybe later.” Later never came. You survived.`, mood: -2 }) },
          { id: "t_dance.friends", label: "Dance with your friends in a circle", hint: "safety in numbers", act: "socialize", style: "social", weight: 0.3, apply: () => ({ text: "At the school dance you danced in a big circle with your friends to every fast song, and sat out the slow ones laughing.", mood: 4 }) },
          { id: "t_dance.wall", label: "Hold up the wall", hint: "observe", act: "avoid", style: "safe", weight: 0.2, apply: () => ({ text: `At the school dance you stood against the wall the whole night with a cup of punch, watching ${c0.call}. Next year, you said.`, mood: 0 }) },
          { id: "t_dance.dare", label: "Let your friends dare you", hint: "they'll make it happen", act: "socialize", style: "risk", weight: 0.1, apply: () => ({ text: `At the school dance your friends shoved you toward ${c0.call}, and you both ended up dancing out of pure embarrassment. You laughed about it for years.`, mood: 4 }) },
          { id: "t_dance.leave", label: "Call home for a ride", hint: "not tonight", act: "rest", style: "self", weight: 0.1, apply: () => ({ text: `At the school dance you called home for an early ride. ${grownUp(s, ctx)} didn't ask questions and stopped for fries on the way home.`, mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "t_heartbreak", domain: "love", channel: "bad", once: true, ages: [15, 19], when: s => s.flags.firstLove && s.age - s.flags.firstLove.age >= 1, p: () => 0.4,
    choice: (s, ctx) => {
      const name = s.flags.firstLove.name, song = musicOf(s.year);
      return {
        prompt: `You and ${name} broke up${ctx.rng.pick([" over the phone", " in the school parking lot", " right before summer", " by a note in your locker"])}, and it feels like the end of the world. How do you get through it?`,
        options: [
          { id: "t_heartbreak.music", label: "Sad songs on repeat", hint: song.how, act: "rest", style: "self", weight: 0.3, apply: () => ({ text: `After you and ${name} broke up, you played the saddest songs you owned ${song.how} until the batteries died. Then you felt a little better.`, mood: -3 }) },
          { id: "t_heartbreak.friends", label: "Ice cream with your friends", hint: "they've got you", act: "socialize", style: "social", weight: 0.3, apply: () => ({ text: `After you and ${name} broke up, your friends showed up with ice cream and declared ${name} dead to all of you. It helped more than you'd admit.`, mood: -1 }) },
          { id: "t_heartbreak.write", label: "Write it all down", hint: "poetry, probably bad", act: "hobby", style: "learn", weight: 0.15, apply: () => ({ text: `After you and ${name} broke up, you filled a notebook with poetry. It was terrible and it was exactly what you needed.`, mood: -2 }) },
          { id: "t_heartbreak.busy", label: "Throw yourself into something", hint: "sports, a job, anything", act: "pushThrough", style: "health", weight: 0.15, apply: () => ({ text: `After you and ${name} broke up, you threw yourself into practice and work, and by fall you had stopped checking for ${name} in the hallway.`, mood: -1 }) },
          { id: "t_heartbreak.back", label: "Try to get back together", hint: "one more chance", act: "reconcile", style: "risk", weight: 0.1, apply: (s2, c) => (c.rng() < 0.4 ? { text: `After you and ${name} broke up, you asked for another chance, and got it, for one more summer.`, mood: 2 } : { text: `After you and ${name} broke up, you asked for another chance. ${name} said no, kindly, and you learned something about letting go.`, mood: -4 }) },
        ],
      };
    },
  },
  {
    id: "t_admirer", domain: "love", channel: "good", once: true, ages: [14, 18], when: teenSchool, p: () => 0.08,
    choice: (s, ctx) => {
      const c0 = teenCrush(s, ctx);
      const how = s.year < 1995 ? "slipped a folded note into your locker" : s.year < 2010 ? "sent you a long message late one night" : "asked a friend to tell you";
      return {
        prompt: `${c0.call} ${how}: ${they(c0)} likes you. You like ${them(c0)} fine, but not like that. What do you do?`,
        options: [
          { id: "t_admirer.honest", label: "Tell them kindly", hint: "honest and gentle", act: "talk", style: "social", weight: 0.4, apply: () => ({ text: `When ${c0.call} said ${they(c0)} liked you, you told ${them(c0)} kindly that you didn't feel the same. ${cap(they(c0))} said thanks for being honest, and you stayed friends.`, mood: 0 }) },
          { id: "t_admirer.try", label: "Give it a chance", hint: "maybe you'll feel it", act: "pursue", style: "risk", weight: 0.2, apply: (s2, c) => (c.rng() < 0.4 ? { text: `When ${c0.call} said ${they(c0)} liked you, you gave it a chance, and to your surprise, by spring you liked ${them(c0)} too.`, mood: 4 } : { text: `When ${c0.call} said ${they(c0)} liked you, you gave it a chance for a few weeks, then ended it gently. It was awkward in the hallway for a while.`, mood: -1 }) },
          { id: "t_admirer.avoid", label: "Avoid them", hint: "too awkward", act: "avoid", style: "self", weight: 0.2, apply: () => ({ text: `When ${c0.call} said ${they(c0)} liked you, you avoided ${them(c0)} for months. Later you wished you had just said something.`, mood: -2 }) },
          { id: "t_admirer.friend", label: "Ask a friend what to do", hint: "council of war", act: "seekHelp", style: "social", weight: 0.1, apply: () => ({ text: `When ${c0.call} said ${they(c0)} liked you, you asked your best friend what to do, and the whole grade knew by lunch.`, mood: -1 }) },
          { id: "t_admirer.flattered", label: "Say thank you, mean it", hint: "it's nice to be liked", act: "reconcile", style: "family", weight: 0.1, apply: () => ({ text: `When ${c0.call} said ${they(c0)} liked you, you said thank you and meant it. You walked around a little taller for a week.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    // Coming out: rare before the 1990s, when most kept it to themselves; more common since. An assumption; about
    // 7 % of US adults (and around 1 in 5 of Gen Z) identify as LGBTQ in recent surveys.
    id: "t_comingOut", rare: true, once: true, ages: [14, 18], when: atHome, p: s => (s.year < 1990 ? 0.004 : s.year < 2010 ? 0.01 : 0.025),
    choice: (s, ctx) => {
      const f = bestFriend(s), who = grownUp(s, ctx), early = s.year < 1990;
      const lead = early ? `It's ${s.year}, and you've known for a while that you're not like the other kids in the way everyone expects. Nobody at your school talks about it.` : scene(ctx, ["You've known for a while who you are, and you're tired of keeping it to yourself.", `You've figured out something about who you are, and you want to tell ${f ? f.call : "someone"}.`]);
      const out = s2 => { s2.flags.out = s2.age; };
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "t_comingOut.friend", label: f ? `Tell ${f.call} first` : "Tell a close friend first", hint: "someone safe", act: "talk", style: "social", weight: 0.35, apply: s2 => { out(s2); return { text: `You came out to ${f ? f.call : "a close friend"} first, on a long walk after school. ${f ? f.call : "Your friend"} said, “I know. I love you. Want fries?” You cried and laughed at the same time.`, mood: 5, big: true }; } },
          { id: "t_comingOut.parents", label: `Tell ${who}`, hint: "the big one", act: "talk", style: "family", weight: 0.2, apply: (s2, c) => { out(s2); return c.rng() < (early ? 0.5 : 0.75) ? { text: `You came out to ${who} at the kitchen table. ${who} was quiet for a long moment, then hugged you and didn't let go.`, mood: 6, big: true } : { text: `You came out to ${who}, and it went badly at first. It took a long time, and a lot of reading, and one very long talk in the car, but ${who} came around.`, mood: -2, big: true }; } },
          { id: "t_comingOut.club", label: s.year >= 1995 ? "Join the school's GSA" : "Find others like you", hint: "you're not the only one", act: "socialize", style: "learn", weight: 0.15, apply: s2 => { out(s2); return { text: s2.year >= 1995 ? "You went to a meeting of the school's Gay-Straight Alliance, in a classroom with the blinds half drawn, and found a room full of people who understood." : "You found a few others like you, through a bookstore in the next town and a lot of courage, and you weren't alone anymore.", mood: 5 }; } },
          { id: "t_comingOut.letter", label: "Write it in a letter", hint: "easier than saying it", act: "talk", style: "safe", weight: 0.1, apply: s2 => { out(s2); return { text: `You wrote ${who} a letter and left it on the kitchen counter before school. When you came home, the letter was gone and there was a note on your pillow: “We love you. Always.”`, mood: 5, big: true }; } },
          { id: "t_comingOut.wait", label: early ? "Keep it to yourself for now" : "Wait until college", hint: "when it feels safe", act: "wait", style: "self", weight: 0.2, apply: () => ({ text: early ? "You kept who you were to yourself through high school. It was lonely, and it was not forever." : "You decided to wait until you were out of the house. You told a journal instead, and counted the days.", mood: -1 }) },
        ],
      };
    },
  },
  // ---------- the big nights ----------
  {
    id: "t_party", once: true, ages: [15, 17], when: hs, p: () => 0.2,
    choice: (s, ctx) => {
      const host = ctx.rng.pick(["a senior whose parents are in Florida", "a kid from your chemistry class", "the quarterback"]), drive = s.flags.license !== undefined;
      return {
        prompt: `There's a party Saturday at the house of ${host}. Everyone says there will be drinking, and no parents. What do you do?`,
        options: [
          { id: "t_party.goSober", label: "Go, but don't drink", hint: "a red cup of soda", act: "socialize", style: "safe", weight: 0.3, apply: () => ({ text: "You went to the party and carried a red cup of soda all night. You saw some things, and you were home by curfew.", mood: 2 }) },
          { id: "t_party.drink", label: "Go and drink", hint: "like everyone else", act: "vice", style: "risk", weight: 0.25, apply: (s2, c) => { s2.flags.teenDrink = true; return c.rng() < 0.4 ? { text: "You went to the party and drank warm beer from a keg. You threw up in a hydrangea and your best friend held your hair. Never again, you said.", mood: -2 } : { text: "You went to the party and had a couple of drinks, and danced on a coffee table, and someone took pictures you would spend years untagging.", mood: 2 }; } },
          { id: "t_party.drive", label: drive ? "Be the designated driver" : "Go and look after your friends", hint: "the responsible one", act: "care", style: "family", weight: 0.15, apply: () => ({ text: drive ? "You went to the party as the designated driver, and drove four friends home at midnight with the windows down. They still thank you." : "You went to the party and spent it making sure your friends got home safe. You were tired and proud.", mood: 3 }) },
          { id: "t_party.deal", label: `Go, with a no-questions ride deal with ${grownUp(s, ctx)}`, hint: "call anytime", act: "talk", style: "social", weight: 0.1, apply: () => ({ text: "You had a deal with your parents: call anytime, no questions. At eleven you called. They came, and they kept their word.", mood: 2 }) },
          { id: "t_party.home", label: "Stay home", hint: "not your scene", act: "rest", style: "self", weight: 0.2, apply: () => ({ text: "You stayed home from the party and heard all about it on Monday. You were glad you missed most of it.", mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "t_curfew", domain: "family", channel: "bad", once: true, ages: [15, 17], when: atHome, p: () => 0.15,
    choice: (s, ctx) => {
      const who = grownUp(s, ctx), late = ctx.rng.pick(["an hour", "two hours", "forty-five minutes"]);
      return {
        prompt: `You came home ${late} past curfew, and ${who} is sitting in the dark living room, waiting. What do you do?`,
        options: [
          { id: "t_curfew.truth", label: "Tell the truth and apologize", hint: "take the hit", act: "reconcile", style: "family", weight: 0.35, apply: () => ({ text: `You came home ${late} past curfew and told ${who} the truth. You were grounded for a week, and ${who} said, quietly, “I was scared.” That stuck with you.`, mood: -1 }) },
          { id: "t_curfew.excuse", label: "Blame a flat tire", hint: "it could happen", act: "avoid", style: "risk", weight: 0.2, apply: (s2, c) => (c.rng() < 0.5 ? { text: `You came home ${late} past curfew and blamed a flat tire. ${who} checked the tires in the morning. Grounded for two weeks.`, mood: -4 } : { text: `You came home ${late} past curfew and blamed a flat tire. ${who} seemed to believe you, which was somehow worse.`, mood: -1 }) },
          { id: "t_curfew.argue", label: "Argue the curfew is unfair", hint: "you're almost an adult", act: "insist", style: "self", weight: 0.2, apply: () => ({ text: `You came home ${late} past curfew and argued that the curfew was unfair. It became a two-hour negotiation and, eventually, a new curfew thirty minutes later.`, mood: 0 }) },
          { id: "t_curfew.call", label: "Promise to call next time", hint: "a fair deal", act: "negotiate", style: "social", weight: 0.15, apply: () => ({ text: `You came home ${late} past curfew, and you and ${who} made a deal: you could be late if you called. You always called after that.`, mood: 1 }) },
          { id: "t_curfew.sneak", label: "Sneak in through the window next time", hint: "a lesson learned, wrongly", act: "avoid", style: "risk", weight: 0.1, apply: () => ({ text: `You took your punishment for coming home ${late} late, then started climbing in through your bedroom window instead. It worked until the night you knocked over a lamp.`, mood: -1 }) },
        ],
      };
    },
  },
  {
    id: "t_cheat", domain: "study", channel: "bad", once: true, ages: [14, 17], when: hs, p: () => 0.1,
    choice: (s, ctx) => {
      const subject = ctx.rng.pick(["chemistry", "Algebra II", "history", "Spanish"]), f = bestFriend(s);
      const lead = scene(ctx, [`Someone got the answers to tomorrow's ${subject} test and is passing them around.`, `During the ${subject} final, the kid next to you tilted their paper toward you.`, f ? `${f.call} asked to copy your ${subject} homework, again.` : null]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "t_cheat.refuse", label: "Don't touch it", hint: "you studied", act: "study", style: "safe", weight: 0.4, apply: s2 => { s2.flags.honest = (s2.flags.honest || 0) + 1; return { text: `With the ${subject} answers going around, you didn't touch them. You got a B on your own, and half the class got caught.`, mood: 2 }; } },
          { id: "t_cheat.use", label: "Use them", hint: "everyone else is", act: "avoid", style: "risk", weight: 0.2, apply: (s2, c) => { s2.flags.honest = (s2.flags.honest || 0) - 1; return c.rng() < 0.4 ? { text: `You used the ${subject} answers and got caught. Zero on the test, a call home, and a long talk in the car.`, mood: -5 } : { text: `You used the ${subject} answers and got an A you didn't earn. It felt worse than you expected.`, mood: -1 }; } },
          { id: "t_cheat.tell", label: "Tell the teacher", hint: "the right thing, socially costly", act: "seekHelp", style: "self", weight: 0.1, apply: () => ({ text: `You told the ${subject} teacher about the answers. The test was rewritten, and a few people didn't speak to you for a while.`, mood: -1 }) },
          { id: "t_cheat.help", label: f ? `Tutor ${f.call} instead` : "Offer to help them study instead", hint: "a better kind of help", act: "care", style: "family", weight: 0.15, apply: () => ({ text: `Instead of passing answers, you spent two evenings tutoring ${f ? f.call : "the kid who asked"} in ${subject}. They passed on their own.`, mood: 3 }) },
          { id: "t_cheat.cram", label: "Cram all night", hint: "do it the hard way", act: "pushThrough", style: "learn", weight: 0.15, apply: () => ({ text: `You ignored the ${subject} answers and crammed until 3 a.m. with a pot of coffee. You passed, barely, and slept through lunch.`, mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "t_concert", once: true, ages: [14, 18], when: atHome, p: () => 0.15,
    choice: (s, ctx) => {
      const band = concertOf(s.year), f = bestFriend(s);
      const [tix, tixPast] = s.year < 1996 ? ["camp out overnight at the record store for tickets", "camped out overnight at the record store for tickets"] : ["refresh the ticket site for an hour", "refreshed the ticket site for an hour"];
      return {
        prompt: `${cap(band)} ${s.year >= 2023 && band.includes("Eras") ? "is" : "are"} coming to town, and tickets are expensive. What do you do?`,
        options: [
          { id: "t_concert.save", label: "Save up and buy tickets", hint: "weeks of shifts", act: "save", style: "safe", weight: 0.3, apply: (s2, c) => { c.remember("firstConcert", band); return { text: c.w(`You saved up for weeks and saw ${band} {from the nosebleed seats, which did not matter at all.|with ${f ? f.call : "your best friend"}, screaming every word.} You kept the ticket stub for decades.`), mood: 6, big: true }; } },
          { id: "t_concert.camp", label: cap(tix), hint: "dedication", act: "pushThrough", style: "risk", weight: 0.2, apply: (s2, c) => { c.remember("firstConcert", band); return { text: `You ${tixPast} and got great seats to ${band}. It was the loudest, happiest night of your life so far.`, mood: 7, big: true }; } },
          { id: "t_concert.radio", label: "Call in to win tickets on the radio", hint: "caller number nine", act: "lottery", style: "risk", weight: 0.15, apply: (s2, c) => { if (c.rng() < 0.3) { c.remember("firstConcert", band); return { text: `You called the radio station forty times and were caller number nine. You won tickets to ${band}, and the DJ said your name on the air.`, mood: 8, big: true }; } return { text: `You called the radio station for an hour trying to win tickets to ${band}, and got a busy signal every time.`, mood: -1 }; } },
          { id: "t_concert.sneak", label: "Go without telling your parents", hint: "an alibi at a friend's", act: "avoid", style: "self", weight: 0.15, apply: (s2, c) => { c.remember("firstConcert", band); return c.rng() < 0.4 ? { text: `You told your parents you were at a friend's and went to see ${band}. You were on the local news crowd shot. Grounded for a month, and worth it.`, mood: 3 } : { text: `You snuck out to see ${band} and got home without anyone knowing. You were hoarse for three days.`, mood: 5 }; } },
          { id: "t_concert.skip", label: "Skip it, and buy the album", hint: "the music is the music", act: "save", style: "safe", weight: 0.2, apply: () => ({ text: `You skipped ${band} and bought the album instead, and wore it out ${musicOf(s.year).how}.`, mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "t_carDent", once: true, ages: [16, 19], when: s => atHome(s) && s.flags.license !== undefined, p: () => 0.15,
    choice: (s, ctx) => {
      const car = s.flags.firstCar ? s.flags.firstCar.name : "the family car", own = !!s.flags.firstCar, who = grownUp(s, ctx);
      const how = ctx.rng.pick(["backed into a pole at the grocery store", "scraped the side on the garage door", "tapped a parked car in the school lot"]);
      return {
        prompt: `You ${how} and put a big dent in ${car}. What do you do?`,
        options: [
          { id: "t_carDent.confess", label: `Tell ${who} right away`, hint: own ? "advice, at least" : "it's their car", act: "talk", style: "family", weight: 0.35, apply: () => ({ text: `You ${how} and told ${who} right away. ${who} looked at the dent a long time, then said, “Is anyone hurt? No? Then it's just a car.”`, mood: 0 }) },
          { id: "t_carDent.pay", label: "Pay for it with your job money", hint: "own it", act: "save", style: "safe", weight: 0.25, apply: () => ({ text: `You ${how} and paid for the repair out of your own paychecks, six weeks' worth. You drove very, very carefully after that.`, mood: -2 }) },
          { id: "t_carDent.fix", label: "Fix it yourself with a plunger", hint: "a trick you saw", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => (c.rng() < 0.5 ? { text: `You ${how}, then popped the dent out with a toilet plunger and some hot water. You told nobody, ever, until now.`, mood: 3 } : { text: `You ${how} and tried to fix it with a plunger, and made it worse. Then you had to confess to both.`, mood: -3 }) },
          { id: "t_carDent.hide", label: "Park it with the dent to the wall", hint: "buy some time", act: "avoid", style: "risk", weight: 0.15, apply: () => ({ text: `You ${how} and parked with the dent facing the wall for nine days. ${who} found it while washing the car, and you lost the keys for a month.`, mood: -4 }) },
          { id: "t_carDent.note", label: "Leave a note on the other car", hint: own ? "the honest way" : "your name and number", act: "reconcile", style: "safe", weight: 0.1, apply: () => ({ text: `You ${how}, and left a note with your name and number on the other car. The owner called and said nobody had done that for them before; you split the cost.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "t_sibCare", domain: "family", channel: "change", tags: ["siblings"], about: "siblings", once: true, ages: [13, 17], when: s => atHome(s) && youngerSibs(s, 2).some(x => s.age - x.bornAt <= 10), p: () => 0.15,
    choice: (s, ctx) => {
      const x = youngerSibs(s, 2).find(y => s.age - y.bornAt <= 10), name = sibName(x), who = grownUp(s, ctx), plan = ctx.rng.pick(["a party", "the big game", "a movie with friends", "the mall"]);
      return {
        prompt: `${who} has to work late again and needs you to watch ${name}, the same night as ${plan}. What do you do?`,
        options: [
          { id: "t_sibCare.stay", label: `Stay home with ${sibShort(x)}`, hint: "family first", act: "care", style: "family", weight: 0.4, apply: () => ({ text: `You skipped ${plan} to watch ${name}. You made boxed mac and cheese and built a blanket fort, and ${name} still talks about it.`, mood: 1 }) },
          { id: "t_sibCare.bring", label: `Bring ${sibShort(x)} along`, hint: "a tagalong", act: "socialize", style: "social", weight: 0.2, apply: () => ({ text: `You brought ${name} along to ${plan}, and your friends spoiled ${name} rotten. Everyone survived.`, mood: 3 }) },
          { id: "t_sibCare.neighbor", label: "Ask the neighbor to watch them", hint: "pay with your own money", act: "hireCare", style: "self", weight: 0.15, apply: () => ({ text: `You paid the neighbor to watch ${name} with your own money and went to ${plan}. You felt guilty and had a good time anyway.`, mood: 1 }) },
          { id: "t_sibCare.complain", label: "Complain that it isn't fair", hint: "it isn't", act: "insist", style: "self", weight: 0.15, apply: () => ({ text: `You told ${who} it wasn't fair that you always had to watch ${name}. ${who} agreed, and the next time, found someone else. You stayed home anyway.`, mood: 0 }) },
          { id: "t_sibCare.trade", label: "Trade nights with a cousin", hint: "a deal", act: "negotiate", style: "social", weight: 0.1, apply: () => ({ text: `You traded babysitting nights with a cousin so you could go to ${plan}. You owed your cousin one, forever.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "t_volunteer", once: true, ages: [14, 18], when: hs, p: () => 0.12,
    choice: (s, ctx) => {
      const faith = faithOf(s, ctx);
      return {
        prompt: `You need community service hours to graduate${s.year < 1990 ? ", or at least your youth group says you do" : ""}. Where do you volunteer?`,
        options: [
          { id: "t_volunteer.kitchen", label: "The soup kitchen", hint: "Saturday mornings", act: "volunteer", style: "social", weight: 0.25, apply: () => ({ text: "You volunteered at the soup kitchen on Saturday mornings, and a regular named Walter taught you to play chess between shifts.", mood: 4 }) },
          { id: "t_volunteer.home", label: "The nursing home", hint: "bingo and stories", act: "care", style: "family", weight: 0.2, apply: () => ({ text: "You volunteered at the nursing home, calling bingo and listening to stories, and one woman told you about dancing with sailors in 1944.", mood: 4 }) },
          { id: "t_volunteer.trip", label: faith === "christian" ? "A youth group mission trip" : "A service trip to build houses", hint: "a week away", act: "travel", style: "risk", weight: 0.2, apply: () => ({ text: "You spent a week of summer on a service trip, building a house with a crew of strangers who were friends by Friday. You came home sunburned and changed.", mood: 5, big: true }) },
          { id: "t_volunteer.animals", label: "The animal shelter", hint: "puppies", act: "volunteer", style: "family", weight: 0.2, apply: () => ({ text: "You volunteered at the animal shelter walking dogs, and very nearly adopted every one.", mood: 4 }) },
          { id: "t_volunteer.minimum", label: "Whatever's quickest", hint: "just the hours", act: "wait", style: "self", weight: 0.15, apply: () => ({ text: "You did your community service hours picking up litter along the highway in an orange vest, the fastest way to get it done. You found eleven dollars.", mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "t_summer", once: true, ages: [15, 17], when: hs, p: () => 0.2,
    choice: (s, ctx) => ({
      prompt: `Summer vacation is here: ten weeks, wide open. What do you do with them?`,
      options: [
        { id: "t_summer.work", label: "Work as many shifts as you can", hint: "save for a car", act: "sideJob", style: "safe", weight: 0.3, apply: () => ({ text: "You worked every shift you could get that summer and watched your savings account climb. You also smelled permanently of whatever your job was.", mood: 2 }) },
        { id: "t_summer.counselor", label: "Be a camp counselor", hint: "kids, a lake, a whistle", act: "care", style: "social", weight: 0.2, apply: () => ({ text: "You were a camp counselor that summer, leading songs and finding lost shoes, and a nine-year-old wrote you a thank-you letter you kept.", mood: 5 }) },
        { id: "t_summer.program", label: "A summer program at a college", hint: "a taste of campus", act: "study", style: "learn", weight: 0.15, apply: () => ({ text: "You spent part of the summer at a program on a college campus, living in a dorm and feeling very grown-up. It made the future feel real.", mood: 4 }) },
        { id: "t_summer.trip", label: "A road trip with the family", hint: "one last big one", act: "travel", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w("You took one more big road trip with the family, to {trip}, and even though you complained, you remember every mile."), mood: 4 }) },
        { id: "t_summer.lazy", label: "Sleep until noon", hint: "you've earned it", act: "rest", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You slept until noon every day that summer and spent the afternoons {at the pool|at the lake|on the couch with ${screenOf(s2.year)}}. It was glorious and you regret nothing.`), mood: 3 }) },
      ],
    }),
  },
  {
    id: "t_stress", domain: "health", channel: "bad", once: true, ages: [15, 18], when: hs, p: () => 0.1,
    choice: (s, ctx) => {
      const lead = scene(ctx, ["Finals week, three tests in two days, and a paper due Friday. You can't sleep.", "Between practice, your job and homework, you haven't had a free hour in a month.", s.year >= 2005 ? "College applications, AP exams and a phone that never stops buzzing: you feel like you're drowning." : "College applications, finals and a part-time job: you feel like you're drowning."]);
      return {
        prompt: `${lead} How do you handle it?`,
        options: [
          { id: "t_stress.plan", label: "Make a schedule and stick to it", hint: "one thing at a time", act: "study", style: "learn", weight: 0.3, apply: () => ({ text: "Overwhelmed, you made a schedule on a sheet of notebook paper and crossed things off one at a time. It got done, and so did you.", mood: 1 }) },
          { id: "t_stress.talk", label: "Talk to someone", hint: "a counselor, a parent", act: "counsel", style: "health", weight: 0.2, apply: s2 => { s2.health.stress = Math.max(0, s2.health.stress - 0.1); return { text: "Overwhelmed, you finally told someone how you felt, and they helped you drop one thing. You hadn't known you were allowed to.", mood: 2 }; } },
          { id: "t_stress.allNighter", label: "Pull all-nighters", hint: "coffee and panic", act: "pushThrough", style: "risk", weight: 0.25, apply: () => ({ text: "Overwhelmed, you pulled three all-nighters in a week on coffee and panic. You passed everything and slept for most of winter break.", mood: -3 }) },
          { id: "t_stress.quit", label: "Quit something", hint: "the job or the team", act: "quitJob", style: "self", weight: 0.1, apply: () => ({ text: "Overwhelmed, you quit one of the things on your plate. It felt like failing, then it felt like breathing.", mood: 2 }) },
          { id: "t_stress.run", label: "Go running every night", hint: "burn it off", act: "exercise", style: "health", weight: 0.15, apply: () => ({ text: "Overwhelmed, you started running every night after dinner, and the miles cleared your head better than anything.", mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "t_friendFight", domain: "family", channel: "bad", tags: ["friends"], once: true, ages: [14, 17], when: s => atHome(s) && !!bestFriend(s), p: () => 0.1,
    choice: (s, ctx) => {
      const f = bestFriend(s), why = ctx.rng.pick(["told someone your secret", "ditched you for a new crowd", "started dating the person you liked", "said something cruel about your family"]);
      return {
        prompt: `${f.call}, your best friend since forever, ${why}. What do you do?`,
        options: [
          { id: "t_friendFight.talk", label: "Have it out, honestly", hint: "say how it hurt", act: "talk", style: "social", weight: 0.35, apply: () => ({ text: `When ${f.call} ${why}, you had it out in the parking lot, both of you crying by the end. You were okay again by the weekend.`, mood: 1 }) },
          { id: "t_friendFight.forgive", label: "Let it go", hint: "the friendship matters more", act: "reconcile", style: "family", weight: 0.2, apply: () => ({ text: `When ${f.call} ${why}, you let it go. ${cap(they(f))} knew, and never did it again.`, mood: 1 }) },
          { id: "t_friendFight.end", label: "End the friendship", hint: "some things don't get fixed", act: "cutOff", style: "self", weight: 0.15, apply: s2 => { s2.flags.bff = null; return { text: `When ${f.call} ${why}, you ended the friendship. You missed ${them(f)} for years, and you never told anyone how much.`, mood: -5 }; } },
          { id: "t_friendFight.cold", label: "Freeze them out", hint: "let them wonder", act: "avoid", style: "risk", weight: 0.2, apply: () => ({ text: `When ${f.call} ${why}, you froze ${them(f)} out for a month. It was a lonely month for both of you, and then you weren't mad anymore.`, mood: -2 }) },
          { id: "t_friendFight.parent", label: `Ask ${grownUp(s, ctx)} for advice`, hint: "they've lived it", act: "seekHelp", style: "family", weight: 0.1, apply: () => ({ text: `When ${f.call} ${why}, you asked for advice at home and heard about a friendship from long ago that ended over less. You called ${f.call} that night.`, mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "t_election", domain: "career", channel: "good", once: true, ages: [14, 17], when: hs, p: () => 0.07,
    choice: (s, ctx) => ({
      prompt: `Student council elections are coming, and a teacher thinks you should run for class president. Do you?`,
      options: [
        { id: "t_election.run", label: "Run for president", hint: "posters and a speech", act: "pursue", style: "risk", weight: 0.3, apply: (s2, c) => (c.roll("career", "good", 0.45) ? { text: "You ran for class president with homemade posters and a speech you practiced in the mirror, and you won. Your first act was a better homecoming theme.", mood: 6, big: true } : { text: "You ran for class president, gave a speech your hands shook through, and lost by eleven votes. You were secretly proud you tried.", mood: -1 }) },
        { id: "t_election.vp", label: "Run for something smaller", hint: "treasurer is a real job", act: "pursue", style: "safe", weight: 0.2, apply: () => ({ text: "You ran for class treasurer and won, and spent the year counting bake-sale money in a cash box.", mood: 3 }) },
        { id: "t_election.manage", label: "Run a friend's campaign", hint: "the power behind the throne", act: "socialize", style: "social", weight: 0.2, apply: () => ({ text: "You ran your best friend's campaign for class president, with slogans and a poster blitz, and your friend won. You never let them forget it.", mood: 4 }) },
        { id: "t_election.no", label: "Pass", hint: "not your thing", act: "wait", style: "self", weight: 0.2, apply: () => ({ text: "You passed on student council. Somebody had to be the voters.", mood: 0 }) },
        { id: "t_election.joke", label: "Run as a joke candidate", hint: "free pizza Fridays", act: "insist", style: "risk", weight: 0.1, apply: () => ({ text: "You ran for class president as a joke on a platform of free pizza Fridays, and came in second. The principal was not amused; everyone else was.", mood: 4 }) },
      ],
    }),
  },
  {
    id: "t_skipDay", once: true, ages: [17, 17], when: hs, p: () => 0.25,
    choice: (s, ctx) => ({
      prompt: `It's senior year, and the class is planning a senior skip day and a prank. Are you in?`,
      options: [
        { id: "t_skipDay.skip", label: "Skip with everyone", hint: "a day at the lake", act: "socialize", style: "social", weight: 0.35, apply: (s2, c) => ({ text: c.w("On senior skip day, half your class drove to {the lake|the beach|a state park} and spent the day doing nothing at all, together, which felt like the point."), mood: 4 }) },
        { id: "t_skipDay.prank", label: "Help plan the prank", hint: "nothing destructive", act: "hobby", style: "risk", weight: 0.2, apply: (s2, c) => ({ text: c.w("You helped plan the senior prank: {four hundred plastic forks in the front lawn,|a live goat in the principal's office, briefly,|every cup in the cafeteria filled with water,} and the principal laughed despite herself."), mood: 5 }) },
        { id: "t_skipDay.school", label: "Go to school anyway", hint: "perfect attendance", act: "study", style: "safe", weight: 0.2, apply: () => ({ text: "On senior skip day you went to school anyway, and you and three other kids watched a movie with a teacher who was secretly relieved.", mood: 1 }) },
        { id: "t_skipDay.work", label: "Pick up a shift instead", hint: "money", act: "sideJob", style: "self", weight: 0.15, apply: () => ({ text: "On senior skip day you picked up an extra shift at work, and your manager let you leave early to meet everyone at the diner.", mood: 1 }) },
        { id: "t_skipDay.family", label: "Spend the day with family", hint: "they'll miss you soon", act: "care", style: "family", weight: 0.1, apply: () => ({ text: "On senior skip day you spent the day with your family, because they kept saying how much they'd miss you, and you realized you'd miss them too.", mood: 3 }) },
      ],
    }),
  },
  // ---------- growing up, and pushing back ----------
  {
    id: "t_rebel", domain: "family", channel: "bad", once: true, ages: [14, 17], when: atHome, p: () => 0.12,
    choice: (s, ctx) => {
      const who = grownUp(s, ctx), hair = s.year < 1975 ? "grow your hair to your shoulders" : s.year < 1995 ? "dye your hair purple with Kool-Aid" : "dye your hair blue";
      return {
        prompt: `You're tired of being told who to be. ${who} keeps saying “not while you live under my roof.” What's your rebellion?`,
        options: [
          { id: "t_rebel.hair", label: cap(hair), hint: "a statement", act: "insist", style: "self", weight: 0.3, apply: () => ({ text: `You decided to ${hair}. ${who} gasped, then got used to it, then said it suited you, which ruined it.`, mood: 3 }) },
          { id: "t_rebel.pierce", label: "Pierce your ear at the mall", hint: "Claire's, a friend, a dare", act: "insist", style: "risk", weight: 0.2, apply: () => ({ text: `You got your ear pierced at the mall without asking. ${who} found out at dinner and said, “Well, at least it's not a tattoo.”`, mood: 2 }) },
          { id: "t_rebel.music", label: "Blast music they hate", hint: "volume as a weapon", act: "insist", style: "self", weight: 0.2, apply: () => ({ text: `You played music ${who} hated, loudly, behind a closed door with a sign on it. It was the most peaceful rebellion in the history of your house.`, mood: 2 }) },
          { id: "t_rebel.sneak", label: "Sneak out at night", hint: "the window, the trellis", act: "avoid", style: "risk", weight: 0.15, apply: (s2, c) => (c.rng() < 0.5 ? { text: "You snuck out your bedroom window one night to meet friends at the water tower. You got back at 3 a.m. and nobody ever knew.", mood: 3 } : { text: `You snuck out your window one night and came back to find ${who} sitting on your bed. You lost the car, the phone and your dignity.`, mood: -4 }) },
          { id: "t_rebel.talk", label: "Talk about it instead", hint: "a truce", act: "talk", style: "social", weight: 0.15, apply: () => ({ text: `You sat ${who} down and said you needed more room to be yourself. It was awkward, and it worked better than any rebellion would have.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "t_wildFriends", domain: "family", channel: "bad", once: true, ages: [14, 17], when: atHome, p: () => 0.08,
    choice: (s, ctx) => {
      const store = s.year < 1995 ? "the five-and-dime" : "the drugstore";
      return {
        prompt: `Your new friends dared you to shoplift a candy bar from ${store}. They're watching. What do you do?`,
        options: [
          { id: "t_wildFriends.no", label: "Say no and walk away", hint: "maybe lose the friends", act: "avoid", style: "safe", weight: 0.4, apply: s2 => { s2.flags.honest = (s2.flags.honest || 0) + 1; return { text: "Dared to shoplift, you said no and walked home alone. Those friends drifted away, and you found better ones.", mood: 0 }; } },
          { id: "t_wildFriends.do", label: "Do it", hint: "it's just a candy bar", act: "vice", style: "risk", weight: 0.15, apply: (s2, c) => (c.rng() < 0.35 ? { text: `Dared to shoplift, you tried it and got caught by the manager of ${store}, who called your parents and made you mop the floor. You never did it again.`, mood: -5 } : { text: "Dared to shoplift, you did it, and got away with it, and felt sick for a week. You went back and left a dollar on the counter.", mood: -2 }) },
          { id: "t_wildFriends.pay", label: "Buy it instead and laugh it off", hint: "defuse it", act: "socialize", style: "social", weight: 0.2, apply: () => ({ text: "Dared to shoplift, you bought the candy bar instead and split it with everyone. Somehow that was cooler.", mood: 2 }) },
          { id: "t_wildFriends.talk", label: "Talk them out of it", hint: "be the voice of reason", act: "talk", style: "family", weight: 0.15, apply: () => ({ text: "Dared to shoplift, you talked your friends out of the whole thing, and you all went to get pizza instead.", mood: 2 }) },
          { id: "t_wildFriends.tell", label: "Tell a parent about these friends", hint: "something's off", act: "seekHelp", style: "safe", weight: 0.1, apply: () => ({ text: "Dared to shoplift, you went home and told your parents about your new friends. They didn't panic, which helped you see it clearly.", mood: 1 }) },
        ],
      };
    },
  },
  {
    // The first cigarette, or the first vape from about 2015.
    id: "t_smoke", domain: "health", channel: "bad", once: true, ages: [14, 17], when: atHome, p: s => (s.year < 1980 ? 0.2 : s.year < 2000 ? 0.15 : s.year < 2014 ? 0.07 : 0.12),
    choice: (s, ctx) => {
      const vape = s.year >= 2015, thing = vape ? "a vape" : "a cigarette";
      return {
        prompt: `Behind the ${vape ? "gym" : "bleachers"}, a friend offered you ${thing}. Everyone's looking. What do you do?`,
        options: [
          { id: "t_smoke.no", label: "No thanks", hint: "not for you", act: "avoid", style: "health", weight: 0.45, apply: () => ({ text: `Offered ${thing} behind the ${vape ? "gym" : "bleachers"}, you said no thanks. Nobody cared as much as you feared.`, mood: 1 }) },
          { id: "t_smoke.try", label: "Try it once", hint: "just to see", act: "vice", style: "risk", weight: 0.3, apply: () => ({ text: `Offered ${thing}, you tried it once, coughed until you cried, and decided once was plenty.`, mood: -1 }) },
          { id: "t_smoke.start", label: "Start, like your friends", hint: "it's what everyone does", act: "vice", style: "self", weight: 0.15, apply: s2 => { s2.health.smoke = true; s2.health.hr *= 1.03; return { text: `Offered ${thing}, you took it, and then another, and by summer you had a habit. Quitting would be a story for later.`, mood: 0 }; } },
          { id: "t_smoke.pretend", label: "Pretend, and don't inhale", hint: "fake it", act: "socialize", style: "social", weight: 0.05, apply: () => ({ text: `Offered ${thing}, you held it like a movie star and never inhaled. Nobody noticed, and you smelled like it anyway.`, mood: 0 }) },
          { id: "t_smoke.tell", label: "Tell your friend you're worried", hint: "a hard thing to say", act: "talk", style: "family", weight: 0.05, apply: () => ({ text: `Offered ${thing}, you told your friend you were worried about them. They rolled their eyes, then quit two years later and said you were the first to say it.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    // Social media for teens: MySpace (2005–2008), Facebook (open to everyone from 2006), Instagram (2010), TikTok (2018).
    id: "t_online", once: true, ages: [13, 17], when: s => atHome(s) && s.year >= 2005, p: () => 0.25,
    choice: (s, ctx) => {
      const app = s.year < 2009 ? "MySpace" : s.year < 2013 ? "Facebook" : s.year < 2019 ? "Instagram" : "TikTok";
      return {
        prompt: `Everyone at school is on ${app}, and you just made an account. How do you use it?`,
        options: [
          { id: "t_online.post", label: "Post everything", hint: "every lunch, every mood", act: "socialize", style: "social", weight: 0.3, apply: () => ({ text: app === "MySpace" ? "You made a MySpace page with a song that autoplayed and agonized over your Top 8 like it was a treaty." : `You posted everything on ${app}, and refreshed for likes until your thumb hurt.`, mood: 2 }) },
          { id: "t_online.private", label: "Keep it private, close friends only", hint: "your own little world", act: "avoid", style: "safe", weight: 0.25, apply: () => ({ text: `You kept your ${app} account private, close friends only, and it was mostly inside jokes and pictures of your dog.`, mood: 2 }) },
          { id: "t_online.create", label: "Make things for it", hint: "videos, art, music", act: "hobby", style: "learn", weight: 0.2, apply: (s2, c) => (c.rng() < 0.2 ? { text: `You started making ${s2.year >= 2019 ? "videos" : "art"} for ${app}, and one of them went viral at your school, then a little beyond.`, mood: 6 } : { text: `You started making ${s2.year >= 2019 ? "videos" : "art"} for ${app}, and a few strangers liked them, which felt amazing.`, mood: 3 }) },
          { id: "t_online.delete", label: "Delete it after a month", hint: "too much drama", act: "quitHabit", style: "health", weight: 0.1, apply: () => ({ text: `You deleted ${app} after a month of drama and felt ten pounds lighter.`, mood: 2 }) },
          { id: "t_online.lurk", label: "Just scroll", hint: "watch, don't post", act: "rest", style: "self", weight: 0.15, apply: () => ({ text: `You mostly just scrolled ${app} late at night, comparing yourself to everyone. Some nights it was fun, and some nights it wasn't.`, mood: -1 }) },
        ],
      };
    },
  },
  {
    id: "t_hooked", once: true, ages: [13, 16], when: atHome, p: () => 0.08,
    choice: (s, ctx) => {
      const thing = s.year < 1980 ? "the pinball machine at the arcade" : s.year < 1995 ? "the Nintendo" : s.year < 2005 ? "the computer and its games" : s.year < 2015 ? "World of Warcraft" : "Fortnite";
      const who = grownUp(s, ctx);
      return {
        prompt: `You've been on ${thing} every waking hour, and your grades are slipping. ${who} noticed. What do you do?`,
        options: [
          { id: "t_hooked.limit", label: "Set your own limit", hint: "homework first", act: "quitHabit", style: "safe", weight: 0.3, apply: () => ({ text: `Hooked on ${thing}, you set your own rule: homework first. You broke it twice, then kept it.`, mood: 1 }) },
          { id: "t_hooked.more", label: "Keep playing", hint: "you're so close to the next level", act: "vice", style: "risk", weight: 0.2, apply: () => ({ text: `Hooked on ${thing}, you kept playing until ${who} took it away for a month. You read three books that month out of pure boredom.`, mood: -2 }) },
          { id: "t_hooked.compete", label: "Get serious and compete", hint: "if you're going to do it, do it", act: "pushThrough", style: "learn", weight: 0.15, apply: () => ({ text: `Hooked on ${thing}, you decided to get really good, and placed in a local tournament. ${who} came to watch, mystified and proud.`, mood: 4 }) },
          { id: "t_hooked.outside", label: "Go outside instead", hint: "the sun is still there", act: "exercise", style: "health", weight: 0.2, apply: () => ({ text: `Hooked on ${thing}, you forced yourself outside and rediscovered your bike. You still played, just less.`, mood: 2 }) },
          { id: "t_hooked.deal", label: `Make a deal with ${who}`, hint: "grades for game time", act: "negotiate", style: "social", weight: 0.15, apply: () => ({ text: `Hooked on ${thing}, you made a deal with ${who}: game time for every B. Your grades went up, mysteriously.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "t_paycheck", domain: "wealth", channel: "change", once: true, ages: [15, 19], when: s => atHome(s) && s.flags.parttime, p: () => 0.5,
    choice: (s, ctx) => {
      const money = homeMoney(s, ctx) === "tight", music = musicOf(s.year);
      return {
        prompt: `Your first real paycheck from ${s.flags.parttime} is in your hand. What do you do with it?`,
        options: [
          { id: "t_paycheck.save", label: "Save it for college", hint: "boring and smart", act: "save", style: "safe", weight: 0.3, apply: () => ({ text: "You put your first paycheck in a savings account for college, and checked the balance at the bank like it was a scoreboard.", mood: 2 }) },
          { id: "t_paycheck.car", label: "Put it toward a car", hint: "freedom has a price", act: "save", style: "learn", weight: 0.2, apply: () => ({ text: "You put your first paycheck into a coffee can labeled CAR, and kept feeding it all year.", mood: 2 }) },
          { id: "t_paycheck.spend", label: "Spend it on music and clothes", hint: "you earned it", act: "rest", style: "self", weight: 0.25, apply: () => ({ text: `You spent your first paycheck on music and clothes, and it was gone in a weekend, and it was a great weekend.`, mood: 4 }) },
          { id: "t_paycheck.family", label: money ? "Give some to help at home" : "Take your family out to dinner", hint: "pay it back", act: "care", style: "family", weight: money ? 0.2 : 0.15, apply: () => ({ text: money ? "You gave part of your first paycheck to help with the bills at home. Your mother tried to refuse, then hugged you for a long time." : "You took your family out to dinner with your first paycheck, and your father let you pay, which meant something.", mood: 4 }) },
          { id: "t_paycheck.invest", label: "Buy a few shares of stock", hint: "start early", act: "invest", style: "risk", weight: 0.1, apply: () => ({ text: "You bought a few shares of stock with your first paycheck, and followed the price in the newspaper every morning, very seriously.", mood: 3 }) },
        ],
      };
    },
  },
  {
    id: "t_looks", once: true, ages: [13, 15], when: atHome, p: () => 0.12,
    choice: (s, ctx) => {
      const worry = ctx.rng.pick(["your acne", "your braces", "your height", "your hair", "your glasses"]);
      return {
        prompt: `You're convinced everyone is staring at ${worry}. Picture day is next week. What do you do?`,
        options: [
          { id: "t_looks.makeover", label: "A whole new look", hint: "new clothes, new hair", act: "hobby", style: "risk", weight: 0.25, apply: () => ({ text: `Worried about ${worry}, you went for a whole new look before picture day: ${fashionOf(s.year)}. The photo is now a family favorite, for reasons.`, mood: 2 }) },
          { id: "t_looks.own", label: "Own it", hint: "smile big", act: "insist", style: "self", weight: 0.25, apply: () => ({ text: `Worried about ${worry}, you decided to own it and smiled your biggest smile on picture day. It's the one photo of you from then that you like.`, mood: 3 }) },
          { id: "t_looks.ask", label: "Ask someone for help", hint: "a cousin, a friend", act: "seekHelp", style: "social", weight: 0.2, apply: () => ({ text: `Worried about ${worry}, you asked an older cousin for help, who taught you a few tricks and told you nobody was looking as hard as you thought.`, mood: 2 }) },
          { id: "t_looks.doctor", label: worry === "your acne" ? "See a dermatologist" : "Ask about fixing it", hint: "a real fix", act: "seeDoctor", style: "health", weight: 0.15, apply: () => ({ text: `Worried about ${worry}, you saw a doctor about it. It got better slowly, and you got better about it faster.`, mood: 2 }) },
          { id: "t_looks.hide", label: "Skip picture day", hint: "stay home sick", act: "avoid", style: "safe", weight: 0.15, apply: () => ({ text: `Worried about ${worry}, you stayed home on picture day. The yearbook has a gray silhouette where you should be, and you wish it didn't.`, mood: -1 }) },
        ],
      };
    },
  },
  {
    id: "t_ap", domain: "study", channel: "good", once: true, ages: [15, 16], when: hs, p: () => 0.25,
    choice: (s, ctx) => {
      const hard = s.year >= 1975 ? "AP classes" : "the honors track";
      return {
        prompt: `Your counselor wants to put you in ${hard} next year. It means a lot more homework. Do you take it?`,
        options: [
          { id: "t_ap.all", label: `Load up on ${hard}`, hint: "go all in", act: "study", style: "learn", weight: 0.25, apply: (s2, c) => { s2.flags.honors = true; return { text: c.roll("study", "good", 0.5) ? `You loaded up on ${hard} and thrived, and a teacher wrote you the kind of recommendation letter people frame.` : `You loaded up on ${hard} and spent the year exhausted, but you learned you could do hard things.`, mood: 2 }; } },
          { id: "t_ap.one", label: "Take one, in your best subject", hint: "a smart balance", act: "study", style: "safe", weight: 0.3, apply: s2 => { s2.flags.honors = true; return { text: `You took one class from ${hard}, in your best subject, and loved it.`, mood: 3 }; } },
          { id: "t_ap.no", label: "Stay in regular classes", hint: "room to breathe", act: "wait", style: "self", weight: 0.25, apply: () => ({ text: "You stayed in regular classes and had time for a job, a sport and friends. It was a good year.", mood: 2 }) },
          { id: "t_ap.voc", label: "Take shop or vo-tech classes", hint: "learn a trade early", act: "careerSwitch", style: "safe", weight: 0.12, apply: s2 => { s2.flags.vocational = true; return { text: "You took shop and vo-tech classes instead, and rebuilt a small engine that actually ran. You liked knowing how things work.", mood: 3 }; } },
          { id: "t_ap.ask", label: "Ask your parents what to do", hint: "they'll have opinions", act: "seekHelp", style: "family", weight: 0.08, apply: () => ({ text: `You asked your parents about ${hard}, and they had very different opinions, so you split the difference and took one.`, mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "t_familyMoney", domain: "family", channel: "bad", once: true, ages: [13, 17], when: (s, ctx) => atHome(s) && homeMoney(s, ctx) === "tight", p: () => 0.15,
    choice: (s, ctx) => {
      const why = ctx.rng.pick([s.father.alive ? "Dad lost his job at the plant" : "Mom's hours got cut", "the car broke down and the repair bill is huge", "the rent went up again"]);
      return {
        prompt: `Things are hard at home: ${why}. You hear your parents at the kitchen table at night. What do you do?`,
        options: [
          { id: "t_familyMoney.work", label: "Get a job and help out", hint: "more shifts", act: "sideJob", style: "family", weight: 0.35, apply: () => ({ text: `When ${why}, you picked up more shifts and put money in the envelope on the fridge without saying anything. Nobody said anything either, and everyone knew.`, mood: 0 }) },
          { id: "t_familyMoney.cut", label: "Stop asking for anything", hint: "make it easier", act: "save", style: "safe", weight: 0.25, apply: () => ({ text: `When ${why}, you stopped asking for anything: no new shoes, no field-trip money. You learned to stretch a dollar for life.`, mood: -1 }) },
          { id: "t_familyMoney.talk", label: "Ask your parents how you can help", hint: "be part of it", act: "talk", style: "social", weight: 0.2, apply: () => ({ text: `When ${why}, you asked your parents straight out how you could help. They told you the truth, and it made you closer.`, mood: 1 }) },
          { id: "t_familyMoney.school", label: "Focus on school, for later", hint: "the long game", act: "study", style: "learn", weight: 0.12, apply: () => ({ text: `When ${why}, you promised yourself you'd study your way to something steadier, and you hit the books harder than ever.`, mood: 0 }) },
          { id: "t_familyMoney.hide", label: "Pretend everything's fine at school", hint: "nobody needs to know", act: "avoid", style: "self", weight: 0.08, apply: () => ({ text: `When ${why}, you made sure nobody at school knew. It was exhausting being two people.`, mood: -2 }) },
        ],
      };
    },
  },

  // ---------- the everyday of being a teenager ----------
  A("t_braces", [12, 14], 0.1, s => [`You got braces, {with rubber bands in your school colors.|and couldn't eat corn on the cob for two years.|and the orthodontist's office had a prize box you were too old for, and used anyway.}`, `Braces: {a mouthful of metal|${s.year >= 2005 ? "clear aligners you kept losing" : "headgear at night, which nobody could ever see, ever"}}, and {a lot of smiling with your mouth closed.|a smile that, when they came off, made it worth it.}`, "You got your braces off right before {high school|summer}, and ran your tongue over your teeth for a week."], { when: atHome, mood: 0 }),
  A("t_phone", [13, 17], 0.08, s => (s.year < 1985 ? ["You got your own phone extension in your bedroom, {a pink Princess phone,|a see-through phone that lit up,} and the cord stretched under the door.", "You fought your siblings for the phone every night, and finally got a two-minute timer installed by your father."] : s.year < 2000 ? ["You got a pager, {and learned the codes: 143 meant I love you.|and felt like a doctor.}", "You got your own phone line for your birthday, and kept it busy every night until your parents got call-waiting."] : s.year < 2010 ? ["You got your first cell phone, a flip phone, {and texted with T9 until your thumb ached.|and went over the text limit the first month, and your parents saw the bill.|and picked a ringtone that made your whole class groan.}", "You got a flip phone for emergencies, which turned out to mean every evening."] : ["You got your first smartphone, and {it lived in your hand from then on.|your parents put an app on it to find you.|you set up a group chat with your friends that ran for years.}", "You got a phone of your own, with rules: {no phones at dinner|on the kitchen counter at ten}, which you followed mostly."]), { when: atHome, mood: 3 }),
  A("t_mall", [13, 16], 0.06, s => [`On Saturdays you hung out at the mall, {at the food court with an Orange Julius,|trying on clothes you couldn't afford,|in the arcade until your quarters ran out,} and {it was the whole world.|security asked you to keep moving, twice.}`, "You and your friends spent a whole summer at the mall, {throwing pennies in the fountain|riding the escalators|at the record store}, and never bought anything.", "The mall on Friday nights: {a movie, a pretzel, and a lot of walking in circles.|you saw your crush by the Sbarro and pretended not to.}"], { when: s => atHome(s) && s.year >= 1965 && s.year <= 2008, mood: 3 }),
  A("t_cruising", [16, 18], 0.08, s => [`On Friday nights you cruised Main Street with your friends, {windows down, radio up,|honking at people you knew,} and {ended up at the drive-in.|got a burger at the drive-in where the waitresses wore roller skates.}`, "You and your friends spent summer nights driving around with nowhere to go, {and it was the best part of being sixteen.|the gas gauge always on empty.}", `You took ${s.flags.firstCar ? s.flags.firstCar.name : "the car"} out to the lake road and drove with the headlights off for a second, just to say you did.`], { when: s => atHome(s) && s.flags.license !== undefined && s.year < 1990, mood: 3 }),
  A("t_mixtape", [13, 17], 0.05, s => (s.year < 1980 ? ["You listened to the top 40 countdown every Sunday and wrote the songs down in a notebook.", "You saved up for a new album and played it until the grooves wore smooth."] : s.year < 2000 ? ["You made a mixtape for your crush, {timing the songs to the second,|recording songs off the radio and cursing every DJ who talked over the intro,} and labeled it in your neatest handwriting.", "You and your friends traded mixtapes like currency, and you still have a shoebox of them."] : s.year < 2012 ? ["You burned a mix CD for your crush, {with the track list written in Sharpie.|and agonized for a week about song number seven.}", s.year >= 2002 ? "You filled your iPod with every song you could find, and made a playlist for every mood you had, which was a lot." : "You downloaded songs one at a time over dial-up, a whole night per album, and burned them onto CDs for everyone."] : ["You made a playlist for your crush and sent it without saying anything, and the playlist said it all.", "You had a playlist for every mood, and your friends knew exactly how you felt by what you shared."]), { when: atHome, mood: 3 }),
  A("t_away", [13, 17], 0.08, ["You spent hours on AIM after school, {crafting the perfect away message with song lyrics.|waiting for your crush's screen name to pop up.|and the door-opening sound still lives in your head.}", "Your AIM away message was a quote from {a song|a movie} you thought was deep. It was, at fifteen.", "You and your friends talked on AIM every night, and your screen name was something you would never say out loud now."], { when: s => atHome(s) && s.year >= 1997 && s.year <= 2008, mood: 2 }),
  A("t_show", [13, 17], 0.05, s => [`You never missed an episode of ${teenShow(s.year)}, {and argued about it at lunch the next day.|and taped it when you couldn't watch.|and had a poster of the cast in your locker.}`, `${teenShow(s.year)} was your show, {and you and your best friend watched it together every week.|and you still know the theme song.}`, `You were obsessed with ${teenShow(s.year)} and {wrote fan letters you never sent.|quoted it until your family begged you to stop.}`], { when: atHome, mood: 2 }),
  A("t_firstKiss", [14, 17], 0.07, ["Your first kiss was {at a party during spin the bottle|on a porch after a dance|behind the gym after the football game|at the movies, during the boring part}, {and you both bumped noses.|and you walked home without touching the ground.|and you told exactly one person, who told everyone.}", "You had your first kiss {at summer camp, on the last night|on the Ferris wheel at the county fair}, and you wrote about it in your journal in code.", "Your first kiss was quick and terrifying and you replayed it in your head for about a month."], { when: atHome, mood: 4 }),
  {
    id: "t_faith", once: true, ages: [13, 17], when: atHome, p: () => 0.05,
    apply: (s, ctx) => {
      const f = faithOf(s, ctx);
      const lines = {
        christian: ["You went to youth group on Wednesday nights, {mostly for the pizza and the cute kid from the next school.|and the youth pastor played guitar and actually listened.}", "You were confirmed at church in a white robe, {and your grandmother cried.|and wondered if you believed it, and decided you mostly did.}"],
        jewish: ["You had your bar or bat mitzvah, read from the Torah with your voice shaking, and danced the hora at a party with a DJ and a chocolate fountain.", "You studied for your bat or bar mitzvah for a year with a cantor who was very patient, and pulled it off."],
        muslim: ["You fasted the whole month of Ramadan for the first time, and broke the fast every evening with your family and a houseful of guests.", "You started going to the mosque youth group, where you could be fully yourself with people who understood."],
        hindu: ["You danced at the Diwali celebration at the community center, with an auntie fixing your outfit at the last second.", "Your family took you to the temple more often that year, and you started asking the priest real questions."],
        none: ["You started reading about the world's religions on your own, at the library, and asked your parents what they believed. The conversation lasted until midnight.", "You went to church with a friend's family once and found it interesting and strange, and talked about it with your dad on the drive home."],
      }[f];
      return { text: ctx.w(lines), mood: 2 };
    },
  },
  {
    id: "t_bigNight", ages: [14, 18], max: 2, cooldown: 1, when: s => hs(s) && ["sports", "band", "theater", "debate", "paper"].includes(s.flags.club), p: () => 0.12,
    apply: (s, ctx) => {
      const c = s.flags.club, sport = s.flags.sport || "football";
      const lines = {
        sports: [`Your ${sport} team made it to the state playoffs, and {you played the game of your life.|the whole town drove two hours to watch.|you lost in overtime and cried in the locker room, all of you, together.}`, `At the homecoming ${sport === "football" ? "game" : "match"} you {scored in the final minute|made the play everyone talked about on Monday}, and {your name was in the local paper.|your parents stood on the bleachers yelling.}`],
        band: ["The band marched in the Thanksgiving parade, {and your hands froze to your instrument.|and you saw your family wave from the curb.}", "At the state band competition your section nailed the hard part, and the director, who never smiled, smiled."],
        theater: ["On opening night of the spring musical, {you forgot a line and the whole cast saved you.|the curtain stuck halfway and you sang anyway.|you got a standing ovation from a gym full of parents.}", "The school play sold out both nights, and the cast party went until two in the morning at somebody's house."],
        debate: ["Your debate team went to the state tournament, and you won a round arguing a side you didn't believe, which unsettled you.", "You won a trophy at a debate tournament three towns over, and argued the whole bus ride home."],
        paper: ["Your article for the school paper got the cafeteria to change its menu, and you felt the power of the press.", "You stayed up until midnight laying out the school paper, and saw your byline on the front page."],
      }[c];
      return { text: ctx.w(lines), mood: 5 };
    },
  },
  A("t_hair", [13, 17], 0.04, s => [s.year < 1980 ? "You tried to iron your hair straight on the ironing board, and it worked, mostly." : s.year < 1995 ? "You got a perm at the salon and came out looking like a poodle, and loved it for about a week." : s.year < 2010 ? "You bleached the tips of your hair and they came out orange." : "You dyed your hair a color your school dress code did not anticipate.", `You spent a whole summer in ${fashionOf(s.year)}, {and every photo from that year proves it.|and thought you looked incredible, and you were right, sort of.}`, "You cut your own bangs the night before school pictures, a family tradition at this point."], { when: atHome, mood: 1 }),
  A("t_careerTest", [15, 17], 0.07, ["The career aptitude test at school said you should be a {forest ranger|funeral director|dental hygienist|military strategist|florist}, and you laughed, then wondered.", "Career day: a firefighter, a dentist, a lawyer and somebody's dad who sold insurance, and {you were most interested in the firefighter's stories.|you asked the lawyer a lot of questions.}", "Your guidance counselor asked what you wanted to do with your life, and you said “something,” which was honest."], { when: hs, mood: 1 }),
  A("t_cook", [13, 17], 0.035, s => [`You learned to cook ${s.flags.parentsSplit ? "because somebody had to" : "from your grandmother"}, {starting with spaghetti and ending with a perfect pie crust.|and could make a decent dinner for six by sixteen.}`, "You tried to make dinner for the family and {set off the smoke alarm twice.|made a lasagna that everyone politely finished.|discovered that you actually liked it.}", "You baked cookies for {a bake sale|your crush|the whole team}, and they were a little burned, and they were gone in minutes."], { when: atHome, mood: 2 }),
  A("t_injury", [13, 18], 0.035, s => [`You ${s.flags.club === "sports" ? `sprained your ankle at ${s.flags.sport || "practice"}` : "sprained your ankle on the stairs"} and spent six weeks on crutches, {getting very good at the elevator.|with friends carrying your books.}`, "You broke your wrist {skateboarding|falling off a trampoline|in a pickup game} and got the cast signed by everyone, including a teacher who wrote something embarrassing.", "You tore something in your knee and did physical therapy all summer, {and came back stronger.|and learned patience, unwillingly.}"], { when: atHome, mood: -2 }),
  A("t_mono", [15, 18], 0.02, ["You got mono and missed three weeks of school, {sleeping eighteen hours a day.|and everybody asked who you'd been kissing.}", "You came down with mono during finals, {and took your exams late, in the counselor's office.|and watched every show you had ever wanted to see.}"], { when: hs, mood: -2 }),
  A("t_homecoming", [14, 17], 0.07, s => ["At homecoming you {built a float on a flatbed trailer with your class,|painted your face in school colors,|screamed yourself hoarse at the bonfire,} and {it was the best week of fall.|you felt like you belonged somewhere.}", "You went to the homecoming dance {with a big group and a corsage that wilted by ten.|and danced until your feet hurt.}", `Homecoming week: {pajama day, crazy hair day, and a pep rally that shook the bleachers.|your class won the hallway-decorating contest.} ${s.age >= 17 ? "{You got nominated for the court and did not win, gracefully.|}" : ""}`], { when: hs, mood: 3 }),
  A("t_detention", [13, 16], 0.04, ["You got detention for {talking in class|being late four times|a note intercepted by the teacher, read aloud}, and spent an hour {copying the dictionary.|with the same five kids every time.|staring at the clock.}", "You got Saturday detention, which was exactly like the movie except nobody danced.", "You got sent to the principal's office for {a joke that landed with everyone but the teacher.|arguing a grade.} The principal had heard it all before."], { when: teenSchool, mood: -1 }),
  A("t_collegeVisit", [16, 17], 0.1, (s, ctx) => [`You and ${grownUp(s, ctx)} drove to visit a college campus, {and the tour guide walked backward the whole time.|and you ate in the dining hall and imagined a whole other life.|and you fell in love with a library.}`, `On a college visit you {sat in on a lecture and understood half.|stayed overnight in a dorm with a student host.}`, "You visited a campus and {knew immediately it wasn't for you.|got a sweatshirt from the bookstore and wore it for a year.}"], { when: s => hs(s) && s.flags.testScore !== "none", mood: 3 }),
  A("t_yearbook", [17, 18], 0.2, s => [`Everyone signed your senior yearbook: {“Stay sweet, never change.”|“H.A.G.S.”|“Remember chemistry? LOL.”|a whole page from your best friend that made you cry.} You read it every few years for the rest of your life.`, "You were voted {“Most Likely to Be Late to Their Own Wedding”|“Best Laugh”|“Most Likely to Succeed”|“Class Clown”} in the senior superlatives.", "You got your senior yearbook and {found your face in the background of nine photos.|signed a hundred others “Have a great summer!”}"], { when: hs, mood: 3 }),
  A("t_gradParty", [18, 18], 0.2, (s, ctx) => [`Your family threw you a graduation party {in the backyard with a tent and a sheet cake with your face on it.|at the VFW hall with a buffet.} {Your aunts gave you cards with checks inside.|Your grandparents drove nine hours to be there.}`, "Your graduation party was in the garage, decorated in school colors, and the whole neighborhood came.", `At your graduation party ${grownUp(s, ctx)} made a speech and couldn't finish it.`], { when: s => !s.studying || s.done.has("senior"), mood: 4 }),
  A("t_springBreak", [17, 18], 0.06, s => [`Senior spring break you {drove to the beach with three friends in one car,|went to ${inStates(s, ["TX", "LA", "OK"]) ? "South Padre" : "Daytona"},} and {got the worst sunburn of your life.|stayed in a motel with seven people in one room.}`, "On spring break you {went camping with friends|took a road trip to see a college|stayed home and worked}, and it was its own kind of adventure."], { when: hs, mood: 3 }),
  A("t_snowShovel", [13, 17], 0.05, ["After the big snowstorm you shoveled half the driveways on your street {for twenty bucks each|and made more than at your real job}.", "School was canceled for snow, and {you went sledding with your friends like you were ten again.|you slept until noon and then built the biggest snowman in the neighborhood.}"], { when: s => teenSchool(s) && snowy(s), mood: 3 }),
  A("t_grandStory", [13, 18], 0.035, ["Your grandfather told you a story about {the war|the Depression|the farm he grew up on} that he had never told anyone, and you wrote it down that night.", "You spent an afternoon with your grandmother looking through old photos, and she told you who everyone was, and you saw her young.", "You interviewed your grandparents for a school project, and they talked for three hours, and you got an A and something better."], { when: atHome, mood: 3 }),
  A("t_learnDrive", [16, 18], 0.05, s => [`You drove ${s.flags.firstCar ? s.flags.firstCar.name : "the car"} on the highway alone for the first time, {gripping the wheel at ten and two.|singing at the top of your lungs.}`, "You took your friends on your first road trip without parents, {got lost twice, and it was perfect.|and called home from a pay phone to say you were fine.}"], { when: s => atHome(s) && s.flags.license !== undefined, mood: 3 }),
  A("t_letter", [17, 18], 0.05, ["Your English teacher had everyone write a letter to their future self, sealed it in an envelope, and promised to mail it in ten years. She did.", "You wrote yourself a letter about who you wanted to be, folded it into your yearbook, and found it years later."], { when: hs, mood: 2 }),
  // ---------- more of the teen years ----------
  {
    id: "t_garageBand", once: true, ages: [14, 17], when: atHome, p: () => 0.1,
    choice: (s, ctx) => {
      const genre = s.year < 1968 ? "surf rock" : s.year < 1978 ? "rock" : s.year < 1988 ? "punk" : s.year < 1998 ? "grunge" : s.year < 2010 ? "pop-punk" : "indie";
      return {
        prompt: `You and two friends started a ${genre} band in somebody's garage. You have one song, almost. What now?`,
        options: [
          { id: "t_garageBand.gig", label: "Play the talent show", hint: "your first audience", act: "hobby", style: "risk", weight: 0.3, apply: (s2, c) => (c.rng() < 0.5 ? { text: `Your ${genre} band played the school talent show, and the gym went louder than you ever imagined. You were famous for a week.`, mood: 6, big: true } : { text: `Your ${genre} band played the talent show, and the amp blew a fuse in the second verse. You finished acoustic, and people cheered harder.`, mood: 4 }) },
          { id: "t_garageBand.name", label: "Spend a month picking the name", hint: "priorities", act: "hobby", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`Your ${genre} band spent a month arguing about the name and settled on {“The Lawn Darts.”|“Static Fridays.”|“No Refunds.”|“The Substitute Teachers.”} You played two songs, ever, and loved every minute.`), mood: 3 }) },
          { id: "t_garageBand.practice", label: "Practice every day", hint: "get actually good", act: "study", style: "learn", weight: 0.2, apply: () => ({ text: `Your ${genre} band practiced every afternoon until you were actually good, and played a backyard party where people danced.`, mood: 5 }) },
          { id: "t_garageBand.neighbors", label: "Play loud, whatever the neighbors say", hint: "art needs volume", act: "insist", style: "risk", weight: 0.15, apply: () => ({ text: `Your ${genre} band played so loud that a neighbor called the police, who listened to one song and said you weren't bad.`, mood: 4 }) },
          { id: "t_garageBand.quit", label: "Quit when it stops being fun", hint: "no hard feelings", act: "quitHabit", style: "safe", weight: 0.15, apply: () => ({ text: `Your ${genre} band broke up over “creative differences” after three practices. You're all still friends, and still argue about the name.`, mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "t_exchange", rare: true, once: true, ages: [15, 17], when: hs, p: () => 0.08,
    choice: (s, ctx) => {
      const land = ctx.rng.pick(["Germany", "Japan", "Brazil", "France", "Spain", "Sweden", "Argentina"]);
      return {
        prompt: `Your school has an exchange program: a student from ${land} could live with your family, or you could spend a semester there. What do you do?`,
        options: [
          { id: "t_exchange.host", label: `Host a student from ${land}`, hint: "a new sibling for a year", act: "care", style: "family", weight: 0.35, apply: () => ({ text: `Your family hosted an exchange student from ${land}, who learned about Thanksgiving and taught you to cook something amazing. You still visit each other.`, mood: 5 }) },
          { id: "t_exchange.go", label: `Spend a semester in ${land}`, hint: "a long way from home", act: "studyAbroad", style: "risk", weight: 0.2, apply: () => ({ text: `You spent a semester in ${land} with a host family, homesick for two weeks and then completely at home. You came back a slightly different person.`, mood: 6, big: true }) },
          { id: "t_exchange.penpal", label: `Get a pen pal in ${land} instead`, hint: "letters across the ocean", act: "talk", style: "social", weight: 0.2, apply: () => ({ text: `You got a pen pal in ${land} through the program, and wrote back and forth for years.`, mood: 3 }) },
          { id: "t_exchange.learn", label: "Study the language harder", hint: "maybe next year", act: "study", style: "learn", weight: 0.15, apply: () => ({ text: `You didn't go to ${land}, but you studied the language every day that year, and someday you would.`, mood: 2 }) },
          { id: "t_exchange.no", label: "Pass", hint: "home is fine", act: "wait", style: "safe", weight: 0.1, apply: () => ({ text: `You passed on the exchange to ${land}, and wondered sometimes how that other year would have gone.`, mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "t_tattoo", once: true, ages: [18, 19], when: s => atHome(s) && s.year >= 1975, p: () => 0.2,
    choice: (s, ctx) => {
      const f = bestFriend(s);
      return {
        prompt: `You just turned ${s.age}, and ${f ? f.call : "your best friend"} wants to get matching tattoos to celebrate. Do you?`,
        options: [
          { id: "t_tattoo.match", label: "Matching tattoos", hint: "forever is a long time", act: "insist", style: "risk", weight: 0.25, apply: (s2, c) => ({ text: c.w(`For your ${s.age}th birthday you and ${f ? f.call : "your best friend"} got matching tattoos of {a tiny star|a wave|an inside joke nobody else understands} on your ankles. You never regretted it, mostly.`), mood: 4 }) },
          { id: "t_tattoo.own", label: "Get your own design", hint: "something that's yours", act: "hobby", style: "self", weight: 0.15, apply: () => ({ text: `For your ${s.age}th birthday you got a small tattoo of your own design, somewhere your grandmother would never see.`, mood: 3 }) },
          { id: "t_tattoo.piercing", label: "A piercing instead", hint: "less permanent", act: "hobby", style: "safe", weight: 0.15, apply: () => ({ text: `For your ${s.age}th birthday you got a piercing instead of a tattoo, the compromise that kept the peace at home.`, mood: 2 }) },
          { id: "t_tattoo.wait", label: "Wait and think about it", hint: "a year to be sure", act: "wait", style: "safe", weight: 0.3, apply: () => ({ text: "You said you'd think about the tattoo for a year. You're still thinking.", mood: 0 }) },
          { id: "t_tattoo.ask", label: "Ask your parents first", hint: "even though you don't have to", act: "talk", style: "family", weight: 0.15, apply: () => ({ text: "You asked your parents about the tattoo even though you didn't have to. Your mom showed you hers, which you had never known about.", mood: 3 }) },
        ],
      };
    },
  },
  {
    id: "t_bystander", once: true, ages: [13, 17], when: teenSchool, p: () => 0.08,
    choice: (s, ctx) => {
      const k = ctx.person({ role: "friend", sex: ctx.rng() < 0.5 ? "male" : "female", birthYear: s.birthYear, how: "school" });
      return {
        prompt: `A group of kids keeps picking on ${k.call}, a quiet kid in your grade. Today it happened right in front of you. What do you do?`,
        options: [
          { id: "t_bystander.step", label: "Step in", hint: "“Leave them alone.”", act: "insist", style: "risk", weight: 0.25, apply: () => ({ text: `When kids picked on ${k.call} in front of you, you stepped in and said, “Leave ${them(k)} alone.” They did. ${k.call} said thanks so quietly you almost missed it.`, mood: 4 }) },
          { id: "t_bystander.after", label: "Check on them afterward", hint: "quietly", act: "care", style: "family", weight: 0.25, apply: s2 => { s2.friends.push(k); return { text: `After kids picked on ${k.call}, you sat with ${them(k)} at lunch. You became friends, real ones.`, mood: 4 }; } },
          { id: "t_bystander.tell", label: "Tell a teacher", hint: "make it stop for good", act: "seekHelp", style: "social", weight: 0.2, apply: () => ({ text: `You told a teacher about the kids picking on ${k.call}, and the school stepped in. Nobody knew it was you, which was fine.`, mood: 2 }) },
          { id: "t_bystander.nothing", label: "Look away", hint: "not your fight", act: "avoid", style: "self", weight: 0.2, apply: () => ({ text: `When kids picked on ${k.call}, you looked away. You thought about it for years, and you never looked away again.`, mood: -3 }) },
          { id: "t_bystander.friends", label: "Get your friends to back them up", hint: "safety in numbers", act: "socialize", style: "social", weight: 0.1, apply: s2 => { s2.friends.push(k); return { text: `You got your friends to start walking with ${k.call} between classes, and the picking-on stopped. ${k.call} became one of you.`, mood: 4 }; } },
        ],
      };
    },
  },
  A("t_firstVote", [18, 19], 0.25, ["You voted for the first time, {in a church basement with a curtain booth,|at the elementary school gym where you used to have recess,} and wore the “I Voted” sticker all day.", "You registered to vote at 18 and {went with your parents to the polling place,|mailed in your first ballot,} feeling very grown up.", "Your first vote: {a long line, a short ballot, and a strange pride.|you read every word on the ballot, including the judges.}"], { when: s => atHome(s) && s.year >= 1972 && s.year % 2 === 0, mood: 2 }),
  A("t_thanksgiving", [14, 18], 0.04, ["At Thanksgiving every relative asked about your plans for after high school, and you said “figuring it out” eleven times.", "At Thanksgiving you were finally moved from the kids' table to the grown-ups' table, and immediately missed the kids' table.", "At Thanksgiving your uncle {fell asleep during the football game|burned the turkey on the deep fryer|told the same story he tells every year}, and you realized you would miss all of this someday."], { when: atHome, mood: 2 }),
  {
    id: "t_friendMoves", domain: "family", channel: "bad", tags: ["friends"], once: true, ages: [13, 17], when: s => atHome(s) && !!bestFriend(s), p: () => 0.03,
    apply: (s, ctx) => {
      const f = bestFriend(s), how = s.year < 1995 ? "wrote letters every week for a year, then every month" : s.year < 2010 ? "talked on the phone every Sunday and instant-messaged every night" : "video-called every night";
      return { text: ctx.w(`${f.call}, your best friend, moved away {across the country|to another state|when ${their(f)} dad got transferred}. {You stood in the driveway as the moving truck pulled out.|You traded friendship bracelets the last night.} You ${how}, and stayed friends.`), mood: -4 };
    },
  },
  A("t_eagle", [15, 18], 0.2, s => [`You earned your ${s.sex === "female" && s.year < 2019 ? "Gold Award" : "Eagle Scout rank"} with a service project {building benches for the park|restoring a trail|collecting a thousand books for the library}, and your parents framed the certificate.`, `At your ${s.sex === "female" && s.year < 2019 ? "Gold Award" : "Eagle Scout"} ceremony, your scoutmaster told a story about you that you had forgotten, and you had to look at the ceiling.`], { when: s => atHome(s) && s.flags.talent === "scouts", mood: 5 }),
  A("t_driveIn", [15, 18], 0.06, ["You went to the drive-in movie {with four friends hiding in the trunk to skip the ticket,|on a date, and saw none of the movie,} with the speaker hooked on the window.", "Summer nights at the drive-in: {a double feature, a carload of friends and a bucket of popcorn.|a horror movie, the windows fogging up from screaming.}"], { when: s => atHome(s) && s.year < 1990, mood: 3 }),
];
