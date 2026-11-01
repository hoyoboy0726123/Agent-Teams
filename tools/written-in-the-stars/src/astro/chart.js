// The natal chart: tropical zodiac, Whole Sign houses, the ten bodies, the Ascendant and MC, major aspects,
// rulers, dignities and sect.
//
// Positions are apparent geocentric ecliptic longitudes of date (true equinox, with nutation, light time and
// aberration), the same quantity an astrologer's ephemeris prints. Against the Swiss Ephemeris (401 fixtures,
// test/astro-chart.test.js) the worst errors are 18″ (Neptune, Venus), 3″ for the Sun and Moon, 0.3″ for the
// Ascendant and MC.
import { MakeTime, SunPosition, EclipticGeoMoon, GeoVector, Rotation_EQJ_ECT, RotateVector, SphereFromVector, SiderealTime, e_tilt, Body } from "astronomy-engine";
import { localToUtc } from "./time.js";

export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
export const ELEMENTS = ["fire", "earth", "air", "water"];
export const MODALITIES = ["cardinal", "fixed", "mutable"];
export const elementOf = i => ELEMENTS[i % 4];
export const modalityOf = i => MODALITIES[i % 3];

export const BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
export const TRADITIONAL = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];
export const NAMES = { sun: "the Sun", moon: "the Moon", mercury: "Mercury", venus: "Venus", mars: "Mars", jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune", pluto: "Pluto", asc: "the Ascendant", mc: "the Midheaven" };
// Capitalised for the start of a sentence or a label: "Sun", "Moon", "Saturn".
export const LABELS = { sun: "Sun", moon: "Moon", mercury: "Mercury", venus: "Venus", mars: "Mars", jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune", pluto: "Pluto", asc: "Ascendant", mc: "Midheaven" };
const ENGINE_BODY = { mercury: Body.Mercury, venus: Body.Venus, mars: Body.Mars, jupiter: Body.Jupiter, saturn: Body.Saturn, uranus: Body.Uranus, neptune: Body.Neptune, pluto: Body.Pluto };

// Traditional rulers, by sign index. Mars rules Scorpio, Saturn Aquarius and Jupiter Pisces: the seven visible
// planets are the only lords of the year in annual profections. The modern co-rulers are kept for readings.
export const RULER = ["mars", "venus", "mercury", "moon", "sun", "mercury", "venus", "mars", "jupiter", "saturn", "saturn", "jupiter"];
export const MODERN_RULER = { 7: "pluto", 10: "uranus", 11: "neptune" };
const EXALTATION = { sun: 0, moon: 1, mercury: 5, venus: 11, mars: 9, jupiter: 3, saturn: 6 };

export const BENEFICS = ["venus", "jupiter"];
export const MALEFICS = ["mars", "saturn"];
// Sect: the Sun, Jupiter and Saturn belong to the day, the Moon, Venus and Mars to the night (Mercury to either).
export const SECT_OF = { sun: "day", jupiter: "day", saturn: "day", moon: "night", venus: "night", mars: "night" };

// Major aspects, with the orb allowed either side of exact. Two degrees more when the Sun or the Moon takes part.
export const ASPECTS = [
  { type: "conjunction", angle: 0, orb: 8, hard: true },
  { type: "sextile", angle: 60, orb: 4, hard: false },
  { type: "square", angle: 90, orb: 7, hard: true },
  { type: "trine", angle: 120, orb: 7, hard: false },
  { type: "opposition", angle: 180, orb: 8, hard: true },
];
export const LUMINARY_BONUS = 2;

export const norm360 = x => ((x % 360) + 360) % 360;
// Signed difference a − b folded into (−180, 180].
export const diff180 = (a, b) => { const d = norm360(a - b); return d > 180 ? d - 360 : d; };
// Angular separation 0–180.
export const separation = (a, b) => Math.abs(diff180(a, b));
export const signIndexOf = lon => Math.floor(norm360(lon) / 30) % 12;
const rad = Math.PI / 180, deg = 180 / Math.PI;

// Domicile, exaltation, detriment or fall of a traditional planet in a sign; null for none (and for the outer
// planets, which have no traditional dignities).
export function dignityOf(planet, signIndex) {
  if (!TRADITIONAL.includes(planet)) return null;
  if (RULER[signIndex] === planet) return "domicile";
  if (RULER[(signIndex + 6) % 12] === planet) return "detriment";
  if (EXALTATION[planet] === signIndex) return "exaltation";
  if (EXALTATION[planet] === (signIndex + 6) % 12) return "fall";
  return null;
}

// Apparent geocentric ecliptic longitude of date, in degrees, for a body at an AstroTime (or a Date).
export function longitudeOf(body, when) {
  const t = MakeTime(when);
  if (body === "sun") return norm360(SunPosition(t).elon);
  if (body === "moon") return norm360(EclipticGeoMoon(t).lon);
  const v = RotateVector(Rotation_EQJ_ECT(t), GeoVector(ENGINE_BODY[body], t, true));
  return norm360(SphereFromVector(v).lon);
}

// Daily motion in degrees per day (negative when retrograde), by a centred difference over one day.
export function speedOf(body, when) {
  const t = MakeTime(when);
  return diff180(longitudeOf(body, t.AddDays(0.5)), longitudeOf(body, t.AddDays(-0.5)));
}

// Ascendant and MC from the local apparent sidereal time, the true obliquity and the latitude.
//   RAMC θ = GAST + east longitude
//   MC  = atan2(sin θ, cos θ cos ε)
//   ASC = atan2(cos θ, −(sin θ cos ε + tan φ sin ε))
// Valid away from the polar circles (every place in places.js is below 65° N).
export function angles(when, lat, lon) {
  const t = MakeTime(when);
  const theta = norm360(SiderealTime(t) * 15 + lon) * rad;
  const eps = e_tilt(t).tobl * rad, phi = lat * rad;
  const mc = norm360(Math.atan2(Math.sin(theta), Math.cos(theta) * Math.cos(eps)) * deg);
  const asc = norm360(Math.atan2(Math.cos(theta), -(Math.sin(theta) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * deg);
  return { asc, mc, ramc: theta * deg };
}

const point = lon => {
  const i = signIndexOf(lon);
  return { lon, sign: SIGNS[i], signIndex: i, deg: lon - 30 * i };
};

// The tightest major aspect between two longitudes within the allowed orb, or null.
export function aspectBetween(lonA, lonB, bonus = 0) {
  const sep = separation(lonA, lonB);
  let best = null;
  for (const a of ASPECTS) {
    const orb = Math.abs(sep - a.angle);
    if (orb <= a.orb + bonus && (!best || orb < best.orb)) best = { type: a.type, angle: a.angle, orb, hard: a.hard };
  }
  return best;
}

// computeChart({ date: { y, m, d }, time: { h, mi } | null, place: { name, state, lat, lon, tz } })
export function computeChart({ date, time = null, place }) {
  const utc = localToUtc(date, time, place.tz);
  const t = MakeTime(utc.date);
  const timeKnown = utc.timeKnown;
  const ang = angles(t, place.lat, place.lon);
  const ascSign = signIndexOf(ang.asc);
  const houseOf = i => (timeKnown ? ((i - ascSign + 12) % 12) + 1 : null);

  const bodies = {};
  for (const b of BODIES) {
    const lon = longitudeOf(b, t);
    const speed = speedOf(b, t);
    const p = point(lon);
    bodies[b] = { ...p, house: houseOf(p.signIndex), retro: speed < 0, speed, dignity: dignityOf(b, p.signIndex) };
  }

  const aspects = [];
  for (let i = 0; i < BODIES.length; i++) for (let j = i + 1; j < BODIES.length; j++) {
    const a = BODIES[i], b = BODIES[j];
    const bonus = a === "sun" || a === "moon" || b === "sun" || b === "moon" ? LUMINARY_BONUS : 0;
    const asp = aspectBetween(bodies[a].lon, bodies[b].lon, bonus);
    if (asp) aspects.push({ a, b, ...asp });
  }

  // Day chart when the Sun is above the horizon: in houses 7–12, i.e. more than 180° past the Ascendant.
  const sect = timeKnown ? (norm360(bodies.sun.lon - ang.asc) > 180 ? "day" : "night") : null;
  const asc = timeKnown ? point(ang.asc) : null, mc = timeKnown ? point(ang.mc) : null;
  // The sign counting starts from: the rising sign, or the Sun's sign when the time is unknown (solar houses).
  const baseSign = timeKnown ? ascSign : bodies.sun.signIndex;

  return {
    input: { date: { ...date }, time: time ? { h: time.h, mi: time.mi || 0 } : null, place: { ...place } },
    utc: utc.date.toISOString(), ms: utc.ms, timeStatus: utc.status, offset: utc.offset, dst: utc.dst,
    timeKnown, bodies, asc, mc,
    houses: timeKnown ? Array.from({ length: 12 }, (_, k) => SIGNS[(ascSign + k) % 12]) : null,
    baseSign, aspects, sect,
    bigThree: { sun: bodies.sun.sign, moon: bodies.moon.sign, rising: asc ? asc.sign : null },
  };
}

// House (1–12) of a sign counted from the chart's base sign (the Ascendant's, or the Sun's when the time is unknown).
export const houseFrom = (chart, signIndex) => ((signIndex - chart.baseSign + 12) % 12) + 1;
// The sign index of house n (1–12) from the base sign.
export const signOfHouse = (chart, n) => (chart.baseSign + n - 1) % 12;
export const aspectsOf = (chart, body) => chart.aspects.filter(x => x.a === body || x.b === body).map(x => ({ ...x, other: x.a === body ? x.b : x.a }));
