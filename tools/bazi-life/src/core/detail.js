// 命盤細節：神煞、干支關係（刑沖合害）、五行旺相休囚死、太歲、身強身弱的依據、十神分布、用喜忌仇閒。
//
// Every table is a classical rule as Taiwanese 排盤 software usually applies it. Where schools differ, the choice is
// written beside the table. The tables were cross-checked against shunshi-bazi-core 0.2.0 (MIT); three places
// deliberately differ from it: 寡宿 comes from the year branch (亥子丑見戌…), 十惡大敗 has 己丑 (not 壬戌), and 勾絞
// takes both the third branch before and after the year branch.
//
// Pillars are named by role: year, month, day, hour (the hour may be missing when the birth time is unknown). Luck
// pillars use the roles decade (大運) and flow (流年).
import { SixtyCycle } from "tyme4ts";
import { pillarOf, tenGod, groupOf, ELEMENTS } from "./analysis.js";
import { zh } from "./zh.js";

export const STEMS = "甲乙丙丁戊己庚辛壬癸";
export const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
export const ROLES = ["year", "month", "day", "hour"];
export const ROLE_NAME = { year: "年", month: "月", day: "日", hour: "時", decade: "大運", flow: "流年" };
const bi = b => BRANCHES.indexOf(b);
const at = (b, k) => BRANCHES[(bi(b) + k + 120) % 12];
const GENERATES = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const CONTROLS = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

// What each pillar stands for (宮位), and the stage of life it colours most.
export const PALACE = {
  year: { stem: "祖上與長輩", branch: "祖上、童年的家境", life: "童年" },
  month: { stem: "父母", branch: "父母兄弟、成長環境與事業的根基（月令）", life: "青年" },
  day: { stem: "自己", branch: "配偶（夫妻宮）", life: "中年" },
  hour: { stem: "子女", branch: "子女、晚輩與晚年", life: "晚年" },
};

// ---------- 干支關係 ----------
const STEM_COMBINE = { 甲: ["己", "土"], 己: ["甲", "土"], 乙: ["庚", "金"], 庚: ["乙", "金"], 丙: ["辛", "水"], 辛: ["丙", "水"], 丁: ["壬", "木"], 壬: ["丁", "木"], 戊: ["癸", "火"], 癸: ["戊", "火"] };
const STEM_CLASH = { 甲: "庚", 庚: "甲", 乙: "辛", 辛: "乙", 丙: "壬", 壬: "丙", 丁: "癸", 癸: "丁" };
const SIX_COMBINE = { 子: ["丑", "土"], 丑: ["子", "土"], 寅: ["亥", "木"], 亥: ["寅", "木"], 卯: ["戌", "火"], 戌: ["卯", "火"], 辰: ["酉", "金"], 酉: ["辰", "金"], 巳: ["申", "水"], 申: ["巳", "水"], 午: ["未", "土"], 未: ["午", "土"] };
const HARM = { 子: "未", 未: "子", 丑: "午", 午: "丑", 寅: "巳", 巳: "寅", 卯: "辰", 辰: "卯", 申: "亥", 亥: "申", 酉: "戌", 戌: "酉" };
const BREAK = { 子: "酉", 酉: "子", 午: "卯", 卯: "午", 辰: "丑", 丑: "辰", 未: "戌", 戌: "未", 寅: "亥", 亥: "寅", 巳: "申", 申: "巳" };
// 三合: 生、旺、墓. A pair with the 旺 branch is a 半合; 生 with 墓 (no 旺) is a 拱合.
const TRIADS = [["申子辰", "水"], ["亥卯未", "木"], ["寅午戌", "火"], ["巳酉丑", "金"]];
const MEETINGS = [["寅卯辰", "木", "東方"], ["巳午未", "火", "南方"], ["申酉戌", "金", "西方"], ["亥子丑", "水", "北方"]];
const PUNISH = [["寅巳申", "無恩之刑"], ["丑戌未", "恃勢之刑"]];
const SELF_PUNISH = "辰午酉亥";

export const clash = (a, b) => (bi(a) - bi(b) + 12) % 12 === 6;
export const sixCombine = (a, b) => SIX_COMBINE[a] && SIX_COMBINE[a][0] === b;
export const harm = (a, b) => HARM[a] === b;
export const breaks = (a, b) => BREAK[a] === b;
// 刑 between two branches: 子卯, a pair inside 寅巳申 or 丑戌未, or a 自刑 branch meeting itself.
export function punish(a, b) {
  if ((a === "子" && b === "卯") || (a === "卯" && b === "子")) return "無禮之刑";
  if (a === b) return SELF_PUNISH.includes(a) ? "自刑" : null;
  for (const [set, name] of PUNISH) if (set.includes(a) && set.includes(b)) return name;
  return null;
}
const stemsControl = (p, q) => p.yang === q.yang && (CONTROLS[p.stemEl] === q.stemEl || CONTROLS[q.stemEl] === p.stemEl);

// Every relation inside a set of labelled pillars [{ role, stem, branch }]. With `focus` (a role), only the relations
// that include that pillar.
export function relationsAmong(items, focus = null) {
  const out = [];
  const label = (it, part) => `${ROLE_NAME[it.role]}${part === "stem" ? "干" : "支"}${part === "stem" ? it.stem : it.branch}`;
  const keep = list => !focus || list.some(it => it.role === focus);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (!keep([a, b])) continue;
    const pair = [a.role, b.role];
    if (STEM_COMBINE[a.stem] && STEM_COMBINE[a.stem][0] === b.stem) out.push({ kind: "天干五合", part: "stem", roles: pair, element: STEM_COMBINE[a.stem][1], text: `${label(a, "stem")}與${label(b, "stem")}相合（合${STEM_COMBINE[a.stem][1]}）` });
    if (STEM_CLASH[a.stem] === b.stem) out.push({ kind: "天干相沖", part: "stem", roles: pair, text: `${label(a, "stem")}與${label(b, "stem")}相沖` });
    if (sixCombine(a.branch, b.branch)) out.push({ kind: "六合", part: "branch", roles: pair, element: SIX_COMBINE[a.branch][1], text: `${label(a)}與${label(b)}六合（合${SIX_COMBINE[a.branch][1]}）` });
    if (clash(a.branch, b.branch)) out.push({ kind: "六沖", part: "branch", roles: pair, text: `${label(a)}與${label(b)}相沖` });
    const pu = punish(a.branch, b.branch);
    if (pu) out.push({ kind: pu === "自刑" ? "自刑" : "相刑", part: "branch", roles: pair, name: pu, text: `${label(a)}與${label(b)}${pu === "自刑" ? "自刑" : `相刑（${pu}）`}` });
    if (harm(a.branch, b.branch)) out.push({ kind: "六害", part: "branch", roles: pair, text: `${label(a)}與${label(b)}相害` });
    if (breaks(a.branch, b.branch)) out.push({ kind: "相破", part: "branch", roles: pair, text: `${label(a)}與${label(b)}相破` });
    for (const [set, el] of TRIADS) {
      if (a.branch === b.branch || !set.includes(a.branch) || !set.includes(b.branch)) continue;
      const kind = a.branch === set[1] || b.branch === set[1] ? "半合" : "拱合";
      out.push({ kind, part: "branch", roles: pair, element: el, text: `${label(a)}與${label(b)}${kind}${el}局` });
    }
  }
  // Whole 三合, 三會 and 三刑: one branch from each of three different pillars.
  for (const [set, el, side] of [...TRIADS.map(([s, e]) => [s, e, null]), ...MEETINGS]) {
    const holders = [...set].map(b => items.filter(it => it.branch === b));
    if (holders.some(h => !h.length)) continue;
    const roles = holders.map(h => h[0].role);
    if (!keep(holders.flat())) continue;
    out.push(side
      ? { kind: "三會", part: "branch", roles, element: el, text: `${[...set].join("")}三會${side}${el}` }
      : { kind: "三合", part: "branch", roles, element: el, text: `${[...set].join("")}三合${el}局` });
  }
  for (const [set, name] of PUNISH) {
    const holders = [...set].map(b => items.filter(it => it.branch === b));
    if (holders.some(h => !h.length) || !keep(holders.flat())) continue;
    out.push({ kind: "三刑", part: "branch", roles: holders.map(h => h[0].role), name, text: `${[...set].join("")}三刑（${name}）` });
  }
  return out;
}

const itemsOf = names => names.map((n, i) => { const p = pillarOf(n); return { role: ROLES[i], stem: p.stem, branch: p.branch, name: n }; });
export const natalRelations = names => relationsAmong(itemsOf(names));

// The relations a luck pillar (大運 or 流年) makes with the chart, plus 伏吟、反吟 and 歲運並臨.
export function luckRelations(names, decadeName, flowName = null) {
  const natal = itemsOf(names);
  const extra = [];
  if (decadeName) extra.push({ role: "decade", ...pick(decadeName) });
  if (flowName) extra.push({ role: "flow", ...pick(flowName) });
  const focus = flowName ? "flow" : "decade";
  const out = relationsAmong([...natal, ...extra], focus);
  const me = extra.find(x => x.role === focus);
  for (const it of [...natal, ...extra.filter(x => x !== me)]) {
    if (it.name === me.name) out.push({ kind: it.role === "decade" ? "歲運並臨" : "伏吟", roles: [focus, it.role], text: it.role === "decade" ? `流年與大運同為${me.name}（歲運並臨）` : `${ROLE_NAME[focus]}${me.name}與${ROLE_NAME[it.role]}柱相同（伏吟）` });
    else if (clash(me.branch, it.branch) && stemsControl(pillarOf(me.name), pillarOf(it.name))) out.push({ kind: "反吟", roles: [focus, it.role], text: `${ROLE_NAME[focus]}${me.name}與${ROLE_NAME[it.role]}柱${it.name}天剋地沖（反吟）` });
  }
  return out;
}
function pick(name) { const p = pillarOf(name); return { stem: p.stem, branch: p.branch, name }; }

// ---------- 五行旺相休囚死 ----------
const SEASON_OF = { 寅: "春", 卯: "春", 辰: "季", 巳: "夏", 午: "夏", 未: "季", 申: "秋", 酉: "秋", 戌: "季", 亥: "冬", 子: "冬", 丑: "季" };
const STATES = {
  春: { 木: "旺", 火: "相", 水: "休", 金: "囚", 土: "死" }, 夏: { 火: "旺", 土: "相", 木: "休", 水: "囚", 金: "死" },
  秋: { 金: "旺", 水: "相", 土: "休", 火: "囚", 木: "死" }, 冬: { 水: "旺", 木: "相", 金: "休", 土: "囚", 火: "死" },
  季: { 土: "旺", 金: "相", 火: "休", 木: "囚", 水: "死" },   // 辰戌丑未，四季土月
};
export const seasonOf = monthBranch => SEASON_OF[monthBranch];
export const seasonalStates = monthBranch => ({ ...STATES[SEASON_OF[monthBranch]] });

// ---------- 身強身弱的依據 ----------
// 得令: the day master's element is 旺 or 相 in the month. 得地: a branch hides the same element (通根; the 本氣 is
// the strongest root). 得生: a stem or branch 本氣 is the resource (印). 得助: another stem is the same element (比劫).
export function strengthFactors(names) {
  const ps = names.map(pillarOf), day = ps[2], dm = day.stemEl, yin = Object.keys(GENERATES).find(e => GENERATES[e] === dm);
  const state = seasonalStates(ps[1].branch)[dm];
  const roots = [], born = [], helped = [];
  ps.forEach((p, i) => {
    const role = ROLES[i];
    const root = p.hidden.find(h => h.el === dm);
    if (root) roots.push({ role, branch: p.branch, strength: root.type === 2 ? "本氣" : root.type === 1 ? "中氣" : "餘氣" });
    if (i !== 2 && p.stemEl === yin) born.push({ role, part: "stem", name: p.stem });
    if (p.hidden[0].el === yin) born.push({ role, part: "branch", name: p.branch });
    if (i !== 2 && p.stemEl === dm) helped.push({ role, name: p.stem });
  });
  return { state, ling: state === "旺" || state === "相", roots, born, helped };
}

// ---------- 十神分布 ----------
// Visible (透出) gods are the stems other than the day master; hidden ones are the branches' hidden stems.
export function tenGodCounts(names) {
  const ps = names.map(pillarOf), dayStem = ps[2].stem, out = {};
  const add = (god, k, role) => { const o = (out[god] ||= { visible: [], hidden: [], weight: 0 }); o[k].push(role); o.weight += k === "visible" ? 1 : 0; };
  ps.forEach((p, i) => {
    if (i !== 2) add(tenGod(dayStem, p.stem), "visible", ROLES[i]);
    p.hidden.forEach(h => { const god = tenGod(dayStem, h.stem); add(god, "hidden", ROLES[i]); out[god].weight += h.type === 2 ? 0.6 : h.type === 1 ? 0.25 : 0.1; });
  });
  for (const o of Object.values(out)) o.weight = Math.round(o.weight * 100) / 100;
  return out;
}

// 用神、喜神、忌神、仇神、閒神 from the blended likes and dislikes (analysis.js, the same lists as `useful` and `avoid`):
// the most liked element is 用神 and every other liked one 喜神; the most disliked is 忌神 and the other disliked
// ones 仇神; elements with no clear view are 閒神.
export function elementRoles(analysis) {
  const roles = Object.fromEntries(ELEMENTS.map(e => [e, "閒神"]));
  analysis.useful.forEach((e, i) => { roles[e] = i === 0 ? "用神" : "喜神"; });
  analysis.avoid.forEach((e, i) => { roles[e] = i === 0 ? "忌神" : "仇神"; });
  return roles;
}

export { TIAOHOU, tiaohouStems } from "./tiaohou.js";

// ---------- 神煞 ----------
// By the day stem (and for the 貴人 also the year stem) → the branch where the star sits.
const BY_STEM = {
  天乙貴人: { 甲: "丑未", 戊: "丑未", 庚: "丑未", 乙: "子申", 己: "子申", 丙: "亥酉", 丁: "亥酉", 壬: "卯巳", 癸: "卯巳", 辛: "午寅" },
  太極貴人: { 甲: "子午", 乙: "子午", 丙: "卯酉", 丁: "卯酉", 戊: "辰戌丑未", 己: "辰戌丑未", 庚: "寅亥", 辛: "寅亥", 壬: "巳申", 癸: "巳申" },
  文昌貴人: { 甲: "巳", 乙: "午", 丙: "申", 丁: "酉", 戊: "申", 己: "酉", 庚: "亥", 辛: "子", 壬: "寅", 癸: "卯" },
  國印貴人: { 甲: "戌", 乙: "亥", 丙: "丑", 丁: "寅", 戊: "丑", 己: "寅", 庚: "辰", 辛: "巳", 壬: "未", 癸: "申" },
  福星貴人: { 甲: "寅子", 丙: "寅子", 乙: "卯丑", 癸: "卯丑", 丁: "亥", 戊: "申", 己: "未", 庚: "午", 辛: "巳", 壬: "辰" },
};
const BY_DAY_STEM = {
  天廚貴人: { 甲: "巳", 乙: "午", 丙: "巳", 丁: "午", 戊: "申", 己: "酉", 庚: "亥", 辛: "子", 壬: "寅", 癸: "卯" },   // 食神之祿
  學堂: { 甲: "亥", 乙: "午", 丙: "寅", 丁: "酉", 戊: "寅", 己: "酉", 庚: "巳", 辛: "子", 壬: "申", 癸: "卯" },        // 日干長生
  祿神: { 甲: "寅", 乙: "卯", 丙: "巳", 丁: "午", 戊: "巳", 己: "午", 庚: "申", 辛: "酉", 壬: "亥", 癸: "子" },
  金輿: { 甲: "辰", 乙: "巳", 丙: "未", 丁: "申", 戊: "未", 己: "申", 庚: "戌", 辛: "亥", 壬: "丑", 癸: "寅" },
  // 羊刃: 陽干在祿的下一位；陰干這裡用祿的上一位（乙寅、丁巳…），是排盤軟體常見的做法，也有流派認為陰干沒有羊刃。
  羊刃: { 甲: "卯", 乙: "寅", 丙: "午", 丁: "巳", 戊: "午", 己: "巳", 庚: "酉", 辛: "申", 壬: "子", 癸: "亥" },
  飛刃: { 甲: "酉", 乙: "申", 丙: "子", 丁: "亥", 戊: "子", 己: "亥", 庚: "卯", 辛: "寅", 壬: "午", 癸: "巳" },   // 沖羊刃
  紅艷煞: { 甲: "午", 乙: "申", 丙: "寅", 丁: "未", 戊: "辰", 己: "辰", 庚: "戌", 辛: "酉", 壬: "子", 癸: "申" },
  流霞: { 甲: "酉", 乙: "戌", 丙: "未", 丁: "申", 戊: "巳", 己: "午", 庚: "辰", 辛: "卯", 壬: "亥", 癸: "寅" },
};
// By the year branch and the day branch, through their 三合 group (申子辰、寅午戌、巳酉丑、亥卯未).
const GROUP = { 申: 0, 子: 0, 辰: 0, 寅: 1, 午: 1, 戌: 1, 巳: 2, 酉: 2, 丑: 2, 亥: 3, 卯: 3, 未: 3 };
const BY_TRIAD = {
  桃花: "酉卯午子", 驛馬: "寅申亥巳", 華蓋: "辰戌丑未", 將星: "子午酉卯", 劫煞: "巳亥寅申", 亡神: "亥巳申寅",
};
const ZAI_SHA = "午子卯酉";   // 災煞, from the year branch only
// By the year branch alone.
const HONG_LUAN = { 子: "卯", 丑: "寅", 寅: "丑", 卯: "子", 辰: "亥", 巳: "戌", 午: "酉", 未: "申", 申: "未", 酉: "午", 戌: "巳", 亥: "辰" };
const TIAN_XI = b => at(HONG_LUAN[b], 6);
const SEASON_GROUP = b => Math.floor(((bi(b) + 1) % 12) / 3);   // 亥子丑 0, 寅卯辰 1, 巳午未 2, 申酉戌 3
const GU_CHEN = "寅巳申亥", GUA_SU = "戌丑辰未";
// By the month branch.
const TIAN_DE = { 寅: "丁", 卯: "申", 辰: "壬", 巳: "辛", 午: "亥", 未: "甲", 申: "癸", 酉: "寅", 戌: "丙", 亥: "乙", 子: "巳", 丑: "庚" };
const YUE_DE = { 1: "丙", 0: "壬", 3: "甲", 2: "庚" };   // by 三合 group: 寅午戌丙、申子辰壬、亥卯未甲、巳酉丑庚
const combineOf = x => (STEM_COMBINE[x] ? STEM_COMBINE[x][0] : SIX_COMBINE[x] ? SIX_COMBINE[x][0] : null);
// Day pillars with a name of their own.
const DAY_STARS = {
  魁罡: ["庚辰", "庚戌", "壬辰", "戊戌"],
  陰差陽錯: ["丙子", "丁丑", "戊寅", "辛卯", "壬辰", "癸巳", "丙午", "丁未", "戊申", "辛酉", "壬戌", "癸亥"],
  孤鸞煞: ["乙巳", "丁巳", "辛亥", "戊申", "甲寅", "戊午", "壬子", "丙午"],
  十惡大敗: ["甲辰", "乙巳", "丙申", "丁亥", "戊戌", "己丑", "庚辰", "辛巳", "壬申", "癸亥"],
  六秀日: ["戊子", "己丑", "丙午", "丁未", "戊午", "己未"],
  十靈日: ["甲辰", "乙亥", "丙辰", "丁酉", "戊午", "庚戌", "庚寅", "辛亥", "壬寅", "癸未"],
};
const TIAN_SHE = { 春: "戊寅", 夏: "甲午", 秋: "戊申", 冬: "甲子" };   // 天赦日 by the season of the month
const THREE_MONTHS = { 寅: "春", 卯: "春", 辰: "春", 巳: "夏", 午: "夏", 未: "夏", 申: "秋", 酉: "秋", 戌: "秋", 亥: "冬", 子: "冬", 丑: "冬" };

// Meaning, nature and the life domains each star speaks to. Plain and short; the readings build on it.
export const STARS = {
  天乙貴人: { nature: "吉", domains: ["career", "family", "wealth"], text: "最尊貴的吉神，遇到困難時容易有人伸出援手，逢凶化吉" },
  太極貴人: { nature: "吉", domains: ["study"], text: "聰明好學，對哲學、宗教、玄學有悟性" },
  文昌貴人: { nature: "吉", domains: ["study", "career"], text: "聰明、文筆好，利於讀書、考試與文職" },
  國印貴人: { nature: "吉", domains: ["career"], text: "做事有原則、守信用，適合公職或掌管印信的職務" },
  福星貴人: { nature: "吉", domains: ["wealth", "family"], text: "一生多福氣，衣食不缺" },
  天廚貴人: { nature: "吉", domains: ["wealth", "health"], text: "有口福，懂得享受生活，也可能善於烹調" },
  學堂: { nature: "吉", domains: ["study"], text: "日主的長生之地，聰明好學，學習能力強" },
  祿神: { nature: "吉", domains: ["career", "wealth"], text: "有自己的俸祿與根基，工作和收入較穩定" },
  金輿: { nature: "吉", domains: ["love", "wealth"], text: "像坐上金車，生活較富足，也常得配偶助力" },
  天德貴人: { nature: "吉", domains: ["health", "family"], text: "上天的庇佑，一生少災，遇事容易轉圜" },
  月德貴人: { nature: "吉", domains: ["health", "family"], text: "月中的福德，性情溫和，遇難易解" },
  天德合: { nature: "吉", domains: ["health"], text: "天德的合神，作用和天德相近而稍弱" },
  月德合: { nature: "吉", domains: ["health"], text: "月德的合神，作用和月德相近而稍弱" },
  天醫: { nature: "吉", domains: ["health"], text: "與醫藥有緣，生病容易遇到好醫生，也適合醫護相關工作" },
  將星: { nature: "吉", domains: ["career"], text: "有領導力與威望，適合帶人、掌權" },
  華蓋: { nature: "中", domains: ["study"], text: "聰明而孤高，有藝術、宗教、學術的天分，也比較享受獨處" },
  天喜: { nature: "吉", domains: ["love", "family"], text: "喜慶之星，逢之容易有婚嫁、添丁等喜事" },
  紅鸞: { nature: "吉", domains: ["love"], text: "姻緣之星，逢之容易談戀愛或結婚" },
  桃花: { nature: "中", domains: ["love"], text: "異性緣佳、有魅力；太多則要防感情糾紛" },
  紅艷煞: { nature: "中", domains: ["love"], text: "多情而有魅力，感情豐富，也容易為情所困" },
  驛馬: { nature: "中", domains: ["move", "career"], text: "奔波、遷移、出外之星，利於外出發展，也代表變動多" },
  羊刃: { nature: "凶", domains: ["health", "wealth"], text: "剛強果決、敢衝；過旺則衝動易惹是非，也要留意受傷與開刀" },
  飛刃: { nature: "凶", domains: ["health"], text: "羊刃的對沖，要留意突發的意外與破耗" },
  劫煞: { nature: "凶", domains: ["wealth", "health"], text: "主突發的變化與損失，也代表行動力強" },
  亡神: { nature: "凶", domains: ["career"], text: "心機深、城府重；用得好是謀略，用不好則容易是非" },
  災煞: { nature: "凶", domains: ["health"], text: "要防意外與突發的災難" },
  孤辰: { nature: "凶", domains: ["love", "family"], text: "性格偏獨立、孤單，和親人或配偶聚少離多" },
  寡宿: { nature: "凶", domains: ["love", "family"], text: "感情上容易感到寂寞，和親人緣分較淡" },
  勾絞: { nature: "凶", domains: ["career"], text: "容易捲入是非、糾紛或官非" },
  元辰: { nature: "凶", domains: ["wealth"], text: "又叫大耗，主破財、做事不順" },
  流霞: { nature: "凶", domains: ["health"], text: "要留意血光，女命也要留意生產" },
  空亡: { nature: "凶", domains: ["career", "wealth"], text: "落空之意，所在的六親或事情容易有落空、不實的感覺" },
  魁罡: { nature: "中", domains: ["career"], text: "聰明果斷、個性剛強，有領導氣魄；運好則大富貴，運差則易受挫" },
  陰差陽錯: { nature: "凶", domains: ["love"], text: "婚姻感情上容易陰錯陽差、有波折" },
  孤鸞煞: { nature: "凶", domains: ["love"], text: "傳統上主婚姻不順，需要多經營感情" },
  十惡大敗: { nature: "凶", domains: ["wealth"], text: "傳統上主祖業難守、理財要保守" },
  六秀日: { nature: "吉", domains: ["study"], text: "聰明秀氣、多才多藝" },
  十靈日: { nature: "吉", domains: ["study"], text: "靈性高、直覺準" },
  天赦日: { nature: "吉", domains: ["health", "career"], text: "上天赦免之日，一生遇難容易化解" },
  金神: { nature: "中", domains: ["career"], text: "剛毅有魄力，喜火制伏；性格強而急" },
  天羅地網: { nature: "凶", domains: ["career", "health"], text: "做事容易受阻、身不由己，凡事宜謹慎" },
};

// The stars of one branch (and stem) against this chart: used for each natal pillar, and for a luck pillar.
//   ctx: { yearStem, dayStem, yearBranch, dayBranch, monthBranch, sex, yearNayin, dayVoid, yearVoid }
//   own: the role of the pillar being checked (the stars keyed on that very pillar skip it)
function starsOf(stem, branch, ctx, own) {
  const out = new Set();
  for (const [star, table] of Object.entries(BY_STEM)) {
    if ((table[ctx.dayStem] || "").includes(branch) || (table[ctx.yearStem] || "").includes(branch)) out.add(star);
  }
  for (const [star, table] of Object.entries(BY_DAY_STEM)) if (table[ctx.dayStem] === branch) out.add(star);
  for (const [star, list] of Object.entries(BY_TRIAD)) {
    if ((own !== "year" && list[GROUP[ctx.yearBranch]] === branch) || (own !== "day" && list[GROUP[ctx.dayBranch]] === branch)) out.add(star);
  }
  if (own !== "year") {
    if (ZAI_SHA[GROUP[ctx.yearBranch]] === branch) out.add("災煞");
    if (GU_CHEN[SEASON_GROUP(ctx.yearBranch)] === branch) out.add("孤辰");
    if (GUA_SU[SEASON_GROUP(ctx.yearBranch)] === branch) out.add("寡宿");
    if (at(ctx.yearBranch, 3) === branch || at(ctx.yearBranch, -3) === branch) out.add("勾絞");
  }
  if (HONG_LUAN[ctx.yearBranch] === branch) out.add("紅鸞");
  if (TIAN_XI(ctx.yearBranch) === branch) out.add("天喜");
  // 元辰: 陽男陰女 the 7th branch after the year branch, 陰男陽女 the 5th.
  const yangYear = "甲丙戊庚壬".includes(ctx.yearStem);
  if (at(ctx.yearBranch, yangYear === (ctx.sex === "male") ? 7 : 5) === branch) out.add("元辰");
  const td = TIAN_DE[ctx.monthBranch], tdh = combineOf(td);
  if (stem === td || branch === td) out.add("天德貴人");
  if (tdh && (stem === tdh || branch === tdh)) out.add("天德合");
  const yd = YUE_DE[GROUP[ctx.monthBranch]];
  if (stem === yd) out.add("月德貴人");
  if (stem === combineOf(yd)) out.add("月德合");
  if (at(ctx.monthBranch, -1) === branch) out.add("天醫");
  // 空亡: a branch in the day pillar's 旬空 (for the natal pillars also the year pillar's).
  if (own !== "day" && ctx.dayVoid.includes(branch)) out.add("空亡");
  else if (ROLES.includes(own) && own !== "year" && own !== "day" && ctx.yearVoid.includes(branch)) out.add("空亡");
  return out;
}

// The context the star tables need, from a chart (core/chart.js).
export function starContext(chart) {
  const p = Object.fromEntries(chart.pillars.map(x => [x.role, x]));
  return {
    yearStem: p.year.stem.name, dayStem: p.day.stem.name, yearBranch: p.year.branch.name, dayBranch: p.day.branch.name,
    monthBranch: p.month.branch.name, sex: chart.input.sex, yearNayin: p.year.nayin, dayVoid: p.day.void, yearVoid: p.year.void,
  };
}

// The same context from the pillar names alone (the luck model has no chart object).
export function starContextOf(names, sex) {
  const ps = names.map(pillarOf), sc = n => SixtyCycle.fromName(n);
  const voidOf = n => sc(n).getExtraEarthBranches().map(b => b.getName()).join("");
  return {
    yearStem: ps[0].stem, dayStem: ps[2].stem, yearBranch: ps[0].branch, dayBranch: ps[2].branch, monthBranch: ps[1].branch,
    sex, yearNayin: zh(sc(names[0]).getSound().getName()), dayVoid: voidOf(names[2]), yearVoid: voidOf(names[0]),
  };
}

const ORDER = Object.keys(STARS);
const sorted = set => [...set].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

// The stars of every natal pillar: { year: [...], month: [...], day: [...], hour: [...] }.
export function natalStars(chart) {
  const ctx = starContext(chart), out = {};
  for (const p of chart.pillars) out[p.role] = starsOf(p.stem.name, p.branch.name, ctx, p.role);
  const day = chart.pillars.find(p => p.role === "day"), hour = chart.pillars.find(p => p.role === "hour");
  for (const [star, list] of Object.entries(DAY_STARS)) if (list.includes(day.name)) out.day.add(star);
  // 天赦日: 春（寅卯辰月）戊寅、夏甲午、秋戊申、冬甲子.
  if (TIAN_SHE[THREE_MONTHS[ctx.monthBranch]] === day.name) out.day.add("天赦日");
  for (const p of [day, hour]) if (p && ["乙丑", "己巳", "癸酉"].includes(p.name)) out[p.role].add("金神");
  // 天羅地網: 火命 (year 納音 fire) with 戌亥 in the day branch is 天羅; 水土命 with 辰巳 is 地網.
  const na = ctx.yearNayin.slice(-1);
  if ((na === "火" && "戌亥".includes(ctx.dayBranch)) || ((na === "水" || na === "土") && "辰巳".includes(ctx.dayBranch))) out.day.add("天羅地網");
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, sorted(v)]));
}

// The stars a luck pillar brings (大運 or 流年). `from` is a chart, or a context from starContextOf.
export function luckStars(from, pillarName) {
  const p = pillarOf(pillarName);
  return sorted(starsOf(p.stem, p.branch, from.pillars ? starContext(from) : from, "luck"));
}

// ---------- 太歲 ----------
// The year's twelve spirits, counted from the flowing year's branch to the person's year branch (子年: 丑 太陽、寅
// 喪門、午 歲破、申 白虎、戌 吊客、亥 病符…). 犯太歲 in the Taiwanese sense: 值、沖、刑、害、破.
export const TAISUI_SPIRITS = ["太歲", "太陽", "喪門", "太陰", "官符", "死符", "歲破", "龍德", "白虎", "福德", "吊客", "病符"];
export const SPIRITS = {
  太歲: { nature: "凶", domains: ["career", "family", "health"], text: "值太歲（本命年），一年裡變動較多，傳統上會去廟裡安太歲，凡事穩紮穩打" },
  太陽: { nature: "吉", domains: ["career"], text: "太陽星照，容易得到男性長輩或上司的提拔" },
  喪門: { nature: "凶", domains: ["family"], text: "喪門星，傳統上要多關心家中長輩的健康，心情也容易低落" },
  太陰: { nature: "吉", domains: ["family", "love"], text: "太陰星照，容易得到女性貴人的幫忙" },
  官符: { nature: "凶", domains: ["career"], text: "官符星，要防口舌是非、合約與官司糾紛" },
  死符: { nature: "凶", domains: ["health"], text: "死符星，傳統上主小病與不順，宜保守、多休息" },
  歲破: { nature: "凶", domains: ["career", "wealth", "move"], text: "歲破（沖太歲），變動大，容易破財或搬遷，大事宜三思" },
  龍德: { nature: "吉", domains: ["career", "wealth"], text: "龍德星，逢凶化吉，有貴人相助" },
  白虎: { nature: "凶", domains: ["health"], text: "白虎星，傳統上要防血光、意外與開刀，開車與運動要小心" },
  福德: { nature: "吉", domains: ["wealth", "family"], text: "福德星，福氣與財運都不錯" },
  吊客: { nature: "凶", domains: ["family"], text: "吊客星，傳統上要防親友的喪病之事，心情容易低落" },
  病符: { nature: "凶", domains: ["health"], text: "病符星，要留意身體的小毛病，定期檢查" },
};
export function taisui(natalYearBranch, flowBranch) {
  const spirit = TAISUI_SPIRITS[(bi(natalYearBranch) - bi(flowBranch) + 12) % 12];
  const kinds = [];
  if (natalYearBranch === flowBranch) kinds.push("值太歲");
  if (clash(natalYearBranch, flowBranch)) kinds.push("沖太歲");
  const pu = punish(natalYearBranch, flowBranch);
  if (pu && pu !== "自刑") kinds.push("刑太歲");
  if (pu === "自刑") kinds.push("刑太歲");
  if (harm(natalYearBranch, flowBranch)) kinds.push("害太歲");
  if (breaks(natalYearBranch, flowBranch)) kinds.push("破太歲");
  return { spirit, kinds };
}

// ---------- 一柱的五行喜忌 ----------
export function pillarFavor(analysis, name) {
  const p = pillarOf(name);
  const f = e => analysis.favor[e] || 0;
  return { stem: f(p.stemEl), branch: f(p.branchEl), mean: (f(p.stemEl) + f(p.branchEl)) / 2, stemEl: p.stemEl, branchEl: p.branchEl };
}

// The ten gods of a luck pillar for this day master: the stem's, and the branch's main hidden stem.
export function luckGods(dayStem, name) {
  const p = pillarOf(name);
  return { stem: tenGod(dayStem, p.stem), branch: tenGod(dayStem, p.hidden[0].stem), hidden: p.hidden.map(h => ({ stem: h.stem, god: tenGod(dayStem, h.stem) })) };
}

// The group (比劫、食傷、財、官殺、印) of a ten god.
export const GOD_GROUP = { 比肩: "比劫", 劫財: "比劫", 食神: "食傷", 傷官: "食傷", 正財: "財", 偏財: "財", 正官: "官殺", 七殺: "官殺", 正印: "印", 偏印: "印" };
export { groupOf };
