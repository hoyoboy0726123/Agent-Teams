// A stand-in for src/astro/index.js while the chart engine is not in, for the engine tests only: a prepareChart with
// the seam's shape (PLAN.md "The seam") whose numbers come from the birth date, not from any astronomy.
const DOMAINS = ["career", "wealth", "love", "health", "study", "family", "move"];
const CHANNELS = ["good", "bad", "change"];

export function prepareChart(input) {
  const { y, m, d } = input.date;
  const seed = y * 372 + m * 31 + d;
  const wave = (age, k) => Math.sin(seed * 0.37 + k * 1.7 + age * (0.21 + 0.03 * k));
  const luck = [];
  for (let age = 0; age <= 110; age++) {
    const mm = {};
    DOMAINS.forEach((dom, i) => { mm[dom] = {}; CHANNELS.forEach((c, j) => { mm[dom][c] = 0.45 * wave(age, i * 3 + j); }); });
    const L = Math.max(-1, Math.min(1, wave(age, 30)));
    const reasons = age === 29 || age === 30 ? [{ domains: ["career", "love"], text: "Your Saturn return asks what you are building" }] : [{ domains: [DOMAINS[age % 7]], text: `The year activates your ${(age % 12) + 1}th house` }];
    luck.push({ age, L, score: Math.round(50 + 30 * L), m: mm, reasons });
  }
  const traits0 = { drive: 0.5 + 0.1 * wave(1, 40), caution: 0.5 + 0.1 * wave(2, 41), warmth: 0.5 + 0.1 * wave(3, 42), curiosity: 0.5 + 0.1 * wave(4, 43), health: 0.5 + 0.1 * wave(5, 44) };
  const favored = (seed % 12) + 1;
  const jobFit = job => (job.house === favored ? 0.8 : (job.houses || []).includes(favored) ? 0.4 : -0.1);
  return { chart: { input, favored }, luck, traits0, jobFit, intro: "Sun in Leo, Moon in Pisces, Scorpio rising" };
}
