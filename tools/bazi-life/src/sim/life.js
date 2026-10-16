// 人生模擬引擎：一年一年走，每件事的機率 = 台灣統計的基礎機率，再依當年流年傾斜（luck.js）。
//
// createLife() returns a life that advances one year per step(). When an event asks the player to choose,
// step() stops with `pending` set; choose(i) applies the option and finishes that year. In auto mode a policy
// answers instead, which is how "same chart, 100 runs" is simulated.
import { makeRng } from "./rng.js";
import { tilt } from "../core/luck.js";
import { EVENTS, deathEvent } from "./events.js";
import * as R from "./rates.js";

export const MAX_AGE = 110;

function initialState({ sex, birthYear, county, rng }) {
  const fatherAge = Math.round(rng.between(26, 36)), motherAge = Math.max(18, fatherAge - Math.round(rng.between(0, 5)));
  return {
    sex, birthYear, age: 0, year: birthYear, alive: true, county, abroad: null,
    edu: "none", studying: false, track: null,
    employed: false, job: null, career: 0, income: 0, savings: 0, retired: false, unemployedFor: 0,
    rel: "single", partnerAge: null, since: null, marriages: 0, divorces: 0, guard: 0, crisis: 0,
    kids: [], siblings: R.siblings(birthYear, rng),
    health: { chronic: false, serious: null, checkups: false, hr: 1 },
    father: { alive: true, age: fatherAge }, mother: { alive: true, age: motherAge },
    home: "parents", happiness: 60, done: new Set(), count: {}, last: {}, flags: {},
  };
}

export function createLife({ chart, analysis, luck, sex = chart.input.sex, seed = 1, auto = false, policy = null, county = null }) {
  const rng = makeRng(seed);
  const s = initialState({ sex, birthYear: chart.input.date.y, county: county || placeCounty(chart.input.place), rng });
  const log = [], kline = [];
  let queue = null, pending = null, open = 60;

  const yearLuck = age => luck[Math.max(0, Math.min(luck.length - 1, age - 1))];
  const ctx = { rng, R, chart, analysis, s, luckAt: yearLuck };

  // A reason from this year's chart, if the event's domain was clearly tilted this year.
  // A reason tagged for a person (mother, spouse…) only explains events about that person.
  const reasonFor = (ev, l, lnm) => {
    if (Math.abs(lnm) < 0.15 || !l) return null;
    const fits = x => x.domains.includes(ev.domain) && (!x.tags || (ev.tags || []).some(t => x.tags.includes(t)));
    const r = l.reasons.find(x => fits(x) && x.tags) || l.reasons.find(fits);
    return r ? r.text : null;
  };

  function record(ev, out, l, lnm, choice = null) {
    if (!out) return;
    // A death is never explained by the chart: that would read as fate.
    const reason = ev.id === "death" ? null : reasonFor(ev, l, lnm);
    const entry = { age: s.age, year: s.year, id: ev.id, domain: ev.domain, channel: ev.channel, text: out.text, mood: out.mood || 0, reason, big: !!(out.big || ev.big), choice };
    s.happiness = Math.max(0, Math.min(100, s.happiness + (out.mood || 0)));
    log.push(entry);
    return entry;
  }

  function fire(ev, l, lnm) {
    s.done.add(ev.id); s.count[ev.id] = (s.count[ev.id] || 0) + 1; s.last[ev.id] = s.age;
    if (ev.choice) {
      const c = ev.choice(s, ctx);
      if (!c) return;
      if (auto || !c.options.length) {
        const i = policy ? policy(ev, c, s, ctx) : rng.weighted(c.options.map((o, k) => [k, o.weight ?? 1]));
        record(ev, c.options[i].apply(s, ctx), l, lnm, c.options[i].label);
        return;
      }
      pending = { id: ev.id, prompt: c.prompt, options: c.options.map(o => ({ label: o.label, hint: o.hint || "" })), ev, c, l, lnm };
      return;
    }
    record(ev, ev.apply(s, ctx), l, lnm);
  }

  function eligible(ev) {
    if (ev.once && s.done.has(ev.id)) return false;
    if (ev.ages && (s.age < ev.ages[0] || s.age > ev.ages[1])) return false;
    if (ev.cooldown && s.last[ev.id] !== undefined && s.age - s.last[ev.id] < ev.cooldown) return false;
    return !ev.when || ev.when(s, ctx);
  }

  function runQueue() {
    const l = yearLuck(s.age);
    while (queue.length) {
      const ev = queue.shift();
      if (!eligible(ev)) continue;
      const p0 = ev.p(s, ctx);
      const lnm = ev.channel && l && s.age > 0 ? l.m[ev.domain][ev.channel] : 0;
      if (rng() < tilt(p0, lnm)) {
        fire(ev, l, lnm);
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
    if (s.age >= MAX_AGE || rng() < tilt(q, lnm)) {
      s.alive = false;
      record(deathEvent, deathEvent.apply(s, ctx), l, lnm);
    }
    // Mood drifts toward a baseline set by the year's luck and the person's situation.
    const base = 50 + 25 * (l ? l.L : 0) + (s.rel === "married" ? 5 : 0) + (s.kids.length ? 3 : 0) + (s.employed ? 4 : 0)
      - (s.unemployedFor ? 8 : 0) - (s.health.serious ? 12 : 0) + (s.home === "own" ? 3 : 0);
    s.happiness += 0.25 * (base - s.happiness);
    s.happiness = Math.max(0, Math.min(100, s.happiness));
    const moods = log.filter(e => e.age === s.age).map(e => e.mood);
    let lo = open, hi = open, x = open;
    for (const m of moods) { x += m; lo = Math.min(lo, x); hi = Math.max(hi, x); }
    kline.push({ age: s.age, year: s.year, open: Math.round(open), close: Math.round(s.happiness), high: Math.round(Math.max(hi, s.happiness)), low: Math.round(Math.min(lo, s.happiness)), luck: l ? l.score : 50 });
    open = s.happiness;
    if (s.alive) {
      s.age += 1; s.year += 1;
      s.father.age += 1; s.mother.age += 1;
      if (s.partnerAge !== null) s.partnerAge += 1;
      s.kids = s.kids.map(k => k + 1);
      if (s.guard > 0) s.guard -= 1;
      if (s.crisis > 0) s.crisis -= 1;
      if (!s.employed && s.done.has("firstJob") && !s.retired) s.unemployedFor += 1;
      if (s.employed) s.savings += 0.15 * s.income * (s.rel === "married" ? 1.5 : 1) - 0.04 * s.kids.filter(k => k < 22).length;
      s.savings = Math.max(0, s.savings);
    }
  }

  // Advance one year (or finish the year a choice interrupted). Returns the new log entries.
  function step() {
    if (!s.alive || pending) return [];
    const from = log.length;
    if (!queue) queue = EVENTS.slice();
    if (!runQueue()) return log.slice(from);
    queue = null;
    endYear();
    return log.slice(from);
  }

  function choose(i) {
    if (!pending) return [];
    const { ev, c, l, lnm } = pending;
    pending = null;
    const from = log.length;
    const option = c.options[Math.max(0, Math.min(c.options.length - 1, i))];
    record(ev, option.apply(s, ctx), l, lnm, option.label);
    if (runQueue()) { queue = null; endYear(); }
    return log.slice(from);
  }

  // Answer the pending choice the way the auto policy would (for "skip to the end").
  function autoChoose() {
    if (!pending) return [];
    const { c } = pending;
    return choose(rng.weighted(c.options.map((o, k) => [k, o.weight ?? 1])));
  }

  return {
    state: s, log, kline,
    step, choose, autoChoose,
    get pending() { return pending && { id: pending.id, prompt: pending.prompt, options: pending.options }; },
    get done() { return !s.alive; },
  };
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
