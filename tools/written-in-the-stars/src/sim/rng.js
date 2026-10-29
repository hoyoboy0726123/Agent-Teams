// Seeded random numbers, so a life can be replayed exactly and "same chart, 100 runs" is reproducible.

// mulberry32
export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = n => Math.floor(next() * n);
  next.pick = list => list[Math.floor(next() * list.length)];
  next.chance = p => next() < p;
  next.between = (a, b) => a + (b - a) * next();
  // Standard normal (Box–Muller).
  next.normal = () => {
    let u = 0;
    while (u === 0) u = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  // Pick by weight: [[item, weight], …]
  next.weighted = pairs => {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let x = next() * total;
    for (const [item, w] of pairs) { x -= w; if (x < 0) return item; }
    return pairs[pairs.length - 1][0];
  };
  return next;
}

// FNV-1a, for turning a chart and a run number into a seed.
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
