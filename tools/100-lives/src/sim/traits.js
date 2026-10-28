// Personality: it starts from the chart (prep.traits0) and is slowly shaped by a lifetime of choices.
//
// Five traits in 0–1: drive, caution, warmth, health (looking after the body), curiosity. They steer how the auto
// player answers choices in the 100 reruns, so the same chart lives like the same person, and a few story events
// look at them. The chart engine keeps traits0 near 0.5 on average, so a population averages out to the base rates;
// each life adds its own spread (0.12) around it.
import { TRAITS } from "./seam.js";

const clamp = v => Math.max(0.05, Math.min(0.95, v));

export function initTraits(traits0, rng) {
  const t = {};
  for (const k of TRAITS) t[k] = clamp((traits0 && Number.isFinite(traits0[k]) ? traits0[k] : 0.5) + 0.12 * rng.normal());
  return t;
}

export function nudge(s, key, delta) {
  if (s.traits && key in s.traits) s.traits[key] = clamp(s.traits[key] + delta);
}

// How strongly the auto player leans toward an option, from the option's style. About 1 for an average person.
//   risk    bold moves (a startup, quitting, moving abroad)   safe    keeping things as they are
//   family  putting family first                               self    putting yourself first
//   health  looking after the body                             social  reaching out to people
//   learn   studying, trying something new
export function styleWeight(traits, style) {
  if (!traits || !style) return 1;
  const t = traits;
  const f = {
    risk: (0.6 + 0.8 * t.drive) * (1.4 - 0.8 * t.caution),
    safe: (0.6 + 0.8 * t.caution) * (1.4 - 0.8 * t.drive),
    family: 0.6 + 0.8 * t.warmth,
    self: 1.4 - 0.8 * t.warmth,
    health: 0.6 + 0.8 * t.health,
    social: 0.7 + 0.6 * t.warmth,
    learn: 0.6 + 0.8 * t.curiosity,
  }[style];
  return f ?? 1;
}

// A word for the story: "ever the careful one" → traitWord gives "careful".
export const TRAIT_WORDS = { drive: "driven", caution: "careful", warmth: "warm-hearted", curiosity: "curious", health: "health-minded" };
export function traitWord(traits) {
  if (!traits) return "";
  const top = Object.entries(TRAIT_WORDS).sort((a, b) => traits[b[0]] - traits[a[0]])[0];
  return top[1];
}
