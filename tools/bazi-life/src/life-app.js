// 命盤人生・人生模擬頁：生辰 → 命盤 → 一年一年過完一生 → 人生 K 線與同盤重跑 100 次。全部在瀏覽器裡算。
import { computeChart } from "./core/chart.js";
import { PLACE_GROUPS, findPlace } from "./core/places.js";
import { prepare } from "./sim/setup.js";
import { createLife } from "./sim/life.js";
import { rerun } from "./sim/monte.js";
import { COUNTIES } from "./sim/world.js";
import { makeRng } from "./sim/rng.js";
import { randomName } from "./sim/random-name.js";
import { describeEffects, LEVEL_NAME } from "./core/name.js";
import { checkFamily, familyTilts, describeFamilyTilts, isSibling } from "./core/family.js";
import { describeViews } from "./core/analysis.js";
import { luckGods } from "./core/detail.js";
import { natalReading } from "./core/reading-natal.js";
import { yearReading, decadeReading, eventReason } from "./core/reading-year.js";
import { nameReading } from "./core/name-reading.js";
import { overallReading } from "./core/reading-overall.js";
import { partnerReading } from "./core/partner.js";
import { reportHTML } from "./report.js";
import { kindOf, TURNING, explainable } from "./sim/reason-kinds.js";
import { ALL_EVENTS } from "./sim/story/index.js";
import { safetyCheck, matchIntent } from "./sim/intent.js";
import { readInterpretation } from "./sim/interpret.js";
import { nameSwaps, withoutNames } from "./sim/privacy.js";
import { ACTIONS } from "./sim/actions.js";
import { readingRequest, readingError, partsFor, PARTS, toneWord } from "./ai-reading.js";
import { aiOutToday, markAiOut } from "./ai-quota.js";
import { SHICHEN } from "./core/shichen.js";
import { trait } from "./sim/words.js";
import { initBaby } from "./baby-app.js";
import { initMatch, onMatchTab, openMatch } from "./hehun-app.js";
import { initPixels, startScene, showStep, collectStep, openStory } from "./pixel-app.js";
import { draftStore, readIds, writeIds, later } from "./draft.js";
import { initTimeField, readTimeField, syncTimeField, timeFieldIds } from "./time-field.js";
import { initMemberHours, syncMemberHours, syncMemberHour, memberHourHTML, memberHourValue, setMemberHour, readMemberHour } from "./member-time.js";

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SPEED_MS = { 1: 900, 3: 320, 10: 90 };
const EVENT_BY_ID = new Map(ALL_EVENTS.map(e => [e.id, e]));
// The year's luck when the person is `age` (years since birth; setup.js keys prep.luck that way).
const luckAt = (prep, age) => prep.luck[Math.max(0, Math.min(prep.luck.length - 1, age))];
const EDU = { none: "沒有上學", 國小: "國小", 國中: "國中", 高中: "高中", 高職: "高職", 五專: "五專", 科大: "科技大學", 大學: "大學", 碩士: "碩士", 博士: "博士" };

let run = null;   // { input, extra: { name, family }, chart, prep, life, seed, born }
let timer = null, speed = 1, paused = false;
let leanNoted = false;
// The big moments since the last answer: a wedding, a birth, a new partner, a death in the family. A question opens at
// once and covers the lines printed just before it (on a phone, under the scene), so its box repeats them.
let recap = [];
const RECAP_IDS = new Set(["baby", "dating", "realPartnerMeet", "breakup"]);
const recapWorthy = e => (e.big || RECAP_IDS.has(e.id)) && e.id !== "birth" && e.id !== "death" && !e.free && !(e.asked && !e.picked);
// What the player writes is read by the site's Worker (worker/index.js, Workers AI) when the page is served by it; the
// build puts its address in <meta name="interpret-endpoint"> (empty for the Claude artifact). Without it, or when it
// does not answer, the page matches the words itself; the player sees the same choice box either way.
const INTERPRET_URL = (document.querySelector('meta[name="interpret-endpoint"]') || {}).content || "";
const READING_URL = (document.querySelector('meta[name="reading-endpoint"]') || {}).content || "";
const aiOff = () => !READING_URL || !/^https?:$/.test(location.protocol);
const AI_AUTO = "bazi-life.aiAuto";
let remoteOff = !INTERPRET_URL || !/^https?:$/.test(location.protocol);

function setup() {
  $("#f-place").innerHTML = PLACE_GROUPS.map(g => `<optgroup label="${esc(g.group)}">${g.places.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("")}</optgroup>`).join("");
  $("#f-place").value = "臺北市";
  for (const tab of TABS) $(`#tab-${tab}`).addEventListener("click", () => selectTab(tab));
  for (const b of document.querySelectorAll("[data-goto]")) b.addEventListener("click", () => { selectTab(b.dataset.goto); $("#setup").scrollIntoView({ behavior: "smooth", block: "start" }); });
  // The first visit opens on 歡迎; once another tab is opened, later visits start on 我的人生 (this browser only).
  // A reload goes back to the tab that was open.
  let welcomed = false;
  try { welcomed = localStorage.getItem("bazi-life.welcomed") === "1"; } catch {}
  const lastTab = TAB_DRAFT.load();
  selectTab(TABS.includes(lastTab) ? lastTab : welcomed ? "me" : "welcome");
  initTimeField("f");
  initMemberHours($("#form-me"));
  initBaby({ begin, showError });
  restoreForm();
  initMatch({ begin, showError, selectTab });
  for (const type of ["input", "change"]) $("#form-me").addEventListener(type, saveFormSoon);
  $("#family").addEventListener("toggle", saveFormSoon);
  $("#me-clear").addEventListener("click", clearForm);
  // Save what was typed in the last moment too, before a reload or when the phone switches apps.
  addEventListener("pagehide", () => saveFormSoon.flush());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveFormSoon.flush(); });
  initPixels();
  // The sticky status bar (with the pixel scene) is as tall as the screen makes it; scrolling to a choice leaves room for it.
  const status = $(".status");
  if (status && typeof ResizeObserver === "function") new ResizeObserver(() => document.documentElement.style.setProperty("--sticky", `${Math.ceil(status.getBoundingClientRect().height) + 8}px`)).observe(status);
  const partnerSex = $(".member[data-role=partner] .m-sex");
  partnerSex.addEventListener("change", () => { partnerSex.dataset.picked = "1"; });
  for (const r of document.querySelectorAll('input[name="sex"]')) r.addEventListener("change", () => { if (!partnerSex.dataset.picked) partnerSex.value = $("#sex-f").checked ? "male" : "female"; });
  $("#form-me").addEventListener("submit", e => { e.preventDefault(); startFromForm(); });
  $("#go-random").addEventListener("click", startRandom);
  $("#c-pause").addEventListener("click", () => { paused = !paused; $("#c-pause").textContent = paused ? "繼續" : "暫停"; if (!paused) schedule(); });
  // "只問人生大事": everyday choices follow the personality; remembered in this browser only.
  try { $("#c-major").checked = localStorage.getItem("bazi-life.majorOnly") === "1"; } catch {}
  $("#c-major").addEventListener("change", () => {
    const on = $("#c-major").checked;
    try { localStorage.setItem("bazi-life.majorOnly", on ? "1" : "0"); } catch {}
    if (run) run.life.setMajorOnly(on);
  });
  // 「結局自動 AI 解讀」: on unless it was turned off (remembered in this browser). Without the Worker there is no AI,
  // so no box either.
  try { $("#c-ai").checked = localStorage.getItem(AI_AUTO) !== "0"; } catch {}
  $("#c-ai").addEventListener("change", () => { try { localStorage.setItem(AI_AUTO, $("#c-ai").checked ? "1" : "0"); } catch {} });
  $("#c-ai-wrap").hidden = aiOff() || aiOutToday();
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
  $("#add-sibling").addEventListener("click", () => { addSibling(); saveFormSoon(); });
  $("#sibling-list").addEventListener("click", e => { const b = e.target.closest(".remove"); if (b) { b.closest(".member").remove(); saveFormSoon(); } });
  $("#f-only").addEventListener("change", () => {
    const only = $("#f-only").checked;
    $("#sibling-list").hidden = only; $("#add-sibling").hidden = only;
  });
  $("#ai-short").addEventListener("click", () => askAI("short"));
  $("#ai-full").addEventListener("click", () => askAI("full"));
  $("#ai-match-go").addEventListener("click", () => askAI("match"));
  $("#ai-match-tab").addEventListener("click", toMatchTab);
  $("#ai-p-when").innerHTML = memberHourHTML("對方");
  $("#ai-partner").addEventListener("change", e => { if (e.target.matches(".m-hour")) syncMemberHour($("#ai-partner")); });
  $("#ai-body").addEventListener("click", e => {
    const b = e.target.closest("[data-ai-retry]");
    if (b && aiShown) askParts(aiShown, [b.dataset.aiRetry]);
  });
  $("#again-same").addEventListener("click", () => begin(run.input, run.born, run.extra));
  $("#again-new").addEventListener("click", () => { stop(); $("#end").hidden = true; $("#play").hidden = true; $("#setup").hidden = false; $("#setup").scrollIntoView({ behavior: "smooth", block: "start" }); });
  window.addEventListener("resize", () => { if (run && run.summary && !$("#end").hidden) drawKline(); });
}

const TABS = ["welcome", "me", "random", "baby", "match"];
const PANEL = { welcome: "#welcome", me: "#form-me", random: "#form-random", baby: "#form-baby", match: "#form-match" };
function selectTab(tab) {
  for (const t of TABS) {
    $(`#tab-${t}`).setAttribute("aria-selected", String(t === tab));
    $(PANEL[t]).hidden = t !== tab;
  }
  if (tab !== "welcome") try { localStorage.setItem("bazi-life.welcomed", "1"); } catch {}
  TAB_DRAFT.save(tab);
  saveFormSoon.flush();   // what was just typed in 我的人生 is saved before 合婚 reads it (hehun-app.js fillFromLife)
  onMatchTab(tab);
}

// 填到一半的表單 stays through a reload (draft.js: this tab only, gone when it is closed).
const FORM_DRAFT = draftStore("bazi-life.form"), TAB_DRAFT = draftStore("bazi-life.tab");
// The kinds of question asked in this tab's last lives (only their ids, nothing about the player), so a replay brings
// other everyday situations (life.js: seen, NOVELTY). Kept like the drafts: this tab only, gone when it is closed.
const SEEN = draftStore("bazi-life.seen"), SEEN_LIVES = 2;
const seenLives = () => { const d = SEEN.load(); return d && Array.isArray(d.lives) ? d.lives.filter(Array.isArray).map(l => l.filter(id => typeof id === "string")) : []; };
function startSeen() {
  const lives = seenLives();
  SEEN.save({ lives: [...lives.slice(-SEEN_LIVES), []] });
  return lives.slice(-SEEN_LIVES).flat();
}
function markSeen(id) {
  const lives = seenLives();
  if (!lives.length) lives.push([]);
  const now = lives[lives.length - 1];
  if (!now.includes(id)) now.push(id);
  SEEN.save({ lives: lives.slice(-(SEEN_LIVES + 1)) });
}
const ME_FIELDS = ["f-name", "f-date", ...timeFieldIds("f"), "sex-m", "sex-f", "f-place", "family", "f-met", "f-wed", "f-only"];
const memberValues = el => ({ name: el.querySelector(".m-name").value, date: el.querySelector(".m-date").value, ...memberHourValue(el) });
function setMember(el, m) { el.querySelector(".m-name").value = m.name || ""; el.querySelector(".m-date").value = m.date || ""; setMemberHour(el, m); }
function saveForm() {
  const members = {};
  for (const el of document.querySelectorAll("#form-me .member[data-role]")) {
    members[el.dataset.role] = memberValues(el);
    if (el.dataset.role === "partner") { const sex = el.querySelector(".m-sex"); Object.assign(members.partner, { sex: sex.value, picked: !!sex.dataset.picked }); }
  }
  const siblings = [...document.querySelectorAll("#sibling-list .member")].map(el => ({ rel: el.querySelector(".m-rel").value, ...memberValues(el) }));
  FORM_DRAFT.save({ v: 1, fields: readIds(ME_FIELDS), members, siblings });
}
const saveFormSoon = later(saveForm);
function restoreForm() {
  const d = FORM_DRAFT.load();
  if (!d || d.v !== 1) return;
  writeIds(d.fields);
  for (const el of document.querySelectorAll("#form-me .member[data-role]")) {
    const m = d.members && d.members[el.dataset.role];
    if (!m) continue;
    setMember(el, m);
    if (el.dataset.role === "partner") { const sex = el.querySelector(".m-sex"); if (m.sex) sex.value = m.sex; if (m.picked) sex.dataset.picked = "1"; }
  }
  for (const sib of d.siblings || []) {
    const row = addSibling(false);
    if (!row) break;
    if (SIBLINGS.some(([v]) => v === sib.rel)) row.querySelector(".m-rel").value = sib.rel;
    setMember(row, sib);
  }
  applyFormState();
}
// The parts of the form that follow other fields.
function applyFormState() {
  syncTimeField("f");
  syncMemberHours($("#form-me"));
  const only = $("#f-only").checked;
  $("#sibling-list").hidden = only; $("#add-sibling").hidden = only;
}
function clearForm() {
  if (!confirm("要清空這張表單嗎？填過的資料會刪掉。")) return;
  $("#form-me").reset();
  $("#f-place").value = "臺北市";
  $("#sibling-list").innerHTML = "";
  const sex = $(".member[data-role=partner] .m-sex");
  delete sex.dataset.picked; sex.value = $("#sex-f").checked ? "male" : "female";
  $("#family").open = false;
  applyFormState();
  FORM_DRAFT.clear();
  showError("");
}

function showError(text) { const e = $("#error"); e.textContent = text; e.hidden = !text; }

const SIBLINGS = [["olderBrother", "哥哥"], ["olderSister", "姊姊"], ["youngerBrother", "弟弟"], ["youngerSister", "妹妹"]];
function addSibling(focus = true) {
  const list = $("#sibling-list");
  if (list.children.length >= 8) return null;
  const row = document.createElement("div");
  row.className = "member";
  row.innerHTML = `<select class="m-rel" aria-label="關係">${SIBLINGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
    <input type="text" class="m-name" maxlength="8" placeholder="姓名" aria-label="姓名">
    <span class="when"><input type="date" class="m-date" min="1900-01-01" max="2100-12-31" aria-label="出生日期">${memberHourHTML("這位兄弟姊妹")}</span>
    <button type="button" class="remove" aria-label="移除這位兄弟姊妹">移除</button>`;
  list.appendChild(row);
  if (focus) row.querySelector(".m-rel").focus();
  return row;
}

const cleanName = v => String(v || "").replace(/\s+/g, "");
function readMember(el) {
  const name = cleanName(el.querySelector(".m-name").value);
  const [y, m, d] = (el.querySelector(".m-date").value || "").split("-").map(Number);
  return { name, date: y ? { y, m, d } : null, time: y ? readMemberHour(el) : null };
}

// The optional family section, or null when nothing was filled in.
function readFamily() {
  const out = { siblings: [], onlyChild: $("#f-only").checked };
  for (const el of document.querySelectorAll(".member[data-role]")) {
    const m = readMember(el);
    if (el.dataset.role === "partner") {
      m.sex = el.querySelector(".m-sex").value;
      const year = id => ($(id).value ? (Number.isFinite(Number($(id).value)) ? Math.round(Number($(id).value)) : NaN) : undefined);
      if (m.date && year("#f-met") !== undefined) m.metYear = year("#f-met");
      if (m.date && year("#f-wed") !== undefined) m.marriedYear = year("#f-wed");
    }
    if (m.name || m.date) out[el.dataset.role] = m;
  }
  if (!out.onlyChild) for (const el of document.querySelectorAll("#sibling-list .member")) {
    const m = readMember(el);
    if (m.name || m.date) out.siblings.push({ relation: el.querySelector(".m-rel").value, ...m });
  }
  return out.father || out.mother || out.partner || out.siblings.length || out.onlyChild ? out : null;
}

function startFromForm() {
  const [y, m, d] = ($("#f-date").value || "").split("-").map(Number);
  if (!y) return showError("請輸入出生日期。");
  if (y < 1900 || y > 2100) return showError("出生年份請在 1900 到 2100 年之間。");
  const hour = readTimeField("f");
  if (hour.error) return showError(hour.error);
  const family = readFamily();
  const members = family ? [family.father, family.mother, family.partner, ...family.siblings].filter(Boolean) : [];
  if (members.some(x => x.date && (x.date.y < 1900 || x.date.y > 2100))) return showError("家人的出生年份請在 1900 到 2100 年之間。");
  const problems = checkFamily(family, { y, m, d }, $("#sex-f").checked ? "female" : "male");
  if (problems.length) { $("#family").open = true; return showError(problems.join(" ")); }
  showError("");
  const input = { date: { y, m, d }, time: hour.time, place: findPlace($("#f-place").value), sex: $("#sex-f").checked ? "female" : "male" };
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
  run = { input, extra, chart, prep, name, seed, born, life: createLife({ chart, analysis: prep.analysis, luck: prep.luck, seed, name, family: prep.family, majorOnly: $("#c-major").checked, seen: startSeen() }), summary: null };
  startScene(seed, run.life.state, age => luckAt(prep, age));
  $("#setup").hidden = true; $("#baby").hidden = true; $("#match").hidden = true; $("#end").hidden = true; $("#play").hidden = false;
  $("#feed").innerHTML = ""; $("#choice").hidden = true; recap = [];
  $("#born").textContent = born || `${input.date.y} 年 ${input.date.m} 月 ${input.date.d} 日在${input.place.name}出生。`;
  $("#c-ai-wrap").hidden = aiOff() || aiOutToday();   // nothing to switch on while today's AI quota is used up
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
  showStep(life.state, age => luckAt(run.prep, age), entries);
  if (life.pending) return showChoice();
  if (life.done) return finish();
  schedule();
}

function choose(i) {
  const entries = run.life.choose(i);
  $("#choice").hidden = true; recap = [];
  render(entries);
  updateStatus();
  showStep(run.life.state, age => luckAt(run.prep, age), entries);
  if (run.life.pending) return showChoice();
  if (run.life.done) return finish();
  schedule();
}

function skipToEnd() {
  stop();
  const life = run.life, all = [];
  let guard = 0;
  while (!life.done && guard++ < 5000) {
    const entries = life.pending ? life.autoChoose() : life.step();
    collectStep(life.state, age => luckAt(run.prep, age), entries);
    all.push(...entries);
  }
  $("#choice").hidden = true;
  render(all);
  showStep(life.state, age => luckAt(run.prep, age), []);
  finish();
}

// The professional reading of the year the person is `age`, computed once per life and age.
function readingAt(age) {
  const cache = (run.readings ||= new Map());
  if (!cache.has(age)) cache.set(age, yearReading(run.chart, run.prep.analysis, age));
  return cache.get(age);
}
// The 命理 explanation of an event: its own kind (reason-kinds.js), or, for a story event, the year's reading of its
// domain when that reading clearly points the same way as the event. Deaths are never explained.
function chartReason(id, age, channel = null) {
  if (!explainable(id)) return null;
  const r = readingAt(age), kind = kindOf(id), ev = EVENT_BY_ID.get(id), ch = channel || (ev && ev.channel) || null;
  if (kind) {
    // The channel says which way the event went (a 學業 setback is not explained by 文昌).
    const x = eventReason(kind, r, { sex: run.chart.input.sex, channel: ch });
    return x ? { short: x.short, why: TURNING.has(id) ? x.why : null } : null;
  }
  const d = ev && ev.domain && r.domains[ev.domain];
  if (!d || !d.text || !ch) return null;
  const clear = ch === "good" ? d.level >= 2 : ch === "bad" ? d.level <= -2 : Math.abs(d.level) >= 2;
  return clear ? { short: `${r.pillar}年：${d.text}`, why: null } : null;
}
const reasonLine = (r, tag = "span") => (r ? `<${tag} class="why">命理：${esc(r.short)}</${tag}>${r.why ? `<details class="why-more"><summary>為什麼在這個歲數</summary><p>${esc(r.why)}</p></details>` : ""}` : "");
const lineOf = e => `<p class="${e.big ? "big" : ""}">${esc(e.text)}</p>${e.choice ? `<span class="chose">${e.free ? "你自己的決定" : e.picked ? "依你的個性" : "你的選擇"}：${esc(e.choice)}</span>` : ""}`
  + (e.reason && e.reasonFrom === "family" ? `<span class="why">合盤：${esc(e.reason)}</span>` : "") + reasonLine(chartReason(e.id, e.age, e.channel));

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
    if (recapWorthy(e)) recap.push(e);
  }
  const last = feed.lastElementChild;
  if (last && !$("#play").hidden) last.scrollIntoView({ block: "nearest", behavior: speed === 10 ? "auto" : "smooth" });
}

function updateStatus() {
  const s = run.life.state, l = luckAt(run.prep, s.age);
  $("#s-age").textContent = `${s.age} 歲`;
  $("#s-year").textContent = `${s.year} 年`;
  // The ten gods of the decade and the year for this day master (stem・branch), as professional charts print them.
  const gods = name => { const g = luckGods(run.chart.dayMaster.name, name); return `${g.stem}・${g.branch}`; };
  const decade = l && l.decade ? l.decade : null;
  $("#s-decade").textContent = decade || "童限";
  $("#s-decade-god").textContent = decade ? gods(decade) : "";
  $("#s-pillar").textContent = l ? l.year : "";
  $("#s-pillar-god").textContent = l ? gods(l.year) : "";
  $("#s-mood").style.width = `${Math.round(s.happiness)}%`;
}

function showChoice() {
  stop();
  const p = run.life.pending, box = $("#choice");
  markSeen(p.id);
  const why = reasonLine(chartReason(p.id, run.life.state.age), "p") + (p.why && p.why.from === "family" ? `<p class="why">合盤：${esc(p.why.text)}</p>` : "");
  const dm = run.prep.analysis.dayMaster, nature = (trait(run.prep.analysis) || "").split("，").pop();
  const leanNote = p.lean >= 0 && !leanNoted ? `<p class="lean-note">標著「個性傾向」的選項，是從你的${esc(dm.stem + dm.element)}日主（${esc(nature)}）和這一生做過的選擇推算的。選哪一個都可以。</p>` : "";
  if (p.lean >= 0) leanNoted = true;
  const since = recap.slice(-3);
  const recapBox = since.length ? `<div class="recap"><p>上次選擇之後</p><ul>${since.map(e => `<li><b>${e.age} 歲</b>${esc(e.text)}</li>`).join("")}</ul></div>` : "";
  box.innerHTML = `${recapBox}<p class="q">${esc(p.prompt)}</p>${why}<div class="options">${p.options.map((o, i) => `<button type="button" data-option="${i}"><b>${esc(o.label)}</b>${o.hint ? `<small>${esc(o.hint)}</small>` : ""}${o.lean ? `<span class="lean">個性傾向</span>` : ""}</button>`).join("")}</div>${leanNote}`
    + (p.free ? `<form class="free" id="free-form" autocomplete="off">
      <label for="free-text">或者，寫下你自己的決定</label>
      <div class="free-row"><input type="text" id="free-text" maxlength="80" placeholder="例如：先跟家人商量看看"><button type="submit" id="free-go">這樣做</button></div>
      <div class="free-out" id="free-out" aria-live="polite"></div>
    </form>` : "");
  box.hidden = false;
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  box.querySelector("button").focus({ preventScroll: true });
}

const freeOut = html => { const out = $("#free-out"); if (out) out.innerHTML = html; };
const SAFETY_TEXT = {
  self_harm: `<div class="help">如果你現在真的有這樣的感覺，請找人說說：1925 安心專線（24 小時）、1995 生命線、1980 張老師。<br>故事裡，我們換一個選擇好嗎？</div>`,
  harm: `<p>這個選擇會傷害別人或違法，故事不會往這個方向走。換個方式寫寫看？</p>`,
};

// What the player wrote → an action. Safety words first (never simulated, never sent), then the Worker when there is
// one, else the local matcher's closest guesses for the player to pick. Nothing applies until the player confirms.
async function interpretFree(text) {
  const p = run.life.pending;
  if (!p || !p.free) return;
  const safety = safetyCheck(text);
  if (safety !== "ok") return freeOut(SAFETY_TEXT[safety]);
  if (!remoteOff) {
    const go = $("#free-go"), box = $("#free-text"), asked = run;
    freeOut(`<p class="muted">正在理解你的決定…</p>`);
    go.disabled = true; box.disabled = true;
    try {
      // Names the player typed (theirs, the family's, the partner's) are swapped for 你, 爸爸, 伴侶… before sending.
      const swaps = nameSwaps({ name: run.extra && run.extra.name, members: run.prep.family ? run.prep.family.members : [] });
      const reply = await askWorker(withoutNames({ ...p.free, text }, swaps));
      // The player may have picked a button or started over while waiting.
      const now = run === asked && run.life.pending;
      if (!now || now.id !== p.id || now.prompt !== p.prompt) return;
      const r = reply ? readInterpretation(reply, { options: p.free.options }) : null;
      if (r && (r.action === "self_harm" || r.action === "harm")) return freeOut(SAFETY_TEXT[r.action]);
      if (r && r.action !== "unknown") return confirmFree(r.action, r.summary || `你決定「${text}」`);
    } finally {
      go.disabled = false; box.disabled = false;
    }
  }
  suggestFree(text);
}

// The Worker's reading, or null on any failure. A missing endpoint (a static host without the Worker) or a network
// error turns it off for the rest of the visit; a busy or over-quota Worker (429, 5xx) is only skipped this time.
async function askWorker(payload) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(INTERPRET_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
    if (res.status === 404 || res.status === 405) remoteOff = true;
    return res.ok ? await res.json() : null;
  } catch (e) {
    if (!(e && e.name === "AbortError")) remoteOff = true;
    return null;
  } finally {
    clearTimeout(timer);
  }
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
  if (!picks.length) return freeOut(`<p>看不太出來會怎麼發展。可以換個說法，或就照你寫的走。</p><div class="suggest"><button type="button" class="own" data-free-action="own" data-summary="${esc(summary)}">照我寫的就好</button></div>`);
  freeOut(`<p>你的意思比較接近哪一個？都不像的話，就照你寫的走。</p><div class="suggest">${picks.map(x => `<button type="button" data-free-action="${esc(x.id)}" data-summary="${esc(summary)}">${esc(x.label)}</button>`).join("")}<button type="button" class="own" data-free-action="own" data-summary="${esc(summary)}">照我寫的就好</button></div>`);
}

function confirmFree(action, summary) {
  const p = run.life.pending;
  const own = p.options.find(o => o.id === action);
  const rule = own ? own.label : ACTIONS[action] ? ACTIONS[action].label : "";
  freeOut(`<p><b>${esc(summary)}</b>${rule ? `<br><small>後面的發展會比照「${esc(rule)}」。</small>` : ""}</p><div class="suggest"><button type="button" data-free-action="${esc(action)}" data-summary="${esc(summary)}">就這樣</button><button type="button" class="own" data-free-action="own" data-summary="${esc(summary)}">照我寫的就好</button><button type="button" class="plain" data-free-cancel>改一下</button></div><p class="free-note">「照我寫的就好」會把你的話原樣寫進故事，不套用任何選項的結果。</p>`);
}

function applyFree(action, summary) {
  const r = run.life.chooseAction({ action, summary });
  if (r.infeasible) return freeOut(`<p>這個現在做不到：${esc(r.infeasible)}</p>`);
  $("#choice").hidden = true; recap = [];
  render(r.entries);
  updateStatus();
  showStep(run.life.state, age => luckAt(run.prep, age), r.entries);
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
  drawReport();
  drawAI();
  drawShare(peak);
  $("#end").scrollIntoView({ block: "start" });
  openStory(s, age => luckAt(prep, age), () => { $("#end").scrollIntoView({ block: "start" }); $("#end-title").focus({ preventScroll: true }); });
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
    const k = byAge.get(age), b = band.find(z => z.age === age), l = luckAt(prep, age);
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
  $("#kline-table").innerHTML = `<table><thead><tr><th>年齡</th><th>年份</th><th>流年</th><th>開</th><th>收</th><th>高</th><th>低</th></tr></thead><tbody>${life.kline.map(k => `<tr><td>${k.age} 歲</td><td>${k.year}</td><td>${esc((luckAt(prep, k.age) || {}).year || "")}</td><td>${k.open}</td><td>${k.close}</td><td>${k.high}</td><td>${k.low}</td></tr>`).join("")}</tbody></table>`;
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
  const p = summary.partner;
  if (p) counts.push(`有 ${p.met} 次和${p.name ? esc(p.name) : "伴侶"}在一起，其中 ${p.married} 次結婚、${p.divorced} 次離婚`);
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
  const top = prep.luck.slice(0, s.age + 1).slice().sort((x, y) => y.score - x.score).slice(0, 5).sort((x, y) => x.age - y.age);
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

// 八字命理詳批: the professional chart and readings for this birth and name, plus how this life's turning points
// sat in their years.
function drawReport() {
  const { chart, prep, life } = run, a = prep.analysis;
  const natal = natalReading(chart, a, { name: prep.name ? prep.name.full : null });
  const decades = chart.luck.decades.map((_, i) => decadeReading(chart, a, i));
  const now = new Date().getFullYear(), birth = chart.input.date.y;
  const from = birth <= now ? now - birth : 18;
  const years = Array.from({ length: 10 }, (_, k) => readingAt(from + k));
  const seen = new Set();
  const events = life.log.filter(e => TURNING.has(e.id) && explainable(e.id) && !seen.has(`${e.id}|${e.age}`) && seen.add(`${e.id}|${e.age}`))
    .slice(0, 14).map(e => ({ entry: e, reason: chartReason(e.id, e.age, e.channel) }));
  const name = prep.name ? nameReading(prep.name, a) : null;
  const overall = overallReading(a, { decades, name });
  // 伴侶合盤, when the partner's birthday was given.
  const pm = prep.family && prep.family.members.find(m => m.relation === "partner" && m.chart);
  const partner = pm ? partnerReading({
    me: { pillars: prep.natal, analysis: a, sex: chart.input.sex, name: prep.name ? prep.name.full : run.extra.name || "" },
    partner: { pillars: pm.chart.pillars, analysis: pm.chart.analysis, sex: pm.sex, name: pm.name },
  }) : null;
  const yearsTitle = birth <= now ? `近十年流年（${now}–${now + 9}）` : `成年後十年的流年（${birth + 18}–${birth + 27}）`;
  $("#report-body").innerHTML = reportHTML(chart, { natal, decades, years, events, name, overall, partner, yearsTitle });
  const born = chart.time.shichen ? `出生日期與${chart.time.shichen}時` : chart.hourKnown ? "出生時刻（真太陽時）" : "出生日期（時辰不詳）";
  $("#report-lede").textContent = `依${prep.name ? `「${prep.name.full}」的姓名與` : ""}${born}排出的命盤，用傳統子平八字${prep.name ? "與姓名學" : ""}的方法逐項分析。傳統命理的說法，僅供參考。`;
  $("#report").hidden = false;
}

// ---------- AI 命理師解讀與 AI 合婚 ----------
// Only births are sent (ai-reading.js readingRequest): the chart is read as it is, not this game's life. A reading comes
// in parts, all asked at once and shown as each arrives; a part that fails can be asked again on its own. The full
// reading starts by itself when the end page opens, unless 結局自動 AI 解讀 was turned off at the top of the play screen.
// Readings are kept while the page is open, by birth (合婚 also by partner), so living the same chart again sends only
// what is not written yet.
const AI_QUOTA = "AI 命理師今天的額度用完了，明天再來找它；下面的八字命理詳批一樣可以看。";
const AI_CONSENT = {
  click: "按下按鈕，會把出生日期、時間、出生地和性別送到伺服器，交給 AI 寫解讀。不含姓名和家人，寫完不保存。",
  auto: "結局頁會自動把出生日期、時間、出生地和性別送到伺服器，交給 AI 寫解讀。不含姓名和家人，寫完不保存。不想自動送出，可以在遊戲畫面上方取消勾選「結局自動 AI 解讀」。",
};
const AI_WAIT = {
  short: "命格一句話與總評", a: "命格、命盤總論、性格與天賦、事業與財運", b: "感情與婚姻、六親與人際、健康與作息、開運建議",
  decades: "每一步大運", m1: "合婚總評與兩個人的個性", m2: "相處的優點、容易摩擦的地方和建議", myears: "接下來十年兩個人的感情",
};
const AI_LAST = ["開運建議", "給你的三句話"];
const YEAR_PARTS = PARTS.full.filter(p => p.startsWith("years"));
const aiJobs = new Map();   // every reading asked for while the page is open
let aiShown = null;         // the reading on screen
let aiAuto = false;         // this end page started the full reading by itself
let aiAutoJob = null;       // the reading it started
// The Worker takes 20 parts a minute from one player (READING_LIMIT in wrangler.jsonc). An end page starts by itself
// only if its parts fit in what is left of the minute; lives skipped through quickly wait for a button instead.
const PARTS_PER_MINUTE = 20, sentAt = [];
function sentLastMinute() {
  while (sentAt.length && Date.now() - sentAt[0] >= 60000) sentAt.shift();
  return sentAt.length;
}
// The words go to the live region only when they change; the seconds tick beside it, not read out.
function setAIStatus(text, bad = false, seconds = null) {
  const el = $("#ai-status");
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle("bad", bad);
  $("#ai-secs").textContent = seconds === null ? "" : `（${seconds} 秒）`;
}
const aiKey = (input, kind, partner) => `${new Date().getUTCFullYear()}|${JSON.stringify(readingRequest(input, kind, { partner }))}`;
const aiTodo = job => job.all.filter(p => !job.parts[p] && !job.busy.has(p));
const pad2 = n => String(n).padStart(2, "0");

function drawAI() {
  aiShown = null;
  aiAutoJob = null;
  $("#ai").hidden = false;
  $("#ai-body").innerHTML = "";
  const off = aiOff();
  // Today's AI quota is used up (ai-quota.js): no AI card at all until it starts again, unless this chart's full
  // reading was written earlier on this page, which still shows (nothing is sent, nothing else is offered).
  if (!off && aiOutToday()) {
    const kept = aiJobs.get(aiKey(run.input, "full", null));
    if (!kept || !kept.all.every(p => kept.parts[p])) { $("#ai").hidden = true; return; }
    aiAuto = true;
    for (const id of ["#ai-go", "#ai-consent", "#ai-match", "#ai-p-error"]) $(id).hidden = true;
    aiShown = kept;
    renderAI(kept);
    setAIStatus("");
    return;
  }
  aiAuto = !off && $("#c-ai").checked;
  const cached = aiAuto && aiJobs.get(aiKey(run.input, "full", null));
  const todo = cached ? aiTodo(cached).length : partsFor("full", run.input.date.y, new Date().getUTCFullYear()).length;
  const tooMany = aiAuto && todo > 0 && sentLastMinute() + todo > PARTS_PER_MINUTE;
  if (tooMany) aiAuto = false;
  for (const id of ["#ai-go", "#ai-consent", "#ai-match"]) $(id).hidden = off;
  $("#ai-consent").textContent = AI_CONSENT[aiAuto ? "auto" : "click"];
  $("#ai-p-error").hidden = true;
  setAIStatus(off ? "AI 命理師解讀和 AI 合婚只在命盤人生的網站上提供，這個預覽版沒有連上。"
    : tooMany ? "這一分鐘已經寫了好幾份解讀，這一張命盤等你按「完整解讀」再寫。" : "");
  prefillPartner();
  aiButtons();
  if (aiAuto) askAI("full", { auto: true });
}

// When the full reading started by itself, 先看重點 is not offered, and 完整解讀 is there only to come back from 合婚.
// Once today's quota is used up nothing more can be written: no buttons, no 合婚 form and no consent line, except
// 完整解讀 to come back to this chart's full reading when it was written before.
function aiButtons() {
  if (!aiOff() && aiOutToday()) {
    const full = run && aiJobs.get(aiKey(run.input, "full", null));
    const back = !!full && full !== aiShown && full.all.every(p => full.parts[p]);
    $("#ai-short").hidden = true;
    $("#ai-full").hidden = !back;
    $("#ai-match").hidden = true;
    $("#ai-consent").hidden = true;
    return;
  }
  $("#ai-short").hidden = aiAuto;
  $("#ai-full").hidden = aiAuto && (!aiShown || aiShown.kind === "full");
}

// The partner of the family form, when one was entered with a birthday.
function prefillPartner() {
  const p = run.extra.family && run.extra.family.partner, row = $("#ai-partner");
  $("#ai-p-sex").value = p && (p.sex === "male" || p.sex === "female") ? p.sex : run.input.sex === "male" ? "female" : "male";
  if (p && p.date) {
    $("#ai-p-date").value = `${p.date.y}-${pad2(p.date.m)}-${pad2(p.date.d)}`;
    const t = p.time, sc = t && t.branch ? SHICHEN.find(x => x.branch === t.branch && x.h === t.h && x.mi === t.mi) : null;
    setMemberHour(row, { hour: !t ? "" : sc ? sc.key : "clock", time: t && !sc ? `${pad2(t.h)}:${pad2(t.mi)}` : "" });
  } else {
    $("#ai-p-date").value = "";
    setMemberHour(row, { hour: "", time: "" });
  }
  // Open with the partner filled in, except when the reading is writing itself: that is read first.
  $("#ai-match").open = !aiAuto && !!(p && p.date);
}
// From the end of a life to the 合婚 tab: you, and the partner typed in the AI card (when a birthday is there).
function toMatchTab() {
  if (!run) return;
  const partner = readPartner();
  stop();
  $("#end").hidden = true; $("#play").hidden = true; $("#setup").hidden = false;
  openMatch({ me: { ...run.input, name: run.extra.name || "" }, partner: partner.error ? null : partner });
  if (partner.error) $("#setup").scrollIntoView({ behavior: "smooth", block: "start" });
}
function readPartner() {
  const [y, m, d] = ($("#ai-p-date").value || "").split("-").map(Number);
  if (!y) return { error: "請先填另一半的出生日期。" };
  if (y < 1900 || y > 2100) return { error: "出生年份請在 1900 到 2100 年之間。" };
  return { date: { y, m, d }, time: readMemberHour($("#ai-partner")), sex: $("#ai-p-sex").value };
}

async function askAI(kind, { auto = false } = {}) {
  const r = run;
  if (!r || !r.life.done) return;
  let partner = null;
  // The 合婚 form says what is missing next to itself, where the progress of a reading cannot write over it.
  $("#ai-p-error").hidden = true;
  if (kind === "match") {
    partner = readPartner();
    if (partner.error) { $("#ai-p-error").textContent = partner.error; $("#ai-p-error").hidden = false; return; }
  }
  // The key is what would be sent (births only), so the same chart in another life finds its reading.
  const key = aiKey(r.input, kind, partner);
  let job = aiJobs.get(key);
  // Nothing more is written today: what is on screen stays; with nothing on screen, one line says why.
  if (aiOutToday() && !(job && job.all.every(p => job.parts[p]))) {
    if (!aiShown) setAIStatus(AI_QUOTA, true);
    aiButtons();
    return;
  }
  if (!job) aiJobs.set(key, (job = { kind, partner, input: r.input, all: partsFor(kind, r.input.date.y, new Date().getUTCFullYear()), parts: {}, errors: {}, codes: {}, busy: new Set(), t0: 0, timer: null }));
  aiShown = job;
  if (auto) aiAutoJob = job;
  aiButtons();
  const todo = aiTodo(job);
  renderAI(job);
  aiStatusOf(job, null);
  if (todo.length) await askParts(job, todo);
}

// One clock per reading: parts asked again while others are still being written join the running count.
async function askParts(job, parts) {
  // Once today's quota is known to be used up, nothing more is sent.
  if (aiOutToday()) { if (aiShown === job) { renderAI(job); aiStatusOf(job, null); } return; }
  for (const p of parts) { job.busy.add(p); delete job.errors[p]; delete job.codes[p]; }
  if (!job.timer) {
    job.t0 = Date.now();
    job.timer = setInterval(() => { if (aiShown === job) aiStatusOf(job, Math.floor((Date.now() - job.t0) / 1000)); }, 1000);
  }
  if (aiShown === job) { renderAI(job); aiStatusOf(job, Math.floor((Date.now() - job.t0) / 1000)); }
  await Promise.all(parts.map(p => askPart(job, p)));
  if (job.busy.size) return;
  clearInterval(job.timer);
  job.timer = null;
  if (aiShown === job) aiStatusOf(job, null);
}

async function askPart(job, part) {
  const ctrl = new AbortController(), timeout = setTimeout(() => ctrl.abort(), 90000);
  try {
    const body = readingRequest(job.input, job.kind, { part, partner: job.partner });
    sentAt.push(Date.now());
    const res = await fetch(READING_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    const data = await res.json().catch(() => null);
    if (res.ok && data && (Array.isArray(data.sections) || Array.isArray(data.items))) job.parts[part] = data;
    else if (res.status === 503 && data && data.error === "quota") {
      job.errors[part] = readingError(res.status, data); job.codes[part] = "quota";
      markAiOut();
      $("#c-ai-wrap").hidden = true;
    } else { job.errors[part] = readingError(res.status, data); job.codes[part] = res.status; }
  } catch (e) {
    job.errors[part] = e && e.name === "AbortError" ? "這一段寫太久了。" : "現在連不上 AI 命理師，請檢查網路。";
  } finally {
    clearTimeout(timeout);
    job.busy.delete(part);
  }
  if (aiShown === job) renderAI(job);
}

// Today's quota is used up and nothing of this reading was written. The reading the end page started by itself then
// takes the whole card away (renderAI); one a player asked for says so in one line.
const quotaBlank = job => !job.busy.size && !job.all.some(p => job.parts[p]) && aiOutToday();

// 「正在寫…已完成 3/8（12 秒）」, then what is left to do. Parts the day's quota kept from being written get no failed row,
// only a calm line.
function aiStatusOf(job, seconds) {
  const all = job.all, done = all.filter(p => job.parts[p]).length;
  // Once the day is out nothing can be written again, so any part not written counts as missing, not as failed.
  const failed = aiOutToday() ? 0 : all.filter(p => job.errors[p] && job.codes[p] !== "quota").length;
  const missing = all.length - done - failed - job.busy.size;
  if (job.busy.size) setAIStatus(`AI 命理師正在寫…已完成 ${done}/${all.length}`, false, seconds);
  else if (failed) setAIStatus(`有 ${failed} 段沒寫好，可以按「重寫這一段」。`, true);
  else if (missing && aiOutToday()) setAIStatus(done ? `今天的 AI 額度用完了，還有 ${missing} 段沒寫到，明天再來看完整的解讀。` : AI_QUOTA, !done);
  else setAIStatus(job.kind === "short" ? "這是重點版。想看性格、事業、感情、每一步大運和每一歲的好事與要注意的事，請按「完整解讀」。" : "");
}

const aiSecs = list => list.map(s => `<section class="ai-sec${/一句話$/.test(s.title) ? " motto" : ""}"><h4>${esc(s.title)}</h4>${String(s.body).split(/\n+/).map(p => `<p>${esc(p)}</p>`).join("")}</section>`).join("");
function aiWait(job, part, what = AI_WAIT[part]) {
  if (job.codes[part] === "quota" || (job.errors[part] && aiOutToday())) return "";
  if (job.errors[part]) return `<p class="ai-wait bad">「${esc(what)}」${esc(job.errors[part])}<button type="button" class="secondary" data-ai-retry="${part}">重寫這一段</button></p>`;
  return job.busy.has(part) ? `<p class="ai-wait">AI 命理師正在寫：${esc(what)}…</p>` : "";
}
const toneTag = t => { const w = toneWord(t); return `<span class="ai-tone t-${w}">${w}</span>`; };
const aiStar = x => (x.fallback ? '<span class="ai-fb">＊</span>' : "");
const aiFields = (x, fields) => fields.map(f => `<p><b>${f}</b>${esc(x.fields[f])}</p>`).join("");
const yearRow = y => `<li><div class="yh"><b>${y.age} 歲</b><span>${y.year} ${esc(y.pillar)}年</span>${toneTag(y.tone)}${aiStar(y)}</div>${aiFields(y, ["好事", "要注意"])}</li>`;
const yearList = (ys, open) => `<details class="ai-years"${open ? " open" : ""}><summary>逐歲看 ${ys[0].age}–${ys[ys.length - 1].age} 歲</summary><ol>${ys.map(yearRow).join("")}</ol></details>`;

// 大運 cards, each with its years; years before the first 大運 (or before the 大運 arrive) come first.
function luckHTML(job) {
  const P = job.parts, decades = (P.decades && P.decades.items) || [];
  const years = YEAR_PARTS.flatMap(p => (P[p] && P[p].items) || []);
  const names = new Set(decades.map(d => d.name)), loose = years.filter(y => !names.has(y.decade));
  const cards = decades.map(d => {
    const ys = years.filter(y => y.decade === d.name);
    return `<article class="ai-decade${d.current ? " now" : ""}"><header><h5>${esc(d.name)}大運</h5><span class="span">虛歲 ${d.startAge}–${d.endAge}・${d.startYear}–${d.endYear}</span>${toneTag(d.tone)}${d.current ? '<span class="ai-tone t-now">目前</span>' : ""}${aiStar(d)}</header>${aiFields(d, ["重點", "好事", "要注意"])}${ys.length ? yearList(ys, d.current) : ""}</article>`;
  });
  const busyYears = YEAR_PARTS.filter(p => job.busy.has(p)).length;
  const waits = [
    aiWait(job, "decades"),
    busyYears ? `<p class="ai-wait">AI 命理師正在寫每一歲的好事和要注意的事…（還有 ${busyYears} 段）</p>` : "",
    ...YEAR_PARTS.filter(p => job.errors[p]).map(p => aiWait(job, p, `流年第 ${Number(p.slice(5)) + 1} 段`)),
  ].join("");
  if (!decades.length && !years.length && !waits) return "";
  return `<section class="ai-luck"><h4>大運與流年：每一歲的好事和要注意的事</h4>${loose.length ? `<article class="ai-decade"><header><h5>${decades.length ? "起運之前" : "每一歲"}</h5></header>${yearList(loose, true)}</article>` : ""}${cards.join("")}${waits}</section>`;
}

function coupleHTML(job) {
  const d = job.parts.myears;
  if (!d) return aiWait(job, "myears");
  if (!d.items.length) return "";
  const row = y => `<li><div class="yh"><b>${y.year} 年</b><span>${esc(y.pillar)}年</span><span>你 ${y.ages[0]} 歲</span>${toneTag(y.tones[0])}<span>對方 ${y.ages[1]} 歲</span>${toneTag(y.tones[1])}${aiStar(y)}</div>${aiFields(y, ["好事", "要注意"])}</li>`;
  return `<section class="ai-luck"><h4>接下來十年，你們的感情</h4><div class="ai-decade"><div class="ai-years"><ol>${d.items.map(row).join("")}</ol></div></div></section>`;
}

function renderAI(job) {
  aiButtons();
  if (quotaBlank(job)) { if (job === aiAutoJob) $("#ai").hidden = true; $("#ai-body").innerHTML = ""; return; }
  const P = job.parts, secs = part => (P[part] && P[part].sections) || [];
  let html;
  if (job.kind === "short") html = P.short ? aiSecs(secs("short")) : aiWait(job, "short");
  else if (job.kind === "full") {
    const b = secs("b");
    html = (P.a ? aiSecs(secs("a")) : aiWait(job, "a"))
      + (P.b ? aiSecs(b.filter(s => !AI_LAST.includes(s.title))) : aiWait(job, "b"))
      + luckHTML(job)
      + aiSecs(b.filter(s => AI_LAST.includes(s.title)));
  } else {
    const meta = (P.m1 || P.m2 || P.myears || {}).meta;
    html = (meta ? `<p class="ai-chips"><span class="tone">${esc(meta.tone)}</span>${(meta.highlights || []).map(h => `<span>${esc(h)}</span>`).join("")}</p>` : "")
      + (P.m1 ? aiSecs(secs("m1")) : aiWait(job, "m1"))
      + (P.m2 ? aiSecs(secs("m2")) : aiWait(job, "m2"))
      + coupleHTML(job);
  }
  const fb = Object.values(P).some(d => (d.items || []).some(x => x.fallback));
  $("#ai-body").innerHTML = html + (Object.keys(P).length ? `<p class="fine">${fb ? "標＊的幾項 AI 沒有寫好，改用排盤引擎的原文。" : ""}AI 依本站排盤引擎算好的命盤資料寫成，送出前已自動檢查干支、喜忌、格局、年份和歲數。內容是傳統命理的說法，供娛樂與自我觀察參考，不是預言。</p>` : "");
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
