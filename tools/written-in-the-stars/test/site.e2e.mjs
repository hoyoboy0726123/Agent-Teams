// Browser check of the built site (run `npm run build` first). public/ is served by a tiny local http server;
// /api/live is mocked and /api/stats is caught (and checked to carry no birth data).
//   PLAYWRIGHT=/path/to/playwright CHROMIUM=/path/to/chrome node test/site.e2e.mjs
//   SHOTS=<dir> also saves phone and desktop screenshots of the welcome page, the Big Three, play, the ending and
//   the share card. FONTS=<dir> serves Google Fonts from a local copy (fonts.css + the .woff2 files it names), so the
//   screenshots show the real typeface; without it the font requests are cut and the fallback serif shows.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ADMIN_HTML } from "../worker/admin.js";
import { dayOf } from "../worker/stats.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const SHOTS = process.env.SHOTS || "", FONTS = process.env.FONTS || "";
const results = [];
const check = (name, ok, extra = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };

// ---------- the server ----------
const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const beacons = [];
const ROUTES = { "/": "index.html", "/index.html": "index.html", "/privacy": "privacy.html", "/terms": "terms.html" };
// The back office reads GET /api/stats with the admin key: a day of counts with AI report clicks.
const ADMIN_ROWS = () => [["view", 120], ["visitor", 90], ["form_u", 60], ["start", 50], ["end", 44], ["end_u", 40], ["ai_report", 13], ["ai_report_u", 10]].map(([metric, n]) => ({ day: dayOf(Date.now()), page: "life", metric, n }));
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/admin") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(ADMIN_HTML); return; }
  if (path === "/api/stats" && req.method === "GET") {
    if (req.headers.authorization !== "Bearer test-key") { res.writeHead(401); res.end("{}"); return; }
    const rows = {};
    for (const x of ADMIN_ROWS()) { const k = `${x.day}|${x.page}`; rows[k] = rows[k] || { day: x.day, page: x.page }; rows[k][x.metric] = x.n; }
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ rows: Object.values(rows) })); return;
  }
  // The anonymous counts (beacons skip Playwright's routing, so the server keeps them for the check at the end).
  if (path === "/api/stats" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => { beacons.push(body); res.writeHead(204); res.end(); });
    return;
  }
  if (!ROUTES[path]) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(await readFile(join(PUBLIC, ROUTES[path])));
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const SITE = `http://127.0.0.1:${server.address().port}`;

const LIVE = {
  total: 5210, nowPlaying: 12, today: 348, demo: true,
  todayLives: { n: 348, avgAge: 81, maxAge: 103, married: 67, home: 72, elements: { fire: 90, earth: 80, air: 70, water: 60 } },
  recent: [{ decade: "the ’90s", sun: "Leo", age: 86, married: 1, home: true, kids: 2, ago: 2 }, { decade: "the ’80s", sun: "Pisces", age: 79, married: 0, home: false, kids: 0, ago: 0 }, { decade: "the ’70s", sun: "Taurus", age: 94, married: 2, home: true, kids: 3, ago: 70 }],
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ["--no-proxy-server"] });
const errors = [];
async function fresh(viewport, { colorScheme = "light", live = LIVE } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme, acceptDownloads: true, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(`${viewport.width}: ${e.message}`));
  if (FONTS) await p.route(/fonts\.(googleapis|gstatic)\.com/, async r => {
    const u = new URL(r.request().url());
    if (u.hostname === "fonts.googleapis.com") return r.fulfill({ status: 200, contentType: "text/css", body: await readFile(join(FONTS, "fonts.css")) });
    return r.fulfill({ status: 200, contentType: "font/woff2", body: await readFile(join(FONTS, u.pathname.split("/").pop())).catch(() => Buffer.alloc(0)) });
  });
  else await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.route("**/api/live", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(live) }));
  return p;
}
const shot = async (p, name, opts = {}) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`), ...opts }); };
// Nothing wider than the window: no horizontal scroll, and no element sticking out past the right edge (except inside
// a box that scrolls or clips on purpose).
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = [];
  if (document.documentElement.scrollWidth > W + 1) bad.push(`page ${document.documentElement.scrollWidth}>${W}`);
  for (const el of document.querySelectorAll("body *")) {
    if (!el.getClientRects().length || el.closest("[hidden], .sr")) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= W + 1 || r.width === 0) continue;
    let a = el.parentElement, clipped = false;
    for (; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o !== "visible") { clipped = true; break; } }
    if (!clipped) bad.push(`${el.tagName.toLowerCase()}.${el.className || el.id} ${Math.round(r.right)}>${W}`);
  }
  // Text cut off inside its own box.
  for (const el of document.querySelectorAll("button, h1, h2, h3, .bt-sign, .chip, .pill, dd, .verdict")) {
    if (!el.getClientRects().length || el.closest("[hidden]")) continue;
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== "visible") bad.push(`clipped ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`);
  }
  return bad.slice(0, 6);
});
const painted = (p, sel) => p.$eval(sel, c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > c.width * c.height * 0.9; });
async function fillForm(p, { date = "1995-08-03", time = "14:30", unknown = false, place = "TX|Austin", sex = "#sex-f", name = "" } = {}) {
  if (name) await p.fill("#f-name", name);
  await p.fill("#f-date", date);
  if (unknown) await p.check("#f-unknown"); else await p.fill("#f-time", time);
  await p.selectOption("#f-place", place);
  await p.check(sex);
}
async function untilChoiceOrEnd(p) {
  await p.waitForSelector("#choice:not([hidden]), #end:not([hidden])", { timeout: 60000 });
  return p.isVisible("#choice");
}
async function closeStory(p) {
  await p.waitForSelector("#story:not([hidden])", { timeout: 5000 }).catch(() => {});
  if (await p.isVisible("#story")) await p.click("#story .skip");
}

// ---------- 1. desktop: welcome → form → Big Three → play → a choice → skip → 100 lives → share PNG ----------
{
  const p = await fresh({ width: 1280, height: 900 });
  await p.goto(`${SITE}/`);
  await p.waitForSelector("#live:not([hidden])", { timeout: 5000 }).catch(() => {});
  const welcome = await p.textContent("#welcome");
  check("welcome: hero, the 100-lives tagline, Start my life and Random birth", /Written\s*in\s*the Stars/.test(await p.textContent("#welcome h1")) && /Is your life written in the stars, or just luck\?\s*Live it 100 times\./.test(welcome) && await p.isVisible("#welcome [data-start]") && await p.isVisible("#welcome [data-random]"));
  check("welcome: how it works in 3 steps, a privacy line and the entertainment disclaimer", (await p.$$(".steps li")).length === 3 && /never leaves this device/.test(welcome) && /entertainment and self-reflection only/.test(welcome) && /no proven scientific validity/.test(await p.textContent("footer")));
  check("welcome: live numbers from /api/live (demo mode)", await p.textContent("#live-total") === "5,210" && await p.textContent("#live-now") === "12" && (await p.$$("#live-recent-list li")).length === 3 && /A Leo born in the ’90s/.test(await p.textContent("#live-recent")) && (await p.$$("#live-elements .bar")).length === 4);
  check("welcome: the pixel slideshow is painted", await painted(p, "#welcome-scene"));
  check("welcome (1280): nothing overflows", !(await overflow(p)).length, (await overflow(p)).join("; "));
  await shot(p, "desktop-1-welcome", { fullPage: true });

  await p.click("#welcome .cta [data-start]");
  check("Start my life opens the form, with focus on its heading", await p.isVisible("#setup") && await p.evaluate(() => document.activeElement.id === "setup-title"));
  check("the Big Three waits for a date", /Enter your birth date/.test(await p.textContent("#bt-note")) && (await p.textContent('#bigthree [data-role="sun"] .bt-sign')) === "?");
  await p.fill("#f-date", "1995-08-03");
  check("a date alone reveals the Sun", (await p.textContent('#bigthree [data-role="sun"] .bt-sign')) === "Leo" && (await p.textContent('#bigthree [data-role="rising"] .bt-sign')) === "?");
  await fillForm(p, { name: "Jordan Lee" });
  const sun = await p.textContent('#bigthree [data-role="sun"] .bt-sign'), moon = await p.textContent('#bigthree [data-role="moon"] .bt-sign'), rising = await p.textContent('#bigthree [data-role="rising"] .bt-sign');
  check("the full Big Three shows as soon as the inputs are valid (Aug 3, 1995, 2:30 PM, Austin)", sun === "Leo" && moon === "Scorpio" && rising === "Scorpio" && /That's you/.test(await p.textContent("#bt-note")), `${sun}/${moon}/${rising}`);
  await p.waitForTimeout(700);
  await shot(p, "desktop-2-bigthree", { fullPage: true });
  check("form (1280): nothing overflows", !(await overflow(p)).length, (await overflow(p)).join("; "));

  await p.click("#go");
  await p.waitForSelector("#play:not([hidden])");
  check("play: the scene is fixed on top and painted, with age, year and the profection pill", await painted(p, "#scene") && /^Age \d+$/.test(await p.textContent("#s-age")) && /house/.test(await p.textContent("#s-prof")) && /Lord of the year/.test(await p.textContent("#s-prof")));
  check("play: the story scrolls in its own box", await p.$eval("#play-log", el => getComputedStyle(el).overflowY === "auto"));
  await p.click('[data-speed="10"]');
  let gotChoice = await untilChoiceOrEnd(p);
  for (let k = 0; !gotChoice && k < 3; k++) { await closeStory(p); await p.click("#again-same"); await p.click('[data-speed="10"]'); gotChoice = await untilChoiceOrEnd(p); }
  const options = await p.$$("#choice [data-option]");
  check("a choice offers 2–6 options and the write-your-own box", gotChoice && options.length >= 2 && options.length <= 6 && await p.isVisible("#free-text"), `${options.length} options`);
  check("the first option has the focus", await p.evaluate(() => document.activeElement && document.activeElement.dataset.option === "0"));
  await shot(p, "desktop-3-play");
  await p.fill("#free-text", "quit and travel the world");
  await p.click("#free-go");
  check("written decision: the local matcher offers its closest guesses", (await p.$$("#free-out [data-free-action]")).length >= 2 && /closest|Not sure/.test(await p.textContent("#free-out")));
  await p.fill("#free-text", "honestly I want to kill myself");
  await p.click("#free-go");
  check("safety phrases show the 988 line instead of playing it out", /988/.test(await p.textContent("#free-out")) && await p.$eval('#free-out a[href="tel:988"]', a => !!a));
  const ageBefore = await p.textContent("#s-age");
  await p.click("#choice [data-option='0']");
  await p.waitForTimeout(200);
  const focused = await p.evaluate(() => { const a = document.activeElement; return !!(a && a.closest && a.closest("#feed li")); });
  check("after a choice the story goes on and the next lines take the focus (or the next choice does)", focused || await p.isVisible("#choice"), ageBefore);
  await p.click("#c-skip");
  await p.waitForSelector("#end:not([hidden])", { timeout: 60000 });
  await p.waitForSelector("#story:not([hidden])", { timeout: 5000 }).catch(() => {});
  check("the ending opens the life-in-pictures recap as a dialog with the focus inside", await p.isVisible("#story") && await p.evaluate(() => !!document.activeElement.closest("#story")) && await painted(p, "#story canvas"));
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("Escape");
  check("Escape closes the recap and the focus goes to the ending's title", await p.isHidden("#story") && await p.evaluate(() => document.activeElement.id === "end-title"));
  const title = await p.textContent("#end-title");
  check("ending: “You lived to N.”, facts, and the disclaimer", /^You lived to \d+\.$/.test(title) && (await p.$$("#end-facts div")).length >= 8 && /entertainment and self-reflection only/.test(await p.textContent("#end")), title);
  const legend = await p.textContent("#end .legend");
  check("ending: the life chart has candles and the growth/strain legend", (await p.$$("#plot svg rect")).length > 10 && /Years of growth/.test(legend) && /Years of strain/.test(legend));
  await p.focus("#plot svg");
  await p.keyboard.press("ArrowRight");
  check("the life chart reads year by year from the keyboard", await p.isVisible("#tip") && /Age 0/.test(await p.textContent("#tip")));
  await p.waitForSelector("#cards .card", { timeout: 60000 });
  const cards = await p.$$eval("#cards .card h3", hs => hs.map(h => h.textContent));
  check("100 lives: lifespan, marriage, kids, home and career cards", ["Lifespan", "Marriage", "Kids", "Home", "School and career"].every(c => cards.includes(c)), cards.join(", "));
  check("100 lives: framed as fate vs luck", /Written in the stars/.test(await p.textContent("#fate-head")) && /Just luck/.test(await p.textContent("#fate-head")) && (await p.$$("#cards .verdict")).length >= 4);
  check("the life chart gains the band of the 100 lives", await p.$$eval("#plot svg path", ps => ps.length) >= 1 && await p.$$eval("#plot svg polyline", ps => ps.length) >= 1);
  // The full natal reading, after the fate-vs-luck cards.
  const chapters = await p.$$eval("#reading-body details.chapter", ds => ds.map(d => d.querySelector(".ch-t b").textContent));
  check("reading: seven chapters after the 100 lives, the first open", chapters.join("|") === "Chart overview|The Big Three in depth|Planet by planet|Houses: your twelve life areas|Major aspects|Your timeline|Overall reading" && await p.$eval("#reading-body details.chapter", d => d.open) && await p.evaluate(() => document.querySelector("#hundred").compareDocumentPosition(document.querySelector("#reading")) & Node.DOCUMENT_POSITION_FOLLOWING), chapters.join(", "));
  check("reading: the chart wheel, with 10 planets, 12 signs, aspect lines, a title and the table alternative", await p.$eval("#reading .wheel", s => s.querySelectorAll(".w-planet").length === 10 && s.querySelectorAll(".w-sglyph").length === 12 && s.querySelectorAll(".w-asp").length > 0 && s.getAttribute("role") === "img" && !!s.querySelector("title") && s.getBoundingClientRect().width > 300) && (await p.$$("#reading .r-table tbody tr")).length === 12 && (await p.$$("#reading .r-bar")).length === 7);
  for (const d of await p.$$("#reading-body details.chapter")) await d.evaluate(el => { el.open = true; });
  const reading = await p.textContent("#reading");
  check("reading: the Big Three in depth (Leo Sun, Scorpio Moon, Scorpio rising), planets, houses, aspects", /Sun in Leo · 10th house/.test(reading) && /Moon in Scorpio/.test(reading) && /Scorpio rising/.test(reading) && /Mercury in Leo/.test(reading) && /Saturn in Pisces/.test(reading) && /10th house · Leo/.test(reading) && /sextile|trine|square/.test(reading) && !/undefined|NaN/.test(reading));
  check("reading: the timeline ties the cycles to this life, and looks ahead ten years from today", /Saturn return I · age 29/.test(reading) && (await p.$$("#r-timeline .r-life")).length >= 3 && /you're 31 now/.test(reading) && (await p.$$eval("#r-timeline .r-list:last-of-type li", ls => ls.length)) === 10);
  check("reading (1280): nothing overflows with every chapter open", !(await overflow(p)).length, (await overflow(p)).join("; "));
  if (SHOTS) { await (await p.$("#reading .r-wheel")).screenshot({ path: join(SHOTS, "desktop-wheel.png") }); }
  for (const d of (await p.$$("#reading-body details.chapter")).slice(1)) await d.evaluate(el => { el.open = false; });
  if (SHOTS) await (await p.$("#reading")).screenshot({ path: join(SHOTS, "desktop-reading.png") });
  // The AI report hook: a real-looking button, a friendly message, and the click counted.
  const aiLabel = (await p.textContent("#ai-btn")).trim();
  check("AI card: an “AI Astrology Report” pitch with a “Get my AI report” button (no “soon” on it) and the AI note", aiLabel === "Get my AI report" && !/soon/i.test(await p.textContent("#ai-card h3") + aiLabel) && /An AI astrologer reads your whole chart/.test(await p.textContent("#ai-card")) && /For entertainment and self-reflection\. AI-written\./.test(await p.textContent("#ai-card")) && await p.isHidden("#ai-msg"));
  const sentBefore = beacons.length;
  await p.click("#ai-btn");
  check("AI button: shows “Coming soon!” and points at the reading", /^Coming soon! We're putting the finishing touches on AI reports\. Your full chart reading above is ready now\.$/.test((await p.textContent("#ai-msg")).trim()) && await p.isVisible("#ai-msg"));
  await p.click("#ai-btn");
  await p.waitForTimeout(2600);
  const aiEvents = beacons.slice(sentBefore).flatMap(b => JSON.parse(b).e || []);
  check("AI button: the beacon carries ai_report for each click and ai_report_u once", aiEvents.filter(e => e === "ai_report").length === 2 && aiEvents.filter(e => e === "ai_report_u").length === 1, aiEvents.join(","));
  if (SHOTS) await (await p.$("#ai-card")).screenshot({ path: join(SHOTS, "desktop-ai-card.png") });
  check("your sky: the Big Three and this life's key astrology moments", /Leo/.test(await p.textContent("#end-bt")) && (await p.$$("#moments li")).length >= 3 && /house/.test(await p.textContent("#moments")));
  await p.waitForSelector("#share-box:not(.loading)", { timeout: 20000 });
  const imgSize = await p.$eval("#share-img", img => [img.naturalWidth, img.naturalHeight, img.src.slice(0, 22), img.alt]);
  check("share card: a 1080×1920 PNG with alt text", imgSize[0] === 1080 && imgSize[1] === 1920 && imgSize[2] === "data:image/png;base64," && /lived to \d+/.test(imgSize[3]) && /of my 100 lives/.test(imgSize[3]), imgSize.slice(0, 2).join("×"));
  const [download] = await Promise.all([p.waitForEvent("download"), p.click("#share-png")]);
  const path = await download.path(), png = await readFile(path);
  check("Download PNG saves the card", /^written-in-the-stars-\d+\.png$/.test(download.suggestedFilename()) && png.readUInt32BE(16) === 1080 && png.readUInt32BE(20) === 1920 && png.length > 20000, `${download.suggestedFilename()} ${png.length} bytes`);
  if (SHOTS) { const { writeFile } = await import("node:fs/promises"); await writeFile(join(SHOTS, "share-card.png"), png); }
  check("ending (1280): nothing overflows", !(await overflow(p)).length, (await overflow(p)).join("; "));
  await shot(p, "desktop-4-end", { fullPage: true });
  if (SHOTS) await (await p.$("#share-box")).screenshot({ path: join(SHOTS, "desktop-5-share.png") });
  // Theme toggle.
  await p.click("#theme");
  check("the theme toggle switches to dark", await p.evaluate(() => document.documentElement.dataset.theme === "dark"));
  await p.click("#again-same");
  check("“Live this chart again” starts the same chart over", await p.isVisible("#play") && /Jordan Lee/.test(await p.textContent("#who")));
  await p.context().close();
}

// ---------- 2. phone: random birth, the whole life, the ending ----------
{
  const p = await fresh({ width: 360, height: 740 }, { colorScheme: "dark" });
  await p.goto(`${SITE}/`);
  check("phone 360 (dark): the welcome page fits", !(await overflow(p)).length, (await overflow(p)).join("; "));
  await shot(p, "phone-dark-welcome");
  await p.click("#welcome .cta [data-random]");
  await p.waitForSelector("#play:not([hidden])");
  check("Random birth starts a life at once and says who you are", /random birth: .+, born \w+ \d+, \d{4} at \d+:\d\d [AP]M in .+, [A-Z]{2}\./.test(await p.textContent("#born")), await p.textContent("#born"));
  check("phone: the scene and the controls fit on top", await p.$eval("#scene", c => c.getBoundingClientRect().width >= 200) && !(await overflow(p)).length, (await overflow(p)).join("; "));
  await p.click('[data-speed="10"]');
  if (await untilChoiceOrEnd(p) && await p.isVisible("#choice")) {
    check("phone 360: a choice fits", !(await overflow(p)).length, (await overflow(p)).join("; "));
    await p.click("#choice [data-option='0']");
  }
  await p.click("#c-skip").catch(() => {});
  await p.waitForSelector("#end:not([hidden])", { timeout: 60000 });
  await closeStory(p);
  await p.waitForSelector("#cards .card", { timeout: 60000 });
  await p.waitForSelector("#share-box:not(.loading)", { timeout: 20000 });
  check("phone 360: the ending fits", !(await overflow(p)).length, (await overflow(p)).join("; "));
  await shot(p, "phone-dark-end", { fullPage: true });
  for (const d of await p.$$("#reading-body details.chapter")) await d.evaluate(el => { el.open = true; });
  check("phone 360: the reading has its chapters and wheel, and fits with every chapter open", (await p.$$("#reading-body details.chapter")).length === 7 && await p.$eval("#reading .wheel", s => s.getBoundingClientRect().width >= 290) && !(await overflow(p)).length, (await overflow(p)).join("; "));
  check("random birth: no outlook from a real age, and it says why", /random birth/.test(await p.textContent("#r-timeline")));
  await p.click("#ai-btn");
  check("phone 360: the AI message shows and fits", /Coming soon!/.test(await p.textContent("#ai-msg")) && !(await overflow(p)).length, (await overflow(p)).join("; "));
  if (SHOTS) {
    await (await p.$("#reading .r-wheel")).screenshot({ path: join(SHOTS, "phone-wheel.png") });
    for (const d of (await p.$$("#reading-body details.chapter")).slice(1)) await d.evaluate(el => { el.open = false; });
    await (await p.$("#reading")).screenshot({ path: join(SHOTS, "phone-reading.png") });
    await (await p.$("#ai-card")).screenshot({ path: join(SHOTS, "phone-ai-card.png") });
  }
  await p.context().close();
}

// ---------- 3. unknown birth time ----------
{
  const p = await fresh({ width: 390, height: 844 });
  await p.goto(`${SITE}/`);
  await shot(p, "phone-1-welcome", { fullPage: true });
  await p.click("#welcome .cta [data-start]");
  await fillForm(p, { date: "1988-03-21", unknown: true, place: "IL|Chicago", sex: "#sex-m" });
  check("unknown birth time: the time field is disabled, no Rising, and the note says why", await p.$eval("#f-time", i => i.disabled) && (await p.textContent('#bigthree [data-role="rising"] .bt-sign')) === "?" && /no Rising sign/.test(await p.textContent("#bt-note")) && (await p.textContent('#bigthree [data-role="sun"] .bt-sign')) !== "?");
  await (await p.$("#bigthree")).scrollIntoViewIfNeeded();
  await p.waitForTimeout(700);
  await shot(p, "phone-2-bigthree");
  check("phone 390: the form fits", !(await overflow(p)).length, (await overflow(p)).join("; "));
  await p.click("#go");
  await p.waitForSelector("#play:not([hidden])");
  check("unknown birth time: the profection is counted from the Sun", /counted from your Sun sign/.test(await p.getAttribute("#s-prof", "title")) && /time unknown/.test(await p.textContent("#who")));
  await p.click('[data-speed="10"]');
  if (await untilChoiceOrEnd(p)) { await p.waitForTimeout(400); await shot(p, "phone-3-play"); await p.click("#choice [data-option='0']"); }
  await p.click("#c-skip").catch(() => {});
  await p.waitForSelector("#end:not([hidden])", { timeout: 60000 });
  await closeStory(p);
  await p.waitForSelector("#cards .card", { timeout: 60000 });
  await p.waitForSelector("#share-box:not(.loading)", { timeout: 20000 });
  check("unknown birth time: the ending says the Rising sign is unknown", /Unknown/.test(await p.textContent("#end-bt")));
  for (const d of await p.$$("#reading-body details.chapter")) await d.evaluate(el => { el.open = true; });
  const rd = await p.textContent("#reading");
  check("unknown birth time: the reading flags solar houses and the missing Rising, without AC on the wheel", /Rising sign: needs a birth time/.test(rd) && /solar houses/.test(rd) && !(await p.$$eval("#reading .w-alabel", ts => ts.length)) && (await p.$$("#reading-body details.chapter")).length === 7 && !(await overflow(p)).length, (await overflow(p)).join("; "));
  await shot(p, "phone-4-end", { fullPage: true });
  if (SHOTS) await (await p.$("#share-box")).screenshot({ path: join(SHOTS, "phone-5-share.png") });
  await p.context().close();
}

// ---------- 4. every width: welcome, form, play and ending fit ----------
for (const width of [430, 768, 1024, 1440]) {
  const p = await fresh({ width, height: width < 800 ? 900 : 900 });
  await p.goto(`${SITE}/`);
  const bad = [...await overflow(p)];
  await p.click("#welcome .cta [data-start]");
  await fillForm(p);
  bad.push(...await overflow(p));
  await p.click("#go");
  await p.waitForSelector("#play:not([hidden])");
  await p.click('[data-speed="10"]');
  if (await untilChoiceOrEnd(p) && await p.isVisible("#choice")) bad.push(...await overflow(p));
  await p.click("#c-skip").catch(() => {});
  await p.waitForSelector("#end:not([hidden])", { timeout: 60000 });
  await closeStory(p);
  await p.waitForSelector("#cards .card", { timeout: 60000 });
  bad.push(...await overflow(p));
  check(`${width}px: no horizontal scroll and no clipped text on any screen`, !bad.length, bad.join("; "));
  await p.context().close();
}

// ---------- 5. the static pages ----------
{
  const p = await fresh({ width: 390, height: 844 });
  await p.goto(`${SITE}/privacy`);
  const privacy = await p.textContent("body");
  check("/privacy: what is collected, what stays on the device, processors, no sale, children, rights, contact, date", ["What stays on your device", "What we collect", "Service providers", "No sale or sharing", "Children", "Your rights", "Contact", "Last updated"].every(h => privacy.includes(h)) && /Cloudflare/.test(privacy) && /hello@/.test(privacy));
  check("/privacy fits a phone", !(await overflow(p)).length, (await overflow(p)).join("; "));
  await p.goto(`${SITE}/terms`);
  const terms = await p.textContent("body");
  check("/terms: entertainment only, 988, the astronomy-engine MIT notice", /entertainment and self-reflection only/.test(terms) && /988/.test(terms) && /Don Cross/.test(terms) && /MIT License/.test(terms));
  await p.context().close();
}

// ---------- 6. the back office lists the AI report clicks ----------
for (const width of [1280, 360]) {
  const p = await fresh({ width, height: 900 });
  await p.goto(`${SITE}/admin#key=test-key`);
  await p.waitForSelector("#app:not([hidden])", { timeout: 5000 }).catch(() => {});
  const tiles = await p.$$eval("#tiles .tile", ts => ts.map(t => [t.querySelector(".k").textContent, t.querySelector(".v").textContent, t.className]));
  const ai = tiles.find(t => t[0] === "AI report"), rate = tiles.find(t => t[0] === "AI report rate");
  check(`/admin (${width}): AI report clicks (10 visits, 13 clicks) and the rate per finished life (25%)`, !!ai && ai[1] === "10" && /hi/.test(ai[2]) && !!rate && rate[1] === "25%" && /13 clicks/.test(await p.textContent("#tiles")) && /Pressed AI report/.test(await p.textContent("#funnel")) && /AI report/.test(await p.textContent("#table")) && /25%/.test(await p.textContent("#table")), JSON.stringify(tiles.slice(-2)));
  check(`/admin (${width}): nothing overflows`, !(await overflow(p)).length, (await overflow(p)).join("; "));
  if (SHOTS) await shot(p, `admin-${width}`, { fullPage: true });
  await p.context().close();
}

// ---------- the counts carry no birth data ----------
check("anonymous counts only: no birth date, place, name or typed text was sent", beacons.length > 0 && beacons.every(b => !/1995|Austin|Jordan|Chicago|1988|travel|kill/.test(b) && JSON.parse(b).p === "life") && beacons.some(b => /"life":\{/.test(b)), `${beacons.length} posts`);
check("no page errors", !errors.length, errors.slice(0, 3).join(" | "));

await browser.close();
server.close();
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
