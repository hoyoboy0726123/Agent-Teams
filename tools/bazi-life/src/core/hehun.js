// 合婚分頁：兩個人的八字放在一起的完整合婚。全部由排盤引擎在瀏覽器裡算，不送出去。
//
// hehunReading({ a, b, now }) →
//   {
//     people: [P, P]        { n, sex, pillars, zodiac, stem, element, solarYear, gua: { num, name, group } }
//     neutral               兩人性別相同：配偶星兩種都看（伴侶星），結婚月份不只看「女方」
//     score: { total, parts: [{ id, label, got, max, why }] }       契合度，分項加起來就是總分
//     type: { id, label, line }                                     關係類型
//     chips: [{ text, kind }]                                       主視覺卡的三個亮點（good / care / mid）
//     summary, advice                                               partnerReading 的摘要與相處建議
//     dims: [{ id, label, value, strength, watch, try }]            六大面向，value 0–100
//     checks: [{ id, title, level, verdict, paragraphs, items }]    傳統合婚九項：level 主要／輔助／民俗，
//                                                                   verdict 契合／中性／需要磨合
//     loves: [{ who, lines, seen }]                                 兩個人的感情樣貌，seen 是對方眼中的這個人
//     guide: [{ id, title, text }]                                  相處說明書
//     years: [{ year, pillar, ages, tones, state, wed, good, watch }]   未來十年（state: good / mid / care）
//     wed: { both: [year], each: [[year], [year]], text }           宜婚年份
//     months: { text, women: [{ who, best, second }] }              結婚月份參考（傳統的行嫁月）
//     luck: { elements, text }                                      一起開運
//     age: string                                                   年齡差的小知識
//   }
//   a, b: { chart (core/chart.js; lean is fine), sex: "male" | "female", name?: string }   a is 你, b is 對方
//   now:  this year (the ten years start here)
//
// How the score is made (each part has a ceiling; the parts add up to 100). The weights follow what present-day
// practitioners weigh most (夫妻宮與日柱、用神), with the folk methods kept small:
//   夫妻宮・日柱 25: 日支的合沖刑害破；天合地合 25，天剋地沖 6
//   用神互補 25:    each one's 用神 strong in the other's chart; the other's strongest element liked or disliked
//   配偶星 15:      one day master on the other's 配偶星 (伴侶星 for two people of the same sex)
//   日干 10:        五合 10、相生 8、比和 7、約束 5
//   生肖 10:        年支的六合、三合、沖刑害破
//   納音 5, 命卦 5, 神煞 5: 年命納音的生剋；呂才合婚的命卦；桃花、紅鸞、天喜互見，孤辰寡宿等扣一點
// The simulation keeps relate() (core/family.js); the tests check that the two agree in direction.
//
// Wording follows partner.js and the research on Taiwanese 合婚: never 合／不合、上中下等婚、剋夫、不宜 or a paid
// 化解; every check says what fits and what to work on, and is marked 主要／輔助／民俗 so the folk methods read as
// folk methods. 命卦 carries the note that 《神峰通考》 already criticised it.
//
// English (core/tr.js, src/i18n/en/hehun.json) as in partner.js: each sentence is tr() of its Chinese template, a
// person is `n` or `of` (you / your), and the text is tidied at the end. The values the page sorts or styles by stay
// Chinese in both languages (type.id, checks' level and verdict, the years' pillar and tones, people's pillars).
import { SixtyCycle } from "tyme4ts";
import { analyse, pillarOf, elementScores, tenGod, ELEMENTS, GROUPS } from "./analysis.js";
import { clash, sixCombine, tenGodCounts, GOD_GROUP, natalStars, starContextOf, luckStars } from "./detail.js";
import { partnerReading, branchRelations, spouseElements, ZODIAC, TOGETHER, isEn, end, run, list, duo, se, nameForms, tidy } from "./partner.js";
import { yearReading } from "./reading-year.js";
import { ELEMENT_LUCK } from "./reading-natal.js";
import { zh } from "./zh.js";
import { tr, trw } from "./tr.js";

const STEMS = "甲乙丙丁戊己庚辛壬癸", BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const GENERATES = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const CONTROLS = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
const STEM_COMBINE = { 甲: "己", 己: "甲", 乙: "庚", 庚: "乙", 丙: "辛", 辛: "丙", 丁: "壬", 壬: "丁", 戊: "癸", 癸: "戊" };
const SEASON_GROUPS = [["寅卯辰", "東方木"], ["巳午未", "南方火"], ["申酉戌", "西方金"], ["亥子丑", "北方水"]];
const ROLE_NAMES = ["年柱", "月柱", "日柱", "時柱"];
const LEVEL = { main: "主要", aux: "輔助", folk: "民俗" };
const VERDICT = { good: "契合", mid: "中性", care: "需要磨合" };
const STRONG = 0.3;

// The 干支 of a Gregorian year (the year 4 was 甲子); a year pillar changes at 立春.
export const yearPillar = y => STEMS[(((y - 4) % 10) + 10) % 10] + BRANCHES[(((y - 4) % 12) + 12) % 12];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const uniq = list => [...new Set(list)];
const semi = items => items.join(isEn() ? "; " : "；");
const cycleIndex = name => SixtyCycle.fromName(name).getIndex();

// ---------- 命卦（呂才合婚） ----------
// 1 坎 2 坤 3 震 4 巽 6 乾 7 兌 8 艮 9 離; 5 is the centre: a man goes to 坤 2, a woman to 艮 8. The year is the solar
// year (立春). 東四命 1 3 4 9, 西四命 2 6 7 8.
const GUA = { 1: "坎", 2: "坤", 3: "震", 4: "巽", 6: "乾", 7: "兌", 8: "艮", 9: "離" };
export function minggua(year, sex) {
  let n = sex === "female" ? (((year + 4) % 9) + 9) % 9 : (((2 - year) % 9) + 9) % 9;
  if (n === 0) n = 9;
  if (n === 5) n = sex === "female" ? 8 : 2;
  return { num: n, name: GUA[n], group: [1, 3, 4, 9].includes(n) ? "東四命" : "西四命" };
}
// 大遊年歌: for each 卦, the stars of the seven others counted from the next one in the order 坎艮震巽離坤兌乾.
const ROUND = [1, 8, 3, 4, 9, 2, 7, 6];
const SONG = { 6: "六天五禍絕延生", 1: "五天生延絕禍六", 8: "六絕禍生延天五", 3: "延生禍絕五天六", 4: "天五六禍生絕延", 9: "六五絕延禍生天", 2: "天延絕生禍五六", 7: "生禍延絕六五天" };
const SONG_STAR = { 生: "生氣", 延: "延年", 天: "天醫", 六: "六煞", 禍: "禍害", 五: "五鬼", 絕: "絕命" };
export function mingguaPair(x, y) {
  if (x === y) return "伏位";
  const i = ROUND.indexOf(x);
  for (let k = 1; k < 8; k++) if (ROUND[(i + k) % 8] === y) return SONG_STAR[SONG[x][k - 1]];
  return null;
}
const GUA_SCORE = { 延年: 5, 生氣: 5, 天醫: 5, 伏位: 4, 禍害: 3, 六煞: 3, 五鬼: 1, 絕命: 1 };
const GUA_TEXT = {
  延年: "延年在呂才合婚裡是很受看重的組合，傳統上主兩人和諧、長長久久",
  生氣: "生氣在呂才合婚裡是很受看重的組合，傳統上主家庭有活力、越過越興旺",
  天醫: "天醫在呂才合婚裡是很受看重的組合，傳統上主彼此照顧、生活安穩",
  伏位: "伏位是兩人命卦相同，傳統上屬於平穩的組合，步調相近",
  禍害: "禍害在呂才合婚裡屬於平穩、要多溝通的組合，傳統上提醒為小事各退一步",
  六煞: "六煞在呂才合婚裡屬於平穩、要多溝通的組合，傳統上提醒兩人把期待說清楚",
  五鬼: "五鬼在呂才合婚裡屬於需要多磨合的組合，傳統上提醒說話留一點餘地，有事當天說開",
  絕命: "絕命在呂才合婚裡屬於需要多磨合的組合，傳統上提醒兩人多給彼此空間，重要的事一起商量",
};

// ---------- 行嫁月 ----------
// From the woman's year branch: 陽年 counts forward, 陰年 back. One step is the 大利月 (with its opposite month), two
// steps the 小利月. A month is a 節氣月: 寅 is the first month.
const MONTH_NAME = ["", "正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const monthOf = b => ((BRANCHES.indexOf(b) - 2 + 12) % 12) + 1;
export function marriageMonths(yearBranch) {
  const i = BRANCHES.indexOf(yearBranch), s = i % 2 === 0 ? 1 : -1;
  const pair = k => {
    const m = BRANCHES[(((i + s * k) % 12) + 12) % 12];
    return [monthOf(m), monthOf(BRANCHES[(BRANCHES.indexOf(m) + 6) % 12])].sort((p, q) => p - q);
  };
  return { best: pair(1), second: pair(2) };
}

// ---------- 一個人 ----------
function personOf(x, { n, of }) {
  const chart = x.chart, names = chart.pillars.map(p => p.name), ps = names.map(pillarOf), a = x.analysis || analyse(names);
  const scores = elementScores(names), total = ELEMENTS.reduce((s, e) => s + scores[e], 0) || 1;
  const share = Object.fromEntries(ELEMENTS.map(e => [e, scores[e] / total]));
  const chars = Object.fromEntries(ELEMENTS.map(e => [e, 0]));
  for (const p of ps) { chars[p.stemEl]++; chars[p.branchEl]++; }
  const gods = tenGodCounts(names), groups = Object.fromEntries(GROUPS.map(g => [g, 0]));
  for (const [god, o] of Object.entries(gods)) groups[GOD_GROUP[god]] += o.weight;
  const main = GROUPS.slice().sort((p, q) => groups[q] - groups[p] || GROUPS.indexOf(p) - GROUPS.indexOf(q))[0];
  const natal = natalStars(chart);
  const by = chart.input.date.y, solar = yearPillar(by) === names[0] ? by : by - 1;
  return {
    n, of, sex: x.sex, male: x.sex !== "female", chart, names, ps, a, share, chars, groups, main,
    visible: god => (gods[god] ? gods[god].visible.length : 0),
    top: ELEMENTS.slice().sort((p, q) => scores[q] - scores[p])[0], useful: a.useful[0] || null,
    own: new Set(Object.values(natal).flat()), dayStars: new Set(natal.day || []),
    stem: ps[2].stem, el: ps[2].stemEl, yang: ps[2].yang,
    yearB: ps[0].branch, monthB: ps[1].branch, dayB: ps[2].branch, hourB: ps[3] ? ps[3].branch : null,
    by, solar, gua: minggua(solar, x.sex), ctx: starContextOf(names, x.sex),
  };
}
const usefulStrong = (X, Y) => !!X.useful && (Y.top === X.useful || Y.share[X.useful] >= STRONG);
// The love stars of X that Y carries in the year pillar (the 生肖) or the day pillar (the person): 桃花、紅鸞、天喜.
function seenIn(X, Y) {
  const out = [];
  for (const i of [0, 2]) for (const s of luckStars(X.ctx, Y.names[i])) if (s === "桃花" || s === "紅鸞" || s === "天喜") out.push({ star: s, role: ROLE_NAMES[i] });
  return out;
}
const fillsGap = (X, Y) => ELEMENTS.some(e => !X.chars[e] && Y.chars[e] >= 2 && !X.a.avoid.includes(e));
const LONELY = ["孤辰", "寡宿", "陰差陽錯", "孤鸞煞"];

// What the two charts say to each other, read once and used by every part.
function factsOf(A, B, neutral) {
  const stemRel = STEM_COMBINE[A.stem] === B.stem ? "合" : A.el === B.el ? "比" : GENERATES[A.el] === B.el ? "A生B" : GENERATES[B.el] === A.el ? "B生A" : CONTROLS[A.el] === B.el ? "A剋B" : "B剋A";
  const gap = (cycleIndex(A.names[2]) - cycleIndex(B.names[2]) + 60) % 60;
  const seasonOf = b => SEASON_GROUPS.find(([g]) => g.includes(b));
  const na = zh(SixtyCycle.fromName(A.names[0]).getSound().getName()), nb = zh(SixtyCycle.fromName(B.names[0]).getSound().getName());
  const ea = na.slice(-1), eb = nb.slice(-1);
  return {
    dayRel: branchRelations(A.dayB, B.dayB), yearRel: branchRelations(A.yearB, B.yearB), monthRel: branchRelations(A.monthB, B.monthB),
    hourRel: A.hourB && B.hourB ? branchRelations(A.hourB, B.hourB) : null,
    stemRel, heaven: stemRel === "合", earth: sixCombine(A.dayB, B.dayB), fullClash: gap === 6 || gap === 54,
    ab: usefulStrong(A, B), ba: usefulStrong(B, A),
    likeA: A.a.useful.includes(B.top), likeB: B.a.useful.includes(A.top),
    burdenA: A.a.avoid.includes(B.top), burdenB: B.a.avoid.includes(A.top),
    fill: fillsGap(A, B) || fillsGap(B, A),
    starA: spouseElements(A, neutral).includes(B.el), starB: spouseElements(B, neutral).includes(A.el),
    seenAB: seenIn(A, B), seenBA: seenIn(B, A),
    lonely: [A, B].map(X => LONELY.filter(s => X.own.has(s))),
    season: seasonOf(A.yearB) === seasonOf(B.yearB) && A.yearB !== B.yearB ? seasonOf(A.yearB) : null,
    nayin: { a: na, b: nb, rel: ea === eb ? "比" : GENERATES[ea] === eb || GENERATES[eb] === ea ? "生" : "剋" },
    gua: mingguaPair(A.gua.num, B.gua.num),
  };
}
const mainKind = rels => (rels && rels.length ? rels[0].kind : null);
const isTension = k => k === "相沖" || k === "相害" || k === "相刑";
const NEGATIVE = new Set(["相沖", "相害", "相刑", "相破", "自刑"]);

// ---------- 契合度 ----------
function scoreOf(A, B, F) {
  const parts = [];
  const add = (id, label, got, max, why) => parts.push({ id, label, got: Math.round(clamp(got, 0, max)), max, why });
  // 夫妻宮・日柱
  {
    const MAIN = { 六合: 22, 三合: 20, 同支: 17, 相沖: 8, 相害: 11, 相刑: 11, 相破: 13 };
    const k = mainKind(F.dayRel);
    let s = k ? MAIN[k] : 15;
    s -= F.dayRel.slice(1).filter(r => NEGATIVE.has(r.kind)).length;
    let why = k ? (k === "同支" ? tr("日支同為{b}", { b: A.dayB }) : tr("日支{pair}{k}", { pair: duo(F.dayRel[0].pair), k: k === "三合" ? "三合" : k })) : tr("日支沒有合沖");
    if (F.heaven && F.earth) { s = 25; why = tr("日柱天合地合"); }
    else if (F.fullClash) { s = Math.min(s, 6); why = tr("日柱天剋地沖"); }
    add("palace", tr("夫妻宮・日柱"), clamp(s, 4, 25), 25, why);
  }
  // 用神互補
  {
    let s = 12 + (F.ab ? 6.5 : 0) + (F.ba ? 6.5 : 0);
    for (const [X, Y, like, burden] of [[A, B, F.likeA, F.burdenA], [B, A, F.likeB, F.burdenB]]) {
      if (like && Y.top !== X.useful) s += 2;
      else if (burden) s -= 3.5;
    }
    const why = F.ab && F.ba ? tr("用神互補") : F.ab || F.ba ? tr("一方補到另一方的用神") : F.burdenA || F.burdenB ? tr("最旺的五行是對方所忌") : tr("沒有明顯的互補");
    add("useful", tr("用神互補"), clamp(s, 4, 25), 25, why);
  }
  // 配偶星
  {
    let s = F.starA && F.starB ? 15 : F.starA || F.starB ? 12 : 8;
    const word = F.neutral ? "伴侶星" : "配偶星";
    for (const X of [A, B]) {
      const sh = spouseElements(X, F.neutral).reduce((t, e) => t + X.share[e], 0);
      if (sh < 0.005) s -= 1;
      else if (sh < 0.15 && ((X === A && F.starA) || (X === B && F.starB))) s += 1;
    }
    add("star", trw(word), clamp(s, 4, 15), 15, F.starA && F.starB ? tr("互為{words}", { words: word }) : F.starA || F.starB ? tr("{words}相應", { words: word }) : tr("日干不在彼此的{word}上", { word }));
  }
  // 日干
  {
    const S = { 合: 10, 比: A.stem === B.stem ? 6 : 7, A生B: 8, B生A: 8, A剋B: 5, B剋A: 5 };
    const WHY = { 合: () => tr("日干{pair}相合", { pair: duo(A.stem + B.stem) }), 比: () => tr("日干同五行"), A生B: () => tr("日干相生"), B生A: () => tr("日干相生"), A剋B: () => tr("日干一方約束一方"), B剋A: () => tr("日干一方約束一方") };
    add("stem", tr("日干"), S[F.stemRel], 10, WHY[F.stemRel]());
  }
  // 生肖
  {
    const MAIN = { 六合: 10, 三合: 9, 同支: 7, 相沖: 2, 相害: 3, 相刑: 4, 相破: 5 };
    const k = mainKind(F.yearRel);
    let s = k ? MAIN[k] : F.season ? 7 : 6;
    s -= F.yearRel.slice(1).filter(r => NEGATIVE.has(r.kind)).length;
    const why = k ? (k === "同支" ? tr("同屬{z}", { z: ZODIAC[A.yearB] }) : tr("生肖{za}{zb}{k}", { za: ZODIAC[A.yearB], zb: ZODIAC[B.yearB], k: k === "三合" ? "三合" : k }))
      : F.season ? tr("同屬{season}三會", { season: F.season[1] }) : tr("生肖沒有合沖");
    add("zodiac", isEn() ? tr("生肖（契合度）") : "生肖", clamp(s, 1, 10), 10, why);
  }
  // 納音、命卦、神煞
  add("nayin", tr("年命納音"), { 生: 5, 比: 4, 剋: 2 }[F.nayin.rel], 5, { 生: () => tr("納音相生"), 比: () => tr("納音比和"), 剋: () => tr("納音相剋") }[F.nayin.rel]());
  add("gua", isEn() ? tr("命卦（契合度）") : "命卦", GUA_SCORE[F.gua], 5, { 5: () => tr("命卦{gua}", { gua: F.gua }), 4: () => tr("命卦伏位"), 3: () => tr("命卦屬於要多溝通的組合"), 1: () => tr("命卦屬於要多磨合的組合") }[GUA_SCORE[F.gua]]());
  {
    const seen = (F.seenAB.length ? 1 : 0) + (F.seenBA.length ? 1 : 0);
    const lonely = F.lonely[0].length + F.lonely[1].length;
    const s = 3 + seen - Math.min(2, lonely * 0.5);
    add("stars", tr("婚姻神煞"), clamp(Math.round(s), 1, 5), 5, seen ? tr("桃花紅鸞互見") : lonely ? tr("命帶孤辰寡宿等") : tr("沒有特別的神煞"));
  }
  return { total: parts.reduce((t, p) => t + p.got, 0), parts };
}

// ---------- 關係類型 ----------
const TYPES = {
  天生互補型: "先天的契合度高，又能補足彼此缺的東西；把這份默契用在日常的體貼上，就能走得長遠。",
  同頻知己型: "個性、步調和價值觀相近，相處像朋友一樣自在；兩人太像的時候，遇到都堅持的事要有人先讓一步。",
  互補成長型: "你們能補足彼此缺少的五行，個性和步調卻不太一樣；磨合的過程，會讓兩個人都變得更成熟。",
  火花吸引型: "彼此有很強的吸引力，一見面就有感覺；熱度高的關係，更需要用溝通和約定把感情穩下來。",
  細水長流型: "先天沒有太大的起伏，感情的溫度靠日常一點一滴累積，越久越有味道。",
  慢熱磨合型: "兩人的節奏和想法差異比較大，需要多一點時間了解彼此；差異說開了，反而會變成互補。",
};
function typeOf(F, score) {
  const p = Object.fromEntries(score.parts.map(x => [x.id, x.got / x.max]));
  const harmony = p.palace * 0.5 + p.zodiac * 0.25 + p.stem * 0.25;
  const complement = p.useful * 0.8 + (F.fill ? 0.2 : 0);
  const attraction = F.heaven || (F.seenAB.length > 0 && F.seenBA.length > 0) || (F.starA && F.starB && (F.seenAB.length > 0 || F.seenBA.length > 0));
  let id;
  if ((F.heaven && F.earth) || (harmony >= 0.72 && complement >= 0.62)) id = "天生互補型";
  else if (harmony >= 0.68 && complement < 0.62) id = "同頻知己型";
  else if (complement >= 0.62) id = "互補成長型";
  else if (harmony < 0.52) id = "慢熱磨合型";
  else if (attraction) id = "火花吸引型";
  else id = "細水長流型";
  return { id, label: tr(id), line: tr(TYPES[id]), harmony: Math.round(harmony * 100) / 100, complement: Math.round(complement * 100) / 100 };
}

// ---------- 個性與十神 ----------
// The group of 十神 that weighs most in a chart says how someone talks, spends and shares the work at home.
const TALK = {
  比劫: "有主見、講義氣，說話直來直往", 食傷: "表達力強、想到就說，喜歡分享", 財: "務實、重結論，習慣就事論事",
  官殺: "講道理、重原則，說話有分寸", 印: "體貼、想得多，需要時間消化情緒",
};
const TALK_TIP = {
  "比劫+比劫": "兩人都有主見，討論容易變成拔河；先說「我聽到你的意思是……」，再說自己的想法。",
  "比劫+食傷": "一個直、一個快，話說出口前先停三秒，就能少很多誤會。",
  "比劫+財": "一個重感覺、一個重結論，先聊感受，再談解決辦法。",
  "比劫+官殺": "一個想照自己的意思、一個重規矩，先講好共同的原則，其他各自發揮。",
  "比劫+印": "一個直接、一個敏感，說重話之前想想對方會不會受傷；被說的一方也把感受說出來。",
  "食傷+食傷": "兩人都愛說，記得也輪流當聽的那一個。",
  "食傷+財": "一個愛分享、一個重效率，先讓對方說完，再一起談結論。",
  "食傷+官殺": "一個想到就說、一個重分寸，什麼話在什麼場合說，先培養默契。",
  "食傷+印": "一個說得快、一個想得深：說的人放慢，想的人給一個回應的時間點。",
  "財+財": "兩人都務實，溝通很有效率；記得也聊聊心情，不只聊事情。",
  "財+官殺": "一個重結果、一個重規矩，尊重彼此的方式，分工就很順。",
  "財+印": "一個重實際、一個重感受，先照顧情緒，再談怎麼做。",
  "官殺+官殺": "兩人都講道理，吵架容易各說各話；先承認對方說得有道理的部分。",
  "官殺+印": "一個重原則、一個重感受，講道理之前，先給一個擁抱。",
  "印+印": "兩人都想得多、容易悶著，約好有事當天說開。",
};
const pairKey = (x, y) => [x, y].sort((p, q) => GROUPS.indexOf(p) - GROUPS.indexOf(q)).join("+");
const MONEY = {
  比劫: "花錢大方，常花在朋友和自己喜歡的事上", 食傷: "重視享受和體驗，願意為興趣花錢", 財: "精打細算、會理財，對數字敏感",
  官殺: "按計畫花錢，重視安穩和信用", 印: "保守、重安全感，習慣先存起來",
};
const SPENDER = new Set(["比劫", "食傷"]);
const CHORES = {
  比劫: "對外聯絡、跑腿和需要體力的事", 食傷: "下廚、布置和安排休閒", 財: "記帳、採買和理財",
  官殺: "規畫行程、處理文件和重要的決定", 印: "照顧家人、維持家裡的氣氛",
};
const PARENTING = {
  比劫: "像朋友一樣陪孩子", 食傷: "陪孩子玩、鼓勵孩子表達", 財: "重視孩子的實際能力和理財觀念",
  官殺: "重視規矩和責任感", 印: "細心照顧、給孩子安全感",
};

// ---------- 兩個人的感情樣貌 ----------
const LOVE_STYLE = {
  甲: "日主甲木像一棵大樹：可靠、有原則，喜歡當另一半的依靠，愛一個人會想給另一半安穩的未來；不太會說軟話，把關心說出口，另一半會更有感覺",
  乙: "日主乙木像柔軟的藤蔓：溫柔、體貼、適應力強，很會照顧另一半的情緒；在感情裡需要被肯定，也要記得說出自己想要什麼",
  丙: "日主丙火像太陽：熱情大方、行動派，喜歡就會直接表現；愛的時候全心全意，也要給另一半慢慢靠近的時間",
  丁: "日主丁火像燭光：細膩溫暖，用小地方的貼心默默照顧另一半；心思多、容易想太多，覺得委屈時要說出來",
  戊: "日主戊土像一座山：穩重、包容力大，是會陪另一半走很久的人；不太愛變化，記得偶爾製造一點驚喜",
  己: "日主己土像肥沃的田地：體貼、顧家，會經營日常的小幸福；容易把另一半的需要放在自己前面，也要照顧好自己的感受",
  庚: "日主庚金像一把劍：講義氣、重承諾、說到做到，會保護在乎的人；說話直接，吵架時記得語氣放軟一點",
  辛: "日主辛金像珠寶：細緻、有品味，重視感覺和儀式感；自尊心強，伴侶的一句讚美對你很重要",
  壬: "日主壬水像江河：聰明、自由、有想法，喜歡和伴侶一起看更大的世界；不喜歡被綁住，給彼此空間反而更靠近",
  癸: "日主癸水像雨露：溫柔敏感、直覺準，很會感受另一半的心情；需要安全感，被好好回應時最安心",
};
// How Y sees X, from the day masters.
function seenBy(X, Y, rel) {
  if (rel === "合") return `${Y.n}覺得和${X.n}特別有緣，很多想法一說就通`;
  if (rel === "比") return `在${Y.n}眼中，${X.n}像朋友、像夥伴，相處起來很自在`;
  if (rel === "X生Y") return `在${Y.n}眼中，${X.n}是會照顧人、讓人安心的那一個`;
  if (rel === "Y生X") return `在${Y.n}眼中，${X.n}是需要被呵護的人，${Y.n}很願意照顧${X.n}`;
  if (rel === "X剋Y") return `在${Y.n}眼中，${X.n}可靠、有主見，偶爾也有點強勢`;
  return `在${Y.n}眼中，${X.n}好相處、願意配合；記得也把自己的想法說出來`;
}
function loveOf(X, Y, F, neutral) {
  const lines = [end(LOVE_STYLE[X.stem])];
  const palaceEl = pillarOf(X.names[2]).branchEl, role = X.a.useful.includes(palaceEl) ? "good" : X.a.avoid.includes(palaceEl) ? "care" : "mid";
  lines.push({
    good: `夫妻宮（日支${X.dayB}${palaceEl}）是${X.n}的喜用：傳統上伴侶容易成為${X.n}的助力，在一起之後生活和心情都比較穩。`,
    care: `夫妻宮（日支${X.dayB}${palaceEl}）是${X.n}比較忌的五行：傳統上感情裡容易有壓力，遇到不舒服先說出來，兩個人一起調整步調就好。`,
    mid: `夫妻宮（日支${X.dayB}${palaceEl}）對${X.n}的喜忌影響不大，感情的樣子主要看兩人怎麼經營。`,
  }[role]);
  const els = spouseElements(X, neutral), sh = els.reduce((t, e) => t + X.share[e], 0), word = neutral ? "伴侶星" : "配偶星";
  if (sh < 0.005) lines.push(`${word}在${X.n}的命盤裡不明顯：感情上比較含蓄、慢熱，遇到對的人時記得主動一點。`);
  else if (sh >= STRONG) lines.push(`${word}在${X.n}的命盤裡有力：重視感情，也容易遇到心儀的對象。`);
  if (X.groups.比劫 >= 2 && X.share[CONTROLS[X.el]] < 0.15) lines.push(`${X.n}命盤裡比劫（代表朋友、同儕）的力量多：重朋友、講義氣，朋友圈和伴侶的時間要記得平衡。`);
  if (X.visible("傷官") && X.visible("正官")) lines.push(`${X.n}主見強、表達直接：適合能平等溝通的伴侶，相處時多留意語氣和決策的分工。`);
  if (X.visible("正官") && X.visible("七殺")) lines.push(`${X.n}對伴侶的期待比較多元：先弄清楚自己最重視的特質，選擇時會比較篤定。`);
  if (X.share[CONTROLS[X.el]] >= 0.35 && /弱/.test(X.a.strength)) lines.push(`伴侶對${X.n}的影響很大，記得維持自己的步調。`);
  if (X.own.has("桃花") || X.own.has("紅艷煞")) lines.push(`${X.n}命帶桃花：人緣好、有魅力；在穩定的關係裡，把這份魅力用在經營彼此。`);
  const lone = ["孤辰", "寡宿"].filter(s => X.own.has(s));
  if (lone.length) lines.push(`${X.n}命帶${lone.join("、")}：重視獨立和個人空間，主動告訴另一半什麼時候需要陪伴、什麼時候需要獨處。`);
  else if (X.own.has("華蓋")) lines.push(`${X.n}命帶華蓋：有自己的精神世界，需要一點安靜獨處的時間。`);
  if (X.dayStars.has("魁罡")) lines.push(`${X.n}的日柱是魁罡：個性剛強、有魄力，在感情裡也習慣作主；留一點空間讓另一半表達，兩個人會更有默契。`);
  if (X.dayStars.has("陰差陽錯")) lines.push(`${X.n}的日柱是陰差陽錯：傳統上提醒和另一半家人的相處需要多一點時間，先建立兩人的共識，再談和家庭之間的界線。`);
  if (X.dayStars.has("孤鸞煞")) lines.push(`${X.n}的日柱是孤鸞：傳統上提醒多花一點心思經營感情，把在乎說出口就好。`);
  const rel = F.stemRel === "合" || F.stemRel === "比" ? F.stemRel : F.stemRel.replace(/A|B/g, m => (m === (X === F.A ? "A" : "B") ? "X" : "Y"));
  return { who: X.n, lines, seen: end(seenBy(X, Y, rel)) };
}

// ---------- 六大面向 ----------
const bandOf = v => (v >= 70 ? "high" : v >= 50 ? "mid" : "low");
// When nothing stands out, what each part rests on.
const PLAIN = {
  personality: "相處的重點在日常的體貼和尊重，彼此的長處就會慢慢顯現。",
  talk: "溝通的默契靠多聊、多問，慢慢累積。",
  romance: "感情的溫度靠日常經營，小小的用心最能累積甜蜜。",
  family: "和長輩的關係看平常的往來，多參加彼此的家庭聚會，就會越來越熟。",
  money: "先約好共同的目標，理財就會很順。",
  future: "按部就班規畫，遇到大事一起商量。",
};
const TRY = {
  personality: { high: "這週一起完成一件小事（煮一頓飯、規畫一趟小旅行），各自負責自己擅長的部分。", mid: "各寫下對方的三個優點，交換來看。", low: "這週找一個晚上，各說一件「我希望你多懂我一點」的事，只聽不辯。" },
  talk: { high: "睡前花十分鐘，聊聊今天最開心的一件事。", mid: "有不舒服的事當天說開，用「我覺得……」開頭，不用「你總是……」。", low: "約好吵架時的暫停暗號：喊暫停就先各自冷靜二十分鐘，再回來談。" },
  romance: { high: "挑一天重溫第一次約會的地方。", mid: "每週安排一次只屬於兩人的約會，那段時間不滑手機。", low: "每天一句謝謝或一個擁抱，小事累積的溫度最實在。" },
  family: { high: "找個假日，一起回兩邊的家吃頓飯。", mid: "先和另一半聊聊自己家的習慣和地雷，見長輩時互相提醒。", low: "遇到長輩的意見，先兩人有共識，再由各自那一方的家人溝通。" },
  money: { high: "一起訂一個存錢的目標（旅行、買房基金），每月檢視一次。", mid: "開一個共同帳戶付生活費，其餘各自管理。", low: "約好一個金額，超過的支出先商量再決定。" },
  future: { high: "把兩人都順的年份寫進行事曆，一起規畫大事。", mid: "每年年初一起聊聊各自今年的目標。", low: "壓力大的年份，約好每週固定一段時間關心彼此的近況。" },
};
function dimsOf(A, B, F, score, years) {
  const P = Object.fromEntries(score.parts.map(x => [x.id, x.got / x.max]));
  const dk = mainKind(F.dayRel), yk = mainKind(F.yearRel), mk = mainKind(F.monthRel);
  const out = [];
  const dim = (id, label, value, strengths, watches) => {
    const v = Math.round(clamp(value, 25, 96));
    out.push({ id, label, value: v, strength: strengths.find(Boolean) || PLAIN[id], watch: watches.find(Boolean) || "沒有特別要擔心的地方，維持現在的相處方式就好。", try: TRY[id][bandOf(v)] });
  };
  // 個性互補
  dim("personality", "個性互補", 100 * (P.stem * 0.35 + P.useful * 0.45 + (F.fill ? 0.2 : 0.1)), [
    F.ab && F.ba ? "你們各自帶著對方需要的五行，個性上能補彼此的不足。" : null,
    F.heaven ? "日干相合：個性雖然不同，卻很能互相吸引。" : null,
    F.stemRel === "A生B" || F.stemRel === "B生A" ? "日干相生：一個人很會照顧另一個人，相處很溫暖。" : null,
    F.fill ? "一方缺的五行，另一方剛好有，在一起時能帶出彼此少見的一面。" : null,
    F.ab || F.ba ? "一方的命盤補得到另一方的用神，相處起來能互相加分。" : null,
    F.stemRel === "比" ? "個性相近，很多想法不用解釋。" : null,
  ], [
    F.burdenA && F.burdenB ? "兩人命盤最旺的五行，剛好都是另一方比較忌的，步調不同時容易覺得有壓力。" : null,
    F.burdenA || F.burdenB ? "一方最旺的五行是另一方比較忌的，步調不同時，另一方容易覺得有壓力。" : null,
    F.stemRel === "A剋B" || F.stemRel === "B剋A" ? "一方比較有主見，另一方容易把意見收起來。" : null,
    F.stemRel === "比" ? "兩人太像，遇到都堅持的事，要有人先讓一步。" : null,
  ]);
  // 溝通默契
  const pair = pairKey(A.main, B.main);
  const clashGroups = pair === "比劫+比劫" || pair === "官殺+官殺" || pair === "比劫+官殺";
  const easyGroups = pair === "財+官殺" || pair === "財+財" || pair === "食傷+財";
  dim("talk", "溝通默契", 60 + (F.heaven ? 15 : 0) + (dk === "六合" || dk === "三合" ? 10 : 0) + (yk === "六合" || yk === "三合" ? 5 : 0)
    - (dk === "相害" || dk === "相刑" ? 10 : 0) - (dk === "相沖" ? 8 : 0) - (yk === "相害" || yk === "相刑" ? 5 : 0) + (easyGroups ? 5 : 0) - (clashGroups ? 5 : 0), [
    F.heaven ? "日干相合：心意容易相通，很多事一個眼神就懂。" : null,
    dk === "六合" || dk === "三合" ? "夫妻宮相合：生活上有默契，喜歡一起做的事多。" : null,
    yk === "六合" || yk === "三合" ? "生肖相合：兩人投緣，說話容易對頻。" : null,
    easyGroups ? "兩人都講求實際，溝通很有效率。" : null,
    A.main === "食傷" || B.main === "食傷" ? `${A.main === "食傷" ? A.n : B.n}很會表達、能把話說開，溝通不容易卡住。` : null,
    A.main === "印" || B.main === "印" ? `${A.main === "印" ? A.n : B.n}很會傾聽、體貼另一半的感受。` : null,
  ], [
    dk === "相害" || yk === "相害" ? "小誤會容易悶在心裡、慢慢累積。" : null,
    dk === "相刑" || yk === "相刑" ? "熟了以後說話容易太直接、互相要求。" : null,
    dk === "相沖" ? "生活節奏不同，想好好聊的時間點常常對不上。" : null,
    clashGroups ? "兩人都有主見，討論容易變成辯論。" : null,
  ]);
  // 感情甜蜜
  const seen = [...F.seenAB, ...F.seenBA];
  dim("romance", "感情甜蜜", 55 + (F.starA && F.starB ? 15 : F.starA || F.starB ? 8 : 0) + (seen.some(x => x.star === "桃花") ? 8 : 0)
    + (seen.some(x => x.star !== "桃花") ? 6 : 0) + (F.heaven ? 8 : 0) + (F.earth ? 8 : 0) - (dk === "相沖" ? 8 : 0) - 3 * (F.lonely[0].length + F.lonely[1].length), [
    F.starA && F.starB ? `兩人互為${F.neutral ? "伴侶星" : "配偶星"}，傳統上是很有緣分的組合。` : null,
    seen.find(x => x.star === "紅鸞" || x.star === "天喜") ? `${seen.find(x => x.star === "紅鸞" || x.star === "天喜").star}互見：傳統上主姻緣和喜事。` : null,
    seen.some(x => x.star === "桃花") ? "桃花互見：彼此身上帶著對方的桃花，吸引力強。" : null,
    F.heaven ? "日干相合：一見如故。" : null,
    F.earth ? "夫妻宮相合：越相處越像家人。" : null,
    F.starA || F.starB ? `一方的日干正是另一方的${F.neutral ? "伴侶星" : "配偶星"}，傳統上視為有緣。` : null,
    A.own.has("桃花") || B.own.has("桃花") ? `${A.own.has("桃花") ? A.n : B.n}命帶桃花，懂得讓感情保持新鮮。` : null,
    F.stemRel === "A生B" || F.stemRel === "B生A" ? `${F.stemRel === "A生B" ? A.n : B.n}很會照顧人，相處時常常感到被疼愛。` : null,
  ], [
    dk === "相沖" ? "作息和生活習慣不同，兩人的相處時間容易兜不攏。" : null,
    F.lonely[0].length || F.lonely[1].length ? "有一方比較需要獨處，記得說清楚什麼時候需要陪伴。" : null,
    "熱情需要經營，別讓日子只剩下例行公事。",
  ]);
  // 家庭長輩
  dim("family", "家庭長輩", 60 + (yk === "六合" || yk === "三合" ? 12 : 0) - (yk === "相沖" ? 12 : 0) - (yk === "相害" || yk === "相刑" ? 8 : 0)
    + (mk === "六合" || mk === "三合" ? 6 : 0) - (mk === "相沖" ? 6 : 0) - 4 * [A, B].filter(X => X.dayStars.has("陰差陽錯")).length + (F.nayin.rel === "生" ? 4 : 0), [
    yk === "六合" || yk === "三合" ? "生肖相合：傳統上兩家人的往來比較融洽。" : null,
    mk === "六合" || mk === "三合" ? "月柱（父母宮）相合：和彼此的父母容易處得來。" : null,
    F.nayin.rel === "生" ? "年命納音相生：傳統上視為兩家的背景能互相扶持。" : null,
  ], [
    yk === "相沖" ? "生肖相沖：兩家的生活習慣或觀念可能不太一樣。" : null,
    yk === "相害" || yk === "相刑" ? "兩家往來時容易因為小事誤會。" : null,
    mk === "相沖" ? "月柱（父母宮）相沖：和對方父母的相處需要多一點時間。" : null,
    [A, B].some(X => X.dayStars.has("陰差陽錯")) ? "傳統上提醒和對方家人的相處需要多一點耐心。" : null,
  ]);
  // 金錢事業
  const robs = [A, B].some(X => X.groups.比劫 >= 2 && X.share[CONTROLS[X.el]] < 0.15);
  const spenders = [A, B].filter(X => SPENDER.has(X.main)).length;
  dim("money", "金錢事業", 60 + (P.useful - 0.5) * 40 - (robs ? 6 : 0) + (spenders === 1 ? 3 : 0) - (spenders === 2 ? 4 : 0) + (A.main === "財" && B.main === "財" ? 5 : 0), [
    (F.likeA || F.ab) && (F.likeB || F.ba) ? "兩人的五行對彼此都有幫助，傳統上是能「互旺」的組合。"
      : F.likeA || F.ab ? `${B.n}的五行對${A.n}有幫助，傳統上說${B.n}能「旺」${A.n}。`
        : F.likeB || F.ba ? `${A.n}的五行對${B.n}有幫助，傳統上說${A.n}能「旺」${B.n}。` : null,
    spenders === 1 ? "一個會存、一個會享受，分工得好就是互補。" : null,
    spenders === 0 ? "兩人都務實、會規畫，存錢不成問題。" : null,
  ], [
    robs ? "有一方重朋友、花錢大方，借錢和合夥前先和另一半商量。" : null,
    F.burdenA || F.burdenB ? "事業上的步調不同：一個想衝、一個想穩。" : null,
    spenders === 2 ? "兩人都比較捨得花，記得先存再花。" : null,
  ]);
  // 未來同步
  const good = years.filter(y => y.state === "good").length, mid = years.filter(y => y.state === "mid").length, n = years.length || 1;
  const both = years.filter(y => y.wed).map(y => y.year), care = years.filter(y => y.state === "care").map(y => y.year);
  dim("future", "未來同步", 100 * (good + mid * 0.6 + (n - good - mid) * 0.25) / n, [
    both.length ? `未來十年有兩人都婚緣較旺的年份（${both.slice(0, 3).join("、")} 年）。` : null,
    good >= 3 ? `未來十年有 ${good} 年，兩人的感情運都順。` : null,
  ], [
    care.length ? `${care.slice(0, 3).join("、")} 年有一方的運勢比較緊，要多體諒彼此。` : null,
    !both.length ? "兩人婚緣旺的年份不太同步，規畫大事時多參考彼此的時機。" : null,
  ]);
  return out;
}

// ---------- 傳統合婚九項 ----------
function checksOf(A, B, F, pr) {
  const sec = id => pr.sections.find(s => s.id === id);
  const verdictOf = (good, care) => (good ? VERDICT.good : care ? VERDICT.care : VERDICT.mid);
  const out = [];
  const add = (id, title, level, verdict, paragraphs, items = []) => out.push({ id, title, level, verdict, paragraphs, items });
  const dk = mainKind(F.dayRel), yk = mainKind(F.yearRel);

  const palace = sec("palace");
  const full = F.fullClash ? ["兩人的日柱天干相剋、地支相沖，稱為天剋地沖，傳統上視為差異最大的組合：個性和生活節奏很不一樣，差異也能是互補，重點在溝通方式。"] : [];
  add("palace", "夫妻宮（日支）", LEVEL.main, verdictOf(dk === "六合" || dk === "三合" || (F.heaven && F.earth), isTension(dk)), [...palace.paragraphs, ...full], palace.items);
  const useful = sec("useful");
  add("useful", "用神互補", LEVEL.main, verdictOf(F.ab || F.ba, (F.burdenA || F.burdenB) && !F.likeA && !F.likeB), useful.paragraphs, useful.items);
  const star = sec("star");
  add("star", F.neutral ? "伴侶星" : "配偶星", LEVEL.main, verdictOf(F.starA || F.starB, false), star.paragraphs, star.items);
  const day = sec("day");
  add("day", "日干與天合地合", LEVEL.aux, verdictOf(F.heaven || F.stemRel === "A生B" || F.stemRel === "B生A", false), day.paragraphs, day.items);
  const elements = sec("elements");
  add("elements", "五行互補", LEVEL.aux, verdictOf(!!elements, false), elements ? elements.paragraphs : ["兩人沒有明顯「一方缺、另一方剛好很多」的五行，五行互補主要看上面的用神。"]);
  // 婚姻神煞
  {
    const lines = [];
    const said = (X, Y, list) => {
      if (!list.length) return;
      const by = uniq(list.map(x => x.star)).map(s => `${s}（${uniq(list.filter(x => x.star === s).map(x => x.role)).join("、")}）`).join("、");
      lines.push(`${Y.n}的命盤帶著${X.n}的${by}：傳統上${list.some(x => x.star !== "桃花") ? "紅鸞、天喜主姻緣和喜事，" : ""}${list.some(x => x.star === "桃花") ? "桃花主吸引力，" : ""}代表${X.n}容易被${Y.n}吸引。`);
    };
    said(A, B, F.seenAB); said(B, A, F.seenBA);
    if (!lines.length) lines.push("兩人的命盤沒有互見桃花、紅鸞、天喜，這很常見；感情的熱度主要看日常怎麼經營。");
    for (const [X, list] of [[A, F.lonely[0]], [B, F.lonely[1]]]) {
      if (!list.length) continue;
      const lone = list.filter(s => s === "孤辰" || s === "寡宿");
      if (lone.length) lines.push(`${X.n}命帶${lone.join("、")}：傳統上看作重視獨立和個人空間，主動告訴另一半什麼時候需要陪伴就好。`);
      if (list.includes("陰差陽錯")) lines.push(`${X.n}的日柱是陰差陽錯：傳統上提醒和另一半家人的相處需要多一點時間。`);
      if (list.includes("孤鸞煞")) lines.push(`${X.n}的日柱是孤鸞：傳統上提醒多花一點心思經營感情。`);
    }
    lines.push("神煞是輔助的參考，看的是傾向，不是注定。");
    add("stars", "婚姻神煞", LEVEL.aux, verdictOf(F.seenAB.length || F.seenBA.length, false), [lines.join("")]);
  }
  // 生肖（加上三會）
  const zodiac = sec("zodiac");
  const season = F.season && !yk ? [`另外，${ZODIAC[A.yearB]}和${ZODIAC[B.yearB]}同屬${F.season[1]}的三會（${F.season[0]}），傳統上視為氣味相近。`] : [];
  add("zodiac", "生肖", LEVEL.folk, verdictOf(yk === "六合" || yk === "三合" || !!season.length, isTension(yk)), [...zodiac.paragraphs, ...season, "生肖只看出生年，在合婚裡是比較次要的參考。"]);
  const nayin = sec("nayin");
  add("nayin", "年命納音", LEVEL.folk, verdictOf(F.nayin.rel !== "剋", false), nayin.paragraphs);
  // 命卦
  add("gua", "命卦（呂才合婚）", LEVEL.folk, verdictOf(GUA_SCORE[F.gua] === 5, GUA_SCORE[F.gua] === 1), [
    `依出生年（以立春換年）和性別，${A.n}的命卦是${A.gua.name}卦（${A.gua.group}），${B.n}是${B.gua.name}卦（${B.gua.group}），配起來是「${F.gua}」。${GUA_TEXT[F.gua]}。`
      + "命卦只看出生年和性別，明代的《神峰通考》就批評過這個方法，現在多半只當參考。",
  ]);
  return out;
}

// ---------- 相處說明書 ----------
function guideOf(A, B, F) {
  const out = [];
  out.push({ id: "talk", title: "溝通，和吵架後怎麼和好", text: `${A.n}${TALK[A.main]}；${B.n}${TALK[B.main]}。${TALK_TIP[pairKey(A.main, B.main)]}${
    mainKind(F.dayRel) === "相沖" ? "夫妻宮相沖的兩人作息不同，重要的話挑兩人都有空、都不累的時候說。" : mainKind(F.dayRel) === "相害" ? "夫妻宮相害，最怕悶著不說，不舒服的事當天說開。" : ""}` });
  const [sa, sb] = [A, B].map(X => SPENDER.has(X.main));
  const saver = !sa ? A : B, spender = sa ? A : B;
  const moneyTip = sa !== sb ? `一個會存、一個會享受：存款和投資交給${saver.n}，生活的樂趣交給${spender.n}來規畫，大筆支出先商量。`
    : sa ? "兩人都比較捨得花：先約好每月固定存一筆，剩下的再自由運用。" : "存錢不成問題：記得也留一筆一起享受生活的預算。";
  const robs = [A, B].filter(X => X.groups.比劫 >= 2 && X.share[CONTROLS[X.el]] < 0.15).map(X => X.n);
  out.push({ id: "money", title: "金錢觀和理財分工", text: `${A.n}${MONEY[A.main]}；${B.n}${MONEY[B.main]}。${moneyTip}${robs.length ? `${robs.join("和")}重朋友、講義氣，借錢給朋友或合夥之前，先和另一半商量。` : ""}` });
  const lead = F.stemRel === "A剋B" ? `${A.n}比較習慣拿主意，大事記得先問${B.n}的想法。` : F.stemRel === "B剋A" ? `${B.n}比較習慣拿主意，大事記得先問${A.n}的想法。`
    : F.stemRel === "A生B" ? `${A.n}比較會照顧人，別讓家務都落在${A.n}身上。` : F.stemRel === "B生A" ? `${B.n}比較會照顧人，別讓家務都落在${B.n}身上。` : "兩人地位相當，大事一起決定。";
  out.push({ id: "home", title: "家務和決策", text: `${lead}依兩人的個性，${A.n}適合負責${CHORES[A.main]}${A.main === B.main ? `，${B.n}也一樣，可以輪流` : `，${B.n}適合負責${CHORES[B.main]}`}。` });
  const yk = mainKind(F.yearRel), mk = mainKind(F.monthRel);
  const fam = [];
  if (yk === "六合" || yk === "三合") fam.push("生肖相合，傳統上兩家人往來融洽。");
  else if (yk === "相沖") fam.push("生肖相沖，兩家的生活習慣或觀念可能不太一樣，多認識彼此的家人會有幫助。");
  else if (yk === "相害" || yk === "相刑" || yk === "相破") fam.push("兩家往來時容易因小事誤會，有事由自己家的那一方先溝通。");
  if (mk === "六合" || mk === "三合") fam.push("月柱（父母宮）相合，和對方的父母容易處得來。");
  else if (mk === "相沖") fam.push("月柱（父母宮）相沖，和對方父母的生活習慣不同，見面時多一點耐心。");
  for (const X of [A, B]) if (X.groups.印 >= 2) fam.push(`${X.n}很重視家人，節日和家庭聚會對${X.n}很重要。`);
  fam.push("遇到長輩的意見，先兩人有共識，再由各自那一方的家人溝通。");
  out.push({ id: "family", title: "雙方家人和長輩", text: fam.join("") });
  const hk = F.hourRel ? mainKind(F.hourRel) : undefined;
  const noHour = [A, B].filter(X => !X.hourB).map(X => X.n);
  const kids = F.hourRel === null ? `${noHour.length === 2 ? "兩人的時辰都" : `${noHour[0]}的時辰`}不詳，子女宮（時柱）先不看。`
    : hk === "六合" || hk === "三合" ? "子女宮（時柱）相合，對孩子的期待和教養方式容易一致。"
      : hk === "相沖" ? "子女宮（時柱）相沖，教養觀可能不同，先討論好原則，在孩子面前意見一致。"
        : "子女宮（時柱）沒有明顯的合沖，教養方式可以邊走邊調整。";
  out.push({ id: "kids", title: "子女與教養", text: `${kids}${A.n}${PARENTING[A.main]}，${B.n}${A.main === B.main ? "也是" : PARENTING[B.main]}。要不要生、什麼時候生，是兩個人一起的選擇；這裡只談教養的風格。` });
  return out;
}

// ---------- 未來十年 ----------
const flowOf = name => pillarOf(name);
function yearSignals(X, flow, neutral, age) {
  const p = flowOf(flow), stars = luckStars(X.ctx, flow), els = spouseElements(X, neutral);
  const wed = [];
  if (stars.includes("紅鸞")) wed.push("紅鸞星動");
  if (stars.includes("天喜")) wed.push("天喜星到");
  if (sixCombine(p.branch, X.dayB)) wed.push("流年合夫妻宮");
  if (els.some(e => (e === p.stemEl || e === p.branchEl) && X.a.useful.includes(e))) wed.push(`${neutral ? "伴侶星" : "配偶星"}到位`);
  const y = age >= 0 ? yearReading(X.chart, X.a, age) : null;
  return {
    wed: age >= 18 ? wed : [], peach: stars.includes("桃花"), clashPalace: clash(p.branch, X.dayB),
    tone: y ? y.favor.tone : "平", love: y && y.domains.love ? y.domains.love.level : 0,
  };
}
function yearsOf(A, B, now, neutral) {
  const out = [];
  for (let k = 0; k < 10; k++) {
    const year = now + k, flow = yearPillar(year), ages = [year - A.by, year - B.by];
    if (ages[0] < 0 || ages[1] < 0) continue;
    const [sa, sb] = [yearSignals(A, flow, neutral, ages[0]), yearSignals(B, flow, neutral, ages[1])];
    const wed = sa.wed.length > 0 && sb.wed.length > 0;
    const care = sa.clashPalace || sb.clashPalace || Math.min(sa.love, sb.love) <= -2 || (sa.tone === "凶" && sb.tone === "凶");
    const good = wed || sa.love + sb.love >= 2 || (sa.tone === "吉" && sb.tone === "吉");
    const state = wed ? "good" : care ? "care" : good ? "good" : "mid";
    const goods = [], watches = [];
    for (const [X, s] of [[A, sa], [B, sb]]) {
      if (s.wed.length) goods.push(`${X.n}${s.wed[0]}`);
      else if (s.tone === "吉") goods.push(`${X.n}運勢順，能多照顧另一半`);
      else if (s.peach) goods.push(`${X.n}人緣好、魅力強`);
      if (s.clashPalace) watches.push(`${X.n}的夫妻宮逢沖，生活節奏容易變動，重要的事一起商量`);
      else if (s.love <= -2) watches.push(`${X.n}在感情上容易有摩擦，多一點耐心`);
      else if (s.tone === "凶") watches.push(`${X.n}運勢宜守，壓力大時記得說出來`);
    }
    const goodText = wed ? `${goods.join("，")}：兩人的婚緣都旺，適合談婚事、規畫未來。` : goods.length ? `${goods.join("；")}。` : "感情平穩，適合一起規畫生活。";
    const watchText = watches.length ? `${watches.join("；")}。` : "沒有特別要擔心的地方，維持日常的關心就好。";
    out.push({ year, pillar: flow, ages, tones: [sa.tone, sb.tone], state, wed, wedEach: [sa.wed, sb.wed], good: goodText, watch: watchText });
  }
  return out;
}
function wedOf(A, B, years, neutral) {
  const both = years.filter(y => y.wed).map(y => y.year);
  const each = [0, 1].map(i => years.filter(y => y.wedEach[i].length).map(y => y.year));
  let text;
  if (both.length) {
    const y = years.find(x => x.wed);
    text = `${both.join("、")} 年兩人都婚緣較旺。以 ${y.year} 年為例，${A.n}${y.wedEach[0].join("、")}，${B.n}${y.wedEach[1].join("、")}。`;
  } else if (each[0].length || each[1].length) {
    text = `未來十年兩人婚緣旺的年份不同步：${A.n}是 ${each[0].join("、") || "沒有特別的年份"}${each[0].length ? " 年" : ""}，${B.n}是 ${each[1].join("、") || "沒有特別的年份"}${each[1].length ? " 年" : ""}。可以挑其中一人的年份，再搭配下面的結婚月份。`;
  } else text = "未來十年沒有特別突出的婚緣年份，哪一年結婚都可以，挑兩人都方便的時候就好。";
  return { both, each, text: `${text}婚緣年份看的是紅鸞、天喜、流年合夫妻宮和${neutral ? "伴侶星" : "配偶星"}到位，是傳統擇年的參考。` };
}
function monthsOf(A, B, neutral) {
  const women = [A, B].filter(X => X.sex === "female");
  const name = m => MONTH_NAME[m];
  if (!women.length) return { women: [], text: "傳統的行嫁月只看女方的出生年，這裡不適用；可以直接參考農民曆上「宜嫁娶」的日子。" };
  const list = women.map(X => ({ who: X.n, ...marriageMonths(X.yearB) }));
  const say = w => `${w.who}（屬${ZODIAC[[A, B].find(X => X.n === w.who).yearB]}）的大利月是${w.best.map(name).join("、")}，小利月是${w.second.map(name).join("、")}`;
  let text = `${list.map(say).join("；")}。`;
  if (list.length === 2) {
    const common = list[0].best.filter(m => list[1].best.includes(m));
    text += common.length ? `兩位共同的大利月是${common.map(name).join("、")}。` : "兩位的大利月不同，可以各挑一個大利月或小利月，兩人商量就好。";
  } else if (!neutral) text = `傳統的行嫁月看女方的出生年：${text}`;
  return { women: list, text: `${text}月份以節氣月（立春起算）為準，和農曆月份在月初、月底可能差幾天；其他月份不是不好，只是傳統擇月比較少選，和婚姻好壞沒有直接關係。` };
}

// ---------- 一起開運、年齡差 ----------
const HOME = {
  木: "家裡多放綠色植物", 火: "用溫暖的燈光和暖色系的布置", 土: "用陶瓷和木質家具，家裡保持整齊",
  金: "用簡潔的白色或金屬感家具，東西少一點、收得整齊", 水: "用藍色、深色系的布置，保持通風",
};
function luckOf(A, B) {
  const shared = A.a.useful.filter(e => B.a.useful.includes(e));
  if (shared.length) {
    const e = shared[0], L = ELEMENT_LUCK[e];
    return { elements: shared, text: `兩人的喜用都有${shared.join("、")}：${TOGETHER[e]}；家裡${HOME[e]}，多用${L.colors.join("、")}色；一起出遊時，往${L.direction}走走。不需要買任何開運物品，兩個人一起做這些事，本身就是在經營感情。` };
  }
  const withUseful = [A, B].filter(X => X.useful);
  const parts = withUseful.map(X => `${X.n}的用神是${X.useful}（${ELEMENT_LUCK[X.useful].colors.join("、")}色，${ELEMENT_LUCK[X.useful].direction}）`);
  const plan = withUseful.length === 2 ? `可以輪流安排：這次${TOGETHER[A.useful]}，下次換成${TOGETHER[B.useful]}。`
    : withUseful.length === 1 ? `約會時可以多安排${TOGETHER[withUseful[0].useful]}。` : "";
  return { elements: withUseful.map(X => X.useful), text: `兩人的喜用不太一樣${parts.length ? `：${parts.join("；")}` : ""}。${plan}家裡各留一個照自己喜好布置的角落。不需要買任何開運物品，一起做這些事，本身就是在經營感情。` };
}
function ageOf(A, B, neutral) {
  const d = Math.abs(A.by - B.by);
  const woman = !neutral ? [A, B].find(X => X.sex === "female") : null, man = !neutral ? [A, B].find(X => X.sex !== "female") : null;
  const wifeOlder = woman && man ? man.by - woman.by : 0;
  if (d === 0) return "同一年出生：成長的時代背景相同，很多話題不用解釋，回憶也特別有共鳴。";
  if (wifeOlder === 3) return "女大三，抱金磚：傳統上說妻子比丈夫大三歲，丈夫有福氣。台語也說「某大姊，坐金交椅」，娶年紀較長的太太，先生像坐金交椅一樣享福。";
  if (wifeOlder > 0) return `相差 ${d} 歲，${woman.n}比較年長。台語說「某大姊，坐金交椅」：娶年紀較長的太太，先生像坐金交椅一樣享福。`;
  if (d === 6) return "相差六歲：民間說差六歲生肖相沖，其實相差六歲不代表不合，重點在兩人的個性和相處。";
  if (d === 3 || d === 9) return `相差 ${d} 歲：民間有「差三、六、九歲不好」的說法，卻也有「女大三，抱金磚」，兩種說法互相矛盾，可見年齡俗語不是一套一致的規則，聽聽就好。`;
  if (d === 4 || d === 8) return `相差 ${d} 歲：相差四歲或八歲的兩個人，生肖一定是三合，傳統上視為好組合。`;
  if (d % 12 === 0) return `相差 ${d} 歲，剛好${d === 12 ? "一輪" : `${d / 12} 輪`}、同生肖：步調相近，年長的一方又多一份照顧。`;
  return `相差 ${d} 歲：年齡差多少不是重點，彼此的生活節奏和價值觀才是。`;
}

// ---------- 主程式 ----------
const ORDER = ["palace", "useful", "star", "day", "elements", "zodiac", "nayin"];
export function hehunReading({ a, b, now }) {
  let an = typeof a.name === "string" && a.name.trim() ? a.name.trim() : null, bn = typeof b.name === "string" && b.name.trim() ? b.name.trim() : null;
  if (an && an === bn) an = bn = null;
  const A = personOf(a, an || "你"), B = personOf(b, bn || "對方");
  const neutral = A.sex === B.sex;
  const F = { ...factsOf(A, B, neutral), neutral, A, B };
  const pr = partnerReading({ me: { pillars: A.names, analysis: A.a, sex: A.sex, name: an || "" }, partner: { pillars: B.names, analysis: B.a, sex: B.sex, name: bn || "" }, order: ORDER });
  const score = scoreOf(A, B, F), type = typeOf(F, score);
  const years = yearsOf(A, B, now, neutral);
  // Three chips for the top card: the good ones first, at most one tension, then quiet ones. A 命卦 name shows only
  // when it is a kind one (延年、生氣、天醫、伏位); the parts of the score fill in last.
  const chips = [...pr.chips];
  if (F.seenAB.length && F.seenBA.length) chips.push({ text: "桃花紅鸞互見", kind: "good" });
  if (GUA_SCORE[F.gua] >= 4) chips.push({ text: `命卦${F.gua}`, kind: GUA_SCORE[F.gua] === 5 ? "good" : "mid" });
  if (F.nayin.rel !== "剋") chips.push({ text: F.nayin.rel === "生" ? "納音相生" : "納音比和", kind: F.nayin.rel === "生" ? "good" : "mid" });
  for (const p of score.parts.slice().sort((x, y) => y.got / y.max - x.got / x.max)) chips.push({ text: p.why, kind: p.got / p.max >= 0.7 ? "good" : "mid", spare: true });
  const seen = new Set(), list = chips.filter(c => !seen.has(c.text) && seen.add(c.text));
  const good = list.filter(c => c.kind === "good" && !c.spare), care = list.filter(c => c.kind === "care");
  const hero = [...good.slice(0, care.length ? 2 : 3), ...care.slice(0, 1)];
  for (const c of list) if (hero.length < 3 && !hero.includes(c)) hero.push(c);
  const person = X => ({ n: X.n, sex: X.sex, pillars: X.names, zodiac: ZODIAC[X.yearB], stem: X.stem, element: X.el, solarYear: X.solar, gua: X.gua });
  return {
    people: [person(A), person(B)], neutral, score, type, chips: hero.map(({ text, kind }) => ({ text, kind })), summary: pr.summary, advice: pr.advice, tone: pr.tone, net: pr.net,
    dims: dimsOf(A, B, F, score, years),
    checks: checksOf(A, B, F, pr),
    loves: [loveOf(A, B, F, neutral), loveOf(B, A, F, neutral)],
    guide: guideOf(A, B, F),
    years: years.map(({ wedEach, ...y }) => y),
    wed: wedOf(A, B, years, neutral),
    months: monthsOf(A, B, neutral),
    luck: luckOf(A, B),
    age: ageOf(A, B, neutral),
  };
}
