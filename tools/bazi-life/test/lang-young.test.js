// The English of story/young.js (README「英文版（翻譯層）」, src/i18n/en/young.json): every event, run on its own in
// many kinds of young life, shows no Chinese and no broken template, takes the same draws as in Chinese, and leaves
// memories the later story can read in English.
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
import { YOUNG } from "../src/sim/story/young.js";

const bundle = await storyBundle();
const BROKEN = /[{}]|undefined|null|NaN|\[object|function/;
const chart = computeChart({ date: { y: 1975, m: 5, d: 12 }, time: { h: 8, mi: 30 }, place: { name: "臺北市", lon: 121.5, lat: 25.04, tz: "Asia/Taipei" }, sex: "male" });
const { analysis } = prepare(chart, { name: "" });

// States for the years from 18 to 30 that reach the branches: every era, sex, a first-year to a fourth-year student
// (in a dorm or not, with a department and senior-high stream or not), a master's student, a new or settled worker in
// each kind of job (or none), just out of the army or just moved north, abroad, living at home, renting each kind of
// room or owning, dating (a same-sex couple too), single or married, parents alive or not, friends (a best friend, a
// flatmate) or none, every schooling.
const person = (sex, call, extra = {}) => ({ sex, call, name: call, alive: true, id: `p_${call}`, ...extra });
function states() {
  const out = [];
  const years = [1968, 1974, 1979, 1983, 1987, 1991, 1995, 1998, 2001, 2004, 2007, 2010, 2012, 2015, 2017, 2020, 2023];
  const jobs = [["工程師", "科技"], ["護理師", "醫療"], ["公務員", "公部門"], ["老師", "教育"], ["銀行行員", "金融"], ["工廠作業員", "製造"], ["廚師", "餐飲"], ["業務", "業務"], ["設計師", "設計"], ["記者", "媒體"], ["美髮師", "服務"], ["門市人員", "零售"], ["營造工地", "營造"], ["貨運司機", "運輸"], ["老闆", "自營"], ["幫忙家裡", "家業"], ["行銷企劃", "行銷"], ["社工", "社福"], ["研究員", "研究"], ["行政助理", "行政"]];
  const counties = ["臺北市", "新北市", "臺中市", "高雄市", "臺南市", "花蓮縣", "澎湖縣", "新竹市", "嘉義縣", "臺東縣", "連江縣"];
  const rents = [undefined, "room", "share", "studio", "far", "dorm", "home"];
  const hows = ["高中同學", "大學同學", "同事", "室友", "系隊隊友", "國中同學", "鄰居", "老朋友"];
  let i = 0;
  for (const year of years) for (let v = 0; v < 16; v++) {
    i++;
    // Each state draws its own mix, so no two choices go together by accident (every student a woman, say).
    const r = makeRng(9000 + i), one = list => list[Math.floor(r() * list.length)], yes = p => r() < p;
    const sex = v % 2 ? "male" : "female", kind = Math.floor(v / 2) % 4;   // 0 undergrad, 1 master's, 2 employee, 3 other work or none
    const student = kind < 2, track = kind === 1 ? "碩士" : one(["大學", "大學", "科大"]);
    const age = kind === 0 ? 18 + Math.floor(r() * 5) : kind === 1 ? 22 + Math.floor(r() * 4) : 20 + Math.floor(r() * 11);
    const [title, field] = one(jobs);
    const employed = kind === 2 || (kind === 3 && yes(0.8)), same = yes(0.08);
    const partnerSex = same ? sex : sex === "male" ? "female" : "male";
    const rel = one(["dating", "dating", "dating", "dating", "single", "married"]);
    const edu = student ? (kind === 1 ? "大學" : one(["高中", "高職"])) : one(["大學", "大學", "科大", "碩士", "高中", "高職", "國中", "五專", "none"]);
    const county = one(counties), birthCounty = yes(0.35) ? one(counties) : county;
    const friends = yes(0.15) ? [] : [person(sex, sex === "male" ? "小凱" : "阿華", { how: one(hows), id: "f1" }), person(one(["female", "male"]), "佩君", { how: one(hows), id: "f2" })];
    out.push({
      age, year, sex, birthYear: year - age, county, birthCounty,
      abroad: yes(0.06) ? "美國" : null, employed, studying: student, track: student ? track : edu, retired: false,
      savings: one([0.1, 0.2, 0.3, 0.5, 1.2]), debt: yes(0.2) ? 0.2 : 0, income: 1, career: 1 + Math.floor(r() * 3), unemployedFor: employed ? 0 : 1,
      job: employed ? { title, field, since: yes(0.3) ? age : age - 1 - Math.floor(r() * 3), factor: 1 } : null,
      jobsHeld: yes(0.5) ? [] : [{ title }], kids: [],
      partner: rel !== "single" ? person(partnerSex, same ? (sex === "male" ? "建宏" : "雅婷") : partnerSex === "female" ? "淑芬" : "志明", { id: "partner1", real: false }) : null,
      rel, since: age - 1, datingSince: age - 1 - Math.floor(r() * 4),
      father: { alive: yes(0.8) }, mother: { alive: yes(0.85) },
      home: student ? one(["parents", "rent"]) : one(["rent", "rent", "parents", "own"]), edu,
      friends, exes: [], divorces: 0, memory: [],
      flags: {
        ...(kind === 0 ? { uniAt: age - Math.floor(r() * 4), dorm: yes(0.6) } : kind === 1 ? { uniAt: age - 4, dorm: yes(0.3) } : {}),
        ...(kind === 0 && yes(0.6) ? { dept: one(["資工系", "中文系", "企管系", "機械系", "外文系"]) } : {}),
        ...(yes(0.4) ? { major: one(["自然組", "社會組"]) } : {}),
        ...(yes(0.2) ? { movedNorth: age } : {}), ...(yes(0.15) ? { y_awayAt: age } : {}),
        ...(friends.length && yes(0.3) ? { bff: "f1" } : {}), ...(yes(0.2) ? { license: true } : {}),
        ...(yes(0.15) ? { beenAbroad: true } : {}), ...(yes(0.1) ? { y_cohabit: "partner1" } : {}),
        y_rentKind: one(rents),
      },
      last: { ...(sex === "male" && yes(0.35) ? { military: age } : {}), ...(kind >= 2 && yes(0.6) ? { graduateUni: age - 1 - Math.floor(r() * 2) } : {}), ...(yes(0.15) ? { move: age } : {}) },
      arcs: {}, health: { stress: 0.3, fitness: 0.5, hr: 1 }, guard: 0, crisis: 0, done: new Set(), count: {},
      siblings: { list: yes(0.3) ? [] : [{ relation: "olderBrother", label: "哥哥", name: yes(0.5) ? "陳志明" : "", older: true, bornAt: -3, born: true }, { relation: "youngerSister", label: "妹妹", name: "陳淑惠", older: false, bornAt: 4, born: true }] },
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
// choice applied to a copy: what the reader sees, the moods, and the random number after it all. The flags that say
// "this year" (just moved, just out of the army) move on with the year, so the second and third runs see other scenes.
function run(ev, base, seed, en) {
  const s = structuredClone(base);
  s.used = new Set();
  const rng = makeRng(seed), shown = [], moods = [], memories = [];
  const text = t => (en ? en.text(t) : t);
  for (let r = 0; r < 3; r++) {
    const ctx = makeCtx(s, rng, en);
    const fits = !ev.when || ev.when(s, ctx);
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
  }
  memories.push(...s.memory.map(m => m.text));   // what an event remembers through its own ctx (y_firstTrip's 第一次出國)
  return { shown, moods, memories, after: rng() };
}

test("every young.js event, in many kinds of life, reads in English with no Chinese and no broken template", () => {
  const en = makeLang(bundle), list = states();
  let lines = 0;
  for (const [k, ev] of YOUNG.entries()) {
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

test("in English a young.js event takes the same draws as in Chinese", () => {
  const en = makeLang(bundle), list = states();
  for (const [k, ev] of YOUNG.entries()) {
    for (const [j, st] of list.entries()) {
      if (j % 3) continue;
      const seed = k * 100000 + j * 10 + 7, zh = run(ev, st, seed, null), eng = run(ev, st, seed, en);
      assert.deepEqual([eng.moods, eng.shown.length, eng.after], [zh.moods, zh.shown.length, zh.after], `${ev.id} (state ${j})`);
    }
  }
});

test("what young.js remembers can be read in English later", () => {
  // memoryLane (core.js) quotes the first clause of a memory; a memory written from a template is English in an English
  // life.
  const en = makeLang(bundle), list = states();
  const seen = new Set();
  for (const ev of YOUNG) {
    for (const [j, st] of list.entries()) for (const m of run(ev, st, j, en).memories) {
      seen.add(ev.id);
      const gist = String(m).split(/[，。！]/)[0].replace(/^你/, "");
      assert.ok(!hasCJK(en.text(gist)), `${ev.id}: ${m}`);
    }
  }
  for (const id of ["y_bestman", "y_firstTrip"]) assert.ok(seen.has(id), `${id} left no memory`);
});
