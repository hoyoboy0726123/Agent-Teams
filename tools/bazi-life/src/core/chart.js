// 命盤：先把出生時間校正成正確的時刻，再用 tyme4ts 排盤。
//
// Which clock each part of the chart reads (see 研究一：排盤精準度):
//   year and month pillars, and the start of the luck cycles, compare the birth INSTANT with the solar terms.
//     tyme4ts tabulates the terms in UTC+8, so the instant is expressed in UTC+8 for that comparison.
//   day and hour pillars use solar time at the birthplace: true solar time by default, or mean solar time.
//   solar "clock" skips every correction and reads the entered time as UTC+8 for everything, for comparing
//     with tools that do no correction.
import {
  SolarTime, SolarDay, SolarTerm, SixtyCycleYear, EightChar, ChildLimit, Gender, YinYang,
  DefaultChildLimitProvider, China95ChildLimitProvider, LunarSect1ChildLimitProvider, LunarSect2ChildLimitProvider,
} from "tyme4ts";
import { resolveWallTime, clockNotes, fieldsAt, fieldsToMs, msToFields, offsetAt, formatFields, formatOffset, HOUR, MINUTE } from "./time.js";
import { solarFields } from "./solar.js";
import { zh } from "./zh.js";

export const SOLAR_MODES = {
  true: "真太陽時（經度＋均時差）",
  mean: "平太陽時（只校正經度）",
  clock: "不校正（直接用輸入的時間）",
};
export const ZI_RULES = {
  early: "23 點換日（早子時）",
  late: "夜子時：23–24 點日柱算當天",
};
export const YUN_METHODS = {
  default: { label: "精確（3 天折 1 年，算到分鐘）", make: () => new DefaultChildLimitProvider() },
  china95: { label: "元亨利貞（算到天）", make: () => new China95ChildLimitProvider() },
  sect1: { label: "傳統（按時辰數，1 天折 4 個月）", make: () => new LunarSect1ChildLimitProvider() },
  sect2: { label: "傳統（算到小時）", make: () => new LunarSect2ChildLimitProvider() },
};
export const ROLES = { year: "年柱", month: "月柱", day: "日柱", hour: "時柱" };
const HIDDEN_TYPES = ["餘氣", "中氣", "本氣"];
const ELEMENTS = ["木", "火", "土", "金", "水"];

const solarTimeOf = f => SolarTime.fromYmdHms(f.y, f.m, f.d, f.h, f.mi, f.s || 0);
const termMs = term => { const t = term.getJulianDay().getSolarTime(); return fieldsToMs({ y: t.getYear(), m: t.getMonth(), d: t.getDay(), h: t.getHour(), mi: t.getMinute(), s: t.getSecond() }); };

// The two clocks the pillars read, for one instant. `wallMs` is the entered reading taken as UTC (clock mode).
function basesAt(utc, wallMs, place, solar) {
  if (solar === "clock") { const f = msToFields(wallMs); return { term: f, solar: f, shift: null }; }
  const s = solarFields(utc, place.lon, solar);
  return { term: msToFields(utc + 8 * HOUR), solar: s.fields, shift: s.shift };
}

function pillarsFrom(bases, hourKnown, zi, date) {
  const sch = solarTimeOf(bases.term).getLunarHour().getSixtyCycleHour();
  const out = { year: sch.getYear(), month: sch.getMonth() };
  if (hourKnown) {
    const lh = solarTimeOf(bases.solar).getLunarHour();
    out.day = zi === "late" ? lh.getLunarDay().getSixtyCycle() : lh.getSixtyCycleHour().getDay();
    out.hour = lh.getSixtyCycle();
  } else {
    out.day = SolarDay.fromYmd(date.y, date.m, date.d).getLunarDay().getSixtyCycle();
  }
  return out;
}

const names = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.getName()]));

function describePillar(role, sc, dm) {
  const stem = sc.getHeavenStem(), branch = sc.getEarthBranch();
  return {
    role, label: ROLES[role], name: sc.getName(),
    stem: {
      name: stem.getName(), element: stem.getElement().getName(), yang: stem.getYinYang() === YinYang.YANG,
      god: role === "day" ? "日主" : zh(dm.getTenStar(stem).getName()),
    },
    branch: {
      name: branch.getName(), element: branch.getElement().getName(), zodiac: zh(branch.getZodiac().getName()),
      god: zh(dm.getTenStar(branch.getHideHeavenStemMain()).getName()),
      hidden: branch.getHideHeavenStems().slice().sort((a, b) => b.getType() - a.getType()).map(h => ({
        name: h.getHeavenStem().getName(), element: h.getHeavenStem().getElement().getName(),
        type: HIDDEN_TYPES[h.getType()], god: zh(dm.getTenStar(h.getHeavenStem()).getName()),
      })),
    },
    nayin: zh(sc.getSound().getName()),
    terrain: zh(dm.getTerrain(branch).getName()),
    seat: zh(stem.getTerrain(branch).getName()),
    void: sc.getExtraEarthBranches().map(b => b.getName()).join(""),
  };
}

function godsOf(sc, dm) {
  return { stem: zh(dm.getTenStar(sc.getHeavenStem()).getName()), branch: zh(dm.getTenStar(sc.getEarthBranch().getHideHeavenStemMain()).getName()) };
}

// How far the birth time can move before each pillar changes, and what it changes to.
function sensitivity(ctx, bases, pillars) {
  const out = [];
  const shiftTo = (role, minutes) => names(ctx.pillarsAtShift(minutes))[role];
  const add = (role, earlier, later) => out.push({
    role, label: ROLES[role],
    earlier: { minutes: earlier, becomes: shiftTo(role, -(earlier + 0.5)) },
    later: { minutes: later, becomes: shiftTo(role, later + 0.5) },
  });
  if (ctx.hourKnown) {
    const t = bases.solar.h * 60 + bases.solar.mi + bases.solar.s / 60;
    const marks = [-60, ...Array.from({ length: 12 }, (_, k) => 60 + 120 * k), 1500];
    const prev = Math.max(...marks.filter(b => b <= t)), next = Math.min(...marks.filter(b => b > t));
    add("hour", t - prev, next - t);
    const [dPrev, dNext] = ctx.zi === "late" ? [0, 1440] : t >= 1380 ? [1380, 2820] : [-60, 1380];
    add("day", t - dPrev, dNext - t);
  }
  const now = fieldsToMs(bases.term);
  let jie = solarTimeOf(bases.term).getTerm();
  if (!jie.isJie()) jie = jie.next(-1);
  add("month", (now - termMs(jie)) / MINUTE, (termMs(jie.next(2)) - now) / MINUTE);
  const y = bases.term.y, spring = termMs(SolarTerm.fromIndex(y, 3));
  const [sPrev, sNext] = now < spring ? [termMs(SolarTerm.fromIndex(y - 1, 3)), spring] : [spring, termMs(SolarTerm.fromIndex(y + 1, 3))];
  add("year", (now - sPrev) / MINUTE, (sNext - now) / MINUTE);
  for (const s of out) for (const side of ["earlier", "later"]) s[side].minutes = Math.round(s[side].minutes * 10) / 10;
  return { list: out, jie: { prev: jie, next: jie.next(2) } };
}

export function computeChart({ date, time = null, place, sex = "male", options = {} }) {
  const opts = { solar: "true", zi: "early", yun: "default", occurrence: 0, ...options };
  if (!SOLAR_MODES[opts.solar] || !ZI_RULES[opts.zi] || !YUN_METHODS[opts.yun]) throw new Error("unknown option");
  if (!(date.y >= 1801 && date.y <= 2199)) throw new Error("year out of range");
  const hourKnown = !!time;
  const wall = { y: date.y, m: date.m, d: date.d, h: hourKnown ? time.h : 12, mi: hourKnown ? time.mi : 0, s: 0 };
  const resolved = resolveWallTime(wall, place.tz);
  const chosen = Math.min(opts.occurrence, resolved.instants.length - 1);
  const utc = resolved.instants[chosen];
  const wallMs = fieldsToMs(wall);
  const bases = basesAt(utc, wallMs, place, opts.solar);
  const ctx = {
    hourKnown, zi: opts.zi,
    pillarsAtShift: min => pillarsFrom(basesAt(utc + min * MINUTE, wallMs + min * MINUTE, place, opts.solar), hourKnown, opts.zi, date),
  };
  const sc = pillarsFrom(bases, hourKnown, opts.zi, date);
  const dm = sc.day.getHeavenStem();
  const roles = hourKnown ? ["year", "month", "day", "hour"] : ["year", "month", "day"];
  const pillars = roles.map(r => describePillar(r, sc[r], dm));

  const elements = Object.fromEntries(ELEMENTS.map(e => [e, 0]));
  for (const p of pillars) { elements[p.stem.element]++; elements[p.branch.element]++; }

  const clock = clockNotes(utc, place.tz);
  const warnings = [];
  if (resolved.status === "ambiguous") warnings.push({ kind: "ambiguous", text: `這個時間在當地出現了兩次（日光節約時間結束時，時鐘撥回一小時）。目前用第 ${chosen + 1} 次，可以切換。` });
  if (resolved.status === "gap") warnings.push({ kind: "gap", text: `這個時間在當地不存在（日光節約時間開始時，時鐘直接跳過 ${resolved.skipped} 分鐘），已當成標準時間計算。` });
  if (opts.solar !== "clock" && resolved.status !== "gap") warnings.push(...clock.notes);
  if (!hourKnown) warnings.push({ kind: "hour", text: "時辰不詳：只排年、月、日三柱，起運以中午 12 點估算。" });

  const sens = sensitivity(ctx, bases, sc);
  // Unknown hour: a solar term during that day leaves the month (or year) pillar open.
  if (!hourKnown) {
    const at = h => { const r = resolveWallTime({ ...wall, h, mi: h ? 59 : 0, s: h ? 59 : 0 }, place.tz); return r.instants[0]; };
    const p0 = pillarsFrom(basesAt(at(0), fieldsToMs({ ...wall, h: 0, mi: 0 }), place, opts.solar), false, opts.zi, date);
    const p1 = pillarsFrom(basesAt(at(23), fieldsToMs({ ...wall, h: 23, mi: 59, s: 59 }), place, opts.solar), false, opts.zi, date);
    if (p0.month.getName() !== p1.month.getName()) {
      const day = formatFields({ ...wall, h: 0, mi: 0 }).slice(0, 10);
      const j = localTermTime(sens.jie.prev, place, opts.solar).startsWith(day) ? sens.jie.prev : sens.jie.next;
      const local = localTermTime(j, place, opts.solar);
      warnings.push({ kind: "jie", text: `這一天 ${local.slice(11)} 交「${zh(j.getName())}」：在那之前出生，月柱是 ${p0.month.getName()}${p0.year.getName() !== p1.year.getName() ? `、年柱是 ${p0.year.getName()}` : ""}；之後是 ${p1.month.getName()}${p0.year.getName() !== p1.year.getName() ? `、${p1.year.getName()}` : ""}。` });
    }
  }

  // Luck cycles. ChildLimit reads its own year and month pillars from the same instant, so they match ours.
  const saved = ChildLimit.provider;
  ChildLimit.provider = YUN_METHODS[opts.yun].make();
  let cl;
  try { cl = ChildLimit.fromSolarTime(solarTimeOf(bases.term), sex === "female" ? Gender.WOMAN : Gender.MAN); }
  finally { ChildLimit.provider = saved; }
  const decades = [];
  for (let i = 0, df = cl.getStartDecadeFortune(); i < 10; i++, df = df.next(1)) {
    const s = df.getSixtyCycle();
    decades.push({
      name: s.getName(), startAge: df.getStartAge(), endAge: df.getEndAge(),
      startYear: df.getStartSixtyCycleYear().getYear(), endYear: df.getEndSixtyCycleYear().getYear(),
      gods: godsOf(s, dm), nayin: zh(s.getSound().getName()),
    });
  }
  const end = cl.getEndTime();
  const startLocal = opts.solar === "clock"
    ? { y: end.getYear(), m: end.getMonth(), d: end.getDay() }
    : fieldsAt(fieldsToMs({ y: end.getYear(), m: end.getMonth(), d: end.getDay(), h: end.getHour(), mi: end.getMinute(), s: end.getSecond() }) - 8 * HOUR, place.tz);
  const years = [];
  for (let age = 1; age <= Math.max(100, decades[decades.length - 1].endAge); age++) {
    const year = date.y + age - 1, s = SixtyCycleYear.fromYear(year).getSixtyCycle();
    years.push({ year, age, name: s.getName(), gods: godsOf(s, dm) });
  }

  let extras = { dayVoid: pillars[2].void };
  if (hourKnown) {
    const ec = new EightChar(sc.year, sc.month, sc.day, sc.hour);
    extras = { ...extras, fetalOrigin: ec.getFetalOrigin().getName(), fetalBreath: ec.getFetalBreath().getName(), ownSign: ec.getOwnSign().getName(), bodySign: ec.getBodySign().getName() };
  }

  const shift = bases.shift;
  return {
    input: { date, time, place, sex, options: opts },
    hourKnown,
    pillars,
    dayMaster: { name: dm.getName(), element: dm.getElement().getName(), yang: dm.getYinYang() === YinYang.YANG },
    elements,
    missing: ELEMENTS.filter(e => !elements[e]),
    extras,
    zodiac: zh(sc.year.getEarthBranch().getZodiac().getName()),
    lunar: zh(SolarDay.fromYmd(date.y, date.m, date.d).getLunarDay().toString()),
    time: {
      status: resolved.status,
      occurrences: resolved.instants.map(ms => ({ utc: new Date(ms).toISOString(), offset: formatOffset(offsetAt(ms, place.tz)) })),
      chosen,
      entered: formatFields(wall),
      utc: new Date(utc).toISOString(),
      offset: formatOffset((wallMs - utc) / MINUTE),
      offsetMinutes: (wallMs - utc) / MINUTE,
      dstMinutes: resolved.status === "gap" ? 0 : clock.dst,
      termClock: formatFields(bases.term, true),
      solarClock: formatFields(bases.solar, true),
      shift: shift && { longitude: round(shift.longitude), eot: round(shift.eot), total: round(shift.total) },
      vsEntered: round((fieldsToMs(bases.solar) - wallMs) / MINUTE),
    },
    terms: {
      prev: { name: zh(sens.jie.prev.getName()), time: localTermTime(sens.jie.prev, place, opts.solar) },
      next: { name: zh(sens.jie.next.getName()), time: localTermTime(sens.jie.next, place, opts.solar) },
    },
    sensitivity: sens.list,
    variants: variants({ date, time, place, sex, options: opts }, names(sc)),
    luck: {
      forward: cl.isForward(), method: YUN_METHODS[opts.yun].label,
      start: { years: cl.getYearCount(), months: cl.getMonthCount(), days: cl.getDayCount(), hours: cl.getHourCount(), minutes: cl.getMinuteCount(), date: formatFields({ ...startLocal, h: 0, mi: 0 }).slice(0, 10), age: decades[0].startAge },
      decades,
    },
    years,
    warnings,
  };
}

const round = x => Math.round(x * 10) / 10;

// A solar term's moment on the birthplace's clock (or in UTC+8 for clock mode).
function localTermTime(term, place, solar) {
  const ms = termMs(term) - 8 * HOUR;
  return formatFields(solar === "clock" ? msToFields(ms + 8 * HOUR) : fieldsAt(ms, place.tz));
}

// Only the pillar names: for bulk checks, and for comparing settings or candidate birth times.
export function fourPillars({ date, time = null, place, options = {} }) {
  const opts = { solar: "true", zi: "early", occurrence: 0, ...options };
  const wall = { y: date.y, m: date.m, d: date.d, h: time ? time.h : 12, mi: time ? time.mi : 0, s: 0 };
  const r = resolveWallTime(wall, place.tz);
  const utc = r.instants[Math.min(opts.occurrence, r.instants.length - 1)];
  return names(pillarsFrom(basesAt(utc, fieldsToMs(wall), place, opts.solar), !!time, opts.zi, date));
}

// The pillars under the other settings, so a reader can see which choices matter for this birth.
function variants(input, current) {
  const o = input.options, alts = [];
  if (o.solar !== "clock") alts.push({ label: SOLAR_MODES.clock, options: { solar: "clock" } });
  if (o.solar !== "true") alts.push({ label: SOLAR_MODES.true, options: { solar: "true" } });
  if (o.solar !== "mean") alts.push({ label: SOLAR_MODES.mean, options: { solar: "mean" } });
  if (input.time) alts.push({ label: ZI_RULES[o.zi === "early" ? "late" : "early"], options: { zi: o.zi === "early" ? "late" : "early" } });
  return alts.map(a => {
    const p = fourPillars({ ...input, options: { ...o, ...a.options } });
    return { label: a.label, options: a.options, pillars: p, changed: Object.keys(p).filter(k => p[k] !== current[k]) };
  });
}
