// Words for the story: the opening line at birth, and short descriptions of a chart.
const TRAITS = {
  甲: "像大樹，正直、有主見", 乙: "像花草藤蔓，柔軟、懂得變通", 丙: "像太陽，熱情、大方", 丁: "像燭火，細心、溫暖",
  戊: "像高山，穩重、可靠", 己: "像田園，包容、務實", 庚: "像刀劍，果斷、講義氣", 辛: "像珠寶，細膩、愛面子",
  壬: "像大江，聰明、愛自由", 癸: "像雨露，敏感、想像力豐富",
};
const STRENGTH = { 身強: "日主偏強", 身弱: "日主偏弱", 中和: "日主強弱適中", 從弱: "日主極弱、順從旺勢", 專旺: "日主極旺" };

export function chartLine(analysis) {
  const a = analysis;
  const useful = a.useful.length ? `喜${a.useful.join("、")}` : "喜忌不明顯";
  return `${a.dayMaster.stem}${a.dayMaster.element}日主，${STRENGTH[a.strength]}，${useful}`;
}

export function trait(analysis) {
  return TRAITS[analysis.dayMaster.stem];
}

export function analyseText(analysis, chart, s) {
  const where = s.county || chart.input.place.name;
  const gender = s.sex === "female" ? "女孩" : "男孩";
  return `${s.birthYear} 年，你在${where}出生，是個屬${chart.zodiac}的${gender}。命盤是${chart.pillars.map(p => p.name).join(" ")}，${chartLine(analysis)}。個性${trait(analysis)}。`;
}
