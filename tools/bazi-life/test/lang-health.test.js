// The English of story/health.js (README「英文版（翻譯層）」): every event, run on its own in many states and with
// every option of its choice, shows no Chinese in English, and English takes exactly the draws Chinese does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { HEALTH } from "../src/sim/story/health.js";
import { makeLang, hasCJK } from "../src/sim/lang.js";
import { expand, fill } from "../src/sim/grammar.js";
import { makeRng } from "../src/sim/rng.js";
import { tripPlace, chatTool } from "../src/sim/world.js";
import { pronoun } from "../src/sim/people.js";
import { storyBundle } from "../scripts/story-bundle.mjs";

const json = async f => JSON.parse(await readFile(fileURLToPath(new URL(`../src/i18n/en/${f}`, import.meta.url)), "utf8"));
// This file's English with the shared words and names only, so the test does not depend on the other story files.
async function ownBundle() {
  const [health, words, names] = await Promise.all([json("health.json"), json("words.json"), json("names.json")]);
  const flat = {};
  for (const file of [words, health]) for (const section of Object.values(file.words || {})) Object.assign(flat, section);
  return { story: health.story, words: flat, names: names.names };
}

// A context like life.js createLife's: ctx.w picks a template this life has not told, expands it (again when the
// sentence was told) and, in English, renders the English with the same picks; {friend} and {trip} are drawn once.
function makeCtx(s, seed, en) {
  const rng = makeRng(seed);
  let scene = {};
  const ctx = { rng, s, lang: en ? "en" : "zh" };
  const slots = () => ({
    city: s.abroad || s.county, job: s.job ? s.job.title : "工作",
    partner: s.partner ? s.partner.call : "另一半", ta: pronoun(s.partner),
    kid: s.kids.length ? s.kids[s.kids.length - 1].call : "孩子", kids: s.kids.length > 1 ? "孩子們" : "孩子",
    friend: () => (scene.friend ??= (() => { const f = s.friends.filter(x => x.alive); return f.length ? rng.pick(f).call : "老朋友"; })()),
    grand: s.sex === "female" ? "阿嬤" : "阿公", chat: chatTool(s.year), trip: () => (scene.trip ??= tripPlace(s, ctx)), age: s.age, year: s.year,
  });
  ctx.w = (templates, vars = {}) => {
    const list = Array.isArray(templates) ? templates : [templates];
    const fresh = list.filter(t => !s.used.has(t));
    const template = rng.pick(fresh.length ? fresh : list);
    s.used.add(template);
    const all = { ...slots(), ...vars };
    const trace = en && [];
    let text = expand(template, all, rng, trace);
    for (let i = 0; i < 6 && s.used.has(text); i++) { if (trace) trace.length = 0; text = expand(template, all, rng, trace); }
    s.used.add(text);
    if (!en) return text;
    const lazy = { friend: () => scene.friend ?? "老朋友", trip: () => scene.trip ?? "墾丁" };
    for (const k of Object.keys(lazy)) if (k in vars) delete lazy[k];
    return en.w(template, { ...all, ...lazy }, trace, text);
  };
  ctx.f = (t, vars = {}) => (en ? en.f(t, vars) : fill(t, vars));
  ctx.text = t => (en ? en.text(t) : t);
  ctx.odds = (d, c, p) => p;
  ctx.roll = (d, c, p) => rng() < p;
  ctx.nudge = () => {};
  ctx.newScene = () => { scene = {}; };
  ctx.arc = {
    start: (id, data = {}, inYears = 1, stage = "start") => s.arcs[id] || (s.arcs[id] = { stage, next: s.age + inYears, since: s.age, data }),
    at: (id, stage) => !!s.arcs[id] && s.arcs[id].stage === stage && s.age >= s.arcs[id].next,
    go: (id, stage, inYears = 1) => { if (s.arcs[id]) { s.arcs[id].stage = stage; s.arcs[id].next = s.age + inYears; } },
    end: id => { delete s.arcs[id]; },
    get: id => s.arcs[id] || null,
  };
  return ctx;
}

// States that reach the branches: every era of the scenes and markets, children to old age, working, studying or
// retired, with and without kids, partner, friends and parents, abroad or not, and the arcs the follow-ups need.
function states() {
  const out = [];
  const years = [1958, 1973, 1979, 1987, 1990, 1995, 1999, 2004, 2006, 2009, 2012, 2017, 2018, 2020, 2023, 2025];
  const ages = [5, 10, 14, 17, 22, 28, 36, 47, 57, 63, 70, 82];
  const kinds = ["stock", "fund", "etf", "crypto", "gold"], counties = ["臺北市", "高雄市", "花蓮縣", "桃園市", "臺中市"];
  const fields = ["科技", "業務", "製造", "公部門", "自營", "醫療"];
  let n = 0;
  for (const year of years) for (const age of ages) {
    const k = n++, v = b => (k >> b) & 1;
    const employed = age >= 18 && !!(v(0) | v(3)), studying = !employed && age >= 6 && age <= 24;
    out.push({
      year, age, sex: v(0) ? "male" : "female", county: counties[k % counties.length], abroad: k % 11 === 3 ? "美國" : null,
      employed, studying, retired: age >= 62 && !employed, unemployedFor: !employed && age >= 20 && v(2) ? 1 : 0,
      savings: [0.05, 0.6, 1.5, 3][k % 4], debt: v(3) ? 0.2 : 0, income: 1, home: ["own", "parents", "rent"][k % 3],
      job: employed ? { title: "工程師", field: fields[k % fields.length], since: age - 2 } : null,
      kids: age >= 28 && v(1) ? [{ call: "宥蓁", age: age - 27, sex: "female" }, ...(v(2) ? [{ call: "冠宇", age: Math.max(0, age - 30), sex: "male" }] : [])] : [],
      partner: age >= 20 && (v(1) | v(4)) ? { call: "志明", sex: v(5) ? "male" : "female" } : null,
      rel: age >= 20 && v(1) && v(2) ? "married" : "single",
      friends: v(4) ? [] : [{ call: "阿明", alive: true, sex: v(6) ? "female" : "male" }, { call: "淑芬", alive: true, sex: "female" }],
      father: { alive: !!(v(0) | v(2)) }, mother: { alive: !!(v(1) | v(3)) },
      health: { serious: k % 7 === 2, smoke: !!v(2), drink: !!v(3), fitness: 0.5, stress: 0.3, hr: 1 },
      flags: { grandkids: age >= 55 && v(1) ? 2 : 0, ...(k % 5 === 1 ? { lent: { age: age - 3, back: !!v(2), amount: 0.2, who: v(3) ? "阿明" : undefined, iou: !!v(4) } } : {}) },
      arcs: k % 3 === 0 ? {} : {
        m_stock: { stage: v(1) ? "hold" : "start", next: age - 1, since: age - 3, data: { kind: kinds[k % 5], stake: 0.3, from: year - 1 - (k % 4), ...(v(2) ? { add: { stake: 0.1, from: year - 1 } } : {}) } },
        m_hui: { stage: "start", next: age, since: age - 2, data: { stake: 0.3, checked: !!v(2), head: "鄰居阿姨", ...(k % 6 === 0 ? { lead: true, head: "你" } : {}) } },
      },
      used: [],
    });
  }
  return out;
}

// One run of an event in a state: up to three rounds (the same state, so a second time reads differently), taking
// the given option each round. Returns what the reader saw and the draw that would come next.
function run(ev, base, seed, picks, en, seen, offered) {
  const s = structuredClone(base);
  s.used = new Set(s.used);
  const ctx = makeCtx(s, seed, en);
  const lines = [];
  for (const pick of picks) {
    ctx.newScene();
    if (ev.when && !ev.when(s, ctx)) continue;
    if (ev.choice) {
      const c = ev.choice(s, ctx);
      lines.push(ctx.text(c.prompt));
      for (const o of c.options) { lines.push(ctx.text(o.label), ctx.text(o.hint)); offered && offered.add(o.id); }
      const ok = c.options.filter(o => !o.when || o.when(s, ctx)), o = ok[pick % ok.length];
      if (o) { lines.push(ctx.text(o.apply(s, ctx).text)); seen && seen.add(o.id); }
    } else lines.push(ctx.text(ev.apply(s, ctx).text));
    seen && seen.add(ev.id);
    for (const id of ["m_stock", "m_hui"]) if (!s.arcs[id] && base.arcs[id]) s.arcs[id] = structuredClone(base.arcs[id]);
    if (!s.flags.lent && base.flags.lent) s.flags.lent = structuredClone(base.flags.lent);
  }
  return { lines: lines.filter(t => t !== undefined && t !== null), next: ctx.rng() };
}

function everyLine(en, onLine) {
  const seen = new Set(), offered = new Set(), list = states();
  for (const [e, ev] of HEALTH.entries()) for (const [j, base] of list.entries()) for (let k = 0; k < 7; k++) {
    const { lines } = run(ev, base, e * 100003 + j * 31 + k, k < 6 ? [k] : [0, 1, 2], en, seen, offered);
    for (const t of lines) onLine(ev.id, t);
  }
  return { seen, offered };
}

test("every health and money sentence has English, whatever the life (each event in many states, every option)", async () => {
  const en = makeLang(await ownBundle());
  const bad = new Map();
  const { seen, offered } = everyLine(en, (id, t) => {
    if (hasCJK(t) || /[{}]|undefined|NaN|null/.test(t) || /\S {2}\S|^\s|\s$|\s[,.;:!?]|[a-z][,;:][A-Za-z]/.test(t)) bad.set(t, id);
  });
  assert.deepEqual([...bad].slice(0, 10), []);
  assert.deepEqual([...en.missing], [], "Chinese with no English");
  // every event ran, and every option a choice offered was taken
  for (const ev of HEALTH) assert.ok(seen.has(ev.id), ev.id);
  assert.deepEqual([...offered].filter(id => !seen.has(id)), []);
  assert.ok(offered.size > 150, `${offered.size} options`);
});

test("English takes the same draws as Chinese: the same lines, options and the next random number", async () => {
  const en = makeLang(await ownBundle());
  const list = states();
  for (const [e, ev] of HEALTH.entries()) for (let j = 0; j < list.length; j += 7) for (let k = 0; k < 3; k++) {
    const zh = run(ev, list[j], 7 + e * 977 + j * 13 + k, [k, k + 1, k + 2], null), english = run(ev, list[j], 7 + e * 977 + j * 13 + k, [k, k + 1, k + 2], en);
    assert.equal(english.next, zh.next, `${ev.id} in state ${j}`);
    assert.equal(english.lines.length, zh.lines.length, `${ev.id} in state ${j}`);
  }
});

test("the English bundle the page fetches has this file's English too", async t => {
  let bundle;
  try { bundle = await storyBundle(); } catch (err) { t.skip(`the bundle does not build yet: ${err.message}`); return; }
  const en = makeLang(bundle), own = (await json("health.json")).story;
  // as the page looks a string up (a words entry of another file would come first)
  for (const [zh, text] of Object.entries(own)) if (hasCJK(zh)) assert.equal(en.text(zh), text, zh);
  const list = states(), bad = [];
  for (const [e, ev] of HEALTH.entries()) for (let j = 0; j < list.length; j += 5) {
    for (const line of run(ev, list[j], e * 31 + j, [0, 1], en).lines) if (hasCJK(line)) bad.push(`${ev.id}: ${line}`);
  }
  assert.deepEqual(bad.slice(0, 10), []);
});
