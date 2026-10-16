// 命盤人生・人生模擬頁：生辰 → 命盤 → 一年一年過完一生 → 人生 K 線與同盤重跑 100 次。全部在瀏覽器裡算。
import { computeChart } from "./core/chart.js";
import { PLACE_GROUPS, findPlace } from "./core/places.js";
import { prepare } from "./sim/setup.js";
import { createLife } from "./sim/life.js";
import { rerun } from "./sim/monte.js";
import { PROVISIONAL } from "./sim/rates.js";
import { COUNTIES } from "./sim/world.js";
import { makeRng } from "./sim/rng.js";
import { randomName } from "./sim/random-name.js";
import { describeEffects, LEVEL_NAME } from "./core/name.js";
import { checkFamily, familyTilts, describeFamilyTilts, isSibling } from "./core/family.js";
import { describeViews } from "./core/analysis.js";
import { safetyCheck, matchIntent } from "./sim/intent.js";
import { interpretPrompt, readInterpretation } from "./sim/interpret.js";
import { ACTIONS } from "./sim/actions.js";
import { trait } from "./sim/words.js";

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SPEED_MS = { 1: 900, 3: 320, 10: 90 };
const EDU = { none: "沒有上學", 國小: "國小", 國中: "國中", 高中: "高中", 高職: "高職", 五專: "五專", 科大: "科技大學", 大學: "大學", 碩士: "碩士", 博士: "博士" };

let run = null;   // { input, extra: { name, family }, chart, prep, life, seed, born }
let timer = null, speed = 1, paused = false;
// Claude reads what the player writes, when this view can use it (the artifact's sample capability). Elsewhere, or
// once the viewer declines, the page matches the words itself and asks the player to pick.
let sampler = null, claudeOff = false, leanNoted = false;
if (window.claude && typeof window.claude.use === "function") window.claude.use("sample").then(fn => { sampler = fn || null; showFreeNote(); }).catch(() => {});

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
  $("#choice").addEventListener("click", e => {
    const b = e.target.closest("[data-option]");
    if (b) return choose(Number(b.dataset.option));
    const pick = e.target.closest("[data-free-action]");
    if (pick) return applyFree(pick.dataset.freeAction, pick.dataset.summary);
    if (e.target.closest("[data-free-cancel]")) { $("#free-out").innerHTML = ""; $("#free-text").focus(); }
  });
  $("#choice").addEventListener("submit", e => { e.preventDefault(); const t = $("#free-text"); if (t && t.value.trim()) interpretFree(t.value.trim()); });
  $("#add-sibling").addEventListener("click", addSibling);
  $("#sibling-list").addEventListener("click", e => { const b = e.target.closest(".remove"); if (b) b.closest(".member").remove(); });
  $("#f-only").addEventListener("change", () => {
    const only = $("#f-only").checked;
    $("#sibling-list").hidden = only; $("#add-sibling").hidden = only;
  });
  $("#again-same").addEventListener("click", () => begin(run.input, run.born, run.extra));
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

const SIBLINGS = [["olderBrother", "哥哥"], ["olderSister", "姊姊"], ["youngerBrother", "弟弟"], ["youngerSister", "妹妹"]];
function addSibling() {
  const list = $("#sibling-list");
  if (list.children.length >= 8) return;
  const row = document.createElement("div");
  row.className = "member";
  row.innerHTML = `<select class="m-rel" aria-label="關係">${SIBLINGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
    <input type="text" class="m-name" maxlength="8" placeholder="姓名" aria-label="姓名">
    <span class="when"><input type="date" class="m-date" min="1900-01-01" max="2100-12-31" aria-label="出生日期"><input type="time" class="m-time" aria-label="出生時間（選填）"></span>
    <button type="button" class="remove" aria-label="移除這位兄弟姊妹">移除</button>`;
  list.appendChild(row);
  row.querySelector(".m-rel").focus();
}

const cleanName = v => String(v || "").replace(/\s+/g, "");
function readMember(el) {
  const name = cleanName(el.querySelector(".m-name").value);
  const [y, m, d] = (el.querySelector(".m-date").value || "").split("-").map(Number);
  const [h, mi] = (el.querySelector(".m-time").value || "").split(":").map(Number);
  return { name, date: y ? { y, m, d } : null, time: y && Number.isFinite(h) ? { h, mi: mi || 0 } : null };
}

// The optional family section, or null when nothing was filled in.
function readFamily() {
  const out = { siblings: [], onlyChild: $("#f-only").checked };
  for (const el of document.querySelectorAll(".member[data-role]")) {
    const m = readMember(el);
    if (m.name || m.date) out[el.dataset.role] = m;
  }
  if (!out.onlyChild) for (const el of document.querySelectorAll("#sibling-list .member")) {
    const m = readMember(el);
    if (m.name || m.date) out.siblings.push({ relation: el.querySelector(".m-rel").value, ...m });
  }
  return out.father || out.mother || out.siblings.length || out.onlyChild ? out : null;
}

function startFromForm() {
  const [y, m, d] = ($("#f-date").value || "").split("-").map(Number);
  if (!y) return showError("請輸入出生日期。");
  if (y < 1900 || y > 2100) return showError("出生年份請在 1900 到 2100 年之間。");
  const noHour = $("#f-nohour").checked;
  const [h, mi] = ($("#f-time").value || "").split(":").map(Number);
  if (!noHour && !Number.isFinite(h)) return showError("請輸入出生時間，或勾選「時辰不詳」。");
  const family = readFamily();
  const members = family ? [family.father, family.mother, ...family.siblings].filter(Boolean) : [];
  if (members.some(x => x.date && (x.date.y < 1900 || x.date.y > 2100))) return showError("家人的出生年份請在 1900 到 2100 年之間。");
  const problems = checkFamily(family, { y, m, d });
  if (problems.length) { $("#family").open = true; return showError(problems.join(" ")); }
  showError("");
  const input = { date: { y, m, d }, time: noHour ? null : { h, mi: mi || 0 }, place: findPlace($("#f-place").value), sex: $("#sex-f").checked ? "female" : "male" };
  begin(input, null, { name: cleanName($("#f-name").value), family });
}

function startRandom() {
  const rng = makeRng(crypto.getRandomValues(new Uint32Array(1))[0]);
  const y = 1950 + rng.int(76), m = 1 + rng.int(12), d = 1 + rng.int(new Date(Date.UTC(y, m, 0)).getUTCDate());
  const county = rng.weighted(COUNTIES), place = PLACE_GROUPS.find(g => g.group === `臺灣・${county}`).places[0];
  const sex = rng() < 0.5 ? "male" : "female";
  const input = { date: { y, m, d }, time: { h: rng.int(24), mi: rng.int(60) }, place, sex };
  const name = randomName(rng, y, sex);
  const pad = n => String(n).padStart(2, "0");
  begin(input, `你投胎成為 ${y} 年 ${m} 月 ${d} 日 ${pad(input.time.h)}:${pad(input.time.mi)}，在${county}出生的${sex === "female" ? "女孩" : "男孩"}，名叫${name}。`, { name });
}

function begin(input, born, extra = {}) {
  stop();
  let chart, prep;
  try { chart = computeChart({ ...input, options: { solar: "true" } }); prep = prepare(chart, { name: extra.name || "", family: extra.family || null }); }
  catch (e) { console.error(e); return showError("這個日期或地點沒辦法排盤，請再檢查一次。"); }
  // A name without Kangxi strokes still appears in the story; it just isn't scored.
  const name = prep.name || (extra.name ? { full: extra.name, effects: null } : null);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  run = { input, extra, chart, prep, name, seed, born, life: createLife({ chart, analysis: prep.analysis, luck: prep.luck, seed, name, family: prep.family }), summary: null };
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

const lineOf = e => `<p class="${e.big ? "big" : ""}">${esc(e.text)}</p>${e.choice ? `<span class="chose">${e.free ? "你自己的決定" : "你的選擇"}：${esc(e.choice)}</span>` : ""}${e.reason ? `<span class="why">${e.reasonFrom === "family" ? "合盤" : "命盤"}：${esc(e.reason)}</span>` : ""}`;

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
  const why = p.why ? `<p class="why">${p.why.from === "family" ? "合盤" : "這一年的命盤"}：${esc(p.why.text)}</p>`
    : l && l.reasons.length ? `<p class="why">這一年的命盤：${esc(l.reasons[0].text)}</p>` : "";
  const dm = run.prep.analysis.dayMaster, nature = (trait(run.prep.analysis) || "").split("，").pop();
  const leanNote = p.lean >= 0 && !leanNoted ? `<p class="lean-note">標著「個性傾向」的選項，是從你的${esc(dm.stem + dm.element)}日主（${esc(nature)}）和這一生做過的選擇推算的。選哪一個都可以。</p>` : "";
  if (p.lean >= 0) leanNoted = true;
  box.innerHTML = `<p class="q">${esc(p.prompt)}</p>${why}<div class="options">${p.options.map((o, i) => `<button type="button" data-option="${i}"><b>${esc(o.label)}</b>${o.hint ? `<small>${esc(o.hint)}</small>` : ""}${o.lean ? `<span class="lean">個性傾向</span>` : ""}</button>`).join("")}</div>${leanNote}`
    + (p.free ? `<form class="free" id="free-form" autocomplete="off">
      <label for="free-text">或者，寫下你自己的決定</label>
      <div class="free-row"><input type="text" id="free-text" maxlength="80" placeholder="例如：先跟家人商量看看"><button type="submit" id="free-go">這樣做</button></div>
      <p class="free-note" id="free-note"></p>
      <div class="free-out" id="free-out" aria-live="polite"></div>
    </form>` : "");
  showFreeNote();
  box.hidden = false;
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  box.querySelector("button").focus({ preventScroll: true });
}

function showFreeNote() {
  const note = $("#free-note");
  if (!note) return;
  note.textContent = sampler && !claudeOff
    ? "你寫的這句話會交給 Claude 判讀（只附上年齡、工作、感情狀態，不送姓名和生日），結果一樣照模擬規則計算。"
    : "會在你的瀏覽器裡找出最接近的選擇給你確認，不會上傳。";
}

const freeOut = html => { const out = $("#free-out"); if (out) out.innerHTML = html; };
const SAFETY_TEXT = {
  self_harm: `<div class="help">如果你現在真的有這樣的感覺，請找人說說：1925 安心專線（24 小時）、1995 生命線、1980 張老師。<br>故事裡，我們換一個選擇好嗎？</div>`,
  harm: `<p>這個選擇會傷害別人或違法，故事不會往這個方向走。換個方式寫寫看？</p>`,
};

// What the player wrote → an action. Safety words first (never simulated), then Claude when allowed, else the
// local matcher's closest guesses for the player to pick. Nothing applies until the player confirms.
async function interpretFree(text) {
  const p = run.life.pending;
  if (!p || !p.free) return;
  const safety = safetyCheck(text);
  if (safety !== "ok") return freeOut(SAFETY_TEXT[safety]);
  const go = $("#free-go"), box = $("#free-text");
  if (sampler && !claudeOff) {
    freeOut(`<p class="muted">Claude 正在理解你的決定…</p>`);
    go.disabled = true; box.disabled = true;
    try {
      const reply = await sampler.json(interpretPrompt({ ...p.free, text }), { modelTier: "quick" });
      const r = readInterpretation(reply, { options: p.free.options });
      if (r.action === "self_harm" || r.action === "harm") return freeOut(SAFETY_TEXT[r.action]);
      if (r.action !== "unknown") return confirmFree(r.action, r.summary || `你決定「${text}」`);
    } catch (e) {
      if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(e && e.code)) { claudeOff = true; showFreeNote(); }
    } finally {
      go.disabled = false; box.disabled = false;
    }
  }
  suggestFree(text);
}

// Up to three closest actions, preferring this choice's own option when one does the same thing.
function suggestFree(text) {
  const p = run.life.pending, picks = [];
  for (const r of matchIntent(text)) {
    const own = p.options.find(o => o.id && o.act === r.id);
    const id = own ? own.id : r.id;
    if (!picks.some(x => x.id === id)) picks.push({ id, label: own ? own.label : ACTIONS[r.id].label });
    if (picks.length === 3) break;
  }
  const summary = `你決定「${text}」`;
  if (!picks.length) return freeOut(`<p>看不太出來要怎麼做。換個說法寫寫看，或選上面的選項。</p>`);
  freeOut(`<p>你的意思比較接近哪一個？</p><div class="suggest">${picks.map(x => `<button type="button" data-free-action="${esc(x.id)}" data-summary="${esc(summary)}">${esc(x.label)}</button>`).join("")}<button type="button" class="plain" data-free-cancel>都不是</button></div>`);
}

function confirmFree(action, summary) {
  const p = run.life.pending;
  const own = p.options.find(o => o.id === action);
  const rule = own ? own.label : ACTIONS[action] ? ACTIONS[action].label : "";
  freeOut(`<p><b>${esc(summary)}</b>${rule ? `<br><small>照「${esc(rule)}」的規則計算</small>` : ""}</p><div class="suggest"><button type="button" data-free-action="${esc(action)}" data-summary="${esc(summary)}">確定</button><button type="button" class="plain" data-free-cancel>改一下</button></div>`);
}

function applyFree(action, summary) {
  const r = run.life.chooseAction({ action, summary });
  if (r.infeasible) return freeOut(`<p>這個現在做不到：${esc(r.infeasible)}</p>`);
  $("#choice").hidden = true;
  render(r.entries);
  updateStatus();
  if (run.life.pending) return showChoice();
  if (run.life.done) return finish();
  schedule();
}

// ---------- the end ----------
function finish() {
  stop();
  const { life, chart, prep, input } = run;
  const s = life.state;
  run.summary = rerun({ chart, analysis: prep.analysis, luck: prep.luck, runs: 100, key: `${chart.pillars.map(p => p.name).join("")}|${input.sex}|${input.date.y}`, name: run.name, family: prep.family });
  $("#end-title").textContent = `這一次，你活到 ${s.age} 歲。`;
  $("#end-sub").textContent = `這只是同一張命盤的其中一種人生。下面的 100 次重跑，才看得出哪些事情比較常發生。`;
  const peak = life.kline.reduce((a, b) => (b.close > a.close ? b : a), life.kline[0]);
  const facts = [
    ...(s.name ? [["姓名", s.name]] : []),
    ["學歷", EDU[s.edu] || s.edu],
    ["工作", s.retired ? `退休（最後是${s.job ? s.job.title : "上班族"}）` : s.job ? s.job.title : "沒有固定工作"],
    ["婚姻", s.marriages ? `${s.marriages} 次婚姻${s.divorces ? `，離婚 ${s.divorces} 次` : ""}` : "沒有結婚"],
    ["子女", s.kids.length ? `${s.kids.length} 個孩子` : "沒有孩子"],
    ["房子", s.home === "own" ? "有自己的房子" : "租屋"],
    ["心情最好的一年", `${peak.age} 歲（${peak.year} 年）`],
    ...(s.written ? [["自己寫的決定", `${s.written} 次`]] : []),
  ];
  $("#end-facts").innerHTML = facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  $("#end").hidden = false;
  drawKline();
  drawTable();
  drawCards();
  drawPersonal();
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

// ---------- name and family ----------
const LEVEL_CLASS = { 1: "lv-good", 0: "", "-1": "lv-bad" };
const SCORED = ["人格", "地格", "外格", "總格"];

function nameCard() {
  const { prep, extra } = run, n = prep.name;
  if (!n) return `<div class="card"><h3>姓名：${esc(extra.name)}</h3><p>${esc(prep.nameError || "沒有辦法分析這個名字。")}這次沒有計算姓名學，名字還是會出現在故事裡。</p></div>`;
  const good = SCORED.filter(k => n.grids[k].level > 0).length;
  const rows = ["天格", ...SCORED].map(k => {
    const g = n.grids[k], scored = k !== "天格";
    const level = scored
      ? `<span class="${LEVEL_CLASS[g.level]}">${LEVEL_NAME[g.level]}</span>${g.agree ? "" : `<br><small class="muted">兩個數理表：${g.tables.join("、")}</small>`}${g.readings > 1 ? `<br><small class="muted">${g.readings} 種筆畫算法裡 ${g.good} 種是吉</small>` : ""}`
      : `<span class="muted">不計分</span>`;
    return `<tr><td>${k}</td><td class="n">${g.value}</td><td>${g.element}</td><td>${level}</td><td class="muted">${esc(g.role)}</td></tr>`;
  }).join("");
  const strokes = n.chars.map(c => `${c.ch} ${c.strokes.all.join(" 或 ")} 畫`).join("、");
  const given = n.chars.slice([...n.surname].length), useful = prep.analysis.useful;
  const hit = [...new Set(given.filter(c => useful.includes(c.number)).map(c => c.number))];
  const missed = [...new Set(given.filter(c => prep.analysis.avoid.includes(c.number)).map(c => c.number))];
  const verdict = hit.length ? `補到了喜用的${hit.join("、")}` : missed.length ? `名字的${missed.join("、")}是你比較忌的五行` : "沒有特別補到喜用";
  const supplement = `<p>名字補八字：${given.map(c => `${esc(c.ch)} ${c.strokes.primary} 畫屬${c.number}`).join("、")}。你的喜用是${useful.length ? useful.join("、") : "（不明顯）"}，${verdict}。</p>`;
  const effects = describeEffects(n.effects);
  return `<div class="card"><h3>姓名：${esc(n.full)}</h3>
    <p class="count">計分的四格裡有 <em>${good} 格是吉</em>，三才「${n.sancai.elements}」${n.sancai.name}</p>
    <p>康熙筆畫：${esc(strokes)}</p>
    <div class="table-wrap"><table class="grids"><thead><tr><th>格</th><th>數</th><th>五行</th><th>吉凶</th><th>代表</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${supplement}
    ${effects.length ? `<p>在這次模擬裡，名字讓：</p><ul>${effects.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>這個名字在模擬裡沒有明顯的傾斜。</p>"}
    <p class="fine">姓名學的流派很多，筆畫算法和 81 數理表都有不同版本。這裡用康熙筆畫，兩個數理表看法不同時算半吉；天格是祖先傳下來的姓，多數流派不論吉凶。名字的影響最多 ±5%，而且不會影響壽命和重病。</p></div>`;
}

function familyCard() {
  const { prep, summary } = run, family = prep.family;
  const toneClass = t => (t === "互補" ? "tone-good" : t === "需要磨合" ? "tone-bad" : "tone-even");
  const items = family.members.map(m => {
    const who = `${m.label}${m.name ? `（${esc(m.name)}）` : ""}`;
    if (!m.bond) return `<li><b>${who}</b><small>沒有填生日，只用名字出現在故事裡</small></li>`;
    const notes = m.bond.notes.length ? m.bond.notes.map(x => esc(x.text)).join("；") : "沒有明顯的合、沖或生剋";
    return `<li><b>${who}<span class="tone ${toneClass(m.bond.tone)}">${m.bond.tone}</span></b><small>${notes}</small></li>`;
  });
  if (family.onlyChild) items.push(`<li><b>獨生子女</b><small>故事裡不會有兄弟姊妹</small></li>`);
  const lines = describeFamilyTilts(familyTilts(family));
  const f = summary.family, has = r => family.members.some(m => m.relation === r), counts = [];
  if (has("father")) counts.push(`有 ${f.fatherClash} 次和爸爸吵過架`);
  if (has("mother")) counts.push(`有 ${f.motherClash} 次和媽媽吵過架`);
  if (family.members.some(m => isSibling(m.relation))) counts.push(`有 ${f.siblingRivalry} 次小時候和兄弟姊妹吵過架`, `有 ${f.siblingHelp} 次得到兄弟姊妹幫忙`);
  return `<div class="card"><h3>家人合盤</h3>
    <ul class="bonds">${items.join("")}</ul>
    ${lines.length ? `<p>在這次模擬裡，家人的命盤讓：</p><ul>${lines.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>沒有填生日的家人，所以沒有合盤的傾斜。</p>"}
    ${counts.length ? `<p>100 次人生裡，${counts.join("，")}。</p>` : ""}
    <p class="fine">合盤只看生肖、日柱和五行的關係，讓機率傾斜最多 ±15%，不影響壽命和重病。家人之間怎麼相處，還是要靠彼此。</p></div>`;
}

// How the chart showed in this life: jobs and their elements, the choices that followed the person's nature.
function chartCard() {
  const { prep, life } = run, a = prep.analysis, s = life.state;
  const dm = `${a.dayMaster.stem}${a.dayMaster.element}`, nature = (trait(a) || "").split("，").pop();
  const jobs = s.jobsHeld.map(j => `${esc(j.title)}（${j.element || "？"}${a.useful.includes(j.element) ? "・喜用" : ""}）`);
  const fit = s.jobsHeld.filter(j => a.useful.includes(j.element)).length;
  const peak = life.kline.reduce((x, y) => (y.close > x.close ? y : x), life.kline[0]);
  const top = prep.luck.slice(0, Math.max(1, s.age)).slice().sort((x, y) => y.score - x.score).slice(0, 5).sort((x, y) => x.age - y.age);
  const inTop = top.some(y => Math.abs(y.age - peak.age) <= 1);
  const view = describeViews(a).find(v => a.useful[0] && v.includes(`喜${a.useful[0]}`)) || "";
  return `<div class="card"><h3>命盤與這一生</h3>
    <p class="count">${esc(dm)}日主，<em>${esc(nature)}</em></p>
    <p>命盤${a.useful.length ? `喜${esc(a.useful.join("、"))}` : "喜忌不明顯"}${a.avoid.length ? `，忌${esc(a.avoid.join("、"))}` : ""}，格局是${esc(a.pattern)}。${view ? `${esc(view)}。` : ""}</p>
    ${jobs.length ? `<p>做過的工作：${jobs.join("、")}。${fit ? `其中 ${fit} 份屬於你的喜用五行。` : "沒有一份屬於你的喜用五行。"}</p>` : ""}
    ${s.lean.offered ? `<p>${s.lean.offered} 次抉擇裡有明顯的個性傾向，你有 ${s.lean.followed} 次選了它。</p>` : ""}
    ${s.written ? `<p>你自己寫了 ${s.written} 個決定。</p>` : ""}
    <p>流年最好的幾年：${top.map(y => `${y.age} 歲（${esc(y.year)}）`).join("、")}。${inTop ? `心情最好的 ${peak.age} 歲，正好落在其中。` : `心情最好的一年是 ${peak.age} 歲。`}</p>
    <p class="fine">五行行業、格局與職業的對應採用傳統命理的說法；個性傾向從日主出發，也會被這一生的選擇改變。僅供參考。</p></div>`;
}

function drawPersonal() {
  const cards = [chartCard()];
  if (run.extra.name) cards.push(nameCard());
  if (run.prep.family) cards.push(familyCard());
  const more = cards.length > 1;
  $("#personal-title").textContent = more ? "命盤、名字和家人" : "命盤在這一生裡";
  $("#personal-lede").textContent = more ? "命盤、姓名學和家人合盤，在這一生裡怎麼出現。" : "命盤的喜忌、格局和個性，在這一生裡怎麼出現。";
  $("#personal").hidden = false;
  $("#personal-cards").innerHTML = cards.join("");
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
