// AI 命理師：結局頁的「AI 命理師解讀」。
//
// The page sends the birth (date, time or 時辰, place, sex) and this life's milestones as codes and ages
// (readingRequest); the name, the family, every written answer and every story sentence stay in the browser. The
// Worker (worker/app.js) checks the request (readReadingRequest), recomputes the chart with the same engine and writes
// the fact sheet here (readingFacts), so every 干支, 十神, 喜忌 and reason in the prompt comes from the engine, and the
// endpoint cannot be turned into a general chatbot. checkReading() then rejects a reading that invents 干支, gets the
// day master, the 喜忌, the strength or the 格局 wrong, talks about death, disease or paid 化解, or slips into
// Simplified characters; the Worker then asks once more with the problems listed.
import { computeChart } from "./core/chart.js";
import { findPlace } from "./core/places.js";
import { analyse, ELEMENTS } from "./core/analysis.js";
import { natalStars, STARS } from "./core/detail.js";
import { DAY_MASTER_TEXT, TEN_GOD_TEXT, PATTERN_TEXT, ELEMENT_INDUSTRIES, ELEMENT_ORGANS } from "./core/reading-natal.js";
import { decadeReading, yearReading, eventReason } from "./core/reading-year.js";
import { SHICHEN, shichenTime } from "./core/shichen.js";
import { SIMPLIFIED_ONLY } from "./core/simplified.js";
import { JOBS } from "./sim/world.js";

export const READING_VERSION = 1;
export const KINDS = ["full", "short"];

const STEMS = "甲乙丙丁戊己庚辛壬癸", BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const STEM_ELEMENT = Object.fromEntries([...STEMS].map((s, i) => [s, "木火土金水"[Math.floor(i / 2)]]));
// The 干支 of a Gregorian year (the year 4 was 甲子).
export const yearPillar = y => STEMS[(((y - 4) % 10) + 10) % 10] + BRANCHES[(((y - 4) % 12) + 12) % 12];

// A life's milestones: what each is called, the kind of the engine's explanation (reading-year.js eventReason) and
// which way it went. Illness, accidents and deaths are left out: the reading does not talk about them.
export const MILESTONES = {
  graduate: { label: "畢業", kind: "graduate", channel: "good" },
  job: { label: "開始第一份工作", kind: "job", channel: "good" },
  jobChange: { label: "換工作", kind: "careerChange", channel: "change" },
  startup: { label: "自己當老闆", kind: "startup", channel: "change" },
  promotion: { label: "升遷", kind: "promotion", channel: "good" },
  layoff: { label: "被裁員", kind: "layoff", channel: "bad" },
  dating: { label: "開始交往", kind: "dating", channel: "good" },
  breakup: { label: "分手", kind: "breakup", channel: "bad" },
  marry: { label: "結婚", kind: "marriage", channel: "good" },
  crisis: { label: "婚姻遇到低潮", kind: "crisis", channel: "bad" },
  divorce: { label: "離婚", kind: "divorce", channel: "bad" },
  kid: { label: "孩子出生", kind: "childbirth", channel: "good" },
  home: { label: "買了自己的房子", kind: "home", channel: "good" },
  parentCare: { label: "照顧年邁的爸媽", kind: "parentIll", channel: "bad" },
  retire: { label: "退休", kind: "retire", channel: "change" },
};
const GRADUATIONS = new Set(["graduate5", "graduateUni", "graduateMaster"]);
export const EDU_WORD = { none: "沒有上學", 國小: "國小", 國中: "國中", 高中: "高中", 高職: "高職", 五專: "五專", 科大: "科技大學", 大學: "大學", 碩士: "碩士", 博士: "博士" };
const HOME_WORD = { own: "有自己的房子", rent: "租屋", parents: "住在家裡" };
// Job titles the request may carry: the job lists and the civil service. A business of one's own is sent as
// "startup", without its name.
const JOB_TITLES = new Set([...Object.values(JOBS).flat().map(j => j[0]), "公務員"]);
const MAX_EVENTS = 24;

// ---------- the page: what is sent ----------
// run: { input, state, log, kline, summary } of the life page. kind: "full" or "short".
export function readingRequest({ input, state: s, log, kline, summary }, kind = "full") {
  const t = input.time;
  const sc = t && t.branch ? SHICHEN.find(x => x.branch === t.branch && x.h === t.h && x.mi === t.mi) : null;
  const time = !t ? null : sc ? { shichen: sc.key } : { h: t.h, mi: t.mi };
  const events = [];
  const add = (code, age, title = null) => { if (Number.isInteger(age) && age >= 0) events.push(title ? [code, age, title] : [code, age]); };
  const all = id => log.filter(e => e.id === id);
  for (const e of log) if (GRADUATIONS.has(e.id)) add("graduate", e.age);
  s.jobsHeld.forEach((j, i) => (/老闆$/.test(j.title) ? add("startup", j.age) : add(i ? "jobChange" : "job", j.age, JOB_TITLES.has(j.title) ? j.title : null)));
  for (const e of all("promotion").slice(0, 3)) add("promotion", e.age);
  for (const e of all("layoff").slice(0, 2)) add("layoff", e.age);
  for (const e of all("dating").slice(0, 1)) add("dating", e.age);
  for (const e of all("breakup").slice(0, 2)) add("breakup", e.age);
  for (const sp of s.spells) { add("marry", sp.from); if (sp.end === "divorce") add("divorce", sp.to); }
  for (const e of all("crisis").slice(0, 1)) add("crisis", e.age);
  for (const k of s.kids.slice(0, 5)) add("kid", k.birthYear - s.birthYear);
  if (s.home === "own") add("home", s.ownedAt);
  for (const e of all("parentCare").slice(0, 1)) add("parentCare", e.age);
  if (s.retired) for (const e of all("retire").slice(0, 1)) add("retire", e.age);
  events.sort((a, b) => a[1] - b[1]);
  // The best and the hardest year by mood, leaving out the last year (the end of a life is not a 低潮).
  const years = kline.slice(0, -1).length ? kline.slice(0, -1) : kline;
  const peak = years.reduce((a, b) => (b.close > a.close ? b : a), years[0]);
  const low = years.reduce((a, b) => (b.close < a.close ? b : a), years[0]);
  return {
    v: READING_VERSION, kind,
    birth: { y: input.date.y, m: input.date.m, d: input.date.d, time, place: input.place.name, sex: input.sex },
    life: {
      edu: s.edu, home: s.home, kids: s.kids.length, marriages: s.marriages, divorces: s.divorces, retired: !!s.retired,
      events: events.slice(0, MAX_EVENTS), peak: peak ? peak.age : null, low: low ? low.age : null,
      lean: [s.lean.followed, s.lean.offered], written: s.written,
      runs: summary ? { married: summary.married, university: summary.university, homeOwner: summary.homeOwner } : null,
    },
  };
}

// ---------- the Worker: what is accepted ----------
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

// The request body → { kind, birth: computeChart's input, life }, or null when it is not one the page could send.
export function readReadingRequest(body) {
  if (!body || typeof body !== "object" || body.v !== READING_VERSION || !KINDS.includes(body.kind)) return null;
  const b = body.birth, l = body.life;
  if (!b || typeof b !== "object" || !l || typeof l !== "object") return null;
  const y = int(b.y, 1900, 2100), m = int(b.m, 1, 12), d = int(b.d, 1, 31);
  if (y === null || m === null || d === null || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  let time = null;
  if (b.time !== null && b.time !== undefined) {
    if (typeof b.time !== "object") return null;
    if (b.time.shichen !== undefined) time = shichenTime(String(b.time.shichen));
    else { const h = int(b.time.h, 0, 23), mi = int(b.time.mi, 0, 59); time = h === null || mi === null ? null : { h, mi }; }
    if (!time) return null;
  }
  const place = typeof b.place === "string" ? findPlace(b.place) : null;
  if (!place || (b.sex !== "male" && b.sex !== "female")) return null;
  if (l.events !== undefined && !Array.isArray(l.events)) return null;
  const events = (l.events || []).slice(0, MAX_EVENTS).map(e => {
    if (!Array.isArray(e) || !Object.hasOwn(MILESTONES, e[0])) return null;
    const age = int(e[1], 0, 110);
    return age === null ? null : { code: e[0], age, title: typeof e[2] === "string" && JOB_TITLES.has(e[2]) ? e[2] : null };
  });
  if (events.includes(null)) return null;
  const count = v => int(v, 0, 9) ?? 0;
  const lean = Array.isArray(l.lean) ? l.lean.map(v => int(v, 0, 300)) : [];
  const runs = l.runs && typeof l.runs === "object" ? ["married", "university", "homeOwner"].map(k => int(l.runs[k], 0, 100)) : [];
  return {
    kind: body.kind,
    birth: { date: { y, m, d }, time, place, sex: b.sex },
    life: {
      edu: Object.hasOwn(EDU_WORD, l.edu) ? l.edu : null, home: Object.hasOwn(HOME_WORD, l.home) ? l.home : null,
      kids: count(l.kids), marriages: count(l.marriages), divorces: count(l.divorces), retired: l.retired === true,
      events, peak: int(l.peak, 0, 110), low: int(l.low, 0, 110),
      lean: lean.length === 2 && lean.every(v => v !== null) && lean[0] <= lean[1] ? lean : null,
      written: int(l.written, 0, 300) ?? 0,
      runs: runs.length === 3 && runs.every(v => v !== null) ? { married: runs[0], university: runs[1], homeOwner: runs[2] } : null,
    },
  };
}

// ---------- the fact sheet ----------
const strip = t => String(t || "").replace(/^[^：]{1,16}：/, "").replace(/。$/, "");

// Everything the model may use, as lines of text, and what checkReading() holds the reading to.
// now: the current year, for 「接下來十年」.
export function readingFacts({ kind = "full", birth, life }, { now = new Date().getUTCFullYear() } = {}) {
  const chart = computeChart({ ...birth, options: { solar: "true" } });
  const names = chart.pillars.map(p => p.name);
  const a = analyse(names);
  const by = birth.date.y, sex = chart.input.sex;
  const dm = a.dayMaster, dmText = DAY_MASTER_TEXT[dm.stem];
  const lines = [];
  const ageNow = now - by;
  lines.push(`【命主】${sex === "female" ? "女" : "男"}命，${by} 年生，屬${chart.zodiac}${ageNow >= 0 ? `，${now} 年滿 ${ageNow} 歲` : ""}。${chart.hourKnown ? (chart.time.shichen ? `出生時辰是${chart.time.shichen}時` : "出生時間已知") : "出生時辰不詳，只排年、月、日三柱"}。`);
  lines.push(`【四柱】${chart.pillars.map(p => `${p.label}${p.name}（天干${p.stem.name}${p.role === "day" ? "是日主" : `為${p.stem.god}`}，地支${p.branch.name}藏${p.branch.hidden.map(h => `${h.name}${h.god}`).join("、")}）`).join("；")}。`);
  lines.push(`【日主】${dm.stem}${dm.element}，${dmText.yinyang}，意象是${dmText.image}。長處：${dmText.nature}。盲點：${dmText.blind}。`);
  const pt = PATTERN_TEXT[a.pattern];
  lines.push(`【強弱與格局】日主${a.strength}（生扶日主的力量約占 ${Math.round(a.support * 100)}%），${a.season}；格局是${a.pattern}${pt ? `：${pt.nature}，傳統上適合${pt.careers.join("、")}` : ""}。`);
  const order = ELEMENTS.slice().sort((x, y) => a.scores[x] - a.scores[y]);
  lines.push(`【五行力量】${ELEMENTS.map(e => `${e} ${a.scores[e]}`).join("、")}；最旺是${order[4]}，最弱是${order[0]}；${chart.missing.length ? `天干地支裡沒有${chart.missing.join("、")}（命中缺${chart.missing.join("、")}）` : "五行俱全"}。`);
  const [u, ...us] = a.useful, [j, ...js] = a.avoid;
  lines.push(`【喜忌】${u ? `用神${u}${us.length ? `，喜${us.join("、")}` : ""}` : "喜忌不明顯"}${j ? `；忌${j}${js.length ? `，也忌${js.join("、")}` : ""}` : ""}。${u ? `和用神${u}有關的行業：${ELEMENT_INDUSTRIES[u].slice(0, 5).join("、")}。` : ""}`);
  // The ten gods that show most: the stems and the main 藏干.
  const gods = {};
  for (const p of chart.pillars) {
    if (p.role !== "day") gods[p.stem.god] = (gods[p.stem.god] || 0) + 1;
    if (p.branch.hidden[0]) gods[p.branch.hidden[0].god] = (gods[p.branch.hidden[0].god] || 0) + 1;
  }
  const top = Object.entries(gods).filter(([g]) => TEN_GOD_TEXT[g]).sort((x, y) => y[1] - x[1]).slice(0, 2);
  if (top.length) lines.push(`【十神】最多的是${top.map(([g, n]) => `${g}（${n} 個，${TEN_GOD_TEXT[g].trait}）`).join("、")}。`);
  const stars = natalStars(chart);
  const good = [...new Set(chart.pillars.flatMap(p => [...(stars[p.role] || [])]))].filter(x => STARS[x] && STARS[x].nature !== "凶").slice(0, 5);
  if (good.length) lines.push(`【神煞】${good.map(x => `${x}（${STARS[x].text}）`).join("；")}。`);
  lines.push(`【健康（傳統說法）】五行最弱的${order[0]}對應${ELEMENT_ORGANS[order[0]].organs}，平時宜${ELEMENT_ORGANS[order[0]].care}。`);

  const decades = chart.luck.decades.map((_, i) => decadeReading(chart, a, i)).filter(d => d && d.startAge <= 87);
  lines.push("【大運】（歲數是虛歲，出生那年算 1 歲）");
  for (const d of decades) lines.push(`- ${d.startYear}–${d.endYear} 年（虛歲 ${d.startAge}–${d.endAge}）走${d.name}大運，${d.tone}：${strip(d.headline)}。`);

  const from = by <= now ? now - by : 18;
  const years = Array.from({ length: 10 }, (_, k) => yearReading(chart, a, from + k)).filter(Boolean);
  lines.push(by <= now ? `【接下來十年的流年】（${now}–${now + 9} 年，歲數是足歲）` : `【成年後十年的流年】（歲數是足歲）`);
  for (const y of years) lines.push(`- ${y.year} 年 ${y.pillar}年（${y.age} 歲），${(y.favor && y.favor.tone) || "平"}：${strip(y.headline)}。`);

  lines.push("【這一次模擬的人生】（遊戲模擬出來的一種人生，不是讀者的真實經歷；歲數是足歲）");
  const L = life, facts = [];
  if (L.edu) facts.push(`學歷：${EDU_WORD[L.edu]}`);
  facts.push(L.marriages ? `婚姻 ${L.marriages} 次${L.divorces ? `（離婚 ${L.divorces} 次）` : ""}` : "沒有結婚");
  facts.push(L.kids ? `${L.kids} 個孩子` : "沒有孩子");
  if (L.home) facts.push(HOME_WORD[L.home]);
  if (L.retired) facts.push("後來退休");
  lines.push(`- ${facts.join("；")}。`);
  const eventPillars = [];
  for (const e of L.events) {
    const M = MILESTONES[e.code], r = yearReading(chart, a, e.age);
    if (!r) continue;
    eventPillars.push(r.pillar);
    const why = eventReason(M.kind, r, { sex, channel: M.channel });
    lines.push(`- ${r.year} 年（${e.age} 歲，${r.pillar}年）${M.label}${e.title ? `：${e.title}` : ""}${why && why.matched ? `。命理：${strip(why.short)}` : ""}。`);
  }
  const mood = (label, age) => (age !== null ? `${label}是 ${by + age} 年（${age} 歲）` : "");
  const moods = [mood("心情最好的一年", L.peak), mood("最低潮的一年", L.low)].filter(Boolean);
  if (moods.length) lines.push(`- ${moods.join("，")}。`);
  if (L.lean && L.lean[1]) lines.push(`- ${L.lean[1]} 次有明顯個性傾向的抉擇裡，有 ${L.lean[0]} 次照著個性選。`);
  if (L.written) lines.push(`- 有 ${L.written} 個決定是讀者自己寫的。`);
  if (L.runs) lines.push(`- 同一張命盤模擬 100 次：結婚 ${L.runs.married} 次、讀到大學以上 ${L.runs.university} 次、買房 ${L.runs.homeOwner} 次。`);

  const ages = new Set([ageNow, ...years.map(y => y.age), ...L.events.map(e => e.age), L.peak, L.low, ...decades.flatMap(d => [d.startAge, d.endAge, d.startAge - 1, d.endAge - 1])].filter(Number.isInteger));
  return {
    kind, text: lines.join("\n"),
    check: {
      pillars: new Set([...names, ...decades.map(d => d.name), ...years.map(y => y.pillar), ...eventPillars]),
      dayStem: dm.stem, useful: a.useful, avoid: a.avoid, strength: a.strength, pattern: a.pattern, missing: chart.missing, ages,
      birthYear: by, decades: decades.map(d => ({ name: d.name, startAge: d.startAge, endAge: d.endAge, startYear: d.startYear, endYear: d.endYear })),
    },
  };
}

// ---------- the prompt ----------
export const SECTIONS = {
  full: [
    ["命格一句話", "一句 25 字以內的比喻，說出這張命盤最大的特質"],
    ["性格與天賦", "約 150 字：從日主、強弱、格局和最多的十神說起，長處和盲點都要講"],
    ["這一生的印證", "約 180 字：從「這一次模擬的人生」挑兩三件大事，引用資料裡的「命理」說明，說說它們和當時大運、流年的關係"],
    ["事業與財運", "約 150 字：適合的方向要對應用神和格局"],
    ["感情與家庭", "約 130 字"],
    ["健康與作息", "約 80 字：只根據「健康（傳統說法）」那一行，給作息和保養的建議"],
    ["未來十年", "約 160 字：根據流年那幾行，點出最值得把握和需要放慢腳步的年份"],
    ["給你的三句話", "三句具體、溫暖的建議，每句一行，分別以 1. 2. 3. 開頭"],
  ],
  short: [
    ["命格一句話", "一句 25 字以內的比喻，說出這張命盤最大的特質"],
    ["總評", "約 150 字：用白話總結個性、最適合的方向，以及接下來最值得把握的一年"],
  ],
};

// The two halves a full reading is written in at once (each call writes about half the words, so the wait halves).
export const HALVES = { full: [[0, 4], [4, SECTIONS.full.length]], short: [[0, SECTIONS.short.length]] };

// problems: what was wrong with the last answer, for the second try. part: [from, to) of the sections, when the
// reading is written in two halves at once (the other half is written by another call, so it must not be repeated).
export function readingPrompt(facts, problems = null, part = null) {
  const all = SECTIONS[facts.kind];
  const sections = part ? all.slice(part[0], part[1]) : all;
  const others = part ? all.filter(s => !sections.includes(s)).map(([t]) => `【${t}】`) : [];
  return [
    "你是一位溫暖、專業、說話實在的八字命理師，正在為一位臺灣讀者寫「AI 命理師解讀」。讀者剛在「命盤人生」這個遊戲裡，用自己的命盤模擬過一生。",
    "",
    "寫作規則：",
    "1. 只能使用下面「命盤資料」裡寫到的干支、十神、喜忌、格局、大運、流年、年份和歲數。不要自己排盤或推算，也不要補上資料裡沒有的干支、神煞、年份或歲數；寫到年份和歲數時，要和資料裡同一行的寫法一致。",
    "2. 用繁體中文和臺灣用語，口吻像面對面聊天：親切、具體、鼓勵。用到術語時，順便用白話解釋。稱呼讀者「你」。",
    "3. 「這一次模擬的人生」是遊戲裡的故事，不是讀者的真實經歷。提到它時要說「在這次模擬裡」，不要說成預言。",
    "4. 不談死亡、壽命和意外災難，不點名任何疾病或檢查項目；健康只談作息、飲食、運動和定期健康檢查。",
    "5. 不用恐嚇的說法（例如血光、劫數、大凶），也不建議任何改運商品、法會、點燈、符咒或付費化解。",
    "6. 命理說的是傾向和時機，不是注定：用「命理上看」「傳統說法」這樣的語氣，不要寫成「因為命盤，所以一定會」；最後要把選擇權交還給讀者。",
    "7. 不要用 Markdown 符號（#、*、- 都不要）。",
    "",
    `請依序寫 ${sections.length} 段。每段第一行只寫標題（例如【${sections[Math.min(1, sections.length - 1)][0]}】），從下一行開始寫內文：`,
    ...sections.map(([t, how], i) => `${i + 1}. 【${t}】${how}。`),
    ...(others.length ? [`${others.join("、")}由別人寫，你不要寫，也不要重複它們的內容。`] : []),
    ...(problems && problems.length ? ["", `上一次寫的內容有這些問題，這次一定要避免：${problems.join("；")}。`] : []),
    "",
    "命盤資料：",
    facts.text,
  ].join("\n");
}

// ---------- reading the answer ----------
// 【標題】 lines start the sections; Markdown marks and numbering around a title are dropped.
export function parseSections(text) {
  const out = [];
  for (const raw of String(text || "").replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/\*\*|__/g, "").replace(/^[#>*\s]+/, "").trimEnd();
    const m = line.match(/^(?:\d+[.、．]\s*)?【([^】]{1,12})】\s*(.*)$/);
    if (m) out.push({ title: m[1].trim(), body: m[2] ? [m[2].trim()] : [] });
    else if (out.length && line.trim()) out[out.length - 1].body.push(line.trim());
  }
  return out.map(s => ({ title: s.title, body: s.body.join("\n").trim() }));
}

const S = `[${STEMS}]`, B = `[${BRANCHES}]`, E = "[木火土金水]";
const PAIR = new RegExp(`${S}${B}`, "g");
const YEAR_THEN_PILLAR = new RegExp(`(?<![\\d–\\-~～至到])(\\d{4})\\s*年?\\s*[（(]?\\s*(${S}${B})(?=\\s*年)`, "g");
const PILLAR_THEN_YEAR = new RegExp(`(${S}${B})\\s*年\\s*[（(]\\s*(\\d{4})`, "g");
const DAY_MASTER = new RegExp(`(${S})${E}?\\s*日主|日主\\s*(?:是|為)?\\s*(${S})`, "g");
const STEM_ELEMENT_RE = new RegExp(`(?<![自知異克利])(${S})(${E})`, "g");
const LIKES = new RegExp(`(?:用神|喜神|喜用神?|喜)\\s*(?:五行)?\\s*(?:是|為|取|在|屬)?\\s*(${E}(?:[、與和及跟]?${E})*)`, "g");
const DISLIKES = new RegExp(`(?:忌神|仇神|忌)\\s*(?:五行)?\\s*(?:是|為|在|屬)?\\s*(${E}(?:[、與和及跟]?${E})*)`, "g");
const LACKS = new RegExp(`缺(${E})`, "g");
// A year with an age (「2034 年 56 歲」「34 歲（2012 年）」), and a 大運 with its ages or years.
const YEAR_AGE = /(?<![\d–\-~～至到‑])(\d{4})\s*年\s*[（(,，]?\s*你?\s*(?:虛歲\s*)?(\d{1,3})\s*歲/g;
const AGE_YEAR = /(\d{1,3})\s*歲\s*[（(]\s*(\d{4})\s*年?\s*[）)]/g;
const DASH = "[‑\\-–—~～至到]";
const DECADE_AGES = new RegExp(`(${S}${B})\\s*大運\\s*[（(]\\s*(?:虛歲\\s*)?(\\d{1,3})\\s*${DASH}\\s*(\\d{1,3})(?!\\d)`, "g");
const DECADE_YEARS = new RegExp(`(${S}${B})\\s*大運\\s*[（(]\\s*(\\d{4})\\s*${DASH}\\s*(\\d{4})`, "g");
const DECADE_NAME = new RegExp(`${S}${B}(?=\\s*大運)`, "g");
const PATTERNS = Object.keys(PATTERN_TEXT);
const FORBIDDEN = [
  [/過世|去世|離世|往生|壽命|壽終|大限|短命|夭折|死亡|死於|喪命|身故|活到\s*\d/, "談到死亡或壽命"],
  [/血光|災劫|劫數|厄運|大難|橫禍|災厄|災禍|大凶/, "用了恐嚇的說法"],
  [/癌|腫瘤|中風|心臟病|心肌梗塞|糖尿病|洗腎|憂鬱症|躁鬱|失智|血壓|血糖|肝功能|肝指數|膽固醇|尿酸|骨質疏鬆|肝硬化|不孕|流產|自殺/, "點名了疾病或檢查項目"],
  [/改運|消災|法會|點燈|安太歲|符咒|護身符|開光|收驚|斬桃花|風水物|付費化解|化解儀式|購買.{0,8}(?:水晶|手鍊|飾品|吉祥物)/, "建議了改運商品或儀式"],
];
const MAINLAND = /質量|信息|視頻|網絡|軟件|屏幕|打印|博客|鼠標|硬件|反饋|早上好/g;
const SIMPLIFIED = new Set(SIMPLIFIED_ONLY);
const LENGTH = { full: [700, 2600], short: [90, 520] };
const elementsOf = s => s.match(/[木火土金水]/g) || [];

// → { ok, problems, warnings, sections }. problems make the Worker ask again; warnings are only reported.
export function checkReading(text, facts) {
  const C = facts.check, problems = [], warnings = [];
  const add = (list, x) => { if (!list.includes(x)) list.push(x); };
  const want = SECTIONS[facts.kind].map(([t]) => t);
  const sections = parseSections(text);
  const got = sections.map(s => s.title);
  const missing = want.filter(t => !got.includes(t));
  if (missing.length) add(problems, `少了段落：${missing.join("、")}`);
  const extra = got.filter(t => !want.includes(t));
  if (extra.length) add(warnings, `多了段落：${extra.join("、")}`);
  const kept = want.map(t => sections.find(s => s.title === t)).filter(Boolean);
  for (const s of kept) if (s.body.length < (s.title === "命格一句話" ? 6 : 30)) add(problems, `「${s.title}」太短`);
  const all = kept.map(s => s.body).join("\n");

  const unknown = [...new Set(all.match(PAIR) || [])].filter(p => !C.pillars.has(p));
  if (unknown.length) add(problems, `用了命盤資料裡沒有的干支：${unknown.join("、")}`);
  for (const m of all.matchAll(YEAR_THEN_PILLAR)) if (yearPillar(Number(m[1])) !== m[2]) add(problems, `${m[1]} 年不是${m[2]}年`);
  for (const m of all.matchAll(PILLAR_THEN_YEAR)) if (yearPillar(Number(m[2])) !== m[1]) add(problems, `${m[2]} 年不是${m[1]}年`);
  for (const m of all.matchAll(DAY_MASTER)) { const st = m[1] || m[2]; if (st && st !== C.dayStem) add(problems, `日主是${C.dayStem}，不是${st}`); }
  for (const m of all.matchAll(STEM_ELEMENT_RE)) if (STEM_ELEMENT[m[1]] !== m[2]) add(problems, `${m[1]}屬${STEM_ELEMENT[m[1]]}，不是${m[2]}`);
  for (const m of all.matchAll(LIKES)) for (const e of elementsOf(m[1])) if (!C.useful.includes(e)) add(problems, `${e}不是喜用（喜用是${C.useful.join("、") || "不明顯"}）`);
  for (const m of all.matchAll(DISLIKES)) for (const e of elementsOf(m[1])) if (!C.avoid.includes(e)) add(problems, `${e}不是忌神（忌的是${C.avoid.join("、") || "不明顯"}）`);
  for (const m of all.matchAll(LACKS)) if (!C.missing.includes(m[1])) add(problems, `命中不缺${m[1]}`);
  // An age must be the year's 足歲 or 虛歲.
  const ageFits = (year, age) => age === year - C.birthYear || age === year - C.birthYear + 1;
  for (const m of all.matchAll(YEAR_AGE)) if (!ageFits(Number(m[1]), Number(m[2]))) add(problems, `${m[1]} 年是 ${Number(m[1]) - C.birthYear} 歲，不是 ${m[2]} 歲`);
  for (const m of all.matchAll(AGE_YEAR)) if (!ageFits(Number(m[2]), Number(m[1]))) add(problems, `${m[2]} 年是 ${Number(m[2]) - C.birthYear} 歲，不是 ${m[1]} 歲`);
  const decade = name => C.decades.find(d => d.name === name);
  for (const m of all.matchAll(DECADE_AGES)) {
    const d = decade(m[1]), a = Number(m[2]), b = Number(m[3]);
    if (d && !((a === d.startAge && b === d.endAge) || (a === d.startAge - 1 && b === d.endAge - 1))) add(problems, `${m[1]}大運是虛歲 ${d.startAge}–${d.endAge}，不是 ${a}–${b} 歲`);
  }
  for (const m of all.matchAll(DECADE_YEARS)) {
    const d = decade(m[1]);
    if (d && (Number(m[2]) !== d.startYear || Number(m[3]) !== d.endYear)) add(problems, `${m[1]}大運是 ${d.startYear}–${d.endYear} 年`);
  }
  // A sentence that puts an age or a year with one 大運 it is not in: often a mix-up, sometimes 「到了…以後」.
  for (const sentence of all.split(/[。！？；\n]/)) {
    const named = [...new Set(sentence.match(DECADE_NAME) || [])];
    const d = named.length === 1 ? decade(named[0]) : null;
    if (!d) continue;
    const offAges = [...sentence.matchAll(/(\d{1,3})\s*歲/g)].map(m => Number(m[1])).filter(n => n < d.startAge - 1 || n > d.endAge);
    const offYears = [...sentence.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map(m => Number(m[1])).filter(y => y >= 1800 && y <= 2200 && (y < d.startYear || y > d.endYear));
    if (offAges.length || offYears.length) add(warnings, `${d.name}大運和${[...offAges.map(n => `${n} 歲`), ...offYears.map(y => `${y} 年`)].join("、")}寫在同一句`);
  }
  if (/身強|日主(?:偏)?(?:強|旺)/.test(all) && !["身強", "專旺"].includes(C.strength)) add(problems, `日主是${C.strength}，不是身強`);
  if (/身弱|日主(?:偏)?弱/.test(all) && !["身弱", "從弱"].includes(C.strength)) add(problems, `日主是${C.strength}，不是身弱`);
  if (/專旺/.test(all) && C.strength !== "專旺") add(problems, `日主是${C.strength}，不是專旺`);
  if (/從弱|從格/.test(all) && C.strength !== "從弱") add(problems, `日主是${C.strength}，不是從弱`);
  for (const p of PATTERNS) if (p !== C.pattern && all.includes(p)) add(problems, `格局是${C.pattern}，不是${p}`);
  for (const [re, why] of FORBIDDEN) if (re.test(all)) add(problems, why);
  const simplified = [...new Set([...all].filter(ch => SIMPLIFIED.has(ch)))];
  if (simplified.length) add(problems, `出現簡體字：${simplified.join("")}`);
  const mainland = [...new Set(all.match(MAINLAND) || [])];
  if (mainland.length) add(warnings, `大陸用語：${mainland.join("、")}`);
  const odd = [...new Set([...all.matchAll(/(\d{1,3})\s*歲/g)].map(m => Number(m[1])).filter(n => !C.ages.has(n)))];
  if (odd.some(n => n > 110)) add(problems, "寫了不可能的歲數");
  if (odd.length) add(warnings, `資料裡沒有的歲數：${odd.join("、")}`);
  const [lo, hi] = LENGTH[facts.kind], n = all.replace(/\s/g, "").length;
  if (n < lo / 2) add(problems, "內容太短");
  else if (n < lo || n > hi) add(warnings, `長度 ${n} 字`);
  return { ok: !problems.length, problems, warnings, sections: kept, length: n };
}
