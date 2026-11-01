// Solar time at a longitude.
//
//   mean solar time = UTC + longitude × 4 minutes per degree
//   true solar time = mean solar time + equation of time
//
// The equation of time uses the NOAA solar calculator formulas (Meeus, Astronomical Algorithms, ch. 25 and 28).
// Checked against astronomy-engine in test/solar.test.js: within 5 seconds from 1900 to 2100.
import { msToFields } from "./time.js";

const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;

// Apparent minus mean solar time, in minutes, at instant `ms`.
export function equationOfTime(ms) {
  const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525;
  const L0 = rad(((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360);
  const M = rad(357.52911 + T * (35999.05029 - T * 0.0001537));
  const e = 0.016708634 - T * (0.000042037 + T * 0.0000001267);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = rad(eps0 + 0.00256 * Math.cos(rad(125.04 - 1934.136 * T)));
  const y = Math.tan(eps / 2) ** 2;
  const E = y * Math.sin(2 * L0) - 2 * e * Math.sin(M) + 4 * e * y * Math.sin(M) * Math.cos(2 * L0)
    - 0.5 * y * y * Math.sin(4 * L0) - 1.25 * e * e * Math.sin(2 * M);
  return 4 * deg(E);
}

// Minutes to add to UTC to get solar time at `lon` (degrees east positive).
export function solarShift(ms, lon, mode = "true") {
  const longitude = lon * 4;
  const eot = mode === "true" ? equationOfTime(ms) : 0;
  return { longitude, eot, total: longitude + eot };
}

// Calendar fields of solar time at `lon` for instant `ms`, to the second.
export function solarFields(ms, lon, mode = "true") {
  const shift = solarShift(ms, lon, mode);
  return { fields: msToFields(Math.round((ms + shift.total * 60000) / 1000) * 1000), shift };
}
