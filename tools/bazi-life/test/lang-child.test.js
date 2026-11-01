// The English of the childhood story (src/sim/story/child.js, src/i18n/en/child.json; README「英文版（翻譯層）」): every
// child event, in many real childhood states and every option of each choice, reads with no Chinese left.
import { test } from "node:test";
import assert from "node:assert/strict";
import { storyBundle } from "../scripts/story-bundle.mjs";
import { makeLang, hasCJK } from "../src/sim/lang.js";
import { expand, fill } from "../src/sim/grammar.js";
import { makeRng } from "../src/sim/rng.js";
import { newPerson, pronoun } from "../src/sim/people.js";
import { chatTool } from "../src/sim/world.js";
import { createLife } from "../src/sim/life.js";
import { prepare } from "../src/sim/setup.js";
import { computeChart } from "../src/core/chart.js";
import { PLACE_GROUPS } from "../src/core/places.js";
import { CHILD } from "../src/sim/story/child.js";

const bundle = await storyBundle();
const TAIWAN = PLACE_GROUPS.filter(g => g.group.startsWith("臺灣・")).map(g => g.places[0]);

// A story context as life.js builds it (the same words(): the story's slots, the sentences already told, the Chinese
// expanded and traced, then rendered in English), around a state of our own.
function storyCtx(s, seed, en) {
  const rng = makeRng(seed);
  const slots = () => ({
    city: s.abroad || s.county || "臺北市", job: s.job ? s.job.title : "工作", partner: s.partner ? s.partner.call : "另一半", ta: pronoun(s.partner),
    kid: s.kids.length ? s.kids[s.kids.length - 1].call : "孩子", kids: s.kids.length > 1 ? "孩子們" : "孩子", friend: "老朋友",
    grand: s.sex === "female" ? "阿嬤" : "阿公", chat: chatTool(s.year), trip: "墾丁", age: s.age, year: s.year,
  });
  function w(templates, vars = {}) {
    const list = Array.isArray(templates) ? templates : [templates], fresh = list.filter(t => !s.used.has(t));
    const template = rng.pick(fresh.length ? fresh : list), all = { ...slots(), ...vars }, trace = [];
    s.used.add(template);
    let text = expand(template, all, rng, trace);
    for (let i = 0; i < 6 && s.used.has(text); i++) { trace.length = 0; text = expand(template, all, rng, trace); }
    s.used.add(text);
    return en.w(template, all, trace, text);
  }
  const ctx = {
    rng, s, w, f: en.f, lang: "en", roll: (d, c, p) => rng() < p, odds: (d, c, p) => p, nudge: () => {},
    person: opts => newPerson(s, ctx, opts), remember: (kind, text, extra = {}) => s.memory.push({ kind, text, age: s.age, ...extra }),
  };
  return ctx;
}

// Real childhoods (lives stepped through ages 1–12), moved to other years and situations so each branch is reached:
// every decade of toys and cartoons, at school or not, parents split, money tight, a dog at home, siblings, a move.
function childStates() {
  const base = [];
  for (let i = 0; i < 8; i++) {
    const r = makeRng(700 + i), sex = i % 2 ? "female" : "male";
    const chart = computeChart({ date: { y: 1950 + r.int(70), m: 1 + r.int(12), d: 1 + r.int(28) }, time: { h: r.int(24), mi: 0 }, place: r.pick(TAIWAN), sex });
    const prep = prepare(chart, {});
    const life = createLife({ chart, analysis: prep.analysis, luck: prep.luck, seed: 3000 + i, auto: true });
    while (!life.done && life.state.age <= 12) {
      const a = life.state.age;
      while (!life.done && life.state.age === a) life.step();
      if (life.state.age >= 2 && life.state.age <= 12 && life.state.age % 3 === i % 3) base.push(structuredClone(life.state));
    }
  }
  const YEARS = [1952, 1963, 1967, 1972, 1977, 1983, 1987, 1992, 1996, 1998, 2003, 2008, 2012, 2016, 2018, 2022, 2027];
  const states = [];
  base.forEach((b, k) => {
    for (let j = 0; j < 3; j++) {
      const s = structuredClone(b), v = k * 3 + j;
      s.year = YEARS[v % YEARS.length]; s.birthYear = s.year - s.age;
      if (v % 4 === 1) { s.flags.parentsSplit = true; s.flags.liveWith = v % 8 === 1 ? "mother" : "father"; }
      if (v % 5 === 2) s.flags.homeMoney = "tight";
      if (v % 7 === 3) s.studying = !s.studying;
      if (v % 6 === 4) s.flags.pet = { kind: "dog", name: "小黑", noun: "小狗", since: 3 };
      if (v % 9 === 5) s.father.alive = false;
      if (v % 11 === 6) s.mother.alive = false;
      if (v % 10 === 8) s.siblings.list.push({ relation: "youngerSister", label: "妹妹", name: "", older: false, bornAt: s.age - 5, born: true });
      if (v % 10 === 3) s.siblings.list.push({ relation: "olderBrother", label: "哥哥", name: "", older: true, bornAt: -3, born: true });
      if (v % 3 === 0) s.last.familyMove = s.age;
      states.push(s);
    }
  });
  return states;
}

test("every childhood sentence has English, whatever the life (each child event run on its own in many states)", () => {
  const en = makeLang(bundle), states = childStates(), seen = new Map(), problems = new Set();
  const look = (id, t) => {
    if (t === undefined || t === null || t === "") return;
    seen.set(id, (seen.get(id) || 0) + 1);
    if (hasCJK(t) || /[{}]|undefined|null|NaN| {2}|\s[,.]/.test(t) || t !== t.trim()) problems.add(`${id}: ${t}`);
  };
  for (const ev of CHILD) {
    states.forEach((st, j) => {
      if (ev.when && !ev.when(structuredClone(st), storyCtx(structuredClone(st), 1, en))) return;
      const seed = 1 + j * 31 + ev.id.length * 1000;
      if (!ev.choice) {
        // three times on one state, years apart: the events that come more than once tell other sentences
        const s = structuredClone(st), ctx = storyCtx(s, seed, en);
        for (let t = 0; t < 3; t++) { look(ev.id, en.text(ev.apply(s, ctx).text)); s.year += 2; s.age += 2; }
        return;
      }
      const probe = ev.choice(structuredClone(st), storyCtx(structuredClone(st), seed, en));
      probe.options.forEach((o, k) => {
        // every option the state offers, with two draws for the ones whose result is random
        for (let t = 0; t < 2; t++) {
          const s = structuredClone(st), ctx = storyCtx(s, seed, en), c = ev.choice(s, ctx), opt = c.options[k];
          if (opt.when && !opt.when(s, ctx)) return;
          if (t === 0) { look(ev.id, en.text(c.prompt)); look(ev.id, en.text(opt.label)); look(ev.id, en.text(opt.hint)); }
          for (let b = 0; b < t; b++) ctx.rng();
          look(ev.id, en.text(opt.apply(s, ctx).text));
        }
      });
    });
  }
  assert.deepEqual([...problems].slice(0, 20), []);
  assert.deepEqual(CHILD.filter(ev => !seen.has(ev.id)).map(ev => ev.id), []);
  assert.ok([...seen.values()].reduce((a, b) => a + b, 0) > 20000, "too few lines");
  assert.deepEqual([...en.missing].filter(hasCJK).slice(0, 20), []);
});

test("an English childhood keeps the Chinese draws: each child event draws as it does in Chinese", () => {
  // In English the Chinese is still expanded (with English words in it), so the draws, and with them the choices and
  // moods of a life, are the same. Each event runs twice on one state, from no sentences told yet, in both languages.
  const en = makeLang(bundle), states = childStates().slice(0, 60);
  const zh = { w: (t, v, tr, text) => text, f: fill };
  const fresh = st => { const s = structuredClone(st); s.used = new Set(); return s; };
  for (const ev of CHILD) {
    for (const [j, st] of states.entries()) {
      if (ev.when && !ev.when(fresh(st), storyCtx(fresh(st), 1, zh))) continue;
      const a = fresh(st), b = fresh(st), ca = { ...storyCtx(a, j + 5, zh), lang: "zh" }, cb = storyCtx(b, j + 5, en);
      for (let t = 0; t < 2; t++) {
        if (ev.choice) {
          const pa = ev.choice(a, ca), pb = ev.choice(b, cb), k = j % pa.options.length;
          assert.equal(pa.options.length, pb.options.length, ev.id);
          if (!pa.options[k].when || pa.options[k].when(a, ca)) { pa.options[k].apply(a, ca); pb.options[k].apply(b, cb); }
        } else { ev.apply(a, ca); ev.apply(b, cb); }
        assert.equal(ca.rng(), cb.rng(), `${ev.id} state ${j}`);
      }
    }
  }
});

test("words the childhood passes into sentences read as English (toys, snacks, shops, pets, money)", () => {
  const en = makeLang(bundle);
  for (const [zh, want] of [["一大把尪仔標", "a big handful of ang-a-piau picture cards"], ["科學麵", "Science Noodles snacks"], ["柑仔店", "corner shop"],
    ["小黑", "Blackie"], ["一千多塊", "over NT$1,000"], ["爸媽", "Mum and Dad"], ["國小同學", "primary-school classmate"]]) assert.equal(en.word(zh), want);
  // a pet name that a friend could also be called stays a name
  assert.equal(en.word("阿福"), "Ah-fu");
  assert.equal(en.f("{fname}是個安靜的{boy}", { fname: "志明", boy: "男生" }), "Chih-ming was a quiet boy");
});
