// The English of the life's skeleton (story/core.js), the work storylines (story/work.js) and the general actions a
// written answer runs through (act.js, actions.js): every event in many states, and whole English lives with written
// answers, show no Chinese from these files. And the Chinese is as before where the code now keeps data instead of
// cutting sentences: a choice's topic, the military service, the line at birth and 同盤重跑's count of work abroad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { computeChart } from "../src/core/chart.js";
import { PLACE_GROUPS } from "../src/core/places.js";
import { prepare } from "../src/sim/setup.js";
import { createLife, runLife, topicOf } from "../src/sim/life.js";
import { act } from "../src/sim/act.js";
import { ACTIONS, ACTION_IDS } from "../src/sim/actions.js";
import { makeRng } from "../src/sim/rng.js";
import { expand, fill } from "../src/sim/grammar.js";
import { makeLang, hasCJK, storyKey } from "../src/sim/lang.js";
import { analyseText } from "../src/sim/words.js";
import { newPerson, pronoun } from "../src/sim/people.js";
import { chatTool, tripPlace } from "../src/sim/world.js";
import * as R from "../src/sim/rates.js";
import { CORE, deathEvent, SERVED, birthText } from "../src/sim/story/core.js";
import { WORK } from "../src/sim/story/work.js";
import { extract } from "../scripts/extract-strings.mjs";

const EN = fileURLToPath(new URL("../src/i18n/en/", import.meta.url));
const TAIWAN = PLACE_GROUPS.filter(g => g.group.startsWith("臺灣・")).map(g => g.places[0]);
const BROKEN = /[{}]|undefined|null|NaN|\[object/;
const EVENTS = [...CORE, ...WORK, deathEvent];
const MINE = new Set(EVENTS.map(e => e.id));

// The English these files need, on their own: the shared words and names, era.json (shared templates such as
// {lead}{ask}) and this part's catalogs. Other parts are translated in parallel and are not needed here.
async function catalog() {
  const story = {}, words = {};
  let names = null;
  for (const f of ["words.json", "names.json", "era.json", "core.json", "work.json", "sim.json"]) {
    const j = JSON.parse(await readFile(EN + f, "utf8"));
    for (const [zh, en] of Object.entries(j.story || {})) { assert.ok(!(zh in story) || story[zh] === en, `${f}: ${zh}`); story[zh] = en; }
    for (const sec of Object.values(j.words || {})) for (const [zh, en] of Object.entries(sec)) { assert.ok(!(zh in words) || words[zh] === en, `${f}: the word ${zh}`); words[zh] = en; }
    if (j.names) names = j.names;
  }
  return { story, words, names };
}
const bundle = await catalog();

// The Chinese strings of these files (a value or template with no English is reported by lang.js as `missing`).
const { entries } = await extract();
const OURS = /src\/sim\/(story\/core|story\/work|act|life|monte|world|people)\.js:/;
const ours = new Set(Object.values(entries).filter(e => e.at.some(a => OURS.test(a))).map(e => e.zh));
// ACTIONS' `words` are what the reader writes (for intent.js), never shown: only the labels are ours to translate.
for (const a of Object.values(ACTIONS)) ours.add(a.label);

const chartAt = (rng, y, sex) => computeChart({ date: { y, m: 1 + rng.int(12), d: 1 + rng.int(28) }, time: { h: rng.int(24), mi: rng.int(60) }, place: rng.pick(TAIWAN), sex });

// A ctx as life.js makes it, in English: the same words(), slots and lazy {friend}/{trip}.
function makeCtx(s, en, rng, { chart, analysis, family = null }) {
  let scene = {};
  const slots = () => ({
    city: s.abroad || s.county || chart.input.place.name, job: s.job ? s.job.title : "工作",
    partner: s.partner ? s.partner.call : "另一半", ta: pronoun(s.partner),
    kid: s.kids.length ? s.kids[s.kids.length - 1].call : "孩子", kids: s.kids.length > 1 ? "孩子們" : "孩子",
    friend: () => (scene.friend ??= (() => { const f = s.friends.filter(x => x.alive); return f.length ? rng.pick(f).call : "老朋友"; })()),
    grand: s.sex === "female" ? "阿嬤" : "阿公", chat: chatTool(s.year), trip: () => (scene.trip ??= tripPlace(s, ctx)), age: s.age, year: s.year,
  });
  function w(templates, vars = {}) {
    const list = Array.isArray(templates) ? templates : [templates];
    const fresh = list.filter(t => !s.used.has(t)), template = rng.pick(fresh.length ? fresh : list);
    s.used.add(template);
    const all = { ...slots(), ...vars }, trace = [];
    let text = expand(template, all, rng, trace);
    for (let i = 0; i < 6 && s.used.has(text); i++) { trace.length = 0; text = expand(template, all, rng, trace); }
    s.used.add(text);
    const lazy = { friend: () => scene.friend ?? "老朋友", trip: () => scene.trip ?? "墾丁" };
    for (const k of Object.keys(lazy)) if (k in vars) delete lazy[k];
    return en.w(template, { ...all, ...lazy }, trace, text);
  }
  const luck = { reasons: [{ domains: ["career"], text: "官殺星透出：事業有壓力，也有機會" }, { domains: ["love"], text: "流年子沖日支午：日支是配偶宮，感情容易變動" }], m: {}, L: 0, score: 50 };
  const ctx = {
    rng, R, chart, analysis, s, name: null, family, w, f: en.f, lang: "en",
    luckAt: () => luck, tiltOf: () => 0, odds: (d, c, p) => p, roll: (d, c, p) => rng() < p,
    person: opts => newPerson(s, ctx, opts), remember: (kind, text, extra = {}) => s.memory.push({ kind, text, age: s.age, ...extra }), nudge: () => {},
    arc: {
      start: (id, data = {}, inYears = 1, stage = "start") => s.arcs[id] || (s.arcs[id] = { stage, next: s.age + inYears, since: s.age, data }),
      at: (id, stage) => !!s.arcs[id] && s.arcs[id].stage === stage && s.age >= s.arcs[id].next,
      go: (id, stage, inYears = 1) => { if (s.arcs[id]) { s.arcs[id].stage = stage; s.arcs[id].next = s.age + inYears; } },
      end: (id, outcome = true) => { delete s.arcs[id]; s.flags[`arc_${id}`] = outcome; },
    },
    newScene: () => { scene = {}; },
  };
  return ctx;
}

// States from real lives at many ages, filled in so that every event finds what it reads: a partner, children, named
// and unnamed brothers and sisters, a job, the storylines under way, an illness, memories, a home or none.
function states() {
  const out = [], rng = makeRng(2024);
  const shops = ["咖啡店", "網路商店", "手搖飲加盟店", "小吃店", "民宿", "KTV", "設計公司", "早餐加盟店", "補習班", "夾娃娃機店"];
  const courses = ["在職專班", "證照課程", "研究所", "語言課", "創業課程"];
  let k = 0;
  for (let i = 0; i < 16; i++) {
    const y = 1945 + rng.int(78), sex = rng() < 0.5 ? "male" : "female", chart = chartAt(rng, y, sex), prep = prepare(chart);
    const life = createLife({ chart, analysis: prep.analysis, luck: prep.luck, seed: 40 + i, auto: true, lang: "en", english: makeLang(bundle) });
    for (const age of [8, 13, 15, 19, 23, 26, 34, 40, 45, 58, 80]) {
      while (!life.done && life.state.age < age) life.step();
      if (life.done) break;
      k++;
      const s = structuredClone(life.state);
      const person = (role, sx, by, name) => ({ ...newPerson(s, { rng }, { role, sex: sx, birthYear: by, name }), age: s.year - by });
      if (!s.partner) { s.partner = person("partner", k % 5 === 0 ? s.sex : s.sex === "male" ? "female" : "male", s.birthYear + 1, k % 3 ? null : "王小明"); s.partner.how = ["同學", "老同學", "同事", "朋友介紹", "交友軟體", "旅行途中", "長輩安排的相親"][k % 7]; s.rel = k % 2 ? "married" : "dating"; s.since = s.age - 3; s.datingSince = s.age - 2; }
      if (!s.partner.nature) s.partner.nature = { word: "溫柔", crisis: 1 };
      if (s.kids.length < 2) s.kids.push({ ...person("kid", "female", s.year - 20), age: 20 }, { ...person("kid", "male", s.year - 6), age: 6 });
      if (s.friends.length < 1) s.friends.push(person("friend", "female", s.birthYear, null));
      s.siblings.list.push({ relation: "olderBrother", label: "哥哥", name: "陳志明", older: true, bornAt: -3, born: true }, { relation: "youngerSister", label: "妹妹", name: "", older: false, bornAt: 2, born: true });
      if (k % 4 === 0) s.siblings.list.push({ relation: "youngerBrother", label: "弟弟", name: "阿明", older: false, bornAt: s.age, born: false }, { relation: "youngerSister", label: "妹妹", name: "小美", older: false, bornAt: s.age, born: false });
      if (!s.job) s.job = { title: ["工程師", "護理師", "美髮師", "藥師", "工廠作業員"][k % 5], factor: 1, field: ["科技", "醫療", "服務", "醫療", "製造"][k % 5], element: "火", since: s.age - 1 };
      s.employed = true; s.savings = 3; s.edu = ["國中", "高中", "高職", "大學", "科大", "五專"][k % 6]; s.track = s.edu;
      if (k % 3) {
        s.arcs.startup = { stage: k % 2 ? "start" : "year2", next: s.age, since: s.age - 1, data: { kind: shops[k % shops.length], side: k % 4 === 1, push: 0.1, pivoted: k % 4 === 2 } };
        s.arcs.civil = { stage: "start", next: s.age, since: s.age - 1, data: { tries: k % 3, quit: false } };
        s.arcs.study = { stage: "start", next: s.age, since: s.age - 1, data: { kind: courses[k % courses.length] } };
      }
      s.flags.stake = { kind: shops[(k + 1) % shops.length], at: s.age - 3, who: k % 2 ? "大學時的好朋友" : "志明", colleague: k % 4 === 1 };
      s.flags.offerAbroad = "日本"; s.flags.militaryAt = k % 2 ? s.age : undefined; s.flags.leftSchool = s.age - (k % 3);
      if (k % 2) { s.health.serious = { type: ["癌症", "中風", "心臟病"][k % 3], since: s.age - 5 }; s.health.diedOf = k % 3 ? null : "癌症"; }
      s.health.checkups = k % 2 === 0;
      // memories of this part's big moments (an English life keeps their English gist), and one with no gist
      s.memory = s.memory.filter(m => MINE.has(m.kind));
      s.memory.push({ kind: "proposal", text: "You married Hsiao-mei!", gist: "you married Hsiao-mei", age: s.age - 25, mood: 5 }, { kind: "fatherDeath", text: "Dad passed away at 80.", age: s.age - 22, mood: -9 });
      // no county (born abroad): the place of birth is what {city} says (core/places.js names are not part of this)
      let ch = chart;
      if (k % 3 === 0) { s.county = null; s.birthCounty = null; ch = { ...chart, input: { ...chart.input, place: { ...chart.input.place, name: "臺北市" } } }; }
      if (k % 7 === 0) { s.father.alive = false; s.mother.alive = k % 2 === 0; }
      if (k % 5 === 4) { s.father.alive = false; s.mother.alive = false; s.last.fatherDeath = s.age; s.siblings.list.forEach(x => { x.bornAt = Math.min(x.bornAt, -20); x.born = true; }); }
      s.used = new Set();
      // the partner from the family input, met this year (story/core.js realPartnerMeet) and to marry this year
      const family = k % 2 ? { members: [{ relation: "partner", label: "伴侶", name: "王小明", date: null, sex: s.sex === "male" ? "female" : "male", metYear: s.year, marriedYear: s.year, bond: null }] } : null;
      out.push({ s, chart: ch, analysis: prep.analysis, family });
      // and the same person out of work and out of school, single or dating, with no storyline under way
      const u = structuredClone(s);
      u.employed = false; u.studying = false; u.retired = false; u.arcs = {}; u.unemployedFor = 1;
      if (k % 2) { u.done.delete("firstJob"); u.jobsHeld = []; } else u.done.add("firstJob");
      if (k % 4 === 1) { u.rel = "single"; u.partner = null; } else { u.rel = "dating"; u.datingSince = u.age - 1; delete u.flags.realPartnerMet; if (family) u.partner.real = true; }
      out.push({ s: u, chart: ch, analysis: prep.analysis, family });
      // and at school
      const school = structuredClone(u);
      school.studying = true; school.edu = school.age < 13 ? "國小" : school.age < 17 ? "國中" : ["高中", "高職", "大學", "科大", "五專", "碩士"][k % 6]; school.track = school.edu;
      school.flags = { ...school.flags, trackAt: school.age - 5, uniAt: school.age - 5, masterAt: school.age - 3 };
      out.push({ s: school, chart: ch, analysis: prep.analysis, family });
    }
  }
  return out;
}

test("every core and work event reads in English, whatever the life (each run on its own in many states)", () => {
  const shown = new Map(), missing = new Set(), ran = new Set();
  let lines = 0;
  for (const [j, st] of states().entries()) {
    for (const [k, ev] of EVENTS.entries()) {
      for (let seed = 0; seed < 2; seed++) {
        if (ev.id === "realPartnerMeet" && !st.family) continue;
        const s = structuredClone(st.s), en = makeLang(bundle), rng = makeRng(j * 1009 + k * 31 + seed);
        if (ev.id === "realPartnerMeet") delete s.flags.realPartnerMet;
        const ctx = makeCtx(s, en, rng, st);
        if (ev.when && !ev.when(s, ctx)) continue;
        ran.add(ev.id);
        const texts = [];
        if (ev.choice) {
          const c = ev.choice(s, ctx);
          if (!c) continue;
          texts.push(en.text(c.prompt));
          for (const o of c.options.filter(x => !x.when || x.when(s, ctx))) {
            texts.push(en.text(o.label), en.text(o.hint || ""));
            const s2 = structuredClone(s), c2 = makeCtx(s2, en, makeRng(seed + 7), st);
            const out = o.apply ? o.apply(s2, c2) : act(o.act, s2, c2, { label: o.label });
            if (out && out.text) texts.push(en.text(out.text));
            if (out && out.gist) texts.push(en.text(out.gist));
          }
          // A written answer: the general actions open with what the choice was about, and the player's own words.
          for (const id of [...ACTION_IDS, "own"]) {
            const s2 = structuredClone(s), c2 = makeCtx(s2, en, makeRng(seed + 11), st);
            const out = act(id, s2, c2, { situation: ev.id, domain: ev.domain, about: ev.about, summary: "You decided to give it a go", topic: topicOf(c, "en") });
            texts.push(en.text(out.text || out.infeasible));
            if (out.gist) texts.push(en.text(out.gist));
          }
        } else {
          const out = ev.apply(s, ctx);
          if (out && out.text) texts.push(en.text(out.text));
          if (out && out.gist) texts.push(en.text(out.gist));
          if (ev.id === "startupYear2" && s.job) texts.push(en.text(s.job.title));
        }
        for (const t of texts) {
          if (!t) continue;
          lines++;
          if (hasCJK(t) || BROKEN.test(t)) shown.set(`${ev.id}: ${t}`, true);
        }
        for (const m of en.missing) missing.add(m);
      }
    }
  }
  assert.deepEqual([...shown.keys()].slice(0, 20), []);
  assert.deepEqual([...missing].slice(0, 20), []);
  assert.deepEqual(EVENTS.map(e => e.id).filter(id => !ran.has(id) && id !== "death"), []);
  assert.ok(lines > 20000, `only ${lines} lines`);
});

test("whole English lives with written answers show no Chinese from these files", () => {
  const missingOurs = new Set(), broken = [];
  const seen = new Set(), freeLines = { n: 0 };
  for (let i = 0; i < 60; i++) {
    const rng = makeRng(8800 + i), y = 1945 + rng.int(78), sex = rng() < 0.5 ? "male" : "female", chart = chartAt(rng, y, sex);
    const fam = i % 4 === 0 ? { father: { name: "陳大明" }, mother: { name: "林美華" }, siblings: [{ relation: "olderBrother", name: "陳志明", date: { y: y - 3, m: 1, d: 1 } }, { relation: "youngerSister", name: "陳小美", date: { y: y + 3, m: 5, d: 5 } }] } : i % 4 === 1 ? { partner: { name: "王小明", only: i % 8 === 1 } } : null;
    const prep = prepare(chart, { name: i % 3 ? "" : "陳怡君", family: fam });
    const en = makeLang(bundle);
    const life = createLife({ chart, analysis: prep.analysis, luck: prep.luck, seed: 600 + i, name: prep.name, family: prep.family, lang: "en", english: en });
    let guard = 0;
    while (!life.done && guard++ < 6000) {
      const p = life.pending;
      if (!p) { life.step(); continue; }
      if (MINE.has(p.id)) for (const t of [p.prompt, ...p.options.flatMap(o => [o.label, o.hint])]) if (t && BROKEN.test(t)) broken.push(`${p.id}: ${t}`);
      const r = rng();
      if (r < 0.4) {
        const out = life.chooseAction({ action: rng() < 0.1 ? "own" : rng.pick(ACTION_IDS), summary: rng() < 0.2 ? "" : rng.pick(["You decided to take a chance", "You decided to wait and see", "You decided to talk to the family"]) });
        if (out.infeasible) { assert.ok(!hasCJK(out.infeasible), out.infeasible); life.choose(rng.int(p.options.length)); }
      } else if (r < 0.45) life.autoChoose();
      else life.choose(rng.int(p.options.length));
    }
    for (const e of life.log) {
      if (!MINE.has(e.id) && !e.free) continue;
      seen.add(e.id); if (e.free) freeLines.n++;
      for (const t of [e.text, e.choice]) if (t && BROKEN.test(t)) broken.push(`${e.id}: ${t}`);
    }
    // Chinese the reader saw that has no English: none of it may be a sentence, label or word of these files, nor a
    // job this life held (a shop of your own is "<shop>老闆").
    for (const m of en.missing) if (ours.has(m)) missingOurs.add(m);
    for (const j of life.state.jobsHeld) if (hasCJK(en.word(j.title))) missingOurs.add(j.title);
  }
  assert.deepEqual(broken.slice(0, 10), []);
  assert.deepEqual([...missingOurs], []);
  assert.ok(seen.size >= 45 && freeLines.n >= 300, `${seen.size} events, ${freeLines.n} written answers`);
});

test("the English keeps the shape of each Chinese template, and every template of these files is translated", () => {
  const all = new Set(Object.values(entries).map(e => e.zh));
  // every key is a string in the code, and no English has Chinese in it (extract-strings --check also compares the
  // {vars} and the {a|b} parts)
  for (const [zh, text] of Object.entries(bundle.story)) {
    assert.ok(all.has(zh), `not in the code: ${zh}`);
    assert.ok(!hasCJK(text), text);
  }
  // the shown templates and strings of these files: those in a ctx.w / ctx.f call or a shown field
  const shownOurs = Object.values(entries).filter(e => e.at.some(a => /src\/sim\/(story\/core|story\/work|act)\.js:/.test(a)) && ["w", "f", "prompt", "label", "hint", "text", "topic"].includes(e.use));
  // (strings only compared against, such as L.search[0].startsWith("打給"), are not shown)
  const todo = shownOurs.filter(e => !(e.zh in bundle.story) && !(e.zh in bundle.words) && !["打給", "去職訓局"].includes(e.zh)).map(e => e.zh);
  assert.deepEqual(todo, []);
  for (const t of Object.values(ACTIONS)) assert.ok(t.label in bundle.story, t.label);
  // keys stay distinct in the shipped bundle
  const keys = new Map();
  for (const zh of Object.keys(bundle.story)) { const k = storyKey(zh); assert.ok(!keys.has(k) || keys.get(k) === zh, zh); keys.set(k, zh); }
});

// ---------- the Chinese is as before ----------

// What life.js topicOf took before choices carried their topic: the first sentence of the question.
const oldTopic = c => { const m = /^([^。？?！!]+)[。！!]/.exec(String(c.prompt || "")); return m ? m[1].trim() : ""; };
// act.js puts a topic in front of a written answer this way.
const opened = t => (t ? `${t.replace(/[。，,.!！？?\s]+$/, "")}。` : "");

test("in Chinese, a choice's own topic opens a written answer exactly as its first sentence did", () => {
  let n = 0;
  for (const [j, st] of states().entries()) {
    for (const ev of EVENTS.filter(e => e.choice)) {
      for (let seed = 0; seed < 3; seed++) {
        const s = structuredClone(st.s), rng = makeRng(j * 97 + seed);
        const en = { w: (t, v, tr, text) => text, f: (t, v) => fill(t, v) };
        const ctx = makeCtx(s, en, rng, st);
        ctx.f = fill; ctx.lang = "zh";
        if (ev.when && !ev.when(s, ctx)) continue;
        const c = ev.choice(s, ctx);
        if (!c || !c.prompt) continue;
        n++;
        assert.equal(opened(topicOf(c)), opened(oldTopic(c)), `${ev.id}: ${c.prompt}`);
      }
    }
  }
  assert.ok(n > 2000, `${n} questions`);
  // and in English a choice without a topic opens with the player's words alone, never a cut sentence
  assert.equal(topicOf({ prompt: "The company laid people off. What now?" }, "en"), "");
  assert.equal(topicOf({ prompt: "公司裁員，你被列在名單上。要怎麼辦？" }), "公司裁員，你被列在名單上");
});

test("the military service is told from its length, as rates.js writes it", () => {
  for (let by = 1930; by <= 2010; by++) for (let year = by + 18; year <= by + 26; year++) {
    const m = R.military(by, year);
    assert.equal(SERVED[m.months], m.text.replace(/，.*$/, ""), `${by} ${year}`);
  }
});

test("the line at birth is the same Chinese as words.js analyseText", () => {
  const rng = makeRng(77);
  for (let i = 0; i < 120; i++) {
    const y = 1930 + rng.int(95), sex = rng() < 0.5 ? "male" : "female", chart = chartAt(rng, y, sex), prep = prepare(chart);
    const s = {
      birthYear: y, sex, county: rng() < 0.2 ? null : "臺中市", name: rng() < 0.5 ? "陳怡君" : "",
      father: { name: rng() < 0.5 ? "陳大明" : "" }, mother: { name: rng() < 0.5 ? "林美華" : "" },
      siblings: { list: [["olderBrother", "哥哥", "陳志明"], ["olderSister", "姊姊", ""], ["olderSister", "姊姊", ""], ["olderBrother", "哥哥", ""], ["youngerSister", "妹妹", ""]].filter(() => rng() < 0.5).map(([relation, label, name], k) => ({ relation, label, name, older: relation.startsWith("older"), bornAt: -1 - k })) },
    };
    const ctx = { analysis: prep.analysis, chart, f: fill };
    assert.equal(birthText(ctx, s), analyseText(prep.analysis, chart, s));
  }
});

test("同盤重跑 counts the lives that went to work abroad as the sentence used to say", () => {
  const rng = makeRng(5);
  let went = 0;
  for (let i = 0; i < 250; i++) {
    const chart = chartAt(rng, 1950 + rng.int(60), rng() < 0.5 ? "male" : "female"), prep = prepare(chart);
    const l = runLife({ chart, analysis: prep.analysis, luck: prep.luck, seed: 300 + i });
    const before = l.log.some(e => e.id === "abroad" && /到.+工作/.test(e.text));
    assert.equal(!!l.state.flags.workedAbroad, before, `life ${i}`);
    went += before;
  }
  assert.ok(went >= 10, `${went}`);
});
