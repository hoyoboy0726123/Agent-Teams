// 八字命理詳批：結局頁的專業命書。排盤表、本命詳批、大運、流年、這一生的大事與流年、姓名詳批、開運建議。
// Everything here only renders; the readings come from core/reading-natal.js, core/reading-year.js and
// core/name-reading.js, and the chart details from core/detail.js.
import { natalStars, STARS } from "./core/detail.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const el = (text, element) => `<span class="el-${esc(element)}">${esc(text)}</span>`;

// The professional chart table: 主星、天干、地支、藏干、副星、星運、自坐、空亡、納音、神煞 for each pillar.
export function paipanTable(chart) {
  const stars = natalStars(chart);
  const cols = chart.pillars;
  const sex = chart.input.sex === "female" ? "元女" : "元男";
  const row = (label, cell) => `<tr><th scope="row">${label}</th>${cols.map(p => `<td>${cell(p)}</td>`).join("")}</tr>`;
  const head = `<thead><tr><th></th>${cols.map(p => `<th scope="col">${esc(p.label)}</th>`).join("")}</tr></thead>`;
  const body = [
    row("主星", p => esc(p.role === "day" ? sex : p.stem.god)),
    row("天干", p => `<span class="big">${el(p.stem.name, p.stem.element)}</span>`),
    row("地支", p => `<span class="big">${el(p.branch.name, p.branch.element)}</span>`),
    row("藏干", p => `<span class="stack">${p.branch.hidden.map(h => `<span>${el(h.name, h.element)}<small>${esc(h.type)}</small></span>`).join("")}</span>`),
    row("副星", p => `<span class="stack">${p.branch.hidden.map(h => `<span>${esc(h.god)}</span>`).join("")}</span>`),
    row("星運", p => esc(p.terrain)),
    row("自坐", p => esc(p.seat)),
    row("空亡", p => esc(p.void)),
    row("納音", p => esc(p.nayin)),
    row("神煞", p => `<span class="stack">${(stars[p.role] || []).map(s => `<span class="star-${esc(STARS[s] ? STARS[s].nature : "中")}" title="${esc(STARS[s] ? STARS[s].text : "")}">${esc(s)}</span>`).join("") || "—"}</span>`),
  ].join("");
  return `<table class="paipan" aria-label="八字排盤">${head}<tbody>${body}</tbody></table>`;
}

// The stars that appear in the chart, each with its meaning: the legend under the table.
export function starLegend(chart) {
  const seen = new Map();
  for (const list of Object.values(natalStars(chart))) for (const s of list) if (STARS[s]) seen.set(s, STARS[s]);
  if (!seen.size) return "";
  const order = ["吉", "中", "凶"];
  return `<ul class="legend-stars">${[...seen].sort((a, b) => order.indexOf(a[1].nature) - order.indexOf(b[1].nature)).map(([s, info]) => `<li><b class="star-${esc(info.nature)}">${esc(s)}</b>：${esc(info.text)}</li>`).join("")}</ul>`;
}

// ---------- the whole report ----------
// parts: { natal: natalReading(), decades: [decadeReading()], years: [yearReading()] (the next ten years),
//          events: [{ entry, reason }] (the turning points of this life with their explanation), name: nameReading() | null }
const para = list => (list || []).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("");
const items = list => (list && list.length ? `<ul>${list.map(i => `<li>${i.label ? `<b>${esc(i.label)}</b>：` : ""}${esc(i.text)}</li>`).join("")}</ul>` : "");
const section = (title, inner, open = false) => (inner ? `<details class="sec"${open ? " open" : ""}><summary>${esc(title)}</summary>${inner}</details>` : "");

export function reportHTML(chart, parts) {
  const { natal, decades = [], years = [], events = [], name = null } = parts;
  const basics = natal && natal.basics ? `<dl class="basics">${natal.basics.map(b => `<div><dt>${esc(b.label)}</dt><dd>${esc(b.value)}</dd></div>`).join("")}</dl>` : "";
  const sections = natal ? natal.sections.map((s, i) => section(s.title, para(s.paragraphs) + items(s.items), i === 0)).join("") : "";
  const decadeRows = decades.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.startAge)}–${esc(d.endAge)} 歲<br><small>${esc(d.startYear)}–${esc(d.endYear)}</small></td><td>${esc(d.gods ? `${d.gods.stem}・${d.gods.branch}` : "")}</td><td class="tone-${esc(d.tone)}">${esc(d.tone || "")}</td><td>${esc(d.text || d.headline || "")}</td></tr>`).join("");
  const decadeTable = decades.length ? `<table class="luck-table"><thead><tr><th>大運</th><th>虛歲／年份</th><th>十神</th><th>吉凶</th><th>重點</th></tr></thead><tbody>${decadeRows}</tbody></table><p class="fine">大運的歲數是虛歲（出生那年算 1 歲），起運 ${esc(chart.luck.start.years)} 年 ${esc(chart.luck.start.months)} 個月，${esc(chart.luck.start.date)} 交運。</p>` : "";
  const yearRows = years.map(y => `<tr><td>${esc(y.pillar)}</td><td>${esc(y.year)}<br><small>${esc(y.age)} 歲</small></td><td>${esc(y.gods ? `${y.gods.stem}・${y.gods.branch}` : "")}</td><td class="tone-${esc(y.favor && y.favor.tone)}">${esc(y.favor && y.favor.tone || "")}</td><td>${esc(y.headline || "")}</td></tr>`).join("");
  const yearTable = years.length ? `<table class="luck-table"><thead><tr><th>流年</th><th>年份</th><th>十神</th><th>吉凶</th><th>重點</th></tr></thead><tbody>${yearRows}</tbody></table>` : "";
  const lifeList = events.length ? `<ul>${events.map(({ entry, reason }) => `<li><b>${esc(entry.age)} 歲（${esc(entry.year)}）</b>${esc(entry.text)}${reason ? `<br><span class="why">${esc(reason.why || reason.short)}</span>` : ""}</li>`).join("")}</ul>` : "";
  const nameBlock = name ? nameHTML(name) : "";
  const advice = natal && natal.advice ? items(Object.entries(natal.advice).filter(([, v]) => v && (Array.isArray(v) ? v.length : true)).map(([k, v]) => ({ label: ADVICE[k] || k, text: Array.isArray(v) ? v.join("、") : String(v) }))) : "";
  return [
    basics,
    paipanTable(chart),
    section("神煞說明", starLegend(chart)),
    sections,
    section("大運詳批", decadeTable),
    section("這一生的大事與流年", lifeList),
    section("近十年流年", yearTable),
    nameBlock,
    section("開運建議", advice),
    `<p class="fine">${esc((natal && natal.disclaimer) || "以上是傳統八字與姓名學的說法，用來認識自己、做為參考，不是預言；健康問題請以醫師診斷為準。")}</p>`,
  ].join("");
}
const ADVICE = { colors: "顏色", directions: "方位", numbers: "數字", industries: "行業", habits: "生活習慣", zodiac: "相合的生肖" };

function nameHTML(n) {
  const grids = (n.grids || []).map(g => `<li><b>${esc(g.key)} ${esc(g.value)}（${esc(g.element)}・${esc(g.level)}）</b>${g.poem ? `「${esc(g.poem)}」` : ""}${esc(g.text || "")}${g.note ? `<br><small>${esc(g.note)}</small>` : ""}</li>`).join("");
  const yun = n.yunshi ? Object.entries(n.yunshi).map(([k, v]) => v && `<li><b>${esc(k)}（${esc(v.level || "")}）</b>${esc(v.text || "")}</li>`).filter(Boolean).join("") : "";
  const inner = [
    n.summary ? `<p>${esc(n.summary)}</p>` : "",
    grids ? `<ul>${grids}</ul>` : "",
    n.sancai ? `<p><b>三才 ${esc(n.sancai.elements)}（${esc(n.sancai.level)}）</b>${esc(n.sancai.text || "")}</p>` : "",
    yun ? `<ul>${yun}</ul>` : "",
    n.elements && n.elements.text ? `<p>${esc(n.elements.text)}</p>` : "",
    n.disputed ? `<p class="fine">${esc(n.disputed)}</p>` : "",
    (n.notes || []).map(x => `<p class="fine">${esc(x)}</p>`).join(""),
  ].join("");
  return section("姓名詳批", inner);
}
