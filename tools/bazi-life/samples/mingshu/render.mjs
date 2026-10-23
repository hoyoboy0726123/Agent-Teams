import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT);
const dir = new URL(".", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, proxy: { server: process.env.HTTPS_PROXY } });
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
await page.goto(`file://${dir}report.html`, { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
console.log("fonts:", await page.evaluate(() => [...document.fonts].filter(f => f.status === "loaded").map(f => f.family).filter((v, i, a) => a.indexOf(v) === i).join(", ")));
await page.pdf({ path: `${dir}林語晴-八字命書-範例.pdf`, format: "A4", printBackground: true, displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate: `<div style="width:100%;font-size:8px;color:#8d8792;font-family:'Noto Sans TC',sans-serif;padding:0 13mm;display:flex;justify-content:space-between"><span>林語晴・八字命書（範例）・命盤人生</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  margin: { top: "14mm", bottom: "16mm", left: "13mm", right: "13mm" } });
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await phone.goto(`file://${dir}report.html`, { waitUntil: "networkidle", timeout: 60000 });
await phone.evaluate(() => document.fonts.ready);
console.log("phone scroll width", await phone.evaluate(() => document.documentElement.scrollWidth));
await phone.screenshot({ path: `${dir}phone-top.png` });
await browser.close();
