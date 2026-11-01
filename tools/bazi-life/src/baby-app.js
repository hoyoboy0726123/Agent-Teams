// 準爸媽模式：替寶寶比較候選名字（每個名字跑同樣的 100 次人生）、比較可能的出生時段（只比較滿 39 週以後），
// 以及寶寶和爸媽的合盤。計算在 sim/compare.js；這裡只負責表單和畫面。全部在瀏覽器裡算，不上傳。
//
// English (README「英文版（翻譯層）」): with English on, the results wait for the English catalog (english.js), then
// every sentence goes through tr() (core/tr.js, src/i18n/en/baby.json) and the readings are English too. Names stay in
// characters with their romanisation, 林怡君 (Lin Yi-chun). A language switch redraws the results in the other language
// without running the lives again. Without the catalog (a preview opened as a file) the results stay Chinese, marked
// data-no-i18n, with a note.
import { PLACE_GROUPS, findPlace } from "./core/places.js";
import { checkFamily } from "./core/family.js";
import { natalReading } from "./core/reading-natal.js";
import { yearReading, decadeReading } from "./core/reading-year.js";
import { overallReading } from "./core/reading-overall.js";
import { reportHTML } from "./report.js";
import { babyCharts, nameCandidates, runSlice, statsOf, gestation, slotRange, checkSlot, slotEntry, rankSlots, MAX_NAMES, MAX_SLOTS, RUNS, EARLIEST_WEEKS, LATEST_WEEKS } from "./sim/compare.js";
import { showNursery } from "./pixel-app.js";
import { draftStore, readIds, writeIds, later } from "./draft.js";
import { initTimeField, readTimeField, syncTimeField, timeFieldIds } from "./time-field.js";
import { initMemberHours, syncMemberHours, memberHourValue, setMemberHour, readMemberHour } from "./member-time.js";
import { timeText } from "./core/shichen.js";
import { tr, trw, trJoin, setReadingLang, readingLang } from "./core/tr.js";
import { trAs, shownName } from "./core/name.js";
import { chartTerm } from "./core/name-reading.js";
import { ensureEnglish, englishNow } from "./english.js";
import { lang, t } from "./i18n.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const tick = () => new Promise(done => setTimeout(done, 0));
const pad = n => String(n).padStart(2, "0");

// ---------- the page's language ----------
const en = () => readingLang() === "en";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BRANCH = { 子: "Zi", 丑: "Chou", 寅: "Yin", 卯: "Mao", 辰: "Chen", 巳: "Si", 午: "Wu", 未: "Wei", 申: "Shen", 酉: "You", 戌: "Xu", 亥: "Hai" };
const dateText = d => (en() ? `${d.d} ${MONTHS[d.m - 1]} ${d.y}` : `${d.y} 年 ${d.m} 月 ${d.d} 日`);
const dayText = d => (en() ? `${d.d} ${MONTHS[d.m - 1]}` : `${d.m} 月 ${d.d} 日`);
// 「亥時」 or 「09:30」; in English "Hai hour" or "09:30".
const hourText = time => (en() && time.branch ? `${BRANCH[time.branch] || time.branch} hour` : timeText(time));
const SEX = { male: "男寶寶", female: "女寶寶" };
const sexText = sex => tr(SEX[sex]);
// A name as it is shown: 林怡君, or 林怡君 (Lin Yi-chun) in English.
const shown = full => shownName(full).name;
// A list of elements or roles: 木、火, or "Wood and Fire".
const terms = list => (!en() ? list.join("、") : (l => (l.length < 2 ? l.join("") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`))(list.map(trw)));
// A town without English of its own (新竹縣竹北) is named by its county.
function placeText(name) {
  if (!en()) return name;
  const w = trw(name);
  if (!/[㐀-鿿]/.test(w)) return w;
  const county = (name.match(/^..[縣市]/) || [])[0];
  return county ? trw(county) : w;
}
// 39 週 2 天, or "39 weeks 2 days".
const weeksText = g => (en() ? tr("{weeks} 週 {days} 天", { weeks: g.weeks, days: g.rest }) : g.label);
// The readings in the page's language: English once its catalog is here.
async function readyLang() {
  if (lang() === "en" && !englishNow()) { const p = ensureEnglish(); if (p) await p; }
  setReadingLang(englishNow());
}
// The result containers are English (data-no-i18n lifted, no note) or Chinese (left alone by i18n.js, with a note
// when English is on but its catalog is not here).
const RESULTS = ["#baby-lede", "#baby-chart", "#baby-names", "#baby-advice", "#baby-parents", "#baby-slots", "#baby-report"];
function markLang() {
  for (const id of RESULTS) { const el = $(id); if (el) el.toggleAttribute("data-no-i18n", !en()); }
  const note = $("#baby-en-note");
  if (note) note.hidden = !(lang() === "en" && !en());
}

// The simulated outcomes the cards compare: label, key, and whether more is better.
const METRICS = [["平均心情", "mood", true], ["大學以上", "university", true], ["結婚", "married", true], ["離婚", "divorced", false], ["有自己的房子", "home", true], ["升遷過", "promoted", true]];
// Their English labels ("結婚" alone is the story's "Get married", a choice, elsewhere).
const METRIC_EN = { mood: "Average mood", university: "University or higher", married: "Married", divorced: "Divorced", home: "Owned a home", promoted: "Promoted" };

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
  document.addEventListener("langchange", () => { if (state) redraw(); });
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
  if (!confirm(t("要清空這張表單嗎？填過的資料會刪掉。"))) return;
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

// Why a birth slot is not compared, or null (compare.js checkSlot; its sentences are written out here for English).
function slotProblem(slot, due) {
  const zh = checkSlot(slot, due);
  if (!zh || !en()) return zh;
  if (!slot || !slot.date || !slot.time) return tr("請填完整的日期和時間。");
  const g = gestation(slot.date, due), weeks = weeksText(g);
  return g.days < EARLIEST_WEEKS * 7
    ? tr("這個時段只有 {weeks}，還不到 {min} 週。{min} 週以前的擇期剖腹會增加新生兒的風險，所以這裡不提供比較。", { weeks, min: EARLIEST_WEEKS })
    : tr("這個時段已經 {weeks}，超過 {max} 週，請和醫師討論，這裡不提供比較。", { weeks, max: LATEST_WEEKS });
}

// The form, checked; an error message string when something is missing.
function readForm() {
  const surname = clean($("#b-surname").value);
  if (!surname || !/^\p{Script=Han}{1,2}$/u.test(surname)) return tr("請填寶寶的姓氏（一到兩個中文字）。");
  const givens = [...document.querySelectorAll(".b-given")].map(i => clean(i.value)).filter(Boolean);
  if (!givens.length) return tr("請至少填一個候選名字（不含姓）。");
  if (givens.some(g => !/^\p{Script=Han}{1,3}$/u.test(g))) return tr("候選名字請填一到三個中文字，不含姓。");
  const unique = [...new Set(givens)].slice(0, MAX_NAMES);
  const date = parseDate($("#b-date").value);
  if (!date || date.y < 1900 || date.y > 2100) return tr("請填出生日期（或預產期），年份在 1900 到 2100 年之間。");
  const hour = readTimeField("b");
  if (hour.error) {
    if (!en()) return hour.error.replace("「時辰不詳」", "「還不知道時辰」");
    return /時辰，或勾選/.test(hour.error) ? tr("請選出生的時辰，或勾選「還不知道時辰」。") : tr("請輸入出生時間，或改選時辰、勾選「還不知道時辰」。");
  }
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
    if (!due) { $("#b-slots").open = true; return tr("比較出生時段要先填預產期。"); }
    const bad = slots.map(s => slotProblem(s, due)).filter(Boolean);
    if (bad.length) { $("#b-slots").open = true; return bad[0]; }
  }
  return { surname, givens: unique, birth, family: parents, due, slots };
}

// ---------- the comparison ----------
async function compare() {
  await readyLang();
  const form = readForm();
  if (typeof form === "string") return hooks.showError(form);
  hooks.showError("");
  const my = ++job;
  let charts;
  try { charts = babyCharts(form.birth, form.family); }
  catch (e) { console.error(e); return hooks.showError(tr("這個日期或地點沒辦法排盤，請再檢查一次。")); }
  const analysis = charts[0].prep.analysis;
  const key = `baby|${form.surname}|${form.birth.date.y}-${form.birth.date.m}-${form.birth.date.d}|${form.birth.time ? `${form.birth.time.h}:${form.birth.time.mi}` : "-"}|${form.birth.place.name}`;
  const names = nameCandidates(form.surname, form.givens, analysis).map(c => ({ ...c, stats: null }));
  state = { form, charts, analysis, key, names, slots: [], slotName: null, advice: false, reportFor: null, reportSex: charts[0].sex };
  $("#baby").hidden = false;
  showNursery($("#baby-scene"), form.birth.sex);
  drawHead();
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
      $("#baby-progress").textContent = trAs("正在跑 {runs} 次人生：{name}（{n}/{total}），{from}/{runs}…", { runs: RUNS, n: n + 1, total: todo.length, from }, { name: shown(c.full) });
      lives.push(...runSlice({ charts, name: c.info, key, runs: RUNS, from, to: from + 10 }));
      await tick();
    }
    c.stats = statsOf(lives);
    renderNames();
  }
  if (my !== job) return;
  state.advice = true;
  $("#baby-advice").innerHTML = adviceBlock();
  if (form.slots.length) await compareSlots(my);
  if (my === job) $("#baby-progress").textContent = "";
}

async function compareSlots(my) {
  const { form, key } = state;
  const ranked = state.names.filter(c => c.stats).sort(byName);
  const name = ranked.length ? ranked[0] : null;
  state.slotName = name;
  state.slots = form.slots.map(s => ({ ...slotEntry(s, form.birth, form.family), stats: null }));
  renderSlots();
  for (const [n, e] of state.slots.entries()) {
    const lives = [];
    for (let from = 0; from < RUNS; from += 10) {
      if (my !== job) return;
      $("#baby-progress").textContent = tr("正在比較出生時段（{n}/{total}），{from}/{runs}…", { n: n + 1, total: state.slots.length, from, runs: RUNS });
      lives.push(...runSlice({ charts: e.charts, name: name ? name.info : null, key, runs: RUNS, from, to: from + 10 }));
      await tick();
    }
    e.stats = statsOf(lives);
    renderSlots();
  }
}

// The language changed: the charts, the names' readings and the slots are written again in it, keeping the lives
// already run (they do not depend on the language).
async function redraw() {
  await readyLang();
  if (!state) return;
  const { form } = state;
  state.charts = babyCharts(form.birth, form.family);
  state.analysis = state.charts[0].prep.analysis;
  const fresh = nameCandidates(form.surname, state.names.map(c => c.given), state.analysis);
  state.names.forEach((c, i) => { c.info = fresh[i].info; c.reading = fresh[i].reading; c.error = fresh[i].error; });
  state.slots.forEach(e => { const again = slotEntry(e.slot, form.birth, form.family); e.charts = again.charts; e.outlook = again.outlook; });
  drawHead();
  renderNames();
  $("#baby-advice").innerHTML = state.advice ? adviceBlock() : "";
  if (state.slots.length) renderSlots(); else $("#baby-slots").innerHTML = "";
  showReport(state.reportFor, state.reportSex);
  const p = $("#baby-progress");
  if (p.textContent) p.textContent = "";
}

// Names rank by the traditional score, then by the simulated mood and fewer divorces.
const byName = (a, b) => (b.reading.score - a.reading.score) || ((b.stats ? b.stats.mood : 0) - (a.stats ? a.stats.mood : 0)) || ((a.stats ? a.stats.divorced : 0) - (b.stats ? b.stats.divorced : 0));

// ---------- blocks ----------
// The lede, the chart and the parents, which change only with the language.
function drawHead() {
  setReadingLang(englishNow());
  markLang();
  const { form, charts } = state, b = form.birth;
  const time = b.time ? (en() ? `, ${hourText(b.time)}` : ` ${hourText(b.time)}`) : tr("（時辰還不知道）");
  $("#baby-lede").textContent = tr("{date}{time}在{place}出生的{baby}。每個名字都用同一張命盤、同樣的 {runs} 次人生來比，差別只來自名字。", { date: dateText(b.date), time, place: placeText(b.place.name), baby: SEX[b.sex] ? sexText(b.sex) : tr("寶寶（性別還不知道）"), runs: RUNS });
  $("#baby-chart").innerHTML = chartBlock(charts);
  $("#baby-parents").innerHTML = parentsBlock(charts[0].prep.family);
}

// The Day Master, its strength and the structure: 丁火・身強・正官格.
const dayMasterParts = a => ({ dayMaster: a.dayMaster.stem + a.dayMaster.element, strength: chartTerm(a.strength), pattern: chartTerm(a.special ? a.special.name : a.pattern) });

function chartBlock(charts) {
  const c = charts[0], a = c.prep.analysis, pillars = c.chart.pillars;
  const roles = (a.useful[0] ? tr("用神{element}", { element: a.useful[0] }) : tr("用神（不明顯）"))
    + (a.useful.length > 1 ? tr("，喜{elements}", { elements: terms(a.useful.slice(1)) }) : "")
    + (a.avoid.length ? tr("；忌{elements}", { elements: terms(a.avoid) }) : "");
  const pillar = p => `<div><small>${esc(trw(p.label))}</small><b>${esc(p.name)}</b>${en() ? `<small>${esc(trw(p.name))}</small>` : ""}</div>`;
  return `<div class="baby-chart">
    <div class="pillars">${pillars.map(pillar).join("")}</div>
    <p>${esc(tr("日主{dayMaster}・{strength}・{pattern}；{roles}。名字的用字五行落在用神、喜神上，傳統上叫「補八字」。", { ...dayMasterParts(a), roles }))}</p>
    ${charts.length > 1 ? `<p class="fine">${esc(tr("性別還不知道：男寶寶和女寶寶的四柱一樣，只有大運的方向相反，模擬時一半用男寶寶、一半用女寶寶。"))}</p>` : ""}
  </div>`;
}

function nameCard(c, i, best) {
  const who = shownName(c.full);
  if (c.error) return `<article class="name-card"><h4>${esc(who.name)}</h4><p class="fine">${esc(en() ? `${c.error} ${tr("這個名字沒辦法分析。")}` : `${c.error}這個名字沒辦法分析。`)}</p></article>`;
  const r = c.reading, g = Object.fromEntries(r.grids.map(x => [x.key, x]));
  const grid = k => `<div><dt>${esc(trw(k))}</dt><dd>${esc(g[k].value)} ${esc(trw(g[k].element))}・<span class="${g[k].level === "吉" ? "lv-good" : g[k].level === "凶" ? "lv-bad" : ""}">${esc(trw(g[k].level))}</span></dd></div>`;
  const role = x => x.formRole || x.numberRole || "閒神";
  const chars = (r.elements.chars || []).map(x => (en() ? `${who.char(x.ch)}: ${trw(role(x))}` : `${x.ch}（${role(x)}）`)).join(en() ? "; " : "");
  const sim = c.stats
    ? METRICS.map(([label, k]) => `<div><dt>${esc(en() ? METRIC_EN[k] : label)}</dt><dd${best[k] === c.stats[k] && Object.keys(best).length ? ' class="best"' : ""}>${k === "mood" ? `${c.stats.mood}` : esc(tr("{count} 次", { count: c.stats[k] }))}</dd></div>`).join("")
    : `<div class="wait">${esc(tr("計算中…"))}</div>`;
  return `<article class="name-card">
    <h4>${esc(who.name)}<span class="score">${esc(r.score)}<small>${en() ? "/100" : "分"}</small></span></h4>
    <dl>${["人格", "地格", "外格", "總格"].map(grid).join("")}<div><dt>${esc(trw("三才"))}</dt><dd>${esc(trw(r.sancai.elements))}・${esc(trw(r.sancai.level))}</dd></div><div><dt>${esc(tr("用字五行"))}</dt><dd>${esc(chars || "—")}</dd></div></dl>
    <h5>${esc(tr("{runs} 次人生", { runs: RUNS }))}</h5>
    <dl class="sim">${sim}</dl>
    <div class="actions"><button type="button" class="plain" data-report="${i}">${esc(tr("看詳批"))}</button><button type="button" data-start="${i}">${esc(tr("用這個名字開始一生"))}</button></div>
  </article>`;
}

function renderNames() {
  setReadingLang(englishNow());
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
  setReadingLang(englishNow());
  const ok = state.names.filter(c => c.stats);
  if (!ok.length) return "";
  const ranked = ok.slice().sort(byName), top = ranked[0];
  const ties = ranked.filter(c => c.reading.score === top.reading.score);
  const spread = k => Math.max(...ok.map(c => c.stats[k])) - Math.min(...ok.map(c => c.stats[k]));
  const maxSpread = Math.max(...METRICS.filter(([, k]) => k !== "mood").map(([, k]) => spread(k)));
  // 「甲」「乙」 inside the quotes of the Chinese; "甲 and 乙" in English.
  const list = l => (!en() ? l.join("」「") : l.length < 2 ? l.join("") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`);
  const first = ties.length > 1
    ? trAs("「{names}」同分最高（{score} 分）", { score: top.reading.score }, { names: list(ties.map(c => (en() ? shown(c.full) : c.full))) })
    : trAs("「{name}」的傳統姓名學評分最高（{score} 分）", { score: top.reading.score }, { name: en() ? shown(top.full) : top.full });
  const who = shownName(top.full);
  const chars = (top.reading.elements.chars || []).filter(x => ["用神", "喜神"].includes(x.formRole || x.numberRole)).map(x => x.ch);
  const fit = chars.length ? trAs("，用字裡的「{chars}」補到寶寶的喜用五行", {}, { chars: list(en() ? chars.map(who.char) : chars) }) : "";
  const sims = ok.length > 1
    ? tr("{runs} 次人生裡，幾個名字的差別最多 {spread} 次{almost}。名字在這個模擬裡的影響本來就很小（每個領域最多 ±5%），選一個你們念起來喜歡、寓意好、寶寶將來寫起來順手的名字，比分數更重要。", { runs: RUNS, spread: maxSpread, almost: maxSpread <= 5 ? tr("，幾乎一樣") : "" })
    : tr("名字在這個模擬裡的影響很小（每個領域最多 ±5%），比較兩個以上的名字時，可以看出它們的差別。");
  return `<div class="advice"><h4>${esc(tr("綜合建議"))}</h4><p>${esc(en() ? `${first}${fit}. ${sims}` : `${first + fit}。${sims}`)}</p></div>`;
}

function renderSlots() {
  setReadingLang(englishNow());
  const { form } = state, name = state.slotName;
  const range = slotRange(form.due);
  const entries = state.slots.every(e => e.stats) ? rankSlots(state.slots) : state.slots;
  const ranked = state.slots.every(e => e.stats);
  const card = (e, i) => {
    const c = e.charts[0], a = c.prep.analysis, o = e.outlook;
    const g = gestation(e.slot.date, form.due);
    const when = `${dayText(e.slot.date)} ${pad(e.slot.time.h)}:${pad(e.slot.time.mi)}`;
    const luck = o.parts
      ? trJoin(o.parts.map(p => tr("{baby}：17–76 歲的大運有 {good} 步喜用、{hard} 步忌運", { baby: sexText(p.sex), good: p.good, hard: p.hard })), en() ? "; " : "；")
      : tr("17–76 歲的大運有 {good} 步喜用、{hard} 步忌運{best}", { good: o.good, hard: o.hard, best: o.best ? tr("，最旺是 {from}–{to} 歲的{pillar}運", { from: o.best.startAge, to: o.best.endAge, pillar: o.best.name }) : "" });
    const day = a.useful[0]
      ? tr("日主{dayMaster}・{strength}・{pattern}，用神{useful}。{luck}。", { ...dayMasterParts(a), useful: a.useful[0], luck })
      : tr("日主{dayMaster}・{strength}・{pattern}，用神不明顯。{luck}。", { ...dayMasterParts(a), luck });
    const pillars = c.chart.pillars.map(p => (en() ? `${p.name} (${trw(p.name)})` : p.name)).join(en() ? "  " : "　");
    return `<article class="slot-card">
      <h4>${ranked ? `<span class="rank">${esc(tr("第 {rank} 名", { rank: i + 1 }))}</span>` : ""}${esc(when)}<small>${esc(en() ? ` (${weeksText(g)})` : `（${g.label}）`)}</small></h4>
      <p class="pillars-line">${esc(pillars)}</p>
      <p>${esc(day)}</p>
      <p class="fine">${esc(e.stats ? tr("{runs} 次人生的平均心情 {mood}；大學以上 {university} 次、結婚 {married} 次、有自己的房子 {home} 次。", { runs: RUNS, mood: e.stats.mood, university: e.stats.university, married: e.stats.married, home: e.stats.home }) : tr("計算中…"))}</p>
    </article>`;
  };
  const named = name ? trAs("，名字用「{name}」", {}, { name: en() ? shown(name.full) : name.full }) : "";
  const notice = tr("剖腹或催生的時間，請以醫師的醫療判斷為準。研究顯示，懷孕滿 {weeks} 週以前的擇期剖腹會增加新生兒呼吸等方面的風險；婦產科醫學會也表示看時辰沒有醫學意義。這裡只比較 {from} 到 {to}（懷孕 {weeks} 到 42 週）的時段，排名依傳統命理的大運走勢{named}，不比較壽命和健康。", { weeks: EARLIEST_WEEKS, from: dateText(range.from), to: dateText(range.to), named });
  $("#baby-slots").innerHTML = `<h3>${esc(tr("出生時段比較"))}</h3>
    <p class="notice">${esc(notice)}</p>
    <div class="slot-cards">${entries.map(card).join("")}</div>`;
}

function parentsBlock(family) {
  const members = family ? family.members.filter(m => m.bond) : [];
  if (!members.length) return "";
  const tone = t => (t === "互補" ? "tone-good" : t === "需要磨合" ? "tone-bad" : "tone-even");
  // relate() speaks to the person whose chart it is (你) about the other (對方): here that is the baby and a parent.
  const said = (text, m) => text.replace(/你/g, "寶寶").replace(/對方/g, m.label);
  const who = m => (en() ? `${trw(m.label)}${m.name ? ` (${shown(m.name)})` : ""}` : `${m.label}${m.name ? `（${m.name}）` : ""}`);
  const notes = m => (en() ? m.bond.notes.map(n => n.text).join("; ") : m.bond.notes.map(n => said(n.text, m)).join("；"));
  return `<h3>${esc(tr("親子合盤"))}</h3><ul class="bonds">${members.map(m => `<li><b>${esc(tr("和{parent}", { parent: who(m) }))}<span class="tone ${tone(m.bond.tone)}">${esc(trw(m.bond.tone))}</span></b><small>${esc(notes(m) || tr("沒有特別的合沖"))}</small></li>`).join("")}</ul>
    <p class="fine">${esc(tr("合盤只讓童年的家庭事件、學業和彼此相處的事件機率傾斜（最多 ±15%），說的是相處的傾向，不是誰好誰壞。"))}</p>`;
}

// The professional report for one candidate name (the first chart's sex, or the one picked while the sex is unknown).
function showReport(i, sex) {
  if (!state) return;
  setReadingLang(englishNow());
  state.reportFor = i; state.reportSex = sex || state.charts[0].sex;
  const c = state.charts.find(x => x.sex === state.reportSex) || state.charts[0];
  const cand = i === null || i === undefined ? null : state.names[i];
  const name = cand && !cand.error ? cand.reading : null;
  const chart = c.chart, a = c.prep.analysis;
  const natal = natalReading(chart, a, { name: cand ? cand.full : null });
  const decades = chart.luck.decades.map((_, k) => decadeReading(chart, a, k));
  const years = Array.from({ length: 10 }, (_, age) => yearReading(chart, a, age)).filter(Boolean);
  const overall = overallReading(a, { decades, name });
  const toggle = state.charts.length > 1 ? `<p class="sex-toggle">${state.charts.map(x => `<button type="button" class="plain" data-report-sex="${x.sex}" aria-pressed="${x.sex === c.sex}">${esc(sexText(x.sex))}</button>`).join("")}<small>${esc(tr("性別還不知道：大運、六親和婚姻的看法依性別不同。"))}</small></p>` : "";
  const title = cand ? trAs("寶寶的八字命理詳批：{name}", {}, { name: en() ? shown(cand.full) : cand.full }) : tr("寶寶的八字命理詳批");
  $("#baby-report").innerHTML = `<h3>${esc(title)}</h3>${toggle}<div class="report">${reportHTML(chart, { natal, decades, years, events: [], name, overall, yearsTitle: tr("出生後十年的流年") })}</div>`;
}

function startLife(i) {
  if (!state) return;
  const cand = state.names[i];
  if (!cand) return;
  const { birth, family } = state.form;
  const sex = birth.sex === "unknown" ? (crypto.getRandomValues(new Uint8Array(1))[0] < 128 ? "male" : "female") : birth.sex;
  const input = { date: birth.date, time: birth.time, place: birth.place, sex };
  // The Chinese opening line; an English life writes its own (life-app.js).
  const born = `${birth.date.y} 年 ${birth.date.m} 月 ${birth.date.d} 日${birth.time ? ` ${timeText(birth.time)}` : ""}，${cand.full}在${birth.place.name}出生，是個${sex === "female" ? "女孩" : "男孩"}。`;
  job++;   // stop any comparison still running
  hooks.begin(input, born, { name: cand.full, family });
}
