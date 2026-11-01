// The pixel scenes on the page: the scene above the story while a life plays, the "your life in pictures" recap
// before the ending, and the welcome page's slideshow of a life's stages. The pictures come from pixel.js; this file
// decides when they change and paints them about 15 times a second. Adapted from bazi-life's pixel-app.js.
import { sceneOf, paintScene, captionOf, demoViews, W, H } from "./pixel.js";

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// Moments worth a picture in the recap, most important first; a group appears once.
const MOMENT = { birth: 0, realPartnerWedding: 1, proposal: 1, baby: 2, firstJob: 3, graduateUni: 4, buyHome: 5, abroad: 5, highSchool: 6, promotion: 6, retire: 7, grandchild: 7, e_1969moon: 8, e_2017eclipse: 8, e_2024eclipse: 8, e_2020covid: 9 };
const GROUP = { proposal: "wedding", realPartnerWedding: "wedding", e_2017eclipse: "eclipse", e_2024eclipse: "eclipse" };
// Where each moment is drawn, whatever else the state says (a baby is born at home, not at your desk).
const PLACE = { birth: "nursery", graduateUni: "campus", highSchool: "school", proposal: "wedding", realPartnerWedding: "wedding", baby: "home", buyHome: "home", retire: "park", grandchild: "park", abroad: "abroad", e_1969moon: "home", e_2017eclipse: "park", e_2024eclipse: "park" };
const MAX_MOMENTS = 6;

let life = null;   // { key, view, since, moments }
let story = null;  // { slides, k, view, since, onClose, opener }

function rankOf(e, s) {
  if (!e || !(e.id in MOMENT)) return null;
  if (e.id === "proposal" && !(s.marriages > 0)) return null;   // a proposal that did not end in a wedding
  if (e.id === "abroad" && s.flags.livedAbroad === undefined && !s.abroad) return null;
  if (e.id === "buyHome" && !(s.home === "own" || s.flags.ownedBefore)) return null;   // decided to keep renting
  return MOMENT[e.id];
}

// A new life: its own faces (the key) and no moments yet.
export function startScene(key, state, luckAt) {
  life = { key: String(key), view: null, since: 0, moments: [] };
  closeStory(false);
  showStep(state, luckAt, []);
}

// Keeps the pictures of this step's moments, each drawn at the age it happened; used on its own while skipping.
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
export function shorten(text) {
  const parts = String(text).split(/(?<=[.!?])\s+/);
  let out = parts[0] || String(text);
  for (const part of parts.slice(1)) { if ((out + " " + part).length > 120) break; out += " " + part; }
  return out;
}

// The recap: the moments as pictures, then the last picture, then the ending underneath.
export function openStory(state, luckAt, onClose) {
  if (!life) return onClose && onClose();
  const moments = pickMoments(life.moments);
  const slides = moments.map((m, i) => ({ type: "moment", ...m, i, n: moments.length }));
  slides.push({ type: "end", view: sceneOf(state, luckAt(state.age), [], life.key), age: state.age, year: state.year });
  story = { slides, k: 0, view: null, since: 0, onClose, opener: document.activeElement };
  const box = $("#story");
  box.hidden = false;
  document.body.classList.add("story-open");
  drawSlide();
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
  let h = `<button type="button" class="skip" data-story-close>Skip</button>`;
  if (s.type === "moment") {
    h += `<div class="slide"><canvas width="${W}" height="${H}" aria-hidden="true"></canvas><p class="ag">Age ${s.age} · ${s.year}</p><p class="tx">${esc(shorten(s.text))}</p><div class="dots" aria-hidden="true">${Array.from({ length: s.n }, (_, j) => `<i class="${j <= s.i ? "on" : ""}"></i>`).join("")}</div><button type="button" class="next" data-story-next>Next</button></div><p class="hint">Tap anywhere to continue</p>`;
  } else {
    h += `<div class="slide"><canvas width="${W}" height="${H}" aria-hidden="true"></canvas><h2>${s.year}</h2><p class="tx">You lived to ${s.age}.</p><p class="soft">Now the same chart lives 99 more times. What was written in the stars, and what was luck?</p><button type="button" class="go" data-story-close>See how it ends</button></div>`;
  }
  box.innerHTML = h;
  story.view = s.view;
  story.since = now();
  story.canvas = box.querySelector("canvas");
  const target = box.querySelector("[data-story-next], .go");
  if (target) target.focus({ preventScroll: true });
}

let shownStage = -1;
const demo = demoViews();
function drawWelcome(t) {
  const canvas = $("#welcome-scene"), panel = $("#welcome");
  if (!canvas || !panel || panel.hidden) return;
  const calm = still(), i = calm ? 0 : Math.floor(t / 2600) % demo.length, since = calm ? 0 : Math.floor(t / 2600) * 2600;
  paintScene(canvas, demo[i], calm ? 1500 : t, since);
  if (i !== shownStage) {
    shownStage = i;
    const stages = $("#welcome-stages");
    if (stages) [...stages.children].forEach((el, j) => el.classList.toggle("on", !calm && j === i));
  }
}

let last = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (t - last < 66) return;
  last = t;
  const play = $("#play"), scene = $("#scene"), calm = still();
  if (life && life.view && play && !play.hidden && scene) paintScene(scene, life.view, calm ? life.since + 1500 : t, life.since);
  if (story && story.canvas && story.canvas.isConnected) paintScene(story.canvas, story.view, calm ? story.since + 1500 : t, story.since);
  drawWelcome(t);
}

export function initPixels() {
  const stages = $("#welcome-stages");
  if (stages) stages.innerHTML = demo.map(v => `<span>${esc(v.place)}</span>`).join("");
  const box = $("#story");
  if (box) {
    box.addEventListener("click", e => { if (e.target.closest("[data-story-close]")) return closeStory(); next(); });
    box.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); closeStory(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "Tab") {
        // Keep the focus inside the dialog.
        const f = [...box.querySelectorAll("button")];
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
  }
  requestAnimationFrame(frame);
}
