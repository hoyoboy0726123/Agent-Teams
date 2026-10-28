// Written in the Stars: the page. Birth → the Big Three → one American life, year by year → the ending, where the
// same chart lives 99 more times (fate vs luck) and the life becomes a share card. Everything is computed in the
// browser; the site keeps no birth data. The 100 lives run in a Web Worker made from this same script (the page's
// own <script id="app">), so the page stays responsive while they run.
import { prepare } from "./sim/setup.js";
import { createLife, OWN } from "./sim/life.js";
import { rerun } from "./sim/monte.js";
import { computeChart, moonSignsOfDay, PLACES, findPlace } from "./astro/index.js";
import { COUNTIES, EDU_WORDS } from "./sim/world.js";
import { makeRng } from "./sim/rng.js";
import { randomName } from "./sim/random-name.js";
import { safetyCheck, matchIntent } from "./sim/intent.js";
import { ACTIONS } from "./sim/actions.js";
import { initPixels, startScene, showStep, collectStep, openStory, closeStory } from "./ui/pixel-app.js";
import { drawKline, klineTable } from "./ui/kline.js";
import { drawShareCard, cardBlob } from "./ui/share.js";
import { natalReading } from "./astro/reading.js";
import { readingHTML } from "./ui/reading-view.js";
import { initStats, track, trackOnce, sendLife, heartbeat, liveUrl } from "./ui/stats.js";
import {
  GLYPH, ELEMENT, SIGN_WORDS, ROLE_HINT, profectionText, verdictOf, hundredFacts, hundredLine, labelOf,
  dateText, timeText, decadeOf, ordinal, HOUSE_TOPIC, planetName,
} from "./ui/words.js";

// ---------- the 100 lives, in a worker ----------
// The key fixes the 100 seeds, so the same chart always lives the same 100 lives.
const chartKey = input => `${input.date.y}-${input.date.m}-${input.date.d}|${input.time ? `${input.time.h}:${input.time.mi}` : "?"}|${input.place.name},${input.place.state}|${input.sex}`;
function hundredLives({ input, name }) {
  const prep = prepare(input, { name });
  return rerun({ prep, runs: 100, key: chartKey(input) });
}
let worker = null, workerOff = false, asks = 0;
const waiting = new Map();
function askHundred(input, name) {
  const id = ++asks;
  return new Promise(resolve => {
    const local = () => setTimeout(() => { try { resolve(hundredLives({ input, name })); } catch (e) { console.error(e); resolve(null); } }, 30);
    if (!workerOff && !worker) {
      try {
        const code = document.getElementById("app").textContent;
        worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
        worker.onmessage = e => { const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); w(e.data.summary || null); } };
        worker.onerror = () => { workerOff = true; worker = null; for (const [k, w] of waiting) { waiting.delete(k); w(undefined); } };
      } catch { workerOff = true; worker = null; }
    }
    if (!worker) return local();
    waiting.set(id, s => (s === undefined ? local() : resolve(s)));
    worker.postMessage({ id, input, name });
  });
}

// ---------- the page ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SPEED_MS = { 1: 1100, 3: 380, 10: 90 };
const SITE = () => (/^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname) ? location.host : "written-in-the-stars.mingpan.workers.dev");
const ICON = {
  sun: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.2A7 7 0 0 1 15.5 3.5Z" fill="currentColor"/></svg>`,
  rising: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18M12 15V5M8 9l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

let run = null;   // { input, name, prep, life, seed, summary, label, card }
let timer = null, speed = 1, paused = false, leanNoted = false, recap = [];
const luckAt = age => run.prep.luck[Math.max(0, Math.min(run.prep.luck.length - 1, age))];
const RECAP_IDS = new Set(["baby", "dating", "realPartnerMeet", "breakup"]);
const recapWorthy = e => (e.big || RECAP_IDS.has(e.id)) && e.id !== "birth" && e.id !== "death" && !e.free && !(e.asked && !e.picked);

function start() {
  initStats("life");
  initTheme();
  fillPlaces();
  initPixels();
  show("welcome");
  for (const b of document.querySelectorAll("[data-start]")) b.addEventListener("click", () => openSetup());
  for (const b of document.querySelectorAll("[data-random]")) b.addEventListener("click", startRandom);
  $("#home-link").addEventListener("click", e => { e.preventDefault(); goHome(); });
  $("#setup-back").addEventListener("click", goHome);
  const form = $("#form");
  for (const type of ["input", "change"]) form.addEventListener(type, () => updateBigThree());
  $("#f-unknown").addEventListener("change", () => { $("#f-time").disabled = $("#f-unknown").checked; updateBigThree(); });
  form.addEventListener("submit", e => { e.preventDefault(); startFromForm(); });
  $("#c-pause").addEventListener("click", () => { paused = !paused; $("#c-pause").textContent = paused ? "Play" : "Pause"; $("#c-pause").setAttribute("aria-pressed", String(paused)); if (!paused) schedule(); });
  for (const b of document.querySelectorAll("[data-speed]")) b.addEventListener("click", () => {
    speed = Number(b.dataset.speed);
    for (const x of document.querySelectorAll("[data-speed]")) x.setAttribute("aria-pressed", String(x === b));
    if (!paused) schedule();
  });
  try { $("#c-major").checked = localStorage.getItem("wits.majorOnly") === "1"; } catch {}
  $("#c-major").addEventListener("change", () => {
    try { localStorage.setItem("wits.majorOnly", $("#c-major").checked ? "1" : "0"); } catch {}
    if (run) run.life.setMajorOnly($("#c-major").checked);
  });
  $("#c-skip").addEventListener("click", skipToEnd);
  $("#s-prof").addEventListener("click", () => { const open = $("#s-prof-more").hidden; $("#s-prof-more").hidden = !open; $("#s-prof").setAttribute("aria-expanded", String(open)); });
  $("#choice").addEventListener("click", e => {
    const b = e.target.closest("[data-option]");
    if (b) return choose(Number(b.dataset.option));
    const pick = e.target.closest("[data-free-action]");
    if (pick) return applyFree(pick.dataset.freeAction, pick.dataset.summary);
    if (e.target.closest("[data-free-cancel]")) { $("#free-out").innerHTML = ""; $("#free-text").focus(); }
  });
  $("#choice").addEventListener("submit", e => { e.preventDefault(); const t = $("#free-text"); if (t && t.value.trim()) interpretFree(t.value.trim()); });
  $("#again-same").addEventListener("click", () => { track("again"); begin(run.input, { name: run.name, born: run.born, random: run.random }); });
  $("#again-new").addEventListener("click", () => { stop(); openSetup(); });
  $("#share-png").addEventListener("click", downloadCard);
  $("#share-native").addEventListener("click", shareCard);
  $("#share-native").hidden = !(navigator.share && navigator.canShare);
  $("#ai-btn").addEventListener("click", aiReport);
  addEventListener("resize", () => { if (run && run.life.done && !$("#end").hidden) redrawChart(); });
  initWelcome();
}

// One screen at a time: welcome, setup (the form), play, end.
function show(screen) {
  for (const id of ["welcome", "setup", "play", "end"]) $(`#${id}`).hidden = id !== screen;
  document.body.dataset.screen = screen;
  if (screen === "welcome") refreshLive();
}
function goHome() { stop(); closeStory(false); show("welcome"); scrollTo({ top: 0 }); $("#welcome h1").focus({ preventScroll: true }); }
function openSetup() {
  closeStory(false);
  show("setup");
  scrollTo({ top: 0 });
  trackOnce("form");
  updateBigThree();
  $("#setup h2").focus({ preventScroll: true });
}

// ---------- theme ----------
function initTheme() {
  const btn = $("#theme"), root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem("wits.theme"); } catch {}
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;
  const current = () => root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const label = () => { const dark = current() === "dark"; btn.setAttribute("aria-pressed", String(dark)); btn.querySelector("span").textContent = dark ? "Light" : "Dark"; btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode"); };
  label();
  btn.addEventListener("click", () => {
    root.dataset.theme = current() === "dark" ? "light" : "dark";
    try { localStorage.setItem("wits.theme", root.dataset.theme); } catch {}
    label();
    if (run && run.life.done && !$("#end").hidden) redrawChart();
  });
}

// ---------- the form and the Big Three ----------
function fillPlaces() {
  $("#f-place").innerHTML = `<option value="">Choose a city</option>` + PLACES.map(g => `<optgroup label="${esc(g.stateName)}">${g.places.map(p => `<option value="${esc(`${p.state}|${p.name}`)}">${esc(p.name)}, ${esc(p.state)}</option>`).join("")}</optgroup>`).join("");
}
const placeOf = v => { const [st, name] = String(v || "").split("|"); return name ? findPlace(name, st) : null; };

// What the form holds: { date, time, unknown, place, sex, name } with nulls where a field is empty or invalid.
function readForm() {
  const [y, m, d] = ($("#f-date").value || "").split("-").map(Number);
  const date = y >= 1950 && y <= 2025 && m && d ? { y, m, d } : null;
  const unknown = $("#f-unknown").checked;
  const [h, mi] = ($("#f-time").value || "").split(":").map(Number);
  const time = !unknown && Number.isFinite(h) && Number.isFinite(mi) && $("#f-time").value ? { h, mi } : null;
  const sexEl = document.querySelector('input[name="sex"]:checked');
  return { date, rawYear: y || null, unknown, time, place: placeOf($("#f-place").value), sex: sexEl ? sexEl.value : null, name: $("#f-name").value.replace(/\s+/g, " ").trim().slice(0, 40) };
}

// The Big Three for a birth: { sun, moon, moons (one or two signs when the time is unknown), rising }.
function bigThreeOf({ date, time, place }) {
  const where = place || findPlace("Kansas City", "MO");
  const chart = computeChart({ date, time: time || null, place: where });
  const b = chart.bigThree;
  const moons = time ? [b.moon] : moonSignsOfDay(date, where.tz);
  return { sun: b.sun, moon: place || time ? b.moon : null, moons: place ? moons : null, rising: time && place ? b.rising : null };
}

let shownBig = "";
function updateBigThree() {
  const f = readForm(), box = $("#bigthree");
  let big = null;
  if (f.date) { try { big = bigThreeOf({ date: f.date, time: f.time, place: f.place }); } catch (e) { console.error(e); } }
  const set = (role, sign, extra = "") => {
    const el = box.querySelector(`[data-role="${role}"]`);
    el.classList.toggle("on", !!sign);
    el.querySelector(".bt-sign").textContent = sign ? extra || sign : "?";
    el.querySelector(".bt-glyph").textContent = sign ? GLYPH[sign] || "" : "";
    el.querySelector(".bt-words").textContent = sign ? SIGN_WORDS[sign] : ROLE_HINT[role];
  };
  const moonSign = big && (big.moons && big.moons.length > 1 ? big.moons[0] : big.moon);
  set("sun", big && big.sun);
  set("moon", moonSign, big && big.moons && big.moons.length > 1 ? big.moons.join(" or ") : "");
  set("rising", big && big.rising);
  let note;
  if (!f.date) note = f.rawYear && (f.rawYear < 1950 || f.rawYear > 2025) ? "Pick a birth year from 1950 to 2025." : "Enter your birth date to reveal your Big Three.";
  else if (!f.place) note = "Now pick where you were born for your Moon and Rising.";
  else if (f.unknown) note = big && big.moons && big.moons.length > 1 ? "Without a birth time there is no Rising sign, and the Moon changed signs that day." : "Without a birth time there is no Rising sign. Your years will be counted from your Sun.";
  else if (!f.time) note = "Add your birth time for your Rising sign, or tick “I don't know my birth time”.";
  else note = `${big.sun} Sun, ${moonSign} Moon, ${big.rising} Rising. That's you.`;
  $("#bt-note").textContent = note;
  const key = big ? `${big.sun}|${moonSign}|${big.rising}` : "";
  box.classList.toggle("ready", !!(big && big.sun));
  if (key && key !== shownBig) { box.classList.remove("pop"); void box.offsetWidth; box.classList.add("pop"); }
  shownBig = key;
}

function showError(text) { const e = $("#error"); e.textContent = text; e.hidden = !text; }
function startFromForm() {
  const f = readForm();
  if (!f.date) { showError(f.rawYear ? "Pick a birth date from 1950 to 2025." : "Enter your birth date."); return $("#f-date").focus(); }
  if (!f.unknown && !f.time) { showError("Enter your birth time, or tick “I don't know my birth time”."); return $("#f-time").focus(); }
  if (!f.place) { showError("Pick the city you were born in (or the closest one)."); return $("#f-place").focus(); }
  if (!f.sex) { showError("Pick female or male. The US life tables differ by sex."); return document.querySelector('input[name="sex"]').focus(); }
  showError("");
  begin({ date: f.date, time: f.unknown ? null : f.time, place: f.place, sex: f.sex }, { name: f.name });
}

function startRandom() {
  const rng = makeRng(crypto.getRandomValues(new Uint32Array(1))[0]);
  const y = 1950 + rng.int(76), m = 1 + rng.int(12), d = 1 + rng.int(new Date(Date.UTC(y, m, 0)).getUTCDate());
  const state = rng.weighted(COUNTIES), group = PLACES.find(g => g.stateName === state) || PLACES[0];
  const place = rng() < 0.6 ? group.places[0] : rng.pick(group.places);
  const sex = rng() < 0.5 ? "male" : "female";
  const time = { h: rng.int(24), mi: rng.int(60) };
  const name = randomName(rng, y, sex);
  track("random");
  begin({ date: { y, m, d }, time, place, sex }, { name, random: true, born: `The stars dealt you a random birth: ${name}, born ${dateText({ y, m, d })} at ${timeText(time)} in ${place.name}, ${place.state}.` });
}

// ---------- playing ----------
function begin(input, { name = "", born = "", random = false } = {}) {
  stop();
  let prep;
  try { prep = prepare(input, { name }); } catch (e) { console.error(e); showError("We couldn't cast a chart for that birth. Check the date, time and place."); show("setup"); return; }
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  run = { input, name, born, random, prep, seed, summary: null, life: createLife({ prep, seed, majorOnly: $("#c-major").checked }) };
  run.hundred = askHundred(input, name);   // starts at once, in the worker, while the life is played
  const big = prep.chart.bigThree;
  $("#who").innerHTML = `${name ? `<b>${esc(name)}</b> · ` : ""}${esc(dateText(input.date))}, ${esc(timeText(input.time))} · ${esc(input.place.name)}, ${esc(input.place.state)}`;
  $("#who-big").innerHTML = bigChips(big, input.time ? null : moonSignsOfDay(input.date, input.place.tz));
  $("#born").textContent = born;
  $("#born").hidden = !born;
  $("#feed").innerHTML = ""; $("#choice").hidden = true; recap = []; leanNoted = false;
  startScene(seed, run.life.state, luckAt);
  show("play");
  track("start");
  heartbeat(() => !!run && !run.life.done && !$("#play").hidden);
  paused = false; $("#c-pause").textContent = "Pause"; $("#c-pause").setAttribute("aria-pressed", "false");
  updateStatus();
  $("#play-log").scrollTop = 0;
  scrollTo({ top: 0 });
  schedule();
}

function bigChips(big, moons = null) {
  const moon = moons && moons.length > 1 ? moons.join(" or ") : big.moon;
  return [["sun", big.sun, big.sun], ["moon", big.moon, moon], ["rising", big.rising, big.rising || "unknown"]]
    .map(([role, sign, text]) => `<span class="chip ${role}" title="${esc(`${role === "sun" ? "Sun" : role === "moon" ? "Moon" : "Rising"}: ${sign ? SIGN_WORDS[sign] : "needs a birth time"}`)}">${ICON[role]}<span class="sr">${role === "sun" ? "Sun" : role === "moon" ? "Moon" : "Rising"}:</span> ${esc(text)}</span>`).join("");
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
  showStep(life.state, luckAt, entries);
  if (life.pending) return showChoice();
  if (life.done) return finish();
  schedule();
}

function afterAnswer(entries) {
  $("#choice").hidden = true; recap = [];
  render(entries, { focus: true });
  updateStatus();
  showStep(run.life.state, luckAt, entries);
  if (run.life.pending) return showChoice();
  if (run.life.done) return finish();
  schedule();
}
function choose(i) { afterAnswer(run.life.choose(i)); }

function skipToEnd() {
  stop();
  const life = run.life, all = [];
  let guard = 0;
  while (!life.done && guard++ < 5000) {
    const entries = life.pending ? life.autoChoose() : life.step();
    collectStep(life.state, luckAt, entries);
    all.push(...entries);
  }
  $("#choice").hidden = true;
  track("skip");
  render(all);
  showStep(life.state, luckAt, []);
  finish();
}

// One line of the story: what happened, what you chose, and the chart's reason when the year had one.
function lineOf(e, seen) {
  const why = e.reason && e.reasonFrom === "chart" && !seen.has(e.reason) ? (seen.add(e.reason), `<span class="why"><span aria-hidden="true">✦ </span><span class="sr">In your chart: </span>${esc(e.reason)}</span>`) : "";
  const chose = e.choice ? `<span class="chose">${e.free ? "Your own words" : e.picked ? "True to your nature" : "You chose"}: ${esc(e.choice)}</span>` : "";
  return `<p class="${e.big ? "big" : ""}">${esc(e.text)}</p>${chose}${why}`;
}

// `focus`: right after a choice, what it led to is scrolled to the top and takes the focus.
function render(entries, { focus = false } = {}) {
  if (!entries.length) return;
  const feed = $("#feed");
  for (const e of entries) {
    let li = feed.lastElementChild;
    if (!li || Number(li.dataset.age) !== e.age) {
      li = document.createElement("li");
      li.dataset.age = e.age;
      li.innerHTML = `<span class="when"><span class="sr">Age </span>${e.age}<small>${e.year}</small></span><div class="lines"></div>`;
      li._seen = new Set();
      feed.appendChild(li);
    }
    li.querySelector(".lines").insertAdjacentHTML("beforeend", lineOf(e, li._seen || (li._seen = new Set())));
    if (recapWorthy(e)) recap.push(e);
  }
  const lastLi = feed.lastElementChild;
  if (!lastLi || $("#play").hidden) return;
  if (focus) {
    // The first new line after the choice.
    const target = feed.querySelector(`li[data-age="${entries[0].age}"]`) || lastLi;
    target.tabIndex = -1; reveal(target, "start"); target.focus({ preventScroll: true });
  } else reveal(lastLi, "end", speed === 10 ? "auto" : "smooth");
}

// Brings a line or the choice box into view in the story's own scroll box (#play-log), which keeps the scene above it
// on screen; on a short window, where the page scrolls instead, in the page.
function reveal(el, where, behavior = "smooth") {
  const log = $("#play-log");
  if (getComputedStyle(log).overflowY !== "auto") {
    const r = el.getBoundingClientRect();
    if (where === "start" || (where === "fit" && r.height > innerHeight - 24)) el.scrollIntoView({ block: "start", behavior });
    else if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: where === "fit" ? "end" : "nearest", behavior });
    return;
  }
  const pad = 8, top = el.offsetTop - pad, bottom = el.offsetTop + el.offsetHeight - log.clientHeight + pad;
  const to = where === "start" || (where === "fit" && el.offsetHeight > log.clientHeight - 2 * pad) ? top : Math.max(log.scrollTop, bottom);
  if (Math.abs(to - log.scrollTop) > 1) log.scrollTo({ top: to, behavior });
}

function updateStatus() {
  const s = run.life.state, l = luckAt(s.age), pr = l && l.profection ? profectionText(l.profection, !!run.input.time) : null;
  $("#s-age").textContent = `Age ${s.age}`;
  $("#s-year").textContent = String(s.year);
  const pill = $("#s-prof");
  pill.hidden = !pr;
  if (pr) {
    pill.querySelector("b").textContent = `${ordinal(l.profection.house)} house`;
    pill.querySelector(".topic").textContent = HOUSE_TOPIC[l.profection.house];
    pill.querySelector(".lord").textContent = `Lord of the year: ${planetName(l.profection.lord)}`;
    pill.title = pr.long;
    $("#s-prof-more").textContent = pr.long;
  }
  const mood = Math.round(Math.max(0, Math.min(100, s.happiness)));
  $("#s-mood").style.width = `${mood}%`;
  $("#mood").setAttribute("aria-valuenow", String(mood));
  $("#mood").setAttribute("aria-valuetext", `${mood} out of 100`);
}

function showChoice() {
  stop();
  const p = run.life.pending, box = $("#choice");
  const why = p.why && p.why.text ? `<p class="why"><span aria-hidden="true">✦ </span><span class="sr">In your chart: </span>${esc(p.why.text)}</p>` : "";
  const sunSign = run.prep.chart.bigThree.sun;
  const leanNote = p.lean >= 0 && !leanNoted ? `<p class="lean-note">“Feels like you” marks the option your chart's personality (a ${esc(sunSign)} Sun, among the rest) and your past choices lean toward. Any choice is fine.</p>` : "";
  if (p.lean >= 0) leanNoted = true;
  const since = recap.slice(-3);
  const recapBox = since.length ? `<div class="recap"><p>Since your last choice</p><ul>${since.map(e => `<li><b>Age ${e.age}</b> ${esc(e.text)}</li>`).join("")}</ul></div>` : "";
  box.innerHTML = `${recapBox}<p class="q" id="q-text">${esc(p.prompt)}</p>${why}<div class="options" role="group" aria-labelledby="q-text">${p.options.map((o, i) => `<button type="button" data-option="${i}"><b>${esc(o.label)}</b>${o.hint ? `<small>${esc(o.hint)}</small>` : ""}${o.lean ? `<span class="lean">Feels like you</span>` : ""}</button>`).join("")}</div>${leanNote}`
    + (p.free ? `<form class="free" autocomplete="off">
      <label for="free-text">Or write your own decision</label>
      <div class="free-row"><input type="text" id="free-text" maxlength="120" placeholder="e.g. ask my parents for advice" enterkeyhint="go"><button type="submit" id="free-go">Do this</button></div>
      <p class="fine">Read on this device only. Nothing you write is sent anywhere.</p>
      <div class="free-out" id="free-out" aria-live="polite"></div>
    </form>` : "");
  box.hidden = false;
  reveal(box, "fit");
  box.querySelector("button").focus({ preventScroll: true });
}

const freeOut = html => { const out = $("#free-out"); if (out) out.innerHTML = html; };
const HELP = `<div class="help" role="alert"><p><b>It sounds like things might be really hard right now.</b> This game won't play that out, but you don't have to go through it alone.</p><p>Call or text <a href="tel:988">988</a> (the Suicide &amp; Crisis Lifeline, any time), or chat at <a href="https://988lifeline.org" target="_blank" rel="noopener">988lifeline.org</a>. If you're in danger right now, call <a href="tel:911">911</a>.</p><p>In the story, could you choose something else?</p></div>`;

// What the player wrote → an action, read here on the device. Safety words first (never simulated), then the closest
// guesses for the player to pick. Nothing applies until the player confirms.
function interpretFree(text) {
  const p = run.life.pending;
  if (!p || !p.free) return;
  const safety = safetyCheck(text);
  if (safety === "self_harm") { track("help"); return freeOut(HELP); }
  if (safety === "harm") return freeOut(`<p>This game won't play out hurting someone or breaking the law. Try another choice?</p>`);
  const picks = [];
  for (const r of matchIntent(text)) {
    const own = p.options.find(o => o.id && o.act === r.id);
    const id = own ? own.id : r.id;
    if (!picks.some(x => x.id === id)) picks.push({ id, label: own ? own.label : ACTIONS[r.id].label });
    if (picks.length === 3) break;
  }
  const summary = `You decided to “${text.replace(/[.!]+$/, "")}”`;
  const ownBtn = `<button type="button" class="own" data-free-action="${OWN}" data-summary="${esc(summary)}">Keep it as I wrote it</button>`;
  trackOnce("written");
  if (!picks.length) return freeOut(`<p>Not sure where that leads. Try other words, or keep it as you wrote it.</p><div class="suggest">${ownBtn}<button type="button" class="plain" data-free-cancel>Edit</button></div>`);
  freeOut(`<p>Which is closest to what you mean?</p><div class="suggest">${picks.map(x => `<button type="button" data-free-action="${esc(x.id)}" data-summary="${esc(summary)}">${esc(x.label)}</button>`).join("")}${ownBtn}<button type="button" class="plain" data-free-cancel>Edit</button></div><p class="fine">“Keep it as I wrote it” puts your words in the story as they are, without any option's consequences.</p>`);
}

function applyFree(action, summary) {
  const r = run.life.chooseAction({ action, summary });
  if (r.infeasible) return freeOut(`<p>That can't happen right now: ${esc(r.infeasible)}</p>`);
  afterAnswer(r.entries);
}

// ---------- the ending ----------
const EDU_SHORT = { none: "No schooling", elementary: "Elementary school", middle: "Middle school", high: "High school diploma", ged: "GED", certificate: "Trade certificate", associate: "Associate degree", bachelor: "Bachelor's degree", master: "Master's degree", professional: "Professional degree", doctorate: "Doctorate" };
function finish() {
  stop();
  const { life, prep, input } = run, s = life.state;
  updateStatus();
  const peak = life.kline.reduce((a, b) => (b.close > a.close ? b : a), life.kline[0]);
  const low = life.kline.reduce((a, b) => (b.close < a.close ? b : a), life.kline[0]);
  run.label = labelOf({ s, kline: life.kline, log: life.log });
  $("#end-title").textContent = `You lived to ${s.age}.`;
  $("#end-label").textContent = `${run.label.title}. ${run.label.line}`;
  $("#end-big").innerHTML = bigChips(prep.chart.bigThree, input.time ? null : moonSignsOfDay(input.date, input.place.tz));
  const jobs = s.jobsHeld || [];
  const facts = [
    ...(run.name ? [["Name", run.name]] : []),
    ["Born", `${dateText(input.date)} in ${input.place.name}, ${input.place.state}`],
    ["School", EDU_SHORT[s.edu] || EDU_WORDS[s.edu] || s.edu],
    ["Work", s.retired ? `Retired${s.job ? `, last as ${s.job.title}` : ""}` : s.job ? s.job.title : jobs.length ? `Last job: ${jobs[jobs.length - 1].title}` : "No steady job"],
    ["Love", s.marriages ? `${s.marriages === 1 ? "Married once" : `Married ${s.marriages} times`}${s.divorces ? `, divorced ${s.divorces === 1 ? "once" : `${s.divorces} times`}` : ""}` : "Never married"],
    ["Kids", s.kids.length ? `${s.kids.length} ${s.kids.length === 1 ? "kid" : "kids"}` : "No kids"],
    ["Home", s.home === "own" ? "Owned a home" : s.flags.ownedBefore ? "Owned, then rented" : "Rented"],
    ["Best year", `Age ${peak.age} (${peak.year})`],
    ["Hardest year", `Age ${low.age} (${low.year})`],
    ...(s.written ? [["Your own words", `${s.written} ${s.written === 1 ? "decision" : "decisions"}`]] : []),
  ];
  $("#end-facts").innerHTML = facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  trackOnce("end");
  sendLife({ decade: decadeOf(input.date.y), sun: prep.chart.bigThree.sun, age: s.age, married: s.marriages, home: s.home === "own", kids: s.kids.length });
  show("end");
  $("#kline-table").innerHTML = klineTable(life, luckAt, !!input.time);
  drawMoments();
  drawReading();
  $("#ai-msg").innerHTML = "";
  $("#hundred").classList.add("loading");
  $("#cards").innerHTML = `<p class="wait" role="status">Living it 99 more times…</p>`;
  $("#fate-head").innerHTML = "";
  $("#share-box").classList.add("loading");
  redrawChart();
  scrollTo({ top: 0 });
  const mine = run;
  run.hundred.then(summary => {
    if (run !== mine) return;
    mine.summary = summary;
    $("#hundred").classList.remove("loading");
    if (!summary) { $("#cards").innerHTML = `<p class="wait">The 100 lives couldn't be run on this device.</p>`; return; }
    drawCards();
    redrawChart();
    drawShare();
  });
  openStory(s, luckAt, () => { scrollTo({ top: 0 }); $("#end-title").focus({ preventScroll: true }); });
}

function redrawChart() {
  if (!run) return;
  drawKline($("#plot"), { life: run.life, band: run.summary ? run.summary.band : [], luckAt, timeKnown: !!run.input.time });
}

function drawCards() {
  const r = run.summary, s = run.life.state, runs = r.runs;
  const facts = hundredFacts(r, s), by = Object.fromEntries(facts.map(f => [f.key, f]));
  const fate = facts.filter(f => verdictOf(f.n, runs).key === "fate"), luck = facts.filter(f => verdictOf(f.n, runs).key === "luck");
  const say = f => (f.n >= 50 ? f.yes : f.no);
  const cnt = f => (f.n >= 50 ? f.n : runs - f.n);
  $("#fate-head").innerHTML = `<div class="fate-col fate"><h3>Written in the stars</h3><p class="fine">Happened in almost every life (or almost none).</p>${fate.length ? `<ul>${fate.map(f => `<li><b>${cnt(f)}/100</b> ${esc(say(f))}</li>`).join("")}</ul>` : `<p>Nothing was that certain. This chart leaves a lot to chance.</p>`}</div>`
    + `<div class="fate-col luck"><h3>Just luck</h3><p class="fine">A coin flip: some lives did, some didn't.</p>${luck.length ? `<ul>${luck.map(f => `<li><b>${f.n}/100</b> ${esc(f.yes)}</li>`).join("")}</ul>` : `<p>No coin flips here. This chart's big moves are fairly settled.</p>`}</div>`;
  const tag = n => { const v = verdictOf(n, runs); return `<span class="verdict ${v.key}">${esc(v.word)}</span>`; };
  const thisLife = (did, yes, no) => `<p class="this">This life: <b>${did ? yes : no}</b></p>`;
  const max = Math.max(...r.lifespan.bins.map(b => b.n), 1);
  const bins = r.lifespan.bins.filter(b => b.from >= 40 || b.n > 0);
  const hist = `<div class="hist" role="img" aria-label="How long the 100 lives lasted: ${bins.filter(b => b.n).map(b => `${b.n} ended at ${b.from} to ${b.to}`).join(", ")}">${bins.map(b => `<i class="${s.age >= b.from && s.age <= b.to ? "me" : ""}" style="height:${Math.max(2, Math.round(b.n / max * 64))}px"></i>`).join("")}</div><div class="hist-axis"><span>${bins[0].from}</span><span>${bins[bins.length - 1].to}</span></div>`;
  const kidsLine = `None in ${r.kids[0].runs}, one in ${r.kids[1].runs}, two in ${r.kids[2].runs}, three or more in ${r.kids[3].runs}.`;
  const cards = [
    `<article class="card"><h3>Lifespan</h3><p class="count">Half of your lives ended between <em>${r.lifespan.p25} and ${r.lifespan.p75}</em></p>${hist}
      <p>Median ${r.lifespan.median}. ${r.lifespan.over90} made it past 90; ${r.lifespan.under60} ended before 60.</p>${thisLife(true, `${s.age}, highlighted above`, "")}
      <p class="fine">Built on US life tables (SSA); the chart only tilts the odds. If this stirs up anything heavy, you can call or text <a href="tel:988">988</a> any time.</p></article>`,
    `<article class="card"><h3>Marriage</h3>${tag(r.married)}<p class="count"><em>${r.married} of 100</em> lives got married</p>
      <p>${r.divorced} of them divorced at least once.</p>${thisLife(s.marriages > 0, s.marriages > 1 ? `married ${s.marriages} times` : "married", "never married")}</article>`,
    `<article class="card"><h3>Kids</h3>${tag(by.kids.n)}<p class="count"><em>${by.kids.n} of 100</em> lives had kids</p>
      <p>${kidsLine}</p>${thisLife(s.kids.length > 0, `${s.kids.length} ${s.kids.length === 1 ? "kid" : "kids"}`, "no kids")}</article>`,
    `<article class="card"><h3>Home</h3>${tag(r.homeOwner)}<p class="count"><em>${r.homeOwner} of 100</em> lives owned a home at the end</p>
      ${thisLife(s.home === "own", "owned a home", "rented")}</article>`,
    `<article class="card"><h3>School and career</h3>${tag(r.college)}<p class="count"><em>${r.college} of 100</em> lives finished a four-year degree</p>
      <p>${r.served ? `${r.served} served in the military. ` : ""}${r.abroad ? `${r.abroad} lived abroad for a while.` : ""}</p>${thisLife(by.college.did, EDU_SHORT[s.edu] || s.edu, EDU_SHORT[s.edu] || "no degree")}${hurdleLine(r.hurdles.find(h => h.domain === "career"))}</article>`,
  ];
  $("#cards").innerHTML = cards.join("");
}
function hurdleLine(h) {
  if (!h || !h.years.length) return "";
  const y = h.years[0];
  return `<p class="fine">Toughest career year on the chart: age ${y.age}${y.reason ? ` (${esc(y.reason.replace(/\.$/, ""))})` : ""}. ${y.hits} of 100 lives hit a setback around then.</p>`;
}

// The astrology of this life: the Big Three, then its turning points in the sky (Saturn returns, the Uranus
// opposition) and its strongest and hardest profection years, each with what happened that year.
function drawMoments() {
  const { prep, life, input } = run, s = life.state, b = prep.chart.bigThree;
  const moons = input.time ? null : moonSignsOfDay(input.date, input.place.tz);
  $("#end-bt").innerHTML = [["sun", b.sun], ["moon", b.moon], ["rising", b.rising]].map(([role, sign]) => `<div class="bt${sign ? " on" : ""}"><span class="bt-icon">${ICON[role]}</span><span class="bt-role">${role === "sun" ? "Sun" : role === "moon" ? "Moon" : "Rising"}</span><span class="bt-glyph" aria-hidden="true">${sign ? GLYPH[sign] : ""}</span><b class="bt-sign">${sign ? esc(role === "moon" && moons && moons.length > 1 ? moons.join(" or ") : sign) : "Unknown"}</b><small class="bt-words">${esc(sign ? SIGN_WORDS[sign] : "needs a birth time")}</small></div>`).join("");
  const lived = prep.luck.filter(l => l.age > 0 && l.age <= s.age);
  const moments = [];
  for (const l of lived) {
    const sky = (l.facts || []).filter(f => /Saturn return|Uranus opposition/.test(f));
    if (sky.length) moments.push({ age: l.age, title: sky[0].replace(/^(\w)/, c => c.toUpperCase()), text: (l.reasons.find(r => /Saturn return|Uranus/.test(r.text)) || l.reasons[0] || {}).text || "" });
  }
  const best = lived.slice().sort((a, b2) => b2.score - a.score).slice(0, 2), worst = lived.slice().sort((a, b2) => a.score - b2.score).slice(0, 2);
  for (const l of best) moments.push({ age: l.age, title: `A bright year · ${ordinal(l.profection.house)} house`, text: (l.reasons[0] || {}).text || "", tone: "good" });
  for (const l of worst) moments.push({ age: l.age, title: `A heavy year · ${ordinal(l.profection.house)} house`, text: (l.reasons[0] || {}).text || "", tone: "bad" });
  // One entry per age and per sky event (a Saturn return can span two birthdays), at most eight.
  const seen = new Set(), titles = new Set();
  const list = moments.filter(m => !seen.has(m.age) && !titles.has(m.title) && seen.add(m.age) && (m.tone || titles.add(m.title))).slice(0, 8).sort((a, b2) => a.age - b2.age);
  const happened = age => { const e = life.log.find(x => x.age === age && x.big && x.id !== "birth") || life.log.find(x => x.age === age && x.id !== "birth"); return e ? e.text : ""; };
  $("#moments").innerHTML = list.length ? list.map(m => `<li class="${m.tone || "sky"}"><span class="m-age">${m.age}<small>${input.date.y + m.age}</small></span><div><b>${esc(m.title)}</b>${m.text ? `<p>${esc(m.text)}</p>` : ""}${happened(m.age) ? `<p class="m-life"><span class="sr">In this life: </span>${esc(happened(m.age))}</p>` : ""}</div></li>`).join("") : `<li><div><p>This life was short, before the big cycles came round.</p></div></li>`;
}

// ---------- the natal reading and the AI report ----------
// The full reading of the real birth chart (src/astro/reading.js), with pointers into the life just lived. The outlook
// for the next ten years is shown for a birth the player typed in (not a random one), from today's date.
function drawReading() {
  const { prep, life, input } = run;
  try {
    const moons = input.time ? null : moonSignsOfDay(input.date, input.place.tz);
    const reading = natalReading(prep.chart, { life: { log: life.log, age: life.state.age }, own: !run.random, today: Date.now(), ...(moons ? { moons } : {}) });
    $("#reading-lede").textContent = reading.lede;
    $("#reading-body").innerHTML = readingHTML(reading, prep.chart);
    $("#reading").hidden = false;
  } catch (e) { console.error(e); $("#reading").hidden = true; }
}
// The AI report is not open yet: the button is real, the click is counted (ai_report each time, ai_report_u once per
// page load; worker/stats.js), and the player is told it is coming. Nothing about the chart is sent.
function aiReport() {
  $("#ai-msg").innerHTML = "<b>Coming soon!</b> We're putting the finishing touches on AI reports. Your full chart reading above is ready now.";
  trackOnce("ai_report");
}

// ---------- the share card ----------
function cardData() {
  const { life, prep, summary, label } = run, b = prep.chart.bigThree;
  return { age: life.state.age, title: label.title, line: label.line, hundred: summary ? hundredLine(summary, life.state) : null, big: { sun: b.sun, moon: b.moon, rising: b.rising }, closes: life.kline.map(k => k.close), url: SITE(), seed: run.seed };
}
async function drawShare() {
  const canvas = document.createElement("canvas");
  try { if (document.fonts && document.fonts.load) await Promise.race([document.fonts.load('600 64px "Fraunces"'), new Promise(r => setTimeout(r, 1500))]); } catch {}
  drawShareCard(canvas, cardData());
  run.card = canvas;
  const img = $("#share-img");
  img.src = canvas.toDataURL("image/png");
  const d = cardData();
  img.alt = `Share card: I lived to ${d.age}. ${d.title}. ${d.hundred ? `In ${d.hundred.n} of my 100 lives, I ${d.hundred.text}.` : ""} Sun ${d.big.sun}, Moon ${d.big.moon}, Rising ${d.big.rising || "unknown"}.`;
  $("#share-box").classList.remove("loading");
}
const fileName = () => `written-in-the-stars-${run.life.state.age}.png`;
async function downloadCard() {
  if (!run || !run.card) return;
  const blob = await cardBlob(run.card);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = fileName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  track("share_png");
}
async function shareCard() {
  if (!run || !run.card) return;
  const blob = await cardBlob(run.card), file = new File([blob], fileName(), { type: "image/png" });
  const text = `I lived to ${run.life.state.age} as ${run.label.title}. Is your life written in the stars, or just luck?`;
  const data = navigator.canShare && navigator.canShare({ files: [file] }) ? { files: [file], text } : { text, url: `https://${SITE()}` };
  try { await navigator.share(data); track("share_native"); } catch {}
}

// ---------- welcome: live numbers ----------
// /api/live (worker/stats.js) gives what there is enough of: the total always; playing now and today's count from 50
// lives; today's averages from 20 lives today; the last few lives from 3. Each block shows only when its numbers came.
const n0 = n => Number(n || 0).toLocaleString("en-US");
let liveTimer = null;
function initWelcome() { refreshLive(); }
function refreshLive() {
  clearInterval(liveTimer);
  const url = liveUrl();
  if (!url) return;
  const tick = async () => {
    if ($("#welcome").hidden || document.visibilityState === "hidden") return;
    try { const r = await fetch(url, { cache: "no-store" }); if (r.ok) drawLive(await r.json()); } catch {}
  };
  tick();
  liveTimer = setInterval(tick, 30000);
}
const ELEMENT_LABEL = { fire: "Fire", earth: "Earth", air: "Air", water: "Water" };
function drawLive(d) {
  const strip = $("#live");
  strip.hidden = !(d.total >= 1);
  if (!strip.hidden) {
    $("#live-total").textContent = n0(d.total);
    const more = Number.isFinite(d.nowPlaying);
    $("#live-now-box").hidden = !more; $("#live-today-box").hidden = !more;
    if (more) { $("#live-now").textContent = n0(d.nowPlaying); $("#live-today").textContent = n0(d.today); }
  }
  const tl = d.todayLives, day = $("#live-day");
  day.hidden = !tl;
  if (tl) {
    $("#live-avg").textContent = String(tl.avgAge); $("#live-max").textContent = String(tl.maxAge);
    $("#live-married").textContent = `${tl.married}%`; $("#live-home").textContent = `${tl.home}%`;
    const max = Math.max(1, ...Object.values(tl.elements || {}));
    $("#live-elements").innerHTML = ["fire", "earth", "air", "water"].map(e => `<div class="bar ${e}" style="--h:${Math.round(((tl.elements || {})[e] || 0) / max * 100)}%"><i></i><span>${ELEMENT_LABEL[e]}</span></div>`).join("");
    $("#live-day-n").textContent = `${n0(tl.n)} lives today`;
  }
  const recent = $("#live-recent");
  recent.hidden = !(d.recent && d.recent.length);
  if (!recent.hidden) $("#live-recent-list").innerHTML = d.recent.map(l => {
    const things = [l.married ? (l.married === 1 ? "married" : `married ${l.married}×`) : "never married", l.kids ? `${l.kids} ${l.kids === 1 ? "kid" : "kids"}` : "", l.home ? "owned a home" : ""].filter(Boolean);
    const ago = l.ago < 1 ? "just now" : l.ago < 60 ? `${l.ago} min ago` : l.ago < 1440 ? `${Math.floor(l.ago / 60)} h ago` : `${Math.floor(l.ago / 1440)} d ago`;
    const el = ELEMENT[l.sun] || "fire";
    return `<li><span class="glyph ${el}" aria-hidden="true">${GLYPH[l.sun] || "✦"}</span><span><b>A ${esc(l.sun)} born in ${esc(l.decade)}</b> lived to ${l.age}, ${esc(things.join(", "))}<small>${esc(ago)}</small></span></li>`;
  }).join("");
}
// In the Web Worker (no document) this script only answers for the 100 lives; on the page it runs the page.
if (typeof document === "undefined") {
  self.onmessage = e => {
    try { self.postMessage({ id: e.data.id, summary: hundredLives(e.data) }); } catch (err) { self.postMessage({ id: e.data.id, error: String((err && err.message) || err) }); }
  };
} else {
  start();
}
