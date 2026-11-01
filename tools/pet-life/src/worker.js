// 16億分之1 毛孩人生 — serves the static page and writes one AI farewell letter per person with Workers AI.
//
// GET  /api/letter  → { enabled, used, letter?, left }   (sets a device cookie on first visit)
// POST /api/letter  → { ok, letter } | { error }         (body: the life summary the page builds)
//
// Limits, all enforced inside one Durable Object so they are consistent across the world:
//   one letter per device (cookie, with a localStorage id as backup), IP_DAILY letters per network per UTC day,
//   and a NEURON_BUDGET per UTC day so the account never leaves the free 10,000-neuron allocation.
import { DurableObject } from "cloudflare:workers";
import { readLife, buildMessages, cleanLetter, extractText, looksRight, neuronsFor, signatureOf, mockLetter } from "./letter.js";

const settings = env => ({
  model: env.MODEL || "@cf/google/gemma-4-26b-a4b-it",
  fallback: env.FALLBACK_MODEL || "@cf/qwen/qwen3-30b-a3b-fp8",
  budget: Number(env.NEURON_BUDGET || 8000),
  ipDaily: Number(env.IP_DAILY || 5),
  estimate: Number(env.NEURONS_PER_LETTER || 25),
});
const utcDay = () => new Date().toISOString().slice(0, 10); // Workers AI resets its free allocation at 00:00 UTC.

export class Limiter extends DurableObject {
  async salt() {
    let s = await this.ctx.storage.get("salt");
    if (!s) { s = crypto.randomUUID(); await this.ctx.storage.put("salt", s); }
    return s;
  }
  // Only a salted hash of the address is ever stored.
  async ipKey(ip, day) {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode((await this.salt()) + ip)));
    return `ip:${day}:${[...bytes.slice(0, 12)].map(b => b.toString(16).padStart(2, "0")).join("")}`;
  }
  async dayStat(day) { return (await this.ctx.storage.get("day:" + day)) || { letters: 0, neurons: 0, pending: 0 }; }

  async status(device, { budget, estimate }) {
    const rec = await this.ctx.storage.get("dev:" + device), d = await this.dayStat(utcDay());
    return { used: !!(rec && rec.letter), letter: (rec && rec.letter) || null, left: Math.max(0, Math.floor((budget - d.neurons) / estimate) - d.pending) };
  }

  async reserve({ device, ip, budget, ipDaily, estimate }) {
    const day = utcDay(), key = await this.ipKey(ip, day);
    return this.ctx.blockConcurrencyWhile(async () => {
      const s = this.ctx.storage, rec = await s.get("dev:" + device);
      if (rec && rec.letter) return { status: "used", letter: rec.letter };
      if (rec && rec.pending && Date.now() - rec.pending < 120000) return { status: "busy" };
      const d = await this.dayStat(day);
      if (d.neurons + (d.pending + 1) * estimate > budget) return { status: "quota" };
      const n = (await s.get(key)) || 0;
      if (n >= ipDaily) return { status: "ip" };
      await s.put({ ["dev:" + device]: { pending: Date.now() }, [key]: n + 1, ["day:" + day]: { ...d, pending: d.pending + 1 } });
      await this.sweep(day);
      return { status: "ok", day, key };
    });
  }

  async commit({ device, day, letter, neurons }) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const d = await this.dayStat(day);
      await this.ctx.storage.put({ ["dev:" + device]: { letter }, ["day:" + day]: { letters: d.letters + 1, neurons: d.neurons + neurons, pending: Math.max(0, d.pending - 1) } });
    });
  }

  // The letter could not be written: give the person their chance back, but keep the neurons already spent.
  async release({ device, day, key, neurons, exhausted }) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const s = this.ctx.storage, d = await this.dayStat(day), n = (await s.get(key)) || 1;
      await s.delete("dev:" + device);
      await s.put({ [key]: Math.max(0, n - 1), ["day:" + day]: { ...d, neurons: exhausted ? 1e12 : d.neurons + neurons, pending: Math.max(0, d.pending - 1) } });
    });
  }

  // Per-network counters only matter for one day; drop older ones the first time a new day is seen.
  async sweep(day) {
    const s = this.ctx.storage;
    if ((await s.get("today")) === day) return;
    await s.put("today", day);
    const old = await s.list({ prefix: "ip:", limit: 1000 });
    const stale = [...old.keys()].filter(k => !k.startsWith(`ip:${day}:`));
    for (let i = 0; i < stale.length; i += 128) await s.delete(stale.slice(i, i + 128));
  }
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

function deviceOf(req) {
  const fromCookie = /(?:^|;\s*)pl=([0-9a-f-]{36})(?:;|$)/.exec(req.headers.get("cookie") || "");
  const fromHeader = (req.headers.get("x-pet-device") || "").trim();
  const id = (fromCookie && fromCookie[1]) || (/^[0-9a-f-]{36}$/.test(fromHeader) ? fromHeader : crypto.randomUUID());
  return { id, setCookie: fromCookie ? {} : { "set-cookie": `pl=${id}; Path=/api; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax` } };
}

async function writeLetter(env, cfg, life) {
  if (env.MOCK_AI === "1") return { text: mockLetter(life), neurons: cfg.estimate };
  if (env.MOCK_AI === "fail") return { text: null, neurons: 0 }; // local testing of the "try again later" path
  let neurons = 0;
  for (const model of [cfg.model, cfg.fallback]) {
    try {
      const options = { messages: buildMessages(life, model), max_tokens: 1200, temperature: 0.85 };
      if (/gemma-4/.test(model)) options.chat_template_kwargs = { enable_thinking: false };
      const r = await env.AI.run(model, options);
      neurons += neuronsFor(model, r, cfg.estimate);
      const text = cleanLetter(extractText(r));
      if (looksRight(text)) return { text, neurons };
      console.log("letter rejected", model, text.slice(0, 80));
    } catch (e) {
      const msg = String((e && e.message) || e);
      console.log("letter failed", model, msg);
      if (/3036|daily free allocation/i.test(msg)) return { text: null, neurons, exhausted: true };
    }
  }
  return { text: null, neurons };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/api/letter") return env.ASSETS.fetch(req);
    const cfg = settings(env), dev = deviceOf(req);
    const limiter = env.LIMITER.get(env.LIMITER.idFromName("global"));

    if (req.method === "GET") return json({ enabled: true, ...(await limiter.status(dev.id, cfg)) }, 200, dev.setCookie);
    if (req.method !== "POST") return json({ error: "method" }, 405);
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin) return json({ error: "origin" }, 403);

    const raw = await req.text();
    if (raw.length > 12000) return json({ error: "too_large" }, 413);
    let life = null;
    try { life = readLife(JSON.parse(raw)); } catch { life = null; }
    if (!life) return json({ error: "bad_request" }, 400, dev.setCookie);

    const ip = req.headers.get("cf-connecting-ip") || "local";
    const slot = await limiter.reserve({ device: dev.id, ip, ...cfg });
    if (slot.status === "used") return json({ error: "used", letter: slot.letter }, 409, dev.setCookie);
    if (slot.status === "busy") return json({ error: "busy" }, 409, dev.setCookie);
    if (slot.status === "quota") return json({ error: "daily_quota" }, 429, dev.setCookie);
    if (slot.status === "ip") return json({ error: "ip_limit" }, 429, dev.setCookie);

    const out = await writeLetter(env, cfg, life);
    if (!out.text) {
      await limiter.release({ device: dev.id, day: slot.day, key: slot.key, neurons: out.neurons, exhausted: out.exhausted });
      return json({ error: out.exhausted ? "daily_quota" : "ai_unavailable" }, out.exhausted ? 429 : 503, dev.setCookie);
    }
    const letter = { text: out.text, name: signatureOf(life), at: Date.now() };
    await limiter.commit({ device: dev.id, day: slot.day, letter, neurons: out.neurons });
    return json({ ok: true, letter }, 200, dev.setCookie);
  },
};
