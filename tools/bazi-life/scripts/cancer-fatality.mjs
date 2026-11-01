// Solves CANCER_FATALITY in src/sim/rates.js: for each sex, the level α and age slope β of the cancer fatality that
// make the 2023 diagnoses (deaths from 死因統計 over the case fatality) reproduce 國健署's registry, both its
// age-standardised rate and its number of new cases. Prints the constants to paste into rates.js.
//   node scripts/cancer-fatality.mjs
import { incidence, CANCER_FATALITY, CANCER_2023, WHO_STANDARD as WHO } from "../src/sim/rates.js";
import { POPULATION_2024 as P } from "../src/sim/official-data.js";

const perYear = (sex, age) => { const g = P.ages.findLastIndex(a => a <= age), w = g + 1 < P.ages.length ? P.ages[g + 1] - P.ages[g] : 15; return P[sex][g] / w; };
export const asr = sex => WHO.reduce((s, [a, w]) => s + w / 100 * [0, 1, 2, 3, 4].reduce((t, d) => t + incidence("癌症", a + d, sex, 2023), 0) / 5, 0);
export const cases = sex => { let n = 0; for (let a = 0; a < 100; a++) n += perYear(sex, a) * incidence("癌症", a, sex, 2023); return n; };
const bisect = (f, lo, hi, n = 50) => { for (let i = 0; i < n; i++) { const mid = (lo + hi) / 2; if (f(mid)) lo = mid; else hi = mid; } return (lo + hi) / 2; };

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const sex of ["male", "female"]) {
    const fit = b => { CANCER_FATALITY[sex] = [0, b]; const a = bisect(x => { CANCER_FATALITY[sex][0] = x; return asr(sex) > CANCER_2023.asr[sex]; }, -3, 3); CANCER_FATALITY[sex] = [a, b]; };
    const b = bisect(x => { fit(x); return cases(sex) > CANCER_2023.cases[sex]; }, -1, 2);
    fit(b);
    console.log(`${sex}: [${CANCER_FATALITY[sex].map(v => v.toFixed(4)).join(", ")}]  asr ${(asr(sex) * 1e5).toFixed(1)}  cases ${Math.round(cases(sex))}`);
  }
}
