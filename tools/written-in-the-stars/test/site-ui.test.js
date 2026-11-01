// The page's own pure pieces: the share card's label, fate vs luck, the profection pill, and the pixel scenes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { labelOf, verdictOf, hundredFacts, hundredLine, profectionText, decadeOf, dateText, timeText, GLYPH, SIGN_WORDS, SIGNS } from "../src/ui/words.js";
import { sceneOf, weatherOf, captionOf, demoViews, PLACE_LABEL } from "../src/ui/pixel.js";
import { DECADES } from "../worker/stats.js";

const state = (over = {}) => ({
  age: 80, year: 2075, birthYear: 1995, sex: "female", alive: true, edu: "bachelor", marriages: 1, divorces: 0, kids: [{ age: 50, sex: "male" }],
  home: "own", flags: {}, jobsHeld: [{ title: "nurse" }], rel: "married", partner: { name: "Sam", age: 82, sex: "male" }, since: 30,
  father: { alive: false, age: 110 }, mother: { alive: false, age: 108 }, health: {}, studying: false, employed: false, retired: true, abroad: null, unemployedFor: 0,
  ...over,
});
const flat = (n, v = 60) => Array.from({ length: n }, (_, age) => ({ age, open: v, close: v }));

test("the label comes from the life, rarest first", () => {
  assert.equal(labelOf({ s: state({ age: 101 }), kline: flat(102) }).title, "The Centenarian");
  assert.equal(labelOf({ s: state({ marriages: 3 }), kline: flat(81) }).title, "The Eternal Romantic");
  assert.equal(labelOf({ s: state({ flags: { livedAbroad: 30 } }), kline: flat(81) }).title, "The Wanderer");
  assert.equal(labelOf({ s: state({ age: 40 }), kline: flat(41) }).title, "The Shooting Star");
  const late = flat(81).map(k => (k.age === 70 ? { ...k, close: 95 } : k.age >= 50 ? { ...k, close: 72 } : k));
  assert.equal(labelOf({ s: state(), kline: late }).title, "The Late Bloomer");
  assert.equal(labelOf({ s: state(), kline: flat(81).map(k => (k.age === 70 ? { ...k, close: 95 } : k)) }).title !== "The Late Bloomer", true);
  assert.equal(labelOf({ s: state({ marriages: 0, kids: [], home: "rent" }), kline: flat(81) }).title, "The Free Spirit");
  for (const age of [5, 30, 60, 90]) {
    const l = labelOf({ s: state({ age }), kline: flat(age + 1, 50) });
    assert.ok(l.title.startsWith("The ") && l.line.length > 5, JSON.stringify(l));
  }
});

test("fate vs luck: almost always or almost never is fate, about half is luck", () => {
  assert.equal(verdictOf(84).key, "fate");
  assert.equal(verdictOf(12).key, "fate");
  assert.equal(verdictOf(50).key, "luck");
  assert.equal(verdictOf(72).key, "lean");
  const summary = { married: 84, homeOwner: 55, college: 30, kids: [{ runs: 20 }], lifespan: { over90: 40 } };
  const s = state();
  assert.deepEqual(hundredFacts(summary, s).map(f => f.key), ["married", "kids", "home", "college", "over90"]);
  assert.deepEqual(hundredLine(summary, s), { n: 84, text: "got married", key: "married" });
  assert.deepEqual(hundredLine({ ...summary, married: 50, kids: [{ runs: 95 }] }, s), { n: 95, text: "had no kids", key: "kids" });
});

test("the profection pill names the house, its topic and the lord of the year", () => {
  const p = profectionText({ house: 6, sign: "Aries", lord: "mars" });
  assert.equal(p.short, "6th house year · Mars");
  assert.match(p.long, /6th house, work and health, in Aries, so Mars is the lord of the year/);
  assert.match(profectionText({ house: 1, sign: "Leo", lord: "sun" }, false).long, /counted from your Sun sign/);
  assert.equal(profectionText(null).short, "");
});

test("words: signs, dates and decades", () => {
  assert.equal(SIGNS.length, 12);
  assert.ok(SIGNS.every(s => GLYPH[s] && SIGN_WORDS[s]));
  assert.equal(dateText({ y: 1995, m: 8, d: 3 }), "Aug 3, 1995");
  assert.equal(timeText({ h: 14, mi: 5 }), "2:05 PM");
  assert.equal(timeText({ h: 0, mi: 30 }), "12:30 AM");
  assert.equal(timeText(null), "time unknown");
  // The page's decades are the ones the Worker accepts.
  for (const y of [1950, 1969, 1995, 2005, 2025]) assert.ok(DECADES.includes(decadeOf(y)), decadeOf(y));
});

test("pixel scenes: an American life's places and the chart's weather", () => {
  assert.equal(sceneOf(state({ age: 0, year: 1995 }), { score: 70 }).kind, "nursery");
  assert.equal(sceneOf(state({ age: 8, studying: true, track: "elementary", rel: "single", partner: null }), { score: 50 }).kind, "school");
  assert.equal(sceneOf(state({ age: 20, studying: true, track: "college" }), { score: 50 }).kind, "campus");
  const nurse = sceneOf(state({ age: 40, retired: false, employed: true, job: { title: "nurse", field: "health care" } }), { score: 50 });
  assert.equal(nurse.kind, "clinic");
  assert.equal(nurse.me.outfit, "scrubs");
  assert.equal(sceneOf(state({ alive: false }), { score: 50 }).weather, "night");
  assert.equal(weatherOf({ score: 80 }), "sunny");
  assert.equal(weatherOf({ score: 30 }), "rain");
  assert.equal(weatherOf({ score: 80 }, new Set(["e_2017eclipse"])), "eclipse");
  assert.match(captionOf(sceneOf(state(), { score: 66 })), /clear skies/);
  assert.ok(demoViews().every(v => v.place && v.kind in PLACE_LABEL));
});
