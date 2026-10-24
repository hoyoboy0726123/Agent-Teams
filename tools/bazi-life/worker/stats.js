// The back office's numbers (/admin): daily totals of anonymous events from the pages (src/stats.js). A POST to
// /api/stats is { p: page, e: [event names], s: seconds on screen }; only the names below are counted, and only the
// day (in Taiwan), the page and the totals are kept — no IP, no id, nothing the player typed. The totals live in one
// SQLite-backed Durable Object (worker/stats-store.js), bound as STATS. GET /api/stats needs the ADMIN_KEY secret.
export const PAGES = ["life", "chart"];
export const EVENTS = [
  "view", "visitor", "return", "t30", "t60", "t180", "t600",
  "start", "end", "end_u", "ai_life", "ai_life_u", "hehun", "hehun_u", "ai_match", "ai_match_u",
];
const MAX_EVENTS = 20, MAX_SECONDS = 900;

// Taiwan's date for a moment (UTC+8, no summer time since 1979).
export const dayOf = ms => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);

// The body → { page, counts: { metric: n } }, or null when it is not something the pages send.
export function readStats(body) {
  if (!body || typeof body !== "object" || !PAGES.includes(body.p)) return null;
  const counts = {};
  for (const e of (Array.isArray(body.e) ? body.e : []).slice(0, MAX_EVENTS)) if (EVENTS.includes(e)) counts[e] = (counts[e] || 0) + 1;
  const s = Number(body.s);
  if (Number.isFinite(s) && s >= 1) counts.seconds = Math.min(MAX_SECONDS, Math.round(s));
  return Object.keys(counts).length ? { page: body.p, counts } : null;
}

// Rows { day, page, metric, n } → per day and page: { day, page, view: n, … }, newest day first.
export function tableOf(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = `${r.day}|${r.page}`;
    if (!by.has(k)) by.set(k, { day: r.day, page: r.page });
    by.get(k)[r.metric] = Number(r.n) || 0;
  }
  return [...by.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.page < b.page ? -1 : 1));
}

// Two strings compared in time that does not depend on where they differ.
export function sameKey(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
