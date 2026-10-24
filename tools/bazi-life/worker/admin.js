// /admin: the back office. It shows the totals of worker/stats.js for today, 7 and 30 days, and day by day. The key
// (the ADMIN_KEY secret) comes in the link as #key=… once; the page keeps it in this browser and sends it as a Bearer
// token to GET /api/stats. Without the right key it shows nothing but the key box.
export const ADMIN_HTML = `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>命盤人生・後台</title>
<style>
:root { --bg: #f7f5f0; --card: #fff; --ink: #2a2622; --muted: #6d665e; --line: #e4dfd6; --accent: #b4462f; --accent-2: #2f5d8a; --good: #2f7d4f; }
@media (prefers-color-scheme: dark) { :root { --bg: #17191c; --card: #212429; --ink: #ece8e2; --muted: #a39d94; --line: #33373d; --accent: #e07a5f; --accent-2: #7fb0e0; --good: #6cc08e; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 20px 16px 48px; display: grid; gap: 16px; }
h1 { margin: 0; font-size: 22px; }
h2 { margin: 0 0 8px; font-size: 17px; }
.sub { color: var(--muted); margin: 2px 0 0; font-size: 13px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.tabs button { font: inherit; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.tabs button[aria-pressed="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.tile .k { color: var(--muted); font-size: 13px; }
.tile .v { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.3; }
.tile .n { color: var(--muted); font-size: 12px; }
.tile.hi { border-color: var(--accent); }
.tile.hi .v { color: var(--accent); }
.funnel { display: grid; gap: 8px; }
.step { display: grid; grid-template-columns: 9em 1fr 5.5em; align-items: center; gap: 10px; font-size: 14px; }
.bar { height: 14px; background: var(--line); border-radius: 7px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--accent-2); border-radius: 7px; }
.step .num { text-align: right; font-variant-numeric: tabular-nums; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
th { color: var(--muted); font-weight: 500; }
svg text { fill: var(--muted); font-size: 11px; }
.legend { display: flex; gap: 14px; font-size: 13px; color: var(--muted); }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
form { display: flex; gap: 8px; flex-wrap: wrap; }
input { font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--ink); min-width: 0; flex: 1 1 220px; }
button.go { font: inherit; padding: 8px 16px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
.err { color: var(--accent); }
.fine { color: var(--muted); font-size: 13px; margin: 0; }
</style>
</head>
<body>
<main>
  <header>
    <h1>命盤人生・後台</h1>
    <p class="sub">瀏覽、停留時間與「AI 分析報告」按鈕的匿名統計，用來決定要不要開放付費報告。日期依臺灣時間。</p>
  </header>
  <section class="card" id="login" hidden>
    <h2>請輸入後台金鑰</h2>
    <form id="login-form"><input id="key" type="password" autocomplete="current-password" placeholder="金鑰" aria-label="後台金鑰"><button class="go">進入</button></form>
    <p class="err" id="login-err" hidden></p>
  </section>
  <div id="app" hidden>
    <div class="tabs" role="group" aria-label="期間">
      <button type="button" data-days="1">今天</button>
      <button type="button" data-days="7" aria-pressed="true">近 7 天</button>
      <button type="button" data-days="30">近 30 天</button>
      <button type="button" data-days="90">近 90 天</button>
    </div>
    <section class="tiles" id="tiles" aria-label="總覽"></section>
    <section class="card">
      <h2>從進站到按下 AI 分析報告</h2>
      <div class="funnel" id="funnel"></div>
      <p class="fine" id="funnel-note"></p>
    </section>
    <section class="card">
      <h2>停留多久</h2>
      <div class="funnel" id="stay"></div>
      <p class="fine">以畫面真的在看的時間計算（切到別的 App 時不算）。</p>
    </section>
    <section class="card">
      <h2>每天的瀏覽與 AI 點擊</h2>
      <div class="legend"><span><i style="background:var(--accent-2)"></i>瀏覽</span><span><i style="background:var(--accent)"></i>按 AI 分析報告（訪次）</span></div>
      <div id="chart"></div>
    </section>
    <section class="card">
      <h2>每日明細</h2>
      <div class="table-wrap"><table id="table"></table></div>
    </section>
    <p class="fine">只統計匿名的次數：不記 IP、不記生日或姓名、沒有 cookie。「訪客」是每個瀏覽器每天算一次，多天的數字是逐日加總。</p>
  </div>
</main>
<script>
(() => {
  const $ = s => document.querySelector(s);
  const KEY = "bazi-life.adminKey";
  let key = "", rows = [], days = 7;
  const m = location.hash.match(/key=([^&]+)/);
  if (m) { key = decodeURIComponent(m[1]); history.replaceState(null, "", location.pathname); }
  try { if (key) localStorage.setItem(KEY, key); else key = localStorage.getItem(KEY) || ""; } catch {}
  const n = x => (x || 0).toLocaleString("zh-TW");
  const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 + "%" : "—");
  const dur = s => { if (!isFinite(s) || s <= 0) return "—"; s = Math.round(s); return s < 60 ? s + " 秒" : Math.floor(s / 60) + " 分 " + String(s % 60).padStart(2, "0") + " 秒"; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const back = k => new Date(Date.parse(today()) - k * 86400e3).toISOString().slice(0, 10);

  async function load() {
    const res = await fetch("/api/stats?days=90", { headers: { authorization: "Bearer " + key } }).catch(() => null);
    if (!res || res.status === 401 || res.status === 403) { showLogin(key ? "金鑰不對，請重新輸入。" : ""); return; }
    if (!res.ok) { showLogin("暫時讀不到資料，請稍後再試。"); return; }
    rows = (await res.json()).rows || [];
    $("#login").hidden = true; $("#app").hidden = false;
    draw();
  }
  function showLogin(msg) {
    $("#app").hidden = true; $("#login").hidden = false;
    $("#login-err").textContent = msg; $("#login-err").hidden = !msg;
  }
  $("#login-form").addEventListener("submit", e => { e.preventDefault(); key = $("#key").value.trim(); try { localStorage.setItem(KEY, key); } catch {} load(); });
  for (const b of document.querySelectorAll("[data-days]")) b.addEventListener("click", () => {
    days = Number(b.dataset.days);
    for (const x of document.querySelectorAll("[data-days]")) x.setAttribute("aria-pressed", String(x === b));
    draw();
  });

  // Per day, both pages added together (life-only events only come from the 命盤人生 page).
  function byDay() {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.day)) map.set(r.day, { day: r.day, lifeView: 0, chartView: 0 });
      const d = map.get(r.day);
      for (const [k, v] of Object.entries(r)) if (k !== "day" && k !== "page") d[k] = (d[k] || 0) + v;
      d[r.page === "chart" ? "chartView" : "lifeView"] += r.view || 0;
    }
    return map;
  }
  function draw() {
    const map = byDay(), from = back(days - 1);
    const list = [...map.values()].filter(d => d.day >= from);
    const t = {};
    for (const d of list) for (const [k, v] of Object.entries(d)) if (k !== "day") t[k] = (t[k] || 0) + v;
    const tiles = [
      ["瀏覽次數", n(t.view), "命盤人生 " + n(t.lifeView) + "・排盤 " + n(t.chartView)],
      ["訪客", n(t.visitor), "其中回訪 " + n(t.return)],
      ["平均停留", dur((t.seconds || 0) / (t.view || 0)), "每次瀏覽"],
      ["完成人生遊戲", n(t.end_u), "訪次（共 " + n(t.end) + " 局）"],
      ["按 AI 分析報告", n(t.ai_life_u), "訪次（共按 " + n(t.ai_life) + " 次）", true],
      ["AI 報告點擊率", pct(t.ai_life_u, t.end_u), "完成人生的訪次中", true],
      ["做了合婚", n(t.hehun_u), "訪次（共 " + n(t.hehun) + " 次）"],
      ["按 AI 深度合婚", n(t.ai_match_u), "點擊率 " + pct(t.ai_match_u, t.hehun_u)],
    ];
    $("#tiles").innerHTML = tiles.map(([k, v, s, hi]) => '<div class="tile' + (hi ? " hi" : "") + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="n">' + esc(s) + "</div></div>").join("");
    const steps = (el, list, base) => { $(el).innerHTML = list.map(([k, v]) => '<div class="step"><span>' + k + '</span><span class="bar"><i style="width:' + (base ? Math.min(100, v / base * 100) : 0) + '%"></i></span><span class="num">' + n(v) + "</span></div>").join(""); };
    steps("#funnel", [["進到命盤人生", t.lifeView || 0], ["開始人生遊戲", t.start || 0], ["完成人生（訪次）", t.end_u || 0], ["按 AI 分析報告", t.ai_life_u || 0]], t.lifeView || 0);
    $("#funnel-note").textContent = "開始人生是局數，一次瀏覽可以玩好幾局；完成人生和按 AI 報告都以訪次計（同一次瀏覽只算一次）。";
    steps("#stay", [["30 秒以上", t.t30 || 0], ["1 分鐘以上", t.t60 || 0], ["3 分鐘以上", t.t180 || 0], ["10 分鐘以上", t.t600 || 0]], t.view || 0);
    for (const [i, s] of document.querySelectorAll("#stay .step .num").entries()) s.textContent += "（" + pct([t.t30, t.t60, t.t180, t.t600][i] || 0, t.view) + "）";
    // Daily bars, oldest on the left (at most 30 days).
    const span = Math.min(days, 30), daysList = Array.from({ length: span }, (_, k) => back(span - 1 - k));
    const W = 900, H = 180, P = 24, bw = (W - P) / span, max = Math.max(1, ...daysList.map(d => (map.get(d) || {}).view || 0));
    let svg = '<svg viewBox="0 0 ' + W + " " + (H + 22) + '" width="100%" role="img" aria-label="每天的瀏覽與 AI 點擊">';
    daysList.forEach((d, i) => {
      const r = map.get(d) || {}, x = P + i * bw, hv = (r.view || 0) / max * H, ha = (r.ai_life_u || 0) / max * H;
      svg += '<rect x="' + (x + bw * 0.1) + '" y="' + (H - hv) + '" width="' + bw * 0.45 + '" height="' + hv + '" rx="2" fill="var(--accent-2)"><title>' + d + "：瀏覽 " + (r.view || 0) + "</title></rect>";
      svg += '<rect x="' + (x + bw * 0.55) + '" y="' + (H - ha) + '" width="' + bw * 0.35 + '" height="' + ha + '" rx="2" fill="var(--accent)"><title>' + d + "：按 AI 報告 " + (r.ai_life_u || 0) + "</title></rect>";
      if (span <= 7 || i % Math.ceil(span / 7) === 0 || i === span - 1) svg += '<text x="' + (x + bw / 2) + '" y="' + (H + 16) + '" text-anchor="middle">' + d.slice(5).replace("-", "/") + "</text>";
    });
    svg += '<text x="0" y="10">' + max + "</text></svg>";
    $("#chart").innerHTML = svg;
    const head = "<tr><th>日期</th><th>瀏覽</th><th>訪客</th><th>平均停留</th><th>開始人生</th><th>完成（訪次）</th><th>按 AI 報告</th><th>點擊率</th><th>合婚</th><th>按 AI 合婚</th></tr>";
    $("#table").innerHTML = head + (list.length ? list.slice().reverse().map(d => "<tr><td>" + d.day + "</td><td>" + n(d.view) + "</td><td>" + n(d.visitor) + "</td><td>" + dur((d.seconds || 0) / (d.view || 0)) + "</td><td>" + n(d.start) + "</td><td>" + n(d.end_u) + "</td><td>" + n(d.ai_life_u) + "</td><td>" + pct(d.ai_life_u, d.end_u) + "</td><td>" + n(d.hehun_u) + "</td><td>" + n(d.ai_match_u) + "</td></tr>").join("") : '<tr><td colspan="10">這段期間還沒有資料。</td></tr>');
  }
  if (key) load(); else showLogin("");
})();
</script>
</body>
</html>
`;
