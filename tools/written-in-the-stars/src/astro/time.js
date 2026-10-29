// Wall-clock birth time at a place → the physical instant (UTC).
//
// Uses the IANA time zone database that ships with the JavaScript engine (Intl.DateTimeFormat), so US history is
// handled with no time zone library: the 1974–75 year-round DST, Arizona without DST since 1968, most of Indiana
// without DST 1971–2005, the 2007 change of DST dates, Hawaii's UTC−10:30 before 1947, local mean time before 1883.
//
// Two readings of a wall clock need a rule, and both follow Python's zoneinfo with fold=0 (the fixtures check it):
//   ambiguous  the fall-back hour (1:30 am happened twice): the EARLIER instant, i.e. still daylight time.
//              Most hospital records that do not say otherwise were written before the change.
//   gap        the spring-forward hour (2:30 am never happened): read with the offset in force just BEFORE the
//              jump (standard time), so 2:30 am becomes the instant the clocks showed 3:30 am.
// Unknown birth time: noon local time, with timeKnown false (the chart then has no Ascendant, MC or houses).

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

// Calendar fields read as UTC → milliseconds (safe for any year, unlike Date.UTC for years 0–99).
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
  return { y, m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second) };
}

// UTC offset of `tz` at instant `ms`, in minutes (fractional before standard time, e.g. local mean time).
export function offsetAt(ms, tz) {
  const whole = Math.floor(ms / 1000) * 1000;
  return (fieldsToMs(fieldsAt(whole, tz)) - whole) / MINUTE;
}

// Every instant at which `tz` showed this wall-clock reading.
//   status "ok"        one instant
//   status "ambiguous" two (clocks were set back), earlier first
//   status "gap"       none (clocks jumped forward); `instants` holds the one given by the offset before the jump,
//                      and `skipped` the minutes the clocks jumped
export function resolveWallTime(wall, tz) {
  const local = fieldsToMs(wall);
  const offsets = [...new Set([-DAY, -HOUR * 6, 0, HOUR * 6, DAY].map(dt => offsetAt(local + dt, tz)))];
  const instants = [...new Set(offsets.map(o => local - o * MINUTE).filter(ms => fieldsToMs(fieldsAt(ms, tz)) === local))].sort((a, b) => a - b);
  if (instants.length === 1) return { status: "ok", instants };
  if (instants.length > 1) return { status: "ambiguous", instants };
  const before = offsetAt(local - DAY, tz), after = offsetAt(local + DAY, tz);
  return { status: "gap", instants: [local - before * MINUTE], skipped: after - before };
}

// localToUtc({ y, m, d }, { h, mi } | null, "America/Chicago")
//   → { ms, date (a Date), timeKnown, status, offset (minutes east of UTC), dst }
// `dst` is true when the offset is above the zone's standard offset (daylight or war time).
export function localToUtc(date, time, tz) {
  const timeKnown = !!time && Number.isFinite(time.h);
  const wall = { y: date.y, m: date.m, d: date.d, h: timeKnown ? time.h : 12, mi: timeKnown ? time.mi || 0 : 0, s: 0 };
  const r = resolveWallTime(wall, tz);
  const ms = r.instants[0];
  const offset = offsetAt(ms, tz);
  // Standard time: the lowest offset in mid-January and mid-July of this year and the two around it (1974 had
  // daylight time all year).
  const std = Math.min(...[-1, 0, 1].flatMap(k => [1, 7].map(m => offsetAt(fieldsToMs({ y: date.y + k, m, d: 15 }), tz))));
  return { ms, date: new Date(ms), timeKnown, status: r.status, offset, dst: offset > std };
}

// "UTC−5", "UTC−9:30"
export function offsetLabel(minutes) {
  const sign = minutes < 0 ? "−" : "+", a = Math.abs(Math.round(minutes));
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, "0")}` : ""}`;
}
