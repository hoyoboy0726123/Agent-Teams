// tyme4ts names its terms in Simplified Chinese. These are every character it uses that differs in Traditional.
const WORDS = { 谷雨: "穀雨" };
const CHARS = {
  财: "財", 伤: "傷", 杀: "殺",
  炉: "爐", 剑: "劍", 锋: "鋒", 头: "頭", 涧: "澗", 蜡: "蠟", 杨: "楊", 雳: "靂", 长: "長", 驿: "驛", 钗: "釵", 钏: "釧", 灯: "燈",
  带: "帶", 临: "臨", 绝: "絕", 养: "養",
  惊: "驚", 蛰: "蟄", 满: "滿", 种: "種", 处: "處",
  龙: "龍", 马: "馬", 鸡: "雞", 猪: "豬",
  农: "農", 历: "曆", 闰: "閏",
};
const pattern = new RegExp(`${Object.keys(WORDS).join("|")}|[${Object.keys(CHARS).join("")}]`, "g");

export const zh = s => String(s).replace(pattern, x => WORDS[x] || CHARS[x]);
