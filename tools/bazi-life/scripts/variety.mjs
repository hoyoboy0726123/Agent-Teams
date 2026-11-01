// How varied the simulated lives read: options per choice, choices per life, and how often the same sentence
// comes back, within one life and across lives. Lives get random births 1950–2025 and random answers.
//
//   node scripts/variety.mjs [lives=300]
import { computeChart } from "../src/core/chart.js";
import { PLACE_GROUPS } from "../src/core/places.js";
import { prepare } from "../src/sim/setup.js";
import { createLife } from "../src/sim/life.js";
import { makeRng } from "../src/sim/rng.js";

const N = Number(process.argv[2] || 300);
const rng = makeRng(20261016);
const TAIWAN = PLACE_GROUPS.filter(g => g.group.startsWith("臺灣・")).map(g => g.places[0]);
const lives = [], options = [];
for (let i = 0; i < N; i++) {
  const y = 1950 + rng.int(76), m = 1 + rng.int(12), d = 1 + rng.int(28);
  const chart = computeChart({ date: { y, m, d }, time: { h: rng.int(24), mi: rng.int(60) }, place: rng.pick(TAIWAN), sex: rng() < 0.5 ? "male" : "female" });
  const prep = prepare(chart);
  const life = createLife({ chart, analysis: prep.analysis, luck: prep.luck, seed: 1000 + i });
  let guard = 0;
  while (!life.done && guard++ < 6000) {
    if (life.pending) { options.push(life.pending.options.length); life.choose(rng.int(life.pending.options.length)); }
    else life.step();
  }
  lives.push(life);
}

const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const pct = x => `${(x * 100).toFixed(1)}%`;
const texts = lives.map(l => l.log.filter(e => e.id !== "birth" && e.id !== "death").map(e => e.text));
const inLives = new Map();
for (const t of texts) for (const x of new Set(t)) inLives.set(x, (inLives.get(x) || 0) + 1);
let overlap = 0, pairs = 0;
for (let i = 0; i < Math.min(N, 150); i++) for (let j = i + 1; j < Math.min(N, 150); j++) {
  const a = new Set(texts[i]), b = new Set(texts[j]);
  const shared = [...a].filter(x => b.has(x)).length, all = new Set([...a, ...b]).size;
  if (all) { overlap += shared / all; pairs++; }
}
const repeated = mean(texts.map(t => { const seen = new Set(); let r = 0; for (const x of t) { if (seen.has(x)) r++; seen.add(x); } return t.length ? r / t.length : 0; }));
const stock = mean(texts.map(t => (t.length ? t.filter(x => inLives.get(x) >= N / 2).length / t.length : 0)));
const kinds = new Set(lives.flatMap(l => l.log.map(e => e.id)));

console.log(`${N} lives, average age ${mean(lives.map(l => l.state.age)).toFixed(1)}`);
console.log(`lines per life        ${mean(texts.map(t => t.length)).toFixed(1)}`);
console.log(`choices per life      ${mean(lives.map(l => l.log.filter(e => e.choice).length)).toFixed(1)}`);
console.log(`options per choice    ${mean(options).toFixed(2)}`);
console.log(`kinds of events seen  ${kinds.size}`);
console.log(`different sentences   ${inLives.size}`);
console.log(`repeated in one life  ${pct(repeated)}`);
console.log(`shared by two lives   ${pct(overlap / pairs)}`);
console.log(`in half of all lives  ${pct(stock)}`);
console.log("most common sentences (lives):");
for (const [x, n] of [...inLives].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(4)}  ${x}`);
