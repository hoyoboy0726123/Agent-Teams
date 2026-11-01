// End-to-end check against `npm run dev` (wrangler dev with MOCK_AI=1, IP_DAILY=5).
// Needs Playwright: PLAYWRIGHT=/path/to/playwright CHROMIUM=/path/to/chrome node test/e2e.mjs [baseUrl]
import { createRequire } from "node:module";
import { SAMPLES } from "./samples.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8787";
const shot = process.env.SHOT || "";
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 1000)); }

// ---- 1. a full life in the browser, then the letter ----
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
const errors = []; page.on("pageerror", e => errors.push(e.message));
await page.goto(BASE);
check("page has the AI switch", await page.$('meta[name="pet-ai"]') !== null);

async function liveOneLife() {
  await page.click('#speeds button[data-s="16"]');
  for (let i = 0; i < 400 && !(await page.$("#story:not([hidden])")); i++) {
    const opts = await page.$$("#modal:not([hidden]) .opt:not([disabled])");
    if (opts.length) await opts[0].click(); else await page.waitForTimeout(250);
  }
  for (let i = 0; i < 14 && !(await page.$("#seeRec")); i++) { await page.click("#story", { position: { x: 30, y: 400 } }); await page.waitForTimeout(80); }
}
await page.click("#born");
await liveOneLife();
const label1 = await page.textContent("#mailBtn");
check("name card offers the letter", /收下牠的最後一封信/.test(label1), label1);
await page.click("#mailBtn");
await page.waitForSelector("#mailGo");
check("asks before using the one chance", /每個人只能收到一封信/.test(await page.textContent("#mail")));
await page.click("#mailGo");
await page.waitForSelector("#paper", { timeout: 30000 });
await page.waitForFunction(() => (document.querySelector("#paper")?.textContent || "").includes("——"), null, { timeout: 30000 });
await page.click("#paper"); await page.waitForTimeout(200); // finish the typing effect
const letter1 = await page.textContent("#paper");
check("letter arrives and types out", letter1.length > 60, letter1.slice(0, 40).replace(/\n/g, " ") + "…");
if (shot) await page.screenshot({ path: shot });
await page.click("#mail [data-close]");
await page.click("#seeRec");
check("record box now says the letter was received", /讀我收過的那封信/.test(await page.textContent("#mailBtn2")));
await page.click("#again");
await liveOneLife();
await page.click("#mailBtn");
await page.waitForSelector("#paper");
check("second life shows the same letter, no new one", /你已經收過一封信了/.test(await page.textContent("#mail")) && (await page.textContent("#paper")) === letter1);
check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();

// ---- 2. the API rules ----
const post = (body, headers = {}) => fetch(BASE + "/api/letter", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const dev = () => ({ "x-pet-device": crypto.randomUUID() });
const g = await fetch(BASE + "/api/letter");
const gj = await g.json();
check("GET reports status and sets a device cookie", gj.enabled === true && gj.used === false && /pl=/.test(g.headers.get("set-cookie") || ""), `left=${gj.left}`);
check("bad body is refused", (await post("{nope")).status === 400);
check("empty life is refused", (await post({ sp: "cat", country: "台灣", events: [] }, dev())).status === 400);
const a = dev();
const r1 = await post(SAMPLES[0], a), j1 = await r1.json();
check("new device gets a letter", r1.status === 200 && j1.letter && j1.letter.name === "黑糖", j1.letter && j1.letter.name);
const r2 = await post(SAMPLES[1], a), j2 = await r2.json();
check("same device gets its first letter back, not a new one", r2.status === 409 && j2.error === "used" && j2.letter.text === j1.letter.text);
let codes = [];
for (let i = 0; i < 5; i++) codes.push((await post(SAMPLES[2], dev())).status);
check("one network is capped per day (IP_DAILY=5, 2 already used)", codes.join(",") === "200,200,200,429,429", codes.join(","));
check("cross-site POST is refused", (await post(SAMPLES[2], { ...dev(), origin: "https://evil.example" })).status === 403);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
