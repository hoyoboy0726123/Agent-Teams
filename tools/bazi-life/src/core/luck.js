// 流年觸發：每一年的大運與流年，讓各領域事件的機率傾斜多少。
//
// Probabilities tilt in logit space, p' = logit⁻¹(logit p₀ + ln m), and m stays within 0.5–2, so the chart
// shifts the odds but statistics and the player's choices still decide most of a life.
//
// Every domain has three channels: good events, bad events, and change (a new job, a move, a relationship that
// starts or ends). Two kinds of effect feed them:
//   favor     the year's and the decade's elements are liked or disliked by this chart: good up and bad down,
//             or the reverse
//   triggers  clashes, combinations and activated ten gods, which say WHEN change is likely. They are centred
//             on each chart's lifetime average, so they move events in time without making them more common,
//             and a population of random charts keeps the statistical base rates.
import { pillarOf, groupOf, elementOf } from "./analysis.js";

export const DOMAINS = { career: "事業", wealth: "財富", love: "感情", health: "健康", study: "學業", family: "家庭", move: "遷移" };
export const CHANNELS = ["good", "bad", "change"];
const LN2 = Math.log(2);
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const GENERATES = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const CONTROLS = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
export const clashes = (a, b) => Math.abs(BRANCHES.indexOf(a) - BRANCHES.indexOf(b)) === 6;
export const combines = (a, b) => (BRANCHES.indexOf(a) + BRANCHES.indexOf(b)) % 12 === 1;
// 天剋: one stem controls the other and both have the same polarity (七殺 to each other).
const stemsClash = (p, q) => p.yang === q.yang && (CONTROLS[p.stemEl] === q.stemEl || CONTROLS[q.stemEl] === p.stemEl);

const empty = () => Object.fromEntries(Object.keys(DOMAINS).map(d => [d, { good: 0, bad: 0, change: 0 }]));
const ln = Math.log;

// One year's raw effects, before centring. `natal` is the four (or three) pillar names.
export function yearEffects(analysis, natal, decadeName, yearName, sex) {
  const dm = analysis.dayMaster.element, like = e => analysis.favor[e];
  const y = pillarOf(yearName), d = decadeName ? pillarOf(decadeName) : null;
  const [, monthP, dayP] = natal.map(pillarOf);
  const favorYear = (like(y.stemEl) + like(y.branchEl)) / 2;
  const favorDecade = d ? (like(d.stemEl) + like(d.branchEl)) / 2 : 0;
  const L = 0.6 * favorYear + 0.4 * favorDecade;
  const favor = empty(), trig = empty(), reasons = [];
  for (const k of Object.keys(DOMAINS)) { favor[k].good += 0.25 * L; favor[k].bad -= 0.25 * L; }
  const tilt = (domain, e, k = 0.3) => { favor[domain].good += k * like(e); favor[domain].bad -= k * like(e); };

  const groups = new Set([groupOf(dm, y.stemEl), groupOf(dm, y.hidden[0].el)]);
  if (groups.has("官殺")) {
    trig.career.change += ln(1.3); tilt("career", elementOf(dm, "官殺"));
    reasons.push({ domains: ["career"], text: "官殺星透出：事業有壓力，也有機會" });
    if (sex === "female") { trig.love.change += ln(1.3); reasons.push({ domains: ["love"], tags: ["spouse"], text: "官殺星透出：女命的官殺是丈夫星，感情容易有進展" }); }
    else { trig.family.change += ln(1.2); reasons.push({ domains: ["family"], tags: ["children"], text: "官殺星透出：男命的官殺是子女星，和孩子的緣分被引動" }); }
  }
  if (groups.has("財")) {
    trig.wealth.change += ln(1.3); tilt("wealth", elementOf(dm, "財"));
    reasons.push({ domains: ["wealth"], text: "財星透出：錢財進出變多" });
    reasons.push({ domains: ["family"], tags: ["father"], text: "財星透出：偏財是父親星，和父親有關的事被引動" });
    if (sex === "male") { trig.love.change += ln(1.3); reasons.push({ domains: ["love"], tags: ["spouse"], text: "財星透出：男命的財星是妻子星，感情容易有進展" }); }
  }
  if (groups.has("印")) {
    tilt("study", elementOf(dm, "印")); trig.family.change += ln(1.2); trig.wealth.change += ln(1.15);
    reasons.push({ domains: ["study"], text: "印星透出：利於讀書和考試" });
    reasons.push({ domains: ["family"], tags: ["mother"], text: "印星透出：印是母親星，和母親有關的事被引動" });
    reasons.push({ domains: ["wealth"], tags: ["home"], text: "印星透出：印也代表房子，置產的機會變多" });
  }
  if (groups.has("食傷")) {
    tilt("career", elementOf(dm, "食傷"), 0.15);
    reasons.push({ domains: ["career"], text: "食傷星透出：表現欲強、想法多" });
    if (sex === "female") { trig.family.change += ln(1.2); reasons.push({ domains: ["family"], tags: ["children"], text: "食傷星透出：女命的食傷是子女星，和孩子的緣分被引動" }); }
  }
  if (groups.has("比劫")) { trig.wealth.bad += ln(1.15); reasons.push({ domains: ["wealth"], text: "比劫星透出：競爭多，花錢也多" }); }

  if (clashes(y.branch, dayP.branch)) {
    trig.love.change += ln(1.5); trig.move.change += ln(1.5); trig.health.bad += ln(1.3);
    reasons.push({ domains: ["love", "family"], tags: ["spouse"], text: `流年${y.branch}沖日支${dayP.branch}：日支是配偶宮，感情容易變動` });
    reasons.push({ domains: ["move"], text: `流年${y.branch}沖日支${dayP.branch}：住處容易變動` });
    reasons.push({ domains: ["health"], text: `流年${y.branch}沖日支${dayP.branch}：要多注意身體` });
  }
  if (combines(y.branch, dayP.branch)) { trig.love.good += ln(1.4); reasons.push({ domains: ["love"], tags: ["spouse"], text: `流年${y.branch}合日支${dayP.branch}：日支是配偶宮，容易遇到好的感情機會` }); }
  if (clashes(y.branch, monthP.branch)) {
    trig.career.change += ln(1.45); trig.career.good += ln(0.8); trig.family.bad += ln(1.2);
    reasons.push({ domains: ["career"], text: `流年${y.branch}沖月支${monthP.branch}：工作容易變動` });
    reasons.push({ domains: ["family"], tags: ["father", "mother"], text: `流年${y.branch}沖月支${monthP.branch}：月柱是父母宮，要多關心父母` });
  }
  if (natal.some(n => "寅申巳亥".includes(pillarOf(n).branch) && clashes(y.branch, pillarOf(n).branch))) {
    trig.move.change += ln(1.75); reasons.push({ domains: ["move"], text: "驛馬被沖：搬家、出國、換環境的機會大" });
  }
  if (natal.some(n => "辰戌丑未".includes(pillarOf(n).branch) && clashes(y.branch, pillarOf(n).branch))) {
    trig.wealth.change += ln(1.35); reasons.push({ domains: ["wealth"], text: "沖開財庫：財務大進大出" });
  }
  if (yearName === natal[2] || (stemsClash(y, dayP) && clashes(y.branch, dayP.branch))) {
    for (const k of ["family", "wealth", "health"]) { trig[k].good += ln(0.7); trig[k].bad += ln(1.4); }
    reasons.push({ domains: ["family", "wealth", "health"], text: yearName === natal[2] ? "流年和日柱相同（伏吟）：家庭、財務、健康容易有波折" : "流年和日柱天剋地沖：家庭、財務、健康容易有波折" });
  }
  let amplify = 1;
  if (decadeName && yearName === decadeName) { amplify = 1.75; reasons.push({ domains: Object.keys(DOMAINS), text: "歲運並臨：這一年的起伏會被放大" }); }
  return { L, favor, trig, amplify, reasons };
}

// Effects for ages 1–`span`, with triggers centred on this chart's lifetime average.
// `decadeAt(age)` gives the decade pillar name (or null before the first one); `yearAt(age)` the year pillar.
export function lifeLuck(analysis, natal, sex, decadeAt, yearAt, span = 100) {
  const raw = [];
  for (let age = 1; age <= span; age++) raw.push(yearEffects(analysis, natal, decadeAt(age), yearAt(age), sex));
  const mean = empty();
  for (const r of raw) for (const k in mean) for (const c of CHANNELS) mean[k][c] += r.trig[k][c] / raw.length;
  return raw.map((r, i) => {
    const m = empty();
    for (const k in m) for (const c of CHANNELS) {
      const v = (r.favor[k][c] + r.trig[k][c] - mean[k][c]) * r.amplify;
      m[k][c] = Math.max(-LN2, Math.min(LN2, v));
    }
    return { age: i + 1, decade: decadeAt(i + 1), year: yearAt(i + 1), L: r.L, score: Math.round(50 + 40 * Math.max(-1, Math.min(1, r.L * r.amplify))), m, reasons: r.reasons };
  });
}

// p' = logit⁻¹(logit p + ln m)
export function tilt(p, lnm) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const z = Math.log(p / (1 - p)) + lnm;
  return 1 / (1 + Math.exp(-z));
}
