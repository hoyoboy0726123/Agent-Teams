// 人生模擬引擎：一年一年走，每件事的機率 = 台灣統計的基礎機率，再依當年流年傾斜（luck.js）。
//
// createLife() returns a life that advances one year per step(). When an event asks the player to choose,
// step() stops with `pending` set; choose(i) applies an option, or chooseAction() applies what the player wrote
// (already mapped to an action), and the year goes on. In auto mode a policy answers instead, which is how
// "same chart, 100 runs" is simulated; it leans on the person's traits, so the same chart lives like the same person.
import { makeRng } from "./rng.js";
import { tilt } from "../core/luck.js";
import { nameTilt } from "../core/name.js";
import { familyTilts, isSibling, isOlder, RELATIONS } from "../core/family.js";
import { ALL_EVENTS, deathEvent } from "./story/index.js";
import { ACTIONS } from "./actions.js";
import { act, closeSpell } from "./act.js";
import { expand } from "./grammar.js";
import { initTraits, nudge, styleWeight } from "./traits.js";
import { newPerson, pronoun } from "./people.js";
import { chatTool, tripPlace, jobElement } from "./world.js";
import * as R from "./rates.js";

export const MAX_AGE = 110;

// Parents and siblings come from the optional family input when given, and are drawn at random otherwise.
function initialState({ sex, birthYear, county, rng, family, name, analysis }) {
  const given = role => family && family.members.find(m => m.relation === role);
  const father = given("father"), mother = given("mother");
  const fatherAge = father && father.date ? birthYear - father.date.y : Math.round(rng.between(26, 36));
  const motherAge = mother && mother.date ? birthYear - mother.date.y : Math.max(18, fatherAge - Math.round(rng.between(0, 5)));
  const tilts = familyTilts(family);
  return {
    sex, birthYear, age: 0, year: birthYear, alive: true, county, birthCounty: county, abroad: null, name: name ? name.full : "",
    edu: "none", studying: false, track: null,
    employed: false, job: null, career: 0, income: 0, savings: 0, debt: 0, retired: false, unemployedFor: 0,
    rel: "single", partner: null, exes: [], since: null, marriages: 0, divorces: 0, guard: 0, crisis: 0, spells: [],
    kids: [], friends: [], siblings: siblingsOf(family, birthYear, rng), tilts,
    traits: initTraits(analysis, rng),   // traitBase is set right after, from these
    health: { chronic: false, serious: null, checkups: false, hr: 1, fitness: 0.5, smoke: false, drink: false, stress: 0.3 },
    father: { alive: true, age: fatherAge, name: (father && father.name) || "" },
    mother: { alive: true, age: motherAge, name: (mother && mother.name) || "" },
    home: "parents", happiness: 60 + 40 * tilts.childhood, done: new Set(), count: {}, last: {}, flags: {}, arcs: {}, memory: [],
    jobsHeld: [], lean: { offered: 0, followed: 0 }, written: 0,
  };
}

// Brothers and sisters, each { relation, label, name, older, bornAt, born }: bornAt is your age in the year they
// were born (negative for older ones). Given siblings come from the family input; a younger one joins the story in
// the year of their birth. Otherwise the number comes from the fertility of your birth year, and younger ones are
// born at random (the "sibling" event).
function siblingsOf(family, birthYear, rng) {
  const given = family ? family.members.filter(m => isSibling(m.relation)) : [];
  if (given.length || (family && family.onlyChild)) {
    let undated = 0;
    const list = given.map(m => {
      const older = isOlder(m.relation);
      const bornAt = m.date ? (older ? Math.min(0, m.date.y - birthYear) : Math.max(0, m.date.y - birthYear)) : older ? -2 : 2 + 2 * undated++;
      return { relation: m.relation, label: m.label, name: m.name, older, bornAt, born: older };
    });
    return { list, unborn: 0 };
  }
  const { older, younger } = R.siblings(birthYear, rng);
  const list = Array.from({ length: older }, (_, i) => {
    const relation = rng() < 0.5 ? "olderBrother" : "olderSister";
    return { relation, label: RELATIONS[relation], name: "", older: true, bornAt: -2 * (older - i), born: true };
  });
  return { list, unborn: younger };
}

// Family charts tilt events between you and one person (`about`), else childhood family events, and study.
// familyTilts keeps each part within ±0.15.
function familyTilt(ev, s) {
  const t = s.tilts, sign = ev.channel === "good" ? 1 : ev.channel === "bad" ? -1 : 0;
  if (!sign) return 0;
  let v = 0;
  if (ev.about && t.bond[ev.about] !== undefined) v += t.bond[ev.about];
  else if (ev.domain === "family" && s.age <= 17) v += t.childhood;
  if (ev.domain === "study") v += t.study;
  return sign * v;
}

// The name and family part of an event's tilt. A grave event (a death, a serious illness) gets none (研究三、四).
export function personalTilt(ev, s, nameEffects) {
  if (!ev.channel || ev.grave) return 0;
  return nameTilt(nameEffects, s.age, ev.domain, ev.channel) + familyTilt(ev, s);
}

// How a choice leaves its mark on the person: bold choices make you bolder, and so on.
// Opposite styles move the same traits in opposite directions, and every year each trait drifts 5 % of the way back
// toward where it started, so a long life of choices shapes the person without running away.
const STYLE_NUDGE = { risk: [["drive", 0.02], ["caution", -0.02]], safe: [["caution", 0.02], ["drive", -0.02]], family: [["warmth", 0.02]], self: [["warmth", -0.02]], health: [["health", 0.02]], social: [["warmth", 0.01], ["curiosity", 0.01]], learn: [["curiosity", 0.02]] };

//   majorOnly  ask the player only the big decisions (core.js and work.js); everyday choices follow the personality
export function createLife({ chart, analysis, luck, sex = chart.input.sex, seed = 1, auto = false, policy = null, county = null, name = null, family = null, majorOnly = false }) {
  const rng = makeRng(seed);
  // A separate stream decides whether the calibrated core events happen and who dies when, so adding a story
  // event (which draws from rng) does not reshuffle the statistics.
  const fate = makeRng((seed ^ 0x5bd1e995) >>> 0);
  const s = initialState({ sex, birthYear: chart.input.date.y, county: county || placeCounty(chart.input.place), rng, family, name, analysis });
  s.traitBase = { ...s.traits };
  const log = [], kline = [];
  let queue = null, pending = null, open = 60;
  // Pacing: the choices asked this year. The core ones always come; a story choice waits for a year without one.
  let choicesThisYear = 0;

  const yearLuck = age => luck[Math.max(0, Math.min(luck.length - 1, age - 1))];
  // An event's ln-odds tilt this year: the chart's yearly luck, then the name and the family charts.
  const luckTilt = ev => {
    const l = yearLuck(s.age);
    return ev.channel && l && s.age > 0 ? l.m[ev.domain][ev.channel] : 0;
  };
  const tiltOf = ev => luckTilt(ev) + personalTilt(ev, s, name && name.effects);

  // Wording. A list of templates gives one this life has not used yet; every template is expanded with the
  // story's usual words ({partner}, {city}, {kid}…) plus `vars`, and a sentence already told is told differently.
  s.used = new Set();
  // The friend and the trip of one event stay the same from its question to its result (fire() starts a new scene).
  let scene = {};
  const slots = () => ({
    city: s.abroad || s.county || chart.input.place.name, job: s.job ? s.job.title : "工作",
    partner: s.partner ? s.partner.call : "另一半", ta: pronoun(s.partner),
    kid: s.kids.length ? s.kids[s.kids.length - 1].call : "孩子", kids: s.kids.length > 1 ? "孩子們" : "孩子",
    friend: () => (scene.friend ??= (() => { const f = s.friends.filter(x => x.alive); return f.length ? rng.pick(f).call : "老朋友"; })()),
    grand: s.sex === "female" ? "阿嬤" : "阿公", chat: chatTool(s.year), trip: () => (scene.trip ??= tripPlace(s, ctx)), age: s.age, year: s.year,
  });
  function words(templates, vars = {}) {
    const list = Array.isArray(templates) ? templates : [templates];
    const fresh = list.filter(t => !s.used.has(t));
    const template = rng.pick(fresh.length ? fresh : list);
    s.used.add(template);
    const all = { ...slots(), ...vars };
    let text = expand(template, all, rng);
    for (let i = 0; i < 6 && s.used.has(text); i++) text = expand(template, all, rng);
    s.used.add(text);
    return text;
  }

  const ctx = {
    rng, R, chart, analysis, s, luckAt: yearLuck, tiltOf, name, family, w: words,
    // The chance of a good (or bad) turn of `domain` this year, from a base probability.
    odds: (domain, channel, p) => tilt(p, tiltOf({ domain, channel })),
    roll: (domain, channel, p) => rng() < tilt(p, tiltOf({ domain, channel })),
    person: opts => newPerson(s, ctx, opts),
    remember: (kind, text, extra = {}) => s.memory.push({ kind, text, age: s.age, ...extra }),
    nudge: (key, delta) => nudge(s, key, delta),
    arc: {
      // An arc already under way is kept, not restarted.
      start: (id, data = {}, inYears = 1, stage = "start") => s.arcs[id] || (s.arcs[id] = { stage, next: s.age + inYears, since: s.age, data }),
      at: (id, stage) => !!s.arcs[id] && s.arcs[id].stage === stage && s.age >= s.arcs[id].next,
      go: (id, stage, inYears = 1) => { if (s.arcs[id]) { s.arcs[id].stage = stage; s.arcs[id].next = s.age + inYears; } },
      end: (id, outcome = true) => { delete s.arcs[id]; s.flags[`arc_${id}`] = outcome; },
      get: id => s.arcs[id] || null,
    },
  };

  // A reason from this year's chart, if the yearly luck clearly tilted the event's domain this year.
  // A reason tagged for a person (mother, spouse…) only explains events about that person.
  const reasonFor = (ev, l, lnm) => {
    if (Math.abs(lnm) < 0.15 || !l) return null;
    const fits = x => x.domains.includes(ev.domain) && (!x.tags || (ev.tags || []).some(t => x.tags.includes(t)));
    const r = l.reasons.find(x => fits(x) && x.tags) || l.reasons.find(fits);
    return r ? r.text : null;
  };
  // For an event between you and a family member: their chart, when it pushed the event the way it went.
  const bondReason = ev => {
    if (!ev.about || !family) return null;
    const bond = s.tilts.bond[ev.about];
    if (bond === undefined || bond * (ev.channel === "good" ? 1 : -1) < 0.045) return null;
    const members = family.members.filter(m => m.bond && (ev.about === "siblings" ? isSibling(m.relation) : m.relation === ev.about));
    if (!members.length) return null;
    const who = members.length === 1 ? members[0].label : "兄弟姊妹";
    const notes = [...new Set(members.flatMap(m => m.bond.notes.filter(n => Math.sign(n.score) === Math.sign(bond)).map(n => n.short)))];
    return `和${who}的命盤${bond > 0 ? "互補" : "需要磨合"}${notes.length ? `（${notes.slice(0, 2).join("、")}）` : ""}`;
  };
  // { text, from: "chart" | "family" }. A death is never explained by the chart: that would read as fate.
  const explain = (ev, l, lnm) => {
    if (ev.id === "death") return null;
    const chartReason = reasonFor(ev, l, lnm);
    if (chartReason) return { text: chartReason, from: "chart" };
    const familyReason = bondReason(ev);
    return familyReason ? { text: familyReason, from: "family" } : null;
  };

  // How an entry came about:  choice  the option's label    asked  it was a real choice (more than one option)
  //   free  the player wrote it    picked  chosen by the personality (majorOnly)
  function record(ev, out, l, lnm, { choice = null, asked = false, free = false, picked = false } = {}) {
    if (!out || !out.text) return null;
    const why = explain(ev, l, lnm);
    const entry = { age: s.age, year: s.year, id: ev.id, domain: ev.domain, channel: ev.channel, text: out.text, mood: out.mood || 0, reason: why && why.text, reasonFrom: why && why.from, big: !!(out.big || ev.big), choice, asked, free, picked };
    s.happiness = Math.max(0, Math.min(100, s.happiness + (out.mood || 0)));
    log.push(entry);
    // Big moments are remembered, so later years can look back on them.
    if (entry.big && ev.id !== "death" && ev.id !== "birth") s.memory.push({ kind: ev.id, text: out.text, age: s.age, year: s.year, mood: out.mood || 0 });
    return entry;
  }

  // The options a choice offers right now: those whose condition holds, with their weights for the auto player.
  // A calibrated choice (its weights reproduce a statistic) is answered by the weights alone, not the personality.
  function offered(c, ev) {
    const options = c.options.filter(o => !o.when || o.when(s, ctx));
    return options.map(o => ({ ...o, w: Math.max(0, typeof o.weight === "function" ? o.weight(s, ctx) : o.weight ?? 1) * (ev.calibrated ? 1 : styleWeight(s.traits, o.style)) }));
  }
  // A choice nudges the personality by how it differs from what a typical person would pick here (the weights of the
  // options on offer), so a population does not drift one way, while someone who keeps choosing boldly grows bolder.
  function applyOption(option, list = [option]) {
    const out = option.apply ? option.apply(s, ctx) : act(option.act, s, ctx, { label: option.label });
    const total = list.reduce((a, o) => a + (o.w || 0), 0) || 1, delta = {};
    for (const [k, d] of STYLE_NUDGE[option.style] || []) delta[k] = (delta[k] || 0) + d;
    for (const o of list) for (const [k, d] of STYLE_NUDGE[o.style] || []) delta[k] = (delta[k] || 0) - d * (o.w || 0) / total;
    for (const [k, d] of Object.entries(delta)) nudge(s, k, d);
    return out;
  }

  function fire(ev, l, lnm) {
    scene = {};
    s.done.add(ev.id); s.count[ev.id] = (s.count[ev.id] || 0) + 1; s.last[ev.id] = s.age;
    if (ev.choice) {
      const c = ev.choice(s, ctx);
      if (!c) return;
      const options = offered(c, ev);
      if (!options.length) return;
      if (options.length > 1) choicesThisYear += 1;
      const everyday = majorOnly && !ev.major;
      if (auto || options.length === 1 || everyday) {
        const i = policy ? policy(ev, { ...c, options }, s, ctx) : rng.weighted(options.map((o, k) => [k, o.w || 0.0001]));
        record(ev, applyOption(options[i], options), l, lnm, { choice: options[i].label, asked: options.length > 1, picked: everyday && !auto && options.length > 1 });
        return;
      }
      // The option this person's nature leans to (styleWeight from the traits), when the lean is clear.
      // Only options with a style take part, and at least two must, so the lean is between real alternatives.
      const ws = options.map(o => (o.style ? styleWeight(s.traits, o.style) : 0));
      const top = ws.indexOf(Math.max(...ws)), second = Math.max(0, ...ws.filter((_, k) => k !== top));
      const lean = ws.filter(w => w > 0).length >= 2 && second > 0 && ws[top] >= 1.12 * second ? top : -1;
      pending = {
        id: ev.id, prompt: c.prompt, why: explain(ev, l, lnm), lean,
        options: options.map((o, k) => ({ id: o.id || null, label: o.label, hint: o.hint || "", act: o.act || null, style: o.style || null, lean: k === lean })),
        // What the free-text interpreter needs: the question, the protagonist in a few words, and the buttons.
        free: c.free === false ? null : { situation: c.prompt, context: c.context || situationContext(s), options: options.filter(o => o.id).map(o => ({ id: o.id, label: o.label })) },
        ev, c, list: options, l, lnm,
      };
      return;
    }
    record(ev, ev.apply(s, ctx), l, lnm);
  }

  function eligible(ev) {
    if (ev.once && s.done.has(ev.id)) return false;
    if (ev.max && (s.count[ev.id] || 0) >= ev.max) return false;
    if (ev.ages && (s.age < ev.ages[0] || s.age > ev.ages[1])) return false;
    if (ev.cooldown && s.last[ev.id] !== undefined && s.age - s.last[ev.id] < ev.cooldown) return false;
    return !ev.when || ev.when(s, ctx);
  }

  function runQueue() {
    const l = yearLuck(s.age);
    while (queue.length) {
      const ev = queue.shift();
      if (ev.choice && !ev.core && choicesThisYear > 0) continue;
      if (!eligible(ev)) continue;
      const p0 = ev.p(s, ctx), fromLuck = luckTilt(ev);
      if ((ev.core ? fate() : rng()) < tilt(p0, fromLuck + personalTilt(ev, s, name && name.effects))) {
        fire(ev, l, fromLuck);
        if (pending) return false;
      }
    }
    return true;
  }

  function endYear() {
    const l = yearLuck(s.age);
    // Death: the healthy baseline from the life table, raised by chronic disease and by a serious illness in its
    // first five years, then tilted by the year's health luck.
    const ill = s.health.serious ? R.seriousFatality(s.health.serious.type, s.age - s.health.serious.since, s.health.checkups, s.health.serious.since, s.sex) : 0;
    const q = Math.min(0.999, R.death(s.age, s.sex, s.year) * s.health.hr + ill);
    const lnm = l && s.age > 0 ? l.m.health.bad : 0;
    if (s.age >= MAX_AGE || fate() < tilt(q, lnm)) {
      s.alive = false;
      closeSpell(s, "death");
      record(deathEvent, deathEvent.apply(s, ctx), l, lnm);
    }
    // Mood drifts toward a baseline set by the year's luck and the person's situation.
    const base = 50 + 25 * (l ? l.L : 0) + (s.rel === "married" ? 5 : 0) + (s.kids.length ? 3 : 0) + (s.employed ? 4 : 0)
      - (s.unemployedFor ? 8 : 0) - (s.health.serious ? 12 : 0) + (s.home === "own" ? 3 : 0) - (s.debt > 0 ? 3 : 0);
    s.happiness += 0.25 * (base - s.happiness);
    s.happiness = Math.max(0, Math.min(100, s.happiness));
    const moods = log.filter(e => e.age === s.age).map(e => e.mood);
    let lo = open, hi = open, x = open;
    for (const m of moods) { x += m; lo = Math.min(lo, x); hi = Math.max(hi, x); }
    kline.push({ age: s.age, year: s.year, open: Math.round(open), close: Math.round(s.happiness), high: Math.round(Math.max(hi, s.happiness)), low: Math.round(Math.min(lo, s.happiness)), luck: l ? l.score : 50 });
    open = s.happiness;
    // Every job held, with its element, for the ending's 命盤與這一生.
    if (s.job && (!s.jobsHeld.length || s.jobsHeld[s.jobsHeld.length - 1].title !== s.job.title)) s.jobsHeld.push({ title: s.job.title, field: s.job.field, element: jobElement(s.job), age: s.age });
    if (s.alive) {
      s.age += 1; s.year += 1;
      s.father.age += 1; s.mother.age += 1;
      if (s.partner) s.partner.age += 1;
      for (const k of s.kids) k.age += 1;
      if (s.guard > 0) s.guard -= 1;
      if (s.crisis > 0) s.crisis -= 1;
      if (s.retired) s.unemployedFor = 0;
      else if (!s.employed && s.done.has("firstJob")) s.unemployedFor += 1;
      for (const k of Object.keys(s.traits)) s.traits[k] += 0.05 * (s.traitBase[k] - s.traits[k]);
      const rate = s.flags.frugalUntil >= s.age ? 0.22 : 0.15;
      if (s.employed) s.savings += rate * s.income * (s.rel === "married" ? 1.5 : 1) - 0.04 * s.kids.filter(k => k.age < 22).length;
      // Debt is paid from savings as far as they go; what cannot be paid this year stays owed.
      if (s.debt > 0) { const pay = Math.min(s.debt, 0.15, Math.max(0, s.savings)); s.debt -= pay; s.savings -= pay; }
      s.savings = Math.max(0, s.savings);
    }
  }

  function finishYear() {
    if (runQueue()) { queue = null; endYear(); }
  }

  // Advance one year (or finish the year a choice interrupted). Returns the new log entries.
  function step() {
    if (!s.alive || pending) return [];
    const from = log.length;
    if (!queue) { queue = ALL_EVENTS.slice(); choicesThisYear = 0; }
    if (!runQueue()) return log.slice(from);
    queue = null;
    endYear();
    return log.slice(from);
  }

  function choose(i, byPlayer = true) {
    if (!pending) return [];
    const { ev, list, l, lnm, lean } = pending;
    pending = null;
    const from = log.length;
    const k = Math.max(0, Math.min(list.length - 1, i)), option = list[k];
    if (lean >= 0 && byPlayer) { s.lean.offered += 1; if (k === lean) s.lean.followed += 1; }
    record(ev, applyOption(option, list), l, lnm, { choice: option.label, asked: true });
    finishYear();
    return log.slice(from);
  }

  // What the player wrote, once read: `action` is one of this choice's option ids or a general action id
  // (actions.js), `summary` the player's decision in a few words. A general action may not be possible right now
  // (marrying with no partner, buying a home without the down payment); then nothing happens and the reason comes
  // back, so the player can choose again.
  function chooseAction({ action, summary = "" }) {
    if (!pending) return { entries: [] };
    const { ev, c, list, l, lnm } = pending;
    const own = list.find(o => o.id && o.id === action);
    let out;
    if (own) out = applyOption(own, list);
    else if (ACTIONS[action]) out = act(action, s, ctx, { situation: ev.id, domain: ev.domain, about: ev.about, summary, topic: topicOf(c) });
    else return { infeasible: "看不出要怎麼做，換個說法試試看。", entries: [] };
    if (out && out.infeasible) return { infeasible: out.infeasible, entries: [] };
    // A storyline choice says how a written answer moves it on (work.js: the startup's second year, the exam).
    if (!own && c.onFree) c.onFree(action, s, ctx);
    pending = null;
    s.written += 1;
    const from = log.length;
    const label = summary || (own ? own.label : ACTIONS[action].label);
    record(ev, out, l, lnm, { choice: label, asked: true, free: true });
    finishYear();
    return { entries: log.slice(from) };
  }

  // Answer the pending choice the way the auto policy would (for "skip to the end").
  function autoChoose() {
    if (!pending) return [];
    return choose(rng.weighted(pending.list.map((o, k) => [k, o.w || 0.0001])), false);
  }

  return {
    state: s, log, kline,
    step, choose, chooseAction, autoChoose,
    setMajorOnly(on) { majorOnly = !!on; },
    get pending() { return pending && { id: pending.id, prompt: pending.prompt, options: pending.options, why: pending.why, free: pending.free, lean: pending.lean }; },
    get done() { return !s.alive; },
  };
}

// What a choice is about, to open the story line of an answer the player wrote: the choice's own `topic`, else the
// first sentence of its question when it has one before the question itself ("公司裁員，你被列在名單上").
export function topicOf(c) {
  if (c.topic) return c.topic;
  const m = /^([^。？?！!]+)[。！!]/.exec(String(c.prompt || ""));
  return m ? m[1].trim() : "";
}

// The protagonist in a few words, for the free-text interpreter: no names, no birth data.
export function situationContext(s) {
  const parts = [`${s.age} 歲`, s.sex === "female" ? "女性" : "男性"];
  if (s.studying) parts.push(`在讀${s.track || "書"}`);
  else if (s.retired) parts.push("已退休");
  else if (s.employed && s.job) parts.push(`工作是${s.job.title}`);
  else if (s.done.has("firstJob")) parts.push("目前沒有工作");
  parts.push({ single: "單身", dating: "交往中", married: "已婚", divorced: "離婚", widowed: "喪偶" }[s.rel] || "單身");
  if (s.kids.length) parts.push(`${s.kids.length} 個孩子`);
  parts.push(s.savings >= 3 ? "存款充裕" : s.savings >= 1 ? "有一些存款" : "存款不多");
  return parts.join("，");
}

// Run a whole life without stopping.
export function runLife(opts) {
  const life = createLife({ ...opts, auto: true });
  while (!life.done) life.step();
  return life;
}

function placeCounty(place) {
  if (!place || place.tz !== "Asia/Taipei") return null;
  const m = /^(臺北市|新北市|基隆市|桃園市|新竹市|新竹縣|苗栗縣|臺中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|臺南市|高雄市|屏東縣|宜蘭縣|花蓮縣|臺東縣|澎湖縣|金門縣|連江縣)/.exec(place.name);
  return m ? m[1] : null;
}
