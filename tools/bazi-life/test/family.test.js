import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { analyse } from "../src/core/analysis.js";
import { relate, buildFamily, checkFamily, familyTilts } from "../src/core/family.js";
import { prepare } from "../src/sim/setup.js";
import { runLife } from "../src/sim/life.js";

const me = (pillars) => ({ pillars, analysis: analyse(pillars) });
const ME = me(["戊辰", "甲寅", "辛丑", "戊子"]);   // 1988-02-15 23:30 Taipei: 龍, 辛 day master, 丑 day branch
const shorts = r => r.notes.map(n => n.short);

test("relations between two charts: zodiac 六合 / 三合 / 沖 / 害, day stems and day branches", () => {
  assert.ok(shorts(relate(ME, me(["癸酉", "甲寅", "丙申", "戊子"]))).includes("生肖六合"));    // 辰酉; 丙辛 合
  assert.ok(shorts(relate(ME, me(["癸酉", "甲寅", "丙申", "戊子"]))).includes("日干相合"));
  assert.ok(shorts(relate(ME, me(["甲子", "甲寅", "丁未", "戊子"]))).includes("生肖三合"));    // 申子辰
  const clash = relate(ME, me(["戊戌", "甲寅", "丁未", "戊子"]));                          // 辰戌 沖, 丑未 沖
  assert.ok(shorts(clash).includes("生肖相沖") && shorts(clash).includes("日支相沖"));
  assert.ok(clash.net < 0 && clash.tone === "需要磨合");
  assert.ok(shorts(relate(ME, me(["丁卯", "甲寅", "戊子", "戊子"]))).includes("生肖相害"));    // 卯辰
  assert.ok(shorts(relate(ME, me(["丁卯", "甲寅", "戊子", "戊子"]))).includes("對方的日干生你")); // 戊土生辛金
  assert.ok(shorts(relate(ME, me(["丁卯", "甲寅", "丙子", "戊子"]))).includes("日干相合"));
  assert.ok(shorts(relate(ME, me(["丁卯", "甲寅", "丁亥", "戊子"]))).includes("對方的日干約束你")); // 丁火剋辛金
  for (const o of [["癸酉", "甲寅", "丙申"], ["戊戌", "甲寅", "丁未"], ["丁卯", "甲寅", "戊子", "戊子"]]) {
    const r = relate(ME, me(o));
    assert.ok(r.net >= -1 && r.net <= 1 && ["互補", "需要磨合", "平穩"].includes(r.tone));
    for (const n of r.notes) assert.ok(!/剋你|你剋|剋對方|對方剋/.test(n.text), n.text);
  }
});

test("family input: members without a birth date take part only by name; the form checks the dates", () => {
  const place = findPlace("臺北市");
  const fam = buildFamily({ father: { name: "陳大明" }, mother: { name: "林美華", date: { y: 1961, m: 9, d: 21 } }, siblings: [{ relation: "younger", name: "x" }], onlyChild: true }, ME, place);
  assert.equal(fam.members.length, 2);
  assert.equal(fam.members[0].bond, null);
  assert.ok(fam.members[1].bond && fam.members[1].chart.pillars.length === 3);   // no birth time: three pillars
  assert.equal(fam.onlyChild, true);
  assert.equal(buildFamily({ siblings: [] }, ME, place), null);
  const birth = { y: 1988, m: 2, d: 15 };
  assert.deepEqual(checkFamily({ father: { date: { y: 1958, m: 5, d: 3 } }, siblings: [{ relation: "youngerSister", date: { y: 1988, m: 2, d: 15 } }] }, birth), []);   // twins share the date
  assert.equal(checkFamily({ father: { date: { y: 1990, m: 1, d: 1 } } }, birth).length, 1);
  assert.match(checkFamily({ siblings: [{ relation: "youngerBrother", name: "志明", date: { y: 1985, m: 1, d: 9 } }] }, birth)[0], /弟弟（志明）的生日比你早，要改成哥哥嗎/);
  assert.match(checkFamily({ siblings: [{ relation: "olderSister", date: { y: 1990, m: 1, d: 9 } }] }, birth)[0], /要改成妹妹嗎/);
});

test("family tilts stay within ±0.15", () => {
  const all = net => familyTilts({ members: ["father", "mother", "olderBrother", "youngerSister"].map(relation => ({ relation, bond: { net } })) });
  for (const net of [-1, -0.4, 0, 0.6, 1]) {
    const t = all(net);
    for (const v of [t.childhood, t.study, ...Object.values(t.bond)]) assert.ok(Math.abs(v) <= 0.15 + 1e-12, `${net}: ${v}`);
  }
  assert.ok(Math.abs(all(1).childhood - 0.15) < 1e-12 && Math.abs(all(-1).bond.siblings + 0.15) < 1e-12);
  assert.deepEqual(familyTilts(null), { childhood: 0, study: 0, bond: { father: 0, mother: 0, siblings: 0, partner: 0 } });
});

test("a life with family input: names at birth, parents' real ages, and the younger sister born on time", () => {
  const chart = computeChart({ date: { y: 1988, m: 2, d: 15 }, time: { h: 23, mi: 30 }, place: findPlace("臺北市"), sex: "female" });
  const family = {
    father: { name: "陳大明", date: { y: 1958, m: 5, d: 3 }, time: { h: 8, mi: 0 } },
    mother: { name: "林美華", date: { y: 1961, m: 9, d: 21 } },
    siblings: [{ relation: "olderBrother", name: "陳志明", date: { y: 1985, m: 1, d: 9 } }, { relation: "youngerSister", name: "小美", date: { y: 1992, m: 7, d: 1 } }],
  };
  const prep = prepare(chart, { name: "陳怡君", family });
  assert.equal(prep.name.full, "陳怡君");
  for (let i = 0; i < 200; i++) {
    const life = runLife({ chart, analysis: prep.analysis, luck: prep.luck, seed: 700 + i, name: prep.name, family: prep.family });
    const birth = life.log[0].text;
    assert.match(birth, /名叫陳怡君。爸爸是陳大明，媽媽是林美華。上面已經有哥哥志明。/);
    for (const e of life.log) assert.ok(e.text && !/[{}]|undefined|null|NaN/.test(e.text), `${e.id}: ${e.text}`);
    if (life.state.age >= 4) assert.ok(life.log.some(e => e.id === "knownSibling" && e.age === 4 && /妹妹小美/.test(e.text)), "妹妹小美 at 4");
    assert.ok(!life.log.some(e => e.id === "sibling"), "no random siblings when siblings are given");
    if (i === 0) assert.equal(life.state.father.age - life.state.age, 30);
  }
  const only = prepare(chart, { family: { onlyChild: true } });
  for (let i = 0; i < 50; i++) {
    const life = runLife({ chart, analysis: only.analysis, luck: only.luck, seed: 900 + i, family: only.family });
    assert.ok(!life.log.some(e => /sibling|Sibling|inheritance/.test(e.id)), "an only child has no sibling events");
  }
});
