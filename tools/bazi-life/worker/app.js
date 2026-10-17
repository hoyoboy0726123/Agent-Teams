// 命盤人生的 Cloudflare Worker：放網頁，並在 /api/interpret 用 Workers AI 判讀玩家自己寫的選擇。worker/index.js 把
// public/ 的兩個網頁交給 makeApp()；這個檔案不讀檔案，測試可以直接載入（test/worker.test.js）。
//
// The page (src/life-app.js) posts { situation, context, options: [{ id, label }], text } for the choice in front of
// the player. The prompt is built here, from src/sim/interpret.js, and the reply is checked the same way the page
// checks it, so the answer can only be one of the actions the engine already allows. Any failure answers with an
// error status and the page quietly reads the words itself; nothing here is needed for the game to work.
//
// Bindings (wrangler.jsonc): AI (Workers AI), INTERPRET_LIMIT (requests per minute per IP).
// Variable: PROMPT = "compact" for the shorter prompt (fewer neurons, slightly less accurate).
// Only the pages this Worker serves may call it (the Origin must be its own: workers.dev or a custom domain routed
// to it). Nothing the player writes is logged.
import { interpretPrompt, readInterpretation, jsonFromText } from "../src/sim/interpret.js";

export const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const MAX_BODY = 4096;
const ID = /^[\w.-]{1,40}$/;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// One line of the player's or the page's text, without control characters, at most n characters.
const line = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, n);

// The request body → the prompt's fields, or null when it is not a choice the page could have sent.
export function readRequest(body) {
  if (!body || typeof body !== "object") return null;
  const text = line(body.text, 200);
  if (!text) return null;
  const options = (Array.isArray(body.options) ? body.options : []).slice(0, 8)
    .map(o => ({ id: line(o && o.id, 40), label: line(o && o.label, 40), hint: line(o && o.hint, 24) }))
    .filter(o => ID.test(o.id) && o.label);
  return { situation: line(body.situation, 200), context: line(body.context, 120), options, text };
}

// Workers AI answers this model in the OpenAI shape (choices[0].message.content); older models answer { response }.
export function textOf(out) {
  if (!out) return "";
  if (typeof out === "string") return out;
  if (typeof out.response === "string") return out.response;
  if (out.response && typeof out.response === "object") return JSON.stringify(out.response);
  const c = Array.isArray(out.choices) ? out.choices[0] : null;
  const m = c && (c.message || c.delta);
  if (m && typeof m.content === "string") return m.content;
  if (c && typeof c.text === "string") return c.text;
  return "";
}

const sameOrigin = request => request.headers.get("origin") === new URL(request.url).origin;

export async function interpret(request, env) {
  if (request.method !== "POST") return answer(405, { error: "method" });
  if (!sameOrigin(request)) return answer(403, { error: "origin" });
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY) return answer(413, { error: "size" });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return answer(413, { error: "size" });
  let body = null;
  try { body = JSON.parse(raw); } catch { /* answered below */ }
  const ask = readRequest(body);
  if (!ask) return answer(400, { error: "request" });
  if (env.INTERPRET_LIMIT) {
    const { success } = await env.INTERPRET_LIMIT.limit({ key: request.headers.get("cf-connecting-ip") || "unknown" });
    if (!success) return answer(429, { error: "busy" });
  }
  if (!env.AI) return answer(503, { error: "unavailable" });
  let out;
  try {
    out = await env.AI.run(MODEL, {
      messages: [{ role: "user", content: interpretPrompt({ ...ask, compact: env.PROMPT === "compact" }) }],
      max_completion_tokens: 96,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
    });
  } catch {
    // Over the free allocation, or the model is busy: the page reads the words itself.
    return answer(503, { error: "unavailable" });
  }
  const reply = jsonFromText(textOf(out));
  if (!reply) return answer(502, { error: "reply" });
  return answer(200, readInterpretation(reply, { options: ask.options }));
}

// The pages are part of the Worker itself rather than static assets: an asset upload is authorised by a token of its
// own, which the cloud environment's proxy would replace with the account's API token.
// no-cache: the browser asks each time, so a new deploy shows at once (with max-age=600 a phone kept showing the old page
// for ten minutes after a fix). The ETag lets an unchanged page be a 304, but on workers.dev Cloudflare removes ETags
// from HTML (Email Obfuscation and the like are on there), so for now each visit downloads the page (~560 KB zstd).
const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8", "cache-control": "no-cache",
  "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin",
};
const ETAGS = new Map();
async function etagOf(html) {
  if (!ETAGS.has(html)) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html)));
    ETAGS.set(html, `"${[...digest.slice(0, 12)].map(b => b.toString(16).padStart(2, "0")).join("")}"`);
  }
  return ETAGS.get(html);
}
// If-None-Match: a list of tags, or *.
const matches = (header, etag) => !!header && (header.trim() === "*" || header.split(",").some(t => t.trim().replace(/^W\//, "") === etag));

// The Worker for the given pages ({ path: html }): the pages, and the API.
export function makeApp(pages) {
  return {
    async fetch(request, env) {
      const { pathname } = new URL(request.url);
      if (pathname === "/api/interpret") return interpret(request, env);
      if (pathname.startsWith("/api/")) return answer(404, { error: "not found" });
      const html = Object.hasOwn(pages, pathname) ? pages[pathname] : null;
      if (html === null) return new Response("找不到這個頁面。", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
      const etag = await etagOf(html), headers = { ...PAGE_HEADERS, etag };
      if (matches(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
      return new Response(request.method === "HEAD" ? null : html, { headers });
    },
  };
}
