// 本命詳批：一張八字命盤裡不隨年份改變的部分——排盤表、五行旺衰、日主強弱、格局用神、性格、六親、事業、財運、婚姻、
// 健康與開運。流年、大運在 reading-year.js，姓名在 name-reading.js。
//
// natalReading(chart, analysis, { name }) reads a chart (core/chart.js), its analysis (core/analysis.js) and the detail
// layer (core/detail.js), and returns a plain object for the page:
//
//   {
//     title: "八字命理詳批",
//     basics: [{ label, value, note? }],   國曆、真太陽時、農曆、生肖、節氣、人元司令、起運、命宮、身宮、胎元、胎息、命局、五行
//     table: { columns: ["年柱", "月柱", "日柱", "時柱"], rows: [{ label, cells, elements? }] }
//            ten rows (主星 天干 地支 藏干 副星 星運 自坐 空亡 納音 神煞), one column per pillar (three without an hour).
//            A cell is a string, except in 藏干、副星、神煞, where it is an array of lines. 天干、地支 rows also carry
//            `elements` (the five-element of each cell) for colouring.
//     sections: [{ id, title, paragraphs: [string], items: [{ label, text }] }]   eleven, in the order of SECTION_IDS
//     advice: { elements, colors, directions, numbers, industries, habits, zodiac }   arrays (numbers are numbers)
//     notes: [string]      the chart's birth-time caveats (時辰不詳、交節日、日光節約時間…)
//     disclaimer: string
//   }
//
// Every sentence is built from this chart: its stems, branches, palaces and the analysis' verdicts. The 用神 is always
// analysis.useful[0] and the 調候 text follows analysis.schools.調候, so the report and the blended 喜用 agree. A
// professional term is glossed in plain words where it first appears in reading order (GLOSSARY, applied as a last
// pass so it lands on the real first use). Unfavourable things are said gently, as what tradition holds, never as
// fate; health is never a diagnosis. The static tables are exported for reuse.
import { SixtyCycle, SolarDay, SolarTime } from "tyme4ts";
import { zh } from "./zh.js";
import { ELEMENTS, GROUPS, SCHOOLS, groupOf, elementOf, tiaohouNote } from "./analysis.js";
import {
  natalStars, natalRelations, seasonalStates, strengthFactors, tenGodCounts, elementRoles, luckStars, STEMS, BRANCHES, glue, pillarWord,
} from "./detail.js";
import { tr, trw, readingLang } from "./tr.js";

const hasCJK = t => /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(String(t));

// ---------- 靜態表 ----------

// 十天干日主：《滴天髓》論十干的句子（〈天干〉篇，依任鐵樵《滴天髓闡微》；全書開篇是「欲識三元萬法宗」，不是這些句子）、
// 意象、性格的長處與盲點。
export const DAY_MASTER_TEXT = {
  甲: { yinyang: "陽木", image: "參天大樹", verse: "甲木參天，脫胎要火",
    nature: "正直上進、有原則，像大樹一心往上長，做事有規畫、肯承擔，帶著天生的領導架勢",
    blind: "自尊心強、不太會轉彎，面子拉不下來時容易硬撐，受挫時寧折不彎" },
  乙: { yinyang: "陰木", image: "花草藤蘿", verse: "乙木雖柔，刲羊解牛",
    nature: "柔中帶韌、善解人意，像藤蔓一樣懂得借力使力，適應力強，人際手腕細膩",
    blind: "容易猶豫、顧慮多，太在意別人的看法，有時依賴心偏重" },
  丙: { yinyang: "陽火", image: "太陽", verse: "丙火猛烈，欺霜侮雪",
    nature: "熱情開朗、光明磊落，喜歡照顧人，有感染力與表現欲，做事積極、不藏私",
    blind: "性子急、容易三分鐘熱度，愛面子，話說得太直時容易得罪人" },
  丁: { yinyang: "陰火", image: "燭火星光", verse: "丁火柔中，內性昭融",
    nature: "外柔內明，細心體貼、思慮周密，觀察力敏銳，對認定的人和事很長情",
    blind: "心思重、情緒起伏較大，容易多慮而消耗自己" },
  戊: { yinyang: "陽土", image: "高山厚土", verse: "戊土固重，既中且正",
    nature: "穩重踏實、守信用，包容力強，給人可靠的安全感，做事重實際",
    blind: "固執保守、變通較慢，不輕易表露情緒，有時讓人覺得難以親近" },
  己: { yinyang: "陰土", image: "田園沃土", verse: "己土卑濕，中正蓄藏",
    nature: "溫和謙虛、心思細密，善於包容與培育別人，默默付出、重視家庭",
    blind: "容易想太多、優柔寡斷，常委屈自己去成全別人" },
  庚: { yinyang: "陽金", image: "刀劍礦鐵", verse: "庚金帶煞，剛健為最",
    nature: "剛毅果斷、講義氣，行動力強，重承諾、敢做敢當，有正義感",
    blind: "脾氣硬、說話衝，好勝心強，不喜歡被管" },
  辛: { yinyang: "陰金", image: "珠玉", verse: "辛金軟弱，溫潤而清",
    nature: "細膩敏銳、重品味與質感，做事追求精緻完美，外表溫潤而內心自有原則",
    blind: "愛面子、對批評敏感，很在意別人的評價，壓力大時容易鑽牛角尖" },
  壬: { yinyang: "陽水", image: "江河大海", verse: "壬水通河，能洩金氣",
    nature: "聰明機智、反應快、心胸開闊，喜歡自由與變化，有謀略也有包容力",
    blind: "定性不足、容易隨性而為，想法多變，有時讓人捉摸不定" },
  癸: { yinyang: "陰水", image: "雨露甘泉", verse: "癸水至弱，達於天津",
    nature: "溫柔細膩、想像力豐富、直覺敏銳，善於體察人心，做事低調而有韌性",
    blind: "容易多愁善感、缺乏安全感，想得多而行動遲疑" },
};

// 《滴天髓》〈天干〉篇裡和取用有關的句子：符合 when 時，格局與用神一節會引用。丙火「甲來成滅」有的版本作「甲來焚滅」。
// Every quote the reading prints must be one of these lines, DAY_MASTER_TEXT's verses or EXCESS (test/reading-natal.test.js).
const VERSES = {
  甲: [
    { line: "脫胎要火", when: c => c.a.useful.includes("火"), text: "甲木要有火來發揮，就像木材遇火才見光彩" },
    { line: "地潤天和，植立千古", when: c => c.a.useful.includes("水"), text: "地支有水滋潤、天干和順，大樹才能長久挺立" },
  ],
  乙: [
    { line: "懷丁抱丙，跨鳳乘猴", when: c => c.a.useful.includes("火"), text: "乙木有丙丁火相伴，就不怕申酉金來剋" },
    { line: "藤蘿繫甲，可春可秋", when: c => c.a.useful.includes("木"), text: "藤蘿攀上大樹，四季都能生長，喜歡有同類扶持" },
    { line: "虛濕之地，騎馬亦憂", when: c => c.a.avoid.includes("水"), text: "水多地濕，乙木的根容易爛，即使有火也難以發揮" },
  ],
  丙: [
    { line: "虎馬犬鄉，甲來成滅", when: c => c.a.avoid.includes("木") && c.share.火 >= 0.3, text: "火勢已旺時再添甲木，只會燒得太烈" },
    { line: "水猖顯節", when: c => c.a.useful.includes("水") || c.share.水 >= 0.3, text: "水勢再大，丙火也能顯出光明的節氣" },
  ],
  丁: [
    { line: "如有嫡母，可秋可冬", when: c => c.a.useful.includes("木"), text: "有甲木（正印）生扶，生在秋冬也不怕" },
  ],
  戊: [
    { line: "水潤物生，火燥物病", when: c => c.a.useful.includes("水") || c.a.avoid.includes("火"), text: "厚土要有水滋潤才能長養萬物，火太燥則土乾" },
  ],
  己: [
    { line: "若要物旺，宜助宜幫", when: c => c.a.useful.includes("火") || c.a.useful.includes("土"), text: "己土要生養萬物，需要火與同類的土來幫扶" },
  ],
  庚: [
    { line: "得水而清，得火而銳", when: c => c.a.useful.includes("水") || c.a.useful.includes("火"), text: "庚金遇水洩秀就清，遇火鍛鍊就利" },
    { line: "土潤則生，土乾則脆", when: c => c.a.useful.includes("土"), text: "濕潤的土能生金，乾燥的土反而讓金變脆" },
  ],
  辛: [
    { line: "畏土之疊，樂水之盈", when: c => c.a.useful.includes("水") || c.a.avoid.includes("土"), text: "怕厚土把它埋住，喜歡水來淘洗，越洗越亮" },
    { line: "熱則喜母，寒則喜丁", when: c => c.a.useful.includes("土") || c.a.useful.includes("火"), text: "生在熱天喜歡土（印）來滋養，生在冷天喜歡丁火來暖" },
  ],
  壬: [
    { line: "通根透癸，沖天奔地", when: c => c.a.rooted && !c.a.special && c.a.avoid.includes("水"), text: "壬水通根又見癸水時氣勢奔騰，需要疏導而不宜再添" },
    { line: "化則有情，從則相濟", when: c => c.a.strength === "從弱" || c.a.strength === "專旺", text: "壬水能合能從，順勢而行時最見智慧" },
  ],
  癸: [
    { line: "得龍而運，功化斯神", when: c => c.pillars.some(p => p.branch.name === "辰"), text: "癸水遇辰（龍）就能興雲化雨，發揮最大的作用" },
    { line: "不愁火土，不論庚辛", when: c => !c.a.useful.includes("金") && (c.a.useful.includes("火") || c.a.useful.includes("土")), text: "癸水看似柔弱，其實不怕火土，也不一定要庚辛來生" },
  ],
};

// 五行生剋太過的古訣（《窮通寶鑑》論五行生剋），以日主五行為鍵。
const EXCESS = {
  印: { 木: "木賴水生，水多木漂", 火: "火賴木生，木多火熾", 土: "土賴火生，火多土焦", 金: "金賴土生，土多金埋", 水: "水賴金生，金多水濁" },
  食傷: { 木: "木能生火，火多木焚", 火: "火能生土，土多火晦", 土: "土能生金，金多土變", 金: "金能生水，水多金沉", 水: "水能生木，木盛水縮" },
  財: { 木: "木能剋土，土重木折", 火: "火能剋金，金多火熄", 土: "土能剋水，水多土流", 金: "金能剋木，木堅金缺", 水: "水能剋火，火炎水灼" },
  官殺: { 木: "木弱逢金，必為砍折", 火: "火弱逢水，必為熄滅", 土: "土衰逢木，必遭傾陷", 金: "金衰遇火，必見銷鎔", 水: "水弱逢土，必為淤塞" },
  比劫: { 木: "強木得火，方化其頑", 火: "強火得土，方止其焰", 土: "強土得金，方制其壅", 金: "強金得水，方挫其鋒", 水: "強水得木，方洩其勢" },
};

// Every line the reading may quote from the classics: anything else in 「」 after a book's name is a mistake.
export const CLASSIC_LINES = [
  ...Object.values(DAY_MASTER_TEXT).map(x => x.verse),
  ...Object.values(VERSES).flat().map(v => v.line),
  ...Object.values(EXCESS).flatMap(o => Object.values(o)),
];
// Where each kept line comes from, as the 詳批 names it.
export const CLASSIC_SOURCE = new Map([
  ...Object.values(DAY_MASTER_TEXT).map(x => [x.verse, "《滴天髓》"]),
  ...Object.values(VERSES).flat().map(v => [v.line, "《滴天髓》"]),
  ...Object.values(EXCESS).flatMap(o => Object.values(o)).map(l => [l, "古訣"]),
]);

// 十神：白話說明、長處、盲點、太重時、日支坐此十神的內在性格、適合的工作型態。
export const TEN_GOD_TEXT = {
  比肩: { gloss: "和日主同五行、同陰陽", trait: "獨立自主、有主見，重視公平", blind: "固執、不輕易求助，合作時容易各做各的",
    heavy: "自我意識強、競爭心重，宜學會分工與授權", seat: "內心獨立，凡事想靠自己", work: "能自己作主的工作" },
  劫財: { gloss: "和日主同五行、異陰陽", trait: "熱情豪爽、行動力強，敢衝敢拚", blind: "好勝衝動、花錢大方，容易因朋友或合夥破財",
    heavy: "企圖心旺，理財與合夥要格外謹慎", seat: "內心好勝、不服輸", work: "需要衝勁與人脈的工作" },
  食神: { gloss: "日主所生、同陰陽", trait: "溫和樂觀、有品味，懂得享受生活，才華在從容中流露", blind: "安於現狀、容易拖延，不喜歡競爭",
    heavy: "興趣廣而容易分散，宜聚焦一項專長", seat: "個性隨和，重視生活品質", work: "發揮手藝與品味的工作" },
  傷官: { gloss: "日主所生、異陰陽", trait: "聰明敏銳、口才好、有創意，喜歡突破框架", blind: "心直口快、不服管，對人對己要求都高",
    heavy: "才華洋溢也容易恃才傲物，和上司、規範起摩擦", seat: "心思靈巧，有自己的一套標準", work: "需要創意與表達的工作" },
  正財: { gloss: "日主所剋、異陰陽", trait: "務實勤儉、重信用，做事按部就班、量入為出", blind: "保守、計較得失，有時放不開",
    heavy: "重視物質與安全感，容易為錢操心", seat: "重視家庭與實際，生活有條理", work: "穩定經營、管帳管物的工作" },
  偏財: { gloss: "日主所剋、同陰陽", trait: "慷慨大方、人緣好、反應快，有生意眼光", blind: "花錢快、愛冒險，容易財來財去",
    heavy: "機會多、應酬也多，宜量力而為", seat: "豪爽好客，對機會敏感", work: "流動性高、看機會的工作" },
  正官: { gloss: "剋日主、異陰陽", trait: "守規矩、有責任感、重名譽，自律而可靠", blind: "拘謹保守，太在意別人的眼光",
    heavy: "約束多、壓力大，容易綁手綁腳", seat: "自我要求高，重視形象", work: "制度清楚的組織" },
  七殺: { gloss: "剋日主、同陰陽", trait: "有魄力、敢擔當，越有挑戰越有鬥志", blind: "性急多疑，壓力大時容易鑽牛角尖",
    heavy: "外在壓力與責任多，宜有印星化解或食神制伏", seat: "外柔內剛，有危機意識", work: "有挑戰、要決斷的工作" },
  正印: { gloss: "生日主、異陰陽", trait: "仁厚寬容、好學，有長輩緣，重視精神層面", blind: "依賴心較重、被動，想得多做得少",
    heavy: "容易保守、依賴，行動力不足", seat: "心地仁厚，需要安全感", work: "學術、教育與需要專業背書的工作" },
  偏印: { gloss: "生日主、同陰陽，也叫梟神", trait: "領悟力強、思考獨特，適合鑽研專門學問", blind: "孤僻多疑、想太多，做事容易虎頭蛇尾",
    heavy: "想法特別而不易被理解，宜找到能專精的領域", seat: "內心有獨特的想法，需要獨處的空間", work: "專門技術與研究" },
};

// 格局：白話說明、氣質、傳統上適合的職業、成格所喜、破格所忌。
export const PATTERN_TEXT = {
  正官格: { gloss: "月令本氣是正官", nature: "端正守法、重名譽與責任，適合在制度裡穩步上升",
    careers: ["公職", "管理", "法務", "金融", "教育行政"], wants: "財星生官、印星護官", fears: "傷官見官、官殺混雜" },
  七殺格: { gloss: "月令本氣是七殺", nature: "有魄力、能扛壓力，越困難的局面越能展現能力",
    careers: ["軍警", "執法", "外科", "工程", "業務開發", "創業"], wants: "食神制殺或印星化殺", fears: "財星生殺而無制" },
  正財格: { gloss: "月令本氣是正財", nature: "務實勤勉、重信用，靠穩定累積成就事業與財富",
    careers: ["財務", "會計", "銀行", "行政", "零售"], wants: "身強任財、食傷生財、財旺生官", fears: "比劫奪財、財多身弱" },
  偏財格: { gloss: "月令本氣是偏財", nature: "慷慨灑脫、善於交際，對機會與市場很敏感",
    careers: ["業務", "貿易", "投資", "行銷", "自營", "不動產"], wants: "身強任財、食傷生財", fears: "比劫奪財、財多身弱" },
  正印格: { gloss: "月令本氣是正印", nature: "仁厚好學、重精神與名聲，有長者風範",
    careers: ["教育", "學術", "醫療", "社福", "文化出版"], wants: "官殺生印", fears: "財星壞印" },
  偏印格: { gloss: "月令本氣是偏印", nature: "思考獨特、領悟力強，適合專門技術與冷門學問",
    careers: ["研究", "醫藥", "資訊", "設計", "命理玄學"], wants: "官殺生印", fears: "梟神奪食、財星壞印" },
  食神格: { gloss: "月令本氣是食神", nature: "溫和樂天、有品味，才華在從容中展現",
    careers: ["餐飲", "藝術", "設計", "教學", "服務", "休閒觀光"], wants: "食神生財、食神制殺", fears: "梟神奪食" },
  傷官格: { gloss: "月令本氣是傷官", nature: "聰明有才、口才好，追求突破，不喜歡被框住",
    careers: ["設計", "媒體", "表演", "法律", "科技研發", "顧問"], wants: "傷官生財、傷官佩印", fears: "傷官見官" },
  建祿格: { gloss: "月令是日主的祿", nature: "自立自強、靠自己打天下，根基穩而祖蔭較少",
    careers: ["自營", "業務", "技術專業", "管理"], wants: "官殺制約、食傷洩秀、財星得用", fears: "比劫成群而無制" },
  月刃格: { gloss: "月令是日主的劫財（陽干為羊刃）", nature: "剛強果決、行動力強，宜有官殺約束來成就事業",
    careers: ["軍警", "外科", "運動", "工程", "創業", "執法"], wants: "官殺制刃", fears: "無官殺而比劫重" },
};
// Why each school of 格局 likes or dislikes a group (the votes themselves live in analysis.js).
const PATTERN_LIKES = {
  正官格: { 財: "財星生官", 印: "印星護官" }, 七殺格: { 食傷: "食神制殺", 印: "印星化殺" },
  正財格: { 食傷: "食傷生財", 官殺: "財旺生官" }, 偏財格: { 食傷: "食傷生財", 官殺: "財旺生官" },
  正印格: { 官殺: "官殺生印" }, 偏印格: { 官殺: "官殺生印" }, 食神格: { 財: "食神生財" }, 傷官格: { 財: "傷官生財", 印: "傷官佩印" },
  建祿格: { 官殺: "官殺制祿", 財: "財星得用", 食傷: "食傷洩秀" }, 月刃格: { 官殺: "官殺制刃", 財: "財星得用", 食傷: "食傷洩秀" },
};
const PATTERN_DISLIKES = {
  正官格: { 食傷: "傷官見官" }, 七殺格: { 財: "財星生殺" }, 正財格: { 比劫: "比劫奪財" }, 偏財格: { 比劫: "比劫奪財" },
  正印格: { 財: "財星壞印" }, 偏印格: { 財: "財星壞印" }, 食神格: { 印: "梟神奪食" }, 傷官格: { 官殺: "傷官見官" },
  建祿格: { 比劫: "比劫過旺", 印: "印星再生" }, 月刃格: { 比劫: "比劫過旺", 印: "印星再生" },
};

// 五行與行業、臟腑、開運。
export const ELEMENT_INDUSTRIES = {
  木: ["教育", "文化出版", "醫療護理", "設計", "園藝花藝", "服飾紡織", "社福"],
  火: ["科技電子", "資訊軟體", "能源", "餐飲", "美容美髮", "演藝娛樂"],
  土: ["營建", "不動產", "行政管理", "農業", "倉儲", "顧問仲介"],
  金: ["金融", "銀行保險", "法律", "機械", "五金汽車", "精密製造"],
  水: ["貿易", "運輸物流", "業務行銷", "媒體傳播", "旅遊觀光", "水產飲品"],
};
export const ELEMENT_ORGANS = {
  木: { organs: "肝、膽、筋骨與四肢", care: "少熬夜、多伸展，保持情緒舒暢" },
  火: { organs: "心臟、血液循環、小腸與眼睛", care: "作息規律，避免過勞與情緒大起大落" },
  土: { organs: "脾、胃、肌肉與消化", care: "三餐定時定量，少吃生冷與甜膩" },
  金: { organs: "肺、大腸、呼吸道與皮膚", care: "換季時注意保暖與空氣品質，皮膚做好保濕" },
  水: { organs: "腎、膀胱、泌尿生殖與耳朵", care: "多喝水、腰腹保暖，避免久坐憋尿" },
};
// 顏色、方位、河圖數（天一生水地六成之、地二生火天七成之、天三生木地八成之、地四生金天九成之、天五生土地十成之）。
export const ELEMENT_LUCK = {
  木: { colors: ["綠", "青"], direction: "東方", numbers: [3, 8], season: "春季", trait: "仁厚上進", habit: "多接觸綠意、早睡早起，做伸展運動" },
  火: { colors: ["紅", "紫", "橙"], direction: "南方", numbers: [2, 7], season: "夏季", trait: "熱情開朗", habit: "多曬太陽、規律運動流汗，保持熱情" },
  土: { colors: ["黃", "咖啡", "米"], direction: "中央與東北、西南", numbers: [5, 0], season: "季月（辰戌丑未月）", trait: "穩重踏實", habit: "規律飲食、踏實儲蓄，多親近土地" },
  金: { colors: ["白", "金", "銀"], direction: "西方、西北", numbers: [4, 9], season: "秋季", trait: "果斷守信", habit: "整理環境、斷捨離，練習深呼吸" },
  水: { colors: ["黑", "藍", "灰"], direction: "北方", numbers: [1, 6], season: "冬季", trait: "聰明靈活", habit: "多喝水、游泳或親近水邊，閱讀與旅行" },
};

// 十二長生（星運）：白話說明，以及日支（配偶宮）坐此星運時傳統上的說法。
export const TERRAIN_TEXT = {
  長生: { gloss: "如初生，生機勃勃", spouse: "感情溫和長久，彼此扶持" },
  沐浴: { gloss: "如嬰兒沐浴，多變而重感覺", spouse: "感情豐富浪漫，也較多變，宜多建立信任" },
  冠帶: { gloss: "如成年戴冠，重體面、漸有所成", spouse: "兩人都重體面，婚姻能互相成就" },
  臨官: { gloss: "如出仕任官，自立而有實力", spouse: "配偶能幹自立，對你有實質幫助" },
  帝旺: { gloss: "如壯年鼎盛，力量最強", spouse: "雙方個性都強，相處要懂得各退一步" },
  衰: { gloss: "盛極轉衰，穩健保守", spouse: "感情平穩成熟，細水長流" },
  病: { gloss: "力量轉弱，心思細膩", spouse: "要多關心彼此的身心，別讓操心累積" },
  死: { gloss: "氣息沉靜，內斂少言", spouse: "感情內斂、不善表達，靜水流深" },
  墓: { gloss: "收藏入庫，含蓄守成", spouse: "感情含蓄而顧家，宜主動表達" },
  絕: { gloss: "舊氣已盡、新氣將生，轉折多", spouse: "感情容易有轉折或聚少離多，宜多溝通、珍惜緣分" },
  胎: { gloss: "受胎孕育，充滿可能", spouse: "感情需要時間慢慢成熟" },
  養: { gloss: "在母體中受養，平穩而得照顧", spouse: "感情需要細心培養，越經營越穩" },
};

// 日支（配偶宮）坐的十神：另一半的樣子。
const SPOUSE_BY_GOD = {
  比肩: "另一半像朋友、夥伴，兩人平起平坐，重視彼此尊重", 劫財: "另一半個性鮮明、有主見，金錢觀宜先溝通清楚",
  食神: "另一半溫和、懂生活，相處輕鬆愉快", 傷官: "另一半聰明有才、口才好，對感情的要求也高",
  正財: "另一半務實顧家、善於理財", 偏財: "另一半大方、人緣好，生活多采多姿",
  正官: "另一半端正、有責任感，重視規矩與名譽", 七殺: "另一半有魄力、能幹，個性較急，相處需要彼此讓步",
  正印: "另一半包容、會照顧人，像家人般溫暖", 偏印: "另一半有獨特的想法，也需要個人空間",
};

// 專有名詞第一次出現時的白話說明。
export const GLOSSARY = {
  日主: "出生日的天干，代表自己",
  月令: "出生月的地支",
  得令: "生在日主當旺的季節",
  失令: "不是日主當旺的季節",
  旺相休囚死: "五行在當月由強到弱的五個等級",
  通根: "地支藏有和日主同五行的天干，像樹有根",
  十神: "其他干支和日主的生剋關係",
  印星: "生扶日主的五行",
  比劫: "和日主同五行的干支",
  食傷: "日主所生的五行，代表才華與表達",
  財星: "日主所剋的五行，代表錢財",
  官殺: "剋日主的五行，代表規範與壓力",
  格局: "命局的整體架構，以月令為主",
  用神: "命局最需要的五行",
  喜神: "輔助用神的五行",
  忌神: "最不利命局的五行",
  仇神: "次要的不利五行",
  閒神: "影響不大的五行",
  調候: "依出生季節調節寒暖燥濕",
  從弱: "日主太弱時改為順從旺勢的特殊格局",
  專旺: "日主一氣獨旺、順其氣勢的特殊格局",
  從強: "印星與比劫成勢、印星更重，順其強勢的特殊格局",
  配偶宮: "日支，代表配偶與婚姻",
  配偶星: "男命看財星、女命看官殺",
  財庫: "財星五行的墓庫，主積蓄",
  星運: "日主在該地支的十二長生階段",
  神煞: "傳統的吉凶星",
  合絆: "被合住而不能發揮原本的作用",
  藏干: "地支裡藏著的天干",
  本氣: "地支的主要成分",
  中氣: "地支的次要成分",
  餘氣: "地支最微弱的成分",
};
// Occurrences that are a different word and must not take the gloss.
const GLOSS_SKIP = { 用神: (t, i) => t.slice(Math.max(0, i - 2), i) === "調候", 調候: (t, i) => t.slice(i + 2, i + 4) === "用神" };

export const ZODIAC_ANIMAL = { 子: "鼠", 丑: "牛", 寅: "虎", 卯: "兔", 辰: "龍", 巳: "蛇", 午: "馬", 未: "羊", 申: "猴", 酉: "雞", 戌: "狗", 亥: "豬" };

const SECTIONS = [
  ["summary", "命局總論"], ["elements", "五行與旺衰"], ["strength", "日主強弱"], ["pattern", "格局與用神"], ["character", "性格"],
  ["family", "六親"], ["career", "事業"], ["wealth", "財運"], ["marriage", "婚姻感情"], ["health", "健康"], ["advice", "開運建議"],
];
export const SECTION_IDS = SECTIONS.map(([id]) => id);
const TITLE = Object.fromEntries(SECTIONS);

export const DISCLAIMER = "本詳批依傳統子平八字的理論與本專案的推算規則寫成，是文化參考與自我觀察的工具，不是對人生的保證或預言。命理各派說法不一，健康、財務、法律與婚姻等重要決定，請以專業意見與自己的判斷為準。";


// ---------- 小工具 ----------
const STEM_EL = { 甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水" };
const EL_STEMS = { 木: ["甲", "乙"], 火: ["丙", "丁"], 土: ["戊", "己"], 金: ["庚", "辛"], 水: ["壬", "癸"] };
const EL_BRANCHES = { 木: ["寅", "卯"], 火: ["巳", "午"], 土: ["辰", "戌", "丑", "未"], 金: ["申", "酉"], 水: ["亥", "子"] };
const CONTROLLED_BY = { 土: "木", 水: "土", 火: "水", 金: "火", 木: "金" };
const SEASON_OF = { 木: "春季", 火: "夏季", 土: "辰戌丑未月", 金: "秋季", 水: "冬季" };
const GROUP_GODS = { 比劫: ["比肩", "劫財"], 食傷: ["食神", "傷官"], 財: ["正財", "偏財"], 官殺: ["正官", "七殺"], 印: ["正印", "偏印"] };
const GROUP_WORD = { 比劫: "比劫", 食傷: "食傷", 財: "財星", 官殺: "官殺", 印: "印星" };
const ROLE_ZH = { year: "年", month: "月", day: "日", hour: "時" };
const ORDER = ["year", "month", "day", "hour"];
const byPillar = (x, y) => ORDER.indexOf(x.role) - ORDER.indexOf(y.role);
const COUNT = ["", "一", "兩", "三", "四", "五", "六", "七", "八"];
const SIX_COMBINE = { 子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯", 辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午" };
const TRIADS = ["申子辰", "亥卯未", "寅午戌", "巳酉丑"];
const SIDE = { 木: "東方", 火: "南方", 金: "西方", 水: "北方" };
// 財庫: the 墓 of the wealth element (土 follows 火, as the 十二長生 of tyme4ts does).
const TOMB = { 木: "未", 火: "戌", 土: "戌", 金: "丑", 水: "辰" };
const SEASON_WORD = { 寅: "屬春", 卯: "屬春", 辰: "是季春，土旺用事", 巳: "屬夏", 午: "屬夏", 未: "是季夏，土旺用事", 申: "屬秋", 酉: "屬秋", 戌: "是季秋，土旺用事", 亥: "屬冬", 子: "屬冬", 丑: "是季冬，土旺用事" };
const STATE_NOTE = { 旺: "，最有力量", 相: "，受月令生扶", 休: "，力量退守", 囚: "，受到牽制", 死: "，最受壓抑" };
// A share of the weighted element scores at or above this is called heavy (偏重): about the top 30 % of charts' strongest
// element (the median strongest element holds 0.375; an average element 0.2).
const HEAVY = 0.42;

// The reading's language (core/tr.js). Every sentence is a Chinese template through tr() and every word shown through
// trw(); what is left here is how pieces are put side by side, which differs only in punctuation and spaces.
const en = () => readingLang() === "en";
const EN_SEP = { "、": ", ", "，": ", ", "；": "; ", "・": " · ", "": " ", " ": ", " };
const join = (list, zhSep = "、") => list.join(en() ? EN_SEP[zhSep] : zhSep);
const J = (list, zhSep = "、") => join(list.map(trw), zhSep);   // Chinese words, shown
// Phrases from the tables above are read as sentences (tr), so a phrase never takes the English of a word spelt the
// same (金 the colour, not the element; 太陽 the image, not the spirit). Trades and careers are words (trw).
const JP = (list, zhSep = "、") => join(list.map(t => tr(t)), zhSep);
// A few trades and classical phrases are spelt like a line of the story or the year reading, which has its own English
// (創業 "Start a business", 傷官見官 as a clause). In English these are looked up under a key of their own.
const OWN_KEY = { 創業: "創業（行業）", 財務: "財務（行業）", 銀行: "銀行（行業）", 投資: "投資（行業）", 顧問: "顧問（行業）", 傷官見官: "傷官見官（格局）", 財星壞印: "財星壞印（格局）" };
const own = t => trw(en() && OWN_KEY[t] ? OWN_KEY[t] : t);
const JW = (list, zhSep = "、") => join(list.map(own), zhSep);
const para = (...parts) => join(parts.filter(Boolean), "");      // sentences one after another
const stop = t => `${t}${en() ? "." : "。"}`;
// A sentence that starts with a piece of another sentence starts with a capital in English.
const cap = t => (en() ? String(t).replace(/^(\W*)(\w)/, (all, lead, c) => lead + c.toUpperCase()) : t);
const bracket = t => (en() ? ` (${t})` : `（${t}）`);
const paren = (a, b) => `${a}${bracket(b)}`;
const se = stem => trw(`${stem}${STEM_EL[stem]}`);               // 甲木, Yang Wood (Jia)
const be = (branch, el) => trw(`${branch}${el}`);                // 子水, Zi (Water)
// A structure's name: the ten ordinary ones as sentences (their reading English), the special ones as BaZi words.
const patName = p => (PATTERN_TEXT[p] ? tr(p) : trw(p));
const role1 = r => tr(ROLE_ZH[r]);                                 // 年, Year

const uniq = list => [...new Set(list)];
const listWords = items => (items.length <= 1 ? items.join("") : tr("{a}和{b}", { a: join(items.slice(0, -1), "、"), b: items[items.length - 1] }));
// A與B（與C）: what the Chinese joins with 與.
const andJoin = list => (list.length ? list.reduce((a, b) => tr("{a}與{b}", { a, b })) : "");
const pct = x => `${Math.round(x * 100)}%`;
const ymd = s => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  if (en()) return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return `${y} 年 ${m} 月 ${d} 日`;
};
const hm = s => s.slice(11, 16);
const nayinOf = name => zh(SixtyCycle.fromName(name).getSound().getName());
const section = (id, paragraphs, items = []) => ({ id, title: tr(TITLE[id]), paragraphs: paragraphs.filter(Boolean), items: items.map(it => ({ ...it, label: cap(it.label) })) });

// 年干, 月支, 時柱 and 「年、時兩干」
const ONE = { 干: "{role}干", 支: "{role}支", 柱: "{role}柱" };
const MANY = { 干: "{roles}干", 支: "{roles}支", 柱: "{roles}柱" };
function rolesWord(roles, part) {
  const u = uniq(roles).sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
  if (u.length === 1) return tr(ONE[part], { role: role1(u[0]) });
  return tr(MANY[part], { roles: en() ? listWords(u.map(role1)) : `${u.map(r => ROLE_ZH[r]).join("、")}${COUNT[u.length]}` });
}
// 年支辰 (a branch in its pillar)
const rb = (role, branch) => tr("{role}支{b}", { role: role1(role), b: trw(branch) });
// [{ role, stem }] → 「年、時兩干的戊土、月干甲木」
function stemsWords(list, withEl = true) {
  const by = new Map();
  for (const x of list) by.set(x.stem, [...(by.get(x.stem) || []), x.role]);
  const parts = [...by].map(([stem, roles]) => {
    const s = withEl ? se(stem) : trw(stem);
    return roles.length === 1 ? tr("{role}干{s}", { role: role1(roles[0]), s }) : tr("{where}的{s}", { where: rolesWord(roles, "干"), s });
  });
  return en() ? listWords(parts) : parts.join("、");
}
// [{ role, name }] (branches) → 「年支辰」 or 「辰、丑兩支」
function branchesWords(list) {
  return list.length === 1 ? rb(list[0].role, list[0].name)
    : tr("{names}支", { names: en() ? listWords(list.map(x => trw(x.name))) : `${list.map(x => x.name).join("、")}${COUNT[list.length]}` });
}
// Hidden stems [{ role, branch, type }] → 「時支子的本氣與辰、丑之中」
function hiddenBrief(hid) {
  const main = hid.filter(h => h.type === "本氣"), rest = hid.filter(h => h.type !== "本氣");
  const parts = [];
  if (main.length) parts.push(tr("{list}的本氣", { list: listWords(uniq(main.map(h => rb(h.role, h.branch)))) }));
  if (rest.length) parts.push(tr("{list}之中", { list: J(uniq(rest.map(h => h.branch))) }));
  return andJoin(parts);
}

// The last pass: each glossary term gets its plain-words gloss at its first use in reading order (paragraphs, then
// items, section by section). Uses inside 「」 or （） are skipped so glosses never nest. In English the term is found
// by its English word and the gloss keeps the Chinese term in front: Day Master (日主, the stem of your birth day…).
function glossAll(sections) {
  if (en()) return glossEnglish(sections);
  const keys = Object.keys(GLOSSARY).sort((x, y) => y.length - x.length), seen = new Set();
  const enclosed = (t, i) => {
    const before = t.slice(0, i), n = re => (before.match(re) || []).length;
    return n(/（/g) > n(/）/g) || n(/「/g) > n(/」/g);
  };
  const apply = text => {
    const hits = [];
    for (const k of keys) {
      if (seen.has(k)) continue;
      for (let i = text.indexOf(k); i >= 0; i = text.indexOf(k, i + 1)) {
        if (text[i + k.length] === "（" || enclosed(text, i) || (GLOSS_SKIP[k] && GLOSS_SKIP[k](text, i))) continue;
        if (hits.some(h => i < h.i + h.k.length && h.i < i + k.length)) continue;
        hits.push({ k, i });
        break;
      }
    }
    let out = text;
    for (const h of hits.sort((x, y) => y.i - x.i)) {
      out = `${out.slice(0, h.i + h.k.length)}（${GLOSSARY[h.k]}）${out.slice(h.i + h.k.length)}`;
      seen.add(h.k);
    }
    return out;
  };
  for (const s of sections) {
    s.paragraphs = s.paragraphs.map(apply);
    s.items = s.items.map(it => ({ ...it, text: apply(it.text) }));
  }
  return sections;
}
function glossEnglish(sections) {
  const escape = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const terms = Object.keys(GLOSSARY).map(k => ({ k, word: String(trw(k)).replace(/^(?:the|an?) /i, "") }))
    .filter(t => !hasCJK(t.word)).sort((x, y) => y.word.length - x.word.length);
  const seen = new Set();
  const enclosed = (t, i) => { const before = t.slice(0, i); return (before.match(/\(/g) || []).length > (before.match(/\)/g) || []).length; };
  const apply = text => {
    const hits = [];
    for (const t of terms) {
      if (seen.has(t.k)) continue;
      const re = new RegExp(`\\b${escape(t.word)}\\b`, "gi");
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const i = m.index, end = i + m[0].length;
        if (text.slice(end, end + 2) === " (" || enclosed(text, i)) continue;
        if (hits.some(h => i < h.end && h.i < end)) continue;
        hits.push({ k: t.k, i, end });
        break;
      }
    }
    let out = text;
    for (const h of hits.sort((x, y) => y.i - x.i)) {
      out = `${out.slice(0, h.end)} (${h.k}, ${tr(GLOSSARY[h.k])})${out.slice(h.end)}`;
      seen.add(h.k);
    }
    return out;
  };
  for (const s of sections) {
    s.paragraphs = s.paragraphs.map(apply);
    s.items = s.items.map(it => ({ ...it, text: apply(it.text) }));
  }
  return sections;
}

// ---------- 命盤的脈絡 ----------
function context(chart, analysis, name) {
  const a = analysis, pillars = chart.pillars;
  const P = Object.fromEntries(pillars.map(p => [p.role, p]));
  const names = pillars.map(p => p.name);
  const dm = P.day.stem.name, de = P.day.stem.element, mb = P.month.branch.name;
  const total = ELEMENTS.reduce((s, e) => s + (a.scores[e] || 0), 0) || 1;
  const share = Object.fromEntries(ELEMENTS.map(e => [e, (a.scores[e] || 0) / total]));
  const ge = Object.fromEntries(GROUPS.map(g => [g, elementOf(de, g)]));
  const eg = Object.fromEntries(ELEMENTS.map(e => [e, groupOf(de, e)]));
  // Every ten god with where it shows (a stem) or hides (inside a branch).
  const gods = {};
  const at = g => (gods[g] ||= { visible: [], hidden: [] });
  for (const p of pillars) {
    if (p.role !== "day") at(p.stem.god).visible.push({ role: p.role, stem: p.stem.name, god: p.stem.god });
    for (const h of p.branch.hidden) at(h.god).hidden.push({ role: p.role, branch: p.branch.name, stem: h.name, type: h.type, god: h.god });
  }
  return {
    chart, a, P, pillars, names, dm, de, mb, name: typeof name === "string" && name.trim() ? name.trim() : null,
    male: chart.input.sex !== "female", hourKnown: !!P.hour, share, ge, eg, gods,
    stars: natalStars(chart), relations: natalRelations(names), states: seasonalStates(mb), factors: strengthFactors(names),
    counts: tenGodCounts(names), roles: elementRoles(a),
  };
}

const visibleOf = (c, group) => GROUP_GODS[group].flatMap(g => (c.gods[g] ? c.gods[g].visible : [])).sort(byPillar);
const hiddenOf = (c, group, types = ["本氣", "中氣", "餘氣"]) => GROUP_GODS[group].flatMap(g => (c.gods[g] ? c.gods[g].hidden.filter(h => types.includes(h.type)) : [])).sort(byPillar);
const visGod = (c, god) => !!(c.gods[god] && c.gods[god].visible.length);
const hasGod = (c, god) => !!(c.gods[god] && (c.gods[god].visible.length || c.gods[god].hidden.length));
const elementInState = (c, state) => ELEMENTS.find(e => c.states[e] === state);
const isStrong = c => c.a.strength === "身強" || c.a.strength === "專旺";
// 從強 is a 專旺 verdict whose 印 outweighs 比劫 (analysis.js): it is named and worded as 從強, and it fears 財.
const congqiang = a => !!(a.special && a.special.kind === "從強");
const strengthLabel = a => (congqiang(a) ? "從強" : a.strength);
const isWeak = c => c.a.strength === "身弱" || c.a.strength === "從弱";
// 扶抑 leans strong when it dislikes the day master's own element (身強, or 中和 on the strong side).
const leansStrong = c => (c.a.schools.扶抑.element[c.de] || 0) < 0;
// Stems and hidden stems of one element (the day stem itself left out).
function presence(c, e) {
  return {
    vis: c.pillars.filter(p => p.role !== "day" && p.stem.element === e).map(p => ({ role: p.role, stem: p.stem.name })),
    hid: c.pillars.flatMap(p => p.branch.hidden.filter(h => h.element === e).map(h => ({ role: p.role, branch: p.branch.name, stem: h.name, type: h.type }))),
  };
}
// The mean favour of a pillar's stem and branch element (the day pillar: its branch only).
function pillarFavor(c, p) {
  const f = e => c.a.favor[e] || 0;
  return p.role === "day" ? f(p.branch.element) : (f(p.stem.element) + f(p.branch.element)) / 2;
}
const favorWord = v => (v >= 0.25 ? "喜" : v <= -0.25 ? "忌" : "平");
const roleIsGood = role => role === "用神" || role === "喜神";
const roleIsBad = role => role === "忌神" || role === "仇神";
const strongSource = c => (c.share[c.ge.印] >= c.share[c.de] ? "印" : "比劫");
const drainGroup = c => ["食傷", "財", "官殺"].sort((x, y) => c.share[c.ge[y]] - c.share[c.ge[x]])[0];
const DRAIN_WORD = { 食傷: "洩氣", 財: "耗身", 官殺: "剋身" };
const monthClashed = c => c.relations.some(r => r.kind === "六沖" && r.roles.includes("month"));
// The branches a flowing year would need to bring a star, through detail.js (so the star tables stay in one place).
function branchesWithStar(c, star) {
  return BRANCHES.split("").filter(b => luckStars(c.chart, `${BRANCHES.indexOf(b) % 2 ? "乙" : "甲"}${b}`).includes(star));
}

// ---------- 基本資料 ----------
// The birthplace for a reader: its own English, else its county's (臺中市西屯 → Taichung).
function placeWord(name) {
  const w = trw(name);
  if (!en() || !hasCJK(w)) return w;
  const county = (name.match(/^..[縣市]/) || [])[0];
  return county ? trw(county) : w;
}
// 農曆 in English, from the entered date (as chart.lunar is).
function lunarText(c, lunar) {
  if (!en()) return lunar;
  const { y, m, d } = c.chart.input.date, day = SolarDay.fromYmd(y, m, d).getLunarDay(), month = day.getLunarMonth();
  const vars = { year: pillarWord(month.getLunarYear().getSixtyCycle().getName()), month: month.getMonth(), day: day.getDay() };
  return month.isLeap() ? tr("農曆{year}年閏{month}月{day}日", vars) : tr("農曆{year}年{month}月{day}日", vars);
}
function basics(c) {
  const { chart, P } = c, out = [];
  if (c.name) out.push({ label: tr("姓名"), value: trw(c.name) });
  out.push({ label: tr("性別"), value: tr(c.male ? "乾造（男）" : "坤造（女）") });
  const place = placeWord(chart.input.place.name || "自訂地點");
  const shichen = chart.time.shichen;
  const time = c.hourKnown ? (shichen ? tr(" {b}時", { b: trw(shichen) }) : ` ${hm(chart.time.entered)}`) : tr("，時辰不詳");
  out.push({ label: tr("國曆"), value: tr("{date}{time}（{place}）", { date: ymd(chart.time.entered), time, place }) });
  const mode = chart.input.options.solar;
  if (c.hourKnown && mode !== "clock" && !shichen) {
    const vs = Math.round(Math.abs(chart.time.vsEntered)), sign = chart.time.vsEntered < 0 ? "−" : "+";
    const fix = vs ? tr("校正 {sign}{vs} 分鐘", { sign, vs }) : tr("與鐘錶時間相同");
    out.push({ label: tr(mode === "mean" ? "平太陽時" : "真太陽時"), value: tr("{date} {time}（鐘錶 {clock}，{fix}）", { date: ymd(chart.time.solarClock), time: hm(chart.time.solarClock), clock: hm(chart.time.entered), fix }) });
  }
  const lunar = chart.lunar.replace(/^農曆/, "");
  let lunarValue = lunarText(c, lunar);
  if (c.hourKnown) {
    lunarValue += tr(" {b}時", { b: trw(P.hour.branch.name) });
    const solarDate = chart.time.solarClock.slice(0, 10), civil = chart.time.entered.slice(0, 10);
    // After 23:00 true solar time, on the entered day or (summer time, far west) on the evening before it.
    const night = Number(chart.time.solarClock.slice(11, 13)) >= 23, before = solarDate < civil;
    // The other 子時 school's day pillar, when it differs (chart.variants; a lean chart has none).
    const other = (chart.variants || []).find(v => v.options && v.options.zi && v.changed.includes("day"));
    const late = chart.input.options.zi === "late";
    const alt = { day: other ? pillarWord(other.pillars.day) : "" };
    const ifNew = other ? tr("；若 23 點換日，日柱是{day}", alt) : "", ifLate = other ? tr("；若採夜子時，日柱是{day}", alt) : "";
    if (night && before) lunarValue += late
      ? tr("（採夜子時：真太陽時是前一天 23 點後，日柱算前一天，農曆仍依填寫的日期{other}）", { other: ifNew })
      : tr("（真太陽時是前一天 23 點後，23 點已換日，日柱就是填寫的這一天{other}）", { other: ifLate });
    else if (night) lunarValue += late
      ? tr("（採夜子時：23 點後出生，日柱仍算當天{other}）", { other: ifNew })
      : tr("（23 點後出生，日柱已換到次日{other}）", { other: ifLate });
    else if (before) lunarValue += tr("（真太陽時還在前一天晚上，日柱以前一天論，農曆仍依填寫的日期）");
    else if (solarDate > civil) lunarValue += tr("（真太陽時已過午夜，日柱以次日論）");
  }
  out.push({ label: tr("農曆"), value: lunarValue });
  const lunarYear = (/^(..)年/.exec(lunar) || [])[1];
  const lichun = lunarYear && lunarYear !== P.year.name ? tr("；農曆仍是{year}年，但八字已過立春", { year: pillarWord(lunarYear) }) : "";
  out.push({ label: tr("生肖"), value: tr("{animal}（以立春換年，年柱{pillar}{note}）", { animal: trw(chart.zodiac), pillar: pillarWord(P.year.name), note: lichun }) });
  // 出生在節氣後幾天
  const birth = Date.parse(`${chart.time.entered.replace(" ", "T")}:00Z`);
  const prev = Date.parse(`${chart.terms.prev.time.replace(" ", "T")}:00Z`);
  const gap = Math.max(0, birth - prev), days = Math.floor(gap / 86400000), hours = Math.floor((gap % 86400000) / 3600000);
  const after = days ? (hours ? tr("{d} 天 {h} 小時", { d: days, h: hours }) : tr("{d} 天", { d: days })) : tr("{h} 小時", { h: hours });
  const t = chart.terms;
  const termVars = { term: trw(t.prev.name), after, date: ymd(t.prev.time), time: hm(t.prev.time), next: trw(t.next.name), ndate: ymd(t.next.time), ntime: hm(t.next.time) };
  out.push({ label: tr("節氣"), value: c.hourKnown ? tr("{term}後 {after}（{term}：{date} {time}；下一個節是{next}，{ndate} {ntime}）", termVars)
    : tr("約{term}後 {after}（{term}：{date} {time}；下一個節是{next}，{ndate} {ntime}）", termVars) });
  const commander = commanderOf(c);
  if (commander) out.push({ label: tr("人元司令"), value: tr("{stem}用事", { stem: se(commander) }), note: tr("出生時月令裡當值的藏干") });
  const s = chart.luck.start;
  const span = join([s.years && tr("{y} 年", { y: s.years }), s.months && tr("{m} 個月", { m: s.months }), s.days && tr("{d} 天", { d: s.days })].filter(Boolean), " ");
  const [ty, tm, td] = s.date.split("-").map(Number);
  const turn = SolarTime.fromYmdHms(ty, tm, td, 12, 0, 0).getLunarHour().getSixtyCycleHour().getYear().getHeavenStem().getName();
  const luckVars = { span, date: ymd(s.date), age: s.age, dir: tr(chart.luck.forward ? "順行" : "逆行"), turn: trw(turn), tail: c.hourKnown ? "" : tr("；時辰不詳，以中午估算") };
  out.push({ label: tr("起運"), value: span ? tr("出生後 {span}起運（{date}交運，虛歲 {age} 歲），大運{dir}，此後每十年換一步運（逢{turn}年交運）{tail}", luckVars)
    : tr("出生後不久起運（{date}交運，虛歲 {age} 歲），大運{dir}，此後每十年換一步運（逢{turn}年交運）{tail}", luckVars) });
  const x = chart.extras;
  const sign = n => paren(pillarWord(n), trw(nayinOf(n)));
  if (x.ownSign) out.push({ label: tr("命宮"), value: sign(x.ownSign), note: tr("先天的人生基調") });
  if (x.bodySign) out.push({ label: tr("身宮"), value: sign(x.bodySign), note: tr("後天努力的方向") });
  // 胎元 needs only the month pillar: the next stem and the third branch after.
  const fetal = x.fetalOrigin || `${STEMS[(STEMS.indexOf(P.month.stem.name) + 1) % 10]}${BRANCHES[(BRANCHES.indexOf(P.month.branch.name) + 3) % 12]}`;
  out.push({ label: tr("胎元"), value: sign(fetal), note: tr("受胎的月份，看先天的稟賦") });
  if (x.fetalBreath) out.push({ label: tr("胎息"), value: sign(x.fetalBreath), note: tr("日柱的暗合，看內在的氣質") });
  const a = c.a;
  const pattern = a.special ? tr("{name}（月令{pattern}）", { name: patName(a.special.name), pattern: patName(a.pattern) }) : patName(a.pattern);
  out.push({ label: tr("命局"), value: join([tr("{stem}日主", { stem: se(c.dm) }), trw(a.strength), pattern, ...(a.useful.length ? [tr("用神{e}", { e: trw(a.useful[0]) })] : [])], "・") });
  const counts = join(ELEMENTS.map(e => `${trw(e)} ${chart.elements[e]}`), "、");
  out.push({ label: tr("五行"), value: `${counts}${chart.missing.length ? tr("（缺{els}）", { els: J(chart.missing) }) : tr("（五行俱全）")}` });
  return out.map(b => ({ ...b, label: cap(b.label) }));
}

// 人元司令: the hidden stem in charge on the birth day (tyme4ts 人元司令分野). On a 節 day before the 節 moment the
// month pillar is still the old one, so the day before is used; nothing is shown if they still disagree.
function commanderOf(c) {
  const { y, m, d } = c.chart.input.date, own = c.P.month.branch.hidden.map(h => h.name);
  for (const back of [0, 1]) {
    const stem = SolarDay.fromYmd(y, m, d).next(-back).getHideHeavenStemDay().getHideHeavenStem().getHeavenStem().getName();
    if (own.includes(stem)) return stem;
  }
  return null;
}

// The chart's birth-time caveats (core/chart.js and core/time.js write them in Chinese): in English each is matched
// against the sentence it was made from and written again from what it holds.
const NOTE_TEMPLATES = [
  "這個時間在當地出現了兩次（日光節約時間結束時，時鐘撥回一小時）。目前用第 {n} 次，可以切換。",
  "這個時間在當地不存在（日光節約時間開始時，時鐘直接跳過 {n} 分鐘），已當成標準時間計算。",
  "當時這裡還沒有標準時間，用的是地方平時（UTC{offset}）。",
  "當時實施日光節約時間，時鐘比標準時間快 {n} 分鐘，已自動扣除。",
  "當時的標準時間是 UTC{offset}，和現在的 UTC{now} 不同，已自動換算。",
  "依你選的{b}時排日柱和時柱，不再做真太陽時校正；起運以這個時辰的中間估算。",
  "時辰不詳：只排年、月、日三柱，起運以中午 12 點估算。",
  "這一天 {time} 交「{term}」：在那之前出生，月柱是 {m0}{y0}；之後是 {m1}{y1}。",
  "如果家裡記下的已經是扣掉夏令時間的標準時間，{what}：{changes}。",
];
const unfill = (template, text) => {
  const names = [];
  const re = template.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, (all, k) => { names.push(k); return "(.*?)"; });
  const m = new RegExp(`^${re}$`, "s").exec(text);
  return m ? Object.fromEntries(names.map((k, i) => [k, m[i + 1]])) : null;
};
function noteText(c, text) {
  if (!en()) return text;
  for (const t of NOTE_TEMPLATES) {
    const v = unfill(t, text);
    if (!v) continue;
    if (v.b) v.b = trw(v.b);
    if (v.term !== undefined) {
      v.term = trw(v.term); v.m0 = pillarWord(v.m0); v.m1 = pillarWord(v.m1);
      v.y0 = v.y0 ? tr("、年柱是 {p}", { p: pillarWord(v.y0.replace(/^、年柱是 /, "")) }) : "";
      v.y1 = v.y1 ? tr("、{p}年柱", { p: pillarWord(v.y1.replace(/^、/, "")) }) : "";
    }
    if (v.what !== undefined) {
      const again = unfill("請改選第 {n} 次出現的時間", v.what), fill2 = /^請改填 (.*?)(?:，並選第 (\d+) 次出現的時間)?$/.exec(v.what);
      if (again) v.what = tr("請改選第 {n} 次出現的時間", again);
      else if (fill2) {
        const full = /^(\d+) 年 (\d+) 月 (\d+) 日 (.*)$/.exec(fill2[1]), short = /^(\d+) 月 (\d+) 日 (.*)$/.exec(fill2[1]);
        const when = full ? `${ymd(`${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`)} ${full[4]}`
          : short ? tr("{m} 月 {d} 日 {time}", { m: short[1], d: short[2], time: short[3] }) : fill2[1];
        v.what = tr("請改填 {when}{occ}", { when, occ: fill2[2] ? tr("，並選第 {n} 次出現的時間", { n: fill2[2] }) : "" });
      }
      v.changes = v.changes === "四柱都不會變" ? tr("四柱都不會變") : join(v.changes.split("、").map(ch => {
        const x = /^(.柱)(..)會變成(..)$/.exec(ch);
        return x ? tr("{pillar}{now}會變成{then}", { pillar: trw(x[1]), now: pillarWord(x[2]), then: pillarWord(x[3]) }) : ch;
      }), "、");
    }
    return tr(t, v);
  }
  return text;
}

// ---------- 排盤表 ----------
function table(c) {
  const ps = c.pillars;
  return {
    columns: ps.map(p => trw(p.label)),
    rows: [
      { label: tr("主星"), cells: ps.map(p => (p.role === "day" ? tr(c.male ? "元男" : "元女") : trw(p.stem.god))) },
      { label: tr("天干"), cells: ps.map(p => trw(p.stem.name)), elements: ps.map(p => p.stem.element) },
      { label: tr("地支"), cells: ps.map(p => trw(p.branch.name)), elements: ps.map(p => p.branch.element) },
      { label: tr("藏干"), cells: ps.map(p => p.branch.hidden.map(h => se(h.name))) },
      { label: tr("副星"), cells: ps.map(p => p.branch.hidden.map(h => trw(h.god))) },
      { label: tr("星運"), cells: ps.map(p => trw(p.terrain)) },
      { label: tr("自坐"), cells: ps.map(p => trw(p.seat)) },
      { label: tr("空亡"), cells: ps.map(p => J([...p.void], "")) },
      { label: tr("納音"), cells: ps.map(p => trw(p.nayin)) },
      { label: tr("神煞"), cells: ps.map(p => (c.stars[p.role] || []).map(trw)) },
    ],
  };
}

// ---------- 1 命局總論 ----------
// The classical images of a strong day master's outlet (食傷) and its control (官殺).
const OUTPUT_IMAGE = { 木: "取其木火通明、洩秀之功", 火: "取其洩秀之功", 土: "取其土金毓秀之功", 金: "取其金白水清、洩秀之功", 水: "取其水木清華、洩秀之功" };
const CONTROL_IMAGE = { 木: "取其修剪成材", 火: "取其水火既濟", 土: "取其疏土", 金: "取其煅煉成器", 水: "取其築堤束水" };
// The function of an element the chart wants, in a few words.
function useFunction(c, e) {
  const g = c.eg[e], s = c.a.strength, v = c.a.views[e] || { likes: [] };
  if (s === "從弱") return tr("順從旺勢");
  if (s === "專旺") return tr(congqiang(c.a) ? "順其強勢" : "順其旺氣");
  if (v.likes.includes("扶抑")) {
    if (g === "印") return tr("取其生身");
    if (g === "比劫") return tr("取其幫身");
    if (g === "食傷") return tr(c.a.pattern === "七殺格" ? "取其制殺" : OUTPUT_IMAGE[c.de]);
    if (g === "財") return tr(c.share[c.ge.印] >= 0.3 ? "取其制印" : "取其耗身生財");
    if (g === "官殺") return tr(CONTROL_IMAGE[c.de]);
  }
  if (v.likes.includes("格局")) return tr("合{pattern}所喜的{what}", { pattern: patName(c.a.pattern), what: (PATTERN_LIKES[c.a.pattern] || {})[g] ? own(PATTERN_LIKES[c.a.pattern][g]) : trw(GROUP_WORD[g]) });
  if (v.likes.includes("調候")) return tr("取其調候");
  return tr("取{g}之用", { g: trw(GROUP_WORD[g]) });
}

// The classical line for a group that is far too heavy, when it fits this chart.
function excessLine(c) {
  const g = GROUPS.slice().sort((x, y) => c.share[c.ge[y]] - c.share[c.ge[x]])[0], e = c.ge[g];
  if (c.share[e] < HEAVY) return null;
  // A 從格 likes the very element that is heavy, and 專旺／從強 like 印: the warning would contradict its 用神.
  if (c.a.strength === "從弱" || (c.a.special && g === "印")) return null;
  const line = EXCESS[g][c.de];
  if (g === "印") return { group: g, element: e, line };
  if ((g === "食傷" || g === "財") && !isStrong(c)) return { group: g, element: e, line };
  if (g === "官殺" && isWeak(c)) return { group: g, element: e, line };
  if (g === "比劫" && isStrong(c) && c.a.useful.includes(c.ge.食傷)) return { group: g, element: e, line };
  return null;
}

function rootPhrase(c) {
  const r = c.factors.roots;
  if (!r.length) return tr("地支不見{de}，日主無根", { de: trw(c.de) });
  const main = r.filter(x => x.strength === "本氣");
  if (main.length) return tr("在{where}有本氣之根", { where: listWords(main.map(x => rb(x.role, x.branch))) });
  if (r.length === 1) return tr("只在{where}中有一點{kind}之根", { where: rb(r[0].role, r[0].branch), kind: trw(r[0].strength) });
  const kinds = uniq(r.map(x => x.strength));
  return kinds.length === 1 ? tr("在{where}中有{kind}之根", { where: listWords(r.map(x => rb(x.role, x.branch))), kind: trw(kinds[0]) })
    : tr("在{list}中有根，根氣不深", { list: join(r.map(x => paren(rb(x.role, x.branch), trw(x.strength))), "、") });
}
function helpPhrase(c) {
  const f = c.factors;
  const stems = f.born.filter(x => x.part === "stem").map(x => ({ role: x.role, stem: x.name }));
  const branches = f.born.filter(x => x.part === "branch").map(x => ({ role: x.role, name: x.name }));
  const born = andJoin([stems.length ? stemsWords(stems) : "", branches.length ? branchesWords(branches) : ""].filter(Boolean));
  const parts = [];
  if (born) parts.push(tr("{born}生身", { born }));
  if (f.helped.length) parts.push(tr("{who}幫身", { who: stemsWords(f.helped.map(x => ({ role: x.role, stem: x.name }))) }));
  return join(parts, "，");
}
function strengthSentence(c) {
  const f = c.factors, s = c.a.strength, root = rootPhrase(c), help = helpPhrase(c);
  const g = drainGroup(c), drain = tr("{g}（{e}）{how}較重", { g: trw(GROUP_WORD[g]), e: trw(c.ge[g]), how: trw(DRAIN_WORD[g]) });
  if (s === "身強" || s === "專旺") {
    const deep = f.ling || f.roots.some(r => r.strength === "本氣");
    const verdict = s !== "專旺" ? trw("身強") : tr(c.a.special && c.a.special.kind === "從強" ? "印比成勢，近於從強" : "日主極旺，近於專旺");
    return tr("{root}，{help}，綜合下來{verdict}，強在{source}。", { root, help: help ? tr(deep ? "又有{help}" : "但{help}", { help }) : tr("又得月令之氣"), verdict, source: trw(strongSource(c) === "印" ? "印星" : "比劫") });
  }
  if (s === "身弱") return tr("{root}{help}，但{drain}，綜合下來身弱。", { root, help: help ? tr("，雖有{help}", { help }) : "", drain });
  if (s === "從弱") return tr("{root}，{help}{drain}，日主極弱而有從象，屬於從弱。", { root, help: help ? tr("只有{help}，", { help }) : tr("生扶極少，"), drain });
  if (s === "中和") return help ? tr("{root}，{help}，生扶與剋洩的力量大致相當，強弱屬於中和。", { root, help }) : tr("{root}，生扶與剋洩的力量大致相當，強弱屬於中和。", { root });
  return help ? tr("{root}，{help}，綜合下來判為{s}。", { root, help, s: trw(s) }) : tr("{root}，綜合下來判為{s}。", { root, s: trw(s) });
}

function summary(c) {
  const { a, dm, de, mb } = c;
  const wang = elementInState(c, "旺"), st = c.states[de];
  const chartName = tr(c.male ? "乾造{pillars}{tail}" : "坤造{pillars}{tail}", { pillars: join(c.names.map(pillarWord), "、"), tail: c.hourKnown ? "" : tr("（時辰不詳，以三柱論）") });
  const v1 = {
    name: c.name ? trw(c.name) : "", chart: chartName, stem: se(dm), image: trw(DAY_MASTER_TEXT[dm].image), branch: trw(mb), wang: trw(wang),
    state: st === "旺" ? tr("{de}當令而旺", { de: trw(de) }) : tr("{de}處於「{st}」", { de: trw(de), st: trw(st) }), ling: trw(c.factors.ling ? "得令" : "失令"),
  };
  const s1 = c.name ? tr("{name}的命盤為{chart}，日主{stem}如{image}，生於{branch}月{wang}旺之時，{state}，{ling}。", v1)
    : tr("{chart}，日主{stem}如{image}，生於{branch}月{wang}旺之時，{state}，{ling}。", v1);
  const s2 = strengthSentence(c);
  const main = c.P.month.branch.hidden[0];
  const shown = c.pillars.filter(p => p.role !== "day" && p.stem.name === main.name).map(p => p.role);
  const s3 = tr("月令{mb}的本氣{main}是{god}，{show}，{pattern}。", {
    mb: trw(mb), main: se(main.name), god: trw(main.god), show: shown.length ? tr("透出{where}", { where: rolesWord(shown, "干") }) : tr("藏而不透"),
    pattern: a.special ? tr("月令取{pattern}，但全局改以{name}論", { pattern: patName(a.pattern), name: patName(a.special.name) }) : tr("取{pattern}", { pattern: patName(a.pattern) }),
  });
  const ex = excessLine(c);
  const lead = ex ? tr("全局{e}重，正應了古訣「{line}」；", { e: trw(ex.element), line: trw(ex.line) }) : "";
  const u = a.useful;
  const s4 = u.length
    ? tr("{lead}以{u}為用神，{fn}{xi}{ji}。", { lead, u: trw(u[0]), fn: useFunction(c, u[0]), xi: u.length > 1 ? tr("，{els}為喜", { els: J(u.slice(1)) }) : "", ji: a.avoid.length ? tr("，忌{els}", { els: J(a.avoid) }) : "" })
    : tr("{lead}各派喜忌互相抵消，五行沒有特別突出的用神，取用以維持平衡為主。", { lead });
  return section("summary", [para(s1, s2, s3, s4)]);
}

// ---------- 2 五行與旺衰 ----------
const PALACE_BRANCH = { year: "祖上與童年", month: "父母兄弟與成長環境", day: "配偶宮", hour: "子女與晚年" };
const PALACE_STEM = { year: "祖上長輩", month: "父母", day: "自己", hour: "子女" };
const REL_MEANING = {
  天干五合: () => tr("天干相合，主有情、互相牽絆"),
  天干相沖: () => tr("天干相沖，想法與做法容易互相拉扯"),
  六合: () => tr("地支六合，主和合、有助力，也有牽絆不易分開之意"),
  六沖: () => tr("地支相沖，主變動與對立，所牽動的人事容易聚少離多或起伏較大"),
  相刑: () => tr("地支相刑，主摩擦與壓力，相處上要多些包容"),
  自刑: () => tr("同一地支自刑，主自己和自己拉扯、容易想太多"),
  六害: () => tr("地支相害，主暗中的耗損與誤會，凡事宜把話說清楚"),
  相破: () => tr("地支相破，主小破損或計畫被打斷，影響通常不大"),
  半合: r => tr("半合{e}局，{e}的力量被帶起來", { e: trw(r.element) }),
  拱合: r => tr("拱合{e}局（缺中間的旺支），暗中有{e}的氣勢", { e: trw(r.element) }),
  三合: r => tr("三合成{e}局，{e}的力量大增", { e: trw(r.element) }),
  三會: r => tr("三會{side}{e}，{e}的氣勢極強", { side: trw(SIDE[r.element]), e: trw(r.element) }),
  三刑: () => tr("三刑俱全，傳統上主壓力與是非較多，行事宜守法、謹慎"),
};
const ROLE_NOTE = { 用神: "屬於有助力的力量", 喜神: "屬於有助力的力量", 忌神: "這股力量要多留意", 仇神: "這股力量要多留意", 閒神: "作用中性" };

// Pairs are named in the customary order (子丑合、辰戌沖、子未害、辰丑破、寅巳刑、甲己合、申子半合).
const PAIR_ORDER = {
  六合: "子丑寅亥卯戌辰酉巳申午未", 六沖: BRANCHES, 六害: "子未丑午寅巳卯辰申亥酉戌", 相破: "子酉午卯巳申寅亥辰丑戌未",
  相刑: "子卯寅巳申丑戌未", 天干五合: "甲己乙庚丙辛丁壬戊癸", 天干相沖: "甲庚乙辛丙壬丁癸",
};
function orderedRoles(c, r) {
  if (r.roles.length !== 2) return r.roles;
  const ch = role => (r.part === "stem" ? c.P[role].stem.name : c.P[role].branch.name);
  const ref = r.kind === "半合" || r.kind === "拱合" ? TRIADS.find(t => r.roles.every(x => t.includes(ch(x)))) || "" : PAIR_ORDER[r.kind] || "";
  return ref ? r.roles.slice().sort((x, y) => ref.indexOf(ch(x)) - ref.indexOf(ch(y))) : r.roles;
}
const REL_NAME = {
  天干五合: "{chars}合{e}", 天干相沖: "{chars}相沖", 六合: "{chars}合{e}", 六沖: "{chars}相沖", 相刑: "{chars}相刑", 自刑: "{chars}自刑",
  六害: "{chars}相害", 相破: "{chars}相破", 半合: "{chars}半合{e}局", 拱合: "{chars}拱{e}局", 三合: "{chars}三合{e}局", 三會: "{chars}三會{side}{e}", 三刑: "{chars}三刑",
};
function relLabel(c, r) {
  const roles = orderedRoles(c, r);
  const chars = roles.map(role => (r.part === "stem" ? c.P[role].stem.name : c.P[role].branch.name));
  const name = REL_NAME[r.kind] ? tr(REL_NAME[r.kind], { chars: en() ? chars.map(trw).join("-") : chars.join(""), e: r.element ? trw(r.element) : "", side: trw(SIDE[r.element] || "") }) : r.text;
  return paren(name, join(roles.map(role => tr(r.part === "stem" ? ONE.干 : ONE.支, { role: role1(role) })), "・"));
}

function relText(c, r) {
  // 父母、自己、子女 as words (the labels of the same Chinese are capitalised), the other palaces as phrases.
  const palaces = uniq(r.roles.map(role => (r.part === "stem" ? PALACE_STEM : PALACE_BRANCH)[role])).map(p => (["父母", "自己", "子女"].includes(p) ? trw(p) : tr(p)));
  const meaning = (REL_MEANING[r.kind] || (() => r.text))(r);
  let t = tr("{meaning}，牽動{palaces}", { meaning, palaces: listWords(palaces) });
  if (r.element) {
    const role = c.roles[r.element], combine = ["六合", "天干五合"].includes(r.kind);
    t += tr(combine ? "；合出的{e}是{role}，{note}" : "；{e}是{role}，{note}", { e: trw(r.element), role: trw(role), note: tr(ROLE_NOTE[role]) });
    // 合絆: the 用神 tied up by a combination that turns toward an unfavourable element.
    const u0 = c.a.useful[0];
    if (combine && roleIsBad(role) && u0 && u0 !== r.element) {
      const tied = r.roles.map(x => c.P[x]).find(p => !(r.part === "stem" && p.role === "day") && (r.part === "stem" ? p.stem.element : p.branch.element) === u0);
      if (tied) t += tr("；{name}{u}本是用神，被合住而轉向{e}，作用打了折扣，也就是合絆", { name: trw(r.part === "stem" ? tied.stem.name : tied.branch.name), u: trw(u0), e: trw(r.element) });
    }
  }
  if (r.kind === "天干五合" && r.roles.includes("day")) t += tr("；日干逢合，為人重情，也容易被人情牽絆");
  if (["天干五合", "六合"].includes(r.kind) && r.roles.some(role => c.relations.filter(x => x.kind === r.kind && x.roles.includes(role)).length > 1)) {
    t += tr(r.part === "stem" ? "；同一干被兩方相合，稱爭合，合力分散" : "；同一支被兩方相合，稱爭合，合力分散");
  }
  if (r.kind === "六沖" && r.roles.includes("month")) t += tr("；月令受沖，成長環境與事業根基較多變動");
  if (r.kind === "六沖" && r.roles.includes("day")) t += tr("；日支是配偶宮，感情與居住上較多變化");
  return stop(t);
}

function elementsSection(c) {
  const { chart, a, mb, de } = c;
  const order = ELEMENTS.slice().sort((x, y) => a.scores[y] - a.scores[x]);
  const [top, second] = order, weak = order[4];
  const counts = join(ELEMENTS.map(e => `${trw(e)} ${chart.elements[e]}`), "、");
  const w = { e: trw(weak), p: pct(c.share[weak]) };
  const weakWord = c.share[weak] < 0.005 ? tr(weak === de ? "{e}除了日主本身完全不見" : "{e}完全不見", w)
    : weak === de ? tr("{e}除了日主本身只佔約 {p}，最弱", w) : tr("{e}最弱（約 {p}）", w);
  const v1 = { counts, top: trw(top), p: pct(c.share[top]), second: trw(second), weak: weakWord };
  const s1 = c.hourKnown ? tr("八個字的五行是{counts}；連同地支藏干與月令的分量一起計算，{top}最旺（約 {p}），{second}次之，{weak}。", v1)
    : tr("年、月、日六個字的五行是{counts}；連同地支藏干與月令的分量一起計算，{top}最旺（約 {p}），{second}次之，{weak}。", v1);
  const seq = join(["旺", "相", "休", "囚", "死"].map(s => (en() ? paren(trw(elementInState(c, s)), trw(s)) : `${elementInState(c, s)}${s}`)), "、");
  const s2 = tr("{mb}月{season}，五行旺相休囚死依序為{seq}，日主{dm}正處「{st}」{note}。", { mb: trw(mb), season: tr(SEASON_WORD[mb]), seq, dm: se(c.dm), st: trw(c.states[de]), note: tr(STATE_NOTE[c.states[de]]) });
  const MISSING_NOTE = { 用神: "大運流年補到時最有感", 喜神: "補到時有助力", 忌神: "缺了反而少一分干擾", 仇神: "缺了也無妨", 閒神: "補不補都無妨" };
  const parts = chart.missing.map(e => {
    const hid = presence(c, e).hid, role = c.roles[e];
    const v = { e: trw(e), role: trw(role), note: tr(MISSING_NOTE[role]), hid: join(uniq(hid.map(h => tr("{b}中藏{s}", { b: trw(h.branch), s: se(h.stem) }))), "、") };
    return hid.length ? tr("表面上缺{e}，但{hid}，屬於藏而不透；{e}是{role}，{note}", v) : tr("{e}連藏干都沒有，是真正的缺{e}；{e}是{role}，{note}", v);
  });
  if (c.share[top] >= HEAVY) {
    const role = c.roles[top];
    const tail = roleIsBad(role) ? tr("，而且是{role}，化解它是這張盤的主要課題", { role: trw(role) }) : roleIsGood(role) ? tr("，好在是{role}", { role: trw(role) }) : "";
    parts.push(tr("{e}佔全局約 {p}，明顯偏重{tail}", { e: trw(top), p: pct(c.share[top]), tail }));
  }
  const s3 = chart.missing.length ? stop(cap(join(parts, "；"))) : parts.length ? tr("五行俱全，沒有缺；{parts}。", { parts: join(parts, "；") }) : tr("五行俱全，沒有缺；各五行的分量沒有特別懸殊。");
  const items = c.relations.map(r => ({ label: relLabel(c, r), text: relText(c, r) }));
  const s4 = items.length ? "" : tr("四柱之間沒有明顯的合、沖、刑、害，結構單純、彼此干擾少。");
  return section("elements", [para(s1, s2, s3, s4)], items);
}

// ---------- 3 日主強弱 ----------
function strengthSection(c) {
  const { a, dm, de, mb } = c, f = c.factors, yin = c.ge.印;
  const ling = tr("{dm}生於{mb}月，{mb}月{wang}旺，{de}處「{st}」，{ling}。", { dm: se(dm), mb: trw(mb), wang: trw(elementInState(c, "旺")), de: trw(de), st: trw(f.state), ling: trw(f.ling ? "得令" : "失令") });
  let root;
  if (f.roots.length) {
    const list = f.roots.map(r => {
      const p = c.P[r.role], h = p.branch.hidden.find(x => x.element === de);
      const mark = p.terrain === "臨官" ? tr("，是日主的祿位") : p.terrain === "帝旺" ? tr("，是日主的刃位") : "";
      return paren(rb(r.role, r.branch), `${join([trw(r.strength), h ? se(h.name) : ""].filter(Boolean), "")}${mark}`);
    });
    const depth = tr(f.roots.some(r => r.strength === "本氣") ? "根深而穩" : f.roots.some(r => r.strength === "中氣") ? "根氣中等" : "根淺");
    root = tr("日主在{list}通根，{depth}。", { list: join(list, "、"), depth });
  } else root = tr("地支沒有{de}，日主不通根，根基較虛。", { de: trw(de) });
  const bornStems = f.born.filter(x => x.part === "stem"), bornBranches = f.born.filter(x => x.part === "branch");
  let born;
  if (f.born.length) {
    const stemsPart = bornStems.length
      ? tr("{list}（{gods}，{yin}）透出", { list: join(bornStems.map(x => tr("{role}干{s}", { role: role1(x.role), s: trw(x.name) })), "、"), gods: J(uniq(bornStems.map(x => c.P[x.role].stem.god))), yin: trw(yin) }) : "";
    const bv = { list: join(bornBranches.map(x => rb(x.role, x.name)), "、"), yin: trw(yin) };
    const branchPart = bornBranches.length ? tr(bornStems.length ? "{list}的本氣也是{yin}" : "{list}的本氣是{yin}", bv) : "";
    const parts = join([stemsPart, branchPart].filter(Boolean), "，");
    born = f.born.length === 1 ? tr("{parts}，只有一處印星生身。", { parts }) : tr("{parts}，共{n}處印星生身。", { parts, n: COUNT[f.born.length] });
  } else born = tr("命中沒有{yin}，也就是沒有印星生身。", { yin: trw(yin) });
  const helped = f.helped.length
    ? tr("{list}和日主同為{de}（比劫），在天干幫身。", { list: join(f.helped.map(x => tr("{role}干{s}", { role: role1(x.role), s: trw(x.name) })), "、"), de: trw(de) })
    : tr("天干沒有比肩、劫財這類比劫幫身。");
  const items = [{ label: tr("得令"), text: ling }, { label: tr("得地"), text: root }, { label: tr("得生"), text: born }, { label: tr("得助"), text: helped }];
  const shallow = f.roots.length && f.roots.every(r => r.strength === "餘氣");
  const have = [f.ling && "得令", f.roots.length && (shallow ? "得地（根淺）" : "得地"), f.born.length && "得生", f.helped.length && "得助"].filter(Boolean);
  const lack = ["得令", "得地", "得生", "得助"].filter(x => !have.some(h => h.startsWith(x)));
  const s1 = tr("四項之中{have}{lack}；生扶日主的力量約佔全局 {p}（一般命局約四成），判為{verdict}。", {
    have: have.length ? tr("占了{list}", { list: J(have) }) : tr("一項都不占"), lack: have.length && lack.length ? tr("，缺{list}", { list: J(lack) }) : "",
    p: pct(a.support), verdict: trw(strengthLabel(a)),
  });
  let s2;
  if (a.strength === "身強") s2 = strongSource(c) === "印"
    ? tr("力量主要來自印星（{yin}）的生扶，屬於「印旺身強」：靠學習、長輩與環境撐起來的強，和同類幫身的強不同。", { yin: trw(yin) })
    : tr("力量主要來自同類的{de}，屬於「比劫身強」：自我與行動力都強，需要有出口或約束。", { de: trw(de) });
  else if (a.strength === "身弱") {
    const g = drainGroup(c);
    s2 = tr("最耗日主的是{g}（{e}），屬於「{kind}」，凡事宜先求穩、再求進。", { g: trw(GROUP_WORD[g]), e: trw(c.ge[g]), kind: tr({ 食傷: "洩多身弱", 財: "財多身弱", 官殺: "殺重身輕" }[g]) });
  } else if (a.strength === "中和") s2 = tr(leansStrong(c) ? "生扶與剋洩大致平衡，喜忌也就較溫和，整體略偏強一些。" : "生扶與剋洩大致平衡，喜忌也就較溫和，整體略偏弱一些。");
  else if (a.strength === "從弱") s2 = tr("日主幾乎無根、生扶極少，傳統上可視為{name}：不再扶身，{how}。", {
    name: patName(a.special.name),
    how: a.special.follows ? tr("而是順從{g}的旺勢", { g: trw(GROUP_WORD[a.special.follows]) })
      : (a.special.heavy || []).length === 2 ? tr("而是順從{gs}的旺勢，以財星居中調和", { gs: andJoin(a.special.heavy.map(g => trw(GROUP_WORD[g]))) }) : tr("而是順從食傷、財、官殺的整體旺勢"),
  });
  else if (a.strength === "專旺") s2 = a.special.kind === "從強"
    ? tr("印星與比劫佔了全局大半，而印星更重，傳統上可視為{name}：順其強勢，忌財星、官殺逆勢。", { name: patName(a.special.name) })
    : tr("日主之氣佔了全局大半，傳統上可視為{name}：順其旺氣，忌強行剋制。", { name: patName(a.special.name) });
  else s2 = tr(leansStrong(c) ? "整體偏強，宜洩、宜耗，取用以平衡為原則。" : "整體偏弱，宜生、宜扶，取用以平衡為原則。");
  return section("strength", [para(s1, s2), schoolsSentence(c)], items);
}

// What each school thinks, and where they agree or split.
function schoolsSentence(c) {
  const a = c.a;
  const likesOf = s => ELEMENTS.filter(e => (a.schools[s].element[e] || 0) > 0).sort((x, y) => a.schools[s].element[y] - a.schools[s].element[x]);
  const fy = likesOf("扶抑"), gj = likesOf("格局"), th = a.schools.調候;
  const likes = list => (list.length ? tr("喜{els}", { els: J(list) }) : tr("沒有明顯偏好"));
  // 從格／專旺: 調候 and 格局 step aside (analysis.js), so only the special structure's own likes count.
  if (a.special && th.abstain) return tr("各派看法：{name}已不是一般的強弱平衡，調候與格局兩派讓位，只依{name}順勢取用，{likes}。本報告依此取用。", { name: patName(a.special.name), likes: likes(fy) });
  const parts = [tr("扶抑一派看強弱（{verdict}），{likes}", { verdict: trw(a.schools.扶抑.verdict), likes: likes(fy) })];
  if (th.abstain) parts.push(tr("調候一派認為{season}寒暖適中，不特別偏好", { season: trw(th.verdict) }));
  else if (th.stems && th.stems.length) parts.push(tr("調候一派依《窮通寶鑑》取{stems}", { stems: J(th.stems) }));
  else parts.push(tr("調候一派{likes}", { likes: likes(likesOf("調候")) }));
  parts.push(tr("格局一派以{pattern}論，{likes}", { pattern: patName(a.pattern), likes: likes(gj) }));
  const voting = SCHOOLS.filter(s => !a.schools[s].abstain);
  const all = voting.length >= 2 ? ELEMENTS.filter(e => a.views[e].likes.length === voting.length) : [];
  const split = ELEMENTS.filter(e => a.views[e].likes.length && a.views[e].dislikes.length);
  const tail = [];
  if (all.length) tail.push(tr("{n}派都喜{els}", { n: COUNT[voting.length], els: J(all) }));
  if (split.length) tail.push(tr("在{els}上意見分歧（{detail}）", { els: J(split), detail: join(split.map(e => tr("{likers}喜{e}，{haters}忌{e}", { likers: J(a.views[e].likes), e: trw(e), haters: J(a.views[e].dislikes) })), "；") }));
  // A single school in charge (the page lets the reader pick one) shows as favour equal to that school's votes.
  const same = s => ELEMENTS.every(e => Math.abs((a.favor[e] || 0) - (a.schools[s].element[e] || 0)) < 0.011);
  const alike = SCHOOLS.every(s => ELEMENTS.every(e => (a.schools[s].element[e] || 0) === (a.schools.扶抑.element[e] || 0)));
  const only = !alike && SCHOOLS.filter(same).length === 1 ? SCHOOLS.find(same) : null;
  const v = { parts: join(parts, "；"), tail: join(tail, "，"), how: only ? tr("本報告依{school}一派取用", { school: trw(only) }) : tr("本報告以各派加權綜合取用") };
  return tail.length ? tr("各派看法：{parts}。{tail}，{how}。", v) : tr("各派看法：{parts}。{how}。", v);
}

// ---------- 4 格局與用神 ----------
const whereVisible = (c, group) => stemsWords(visibleOf(c, group).map(x => ({ role: x.role, stem: x.stem })));
// 「食神（日支丑、時支子）」 for the 本氣 and 中氣 of a group.
function whereHidden(c, group) {
  const list = hiddenOf(c, group, ["本氣", "中氣"]);
  return paren(J(uniq(list.map(h => h.god))), join(uniq(list.map(h => rb(h.role, h.branch))), "、"));
}
// 成格／破格 in simple terms (simplified from 子平真詮): what helps the structure, what is only hidden, what breaks it.
function patternCheck(c) {
  const a = c.a, s = a.strength, pat = a.pattern;
  // A 從 or 專旺 chart is read as that special structure: the ordinary 成格／破格 rules assume a balanced day master.
  // analysis.js special: 從兒、從財、從殺、從勢, 從強, or 專旺 (曲直、炎上… in its season), each with its own likes and fears.
  if (s === "從弱") return { good: [], hidden: "", bad: [], verdict: tr("日主從弱，改以{name}論：{note}，順勢時格局反而清", { name: patName(a.special.name), note: tr(a.special.note) }) };
  if (s === "專旺") return { good: [], hidden: "", bad: [], verdict: tr(a.special.kind === "從強" ? "印比成勢，改以{name}論：{note}" : "日主一氣獨旺，改以{name}論：{note}", { name: patName(a.special.name), note: tr(a.special.note) }) };
  const vis = g => visibleOf(c, g).length > 0, hid = g => hiddenOf(c, g, ["本氣", "中氣"]).length > 0;
  const okStrength = s === "身強" || s === "中和" || s === "專旺";
  const good = [], hidden = [], bad = [];
  const shows = (where, text) => tr("{where}透出，{text}", { where, text: own(text) });
  const support = (g, text) => {
    if (vis(g)) good.push(shows(whereVisible(c, g), text));
    else if (hid(g)) hidden.push({ where: whereHidden(c, g), text });
  };
  // The short classical phrases are words (trw), so each keeps one English whatever sentence it stands in.
  const add = (list, text) => list.push(own(text));
  switch (pat) {
    case "正官格":
      support("財", "財星生官"); support("印", "印星護官");
      if (okStrength) add(good, "日主足以任官"); else if (!vis("印")) add(bad, "身弱難以任官");
      if (visGod(c, "傷官") && !vis("印")) add(bad, "傷官透出剋官（傷官見官）");
      if (visGod(c, "七殺")) add(bad, "七殺也透出，官殺混雜");
      break;
    case "七殺格":
      if (visGod(c, "食神")) good.push(shows(stemsWords(c.gods.食神.visible), "食神制殺"));
      else if (visGod(c, "傷官")) good.push(shows(stemsWords(c.gods.傷官.visible), "傷官駕殺"));
      else if (hid("食傷")) hidden.push({ where: whereHidden(c, "食傷"), text: "制殺" });
      support("印", "印星化殺");
      if (s === "身強") add(good, "身強能敵殺");
      if (vis("財") && !vis("食傷") && !vis("印")) add(bad, "財星生殺而無制");
      if (isWeak(c) && !vis("印") && !vis("食傷")) add(bad, "身弱殺重而無制化（殺重身輕）");
      if (visGod(c, "正官")) add(bad, "正官也透出，官殺混雜");
      break;
    case "正財格": case "偏財格":
      support("食傷", "食傷生財"); support("官殺", "財旺生官");
      if (okStrength) add(good, s === "中和" ? "日主能任財" : "日主身強能任財");
      else if (vis("印") || vis("比劫")) add(good, "身弱而有印比相扶，仍能任財");
      else add(bad, "財多身弱，力不從心");
      if (vis("比劫") && !vis("官殺")) add(bad, "比劫透出，有奪財之憂（比劫奪財）");
      else if (!vis("比劫")) add(good, "比劫不透，財星不被爭奪");
      break;
    case "正印格": case "偏印格":
      support("官殺", "官殺生印");
      if (s === "身弱" || s === "中和") add(good, "日主得印生扶");
      if (s === "身強" && vis("財")) add(good, "印旺身強，有財星制印");
      if (vis("財") && isWeak(c)) add(bad, "財星透出壞印（財星壞印）");
      if (pat === "偏印格" && visGod(c, "食神") && !vis("財")) add(bad, "偏印與食神同透（梟神奪食）");
      if (s === "身強" && !vis("財") && !vis("食傷")) add(bad, "印多身旺而缺少出口");
      break;
    case "食神格":
      support("財", "食神生財");
      if (visGod(c, "七殺")) add(good, "食神制殺");
      if (okStrength) add(good, "日主能洩");
      if (visGod(c, "偏印") && !vis("財")) add(bad, "偏印透出奪食（梟神奪食）");
      if (isWeak(c) && !vis("印")) add(bad, "身弱洩氣太過");
      break;
    case "傷官格":
      support("財", "傷官生財");
      if (vis("印") && !isStrong(c)) add(good, "傷官佩印");
      if (visGod(c, "正官") && !vis("財") && !vis("印")) add(bad, "傷官見官");
      if (isWeak(c) && !vis("印")) add(bad, "身弱洩氣太過");
      break;
    case "建祿格": case "月刃格": {
      const lu = pat === "建祿格";
      if (visGod(c, "正官")) good.push(shows(stemsWords(c.gods.正官.visible), lu ? "建祿用官" : "官星制刃"));
      if (visGod(c, "七殺")) good.push(shows(stemsWords(c.gods.七殺.visible), lu ? "七殺制身" : "陽刃駕殺"));
      if (!vis("官殺") && hid("官殺")) hidden.push({ where: whereHidden(c, "官殺"), text: lu ? "制祿" : "制刃" });
      if (vis("食傷")) good.push(shows(whereVisible(c, "食傷"), "食傷洩秀"));
      if (vis("財") && (vis("食傷") || vis("官殺"))) add(good, "財星得用");
      if (!vis("官殺") && !vis("食傷")) add(bad, "缺少透出的官殺或食傷來疏導");
      if (vis("比劫") && !vis("官殺")) add(bad, "比劫透出而無制");
      break;
    }
    default: break;
  }
  let verdict;
  if (!bad.length) verdict = good.length >= 2 ? (hidden.length ? "屬於成格，行運引出藏干時更能發揮" : "格局清純，屬於成格")
    : good.length ? "格局尚稱完整" : hidden.length ? "格局之氣多藏在地支，成就要靠行運引出" : "格局平淡，成敗多看行運";
  else verdict = good.length || hidden.length ? "成中帶破，屬中等格局，行運補其不足時最能發揮" : "格局受損（俗稱破格），成就更依賴後天努力與行運";
  verdict = tr(verdict);
  // A clash on the month branch shakes the structure rather than breaking it: said, but not counted against it.
  if (monthClashed(c)) verdict = tr("{verdict}；只是月令受沖，格局根基較易動搖，遇到沖月令的年份要穩住本業", { verdict });
  const hv = { where: andJoin(hidden.map(h => h.where)), what: JW(hidden.map(h => h.text)) };
  const hiddenText = hidden.length ? tr(hidden.length > 1 ? "{where}都藏而未透，暗有{what}之勢" : "{where}藏而未透，暗有{what}之勢", hv) : "";
  return { good, hidden: hiddenText, bad, verdict };
}

// Each school's reason for liking or disliking an element (null when it has none to give).
const LEAN = {
  strong: { like: { 食傷: ["身強宜洩，食傷洩秀", "身略強宜洩，食傷洩秀"], 財: ["身強能任財", "身略強能任財"], 官殺: ["身強宜剋，官殺制身", "身略強宜剋，官殺制身"] }, dislike: { 比劫: ["身強忌再幫身", "身略強忌再幫身"], 印: ["身強忌再生身", "身略強忌再生身"] } },
  weak: { like: { 印: ["身弱宜生，印星生身", "身略弱宜生，印星生身"], 比劫: ["身弱宜幫，比劫助身", "身略弱宜幫，比劫助身"] }, dislike: { 食傷: ["身弱忌洩", "身略弱忌洩"], 財: ["身弱忌耗", "身略弱忌耗"], 官殺: ["身弱忌剋", "身略弱忌剋"] } },
};
function schoolReason(c, school, e, like) {
  const g = c.eg[e], s = c.a.strength, pat = c.a.pattern;
  const text = t => (t ? tr(t) : null);
  if (school === "扶抑") {
    if (s === "從弱") {
      const kind = { kind: trw(c.a.special.kind) };
      if (like) return tr("{kind}宜順從旺勢", kind);
      return g === "印" ? tr("{kind}忌印星生身", kind) : g === "比劫" ? tr("{kind}忌比劫幫身", kind) : text({ 食傷: "從殺忌食傷制殺", 官殺: "從兒忌官殺剋身" }[g]);
    }
    if (s === "專旺" && c.a.special.kind === "從強") return text(like ? "從強宜順其強勢" : { 食傷: "從強忌食傷洩氣", 財: "從強忌財星壞印", 官殺: "從強忌官殺觸怒" }[g]);
    if (s === "專旺") return tr(like ? "專旺宜順其旺氣" : "專旺忌逆勢剋耗");
    const mild = s === "中和" ? 1 : 0, side = LEAN[leansStrong(c) ? "strong" : "weak"][like ? "like" : "dislike"];
    return side[g] ? tr(side[g][mild]) : null;
  }
  if (school === "調候") {
    if (like) { const st = (c.a.schools.調候.stems || []).filter(x => STEM_EL[x] === e); return st.length ? tr("《窮通寶鑑》取{stems}", { stems: J(st) }) : tr("依季節調候"); }
    return tr({ 水: "冬天水寒，忌再添水", 火: "夏天火燥，忌再添火" }[e] || "依季節調候所忌");
  }
  const reason = ((like ? PATTERN_LIKES : PATTERN_DISLIKES)[pat] || {})[g];
  return tr(like ? "{pattern}喜{what}" : "{pattern}忌{what}", { pattern: patName(pat), what: reason ? own(reason) : trw(GROUP_WORD[g]) });
}
function roleText(c, e) {
  const v = c.a.views[e], role = c.roles[e];
  const fmt = (list, like) => list.map(s => [schoolReason(c, s, e, like), s]).filter(([r]) => r).map(([r, s]) => paren(r, trw(s)));
  if (role === "閒神") {
    const all = [...fmt(v.likes, true), ...fmt(v.dislikes, false)];
    return all.length ? tr("各派看法互相抵消：{list}。", { list: join(all, "；") }) : tr("各派都沒有明顯的喜忌。");
  }
  const bad = roleIsBad(role);
  const main = fmt(bad ? v.dislikes : v.likes, !bad), other = fmt(bad ? v.likes : v.dislikes, bad);
  const first = main.length ? join(main, "；") : tr("加權後的取捨");
  return other.length ? tr("{main}；但{other}。", { main: first, other: join(other, "；") }) : stop(first);
}

const ROLE_LABEL = { 喜神: "喜神・{e}（{g}）", 忌神: "忌神・{e}（{g}）", 仇神: "仇神・{e}（{g}）" };
function patternSection(c) {
  const { a, dm, de, mb } = c;
  const main = c.P.month.branch.hidden[0];
  const shown = c.pillars.filter(p => p.role !== "day" && p.stem.name === main.name).map(p => p.role);
  const group = groupOf(de, main.element);
  const kin = visibleOf(c, group).filter(x => x.stem !== main.name);
  const own = main.god === "比肩" || main.god === "劫財";
  const v = { mb: trw(mb), main: se(main.name), dm: se(dm), god: trw(main.god), pattern: patName(a.pattern) };
  let s1;
  // 建祿、月刃: the month holds the day master's own element, so there is nothing to "show"; the structure is read
  // from what controls or drains it.
  if (own) s1 = tr(main.god === "比肩" ? "{mb}月本氣{main}和日主同類，是{dm}的祿（比肩），取{pattern}，成敗要看有沒有官殺制約或食傷疏導"
    : c.a.dayMaster.yang ? "{mb}月本氣{main}和日主同類，是{dm}的陽刃（劫財），取{pattern}，成敗要看有沒有官殺制約或食傷疏導"
      : "{mb}月本氣{main}和日主同類，是{dm}的月劫（劫財），取{pattern}，成敗要看有沒有官殺制約或食傷疏導", v);
  else if (shown.length) s1 = tr("{mb}月本氣{main}對{dm}是{god}，並透出{where}，取{pattern}，格局清楚", { ...v, where: rolesWord(shown, "干") });
  else if (kin.length) s1 = tr("{mb}月本氣{main}對{dm}是{god}，本身不透，但同屬{g}的{kin}透出{where}，仍取{pattern}", { ...v, g: trw(GROUP_WORD[group]), kin: join(uniq(kin.map(x => se(x.stem))), "、"), where: rolesWord(kin.map(x => x.role), "干") });
  else s1 = tr("{mb}月本氣{main}對{dm}是{god}，藏而不透，仍取{pattern}，只是格局之氣較含蓄", v);
  if (!shown.length || own) {
    const alt = c.P.month.branch.hidden.slice(1).find(h => h.god !== main.god && c.pillars.some(p => p.role !== "day" && p.stem.name === h.name));
    if (alt) {
      const roles = c.pillars.filter(p => p.role !== "day" && p.stem.name === alt.name).map(p => p.role);
      s1 += tr("；月令的{type}{stem}（{god}）透出{where}，也有流派改取{pattern}", { type: trw(alt.type), stem: se(alt.name), god: trw(alt.god), where: rolesWord(roles, "干"), pattern: patName(alt.god === "比肩" ? "建祿格" : alt.god === "劫財" ? "月刃格" : `${alt.god}格`) });
    }
  }
  s1 = stop(s1);
  const pc = patternCheck(c);
  const parts = [join(pc.good, "，"), pc.hidden, pc.bad.length ? tr("但{list}", { list: join(pc.bad, "、") }) : ""].filter(Boolean);
  const s2 = parts.length ? tr("{parts}，{verdict}。", { parts: join(parts, "；"), verdict: pc.verdict }) : stop(cap(pc.verdict));

  const u = a.useful;
  const NEED = { 身強: "身強之局宜洩、宜耗、宜剋", 身弱: "身弱之局宜生、宜扶", 中和: "中和之局重在維持平衡", 從弱: "從弱之局宜順從旺勢、不宜扶身", 專旺: "專旺之局宜順其旺氣、不宜強剋", 從強: "從強之局宜順其強勢、喜比劫印星，忌財官逆勢" };
  const need = tr(NEED[strengthLabel(a)] || NEED.中和);
  const byRole = role => ELEMENTS.filter(e => c.roles[e] === role).sort((x, y) => (a.favor[y] || 0) - (a.favor[x] || 0));
  let s3, s4 = "", s5 = "";
  if (u.length) {
    const xi = byRole("喜神"), ji = byRole("忌神"), qiu = byRole("仇神"), xian = byRole("閒神");
    s3 = tr("{need}：以{u}（{g}）為用神，{fn}{xi}{ji}{qiu}{xian}。", {
      need, u: trw(u[0]), g: trw(GROUP_WORD[c.eg[u[0]]]), fn: useFunction(c, u[0]),
      xi: xi.length ? tr("；{els}為喜神", { els: J(xi) }) : "", ji: ji.length ? tr("，{els}為忌神", { els: J(ji) }) : "",
      qiu: qiu.length ? tr("，{els}為仇神", { els: J(qiu) }) : "", xian: xian.length ? tr("，{els}為閒神", { els: J(xian) }) : "",
    });
    const e = u[0], pr = presence(c, e), st = c.states[e];
    const w = { e: trw(e), mb: trw(mb), st: trw(st), stems: J(EL_STEMS[e]), branches: J(EL_BRANCHES[e]), vis: pr.vis.length ? stemsWords(pr.vis) : "", hid: pr.hid.length ? hiddenBrief(pr.hid) : "" };
    if (pr.vis.length && pr.hid.length) s4 = tr("用神{e}透出{vis}，地支也有根（{hid}），有根有苗，在{mb}月處「{st}」。", w);
    else if (pr.vis.length) s4 = tr("用神{e}透出{vis}，但地支無根，力量較浮，大運流年遇到{branches}時才更穩。", w);
    else if (pr.hid.length) s4 = tr("用神{e}沒有透出天干，只藏在{hid}，有根而未透，大運流年遇到{stems}時最能發揮。", w);
    else s4 = tr("用神{e}在命中不見，是最需要靠大運流年補足的五行，逢{stems}、{branches}的運最為得力。", w);
    const verse = (VERSES[dm] || []).find(x => x.when(c));
    if (verse) s5 = tr("《滴天髓》說{dm}「{line}」，{text}。", { dm: se(dm), line: tr(verse.line), text: tr(verse.text) });
  } else s3 = tr("{need}，但各派喜忌互相抵消，五行沒有明顯的用神，取用以平衡為主，行運的影響也較溫和。", { need });

  const items = [];
  const label = (t, e) => tr(t, { e: trw(e), g: trw(GROUP_WORD[c.eg[e]]) });
  if (u.length) items.push({ label: label("用神・{e}（{g}）", u[0]), text: roleText(c, u[0]) });
  for (const role of ["喜神", "忌神", "仇神"]) for (const e of byRole(role)) items.push({ label: label(ROLE_LABEL[role], e), text: roleText(c, e) });
  const xian = byRole("閒神");
  if (xian.length && u.length) items.push({ label: tr("閒神・{els}", { els: J(xian) }), text: xian.length === 1 ? roleText(c, xian[0]) : xian.length === 2 ? para(...xian.map(e => (en() ? `${trw(e)}: ${roleText(c, e)}` : `${e}：${roleText(c, e)}`))) : tr("這幾個五行各派看法互相抵消，加權後影響不大。") });
  items.push({ label: tr("調候用神"), text: tiaohouText(c) });
  return section("pattern", [para(s1, s2), para(s3, s4, s5)], items);
}

function tiaohouText(c) {
  const { a, dm, mb } = c, th = a.schools.調候, stems = th.stems || [];
  if (!stems.length) return tiaohouNote(dm, mb);
  const v = { dm: se(dm), mb: trw(mb), stems: J(stems) };
  if (a.special && th.abstain) {
    const bad = stems.filter(s => a.avoid.includes(STEM_EL[s]));
    return tr("依《窮通寶鑑》，{dm}生於{mb}月，一般以{stems}調候；但這張命盤以{name}論，調候讓位給順勢取用{bad}。", { ...v, name: patName(a.special.name), bad: bad.length ? tr("，其中{list}反而是忌，不宜強求", { list: join(bad.map(se), "、") }) : "" });
  }
  const present = [], absent = [];
  for (const s of stems) {
    const vis = c.pillars.filter(p => p.role !== "day" && p.stem.name === s).map(p => p.role);
    const hid = uniq(c.pillars.filter(p => p.branch.hidden.some(h => h.name === s)).map(p => rb(p.role, p.branch.name)));
    if (vis.length) present.push(tr("{s}透出{where}", { s: se(s), where: rolesWord(vis, "干") }));
    else if (hid.length) present.push(tr("{s}藏在{where}", { s: se(s), where: join(hid, "、") }));
    else absent.push(se(s));
  }
  const state = join([join(present, "，"), absent.length ? tr("{list}命中不見", { list: join(absent, "、") }) : ""].filter(Boolean), "；");
  const hit = stems.find(s => STEM_EL[s] === a.useful[0]), near = stems.find(s => a.useful.includes(STEM_EL[s]));
  const agree = !a.useful.length ? "" : hit ? tr("其中{s}正是用神的方向，調候與用神一致。", { s: se(hit) })
    : near ? tr("其中{s}屬喜神，方向相近。", { s: se(near) }) : tr("調候所需和用神不同，傳統上會在行運中兼顧。");
  return para(tr("依《窮通寶鑑》，{dm}生於{mb}月，調候以{stems}為要：{state}。", { ...v, state }), agree);
}

// ---------- 5 性格 ----------
const CHAR_STARS = [
  ["魁罡", "個性剛強果斷、有領導氣魄"], ["羊刃", "剛烈敢衝，凡事宜三思而後行"], ["華蓋", "聰明而有些孤高，有藝術、學術與宗教的天分"],
  ["將星", "有威望與領導力"], ["桃花", "人緣好、有魅力"], ["紅艷煞", "多情而有吸引力"], ["天乙貴人", "遇到困難容易有貴人相助"],
  ["文昌貴人", "聰明、文筆好"], ["學堂", "學習能力強"], ["太極貴人", "對哲理、玄學有悟性"], ["金神", "剛毅急性、有魄力"],
  ["六秀日", "聰明秀氣、多才多藝"], ["十靈日", "靈性高、直覺準"], ["驛馬", "好動、喜歡變化與外出"], ["國印貴人", "做事有原則、守信用"],
  ["天德貴人", "性情溫和、遇事容易轉圜"], ["月德貴人", "性情溫和、遇事容易轉圜"], ["福星貴人", "福氣好、衣食無憂"], ["天廚貴人", "有口福、懂得享受"],
  ["亡神", "心思深、有謀略"],
];
// Where a star sits: 「月、日兩柱」.
function starWhere(c, star) {
  const roles = c.pillars.filter(p => (c.stars[p.role] || []).includes(star)).map(p => p.role);
  return roles.length ? rolesWord(roles, "柱") : null;
}
// The most telling combination of ten gods for the personality, if any.
function godCombo(c) {
  const vis = g => visibleOf(c, g).length > 0;
  const list = [
    [visGod(c, "傷官") && visGod(c, "正官"), "傷官與正官同時透出（傷官見官），才華與規範互相拉扯，個性直、不服權威，和上司溝通時要多留餘地"],
    [visGod(c, "偏印") && visGod(c, "食神"), "偏印與食神同透（梟神奪食），想法多而容易互相打架，做事宜專注一項、有始有終"],
    [c.a.strength === "從弱", "日主順從旺勢，懂得借環境與他人之力成事，順勢時如魚得水，硬撐著逆勢而為反而辛苦"],
    [visGod(c, "七殺") && vis("印") && !isStrong(c), "七殺有印星化解（殺印相生），能把壓力轉成成長，有擔當也有權威感"],
    [visGod(c, "七殺") && visGod(c, "食神"), "食神制住七殺，有智慧化解壓力，越難的局面越能展現能力"],
    [visGod(c, "傷官") && vis("印") && !isStrong(c), "傷官配上印星（傷官佩印），才華有學養約束，適合走專業與學術"],
    [visGod(c, "正官") && visGod(c, "七殺"), "正官、七殺同時透出（官殺混雜），選擇多、方向容易搖擺，宜先定下主軸"],
    [vis("財") && visGod(c, "正官") && !isWeak(c), "財星與正官相生（財官雙美），務實又重名譽，在組織裡容易被重用"],
    [vis("食傷") && vis("財") && !isWeak(c), "食傷生財，腦筋靈活、懂得把想法變成收入"],
    [c.share[c.ge.財] >= HEAVY && c.a.strength === "身弱", "財多身弱，機會多、壓力也多，容易為責任與金錢操心"],
    [c.share[c.ge.官殺] >= HEAVY && c.a.strength === "身弱", "官殺重而身弱，責任感強、自我要求高，也容易把壓力往肚裡吞"],
    [c.share[c.ge.比劫] >= HEAVY && isStrong(c), "比劫成群，自我意識與競爭心都強，講義氣也好勝"],
    [c.share[c.ge.印] >= HEAVY && isStrong(c), congqiang(c.a) ? "印星重重、印比成勢，思慮周全、重視安全感，也要提醒自己少一點顧慮、多一點行動" : "印星重而身強，思慮周全、重視安全感，也要提醒自己少一點顧慮、多一點行動"],
    [c.share[c.ge.食傷] >= HEAVY && !isStrong(c), "食傷洩氣重，才華與表達欲旺盛，付出多也容易累，要懂得保留精力"],
  ];
  const hit = list.find(([ok]) => ok);
  return hit ? tr(hit[1]) : null;
}
function characterSection(c) {
  const { a, dm } = c, info = DAY_MASTER_TEXT[dm];
  const s1 = tr("{dm}日主，《滴天髓》論{dm}說「{verse}」，性格如{image}：{nature}。", { dm: se(dm), verse: tr(info.verse), image: tr(info.image), nature: tr(info.nature) });
  const s2 = tr("需要留意的是，{blind}。", { blind: tr(info.blind) });
  const ranked = Object.entries(c.counts).sort((x, y) => y[1].weight - x[1].weight || y[1].visible.length - x[1].visible.length);
  const [god, cnt] = ranked[0], t = TEN_GOD_TEXT[god];
  const where = join([cnt.visible.length ? tr("{where}透出", { where: rolesWord(cnt.visible, "干") }) : "", cnt.hidden.length ? tr(cnt.visible.length ? "{where}也有" : "{where}藏有", { where: rolesWord(cnt.hidden, "支") }) : ""].filter(Boolean), "，");
  const combo = godCombo(c);
  const more = combo || (cnt.weight >= 2 ? tr("但{god}太重時{heavy}", { god: trw(god), heavy: tr(t.heavy) }) : tr("盲點是{blind}", { blind: tr(t.blind) }));
  const s3 = tr("十神之中{god}最重（{where}），{trait}；{more}。", { god: trw(god), where, trait: tr(t.trait), more });
  const db = c.P.day.branch, dg = db.god;
  const s4 = tr("{pattern}的人{nature}；日坐{db}{god}，{seat}。", { pattern: patName(a.pattern), nature: PATTERN_TEXT[a.pattern] ? tr(PATTERN_TEXT[a.pattern].nature) : tr("各有所長"), db: be(db.name, db.element), god: trw(dg), seat: tr(TEN_GOD_TEXT[dg].seat) });
  const picked = [];
  for (const [star, text] of CHAR_STARS) {
    if (picked.length >= 3) break;
    const w = starWhere(c, star);
    if (w && !picked.some(x => x.text === text)) picked.push({ star, text, where: w });
  }
  const s5 = picked.length ? tr("神煞方面，{list}。", { list: join(picked.map((x, i) => (i && picked[i - 1].where === x.where ? tr("又見{star}，{text}", { star: trw(x.star), text: tr(x.text) }) : tr("{where}見{star}，{text}", { where: x.where, star: trw(x.star), text: tr(x.text) }))), "；") }) : "";
  return section("character", [para(s1, s2), para(s3, s4, s5)]);
}

// ---------- 6 六親 ----------
function familySection(c) {
  const { P, dm, de } = c;
  const good = [], bad = [];
  const MEAN_GOOD = { year: "祖上與早年環境有庇蔭", month: "父母與成長環境是助力", day: "配偶能給你助力", hour: "子女與晚年較有福" };
  const MEAN_BAD = { year: "祖上庇蔭有限，早年多靠自己", month: "成長環境的壓力較大", day: "婚姻需要多花心力經營", hour: "子女與晚年的事要多費心" };
  for (const p of c.pillars) {
    const w = favorWord(pillarFavor(c, p)), name = p.role === "day" ? tr("日支{b}", { b: trw(p.branch.name) }) : glue(trw(p.label), pillarWord(p.name));
    if (w === "喜") good.push({ p, name }); else if (w === "忌") bad.push({ p, name });
  }
  const meaning = join([...good.map(x => tr(MEAN_GOOD[x.p.role])), ...bad.map(x => tr(MEAN_BAD[x.p.role]))], "，") || tr("六親助力平均，各有往來");
  const lean = join([good.length ? tr("{list}落在喜用", { list: join(good.map(x => x.name), "、") }) : "", bad.length ? tr("{list}偏忌", { list: join(bad.map(x => x.name), "、") }) : ""].filter(Boolean), "，");
  const s1 = tr("以{dm}日主來看，{lean}：{meaning}。", { dm: se(dm), lean: lean || tr("四柱的喜忌大致平均"), meaning });
  const kin = { dm: se(dm), yin: trw(c.ge.印), cai: trw(c.ge.財), de: trw(de), gs: trw(c.ge.官殺), ss: trw(c.ge.食傷) };
  const s2 = tr(c.male ? "以十神論六親，{dm}的母親星是{yin}（正印）、父親星是{cai}（偏財）、兄弟姊妹是{de}（比劫），妻星是{cai}（財星）、子女星是{gs}（官殺）。"
    : "以十神論六親，{dm}的母親星是{yin}（正印）、父親星是{cai}（偏財）、兄弟姊妹是{de}（比劫），夫星是{gs}（官殺）、子女星是{ss}（食傷）。", kin);

  // 父母：正印為母、偏財為父（男女同論）
  const motherGod = hasGod(c, "正印") ? "正印" : hasGod(c, "偏印") ? "偏印" : null;
  const fatherGod = hasGod(c, "偏財") ? "偏財" : hasGod(c, "正財") ? "正財" : null;
  const kinWhere = god => {
    const g = c.gods[god], roots = g.hidden.filter(x => x.type !== "餘氣");
    if (g.visible.length) return tr(roots.length ? "透出{where}，地支也有根" : "透出{where}", { where: rolesWord(g.visible.map(x => x.role), "干") });
    return tr("只藏在{list}中", { list: join(uniq(g.hidden.map(x => rb(x.role, x.branch))), "、") });
  };
  let mother, father;
  if (motherGod) {
    const role = c.roles[c.ge.印];
    const tail = roleIsGood(role) ? tr("；印星是喜用，母親的支持對你幫助很大。") : roleIsBad(role) ? tr("；但印星屬{role}，母親的關愛有時會變成壓力或過度保護，彼此保留空間更好。", { role: trw(role) }) : stop("");
    mother = tr(motherGod === "偏印" ? "母親星以偏印代（{e}）{where}，{effect}{tail}" : "母親星正印（{e}）{where}，{effect}{tail}", { e: trw(c.ge.印), where: kinWhere(motherGod), effect: tr(visGod(c, motherGod) ? "母親的照顧與影響明顯" : "母親的影響較含蓄"), tail });
  } else mother = tr("命中不見印星（{e}），傳統上解讀為較早學會靠自己；和母親實際的關係，還是看彼此怎麼相處。", { e: trw(c.ge.印) });
  if (fatherGod) {
    const role = c.roles[c.ge.財];
    const extra = c.share[c.ge.比劫] >= 0.3 && !visGod(c, fatherGod) ? tr("，比劫又重，傳統上說父親較辛勞") : "";
    const tail = roleIsGood(role) ? tr("；財星是喜用，父親對你仍有實質的支持。") : roleIsBad(role) ? tr("；財星屬{role}，和父親在觀念與金錢上宜多溝通。", { role: trw(role) }) : stop("");
    father = tr(fatherGod === "正財" ? "父親星以正財代（{e}）{where}，{effect}{extra}{tail}" : "父親星偏財（{e}）{where}，{effect}{extra}{tail}", { e: trw(c.ge.財), where: kinWhere(fatherGod), effect: tr(visGod(c, fatherGod) ? "父親在你成長中的角色鮮明" : "父親的角色較含蓄"), extra, tail });
  } else father = tr("命中不見財星（{e}），從十神只看得出父親這顆星不顯；和父親實際的關係，還是看彼此怎麼相處。", { e: trw(c.ge.財) });

  // 兄弟：比劫與月柱
  const bjVis = visibleOf(c, "比劫"), bjHid = hiddenOf(c, "比劫"), bjRole = c.roles[de];
  const bjMain = bjHid.filter(x => x.type === "本氣");
  const siblings = (bjVis.length ? tr("比劫透出{where}，兄弟姊妹或朋友在你生命中份量不輕", { where: stemsWords(bjVis) })
    : bjMain.length ? tr("比劫藏在{list}的本氣，手足緣分不淺，只是各有各的發展", { list: J(uniq(bjMain.map(x => x.branch))) })
      : bjHid.length ? tr("比劫只藏在{list}中，兄弟姊妹各自獨立，助力有限", { list: J(uniq(bjHid.map(x => x.branch))) }) : tr("命中不見比劫，凡事多靠自己，和手足各忙各的"))
    + (roleIsGood(bjRole) ? tr("；比劫是喜用，手足與朋友是助力，合作共事有好處。") : roleIsBad(bjRole) ? tr("；比劫屬{role}，和手足、朋友合夥或有金錢往來時，要先把話講清楚。", { role: trw(bjRole) }) : stop(""));

  // 配偶：日支與配偶星（婚姻感情一節再細看）
  const star = c.male ? "財" : "官殺", starEl = c.ge[star], starRole = c.roles[starEl];
  const starGods = GROUP_GODS[star].filter(g => hasGod(c, g));
  const sv = { gods: J(starGods), e: trw(starEl), how: tr(roleIsGood(starRole) ? "是喜用，另一半能帶給你實質的幫助" : roleIsBad(starRole) ? "偏忌，兩人需要在相處中多磨合" : "平穩，相處貴在互相體諒") };
  const spouse = tr("配偶宮日支{b}坐{god}，{desc}；", { b: trw(P.day.branch.name), god: trw(P.day.branch.god), desc: tr(SPOUSE_BY_GOD[P.day.branch.god]) })
    + (starGods.length ? tr(c.male ? "妻星{gods}（{e}）{how}。" : "夫星{gods}（{e}）{how}。", sv)
      : tr(c.male ? "妻星（{e}）在命中不顯，緣分可能來得較晚，或需要自己主動經營。" : "夫星（{e}）在命中不顯，緣分可能來得較晚，或需要自己主動經營。", sv));

  // 子女：時柱；男命官殺、女命食傷
  const kid = c.male ? "官殺" : "食傷", kidEl = c.ge[kid], kidGods = GROUP_GODS[kid].filter(g => hasGod(c, g)), kidRole = c.roles[kidEl];
  const kv = { gods: J(kidGods), e: trw(kidEl) };
  const kidStar = tr(c.male ? "男命以官殺為子女星，{what}{help}" : "女命以食傷為子女星，{what}{help}", {
    what: kidGods.length ? tr(kidGods.some(g => visGod(c, g)) ? "{gods}（{e}）透出天干，與子女的緣分明朗" : "{gods}（{e}）藏而不透，與子女的緣分需要時間經營", kv)
      : tr("{e}在命中不顯，傳統上說子女緣可能來得較晚（要不要生、何時生，仍是自己的選擇）", kv),
    help: roleIsGood(kidRole) ? tr("，子女星是喜用，日後子女是你的助力") : "",
  });
  let children;
  if (P.hour) {
    const hs = c.roles[P.hour.stem.element], hb = c.roles[P.hour.branch.element];
    const flow = roleIsBad(hs) && roleIsGood(hb) ? "先難後易，晚年漸入佳境" : roleIsGood(hs) && roleIsBad(hb) ? "先易後難，晚年宜早作安排"
      : roleIsGood(hs) && roleIsGood(hb) ? "晚年較有福氣" : roleIsBad(hs) && roleIsBad(hb) ? "養育子女要多花心力，晚年宜自己預作安排" : "晚年平穩";
    children = tr("{kid}；時柱{p}（時干屬{hs}、時支屬{hb}），{flow}。", { kid: kidStar, p: pillarWord(P.hour.name), hs: trw(hs), hb: trw(hb), flow: tr(flow) });
  } else children = tr("時辰不詳，子女宮無法細看，只從子女星論：{kid}。", { kid: kidStar });

  const items = [
    { label: tr("父母"), text: para(mother, father) }, { label: tr("兄弟姊妹"), text: siblings },
    { label: tr("配偶"), text: spouse }, { label: tr("子女"), text: children },
  ];
  // 十神看六親只是傾向: said in this section itself, for readers who were adopted, lost a parent, grew up in a blended
  // family or chose not to have children, with a pointer to the 合盤 that reads a real family member.
  const s3 = tr("十神論六親只看得出傾向，不能代替真實的家庭經驗：被收養、在重組家庭長大、選擇不生，或親人已不在身邊的人，請以自己的實際情況為準；想看和某位家人合不合，填入他的生日做合盤會更準。");
  return section("family", [para(s1, s2, s3)], items);
}

// ---------- 7 事業 ----------
const DRIVER = {
  官殺: "適合在組織與制度裡發展，看重職位與名聲",
  食傷: "靠才華、技術或口才吃飯",
  財: "對市場、數字與實務敏感，有經營頭腦",
  印: "適合需要學歷、證照或專業背書的工作",
  比劫: "適合自主性高、靠人脈與團隊打拚的工作",
};
const CAREER_STARS = [
  ["將星", "有機會帶團隊、做決策"], ["驛馬", "出差、外派或在外地發展較有機會"], ["文昌貴人", "利於文書、教育、研究與考試"],
  ["國印貴人", "適合公職或掌管制度、印信的職務"], ["天醫", "與醫療、照護、心理諮商有緣"], ["華蓋", "適合藝術、宗教、學術等需要專注的領域"],
  ["魁罡", "有領導氣魄，適合決策、執法或管理"], ["天乙貴人", "職場上容易遇到提攜的貴人"], ["學堂", "學習力強，適合持續進修的專業"],
];
function careerSection(c) {
  const { a, dm } = c, pt = PATTERN_TEXT[a.pattern];
  const v = { dm: se(dm), pattern: patName(a.pattern) };
  const s1 = pt ? tr("{dm}{pattern}的人{nature}，傳統上適合{careers}等工作。", { ...v, nature: tr(pt.nature), careers: JW(pt.careers) })
    : tr("{dm}日主以{pattern}論，選擇工作時宜順著用神的五行與自己的專長。", v);
  const drivers = ["官殺", "食傷", "財", "印", "比劫"].filter(g => visibleOf(c, g).length).sort((x, y) => c.share[c.ge[y]] - c.share[c.ge[x]]).slice(0, 2);
  const shownAs = g => { const list = visibleOf(c, g); return tr("{g}{stems}透出{where}，{driver}", { g: trw(GROUP_WORD[g]), stems: join(uniq(list.map(x => se(x.stem))), "、"), where: rolesWord(list.map(x => x.role), "干"), driver: tr(DRIVER[g]) }); };
  const s2 = drivers.length ? stop(cap(join(drivers.map(shownAs), "；"))) : tr("命中十神多藏而不透，做事低調務實，實力要靠時間慢慢被看見。");
  // 受雇或自營
  let own = 0, job = 0;
  if (isStrong(c)) own++; else if (isWeak(c)) job++;
  if (visGod(c, "七殺")) own++;
  if (visGod(c, "偏財")) own++;
  if (visibleOf(c, "食傷").length && (hasGod(c, "正財") || hasGod(c, "偏財"))) own++;
  if (["建祿格", "月刃格", "偏財格", "七殺格"].includes(a.pattern)) own++;
  if (visGod(c, "正官")) job++;
  if (visibleOf(c, "印").length) job++;
  if (["正官格", "正財格", "正印格", "偏印格"].includes(a.pattern)) job++;
  if (c.share[c.ge.財] >= HEAVY && isWeak(c)) job++;
  const way = tr(own >= job + 2 ? "具備自己開創的條件，適合創業、自營，或在組織裡擔任開疆闢土的角色"
    : job >= own + 2 ? "較適合在穩定的組織裡發揮專業、按部就班升遷；若想創業，宜先累積資源與人脈"
      : "受雇與自營都可行：前期在組織裡累積實力，等資源與時機成熟再考慮自立");
  const stars = CAREER_STARS.map(([star, text]) => [star, text, starWhere(c, star)]).filter(x => x[2]).slice(0, 2);
  const s3 = stars.length ? tr("整體而言，{way}；{stars}。", { way, stars: join(stars.map(([star, text, w]) => tr("{where}見{star}，{text}", { where: w, star: trw(star), text: tr(text) })), "，") }) : tr("整體而言，{way}。", { way });
  const items = a.useful.slice(0, 3).map((e, i) => ({ label: tr(i ? "喜神・{e}" : "用神・{e}", { e: trw(e) }), text: stop(JW(ELEMENT_INDUSTRIES[e])) }));
  if (!items.length) items.push({ label: tr("五行行業"), text: tr("命局喜忌不明顯，選擇行業時可以興趣與專長為主。") });
  return section("career", [para(s1, s2, s3)], items);
}

// ---------- 8 財運 ----------
function wealthSection(c) {
  const { a, dm, de } = c, ce = c.ge.財;
  const g = god => c.gods[god] || { visible: [], hidden: [] };
  const desc = god => {
    const { visible: v, hidden: h } = g(god);
    if (v.length) return tr("{god}{stems}透出{where}", { god: trw(god), stems: join(uniq(v.map(x => se(x.stem))), "、"), where: rolesWord(v.map(x => x.role), "干") });
    return h.length ? tr("{god}{stems}藏在{list}中", { god: trw(god), stems: join(uniq(h.map(x => se(x.stem))), "、"), list: join(uniq(h.map(x => rb(x.role, x.branch))), "、") }) : "";
  };
  const both = [desc("正財"), desc("偏財")].filter(Boolean);
  const pr = presence(c, ce);
  const power = tr(pr.vis.length && pr.hid.length ? "財星有根有苗" : pr.vis.length ? "財星透而無根，來得快也去得快" : pr.hid.length ? "財星藏而不透，屬於暗財，宜穩紮穩打" : "財星不顯");
  const v = { dm: se(dm), e: trw(ce), both: join(both, "，"), mb: trw(c.mb), st: trw(c.states[ce]), power };
  const s1 = both.length ? tr("{dm}以{e}為財星：{both}，在{mb}月處「{st}」，{power}。", v) : tr("{dm}以{e}為財星：命中不見{e}，{power}，財富多靠專業與機運引出。", v);
  const strongEnough = isStrong(c) || a.strength === "中和";
  const s2 = tr(a.strength === "從弱" ? (a.useful.includes(ce) ? "從格順勢，財星為用時反而能借勢得財。" : "從格順勢，財富宜跟著大環境走，不宜逆勢硬拚。")
    : congqiang(a) ? "從強之局忌財星壞印，不宜強求財，靠學識、專業與名聲帶財較順。"
    : a.strength === "專旺" ? "專旺之局不宜強求財，靠專業與名聲帶財較順。"
      : strongEnough && c.share[ce] >= 0.2 ? (a.strength === "中和" ? "日主強弱適中，擔得起財，屬於「身財兩停」，財富靠能力穩步累積。" : "日主身強，擔得起財，屬於「身財兩停」，財富靠能力穩步累積。")
        : strongEnough ? "日主有力而財星偏弱，有能力卻要自己開創財源，越主動越有收穫。"
          : c.share[ce] >= 0.3 ? "財多身弱，機會多但壓力也大，宜量力而為，借重團隊或專業。"
            : "身弱財也不旺，宜以專業技能換取穩定收入，不宜冒進。");
  const zw = (c.counts.正財 || {}).weight || 0, pw = (c.counts.偏財 || {}).weight || 0;
  const zv = g("正財").visible.length, pv = g("偏財").visible.length;
  const kind = tr(zv && pv ? "正偏財並透，收入來源多元，也要避免分散"
    : zw > pw ? "正財重於偏財，宜靠薪資、本業與長期投資累積" : pw > zw ? "偏財重於正財，生意、投資與業外收入的機會多，也要設好停損"
      : zw ? "正偏財份量相當，收入有固定的一份，也有機會財" : "正偏財不顯，財源以穩定工作為主");
  const tomb = TOMB[ce], tombAt = c.pillars.filter(p => p.branch.name === tomb);
  const tombClash = tombAt.length && c.relations.some(r => r.kind === "六沖" && r.roles.some(role => c.P[role].branch.name === tomb));
  const ku = tombAt.length ? tr("命帶財庫（{where}{tomb}），有存錢、置產的本能{clash}", { where: rolesWord(tombAt.map(p => p.role), "支"), tomb: trw(tomb), clash: tombClash ? tr(c.a.strength === "身強" ? "；財庫逢沖，身強沖開財庫，反而有大筆進帳的機會" : "；財庫逢沖，容易財來財去，宜把錢放在不易動用的地方") : "" })
    : tr("{e}的財庫在{tomb}，命中沒有，存錢要靠紀律而不是本能", { e: trw(ce), tomb: trw(tomb) });
  const s3 = stop(cap(join([kind, ku], "；")));
  const bjVis = visibleOf(c, "比劫").length > 0, bjRole = c.roles[de];
  const keep = tr(bjVis && roleIsBad(bjRole) && (hasGod(c, "正財") || hasGod(c, "偏財")) ? "比劫透出又屬忌，合夥、借貸與作保要格外謹慎，財務最好和朋友分開"
    : bjVis && roleIsGood(bjRole) ? "比劫為喜，和朋友、夥伴合作反而能共同生財"
      : c.share[ce] >= 0.3 && isWeak(c) ? "守財的關鍵是量入為出，以穩健的工具累積"
        : visibleOf(c, "食傷").length && strongEnough ? "最適合把技術、口碑與作品變成收入"
          : zw >= pw ? "最適合自動轉存、定期定額這類「先存再花」的做法，讓收入慢慢累積成資產" : "投資宜設停損、獲利落袋為安，別讓偏財來得快也去得快");
  return section("wealth", [para(s1, s2), para(s3, stop(cap(keep)))]);
}

// ---------- 9 婚姻感情 ----------
const LOVE_STARS = {
  紅艷煞: "感情豐富、重浪漫，容易為情所困，宜理性經營",
  孤辰: "性格獨立，感情裡需要自己的空間；婚後宜多安排兩人時光",
  寡宿: "感情上偶有寂寞感，宜主動表達、多溝通",
  陰差陽錯: "傳統上主婚姻容易陰錯陽差，例如婚期延誤或與姻親磨合，多溝通即可化解",
  孤鸞煞: "傳統上主感情需要多經營，晚一點結婚或多花心力在相處上，較能圓滿",
  紅鸞: "命帶紅鸞，姻緣與喜事緣分佳",
  天喜: "命帶天喜，感情與家中喜事多",
  金輿: "另一半多能給你助力，婚後生活較富足",
};
const PARTNER = {
  比肩: "能並肩作戰、互相尊重", 劫財: "有主見又講道理", 食神: "溫和、懂得生活情趣", 傷官: "欣賞你的才華、聊得來",
  正財: "務實顧家", 偏財: "大方開朗", 正官: "穩重負責", 七殺: "能幹而懂得退讓", 正印: "包容體貼", 偏印: "尊重你的獨立與想法",
};
function marriageSection(c) {
  const { a, P, dm } = c, db = P.day.branch;
  const s1 = tr("日支{b}是配偶宮，坐{god}、星運「{terrain}」：{spouse}；{tspouse}。", { b: trw(db.name), god: trw(db.god), terrain: trw(P.day.terrain), spouse: tr(SPOUSE_BY_GOD[db.god]), tspouse: tr(TERRAIN_TEXT[P.day.terrain].spouse) });
  // 配偶星
  const star = c.male ? "財" : "官殺", el = c.ge[star], word = c.male ? "妻星" : "夫星";
  const vis = visibleOf(c, star), hid = hiddenOf(c, star), role = c.roles[el];
  const v = { g: trw(GROUP_WORD[star]), dm: se(dm), e: trw(el), word: trw(word), where: vis.length ? stemsWords(vis) : "", list: join(uniq(hid.map(x => rb(x.role, x.branch))), "、") };
  let s2 = tr(c.male ? "男命的配偶星是{g}，{dm}的妻星是{e}：" : "女命的配偶星是{g}，{dm}的夫星是{e}：", v);
  if (vis.length) s2 += tr(hid.length ? "{where}透出、地支有根，{word}明朗有力" : "{where}透出但地支無根，{word}明顯而力量偏浮", v);
  else if (hid.length) s2 += tr("藏在{list}中、不透天干，感情較含蓄，緣分需要時間醞釀", v);
  else s2 += tr("命中不見，緣分可能來得較晚，需要自己多主動");
  const issues = [];
  if (c.male && visGod(c, "正財") && visGod(c, "偏財")) issues.push(tr("正偏財並透，異性緣佳，感情上要專一"));
  if (c.male && visibleOf(c, "比劫").length && (vis.length || hid.length) && roleIsBad(c.roles[c.de])) issues.push(tr("比劫透出爭財，感情裡要防朋友或第三者介入"));
  if (!c.male && visGod(c, "正官") && visGod(c, "七殺")) issues.push(tr("官殺並透，追求者多，宜慎選、不急著定下來"));
  if (!c.male && visGod(c, "傷官") && hasGod(c, "正官")) issues.push(tr("傷官見官，對另一半要求高，相處時宜多欣賞、少挑剔"));
  // A 從格 follows the heavy star, so only a 身弱 chart is weighed down by it.
  if (c.share[el] >= HEAVY && c.a.strength === "身弱") issues.push(tr("{word}太重而日主弱，容易在感情中委屈自己，宜保持自我", v));
  s2 += issues.length ? stop(`${en() ? "; " : "；"}${join(issues, "；")}`) : stop("");
  // 日支與其他柱的關係
  // The day branch's relations, one clause per kind (a 三刑 replaces its pairs).
  const own = c.relations.filter(r => r.part === "branch" && r.roles.includes("day"));
  const tri = own.some(r => r.kind === "三刑");
  const withWhom = kind => uniq(own.filter(r => r.kind === kind).flatMap(r => r.roles.filter(x => x !== "day"))).sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
  const others = kind => join(withWhom(kind).map(x => rb(x, P[x].branch.name)), "、");
  const REL_LOVE = {
    六合: () => tr("日支與{others}六合，夫妻感情有黏著力{kids}", { others: others("六合"), kids: withWhom("六合").includes("hour") ? tr("，也重視家庭與孩子") : "" }),
    半合: () => tr("日支與{others}半合，兩人容易有共同目標", { others: others("半合") }),
    拱合: () => tr("日支與{others}拱合，感情裡暗中有互相成全的力量", { others: others("拱合") }),
    三合: () => tr("日支參與三合局，夫妻之間凝聚力強"),
    三會: () => tr("日支參與三會局，家庭觀念重"),
    六沖: () => tr("日支與{others}相沖，感情與居住較多變動，宜多溝通、給彼此空間", { others: others("六沖") }),
    相刑: () => (tri ? "" : tr("日支與{others}相刑，相處中容易有摩擦，宜多包容", { others: others("相刑") })),
    自刑: () => tr("日支自刑，感情裡容易自尋煩惱，想法說出來就好"),
    三刑: () => tr("日支捲入三刑，相處中容易有摩擦，要特別多些耐心"),
    六害: () => tr("日支與{others}相害，要防誤會累積", { others: others("六害") }),
    相破: () => tr("日支與{others}相破，{what}", { others: others("相破"), what: tr(withWhom("相破").includes("year") ? "和長輩之間要多體諒" : withWhom("相破").includes("month") ? "和原生家庭之間要多協調" : "小事要及時溝通") }),
  };
  const rel = uniq(own.map(r => r.kind)).map(k => (REL_LOVE[k] || (() => ""))()).filter(Boolean);
  // The palace (日支) and the star can disagree: the person helps while the marriage itself needs work, or the reverse.
  const palace = c.roles[db.element], pGood = roleIsGood(palace), pBad = roleIsBad(palace), sGood = roleIsGood(role), sBad = roleIsBad(role);
  const bv = { db: be(db.name, db.element), palace: trw(palace), word: trw(word), role: trw(role) };
  const blend = pBad && sGood ? tr("配偶宮{db}屬{palace}、{word}卻是喜用：另一半本身有助力，婚姻的課題在相處模式", bv)
    : pGood && sBad ? tr("配偶宮為喜而{word}偏忌：婚姻生活本身和樂，另一半的個性需要磨合", bv)
      : pGood && sGood ? tr("配偶宮與{word}都是喜用，婚姻是你的助力", bv)
        : pBad && sBad ? tr("配偶宮與{word}都偏忌，感情需要比別人多一分經營，找到對的相處節奏就能穩定", bv)
          : sGood ? tr("{word}是{role}，另一半對你有助益", bv) : sBad ? tr("{word}屬{role}，感情裡的拉扯要用溝通化解", bv)
            : pGood ? tr("配偶宮{db}屬喜用，婚姻生活是你的避風港", bv) : pBad ? tr("配偶宮{db}屬{palace}，婚姻需要多花心力經營", bv) : "";
  const s3 = stop(cap(join([...rel, blend].filter(Boolean), "；") || tr("日支在命局中沒有合沖刑害，感情結構單純穩定")));
  const u0 = a.useful[0];
  const pv = { partner: PARTNER[db.god] ? tr(PARTNER[db.god]) : tr("互相體諒"), trait: u0 ? tr(ELEMENT_LUCK[u0].trait) : "", u: u0 ? trw(u0) : "" };
  const s4 = u0 ? tr("適合{partner}的伴侶；從五行看，個性{trait}、或八字{u}旺的人，較能補足你。", pv) : tr("適合{partner}的伴侶。", pv);
  const items = [];
  const peach = starWhere(c, "桃花");
  if (peach) {
    const inner = ["day", "hour"].some(r => (c.stars[r] || []).includes("桃花")), outer = ["year", "month"].some(r => (c.stars[r] || []).includes("桃花"));
    items.push({ label: tr("桃花（{where}）", { where: peach }), text: stop(join([inner ? tr("日、時見桃花稱「牆內桃花」，異性緣多能用在經營婚姻上") : "", outer ? tr("年、月見桃花稱「牆外桃花」，社交圈廣、異性緣好，婚後宜保持分寸") : ""].filter(Boolean), "；")) });
  }
  for (const [star2, text] of Object.entries(LOVE_STARS)) {
    const w = starWhere(c, star2);
    if (w) items.push({ label: paren(trw(star2), w), text: stop(tr(text)) });
  }
  const combine = SIX_COMBINE[db.name], triad = [...TRIADS.find(t => t.includes(db.name))].filter(b => b !== db.name);
  const hong = branchesWithStar(c, "紅鸞"), xi = branchesWithStar(c, "天喜");
  items.push({ label: tr("感情較有進展的年份"), text: tr("流年逢{word}（{stems}年或{branches}年），流年地支逢{combine}（與日支六合）或{triad}（與日支三合），以及紅鸞{hong}、天喜{xi}之年，感情較容易有進展；實際年份請看流年詳批。", {
    word: trw(word), stems: J(EL_STEMS[el]), branches: J(EL_BRANCHES[el]), combine: trw(combine), triad: J(triad), hong: hong.length ? bracket(J(hong)) : "", xi: xi.length ? bracket(J(xi)) : "",
  }) });
  return section("marriage", [para(s1, s2), para(s3, s4)], items);
}

// ---------- 10 健康 ----------
function healthSection(c) {
  const { a, dm, de } = c;
  const order = ELEMENTS.slice().sort((x, y) => a.scores[x] - a.scores[y]);
  const weak = order[0], strong = order[4], ji = a.avoid[0];
  // 「只透出…」, and after 除了日主本身 「也只透出…」.
  const where = (e, also) => {
    const pr = presence(c, e);
    if (pr.vis.length) return tr(also ? "也只透出{list}" : "只透出{list}", { list: stemsWords(pr.vis) });
    return pr.hid.length ? tr(also ? "也只藏在{list}中" : "只藏在{list}中", { list: J(uniq(pr.hid.map(x => x.branch))) }) : tr("命中不見");
  };
  const weakWhat = weak === de ? tr("除了日主本身，{e}{where}，是全局最弱的一環", { e: trw(weak), where: where(weak, true) }) : tr("{e}最弱（{where}）", { e: trw(weak), where: where(weak) });
  const ctrl = CONTROLLED_BY[weak];
  const s1 = tr("傳統說法以五行對應臟腑。這張{dm}命盤{weak}，{e}主{organs}，平時宜多保養：{care}；{season}{ctrl}旺剋{e}時尤其要留意。", { dm: se(dm), weak: weakWhat, e: trw(weak), organs: tr(ELEMENT_ORGANS[weak].organs), care: tr(ELEMENT_ORGANS[weak].care), season: tr(SEASON_OF[ctrl]), ctrl: trw(ctrl) });
  const s2 = c.share[strong] >= 0.3 ? tr("{e}最旺（約 {p}），{e}主{organs}，過旺也是負擔，{care}。", { e: trw(strong), p: pct(c.share[strong]), organs: tr(ELEMENT_ORGANS[strong].organs), care: tr(ELEMENT_ORGANS[strong].care) }) : "";
  const s3 = ji && ji !== weak && ji !== strong ? tr("忌神{e}當令的{season}，作息宜放慢，{organs}方面多照顧。", { e: trw(ji), season: tr(SEASON_OF[ji]), organs: tr(ELEMENT_ORGANS[ji].organs) }) : "";
  return section("health", [para(s1, s2, s3, tr("以上是傳統說法，身體狀況請以醫師診斷為準。"))]);
}

// ---------- 11 開運建議 ----------
const friendsOf = b => ({ triad: [...TRIADS.find(x => x.includes(b))].filter(x => x !== b), combine: SIX_COMBINE[b] });
function adviceOf(c) {
  const a = c.a;
  const els = a.useful.length ? a.useful.slice(0, 3) : [ELEMENTS.slice().sort((x, y) => a.scores[x] - a.scores[y])[0]];
  const zodiac = uniq([c.P.year.branch.name, c.P.day.branch.name].flatMap(b => { const f = friendsOf(b); return [...f.triad, f.combine]; }).map(b => ZODIAC_ANIMAL[b]));
  return {
    elements: els,
    colors: uniq(els.flatMap(e => ELEMENT_LUCK[e].colors)),
    directions: uniq(els.map(e => ELEMENT_LUCK[e].direction)),
    numbers: uniq(els.flatMap(e => ELEMENT_LUCK[e].numbers)),
    industries: uniq(els.flatMap(e => ELEMENT_INDUSTRIES[e].slice(0, els.length > 2 ? 3 : 4))),
    habits: els.map(e => ELEMENT_LUCK[e].habit),
    zodiac,
  };
}
// The advice lists as the page shows them (the numbers stay numbers).
const adviceShown = adv => Object.fromEntries(Object.entries(adv).map(([k, list]) => [k, k === "numbers" ? list : list.map(x => (k === "industries" ? own(x) : ["elements", "zodiac"].includes(k) ? trw(x) : tr(x)))]));
function adviceSection(c, adv) {
  const { a, dm } = c, yb = c.P.year.branch.name, db = c.P.day.branch.name;
  const base = a.useful.length ? tr("這張{dm}命盤開運以用神{u}為主{xi}{ji}。", { dm: se(dm), u: trw(a.useful[0]), xi: a.useful.length > 1 ? tr("，喜神{list}為輔", { list: listWords(a.useful.slice(1).map(trw)) }) : "", ji: a.avoid.length ? tr("，忌神{e}不宜過多", { e: trw(a.avoid[0]) }) : "" })
    : tr("這張{dm}命盤喜忌不明顯，開運以補足最弱的{e}為主。", { dm: se(dm), e: trw(adv.elements[0]) });
  const animals = b => { const f = friendsOf(b); return { triad: listWords(f.triad.map(x => trw(ZODIAC_ANIMAL[x]))), combine: trw(ZODIAC_ANIMAL[f.combine]) }; };
  const fy = animals(yb), fd = animals(db);
  const zod = yb === db ? tr("生肖方面，與年、日支{yb}三合的{triad}、六合的{combine}，較容易投緣。", { yb: trw(yb), ...fy })
    : tr("生肖方面，與年支{yb}三合的{ytriad}、六合的{ycombine}，以及與日支{db}三合的{dtriad}、六合的{dcombine}，較容易投緣。", { yb: trw(yb), ytriad: fy.triad, ycombine: fy.combine, db: trw(db), dtriad: fd.triad, dcombine: fd.combine });
  const tag = e => bracket(trw(e));
  const avoidColor = a.avoid.length ? tr("；忌神{e}的{colors}色不宜大面積使用", { e: trw(a.avoid[0]), colors: JP(ELEMENT_LUCK[a.avoid[0]].colors) }) : "";
  const items = [
    { label: tr("顏色"), text: stop(`${join(adv.elements.map(e => `${JP(ELEMENT_LUCK[e].colors)}${tag(e)}`), "，")}${avoidColor}`) },
    { label: tr("方位"), text: tr("{list}，求學、工作或居家擺設可多往這些方向。", { list: join(adv.elements.map(e => `${tr(ELEMENT_LUCK[e].direction)}${tag(e)}`), "，") }) },
    { label: tr("數字"), text: tr("{list}，取自河圖數，可用在車牌、門牌或密碼等小地方。", { list: join(adv.elements.map(e => `${join(ELEMENT_LUCK[e].numbers, "、")}${tag(e)}`), "，") }) },
    { label: tr("行業"), text: stop(JW(adv.industries)) },
    { label: tr("生活習慣"), text: stop(JP(adv.habits, "；")) },
  ];
  return section("advice", [para(base, zod)], items);
}

// ---------- 主程式 ----------
export function natalReading(chart, analysis, { name = null } = {}) {
  const c = context(chart, analysis, name);
  const adv = adviceOf(c);
  const sections = glossAll([
    summary(c), elementsSection(c), strengthSection(c), patternSection(c), characterSection(c), familySection(c),
    careerSection(c), wealthSection(c), marriageSection(c), healthSection(c), adviceSection(c, adv),
  ]);
  return {
    title: tr("八字命理詳批"),
    basics: basics(c),
    table: table(c),
    sections,
    advice: adviceShown(adv),
    notes: (chart.warnings || []).map(w => noteText(c, w.text)),
    disclaimer: tr(DISCLAIMER),
  };
}

// 成格／破格 as they hold for this chart (the same check the 詳批 uses), for the AI reading's facts: only conditions
// that fired, never the generic list of what could break a structure.
export function patternFacts(chart, analysis) {
  const r = patternCheck(context(chart, analysis, null));
  return { pattern: analysis.pattern, special: analysis.special ? analysis.special.name : null, good: r.good, hidden: r.hidden, bad: r.bad, verdict: r.verdict };
}
