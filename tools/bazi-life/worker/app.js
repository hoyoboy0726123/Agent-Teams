// 命盤人生的 Cloudflare Worker：放網頁，在 /api/interpret 用 Workers AI 判讀玩家自己寫的選擇，並在 /api/reading 寫
// 結局頁的「AI 命理師解讀」和「AI 合婚」。worker/index.js 把 public/ 的兩個網頁交給 makeApp()；這個檔案不讀檔案，測試可以直接載入
// （test/worker.test.js）。
//
// /api/interpret: the page (src/life-app.js) posts { situation, context, options: [{ id, label }], text } for the
// choice in front of the player. The prompt is built here, from src/sim/interpret.js, and the reply is checked the same
// way the page checks it, so the answer can only be one of the actions the engine already allows. Any failure answers
// with an error status and the page quietly reads the words itself; nothing here is needed for the game to work.
//
// /api/reading: the page posts one part of an AI reading at a time: the births only (src/ai-reading.js
// readingRequest). The charts are recomputed and the fact sheet written here, so nothing the player typed reaches the
// prompt. Text that fails the checker (invented 干支, wrong ages or 喜忌, death or disease, Simplified characters…) is
// asked for once more with the problems listed; a section part that fails twice answers 502 and the page offers to
// write that part again, and a list keeps the engine's words for the entries the model missed.
//
// Bindings (wrangler.jsonc): AI (Workers AI), INTERPRET_LIMIT and READING_LIMIT (requests per minute per IP).
// Variables: PROMPT = "compact" for the shorter interpret prompt (fewer neurons, slightly less accurate);
// READING_MODEL to write readings with another model of READING_MODELS; LAB_KEY (only on a separate lab Worker) lets a
// request that carries it in x-lab-key pick the model and get the usage, the timing and the checker's notes back.
// Only the pages this Worker serves may call it (the Origin must be its own: workers.dev or a custom domain routed
// to it). Nothing the player writes, and no reading, is logged or kept.
import { interpretPrompt, readInterpretation, jsonFromText } from "../src/sim/interpret.js";
import { readReadingRequest, readingPart, partPrompt, partTokens, checkPart, finishPart, READING_VERSION } from "../src/ai-reading.js";

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

// Workers AI answers this model in the OpenAI shape (choices[0].message.content); older models answer { response },
// and gpt-oss the Responses shape (output: [{ type: "message", content: [{ text }] }]).
export function textOf(out) {
  if (!out) return "";
  if (typeof out === "string") return out;
  if (typeof out.response === "string") return out.response;
  if (out.response && typeof out.response === "object") return JSON.stringify(out.response);
  const c = Array.isArray(out.choices) ? out.choices[0] : null;
  const m = c && (c.message || c.delta);
  if (m && typeof m.content === "string") return m.content;
  if (c && typeof c.text === "string") return c.text;
  if (Array.isArray(out.output)) {
    return out.output.filter(o => o && o.type === "message").flatMap(o => o.content || []).filter(x => x && typeof x.text === "string").map(x => x.text).join("");
  }
  return "";
}

// Tokens in and out, whichever shape the model reports them in.
export function usageOf(out) {
  const u = out && out.usage;
  if (!u) return null;
  return { in: u.prompt_tokens ?? u.input_tokens ?? null, out: u.completion_tokens ?? u.output_tokens ?? null };
}

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

export async function interpret(request, env) {
  const got = await readBody(request, MAX_BODY);
  if (got.error) return got.error;
  const ask = readRequest(got.body);
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

// ---------- /api/reading ----------
const READING_MAX_BODY = 2048;
// The models a reading can be written with, each with its input shape. Gemma 4 is the default; the others are there
// for the lab and for READING_MODEL.
export const READING_MODELS = {
  [MODEL]: (prompt, max) => ({ messages: [{ role: "user", content: prompt }], max_completion_tokens: max, temperature: 0.7, chat_template_kwargs: { enable_thinking: false } }),
  "@cf/qwen/qwen3-30b-a3b-fp8": (prompt, max) => ({ messages: [{ role: "user", content: `${prompt}\n/no_think` }], max_tokens: max, temperature: 0.7 }),
  "@cf/zai-org/glm-4.7-flash": (prompt, max) => ({ messages: [{ role: "user", content: prompt }], max_tokens: max, temperature: 0.7, chat_template_kwargs: { enable_thinking: false } }),
  "@cf/openai/gpt-oss-120b": (prompt, max) => ({ input: [{ role: "user", content: prompt }], reasoning: { effort: "low" }, max_output_tokens: max }),
  "@cf/zai-org/glm-5.3-flash": (prompt, max) => ({ messages: [{ role: "user", content: prompt }], max_tokens: max, temperature: 0.7 }),
  "@cf/deepseek-ai/deepseek-v4-flash-0731": (prompt, max) => ({ messages: [{ role: "user", content: prompt }], max_tokens: max, temperature: 0.7 }),
};
const withoutThinking = t => t.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
// Workers AI's error once the day's free allocation is used up (code 4006). Any other failure is worth another try.
export const isQuotaError = message => /\b4006\b|daily free allocation/i.test(message);

export async function reading(request, env) {
  const got = await readBody(request, READING_MAX_BODY);
  if (got.error) return got.error;
  const ask = readReadingRequest(got.body);
  if (!ask) return answer(400, { error: "request" });
  const lab = !!env.LAB_KEY && request.headers.get("x-lab-key") === env.LAB_KEY;
  if (env.READING_LIMIT && !lab) {
    const { success } = await env.READING_LIMIT.limit({ key: request.headers.get("cf-connecting-ip") || "unknown" });
    if (!success) return answer(429, { error: "busy" });
  }
  if (!env.AI) return answer(503, { error: "unavailable" });
  let part;
  try { part = readingPart(ask, { now: new Date().getUTCFullYear() }); } catch { return answer(400, { error: "chart" }); }
  const head = { v: READING_VERSION, kind: ask.kind, part: ask.part };
  // A list part with nothing in it (no ages left in this third): nothing to write.
  if (part.type === "list" && !part.items.length) return answer(200, { ...head, items: [], ...(part.meta ? { meta: part.meta } : {}) });
  const opt = lab && got.body.lab && typeof got.body.lab === "object" ? got.body.lab : {};
  const model = Object.hasOwn(READING_MODELS, opt.model) ? opt.model : Object.hasOwn(READING_MODELS, env.READING_MODEL || "") ? env.READING_MODEL : MODEL;
  const extra = opt.params && typeof opt.params === "object" ? opt.params : {};
  const tries = [];
  let result = null, quota = false;
  for (let i = 0; i < 2 && !(result && result.ok); i++) {
    const t0 = Date.now();
    let out;
    try {
      out = await env.AI.run(model, { ...READING_MODELS[model](partPrompt(part, result), partTokens(part, result)), ...extra });
    } catch (e) {
      // Over the free allocation, or the model is busy. A list keeps what the first try got right.
      const message = String((e && e.message) || e);
      quota = isQuotaError(message);
      tries.push({ ms: Date.now() - t0, error: message.slice(0, 300) });
      break;
    }
    const text = withoutThinking(textOf(out));
    // A list asked again only for the entries it missed keeps the good ones of the first try.
    result = checkPart(text, part, part.type === "list" ? result : null);
    tries.push({ ms: Date.now() - t0, usage: usageOf(out), problems: result.problems, warnings: result.warnings, length: result.length, text });
  }
  const labInfo = lab ? { lab: { model, tries, ...(opt.prompt ? { prompt: partPrompt(part) } : {}) } } : {};
  // "quota" tells the page the day is used up; "unavailable" that this one try failed.
  if (!result) return answer(503, { error: quota ? "quota" : "unavailable", ...labInfo });
  if (part.type === "sections" && !result.ok) return answer(502, { error: "reply", ...labInfo });
  return answer(200, { ...head, ...finishPart(part, result), ...labInfo });
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
      if (pathname === "/api/reading") return reading(request, env);
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
