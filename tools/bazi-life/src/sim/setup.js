// From a computed chart (and the optional name and family) to what the simulation needs.
import { SixtyCycleYear } from "tyme4ts";
import { analyse } from "../core/analysis.js";
import { lifeLuck } from "../core/luck.js";
import { analyseName } from "../core/name.js";
import { buildFamily } from "../core/family.js";
import { MAX_AGE } from "./life.js";

export function prepare(chart, { school = "blend", name = "", family = null } = {}) {
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
  const nameInfo = name ? analyseName(name, analysis) : null;
  const familyInfo = family ? buildFamily(family, { pillars: natal, analysis }, chart.input.place) : null;
  return { natal, analysis, luck, name: nameInfo && !nameInfo.error ? nameInfo : null, nameError: nameInfo && nameInfo.error ? nameInfo.error : null, family: familyInfo };
}
