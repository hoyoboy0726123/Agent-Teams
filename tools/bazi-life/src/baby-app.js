// 準爸媽模式：替寶寶比較候選名字（每個名字跑同樣的 100 次人生）、比較可能的出生時段（只比較滿 39 週以後），
// 以及寶寶和爸媽的合盤。計算在 sim/compare.js；這裡只負責表單和畫面。全部在瀏覽器裡算，不上傳。
import { PLACE_GROUPS, findPlace } from "./core/places.js";
import { checkFamily } from "./core/family.js";
import { natalReading } from "./core/reading-natal.js";
import { yearReading, decadeReading } from "./core/reading-year.js";
import { overallReading } from "./core/reading-overall.js";
import { reportHTML } from "./report.js";
import { babyCharts, nameCandidates, runSlice, statsOf, gestation, slotRange, checkSlot, slotEntry, rankSlots, MAX_NAMES, MAX_SLOTS, RUNS, EARLIEST_WEEKS } from "./sim/compare.js";
import { showNursery } from "./pixel-app.js";
import { draftStore, readIds, writeIds, later } from "./draft.js";
import { initTimeField, readTimeField, syncTimeField, timeFieldIds } from "./time-field.js";
import { initMemberHours, syncMemberHours, memberHourValue, setMemberHour, readMemberHour } from "./member-time.js";
import { timeText } from "./core/shichen.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const tick = () => new Promise(done => setTimeout(done, 0));
const pad = n => String(n).padStart(2, "0");
const dateText = d => `${d.y} 年 ${d.m} 月 ${d.d} 日`;
const SEX = { male: "男寶寶", female: "女寶寶" };
// The simulated outcomes the cards compare: label, key, and whether more is better.
const METRICS = [["平均心情", "mood", true], ["大學以上", "university", true], ["結婚", "married", true], ["離婚", "divorced", false], ["有自己的房子", "home", true], ["升遷過", "promoted", true]];

let hooks = null;   // { begin, showError } from life-app.js
let state = null;   // the comparison on screen
let job = 0;        // bumps to cancel a running comparison

export function initBaby(h) {
  hooks = h;
  $("#b-place").innerHTML = PLACE_GROUPS.map(g => `<optgroup label="${esc(g.group)}">${g.places.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("")}</optgroup>`).join("");
  initTimeField("b");
  initMemberHours($("#b-parents"));
  defaults();
  $("#add-slot").addEventListener("click", () => { addSlot(); saveSoon(); });
  $("#slot-list").addEventListener("click", e => { const b = e.target.closest(".remove"); if (b) { b.closest(".slot").remove(); saveSoon(); } });
  restore();
  for (const type of ["input", "change"]) $("#form-baby").addEventListener(type, saveSoon);
  for (const id of ["#b-parents", "#b-slots"]) $(id).addEventListener("toggle", saveSoon);
  $("#baby-clear").addEventListener("click", clearForm);
  addEventListener("pagehide", () => saveSoon.flush());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveSoon.flush(); });
  $("#form-baby").addEventListener("submit", e => { e.preventDefault(); compare(); });
  $("#baby").addEventListener("click", e => {
    const r = e.target.closest("[data-report]");
    if (r) return showReport(Number(r.dataset.report), state && state.reportSex);
    const s = e.target.closest("[data-start]");
    if (s) return startLife(Number(s.dataset.start));
    const x = e.target.closest("[data-report-sex]");
    if (x && state) return showReport(state.reportFor, x.dataset.reportSex);
  });
}

function addSlot(value = "") {
  const list = $("#slot-list");
  if (list.children.length >= MAX_SLOTS) return;
  const row = document.createElement("div");
  row.className = "slot";
  row.innerHTML = `<input type="datetime-local" class="s-when" aria-label="可能的出生時段"><button type="button" class="remove" aria-label="移除這個時段">移除</button>`;
  row.querySelector(".s-when").value = value;
  list.appendChild(row);
}

// The form as it starts: born in Taipei about four months from now, two empty birth slots.
function defaults() {
  $("#b-place").value = "臺北市";
  const today = new Date(), soon = new Date(today.getTime() + 120 * 86400000);
  $("#b-date").value = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`;
  syncTimeField("b");
  syncMemberHours($("#b-parents"));
  $("#slot-list").innerHTML = "";
  addSlot(); addSlot();
}

// 填到一半的表單 stays through a reload (draft.js: this tab only, gone when it is closed).
const DRAFT = draftStore("bazi-life.baby");
const FIELDS = ["b-surname", "b-sex-m", "b-sex-f", "b-sex-u", "b-date", ...timeFieldIds("b"), "b-place", "b-parents", "b-slots", "b-due"];
function save() {
  const parents = {};
  for (const el of document.querySelectorAll("#b-parents .member[data-brole]")) parents[el.dataset.brole] = { name: el.querySelector(".m-name").value, date: el.querySelector(".m-date").value, ...memberHourValue(el) };
  DRAFT.save({ v: 1, fields: readIds(FIELDS), givens: [...document.querySelectorAll(".b-given")].map(i => i.value), parents, slots: [...document.querySelectorAll("#slot-list .s-when")].map(i => i.value) });
}
const saveSoon = later(save);
function restore() {
  const d = DRAFT.load();
  if (!d || d.v !== 1) return;
  writeIds(d.fields);
  [...document.querySelectorAll(".b-given")].forEach((input, i) => { input.value = (d.givens && d.givens[i]) || ""; });
  for (const el of document.querySelectorAll("#b-parents .member[data-brole]")) {
    const m = d.parents && d.parents[el.dataset.brole];
    if (m) { el.querySelector(".m-name").value = m.name || ""; el.querySelector(".m-date").value = m.date || ""; setMemberHour(el, m); }
  }
  if (Array.isArray(d.slots)) {
    $("#slot-list").innerHTML = "";
    for (const v of d.slots.slice(0, MAX_SLOTS)) addSlot(typeof v === "string" ? v : "");
    while ($("#slot-list").children.length < 2) addSlot();
  }
  syncTimeField("b");
}
function clearForm() {
  if (!confirm("要清空這張表單嗎？填過的資料會刪掉。")) return;
  $("#form-baby").reset();
  for (const id of ["#b-parents", "#b-slots"]) $(id).open = false;
  defaults();
  DRAFT.clear();
  hooks.showError("");
}

const clean = v => String(v || "").replace(/\s+/g, "");
const parseDate = v => { const [y, m, d] = String(v || "").split("-").map(Number); return y ? { y, m, d } : null; };
function readMember(el) {
  const date = parseDate(el.querySelector(".m-date").value);
  return { name: clean(el.querySelector(".m-name").value), date, time: date ? readMemberHour(el) : null };
}

// The form, checked; an error message string when something is missing.
function readForm() {
  const surname = clean($("#b-surname").value);
  if (!surname || !/^\p{Script=Han}{1,2}$/u.test(surname)) return "請填寶寶的姓氏（一到兩個中文字）。";
  const givens = [...document.querySelectorAll(".b-given")].map(i => clean(i.value)).filter(Boolean);
  if (!givens.length) return "請至少填一個候選名字（不含姓）。";
  if (givens.some(g => !/^\p{Script=Han}{1,3}$/u.test(g))) return "候選名字請填一到三個中文字，不含姓。";
  const unique = [...new Set(givens)].slice(0, MAX_NAMES);
  const date = parseDate($("#b-date").value);
  if (!date || date.y < 1900 || date.y > 2100) return "請填出生日期（或預產期），年份在 1900 到 2100 年之間。";
  const hour = readTimeField("b");
  if (hour.error) return hour.error.replace("「時辰不詳」", "「還不知道時辰」");
  const sex = (document.querySelector('input[name="b-sex"]:checked') || {}).value || "unknown";
  const birth = { date, time: hour.time, place: findPlace($("#b-place").value), sex };
  const family = { siblings: [] };
  for (const el of document.querySelectorAll(".member[data-brole]")) { const m = readMember(el); if (m.name || m.date) family[el.dataset.brole] = m; }
  const parents = family.father || family.mother ? family : null;
  const problems = checkFamily(parents, date).map(t => t.replace(/比你早/g, "比寶寶早"));
  if (problems.length) { $("#b-parents").open = true; return problems.join(" "); }
  const due = parseDate($("#b-due").value);
  const slots = [...document.querySelectorAll("#slot-list .s-when")].map(i => i.value).filter(Boolean).map(v => {
    const [d, t] = v.split("T"), [sh, smi] = (t || "").split(":").map(Number);
    return { date: parseDate(d), time: Number.isFinite(sh) ? { h: sh, mi: smi || 0 } : null };
  });
  if (slots.length) {
    if (!due) { $("#b-slots").open = true; return "比較出生時段要先填預產期。"; }
    const bad = slots.map(s => checkSlot(s, due)).filter(Boolean);
    if (bad.length) { $("#b-slots").open = true; return bad[0]; }
  }
  return { surname, givens: unique, birth, family: parents, due, slots };
}

// ---------- the comparison ----------
async function compare() {
  const form = readForm();
  if (typeof form === "string") return hooks.showError(form);
  hooks.showError("");
  const my = ++job;
  let charts;
  try { charts = babyCharts(form.birth, form.family); }
  catch (e) { console.error(e); return hooks.showError("這個日期或地點沒辦法排盤，請再檢查一次。"); }
  const analysis = charts[0].prep.analysis;
  const key = `baby|${form.surname}|${form.birth.date.y}-${form.birth.date.m}-${form.birth.date.d}|${form.birth.time ? `${form.birth.time.h}:${form.birth.time.mi}` : "-"}|${form.birth.place.name}`;
  const names = nameCandidates(form.surname, form.givens, analysis).map(c => ({ ...c, stats: null }));
  state = { form, charts, analysis, key, names, slots: [], reportFor: null, reportSex: charts[0].sex };
  $("#baby").hidden = false;
  showNursery($("#baby-scene"), form.birth.sex);
  $("#baby-lede").textContent = `${dateText(form.birth.date)}${form.birth.time ? ` ${timeText(form.birth.time)}` : "（時辰還不知道）"}在${form.birth.place.name}出生的${SEX[form.birth.sex] || "寶寶（性別還不知道）"}。每個名字都用同一張命盤、同樣的 ${RUNS} 次人生來比，差別只來自名字。`;
  $("#baby-chart").innerHTML = chartBlock(charts);
  $("#baby-parents").innerHTML = parentsBlock(charts[0].prep.family);
  $("#baby-slots").innerHTML = "";
  $("#baby-advice").innerHTML = "";
  renderNames();
  const firstOk = names.findIndex(c => !c.error);
  showReport(firstOk >= 0 ? firstOk : null, charts[0].sex);
  $("#baby").scrollIntoView({ behavior: "smooth", block: "start" });

  // The names, then the slots, a slice at a time so the page stays responsive.
  const todo = names.filter(c => !c.error);
  for (const [n, c] of todo.entries()) {
    const lives = [];
    for (let from = 0; from < RUNS; from += 10) {
      if (my !== job) return;
      $("#baby-progress").textContent = `正在跑 ${RUNS} 次人生：${c.full}（${n + 1}/${todo.length}），${from}/${RUNS}…`;
      lives.push(...runSlice({ charts, name: c.info, key, runs: RUNS, from, to: from + 10 }));
      await tick();
    }
    c.stats = statsOf(lives);
    renderNames();
  }
  if (my !== job) return;
  $("#baby-advice").innerHTML = adviceBlock();
  if (form.slots.length) await compareSlots(my);
  if (my === job) $("#baby-progress").textContent = "";
}

async function compareSlots(my) {
  const { form, key } = state;
  const ranked = state.names.filter(c => c.stats).sort(byName);
  const name = ranked.length ? ranked[0] : null;
  state.slots = form.slots.map(s => ({ ...slotEntry(s, form.birth, form.family), stats: null }));
  renderSlots(name);
  for (const [n, e] of state.slots.entries()) {
    const lives = [];
    for (let from = 0; from < RUNS; from += 10) {
      if (my !== job) return;
      $("#baby-progress").textContent = `正在比較出生時段（${n + 1}/${state.slots.length}），${from}/${RUNS}…`;
      lives.push(...runSlice({ charts: e.charts, name: name ? name.info : null, key, runs: RUNS, from, to: from + 10 }));
      await tick();
    }
    e.stats = statsOf(lives);
    renderSlots(name);
  }
}

// Names rank by the traditional score, then by the simulated mood and fewer divorces.
const byName = (a, b) => (b.reading.score - a.reading.score) || ((b.stats ? b.stats.mood : 0) - (a.stats ? a.stats.mood : 0)) || ((a.stats ? a.stats.divorced : 0) - (b.stats ? b.stats.divorced : 0));

// ---------- blocks ----------
function chartBlock(charts) {
  const c = charts[0], a = c.prep.analysis, pillars = c.chart.pillars;
  const roles = `用神${a.useful[0] || "（不明顯）"}${a.useful.length > 1 ? `，喜${a.useful.slice(1).join("、")}` : ""}${a.avoid.length ? `；忌${a.avoid.join("、")}` : ""}`;
  return `<div class="baby-chart">
    <div class="pillars">${pillars.map(p => `<div><small>${esc(p.label)}</small><b>${esc(p.name)}</b></div>`).join("")}</div>
    <p>日主${esc(a.dayMaster.stem + a.dayMaster.element)}・${esc(a.strength)}・${esc(a.pattern)}；${esc(roles)}。名字的用字五行落在用神、喜神上，傳統上叫「補八字」。</p>
    ${charts.length > 1 ? `<p class="fine">性別還不知道：男寶寶和女寶寶的四柱一樣，只有大運的方向相反，模擬時一半用男寶寶、一半用女寶寶。</p>` : ""}
  </div>`;
}

function nameCard(c, i, best) {
  if (c.error) return `<article class="name-card"><h4>${esc(c.full)}</h4><p class="fine">${esc(c.error)}這個名字沒辦法分析。</p></article>`;
  const r = c.reading, g = Object.fromEntries(r.grids.map(x => [x.key, x]));
  const grid = k => `<div><dt>${k}</dt><dd>${esc(g[k].value)} ${esc(g[k].element)}・<span class="${g[k].level === "吉" ? "lv-good" : g[k].level === "凶" ? "lv-bad" : ""}">${esc(g[k].level)}</span></dd></div>`;
  const chars = (r.elements.chars || []).map(x => `${x.ch}（${x.formRole || x.numberRole || "閒神"}）`).join("");
  const sim = c.stats
    ? METRICS.map(([label, k]) => `<div><dt>${label}</dt><dd${best[k] === c.stats[k] && Object.keys(best).length ? ' class="best"' : ""}>${k === "mood" ? `${c.stats.mood}` : `${c.stats[k]} 次`}</dd></div>`).join("")
    : `<div class="wait">計算中…</div>`;
  return `<article class="name-card">
    <h4>${esc(c.full)}<span class="score">${esc(r.score)}<small>分</small></span></h4>
    <dl>${["人格", "地格", "外格", "總格"].map(grid).join("")}<div><dt>三才</dt><dd>${esc(r.sancai.elements)}・${esc(r.sancai.level)}</dd></div><div><dt>用字五行</dt><dd>${esc(chars || "—")}</dd></div></dl>
    <h5>${RUNS} 次人生</h5>
    <dl class="sim">${sim}</dl>
    <div class="actions"><button type="button" class="plain" data-report="${i}">看詳批</button><button type="button" data-start="${i}">用這個名字開始一生</button></div>
  </article>`;
}

function renderNames() {
  const done = state.names.filter(c => c.stats);
  const best = {};
  if (done.length > 1) for (const [, k, more] of METRICS) {
    const vals = done.map(c => c.stats[k]);
    const top = more ? Math.max(...vals) : Math.min(...vals);
    if (vals.some(v => v !== top)) best[k] = top;
  }
  $("#baby-names").innerHTML = state.names.map((c, i) => nameCard(c, i, best)).join("");
}

function adviceBlock() {
  const ok = state.names.filter(c => c.stats);
  if (!ok.length) return "";
  const ranked = ok.slice().sort(byName), top = ranked[0];
  const ties = ranked.filter(c => c.reading.score === top.reading.score);
  const spread = k => Math.max(...ok.map(c => c.stats[k])) - Math.min(...ok.map(c => c.stats[k]));
  const maxSpread = Math.max(...METRICS.filter(([, k]) => k !== "mood").map(([, k]) => spread(k)));
  const first = ties.length > 1 ? `「${ties.map(c => c.full).join("」「")}」同分最高（${top.reading.score} 分）` : `「${top.full}」的傳統姓名學評分最高（${top.reading.score} 分）`;
  const chars = (top.reading.elements.chars || []).filter(x => ["用神", "喜神"].includes(x.formRole || x.numberRole)).map(x => x.ch);
  const fit = chars.length ? `，用字裡的「${chars.join("」「")}」補到寶寶的喜用五行` : "";
  const sims = ok.length > 1
    ? `${RUNS} 次人生裡，幾個名字的差別最多 ${maxSpread} 次${maxSpread <= 5 ? "，幾乎一樣" : ""}。名字在這個模擬裡的影響本來就很小（每個領域最多 ±5%），選一個你們念起來喜歡、寓意好、寶寶將來寫起來順手的名字，比分數更重要。`
    : `名字在這個模擬裡的影響很小（每個領域最多 ±5%），比較兩個以上的名字時，可以看出它們的差別。`;
  return `<div class="advice"><h4>綜合建議</h4><p>${esc(first + fit)}。${esc(sims)}</p></div>`;
}

function renderSlots(name) {
  const { form } = state;
  const range = slotRange(form.due);
  const entries = state.slots.every(e => e.stats) ? rankSlots(state.slots) : state.slots;
  const ranked = state.slots.every(e => e.stats);
  const card = (e, i) => {
    const c = e.charts[0], a = c.prep.analysis, o = e.outlook;
    const g = gestation(e.slot.date, form.due);
    const when = `${e.slot.date.m} 月 ${e.slot.date.d} 日 ${pad(e.slot.time.h)}:${pad(e.slot.time.mi)}`;
    const luck = o.parts
      ? o.parts.map(p => `${SEX[p.sex]}：17–76 歲的大運有 ${p.good} 步喜用、${p.hard} 步忌運`).join("；")
      : `17–76 歲的大運有 ${o.good} 步喜用、${o.hard} 步忌運${o.best ? `，最旺是 ${o.best.startAge}–${o.best.endAge} 歲的${o.best.name}運` : ""}`;
    return `<article class="slot-card">
      <h4>${ranked ? `<span class="rank">第 ${i + 1} 名</span>` : ""}${esc(when)}<small>（${esc(g.label)}）</small></h4>
      <p class="pillars-line">${c.chart.pillars.map(p => esc(p.name)).join("　")}</p>
      <p>日主${esc(a.dayMaster.stem + a.dayMaster.element)}・${esc(a.strength)}・${esc(a.pattern)}，用神${esc(a.useful[0] || "不明顯")}。${esc(luck)}。</p>
      <p class="fine">${e.stats ? `${RUNS} 次人生的平均心情 ${e.stats.mood}；大學以上 ${e.stats.university} 次、結婚 ${e.stats.married} 次、有自己的房子 ${e.stats.home} 次。` : "計算中…"}</p>
    </article>`;
  };
  $("#baby-slots").innerHTML = `<h3>出生時段比較</h3>
    <p class="notice">剖腹或催生的時間，請以醫師的醫療判斷為準。研究顯示，懷孕滿 ${EARLIEST_WEEKS} 週以前的擇期剖腹會增加新生兒呼吸等方面的風險；婦產科醫學會也表示看時辰沒有醫學意義。這裡只比較 ${dateText(range.from)} 到 ${dateText(range.to)}（懷孕 ${EARLIEST_WEEKS} 到 42 週）的時段，排名依傳統命理的大運走勢${name ? `，名字用「${esc(name.full)}」` : ""}，不比較壽命和健康。</p>
    <div class="slot-cards">${entries.map(card).join("")}</div>`;
}

function parentsBlock(family) {
  const members = family ? family.members.filter(m => m.bond) : [];
  if (!members.length) return "";
  const tone = t => (t === "互補" ? "tone-good" : t === "需要磨合" ? "tone-bad" : "tone-even");
  // relate() speaks to the person whose chart it is (你) about the other (對方): here that is the baby and a parent.
  const said = (text, m) => text.replace(/你/g, "寶寶").replace(/對方/g, m.label);
  return `<h3>親子合盤</h3><ul class="bonds">${members.map(m => `<li><b>和${esc(m.label)}${m.name ? `（${esc(m.name)}）` : ""}<span class="tone ${tone(m.bond.tone)}">${esc(m.bond.tone)}</span></b><small>${esc(m.bond.notes.map(n => said(n.text, m)).join("；") || "沒有特別的合沖")}</small></li>`).join("")}</ul>
    <p class="fine">合盤只讓童年的家庭事件、學業和彼此相處的事件機率傾斜（最多 ±15%），說的是相處的傾向，不是誰好誰壞。</p>`;
}

// The professional report for one candidate name (the first chart's sex, or the one picked while the sex is unknown).
function showReport(i, sex) {
  if (!state) return;
  state.reportFor = i; state.reportSex = sex || state.charts[0].sex;
  const c = state.charts.find(x => x.sex === state.reportSex) || state.charts[0];
  const cand = i === null || i === undefined ? null : state.names[i];
  const name = cand && !cand.error ? cand.reading : null;
  const chart = c.chart, a = c.prep.analysis;
  const natal = natalReading(chart, a, { name: cand ? cand.full : null });
  const decades = chart.luck.decades.map((_, k) => decadeReading(chart, a, k));
  const years = Array.from({ length: 10 }, (_, age) => yearReading(chart, a, age)).filter(Boolean);
  const overall = overallReading(a, { decades, name });
  const toggle = state.charts.length > 1 ? `<p class="sex-toggle">${state.charts.map(x => `<button type="button" class="plain" data-report-sex="${x.sex}" aria-pressed="${x.sex === c.sex}">${SEX[x.sex]}</button>`).join("")}<small>性別還不知道：大運、六親和婚姻的看法依性別不同。</small></p>` : "";
  $("#baby-report").innerHTML = `<h3>寶寶的八字命理詳批${cand ? `：${esc(cand.full)}` : ""}</h3>${toggle}<div class="report">${reportHTML(chart, { natal, decades, years, events: [], name, overall, yearsTitle: "出生後十年的流年" })}</div>`;
}

function startLife(i) {
  if (!state) return;
  const cand = state.names[i];
  if (!cand) return;
  const { birth, family } = state.form;
  const sex = birth.sex === "unknown" ? (crypto.getRandomValues(new Uint8Array(1))[0] < 128 ? "male" : "female") : birth.sex;
  const input = { date: birth.date, time: birth.time, place: birth.place, sex };
  const born = `${dateText(birth.date)}${birth.time ? ` ${timeText(birth.time)}` : ""}，${cand.full}在${birth.place.name}出生，是個${sex === "female" ? "女孩" : "男孩"}。`;
  job++;   // stop any comparison still running
  hooks.begin(input, born, { name: cand.full, family });
}
