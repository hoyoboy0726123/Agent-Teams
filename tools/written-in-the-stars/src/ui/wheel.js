// The chart wheel: an SVG of the natal chart for the reading's overview (src/astro/reading.js). The Ascendant is on
// the left and the zodiac runs counter-clockwise, as on a printed chart; whole sign houses share the sign boundaries,
// so the house numbers sit inside the sign ring. Planets sit on their true longitude (a tick on the inner circle),
// their glyphs nudged apart when they crowd, and the major aspects are drawn between the ticks: tensions solid,
// harmonies dashed (the legend and a text table go with it on the page). Without a birth time there is no Ascendant:
// the wheel starts at the Sun's sign (solar houses) and says so. Colors are CSS classes, so the page's light and dark
// themes apply.
import { SIGNS, BODIES, LABELS } from "../astro/chart.js";

const VS = "︎";   // text presentation, not emoji
export const PLANET_GLYPH = { sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂", jupiter: "♃", saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇" };
export const SIGN_GLYPH = SIGNS.map((_, i) => String.fromCodePoint(0x2648 + i));
const ELEMENT_CLASS = ["fire", "earth", "air", "water"];
const C = 200, R0 = 192, R1 = 160, R2 = 136, RP = 114, RA = 92;
const f = n => (Math.round(n * 10) / 10).toString();
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

// Spread glyph angles so neighbours are at least `gap` degrees apart, keeping each as close to its true place as it
// can (a few relaxation passes around the circle).
export function spread(lons, gap = 10.5) {
  const n = lons.length, order = lons.map((l, i) => i).sort((a, b) => lons[a] - lons[b]);
  const pos = order.map(i => lons[i]);
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      let d = pos[j] - pos[k];
      if (j === 0) d += 360;
      if (n > 1 && d < gap) { const push = (gap - d) / 2; pos[k] -= push; pos[j] += push; moved = true; }
    }
    if (!moved) break;
  }
  const out = new Array(n);
  order.forEach((i, k) => { out[i] = pos[k]; });
  return out;
}

export function wheelSVG(chart, { id = "wheel" } = {}) {
  const known = chart.timeKnown;
  const start = known ? chart.asc.lon : chart.baseSign * 30;
  // Longitude → point: the start of the chart on the left (180°), counter-clockwise.
  const at = (lon, r) => { const a = (180 + lon - start) * Math.PI / 180; return [C + r * Math.cos(a), C - r * Math.sin(a)]; };
  const parts = [];
  // The sign ring.
  for (let i = 0; i < 12; i++) {
    const a = i * 30, b = a + 30;
    const [x1, y1] = at(a, R0), [x2, y2] = at(b, R0), [x3, y3] = at(b, R1), [x4, y4] = at(a, R1);
    parts.push(`<path class="w-sign ${ELEMENT_CLASS[i % 4]}" d="M${f(x1)} ${f(y1)}A${R0} ${R0} 0 0 0 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${R1} ${R1} 0 0 1 ${f(x4)} ${f(y4)}Z"><title>${SIGNS[i]}</title></path>`);
    const [gx, gy] = at(a + 15, (R0 + R1) / 2);
    parts.push(`<text class="w-sglyph" x="${f(gx)}" y="${f(gy)}" aria-hidden="true">${SIGN_GLYPH[i]}${VS}</text>`);
    // The house number of this sign.
    const h = ((i - chart.baseSign + 12) % 12) + 1;
    const [hx, hy] = at(a + 15, (R1 + R2) / 2);
    parts.push(`<text class="w-house${[1, 4, 7, 10].includes(h) && known ? " ang" : ""}" x="${f(hx)}" y="${f(hy)}" aria-hidden="true">${h}</text>`);
    const [lx1, ly1] = at(a, R0), [lx2, ly2] = at(a, R2);
    parts.push(`<line class="w-cusp" x1="${f(lx1)}" y1="${f(ly1)}" x2="${f(lx2)}" y2="${f(ly2)}"/>`);
  }
  parts.push(`<circle class="w-ring" cx="${C}" cy="${C}" r="${R0}"/><circle class="w-ring" cx="${C}" cy="${C}" r="${R1}"/><circle class="w-ring" cx="${C}" cy="${C}" r="${R2}"/><circle class="w-inner" cx="${C}" cy="${C}" r="${RA}"/>`);
  // The angles.
  if (known) {
    for (const [lon, label, cls] of [[chart.asc.lon, "AC", "asc"], [chart.asc.lon + 180, "DC", ""], [chart.mc.lon, "MC", "mc"], [chart.mc.lon + 180, "IC", ""]]) {
      const [x1, y1] = at(lon, RA), [x2, y2] = at(lon, R0 + 2);
      parts.push(`<line class="w-angle ${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`);
      const [lx, ly] = at(lon + (label === "AC" || label === "IC" ? -4 : 4), R2 - 10);
      parts.push(`<text class="w-alabel" x="${f(lx)}" y="${f(ly)}" aria-hidden="true">${label}</text>`);
    }
  }
  // Aspects between the true places.
  const tick = name => at(chart.bodies[name].lon, RA);
  for (const a of chart.aspects) {
    if (a.type === "conjunction") continue;
    if (!known && (a.a === "moon" || a.b === "moon")) continue;
    const [x1, y1] = tick(a.a), [x2, y2] = tick(a.b);
    const hard = a.type === "square" || a.type === "opposition";
    parts.push(`<line class="w-asp ${hard ? "hard" : "soft"}${a.orb > 4 ? " wide" : ""}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"><title>${LABELS[a.a]} ${a.type} ${LABELS[a.b]}</title></line>`);
  }
  // The planets.
  const shown = spread(BODIES.map(b => chart.bodies[b].lon), 10.5);
  BODIES.forEach((name, i) => {
    const b = chart.bodies[name];
    const [tx1, ty1] = at(b.lon, R2), [tx2, ty2] = at(b.lon, R2 - 6), [px, py] = at(shown[i], RP), [lx, ly] = at(b.lon, R2 - 7), [ix, iy] = at(shown[i], RP + 9);
    const title = `${LABELS[name]} in ${b.sign} ${Math.floor(b.deg)}°${known ? `, ${ordinal(b.house)} house` : ""}${b.retro ? ", retrograde" : ""}`;
    parts.push(`<g class="w-planet ${name}"><title>${esc(title)}</title><line class="w-tick" x1="${f(tx1)}" y1="${f(ty1)}" x2="${f(tx2)}" y2="${f(ty2)}"/>${Math.abs(shown[i] - b.lon) > 1.5 ? `<line class="w-lead" x1="${f(lx)}" y1="${f(ly)}" x2="${f(ix)}" y2="${f(iy)}"/>` : ""}<text class="w-pglyph" x="${f(px)}" y="${f(py)}">${PLANET_GLYPH[name]}${VS}</text>${b.retro ? `<text class="w-rx" x="${f(px + 8)}" y="${f(py + 8)}">r</text>` : ""}</g>`);
  });
  const desc = `${known ? `${chart.asc.sign} rising, on the left.` : "Birth time unknown, so the wheel starts at the Sun's sign and has no Ascendant."} ${BODIES.map(n => `${LABELS[n]} in ${chart.bodies[n].sign}${known ? ` (${ordinal(chart.bodies[n].house)} house)` : ""}`).join(", ")}. ${chart.aspects.filter(a => a.type !== "conjunction").length} aspect lines. The table below lists the same.`;
  return `<svg class="wheel" viewBox="0 0 400 400" role="img" aria-labelledby="${id}-t ${id}-d" focusable="false"><title id="${id}-t">Your birth chart wheel</title><desc id="${id}-d">${esc(desc)}</desc>${parts.join("")}</svg>`;
}
