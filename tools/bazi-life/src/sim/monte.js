// 同盤重跑：同一張命盤跑 N 次人生。結果一律用「N 次裡有幾次」呈現，讓一次模擬的結局只是其中一種可能。
import { runLife } from "./life.js";
import { hashSeed } from "./rng.js";

// Traditional correspondence of the five elements to body systems (shown as tradition, not diagnosis).
export const BODY = { 木: "肝膽", 火: "心臟與血液循環", 土: "脾胃消化", 金: "肺與呼吸道", 水: "腎臟與泌尿" };
const HURDLE_DOMAINS = {
  health: { label: "健康關卡", channel: "bad", ages: [30, 95], events: ["serious", "chronic", "burnout"] },
  love: { label: "婚姻關卡", channel: "bad", ages: [25, 75], events: ["divorce", "crisis", "breakup"] },
  career: { label: "事業關卡", channel: "bad", ages: [22, 64], events: ["layoff", "startupFail"] },
  wealth: { label: "財務關卡", channel: "bad", ages: [25, 85], events: ["loss", "startupFail"] },
};

function quantile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}

export function rerun({ chart, analysis, luck, sex = chart.input.sex, runs = 100, key = "" }) {
  const lives = [];
  for (let i = 0; i < runs; i++) lives.push(runLife({ chart, analysis, luck, sex, seed: hashSeed(`${key}#${i}`) }));
  const count = fn => lives.filter(fn).length;
  const ages = lives.map(l => l.state.age).sort((a, b) => a - b);

  const bins = [];
  for (let lo = 0; lo <= 105; lo += 5) bins.push({ from: lo, to: lo === 105 ? 110 : lo + 4, n: ages.filter(a => a >= lo && (lo === 105 || a <= lo + 4)).length });

  const band = [];
  for (let age = 0; age <= 110; age++) {
    const vals = lives.map(l => l.kline[age] && l.kline[age].close).filter(v => v !== undefined).sort((a, b) => a - b);
    if (vals.length < Math.max(3, runs * 0.1)) break;
    band.push({ age, p10: quantile(vals, 0.1), p50: quantile(vals, 0.5), p90: quantile(vals, 0.9), alive: vals.length });
  }

  // 關卡年: the ages where this chart's luck tilts a domain's bad events most, with how many of the runs
  // actually had such an event within a year of that age.
  const hurdles = Object.entries(HURDLE_DOMAINS).map(([domain, h]) => {
    const years = luck.filter(y => y.age >= h.ages[0] && y.age <= h.ages[1]).map(y => ({ age: y.age, year: y.year, lnm: y.m[domain][h.channel], reason: (y.reasons.find(r => r.domains.includes(domain)) || {}).text || null }));
    const top = years.filter(y => y.lnm >= 0.2).sort((a, b) => b.lnm - a.lnm).slice(0, 3).sort((a, b) => a.age - b.age);
    return {
      domain, label: h.label,
      years: top.map(y => ({
        ...y,
        hits: count(l => l.log.some(e => h.events.includes(e.id) && Math.abs(e.age - y.age) <= 1)),
        body: domain === "health" ? bodyFor(analysis, y.year) : null,
      })),
    };
  });

  return {
    runs,
    lifespan: { median: quantile(ages, 0.5), p10: quantile(ages, 0.1), p25: quantile(ages, 0.25), p75: quantile(ages, 0.75), p90: quantile(ages, 0.9), bins, under60: count(l => l.state.age < 60), over90: count(l => l.state.age >= 90) },
    seriousBefore60: count(l => l.log.some(e => e.id === "serious" && e.age < 60)),
    seriousEver: count(l => l.log.some(e => e.id === "serious")),
    married: count(l => l.state.marriages > 0),
    divorced: count(l => l.state.divorces > 0),
    kids: [0, 1, 2, 3].map(n => ({ n, runs: count(l => (n === 3 ? l.state.kids.length >= 3 : l.state.kids.length === n)) })),
    university: count(l => ["大學", "科大", "碩士", "博士"].includes(l.state.edu)),
    homeOwner: count(l => l.state.home === "own"),
    abroad: count(l => l.log.some(e => e.id === "abroad" && /到.+工作/.test(e.text))),
    band,
    hurdles,
  };
}

// The year's most disliked element names the body system tradition links to it.
function bodyFor(analysis, yearPillarName) {
  const stems = { 甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水" };
  const branches = { 子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火", 午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水" };
  const els = [stems[yearPillarName[0]], branches[yearPillarName[1]]];
  const worst = els.sort((a, b) => analysis.favor[a] - analysis.favor[b])[0];
  return { element: worst, system: BODY[worst] };
}
