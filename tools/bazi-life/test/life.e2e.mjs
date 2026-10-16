// Browser check of public/life.html (run `npm run build` first).
// PLAYWRIGHT=/path/to/playwright CHROMIUM=/path/to/chrome node test/life.e2e.mjs
// SHOTS=<dir> also saves a desktop (light) and a phone (dark) screenshot of the ending.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const url = pathToFileURL(fileURLToPath(new URL("../public/life.html", import.meta.url))).href;
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
const watch = p => { p.on("pageerror", e => errors.push(e.message)); return p; };
const page = watch(await browser.newPage({ viewport: { width: 1100, height: 1300 } }));
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await page.goto(url);

check("setup form is shown first", await page.isVisible("#form-me") && !(await page.isVisible("#play")));
await page.click("#form-me button[type=submit]");
await page.waitForSelector("#play:not([hidden])");
await page.click('[data-speed="10"]');
await page.waitForSelector("#choice:not([hidden])", { timeout: 20000 });
check("a choice appears and pauses the life", await page.isVisible("#choice .options button"));
const before = await page.textContent("#feed");
await page.click("#choice [data-option='0']");
await page.waitForTimeout(400);
check("choosing continues the story", (await page.textContent("#feed")).length > before.length && /你的選擇/.test(await page.textContent("#feed")));
await page.click("#c-skip");
await page.waitForSelector("#end:not([hidden])", { timeout: 20000 });
const title = await page.textContent("#end-title");
check("the ending says how long this life lasted", /這一次，你活到 \d+ 歲/.test(title), title);
check("the K-line has candles and the 100-run band", (await page.$$("#plot svg rect")).length > 20 && (await page.$$("#plot svg path")).length === 1);
const cards = await page.textContent("#cards");
check("lifespan card counts out of 100 and shows the 1925 line", /100 次人生裡/.test(cards) && /1925/.test(cards));
check("health and marriage cards carry their notices", /不是看命盤/.test(cards) && /抉擇/.test(cards));
check("share card carries the notice", /模擬故事，不是預言/.test(await page.textContent("#share")));
await page.hover("#plot svg", { position: { x: 300, y: 120 } });
check("hovering the K-line shows a tooltip", await page.isVisible("#tip"));
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/life-desktop-light.png`, fullPage: true });

await page.click("#again-same");
await page.waitForSelector("#play:not([hidden])");
await page.click("#c-skip").catch(() => {});
await page.waitForSelector("#end:not([hidden])", { timeout: 20000 });
check("living again with the same chart works", /這一次，你活到/.test(await page.textContent("#end-title")));

await page.click("#again-new");
await page.click("#tab-random");
await page.click("#go-random");
await page.waitForSelector("#play:not([hidden])");
check("random birth announces who you became", /你投胎成為 \d{4} 年/.test(await page.textContent("#born")));
await page.click("#c-skip");
await page.waitForSelector("#end:not([hidden])", { timeout: 20000 });

const phone = watch(await browser.newPage({ viewport: { width: 400, height: 900 }, colorScheme: "dark", deviceScaleFactor: 2 }));
await phone.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await phone.goto(url);
await phone.click("#form-me button[type=submit]");
await phone.waitForSelector("#play:not([hidden])");
await phone.click("#c-skip");
await phone.waitForSelector("#end:not([hidden])", { timeout: 20000 });
const width = await phone.evaluate(() => document.documentElement.scrollWidth);
check("no sideways scrolling at phone width", width <= 400, `scrollWidth ${width}`);
if (process.env.SHOTS) await phone.screenshot({ path: `${process.env.SHOTS}/life-phone-dark.png`, fullPage: true });
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
