// AI 命理師：結局頁的「AI 命理師解讀」與「AI 合婚」。
//
// The reading is about the chart itself, not the simulated life. The page sends only births (readingRequest): date,
// time or 時辰, place and sex, and for 合婚 the other person's date, time and sex (born in the same place). Names never
// leave the page.
//
// A reading is written in parts, one request each, so each request computes only what its part needs (the free
// Workers plan allows about 10 ms of CPU a request) and the page shows each part as it arrives:
//   short  命格一句話、總評
//   full   a (命格一句話 … 事業與財運), b (感情與婚姻 … 給你的三句話), decades (每一步大運), years0–4 (每一歲，十歲一段)
//   match  m1 (合婚一句話 … 兩個人的個性), m2 (相處的優點 … 給你們的建議), myears (兩人接下來十年的每一年)
// The Worker (worker/app.js) checks the request (readReadingRequest), recomputes the charts with the same engine and
// builds the part (readingPart): its fact sheet, prompt (partPrompt) and checks. Every 干支, 十神, 喜忌, age and year in a
// prompt comes from the engine, so the endpoint cannot be turned into a general chatbot. checkPart() turns away text
// that invents 干支, gets a year's age, the day master, the 喜忌, the strength or the 格局 wrong, talks about death,
// disease or paid 化解, or slips into Simplified characters; the Worker asks once more with the problems listed. In the
// lists (大運、每一歲、合婚的每一年) the headers come from the engine and the model writes only 重點, 好事 and 要注意; an
// entry it leaves out or gets wrong twice is filled from the engine's own words (finishPart).
import { computeChart } from "./core/chart.js";
import { findPlace } from "./core/places.js";
import { analyse, ELEMENTS } from "./core/analysis.js";
import { natalStars, STARS } from "./core/detail.js";
import { natalReading, DAY_MASTER_TEXT, TEN_GOD_TEXT, PATTERN_TEXT, ELEMENT_INDUSTRIES, ELEMENT_ORGANS, ELEMENT_LUCK } from "./core/reading-natal.js";
import { decadeReading, yearReading, DOMAIN_NAME } from "./core/reading-year.js";
import { partnerReading } from "./core/partner.js";
import { SHICHEN, shichenTime } from "./core/shichen.js";
import { SIMPLIFIED_ONLY } from "./core/simplified.js";

export const READING_VERSION = 2;
export const PARTS = { short: ["short"], full: ["a", "b", "decades", "years0", "years1", "years2", "years3", "years4"], match: ["m1", "m2", "myears"] };
export const KINDS = Object.keys(PARTS);

// What each section is, for the prompt.
export const SECTIONS = {
  命格一句話: "一句 25 字以內的比喻，說出這張命盤最大的特質",
  總評: "約 180 字：用白話總結個性、最適合的方向，以及接下來最值得把握的一年",
  命盤總論: "約 200 字：日主、強弱、格局、五行和喜忌，用白話說這張命盤的底子和關鍵",
  性格與天賦: "約 220 字：長處、盲點和天賦，從日主、格局和最多的十神說起",
  事業與財運: "約 250 字：適合的行業和工作型態要對應用神和格局；賺錢和理財的習慣；哪幾步大運最適合衝刺",
  感情與婚姻: "約 220 字：感情的樣子、適合的伴侶、經營婚姻要留意的地方",
  六親與人際: "約 180 字：和父母、兄弟姊妹、子女、朋友的緣分與相處",
  健康與作息: "約 150 字：根據「健康（傳統說法）」，給作息和保養的建議",
  開運建議: "約 150 字：根據用神，給顏色、方位、數字、行業和生活習慣的建議",
  給你的三句話: "三句具體、溫暖的建議，每句一行，分別以 1. 2. 3. 開頭",
  合婚一句話: "一句 25 字以內的比喻，說出這段關係最大的特色",
  合婚總評: "約 200 字：根據「合婚結果」，說兩個人整體合不合、互補在哪裡、要磨合什麼",
  兩個人的個性: "約 200 字：兩個人日主的個性，放在一起會是什麼樣子",
  相處的優點: "約 160 字：兩個人在一起的好處，要有具體的例子",
  容易摩擦的地方: "約 180 字：容易磨合的地方，以及具體可以怎麼做",
  給你們的建議: "三句具體、溫暖的建議，每句一行，分別以 1. 2. 3. 開頭",
};
const PART_TITLES = {
  short: ["命格一句話", "總評"],
  a: ["命格一句話", "命盤總論", "性格與天賦", "事業與財運"],
  b: ["感情與婚姻", "六親與人際", "健康與作息", "開運建議", "給你的三句話"],
  m1: ["合婚一句話", "合婚總評", "兩個人的個性"],
  m2: ["相處的優點", "容易摩擦的地方", "給你們的建議"],
};
// What the other parts of the same reading cover, so a part does not repeat them.
const ELSEWHERE = {
  a: ["感情與婚姻", "六親與人際", "健康與作息", "開運建議", "每一步大運", "每一歲的流年"],
  b: ["命盤總論", "性格與天賦", "事業與財運", "每一步大運", "每一歲的流年"],
  m1: ["相處的優點", "容易摩擦的地方", "給你們的建議", "接下來十年的每一年"],
  m2: ["合婚總評", "兩個人的個性", "接下來十年的每一年"],
};
const FIELDS = { 重點: "這十年的主軸，20 到 40 字", 好事: "20 到 45 字", 要注意: "20 到 45 字" };
const TONE_WORD = { 吉: "順勢", 平: "平穩", 中: "平穩", 凶: "宜守" };
export const toneWord = t => TONE_WORD[t] || "平穩";

const STEMS = "甲乙丙丁戊己庚辛壬癸", BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const STEM_ELEMENT = Object.fromEntries([...STEMS].map((s, i) => [s, "木火土金水"[Math.floor(i / 2)]]));
// The 干支 of a Gregorian year (the year 4 was 甲子).
export const yearPillar = y => STEMS[(((y - 4) % 10) + 10) % 10] + BRANCHES[(((y - 4) % 12) + 12) % 12];

// ---------- the page: what is sent ----------
const timeOut = t => {
  if (!t) return null;
  const sc = t.branch ? SHICHEN.find(x => x.branch === t.branch && x.h === t.h && x.mi === t.mi) : null;
  return sc ? { shichen: sc.key } : { h: t.h, mi: t.mi };
};
const birthOut = (b, withPlace) => ({ y: b.date.y, m: b.date.m, d: b.date.d, time: timeOut(b.time), ...(withPlace ? { place: b.place.name } : {}), sex: b.sex });

// input: the page's birth { date, time, place, sex }; partner: { date, time, sex, place? } for 合婚 (without a place,
// the Worker takes yours).
export function readingRequest(input, kind = "full", { part = PARTS[kind][0], partner = null } = {}) {
  return { v: READING_VERSION, kind, part, birth: birthOut(input, true), ...(kind === "match" ? { partner: birthOut(partner, !!(partner && partner.place)) } : {}) };
}

// ---------- the Worker: what is accepted ----------
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
function birthIn(b, withPlace) {
  if (!b || typeof b !== "object") return null;
  const y = int(b.y, 1900, 2100), m = int(b.m, 1, 12), d = int(b.d, 1, 31);
  if (y === null || m === null || d === null || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  let time = null;
  if (b.time !== null && b.time !== undefined) {
    if (typeof b.time !== "object") return null;
    if (b.time.shichen !== undefined) time = shichenTime(String(b.time.shichen));
    else { const h = int(b.time.h, 0, 23), mi = int(b.time.mi, 0, 59); time = h === null || mi === null ? null : { h, mi }; }
    if (!time) return null;
  }
  if (b.sex !== "male" && b.sex !== "female") return null;
  const out = { date: { y, m, d }, time, sex: b.sex };
  if (withPlace) {
    out.place = typeof b.place === "string" ? findPlace(b.place) : null;
    if (!out.place) return null;
  }
  return out;
}

// The request body → { kind, part, birth, partner? }, or null when it is not one the page could send.
export function readReadingRequest(body) {
  if (!body || typeof body !== "object" || body.v !== READING_VERSION || !Object.hasOwn(PARTS, body.kind)) return null;
  const part = body.part === undefined ? PARTS[body.kind][0] : body.part;
  if (!PARTS[body.kind].includes(part)) return null;
  const birth = birthIn(body.birth, true);
  if (!birth) return null;
  if (body.kind !== "match") return { kind: body.kind, part, birth };
  const own = body.partner && typeof body.partner === "object" && body.partner.place !== undefined;
  const partner = birthIn(body.partner, own);
  return partner ? { kind: "match", part, birth, partner: { place: birth.place, ...partner } } : null;
}

// ---------- the people ----------
// The parts of one reading usually reach the same Worker instance, so the last charts are kept.
const CHARTS = new Map();
function personOf(birth, now) {
  const key = JSON.stringify([birth.date, birth.time, birth.place.name, birth.sex]);
  let base = CHARTS.get(key);
  if (!base) {
    const chart = computeChart({ ...birth, options: { solar: "true" } }, { lean: true });
    const names = chart.pillars.map(p => p.name);
    base = { chart, names, a: analyse(names), by: birth.date.y, sex: birth.sex };
    CHARTS.set(key, base);
    if (CHARTS.size > 24) CHARTS.delete(CHARTS.keys().next().value);
  }
  return { ...base, base, now, age: Math.max(0, now - base.by), born: base.by <= now };
}
const natalOf = P => (P.base.natal ||= natalReading(P.chart, P.a));
const yearOf = (P, age) => (age >= 0 ? yearReading(P.chart, P.a, age) : null);

// ---------- the fact sheet ----------
const strip = t => String(t || "").replace(/^[^：]{1,16}：/, "").replace(/。$/, "");
const cut = (t, n) => { const s = String(t || ""); return s.length <= n ? s : `${s.slice(0, n - 1)}…`; };
// Engine words the reading must not use, said gently.
const SOFTEN = [
  [/傳統上要防血光與開刀/g, "傳統上要多注意安全、避免受傷"],
  [/要防血光、意外與開刀/g, "要注意安全、避免意外"],
  [/要留意血光(?:，女命也要留意生產)?/g, "要多注意安全"],
  [/、手術與意外/g, "與意外"], [/要防手術與意外/g, "要注意安全、避免意外"],
  [/小傷與手術/g, "小傷"], [/、開刀與破財/g, "與破財"], [/受傷與開刀/g, "受傷"],
  [/[，；、]?傳統上會安太歲，祈求闔家平安/g, ""],
  [/血光|開刀|手術/g, "受傷"], [/安太歲/g, "祈求平安"],
];
export const soften = t => SOFTEN.reduce((s, [re, to]) => s.replace(re, to), String(t || ""));
const SEX = { male: "男", female: "女" };

function identityLine(P, who) {
  const c = P.chart;
  const hour = c.hourKnown ? (c.time.shichen ? `${c.time.shichen}時出生` : "出生時間已知") : "時辰不詳，只排年、月、日三柱";
  return `【${who}】${SEX[P.sex]}命，${P.by} 年生，屬${c.zodiac}，${P.born ? `${P.now} 年滿 ${P.age} 歲` : "還沒出生"}；${hour}。`;
}
// 日主、強弱與格局、喜忌 (and with full: 四柱、五行、十神、神煞).
function chartLines(P, { full = true, of = "" } = {}) {
  const c = P.chart, a = P.a, dm = a.dayMaster, t = DAY_MASTER_TEXT[dm.stem], pt = PATTERN_TEXT[a.pattern];
  const order = ELEMENTS.slice().sort((x, y) => a.scores[x] - a.scores[y]);
  const [u, ...us] = a.useful, [j, ...js] = a.avoid;
  const lines = [];
  if (full) lines.push(`【${of}四柱】${c.pillars.map(p => `${p.label}${p.name}（天干${p.stem.name}${p.role === "day" ? "是日主" : `為${p.stem.god}`}，地支${p.branch.name}藏${p.branch.hidden.map(h => `${h.name}${h.god}`).join("、")}）`).join("；")}。`);
  lines.push(`【${of}日主】${dm.stem}${dm.element}，${t.yinyang}，意象是${t.image}。長處：${t.nature}。盲點：${t.blind}。`);
  lines.push(`【${of}強弱與格局】日主${a.strength}（生扶日主的力量約占 ${Math.round(a.support * 100)}%），${a.season}；格局是${a.pattern}${pt ? `：${pt.nature}${full ? `；成格喜${pt.wants}，破格怕${pt.fears}` : ""}` : ""}。`);
  if (full) lines.push(`【${of}五行力量】${ELEMENTS.map(e => `${e} ${a.scores[e]}`).join("、")}；最旺是${order[4]}，最弱是${order[0]}；${c.missing.length ? `天干地支裡沒有${c.missing.join("、")}（命中缺${c.missing.join("、")}）` : "五行俱全"}。`);
  lines.push(`【${of}喜忌】${u ? `用神${u}${us.length ? `，喜${us.join("、")}` : ""}` : "喜忌不明顯"}${j ? `；忌${j}${js.length ? `，也忌${js.join("、")}` : ""}` : ""}。`);
  if (!full) return lines;
  const gods = {};
  for (const p of c.pillars) {
    if (p.role !== "day") gods[p.stem.god] = (gods[p.stem.god] || 0) + 1;
    if (p.branch.hidden[0]) gods[p.branch.hidden[0].god] = (gods[p.branch.hidden[0].god] || 0) + 1;
  }
  const top = Object.entries(gods).filter(([g]) => TEN_GOD_TEXT[g]).sort((x, y) => y[1] - x[1]).slice(0, 3);
  if (top.length) lines.push(`【${of}十神】最多的是${top.map(([g, n]) => `${g}（${n} 個；${TEN_GOD_TEXT[g].trait}；盲點是${TEN_GOD_TEXT[g].blind}）`).join("、")}。`);
  const stars = natalStars(c);
  const good = [...new Set(c.pillars.flatMap(p => [...(stars[p.role] || [])]))].filter(x => STARS[x] && STARS[x].nature !== "凶").slice(0, 5);
  if (good.length) lines.push(`【${of}神煞】${good.map(x => `${x}（${STARS[x].text}）`).join("；")}。`);
  return lines;
}
function healthLine(P) {
  const order = ELEMENTS.slice().sort((x, y) => P.a.scores[x] - P.a.scores[y]);
  return `【健康（傳統說法）】五行最弱的${order[0]}對應${ELEMENT_ORGANS[order[0]].organs}，平時宜${ELEMENT_ORGANS[order[0]].care}；最旺的${order[4]}對應${ELEMENT_ORGANS[order[4]].organs}，過旺也是負擔，${ELEMENT_ORGANS[order[4]].care}。`;
}
function luckLine(P) {
  const [u, v] = P.a.useful;
  if (!u) return "";
  const L = ELEMENT_LUCK[u];
  return `【開運（用神${u}）】顏色${L.colors.join("、")}；方位${L.direction}；數字${L.numbers.join("、")}；${L.season}；生活習慣：${L.habit}；行業：${ELEMENT_INDUSTRIES[u].join("、")}${v ? `。喜神${v}的行業：${ELEMENT_INDUSTRIES[v].slice(0, 4).join("、")}` : ""}。`;
}
// The engine's own 本命詳批, section by section.
function natalLines(P, ids) {
  return natalOf(P).sections.filter(s => ids.includes(s.id))
    .map(s => `【詳批・${s.title}】${cut(soften([...s.paragraphs, ...s.items.map(i => `${i.label ? `${i.label}：` : ""}${i.text}`)].join(" ")), 420)}`);
}

// The 大運 from the current one on (all of them before birth), to about 90.
function decadesOf(P) {
  const xu = P.age + 1;
  return P.chart.luck.decades.map((d, i) => (d.startAge <= 87 && d.endAge >= xu ? decadeReading(P.chart, P.a, i, { keyYears: false }) : null)).filter(Boolean);
}
const isCurrent = (d, P) => P.born && P.age + 1 >= d.startAge && P.age + 1 <= d.endAge;
const decadeLine = (d, P) => `- ${d.startYear}–${d.endYear} 年（虛歲 ${d.startAge}–${d.endAge}）走${d.name}大運，${d.tone}${isCurrent(d, P) ? "，目前在這一步" : ""}：${strip(d.headline)}。`;
function decadeDetail(d, P) {
  const levels = Object.entries(d.domains || {});
  const rise = levels.filter(([, v]) => v >= 1).map(([k]) => DOMAIN_NAME[k]), care = levels.filter(([, v]) => v <= -1).map(([k]) => DOMAIN_NAME[k]);
  return `${decadeLine(d, P)}${cut(soften(d.sentences.slice(1, 4).join("")), 260)}${rise.length ? `較有發揮：${rise.join("、")}。` : ""}${care.length ? `要多照顧：${care.join("、")}。` : ""}`;
}

// The ages listed one by one: from now to 85 (at most 50; ten for those past 75).
// The parts a reading needs: a years part with no ages left in it (for an older reader) is not asked for.
export function partsFor(kind, birthYear, now) {
  if (kind !== "full") return PARTS[kind];
  const n = Math.ceil(agesOf({ age: Math.max(0, now - birthYear) }).length / 10);
  return PARTS.full.filter(p => !p.startsWith("years") || Number(p.slice(5)) < n);
}
export function agesOf(P) {
  const end = P.age >= 76 ? P.age + 9 : Math.min(P.age + 49, 85);
  return Array.from({ length: end - P.age + 1 }, (_, k) => P.age + k);
}
const sortedDomains = y => Object.entries(y.domains || {}).filter(([, v]) => v && v.level).sort((p, q) => Math.abs(q[1].level) - Math.abs(p[1].level));
const signed = n => (n > 0 ? `＋${n}` : `－${-n}`);
function yearLine(y, { who = "" } = {}) {
  const doms = sortedDomains(y).slice(0, 4);
  return `${who}${y.age} 歲（${y.year} 年 ${y.pillar}年，${y.favor.tone}）：${strip(y.headline)}${doms.length ? `。${doms.map(([k, v]) => `${DOMAIN_NAME[k]}${signed(v.level)}：${cut(soften(v.text), 70)}`).join("；")}` : ""}。`;
}
// The engine's words for an entry the model did not get right.
function fallbackOf(doms, { good = "這段時間起伏不大，照自己的步調穩穩前進。", watch = "沒有特別要擔心的地方，作息規律就好。" } = {}) {
  const pick = sign => doms.filter(([, v]) => Math.sign(v.level) === sign).map(([k, v]) => `${DOMAIN_NAME[k]}：${cut(soften(v.text), 46)}`)[0];
  return { 好事: pick(1) || good, 要注意: pick(-1) || watch };
}

const PAIR = new RegExp(`[${STEMS}][${BRANCHES}]`, "g");
// What a part's text is held to: the 干支 its facts show, and the people's charts.
function checkOf(people, facts) {
  const union = f => [...new Set(people.flatMap(f))];
  return {
    pillars: new Set([...(facts.match(PAIR) || []), ...people.flatMap(P => P.names)]),
    dayStems: people.map(P => P.a.dayMaster.stem), useful: union(P => P.a.useful), avoid: union(P => P.a.avoid),
    missing: union(P => P.chart.missing), strengths: people.map(P => P.a.strength), patterns: people.map(P => P.a.pattern),
    birthYears: people.map(P => P.by), single: people.length === 1,
    decades: people.flatMap(P => P.chart.luck.decades.map(d => ({ name: d.name, startAge: d.startAge, endAge: d.endAge, startYear: d.startYear, endYear: d.endYear }))),
  };
}
const sectionsPart = (kind, id, people, lines, max) => {
  const facts = lines.filter(Boolean).join("\n");
  return { kind, id, type: "sections", titles: PART_TITLES[id], elsewhere: ELSEWHERE[id] || [], facts, max, check: checkOf(people, facts) };
};
const listPart = (kind, id, people, lines, items, max) => {
  const facts = lines.filter(Boolean).join("\n");
  return { kind, id, type: "list", items, facts, max, check: checkOf(people, facts) };
};

// ---------- the parts ----------
// ask: readReadingRequest(); now: the current year.
export function readingPart(ask, { now = new Date().getUTCFullYear() } = {}) {
  const P = personOf(ask.birth, now);
  if (ask.kind === "match") return matchPart(ask.part, P, personOf(ask.partner, now), now);
  const decades = () => decadesOf(P);
  const core = (opts) => [identityLine(P, "命主"), ...chartLines(P, opts)];
  switch (ask.part) {
    case "short": {
      const next = (P.born ? [0, 1, 2, 3, 4].map(k => yearOf(P, P.age + k)) : []).filter(Boolean);
      return sectionsPart("short", "short", [P], [...core(), ...natalLines(P, ["summary", "character"]), "【大運】", ...decades().map(d => decadeLine(d, P)),
        ...(next.length ? ["【接下來五年】", ...next.map(y => `- ${y.age} 歲（${y.year} 年 ${y.pillar}年，${y.favor.tone}）：${strip(y.headline)}。`)] : [])], 800);
    }
    case "a":
      return sectionsPart("full", "a", [P], [...core(), ...natalLines(P, ["summary", "strength", "pattern", "character", "career", "wealth"]), "【大運】", ...decades().map(d => decadeLine(d, P))], 1900);
    case "b":
      return sectionsPart("full", "b", [P], [...core(), ...natalLines(P, ["family", "marriage", "health", "advice"]), healthLine(P), luckLine(P), "【大運】", ...decades().map(d => decadeLine(d, P))], 1900);
    case "decades": {
      const list = decades();
      const items = list.map(d => {
        const levels = Object.entries(d.domains || {});
        return {
          key: `${d.name}大運`, fields: ["重點", "好事", "要注意"],
          head: { name: d.name, startAge: d.startAge, endAge: d.endAge, startYear: d.startYear, endYear: d.endYear, tone: d.tone, current: isCurrent(d, P) },
          fallback: {
            重點: cut(strip(d.headline), 40),
            好事: cut(soften(d.sentences[1] || ""), 60) || "這十年起伏不大，穩中求進。",
            要注意: levels.some(([, v]) => v <= -1) ? `${levels.filter(([, v]) => v <= -1).map(([k]) => DOMAIN_NAME[k]).join("、")}要多照顧。` : "沒有特別要擔心的地方，按部就班就好。",
          },
        };
      });
      return listPart("full", "decades", [P], [...core({ full: false }), "【大運】（歲數是虛歲，出生那年算 1 歲）", ...list.map(d => decadeDetail(d, P))], items, 300 + 170 * items.length);
    }
    default: {
      const k = Number(ask.part.slice(5));
      const years = agesOf(P).slice(k * 10, (k + 1) * 10).map(age => yearOf(P, age)).filter(Boolean);
      const items = years.map(y => ({
        key: `${y.age} 歲`, fields: ["好事", "要注意"],
        head: { age: y.age, year: y.year, pillar: y.pillar, tone: y.favor.tone, decade: y.decade ? y.decade.name : null },
        fallback: fallbackOf(sortedDomains(y)),
      }));
      const spans = [...new Set(years.map(y => y.decade && y.decade.name).filter(Boolean))];
      return listPart("full", ask.part, [P], [...core({ full: false }), spans.length ? `【這段時間的大運】${spans.join("、")}` : "", "【流年】（歲數是足歲）", ...years.map(y => yearLine(y))], items, 300 + 120 * items.length);
    }
  }
}

function matchPart(id, A, B, now) {
  const core = [identityLine(A, "你"), ...chartLines(A, { full: false, of: "你的" }), identityLine(B, "對方"), ...chartLines(B, { full: false, of: "對方的" })];
  const pr = partnerReading({ me: { pillars: A.names, analysis: A.a, sex: A.sex, name: "" }, partner: { pillars: B.names, analysis: B.a, sex: B.sex, name: "" } });
  const sectionText = ids => pr.sections.filter(s => ids.includes(s.id)).map(s => `【合婚・${s.title}】${cut(soften([...s.paragraphs, ...s.items.map(i => `${i.label ? `${i.label}：` : ""}${i.text}`)].join(" ")), 380)}`);
  const result = [`【合婚結果】${pr.tone}。${soften(pr.summary)}`, pr.highlights.length ? `【合婚重點】${pr.highlights.join("、")}` : ""];
  const meta = { tone: pr.tone, highlights: pr.highlights };
  if (id === "m1") return { ...sectionsPart("match", "m1", [A, B], [...core, ...result, ...sectionText(["zodiac", "day", "palace", "star", "closing"])], 1500), meta };
  if (id === "m2") return { ...sectionsPart("match", "m2", [A, B], [...core, ...result, ...sectionText(["useful", "elements", "nayin", "closing"]), `【相處建議】${pr.advice.map(soften).join("；")}`], 1500), meta };
  // The next ten years, for both.
  const years = [];
  for (let k = 0; k < 10; k++) {
    const year = now + k, ya = yearOf(A, year - A.by), yb = yearOf(B, year - B.by);
    if (ya && yb) years.push({ year, ya, yb });
  }
  const love = y => sortedDomains(y).filter(([d]) => d === "love" || d === "family");
  const items = years.map(({ year, ya, yb }) => ({
    key: `${year} 年`, fields: ["好事", "要注意"],
    head: { year, pillar: ya.pillar, ages: [ya.age, yb.age], tones: [ya.favor.tone, yb.favor.tone] },
    fallback: fallbackOf([...love(ya), ...love(yb)], { good: "這一年感情起伏不大，適合一起規劃生活。", watch: "沒有特別要擔心的地方，多花時間相處就好。" }),
  }));
  const lines = years.map(({ year, ya, yb }) => {
    const side = (who, y) => `${who} ${y.age} 歲（${y.favor.tone}）${love(y).length ? `：${love(y).map(([d, v]) => `${DOMAIN_NAME[d]}${signed(v.level)}：${cut(soften(v.text), 70)}`).join("；")}` : "：感情、家庭沒有明顯的起伏"}`;
    return `- ${year} 年 ${ya.pillar}年：${side("你", ya)}；${side("對方", yb)}。`;
  });
  return { ...listPart("match", "myears", [A, B], [...core, ...result, "【接下來十年，兩個人的感情與家庭】", ...lines], items, 300 + 120 * items.length), meta };
}

// ---------- the prompt ----------
function rulesOf(kind) {
  const pair = kind === "match";
  return [
    `你是一位溫暖、專業、說話實在的八字命理師，正在為臺灣的${pair ? "一對伴侶寫「AI 合婚」" : "一位讀者寫「AI 命理師解讀」"}。`,
    "",
    "寫作規則：",
    "1. 只能使用下面「命盤資料」裡寫到的干支、十神、喜忌、格局、大運、流年、年份和歲數。不要自己排盤或推算，也不要補上資料裡沒有的干支、神煞、年份或歲數；寫到年份和歲數時，要和資料裡同一行的寫法一致。",
    `2. 用繁體中文和臺灣用語，口吻像面對面聊天：親切、具體、鼓勵。用到術語時，順便用白話解釋。${pair ? "稱呼兩個人「你」和「對方」，不要取名字。" : "稱呼讀者「你」。"}`,
    "3. 不談死亡、壽命和意外災難，不點名任何疾病或檢查項目；健康只談作息、飲食、運動和定期健康檢查。",
    `4. 不用恐嚇的說法（例如血光、劫數、大凶），也不建議任何改運商品、法會、點燈、符咒或付費化解。${pair ? "不說誰剋誰，不預言分手、離婚或外遇。" : ""}`,
    "5. 命理說的是傾向和時機，不是注定：用「命理上看」「傳統說法」這樣的語氣，不要寫成「因為命盤，所以一定會」。",
    "6. 不要用 Markdown 符號（#、*、- 都不要）。",
  ];
}
const LIST_INTRO = {
  decades: "這次只寫「大運逐步」：為下面每一步大運各寫一段，說這十年的主軸、好事和要注意的事。",
  years: "這次只寫「流年逐歲」：為下面每一歲各寫一段，說那一歲的好事和要注意的事。",
  myears: "這次只寫「兩人的流年」：為下面每一年各寫一段，說兩個人在那一年的感情與相處，好事和要注意的事。",
};

// last: the previous check of this part, for the second try (a list asks again only for the entries it missed).
export function partPrompt(part, last = null) {
  const lines = rulesOf(part.kind);
  lines.push("");
  if (part.type === "sections") {
    lines.push(`請依序寫 ${part.titles.length} 段。每段第一行只寫標題（例如【${part.titles[Math.min(1, part.titles.length - 1)]}】），從下一行開始寫內文：`);
    lines.push(...part.titles.map((t, i) => `${i + 1}. 【${t}】${SECTIONS[t]}。`));
    if (part.elsewhere.length) lines.push(`${part.elsewhere.join("、")}由別人寫，你不要寫，也不要重複它們的內容。`);
    if (last && last.problems.length) lines.push("", `上一次寫的內容有這些問題，這次一定要避免：${last.problems.join("；")}。`);
  } else {
    const items = last ? part.items.filter(it => last.bad.some(b => b.key === it.key)) : part.items;
    const fields = items[0].fields;
    lines.push(LIST_INTRO[part.id.startsWith("years") ? "years" : part.id]);
    lines.push(`每段第一行只寫標題，標題照抄下面的寫法（例如【${items[0].key}】），接著${fields.map(f => `一行「${f}：」（${FIELDS[f]}）`).join("、")}。`);
    lines.push("只根據那一項在命盤資料裡的內容寫；沒有明顯的好事或要注意的事時，就寫這段時間適合做什麼、怎麼保持，不要硬編事件。每一段的說法要不同，不要重複同一句。");
    lines.push(`標題依序是：${items.map(it => `【${it.key}】`).join("")}`);
    if (last) lines.push("", `上一次有這些問題，這次一定要避免：${last.bad.map(b => `【${b.key}】${b.why}`).join("；")}。`);
  }
  lines.push("", "命盤資料：", part.facts);
  return lines.join("\n");
}
// Tokens for an answer: a list asked again only for some entries needs less.
export const partTokens = (part, last = null) => (part.type === "list" && last ? 300 + 140 * last.bad.length : part.max);

// ---------- reading the answer ----------
// 【標題】 lines start the sections; Markdown marks and numbering around a title are dropped.
export function parseSections(text) {
  const out = [];
  for (const raw of String(text || "").replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/\*\*|__/g, "").replace(/^[#>*\s]+/, "").trimEnd();
    const m = line.match(/^(?:\d+[.、．]\s*)?【([^】]{1,16})】\s*(.*)$/);
    if (m) { const rest = m[2].replace(/^[:：]\s*/, "").trim(); out.push({ title: m[1].trim(), body: rest ? [rest] : [] }); }
    else if (out.length && line.trim()) out[out.length - 1].body.push(line.trim());
  }
  return out.map(s => ({ title: s.title, body: s.body.join("\n").trim() }));
}

const S = `[${STEMS}]`, B = `[${BRANCHES}]`, E = "[木火土金水]";
const YEAR_THEN_PILLAR = new RegExp(`(?<![\\d–\\-~～至到])(\\d{4})\\s*年?\\s*[（(]?\\s*(${S}${B})(?=\\s*年)`, "g");
const PILLAR_THEN_YEAR = new RegExp(`(${S}${B})\\s*年\\s*[（(]\\s*(\\d{4})`, "g");
const DAY_MASTER = new RegExp(`(${S})${E}?\\s*日主|日主\\s*(?:是|為)?\\s*(${S})`, "g");
const STEM_ELEMENT_RE = new RegExp(`(?<![自知異克利])(${S})(${E})`, "g");
const LIKES = new RegExp(`(?:用神|喜神|喜用神?|喜)\\s*(?:五行)?\\s*(?:是|為|取|在|屬)?\\s*(${E}(?:[、與和及跟]?${E})*)`, "g");
const DISLIKES = new RegExp(`(?:忌神|仇神|忌)\\s*(?:五行)?\\s*(?:是|為|在|屬)?\\s*(${E}(?:[、與和及跟]?${E})*)`, "g");
const LACKS = new RegExp(`缺(${E})`, "g");
// A year with an age (「2034 年 56 歲」「34 歲（2012 年）」), and a 大運 with its ages or years.
const YEAR_AGE = /(?<![\d–\-~～至到‑])(\d{4})\s*年\s*[（(,，]?\s*(?:你|對方)?\s*(?:虛歲\s*)?(\d{1,3})\s*歲/g;
const AGE_YEAR = /(\d{1,3})\s*歲\s*[（(]\s*(\d{4})\s*年?\s*[）)]/g;
const DASH = "[‑\\-–—~～至到]";
const DECADE_AGES = new RegExp(`(${S}${B})\\s*大運\\s*[（(]\\s*(?:虛歲\\s*)?(\\d{1,3})\\s*${DASH}\\s*(\\d{1,3})(?!\\d)`, "g");
const DECADE_YEARS = new RegExp(`(${S}${B})\\s*大運\\s*[（(]\\s*(\\d{4})\\s*${DASH}\\s*(\\d{4})`, "g");
const DECADE_NAME = new RegExp(`${S}${B}(?=\\s*大運)`, "g");
const PATTERNS = Object.keys(PATTERN_TEXT);
const FORBIDDEN = [
  [/過世|去世|離世|往生|壽命|壽終|大限|短命|夭折|死亡|死於|喪命|身故|活到\s*\d/, "談到死亡或壽命"],
  [/血光|災劫|劫數|厄運|大難|橫禍|災厄|災禍|大凶/, "用了恐嚇的說法"],
  [/癌|腫瘤|中風|心臟病|心肌梗塞|糖尿病|洗腎|憂鬱症|躁鬱|失智|血壓|血糖|肝功能|肝指數|膽固醇|尿酸|骨質疏鬆|肝硬化|不孕|流產|自殺|手術|開刀|動刀/, "點名了疾病、手術或檢查項目"],
  [/改運|消災|法會|點燈|安太歲|符咒|護身符|開光|收驚|斬桃花|風水物|付費化解|化解儀式|購買.{0,8}(?:水晶|手鍊|飾品|吉祥物)/, "建議了改運商品或儀式"],
];
const PAIR_FORBIDDEN = [/外遇|劈腿|出軌|小三|離婚收場|一定會分手|注定分開/, "預言了外遇或分手"];
const MAINLAND = /質量|信息|視頻|網絡|軟件|屏幕|打印|博客|鼠標|硬件|反饋|早上好/g;
const SIMPLIFIED = new Set(SIMPLIFIED_ONLY);
const elementsOf = s => s.match(/[木火土金水]/g) || [];

// The facts a text gets wrong, and the words it must not use. → { problems, warnings }
export function contentProblems(all, C) {
  const problems = [], warnings = [];
  const add = (list, x) => { if (!list.includes(x)) list.push(x); };
  const unknown = [...new Set(all.match(PAIR) || [])].filter(p => !C.pillars.has(p));
  if (unknown.length) add(problems, `用了命盤資料裡沒有的干支：${unknown.join("、")}`);
  for (const m of all.matchAll(YEAR_THEN_PILLAR)) if (yearPillar(Number(m[1])) !== m[2]) add(problems, `${m[1]} 年不是${m[2]}年`);
  for (const m of all.matchAll(PILLAR_THEN_YEAR)) if (yearPillar(Number(m[2])) !== m[1]) add(problems, `${m[2]} 年不是${m[1]}年`);
  for (const m of all.matchAll(DAY_MASTER)) { const st = m[1] || m[2]; if (st && !C.dayStems.includes(st)) add(problems, `日主是${C.dayStems.join("、")}，不是${st}`); }
  for (const m of all.matchAll(STEM_ELEMENT_RE)) if (STEM_ELEMENT[m[1]] !== m[2]) add(problems, `${m[1]}屬${STEM_ELEMENT[m[1]]}，不是${m[2]}`);
  for (const m of all.matchAll(LIKES)) for (const e of elementsOf(m[1])) if (!C.useful.includes(e)) add(problems, `${e}不是喜用（喜用是${C.useful.join("、") || "不明顯"}）`);
  for (const m of all.matchAll(DISLIKES)) for (const e of elementsOf(m[1])) if (!C.avoid.includes(e)) add(problems, `${e}不是忌神（忌的是${C.avoid.join("、") || "不明顯"}）`);
  for (const m of all.matchAll(LACKS)) if (!C.missing.includes(m[1])) add(problems, `命中不缺${m[1]}`);
  const has = (...xs) => C.strengths.some(s => xs.includes(s));
  if (/身強|日主(?:偏)?(?:強|旺)/.test(all) && !has("身強", "專旺")) add(problems, `日主是${C.strengths.join("、")}，不是身強`);
  if (/身弱|日主(?:偏)?弱/.test(all) && !has("身弱", "從弱")) add(problems, `日主是${C.strengths.join("、")}，不是身弱`);
  if (/專旺/.test(all) && !has("專旺")) add(problems, `日主是${C.strengths.join("、")}，不是專旺`);
  if (/從弱|從格/.test(all) && !has("從弱")) add(problems, `日主是${C.strengths.join("、")}，不是從弱`);
  for (const p of PATTERNS) if (!C.patterns.includes(p) && all.includes(p)) add(problems, `格局是${C.patterns.join("、")}，不是${p}`);
  // An age must be the year's 足歲 or 虛歲, for one of the people.
  const ageFits = (year, age) => C.birthYears.some(by => age === year - by || age === year - by + 1);
  for (const m of all.matchAll(YEAR_AGE)) if (!ageFits(Number(m[1]), Number(m[2]))) add(problems, `${m[1]} 年不是 ${m[2]} 歲`);
  for (const m of all.matchAll(AGE_YEAR)) if (!ageFits(Number(m[2]), Number(m[1]))) add(problems, `${m[2]} 年不是 ${m[1]} 歲`);
  const named = name => C.decades.filter(d => d.name === name);
  for (const m of all.matchAll(DECADE_AGES)) {
    const ds = named(m[1]), a = Number(m[2]), b = Number(m[3]);
    if (ds.length && !ds.some(d => (a === d.startAge && b === d.endAge) || (a === d.startAge - 1 && b === d.endAge - 1))) add(problems, `${m[1]}大運是虛歲 ${ds[0].startAge}–${ds[0].endAge}，不是 ${a}–${b} 歲`);
  }
  for (const m of all.matchAll(DECADE_YEARS)) {
    const ds = named(m[1]);
    if (ds.length && !ds.some(d => Number(m[2]) === d.startYear && Number(m[3]) === d.endYear)) add(problems, `${m[1]}大運是 ${ds[0].startYear}–${ds[0].endYear} 年`);
  }
  if (C.single) {
    // A sentence that puts an age or a year with one 大運 it is not in: often a mix-up, sometimes 「到了…以後」.
    for (const sentence of all.split(/[。！？；\n]/)) {
      const names = [...new Set(sentence.match(DECADE_NAME) || [])];
      const d = names.length === 1 ? named(names[0])[0] : null;
      if (!d) continue;
      const offAges = [...sentence.matchAll(/(\d{1,3})\s*歲/g)].map(m => Number(m[1])).filter(n => n < d.startAge - 1 || n > d.endAge);
      const offYears = [...sentence.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map(m => Number(m[1])).filter(y => y >= 1800 && y <= 2200 && (y < d.startYear || y > d.endYear));
      if (offAges.length || offYears.length) add(warnings, `${d.name}大運和${[...offAges.map(n => `${n} 歲`), ...offYears.map(y => `${y} 年`)].join("、")}寫在同一句`);
    }
  } else if (PAIR_FORBIDDEN[0].test(all)) add(problems, PAIR_FORBIDDEN[1]);
  for (const [re, why] of FORBIDDEN) if (re.test(all)) add(problems, why);
  const simplified = [...new Set([...all].filter(ch => SIMPLIFIED.has(ch)))];
  if (simplified.length) add(problems, `出現簡體字：${simplified.join("")}`);
  const mainland = [...new Set(all.match(MAINLAND) || [])];
  if (mainland.length) add(warnings, `大陸用語：${mainland.join("、")}`);
  if ([...all.matchAll(/(\d{1,3})\s*歲/g)].some(m => Number(m[1]) > 110)) add(problems, "寫了不可能的歲數");
  return { problems, warnings };
}

// A part's answer → { ok, problems, warnings, length, sections | items, bad }. previous: the check of the first try,
// whose good entries a list keeps.
export function checkPart(text, part, previous = null) {
  return part.type === "sections" ? checkSections(text, part) : checkList(text, part, previous);
}

function checkSections(text, part) {
  const want = part.titles, sections = parseSections(text);
  const got = sections.map(s => s.title), problems = [], warnings = [];
  const missing = want.filter(t => !got.includes(t));
  if (missing.length) problems.push(`少了段落：${missing.join("、")}`);
  const extra = got.filter(t => !want.includes(t));
  if (extra.length) warnings.push(`多了段落：${extra.join("、")}`);
  const kept = want.map(t => sections.find(s => s.title === t)).filter(Boolean);
  for (const s of kept) if (s.body.length < (/一句話$/.test(s.title) ? 6 : 30)) problems.push(`「${s.title}」太短`);
  const all = kept.map(s => s.body).join("\n");
  const c = contentProblems(all, part.check);
  for (const p of c.problems) if (!problems.includes(p)) problems.push(p);
  const n = all.replace(/\s/g, "").length;
  return { ok: !problems.length, problems, warnings: [...warnings, ...c.warnings], sections: kept, length: n };
}

const norm = t => String(t).replace(/[\s　]/g, "").replace(/[（(].*$/, "");
const FIELD_LINE = /^(重點|好事|要注意)\s*[:：]\s*(.+)$/;
function checkList(text, part, previous) {
  // 【好事】 written as a title of its own belongs to the entry above it.
  const parsed = [];
  for (const s of parseSections(text)) {
    if (/^(重點|好事|要注意)$/.test(s.title) && parsed.length) parsed[parsed.length - 1].body += `\n${s.title}：${s.body}`;
    else parsed.push({ ...s });
  }
  const blocks = new Map(parsed.map(b => [norm(b.title), b]));
  const items = new Map(previous ? previous.items : []), bad = [], warnings = [];
  let length = 0;
  for (const it of part.items) {
    if (items.has(it.key)) continue;
    const b = blocks.get(norm(it.key));
    if (!b) { bad.push({ key: it.key, why: "沒有寫" }); continue; }
    const fields = {};
    for (const line of b.body.split("\n")) { const m = line.trim().match(FIELD_LINE); if (m && it.fields.includes(m[1]) && !fields[m[1]]) fields[m[1]] = m[2].trim(); }
    const short = it.fields.filter(f => !fields[f] || fields[f].length < (f === "重點" ? 6 : 8));
    if (short.length) { bad.push({ key: it.key, why: `少了「${short.join("」「")}」` }); continue; }
    const c = contentProblems(it.fields.map(f => fields[f]).join("\n"), part.check);
    for (const w of c.warnings) if (!warnings.includes(w)) warnings.push(w);
    if (c.problems.length) { bad.push({ key: it.key, why: c.problems.join("、") }); continue; }
    items.set(it.key, fields);
    length += it.fields.reduce((n, f) => n + fields[f].length, 0);
  }
  return { ok: !bad.length, bad, problems: bad.map(b => `【${b.key}】${b.why}`), warnings, items, length };
}

// What the page gets for a part: the sections, or every entry of a list with its header and either the model's words
// or, where the model failed twice, the engine's (fallback: true).
export function finishPart(part, result) {
  const meta = part.meta ? { meta: part.meta } : {};
  if (part.type === "sections") return { sections: result.sections.map(s => ({ title: s.title, body: s.body })), ...meta };
  return {
    items: part.items.map(it => {
      const fields = result && result.items.get(it.key);
      return { key: it.key, ...it.head, fields: fields || it.fallback, ...(fields ? {} : { fallback: true }) };
    }),
    ...meta,
  };
}
