// The life chart: one candle per year of this life (open = the mood at the start of the year, close = at its end;
// gold and filled for a year of growth, hollow lavender for a year of strain), over the band where the middle 80 of
// the same chart's 100 lives fell, and their median. Adapted from bazi-life's 人生 K 線. Pointer and keyboard both
// move a crosshair; the tooltip names the year, its profection and what happened.
import { profectionText } from "./words.js";

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

//   plot   the chart's box (an element with a .tip child)      life   createLife()'s life
//   band   the 100 lives' band (monte.js rerun().band), or []   luckAt age → that year's luck entry
export function drawKline(plot, { life, band = [], luckAt, timeKnown = true }) {
  const tip = plot.querySelector(".tip");
  const W = Math.max(300, Math.round(plot.clientWidth || 600)), H = W < 500 ? 220 : 270, L = 30, R = 10, T = 12, B = 26;
  const maxAge = Math.max(life.state.age, band.length ? band[band.length - 1].age : 0, 10);
  const x = a => L + (a / maxAge) * (W - L - R), y = v => T + (1 - v / 100) * (H - T - B);
  const step = (W - L - R) / maxAge, bodyW = Math.max(1.6, Math.min(10, step * 0.64));
  const area = band.length ? `M${band.map(b => `${x(b.age).toFixed(1)},${y(b.p90).toFixed(1)}`).join("L")}L${band.slice().reverse().map(b => `${x(b.age).toFixed(1)},${y(b.p10).toFixed(1)}`).join("L")}Z` : "";
  const median = band.map(b => `${x(b.age).toFixed(1)},${y(b.p50).toFixed(1)}`).join(" ");
  const grid = [0, 50, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`).join("");
  const every = W < 560 ? 20 : 10, ticks = [];
  for (let a = 0; a <= maxAge; a += every) ticks.push(`<text x="${x(a)}" y="${H - 8}" text-anchor="${x(a) > W - R - 24 ? "end" : a === 0 ? "start" : "middle"}" font-size="10" fill="var(--muted)">${a}</text>`);
  const candles = life.kline.map(k => {
    const up = k.close >= k.open, cx = x(k.age), top = y(Math.max(k.open, k.close)), h = Math.max(1.5, Math.abs(y(k.open) - y(k.close)));
    const color = up ? "var(--up)" : "var(--down)";
    return `<line x1="${cx}" x2="${cx}" y1="${y(k.high)}" y2="${y(k.low)}" stroke="${color}" stroke-width="1"/>`
      + (up ? `<rect x="${cx - bodyW / 2}" y="${top}" width="${bodyW}" height="${h}" rx="1" fill="${color}"/>`
        : `<rect x="${cx - bodyW / 2 + 0.7}" y="${top + 0.7}" width="${Math.max(0.6, bodyW - 1.4)}" height="${Math.max(0.6, h - 1.4)}" rx="1" fill="var(--surface)" stroke="${color}" stroke-width="1.4"/>`);
  }).join("");
  const ups = life.kline.filter(k => k.close >= k.open).length, downs = life.kline.length - ups;
  plot.querySelector("svg")?.remove();
  plot.insertAdjacentHTML("afterbegin", `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" tabindex="0" aria-label="Life chart: ${ups} years of growth and ${downs} years of strain, over the range of the same chart's 100 lives. Use the left and right arrow keys to read each year.">${grid}${ticks.join("")}${area ? `<path d="${area}" fill="var(--band)"/>` : ""}${median ? `<polyline points="${median}" fill="none" stroke="var(--median)" stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round"/>` : ""}${candles}<line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-opacity="0.5" stroke-width="1" visibility="hidden"/><rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg>`);
  const svg = plot.querySelector("svg"), cross = svg.querySelector(".cross");
  const byAge = new Map(life.kline.map(k => [k.age, k]));
  const eventsAt = age => life.log.filter(e => e.age === age && e.id !== "birth").slice(0, 3);
  let at = null;
  const show = age => {
    at = age;
    const k = byAge.get(age), b = band.find(z => z.age === age), l = luckAt(age), pr = l && l.profection ? profectionText(l.profection, timeKnown).short : "";
    if (!k && !b) { hide(); return; }
    cross.setAttribute("x1", x(age)); cross.setAttribute("x2", x(age)); cross.setAttribute("visibility", "visible");
    const mood = k ? (k.close >= k.open ? `a year of growth (mood ${k.open} → ${k.close})` : `a year of strain (mood ${k.open} → ${k.close})`) : "this life had ended";
    tip.innerHTML = `<b>Age ${age}</b>${k ? ` · ${k.year}` : ""}${pr ? `<br><span class="muted">${esc(pr)}</span>` : ""}<br>${mood}${b ? `<br>Median of 100 lives: ${b.p50}` : ""}${eventsAt(age).map(e => `<br>• ${esc(e.text.length > 90 ? e.text.slice(0, 88) + "…" : e.text)}`).join("")}`;
    tip.hidden = false;
    const r = svg.getBoundingClientRect(), pw = plot.clientWidth, tw = Math.min(260, pw - 8);
    tip.style.maxWidth = `${tw}px`;
    tip.style.left = `${Math.max(0, Math.min(pw - tw, (x(age) / W) * r.width + 12))}px`;
    tip.style.top = "6px";
  };
  const hide = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); };
  const fromPointer = ev => {
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width);
    show(Math.max(0, Math.min(maxAge, Math.round((px - L) / step))));
  };
  svg.addEventListener("pointermove", fromPointer);
  svg.addEventListener("pointerdown", fromPointer);
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("blur", hide);
  svg.addEventListener("keydown", e => {
    const last = life.kline.length ? life.kline[life.kline.length - 1].age : 0;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      show(Math.max(0, Math.min(last, (at ?? -1) + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 10 : 1))));
    } else if (e.key === "Home") { e.preventDefault(); show(0); } else if (e.key === "End") { e.preventDefault(); show(last); } else if (e.key === "Escape") hide();
  });
}

// The numbers behind the chart, for the table under it.
export function klineTable(life, luckAt, timeKnown = true) {
  return `<table><thead><tr><th scope="col">Age</th><th scope="col">Year</th><th scope="col">Profection</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">High</th><th scope="col">Low</th></tr></thead><tbody>${life.kline.map(k => {
    const l = luckAt(k.age);
    return `<tr><td>${k.age}</td><td>${k.year}</td><td>${esc(l && l.profection ? profectionText(l.profection, timeKnown).short : "")}</td><td>${k.open}</td><td>${k.close}</td><td>${k.high}</td><td>${k.low}</td></tr>`;
  }).join("")}</tbody></table>`;
}
