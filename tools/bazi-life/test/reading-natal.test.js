// 本命詳批：every chart gets every section, a well-formed 排盤表 and clean text; the 用神 and 神煞 agree with the analysis
// and the detail layer; the fixed 1988 chart reads as the classics would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace, PLACE_GROUPS } from "../src/core/places.js";
import { analyse } from "../src/core/analysis.js";
import { natalStars } from "../src/core/detail.js";
import { natalReading, SECTION_IDS, GLOSSARY, DAY_MASTER_TEXT, TEN_GOD_TEXT, PATTERN_TEXT, ELEMENT_INDUSTRIES, ELEMENT_ORGANS, ELEMENT_LUCK, CLASSIC_LINES, CLASSIC_SOURCE } from "../src/core/reading-natal.js";
import { makeRng } from "../src/sim/rng.js";

const BROKEN = /[{}]|undefined|null|NaN|\[object|function/;
const HARSH = /死亡|過世|去世|早逝|夭折|喪命|壽命|癌|腫瘤|中風|糖尿|高血壓|心臟病|肝炎|洗腎|必定|注定|一定會/;
const TAIWAN = PLACE_GROUPS.filter(g => g.group.startsWith("臺灣・")).map(g => g.places[0]);
const ROWS = ["主星", "天干", "地支", "藏干", "副星", "星運", "自坐", "空亡", "納音", "神煞"];
const sentences = text => (text.match(/[。！？]/g) || []).length;
const sectionText = s => [...s.paragraphs, ...s.items.map(it => it.text)].join("");

// Every string anywhere in the reading.
function strings(x, out = []) {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) for (const v of x) strings(v, out);
  else if (x && typeof x === "object") for (const v of Object.values(x)) strings(v, out);
  return out;
}

// Random births 1950–2025 across Taiwan, some without an hour.
function charts(n, seed) {
  const rng = makeRng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const y = 1950 + rng.int(76), m = 1 + rng.int(12), d = 1 + rng.int(28);
    const time = rng() < 0.15 ? null : { h: rng.int(24), mi: rng.int(60) };
    const chart = computeChart({ date: { y, m, d }, time, place: rng.pick(TAIWAN), sex: rng() < 0.5 ? "male" : "female" });
    out.push(chart);
  }
  return out;
}

test("300 random charts: every section, a 10-row table per pillar, clean text, 用神 and 神煞 consistent", () => {
  let hourless = 0;
  for (const chart of charts(300, 2024)) {
    const names = chart.pillars.map(p => p.name), a = analyse(names), r = natalReading(chart, a);
    const id = names.join(" ");
    if (!chart.hourKnown) hourless++;
    // sections, in order, each non-empty and 2–5 sentences of prose
    assert.deepEqual(r.sections.map(s => s.id), SECTION_IDS, id);
    for (const s of r.sections) {
      assert.ok(s.title && s.paragraphs.length && s.paragraphs.every(p => p.length > 10), `${id} ${s.id} empty`);
      const n = s.paragraphs.reduce((t, p) => t + sentences(p), 0);
      assert.ok(n >= 2 && n <= 5, `${id} ${s.id}: ${n} sentences`);
      for (const it of s.items) assert.ok(it.label && it.text, `${id} ${s.id} item`);
    }
    // the table
    assert.deepEqual(r.table.columns, chart.pillars.map(p => p.label), id);
    assert.deepEqual(r.table.rows.map(row => row.label), ROWS, id);
    for (const row of r.table.rows) assert.equal(row.cells.length, chart.pillars.length, `${id} ${row.label}`);
    const stars = natalStars(chart);
    assert.deepEqual(r.table.rows[9].cells, chart.pillars.map(p => stars[p.role]), `${id} 神煞`);
    // clean, gentle text
    for (const t of strings(r)) {
      assert.ok(!BROKEN.test(t), `${id}: ${t}`);
      assert.ok(!HARSH.test(t), `${id}: ${t}`);
    }
    for (const n of r.advice.numbers) assert.ok(Number.isInteger(n) && n >= 0 && n <= 9, `${id} number ${n}`);
    for (const k of ["elements", "colors", "directions", "numbers", "industries", "habits", "zodiac"]) assert.ok(r.advice[k].length, `${id} advice.${k}`);
    // the 用神 named in 格局與用神 is analysis.useful[0], and no other element is called the 用神
    const pattern = sectionText(r.sections[3]);
    const named = [...pattern.matchAll(/以([木火土金水])（[^）]*）為用神|以([木火土金水])為用神/g)].map(m => m[1] || m[2]);
    if (a.useful.length) {
      assert.ok(named.length >= 1, `${id}: no 用神 named`);
      assert.ok(named.every(e => e === a.useful[0]), `${id}: 用神 ${named} vs ${a.useful[0]}`);
    } else assert.equal(named.length, 0, id);
    // the reading talks about this chart: its day master everywhere, its month branch in the opening four sections
    const dm = `${a.dayMaster.stem}${a.dayMaster.element}`, mb = chart.pillars[1].branch.name;
    for (const s of r.sections) assert.ok(sectionText(s).includes(dm), `${id} ${s.id} does not mention ${dm}`);
    for (const s of r.sections.slice(0, 4)) assert.ok(sectionText(s).includes(`${mb}月`), `${id} ${s.id} does not mention ${mb}月`);
    // health is tradition, not diagnosis
    const health = sectionText(r.sections[9]);
    assert.ok(health.includes("傳統說法") && health.includes("以醫師診斷為準"), id);
    // each term is glossed once at most
    const all = r.sections.map(sectionText).join("");
    for (const [term, gloss] of Object.entries(GLOSSARY)) assert.ok(all.split(`${term}（${gloss}）`).length <= 2, `${id}: ${term} glossed twice`);
    assert.ok(all.includes(`日主（${GLOSSARY.日主}）`), `${id}: 日主 not glossed`);
  }
  assert.ok(hourless >= 20, `only ${hourless} charts without an hour`);
});

test("the fixed chart 戊辰 甲寅 辛丑 戊子 (1988-02-15 23:30, male, Taipei)", () => {
  const chart = computeChart({ date: { y: 1988, m: 2, d: 15 }, time: { h: 23, mi: 30 }, place: findPlace("臺北市"), sex: "male" });
  assert.deepEqual(chart.pillars.map(p => p.name), ["戊辰", "甲寅", "辛丑", "戊子"]);
  const a = analyse(chart.pillars.map(p => p.name)), r = natalReading(chart, a);
  const row = label => r.table.rows.find(x => x.label === label).cells;
  // 排盤表
  assert.deepEqual(r.table.columns, ["年柱", "月柱", "日柱", "時柱"]);
  assert.deepEqual(row("主星"), ["正印", "正財", "元男", "正印"]);
  assert.deepEqual(row("藏干")[0], ["戊土", "乙木", "癸水"]);
  assert.deepEqual(row("副星")[2], ["偏印", "食神", "比肩"]);
  assert.deepEqual(row("星運"), ["墓", "胎", "養", "長生"]);
  assert.deepEqual(row("納音"), ["大林木", "大溪水", "壁上土", "霹靂火"]);
  const stars = natalStars(chart);
  assert.deepEqual(row("神煞"), ["year", "month", "day", "hour"].map(k => stars[k]));
  assert.deepEqual(row("神煞")[3], ["文昌貴人", "天廚貴人", "學堂", "將星"]);
  // basics
  const basic = label => (r.basics.find(b => b.label === label) || {}).value || "";
  assert.match(basic("真太陽時"), /23:22/);
  assert.match(basic("節氣"), /立春後 11 天/);
  assert.match(basic("起運"), /6 年 2 個月 26 天/);
  assert.match(basic("起運"), /順行/);
  assert.match(basic("命宮"), /^乙卯/);
  assert.match(basic("胎元"), /^乙巳/);
  assert.match(basic("人元司令"), /丙火/);
  assert.match(basic("生肖"), /龍/);
  // 日主強弱: rooted only in 丑, and the 印 (土) stems 戊 in the year and hour
  const strength = r.sections.find(s => s.id === "strength");
  const st = sectionText(strength), parts = st.split("。");
  assert.ok(parts.some(x => x.includes("丑") && x.includes("通根")), st);
  assert.ok(parts.some(x => x.includes("年干戊") && x.includes("時干戊") && x.includes("印") && x.includes("土")), st);
  assert.match(st, /身強/);
  // 格局與用神: 正財格 with 甲 showing in the month stem; the 用神 is the analysis' first useful element
  const pattern = sectionText(r.sections.find(s => s.id === "pattern"));
  assert.match(pattern, /正財格/);
  assert.match(pattern, /透出月干/);
  assert.ok(pattern.includes(`以${a.useful[0]}（`) || pattern.includes(`以${a.useful[0]}為用神`), pattern);
  assert.match(pattern, /《窮通寶鑑》/);
  // the opening names the day master, month and structure
  const summary = sectionText(r.sections[0]);
  for (const w of ["辛金", "寅月", "正財格", "失令", "身強"]) assert.ok(summary.includes(w), `${w}: ${summary}`);
  // 五行: the 子丑 combination and 辰子 half-combination are read with their palaces
  const elements = r.sections.find(s => s.id === "elements");
  assert.ok(elements.items.some(it => it.label.startsWith("子丑合土")), elements.items.map(it => it.label).join(" "));
  assert.ok(elements.items.some(it => it.label.startsWith("子辰半合水局")));
  // 婚姻: male, so the 配偶星 is 財 (木), with 正財甲 showing in the month stem
  const love = r.sections.find(s => s.id === "marriage"), marriage = sectionText(love);
  assert.match(marriage, /妻星是木/);
  assert.ok(love.items.some(it => it.label === "寡宿（日柱）"), love.items.map(it => it.label).join(" "));
});

test("a chart without an hour: three columns, no 命宮, and the reading says what it cannot see", () => {
  const chart = computeChart({ date: { y: 1990, m: 6, d: 1 }, time: null, place: findPlace("臺北市"), sex: "female" });
  const r = natalReading(chart, analyse(chart.pillars.map(p => p.name)));
  assert.deepEqual(r.table.columns, ["年柱", "月柱", "日柱"]);
  assert.equal(r.table.rows.length, 10);
  for (const row of r.table.rows) assert.equal(row.cells.length, 3);
  assert.ok(!r.basics.some(b => b.label === "命宮" || b.label === "身宮" || b.label === "真太陽時"));
  assert.match(r.basics.find(b => b.label === "胎元").value, /^壬申/);   // 辛巳 month → 壬申
  assert.match(sectionText(r.sections[0]), /時辰不詳/);
  assert.match(r.sections.find(s => s.id === "family").items.find(it => it.label === "子女").text, /時辰不詳/);
  assert.ok(r.notes.some(n => n.includes("時辰不詳")));
});

test("a name heads the basics and the opening", () => {
  const chart = computeChart({ date: { y: 1995, m: 3, d: 8 }, time: { h: 9, mi: 30 }, place: findPlace("臺北市"), sex: "female" });
  const r = natalReading(chart, analyse(chart.pillars.map(p => p.name)), { name: "林小美" });
  assert.deepEqual(r.basics[0], { label: "姓名", value: "林小美" });
  assert.ok(r.sections[0].paragraphs[0].startsWith("林小美的命盤"));
  assert.equal(r.basics.find(b => b.label === "性別").value, "坤造（女）");
});

test("the static tables cover every stem, ten god, structure and element", () => {
  for (const s of "甲乙丙丁戊己庚辛壬癸") assert.ok(DAY_MASTER_TEXT[s].verse.startsWith(s) && DAY_MASTER_TEXT[s].nature && DAY_MASTER_TEXT[s].blind, s);
  for (const g of ["比肩", "劫財", "食神", "傷官", "正財", "偏財", "正官", "七殺", "正印", "偏印"]) assert.ok(TEN_GOD_TEXT[g].trait && TEN_GOD_TEXT[g].seat, g);
  for (const p of ["正官格", "七殺格", "正財格", "偏財格", "正印格", "偏印格", "食神格", "傷官格", "建祿格", "月刃格"]) assert.ok(PATTERN_TEXT[p].careers.length, p);
  for (const e of "木火土金水") {
    assert.ok(ELEMENT_INDUSTRIES[e].length >= 5 && ELEMENT_ORGANS[e].organs && ELEMENT_LUCK[e].colors.length, e);
    assert.equal(ELEMENT_LUCK[e].numbers.length, 2);
  }
  assert.deepEqual(ELEMENT_LUCK.水.numbers, [1, 6]);   // 河圖：天一生水，地六成之
  assert.deepEqual(ELEMENT_LUCK.土.numbers, [5, 0]);
});

test("every classical quote is one of the lines kept in the code, under the right book, and never called 開篇", () => {
  assert.equal(CLASSIC_SOURCE.size, new Set(CLASSIC_LINES).size);
  let quotes = 0;
  for (const chart of charts(400, 77)) {
    const names = chart.pillars.map(p => p.name), r = natalReading(chart, analyse(names));
    for (const t of strings(r)) {
      assert.doesNotMatch(t, /開篇/, t);
      // 《滴天髓》…「line」 and 古訣「line」: the quoted words must be a kept line, named after its own source.
      for (const m of t.matchAll(/(《[^》]+》|古訣)[^「。]{0,12}「([^」]+)」/g)) {
        quotes++;
        assert.equal(CLASSIC_SOURCE.get(m[2]), m[1], `${names.join(" ")}: ${m[1]}「${m[2]}」`);
      }
    }
  }
  assert.ok(quotes > 400, `${quotes} quotes checked`);
});

test("the 六親 section says what 十神 can and cannot tell, points to 合盤, and makes no hurtful family claims", () => {
  const HURT = /緣分較淡|子女較少|無子|剋父|剋母|剋夫|剋妻|喪父|喪母|孤獨終老|六親無靠/;
  for (const chart of charts(200, 31)) {
    const names = chart.pillars.map(p => p.name), r = natalReading(chart, analyse(names));
    const fam = r.sections.find(s => s.id === "family"), text = sectionText(fam);
    assert.match(text, /只看得出傾向/, names.join(" "));
    assert.match(text, /合盤/, names.join(" "));
    assert.doesNotMatch(text, HURT, `${names.join(" ")}: ${(text.match(HURT) || [])[0]}`);
  }
});

test("the 農曆 line explains the 子時 rule, also when true solar time falls on the evening before the entered date", () => {
  const lunarOf = (y, m, d, h, mi, zi) => {
    const c = computeChart({ date: { y, m, d }, time: { h, mi }, place: findPlace("臺北市"), sex: "male", options: { zi } });
    const item = natalReading(c, analyse(c.pillars.map(p => p.name))).basics.find(i => i.label === "農曆");
    return [c.pillars[2].name, item.value];
  };
  // 1979-08-01 00:30 summer time is 07-31 23:29 true solar time.
  const [earlyDay, early] = lunarOf(1979, 8, 1, 0, 30, "early"), [lateDay, late] = lunarOf(1979, 8, 1, 0, 30, "late");
  assert.equal(earlyDay, "庚子");
  assert.equal(lateDay, "己亥");
  assert.match(early, /真太陽時是前一天 23 點後.*若採夜子時，日柱是己亥/);
  assert.match(late, /採夜子時：真太陽時是前一天 23 點後，日柱算前一天.*若 23 點換日，日柱是庚子/);
  // 烏魯木齊 2000-06-21 00:30 is 22:18 the evening before: that day's pillar, said so.
  const urumqi = computeChart({ date: { y: 2000, m: 6, d: 21 }, time: { h: 0, mi: 30 }, place: findPlace("烏魯木齊（北京時間）"), sex: "male" });
  assert.equal(urumqi.pillars[2].name, "己酉");
  assert.match(natalReading(urumqi, analyse(urumqi.pillars.map(p => p.name))).basics.find(i => i.label === "農曆").value, /真太陽時還在前一天晚上，日柱以前一天論/);
  // 1988-02-15 23:30 is after 23:00 on the day itself.
  assert.match(lunarOf(1988, 2, 15, 23, 30, "early")[1], /23 點後出生，日柱已換到次日；若採夜子時，日柱是庚子/);
});
