// 時辰：用「午時」這樣的時辰代替確切的時間。
// Each choice gives the middle of its two hours as the time, with the branch, so the chart engine draws the day and
// hour pillars from that 時辰 as it is (chart.js). 子時 crosses midnight, so it is offered twice: the hour after
// midnight at the start of the date, and the hour before midnight at its end.

export const SHICHEN = [
  { key: "zi-am", branch: "子", h: 0, mi: 30, label: "子時（00:00–00:59，凌晨）" },
  { key: "chou", branch: "丑", h: 2, mi: 0, label: "丑時（01:00–02:59）" },
  { key: "yin", branch: "寅", h: 4, mi: 0, label: "寅時（03:00–04:59）" },
  { key: "mao", branch: "卯", h: 6, mi: 0, label: "卯時（05:00–06:59）" },
  { key: "chen", branch: "辰", h: 8, mi: 0, label: "辰時（07:00–08:59）" },
  { key: "si", branch: "巳", h: 10, mi: 0, label: "巳時（09:00–10:59）" },
  { key: "wu", branch: "午", h: 12, mi: 0, label: "午時（11:00–12:59）" },
  { key: "wei", branch: "未", h: 14, mi: 0, label: "未時（13:00–14:59）" },
  { key: "shen", branch: "申", h: 16, mi: 0, label: "申時（15:00–16:59）" },
  { key: "you", branch: "酉", h: 18, mi: 0, label: "酉時（17:00–18:59）" },
  { key: "xu", branch: "戌", h: 20, mi: 0, label: "戌時（19:00–20:59）" },
  { key: "hai", branch: "亥", h: 22, mi: 0, label: "亥時（21:00–22:59）" },
  { key: "zi-pm", branch: "子", h: 23, mi: 30, label: "子時（23:00–23:59，深夜）" },
];

// The birth time of a 時辰 choice: { h, mi, branch }, or null for an unknown key.
export function shichenTime(key) {
  const s = SHICHEN.find(x => x.key === key);
  return s ? { h: s.h, mi: s.mi, branch: s.branch } : null;
}

// <option>s for a select, 午時 chosen unless another key is given.
export const shichenOptions = (selected = "wu") => SHICHEN.map(s => `<option value="${s.key}"${s.key === selected ? " selected" : ""}>${s.label}</option>`).join("");

// How a birth time reads: 「午時」 for a 時辰, 「12:05」 for a clock time.
export const timeText = t => (t ? (t.branch ? `${t.branch}時` : `${String(t.h).padStart(2, "0")}:${String(t.mi).padStart(2, "0")}`) : "");
