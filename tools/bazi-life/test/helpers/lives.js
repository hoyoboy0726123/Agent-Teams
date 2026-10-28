// Seeded lives for the language tests: random births 1950–2025 across Taiwan, some with a name, choices answered at
// random (sometimes by a general action, sometimes "skip to the end"). Everything a reader sees is collected: each log
// entry and each question with its buttons, so two runs can be compared line by line.
import { computeChart } from "../../src/core/chart.js";
import { PLACE_GROUPS } from "../../src/core/places.js";
import { prepare } from "../../src/sim/setup.js";
import { createLife } from "../../src/sim/life.js";
import { makeRng } from "../../src/sim/rng.js";
import { randomName } from "../../src/sim/random-name.js";
import { ACTION_IDS } from "../../src/sim/actions.js";

const TAIWAN = PLACE_GROUPS.filter(g => g.group.startsWith("臺灣・")).map(g => g.places[0]);

// One life, i of a run seeded `seed`: { life, seen } where seen lists what the reader saw, in order.
export function seededLife(seed, i, extra = {}) {
  const rng = makeRng(seed * 7919 + i);
  const y = 1950 + rng.int(76), m = 1 + rng.int(12), d = 1 + rng.int(28), sex = rng() < 0.5 ? "male" : "female";
  const chart = computeChart({ date: { y, m, d }, time: { h: rng.int(24), mi: rng.int(60) }, place: rng.pick(TAIWAN), sex });
  const named = rng() < 0.3 ? randomName(rng, y, sex) : "";
  const prep = prepare(chart, { name: named });
  const name = prep.name || (named ? { full: named, effects: null } : null);
  const life = createLife({ chart, analysis: prep.analysis, luck: prep.luck, seed: seed * 1000 + i, name, ...extra });
  const seen = [];
  let shown = 0, guard = 0;
  const flush = () => { for (; shown < life.log.length; shown++) { const e = life.log[shown]; seen.push({ kind: "line", age: e.age, id: e.id, text: e.text, choice: e.choice, reason: e.reason, mood: e.mood, big: e.big }); } };
  while (!life.done && guard++ < 6000) {
    const p = life.pending;
    if (p) {
      flush();
      seen.push({ kind: "ask", id: p.id, prompt: p.prompt, options: p.options.map(o => [o.id, o.label, o.hint, o.lean]) });
      const r = rng();
      if (r < 0.15) {
        const out = life.chooseAction({ action: rng.pick(ACTION_IDS), summary: "你決定照自己的想法做" });
        if (out.infeasible) life.choose(rng.int(p.options.length));
      } else if (r < 0.2) life.autoChoose();
      else life.choose(rng.int(p.options.length));
    } else life.step();
  }
  flush();
  return { life, seen };
}
