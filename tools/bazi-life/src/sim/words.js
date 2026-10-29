// Words for the story: the opening line at birth, short descriptions of a chart, and how family members are called.
import { splitName } from "../core/name.js";

const TRAITS = {
  甲: "像大樹，正直、有主見", 乙: "像花草藤蔓，柔軟、懂得變通", 丙: "像太陽，熱情、大方", 丁: "像燭火，細心、溫暖",
  戊: "像高山，穩重、可靠", 己: "像田園，包容、務實", 庚: "像刀劍，果斷、講義氣", 辛: "像珠寶，細膩、愛面子",
  壬: "像大江，聰明、愛自由", 癸: "像雨露，敏感、想像力豐富",
};
const STRENGTH = { 身強: "日主偏強", 身弱: "日主偏弱", 中和: "日主強弱適中", 從弱: "日主極弱、順從旺勢", 專旺: "日主極旺" };
const COUNT = ["", "一", "兩", "三", "四", "五", "六", "七", "八", "九"];

export function chartLine(analysis) {
  const a = analysis;
  const useful = a.useful.length ? `喜${a.useful.join("、")}` : "喜忌不明顯";
  return `${a.dayMaster.stem}${a.dayMaster.element}日主，${STRENGTH[a.strength]}，${useful}`;
}

export function trait(analysis) {
  return TRAITS[analysis.dayMaster.stem];
}

// 甲、乙和丙
export const listWords = items => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join("、")}和${items[items.length - 1]}`);

// How the family calls someone: the given name of a full name (陳志明 → 志明). A one-character given name keeps the
// whole name (陳明), and so does a nickname (小美).
export function callName(full) {
  if (!full) return "";
  const { given } = splitName(full);
  return given.length >= 2 ? given.join("") : String(full).replace(/\s+/g, "");
}
// 哥哥志明, or just 哥哥
export const siblingCall = x => x.label + callName(x.name);

// Siblings for a sentence: named ones by name, the others counted (兩個哥哥).
export function siblingWords(list) {
  const named = list.filter(x => x.name).map(siblingCall);
  const counts = new Map();
  for (const x of list.filter(x => !x.name)) counts.set(x.label, (counts.get(x.label) || 0) + 1);
  return listWords([...named, ...[...counts].map(([label, n]) => `${COUNT[n] || n}個${label}`)]);
}

export function analyseText(analysis, chart, s) {
  const where = s.county || chart.input.place.name;
  const gender = s.sex === "female" ? "女孩" : "男孩";
  const named = s.name ? `，名叫${s.name}` : "";
  const parents = [s.father.name && `爸爸是${s.father.name}`, s.mother.name && `媽媽是${s.mother.name}`].filter(Boolean).join("，");
  const older = s.siblings.list.filter(x => x.older).sort((a, b) => a.bornAt - b.bornAt);
  const family = (parents ? `${parents}。` : "") + (older.length ? `上面已經有${siblingWords(older)}。` : "");
  return `${s.birthYear} 年，你在${where}出生，是個屬${chart.zodiac}的${gender}${named}。${family}命盤是${chart.pillars.map(p => p.name).join(" ")}，${chartLine(analysis)}。個性${trait(analysis)}。`;
}
