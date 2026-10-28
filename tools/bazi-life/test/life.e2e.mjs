// Browser check of public/life.html (run `npm run build` first).
// PLAYWRIGHT=/path/to/playwright CHROMIUM=/path/to/chrome node test/life.e2e.mjs
// SHOTS=<dir> also saves a desktop (light) and a phone (dark) screenshot of the ending.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeApp } from "../worker/app.js";
import { agesOf, partsFor } from "../src/ai-reading.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const url = pathToFileURL(fileURLToPath(new URL("../public/life.html", import.meta.url))).href;
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
const watch = p => { p.on("pageerror", e => errors.push(e.message)); return p; };
// A fresh page. Unless `welcomed` is false it opens where a returning player lands (我的人生), not on 歡迎. AI 分析報告
// is 敬請期待 on the site (src/ai-mode.js); the pages here try the real reading (the preview switch) unless `soon` is set.
async function fresh(opts, { welcomed = true, soon = false } = {}) {
  const p = watch(await browser.newPage(opts));
  // Every visit opens on 歡迎; a reload keeps the tab. The tests of the forms start where a player who opened 我的人生
  // and reloaded would: on that tab.
  if (welcomed) await p.addInitScript(() => { try { if (!sessionStorage.getItem("bazi-life.tab")) sessionStorage.setItem("bazi-life.tab", JSON.stringify("me")); } catch {} });
  await p.route("**/api/live", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 3 }) }));
  if (!soon) await p.addInitScript(() => { try { localStorage.setItem("bazi-life.aiPreview", "1"); } catch {} });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  return p;
}
// Served over http, as the Worker serves it: /api/interpret answers like worker/index.js would. A Worker that is
// busy or out of quota (503), or a request that fails, leaves the player with the local options, with no message.
const html = await readFile(fileURLToPath(new URL("../public/life.html", import.meta.url)));
const server = createServer((req, res) => {
  if (req.url === "/life.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const site = `http://127.0.0.1:${server.address().port}/life.html`;
// A pixel canvas has been drawn on (the sky and the place fill it).
const painted = (p, sel) => p.$eval(sel, c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > c.width * c.height * 0.9; });
// The first choice of a life. A life that ends before it (rare: the seed is random) is lived again.
async function firstChoice(p) {
  for (let k = 0; k < 4; k++) {
    await p.waitForSelector("#choice:not([hidden]), #end:not([hidden])", { timeout: 20000 });
    if (await p.isVisible("#choice")) return;
    await p.waitForSelector("#story:not([hidden])", { timeout: 5000 }).catch(() => {});
    if (await p.isVisible("#story")) await p.click("#story .skip");
    await p.click("#again-same");
    await p.waitForSelector("#play:not([hidden])");
  }
  throw new Error("four lives ended before their first choice");
}
// The ending opens 人生回顧 over the results; checks of the results close it first.
async function ended(p, timeout) {
  await p.waitForSelector("#end:not([hidden])", { timeout });
  await p.waitForSelector("#story:not([hidden])", { timeout: 5000 }).catch(() => {});
  if (await p.isVisible("#story")) await p.click("#story .skip");
}
const page = await fresh({ viewport: { width: 1100, height: 1300 } }, { welcomed: false });
await page.goto(url);
const welcome = await page.textContent("#welcome");
check("a visit opens on 歡迎: the headline, how to play, what is fun, and that the data stays on the phone", await page.isVisible("#welcome") && await page.isHidden("#form-me") && /同一個生日/.test(welcome) && /怎麼玩/.test(welcome) && /好玩的地方/.test(welcome) && /網站後台不保存這些資料/.test(welcome) && /沒有帳號/.test(welcome) && /合婚分頁的合婚結果在手機上算，不會上傳/.test(welcome));
// On the site (over http) the numbers come from /api/live; this one answers { total: 3 } (fresh()).
const quiet = await fresh({ viewport: { width: 1100, height: 1300 } }, { welcomed: false });
await quiet.goto(site);
await quiet.waitForSelector("#live-strip:not([hidden])", { timeout: 5000 }).catch(() => {});
const nowPillars = await quiet.$$eval("#live-now-chart b", els => els.map(e => e.textContent));
check("歡迎 shows this moment's four pillars in Taipei and only the total while the numbers are few", await quiet.isVisible("#live-now-chart") && nowPillars.length === 4 && nowPillars.every(x => /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(x)) && /日主，如/.test(await quiet.textContent("#now-text")) && await quiet.textContent("#live-total") === "3" && await quiet.isHidden("#live-now-box") && await quiet.isHidden("#live-recent") && await quiet.isHidden("#live-day") && await page.isHidden("#live-strip"), nowPillars.join(" "));
await quiet.close();
// With enough lives behind them, the live strip, today's numbers and the last lives show, from /api/live alone.
const busy = await fresh({ viewport: { width: 1100, height: 1300 } }, { welcomed: false });
await busy.route("**/api/live", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 5210, nowPlaying: 12, today: 348, todayLives: { n: 348, avgAge: 81, maxAge: 103, married: 67, home: 72, elements: { 木: 60, 火: 95, 土: 76, 金: 52, 水: 65 } }, recent: [{ decade: "80 後", stem: "丁", age: 86, married: 1, home: true, kids: 2, ago: 2 }, { decade: "90 後", stem: "壬", age: 79, married: 0, home: false, kids: 0, ago: 0 }, { decade: "70 後", stem: "己", age: 94, married: 1, home: true, kids: 3, ago: 70 }] }) }));
await busy.goto(site);
await busy.waitForSelector("#live-recent:not([hidden])", { timeout: 5000 }).catch(() => {});
const busyText = await busy.textContent("#welcome");
check("with enough lives the welcome page shows who is playing now, today's lives and the last few, anonymously", await busy.textContent("#live-now") === "12" && await busy.textContent("#live-today") === "348" && await busy.textContent("#live-total") === "5,210" && /平均活到81歲/.test(busyText.replace(/\s+/g, "")) && /103 歲/.test(busyText) && (await busy.$$("#live-recent-list li")).length === 3 && /80 後、丁火日主，活到 86 歲，結了 1 次婚，買了房，有 2 個孩子2 分鐘前/.test(busyText.replace(/\n/g, "")) && /剛剛/.test(busyText) && /1 小時前/.test(busyText) && (await busy.$$("#live-elements .bar")).length === 5);
// 中／英: the toggle swaps the page's own words and the welcome lines, keeps the choice, and swaps back.
await busy.click("#lang-toggle");
await busy.waitForTimeout(200);
const enText = (await busy.textContent("#welcome")).replace(/\s+/g, " ");
const enTabs = await busy.$$eval("[role=tab]", a => a.map(x => x.textContent).join("|"));
check("EN turns the page English: tabs, title, headline, live numbers and the last lives", enTabs === "Welcome|My life|Random|Baby|Match" && await busy.title() === "BaZi Life | One birthday, a hundred lives" && await busy.getAttribute("html", "lang") === "en" && await busy.textContent("#lang-toggle") === "中文" && /One birthday, ?a hundred lives\./.test(enText) && /How to play/.test(enText) && /Average lifespan ?Age 81/.test(enText) && /born in the 1980s, 丁 Fire day master, lived to 86, married 1 time, bought a home, 2 children2 min ago/.test(enText) && /just now/.test(enText) && /Day master/.test(await busy.textContent("#now-text")) && /Taipei \d\d:\d\d/.test(await busy.textContent("#now-clock")), enText.slice(enText.indexOf("Lives just"), enText.indexOf("Lives just") + 260));
await busy.reload();
await busy.waitForSelector("#live-recent:not([hidden])", { timeout: 5000 }).catch(() => {});
check("the language chosen is kept on the next visit", await busy.textContent("#tab-me") === "My life" && /lived to 86/.test(await busy.textContent("#live-recent-list")));
await busy.click("#tab-me");
await busy.click("#family > summary");
await busy.click("#add-sibling");
check("the form is English, including what the page adds later (a sibling row)", /Date of birth/.test(await busy.textContent("#form-me")) && /Older brother/.test(await busy.textContent("#sibling-list")) && /Unknown/.test(await busy.textContent("#sibling-list")) && await busy.getAttribute("#f-name", "placeholder") === "e.g. Yi-chun");
await busy.click("#form-me button[type=submit]");
await busy.waitForSelector("#play:not([hidden])");
await busy.waitForSelector("#feed li");
check("while living, the status bar is English and the page says the story is Chinese for now", /^Age \d+$/.test(await busy.textContent("#s-age")) && await busy.textContent("#c-skip") === "Skip to the end" && await busy.isVisible("#play .en-note") && /[\u4e00-\u9fff]/.test(await busy.textContent("#feed")), [await busy.textContent("#s-age"), await busy.textContent("#c-skip"), await busy.isVisible("#play .en-note")].join(" | "));
await busy.click("#c-skip");
await ended(busy, 45000);
check("the ending's headline and facts are English", /^This time, you lived to \d+\.$/.test(await busy.textContent("#end-title")) && /Education/.test(await busy.textContent("#end-facts")) && /Happiest yearAge \d+ \(\d{4}\)/.test(await busy.textContent("#end-facts")) && await busy.isVisible("#end .en-note"));
await busy.click("#lang-toggle");
await busy.waitForTimeout(200);
check("中文 swaps everything back", /^這一次，你活到 \d+ 歲。$/.test(await busy.textContent("#end-title")) && await busy.textContent("#tab-me") === "我的人生" && /^\d+ 歲$/.test(await busy.textContent("#s-age")) && await busy.getAttribute("html", "lang") === "zh-Hant-TW" && await busy.isHidden("#end .en-note") && /學歷/.test(await busy.textContent("#end-facts")));
await busy.close();
check("the welcome page and the footer say only anonymous counts are kept, and promise no AI reading yet", /只統計匿名的次數.+不含生日、姓名或 IP/.test(welcome) && !/AI 命理師會自動|結局自動 AI 解讀|AI 深度合婚/.test(welcome) && /網站不保存/.test(await page.textContent(".privacy-pill")) && /只統計匿名的瀏覽次數、停留時間和按鈕點擊/.test(await page.textContent("footer")) && !/結局頁的解讀預設自動開始/.test(await page.textContent("footer")));
await page.click('[data-goto="me"]');
await page.waitForTimeout(250);
check("the welcome page walks through a life in pixels", await painted(page, "#welcome-scene") && (await page.$$("#welcome-stages span")).length === 6);
check("開始我的人生 opens the birth form", await page.isVisible("#form-me") && await page.getAttribute("#tab-me", "aria-selected") === "true" && await page.isHidden("#welcome"));
await page.reload();
check("after that, the page opens on 我的人生", await page.isVisible("#form-me") && await page.isHidden("#welcome"));

check("setup form is shown first", await page.isVisible("#form-me") && !(await page.isVisible("#play")));
await page.click("#form-me button[type=submit]");
await page.waitForSelector("#play:not([hidden])");
await page.click('[data-speed="10"]');
await firstChoice(page);
check("a choice appears and pauses the life", await page.isVisible("#choice .options button"));
check("the life is drawn as a pixel scene with the place and the year's weather", await painted(page, "#scene") && /・(晴天|多雲|陰天|下雨)・流年/.test(await page.textContent("#scene-cap")), await page.textContent("#scene-cap"));
const before = await page.textContent("#feed");
check("a choice offers at least three options and a box to write your own", (await page.$$("#choice .options button")).length >= 3 && await page.isVisible("#free-text"));
await page.fill("#free-text", "我不想活了");
await page.click("#free-go");
await page.waitForSelector("#free-out .help");
check("writing about self-harm shows help lines and keeps the choice open", /1925/.test(await page.textContent("#free-out")) && await page.isVisible("#choice"));
await page.fill("#free-text", "先跟家人好好商量看看");
await page.click("#free-go");
await page.waitForSelector("#free-out [data-free-action]");
check("opened as a file (no Worker), a written choice gets the closest options to confirm", (await page.$$("#free-out [data-free-action]")).length >= 1);
check("the choice box says nothing about who reads the sentence", !(await page.$("#free-note")) && !/Claude|AI|上傳|判讀/.test(await page.textContent("#choice")));
await page.click("#free-out [data-free-action]");
await page.waitForTimeout(400);
check("a written choice continues the story in your own words", /你自己的決定：你決定「先跟家人好好商量看看」/.test(await page.textContent("#feed")));
await page.waitForSelector("#choice:not([hidden])", { timeout: 20000 });
await page.click("#choice [data-option='0']");
await page.waitForTimeout(400);
check("choosing continues the story", (await page.textContent("#feed")).length > before.length && /你的選擇/.test(await page.textContent("#feed")));
await page.click("#c-skip");
await page.waitForSelector("#end:not([hidden])", { timeout: 20000 });
await page.waitForSelector("#story:not([hidden])");
await page.waitForTimeout(250);
const firstSlide = (await page.textContent("#story .slide")).trim();
check("the ending opens 人生回顧 with the birth first, as a pixel picture", /^0 歲/.test(firstSlide) && await painted(page, "#story canvas"), firstSlide.slice(0, 30));
let slides = 1;
while (!(await page.isVisible("#story .go")) && slides < 12) { await page.click("#story .slide"); slides++; }
check("tapping goes through the moments to the last picture", await page.isVisible("#story .go") && /你走完了 \d+ 歲的一生/.test(await page.textContent("#story")), `${slides} slides`);
await page.click("#story .go");
check("the last button closes 人生回顧 and shows the results", await page.isHidden("#story") && await page.isVisible("#end"));
const title = await page.textContent("#end-title");
check("the ending says how long this life lasted", /這一次，你活到 \d+ 歲/.test(title), title);
// The seed is random, so a life can end young: then there is a candle for each year it lasted.
const lived = Number((/活到 (\d+) 歲/.exec(title) || [])[1]), candles = (await page.$$("#plot svg rect")).length;
check("the K-line has candles and the 100-run band", (lived > 20 ? candles > 20 : candles >= lived) && (await page.$$("#plot svg path")).length === 1, `${candles} candles, lived ${lived}`);
const cards = await page.textContent("#cards");
check("lifespan card counts out of 100 and shows the 1925 line", /100 次人生裡/.test(cards) && /1925/.test(cards));
check("health and marriage cards carry their notices", /不是看命盤/.test(cards) && /抉擇/.test(cards));
check("share card carries the notice", /模擬故事，不是預言/.test(await page.textContent("#share")));
check("the chart-and-life card shows the day master and the jobs' elements", /命盤與這一生/.test(await page.textContent("#personal")) && /日主/.test(await page.textContent("#personal")));
// 八字命理詳批: the professional chart table and the report sections.
const report = await page.textContent("#report");
check("the professional report has the 10-row chart table", await page.isVisible("#report") && (await page.$$("#report .paipan tbody tr")).length === 10, `${(await page.$$("#report .paipan tbody tr")).length} rows`);
check("the report covers strength, pattern, personality, family, career, money, marriage, health, decades and years", ["日主強弱", "格局", "性格", "六親", "事業", "財運", "婚姻", "健康", "大運", "流年"].every(w => report.includes(w)), report.slice(0, 80));
check("the report carries its notice", /僅供參考/.test(report));
const sectionTitles = await page.$$eval("#report details.sec > summary", els => els.map(e => e.textContent));
check("the report ends with 綜合論斷 and then 開運建議, once", sectionTitles.filter(t => t === "開運建議").length === 1 && sectionTitles.at(-1) === "開運建議" && sectionTitles.at(-2) === "綜合論斷", sectionTitles.join(" / "));
await page.hover("#plot svg", { position: { x: 300, y: 120 } });
check("hovering the K-line shows a tooltip", await page.isVisible("#tip"));
check("without a name or family only the chart card shows", (await page.$$("#personal-cards .card")).length === 1);
check("on a page without the Worker the AI reading and 合婚 say where they are offered, and the play bar has no AI box", await page.isVisible("#ai") && await page.isHidden("#ai-go") && await page.isHidden("#ai-match") && /AI 合婚只在命盤人生的網站上提供/.test(await page.textContent("#ai-status")) && await page.$eval("#c-ai-wrap", el => el.hidden));
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/life-desktop-light.png`, fullPage: true });

await page.click("#again-same");
await page.waitForSelector("#play:not([hidden])");
await page.click("#c-skip").catch(() => {});
await ended(page, 45000);
check("living again with the same chart works", /這一次，你活到/.test(await page.textContent("#end-title")));

// name and family
await page.click("#again-new");
await page.fill("#f-name", "陳怡君");
await page.check("#sex-f");
await page.click("#family > summary");
const fillMember = async (sel, name, date, time = "") => {
  await page.fill(`${sel} .m-name`, name);
  await page.fill(`${sel} .m-date`, date);
  if (time) { await page.selectOption(`${sel} .m-hour`, "clock"); await page.fill(`${sel} .m-time`, time); }
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
await ended(page, 45000);
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
await ended(page, 45000);
check("a random life gets a name card", /姓名：/.test(await page.textContent("#personal")));

// 只問人生大事: everyday choices follow the personality and say so; the big ones are still asked.
await page.click("#again-new");
await page.click("#tab-random");
await page.click("#go-random");
await page.waitForSelector("#play:not([hidden])");
await page.check("#c-major");
await page.click('[data-speed="10"]');
let asked = 0;
// A random birth can die in childhood (a 1950s birth before 18 about one time in eleven, by the life tables) and never
// reach a big decision; then the same chart lives again.
for (let lives = 0; lives < 4; lives++) {
  if (lives) { await page.click("#again-same"); await page.waitForSelector("#play:not([hidden])"); }
  asked = 0;
  for (let i = 0; i < 60 && !(await page.isVisible("#end")); i++) {
    await page.waitForSelector("#choice:not([hidden]), #end:not([hidden])", { timeout: 45000 });
    if (await page.isVisible("#choice .options button")) { asked++; await page.click("#choice .options button"); }
  }
  await ended(page, 45000);
  if (Number(((await page.textContent("#end-title")).match(/活到 (\d+) 歲/) || [])[1]) >= 30) break;
}
const majorFeed = await page.textContent("#feed");
check("with 只問人生大事 the big decisions are asked and the rest follow the personality", asked >= 3 && /依你的個性：/.test(majorFeed), `${asked} asked`);
await page.uncheck("#c-major");

async function servedPage(answer, before = null) {
  const p = await fresh({ viewport: { width: 1000, height: 1200 } });
  const sent = [];
  await p.route("**/api/interpret", route => { sent.push(route.request()); return answer(route); });
  await p.goto(site);
  if (before) await before(p);
  await p.click("#form-me button[type=submit]");
  await p.waitForSelector("#play:not([hidden])");
  await p.click('[data-speed="10"]');
  await firstChoice(p);
  return { p, sent };
}
const ok = { status: 200, contentType: "application/json", body: JSON.stringify({ action: "travel", summary: "你決定帶家人去花蓮走走", confidence: 0.9 }) };
const ai = await servedPage(route => route.fulfill(ok));
await ai.p.fill("#free-text", "帶家人去花蓮走走，散散心");
await ai.p.click("#free-go");
await ai.p.waitForSelector("#free-out [data-free-action]");
check("the Worker's reading is shown for confirmation with the rule it follows, and a way to keep your own words", /你決定帶家人去花蓮走走/.test(await ai.p.textContent("#free-out")) && /比照「去旅行」/.test(await ai.p.textContent("#free-out")) && await ai.p.isVisible('#free-out [data-free-action="own"]'));
const req = ai.sent[0], body = req ? JSON.parse(req.postData() || "{}") : {};
check("the page posts the choice and the sentence, without a name or birth date", req && req.method() === "POST" && body.text === "帶家人去花蓮走走，散散心" && body.situation && Array.isArray(body.options) && !/1988|2 月 15|陳/.test(req.postData() || ""), (req && req.postData() || "").slice(0, 80));
await ai.p.click("#free-out [data-free-action]");
await ai.p.waitForTimeout(400);
check("the confirmed reading continues the story", /你自己的決定：你決定帶家人去花蓮走走/.test(await ai.p.textContent("#feed")));
await ai.p.close();
// 照我寫的就好: the words go into the story as written, without a button's outcome.
const kept = await servedPage(route => route.fulfill(ok));
await kept.p.fill("#free-text", "帶家人去花蓮走走，散散心");
await kept.p.click("#free-go");
await kept.p.waitForSelector('#free-out [data-free-action="own"]');
await kept.p.click('#free-out [data-free-action="own"]');
await kept.p.waitForTimeout(400);
check("照我寫的就好 keeps the player's words and goes on without a button's outcome", /你自己的決定：你決定帶家人去花蓮走走/.test(await kept.p.textContent("#feed")) && /你照自己的意思去做了/.test(await kept.p.textContent("#feed")));
await kept.p.close();
// Names typed on the page never reach the Worker: they go out as 伴侶, 你 and the like.
const named = await servedPage(route => route.fulfill(ok), async p => {
  await p.fill("#f-name", "陳志明");
  await p.click("#family > summary");
  await p.fill(".member[data-role=partner] .m-name", "王小美");
  await p.fill(".member[data-role=partner] .m-date", "1990-05-20");
});
await named.p.fill("#free-text", "帶小美和陳志明的爸媽去花蓮走走");
await named.p.click("#free-go");
await named.p.waitForSelector("#free-out [data-free-action]");
const namedBody = named.sent[0] ? named.sent[0].postData() || "" : "";
check("names typed on the page are swapped out before a written choice is sent", (JSON.parse(namedBody || "{}").text || "") === "帶伴侶和你的爸媽去花蓮走走" && !/小美|志明/.test(namedBody), namedBody.slice(0, 100));
await named.p.close();
for (const [name, answer] of [["busy or over quota (503)", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' })], ["unreachable", route => route.abort("connectionrefused")]]) {
  const fb = await servedPage(answer);
  await fb.p.fill("#free-text", "先跟家人好好商量看看");
  await fb.p.click("#free-go");
  await fb.p.waitForSelector("#free-out [data-free-action]", { timeout: 10000 });
  const out = await fb.p.textContent("#free-out");
  check(`a Worker that is ${name} falls back to the local options without a message`, fb.sent.length === 1 && /比較接近哪一個/.test(out) && /照我寫的就好/.test(out) && !/錯誤|失敗|AI|Claude/.test(out), out.slice(0, 60));
  await fb.p.close();
}
// AI 命理師解讀 and AI 合婚 over http, answered by the Worker itself (worker/app.js) with a stand-in model: the page
// posts one part at a time with the births only, shows each part as it arrives, and can write a failed part again.
const FILL = "命理上看，你細心又有主見，這是傾向，不是注定；路怎麼走，還是你自己決定，慢慢來就好。";
const LINE = { 重點: "這十年以學習與貴人為主軸，適合打好底子。", 好事: "工作上容易遇到合作與貴人，值得好好把握。", 要注意: "理財宜保守，合夥和借貸都要多想一步。" };
function standIn(prompt) {
  const titles = [...prompt.matchAll(/^\d+\. 【([^】]+)】/gm)].map(m => m[1]);
  if (titles.length) return titles.map(t => `【${t}】\n${t.endsWith("一句話") ? "像一盞溫暖的燭火，安靜又堅定。" : FILL}`).join("\n\n");
  const keys = [...prompt.match(/^標題依序是：(.*)$/m)[1].matchAll(/【([^】]+)】/g)].map(m => m[1]);
  const lines = [...prompt.matchAll(/一行「(.+?)：」/g)].map(m => m[1]);
  return keys.map(k => `【${k}】\n${lines.map(f => `${f}：${LINE[f]}`).join("\n")}`).join("\n\n");
}
const readingWorker = makeApp({});
const readingEnv = { AI: { run: async (model, input) => ({ choices: [{ message: { role: "assistant", content: standIn(input.messages[0].content) } }] }) } };
const siteOrigin = new URL(site).origin, NOW = new Date().getUTCFullYear();
const readingSent = [], failOnce = new Set();
const rd = await servedPage(route => route.fulfill(ok), async p => {
  await p.fill("#f-name", "陳志明");
  await p.click("#family > summary");
  await p.fill(".member[data-role=partner] .m-name", "王小美");
  await p.fill(".member[data-role=partner] .m-date", "1990-05-20");
  await p.selectOption(".member[data-role=partner] .m-hour", "wu");
});
await rd.p.route("**/api/reading", async route => {
  const body = route.request().postData() || "", part = JSON.parse(body || "{}").part;
  readingSent.push(body);
  if (failOnce.delete(part)) return route.fulfill({ status: 502, contentType: "application/json", body: '{"error":"reply"}' });
  const res = await readingWorker.fetch(new Request(`${siteOrigin}/api/reading`, { method: "POST", headers: { "content-type": "application/json", origin: siteOrigin }, body }), readingEnv);
  return route.fulfill({ status: res.status, contentType: "application/json", body: await res.text() });
});
check("the top of the play screen offers 結局自動 AI 解讀, ticked, saying what it sends", await rd.p.isVisible("#c-ai") && await rd.p.isChecked("#c-ai") && /出生日期、時間、出生地和性別.*不含姓名和家人/.test(await rd.p.textContent("#c-ai-wrap")) && !(await rd.p.$eval(".status", el => el.contains(document.querySelector("#c-ai")))));
await rd.p.click("#c-skip");
await ended(rd.p, 45000);
const consent = await rd.p.textContent("#ai-consent");
check("the end page starts the full reading by itself, under a consent line that says so and how to turn it off", await rd.p.isHidden("#ai-short") && await rd.p.isHidden("#ai-full") && await rd.p.isVisible("#ai-match") && /自動/.test(consent) && /不含姓名和家人/.test(consent) && /結局自動 AI 解讀/.test(consent), consent);
check("while the reading writes itself AI 合婚 stays closed, filled in with the partner of the family form", !(await rd.p.$eval("#ai-match", d => d.open)) && await rd.p.inputValue("#ai-p-date") === "1990-05-20" && await rd.p.inputValue("#ai-p-sex") === "female" && await rd.p.inputValue("#ai-p-when .m-hour") === "wu");

// 完整解讀, started by itself: every part at once, shown as sections, 大運 cards and a list of every age.
const sentFrom = n => readingSent.slice(n).map(b => JSON.parse(b));
const ages = agesOf({ age: NOW - 1988 }).length, fullParts = partsFor("full", 1988, NOW);
const settled = n => rd.p.waitForFunction(n => document.querySelectorAll("#ai-body .ai-years li").length >= n && !document.querySelector("#ai-body .ai-wait") && !/正在寫/.test(document.querySelector("#ai-status").textContent), n, { timeout: 30000 });
await settled(ages);
const full = sentFrom(0);
check("a full reading asks for each part once, with the birth only: no name, no game", full.length === fullParts.length && full.map(b => b.part).sort().join() === [...fullParts].sort().join() && full.every(b => b.v === 2 && b.kind === "full" && b.birth.y === 1988 && b.birth.place && !b.life && !b.partner) && !readingSent.some(b => /陳志明|志明|小美/.test(b)), readingSent[0] && readingSent[0].slice(0, 120));
const order = await rd.p.$$eval("#ai-body > section", els => els.map(e => (e.classList.contains("ai-luck") ? "大運" : e.querySelector("h4").textContent)));
check("the reading reads in order: the motto, the chart, love and health, then the 大運 and every age, then advice", order.join("/") === "命格一句話/命盤總論/性格與天賦/事業與財運/感情與婚姻/六親與人際/健康與作息/大運/開運建議/給你的三句話" && await rd.p.isVisible("#ai-body .ai-sec.motto"), order.join("/"));
const nowCards = await rd.p.$$("#ai-body .ai-decade.now");
check("the 大運 come as cards from this one on, and this one is open at its years", (await rd.p.$$("#ai-body .ai-decade")).length >= 5 && nowCards.length === 1 && await nowCards[0].$eval("details.ai-years", d => d.open) && /重點/.test(await nowCards[0].textContent()));
const firstAge = await rd.p.textContent("#ai-body .ai-years li");
check("every age from now to 85 has its good things and what to watch", (await rd.p.$$("#ai-body .ai-years li")).length === ages && firstAge.includes(`${NOW - 1988} 歲`) && firstAge.includes(`好事${LINE.好事}`) && firstAge.includes(`要注意${LINE.要注意}`), `${(await rd.p.$$("#ai-body .ai-years li")).length} of ${ages}`);
check("the reading ends with its notice, and nothing is left waiting", /不是預言/.test(await rd.p.textContent("#ai-body")) && (await rd.p.textContent("#ai-status")) === "" && !/＊/.test(await rd.p.textContent("#ai-body")));

// AI 合婚: both births, three parts, the engine's verdict and ten years for the two of them.
let n = readingSent.length;
await rd.p.click("#ai-match > summary");
await rd.p.click("#ai-match-go");
await rd.p.waitForFunction(() => document.querySelectorAll("#ai-body .ai-luck li").length === 10 && !document.querySelector("#ai-body .ai-wait"), null, { timeout: 30000 });
const match = sentFrom(n);
check("合婚 asks for its three parts with both births and no names", match.length === 3 && match.map(b => b.part).join() === "m1,m2,myears" && match.every(b => b.kind === "match" && b.birth.y === 1988 && JSON.stringify(b.partner) === JSON.stringify({ y: 1990, m: 5, d: 20, time: { shichen: "wu" }, sex: "female" })) && !readingSent.some(b => /陳志明|志明|小美/.test(b)), JSON.stringify(match[0] && match[0].partner));
const matchText = await rd.p.textContent("#ai-body");
check("after 合婚, 完整解讀 is offered to come back to the reading, and 先看重點 still is not", await rd.p.isVisible("#ai-full") && await rd.p.isHidden("#ai-short"));
check("合婚 shows the verdict, its sections and the next ten years for both", await rd.p.isVisible("#ai-body .ai-chips .tone") && (await rd.p.$$("#ai-body .ai-sec")).length === 6 && /合婚一句話/.test(matchText) && /給你們的建議/.test(matchText) && new RegExp(`${NOW} 年.*你 ${NOW - 1988} 歲.*對方 ${NOW - 1990} 歲`).test(matchText));
n = readingSent.length;
await rd.p.fill("#ai-p-date", "");
await rd.p.click("#ai-match-go");
await rd.p.waitForTimeout(1200);
check("合婚 without the other birthday asks for it next to the form, where nothing writes over it, and sends nothing", readingSent.length === n && await rd.p.isVisible("#ai-p-error") && /請先填另一半的出生日期/.test(await rd.p.textContent("#ai-p-error")) && !/請先填/.test(await rd.p.textContent("#ai-status")));
await rd.p.click("#ai-full");
check("a reading already written comes back without asking again", readingSent.length === n && (await rd.p.$$("#ai-body .ai-years li")).length === ages && (await rd.p.textContent("#ai-status")) === "" && await rd.p.isHidden("#ai-full"));
// The same chart lived again: its reading is there at once, and nothing is asked again.
async function liveAgain(p, before = null) {
  await p.click("#again-same");
  await p.waitForSelector("#play:not([hidden])");
  if (before) await before();
  await p.click("#c-skip");
  await ended(p, 45000);
  await p.waitForTimeout(300);
}
await liveAgain(rd.p);
check("living the same chart again shows its reading at once and asks for nothing", readingSent.length === n && (await rd.p.$$("#ai-body .ai-years li")).length === ages && (await rd.p.textContent("#ai-status")) === "" && await rd.p.isHidden("#ai-full"));
// Turned off in the play bar: the end page sends nothing until a button is pressed, and remembers the choice.
await liveAgain(rd.p, () => rd.p.uncheck("#c-ai"));
check("with 結局自動 AI 解讀 off, the end page sends nothing and offers both readings under the button consent line", readingSent.length === n && await rd.p.isVisible("#ai-short") && await rd.p.isVisible("#ai-full") && /按下按鈕/.test(await rd.p.textContent("#ai-consent")) && (await rd.p.textContent("#ai-body")) === "" && (await rd.p.textContent("#ai-status")) === "" && await rd.p.evaluate(() => localStorage.getItem("bazi-life.aiAuto")) === "0");
check("with it off, AI 合婚 opens again with the partner filled in", await rd.p.$eval("#ai-match", d => d.open) && await rd.p.inputValue("#ai-p-date") === "1990-05-20");
// A part that fails the checker can be written again on its own.
failOnce.add("short");
await rd.p.click("#ai-short");
await rd.p.waitForSelector('#ai-body [data-ai-retry="short"]', { timeout: 10000 });
check("a part that fails the checker says so, with a button to write it again", /沒有通過自動檢查/.test(await rd.p.textContent("#ai-body")) && /有 1 段沒寫好/.test(await rd.p.textContent("#ai-status")));
await rd.p.click('#ai-body [data-ai-retry="short"]');
await rd.p.waitForSelector("#ai-body .ai-sec.motto", { timeout: 10000 });
check("重寫這一段 asks for that part again, and it shows", readingSent.length === n + 2 && sentFrom(n).every(b => b.part === "short") && (await rd.p.$$("#ai-body .ai-sec")).length === 2 && /這是重點版/.test(await rd.p.textContent("#ai-status")));
n = readingSent.length;
await rd.p.click("#ai-full");
check("with it off, 完整解讀 still brings back the reading already written", readingSent.length === n && (await rd.p.$$("#ai-body .ai-years li")).length === ages);
// From the end page to the 合婚 tab: you and the partner of the AI card, the full 合婚 at once, then AI 深度合婚.
await rd.p.fill("#ai-p-date", "1990-05-20");
await rd.p.click("#ai-match-tab");
await rd.p.waitForSelector("#match:not([hidden]) .hh-hero", { timeout: 10000 });
check("到「合婚」分頁 opens the 合婚 tab with you and the partner, and the 合婚 at once", await rd.p.getAttribute("#tab-match", "aria-selected") === "true" && await rd.p.isHidden("#end") && await rd.p.inputValue("#ma-date") === "1988-02-15" && await rd.p.inputValue("#mb-date") === "1990-05-20" && await rd.p.inputValue("#mb-shichen") === "wu");
n = readingSent.length;
await rd.p.click("#hh-ai-btn");
await rd.p.waitForFunction(() => document.querySelectorAll("#hh-ai-body .ai-luck li").length === 10 && !document.querySelector("#hh-ai-body .ai-wait"), null, { timeout: 30000 });
const deep = sentFrom(n);
check("AI 深度合婚 sends both births with the other person's birthplace, and no names", deep.length === 3 && deep.map(b => b.part).join() === "m1,m2,myears" && deep.every(b => b.kind === "match" && b.partner && b.partner.place === "臺北市" && b.partner.y === 1990) && !readingSent.slice(n).some(b => /陳志明|志明|小美/.test(b)), JSON.stringify(deep[0] && deep[0].partner));
check("AI 深度合婚 shows its sections and the ten years", (await rd.p.$$("#hh-ai-body .ai-sec")).length === 6 && /不是預言/.test(await rd.p.textContent("#hh-ai-body")) && (await rd.p.textContent("#hh-ai-status")) === "");
await rd.p.close();
// Out of today's quota: the reading the end page started by itself takes the AI card away without a word, and for the
// rest of the UTC day this tab neither shows the AI parts nor sends anything.
async function readingPage(answer) {
  const p = (await servedPage(route => route.fulfill(ok))).p, bodies = [];
  await p.route("**/api/reading", route => { const body = route.request().postData() || ""; bodies.push(JSON.parse(body || "{}")); return answer(route, body); });
  return { p, bodies };
}
const viaWorker = async (route, body) => {
  const res = await readingWorker.fetch(new Request(`${siteOrigin}/api/reading`, { method: "POST", headers: { "content-type": "application/json", origin: siteOrigin }, body }), readingEnv);
  return route.fulfill({ status: res.status, contentType: "application/json", body: await res.text() });
};
const QUOTA = route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"quota"}' });
const TODAY = new Date().toISOString().slice(0, 10), FULL = partsFor("full", 1988, NOW).length;
async function toEnd(p, before = null) {
  await p.waitForSelector("#play:not([hidden])");
  if (before) await before();
  await p.click("#c-skip");
  await ended(p, 45000);
  await p.waitForTimeout(300);
}
const quota = await readingPage(QUOTA);
await quota.p.click("#c-skip");
await ended(quota.p, 45000);
await quota.p.waitForSelector("#ai", { state: "hidden", timeout: 10000 });
check("when today's quota is used up, the reading that started by itself takes the AI card away, with no message, and 詳批 stays", quota.bodies.length === FULL && await quota.p.isHidden("#ai") && await quota.p.isVisible("#report") && await quota.p.evaluate(() => sessionStorage.getItem("bazi-life.aiOut")) === TODAY, `${quota.bodies.length} asked`);
const quotaAsked = quota.bodies.length;
await quota.p.click("#again-same");
let boxHidden = false;
await toEnd(quota.p, async () => { boxHidden = await quota.p.isHidden("#c-ai-wrap"); });
check("for the rest of the day the play screen has no AI box, and the end page has no AI card and sends nothing", boxHidden && await quota.p.isHidden("#ai") && quota.bodies.length === quotaAsked);
await quota.p.reload();
await quota.p.click("#form-me button[type=submit]");
await toEnd(quota.p);
check("a reload of the tab still knows the day's quota is used up", await quota.p.isHidden("#ai") && quota.bodies.length === quotaAsked);
await quota.p.click("#again-new");
await quota.p.click("#tab-match");
await quota.p.fill("#ma-date", "1988-02-15");
await quota.p.fill("#mb-date", "1990-05-20");
await quota.p.click("#form-match button[type=submit]");
await quota.p.waitForSelector("#match:not([hidden]) .hh-hero", { timeout: 10000 });
check("the 合婚 tab does not offer AI 深度合婚 while the day's quota is used up", await quota.p.isHidden("#hh-ai") && quota.bodies.length === quotaAsked);
// The next UTC day the mark no longer counts: the reading starts by itself again (and here meets the quota again).
await quota.p.evaluate(() => sessionStorage.setItem("bazi-life.aiOut", "2000-01-01"));
await quota.p.click("#tab-me");
await quota.p.click("#form-me button[type=submit]");
await toEnd(quota.p, async () => { boxHidden = await quota.p.isHidden("#c-ai-wrap"); });
await quota.p.waitForSelector("#ai", { state: "hidden", timeout: 10000 });
check("a mark from an earlier day does not count: the box is back and the reading starts by itself", !boxHidden && quota.bodies.length === quotaAsked + FULL);
await quota.p.close();
// A reading the player asked for (box off) says in one line that the day is used up; pressing again sends nothing.
const asked2 = await readingPage(QUOTA);
await asked2.p.evaluate(() => localStorage.setItem("bazi-life.aiAuto", "0"));
await asked2.p.reload();
await asked2.p.click("#form-me button[type=submit]");
await toEnd(asked2.p);
await asked2.p.click("#ai-full");
await asked2.p.waitForFunction(() => /額度用完/.test(document.querySelector("#ai-status").textContent), null, { timeout: 10000 });
check("a reading the player asked for says the day's quota is used up in one line, with no failed rows", asked2.bodies.length === FULL && await asked2.p.isVisible("#ai") && (await asked2.p.textContent("#ai-body")) === "" && await asked2.p.$eval("#ai-status", el => el.classList.contains("bad")) && /八字命理詳批/.test(await asked2.p.textContent("#ai-status")));
check("after that the card offers nothing more today: no buttons, no AI 合婚, no consent line", await asked2.p.isHidden("#ai-short") && await asked2.p.isHidden("#ai-full") && await asked2.p.isHidden("#ai-match") && await asked2.p.isHidden("#ai-consent") && asked2.bodies.length === FULL);
await asked2.p.evaluate(() => localStorage.removeItem("bazi-life.aiAuto"));
await asked2.p.close();
// The quota runs out partway: the written parts stay, the rest get no red rows, only a calm line.
const partway = await readingPage((route, body) => (/"part":"years/.test(body) ? QUOTA(route) : viaWorker(route, body)));
await partway.p.click("#c-skip");
await ended(partway.p, 45000);
await partway.p.waitForFunction(() => /還有 \d+ 段沒寫到/.test(document.querySelector("#ai-status").textContent), null, { timeout: 30000 });
const YEARS = partsFor("full", 1988, NOW).filter(x => x.startsWith("years")).length;
check("when the quota runs out partway, the written parts stay and the rest are named in one calm line", await partway.p.isVisible("#ai") && /命盤總論/.test(await partway.p.textContent("#ai-body")) && (await partway.p.$$("#ai-body .ai-decade")).length >= 5 && (await partway.p.$$("#ai-body [data-ai-retry], #ai-body .ai-wait.bad")).length === 0 && !(await partway.p.$eval("#ai-status", el => el.classList.contains("bad"))) && new RegExp(`還有 ${YEARS} 段沒寫到`).test(await partway.p.textContent("#ai-status")));
check("and the card offers nothing that could not be written today: no AI 合婚, no buttons, no consent line", await partway.p.isHidden("#ai-match") && await partway.p.isHidden("#ai-short") && await partway.p.isHidden("#ai-full") && await partway.p.isHidden("#ai-consent"));
await partway.p.close();
// Another failure in the same batch as the quota: no 重寫這一段 that could not send, just the calm line for all of them.
const mixed = await readingPage((route, body) => (/"part":"years/.test(body) ? QUOTA(route) : /"part":"a"/.test(body) ? route.fulfill({ status: 502, contentType: "application/json", body: '{"error":"reply"}' }) : viaWorker(route, body)));
await mixed.p.click("#c-skip");
await ended(mixed.p, 45000);
await mixed.p.waitForFunction(() => /還有 \d+ 段沒寫到/.test(document.querySelector("#ai-status").textContent), null, { timeout: 30000 });
check("a part that failed for another reason in the same batch gets no dead 重寫這一段, and is counted in the calm line", (await mixed.p.$$("#ai-body [data-ai-retry], #ai-body .ai-wait.bad")).length === 0 && new RegExp(`還有 ${YEARS + 1} 段沒寫到`).test(await mixed.p.textContent("#ai-status")) && /感情與婚姻/.test(await mixed.p.textContent("#ai-body")));
await mixed.p.close();
// A full reading written before the quota ran out still shows for its chart, with nothing else offered; other charts
// get no card. A 合婚 shown before then loses AI 深度合婚 when its tab is opened again.
const earlier = await readingPage(viaWorker);
await earlier.p.click("#c-skip");
await ended(earlier.p, 45000);
await earlier.p.waitForFunction(() => document.querySelectorAll("#ai-body .ai-years li").length > 10 && !/正在寫/.test(document.querySelector("#ai-status").textContent), null, { timeout: 30000 });
const written = earlier.bodies.length, wroteAges = (await earlier.p.$$("#ai-body .ai-years li")).length;
await earlier.p.click("#again-new");
await earlier.p.click("#tab-match");
await earlier.p.fill("#ma-date", "1988-02-15");
await earlier.p.fill("#mb-date", "1990-05-20");
await earlier.p.click("#form-match button[type=submit]");
await earlier.p.waitForSelector("#match:not([hidden]) .hh-hero", { timeout: 10000 });
const offered = await earlier.p.isVisible("#hh-ai-btn");
await earlier.p.evaluate(() => sessionStorage.setItem("bazi-life.aiOut", new Date().toISOString().slice(0, 10)));
await earlier.p.click("#tab-me");
await earlier.p.click("#tab-match");
check("a 合婚 shown before the quota ran out drops AI 深度合婚 when its tab is opened again", offered && await earlier.p.isHidden("#hh-ai"));
await earlier.p.click("#tab-me");
await earlier.p.click("#form-me button[type=submit]");
await toEnd(earlier.p);
check("the same chart's full reading, written earlier, still shows with nothing else offered and nothing sent", await earlier.p.isVisible("#ai") && (await earlier.p.$$("#ai-body .ai-years li")).length === wroteAges && await earlier.p.isHidden("#ai-go") && await earlier.p.isHidden("#ai-consent") && await earlier.p.isHidden("#ai-match") && earlier.bodies.length === written);
await earlier.p.click("#again-new");
await earlier.p.click("#tab-random");
await earlier.p.click("#go-random");
await toEnd(earlier.p);
check("another chart the same day gets no AI card and sends nothing", await earlier.p.isHidden("#ai") && earlier.bodies.length === written);
await earlier.p.close();
// AI 深度合婚 meeting the quota partway: what was written stays, one calm line, the button goes, the day is marked.
const deepq = await readingPage((route, body) => (/"part":"m1"/.test(body) ? viaWorker(route, body) : QUOTA(route)));
await toEnd(deepq.p, () => deepq.p.uncheck("#c-ai"));
await deepq.p.click("#again-new");
await deepq.p.click("#tab-match");
await deepq.p.fill("#ma-date", "1988-02-15");
await deepq.p.fill("#mb-date", "1990-05-20");
await deepq.p.click("#form-match button[type=submit]");
await deepq.p.waitForSelector("#match:not([hidden]) .hh-hero", { timeout: 10000 });
await deepq.p.click("#hh-ai-btn");
await deepq.p.waitForFunction(() => /還有 \d+ 段沒寫到/.test(document.querySelector("#hh-ai-status").textContent), null, { timeout: 30000 });
check("AI 深度合婚 meeting the quota keeps what was written, says the rest in one calm line, and puts the button away", /合婚一句話/.test(await deepq.p.textContent("#hh-ai-body")) && (await deepq.p.$$("#hh-ai-body [data-ai-retry], #hh-ai-body .ai-wait.bad")).length === 0 && /還有 2 段沒寫到/.test(await deepq.p.textContent("#hh-ai-status")) && await deepq.p.isHidden("#hh-ai-btn") && await deepq.p.evaluate(() => sessionStorage.getItem("bazi-life.aiOut")) === new Date().toISOString().slice(0, 10));
await deepq.p.close();
// A model that fails for a moment (503 without "quota") on some parts: the written parts stay, the others can be
// written again, and nobody is told to come back tomorrow.
const flaky = await readingPage((route, body) => (/"part":"years/.test(body) ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' }) : viaWorker(route, body)));
await flaky.p.click("#c-skip");
await ended(flaky.p, 45000);
await flaky.p.waitForFunction(() => /段沒寫好/.test(document.querySelector("#ai-status").textContent), null, { timeout: 30000 });
const flakyBody = await flaky.p.textContent("#ai-body"), yearParts = partsFor("full", 1988, NOW).filter(x => x.startsWith("years")).length;
check("a part the model failed once keeps the written parts and offers 重寫這一段, without 'come back tomorrow'", /命盤總論/.test(flakyBody) && (await flaky.p.$$("#ai-body .ai-decade")).length >= 5 && (await flaky.p.$$("#ai-body [data-ai-retry]")).length === yearParts && /現在寫不了/.test(flakyBody) && !/額度|明天/.test(flakyBody + await flaky.p.textContent("#ai-status")), `${(await flaky.p.$$("#ai-body [data-ai-retry]")).length} retry rows`);
await flaky.p.close();
// Turned off once, it stays off after a reload: nothing is sent until it is ticked again. Then lives skipped through
// quickly start by themselves only while their parts fit in the Worker's 20 a minute.
const remembered = await readingPage(viaWorker);
await remembered.p.evaluate(() => localStorage.setItem("bazi-life.aiAuto", "0"));
await remembered.p.reload();
await remembered.p.click("#form-me button[type=submit]");
await remembered.p.waitForSelector("#play:not([hidden])");
const wasOff = !(await remembered.p.isChecked("#c-ai"));
await remembered.p.click("#c-skip");
await ended(remembered.p, 45000);
await remembered.p.waitForTimeout(300);
check("turned off and reloaded, the box stays off and the end page sends nothing", wasOff && remembered.bodies.length === 0 && await remembered.p.isVisible("#ai-full") && await remembered.p.isVisible("#ai-short"));
await remembered.p.click("#again-same");
await remembered.p.waitForSelector("#play:not([hidden])");
await remembered.p.check("#c-ai");
await remembered.p.click("#c-skip");
await ended(remembered.p, 45000);
await remembered.p.waitForTimeout(300);
const firstParts = partsFor("full", 1988, NOW).length;
check("ticked again, the next end page writes the reading by itself and remembers it", remembered.bodies.length === firstParts && await remembered.p.evaluate(() => localStorage.getItem("bazi-life.aiAuto")) === "1");
let held = null;
for (let k = 0; k < 6 && !held; k++) {
  const before = remembered.bodies.length;
  await remembered.p.click("#again-new");
  await remembered.p.click("#tab-random");
  await remembered.p.click("#go-random");
  await remembered.p.waitForSelector("#play:not([hidden])");
  await remembered.p.click("#c-skip");
  await ended(remembered.p, 45000);
  await remembered.p.waitForTimeout(300);
  if (await remembered.p.isVisible("#ai-short")) held = { before, after: remembered.bodies.length, status: await remembered.p.textContent("#ai-status"), consent: await remembered.p.textContent("#ai-consent") };
}
check("lives skipped through quickly stop starting by themselves before the Worker's 20 parts a minute, and say so", held && held.after === held.before && held.before <= 20 && /這一分鐘已經寫了好幾份解讀/.test(held.status) && /按下按鈕/.test(held.consent), JSON.stringify(held));
await remembered.p.close();
// As on the site: AI 分析報告 and AI 深度合婚 say 敬請期待, nothing is sent to /api/reading, and the visit, the life, the
// ending and each press are counted, as event names only (src/stats.js).
const soon = await fresh({ viewport: { width: 400, height: 900 } }, { soon: true });
const statsSent = [], soonReading = [];
await soon.route("**/api/stats", route => { statsSent.push(JSON.parse(route.request().postData() || "{}")); return route.fulfill({ status: 204 }); });
await soon.route("**/api/reading", route => { soonReading.push(route.request()); return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"soon"}' }); });
await soon.goto(site);
await soon.fill("#f-name", "陳志明");
await soon.click("#form-me button[type=submit]");
await soon.waitForSelector("#play:not([hidden])");
check("while AI 分析報告 is 敬請期待 the play screen offers no 結局自動 AI 解讀", await soon.isHidden("#c-ai-wrap"));
await soon.click("#c-skip");
await ended(soon, 45000);
const soonBefore = await soon.isHidden("#ai-soon-msg");
await soon.click("#ai-soon-btn");
await soon.click("#ai-soon-btn");
check("the end page shows the results and one AI 分析報告 button, which says 敬請期待 and sends no reading", await soon.isHidden("#ai") && await soon.isVisible("#ai-soon") && soonBefore && /敬請期待/.test(await soon.textContent("#ai-soon-msg")) && await soon.isVisible("#report") && !/付費|收費|NT\\$|元|即將推出|敬請期待/.test(await soon.$eval("#ai-soon", el => el.textContent.replace(el.querySelector("#ai-soon-msg").textContent, ""))) && soonReading.length === 0);
await soon.click("#again-new");
await soon.click("#tab-match");
await soon.fill("#ma-date", "1988-02-15");
await soon.fill("#mb-date", "1990-05-20");
await soon.click("#form-match button[type=submit]");
await soon.waitForSelector("#match:not([hidden]) .hh-hero");
await soon.click("#hh-soon-btn");
check("the 合婚 tab shows its result and an AI 深度合婚 button that says 敬請期待", await soon.isHidden("#hh-ai") && /敬請期待/.test(await soon.textContent("#hh-soon-msg")) && soonReading.length === 0);
await soon.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await soon.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
await soon.waitForTimeout(500);
const statsEvents = statsSent.flatMap(b => b.e || []), statsText = JSON.stringify(statsSent);
const countOf = e => statsEvents.filter(x => x === e).length;
check("the visit, the life, the ending and the presses are counted as event names only", countOf("view") === 1 && countOf("visitor") === 1 && countOf("start") >= 1 && countOf("end_u") === 1 && countOf("ai_life") === 2 && countOf("ai_life_u") === 1 && countOf("hehun_u") === 1 && countOf("ai_match_u") === 1 && statsSent.every(b => b.p === "life") && statsSent.some(b => b.s >= 1) && !/1988|1990|陳|志明|臺北/.test(statsText), statsText.slice(0, 160));
const lifeSent = statsSent.map(b => b.life).filter(Boolean);
check("a finished life is sent as its decade, day stem, age and three big things, with a heartbeat while it ran", lifeSent.length === 1 && lifeSent[0].decade === "80 後" && lifeSent[0].stem === "辛" && Number.isInteger(lifeSent[0].age) && typeof lifeSent[0].home === "boolean" && Object.keys(lifeSent[0]).sort().join() === "age,decade,home,kids,married,stem" && countOf("beat") >= 1, JSON.stringify(lifeSent[0]));
await soon.close();

server.close();

// 伴侶合盤: a partner with a birthday gets a bond on the family card, counts over the 100 lives and a report section.
const couple = await fresh({ viewport: { width: 1000, height: 1200 } });
await couple.goto(url);
await couple.click("#family > summary");
check("the partner's sex follows yours until it is picked", await couple.inputValue(".member[data-role=partner] .m-sex") === "female" && (await couple.click("#sex-f"), await couple.inputValue(".member[data-role=partner] .m-sex")) === "male");
await couple.click("#sex-m");
await couple.fill(".member[data-role=partner] .m-name", "王小美");
await couple.fill(".member[data-role=partner] .m-date", "1990-05-20");
const partnerHour = ".member[data-role=partner] .m-hour", partnerTime = ".member[data-role=partner] .m-time";
check("a family birth time starts as 時辰不詳, with 填確切時間 and the 13 時辰 in the list", await couple.inputValue(partnerHour) === "" && (await couple.$$(`${partnerHour} option`)).length === 15 && await couple.isHidden(partnerTime));
await couple.selectOption(partnerHour, "clock");
const clockShown = await couple.isVisible(partnerTime);
await couple.selectOption(partnerHour, "wu");
check("填確切時間 opens a time box; picking 午時 closes it again", clockShown && await couple.isHidden(partnerTime));
await couple.fill("#f-met", "2014");
await couple.fill("#f-wed", "2012");
await couple.click("#form-me button[type=submit]");
check("a wedding year before the year you got together is refused", /不能早於/.test(await couple.textContent("#error")));
await couple.fill("#f-wed", "2018");
await couple.click("#form-me button[type=submit]");
await couple.waitForSelector("#play:not([hidden])");
await couple.click("#c-skip");
for (let i = 0; i < 200 && !(await couple.isVisible("#end")); i++) {
  await couple.waitForSelector("#choice:not([hidden]), #end:not([hidden])", { timeout: 45000 });
  if (await couple.isVisible("#choice .options button")) await couple.click("#choice .options button");
  await couple.click("#c-skip", { timeout: 3000 }).catch(() => {});
}
await ended(couple, 45000);
const coupleCard = await couple.textContent("#personal");
const wedCount = Number((/次和王小美在一起，其中 (\d+) 次結婚/.exec(coupleCard) || [])[1]);
check("the family card shows the partner's bond and the 100-run counts; with a wedding year nearly every run marries", /伴侶（王小美）/.test(coupleCard) && wedCount >= 90, `married ${wedCount}`);
const coupleSections = await couple.$$eval("#report details.sec > summary", els => els.map(e => e.textContent));
check("the report has a 伴侶合盤 section", coupleSections.includes("伴侶合盤"), coupleSections.join(" / "));
check("the partner's 午時 is used: the 伴侶合盤 reads all eight characters", !/王小美的時辰不詳/.test(await couple.textContent("#report")));
await couple.close();

// 準爸媽模式: two names compared over the same 100 lives, a slot before 39 weeks refused, then a life with a name.
const baby = await fresh({ viewport: { width: 400, height: 900 } });
await baby.goto(url);
await baby.click("#tab-baby");
check("the 準爸媽 tab shows its own form", await baby.isVisible("#form-baby") && !(await baby.isVisible("#form-me")));
await baby.fill("#b-surname", "林");
const givenInputs = await baby.$$(".b-given");
await givenInputs[0].fill("怡君");
await givenInputs[1].fill("沐希");
await baby.fill("#b-date", "2027-03-15");
await baby.click("#b-parents > summary");
await baby.fill(".member[data-brole=father] .m-date", "1992-08-08");
await baby.selectOption(".member[data-brole=father] .m-hour", "wu");
check("the parents on 準爸媽 can pick a 時辰 too", (await baby.$$(".member[data-brole=mother] .m-hour option")).length === 15 && await baby.isHidden(".member[data-brole=father] .m-time"));
await baby.click("label[for=b-nohour]");
await baby.click("label:has(#b-tmode-shichen)");
await baby.selectOption("#b-shichen", "hai");
await baby.click("#b-slots > summary");
await baby.fill("#b-due", "2027-03-22");
const slotInputs = await baby.$$("#slot-list .s-when");
await slotInputs[0].fill("2027-03-14T09:00");
await baby.click("#form-baby button[type=submit]");
check("a birth slot before 39 weeks is refused with the reason", /還不到 39 週/.test(await baby.textContent("#error")) && await baby.isHidden("#baby"));
await slotInputs[0].fill("2027-03-16T15:00");
await baby.click("#form-baby button[type=submit]");
await baby.waitForSelector("#baby-advice .advice", { timeout: 60000 });
await baby.waitForSelector(".slot-card .rank", { timeout: 60000 });
const babyCards = await baby.$$eval(".name-card", els => els.map(e => e.textContent.replace(/\s+/g, "")));
check("both names get a score and their 100 lives", babyCards.length === 2 && babyCards.every(t => /\d+分/.test(t) && /結婚\d+次/.test(t) && /離婚\d+次/.test(t)), babyCards.map(t => t.slice(0, 12)).join(" | "));
check("the comparison opens with the baby-to-be in a pixel crib", await painted(baby, "#baby-scene"));
check("a birth hour picked as a 時辰 reads 「亥時」", /2027 年 3 月 15 日 亥時在臺北市出生/.test(await baby.textContent("#baby-lede")), await baby.textContent("#baby-lede"));
check("the advice compares the names and says names matter little", /差別最多 \d+ 次/.test(await baby.textContent("#baby-advice")) && /±5%/.test(await baby.textContent("#baby-advice")));
check("the slot comparison carries the medical note and leaves out lifespan", /醫師的醫療判斷/.test(await baby.textContent("#baby-slots")) && /不比較壽命和健康/.test(await baby.textContent("#baby-slots")));
check("the baby's report is shown for a name", (await baby.$$("#baby-report .paipan tbody tr")).length === 10 && /林怡君/.test(await baby.textContent("#baby-report h3")));
await baby.click('[data-start="1"]');
await baby.waitForSelector("#play:not([hidden])");
check("a name starts the baby's life", /林沐希在臺北市出生/.test(await baby.textContent("#born")) && await baby.isHidden("#baby"));
await baby.close();

// 合婚分頁: two birthdays, the full 合婚 from the engine at once (no network): the type and score, six dimensions, nine
// checks, the two people, the guide and ten years. The AI part says where it is offered; the pair can start a life
// with the other person as the only partner before you meet.
const hh = await fresh({ viewport: { width: 400, height: 900 } });
await hh.goto(url);
await hh.click("#tab-match");
check("with nothing typed in 我的人生, the 合婚 form starts empty instead of the example birthday", await hh.inputValue("#ma-date") === "" && await hh.inputValue("#mb-date") === "" && await hh.inputValue("#ma-name") === "");
await hh.click("#tab-me");
await hh.fill("#f-name", "陳志明");
await hh.click("#family > summary");
await hh.fill(".member[data-role=partner] .m-name", "王小美");
await hh.fill(".member[data-role=partner] .m-date", "1990-05-20");
await hh.selectOption(".member[data-role=partner] .m-hour", "wu");
await hh.click("#tab-match");
check("the 合婚 tab shows its own form, filled in from 我的人生 and its partner", await hh.isVisible("#form-match") && await hh.isHidden("#form-me") && await hh.inputValue("#ma-date") === "1988-02-15" && await hh.inputValue("#ma-time") === "23:30" && await hh.inputValue("#ma-name") === "陳志明" && await hh.inputValue("#mb-date") === "1990-05-20" && await hh.inputValue("#mb-shichen") === "wu" && await hh.isChecked("#mb-sex-f") && await hh.inputValue("#mb-name") === "王小美");
await hh.fill("#mb-date", "");
await hh.click("#form-match button[type=submit]");
check("合婚 without the other birthday asks for it", /請填對方的出生日期/.test(await hh.textContent("#error")) && await hh.isHidden("#match"));
await hh.fill("#mb-date", "1990-05-20");
await hh.click("#form-match button[type=submit]");
await hh.waitForSelector("#match:not([hidden]) .hh-hero");
const hhText = await hh.textContent("#hh-body");
check("the 合婚 opens with the type, the score and three chips, with the names typed", /型$/.test(await hh.textContent(".hh-label")) && /^\d+$/.test(await hh.textContent(".hh-num")) && (await hh.$$(".hh-chips span")).length === 3 && /陳志明/.test(hhText) && /王小美/.test(hhText));
check("the score is shown part by part, eight parts", (await hh.$$(".hh-bar")).length === 8 && /夫妻宮・日柱/.test(hhText) && /命卦/.test(hhText));
check("six dimensions on a radar, each with what fits, what to watch and something to try", (await hh.$$(".hh-dim")).length === 6 && await hh.isVisible(".hh-radar") && await hh.$$eval(".hh-dim", els => els.every(e => /優勢/.test(e.textContent) && /要留意/.test(e.textContent) && /這週試試/.test(e.textContent))));
const hhChecks = await hh.$$eval(".hh-check", els => els.map(e => [e.querySelector(".t").textContent, e.querySelector(".hh-tag").textContent]));
check("nine traditional checks, 主要 first and 民俗 last", hhChecks.length === 9 && hhChecks[0][0] === "夫妻宮（日支）" && hhChecks.slice(0, 3).every(c => c[1] === "主要") && hhChecks.slice(6).every(c => c[1] === "民俗") && hhChecks[8][0] === "命卦（呂才合婚）", hhChecks.map(c => c.join(":")).join(" "));
check("the two people, the guide and the ten years", (await hh.$$(".hh-love")).length === 2 && (await hh.$$(".hh-guide > div")).length === 5 && (await hh.$$(".hh-strip .yr")).length === 10 && (await hh.$$(".hh-years li")).length === 10);
check("宜婚年份, the months, luck together and the age note", /大利月是/.test(hhText) && /不需要買任何開運物品/.test(hhText) && /年齡差小知識/.test(hhText));
check("nothing in the 合婚 judges the couple", !/剋夫|剋妻|下等婚|上等婚|不宜|大凶|離婚|外遇|化解|改運/.test(hhText));
check("on a page without the Worker the AI part says where it is offered", await hh.isHidden("#hh-ai-btn") && /只在命盤人生的網站上提供/.test(await hh.textContent("#hh-ai-status")));
check("the 合婚 page fits a phone", await hh.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
await hh.check("#mb-sex-m");
await hh.click("#form-match button[type=submit]");
await hh.waitForFunction(() => /伴侶星/.test(document.querySelector("#hh-body").textContent));
check("two people of the same sex read 伴侶星, and the 行嫁月 says it does not apply", /這裡不適用/.test(await hh.textContent("#hh-body")));
check("the life panel tells a same-sex couple about 2019", await hh.isVisible("#hh-life-same") && /2019 年 5 月/.test(await hh.textContent("#hh-life-same")));
await hh.check("#mb-sex-f");
await hh.click("#tab-me");
const hhHiddenElsewhere = await hh.isHidden("#match");
await hh.click("#tab-match");
check("the 合婚 result shows only under its tab", hhHiddenElsewhere && await hh.isVisible("#match"));
await hh.reload();
check("after a reload the 合婚 tab and form come back", await hh.getAttribute("#tab-match", "aria-selected") === "true" && await hh.inputValue("#mb-date") === "1990-05-20" && await hh.inputValue("#ma-name") === "陳志明" && await hh.isChecked("#mb-sex-f"), JSON.stringify(await hh.evaluate(() => ({ tab: sessionStorage.getItem("bazi-life.tab"), sel: document.querySelector("#tab-match").getAttribute("aria-selected"), form: !document.querySelector("#form-match").hidden, mb: document.querySelector("#mb-date").value, match: sessionStorage.getItem("bazi-life.match"), keys: Object.keys(sessionStorage) }))));
await hh.click("#form-match button[type=submit]");
await hh.waitForSelector("#match:not([hidden]) .hh-hero");
check("the life panel has the other person's name and says nobody else comes first", await hh.inputValue("#hh-life-name") === "王小美" && /不會有別的戀愛對象/.test(await hh.textContent("#hh-life-box")) && await hh.isHidden("#hh-life-same"));
await hh.fill("#hh-life-name", "");
await hh.click("#hh-life");
check("the life asks for a name for the other person", /請幫對方取個名字/.test(await hh.textContent("#hh-life-error")) && await hh.isVisible("#match") && await hh.isHidden("#play"));
await hh.fill("#hh-life-name", "王小美");
await hh.fill("#hh-life-met", "1999");
await hh.click("#hh-life");
check("a year you got together before you were both 14 is turned away", /開始交往的年份要在你們都滿 14 歲以後（2004 年以後）/.test(await hh.textContent("#hh-life-error")) && await hh.isHidden("#play"), await hh.textContent("#hh-life-error"));
await hh.fill("#hh-life-met", "2012");
await hh.click("#hh-life");
await hh.waitForSelector("#play:not([hidden])");
check("用這對伴侶過一生 starts your life with the other person as the partner", await hh.isHidden("#match") && await hh.isHidden("#setup") && /1988 年 2 月 15 日/.test(await hh.textContent("#born")));
await hh.click("#c-skip");
await ended(hh, 45000);
const hhLife = await hh.$$eval("#feed li", els => els.map(e => [Number(e.dataset.age), e.textContent]));
const hhMet = hhLife.find(([age, t]) => age === 24 && /小美/.test(t));
const hhLast = Math.max(...hhLife.map(([age]) => age));
check("小美 comes into the story in 2012 (at 24), and nobody before", hhLast < 24 || (!!hhMet && !hhLife.some(([age, t]) => age < 24 && /開始交往|就在一起了|跟你告白/.test(t))), hhMet ? hhMet[1] : `ended at ${hhLast}`);
await hh.close();

// 夜子時: offered only near midnight; it keeps a 23:30 birth on that day in the 詳批, names the other school's day pillar,
// and comes along to the 合婚 tab.
const zi = await fresh({ viewport: { width: 400, height: 900 } });
await zi.goto(url);
await zi.fill("#f-date", "1988-02-15");
await zi.fill("#f-time", "12:00");
const ziNoon = await zi.isHidden("#f-latezi-wrap");
await zi.fill("#f-time", "23:30");
const ziNight = await zi.isVisible("#f-latezi-wrap");
// The chart decides, not the clock hour: 烏魯木齊 01:30 is 23:24 the evening before, 臺北 22:30 is still before 23:00.
await zi.fill("#f-date", "1995-05-10");
await zi.fill("#f-time", "01:30");
await zi.selectOption("#f-place", "烏魯木齊（北京時間）");
const ziFar = await zi.isVisible("#f-latezi-wrap");
await zi.selectOption("#f-place", "臺北市");
await zi.fill("#f-date", "2000-01-01");
await zi.fill("#f-time", "22:30");
const ziEarly = await zi.isHidden("#f-latezi-wrap");
check("夜子時 shows when true solar time is after 23:00, wherever the clock says", ziFar && ziEarly);
// An empty time box is not midnight: it asks for the time.
await zi.fill("#f-time", "");
await zi.click("#form-me button[type=submit]");
check("an empty birth time asks for the time instead of using 00:00", /請輸入出生時間/.test(await zi.textContent("#error")) && await zi.isHidden("#play"));
await zi.fill("#f-date", "1988-02-15");
await zi.fill("#f-time", "23:30");
await zi.check("#f-latezi");
await zi.click("#form-me button[type=submit]");
await zi.waitForSelector("#play:not([hidden])");
await zi.click("#c-skip");
await ended(zi, 45000);
const ziReport = await zi.textContent("#report");
check("夜子時 is offered only near midnight, and the 詳批 keeps a 23:30 birth on that day and names the other day pillar", ziNoon && ziNight && /採夜子時/.test(ziReport) && /庚子/.test(ziReport) && /若 23 點換日，日柱是辛丑/.test(ziReport), ziReport.slice(0, 80));
await zi.click("#again-new");
await zi.click("#tab-match");
check("the 合婚 tab brings 夜子時 over from 我的人生", await zi.isChecked("#ma-latezi") && await zi.isVisible("#ma-latezi-wrap"));
// The other person's birthplace and 夜子時 stay with them: into 用這對伴侶過一生, and back to the 合婚 tab from its end
// page. 烏魯木齊 2000-06-21 01:30 is 23:18 the evening before, so with 夜子時 their day is 己酉 (in 臺北 it would be 庚戌).
await zi.fill("#mb-date", "2000-06-21");
await zi.uncheck("#mb-nohour");
await zi.check("#mb-tmode-clock");
await zi.fill("#mb-time", "01:30");
await zi.selectOption("#mb-place", "烏魯木齊（北京時間）");
await zi.check("#mb-sex-f");
await zi.check("#mb-latezi");
await zi.click("#form-match button[type=submit]");
await zi.waitForSelector("#match:not([hidden]) .hh-hero");
const ziMatch = await zi.textContent("#hh-body");
await zi.fill("#hh-life-name", "林小雨");
await zi.click("#hh-life");
await zi.waitForSelector("#play:not([hidden])");
await zi.click("#c-skip");
await ended(zi, 45000);
await zi.evaluate(() => { const d = document.querySelector("#ai-match"); d.hidden = false; d.open = true; });
await zi.click("#ai-match-tab");
await zi.waitForSelector("#match:not([hidden]) .hh-hero", { timeout: 10000 });
check("the other person's birthplace and 夜子時 come through their life and back to the 合婚 tab", /己酉/.test(ziMatch) && await zi.isChecked("#mb-latezi") && /己酉/.test(await zi.textContent("#hh-body")) && await zi.inputValue("#mb-time") === "01:30" && await zi.inputValue("#mb-place") === "烏魯木齊（北京時間）");
await zi.close();

// 填到一半重新整理: the forms and the tab come back; 清空重填 clears them; nothing personal stays after the tab.
const draft = await fresh({ viewport: { width: 400, height: 900 } });
await draft.goto(url);
await draft.fill("#f-name", "陳志明");
await draft.click("#family > summary");
await draft.fill(".member[data-role=partner] .m-name", "王小美");
await draft.fill("#f-wed", "2016");
await draft.click("#add-sibling");
await draft.fill("#sibling-list .member:last-child .m-name", "陳小華");
await draft.selectOption(".member[data-role=father] .m-hour", "wu");
await draft.selectOption("#sibling-list .member:last-child .m-hour", "clock");
await draft.fill("#sibling-list .member:last-child .m-time", "06:15");
await draft.click("#tab-baby");
await draft.fill("#b-surname", "林");
await (await draft.$$(".b-given"))[1].fill("沐希");
await draft.reload();
check("after a reload the open tab and the 準爸媽 form come back", await draft.getAttribute("#tab-baby", "aria-selected") === "true" && await draft.inputValue("#b-surname") === "林" && await (await draft.$$(".b-given"))[1].inputValue() === "沐希");
await draft.click("#tab-me");
check("after a reload the family's 時辰 and exact times come back", await draft.inputValue(".member[data-role=father] .m-hour") === "wu" && await draft.inputValue("#sibling-list .member:last-child .m-hour") === "clock" && await draft.inputValue("#sibling-list .member:last-child .m-time") === "06:15" && await draft.isVisible("#sibling-list .member:last-child .m-time") && await draft.isHidden(".member[data-role=father] .m-time"));
check("after a reload the birth form, the partner and the siblings come back", await draft.inputValue("#f-name") === "陳志明" && await draft.inputValue(".member[data-role=partner] .m-name") === "王小美" && await draft.inputValue("#f-wed") === "2016" && await draft.inputValue("#sibling-list .member:last-child .m-name") === "陳小華" && await draft.evaluate(() => document.querySelector("#family").open));
const stores = await draft.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
check("the half-filled forms are kept in this tab only, with nothing personal in long-term storage", stores.local.every(k => ["bazi-life.welcomed", "bazi-life.majorOnly", "bazi-life.aiAuto", "bazi-life.aiPreview", "bazi-life.lastVisit", "bazi-life.lang"].includes(k)) && stores.session.includes("bazi-life.form"), JSON.stringify(stores));
draft.once("dialog", d => d.accept());
await draft.click("#me-clear");
await draft.reload();
check("清空重填 empties the form for good", await draft.inputValue("#f-name") === "" && (await draft.$$("#sibling-list .member")).length === 0);
await draft.close();

// 時辰 instead of a clock time: kept through a reload, used as the hour pillar, and named in the report.
const sc = await fresh({ viewport: { width: 1100, height: 1300 } });
await sc.goto(url);
check("the birth time starts as a clock time, with 時辰 one tap away", await sc.isChecked("#f-tmode-clock") && await sc.isVisible("#f-time") && await sc.isHidden("#f-shichen"));
await sc.click("label:has(#f-tmode-shichen)");
check("the 時辰 list has 13 choices, 子時 before dawn and late at night", (await sc.$$("#f-shichen option")).length === 13 && await sc.isVisible("#f-shichen") && await sc.isHidden("#f-time"));
await sc.addStyleTag({ content: 'input[type="date"], input[type="time"] { -webkit-appearance: none; appearance: none; display: flex; align-items: center; }' });
check("with the iPhone date-box style, the hidden time boxes stay hidden", await sc.isHidden("#f-time") && await sc.$eval(".member[data-role=father] .m-time", el => getComputedStyle(el).display) === "none");
await sc.selectOption("#f-shichen", "chen");
await sc.reload();
check("a 時辰 picked instead of a clock time comes back after a reload", await sc.isChecked("#f-tmode-shichen") && await sc.inputValue("#f-shichen") === "chen" && await sc.isHidden("#f-time"));
await sc.click("#form-me button[type=submit]");
await sc.waitForSelector("#play:not([hidden])");
await sc.click("#c-skip");
await ended(sc, 45000);
const hourBranch = (await sc.textContent("#report .paipan tbody tr:nth-child(3) td:last-child")).trim();
check("a life born in 辰時 has a 辰 hour pillar and the report says 辰時", hourBranch === "辰" && /1988 年 2 月 15 日 辰時/.test(await sc.textContent("#report")) && /依出生日期與辰時排出的命盤/.test(await sc.textContent("#report-lede")), hourBranch);
await sc.close();

// A question covers the lines printed just before it, so its box repeats the big moments since the last answer.
const rc = await fresh({ viewport: { width: 400, height: 900 } });
await rc.goto(url);
await rc.click("#form-me button[type=submit]");
await rc.waitForSelector("#play:not([hidden])");
await rc.click('[data-speed="10"]');
let recapLines = [], nextRecap = null;
for (let k = 0; k < 150; k++) {
  await rc.waitForSelector("#choice:not([hidden]), #end:not([hidden])", { timeout: 30000 });
  if (await rc.isVisible("#end")) { await rc.waitForSelector("#story:not([hidden])", { timeout: 5000 }).catch(() => {}); if (await rc.isVisible("#story")) await rc.click("#story .skip"); await rc.click("#again-same"); await rc.waitForSelector("#play:not([hidden])"); continue; }
  const lines = await rc.$$eval("#choice .recap li", els => els.map(e => e.textContent));
  if (recapLines.length) { nextRecap = lines; break; }
  if (lines.length) recapLines = lines;
  await rc.click("#choice .options button");
}
const feedText = await rc.textContent("#feed");
check("a question opens with the big moments since the last answer, as told in the story", recapLines.length > 0 && recapLines.length <= 3 && recapLines.every(t => /^\d+ 歲./.test(t) && feedText.includes(t.replace(/^\d+ 歲/, ""))), JSON.stringify(recapLines));
check("after an answer the recap starts over", nextRecap !== null && !nextRecap.some(t => recapLines.includes(t)), JSON.stringify(nextRecap));
// The kinds of question asked are remembered for the next life in this tab: ids only, nothing about the player.
const seenStore = await rc.evaluate(() => ({ session: sessionStorage.getItem("bazi-life.seen"), local: Object.keys(localStorage) }));
const seenLives = (JSON.parse(seenStore.session || "{}").lives) || [];
check("recent lives' question kinds are kept in this tab as ids only, to steer a replay to new questions", seenLives.length >= 1 && seenLives.flat().length >= 2 && seenLives.flat().every(id => /^[A-Za-z][\w]*$/.test(id)) && !seenStore.local.some(k => /seen/.test(k)), JSON.stringify(seenLives).slice(0, 120));
await rc.close();

const phone = await fresh({ viewport: { width: 400, height: 900 }, colorScheme: "dark", deviceScaleFactor: 2 });
await phone.goto(url);
await phone.setViewportSize({ width: 360, height: 900 });
const tabRows = await phone.$eval(".tabs", t => new Set([...t.children].map(b => Math.round(b.getBoundingClientRect().top))).size);
check("the five tabs fit in one row at 360px", tabRows === 1, `${tabRows} rows`);
await phone.setViewportSize({ width: 400, height: 900 });
await phone.click("#family > summary");
await phone.click("#add-sibling");
const formWidth = await phone.evaluate(() => document.documentElement.scrollWidth);
check("the family form fits at phone width", formWidth <= 400, `scrollWidth ${formWidth}`);
if (process.env.SHOTS) await phone.screenshot({ path: `${process.env.SHOTS}/life-form-phone-dark.png`, fullPage: true });
await phone.click("#form-me button[type=submit]");
await phone.waitForSelector("#play:not([hidden])");
const statusHeight = await phone.$eval(".status", el => el.getBoundingClientRect().height);
check("on a phone the scene and the status bar take under 40% of the screen", statusHeight < 360, `${Math.round(statusHeight)}px of 900`);
// The scene stays on screen: the story scrolls in its own box under it. After a choice, the next event comes into view.
check("while a life plays, the scene fills the top and the story scrolls in its own box", await phone.$eval("#play-log", el => getComputedStyle(el).overflowY) === "auto" && await phone.$eval("#play", el => Math.round(el.getBoundingClientRect().top)) === 0);
await firstChoice(phone);
await phone.waitForTimeout(700);
const inBox = await phone.evaluate(() => { const log = document.querySelector("#play-log"), s = document.querySelector(".status").getBoundingClientRect(), c = document.querySelector("#choice").getBoundingClientRect(), l = log.getBoundingClientRect(); return { scrolled: log.scrollTop > 0, scene: Math.abs(s.top) < 5, choice: c.top >= l.top - 1 && c.top < l.bottom, st: Math.round(s.top), y: Math.round(scrollY), play: Math.round(document.querySelector("#play").getBoundingClientRect().top), active: document.activeElement.tagName + "." + document.activeElement.className }; });
check("with years behind it, the story has scrolled, the scene is still at the top and the question is in view", inBox.scrolled && inBox.scene && inBox.choice, JSON.stringify(inBox));
await phone.click("#choice [data-option]");
await phone.waitForTimeout(900);
// The next thing is either the year the choice led to, or at once the next question.
const after = await phone.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(), l = document.querySelector("#play-log").getBoundingClientRect(); return { li: a.matches("#feed li"), q: !!a.closest("#choice:not([hidden])"), top: Math.round(r.top - l.top), inView: r.top >= l.top - 1 && r.top < l.bottom, scene: Math.round(document.querySelector(".status").getBoundingClientRect().top) }; });
check("after a choice, the next event has the focus and is in view under the scene", (after.li || after.q) && after.inView && after.scene === 0, JSON.stringify(after));
await phone.click("#c-skip");
await ended(phone, 45000);
const width = await phone.evaluate(() => document.documentElement.scrollWidth);
check("no sideways scrolling at phone width", width <= 400, `scrollWidth ${width}`);
if (process.env.SHOTS) await phone.screenshot({ path: `${process.env.SHOTS}/life-phone-dark.png`, fullPage: true });
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
