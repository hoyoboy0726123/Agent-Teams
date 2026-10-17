// Browser check of public/life.html (run `npm run build` first).
// PLAYWRIGHT=/path/to/playwright CHROMIUM=/path/to/chrome node test/life.e2e.mjs
// SHOTS=<dir> also saves a desktop (light) and a phone (dark) screenshot of the ending.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const url = pathToFileURL(fileURLToPath(new URL("../public/life.html", import.meta.url))).href;
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
const watch = p => { p.on("pageerror", e => errors.push(e.message)); return p; };
// A fresh page. Unless `welcomed` is false it opens where a returning player lands (我的人生), not on 歡迎.
async function fresh(opts, { welcomed = true } = {}) {
  const p = watch(await browser.newPage(opts));
  if (welcomed) await p.addInitScript(() => { try { localStorage.setItem("bazi-life.welcomed", "1"); } catch {} });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  return p;
}
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
check("a first visit opens on 歡迎: how to play, what is fun, and that the data stays on the phone", await page.isVisible("#welcome") && await page.isHidden("#form-me") && /怎麼玩/.test(welcome) && /好玩的地方/.test(welcome) && /不會上傳到網站後台/.test(welcome) && /沒有帳號、沒有資料庫/.test(welcome));
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
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/life-desktop-light.png`, fullPage: true });

await page.click("#again-same");
await page.waitForSelector("#play:not([hidden])");
await page.click("#c-skip").catch(() => {});
await ended(page, 20000);
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
await ended(page, 20000);
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
for (let i = 0; i < 60 && !(await page.isVisible("#end")); i++) {
  await page.waitForSelector("#choice:not([hidden]), #end:not([hidden])", { timeout: 45000 });
  if (await page.isVisible("#choice .options button")) { asked++; await page.click("#choice .options button"); }
}
await ended(page, 20000);
const majorFeed = await page.textContent("#feed");
check("with 只問人生大事 the big decisions are asked and the rest follow the personality", asked >= 3 && /依你的個性：/.test(majorFeed), `${asked} asked`);
await page.uncheck("#c-major");

// Served over http, as the Worker serves it: /api/interpret answers like worker/index.js would. A Worker that is
// busy or out of quota (503), or a request that fails, leaves the player with the local options, with no message.
const html = await readFile(fileURLToPath(new URL("../public/life.html", import.meta.url)));
const server = createServer((req, res) => {
  if (req.url === "/life.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const site = `http://127.0.0.1:${server.address().port}/life.html`;
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
check("the half-filled forms are kept in this tab only, with nothing personal in long-term storage", stores.local.every(k => ["bazi-life.welcomed", "bazi-life.majorOnly"].includes(k)) && stores.session.includes("bazi-life.form"), JSON.stringify(stores));
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
await ended(sc, 20000);
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
await rc.close();

const phone = await fresh({ viewport: { width: 400, height: 900 }, colorScheme: "dark", deviceScaleFactor: 2 });
await phone.goto(url);
await phone.setViewportSize({ width: 360, height: 900 });
const tabRows = await phone.$eval(".tabs", t => new Set([...t.children].map(b => Math.round(b.getBoundingClientRect().top))).size);
check("the four tabs fit in one row at 360px", tabRows === 1, `${tabRows} rows`);
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
await phone.click("#c-skip");
await ended(phone, 20000);
const width = await phone.evaluate(() => document.documentElement.scrollWidth);
check("no sideways scrolling at phone width", width <= 400, `scrollWidth ${width}`);
if (process.env.SHOTS) await phone.screenshot({ path: `${process.env.SHOTS}/life-phone-dark.png`, fullPage: true });
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
