// The static /privacy and /terms pages (隱私權政策、使用條款), built into public/ by scripts/build.mjs and served by the
// Worker (worker/index.js). Each page is Traditional Chinese with the full English below it; a small script shows the
// language chosen on the game page (localStorage "bazi-life.lang", read only) or the one in the address (#zh / #en).
// Without the script both languages show. What the pages say has to match the code: src/stats.js (the counts),
// worker/stats.js (the finished-life summary), src/sim/privacy.js + src/sim/interpret.js (the written decision),
// src/ai-reading.js (the AI reading, not open yet), src/draft.js and the storage keys listed below.

// ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
// │ TODO(owner): the contact address, used by both pages. While it is still the placeholder the pages say            │
// │ 「聯絡信箱即將公布」/ "contact address coming soon" instead of showing it.                                         │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
export const CONTACT = "TODO@example.com";
export const CONTACT_READY = !/^TODO@|@example\.(com|org|net)$/i.test(CONTACT);
export const UPDATED = { zh: "2026 年 10 月 29 日", en: "October 29, 2026" };
export const SITE = "https://bazi-life.mingpan.workers.dev";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const contact = lang => (CONTACT_READY
  ? `<a href="mailto:${esc(CONTACT)}">${esc(CONTACT)}</a>`
  : `<span class="todo">${lang === "zh" ? "（聯絡信箱即將公布）" : "(contact address coming soon)"}</span>`);

// The third-party code and text the pages ship (README「用到的套件」「姓名學」): tyme4ts is bundled into both pages;
// the 姓名學 tables and texts (src/core/name-data.js, src/core/name-texts.js) come from shunshi-naming-core and
// shunshi-kangxi-core, and the Kangxi strokes from Unicode's Unihan (via kanji-inspector).
const MIT = holder => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
const UNICODE = `UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 1991-2025 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.`;
export const LICENSES = [
  { name: "tyme4ts 1.5.2", url: "https://github.com/6tail/tyme4ts", what: { zh: "節氣、干支、藏干、十神、納音、起運、大運（打包在網頁裡）", en: "solar terms, stems and branches, hidden stems, Ten Profiles, nayin and the Luck Pillars (bundled into the pages)" }, text: MIT("2024 6tail") },
  { name: "shunshi-naming-core 0.1.0", url: "https://github.com/shunshi-ai/naming-mcp", what: { zh: "姓名學 81 數理、三才、三運的解說文字和數理、三才表", en: "the texts of the 81 numbers, the Three Talents and the three lucks in the name reading, and their tables" }, text: MIT("2026 Shunshi.AI (https://shunshi.ai)") },
  { name: "shunshi-kangxi-core 0.1.1", url: "https://github.com/shunshi-ai/kangxi-mcp", what: { zh: "康熙筆畫的第二份對照表", en: "the second list of Kangxi stroke counts" }, text: MIT("2026 Shunshi.AI (https://shunshi.ai)") },
  { name: "Unicode Unihan（via kanji-inspector 0.2.20）", url: "https://www.unicode.org/charts/unihan.html", what: { zh: "康熙筆畫（kRSUnicode）", en: "Kangxi stroke counts (kRSUnicode)" }, text: UNICODE },
];

const STYLE = `
:root { --paper: #eef1f0; --sheet: #fbfcfc; --ink: #1c2330; --muted: #5b6774; --rule: #c8d0d3; --indigo: #284a80; --indigo-wash: #dfe6f2; --seal: #b5332a; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --paper: #11151b; --sheet: #181e26; --ink: #e5e9ed; --muted: #9ba7b3; --rule: #2d3742; --indigo: #93b2ea; --indigo-wash: #1f2c42; --seal: #ec6a57; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.75 "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif; overflow-x: hidden; }
.wrap { max-width: 780px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header { background: #141a24; color: #eef1f0; }
header .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; min-height: 56px; padding-block: 8px; }
header a.home { color: #f6f1e7; text-decoration: none; font-family: "LXGW WenKai TC", "Kaiti TC", "BiauKai", serif; font-size: 20px; font-weight: 700; letter-spacing: 0.08em; }
.langs { display: flex; gap: 6px; }
.langs a { color: #e5e9ed; text-decoration: none; border: 1px solid rgba(229, 233, 237, 0.4); border-radius: 999px; padding: 4px 12px; font-size: 14px; min-height: 32px; display: inline-flex; align-items: center; }
.langs a[aria-current="true"] { background: #e5e9ed; color: #141a24; border-color: #e5e9ed; }
main { padding-block: 28px 48px; }
article + article { margin-top: 48px; padding-top: 32px; border-top: 1px solid var(--rule); }
h1, h2 { font-family: "LXGW WenKai TC", "Kaiti TC", "BiauKai", Georgia, serif; font-weight: 700; line-height: 1.3; }
h1 { font-size: clamp(28px, 7vw, 38px); margin: 0 0 4px; }
h2 { font-size: 20px; margin: 28px 0 6px; }
p, li { overflow-wrap: break-word; }
p { margin: 8px 0; }
ul { padding-left: 1.3em; margin: 8px 0; }
a { color: var(--indigo); }
.updated { color: var(--muted); margin: 0 0 18px; }
.box { background: var(--sheet); border: 1px solid var(--rule); border-radius: 12px; padding: 12px 16px; }
.todo { color: var(--muted); font-style: italic; }
.table { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; vertical-align: top; border-bottom: 1px solid var(--rule); padding: 6px 8px; }
code { font-family: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 13px; overflow-wrap: anywhere; }
details { margin: 8px 0; }
summary { cursor: pointer; font-weight: 500; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; background: var(--sheet); border: 1px solid var(--rule); border-radius: 8px; padding: 10px 12px; margin: 6px 0 0; }
footer { border-top: 1px solid var(--rule); padding-block: 18px 32px; color: var(--muted); font-size: 13px; }
footer .wrap { display: flex; flex-wrap: wrap; gap: 6px 18px; }
:focus-visible { outline: 3px solid var(--indigo); outline-offset: 2px; }
html[data-lang="zh"] [lang="en"].doc, html[data-lang="en"] [lang="zh-Hant-TW"].doc { display: none; }
html[data-lang="zh"] [lang="en"].foot, html[data-lang="en"] [lang="zh-Hant-TW"].foot { display: none; }
`;

// Shows one language: #zh / #en in the address, else the one picked on the game page (read only), else Chinese.
const SCRIPT = `(function () {
  var T = { zh: document.querySelector('meta[name="title-zh"]').content, en: document.querySelector('meta[name="title-en"]').content };
  function pick() {
    var h = location.hash.slice(1), l = h === "en" || h === "zh" ? h : null;
    if (!l) { try { l = localStorage.getItem("bazi-life.lang") === "en" ? "en" : "zh"; } catch (e) { l = "zh"; } }
    var root = document.documentElement;
    root.setAttribute("data-lang", l); root.lang = l === "en" ? "en" : "zh-Hant-TW"; document.title = T[l];
    var links = document.querySelectorAll(".langs a");
    for (var i = 0; i < links.length; i++) links[i].setAttribute("aria-current", links[i].getAttribute("href") === "#" + l ? "true" : "false");
  }
  pick();
  addEventListener("hashchange", function () { pick(); scrollTo(0, 0); });
})();`;

const shell = ({ zh, en, title, desc }) => `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title.zh}｜命盤人生</title>
<meta name="title-zh" content="${title.zh}｜命盤人生">
<meta name="title-en" content="${title.en} | BaZi Life">
<meta name="description" content="${desc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=LXGW+WenKai+TC:wght@700&family=Noto+Sans+TC:wght@400;500&display=swap">
<style>${STYLE}</style>
</head>
<body>
<header><div class="wrap"><a class="home" href="/">命盤人生 <span lang="en">BaZi Life</span></a><nav class="langs" aria-label="語言 Language"><a href="#zh" lang="zh-Hant-TW">繁中</a><a href="#en" lang="en">English</a></nav></div></header>
<main class="wrap">
<article class="doc" lang="zh-Hant-TW" id="zh-doc">
${zh}
</article>
<article class="doc" lang="en" id="en-doc">
${en}
</article>
</main>
<footer><div class="wrap"><span class="foot" lang="zh-Hant-TW"><a href="/">回到命盤人生</a></span><span class="foot" lang="zh-Hant-TW"><a href="/privacy">隱私權政策</a></span><span class="foot" lang="zh-Hant-TW"><a href="/terms">使用條款</a></span><span class="foot" lang="zh-Hant-TW">僅供娛樂與自我反思。</span><span class="foot" lang="en"><a href="/">Back to BaZi Life</a></span><span class="foot" lang="en"><a href="/privacy">Privacy policy</a></span><span class="foot" lang="en"><a href="/terms">Terms of use</a></span><span class="foot" lang="en">For entertainment and self-reflection only.</span></div></footer>
<script>${SCRIPT}</script>
</body>
</html>
`;

// What the browser keeps (README「歡迎頁與隱私」): the key, where, and what for.
const STORAGE = [
  ["bazi-life.lang", "localStorage", "選過的語言（繁中或 English）", "the language you picked (繁中 or English)"],
  ["bazi-life.majorOnly", "localStorage", "「只問人生大事」有沒有打勾", "whether \"only ask the big decisions\" is ticked"],
  ["bazi-life.aiAuto", "localStorage", "「結局自動 AI 解讀」的設定（改過才存；AI 解讀開放後才用得到）", "the \"AI reading at the end\" setting (saved only if you change it; used once the AI reading opens)"],
  ["bazi-life.aiPreview", "localStorage", "只給開發者測試用的開關，一般瀏覽器不會有", "a switch for the developer's own testing; normal browsers never have it"],
  ["bazi-life.tab", "sessionStorage", "開著的分頁，重新整理後回到同一頁", "the tab you have open, so a reload returns to it"],
  ["bazi-life.form", "sessionStorage", "「我的人生」填到一半的表單（含家人和伴侶）", "the half-filled \"My life\" form (with family and partner)"],
  ["bazi-life.match", "sessionStorage", "合婚分頁填到一半的表單", "the half-filled Match form"],
  ["bazi-life.baby", "sessionStorage", "準爸媽模式填到一半的表單", "the half-filled Baby form"],
  ["bazi-chart.form", "sessionStorage", "排盤引擎頁填到一半的表單", "the half-filled form on the chart engine page"],
  ["bazi-life.seen", "sessionStorage", "最近兩局問過哪些題目種類（只有代號），讓重玩時多遇到沒看過的題目", "which kinds of question your last two lives asked (codes only), so a replay brings new ones"],
  ["bazi-life.aiOut", "sessionStorage", "AI 額度用完的那一天的日期（只存日期）", "the date the AI's daily allowance ran out (the date only)"],
];
const storageTable = lang => `<div class="table"><table><thead><tr><th>${lang === "zh" ? "名稱" : "Key"}</th><th>${lang === "zh" ? "存在哪裡" : "Where"}</th><th>${lang === "zh" ? "用途" : "What for"}</th></tr></thead><tbody>${STORAGE.map(([k, where, zh, en]) => `<tr><td><code>${k}</code></td><td>${where === "localStorage" ? (lang === "zh" ? "localStorage（留在這台瀏覽器）" : "localStorage (stays in this browser)") : (lang === "zh" ? "sessionStorage（關掉分頁就清掉）" : "sessionStorage (gone when the tab is closed)")}</td><td>${lang === "zh" ? zh : en}</td></tr>`).join("")}</tbody></table></div>`;

const PRIVACY_ZH = `
<h1>隱私權政策</h1>
<p class="updated">最後更新：${UPDATED.zh}</p>
<p class="box">簡單說：生日、名字和家人的資料都在你的手機（瀏覽器）裡計算，網站不保存。我們只統計匿名的次數。沒有帳號、沒有 cookie、沒有廣告，也不賣或分享任何資料。</p>

<h2>誰經營這個網站</h2>
<p>「命盤人生」（${SITE}）是一位在臺灣的個人開發者製作、經營的免費網站，英文網站 Written in the Stars 也是同一位作者。有任何問題請寫信到：${contact("zh")}。</p>

<h2>在你的裝置上計算的資料</h2>
<p>你輸入的出生日期、時間、出生地、性別、姓名，家人（爸爸、媽媽、兄弟姊妹）和伴侶的名字與生日，合婚分頁的兩個人，以及準爸媽模式的姓氏和候選名字，都只在你的瀏覽器裡使用。排盤、人生模擬、同盤重跑 100 次、八字命理詳批、姓名學、家人合盤、合婚和準爸媽比較，全部在你的手機或電腦上計算，不會送到我們的伺服器。</p>

<h2>會送出的資料</h2>
<ul>
<li><b>匿名的次數。</b>網頁會送出固定清單裡的事件名稱（例如「打開網頁」「開始人生」「走完一生」「按了某個按鈕」）、畫面停留的秒數，以及玩的時候每分鐘一次的「心跳」（首頁「此刻在過人生」的人數）。伺服器只把它們加成每天的總數。不含生日、姓名或任何編號。</li>
<li><b>走完一生的匿名摘要。</b>走完一生時另外送一筆：出生年代（例如「80 後」）、日柱天干、這一局活到幾歲、結婚幾次、有沒有買房、幾個孩子。只保留最近 500 筆，用在首頁的「剛剛走完的人生」和今天的統計。不含生日、姓名、出生地、性別，也沒有編號，無法對回任何人。</li>
<li><b>「寫下你自己的決定」那一句話。</b>你在抉擇下方自己打字時，那一句話會連同這個抉擇的題目、選項和情境（年齡、工作、感情狀態）送到我們的伺服器，再交給 Cloudflare Workers AI 判讀成遊戲裡的一個行動。送出前，你輸入的名字（自己、家人、伴侶）都會換成「你」「爸爸」「伴侶」這樣的稱呼；不會送出生日。伺服器不保存這句話和判讀結果。提到傷害自己或別人的句子在手機上就會攔下，不會送出。</li>
<li><b>AI 命理分析報告與 AI 深度合婚（尚未開放）。</b>這兩個功能還在準備中：現在按下按鈕只會顯示「敬請期待」，並記一次匿名點擊，不會送出任何生日資料。開放之後，按下時會把你的出生日期、時間、出生地和性別（合婚另含對方的出生日期、時間、性別和出生地）送到我們的伺服器，交給 Cloudflare Workers AI 寫解讀；不送姓名、暱稱、家人或這一局遊戲的內容。伺服器不保存寫好的解讀，也不保存生日；為了少算幾次，最近算過的命盤只會在伺服器的記憶體裡短暫留著，伺服器重新啟動就清掉。開放前，這一段會先更新，網頁上也會寫清楚送出什麼。</li>
</ul>

<h2>主機與記錄</h2>
<p>網站架在 Cloudflare（Cloudflare, Inc.）的 Workers 上，匿名的每日總數和走完一生的摘要存在 Cloudflare 的 Durable Objects。和所有網站一樣，Cloudflare 需要處理你的 IP 位址才能把網頁送到你的裝置並防止濫用。我們的程式不記錄 IP，只在當下用它限制每分鐘的次數。Cloudflare 會保留請求記錄（例如時間、網址、狀態碼和連線的技術資料）最多 7 天，用於除錯與防止濫用。詳見 <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">Cloudflare 的隱私權政策</a>。</p>

<h2>字型（Google Fonts）</h2>
<p>網頁的字型（Noto Sans TC、霞鶩文楷 LXGW WenKai TC、IBM Plex Mono）從 Google Fonts 載入：你的瀏覽器會直接向 Google 的伺服器（fonts.googleapis.com、fonts.gstatic.com）下載字型，所以 Google 會看到你的 IP 位址和瀏覽器資訊。詳見 <a href="https://policies.google.com/privacy" rel="noopener">Google 的隱私權政策</a>。</p>

<h2>瀏覽器裡存的東西</h2>
<p>網站不使用 cookie，也沒有任何追蹤或廣告編號。瀏覽器裡只存下面這些設定和暫存，不會被送出；清除這個網站的資料就會全部刪掉。</p>
${storageTable("zh")}

<h2>不賣、不分享</h2>
<p>我們不賣、不出租，也不分享任何個人資料，不做廣告追蹤。協助我們運作的只有 Cloudflare（主機、Workers AI）和 Google（字型）。</p>

<h2>年齡</h2>
<p>這個網站適合 13 歲以上的使用者。我們不會刻意收集 13 歲以下兒童的個人資料；如果你認為孩子送出了個人資料，請和我們聯絡，我們會刪除。</p>

<h2>你的權利</h2>
<p>因為網站不保存可以認出你的資料，通常沒有東西可以查詢、更正或刪除；你輸入的資料只在你的瀏覽器裡，清除網站資料就會消失。依你所在地的法律（例如臺灣的個人資料保護法、歐盟的 GDPR、美國加州的 CCPA），你仍然可以來信詢問我們持有什麼、要求更正或刪除，我們會回覆。聯絡：${contact("zh")}。</p>

<h2>變更</h2>
<p>這份政策更新時，會改上面的日期；重大變更會在網站上說明。</p>
`;

const PRIVACY_EN = `
<h1>Privacy Policy</h1>
<p class="updated">Last updated: ${UPDATED.en}</p>
<p class="box">Short version: your birth data, names and family details are computed on your phone (in the browser) and never stored by the site. We count anonymous events only. No accounts, no cookies, no ads, and we never sell or share data.</p>

<h2>Who runs this site</h2>
<p>BaZi Life (命盤人生, ${SITE}) is a free website made and run by an independent developer in Taiwan, who also runs the English-language site Written in the Stars. Questions: ${contact("en")}.</p>

<h2>What is computed on your device</h2>
<p>The birth date, time, place and sex you enter, your name, the names and birthdays of your family (parents, brothers and sisters) and partner, both people on the Match tab, and the surname and candidate names in Baby mode are used only in your browser. The chart, the life simulation, the 100 reruns, the BaZi reading, the name reading, the family and partner charts, Match and the Baby comparison are all computed on your phone or computer and are not sent to our server.</p>

<h2>What is sent</h2>
<ul>
<li><b>Anonymous counts.</b> The page sends the names of events from a fixed list (for example "page opened", "life started", "life finished", "a button was pressed"), the number of seconds the page was on screen, and while you play, a "heartbeat" once a minute (for the "playing now" number on the welcome page). The server only adds them to daily totals. No birth date, name or identifier.</li>
<li><b>An anonymous summary of a finished life.</b> When a life ends, one more record is sent: the decade of birth (for example "born in the '80s"), the day stem, the age reached in this game, the number of marriages, whether the character bought a home, and the number of children. Only the latest 500 are kept, for "lives just lived" and today's numbers on the welcome page. It has no birth date, name, place, sex or identifier, so it cannot be traced to anyone.</li>
<li><b>The "write your own decision" sentence.</b> When you type your own decision under a choice, that sentence goes to our server with the choice's question, its options and the situation (age, work, relationship), and is read by Cloudflare Workers AI into one action in the game. Before it is sent, the names you entered (yours, your family's, your partner's) are replaced with words like "you", "Dad" or "partner"; no birth date is sent. The server does not keep the sentence or the result. Sentences about hurting yourself or others are caught on your phone and never sent.</li>
<li><b>The AI chart report and the AI match reading (not open yet).</b> These are still being built: today the button only shows "Coming soon" and counts one anonymous press; no birth data is sent. Once they open, pressing the button will send your birth date, time, place and sex (for a match, also the other person's birth date, time, sex and place) to our server, to be written up by Cloudflare Workers AI; no names, nicknames, family or game content. The server stores neither the reading nor the birth data; to save work, the last charts it computed stay briefly in the server's memory and are gone when it restarts. Before they open, this section will be updated and the page will say exactly what is sent.</li>
</ul>

<h2>Hosting and logs</h2>
<p>The site runs on Cloudflare Workers (Cloudflare, Inc.); the anonymous daily totals and the finished-life summaries are stored in Cloudflare Durable Objects. Like any website, Cloudflare has to process your IP address to deliver the page and to stop abuse. Our code does not record IP addresses; it uses them only in the moment, to limit requests per minute. Cloudflare keeps request logs (such as the time, address, status code and technical connection data) for up to 7 days, for debugging and abuse prevention. See <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">Cloudflare's privacy policy</a>.</p>

<h2>Fonts (Google Fonts)</h2>
<p>The page's typefaces (Noto Sans TC, LXGW WenKai TC, IBM Plex Mono) load from Google Fonts: your browser downloads them directly from Google's servers (fonts.googleapis.com, fonts.gstatic.com), so Google sees your IP address and browser details. See <a href="https://policies.google.com/privacy" rel="noopener">Google's privacy policy</a>.</p>

<h2>What your browser keeps</h2>
<p>The site uses no cookies and no tracking or advertising identifiers. Your browser keeps only these settings and drafts; they are never sent, and clearing this site's data deletes them all.</p>
${storageTable("en")}

<h2>No sale or sharing</h2>
<p>We do not sell, rent or share personal information, and we do no ad tracking. The only services that help run the site are Cloudflare (hosting, Workers AI) and Google (fonts).</p>

<h2>Age</h2>
<p>The site is meant for people 13 and older. We do not knowingly collect personal information from children under 13; if you believe a child has sent us personal information, contact us and we will delete it.</p>

<h2>Your rights</h2>
<p>Because the site keeps nothing that identifies you, there is usually nothing for us to access, correct or delete; what you entered lives only in your browser and disappears when you clear the site's data. Depending on where you live (for example under Taiwan's Personal Data Protection Act, the EU GDPR or California's CCPA), you may still ask us what we hold, or ask for a correction or deletion, and we will answer. Contact: ${contact("en")}.</p>

<h2>Changes</h2>
<p>When this policy changes, the date at the top changes; material changes will be noted on the site.</p>
`;

const licenseList = lang => LICENSES.map(l => `<details><summary>${esc(l.name)}：${lang === "zh" ? l.what.zh : l.what.en}</summary><p><a href="${l.url}" rel="noopener">${l.url}</a></p><pre>${esc(l.text)}</pre></details>`).join("\n");

const TERMS_ZH = `
<h1>使用條款</h1>
<p class="updated">最後更新：${UPDATED.zh}</p>

<h2>僅供娛樂與自我反思</h2>
<p class="box">命盤人生是一個娛樂和自我反思用的遊戲。八字命理沒有經過科學證實，這裡的任何內容都不是預言，也不是醫療、法律、財務或心理方面的建議。</p>
<p>遊戲裡的人生是虛構的：生病、離婚、失業、過世這些事件，是用公開統計和亂數模擬出來的，命盤只讓機率傾斜，不代表你或任何人的未來。請不要依照遊戲結果做現實中的決定。如果內容讓你心裡不舒服，先休息一下；需要找人說說，可以打 1925 安心專線（24 小時）、1995 生命線或 1980 張老師。</p>

<h2>使用網站</h2>
<ul>
<li>網站免費，不需要註冊。適合 13 歲以上的使用者。</li>
<li>請不要試圖破壞、癱瘓或濫用網站，也不要用它傷害別人。</li>
<li>輸入家人或伴侶的生日之前，最好先讓他們知道。</li>
<li>AI 功能開放後，AI 寫的內容會標示出來；它可能出錯，一樣只供娛樂參考。</li>
</ul>

<h2>不提供保證</h2>
<p>網站依「現狀」提供，不做任何明示或默示的保證。我們會盡力讓它正常運作，但不保證網站隨時可用、沒有錯誤，也不保證命理或統計內容正確。在法律允許的最大範圍內，我們不對使用本網站造成的任何損害負責。</p>

<h2>資料來源</h2>
<p>壽命用內政部的簡易生命表與國發會的人口推估；疾病用衛福部的死因統計、國健署的癌症登記和健保的就醫統計。統計只是遊戲的基準，不是對任何人的預測。</p>

<h2>第三方程式與文字的授權</h2>
<p>網頁裡包含下列第三方的程式或資料，依各自的授權使用，授權全文如下：</p>
${licenseList("zh")}
<p>網頁字型（Noto Sans TC、霞鶩文楷 LXGW WenKai TC、IBM Plex Mono）以 SIL Open Font License 授權，由 Google Fonts 提供。</p>

<h2>隱私</h2>
<p>請見<a href="/privacy">隱私權政策</a>。簡單說：你的資料在你的手機裡計算，網站不保存。</p>

<h2>變更</h2>
<p>我們可能更新這些條款，上面的日期會跟著改。繼續使用網站，表示你同意當時的條款。</p>

<h2>聯絡</h2>
<p>${contact("zh")}</p>
`;

const TERMS_EN = `
<h1>Terms of Use</h1>
<p class="updated">Last updated: ${UPDATED.en}</p>

<h2>For entertainment and reflection only</h2>
<p class="box">BaZi Life is a game for entertainment and self-reflection only. BaZi (Chinese Four Pillars astrology) has no proven scientific validity. Nothing here predicts your future or is medical, legal, financial or psychological advice.</p>
<p>The lives you play are fiction: illness, divorce, job loss and death are simulated from public statistics and chance, and the chart only tilts the odds; they say nothing about your future or anyone else's. Do not make real decisions based on the game. If something in it is hard to read, take a break. If you are struggling, please talk to someone: Taiwan 1925 (24 hours); US: call or text 988; Singapore: SOS 1767; Malaysia: Befrienders Kuala Lumpur 03-7627 2929; Philippines: NCMH 1553; elsewhere: <a href="https://findahelpline.com" rel="noopener">findahelpline.com</a>.</p>

<h2>Using the site</h2>
<ul>
<li>The site is free and needs no account. You need to be at least 13 to use it.</li>
<li>Don't try to break, overload or abuse the service, or use it to harm others.</li>
<li>Before you enter a family member's or partner's birthday, it is good to let them know.</li>
<li>Once AI features open, AI-written content will be labelled as such; it can be wrong and is for entertainment too.</li>
</ul>

<h2>No warranty</h2>
<p>The site is provided "as is", without warranties of any kind, express or implied. We do our best to keep it working, but we do not promise that it will be available or error-free, or that its astrology or statistics are accurate. To the fullest extent the law allows, we are not liable for any damages arising from your use of the site.</p>

<h2>Sources</h2>
<p>Lifespans use Taiwan's Ministry of the Interior life tables and the National Development Council's population projections; illness uses the Ministry of Health and Welfare's cause-of-death statistics, the Health Promotion Administration's cancer registry and National Health Insurance statistics. They are the game's baseline, not a prediction about anyone.</p>

<h2>Third-party code and text</h2>
<p>The pages include the following third-party code or data, used under their licences, whose full texts follow:</p>
${licenseList("en")}
<p>The typefaces (Noto Sans TC, LXGW WenKai TC, IBM Plex Mono) are licensed under the SIL Open Font License and served by Google Fonts.</p>

<h2>Privacy</h2>
<p>See the <a href="/privacy">Privacy Policy</a>. In short: your data is computed on your phone and the site does not keep it.</p>

<h2>Changes</h2>
<p>We may update these terms; the date at the top says when. Continuing to use the site means you accept the current terms.</p>

<h2>Contact</h2>
<p>${contact("en")}</p>
`;

export const PRIVACY_HTML = shell({ zh: PRIVACY_ZH, en: PRIVACY_EN, title: { zh: "隱私權政策", en: "Privacy Policy" }, desc: "命盤人生的隱私權政策：資料在你的手機裡計算，網站不保存。BaZi Life privacy policy." });
export const TERMS_HTML = shell({ zh: TERMS_ZH, en: TERMS_EN, title: { zh: "使用條款", en: "Terms of Use" }, desc: "命盤人生的使用條款：僅供娛樂與自我反思。BaZi Life terms of use." });
