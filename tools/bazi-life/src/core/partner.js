// 伴侶合盤（合婚）：兩個人的八字放在一起，照台灣合婚常看的幾點寫成一份解讀。
//
// partnerReading({ me, partner }) →
//   {
//     net, tone,              exactly relate(me, partner).net and .tone (core/family.js)
//     title: "伴侶合盤",
//     summary,                2–3 sentences: the overall picture (需要磨合 leads with the tensions, then 好在…), then
//                             once that this is the traditional view
//     highlights: [string],   2–5 chips (「天合地合」「生肖六合」「日支相沖」…), the weightiest first
//     sections: [{ id, title, paragraphs: [string], items: [{ label, text }] }]   in the order of SECTION_IDS; 五行互補
//                             only when one chart has two or more of an element the other lacks (and does not dislike)
//     advice: [string],       2–4 practical suggestions for getting along
//     chips: [{ text, kind }],  the highlights with "good", "care" or "mid" (a quiet one such as 生肖無刑沖)
//   }
//   me, partner: { pillars: [names], analysis: analyse(pillars), sex: "male" | "female", name?: string }
//   Pillars are 60-cycle names, year first; without a birth time there are three.
//   order: section ids in the order they are shown (the 合婚 tab leads with 夫妻宮); glosses follow that order.
//
// Two people of the same sex get the neutral reading of the 配偶星: both 財 and 官殺, called 伴侶星, since the
// traditional rule reads a man's and a woman's star differently.
//
// The score is relate(): the simulation tilts partner events by 0.15 × net, so this reading explains that score and
// never re-scores it. What relate() counts (生肖六合、三合、沖、害、刑；日干相合與生剋；日支六合、相沖；對方最旺的五行
// 對我的喜忌) is worded here from the same rules, and the tests check the two agree. The rest (相破、自刑、日支的三合刑害
// 破、配偶星、用神與五行互補、納音、我最旺的五行對對方的喜忌) only adds explanation and orders the summary.
//
// Wording follows the other readings: Traditional Chinese for Taiwan, a technical term glossed in （） at its first use
// in reading order (GLOSSARY), good points said plainly, tension as 磨合 with something concrete to do. 剋 names a 五行
// relation only, never what one person does to the other; nothing here speaks of divorce, death, illness or
// infidelity. Names are used when given, else 你 and 對方.
//
// English (README「英文版（翻譯層）」, core/tr.js): every sentence goes through tr() and is looked up by its Chinese
// template in src/i18n/en/partner.json; the Chinese is exactly what the template literals made. A person is a name in
// two forms, `n` (你, 阿明 / you, Ah-ming) and `of` (你的 / your, Ah-ming's): a template passes the form its English
// needs, and the English is written without verbs that change with the person (can, will, may…), so "you" and a name
// read the same. The glosses are put in with the English terms (glosserEn); English is tidied once at the end (tidy).
import { SixtyCycle } from "tyme4ts";
import { zh } from "./zh.js";
import { analyse, pillarOf, elementScores, tenGod, ELEMENTS } from "./analysis.js";
import { clash, sixCombine, harm, breaks, punish, elementRoles } from "./detail.js";
import { relate } from "./family.js";
import { tr, trw, readingLang } from "./tr.js";

// ---------- 靜態表 ----------
const SECTIONS = [
  ["zodiac", "生肖"], ["day", "日柱"], ["palace", "夫妻宮"], ["star", "配偶星"],
  ["useful", "用神互補"], ["elements", "五行互補"], ["nayin", "年柱納音"], ["closing", "綜合來看"],
];
export const SECTION_IDS = SECTIONS.map(([id]) => id);
const TITLE = Object.fromEntries(SECTIONS);

// 專有名詞第一次出現時的白話說明。生肖的合沖刑害、三合、六合在句子裡直接說明意思，不另加註。
export const GLOSSARY = {
  天合地合: "日干、日支都相合",
  伴侶星: "財星和官殺都看",
  用神互補: "各自帶著另一方需要的五行",
  夫妻宮: "日支，代表配偶與婚姻",
  配偶星: "男命看財星、女命看官殺",
  日干: "出生日的天干，代表自己",
  日支: "出生日的地支",
  五合: "天干兩兩相合的五組：甲己、乙庚、丙辛、丁壬、戊癸",
  比和: "同一種五行",
  財星: "日干所剋的五行",
  官殺: "剋日干的五行",
  正財: "日干所剋、陰陽不同",
  偏財: "日干所剋、陰陽相同",
  正官: "剋日干、陰陽不同",
  七殺: "剋日干、陰陽相同",
  用神: "命局最需要的五行",
  喜神: "輔助用神的五行",
  忌神: "最不利命局的五行",
  仇神: "次要的不利五行",
  喜用: "用神與喜神",
  納音: "六十甲子各自配上的五行意象",
};
// A use that explains the term in the same sentence: it counts as glossed, and takes no （）.
const EXPLAINED = { 配偶星: (t, i) => t.slice(Math.max(0, i - 2), i) === "合稱", 伴侶星: (t, i) => t.slice(Math.max(0, i - 2), i) === "合稱" };

export const ZODIAC = { 子: "鼠", 丑: "牛", 寅: "虎", 卯: "兔", 辰: "龍", 巳: "蛇", 午: "馬", 未: "羊", 申: "猴", 酉: "雞", 戌: "狗", 亥: "豬" };
const GENERATES = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const CONTROLS = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
const CONTROLLED_BY = { 土: "木", 水: "土", 火: "水", 金: "火", 木: "金" };
const STEM_COMBINE = { 甲: ["己", "土"], 己: ["甲", "土"], 乙: ["庚", "金"], 庚: ["乙", "金"], 丙: ["辛", "水"], 辛: ["丙", "水"], 丁: ["壬", "木"], 壬: ["丁", "木"], 戊: ["癸", "火"], 癸: ["戊", "火"] };
const SIX_COMBINE_EL = { 子: "土", 丑: "土", 寅: "木", 亥: "木", 卯: "火", 戌: "火", 辰: "金", 酉: "金", 巳: "水", 申: "水", 午: "土", 未: "土" };
const TRIADS = [["申子辰", "水"], ["亥卯未", "木"], ["寅午戌", "火"], ["巳酉丑", "金"]];
// Pairs are named in the customary order (子丑合、子午沖、子未害、子卯刑、子酉破、甲己合).
const PAIR_ORDER = {
  六合: "子丑寅亥卯戌辰酉巳申午未", 相沖: "子午丑未寅申卯酉辰戌巳亥", 相害: "子未丑午寅巳卯辰申亥酉戌",
  相刑: "子卯寅巳申丑戌未", 相破: "子酉午卯巳申寅亥辰丑戌未", 五合: "甲己乙庚丙辛丁壬戊癸",
};
const MAIN_WORD = { 六合: "合", 相沖: "沖", 相害: "害", 相刑: "刑" };
const EXTRA_TIP = { 相刑: "相處時容易互相要求，多一點包容就好", 相破: "偶爾會為小事意見不同，影響不大" };
const PUNISH_TIP = {
  無禮之刑: "這一組叫「無禮之刑」，熟了以後說話容易太直接，記得保留一點客氣",
  無恩之刑: "這一組叫「無恩之刑」，付出時容易覺得沒被看見，把感謝說出口就好",
  恃勢之刑: "這一組叫「恃勢之刑」，兩人都想作主，事先分好誰負責哪些事就好",
};
// 傳統上某一五行旺的人：對需要它的人是助力（GIFT），對忌它的人則可能是壓力（EXCESS）。
const GIFT = {
  木: x => tr("仁厚上進，能帶著{x}一起成長", { x }), 火: x => tr("熱情開朗，能為{x}帶來活力", { x }), 土: x => tr("穩重踏實，能給{x}安全感", { x }),
  金: x => tr("果斷守信，能幫{x}拿定主意", { x }), 水: x => tr("聰明靈活，能幫{x}轉換想法", { x }),
};
const EXCESS = { 木: "想法多、凡事想往前衝", 火: "性子急、情緒來得快", 土: "穩重保守、步調偏慢", 金: "講原則、說話直接", 水: "想法多變、不容易捉摸" };
// Something two people can do together for an element both of them like.
export const TOGETHER = {
  木: "一起去爬山、逛植物園，或在家種些花草", 火: "一起運動流汗、曬曬太陽，或安排熱鬧的聚會", 土: "一起下廚、訂下存錢的目標，或到郊外走走",
  金: "一起整理家裡、斷捨離，或養成固定的運動習慣", 水: "一起去海邊、游泳或旅行",
};
const TONE_LEAD = { 互補: "以互補為主", 平穩: "屬於平穩的組合", 需要磨合: "需要多一點磨合" };
const TONE_WRAP = {
  互補: "先天的契合是好的起點，日常的體貼與溝通，才能讓這些優點一直發揮。",
  平穩: "這樣的組合沒有太大的先天起伏，感情的溫度多半取決於兩人日常的經營。",
  需要磨合: "磨合不是壞事：步調不同的兩個人，只要願意溝通、給彼此空間，差異反而能變成互補。",
};
const TRADITION = "這些是傳統命理的看法，兩人怎麼選擇、怎麼相處，影響更大。";
const GENERIC_ADVICE = [
  "每週留一段只屬於兩個人的時間，不談工作和家務，聊聊彼此最近的心情。",
  "重要的決定（工作、搬家、理財）攤開來一起談，先說各自的期待與擔心，再一起決定。",
];
// A share of the element scores at or above this is plenty (an average element holds 0.2).
const STRONG = 0.3;

// ---------- 小工具 ----------
const COUNT = ["", "一", "兩", "三", "四", "五", "六", "七", "八"];
const uniq = list => [...new Set(list)];
// The language being written (core/tr.js): the joins, the full stop and the glosses follow it; Chinese is unchanged.
export const isEn = () => readingLang() === "en";
export const end = s => (isEn() ? (/[.!?][”")]?$/.test(s) ? s : `${s}.`) : /[。！？]$/.test(s) ? s : `${s}。`);
// Sentences one after another: joined as they are in Chinese, with a space in English.
export const run = parts => parts.join(isEn() ? " " : "");
// A list: 甲、乙 (or the Chinese separator given), and in English "A, B and C" (or "or").
export function list(items, zh = "、", word = "and") {
  if (!isEn()) return items.join(zh);
  return items.length <= 2 ? items.join(` ${word} `) : `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`;
}
// 子丑 → Zi–Chou, 申子辰 → Shen–Zi–Chen; 甲木 → Jia Wood. Chinese as it is.
export const duo = p => (isEn() ? [...p].map(trw).join("–") : p);
export const se = (stem, el) => (isEn() ? `${trw(stem)} ${trw(el)}` : stem + el);
// A person's name for the reading: the name given, else 你 / 對方 (you / your partner), and its `of` form.
export function nameForms(name, fallback) {
  if (!isEn()) { const n = name || fallback; return { n, of: `${n}的` }; }
  if (name) { const n = trw(name); return { n, of: tr("{n}的", { n }) }; }
  return fallback === "你" ? { n: tr("你"), of: tr("你的") } : { n: tr("對方（伴侶）"), of: tr("對方（伴侶）的") };
}
// English only: one space between sentences and after punctuation, none before it, and a capital letter to start
// each sentence (the parts are written in lower case where they can come after a comma or a semicolon).
export function tidy(s) {
  if (!isEn() || typeof s !== "string") return s;
  return s.replace(/\s+/g, " ").replace(/\s+([,.;:!?)”])/g, "$1").replace(/([,;:.!?])(?=[A-Za-z“(])/g, "$1 ")
    .replace(/(^|[.!?]["”)]? )([a-z])/g, (all, before, c) => before + c.toUpperCase()).trim();
}
const pct = x => `${Math.round(x * 100)}%`;
const ordered = (a, b, ref) => (ref.indexOf(a) <= ref.indexOf(b) ? a + b : b + a);
const cleanName = n => (typeof n === "string" && n.trim() ? n.trim() : null);
const nayinOf = name => zh(SixtyCycle.fromName(name).getSound().getName());
// A section's title in the reading's language: the term itself where it is one (生肖、夫妻宮…).
const titleOf = id => (isEn() ? capital(trw(TITLE[id])) : TITLE[id]);
const capital = t => String(t).replace(/^[a-z]/, c => c.toUpperCase());
const section = (id, paragraphs, items = []) => ({ id, title: titleOf(id), paragraphs: paragraphs.filter(Boolean), items });

// Every relation between two branches, the main one first: 六合 or 三合, then 沖、害、刑、破; or the same branch (自刑
// when it is one of 辰午酉亥).
export function branchRelations(a, b) {
  if (a === b) return punish(a, b) === "自刑" ? [{ kind: "同支" }, { kind: "自刑" }] : [{ kind: "同支" }];
  const out = [];
  if (sixCombine(a, b)) out.push({ kind: "六合", element: SIX_COMBINE_EL[a], pair: ordered(a, b, PAIR_ORDER.六合) });
  const tri = TRIADS.find(([t]) => t.includes(a) && t.includes(b));
  if (tri) out.push({ kind: "三合", element: tri[1], triad: tri[0], pair: ordered(a, b, tri[0]) });
  if (clash(a, b)) out.push({ kind: "相沖", pair: ordered(a, b, PAIR_ORDER.相沖) });
  if (harm(a, b)) out.push({ kind: "相害", pair: ordered(a, b, PAIR_ORDER.相害) });
  const pu = punish(a, b);
  if (pu) out.push({ kind: "相刑", name: pu, pair: ordered(a, b, PAIR_ORDER.相刑) });
  if (breaks(a, b)) out.push({ kind: "相破", pair: ordered(a, b, PAIR_ORDER.相破) });
  return out;
}
// 「；寅亥合中帶破，偶爾會為小事意見不同，影響不大」 for the relations after the main one.
function extraClause(rels) {
  const [main, ...rest] = rels;
  if (!rest.length || !MAIN_WORD[main.kind]) return "";
  return tr("；{pair}{main}中帶{rest}，{tip}", {
    pair: duo(main.pair), main: MAIN_WORD[main.kind], tip: EXTRA_TIP[rest[0].kind],
    rest: isEn() ? list(rest.map(r => trw(r.kind.slice(1)))) : rest.map(r => r.kind.slice(1)).join("、帶"),
  });
}

// One person, with what the reading needs from the chart. The element scores are the ones relate() reads.
function personOf(x, { n, of }) {
  const names = x.pillars, ps = names.map(pillarOf), a = x.analysis;
  const scores = elementScores(names);
  const total = ELEMENTS.reduce((s, e) => s + scores[e], 0) || 1;
  const share = Object.fromEntries(ELEMENTS.map(e => [e, scores[e] / total]));
  const chars = Object.fromEntries(ELEMENTS.map(e => [e, []]));
  for (const p of ps) { chars[p.stemEl].push(p.stem); chars[p.branchEl].push(p.branch); }
  return {
    n, of, male: x.sex !== "female", names, ps, year: ps[0], day: ps[2], el: ps[2].stemEl, a, roles: elementRoles(a),
    share, top: ELEMENTS.slice().sort((p, q) => scores[q] - scores[p])[0], chars, hourless: names.length < 4,
    useful: a.useful[0] || null, ji: a.avoid[0] || null,
  };
}
// 配偶星: a man reads 財 (the element his day master controls) as the wife star, a woman 官殺 (the element that controls
// hers) as the husband star, each by their own sex. Two people of the same sex read both (伴侶星).
export const spouseElements = (X, neutral) => (neutral ? [CONTROLS[X.el], CONTROLLED_BY[X.el]] : [X.male ? CONTROLS[X.el] : CONTROLLED_BY[X.el]]);
const spouseOf = (X, neutral) => (neutral ? { els: spouseElements(X, true), word: "伴侶星" } : { els: spouseElements(X, false), word: X.male ? "妻星" : "夫星" });
const usefulStrong = (X, Y) => !!X.useful && (Y.top === X.useful || Y.share[X.useful] >= STRONG);

// The gloss pass: each term gets its gloss at its first use in reading order. A short term never matches inside a
// longer one (天合 inside 天合地合), and uses inside 「」 or （） are skipped so glosses never nest.
function glosser() {
  const keys = Object.keys(GLOSSARY).sort((x, y) => y.length - x.length), seen = new Set();
  const enclosed = (t, i) => {
    const before = t.slice(0, i), n = re => (before.match(re) || []).length;
    return n(/（/g) > n(/）/g) || n(/「/g) > n(/」/g);
  };
  return text => {
    const taken = [];
    for (const k of keys) {
      for (let i = text.indexOf(k); i >= 0; i = text.indexOf(k, i + 1)) {
        if (!taken.some(h => i < h.i + h.k.length && h.i < i + k.length)) taken.push({ k, i });
      }
    }
    const hits = [];
    for (const k of keys) {
      if (seen.has(k)) continue;
      const first = taken.filter(h => h.k === k).sort((x, y) => x.i - y.i).find(h => text[h.i + k.length] !== "（" && !enclosed(text, h.i));
      if (!first) continue;
      seen.add(k);
      if (!(EXPLAINED[k] && EXPLAINED[k](text, first.i))) hits.push(first);
    }
    let out = text;
    for (const h of hits.sort((x, y) => y.i - x.i)) out = `${out.slice(0, h.i + h.k.length)}（${GLOSSARY[h.k]}）${out.slice(h.i + h.k.length)}`;
    return out;
  };
}
// The same in English: the English term (bazi-terms.json) gets the Chinese and its gloss in brackets at its first use,
// "Spouse Palace (夫妻宮: …)". A term matches as whole words only, never inside a longer term; uses inside brackets or
// quotation marks, or already followed by brackets, are skipped; "called the Spouse Star" explains itself.
function glosserEn() {
  const terms = Object.keys(GLOSSARY).map(k => ({ k, t: trw(k), g: tr(GLOSSARY[k]) })).filter(x => x.t !== x.k).sort((x, y) => y.t.length - x.t.length);
  const seen = new Set(), letter = /[A-Za-z-]/;
  const enclosed = (t, i) => {
    const before = t.slice(0, i), n = re => (before.match(re) || []).length;
    return n(/\(/g) > n(/\)/g) || n(/“/g) > n(/”/g);
  };
  return text => {
    const taken = [];
    for (const x of terms) {
      for (let i = text.indexOf(x.t); i >= 0; i = text.indexOf(x.t, i + 1)) {
        if (letter.test(text[i - 1] || "") || letter.test(text[i + x.t.length] || "")) continue;
        if (!taken.some(h => i < h.i + h.x.t.length && h.i < i + x.t.length)) taken.push({ x, i });
      }
    }
    const hits = [];
    for (const x of terms) {
      if (seen.has(x.k)) continue;
      const first = taken.filter(h => h.x === x).sort((p, q) => p.i - q.i).find(h => !/^ ?\(/.test(text.slice(h.i + x.t.length)) && !enclosed(text, h.i));
      if (!first) continue;
      seen.add(x.k);
      if (!/(?:called|known as) (?:the )?$/.test(text.slice(Math.max(0, first.i - 16), first.i))) hits.push(first);
    }
    let out = text;
    for (const h of hits.sort((p, q) => q.i - p.i)) out = `${out.slice(0, h.i + h.x.t.length)} (${h.x.k}: ${h.x.g})${out.slice(h.i + h.x.t.length)}`;
    return out;
  };
}

// Each section also records facts: { score, chip?, phrase?, focus?, advice?, fallback?, burden? }. score orders them
// (relate()'s weights for what it counts, smaller ones for the rest); chip feeds the highlights (a fallback chip only
// when fewer than two others), phrase the summary and the closing, focus the suggestion said with a tension, advice
// the suggestions.

// ---------- 1 生肖 ----------
function zodiacSection(c) {
  const { A, B } = c;
  const a = A.year.branch, b = B.year.branch, za = ZODIAC[a], zb = ZODIAC[b];
  const rels = branchRelations(a, b), main = rels[0];
  const who = tr("{a}屬{za}（年支{ya}），{b}屬{zb}（年支{yb}），", { a: A.n, za, ya: a, b: B.n, zb, yb: b });
  const has = k => rels.some(r => r.kind === k);
  const v = { who, za, zb, pair: main && main.pair ? duo(main.pair) : "", el: main && main.element, triad: main && main.triad ? duo(main.triad) : "" };
  let text;
  if (!main) text = tr("{who}{za}和{zb}之間沒有六合、三合，也沒有沖、刑、害、破，是平常的組合，相處的好壞主要看日柱與五行", v);
  else if (main.kind === "同支") {
    text = tr("兩人都屬{za}（年支{ya}），同生肖的兩個人個性與步調相近，容易懂彼此", { za, ya: a })
      + (has("自刑") ? tr("；只是{ya}是自刑之支，傳統上說兩人容易一起想太多，情緒上來時輪流當冷靜的那一個就好", { ya: a }) : tr("；也因為太像，兩人同時堅持時，要有人先讓一步"));
  } else if (main.kind === "六合") text = tr("{who}{za}和{zb}是生肖六合（{pair}合{el}），傳統上主兩人投緣、相處有默契；年支也代表家庭背景，兩家人的往來通常也比較融洽", v);
  else if (main.kind === "三合") text = tr("{who}{za}和{zb}同在{triad}三合{el}局裡，是生肖三合，傳統上主志趣相投、能互相幫襯，兩家人的往來也容易順利", v);
  else if (main.kind === "相沖") text = tr("{who}{za}和{zb}是生肖相沖（{pair}沖），傳統上主兩人的個性與步調差異大，常常一個想快、一個想慢，遇到分歧時先聽完彼此的想法再決定；年支也代表家庭背景，兩家的生活習慣或觀念可能不太一樣，多認識彼此的家人會有幫助", v);
  else if (main.kind === "相害") text = tr("{who}{za}和{zb}是生肖相害（{pair}害），傳統上主小誤會容易悶在心裡、慢慢累積，有話直說、不讓彼此猜心就好", v);
  else if (main.kind === "相刑") text = tr("{who}{za}和{zb}是生肖相刑（{pair}刑），傳統上主相處中容易互相要求、互不相讓；{tip}", { ...v, tip: PUNISH_TIP[main.name] });
  else text = tr("{who}{za}和{zb}是生肖相破（{pair}破），傳統上主計畫偶爾會被小事打亂，影響通常不大，多一點彈性就好", v);
  text += extraClause(rels);

  // relate() scores 六合 1、三合 0.6、沖 −1、害 −0.6、刑 −0.5; 相破 and the same sign only add a little.
  const W = { 六合: 1, 三合: 0.6, 相沖: -1, 相害: -0.6, 相刑: -0.5, 相破: -0.15, 同支: 0.1, 自刑: -0.1 };
  const score = rels.reduce((s, r) => s + W[r.kind], 0);
  if (main) {
    const p = { za, zb };
    const fact = {
      六合: () => ({ chip: tr("生肖六合"), phrase: tr("生肖{za}{zb}六合，彼此投緣", p) }),
      三合: () => ({ chip: tr("生肖三合"), phrase: tr("生肖{za}{zb}三合，志趣相投", p) }),
      相沖: () => ({ chip: tr("生肖相沖"), phrase: tr("生肖{za}{zb}相沖，個性與步調不同", p), focus: tr("遇到分歧時先聽完彼此的想法"), advice: tr("意見不同時，先讓另一半把話說完，隔一天再做決定，不在氣頭上拍板。") }),
      相害: () => ({ chip: tr("生肖相害"), phrase: tr("生肖{za}{zb}相害，要防小誤會累積", p), focus: tr("有話直說就好"), advice: tr("有不舒服的事當天說開，不讓另一半猜心，小誤會就不會累積。") }),
      相刑: () => ({ chip: tr("生肖相刑"), phrase: tr("生肖{za}{zb}相刑，相處時容易互相要求", p), focus: tr("多一點包容就好"), advice: tr("提醒另一半之前，先說一句肯定或感謝的話，兩人都比較聽得進去。") }),
      相破: () => ({ chip: tr("生肖相破"), phrase: tr("生肖{za}{zb}相破，小事偶有波折", p), focus: tr("多一點彈性就好"), advice: tr("計畫保留一點彈性，臨時有變也別太放在心上。") }),
      同支: () => ({ chip: tr("同生肖"), phrase: tr("同屬{za}，步調相近", p) }),
    }[main.kind]();
    c.facts.push({ score, ...fact });
  } else c.facts.push({ score: 0, chip: tr("生肖無刑沖"), fallback: true });
  return section("zodiac", [end(text)]);
}

// ---------- 2 日柱 ----------
function daySection(c) {
  const { A, B } = c;
  const sa = A.day.stem, sb = B.day.stem, ea = A.day.stemEl, eb = B.day.stemEl;
  const ma = tr("{aOf}日干{s}", { aOf: A.of, s: se(sa, ea) }), mb = tr("{bOf}日干{s}", { bOf: B.of, s: se(sb, eb) });
  const heaven = STEM_COMBINE[sa][0] === sb, earth = sixCombine(A.day.branch, B.day.branch);
  const pairD = ordered(A.day.branch, B.day.branch, PAIR_ORDER.六合);
  const v = { ma, mb, a: A.n, b: B.n, ea, eb, a2: A.n, b2: B.n };
  let text, fact;
  if (heaven) {
    const pair = ordered(sa, sb, PAIR_ORDER.五合);
    text = tr("{ma}和{mb}是天干五合裡的{pair}合（合{el}），稱為「天合」：傳統上主兩人一見如故、心意容易相通，彼此重感情，也容易互相牽掛", { ma, mb, pair: duo(pair), el: STEM_COMBINE[sa][1] });
  } else if (ea === eb) {
    text = sa === sb
      ? tr("兩人的日干都是{s}，五行比和：個性與價值觀相近，相處像朋友、夥伴一樣平起平坐，很容易懂彼此；也因為太像，兩人都堅持己見時，要有人先退一步", { s: se(sa, ea) })
      : tr("{ma}和{mb}同屬{ea}，一陰一陽，五行比和：兩人個性相近又各有特色，相處像朋友、夥伴，容易互相欣賞；要留意的是兩人都有主見，遇到分歧時要有人先退一步", v);
    fact = { score: 0.15, chip: tr("日干比和"), phrase: tr("日干同屬{ea}，像朋友一樣平起平坐", { ea }), advice: tr("兩人個性相近，分工時各自負責擅長的事；遇到兩人都堅持的事，就輪流讓步。") };
  } else if (GENERATES[eb] === ea) {
    text = tr("{mb}生{ma}（{eb}生{ea}）：在這段關係裡，{b}比較會照顧{a}、為{a2}著想；{a3}在{bAt}身邊容易放鬆、做自己，記得把感謝說出口，讓付出有回應", { ...v, a3: A.n, bAt: isEn() ? B.n : B.n });
    fact = { score: 0.4, chip: tr("日干相生"), phrase: tr("{b}比較會照顧{a}", v), advice: tr("{a}記得把感謝說出口，也找機會照顧{b}，付出有來有往，關係才不會累。", v) };
  } else if (GENERATES[ea] === eb) {
    text = tr("{ma}生{mb}（{ea}生{eb}）：{a}比較會照顧{b}、為{b2}著想；{b3}在{a2}身邊容易感到安心，也要記得照顧{aOf}感受，付出才不會變成單方面", { ...v, b3: B.n, aOf: A.of });
    fact = { score: 0.2, chip: tr("日干相生"), phrase: tr("{a}比較會照顧{b}", v), advice: tr("{a}照顧{b}之餘，也讓{b2}有機會為{a2}做點什麼，付出有來有往，關係才不會累。", v) };
  } else if (CONTROLS[eb] === ea) {
    text = tr("{mb}約束{ma}（{eb}剋{ea}）：{b}在關係裡比較有主見、習慣替兩人拿主意；{a}在{b2}面前容易收起自己的意見，把需要說清楚，兩人就能找到平衡", v);
    fact = { score: -0.4, phrase: tr("{b}在關係裡比較有主見", v), focus: tr("把各自的需要說清楚就好"), advice: tr("{b}做決定前多問一句{aOf}想法，{a}也把自己的需要直接說出來，主見就會變成可靠。", { ...v, aOf: A.of }) };
  } else {
    text = tr("{ma}約束{mb}（{ea}剋{eb}）：{a}在{b}面前比較有主見、習慣拿主意；{b2}比較會配合，{a2}做決定前多問一句{bOf}想法，{b3}也會更願意說出心裡話", { ...v, b3: B.n, bOf: B.of });
    fact = { score: -0.2, phrase: tr("{a}在關係裡比較有主見", v), focus: tr("把各自的需要說清楚就好"), advice: tr("{a}做決定前多問一句{bOf}想法，{b}也把自己的需要直接說出來。", { ...v, bOf: B.of }) };
  }
  if (heaven && earth) {
    text += tr("。日支{pair}也六合，稱為「地合」；天干、地支都相合，就是合婚裡很受看重的「天合地合」，傳統上主兩人有緣、牽絆深", { pair: duo(pairD) });
    c.facts.push({ score: 1.8, chip: tr("天合地合"), phrase: tr("日柱天合地合，彼此有緣") });
  } else {
    if (earth) text += tr("。另外，日支{pair}六合，稱為「地合」", { pair: duo(pairD) });
    if (heaven) c.facts.push({ score: 1, chip: tr("日干相合"), phrase: tr("日干相合，心意容易相通") });
    if (earth) c.facts.push({ score: 0.8, chip: tr("日支六合"), phrase: tr("夫妻宮{pair}六合，生活上有默契", { pair: duo(pairD) }) });
  }
  if (fact) c.facts.push(fact);
  return section("day", [end(text)]);
}

// ---------- 3 夫妻宮 ----------
function palaceSection(c) {
  const { A, B } = c;
  const a = A.day.branch, b = B.day.branch;
  const rels = branchRelations(a, b), main = rels[0], has = k => rels.some(r => r.kind === k);
  const lead = a === b ? tr("看夫妻宮，兩人的日支都是{da}：", { da: a }) : tr("看夫妻宮，{aOf}日支是{da}、{bOf}日支是{db}：", { aOf: A.of, bOf: B.of, da: a, db: b });
  const v = main ? { pair: main.pair ? duo(main.pair) : "", el: main.element, triad: main.triad ? duo(main.triad) : "" } : {};
  let body, fact;
  if (!main) {
    body = tr("兩支之間沒有合、沖、刑、害，夫妻宮平穩，生活相處沒有特別的牽動，靠日常一點一滴經營");
    fact = { score: 0, chip: tr("日支無刑沖"), fallback: true };
  } else if (main.kind === "同支") {
    body = tr("生活習慣與對家的想像相近，容易過到一塊{self}", { self: has("自刑") ? tr("；只是{da}是自刑之支，兩人容易同時鑽牛角尖，情緒上來時先各自冷靜一下", { da: a }) : "" });
    fact = { score: 0.1, chip: tr("日支相同"), phrase: tr("兩人日支相同，生活習慣相近") };
  } else if (main.kind === "六合") {
    body = tr("{pair}六合（合{el}），生活上容易有默契，喜歡一起做的事多，相處久了越來越像家人", v);
  } else if (main.kind === "三合") {
    body = tr("{pair}同在{triad}{el}局裡，屬於三合，兩人對未來的想像容易一致，一起規畫、一起打拚時特別有勁", v);
    fact = { score: 0.3, chip: tr("日支三合"), phrase: tr("夫妻宮三合，對未來的想像一致") };
  } else if (main.kind === "相沖") {
    body = tr("{pair}相沖，兩人的生活節奏、作息習慣不同，例如一個習慣早睡、一個習慣晚睡，一個愛往外跑、一個喜歡待在家；約定好共同的作息，也保留各自的時間，多溝通就能改善", v);
    fact = { score: -0.8, chip: tr("日支相沖"), phrase: tr("夫妻宮{pair}相沖，作息與生活節奏不同", v), focus: tr("約好共同的作息就能改善"), advice: tr("作息不同時，約定幾個固定的共同時段（一起吃晚餐、睡前聊十分鐘），其餘時間尊重各自的步調。") };
  } else if (main.kind === "相害") {
    body = tr("{pair}相害，生活中容易悶著不說、累積小誤會，養成有事當天說開的習慣就好", v);
    fact = { score: -0.3, chip: tr("日支相害"), phrase: tr("夫妻宮{pair}相害，要防誤會悶在心裡", v), focus: tr("有話直說就好"), advice: tr("有不舒服的事當天說開，不讓另一半猜心，小誤會就不會累積。") };
  } else if (main.kind === "相刑") {
    body = tr("{pair}相刑，生活上容易為小事互相要求、互不相讓；{tip}", { ...v, tip: PUNISH_TIP[main.name] });
    fact = { score: -0.3, chip: tr("日支相刑"), phrase: tr("夫妻宮{pair}相刑，生活上容易互相要求", v), focus: tr("多一點包容就好"), advice: tr("提醒另一半之前，先說一句肯定或感謝的話，兩人都比較聽得進去。") };
  } else {
    body = tr("{pair}相破，生活中的小計畫偶爾會被打亂，影響不大，彼此多一點彈性就好", v);
    fact = { score: -0.15, chip: tr("日支相破"), phrase: tr("夫妻宮{pair}相破，小計畫偶被打亂", v), focus: tr("多一點彈性就好"), advice: tr("計畫保留一點彈性，臨時有變也別太放在心上。") };
  }
  if (fact) {
    // A 相刑 or 相破 riding on the main relation weighs a little more (丑未、寅申沖中帶刑…).
    const extra = rels.slice(1).filter(r => r.kind === "相刑" || r.kind === "相破").length;
    c.facts.push({ ...fact, score: fact.score - (fact.score < 0 ? 0.1 * extra : 0) });
  }
  return section("palace", [end(lead + body + extraClause(rels))]);
}

// ---------- 4 配偶星 ----------
function starSection(c) {
  const { A, B, neutral } = c;
  const line = (X, Y) => {
    const sp = spouseOf(X, neutral), s = sp.els.reduce((t, e) => t + X.share[e], 0), match = sp.els.includes(Y.el);
    const v = { xOf: X.of, p: pct(s) };
    const strength = s >= STRONG ? tr("在{xOf}命盤裡約佔 {p}，力量明顯", v) : s >= 0.15 ? tr("在{xOf}命盤裡約佔 {p}，力量適中", v)
      : s >= 0.005 ? tr("在{xOf}命盤裡只佔約 {p}，力量偏弱", v) : tr("在{xOf}命盤裡幾乎看不到", v);
    let t = neutral
      ? tr("{xOf}日干{s}，伴侶星是{e1}（財星）和{e2}（官殺），{strength}", { xOf: X.of, s: se(X.day.stem, X.el), e1: sp.els[0], e2: sp.els[1], strength })
      : tr("{x}是{sex}，日干{s}的{word}是{e}，{strength}", { x: X.n, sex: X.male ? "男命" : "女命", s: se(X.day.stem, X.el), word: sp.word, e: sp.els[0], strength });
    if (match) {
      const god = tenGod(X.day.stem, Y.day.stem);   // 正財、偏財 for 財, 正官、七殺 for 官殺
      t += tr("；{yOf}日干{s}是{xOf}{god}{fate}", { yOf: Y.of, s: se(Y.day.stem, Y.el), xOf: X.of, god, fate: god === "正財" || god === "正官" ? tr("，傳統上視為正緣") : "" });
      if (s < 0.15) t += tr("。{x}命中的{word}本來偏弱，{y}正好補上這一塊", { x: isEn() ? X.of : X.n, word: sp.word, y: Y.n });
      else if (s >= STRONG) t += tr("。{word}在{x}命中本來就有力，{y}又正是這個五行，緣分明朗", { x: isEn() ? X.of : X.n, word: sp.word, y: Y.n });
    } else {
      t += tr("；{yOf}日干{s}不是{els}", { yOf: Y.of, s: se(Y.day.stem, Y.el), els: list(sp.els.map(trw), "或", "or") });
      if (s < 0.15) t += tr("。{word}偏弱的人感情上比較含蓄，多把心意說出口會更好", { word: sp.word });
    }
    return { label: tr("{xOf}{word}", { xOf: X.of, word: sp.word }), text: end(t), match, word: sp.word };
  };
  const la = line(A, B), lb = line(B, A);
  const intro = neutral
    ? tr("傳統合婚依男女來看：男命看財星、女命看官殺，合稱配偶星。兩位的性別相同，這裡兩種都看，合稱伴侶星；合婚時看一方的日干是不是落在另一方的伴侶星上，以及伴侶星在自己命盤裡的強弱。")
    : tr("傳統上，男命以財星為妻星、女命以官殺為夫星，合稱配偶星；合婚時會看一方的日干是不是落在另一方的配偶星上，以及配偶星在自己命盤裡的強弱。");
  const words = neutral ? "伴侶星" : "配偶星";
  let verdict;
  if (la.match && lb.match) {
    verdict = tr("{bOf}日干{sb}正是{aOf}{wa}，{aOf2}日干{sa}也正是{bOf2}{wb}，兩人互為{words}，是傳統合婚裡的好兆頭。", { bOf: B.of, sb: se(B.day.stem, B.el), aOf: A.of, wa: la.word, aOf2: A.of, sa: se(A.day.stem, A.el), bOf2: B.of, wb: lb.word, words });
    c.facts.push({ score: 0.4, chip: tr("互為{words}", { words }), phrase: tr("兩人互為{words}", { words }) });
  } else if (la.match || lb.match) {
    const [X, Y, l] = la.match ? [A, B, la] : [B, A, lb];
    verdict = tr("{yOf}日干{s}正是{xOf}{word}，是傳統合婚裡的好兆頭。", { yOf: Y.of, s: se(Y.day.stem, Y.el), xOf: X.of, word: l.word });
    c.facts.push({ score: 0.3, chip: tr("{words}相應", { words }), phrase: tr("{yOf}日干正是{xOf}{word}", { yOf: Y.of, xOf: X.of, word: l.word }) });
  } else verdict = tr("兩人的日干都不落在彼此的{words}上，這在合婚裡很常見，{words2}只是參考之一。", { words, words2: words });
  return section("star", [run([intro, verdict])], [{ label: la.label, text: la.text }, { label: lb.label, text: lb.text }]);
}

// ---------- 5 用神互補 ----------
// What Y's chart brings to X: X's 用神 in Y's chart, the role Y's strongest element plays for X (what relate() scores
// for the first person), and X's 忌神 when Y has plenty of it.
function usefulFrom(c, X, Y, scored) {
  const u = X.useful, t = Y.top, parts = [];
  const v = { x: X.n, y: Y.n, xOf: X.of, yOf: Y.of, u, t };
  if (u) {
    const s = Y.share[u], head = tr("{xOf}用神是{u}", v), w = { ...v, head, p: pct(s) };
    if (t === u) parts.push(tr("{head}，{u}正是{y}命盤裡最旺的五行（約 {p}），正好補到{x}最需要的地方；傳統上{u2}旺的人{gift}", { ...w, y: isEn() ? Y.of : Y.n, u2: u, gift: GIFT[u](X.n) }));
    else if (s >= STRONG) parts.push(tr("{head}，{yOf}命盤裡{u}約佔 {p}，分量很足，正好補到{x}最需要的地方", w));
    else if (s >= 0.15) parts.push(tr("{head}，{yOf}命盤裡{u}約佔 {p}，有一定的分量，能幫上{x}一些", w));
    else if (s >= 0.005) parts.push(tr("{head}，{yOf}命盤裡{u}只佔約 {p}，這方面{x}要靠自己在生活中補足", w));
    else parts.push(tr("{head}，{yOf}命盤裡幾乎沒有{u}，這方面{x}要靠自己在生活中補足", w));
  } else parts.push(tr("{xOf}命盤各派喜忌接近，沒有特別突出的用神，{yOf}五行對{x}影響不大", v));
  const role = X.roles[t];
  if (t !== u && X.a.useful.includes(t)) {
    parts.push(tr("{y}命盤最旺的{t}也是{xOf}{role}，整體來說{yOf}五行對{x}有幫助", { ...v, y: isEn() ? Y.of : Y.n, role }));
    c.facts.push({ score: scored ? 0.5 : 0.15, chip: scored ? tr("{y}旺{x}所喜", v) : null, phrase: tr("{y}命盤最旺的{t}是{xOf}{role}", { ...v, y: isEn() ? Y.of : Y.n, role }) });
  } else if (X.a.avoid.includes(t)) {
    const w = { ...v, y: isEn() ? Y.of : Y.n, role, t2: t, excess: EXCESS[t], x2: X.n };
    parts.push(scored
      ? tr("不過{y}命盤最旺的{t}是{xOf}{role}：傳統上{t2}旺的人{excess}，有時會讓{x}覺得有壓力，把感受說出來、保留各自充電的空間就好", w)
      : tr("不過{y}命盤最旺的{t}是{xOf}{role}：傳統上{t2}旺的人{excess}，{x}有時會覺得步調不合，彼此多體諒步調的差異就好", w));
    c.facts.push({ score: scored ? -0.5 : -0.15, chip: scored ? tr("{y}旺{x}所忌", v) : null, phrase: tr("{y}命盤最旺的{t}是{xOf}{role}", w), focus: tr("相處時保留各自的空間就好"), burden: { X, Y, t } });
  }
  if (X.ji && X.ji !== t && Y.share[X.ji] >= STRONG) {
    parts.push(tr("{y}命盤裡的{ji}也偏多（約 {p}），{ji2}是{xOf}忌神，兩人意見不同時，先停下來聽聽彼此的理由", { y: isEn() ? Y.of : Y.n, ji: X.ji, p: pct(Y.share[X.ji]), ji2: X.ji, xOf: X.of }));
  }
  return end(parts.join(isEn() ? "; " : "；"));
}
function usefulSection(c) {
  const { A, B } = c;
  const hour = A.hourless && B.hourless ? tr("兩人的時辰都不詳，五行以年、月、日三柱估算。")
    : A.hourless || B.hourless ? tr("{xOf}時辰不詳，五行以年、月、日三柱估算。", { xOf: (A.hourless ? A : B).of }) : "";
  const ab = usefulStrong(A, B), ba = usefulStrong(B, A);
  let verdict;
  if (ab && ba) {
    verdict = tr("兩人的用神互補：{a}最需要的{ua}在{bOf}命盤裡很旺，{b}最需要的{ub}在{aOf}命盤裡也很旺，是合婚裡很實在的優點。", { a: isEn() ? A.of : A.n, ua: A.useful, bOf: B.of, b: isEn() ? B.of : B.n, ub: B.useful, aOf: A.of });
    c.facts.push({ score: 0.6, chip: tr("用神互補"), phrase: tr("兩人用神互補") });
  } else if (ab || ba) {
    const [X, Y] = ab ? [A, B] : [B, A];
    const back = Y.useful ? tr("{x}能補給{y}的比較少，{y2}需要的{u}要靠生活中的其他方面補足", { x: X.n, y: Y.n, y2: isEn() ? Y.of : Y.n, u: Y.useful }) : tr("{yOf}命盤喜忌接近，沒有特別需要補的五行", { yOf: Y.of });
    verdict = tr("用神方面，{yOf}命盤補得到{x}最需要的{u}；{back}。", { yOf: Y.of, x: isEn() ? X.of : X.n, u: X.useful, back });
    // relate() counts it when the partner's strongest element is one you like.
    c.facts.push({ score: ab && A.a.useful.includes(B.top) ? 0.5 : 0.35, chip: tr("{y}補{x}用神", { y: Y.n, x: isEn() ? X.of : X.n }), phrase: tr("{yOf}命盤補得到{xOf}用神", { yOf: Y.of, xOf: X.of }) });
  } else verdict = tr("用神方面兩人沒有明顯的互補，各自照顧好自己需要的五行就好。");
  const items = [
    { label: tr("{b}帶給{a}", { b: B.n, a: A.n }), text: usefulFrom(c, A, B, true) },
    { label: tr("{a}帶給{b}", { a: A.n, b: B.n }), text: usefulFrom(c, B, A, false) },
  ];
  return section("useful", [run([hour, verdict].filter(Boolean))], items);
}

// ---------- 6 五行互補 ----------
// Elements X lacks among its eight (or six) characters that Y has at least two of; an element X dislikes is no gap.
function fills(X, Y) {
  return ELEMENTS.filter(e => !X.chars[e].length && Y.chars[e].length >= 2 && !X.a.avoid.includes(e)).map(e => {
    const hid = uniq(X.ps.filter(p => p.hidden.some(h => h.el === e)).map(p => p.branch));
    const role = X.roles[e];
    const roleNote = role === "用神" ? tr("；{e}又正是{xOf}用神，補得正是地方", { e, xOf: X.of }) : role === "喜神" ? tr("；{e}也是{xOf}喜神", { e, xOf: X.of }) : "";
    const has = Y.hourless ? tr("{y}已知的六個字裡有{count}個{e}（{chars}）", { y: isEn() ? Y.of : Y.n, count: isEn() ? Y.chars[e].length : COUNT[Y.chars[e].length], e, chars: list(Y.chars[e].map(trw)) })
      : tr("{yOf}八字有{count}個{e}（{chars}）", { yOf: Y.of, count: isEn() ? Y.chars[e].length : COUNT[Y.chars[e].length], e, chars: list(Y.chars[e].map(trw)) });
    const v = { x: isEn() ? X.of : X.n, e, hid: list(hid.map(trw)), has, roleNote };
    const text = X.hourless
      ? (hid.length ? tr("{x}已知的六個字裡看不到{e}（只藏在{hid}裡），{has}，正好補上{roleNote}", v) : tr("{x}已知的六個字裡沒有{e}，{has}，正好補上{roleNote}", v))
      : (hid.length ? tr("{x}的八字裡看不到{e}（只藏在{hid}裡），{has}，正好補上{roleNote}", v) : tr("{x}的八字裡沒有{e}，{has}，正好補上{roleNote}", v));
    return { e, text };
  });
}
function elementsSection(c) {
  const { A, B } = c;
  const ab = fills(A, B), ba = fills(B, A);
  if (!ab.length && !ba.length) return null;
  const [X, Y, f] = ab.length ? [A, B, ab] : [B, A, ba];
  const tail = ab.length && ba.length ? tr("兩人互相補足彼此缺的五行，是很典型的五行互補。")
    : tr("這是{y}帶給{x}的互補：在一起時，{xOf}平常比較少展現的那一面，比較容易被帶出來。", { y: Y.n, x: X.n, xOf: isEn() ? X.of : X.n });
  c.facts.push({ score: 0.3, chip: tr("五行互補"), phrase: ab.length && ba.length ? tr("五行互相補足") : tr("{y}補上{x}缺的{els}", { y: Y.n, x: isEn() ? X.of : X.n, els: list(f.map(x => trw(x.e))) }) });
  return section("elements", [run([...[...ab, ...ba].map(x => end(x.text)), tail])]);
}

// ---------- 7 年柱納音 ----------
function nayinSection(c) {
  const { A, B } = c;
  const na = nayinOf(A.names[0]), nb = nayinOf(B.names[0]), ea = na.slice(-1), eb = nb.slice(-1);
  const py = p => (isEn() ? duo(p).replace("–", " ") : p);
  const head = A.names[0] === B.names[0] ? tr("兩人的年柱都是{ya}，納音同為{na}", { ya: py(A.names[0]), na })
    : na === nb ? tr("{aOf}年柱{ya}和{bOf}年柱{yb}，納音同為{na}", { aOf: A.of, ya: py(A.names[0]), bOf: B.of, yb: py(B.names[0]), na })
      : tr("{aOf}年柱{ya}納音是{na}，{bOf}年柱{yb}納音是{nb}", { aOf: A.of, ya: py(A.names[0]), na, bOf: B.of, yb: py(B.names[0]), nb });
  let rel;
  if (ea === eb) { rel = tr("{same}屬於比和，傳統上主氣味相投、相處平順", { same: na === nb ? "" : tr("同屬{e}，", { e: ea }) }); c.facts.push({ score: 0.05, chip: tr("納音比和") }); }
  else if (GENERATES[ea] === eb || GENERATES[eb] === ea) {
    const [x, y] = GENERATES[ea] === eb ? [ea, eb] : [eb, ea];
    rel = tr("{x}生{y}，屬於相生，傳統上視為彼此扶持的好組合", { x, y });
    c.facts.push({ score: 0.1, chip: tr("納音相生") });
  } else {
    const [x, y] = CONTROLS[ea] === eb ? [ea, eb] : [eb, ea];
    rel = tr("{x}剋{y}，屬於相剋，傳統上會提醒兩人多一分包容", { x, y });
  }
  return section("nayin", [tr("{head}，{rel}。納音是比較古老的合婚方法，現在多半只當參考，比重遠不如日柱與五行。", { head, rel })]);
}

// ---------- 8 綜合來看、摘要、亮點、建議 ----------
const positives = c => c.facts.filter(f => f.phrase && f.score >= 0.1).sort((x, y) => y.score - x.score);
const negatives = c => c.facts.filter(f => f.phrase && f.score <= -0.1).sort((x, y) => x.score - y.score);
const semi = items => items.join(isEn() ? "; " : "；");
const withFocus = (f, i) => (i === 0 && f.focus ? tr("{phrase}，{focus}", { phrase: f.phrase, focus: f.focus }) : f.phrase);

function closingSection(c, tone) {
  const pos = positives(c).slice(0, 3), neg = negatives(c).slice(0, 2);
  const lead = pos.length || neg.length ? tr("整體來看，{a}和{b}的命盤{lead}。", { a: c.A.n, b: c.B.n, lead: TONE_LEAD[tone] }) : tr("整體來看，{a}和{b}的命盤{lead}，彼此之間沒有明顯的合沖。", { a: c.A.n, b: c.B.n, lead: TONE_LEAD[tone] });
  const good = pos.length ? tr("契合的地方：{list}。", { list: semi(pos.map(f => f.phrase)) }) : "";
  const care = neg.length ? tr("需要多用心的地方：{list}。", { list: semi(neg.map(withFocus)) }) : "";
  return section("closing", [run([lead, good, care, tr(TONE_WRAP[tone])].filter(Boolean))]);
}

// Facts are separated by 「；」; the first tension carries its suggestion. 需要磨合 leads with the tensions.
function summaryOf(c, tone) {
  const pos = positives(c), neg = negatives(c), v = { a: c.A.n, b: c.B.n, lead: TONE_LEAD[tone] };
  let s1;
  if (tone === "需要磨合") {
    const n = neg.slice(0, 2).map(withFocus);
    s1 = run([n.length ? tr("{a}和{b}的命盤{lead}：{list}。", { ...v, list: semi(n) }) : tr("{a}和{b}的命盤{lead}。", v), pos.length ? tr("好在{phrase}。", { phrase: pos[0].phrase }) : ""].filter(Boolean));
  } else {
    const items = [...pos.slice(0, 2).map(f => f.phrase), ...neg.slice(0, 1).map(withFocus)];
    s1 = items.length ? (tone === "平穩" && pos.length && neg.length ? tr("{a}和{b}的命盤{lead}，好壞互見：{list}。", { ...v, list: semi(items) }) : tr("{a}和{b}的命盤{lead}：{list}。", { ...v, list: semi(items) }))
      : tr("{a}和{b}的命盤{lead}，彼此之間沒有明顯的合沖，好壞都不極端。", v);
  }
  return run([s1, tr(TRADITION)]);
}

// When each person's strongest element is one the other dislikes, that is one point to work on, not two.
function mergeBurdens(c) {
  const [first, second] = c.facts.filter(f => f.burden);
  if (!second) return;
  c.facts = c.facts.filter(f => f !== second);
  Object.assign(first, { score: first.score + second.score, phrase: tr("兩人命盤最旺的五行剛好都是另一方所忌"), both: true });
}

// The weightiest chips first. The 生肖 and the 日支 always leave a chip (a relation, or 生肖無刑沖 / 日支無刑沖), so
// there are at least two: the quiet ones fill in, in reading order, only when fewer than two carry weight.
function highlightsOf(c) {
  const all = c.facts.filter(f => f.chip);
  const real = all.filter(f => !f.fallback && Math.abs(f.score) >= 0.05).sort((x, y) => Math.abs(y.score) - Math.abs(x.score));
  const chips = uniq(real.map(f => f.chip)).slice(0, 5);
  for (const f of all) if (chips.length < 2 && !chips.includes(f.chip)) chips.push(f.chip);
  return chips;
}
// The same chips with what they mean for the pair: good, care (a tension to work on) or mid (a quiet fallback).
const chipKinds = (c, chips) => chips.map(text => {
  const f = c.facts.find(x => x.chip === text);
  return { text, kind: !f || f.fallback ? "mid" : f.score > 0 ? "good" : f.score < 0 ? "care" : "mid" };
});

function adviceOf(c) {
  const { A, B } = c;
  const out = negatives(c).flatMap(f => {
    if (!f.burden) return f.advice ? [f.advice] : [];
    if (f.both) return [tr("兩人命盤最旺的五行，剛好都是另一方比較忌的：覺得有壓力時直接說出感受，也各自保留獨處、充電的時間。")];
    const { X, Y, t } = f.burden;
    return [tr("{yOf}命盤{t}旺，{x}覺得步調不合或有壓力時，可以直接說出感受，兩人也各自保留獨處、充電的時間。", { yOf: Y.of, t, x: X.n })];
  });
  const along = c.facts.find(f => f.advice && f.score > 0);   // 日干相生、比和: how to keep it balanced
  if (along) out.push(along.advice);
  const shared = A.a.useful.filter(e => B.a.useful.includes(e));
  if (shared.length) out.push(tr("兩人的喜用都有{els}：{together}，對兩人都有幫助。", { els: list(shared.map(trw)), together: TOGETHER[shared[0]] }));
  else {
    const clashX = [[A, B], [B, A]].find(([X, Y]) => X.useful && Y.a.avoid.includes(X.useful));
    if (clashX) {
      const [X, Y] = clashX;
      out.push(tr("{x}需要的{u}正好是{yOf}{role}：佈置居家或安排休閒時，各自保留一個角落、一段時間，照自己的方式充電。", { x: isEn() ? X.of : X.n, u: X.useful, yOf: Y.of, role: Y.roles[X.useful] }));
    }
  }
  const items = uniq(out).slice(0, 4);
  for (const g of GENERIC_ADVICE) if (items.length < 2) items.push(tr(g));
  return items;
}

// ---------- 主程式 ----------
export function partnerReading({ me, partner, order = SECTION_IDS }) {
  me = { ...me, analysis: me.analysis || analyse(me.pillars) };
  partner = { ...partner, analysis: partner.analysis || analyse(partner.pillars) };
  const bond = relate({ pillars: me.pillars, analysis: me.analysis }, { pillars: partner.pillars, analysis: partner.analysis });
  let an = cleanName(me.name), bn = cleanName(partner.name);
  if (an && an === bn) an = bn = null;
  const neutral = !!me.sex && me.sex === partner.sex;
  const c = { A: personOf(me, nameForms(an, "你")), B: personOf(partner, nameForms(bn, "對方")), facts: [], neutral };
  // Facts are gathered in the usual order (the summary and the chips rank them), then shown in `order`.
  const built = [zodiacSection(c), daySection(c), palaceSection(c), starSection(c), usefulSection(c), elementsSection(c), nayinSection(c)].filter(Boolean);
  mergeBurdens(c);
  built.push(closingSection(c, bond.tone));
  const rank = id => { const i = order.indexOf(id); return i < 0 ? order.length + SECTION_IDS.indexOf(id) : i; };
  const sections = built.slice().sort((x, y) => rank(x.id) - rank(y.id));
  const summary = summaryOf(c, bond.tone), advice = adviceOf(c), highlights = highlightsOf(c);
  const gloss = isEn() ? (g => t => tidy(g(t)))(glosserEn()) : glosser();
  const glossedSummary = gloss(summary);
  const glossed = sections.map(s => ({ ...s, paragraphs: s.paragraphs.map(gloss), items: s.items.map(it => ({ label: tidy(it.label), text: gloss(it.text) })) }));
  return { net: bond.net, tone: bond.tone, title: tr("伴侶合盤"), summary: glossedSummary, highlights: highlights.map(tidy), chips: chipKinds(c, highlights).map(x => ({ ...x, text: tidy(x.text) })), sections: glossed, advice: advice.map(gloss), neutral };
}
