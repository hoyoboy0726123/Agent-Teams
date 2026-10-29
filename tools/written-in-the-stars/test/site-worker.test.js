// The Cloudflare Worker (worker/app.js) with stand-ins for its bindings: the anonymous counts (/api/stats), the live
// numbers (/api/live) and the back office (/admin); everything else is the static assets of public/ (wrangler.jsonc,
// scripts/static-site.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeApp, resetLiveCache } from "../worker/app.js";
import { readStats, readLife, liveOf, demoLive, tableOf, sameKey, dayOf, DECADES, SIGNS, SHOW } from "../worker/stats.js";
import { ADMIN_HTML } from "../worker/admin.js";

const SITE = "https://written-in-the-stars.example.workers.dev";
const worker = makeApp();
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

test("the pages are static assets: anything but the API and /admin goes to env.ASSETS, else a 404", async () => {
  const asked = [];
  const e = { ASSETS: { fetch: async req => { asked.push(new URL(req.url).pathname); return new Response("<p>game</p>"); } } };
  for (const path of ["/", "/privacy", "/terms", "/og.png", "/fonts/fraunces-latin.woff2", "/robots.txt", "/nope"]) assert.equal(await (await worker.fetch(get(path), e)).text(), "<p>game</p>", path);
  assert.equal(asked.length, 7);
  await worker.fetch(get("/admin"), e);
  await worker.fetch(get("/api/other"), e);
  assert.equal(asked.length, 7, "the API and /admin never reach the assets");
  assert.equal((await worker.fetch(get("/nope"), {})).status, 404);
});

test("unknown APIs get a JSON 404, and /admin takes only reads", async () => {
  const api = await worker.fetch(get("/api/interpret"), {});
  assert.equal(api.status, 404);
  assert.deepEqual(await api.json(), { error: "not found" });
  assert.equal((await worker.fetch(new Request(`${SITE}/admin`, { method: "POST" }), {})).status, 405);
});

test("wrangler.jsonc serves public/ as static assets and runs the Worker only for /api/* and /admin", async () => {
  const { readFile } = await import("node:fs/promises");
  const text = (await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8")).replace(/^\s*\/\/.*$/gm, "");
  const config = JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
  assert.deepEqual(config.assets, { directory: "./public", binding: "ASSETS", html_handling: "none", not_found_handling: "404-page", run_worker_first: ["/api/*", "/admin"] });
  assert.equal(config.rules, undefined, "nothing is imported as a page or a font any more");
  assert.doesNotMatch(await readFile(new URL("../worker/index.js", import.meta.url), "utf8"), /\bimport\b.*(public|assets)\//);
});

test("the clean URLs, the headers, robots.txt and the 404 page of the static files (scripts/static-site.mjs)", async () => {
  const { REDIRECTS, HEADERS, ROBOTS, NOT_FOUND_HTML } = await import("../scripts/static-site.mjs");
  const { parseRedirects, parseHeaders, headersFor } = await import("./helpers/static-site.mjs");
  assert.deepEqual(Object.fromEntries(parseRedirects(REDIRECTS).map(r => [r.from, `${r.to} ${r.status}`])), { "/": "/index.html 200", "/privacy": "/privacy.html 200", "/terms": "/terms.html 200" });
  const rules = parseHeaders(HEADERS);
  for (const path of ["/", "/index.html", "/privacy", "/privacy.html", "/terms", "/terms.html"]) {
    const h = headersFor(rules, path);
    assert.equal(h["cache-control"], "no-cache", path);
    assert.equal(h["x-frame-options"], "DENY", path);
    assert.equal(h["x-content-type-options"], "nosniff", path);
    assert.equal(h["referrer-policy"], "strict-origin-when-cross-origin", path);
    assert.match(h["permissions-policy"], /camera=\(\)/, path);
  }
  for (const path of ["/og.png", "/fonts/fraunces-latin.woff2", "/fonts/OFL.txt", "/robots.txt"]) assert.equal(headersFor(rules, path)["cache-control"], "public, max-age=86400", path);
  assert.match(ROBOTS, /Disallow: \/admin/);
  assert.match(ROBOTS, /Disallow: \/api\//);
  assert.match(NOT_FOUND_HTML, /isn't in the stars/);
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

// ---------- the combined back office on bazi-life reads GET /api/stats by CORS ----------
const ADMIN_ORIGIN = "https://bazi-life.mingpan.workers.dev";
const CORS = ["access-control-allow-origin", "access-control-allow-headers", "access-control-allow-methods"];
const preflight = origin => new Request(`${SITE}/api/stats?days=90`, { method: "OPTIONS", headers: { origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });

test("the combined back office (ADMIN_ORIGIN) gets CORS for a preflight and a GET of the totals, with the same key check", async () => {
  const key = crypto.randomUUID(), env = statsEnv({ ADMIN_KEY: key, ADMIN_ORIGIN });
  const pre = await worker.fetch(preflight(ADMIN_ORIGIN), env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), ADMIN_ORIGIN);
  assert.equal(pre.headers.get("access-control-allow-headers"), "authorization");
  assert.equal(pre.headers.get("access-control-allow-methods"), "GET");
  assert.equal(pre.headers.get("vary"), "Origin");
  const ok = await worker.fetch(get("/api/stats?days=90", { origin: ADMIN_ORIGIN, authorization: `Bearer ${key}` }), env);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), ADMIN_ORIGIN);
  assert.equal(ok.headers.get("vary"), "Origin");
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual((await ok.json()).rows, [{ day: "2026-11-02", page: "life", view: 4, end: 2 }]);
  // A wrong or missing key is still 401, readable by the back office so it can say the key was refused.
  for (const auth of [`Bearer ${key}x`, "Bearer ", ""]) {
    const bad = await worker.fetch(get("/api/stats", { origin: ADMIN_ORIGIN, ...(auth ? { authorization: auth } : {}) }), env);
    assert.equal(bad.status, 401, auth);
    assert.deepEqual(await bad.json(), { error: "key" });
    assert.equal(bad.headers.get("access-control-allow-origin"), ADMIN_ORIGIN);
  }
});

test("no other origin gets CORS on /api/stats, and the beacon POST is unchanged", async () => {
  const key = crypto.randomUUID(), env = statsEnv({ ADMIN_KEY: key, ADMIN_ORIGIN });
  for (const origin of ["https://evil.example", "https://bazi-life.mingpan.workers.dev.evil.example", "http://bazi-life.mingpan.workers.dev", "null", SITE]) {
    const pre = await worker.fetch(preflight(origin), env);
    assert.equal(pre.status, 405, origin);
    for (const h of CORS) assert.equal(pre.headers.get(h), null, `${origin} preflight ${h}`);
    const res = await worker.fetch(get("/api/stats", { origin, authorization: `Bearer ${key}` }), env);
    assert.equal(res.status, 200, "the key alone still opens it (same origin, curl)");
    for (const h of CORS) assert.equal(res.headers.get(h), null, `${origin} GET ${h}`);
    assert.equal(res.headers.get("vary"), "Origin");
    const bad = await worker.fetch(get("/api/stats", { origin, authorization: "Bearer nope" }), env);
    assert.equal(bad.status, 401);
    assert.equal(bad.headers.get("access-control-allow-origin"), null);
  }
  // Without ADMIN_ORIGIN set, nobody gets CORS, not even bazi-life.
  const none = statsEnv({ ADMIN_KEY: key });
  assert.equal((await worker.fetch(preflight(ADMIN_ORIGIN), none)).status, 405);
  assert.equal((await worker.fetch(get("/api/stats", { origin: ADMIN_ORIGIN, authorization: `Bearer ${key}` }), none)).headers.get("access-control-allow-origin"), null);
  // The beacon: only this site's own pages may POST, the back office's origin included in the refusal.
  assert.equal((await worker.fetch(post({ p: "life", e: ["view"] }, { origin: ADMIN_ORIGIN }), env)).status, 403);
  const beacon = await worker.fetch(post({ p: "life", e: ["view"] }), env);
  assert.equal(beacon.status, 204);
  for (const h of CORS) assert.equal(beacon.headers.get(h), null);
});

test("/admin keeps noindex, no-store and no-referrer, and links to the combined back office", async () => {
  const res = await worker.fetch(get("/admin"), {});
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.match(res.headers.get("x-robots-tag"), /noindex/);
  assert.match(ADMIN_HTML, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(ADMIN_HTML, /<a href="https:\/\/bazi-life\.mingpan\.workers\.dev\/admin">All sites in one dashboard → https:\/\/bazi-life\.mingpan\.workers\.dev\/admin<\/a>/);
});

test("ADMIN_ORIGIN in wrangler.jsonc is the combined back office's origin", async () => {
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(text, /"ADMIN_ORIGIN": "https:\/\/bazi-life\.mingpan\.workers\.dev"/);
  assert.doesNotMatch(await readFile(new URL("../worker/app.js", import.meta.url), "utf8"), /bazi-life\.mingpan/, "the origin lives in wrangler.jsonc only");
});
