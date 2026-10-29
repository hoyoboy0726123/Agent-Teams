// 家人的出生時間：時辰不詳、填確切時間，或直接選「午時」這樣的時辰（shichen.js）。
// Each family row has <select class="m-hour"> and <input type="time" class="m-time">; the time box shows only when
// 填確切時間 is picked.
import { SHICHEN, shichenTime } from "./core/shichen.js";

const OPTIONS = `<option value="" data-en="Unknown">時辰不詳</option><option value="clock">填確切時間</option><optgroup label="時辰">${SHICHEN.map(s => `<option value="${s.key}">${s.short}</option>`).join("")}</optgroup>`;

// The hour part of a family row built in script; `who` names the person for screen readers.
export const memberHourHTML = who => `<select class="m-hour" aria-label="${who}的出生時辰">${OPTIONS}</select><input type="time" class="m-time" aria-label="${who}的出生時間" hidden>`;

export function syncMemberHour(row) {
  row.querySelector(".m-time").hidden = row.querySelector(".m-hour").value !== "clock";
}

// Fills the lists already in the page and keeps each time box in step with its list, rows added later included.
export function initMemberHours(root) {
  for (const s of root.querySelectorAll(".m-hour")) if (!s.options.length) s.innerHTML = OPTIONS;
  root.addEventListener("change", e => { if (e.target.matches(".m-hour")) syncMemberHour(e.target.closest(".member")); });
  syncMemberHours(root);
}
export function syncMemberHours(root) {
  for (const row of root.querySelectorAll(".member")) if (row.querySelector(".m-hour")) syncMemberHour(row);
}

// { hour, time } for a saved draft, and back. A draft from before the list had only the time box: a time there means
// 填確切時間.
export const memberHourValue = row => ({ hour: row.querySelector(".m-hour").value, time: row.querySelector(".m-time").value });
export function setMemberHour(row, m) {
  const select = row.querySelector(".m-hour"), hour = typeof m.hour === "string" ? m.hour : m.time ? "clock" : "";
  select.value = [...select.options].some(o => o.value === hour) ? hour : "";
  row.querySelector(".m-time").value = m.time || "";
  syncMemberHour(row);
}

// The birth time the row says: { h, mi } for a time, { h, mi, branch } for a 時辰, null when it is not known.
export function readMemberHour(row) {
  const hour = row.querySelector(".m-hour").value;
  if (hour !== "clock") return shichenTime(hour);
  const [h, mi] = (row.querySelector(".m-time").value || "").split(":").map(Number);
  return Number.isFinite(h) ? { h, mi: Number.isFinite(mi) ? mi : 0 } : null;
}
