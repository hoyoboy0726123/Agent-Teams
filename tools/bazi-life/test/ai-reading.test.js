// AI 命理師解讀與 AI 合婚 (src/ai-reading.js): what the page sends, what the Worker accepts, the parts a reading is
// written in, their fact sheets and prompts, and the checker that keeps the text to the engine's facts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findPlace } from "../src/core/places.js";
import {
  readingRequest, readReadingRequest, readingPart, partPrompt, partTokens, checkPart, finishPart, parseSections,
  yearPillar, soften, agesOf, partsFor, toneWord, PARTS, SECTIONS, READING_VERSION,
} from "../src/ai-reading.js";

const NOW = 2026;
const input = { date: { y: 1990, m: 6, d: 21 }, time: { h: 12, mi: 0, branch: "午" }, place: findPlace("臺北市"), sex: "female" };
const partner = { date: { y: 1992, m: 3, d: 8 }, time: { h: 7, mi: 45 }, sex: "male" };
const ask = (kind, part, p = null, from = input) => readReadingRequest(JSON.parse(JSON.stringify(readingRequest(from, kind, { part, partner: p }))));
const partOf = (kind, id, p = null, from = input) => readingPart(ask(kind, id, p, from), { now: NOW });
const BANNED = /過世|去世|壽命|死亡|血光|大凶|手術|開刀|安太歲|點燈|模擬|這一局|遊戲/;

test("the page sends only births: no name, no game, one part at a time", () => {
  const body = readingRequest(input, "full", { part: "years2" });
  assert.deepEqual(body, { v: READING_VERSION, kind: "full", part: "years2", birth: { y: 1990, m: 6, d: 21, time: { shichen: "wu" }, place: "臺北市", sex: "female" } });
  assert.equal(readingRequest(input, "short").part, "short");
  const match = readingRequest(input, "match", { part: "myears", partner });
  assert.deepEqual(match.partner, { y: 1992, m: 3, d: 8, time: { h: 7, mi: 45 }, sex: "male" }, "the partner is sent without a place");
  assert.ok(JSON.stringify(match).length < 300);
  assert.equal(readingRequest({ ...input, time: null }, "full").birth.time, null);
});

test("the Worker accepts only what the page could send", () => {
  const ok = ask("full", "decades");
  assert.equal(ok.part, "decades");
  assert.equal(ok.birth.place.name, "臺北市");
  assert.deepEqual(ok.birth.time, { h: 12, mi: 0, branch: "午" });
  assert.equal(readReadingRequest({ ...readingRequest(input, "full"), part: undefined }).part, "a", "a missing part is the first");
  const m = ask("match", "m1", partner);
  assert.equal(m.partner.place.name, "臺北市", "the partner is born where you were");
  const body = readingRequest(input, "full"), mb = readingRequest(input, "match", { partner });
  const bad = [
    null, "x", { ...body, v: 1 }, { ...body, kind: "poem" }, { ...body, part: "years9" }, { ...body, part: "m1" },
    { ...body, birth: { ...body.birth, m: 2, d: 30 } }, { ...body, birth: { ...body.birth, y: 1800 } },
    { ...body, birth: { ...body.birth, place: "月球" } }, { ...body, birth: { ...body.birth, sex: "x" } },
    { ...body, birth: { ...body.birth, time: { shichen: "noon" } } }, { ...body, birth: { ...body.birth, time: { h: 25, mi: 0 } } },
    { ...mb, partner: undefined }, { ...mb, partner: { ...mb.partner, d: 31, m: 4 } }, { ...mb, partner: { ...mb.partner, sex: "" } },
  ];
  for (const b of bad) assert.equal(readReadingRequest(b), null, JSON.stringify(b && (b.part || b.birth || b)).slice(0, 80));
});

test("ages: from now to 85, at most fifty; ten past 75; from birth for the unborn", () => {
  const P = (by, now = NOW) => ({ age: Math.max(0, now - by) });
  assert.deepEqual(agesOf(P(1990)).slice(0, 2), [36, 37]);
  assert.equal(agesOf(P(1990)).at(-1), 85);
  assert.equal(agesOf(P(2015)).length, 50);
  assert.deepEqual([agesOf(P(1946))[0], agesOf(P(1946)).length], [80, 10]);
  assert.deepEqual(agesOf(P(2030)).slice(0, 2), [0, 1]);
  // The page asks only for the years parts that have ages in them, and those are the parts that are not empty.
  const years = by => partsFor("full", by, NOW).filter(p => p.startsWith("years"));
  assert.deepEqual(years(1990), ["years0", "years1", "years2", "years3", "years4"]);
  assert.deepEqual(years(1959), ["years0", "years1"]);
  assert.deepEqual(years(1940), ["years0"]);
  assert.deepEqual(years(2030), PARTS.full.filter(p => p.startsWith("years")));
  for (const by of [1940, 1959, 1971, 1990, 2026]) {
    const from = { ...input, date: { ...input.date, y: by } };
    for (const id of PARTS.full.filter(p => p.startsWith("years"))) assert.equal(partOf("full", id, null, from).items.length > 0, years(by).includes(id), `${by} ${id}`);
  }
  assert.deepEqual(partsFor("match", 1940, NOW), PARTS.match);
  assert.deepEqual(partsFor("short", 1940, NOW), PARTS.short);
});

test("a full reading is eight parts, each with the engine's facts and nothing of the game", () => {
  assert.deepEqual(PARTS.full, ["a", "b", "decades", "years0", "years1", "years2", "years3", "years4"]);
  const a = partOf("full", "a"), b = partOf("full", "b");
  assert.deepEqual(a.titles, ["命格一句話", "命盤總論", "性格與天賦", "事業與財運"]);
  assert.deepEqual(b.titles, ["感情與婚姻", "六親與人際", "健康與作息", "開運建議", "給你的三句話"]);
  for (const p of ["庚午", "壬午", "丁巳", "丙午"]) assert.ok(a.facts.includes(p), p);
  for (const w of ["用神水", "建祿格", "【詳批・性格】", "【詳批・事業】", "【大運】", "目前在這一步"]) assert.ok(a.facts.includes(w), w);
  for (const w of ["【詳批・六親】", "【詳批・婚姻感情】", "【開運（用神水）】", "【健康（傳統說法）】"]) assert.ok(b.facts.includes(w), w);
  const decades = partOf("full", "decades");
  assert.equal(decades.items[0].key, "戊寅大運", "from the 大運 you are in");
  assert.deepEqual(decades.items[0].head, { name: "戊寅", startAge: 36, endAge: 45, startYear: 2025, endYear: 2034, tone: decades.items[0].head.tone, current: true });
  assert.deepEqual(decades.items[0].fields, ["重點", "好事", "要注意"]);
  const y0 = partOf("full", "years0"), y4 = partOf("full", "years4");
  assert.deepEqual(y0.items.map(i => i.key).slice(0, 3), ["36 歲", "37 歲", "38 歲"]);
  assert.deepEqual(y0.items[0].head, { age: 36, year: 2026, pillar: "丙午", tone: y0.items[0].head.tone, decade: "戊寅" });
  assert.equal(y0.items.length, 10);
  assert.deepEqual([y4.items[0].key, y4.items.at(-1).key], ["76 歲", "85 歲"]);
  assert.match(y0.facts, /36 歲（2026 年 丙午年，/);
  for (const p of [a, b, decades, y0, y4]) {
    assert.doesNotMatch(p.facts, BANNED, `${p.id}: ${(p.facts.match(BANNED) || [])[0]}`);
    for (const it of p.items || []) for (const f of it.fields) assert.ok(it.fallback[f] && it.fallback[f].length >= 6, `${it.key} ${f}`);
  }
  // Someone of 75 has no fourth and fifth tens.
  const old = { ...input, date: { y: 1951, m: 4, d: 2 } };
  assert.equal(partOf("full", "years1", null, old).items.length, 1);
  assert.equal(partOf("full", "years2", null, old).items.length, 0);
});

test("a short reading and the parts of 合婚", () => {
  const s = partOf("short", "short");
  assert.deepEqual(s.titles, ["命格一句話", "總評"]);
  assert.match(s.facts, /【接下來五年】/);
  const m1 = partOf("match", "m1", partner), m2 = partOf("match", "m2", partner), my = partOf("match", "myears", partner);
  assert.deepEqual(m1.titles, ["合婚一句話", "合婚總評", "兩個人的個性"]);
  assert.deepEqual(m2.titles, ["相處的優點", "容易摩擦的地方", "給你們的建議"]);
  for (const w of ["【你】", "【對方】", "【你的日主】丁火", "【對方的日主】", "【合婚結果】"]) assert.ok(m1.facts.includes(w), w);
  assert.ok(["互補", "平穩", "需要磨合"].includes(m1.meta.tone));
  assert.ok(Array.isArray(m1.meta.highlights));
  assert.equal(my.items.length, 10);
  assert.deepEqual(my.items[0].head.ages, [36, 34]);
  assert.equal(my.items[0].key, "2026 年");
  assert.match(my.facts, /2026 年 丙午年：你 36 歲/);
  for (const p of [s, m1, m2, my]) assert.doesNotMatch(p.facts, BANNED);
});

test("the prompt: rules, the part's sections or entries, what other parts cover, and the facts", () => {
  const a = partOf("full", "a"), y0 = partOf("full", "years0"), m1 = partOf("match", "m1", partner);
  const pa = partPrompt(a);
  for (const t of a.titles) assert.ok(pa.includes(`【${t}】${SECTIONS[t]}`), t);
  for (const rule of ["只能使用下面「命盤資料」", "不談死亡、壽命", "不建議任何改運商品", "繁體中文和臺灣用語", "稱呼讀者「你」"]) assert.ok(pa.includes(rule), rule);
  assert.match(pa, /感情與婚姻、六親與人際、健康與作息、開運建議、每一步大運、每一歲的流年由別人寫/);
  assert.ok(pa.endsWith(a.facts));
  const py = partPrompt(y0);
  assert.match(py, /流年逐歲/);
  assert.ok(py.includes(y0.items.map(i => `【${i.key}】`).join("")));
  assert.match(py, /一行「好事：」.*一行「要注意：」/);
  const pm = partPrompt(m1);
  assert.match(pm, /AI 合婚/);
  assert.match(pm, /不說誰剋誰，不預言分手、離婚或外遇/);
  // A list asked again names only the entries it missed.
  const last = { bad: [{ key: "37 歲", why: "沒有寫" }], problems: ["【37 歲】沒有寫"], items: new Map() };
  const again = partPrompt(y0, last);
  assert.match(again, /標題依序是：【37 歲】\n/);
  assert.match(again, /上一次有這些問題，這次一定要避免：【37 歲】沒有寫/);
  assert.ok(partTokens(y0, last) < partTokens(y0));
});

// Text for a sections part that keeps to the facts, with `extra` in its second section.
const FILL = "命理上看，這是你的傾向和時機，不是注定；路怎麼走，選擇一直在你自己手上，慢慢來也沒關係。";
const sectionsText = (part, extra = "", drop = null) => part.titles.filter(t => t !== drop).map((t, i) => `【${t}】\n${i === 1 ? extra : ""}${FILL}${FILL}`).join("\n\n");
const listText = (part, fill = it => ({ 重點: "這十年以學習與貴人為主軸。", 好事: "工作上容易遇到合作與貴人。", 要注意: "理財宜保守，合夥借貸要小心。" })) =>
  part.items.map(it => `【${it.key}】\n${it.fields.map(f => `${f}：${fill(it)[f]}`).join("\n")}`).join("\n\n");

test("a sections part that keeps to the facts passes; the checker catches what a model gets wrong", () => {
  const a = partOf("full", "a"), C = a.check;
  const d = C.decades.find(x => x.name === "戊寅");
  const fine = `你是丁火日主，用神水，忌火，格局是建祿格，身強。2026 年 36 歲是丙午年；戊寅大運（虛歲 ${d.startAge}–${d.endAge}）、戊寅大運（${d.startYear}–${d.endYear}）。`;
  const ok = checkPart(sectionsText(a, fine), a);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.sections.length, 4);
  const marked = a.titles.map((t, i) => `${i % 2 ? `**【${t}】**` : `${i + 1}. 【${t}】：`}\n${FILL}${FILL}`).join("\n");
  assert.equal(checkPart(marked, a).ok, true, "Markdown and numbering around a title do not matter");
  const cases = [
    ["你在甲子年轉運。", /沒有的干支/], ["2030 年丙午年要小心。", /2030 年不是丙午年/], ["你是甲木日主。", /日主是丁/],
    ["庚木的性格很直。", /庚屬金，不是木/], ["你喜火。", /火不是喜用/], ["你最忌水。", /水不是忌神/], ["你的命中缺火。", /命中不缺火/],
    ["你是身弱的命。", /不是身弱/], ["你是七殺格。", /格局是建祿格/], ["2030 年 33 歲那年。", /2030 年不是 33 歲/],
    [`戊寅大運（虛歲 ${d.startAge + 2}–${d.endAge + 2}）。`, /大運是虛歲/], ["你會活到 85 歲。", /死亡或壽命/],
    ["這幾年有血光之災。", /恐嚇/], ["要小心糖尿病。", /疾病/], ["可能需要動手術。", /手術/], ["記得去檢查肝功能。", /檢查項目/],
    ["可以去廟裡點燈化解。", /改運商品或儀式/], ["这几年你们会很顺。", /簡體字/],
  ];
  for (const [extra, why] of cases) {
    const c = checkPart(sectionsText(a, extra), a);
    assert.equal(c.ok, false, extra);
    assert.ok(c.problems.some(p => why.test(p)), `${extra} → ${c.problems.join("；")}`);
  }
  assert.ok(checkPart(sectionsText(a, "", "事業與財運"), a).problems.some(p => p.includes("少了段落：事業與財運")));
});

test("a list part: entries are matched by their titles, a second try keeps the good ones, and the engine fills the rest", () => {
  const y0 = partOf("full", "years0");
  assert.equal(checkPart(listText(y0), y0).ok, true);
  // Titles with spaces dropped or a year after them, and 【好事】 written as titles, still count.
  const loose = y0.items.map(it => `【${it.key.replace(" ", "")}（${it.head.year}）】\n【好事】工作上容易遇到合作與貴人。\n【要注意】理財宜保守，合夥借貸要小心。`).join("\n");
  assert.equal(checkPart(loose, y0).ok, true);
  // One left out, one without 要注意, one with a banned word.
  const [first, second, third] = y0.items;
  const broken = listText(y0).replace(new RegExp(`【${first.key}】[^【]*`), "").replace(new RegExp(`(【${second.key}】\\n好事：[^\\n]*)\\n要注意：[^\\n]*`), "$1").replace(new RegExp(`(【${third.key}】\\n好事：)`), "$1可能要動手術。");
  const c1 = checkPart(broken, y0);
  assert.equal(c1.ok, false);
  assert.deepEqual(c1.bad.map(b => b.key), [first.key, second.key, third.key]);
  assert.match(c1.bad[1].why, /少了「要注意」/);
  assert.match(c1.bad[2].why, /手術/);
  assert.equal(c1.items.size, y0.items.length - 3);
  // The second try answers only those three; the third is still wrong and gets the engine's words.
  const retry = `【${first.key}】\n好事：適合學習新東西，報名課程。\n要注意：作息要規律，少熬夜。\n【${second.key}】\n好事：容易遇到貴人，多參加聚會。\n要注意：說話記得留三分餘地。`;
  const c2 = checkPart(retry, y0, c1);
  assert.deepEqual(c2.bad.map(b => b.key), [third.key]);
  const out = finishPart(y0, c2);
  assert.equal(out.items.length, y0.items.length);
  const filled = out.items.find(x => x.key === third.key);
  assert.equal(filled.fallback, true);
  assert.deepEqual(filled.fields, third.fallback);
  const kept = out.items.find(x => x.key === first.key);
  assert.deepEqual(kept.fields, { 好事: "適合學習新東西，報名課程。", 要注意: "作息要規律，少熬夜。" });
  assert.deepEqual([kept.age, kept.year, kept.pillar, kept.decade], [36, 2026, "丙午", "戊寅"]);
  assert.equal(kept.fallback, undefined);
});

test("合婚 text is held to both charts, and does not foretell a breakup", () => {
  const m1 = partOf("match", "m1", partner), C = m1.check;
  assert.equal(C.dayStems.length, 2);
  const both = `你是丁火日主，對方是${C.dayStems[1]}日主。2026 年你 36 歲，2026 年對方 34 歲。`;
  assert.deepEqual(checkPart(sectionsText(m1, both), m1).problems, []);
  for (const [extra, why] of [["你們兩個注定分開。", /外遇或分手/], ["要小心對方外遇。", /外遇或分手/], ["2026 年 50 歲。", /不是 50 歲/]]) {
    assert.ok(checkPart(sectionsText(m1, extra), m1).problems.some(p => why.test(p)), extra);
  }
  const my = partOf("match", "myears", partner);
  assert.equal(checkPart(listText(my), my).ok, true);
  const out = finishPart(my, checkPart(listText(my), my));
  assert.deepEqual(out.meta, my.meta);
  assert.deepEqual(out.items[0].ages, [36, 34]);
});

test("the engine's words about surgery and blood are said gently before the model sees them", () => {
  assert.equal(soften("流年逢白虎：傳統上要防血光與開刀，開車、運動多小心"), "流年逢白虎：傳統上要多注意安全、避免受傷，開車、運動多小心");
  assert.equal(soften("逢羊刃：衝勁強、敢做決定，但也要防衝動、受傷、開刀與破財"), "逢羊刃：衝勁強、敢做決定，但也要防衝動、受傷與破財");
  assert.equal(soften("巳申刑：刑也主小傷與手術，身體要多留意"), "巳申刑：刑也主小傷，身體要多留意");
  assert.equal(soften("逢天乙貴人，家中遇事容易有人幫忙；值太歲，傳統上會安太歲，祈求闔家平安。"), "逢天乙貴人，家中遇事容易有人幫忙；值太歲。");
  assert.equal(toneWord("吉") + toneWord("平") + toneWord("凶"), "順勢平穩宜守");
});

test("titles and years", () => {
  assert.deepEqual(parseSections("## 【總評】：一句話\n第二行\n\n【命格一句話】\n比喻").map(s => [s.title, s.body]), [["總評", "一句話\n第二行"], ["命格一句話", "比喻"]]);
  assert.equal(yearPillar(1984), "甲子");
  assert.equal(yearPillar(2026), "丙午");
  assert.equal(yearPillar(1990), "庚午");
});
