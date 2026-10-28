// Words for the story: lists, how family members are called, articles, and the opening line at birth.
import { placeLabel } from "./world.js";

// "Mom", "Mom and Dad", "Mom, Dad, and Grandma" (the serial comma, as most American style guides have it).
export const listWords = items => (items.length <= 1 ? items.join("") : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`);

// How the family calls someone: the first name of a full name ("Jane Doe" → "Jane"). A single name stays as it is.
export function callName(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  return parts[0] || "";
}

// "a nurse", "an engineer", "an HR specialist", "a union rep".
export function an(word) {
  const w = String(word || "").trim();
  const letters = /^(?:hour|honest|heir|HR\b|EMT|MBA|RN\b|LPN|HVAC|FBI|MRI|X-ray|NFL|NBA|SAT|ACT|F\b|L\b|M\b|N\b|S\b|X\b)/;
  const youSound = /^(?:uni|use|usu|ur[aeiou]|euro|one\b|once)/i;
  const vowel = /^[aeiou]/i.test(w) && !youSound.test(w);
  return `${vowel || letters.test(w) ? "an" : "a"} ${w}`;
}

// "your brother Mike", or "your older sister" when the name is not known.
export const siblingCall = x => `your ${x.short || x.label}${x.name ? ` ${callName(x.name)}` : ""}`;
const COUNT = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const plural = label => (/s$/.test(label) ? label : `${label}s`);
// Siblings for a sentence: named ones by name, the others counted ("your sister Amy and two older brothers").
export function siblingWords(list) {
  const named = list.filter(x => x.name).map(siblingCall);
  const counts = new Map();
  for (const x of list.filter(x => !x.name)) counts.set(x.label, (counts.get(x.label) || 0) + 1);
  return listWords([...named, ...[...counts].map(([label, n]) => (n === 1 ? an(label) : `${COUNT[n] || n} ${plural(label)}`))]);
}

// The opening line at birth: when, where, who, and the chart in one line (prep.intro).
export function birthText(s, prep = null) {
  const where = placeLabel(s) || (prep && prep.input && prep.input.place && prep.input.place.name) || "the United States";
  const kid = s.sex === "female" ? "girl" : "boy";
  const named = s.name ? ` named ${callName(s.name)}` : "";
  const parents = [s.father.name && `Your dad is ${callName(s.father.name)}`, s.mother.name && `your mom is ${callName(s.mother.name)}`].filter(Boolean).join(", and ");
  const older = s.siblings.list.filter(x => x.older).sort((a, b) => a.bornAt - b.bornAt);
  const family = (parents ? ` ${parents}.` : "") + (older.length ? ` Waiting at home: ${siblingWords(older)}.` : "");
  const intro = prep && prep.intro ? ` ${prep.intro.replace(/[.\s]+$/, "")}.` : "";
  return `You were born in ${where} in ${s.birthYear}, a baby ${kid}${named}.${family}${intro}`;
}
