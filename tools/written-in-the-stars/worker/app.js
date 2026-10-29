// Written in the Stars on Cloudflare: the pages are Workers Static Assets (public/, wrangler.jsonc "assets"), and this
// Worker answers only two small APIs and the back office. This file reads no files, so tests load it directly
// (test/site-worker.test.js).
//
//   /api/stats              POST: anonymous daily counts from the page (worker/stats.js); GET with the ADMIN_KEY secret,
//                           also from the combined back office (ADMIN_ORIGIN) by CORS
//   /api/live               GET: the welcome page's live numbers, for anyone
//   /admin                  the back office (worker/admin.js), which asks for the ADMIN_KEY
//
// Bindings (wrangler.jsonc): STATS (the Durable Object with the counts), STATS_LIMIT (requests per minute per IP),
// ASSETS (the static files of public/).
// Variables: LIVE_DEMO = "1" shows demo numbers with the real ones added on top while the site is new; ADMIN_ORIGIN is
// the one other origin that may read GET /api/stats by CORS: the combined back office of both sites on bazi-life.
// Secrets: ADMIN_KEY opens GET /api/stats (the same key as bazi-life's, so its back office can read both sites). Only
// the pages this Worker serves may POST to it (the Origin must be its own).
// Nothing the player types reaches the Worker: there is no AI in this version.
import { readStats, tableOf, sameKey, dayOf, liveOf, demoLive } from "./stats.js";
import { ADMIN_HTML } from "./admin.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const sameOrigin = request => request.headers.get("origin") === new URL(request.url).origin;

// The JSON body of a POST from this Worker's own pages: { body } (null when it is not JSON), or { error } to answer.
async function readBody(request, max) {
  if (request.method !== "POST") return { error: answer(405, { error: "method" }) };
  if (!sameOrigin(request)) return { error: answer(403, { error: "origin" }) };
  if (Number(request.headers.get("content-length") || 0) > max) return { error: answer(413, { error: "size" }) };
  const raw = await request.text();
  if (raw.length > max) return { error: answer(413, { error: "size" }) };
  try { return { body: JSON.parse(raw) }; } catch { return { body: null }; }
}

// ---------- /api/stats ----------
const STATS_MAX_BODY = 1024;
const store = env => env.STATS.get(env.STATS.idFromName("all"));
// Reading the totals from the combined back office (env.ADMIN_ORIGIN, in wrangler.jsonc): CORS headers for a GET with
// the key in Authorization, for that one origin only. Every other origin gets none, and the key is checked the same way.
function corsOf(request, env) {
  const origin = request.headers.get("origin");
  const allowed = !!env.ADMIN_ORIGIN && origin === env.ADMIN_ORIGIN;
  return allowed
    ? { "access-control-allow-origin": origin, "access-control-allow-headers": "authorization", "access-control-allow-methods": "GET", vary: "Origin" }
    : { vary: "Origin" };
}
const withHeaders = (res, headers) => { for (const [k, v] of Object.entries(headers)) res.headers.set(k, v); return res; };
async function readTotals(request, env) {
  const auth = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!env.ADMIN_KEY) return answer(503, { error: "unavailable" });
  if (!sameKey(auth, env.ADMIN_KEY)) return answer(401, { error: "key" });
  if (!env.STATS) return answer(503, { error: "unavailable" });
  const days = Math.max(1, Math.min(366, Number(new URL(request.url).searchParams.get("days")) || 30));
  const from = dayOf(Date.now() - (days - 1) * 86400e3);
  return answer(200, { today: dayOf(Date.now()), from, rows: tableOf(await store(env).read(from)) });
}
export async function stats(request, env, ctx) {
  // The answer carries the CORS headers whatever it is, so the back office can tell a refused key (401) from no answer.
  if (request.method === "GET") return withHeaders(await readTotals(request, env), corsOf(request, env));
  if (request.method === "OPTIONS") {
    const cors = corsOf(request, env);
    if (cors["access-control-allow-origin"]) return new Response(null, { status: 204, headers: { ...cors, "cache-control": "no-store" } });
    return withHeaders(answer(405, { error: "method" }), cors);
  }
  const got = await readBody(request, STATS_MAX_BODY);
  if (got.error) return got.error;
  const ask = readStats(got.body);
  if (!ask) return answer(400, { error: "request" });
  if (env.STATS_LIMIT) {
    const { success } = await env.STATS_LIMIT.limit({ key: request.headers.get("cf-connecting-ip") || "unknown" });
    if (!success) return answer(429, { error: "busy" });
  }
  if (!env.STATS) return answer(503, { error: "unavailable" });
  const write = store(env).add({ day: dayOf(Date.now()), ...ask });
  if (ctx && ctx.waitUntil) ctx.waitUntil(write.catch(() => {})); else await write;
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

// ---------- /api/live ----------
// Cached for 20 seconds in this isolate, at the edge and in the browser.
const LIVE_HEADERS = { ...JSON_HEADERS, "cache-control": "public, max-age=20", "access-control-allow-origin": "*" };
let liveCache = null;
export const resetLiveCache = () => { liveCache = null; };
export async function live(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return answer(405, { error: "method" });
  if (!env.STATS) return answer(503, { error: "unavailable" });
  const now = Date.now(), demo = env.LIVE_DEMO === "1";
  if (!liveCache || liveCache.demo !== demo || now - liveCache.at > 20e3) {
    const real = await store(env).live(dayOf(now), now);
    liveCache = { at: now, demo, body: JSON.stringify(demo ? demoLive(real, now) : liveOf(real, now)) };
  }
  return new Response(request.method === "HEAD" ? null : liveCache.body, { headers: LIVE_HEADERS });
}

// ---------- the back office, and everything else ----------
// The pages, og.png, the fonts and robots.txt are Workers Static Assets (public/, wrangler.jsonc "assets"): Cloudflare
// serves them itself, with the clean URLs, headers and 404 page of scripts/static-site.mjs, and they do not count
// against the Free plan's 100,000 Worker requests a day, so the game keeps working when those run out (Cloudflare then
// answers the Worker's own routes with its error 1027, and the page pauses the live numbers). They used to be built
// into this Worker, because the asset upload is authorised by a token of its own that the Claude Code cloud proxy
// replaces: deploy from your own computer (README「Build, test, deploy」).
const SECURITY = {
  "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};
const ADMIN_HEADERS = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", ...SECURITY, "referrer-policy": "no-referrer" };

// The Worker runs only for run_worker_first: /api/* and /admin. Anything else that reaches it goes to the assets
// binding (the file or the 404 page); without the binding, as in the unit tests, it answers a plain 404.
export function makeApp() {
  return {
    async fetch(request, env, ctx) {
      const { pathname } = new URL(request.url);
      if (pathname === "/api/stats") return stats(request, env, ctx);
      if (pathname === "/api/live") return live(request, env);
      if (pathname.startsWith("/api/")) return answer(404, { error: "not found" });
      if (pathname === "/admin") {
        if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
        return new Response(request.method === "HEAD" ? null : ADMIN_HTML, { headers: ADMIN_HEADERS });
      }
      if (env && env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" } });
    },
  };
}
