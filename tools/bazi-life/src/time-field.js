// 出生時間：可以填確切的時間，也可以選「午時」這樣的時辰（shichen.js）。
// One field per form, found by its id prefix: <p>-tmode-clock / <p>-tmode-shichen (the switch), <p>-time,
// <p>-shichen (the select) and <p>-nohour (時辰不詳). A form may also have <p>-latezi (夜子時, in <p>-latezi-wrap).
import { shichenOptions, shichenTime } from "./core/shichen.js";
import { fourPillars } from "./core/chart.js";
import { findPlace } from "./core/places.js";

const el = (p, part) => document.getElementById(`${p}-${part}`);

// 夜子時 matters only when it changes the day pillar: the late 子時 chosen, or a birth whose true solar time falls after
// 23:00. Summer time and places far from their zone's meridian (烏魯木齊 01:30 is 23:24 the evening before) move that a
// long way from the clock, so the form's own date and place decide; without them, a clock time from 22:00 to 00:59.
function nearMidnight(p) {
  if (el(p, "nohour").checked) return false;
  if (el(p, "tmode-shichen").checked) return el(p, "shichen").value === "zi-pm";
  const clock = el(p, "time").value || "";   // "" would split into [0], i.e. midnight
  const [h, mi] = clock.split(":").map(Number);
  if (!clock || !Number.isFinite(h)) return false;
  const [y, m, d] = ((el(p, "date") || {}).value || "").split("-").map(Number), place = el(p, "place") && findPlace(el(p, "place").value);
  if (place && y >= 1801 && y <= 2199 && m && d) {
    try {
      const at = zi => fourPillars({ date: { y, m, d }, time: { h, mi: Number.isFinite(mi) ? mi : 0 }, place, options: { solar: "true", zi } }).day;
      return at("early") !== at("late");
    } catch { /* an impossible date: fall back to the clock */ }
  }
  return h === 22 || h === 23 || h === 0;
}

// Shows the time box or the 時辰 list, and greys both out when the hour is unknown.
export function syncTimeField(p) {
  const byShichen = el(p, "tmode-shichen").checked, none = el(p, "nohour").checked;
  el(p, "time").hidden = byShichen;
  el(p, "shichen").hidden = !byShichen;
  el(p, "time").disabled = none;
  el(p, "shichen").disabled = none;
  if (el(p, "latezi-wrap")) el(p, "latezi-wrap").hidden = !nearMidnight(p);
}

export function initTimeField(p) {
  el(p, "shichen").innerHTML = shichenOptions();
  for (const part of ["tmode-clock", "tmode-shichen", "nohour", "time", "shichen"]) el(p, part).addEventListener("change", () => syncTimeField(p));
  el(p, "time").addEventListener("input", () => syncTimeField(p));
  for (const part of ["date", "place"]) if (el(p, part)) el(p, part).addEventListener("change", () => syncTimeField(p));
  syncTimeField(p);
}

// The birth time the field says: { time, zi } with time null when unknown (zi: the 子時 rule, "late" only when 夜子時 is
// ticked near midnight), or { error }.
export function readTimeField(p) {
  if (el(p, "nohour").checked) return { time: null, zi: "early" };
  const zi = el(p, "latezi") && nearMidnight(p) && el(p, "latezi").checked ? "late" : "early";
  if (el(p, "tmode-shichen").checked) {
    const time = shichenTime(el(p, "shichen").value);
    return time ? { time, zi } : { error: "請選出生的時辰，或勾選「時辰不詳」。" };
  }
  const clock = el(p, "time").value || "";
  const [h, mi] = clock.split(":").map(Number);
  if (!clock || !Number.isFinite(h)) return { error: "請輸入出生時間，或改選時辰、勾選「時辰不詳」。" };
  return { time: { h, mi: Number.isFinite(mi) ? mi : 0 }, zi };
}

// Back to a clock time (an example on the chart page sets one).
export function useClockTime(p) {
  el(p, "tmode-clock").checked = true;
  syncTimeField(p);
}

// The ids a saved draft keeps for this field.
export const timeFieldIds = p => [`${p}-tmode-clock`, `${p}-tmode-shichen`, `${p}-time`, `${p}-shichen`, `${p}-nohour`, `${p}-latezi`];
