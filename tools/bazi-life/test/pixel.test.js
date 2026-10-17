// Pixel scenes: which picture a moment of a life gets, and that every picture draws.
import test from "node:test";
import assert from "node:assert/strict";
import { sceneOf, paintScene, captionOf, demoViews, weatherOf, iconOf, personAt, setCanvasMaker, W, H } from "../src/pixel.js";

// A canvas stand-in that counts what is drawn.
function fakeCanvas() {
  const calls = { fill: 0, image: 0 };
  const g = {
    fillStyle: "", globalAlpha: 1, imageSmoothingEnabled: true,
    fillRect() { calls.fill++; }, clearRect() {}, drawImage() { calls.image++; },
    save() {}, restore() {}, translate() {}, beginPath() {}, rect() {}, clip() {},
  };
  return { width: W, height: H, calls, getContext: () => g };
}
setCanvasMaker(() => fakeCanvas());

const base = {
  sex: "male", age: 30, year: 2010, alive: true, county: "臺北市", abroad: null, studying: false, track: null, employed: false, job: null,
  retired: false, unemployedFor: 0, rel: "single", partner: null, since: null, kids: [], home: "parents", health: { serious: null },
  father: { alive: true, age: 60 }, mother: { alive: true, age: 58 },
};
const life = over => ({ ...base, ...over });
const L = score => ({ score });
const roles = v => v.cast.map(c => c.role);

test("a newborn is in the crib at the hospital, with both parents", () => {
  const v = sceneOf(life({ age: 0, year: 1990, father: { alive: true, age: 31 }, mother: { alive: true, age: 29 } }), L(70));
  assert.equal(v.kind, "nursery");
  assert.equal(v.me.form, "baby");
  assert.deepEqual(roles(v), ["father", "mother"]);
  assert.equal(v.weather, "sunny");
});

test("school, campus and work follow the life, in the clothes of each", () => {
  const kid = sceneOf(life({ age: 9, year: 1999, studying: true, track: "國小" }), L(55));
  assert.equal(kid.kind, "school"); assert.equal(kid.me.outfit, "uniform"); assert.equal(kid.me.form, "child");
  assert.equal(sceneOf(life({ age: 20, studying: true, track: "大學" }), L(55)).kind, "campus");
  const eng = sceneOf(life({ employed: true, job: { title: "工程師", field: "科技" } }), L(55));
  assert.equal(eng.kind, "office"); assert.equal(eng.me.outfit, "suit"); assert.equal(eng.variant, "101");
  const nurse = sceneOf(life({ sex: "female", employed: true, job: { title: "護理師", field: "醫療" } }), L(55));
  assert.equal(nurse.kind, "clinic"); assert.equal(nurse.me.outfit, "white");
  assert.equal(sceneOf(life({ employed: true, job: { title: "手搖飲老闆", field: "自營" } }), L(55)).kind, "shop");
  assert.equal(sceneOf(life({ employed: true, job: { title: "工廠技術員", field: "製造" } }), L(55)).kind, "factory");
  assert.equal(sceneOf(life({ age: 72, retired: true }), L(55)).kind, "park");
  assert.equal(sceneOf(life({ unemployedFor: 2 }), L(55)).kind, "street");
});

test("the picture right after a wedding or a diagnosis shows it, a year on it does not", () => {
  // The engine moves to the next year at the end of a step, so the state is one year past the news.
  const married = life({ age: 29, rel: "married", since: 28, partner: { name: "王小美", sex: "female", age: 27 } });
  const wed = sceneOf(married, L(70), [{ id: "proposal", age: 28, big: true }]);
  assert.equal(wed.kind, "wedding"); assert.equal(wed.icon, "heart");
  assert.equal(wed.me.outfit, "groom"); assert.equal(wed.cast.find(c => c.role === "partner").p.outfit, "bride");
  assert.equal(sceneOf(married, L(70), []).kind, "home");
  const ill = life({ age: 56, health: { serious: { type: "cancer", since: 55 } } });
  assert.equal(sceneOf(ill, L(30), [{ id: "serious", age: 55, big: true }]).kind, "hospital");
  assert.equal(sceneOf(ill, L(30), []).kind, "home");
});

test("an earlier moment is drawn at that age: a baby born that year is in the crib", () => {
  const s = life({ age: 31, rel: "married", since: 28, partner: { name: "王小美", sex: "female", age: 29 }, kids: [{ name: "小寶", sex: "male", age: 1 }, { name: "二寶", sex: "female", age: 0 }] });
  const v = sceneOf(s, L(55), [{ id: "baby", age: 30, big: true }], "k", { place: "home", age: 30 });
  assert.equal(v.age, 30); assert.equal(v.year, 2009);
  const kids = v.cast.filter(c => c.role === "kid");
  assert.equal(kids.length, 1, "the child born next year is not there yet");
  assert.equal(kids[0].p.age, 0);
  assert.equal(v.cast.find(c => c.role === "partner").p.age, 28);
});

test("abroad shows the country; the last picture is a night of sky lanterns with the family", () => {
  assert.equal(sceneOf(life({ abroad: "日本" }), L(55)).variant, "jp");
  assert.equal(sceneOf(life({ abroad: "美國" }), L(55)).variant, "us");
  assert.equal(sceneOf(life({ abroad: "英國" }), L(55)).place, "英國");
  const end = sceneOf(life({ alive: false, age: 81, rel: "married", partner: { name: "王小美", sex: "female", age: 79 }, kids: [{ name: "小寶", sex: "male", age: 50 }], father: { alive: false, age: 110 }, mother: { alive: false, age: 108 } }), L(50));
  assert.equal(end.kind, "farewell"); assert.equal(end.weather, "night");
  assert.deepEqual(roles(end), ["partner", "kid"]);
});

test("the weather follows the year's luck, storms bring rain, and the eras leave their marks", () => {
  assert.equal(weatherOf(L(70)), "sunny"); assert.equal(weatherOf(L(55)), "fair"); assert.equal(weatherOf(L(45)), "cloudy"); assert.equal(weatherOf(L(30)), "rain");
  assert.equal(weatherOf(L(80), new Set(["e_2009morakot"])), "rain");
  assert.equal(sceneOf(life({ age: 15, year: 2003, studying: true, track: "國中" }), L(55)).mask, true);
  assert.equal(sceneOf(life({ year: 2021, employed: true, job: { title: "會計", field: "金融" } }), L(55)).mask, true);
  assert.equal(sceneOf(life({ year: 2021 }), L(55)).mask, false, "no mask at home");
  assert.equal(sceneOf(life({ age: 11, year: 1999 }), L(55), [{ id: "e_1999quake", age: 11, big: true }]).quake, true);
  assert.match(captionOf(sceneOf(life({ age: 72, retired: true }), L(30))), /^公園・下雨/);
});

test("icons mark the big news only", () => {
  assert.equal(iconOf([{ id: "firstJob", big: true }]), "star");
  assert.equal(iconOf([{ id: "baby", big: true }]), "baby");
  assert.equal(iconOf([{ id: "buyHome", big: true }]), "house");
  assert.equal(iconOf([{ id: "divorce", big: true }]), "broken");
  assert.equal(iconOf([{ id: "divorce" }]), null);
  assert.equal(iconOf([{ id: "death", big: true }]), null);
});

test("people age: gray hair from 52, a cane from 78", () => {
  assert.equal(personAt({ key: "a", sex: "male", age: 40 }).gray, 0);
  assert.equal(personAt({ key: "a", sex: "male", age: 60 }).gray, 1);
  assert.equal(personAt({ key: "a", sex: "female", age: 70 }).form, "elder");
  assert.equal(personAt({ key: "a", sex: "female", age: 80 }).cane, true);
  assert.deepEqual(personAt({ key: "same", sex: "male", age: 30 }).look, personAt({ key: "same", sex: "male", age: 70 }).look, "the same face all life");
});

test("every place and weather draws without errors", () => {
  const people = [personAt({ key: "p", sex: "female", age: 33 }), personAt({ key: "c", sex: "male", age: 6 }), personAt({ key: "b", sex: "female", age: 0 })];
  const kinds = ["home", "nursery", "school", "campus", "office", "factory", "shop", "clinic", "street", "park", "hospital", "wedding", "abroad", "temple", "farewell"];
  for (const kind of kinds) for (const weather of ["sunny", "fair", "cloudy", "rain", "night"]) {
    const c = fakeCanvas();
    const v = { kind, variant: kind === "abroad" ? "jp" : kind === "office" ? "101" : kind === "hospital" ? "patient" : "", weather, me: personAt({ key: "me", sex: "male", age: 35, outfit: "suit" }), cast: [{ role: "partner", p: people[0] }, { role: "kid", p: people[1] }, { role: "kid", p: people[2] }], icon: "star", mask: true, quake: true, place: "x" };
    paintScene(c, v, 1234, 1000);
    assert.ok(c.calls.fill > 100 && c.calls.image >= 1, `${kind}/${weather}`);
  }
  for (const v of demoViews()) { const c = fakeCanvas(); paintScene(c, v, 500, 0); assert.ok(c.calls.fill > 100, v.place); }
});
