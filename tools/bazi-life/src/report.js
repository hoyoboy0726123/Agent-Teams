// 八字命理詳批：結局頁的專業命書。排盤表、本命詳批、大運、流年、這一生的大事與流年、姓名詳批、開運建議。
// Everything here only renders; the readings come from core/reading-natal.js, core/reading-year.js and
// core/name-reading.js, and the chart details from core/detail.js.
// Every word shown goes through core/tr.js: the Chinese as it was in Chinese, the English catalog
// (src/i18n/en/report.json, bazi-terms.json) when the reading is in English.
import { natalStars, STARS } from "./core/detail.js";
import { tr, trw, trJoin, readingLang } from "./core/tr.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const el = (text, element) => `<span class="el-${esc(element)}">${esc(text)}</span>`;
const isEn = () => readingLang() === "en";
// The full-width colon of a 「label：text」 line, ": " in English.
export const colon = () => (isEn() ? ": " : "：");
const YANG = "甲丙戊庚壬";
// A Chinese term kept in brackets after its English the first time a heading names it: "The Three Talents (三才)".
export const withZh = (text, zh) => (isEn() ? `${text} (${zh})` : text);
// A stem or branch in the table: the character in Chinese; in English its name, with the element (and yin or yang for a
// stem) and the character in brackets underneath.
function glyph(x, stem) {
  if (!isEn()) return `<span class="big">${el(x.name, x.element)}</span>`;
  const under = `${stem ? (YANG.includes(x.name) ? "Yang " : "Yin ") : ""}${trw(x.element)} (${x.name})`;
  return `<span class="stack"><span class="big">${el(trw(x.name), x.element)}</span><small>${esc(under)}</small></span>`;
}

// The professional chart table: 主星、天干、地支、藏干、副星、星運、自坐、空亡、納音、神煞 for each pillar.
export function paipanTable(chart) {
  const stars = natalStars(chart);
  const cols = chart.pillars;
  const sex = tr(chart.input.sex === "female" ? "元女" : "元男");
  const row = (label, cell) => `<tr><th scope="row">${esc(tr(label))}</th>${cols.map(p => `<td>${cell(p)}</td>`).join("")}</tr>`;
  const head = `<thead><tr><th></th>${cols.map(p => `<th scope="col">${esc(trw(p.label))}</th>`).join("")}</tr></thead>`;
  const body = [
    row("主星", p => esc(p.role === "day" ? sex : trw(p.stem.god))),
    row("天干", p => glyph(p.stem, true)),
    row("地支", p => glyph(p.branch, false)),
    row("藏干", p => `<span class="stack">${p.branch.hidden.map(h => `<span>${el(trw(h.name), h.element)}<small>${esc(trw(h.type))}</small></span>`).join("")}</span>`),
    row("副星", p => `<span class="stack">${p.branch.hidden.map(h => `<span>${esc(trw(h.god))}</span>`).join("")}</span>`),
    row("星運", p => esc(trw(p.terrain))),
    row("自坐", p => esc(trw(p.seat))),
    row("空亡", p => esc(isEn() ? [...p.void].map(trw).join(", ") : p.void)),
    row("納音", p => esc(trw(p.nayin))),
    row("神煞", p => `<span class="stack">${(stars[p.role] || []).map(s => `<span class="star-${esc(STARS[s] ? STARS[s].nature : "中")}" title="${esc(STARS[s] ? STARS[s].text : "")}">${esc(trw(s))}</span>`).join("") || "—"}</span>`),
  ].join("");
  return `<table class="paipan${isEn() ? " en" : ""}" aria-label="${esc(tr("八字排盤"))}">${head}<tbody>${body}</tbody></table>`;
}

// The stars that appear in the chart, each with its meaning: the legend under the table.
export function starLegend(chart) {
  const seen = new Map();
  for (const list of Object.values(natalStars(chart))) for (const s of list) if (STARS[s]) seen.set(s, STARS[s]);
  if (!seen.size) return "";
  const order = ["吉", "中", "凶"];
  return `<ul class="legend-stars">${[...seen].sort((a, b) => order.indexOf(a[1].nature) - order.indexOf(b[1].nature)).map(([s, info]) => `<li><b class="star-${esc(info.nature)}">${esc(trw(s))}</b>${colon()}${esc(info.text)}</li>`).join("")}</ul>`;
}

// ---------- the whole report ----------
// parts: { natal: natalReading(), decades: [decadeReading()], years: [yearReading()] (ten years), yearsTitle,
//          events: [{ entry, reason }] (the turning points of this life with their explanation), name: nameReading() | null,
//          overall: overallReading() | null, partner: partnerReading() | null }
// Order: the chart, the natal readings, the 大運, the turning points, the 流年, the name, the 綜合論斷 and, last, the
// 開運建議 (the natal reading's own advice section).
const para = list => (list || []).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("");
const items = list => (list && list.length ? `<ul>${list.map(i => `<li>${i.label ? `<b>${esc(i.label)}</b>${colon()}` : ""}${esc(i.text)}</li>`).join("")}</ul>` : "");
const section = (title, inner, open = false) => (inner ? `<details class="sec"${open ? " open" : ""}><summary>${esc(title)}</summary>${inner}</details>` : "");
// A row of a 大運 or 流年 table. On a phone the rows become cards: the first four cells on one line, the text below.
// The tone keeps its Chinese in the class name (tone-吉) and is shown in the reading's language.
const luckRow = (name, when, sub, gods, tone, text) => `<tr><td class="lt-name">${esc(trw(name))}</td><td class="lt-when">${esc(when)}<small>${esc(sub)}</small></td><td class="lt-gods">${esc(gods)}</td><td class="lt-tone tone-${esc(tone)}">${esc(trw(tone))}</td><td class="lt-text">${esc(text)}</td></tr>`;
const godsOf = x => (x.gods ? tr("{stemGod}・{branchGod}", { stemGod: x.gods.stem, branchGod: x.gods.branch }) : "");

export function reportHTML(chart, parts) {
  const { natal, decades = [], years = [], events = [], name = null, overall = null, partner = null, yearsTitle = tr("近十年流年") } = parts;
  const basics = natal && natal.basics ? `<dl class="basics">${natal.basics.map(b => `<div><dt>${esc(b.label)}</dt><dd>${esc(b.value)}</dd></div>`).join("")}</dl>` : "";
  const natalSections = natal ? natal.sections : [];
  const sectionHTML = (s, open) => section(s.title, para(s.paragraphs) + items(s.items), open);
  const body = natalSections.filter(s => s.id !== "advice").map((s, i) => sectionHTML(s, i === 0)).join("");
  const adviceSection = natalSections.find(s => s.id === "advice");
  const decadeRows = decades.map(d => luckRow(d.name, tr("{decadeFrom}–{decadeTo} 歲", { decadeFrom: d.startAge, decadeTo: d.endAge }), `${d.startYear}–${d.endYear}`, godsOf(d), d.tone || "", d.text || d.headline || "")).join("");
  const decadeTable = decades.length ? `<table class="luck-table"><thead>${tr("<tr><th>大運</th><th>虛歲／年份</th><th>十神</th><th>吉凶</th><th>重點</th></tr>")}</thead><tbody>${decadeRows}</tbody></table><p class="fine">${esc(tr("大運的歲數是虛歲（出生那年算 1 歲），起運 {startYears} 年 {startMonths} 個月，{startDate} 交運。", { startYears: chart.luck.start.years, startMonths: chart.luck.start.months, startDate: chart.luck.start.date }))}</p>` : "";
  const yearRows = years.map(y => luckRow(y.pillar, String(y.year), tr("{flowAge} 歲", { flowAge: y.age }), godsOf(y), (y.favor && y.favor.tone) || "", y.headline || "")).join("");
  const yearTable = years.length ? `<table class="luck-table"><thead>${tr("<tr><th>流年</th><th>年份</th><th>十神</th><th>吉凶</th><th>重點</th></tr>")}</thead><tbody>${yearRows}</tbody></table><p class="fine">${esc(tr("流年的歲數是足歲；吉凶綜合流年與當時大運的喜忌，以及這一年和命盤的刑沖合害。"))}</p>` : "";
  const lifeList = events.length ? `<ul>${events.map(({ entry, reason }) => `<li><b>${esc(tr("{eventAge} 歲（{eventYear}）", { eventAge: entry.age, eventYear: entry.year }))}</b>${esc(entry.text)}${reason ? `<br><span class="why">${esc(reason.why || reason.short)}</span>` : ""}</li>`).join("")}</ul>` : "";
  const overallBlock = overall ? section(tr("綜合論斷"), items(overall.items) + para([overall.closing]), true) : "";
  // Without the natal advice section (older readings), the advice fields as a list.
  const advice = adviceSection ? sectionHTML(adviceSection, false)
    : natal && natal.advice ? section(tr("開運建議"), items(Object.entries(natal.advice).filter(([, v]) => v && (Array.isArray(v) ? v.length : true)).map(([k, v]) => ({ label: ADVICE[k] ? trw(ADVICE[k]) : k, text: Array.isArray(v) ? trJoin(v.map(trw)) : trw(String(v)) })))) : "";
  return [
    basics,
    paipanTable(chart),
    section(withZh(tr("神煞說明"), "神煞"), starLegend(chart)),
    body,
    partner ? partnerHTML(partner) : "",
    section(withZh(tr("大運詳批"), "大運"), decadeTable),
    section(tr("這一生的大事與命理"), lifeList),
    section(yearsTitle, yearTable),
    name ? nameHTML(name) : "",
    overallBlock,
    advice,
    `<p class="fine">${esc((natal && natal.disclaimer) || tr("以上是傳統八字與姓名學的說法，用來認識自己、做為參考，不是預言；健康問題請以醫師診斷為準。"))}</p>`,
  ].join("");
}
const ADVICE = { elements: "喜用五行", colors: "顏色", directions: "方位", numbers: "數字", industries: "行業", habits: "生活習慣", zodiac: "相合的生肖" };

// 伴侶合盤: the overall picture, the points that apply (生肖, 日柱, 夫妻宮, 配偶星, 用神互補 …) and advice.
function partnerHTML(p) {
  const tone = p.tone === "互補" ? "tone-good" : p.tone === "需要磨合" ? "tone-bad" : "tone-even";
  const inner = [
    `<p><span class="tone ${tone}">${esc(trw(p.tone))}</span>${esc(p.summary)}</p>`,
    (p.highlights || []).length ? `<p class="chips">${p.highlights.map(h => `<span>${esc(trw(h))}</span>`).join("")}</p>` : "",
    (p.sections || []).map(x => `<h4>${esc(x.title)}</h4>${para(x.paragraphs)}${items(x.items)}`).join(""),
    (p.advice || []).length ? `<h4>${esc(tr("相處建議"))}</h4>${items(p.advice.map(text => ({ text })))}` : "",
  ].join("");
  return section(p.title || tr("伴侶合盤"), inner);
}

// 姓名詳批: the score, the strokes, the five grids with how each is counted, 三才, 三運, the characters' elements against
// the chart, and the notes and credit of the texts.
// 金土土 in English: Metal–Earth–Earth (left as it is when it is English already).
const elementRun = t => (isEn() && /[\u4e00-\u9fff]/.test(String(t)) ? [...String(t)].map(trw).join("–") : t);
function nameHTML(n) {
  if (!n || n.error) return "";
  const score = Number.isFinite(n.score)
    ? `<div class="name-score"><div class="num">${tr("{nameScore}分", { nameScore: `<b>${esc(n.score)}</b>` })}</div><div><div class="label">${esc(n.scoreLabel)}</div><div class="parts">${(n.scoreParts || []).map(p => esc(tr("{scorePart} {partPoints} 分（占 {partWeight}%）", { scorePart: p.part, partPoints: p.points, partWeight: p.weight }))).join(isEn() ? " · " : "・")}</div></div></div>`
    : "";
  const grids = (n.grids || []).map(g => `<li><b>${esc(tr("{gridKey} {gridValue}（{gridElement}・{gridLevel}）", { gridKey: g.key, gridValue: g.value, gridElement: g.element, gridLevel: g.level }))}</b><small class="formula">${esc(tr("{gridFormula}；{gridRole}", { gridFormula: g.formula, gridRole: g.role }))}</small>${g.poem ? esc(tr("「{gridPoem}」", { gridPoem: g.poem })) : ""}${esc(g.text || "")}${g.note ? `<br><small>${esc(g.note)}</small>` : ""}</li>`).join("");
  const sancai = n.sancai ? `<p><b>${esc(tr("{sancaiElements}（{sancaiLevel}）", { sancaiElements: elementRun(n.sancai.elements), sancaiLevel: n.sancai.level }))}</b>${esc(n.sancai.relation || "")}${esc(n.sancai.text || "")}${n.sancai.note ? `<br><small>${esc(n.sancai.note)}</small>` : ""}</p>` : "";
  const yun = n.yunshi ? Object.entries(n.yunshi).filter(([, v]) => v).map(([k, v]) => `<li><b>${esc(tr("{yunName}（{yunLevel}）", { yunName: k, yunLevel: v.level || "" }))}</b>${esc(v.relation || "")}${esc(v.text || "")}${v.note ? `<br><small>${esc(v.note)}</small>` : ""}</li>`).join("") : "";
  const inner = [
    score,
    n.summary ? `<p>${esc(n.summary)}</p>` : "",
    n.strokes ? `<p class="fine">${esc(tr("康熙筆畫：{kangxiStrokes}", { kangxiStrokes: n.strokes }))}</p>` : "",
    grids ? `<h4>${esc(withZh(tr("五格數理"), "五格"))}</h4><ul>${grids}</ul>` : "",
    sancai ? `<h4>${esc(withZh(tr("三才配置"), "三才"))}</h4>${sancai}` : "",
    yun ? `<h4>${esc(withZh(tr("三運"), "三運"))}</h4><ul>${yun}</ul>` : "",
    n.elements && n.elements.text ? `<h4>${esc(tr("用字五行與八字"))}</h4><p>${esc(n.elements.text)}</p>` : "",
    n.disputed ? `<p class="fine">${esc(n.disputed)}</p>` : "",
    (n.notes || []).map(x => `<p class="fine">${esc(x)}</p>`).join(""),
    n.credit ? `<p class="fine">${esc(n.credit)}</p>` : "",
  ].join("");
  return section(tr("姓名詳批"), inner);
}
