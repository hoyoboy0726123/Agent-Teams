// The back office's numbers (/admin): daily totals of anonymous events from the pages (src/stats.js). A POST to
// /api/stats is { p: page, e: [event names], s: seconds on screen }; only the names below are counted, and only the
// day (in Taiwan), the page and the totals are kept — no IP, no id, nothing the player typed. The totals live in one
// SQLite-backed Durable Object (worker/stats-store.js), bound as STATS. GET /api/stats needs the ADMIN_KEY secret.
export const PAGES = ["life", "chart"];
export const EVENTS = [
  "view", "visitor", "return", "t30", "t60", "t180", "t600",
  "start", "end", "end_u", "ai_life", "ai_life_u", "hehun", "hehun_u", "ai_match", "ai_match_u",
  "beat",   // a page with a life running, once a minute: how many are playing right now (/api/live)
];
const MAX_EVENTS = 20, MAX_SECONDS = 900;
// A finished life, as the welcome page shows it (剛剛走完的人生, 今天大家活得怎麼樣): the decade of birth, the day
// stem, the age reached and three big things. Nothing that points back at a person.
export const DECADES = ["1930 前", "30 後", "40 後", "50 後", "60 後", "70 後", "80 後", "90 後", "00 後", "10 後", "20 後", "未來"];
export const STEMS = "甲乙丙丁戊己庚辛壬癸";
export const STEM_ELEMENT = { 甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水" };
export function readLife(l) {
  if (!l || typeof l !== "object") return null;
  const age = Number(l.age), married = Number(l.married), kids = Number(l.kids);
  if (!DECADES.includes(l.decade) || !STEMS.includes(l.stem) || String(l.stem).length !== 1) return null;
  if (!Number.isInteger(age) || age < 0 || age > 120) return null;
  return { decade: l.decade, stem: l.stem, age, married: Number.isInteger(married) ? Math.max(0, Math.min(9, married)) : 0, home: l.home === true ? 1 : 0, kids: Number.isInteger(kids) ? Math.max(0, Math.min(15, kids)) : 0 };
}

// Taiwan's date for a moment (UTC+8, no summer time since 1979).
export const dayOf = ms => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);

// The body → { page, counts: { metric: n } }, or null when it is not something the pages send.
export function readStats(body) {
  if (!body || typeof body !== "object" || !PAGES.includes(body.p)) return null;
  const counts = {};
  for (const e of (Array.isArray(body.e) ? body.e : []).slice(0, MAX_EVENTS)) if (EVENTS.includes(e)) counts[e] = (counts[e] || 0) + 1;
  const s = Number(body.s);
  if (Number.isFinite(s) && s >= 1) counts.seconds = Math.min(MAX_SECONDS, Math.round(s));
  const life = body.life ? readLife(body.life) : null;
  return Object.keys(counts).length || life ? { page: body.p, counts, ...(life ? { life } : {}) } : null;
}

// What the welcome page shows (/api/live), from the store's answer { total, today, beats, lives, recent }: the small
// numbers stay hidden until there is enough behind them, so a quiet first week does not read as an empty room.
export const SHOW = { strip: 50, today: 20, recent: 3 };
export function liveOf({ total = 0, todayEnds = 0, beats = 0, lives = [], recent = [] }, now = Date.now()) {
  const out = { total };
  // A page beats once a minute; the count of the last 90 seconds is about the pages playing now.
  if (total >= SHOW.strip) { out.nowPlaying = beats; out.today = todayEnds; }
  if (lives.length >= SHOW.today) {
    const n = lives.length, avg = x => lives.reduce((t, l) => t + x(l), 0) / n;
    const stems = {};
    for (const l of lives) { const e = STEM_ELEMENT[l.stem]; stems[e] = (stems[e] || 0) + 1; }
    out.todayLives = { n, avgAge: Math.round(avg(l => l.age)), maxAge: Math.max(...lives.map(l => l.age)), married: Math.round(avg(l => (l.married ? 1 : 0)) * 100), home: Math.round(avg(l => l.home) * 100), elements: stems };
  }
  if (recent.length >= SHOW.recent) out.recent = recent.slice(0, 5).map(l => ({ decade: l.decade, stem: l.stem, age: l.age, married: l.married, home: !!l.home, kids: l.kids, ago: Math.max(0, Math.round((now - l.ts) / 60000)) }));
  return out;
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
