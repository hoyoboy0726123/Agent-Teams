// The partner from the family input (伴侶): their member and tilts, the first relationship once you are both adults,
// the love events their chart tilts while you are together, 生活節奏不同 when the day branches clash, the 同盤重跑
// counts, and lives without a partner left exactly as they were.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart, fourPillars } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { buildFamily, checkFamily, familyTilts, describeFamilyTilts, partnerNote, RELATIONS } from "../src/core/family.js";
import { clash } from "../src/core/detail.js";
import { DOMAINS, CHANNELS } from "../src/core/luck.js";
import { prepare } from "../src/sim/setup.js";
import { createLife, runLife, personalTilt } from "../src/sim/life.js";
import { rerun } from "../src/sim/monte.js";
import { realPartnerOutcome, REAL_PARTNER_AGE as A } from "../src/sim/people.js";
import { hashSeed } from "../src/sim/rng.js";
import { ALL_EVENTS, deathEvent } from "../src/sim/story/index.js";

const place = findPlace("臺北市");
const BROKEN = /[{}]|undefined|null|NaN|\[object|function/;
const chartOf = (y, sex) => computeChart({ date: { y, m: 2, d: 15 }, time: { h: 23, mi: 30 }, place, sex });
const ME = chartOf(1988, "female");   // 辛丑 day: 丑 is the day branch
const PREP = prepare(ME);
const neutral = PREP.luck.map(y => ({ ...y, L: 0, score: 50, reasons: [], m: Object.fromEntries(Object.keys(DOMAINS).map(d => [d, Object.fromEntries(CHANNELS.map(c => [c, 0]))])) }));
const LOVE = ["breakup", "proposal", "crisis", "divorce", "a_rhythm"];

// The first day of `year` whose day branch clashes with yours (wantClash), or does not.
function partnerDate(chart, year, wantClash) {
  const mine = chart.pillars[2].name[1];
  for (let t = Date.UTC(year, 0, 1); ; t += 86400000) {
    const d = new Date(t), date = { y: year, m: d.getUTCMonth() + 1, d: d.getUTCDate() };
    if (clash(mine, fourPillars({ date, place }).day[1]) === wantClash) return date;
  }
}
const CLASH = partnerDate(ME, 1986, true), CALM = partnerDate(ME, 1986, false);
const realOf = s => [s.partner, ...s.exes].filter(p => p && p.real);
// A family with one partner member whose bond is replaced (net, notes), to compare strong bonds on the same seeds.
function withBond(prep, net, notes = null) {
  const m = prep.family.members.find(x => x.relation === "partner");
  return { ...prep.family, members: [{ ...m, bond: { ...m.bond, net, notes: notes || m.bond.notes } }] };
}
// An auto-played life, step by step: `after(entries, life)` sees each year's entries with the state at the year's end.
function live({ chart, prep, family, seed, luck = prep.luck, after }) {
  const life = createLife({ chart, analysis: prep.analysis, luck, seed, family, auto: true });
  while (!life.done) after(life.step(), life);
  return life;
}

test("the family input takes a partner: a 伴侶 member with a chart and a bond, checked within 30 years", () => {
  assert.equal(RELATIONS.partner, "伴侶");
  const me = { pillars: PREP.natal, analysis: PREP.analysis, sex: "female" };
  const fam = buildFamily({ partner: { name: "王小明", date: { y: 1986, m: 6, d: 1 }, time: null } }, me, place);
  const m = fam.members[0];
  assert.deepEqual(Object.keys(m).sort(), ["bond", "chart", "date", "label", "marriedYear", "metYear", "name", "relation", "sex"]);
  assert.deepEqual([m.relation, m.label, m.name, m.sex], ["partner", "伴侶", "王小明", "male"]);   // the opposite of yours
  assert.deepEqual(m.date, { y: 1986, m: 6, d: 1 });
  assert.equal(m.chart.pillars.length, 3);                                                         // no birth time
  assert.ok(m.bond.net >= -1 && m.bond.net <= 1 && ["互補", "平穩", "需要磨合"].includes(m.bond.tone));
  assert.equal(fam.onlyChild, false);
  const date = { y: 1990, m: 3, d: 1 };
  assert.equal(buildFamily({ partner: { name: "林美華", date } }, { ...me, sex: "male" }, place).members[0].sex, "female");
  assert.equal(buildFamily({ partner: { name: "陳志明", date, sex: "male" } }, { ...me, sex: "male" }, place).members[0].sex, "male");
  // A partner given only by name is a member without a chart.
  const named = buildFamily({ partner: { name: "王小明" } }, me, place).members[0];
  assert.deepEqual([named.chart, named.bond, named.date, named.sex], [null, null, null, "male"]);
  assert.equal(buildFamily({ partner: { name: "" } }, me, place), null);
  // prepare() gives buildFamily your sex.
  assert.equal(prepare(chartOf(1988, "male"), { family: { partner: { name: "林美華", date } } }).family.members[0].sex, "female");
  // With parents and siblings the partner is one more member, and not a sibling.
  const all = prepare(ME, { family: { father: { name: "陳大明" }, siblings: [{ relation: "olderBrother", name: "陳志明" }], partner: { name: "王小明", date } } }).family;
  assert.deepEqual(all.members.map(x => x.relation), ["father", "olderBrother", "partner"]);
  const birth = { y: 1988, m: 2, d: 15 };
  assert.deepEqual(checkFamily({ partner: { date: { y: 1958, m: 1, d: 1 } } }, birth), []);       // exactly 30 years
  assert.match(checkFamily({ partner: { name: "王小明", date: { y: 1957, m: 12, d: 31 } } }, birth)[0], /^伴侶（王小明）和你差了 30 年以上，請檢查出生年份。$/);
  assert.equal(checkFamily({ partner: { date: { y: 2019, m: 1, d: 1 } } }, birth).length, 1);
  assert.deepEqual(checkFamily({ partner: { name: "王小明" } }, birth), []);
});

test("familyTilts: bond.partner is 0.15 × the partner's net, within ±0.15, and the partner is not a sibling", () => {
  for (const net of [-1, -0.6, -0.2, 0, 0.35, 1]) {
    const t = familyTilts({ members: [{ relation: "partner", bond: { net } }, { relation: "olderSister", bond: { net: 0.4 } }] });
    assert.ok(Math.abs(t.bond.partner - 0.15 * net) < 1e-12, `${net}: ${t.bond.partner}`);
    assert.ok(Math.abs(t.bond.partner) <= 0.15 + 1e-12);
    assert.ok(Math.abs(t.bond.siblings - 0.06) < 1e-12, "the siblings' average leaves the partner out");
    assert.deepEqual([t.childhood, t.study, t.bond.father, t.bond.mother], [0, 0, 0, 0]);
  }
  assert.equal(familyTilts({ members: [{ relation: "partner", bond: { net: 3 } }] }).bond.partner, 0.15);   // capped
  assert.equal(familyTilts({ members: [{ relation: "partner", bond: null }] }).bond.partner, 0);           // only a name
  assert.equal(familyTilts(null).bond.partner, 0);
  assert.deepEqual(describeFamilyTilts(familyTilts({ members: [{ relation: "partner", bond: { net: 1 } }] })), ["和伴侶之間：感情順利 +16%、感情摩擦 −14%"]);
  assert.deepEqual(describeFamilyTilts(familyTilts({ members: [{ relation: "partner", bond: { net: -1 } }] })), ["和伴侶之間：感情順利 −14%、感情摩擦 +16%"]);
});

test("the partner's chart tilts breakup, proposal, crisis and divorce only while they are your partner, never a death", () => {
  const tilts = familyTilts({ members: [{ relation: "partner", bond: { net: 1 } }] });
  const ev = id => ALL_EVENTS.find(e => e.id === id);
  const real = { age: 30, tilts, partner: { real: true } }, other = { age: 30, tilts, partner: { real: false } }, single = { age: 30, tilts, partner: null };
  for (const id of ["breakup", "crisis", "divorce", "a_rhythm"]) {
    assert.equal(personalTilt(ev(id), real, null), -0.15, id);
    assert.equal(personalTilt(ev(id), other, null), 0, id);
    assert.equal(personalTilt(ev(id), single, null), 0, id);
  }
  assert.equal(personalTilt(ev("proposal"), real, null), 0.15);
  assert.equal(personalTilt(ev("dating"), single, null), 0);
  for (const e of [...ALL_EVENTS, deathEvent].filter(x => x.grave)) assert.equal(personalTilt(e, real, null), 0, e.id);
  assert.ok(!ev("widowed").about && !ev("widowed").bondNote);
});

test(`the real partner is your first partner once you are both ${A}, with their name, sex and age`, () => {
  const cases = [
    // older than you: from your A on; younger: from the year they turn A; much younger: you may already be married
    { me: chartOf(1988, "female"), partner: { name: "王小明", date: { y: 1986, m: 6, d: 1 } }, sex: "male", call: "小明" },
    { me: chartOf(1975, "male"), partner: { name: "歐陽娜娜", date: { y: 1982, m: 3, d: 9 }, sex: "female" }, sex: "female", call: "娜娜" },
    { me: chartOf(1975, "male"), partner: { name: "林語柔", date: { y: 1990, m: 8, d: 20 } }, sex: "female", call: "語柔" },
  ];
  for (const c of cases) {
    const prep = prepare(c.me, { family: { partner: c.partner } });
    const from = Math.max(A, c.partner.date.y + A - c.me.input.date.y);   // your age in the first year both are A
    let met = 0, missed = 0;
    for (let i = 0; i < 150; i++) {
      let metAge = null;
      const life = live({
        chart: c.me, prep, family: prep.family, seed: 3000 + i,
        after: (entries, l) => {
          const e = entries.find(x => x.id === "dating" && l.state.partner && l.state.partner.real && x.age === l.state.flags.realPartnerMet);
          if (!e) return;
          const s = l.state, p = s.partner;
          metAge = e.age;
          assert.ok(e.text.includes(c.call) && e.big && !BROKEN.test(e.text), e.text);
          assert.deepEqual([p.name, p.call, p.sex, p.birthYear], [c.partner.name, c.call, c.sex, c.partner.date.y]);
          assert.equal(p.age, s.year - c.partner.date.y, "their real age");
          assert.ok(e.age >= A && e.year - c.partner.date.y >= A, `met at ${e.age}, partner ${e.year - c.partner.date.y}`);
        },
      });
      const s = life.state, dated = life.log.filter(e => e.id === "dating");
      assert.ok(realOf(s).length <= 1, "the real partner appears once");
      const firstAfter = dated.find(e => e.age >= from);
      const marriedThen = s.spells.some(x => x.from <= from && (x.to === null || x.to > from));
      if (metAge === null) {
        assert.equal(s.flags.realPartnerMet, undefined);
        assert.ok(marriedThen || !firstAfter, "a relationship after you both came of age is with the real partner");
        if (marriedThen) missed++;
        continue;
      }
      met++;
      assert.ok(metAge >= from && !marriedThen, `met at ${metAge}`);
      assert.equal(firstAfter.age, metAge, "the first relationship once you are both adults");
      // Before them, and after a breakup or divorce, everyone is drawn at random.
      assert.ok(dated.filter(e => e.age !== metAge).every(e => !e.text.includes(c.call)));
    }
    assert.ok(met >= 60, `${c.partner.name}: met in ${met} of 150`);
    if (from >= 33) assert.ok(missed >= 10, `${c.partner.name}: married to someone else when both came of age in ${missed} of 150`);
  }
});

test("the years given are kept: you meet in the year you got together and marry in the wedding year", () => {
  const partner = { name: "王小明", date: { y: 1986, m: 6, d: 1 }, sex: "male" };
  for (const years of [{ metYear: 2013 }, { marriedYear: 2017 }, { metYear: 2012, marriedYear: 2016 }]) {
    const prep = prepare(ME, { family: { partner: { ...partner, ...years } } });
    const meet = years.metYear || years.marriedYear - 2, wed = years.marriedYear || null;
    let alive = 0, wedded = 0;
    for (let i = 0; i < 120; i++) {
      const life = runLife({ chart: ME, analysis: ME.analysis || prep.analysis, luck: prep.luck, seed: 6000 + i, family: prep.family });
      const s = life.state, at = y => y - ME.input.date.y;
      if (s.age < at(wed || meet)) continue;
      alive++;
      assert.equal(s.flags.realPartnerMet, at(meet), `${JSON.stringify(years)}: met at ${s.flags.realPartnerMet}`);
      assert.ok(!s.spells.some(x => x.from < at(meet)), "no marriage before the year you got together");
      if (wed) {
        if (s.flags.realPartnerWed === at(wed)) wedded++;
        const w = life.log.find(e => e.id === "realPartnerWedding");
        if (w) assert.ok(w.big && w.text.includes("小明") && !BROKEN.test(w.text), w.text);
      }
    }
    assert.ok(alive >= 100, `${alive} alive`);
    if (wed) assert.ok(wedded >= alive * 0.95, `${JSON.stringify(years)}: married in ${wed} in ${wedded} of ${alive}`);
  }
  // The form checks the years.
  const birth = { y: 1988, m: 2, d: 15 };
  assert.match(checkFamily({ partner: { ...partner, metYear: 1999 } }, birth).join(""), /開始交往的年份/);
  assert.match(checkFamily({ partner: { ...partner, marriedYear: 2003 } }, birth).join(""), /結婚年份/);
  assert.match(checkFamily({ partner: { ...partner, metYear: 2015, marriedYear: 2012 } }, birth).join(""), /不能早於/);
  assert.deepEqual(checkFamily({ partner: { ...partner, metYear: 2012, marriedYear: 2016 } }, birth), []);
});

test("a partner given only by name joins the story without any tilt", () => {
  const prep = prepare(ME, { family: { partner: { name: "王小明" } } });
  assert.equal(prep.family.members[0].bond, null);
  let met = 0;
  for (let i = 0; i < 80; i++) {
    const life = runLife({ chart: ME, analysis: prep.analysis, luck: prep.luck, seed: 4000 + i, family: prep.family });
    const [p] = realOf(life.state);
    assert.ok(!life.log.some(e => e.reasonFrom === "family" || e.id === "a_rhythm"));
    if (!p) continue;
    met++;
    assert.deepEqual([p.name, p.call, p.sex], ["王小明", "小明", "male"]);
    assert.ok(life.state.flags.realPartnerMet >= A && ME.input.date.y + life.state.flags.realPartnerMet - p.birthYear >= 18);
  }
  assert.ok(met >= 40, `met in ${met} of 80`);
});

test("生活節奏不同 comes only with a real partner whose day branch clashes with yours", () => {
  const ids = new Set();
  for (const [date, clashing] of [[CLASH, true], [CALM, false]]) {
    const prep = prepare(ME, { family: { partner: { name: "王小明", date } } });
    assert.equal(prep.family.members[0].bond.notes.some(n => n.short === "日支相沖"), clashing);
    let asked = 0;
    for (let i = 0; i < 150; i++) {
      const life = createLife({ chart: ME, analysis: prep.analysis, luck: prep.luck, seed: 5000 + i, family: prep.family });
      let guard = 0;
      while (!life.done && guard++ < 6000) {
        const p = life.pending;
        if (!p) { life.step(); continue; }
        if (p.id !== "a_rhythm") { life.choose(0); continue; }
        asked++;
        const s = life.state, call = s.partner.call;
        assert.ok(s.partner.real && (s.rel === "dating" || s.rel === "married") && s.age > s.datingSince);
        assert.ok(p.options.length >= 4 && p.options.length <= 6);
        assert.ok(p.options.every(o => o.id.startsWith("a_rhythm.") && o.act && o.style && o.label && !BROKEN.test(o.label)));
        assert.ok(p.prompt.includes(call) && /生活節奏|步調/.test(p.prompt) && !BROKEN.test(p.prompt), p.prompt);
        assert.equal(p.why.from, "family");
        assert.match(p.why.text, /^你們的日支相沖（丑未沖），/);
        const k = asked % p.options.length, out = life.choose(k), e = out.find(x => x.id === "a_rhythm");
        ids.add(p.options[k].id);
        assert.ok(e && e.text.includes(call) && !BROKEN.test(e.text), e && e.text);
        assert.ok(e.reasonFrom === "family" && Math.abs(e.mood) <= 4);
      }
    }
    if (clashing) assert.ok(asked >= 10, `asked ${asked} times`);
    else assert.equal(asked, 0);
  }
  assert.equal(ids.size, 5, [...ids].join(", "));
});

test("合盤 explains the love events with the real partner in a line about the two charts, never a death", () => {
  const prep = prepare(ME, { family: { partner: { name: "王小明", date: CALM } } });
  const notes = [{ score: 0.8, text: "日支六合（丑子合，地合）", short: "日支六合" }, { score: -0.6, text: "生肖相害（龍和兔）", short: "生肖相害" }];
  const lines = { 1: "你們的日支相合（丑子合），感情容易有黏著力", "-1": "你們的生肖相害（龍和兔），容易有小誤會，需要多一點磨合" };
  for (const net of [1, -1]) {
    const seen = new Set();
    for (let i = 0; i < 120; i++) {
      const life = runLife({ chart: ME, analysis: prep.analysis, luck: neutral, seed: 8000 + i, family: withBond(prep, net, notes) });
      for (const e of life.log) {
        if (["widowed", "death"].includes(e.id)) assert.equal(e.reasonFrom, null, e.id);
        if (e.reasonFrom !== "family") continue;
        assert.ok(LOVE.includes(e.id) && e.channel === (net > 0 ? "good" : "bad"), e.id);
        assert.equal(e.reason, lines[net]);
        seen.add(e.id);
      }
    }
    assert.deepEqual([...seen].sort(), net > 0 ? ["proposal"] : ["breakup", "crisis", "divorce"]);
  }
  // The lines never say that one person 剋 the other.
  const stems = { notes: [{ score: -0.4, text: "對方的日干丁火約束你的日干辛金（火剋金）：對方比較會管你", short: "對方的日干約束你" }, { score: 0.5, text: "對方命盤水最旺，正是你的喜用", short: "對方水旺，是你的喜用" }] };
  assert.equal(partnerNote(stems, -1), "對方的日干丁火約束你的日干辛金，對方比較會管你，需要多一點磨合");
  assert.equal(partnerNote(stems, 1), "對方命盤水最旺，正是你的喜用，和對方在一起比較順");
  assert.equal(partnerNote({ notes: [] }, 1), null);
});

test("on the same seeds a strongly positive bond does not bring more divorces from the real partner than a negative one", () => {
  // More lives marry the partner when the charts get along (and so more of them can divorce), so divorces are compared
  // per marriage. Two protagonists × 400 lives for each bond: the gap is about three standard errors, so a change
  // elsewhere in the story, which deals the dice differently, does not flip it by chance.
  const him = chartOf(1990, "male");
  const setups = [[ME, { name: "王小明", date: CALM }], [him, { name: "林語柔", date: partnerDate(him, 1994, false) }]].map(([chart, partner]) => ({ chart, prep: prepare(chart, { family: { partner } }) }));
  const runs = net => {
    const out = { met: 0, married: 0, divorced: 0, ended: 0 };
    for (const { chart, prep } of setups) {
      const family = withBond(prep, net);
      for (let i = 0; i < 400; i++) {
        const s = runLife({ chart, analysis: prep.analysis, luck: prep.luck, seed: 20000 + i, family }).state;
        const o = realPartnerOutcome(s);
        for (const k of ["met", "married", "divorced"]) out[k] += o[k] ? 1 : 0;
        if (o.divorced || (o.met && !o.married && s.partner !== realOf(s)[0])) out.ended++;   // divorced, or broke up
      }
    }
    return out;
  };
  const good = runs(1), bad = runs(-1);
  assert.equal(good.met, bad.met, "meeting them is not tilted");
  assert.ok(good.married >= bad.married, `married ${good.married} vs ${bad.married}`);
  assert.ok(good.divorced / good.married <= bad.divorced / bad.married, `divorced ${good.divorced}/${good.married} vs ${bad.divorced}/${bad.married}`);
  assert.ok(good.ended <= bad.ended, `ended ${good.ended} vs ${bad.ended}`);
});

test("同盤重跑 counts the runs that met, married and divorced the real partner", () => {
  const prep = prepare(ME, { family: { partner: { name: "王小明", date: CLASH } } });
  const r = rerun({ chart: ME, analysis: prep.analysis, luck: prep.luck, runs: 60, key: "partner", family: prep.family });
  assert.deepEqual(Object.keys(r.partner), ["name", "met", "married", "divorced"]);
  assert.equal(r.partner.name, "王小明");
  assert.ok(r.partner.met >= 30 && r.partner.met <= 60 && r.partner.married >= 1 && r.partner.married <= r.partner.met);
  assert.ok(r.partner.divorced <= r.partner.married && r.partner.married <= r.married && r.partner.divorced <= r.divorced);
  // The same seeds, one by one.
  const each = Array.from({ length: 60 }, (_, i) => realPartnerOutcome(runLife({ chart: ME, analysis: prep.analysis, luck: prep.luck, seed: hashSeed(`partner#${i}`), family: prep.family }).state));
  assert.deepEqual([r.partner.met, r.partner.married, r.partner.divorced], ["met", "married", "divorced"].map(k => each.filter(o => o[k]).length));
  assert.equal(rerun({ chart: ME, analysis: PREP.analysis, luck: PREP.luck, runs: 5, key: "none" }).partner, null);
  const parents = prepare(ME, { family: { father: { name: "陳大明", date: { y: 1958, m: 5, d: 3 } } } });
  assert.equal(rerun({ chart: ME, analysis: parents.analysis, luck: parents.luck, runs: 5, key: "none", family: parents.family }).partner, null);
});

test("without a partner nothing changes: no tilt, partner: null, and a partner who never comes of age changes no life", () => {
  const parents = prepare(ME, { family: { father: { name: "陳大明", date: { y: 1958, m: 5, d: 3 } }, mother: { name: "林美華", date: { y: 1961, m: 9, d: 21 } } } });
  assert.equal(familyTilts(parents.family).bond.partner, 0);
  assert.ok(!describeFamilyTilts(familyTilts(parents.family)).some(x => x.includes("伴侶")));
  // A strongly bonded, clashing partner born so late that you are never both adults: every life is the same as with no
  // family at all, so the partner machinery (dating, tilts, 合盤 lines, 生活節奏不同) is inert until they appear.
  const clashing = prepare(ME, { family: { partner: { name: "王小明", date: CLASH } } }).family.members[0];
  const late = { members: [{ ...clashing, date: { y: 2100, m: 1, d: 1 }, bond: { ...clashing.bond, net: 1 } }], onlyChild: false };
  for (let i = 0; i < 60; i++) {
    const a = runLife({ chart: ME, analysis: PREP.analysis, luck: PREP.luck, seed: 6000 + i, family: null });
    const b = runLife({ chart: ME, analysis: PREP.analysis, luck: PREP.luck, seed: 6000 + i, family: late });
    assert.deepEqual(b.log.map(e => [e.id, e.text, e.reason]), a.log.map(e => [e.id, e.text, e.reason]));
    assert.deepEqual(b.kline, a.kline);
    assert.equal(b.state.flags.realPartnerMet, undefined);
  }
});
