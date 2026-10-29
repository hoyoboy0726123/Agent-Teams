// /admin: the back office for both sister sites, 命盤人生 and Written in the Stars, with three tabs: 總覽 (today, 7 and
// 30 days of both, side by side), 命盤人生 (the totals of worker/stats.js for today, 7, 30 and 90 days, and day by day)
// and Written in the Stars (the same from its own Worker, with the shares by network and the AI report rate).
// The key (the ADMIN_KEY secret, the same on both Workers) comes in the link as #key=… once; the page keeps it in this
// browser and sends it as a Bearer token to GET /api/stats here and to WITS_STATS, which allows this origin by CORS
// (ADMIN_ORIGIN in written-in-the-stars/wrangler.jsonc). Without the right key it shows nothing but the key box. When
// Written in the Stars cannot be read, its tab says why and the 命盤人生 tab works as before. The chosen tab and period
// are remembered in this browser.
export const WITS_STATS = "https://written-in-the-stars.mingpan.workers.dev/api/stats";
export const ADMIN_HTML = `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>命盤人生・後台</title>
<style>
:root { --bg: #f7f5f0; --card: #fff; --ink: #2a2622; --muted: #6d665e; --line: #e4dfd6; --accent: #b4462f; --accent-2: #2f5d8a; --good: #2f7d4f; }
@media (prefers-color-scheme: dark) { :root { --bg: #17191c; --card: #212429; --ink: #ece8e2; --muted: #a39d94; --line: #33373d; --accent: #e07a5f; --accent-2: #7fb0e0; --good: #6cc08e; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 20px 16px 48px; display: grid; gap: 16px; }
#app, .panel, #cmp { display: grid; gap: 16px; }
[hidden] { display: none !important; }
main > *, #app > *, .panel > * { min-width: 0; }
h1 { margin: 0; font-size: 22px; }
h2 { margin: 0 0 8px; font-size: 17px; }
.sub { color: var(--muted); margin: 2px 0 0; font-size: 13px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.sites { display: flex; flex-wrap: wrap; gap: 4px 6px; border-bottom: 1px solid var(--line); }
.sites button { font: inherit; font-weight: 600; background: none; border: 0; border-bottom: 3px solid transparent; margin-bottom: -1px; padding: 8px 10px; color: var(--muted); cursor: pointer; }
.sites button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); }
.bar-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
.tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.tabs button { font: inherit; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.tabs button[aria-pressed="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.status { display: flex; flex-wrap: wrap; gap: 6px; font-size: 13px; color: var(--muted); align-items: center; }
.chip { border: 1px solid var(--line); border-radius: 999px; padding: 1px 10px; background: var(--card); }
.chip.ok { color: var(--good); border-color: var(--good); }
.chip.bad { color: var(--accent); border-color: var(--accent); }
.link { font: inherit; font-size: 13px; background: none; border: 0; padding: 0; color: var(--accent-2); text-decoration: underline; cursor: pointer; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.tile .k { color: var(--muted); font-size: 13px; }
.tile .v { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.3; }
.tile .n { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.tile.hi { border-color: var(--accent); }
.tile.hi .v { color: var(--accent); }
.funnel { display: grid; gap: 8px; }
.step { display: grid; grid-template-columns: 9em 1fr 5.5em; align-items: center; gap: 10px; font-size: 14px; }
.bar { height: 14px; background: var(--line); border-radius: 7px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--accent-2); border-radius: 7px; }
.step .num { text-align: right; font-variant-numeric: tabular-nums; }
.step .num small { display: block; color: var(--muted); font-size: 12px; line-height: 1.2; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
th { color: var(--muted); font-weight: 500; }
.cmp { table-layout: fixed; }
.cmp th, .cmp td { white-space: normal; overflow-wrap: anywhere; vertical-align: top; }
.cmp th:first-child { width: 34%; }
.cmp td b { font-size: 17px; }
.cmp td .s { display: block; color: var(--muted); font-size: 12px; }
svg text { fill: var(--muted); font-size: 24px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; color: var(--muted); }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
form { display: flex; gap: 8px; flex-wrap: wrap; }
input { font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--ink); min-width: 0; flex: 1 1 220px; }
button.go { font: inherit; padding: 8px 16px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
.notice { border-color: var(--accent); }
.notice h2 { color: var(--accent); }
.notice p { margin: 0 0 10px; }
.err { color: var(--accent); }
.fine { color: var(--muted); font-size: 13px; margin: 0; }
</style>
</head>
<body>
<main>
  <header>
    <h1>命盤人生・後台</h1>
    <p class="sub">命盤人生和 Written in the Stars 兩個網站的匿名統計：瀏覽、停留時間與 AI 按鈕的點擊，用來決定要不要開放付費報告。命盤人生的日期依臺灣時間，Written in the Stars 依美東時間。</p>
  </header>
  <section class="card" id="login" hidden>
    <h2>請輸入後台金鑰</h2>
    <form id="login-form"><input id="key" type="password" autocomplete="current-password" placeholder="金鑰" aria-label="後台金鑰"><button class="go">進入</button></form>
    <p class="err" id="login-err" hidden></p>
    <p class="fine">兩個網站用同一把金鑰。</p>
  </section>
  <div id="app" hidden>
    <nav class="sites" role="tablist" aria-label="網站">
      <button type="button" role="tab" id="tab-all" data-tab="all" aria-controls="panel-all">總覽</button>
      <button type="button" role="tab" id="tab-bazi" data-tab="bazi" aria-controls="panel-bazi">命盤人生</button>
      <button type="button" role="tab" id="tab-wits" data-tab="wits" aria-controls="panel-wits">Written in the Stars</button>
    </nav>
    <div class="bar-row">
      <div class="tabs" id="period" role="group" aria-label="期間">
        <button type="button" data-days="1">今天</button>
        <button type="button" data-days="7">近 7 天</button>
        <button type="button" data-days="30">近 30 天</button>
        <button type="button" data-days="90">近 90 天</button>
      </div>
      <div class="status" id="status"></div>
    </div>

    <section class="panel" id="panel-all" role="tabpanel" aria-labelledby="tab-all">
      <section class="card notice" id="all-err" hidden></section>
      <div id="cmp"></div>
      <p class="fine">開始人生是局數（一次瀏覽可以玩好幾局）；完成人生和按 AI 按鈕都以訪次計（同一次瀏覽只算一次）。AI 按鈕點擊率＝按了 AI 按鈕的訪次 ÷ 完成人生的訪次：命盤人生是「AI 分析報告」（ai_life_u），Written in the Stars 是「Get my AI report」（ai_report_u）。命盤人生沒有分享按鈕，所以不算分享。訪客只統計到 2026-10-29，沒有資料的期間不顯示這一列。</p>
    </section>

    <section class="panel" id="panel-bazi" role="tabpanel" aria-labelledby="tab-bazi">
      <section class="card notice" id="b-err" hidden><h2>命盤人生讀不到資料</h2><p id="b-err-msg"></p><button type="button" class="go" data-reload>重新讀取</button></section>
      <div class="panel" id="b-body">
        <section class="tiles" id="b-tiles" aria-label="命盤人生總覽"></section>
        <section class="card">
          <h2>從進站到按下 AI 分析報告</h2>
          <div class="funnel" id="b-funnel"></div>
          <p class="fine">開始人生是局數，一次瀏覽可以玩好幾局；完成人生和按 AI 報告都以訪次計（同一次瀏覽只算一次）。</p>
        </section>
        <section class="card">
          <h2>停留多久</h2>
          <div class="funnel" id="b-stay"></div>
          <p class="fine">以畫面真的在看的時間計算（切到別的 App 時不算）。</p>
        </section>
        <section class="card">
          <h2>每天的瀏覽與 AI 點擊（至少 7 天，最多 30 天）</h2>
          <div class="legend"><span><i style="background:var(--accent-2)"></i>瀏覽</span><span><i style="background:var(--accent)"></i>按 AI 分析報告（訪次）</span></div>
          <div id="b-chart"></div>
        </section>
        <section class="card">
          <h2>每日明細</h2>
          <div class="table-wrap"><table id="b-table"></table></div>
        </section>
        <p class="fine">只統計匿名的次數：不記 IP、不記生日或姓名、沒有 cookie。「訪客」是每個瀏覽器每天算一次，只統計到 2026-10-29（之後為了歐盟 ePrivacy 不再記錄；之前的天數還在），多天的數字是逐日加總。日期依臺灣時間。</p>
      </div>
    </section>

    <section class="panel" id="panel-wits" role="tabpanel" aria-labelledby="tab-wits">
      <section class="card notice" id="w-err" hidden><h2>Written in the Stars 讀不到資料</h2><p id="w-err-msg"></p><p class="fine" style="margin-bottom:10px">命盤人生的數字不受影響，切到「命盤人生」分頁就看得到。</p><button type="button" class="go" data-reload>重新讀取</button></section>
      <div class="panel" id="w-body">
        <section class="tiles" id="w-tiles" aria-label="Written in the Stars 總覽"></section>
        <section class="card">
          <h2>從進站到分享</h2>
          <div class="funnel" id="w-funnel"></div>
          <p class="fine">開始人生是局數（一次瀏覽可以玩好幾局）；完成人生、寫了自己的決定、按 AI report 和分享都以訪次計（同一次瀏覽只算一次）。</p>
        </section>
        <section class="card">
          <h2>從哪裡分享</h2>
          <div class="funnel" id="w-shares"></div>
          <p class="fine">分享卡片（下載 PNG、手機的分享選單），以及結局頁「Or post it」的各個網站和複製連結。百分比是占全部分享的比例。</p>
        </section>
        <section class="card">
          <h2>停留多久</h2>
          <div class="funnel" id="w-stay"></div>
          <p class="fine">以畫面真的在看的時間計算（切到別的 App 時不算）。</p>
        </section>
        <section class="card">
          <h2>每天的瀏覽、完成人生與 AI report 點擊（至少 7 天，最多 30 天）</h2>
          <div class="legend"><span><i style="background:var(--accent-2)"></i>瀏覽</span><span><i style="background:var(--accent)"></i>完成人生（訪次）</span><span><i style="background:var(--muted)"></i>按 AI report（訪次）</span></div>
          <div id="w-chart"></div>
        </section>
        <section class="card">
          <h2>每日明細</h2>
          <div class="table-wrap"><table id="w-table"></table></div>
        </section>
        <p class="fine">只統計匿名的次數：不記 IP、不記生日或姓名、沒有 cookie。「訪客」是每個瀏覽器每天算一次，只統計到 2026-10-29（之後為了歐盟 ePrivacy 不再記錄；之前的天數還在），多天的數字是逐日加總。日期依美東時間。</p>
      </div>
    </section>
  </div>
</main>
<script>
(() => {
  const $ = s => document.querySelector(s);
  const KEY = "bazi-life.adminKey", TAB = "bazi-life.adminTab", DAYS = "bazi-life.adminDays";
  const WITS_STATS = "${WITS_STATS}";
  const remember = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const recall = k => { try { return localStorage.getItem(k); } catch { return null; } };
  let key = "";
  const m = location.hash.match(/key=([^&]+)/);
  if (m) { key = decodeURIComponent(m[1]); history.replaceState(null, "", location.pathname); }
  if (key) remember(KEY, key); else key = recall(KEY) || "";
  const TABS = ["all", "bazi", "wits"], PERIODS = [1, 7, 30, 90];
  let tab = TABS.includes(recall(TAB)) ? recall(TAB) : "all";
  let days = PERIODS.includes(Number(recall(DAYS))) ? Number(recall(DAYS)) : 7;

  const n = x => (x || 0).toLocaleString("zh-TW");
  const pct = (a, b) => (b ? Math.round((a || 0) / b * 1000) / 10 + "%" : "—");
  const dur = s => { if (!isFinite(s) || s <= 0) return "—"; s = Math.round(s); return s < 60 ? s + " 秒" : Math.floor(s / 60) + " 分 " + String(s % 60).padStart(2, "0") + " 秒"; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const back = (today, k) => new Date(Date.parse(today) - k * 86400e3).toISOString().slice(0, 10);
  const NY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  // Each site counts its days in its own time zone: 命盤人生 in Taiwan, Written in the Stars in US Eastern.
  const S = {
    bazi: { name: "命盤人生", tz: "臺灣", today: () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), rows: null, err: "" },
    wits: { name: "Written in the Stars", tz: "美東", today: () => NY.format(new Date()), rows: null, err: "" },
  };
  let loadedAt = null;
  // Written in the Stars: every way of sharing (the card, the network links and Copy link), by network.
  const NETS = [["x", "X"], ["threads", "Threads"], ["facebook", "Facebook"], ["reddit", "Reddit"], ["whatsapp", "WhatsApp"], ["bluesky", "Bluesky"], ["copy", "複製連結"], ["native", "手機分享選單"], ["png", "下載卡片（PNG）"]];
  const shares = x => Object.keys(x || {}).filter(k => k.indexOf("share_") === 0).reduce((a, k) => a + (x[k] || 0), 0);
  // 訪客 and 回訪 (visitor, return) are no longer sent since VISITORS_UNTIL (no lastVisit in the browser, for the EU's
  // ePrivacy rules): older days keep them, newer days have none. They show only where there are some, are labelled with
  // the date, and no rate is taken over them (the rates use view or end_u).
  const VISITORS_UNTIL = "2026-10-29", VISITOR_LABEL = "訪客（至 " + VISITORS_UNTIL + "）", VISITOR_COL = "訪客（至 " + VISITORS_UNTIL.slice(5).replace("-", "/") + "）";
  const visitorTile = t => (t.visitor ? [[VISITOR_LABEL, n(t.visitor), "其中回訪 " + n(t.return)]] : []);
  const visitorCell = t => (t.visitor ? [n(t.visitor), "回訪 " + n(t.return)] : ["—", "已停止統計"]);
  const byNet = x => NETS.filter(e => x["share_" + e[0]]).map(e => e[1] + " " + n(x["share_" + e[0]])).join("・") || "還沒有人分享";

  // GET /api/stats of one site: the Response, or null when it could not be reached (offline, refused by CORS, or no
  // answer in 15 seconds).
  async function get(url) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    try { return await fetch(url, { headers: { authorization: "Bearer " + key }, cache: "no-store", credentials: "omit", signal: ctl.signal }); }
    catch { return null; }
    finally { clearTimeout(timer); }
  }
  async function rowsOf(res) { try { const body = await res.json(); return Array.isArray(body.rows) ? body.rows : null; } catch { return null; } }
  async function load() {
    for (const b of document.querySelectorAll("[data-reload]")) b.disabled = true;
    const [a, w] = await Promise.all([get("/api/stats?days=90"), get(WITS_STATS + "?days=90")]);
    for (const b of document.querySelectorAll("[data-reload]")) b.disabled = false;
    if (a && (a.status === 401 || a.status === 403)) { showLogin(key ? "金鑰不對，請重新輸入。" : ""); return; }
    S.bazi.rows = a && a.ok ? await rowsOf(a) : null;
    S.bazi.err = S.bazi.rows ? "" : !a ? "連不到命盤人生的統計，請檢查網路後再試。" : "暫時讀不到資料，請稍後再試。" + (a.ok ? "" : "（HTTP " + a.status + "）");
    S.wits.rows = w && w.ok ? await rowsOf(w) : null;
    S.wits.err = S.wits.rows ? ""
      : !w ? "連不到 Written in the Stars（" + WITS_STATS.split("/")[2] + "）。可能是網路不通，或那個 Worker 還沒部署允許這個後台的設定（ADMIN_ORIGIN）。"
      : w.status === 401 || w.status === 403 ? "Written in the Stars 不接受這把金鑰。兩個 Worker 的 ADMIN_KEY 要設成同一串。"
      : w.status === 503 ? "Written in the Stars 還沒設定後台金鑰（ADMIN_KEY），或統計暫時讀不到。（HTTP 503）"
      : "Written in the Stars 暫時讀不到資料，請稍後再試。" + (w.ok ? "" : "（HTTP " + w.status + "）");
    loadedAt = new Date();
    $("#login").hidden = true; $("#app").hidden = false;
    render();
  }
  function showLogin(msg) {
    $("#app").hidden = true; $("#login").hidden = false;
    $("#login-err").textContent = msg; $("#login-err").hidden = !msg;
  }
  $("#login-form").addEventListener("submit", e => { e.preventDefault(); key = $("#key").value.trim(); remember(KEY, key); load(); });
  for (const b of document.querySelectorAll("[data-reload]")) b.addEventListener("click", load);
  for (const b of document.querySelectorAll("[data-days]")) b.addEventListener("click", () => { days = Number(b.dataset.days); remember(DAYS, String(days)); render(); });
  for (const b of document.querySelectorAll("[data-tab]")) {
    b.addEventListener("click", () => { tab = b.dataset.tab; remember(TAB, tab); render(); });
    // Left and right arrows move between the tabs, as in any tab list.
    b.addEventListener("keydown", e => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const i = (TABS.indexOf(b.dataset.tab) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
      tab = TABS[i]; remember(TAB, tab); render(); $("#tab-" + tab).focus();
    });
  }

  // Per day, every page of a site added together; 命盤人生 also keeps the views of its two pages apart.
  function byDay(site) {
    const map = new Map();
    for (const r of S[site].rows || []) {
      if (!map.has(r.day)) map.set(r.day, { day: r.day, lifeView: 0, chartView: 0 });
      const d = map.get(r.day);
      for (const [k, v] of Object.entries(r)) if (k !== "day" && k !== "page" && typeof v === "number") d[k] = (d[k] || 0) + v;
      d[r.page === "chart" ? "chartView" : "lifeView"] += r.view || 0;
    }
    return map;
  }
  // The totals of the last k days of a site (today included, in its own time zone).
  function totals(site, k) {
    const map = byDay(site), from = back(S[site].today(), k - 1);
    const list = [...map.values()].filter(d => d.day >= from).sort((a, b) => (a.day < b.day ? -1 : 1));
    const t = {};
    for (const d of list) for (const [x, v] of Object.entries(d)) if (x !== "day") t[x] = (t[x] || 0) + v;
    return { map, list, t };
  }
  const tilesHtml = list => list.map(([k, v, s, hi]) => '<div class="tile' + (hi ? " hi" : "") + '"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div><div class="n">' + esc(s) + "</div></div>").join("");
  const steps = (el, list, base, share) => { $(el).innerHTML = list.map(([k, v]) => '<div class="step"><span>' + esc(k) + '</span><span class="bar"><i style="width:' + (base ? Math.min(100, v / base * 100) : 0) + '%"></i></span><span class="num">' + n(v) + (share ? "<small>" + pct(v, base) + "</small>" : "") + "</span></div>").join(""); };
  const stay = (el, t) => steps(el, [["30 秒以上", t.t30 || 0], ["1 分鐘以上", t.t60 || 0], ["3 分鐘以上", t.t180 || 0], ["10 分鐘以上", t.t600 || 0]], t.view || 0, true);
  // Daily bars, oldest on the left (at least 7, at most 30 days): one bar per series, scaled to the most views.
  function chart(el, site, map, series, label) {
    const span = Math.max(7, Math.min(days, 30)), today = S[site].today(), daysList = Array.from({ length: span }, (_, k) => back(today, span - 1 - k));
    const W = 900, H = 220, P = 40, bw = (W - P) / span, gw = 0.84 / series.length, max = Math.max(1, ...daysList.map(d => (map.get(d) || {}).view || 0));
    let svg = '<svg viewBox="0 0 ' + W + " " + (H + 40) + '" width="100%" role="img" aria-label="' + esc(label) + '">';
    daysList.forEach((d, i) => {
      const r = map.get(d) || {}, x = P + i * bw;
      series.forEach(([k, color, name], j) => {
        const h = (r[k] || 0) / max * H;
        svg += '<rect x="' + (x + bw * (0.08 + j * gw)) + '" y="' + (H - h) + '" width="' + bw * gw * 0.88 + '" height="' + h + '" rx="2" fill="' + color + '"><title>' + d + "：" + name + " " + (r[k] || 0) + "</title></rect>";
      });
      if (span <= 7 || i % Math.ceil(span / 7) === 0 || i === span - 1) svg += '<text x="' + (x + bw / 2) + '" y="' + (H + 30) + '" text-anchor="middle">' + d.slice(5).replace("-", "/") + "</text>";
    });
    $(el).innerHTML = svg + '<text x="0" y="20">' + max + "</text></svg>";
  }
  const table = (el, head, list, row) => { $(el).innerHTML = "<tr>" + head.map(h => "<th>" + h + "</th>").join("") + "</tr>" + (list.length ? list.slice().reverse().map(d => "<tr><td>" + d.day + "</td>" + row(d).map(c => "<td>" + c + "</td>").join("") + "</tr>").join("") : '<tr><td colspan="' + head.length + '">這段期間還沒有資料。</td></tr>'); };

  function drawBazi() {
    const { map, list, t } = totals("bazi", days);
    $("#b-tiles").innerHTML = tilesHtml([
      ["瀏覽次數", n(t.view), "命盤人生 " + n(t.lifeView) + "・排盤 " + n(t.chartView)],
      ...visitorTile(t),
      ["平均停留", dur((t.seconds || 0) / (t.view || 0)), "每次瀏覽"],
      ["完成人生遊戲", n(t.end_u), "訪次（共 " + n(t.end) + " 局）"],
      ["按 AI 分析報告", n(t.ai_life_u), "訪次（共按 " + n(t.ai_life) + " 次）", true],
      ["AI 報告點擊率", pct(t.ai_life_u, t.end_u), "完成人生的訪次中", true],
      ["做了合婚", n(t.hehun_u), "訪次（共 " + n(t.hehun) + " 次）"],
      ["按 AI 深度合婚", n(t.ai_match_u), "點擊率 " + pct(t.ai_match_u, t.hehun_u)],
    ]);
    steps("#b-funnel", [["進到命盤人生", t.lifeView || 0], ["開始人生遊戲", t.start || 0], ["完成人生（訪次）", t.end_u || 0], ["按 AI 分析報告", t.ai_life_u || 0]], t.lifeView || 0);
    stay("#b-stay", t);
    chart("#b-chart", "bazi", map, [["view", "var(--accent-2)", "瀏覽"], ["ai_life_u", "var(--accent)", "按 AI 報告"]], "每天的瀏覽與 AI 點擊");
    const bv = list.some(d => d.visitor);
    table("#b-table", ["日期", "瀏覽", ...(bv ? [VISITOR_COL] : []), "平均停留", "開始人生", "完成（訪次）", "按 AI 報告", "點擊率", "合婚", "按 AI 合婚"], list,
      d => [n(d.view), ...(bv ? [n(d.visitor)] : []), dur((d.seconds || 0) / (d.view || 0)), n(d.start), n(d.end_u), n(d.ai_life_u), pct(d.ai_life_u, d.end_u), n(d.hehun_u), n(d.ai_match_u)]);
  }
  function drawWits() {
    const { map, list, t } = totals("wits", days), all = shares(t);
    $("#w-tiles").innerHTML = tilesHtml([
      ["瀏覽次數", n(t.view), "訪次"],
      ...visitorTile(t),
      ["平均停留", dur((t.seconds || 0) / (t.view || 0)), "每次瀏覽"],
      ["開始人生", n(t.start), "局（隨機出生 " + n(t.random) + " 局）"],
      ["完成人生", n(t.end_u), "訪次（共 " + n(t.end) + " 局）"],
      ["完成率", pct(t.end_u, t.form_u), "打開出生表單的訪次中"],
      ["寫了自己的決定", n(t.written_u), "訪次"],
      ["分享", n(all), byNet(t)],
      ["顯示 988 求助專線", n(t.help), "安全提示"],
      ["按 AI report", n(t.ai_report_u), "訪次（共按 " + n(t.ai_report) + " 次）", true],
      ["AI report 點擊率", pct(t.ai_report_u, t.end_u), "完成人生的訪次中", true],
    ]);
    steps("#w-funnel", [["瀏覽", t.view || 0], ["打開出生表單", t.form_u || 0], ["開始人生", t.start || 0], ["完成人生（訪次）", t.end_u || 0], ["按 AI report", t.ai_report_u || 0], ["下載分享卡片", t.share_png || 0]], t.view || 0);
    steps("#w-shares", NETS.map(([k, l]) => [l, t["share_" + k] || 0]), all, true);
    stay("#w-stay", t);
    chart("#w-chart", "wits", map, [["view", "var(--accent-2)", "瀏覽"], ["end_u", "var(--accent)", "完成人生"], ["ai_report_u", "var(--muted)", "按 AI report"]], "每天的瀏覽、完成人生與 AI report 點擊");
    const wv = list.some(d => d.visitor);
    table("#w-table", ["日期", "瀏覽", ...(wv ? [VISITOR_COL] : []), "平均停留", "開始人生", "完成（訪次）", "按 AI report", "點擊率", "寫決定", "分享"], list,
      d => [n(d.view), ...(wv ? [n(d.visitor)] : []), dur((d.seconds || 0) / (d.view || 0)), n(d.start), n(d.end_u), n(d.ai_report_u), pct(d.ai_report_u, d.end_u), n(d.written_u), n(shares(d))]);
  }
  // 總覽: today, 7 and 30 days of both sites, side by side.
  function drawAll() {
    const ok = site => !!S[site].rows;
    const show = ([v, s]) => "<b>" + v + "</b>" + (s ? '<span class="s">' + esc(s) + "</span>" : "");
    const ROWS = [
      ["瀏覽次數", t => [n(t.view), ""], t => [n(t.view), ""]],
      [VISITOR_LABEL, visitorCell, visitorCell, t => t.visitor > 0],
      ["開始人生（局）", t => [n(t.start), ""], t => [n(t.start), ""]],
      ["完成人生（訪次）", t => [n(t.end_u), "共 " + n(t.end) + " 局"], t => [n(t.end_u), "共 " + n(t.end) + " 局"]],
      ["平均停留", t => [dur((t.seconds || 0) / (t.view || 0)), "每次瀏覽"], t => [dur((t.seconds || 0) / (t.view || 0)), "每次瀏覽"]],
      ["AI 按鈕點擊率", t => [pct(t.ai_life_u, t.end_u), n(t.ai_life_u) + " / " + n(t.end_u) + " 訪次"], t => [pct(t.ai_report_u, t.end_u), n(t.ai_report_u) + " / " + n(t.end_u) + " 訪次"]],
      ["分享", () => ["—", "沒有分享按鈕"], t => [n(shares(t)), ""]],
    ];
    $("#cmp").innerHTML = [[1, "今天"], [7, "近 7 天"], [30, "近 30 天"]].map(([k, title]) => {
      const tb = ok("bazi") && totals("bazi", k).t, tw = ok("wits") && totals("wits", k).t;
      const cell = (t, f) => (t ? f(t) : ["—", ""]);
      const when = k === 1 ? "命盤人生 " + S.bazi.today() + "（臺灣）・Written in the Stars " + S.wits.today() + "（美東）" : "含今天往回 " + k + " 天，各依自己的時區";
      return '<section class="card" data-period="' + k + '"><h2>' + title + '</h2><p class="fine" style="margin-bottom:8px">' + esc(when) + '</p><table class="cmp"><tr><th>指標</th><th>命盤人生</th><th>Written in the Stars</th></tr>' +
        ROWS.filter(([, , , shown]) => !shown || (tb && shown(tb)) || (tw && shown(tw))).map(([label, fb, fw]) => "<tr><td>" + label + "</td><td>" + show(cell(tb, fb)) + "</td><td>" + show(cell(tw, fw)) + "</td></tr>").join("") + "</table></section>";
    }).join("");
    const errs = ["bazi", "wits"].filter(s => !ok(s));
    $("#all-err").hidden = !errs.length;
    $("#all-err").innerHTML = errs.map(s => "<h2>" + esc(S[s].name) + " 讀不到資料</h2><p>" + esc(S[s].err) + "</p>").join("") + '<button type="button" class="go" data-reload-all>重新讀取</button>';
    const again = $("[data-reload-all]");
    if (again) again.addEventListener("click", load);
  }
  function render() {
    for (const b of document.querySelectorAll("[data-tab]")) { const on = b.dataset.tab === tab; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; }
    for (const t of TABS) $("#panel-" + t).hidden = t !== tab;
    $("#period").hidden = tab === "all";
    for (const b of document.querySelectorAll("[data-days]")) b.setAttribute("aria-pressed", String(Number(b.dataset.days) === days));
    const at = loadedAt ? String(loadedAt.getHours()).padStart(2, "0") + ":" + String(loadedAt.getMinutes()).padStart(2, "0") : "";
    $("#status").innerHTML = ["bazi", "wits"].map(s => '<span class="chip ' + (S[s].rows ? "ok" : "bad") + '">' + esc(S[s].name) + (S[s].rows ? " ✓" : " 讀不到") + "</span>").join("") +
      '<span>' + at + ' 更新</span><button type="button" class="link" id="refresh">重新整理</button>';
    $("#refresh").addEventListener("click", load);
    for (const [site, el, draw] of [["bazi", "b", drawBazi], ["wits", "w", drawWits]]) {
      $("#" + el + "-err").hidden = !!S[site].rows; $("#" + el + "-body").hidden = !S[site].rows;
      $("#" + el + "-err-msg").textContent = S[site].err;
      if (S[site].rows) draw();
    }
    drawAll();
  }
  if (key) load(); else showLogin("");
})();
</script>
</body>
</html>
`;
