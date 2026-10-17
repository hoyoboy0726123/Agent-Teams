// 出生時間：可以填確切的時間，也可以選「午時」這樣的時辰（shichen.js）。
// One field per form, found by its id prefix: <p>-tmode-clock / <p>-tmode-shichen (the switch), <p>-time,
// <p>-shichen (the select) and <p>-nohour (時辰不詳).
import { shichenOptions, shichenTime } from "./core/shichen.js";

const el = (p, part) => document.getElementById(`${p}-${part}`);

// Shows the time box or the 時辰 list, and greys both out when the hour is unknown.
export function syncTimeField(p) {
  const byShichen = el(p, "tmode-shichen").checked, none = el(p, "nohour").checked;
  el(p, "time").hidden = byShichen;
  el(p, "shichen").hidden = !byShichen;
  el(p, "time").disabled = none;
  el(p, "shichen").disabled = none;
}

export function initTimeField(p) {
  el(p, "shichen").innerHTML = shichenOptions();
  for (const part of ["tmode-clock", "tmode-shichen", "nohour"]) el(p, part).addEventListener("change", () => syncTimeField(p));
  syncTimeField(p);
}

// The birth time the field says: { time } with time null when unknown, or { error }.
export function readTimeField(p) {
  if (el(p, "nohour").checked) return { time: null };
  if (el(p, "tmode-shichen").checked) {
    const time = shichenTime(el(p, "shichen").value);
    return time ? { time } : { error: "請選出生的時辰，或勾選「時辰不詳」。" };
  }
  const [h, mi] = (el(p, "time").value || "").split(":").map(Number);
  if (!Number.isFinite(h)) return { error: "請輸入出生時間，或改選時辰、勾選「時辰不詳」。" };
  return { time: { h, mi: Number.isFinite(mi) ? mi : 0 } };
}

// Back to a clock time (an example on the chart page sets one).
export function useClockTime(p) {
  el(p, "tmode-clock").checked = true;
  syncTimeField(p);
}

// The ids a saved draft keeps for this field.
export const timeFieldIds = p => [`${p}-tmode-clock`, `${p}-tmode-shichen`, `${p}-time`, `${p}-shichen`, `${p}-nohour`];
