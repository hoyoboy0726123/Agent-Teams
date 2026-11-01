// The natal reading: "Your birth chart, read in full", shown on the ending page. Deterministic and written by hand
// (no AI): every sentence comes from the text tables in ./text/ and is chosen and combined by this chart's own
// factors (sign × house × dignity × aspects × timing), so two charts read differently.
//
// natalReading(chart, { life, years, today, own, moons }) → { title, lede, timeKnown, moons, chapters }
//   chart   computeChart (chart.js)
//   life    { log, age } of the life just played (src/sim/life.js log entries { age, year, id, domain, text, big,
//           mood }), or null; the planets and the timeline point at what happened in it
//   years   timeline(chart) (timing.js); computed when not given
//   today   ms, for the outlook from the player's real current age
//   own     true when the player typed this birth (not a random one): the outlook is shown
//   moons   the Moon's signs over the birth day when the time is unknown (index.js moonSignsOfDay); computed when not given
// A chapter is { id, title, summary, blocks }, a block one of:
//   { type: "p", text } · { type: "h", text } · { type: "note", text } · { type: "life", text } · { type: "wheel" }
//   { type: "list", items: [{ label, text, life?, tags?, spot? }] } · { type: "facts", items: [{ label, value }] }
//   { type: "bars", label, items: [{ label, value }] } (value 0–1) · { type: "table", caption, head, rows }
// The page renders it (src/ui/reading-view.js), and the chart wheel from the chart itself (src/ui/wheel.js).
// Traditional rulers, as the engine uses them; the modern co-rulers of Scorpio, Aquarius and Pisces are mentioned.
// With an unknown birth time there are no houses or Rising: houses are counted from the Sun ("solar houses", as the
// timing engine does) and flagged, the Moon may be in one of two signs, and its aspects are left out.
import { SIGNS, BODIES, LABELS, NAMES, RULER, MODERN_RULER, ELEMENTS, MODALITIES, elementOf, houseFrom, aspectsOf } from "./chart.js";
import { timeline, ordinal, YEAR_DAYS } from "./timing.js";
import { HOUSES as HOUSE_TOPICS, lordCondition } from "./luck.js";
import { balance } from "./traits.js";
import { moonSignsOfDay } from "./index.js";
import { STYLE, KEYWORDS, SUN, MOON, RISING } from "./text/signs.js";
import { INFO, IN_SIGN, DIGNITY, RETRO } from "./text/planets.js";
import { HOUSE, IN_HOUSE, RULER_IN } from "./text/houses.js";
import { TYPE, PAIR } from "./text/aspects.js";
import { ELEMENT, MODALITY, SECT, SUN_MOON, LORD, YEAR, LORD_TONE, CYCLES, CONTACT, POINT, STRENGTH, EDGE, CLOSING } from "./text/themes.js";

const DAY = 86400000;
const PERSONAL = ["mercury", "venus", "mars", "jupiter", "saturn"];
const OUTER = ["uranus", "neptune", "pluto"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
const unstop = s => s.replace(/[.!]+$/, "");
const join = list => (list.length <= 1 ? list.join("") : list.length === 2 ? `${list[0]} and ${list[1]}` : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);
const degText = d => { const m = Math.floor((d % 1) * 60); return `${Math.floor(d)}°${String(m).padStart(2, "0")}′`; };
const orbText = o => degText(o);
const pairKey = (a, b) => (BODIES.indexOf(a) < BODIES.indexOf(b) ? `${a}-${b}` : `${b}-${a}`);
const glossFor = (name, sign) => `${LABELS[name]} in ${sign}`;
// "Your Sun" or "Mercury" to start a sentence about a natal body; "the Sun" or "Mercury" inside one.
const subj = n => (n === "sun" || n === "moon" ? `Your ${LABELS[n]}` : LABELS[n]);
const the = n => NAMES[n];
const The = n => cap(NAMES[n]);
const an = n => ([8, 11, 18].includes(n) ? "An" : "A");
const uniq = list => [...new Set(list)];

// The pieces every chapter shares.
function context(chart, opts) {
  const timeKnown = chart.timeKnown;
  const moons = opts.moons || (timeKnown ? [chart.bodies.moon.sign] : moonSignsOfDay(chart.input.date, chart.input.place.tz));
  const years = opts.years || timeline(chart);
  const life = opts.life && Array.isArray(opts.life.log) ? opts.life : null;
  const houseOf = name => houseFrom(chart, chart.bodies[name].signIndex);
  // Aspects to trust: without a birth time the Moon's are left out (it moves about 13° in a day).
  const aspects = chart.aspects.filter(a => timeKnown || (a.a !== "moon" && a.b !== "moon"));
  const birthYear = chart.input.date.y;
  return { chart, opts, timeKnown, moons, years, life, houseOf, aspects, birthYear, moonSure: moons.length === 1 };
}

// ---------- the life ----------
// The log entries worth pointing at: real events of the story, the bigger ones first.
const worth = e => e && e.text && e.id !== "birth" && e.id !== "death" && !(e.asked && !e.picked);
const weight = e => (e.big ? 10 : 0) + Math.min(5, Math.abs(e.mood || 0) / 4);
function pickEvent(c, ages, domains = null) {
  if (!c.life) return null;
  const set = new Set(ages);
  let best = null;
  for (const e of c.life.log) {
    if (!worth(e) || !set.has(e.age) || (domains && !domains.includes(e.domain))) continue;
    if (!best || weight(e) > weight(best)) best = e;
  }
  return best;
}
const lifeLine = e => `At ${e.age} (${e.year}): ${unstop(e.text)}.`;
const lived = (c, age) => !c.life || age <= c.life.age;

// The ages (up to the life's end, or 99) at which `planet` was lord of the year.
function lordAges(c, planet, until = 99) {
  return c.years.filter(y => y.age <= until && y.profection.lord === planet).map(y => y.age);
}

// ---------- shared sentences ----------
function dignityLine(name, dignity) {
  return dignity && DIGNITY[dignity] ? DIGNITY[dignity].text(subj(name)) : "";
}
function aspectLine(c, name, max = 2) {
  const list = aspectsOf({ aspects: c.aspects }, name).sort((x, y) => x.orb - y.orb).slice(0, max);
  return list.map(a => {
    const t = TYPE[a.type], p = PAIR[pairKey(name, a.other)];
    return `${subj(name)} ${t.verb} ${a.other === "sun" || a.other === "moon" ? `your ${LABELS[a.other]}` : LABELS[a.other]} (within ${orbText(a.orb)}): ${p[t.tone]}`;
  });
}
function houseTag(c, name) {
  const h = c.houseOf(name);
  return c.timeKnown ? `${ordinal(h)} house` : `${ordinal(h)} solar house`;
}

// ---------- 1. chart overview ----------
function overview(c) {
  const { chart, timeKnown } = c;
  const bal = balance(chart);
  const elOrder = ELEMENTS.slice().sort((a, b) => bal.element[b] - bal.element[a]);
  const moOrder = MODALITIES.slice().sort((a, b) => bal.modality[b] - bal.modality[a]);
  const top = elOrder[0], low = elOrder[3], mtop = moOrder[0];
  const pct = v => `${Math.round(v * 100)}%`;
  const rows = BODIES.map(name => {
    const b = chart.bodies[name];
    const notes = [b.dignity ? DIGNITY[b.dignity].word : "", b.retro ? "retrograde" : "", name === "moon" && !timeKnown ? (c.moonSure ? "position at noon" : `${c.moons.join(" or ")} that day`) : ""].filter(Boolean).join(", ");
    return [LABELS[name], b.sign, degText(b.deg), timeKnown ? String(b.house) : `(${houseFrom(chart, b.signIndex)})`, notes || "—"];
  });
  if (timeKnown) {
    rows.push(["Ascendant", chart.asc.sign, degText(chart.asc.deg), "1", "Rising sign"]);
    rows.push(["Midheaven", chart.mc.sign, degText(chart.mc.deg), String(houseFrom(chart, chart.mc.signIndex)), "Career point"]);
  }
  const blocks = [
    { type: "p", text: `This is your natal chart: the sky at the moment you were born, seen from ${chart.input.place.name}, ${chart.input.place.state}. The outer ring is the zodiac, the numbers are your twelve houses (whole signs${timeKnown ? `, starting from your ${chart.asc.sign} Ascendant on the left` : ", counted from your Sun sign since the birth time is unknown"}), and the lines in the middle are the major aspects between planets.` },
    { type: "wheel" },
    { type: "table", caption: "Your planets", head: ["Body", "Sign", "Degree", timeKnown ? "House" : "House (solar)", "Notes"], rows },
    { type: "h", text: "Element and modality balance" },
    { type: "bars", label: "Elements", items: ELEMENTS.map(e => ({ label: ELEMENT[e].label, value: bal.element[e] })) },
    { type: "bars", label: "Modalities", items: MODALITIES.map(m => ({ label: MODALITY[m].label, value: bal.modality[m] })) },
    { type: "p", text: `${ELEMENT[top].strong} ${bal.element[low] < 0.12 ? ELEMENT[low].weak : `Your quietest element is ${ELEMENT[low].label.toLowerCase()} (${pct(bal.element[low])}), so it's worth a little conscious attention.`}` },
    { type: "p", text: MODALITY[mtop].strong },
    { type: "note", text: `Counted with weights: the Sun and Moon 3 each${timeKnown ? ", the Ascendant 2.5" : ""}, Mercury, Venus and Mars 1, Jupiter and Saturn 0.5. The outer planets are left out; they move slowly and belong to a whole generation.` },
    { type: "h", text: "Day or night chart" },
    { type: "p", text: timeKnown ? SECT[chart.sect] : SECT.unknown },
    { type: "h", text: "Your chart ruler" },
    { type: "p", text: rulerText(c) },
  ];
  const ruler = timeKnown ? RULER[chart.asc.signIndex] : null;
  return {
    id: "overview", title: "Chart overview",
    summary: `${ELEMENT[top].label}-led, ${MODALITY[mtop].label.toLowerCase()}, ${timeKnown ? `${chart.sect} chart, ruled by ${LABELS[ruler]}` : "birth time unknown"}`,
    blocks,
  };
}
function rulerText(c) {
  const { chart, timeKnown } = c;
  if (!timeKnown) {
    const r = RULER[chart.bodies.sun.signIndex], b = chart.bodies[r];
    return `The chart ruler is the planet that rules your rising sign, so it needs a birth time. A good stand-in is the ruler of your Sun sign: ${chart.bodies.sun.sign} is ruled by ${the(r)}${r === "sun" ? ", your Sun itself, which makes your core self doubly important" : `, which sits in ${b.sign}`}. ${The(r)} is about ${INFO[r].job}, and that is a thread through your whole life.`;
  }
  const sign = chart.asc.sign, r = RULER[chart.asc.signIndex], b = chart.bodies[r], h = b.house;
  const dig = b.dignity ? `, ${DIGNITY[b.dignity].word}` : "";
  const modern = MODERN_RULER[chart.asc.signIndex];
  const modernLine = modern ? ` Modern astrologers also give ${sign} to ${LABELS[modern]}, which sits in your ${ordinal(chart.bodies[modern].house)} house: an extra, more generational layer to your path.` : "";
  return `${sign} is rising, so ${the(r)} is your chart ruler, the planet that steers the whole chart. It sits in ${b.sign}, in your ${ordinal(h)} house${dig}${b.retro ? ", and it was retrograde" : ""}. ${RULER_IN[h]} ${The(r)} is about ${INFO[r].job}, done ${STYLE[b.sign]}.${modernLine}`;
}

// ---------- 2. the Big Three ----------
function bigThree(c) {
  const { chart, timeKnown } = c;
  const sun = chart.bodies.sun, moon = chart.bodies.moon;
  const blocks = [];
  // The Sun.
  blocks.push({ type: "h", text: `Sun in ${sun.sign}${timeKnown ? ` · ${ordinal(sun.house)} house` : ""}` });
  for (const t of SUN[sun.sign]) blocks.push({ type: "p", text: t });
  const sun3 = [timeKnown ? IN_HOUSE.sun[sun.house] : "", dignityLine("sun", sun.dignity), ...aspectLine(c, "sun", 1)].filter(Boolean).join(" ");
  if (sun3) blocks.push({ type: "p", text: sun3 });
  const sunEvent = pickEvent(c, lordAges(c, "sun"), INFO.sun.domains);
  if (sunEvent) blocks.push({ type: "life", text: `The Sun was lord of the year at ${join(lordAges(c, "sun", c.life.age).slice(0, 6).map(String))}. ${lifeLine(sunEvent)}` });
  // The Moon.
  if (c.moonSure) {
    blocks.push({ type: "h", text: `Moon in ${moon.sign}${timeKnown ? ` · ${ordinal(moon.house)} house` : ""}` });
    for (const t of MOON[moon.sign]) blocks.push({ type: "p", text: t });
    const moon3 = [timeKnown ? IN_HOUSE.moon[moon.house] : "", dignityLine("moon", moon.dignity), ...(timeKnown ? aspectLine(c, "moon", 1) : [])].filter(Boolean).join(" ");
    if (moon3) blocks.push({ type: "p", text: moon3 });
  } else {
    const [a, b] = c.moons;
    blocks.push({ type: "h", text: `Moon in ${a} or ${b}` });
    blocks.push({ type: "p", text: `On the day you were born the Moon moved from ${a} into ${b}, and without a birth time we can't tell which side of the line you landed on. Read both; most people recognize their Moon at once.` });
    blocks.push({ type: "p", text: `If your Moon is in ${a}: ${lower(MOON[a][0])} ${MOON[a][1]}` });
    blocks.push({ type: "p", text: `If your Moon is in ${b}: ${lower(MOON[b][0])} ${MOON[b][1]}` });
  }
  const moonEvent = pickEvent(c, lordAges(c, "moon"), INFO.moon.domains);
  if (moonEvent) blocks.push({ type: "life", text: `The Moon was lord of the year at ${join(lordAges(c, "moon", c.life.age).slice(0, 6).map(String))}. ${lifeLine(moonEvent)}` });
  // The Rising sign.
  if (timeKnown) {
    const asc = chart.asc;
    blocks.push({ type: "h", text: `${asc.sign} rising · ${degText(asc.deg)}` });
    for (const t of RISING[asc.sign]) blocks.push({ type: "p", text: t });
    const inFirst = BODIES.filter(n => chart.bodies[n].house === 1);
    const r = RULER[asc.signIndex];
    const extra = [
      inFirst.length ? `${cap(join(inFirst.map(the)))} ${inFirst.length > 1 ? "sit" : "sits"} in your 1st house too, so ${inFirst.length > 1 ? "they color" : "it colors"} your first impression: ${join(inFirst.map(n => INFO[n].short))} ${inFirst.length > 1 ? "are" : "is"} part of what people meet first.` : "",
      r === "sun" || r === "moon" ? `Your rising sign is ruled by the ${LABELS[r]}, so your ${r === "sun" ? "core identity" : "emotional life"} and your outward style are closely tied.` : `Your rising sign is ruled by ${LABELS[r]}, in ${chart.bodies[r].sign}: under the ${asc.sign} style there's a ${chart.bodies[r].sign} engine.`,
    ].filter(Boolean).join(" ");
    blocks.push({ type: "p", text: extra });
    const ascEvent = pickEvent(c, c.years.filter(y => y.profection.house === 1 && y.age > 0).map(y => y.age), HOUSE_TOPICS[1].topics.map(([d]) => d).concat(["move"]));
    if (ascEvent) blocks.push({ type: "life", text: `Your 1st-house years, the restarts of the twelve-year loop, fell at 12, 24, 36 and so on. ${lifeLine(ascEvent)}` });
  } else {
    blocks.push({ type: "h", text: "Rising sign: needs a birth time" });
    blocks.push({ type: "p", text: "Your Rising sign (the Ascendant) is the sign coming up over the eastern horizon at the moment of birth. It changes about every two hours, so it can't be known from the date alone. It sets your houses, your chart ruler and the angles of the chart." });
    blocks.push({ type: "p", text: `For now this reading counts your houses from your Sun sign (${chart.bodies.sun.sign}), the “solar houses” many astrologers use as a stand-in. If you can find your birth time (it's often on the long-form birth certificate, or you can request it from your state's vital records office), come back and live it again: the reading will fill in.` });
  }
  const moonWord = c.moonSure ? `${moon.sign} Moon` : `${c.moons.join(" or ")} Moon`;
  return { id: "bigthree", title: "The Big Three in depth", summary: `${sun.sign} Sun, ${moonWord}, ${timeKnown ? `${chart.asc.sign} rising` : "rising unknown"}`, blocks };
}

// ---------- 3. planet by planet ----------
function planets(c) {
  const { chart, timeKnown } = c;
  const blocks = [{ type: "p", text: "The personal and social planets, one by one: the sign says how a planet works, the house where in life it shows up, and the aspects which other parts of you it works with. Where it can, each one points at the years of this life it was in charge of (its profection years, when it was lord of the year)." }];
  for (const name of PERSONAL) {
    const b = chart.bodies[name];
    const tags = [houseTag(c, name), b.dignity ? DIGNITY[b.dignity].word : "", b.retro ? "retrograde" : ""].filter(Boolean);
    blocks.push({ type: "h", text: `${glossFor(name, b.sign)} · ${tags.join(" · ")}` });
    blocks.push({ type: "p", text: `${LABELS[name]} is ${INFO[name].job}. ${IN_SIGN[name][b.sign]}` });
    const second = [timeKnown ? IN_HOUSE[name][b.house] : "", dignityLine(name, b.dignity), b.retro ? RETRO[name] : ""].filter(Boolean).join(" ");
    if (second) blocks.push({ type: "p", text: second });
    const asp = aspectLine(c, name, 2);
    if (asp.length) blocks.push({ type: "p", text: asp.join(" ") });
    const ages = lordAges(c, name, c.life ? c.life.age : 99);
    if (ages.length) {
      const doms = [...new Set([...INFO[name].domains, ...HOUSE_TOPICS[c.houseOf(name)].topics.map(([d]) => d)])];
      const e = pickEvent(c, ages, doms) || pickEvent(c, ages);
      const tone = toneWord(lordCondition(chart, name).q);
      blocks.push({ type: c.life ? "life" : "note", text: `${LABELS[name]} was lord of the year at ${join(ages.slice(0, 8).map(String))}${ages.length > 8 ? " and later" : ""}, years when ${LORD[name]} took the lead; as lord, ${LORD_TONE[tone]}.${e ? ` In this life: ${lower(lifeLine(e))}` : ""}` });
    }
  }
  blocks.push({ type: "h", text: "The outer planets: your generation, made personal" });
  blocks.push({ type: "p", text: "Uranus, Neptune and Pluto move so slowly that everyone born within a few years shares their signs. Their houses and aspects are what make them yours." });
  const items = OUTER.map(name => {
    const b = chart.bodies[name];
    const text = [IN_SIGN[name][b.sign], timeKnown ? IN_HOUSE[name][b.house] : "", b.retro ? RETRO[name] : ""].filter(Boolean).join(" ");
    return { label: `${glossFor(name, b.sign)}${timeKnown ? ` · ${ordinal(b.house)} house` : ""}`, text };
  });
  blocks.push({ type: "list", items });
  const modern = [7, 10, 11].filter(si => chart.bodies.sun.signIndex === si || chart.bodies.moon.signIndex === si || (timeKnown && chart.asc.signIndex === si));
  if (modern.length) blocks.push({ type: "note", text: `Modern co-rulers: ${join(modern.map(si => `${SIGNS[si]} is traditionally ruled by ${LABELS[RULER[si]]} and, for modern astrologers, also by ${LABELS[MODERN_RULER[si]]}`))}. This reading follows the traditional rulers, as the game's timing does.` });
  const strong = PERSONAL.filter(n => chart.bodies[n].dignity === "domicile" || chart.bodies[n].dignity === "exaltation");
  return { id: "planets", title: "Planet by planet", summary: strong.length ? `Strongest: ${join(strong.map(n => LABELS[n]))}` : `Mercury in ${chart.bodies.mercury.sign}, Venus in ${chart.bodies.venus.sign}, Mars in ${chart.bodies.mars.sign}`, blocks };
}
const toneWord = q => (q >= 0.25 ? "good" : q <= -0.25 ? "hard" : "mixed");

// ---------- 4. houses ----------
function houses(c) {
  const { chart, timeKnown } = c;
  const blocks = [];
  blocks.push({ type: "p", text: timeKnown
    ? `Your houses are whole signs, starting with ${chart.asc.sign} as your 1st. Each house is a life area; the sign on it says how you approach it, its ruler where that area plays out, and planets inside make it louder. The four angles (1st, 4th, 7th, 10th) and any crowded house come first.`
    : `Without a birth time, these are solar houses, counted from your ${chart.bodies.sun.sign} Sun as the 1st: a useful stand-in, not the real thing. With your birth time the signs on the houses would likely shift.` });
  const inHouse = n => BODIES.filter(b => c.houseOf(b) === n);
  const angular = [1, 4, 7, 10];
  const order = [...angular, ...[2, 3, 5, 6, 8, 9, 11, 12].sort((a, b) => inHouse(b).length - inHouse(a).length)];
  const items = [];
  for (const n of order) {
    const si = (chart.baseSign + n - 1) % 12, sign = SIGNS[si], ruler = RULER[si], rb = chart.bodies[ruler], rh = c.houseOf(ruler);
    const here = inHouse(n), stacked = here.length >= 3, spot = angular.includes(n) || stacked;
    const H = HOUSE[n];
    const rulerLine = rh === n
      ? `Its ruler, ${the(ruler)}, sits right here${rb.dignity ? `, ${DIGNITY[rb.dignity].word}` : ""}, so this area of life is strong and self-directed.`
      : `Its ruler, ${the(ruler)}, sits in your ${ordinal(rh)} house in ${rb.sign}${rb.dignity ? ` (${DIGNITY[rb.dignity].word})` : ""}, so this part of life plays out through ${HOUSE[rh].via}.`;
    const planetsLine = here.length ? `${cap(join(here.map(b => `${the(b)} (${INFO[b].short})`)))} ${here.length > 1 ? "live" : "lives"} here${stacked ? ": a stellium, one of the loudest themes of your chart" : ", turning up the volume on this area"}.` : "";
    const text = spot
      ? [H.text, timeKnown && H.angle ? H.angle : "", `With ${sign} here, you approach ${H.area} ${STYLE[sign]}.`, rulerLine, planetsLine].filter(Boolean).join(" ")
      : [`You approach ${H.area} ${STYLE[sign]}.`, rulerLine, planetsLine].filter(Boolean).join(" ");
    let life = "";
    if (spot && c.life) {
      const ages = c.years.filter(y => y.profection.house === n && y.age > 0 && y.age <= c.life.age).map(y => y.age);
      const e = pickEvent(c, ages, HOUSE_TOPICS[n].topics.map(([d]) => d));
      if (e) life = `This house's profection years came at ${join(ages.slice(0, 7).map(String))}. ${lifeLine(e)}`;
    }
    items.push({ label: `${H.name} · ${sign}${timeKnown ? "" : " (solar)"}`, text, spot, ...(life ? { life } : {}) });
  }
  blocks.push({ type: "list", items });
  const busiest = order.slice().sort((a, b) => inHouse(b).length - inHouse(a).length)[0];
  return { id: "houses", title: "Houses: your twelve life areas", summary: inHouse(busiest).length >= 2 ? `Busiest: the ${ordinal(busiest)} house, ${HOUSE[busiest].area}` : "Planets spread across the chart", blocks };
}

// ---------- 5. major aspects ----------
function aspects(c) {
  const generational = a => OUTER.includes(a.a) && OUTER.includes(a.b);
  const list = c.aspects.filter(a => !generational(a)).sort((x, y) => x.orb - y.orb).slice(0, 8);
  const blocks = [];
  const hard = c.aspects.filter(a => !generational(a) && TYPE[a.type].tone === "friction").length;
  const soft = c.aspects.filter(a => !generational(a) && TYPE[a.type].tone === "flow").length;
  const conj = c.aspects.filter(a => !generational(a) && a.type === "conjunction").length;
  const mood = hard > soft + 2 ? "Your chart leans toward tension, which is not bad luck: tension is what makes people build, push and grow, and charts like this often belong to people who get a lot done." : soft > hard + 2 ? "Your chart leans toward harmony: things tend to connect easily for you. The risk is coasting; your gifts grow when you give them a challenge." : "Your chart balances tension and harmony, a good mix of push and flow.";
  blocks.push({ type: "p", text: `Aspects are the angles between planets: how the parts of you talk to each other. Among the personal and social planets your chart has ${hard} ${hard === 1 ? "tension" : "tensions"} (squares and oppositions), ${soft} ${soft === 1 ? "harmony" : "harmonies"} (trines and sextiles) and ${conj} ${conj === 1 ? "conjunction" : "conjunctions"}. ${mood}${c.timeKnown ? "" : " The Moon's aspects are left out, since they depend on the birth time."}` });
  if (list.length) {
    blocks.push({ type: "list", items: list.map(a => {
      const t = TYPE[a.type], p = PAIR[pairKey(a.a, a.b)];
      return { label: `${LABELS[a.a]} ${a.type} ${LABELS[a.b]} · ${orbText(a.orb)}`, text: `${cap(p.theme)}. ${t.word}: ${t.gist}. ${p[t.tone]}`, tags: [t.tone === "friction" ? "tension" : t.tone === "flow" ? "harmony" : "fusion"] };
    }) });
    blocks.push({ type: "note", text: "Listed tightest first; the number is the orb, how far from exact. The tighter the aspect, the louder it is." });
  } else blocks.push({ type: "p", text: "Your planets make few close aspects: each part of you works fairly independently, which gives you range." });
  const first = list[0];
  return { id: "aspects", title: "Major aspects", summary: first ? `Tightest: ${LABELS[first.a]} ${first.type} ${LABELS[first.b]}` : "Few close aspects", blocks };
}

// ---------- 6. the timeline ----------
function cycleAges(c) {
  const out = { "saturn-return": [], "jupiter-return": [], "uranus-opposition": [], "saturn-opposition": [] };
  const last = {};
  for (const y of c.years) for (const f of y.facts) {
    if (!out[f.kind]) continue;
    // A return can span two birthdays (retrograde passes): keep the first year of each.
    if (last[f.kind] !== undefined && y.age - last[f.kind] <= 2) continue;
    last[f.kind] = y.age;
    if (y.age <= 99) out[f.kind].push(y.age);
  }
  return out;
}
function dateRange(y) {
  const a = new Date(y.start), b = new Date(y.end);
  return `${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()} – ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}
function timelineChapter(c) {
  const { chart, timeKnown, years } = c;
  const blocks = [];
  const base = timeKnown ? `your ${chart.asc.sign} Ascendant` : `your ${chart.bodies.sun.sign} Sun (no birth time, so solar houses)`;
  const firstLord = RULER[chart.baseSign];
  blocks.push({ type: "p", text: `Two clocks run through every chart. The first is the annual profection: each birthday moves the spotlight one house on, counted from ${base}, so the whole wheel turns once every twelve years. Your 1st-house years (0, 12, 24, 36, 48, 60, 72, 84) restart the loop, and their lord is ${the(firstLord)}. The second clock is the slow planets: Saturn, Jupiter and Uranus coming back to, or opposite, where they were when you were born. The game used both to time this life.` });
  const cyc = cycleAges(c);
  const end = c.life ? c.life.age : 89;
  // The big cycles.
  blocks.push({ type: "h", text: "The big cycles" });
  const items = [];
  const withLife = (ages, text, domains) => {
    const near = ages.flatMap(a => [a, a + 1]).filter(a => lived(c, a));
    const e = pickEvent(c, near, domains) || pickEvent(c, near);
    return e ? lifeLine(e) : "";
  };
  cyc["saturn-return"].forEach((age, i) => {
    const n = Math.min(3, i + 1);
    const life = lived(c, age) ? withLife([age], "", ["career", "love", "move", "family"]) : "";
    items.push({ label: `Saturn return ${n === 1 ? "I" : n === 2 ? "II" : "III"} · age ${age}`, text: CYCLES["saturn-return"][n] + (lived(c, age) ? "" : " This life ended before it came."), ...(life ? { life } : {}) });
  });
  const jr = cyc["jupiter-return"];
  if (jr.length) {
    const lifeJ = withLife(jr.filter(a => lived(c, a)), "", ["career", "wealth", "study", "move"]);
    items.push({ label: `Jupiter returns · ages ${join(jr.slice(0, 7).map(String))}`, text: CYCLES["jupiter-return"], ...(lifeJ ? { life: lifeJ } : {}) });
  }
  for (const age of cyc["uranus-opposition"].slice(0, 1)) {
    const life = lived(c, age) ? withLife([age], "", ["career", "love", "move"]) : "";
    items.push({ label: `Uranus opposition · age ${age}`, text: CYCLES["uranus-opposition"] + (lived(c, age) ? "" : " This life ended before it came."), ...(life ? { life } : {}) });
  }
  const so = cyc["saturn-opposition"];
  if (so.length) items.push({ label: `Saturn opposite Saturn · ages ${join(so.slice(0, 4).map(String))}`, text: CYCLES["saturn-opposition"] });
  blocks.push({ type: "list", items });
  // Decade by decade: the angular profection years and the cycles in each decade of this life.
  blocks.push({ type: "h", text: "Decade by decade" });
  const decades = [];
  for (let d = 0; d <= Math.min(end, 99); d += 10) {
    const span = years.filter(y => y.age >= d && y.age <= d + 9 && y.age <= end);
    if (!span.length) continue;
    const key = span.filter(y => [1, 4, 7, 10].includes(y.profection.house));
    const parts = key.map(y => `${y.age} is ${an(y.profection.house).toLowerCase()} ${ordinal(y.profection.house)}-house year (${YEAR[y.profection.house]}, lord ${LABELS[y.profection.lord]})`);
    const sky = [];
    for (const [kind, label] of [["saturn-return", "Saturn returns"], ["jupiter-return", "Jupiter returns"], ["uranus-opposition", "Uranus opposes its birth place"]]) {
      const a = cyc[kind].find(x => x >= d && x <= d + 9 && x <= end);
      if (a !== undefined) sky.push(`${label} at ${a}`);
    }
    const hiAges = [...key.map(y => y.age), ...sky.map(s => Number(s.match(/\d+$/)[0]))];
    const e = pickEvent(c, hiAges) || pickEvent(c, span.map(y => y.age));
    const label = d === 0 ? `Childhood · ${c.birthYear}–${c.birthYear + 9}` : `Your ${d}s · ${c.birthYear + d}–${c.birthYear + d + 9}`;
    decades.push({ label, text: `${parts.length ? `${cap(join(parts))}.` : "A short stretch, before the next turn of the wheel."}${sky.length ? ` ${cap(join(sky))}.` : ""}`, ...(e ? { life: lifeLine(e) } : {}) });
  }
  blocks.push({ type: "list", items: decades });
  // The next ten years, from the player's real age.
  blocks.push({ type: "h", text: "Your next ten years" });
  const now = c.opts.today || Date.now();
  const age = Math.floor((now - chart.ms) / (YEAR_DAYS * DAY));
  if (c.opts.own && age >= 0 && age <= 100) {
    blocks.push({ type: "p", text: `If this is your own chart, you're ${age} now. Here's how the same timing reads for your real next decade: themes to lean into, not events to expect.` });
    const out = [];
    for (let a = age; a < age + 10 && a < years.length; a++) {
      const y = years[a], { house, lord } = y.profection;
      const q = lordCondition(chart, lord).q;
      const sky = [];
      const seen = new Set();
      for (const f of y.facts) {
        if (f.kind === "contact" && !seen.has(`${f.planet}${f.point}`)) { seen.add(`${f.planet}${f.point}`); sky.push(`${LABELS[f.planet]} ${TYPE[f.aspect].verb} your ${POINT[f.point]}: ${CONTACT[f.planet][f.point]}`); }
        else if (f.kind === "saturn-return") sky.push("your Saturn return: a reality check, and a chance to choose your life on purpose");
        else if (f.kind === "jupiter-return") sky.push("a Jupiter return: plant something you want to grow");
        else if (f.kind === "uranus-opposition") sky.push("the Uranus opposition: something wants to change");
      }
      out.push({ label: `Age ${a} · ${dateRange(y)}`, text: `${an(house)} ${ordinal(house)}-house year: ${YEAR[house]}. ${The(lord)} is lord of the year, bringing ${LORD[lord]}; ${LORD_TONE[toneWord(q)]}.${sky.length ? ` ${cap(sky.slice(0, 2).join("; "))}.` : ""}` });
    }
    blocks.push({ type: "list", items: out });
  } else {
    blocks.push({ type: "p", text: c.opts.own ? "This birth date is outside the range we can look ahead from." : "This was a random birth, so there's no real “now” to look ahead from. Enter your own birth date and time to see your next ten years in the same detail." });
  }
  return { id: "timeline", title: "Your timeline", summary: cyc["saturn-return"].length ? `Saturn returns at ${join(cyc["saturn-return"].slice(0, 3).map(String))}` : "Profections and returns", blocks };
}

// ---------- 7. overall reading ----------
function overall(c) {
  const { chart, timeKnown } = c;
  const bal = balance(chart);
  const sun = chart.bodies.sun, moon = chart.bodies.moon;
  const blocks = [];
  const se = elementOf(sun.signIndex), me = elementOf(moon.signIndex);
  const key = ELEMENTS.indexOf(se) <= ELEMENTS.indexOf(me) ? `${se}-${me}` : `${me}-${se}`;
  const top = ELEMENTS.slice().sort((a, b) => bal.element[b] - bal.element[a])[0];
  const moonLine = c.moonSure ? SUN_MOON[key] : `With the Moon in ${c.moons.join(" or ")}, your inner life is one of two flavors; the rest of the chart reads the same either way.`;
  blocks.push({ type: "p", text: `${sun.sign} Sun, ${c.moonSure ? `${moon.sign} Moon` : `${c.moons.join(" or ")} Moon`}${timeKnown ? `, ${chart.asc.sign} rising` : ""}: ${join(uniq([...KEYWORDS[sun.sign].slice(0, 2), ...(c.moonSure ? KEYWORDS[moon.sign].slice(0, 2) : []), ...(timeKnown ? KEYWORDS[chart.asc.sign].slice(0, 2) : [])]).slice(0, 5))}. ${moonLine} Overall your chart is ${ELEMENT[top].word}, so ${lower(ELEMENT[top].strong.split(": ")[1] || ELEMENT[top].strong)}` });
  // Themes.
  const themes = [];
  const counts = new Array(13).fill(0);
  for (const b of BODIES.slice(0, 7)) counts[c.houseOf(b)]++;
  const busiest = counts.indexOf(Math.max(...counts));
  if (counts[busiest] >= 2) themes.push(`${cap(HOUSE[busiest].area)}: ${counts[busiest]} of your seven classic planets sit in your ${ordinal(busiest)}${timeKnown ? "" : " solar"} house, so this part of life keeps calling.`);
  if (timeKnown) { const r = RULER[chart.asc.signIndex]; themes.push(`${RULER_IN[chart.bodies[r].house].replace("Your chart ruler", `${The(r)}, your chart ruler,`)}`); }
  const tight = c.aspects.filter(a => !(OUTER.includes(a.a) && OUTER.includes(a.b))).sort((x, y) => x.orb - y.orb)[0];
  if (tight) themes.push(`${cap(PAIR[pairKey(tight.a, tight.b)].theme)}: your tightest aspect, ${LABELS[tight.a]} ${tight.type} ${LABELS[tight.b]}, makes this a lifelong thread. ${PAIR[pairKey(tight.a, tight.b)][TYPE[tight.type].tone]}`);
  const signCount = {};
  for (const b of BODIES.slice(0, 7)) signCount[chart.bodies[b].sign] = (signCount[chart.bodies[b].sign] || 0) + 1;
  const [stelSign, stelN] = Object.entries(signCount).sort((a, b) => b[1] - a[1])[0];
  if (stelN >= 3) themes.push(`A ${stelSign} stellium: ${stelN} planets in ${stelSign} make its style, ${STYLE[stelSign]}, a signature of your whole life.`);
  blocks.push({ type: "h", text: "Themes" });
  blocks.push({ type: "list", items: themes.map(text => ({ text })) });
  // Strengths.
  const strengths = [];
  for (const n of BODIES.slice(0, 7)) {
    const d = chart.bodies[n].dignity;
    if (STRENGTH[d]) strengths.push(`${STRENGTH[d](subj(n))}: ${INFO[n].short} is one of your natural strengths.`);
  }
  for (const a of c.aspects) {
    if (strengths.length >= 4) break;
    if (TYPE[a.type].tone === "flow" && (["venus", "jupiter"].includes(a.a) || ["venus", "jupiter"].includes(a.b)) && !(OUTER.includes(a.a) && OUTER.includes(a.b))) strengths.push(`${LABELS[a.a]} ${a.type} ${LABELS[a.b]}: ${PAIR[pairKey(a.a, a.b)].flow}`);
  }
  strengths.push(`From your ${sun.sign} Sun: ${lower(SUN[sun.sign][1].split(". ")[0])}.`);
  if (timeKnown) { const ang = BODIES.slice(0, 7).filter(n => [1, 10].includes(chart.bodies[n].house)); if (ang.length) strengths.push(`${join(ang.map(n => LABELS[n]))} on a strong angle (the 1st or 10th house): ${join(ang.map(n => INFO[n].short))} ${ang.length > 1 ? "are" : "is"} visible to everyone and works hard for you.`); }
  blocks.push({ type: "h", text: "Strengths" });
  blocks.push({ type: "list", items: strengths.slice(0, 5).map(text => ({ text: unstop(text) + "." })) });
  // Growth edges.
  const edges = [];
  for (const n of BODIES.slice(0, 7)) {
    const d = chart.bodies[n].dignity;
    if (EDGE[d]) edges.push(`${EDGE[d](subj(n))}.`);
  }
  const hardOnes = c.aspects.filter(a => TYPE[a.type].tone === "friction" && ["saturn", "mars", "pluto"].some(p => p === a.a || p === a.b) && !(OUTER.includes(a.a) && OUTER.includes(a.b))).sort((x, y) => x.orb - y.orb).slice(0, 2);
  for (const a of hardOnes) edges.push(`${LABELS[a.a]} ${a.type} ${LABELS[a.b]}: ${PAIR[pairKey(a.a, a.b)].friction}`);
  const low = ELEMENTS.slice().sort((a, b) => bal.element[a] - bal.element[b])[0];
  if (bal.element[low] < 0.12) edges.push(ELEMENT[low].weak);
  const sunEdge = SUN[sun.sign][1].split(". ").slice(1).join(". ");
  if (sunEdge) edges.push(`From your ${sun.sign} Sun: ${lower(sunEdge)}`);
  blocks.push({ type: "h", text: "Growth edges" });
  blocks.push({ type: "list", items: edges.slice(0, 5).map(text => ({ text: unstop(text) + "." })) });
  if (c.life) {
    const peak = c.life.log.filter(worth).sort((a, b) => weight(b) - weight(a))[0];
    blocks.push({ type: "p", text: `This life ran to ${c.life.age}${peak ? `, and one of its loudest moments came at ${peak.age}: ${lower(unstop(peak.text))}` : ""}. Another life with the same chart could go very differently, which is the point.` });
  }
  blocks.push({ type: "p", text: CLOSING });
  return { id: "overall", title: "Overall reading", summary: `${ELEMENT[top].label}-led ${sun.sign}: themes, strengths and growth edges`, blocks };
}

export const CHAPTERS = ["overview", "bigthree", "planets", "houses", "aspects", "timeline", "overall"];

export function natalReading(chart, opts = {}) {
  const c = context(chart, opts);
  const chapters = [overview(c), bigThree(c), planets(c), houses(c), aspects(c), timelineChapter(c), overall(c)];
  return {
    title: "Your birth chart, read in full",
    lede: `Your real birth chart, not this game's dice: ${chart.bigThree.sun} Sun, ${c.moonSure ? `${chart.bodies.moon.sign} Moon` : `${c.moons.join(" or ")} Moon`}${c.timeKnown ? `, ${chart.asc.sign} rising` : ", birth time unknown"}. Tropical zodiac, whole sign houses, traditional rulers. Written for self-reflection, not prediction.`,
    timeKnown: c.timeKnown, moons: c.moons, chapters,
  };
}

// Every string of a reading, for the tests (and a word count).
export function readingTexts(r) {
  const out = [r.title, r.lede];
  for (const ch of r.chapters) {
    out.push(ch.title, ch.summary);
    for (const b of ch.blocks) {
      if (b.text) out.push(b.text);
      if (b.label) out.push(b.label);
      if (b.caption) out.push(b.caption);
      for (const i of b.items || []) out.push(i.label, i.text, i.life, i.value === undefined ? undefined : String(i.value));
      for (const row of b.rows || []) out.push(...row);
      for (const h of b.head || []) out.push(h);
    }
  }
  return out.filter(x => x !== undefined && x !== null && x !== "");
}
