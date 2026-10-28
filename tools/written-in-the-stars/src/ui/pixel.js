// Pixel scenes: this moment of a life as a 128×44 pixel picture (each dot a square block, crisp at any size).
// Adapted from bazi-life's pixel.js (../bazi-life/src/pixel.js) for an American life: a suburban living room, a
// classroom with lockers, a brick campus, downtown with cars and a yellow cab, string lights at the wedding, and a
// night sky full of stars at the end.
//
// sceneOf() reads the life (its state, the year's luck and what just happened) and describes a picture: the place,
// the weather of the year's chart, who is in it and an icon for the news. It is plain data and tested in node.
// paintScene() draws a picture on a canvas. Each place's still parts are drawn once and cached.

export const W = 128, H = 44, FLOOR = 37;

/* ---------- drawing helpers ---------- */
const px = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
function disc(g, cx, cy, r, c) {
  g.fillStyle = c;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.8) g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
}
function rows(g, list, x, y, pal) {
  list.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) px(g, x + i, y + j, 1, 1, c); } });
}
function rngOf(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const cloud = (g, x, y, c) => { x = Math.round(x); px(g, x, y + 2, 14, 3, c); px(g, x + 2, y, 7, 2, c); px(g, x + 8, y + 1, 4, 1, c); };
function hills(g, base, c, amp, f, ph, bottom = FLOOR) { for (let x = 0; x < W; x++) { const h = Math.round(base - amp * Math.sin(x * f + ph)); px(g, x, h, 1, bottom - h, c); } }
function tree(g, x, top = 12, dark = false) {
  px(g, x, top + 9, 3, 31 - top - 9, dark ? "#2a2018" : "#6b4a2b");
  const c = dark ? "#1d2b22" : "#3f7a45", d = dark ? "#22332a" : "#4c8c50";
  disc(g, x + 1, top + 5, 6, c); disc(g, x - 3, top + 8, 4, c); disc(g, x + 5, top + 8, 4, c); disc(g, x, top + 2, 3, d);
}

/* ---------- people ---------- */
const SKIN = ["#f6d5b8", "#eec39c", "#d9a57a", "#b97c52", "#8d5a38", "#6a4128"];
const HAIR = ["#1f1712", "#2b1d14", "#4a3426", "#6b4a2b", "#c9a25a", "#8a4a24", "#24201d"];
const TOPS = ["#d0654f", "#4f86c6", "#5fa37a", "#e0b84a", "#9a6fb0", "#c8566b", "#3f8f8a", "#e58f4f"];
const BOTTOMS = ["#3b4a6b", "#2f3a3f", "#6b5a45", "#4a4458", "#5a6b7c"];
const GRAY = ["", "#6e6862", "#b9b3aa", "#e9e5df"];
const ONESIE = { male: "#9cc7ec", female: "#f4b3c6", unknown: "#f3e3a6" };

// The face and clothes of one person, the same every time for the same key.
export function lookOf(key) {
  const h = hash(key);
  return { skin: SKIN[h % SKIN.length], hair: HAIR[(h >>> 3) % HAIR.length], top: TOPS[(h >>> 6) % 8], bottom: BOTTOMS[(h >>> 10) % 5], skirt: ((h >>> 14) & 1) === 1, bob: ((h >>> 15) & 1) === 1 };
}

// A person in a picture. form: baby (0–2), child (3–11), teen, adult, elder (65+); gray hair from 52.
export function personAt({ key, sex, age, outfit = "casual" }) {
  const form = age < 3 ? "baby" : age < 12 ? "child" : age < 18 ? "teen" : age < 65 ? "adult" : "elder";
  return { form, sex: sex === "female" ? "female" : "male", age, look: lookOf(key), gray: age >= 80 ? 3 : age >= 65 ? 2 : age >= 52 ? 1 : 0, cane: age >= 78, outfit };
}

const HEAD_M = ["..hhhhhh..", ".hhhhhhhh.", ".hhhhhhhh.", ".hssssssh.", ".sesssses.", ".ssssssss.", ".sssmmsss.", "..ssssss..", "...ssss..."];
const HEAD_F_LONG = ["..hhhhhh..", ".hhhhhhhh.", "hhhhhhhhhh", "hhsssssshh", "hsessssesh", "hssssssssh", "hsssmmsssh", "hhsssssshh", "hh.ssss.hh"];
const HEAD_F_BOB = ["..hhhhhh..", ".hhhhhhhh.", "hhhhhhhhhh", "hhsssssshh", "hsessssesh", "hssssssssh", "hsssmmsssh", "hhsssssshh", ".h.ssss.h."];
const BODY = [".tttttttt.", "tttttttttt", "tt.tttt.tt", "ss.tttt.ss", "...tttt..."];
const SPR = {
  adultM: [...HEAD_M, "..tttttt..", ...BODY, "...bbbb...", "...bbbb...", "...b..b...", "...b..b...", "...b..b...", "..kk..kk.."],
  adultF: [...HEAD_F_LONG, "hhtttttthh", ...BODY, "..bbbbbb..", ".bbbbbbbb.", "...s..s...", "...s..s...", "...s..s...", "..kk..kk.."],
  adultFbob: [...HEAD_F_BOB, "..tttttt..", ...BODY, "..bbbbbb..", ".bbbbbbbb.", "...s..s...", "...s..s...", "...s..s...", "..kk..kk.."],
  legsPants: ["...bbbb...", "...bbbb...", "...b..b...", "...b..b...", "...b..b..."],
  legsDress: ["..bbbbbb..", ".bbbbbbbb.", "bbbbbbbbbb", "bbbbbbbbbb", ".bbbbbbbb."],
  childM: ["..hhhh..", ".hhhhhh.", "hhhhhhhh", "hssssssh", "hsessesh", ".ssssss.", ".ssmmss.", "..ssss..", ".tttttt.", "tttttttt", "s.tttt.s", "..tttt..", "..bbbb..", "..b..b..", ".kk..kk."],
  childF: ["..hhhhr.", ".hhhhhh.", "hhhhhhhh", "hssssssh", "hsessesh", "hssssssh", "hssmmssh", "h.ssss.h", ".tttttt.", "tttttttt", "s.tttt.s", ".tttttt.", "tttttttt", "..s..s..", ".kk..kk."],
  baby: ["..hhh..", ".sssss.", "sessses", "sssssss", ".ssmss.", ".ooooo.", "ooooooo", ".ooooo.", ".o...o."],
};
// Where the mouth is, for a mask: [row, first column, width].
const MASK = { adultM: [5, 2, 6], adultF: [5, 2, 6], adultFbob: [5, 2, 6], childM: [5, 2, 4], childF: [5, 2, 4] };

function outfitColors(p) {
  const l = p.look;
  switch (p.outfit) {
    case "uniform": return { t: "#2f4f7f", b: "#26324a" };
    case "army": return { t: "#5b6b3a", b: "#4a5530" };
    case "scrubs": return { t: "#4fa3a0", b: "#4fa3a0" };
    case "suit": return { t: "#3a4250", b: "#2a2f38" };
    case "white": return { t: "#f4f6f8", b: "#8fa3b8" };
    case "apron": return { t: l.top, b: "#5a4a3a" };
    case "work": return { t: "#4f6f95", b: "#3f5a7a" };
    case "groom": return { t: "#22252b", b: "#22252b" };
    case "bride": return { t: "#fbf9f5", b: "#fbf9f5" };
    default: return { t: l.top, b: l.bottom };
  }
}

function spriteOf(p) {
  if (p.form === "baby") return ["baby", SPR.baby];
  if (p.form === "child") return p.sex === "female" ? ["childF", SPR.childF] : ["childM", SPR.childM];
  if (p.sex === "male") return ["adultM", SPR.adultM];
  const name = p.look.bob || p.form === "elder" ? "adultFbob" : "adultF";
  let list = SPR[name];
  // Legs: a long dress for a bride, trousers for half the women and for work clothes, a skirt otherwise.
  if (p.outfit === "bride") list = [...list.slice(0, 15), ...SPR.legsDress, list[20]];
  else if (!p.look.skirt || ["work", "white", "suit", "army", "uniform", "scrubs"].includes(p.outfit)) list = [...list.slice(0, 15), ...SPR.legsPants, list[20]];
  return [name, list];
}

const DARK = "#0d1210";
// Draws a person whose feet stand on row footY - 1. Returns the top row, for an icon above the head.
function drawPerson(g, p, x, footY, t, i = 0, { mask = false, silhouette = false } = {}) {
  const [name, list] = spriteOf(p), l = p.look, { t: top, b: bottom } = outfitColors(p);
  // Children bounce a little; everyone blinks now and then.
  const hop = p.form === "child" ? Math.floor((t + i * 230) / 380) % 2 : 0;
  const blink = (t + i * 977) % 3400 < 150;
  const y = footY - list.length - hop;
  const pal = silhouette
    ? { h: DARK, s: DARK, e: DARK, m: DARK, t: DARK, b: DARK, k: DARK, r: DARK, o: DARK }
    : { h: p.gray ? GRAY[p.gray] : l.hair, s: l.skin, e: blink ? l.skin : "#1a1414", m: "#c4685e", t: top, b: bottom, k: "#2a2a2a", r: "#e0607a", o: ONESIE[p.sex] };
  if (p.outfit === "bride" && !silhouette) { g.globalAlpha = 0.7; px(g, x - 1, y + 1, list[0].length + 2, 13, "#ffffff"); g.globalAlpha = 1; }
  rows(g, list, x, y, pal);
  if (silhouette) return y;
  const wide = list[0].length === 10;
  if (wide && (p.outfit === "suit" || p.outfit === "groom")) { px(g, x + 4, y + 9, 2, 1, "#f1efe8"); px(g, x + 4, y + 10, 2, p.outfit === "groom" ? 1 : 3, p.outfit === "groom" ? "#1a1a1a" : "#9b2f2f"); }
  if (wide && p.outfit === "apron") { px(g, x + 3, y + 11, 4, 6, "#f3ead8"); px(g, x + 3, y + 9, 1, 2, "#f3ead8"); px(g, x + 6, y + 9, 1, 2, "#f3ead8"); }
  if (wide && p.outfit === "white") { px(g, x + 3, y + 10, 1, 3, "#5a6470"); px(g, x + 6, y + 10, 1, 3, "#5a6470"); }
  if (p.outfit === "bride") { px(g, x + 1, y + 1, 2, 2, "#f08aa8"); }
  if (mask && MASK[name]) { const [r, c, w] = MASK[name]; px(g, x + c, y + r, w, 2, "#eef3f6"); }
  if (p.cane) { px(g, x + list[0].length, y + 12, 1, list.length - 12, "#7a5636"); px(g, x + list[0].length - 1, y + 12, 2, 1, "#7a5636"); }
  return y;
}

// A crib with a baby in it.
function drawCrib(g, p, x, footY, t) {
  const y = footY - 12;
  px(g, x, y + 9, 16, 2, "#f2ede4");
  rows(g, SPR.baby.slice(0, 5), x + 5, y + 4, { h: p.look.hair, s: p.look.skin, e: (t % 3400) < 300 ? p.look.skin : "#1a1414", m: "#c4685e" });
  px(g, x + 3, y + 8, 10, 2, ONESIE[p.baby || p.sex]);
  px(g, x, y + 1, 16, 1, "#b07d48"); px(g, x, y + 11, 16, 1, "#b07d48");
  px(g, x, y, 1, 12, "#8a5a35"); px(g, x + 15, y, 1, 12, "#8a5a35");
  for (let k = 2; k < 15; k += 3) px(g, x + k, y + 2, 1, 7, "#c99a62");
  return y + 2;
}

// A patient lying in the hospital bed (the bed is part of the place): the head on the pillow, eyes closed.
function drawPatient(g, p) {
  const head = (p.sex === "female" ? SPR.childF : SPR.childM).slice(0, 7).map(r => r.replace(/e/g, "-").replace(/r/g, "h"));
  rows(g, head, 38, 17, { h: p.gray ? GRAY[p.gray] : p.look.hair, s: p.look.skin, "-": "#5a4a40", m: "#c4685e" });
  return 17;
}

/* ---------- icons for what just happened ---------- */
const ICON_ART = {
  heart: [".rr.rr.", "rrrrrrr", "rrrrrrr", ".rrrrr.", "..rrr..", "...r..."],
  broken: [".rr.rr.", "rrr.rrr", "rr.rrrr", ".rrr.r.", "..r.r..", "...r..."],
  star: ["...y...", "..yyy..", "yyyyyyy", ".yyyyy.", ".yy.yy.", "y.....y"],
  baby: [".ppp.", "pssp.", "pssp.", ".ppp.", "ppppp"],
  house: ["...r...", "..rrr..", ".rrrrr.", "rrrrrrr", ".wwwww.", ".ww.ww.", ".ww.ww."],
  plane: ["...w...", "...w...", "wwwwwww", "..www..", "...w...", "..www.."],
  coin: [".yyy.", "yyoyy", "yoyyy", "yyoyy", ".yyy."],
  cross: [".www.", "wwrww", "wrrrw", "wwrww", ".www."],
  tear: ["..b..", ".bb..", "bbbb.", "bbbb.", ".bb.."],
  sweat: ["..b..", ".bbb.", "bbbbb", ".bbb."],
  note: ["..nnn", "..n.n", "..n.n", "nnn.n", "nnnnn"],
};
const ICON_PAL = { r: "#e2485e", y: "#f6cf4a", p: "#f4b3c6", s: "#f3cfae", w: "#f7f7f7", o: "#d9a32e", b: "#7fb2e8", n: "#3a4250" };

// Which icon, if any, the entries of this step deserve: the last one that matches.
const ICON_RULES = [
  [/^(proposal|realPartnerWedding|e_2015marriage)$/, "heart"],
  [/^(realPartnerMeet|dating|crush|firstLove)$/, "heart"],
  [/^(baby|moreKids|grandchild)$/, "baby"],
  [/^(firstJob|findJob|promotion|graduateUni|graduateMaster|ccDone|tradeDone|studyAward|highSchool)$/, "star"],
  [/^buyHome$/, "house"],
  [/^abroad$/, "plane"],
  [/^(windfall|inheritance)$/, "coin"],
  [/^(divorce|breakup)$/, "broken"],
  [/^(serious|chronic|accident|childIllness)$/, "cross"],
  [/Death$|^widowed$/, "tear"],
  [/^(layoff|burnout|loss)$/, "sweat"],
  [/^retire$/, "note"],
];
export function iconOf(entries) {
  let icon = null;
  for (const e of entries) {
    if (!e || !e.id || e.id === "death") continue;
    for (const [re, name] of ICON_RULES) if (re.test(e.id) && (e.big || name === "heart" || name === "star")) { icon = name; break; }
  }
  return icon;
}

/* ---------- reading the life ---------- */
const CAMPUS = /^(college|community|trade|grad|law|med|phd)$/;
// Where a job is drawn, and what you wear to it, by the job's sector (src/sim/world.js FIELD_TAGS).
const JOB_PLACE = {
  education: "school", "child care": "school", academia: "campus", research: "clinic", "health care": "clinic", "social services": "clinic",
  "food service": "shop", retail: "shop", "self-employed": "shop", service: "shop", hospitality: "shop", beauty: "shop", family: "shop",
  manufacturing: "factory", construction: "factory", repair: "factory", agriculture: "factory", logistics: "street", "public safety": "street", military: "street",
};
const JOB_OUTFIT = {
  "health care": "scrubs", research: "white", "social services": "casual", "food service": "apron", retail: "apron", service: "apron", hospitality: "apron",
  "self-employed": "apron", family: "apron", beauty: "apron", manufacturing: "work", construction: "work", repair: "work", agriculture: "work", logistics: "work",
  tech: "suit", finance: "suit", office: "suit", sales: "suit", law: "suit", government: "suit", "real estate": "suit", marketing: "suit", consulting: "suit",
  management: "suit", insurance: "suit", military: "army", "public safety": "uniform", security: "uniform",
};
const STORMS = new Set(["e_2005katrina"]);
const ECLIPSES = new Set(["e_2017eclipse", "e_2024eclipse"]);
export const PLACE_LABEL = { home: "Home", nursery: "The maternity ward", school: "School", campus: "Campus", office: "The office", factory: "The shop floor", shop: "At work", clinic: "The clinic", street: "Downtown", park: "The park", hospital: "The hospital", wedding: "The wedding", abroad: "Abroad", farewell: "Goodnight" };
export const WEATHER_LABEL = { sunny: "clear skies, a bright year", fair: "fair skies, a good year", cloudy: "overcast, an even year", rain: "rain, a year to go easy", night: "a sky full of stars", eclipse: "a total eclipse" };

// at: the age drawn; recent: the age the step's news happened at (the engine moves to the next year at the end of a
// step, so a wedding or a diagnosis is "recent" when the picture comes right after it).
function placeOf(s, at, recent, moment) {
  if (!s.alive && !moment) return "farewell";
  if (at === 0) return "nursery";
  if (s.rel === "married" && (s.since === at || s.since === recent)) return "wedding";
  if (s.health && s.health.serious && (s.health.serious.since === at || s.health.serious.since === recent)) return "hospital";
  if (s.abroad) return "abroad";
  if (s.studying && s.age >= 5) return s.age >= 18 || CAMPUS.test(s.track || "") ? "campus" : "school";
  if (s.employed && s.job && !s.retired) return JOB_PLACE[s.job.field] || "office";
  if (s.retired || s.age >= 65) return "park";
  if (s.age < 18) return "home";
  return s.unemployedFor > 0 && !(s.rel === "married" && s.kids.length) ? "street" : "home";
}
function outfitOf(s, kind) {
  if (kind === "wedding") return s.sex === "female" ? "bride" : "groom";
  if (s.employed && s.job && !s.retired && ["office", "school", "clinic", "shop", "factory", "street", "campus"].includes(kind)) return JOB_OUTFIT[s.job.field] || "casual";
  return "casual";
}
function abroadVariant(where = "") {
  if (/Japan/.test(where)) return "jp";
  if (/UK|Germany|Netherlands|Ireland|France|Italy|Spain|Europe/.test(where)) return "eu";
  if (/Australia|New Zealand/.test(where)) return "au";
  return "city";
}
export function weatherOf(luck, ids = new Set()) {
  if ([...ids].some(id => ECLIPSES.has(id))) return "eclipse";
  if ([...ids].some(id => STORMS.has(id))) return "rain";
  const sc = luck && Number.isFinite(luck.score) ? luck.score : 50;
  return sc >= 62 ? "sunny" : sc >= 50 ? "fair" : sc >= 40 ? "cloudy" : "rain";
}

// The picture of this moment of a life.
//   s        the life state after this step       luck     the year's luck entry (score 50 is an even year)
//   entries  what happened in this step           key      a seed, so one life keeps the same faces
//   place    a place to use instead of the one the state gives (a graduation is drawn on the campus)
//   age      draw an earlier moment of this state: everyone is as old as they were then (for the recap)
export function sceneOf(s, luck, entries = [], key = "", { place = null, age = null } = {}) {
  const ids = new Set(entries.map(e => e && e.id));
  const moment = age !== null && age !== undefined;
  const at = moment ? age : s.age, shift = s.age - at, year = s.year - shift;
  const recent = entries.length ? Math.max(...entries.map(e => (e && Number.isFinite(e.age) ? e.age : at))) : at;
  const kind = place || placeOf(s, at, recent, moment);
  const variant = kind === "abroad" ? abroadVariant(s.abroad) : kind === "nursery" ? s.sex : kind === "hospital" ? "patient"
    : kind === "home" ? (s.home === "own" ? "own" : s.home === "parents" ? "parents" : "rent") : "";
  const P = (role, sex, a, outfit = "casual") => personAt({ key: `${role}|${key}`, sex, age: Math.max(0, a), outfit });
  const me = personAt({ key: `me|${key}`, sex: s.sex, age: at, outfit: outfitOf({ ...s, age: at }, kind) });
  const cast = [];
  // Parents at home while you are a child, at your birth, and in the last picture when they outlive you.
  if (((kind === "home" || kind === "nursery") && at < 18) || kind === "farewell") {
    if (s.father && s.father.alive) cast.push({ role: "father", p: P("father", "male", s.father.age - shift) });
    if (s.mother && s.mother.alive) cast.push({ role: "mother", p: P("mother", "female", s.mother.age - shift) });
  }
  const partnerHere = s.partner && s.partner.alive !== false && (s.rel === "married" || s.rel === "dating")
    && ["home", "park", "wedding", "street", "hospital", "farewell"].concat(s.rel === "married" ? ["abroad"] : []).includes(kind);
  if (partnerHere) {
    const pa = (Number.isFinite(s.partner.age) ? s.partner.age : s.year - (s.partner.birthYear || s.year - s.age)) - shift;
    const psex = s.partner.sex || (s.sex === "female" ? "male" : "female");
    cast.push({ role: "partner", p: P(`partner-${s.partner.name || ""}`, psex, pa, kind === "wedding" ? (psex === "female" ? "bride" : "groom") : "casual") });
  }
  const born = s.kids.filter(k => k.alive !== false && k.age - shift >= 0);
  const kidsHere = kind === "farewell" ? born : ["home", "park", "hospital", "wedding"].includes(kind) ? born.filter(k => k.age - shift < 18) : [];
  for (const k of kidsHere.slice(-3)) cast.push({ role: "kid", p: P(`kid-${k.name || k.call || ""}`, k.sex, k.age - shift) });
  return {
    kind, variant, me, cast,
    weather: kind === "farewell" ? "night" : weatherOf(luck, ids),
    icon: iconOf(entries),
    mask: year >= 2020 && year <= 2021 && !["home", "nursery", "wedding", "farewell", "park"].includes(kind),
    quake: false,
    place: kind === "abroad" ? s.abroad : PLACE_LABEL[kind],
    age: at, year,
  };
}

// The caption under the picture: where, and the weather of the year.
export const captionOf = v => `${v.place} · ${WEATHER_LABEL[v.weather] || ""}`;

// A few pictures of a life's stages for the welcome page.
export function demoViews() {
  const P = (key, sex, age, outfit) => personAt({ key, sex, age, outfit });
  const base = { icon: null, mask: false, quake: false };
  return [
    { ...base, kind: "nursery", variant: "female", weather: "sunny", me: P("demo-me", "female", 0), cast: [{ role: "father", p: P("demo-dad", "male", 31) }, { role: "mother", p: P("demo-mom", "female", 29) }], place: "Born" },
    { ...base, kind: "school", variant: "", weather: "fair", me: P("demo-me", "female", 9), cast: [], place: "School" },
    { ...base, kind: "office", variant: "", weather: "cloudy", me: P("demo-me", "female", 27, "suit"), cast: [], place: "Work", icon: "star" },
    { ...base, kind: "wedding", variant: "", weather: "sunny", me: P("demo-me", "female", 30, "bride"), cast: [{ role: "partner", p: P("demo-love", "male", 32, "groom") }], place: "Love", icon: "heart" },
    { ...base, kind: "home", variant: "own", weather: "rain", me: P("demo-me", "female", 36), cast: [{ role: "partner", p: P("demo-love", "male", 38) }, { role: "kid", p: P("demo-kid", "male", 5) }], place: "Home" },
    { ...base, kind: "park", variant: "", weather: "fair", me: P("demo-me", "female", 70), cast: [{ role: "partner", p: P("demo-love", "male", 72) }], place: "Later" },
    { ...base, kind: "farewell", variant: "", weather: "night", me: P("demo-me", "female", 88), cast: [{ role: "kid", p: P("demo-kid", "male", 52) }, { role: "kid", p: P("demo-kid2", "female", 49) }], place: "The stars" },
  ];
}

/* ---------- the sky and the weather ---------- */
const SKY = {
  sunny: ["#6fb0e0", "#86bde6", "#9dcaeb", "#b6d8f0"],
  fair: ["#7fb6dd", "#93c1e3", "#a8cde8", "#bfd9ed"],
  cloudy: ["#93a2b0", "#a2b0bc", "#b1bdc8", "#c1cbd3"],
  rain: ["#56606b", "#636d78", "#707a85", "#7d8792"],
  night: ["#0b1026", "#111840", "#18204e", "#20295c"],
  eclipse: ["#1b2240", "#232b4d", "#2c355a", "#3a4468"],
};
function drawSky(g, v, t) {
  const bands = SKY[v.weather] || SKY.fair;
  bands.forEach((c, i) => px(g, 0, i * 11, W, 11, c));
  if (v.weather === "eclipse") {
    const r = rngOf(17);
    for (let i = 0; i < 12; i++) px(g, r() * W | 0, r() * 22 | 0, 1, 1, "#d9d6ff");
    g.globalAlpha = 0.35 + 0.1 * Math.sin(t / 400); disc(g, 100, 9, 7, "#f6efd0"); g.globalAlpha = 1;
    disc(g, 100, 9, 5, "#0b0d18");
    return;
  }
  if (v.weather === "night") {
    const r = rngOf(31);
    for (let i = 0; i < 40; i++) { const x = r() * W | 0, y = r() * 28 | 0; if ((Math.floor(t / 700) + i) % 6) px(g, x, y, 1, 1, i % 5 ? "#e9e4ff" : "#f3d98b"); }
    // A small constellation (the Big Dipper's bowl and handle), joined by faint lines.
    g.globalAlpha = 0.35; for (const [a, b] of [[[14, 6], [22, 5]], [[22, 5], [30, 8]], [[30, 8], [36, 12]], [[36, 12], [44, 11]], [[44, 11], [45, 17]], [[45, 17], [37, 18]], [[37, 18], [36, 12]]]) { const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); for (let k = 0; k <= n; k++) px(g, a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, 1, 1, "#b9b2f0"); } g.globalAlpha = 1;
    for (const [x, y] of [[14, 6], [22, 5], [30, 8], [36, 12], [44, 11], [45, 17], [37, 18]]) px(g, x, y, 1, 1, "#fff6d6");
    g.globalAlpha = 0.25; disc(g, 108, 8, 6, "#f3e3a6"); g.globalAlpha = 1; disc(g, 108, 8, 4, "#f6e8b4");
    return;
  }
  if (v.weather === "sunny") {
    const ray = Math.floor(t / 600) % 2 ? 1 : 0.85;
    disc(g, 114, 7, 4, "#fff1b8");
    g.globalAlpha = 0.6; for (const [dx, dy] of [[0, -7], [0, 7], [-7, 0], [7, 0], [-5, -5], [5, 5], [-5, 5], [5, -5]]) px(g, 114 + dx * ray, 7 + dy * ray, 1, 1, "#fff1b8"); g.globalAlpha = 1;
    cloud(g, (20 + t / 520) % (W + 18) - 18, 5, "#f4f8fb");
  } else if (v.weather === "fair") {
    disc(g, 112, 8, 3, "#fff1b8");
    cloud(g, (12 + t / 480) % (W + 18) - 18, 4, "#f4f8fb"); cloud(g, (70 + t / 400) % (W + 18) - 18, 10, "#eef3f7"); cloud(g, (110 + t / 600) % (W + 18) - 18, 2, "#f4f8fb");
  } else {
    const c = v.weather === "rain" ? "#4a525c" : "#d5dbe0", d = v.weather === "rain" ? "#3f474f" : "#c5ccd2";
    for (let i = 0; i < 5; i++) cloud(g, (i * 30 + t / (420 + i * 60)) % (W + 18) - 18, 1 + (i % 3) * 4, i % 2 ? c : d);
  }
}
function drawRain(g, t) {
  g.globalAlpha = 0.55;
  const r = rngOf(Math.floor(t / 80));
  for (let i = 0; i < 55; i++) px(g, r() * W, r() * H, 1, 3, "#c9d6ea");
  g.globalAlpha = 1;
}

/* ---------- places (the still parts, drawn once) ---------- */
// A car seen from the side (a yellow one is a cab).
function car(g, x, y, c, cab = false) {
  px(g, x + 3, y, 9, 3, c); px(g, x, y + 3, 16, 3, c); px(g, x + 4, y + 1, 3, 2, "#bcd6ea"); px(g, x + 8, y + 1, 3, 2, "#bcd6ea");
  if (cab) { px(g, x + 6, y - 1, 3, 1, "#2a2a2a"); for (let k = 1; k < 15; k += 2) px(g, x + k, y + 4, 1, 1, "#2a2a2a"); }
  disc(g, x + 3, y + 6, 1, "#1e1e1e"); disc(g, x + 12, y + 6, 1, "#1e1e1e"); px(g, x + 15, y + 3, 1, 1, "#ffe9a0");
}
function desk(g, x) {
  px(g, x, 26, 24, 2, "#c9b49a"); px(g, x + 2, 28, 2, 9, "#8e7d68"); px(g, x + 20, 28, 2, 9, "#8e7d68");
  px(g, x + 6, 17, 12, 8, "#2b3138"); px(g, x + 7, 18, 10, 6, "#8fc9ef"); px(g, x + 11, 25, 2, 1, "#2b3138");
}
// A string of warm bulbs hanging between two points.
function lights(g, x0, x1, y, sag = 4) {
  for (let x = x0; x <= x1; x++) { const k = (x - x0) / (x1 - x0), yy = Math.round(y + Math.sin(k * Math.PI) * sag); px(g, x, yy, 1, 1, "#5a4a3a"); if ((x - x0) % 4 === 2) px(g, x, yy + 1, 1, 2, "#ffd27a"); }
}
const tiles = (g, a, b, y0 = FLOOR) => { for (let x = 0; x < W; x += 8) px(g, x, y0, 8, H - y0, (x / 8) % 2 ? a : b); };

const BACK = {
  home(g, v) {
    const wall = v.variant === "own" ? "#e9dcc6" : v.variant === "rent" ? "#e1ded3" : "#ead6bb";
    px(g, 0, 0, W, FLOOR, wall); px(g, 0, FLOOR - 2, W, 2, "#c9a77f");
    px(g, 8, 4, 30, 24, "#f5efe6"); g.clearRect(10, 6, 26, 20); px(g, 22, 6, 2, 20, "#f5efe6"); px(g, 10, 15, 26, 2, "#f5efe6");
    px(g, 4, 2, 5, 28, "#e49aa4"); px(g, 37, 2, 5, 28, "#e49aa4"); px(g, 3, 1, 40, 2, "#b07d48");
    px(g, 88, 6, 10, 8, "#f2ece2"); px(g, 90, 8, 6, 4, "#6b9f78"); px(g, 101, 9, 8, 7, "#f2ece2"); px(g, 103, 11, 4, 3, "#7aa3c7");
    px(g, 114, 5, 8, 10, "#fbf7f0"); px(g, 114, 5, 8, 3, "#c0392b"); px(g, 116, 10, 4, 1, "#9a948a"); px(g, 116, 12, 4, 1, "#9a948a");
    px(g, 46, 22, 44, 10, "#7d93b5"); px(g, 42, 20, 6, 14, "#6a81a3"); px(g, 88, 20, 6, 14, "#6a81a3"); px(g, 48, 20, 20, 4, "#91a6c6"); px(g, 68, 20, 20, 4, "#91a6c6");
    px(g, 100, 30, 7, 7, "#b46a3c"); disc(g, 103, 26, 4, "#4f8a4f"); disc(g, 101, 23, 3, "#5fa35f");
    px(g, 123, 14, 1, 23, "#7b7b7b"); px(g, 119, 10, 9, 5, "#f1d48a");
    px(g, 0, FLOOR, W, H - FLOOR, "#b48a5e"); for (let i = 6; i < W; i += 14) px(g, i, FLOOR, 1, H - FLOOR, "#a07850");
  },
  nursery(g, v) {
    px(g, 0, 0, W, FLOOR, "#e4f0ea"); px(g, 0, 22, W, 15, "#d8e8e1"); px(g, 0, 22, W, 1, "#cfe0d8");
    px(g, 96, 4, 26, 18, "#ffffff"); g.clearRect(98, 6, 22, 14); px(g, 108, 6, 2, 14, "#ffffff");
    const c = v.variant === "female" ? "#f08aa8" : v.variant === "unknown" ? "#a6d98c" : "#7fb2e8";
    disc(g, 12, 8, 5, c); px(g, 12, 13, 1, 15, "#9aa6a8"); disc(g, 23, 11, 4, "#f6d36b"); px(g, 23, 15, 1, 13, "#9aa6a8");
    px(g, 76, 5, 12, 13, "#fffaf2"); px(g, 78, 8, 2, 4, "#f2a3b5"); px(g, 83, 10, 2, 4, "#f2a3b5");
    tiles(g, "#d3e0dc", "#c4d4cf");
  },
  school(g) {
    px(g, 0, 0, W, FLOOR, "#efe6d2"); px(g, 0, 25, W, 12, "#d9c9a6"); px(g, 0, 25, W, 1, "#c4b28c");
    px(g, 30, 3, 64, 20, "#7a5a3a"); px(g, 32, 5, 60, 16, "#2f5d47");
    px(g, 36, 8, 18, 1, "#e9efe9"); px(g, 36, 11, 12, 1, "#e9efe9"); px(g, 36, 14, 22, 1, "#e9efe9"); px(g, 62, 8, 16, 1, "#f2e08a"); px(g, 62, 11, 22, 1, "#e9efe9"); px(g, 62, 14, 14, 1, "#cfe3d7");
    disc(g, 86, 16, 2, "#f2e08a"); px(g, 33, 23, 58, 1, "#8a6a48");
    px(g, 100, 4, 22, 17, "#f7f2e6"); g.clearRect(102, 6, 18, 13); px(g, 110, 6, 2, 13, "#f7f2e6");
    disc(g, 15, 8, 4, "#fbfbf6"); px(g, 15, 5, 1, 4, "#333333"); px(g, 15, 8, 3, 1, "#333333");
    px(g, 4, 13, 22, 9, "#c49a6c"); px(g, 6, 14, 5, 4, "#f7f2e6"); px(g, 13, 15, 5, 5, "#f3d27a"); px(g, 20, 14, 4, 4, "#9cc7ec");
    for (const x of [3, 107]) { px(g, x, 28, 18, 2, "#c08a52"); px(g, x + 2, 30, 2, 7, "#6b4a2b"); px(g, x + 14, 30, 2, 7, "#6b4a2b"); }
    px(g, 0, FLOOR, W, H - FLOOR, "#b9a07a"); for (let x = 0; x < W; x += 12) px(g, x, FLOOR, 1, H - FLOOR, "#a88f69");
  },
  campus(g) {
    px(g, 66, 12, 62, 25, "#a8553f"); px(g, 63, 9, 65, 3, "#6f6f6f");
    px(g, 86, 4, 22, 8, "#a8553f"); px(g, 84, 2, 26, 2, "#6f6f6f"); disc(g, 97, 7, 1, "#f0e3cc");
    for (let x = 70; x < 124; x += 8) { px(g, x, 17, 5, 7, "#f0e3cc"); px(g, x + 1, 16, 3, 1, "#f0e3cc"); }
    px(g, 92, 27, 10, 10, "#5b3a2a"); px(g, 97, 27, 1, 10, "#3e271c");
    tree(g, 12, 8); tree(g, 44, 10);
    px(g, 0, 31, W, 6, "#6aa84f"); for (let i = 0; i < W; i += 4) px(g, i, 30, 1, 1, "#7cbc5f");
    px(g, 0, FLOOR, W, H - FLOOR, "#cdbf9f"); px(g, 0, FLOOR, W, 1, "#b5a785");
  },
  office(g, v) {
    px(g, 0, 0, W, FLOOR, "#dfe5e8");
    px(g, 4, 3, 60, 27, "#9aa6ad"); g.clearRect(6, 5, 56, 23);
    const r = rngOf(7); let x = 6;
    while (x < 62) { const w = 5 + (r() * 7 | 0), h = 5 + (r() * 9 | 0), ww = Math.min(w, 62 - x); px(g, x, 28 - h, ww, h, "#7b8794"); for (let wy = 28 - h + 2; wy < 27; wy += 3) for (let wx = x + 1; wx < x + ww - 1; wx += 3) if (r() < 0.55) px(g, wx, wy, 1, 1, "#c9d8e4"); x += w + 1; }
    px(g, 33, 5, 2, 23, "#9aa6ad"); px(g, 6, 16, 56, 1, "#9aa6ad");
    desk(g, 70); desk(g, 100);
    px(g, 122, 22, 6, 15, "#c9d4dc"); px(g, 122, 17, 6, 5, "#9fd0f0");
    px(g, 0, FLOOR, W, H - FLOOR, "#8d99a6"); for (let k = 0; k < W; k += 6) px(g, k, FLOOR + 2 + ((k / 6) % 2) * 3, 3, 1, "#7f8b98");
  },
  factory(g) {
    px(g, 0, 0, W, FLOOR, "#c9ccc8"); px(g, 0, 0, W, 5, "#a9ada9");
    for (const x of [8, 40, 72, 104]) { px(g, x - 1, 7, 18, 8, "#8e9396"); g.clearRect(x, 8, 16, 6); px(g, x + 8, 8, 1, 6, "#8e9396"); }
    px(g, 3, 17, 22, 20, "#5f7d8c"); px(g, 6, 20, 10, 5, "#2b3138"); px(g, 8, 22, 6, 1, "#7fe0a0"); disc(g, 20, 22, 1, "#e05a4a"); disc(g, 20, 27, 1, "#f2c65a");
    px(g, 102, 15, 24, 22, "#7b8f6a"); px(g, 105, 18, 18, 7, "#5f705a"); px(g, 109, 28, 10, 9, "#4f5e4a"); px(g, 100, 12, 28, 3, "#e0b84a");
    px(g, 28, 29, 72, 2, "#3b3f45"); for (let x = 30; x < 98; x += 5) disc(g, x, 32, 1, "#2a2d31"); px(g, 30, 33, 2, 4, "#2a2d31"); px(g, 95, 33, 2, 4, "#2a2d31");
    px(g, 0, FLOOR, W, H - FLOOR, "#8a8f93"); px(g, 0, FLOOR + 2, W, 1, "#e0b84a"); for (let x = 0; x < W; x += 10) px(g, x, FLOOR + 2, 5, 1, "#2a2d31");
  },
  shop(g) {
    px(g, 0, 0, W, FLOOR, "#f3e9dc");
    px(g, 30, 3, 56, 13, "#3a3a3a"); for (let k = 0; k < 3; k++) { px(g, 33, 6 + k * 3, 20, 1, ["#f2c65a", "#f7f7f7", "#7fd0c0"][k]); px(g, 60, 6 + k * 3, 22, 1, ["#f7f7f7", "#f29a8a", "#f2c65a"][k]); }
    px(g, 4, 6, 20, 7, "#2a2440"); px(g, 6, 8, 3, 3, "#ff6f91"); px(g, 10, 8, 3, 3, "#ff6f91"); px(g, 14, 8, 3, 3, "#7fe0d0"); px(g, 18, 8, 3, 3, "#7fe0d0");
    px(g, 100, 6, 24, 31, "#b5865a"); g.clearRect(102, 8, 20, 27); px(g, 102, 20, 20, 1, "#b5865a");
    for (let x = 0; x < W; x += 8) for (let y = FLOOR; y < H; y += 4) px(g, x, y, 8, 4, ((x / 8) + (y - FLOOR) / 4) % 2 ? "#d9cbb6" : "#cdbea8");
  },
  street(g, v) {
    const r = rngOf(11); let x = 0;
    while (x < W) {
      const w = 14 + (r() * 10 | 0), h = 15 + (r() * 12 | 0), c = ["#e8dcc4", "#c9c2b6", "#d8c8b0", "#b9c3c9", "#e2d2c2"][r() * 5 | 0];
      {
        px(g, x, 31 - h, w, h, c);
        for (let wy = 31 - h + 3; wy < 23; wy += 5) for (let wx = x + 2; wx < x + w - 4; wx += 5) { px(g, wx, wy, 3, 3, "#8fa6b8"); px(g, wx, wy + 1, 3, 1, "#6f7f8b"); }
        if (r() < 0.75) { const sc = ["#c0392b", "#e0a030", "#2f6db5", "#3f8f5f"][r() * 4 | 0], sh = Math.min(12, h - 8); px(g, x + w - 4, 31 - h + 3, 3, sh, sc); for (let k = 0; k + 2 < sh; k += 3) px(g, x + w - 3, 31 - h + 4 + k, 1, 2, "#fdf3d8"); }
        px(g, x, 26, w, 5, "#6f6a62"); px(g, x, 25, w, 1, "#5a554e");
      }
      x += w;
    }
    px(g, 0, 31, W, 6, "#b7b2a8"); px(g, 0, FLOOR, W, H - FLOOR, "#4a4e55"); for (let i = 0; i < W; i += 12) px(g, i, 41, 6, 1, "#e9e4c8");
    car(g, 2, 31, "#c0392b"); car(g, 104, 31, "#f2c230", true);
    px(g, 66, 9, 1, 22, "#3a3d44"); px(g, 64, 8, 6, 2, "#3a3d44"); px(g, 68, 10, 3, 1, "#f6e7a0");
  },
  park(g) {
    hills(g, 22, "#7fae7c", 2, 0.06, 0, 31); hills(g, 25, "#5f9a61", 3, 0.08, 2, 31);
    tree(g, 10); tree(g, 114);
    px(g, 0, 31, W, H - 31, "#5c9140"); for (let i = 0; i < W; i += 4) px(g, i, 30, 1, 1, "#76b055");
    for (const [fx, c] of [[28, "#f2c65a"], [36, "#f08aa8"], [100, "#f7f7f7"], [107, "#f2c65a"]]) { px(g, fx, 35, 1, 2, "#3f7a45"); px(g, fx, 34, 1, 1, c); }
    px(g, 80, 26, 22, 2, "#8a5a35"); px(g, 80, 22, 22, 2, "#8a5a35"); px(g, 82, 28, 1, 6, "#5a3a20"); px(g, 99, 28, 1, 6, "#5a3a20");
  },
  hospital(g, v) {
    px(g, 0, 0, W, FLOOR, "#e6eef2"); px(g, 0, 22, W, 1, "#d2dde3");
    px(g, 100, 4, 24, 18, "#ffffff"); g.clearRect(102, 6, 20, 14); px(g, 111, 6, 2, 14, "#ffffff");
    px(g, 2, 2, 24, 1, "#9aa6ad"); for (let x = 3; x < 22; x += 3) px(g, x, 3, 2, 30, "#bfe0d0");
    px(g, 70, 4, 9, 9, "#ffffff"); px(g, 73, 5, 3, 7, "#d64545"); px(g, 71, 7, 7, 3, "#d64545");
    px(g, 84, 10, 14, 10, "#2b3138"); px(g, 85, 11, 12, 8, "#10261a"); px(g, 90, 20, 2, 17, "#9aa6ad");
    if (v.variant === "patient") {
      px(g, 34, 24, 2, 13, "#9aa6ad"); px(g, 80, 21, 2, 16, "#9aa6ad"); px(g, 36, 27, 44, 2, "#f4f6f8"); px(g, 36, 29, 44, 2, "#9aa6ad");
      px(g, 38, 31, 2, 6, "#7d8a92"); px(g, 76, 31, 2, 6, "#7d8a92"); px(g, 37, 23, 10, 4, "#ffffff");
      px(g, 29, 6, 1, 31, "#9aa6ad"); px(g, 26, 6, 6, 1, "#9aa6ad"); px(g, 25, 7, 4, 6, "#d8eef8"); px(g, 27, 13, 1, 11, "#cfe3ee");
    }
    tiles(g, "#cdd8dd", "#bfcbd1");
  },
  clinic(g) {
    BACK.hospital(g, { variant: "" });
    px(g, 32, 25, 26, 2, "#c9b49a"); px(g, 34, 27, 2, 10, "#8e7d68"); px(g, 54, 27, 2, 10, "#8e7d68"); px(g, 38, 17, 11, 8, "#2b3138"); px(g, 39, 18, 9, 6, "#bfe8d6");
  },
  wedding(g) {
    px(g, 0, 24, W, 13, "#4f8a4f"); for (let x = 0; x < W; x += 5) disc(g, x + 2, 24, 2, "#5c9a5a");
    px(g, 46, 8, 2, 29, "#f4f1ec"); px(g, 78, 8, 2, 29, "#f4f1ec");
    for (let x = 46; x < 80; x++) { const y = 8 - Math.round(Math.sin(((x - 46) / 33) * Math.PI) * 5); px(g, x, y, 1, 2, "#f4f1ec"); }
    const fl = ["#f08aa8", "#ffffff", "#e2485e", "#f6cf4a"];
    for (let k = 0; k < 22; k++) { const x = 46 + Math.round(k * 1.5), y = 8 - Math.round(Math.sin(((x - 46) / 33) * Math.PI) * 5); px(g, x, y - 1, 2, 2, fl[k % 4]); }
    for (let y = 11; y < 35; y += 4) { px(g, 45, y, 2, 2, fl[y % 4]); px(g, 78, y + 2, 2, 2, fl[(y + 1) % 4]); }
    lights(g, 0, 46, 3, 5); lights(g, 80, 127, 3, 5);
    for (const x of [3, 15, 27, 92, 104, 116]) { px(g, x, 30, 8, 2, "#f7f5f0"); px(g, x, 25, 2, 7, "#f7f5f0"); px(g, x + 6, 25, 2, 7, "#f7f5f0"); px(g, x + 1, 32, 1, 5, "#d9d4ca"); px(g, x + 6, 32, 1, 5, "#d9d4ca"); px(g, x + 3, 25, 2, 2, "#f08aa8"); }
    px(g, 0, FLOOR, W, H - FLOOR, "#5c9140"); px(g, 50, FLOOR, 26, H - FLOOR, "#c0392b"); px(g, 50, FLOOR, 26, 1, "#a32f24");
  },
  abroad(g, v) {
    if (v.variant === "jp") { for (let x = 0; x < W; x++) { const h = Math.round(23 - Math.max(0, 17 - Math.abs(x - 34) * 0.62)); if (h < 23) px(g, x, h, 1, 23 - h, "#7c8ea6"); if (h < 12) px(g, x, h, 1, Math.min(3, 12 - h), "#f4f6fa"); } }
    if (v.variant === "au") { for (const [x, w] of [[78, 11], [88, 10], [97, 8]]) for (let k = 0; k < w; k++) px(g, x + k, 17 + Math.round(((k - w) * (k - w)) / (w * 1.3)), 1, 10, "#f4f1ea"); }
    const r = rngOf(23); let x = 0;
    while (x < W) {
      const w = 9 + (r() * 10 | 0), h = (v.variant === "us" ? 14 : 9) + (r() * (v.variant === "us" ? 16 : 11) | 0), c = ["#8796a8", "#9aa7b6", "#7a889a", "#a9b4c0"][r() * 4 | 0];
      if (!(v.variant === "au" && x > 70 && x < 108)) { px(g, x, 31 - h, w, h, c); for (let wy = 31 - h + 2; wy < 30; wy += 3) for (let wx = x + 2; wx < x + w - 2; wx += 3) if (r() < 0.6) px(g, wx, wy, 1, 2, "#dfe7ef"); }
      x += w + (r() * 3 | 0);
    }
    if (v.variant === "jp") { const c = "#d8432f", tx = 106; for (let y = 4; y < 31; y++) { const half = Math.round(1 + (y - 4) * 0.2); px(g, tx - half, y, 1, 1, c); px(g, tx + half, y, 1, 1, c); if (y % 5 === 0) px(g, tx - half, y, half * 2 + 1, 1, y % 10 === 0 ? "#f4f4f4" : c); } px(g, tx, 0, 1, 5, c); }
    if (v.variant === "eu") { px(g, 104, 6, 8, 25, "#c2a878"); px(g, 102, 3, 12, 3, "#8a7650"); px(g, 106, 0, 4, 3, "#8a7650"); disc(g, 108, 10, 2, "#f4efe2"); px(g, 108, 9, 1, 2, "#333333"); }
    px(g, 0, 31, W, 6, "#c9c4bb"); px(g, 0, FLOOR, W, H - FLOOR, "#a9a49b"); for (let k = 0; k < W; k += 9) px(g, k, FLOOR, 1, H - FLOOR, "#9a958c");
    px(g, 84, 29, 7, 8, "#c0392b"); px(g, 86, 27, 3, 2, "#2a2a2a"); px(g, 85, 37, 1, 1, "#2a2a2a"); px(g, 89, 37, 1, 1, "#2a2a2a");
  },
  farewell(g) {
    hills(g, 25, "#22322b", 2, 0.06, 0, 31); hills(g, 28, "#1b2a23", 3, 0.08, 2, 31);
    px(g, 0, 31, W, H - 31, "#1d2620"); for (let i = 0; i < W; i += 3) px(g, i, 31, 2, 1, "#2a3f31");
  },
};
const OVER = {
  shop(g) {
    px(g, 20, 28, 76, 11, "#b07d48"); px(g, 20, 28, 76, 2, "#d9a66b"); px(g, 20, 38, 76, 1, "#8a5a35");
    for (const x of [26, 33, 40]) { px(g, x, 22, 5, 6, "#e9dcc6"); px(g, x, 25, 5, 3, "#b98a5e"); px(g, x + 1, 27, 1, 1, "#2a1a10"); px(g, x + 3, 26, 1, 1, "#2a1a10"); px(g, x + 2, 19, 1, 3, "#e05a5a"); }
    px(g, 80, 22, 12, 6, "#5b6b7b"); px(g, 82, 23, 8, 2, "#9fe0b0");
  },
  hospital(g, v) { if (v.variant === "patient") { px(g, 46, 24, 34, 4, "#9cc3e0"); px(g, 46, 24, 34, 1, "#b8d6ec"); } },
};
const OUTDOOR = new Set(["campus", "street", "park", "wedding", "abroad", "farewell"]);

/* ---------- moving parts ---------- */
function drawAnim(g, v, t, since) {
  if (v.kind === "factory") { for (let k = 0; k < 3; k++) { const x = 28 + ((t / 45 + k * 24) % 66); px(g, x, 24, 6, 5, "#c9a06a"); px(g, x, 26, 6, 1, "#a8824f"); } }
  if (v.kind === "hospital" || v.kind === "clinic") { const k = Math.floor(t / 90) % 12; for (let i = 0; i < 12; i++) { const y = i === k ? 12 : i === (k + 1) % 12 ? 17 : 15; px(g, 85 + i, y, 1, 1, i <= k ? "#5ef08a" : "#2c6a40"); } }
  if (v.kind === "office" && Math.floor(t / 900) % 2) px(g, 79, 20, 3, 1, "#ffffff");
  if (v.kind === "abroad") { const x = ((t / 30) % (W + 24)) - 12; px(g, x, 7, 8, 1, "#f4f6fa"); px(g, x + 3, 5, 2, 5, "#f4f6fa"); px(g, x + 6, 6, 2, 2, "#f4f6fa"); }
  if (v.kind === "wedding") { const r = rngOf(5); for (let k = 0; k < 22; k++) { const x0 = r() * W, sp = 0.012 + r() * 0.012, y = (r() * H + (t - since) * sp) % H; px(g, x0 + Math.sin(t / 400 + k) * 2, y, 1, 1, ["#f08aa8", "#f6cf4a", "#7fb2e8", "#ffffff"][k % 4]); } }
  if (v.kind === "farewell") {
    // Little stars drift up from the hills and join the sky.
    for (let k = 0; k < 7; k++) {
      const p = (t / 70 + k * 17) % 50, x = 10 + k * 18 + Math.sin(t / 1300 + k) * 3, y = 34 - p;
      if (y < -4) continue;
      g.globalAlpha = Math.max(0.15, Math.min(1, y / 20)) * 0.5; disc(g, Math.round(x), Math.round(y), 2, "#f3d98b"); g.globalAlpha = 1;
      px(g, x, y - 1, 1, 3, "#fff3c4"); px(g, x - 1, y, 3, 1, "#fff3c4");
    }
  }
}
function drawIcon(g, name, x, y, t, since) {
  const art = ICON_ART[name];
  if (!art || t - since > 3200) return;
  const lift = Math.min(3, Math.floor((t - since) / 100)), bob = Math.floor(t / 300) % 2;
  rows(g, art, Math.round(x - art[0].length / 2), y - art.length - 1 - lift + bob, ICON_PAL);
}

/* ---------- painting ---------- */
let makeCanvas = (w, h) => {
  if (typeof document !== "undefined") { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
};
const cache = new Map();
// Tests in node pass their own canvas maker.
export function setCanvasMaker(fn) { makeCanvas = fn; cache.clear(); }
function layer(kind, v, set) {
  const key = `${set === OVER ? "over" : "back"}|${kind}|${v.variant || ""}`;
  if (!cache.has(key)) {
    const c = makeCanvas(W, H), g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    set[kind](g, v);
    cache.set(key, c);
  }
  return cache.get(key);
}

const CENTER = { home: 58, nursery: 64, school: 58, campus: 56, office: 52, factory: 58, shop: 50, clinic: 70, street: 44, park: 54, hospital: 71, wedding: 52, abroad: 60 };
const widthOf = (p, kind) => (p.form === "baby" ? (kind === "nursery" || p.age === 0 ? 16 : 7) : p.form === "child" ? 8 : 10);
// Where everyone stands: parents on the left, you in the middle, your partner and children on the right.
function placeCast(v) {
  const out = [];
  if (v.kind === "farewell") {
    // The one who left is not in the last picture: the family stands together in the middle.
    const total = v.cast.reduce((n, c) => n + widthOf(c.p, v.kind) + 2, -2);
    let x = Math.round(64 - total / 2);
    for (const c of v.cast) { out.push({ p: c.p, x, role: c.role }); x += widthOf(c.p, v.kind) + 2; }
    return out;
  }
  const center = CENTER[v.kind] || 60;
  out.push({ p: v.me, x: center, role: "me" });
  let lx = center - 2;
  for (const c of v.cast.filter(c => c.role === "father" || c.role === "mother").reverse()) { lx -= widthOf(c.p, v.kind) + 2; out.push({ p: c.p, x: lx, role: c.role }); }
  let rx = center + widthOf(v.me, v.kind) + 2;
  for (const c of v.cast.filter(c => c.role === "partner" || c.role === "kid")) { out.push({ p: c.p, x: rx, role: c.role }); rx += widthOf(c.p, v.kind) + 2; }
  return out;
}

// Draws the picture `v` at time t (ms). `since` is when the picture started, for the icon and a quake.
export function paintScene(canvas, v, t, since = 0) {
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.save();
  if (v.quake && t - since < 1800) g.translate(Math.round(Math.sin(t / 25) * 2), Math.round(Math.cos(t / 31)));
  drawSky(g, v, t);
  if (v.weather === "rain" && !OUTDOOR.has(v.kind)) drawRain(g, t);
  g.drawImage(layer(v.kind, v, BACK), 0, 0);
  drawAnim(g, v, t, since);
  // People stand on the floor; on the street they stand on the pavement, at a wedding on the red carpet.
  const foot = v.kind === "street" ? 36 : v.kind === "wedding" ? 40 : FLOOR + 1;
  let headY = 16, headX = 64;
  for (const [i, c] of placeCast(v).entries()) {
    let top;
    if (c.role === "me" && v.kind === "hospital") { top = drawPatient(g, c.p); headX = 42; headY = top; continue; }
    if (c.p.form === "baby" && (v.kind === "nursery" || c.p.age === 0)) top = drawCrib(g, c.p, c.x, foot, t);
    else top = drawPerson(g, c.p, c.x, foot, t, i, { mask: v.mask, silhouette: v.kind === "farewell" });
    if (c.role === "me") { headY = top; headX = c.x + widthOf(c.p, v.kind) / 2; }
  }
  if (OVER[v.kind]) g.drawImage(layer(v.kind, v, OVER), 0, 0);
  if (v.weather === "rain" && OUTDOOR.has(v.kind)) drawRain(g, t);
  if (v.icon) drawIcon(g, v.icon, headX, headY, t, since);
  g.restore();
}
