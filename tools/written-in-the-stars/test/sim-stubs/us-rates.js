// A stand-in for src/data/us-rates.js while the data track is not in, for the engine tests only. Same export names and
// shapes as bazi-life's official-data.js; the numbers are synthetic (a Gompertz–Makeham life table near US levels), not
// statistics.
const AGES = 85;
function table(year, sex) {
  const t = (year - 1950) / 75;                       // 0 in 1950, 1 in 2025
  const infant = (sex === "male" ? 0.034 : 0.027) * (1 - t) + (sex === "male" ? 0.006 : 0.005) * t;
  const b = (sex === "male" ? 9e-5 : 5e-5) * (1 - 0.55 * t), c = 0.088, makeham = 0.0008 * (1 - 0.5 * t);
  const q = [];
  for (let x = 0; x < 121; x++) q.push(x === 0 ? infant : Math.min(1, x === 120 ? 1 : 1 - Math.exp(-(makeham + b * Math.exp(c * x)))));
  return q;
}
function expectancy(q, from = 0) {
  let l = 1, e = 0;
  for (let x = from; x < q.length; x++) { const d = l * q[x]; e += l - d / 2; l -= d; }
  return e;
}
const row = year => {
  const m = table(year, "male"), f = table(year, "female");
  const cut = q => q.slice(0, AGES).map(v => Math.round(v * 1e6));
  return [year, cut(m), cut(f), [expectancy(m), expectancy(f)], [expectancy(m, AGES), expectancy(f, AGES)]];
};
export const LIFE_TABLES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020, 2023].map(row);

export const CAUSE_AGES = [0, 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
const shape = (peak, at, width, floor) => CAUSE_AGES.map(a => Math.round(1e4 * (floor + peak * Math.exp(-(((a - at) / width) ** 2)))));
const causes = (k = 1) => ({ cancer: shape(0.3 * k, 62, 22, 0.02), heart: shape(0.22, 85, 25, 0.02), stroke: shape(0.07, 85, 20, 0.005) });
export const CAUSE_SHARES = [[1990, { male: causes(1.05), female: causes(0.95) }], [2020, { male: causes(0.95), female: causes(0.9) }]];

export const CHRONIC_AGES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85];
const rising = (top, mid) => CHRONIC_AGES.map(a => Math.round(1e5 * top / (1 + Math.exp(-(a - mid) / 9))));
export const CHRONIC_RATES = {
  male: { hypertension: rising(0.65, 55), diabetes: rising(0.25, 60) },
  female: { hypertension: rising(0.62, 58), diabetes: rising(0.22, 62) },
};
