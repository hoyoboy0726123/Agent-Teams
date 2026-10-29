// 合婚分頁：兩個人的生日，排盤引擎馬上算出完整合婚（core/hehun.js），全部在瀏覽器裡算、不上傳。按「AI 深度合婚」
// 才把兩個人的出生資料送到網站的 Worker（/api/reading 的合婚三段，ai-reading.js），暱稱不送。
// English (README「中／英切換」): the result is the reading in the page's language (core/tr.js, the shared catalog from
// english.js) and its own words through t(); it is written again when the language changes. When English is on but
// the catalog cannot be fetched (a file preview), the result stays Chinese and the tab's note says so.
import { PLACE_GROUPS, findPlace } from "./core/places.js";
import { computeChart } from "./core/chart.js";
import { hehunReading } from "./core/hehun.js";
import { checkFamily } from "./core/family.js";
import { readingRequest, readingError, PARTS, toneWord } from "./ai-reading.js";
import { aiOutToday, markAiOut } from "./ai-quota.js";
import { aiSoon } from "./ai-mode.js";
import { trackOnce } from "./stats.js";
import { SHICHEN } from "./core/shichen.js";
import { draftStore, readIds, writeIds, later } from "./draft.js";
import { initTimeField, readTimeField, syncTimeField, timeFieldIds } from "./time-field.js";
import { t, lang } from "./i18n.js";
import { ensureEnglish, englishNow } from "./english.js";
import { setReadingLang, trw } from "./core/tr.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad2 = n => String(n).padStart(2, "0");
const clean = v => String(v || "").replace(/\s+/g, "");
const READING_URL = (document.querySelector('meta[name="reading-endpoint"]') || {}).content || "";
const onSite = () => !!READING_URL && /^https?:$/.test(location.protocol);

let hooks = null;   // { begin, showError, selectTab } from life-app.js
let shown = null;   // { a, b, r } on screen
let ai = null;      // the AI job for what is on screen

export function initMatch(h) {
  hooks = h;
  const options = PLACE_GROUPS.map(g => `<optgroup label="${esc(g.group)}">${g.places.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("")}</optgroup>`).join("");
  for (const p of ["ma", "mb"]) {
    $(`#${p}-place`).innerHTML = options;
    $(`#${p}-place`).value = "臺北市";
    initTimeField(p);
  }
  restore();
  for (const type of ["input", "change"]) $("#form-match").addEventListener(type, saveSoon);
  addEventListener("pagehide", () => saveSoon.flush());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveSoon.flush(); });
  $("#form-match").addEventListener("submit", e => { e.preventDefault(); compute(); });
  $("#match-fill").addEventListener("click", () => fillFromLife(true));
  $("#match-clear").addEventListener("click", clearForm);
  $("#hh-life").addEventListener("click", startLife);
  $("#hh-edit").addEventListener("click", () => $("#setup").scrollIntoView({ behavior: "smooth", block: "start" }));
  $("#hh-ai-btn").addEventListener("click", askAI);
  // AI 深度合婚 is not open yet (ai-mode.js): its button says 敬請期待, and the press is counted (stats.js).
  $("#hh-soon-btn").addEventListener("click", () => { $("#hh-soon-msg").hidden = false; trackOnce("ai_match"); });
  $("#hh-ai-body").addEventListener("click", e => { const b = e.target.closest("[data-ai-retry]"); if (b && ai) askParts(ai, [b.dataset.aiRetry]); });
  if (!$("#form-match").hidden) onMatchTab("match");
  document.addEventListener("langchange", () => { if (shown) redraw(); });
}

// The tab was opened: fill in what 我的人生 already knows, and show the result only under this tab.
export function onMatchTab(tab) {
  if (!hooks) return;
  if (tab === "match") fillFromLife(false);
  $("#match").hidden = tab !== "match" || !shown;
  // A 合婚 shown before today's AI quota ran out: AI 深度合婚 goes away unless some of it was written.
  if (tab === "match" && shown && !aiSoon() && onSite() && aiOutToday()) {
    if (!(ai && PARTS.match.some(x => ai.parts[x]))) $("#hh-ai").hidden = true;
    aiOutControls();
  }
}

// ---------- 表單 ----------
const DRAFT = draftStore("bazi-life.match");
const FIELDS = ["ma", "mb"].flatMap(p => [`${p}-name`, `${p}-date`, ...timeFieldIds(p), `${p}-sex-m`, `${p}-sex-f`, `${p}-place`]);
const save = () => DRAFT.save({ v: 1, fields: readIds(FIELDS) });
const saveSoon = later(save);
function restore() {
  const d = DRAFT.load();
  if (d && d.v === 1) writeIds(d.fields);
  for (const p of ["ma", "mb"]) syncTimeField(p);
}
function clearForm() {
  if (!confirm(t("要清空合婚的資料嗎？填過的生日會刪掉。"))) return;
  $("#form-match").reset();
  for (const p of ["ma", "mb"]) { $(`#${p}-place`).value = "臺北市"; syncTimeField(p); }
  DRAFT.clear();
  shown = null; ai = null;
  $("#match").hidden = true;
  hooks.showError("");
}

// One person into the form: { date, time, place?, sex, name? }.
function setPerson(p, x) {
  $(`#${p}-date`).value = `${x.date.y}-${pad2(x.date.m)}-${pad2(x.date.d)}`;
  $(`#${p}-name`).value = x.name || "";
  const t = x.time, sc = t && t.branch ? SHICHEN.find(s => s.branch === t.branch && s.h === t.h && s.mi === t.mi) : null;
  $(`#${p}-nohour`).checked = !t;
  if (sc) { $(`#${p}-tmode-shichen`).checked = true; $(`#${p}-shichen`).value = sc.key; }
  else if (t) { $(`#${p}-tmode-clock`).checked = true; $(`#${p}-time`).value = `${pad2(t.h)}:${pad2(t.mi)}`; }
  if (x.place) $(`#${p}-place`).value = x.place.name;
  $(`#${p}-sex-f`).checked = x.sex === "female";
  $(`#${p}-sex-m`).checked = x.sex !== "female";
  if ($(`#${p}-latezi`)) $(`#${p}-latezi`).checked = x.zi === "late";
  syncTimeField(p);
}

// 你 from the 我的人生 form, 對方 from its partner (when a birthday was entered). `force` (the button) overwrites what
// is here; opening the tab fills in only what was typed in 我的人生, never the form's example birthday.
const LIFE_DRAFT = draftStore("bazi-life.form");
function fillFromLife(force) {
  if (!force && !LIFE_DRAFT.load()) return;
  if (force || !$("#ma-date").value) {
    $("#ma-name").value = $("#f-name").value;
    $("#ma-date").value = $("#f-date").value;
    for (const part of ["tmode-clock", "tmode-shichen", "nohour", "latezi"]) $(`#ma-${part}`).checked = $(`#f-${part}`).checked;
    $("#ma-time").value = $("#f-time").value;
    $("#ma-shichen").value = $("#f-shichen").value;
    $("#ma-place").value = $("#f-place").value;
    $("#ma-sex-f").checked = $("#sex-f").checked;
    $("#ma-sex-m").checked = !$("#sex-f").checked;
    syncTimeField("ma");
  }
  const row = document.querySelector(".member[data-role=partner]");
  if (row && row.querySelector(".m-date").value && (force || !$("#mb-date").value)) {
    $("#mb-name").value = row.querySelector(".m-name").value;
    $("#mb-date").value = row.querySelector(".m-date").value;
    const hour = row.querySelector(".m-hour").value;
    $("#mb-nohour").checked = !hour;
    if (hour === "clock") { $("#mb-tmode-clock").checked = true; $("#mb-time").value = row.querySelector(".m-time").value; }
    else if (hour) { $("#mb-tmode-shichen").checked = true; $("#mb-shichen").value = hour; }
    const sex = row.querySelector(".m-sex").value;
    $("#mb-sex-f").checked = sex === "female";
    $("#mb-sex-m").checked = sex !== "female";
    $("#mb-place").value = $("#f-place").value;
    $("#mb-latezi").checked = false;   // the family form has no 夜子時, so an old tick must not stay on a new person
    syncTimeField("mb");
  }
  save();
}

// From the end of a life: you and the partner of the AI 合婚 card (or of the family form), then the 合婚 at once.
export function openMatch({ me, partner }) {
  setPerson("ma", me);
  if (partner) setPerson("mb", { place: me.place, ...partner });
  save();
  hooks.selectTab("match");
  if (partner) compute();
  else { $("#mb-date").focus(); }
}

function readPerson(p, label) {
  const [y, m, d] = ($(`#${p}-date`).value || "").split("-").map(Number);
  if (!y) return { error: t(`請填${label}的出生日期。`) };
  if (y < 1900 || y > 2100) return { error: t(`${label}的出生年份請在 1900 到 2100 年之間。`) };
  const hour = readTimeField(p);
  if (hour.error) return { error: t(`${label}的出生時間：{error}`, { error: t(hour.error) }) };
  return { date: { y, m, d }, time: hour.time, place: findPlace($(`#${p}-place`).value), sex: $(`#${p}-sex-f`).checked ? "female" : "male", name: clean($(`#${p}-name`).value), ...(hour.zi === "late" ? { zi: "late" } : {}) };
}

// ---------- 合婚 ----------
// The reading in the page's language: English once its catalog is here (english.js), else Chinese. The readings'
// language is left as the page's (life-app.js sets its own at the end of a life).
function readingOf(a, b) {
  const L = englishNow();
  setReadingLang(L);
  const chartOf = x => computeChart({ date: x.date, time: x.time, place: x.place, sex: x.sex, options: { solar: "true", zi: x.zi === "late" ? "late" : "early" } }, { lean: true });
  return { r: hehunReading({ a: { chart: chartOf(a), sex: a.sex, name: a.name }, b: { chart: chartOf(b), sex: b.sex, name: b.name }, now: new Date().getFullYear() }), en: !!L };
}
// The result on screen again, in the language now chosen (the langchange event), waiting for the English first.
async function redraw() {
  if (lang() === "en" && !englishNow()) { const p = ensureEnglish(); if (p) await p; }
  if (!shown) return;
  const { r, en } = readingOf(shown.a, shown.b);
  shown.r = r;
  $("#hh-body").innerHTML = resultHTML(r, en);
  noteFor(en);
}
// The tab's note (「合婚的解說目前是中文…」) shows only while English is on and the result could not be English.
const noteFor = en => { $("#hh-en-note").hidden = !(lang() === "en" && !en); };
async function compute() {
  const a = readPerson("ma", "你"), b = readPerson("mb", "對方");
  if (a.error || b.error) return hooks.showError(a.error || b.error);
  hooks.showError("");
  if (lang() === "en" && !englishNow()) { const p = ensureEnglish(); if (p) await p; }
  let r, en;
  try {
    ({ r, en } = readingOf(a, b));
  } catch (e) {
    console.error(e);
    return hooks.showError(t("這個日期或地點沒辦法排盤，請再檢查一次。"));
  }
  shown = { a, b, r };
  ai = null;
  $("#hh-body").innerHTML = resultHTML(r, en);
  noteFor(en);
  $("#hh-life-name").value = b.name || "";
  $("#hh-life-same").hidden = a.sex !== b.sex;
  lifeError("");
  drawAI();
  $("#match").hidden = false;
  $("#match").scrollIntoView({ behavior: "smooth", block: "start" });
}

const STATE = { good: "順勢", mid: "平穩", care: "要多體諒" };
const p = text => `<p>${esc(text)}</p>`;
// The engine's values that stay Chinese in the reading (pillars, the zodiac animal, the day stem), in the page's
// language: 甲子 → Jia Zi; a name starts with a capital in English (you → You).
// The result's words follow the reading: English with an English reading, else all Chinese (t() only when English).
let english = false;
const en = () => english;
const T = (zh, vars) => (english ? t(zh, vars) : vars ? zh.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? String(vars[k]) : all)) : zh);
const pillarText = name => (en() ? [...name].map(trw).join(" ") : name);
const nameText = n => (en() ? String(n).replace(/^[a-z]/, c => c.toUpperCase()) : n);
function resultHTML(r, inEnglish) {
  english = inEnglish;
  const [A, B] = r.people;
  const who = X => `<div class="hh-who"><b>${esc(nameText(X.n))}</b><span class="num">${esc(X.pillars.map(pillarText).join(en() ? " · " : " "))}</span><span>${esc(T("屬{zodiac}・{stem}日主", { zodiac: trw(X.zodiac), stem: en() ? `${trw(X.stem)} ${trw(X.element)}` : X.stem + X.element }))}</span></div>`;
  const hero = `<div class="hh-hero">
    <div class="hh-pair">${who(A)}<span class="hh-heart" aria-hidden="true">♥</span>${who(B)}</div>
    <div class="hh-type"><span class="hh-kicker">${esc(T("你們的關係類型"))}</span><span class="hh-label">${esc(r.type.label)}</span><p>${esc(r.type.line)}</p></div>
    <div class="hh-score"><span class="hh-num">${r.score.total}</span><span class="hh-of">${esc(T("／100 契合度"))}</span></div>
    <p class="hh-chips">${r.chips.map(c => `<span class="c-${c.kind}">${esc(c.text)}</span>`).join("")}</p>
    <p class="hh-summary">${esc(r.summary)}</p>
    <p class="fine">${esc(T("分數高不代表一定幸福，分數低代表要多花一點心思溝通。命理說的是傾向，不是注定。"))}</p>
  </div>`;
  const bars = `<section class="hh-sec"><h3>${esc(T("契合度怎麼算"))}</h3><div class="hh-bars">${r.score.parts.map(x => `<div class="hh-bar"><span class="l">${esc(x.label)}</span><span class="track"><span class="fill" style="width:${Math.round((100 * x.got) / x.max)}%"></span></span><span class="n">${x.got}/${x.max}</span><span class="why">${esc(x.why)}</span></div>`).join("")}</div><p class="fine">${esc(T("夫妻宮、日柱和用神最重；生肖、納音、命卦這些民俗方法比重小，只當參考。"))}</p></section>`;
  const dims = `<section class="hh-sec"><h3>${esc(T("六大面向"))}</h3>${radar(r.dims)}<div class="hh-dims">${r.dims.map(d => `<article class="hh-dim"><header><b>${esc(d.label)}</b><span class="num">${d.value}</span></header><div class="hh-meter"><span style="width:${d.value}%"></span></div><p><b>${esc(T("優勢"))}</b>${esc(d.strength)}</p><p><b>${esc(T("要留意"))}</b>${esc(d.watch)}</p><p><b>${esc(T("這週試試"))}</b>${esc(d.try)}</p></article>`).join("")}</div></section>`;
  const checks = `<section class="hh-sec"><h3>${esc(T("傳統合婚九項"))}</h3><p class="fine">${esc(T("主要：現代命理師最重視的三項；輔助：參考用；民俗：長輩常問的老方法，只當參考。"))}</p>${r.checks.map((c, i) => `<details class="hh-check"${i < 3 ? " open" : ""}><summary><span class="t">${esc(c.title)}</span><span class="hh-tag lv-${esc(c.level)}">${esc(T(c.level))}</span><span class="hh-tag vd-${esc(c.verdict)}">${esc(T(c.verdict))}</span></summary>${c.paragraphs.map(p).join("")}${c.items.map(it => `<p class="item"><b>${esc(it.label)}</b>${en() ? " " : "　"}${esc(it.text)}</p>`).join("")}</details>`).join("")}</section>`;
  const loves = `<section class="hh-sec"><h3>${esc(T("兩個人的感情樣貌"))}</h3><div class="hh-loves">${r.loves.map(l => `<article class="hh-love"><h4>${esc(nameText(l.who))}</h4>${l.lines.map(p).join("")}<p class="seen">${esc(l.seen)}</p></article>`).join("")}</div></section>`;
  const guide = `<section class="hh-sec"><h3>${esc(T("相處說明書"))}</h3><dl class="hh-guide">${r.guide.map(g => `<div><dt>${esc(g.title)}</dt><dd>${esc(g.text)}</dd></div>`).join("")}</dl>${r.advice.length ? `<ul class="hh-advice">${r.advice.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</section>`;
  const tone = x => { const w = toneWord(x); return `<span class="ai-tone t-${w}">${esc(T(w))}</span>`; };
  const age = (X, n) => `<span>${esc(T("{name} {age} 歲", { name: nameText(X.n), age: n }))}</span>`;
  const wedTag = esc(T("宜婚"));
  const years = r.years.length ? `<section class="hh-sec"><h3>${esc(T("未來十年，你們的感情"))}</h3>
    <div class="hh-strip">${r.years.map(y => `<span class="yr s-${y.state}${y.wed ? " wed" : ""}"><b>${y.year}</b>${y.wed ? wedTag : esc(T(STATE[y.state]))}</span>`).join("")}</div>
    <p class="hh-legend"><span><i class="s-good" style="background:var(--indigo-wash)"></i>${esc(T("順勢"))}</span><span><i style="background:var(--wash)"></i>${esc(T("平穩"))}</span><span><i style="background:var(--seal-wash)"></i>${esc(T("要多體諒"))}</span><span>${esc(T("紅框：兩人都婚緣較旺的年份"))}</span></p>
    <ol class="hh-years">${r.years.map(y => `<li><div class="yh"><b>${esc(T("{year} 年", { year: y.year }))}</b><span>${esc(T("{pillar}年", { pillar: pillarText(y.pillar) }))}</span>${age(A, y.ages[0])}${tone(y.tones[0])}${age(B, y.ages[1])}${tone(y.tones[1])}${y.wed ? `<span class="ai-tone t-wed">${wedTag}</span>` : ""}</div><p><b>${esc(T("好事"))}</b>${esc(y.good)}</p><p><b>${esc(T("要注意"))}</b>${esc(y.watch)}</p></li>`).join("")}</ol></section>` : "";
  const more = `<section class="hh-sec"><h3>${esc(T("宜婚年份與結婚月份"))}</h3>${p(r.wed.text)}${p(r.months.text)}</section>
    <section class="hh-sec"><h3>${esc(T("一起開運"))}</h3>${p(r.luck.text)}</section>
    <section class="hh-sec"><h3>${esc(T("年齡差小知識"))}</h3>${p(r.age)}</section>`;
  return hero + bars + dims + checks + loves + guide + years + more;
}

// Six axes from the top, clockwise; the drawing keeps room for the labels.
function radar(dims) {
  const cx = 120, cy = 120, R = 86, n = dims.length;
  const at = (i, r) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const ring = r => dims.map((_, i) => at(i, r).map(v => v.toFixed(1)).join(",")).join(" ");
  const pts = dims.map((d, i) => at(i, (R * d.value) / 100));
  const labels = dims.map((d, i) => {
    const [x, y] = at(i, R + 16), anchor = Math.abs(x - cx) < 1 ? "middle" : x > cx ? "start" : "end";
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}">${esc(d.label)} <tspan class="v">${d.value}</tspan></text>`;
  }).join("");
  return `<svg class="hh-radar" viewBox="${en() ? "-110 -4 460 250" : "-70 -4 380 250"}" role="img" aria-label="${esc(T("六大面向：{list}", { list: dims.map(d => `${d.label} ${d.value}`).join(en() ? ", " : "、") }))}">
    ${[R, (R * 2) / 3, R / 3].map(r => `<polygon class="grid" points="${ring(r)}"/>`).join("")}
    ${dims.map((_, i) => { const [x, y] = at(i, R); return `<line class="axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join("")}
    <polygon class="area" points="${pts.map(q => q.map(v => v.toFixed(1)).join(",")).join(" ")}"/>
    ${pts.map(([x, y]) => `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`).join("")}
    ${labels}
  </svg>`;
}

// ---------- 用這對伴侶過一生 ----------
// Your life with the other person as the partner (core/family.js, sim/people.js): `only` keeps everyone else out of
// your love life until you meet them and keeps you together while you date; the years are the ones typed here, or
// none (then you meet once both are 22). Two people of the same sex can marry from 2019 (checkFamily says so).
const lifeError = text => { const el = $("#hh-life-error"); el.textContent = text; el.hidden = !text; };
const yearIn = id => { const v = $(id).value.trim(); return v ? Number(v) : undefined; };
function startLife() {
  if (!shown) return;
  const { a, b } = shown;
  const name = clean($("#hh-life-name").value);
  if (!name) { lifeError(t("請幫對方取個名字，故事裡會用這個名字稱呼對方。")); $("#hh-life-name").focus(); return; }
  const partner = { name, date: b.date, time: b.time, sex: b.sex, only: true, ...(b.place ? { place: b.place } : {}), ...(b.zi === "late" && b.time ? { zi: "late" } : {}) };
  const met = yearIn("#hh-life-met"), wed = yearIn("#hh-life-wed");
  if (met !== undefined) partner.metYear = Number.isInteger(met) ? met : NaN;
  if (wed !== undefined) partner.marriedYear = Number.isInteger(wed) ? wed : NaN;
  const family = { siblings: [], onlyChild: false, partner };
  setReadingLang(englishNow());
  const problems = checkFamily(family, a.date, a.sex, { english: lang() === "en" && !!englishNow() });
  if (problems.length) { lifeError(problems.join(" ")); return; }
  lifeError("");
  hooks.begin({ date: a.date, time: a.time, place: a.place, sex: a.sex, ...(a.zi === "late" ? { zi: "late" } : {}) }, null, { name: a.name, family });
}

// ---------- AI 深度合婚 ----------
const AI_WAIT = { m1: "合婚總評與兩個人的個性", m2: "相處的優點、容易摩擦的地方和建議", myears: "接下來十年兩個人的感情" };
const setStatus = (text, bad = false) => { const el = $("#hh-ai-status"); el.textContent = text; el.classList.toggle("bad", bad); };

function drawAI() {
  trackOnce("hehun");
  const soon = aiSoon();
  $("#hh-soon").hidden = !soon;
  $("#hh-soon-msg").hidden = true;
  if (soon) { $("#hh-ai").hidden = true; return; }
  const off = !onSite();
  // While today's AI quota is used up (ai-quota.js), AI 深度合婚 is not offered at all.
  $("#hh-ai").hidden = !off && aiOutToday();
  $("#hh-ai-go").hidden = off;
  $("#hh-ai-consent").hidden = off;
  $("#hh-ai-body").innerHTML = "";
  setStatus(off ? "AI 深度合婚只在命盤人生的網站上提供，這個預覽版沒有連上。" : "");
}

const QUOTA_LINE = "AI 命理師今天的額度用完了，明天再來找它。";
// Once today's quota is used up the button and its consent line go; what was written stays.
function aiOutControls() {
  if (!onSite() || !aiOutToday()) return;
  $("#hh-ai-go").hidden = true;
  $("#hh-ai-consent").hidden = true;
}
async function askAI() {
  if (!shown || !onSite()) return;
  if (aiOutToday() && !(ai && PARTS.match.every(x => ai.parts[x]))) { aiOutControls(); return setStatus(QUOTA_LINE, true); }
  const job = (ai ||= { shown, parts: {}, errors: {}, codes: {}, busy: new Set() });
  const todo = PARTS.match.filter(x => !job.parts[x] && !job.busy.has(x));
  if (todo.length) await askParts(job, todo);
  else renderAI(job);
}
async function askParts(job, parts) {
  const t0 = Date.now();
  if (aiOutToday()) { if (ai === job) { renderAI(job); statusOf(job, null); } return; }
  for (const x of parts) { job.busy.add(x); delete job.errors[x]; delete job.codes[x]; }
  const tick = () => { if (ai === job) statusOf(job, Math.floor((Date.now() - t0) / 1000)); };
  renderAI(job);
  tick();
  const timer = setInterval(tick, 1000);
  await Promise.all(parts.map(x => askPart(job, x)));
  clearInterval(timer);
  if (ai === job) statusOf(job, null);
}
async function askPart(job, part) {
  const ctrl = new AbortController(), timeout = setTimeout(() => ctrl.abort(), 90000);
  try {
    const { a, b } = job.shown;
    const body = readingRequest(a, "match", { part, partner: b });
    const res = await fetch(READING_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    const data = await res.json().catch(() => null);
    if (res.ok && data && (Array.isArray(data.sections) || Array.isArray(data.items))) job.parts[part] = data;
    else {
      job.errors[part] = readingError(res.status, data);
      job.codes[part] = res.status === 503 && data && data.error === "quota" ? "quota" : res.status;
      if (job.codes[part] === "quota") markAiOut();
    }
  } catch (e) {
    job.errors[part] = e && e.name === "AbortError" ? "這一段寫太久了。" : "現在連不上 AI 命理師，請檢查網路。";
  } finally {
    clearTimeout(timeout);
    job.busy.delete(part);
  }
  if (ai === job) renderAI(job);
}
// Parts the day's quota kept from being written get no failed row, only one line.
function statusOf(job, seconds) {
  const all = PARTS.match, done = all.filter(x => job.parts[x]).length;
  const failed = aiOutToday() ? 0 : all.filter(x => job.errors[x] && job.codes[x] !== "quota").length;
  const missing = all.length - done - failed - job.busy.size;
  if (job.busy.size) setStatus(`AI 命理師正在寫…已完成 ${done}/${all.length}${seconds !== null ? `（${seconds} 秒）` : ""}`);
  else if (failed) setStatus(`有 ${failed} 段沒寫好，可以按「重寫這一段」。`, true);
  else if (missing && aiOutToday()) setStatus(done ? `今天的 AI 額度用完了，還有 ${missing} 段沒寫到，明天再來看完整的合婚。` : QUOTA_LINE, !done);
  else setStatus("");
}
function waitHTML(job, part) {
  if (job.codes[part] === "quota" || (job.errors[part] && aiOutToday())) return "";
  if (job.errors[part]) return `<p class="ai-wait bad">「${esc(AI_WAIT[part])}」${esc(job.errors[part])}<button type="button" class="secondary" data-ai-retry="${part}">重寫這一段</button></p>`;
  return job.busy.has(part) ? `<p class="ai-wait">AI 命理師正在寫：${esc(AI_WAIT[part])}…</p>` : "";
}
function renderAI(job) {
  aiOutControls();
  const P = job.parts;
  const secs = part => (P[part] ? P[part].sections.map(s => `<section class="ai-sec${/一句話$/.test(s.title) ? " motto" : ""}"><h4>${esc(s.title)}</h4>${String(s.body).split(/\n+/).map(t => `<p>${esc(t)}</p>`).join("")}</section>`).join("") : waitHTML(job, part));
  const tone = t => { const w = toneWord(t); return `<span class="ai-tone t-${w}">${w}</span>`; };
  const years = P.myears ? (P.myears.items.length ? `<section class="ai-luck"><h4>接下來十年，你們的感情</h4><div class="ai-decade"><div class="ai-years"><ol>${P.myears.items.map(y => `<li><div class="yh"><b>${y.year} 年</b><span>${esc(y.pillar)}年</span><span>你 ${y.ages[0]} 歲</span>${tone(y.tones[0])}<span>對方 ${y.ages[1]} 歲</span>${tone(y.tones[1])}${y.fallback ? '<span class="ai-fb">＊</span>' : ""}</div><p><b>好事</b>${esc(y.fields.好事)}</p><p><b>要注意</b>${esc(y.fields.要注意)}</p></li>`).join("")}</ol></div></div></section>` : "") : waitHTML(job, "myears");
  const fb = P.myears && P.myears.items.some(x => x.fallback);
  $("#hh-ai-body").innerHTML = secs("m1") + secs("m2") + years + (Object.keys(P).length ? `<p class="fine">${fb ? "標＊的幾項 AI 沒有寫好，改用排盤引擎的原文。" : ""}AI 依本站排盤引擎算好的兩張命盤寫成，送出前已自動檢查干支、喜忌、年份和歲數。內容是傳統命理的說法，供參考與自我觀察，不是預言。</p>` : "");
}
