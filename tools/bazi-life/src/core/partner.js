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
import { SixtyCycle } from "tyme4ts";
import { zh } from "./zh.js";
import { analyse, pillarOf, elementScores, tenGod, ELEMENTS } from "./analysis.js";
import { clash, sixCombine, harm, breaks, punish, elementRoles } from "./detail.js";
import { relate } from "./family.js";

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
  木: x => `仁厚上進，能帶著${x}一起成長`, 火: x => `熱情開朗，能為${x}帶來活力`, 土: x => `穩重踏實，能給${x}安全感`,
  金: x => `果斷守信，能幫${x}拿定主意`, 水: x => `聰明靈活，能幫${x}轉換想法`,
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
const end = s => (/[。！？]$/.test(s) ? s : `${s}。`);
const pct = x => `${Math.round(x * 100)}%`;
const ordered = (a, b, ref) => (ref.indexOf(a) <= ref.indexOf(b) ? a + b : b + a);
const cleanName = n => (typeof n === "string" && n.trim() ? n.trim() : null);
const nayinOf = name => zh(SixtyCycle.fromName(name).getSound().getName());
const section = (id, paragraphs, items = []) => ({ id, title: TITLE[id], paragraphs: paragraphs.filter(Boolean), items });

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
  return `；${main.pair}${MAIN_WORD[main.kind]}中帶${rest.map(r => r.kind.slice(1)).join("、帶")}，${EXTRA_TIP[rest[0].kind]}`;
}

// One person, with what the reading needs from the chart. The element scores are the ones relate() reads.
function personOf(x, name) {
  const names = x.pillars, ps = names.map(pillarOf), a = x.analysis;
  const scores = elementScores(names);
  const total = ELEMENTS.reduce((s, e) => s + scores[e], 0) || 1;
  const share = Object.fromEntries(ELEMENTS.map(e => [e, scores[e] / total]));
  const chars = Object.fromEntries(ELEMENTS.map(e => [e, []]));
  for (const p of ps) { chars[p.stemEl].push(p.stem); chars[p.branchEl].push(p.branch); }
  return {
    n: name, male: x.sex !== "female", names, ps, year: ps[0], day: ps[2], el: ps[2].stemEl, a, roles: elementRoles(a),
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

// Each section also records facts: { score, chip?, phrase?, focus?, advice?, fallback?, burden? }. score orders them
// (relate()'s weights for what it counts, smaller ones for the rest); chip feeds the highlights (a fallback chip only
// when fewer than two others), phrase the summary and the closing, focus the suggestion said with a tension, advice
// the suggestions.

// ---------- 1 生肖 ----------
function zodiacSection(c) {
  const { A, B } = c;
  const a = A.year.branch, b = B.year.branch, za = ZODIAC[a], zb = ZODIAC[b];
  const rels = branchRelations(a, b), main = rels[0];
  const who = `${A.n}屬${za}（年支${a}），${B.n}屬${zb}（年支${b}），`;
  const has = k => rels.some(r => r.kind === k);
  let text;
  if (!main) text = `${who}${za}和${zb}之間沒有六合、三合，也沒有沖、刑、害、破，是平常的組合，相處的好壞主要看日柱與五行`;
  else if (main.kind === "同支") {
    text = `兩人都屬${za}（年支${a}），同生肖的兩個人個性與步調相近，容易懂彼此`
      + (has("自刑") ? `；只是${a}是自刑之支，傳統上說兩人容易一起想太多，情緒上來時輪流當冷靜的那一個就好` : "；也因為太像，兩人同時堅持時，要有人先讓一步");
  } else if (main.kind === "六合") text = `${who}${za}和${zb}是生肖六合（${main.pair}合${main.element}），傳統上主兩人投緣、相處有默契；年支也代表家庭背景，兩家人的往來通常也比較融洽`;
  else if (main.kind === "三合") text = `${who}${za}和${zb}同在${main.triad}三合${main.element}局裡，是生肖三合，傳統上主志趣相投、能互相幫襯，兩家人的往來也容易順利`;
  else if (main.kind === "相沖") text = `${who}${za}和${zb}是生肖相沖（${main.pair}沖），傳統上主兩人的個性與步調差異大，常常一個想快、一個想慢，遇到分歧時先聽完彼此的想法再決定；年支也代表家庭背景，兩家的生活習慣或觀念可能不太一樣，多認識彼此的家人會有幫助`;
  else if (main.kind === "相害") text = `${who}${za}和${zb}是生肖相害（${main.pair}害），傳統上主小誤會容易悶在心裡、慢慢累積，有話直說、不讓彼此猜心就好`;
  else if (main.kind === "相刑") text = `${who}${za}和${zb}是生肖相刑（${main.pair}刑），傳統上主相處中容易互相要求、互不相讓；${PUNISH_TIP[main.name]}`;
  else text = `${who}${za}和${zb}是生肖相破（${main.pair}破），傳統上主計畫偶爾會被小事打亂，影響通常不大，多一點彈性就好`;
  text += extraClause(rels);

  // relate() scores 六合 1、三合 0.6、沖 −1、害 −0.6、刑 −0.5; 相破 and the same sign only add a little.
  const W = { 六合: 1, 三合: 0.6, 相沖: -1, 相害: -0.6, 相刑: -0.5, 相破: -0.15, 同支: 0.1, 自刑: -0.1 };
  const score = rels.reduce((s, r) => s + W[r.kind], 0);
  const pairWord = `生肖${za}${zb}`;
  if (main) {
    const fact = {
      六合: { chip: "生肖六合", phrase: `${pairWord}六合，彼此投緣` },
      三合: { chip: "生肖三合", phrase: `${pairWord}三合，志趣相投` },
      相沖: { chip: "生肖相沖", phrase: `${pairWord}相沖，個性與步調不同`, focus: "遇到分歧時先聽完彼此的想法", advice: "意見不同時，先讓另一半把話說完，隔一天再做決定，不在氣頭上拍板。" },
      相害: { chip: "生肖相害", phrase: `${pairWord}相害，要防小誤會累積`, focus: "有話直說就好", advice: "有不舒服的事當天說開，不讓另一半猜心，小誤會就不會累積。" },
      相刑: { chip: "生肖相刑", phrase: `${pairWord}相刑，相處時容易互相要求`, focus: "多一點包容就好", advice: "提醒另一半之前，先說一句肯定或感謝的話，兩人都比較聽得進去。" },
      相破: { chip: "生肖相破", phrase: `${pairWord}相破，小事偶有波折`, focus: "多一點彈性就好", advice: "計畫保留一點彈性，臨時有變也別太放在心上。" },
      同支: { chip: "同生肖", phrase: `同屬${za}，步調相近` },
    }[main.kind];
    c.facts.push({ score, ...fact });
  } else c.facts.push({ score: 0, chip: "生肖無刑沖", fallback: true });
  return section("zodiac", [end(text)]);
}

// ---------- 2 日柱 ----------
function daySection(c) {
  const { A, B } = c;
  const sa = A.day.stem, sb = B.day.stem, ea = A.day.stemEl, eb = B.day.stemEl;
  const ma = `${A.n}的日干${sa}${ea}`, mb = `${B.n}的日干${sb}${eb}`;
  const heaven = STEM_COMBINE[sa][0] === sb, earth = sixCombine(A.day.branch, B.day.branch);
  const pairD = ordered(A.day.branch, B.day.branch, PAIR_ORDER.六合);
  let text, fact;
  if (heaven) {
    const pair = ordered(sa, sb, PAIR_ORDER.五合);
    text = `${ma}和${mb}是天干五合裡的${pair}合（合${STEM_COMBINE[sa][1]}），稱為「天合」：傳統上主兩人一見如故、心意容易相通，彼此重感情，也容易互相牽掛`;
  } else if (ea === eb) {
    text = sa === sb
      ? `兩人的日干都是${sa}${ea}，五行比和：個性與價值觀相近，相處像朋友、夥伴一樣平起平坐，很容易懂彼此；也因為太像，兩人都堅持己見時，要有人先退一步`
      : `${ma}和${mb}同屬${ea}，一陰一陽，五行比和：兩人個性相近又各有特色，相處像朋友、夥伴，容易互相欣賞；要留意的是兩人都有主見，遇到分歧時要有人先退一步`;
    fact = { score: 0.15, chip: "日干比和", phrase: `日干同屬${ea}，像朋友一樣平起平坐`, advice: "兩人個性相近，分工時各自負責擅長的事；遇到兩人都堅持的事，就輪流讓步。" };
  } else if (GENERATES[eb] === ea) {
    text = `${mb}生${ma}（${eb}生${ea}）：在這段關係裡，${B.n}比較會照顧${A.n}、為${A.n}著想；${A.n}在${B.n}身邊容易放鬆、做自己，記得把感謝說出口，讓付出有回應`;
    fact = { score: 0.4, chip: "日干相生", phrase: `${B.n}比較會照顧${A.n}`, advice: `${A.n}記得把感謝說出口，也找機會照顧${B.n}，付出有來有往，關係才不會累。` };
  } else if (GENERATES[ea] === eb) {
    text = `${ma}生${mb}（${ea}生${eb}）：${A.n}比較會照顧${B.n}、為${B.n}著想；${B.n}在${A.n}身邊容易感到安心，也要記得照顧${A.n}的感受，付出才不會變成單方面`;
    fact = { score: 0.2, chip: "日干相生", phrase: `${A.n}比較會照顧${B.n}`, advice: `${A.n}照顧${B.n}之餘，也讓${B.n}有機會為${A.n}做點什麼，付出有來有往，關係才不會累。` };
  } else if (CONTROLS[eb] === ea) {
    text = `${mb}約束${ma}（${eb}剋${ea}）：${B.n}在關係裡比較有主見、習慣替兩人拿主意；${A.n}在${B.n}面前容易收起自己的意見，把需要說清楚，兩人就能找到平衡`;
    fact = { score: -0.4, phrase: `${B.n}在關係裡比較有主見`, focus: "把各自的需要說清楚就好", advice: `${B.n}做決定前多問一句${A.n}的想法，${A.n}也把自己的需要直接說出來，主見就會變成可靠。` };
  } else {
    text = `${ma}約束${mb}（${ea}剋${eb}）：${A.n}在${B.n}面前比較有主見、習慣拿主意；${B.n}比較會配合，${A.n}做決定前多問一句${B.n}的想法，${B.n}也會更願意說出心裡話`;
    fact = { score: -0.2, phrase: `${A.n}在關係裡比較有主見`, focus: "把各自的需要說清楚就好", advice: `${A.n}做決定前多問一句${B.n}的想法，${B.n}也把自己的需要直接說出來。` };
  }
  if (heaven && earth) {
    text += `。日支${pairD}也六合，稱為「地合」；天干、地支都相合，就是合婚裡很受看重的「天合地合」，傳統上主兩人有緣、牽絆深`;
    c.facts.push({ score: 1.8, chip: "天合地合", phrase: "日柱天合地合，彼此有緣" });
  } else {
    if (earth) text += `。另外，日支${pairD}六合，稱為「地合」`;
    if (heaven) c.facts.push({ score: 1, chip: "日干相合", phrase: "日干相合，心意容易相通" });
    if (earth) c.facts.push({ score: 0.8, chip: "日支六合", phrase: `夫妻宮${pairD}六合，生活上有默契` });
  }
  if (fact) c.facts.push(fact);
  return section("day", [end(text)]);
}

// ---------- 3 夫妻宮 ----------
function palaceSection(c) {
  const { A, B } = c;
  const a = A.day.branch, b = B.day.branch;
  const rels = branchRelations(a, b), main = rels[0], has = k => rels.some(r => r.kind === k);
  const lead = a === b ? `看夫妻宮，兩人的日支都是${a}：` : `看夫妻宮，${A.n}的日支是${a}、${B.n}的日支是${b}：`;
  let body, fact;
  if (!main) {
    body = "兩支之間沒有合、沖、刑、害，夫妻宮平穩，生活相處沒有特別的牽動，靠日常一點一滴經營";
    fact = { score: 0, chip: "日支無刑沖", fallback: true };
  } else if (main.kind === "同支") {
    body = `生活習慣與對家的想像相近，容易過到一塊${has("自刑") ? `；只是${a}是自刑之支，兩人容易同時鑽牛角尖，情緒上來時先各自冷靜一下` : ""}`;
    fact = { score: 0.1, chip: "日支相同", phrase: "兩人日支相同，生活習慣相近" };
  } else if (main.kind === "六合") {
    body = `${main.pair}六合（合${main.element}），生活上容易有默契，喜歡一起做的事多，相處久了越來越像家人`;
  } else if (main.kind === "三合") {
    body = `${main.pair}同在${main.triad}${main.element}局裡，屬於三合，兩人對未來的想像容易一致，一起規畫、一起打拚時特別有勁`;
    fact = { score: 0.3, chip: "日支三合", phrase: "夫妻宮三合，對未來的想像一致" };
  } else if (main.kind === "相沖") {
    body = `${main.pair}相沖，兩人的生活節奏、作息習慣不同，例如一個習慣早睡、一個習慣晚睡，一個愛往外跑、一個喜歡待在家；約定好共同的作息，也保留各自的時間，多溝通就能改善`;
    fact = { score: -0.8, chip: "日支相沖", phrase: `夫妻宮${main.pair}相沖，作息與生活節奏不同`, focus: "約好共同的作息就能改善", advice: "作息不同時，約定幾個固定的共同時段（一起吃晚餐、睡前聊十分鐘），其餘時間尊重各自的步調。" };
  } else if (main.kind === "相害") {
    body = `${main.pair}相害，生活中容易悶著不說、累積小誤會，養成有事當天說開的習慣就好`;
    fact = { score: -0.3, chip: "日支相害", phrase: `夫妻宮${main.pair}相害，要防誤會悶在心裡`, focus: "有話直說就好", advice: "有不舒服的事當天說開，不讓另一半猜心，小誤會就不會累積。" };
  } else if (main.kind === "相刑") {
    body = `${main.pair}相刑，生活上容易為小事互相要求、互不相讓；${PUNISH_TIP[main.name]}`;
    fact = { score: -0.3, chip: "日支相刑", phrase: `夫妻宮${main.pair}相刑，生活上容易互相要求`, focus: "多一點包容就好", advice: "提醒另一半之前，先說一句肯定或感謝的話，兩人都比較聽得進去。" };
  } else {
    body = `${main.pair}相破，生活中的小計畫偶爾會被打亂，影響不大，彼此多一點彈性就好`;
    fact = { score: -0.15, chip: "日支相破", phrase: `夫妻宮${main.pair}相破，小計畫偶被打亂`, focus: "多一點彈性就好", advice: "計畫保留一點彈性，臨時有變也別太放在心上。" };
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
    const strength = s >= STRONG ? `在${X.n}的命盤裡約佔 ${pct(s)}，力量明顯` : s >= 0.15 ? `在${X.n}的命盤裡約佔 ${pct(s)}，力量適中`
      : s >= 0.005 ? `在${X.n}的命盤裡只佔約 ${pct(s)}，力量偏弱` : `在${X.n}的命盤裡幾乎看不到`;
    let t = neutral
      ? `${X.n}的日干${X.day.stem}${X.el}，伴侶星是${sp.els[0]}（財星）和${sp.els[1]}（官殺），${strength}`
      : `${X.n}是${X.male ? "男命" : "女命"}，日干${X.day.stem}${X.el}的${sp.word}是${sp.els[0]}，${strength}`;
    if (match) {
      const god = tenGod(X.day.stem, Y.day.stem);   // 正財、偏財 for 財, 正官、七殺 for 官殺
      t += `；${Y.n}的日干${Y.day.stem}${Y.el}是${X.n}的${god}${god === "正財" || god === "正官" ? "，傳統上視為正緣" : ""}`;
      if (s < 0.15) t += `。${X.n}命中的${sp.word}本來偏弱，${Y.n}正好補上這一塊`;
      else if (s >= STRONG) t += `。${sp.word}在${X.n}命中本來就有力，${Y.n}又正是這個五行，緣分明朗`;
    } else {
      t += `；${Y.n}的日干${Y.day.stem}${Y.el}不是${sp.els.join("或")}`;
      if (s < 0.15) t += `。${sp.word}偏弱的人感情上比較含蓄，多把心意說出口會更好`;
    }
    return { label: `${X.n}的${sp.word}`, text: end(t), match, word: sp.word };
  };
  const la = line(A, B), lb = line(B, A);
  const intro = neutral
    ? "傳統合婚依男女來看：男命看財星、女命看官殺，合稱配偶星。兩位的性別相同，這裡兩種都看，合稱伴侶星；合婚時看一方的日干是不是落在另一方的伴侶星上，以及伴侶星在自己命盤裡的強弱。"
    : "傳統上，男命以財星為妻星、女命以官殺為夫星，合稱配偶星；合婚時會看一方的日干是不是落在另一方的配偶星上，以及配偶星在自己命盤裡的強弱。";
  const words = neutral ? "伴侶星" : "配偶星";
  let verdict;
  if (la.match && lb.match) {
    verdict = `${B.n}的日干${B.day.stem}${B.el}正是${A.n}的${la.word}，${A.n}的日干${A.day.stem}${A.el}也正是${B.n}的${lb.word}，兩人互為${words}，是傳統合婚裡的好兆頭。`;
    c.facts.push({ score: 0.4, chip: `互為${words}`, phrase: `兩人互為${words}` });
  } else if (la.match || lb.match) {
    const [X, Y, l] = la.match ? [A, B, la] : [B, A, lb];
    verdict = `${Y.n}的日干${Y.day.stem}${Y.el}正是${X.n}的${l.word}，是傳統合婚裡的好兆頭。`;
    c.facts.push({ score: 0.3, chip: `${words}相應`, phrase: `${Y.n}的日干正是${X.n}的${l.word}` });
  } else verdict = `兩人的日干都不落在彼此的${words}上，這在合婚裡很常見，${words}只是參考之一。`;
  return section("star", [intro + verdict], [{ label: la.label, text: la.text }, { label: lb.label, text: lb.text }]);
}

// ---------- 5 用神互補 ----------
// What Y's chart brings to X: X's 用神 in Y's chart, the role Y's strongest element plays for X (what relate() scores
// for the first person), and X's 忌神 when Y has plenty of it.
function usefulFrom(c, X, Y, scored) {
  const u = X.useful, t = Y.top, parts = [];
  if (u) {
    const s = Y.share[u], head = `${X.n}的用神是${u}`;
    if (t === u) parts.push(`${head}，${u}正是${Y.n}命盤裡最旺的五行（約 ${pct(s)}），正好補到${X.n}最需要的地方；傳統上${u}旺的人${GIFT[u](X.n)}`);
    else if (s >= STRONG) parts.push(`${head}，${Y.n}的命盤裡${u}約佔 ${pct(s)}，分量很足，正好補到${X.n}最需要的地方`);
    else if (s >= 0.15) parts.push(`${head}，${Y.n}的命盤裡${u}約佔 ${pct(s)}，有一定的分量，能幫上${X.n}一些`);
    else if (s >= 0.005) parts.push(`${head}，${Y.n}的命盤裡${u}只佔約 ${pct(s)}，這方面${X.n}要靠自己在生活中補足`);
    else parts.push(`${head}，${Y.n}的命盤裡幾乎沒有${u}，這方面${X.n}要靠自己在生活中補足`);
  } else parts.push(`${X.n}的命盤各派喜忌接近，沒有特別突出的用神，${Y.n}的五行對${X.n}影響不大`);
  const role = X.roles[t];
  if (t !== u && X.a.useful.includes(t)) {
    parts.push(`${Y.n}命盤最旺的${t}也是${X.n}的${role}，整體來說${Y.n}的五行對${X.n}有幫助`);
    c.facts.push({ score: scored ? 0.5 : 0.15, chip: scored ? `${Y.n}旺${X.n}所喜` : null, phrase: `${Y.n}命盤最旺的${t}是${X.n}的${role}` });
  } else if (X.a.avoid.includes(t)) {
    parts.push(scored
      ? `不過${Y.n}命盤最旺的${t}是${X.n}的${role}：傳統上${t}旺的人${EXCESS[t]}，有時會讓${X.n}覺得有壓力，把感受說出來、保留各自充電的空間就好`
      : `不過${Y.n}命盤最旺的${t}是${X.n}的${role}：傳統上${t}旺的人${EXCESS[t]}，${X.n}有時會覺得步調不合，彼此多體諒步調的差異就好`);
    c.facts.push({ score: scored ? -0.5 : -0.15, chip: scored ? `${Y.n}旺${X.n}所忌` : null, phrase: `${Y.n}命盤最旺的${t}是${X.n}的${role}`, focus: "相處時保留各自的空間就好", burden: { X, Y, t } });
  }
  if (X.ji && X.ji !== t && Y.share[X.ji] >= STRONG) {
    parts.push(`${Y.n}命盤裡的${X.ji}也偏多（約 ${pct(Y.share[X.ji])}），${X.ji}是${X.n}的忌神，兩人意見不同時，先停下來聽聽彼此的理由`);
  }
  return end(parts.join("；"));
}
function usefulSection(c) {
  const { A, B } = c;
  const hour = A.hourless && B.hourless ? "兩人的時辰都不詳，五行以年、月、日三柱估算。"
    : A.hourless || B.hourless ? `${(A.hourless ? A : B).n}的時辰不詳，五行以年、月、日三柱估算。` : "";
  const ab = usefulStrong(A, B), ba = usefulStrong(B, A);
  let verdict;
  if (ab && ba) {
    verdict = `兩人的用神互補：${A.n}最需要的${A.useful}在${B.n}的命盤裡很旺，${B.n}最需要的${B.useful}在${A.n}的命盤裡也很旺，是合婚裡很實在的優點。`;
    c.facts.push({ score: 0.6, chip: "用神互補", phrase: "兩人用神互補" });
  } else if (ab || ba) {
    const [X, Y] = ab ? [A, B] : [B, A];
    const back = Y.useful ? `${X.n}能補給${Y.n}的比較少，${Y.n}需要的${Y.useful}要靠生活中的其他方面補足` : `${Y.n}的命盤喜忌接近，沒有特別需要補的五行`;
    verdict = `用神方面，${Y.n}的命盤補得到${X.n}最需要的${X.useful}；${back}。`;
    // relate() counts it when the partner's strongest element is one you like.
    c.facts.push({ score: ab && A.a.useful.includes(B.top) ? 0.5 : 0.35, chip: `${Y.n}補${X.n}用神`, phrase: `${Y.n}的命盤補得到${X.n}的用神` });
  } else verdict = "用神方面兩人沒有明顯的互補，各自照顧好自己需要的五行就好。";
  const items = [
    { label: `${B.n}帶給${A.n}`, text: usefulFrom(c, A, B, true) },
    { label: `${A.n}帶給${B.n}`, text: usefulFrom(c, B, A, false) },
  ];
  return section("useful", [hour + verdict], items);
}

// ---------- 6 五行互補 ----------
// Elements X lacks among its eight (or six) characters that Y has at least two of; an element X dislikes is no gap.
function fills(X, Y) {
  return ELEMENTS.filter(e => !X.chars[e].length && Y.chars[e].length >= 2 && !X.a.avoid.includes(e)).map(e => {
    const hid = uniq(X.ps.filter(p => p.hidden.some(h => h.el === e)).map(p => p.branch));
    const where = X.hourless ? "已知的六個字裡" : "的八字裡";
    const role = X.roles[e];
    const roleNote = role === "用神" ? `；${e}又正是${X.n}的用神，補得正是地方` : role === "喜神" ? `；${e}也是${X.n}的喜神` : "";
    const has = `${Y.n}${Y.hourless ? "已知的六個字裡" : "的八字"}有${COUNT[Y.chars[e].length]}個${e}（${Y.chars[e].join("、")}）`;
    return { e, text: `${X.n}${where}${hid.length ? `看不到${e}（只藏在${hid.join("、")}裡）` : `沒有${e}`}，${has}，正好補上${roleNote}` };
  });
}
function elementsSection(c) {
  const { A, B } = c;
  const ab = fills(A, B), ba = fills(B, A);
  if (!ab.length && !ba.length) return null;
  const [X, Y, f] = ab.length ? [A, B, ab] : [B, A, ba];
  const tail = ab.length && ba.length ? "兩人互相補足彼此缺的五行，是很典型的五行互補。"
    : `這是${Y.n}帶給${X.n}的互補：在一起時，${X.n}平常比較少展現的那一面，比較容易被帶出來。`;
  c.facts.push({ score: 0.3, chip: "五行互補", phrase: ab.length && ba.length ? "五行互相補足" : `${Y.n}補上${X.n}缺的${f.map(x => x.e).join("、")}` });
  return section("elements", [`${[...ab, ...ba].map(x => end(x.text)).join("")}${tail}`]);
}

// ---------- 7 年柱納音 ----------
function nayinSection(c) {
  const { A, B } = c;
  const na = nayinOf(A.names[0]), nb = nayinOf(B.names[0]), ea = na.slice(-1), eb = nb.slice(-1);
  const head = A.names[0] === B.names[0] ? `兩人的年柱都是${A.names[0]}，納音同為${na}`
    : na === nb ? `${A.n}的年柱${A.names[0]}和${B.n}的年柱${B.names[0]}，納音同為${na}`
      : `${A.n}的年柱${A.names[0]}納音是${na}，${B.n}的年柱${B.names[0]}納音是${nb}`;
  let rel;
  if (ea === eb) { rel = `${na === nb ? "" : `同屬${ea}，`}屬於比和，傳統上主氣味相投、相處平順`; c.facts.push({ score: 0.05, chip: "納音比和" }); }
  else if (GENERATES[ea] === eb || GENERATES[eb] === ea) {
    const [x, y] = GENERATES[ea] === eb ? [ea, eb] : [eb, ea];
    rel = `${x}生${y}，屬於相生，傳統上視為彼此扶持的好組合`;
    c.facts.push({ score: 0.1, chip: "納音相生" });
  } else {
    const [x, y] = CONTROLS[ea] === eb ? [ea, eb] : [eb, ea];
    rel = `${x}剋${y}，屬於相剋，傳統上會提醒兩人多一分包容`;
  }
  return section("nayin", [`${head}，${rel}。納音是比較古老的合婚方法，現在多半只當參考，比重遠不如日柱與五行。`]);
}

// ---------- 8 綜合來看、摘要、亮點、建議 ----------
const positives = c => c.facts.filter(f => f.phrase && f.score >= 0.1).sort((x, y) => y.score - x.score);
const negatives = c => c.facts.filter(f => f.phrase && f.score <= -0.1).sort((x, y) => x.score - y.score);

function closingSection(c, tone) {
  const pos = positives(c).slice(0, 3), neg = negatives(c).slice(0, 2);
  const lead = `整體來看，${c.A.n}和${c.B.n}的命盤${TONE_LEAD[tone]}${pos.length || neg.length ? "。" : "，彼此之間沒有明顯的合沖。"}`;
  const good = pos.length ? `契合的地方：${pos.map(f => f.phrase).join("；")}。` : "";
  const care = neg.length ? `需要多用心的地方：${neg.map((f, i) => (i === 0 && f.focus ? `${f.phrase}，${f.focus}` : f.phrase)).join("；")}。` : "";
  return section("closing", [lead + good + care + TONE_WRAP[tone]]);
}

// Facts are separated by 「；」; the first tension carries its suggestion. 需要磨合 leads with the tensions.
function summaryOf(c, tone) {
  const pos = positives(c), neg = negatives(c), lead = `${c.A.n}和${c.B.n}的命盤${TONE_LEAD[tone]}`;
  const sayNeg = (f, i) => (i === 0 && f.focus ? `${f.phrase}，${f.focus}` : f.phrase);
  let s1;
  if (tone === "需要磨合") {
    const n = neg.slice(0, 2).map(sayNeg);
    s1 = `${lead}${n.length ? `：${n.join("；")}` : ""}。${pos.length ? `好在${pos[0].phrase}。` : ""}`;
  } else {
    const list = [...pos.slice(0, 2).map(f => f.phrase), ...neg.slice(0, 1).map(sayNeg)];
    s1 = list.length ? `${lead}${tone === "平穩" && pos.length && neg.length ? "，好壞互見" : ""}：${list.join("；")}。` : `${lead}，彼此之間沒有明顯的合沖，好壞都不極端。`;
  }
  return s1 + TRADITION;
}

// When each person's strongest element is one the other dislikes, that is one point to work on, not two.
function mergeBurdens(c) {
  const [first, second] = c.facts.filter(f => f.burden);
  if (!second) return;
  c.facts = c.facts.filter(f => f !== second);
  Object.assign(first, { score: first.score + second.score, phrase: "兩人命盤最旺的五行剛好都是另一方所忌", both: true });
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
    if (f.both) return ["兩人命盤最旺的五行，剛好都是另一方比較忌的：覺得有壓力時直接說出感受，也各自保留獨處、充電的時間。"];
    const { X, Y, t } = f.burden;
    return [`${Y.n}的命盤${t}旺，${X.n}覺得步調不合或有壓力時，可以直接說出感受，兩人也各自保留獨處、充電的時間。`];
  });
  const along = c.facts.find(f => f.advice && f.score > 0);   // 日干相生、比和: how to keep it balanced
  if (along) out.push(along.advice);
  const shared = A.a.useful.filter(e => B.a.useful.includes(e));
  if (shared.length) out.push(`兩人的喜用都有${shared.join("、")}：${TOGETHER[shared[0]]}，對兩人都有幫助。`);
  else {
    const clashX = [[A, B], [B, A]].find(([X, Y]) => X.useful && Y.a.avoid.includes(X.useful));
    if (clashX) {
      const [X, Y] = clashX;
      out.push(`${X.n}需要的${X.useful}正好是${Y.n}的${Y.roles[X.useful]}：佈置居家或安排休閒時，各自保留一個角落、一段時間，照自己的方式充電。`);
    }
  }
  const list = uniq(out).slice(0, 4);
  for (const g of GENERIC_ADVICE) if (list.length < 2) list.push(g);
  return list;
}

// ---------- 主程式 ----------
export function partnerReading({ me, partner, order = SECTION_IDS }) {
  me = { ...me, analysis: me.analysis || analyse(me.pillars) };
  partner = { ...partner, analysis: partner.analysis || analyse(partner.pillars) };
  const bond = relate({ pillars: me.pillars, analysis: me.analysis }, { pillars: partner.pillars, analysis: partner.analysis });
  let an = cleanName(me.name), bn = cleanName(partner.name);
  if (an && an === bn) an = bn = null;
  const neutral = !!me.sex && me.sex === partner.sex;
  const c = { A: personOf(me, an || "你"), B: personOf(partner, bn || "對方"), facts: [], neutral };
  // Facts are gathered in the usual order (the summary and the chips rank them), then shown in `order`.
  const built = [zodiacSection(c), daySection(c), palaceSection(c), starSection(c), usefulSection(c), elementsSection(c), nayinSection(c)].filter(Boolean);
  mergeBurdens(c);
  built.push(closingSection(c, bond.tone));
  const rank = id => { const i = order.indexOf(id); return i < 0 ? order.length + SECTION_IDS.indexOf(id) : i; };
  const sections = built.slice().sort((x, y) => rank(x.id) - rank(y.id));
  const summary = summaryOf(c, bond.tone), advice = adviceOf(c), highlights = highlightsOf(c);
  const gloss = glosser();
  const glossedSummary = gloss(summary);
  const glossed = sections.map(s => ({ ...s, paragraphs: s.paragraphs.map(gloss), items: s.items.map(it => ({ label: it.label, text: gloss(it.text) })) }));
  return { net: bond.net, tone: bond.tone, title: "伴侶合盤", summary: glossedSummary, highlights, chips: chipKinds(c, highlights), sections: glossed, advice: advice.map(gloss), neutral };
}
