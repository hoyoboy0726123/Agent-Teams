// From a computed chart (and the optional name and family) to what the simulation needs.
import { SixtyCycleYear } from "tyme4ts";
import { analyse } from "../core/analysis.js";
import { lifeLuck } from "../core/luck.js";
import { analyseName } from "../core/name.js";
import { buildFamily } from "../core/family.js";
import { MAX_AGE } from "./life.js";
import { surnameIn } from "./people.js";

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
  // lifeLuck counts 虛歲 (the birth year is 1); the simulation counts years since birth (the birth year is 0), so
  // each entry is re-keyed: luck[age] is the year the person is `age`, with its 虛歲 kept as `xu`.
  const luck = lifeLuck(analysis, natal, chart.input.sex, decadeAt, yearAt, MAX_AGE + 1).map(e => ({ ...e, age: e.age - 1, xu: e.age }));
  // A nickname (小美, 阿明, 美美: no surname to read, people.js surnameIn) stays in the story but is not read by 姓名學,
  // which would take 小 or 阿 for a surname (the 合婚 tab's nickname reaches here through 用這對伴侶過一生).
  const nickname = !!name && !surnameIn(name);
  const nameInfo = name && !nickname ? analyseName(name, analysis) : null;
  // The protagonist's sex gives a partner without one the opposite sex.
  const familyInfo = family ? buildFamily(family, { pillars: natal, analysis, sex: chart.input.sex }, chart.input.place) : null;
  const nameError = nickname ? "這看起來是暱稱，姓名學要用含姓氏的本名才能算。" : nameInfo && nameInfo.error ? nameInfo.error : null;
  return { natal, analysis, luck, name: nameInfo && !nameInfo.error ? nameInfo : null, nameError, family: familyInfo };
}
