// The Cloudflare Worker (worker/app.js) with stand-ins for its bindings: pages, ETags, the 404 page, the anonymous
// counts (/api/stats), the live numbers (/api/live) and the back office (/admin).
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeApp, resetLiveCache } from "../worker/app.js";
import { readStats, readLife, liveOf, demoLive, tableOf, sameKey, dayOf, DECADES, SIGNS, SHOW } from "../worker/stats.js";
import { ADMIN_HTML } from "../worker/admin.js";

const SITE = "https://written-in-the-stars.example.workers.dev";
const worker = makeApp({ "/": "<p>game</p>", "/index.html": "<p>game</p>", "/privacy": "<p>privacy</p>", "/terms": "<p>terms</p>" });
const get = (path, headers = {}) => new Request(`${SITE}${path}`, { headers });
const post = (body, headers = {}) => new Request(`${SITE}/api/stats`, {
  method: "POST", headers: { "content-type": "text/plain", origin: SITE, "cf-connecting-ip": "203.0.113.7", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

// A stand-in for the StatsStore Durable Object.
function statsEnv({ allow = true, real = { total: 0, todayEnds: 0, beats: 0, lives: [], recent: [] }, ...more } = {}) {
  const added = [], limited = [];
  const stub = { add: async x => { added.push(x); }, read: async () => [{ day: "2026-11-02", page: "life", metric: "view", n: 4 }, { day: "2026-11-02", page: "life", metric: "end", n: 2 }], live: async () => real };
  return { added, limited, STATS: { idFromName: n => n, get: () => stub }, STATS_LIMIT: { limit: async ({ key }) => { limited.push(key); return { success: allow }; } }, ...more };
}

test("the pages are served with no-cache, an ETag, and a 304 when unchanged", async () => {
  for (const path of ["/", "/index.html", "/privacy", "/terms"]) {
    const res = await worker.fetch(get(path), {});
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.equal(res.headers.get("cache-control"), "no-cache");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    const again = await worker.fetch(get(path, { "if-none-match": res.headers.get("etag") }), {});
    assert.equal(again.status, 304);
  }
});

test("unknown paths get the friendly 404 page, unknown APIs a JSON 404, and writes to pages a 405", async () => {
  const res = await worker.fetch(get("/nope"), {});
  assert.equal(res.status, 404);
  assert.match(await res.text(), /isn't in the stars/);
  const api = await worker.fetch(get("/api/interpret"), {});
  assert.equal(api.status, 404);
  assert.deepEqual(await api.json(), { error: "not found" });
  assert.equal((await worker.fetch(new Request(`${SITE}/`, { method: "POST" }), {})).status, 405);
});

test("robots.txt keeps crawlers out of /admin and /api", async () => {
  const res = await worker.fetch(get("/robots.txt"), {});
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Disallow: \/admin/);
});

test("/admin is the back office, never cached or indexed", async () => {
  const res = await worker.fetch(get("/admin"), {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("x-robots-tag"), /noindex/);
  assert.equal(await res.text(), ADMIN_HTML);
  assert.match(ADMIN_HTML, /Back office/);
});

test("a count from the page is added to today's totals, without the IP", async () => {
  const env = statsEnv(), waits = [];
  const res = await worker.fetch(post({ p: "life", e: ["view", "start", "end", "end_u", "nonsense"], s: 42, life: { decade: "the ’90s", sun: "Leo", age: 86, married: 1, home: true, kids: 2 } }), env, { waitUntil: p => waits.push(p) });
  assert.equal(res.status, 204);
  await Promise.all(waits);
  assert.equal(env.added.length, 1);
  const a = env.added[0];
  assert.equal(a.page, "life");
  assert.deepEqual(a.counts, { view: 1, start: 1, end: 1, end_u: 1, seconds: 42 });
  assert.deepEqual(a.life, { decade: "the ’90s", sun: "Leo", age: 86, married: 1, home: 1, kids: 2 });
  assert.match(a.day, /^\d{4}-\d\d-\d\d$/);
  assert.ok(!JSON.stringify(a).includes("203.0.113.7"));
  assert.deepEqual(env.limited, ["203.0.113.7"]);
});

test("counts from another site, too big, not JSON, or over the limit are turned away", async () => {
  assert.equal((await worker.fetch(post({ p: "life", e: ["view"] }, { origin: "https://evil.example" }), statsEnv())).status, 403);
  assert.equal((await worker.fetch(post("x".repeat(2000)), statsEnv())).status, 413);
  assert.equal((await worker.fetch(post("not json"), statsEnv())).status, 400);
  assert.equal((await worker.fetch(post({ p: "elsewhere", e: ["view"] }), statsEnv())).status, 400);
  assert.equal((await worker.fetch(post({ p: "life", e: ["view"] }), statsEnv({ allow: false }))).status, 429);
  assert.equal((await worker.fetch(post({ p: "life", e: ["view"] }), {})).status, 503);
});

test("reading the totals needs the admin key", async () => {
  const env = statsEnv({ ADMIN_KEY: "s3cret-key" });
  assert.equal((await worker.fetch(get("/api/stats"), env)).status, 401);
  assert.equal((await worker.fetch(get("/api/stats", { authorization: "Bearer wrong-key!" }), env)).status, 401);
  const ok = await worker.fetch(get("/api/stats?days=7", { authorization: "Bearer s3cret-key" }), env);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.deepEqual(body.rows, [{ day: "2026-11-02", page: "life", view: 4, end: 2 }]);
  assert.equal((await worker.fetch(get("/api/stats", { authorization: "Bearer x" }), statsEnv())).status, 503);
});

test("readStats keeps only known events and a bounded number of seconds", () => {
  assert.equal(readStats(null), null);
  assert.equal(readStats({ p: "life", e: ["bogus"] }), null);
  assert.deepEqual(readStats({ p: "life", e: Array(30).fill("beat"), s: 99999 }).counts, { beat: 20, seconds: 900 });
});

test("readLife takes only the anonymous summary of a finished life", () => {
  assert.equal(readLife({ decade: "1995", sun: "Leo", age: 80 }), null);
  assert.equal(readLife({ decade: "the ’90s", sun: "Ophiuchus", age: 80 }), null);
  assert.equal(readLife({ decade: "the ’90s", sun: "Leo", age: 200 }), null);
  assert.deepEqual(readLife({ decade: "the ’90s", sun: "Leo", age: 80, married: 30, home: "yes", kids: -1, name: "Jane", date: "1995-08-03" }), { decade: "the ’90s", sun: "Leo", age: 80, married: 9, home: 0, kids: 0 });
  assert.equal(DECADES.length, 10);
  assert.equal(SIGNS.length, 12);
});

test("/api/live: real numbers hide until there are enough; LIVE_DEMO shows demo numbers with the real ones on top", async () => {
  const lives = Array.from({ length: 25 }, (_, i) => ({ decade: "the ’80s", sun: SIGNS[i % 12], age: 70 + (i % 20), married: i % 3 ? 1 : 0, home: i % 2, kids: i % 4 }));
  const recent = lives.slice(0, 4).map((l, i) => ({ ...l, ts: Date.now() - i * 60e3 }));
  resetLiveCache();
  const quiet = await (await worker.fetch(get("/api/live"), statsEnv({ real: { total: 3, todayEnds: 1, beats: 1, lives: [], recent: [] } }))).json();
  assert.deepEqual(quiet, { total: 3 });
  resetLiveCache();
  const busy = await (await worker.fetch(get("/api/live"), statsEnv({ real: { total: 500, todayEnds: 25, beats: 7, lives, recent } }))).json();
  assert.equal(busy.nowPlaying, 7);
  assert.equal(busy.todayLives.n, 25);
  assert.equal(Object.values(busy.todayLives.elements).reduce((a, b) => a + b, 0), 25);
  assert.equal(busy.recent.length, 4);
  resetLiveCache();
  const res = await worker.fetch(get("/api/live"), statsEnv({ LIVE_DEMO: "1", real: { total: 5, todayEnds: 2, beats: 1, lives: [], recent } }));
  assert.match(res.headers.get("cache-control"), /max-age=20/);
  const demo = await res.json();
  assert.equal(demo.demo, true);
  assert.ok(demo.total > 2000 && demo.nowPlaying >= 2 && demo.recent.length === 5);
  assert.ok(demo.recent.every(l => SIGNS.includes(l.sun) && DECADES.includes(l.decade)));
  assert.deepEqual(Object.keys(demo.todayLives.elements).sort(), ["air", "earth", "fire", "water"]);
  assert.equal((await worker.fetch(get("/api/live"), {})).status, 503);
});

test("the demo numbers grow through the day and stay put within half a minute", () => {
  const t = Date.parse("2026-11-20T20:00:00Z");
  const a = demoLive({}, t), b = demoLive({}, t + 10e3), c = demoLive({}, t + 3 * 3600e3);
  assert.equal(a.total, b.total);
  assert.ok(c.today > a.today);
  assert.equal(liveOf({ total: 10 }).nowPlaying, undefined);
  assert.equal(SHOW.strip, 50);
});

test("tableOf, sameKey and the US Eastern day", () => {
  assert.deepEqual(tableOf([{ day: "2026-11-01", page: "life", metric: "view", n: 2 }, { day: "2026-11-02", page: "life", metric: "view", n: 5 }]).map(r => r.day), ["2026-11-02", "2026-11-01"]);
  assert.ok(sameKey("abc", "abc"));
  assert.ok(!sameKey("abc", "abd") && !sameKey("", "") && !sameKey("a", "ab"));
  // 03:00 UTC on Nov 2 is still Nov 1 in New York.
  assert.equal(dayOf(Date.parse("2026-11-02T03:00:00Z")), "2026-11-01");
});

test("the AI report button's clicks are counted (ai_report each time, ai_report_u once a visit), and /admin shows them per finished life", async () => {
  const env = statsEnv(), waits = [];
  const res = await worker.fetch(post({ p: "life", e: ["end", "end_u", "ai_report", "ai_report_u", "ai_report", "ai_report_x"] }), env, { waitUntil: p => waits.push(p) });
  assert.equal(res.status, 204);
  await Promise.all(waits);
  assert.deepEqual(env.added[0].counts, { end: 1, end_u: 1, ai_report: 2, ai_report_u: 1 });
  assert.deepEqual(readStats({ p: "life", e: ["ai_report"] }).counts, { ai_report: 1 });
  assert.equal(readStats({ p: "life", e: ["ai_life"] }), null, "bazi-life's name is not this site's");
  // The back office: a tile for the clicks, and the click rate over the visits that finished a life.
  assert.match(ADMIN_HTML, /\["AI report", n\(t\.ai_report_u\)/);
  assert.match(ADMIN_HTML, /\["AI report rate", pct\(t\.ai_report_u, t\.end_u\), "of visits that finished a life"/);
  assert.match(ADMIN_HTML, /<th>AI report<\/th><th>AI rate<\/th>/);
  assert.match(ADMIN_HTML, /\["Pressed AI report", t\.ai_report_u/);
});
