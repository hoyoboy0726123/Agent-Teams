// 像素場景放進網頁：遊戲畫面上方跟著人生走的場景、結局前的「人生回顧」，以及歡迎頁的動畫。
// The pictures come from pixel.js; this file decides when they change and draws them about 15 times a second.
import { sceneOf, paintScene, captionOf, demoViews, nurseryView, W, H } from "./pixel.js";

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// Moments worth a picture in 人生回顧, most important first; a group appears once.
const MOMENT = { birth: 0, realPartnerWedding: 1, proposal: 1, baby: 2, firstJob: 3, graduateUni: 4, buyHome: 5, abroad: 5, exam18: 6, civilExam: 6, startupOffer: 6, retire: 7, l_retiredLife: 8, e_1999quake: 9, e_2003sars: 9, e_2020covid: 9, e_2009morakot: 9 };
const GROUP = { proposal: "wedding", realPartnerWedding: "wedding" };
// Where each moment is drawn, whatever else the state says (a baby is born at home, not at your desk).
const PLACE = { birth: "nursery", graduateUni: "campus", proposal: "wedding", realPartnerWedding: "wedding", baby: "home", buyHome: "home", retire: "park", abroad: "abroad", civilExam: "office", startupOffer: "shop" };
const MAX_MOMENTS = 6;

let life = null;   // { key, view, since, moments }
let nursery = null; // { canvas, view, since } for 準爸媽模式
let story = null;  // { slides, k, view, since, onClose }

function rankOf(e, s) {
  if (!e || !(e.id in MOMENT)) return null;
  if (e.id === "proposal" && !(s.rel === "married" && s.since === e.age)) return null;   // a proposal that did not end in a wedding
  if (e.id === "abroad" && !s.abroad) return null;
  if (e.id === "buyHome" && !(s.home === "own" && s.ownedAt === e.age)) return null;   // decided to keep renting
  return MOMENT[e.id];
}

// A new life: its own faces (the key) and no moments yet.
export function startScene(key, state, luckAt) {
  life = { key: String(key), view: null, since: 0, moments: [] };
  closeStory(false);
  showStep(state, luckAt, []);
}

// Keeps the pictures of this step's moments, each drawn at the age it happened; used on its own while skipping.
//   luckAt  age → that year's luck entry
export function collectStep(state, luckAt, entries) {
  if (!life) return;
  for (const e of entries) {
    const rank = rankOf(e, state);
    if (rank === null) continue;
    life.moments.push({ id: e.id, group: GROUP[e.id] || e.id, rank, n: life.moments.length, age: e.age, year: e.year, text: e.text, view: sceneOf(state, luckAt(e.age), [e], life.key, { place: PLACE[e.id], age: e.age }) });
  }
}

// After a step the player watched: the scene changes to this year, and its moments are kept.
export function showStep(state, luckAt, entries) {
  if (!life) return;
  life.view = sceneOf(state, luckAt(state.age), entries, life.key);
  life.since = now();
  const cap = $("#scene-cap");
  if (cap) cap.textContent = captionOf(life.view);
  collectStep(state, luckAt, entries);
}

function pickMoments(list) {
  const seen = new Set(), unique = [];
  for (const m of list) if (!seen.has(m.group)) { seen.add(m.group); unique.push(m); }
  const birth = unique.filter(m => m.id === "birth");
  const rest = unique.filter(m => m.id !== "birth").sort((a, b) => a.rank - b.rank || a.age - b.age).slice(0, MAX_MOMENTS - birth.length);
  return [...birth, ...rest].sort((a, b) => a.age - b.age || a.n - b.n);
}
// The first sentence of a story line, and the next ones while the slide stays short.
function shorten(text) {
  const parts = String(text).split(/(?<=[。！？])/);
  let out = parts[0] || String(text);
  for (const part of parts.slice(1)) { if ((out + part).length > 46) break; out += part; }
  return out;
}

// 人生回顧: the moments as pictures, then the last picture, then the results underneath.
export function openStory(state, luckAt, onClose) {
  if (!life) return onClose && onClose();
  const moments = pickMoments(life.moments);
  const slides = moments.map((m, i) => ({ type: "moment", ...m, i, n: moments.length }));
  slides.push({ type: "end", view: sceneOf(state, luckAt(state.age), [], life.key), age: state.age, year: state.year });
  story = { slides, k: 0, view: null, since: 0, onClose };
  const box = $("#story");
  box.hidden = false;
  document.body.classList.add("story-open");
  drawSlide();
  box.focus({ preventScroll: true });
}

export function closeStory(run = true) {
  const box = $("#story");
  if (!story || !box) { story = null; return; }
  const done = story.onClose;
  story = null;
  box.hidden = true; box.innerHTML = "";
  document.body.classList.remove("story-open");
  if (run && done) done();
}

function next() {
  if (!story) return;
  if (story.k >= story.slides.length - 1) return closeStory();
  story.k += 1;
  drawSlide();
}

function drawSlide() {
  const s = story.slides[story.k], box = $("#story");
  let h = `<button type="button" class="skip" data-story-close>略過</button>`;
  if (s.type === "moment") {
    h += `<div class="slide"><canvas width="${W}" height="${H}"></canvas><p class="ag">${s.age} 歲・${s.year}</p><p class="tx" data-no-i18n>${esc(shorten(s.text))}</p><div class="dots">${Array.from({ length: s.n }, (_, j) => `<i class="${j <= s.i ? "on" : ""}"></i>`).join("")}</div></div><p class="hint">點一下畫面繼續</p>`;
  } else {
    h += `<div class="slide"><canvas width="${W}" height="${H}"></canvas><h2>${s.year} 年</h2><p class="tx">你走完了 ${s.age} 歲的一生。</p><p class="soft">同一張命盤再過 100 次，會走出哪些不同的路？</p><button type="button" class="go" data-story-close>看這一生的結局</button></div>`;
  }
  box.innerHTML = h;
  story.view = s.view;
  story.since = now();
  story.canvas = box.querySelector("canvas");
}

// 準爸媽模式: the baby-to-be in the crib, above the comparison.
export function showNursery(canvas, sex) {
  nursery = canvas ? { canvas, view: nurseryView(sex), since: now() } : null;
}

let shownStage = -1;
const demo = demoViews();
function drawWelcome(t) {
  const canvas = $("#welcome-scene"), panel = $("#welcome"), setup = $("#setup");
  if (!canvas || !panel || panel.hidden || (setup && setup.hidden)) return;
  const i = still ? 0 : Math.floor(t / 2800) % demo.length, since = still ? 0 : Math.floor(t / 2800) * 2800;
  paintScene(canvas, demo[i], still ? 1500 : t, since);
  if (i !== shownStage) {
    shownStage = i;
    const stages = $("#welcome-stages");
    if (stages) [...stages.children].forEach((el, j) => el.classList.toggle("on", !still && j === i));
  }
}

let last = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (t - last < 66) return;
  last = t;
  const play = $("#play"), scene = $("#scene");
  if (life && life.view && play && !play.hidden && scene) paintScene(scene, life.view, still ? life.since + 1500 : t, life.since);
  if (story && story.canvas && story.canvas.isConnected) paintScene(story.canvas, story.view, still ? story.since + 1500 : t, story.since);
  drawWelcome(t);
  if (nursery && nursery.canvas.isConnected && nursery.canvas.offsetParent) paintScene(nursery.canvas, nursery.view, still ? nursery.since + 1500 : t, nursery.since);
}

export function initPixels() {
  const stages = $("#welcome-stages");
  if (stages) stages.innerHTML = demo.map(v => `<span>${esc(v.place)}</span>`).join("");
  const box = $("#story");
  if (box) {
    box.addEventListener("click", e => { if (e.target.closest("[data-story-close]")) return closeStory(); next(); });
    box.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); closeStory(); }
      else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") { if (e.target.closest("button")) return; e.preventDefault(); next(); }
    });
  }
  requestAnimationFrame(frame);
}
