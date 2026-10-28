// Shared helpers for the story files: picking a scene, pronouns, family words, the culture of each year, US states,
// school stages, and the rates the story reads (with design values for any rates.js does not have yet).
//
// Nothing here is an event; index.js does not list this file.

// ---------- scenes ----------
// One situation for a question, out of several; entries that do not fit this life are falsy and left out.
export const scene = (ctx, list) => ctx.rng.pick(list.filter(Boolean));
// The same with weights: each entry may carry `w` (default 1).
export const pickScene = (ctx, list) => ctx.rng.weighted(list.filter(Boolean).map(x => [x, x.w ?? 1]));
// The first letter in upper case, for a phrase that opens a sentence.
export const cap = t => (t ? t[0].toUpperCase() + t.slice(1) : t);
// "a nurse", "an electrician"; a phrase that already has an article is left alone.
export const an = w => (/^(a|an|the|your|my)\s/i.test(w) ? w : `${/^[aeiou]/i.test(w) && !/^(uni|use|eu|one)/i.test(w) ? "an" : "a"} ${w}`);

// ---------- pronouns ----------
// For a person in the story (partner, friend, kid). "they" for anyone the story has not met.
export const they = p => (!p ? "they" : p.sex === "female" ? "she" : "he");
export const them = p => (!p ? "them" : p.sex === "female" ? "her" : "him");
export const their = p => (!p ? "their" : p.sex === "female" ? "her" : "his");
export const kidWord = k => (k.sex === "male" ? "son" : "daughter");
export const kidNoun = k => (k.sex === "male" ? "boy" : "girl");

// ---------- family words ----------
export const RELATIONS = { olderBrother: "big brother", olderSister: "big sister", youngerBrother: "little brother", youngerSister: "little sister" };
const firstName = full => String(full || "").trim().split(/\s+/)[0] || "";
// A brother or sister: "your big sister Linda", or "your little brother" when the story has no name for them.
export function sibName(x) {
  const label = x.label && /^[a-z ]+$/i.test(x.label) ? x.label : RELATIONS[x.relation] || "sibling";
  const name = firstName(x.name);
  return name ? `your ${label} ${name}` : `your ${label}`;
}
// Just the name when there is one ("Linda"), else "your big sister".
export const sibShort = x => firstName(x.name) || `your ${RELATIONS[x.relation] || "sibling"}`;
export const isBrother = x => /Brother/.test(x.relation || "");
// Brothers and sisters already born and alive, at least `minAge` years old (as world.js bornSiblings).
export const bornSibs = (s, minAge = 0) => s.siblings.list.filter(x => x.born && x.alive !== false && s.age - x.bornAt >= minAge);
export const olderSibs = s => bornSibs(s).filter(x => x.older);
export const youngerSibs = (s, minAge = 3) => bornSibs(s, minAge).filter(x => !x.older);
// "Linda and Tom", "Linda, Tom and Amy".
export const listWords = items => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

// Grandma and Grandpa as the protagonist's grandchildren would call them.
export const grandWord = s => (s.sex === "female" ? "Grandma" : "Grandpa");

// Who you live with as a child: your parents; after a divorce the parent you mostly stay with; the parent still
// alive; your grandmother when neither is. Mothers got custody far more often for most of this period (an
// assumption from the history of US custody: about 80 % mothers in the 1970s, joint custody rising from the 1980s).
export function liveWith(s, ctx) {
  const f = s.father.alive, m = s.mother.alive;
  if (f && m && !s.flags.parentsSplit) return "parents";
  if (f && m) {
    if (!s.flags.liveWith) s.flags.liveWith = ctx.rng() < (s.year < 1990 ? 0.82 : 0.7) ? "mother" : "father";
    return s.flags.liveWith;
  }
  return m ? "mother" : f ? "father" : "grandma";
}
// One grown-up at home, as the story calls them: Mom, Dad, Grandma.
export function grownUp(s, ctx) {
  const h = liveWith(s, ctx);
  if (h === "parents") return ctx.rng() < 0.6 ? "Mom" : "Dad";
  return h === "mother" ? "Mom" : h === "father" ? "Dad" : "Grandma";
}
// "Mom", "Dad" or "your parents", whoever is there; "Grandma" when neither parent is alive.
export function parentWord(s, ctx) {
  if (s.mother.alive && s.father.alive && !s.flags.parentsSplit) return ctx.rng.pick(["Mom", "Dad", "your parents"]);
  if (s.mother.alive && s.father.alive) return grownUp(s, ctx);
  return s.mother.alive ? "Mom" : s.father.alive ? "Dad" : "Grandma";
}
// Is/are, for a parent word.
export const isAre = who => (who === "your parents" ? "are" : "is");

// ---------- friends ----------
export const bestFriend = s => s.friends.find(f => f.id === s.flags.bff && f.alive !== false) || null;
export const friendName = (s, fallback) => { const f = bestFriend(s); return f ? f.call : fallback; };
// Someone new to be friends with (most childhood friends are the same sex); becomes the best friend when there is none.
export function makeFriend(s, ctx, how, same = 0.85) {
  const sex = ctx.rng() < same ? s.sex : s.sex === "male" ? "female" : "male";
  const f = ctx.person({ role: "friend", sex, birthYear: s.birthYear + (ctx.rng() < 0.8 ? 0 : ctx.rng.int(3) - 1), how });
  s.friends.push(f);
  if (!bestFriend(s)) { s.flags.bff = f.id; f.bond = 0.7; ctx.remember("bestFriend", f.call, { name: f.call, call: f.call, sex: f.sex }); }
  return f;
}

// Money at home while you grow up, drawn once a life: "tight" or "ok". An assumption from the share of children in
// poverty (about 27 % in 1959, 14–22 % since the late 1960s), raised a little for big families and after a divorce.
export function homeMoney(s, ctx) {
  if (!s.flags.homeMoney) {
    const y = s.birthYear, p = (y < 1960 ? 0.32 : y < 1980 ? 0.22 : 0.2) + (s.siblings.list.length >= 3 ? 0.08 : 0) + (s.flags.parentsSplit ? 0.1 : 0);
    s.flags.homeMoney = ctx.rng() < p ? "tight" : "ok";
  }
  return s.flags.homeMoney;
}

// ---------- school ----------
// Middle school (grades 6–8) replaced junior high (7–9) in most districts during the 1970s and 1980s.
export const middleName = year => (year < 1985 ? "junior high" : "middle school");
export const inElementary = s => s.studying && !s.abroad && s.track === "elementary";
export const inMiddle = s => s.studying && !s.abroad && s.track === "middle";
export const inHigh = s => s.studying && !s.abroad && s.track === "high";
export const inCollege = s => s.studying && !s.abroad && ["college", "community", "trade"].includes(s.track);
// The grade you are in, by age, while at school: kindergarten at 5, first grade at 6, senior year at 17.
export const gradeOf = s => s.age - 5;
const ORD = ["kindergarten", "first grade", "second grade", "third grade", "fourth grade", "fifth grade", "sixth grade", "seventh grade", "eighth grade", "freshman year", "sophomore year", "junior year", "senior year"];
export const gradeWord = s => ORD[Math.max(0, Math.min(12, gradeOf(s)))];
// Leaving school, whichever way: the first job's question reads when.
export const leaveSchool = s => { s.studying = false; s.flags.leftSchool = s.age; };
// Written answers that mean going to work; at a school gate they leave school.
export const WORK_ACTIONS = new Set(["jobSearch", "jobHop", "careerSwitch", "civilService", "startup", "sideJob", "workAbroad", "familyBusiness"]);
// A degree in a few words, for a sentence.
export const DEGREE = { high: "a high school diploma", ged: "a GED", certificate: "a trade certificate", associate: "an associate's degree", bachelor: "a bachelor's degree", master: "a master's degree", professional: "a professional degree", doctorate: "a PhD" };
export const hasDegree = s => ["bachelor", "master", "professional", "doctorate"].includes(s.edu);

// Full Social Security retirement age by birth year (1983 amendments): 66 for 1943–1954, rising two months a year to
// 67 for 1960 and later.
export const fullRetirementAge = by => (by <= 1954 ? 66 : by >= 1960 ? 67 : 66 + (by - 1954) * 2 / 12);

// ---------- the culture of each year ----------
// What children watched, played with and could buy with their own money, only what was around in the US that year.
//   watch: after school or on Saturday morning   toys: what everyone had   buy: something a kid could save up for
export function kidsCulture(y) {
  if (y < 1955) return { watch: ["listened to The Lone Ranger on the radio", "watched Howdy Doody on the neighbors' TV", "begged to stay up for the Saturday matinee"], toys: ["a Slinky", "Silly Putty", "a set of Lincoln Logs", "a cap gun"], buy: ["a Slinky", "an egg of Silly Putty", "a bag of marbles"] };
  if (y < 1960) return { watch: ["watched The Mickey Mouse Club after school", "watched Howdy Doody", "never missed Lassie on Sunday night", "watched Captain Kangaroo before school"], toys: ["a hula hoop", "a coonskin cap", "a Frisbee", "a Mr. Potato Head"], buy: ["a hula hoop", "a Davy Crockett coonskin cap", "a Frisbee"] };
  if (y < 1966) return { watch: ["watched The Flintstones", "watched The Jetsons on Saturday morning", "watched Bugs Bunny cartoons on Saturday morning", "watched Captain Kangaroo before school"], toys: ["an Etch A Sketch", "a Barbie", "a G.I. Joe", "an Easy-Bake Oven"], buy: ["an Etch A Sketch", "a Barbie outfit", "a Duncan yo-yo"] };
  if (y < 1972) return { watch: ["watched Batman, same Bat-time, same Bat-channel", "watched Scooby-Doo on Saturday morning", "watched Mister Rogers' Neighborhood", y >= 1970 ? "watched Sesame Street every morning" : "watched Bugs Bunny on Saturday morning"], toys: ["Hot Wheels", "a Spirograph", "a Lite-Brite", "a game of Twister"], buy: ["a Hot Wheels car", "a Spirograph", "a pack of baseball cards"] };
  if (y < 1979) return { watch: ["watched Schoolhouse Rock! between Saturday cartoons", "watched Sesame Street", "watched Super Friends on Saturday morning", "watched The Electric Company"], toys: ["a Big Wheel", "Weebles", "a Stretch Armstrong", y >= 1978 ? "Star Wars action figures" : "an Evel Knievel stunt cycle"], buy: [y >= 1978 ? "a Star Wars action figure" : "a pack of baseball cards", "Shrinky Dinks", y >= 1975 ? "a Pet Rock" : "a Duncan yo-yo"] };
  if (y < 1985) return { watch: ["watched The Smurfs on Saturday morning", "watched Scooby-Doo after school", y >= 1983 ? "watched He-Man after school" : "watched Bugs Bunny on Saturday morning", y >= 1983 ? "watched Reading Rainbow" : "watched Sesame Street"], toys: ["a Rubik's Cube", "Star Wars action figures", y >= 1983 ? "a Cabbage Patch Kid" : "Strawberry Shortcake dolls", "an Atari 2600"], buy: ["a Rubik's Cube", "a Star Wars action figure", "an Atari cartridge"] };
  if (y < 1991) return { watch: ["watched Transformers after school", "watched DuckTales after school", "watched Teenage Mutant Ninja Turtles", "watched Pee-wee's Playhouse on Saturday morning"], toys: ["a Nintendo", "a Cabbage Patch Kid", "My Little Pony", y >= 1989 ? "a Game Boy" : "Care Bears"], buy: ["a Nintendo game", "Garbage Pail Kids cards", "a Trapper Keeper"] };
  if (y < 1998) return { watch: ["watched Rugrats", "watched Power Rangers after school", "watched Batman: The Animated Series", "watched The Magic School Bus", "watched Bill Nye the Science Guy"], toys: ["a Super Nintendo", "Pogs", "Beanie Babies", y >= 1996 ? "a Nintendo 64" : "a Super Soaker"], buy: ["a Beanie Baby", "a stack of Pogs", "a Super Soaker"] };
  if (y < 2004) return { watch: ["watched Pokemon after school", "watched SpongeBob SquarePants", "watched Hey Arnold!", "watched Dora the Explorer", "watched The Fairly OddParents"], toys: ["a Game Boy", "Pokemon cards", "a Furby", "a Razor scooter"], buy: ["a pack of Pokemon cards", "a Tamagotchi", "a Razor scooter"] };
  if (y < 2010) return { watch: ["watched SpongeBob SquarePants", "watched Avatar: The Last Airbender", "watched Phineas and Ferb", "watched Hannah Montana", "watched iCarly"], toys: ["a Nintendo DS", "a Wii", "Webkinz", "Heelys"], buy: ["a Webkinz", "a pair of Heelys", "a Nintendo DS game"] };
  if (y < 2020) return { watch: ["watched YouTube videos on an iPad", "watched Frozen until the DVD wore out", "watched PAW Patrol", "watched Adventure Time", "watched Minecraft videos on YouTube"], toys: ["Minecraft", "an iPad", "a Rainbow Loom", y >= 2017 ? "a Nintendo Switch" : "a Nerf blaster", y >= 2017 ? "a fidget spinner" : "LEGO"], buy: ["a LEGO set", y >= 2017 ? "a fidget spinner" : "a Rainbow Loom kit", "a Minecraft gift card"] };
  if (y < 2026) return { watch: ["watched Bluey", "watched YouTube Kids", "watched Encanto on repeat"], toys: ["Roblox", "a Nintendo Switch", "Squishmallows", "a Pop It"], buy: ["a Squishmallow", "Roblox gift card", "a LEGO set"] };
  return { watch: ["watched the show every kid was watching", "watched cartoons on a tablet"], toys: ["the newest game console", "LEGO", "a talking robot toy"], buy: ["a LEGO set", "a talking robot toy"] };
}
// What a kid bought at the corner store, by year.
export const snackOf = y => (y < 1965 ? ["penny candy", "a bottle of Coke", "a Popsicle"] : y < 1985 ? ["a Pixy Stix", "a Slurpee", "a pack of Bazooka gum"] : y < 2005 ? ["a Slurpee", "a bag of Doritos", "a Push Pop"] : ["a bag of Takis", "a Slurpee", "a bag of Doritos"]);
// How a teenager listened to music.
export function musicOf(y) {
  if (y < 1965) return { how: "on a transistor radio", own: "a stack of 45s", device: "transistor radio" };
  if (y < 1975) return { how: "on the AM radio", own: "a stack of LPs", device: "record player" };
  if (y < 1981) return { how: "on 8-track in a friend's car", own: "a stack of LPs", device: "8-track player" };
  if (y < 1993) return { how: "on a Walkman", own: "a shoebox of mixtapes", device: "Walkman" };
  if (y < 2002) return { how: "on a Discman that skipped on every bump", own: "a binder of CDs", device: "Discman" };
  if (y < 2011) return { how: "on an iPod", own: "an iPod with four thousand songs", device: "iPod" };
  return { how: "on Spotify", own: "a playlist for every mood", device: "phone" };
}
// How teenagers talked at night: the long-corded kitchen phone, then AIM, then texts, then group chats.
export function chatOf(y) {
  if (y < 1990) return "the kitchen phone with the long cord";
  if (y < 1997) return "the cordless phone";
  if (y < 2005) return "AIM";
  if (y < 2012) return "text messages";
  return "the group chat";
}
// A typical used first car, by year.
export function carOf(y) {
  if (y < 1965) return ["a '49 Ford", "a '53 Chevy", "a used Plymouth"];
  if (y < 1975) return ["a '62 Chevy Impala", "a Volkswagen Beetle", "a used Ford Falcon"];
  if (y < 1985) return ["a Ford Pinto", "an old station wagon with wood paneling", "a Volkswagen Beetle", "a Chevy Nova"];
  if (y < 1995) return ["an '82 Honda Civic", "a Chevy Cavalier", "the family's old Buick", "a Ford Escort"];
  if (y < 2005) return ["a hand-me-down Toyota Corolla", "a Ford Taurus", "a Jeep Cherokee with a cracked dash", "a Honda Accord"];
  if (y < 2015) return ["a used Honda Civic", "a Ford Focus", "a Toyota Camry with 150,000 miles", "a used Jeep Wrangler"];
  return ["a used Honda Civic", "a Prius with a dent in the door", "Mom's old SUV", "a used Toyota Corolla"];
}
// A video game console or screen kids had, for teens.
export const screenOf = y => (y < 1980 ? "the TV" : y < 1995 ? "Nintendo" : y < 2007 ? "the computer" : y < 2012 ? "Facebook" : "your phone");

// ---------- US states ----------
export const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington, D.C.",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const BY_NAME = Object.fromEntries(Object.entries(STATE_NAMES).map(([k, v]) => [v.toLowerCase(), k]));
BY_NAME["district of columbia"] = "DC";
// The postal code of a state given as a code, a name or "City, ST"; null when unknown.
export function stateCode(x) {
  if (!x) return null;
  const t = String(x).trim();
  if (STATE_NAMES[t.toUpperCase()] && t.length === 2) return t.toUpperCase();
  if (BY_NAME[t.toLowerCase()]) return BY_NAME[t.toLowerCase()];
  const m = /,\s*([A-Za-z]{2})$/.exec(t);
  return m && STATE_NAMES[m[1].toUpperCase()] ? m[1].toUpperCase() : null;
}
// Where you live now (the engine keeps the state in `county`, as bazi-life keeps the county), and where you were born.
export const stateOf = s => (s.abroad ? null : stateCode(s.state || s.county));
export const birthStateOf = s => stateCode(s.birthState || s.birthCounty);
export const stateName = code => STATE_NAMES[code] || "";
// Census regions.
const REGION = {
  northeast: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
  midwest: ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"],
  south: ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX"],
  west: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY", "AK", "CA", "HI", "OR", "WA"],
};
export const regionOf = code => Object.keys(REGION).find(r => REGION[r].includes(code)) || null;
export const inStates = (s, list) => list.includes(stateOf(s));
// Snow most winters (for snow days and shoveling).
export const SNOWY = ["AK", "CO", "CT", "ID", "IL", "IN", "IA", "KS", "ME", "MA", "MI", "MN", "MO", "MT", "NE", "NH", "NJ", "NY", "ND", "OH", "PA", "RI", "SD", "UT", "VT", "WI", "WY", "WV"];
// Snow days only where it snows, or nowhere is known.
export const snowy = s => { const c = stateOf(s); return !c || SNOWY.includes(c); };

// ---------- rates ----------
const interp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return pts[pts.length - 1][1];
};
// Design values, used only while ../rates.js has no function of that name. They follow the US figures roughly
// (NCES enrollment and dropout series, CDC/NCHS marriage and birth rates, BLS displacement, SSA claiming ages) so a
// life reads right before calibration; rates.js replaces each one with the sourced figure.
export const FALLBACK = {
  kindergarten: year => interp([[1950, 0.55], [1965, 0.72], [1975, 0.85], [1990, 0.93], [2010, 0.95]], year),
  juniorHigh: () => 1,
  // Each of the years at 16 and 17: about half the status dropout rate of 16–24-year-olds (15 % in 1970, 5 % by 2019).
  hsDropout: year => interp([[1966, 0.075], [1980, 0.07], [1990, 0.06], [2000, 0.055], [2010, 0.037], [2020, 0.026]], year),
  ged: age => (age <= 25 ? 0.06 : 0.015),
  // Immediate college enrollment of high school completers (NCES Digest table 302.10).
  college: year => interp([[1960, 0.45], [1970, 0.52], [1980, 0.49], [1985, 0.58], [1990, 0.6], [2000, 0.63], [2009, 0.7], [2016, 0.69], [2020, 0.63], [2023, 0.62]], year),
  communityShare: year => interp([[1965, 0.25], [1975, 0.38], [1990, 0.38], [2010, 0.4], [2020, 0.34]], year),
  enlist: (sex, year) => (sex === "male" ? interp([[1955, 0.25], [1973, 0.12], [1980, 0.16], [2000, 0.1], [2020, 0.07]], year) : interp([[1960, 0.01], [1980, 0.03], [2020, 0.03]], year)),
  collegeDropout: (year, track) => (track === "community" ? 0.2 : 0.075),
  transfer: () => 0.35,
  master: year => interp([[1970, 0.15], [1990, 0.2], [2010, 0.26]], year),
  jobFind: age => (age < 18 ? 0.5 : 0.8),
  promotion: age => interp([[23, 0.07], [35, 0.09], [50, 0.05], [64, 0.02]], age),
  jobChange: age => interp([[22, 0.25], [30, 0.15], [40, 0.1], [55, 0.05]], age),
  layoff: year => 0.03 + ({ 1958: 0.02, 1961: 0.015, 1970: 0.015, 1971: 0.015, 1974: 0.025, 1975: 0.03, 1980: 0.03, 1981: 0.03, 1982: 0.035, 1991: 0.02, 1992: 0.015, 2001: 0.02, 2002: 0.015, 2008: 0.03, 2009: 0.04, 2010: 0.02, 2020: 0.05 }[year] || 0),
  retire: age => interp([[55, 0.03], [60, 0.06], [62, 0.22], [65, 0.3], [67, 0.3], [70, 0.35], [75, 0.5]], age),
  homeBuy: age => interp([[25, 0.1], [30, 0.2], [40, 0.15], [55, 0.08]], age),
  DOWN_PAYMENT: 0.6,
  move: age => interp([[18, 0.04], [25, 0.05], [35, 0.03], [50, 0.015], [70, 0.01]], age),
  abroad: age => interp([[22, 0.004], [30, 0.006], [40, 0.005], [50, 0.002]], age),
  dating: (age, rel) => (rel === "single" ? interp([[17, 0.12], [22, 0.28], [30, 0.3], [40, 0.18], [55, 0.08], [70, 0.03]], age) : interp([[30, 0.22], [45, 0.14], [60, 0.06], [75, 0.02]], age)),
  breakup: age => interp([[18, 0.4], [25, 0.3], [35, 0.25], [50, 0.2]], age),
  // Median age at first marriage: about 20 (women) and 23 (men) in 1960, 28 and 30 by 2020.
  proposal: (age, sex, year, marriages) => interp(sex === "female" ? [[17, 0.03], [20, 0.18], [23, 0.3], [26, 0.32], [30, 0.25], [35, 0.16], [45, 0.08], [60, 0.04]] : [[18, 0.02], [22, 0.12], [25, 0.25], [28, 0.3], [32, 0.24], [38, 0.14], [48, 0.065], [60, 0.03]], age - interp([[1950, -3.5], [1970, -2.5], [1990, 0], [2010, 2.5], [2020, 3.5]], year)) * (marriages ? 0.6 : 1),
  divorce: (years, year) => interp([[1, 0.02], [4, 0.03], [8, 0.025], [15, 0.015], [25, 0.008]], years) * interp([[1950, 0.5], [1970, 0.8], [1980, 1.2], [2000, 1], [2020, 0.75]], year),
  crisis: years => interp([[0, 0.03], [3, 0.06], [10, 0.04], [25, 0.02]], years),
  birth: (motherAge, parity, year) => Math.min(0.9, interp([[18, 0.2], [25, 0.24], [30, 0.2], [35, 0.11], [40, 0.035], [45, 0.003]], motherAge) * [1, 1, 0.55, 0.3, 0.2][Math.min(4, parity)] * interp([[1950, 1.4], [1960, 1.5], [1970, 1], [1976, 0.85], [1990, 0.95], [2007, 0.95], [2020, 0.8]], year)),
  deathRaw: (age, sex) => Math.min(1, age < 1 ? 0.007 : Math.exp(-10.4 + 0.088 * age) * (sex === "male" ? 1.4 : 1)),
  serious: age => interp([[30, 0.001], [50, 0.006], [65, 0.015], [80, 0.03]], age),
  seriousType: (age, sex, year, rng) => rng.weighted([["cancer", 0.5], ["heart", 0.3], ["stroke", 0.2]]),
  chronic: age => interp([[30, 0.005], [45, 0.02], [60, 0.04], [75, 0.05]], age),
};
// A rate from rates.js by its bazi-life name (or a US one), else the design value above.
export function rate(ctx, name, ...args) {
  const f = ctx.R ? ctx.R[name] : undefined;
  const g = f !== undefined ? f : FALLBACK[name];
  return typeof g === "function" ? g(...args) : g;
}

// A serious illness's type (rates.js seriousType) as words in a sentence.
const ILLNESS = { cancer: "cancer", heart: "heart disease", "heart disease": "heart disease", stroke: "a stroke" };
export const illnessWord = type => ILLNESS[type] || String(type);
export const isCancer = type => /cancer/i.test(String(type));
