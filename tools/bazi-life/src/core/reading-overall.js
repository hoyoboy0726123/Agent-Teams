// 綜合論斷：命書的結語。把本命（core/analysis.js）、大運走勢（core/reading-year.js 的 decadeReading）和姓名
// （core/name-reading.js 的 nameReading）已經得出的結論放在一起，這裡不另做新的判斷。
//
// overallReading(analysis, { decades, name }) → { items: [{ label, text }], closing }
//   decades: [decadeReading()], name: nameReading() or null.
import { elementRoles } from "./detail.js";
import { ELEMENT_LUCK, ELEMENT_INDUSTRIES } from "./reading-natal.js";
// Every sentence goes through tr() (core/tr.js): the Chinese as it always was, or its English (src/i18n/en/report.json).
import { tr, trw, trJoin, readingLang } from "./tr.js";

const COUNT = ["", "一", "兩", "三", "四", "五", "六", "七", "八", "九", "十"];
const STRETCH = {
  吉: () => tr("干支多為喜用，運勢順，宜積極進取、把握機會"),
  平: () => tr("喜忌參半，起伏平和，宜穩中求進"),
  凶: () => tr("干支多為忌神，阻力較多，宜守成、顧健康、少冒進"),
};
const GOOD_ROLES = new Set(["用神", "喜神"]), BAD_ROLES = new Set(["忌神", "仇神"]);
// The decades a life is read over: the later ones are past most lifespans.
const LAST_START = 87;
const en = () => readingLang() === "en";
const end = s => (en() ? (/[.!?]$/.test(s) ? s : `${s}.`) : /[。！？]$/.test(s) ? s : `${s}。`);
// A count of 大運: 兩 in Chinese, 2 in English.
const count = n => (en() ? n : COUNT[n]);
const words = list => trJoin(list.map(trw));

// 命格: day master, strength, pattern and the roles of the elements.
function frame(analysis) {
  const dm = analysis.dayMaster, [u, ...us] = analysis.useful, [a, ...as] = analysis.avoid;
  const likes = u ? (us.length ? tr("用神{useful}，喜{alsoLiked}", { useful: u, alsoLiked: words(us) }) : tr("用神{useful}", { useful: u })) : tr("喜忌不明顯");
  const dislikes = a ? (as.length ? tr("；忌{avoided}，仇{alsoAvoided}", { avoided: a, alsoAvoided: words(as) }) : tr("；忌{avoided}", { avoided: a })) : "";
  const pattern = analysis.special ? tr("月令{monthPattern}，以{specialName}論", { monthPattern: analysis.pattern, specialName: analysis.special.name }) : trw(analysis.pattern);
  const strength = analysis.special && analysis.special.kind === "從強" ? "印比成勢" : analysis.strength;
  return tr("{dayStem}{dayElement}日主，{strength}，{pattern}；{likes}{dislikes}。", { dayStem: dm.stem, dayElement: dm.element, strength, pattern, likes, dislikes });
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
    const a = list[0], b = list[list.length - 1], names = words(list.map(d => d.name));
    return list.length > 1
      ? tr("{stretchFrom}–{stretchTo} 歲連走{names}{count}步運，{stretch}", { stretchFrom: a.startAge, stretchTo: b.endAge, names, count: count(list.length), stretch: STRETCH[tone]() })
      : tr("{stretchFrom}–{stretchTo} 歲走{names}運，{stretch}", { stretchFrom: a.startAge, stretchTo: b.endAge, names, stretch: STRETCH[tone]() });
  }).join(en() ? "; " : "；"));
}

// How the name sits with the chart: the elements of 人格 and 總格, and of the given name's characters.
function nameItems(name, roles, useful) {
  if (!name || name.error) return [];
  const ren = name.grids.find(g => g.key === "人格"), zong = name.grids.find(g => g.key === "總格");
  const chars = (name.elements && name.elements.chars) || [];
  const roleOf = c => c.formRole || c.numberRole;
  const good = chars.filter(c => GOOD_ROLES.has(roleOf(c))), bad = chars.filter(c => BAD_ROLES.has(roleOf(c)));
  // 「怡」「君」; in English the characters' sounds with the characters in brackets: Yi (怡), Chun (君).
  const quote = list => (en() ? list.map(c => `${trw(c.ch)} (${c.ch})`).join(", ") : list.map(c => `「${c.ch}」`).join(""));
  const badRoles = words([...new Set(bad.map(roleOf))]);
  const ease = useful ? tr("，可在顏色、方位與生活習慣上多用{useful}來調和", { useful }) : "";
  let fit = "";
  if (!chars.length) fit = "";
  else if (good.length === chars.length) fit = tr("名字用字{chars}的五行都落在喜用神，正好補到八字所需，姓名與八字相輔相成", { chars: quote(chars) });
  else if (bad.length === chars.length) fit = tr("名字用字{chars}的五行落在{badRoles}，對八字的補益有限{ease}", { chars: quote(chars), badRoles, ease });
  else if (good.length && bad.length) fit = tr("名字用字裡{good}合於喜用、{bad}落在{badRoles}，對八字的補益互見", { good: quote(good), bad: quote(bad), badRoles });
  else if (good.length) fit = tr("名字用字裡{good}落在喜用神，對八字小有補益", { good: quote(good) });
  else if (bad.length) fit = tr("名字用字裡{bad}落在{badRoles}，其餘不喜不忌", { bad: quote(bad), badRoles });
  else fit = tr("名字用字的五行不喜不忌，對八字不加分也不扣分");
  const grid = g => tr("{gridKey} {gridValue} 屬{gridElement}（{gridLevel}數），是八字的{gridRole}", { gridKey: g.key, gridValue: g.value, gridElement: g.element, gridLevel: g.level, gridRole: roles[g.element] });
  return [
    { label: tr("姓名評分"), text: tr("{nameScore} 分。{nameSummary}", { nameScore: name.score, nameSummary: name.summary }) },
    { label: tr("姓名與八字"), text: end(tr("主運{renGrid}；{zongGrid}", { renGrid: grid(ren), zongGrid: grid(zong) }) + (fit ? tr("；{nameFit}", { nameFit: fit }) : "")) },
  ];
}

export function overallReading(analysis, { decades = [], name = null } = {}) {
  const roles = elementRoles(analysis);
  const useful = analysis.useful[0] || null;
  const runs = decades.filter(d => d && d.startAge <= LAST_START);
  const items = [{ label: tr("命格"), text: frame(analysis) }];
  if (runs.length) items.push({ label: tr("一生運勢"), text: course(runs) });
  // The strongest and the hardest decade of the working years and the first years after them.
  const grown = runs.filter(d => d.startAge >= 17 && d.startAge <= 67);
  if (grown.length) {
    const best = grown.reduce((x, y) => (y.favor.score > x.favor.score ? y : x));
    const worst = grown.reduce((x, y) => (y.favor.score < x.favor.score ? y : x));
    const when = d => tr("{runFrom}–{runTo} 歲（{runFromYear}–{runToYear}）的{runHeadline}", { runFrom: d.startAge, runTo: d.endAge, runFromYear: d.startYear, runToYear: d.endYear, runHeadline: d.headline });
    if (best.tone === "吉") items.push({ label: tr("最旺之運"), text: when(best) });
    if (worst.tone === "凶") items.push({ label: tr("宜謹慎之運"), text: when(worst) });
  }
  items.push(...nameItems(name, roles, useful));

  const luck = useful ? ELEMENT_LUCK[useful] : null;
  const hard = runs.filter(d => d.tone === "凶").map(d => d.name);
  const closing = tr("先天八字是底盤，大運是時機，姓名是後天的輔助。")
    + (useful
      ? tr("這張命盤的關鍵在用神{useful}：{direction}、{colors}色，以及{industries}這類與{useful}有關的方向，是一生可以多借力的地方", { useful, direction: luck.direction, colors: en() ? words(luck.colors.map(c => `${c}色`)) : luck.colors.join("、"), industries: words(ELEMENT_INDUSTRIES[useful].slice(0, 3)) })
      : tr("這張命盤五行的喜忌不明顯，順勢而為即可"))
    + (hard.length ? tr("；走到{hardRuns}這{count}步忌運時，放慢腳步、顧好健康與財務，就能把起伏降到最低。", { hardRuns: words(hard), count: count(hard.length) }) : tr("；一生的大運少有忌運，把握順勢的時機即可。"))
    + tr("命盤說的是時機與傾向，路怎麼走，還是看自己的選擇。");
  return { items, closing };
}
