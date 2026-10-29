// /admin: the back office, as in bazi-life. It shows the totals of worker/stats.js for today, 7, 30 and 90 days, and day
// by day. The key (the ADMIN_KEY secret) comes in the link as #key=… once; the page keeps it in this browser and sends
// it as a Bearer token to GET /api/stats. Without the right key it shows nothing but the key box. The combined back office
// of both sites is bazi-life's /admin, which reads this Worker's GET /api/stats by CORS (ADMIN_ORIGIN in wrangler.jsonc).
export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Written in the Stars · Back office</title>
<style>
:root { --bg: #f7f5fc; --card: #fff; --ink: #161a3a; --muted: #4f5476; --line: #dcd6ee; --accent: #85600c; --accent-2: #5446a8; }
@media (prefers-color-scheme: dark) { :root { --bg: #0b1026; --card: #141a3d; --ink: #eceaf8; --muted: #b0b3d3; --line: #2c3468; --accent: #f0cd84; --accent-2: #c3bbf6; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 20px 16px 48px; display: grid; gap: 16px; }
#app { display: grid; gap: 16px; }
[hidden] { display: none !important; }
main > *, #app > * { min-width: 0; }
h1 { margin: 0; font-size: 22px; } h2 { margin: 0 0 8px; font-size: 17px; }
.sub { color: var(--muted); margin: 2px 0 0; font-size: 13px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.tabs button { font: inherit; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.tabs button[aria-pressed="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.tile.hi { border-color: var(--accent); } .tile.hi .v { color: var(--accent); }
.tile .k { color: var(--muted); font-size: 13px; } .tile .v { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.3; } .tile .n { color: var(--muted); font-size: 12px; }
.funnel { display: grid; gap: 8px; }
.step { display: grid; grid-template-columns: 9em 1fr 5.5em; align-items: center; gap: 10px; font-size: 14px; }
.bar { height: 14px; background: var(--line); border-radius: 7px; overflow: hidden; } .bar i { display: block; height: 100%; background: var(--accent-2); border-radius: 7px; }
.step .num { text-align: right; font-variant-numeric: tabular-nums; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
th:first-child, td:first-child { text-align: left; } th { color: var(--muted); font-weight: 500; }
svg text { fill: var(--muted); font-size: 24px; }
form { display: flex; gap: 8px; flex-wrap: wrap; }
input { font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--ink); min-width: 0; flex: 1 1 220px; }
button.go { font: inherit; padding: 8px 16px; border: 0; border-radius: 8px; background: var(--accent-2); color: #fff; cursor: pointer; }
.err { color: #c0392b; } .fine { color: var(--muted); font-size: 13px; margin: 0; }
header a { color: var(--accent-2); overflow-wrap: anywhere; }
</style>
</head>
<body>
<main>
  <header><h1>Written in the Stars · Back office</h1><p class="sub">Anonymous counts of visits, time on screen and button presses. Days are US Eastern.</p><p class="sub"><a href="https://bazi-life.mingpan.workers.dev/admin">All sites in one dashboard → https://bazi-life.mingpan.workers.dev/admin</a></p></header>
  <section class="card" id="login" hidden>
    <h2>Enter the admin key</h2>
    <form id="login-form"><input id="key" type="password" autocomplete="current-password" placeholder="Key" aria-label="Admin key"><button class="go">Open</button></form>
    <p class="err" id="login-err" hidden></p>
  </section>
  <div id="app" hidden>
    <div class="tabs" role="group" aria-label="Period">
      <button type="button" data-days="1">Today</button>
      <button type="button" data-days="7" aria-pressed="true">7 days</button>
      <button type="button" data-days="30">30 days</button>
      <button type="button" data-days="90">90 days</button>
    </div>
    <section class="tiles" id="tiles" aria-label="Totals"></section>
    <section class="card"><h2>From visit to share</h2><div class="funnel" id="funnel"></div><p class="fine">Lives started counts games (one visit can play several); finished, written, AI report and shared count visits (once per page load).</p></section>
    <section class="card"><h2>Time on screen</h2><div class="funnel" id="stay"></div><p class="fine">Only while the page is visible.</p></section>
    <section class="card"><h2>Views, finished lives and AI report clicks per day</h2><div id="chart"></div><p class="fine">Bars per day: views, finished lives (visits), AI report (visits).</p></section>
    <section class="card"><h2>Day by day</h2><div class="table-wrap"><table id="table"></table></div></section>
    <p class="fine">Counts only: no IP, no birth data or names, no cookies. A visitor is one browser per day; totals over several days add the days up.</p>
  </div>
</main>
<script>
(() => {
  const $ = s => document.querySelector(s);
  const KEY = "wits.adminKey";
  let key = "", rows = [], days = 7;
  const m = location.hash.match(/key=([^&]+)/);
  if (m) { key = decodeURIComponent(m[1]); history.replaceState(null, "", location.pathname); }
  try { if (key) localStorage.setItem(KEY, key); else key = localStorage.getItem(KEY) || ""; } catch {}
  const n = x => (x || 0).toLocaleString("en-US");
  // Every way of sharing: the card (download, share sheet), the network links and Copy link.
  const shares = x => Object.keys(x || {}).filter(k => k.indexOf("share_") === 0).reduce((a, k) => a + (x[k] || 0), 0);
  const NETS = [["x", "X"], ["threads", "Threads"], ["facebook", "Facebook"], ["reddit", "Reddit"], ["whatsapp", "WhatsApp"], ["bluesky", "Bluesky"], ["copy", "Copy link"], ["native", "share sheet"], ["png", "PNG"]];
  const byNet = x => NETS.filter(e => x["share_" + e[0]]).map(e => e[1] + " " + n(x["share_" + e[0]])).join(" · ") || "none yet";
  const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 + "%" : "—");
  const dur = s => { if (!isFinite(s) || s <= 0) return "—"; s = Math.round(s); return s < 60 ? s + " s" : Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") + " s"; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const back = k => new Date(Date.parse(today()) - k * 86400e3).toISOString().slice(0, 10);
  async function load() {
    const res = await fetch("/api/stats?days=90", { headers: { authorization: "Bearer " + key } }).catch(() => null);
    if (!res || res.status === 401 || res.status === 403) { showLogin(key ? "That key didn't work." : ""); return; }
    if (!res.ok) { showLogin("Couldn't load the numbers. Try again later."); return; }
    rows = (await res.json()).rows || [];
    $("#login").hidden = true; $("#app").hidden = false;
    draw();
  }
  function showLogin(msg) { $("#app").hidden = true; $("#login").hidden = false; $("#login-err").textContent = msg; $("#login-err").hidden = !msg; }
  $("#login-form").addEventListener("submit", e => { e.preventDefault(); key = $("#key").value.trim(); try { localStorage.setItem(KEY, key); } catch {} load(); });
  for (const b of document.querySelectorAll("[data-days]")) b.addEventListener("click", () => {
    days = Number(b.dataset.days);
    for (const x of document.querySelectorAll("[data-days]")) x.setAttribute("aria-pressed", String(x === b));
    draw();
  });
  function byDay() {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.day)) map.set(r.day, { day: r.day });
      const d = map.get(r.day);
      for (const [k, v] of Object.entries(r)) if (k !== "day" && k !== "page") d[k] = (d[k] || 0) + v;
    }
    return map;
  }
  function draw() {
    const map = byDay(), from = back(days - 1);
    const list = [...map.values()].filter(d => d.day >= from);
    const t = {};
    for (const d of list) for (const [k, v] of Object.entries(d)) if (k !== "day") t[k] = (t[k] || 0) + v;
    const tiles = [
      ["Page views", n(t.view), "visits"], ["Visitors", n(t.visitor), n(t.return) + " returning"],
      ["Avg time", dur((t.seconds || 0) / (t.view || 0)), "per view"], ["Lives started", n(t.start), n(t.random) + " random births"],
      ["Lives finished", n(t.end_u), "visits (" + n(t.end) + " lives)"], ["Finish rate", pct(t.end_u, t.form_u), "of visits that opened the form"],
      ["Wrote a decision", n(t.written_u), "visits"], ["Shared", n(shares(t)), byNet(t)],
      ["988 shown", n(t.help), "safety message"],
      ["AI report", n(t.ai_report_u), "visits (" + n(t.ai_report) + " clicks)", true],
      ["AI report rate", pct(t.ai_report_u, t.end_u), "of visits that finished a life", true],
    ];
    $("#tiles").innerHTML = tiles.map(([k, v, s, hi]) => '<div class="tile' + (hi ? " hi" : "") + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="n">' + esc(s) + "</div></div>").join("");
    const steps = (el, items, base) => { $(el).innerHTML = items.map(([k, v]) => '<div class="step"><span>' + k + '</span><span class="bar"><i style="width:' + (base ? Math.min(100, v / base * 100) : 0) + '%"></i></span><span class="num">' + n(v) + "</span></div>").join(""); };
    steps("#funnel", [["Viewed", t.view || 0], ["Opened the form", t.form_u || 0], ["Started a life", t.start || 0], ["Finished (visits)", t.end_u || 0], ["Pressed AI report", t.ai_report_u || 0], ["Downloaded a card", t.share_png || 0]], t.view || 0);
    steps("#stay", [["30 s or more", t.t30 || 0], ["1 min or more", t.t60 || 0], ["3 min or more", t.t180 || 0], ["10 min or more", t.t600 || 0]], t.view || 0);
    const span = Math.max(7, Math.min(days, 30)), daysList = Array.from({ length: span }, (_, k) => back(span - 1 - k));
    const W = 900, H = 220, P = 40, bw = (W - P) / span, max = Math.max(1, ...daysList.map(d => (map.get(d) || {}).view || 0));
    let svg = '<svg viewBox="0 0 ' + W + " " + (H + 40) + '" width="100%" role="img" aria-label="Views and finished lives per day">';
    daysList.forEach((d, i) => {
      const r = map.get(d) || {}, x = P + i * bw, hv = (r.view || 0) / max * H, he = (r.end_u || 0) / max * H, ha = (r.ai_report_u || 0) / max * H;
      svg += '<rect x="' + (x + bw * 0.08) + '" y="' + (H - hv) + '" width="' + bw * 0.34 + '" height="' + hv + '" rx="2" fill="var(--accent-2)"><title>' + d + ": " + (r.view || 0) + " views</title></rect>";
      svg += '<rect x="' + (x + bw * 0.45) + '" y="' + (H - he) + '" width="' + bw * 0.22 + '" height="' + he + '" rx="2" fill="var(--accent)"><title>' + d + ": " + (r.end_u || 0) + " finished</title></rect>";
      svg += '<rect x="' + (x + bw * 0.70) + '" y="' + (H - ha) + '" width="' + bw * 0.22 + '" height="' + ha + '" rx="2" fill="var(--muted)"><title>' + d + ": " + (r.ai_report_u || 0) + " AI report</title></rect>";
      if (span <= 7 || i % Math.ceil(span / 7) === 0 || i === span - 1) svg += '<text x="' + (x + bw / 2) + '" y="' + (H + 30) + '" text-anchor="middle">' + d.slice(5).replace("-", "/") + "</text>";
    });
    $("#chart").innerHTML = svg + '<text x="0" y="20">' + max + "</text></svg>";
    const head = "<tr><th>Day</th><th>Views</th><th>Visitors</th><th>Avg time</th><th>Started</th><th>Finished</th><th>AI report</th><th>AI rate</th><th>Wrote</th><th>Cards</th></tr>";
    $("#table").innerHTML = head + (list.length ? list.slice().reverse().map(d => "<tr><td>" + d.day + "</td><td>" + n(d.view) + "</td><td>" + n(d.visitor) + "</td><td>" + dur((d.seconds || 0) / (d.view || 0)) + "</td><td>" + n(d.start) + "</td><td>" + n(d.end_u) + "</td><td>" + n(d.ai_report_u) + "</td><td>" + pct(d.ai_report_u, d.end_u) + "</td><td>" + n(d.written_u) + "</td><td>" + n(shares(d)) + "</td></tr>").join("") : '<tr><td colspan="10">No data for this period yet.</td></tr>');
  }
  if (key) load(); else showLogin("");
})();
</script>
</body>
</html>
`;
