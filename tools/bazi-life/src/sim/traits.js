// 個性：從日主出發，再被一生的選擇慢慢改變。
//
// Five traits in 0–1: drive (進取), caution (謹慎), warmth (重感情), health (顧身體), curiosity (好奇).
// They steer how the auto player answers choices in the 100 reruns, so the same chart lives like the same person,
// and a few story events look at them. Each starts near 0.5, so a population averages out to the base rates.
const BY_STEM = {
  甲: { drive: 0.62, caution: 0.45, warmth: 0.5, curiosity: 0.5 },
  乙: { drive: 0.45, caution: 0.5, warmth: 0.62, curiosity: 0.55 },
  丙: { drive: 0.62, caution: 0.38, warmth: 0.62, curiosity: 0.58 },
  丁: { drive: 0.45, caution: 0.58, warmth: 0.62, curiosity: 0.5 },
  戊: { drive: 0.5, caution: 0.62, warmth: 0.5, curiosity: 0.4 },
  己: { drive: 0.45, caution: 0.58, warmth: 0.6, curiosity: 0.42 },
  庚: { drive: 0.66, caution: 0.42, warmth: 0.55, curiosity: 0.45 },
  辛: { drive: 0.5, caution: 0.6, warmth: 0.45, curiosity: 0.55 },
  壬: { drive: 0.55, caution: 0.38, warmth: 0.5, curiosity: 0.66 },
  癸: { drive: 0.42, caution: 0.5, warmth: 0.6, curiosity: 0.62 },
};
const clamp = v => Math.max(0.05, Math.min(0.95, v));

export function initTraits(analysis, rng) {
  const base = BY_STEM[analysis.dayMaster.stem] || {};
  const t = {};
  for (const k of ["drive", "caution", "warmth", "health", "curiosity"]) t[k] = clamp((base[k] ?? 0.5) + 0.12 * rng.normal());
  return t;
}

export function nudge(s, key, delta) {
  if (s.traits && key in s.traits) s.traits[key] = clamp(s.traits[key] + delta);
}

// How strongly the auto player leans toward an option, from the option's style. About 1 for an average person.
//   risk    bold moves (創業, 辭職, 出國)        safe    keeping things as they are
//   family  putting family first             self    putting yourself first
//   health  looking after the body           social  reaching out to people
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

// A few words for the story: 「一向謹慎的你」
export function traitWord(traits) {
  if (!traits) return "";
  const top = Object.entries({ drive: "有衝勁", caution: "謹慎", warmth: "重感情", curiosity: "好奇心重", health: "注重健康" }).sort((a, b) => traits[b[0]] - traits[a[0]])[0];
  return top[1];
}
