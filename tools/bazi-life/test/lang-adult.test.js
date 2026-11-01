// The English of story/adult.js (README「英文版（翻譯層）」, src/i18n/en/adult.json): every event, run on its own in
// many kinds of life, shows no Chinese and no broken template, takes the same draws as in Chinese, and leaves memories
// the later story can read in English.
import { test } from "node:test";
import assert from "node:assert/strict";
import { storyBundle } from "../scripts/story-bundle.mjs";
import { makeLang, hasCJK } from "../src/sim/lang.js";
import { expand, fill } from "../src/sim/grammar.js";
import { makeRng } from "../src/sim/rng.js";
import { newPerson, pronoun } from "../src/sim/people.js";
import { chatTool, tripPlace } from "../src/sim/world.js";
import { computeChart } from "../src/core/chart.js";
import { prepare } from "../src/sim/setup.js";
import * as R from "../src/sim/rates.js";
import { ADULT } from "../src/sim/story/adult.js";

const bundle = await storyBundle();
const BROKEN = /[{}]|undefined|null|NaN|\[object|function/;
const chart = computeChart({ date: { y: 1975, m: 5, d: 12 }, time: { h: 8, mi: 30 }, place: { name: "臺北市", lon: 121.5, lat: 25.04, tz: "Asia/Taipei" }, sex: "male" });
const { analysis } = prepare(chart, { name: "" });

// States for the adult years that reach the branches: every era, sex, married or dating or single, a same-sex couple,
// children of every age, each kind of job (or none), abroad, retired, parents alive or not, siblings named or not,
// friends or none, an ex from school or a remembered crush, a home bought at different times, every schooling.
const person = (sex, call, extra = {}) => ({ sex, call, name: call, alive: true, id: `p_${call}`, ...extra });
function states() {
  const out = [];
  const years = [1972, 1983, 1988, 1993, 1997, 1999, 2001, 2003, 2007, 2009, 2011, 2013, 2016, 2019, 2021, 2023];
  const jobs = [["工程師", "科技"], ["護理師", "醫療"], ["公務員", "公部門"], ["老師", "教育"], ["銀行行員", "金融"], ["工廠作業員", "製造"], ["廚師", "餐飲"], ["業務", "業務"], ["設計師", "設計"], ["記者", "媒體"], ["美髮師", "服務"], ["門市人員", "零售"], ["律師", "法律"], ["營造工地", "營造"], ["貨運司機", "運輸"], ["大學講師", "教育"], ["老闆", "自營"], ["幫忙家裡", "家業"], ["行銷企劃", "行銷"], ["社工", "社福"], ["研究員", "研究"], ["不動產經紀人", "不動產"], ["導遊", "觀光"], ["行政助理", "行政"]];
  const kidSets = [[], [["female", "宥蓁", 0]], [["male", "承恩", 1]], [["male", "冠宇", 2], ["female", "子晴", 0]], [["female", "怡君", 8]], [["male", "家豪", 14], ["female", "雅婷", 9]], [["male", "志明", 15]], [["female", "淑芬", 18], ["male", "建宏", 22]], [["male", "俊傑", 23]], [["female", "小美", 5], ["male", "阿明", 12]], [["female", "思妤", 6]], [["male", "宇軒", 17], ["female", "品妍", 13]]];
  let i = 0;
  for (const year of years) for (let v = 0; v < 12; v++) {
    i++;
    const sex = i % 2 ? "male" : "female", age = 30 + ((i * 7) % 28), [title, field] = jobs[i % jobs.length];
    const employed = i % 7 !== 3, married = i % 5 !== 4, same = i % 11 === 5;
    const partnerSex = same ? sex : sex === "male" ? "female" : "male";
    const kids = kidSets[(i * 5) % kidSets.length].map(([ks, kc, ka], j) => ({ ...person(ks, kc), age: ka, id: `kid${j}`, ...(j === 0 && i % 4 === 0 ? { a_hobby: ["畫畫", "鋼琴", "美語", "程式"][i % 4], major: i % 8 === 0 ? "資工系" : undefined } : {}) }));
    out.push({
      age, year, sex, birthYear: year - age, county: ["臺北市", "基隆市", "臺中市", "高雄市", "花蓮縣"][i % 5],
      abroad: i % 13 === 6 ? "美國" : null, employed, studying: false, retired: i % 17 === 9,
      savings: [0.2, 0.6, 1.5, 3][i % 4], debt: 0, income: 1, career: 1 + (i % 4),
      job: employed || i % 2 ? { title, field, since: 25, factor: 1 } : null, kids,
      partner: married || i % 2 ? person(partnerSex, same ? (sex === "male" ? "建宏" : "雅婷") : partnerSex === "female" ? "淑芬" : "志明", { id: "partner1", real: false }) : null,
      rel: married ? "married" : i % 2 ? "dating" : "single", since: age - [5, 10, 15, 20, 25, 3][i % 6], datingSince: age - 8,
      father: { alive: i % 4 !== 0 }, mother: { alive: i % 5 !== 0 },
      home: i % 3 ? "own" : "rent", ownedAt: i % 3 ? age - (i % 22) : undefined,
      edu: ["國中", "高中", "高職", "大學", "科大", "碩士", "五專", "國小"][i % 8],
      friends: i % 4 === 2 ? [] : [person("female", "阿華", { how: "同學" }), person("male", "小凱", { how: "同事" })],
      exes: i % 5 === 1 ? [person("female", "佩君", { how: "同學" })] : [], divorces: i % 9 === 4 ? 1 : 0,
      memory: i % 3 === 1 ? [{ kind: "crush", call: i % 6 === 1 ? "雅琪" : undefined, age: [14, 17, 20][i % 3], text: "" }] : [],
      flags: { ...(i % 6 === 2 ? { a_eduFund: true } : {}), ...(i % 10 === 3 ? { y_cohabit: "partner1" } : {}) }, arcs: {},
      health: { stress: 0.3, fitness: 0.5, hr: 1 }, guard: 0, crisis: 0, last: {}, done: new Set(), count: {},
      siblings: { list: i % 3 === 0 ? [] : [{ relation: "olderBrother", label: "哥哥", name: i % 2 ? "陳志明" : "", older: true, bornAt: -3, born: true }, { relation: "youngerSister", label: "妹妹", name: "陳淑惠", older: false, bornAt: 4, born: true }] },
      traits: {},
    });
  }
  return out;
}

// A ctx as life.js makes it: the wording (with the "told already" checks and, in English, the picks), the story's
// usual words and the scene's friend and trip.
function makeCtx(s, rng, en) {
  const scene = {};
  const slots = () => ({
    city: s.abroad || s.county, job: s.job ? s.job.title : "工作", partner: s.partner ? s.partner.call : "另一半", ta: pronoun(s.partner),
    kid: s.kids.length ? s.kids[s.kids.length - 1].call : "孩子", kids: s.kids.length > 1 ? "孩子們" : "孩子",
    friend: () => (scene.friend ??= (() => { const f = s.friends.filter(x => x.alive); return f.length ? rng.pick(f).call : "老朋友"; })()),
    grand: s.sex === "female" ? "阿嬤" : "阿公", chat: chatTool(s.year), trip: () => (scene.trip ??= tripPlace(s, ctx)), age: s.age, year: s.year,
  });
  function w(templates, vars = {}) {
    const list = Array.isArray(templates) ? templates : [templates], fresh = list.filter(t => !s.used.has(t));
    const template = rng.pick(fresh.length ? fresh : list);
    s.used.add(template);
    const all = { ...slots(), ...vars }, trace = en && [];
    let text = expand(template, all, rng, trace);
    for (let i = 0; i < 6 && s.used.has(text); i++) { if (trace) trace.length = 0; text = expand(template, all, rng, trace); }
    s.used.add(text);
    if (!en) return text;
    const lazy = { friend: () => scene.friend ?? "老朋友", trip: () => scene.trip ?? "墾丁" };
    for (const k of Object.keys(lazy)) if (k in vars) delete lazy[k];
    return en.w(template, { ...all, ...lazy }, trace, text);
  }
  const ctx = {
    rng, R, s, chart, analysis, name: null, family: null, lang: en ? "en" : "zh", w, f: (t, v = {}) => (en ? en.f(t, v) : fill(t, v)),
    roll: (d, c, p) => rng() < p, odds: (d, c, p) => p, person: o => newPerson(s, ctx, o), nudge: () => {},
    remember: (kind, text, extra = {}) => s.memory.push({ kind, text, age: s.age, ...extra }),
    arc: {
      start: (id, data = {}, inYears = 1, stage = "start") => s.arcs[id] || (s.arcs[id] = { stage, next: s.age + inYears, since: s.age, data }),
      at: (id, stage) => !!s.arcs[id] && s.arcs[id].stage === stage && s.age >= s.arcs[id].next,
      go: () => {}, end: id => { delete s.arcs[id]; }, get: id => s.arcs[id] || null,
    },
  };
  return ctx;
}

// An event three years running on one state (so a scene or template already told is passed over), every option of a
// choice applied to a copy: what the reader sees, the moods, and the random number after it all.
function run(ev, base, seed, en) {
  const s = structuredClone(base);
  s.used = new Set();
  const rng = makeRng(seed), shown = [], moods = [], memories = [];
  const text = t => (en ? en.text(t) : t);
  for (let r = 0; r < 3; r++) {
    if (ev.id === "a_loanReturn") s.arcs.a_loan = { stage: "start", next: 0, data: { who: r % 2 ? "表哥" : "阿姨", lent: 0.2, odds: 0.5 } };
    if (ev.id === "a_stakeResult") s.arcs.a_stake = { stage: "start", next: 0, data: { who: "阿華", kind: en ? en.f("咖啡店") : "咖啡店", put: 0.3, guarantor: (seed + r) % 2 === 0 } };
    const ctx = makeCtx(s, rng, en);
    const fits = ev.id === "a_rhythm" ? !!s.partner && (s.rel === "dating" || s.rel === "married") : !ev.when || ev.when(s, ctx);
    if (fits && ev.choice) {
      const c = ev.choice(s, ctx);
      shown.push(text(c.prompt));
      for (const o of c.options) {
        const s2 = structuredClone({ ...s, used: null });
        s2.used = s.used;
        if (o.when && !o.when(s2)) continue;
        shown.push(text(o.label), text(o.hint || ""));
        const out = o.apply(s2, makeCtx(s2, rng, en));
        shown.push(text(out.text)); moods.push(out.mood);
        memories.push(...s2.memory.slice(s.memory.length).map(m => m.text));
      }
    } else if (fits) {
      const out = ev.apply(s, ctx);
      shown.push(text(out.text)); moods.push(out.mood);
    }
    s.age += 1; s.year += 1;
    for (const k of s.kids) k.age += 1;
  }
  return { shown, moods, memories, after: rng() };
}

test("every adult.js event, in many kinds of life, reads in English with no Chinese and no broken template", () => {
  const en = makeLang(bundle), list = states();
  let lines = 0;
  for (const [k, ev] of ADULT.entries()) {
    let hit = 0;
    for (const [j, st] of list.entries()) for (const seed of [1, 2]) {
      const { shown } = run(ev, st, k * 100000 + j * 10 + seed, en);
      for (const t of shown) {
        assert.ok(!hasCJK(t), `${ev.id} (state ${j}): ${t}`);
        assert.ok(!BROKEN.test(t), `${ev.id} (state ${j}): ${t}`);
      }
      hit += shown.length; lines += shown.length;
    }
    assert.ok(hit > 0, `${ev.id} never ran`);
  }
  assert.ok(lines > 50000, `only ${lines} lines`);
  const missing = [...en.missing].filter(t => hasCJK(t));
  assert.deepEqual(missing, [], "Chinese with no English");
});

test("in English an adult.js event takes the same draws as in Chinese", () => {
  const en = makeLang(bundle), list = states();
  for (const [k, ev] of ADULT.entries()) {
    for (const [j, st] of list.entries()) {
      if (j % 3) continue;
      const seed = k * 100000 + j * 10 + 7, zh = run(ev, st, seed, null), eng = run(ev, st, seed, en);
      assert.deepEqual([eng.moods, eng.shown.length, eng.after], [zh.moods, zh.shown.length, zh.after], `${ev.id} (state ${j})`);
    }
  }
});

test("what adult.js remembers can be read in English later", () => {
  // memoryLane (core.js) quotes the first clause of a memory; a memory written from a template is English in an English
  // life, and the fixed ones (開始每天慢跑…) have English of their own.
  const en = makeLang(bundle), list = states();
  const seen = new Set();
  for (const id of ["a_midlife", "a_major", "a_studyAbroadKid", "a_reunion"]) {
    const ev = ADULT.find(e => e.id === id);
    for (const [j, st] of list.entries()) for (const m of run(ev, st, j, en).memories) {
      seen.add(id);
      const gist = String(m).split(/[，。！]/)[0].replace(/^你/, "");
      assert.ok(!hasCJK(en.text(gist)), `${id}: ${m}`);
    }
  }
  assert.deepEqual([...seen].sort(), ["a_major", "a_midlife", "a_reunion", "a_studyAbroadKid"]);
});
