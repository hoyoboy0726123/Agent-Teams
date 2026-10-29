// The engine's contracts with the other tracks: the jobs it hands to prep.jobFit, the rates the story calls, the data
// tables it reads, and the US world (states, names, words).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadSim } from "./sim-stubs/load.js";

const m = await loadSim();
const { world: W, rates: R, people: P, words, seam } = m;
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const ELEMENTS = ["fire", "earth", "air", "water"];
const ctx = seed => ({ rng: m.rng.makeRng(seed), R, jobFit: () => 0 });

test("every job is tagged for jobFit: a house 1–12, signs and elements, and reads as [title, factor, field, house]", () => {
  const all = [...Object.values(W.JOBS).flat(), ...Object.values(W.SPECIAL_JOBS)];
  assert.ok(all.length >= 80);
  for (const j of all) {
    const [title, factor, field, house] = j;
    assert.deepEqual([title, factor, field, house], [j.title, j.factor, j.field, j.house]);
    assert.ok(typeof title === "string" && /^[A-Za-z]/.test(title), title);
    assert.ok(factor > 0.3 && factor < 5, title);
    assert.ok(Number.isInteger(house) && house >= 1 && house <= 12, title);
    assert.equal(j.houses[0], house, title);
    assert.ok(j.signs.length && j.signs.every(s => SIGNS.includes(s)), `${title} signs`);
    assert.ok(j.elements.length && j.elements.every(e => ELEMENTS.includes(e)), `${title} elements`);
  }
  for (const h of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) assert.ok(all.some(j => j.house === h), `a job in house ${h}`);
  for (const [tier, list] of Object.entries(W.JOBS)) assert.equal(new Set(list.map(j => j.title)).size, list.length, `${tier}: unique titles`);
});

test("the chart's jobFit takes every job and stays in −1..1", () => {
  const prep = m.setup.prepare({ date: { y: 1995, m: 3, d: 21 }, time: { h: 6, mi: 0 }, place: { name: "Chicago", state: "IL", lat: 41.88, lon: -87.63, tz: "America/Chicago" }, sex: "male" });
  const fits = Object.values(W.JOBS).flat().map(j => prep.jobFit(j));
  for (const f of fits) assert.ok(f >= -1 && f <= 1);
  if (!m.stubbed["astro/index.js"]) assert.ok(new Set(fits.map(f => f.toFixed(3))).size > 5, "the real chart engine tells jobs apart");
  assert.equal(W.jobFit(null, W.JOBS.basic[0]), 1);
  assert.equal(W.jobFit(() => 1, W.JOBS.basic[0]), 2);
  assert.equal(W.jobFit({ jobFit: () => -1 }, W.JOBS.basic[0]), 0.5);
});

test("jobs follow schooling, era and age; picking leans to the chart's fit", () => {
  const s = { edu: "bachelor", age: 23, year: 1975, job: null, done: new Set(), home: "parents", career: 0 };
  const titles = W.jobsFor(s).map(j => j.title);
  assert.ok(titles.includes("computer programmer") && !titles.includes("software developer") && !titles.includes("data scientist"));
  assert.ok(W.jobsFor({ ...s, year: 2020 }).some(j => j.title === "software developer"));
  assert.ok(!W.jobsFor({ edu: "high", age: 15, year: 2000 }).some(j => j.minAge > 15));
  for (const edu of ["none", "high", "ged", "certificate", "associate", "bachelor", "master", "doctorate"]) for (const year of [1955, 2024]) assert.ok(W.jobsFor({ edu, age: 30, year }).length >= 3, `${edu} ${year}`);
  // A strong fit to one house roughly doubles that house's jobs among the picks.
  const target = W.JOBS.college.filter(j => j.house === 11).map(j => j.title);
  const share = fit => { const c = { ...ctx(9), jobFit: j => (j.house === 11 ? fit : 0) }; let n = 0; for (let i = 0; i < 3000; i++) if (target.includes(W.pickJob({ ...s, year: 2020 }, c).title)) n++; return n / 3000; };
  assert.ok(share(1) > 1.5 * share(0));
  const t = { ...s, year: 2020, employed: false, unemployedFor: 2 };
  const title = W.startJob(t, ctx(3), ["county clerk", 0.95, "government", null]);
  assert.equal(title, "county clerk");
  assert.deepEqual([t.job.field, t.job.house, t.employed, t.done.has("firstJob")], ["government", null, true, true]);
  assert.ok(t.income > 0);
});

test("US states: 50 and DC, weighted by births; moving sets the state and a city", () => {
  assert.equal(W.STATES.length, 51);
  const births = W.STATES.reduce((a, r) => a + r[2], 0);
  assert.ok(births > 3400 && births < 3800, `about 3.6 million births: ${births}`);
  assert.equal(W.stateName("OH"), "Ohio");
  assert.equal(W.stateCode("new york"), "NY");
  assert.equal(W.regionOf("Texas"), "south");
  const s = { county: "Ohio", city: "Columbus", cityState: "Ohio", abroad: null };
  const to = W.moveTo(s, ctx(4), [["NY", 3], ["CA", 2]]);
  assert.ok(["New York", "California"].includes(s.county));
  assert.equal(to, `${s.city}, ${s.county}`);
  assert.equal(W.placeLabel({ ...s, abroad: "Japan" }), "Japan");
});

test("names: an American first and last name for every decade, nicknames for friends", () => {
  const rng = m.rng.makeRng(5);
  for (const year of [1950, 1965, 1983, 1999, 2008, 2016, 2024]) for (const sex of ["male", "female"]) {
    const n = m.randomName.randomName(rng, year, sex);
    assert.match(n, /^[A-Z][a-z]+ [A-Z][A-Za-z']+$/, n);
  }
  const s = { seq: 0, name: "Jane Doe", father: { name: "" }, sex: "female", year: 2015, partner: { sex: "male", name: "Tom Smith" } };
  const kid = P.newKid(s, { rng });
  assert.match(kid.name, / Smith$/);
  assert.equal(P.surnameIn("Martin Luther King Jr."), "King");
  assert.equal(P.surnameIn("Cher"), null);
  assert.equal(words.callName("Mary Ann Smith"), "Mary");
  assert.ok(P.canMarry({ sex: "female", partner: { sex: "female" }, year: 2005, county: "Massachusetts" }));
  assert.ok(!P.canMarry({ sex: "female", partner: { sex: "female" }, year: 2005, county: "Texas" }));
  assert.ok(P.canMarry({ sex: "female", partner: { sex: "female" }, year: 2015, county: "Texas" }));
  assert.ok(Object.keys(P.MEET_WORDS).includes(P.meetPlace({ age: 30, year: 2020, studying: false, employed: true }, { rng })));
});

test("words: articles, lists, the birth line", () => {
  assert.deepEqual(["nurse", "engineer", "HR specialist", "union rep", "hour", "EMT", "Uber driver", "one-time deal"].map(words.an), ["a nurse", "an engineer", "an HR specialist", "a union rep", "an hour", "an EMT", "an Uber driver", "a one-time deal"]);
  assert.equal(words.listWords(["Mom", "Dad", "Grandma"]), "Mom, Dad, and Grandma");
  assert.equal(words.listWords(["Mom", "Dad"]), "Mom and Dad");
  const s = { county: "Ohio", city: "Columbus", cityState: "Ohio", sex: "female", name: "Jane Doe", birthYear: 1988, father: { name: "Tom Doe" }, mother: { name: "" }, siblings: { list: [{ older: true, bornAt: -2, label: "older brother", short: "brother", name: "" }] } };
  assert.equal(words.birthText(s, { intro: "Sun in Leo, Moon in Pisces, Scorpio rising" }), "You were born in Columbus, Ohio in 1988, a baby girl named Jane. Your dad is Tom. Waiting at home: an older brother. Sun in Leo, Moon in Pisces, Scorpio rising.");
  assert.equal(m.grammar.tidy("you went home . then  you slept"), "you went home. Then you slept");
});

test("every rate the story asks for exists in rates.js, with the story's arguments, and is a probability", async () => {
  const common = new URL("../src/sim/story/common.js", import.meta.url);
  const names = existsSync(common) ? Object.keys((await import(common.href)).FALLBACK || {}) : [];
  const rng = m.rng.makeRng(1);
  // The arguments story/core.js passes (through common.js rate()).
  const CALLS = {
    kindergarten: [1990], juniorHigh: [1990], hsDropout: [1990], ged: [20], college: [1990, "high"], communityShare: [1990], enlist: ["male", 1990],
    collegeDropout: [1990, "college"], transfer: [1990], master: [1990], jobFind: [22], promotion: [35], jobChange: [30], layoff: [2009],
    retire: [62, "female", 2010], homeBuy: [32], move: [25], abroad: [30], dating: [25, "single", 1990], breakup: [25], proposal: [27, "female", 1990, 0],
    divorce: [5, 1990], crisis: [5], birth: [29, 0, 1990], deathRaw: [70, "male", 2000], serious: [60, "male", 2000], chronic: [55, "female"],
  };
  for (const n of [...new Set([...names, ...Object.keys(CALLS)])]) {
    assert.ok(n in R, `rates.js has ${n}`);
    if (n === "DOWN_PAYMENT") { assert.ok(R.DOWN_PAYMENT > 0 && R.DOWN_PAYMENT < 5); continue; }
    if (n === "seriousType") { assert.ok(R.SERIOUS_TYPES.includes(R.seriousType(70, "male", 2000, rng))); continue; }
    const v = R[n](...(CALLS[n] || []));
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `${n}(${(CALLS[n] || []).join(", ")}) = ${v}`);
  }
  // A few US shapes.
  assert.ok(R.hsDropout(1970) > R.hsDropout(2020));
  assert.ok(R.proposal(20, "female", 1960, 0) > 1.4 * R.proposal(20, "female", 2020, 0), "earlier marriage in 1960");
  assert.ok(R.layoff(2009) > R.layoff(2005));
  const after = R.afterHighSchool(2022, "male");
  assert.ok(Math.abs(Object.values(after).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(R.military(1951, 1970, "male").draft && !R.military(1960, 1978, "male").draft);
  assert.equal(R.dollars(1, 2023), 58000);
  assert.equal(R.marketReturn(2008), -0.37);
  assert.ok(R.retire(62, "male") > R.retire(61, "male"), "Social Security at 62");
});

test("the data tables have the shapes the engine reads", () => {
  const D = { LIFE_TABLES: R.lifeTable("male", 2000) };
  assert.equal(D.LIFE_TABLES.length, 121);
  for (const sex of ["male", "female"]) for (const y of [1950, 1990, 2024, 2060]) {
    const q = R.lifeTable(sex, y);
    assert.ok(q.every(v => v > 0 && v <= 1) && q[120] === 1);
    const e0 = R.expectancy(q);
    assert.ok(e0 > 60 && e0 < 95, `${sex} ${y}: e0 ${e0}`);
  }
  assert.ok(R.expectancy(R.lifeTable("female", 2000)) > R.expectancy(R.lifeTable("male", 2000)));
  for (const t of R.SERIOUS_TYPES) assert.ok(R.incidence(t, 70, "male", 2000) > R.incidence(t, 30, "male", 2000));
  assert.ok(R.chronic(60, "male") > R.chronic(20, "male"));
  assert.ok(R.death(50, "male", 2000) < R.deathRaw(50, "male", 2000), "the healthy baseline sits below the table");
  assert.ok(seam.MAX_AGE === 110);
});
