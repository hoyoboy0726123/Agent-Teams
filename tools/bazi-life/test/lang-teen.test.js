// The English of story/teen.js (README「英文版（翻譯層）」): every teenage event, run on its own in many states that
// reach its scenes and branches, with every option, reads with no Chinese; and the English run draws exactly what the
// Chinese run draws, so an English life stays the same life.
import { test } from "node:test";
import assert from "node:assert/strict";
import { storyBundle } from "../scripts/story-bundle.mjs";
import { makeLang, hasCJK } from "../src/sim/lang.js";
import { expand, fill } from "../src/sim/grammar.js";
import { makeRng } from "../src/sim/rng.js";
import { newPerson, pronoun } from "../src/sim/people.js";
import { chatTool, tripPlace } from "../src/sim/world.js";
import { nudge } from "../src/sim/traits.js";
import { computeChart } from "../src/core/chart.js";
import { PLACE_GROUPS } from "../src/core/places.js";
import { prepare } from "../src/sim/setup.js";
import { createLife } from "../src/sim/life.js";
import { TEEN } from "../src/sim/story/teen.js";

const bundle = await storyBundle();
const TAIWAN = PLACE_GROUPS.filter(g => g.group.startsWith("臺灣・")).map(g => g.places[0]);

// Teenage states from real lives (born 1940–2025, across Taiwan), taken at the start of each year from 12 to 18.
function teenStates(lives = 14) {
  const out = [];
  for (let i = 0; i < lives; i++) {
    const rng = makeRng(911 + i);
    const y = 1940 + Math.floor((i * 86) / lives) + rng.int(5), sex = i % 2 ? "male" : "female";
    const chart = computeChart({ date: { y, m: 1 + rng.int(12), d: 1 + rng.int(28) }, time: { h: rng.int(24), mi: 0 }, place: rng.pick(TAIWAN), sex });
    const prep = prepare(chart, { name: "" });
    const life = createLife({ chart, analysis: prep.analysis, luck: prep.luck, seed: 5000 + i });
    for (let guard = 0; !life.done && life.state.age <= 18 && guard < 400; guard++) {
      if (life.pending) { life.choose(rng.int(life.pending.options.length)); continue; }
      if (life.state.age >= 12 && life.state.age % 2 === i % 2) out.push(structuredClone(life.state));
      life.step();
    }
  }
  return out;
}

// Variants of a state that meet each event's conditions: the school tracks, working, the year a choice of stream or
// a big exam comes, a graduation trip, a first love that is ending, a little brother or sister, a best friend.
function variants(base) {
  const list = [base];
  const v = f => { const s = structuredClone(base); s.abroad = null; f(s); list.push(s); };
  const school = (s, track) => { s.studying = true; s.employed = false; s.job = null; s.track = track; };
  const friend = s => { if (!s.friends.some(f => f.id === s.flags.bff)) { const f = { id: "friendT", role: "friend", sex: s.sex, call: "怡君", name: "陳怡君", alive: true, bond: 0.7 }; s.friends.push(f); s.flags.bff = f.id; } };
  for (const track of ["國中", "高中", "高職", "五專"]) v(s => school(s, track));
  v(s => { school(s, "高中"); s.flags.trackAt = s.age - 1; });
  v(s => { school(s, ["高中", "高職"][s.age % 2]); s.flags.trackAt = s.age - 2; friend(s); });
  v(s => { school(s, "國中"); s.age = 14; s.year = s.birthYear + 14; });
  v(s => { school(s, "國小"); s.age = 12; s.year = s.birthYear + 12; delete s.flags.gradTrip_國小; });
  v(s => { s.flags.done15 = true; s.flags.trackAt = s.age; delete s.flags.gradTrip_國中; });
  for (const [title, field] of [["工廠作業員", "製造"], ["餐廳廚房", "餐飲"], ["清潔人員", "服務"], ["門市人員", "零售"], ["門市人員", "家業"]]) {
    v(s => { s.studying = false; s.employed = true; s.track = null; s.edu = "國中"; s.job = { title, field, since: s.age - 1 }; s.flags.familyShop = "雜貨店"; });
  }
  v(s => { s.studying = false; s.employed = false; s.job = null; });
  v(s => { school(s, "國中"); s.flags.club = ["ball", "music", "drama"][s.age % 3]; s.flags.cram = "math"; s.flags.talent = s.age % 2 ? "piano" : "art"; friend(s); });
  for (const way of ["confess", "secret"]) v(s => { s.arcs.t_love = { stage: "start", next: s.age, since: s.age - 1, data: { name: "志明", sex: way === "confess" ? "male" : "female", together: way === "confess", way } }; });
  v(s => { s.father.alive = true; s.siblings.list.push({ relation: "youngerBrother", label: "弟弟", name: "", older: false, bornAt: s.age - 7, born: true }, { relation: "olderSister", label: "姊姊", name: "陳美玲", older: true, bornAt: -3, born: true }); s.flags.homeMoney = "tight"; });
  v(s => { s.sex = s.sex === "male" ? "female" : "male"; s.flags.parentsSplit = true; s.flags.liveWith = "mother"; s.mother.alive = true; });
  return list;
}

// A ctx as life.js makes it, in Chinese or (with `en`) in English.
function makeCtx(s, rng, en) {
  let scene = {};
  const slots = () => ({
    city: s.abroad || s.county || "臺北市", job: s.job ? s.job.title : "工作", partner: s.partner ? s.partner.call : "另一半", ta: pronoun(s.partner),
    kid: s.kids.length ? s.kids[s.kids.length - 1].call : "孩子", kids: s.kids.length > 1 ? "孩子們" : "孩子",
    friend: () => (scene.friend ??= (() => { const f = s.friends.filter(x => x.alive); return f.length ? rng.pick(f).call : "老朋友"; })()),
    grand: s.sex === "female" ? "阿嬤" : "阿公", chat: chatTool(s.year), trip: () => (scene.trip ??= tripPlace(s, ctx)), age: s.age, year: s.year,
  });
  const w = (templates, vars = {}) => {
    const list = Array.isArray(templates) ? templates : [templates];
    const fresh = list.filter(t => !s.used.has(t)), template = rng.pick(fresh.length ? fresh : list);
    s.used.add(template);
    const all = { ...slots(), ...vars }, trace = en && [];
    let text = expand(template, all, rng, trace);
    for (let i = 0; i < 6 && s.used.has(text); i++) { if (trace) trace.length = 0; text = expand(template, all, rng, trace); }
    s.used.add(text);
    if (!en) return text;
    const lazy = { friend: () => scene.friend ?? "老朋友", trip: () => scene.trip ?? "墾丁" };
    for (const k of Object.keys(lazy)) if (k in vars) delete lazy[k];
    return en.w(template, { ...all, ...lazy }, trace, text);
  };
  const ctx = {
    rng, s, w, f: (t, vars = {}) => (en ? en.f(t, vars) : fill(t, vars)), lang: en ? "en" : "zh", family: null, name: null,
    odds: (d, c, p) => p, roll: (d, c, p) => rng() < p, tiltOf: () => 0, luckAt: () => null,
    person: opts => newPerson(s, ctx, opts),
    remember: (kind, text, extra = {}) => s.memory.push({ kind, text, age: s.age, ...extra }),
    nudge: (key, d) => nudge(s, key, d),
    arc: {
      start: (id, data = {}, inYears = 1, stage = "start") => s.arcs[id] || (s.arcs[id] = { stage, next: s.age + inYears, since: s.age, data }),
      at: (id, stage) => !!s.arcs[id] && s.arcs[id].stage === stage && s.age >= s.arcs[id].next,
      go: (id, stage, inYears = 1) => { if (s.arcs[id]) { s.arcs[id].stage = stage; s.arcs[id].next = s.age + inYears; } },
      end: (id, outcome = true) => { delete s.arcs[id]; s.flags[`arc_${id}`] = outcome; },
      get: id => s.arcs[id] || null,
    },
  };
  return ctx;
}

// One event on one state: what it shows (prompt, every button and every option's result) and where the rng ends up.
// `fresh` forgets the sentences the life told before: the states come from Chinese lives, and a Chinese sentence
// already told is drawn again (life.js words), which an English run on the same state cannot know.
function runEvent(ev, base, seed, en, fresh = false) {
  const s = structuredClone(base), rng = makeRng(seed), ctx = makeCtx(s, rng, en), shown = t => (en ? en.text(t) : t);
  if (fresh) s.used = new Set();
  if (!ev.when || ev.when(s, ctx)) {
    const out = [];
    if (ev.choice) {
      const c = ev.choice(s, ctx);
      if (c) {
        out.push(shown(c.prompt));
        for (const o of c.options) {
          if (o.when && !o.when(s, ctx)) continue;
          out.push(shown(o.label), shown(o.hint || ""));
          const s2 = structuredClone(s);
          out.push(shown(o.apply(s2, makeCtx(s2, rng, en)).text));
        }
      }
    } else out.push(shown(ev.apply(s, ctx).text));
    return { out, end: rng() };
  }
  return null;
}

test("every teen event reads in English with no Chinese, whatever the life (each event in many states, every option)", () => {
  const en = makeLang(bundle), states = teenStates(), ran = {}, bad = [];
  let lines = 0;
  for (const [i, st] of states.entries()) {
    for (const [j, base] of variants(st).entries()) {
      for (const [e, ev] of TEEN.entries()) {
        for (let k = 0; k < 2; k++) {
          const seed = ((i * 41 + j) * 53 + e) * 7 + k + 1;
          const r = runEvent(ev, base, seed, en);
          if (!r) continue;
          ran[ev.id] = (ran[ev.id] || 0) + 1;
          for (const t of r.out) {
            lines++;
            if (hasCJK(t) || /[{}]|undefined|null|NaN/.test(t)) bad.push(`${ev.id}: ${t}`);
          }
        }
      }
    }
  }
  assert.deepEqual([...new Set(bad)].slice(0, 20), []);
  for (const ev of TEEN) assert.ok((ran[ev.id] || 0) >= 20, `${ev.id} ran only ${ran[ev.id] || 0} times`);
  assert.ok(lines > 20000, `only ${lines} lines`);
  // Nothing from teen.js was left without English.
  const left = [...en.missing].filter(t => hasCJK(t));
  assert.deepEqual(left.slice(0, 20), []);
});

test("an English teen event draws what the Chinese one draws (the same scenes, buttons and outcomes)", () => {
  const en = makeLang(bundle), states = teenStates(6);
  let n = 0;
  for (const [i, st] of states.entries()) {
    for (const [j, base] of variants(st).entries()) {
      for (const [e, ev] of TEEN.entries()) {
        const seed = ((i * 41 + j) * 53 + e) * 7 + 3;
        const zh = runEvent(ev, base, seed, null, true), eng = runEvent(ev, base, seed, en, true);
        assert.equal(!!eng, !!zh, ev.id);
        if (!zh) continue;
        n++;
        assert.equal(eng.end, zh.end, `${ev.id}: the rng moved differently in English`);
        assert.equal(eng.out.length, zh.out.length, ev.id);
      }
    }
  }
  assert.ok(n > 1000, `only ${n} runs`);
});
