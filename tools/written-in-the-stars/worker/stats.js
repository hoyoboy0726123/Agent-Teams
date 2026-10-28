// The back office's numbers (/admin) and the welcome page's live numbers (/api/live), as in bazi-life: daily totals of
// anonymous events from the page (src/ui/stats.js). A POST to /api/stats is { p: page, e: [event names], s: seconds on
// screen, life? }; only the names below are counted, and only the day (US Eastern), the page and the totals are kept —
// no IP, no id, nothing the player typed. The totals live in one SQLite-backed Durable Object (worker/stats-store.js).
export const PAGES = ["life"];
export const EVENTS = [
  "view", "visitor", "return", "t30", "t60", "t180", "t600",
  "form", "form_u", "start", "random", "skip", "again", "end", "end_u", "written", "written_u", "help",
  "share_png", "share_native",
  "ai_report", "ai_report_u",   // the "Get my AI report" button on the ending (not open yet): each press, and once per page load
  "beat",   // a page with a life running, once a minute: how many are playing right now (/api/live)
];
const MAX_EVENTS = 20, MAX_SECONDS = 900;
// A finished life, as the welcome page shows it ("A Leo born in the ’90s lived to 86, married, 2 kids"): the decade of
// birth, the Sun sign, the age reached and three big things. Nothing that points back at a person.
export const DECADES = ["before 1950", "the ’50s", "the ’60s", "the ’70s", "the ’80s", "the ’90s", "the ’00s", "the ’10s", "the ’20s", "the future"];
export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
export const ELEMENT_OF = Object.fromEntries(SIGNS.map((s, i) => [s, ["fire", "earth", "air", "water"][i % 4]]));
export function readLife(l) {
  if (!l || typeof l !== "object") return null;
  const age = Number(l.age), married = Number(l.married), kids = Number(l.kids);
  if (!DECADES.includes(l.decade) || !SIGNS.includes(l.sun)) return null;
  if (!Number.isInteger(age) || age < 0 || age > 120) return null;
  return { decade: l.decade, sun: l.sun, age, married: Number.isInteger(married) ? Math.max(0, Math.min(9, married)) : 0, home: l.home === true ? 1 : 0, kids: Number.isInteger(kids) ? Math.max(0, Math.min(15, kids)) : 0 };
}

// The site's day, in US Eastern time.
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
export const dayOf = ms => DAY.format(new Date(ms));
const HOUR = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" });
const easternMinutes = ms => { const [h, m] = HOUR.format(new Date(ms)).split(":").map(Number); return (h % 24) * 60 + m; };

// The body → { page, counts: { metric: n }, life? }, or null when it is not something the page sends.
export function readStats(body) {
  if (!body || typeof body !== "object" || !PAGES.includes(body.p)) return null;
  const counts = {};
  for (const e of (Array.isArray(body.e) ? body.e : []).slice(0, MAX_EVENTS)) if (EVENTS.includes(e)) counts[e] = (counts[e] || 0) + 1;
  const s = Number(body.s);
  if (Number.isFinite(s) && s >= 1) counts.seconds = Math.min(MAX_SECONDS, Math.round(s));
  const life = body.life ? readLife(body.life) : null;
  return Object.keys(counts).length || life ? { page: body.p, counts, ...(life ? { life } : {}) } : null;
}

// Demo numbers for the welcome page while the site is new (wrangler.jsonc LIVE_DEMO = "1"): plausible, seeded by the
// time so a refresh shows the same numbers growing through the day, with the real counts added on top. Remove
// LIVE_DEMO to show only the real numbers (which then hide until there are enough, below).
const LAUNCH = Date.parse("2026-11-01T00:00:00-04:00");
const mulberry = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const DEMO_DAY = 340;   // lives a day in the demo
const short = l => ({ decade: l.decade, sun: l.sun, age: l.age, married: l.married, home: !!l.home, kids: l.kids });
export function demoLive(real, now = Date.now()) {
  const mins = easternMinutes(now), dayFrac = mins / 1440, h = mins / 60;
  const days = Math.max(0, (now - LAUNCH) / 86400e3);
  // Busier in the evening, quiet at 4 a.m.
  const curve = 0.35 + 0.65 * Math.max(0, Math.sin(Math.PI * Math.max(0, Math.min(1, (h - 6) / 18))));
  const rng = mulberry(Math.floor(now / 30e3));
  const today = Math.floor(DEMO_DAY * dayFrac * (0.85 + 0.3 * curve)) + (real.todayEnds || 0);
  const total = 2140 + Math.floor(DEMO_DAY * days) + (real.total || 0);
  const nowPlaying = Math.max(1, Math.round(5 + 18 * curve + rng() * 4)) + (real.beats || 0);
  const dayRng = mulberry(Math.floor(now / 86400e3));
  const el = {}; let left = 100;
  for (const e of ["fire", "earth", "air"]) { const v = Math.round(19 + dayRng() * 12); el[e] = v; left -= v; }
  el.water = Math.max(10, left);
  const n = Math.max(today, 1);
  const elements = Object.fromEntries(Object.entries(el).map(([k, v]) => [k, Math.max(1, Math.round(n * v / 100))]));
  for (const l of real.lives || []) elements[ELEMENT_OF[l.sun]] = (elements[ELEMENT_OF[l.sun]] || 0) + 1;
  const todayLives = { n: n + (real.lives || []).length, avgAge: 77 + Math.round(dayRng() * 4), maxAge: 98 + Math.round(dayRng() * 7), married: 64 + Math.round(dayRng() * 10), home: 60 + Math.round(dayRng() * 12), elements };
  // Five recent lives, changing every three minutes, the real ones first.
  const r2 = mulberry(Math.floor(now / 180e3) * 7 + 3);
  const fake = Array.from({ length: 5 }, (_, i) => {
    const age = Math.round(52 + r2() * 48), married = r2() < 0.7 ? (r2() < 0.18 ? 2 : 1) : 0;
    const k = r2(), kids = !married ? (k < 0.85 ? 0 : 1) : k < 0.2 ? 0 : k < 0.5 ? 1 : k < 0.85 ? 2 : 3;
    return { decade: DECADES[1 + Math.floor(r2() * 8)], sun: SIGNS[Math.floor(r2() * 12)], age, married, home: r2() < 0.66, kids, ago: [1, 3, 6, 11, 18][i] + Math.floor((now % 180e3) / 60e3) };
  });
  const realRecent = (real.recent || []).slice(0, 5).map(l => ({ ...short(l), ago: Math.max(0, Math.round((now - l.ts) / 60000)) }));
  return { total, nowPlaying, today, todayLives, recent: [...realRecent, ...fake].sort((a, b) => a.ago - b.ago).slice(0, 5), demo: true };
}

// What the welcome page shows (/api/live), from the store's answer { total, todayEnds, beats, lives, recent }: the
// small numbers stay hidden until there is enough behind them, so a quiet first week does not read as an empty room.
export const SHOW = { strip: 50, today: 20, recent: 3 };
export function liveOf({ total = 0, todayEnds = 0, beats = 0, lives = [], recent = [] }, now = Date.now()) {
  const out = { total };
  if (total >= SHOW.strip) { out.nowPlaying = beats; out.today = todayEnds; }
  if (lives.length >= SHOW.today) {
    const n = lives.length, avg = x => lives.reduce((t, l) => t + x(l), 0) / n;
    const elements = {};
    for (const l of lives) { const e = ELEMENT_OF[l.sun]; elements[e] = (elements[e] || 0) + 1; }
    out.todayLives = { n, avgAge: Math.round(avg(l => l.age)), maxAge: Math.max(...lives.map(l => l.age)), married: Math.round(avg(l => (l.married ? 1 : 0)) * 100), home: Math.round(avg(l => l.home) * 100), elements };
  }
  if (recent.length >= SHOW.recent) out.recent = recent.slice(0, 5).map(l => ({ ...short(l), ago: Math.max(0, Math.round((now - l.ts) / 60000)) }));
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
