// The times: US history from 1950 to 2025 as it touched an ordinary family, told by your age that year, where you
// lived and what you did. The same year reads differently at 7, at 17 and at 47.
//
// Each event happens at most once, in its own year (`years`), with p = 1 when everyone lived through it or a share
// when only some did; regional ones are gated by state when the state is known. Only well-known dates are used, and the
// wording stays with what a person saw at home, at school or at work: the TV in the living room, the line at the gas
// station. No opinions about politics. These events change mood and a little money, and a few choices (the draft,
// the 2008 foreclosures) change a little more, as history did.
import { enlist, inService } from "./core.js";
import { cap, scene, parentWord, olderSibs, sibName, isBrother, inStates } from "./common.js";

// When the event can happen: that calendar year, an age range, at home in the US, and an extra condition.
const at = (year, ages, more = () => true) => s => s.year === year && s.age >= ages[0] && s.age <= ages[1] && !s.abroad && more(s);
const field = s => (s.job ? s.job.field : "");
// A short event: id, year, ages, chance, the line (a function of s and ctx), and extra fields.
const E = (id, year, ages, p, line, more = {}) => ({ id, once: true, years: [year, year], ages, when: at(year, ages, more.when), p: typeof p === "function" ? p : () => p, apply: line, ...(more.domain ? { domain: more.domain, channel: more.channel } : {}) });

// The draft lottery: the year each birth cohort's numbers were drawn, and the highest number called up from it.
// Men born 1950 were drawn on December 1, 1969 and called through 195 in 1970; 1951 on July 1, 1970 (125, in 1971);
// 1952 on August 5, 1971 (95, in 1972); 1953 on February 2, 1972, but inductions ended before any were called.
const LOTTERY = { 1950: [1969, 195], 1951: [1970, 125], 1952: [1971, 95], 1953: [1972, 0] };

export const ERA = [
  // ---------- the 1950s and early 1960s ----------
  {
    id: "e_korea", once: true, years: [1950, 1953], ages: [0, 3], when: s => s.year >= 1950 && s.year <= 1953 && s.father.alive && !s.abroad, p: () => 0.12,
    apply: (s, ctx) => ({ text: ctx.w(["Your father was overseas in Korea for part of your first years. {Your mother held you up to his photo on the mantel every night.|He came home to a toddler who hid behind your mother's skirt.}", "Dad shipped out to Korea when you were small, and {his letters came on thin blue airmail paper.|you met him properly at the train station when he came home.}"]), mood: -1 }),
  },
  {
    // TV went from about 9 % of homes in 1950 to 87 % in 1960.
    id: "e_firstTV", once: true, years: [1950, 1962], ages: [2, 12], when: s => s.year >= 1950 && s.year <= 1962 && !s.abroad, p: s => (s.year < 1955 ? 0.15 : 0.3),
    apply: (s, ctx) => ({ text: ctx.w(["Your family bought its first television, a wooden console with a screen the size of a lunchbox. {The whole block came over to watch.|You sat so close that your mother said your eyes would go square.}", "The TV arrived in a big box, and {you watched the test pattern just because you could.|Dad spent an hour on the roof turning the antenna while you yelled “Better! Worse!” through the window.}", "The day the television came, {you skipped dinner to watch Howdy Doody.|your grandmother refused to change her dress in front of it, in case it could see her.}"]), mood: 4 }),
  },
  E("e_1955polio", 1955, [2, 12], 0.8, (s, ctx) => ({ text: ctx.w(["The new polio vaccine came out, and {you lined up at school for the shot with your whole class.|your mother cried with relief when you got it.} {You got a lollipop after.|The summer pools opened again without everyone holding their breath.}", "That spring the Salk vaccine arrived, and your parents finally stopped worrying every time you ran a fever in July."]), mood: 2 })),
  {
    id: "e_duckCover", once: true, years: [1955, 1963], ages: [6, 12], when: s => s.year >= 1955 && s.year <= 1963 && s.studying && !s.abroad, p: () => 0.35,
    apply: (s, ctx) => ({ text: ctx.w(["At school you practiced “duck and cover,” crouching under your desk with your hands over your neck, {and the boy next to you giggled the whole time.|and that night you asked your father what it was for.}", "The siren tested every month, and {you practiced crawling under the desk.|your teacher marched the class to the basement shelter with the yellow sign.}"]), mood: -1 }),
  },
  E("e_1957sputnik", 1957, [5, 12], 0.5, (s, ctx) => ({ text: ctx.w(["That October, the Russians put Sputnik in the sky, and {you stood in the backyard with your father trying to spot it.|your school suddenly wanted everyone to be good at science.}", "Sputnik went up, and {the grown-ups talked about it at every dinner.|you built a rocket out of a paper towel tube.}"]), mood: 1 })),
  E("e_1962sabin", 1962, [0, 12], 0.6, (s, ctx) => ({ text: ctx.w(["On “Sabin Sunday” you got the polio vaccine on a sugar cube {at the elementary school gym.|and asked if you could have another.}", "The family stood in line at the school for the oral polio vaccine, {a pink drop on a sugar cube.|and you thought it was candy.}"]), mood: 1 })),
  E("e_1962cuba", 1962, [6, 12], 0.6, (s, ctx) => ({ text: ctx.w(["For thirteen days that October, the grown-ups watched the news about Cuba and spoke in low voices. {Your father filled jugs of water in the basement.|You prayed at bedtime without being told.}", "During the missile crisis your teacher was quiet and kind all week, {and when it was over she let the class have an extra recess.|and you didn't understand why until much later.}"]), mood: -2 })),
  E("e_1963jfk", 1963, [5, 13], 0.9, (s, ctx) => ({ text: ctx.w(["On November 22, the principal came over the loudspeaker: President Kennedy had been shot. {Your teacher put her head down on her desk.|School let out early, and the bus was silent all the way home.}", "The day President Kennedy died, {your mother was crying at the ironing board when you got home.|the TV stayed on all weekend, and nobody changed the channel.}"]), mood: -4 })),
  E("e_1964beatles", 1964, [7, 14], 0.55, (s, ctx) => ({ text: ctx.w(["On a Sunday night in February, the Beatles played on The Ed Sullivan Show. {You and your sister screamed at the TV.|Your father said it was just noise and tapped his foot anyway.|The next morning, every boy at school was trying to comb his hair forward.}", "You watched the Beatles on Ed Sullivan with the whole family, {and spent your allowance on a record that week.|and played air guitar on a tennis racket for a month.}"]), mood: 4 })),
  {
    // An older brother drafted during the Vietnam years (inductions ran heavily 1965–1972).
    id: "e_brotherDrafted", once: true, years: [1965, 1972], ages: [3, 17], when: s => s.year >= 1965 && s.year <= 1972 && !s.abroad && olderSibs(s).some(x => isBrother(x) && s.age - x.bornAt >= 19 && s.age - x.bornAt <= 24), p: () => 0.15,
    apply: (s, ctx) => {
      const b = sibName(olderSibs(s).find(x => isBrother(x) && s.age - x.bornAt >= 19 && s.age - x.bornAt <= 24));
      return { text: ctx.w([`${cap(b)} got his draft notice. {The family drove him to the bus station, and your mother waved until the bus was gone.|He came home on leave once with a buzz cut and a duffel bag, and let you wear his cap.}`, `${cap(b)} was drafted, and {you wrote him a letter every week in your best handwriting.|his letters home were short and always asked about you.} Two years later he came back quieter than he left.`]), mood: -3 };
    },
  },
  E("e_1968king", 1968, [8, 18], 0.5, (s, ctx) => ({ text: ctx.w(["In April, when Dr. Martin Luther King Jr. was killed, {your parents sat in front of the TV for a long time and your mother held your hand.|your teacher talked to the class about what he had stood for, and nobody fidgeted.}", "The week Dr. King died, {church was full on Sunday, and the pastor's voice broke.|you heard his “I Have a Dream” speech for the first time, all the way through, on the radio.}"]), mood: -3 })),
  {
    id: "e_1969moon", once: true, years: [1969, 1969], ages: [0, 19], when: at(1969, [0, 19]), p: () => 1,
    apply: (s, ctx) => ({ text: s.age < 4 ? ctx.w("On July 20, 1969, {your parents held you up to the TV|your mother woke you from your nap} to watch a man walk on the moon. You don't remember it; they never forgot it.") : s.age < 13 ? ctx.w(["On July 20, 1969, you stayed up past your bedtime to watch Neil Armstrong step onto the moon. {Your dad said, “Remember this.” You did.|You went outside afterward and stared up at the moon like it might wave.}", "The moon landing: {the whole family crowded around the TV,|the neighbors came over with lawn chairs,} and when Armstrong stepped down, {your grandfather, who remembered horse carts, cried.|you decided to be an astronaut.}"]) : ctx.w(["You watched the moon landing {with friends in somebody's basement,|on a fuzzy TV at the drive-in|with your whole family}, and for a minute everyone in the country was looking at the same thing.", "When Armstrong stepped onto the moon, {you ran outside and looked up.|you were working a summer job, and the manager let everyone stop to watch.}"]), mood: 5, big: s.age >= 6 }),
  },
  {
    // The Vietnam draft lottery, for men of the 1950–1953 birth years, in the year their numbers were drawn.
    id: "e_draftLottery", once: true, years: [1969, 1972], ages: [18, 22], when: s => s.sex === "male" && LOTTERY[s.birthYear] && s.year === LOTTERY[s.birthYear][0] && !s.abroad && !inService(s), p: () => 1,
    apply: (s, ctx) => {
      const [, ceiling] = LOTTERY[s.birthYear], n = 1 + ctx.rng.int(366);
      s.flags.draftNumber = n;
      const watched = ctx.rng.pick(["You listened to the drawing on the radio with your friends", "The whole family watched the drawing on TV", "You heard your number read at the dorm, crowded around a radio"]);
      if (ceiling === 0) return { text: `${watched}: your birthday came up number ${n}. As it turned out, the draft ended before anyone from your year was called.`, mood: 1 };
      if (n > ceiling) return { text: ctx.w(`${watched}: number ${n}. {Your mother sat down on the kitchen floor with relief.|You let out a breath you had been holding for a year.} Your number would never be called.`), mood: 4, big: true };
      s.flags.draftLow = s.year + 1;
      return { text: ctx.w(`${watched}: number ${n}. {The room went quiet.|Your father put a hand on your shoulder and left it there.} A number that low would be called next year.`), mood: -8, big: true };
    },
  },
  {
    // A low number: the year it was called.
    id: "e_draftCall", once: true, years: [1970, 1972], ages: [19, 23], when: s => s.flags.draftLow === s.year && !s.abroad && !inService(s), p: () => 1,
    choice: (s, ctx) => {
      const student = s.studying && s.year <= 1971;
      const lead = scene(ctx, [
        "Your draft notice came in the mail, in a plain envelope from the Selective Service.",
        `Your number was called. ${s.studying ? "Your student deferment is running out." : "You have thirty days to report."}`,
        `The letter from the draft board was on the kitchen table when you got home, and ${parentWord(s, ctx)} had not opened it.`,
      ]);
      const branch = ctx.rng.pick(["Navy", "Air Force"]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you answer it?"])}`,
        options: [
          { id: "e_draftCall.report", label: "Report for induction", hint: "two years in the Army", act: "pushThrough", style: "safe", weight: 0.5, apply: (s2, c) => {
            enlist(s2, c, "Army", 2); s2.flags.drafted = true; s2.studying = false;
            const nam = c.rng() < 0.35;
            return { text: nam ? c.w("You reported for induction and, after basic training, got orders for Vietnam. {You wrote home every week and never told them the hard parts.|You came home a year later and didn't talk about it for a long time.}") : c.w(`You reported for induction and served two years in the Army, {stationed in West Germany.|at a base in Texas, mostly typing forms.|in Korea, guarding a very quiet stretch of the border.}`), mood: -4, big: true };
          } },
          { id: "e_draftCall.enlist", label: `Enlist in the ${branch} first`, hint: "four years, more choice", act: "workAbroad", style: "risk", weight: 0.2, apply: (s2, c) => { enlist(s2, c, branch, 4); s2.studying = false; return { text: c.w(`Before the Army could take you, you enlisted in the ${branch} for four years, {and learned to fix jet engines.|and spent most of it on a ship in the Pacific.}`), mood: -2, big: true }; } },
          { id: "e_draftCall.guard", label: "Try for the National Guard", hint: "the waiting lists are long", act: "seekHelp", style: "safe", weight: 0.12, apply: (s2, c) => {
            if (c.rng() < 0.5) { s2.flags.guard = true; return { text: "You got one of the last spots in the National Guard: six years of weekend drills and two weeks every summer.", mood: 1 }; }
            enlist(s2, c, "Army", 2); s2.flags.drafted = true; s2.studying = false;
            return { text: "The National Guard waiting list was hundreds of names long, and your induction date came first. You served two years in the Army.", mood: -4, big: true };
          } },
          { id: "e_draftCall.defer", label: student ? "Keep your student deferment" : "Apply for a hardship deferment", hint: student ? "stay in school" : "your family needs you", act: "study", style: "learn", weight: 0.1, apply: (s2, c) => {
            if (c.roll("family", "good", 0.5)) return { text: student ? "You kept your student deferment, and by the time you graduated the draft was over." : "The draft board granted a hardship deferment, and the draft ended before they asked again.", mood: 3 };
            enlist(s2, c, "Army", 2); s2.flags.drafted = true; s2.studying = false;
            return { text: "The draft board turned down your deferment. You served two years in the Army.", mood: -4, big: true };
          } },
          { id: "e_draftCall.co", label: "Apply as a conscientious objector", hint: "two years of civilian service", act: "insist", style: "self", weight: 0.05, apply: (s2, c) => { s2.flags.co = true; return { text: c.w("You applied as a conscientious objector, {wrote pages about what you believed,|sat before the draft board in your only suit,} and spent two years in alternative service as an orderly at a hospital."), mood: 0 }; } },
          { id: "e_draftCall.canada", label: "Go to Canada", hint: "leave everything behind", act: "emigrate", style: "risk", weight: 0.03, apply: s2 => { s2.abroad = "Canada"; s2.leftAt = s2.age; s2.flags.backAt = s2.age + Math.max(2, 1977 - s2.year); s2.studying = false; return { text: "You packed one bag and drove north to Canada. You did not see your parents for years; after the 1977 pardon, you came home.", mood: -6, big: true }; } },
        ],
      };
    },
  },

  // ---------- the 1970s ----------
  E("e_1970earthDay", 1970, [6, 20], 0.35, (s, ctx) => ({ text: ctx.w(["On the first Earth Day, {your class planted a tree behind the school.|you picked up trash along the creek with your scout troop.|you made a poster with a crying globe on it.}", "Earth Day, 1970: {your teacher brought in a sapling in a coffee can.|you made your father promise to stop throwing cans out the car window.}"]), mood: 2 })),
  E("e_1974nixon", 1974, [10, 24], 0.4, (s, ctx) => ({ text: ctx.w(["In August, President Nixon resigned on TV, and {your parents watched without saying much.|your history teacher called it a day you'd tell your kids about.}", "You watched Nixon's helicopter lift off the White House lawn on the evening news{, and your father turned the set off without a word.|.}"]), mood: -1 })),
  {
    // The oil embargo: gas lines, odd–even days, the 55 mph limit.
    id: "e_1974gas", once: true, years: [1974, 1974], ages: [3, 24], when: at(1974, [3, 24]), p: () => 0.7,
    apply: (s, ctx) => {
      if (s.age < 16) return { text: ctx.w(["That winter you sat in the back seat for an hour in a gas line that wrapped around the block, {doing homework on your knees.|playing the license plate game with your brother.}", "With the oil crisis, {the thermostat was set to 65 and your mother handed out sweaters.|your family only filled up on odd-numbered days, because of your license plate.}"]), mood: -1 };
      s.savings = Math.max(0, s.savings - 0.03);
      return { text: ctx.w(["The oil embargo hit, and you waited in gas lines {before work|on Saturday mornings} with a thermos of coffee, {only on the days your license plate allowed.|while the price went up every week.}", "Gas doubled, the speed limit dropped to 55, and {you started carpooling.|your first car suddenly felt very expensive.}"]), mood: -2 };
    },
  },
  E("e_1976bicentennial", 1976, [3, 26], 0.6, (s, ctx) => ({ text: ctx.w(["For the Bicentennial, {the fire hydrants on your street were painted like little soldiers,|your town held its biggest parade ever,|you wore a tricorn hat to school,} and the fireworks on the Fourth were the best you ever saw.", "July 4, 1976, two hundred years: {the whole town picnicked in the park,|you watched the tall ships on TV,} and {you ate a slice of a cake shaped like a flag.|everyone sang “America the Beautiful” in the dark.}"]), mood: 3 })),
  E("e_1977starWars", 1977, [5, 27], 0.5, (s, ctx) => ({ text: ctx.w(["Star Wars came out, and {you saw it four times that summer.|the line wrapped around the theater twice.|you came home and made a lightsaber out of a wrapping-paper tube.}", "You saw Star Wars at the drive-in, {and the whole lot honked when the Death Star blew.|and talked about nothing else for a month.}"]), mood: 4 })),
  {
    id: "e_1979gas", once: true, years: [1979, 1979], ages: [16, 29], when: at(1979, [16, 29]), p: () => 0.35,
    apply: (s, ctx) => { s.savings = Math.max(0, s.savings - 0.02); return { text: ctx.w(["The gas lines were back that summer, and {you got up at five to beat them.|you ran out of gas waiting in one, and three strangers pushed your car to the pump.}", "Gas prices jumped again, and {you traded the big car for a little Japanese one.|you started riding your bike to work.}"]), mood: -2 }; },
  },
  E("e_1980helens", 1980, [3, 30], 0.8, (s, ctx) => ({ text: ctx.w(["When Mount St. Helens blew in May, {gray ash fell on your town like snow, and everyone wore masks to the store.|you heard the boom from a hundred miles away.} {You kept a jar of the ash for years.|The cars all had ash on the windshields for weeks.}"]), mood: -2 }), { when: s => inStates(s, ["WA", "OR", "ID"]) }),

  // ---------- the 1980s ----------
  E("e_1981mtv", 1981, [9, 25], 0.4, (s, ctx) => ({ text: ctx.w(["MTV came on the air, and {you watched music videos for six hours straight.|you begged your parents for cable.|your friend's house, which had cable, became the place to be.}", "The first video MTV ever played was “Video Killed the Radio Star,” and {you could not stop humming it.|your radio suddenly looked very old.}"]), mood: 3 })),
  {
    // A family's first home computer: Commodore 64, Apple IIe, IBM PC; later a beige tower.
    id: "e_firstPC", once: true, years: [1982, 1996], ages: [5, 60], when: s => s.year >= 1982 && s.year <= 1996 && !s.abroad, p: s => (s.year < 1988 ? 0.04 : 0.08),
    apply: (s, ctx) => {
      const pc = s.year < 1987 ? ctx.rng.pick(["a Commodore 64", "an Apple IIe", "an IBM PC with a green screen"]) : ctx.rng.pick(["a beige tower with a Windows sticker", "a Macintosh", "a Gateway computer that came in a cow-spotted box"]);
      return { text: s.age < 18 ? ctx.w(`Your family got its first computer: ${pc}. {You learned to type by playing Oregon Trail, and your whole party died of dysentery.|You typed in a program from a magazine and it actually worked.|You fought your siblings for computer time.}`) : ctx.w(`You bought your first computer, ${pc}, {and spent a weekend learning what a floppy disk was for.|and the kids figured it out before you did.|and kept the manual in a plastic sleeve.}`), mood: 3 };
    },
  },
  E("e_1984olympics", 1984, [6, 30], 0.3, (s, ctx) => ({ text: ctx.w(["You watched the Los Angeles Olympics every night that summer, {and did gymnastics on the living room carpet.|and wanted to be Carl Lewis, or Mary Lou Retton, or both.}"]), mood: 3 })),
  E("e_1985liveAid", 1985, [11, 34], 0.3, (s, ctx) => ({ text: ctx.w(["You watched Live Aid on TV all day in July, {and sang along to Queen at the top of your lungs.|and sent ten dollars to help feed people in Ethiopia.}"]), mood: 3 })),
  {
    id: "e_1986challenger", once: true, years: [1986, 1986], ages: [5, 36], when: at(1986, [5, 36]), p: s => (s.studying && s.age <= 17 ? 1 : 0.8),
    apply: (s, ctx) => ({ text: s.studying && s.age <= 17 ? ctx.w(["Your class watched the Challenger launch on a TV wheeled in on a cart, because a teacher, Christa McAuliffe, was aboard. {Then it was gone, and your teacher turned off the TV and didn't know what to say.|Nobody talked on the bus home.}", "The whole school watched the Challenger launch, and seventy-three seconds later {the room went silent.|your teacher sent everyone to recess, and nobody played.}"]) : ctx.w(["You heard about the Challenger at work, and {everyone gathered around a radio.|the office was quiet the rest of the day.} That night the president said they had “slipped the surly bonds of earth.”"]), mood: -4 }),
  },
  E("e_1987crash", 1987, [22, 37], 0.35, (s, ctx) => { s.savings *= 0.88; return { text: ctx.w(["On Black Monday the stock market fell 22 percent in one day, and {your retirement account took a gut punch.|you made yourself stop checking the paper.}"]), mood: -3 }; }, { when: s => s.savings >= 1 }),
  E("e_1989quake", 1989, [3, 39], 0.3, (s, ctx) => ({ text: ctx.w(["The Loma Prieta earthquake hit just before the World Series game in October, and {your house shook like a dog shaking off water.|the power was out for two days, and the neighbors grilled everything in their freezers.}"]), mood: -3 }), { when: s => inStates(s, ["CA"]) }),
  E("e_1989wall", 1989, [8, 39], 0.6, (s, ctx) => ({ text: ctx.w(["You watched people dancing on the Berlin Wall on the evening news, {and your father, who had worried about the Russians your whole life, just kept saying “Look at that.”|and your history teacher said the textbooks were already out of date.}", "The Berlin Wall came down, and {you stayed up watching people chip at it with hammers.|it felt like the whole world exhaled.}"]), mood: 3 })),

  // ---------- the 1990s ----------
  {
    id: "e_1991gulf", once: true, years: [1991, 1991], ages: [8, 41], when: at(1991, [8, 41]), p: s => (inService(s) ? 0.6 : 0.5),
    apply: (s, ctx) => ({ text: inService(s) ? ctx.w(["Your unit deployed to the Gulf for Desert Storm. {You spent most of it in the sand, waiting, and writing letters.|It was over in weeks, and you came home to yellow ribbons on every tree.}"]) : ctx.w(["The Gulf War played on CNN around the clock, {and yellow ribbons went up on the trees all down your street.|and your class wrote letters to soldiers in the desert.}"]), mood: -1 }),
  },
  E("e_1992andrew", 1992, [3, 42], 0.25, (s, ctx) => { s.savings = Math.max(0, s.savings - 0.1); return { text: ctx.w(["Hurricane Andrew tore through South Florida in August. {You rode it out in the bathtub under a mattress.|Your roof went, and so did half the trees on the street.} {For weeks the neighbors shared generators and ice.|The National Guard handed out water at the shopping center.}"]), mood: -6 }; }, { when: s => inStates(s, ["FL"]) }),
  E("e_1993flood", 1993, [8, 43], 0.25, (s, ctx) => ({ text: ctx.w(["The Great Flood of 1993 swelled the rivers for months, and {you filled sandbags at the levee until your arms gave out.|the water came up to the second step of the porch and stayed there.|your church turned into a shelter, and you served a lot of chili.}"]), mood: -4 }), { when: s => inStates(s, ["MO", "IA", "IL", "MN", "WI", "KS", "NE", "SD", "ND"]) }),
  E("e_1994northridge", 1994, [3, 44], 0.3, (s, ctx) => ({ text: ctx.w(["The Northridge earthquake woke you at 4:31 in the morning, {and everything in the kitchen cabinets ended up on the floor.|and you slept in the backyard for a week.}"]), mood: -3 }), { when: s => inStates(s, ["CA"]) }),
  E("e_1995okc", 1995, [5, 45], 0.6, (s, ctx) => ({ text: ctx.w(["In April a bomb destroyed the federal building in Oklahoma City. {The whole state lined up to give blood.|Your church held a vigil, and you lit a candle for the children in the day care.}"]), mood: -6 }), { when: s => inStates(s, ["OK"]) }),
  {
    // The early web: an AOL trial CD in the mail, the dial-up screech, a chat room.
    id: "e_web", once: true, years: [1995, 1999], ages: [8, 70], when: s => s.year >= 1995 && s.year <= 1999 && !s.abroad, p: () => 0.15,
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        "An AOL CD came in the mail promising 50 free hours. You got online, the modem screeched, and a voice said, “Welcome! You've got mail!”",
        `${s.age < 18 ? "Your family" : "You"} finally got the internet, dial-up through the phone line, so nobody could call while you were online.`,
        "At the library, a librarian showed you how to “surf the World Wide Web” on the one computer with Netscape.",
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do with it?", "What do you do first?"])}`,
        options: [
          { id: "e_web.chat", label: "Hang out in chat rooms", hint: "a/s/l?", act: "socialize", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w("You discovered chat rooms and {spent whole evenings talking to strangers about bands.|picked a screen name you would be embarrassed about later.|tied up the phone line until someone picked up the extension and yelled.}"), mood: 3 }) },
          { id: "e_web.page", label: "Build a homepage", hint: "GeoCities, animated GIFs", act: "hobby", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w("You built a homepage on GeoCities with {a spinning email icon, a guestbook and an “under construction” sign.|a hit counter that you checked every morning.}"), mood: 4 }) },
          { id: "e_web.learn", label: "Look things up", hint: "the encyclopedia, but more", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => ({ text: c.w("You used the new internet to look things up, {and it took four minutes to load a picture of a giraffe.|and printed out pages for a report on a dot-matrix printer.}"), mood: 2 }) },
          { id: "e_web.email", label: "Email family far away", hint: "cheaper than long distance", act: "talk", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You set up an email address and {wrote to a cousin across the country every week.|${s2.age < 40 ? "got your grandmother online, who signed every message “Love, Grandma” in the subject line." : "forwarded every joke your brother sent to everyone you knew."}}`), mood: 3 }) },
          { id: "e_web.skip", label: "Unplug it. It's a fad", hint: "the phone works fine", act: "wait", style: "safe", weight: 0.15, apply: (s2, c) => ({ text: c.w("You tried the internet once, {decided it was a fad, and used the AOL CD as a coaster.|got bored waiting for a page to load, and went outside.}"), mood: 0 }) },
        ],
      };
    },
  },
  E("e_1996macarena", 1996, [6, 46], 0.25, (s, ctx) => ({ text: ctx.w(["That summer you danced the Macarena {at a wedding, a bar mitzvah and a baseball game, in that order.|in the school gym with four hundred other kids.|with your grandmother, who was better at it than you.}"]), mood: 3 })),
  E("e_1997titanic", 1997, [10, 47], 0.3, (s, ctx) => ({ text: ctx.w(["You saw Titanic in the theater {twice|three times|with a box of tissues} and {argued for weeks about whether there was room on the door.|bought the soundtrack on CD.}"]), mood: 3 })),
  {
    id: "e_y2k", once: true, years: [1999, 1999], ages: [18, 49], when: at(1999, [18, 49]), p: () => 0.6,
    choice: (s, ctx) => {
      const tech = field(s) === "tech" || field(s) === "IT";
      return {
        prompt: `${scene(ctx, ["Everyone is talking about Y2K: the computers might not understand the year 2000, and the power could go out at midnight.", tech ? "Your boss wants the whole IT department on call at midnight on New Year's Eve, in case Y2K breaks everything." : null, "The news keeps running Y2K survival tips, and your neighbor has a garage full of bottled water."])} ${ctx.rng.pick(["How do you spend New Year's Eve?", "What do you do?"])}`,
        options: [
          { id: "e_y2k.party", label: "Party like it's 1999", hint: "it literally is", act: "socialize", style: "social", weight: 0.4, apply: (s2, c) => ({ text: c.w("You spent New Year's Eve 1999 at a party, {counted down with the whole room, and the lights stayed on.|and kissed someone at midnight just in case the world ended.}"), mood: 5 }) },
          { id: "e_y2k.stock", label: "Stock up, just in case", hint: "water, batteries, canned soup", act: "save", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w("You stocked up for Y2K: {forty gallons of water and enough canned soup to last until 2003.|a generator you used once.} At midnight nothing happened, and you ate soup for a year."), mood: 1 }) },
          { id: "e_y2k.work", label: tech ? "Work the midnight shift" : "Pick up the holiday shift", hint: "time and a half", act: "pushThrough", style: "risk", weight: 0.15, apply: () => ({ text: tech ? "You spent New Year's Eve 1999 in the server room watching clocks flip to 2000. Nothing broke. You ate cold pizza and went home at dawn." : "You worked the holiday shift on New Year's Eve 1999 for time and a half, and the new millennium arrived quietly.", mood: 1 }) },
          { id: "e_y2k.home", label: "Stay home with family", hint: "watch the ball drop", act: "rest", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w("You stayed home on New Year's Eve 1999 and watched the ball drop {with the people you love most.|in pajamas, which is the right way.}"), mood: 4 }) },
          { id: "e_y2k.sleep", label: "Go to bed early", hint: "it's just a Friday", act: "rest", style: "self", weight: 0.05, apply: () => ({ text: "You went to bed at ten on New Year's Eve 1999, and woke up in 2000 like it was any other morning.", mood: 1 }) },
        ],
      };
    },
  },
  E("e_y2kKid", 1999, [5, 17], 0.5, (s, ctx) => ({ text: ctx.w(["On New Year's Eve 1999, {you stayed up to see if the lights would go off at midnight. They didn't.|your family counted down to 2000, and you were a little disappointed nothing exploded.}"]), mood: 3 })),

  // ---------- the 2000s ----------
  {
    id: "e_2001sept11", once: true, years: [2001, 2001], ages: [3, 51], when: at(2001, [3, 51]), p: () => 1,
    apply: (s, ctx) => {
      const near = inStates(s, ["NY", "NJ", "CT", "DC", "VA", "MD", "PA"]);
      let text;
      if (s.age < 13) text = ctx.w(["On September 11, {teachers kept wheeling TVs into classrooms and then wheeling them out again.|parents came to pick kids up early, one by one.} That night {your parents hugged you a long time.|you saw the towers on the news and asked if it would happen here.}", "On September 11, school ended early, and you came home to {your mother watching the news with her hand over her mouth.|flags going up on every porch on the street.}"]);
      else if (s.age < 18) text = ctx.w(["On September 11, you were in {second period|homeroom|chemistry} when someone wheeled in a TV. {The whole class watched in silence.|Nobody could reach anyone; the phone lines were jammed.}", "On September 11, {school let out early|your teacher stopped class}, and for the rest of the week everyone was gentler with each other."]);
      else text = ctx.w([`On September 11, ${near ? "you watched the smoke from where you were and spent hours trying to reach everyone you knew" : s.employed ? "work stopped as everyone crowded around a TV" : "you sat in front of the TV all morning, unable to look away"}. {That week you stood in line for hours to give blood.|You called everyone you loved that night.|There was a flag on every porch for months.}`, "On September 11, {you heard it on the car radio and pulled over.|your phone would not stop ringing, and then it would not connect.} {The skies were empty of planes for days, and very quiet.|Everyone was kind to everyone for a while.}"]);
      if (inService(s)) text += " Your unit was put on alert that afternoon.";
      return { text, mood: -6, big: s.age >= 10 };
    },
  },
  E("e_2003iraq", 2003, [18, 53], 0.5, (s, ctx) => ({ text: ctx.w(["Your unit deployed to Iraq in the spring. {You called home on a satellite phone and kept it light.|Your family put a blue-star flag in the window.} You came home a year later, and it took a while to sleep through the night."]), mood: -4, big: true }), { when: s => inService(s) }),
  {
    id: "e_2005katrina", once: true, years: [2005, 2005], ages: [3, 55], when: at(2005, [3, 55]), p: s => (inStates(s, ["LA", "MS"]) ? 0.6 : inStates(s, ["AL", "TX"]) ? 0.25 : 0.15),
    apply: (s, ctx) => {
      if (inStates(s, ["LA", "MS"])) { s.savings = Math.max(0, s.savings - 0.25); return { text: ctx.w(["Hurricane Katrina drove your family out of your home, {with three bags and the dog in the back seat.|and you watched the water rise on TV from a cousin's couch in Houston.} {When you came back, the line on the wall showed how high it got.|It was months before anything felt normal.}"]), mood: -9, big: true }; }
      return { text: ctx.w(["After Hurricane Katrina, {a family from New Orleans moved into the house down the street, and their kids joined your school.|your church collected a truckload of supplies, and you helped load it.|you sent money and watched the news with a knot in your stomach.}"]), mood: -2 };
    },
  },
  {
    // The first smartphone, from the iPhone (June 2007) on.
    id: "e_smartphone", once: true, years: [2007, 2012], ages: [12, 70], when: s => s.year >= 2007 && s.year <= 2012 && !s.abroad, p: s => (s.year < 2009 ? 0.08 : 0.2),
    apply: (s, ctx) => ({ text: s.age < 18 ? ctx.w(["You got your first smartphone{, a hand-me-down iPhone with a cracked corner|} and {downloaded every free game.|immediately put it in a case covered in glitter.|figured out how to set it up for your parents.}"]) : ctx.w(["You got your first smartphone, {and spent the whole first evening learning to swipe.|and within a month you couldn't remember how you used to get anywhere.|and your old flip phone went into the junk drawer.}", s.year === 2007 ? "You stood in line outside the Apple Store for the first iPhone, and showed it to everyone you met for a week." : "You traded in your flip phone for a smartphone and {got lost in it for an entire weekend.|took four hundred photos of your dinner.}"]), mood: 3 }),
  },
  {
    // The 2008 crash: 401(k)s fell by a third; home values fell, most in NV, FL, AZ, CA and MI.
    id: "e_2008crash", once: true, years: [2008, 2009], ages: [22, 75], when: s => (s.year === 2008 || s.year === 2009) && !s.abroad && s.savings >= 0.5, p: () => 0.6,
    apply: (s, ctx) => { s.savings *= 0.8; return { text: ctx.w(["When the market crashed in the fall of 2008, {your 401(k) became, as people joked, a 201(k).|you stopped opening the retirement statements.|you watched your savings shrink every evening on the news.}", "The financial crisis hit, {the bank down the street changed its name twice,|half the houses on your street had For Sale signs,} and {you cut back on everything.|you made peace with working a few years longer.}"]), mood: -5 }; },
  },
  {
    id: "e_2008foreclosure", once: true, domain: "wealth", channel: "bad", years: [2008, 2011], ages: [25, 70], when: s => s.year >= 2008 && s.year <= 2011 && s.home === "own" && !s.abroad, p: s => (inStates(s, ["NV", "FL", "AZ", "CA", "MI"]) ? 0.08 : 0.025),
    choice: (s, ctx) => {
      const lead = scene(ctx, [
        "Your house is worth less than you owe on the mortgage, and the payment just went up.",
        s.unemployedFor ? "With the job gone, you are three payments behind on the mortgage, and the bank has started calling." : "Your adjustable-rate mortgage reset, and the new payment is more than you can make.",
        "Three houses on your street have been foreclosed on, and now there is a letter from your bank on the kitchen table.",
      ]);
      return {
        prompt: `${lead} ${ctx.rng.pick(["What do you do?", "How do you hold on?"])}`,
        options: [
          { id: "e_2008foreclosure.modify", label: "Apply for a loan modification", hint: "months of paperwork", act: "negotiate", style: "safe", weight: 0.35, apply: (s2, c) => (c.roll("wealth", "good", 0.55) ? { text: "You faxed the same documents to the bank eleven times, and finally they lowered your payment. You kept the house.", mood: 2 } : { text: "You applied for a loan modification, and the bank lost your paperwork twice. You kept paying what you could while you waited.", mood: -4 }) },
          { id: "e_2008foreclosure.hold", label: "Cut everything and keep paying", hint: "ride it out", act: "save", style: "family", weight: 0.3, apply: s2 => { s2.flags.frugalUntil = s2.age + 3; s2.savings = Math.max(0, s2.savings - 0.3); return { text: "You cut everything (cable, vacations, eating out) and kept paying the mortgage on a house worth less than the loan. Years later, it was worth it.", mood: -3 }; } },
          { id: "e_2008foreclosure.rent", label: "Rent out a room", hint: "a stranger in the house", act: "sideJob", style: "social", weight: 0.1, apply: (s2, c) => ({ text: c.w("You rented out the spare room {to a nursing student|to a guy who worked nights}, and the extra money kept the house."), mood: 0 }) },
          { id: "e_2008foreclosure.short", label: "Sell it in a short sale", hint: "lose the house, not your credit", act: "sellAsset", style: "safe", weight: 0.15, apply: s2 => { s2.home = "rent"; return { text: "You sold the house in a short sale for less than you owed and moved into a rental. It hurt, and it was over.", mood: -7, big: true }; } },
          { id: "e_2008foreclosure.walk", label: "Walk away", hint: "let the bank have it", act: "avoid", style: "risk", weight: 0.1, apply: s2 => { s2.home = "rent"; s2.savings += 0.2; return { text: "You mailed the keys to the bank and walked away. Your credit took seven years to recover; your nerves, a little less.", mood: -8, big: true }; } },
        ],
      };
    },
  },
  E("e_2012sandy", 2012, [3, 62], 0.35, (s, ctx) => ({ text: ctx.w(["Hurricane Sandy flooded the coast in October, and {your power was out for nine days.|you waited two hours in a gas line again, like it was 1974.|you helped a neighbor tear out soaked drywall.}"]), mood: -4 }), { when: s => inStates(s, ["NY", "NJ", "CT"]) }),
  {
    // June 26, 2015: same-sex couples could marry in every state.
    id: "e_2015marriage", once: true, years: [2015, 2015], ages: [14, 65], when: at(2015, [14, 65]), p: s => (s.partner && s.partner.sex === s.sex ? 1 : 0.2),
    apply: (s, ctx) => {
      const same = s.partner && s.partner.sex === s.sex;
      if (same) return { text: ctx.w(`On June 26, the Supreme Court ruled that same-sex couples could marry anywhere in the country. {You and ${s.partner.call} watched the news and held each other.|${s.partner.call} called you from work, crying.|You hung a rainbow flag on the porch and left it up all summer.}`), mood: 8, big: true };
      return { text: ctx.w(["When marriage equality became the law of the land in June, {your cousin finally married her longtime girlfriend, and the whole family danced.|the bakery downtown put rainbow sprinkles on everything.|a friend from work invited you to the wedding they had waited twenty years for.}"]), mood: 2 };
    },
  },
  E("e_2016pokemon", 2016, [8, 46], 0.3, (s, ctx) => ({ text: ctx.w(["That summer you played Pokemon Go {and walked more miles than you had in years.|with strangers in the park at midnight.|with your kids, who were much better at it.}"]), mood: 3 })),
  {
    // The total solar eclipse of August 21, 2017: totality in a band from Oregon to South Carolina.
    id: "e_2017eclipse", once: true, years: [2017, 2017], ages: [3, 90], when: at(2017, [3, 90]), p: s => (inStates(s, ["OR", "ID", "WY", "NE", "KS", "MO", "IL", "KY", "TN", "GA", "NC", "SC"]) ? 0.8 : 0.4),
    apply: (s, ctx) => ({ text: inStates(s, ["OR", "ID", "WY", "NE", "KS", "MO", "IL", "KY", "TN", "GA", "NC", "SC"]) ? ctx.w(["On August 21 the total eclipse passed right over you. {For two minutes it was dusk at noon, the crickets started, and everyone in the parking lot cheered.|You looked up through paper glasses and forgot to breathe.}"]) : ctx.w(["On August 21 you watched the solar eclipse through {cardboard glasses|a pinhole in a cereal box}, {with your whole office out in the parking lot.|and the light went strange and silver.}"]), mood: 4 }),
  },
  E("e_2020fireSky", 2020, [3, 70], 0.35, (s, ctx) => ({ text: ctx.w(["In September the wildfire smoke turned the sky orange at noon. {You kept the windows shut and the air purifier on for weeks.|The streetlights stayed on all day.} {You packed a go-bag and kept it by the door.|The ash on the car was soft as snow.}"]), mood: -4 }), { when: s => inStates(s, ["CA", "OR", "WA"]) }),
  {
    // March 2020: the pandemic, by where you were in life.
    id: "e_2020covid", once: true, years: [2020, 2020], ages: [1, 75], when: at(2020, [1, 75]), p: () => 1,
    apply: (s, ctx) => {
      let text;
      if (s.age < 5) text = ctx.w("When the pandemic came, {your whole world shrank to the house and the backyard,|everyone you saw wore a mask,} and {your grandparents waved at you through the window.|you learned to talk to people on a screen.}");
      else if (s.studying && s.age < 18) text = ctx.w(["In March 2020 school closed “for two weeks,” and then for the rest of the year. {You did class on a laptop at the kitchen table, muted.|You missed your friends more than you thought possible.}", "When the pandemic hit, {your school went online,|spring sports were canceled,} and {prom happened on Zoom, which is not really prom.|you spent a lot of time in your room.}"]);
      else if (s.studying && s.age < 26) text = ctx.w("In March 2020 your college sent everyone home, and {you finished the semester on Zoom from your childhood bedroom.|you packed your dorm room in an afternoon.}");
      else if (field(s) === "health") text = ctx.w("When the pandemic hit, you were working in health care. {You wore the same N95 for a week.|Every night at seven, the neighbors banged pots for people like you.} {You showered in the garage before hugging anyone.|It was the hardest year of your working life.}");
      else if (s.employed) text = ctx.w(["When the pandemic hit, {you started working from the kitchen table, in sweatpants.|your job was “essential,” and you went in every day past empty streets.} {You learned to say “you're on mute.”|The grocery store shelves were bare of toilet paper for a month.}", "In March 2020 everything shut down. {You baked a lot of sourdough.|You did a puzzle with a thousand pieces.} {You saw your parents through a window on their birthday.|You worried about everyone, all the time.}"]);
      else text = ctx.w("When the pandemic came, {you stayed home and learned to video-call the grandkids.|your days got very small and very quiet,} and {a neighbor dropped off groceries every week.|you missed hugging people more than anything.}");
      return { text, mood: -5, big: s.age >= 8 };
    },
  },
  {
    id: "e_2020lockdown", once: true, years: [2020, 2020], ages: [18, 75], when: at(2020, [18, 75]), p: () => 0.5,
    choice: (s, ctx) => ({
      prompt: `${scene(ctx, ["The lockdown is in its second month, and the days have started to blur.", "You've been home for weeks, and you are running out of shows.", s.kids.length ? "The kids are home, school is a laptop, and you need something to keep everyone sane." : null])} ${ctx.rng.pick(["How do you get through it?", "What do you do with yourself?"])}`,
      options: [
        { id: "e_2020lockdown.bake", label: "Bake sourdough", hint: "like everyone else", act: "hobby", style: "learn", weight: 0.25, apply: (s2, c) => ({ text: c.w("During lockdown you made a sourdough starter, {named it, and kept it alive longer than some relationships.|and the first loaf could have been used as a doorstop.}"), mood: 3 }) },
        { id: "e_2020lockdown.dog", label: "Adopt a pandemic puppy", hint: "a reason to go outside", act: "care", style: "family", weight: 0.15, apply: s2 => { s2.flags.pet = s2.flags.pet || { kind: "dog", name: ctx.rng.pick(["Biscuit", "Luna", "Rosie", "Murphy", "Pepper"]), noun: "dog", since: s2.age }; return { text: `During lockdown you adopted a puppy named ${s2.flags.pet.name}, who got you outside twice a day and onto every Zoom call.`, mood: 5 }; } },
        { id: "e_2020lockdown.zoom", label: "Zoom happy hours with friends", hint: "better than nothing", act: "socialize", style: "social", weight: 0.25, apply: (s2, c) => ({ text: c.w("During lockdown you held Zoom happy hours {every Friday with old friends you hadn't seen in years.|with your family, where Grandpa only ever saw the ceiling.}"), mood: 3 }) },
        { id: "e_2020lockdown.fit", label: "Get in shape", hint: "home workouts, long walks", act: "exercise", style: "health", weight: 0.2, apply: s2 => { s2.health.hr = Math.max(0.8, s2.health.hr * 0.98); return { text: "During lockdown you walked every morning and did workouts in the living room, and came out of it stronger.", mood: 3 }; } },
        { id: "e_2020lockdown.binge", label: "Binge everything", hint: "survival mode", act: "rest", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w("During lockdown you watched {every season of everything|Tiger King, like everyone else|the same comfort show three times through}, and that was fine."), mood: 1 }) },
      ],
    }),
  },
  E("e_2021vaccine", 2021, [12, 75], 0.75, (s, ctx) => ({ text: ctx.w(["You got your COVID vaccine {at a pharmacy|in a stadium parking lot|at a school gym}, {took a selfie with the bandage,|felt rough for a day,} and {hugged your mother for the first time in a year.|cried a little in the car.}"]), mood: 4 })),
  E("e_2021freeze", 2021, [3, 75], 0.45, (s, ctx) => ({ text: ctx.w(["In February the big freeze knocked out the power for days. {You slept in your coat with the whole family in one room.|You melted snow in the bathtub to flush the toilet.|The neighbors with a gas stove cooked for the whole street.}"]), mood: -4 }), { when: s => inStates(s, ["TX"]) }),
  E("e_2023ai", 2023, [12, 70], 0.3, (s, ctx) => ({ text: s.studying ? ctx.w("Everyone at school was suddenly using AI chatbots, and {your teachers went back to essays written by hand in class.|you asked one to explain calculus and it actually helped.}") : ctx.w(["AI chatbots were suddenly everywhere, and {you asked one to write a toast for your friend's wedding.|your boss announced a “strategy” about them.|you were not sure whether to be impressed or worried, so you were both.}"]), mood: 1 })),
  {
    // The total solar eclipse of April 8, 2024: totality from Texas to Maine.
    id: "e_2024eclipse", once: true, years: [2024, 2024], ages: [3, 75], when: at(2024, [3, 75]), p: s => (inStates(s, ["TX", "OK", "AR", "MO", "IL", "IN", "OH", "PA", "NY", "VT", "NH", "ME", "KY", "TN", "MI"]) ? 0.7 : 0.3),
    apply: (s, ctx) => ({ text: ctx.w(["In April the eclipse crossed the country again{, and this time you drove to the path of totality.|, and you watched it with {friend} from a field full of strangers.|.} {For four minutes the day went dark, and a whole crowd went quiet.|You saw the corona with your own eyes and got a little teary.}"]), mood: 4 }),
  },
];

// Era events are not storylines: they never decide schooling, work or love on their own (the draft is the exception,
// as it was), and they never touch the calibrated core.
export const ERA_YEARS = Object.fromEntries(ERA.map(e => [e.id, e.years]));
