// Everyday health at every age: chickenpox and tonsils, a sick day home from school, lice notes, glasses and braces,
// allergies, acne, a first cigarette (and, years later, quitting), a first coffee habit, the gym phase and the diet of
// the decade, a 5K, sleep, drinking, back pain, a blood pressure warning, reading glasses, the dentist, flu shots and
// COVID boosters, and the system around all of it: insurance, a surprise medical bill, COBRA, the ACA marketplace,
// therapy. Nothing grave: serious illness, chronic disease and death are core.js's (this file only reads
// s.health.chronic to tell how someone lives with it).
//
// Every probability here is an assumption (a design value; no statistic counts "you tried the grapefruit diet"),
// mostly 0.02–0.12 a year with once / max / cooldown, so a life holds a dozen or so of these stories, a handful of them
// choices. Where history matters, the timing is real and the rates follow it roughly:
//   smoking   US adults who smoke fell from about 42 % (1965) to about 12 % (2020); the chance of a first cigarette and
//             the share who take it fall with the years (SMOKE below). The Surgeon General's report and the warning
//             labels from 1964–66, nicotine gum from 1984, the patch from 1992 (over the counter 1996), a prescription
//             quit pill from 2006, the national quitline 1-800-QUIT-NOW from 2004; smoking banned on domestic flights
//             in 1990 and in most offices and restaurants through the 1990s–2000s; vaping among teens from about 2015.
//   childhood chickenpox nearly universal until the vaccine (1995); measles and mumps common until their vaccines
//             (1963, 1967); tonsillectomies far more common before the 1980s.
//   fitness   the jogging boom of the 1970s, Jazzercise and Jane Fonda's workout tape (1982), step aerobics, Tae Bo
//             (1998), Zumba, P90X (2004) and CrossFit, home bikes and apps from about 2014; step counters from 2009.
//   diets     Weight Watchers (1963), Atkins (1972, again around 2003), Scarsdale (1979), SlimFast, low-fat everything
//             in the 1990s, South Beach (2003), paleo, keto (about 2017), intermittent fasting (about 2019).
//   insurance COBRA from 1986; the ACA's dependent coverage to 26 from September 2010, the marketplace from 2014 (the
//             individual-mandate penalty until 2018); the No Surprises Act from 2022; HSAs from 2004.
//   care      colonoscopy screening from 50 (45 from 2021); the shingles vaccine from 2006 (the two-dose one 2017);
//             pharmacies giving flu shots widely from about 2009; COVID boosters from late 2021, free home tests by
//             mail in 2022. Later than about 2035 the wording stays general.
//
// The health risk changes only through hr() below, by at most ×0.97 or ×1.03 at a time, with this file's own share
// kept within ±6 % (s.flags.hHr); good and bad habits roughly balance over a population. Money amounts are small
// (years of median pay, 0.01–0.2). Nothing here marries, has a baby, buys a home, retires or changes a job.
//
// Reads: s.health (chronic, smoke, drink, stress, fitness), s.flags.glasses, club (teen.js), faith (child.js),
// served / vet (core.js), homeMoney (common.js).
// Leaves for others:
//   s.health.smoke / drink   true while the habit lasts      s.flags.smokeAt / quitSmoke   the ages it started and ended
//   s.flags.glasses          the age you got glasses         s.flags.braces   how the braces went
//   s.flags.vape             true if you took up vaping      s.flags.sober    the age you quit drinking for good
//   s.flags.insurance        "bronze" | "silver" | "medicaid" | "partner" | "none" | "cobra" | "short"
//   s.flags.therapy          the age you first saw a therapist
import { scene, cap, they, them, their, grownUp, parentWord, snackOf, stateOf } from "./common.js";
import { faithOf } from "./child.js";

// ---------- helpers ----------
function A(id, ages, p, lines, { mood = 1, fx = null, ...more } = {}) {
  return {
    id, ages, once: true, ...more, p: typeof p === "function" ? p : () => p,
    apply: (s, ctx) => {
      if (fx) fx(s, ctx);
      const l = typeof lines === "function" ? lines(s, ctx) : lines;
      return { text: ctx.w(Array.isArray(l) ? l.filter(Boolean) : l), mood: typeof mood === "function" ? mood(s) : mood };
    },
  };
}
const usHome = s => !s.abroad;
const married = s => s.rel === "married" && !!s.partner;
const kidAtHome = s => !s.abroad && s.age <= 17;
const spend = (s, x) => { s.savings = Math.max(0, s.savings - x); };
const owe = (s, x) => { s.debt = (s.debt || 0) + x; };
// The death-risk multiplier, by f (0.97–1.03), with this file's share kept within ±6 %.
function hr(s, f) {
  const before = s.flags.hHr ?? 1, after = Math.max(0.94, Math.min(1.06, before * f));
  s.flags.hHr = after; s.health.hr *= after / before;
}
const fit = (s, d) => { s.health.fitness = Math.max(0, Math.min(1, (s.health.fitness ?? 0.5) + d)); };
const stress = (s, d) => { s.health.stress = Math.max(0, Math.min(1, (s.health.stress ?? 0.3) + d)); };

// A first cigarette: the yearly chance of being offered one, and the share who take it, by year (see the top).
const SMOKE = y => (y < 1970 ? [0.12, 0.45] : y < 1985 ? [0.09, 0.38] : y < 2000 ? [0.07, 0.3] : y < 2012 ? [0.04, 0.22] : [0.02, 0.12]);
// The workout class of the decade, and how people worked out at home.
const classOf = y => (y < 1972 ? "a calisthenics class at the Y" : y < 1980 ? "a jogging club" : y < 1989 ? "Jazzercise" : y < 1997 ? "step aerobics" : y < 2004 ? "a kickboxing class" : y < 2010 ? "Zumba" : y < 2014 ? "CrossFit" : y < 2036 ? "a spin class" : "the workout class everyone swears by");
const homeWorkout = y => (y < 1982 ? "sit-ups and jumping jacks along with the morning TV exercise show" : y < 2000 ? "a workout tape in the VCR" : y < 2008 ? "a workout DVD" : y < 2036 ? "a workout app on your phone" : "the newest home workout");
// The diet everyone at work is on, by year.
const dietOf = y => (y < 1963 ? "the grapefruit diet" : y < 1972 ? "the cabbage soup diet" : y < 1979 ? "the Atkins diet" : y < 1985 ? "the Scarsdale diet" : y < 1993 ? "SlimFast shakes" : y < 2002 ? "low-fat everything" : y < 2009 ? "the South Beach diet" : y < 2017 ? "paleo" : y < 2020 ? "keto" : y < 2036 ? "intermittent fasting" : "the newest diet");
// Glasses frames by year.
const framesOf = y => (y < 1968 ? "cat-eye frames" : y < 1990 ? "big plastic frames that covered half your face" : y < 2005 ? "small wire-rimmed glasses" : "thick black frames");

export const HEALTH = [
  // ---------- childhood ----------
  A("h_chickenPox", [3, 9], s => (s.year < 1996 ? 0.2 : s.year < 2006 ? 0.04 : 0), (s, ctx) => {
    const who = grownUp(s, ctx);
    return [
      `You got the chickenpox and spent a week {in oatmeal baths|covered in pink calamine lotion}, {wearing socks on your hands so you wouldn't scratch.|missing school, which was the only good part.|and ${who} said you looked like a connect-the-dots puzzle.}`,
      "The chickenpox went through your whole class, {and then through your whole house.|and you came home with a fever and three hundred spots.} {You still have one little scar on your forehead.|You watched TV in your pajamas for a week.}",
      `${who} took you to a neighbor's house to catch the chickenpox on purpose and get it over with, {and it worked.|and you were furious about it for years.}`,
    ];
  }, { mood: -1, domain: "health", channel: "bad", when: usHome }),
  A("h_measles", [2, 10], s => (s.year < 1966 ? 0.12 : s.year < 1970 ? 0.04 : 0), (s, ctx) => {
    const who = grownUp(s, ctx);
    return [
      `You had the measles and spent a week in a dark bedroom with the shades pulled, {while ${who} brought you ginger ale and read you comic books.|and the doctor came to the house with a black bag.}`,
      "You got the mumps, {and your cheeks puffed up like a chipmunk's.|and couldn't eat anything but soup and Jell-O for a week.} {Your sister thought it was hilarious until she caught it.|You still remember the taste of the medicine.}",
      `The measles kept you home from school for ten days, {and ${who} kept the house dark to protect your eyes.|and you got so bored you memorized the wallpaper.}`,
    ];
  }, { mood: -1, domain: "health", channel: "bad", when: usHome }),
  A("h_tonsils", [3, 10], s => (s.year < 1980 ? 0.05 : 0.015), [
    "You had your tonsils out {and ate ice cream for every meal for a week.|and the nurse gave you a popsicle as soon as you woke up.|and kept them in a jar on your dresser, which horrified everyone.}",
    "After one sore throat too many, the doctor took out your tonsils, {and you got to watch TV in bed for days.|and your voice came back a little lower.}",
    "Getting your tonsils out was your first time in a hospital, {and you remember the smell, and the ice cream.|and you showed off the stitches to the whole block.}",
  ], { mood: 0, domain: "health", channel: "bad", when: usHome }),
  A("h_earTubes", [1, 4], s => (s.year >= 1970 ? 0.04 : 0), (s, ctx) => {
    const who = parentWord(s, ctx);
    return [
      `After your ninth ear infection, the doctor put tiny tubes in your ears, and ${who} {still talks about the day you heard the birds and pointed.|finally threw out the pink medicine in the fridge.}`,
      `You had ear tubes put in as a toddler, and {${who} swears you started talking the very next week.|you had to wear earplugs at the pool for two summers.}`,
      "Ear infection after ear infection ended with a little operation for ear tubes, {and the nights got quiet again.|which you don't remember and your parents will never forget.}",
    ];
  }, { mood: 0, domain: "health", channel: "bad", when: usHome }),
  A("h_lice", [5, 11], 0.04, (s, ctx) => {
    const who = grownUp(s, ctx);
    return [
      `A note came home from school: lice in your class. {${who} combed your hair with a metal comb for an hour under the kitchen light.|Every pillow in the house went into a garbage bag for a week.|You got a very short haircut and a very good story.}`,
      `You got head lice, and {${who} washed every sheet and stuffed animal in the house in hot water.|the whole family sat in a row at the kitchen table for the comb.} {You were mortified for a week.|Half your class had it too.}`,
      "The school nurse checked everyone's heads with a popsicle stick, and you were one of the lucky ones, {so home you went with a special shampoo.|and you learned more about lice than anyone should.}",
    ];
  }, { mood: -1, domain: "health", channel: "bad", when: kidAtHome }),
  {
    id: "h_sickDay", domain: "health", channel: "bad", ages: [5, 12], cooldown: 2, max: 3, when: s => s.studying && kidAtHome(s), p: () => 0.07,
    apply: (s, ctx) => {
      const who = grownUp(s, ctx), y = s.year;
      const tv = y < 1972 ? "the soap operas" : y < 2008 ? "The Price Is Right" : y < 2036 ? "cartoons on a tablet" : "cartoons";
      const care = y < 1975 ? "a glass thermometer under your tongue" : "Vicks rubbed on your chest";
      return { text: ctx.w([`You stayed home sick from school with ${who}, ginger ale and saltines, and watched ${tv} on the couch. {It was almost worth the fever.|You felt much better by about two in the afternoon, suspiciously.}`, `Home sick with {a cold|a stomach bug|strep throat}, you got ${care}, chicken noodle soup and {a pile of comic books.|the good blanket from the hall closet.|${who} checking on you every hour.}`, `You had a fever, so ${who} {called the school and made you toast with the crusts cut off.|let you sleep in the big bed.} {By the next day you were bouncing off the walls.|You missed a spelling test, which you counted as a win.}`]), mood: 0 };
    },
  },
  A("h_glassesKid", [7, 13], 0.035, s => [
    `You couldn't read the board from the back row, and the eye doctor said you needed glasses. {You picked ${framesOf(s.year)}, and the first day you noticed trees have individual leaves.|You picked ${framesOf(s.year)} and refused to wear them at school for a month.}`,
    `You got your first pair of glasses, ${framesOf(s.year)}, {and the world turned out to be very sharp.|and you broke them twice by Christmas.|and a kid called you four-eyes, once, and your best friend handled it.}`,
    "At the school eye test you could only read the big E, and {by the weekend you had glasses.|your parents felt terrible that nobody had noticed sooner.}",
  ], { mood: 0, domain: "health", channel: "change", when: kidAtHome, fx: s => { s.flags.glasses = s.age; } }),
  A("h_dentistKid", [4, 12], 0.07, s => {
    const snack = snackOf(s.year)[0].replace(/^an? /, "");
    return [
      "At the dentist you {got to pick a prize from the treasure chest|sat still for the fluoride tray that tasted like bubble gum|watched the fish tank in the waiting room}, {and left with a new toothbrush and a sticker.|and the dentist said you had perfect teeth.}",
      `You got your first cavity, {and blamed the ${snack}.|and the drill sounded like a dentist in a cartoon.} {Afterward you brushed for exactly two minutes for a month.|You were brave, and you got a sticker for it.}`,
      "The dentist painted sealants on your back teeth and {told you to stop chewing ice.|said you were the best patient all day, which you repeated to everyone.}",
    ];
  }, { mood: 0, domain: "health", channel: "change", when: kidAtHome }),
  {
    id: "h_braces", once: true, domain: "health", channel: "change", ages: [11, 15], when: kidAtHome, p: s => (s.year < 1970 ? 0.04 : s.year < 1985 ? 0.1 : 0.15),
    choice: (s, ctx) => {
      const tight = s.flags.homeMoney === "tight";
      const lead = scene(ctx, [
        "The dentist sent you to an orthodontist, who used the word “overbite” three times.",
        "Half your class has braces, and the orthodontist says it's your turn.",
        s.year < 1995 ? "The orthodontist says you need braces, and possibly headgear at night." : null,
        tight ? "The orthodontist says you need braces, and you saw your parents' faces when they heard the price." : null,
      ]);
      const clear = s.year >= 2001 ? "Ask for clear aligners" : s.year >= 1987 ? "Ask for the clear ceramic kind" : "Ask for the smallest brackets they have";
      const set = (how, text, mood = 0) => (s2, c) => { s2.flags.braces = how; return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} How do you handle your braces?`,
        options: [
          { id: "h_braces.colors", label: "Colored bands, new ones every month", hint: "make it fun", act: "socialize", style: "social", weight: 0.3, apply: set("colors", "You got braces with colored bands and changed them for every holiday: {orange and black for Halloween,|red and green for Christmas,|your school colors for homecoming.} {When they came off, you ran your tongue over your teeth for a week.|Your school pictures from those years are a colorful record.}", 1) },
          { id: "h_braces.bands", label: "Wear the rubber bands like they say", hint: "done sooner", act: "seeDoctor", style: "health", weight: 0.25, apply: set("good", "You got braces and actually wore your rubber bands every night, and the orthodontist took them off months early. {Your smile in the senior picture was worth it.|You were insufferable about it.}", 2) },
          { id: "h_braces.skip", label: "Skip the rubber bands when nobody's looking", hint: "who'll know?", act: "avoid", style: "risk", weight: 0.15, apply: set("long", "You got braces and skipped your rubber bands, and the orthodontist knew. {Six extra months.|You wore them through the whole of junior year.} The smile came out fine in the end.", -1) },
          { id: "h_braces.clear", label: clear, hint: "nobody has to know", act: "seeDoctor", style: "self", weight: 0.15, apply: set("clear", s.year >= 2001 ? "You got clear aligners instead of metal braces, and {kept losing the case at lunch.|nobody at school noticed, which was the whole point.}" : "You got the least noticeable braces they made, {and smiled with your mouth closed for two years anyway.|and nobody noticed as much as you feared.}") },
          { id: "h_braces.wait", label: "Say it can wait", hint: "your teeth are fine", act: "wait", style: "family", weight: 0.15, apply: set("none", tight ? "You told your parents your teeth were fine and the braces could wait. They never quite happened, and your smile is entirely your own." : "You talked your way out of braces for now, and your slightly crooked smile became the one everyone knows.") },
        ],
      };
    },
  },
  A("h_allergy", [4, 45], 0.015, s => {
    const pill = s.year < 1993 ? "Benadryl that made you sleepy" : s.year < 2003 ? "allergy pills from the doctor" : "Claritin from the drugstore";
    return [
      `Every spring the pollen came for you: {sneezing fits,|itchy eyes,|a box of tissues in every room,} and ${pill}. {You learned to check the pollen count like the weather.|You kept the windows shut in May.}`,
      "You found out you're allergic to {cats, which was hard news for a cat person.|ragweed, which explained every August of your life.|dust, which got you out of cleaning the attic.} {An allergist put you on shots for a while.|You carry tissues everywhere now.}",
      s.age <= 14 ? "You got an inhaler for asthma after a coughing fit at recess, {and learned to use it before gym class.|and the school nurse kept a spare in her desk.}" : "A doctor said the cough that never went away was mild asthma, and an inhaler {fixed it in a week.|let you climb stairs without stopping.}",
    ];
  }, { mood: -1, domain: "health", channel: "bad" }),

  // ---------- the teen years ----------
  A("h_acne", [13, 18], 0.1, s => {
    const fix = s.year < 1995 ? "Clearasil" : s.year < 2010 ? "the three-step kit from the infomercial" : "a skincare routine from the internet";
    return [
      `Your skin broke out {right before picture day,|the week of the school dance,} and you tried ${fix}. {It cleared up eventually, and so did your mood.|You spent a lot of time in the bathroom mirror that year.}`,
      "A dermatologist {gave you a cream that stung and worked.|said it was hormones and told you to stop picking.} {By senior year your skin had calmed down.|You were kinder to other kids' faces after that.}",
      `You fought acne all through ${s.age <= 14 ? "eighth grade" : "high school"} with ${fix}, {and your sister's concealer, borrowed without asking.|and a lot of patience.}`,
    ];
  }, { mood: -1, domain: "health", channel: "bad", when: usHome }),
  {
    // A first cigarette. Not a question: the teen and college years are full of questions already, and pacing would
    // skip it, so the share who take it (SMOKE) and the year's health luck decide.
    id: "h_smokeStart", once: true, domain: "health", channel: "bad", ages: [14, 24], when: s => !s.health.smoke && usHome(s), p: s => SMOKE(s.year)[0],
    apply: (s, ctx) => {
      const [, t] = SMOKE(s.year), brand = s.year < 1955 ? "Lucky Strikes" : s.year >= 1968 && s.sex === "female" && s.year < 1995 ? "Virginia Slims" : "Marlboros";
      const lead = scene(ctx, [
        `Behind the gym after school, a friend held out a pack of ${brand}.`,
        "At a party, someone passed you a cigarette like it was nothing.",
        s.age >= 16 ? `On a break at work, the older guys by the dumpster offered you one of their ${brand}.` : null,
        s.age >= 18 ? "At a college party, half the room was smoking, and someone offered you one." : null,
      ]);
      if (ctx.roll("health", "bad", t)) {
        s.health.smoke = true; s.flags.smokeAt = s.age; hr(s, 1.03);
        return { text: `${lead} ${ctx.w(["You took it and {coughed until your eyes watered, and then took another.|tried to look like you had done it before.} {By the end of the year you were buying your own packs.|Soon you were a smoker, with gum in your pocket for the smell.}", "You took one, and then another the next weekend, and {by summer you had a brand.|by graduation you were a smoker, like half the people you knew.}"])}`, mood: 0 };
      }
      const warn = s.year >= 1965 ? "{read the Surgeon General's warning off the side of the pack out loud.|said no thanks, and nobody cared, which surprised you.}" : "{said they stunt your growth, which you had heard from your grandmother.|said no thanks, and nobody cared, which surprised you.}";
      return { text: `${lead} ${ctx.w([`You ${warn} You never did take up smoking.`, "You tried it once, {coughed so hard you nearly threw up,|felt dizzy and green for an hour,} and {never touched another.|decided that was the end of that.}", "You held it to look cool and never inhaled. Nobody was fooled, and you never did take up smoking."])}`, mood: 0 };
    },
  },
  A("h_quitQuiet", [25, 90], 0.03, [
    "You quit smoking {on the fourth try,|the week your doctor showed you a picture of your lungs,|the day a pack cost more than lunch,} and {this time it stuck.|kept the last pack in a drawer for years, unopened, as a trophy.|took up sunflower seeds instead.}",
    "One morning you just didn't light the first cigarette, and then you didn't light the second. {After a hard month, you were done.|A year later you couldn't stand the smell.}",
    "You quit smoking {for the grandkids|for your kids|for yourself, finally}, {chewing a lot of gum and walking a lot of laps.|and food started tasting like food again.}",
  ], { mood: 4, domain: "health", channel: "good", when: s => s.health.smoke, fx: s => { s.health.smoke = false; s.flags.quitSmoke = s.age; hr(s, 0.97); } }),
  A("h_vape", [14, 22], 0.04, [
    "Everyone at school had a vape that looked like a flash drive, and you {tried it at a party, coughed, and gave it back.|used one for a year, hid it in your sleeve in class, and quit the summer you got winded running for the bus.|said no, and kept saying no, which got easier.}",
    "Your friends passed around a vape that tasted like {mango|mint|cotton candy}, and {you tried it once and decided it wasn't for you.|you went through a phase you're glad is over.}",
    "The bathroom at school had a vape detector, {and the alarm went off twice a week.|and you stayed out of it.} {You never got into it.|You tried it once and that was enough.}",
  ], { mood: 0, domain: "health", channel: "bad", when: s => s.year >= 2015 && s.year <= 2035 && !s.health.smoke && usHome(s) }),
  A("h_contacts", [13, 24], 0.25, [
    "You switched from glasses to contacts and spent {twenty minutes|the whole first morning} trying to put one in, {while your eye watered and the clock ticked.|and then forgot you were wearing them.}",
    "Your first contact lenses {changed everything about gym class.|made you feel like a new person at the first day of school.} {You still keep the glasses for late nights.|You lost one in a lake once.}",
    "You got contacts {for your sixteenth birthday,|before senior year,} and {your friends kept saying something looked different.|you finally saw the ball coming in softball.}",
  ], { mood: 1, domain: "health", channel: "change", when: s => s.flags.glasses !== undefined && s.year >= 1965 }),
  A("h_wisdomTeeth", [17, 25], 0.12, s => [
    `You got your wisdom teeth out and spent three days {on the couch with puffy chipmunk cheeks|living on milkshakes and pudding|watching movies with ice packs strapped to your face}.`,
    s.year >= 2010 ? "A friend filmed you coming out of anesthesia after your wisdom teeth, and you said some very strange things about penguins. The video still exists." : "You got your wisdom teeth out and asked the nurse, very seriously, whether she was an angel. Your ride home never let you forget it.",
    "The dentist said all four wisdom teeth had to go, {and they went, along with a week of your summer.|and you looked like a hamster in the family photos that week.}",
  ], { mood: -1, domain: "health", channel: "bad" }),
  {
    id: "h_sportsInjury", domain: "health", channel: "bad", ages: [12, 40], cooldown: 6, max: 2, p: s => 0.012 + (s.flags.club === "sports" && s.age <= 18 ? 0.03 : 0),
    apply: (s, ctx) => {
      const sport = s.flags.sport && s.age <= 18 ? s.flags.sport : ctx.rng.pick(["pickup basketball", "softball", "soccer", "tennis", "touch football at Thanksgiving"]);
      return { text: ctx.w([`You rolled your ankle playing ${sport} and {spent two weeks on crutches.|learned to tape it properly.|watched the rest of the season from the bench.}`, `You jammed a finger playing ${sport}, {and it's still a little crooked.|and a teammate splinted it with a popsicle stick.}`, `Shin splints from ${sport} {had you icing your legs every night.|taught you the value of a good pair of shoes.|kept you out for a month.}`]), mood: -2 };
    },
  },
  A("h_sunburn", [13, 25], 0.04, s => [
    s.year < 1990 ? "You lay out in the backyard with baby oil and a foil reflector, {and turned the color of a lobster.|and peeled for a week.} {Years later, your dermatologist sighed when you told her.|You've worn sunscreen ever since.}" : "You fell asleep on the beach without sunscreen and {got a sunburn so bad you slept standing up.|had a perfect outline of your sunglasses for a month.}",
    "The first day of summer vacation you burned so badly that {your mother covered you in aloe from a plant on the windowsill.|you couldn't wear a backpack for a week.}",
    "A sunburn at the lake {blistered your shoulders|turned your nose bright red} and {finally made a sunscreen person out of you.|became the story your family tells every Fourth of July.}",
  ], { mood: -1, domain: "health", channel: "bad" }),

  // ---------- habits ----------
  {
    id: "h_sleep", domain: "health", channel: "bad", ages: [19, 65], cooldown: 8, max: 2, p: () => 0.02,
    choice: (s, ctx) => {
      const baby = s.kids.some(k => k.alive !== false && k.age <= 1);
      const lead = scene(ctx, [
        baby ? "The baby wakes up every two hours, and you have started falling asleep at red lights." : null,
        "You lie awake at three in the morning going over the to-do list.",
        s.year >= 2010 ? "You scroll your phone in bed until one, then wonder why you're tired." : "You fall asleep on the couch with the TV on and wake up at four with a stiff neck.",
        married(s) ? `${s.partner.call} says you toss and turn all night, and you both look tired.` : null,
      ]);
      return {
        prompt: `${lead} What do you do about sleep?`,
        options: [
          { id: "h_sleep.routine", label: s.year >= 2008 ? "No screens after ten" : "No TV in the bedroom", hint: "a real bedtime", act: "quitHabit", style: "health", weight: 0.25, apply: (s2, c) => { hr(s2, 0.99); stress(s2, -0.05); return { text: c.w(`Short on sleep, you set a real bedtime and ${s2.year >= 2008 ? "put the phone in the kitchen" : "moved the TV out of the bedroom"}, {and within a month you were sleeping like a teenager.|and the 3 a.m. thinking mostly stopped.}`), mood: 3 }; } },
          { id: "h_sleep.doctor", label: "Ask a doctor", hint: "there might be a reason", act: "seeDoctor", style: "safe", weight: 0.2, apply: (s2, c) => { hr(s2, 0.99); return { text: c.w("Short on sleep, you asked your doctor, who {asked about your coffee, and you were honest, and you cut back.|suggested a few changes and a little melatonin.|sent you for a sleep study, where you slept surprisingly well with wires on your head.}"), mood: 2 }; } },
          { id: "h_sleep.coffee", label: "More coffee", hint: "sleep is for later", act: "pushThrough", style: "risk", weight: 0.2, apply: (s2, c) => { hr(s2, 1.01); stress(s2, 0.05); return { text: c.w("Short on sleep, you ran on coffee instead, {four cups by noon.|and kept a thermos in the car.} It worked, more or less, for a while."), mood: -1 }; } },
          { id: "h_sleep.nap", label: "Become a napper", hint: "twenty minutes, no shame", act: "rest", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w("Short on sleep, you became a champion napper: {twenty minutes in the car at lunch,|a power nap after work,} {and you were a nicer person for it.|and nobody was allowed to talk to you during it.}"), mood: 2 }) },
          { id: "h_sleep.share", label: baby ? "Take turns with the night feedings" : "Ask for help at home", hint: "split the load", act: "shareCare", style: "family", weight: 0.2, when: s2 => married(s2) || baby, apply: s2 => { stress(s2, -0.05); return { text: baby ? "Short on sleep, you and your partner traded night feedings, one night on, one night off, and both of you stopped looking like ghosts." : "Short on sleep, you asked for more help around the house, and a few chores off your plate bought back an hour a night.", mood: 2 }; } },
        ],
      };
    },
  },
  A("h_coffee", [16, 85], 0.015, s => {
    const y = s.year;
    const cup = y < 1972 ? "percolator coffee from a can of Folgers" : y < 1990 ? "coffee from the Mr. Coffee on the counter" : y < 2008 ? "a latte from the new coffee shop downtown" : y < 2015 ? "coffee from a single-cup pod machine" : y < 2036 ? "cold brew" : "coffee";
    return [
      `You became a coffee person: ${cup} {every morning, before anyone was allowed to talk to you.|two cups a day, then three.|and a strong opinion about it.}`,
      `Your mornings now run on ${cup}, {and your mug says “Don't talk to me.”|and you know the barista's kids' names.|and the day the machine broke was a dark day.}`,
      `You switched to ${cup} {and never looked back.|and the family gave you a fancy mug every Christmas.}`,
    ];
  }, { mood: 1, domain: "health", channel: "change" }),
  {
    id: "h_drink", domain: "health", channel: "bad", ages: [21, 75], cooldown: 8, max: 2, when: s => !s.health.serious && s.flags.sober === undefined, p: () => 0.02,
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        "A couple of beers after work has turned into most nights.",
        "The recycling bin is mostly bottles, and you noticed.",
        "Your doctor asked how many drinks you have a week, and you rounded down.",
        s.age >= 35 ? "The hangovers last two days now." : "Every weekend is a blur, and Monday mornings are getting rough.",
        s.year >= 2014 ? "Half your friends are doing Dry January and won't stop talking about how good they feel." : null,
      ]);
      return {
        prompt: `${lead} What do you do about drinking?`,
        options: [
          { id: "h_drink.weekends", label: "Weekends only", hint: "a simple rule", act: "quitHabit", style: "health", weight: 0.3, apply: (s2, c) => { s2.health.drink = false; hr(s2, 0.98); return { text: c.w("You set a rule, drinks on weekends only, {and kept it, mostly.|and slept better within a week.|and saved enough to notice.}"), mood: 2 }; } },
          { id: "h_drink.month", label: s.year >= 2013 ? "Do Dry January" : "Take a month off", hint: "see how it feels", act: "quitHabit", style: "learn", weight: 0.2, apply: (s2, c) => { const ok = c.roll("health", "good", 0.6); if (ok) { s2.health.drink = false; hr(s2, 0.99); } return { text: ok ? c.w("You took a month off drinking {and felt so good you mostly kept going.|and found out you didn't miss it as much as you thought.}") : "You took a month off drinking, made it nineteen days, and went back to the old habits, a little more aware of them.", mood: ok ? 2 : 0 }; } },
          { id: "h_drink.quit", label: "Quit for good", hint: "a meeting in a church basement", act: "seekHelp", style: "social", weight: 0.1, apply: (s2, c) => { s2.health.drink = false; s2.flags.sober = s2.age; hr(s2, 0.97); return { text: c.w("You quit drinking for good, {and went to a meeting in a church basement and kept going.|with a sponsor who answered the phone at any hour.} {You got a one-year chip and kept it on your keychain.|It was the best thing you ever did for yourself.}"), mood: 3 }; } },
          { id: "h_drink.swap", label: s.year >= 2018 ? "Switch to the non-alcoholic stuff" : "Switch to club soda with lime", hint: "same glass, no buzz", act: "quitHabit", style: "self", weight: 0.15, apply: (s2, c) => { s2.health.drink = false; hr(s2, 0.99); return { text: c.w(s2.year >= 2018 ? "You switched to non-alcoholic beer and fancy mocktails, {and nobody at the party could tell.|and your mornings got a lot better.}" : "You started ordering club soda with lime at the bar, {and nobody asked.|and the bartender started pouring it when you walked in.}"), mood: 2 }; } },
          { id: "h_drink.fine", label: "It's fine", hint: "everybody drinks", act: "vice", style: "risk", weight: 0.25, apply: s2 => { s2.health.drink = true; hr(s2, 1.02); return { text: "You decided the drinking was fine, everybody drinks, and kept going as you were.", mood: 0 }; } },
        ],
      };
    },
  },
  {
    id: "h_quitSmoke", domain: "health", channel: "good", ages: [18, 90], cooldown: 3, when: s => s.health.smoke, p: () => 0.1,
    choice: (s, ctx) => {
      const kid = s.kids.find(k => k.alive !== false && k.age >= 6 && k.age <= 14);
      const lead = scene(ctx, [
        kid ? `${kid.call} learned at school that smoking is bad and hid your cigarettes in the freezer.` : null,
        "You got winded on the stairs at work, and the cough in the morning isn't going away.",
        s.year >= 1977 ? "It's the Great American Smokeout, and your office is handing out pamphlets." : "Your doctor told you, between puffs of his own pipe, that you should probably quit.",
        married(s) ? `${s.partner.call} asked you, quietly, to try quitting.` : null,
        "A pack costs more every year, and you did the math on what you've spent.",
      ]);
      const aid = s.year >= 2006 ? "Ask the doctor for a quit-smoking prescription" : s.year >= 1992 ? "Try the nicotine patch" : s.year >= 1984 ? "Try nicotine gum" : "Sign up for a quit-smoking clinic";
      const quit = (s2, c, p, how) => {
        if (c.roll("health", "good", p)) { s2.health.smoke = false; s2.flags.quitSmoke = s2.age; hr(s2, 0.97); return { text: c.w(`You quit smoking ${how}, {and the cravings faded after a few awful weeks.|and food started tasting like food again.|and a year later you couldn't stand the smell.}`), mood: 4, big: true }; }
        return { text: c.w(`You tried to quit smoking ${how} and made it {three days|two weeks|until the first stressful day at work}. {You'll try again.|Next time, maybe.}`), mood: -2 };
      };
      return {
        prompt: `${lead} Do you try to quit?`,
        options: [
          { id: "h_quitSmoke.cold", label: "Cold turkey", hint: "throw out the pack today", act: "quitHabit", style: "health", weight: 0.25, apply: (s2, c) => quit(s2, c, 0.3, "cold turkey") },
          { id: "h_quitSmoke.aid", label: aid, hint: "help makes it likelier", act: "seeDoctor", style: "safe", weight: 0.25, apply: (s2, c) => quit(s2, c, 0.45, s2.year >= 2006 ? "with a prescription from the doctor" : s2.year >= 1992 ? "with the patch" : s2.year >= 1984 ? "with nicotine gum" : "with a clinic at the hospital") },
          { id: "h_quitSmoke.cut", label: "Cut down to half a pack", hint: "baby steps", act: "quitHabit", style: "self", weight: 0.15, apply: (s2, c) => quit(s2, c, 0.15, "by cutting down a little at a time") },
          { id: "h_quitSmoke.vape", label: "Switch to vaping", hint: "less bad, supposedly", act: "vice", style: "risk", weight: 0.1, when: s2 => s2.year >= 2012 && s2.year <= 2035, apply: s2 => { s2.health.smoke = false; s2.flags.vape = true; s2.flags.quitSmoke = s2.age; hr(s2, 0.98); return { text: "You traded cigarettes for a vape, and the cough cleared up, though you now have a different thing to quit.", mood: 1 }; } },
          { id: "h_quitSmoke.buddy", label: s.year >= 2004 ? "Call the quitline" : "Quit with a friend", hint: "someone in your corner", act: "seekHelp", style: "social", weight: 0.1, apply: (s2, c) => quit(s2, c, 0.4, s2.year >= 2004 ? "with a coach from 1-800-QUIT-NOW calling every week" : "together with a friend from work, keeping each other honest") },
          { id: "h_quitSmoke.no", label: "Not now", hint: "it's the one thing you enjoy", act: "vice", style: "self", weight: 0.15, apply: () => ({ text: "You thought about quitting smoking and decided not this year. You moved your smoke break farther from the door.", mood: 0 }) },
        ],
      };
    },
  },
  A("h_smokeBan", [18, 80], 0.12, s => [
    "Your office banned smoking indoors, and you joined the huddle by the back door, {in the rain,|in January,} {where the best gossip in the company was.|with the same four people every day.}",
    s.year <= 1995 ? "Smoking was banned on domestic flights, and your first smoke-free flight felt very long." : "The restaurants in town got rid of their smoking sections, and you stood on the sidewalk between courses.",
    "The bowling alley went smoke-free, {and you noticed you could see the pins clearly for the first time.|and you started going outside between frames.}",
  ], { mood: -1, domain: "health", channel: "change", when: s => s.health.smoke && s.year >= 1988 && s.year <= 2012 && usHome(s) }),
  {
    id: "h_gym", domain: "health", channel: "good", ages: [18, 65], cooldown: 7, max: 2, p: () => 0.025,
    choice: (s, ctx) => {
      const cls = classOf(s.year), home = homeWorkout(s.year);
      const lead = scene(ctx, ["It's January, and you made the resolution again: get in shape.", "You got winded carrying the groceries up the stairs, and that was the last straw.", `A friend from work keeps inviting you to ${cls}.`, s.age >= 40 ? "Your doctor said “exercise” three times at your checkup." : null]);
      return {
        prompt: `${lead} How do you start?`,
        options: [
          { id: "h_gym.class", label: `Join ${cls}`, hint: "a group keeps you going", act: "exercise", style: "social", weight: 0.25, apply: (s2, c) => { fit(s2, 0.1); hr(s2, 0.99); return { text: c.w(`You joined ${cls} {three nights a week,|with a friend from work,} and {the instructor learned your name by week two.|you were sore for a month and hooked after that.}`), mood: 3 }; } },
          { id: "h_gym.home", label: `Work out at home`, hint: home, act: "exercise", style: "self", weight: 0.2, apply: (s2, c) => { const ok = c.rng() < 0.5; if (ok) { fit(s2, 0.08); hr(s2, 0.99); } return { text: ok ? c.w(`You started working out at home with ${home}, {every morning before work,|in the living room, moving the coffee table every time,} and stuck with it.`) : `You started working out at home with ${home}, kept it up for three weeks and then used the time for the couch.`, mood: ok ? 3 : 0 }; } },
          { id: "h_gym.join", label: "Sign up for a gym membership", hint: "a contract is motivation", act: "exercise", style: "risk", weight: 0.2, apply: (s2, c) => { spend(s2, 0.02); const ok = c.rng() < 0.4; if (ok) { fit(s2, 0.1); hr(s2, 0.99); } return { text: ok ? c.w("You signed up at the gym and actually went, {and became one of the regulars at six a.m.|and the guy at the front desk fist-bumped you every time.}") : "You signed up for a gym membership, went three times and paid for two years. You think about it every time the charge comes through.", mood: ok ? 3 : -1 }; } },
          { id: "h_gym.run", label: "Start running before work", hint: "free, and the sunrise", act: "exercise", style: "health", weight: 0.2, apply: (s2, c) => { fit(s2, 0.1); hr(s2, 0.99); return { text: c.w("You started running before work, {one block, then a mile, then three.|in shoes you bought on sale.} {The sunrise made it worth it.|The neighborhood dogs got to know you.}"), mood: 3 }; } },
          { id: "h_gym.skip", label: "Your job is your workout", hint: "you're on your feet all day", act: "wait", style: "self", weight: 0.15, apply: () => ({ text: "You decided your job and the yard were enough of a workout, and let the resolution go quietly.", mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "h_diet", domain: "health", channel: "change", ages: [20, 70], cooldown: 8, max: 2, p: () => 0.015,
    choice: (s, ctx) => {
      const diet = dietOf(s.year);
      const lead = scene(ctx, [`Everyone at work is on ${diet}.`, "After the holidays, your doctor suggested eating a little better.", `Your sister lost twenty pounds on ${diet} and will not stop talking about it.`]);
      const club = s.year >= 1963 ? "Join Weight Watchers" : "Join a diet club at church";
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "h_diet.fad", label: `Try ${diet}`, hint: "it worked for them", act: "quitHabit", style: "risk", weight: 0.25, apply: (s2, c) => (c.rng() < 0.35 ? { text: c.w(`You tried ${diet} and {stuck with it longer than anyone expected.|felt great, and became a little preachy about it.}`), mood: 2 } : { text: c.w(`You tried ${diet} and {lasted until a coworker's birthday cake.|made it eleven days, which you count as a personal record.|gave up the day someone brought donuts.}`), mood: 0 }) },
          { id: "h_diet.club", label: club, hint: "weekly meetings, a friend to weigh in with", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => { hr(s2, 0.99); return { text: c.w(`You joined ${s2.year >= 1963 ? "Weight Watchers" : "a diet club at church"}, {and the weekly meetings became your favorite gossip hour.|and made a friend you still call every week.|and learned more about portion sizes than you wanted to know.}`), mood: 2 }; } },
          { id: "h_diet.veg", label: "More vegetables, less fried", hint: "no rules, just better", act: "quitHabit", style: "health", weight: 0.25, apply: (s2, c) => { hr(s2, 0.99); return { text: c.w("Instead of a diet, you just ate {more vegetables and less fried food,|smaller plates and fewer seconds,} {and felt better by spring.|and your doctor noticed at the next checkup.}"), mood: 2 }; } },
          { id: "h_diet.doctor", label: "Ask your doctor", hint: "a plan that fits you", act: "seeDoctor", style: "safe", weight: 0.15, apply: (s2, c) => { hr(s2, 0.99); return { text: c.w("You asked your doctor instead of the office, {and came away with a plan that actually fit your life.|and a referral to a nutritionist who was kind and practical.}"), mood: 2 }; } },
          { id: "h_diet.pie", label: "No diets. Life is short", hint: "eat the pie", act: "avoid", style: "self", weight: 0.15, apply: () => ({ text: "You decided you were done with diets. Life is short, and you had the pie.", mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "h_5k", once: true, domain: "health", channel: "good", ages: [16, 70], when: s => s.year >= 1975 && usHome(s), p: () => 0.015,
    choice: (s, ctx) => {
      const lead = scene(ctx, ["Your office is running the Thanksgiving Turkey Trot, and they need one more person on the team.", "A friend signed up for a charity 5K and wants a partner.", s.year >= 2009 ? "A coworker swears by an app that turns couch potatoes into runners in nine weeks." : "The town's Fourth of July 5K is in two months, and the flyer is on your fridge."]);
      return {
        prompt: `${lead} Do you run it?`,
        options: [
          { id: "h_5k.train", label: s.year >= 2009 ? "Train with the nine-week app" : "Train for it", hint: "from the couch to the finish line", act: "exercise", style: "health", weight: 0.3, apply: (s2, c) => { fit(s2, 0.1); hr(s2, 0.99); return { text: c.w("You trained for your first 5K, {a little more every week,} and crossed the finish line {in thirty-four minutes, which you still quote.|to cheers from people you didn't know.|and immediately signed up for another.}"), mood: 5, big: true }; } },
          { id: "h_5k.friend", label: "Run it with a friend", hint: "talk the whole way", act: "exercise", style: "social", weight: 0.25, apply: (s2, c) => { fit(s2, 0.05); hr(s2, 0.99); return { text: c.w("You ran the 5K with {friend}, {talking the whole way,|and walked the hills,} and you crossed the finish line together {holding hands up like champions.|in matching T-shirts.}"), mood: 4 }; } },
          { id: "h_5k.walk", label: "Walk it", hint: "it still counts", act: "exercise", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w("You walked the 5K {with the family|pushing a stroller|in a turkey hat}, {and came in near last and proud of it.|and got the same medal as the runners.}"), mood: 3 }) },
          { id: "h_5k.marathon", label: "Skip the 5K, train for a marathon", hint: "go big", act: "exercise", style: "risk", weight: 0.1, apply: (s2, c) => { fit(s2, 0.12); hr(s2, 0.99); return c.roll("health", "good", 0.5) ? { text: "You skipped the 5K and trained all year for a marathon, and you finished it: 26.2 miles, and a medal you sleep next to.", mood: 7, big: true } : { text: "You trained for a marathon instead of a 5K, got to mile eighteen in training, and your knee said no. You ran the half marathon instead, and that was plenty.", mood: 2 }; } },
          { id: "h_5k.cheer", label: "Cheer from the sidelines", hint: "someone has to hold the sign", act: "socialize", style: "safe", weight: 0.15, apply: () => ({ text: "You skipped the 5K but stood at the finish line with a homemade sign and a cowbell, which everyone agreed was harder.", mood: 2 }) },
        ],
      };
    },
  },
  A("h_steps", [25, 85], 0.015, [
    "You got a step counter {and walked laps around the kitchen at 11:50 at night to hit ten thousand.|and parked at the far end of every parking lot.|and started a step contest with your sister, which got competitive.}",
    "Your watch started telling you to stand up every hour, {and you obeyed it more than you obey anyone.|and you took the stairs just to make it happy.}",
    "The step contest at work {turned you into a person who paces during phone calls.|had your whole team walking at lunch.}",
  ], { mood: 1, domain: "health", channel: "good", when: s => s.year >= 2010, fx: s => { hr(s, 0.995); fit(s, 0.03); } }),
  A("h_yoga", [20, 75], 0.015, [
    "You started yoga {at the community center|in a studio over the dry cleaner's|with a video in the living room}, {and could touch your toes by spring.|and the last five minutes, lying on the floor, became the best part of your week.}",
    "A friend dragged you to yoga, and {you fell over in tree pose and laughed.|you went back the next week, and the next.} {Your back stopped hurting.|You bought a mat in a color you would never wear.}",
    "You took up yoga {on Saturday mornings|before work}, and {the instructor's voice stayed in your head during traffic jams.|you breathe differently now when things get tense.}",
  ], { mood: 2, domain: "health", channel: "good", when: s => s.year >= 1995, fx: s => { hr(s, 0.995); stress(s, -0.05); } }),
  {
    id: "h_back", domain: "health", channel: "bad", ages: [28, 72], cooldown: 8, max: 2, p: () => 0.02,
    choice: (s, ctx) => {
      const lead = scene(ctx, ["You bent over to tie your shoe and your back went out.", s.job ? `Years of work as ${/^[aeiou]/i.test(s.job.title) ? "an" : "a"} ${s.job.title} have left your lower back aching every evening.` : "Your lower back has ached every evening for a month.", "You helped a friend move a couch, and your back has not forgiven you."]);
      return {
        prompt: `${lead} What do you do about it?`,
        options: [
          { id: "h_back.pt", label: "Physical therapy", hint: "the exercises work, if you do them", act: "seeDoctor", style: "health", weight: 0.3, apply: (s2, c) => ({ text: c.w("For your back you went to physical therapy, {and the stretches with the rubber band actually worked.|and the therapist said your core was “a work in progress.”} Now you do them every morning, mostly."), mood: 2 }) },
          { id: "h_back.chiro", label: "See a chiropractor", hint: "a crack and a prayer", act: "seeDoctor", style: "risk", weight: 0.15, apply: (s2, c) => { spend(s2, 0.02); return { text: c.w("For your back you went to a chiropractor, {who cracked it like a knuckle, and you swore it helped.|and went every week for a while.}"), mood: 1 }; } },
          { id: "h_back.desk", label: s.year >= 2012 ? "Get a standing desk and a new mattress" : "Get a new mattress and a better chair", hint: "fix the cause", act: "rest", style: "self", weight: 0.2, apply: (s2, c) => { spend(s2, 0.03); return { text: c.w(`For your back you bought ${s2.year >= 2012 ? "a standing desk and" : "a better chair and"} a new mattress, {and the difference was startling.|and the store let you lie on fourteen mattresses first.}`), mood: 2 }; } },
          { id: "h_back.rest", label: "Rest and ibuprofen", hint: "it'll pass", act: "rest", style: "safe", weight: 0.2, apply: () => ({ text: "For your back you took ibuprofen, rested on the floor with your knees up, and in two weeks it passed, mostly.", mood: 0 }) },
          { id: "h_back.push", label: "Work through it", hint: "you can't afford to stop", act: "pushThrough", style: "risk", weight: 0.15, apply: () => ({ text: "You worked through the back pain with a heating pad in the car and a grim face, and it took all season to ease up.", mood: -2 }) },
        ],
      };
    },
  },
  {
    id: "h_bpWarning", once: true, domain: "health", channel: "bad", ages: [35, 64], when: s => !s.health.chronic, p: () => 0.03,
    choice: (s, ctx) => {
      const what = ctx.rng.pick(["blood pressure", "blood pressure", "cholesterol"]);
      const lead = scene(ctx, [
        s.year >= 1976 && what === "blood pressure" ? "The blood pressure machine at the pharmacy flashed a number you didn't like." : null,
        `At a checkup the nurse took your ${what} twice and frowned the second time.`,
        `Your ${what} came back “borderline,” and the doctor said it's a warning, not a diagnosis.`,
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "h_bpWarning.habits", label: "Cut the salt and walk every day", hint: "start with habits", act: "quitHabit", style: "health", weight: 0.25, apply: (s2, c) => { hr(s2, 0.98); return { text: c.w(`With your ${what} borderline, you cut back on salt and started walking every day, {and at the next checkup the number had dropped.|and you got used to food that tastes like food.}`), mood: 2 }; } },
          { id: "h_bpWarning.cuff", label: "Track it at home", hint: "know your numbers", act: "seeDoctor", style: "safe", weight: 0.2, apply: (s2, c) => { hr(s2, 0.99); return { text: c.w(what === "blood pressure" ? "With your blood pressure borderline, you bought a cuff and checked it every morning, writing the numbers in a notebook your doctor came to love." : "With your cholesterol borderline, you got it checked every six months and watched the numbers like stock prices."), mood: 1 }; } },
          { id: "h_bpWarning.pill", label: "Start medication now", hint: "a pill a day, no drama", act: "seeDoctor", style: "safe", weight: 0.15, apply: s2 => { hr(s2, 0.98); return { text: `With your ${what} borderline, you started a small pill every morning, and the numbers settled right down.`, mood: 1 }; } },
          { id: "h_bpWarning.cook", label: "Learn to cook differently", hint: "olive oil, fish, beans", act: "hobby", style: "learn", weight: 0.15, apply: (s2, c) => { hr(s2, 0.98); return { text: c.w(`With your ${what} borderline, you learned to cook differently, {with olive oil, fish and a lot of beans,|from a cookbook your doctor recommended,} {and the family complained for a month and then asked for seconds.|and it turned into a hobby.}`), mood: 2 }; } },
          { id: "h_bpWarning.ignore", label: "You feel fine", hint: "it's borderline", act: "avoid", style: "risk", weight: 0.25, apply: s2 => { hr(s2, 1.02); return { text: `Your ${what} was borderline, but you felt fine, so you let it go for now.`, mood: 0 }; } },
        ],
      };
    },
  },
  {
    id: "h_chronicLife", once: true, domain: "health", channel: "good", ages: [30, 100], when: s => s.health.chronic, p: () => 0.12,
    choice: (s, ctx) => {
      const lead = scene(ctx, ["Living with your condition means pills, numbers and a lot of advice from relatives.", "Your doctor wants to see you every three months now, with a list of questions you never remember.", "The pharmacy knows you by name, and the pill organizer has a slot for every day of the week."]);
      return {
        prompt: `${lead} How do you manage it?`,
        options: [
          { id: "h_chronicLife.walk", label: "Join a walking group", hint: "company makes it stick", act: "exercise", style: "social", weight: 0.25, apply: (s2, c) => { hr(s2, 0.98); return { text: c.w("To manage your condition, you joined a walking group {that meets at the mall before the stores open,|that does two miles every morning in the park,} and the numbers improved along with the company."), mood: 3 }; } },
          { id: "h_chronicLife.cook", label: "A nutritionist and a cooking class", hint: "learn to eat for it", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => { hr(s2, 0.98); return { text: c.w("To manage your condition, you saw a nutritionist and took a cooking class, {and learned that low-salt doesn't have to mean no flavor.|and your doctor was very pleased at the next visit.}"), mood: 2 }; } },
          { id: "h_chronicLife.track", label: "Track everything", hint: "a log, an alarm, the numbers", act: "seeDoctor", style: "safe", weight: 0.2, apply: (s2, c) => { hr(s2, 0.99); return { text: c.w(`To manage your condition, you set ${s2.year >= 2010 ? "alarms on your phone" : "a kitchen timer"} for your pills and kept a log of your numbers {in a little notebook.|that your doctor called “the best she'd seen.”}`), mood: 1 }; } },
          { id: "h_chronicLife.pills", label: "Take the pills and get on with life", hint: "that's what they're for", act: "wait", style: "self", weight: 0.2, apply: () => ({ text: "You took your pills every morning with your coffee and got on with your life, which was the point.", mood: 1 }) },
          { id: "h_chronicLife.slide", label: "Let it slide sometimes", hint: "life gets busy", act: "avoid", style: "risk", weight: 0.15, apply: s2 => { hr(s2, 1.02); return { text: "You let your condition slide sometimes, with missed pills and skipped appointments, and your doctor's lectures got longer.", mood: 0 }; } },
        ],
      };
    },
  },
  A("h_readers", [40, 52], 0.1, [
    "You realized your arms had gotten too short to read the menu, {and bought reading glasses at the drugstore.|and the waiter politely held the candle closer.} {Now there's a pair in every room.|You keep losing them on top of your head.}",
    "At the eye doctor you learned the word “presbyopia,” {and left with reading glasses and a sense of betrayal.|which is a fancy way of saying forty.}",
    "You started needing reading glasses, {and bought a three-pack in leopard print.|and borrowed your mother's until you gave in.}",
  ], { mood: 0, domain: "health", channel: "change" }),
  {
    id: "h_lasik", once: true, domain: "health", channel: "change", ages: [22, 50], when: s => s.year >= 1999 && s.flags.glasses !== undefined && usHome(s), p: () => 0.04,
    choice: (s, ctx) => ({
      prompt: `${scene(ctx, ["You're tired of glasses fogging up every time you open the oven.", "A coworker had laser eye surgery and can now see the alarm clock without reaching for anything.", "A billboard on the highway promises perfect vision in fifteen minutes."])} Do you get laser eye surgery?`,
      options: [
        { id: "h_lasik.yes", label: "Get it done", hint: "fifteen minutes, a lot of money", act: "seeDoctor", style: "risk", weight: 0.3, apply: (s2, c) => { spend(s2, 0.08); return { text: c.w("You had laser eye surgery, {and woke up the next morning and read the alarm clock from bed.|and spent a week reaching for glasses that weren't there.|and cried a little at how sharp the leaves were.}"), mood: 4 }; } },
        { id: "h_lasik.glasses", label: "Keep your glasses", hint: "they're part of your face", act: "wait", style: "self", weight: 0.35, apply: () => ({ text: "You decided against laser eye surgery and kept your glasses. They're part of your face by now.", mood: 0 }) },
        { id: "h_lasik.contacts", label: "Switch to contacts instead", hint: "no lasers involved", act: "seeDoctor", style: "safe", weight: 0.2, apply: () => ({ text: "You skipped the laser surgery and switched to contacts, which felt brave enough.", mood: 1 }) },
        { id: "h_lasik.save", label: "Save up first", hint: "maybe next year", act: "save", style: "safe", weight: 0.15, apply: () => ({ text: "You wanted laser eye surgery but started a savings jar for it first. The jar is labeled “EYES.”", mood: 0 }) },
      ],
    }),
  },
  A("h_snoring", [40, 75], 0.02, s => [
    `${married(s) ? `${s.partner.call} recorded you snoring and played it back at breakfast` : "A friend on a camping trip said your snoring scared the bears"}, and {a sleep study found you stop breathing at night.|the doctor sent you for a sleep test.} {Now you sleep with a mask that hums, and you have never felt so rested.|The machine on your nightstand changed your life.}`,
    "Your snoring got loud enough to rattle the windows, {and a sleep doctor fitted you for a breathing machine.|and a mouth guard from the dentist actually fixed it.} {You wake up rested for the first time in years.|Everyone in the house is grateful.}",
    "A sleep study showed why you were always tired, and {the mask took some getting used to, and then you wouldn't sleep without it.|you stopped falling asleep in meetings.}",
  ], { mood: 2, domain: "health", channel: "good", when: s => s.year >= 1985, fx: s => hr(s, 0.99) }),
  A("h_soda", [25, 70], 0.015, s => [
    `You gave up ${s.year >= 1980 ? "the Big Gulp" : "soda"} {after your dentist asked a pointed question,|cold turkey,} and {the headaches lasted a week.|switched to seltzer, which you now defend loudly.}`,
    "You cut sugar out of your coffee {and it tasted terrible for a month and fine after that.|one spoonful at a time.}",
    "You stopped buying candy for the office jar, {and your coworkers staged a small protest.|and switched to almonds, to universal disappointment.}",
  ], { mood: 1, domain: "health", channel: "good", fx: s => hr(s, 0.995) }),

  // ---------- insurance and bills ----------
  A("h_uninsured", [19, 30], 0.15, [
    "Between jobs and without health insurance, you {treated the flu with orange juice and stubbornness.|paid cash at a free clinic in a church basement.|crossed your fingers every time you got on your bike.}",
    "You had no health insurance for a while, and {a sprained wrist meant a cash bill from urgent care that you paid off over months.|you skipped the dentist for two years.}",
    "No job meant no insurance, and {you were careful in a way you hadn't been before.|a friend in nursing school became your doctor, unofficially.}",
  ], { mood: -1, domain: "wealth", channel: "bad", when: s => s.year >= 1975 && s.year <= 2013 && !s.employed && !s.studying && usHome(s) && s.done.has("firstJob") }),
  A("h_under26", [22, 26], 0.3, [
    "Thanks to the new health law, you stayed on your parents' insurance until 26, {and when you aged off, you learned the word “deductible.”|which your mother mentioned every Thanksgiving.}",
    "You were still on your parents' health insurance, {which was lucky the week you broke your toe.|and the card in your wallet still had your dad's name on it.}",
    "At 26 you aged off your parents' health plan and {signed up for your own, feeling very adult and slightly poorer.|spent a weekend learning what a premium is.}",
  ], { mood: 0, domain: "wealth", channel: "change", when: s => s.year >= 2010 && s.year <= 2035 && (s.father.alive || s.mother.alive) && usHome(s) }),
  {
    id: "h_aca", once: true, domain: "wealth", channel: "change", ages: [26, 64], when: s => s.year >= 2014 && s.year <= 2035 && !s.employed && !s.retired && !s.studying && usHome(s), p: () => 0.2,
    choice: (s, ctx) => {
      const lead = scene(ctx, ["Without a job's health plan, you went to the marketplace website and stared at the metal tiers: bronze, silver, gold.", "Open enrollment ends next week, and you still don't have health insurance.", "A friend got a big hospital bill last year without insurance, and you decided not to be next."]);
      const set = (how, text, mood = 1) => (s2, c) => { s2.flags.insurance = how; return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} What coverage do you choose?`,
        options: [
          { id: "h_aca.bronze", label: "A bronze plan", hint: "cheap monthly, a big deductible", act: "insurance", style: "risk", weight: 0.25, apply: (s2, c) => { spend(s2, 0.03); return set("bronze", "You signed up for a bronze plan on the marketplace: {a low monthly bill and a deductible you hoped never to meet.|enough to sleep at night.}")(s2, c); } },
          { id: "h_aca.silver", label: "A silver plan with the subsidy", hint: "the middle of the road", act: "insurance", style: "safe", weight: 0.3, apply: (s2, c) => { spend(s2, 0.05); return set("silver", "You picked a silver plan on the marketplace with a subsidy, {and the website crashed twice before it went through.|and you finally scheduled the checkup you had been putting off.}", 2)(s2, c); } },
          { id: "h_aca.medicaid", label: "Apply for Medicaid", hint: "if you qualify", act: "insurance", style: "safe", weight: 0.15, when: s2 => s2.savings < 0.5, apply: set("medicaid", "You applied for Medicaid, {filled out a stack of forms, and got a card in the mail six weeks later.|and the caseworker was kinder than you expected.} It was there when you needed it.") },
          { id: "h_aca.partner", label: "Get on your partner's plan", hint: "through their job", act: "insurance", style: "family", weight: 0.15, when: married, apply: set("partner", `You got on ${s.partner ? s.partner.call : "your partner"}'s health plan from work, {and you both read the benefits booklet in bed like a mystery novel.|and the paperwork took one evening.}`) },
          { id: "h_aca.none", label: "Go without", hint: "you're healthy, probably", act: "avoid", style: "risk", weight: 0.15, apply: set("none", s.year <= 2018 ? "You went without health insurance and paid the tax penalty instead, hoping nothing happened. Nothing did, that year." : "You went without health insurance, hoping nothing happened. Nothing did, that year, and you knew you had been lucky.", 0) },
        ],
      };
    },
  },
  {
    id: "h_medicalBill", domain: "wealth", channel: "bad", ages: [18, 90], cooldown: 10, max: 2, when: s => s.year >= 1985 && usHome(s), p: () => 0.015,
    choice: (s, ctx) => {
      const what = ctx.rng.pick(["an emergency room visit for a sprained wrist", "an ambulance ride across town", "a routine blood test", "an X-ray of a toe that turned out fine"]);
      const amount = s.year < 1995 ? "$800" : s.year < 2010 ? "$1,900" : "$3,200";
      return {
        prompt: `A bill came for ${what}: ${amount}, because something was “out of network.” What do you do?`,
        options: [
          { id: "h_medicalBill.call", label: "Call and ask for an itemized bill", hint: "politely, and often", act: "negotiate", style: "social", weight: 0.3, apply: (s2, c) => { const ok = c.roll("wealth", "good", 0.6); spend(s2, ok ? 0.01 : 0.05); return { text: ok ? c.w(`You called about the ${amount} bill for ${what}, asked for every line item, and {found two charges for the same thing.|talked to a supervisor named Linda, who knocked off two-thirds.} You paid the rest.`) : `You called about the ${amount} bill for ${what}, spent four hours on hold over three weeks, and got it reduced a little.`, mood: ok ? 2 : -2 }; } },
          { id: "h_medicalBill.plan", label: "Set up a payment plan", hint: "fifty dollars a month", act: "borrow", style: "safe", weight: 0.2, apply: s2 => { owe(s2, 0.04); return { text: `You set up a payment plan for the ${amount} bill for ${what}, fifty dollars a month, and checked off each payment on the calendar.`, mood: -1 }; } },
          { id: "h_medicalBill.pay", label: "Just pay it", hint: "make it go away", act: "save", style: "safe", weight: 0.2, apply: s2 => { spend(s2, 0.05); return { text: `You paid the ${amount} bill for ${what} and grumbled about it for a year.`, mood: -2 }; } },
          { id: "h_medicalBill.appeal", label: "Appeal to the insurance company", hint: s.year >= 2022 ? "the new law is on your side" : "a letter and a lot of patience", act: "dispute", style: "learn", weight: 0.2, apply: (s2, c) => { const ok = c.roll("wealth", "good", s2.year >= 2022 ? 0.8 : 0.45); if (!ok) spend(s2, 0.04); return { text: ok ? `You appealed the ${amount} bill for ${what} ${s2.year >= 2022 ? "under the new surprise-billing law" : "with a three-page letter"}, and the insurance company paid it.` : `You appealed the ${amount} bill for ${what}, were denied, appealed again, and paid part of it in the end.`, mood: ok ? 3 : -2 }; } },
          { id: "h_medicalBill.ignore", label: "Put it in a drawer", hint: "maybe it goes away", act: "avoid", style: "risk", weight: 0.1, apply: s2 => { owe(s2, 0.06); return { text: `You put the ${amount} bill for ${what} in a drawer, and it went to collections, and the phone calls started.`, mood: -4 }; } },
        ],
      };
    },
  },
  {
    id: "h_cobra", domain: "wealth", channel: "bad", ages: [22, 64], cooldown: 6, max: 2, when: s => s.year >= 1986 && s.unemployedFor >= 1 && !s.retired && !s.studying && usHome(s), p: () => 0.2,
    choice: (s, ctx) => {
      const lead = scene(ctx, ["Out of work, you got a thick envelope offering to keep your old health plan, at the full price.", "Your health insurance ended with the job, and you have sixty days to decide what to do.", "Between jobs, you're doing the math on health insurance at the kitchen table."]);
      const set = (how, text, mood = 0) => (s2, c) => { s2.flags.insurance = how; return { text: c.w(text), mood }; };
      return {
        prompt: `${lead} What do you do for coverage?`,
        options: [
          { id: "h_cobra.cobra", label: "Keep the old plan through COBRA", hint: "same doctors, the full premium", act: "insurance", style: "safe", weight: 0.3, apply: (s2, c) => { spend(s2, 0.12); return set("cobra", "Between jobs, you kept your old health plan through COBRA, {and the monthly bill was a shock.|which cost more than your car payment.} At least the doctors stayed the same.", -1)(s2, c); } },
          { id: "h_cobra.market", label: "A marketplace plan", hint: "cheaper, with a subsidy", act: "insurance", style: "learn", weight: 0.2, when: s2 => s2.year >= 2014 && s2.year <= 2035, apply: (s2, c) => { spend(s2, 0.04); return set("silver", "Between jobs, you found a marketplace plan with a subsidy {for a lot less than COBRA.|in one long evening at the computer.}")(s2, c); } },
          { id: "h_cobra.partner", label: "Get on your partner's plan", hint: "a job loss counts as a life event", act: "insurance", style: "family", weight: 0.2, when: married, apply: set("partner", "Between jobs, you got onto your partner's health plan at work, {and the HR lady walked you through it.|which took one form and a lot of gratitude.}", 1) },
          { id: "h_cobra.short", label: "A cheap short-term plan", hint: "covers the big stuff, maybe", act: "insurance", style: "risk", weight: 0.15, apply: (s2, c) => { spend(s2, 0.03); return set("short", "Between jobs, you bought a cheap short-term health plan {and read the fine print once, then decided not to read it again.|and hoped you'd never need it.}")(s2, c); } },
          { id: "h_cobra.none", label: "Go without until the next job", hint: "a few months, fingers crossed", act: "avoid", style: "risk", weight: 0.15, apply: set("none", "Between jobs, you went without health insurance and were very careful on ladders until the next job came through.", -1) },
        ],
      };
    },
  },
  A("h_hsa", [25, 60], 0.02, [
    "Your job switched to a high-deductible health plan with a savings account, {and a debit card that only buys Band-Aids and cough syrup.|and you learned more about deductibles than you ever wanted.}",
    "Open enrollment came with a forty-page booklet, and {you picked the same plan as last year without reading it.|you made a spreadsheet, which your coworkers then borrowed.}",
    "Your health savings account {grew quietly for years, like a little emergency fund for your body.|paid for your new glasses, which felt like free money.}",
  ], { mood: 0, domain: "wealth", channel: "change", when: s => s.year >= 2005 && s.employed && usHome(s) }),
  {
    id: "h_therapy", domain: "health", channel: "change", ages: [18, 85], cooldown: 8, max: 2, p: s => 0.012 + ((s.health.stress ?? 0.3) > 0.5 ? 0.02 : 0) + (s.age - Math.max(s.last.divorce ?? -9, s.last.fatherDeath ?? -9, s.last.motherDeath ?? -9) <= 1 ? 0.04 : 0),
    choice: (s, ctx) => {
      const f = faithOf(s, ctx), clergy = { christian: "your pastor", jewish: "your rabbi", muslim: "the imam", hindu: "a priest at the temple" }[f] || null;
      const grief = s.age - Math.max(s.last.fatherDeath ?? -9, s.last.motherDeath ?? -9) <= 1, split = s.age - (s.last.divorce ?? -9) <= 1;
      const lead = scene(ctx, [
        "Lately a heavy gray feeling follows you around, and the things you used to love feel like chores.",
        "Your heart races in the grocery store for no reason, and you have started avoiding crowds.",
        grief ? "Since your parent died, you can't seem to get your feet under you." : null,
        split ? "Since the divorce, the evenings are very long." : null,
        "You snap at everyone, and you don't recognize yourself.",
      ]);
      const therapist = s.year < 1985 ? "See a psychologist, even if nobody talks about it" : s.year >= 2020 && s.year <= 2035 ? "Find a therapist online" : "See a therapist";
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "h_therapy.therapist", label: therapist, hint: "a professional", act: "counsel", style: "health", weight: 0.3, apply: (s2, c) => { stress(s2, -0.15); s2.flags.therapy = s2.flags.therapy ?? s2.age; return { text: c.w(`You started seeing ${s2.year < 1985 ? "a psychologist, and didn't tell anyone at work" : "a therapist"}, {every Thursday at five,|on video from your car on your lunch break,|in an office with a box of tissues on every table,} {and slowly the gray lifted.|and learned names for things you had felt for years.|and it was the best money you ever spent.}`), mood: 4 }; } },
          { id: "h_therapy.friend", label: "Tell a friend the truth", hint: "say it out loud", act: "talk", style: "social", weight: 0.25, apply: (s2, c) => { stress(s2, -0.08); return { text: c.w("You told {friend} the truth about how you had been feeling, {and heard back, “Me too, last year.”|and you talked until the coffee went cold.} Saying it out loud helped more than you expected."), mood: 3 }; } },
          { id: "h_therapy.faith", label: clergy ? `Talk to ${clergy}` : "Find a support group", hint: clergy ? "someone who listens for a living" : "people in the same boat", act: clergy ? "spiritual" : "seekHelp", style: "family", weight: 0.15, apply: (s2, c) => { stress(s2, -0.08); return { text: c.w(clergy ? `You talked to ${clergy}, {who listened for an hour and then prayed with you.|who knew a good counselor and gave you the number.}` : "You found a support group that met at the library on Tuesdays, {and heard your own story in other people's mouths.|and kept going long after you needed to.}"), mood: 3 }; } },
          { id: "h_therapy.move", label: "Exercise and a journal", hint: "move the body, empty the head", act: "exercise", style: "self", weight: 0.15, apply: (s2, c) => { stress(s2, -0.05); hr(s2, 0.995); return { text: c.w("You started walking every morning and writing a page every night, {and it didn't fix everything, and it helped.|and three notebooks later, you felt like yourself again.}"), mood: 2 }; } },
          { id: "h_therapy.push", label: "Push through it", hint: "it'll pass", act: "pushThrough", style: "risk", weight: 0.15, apply: s2 => { stress(s2, 0.08); return { text: "You decided to push through the heavy feeling on your own. It lifted, slowly, after a long season you don't talk about much.", mood: -2 }; } },
        ],
      };
    },
  },
  A("h_mentalHealthDay", [22, 64], 0.02, [
    "You took a mental health day and {did absolutely nothing, which was the point.|walked by the river for three hours.|turned your phone off and slept until ten.}",
    "Your boss told the team to take a mental health day after the big project, and {you spent it at the movies alone, in the middle of a Tuesday.|you finally cleaned out your inbox, which you regretted.}",
    "You called in for a day just for your head, {and came back the next morning lighter.|and nobody at work even blinked.}",
  ], { mood: 2, domain: "health", channel: "good", when: s => s.year >= 2016 && s.employed, fx: s => stress(s, -0.05) }),
  A("h_vaClinic", [25, 95], 0.05, [
    "At the VA clinic {the wait was long, and the nurse who finally called your name remembered your unit.|you sat with other veterans and swapped stories older than the magazines.}",
    "The VA {took care of your hearing aids, your knee and your paperwork, slowly.|called to check on you, which surprised you.}",
    "Your VA doctor {had served too, and that made the conversation easier.|knew your service record better than you did.}",
  ], { mood: 1, domain: "health", channel: "change", when: s => !!s.flags.served && !(s.job && s.job.field === "military") && usHome(s) }),

  // ---------- the dentist, shots and screenings ----------
  {
    id: "h_dentist", domain: "health", channel: "bad", ages: [18, 88], cooldown: 10, max: 2, p: () => 0.015,
    apply: (s, ctx) => {
      spend(s, 0.02);
      return { text: ctx.w(["You hadn't been to the dentist in four years, and {the hygienist was very polite about it.|you needed two fillings and a lecture.}", "You needed a root canal, {which was not as bad as the movies say.|and the dentist talked about his boat the whole time.} {The crown cost about as much as a vacation.|You chewed on the other side for a month.}", `At your cleaning the hygienist {asked if you floss, and you lied, and she knew.|praised your gums, and you told everyone.|showed you a picture of your teeth you didn't need to see.}`]), mood: -1 };
    },
  },
  A("h_flushot", [18, 95], 0.015, s => [
    s.year >= 2009 ? "You got your flu shot at the pharmacy {while waiting for a prescription,|on the way home from work,} {and your arm was sore for a day.|and they gave you a coupon, which felt like a prize.}" : "You got the free flu shot at work, {in a line in the break room,|from a nurse with a cart,} {and your arm was sore for a day.|and bragged about it all winter.}",
    "You skipped the flu shot this year and got the flu, {and spent a week in bed hearing everyone say “Did you get your shot?”|and learned your lesson, for a while.}",
    "Flu season came, and {you got the shot and dodged it, while the whole office went down.|your doctor gave you the high-dose one, which made you feel old and safe.}",
  ], { mood: 0, domain: "health", channel: "change", when: s => s.year >= 1985 }),
  // People 65 and older were among the first offered the vaccine (early 2021); era.js e_2021vaccine tells most lives'
  // shot, so this is for those it did not.
  A("h_covidSenior", [65, 110], 0.6, [
    "Your age put you near the front of the line for the COVID vaccine, {and your grandkid spent an hour on the computer to get you an appointment.|and you got the shot at the senior center, then sat for fifteen minutes and cried with relief.}",
    "You got the COVID vaccine {in a stadium parking lot without leaving your car|at the pharmacy,} and {the first thing you did after the second dose was hug your family.|you went to the grocery store yourself for the first time in a year.}",
    "When the vaccine came, {your doctor's office called you first,|a neighbor drove you to the clinic,} and {you wore a sticker saying so all day.|you planned a family dinner for the week after.}",
  ], { mood: 4, domain: "health", channel: "good", when: s => s.year === 2021 && !s.done.has("e_2021vaccine") && usHome(s) }),
  {
    id: "h_booster", once: true, domain: "health", channel: "change", ages: [18, 100], when: s => s.year >= 2022 && s.year <= 2025 && usHome(s), p: () => 0.25,
    choice: (s, ctx) => ({
      prompt: `${scene(ctx, ["The pharmacy texted that the updated COVID booster is in.", "Your doctor's office says the new COVID shot is available, along with the flu shot.", "The holidays are coming, and the family is talking about COVID boosters at the group dinner."])} What do you do?`,
      options: [
        { id: "h_booster.both", label: "Get it with your flu shot", hint: "one arm each", act: "seeDoctor", style: "health", weight: 0.35, apply: (s2, c) => ({ text: c.w("You got the updated COVID booster and your flu shot at the same visit, one in each arm, {and both arms were sore the next day.|and spent the evening on the couch feeling noble.}"), mood: 0 }) },
        { id: "h_booster.holidays", label: "Before the holidays", hint: "for the family gathering", act: "seeDoctor", style: "family", weight: 0.15, apply: () => ({ text: "You got the COVID booster a few weeks before the holidays, so you could hug everyone at the big family dinner without worrying.", mood: 1 }) },
        { id: "h_booster.ask", label: "Ask your doctor first", hint: "what's right for you", act: "seeDoctor", style: "safe", weight: 0.2, apply: () => ({ text: "You asked your doctor about the COVID booster, talked through it at your next visit and did what fit you.", mood: 0 }) },
        { id: "h_booster.skip", label: "Skip this one", hint: "you've had enough shots", act: "wait", style: "self", weight: 0.3, apply: () => ({ text: "You skipped this round of the COVID booster. You'd had enough shots for a while.", mood: 0 }) },
      ],
    }),
  },
  A("h_covidMild", [8, 95], 0.2, [
    "After two years of dodging it, you finally got COVID, {and spent a rough week on the couch watching every season of a show.|and couldn't taste your coffee for a month.|and the whole house got it in a row, like dominoes.}",
    "You tested positive for COVID {the day before a family trip,|right after a wedding,} and {isolated in the bedroom with trays left at the door.|felt like a bad cold and lost a week.}",
    "COVID finally found you, {and it was mild, mostly a fever and a lot of sleeping.|and you were grateful it was only a rough week.}",
  ], { mood: -2, domain: "health", channel: "bad", when: s => s.year >= 2022 && s.year <= 2023 && !s.health.serious }),
  A("h_covidTest", [14, 95], 0.15, [
    "The free COVID tests came in the mail from the government, {and you used one before every family visit.|and you kept them in the junk drawer next to the batteries.}",
    "You swabbed your nose for a home COVID test {and stared at the little window for fifteen minutes.|and the faint second line set off a family debate.}",
    "Home COVID tests became part of life: {one before every party,|a box in every bathroom,} {and a sigh of relief at every single line.|and the swab still made you sneeze.}",
  ], { mood: 0, domain: "health", channel: "change", when: s => s.year === 2022 && usHome(s) }),
  A("h_colonoscopy", [45, 56], s => (s.age >= (s.year >= 2021 ? 45 : 50) ? 0.15 : 0), [
    "You had your first colonoscopy, {and the prep the night before was far worse than the test.|and woke up to a nurse saying “All clear, see you in ten years.”|and slept for the rest of the afternoon.}",
    "Your doctor said it was time for the screening everyone jokes about, {and you survived the prep with a lot of lemon gelatin.|and you made your sister promise to schedule hers too.}",
    "The colonoscopy came back clean, {and you celebrated with the biggest breakfast of your life.|and you went home and told everyone in far too much detail.}",
  ], { mood: 1, domain: "health", channel: "good", when: s => s.year >= 1995 && usHome(s) }),
  A("h_screening", [40, 70], 0.03, s => [
    s.sex === "female" ? "You went for a mammogram {and held your breath for the results.|and it came back clear.} {You put next year's on the calendar.|You reminded every woman you know to schedule hers.}" : "Your doctor ran the screening tests for a man your age, {and they came back clear.|and you held your breath for a week, and it was fine.}",
    "A routine screening found {nothing, which is the best thing a test can find.|a little something to watch, and the follow-up was clear.}",
    "You did the screening your doctor recommended and {the letter said “normal,” which you read three times.|you took yourself out for pie afterward.}",
  ], { mood: 1, domain: "health", channel: "good", when: s => s.year >= 1985 && usHome(s) }),
  A("h_shingles", [50, 90], 0.03, s => [
    s.year >= 2018 ? "You got the two-shot shingles vaccine, {and your arm felt like you had been punched for a day.|which knocked you out for an afternoon.} {Your friend who had shingles told you it was worth it.|You checked it off the list.}" : "You got the shingles shot, {and your arm was sore and you were glad anyway.|at the pharmacy, after your neighbor told you about her bout of shingles.}",
    "Your doctor said you're old enough for the shingles vaccine now, and {you took it like a champ.|you went the same week.}",
    "After a friend's miserable case of shingles, you got the vaccine {and spent the afternoon on the couch with a heating pad.|without a second thought.}",
  ], { mood: 0, domain: "health", channel: "good", when: s => s.year >= 2006 && usHome(s) }),
];
