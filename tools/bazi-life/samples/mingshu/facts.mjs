const root = process.argv[2], out = process.argv[3];
const { computeChart } = await import(`${root}/src/core/chart.js`);
const { findPlace } = await import(`${root}/src/core/places.js`);
const { analyse } = await import(`${root}/src/core/analysis.js`);
const { natalReading, patternFacts } = await import(`${root}/src/core/reading-natal.js`);
const { yearReading, decadeReading } = await import(`${root}/src/core/reading-year.js`);
const { natalStars, pillarFavor, luckGods } = await import(`${root}/src/core/detail.js`);
const { overallReading } = await import(`${root}/src/core/reading-overall.js`);
const { SixtyCycle, SolarDay } = await import(`${root}/node_modules/tyme4ts/dist/lib/index.mjs`);
const fs = await import("node:fs");
const input = { date: { y: 1990, m: 6, d: 21 }, time: { h: 12, mi: 0 }, place: findPlace("臺北市"), sex: "female" };
const chart = computeChart({ ...input, options: { solar: "true" } });
const names = chart.pillars.map(p => p.name), a = analyse(names);
const natal = natalReading(chart, a, { name: "林語晴" });
const decades = chart.luck.decades.map((_, i) => decadeReading(chart, a, i));
const years = []; for (let y = 2026; y <= 2035; y++) years.push(yearReading(chart, a, y - 1990));
// 流月 of 2027: the month pillar from each 節 (around the 6th) and how it sits with the chart's 喜忌.
const months = [];
for (let m = 1; m <= 12; m++) {
  const day = SolarDay.fromYmd(2027, m, 15);
  const mp = day.getSixtyCycleDay().getMonth().getName ? day.getSixtyCycleDay().getMonth().getName() : null;
  months.push({ m, pillar: mp, favor: mp ? pillarFavor(a, mp) : null, gods: mp ? luckGods(a.dayMaster.stem, mp) : null });
}
const data = { input, pillars: chart.pillars, time: chart.time, luck: { start: chart.luck.start, forward: chart.luck.forward, decades: chart.luck.decades }, warnings: chart.warnings,
  analysis: a, stars: natalStars(chart), pattern: patternFacts(chart, a), natal, decades, years, months, overall: overallReading(a, { decades, name: null }) };
fs.writeFileSync(out, JSON.stringify(data, (k, v) => (typeof v === "function" ? undefined : v), 1));
console.log(names.join(" "), a.strength, a.pattern, "useful", a.useful, "avoid", a.avoid, "special", a.special);
console.log("decades", chart.luck.decades.map(d => `${d.name} ${d.startYear}-${d.endYear} 虛${d.startAge}-${d.endAge}`).join(" | "));
console.log("months", months.map(x => `${x.m}:${x.pillar}:${JSON.stringify(x.favor)}`).join(" "));
