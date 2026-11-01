// 綜合論斷：命書的結語只轉述本命、大運與姓名已有的結論，文字乾淨，最旺與宜謹慎的大運落在 17–76 歲。
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { PLACE_GROUPS } from "../src/core/places.js";
import { analyse } from "../src/core/analysis.js";
import { analyseName } from "../src/core/name.js";
import { nameReading } from "../src/core/name-reading.js";
import { decadeReading } from "../src/core/reading-year.js";
import { overallReading } from "../src/core/reading-overall.js";
import { makeRng } from "../src/sim/rng.js";
import { randomName } from "../src/sim/random-name.js";

const BROKEN = /[{}]|undefined|null|NaN|\[object|function/;
const TAIWAN = PLACE_GROUPS.filter(g => g.group.startsWith("臺灣・")).map(g => g.places[0]);

test("80 random charts and names: clean items in order, and the decades it names are the chart's", () => {
  const rng = makeRng(77);
  for (let i = 0; i < 80; i++) {
    const y = 1940 + rng.int(86), sex = rng() < 0.5 ? "male" : "female";
    const chart = computeChart({ date: { y, m: 1 + rng.int(12), d: 1 + rng.int(28) }, time: rng() < 0.1 ? null : { h: rng.int(24), mi: rng.int(60) }, place: rng.pick(TAIWAN), sex });
    const analysis = analyse(chart.pillars.map(p => p.name));
    const decades = chart.luck.decades.map((_, k) => decadeReading(chart, analysis, k));
    const withName = i % 4 !== 0;
    const name = withName ? nameReading(analyseName(randomName(rng, y, sex)), analysis) : null;
    const o = overallReading(analysis, { decades, name });
    const where = `${chart.pillars.map(p => p.name).join(" ")} ${name ? name.full : "(no name)"}`;
    const labels = o.items.map(x => x.label);
    for (const x of [...o.items.map(it => it.text), o.closing]) {
      assert.ok(!BROKEN.test(x), `${where}: ${x}`);
      assert.ok(x.endsWith("。"), `${where}: ${x}`);
    }
    assert.deepEqual(labels.slice(0, 2), ["命格", "一生運勢"], where);
    assert.equal(labels.includes("姓名評分"), withName, where);
    assert.ok(o.items[0].text.startsWith(`${analysis.dayMaster.stem}${analysis.dayMaster.element}日主`), where);
    for (const label of ["最旺之運", "宜謹慎之運"]) {
      const it = o.items.find(x => x.label === label);
      if (!it) continue;
      const d = decades.find(x => it.text.includes(`的${x.name}大運`));
      assert.ok(d && d.startAge >= 17 && d.startAge <= 67, `${where} ${label}: ${it.text}`);
      assert.equal(d.tone, label === "最旺之運" ? "吉" : "凶", `${where} ${label}`);
    }
    // Every 忌 decade the closing names is one of the chart's.
    const named = (o.closing.match(/走到(.+?)這/) || [, ""])[1].split("、").filter(Boolean);
    for (const n of named) assert.ok(decades.some(d => d.name === n && d.tone === "凶"), `${where}: ${n}`);
  }
});
