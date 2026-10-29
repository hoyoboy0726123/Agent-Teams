const root = process.argv[2], out = process.argv[3];
const { computeChart, fourPillars } = await import(`${root}/src/core/chart.js`);
const { findPlace } = await import(`${root}/src/core/places.js`);
const { analyse } = await import(`${root}/src/core/analysis.js`);
const { yearReading } = await import(`${root}/src/core/reading-year.js`);
const T = await import(`${root}/node_modules/tyme4ts/dist/lib/index.mjs`);
const fs = await import("node:fs");
const place = findPlace("臺北市"), base = { y: 1990, m: 6, d: 21, h: 12, mi: 0 };
const chart = computeChart({ date: { y: 1990, m: 6, d: 21 }, time: { h: 12, mi: 0 }, place, sex: "female", options: { solar: "true" } });
const a = analyse(chart.pillars.map(p => p.name));
const at = min => { const ms = Date.UTC(base.y, base.m - 1, base.d, base.h, base.mi) + min * 60000, t = new Date(ms);
  return fourPillars({ date: { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }, time: { h: t.getUTCHours(), mi: t.getUTCMinutes() }, place, options: { solar: "true" } }); };
const cur = at(0); let later = null, earlier = null;
for (let m = 1; m <= 180 && !later; m++) { const p = at(m); if (p.hour !== cur.hour) later = { min: m, hour: p.hour }; }
for (let m = 1; m <= 180 && !earlier; m++) { const p = at(-m); if (p.hour !== cur.hour) earlier = { min: m, hour: p.hour }; }
const past = []; for (let y = 2021; y <= 2025; y++) { const r = yearReading(chart, a, y - 1990); past.push({ year: y, pillar: r.pillar, tone: r.favor.tone, score: r.favor.score, headline: r.headline, domains: Object.fromEntries(Object.entries(r.domains).map(([k, v]) => [k, { level: v.level, text: v.text }])) }); }
const heat = []; for (let y = 2026; y <= 2035; y++) { const r = yearReading(chart, a, y - 1990); heat.push({ year: y, pillar: r.pillar, levels: Object.fromEntries(Object.entries(r.domains).map(([k, v]) => [k, v.level])) }); }
// The rest of 2026 and 小寒 2027: 立冬, 大雪 2026 and 小寒 2027 month pillars.
const months = [];
for (const [name, y] of [["立冬", 2026], ["大雪", 2026], ["小寒", 2027]]) {
  const t = T.SolarTerm.fromName(y, name), d = t.getJulianDay().getSolarDay();
  months.push({ name, date: `${d.getYear()}-${d.getMonth()}-${d.getDay()}`, pillar: d.getSixtyCycleDay().getMonth().getName() });
}
fs.writeFileSync(out, JSON.stringify({ cur, later, earlier, past, heat, months }, null, 1));
console.log(JSON.stringify({ cur, later, earlier, months }));
for (const p of past) console.log(p.year, p.pillar, p.tone, p.score, "|", p.headline, "|", Object.entries(p.domains).map(([k, v]) => `${k}${v.level}`).join(" "));
for (const h of heat) console.log(h.year, h.pillar, Object.entries(h.levels).map(([k, v]) => `${k}${v}`).join(" "));
