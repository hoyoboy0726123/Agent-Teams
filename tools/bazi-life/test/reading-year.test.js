// 流年與大運的解讀：每一年、每一步大運的文字乾淨、等級在範圍內；事件的理由只引用這一年真的有的訊號，方向和事件一致，
// 而且從不解釋死亡。
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace, PLACE_GROUPS } from "../src/core/places.js";
import { analyse } from "../src/core/analysis.js";
import { makeRng } from "../src/sim/rng.js";
import { yearReading, decadeReading, eventReason, yearTag, EVENT_KINDS } from "../src/core/reading-year.js";

const BROKEN = /[{}]|undefined|null|NaN|\[object|function/;
const TAIWAN = PLACE_GROUPS.filter(g => g.group.startsWith("臺灣・")).map(g => g.places[0]);
const DOMAINS = ["career", "wealth", "love", "health", "study", "family", "move"];
const DEATHS = ["death", "fatherDeath", "motherDeath", "widowed", "siblingDeath"];
// The direction and domain of each event kind, as the module reads them.
const GOOD = new Set(["dating", "marriage", "childbirth", "job", "promotion", "wealthGain", "home", "graduate"]);
const BAD = new Set(["breakup", "divorce", "crisis", "illness", "injury", "layoff", "wealthLoss", "parentIll"]);
const DOMAIN_OF = {
  dating: "love", marriage: "love", breakup: "love", divorce: "love", crisis: "love", childbirth: "family", illness: "health", injury: "health",
  job: "career", layoff: "career", promotion: "career", careerChange: "career", startup: "career", wealthGain: "wealth", wealthLoss: "wealth",
  home: "wealth", move: "move", abroad: "move", exam: "study", graduate: "study", parentIll: "family", siblings: "family", retire: "career",
};

const strings = (x, out = []) => {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) for (const v of x) strings(v, out);
  else if (x && typeof x === "object") for (const v of Object.values(x)) strings(v, out);
  return out;
};
const clean = (x, where) => { for (const s of strings(x)) assert.ok(!BROKEN.test(s), `${where}: ${s}`); };

// Random births across Taiwan, 1950–2025, as test/story.test.js makes them; one in ten without a birth hour.
function charts(n, seed) {
  const rng = makeRng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const y = 1950 + rng.int(76), m = 1 + rng.int(12), d = 1 + rng.int(28);
    const chart = computeChart({ date: { y, m, d }, time: rng() < 0.1 ? null : { h: rng.int(24), mi: rng.int(60) }, place: rng.pick(TAIWAN), sex: rng() < 0.5 ? "male" : "female" });
    out.push({ chart, analysis: analyse(chart.pillars.map(p => p.name)) });
  }
  return out;
}
const ALL = charts(200, 2026);
const AGES = Array.from({ length: 91 }, (_, i) => i);

test("200 random charts, every age 0–90: clean text, levels in −2..2, a headline and 3–8 points", () => {
  for (const { chart, analysis } of ALL) {
    for (const age of AGES) {
      const r = yearReading(chart, analysis, age);
      const where = `${chart.pillars.map(p => p.name).join(" ")} age ${age}`;
      clean(r, where);
      assert.equal(r.age, age);
      assert.equal(r.xu, age + 1);
      assert.equal(r.pillar, chart.years[age].name);
      assert.ok(["吉", "平", "凶"].includes(r.favor.tone), where);
      for (const d of DOMAINS) {
        const v = r.domains[d];
        assert.ok(Number.isInteger(v.level) && v.level >= -2 && v.level <= 2, `${where} ${d} ${v.level}`);
        assert.ok(v.text.length > 8 && v.text.endsWith("。"), `${where} ${d}: ${v.text}`);
      }
      assert.ok(r.headline.startsWith(`${r.pillar}年`) && r.headline.length <= 70, `${where}: ${r.headline}`);
      assert.ok(r.points.length >= 3 && r.points.length <= 8, `${where}: ${r.points.length} points`);
      assert.ok(r.points.every(p => p.length > 8), where);
      assert.ok(yearTag(r).startsWith(`流年${r.pillar}（`), yearTag(r));
      const ids = r.signals.map(s => s.id);
      assert.equal(new Set(ids).size, ids.length, `${where}: duplicate signal ids`);
    }
  }
});

test("eventReason cites only signals the reading holds, pointing the event's way, and never explains a death", () => {
  let checked = 0;
  for (const [n, { chart, analysis }] of ALL.entries()) {
    for (const age of AGES) {
      const r = yearReading(chart, analysis, age);
      const byId = new Map(r.signals.map(s => [s.id, s]));
      for (const kind of DEATHS) assert.equal(eventReason(kind, r), null, kind);
      // Every kind on every age for a quarter of the charts; a rotating third of the kinds for the rest.
      const kinds = n < 50 ? EVENT_KINDS : EVENT_KINDS.filter((_, i) => (i + age) % 3 === 0);
      for (const kind of kinds) {
        const e = eventReason(kind, r);
        const where = `${chart.pillars.map(p => p.name).join(" ")} age ${age} ${kind}`;
        assert.ok(e && e.short && e.why, where);
        clean(e, where);
        assert.ok(e.short.startsWith(`${r.pillar}年：`) && e.short.length <= 60, `${where}: ${e.short}`);
        assert.ok(e.why.length <= 160, `${where}: ${e.why.length}`);
        for (const id of e.basis) assert.ok(byId.has(id), `${where}: cites ${id}, not in the reading`);
        if (!e.matched) assert.deepEqual(e.basis, [], where);
        // The year's signals point the event's way (the 天醫、天德… comfort of an illness aside).
        const domain = DOMAIN_OF[kind];
        for (const id of e.basis) {
          const s = byId.get(id);
          if (s.context || s.tags.includes("healer")) continue;
          assert.ok(s.notes[domain], `${where}: ${id} says nothing about ${domain}`);
          const v = s.domains[domain];
          if (GOOD.has(kind)) assert.ok(v ? v > 0 : s.tone !== "凶", `${where}: ${id} points against a good event`);
          if (BAD.has(kind)) assert.ok(v ? v < 0 : s.tone !== "吉", `${where}: ${id} points against a bad event`);
        }
        if ((kind === "illness" || kind === "injury") && e.matched) {
          assert.ok(e.why.includes("命理上這一年要多留意"), `${where}: ${e.why}`);
          assert.ok(!/一定|必定|必然|注定|吃藥|服用/.test(e.why), `${where}: ${e.why}`);
        }
        checked++;
      }
    }
  }
  assert.ok(checked > 100000, `${checked} reasons checked`);
  assert.equal(eventReason("nonsense", yearReading(ALL[0].chart, ALL[0].analysis, 30)), null);
});

test("every decade reads cleanly: its pillar, gods, 喜忌 and the 交運 year in 3–5 sentences", () => {
  for (const { chart, analysis } of ALL.slice(0, 100)) {
    chart.luck.decades.forEach((d, i) => {
      const r = decadeReading(chart, analysis, i);
      const where = `${chart.pillars.map(p => p.name).join(" ")} 大運 ${d.name}`;
      clean(r, where);
      assert.equal(r.name, d.name);
      assert.deepEqual([r.startAge, r.endAge, r.startYear, r.endYear], [d.startAge, d.endAge, d.startYear, d.endYear]);
      assert.deepEqual(r.gods, d.gods);
      assert.ok(["吉", "平", "凶"].includes(r.tone), where);
      assert.ok(r.sentences.length >= 3 && r.sentences.length <= 5, where);
      assert.ok(r.text.startsWith(`${d.name}大運`) && r.text.includes(`${d.startYear} 年`) && r.text.includes(d.gods.stem), `${where}: ${r.text}`);
      assert.ok(r.headline.startsWith(`${d.name}大運（${d.gods.stem}／${d.gods.branch}）`), r.headline);
      for (const k of r.keyYears) assert.ok(k.year >= d.startYear && k.year <= d.endYear && k.note, where);
    });
  }
});

test("1988-02-15 23:30 male 臺北 in 甲午: 子午沖 on the 時柱（子女宮、晚年）and 反吟 with the hour pillar", () => {
  const chart = computeChart({ date: { y: 1988, m: 2, d: 15 }, time: { h: 23, mi: 30 }, place: findPlace("臺北市"), sex: "male" });
  assert.deepEqual(chart.pillars.map(p => p.name), ["戊辰", "甲寅", "辛丑", "戊子"]);
  const analysis = analyse(chart.pillars.map(p => p.name));
  const age = chart.years.findIndex(y => y.name === "甲午");
  const r = yearReading(chart, analysis, age);
  assert.equal(r.year, 2014);
  assert.deepEqual(r.gods, { stem: "正財", branch: "七殺" });
  assert.equal(r.decade.name, "丁巳");
  assert.ok(r.relations.some(x => x.kind === "六沖" && x.roles.includes("hour")));
  assert.ok(r.relations.some(x => x.kind === "反吟" && x.roles.includes("hour")));
  assert.ok(r.signals.some(s => s.id === "rel.fanyin.hour"));
  assert.ok(r.points.some(p => /午火沖時支子水/.test(p) && p.includes("子女宮") && p.includes("晚年")), r.points.join("\n"));
  assert.ok(r.points.some(p => p.includes("反吟") && p.includes("時柱戊子")), r.points.join("\n"));
  assert.ok(r.headline.includes("反吟"), r.headline);
  assert.equal(yearTag(r), "流年甲午（正財／七殺）・大運丁巳（七殺）");
  assert.equal(yearTag(r, { full: true }), "流年甲午（正財／七殺）・大運丁巳（七殺／正官）");
  // A birth is explained by supportive signals only, a divorce by unsettling ones.
  const birth = eventReason("childbirth", r);
  assert.ok(!birth.basis.includes("rel.fanyin.hour"), JSON.stringify(birth));
  const divorce = eventReason("divorce", r);
  assert.ok(divorce.basis.includes("rel.harm.day") && !/天喜|紅鸞/.test(divorce.why), JSON.stringify(divorce));
  assert.ok(eventReason("dating", r).basis.includes("god.財"));   // 男命正財為妻
});

test("a year that clashes the day branch names 夫妻宮 in its love text", () => {
  const BR = "子丑寅卯辰巳午未申酉戌亥", clash = (a, b) => (BR.indexOf(a) - BR.indexOf(b) + 12) % 12 === 6;
  let seen = 0;
  for (const { chart, analysis } of ALL.slice(0, 60)) {
    const day = chart.pillars.find(p => p.role === "day").branch.name;
    for (let age = 18; age <= 64; age++) {
      if (!clash(chart.years[age].name[1], day)) continue;
      const r = yearReading(chart, analysis, age);
      assert.ok(r.domains.love.text.includes("夫妻宮"), `${chart.pillars.map(p => p.name).join(" ")} ${r.pillar}: ${r.domains.love.text}`);
      assert.ok(r.domains.love.basis.some(id => id === "rel.clash.day" || id === "rel.fanyin.day"), r.domains.love.basis.join());
      seen++;
    }
  }
  assert.ok(seen > 100, `${seen} clashing years`);
});

test("童限 years have no 大運, and a child's career and love are not read", () => {
  for (const { chart, analysis } of ALL.slice(0, 60)) {
    const first = chart.luck.decades[0];
    for (let age = 0; age < 12; age++) {
      const r = yearReading(chart, analysis, age);
      if (age + 1 < first.startAge) {
        assert.equal(r.decade, null);
        assert.ok(yearTag(r).endsWith("童限"));
        assert.ok(r.signals.some(s => s.id === "childhood"));
      } else assert.ok(r.decade && r.decade.name);
      assert.equal(r.domains.love.level, 0);
      assert.equal(r.domains.career.level, 0);
      assert.ok(r.domains.love.text.includes("年紀尚小") && r.domains.career.text.includes("年紀尚小"));
      for (const p of r.points) assert.ok(!/升遷|加薪|婚姻|論及婚嫁|第三者|合約/.test(p), `${r.pillar} age ${age}: ${p}`);
    }
  }
});
