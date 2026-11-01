// "Your birth chart, read in full": the natal reading (src/astro/reading.js) as collapsible chapters for the ending
// page. Only renders; every word comes from the reading. The overview's wheel is drawn from the chart (wheel.js), with
// a legend and the planet table as its text alternative.
import { wheelSVG } from "./wheel.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const lifeHTML = text => `<p class="r-life"><span class="r-life-k">In this life</span> ${esc(text)}</p>`;

function bars(b) {
  const label = `${b.label}: ${b.items.map(i => `${i.label} ${Math.round(i.value * 100)}%`).join(", ")}`;
  return `<div class="r-bars" role="img" aria-label="${esc(label)}"><p class="r-bars-t" aria-hidden="true">${esc(b.label)}</p>${b.items.map(i => {
    const p = Math.round(i.value * 100);
    return `<div class="r-bar" aria-hidden="true"><span class="r-bar-k">${esc(i.label)}</span><span class="r-bar-track"><i style="width:${Math.max(p ? 2 : 0, p)}%"></i></span><span class="r-bar-v">${p}%</span></div>`;
  }).join("")}</div>`;
}

function block(b, chart, n) {
  switch (b.type) {
    case "p": return `<p>${esc(b.text)}</p>`;
    case "h": return `<h4>${esc(b.text)}</h4>`;
    case "note": return `<p class="fine">${esc(b.text)}</p>`;
    case "life": return lifeHTML(b.text);
    case "wheel": return `<figure class="r-wheel">${wheelSVG(chart, { id: `wheel-${n}` })}<figcaption class="r-legend"><span><i class="k-hard"></i>Tension (square, opposition)</span><span><i class="k-soft"></i>Harmony (trine, sextile)</span>${chart.timeKnown ? "<span><b>AC</b> Ascendant · <b>MC</b> Midheaven</span>" : ""}<span>r = retrograde</span></figcaption></figure>`;
    case "bars": return bars(b);
    case "facts": return `<dl class="r-facts">${b.items.map(i => `<div><dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd></div>`).join("")}</dl>`;
    case "table": return `<details class="table r-table"><summary>${esc(b.caption)} as a table</summary><div class="table-wrap"><table><caption class="sr">${esc(b.caption)}</caption><thead><tr>${b.head.map(h => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join("")}</tr>`).join("")}</tbody></table></div></details>`;
    case "list": return `<ul class="r-list">${b.items.map(i => `<li${i.spot ? ' class="spot"' : ""}>${i.label ? `<b>${esc(i.label)}</b>` : ""}${(i.tags || []).map(t => `<span class="r-tag ${esc(t)}">${esc(t)}</span>`).join("")}<p>${esc(i.text)}</p>${i.life ? lifeHTML(i.life) : ""}</li>`).join("")}</ul>`;
    default: return "";
  }
}

export function readingHTML(reading, chart) {
  return reading.chapters.map((ch, k) => `<details class="chapter" id="r-${esc(ch.id)}"${k === 0 ? " open" : ""}><summary><span class="ch-n" aria-hidden="true">${k + 1}</span><span class="ch-t"><b>${esc(ch.title)}</b><small>${esc(ch.summary)}</small></span></summary><div class="ch-body">${ch.blocks.map(b => block(b, chart, k)).join("")}</div></details>`).join("");
}
