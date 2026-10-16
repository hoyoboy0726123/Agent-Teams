// 命盤人生・人生模擬頁：生辰 → 命盤 → 一年一年過完一生 → 人生 K 線與同盤重跑 100 次。全部在瀏覽器裡算。
import { computeChart } from "./core/chart.js";
import { PLACE_GROUPS, findPlace } from "./core/places.js";
import { prepare } from "./sim/setup.js";
import { createLife } from "./sim/life.js";
import { rerun } from "./sim/monte.js";
import { PROVISIONAL } from "./sim/rates.js";
import { COUNTIES } from "./sim/events.js";
import { makeRng, hashSeed } from "./sim/rng.js";

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SPEED_MS = { 1: 900, 3: 320, 10: 90 };
const EDU = { none: "沒有上學", 國小: "國小", 國中: "國中", 高中: "高中", 高職: "高職", 五專: "五專", 科大: "科技大學", 大學: "大學", 碩士: "碩士", 博士: "博士" };

let run = null;   // { input, chart, prep, life, seed, born }
let timer = null, speed = 1, paused = false;

function setup() {
  $("#data-note").hidden = !PROVISIONAL;
  $("#f-place").innerHTML = PLACE_GROUPS.map(g => `<optgroup label="${esc(g.group)}">${g.places.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("")}</optgroup>`).join("");
  $("#f-place").value = "臺北市";
  for (const tab of ["me", "random"]) $(`#tab-${tab}`).addEventListener("click", () => selectTab(tab));
  $("#f-nohour").addEventListener("change", () => { $("#f-time").disabled = $("#f-nohour").checked; });
  $("#form-me").addEventListener("submit", e => { e.preventDefault(); startFromForm(); });
  $("#go-random").addEventListener("click", startRandom);
  $("#c-pause").addEventListener("click", () => { paused = !paused; $("#c-pause").textContent = paused ? "繼續" : "暫停"; if (!paused) schedule(); });
  for (const b of document.querySelectorAll("[data-speed]")) b.addEventListener("click", () => {
    speed = Number(b.dataset.speed);
    for (const x of document.querySelectorAll("[data-speed]")) x.setAttribute("aria-pressed", String(x === b));
    if (!paused) schedule();
  });
  $("#c-skip").addEventListener("click", skipToEnd);
  $("#choice").addEventListener("click", e => { const b = e.target.closest("[data-option]"); if (b) choose(Number(b.dataset.option)); });
  $("#again-same").addEventListener("click", () => begin(run.input, run.born));
  $("#again-new").addEventListener("click", () => { stop(); $("#end").hidden = true; $("#play").hidden = true; $("#setup").hidden = false; $("#setup").scrollIntoView({ behavior: "smooth", block: "start" }); });
  window.addEventListener("resize", () => { if (run && run.summary && !$("#end").hidden) drawKline(); });
}

function selectTab(tab) {
  for (const t of ["me", "random"]) {
    $(`#tab-${t}`).setAttribute("aria-selected", String(t === tab));
    $(`#form-${t}`).hidden = t !== tab;
  }
}

function showError(text) { const e = $("#error"); e.textContent = text; e.hidden = !text; }

function startFromForm() {
  const [y, m, d] = ($("#f-date").value || "").split("-").map(Number);
  if (!y) return showError("請輸入出生日期。");
  if (y < 1900 || y > 2100) return showError("出生年份請在 1900 到 2100 年之間。");
  const noHour = $("#f-nohour").checked;
  const [h, mi] = ($("#f-time").value || "").split(":").map(Number);
  if (!noHour && !Number.isFinite(h)) return showError("請輸入出生時間，或勾選「時辰不詳」。");
  showError("");
  const input = { date: { y, m, d }, time: noHour ? null : { h, mi: mi || 0 }, place: findPlace($("#f-place").value), sex: $("#sex-f").checked ? "female" : "male" };
  begin(input, null);
}

function startRandom() {
  const rng = makeRng(crypto.getRandomValues(new Uint32Array(1))[0]);
  const y = 1950 + rng.int(76), m = 1 + rng.int(12), d = 1 + rng.int(new Date(Date.UTC(y, m, 0)).getUTCDate());
  const county = rng.weighted(COUNTIES), place = PLACE_GROUPS.find(g => g.group === `臺灣・${county}`).places[0];
  const sex = rng() < 0.5 ? "male" : "female";
  const input = { date: { y, m, d }, time: { h: rng.int(24), mi: rng.int(60) }, place, sex };
  const pad = n => String(n).padStart(2, "0");
  begin(input, `你投胎成為 ${y} 年 ${m} 月 ${d} 日 ${pad(input.time.h)}:${pad(input.time.mi)}，在${county}出生的${sex === "female" ? "女孩" : "男孩"}。`);
}

function begin(input, born) {
  stop();
  let chart;
  try { chart = computeChart({ ...input, options: { solar: "true" } }); }
  catch (e) { console.error(e); return showError("這個日期或地點沒辦法排盤，請再檢查一次。"); }
  const prep = prepare(chart);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  run = { input, chart, prep, seed, born, life: createLife({ chart, analysis: prep.analysis, luck: prep.luck, seed }), summary: null };
  $("#setup").hidden = true; $("#end").hidden = true; $("#play").hidden = false;
  $("#feed").innerHTML = ""; $("#choice").hidden = true;
  $("#born").textContent = born || `${input.date.y} 年 ${input.date.m} 月 ${input.date.d} 日在${input.place.name}出生。`;
  paused = false; $("#c-pause").textContent = "暫停";
  updateStatus();
  window.scrollTo({ top: 0 });
  schedule();
}

function stop() { if (timer) { clearTimeout(timer); timer = null; } }
function schedule() { stop(); if (!paused && run && !run.life.done) timer = setTimeout(tick, SPEED_MS[speed]); }

function tick() {
  timer = null;
  const life = run.life;
  if (life.done) return finish();
  if (life.pending) return showChoice();
  const entries = life.step();
  render(entries);
  updateStatus();
  if (life.pending) return showChoice();
  if (life.done) return finish();
  schedule();
}

function choose(i) {
  const entries = run.life.choose(i);
  $("#choice").hidden = true;
  render(entries);
  updateStatus();
  if (run.life.pending) return showChoice();
  if (run.life.done) return finish();
  schedule();
}

function skipToEnd() {
  stop();
  const life = run.life, all = [];
  let guard = 0;
  while (!life.done && guard++ < 5000) all.push(...(life.pending ? life.autoChoose() : life.step()));
  $("#choice").hidden = true;
  render(all);
  finish();
}

const lineOf = e => `<p class="${e.big ? "big" : ""}">${esc(e.text)}</p>${e.choice ? `<span class="chose">你的選擇：${esc(e.choice)}</span>` : ""}${e.reason ? `<span class="why">命盤：${esc(e.reason)}</span>` : ""}`;

function render(entries) {
  if (!entries.length) return;
  const feed = $("#feed");
  for (const e of entries) {
    let li = feed.lastElementChild;
    if (!li || Number(li.dataset.age) !== e.age) {
      li = document.createElement("li");
      li.dataset.age = e.age;
      li.innerHTML = `<span class="when">${e.age} 歲<small>${e.year}</small></span><div class="lines"></div>`;
      feed.appendChild(li);
    }
    li.querySelector(".lines").insertAdjacentHTML("beforeend", lineOf(e));
  }
  const last = feed.lastElementChild;
  if (last && !$("#play").hidden) last.scrollIntoView({ block: "nearest", behavior: speed === 10 ? "auto" : "smooth" });
}

function updateStatus() {
  const s = run.life.state, l = run.prep.luck[Math.max(0, s.age - 1)];
  $("#s-age").textContent = `${s.age} 歲`;
  $("#s-year").textContent = `${s.year} 年`;
  $("#s-decade").textContent = s.age >= 1 && l && l.decade ? l.decade : "童限";
  $("#s-pillar").textContent = l ? l.year : "";
  $("#s-mood").style.width = `${Math.round(s.happiness)}%`;
}

function showChoice() {
  stop();
  const p = run.life.pending, box = $("#choice");
  const l = run.prep.luck[Math.max(0, run.life.state.age - 1)];
  const why = l && l.reasons.length ? `<p class="why">這一年的命盤：${esc(l.reasons[0].text)}</p>` : "";
  box.innerHTML = `<p class="q">${esc(p.prompt)}</p>${why}<div class="options">${p.options.map((o, i) => `<button type="button" data-option="${i}"><b>${esc(o.label)}</b>${o.hint ? `<small>${esc(o.hint)}</small>` : ""}</button>`).join("")}</div>`;
  box.hidden = false;
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  box.querySelector("button").focus({ preventScroll: true });
}

// ---------- the end ----------
function finish() {
  stop();
  const { life, chart, prep, input } = run;
  const s = life.state;
  run.summary = rerun({ chart, analysis: prep.analysis, luck: prep.luck, runs: 100, key: `${chart.pillars.map(p => p.name).join("")}|${input.sex}|${input.date.y}` });
  $("#end-title").textContent = `這一次，你活到 ${s.age} 歲。`;
  $("#end-sub").textContent = `這只是同一張命盤的其中一種人生。下面的 100 次重跑，才看得出哪些事情比較常發生。`;
  const peak = life.kline.reduce((a, b) => (b.close > a.close ? b : a), life.kline[0]);
  const facts = [
    ["學歷", EDU[s.edu] || s.edu],
    ["工作", s.retired ? `退休（最後是${s.job ? s.job.title : "上班族"}）` : s.job ? s.job.title : "沒有固定工作"],
    ["婚姻", s.marriages ? `${s.marriages} 次婚姻${s.divorces ? `，離婚 ${s.divorces} 次` : ""}` : "沒有結婚"],
    ["子女", s.kids.length ? `${s.kids.length} 個孩子` : "沒有孩子"],
    ["房子", s.home === "own" ? "有自己的房子" : "租屋"],
    ["心情最好的一年", `${peak.age} 歲（${peak.year} 年）`],
  ];
  $("#end-facts").innerHTML = facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  $("#end").hidden = false;
  drawKline();
  drawTable();
  drawCards();
  drawShare(peak);
  $("#end").scrollIntoView({ behavior: "smooth", block: "start" });
}

function drawKline() {
  const { life, summary, prep } = run;
  const plot = $("#plot"), tip = $("#tip");
  const W = Math.max(320, plot.clientWidth || 600), H = 260, L = 34, R = 10, T = 10, B = 28;
  const maxAge = Math.max(life.state.age, summary.band.length ? summary.band[summary.band.length - 1].age : 0, 10);
  const x = a => L + (a / maxAge) * (W - L - R), y = v => T + (1 - v / 100) * (H - T - B);
  const step = (W - L - R) / maxAge, bodyW = Math.max(2, Math.min(12, step * 0.62));
  const band = summary.band;
  const area = band.length ? `M${band.map(b => `${x(b.age).toFixed(1)},${y(b.p90).toFixed(1)}`).join("L")}L${band.slice().reverse().map(b => `${x(b.age).toFixed(1)},${y(b.p10).toFixed(1)}`).join("L")}Z` : "";
  const median = band.map(b => `${x(b.age).toFixed(1)},${y(b.p50).toFixed(1)}`).join(" ");
  const grid = [0, 25, 50, 75, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--wash)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`).join("");
  const ticks = [];
  for (let a = 0; a <= maxAge; a += 10) ticks.push(`<text x="${x(a)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${a} 歲</text>`);
  const candles = life.kline.map(k => {
    const up = k.close >= k.open, cx = x(k.age), top = y(Math.max(k.open, k.close)), h = Math.max(1.5, Math.abs(y(k.open) - y(k.close)));
    const color = up ? "var(--up)" : "var(--down)";
    return `<line x1="${cx}" x2="${cx}" y1="${y(k.high)}" y2="${y(k.low)}" stroke="${color}" stroke-width="1"/>`
      + (up ? `<rect x="${cx - bodyW / 2}" y="${top}" width="${bodyW}" height="${h}" rx="1" fill="${color}"/>`
        : `<rect x="${cx - bodyW / 2 + 0.75}" y="${top + 0.75}" width="${Math.max(0.5, bodyW - 1.5)}" height="${Math.max(0.5, h - 1.5)}" rx="1" fill="var(--sheet)" stroke="${color}" stroke-width="1.5"/>`);
  }).join("");
  plot.querySelector("svg")?.remove();
  plot.insertAdjacentHTML("afterbegin", `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="人生 K 線：每一年的心情起伏，背景是同盤 100 次人生的範圍">${grid}${ticks.join("")}<path d="${area}" fill="var(--band)"/><polyline points="${median}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${candles}<line id="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-width="1" visibility="hidden"/><rect id="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg>`);
  const svg = plot.querySelector("svg"), cross = svg.querySelector("#cross");
  const byAge = new Map(life.kline.map(k => [k.age, k]));
  const eventsAt = age => life.log.filter(e => e.age === age).slice(0, 3);
  const move = ev => {
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width);
    const age = Math.max(0, Math.min(maxAge, Math.round((px - L) / step)));
    const k = byAge.get(age), b = band.find(z => z.age === age), l = prep.luck[Math.max(0, age - 1)];
    if (!k && !b) { tip.hidden = true; cross.setAttribute("visibility", "hidden"); return; }
    cross.setAttribute("x1", x(age)); cross.setAttribute("x2", x(age)); cross.setAttribute("visibility", "visible");
    tip.innerHTML = `<b>${age} 歲</b>${k ? `（${k.year} 年）` : ""}${l ? `・流年 ${esc(l.year)}` : ""}`
      + (k ? `<br>這一次的心情：${k.close}` : "<br>這一次已經離世")
      + (b ? `<br>100 次的中位數：${b.p50}` : "")
      + eventsAt(age).map(e => `<br>・${esc(e.text)}`).join("");
    tip.hidden = false;
    const left = Math.min(r.width - 250, Math.max(0, (x(age) / W) * r.width + 12));
    tip.style.left = `${left}px`; tip.style.top = "8px";
  };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerdown", move);
  svg.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
}

function drawTable() {
  const { life, prep } = run;
  $("#kline-table").innerHTML = `<table><thead><tr><th>年齡</th><th>年份</th><th>流年</th><th>開</th><th>收</th><th>高</th><th>低</th></tr></thead><tbody>${life.kline.map(k => `<tr><td>${k.age} 歲</td><td>${k.year}</td><td>${esc((prep.luck[Math.max(0, k.age - 1)] || {}).year || "")}</td><td>${k.open}</td><td>${k.close}</td><td>${k.high}</td><td>${k.low}</td></tr>`).join("")}</tbody></table>`;
}

function hurdleList(h, withBody) {
  if (!h.years.length) return `<p>這張命盤在這方面沒有特別明顯的關卡年。</p>`;
  return `<ul>${h.years.map(y => `<li><b>${y.age} 歲</b>（${y.year}）：${esc(y.reason || "流年對這方面不利")}。${withBody && y.body ? `傳統命理上，${y.body.element}對應${esc(y.body.system)}。` : ""}100 次裡有 ${y.hits} 次在這前後出事。</li>`).join("")}</ul>`;
}

function drawCards() {
  const r = run.summary, s = run.life.state;
  const h = Object.fromEntries(r.hurdles.map(x => [x.domain, x]));
  const max = Math.max(...r.lifespan.bins.map(b => b.n), 1);
  const bins = r.lifespan.bins.filter(b => b.from >= 40 || b.n > 0);
  const hist = `<div class="hist" role="img" aria-label="100 次人生的壽命分布">${bins.map(b => `<i title="${b.from}–${b.to} 歲：${b.n} 次" style="height:${Math.max(2, Math.round(b.n / max * 66))}px"></i>`).join("")}</div><div class="hist-axis"><span>${bins[0].from} 歲</span><span>${bins[bins.length - 1].to} 歲</span></div>`;
  const cards = [
    `<div class="card"><h3>壽命</h3>
      <p class="count">100 次人生裡，一半落在 <em>${r.lifespan.p25}–${r.lifespan.p75} 歲</em>之間</p>
      ${hist}
      <p>中位數 ${r.lifespan.median} 歲。活過 90 歲有 ${r.lifespan.over90} 次，不到 60 歲有 ${r.lifespan.under60} 次。這一次活到 ${s.age} 歲，只是其中一種可能。</p>
      <p class="help">如果這個結果讓你心裡不舒服，可以打 1925 安心專線（24 小時）。</p>
      <p class="fine">壽命以內政部生命表為基準，命盤只讓機率傾斜，不是預言。</p></div>`,
    `<div class="card"><h3>健康</h3>
      <p class="count">100 次裡，有 <em>${r.seriousBefore60} 次</em>在 60 歲前生過重病</p>
      <p>重病指癌症、中風或心臟病；一輩子生過重病的有 ${r.seriousEver} 次。命盤上的健康關卡年：</p>
      ${hurdleList(h.health, true)}
      <p class="fine">真實的健康風險，要看健康檢查和醫師的建議，不是看命盤。</p></div>`,
    `<div class="card"><h3>婚姻</h3>
      <p class="count">100 次裡有 <em>${r.married} 次</em>結婚，其中 ${r.divorced} 次離過婚</p>
      <p>沒有孩子 ${r.kids[0].runs} 次，一個 ${r.kids[1].runs} 次，兩個 ${r.kids[2].runs} 次，三個以上 ${r.kids[3].runs} 次。命盤上的婚姻關卡年：</p>
      ${hurdleList(h.love, false)}
      <p class="fine">感情是兩個人一起經營的。模擬裡的抉擇，也會改變婚姻的結局。</p></div>`,
    `<div class="card"><h3>事業與財務</h3>
      <p class="count">100 次裡有 <em>${r.university} 次</em>讀到大學以上，${r.homeOwner} 次買了房子</p>
      <p>事業關卡年：</p>${hurdleList(h.career, false)}
      <p>財務關卡年：</p>${hurdleList(h.wealth, false)}
      <p class="fine">關卡年是命盤上不利的年份，不代表一定會出事。</p></div>`,
  ];
  $("#cards").innerHTML = cards.join("");
}

function drawShare(peak) {
  const { life, chart, prep } = run;
  const pts = life.kline.map(k => k.close), n = Math.max(1, pts.length - 1);
  const line = pts.map((v, i) => `${(i / n * 300).toFixed(1)},${(56 - v / 100 * 52).toFixed(1)}`).join(" ");
  $("#share").innerHTML = `<span class="brand">命盤人生</span>
    <span class="sub">${chart.input.date.y} 年生・屬${esc(chart.zodiac)}・${esc(prep.analysis.dayMaster.stem + prep.analysis.dayMaster.element)}日主</span>
    <span class="big">這一次，活到 ${life.state.age} 歲</span>
    <svg viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true"><polyline points="${line}" fill="none" stroke="var(--seal)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
    <span class="sub">人生高峰在 ${peak.age} 歲那年</span>
    <span class="foot">模擬故事，不是預言・命理推演僅供參考</span>`;
}

setup();
