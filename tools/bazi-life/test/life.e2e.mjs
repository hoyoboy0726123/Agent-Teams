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
check("without a name or family the name and family section stays hidden", !(await page.isVisible("#personal")));
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/life-desktop-light.png`, fullPage: true });

await page.click("#again-same");
await page.waitForSelector("#play:not([hidden])");
await page.click("#c-skip").catch(() => {});
await page.waitForSelector("#end:not([hidden])", { timeout: 20000 });
check("living again with the same chart works", /這一次，你活到/.test(await page.textContent("#end-title")));

// name and family
await page.click("#again-new");
await page.fill("#f-name", "陳怡君");
await page.check("#sex-f");
await page.click("#family > summary");
const fillMember = async (sel, name, date, time = "") => {
  await page.fill(`${sel} .m-name`, name);
  await page.fill(`${sel} .m-date`, date);
  if (time) await page.fill(`${sel} .m-time`, time);
};
await fillMember('.member[data-role="father"]', "陳大明", "1990-05-03", "08:00");
await page.click("#form-me button[type=submit]");
check("family dates are checked before starting", /爸爸的出生年份要比你早/.test(await page.textContent("#error")) && await page.isVisible("#setup"));
await fillMember('.member[data-role="father"]', "陳大明", "1958-05-03", "08:00");
await fillMember('.member[data-role="mother"]', "林美華", "1961-09-21");
await page.click("#add-sibling");
await page.click("#add-sibling");
await page.selectOption("#sibling-list .member:nth-child(1) .m-rel", "olderBrother");
await fillMember("#sibling-list .member:nth-child(1)", "陳志明", "1985-01-09");
await page.selectOption("#sibling-list .member:nth-child(2) .m-rel", "youngerSister");
await fillMember("#sibling-list .member:nth-child(2)", "小美", "1992-07-01");
await page.click("#add-sibling");
await page.click("#sibling-list .member:nth-child(3) .remove");
check("siblings can be added and removed", (await page.$$("#sibling-list .member")).length === 2);
await page.click("#form-me button[type=submit]");
await page.waitForSelector("#play:not([hidden])");
await page.click("#c-skip");
await page.waitForSelector("#end:not([hidden])", { timeout: 20000 });
const story = await page.textContent("#feed");
check("the story uses the name and the family", /名叫陳怡君。爸爸是陳大明，媽媽是林美華。上面已經有哥哥志明。/.test(story));
check("the younger sister is born at 4 with her name", /妹妹小美/.test(await page.textContent('#feed li[data-age="4"]')));
const personal = await page.textContent("#personal");
check("the name card shows the five grids and 三才", await page.isVisible("#personal") && /姓名：陳怡君/.test(personal) && /總格/.test(personal) && /三才「金土土」大吉/.test(personal));
check("the family card shows each relation and the 100-run counts", /爸爸（陳大明）/.test(personal) && /(互補|需要磨合|平穩)/.test(personal) && /100 次人生裡，有 \d+ 次和爸爸吵過架/.test(personal));
check("the share card leaves the family out", !/陳大明|林美華|小美/.test(await page.textContent("#share")));
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/life-family-light.png`, fullPage: true });

await page.click("#again-new");
await page.check("#f-only");
check("an only child hides the sibling rows", !(await page.isVisible("#sibling-list")) && !(await page.isVisible("#add-sibling")));
await page.uncheck("#f-only");

await page.click("#tab-random");
await page.click("#go-random");
await page.waitForSelector("#play:not([hidden])");
check("random birth announces who you became, with a name", /你投胎成為 \d{4} 年.+名叫.{2,4}。/.test(await page.textContent("#born")));
await page.click("#c-skip");
await page.waitForSelector("#end:not([hidden])", { timeout: 20000 });
check("a random life gets a name card", /姓名：/.test(await page.textContent("#personal")));

const phone = watch(await browser.newPage({ viewport: { width: 400, height: 900 }, colorScheme: "dark", deviceScaleFactor: 2 }));
await phone.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await phone.goto(url);
await phone.click("#family > summary");
await phone.click("#add-sibling");
const formWidth = await phone.evaluate(() => document.documentElement.scrollWidth);
check("the family form fits at phone width", formWidth <= 400, `scrollWidth ${formWidth}`);
if (process.env.SHOTS) await phone.screenshot({ path: `${process.env.SHOTS}/life-form-phone-dark.png`, fullPage: true });
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
