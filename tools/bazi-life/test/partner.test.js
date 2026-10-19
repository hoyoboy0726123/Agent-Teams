// 伴侶合盤：200 組隨機的兩張命盤，文字乾淨、句子完整、分數與 relate() 一致、說到的合沖與 relate() 算到的一致，
// 生肖、日柱、用神三段一定在；再手算幾組：天合地合、日支相沖、配偶星、雙向與單向的用神互補，以及範例的那一對。
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { analyse, elementScores, ELEMENTS } from "../src/core/analysis.js";
import { relate } from "../src/core/family.js";
import { partnerReading, SECTION_IDS, GLOSSARY } from "../src/core/partner.js";
import { makeRng } from "../src/sim/rng.js";

const BROKEN = /[{}]|undefined|null|NaN|\[object|function/;
const FORBIDDEN = /剋夫|剋妻|不適合|離婚|死|外遇|沒救|相剋到底|分手|劈腿|第三者|婚變/;
const OVERSOLD = /天作之合|白頭到老|一定會|注定|必定|保證|完美/;
// 剋 names only a 五行 relation: 金剋木, the glosses of 財星 and 官殺, and 納音 屬於相剋.
const ALLOWED_KE = /[木火土金水]剋[木火土金水]|日干所剋|剋日干|屬於相剋/g;
const TONE_LEAD = { 互補: "以互補為主", 平穩: "屬於平穩的組合", 需要磨合: "需要多一點磨合" };
const place = findPlace("臺北市");

const person = (pillars, sex, name) => ({ pillars, analysis: analyse(pillars), sex, ...(name ? { name } : {}) });
const sectionOf = (r, id) => r.sections.find(s => s.id === id);
const textOf = (r, id) => { const s = sectionOf(r, id); return s ? [...s.paragraphs, ...s.items.map(it => it.text)].join("") : ""; };
const prose = r => [r.summary, ...r.sections.flatMap(s => [...s.paragraphs, ...s.items.map(it => it.text)]), ...r.advice];
// The text without its glosses, wherever they landed.
const plain = t => Object.entries(GLOSSARY).reduce((x, [k, g]) => x.split(`${k}（${g}）`).join(k), t);
const strongest = pillars => { const s = elementScores(pillars); return ELEMENTS.slice().sort((x, y) => s[y] - s[x])[0]; };
function strings(x, out = []) {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) for (const v of x) strings(v, out);
  else if (x && typeof x === "object") for (const v of Object.values(x)) strings(v, out);
  return out;
}

// Random births 1950–2025 in Taipei, some without an hour, random sexes; every third pair has names.
function pairs(n, seed) {
  const rng = makeRng(seed);
  const one = () => {
    const sex = rng() < 0.5 ? "male" : "female";
    const time = rng() < 0.2 ? null : { h: rng.int(24), mi: rng.int(60) };
    const chart = computeChart({ date: { y: 1950 + rng.int(76), m: 1 + rng.int(12), d: 1 + rng.int(28) }, time, place, sex });
    return person(chart.pillars.map(p => p.name), sex);
  };
  return Array.from({ length: n }, (_, i) => {
    const me = one(), partner = one();
    if (i % 3 === 0) { me.name = "志明"; partner.name = "小美"; }
    return { me, partner };
  });
}

test("200 random pairs: clean, complete sentences, relate()'s net and tone, and the 生肖 / 日柱 / 用神 parts", () => {
  let hourless = 0, named = 0;
  const tones = new Set();
  for (const { me, partner } of pairs(200, 2026)) {
    const r = partnerReading({ me, partner }), bond = relate(me, partner);
    const id = `${me.pillars.join(" ")} | ${partner.pillars.join(" ")}`;
    if (me.pillars.length === 3 || partner.pillars.length === 3) hourless++;
    tones.add(r.tone);
    // the score is relate()'s, unchanged
    assert.equal(r.net, bond.net, id);
    assert.equal(r.tone, bond.tone, id);
    assert.equal(r.title, "伴侶合盤");
    // shape
    const ids = r.sections.map(s => s.id);
    assert.deepEqual(ids, SECTION_IDS.filter(x => ids.includes(x)), `${id}: order ${ids}`);
    for (const must of ["zodiac", "day", "palace", "star", "useful", "nayin", "closing"]) assert.ok(ids.includes(must), `${id}: no ${must}`);
    for (const s of r.sections) {
      assert.ok(s.title && s.paragraphs.length && s.paragraphs.every(p => p.length > 10), `${id} ${s.id} empty`);
      for (const it of s.items) assert.ok(it.label && it.text, `${id} ${s.id} item`);
    }
    assert.ok(r.highlights.length >= 2 && r.highlights.length <= 5, `${id}: ${r.highlights}`);
    assert.equal(new Set(r.highlights).size, r.highlights.length, `${id}: ${r.highlights}`);
    assert.ok(r.advice.length >= 2 && r.advice.length <= 4, `${id}: ${r.advice.length} advice`);
    // clean, gentle text; every sentence ends properly
    for (const t of strings(r)) assert.ok(!BROKEN.test(t), `${id}: ${t}`);
    for (const t of prose(r)) {
      assert.match(t, /[。！？]$/, `${id}: ${t}`);
      assert.ok(!/[，；、：。][，；、：。]/.test(t) && !/^[，；、：。]/.test(t), `${id}: ${t}`);
      assert.ok(!/（[^）]*（/.test(t), `${id}: nested gloss ${t}`);
      assert.ok(!FORBIDDEN.test(t) && !OVERSOLD.test(t), `${id}: ${t}`);
      assert.ok(!t.replace(ALLOWED_KE, "").includes("剋"), `${id}: 剋 ${t}`);
    }
    // the summary: 2–3 sentences, the tone, and once that this is the traditional view
    const n = (r.summary.match(/[。！？]/g) || []).length;
    assert.ok(n >= 2 && n <= 3, `${id}: summary ${n} sentences`);
    assert.ok(r.summary.includes(TONE_LEAD[r.tone]) && textOf(r, "closing").includes(TONE_LEAD[r.tone]), id);
    assert.equal(prose(r).join("").split("傳統命理的看法").length, 2, `${id}: tradition note`);
    // names when given, else 你 and 對方
    if (me.name) {
      named++;
      assert.ok(r.summary.startsWith("志明和小美"), id);
      for (const t of [...prose(r), ...r.highlights]) assert.ok(!/你|對方/.test(t), `${id}: ${t}`);
    } else assert.ok(r.summary.startsWith("你和對方"), id);
    // each term glossed once at most, 日干 always
    const all = prose(r).join("");
    for (const [term, gloss] of Object.entries(GLOSSARY)) assert.ok(all.split(`${term}（${gloss}）`).length <= 2, `${id}: ${term} glossed twice`);
    assert.ok(all.includes(`日干（${GLOSSARY.日干}）`), `${id}: 日干 not glossed`);

    // Everything relate() counts is said in its section, and nothing it does not count is said as if it did.
    const A = me.name || "你", B = partner.name || "對方";
    const zodiac = plain(textOf(r, "zodiac")), day = plain(textOf(r, "day")), palace = plain(textOf(r, "palace")), useful = plain(sectionOf(r, "useful").items[0].text);
    const shorts = bond.notes.map(x => x.short), has = s => shorts.includes(s);
    for (const k of ["生肖六合", "生肖三合", "生肖相沖", "生肖相害"]) assert.equal(zodiac.includes(`是${k}`), has(k), `${id}: ${k}`);
    assert.equal(/相刑|帶刑/.test(zodiac), has("生肖相刑"), `${id}: 生肖相刑`);
    assert.equal(day.includes("「天合」"), has("日干相合"), `${id}: 天合`);
    assert.equal(day.includes("「地合」"), has("日支六合"), `${id}: 地合`);
    assert.equal(/..相沖/.test(palace), has("日支相沖"), `${id}: 日支相沖`);
    assert.equal(new RegExp(`${B}的日干..生${A}的日干`).test(day), has("對方的日干生你"), `${id}: 生你`);
    assert.equal(new RegExp(`${A}的日干..生${B}的日干`).test(day), has("你的日干生對方"), `${id}: 生對方`);
    assert.equal(new RegExp(`${B}的日干..約束${A}的日干`).test(day), has("對方的日干約束你"), `${id}: 約束你`);
    assert.equal(new RegExp(`${A}的日干..約束${B}的日干`).test(day), has("你的日干約束對方"), `${id}: 約束對方`);
    const top = strongest(partner.pillars);
    const liked = new RegExp(`${top}正是${B}命盤裡最旺的五行|${B}命盤最旺的${top}也是${A}的`).test(useful);
    const disliked = useful.includes(`${B}命盤最旺的${top}是${A}的`);
    assert.equal(liked, has(`對方${top}旺，是你的喜用`), `${id}: ${useful}`);
    assert.equal(disliked, has(`對方${top}旺，是你忌的五行`), `${id}: ${useful}`);
  }
  assert.ok(hourless >= 20, `only ${hourless} pairs with an unknown hour`);
  assert.ok(named >= 50, `only ${named} named pairs`);
  assert.equal(tones.size, 3, [...tones].join(" "));
});

test("天合地合: day pillars 甲子 and 己丑 (甲己合、子丑合), with names", () => {
  const me = person(["庚午", "戊寅", "甲子", "丙寅"], "male", "家豪"), partner = person(["壬申", "壬子", "己丑", "甲子"], "female", "淑芬");
  const r = partnerReading({ me, partner }), bond = relate(me, partner);
  assert.ok(bond.notes.some(n => n.short === "日干相合") && bond.notes.some(n => n.short === "日支六合"));
  assert.equal(r.net, bond.net);
  assert.equal(r.highlights[0], "天合地合");
  const day = textOf(r, "day");
  assert.match(day, /甲己合（合土），稱為「天合」/);
  assert.match(day, /日支（[^）]+）子丑也六合，稱為「地合」/);
  assert.match(day, /「天合地合」/);
  assert.match(textOf(r, "palace"), /子丑六合（合土）/);
  assert.match(r.summary, /^家豪和淑芬的命盤以互補為主：日柱天合地合/);
  // 己 is 甲's 正財, 甲 is 己's 正官: the two are each other's spouse star
  const star = textOf(r, "star");
  assert.match(star, /淑芬的日干己土正是家豪的妻星，家豪的日干甲木也正是淑芬的夫星，兩人互為配偶星/);
  assert.match(star, /家豪的正財/);
  assert.match(star, /淑芬的正官/);
  assert.ok(r.highlights.includes("互為配偶星"));
});

test("日支相沖: 子 and 午 — different rhythms, worked out by agreeing on a routine", () => {
  const me = person(["庚午", "戊寅", "甲子", "丙寅"], "male"), partner = person(["辛未", "庚寅", "丙午", "戊子"], "female");
  const r = partnerReading({ me, partner }), bond = relate(me, partner);
  assert.ok(bond.notes.some(n => n.short === "日支相沖"));
  assert.ok(r.highlights.includes("日支相沖"));
  const palace = textOf(r, "palace");
  assert.match(palace, /你的日支[^，]*是子、對方的日支是午：子午相沖/);
  assert.match(palace, /生活節奏、作息習慣不同/);
  assert.match(palace, /多溝通/);
  assert.ok(r.advice.some(a => a.includes("作息")), r.advice.join(" "));
  assert.match(r.summary, /子午相沖/);
  // the same pair is 生肖六合 (午未): good and hard points side by side, as 平穩
  assert.match(textOf(r, "zodiac"), /馬和羊是生肖六合（午未合土）/);
  assert.equal(r.tone, bond.tone);
});

test("配偶星: a 辛 day master man and a 甲 / 乙 day master woman — her day master is his wife star 木", () => {
  const me = person(["戊辰", "甲寅", "辛丑", "戊子"], "male");
  for (const [pillars, god] of [[["庚午", "癸未", "甲申", "己巳"], "正財"], [["庚午", "癸未", "乙酉", "辛巳"], "偏財"]]) {
    const r = partnerReading({ me, partner: person(pillars, "female") });
    const star = sectionOf(r, "star"), mine = star.items[0].text;
    assert.equal(star.items[0].label, "你的妻星");
    assert.match(mine, /你是男命，日干辛金的妻星是木，在你的命盤裡約佔 31%，力量明顯/);
    assert.match(mine, new RegExp(`對方的日干[甲乙]木是你的${god}`));
    assert.match(star.paragraphs[0], /對方的日干[甲乙]木正是你的妻星，你的日干辛金也正是對方的夫星，兩人互為配偶星/);
    assert.equal(star.items[1].label, "對方的夫星");
    assert.match(star.items[1].text, /對方是女命，日干[甲乙]木的夫星是金/);
    assert.ok(r.highlights.includes("互為配偶星"));
  }
  // Two people of the same sex read both 財 and 官殺 (伴侶星): two women, 辛 and 丙 — each is in the other's.
  const r = partnerReading({ me: person(["戊辰", "甲寅", "辛丑", "戊子"], "female"), partner: person(["辛未", "庚寅", "丙午", "戊子"], "female") });
  const star = sectionOf(r, "star");
  assert.equal(r.neutral, true);
  assert.equal(star.items[0].label, "你的伴侶星");
  assert.match(star.items[0].text, /你的日干辛金，伴侶星是木（財星）和火（官殺）/);
  assert.match(star.items[0].text, /對方的日干丙火是你的正官(（[^）]*）)?，傳統上視為正緣/);
  assert.match(star.items[1].text, /對方的日干丙火，伴侶星是金（財星）和水（官殺）.*你的日干辛金是對方的正財/);
  assert.match(star.paragraphs[0], /兩位的性別相同，這裡兩種都看/);
  assert.match(star.paragraphs[0], /兩人互為伴侶星/);
  assert.ok(r.highlights.includes("互為伴侶星"));
  assert.ok(star.items.every(it => !/男命|女命|妻星|夫星/.test(it.text)), "each person is read the same way");
  assert.ok(!/同性|同志|兩位女性|兩位男性/.test(prose(r).join("")));
  // A man and a woman keep the traditional reading.
  assert.equal(partnerReading({ me, partner: person(["庚午", "癸未", "甲申", "己巳"], "female") }).neutral, false);
});

test("the sections can be shown in another order, glossed in that order, with the chips' kinds", () => {
  const me = person(["庚午", "壬午", "丁巳", "丙午"], "female"), partner = person(["壬申", "庚戌", "癸亥", "壬子"], "male");
  const order = ["palace", "useful", "star", "day", "elements", "zodiac", "nayin"];
  const r = partnerReading({ me, partner, order });
  assert.deepEqual(r.sections.map(s => s.id), [...order.filter(id => r.sections.some(s => s.id === id)), "closing"]);
  // A term is explained where it is first read: the summary, then the sections in the order shown.
  const firstUseGlossed = (x, term) => {
    const text = [x.summary, ...x.sections.flatMap(s => [...s.paragraphs, ...s.items.map(i => i.text)])].join("\n");
    const open = i => (text.slice(0, i).match(/（/g) || []).length > (text.slice(0, i).match(/）/g) || []).length;
    let i = text.indexOf(term);
    while (i >= 0 && open(i)) i = text.indexOf(term, i + 1);   // a use inside another gloss does not count
    return i >= 0 && text[i + term.length] === "（";
  };
  for (const x of [r, partnerReading({ me, partner })]) for (const term of ["日干", "日支", "夫妻宮", "財星"]) assert.ok(firstUseGlossed(x, term), term);
  assert.deepEqual(r.chips.map(c => c.text), r.highlights);
  for (const chip of r.chips) assert.ok(["good", "care", "mid"].includes(chip.kind));
  assert.equal(r.chips.find(c => c.text === "日支相沖").kind, "care");
  assert.equal(r.chips.find(c => c.text === "用神互補").kind, "good");
});

test("用神互補 in both directions, and in one", () => {
  // 1992-10-07 14:05 and 1996-03-07 14:16, Taipei: each one's 用神 is the other's strongest element.
  const me = person(["壬申", "己酉", "丙辰", "乙未"], "male"), partner = person(["丙子", "辛卯", "癸卯", "己未"], "female");
  assert.equal(me.analysis.useful[0], "木");
  assert.equal(partner.analysis.useful[0], "金");
  assert.equal(strongest(partner.pillars), "木");
  assert.equal(strongest(me.pillars), "金");
  const r = partnerReading({ me, partner });
  assert.ok(r.highlights.includes("用神互補"), r.highlights.join(" "));
  const useful = sectionOf(r, "useful");
  assert.match(useful.paragraphs[0], /你最需要的木在對方的命盤裡很旺，對方最需要的金在你的命盤裡也很旺/);
  assert.equal(useful.items[0].label, "對方帶給你");
  assert.match(useful.items[0].text, /木正是對方命盤裡最旺的五行/);
  assert.match(useful.items[1].text, /金正是你命盤裡最旺的五行/);
  assert.ok(relate(me, partner).notes.some(n => n.short === "對方木旺，是你的喜用"));
  assert.equal(r.tone, "互補");

  // One way only: her 用神 木 is half of his chart, while his 用神 金 is not strong in hers.
  const one = partnerReading({ me: person(["庚申", "壬午", "戊午"], "female"), partner: person(["甲戌", "丁卯", "甲午"], "male") });
  assert.ok(one.highlights.includes("對方補你用神"), one.highlights.join(" "));
  assert.match(sectionOf(one, "useful").paragraphs[0], /^兩人的時辰都不詳，五行以年、月、日三柱估算。用神方面，對方的命盤補得到你最需要的木/);
  assert.match(textOf(one, "elements"), /你已知的六個字裡沒有木，對方已知的六個字裡有三個木（甲、卯、甲）/);
});

test("the sample pair: 戊辰 甲寅 辛丑 戊子 (male) and 1990-08-03 09:10 Taipei (female)", () => {
  const her = computeChart({ date: { y: 1990, m: 8, d: 3 }, time: { h: 9, mi: 10 }, place, sex: "female" }).pillars.map(p => p.name);
  assert.deepEqual(her, ["庚午", "癸未", "庚子", "辛巳"]);
  const me = person(["戊辰", "甲寅", "辛丑", "戊子"], "male"), partner = person(her, "female");
  const r = partnerReading({ me, partner });
  assert.equal(r.net, 0.15);
  assert.equal(r.tone, "平穩");
  assert.deepEqual(r.highlights.slice(0, 2), ["日支六合", "對方旺你所忌"]);
  assert.match(textOf(r, "zodiac"), /你屬龍（年支辰），對方屬馬（年支午），龍和馬之間沒有六合、三合，也沒有沖、刑、害、破/);
  assert.match(textOf(r, "day"), /辛金和對方的日干庚金同屬金，一陰一陽，五行比和/);
  assert.match(textOf(r, "palace"), /子丑六合（合土）/);
  assert.match(textOf(r, "star"), /兩人的日干都不落在彼此的配偶星上/);
  const useful = sectionOf(r, "useful").items;
  assert.match(useful[0].text, /你的用神是水，對方的命盤裡水約佔 25%/);
  assert.match(useful[0].text, /對方命盤最旺的金是你的忌神/);
  assert.match(textOf(r, "elements"), /你的八字裡看不到火（只藏在寅裡），對方的八字有兩個火（午、巳）/);
  assert.match(textOf(r, "elements"), /對方的八字裡看不到木（只藏在未裡），你的八字有兩個木（甲、寅）/);
  assert.match(textOf(r, "nayin"), /大林木.*路旁土，木剋土，屬於相剋/);
  // With names, and the same names are not mixed up.
  const named = partnerReading({ me: { ...me, name: " 志明 " }, partner: { ...partner, name: "小美" } });
  assert.match(named.summary, /^志明和小美的命盤屬於平穩的組合/);
  assert.ok(named.highlights.includes("小美旺志明所忌"));
  const twins = partnerReading({ me: { ...me, name: "小美" }, partner: { ...partner, name: "小美" } });
  assert.match(twins.summary, /^你和對方/);
});
