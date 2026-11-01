// The English edition's translation layer (README「英文版（翻譯層）」): Chinese mode is exactly as before, English
// lives are the same lives with other words, the translated files show no Chinese, and the tools agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { seededLife } from "./helpers/lives.js";
import { storyBundle, english } from "../scripts/story-bundle.mjs";
import { extract, check, scan } from "../scripts/extract-strings.mjs";
import { makeLang, storyKey, romanise, pronoun, article, withArticle, plural, ordinal, render, shape, hasCJK, applyFilters } from "../src/sim/lang.js";
import { expand, fill } from "../src/sim/grammar.js";
import { makeRng } from "../src/sim/rng.js";
import { ALL_NAME_PARTS } from "../src/sim/random-name.js";
import { ERA } from "../src/sim/story/era.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/zh-lives.json", import.meta.url));
const bundle = await storyBundle();
const digest = seen => createHash("sha256").update(JSON.stringify(seen)).digest("hex").slice(0, 32);

test("Chinese mode is unchanged: 50 seeded lives read exactly as they did before the English layer", async () => {
  const fixture = JSON.parse(await readFile(FIXTURE, "utf8"));
  const now = Array.from({ length: 50 }, (_, i) => digest(seededLife(fixture.seed, i).seen));
  if (process.env.UPDATE_ZH_LIVES) { fixture.digests = now; await writeFile(FIXTURE, JSON.stringify(fixture, null, 1) + "\n"); }
  assert.deepEqual(now, fixture.digests);
  // and lang: "zh" is the default
  for (let i = 0; i < 5; i++) assert.equal(digest(seededLife(fixture.seed, i, { lang: "zh" }).seen), fixture.digests[i]);
});

test("an English life is the same life: the same events, ages, moods and choices as in Chinese", () => {
  for (let i = 0; i < 40; i++) {
    const zh = seededLife(3, i).seen, en = seededLife(3, i, { lang: "en", english: makeLang(bundle) }).seen;
    const outline = seen => seen.map(e => [e.kind, e.id, e.age, e.mood, e.big, e.options ? e.options.map(o => [o[0], o[3]]) : null]);
    assert.deepEqual(outline(en), outline(zh), `life ${i}`);
  }
});

test("English lives that live through Taiwan's history read era events with no Chinese", () => {
  const hit = new Set(), asked = new Set();
  let lines = 0;
  for (let i = 0; i < 150; i++) {
    const { life, seen } = seededLife(5, i, { lang: "en", english: makeLang(bundle) });
    assert.equal(life.lang, "en");
    for (const e of seen) {
      if (!e.id || !e.id.startsWith("e_")) continue;
      if (e.kind === "ask") {
        asked.add(e.id);
        for (const part of [e.prompt, ...e.options.flatMap(o => [o[1], o[2]])]) assert.ok(!hasCJK(part), `${e.id}: ${part}`);
        continue;
      }
      // A written answer goes through the general actions (act.js), which have no English yet.
      if (e.choice && /^你決定/.test(e.choice)) continue;
      hit.add(e.id); lines++;
      assert.ok(!hasCJK(e.text), `${e.id}: ${e.text}`);
      assert.ok(!/[{}]|undefined|null|NaN/.test(e.text), `${e.id}: ${e.text}`);
      if (e.choice) assert.ok(!hasCJK(e.choice), `${e.id}: ${e.choice}`);
    }
  }
  assert.ok(hit.size >= 25 && lines >= 400, `only ${hit.size} era events, ${lines} lines`);
  assert.ok(asked.has("e_2020covid") && asked.has("e_1985lottery"), [...asked].join(","));
});

test("every era sentence has English, whatever the life (each event run on its own in many states)", () => {
  // Each era event applied in states that reach its branches: abroad or not, a little child or not, a job in each
  // field, a same-sex couple or not, and every option of its choice.
  const en = makeLang(bundle);
  const person = (sex, call) => ({ sex, call, name: call, alive: true });
  const states = [];
  for (const abroad of [null, "美國"]) for (const kid of [null, person("female", "宥蓁")]) for (const field of ["醫療", "製造", "公部門", ""]) for (const same of [false, true]) {
    for (const county of ["臺北市", "臺中市", "花蓮縣", "臺南市"]) for (const employed of [true, false]) {
      states.push({ age: 30, year: 2020, sex: "male", county, abroad, employed, studying: !employed, retired: false, savings: 2, debt: 0, income: 1,
        job: field ? { title: "工程師", field, since: 30 } : null, kids: kid ? [{ ...kid, age: 6 }] : [], partner: person(same ? "male" : "female", "志明") });
    }
  }
  for (const [k, ev] of ERA.entries()) {
    for (const [j, base] of states.entries()) {
      const s = structuredClone(base);
      const rng = makeRng(k * 1000 + j);
      const trace = () => [];
      const w = (templates, vars = {}) => {
        const list = Array.isArray(templates) ? templates : [templates], t = rng.pick(list), tr = trace();
        const all = { job: s.job ? s.job.title : "工作", partner: s.partner.call, ...vars };
        const zh = expand(t, all, rng, tr);
        return en.w(t, all, tr, zh);
      };
      const ctx = { rng, w, f: en.f, nudge: () => {} };
      const shown = [];
      if (ev.choice) {
        const c = ev.choice(s, ctx);
        shown.push(en.text(c.prompt));
        for (const o of c.options) { shown.push(en.text(o.label), en.text(o.hint || "")); shown.push(en.text(o.apply(structuredClone(s), ctx).text)); }
      } else {
        // apply may need the region of a county the state does not have: era.js only reads s.county
        shown.push(en.text(ev.apply(s, ctx).text));
      }
      for (const t of shown) assert.ok(!hasCJK(t), `${ev.id}: ${t}`);
    }
  }
});

test("the English keeps the Chinese template's shape, and the check finds the ones that do not", async () => {
  const { entries } = await extract();
  const zh = new Set(Object.values(entries).map(e => e.zh));
  const en = await english();
  assert.deepEqual(check(zh, en), []);
  // every Chinese string in the code has its own key in the shipped bundle
  const keys = new Map();
  for (const t of zh) { const k = storyKey(t); assert.ok(!keys.has(k) || keys.get(k) === t, `${t} and ${keys.get(k)} share ${k}`); keys.set(k, t); }
  const bad = check(zh, { story: { "那年八月的大水，你記得{大人們整夜把家具往高處搬。|鄰居划著木盆來救人。}": "You remember the flood {of {city}|that year}.", "不在程式裡": "Nowhere" }, words: {}, from: {} });
  assert.deepEqual(bad.map(p => p.problem.split(":")[0]).sort(), ["no such Chinese string in the scanned code (changed or removed?)", "{vars} differ"]);
  const parts = check(zh, { story: { "那年八月的大水，你記得{大人們整夜把家具往高處搬。|鄰居划著木盆來救人。}": "You remember {the grown-ups|a neighbour|the rain}." }, words: {}, from: {} });
  assert.match(parts[0].problem, /top-level \{a\|b\} parts differ: \[2\] vs \[3\]/);
});

test("the extractor finds strings, template literals with ${} and where each stands", () => {
  const src = 'const a = "中文"; // 註解\nctx.w(`你在${s.city}{上班|上學}`); x = /[「」]/.test(y) ? { prompt: "要怎麼辦？", label: ctx.rng.pick(["好", "不好"]) } : 0;\nctx.f("{lead}{ask}", {});';
  const found = scan(src).map(f => [f.value, f.line, f.use, f.mixed]);
  assert.deepEqual(found, [["中文", 1, "other", false], ["你在${s.city}{上班|上學}", 2, "w", true], ["要怎麼辦？", 2, "prompt", false], ["好", 2, "label", false], ["不好", 2, "label", false], ["{lead}{ask}", 3, "f", false]]);
});

test("an English template takes the Chinese picks, nested ones too", () => {
  const zh = "你{早上|晚上}去了{公園|{海邊|山上}}。";
  const en = "You went to {the park|{the sea|the hills}} in the {morning|evening}.";
  for (let seed = 1; seed < 40; seed++) {
    const tr = [], text = expand(zh, {}, makeRng(seed), tr);
    const out = render("{a|b}{c|{d|e}}", tr, () => "");
    const want = (text.includes("早上") ? "a" : "b") + (text.includes("公園") ? "c" : text.includes("海邊") ? "d" : "e");
    assert.equal(out, want, text);
  }
  // the same draws with or without a trace
  const r1 = makeRng(9), r2 = makeRng(9);
  assert.equal(expand(zh, {}, r1), expand(zh, {}, r2, []));
  assert.equal(r1(), r2());
  assert.deepEqual(shape(en), { vars: [], alts: [2, 2], byPart: [[[], []], [[], []]] });
  assert.equal(fill("你在{city}，{n} 歲{x}", { city: "臺北市", n: 30 }), "你在臺北市，30 歲{x}");
});

test("English grammar: pronouns, a and an, plurals, ordinals and the filters", () => {
  assert.deepEqual(["subj", "obj", "pos", "refl"].map(f => pronoun("female", f)), ["she", "her", "her", "herself"]);
  assert.equal(pronoun("male", "obj"), "him");
  assert.equal(pronoun(undefined), "they");
  assert.deepEqual(["engineer", "university", "hour", "MRT station", "LINE group", "nurse", "one-off", "umbrella"].map(article), ["an", "a", "an", "an", "a", "a", "a", "an"]);
  assert.equal(withArticle("estate agent"), "an estate agent");
  assert.equal(plural(1, "child", "children"), "child");
  assert.equal(plural(3, "year"), "years");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"]);
  assert.equal(applyFilters("he", ["obj"]), "him");
  assert.equal(applyFilters("she", ["cap"]), "She");
  assert.equal(applyFilters("engineer", ["a", "cap"]), "An engineer");
  assert.equal(applyFilters(2, ["child", "children"]), "children");
  const lang = makeLang({ story: { "{ta}說{who}要來": "{ta:cap} says {who:a} is coming; ask {ta:obj}." }, words: { 他: "he", 同事: "co-worker" } });
  assert.equal(lang.f("{ta}說{who}要來", { ta: "他", who: "同事" }), "He says a co-worker is coming; ask him.");
});

test("story people's names are romanised the Taiwanese way", () => {
  const names = bundle.names;
  assert.equal(romanise("李天賜", names), "Lee Tien-tzu");
  assert.equal(romanise("陳志明", names), "Chen Chih-ming");
  assert.equal(romanise("志明", names), "Chih-ming");
  assert.equal(romanise("阿明", names), "Ah-ming");
  assert.equal(romanise("小美", names), "Hsiao-mei");
  assert.equal(romanise("張簡宏明", names), "Chang-Chien Hung-ming");
  assert.equal(romanise("黃怡君", names), "Huang Yi-chun");
  assert.equal(romanise("郭雅婷", names), "Kuo Ya-ting");
  assert.equal(romanise("陳明", names), "Chen Ming");
  assert.equal(romanise("Amy", names), null);
  assert.equal(romanise("王曌", names), null);   // a character outside the table: the caller keeps the name as written
  // every random name and every given name alone
  for (const s of ALL_NAME_PARTS.surnames) for (const g of ALL_NAME_PARTS.given.slice(0, 40)) assert.match(romanise(s + g, names), /^[A-Z][a-z]+(?:-[A-Z][a-z]+)? [A-Z][a-z]+-[a-z]+$/, s + g);
  for (const g of ALL_NAME_PARTS.given) assert.match(romanise(g, names), /^[A-Z][a-z]+-[a-z]+$/, g);
});

test("the English bundle is fetched, not built into the Chinese page", async () => {
  const page = await readFile(fileURLToPath(new URL("../public/life.html", import.meta.url)), "utf8");
  for (const en of Object.values(bundle.story).slice(1, 20)) assert.ok(!page.includes(en.slice(0, 40)), en);
  assert.ok(!page.includes("Lee Tien") && !page.includes("Hsiao-mei"));
  assert.ok(bundle.v === 1 && Object.keys(bundle.story).length >= 100 && bundle.names.chars["天"] === "tien");
  // keyed by hash, and a bundle keyed by the Chinese itself reads the same
  const plain = { ...bundle, keys: undefined, story: (await english()).story };
  assert.equal(makeLang(bundle).text("下重本"), "Bet big");
  assert.equal(makeLang(plain).text("下重本"), "Bet big");
});

test("English without its catalog, or another language, is refused", () => {
  assert.throws(() => seededLife(1, 0, { lang: "en" }), /makeLang/);
  assert.throws(() => seededLife(1, 0, { lang: "fr" }), /unknown language/);
  assert.throws(() => makeLang(null), /catalog/);
});
