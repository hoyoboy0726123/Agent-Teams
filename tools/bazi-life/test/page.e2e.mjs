// Browser check of public/index.html (run `npm run build` first).
// PLAYWRIGHT=/path/to/playwright CHROMIUM=/path/to/chrome node test/page.e2e.mjs
// SHOTS=<dir> also saves a desktop (light) and a phone (dark) screenshot.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const url = pathToFileURL(fileURLToPath(new URL("../public/index.html", import.meta.url))).href;
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_/.test(m.text())) errors.push(m.text()); });
await page.goto(url);
await page.waitForSelector("#result:not([hidden])");

const text = sel => page.textContent(sel);
// Stems are the first row of big characters and branches the second; pair them per column.
const pillarNames = async () => {
  const chars = await page.$$eval("#pillars .big", els => els.map(e => e.textContent.trim()));
  const n = chars.length / 2;
  return chars.slice(0, n).map((s, i) => s + chars[n + i]).join(" ");
};

check("opens on the 1979 summer-time example with 己卯 hour", (await pillarNames()).endsWith("己卯"), await pillarNames());
check("trail explains the summer time", /日光節約時間/.test(await text("#trail")));
check("trail ends 60 minutes earlier than entered", /早 60\.\d 分鐘/.test(await text("#total")), await text("#total"));
check("settings check shows the uncorrected hour", /時柱 己卯 → 庚辰/.test(await text("#edges")));

for (const id of ["zi", "spring", "war", "west", "nohour", "dst"]) {
  await page.click(`[data-example="${id}"]`);
  await page.waitForTimeout(50);
}
check("every example renders without errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await page.click('[data-example="nohour"]');
check("unknown hour shows three pillars", (await page.$$("#pillars .big")).length === 6);
check("unknown hour on 立春 day explains the open month", /16:27 交「立春」/.test(await text("#warnings")));

await page.click('[data-example="zi"]');
check("子時 example: 辛丑 day, 戊子 hour", (await pillarNames()).includes("辛丑") && (await pillarNames()).endsWith("戊子"));
await page.click("details.advanced summary");
await page.selectOption("#f-zi", "late");
await page.waitForTimeout(50);
check("夜子時 switches the day pillar to 庚子", (await pillarNames()).includes("庚子"));
await page.selectOption("#f-zi", "early");

await page.fill("#f-date", "1979-09-30");
await page.fill("#f-time", "23:30");
await page.selectOption("#f-place", "臺北市");
await page.waitForTimeout(50);
check("a repeated hour offers both readings", (await page.$$("[data-occ]")).length === 2);
const before = await text("#trail");
await page.click('[data-occ="1"]');
await page.waitForTimeout(50);
check("choosing the second reading changes the trail", (await text("#trail")) !== before && /UTC\+8:00/.test(await text("#trail")));

await page.selectOption("#f-place", "custom");
await page.fill("#f-lon", "-74.01");
await page.fill("#f-lat", "40.71");
await page.selectOption("#f-tz", "America/New_York");
await page.fill("#f-date", "1990-03-10");
await page.fill("#f-time", "10:00");
await page.waitForTimeout(50);
check("custom place in New York works", (await pillarNames()).endsWith("己巳") && /西經 74\.01°/.test(await text("#trail")), await pillarNames());

const firstYears = await text("#years");
const cards = await page.$$("[data-decade]");
await cards[cards.length - 1].click();
await page.waitForTimeout(50);
check("choosing the last luck cycle shows its ten years", (await text("#years")) !== firstYears && (await page.$$("#years .year")).length === 10, String((await page.$$("#years .year")).length));

await page.fill("#f-date", "1850-01-01");
await page.waitForTimeout(50);
check("out-of-range year explains itself", /1900 到 2100/.test(await text("#error")));

if (process.env.SHOTS) {
  await page.click('[data-example="dst"]');
  await page.screenshot({ path: `${process.env.SHOTS}/desktop-light.png`, fullPage: true });
}
const phone = await browser.newPage({ viewport: { width: 400, height: 900 }, colorScheme: "dark", deviceScaleFactor: 2 });
phone.on("pageerror", e => errors.push(e.message));
await phone.goto(url);
await phone.waitForSelector("#result:not([hidden])");
const width = await phone.evaluate(() => document.documentElement.scrollWidth);
check("no sideways scrolling at phone width", width <= 400, `scrollWidth ${width}`);
if (process.env.SHOTS) await phone.screenshot({ path: `${process.env.SHOTS}/phone-dark.png`, fullPage: true });
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
