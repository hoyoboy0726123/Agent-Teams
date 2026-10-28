// Childhood, 0–12: first words and first steps, bedtime stories, a blankie, the corner store, Saturday-morning
// cartoons, a best friend, a bike, a pet, Little League and piano, the class hamster, the book fair, the science
// fair, Halloween, the truth about Santa, a road trip in the station wagon, snow days, and the small moral tests of a
// kid's life: a twenty on the playground, a baseball through a window, a test that needs a parent's signature.
//
// The probabilities are assumptions (no statistics exist for these events): most are 0.02–0.08 a year, limited by
// once / max / cooldown, so a childhood holds seven or eight of them, three or four of them choices. A choice picks one
// scene for this life (by era, age, family, money at home) and builds its question, buttons and results from it; the
// option ids, acts, styles, weights and effects stay the same. Nothing here touches schooling, work, love, births,
// homes or health risk: those are in core.js, calibrated on US statistics.
//
// Left for later modules:
//   s.flags.bff        id of the best friend in s.friends (memory kind "bestFriend" has the name)
//   s.flags.pet        { kind, name, noun, since }        s.flags.talent   piano, baseball, ballet, karate, soccer, swim, art, scouts, chess, code
//   s.flags.dream      what you wanted to be ("astronaut", "vet"…)   s.flags.homeMoney  "tight" | "ok" (common.js)
//   s.flags.liveWith   "mother" | "father" after the parents split   s.flags.faith    "christian" | "jewish" | "muslim" | "hindu" | "none"
//   s.flags.santa      how you took the news about Santa              s.flags.honest   +1 / −1 for the small honesty tests
import {
  scene, pickScene, cap, an, they, them, their, sibName, sibShort, olderSibs, youngerSibs, bornSibs, grownUp, parentWord, liveWith,
  bestFriend, friendName, makeFriend, homeMoney, kidsCulture, snackOf, middleName, inElementary, snowy, stateOf, inStates, gradeWord,
} from "./common.js";

// ---------- helpers ----------
// A plain event: its lines (templates, or a function of s and ctx giving them), its mood, and the usual fields.
function A(id, ages, p, lines, { mood = 2, ...more } = {}) {
  return { id, ages, once: true, ...more, p: typeof p === "function" ? p : () => p, apply: (s, ctx) => ({ text: ctx.w(typeof lines === "function" ? lines(s, ctx) : lines), mood: typeof mood === "function" ? mood(s) : mood }) };
}
const atHome = s => !s.abroad;
const school = s => s.studying && !s.abroad && (s.track === "elementary" || s.track === "middle");
// The family's faith, drawn once, for the holidays and Sunday mornings (an assumption close to US surveys: about seven
// in ten Christian, about two percent Jewish, one percent each Muslim and Hindu, the rest none, the "none" share
// growing after 1990).
export function faithOf(s, ctx) {
  if (!s.flags.faith) s.flags.faith = ctx.rng.weighted([["christian", s.birthYear < 1990 ? 0.85 : 0.68], ["jewish", 0.02], ["muslim", s.birthYear < 1980 ? 0.003 : 0.012], ["hindu", s.birthYear < 1980 ? 0.002 : 0.01], ["none", s.birthYear < 1990 ? 0.12 : 0.28]]);
  return s.flags.faith;
}
// The holiday a family's year turns on.
const holidayOf = (s, ctx) => ({ christian: "Christmas", jewish: "Hanukkah", muslim: "Eid", hindu: "Diwali", none: "Christmas" })[faithOf(s, ctx)];
// A sibling for a scene: older first, then a younger one at least `min` years old.
const anySib = (s, ctx, min = 3) => { const l = [...olderSibs(s), ...youngerSibs(s, min)]; return l.length ? ctx.rng.pick(l) : null; };
// A pet's pronoun.
const its = "its";
// First names for a new kid from abroad, boys then girls.
const NEW_KID = {
  Italy: [["Giovanni", "Marco"], ["Rosa", "Francesca"]], Mexico: [["Diego", "Alejandro"], ["Guadalupe", "Mariana"]], Cuba: [["Alejandro", "Rafael"], ["Marisol", "Yolanda"]],
  Korea: [["Min-jun", "Sung-ho"], ["Ji-woo", "Eun-ji"]], Poland: [["Tomasz", "Piotr"], ["Agnieszka", "Kasia"]], Vietnam: [["Minh", "Tuan"], ["Linh", "Mai"]],
  India: [["Arjun", "Rohan"], ["Priya", "Ananya"]], "El Salvador": [["Carlos", "José"], ["Ana", "Gabriela"]], Russia: [["Sergei", "Dmitri"], ["Natasha", "Olga"]],
  Somalia: [["Abdi", "Mohamed"], ["Hodan", "Amina"]], Guatemala: [["Mateo", "Luis"], ["Alejandra", "Lucía"]], Ukraine: [["Dmytro", "Andriy"], ["Oksana", "Yulia"]],
  "the Philippines": [["Jomar", "Paolo"], ["Maricel", "Angelica"]],
};
// What a quarter bought, by era, for the coin from the Tooth Fairy.
const toothMoney = y => (y < 1970 ? "a dime" : y < 1990 ? "a quarter" : y < 2010 ? "a dollar" : "five dollars");

export const CHILD = [
  // ---------- the first years ----------
  A("c_firstWord", [1, 1], 0.9, s => {
    const pet = s.flags.pet ? s.flags.pet.name : "the dog";
    return [`Your first word was {“Mama,” and your mother has never let anyone forget it.|“Dada,” and your father bought a cigar he didn't smoke.|“no,” and you used it a lot after that.|“uh-oh,” which turned out to be a lifestyle.|“ball,” said with great authority.}`, `Your first word was {“kitty”|“cookie”|“light”}, {shouted at the ceiling fan.|and the whole family cheered so loudly you cried.}`, "You said your first word, {“more,”|“bye-bye,”|“hot,”} at {the dinner table|Grandma's house|the grocery store}, and {nobody heard it but you.|three people claimed to have heard it first.}"];
  }, { mood: 2 }),
  A("c_firstSteps", [1, 1], 0.9, ["You took your first steps {toward the dog|across the living room rug|at a family barbecue}, {and fell straight into Grandpa's lap.|three wobbly ones, then sat down very surprised.|while your mother scrambled for the camera and missed it.}", "You learned to walk {holding the edge of the coffee table|chasing your older cousin|in your father's shoes}, and {there was no stopping you after that.|nothing below three feet was ever safe again.}", "Your first steps happened {on a Tuesday, in the kitchen|on the back porch|in a department store aisle}, {and you looked more surprised than anyone.|toward a cookie someone was holding just out of reach.}"]),
  {
    // Who watched you while the grown-ups worked: a mother at home in most 1950s families, daycare and grandparents
    // more often later (an assumption from the share of mothers of young children at work: about 1 in 5 in 1960, 6 in 10 by 2000).
    id: "c_care", once: true, ages: [2, 3], when: atHome, p: () => 0.8,
    apply: (s, ctx) => {
      const work = ctx.rng() < (s.year < 1965 ? 0.2 : s.year < 1985 ? 0.45 : 0.62);
      s.flags.daycare = work;
      return { text: work ? ctx.w(["While your parents worked, {Grandma watched you, and you learned to play gin rummy at three.|you went to a daycare in a church basement with a parachute and a hundred toddlers.|a neighbor lady watched you along with four other kids and a parakeet.}", "You spent your days at daycare, {where you bit exactly one kid and never again.|and cried at drop-off for a month, then cried at pickup because you wanted to stay.}"]) : ctx.w(["You spent your little-kid days at home, {following your mother from room to room.|watching Sesame Street and helping with laundry.|in the backyard sandbox with the neighbor kids.}", "Your days were the kitchen floor, pots and pans for drums, and {the mailman's daily visit, which you considered a social event.|a long nap after lunch.}"]), mood: 1 };
    },
  },
  {
    id: "c_bedtime", once: true, ages: [2, 5], when: atHome, p: () => 0.25,
    apply: (s, ctx) => {
      const y = s.year;
      const book = ctx.rng.pick([...(y >= 1950 ? ["Goodnight Moon"] : []), ...(y >= 1957 ? ["The Cat in the Hat"] : []), ...(y >= 1960 ? ["Green Eggs and Ham"] : []), ...(y >= 1964 ? ["Where the Wild Things Are"] : []), ...(y >= 1970 ? ["The Very Hungry Caterpillar", "Corduroy"] : []), ...(y >= 1985 ? ["Love You Forever"] : []), ...(y >= 1990 ? ["Chicka Chicka Boom Boom"] : []), ...(y >= 2008 ? ["Llama Llama Red Pajama"] : []), ...(y >= 2013 ? ["The Day the Crayons Quit"] : [])]);
      const who = grownUp(s, ctx);
      return { text: ctx.w([`Every night you made ${who} read ${book}, {and woe to anyone who skipped a page.|until ${who} could recite it with eyes closed.|and you said the last line together.}`, `${book} was your favorite bedtime book. {You wore the cover right off it.|You “read” it to your stuffed animals, from memory.}`, `Bedtime was ${book}, a glass of water, and {checking under the bed for monsters, twice.|one more song, then one more.}`]), mood: 2 };
    },
  },
  {
    id: "c_blankie", once: true, ages: [3, 5], when: atHome, p: () => 0.12,
    choice: (s, ctx) => {
      const thing = ctx.rng.pick(["blankie", "teddy bear", "stuffed rabbit", "stuffed dog"]), who = grownUp(s, ctx);
      const lead = scene(ctx, [
        `Your ${thing} is more hole than ${thing} now, and ${who} says it's time to let it go.`,
        `${who} wants to wash your ${thing}, and you are sure it will not survive.`,
        `Your ${thing} got left at a restaurant, and ${who} drove back for it. Now ${who} says you are getting too big for it.`,
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "c_blankie.hide", label: `Hide your ${thing}`, hint: "under the mattress", act: "avoid", style: "risk", weight: 0.25, apply: () => ({ text: `When ${who} wanted to retire your ${thing}, you hid it under the mattress. It was found during spring cleaning years later, and ${who} kept it.`, mood: 2 }) },
          { id: "c_blankie.fix", label: `Ask ${who} to fix it`, hint: "a patch, a few stitches", act: "seekHelp", style: "family", weight: 0.3, apply: () => ({ text: `You asked ${who} to fix your ${thing} instead of throwing it out, and ${who} sewed patches on it until it was more patch than ${thing}.`, mood: 3 }) },
          { id: "c_blankie.deal", label: "Make a deal: bedtime only", hint: "a fair compromise", act: "negotiate", style: "social", weight: 0.25, apply: () => ({ text: `You and ${who} made a deal about your ${thing}: bedtime only. You stuck to it, mostly.`, mood: 1 }) },
          { id: "c_blankie.brave", label: "Say goodbye like a big kid", hint: "a brave little ceremony", act: "wait", style: "safe", weight: 0.12, apply: () => ({ text: `You said goodbye to your ${thing} with a little ceremony, and got a sticker for being brave. You cried a bit that night, and then you were fine.`, mood: -1 }) },
          { id: "c_blankie.everywhere", label: "Take it everywhere, forever", hint: "no surrender", act: "insist", style: "self", weight: 0.08, apply: () => ({ text: `Asked to give up your ${thing}, you refused, and took it to kindergarten, to the dentist and on vacation. It is still in a box somewhere.`, mood: 2 }) },
        ],
      };
    },
  },
  A("c_imaginary", [3, 6], 0.08, ["You had an imaginary friend named {Pickles|Mr. Bigglesworth|Zippy|Captain Steve|Lulu}, who {needed a seat at dinner.|got blamed for most of the messes.|had very strong opinions about bedtime.}", "Your imaginary friend {lived in the closet|was a dragon|was a horse named Thunder}, and {your parents set a place for it at Thanksgiving, as a joke you took seriously.|it moved away the summer you started school.}", "For a whole year you talked to an imaginary friend {in the backyard|under the kitchen table}, {and your grandmother politely asked how it was doing.|until your little cousin swore she could see it too.}"], { when: atHome }),
  A("c_lostStore", [3, 7], 0.06, s => [`You got lost in ${s.year < 1990 ? "the Sears" : s.year < 2005 ? "the Kmart" : "the Target"}, {hid inside a circular clothes rack,|wandered to the toy aisle,} and {heard your name over the loudspeaker.|a nice lady walked you to the customer service desk.}`, `You lost ${s.year < 1980 ? "Mom" : "your parents"} at {the county fair|the mall|the beach}, {and a security guard bought you an ice cream while they found you.|and decided to live there now, until they showed up five minutes later.}`, "At the grocery store you followed the wrong pair of legs for two aisles, {and when the stranger turned around you both screamed.|and learned to hold onto the cart after that.}"], { when: atHome, mood: -1 }),
  A("c_haircut", [3, 8], 0.05, (s, ctx) => [`You gave yourself a haircut with the kitchen scissors, {and school picture day was the next morning.|and ${grownUp(s, ctx)} just said “Oh, honey.”|leaving one long piece in front, on purpose.}`, `You cut ${youngerSibs(s, 2).length ? sibName(youngerSibs(s, 2)[0]) + "'s" : "your best friend's"} bangs “to help,” {and both of you were in trouble.|and it took three months to grow out.}`, "You tried to give the dog a haircut, {and the dog has never fully trusted you since.|and it looked like a lawn mowed by a raccoon.}"], { when: atHome, mood: 1 }),
  {
    id: "c_checkout", once: true, ages: [3, 6], when: atHome, p: () => 0.12,
    choice: (s, ctx) => {
      const who = grownUp(s, ctx), snack = ctx.rng.pick(snackOf(s.year)), store = s.year < 1975 ? "the A&P" : s.year < 2000 ? "the grocery store" : "Walmart";
      return {
        prompt: `At the checkout at ${store}, ${snack} is right at your eye level, and ${who} said no. What do you do?`,
        options: [
          { id: "c_checkout.scream", label: "Lie down on the floor and wail", hint: "maximum volume", act: "insist", style: "self", weight: 0.2, apply: () => ({ text: `At the checkout at ${store}, you threw a full tantrum over ${snack}. ${who} carried you out like a sack of potatoes, and an old man gave ${who} a sympathetic nod.`, mood: -2 }) },
          { id: "c_checkout.ask", label: "Ask very, very nicely", hint: "please and thank you", act: "talk", style: "social", weight: 0.3, apply: (s2, c) => (c.rng() < 0.5 ? { text: `At the checkout, you asked for ${snack} with your best please and thank you, and ${who} was so impressed you got it.`, mood: 3 } : { text: `At the checkout, you asked for ${snack} with your best manners. ${who} still said no, but told you it was the politest no ever.`, mood: 0 }) },
          { id: "c_checkout.sneak", label: "Sneak it onto the belt", hint: "maybe nobody notices", act: "avoid", style: "risk", weight: 0.15, apply: () => ({ text: `At the checkout, you slid ${snack} onto the belt behind the milk. The cashier noticed, ${who} noticed, and everyone in line noticed.`, mood: -1 }) },
          { id: "c_checkout.deal", label: "Offer to carry the groceries", hint: "earn it", act: "negotiate", style: "family", weight: 0.2, apply: () => ({ text: `At the checkout, you offered to carry the groceries to the car in exchange for ${snack}. You carried one loaf of bread, heroically, and got your treat.`, mood: 3 }) },
          { id: "c_checkout.wait", label: "Let it go, and look at the gumball machine", hint: "next time", act: "wait", style: "safe", weight: 0.15, apply: () => ({ text: `At the checkout, you let ${snack} go without a fuss, and on the way out ${who} gave you a penny for the gumball machine.`, mood: 2 }) },
        ],
      };
    },
  },
  A("c_tooth", [5, 7], 0.6, s => [`You lost your first tooth {biting an apple|on the playground|in a piece of taffy}, and the Tooth Fairy left ${toothMoney(s.year)} under your pillow.`, `Your first tooth came out {while you were wiggling it during a spelling test.|tied to a doorknob, which you would not recommend.} {You put it in a little envelope for the Tooth Fairy.|The Tooth Fairy left ${toothMoney(s.year)} and a note in suspiciously familiar handwriting.}`, `You lost a front tooth {right before school pictures,|the week of the Christmas pageant,} and {whistled through the gap for a month.|the Tooth Fairy left ${toothMoney(s.year)}.}`], { when: atHome, mood: 2 }),
  A("c_er", [2, 9], 0.04, ["You stuck a {dried pea|bead|crayon tip} up your nose to see what would happen, and what happened was a trip to the emergency room.", "You swallowed a {penny|Lego piece|marble}, and {your parents spent two days checking.|the doctor said it would “pass,” and it did.}", "You jumped off the {top bunk|garage roof|back porch} with a bedsheet for a cape, {and learned that it does not work.|and got four stitches in your chin.}"], { when: atHome, mood: -1, max: 2, once: false, cooldown: 3 }),
  A("c_firstMovie", [3, 7], 0.2, (s, ctx) => {
    const y = s.year;
    const film = y < 1964 ? "a Disney movie at the old downtown theater" : y < 1975 ? "Mary Poppins on a re-release" : y < 1982 ? "Star Wars" : y < 1989 ? "E.T." : y < 1994 ? "The Little Mermaid" : y < 1995 ? "The Lion King" : y < 2003 ? "Toy Story" : y < 2013 ? "Finding Nemo" : y < 2020 ? "Frozen" : "Encanto";
    return [`Your first movie in a real theater was ${film}, {and you were so scared of the dark you sat on ${grownUp(s, ctx)}'s lap.|and you spilled a whole box of popcorn in the first five minutes.|and you walked out singing.}`, `${cap(film)} was your first trip to the movies, {and the screen was the biggest thing you had ever seen.|and you fell asleep halfway through and insisted you saw it all.}`, `The first movie you saw in a theater: ${film}. {You talked about it for a month.|You cried at the sad part and pretended you had something in your eye.}`];
  }, { when: atHome, mood: 3 }),
  {
    id: "c_newBaby", once: true, ages: [2, 9], when: s => youngerSibs(s, 0).some(x => s.age - x.bornAt <= 1), p: () => 0.25,
    choice: (s, ctx) => {
      const b = youngerSibs(s, 0).find(x => s.age - x.bornAt <= 1), name = sibName(b), dad = s.father.alive ? "Dad" : "Grandma";
      return {
        prompt: `Since ${name} came home, everyone only seems to look at the baby. How do you handle it?`,
        options: [
          { id: "c_newBaby.help", label: "Be the big helper", hint: "fetch diapers, sing songs", act: "care", style: "family", weight: 0.35, apply: () => ({ text: `When ${name} came home and took all the attention, you decided to be the big helper, fetching diapers and singing songs. ${cap(name)}'s first laugh was at you.`, mood: 3 }) },
          { id: "c_newBaby.baby", label: "Act like a baby too", hint: "two can play this game", act: "insist", style: "self", weight: 0.2, apply: () => ({ text: `When ${name} came home and took all the attention, you started crawling and asking for a bottle. It got you some laughs and, eventually, a talk.`, mood: 0 }) },
          { id: "c_newBaby.alone", label: `Ask ${dad} for a day just you two`, hint: "special time", act: "talk", style: "social", weight: 0.2, apply: () => ({ text: `When ${name} came home, you asked ${dad} for a day just for you. You went for pancakes and the hardware store, and it was one of the best days of your life.`, mood: 4 }) },
          { id: "c_newBaby.draw", label: "Draw a picture for the baby", hint: "a gift", act: "hobby", style: "learn", weight: 0.15, apply: () => ({ text: `When ${name} came home, you drew a picture of the whole family, with the baby very small and you very large. It went on the fridge.`, mood: 2 }) },
          { id: "c_newBaby.ignore", label: "Ignore the baby completely", hint: "it'll go away", act: "avoid", style: "self", weight: 0.1, apply: () => ({ text: `When ${name} came home, you refused to look at the baby for a week. Then ${name} grabbed your finger, and that was the end of that.`, mood: 1 }) },
        ],
      };
    },
  },
  A("c_cartoons", [4, 10], 0.25, s => {
    const w = kidsCulture(s.year).watch;
    return [`You ${w[0]}, {in your pajamas with a bowl of sugary cereal balanced on your knees.|lying on your stomach a foot from the TV.|and nobody could get a word out of you.}`, `You ${w[1 % w.length]}, {so often you knew every line.|fighting your siblings for the good spot on the couch.|and then acted out every episode in the backyard.}`, `You ${w[2 % w.length]}{, and it was the best part of the week.|, and sang the theme song in the bathtub.|, even when you were supposed to be getting ready for church.}`];
  }, { when: atHome, mood: 2 }),
  // ---------- friends and the things kids want ----------
  {
    id: "c_bestFriend", domain: "family", channel: "good", tags: ["friends"], once: true, ages: [5, 9], when: s => atHome(s) && !bestFriend(s), p: () => 0.25,
    choice: (s, ctx) => {
      const k = kidsCulture(s.year), toy = ctx.rng.pick(k.toys), snack = ctx.rng.pick(snackOf(s.year));
      const f = ctx.person({ role: "friend", sex: ctx.rng() < 0.85 ? s.sex : s.sex === "male" ? "female" : "male", birthYear: s.birthYear, how: "school" });
      const add = s2 => { s2.friends.push(f); if (!bestFriend(s2)) { s2.flags.bff = f.id; f.bond = 0.7; ctx.remember("bestFriend", f.call, { name: f.call, call: f.call, sex: f.sex }); } };
      const [lead, then] = scene(ctx, [
        [`There's a kid named ${f.call} in your class who always plays alone at recess.`, `${f.call} always played alone at recess, so`],
        [`${f.call} just moved in two houses down, and keeps looking over the fence.`, `When ${f.call} moved in two houses down,`],
        [`At lunch, ${f.call} has the coolest lunchbox in the class, and you can't stop looking at it.`, `${f.call} had the coolest lunchbox in the class, so`],
        [`On the bus, ${f.call} is sitting alone, drawing in a notebook.`, `${f.call} was sitting alone on the bus, so`],
      ]);
      return {
        prompt: `${lead} How do you start?`,
        options: [
          { id: "c_bestFriend.share", label: `Share your ${snack.replace(/^an? /, "")}`, hint: "the universal language", act: "socialize", style: "family", weight: 0.25, apply: s2 => { add(s2); return { text: `${then} you split your ${snack.replace(/^an? /, "")} with ${them(f)}. By Friday you and ${f.call} were best friends.`, mood: 5 }; } },
          { id: "c_bestFriend.play", label: "Ask them to play tag", hint: "just go for it", act: "socialize", style: "social", weight: 0.3, apply: s2 => { add(s2); return { text: `${then} you walked right up and said “Wanna play tag?” You and ${f.call} were inseparable after that.`, mood: 5 }; } },
          { id: "c_bestFriend.trade", label: "Offer to trade something", hint: "a good deal", act: "negotiate", style: "risk", weight: 0.15, apply: s2 => { add(s2); return { text: `${then} you offered a trade, and haggled like a used-car salesman. You and ${f.call} have been best friends ever since.`, mood: 4 }; } },
          { id: "c_bestFriend.invite", label: "Invite them over after school", hint: "ask your parents first", act: "socialize", style: "family", weight: 0.15, apply: s2 => { add(s2); return { text: `${then} you invited ${f.call} over after school. ${cap(they(f))} stayed for dinner, and then basically every dinner.`, mood: 5 }; } },
          { id: "c_bestFriend.wait", label: "Wait for them to come to you", hint: "too shy", act: "wait", style: "safe", weight: 0.15, apply: (s2, c) => { if (c.rng() < 0.5) { add(s2); return { text: `${then} you were too shy to say anything, but a week later ${f.call} sat down next to you and asked your name. Best friends.`, mood: 4 }; } return { text: `${then} you meant to say hi, but you were too shy, and the moment passed.`, mood: -1 }; } },
        ],
      };
    },
  },
  {
    id: "c_bike", once: true, ages: [5, 8], when: atHome, p: () => 0.3,
    choice: (s, ctx) => {
      const bike = s.year < 1965 ? "a red Schwinn" : s.year < 1980 ? "a Schwinn with a banana seat" : s.year < 1995 ? "a BMX bike" : "a bike with streamers on the handlebars";
      const dad = s.father.alive && !s.flags.parentsSplit ? "Dad" : grownUp(s, ctx), sib = olderSibs(s)[0];
      return {
        prompt: `${scene(ctx, [`You got ${bike} for your birthday, and it's time for the training wheels to come off.`, `All the kids on the street ride bikes, and you're still on training wheels on ${bike}.`, `${dad} wheeled ${bike} out of the garage and said, “Today's the day.”`])} How do you learn?`,
        options: [
          { id: "c_bike.parent", label: `${dad} runs behind holding the seat`, hint: "the classic", act: "seekHelp", style: "family", weight: 0.4, apply: () => ({ text: `You learned to ride ${bike} with ${dad} running behind you holding the seat, until you looked back and saw ${dad} standing far down the street, waving. You never forgot that.`, mood: 6, big: true }) },
          { id: "c_bike.hill", label: "Teach yourself on the grassy hill", hint: "soft landings", act: "pushThrough", style: "risk", weight: 0.2, apply: (s2, c) => ({ text: c.w(`You taught yourself to ride ${bike} on the grassy hill behind the school, {falling about forty times and getting up forty-one.|with grass stains on every pair of pants you owned.}`), mood: 4 }) },
          { id: "c_bike.sib", label: sib ? `Get ${sibShort(sib)} to teach you` : "Get the kid next door to teach you", hint: "they learned last year", act: "seekHelp", style: "social", weight: 0.15, apply: () => ({ text: `${sib ? cap(sibName(sib)) : "The kid next door"} taught you to ride, mostly by yelling “PEDAL!” and laughing when you hit the hedge. It worked.`, mood: 4 }) },
          { id: "c_bike.lot", label: "Practice in the empty church parking lot", hint: "lots of room", act: "study", style: "learn", weight: 0.15, apply: () => ({ text: `You practiced in the empty church parking lot every Sunday afternoon, slow circles, then fast ones, until you were riding ${bike} with no hands.`, mood: 4 }) },
          { id: "c_bike.later", label: "Keep the training wheels another year", hint: "no rush", act: "wait", style: "safe", weight: 0.1, apply: () => ({ text: `You kept the training wheels on ${bike} another year, and when they came off, you just rode away like you had always known how.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "c_pet", domain: "family", channel: "good", once: true, ages: [5, 12], when: s => atHome(s) && !s.flags.pet, p: () => 0.07,
    choice: (s, ctx) => {
      const who = grownUp(s, ctx);
      const sc = pickScene(ctx, [
        { kind: "cat", noun: "kitten", names: ["Mittens", "Tiger", "Smokey", "Oreo", "Luna", "Boots"], lead: "A skinny gray kitten has been crying under the porch for three days.", vet: true, duty: "feed it and clean the litter box" },
        { kind: "dog", noun: "puppy", names: ["Buddy", "Lucky", "Rocky", "Daisy", "Max", "Biscuit"], lead: "The neighbors' dog had puppies, and they're giving them away free to good homes.", vet: true, duty: "walk it every day" },
        s.year >= 1980 && { kind: "dog", noun: "dog", names: ["Bear", "Sadie", "Cooper", "Molly", "Duke"], lead: "At the animal shelter's adoption day at the mall, a dog with one floppy ear licked your hand and wouldn't stop.", vet: true, duty: "walk it every day" },
        { kind: "fish", noun: "goldfish", names: ["Goldie", "Bubbles", "Jaws", "Mr. Fish"], lead: "You won a goldfish in a plastic bag at the county fair ring toss.", vet: false, duty: "feed it and clean the bowl", w: 0.8 },
        school(s) && { kind: "hamster", noun: "hamster", names: ["Peanut", "Hammy", "Nibbles", "Cheeks"], lead: "Your class hamster had babies, and your teacher is looking for homes for them.", vet: false, duty: "clean the cage every week" },
      ]);
      const name = ctx.rng.pick(sc.names), keep = s2 => { s2.flags.pet = { kind: sc.kind, name, noun: sc.noun, since: s2.age }; };
      const then = sc.lead.replace(/\.$/, "");
      return {
        prompt: `${sc.lead} You want it more than anything. What do you do?`,
        options: [
          { id: "c_pet.beg", label: `Beg ${who} to keep it`, hint: `promise to ${sc.duty}`, act: "care", style: "family", weight: 0.3, apply: (s2, c) => { if (!sc.vet || c.rng() < 0.75) { keep(s2); return { text: c.w(`${then}. You begged ${who}, promised to ${sc.duty}, and {${who} said yes.|${who} gave in.} You named it ${name}.`), mood: 5, big: true }; } return { text: `${then}. You begged ${who}, but it just wasn't possible at home, and ${who} helped you find it a good family nearby. You visited.`, mood: -2 }; } },
          { id: "c_pet.chart", label: "Make a chore chart to prove you're ready", hint: "a serious proposal", act: "study", style: "learn", weight: 0.2, apply: s2 => { keep(s2); return { text: `${then}. You made a chart with every chore and a check box for each day, and ${who} was so impressed you got to keep it. You named it ${name}.`, mood: 4, big: true }; } },
          { id: "c_pet.hide", label: "Hide it in your room", hint: "ask forgiveness later", act: "avoid", style: "risk", weight: 0.15, apply: (s2, c) => { const ok = c.rng() < 0.5; if (ok) keep(s2); return { text: `${then}. You hid it in your room, and ${who} found out in about a day and a half. ${ok ? `${who} sighed and said, “Fine. What's its name?” It was ${name}.` : `${who} found it a good home with a neighbor, and you were allowed to visit.`}`, mood: ok ? 3 : -2 }; } },
          { id: "c_pet.vet", label: "Take it to the vet first", hint: "make sure it's healthy", act: "seeDoctor", style: "health", weight: 0.12, when: () => sc.vet, apply: s2 => { keep(s2); return { text: `${then}. ${who} drove you and the ${sc.noun} to the vet, who said it was healthy, and that settled it. You named it ${name}.`, mood: 4, big: true }; } },
          { id: "c_pet.friend", label: "Find it a home with a friend", hint: "you can visit", act: "seekHelp", style: "social", weight: 0.13, apply: () => ({ text: `${then}. You couldn't keep it, so you found it a home with ${friendName(s, "a kid from school")}, and you visited every week.`, mood: 1 }) },
          { id: "c_pet.no", label: "Accept the no", hint: "maybe someday", act: "wait", style: "safe", weight: 0.1, apply: () => ({ text: `${then}. ${who} said no, and you accepted it, mostly. You drew a lot of pictures of ${sc.noun}s that year.`, mood: -2 }) },
        ],
      };
    },
  },
  {
    // The activity a kid takes up, by era: Little League from 1939, karate classes spread in the 1970s, youth soccer boomed in the 1970s–80s.
    id: "c_talent", domain: "study", channel: "good", once: true, ages: [6, 10], when: s => atHome(s) && !s.flags.talent, p: () => 0.12,
    choice: (s, ctx) => {
      const who = grownUp(s, ctx), money = homeMoney(s, ctx) === "tight";
      const lead = scene(ctx, [
        `${who} wants you to try an activity this year, and the sign-up sheet is on the fridge.`,
        money ? `Money is tight, but ${who} says you can pick one activity this year, and ${who} will find a way to pay for it.` : null,
        `Your best friend just signed up for something, and ${who} asked what you'd like to do.`,
        "The community center flyer came home in your backpack with a whole list of things to try.",
      ]);
      const set = (key, text, mood = 4) => (s2, c) => { s2.flags.talent = key; return { text: c.w(text), mood }; };
      const sport = s.year >= 1975 ? ["soccer", "Sign up for soccer", "orange slices at halftime", "You signed up for soccer, ran in a herd with eleven other kids chasing the ball, and {loved the orange slices at halftime.|scored a goal for the other team once, which you still hear about.}"] : ["baseball", s.sex === "female" && s.year < 1974 ? "Sign up for softball" : "Sign up for Little League", "a glove that smells like leather", "You signed up for {Little League|softball}, {broke in your glove by sleeping with it under your mattress,|played right field and picked a lot of dandelions,} and {hit a double in the last game of the season.|ate a lot of snow cones.}"];
      return {
        prompt: `${lead} What do you pick?`,
        options: [
          { id: "c_talent.piano", label: "Piano lessons", hint: money ? "the most expensive" : "practice every day", act: "study", style: "learn", weight: 0.2, apply: set("piano", "You started piano lessons with {an old lady who smelled like peppermints|a teacher at the church|a college student who was very patient}, {and practiced scales while the other kids played outside.|and by spring you could play “Heart and Soul” with anyone.}") },
          { id: "c_talent.sport", label: sport[1], hint: sport[2], act: "exercise", style: "health", weight: 0.3, apply: set(sport[0], sport[3]) },
          { id: "c_talent.scouts", label: s.sex === "female" && s.year < 2018 ? "Join the Girl Scouts" : "Join the Scouts", hint: "badges and campouts", act: "socialize", style: "social", weight: 0.18, apply: set("scouts", `You joined the ${s.sex === "female" && s.year < 2018 ? "Girl Scouts" : "Scouts"}, {earned a sash full of badges,|sold ${s.sex === "female" && s.year < 2018 ? "Girl Scout cookies door to door" : "popcorn door to door"},} and {learned to build a fire on the first campout.|got very good at knots.}`) },
          { id: "c_talent.dance", label: s.year >= 1975 ? ctx.rng.pick(["Karate classes", "Dance classes"]) : "Dance classes", hint: "a recital, or a belt", act: "exercise", style: "risk", weight: 0.14, apply: (s2, c) => { const karate = s2.year >= 1975 && c.rng() < 0.5; s2.flags.talent = karate ? "karate" : "dance"; return { text: karate ? c.w("You started karate, {bowed to the sensei every time,|yelled “Hi-yah!” at everything for a year,} and {earned your yellow belt by spring.|broke a board at the demonstration.}") : c.w("You started dance classes, {in tap shoes that clicked all over the kitchen,|and wore a sequined costume at the recital,} and {missed one step and kept smiling anyway.|did not want to take the costume off.}"), mood: 4 }; } },
          { id: "c_talent.art", label: s.year >= 2012 ? "A coding club" : "Art classes", hint: s.year >= 2012 ? "make your own game" : "paint and clay", act: "hobby", style: "learn", weight: 0.1, apply: s.year >= 2012 ? set("code", "You joined a coding club and {made a game where a cat eats tacos.|learned that computers do exactly what you say, not what you mean.}") : set("art", "You took art classes, {made a lopsided clay pot that your grandmother used for thirty years,|painted a horse that looked like a dog,} and {loved every minute.|got your painting hung at the library.}") },
          { id: "c_talent.none", label: "Nothing. Just play", hint: "free time is the best time", act: "rest", style: "self", weight: 0.08, apply: s2 => { s2.flags.talent = "none"; return { text: "You didn't want any activity. You just wanted to play outside until dinner, and that's what you did.", mood: 2 }; } },
        ],
      };
    },
  },
  {
    id: "c_bullied", domain: "family", channel: "bad", once: true, ages: [7, 12], when: school, p: () => 0.06,
    choice: (s, ctx) => {
      const who = grownUp(s, ctx), sib = olderSibs(s).find(x => s.age - x.bornAt >= 12), f = bestFriend(s);
      const [lead, then] = scene(ctx, [
        ["A bigger kid keeps taking your lunch money on the walk to school.", "When a bigger kid kept taking your lunch money,"],
        ["A group of kids keeps making fun of your clothes.", "When kids kept making fun of your clothes,"],
        ["Someone keeps knocking your books out of your arms in the hallway.", "When someone kept knocking your books out of your arms,"],
        s.year >= 2008 ? ["Kids from your class have been posting mean things about you online.", "When kids from your class kept posting mean things about you online,"] : null,
        ["A kid on the bus calls you names every single day.", "When a kid on the bus called you names every day,"],
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "c_bullied.teacher", label: "Tell a teacher", hint: "let a grown-up handle it", act: "seekHelp", style: "social", weight: 0.28, apply: () => ({ text: `${then} you told your teacher, who handled it quietly. It stopped, and you learned that telling is not tattling.`, mood: 1 }) },
          { id: "c_bullied.home", label: `Tell ${who}`, hint: "they'll know what to do", act: "talk", style: "family", weight: 0.25, apply: () => ({ text: `${then} you told ${who}, who called the school the next morning and made you pancakes. It got better.`, mood: 1 }) },
          { id: "c_bullied.stand", label: "Stand up to them", hint: "look them in the eye", act: "insist", style: "risk", weight: 0.15, apply: (s2, c) => (c.rng() < 0.6 ? { text: `${then} you finally looked them in the eye and said “Knock it off.” They did, a little stunned.`, mood: 4 } : { text: `${then} you stood up to them and ended up in the principal's office too. Your ${who === "Grandma" ? "grandmother" : "parents"} were secretly a little proud.`, mood: 0 }) },
          { id: "c_bullied.sib", label: sib ? `Tell ${sibShort(sib)}` : f ? `Stick close to ${f.call}` : "Find a new route and new friends", hint: sib ? "a big sibling helps" : "safety in numbers", act: "seekHelp", style: "social", weight: 0.17, apply: () => ({ text: sib ? `${then} you told ${sibName(sib)}, who had a word with them. Nobody bothered you again.` : f ? `${then} you stuck close to ${f.call}, and the two of you together were not worth the trouble.` : `${then} you found a new route and a new lunch table, and things got quieter.` , mood: 1 }) },
          { id: "c_bullied.endure", label: "Keep quiet and wait it out", hint: "maybe it stops", act: "avoid", style: "safe", weight: 0.15, apply: () => ({ text: `${then} you kept it to yourself and waited it out. It stopped eventually, but you remember it.`, mood: -4 }) },
        ],
      };
    },
  },
  {
    id: "c_showTell", once: true, ages: [5, 8], when: school, p: () => 0.15,
    choice: (s, ctx) => {
      const baby = youngerSibs(s, 0).find(x => s.age - x.bornAt <= 2), pet = s.flags.pet;
      return {
        prompt: `It's your turn for show-and-tell on Friday. What do you bring?`,
        options: [
          { id: "c_showTell.pet", label: pet ? `${pet.name} the ${pet.noun}` : "The family dog", hint: "a crowd-pleaser", act: "socialize", style: "risk", weight: 0.25, apply: (s2, c) => ({ text: c.w(`For show-and-tell you brought ${pet ? `${pet.name} the ${pet.noun}` : "the family dog"}, {who escaped and ran a lap around the classroom.|and the whole class wanted to pet it at once.|who sat perfectly still and made you look like a genius.}`), mood: 4 }) },
          { id: "c_showTell.medal", label: "Grandpa's medal from the war", hint: "a real piece of history", act: "talk", style: "family", weight: 0.2, apply: () => ({ text: "For show-and-tell you brought your grandfather's medal from the war and told the story he told you. Your teacher wrote him a thank-you note.", mood: 3 }) },
          { id: "c_showTell.rocks", label: "Your rock collection", hint: "you know every one", act: "study", style: "learn", weight: 0.25, apply: (s2, c) => ({ text: c.w("For show-and-tell you brought your rock collection {in an egg carton|in a shoebox} and talked about each one {for much longer than the five minutes allowed.|until the bell rang.}"), mood: 3 }) },
          { id: "c_showTell.baby", label: baby ? `Your baby ${baby.relation === "youngerBrother" ? "brother" : "sister"}` : "A bug in a jar", hint: baby ? "Mom has to come too" : "very much alive", act: "socialize", style: "social", weight: 0.15, apply: () => ({ text: baby ? `For show-and-tell you brought ${sibName(baby)}, with Mom, and the baby slept through the whole thing to great applause.` : "For show-and-tell you brought a praying mantis in a jar with holes in the lid. Half the class screamed; the other half wanted one.", mood: 3 }) },
          { id: "c_showTell.forgot", label: "Forget, and improvise", hint: "it's in your pocket somewhere", act: "wait", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w("You forgot about show-and-tell and presented {a rubber band and a gum wrapper|your own shoe|a really good knock-knock joke} with total confidence. It went over surprisingly well."), mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "c_lemonade", domain: "wealth", channel: "good", once: true, ages: [6, 11], when: atHome, p: () => 0.1,
    choice: (s, ctx) => {
      const price = s.year < 1970 ? "a nickel" : s.year < 1990 ? "a quarter" : s.year < 2010 ? "fifty cents" : "a dollar", f = bestFriend(s);
      return {
        prompt: `It's a hot Saturday, and you want to open a lemonade stand${f ? ` with ${f.call}` : ""}. How do you run it?`,
        options: [
          { id: "c_lemonade.classic", label: `Classic lemonade, ${price} a cup`, hint: "a card table and a sign", act: "sideJob", style: "safe", weight: 0.35, apply: (s2, c) => ({ text: c.w(`You ran a lemonade stand at ${price} a cup on a card table at the end of the driveway, {made four dollars, and drank most of the profits.|and the mailman bought two cups.}`), mood: 3 }) },
          { id: "c_lemonade.cookies", label: "Add cookies and charge more", hint: "upsell", act: "startup", style: "risk", weight: 0.2, apply: () => ({ text: "You added homemade cookies to your lemonade stand and doubled the price. You sold out by noon and felt like a tycoon.", mood: 4 }) },
          { id: "c_lemonade.site", label: "Set up by the construction site", hint: "thirsty customers", act: "startup", style: "risk", weight: 0.15, apply: () => ({ text: "You set up your lemonade stand next to the construction site down the block, and the workers bought every cup and tipped you a dollar each.", mood: 5 }) },
          { id: "c_lemonade.free", label: "Give it away free", hint: "for the joy of it", act: "donate", style: "family", weight: 0.15, apply: () => ({ text: "You gave your lemonade away for free, with a sign that said “FREE (be nice).” Half the neighborhood stopped to talk.", mood: 4 }) },
          { id: "c_lemonade.charity", label: "Raise money for the animal shelter", hint: "a good cause", act: "volunteer", style: "social", weight: 0.15, apply: () => ({ text: "You ran your lemonade stand for the animal shelter and the local paper took your picture with the jar of coins.", mood: 5 }) },
        ],
      };
    },
  },
  {
    id: "c_allowance", once: true, ages: [7, 12], when: atHome, p: () => 0.1,
    choice: (s, ctx) => {
      const k = kidsCulture(s.year), buy = ctx.rng.pick(k.buy), snack = ctx.rng.pick(snackOf(s.year));
      const money = s.year < 1970 ? "a dollar" : s.year < 1990 ? "five dollars" : s.year < 2010 ? "ten dollars" : "twenty dollars";
      return {
        prompt: `You have ${money} saved from your allowance. What do you do with it?`,
        options: [
          { id: "c_allowance.save", label: "Keep saving in the piggy bank", hint: "watch it grow", act: "save", style: "safe", weight: 0.3, apply: () => ({ text: `You kept your ${money} in the piggy bank and kept adding to it. By summer you had more money than you had ever seen.`, mood: 2 }) },
          { id: "c_allowance.toy", label: `Save up for ${buy}`, hint: "a goal", act: "save", style: "learn", weight: 0.25, apply: () => ({ text: `You saved your allowance for weeks until you could buy ${buy} yourself. It meant more because you paid for it.`, mood: 4 }) },
          { id: "c_allowance.store", label: `Spend it on ${snack} for everyone`, hint: "be the hero", act: "socialize", style: "social", weight: 0.2, apply: () => ({ text: `You spent your ${money} at the corner store on ${snack} for every kid on the block, and you were a legend for exactly one afternoon.`, mood: 3 }) },
          { id: "c_allowance.give", label: "Put it in the collection plate", hint: "give it away", act: "donate", style: "family", weight: 0.1, apply: () => ({ text: `You put your ${money} in the collection at church, and the old lady in the next pew squeezed your hand.`, mood: 3 }) },
          { id: "c_allowance.cards", label: s.year >= 1998 ? "Buy trading cards" : "Buy baseball cards", hint: "they'll be worth something", act: "invest", style: "risk", weight: 0.15, apply: () => ({ text: `You spent your ${money} on ${s.year >= 1998 ? "trading cards" : "baseball cards"}, convinced they would be worth a fortune someday. ${s.year >= 1998 ? "One was, sort of." : "They mostly weren't, but you kept them."}`, mood: 3 }) },
        ],
      };
    },
  },
  {
    id: "c_toyCraze", once: true, ages: [6, 11], when: atHome, p: () => 0.12,
    choice: (s, ctx) => {
      const toy = ctx.rng.pick(kidsCulture(s.year).toys), who = grownUp(s, ctx), money = homeMoney(s, ctx) === "tight";
      return {
        prompt: `${scene(ctx, [`Every kid at school has ${toy}, except you.`, `${toy[0].toUpperCase() + toy.slice(1)} is all anyone talks about at recess this year.`, money ? `You want ${toy} so badly, but you know money is tight at home.` : null])} What do you do?`,
        options: [
          { id: "c_toyCraze.beg", label: `Beg ${who}`, hint: "relentlessly", act: "insist", style: "self", weight: 0.25, apply: (s2, c) => (c.rng() < (money ? 0.3 : 0.6) ? { text: `You begged ${who} for ${toy} every day for a month, and on your birthday, there it was.`, mood: 5 } : { text: `You begged ${who} for ${toy}, and the answer stayed no. You survived, which surprised you.`, mood: -2 }) },
          { id: "c_toyCraze.list", label: "Put it on your birthday list", hint: "patience", act: "wait", style: "safe", weight: 0.25, apply: () => ({ text: `You put ${toy} at the top of your birthday list, underlined three times, and waited. It was worth it.`, mood: 4 }) },
          { id: "c_toyCraze.earn", label: "Earn the money with chores", hint: "a working kid", act: "sideJob", style: "learn", weight: 0.2, apply: () => ({ text: `You raked leaves and washed cars all over the neighborhood until you could buy ${toy} yourself.`, mood: 5 }) },
          { id: "c_toyCraze.make", label: "Make your own version", hint: "cardboard and glue", act: "hobby", style: "learn", weight: 0.15, apply: () => ({ text: `You couldn't get ${toy}, so you made your own out of cardboard, tape and markers. The other kids were weirdly jealous.`, mood: 3 }) },
          { id: "c_toyCraze.skip", label: "Decide you don't care", hint: "too cool for it", act: "avoid", style: "self", weight: 0.15, apply: () => ({ text: `You decided ${toy} was overrated. By spring, everyone else had decided that too.`, mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "c_party", once: true, ages: [5, 10], when: atHome, p: () => 0.15,
    choice: (s, ctx, gu = grownUp(s, ctx)) => {
      const place = s.year >= 1980 ? "Chuck E. Cheese" : "the roller rink";
      return {
        prompt: `You're turning ${s.age + 1}, and ${gu} asked what kind of party you want. What do you pick?`,
        options: [
          { id: "c_party.place", label: `A party at ${place}`, hint: s.year >= 1980 ? "tokens and pizza" : "skates and organ music", act: "socialize", style: "social", weight: 0.3, apply: (s2, c) => ({ text: s2.year >= 1980 ? c.w("Your birthday party was at Chuck E. Cheese, {where you spent all your tokens on Skee-Ball and won a plastic spider ring.|and the giant mouse sang to you and you hid under the table.}") : c.w("Your birthday party was at the roller rink, {where you held the wall the whole time and loved it.|with a couples skate you hid in the bathroom for.}"), mood: 5 }) },
          { id: "c_party.backyard", label: "A backyard party", hint: "a sprinkler and a sheet cake", act: "socialize", style: "family", weight: 0.3, apply: (s2, c) => ({ text: c.w("You had a backyard birthday party with {a sprinkler, a sheet cake and a piñata that would not break.|pin the tail on the donkey and a water balloon fight.|a homemade cake shaped like a castle that was mostly frosting.}"), mood: 5 }) },
          { id: "c_party.sleepover", label: "A sleepover with three friends", hint: "pizza and a scary movie", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w("You had a birthday sleepover with three friends, {stayed up until 3 a.m.,|watched a movie you were too young for,} and {nobody slept.|your dad made pancakes shaped like your initials.}"), mood: 5 }) },
          { id: "c_party.small", label: "Just family and a cake", hint: "small and sweet", act: "rest", style: "family", weight: 0.12, apply: (s2, c) => ({ text: c.w("You wanted just family for your birthday: {your favorite dinner, a cake and one present you had wanted all year.|Grandma's coconut cake and a card with a five-dollar bill.}"), mood: 4 }) },
          { id: "c_party.wild", label: "A theme party: dinosaurs, everything", hint: "go big", act: "hobby", style: "risk", weight: 0.08, apply: (s2, c) => ({ text: c.w("You insisted on a {dinosaur|pirate|outer space} birthday party, and {your parents went all in, down to the napkins.|the cake was magnificent and slightly terrifying.}"), mood: 6 }) },
        ],
      };
    },
  },
  {
    id: "c_camp", once: true, ages: [8, 12], when: atHome, p: () => 0.12,
    choice: (s, ctx) => {
      const money = homeMoney(s, ctx) === "tight";
      return {
        prompt: `${money ? "Summer's here, and the church has a few scholarships for camp." : "Summer's here, and your parents are talking about sleepaway camp."} What do you want to do?`,
        options: [
          { id: "c_camp.sleepaway", label: "Go to sleepaway camp", hint: "two weeks, a lake, a cabin", act: "travel", style: "risk", weight: 0.3, apply: (s2, c) => ({ text: c.w("You went to sleepaway camp for two weeks, {cried the first night, and cried again when you had to leave.|learned to canoe, and made a friend you wrote to for years.|got poison ivy and the best summer of your life.}"), mood: 5, big: true }) },
          { id: "c_camp.day", label: "Go to day camp", hint: "home every night", act: "socialize", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w("You went to day camp at {the Y|the park district|the community center}, {made a lot of lanyards,|swam every afternoon,} and came home sunburned and happy."), mood: 3 }) },
          { id: "c_camp.church", label: "Go to church camp", hint: "songs by the campfire", act: "spiritual", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w("You went to church camp, {sang songs around the campfire with hand motions,|and the counselors were college kids who seemed impossibly cool.}"), mood: 4 }) },
          { id: "c_camp.grandma", label: "Spend the summer at Grandma's", hint: "a farm, or a porch", act: "care", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w("You spent the summer at your grandparents' {farm, gathering eggs and riding on the tractor.|house, playing cards on the porch every night.|place by the lake, fishing off the dock.}"), mood: 4 }) },
          { id: "c_camp.home", label: "Stay home and read", hint: "a stack of library books", act: "rest", style: "learn", weight: 0.15, apply: () => ({ text: "You stayed home that summer with a stack of library books taller than you, and read every one.", mood: 3 }) },
        ],
      };
    },
  },
  {
    id: "c_halloween", once: true, ages: [5, 11], when: atHome, p: () => 0.2,
    choice: (s, ctx) => {
      const store = s.year < 1985 ? "a plastic mask with an elastic band from the drugstore" : "a store-bought costume", f = bestFriend(s);
      const hero = s.year < 1970 ? "Superman" : s.year < 1985 ? "Wonder Woman" : s.year < 2000 ? "a Ninja Turtle" : s.year < 2012 ? "Spider-Man" : s.year < 2020 ? "Elsa" : "a Minecraft creeper";
      return {
        prompt: `Halloween is coming. What are you going to be?`,
        options: [
          { id: "c_halloween.ghost", label: "A ghost, in a bedsheet", hint: "homemade classic", act: "hobby", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w("For Halloween you were a ghost in an old bedsheet, {tripping over it every third house.|with eyeholes that kept sliding to the side.} You came home with a pillowcase full of candy."), mood: 4 }) },
          { id: "c_halloween.store", label: `Be ${hero}`, hint: store, act: "socialize", style: "social", weight: 0.3, apply: () => ({ text: `For Halloween you were ${hero}, and you met four other ${hero}s on your street. You traded candy with all of them.`, mood: 4 }) },
          { id: "c_halloween.homemade", label: "Build something wild out of boxes", hint: "a robot, a toaster", act: "hobby", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w("For Halloween you built a costume out of cardboard boxes, {a robot with dryer-vent arms|a toaster, with you as the toast|a working gumball machine}, and a neighbor gave you a full-size candy bar for effort."), mood: 5 }) },
          { id: "c_halloween.pair", label: f ? `A matching costume with ${f.call}` : "A group costume with friends", hint: "better together", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: f ? c.w(`For Halloween you and ${f.call} went as {salt and pepper|peanut butter and jelly|a horse, front and back}, and won the costume contest at school.`) : "For Halloween you and your friends went as the crayons in a crayon box, and won the costume contest at school.", mood: 5 }) },
          { id: "c_halloween.scary", label: "Something truly scary", hint: "a monster, fake blood", act: "insist", style: "risk", weight: 0.15, apply: () => ({ text: "For Halloween you went as something truly scary, and you made a toddler cry, then felt bad and gave the toddler your Snickers.", mood: 3 }) },
        ],
      };
    },
  },
  {
    // For the families who keep Christmas: the year you figured it out.
    id: "c_santa", once: true, ages: [6, 9], when: (s, ctx) => atHome(s) && holidayOf(s, ctx) === "Christmas", p: () => 0.3,
    choice: (s, ctx) => {
      const little = youngerSibs(s, 2)[0], who = grownUp(s, ctx);
      const lead = scene(ctx, [
        `You found the presents in ${who === "Grandma" ? "Grandma's" : "your parents'"} closet a week before Christmas, still in the store bags.`,
        "A kid at school says Santa isn't real, and the handwriting on Santa's gift tags looks a lot like Mom's.",
        "You stayed up on Christmas Eve to see Santa, and saw your father eating the cookies.",
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "c_santa.keep", label: little ? `Keep the secret for ${sibShort(little)}` : "Keep the secret", hint: "the magic is worth it", act: "care", style: "family", weight: little ? 0.35 : 0.25, apply: s2 => { s2.flags.santa = "kept"; return { text: little ? `You figured out the truth about Santa and kept it to yourself, for ${sibName(little)}'s sake. You became one of the helpers, and loved it.` : "You figured out the truth about Santa and decided to keep the secret. You got presents from Santa for three more years.", mood: 2 }; } },
          { id: "c_santa.ask", label: `Ask ${who} straight out`, hint: "the truth, please", act: "talk", style: "social", weight: 0.3, apply: s2 => { s2.flags.santa = "asked"; return { text: `You asked ${who} straight out about Santa. ${who} sat down with you and explained that Santa is a feeling people give each other. You cried a little, then felt very grown up.`, mood: 0 }; } },
          { id: "c_santa.believe", label: "Decide to believe anyway", hint: "evidence is overrated", act: "spiritual", style: "self", weight: 0.2, apply: s2 => { s2.flags.santa = "believed"; return { text: "You saw the evidence about Santa and decided to believe anyway, on purpose, for one more year.", mood: 2 }; } },
          { id: "c_santa.tell", label: "Tell everyone at school", hint: "you know something they don't", act: "insist", style: "risk", weight: 0.1, apply: s2 => { s2.flags.santa = "told"; return { text: "You announced the truth about Santa at recess, and three kids cried. Your teacher called home. It was not your finest moment.", mood: -2 }; } },
          { id: "c_santa.test", label: "Set a trap to be sure", hint: "science", act: "study", style: "learn", weight: 0.1, apply: s2 => { s2.flags.santa = "tested"; return { text: "You set up a tripwire of yarn and jingle bells by the tree. At midnight you heard your father swear quietly. Case closed.", mood: 3 }; } },
        ],
      };
    },
  },
  // ---------- small tests of character ----------
  {
    id: "c_testSign", domain: "study", channel: "bad", once: true, ages: [7, 12], when: school, p: () => 0.08,
    choice: (s, ctx) => {
      const who = grownUp(s, ctx), subject = ctx.rng.pick(["spelling", "math", "science", "social studies"]), sib = olderSibs(s).find(x => s.age - x.bornAt >= 14);
      const [lead, then] = scene(ctx, [
        [`You got a D on your ${subject} test, and it has to come back signed by a parent.`, `With a D on your ${subject} test that needed a parent's signature,`],
        [`Your teacher sent a note home about your ${subject} grade, and it needs a signature by Monday.`, `With a note about your ${subject} grade that needed signing,`],
      ]);
      return {
        prompt: `${lead} What do you do?`,
        options: [
          { id: "c_testSign.truth", label: `Show ${who} and tell the truth`, hint: "face the music", act: "talk", style: "family", weight: 0.4, apply: s2 => { s2.flags.honest = (s2.flags.honest || 0) + 1; return { text: `${then} you showed ${who} and told the truth. ${who} signed it, sighed, and sat with you every night that week to study. The next test was a B.`, mood: 1 }; } },
          { id: "c_testSign.forge", label: "Forge the signature", hint: "you've practiced", act: "avoid", style: "risk", weight: 0.15, apply: (s2, c) => { s2.flags.honest = (s2.flags.honest || 0) - 1; return c.rng() < 0.6 ? { text: `${then} you forged ${who}'s signature. Your teacher took one look and called home. It was a long evening.`, mood: -4 } : { text: `${then} you forged ${who}'s signature, and nobody ever found out. You felt weird about it for years.`, mood: -1 }; } },
          { id: "c_testSign.sib", label: sib ? `Get ${sibShort(sib)} to sign it` : "Wait until a good moment", hint: sib ? "they owe you" : "timing is everything", act: "seekHelp", style: "social", weight: 0.15, apply: () => ({ text: sib ? `${then} you begged ${sibName(sib)} to sign it. ${cap(sibName(sib))} refused, then helped you tell ${who} instead.` : `${then} you waited until ${who} was in a great mood after dinner, then slid the paper over. It went better than you feared.`, mood: 0 }) },
          { id: "c_testSign.lose", label: "“Lose” it", hint: "what test?", act: "avoid", style: "self", weight: 0.1, apply: () => ({ text: `${then} you “lost” it at the bottom of your backpack. At the parent-teacher conference, it was found.`, mood: -3 }) },
          { id: "c_testSign.retake", label: "Ask to retake the test first", hint: "fix it, then tell", act: "study", style: "learn", weight: 0.2, apply: () => ({ text: `${then} you asked your teacher if you could retake it, studied all weekend, and brought home a B to go with the D.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "c_window", once: true, ages: [7, 12], when: atHome, p: () => 0.06,
    choice: (s, ctx, gu = grownUp(s, ctx)) => {
      const ball = ctx.rng.pick(["baseball", "football", "kickball", "Frisbee"]), neighbor = ctx.rng.pick(["Mr. Kowalski", "Mrs. Henderson", "Mr. Russo", "Mrs. Washington", "Mrs. Park"]), sib = anySib(s, ctx, 4);
      return {
        prompt: `Your ${ball} just went through ${neighbor}'s front window. Everyone else ran. What do you do?`,
        options: [
          { id: "c_window.confess", label: "Knock on the door and confess", hint: "the hardest walk", act: "reconcile", style: "family", weight: 0.35, apply: s2 => { s2.flags.honest = (s2.flags.honest || 0) + 1; return { text: `When your ${ball} broke ${neighbor}'s window, you knocked on the door and confessed. ${neighbor} was quiet a long moment, then said, “Thank you for telling me.” You paid it off mowing the lawn.`, mood: 1 }; } },
          { id: "c_window.run", label: "Run", hint: "nobody saw", act: "avoid", style: "risk", weight: 0.2, apply: (s2, c) => { s2.flags.honest = (s2.flags.honest || 0) - 1; return c.rng() < 0.5 ? { text: `When your ${ball} broke ${neighbor}'s window, you ran. Your name was written on the ${ball}. ${neighbor} brought it over at dinnertime.`, mood: -4 } : { text: `When your ${ball} broke ${neighbor}'s window, you ran, and nobody ever knew. You still feel it when you drive past that house.`, mood: -1 }; } },
          { id: "c_window.blame", label: sib ? `Blame ${sibShort(sib)}` : "Blame the kid down the street", hint: "risky", act: "insist", style: "self", weight: 0.1, apply: () => ({ text: `When your ${ball} broke ${neighbor}'s window, you blamed ${sib ? sibName(sib) : "the kid down the street"}. It took about ten minutes for the truth to come out, and you were grounded for two weeks.`, mood: -4 }) },
          { id: "c_window.parents", label: `Tell ${gu} first`, hint: "get backup", act: "seekHelp", style: "social", weight: 0.2, apply: () => ({ text: `When your ${ball} broke ${neighbor}'s window, you told ${gu} first, and you went over together. You paid for it out of your allowance for half a year.`, mood: 0 }) },
          { id: "c_window.work", label: "Offer to work it off", hint: "lawns, leaves, snow", act: "negotiate", style: "learn", weight: 0.15, apply: () => ({ text: `When your ${ball} broke ${neighbor}'s window, you offered to work it off. You raked ${neighbor}'s leaves all fall, and by winter ${neighbor} was paying you to shovel.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "c_classPet", once: true, ages: [6, 9], when: school, p: () => 0.1,
    choice: (s, ctx, gu = grownUp(s, ctx)) => {
      const pet = ctx.rng.pick([["hamster", "Mr. Whiskers"], ["guinea pig", "Cupcake"], ["gerbil", "Speedy"]]);
      return {
        prompt: `You got to take ${pet[1]}, the class ${pet[0]}, home for the weekend, and on Saturday night the cage was empty. What do you do?`,
        options: [
          { id: "c_classPet.search", label: "Search the whole house all night", hint: "with a flashlight", act: "pushThrough", style: "risk", weight: 0.3, apply: (s2, c) => ({ text: c.w(`When ${pet[1]} the class ${pet[0]} escaped, you searched the house with a flashlight until two in the morning and found {the little escape artist asleep in your father's slipper.|${pet[1]} inside the couch cushions, eating a Cheerio.}`), mood: 3 }) },
          { id: "c_classPet.trap", label: "Set a peanut-butter trap", hint: "a bucket and a ramp", act: "study", style: "learn", weight: 0.2, apply: () => ({ text: `When ${pet[1]} the class ${pet[0]} escaped, you built a trap with a bucket, a ramp of books and peanut butter. In the morning, ${pet[1]} was in the bucket, looking embarrassed.`, mood: 4 }) },
          { id: "c_classPet.tell", label: "Tell your teacher on Monday", hint: "honesty", act: "talk", style: "safe", weight: 0.2, apply: () => ({ text: `When ${pet[1]} the class ${pet[0]} escaped and stayed lost, you told your teacher the truth on Monday. ${pet[1]} turned up a week later in your basement, fat and happy.`, mood: -1 }) },
          { id: "c_classPet.help", label: `Wake up ${gu}`, hint: "a grown-up crisis", act: "seekHelp", style: "family", weight: 0.2, apply: () => ({ text: `When ${pet[1]} the class ${pet[0]} escaped, you woke up ${gu}, who found ${pet[1]} behind the fridge with a yardstick and a lot of patience.`, mood: 3 }) },
          { id: "c_classPet.replace", label: "Buy an identical one at the pet store", hint: "nobody will know", act: "avoid", style: "self", weight: 0.1, apply: () => ({ text: `When ${pet[1]} the class ${pet[0]} escaped, you and ${gu} bought a look-alike at the pet store. The real ${pet[1]} showed up a week later, and the class had two.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "c_scienceFair", domain: "study", channel: "good", once: true, ages: [8, 12], when: school, p: () => 0.12,
    choice: (s, ctx, gu = grownUp(s, ctx)) => ({
      prompt: `The science fair is in three weeks. What's your project?`,
      options: [
        { id: "c_scienceFair.volcano", label: "A baking-soda volcano", hint: "a classic for a reason", act: "hobby", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w("For the science fair you built a baking-soda volcano, {and it erupted all over the judge's shoes.|and it was so well painted you got a ribbon for “presentation.”|and it fizzled, so you explained why, and the judge liked that better.}"), mood: 3 }) },
        { id: "c_scienceFair.plants", label: "Do plants grow better with music?", hint: "a real experiment", act: "study", style: "learn", weight: 0.2, apply: (s2, c) => (c.roll("study", "good", 0.4) ? { text: "For the science fair you grew bean plants to different music for a month. The rock-and-roll beans won, and so did you: first place.", mood: 6 } : { text: "For the science fair you grew bean plants to different music. They all died equally, which was, technically, a result.", mood: 1 }) },
        { id: "c_scienceFair.potato", label: "A potato battery", hint: "light a bulb with a potato", act: "study", style: "learn", weight: 0.2, apply: () => ({ text: "For the science fair you lit a tiny bulb with four potatoes and some wire, and your grandfather asked you to explain it three times.", mood: 4 }) },
        { id: "c_scienceFair.big", label: s.year >= 2000 ? "Build a robot" : "Build a model rocket", hint: "go big", act: "pushThrough", style: "risk", weight: 0.15, apply: (s2, c) => (c.roll("study", "good", 0.4) ? { text: `For the science fair you built ${s2.year >= 2000 ? "a robot that could follow a line" : "a model rocket that actually launched"}, and won a trip to the regional fair.`, mood: 7 } : { text: `For the science fair you built ${s2.year >= 2000 ? "a robot that spun in circles" : "a model rocket that went sideways into the bleachers"}. The judges admired your ambition.`, mood: 1 }) },
        { id: "c_scienceFair.parent", label: `Let ${gu} “help”`, hint: "a lot of help", act: "seekHelp", style: "family", weight: 0.15, apply: () => ({ text: `${gu} “helped” with your science fair project until it was clearly ${gu}'s project. It came in second, and you both pretended not to know why.`, mood: 2 }) },
      ],
    }),
  },
  {
    id: "c_misjudged", once: true, ages: [7, 12], when: school, p: () => 0.06,
    choice: (s, ctx, gu = grownUp(s, ctx)) => {
      const thing = ctx.rng.pick(["the broken pencil sharpener", "the missing recess ball", "a note passed in class", "the mess in the reading corner"]), f = bestFriend(s);
      return {
        prompt: `Your teacher blamed you for ${thing}, and it wasn't you. What do you do?`,
        options: [
          { id: "c_misjudged.explain", label: "Explain calmly after class", hint: "one on one", act: "talk", style: "social", weight: 0.35, apply: () => ({ text: `Blamed for ${thing}, you stayed after class and explained calmly. Your teacher listened, and the next day apologized in front of everyone.`, mood: 3 }) },
          { id: "c_misjudged.parent", label: `Tell ${gu}`, hint: "a grown-up on your side", act: "seekHelp", style: "family", weight: 0.2, apply: () => ({ text: `Blamed for ${thing}, you told ${gu}, who wrote a polite but firm note. It was sorted out by Wednesday.`, mood: 2 }) },
          { id: "c_misjudged.witness", label: f ? `Get ${f.call} to back you up` : "Find a witness", hint: "the truth needs a friend", act: "seekHelp", style: "social", weight: 0.15, apply: () => ({ text: `Blamed for ${thing}, you got ${f ? f.call : "a classmate who saw it"} to tell the teacher what really happened. The real culprit confessed at recess.`, mood: 3 }) },
          { id: "c_misjudged.protest", label: "Argue right there in class", hint: "it isn't fair", act: "insist", style: "risk", weight: 0.15, apply: () => ({ text: `Blamed for ${thing}, you argued right there in class and got sent to the hallway. You were right, and it didn't feel like winning.`, mood: -2 }) },
          { id: "c_misjudged.swallow", label: "Let it go", hint: "not worth the trouble", act: "avoid", style: "safe", weight: 0.15, apply: () => ({ text: `Blamed for ${thing}, you let it go. It bugged you for a long time, longer than the teacher ever remembered it.`, mood: -2 }) },
        ],
      };
    },
  },
  {
    id: "c_found", once: true, ages: [6, 12], when: atHome, p: () => 0.06,
    choice: (s, ctx, gu = grownUp(s, ctx)) => {
      const bill = s.year < 1975 ? "a five-dollar bill" : s.year < 2000 ? "a twenty-dollar bill" : "a fifty-dollar bill", snack = ctx.rng.pick(snackOf(s.year));
      const where = ctx.rng.pick(["on the playground", "in the parking lot at the grocery store", "on the sidewalk outside church", "under the bleachers"]);
      return {
        prompt: `You found ${bill} ${where}. Nobody's around. What do you do?`,
        options: [
          { id: "c_found.turnIn", label: "Turn it in", hint: "someone's missing it", act: "donate", style: "safe", weight: 0.3, apply: s2 => { s2.flags.honest = (s2.flags.honest || 0) + 1; return { text: `You found ${bill} ${where} and turned it in. A week later an old man came by to thank you; it was his grocery money.`, mood: 3 }; } },
          { id: "c_found.keep", label: "Keep it", hint: "finders keepers", act: "save", style: "self", weight: 0.25, apply: () => ({ text: `You found ${bill} ${where} and kept it, folded small in your sock drawer, too nervous to spend it for a month.`, mood: 1 }) },
          { id: "c_found.treat", label: `Buy ${snack} for all your friends`, hint: "share the luck", act: "socialize", style: "social", weight: 0.2, apply: () => ({ text: `You found ${bill} ${where} and bought ${snack} for every kid you knew. It was the best afternoon of the summer.`, mood: 4 }) },
          { id: "c_found.ask", label: `Ask ${gu} what to do`, hint: "let them decide", act: "seekHelp", style: "family", weight: 0.15, apply: () => ({ text: `You found ${bill} ${where} and asked ${gu}, who helped you put up a “FOUND MONEY” sign. Nobody called, so you got to keep it, guilt-free.`, mood: 3 }) },
          { id: "c_found.give", label: "Put it in the church box", hint: "it was never yours", act: "donate", style: "family", weight: 0.1, apply: () => ({ text: `You found ${bill} ${where} and put it in the poor box at church. You didn't tell anyone, which made it better.`, mood: 3 }) },
        ],
      };
    },
  },
  {
    id: "c_sibBlame", domain: "family", channel: "bad", tags: ["siblings"], about: "siblings", once: true, ages: [6, 12], when: s => atHome(s) && bornSibs(s, 4).length > 0, p: () => 0.08,
    choice: (s, ctx) => {
      const x = ctx.rng.pick(bornSibs(s, 4)), name = sibName(x), who = grownUp(s, ctx);
      const broke = ctx.rng.pick(["Mom's favorite vase", "the living room lamp", "the TV remote", "Grandma's cookie jar"]);
      return {
        prompt: `${cap(name)} broke ${broke} and told ${who} you did it. What do you do?`,
        options: [
          { id: "c_sibBlame.truth", label: "Tell the truth", hint: "it wasn't you", act: "talk", style: "safe", weight: 0.3, apply: () => ({ text: `When ${name} broke ${broke} and blamed you, you told ${who} the truth. ${who} figured it out from the glue on ${name}'s fingers.`, mood: 1 }) },
          { id: "c_sibBlame.cover", label: "Take the blame", hint: "you'll cash it in later", act: "care", style: "family", weight: 0.2, apply: () => ({ text: `When ${name} broke ${broke} and blamed you, you took the blame. ${cap(name)} owed you for years and knew it.`, mood: 0 }) },
          { id: "c_sibBlame.deal", label: "Make a deal with them", hint: "your silence has a price", act: "negotiate", style: "risk", weight: 0.2, apply: () => ({ text: `When ${name} broke ${broke} and blamed you, you negotiated: you'd keep quiet in exchange for a month of their dessert. The deal held.`, mood: 2 }) },
          { id: "c_sibBlame.fight", label: "Fight it out", hint: "loudly", act: "insist", style: "self", weight: 0.15, apply: () => ({ text: `When ${name} broke ${broke} and blamed you, you two got into a screaming match, and you both lost TV for a week.`, mood: -3 }) },
          { id: "c_sibBlame.fix", label: "Fix it together", hint: "glue and teamwork", act: "reconcile", style: "social", weight: 0.15, apply: () => ({ text: `When ${name} broke ${broke} and blamed you, you said, “Let's just fix it.” You glued it together side by side, and ${who} pretended not to notice the cracks.`, mood: 3 }) },
        ],
      };
    },
  },
  {
    id: "c_newKid", domain: "family", channel: "good", tags: ["friends"], once: true, ages: [7, 12], when: school, p: () => 0.08,
    choice: (s, ctx) => {
      const where = ctx.rng.pick(s.year < 1980 ? ["Italy", "Mexico", "Cuba", "Korea", "Poland"] : s.year < 2000 ? ["Vietnam", "Mexico", "India", "El Salvador", "Russia"] : ["Mexico", "India", "Somalia", "Guatemala", "Ukraine", "the Philippines"]);
      const sex = ctx.rng() < 0.7 ? s.sex : s.sex === "male" ? "female" : "male";
      const f = ctx.person({ role: "friend", sex, birthYear: s.birthYear, how: "school" });
      f.call = ctx.rng.pick(NEW_KID[where][sex === "male" ? 0 : 1]); f.name = f.call;
      return {
        prompt: `A new kid, ${f.call}, just moved here from ${where} and doesn't speak much English yet. ${cap(they(f))} sits alone at lunch. What do you do?`,
        options: [
          { id: "c_newKid.lunch", label: "Invite them to your lunch table", hint: "scoot over", act: "socialize", style: "social", weight: 0.3, apply: s2 => { s2.friends.push(f); return { text: `You invited ${f.call}, the new kid from ${where}, to your lunch table. By spring you were teaching ${them(f)} slang, and ${they(f)} was teaching you to swear in another language.`, mood: 4 }; } },
          { id: "c_newKid.teach", label: "Teach them the playground games", hint: "four square needs no words", act: "care", style: "family", weight: 0.2, apply: s2 => { s2.friends.push(f); return { text: `You taught ${f.call}, the new kid from ${where}, how to play four square. ${cap(they(f))} beat you by Friday.`, mood: 4 }; } },
          { id: "c_newKid.learn", label: "Learn a few words of their language", hint: "meet halfway", act: "study", style: "learn", weight: 0.15, apply: s2 => { s2.friends.push(f); return { text: `You asked ${f.call}, the new kid from ${where}, to teach you a few words. ${cap(their(f))} whole face lit up.`, mood: 4 }; } },
          { id: "c_newKid.teacher", label: "Ask the teacher how to help", hint: "a grown-up idea", act: "seekHelp", style: "safe", weight: 0.15, apply: () => ({ text: `You asked your teacher how to help ${f.call}, the new kid from ${where}, and became the official class buddy, with a badge and everything.`, mood: 3 }) },
          { id: "c_newKid.nothing", label: "Leave them alone", hint: "you don't know what to say", act: "avoid", style: "self", weight: 0.2, apply: () => ({ text: `You didn't know what to say to ${f.call}, the new kid from ${where}, so you said nothing. Later you wished you had.`, mood: -1 }) },
        ],
      };
    },
  },
  {
    id: "c_picky", once: true, ages: [4, 9], when: atHome, p: () => 0.12,
    choice: (s, ctx) => {
      const food = ctx.rng.pick(s.year < 1975 ? ["liver and onions", "lima beans", "creamed spinach", "tuna casserole"] : ["broccoli", "brussels sprouts", "meatloaf", "green beans"]), who = grownUp(s, ctx);
      return {
        prompt: `It's ${food} for dinner, and ${who} says nobody leaves the table until the plate is clean. What do you do?`,
        options: [
          { id: "c_picky.dog", label: "Feed it to the dog under the table", hint: "a loyal accomplice", act: "avoid", style: "risk", weight: 0.25, apply: () => ({ text: `Faced with ${food}, you fed it to the dog under the table, bite by bite. The dog was sick that night, and you were found out.`, mood: -1 }) },
          { id: "c_picky.napkin", label: "Hide it in your napkin", hint: "a classic move", act: "avoid", style: "self", weight: 0.2, apply: () => ({ text: `Faced with ${food}, you hid it in your napkin and “went to the bathroom.” ${who} found the napkin in the trash, and laughed instead of yelling.`, mood: 1 }) },
          { id: "c_picky.fast", label: "Hold your nose and eat it fast", hint: "get it over with", act: "pushThrough", style: "safe", weight: 0.25, apply: () => ({ text: `Faced with ${food}, you held your nose and ate it all in four enormous bites. You got dessert and a lot of respect.`, mood: 1 }) },
          { id: "c_picky.deal", label: "Negotiate: three bites", hint: "a reasonable offer", act: "negotiate", style: "social", weight: 0.2, apply: () => ({ text: `Faced with ${food}, you negotiated ${who} down to three bites. Years later, you would actually come to like ${food}, and never admit it.`, mood: 1 }) },
          { id: "c_picky.sit", label: "Sit there all night", hint: "a battle of wills", act: "insist", style: "self", weight: 0.1, apply: () => ({ text: `Faced with ${food}, you sat at the table until bedtime without eating a bite. ${who} gave up first. It was a legendary victory.`, mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "c_chores", domain: "wealth", channel: "good", once: true, ages: [9, 12], when: atHome, p: () => 0.12,
    choice: (s, ctx) => {
      const route = s.year < 2000;
      return {
        prompt: `You want to earn some money of your own. What's the job?`,
        options: [
          { id: "c_chores.paper", label: route ? "Take a paper route" : "Walk the neighbors' dogs", hint: route ? "up at five, every day" : "a dollar a dog", act: "sideJob", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: route ? c.w("You took a paper route, folding papers at five in the morning and {throwing them onto porches with growing accuracy.|collecting from customers on Fridays, who sometimes tipped in cookies.}") : c.w("You started walking the neighbors' dogs, {three at once, which was a lot of leashes.|and learned every dog's name before every owner's.}"), mood: 3 }) },
          { id: "c_chores.lawns", label: "Mow lawns", hint: s.year < 2000 ? "five bucks a yard" : "twenty bucks a yard", act: "sideJob", style: "learn", weight: 0.3, apply: (s2, c) => ({ text: c.w("You mowed lawns all summer with {your father's old push mower|a borrowed mower}, {made more money than you knew what to do with,|and got a farmer's tan that lasted until October.}"), mood: 3 }) },
          { id: "c_chores.home", label: "Do extra chores at home", hint: "dishes and laundry", act: "care", style: "family", weight: 0.2, apply: () => ({ text: "You did extra chores at home for money: dishes, laundry, cleaning out the garage. You found twelve dollars in the couch cushions as a bonus.", mood: 2 }) },
          { id: "c_chores.sell", label: "Sell candy at school", hint: "buy low, sell high", act: "startup", style: "risk", weight: 0.1, apply: (s2, c) => (c.rng() < 0.5 ? { text: "You bought candy in bulk and sold it at school at a markup. Business was booming until the principal shut you down.", mood: 2 } : { text: "You bought candy in bulk to sell at school, then ate most of your inventory. A hard lesson in business.", mood: 0 }) },
          { id: "c_chores.none", label: "Ask for a bigger allowance", hint: "it's worth a try", act: "negotiate", style: "self", weight: 0.1, apply: () => ({ text: "You asked for a bigger allowance with a speech about inflation. You got a raise of a quarter and a lot of laughter.", mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "c_talentShow", once: true, ages: [7, 12], when: school, p: () => 0.08,
    choice: (s, ctx) => {
      const f = bestFriend(s), song = s.year < 1965 ? "a Patsy Cline song" : s.year < 1980 ? "a Jackson 5 song" : s.year < 1995 ? "a Whitney Houston song" : s.year < 2010 ? "a Britney Spears song" : "a Taylor Swift song";
      return {
        prompt: `The school talent show is coming up. What's your act?`,
        options: [
          { id: "c_talentShow.sing", label: `Sing ${song}`, hint: "all the high notes", act: "hobby", style: "risk", weight: 0.25, apply: (s2, c) => (c.rng() < 0.55 ? { text: `At the school talent show you sang ${song}, hit the high note, and the gym went wild.`, mood: 6 } : { text: `At the school talent show you sang ${song}, forgot the second verse, and kept going with “la la la” until the end. People cheered anyway.`, mood: 2 }) },
          { id: "c_talentShow.magic", label: "Do magic tricks", hint: "a card up your sleeve", act: "hobby", style: "learn", weight: 0.2, apply: () => ({ text: "At the school talent show you did card tricks, dropped the deck, and turned it into a joke so smoothly the teachers thought it was planned.", mood: 4 }) },
          { id: "c_talentShow.dance", label: f ? `A dance routine with ${f.call}` : "A dance routine with friends", hint: "practiced in the basement", act: "socialize", style: "social", weight: 0.25, apply: () => ({ text: `At the school talent show you did a dance routine${f ? ` with ${f.call}` : " with friends"}, practiced for weeks in somebody's basement. You were out of sync and happier than anyone on stage.`, mood: 5 }) },
          { id: "c_talentShow.comedy", label: "A comedy routine", hint: "impressions of the teachers", act: "insist", style: "risk", weight: 0.1, apply: () => ({ text: "At the school talent show you did impressions of the teachers. The principal laughed hardest, which was a relief.", mood: 5 }) },
          { id: "c_talentShow.crew", label: "Run the lights instead", hint: "behind the scenes", act: "wait", style: "safe", weight: 0.2, apply: () => ({ text: "You ran the lights for the school talent show instead of performing, and liked being the one who made everyone else look good.", mood: 2 }) },
        ],
      };
    },
  },
  {
    id: "c_twoHomes", domain: "family", channel: "bad", tags: ["father", "mother"], once: true, ages: [5, 12], when: s => atHome(s) && s.flags.parentsSplit && s.father.alive && s.mother.alive, p: () => 0.3,
    choice: (s, ctx) => {
      const lives = liveWith(s, ctx), other = lives === "mother" ? "Dad" : "Mom", home = lives === "mother" ? "Mom" : "Dad";
      return {
        prompt: `Since the divorce you live mostly with ${home} and see ${other} every other weekend, and some days it's a lot. How do you cope?`,
        options: [
          { id: "c_twoHomes.counselor", label: "Talk to the school counselor", hint: "someone outside the family", act: "counsel", style: "health", weight: 0.2, apply: () => ({ text: `After your parents split, you started talking to the school counselor on Tuesdays, who had a bowl of candy and a way of listening.`, mood: 2 }) },
          { id: "c_twoHomes.journal", label: "Keep a journal", hint: "write it down", act: "hobby", style: "learn", weight: 0.2, apply: () => ({ text: "After your parents split, you started a journal with a little lock. You filled three of them.", mood: 1 }) },
          { id: "c_twoHomes.help", label: `Help ${home} out more`, hint: "be the grown-up", act: "care", style: "family", weight: 0.25, apply: () => ({ text: `After your parents split, you started helping ${home} more: making lunches, folding laundry. You grew up a little faster than you needed to.`, mood: 0 }) },
          { id: "c_twoHomes.tell", label: "Tell them both how you feel", hint: "brave", act: "talk", style: "social", weight: 0.15, apply: () => ({ text: `After your parents split, you told them both, separately, that you missed being a family. They both cried, and they started being kinder to each other at drop-offs.`, mood: 2 }) },
          { id: "c_twoHomes.act", label: "Act out at school", hint: "it has to go somewhere", act: "insist", style: "self", weight: 0.2, apply: () => ({ text: "After your parents split, you got sent to the principal's office twice in a month. The principal, it turned out, was divorced too, and understood.", mood: -2 }) },
        ],
      };
    },
  },
  {
    id: "c_tvRules", once: true, ages: [6, 11], when: atHome, p: () => 0.08,
    choice: (s, ctx) => {
      const screen = s.year < 1985 ? "TV" : s.year < 2008 ? "video games" : "the tablet", who = grownUp(s, ctx);
      return {
        prompt: `${who} has decided you get only one hour of ${screen} a day. What do you do?`,
        options: [
          { id: "c_tvRules.sneak", label: "Sneak extra time", hint: "they can't watch you always", act: "avoid", style: "risk", weight: 0.25, apply: () => ({ text: `With only one hour of ${screen} a day, you snuck more after bedtime. ${who} felt the warm ${screen === "TV" ? "TV set" : "device"} one night and that was that.`, mood: -1 }) },
          { id: "c_tvRules.outside", label: "Go play outside instead", hint: "until the streetlights come on", act: "exercise", style: "health", weight: 0.3, apply: () => ({ text: `With only one hour of ${screen} a day, you started playing outside until dinner, and built a fort in the woods behind the houses.`, mood: 3 }) },
          { id: "c_tvRules.read", label: "Read instead", hint: "a flashlight under the covers", act: "study", style: "learn", weight: 0.2, apply: () => ({ text: `With only one hour of ${screen} a day, you started reading under the covers with a flashlight, and finished a whole series by summer.`, mood: 3 }) },
          { id: "c_tvRules.negotiate", label: "Negotiate weekends", hint: "a fair deal", act: "negotiate", style: "social", weight: 0.15, apply: () => ({ text: `You negotiated a better ${screen} deal: one hour on school days, two on weekends, if homework was done first. It held for years.`, mood: 2 }) },
          { id: "c_tvRules.accept", label: "Accept it", hint: "rules are rules", act: "wait", style: "safe", weight: 0.1, apply: () => ({ text: `You accepted one hour of ${screen} a day without a fight, and ${who} was so surprised you got an extra half hour on Saturdays.`, mood: 1 }) },
        ],
      };
    },
  },
  {
    // The Scholastic book fair, in elementary school libraries from the 1980s.
    id: "c_bookFair", once: true, ages: [6, 11], when: s => school(s) && s.year >= 1982, p: () => 0.15,
    choice: (s, ctx) => {
      const book = s.year < 1995 ? "a Choose Your Own Adventure book" : s.year < 2005 ? "a Goosebumps book" : s.year < 2015 ? "a Diary of a Wimpy Kid book" : "a Dog Man book";
      return {
        prompt: `The book fair is in the library, and you have exactly five dollars. What do you get?`,
        options: [
          { id: "c_bookFair.book", label: `Get ${book}`, hint: "the reason you're here", act: "study", style: "learn", weight: 0.35, apply: () => ({ text: `At the book fair you bought ${book} and read it in one afternoon, under your desk during math.`, mood: 3 }) },
          { id: "c_bookFair.poster", label: "A poster of kittens or a sports car", hint: "for your bedroom wall", act: "hobby", style: "self", weight: 0.15, apply: () => ({ text: "At the book fair you bought a poster instead of a book, and it hung over your bed for six years.", mood: 2 }) },
          { id: "c_bookFair.pen", label: "The pen with four colors of ink", hint: "the most powerful object", act: "hobby", style: "risk", weight: 0.2, apply: () => ({ text: "At the book fair you bought the pen with four colors of ink and clicked it until it broke.", mood: 2 }) },
          { id: "c_bookFair.friend", label: "Buy a book for a friend who has no money", hint: "share it", act: "donate", style: "family", weight: 0.15, apply: () => ({ text: "At the book fair you noticed a kid who had no money, and bought them a book with yours. You read it after them.", mood: 4 }) },
          { id: "c_bookFair.save", label: "Save the five dollars", hint: "nothing was worth it", act: "save", style: "safe", weight: 0.15, apply: () => ({ text: "At the book fair you looked at everything twice and decided to save your five dollars. You still have strong opinions about the erasers.", mood: 1 }) },
        ],
      };
    },
  },
  {
    id: "c_dream", once: true, ages: [6, 9], when: school, p: () => 0.2,
    choice: (s, ctx) => {
      const modern = s.year >= 2010 ? ["a YouTuber", "film your own videos"] : s.year >= 1985 ? ["a famous singer", "concerts in your bedroom"] : ["a cowboy", "a hat and a horse"];
      const space = s.year >= 1961 ? "an astronaut" : "a pilot";
      const set = (key, text) => (s2, c) => { s2.flags.dream = key; return { text: c.w(text), mood: 3 }; };
      return {
        prompt: `Your teacher asked everyone to draw what they want to be when they grow up. What do you draw?`,
        options: [
          { id: "c_dream.space", label: `${cap(space)}`, hint: "the sky's not the limit", act: "study", style: "risk", weight: 0.2, apply: set("astronaut", `You drew yourself as ${space}, {floating next to a very lopsided moon.|with a helmet bigger than the rocket.} It went on the fridge.`) },
          { id: "c_dream.vet", label: "A veterinarian", hint: "all the animals", act: "care", style: "family", weight: 0.2, apply: set("vet", "You drew yourself as a veterinarian, surrounded by {seventeen dogs|a giraffe with a bandage|every animal you could think of}.") },
          { id: "c_dream.firefighter", label: s.year < 1985 ? "A firefighter or a nurse" : "A firefighter or a doctor", hint: "helping people", act: "care", style: "health", weight: 0.2, apply: set("helper", "You drew yourself {in a fire helmet, on top of a very red truck.|in a white coat, saving the day.}") },
          { id: "c_dream.teacher", label: "A teacher", hint: "like yours", act: "study", style: "learn", weight: 0.15, apply: set("teacher", "You drew yourself as a teacher, and your teacher pinned it to the bulletin board and smiled at it all week.") },
          { id: "c_dream.modern", label: cap(modern[0]), hint: modern[1], act: "hobby", style: "self", weight: 0.15, apply: set("star", `You drew yourself as ${modern[0]}, {with a crowd of stick figures cheering.|in sunglasses.}`) },
          { id: "c_dream.president", label: "The president", hint: "go big", act: "insist", style: "risk", weight: 0.1, apply: set("president", "You drew yourself as president, at a desk with a sign that said BOSS. Your grandfather said you'd get his vote.") },
        ],
      };
    },
  },
  {
    id: "c_friendFight", domain: "family", channel: "bad", tags: ["friends"], once: true, ages: [8, 12], when: s => atHome(s) && !!bestFriend(s), p: () => 0.1,
    choice: (s, ctx, gu = grownUp(s, ctx)) => {
      const f = bestFriend(s), other = ctx.person({ role: "friend", sex: f.sex, birthYear: s.birthYear, how: "school" });
      return {
        prompt: `${f.call}, your best friend, has started hanging out with ${other.call} and saving ${them(other)} a seat instead of you. What do you do?`,
        options: [
          { id: "c_friendFight.talk", label: `Tell ${f.call} it hurt`, hint: "honest", act: "talk", style: "social", weight: 0.3, apply: () => ({ text: `When ${f.call} started saving a seat for ${other.call} instead of you, you told ${them(f)} it hurt. ${f.call} hadn't realized, and from then on there were three seats.`, mood: 3 }) },
          { id: "c_friendFight.join", label: `Make friends with ${other.call} too`, hint: "the more the merrier", act: "socialize", style: "family", weight: 0.25, apply: s2 => { s2.friends.push(other); return { text: `When ${f.call} started hanging out with ${other.call}, you made friends with ${other.call} too. The three of you were inseparable that year.`, mood: 4 }; } },
          { id: "c_friendFight.jealous", label: "Ignore them both", hint: "two can play", act: "avoid", style: "self", weight: 0.2, apply: () => ({ text: `When ${f.call} started hanging out with ${other.call}, you stopped talking to both of them for a month. It was a lonely month.`, mood: -3 }) },
          { id: "c_friendFight.new", label: "Find new friends", hint: "moving on", act: "socialize", style: "risk", weight: 0.15, apply: (s2, c) => { makeFriend(s2, c, "school"); return { text: `When ${f.call} started hanging out with ${other.call}, you found a new group at the other lunch table, and it turned out fine.`, mood: 1 }; } },
          { id: "c_friendFight.parent", label: `Ask ${gu} for advice`, hint: "they've been there", act: "seekHelp", style: "family", weight: 0.1, apply: () => ({ text: `When ${f.call} started hanging out with ${other.call}, ${gu} told you about a best friend from long ago, and said real friends come back. ${f.call} did.`, mood: 2 }) },
        ],
      };
    },
  },

  // ---------- everyday childhood ----------
  {
    id: "c_recital", ages: [7, 12], max: 2, cooldown: 2, when: s => atHome(s) && s.flags.talent && s.flags.talent !== "none", p: () => 0.2,
    apply: (s, ctx) => {
      const t = s.flags.talent;
      const lines = {
        piano: ["At your piano recital you played {“Für Elise”|a march by Sousa|a song from a movie} {without a single mistake, and bowed too fast.|with one wrong note you covered beautifully.}", "You practiced piano so much that the neighbors could hum your recital piece."],
        baseball: ["You hit your first real home run, over the fence, and {ran the bases in a daze.|your dad was so loud the umpire looked over.}", "Your team made the playoffs, and {you caught a pop fly to end the game.|you all got ice cream, win or lose.}"],
        soccer: ["You scored the winning goal in the last game of the season, {mostly by accident, off your knee.|and the team carried you on their shoulders, briefly.}", "Your soccer team went undefeated, and the trophy was taller than you."],
        scouts: ["You earned the badge you'd been working on all year, and {your mom sewed it on crooked, with pride.|you wore your sash to school the next day.}", "At the Pinewood Derby, {your car came in third,|your car was slow but the best-painted,} and you kept it on your shelf for twenty years."],
        dance: ["At the dance recital {you were in the front row for the first time.|you forgot a step and made up a new one.} Your family brought flowers from the grocery store.", "Your dance class performed at the town festival, and {you waved at your family mid-routine.|it rained, and you danced anyway.}"],
        karate: ["You earned your next belt after a test in front of the whole dojo, {and broke the board on the first try.|and your sensei nodded at you, which meant everything.}", "At the karate tournament you won a small trophy and wore your uniform to dinner."],
        art: ["Your drawing won a ribbon at the county fair, and {the library hung it by the front desk.|your grandparents framed a photocopy.}", "You filled a whole sketchbook that year, {mostly horses|mostly dragons|mostly your dog}."],
        code: ["You made a video game where a cat dodges asteroids, and your whole class played it.", "Your little app won the school's coding challenge, and you explained it to the principal with great patience."],
      }[t] || ["You got better at the thing you loved that year, and somebody noticed."];
      return { text: ctx.w(lines), mood: 4 };
    },
  },
  A("c_fieldTrip", [6, 11], 0.12, s => {
    const place = s.year < 1975 ? ["the dairy farm", "the fire station", "the state capitol"] : ["the science museum", "the zoo", "the apple orchard", "the planetarium"];
    return [`On the class field trip to ${place[0]}, {you got to sit in the front seat of the bus.|a goat ate your permission slip.|you sang “99 Bottles of Pop on the Wall” all the way there.}`, `Your class went to ${place[1]}, {and you bought a souvenir pencil with your lunch money.|and the tour guide let you ask the most questions.|and you lost your partner in the gift shop.}`, `The field trip to ${place[2 % place.length]} {was the best day of the year.|ended with you asleep on the bus with your head on your best friend's shoulder.}`];
  }, { when: school, max: 2, once: false, cooldown: 2, mood: 3 }),
  A("c_fieldDay", [6, 11], 0.15, ["On field day you {won the sack race|came in last in the three-legged race, laughing too hard to run|anchored the tug-of-war team}, and {got a ribbon.|got a popsicle and a sunburn.}", "Field day: {an egg-and-spoon race, a water balloon toss, and a lot of grass stains.|the gym teacher's whistle, a parachute, and a hundred screaming kids.} You loved it.", "At field day your class {won the relay because of you.|lost every event and had the most fun.}"], { when: school, mood: 3 }),
  A("c_sleepover", [7, 11], 0.12, s => [`At your first sleepover at ${friendName(s, "a friend")}'s house, {you got homesick at two in the morning and called home.|you stayed up until dawn and fell asleep during breakfast.|you played Light as a Feather, Stiff as a Board, and swore it worked.}`, `${s.year >= 1980 ? "At a sleepover you watched a scary movie you were not allowed to watch" : "At a sleepover you told ghost stories by flashlight"}, {and didn't sleep for two nights after.|and pretended you weren't scared.}`, "You went to your first slumber party, {where you ate a whole bowl of popcorn and a lot of candy.|and the dad made pancakes in the morning.}"], { when: atHome, mood: 3 }),
  A("c_roadTrip", [4, 12], 0.12, s => {
    const car = s.year < 1985 ? "the station wagon" : s.year < 2005 ? "the minivan" : "the SUV", dest = ["the Grand Canyon", "Mount Rushmore", "Yellowstone", "Niagara Falls", "the Smoky Mountains", "the Gulf Coast"];
    const nav = s.year < 2005 ? "{Dad refused to ask for directions for two hundred miles.|Mom navigated with a giant fold-out map that never folded back.}" : "{The GPS sent you down a dirt road, and nobody let Dad forget it.|You watched movies on a portable DVD player the whole way.}";
    return [`The family drove to ${dest[0]} in ${car}. ${nav}`, `You spent a week in the back of ${car} on a road trip to ${dest[1 + (s.age % 5)]}, {asking “Are we there yet?” roughly every mile.|playing the license plate game until you found Alaska.|with your feet on the dashboard and a cooler of sandwiches.}`, `On the family road trip, {you saw ${dest[(s.age + 2) % 6]} and it was even bigger than the postcards.|you stayed in motels with pools, which was the best part.} ${nav}`];
  }, { when: atHome, mood: 4 }),
  A("c_disney", [4, 10], 0.04, s => [`Your family went to ${s.year >= 1971 ? "Disney World" : "Disneyland"}, {and you met Mickey and could not speak.|and you rode Space Mountain three times.|and it rained, and you didn't care at all.}`, `The family saved up for a trip to ${s.year >= 1971 ? "Disney World" : "Disneyland"}, {and you wore your mouse ears for a month after.|and you cried when the fireworks ended.}`, `A trip to ${s.year >= 1971 ? "Disney World" : "Disneyland"}: {long lines, a turkey leg, and your father asleep on a bench.|the teacups until you were dizzy.}`], { when: s => atHome(s) && s.year >= 1956, mood: 5 }),
  A("c_snowDay", [5, 12], 0.15, s => [`It snowed so hard school was canceled, and {you listened to the radio list the closings until your school came on.|you spent the whole day sledding down the big hill by the church.|you built a snow fort with a working door.}`, "Snow day! {You built a snowman with a carrot nose and Dad's old hat.|You came inside only for hot chocolate.|You had a snowball fight with every kid on the street.}", `${s.year >= 2020 ? "School tried to make the snow day a Zoom day, but" : "On the snow day"} {you made snow angels until you couldn't feel your feet.|you shoveled the neighbors' driveways for five dollars each.}`], { when: s => school(s) && snowy(s), max: 2, once: false, cooldown: 2, mood: 4 }),
  {
    id: "c_holiday", ages: [3, 10], max: 2, cooldown: 3, when: atHome, p: () => 0.12,
    apply: (s, ctx) => {
      const h = holidayOf(s, ctx), toy = ctx.rng.pick(kidsCulture(s.year).toys);
      const lines = {
        Christmas: [`On Christmas morning you found ${toy} under the tree and {played with it until dinner.|forgot about every other present.}`, "Christmas at your grandparents' house: {the whole family, too much ham, and a fire in the fireplace.|you and your cousins were sent to the basement and had the best time.}", "You helped decorate the tree and {put all the ornaments on one branch.|got the job of putting the star on top, from Dad's shoulders.}"],
        Hanukkah: [`For Hanukkah you lit the menorah every night and {got ${toy} on the last night.|won all the gelt at dreidel.}`, "Hanukkah at your grandparents': latkes, applesauce and sour cream, and an argument about which is better."],
        Eid: [`For Eid you wore new clothes to the mosque and {got money from every aunt and uncle.|ate so many sweets you felt sick.}`, "On Eid the whole family gathered, and the kids got gifts and envelopes of money."],
        Diwali: ["For Diwali you lit little clay lamps all along the windows, and {ate too many sweets.|watched the fireworks from the back porch.}", "At Diwali your family's house glowed, and you helped make rangoli patterns on the front step."],
      }[h];
      return { text: ctx.w(lines), mood: 4 };
    },
  },
  A("c_treehouse", [7, 11], 0.08, s => [`You and ${friendName(s, "the neighbor kids")} built a {tree house|fort in the woods|clubhouse in the garage} out of {scrap wood and a lot of nails.|old pallets and a tarp.} {It had a secret password.|No grown-ups were allowed.}`, "You built a fort out of every couch cushion in the house, and {defended it all weekend.|refused to come out for dinner.}", "Your tree house had {a rope ladder and a sign that said KEEP OUT.|a bucket on a pulley for sending snacks up.}"], { when: atHome, mood: 4 }),
  A("c_outside", [6, 11], 0.15, s => (s.year < 2000 ? ["You played outside until the streetlights came on, {kick the can, freeze tag, and ghost in the graveyard.|riding bikes in a pack all over the neighborhood.|and your mother rang a bell from the porch for dinner.}", "All summer you were outside from breakfast to dinner, {catching fireflies in a jar,|running through the sprinkler,} and nobody knew exactly where you were, and that was normal.", "The neighborhood kids played {kickball in the street, yelling “Car!”|wiffle ball in somebody's backyard} every evening that summer."] : ["You played outside with the neighbor kids {until your parents texted that dinner was ready.|on scooters up and down the cul-de-sac.}", "That summer you caught fireflies in a jar with your cousins and let them go at bedtime.", "You and the kids on your street ran a {lemonade-and-slime business|water balloon war} that lasted all summer."]), { when: atHome, mood: 3 }),
  A("c_grandparents", [3, 10], 0.15, s => [`Your grandmother taught you to {make pie crust|play gin rummy|sew a button}, {and let you lick the spoon.|and cheated at cards, a little, to let you win.}`, `Your grandfather {let you help in his workshop, handing him nails.|took you fishing at dawn and let you keep the little ones.|told stories about the old days that may have been true.}`, s.year >= 2012 ? "You video-called your grandparents every Sunday, and they always held the phone too close to their faces." : "Sundays at your grandparents' house meant {pot roast and the TV on the game.|a quarter for the candy dish.}"], { when: atHome, mood: 3 }),
  {
    id: "c_faith", once: true, ages: [5, 11], when: atHome, p: () => 0.12,
    apply: (s, ctx) => {
      const f = faithOf(s, ctx);
      const lines = {
        christian: ["Sunday mornings meant church in itchy clothes, {and you passed notes during the sermon.|and the donuts afterward were the point.|and you sang loudest in the children's choir.}", "In Sunday school you {colored pictures of Noah's ark|memorized Bible verses for gold stars}, {and won a little New Testament.|and had a crush on the teacher's helper.}"],
        jewish: ["You went to Hebrew school twice a week after regular school, {and you were tired, and you still learned the alphabet.|and the best part was the Purim carnival.}", "At the Passover seder you asked the Four Questions, {and stumbled, and your grandfather beamed anyway.|and found the afikomen.}"],
        muslim: ["On weekends you went to classes at the mosque, {learning to read Arabic letters.|where your teacher had a laugh that filled the room.}", "During Ramadan you tried fasting for half a day, {and broke the fast at sunset with dates and your whole family.|and felt very grown up.}"],
        hindu: ["At the temple you {rang the bell on the way in.|helped your grandmother carry offerings.}", "Your family celebrated Holi in the park, and you came home covered in every color."],
        none: ["Your family didn't go to church; Sunday mornings were {pancakes and the funny pages.|cartoons and a long walk.}", "Your family spent Sundays {at the park|visiting your grandparents|at the lake}, and that was its own kind of religion."],
      }[f];
      return { text: ctx.w(lines), mood: 2 };
    },
  },
  A("c_library", [5, 9], 0.15, s => [`You got your first library card, {signed your name in careful capital letters,|and checked out the maximum number of books,} and {read them all in a week.|the librarian started saving books for you.}`, s.year >= 1985 ? "You did the summer reading program and earned a free personal pan pizza from Pizza Hut for every five books." : "You did the summer reading program at the library and got a gold star for every book.", "The library became your second home, {especially the beanbag chairs in the kids' corner.|and you read every horse book they had.}"], { when: atHome, mood: 3 }),
  A("c_computerLab", [7, 12], 0.15, s => (s.year < 2000 ? ["In the school computer lab you played The Oregon Trail, {and your whole wagon party died of dysentery.|and named your oxen after your teachers.|and shot far more buffalo than you could carry.}", "You learned to type in the computer lab on Apple computers, {racing the kid next to you.|with a cover over the keyboard so you couldn't look.}"] : ["In the computer lab you learned to make a slideshow, {with way too many spinning transitions.|about your dog.}", "At school you got a laptop to use in class, and {learned to type faster than you could write.|figured out how to change the desktop background.}"]), { when: s => school(s) && s.year >= 1983, mood: 2 }),
  A("c_parentsWork", [6, 12], 0.08, (s, ctx) => [`${s.year >= 1993 ? "On Take Your Child to Work Day" : "One day"} you went to work with ${grownUp(s, ctx)}, {and sat in a swivel chair and spun.|and got to use the copy machine, which was thrilling.|and saw what all those hours away actually looked like.}`, "You visited your parent's job and {everyone there already knew your name.|they gave you a hard hat and a lollipop.}", "You spent a day at your parent's work and {came home very proud of them.|decided you never want an office job, or that you definitely do.}"], { when: atHome, mood: 2 }),
  A("c_stitches", [5, 12], 0.05, ["You fell off the monkey bars and broke your arm, {and everyone at school signed your cast.|and the cast itched for six weeks.}", "You split your chin open on the edge of the pool and got {four|six} stitches, {and were very brave about it.|and a lollipop.}", "You crashed your bike into a mailbox and {got a scar on your knee you still have.|walked it home crying.}"], { when: atHome, mood: -1 }),
  A("c_fair", [5, 12], 0.12, s => ["At the county fair you {rode the Ferris wheel and saw the whole town from the top.|ate a corn dog, cotton candy and a funnel cake, in that order.|won a stuffed animal at the ring toss.}", "You went to the state fair and {saw a butter sculpture of a cow.|petted a pig the size of a couch.|threw up on the Tilt-A-Whirl.}", `At the fair ${s.flags.talent === "scouts" || inStates(s, ["IA", "NE", "KS", "WI", "MN", "OH", "IN", "MO"]) ? "your 4-H rabbit won a ribbon" : "you won a goldfish"}, {and you carried it home in a plastic bag on your lap.|and it was the proudest day of the summer.}`], { when: atHome, mood: 3 }),
  A("c_chickenPox", [3, 9], 0.25, ["You got chicken pox and stayed home for a week {in oatmeal baths, trying not to scratch.|with calamine lotion all over and cartoons all day.|and your siblings got it right after you.}", "Chicken pox: {a week of itching, mittens on your hands at night,|you were covered in spots,} and {you got to eat popsicles for every meal.|Grandma came over with comic books.}", "You and half your class got chicken pox the same month, {and the school was nearly empty.|and your mother said it was better to get it over with.}"], { when: s => atHome(s) && s.year < 1996, mood: -1 }),
  A("c_glasses", [6, 11], 0.08, ["You got your first pair of glasses, and on the drive home you saw individual leaves on the trees and couldn't stop staring.", "You got glasses {with thick plastic frames|that slid down your nose}, and {a kid called you four-eyes once, and then everyone forgot.|you could finally read the board.}", "The eye doctor said you needed glasses, and {you picked frames that were very bold.|you felt very smart in them.}"], { when: atHome, mood: 1 }),
  A("c_latchkey", [8, 12], 0.12, ["You were a latchkey kid, {with a house key on a shoelace around your neck,|letting yourself in after school,} and {making yourself a snack and watching TV until your parents got home.|calling your mother at work to say you were home safe.}", "After school you let yourself into the empty house, {did your homework at the kitchen table,|fed the dog,} and {started dinner.|felt very grown up and a little lonely.}", "You came home to an empty house every day, {and you and your siblings ran the place until six.|and you learned to make a mean grilled cheese.}"], { when: s => atHome(s) && s.year >= 1972 && s.year <= 2005 && (s.flags.parentsSplit || s.flags.daycare), mood: 0 }),
  A("c_cursive", [7, 9], 0.25, ["You learned cursive in third grade, {practicing loops on lined paper.|and signed your name about four hundred times.|and your capital Q looked like a 2 forever.}", "You learned cursive and {wrote a letter to your grandmother just to show off.|discovered you could read your parents' grocery lists.}"], { when: s => school(s) && s.year < 2012, mood: 1 }),
  A("c_sickDay", [6, 12], 0.12, s => [`You stayed home sick and {watched The Price Is Right on the couch with a bowl of soup.|got to sleep in your parents' bed with the TV on.|got ginger ale and saltines and a lot of attention.}`, s.year >= 2005 ? "You stayed home sick and spent the day watching videos with a blanket and a bucket." : "You stayed home sick and spent the day watching game shows and soap operas with Grandma.", "You faked a fever to stay home from school {by holding the thermometer near a lamp.|and were found out by lunchtime.}"], { when: school, mood: 1 }),
  {
    // A pet's end: a goldfish's or a hamster's in a year or two, a dog's or a cat's much later.
    id: "c_petLoss", once: true, ages: [6, 17], when: s => s.flags.pet && ["fish", "hamster"].includes(s.flags.pet.kind) && s.age - s.flags.pet.since >= 2, p: () => 0.4,
    apply: (s, ctx) => {
      const pet = s.flags.pet; s.flags.pet = null;
      return { text: ctx.w([`${pet.name} the ${pet.noun} died, and you {held a funeral in the backyard with a shoebox and a popsicle-stick cross.|said a few words over the toilet before the flush.} {Your whole family stood with you.|You were sad for a week.}`, `You woke up and ${pet.name} the ${pet.noun} was gone. {You buried ${pet.name} under the tree in the yard and painted a rock for the grave.|Your father said ${pet.name} had a good life, which helped a little.}`]), mood: -4 };
    },
  },
  A("c_moonWish", [5, 12], 0.06, ["One night you lay in the backyard and {counted shooting stars until you lost count.|found the Big Dipper all by yourself.|made a wish on the first star you saw.}", "You stayed up with your father on the porch watching a meteor shower, {and you saw eleven.|and he named the constellations, some of them made up.}", "You got a little telescope for your birthday and {saw the rings of Saturn, and yelled.|spent every clear night that summer in the yard.}"], { when: atHome, mood: 3 }),
];
