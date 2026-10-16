// 命盤人生・排盤引擎預覽：表單 → computeChart → 畫面。所有計算都在瀏覽器裡完成，不連網。
import { computeChart, SOLAR_MODES, ZI_RULES, YUN_METHODS } from "./core/chart.js";
import { PLACE_GROUPS, findPlace } from "./core/places.js";

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ELEMENT_CLASS = { 木: "el-wood", 火: "el-fire", 土: "el-earth", 金: "el-metal", 水: "el-water" };
const ELEMENT_OF = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水",
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火", 午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水",
};
const HOURS = "子丑寅卯辰巳午未申酉戌亥";
const colored = text => [...text].map(ch => ELEMENT_OF[ch] ? `<span class="${ELEMENT_CLASS[ELEMENT_OF[ch]]}">${ch}</span>` : esc(ch)).join("");

const EXAMPLES = [
  { id: "dst", label: "1979 夏令時間", date: "1979-08-01", time: "07:30", place: "臺北市", sex: "male" },
  { id: "zi", label: "子時交界", date: "1988-02-15", time: "23:30", place: "臺北市", sex: "male" },
  { id: "spring", label: "立春前 7 分鐘", date: "2024-02-04", time: "16:20", place: "臺北市", sex: "female" },
  { id: "war", label: "1940 戰時時間", date: "1940-06-15", time: "09:20", place: "臺北市", sex: "female" },
  { id: "west", label: "烏魯木齊", date: "2000-06-21", time: "12:00", place: "烏魯木齊（北京時間）", sex: "male" },
  { id: "nohour", label: "時辰不詳", date: "2024-02-04", time: "", place: "臺北市", sex: "male" },
];

let occurrence = 0;
let selectedDecade = null;

function setup() {
  const examples = $("#examples");
  for (const ex of EXAMPLES) examples.insertAdjacentHTML("beforeend", `<button type="button" class="chip" data-example="${ex.id}" aria-pressed="false">${esc(ex.label)}</button>`);
  $("#f-place").innerHTML = PLACE_GROUPS.map(g => `<optgroup label="${esc(g.group)}">${g.places.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("")}</optgroup>`).join("")
    + `<optgroup label="其他"><option value="custom">自訂經緯度…</option></optgroup>`;
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["Asia/Taipei"];
  $("#f-tz").innerHTML = zones.map(z => `<option${z === "Asia/Taipei" ? " selected" : ""}>${esc(z)}</option>`).join("");
  const fill = (sel, map) => { sel.innerHTML = Object.entries(map).map(([k, v]) => `<option value="${k}">${esc(typeof v === "string" ? v : v.label)}</option>`).join(""); };
  fill($("#f-solar"), SOLAR_MODES); fill($("#f-zi"), ZI_RULES); fill($("#f-yun"), YUN_METHODS);

  examples.addEventListener("click", e => { const b = e.target.closest("[data-example]"); if (b) loadExample(b.dataset.example); });
  $("#form").addEventListener("submit", e => e.preventDefault());
  $("#form").addEventListener("input", e => { if (["f-date", "f-time", "f-place", "f-tz"].includes(e.target.id)) { occurrence = 0; markExample(null); } if (["sex-m", "sex-f", "f-nohour", "f-lon", "f-lat"].includes(e.target.id)) markExample(null); update(); });
  $("#warnings").addEventListener("click", e => { const b = e.target.closest("[data-occ]"); if (b) { occurrence = Number(b.dataset.occ); update(); } });
  $("#decades").addEventListener("click", e => { const b = e.target.closest("[data-decade]"); if (b) { selectedDecade = Number(b.dataset.decade); update(); } });
  loadExample("dst");
}

function markExample(id) {
  for (const b of document.querySelectorAll("[data-example]")) b.setAttribute("aria-pressed", String(b.dataset.example === id));
}

function loadExample(id) {
  const ex = EXAMPLES.find(e => e.id === id);
  $("#f-date").value = ex.date;
  $("#f-time").value = ex.time || "12:00";
  $("#f-nohour").checked = !ex.time;
  $("#f-place").value = ex.place;
  $(ex.sex === "female" ? "#sex-f" : "#sex-m").checked = true;
  occurrence = 0; selectedDecade = null;
  markExample(id);
  update();
}

function readForm() {
  const [y, m, d] = ($("#f-date").value || "").split("-").map(Number);
  if (!y || !m || !d) return { error: "請輸入出生日期。" };
  if (y < 1900 || y > 2100) return { error: "出生年份請在 1900 到 2100 年之間。" };
  const noHour = $("#f-nohour").checked;
  $("#f-time").disabled = noHour;
  const [h, mi] = ($("#f-time").value || "").split(":").map(Number);
  if (!noHour && !Number.isFinite(h)) return { error: "請輸入出生時間，或勾選「時辰不詳」。" };
  const custom = $("#f-place").value === "custom";
  $("#custom").hidden = !custom;
  let place = findPlace($("#f-place").value);
  if (custom) {
    const lon = Number($("#f-lon").value), lat = Number($("#f-lat").value);
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) return { error: "經度要在 −180 到 180 之間，東經為正、西經為負。" };
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: "緯度要在 −90 到 90 之間，北緯為正、南緯為負。" };
    place = { name: `${lonText(lon)}、${latText(lat)}`, lon, lat, tz: $("#f-tz").value };
  }
  return {
    input: {
      date: { y, m, d }, time: noHour ? null : { h, mi: mi || 0 }, place,
      sex: $("#sex-f").checked ? "female" : "male",
      options: { solar: $("#f-solar").value, zi: $("#f-zi").value, yun: $("#f-yun").value, occurrence },
    },
  };
}

function update() {
  const form = readForm();
  const err = $("#error");
  if (form.error) { err.textContent = form.error; err.hidden = false; $("#result").hidden = true; return; }
  let c;
  try { c = computeChart(form.input); }
  catch (e) { err.textContent = "這個日期或地點沒辦法排盤，請再檢查一次。"; err.hidden = false; $("#result").hidden = true; console.error(e); return; }
  err.hidden = true;
  $("#result").hidden = false;
  renderWarnings(c); renderPillars(c); renderFacts(c); renderTrail(c); renderEdges(c); renderLuck(c);
}

// Clock facts (summer time, war time, local mean time) are explained in the correction trail instead.
function renderWarnings(c) {
  const parts = c.warnings.filter(w => ["ambiguous", "gap", "hour", "jie"].includes(w.kind)).map(w => {
    let extra = "";
    if (w.kind === "ambiguous") {
      extra = `<div class="row">${c.time.occurrences.map((o, i) => `<button type="button" data-occ="${i}" aria-pressed="${i === c.time.chosen}">第 ${i + 1} 次（UTC${esc(o.offset)}）</button>`).join("")}</div>`;
    }
    const strong = ["ambiguous", "gap", "jie"].includes(w.kind);
    return `<div class="warn${strong ? " strong" : ""}"><p>${esc(w.text)}</p>${extra}</div>`;
  });
  $("#warnings").innerHTML = parts.join("");
  $("#warnings").hidden = !parts.length;
}

function renderPillars(c) {
  const order = ["year", "month", "day", "hour"];
  const by = Object.fromEntries(c.pillars.map(p => [p.role, p]));
  const labels = { year: "年柱", month: "月柱", day: "日柱", hour: "時柱" };
  const cell = (role, html, cls = "") => `<div class="${role === "day" ? "day " : ""}${cls}">${html}</div>`;
  const row = (label, fn) => `<div class="lab">${label}</div>` + order.map(r => by[r] ? cell(r, fn(by[r])) : cell(r, label === "天干" ? "時辰<br>不詳" : "", "unknown")).join("");
  const html = [
    `<div class="lab head"></div>` + order.map(r => cell(r, labels[r], "head")).join(""),
    row("十神", p => `<span class="god">${esc(p.stem.god)}</span>`),
    row("天干", p => `<span class="big ${ELEMENT_CLASS[p.stem.element]}">${p.role === "day" ? `<span class="seal">${p.stem.name}</span>` : p.stem.name}</span>`),
    row("地支", p => `<span class="big ${ELEMENT_CLASS[p.branch.element]}">${p.branch.name}</span>`),
    row("藏干", p => `<div class="hidden">${p.branch.hidden.map(h => `<span><b class="${ELEMENT_CLASS[h.element]}">${h.name}</b> ${esc(h.god)}<br><small>${esc(h.type)}</small></span>`).join("")}</div>`),
    row("納音", p => `<span class="small">${esc(p.nayin)}</span>`),
    row("星運", p => `<span class="small">${esc(p.terrain)}</span>`),
    row("自坐", p => `<span class="small">${esc(p.seat)}</span>`),
    row("空亡", p => `<span class="small">${esc(p.void)}</span>`),
  ];
  $("#pillars").innerHTML = html.join("");
  const dm = c.dayMaster;
  $("#pillar-sub").textContent = `日主 ${dm.name}（${dm.yang ? "陽" : "陰"}${dm.element}）・生肖${c.zodiac}・${c.lunar}`;
}

function renderFacts(c) {
  const max = Math.max(...Object.values(c.elements), 1);
  const bars = Object.entries(c.elements).map(([e, n]) => `<div class="bar ${ELEMENT_CLASS[e]}" title="${e} ${n} 個"><i style="height:${Math.max(3, Math.round(n / max * 40))}px"></i><span>${e}${n}</span></div>`).join("");
  const facts = [
    ["五行個數（天干與地支各 1）", `<div class="bars">${bars}</div>`],
    ["五行缺", c.missing.length ? c.missing.join("、") : "不缺"],
    ["日空", c.extras.dayVoid],
  ];
  if (c.hourKnown) facts.push(["胎元・胎息", `${colored(c.extras.fetalOrigin)}・${colored(c.extras.fetalBreath)}`], ["命宮・身宮", `${colored(c.extras.ownSign)}・${colored(c.extras.bodySign)}`]);
  facts.push(["上一個節・下一個節", `${esc(c.terms.prev.name)} <span class="num">${esc(c.terms.prev.time)}</span><br>${esc(c.terms.next.name)} <span class="num">${esc(c.terms.next.time)}</span>`]);
  $("#facts").innerHTML = facts.map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("");
}

const lonText = lon => `${lon < 0 ? "西經" : "東經"} ${+Math.abs(lon).toFixed(2)}°`;
const latText = lat => `${lat < 0 ? "南緯" : "北緯"} ${+Math.abs(lat).toFixed(2)}°`;
function offsetText(min) {
  const s = Math.round(Math.abs(min) * 60), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return `${min < 0 ? "−" : "+"}${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
const signed = (n, unit = "分") => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)} ${unit}`;
const hourName = clock => { const h = Number(clock.slice(11, 13)); return HOURS[Math.floor((h + 1) / 2) % 12] + "時"; };

function renderTrail(c) {
  const t = c.time, p = c.input.place, mode = c.input.options.solar;
  const steps = [];
  steps.push({ k: "你輸入的時間", v: c.hourKnown ? t.entered : `${t.entered.slice(0, 10)}（時辰不詳，用 12:00 估算）`, why: `${p.name}・${p.tz}` });
  if (mode === "clock") {
    steps.push({ k: "不校正", v: t.termClock.slice(0, 16), why: "直接把輸入的時間當作東八區時間，四柱都用它。", key: true });
  } else {
    const zoneNote = c.warnings.filter(w => ["dst", "standard", "lmt", "gap", "ambiguous"].includes(w.kind)).map(w => w.text).join(" ");
    steps.push({ k: "當地時鐘", v: `UTC${t.offset}`, why: zoneNote || "當時的鐘錶時間就是標準時間。" });
    steps.push({ k: "世界時（UTC）", v: t.utc.slice(0, 16).replace("T", " "), why: "出生那一刻的絕對時間。" });
    steps.push({ k: "東八區時間", v: t.termClock, why: "節氣表以東八區計時。年柱、月柱和起運都拿這個時刻和節氣比對。", key: true });
    const std = t.offsetMinutes - t.dstMinutes, vsStd = t.shift.longitude - std;
    steps.push({ k: "經度時差", v: offsetText(t.shift.longitude), why: `從世界時開始算：出生地在${lonText(p.lon)}，每度 4 分鐘。比當地標準時間的經線（${lonText(std / 4)}）${vsStd >= 0 ? "快" : "慢"} ${Math.abs(vsStd).toFixed(1)} 分鐘。` });
    if (mode === "true") steps.push({ k: "均時差", v: signed(t.shift.eot), why: "地球公轉軌道是橢圓、自轉軸又傾斜，太陽每天到正南方的時間會比平均時間快或慢，一年之中在 −14 到 +16 分鐘之間變化。" });
    steps.push({ k: mode === "true" ? "真太陽時" : "平太陽時", v: t.solarClock, why: c.hourKnown ? `日柱和時柱用這個時間：${hourName(t.solarClock)}。` : "時辰不詳時只用來確認日期。", key: true });
  }
  $("#trail").innerHTML = steps.map(s => `<li${s.key ? ' class="key"' : ""}><span class="k">${esc(s.k)}</span><span class="v">${esc(s.v)}</span><span class="why">${esc(s.why)}</span></li>`).join("");
  $("#total").textContent = mode === "clock" || !c.hourKnown ? "" : `排日柱、時柱用的時間比你輸入的時間${t.vsEntered < 0 ? "早" : "晚"} ${Math.abs(t.vsEntered).toFixed(1)} 分鐘。`;
}

function span(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} 分鐘`;
  if (m < 1440) return `${Math.floor(m / 60)} 小時 ${m % 60} 分`;
  return `${Math.floor(m / 1440)} 天 ${Math.floor((m % 1440) / 60)} 小時`;
}

function renderEdges(c) {
  const s = Object.fromEntries(c.sensitivity.map(x => [x.role, x]));
  const win = $("#window");
  if (c.hourKnown) {
    const h = s.hour, total = h.earlier.minutes + h.later.minutes, solar = c.time.solarClock;
    const now = Number(solar.slice(11, 13)) * 60 + Number(solar.slice(14, 16)) + Number(solar.slice(17, 19)) / 60;
    const clock = m => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
    win.innerHTML = `<p>${hourName(solar)}的範圍是 <span class="num">${clock(now - h.earlier.minutes)}–${clock(now + h.later.minutes)}</span>（${c.input.options.solar === "clock" ? "輸入的時間" : "太陽時"}），出生落在這裡：</p>
      <div class="track" role="img" aria-label="時辰範圍內的位置"><i style="left:${(h.earlier.minutes / total * 100).toFixed(1)}%"></i></div>
      <div class="ends num"><span>${clock(now - h.earlier.minutes)}</span><span>${clock(now + h.later.minutes)}</span></div>`;
    win.hidden = false;
  } else {
    win.innerHTML = ""; win.hidden = true;
  }
  const items = [];
  const describe = (x, limit) => {
    const near = Math.min(x.earlier.minutes, x.later.minutes);
    if (near > limit) return null;
    const hot = near < (x.role === "hour" || x.role === "day" ? 15 : 120);
    const side = x.earlier.minutes <= x.later.minutes ? `早 ${span(x.earlier.minutes)}就是 ${x.earlier.becomes}` : `晚 ${span(x.later.minutes)}就是 ${x.later.becomes}`;
    return `<li><span class="tag${hot ? " hot" : ""}">${x.label}</span>出生時間只要再${side}。</li>`;
  };
  if (c.hourKnown) {
    items.push(describe(s.hour, Infinity));
    const near = [describe(s.day, 120), describe(s.month, 2880), describe(s.year, 2880)];
    items.push(...near);
    if (!near.some(Boolean)) items.push(`<li><span class="tag">其他</span>日柱、月柱、年柱都離交界很遠，出生時間差一點也不會變。</li>`);
  }
  for (const v of c.variants) {
    const changed = v.changed.map(r => `${{ year: "年柱", month: "月柱", day: "日柱", hour: "時柱" }[r]} ${c.pillars.find(p => p.role === r)?.name || ""} → ${v.pillars[r]}`).join("、");
    items.push(`<li><span class="tag${v.changed.length ? " hot" : ""}">設定</span>改成「${esc(v.label)}」：${changed ? esc(changed) : "結果一樣"}。</li>`);
  }
  $("#edges").innerHTML = items.filter(Boolean).join("");
}

function renderLuck(c) {
  const L = c.luck, birthYear = c.input.date.y, thisYear = new Date().getFullYear();
  const age = thisYear - birthYear + 1;
  const start = L.start;
  const parts = [start.years && `${start.years} 年`, start.months && `${start.months} 個月`, start.days && `${start.days} 天`, start.hours && `${start.hours} 小時`].filter(Boolean).join(" ") || "不到 1 天";
  $("#luck-sub").textContent = `大運${L.forward ? "順行" : "逆行"}。出生後 ${parts}起運，約 ${start.date}（虛歲 ${start.age} 歲）交第一步大運。算法：${L.method}。`;
  const cards = [];
  if (start.age > 1) cards.push({ index: -1, label: "童限", ages: `1–${start.age - 1} 歲`, gz: "", gods: "起運之前", from: birthYear, to: birthYear + start.age - 2 });
  L.decades.forEach((d, i) => cards.push({ index: i, label: d.name, ages: `${d.startAge}–${d.endAge} 歲`, gz: d.name, gods: `${d.gods.stem}・${d.gods.branch}`, from: d.startYear, to: d.endYear }));
  const current = cards.find(k => thisYear >= k.from && thisYear <= k.to);
  if (selectedDecade === null || !cards.some(k => k.index === selectedDecade)) selectedDecade = (current || cards[0]).index;
  $("#decades").innerHTML = cards.map(k => `<button type="button" class="decade" data-decade="${k.index}" aria-pressed="${k.index === selectedDecade}">
      <span class="ages num">${k.ages}</span>
      <span class="gz">${k.gz ? colored(k.gz) : "童限"}</span>
      <span class="gods">${esc(k.gods)}</span>
      <span class="ages num">${k.from}–${k.to}</span>
      ${k === current ? `<span class="now">現在（虛歲 ${age}）</span>` : ""}
    </button>`).join("");
  const strip = $("#decades"), chosen = strip.querySelector('[aria-pressed="true"]');
  if (chosen && (chosen.offsetLeft < strip.scrollLeft || chosen.offsetLeft + chosen.offsetWidth > strip.scrollLeft + strip.clientWidth)) {
    strip.scrollLeft = Math.max(0, chosen.offsetLeft - 8);
  }
  const sel = cards.find(k => k.index === selectedDecade);
  const years = c.years.filter(y => y.year >= sel.from && y.year <= sel.to);
  $("#years").innerHTML = years.map(y => `<div class="year${y.year === thisYear ? " now" : ""}"><span class="y">${y.year}</span><span class="gz">${colored(y.name)}</span><span class="meta">虛歲 ${y.age}・${esc(y.gods.stem)}</span></div>`).join("");
}

setup();
