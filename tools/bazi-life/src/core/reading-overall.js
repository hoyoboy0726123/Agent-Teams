// 綜合論斷：命書的結語。把本命（core/analysis.js）、大運走勢（core/reading-year.js 的 decadeReading）和姓名
// （core/name-reading.js 的 nameReading）已經得出的結論放在一起，這裡不另做新的判斷。
//
// overallReading(analysis, { decades, name }) → { items: [{ label, text }], closing }
//   decades: [decadeReading()], name: nameReading() or null.
import { elementRoles } from "./detail.js";
import { ELEMENT_LUCK, ELEMENT_INDUSTRIES } from "./reading-natal.js";

const COUNT = ["", "一", "兩", "三", "四", "五", "六", "七", "八", "九", "十"];
const STRETCH = {
  吉: "干支多為喜用，運勢順，宜積極進取、把握機會",
  平: "喜忌參半，起伏平和，宜穩中求進",
  凶: "干支多為忌神，阻力較多，宜守成、顧健康、少冒進",
};
const GOOD_ROLES = new Set(["用神", "喜神"]), BAD_ROLES = new Set(["忌神", "仇神"]);
// The decades a life is read over: the later ones are past most lifespans.
const LAST_START = 87;
const end = s => (/[。！？]$/.test(s) ? s : `${s}。`);

// 命格: day master, strength, pattern and the roles of the elements.
function frame(analysis) {
  const dm = analysis.dayMaster, [u, ...us] = analysis.useful, [a, ...as] = analysis.avoid;
  const likes = u ? `用神${u}${us.length ? `，喜${us.join("、")}` : ""}` : "喜忌不明顯";
  const dislikes = a ? `；忌${a}${as.length ? `，仇${as.join("、")}` : ""}` : "";
  return `${dm.stem}${dm.element}日主，${analysis.strength}，${analysis.pattern}；${likes}${dislikes}。`;
}

// Consecutive 大運 of the same tone, read as one stretch of life.
function course(decades) {
  const out = [];
  for (const d of decades) {
    const last = out[out.length - 1];
    if (last && last.tone === d.tone) last.list.push(d);
    else out.push({ tone: d.tone, list: [d] });
  }
  return end(out.map(({ tone, list }) => {
    const a = list[0], b = list[list.length - 1], names = list.map(d => d.name).join("、");
    return `${a.startAge}–${b.endAge} 歲${list.length > 1 ? `連走${names}${COUNT[list.length]}步運` : `走${names}運`}，${STRETCH[tone]}`;
  }).join("；"));
}

// How the name sits with the chart: the elements of 人格 and 總格, and of the given name's characters.
function nameItems(name, roles, useful) {
  if (!name || name.error) return [];
  const ren = name.grids.find(g => g.key === "人格"), zong = name.grids.find(g => g.key === "總格");
  const chars = (name.elements && name.elements.chars) || [];
  const roleOf = c => c.formRole || c.numberRole;
  const good = chars.filter(c => GOOD_ROLES.has(roleOf(c))), bad = chars.filter(c => BAD_ROLES.has(roleOf(c)));
  const quote = list => list.map(c => `「${c.ch}」`).join("");
  const badRoles = [...new Set(bad.map(roleOf))].join("、");
  const ease = useful ? `，可在顏色、方位與生活習慣上多用${useful}來調和` : "";
  let fit = "";
  if (!chars.length) fit = "";
  else if (good.length === chars.length) fit = `名字用字${quote(chars)}的五行都落在喜用神，正好補到八字所需，姓名與八字相輔相成`;
  else if (bad.length === chars.length) fit = `名字用字${quote(chars)}的五行落在${badRoles}，對八字的補益有限${ease}`;
  else if (good.length && bad.length) fit = `名字用字裡${quote(good)}合於喜用、${quote(bad)}落在${badRoles}，對八字的補益互見`;
  else if (good.length) fit = `名字用字裡${quote(good)}落在喜用神，對八字小有補益`;
  else if (bad.length) fit = `名字用字裡${quote(bad)}落在${badRoles}，其餘不喜不忌`;
  else fit = "名字用字的五行不喜不忌，對八字不加分也不扣分";
  const grid = g => `${g.key} ${g.value} 屬${g.element}（${g.level}數），是八字的${roles[g.element]}`;
  return [
    { label: "姓名評分", text: `${name.score} 分。${name.summary}` },
    { label: "姓名與八字", text: end(`主運${grid(ren)}；${grid(zong)}${fit ? `；${fit}` : ""}`) },
  ];
}

export function overallReading(analysis, { decades = [], name = null } = {}) {
  const roles = elementRoles(analysis);
  const useful = analysis.useful[0] || null;
  const runs = decades.filter(d => d && d.startAge <= LAST_START);
  const items = [{ label: "命格", text: frame(analysis) }];
  if (runs.length) items.push({ label: "一生運勢", text: course(runs) });
  // The strongest and the hardest decade of the working years and the first years after them.
  const grown = runs.filter(d => d.startAge >= 17 && d.startAge <= 67);
  if (grown.length) {
    const best = grown.reduce((x, y) => (y.favor.score > x.favor.score ? y : x));
    const worst = grown.reduce((x, y) => (y.favor.score < x.favor.score ? y : x));
    if (best.tone === "吉") items.push({ label: "最旺之運", text: `${best.startAge}–${best.endAge} 歲（${best.startYear}–${best.endYear}）的${best.headline}` });
    if (worst.tone === "凶") items.push({ label: "宜謹慎之運", text: `${worst.startAge}–${worst.endAge} 歲（${worst.startYear}–${worst.endYear}）的${worst.headline}` });
  }
  items.push(...nameItems(name, roles, useful));

  const luck = useful ? ELEMENT_LUCK[useful] : null;
  const hard = runs.filter(d => d.tone === "凶").map(d => d.name);
  const closing = "先天八字是底盤，大運是時機，姓名是後天的輔助。"
    + (useful
      ? `這張命盤的關鍵在用神${useful}：${luck.direction}、${luck.colors.join("、")}色，以及${ELEMENT_INDUSTRIES[useful].slice(0, 3).join("、")}這類與${useful}有關的方向，是一生可以多借力的地方`
      : "這張命盤五行的喜忌不明顯，順勢而為即可")
    + (hard.length ? `；走到${hard.join("、")}這${COUNT[hard.length]}步忌運時，放慢腳步、顧好健康與財務，就能把起伏降到最低。` : "；一生的大運少有忌運，把握順勢的時機即可。")
    + "命盤說的是時機與傾向，路怎麼走，還是看自己的選擇。";
  return { items, closing };
}
