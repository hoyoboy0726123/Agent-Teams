// 命盤解讀：日主強弱與五行喜忌。
//
// The schools disagree, sometimes completely, so each one is computed on its own and kept:
//   扶抑  support a weak day master, drain a strong one (strength scored from stems and hidden stems)
//   調候  balance the season by 窮通寶鑑: the stems each day master needs in its birth month (core/tiaohou.js); winter
//         births also dislike more water, summer births more fire
//   格局  the structure set by the month branch, with its classic likes and dislikes (simplified 子平真詮)
// They are then blended with weights (扶抑 first by default). Where they disagree the blend moves toward
// neutral on its own, and the page can say how many schools hold each view.
import { SixtyCycle, HeavenStem } from "tyme4ts";
import { zh } from "./zh.js";
import { tiaohouStems } from "./tiaohou.js";
import { fill } from "../sim/grammar.js";
import { tr, trw, trJoin } from "./tr.js";

export const ELEMENTS = ["木", "火", "土", "金", "水"];
export const GROUPS = ["比劫", "食傷", "財", "官殺", "印"];
export const SCHOOLS = ["扶抑", "調候", "格局"];
const GENERATES = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const CONTROLS = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
const SEASON = { 寅: "春", 卯: "春", 辰: "春", 巳: "夏", 午: "夏", 未: "夏", 申: "秋", 酉: "秋", 戌: "秋", 亥: "冬", 子: "冬", 丑: "冬" };

export const HIDDEN_WEIGHTS = { "5-2-1": [1, 2, 5], "12-6-3": [3, 6, 12] };   // indexed by type: residual, middle, main
export const SCHOOL_WEIGHTS = {
  blend: { 扶抑: 0.5, 調候: 0.25, 格局: 0.25 },
  扶抑: { 扶抑: 1, 調候: 0, 格局: 0 },
  調候: { 扶抑: 0, 調候: 1, 格局: 0 },
  格局: { 扶抑: 0, 調候: 0, 格局: 1 },
};

// The ten-god group an element plays for a day master of element `dm`.
export function groupOf(dm, e) {
  if (e === dm) return "比劫";
  if (GENERATES[dm] === e) return "食傷";
  if (CONTROLS[dm] === e) return "財";
  if (CONTROLS[e] === dm) return "官殺";
  return "印";
}
export const elementOf = (dm, group) => ELEMENTS.find(e => groupOf(dm, e) === group);

const pillars = new Map();
export function pillarOf(name) {
  let p = pillars.get(name);
  if (!p) {
    const sc = SixtyCycle.fromName(name), stem = sc.getHeavenStem(), branch = sc.getEarthBranch();
    p = {
      name, stem: stem.getName(), branch: branch.getName(), stemEl: stem.getElement().getName(), branchEl: branch.getElement().getName(),
      yang: stem.getYinYang() === 1,
      hidden: branch.getHideHeavenStems().slice().sort((a, b) => b.getType() - a.getType())
        .map(h => ({ stem: h.getHeavenStem().getName(), el: h.getHeavenStem().getElement().getName(), type: h.getType() })),
    };
    pillars.set(name, p);
  }
  return p;
}
export const tenGod = (dayStem, stem) => zh(HeavenStem.fromName(dayStem).getTenStar(HeavenStem.fromName(stem)).getName());

// Strength of each element. Every stem but the day stem counts 1; every branch counts 1, split over its hidden
// stems by type; the month branch (月令) counts `month` times.
export function elementScores(names, { hidden = "5-2-1", month = 2 } = {}) {
  const w = HIDDEN_WEIGHTS[hidden];
  const score = Object.fromEntries(ELEMENTS.map(e => [e, 0]));
  names.forEach((name, i) => {
    const p = pillarOf(name);
    if (i !== 2) score[p.stemEl] += 1;
    const total = p.hidden.reduce((s, h) => s + w[h.type], 0);
    for (const h of p.hidden) score[h.el] += (w[h.type] / total) * (i === 1 ? month : 1);
  });
  return score;
}

const groupVotes = (dm, votes) => Object.fromEntries(ELEMENTS.map(e => [e, votes[groupOf(dm, e)] || 0]));

function fuyi(dm, support, rooted) {
  if (support < 0.12 && !rooted) return { verdict: "從弱", note: "日主極弱又沒有根，順從旺的一方", votes: { 比劫: -1, 印: -1, 食傷: 0.5, 財: 1, 官殺: 1 } };
  if (support > 0.88) return { verdict: "專旺", note: "日主極旺，順著它的氣勢", votes: { 比劫: 1, 印: 0.5, 食傷: 0.5, 財: -0.5, 官殺: -1 } };
  // Two of the five elements support the day master, so a typical chart scores about 0.40. The cut-offs split
  // random charts roughly 38 % weak, 25 % balanced, 37 % strong.
  if (support >= 0.45) return { verdict: "身強", note: "日主偏強，喜歡被洩、被耗、被剋", votes: { 比劫: -1, 印: -1, 食傷: 1, 財: 1, 官殺: 1 } };
  if (support <= 0.35) return { verdict: "身弱", note: "日主偏弱，喜歡被生、被幫", votes: { 比劫: 1, 印: 1, 食傷: -1, 財: -1, 官殺: -1 } };
  const lean = support > 0.4 ? 1 : -1;
  return { verdict: "中和", note: "日主強弱適中，只有輕微偏好", votes: { 比劫: -0.5 * lean, 印: -0.5 * lean, 食傷: 0.5 * lean, 財: 0.5 * lean, 官殺: 0.5 * lean } };
}

// 從弱 follows what drains it most (子平 從兒、從財、從殺). When the top two drains are close, the third decides: if it
// is weak too, the pair's flow names the structure (食傷生財 and 財官相生 follow the heavier one; 食傷 against 官殺 is
// 從勢); when all three are heavy it is 從勢, which 《滴天髓》 says needs 財 to make peace between 食傷 and 官殺. 專旺 takes its classical
// name (曲直 in 寅卯辰 and so on) only in its own season and only when 印 does not outweigh the day master's element;
// when 印 is heavier it is 從強, which fears 財 and 官殺 and does not want 食傷 either. In all of these the day master
// is no longer balanced, so 調候 and 格局 step aside (when 扶抑 takes part in the blend) and these votes rule.
export const FOLLOW = {
  從兒: { votes: { 比劫: 0, 印: -1, 食傷: 1, 財: 0.8, 官殺: -0.5 }, note: "順從食傷，喜財星流通；最怕印星奪食，也不喜官殺" },
  從財: { votes: { 比劫: -1, 印: -1, 食傷: 0.8, 財: 1, 官殺: 0.5 }, note: "順從財星，喜食傷生財；最怕比劫奪財、印星生身" },
  從殺: { votes: { 比劫: -1, 印: -1, 食傷: -1, 財: 0.8, 官殺: 1 }, note: "順從官殺，喜財星生殺；最怕食傷制殺、印比扶身" },
  從勢: { votes: { 比劫: -1, 印: -1, 食傷: 0.5, 財: 1, 官殺: 0.7 }, note: "食傷、財、官殺都有勢力而不從一神，宜行財運居中調和；最怕印比扶身" },
};
// 食傷 and 官殺 close with little 財: still 從勢, and 財 is what reconciles them.
const SHI_GUAN = { votes: FOLLOW.從勢.votes, note: "食傷與官殺相持而財星不足，宜行財運通關調和；最怕印比扶身" };
// 財 a little ahead of 食傷 with little 官殺: 食傷生財, followed as 從財; 官殺 would only fight the 食傷.
const CAI_SHI = { votes: { 比劫: -1, 印: -1, 食傷: 0.8, 財: 1, 官殺: 0 }, note: "順從財星，喜食傷生財；最怕比劫奪財、印星生身" };
// 財 and 官殺 close with little 食傷: 財官相生, and 食傷 would only fight the 官殺.
const CAI_GUAN = { votes: { 比劫: -1, 印: -1, 食傷: 0, 財: 1, 官殺: 0.8 }, note: "順從財星，財官相生；最怕比劫奪財、印星生身" };
// 《滴天髓》 on 從強: 「純行比劫運則吉，印綬運亦佳，食傷運有印綬衝剋必凶，財官運為觸怒強神，大凶」.
export const CONGQIANG = { votes: { 比劫: 1, 印: 0.8, 食傷: -0.5, 財: -1, 官殺: -1 }, note: "印星與比劫成勢，順其強勢，喜比劫、印星；最怕財星壞印、官殺觸怒，也不宜食傷洩氣" };
const FOLLOW_OF = { 食傷: "從兒", 財: "從財", 官殺: "從殺" };
const ZHUANWANG = { 木: ["曲直格", "寅卯辰"], 火: ["炎上格", "巳午未"], 土: ["稼穡格", "辰戌丑未"], 金: ["從革格", "申酉戌"], 水: ["潤下格", "亥子丑"] };
const LEAD = 1.25;   // a drain leads when it is a quarter heavier than the next one
const THIRD = 0.6;   // the third drain counts as heavy when it reaches 60 % of the second
function special(verdict, dm, monthBranch, scores) {
  if (verdict === "從弱") {
    const ranked = ["食傷", "財", "官殺"].map(g => [g, scores[elementOf(dm, g)]]).sort((x, y) => y[1] - x[1]);
    const [[top, a], [second, b], [third, c]] = ranked;
    let kind, rule, heavy = [top];
    if (a >= LEAD * b) kind = FOLLOW_OF[top];
    else if (c >= THIRD * b) { kind = "從勢"; heavy = [top, second, third]; }
    else {
      heavy = [top, second];
      const pair = new Set(heavy);
      if (pair.has("食傷") && pair.has("財")) { kind = FOLLOW_OF[top]; if (kind === "從財") rule = CAI_SHI; }   // 食傷生財
      else if (pair.has("財")) { kind = FOLLOW_OF[top]; if (kind === "從財") rule = CAI_GUAN; }               // 財官相生
      else { kind = "從勢"; rule = SHI_GUAN; }                                                               // 食傷 faces 官殺
    }
    rule = rule || FOLLOW[kind];
    return { kind, name: `${kind}格`, note: rule.note, votes: rule.votes, follows: Object.keys(FOLLOW_OF).find(g => FOLLOW_OF[g] === kind) || null, heavy: ["食傷", "財", "官殺"].filter(g => heavy.includes(g)) };
  }
  if (verdict === "專旺") {
    // The scores leave the day stem out; it is the day master's own element too, so it counts here.
    if (scores[elementOf(dm, "印")] > scores[dm] + 1) return { kind: "從強", name: "從強格", note: CONGQIANG.note, votes: CONGQIANG.votes, follows: null };
    const [name, season] = ZHUANWANG[dm];
    return { kind: "專旺", name: season.includes(monthBranch) ? name : "專旺格", note: "順其旺氣、喜食傷洩秀；最怕官殺逆勢剋制", votes: null, follows: null };
  }
  return null;
}

// The 窮通寶鑑 stems vote in order (1, 0.6, 0.35, then 0.2); a cold winter also votes against water and a hot summer
// against fire, unless the book itself calls for that element.
const STEM_ELEMENT = { 甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水" };
function tiaohou(dayStem, monthBranch) {
  const season = SEASON[monthBranch], stems = tiaohouStems(dayStem, monthBranch), votes = {};
  stems.forEach((st, i) => { const e = STEM_ELEMENT[st]; votes[e] = Math.max(votes[e] || 0, [1, 0.6, 0.35][i] ?? 0.2); });
  const cold = season === "冬" && !votes.水, hot = season === "夏" && !votes.火;
  if (cold) votes.水 = -1;
  if (hot) votes.火 = -1;
  // The note stays Chinese in the analysis (it is data); tiaohouNote below is the same sentence for a reader.
  return { verdict: `${season}生`, note: fill(TIAOHOU_NOTE, tiaohouVars(dayStem, monthBranch, stems, false)), votes, stems };
}
const TIAOHOU_NOTE = "{climate}依《窮通寶鑑》，{stem}日主生於{branch}月，調候用{stems}";
function tiaohouVars(dayStem, monthBranch, stems, shown) {
  const season = SEASON[monthBranch];
  const climate = season === "冬" ? "生在冬天，命局偏寒，" : season === "夏" ? "生在夏天，命局偏燥，" : "";
  const stem = `${dayStem}${STEM_ELEMENT[dayStem]}`;
  return shown ? { climate: climate && trw(climate), stem: trw(stem), branch: trw(monthBranch), stems: trJoin(stems.map(trw)) }
    : { climate, stem, branch: monthBranch, stems: stems.join("、") };
}
// The 調候 note of a day stem and month branch, in the reading's language, ending with a full stop.
export const tiaohouNote = (dayStem, monthBranch) => tr("{climate}依《窮通寶鑑》，{stem}日主生於{branch}月，調候用{stems}。", tiaohouVars(dayStem, monthBranch, tiaohouStems(dayStem, monthBranch), true));

// Likes and dislikes per structure, by ten-god group (simplified from 子平真詮).
const PATTERNS = {
  正官: { 財: 1, 印: 1, 食傷: -1 },
  七殺: { 食傷: 1, 印: 1, 財: -1 },
  正財: { 食傷: 1, 官殺: 1, 比劫: -1 },
  偏財: { 食傷: 1, 官殺: 1, 比劫: -1 },
  正印: { 官殺: 1, 財: -1 },
  偏印: { 官殺: 1, 財: -1 },
  食神: { 財: 1, 印: -1 },
  傷官: { 財: 1, 印: 0.5, 官殺: -1 },
  比肩: { 官殺: 1, 財: 0.5, 食傷: 0.5, 比劫: -1, 印: -0.5 },
  劫財: { 官殺: 1, 財: 0.5, 食傷: 0.5, 比劫: -1, 印: -0.5 },
};
const PATTERN_NAMES = { 比肩: "建祿格", 劫財: "月刃格" };
function geju(dayStem, monthPillar) {
  const main = pillarOf(monthPillar).hidden[0].stem;
  const god = tenGod(dayStem, main);
  return { verdict: PATTERN_NAMES[god] || `${god}格`, note: `月令本氣是${main}，對日主來說是${god}`, votes: PATTERNS[god] };
}

export function analyse(names, { hidden = "5-2-1", month = 2, school = "blend" } = {}) {
  const day = pillarOf(names[2]), dm = day.stemEl, monthBranch = pillarOf(names[1]).branch;
  const scores = elementScores(names, { hidden, month });
  const total = ELEMENTS.reduce((s, e) => s + scores[e], 0);
  const supportEl = [dm, elementOf(dm, "印")];
  const support = (scores[supportEl[0]] + scores[supportEl[1]]) / total;
  const rooted = names.some(n => pillarOf(n).hidden.some(h => h.el === dm));

  const fy = fuyi(dm, support, rooted), t = tiaohou(day.stem, monthBranch), g = geju(day.stem, names[1]);
  const sp = special(fy.verdict, dm, monthBranch, scores);
  const f = sp && sp.votes ? { ...fy, note: `${fy.note}：${sp.name}，${sp.note}`, votes: sp.votes } : fy;
  const weights = SCHOOL_WEIGHTS[school];
  // 從格／專旺: the other two schools step aside, unless the reader chose one of them alone.
  const aside = !!sp && weights.扶抑 > 0;
  const schools = {
    扶抑: { ...f, element: groupVotes(dm, f.votes) },
    調候: { ...t, element: Object.fromEntries(ELEMENTS.map(e => [e, t.votes[e] || 0])), ...(aside ? { abstain: true } : {}) },
    格局: { ...g, element: groupVotes(dm, g.votes), ...(aside ? { abstain: true } : {}) },
  };
  const favor = {}, views = {};
  for (const e of ELEMENTS) {
    let sum = 0, wsum = 0;
    for (const s of SCHOOLS) {
      if (!weights[s] || schools[s].abstain) continue;
      sum += weights[s] * schools[s].element[e];
      wsum += weights[s];
    }
    favor[e] = wsum ? Math.round(sum / wsum * 100) / 100 : 0;
    const voting = SCHOOLS.filter(s => !schools[s].abstain);
    views[e] = { likes: voting.filter(s => schools[s].element[e] > 0), dislikes: voting.filter(s => schools[s].element[e] < 0), voting: voting.length };
  }
  const byFavor = ELEMENTS.slice().sort((a, b) => favor[b] - favor[a]);
  return {
    dayMaster: { stem: day.stem, element: dm, yang: day.yang },
    scores: Object.fromEntries(ELEMENTS.map(e => [e, Math.round(scores[e] * 100) / 100])),
    support: Math.round(support * 1000) / 1000,
    rooted,
    strength: f.verdict,
    special: sp ? { kind: sp.kind, name: sp.name, note: sp.note, follows: sp.follows, ...(sp.heavy ? { heavy: sp.heavy } : {}) } : null,
    pattern: g.verdict,
    season: t.verdict,
    schools,
    favor,
    views,
    useful: byFavor.filter(e => favor[e] >= 0.25),
    avoid: byFavor.filter(e => favor[e] <= -0.25).reverse(),
    groups: Object.fromEntries(GROUPS.map(gr => [gr, elementOf(dm, gr)])),
  };
}

// "3 派中有 2 派認為喜火" style lines for each element with a clear view.
export function describeViews(a) {
  return ELEMENTS.flatMap(e => {
    const v = a.views[e];
    const side = a.favor[e] > 0 ? ["喜", v.likes] : a.favor[e] < 0 ? ["忌", v.dislikes] : null;
    const vars = side && { voting: v.voting, n: side[1].length, e: trw(e), schools: trJoin(side[1].map(trw)) };
    return side && side[1].length ? [side[0] === "喜" ? tr("{voting} 派中有 {n} 派認為喜{e}（{schools}）", vars) : tr("{voting} 派中有 {n} 派認為忌{e}（{schools}）", vars)] : [];
  });
}
