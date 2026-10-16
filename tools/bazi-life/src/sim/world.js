// 世界：縣市、工作、出國的地方、各年代的生活細節。事件和行動共用這些。
import { interp } from "./rates.js";

export const COUNTIES = [
  ["新北市", 404], ["臺中市", 286], ["高雄市", 272], ["臺北市", 248], ["桃園市", 233], ["臺南市", 185], ["彰化縣", 122],
  ["屏東縣", 79], ["雲林縣", 66], ["新竹縣", 59], ["苗栗縣", 53], ["南投縣", 47], ["嘉義縣", 48], ["新竹市", 45],
  ["宜蘭縣", 45], ["基隆市", 36], ["花蓮縣", 32], ["嘉義市", 26], ["臺東縣", 21], ["金門縣", 14], ["澎湖縣", 11],
];   // population in ten thousands (approximate, 2024), used only to weight where people move
export const NORTH = ["臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "宜蘭縣"];
export const CENTRAL = ["臺中市", "彰化縣", "南投縣", "苗栗縣", "雲林縣"];
export const SOUTH = ["臺南市", "高雄市", "屏東縣", "嘉義市", "嘉義縣", "澎湖縣"];
export const EAST = ["花蓮縣", "臺東縣"];
export const regionOf = c => (NORTH.includes(c) ? "north" : CENTRAL.includes(c) ? "central" : SOUTH.includes(c) ? "south" : EAST.includes(c) ? "east" : "islands");

export const ABROAD = [["中國大陸", 3], ["美國", 2], ["日本", 1.5], ["新加坡", 1], ["越南", 1], ["澳洲", 0.8], ["加拿大", 0.6], ["德國", 0.4]];

// Jobs by schooling: title, pay relative to the national median, field, and the element tradition gives the trade
// (五行行業: 木 education, culture, care and design; 火 electronics, food and beauty; 土 building, land, retail and
// administration; 金 finance, law, machinery and security; 水 trade, transport, sales and media).
export const JOBS = {
  basic: [["工廠作業員", 0.75, "製造", "金"], ["餐廳廚房", 0.72, "餐飲", "火"], ["營造工地", 0.85, "營造", "土"], ["貨運司機", 0.85, "運輸", "水"], ["市場攤商", 0.78, "自營", "土"], ["保全", 0.75, "服務", "金"], ["清潔人員", 0.7, "服務", "水"]],
  high: [["門市人員", 0.8, "零售", "土"], ["工廠技術員", 0.92, "製造", "金"], ["行政助理", 0.85, "行政", "土"], ["水電師傅", 1.0, "營造", "火"], ["美髮師", 0.85, "服務", "火"], ["汽車維修", 0.95, "製造", "金"], ["廚師", 0.9, "餐飲", "火"], ["業務助理", 0.85, "行政", "水"], ["花藝師", 0.8, "設計", "木"]],
  college: [["業務", 1.0, "業務", "水"], ["工程師", 1.25, "科技", "火"], ["護理師", 1.05, "醫療", "木"], ["會計", 0.95, "金融", "金"], ["設計師", 0.95, "設計", "木"], ["老師", 1.05, "教育", "木"], ["公務員", 1.0, "公部門", "土"], ["行銷企劃", 0.95, "行銷", "水"], ["社工", 0.85, "社福", "木"], ["銀行行員", 1.0, "金融", "金"], ["記者", 0.9, "媒體", "水"], ["不動產經紀人", 1.05, "不動產", "土"], ["導遊", 0.85, "觀光", "水"]],
  graduate: [["研發工程師", 1.45, "科技", "火"], ["研究員", 1.25, "研究", "木"], ["藥師", 1.3, "醫療", "木"], ["資料分析師", 1.35, "科技", "水"], ["大學講師", 1.2, "教育", "木"], ["產品經理", 1.4, "科技", "火"], ["律師", 1.5, "法律", "金"], ["建築師", 1.35, "營造", "土"]],
};
// Elements of fields, for jobs set outside the lists (公務員 after the exam, the family shop, your own company).
export const FIELD_ELEMENT = { 科技: "火", 製造: "金", 餐飲: "火", 營造: "土", 運輸: "水", 自營: "土", 服務: "水", 零售: "土", 行政: "土", 業務: "水", 醫療: "木", 金融: "金", 設計: "木", 教育: "木", 公部門: "土", 行銷: "水", 社福: "木", 媒體: "水", 研究: "木", 家業: "土", 不動產: "土", 觀光: "水", 法律: "金" };
export const jobElement = job => (job ? job.element || FIELD_ELEMENT[job.field] || null : null);

// Which kinds of work suit each structure (格局), the classic reading of the ten gods.
const PATTERN_FIELDS = {
  正官格: ["公部門", "行政", "金融", "教育"], 七殺格: ["營造", "業務", "製造", "自營", "法律"],
  正財格: ["金融", "行政", "零售"], 偏財格: ["業務", "行銷", "自營", "不動產", "觀光"],
  正印格: ["教育", "研究", "醫療", "社福"], 偏印格: ["研究", "醫療", "設計", "科技"],
  食神格: ["餐飲", "設計", "服務", "觀光"], 傷官格: ["設計", "媒體", "科技", "行銷", "法律"],
  建祿格: ["自營", "業務", "營造", "製造"], 月刃格: ["自營", "業務", "營造", "法律"],
};
// How well a job fits this chart (and the name): about 1 for no fit, up to about 3.
//   +1    the job's element is the chart's first useful element (+0.6 for another useful one)
//   −0.5  it is an avoided element          +0.6  the structure (格局) suits the field
//   +0.3  it is the element of the name's 人格
export function jobFit(analysis, job, name = null) {
  const [, , field, el] = job;
  let f = 1;
  if (analysis.useful[0] === el) f += 1; else if (analysis.useful.includes(el)) f += 0.6;
  if (analysis.avoid.includes(el)) f -= 0.5;
  if ((PATTERN_FIELDS[analysis.pattern] || []).includes(field)) f += 0.6;
  if (name && name.grids && name.grids.人格 && name.grids.人格.element === el) f += 0.3;
  return Math.max(0.2, f);
}
export const fitsPattern = (analysis, field) => (PATTERN_FIELDS[analysis.pattern] || []).includes(field);
// Jobs a minor cannot take: driving needs a licence at 18, building sites and security work are closed to minors.
const ADULT_ONLY = new Set(["貨運司機", "保全", "營造工地"]);
export function jobsFor(s, list = JOBS[tier(s.edu)]) {
  const open = s.age >= 18 ? list : list.filter(([t]) => !ADULT_ONLY.has(t));
  return open.length ? open : list;
}
// A job for this person: likelier when it fits the chart.
export function pickJob(s, ctx, list = JOBS[tier(s.edu)]) {
  return ctx.rng.weighted(jobsFor(s, list).map(j => [j, jobFit(ctx.analysis, j, ctx.name)]));
}
export const tier = edu => ({ none: "basic", 國小: "basic", 國中: "basic", 高中: "high", 高職: "high", 五專: "college", 科大: "college", 大學: "college", 碩士: "graduate", 博士: "graduate" })[edu] || "basic";

// Pay relative to the national median: job, age (主計總處 2024 medians by age), career level, and luck of the draw.
export const wage = (s, factor, ctx) => Math.max(0.35, factor * interp(ctx.R.PAY_BY_AGE, s.age) * (1 + 0.12 * s.career) * Math.exp(0.15 * ctx.rng.normal()));

export function startJob(s, ctx, pick = null) {
  const [title, factor, field, element] = pick || pickJob(s, ctx);
  s.employed = true; s.job = { title, factor, field, element, since: s.age }; s.unemployedFor = 0;
  s.done.add("firstJob");   // however the first job came, the "first job" choice is behind you
  s.income = wage(s, factor, ctx);
  if (s.home === "parents" && s.age >= 22 && ctx.rng.chance(0.4)) s.home = "rent";
  return title;
}
// Another job of the same schooling, likelier when it fits the chart.
export function otherJob(s, ctx) {
  return pickJob(s, ctx, JOBS[tier(s.edu)].filter(([t]) => !s.job || t !== s.job.title));
}
export function moveTo(s, ctx, options = null) {
  const list = (options || COUNTIES).filter(([c]) => c !== s.county);
  s.county = ctx.rng.weighted(list);
  return s.county;
}
export const yearsMarried = s => (s.since === null ? 0 : s.age - s.since);

// Brothers and sisters already born and still alive, at least `minAge` years old.
export const bornSiblings = (s, minAge = 0) => s.siblings.list.filter(x => x.born && x.alive !== false && s.age - x.bornAt >= minAge);

// Everyday details by era, for the wording.
export function chatTool(year) {
  if (year < 1990) return "寫信";
  if (year < 1998) return "打電話";
  if (year < 2005) return "傳簡訊";
  if (year < 2011) return "MSN";
  return "LINE";
}
// 北區高中聯招 from 1956, 基測 from 2001, 會考 from 2014; 大專聯考 from 1954, 學測 for the 2002 多元入學 on.
export function exam15Name(year) { return year < 1956 ? "高中入學考試" : year < 2001 ? "高中聯考" : year < 2014 ? "國中基測" : "國中會考"; }
export function exam18Name(year) { return year < 1954 ? "大學入學考試" : year < 2002 ? "大學聯考" : "學測"; }
export const TRIP_PLACES = { home: ["墾丁", "花蓮", "台東", "日月潭", "阿里山", "澎湖", "綠島", "九份", "清境", "太魯閣"], abroad: ["日本", "韓國", "泰國", "香港", "新加坡", "峇里島", "歐洲", "美國", "越南", "北海道"] };
export const tripPlace = (s, ctx) => (s.year >= 1979 && ctx.rng() < 0.5 ? ctx.rng.pick(TRIP_PLACES.abroad) : ctx.rng.pick(TRIP_PLACES.home));   // 1979: overseas tourism opens
