// Wall-clock time at a birthplace ⇄ the physical instant (UTC).
//
// Uses the IANA time zone database that ships with the JavaScript engine (Intl), so historical changes are
// handled: Taiwan's UTC+9 war time (1937-10-01 to 1945-09-21), its summer time (1946–61, 1974–75, 1979),
// China's summer time (1986–91), local mean time before standard time existed, and so on.

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const formatters = new Map();

function formatter(tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", era: "short",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isTimeZone(tz) {
  try { formatter(tz); return true; } catch { return false; }
}

// Calendar fields → milliseconds, reading the fields as UTC. Safe for years 0–99, unlike Date.UTC.
export function fieldsToMs({ y, m, d, h = 0, mi = 0, s = 0 }) {
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d);
  t.setUTCHours(h, mi, s, 0);
  return t.getTime();
}

export function msToFields(ms) {
  const t = new Date(ms);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds() };
}

// The wall-clock fields shown in `tz` at instant `ms`.
export function fieldsAt(ms, tz) {
  const p = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(ms))) p[type] = value;
  const y = p.era === "BC" || p.era === "B" ? 1 - Number(p.year) : Number(p.year);
  return { y, m: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute), s: Number(p.second) };
}

// UTC offset of `tz` at instant `ms`, in minutes (fractional before standard time, e.g. Taipei LMT +8:06).
export function offsetAt(ms, tz) {
  const whole = Math.floor(ms / 1000) * 1000;
  return (fieldsToMs(fieldsAt(whole, tz)) - whole) / MINUTE;
}

// Resolve a wall-clock reading at a place to instants.
//   status "ok"        → one instant
//   status "ambiguous" → the reading happened twice (clocks were set back); both instants, earlier first
//   status "gap"       → the reading never happened (clocks jumped forward); the instant is computed with the
//                        offset in force just before the jump, i.e. as if the reading were in standard time
export function resolveWallTime(wall, tz) {
  const local = fieldsToMs(wall);
  const offsets = [...new Set([-DAY, -HOUR * 6, 0, HOUR * 6, DAY].map(dt => offsetAt(local + dt, tz)))];
  const instants = offsets
    .map(o => local - o * MINUTE)
    .filter(ms => fieldsToMs(fieldsAt(ms, tz)) === local)
    .sort((a, b) => a - b)
    .filter((ms, i, a) => i === 0 || ms !== a[i - 1]);
  if (instants.length === 1) return { status: "ok", instants };
  if (instants.length > 1) return { status: "ambiguous", instants };
  const before = offsetAt(local - DAY, tz), after = offsetAt(local + DAY, tz);
  return { status: "gap", instants: [local - before * MINUTE], skipped: after - before };
}

// Facts about the clock at that instant and place that a person should know when reading the chart.
// Lowest offset within a year before (side −1) or after (side +1) an instant, sampled every 10 days.
function lowestOffset(ms, tz, side) {
  let low = Infinity;
  for (let k = 1; k <= 37; k++) low = Math.min(low, offsetAt(ms + side * k * 10 * DAY, tz));
  return low;
}

// Summer time is ahead of the clock both in the year before and in the year after. That tells it apart from a
// permanent change of standard time, such as Taiwan's switch to UTC+9 in 1937 and back in 1945.
export function clockNotes(ms, tz) {
  const notes = [];
  const offset = offsetAt(ms, tz);
  const before = lowestOffset(ms, tz, -1), after = lowestOffset(ms, tz, 1);
  const now = Date.now();
  const nowStd = Math.min(offsetAt(now, tz), lowestOffset(now, tz, -1), lowestOffset(now, tz, 1));
  let dst = 0;
  if (!Number.isInteger(offset) || offset % 15 !== 0) {
    notes.push({ kind: "lmt", text: `當時這裡還沒有標準時間，用的是地方平時（UTC${formatOffset(offset)}）。` });
  } else if (offset > before && offset > after) {
    dst = offset - Math.max(before, after);
    notes.push({ kind: "dst", text: `當時實施日光節約時間，時鐘比標準時間快 ${Math.round(dst)} 分鐘，已自動扣除。` });
  } else if (offset !== nowStd) {
    notes.push({ kind: "standard", text: `當時的標準時間是 UTC${formatOffset(offset)}，和現在的 UTC${formatOffset(nowStd)} 不同，已自動換算。` });
  }
  return { offset, dst, notes };
}

export function formatOffset(min) {
  const sign = min < 0 ? "−" : "+";
  const total = Math.round(Math.abs(min) * 60);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}${s ? ":" + String(s).padStart(2, "0") : ""}`;
}

export function formatFields({ y, m, d, h, mi, s }, withSeconds = false) {
  const p = n => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(d)} ${p(h)}:${p(mi)}${withSeconds ? ":" + p(s) : ""}`;
}

export { MINUTE, HOUR, DAY };
