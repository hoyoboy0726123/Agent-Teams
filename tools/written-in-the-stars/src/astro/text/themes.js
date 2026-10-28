// The connecting texts of the natal reading (src/astro/reading.js): element and modality balance, day and night
// charts, the Sun–Moon blend, the timeline (profection years, returns, the outlook) and the overall synthesis.

// ---------- balance ----------
export const ELEMENT = {
  fire: { label: "Fire", word: "fiery", strong: "Fire leads your chart: you run on enthusiasm, courage and a need to act. You warm people up and get things started; burnout and impatience are the price of all that heat.",
    weak: "Fire is quiet in your chart: you may need outside sparks, like a friend, a deadline or a cause, to get moving. Once lit, you burn steadily rather than flaring." },
  earth: { label: "Earth", word: "earthy", strong: "Earth leads your chart: you're practical, grounded and built for real results. You trust what you can touch and test; the stretch is letting yourself dream past what's proven.",
    weak: "Earth is quiet in your chart: routines, budgets and the body's needs may not come naturally. Building a few solid habits gives your ideas a place to land." },
  air: { label: "Air", word: "airy", strong: "Air leads your chart: you live in ideas, conversation and connection. You see patterns and people clearly; the stretch is getting out of your head and into your feelings and your body.",
    weak: "Air is quiet in your chart: you may trust gut and action more than talk. Putting feelings into words, or asking someone's opinion, can open doors for you." },
  water: { label: "Water", word: "watery", strong: "Water leads your chart: you feel deeply, read people intuitively and bond for keeps. Your sensitivity is a gift; protecting it with boundaries keeps it one.",
    weak: "Water is quiet in your chart: you may process feelings through thought or action rather than tears. Making space for the messy, wordless feelings deepens your relationships." },
};
export const MODALITY = {
  cardinal: { label: "Cardinal", strong: "Cardinal signs lead your chart: you're an initiator. You see what needs to start and you start it; finishing is where you may want help." },
  fixed: { label: "Fixed", strong: "Fixed signs lead your chart: you're a sustainer. You hold steady, finish what you start and stay loyal; letting go when it's time is your growth edge." },
  mutable: { label: "Mutable", strong: "Mutable signs lead your chart: you're an adapter. You flex, learn and change course easily; committing to one path is your growth edge." },
};

// ---------- sect ----------
export const SECT = {
  day: "You were born with the Sun above the horizon, a day chart. Traditionally the Sun, Jupiter and Saturn work best for you: visible goals, structure and public life tend to suit you, and Saturn's tests come with a little more support. Mars, out of sect, is the planet to handle with the most care.",
  night: "You were born with the Sun below the horizon, a night chart. Traditionally the Moon, Venus and Mars work best for you: instinct, relationships and private life carry a lot of your strength, and Mars's fire comes with a little more grace. Saturn, out of sect, is the planet whose lessons may feel heaviest.",
  unknown: "Day or night chart? That depends on whether the Sun was above the horizon when you were born, so it needs a birth time.",
};

// ---------- Sun and Moon ----------
// The blend of the Sun's and the Moon's elements, keyed by the two elements in ELEMENTS order (fire, earth, air, water).
export const SUN_MOON = {
  "fire-fire": "Fire on fire: your will and your heart both run hot. You know what you want and you want it now; your enthusiasm is contagious.",
  "fire-earth": "Fire and earth: big ambitions with a practical heart. You dream bold and need results you can see; patience is the bridge.",
  "fire-air": "Fire and air: idea and action fan each other. You're lively, social and quick, at your best with people and a plan.",
  "fire-water": "Fire and water: a bold outside and a tender inside. You charge ahead, then feel everything afterward; both are you.",
  "earth-earth": "Earth on earth: steady, practical and deeply reliable. You build slowly and keep what you build.",
  "earth-air": "Earth and air: a practical will and a curious heart. You need ideas to keep you lively and a plan to make them real.",
  "earth-water": "Earth and water: a nurturing, grounded combination. You care through what you do and need security to feel free.",
  "air-air": "Air on air: a life of the mind and of people. You need conversation the way others need food.",
  "air-water": "Air and water: head and heart in constant dialogue. You think about feelings and feel about ideas; journaling was made for you.",
  "water-water": "Water on water: deeply intuitive and emotional. You read people beautifully and need safe harbors to rest.",
};

// ---------- the timeline ----------
// The lord of the year, as a flavor of the year: what each planet brings when it takes its turn.
export const LORD = {
  sun: "visibility and self-expression", moon: "feelings, family and home", mercury: "learning, talking and paperwork",
  venus: "love, pleasure and money", mars: "action, effort and competition", jupiter: "growth, luck and big plans",
  saturn: "responsibility, effort and long-term building",
};
// A profection year's theme, by house.
export const YEAR = {
  1: "a fresh start centered on you, your body and your direction",
  2: "money, earning and what you value",
  3: "learning, siblings, writing and getting around",
  4: "home, family and roots",
  5: "romance, fun, creativity and kids",
  6: "work, routines and health",
  7: "partnership and close one-on-ones",
  8: "shared money, intimacy and deep change",
  9: "travel, study and big questions",
  10: "career and reputation",
  11: "friends, groups and future hopes",
  12: "rest, retreat and loose ends",
};
// How a well placed, a mixed or a strained lord of the year colours it.
export const LORD_TONE = {
  good: "its themes tend to go your way",
  mixed: "a year of give and take",
  hard: "its themes ask for more effort, and that effort counts",
};
export const CYCLES = {
  "saturn-return": [
    "",
    "Your first Saturn return (around 28 to 30) is the classic reality check: the life you drifted into gets tested, and you start choosing the one you'll own.",
    "Your second Saturn return (around 57 to 60) asks what the next chapter is for: legacy, mentoring, what you'll keep and what you'll finally put down.",
    "Your third Saturn return (around 86 to 89) is a long look back and a lighter load: wisdom, if you let it in.",
  ],
  "jupiter-return": "Every twelve years Jupiter comes back to where it was at your birth, opening a new growth cycle: a good time to start something you want to grow.",
  "uranus-opposition": "Uranus opposite its birth place (around 40 to 42) is the classic midlife wake-up call: whatever feels too small starts to itch, and something wants to change.",
  "saturn-opposition": "Saturn opposite its birth place (around 14, 44 and 73) is a halfway checkpoint on the structures you're building.",
};

// Saturn and Jupiter touching a natal point (timing.js "contact" facts), for the outlook.
export const CONTACT = {
  saturn: { sun: "a test of stamina and ambition; slow and steady wins", moon: "heavier feelings or family duties; lean on the people who show up", asc: "time to look after your body and your boundaries", mc: "career pressure, and the chance to earn your stripes" },
  jupiter: { sun: "confidence, visibility and a lucky break or two", moon: "a warmer, fuller home life", asc: "you feel like yourself, and doors open", mc: "a boost at work and in your reputation" },
};
export const POINT = { sun: "Sun", moon: "Moon", asc: "Ascendant", mc: "Midheaven" };

// ---------- the overall reading ----------
export const STRENGTH = {
  domicile: p => `${p} at home in its own sign`,
  exaltation: p => `${p}, exalted`,
};
export const EDGE = {
  detriment: p => `${p} in detriment, a part of you that works best when you use it consciously`,
  fall: p => `${p} in fall, a quiet strength you build by effort`,
};
export const CLOSING = "None of this is a script. A chart describes weather, not the route; the 100 lives above show how much still depends on choices and chance. Use what rings true, leave the rest, and see what you'd like to grow into.";
