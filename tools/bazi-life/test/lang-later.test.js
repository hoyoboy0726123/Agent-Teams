// The English of story/later.js (README「英文版（翻譯層）」): every later-life event, run on its own in many states
// and with every answer, reads with no Chinese, and seeded English lives that reach later life do too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { seededLife } from "./helpers/lives.js";
import { storyBundle } from "../scripts/story-bundle.mjs";
import { makeLang, hasCJK } from "../src/sim/lang.js";
import { expand } from "../src/sim/grammar.js";
import { makeRng } from "../src/sim/rng.js";
import { newPerson, pronoun } from "../src/sim/people.js";
import { LATER } from "../src/sim/story/later.js";

const bundle = await storyBundle();
const BAD = /[{}]|undefined|null|NaN|\[object/;

// A later-life state: `o` picks the family, the year, the work and what the story has already told.
function state(o) {
  const year = o.year, age = o.age, birthYear = year - age;
  const person = (call, sex, more = {}) => ({ call, name: call, sex, alive: true, ...more });
  const partner = o.rel === "married" ? person(o.sex === "male" ? "美玲" : "志明", o.sex === "male" ? "female" : "male", { age: age - 1, nature: { word: o.nature || "溫柔" } }) : null;
  const kids = Array.from({ length: o.kids }, (_, i) => ({ ...person(["宥蓁", "承恩", "品妍"][i], i === 1 ? "male" : "female"), age: o.kidAge - 3 * i, birthYear: year - (o.kidAge - 3 * i), married: i === 0 && o.kidWed, abroad: i === 0 ? o.kidAbroad : null }));
  const friends = o.friend ? [person("阿明", "male", { away: o.away || null, nature: "愛熱鬧" })] : [];
  return {
    age, year, birthYear, sex: o.sex, county: o.county, birthCounty: o.birthCounty, abroad: null, rel: o.rel, partner, since: age - 35,
    exes: o.rel === "widowed" ? [person("淑芬", o.sex === "male" ? "female" : "male", { alive: false })] : [], marriages: o.rel === "single" ? 0 : 1,
    kids, friends, siblings: { list: [{ relation: "olderBrother", label: "哥哥", name: o.sibName ? "陳志強" : "", born: true, bornAt: -3, alive: true }] },
    edu: o.edu, job: o.job ? { title: "工程師", field: o.job, since: 25 } : null, career: o.pro ? 2 : 0, retired: o.retired, employed: !o.retired, studying: false,
    home: o.home, savings: 2, debt: 0, income: 1, health: { chronic: o.chronic, serious: false, hr: 1 },
    flags: { grandkids: o.grands, estranged: true, l_plan: o.plan ? { kind: o.plan, what: o.what, show: o.show, at: age - 4 } : undefined, l_eyesWait: o.eyesWait, l_noSmart: o.noSmart },
    last: { retire: age - 1, grandchild: o.grands ? age - 1 : undefined, widowed: o.rel === "widowed" ? age - 1 : undefined, h_knee: o.knee },
    count: { l_directive: o.again ? 2 : 1 }, arcs: o.shop ? { l_shop: { stage: o.shop, next: age, since: age - 2, data: { kind: "咖啡館" } } } : {},
    used: new Set(), memory: [], seq: 0, traits: {},
  };
}

const STATES = [];
for (const sex of ["male", "female"]) for (const year of [1996, 2006, 2016, 2021, 2026]) for (const [rel, kids, grands] of [["married", 3, 2], ["widowed", 1, 1], ["single", 0, 0], ["married", 1, 0]]) {
  for (const [i, kidAge] of [28, 34].entries()) {
    const n = STATES.length;
    STATES.push({
      sex, year, rel, kids, grands, kidAge, age: kidAge + 32, kidWed: i === 1, kidAbroad: i === 1 ? "美國" : null,
      county: ["臺北市", "花蓮縣", "澎湖縣", "高雄市"][n % 4], birthCounty: ["雲林縣", "臺北市", null][n % 3], edu: ["國小", "高職", "大學", "五專", "科大", "高中"][n % 6],
      job: ["公部門", "科技", "家業", null, "教育"][n % 5], pro: n % 2 === 0, retired: n % 3 !== 2, home: n % 2 ? "own" : "rent", chronic: n % 2 === 0,
      friend: n % 4 !== 3, away: n % 3 === 0 ? "上海" : null, sibName: n % 2 === 1, nature: ["溫柔", "工作狂", "愛自由"][n % 3], eyesWait: n % 5 === 0, noSmart: n % 7 === 0,
      plan: ["travel", "volunteer", "learn", "grandkids", "farm", "consult"][n % 6], what: ["", "博物館", "陶笛", "宥蓁", "芭樂", n % 2 ? "顧問" : "帶新人"][n % 6], show: n % 2 ? "stage" : "wall",
      shop: ["start", "keep", null][n % 3], again: n % 4 === 1, knee: n % 2 ? 50 : undefined,
    });
  }
}

// ctx as life.js makes it, in English. Every template a scene offers is rendered with several sets of picks (not
// only the one drawn), so each alternative of each sentence is read; the English of the drawn one is returned.
function context(s, seed, en, shown) {
  const rng = makeRng(seed);
  const slots = () => ({
    city: s.county, job: s.job ? s.job.title : "工作", partner: s.partner ? s.partner.call : "另一半", ta: pronoun(s.partner),
    kid: s.kids.length ? s.kids[s.kids.length - 1].call : "孩子", kids: s.kids.length > 1 ? "孩子們" : "孩子", friend: "阿明",
    grand: s.sex === "female" ? "阿嬤" : "阿公", chat: "打電話", trip: "墾丁", age: s.age, year: s.year,
  });
  const check = text => { shown.push(text); return text; };
  const ctx = {
    rng, s,
    w(templates, vars = {}) {
      const list = Array.isArray(templates) ? templates : [templates];
      const all = { ...slots(), ...vars };
      for (const t of list) for (let k = 0; k < 6; k++) { const tr = []; const zh = expand(t, all, makeRng(seed * 31 + k), tr); check(en.w(t, all, tr, zh)); }
      const t = rng.pick(list), tr = [];
      return en.w(t, all, tr, expand(t, all, rng, tr));
    },
    f: (template, vars) => check(en.f(template, vars)),
    person: opts => newPerson(s, ctx, opts),
    remember: (kind, text) => { check(en.text(text)); s.memory.push({ kind, text }); },
    nudge: () => {},
    roll: (domain, channel, p) => rng() < p,
    arc: {
      start: (id, data = {}, inYears = 1) => s.arcs[id] || (s.arcs[id] = { stage: "start", next: s.age + inYears, since: s.age, data }),
      at: (id, stage) => !!s.arcs[id] && s.arcs[id].stage === stage && s.age >= s.arcs[id].next,
      go: (id, stage, inYears = 1) => { if (s.arcs[id]) { s.arcs[id].stage = stage; s.arcs[id].next = s.age + inYears; } },
      end: id => { delete s.arcs[id]; },
    },
  };
  return ctx;
}

test("every later-life sentence has English, in every state and with every answer", () => {
  const en = makeLang(bundle), ran = new Map();
  for (const [k, ev] of LATER.entries()) {
    for (const [j, o] of STATES.entries()) {
      for (const seed of [1, 2]) {
        const s = state(o), shown = [], ctx = context(s, k * 10007 + j * 7 + seed, en, shown);
        if (ev.when && !ev.when(s, ctx)) continue;
        ran.set(ev.id, (ran.get(ev.id) || 0) + 1);
        if (ev.choice) {
          const c = ev.choice(s, ctx);
          shown.push(en.text(c.prompt));
          for (const opt of c.options.filter(x => !x.when || x.when(s, ctx))) {
            shown.push(en.text(opt.label), en.text(opt.hint || ""));
            const s2 = structuredClone(s), out = opt.apply(s2, context(s2, seed, en, shown));
            shown.push(en.text(out.text));
          }
        } else shown.push(en.text(ev.apply(s, ctx).text));
        for (const t of shown) assert.ok(!hasCJK(t) && !BAD.test(t), `${ev.id}: ${t}`);
      }
    }
  }
  assert.deepEqual(LATER.filter(ev => !ran.has(ev.id)).map(ev => ev.id), [], "events never run");
  assert.deepEqual([...en.missing], [], "Chinese with no English");
});

test("English lives that reach later life read its events with no Chinese", () => {
  const hit = new Set();
  let lines = 0;
  for (let i = 0; i < 120; i++) {
    const { seen } = seededLife(7, i, { lang: "en", english: makeLang(bundle) });
    for (const e of seen) {
      if (!e.id || !e.id.startsWith("l_")) continue;
      if (e.kind === "ask") {
        for (const part of [e.prompt, ...e.options.flatMap(o => [o[1], o[2]])]) assert.ok(!hasCJK(part) && !BAD.test(part), `${e.id}: ${part}`);
        continue;
      }
      // A written answer goes through the general actions (act.js), which have their own English.
      if (e.choice && /^你決定/.test(e.choice)) continue;
      hit.add(e.id); lines++;
      assert.ok(!hasCJK(e.text) && !BAD.test(e.text), `${e.id}: ${e.text}`);
      if (e.choice) assert.ok(!hasCJK(e.choice), `${e.id}: ${e.choice}`);
    }
  }
  assert.ok(hit.size >= 20 && lines >= 300, `only ${hit.size} later events, ${lines} lines`);
});
