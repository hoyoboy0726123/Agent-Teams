// 合婚分頁的引擎 (src/core/hehun.js): the traditional tables, the score and its parts, the relationship type, the six
// dimensions, the nine checks, the ten years, and wording that never judges a couple.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SolarDay } from "tyme4ts";
import { computeChart } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { analyse } from "../src/core/analysis.js";
import { relate } from "../src/core/family.js";
import { hehunReading, minggua, mingguaPair, marriageMonths, yearPillar } from "../src/core/hehun.js";

const taipei = findPlace("臺北市");
const chart = (y, m, d, h = 12, sex = "male") => computeChart({ date: { y, m, d }, time: h === null ? null : { h, mi: 0 }, place: taipei, sex, options: { solar: "true" } }, { lean: true });
const who = (y, m, d, h, sex, name) => ({ chart: chart(y, m, d, h, sex), sex, ...(name ? { name } : {}) });
// The first date from 1990 on whose day pillar is `name` (noon, so the hour cannot move the day).
function dayOf(name, from = 1990) {
  for (let t = Date.UTC(from, 0, 1); ; t += 86400000) {
    const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    if (SolarDay.fromYmd(y, m, day).getLunarDay().getSixtyCycle().getName() === name) return [y, m, day];
  }
}
let seed = 2026;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const randomPerson = sex => {
  const y = 1955 + Math.floor(rnd() * 50), m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28);
  return who(y, m, d, rnd() < 0.2 ? null : Math.floor(rnd() * 24), sex);
};
const prose = r => JSON.stringify([r.type, r.chips, r.summary, r.advice, r.dims, r.checks, r.loves, r.guide, r.years, r.wed, r.months, r.luck, r.age]);
const JUDGING = /剋夫|剋妻|妨夫|妨妻|妨翁|妨父母|下等婚|上等婚|中等婚|上婚|下婚|不宜|不合適|大凶|離婚|外遇|分手|死|壽命|血光|開刀|手術|化解|改運|符|undefined|NaN|null/;

test("命卦: the formula by solar year and sex, with 5 sent to 坤 for a man and 艮 for a woman", () => {
  const cases = [[1984, "male", "兌"], [1984, "female", "艮"], [2000, "male", "離"], [2000, "female", "乾"], [2005, "male", "巽"], [1990, "male", "坎"], [1992, "female", "兌"], [1986, "male", "坤"], [1981, "female", "艮"]];
  for (const [y, sex, name] of cases) assert.equal(minggua(y, sex).name, name, `${y} ${sex}`);
  assert.equal(minggua(1990, "male").group, "東四命");
  assert.equal(minggua(1992, "female").group, "西四命");
  // Born before 立春 counts as the year before: 1990-01-20 is a 1989 man, 坤.
  const r = hehunReading({ a: who(1990, 1, 20, 12, "male"), b: who(1992, 6, 1, 12, "female"), now: 2026 });
  assert.equal(r.people[0].solarYear, 1989);
  assert.equal(r.people[0].gua.name, "坤");
});

test("命卦 pairs follow the 大遊年歌 table, which is the same both ways", () => {
  const order = [1, 2, 3, 4, 6, 7, 8, 9];
  const table = [
    ["伏位", "絕命", "天醫", "生氣", "六煞", "禍害", "五鬼", "延年"],
    ["絕命", "伏位", "禍害", "五鬼", "延年", "天醫", "生氣", "六煞"],
    ["天醫", "禍害", "伏位", "延年", "五鬼", "絕命", "六煞", "生氣"],
    ["生氣", "五鬼", "延年", "伏位", "禍害", "六煞", "絕命", "天醫"],
    ["六煞", "延年", "五鬼", "禍害", "伏位", "生氣", "天醫", "絕命"],
    ["禍害", "天醫", "絕命", "六煞", "生氣", "伏位", "延年", "五鬼"],
    ["五鬼", "生氣", "六煞", "絕命", "天醫", "延年", "伏位", "禍害"],
    ["延年", "六煞", "生氣", "天醫", "絕命", "五鬼", "禍害", "伏位"],
  ];
  order.forEach((x, i) => order.forEach((y, j) => assert.equal(mingguaPair(x, y), table[i][j], `${x}-${y}`)));
});

test("行嫁月: the 大利月 and 小利月 of every year branch", () => {
  const want = { 子: [[6, 12], [1, 7]], 午: [[6, 12], [1, 7]], 丑: [[5, 11], [4, 10]], 未: [[5, 11], [4, 10]], 寅: [[2, 8], [3, 9]], 申: [[2, 8], [3, 9]], 卯: [[1, 7], [6, 12]], 酉: [[1, 7], [6, 12]], 辰: [[4, 10], [5, 11]], 戌: [[4, 10], [5, 11]], 巳: [[3, 9], [2, 8]], 亥: [[3, 9], [2, 8]] };
  for (const [b, [best, second]] of Object.entries(want)) assert.deepEqual(marriageMonths(b), { best, second }, b);
  assert.equal(yearPillar(1984), "甲子");
  assert.equal(yearPillar(2026), "丙午");
});

test("the score is its parts added up, each within its ceiling; 天合地合 fills the 夫妻宮 part and 天剋地沖 empties it", () => {
  const r = hehunReading({ a: who(1990, 6, 21, 12, "female"), b: who(1992, 3, 5, null, "male"), now: 2026 });
  assert.equal(r.score.parts.reduce((t, p) => t + p.got, 0), r.score.total);
  assert.equal(r.score.parts.reduce((t, p) => t + p.max, 0), 100);
  assert.deepEqual(r.score.parts.map(p => p.id), ["palace", "useful", "star", "stem", "zodiac", "nayin", "gua", "stars"]);
  for (const p of r.score.parts) assert.ok(p.got >= 0 && p.got <= p.max && p.why, p.id);
  // 甲子 and 己丑: 甲己 and 子丑 both combine.
  const [y1, m1, d1] = dayOf("甲子"), [y2, m2, d2] = dayOf("己丑", 1992);
  const he = hehunReading({ a: who(y1, m1, d1, 12, "male"), b: who(y2, m2, d2, 12, "female"), now: 2026 });
  assert.equal(he.score.parts[0].got, 25);
  assert.equal(he.score.parts[0].why, "日柱天合地合");
  assert.equal(he.type.id, "天生互補型");
  assert.ok(he.checks.find(c => c.id === "day").paragraphs.join("").includes("天合地合"));
  // 甲子 and 庚午: 庚剋甲 and 子午沖.
  const [y3, m3, d3] = dayOf("庚午", 1993);
  const clash = hehunReading({ a: who(y1, m1, d1, 12, "male"), b: who(y3, m3, d3, 12, "female"), now: 2026 });
  assert.ok(clash.score.parts[0].got <= 6);
  const palace = clash.checks.find(c => c.id === "palace");
  assert.equal(palace.verdict, "需要磨合");
  assert.match(palace.paragraphs.join(""), /天剋地沖.*差異也能是互補/);
});

test("over many couples: the score agrees with the simulation's bond, every type turns up, and nothing judges", () => {
  const pairs = [], types = new Set();
  for (let i = 0; i < 120; i++) {
    const same = i % 7 === 0, sa = rnd() < 0.5 ? "male" : "female", sb = same ? sa : sa === "male" ? "female" : "male";
    const a = randomPerson(sa), b = randomPerson(sb);
    const r = hehunReading({ a, b, now: 2026 });
    types.add(r.type.id);
    const names = x => x.chart.pillars.map(p => p.name);
    pairs.push([relate({ pillars: names(a), analysis: analyse(names(a)) }, { pillars: names(b), analysis: analyse(names(b)) }).net, r.score.total]);
    const text = prose(r), bad = text.match(JUDGING);
    assert.ok(!bad, bad && text.slice(Math.max(0, bad.index - 60), bad.index + 20));
    assert.ok(r.score.total >= 30 && r.score.total <= 100);
    assert.equal(r.chips.length, 3);
    assert.equal(r.dims.length, 6);
    for (const d of r.dims) assert.ok(d.value >= 25 && d.value <= 96 && d.strength && d.watch && d.try, d.id);
  }
  const n = pairs.length, mx = pairs.reduce((s, p) => s + p[0], 0) / n, my = pairs.reduce((s, p) => s + p[1], 0) / n;
  const cov = pairs.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const corr = cov / Math.sqrt(pairs.reduce((s, p) => s + (p[0] - mx) ** 2, 0) * pairs.reduce((s, p) => s + (p[1] - my) ** 2, 0));
  assert.ok(corr > 0.5, `correlation ${corr.toFixed(2)}`);
  assert.ok(types.size >= 5, [...types].join(" "));
});

test("the nine checks: three 主要, three 輔助, three 民俗, each with a verdict; 命卦 says it is only a folk method", () => {
  const r = hehunReading({ a: who(1990, 6, 21, 12, "female"), b: who(1992, 3, 5, null, "male"), now: 2026 });
  assert.deepEqual(r.checks.map(c => c.id), ["palace", "useful", "star", "day", "elements", "stars", "zodiac", "nayin", "gua"]);
  assert.deepEqual(r.checks.map(c => c.level), ["主要", "主要", "主要", "輔助", "輔助", "輔助", "民俗", "民俗", "民俗"]);
  for (const c of r.checks) assert.ok(["契合", "中性", "需要磨合"].includes(c.verdict) && c.paragraphs.join("").length > 20, c.id);
  assert.match(r.checks.find(c => c.id === "gua").paragraphs[0], /你的命卦是艮卦（西四命），對方是艮卦（西四命），配起來是「伏位」.*《神峰通考》就批評過/);
  assert.match(r.checks.find(c => c.id === "zodiac").paragraphs.join(""), /生肖只看出生年/);
});

test("two people of the same sex: 伴侶星 for both, and no 行嫁月 that only reads a woman", () => {
  const men = hehunReading({ a: who(1988, 2, 15, 23, "male"), b: who(1988, 8, 8, 9, "male"), now: 2026 });
  assert.equal(men.neutral, true);
  assert.equal(men.checks[2].title, "伴侶星");
  assert.equal(men.score.parts.find(p => p.id === "star").label, "伴侶星");
  assert.deepEqual(men.months.women, []);
  assert.match(men.months.text, /只看女方的出生年，這裡不適用/);
  const women = hehunReading({ a: who(1990, 6, 21, 12, "female"), b: who(1993, 9, 9, 8, "female"), now: 2026 });
  assert.equal(women.months.women.length, 2);
  assert.match(women.months.text, /大利月/);
  for (const r of [men, women]) assert.ok(!/同性|同志|兩位女性|兩位男性|男命|女命/.test(JSON.stringify([r.loves, r.guide, r.months, r.age, r.dims])));
  const pair = hehunReading({ a: who(1990, 6, 21, 12, "female"), b: who(1992, 3, 5, null, "male"), now: 2026 });
  assert.equal(pair.neutral, false);
  assert.match(pair.months.text, /^傳統的行嫁月看女方的出生年：你（屬馬）的大利月是六月、十二月，小利月是正月、七月/);
});

test("the ten years: from this year, both ages, a state each, and 宜婚 only when both are in a marrying year", () => {
  const r = hehunReading({ a: who(1990, 6, 21, 12, "female"), b: who(1992, 3, 5, null, "male"), now: 2026 });
  assert.deepEqual(r.years.map(y => y.year), [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035]);
  assert.deepEqual(r.years[0].ages, [36, 34]);
  assert.equal(r.years[0].pillar, "丙午");
  for (const y of r.years) assert.ok(["good", "mid", "care"].includes(y.state) && y.good && y.watch, y.year);
  assert.deepEqual(r.wed.both, r.years.filter(y => y.wed).map(y => y.year));
  for (const y of r.years.filter(y => y.wed)) assert.equal(y.state, "good");
  assert.match(r.wed.text, /紅鸞、天喜、流年合夫妻宮和配偶星到位/);
  // Someone not yet born in a year has no year there.
  const young = hehunReading({ a: who(1990, 6, 21, 12, "female"), b: who(2028, 1, 1, 12, "male"), now: 2026 });
  assert.equal(young.years[0].year, 2028);
});

test("the love styles, 對方眼中的你, the guide, luck together and the age note", () => {
  const r = hehunReading({ a: who(1990, 6, 21, 12, "female"), b: who(1992, 3, 5, null, "male"), now: 2026 });
  assert.equal(r.loves.length, 2);
  assert.match(r.loves[0].lines[0], /^日主丁火像燭光/);
  assert.match(r.loves[0].seen, /^在對方眼中，你/);
  assert.ok(r.loves.every(l => !/對方表達|讓對方|告訴對方/.test(l.lines.join(""))), "the partner is 另一半 in a person's own lines");
  assert.deepEqual(r.guide.map(g => g.id), ["talk", "money", "home", "family", "kids"]);
  assert.match(r.guide.find(g => g.id === "kids").text, /^對方的時辰不詳，子女宮（時柱）先不看/);
  assert.match(r.luck.text, /不需要買任何開運物品/);
  assert.match(r.age, /相差 2 歲，你比較年長.*某大姊，坐金交椅/);
  const same = hehunReading({ a: who(1990, 6, 21, 12, "male"), b: who(1990, 9, 1, 12, "female"), now: 2026 });
  assert.match(same.age, /^同一年出生/);
  const three = hehunReading({ a: who(1993, 6, 1, 12, "male"), b: who(1990, 6, 1, 12, "female"), now: 2026 });
  assert.match(three.age, /^女大三，抱金磚/);
  const four = hehunReading({ a: who(1990, 6, 1, 12, "male"), b: who(1994, 6, 1, 12, "female"), now: 2026 });
  assert.match(four.age, /生肖一定是三合/);
  assert.equal(four.checks.find(c => c.id === "zodiac").verdict, "契合");
});

test("names typed on the page are used; two of the same name fall back to 你 and 對方", () => {
  const named = hehunReading({ a: who(1990, 6, 21, 12, "female", "小美"), b: who(1992, 3, 5, null, "male", "阿明"), now: 2026 });
  assert.deepEqual(named.people.map(p => p.n), ["小美", "阿明"]);
  assert.match(named.summary, /小美和阿明/);
  const twins = hehunReading({ a: who(1990, 6, 21, 12, "female", "小美"), b: who(1992, 3, 5, null, "male", "小美"), now: 2026 });
  assert.deepEqual(twins.people.map(p => p.n), ["你", "對方"]);
});
