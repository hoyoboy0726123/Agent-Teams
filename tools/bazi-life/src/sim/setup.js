// From a computed chart to what the simulation needs: the chart reading and the luck of every year of life.
import { SixtyCycleYear } from "tyme4ts";
import { analyse } from "../core/analysis.js";
import { lifeLuck } from "../core/luck.js";
import { MAX_AGE } from "./life.js";

export function prepare(chart, { school = "blend" } = {}) {
  const natal = chart.pillars.map(p => p.name);
  const analysis = analyse(natal, { school });
  const decades = chart.luck.decades;
  const decadeAt = age => {
    if (age < decades[0].startAge) return null;
    const d = decades.find(x => age >= x.startAge && age <= x.endAge);
    return (d || decades[decades.length - 1]).name;
  };
  const yearAt = age => SixtyCycleYear.fromYear(chart.input.date.y + age - 1).getSixtyCycle().getName();
  const luck = lifeLuck(analysis, natal, chart.input.sex, decadeAt, yearAt, MAX_AGE);
  return { natal, analysis, luck };
}
