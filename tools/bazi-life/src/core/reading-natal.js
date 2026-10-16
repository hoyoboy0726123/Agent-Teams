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
import { ELEMENTS, GROUPS, SCHOOLS, groupOf, elementOf } from "./analysis.js";
import {
  natalStars, natalRelations, seasonalStates, strengthFactors, tenGodCounts, elementRoles, luckStars, STEMS, BRANCHES,
} from "./detail.js";

// ---------- 靜態表 ----------

// 十天干日主：《滴天髓》開篇、意象、性格的長處與盲點。
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

// 《滴天髓》裡和取用有關的句子：符合 when 時，格局與用神一節會引用。
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
    { line: "通根透癸，沖天奔地", when: c => c.a.avoid.includes("水"), text: "壬水通根又見癸水時氣勢奔騰，需要疏導而不宜再添" },
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

export const DISCLAIMER = "本詳批依傳統子平八字的理論與本專案的推算規則寫成，是文化參考與自我觀察的工具，不是對人生的保證或預言。"
  + "命理各派說法不一，健康、財務、法律與婚姻等重要決定，請以專業意見與自己的判斷為準。";


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

const uniq = list => [...new Set(list)];
const listWords = items => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join("、")}和${items[items.length - 1]}`);
const pct = x => `${Math.round(x * 100)}%`;
const ymd = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return `${y} 年 ${m} 月 ${d} 日`; };
const hm = s => s.slice(11, 16);
const nayinOf = name => zh(SixtyCycle.fromName(name).getSound().getName());
const section = (id, paragraphs, items = []) => ({ id, title: TITLE[id], paragraphs: paragraphs.filter(Boolean), items });

// 「年、時兩干」
function rolesWord(roles, part) {
  const u = uniq(roles).sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
  return u.length === 1 ? `${ROLE_ZH[u[0]]}${part}` : `${u.map(r => ROLE_ZH[r]).join("、")}${COUNT[u.length]}${part}`;
}
// [{ role, stem }] → 「年、時兩干的戊土、月干甲木」
function stemsWords(list, withEl = true) {
  const by = new Map();
  for (const x of list) by.set(x.stem, [...(by.get(x.stem) || []), x.role]);
  return [...by].map(([stem, roles]) => {
    const s = withEl ? `${stem}${STEM_EL[stem]}` : stem;
    return roles.length === 1 ? `${ROLE_ZH[roles[0]]}干${s}` : `${rolesWord(roles, "干")}的${s}`;
  }).join("、");
}
// [{ role, name }] (branches) → 「年支辰」 or 「辰、丑兩支」
function branchesWords(list) {
  return list.length === 1 ? `${ROLE_ZH[list[0].role]}支${list[0].name}` : `${list.map(x => x.name).join("、")}${COUNT[list.length]}支`;
}
// Hidden stems [{ role, branch, type }] → 「時支子的本氣與辰、丑之中」
function hiddenBrief(hid) {
  const main = hid.filter(h => h.type === "本氣"), rest = hid.filter(h => h.type !== "本氣");
  const parts = [];
  if (main.length) parts.push(`${listWords(uniq(main.map(h => `${ROLE_ZH[h.role]}支${h.branch}`)))}的本氣`);
  if (rest.length) parts.push(`${uniq(rest.map(h => h.branch)).join("、")}之中`);
  return parts.join("與");
}

// The last pass: each glossary term gets its plain-words gloss at its first use in reading order (paragraphs, then
// items, section by section). Uses inside 「」 or （） are skipped so glosses never nest.
function glossAll(sections) {
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
function basics(c) {
  const { chart, P } = c, out = [];
  if (c.name) out.push({ label: "姓名", value: c.name });
  out.push({ label: "性別", value: c.male ? "乾造（男）" : "坤造（女）" });
  const place = chart.input.place.name || "自訂地點";
  out.push({ label: "國曆", value: `${ymd(chart.time.entered)}${c.hourKnown ? ` ${hm(chart.time.entered)}` : "，時辰不詳"}（${place}）` });
  const mode = chart.input.options.solar;
  if (c.hourKnown && mode !== "clock") {
    const vs = Math.round(Math.abs(chart.time.vsEntered)), sign = chart.time.vsEntered < 0 ? "−" : "+";
    out.push({ label: mode === "mean" ? "平太陽時" : "真太陽時", value: `${ymd(chart.time.solarClock)} ${hm(chart.time.solarClock)}（鐘錶 ${hm(chart.time.entered)}，${vs ? `校正 ${sign}${vs} 分鐘` : "與鐘錶時間相同"}）` });
  }
  const lunar = chart.lunar.replace(/^農曆/, "");
  let lunarValue = lunar;
  if (c.hourKnown) {
    lunarValue += ` ${P.hour.branch.name}時`;
    const solarDate = chart.time.solarClock.slice(0, 10), civil = chart.time.entered.slice(0, 10);
    const late = chart.input.options.zi === "early" && Number(chart.time.solarClock.slice(11, 13)) >= 23 && solarDate === civil;
    if (late) lunarValue += "（23 點後出生，日柱已換到次日）";
    else if (solarDate > civil) lunarValue += "（真太陽時已過午夜，日柱以次日論）";
  }
  out.push({ label: "農曆", value: lunarValue });
  const lunarYear = (/^(..)年/.exec(lunar) || [])[1];
  out.push({ label: "生肖", value: `${chart.zodiac}（以立春換年，年柱${P.year.name}${lunarYear && lunarYear !== P.year.name ? `；農曆仍是${lunarYear}年，但八字已過立春` : ""}）` });
  // 出生在節氣後幾天
  const birth = Date.parse(`${chart.time.entered.replace(" ", "T")}:00Z`);
  const prev = Date.parse(`${chart.terms.prev.time.replace(" ", "T")}:00Z`);
  const gap = Math.max(0, birth - prev), days = Math.floor(gap / 86400000), hours = Math.floor((gap % 86400000) / 3600000);
  const after = days ? `${days} 天${hours ? ` ${hours} 小時` : ""}` : `${hours} 小時`;
  const t = chart.terms;
  out.push({ label: "節氣", value: `${c.hourKnown ? "" : "約"}${t.prev.name}後 ${after}（${t.prev.name}：${ymd(t.prev.time)} ${hm(t.prev.time)}；下一個節是${t.next.name}，${ymd(t.next.time)} ${hm(t.next.time)}）` });
  const commander = commanderOf(c);
  if (commander) out.push({ label: "人元司令", value: `${commander}${STEM_EL[commander]}用事`, note: "出生時月令裡當值的藏干" });
  const s = chart.luck.start;
  const span = [s.years && `${s.years} 年`, s.months && `${s.months} 個月`, s.days && `${s.days} 天`].filter(Boolean).join(" ");
  const [ty, tm, td] = s.date.split("-").map(Number);
  const turn = SolarTime.fromYmdHms(ty, tm, td, 12, 0, 0).getLunarHour().getSixtyCycleHour().getYear().getHeavenStem().getName();
  out.push({ label: "起運", value: `出生後${span ? ` ${span}` : "不久"}起運（${ymd(s.date)}交運，虛歲 ${s.age} 歲），大運${chart.luck.forward ? "順行" : "逆行"}，此後每十年換一步運（逢${turn}年交運）${c.hourKnown ? "" : "；時辰不詳，以中午估算"}` });
  const x = chart.extras;
  if (x.ownSign) out.push({ label: "命宮", value: `${x.ownSign}（${nayinOf(x.ownSign)}）`, note: "先天的人生基調" });
  if (x.bodySign) out.push({ label: "身宮", value: `${x.bodySign}（${nayinOf(x.bodySign)}）`, note: "後天努力的方向" });
  // 胎元 needs only the month pillar: the next stem and the third branch after.
  const fetal = x.fetalOrigin || `${STEMS[(STEMS.indexOf(P.month.stem.name) + 1) % 10]}${BRANCHES[(BRANCHES.indexOf(P.month.branch.name) + 3) % 12]}`;
  out.push({ label: "胎元", value: `${fetal}（${nayinOf(fetal)}）`, note: "受胎的月份，看先天的稟賦" });
  if (x.fetalBreath) out.push({ label: "胎息", value: `${x.fetalBreath}（${nayinOf(x.fetalBreath)}）`, note: "日柱的暗合，看內在的氣質" });
  const a = c.a;
  out.push({ label: "命局", value: `${c.dm}${c.de}日主・${a.strength}・${a.pattern}${a.useful.length ? `・用神${a.useful[0]}` : ""}` });
  out.push({ label: "五行", value: `${ELEMENTS.map(e => `${e} ${chart.elements[e]}`).join("、")}${chart.missing.length ? `（缺${chart.missing.join("、")}）` : "（五行俱全）"}` });
  return out;
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

// ---------- 排盤表 ----------
function table(c) {
  const ps = c.pillars;
  return {
    columns: ps.map(p => p.label),
    rows: [
      { label: "主星", cells: ps.map(p => (p.role === "day" ? (c.male ? "元男" : "元女") : p.stem.god)) },
      { label: "天干", cells: ps.map(p => p.stem.name), elements: ps.map(p => p.stem.element) },
      { label: "地支", cells: ps.map(p => p.branch.name), elements: ps.map(p => p.branch.element) },
      { label: "藏干", cells: ps.map(p => p.branch.hidden.map(h => `${h.name}${h.element}`)) },
      { label: "副星", cells: ps.map(p => p.branch.hidden.map(h => h.god)) },
      { label: "星運", cells: ps.map(p => p.terrain) },
      { label: "自坐", cells: ps.map(p => p.seat) },
      { label: "空亡", cells: ps.map(p => p.void) },
      { label: "納音", cells: ps.map(p => p.nayin) },
      { label: "神煞", cells: ps.map(p => c.stars[p.role] || []) },
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
  if (s === "從弱") return "順從旺勢";
  if (s === "專旺") return "順其旺氣";
  if (v.likes.includes("扶抑")) {
    if (g === "印") return "取其生身";
    if (g === "比劫") return "取其幫身";
    if (g === "食傷") return c.a.pattern === "七殺格" ? "取其制殺" : OUTPUT_IMAGE[c.de];
    if (g === "財") return c.share[c.ge.印] >= 0.3 ? "取其制印" : "取其耗身生財";
    if (g === "官殺") return CONTROL_IMAGE[c.de];
  }
  if (v.likes.includes("格局")) return `合${c.a.pattern}所喜的${(PATTERN_LIKES[c.a.pattern] || {})[g] || GROUP_WORD[g]}`;
  if (v.likes.includes("調候")) return "取其調候";
  return `取${GROUP_WORD[g]}之用`;
}

// The classical line for a group that is far too heavy, when it fits this chart.
function excessLine(c) {
  const g = GROUPS.slice().sort((x, y) => c.share[c.ge[y]] - c.share[c.ge[x]])[0], e = c.ge[g];
  if (c.share[e] < HEAVY) return null;
  const line = EXCESS[g][c.de];
  if (g === "印") return { group: g, element: e, line };
  if ((g === "食傷" || g === "財") && !isStrong(c)) return { group: g, element: e, line };
  if (g === "官殺" && isWeak(c)) return { group: g, element: e, line };
  if (g === "比劫" && isStrong(c) && c.a.useful.includes(c.ge.食傷)) return { group: g, element: e, line };
  return null;
}

function rootPhrase(c) {
  const r = c.factors.roots;
  if (!r.length) return `地支不見${c.de}，日主無根`;
  const main = r.filter(x => x.strength === "本氣");
  if (main.length) return `在${listWords(main.map(x => `${ROLE_ZH[x.role]}支${x.branch}`))}有本氣之根`;
  if (r.length === 1) return `只在${ROLE_ZH[r[0].role]}支${r[0].branch}中有一點${r[0].strength}之根`;
  const kinds = uniq(r.map(x => x.strength));
  return kinds.length === 1 ? `在${listWords(r.map(x => `${ROLE_ZH[x.role]}支${x.branch}`))}中有${kinds[0]}之根`
    : `在${r.map(x => `${ROLE_ZH[x.role]}支${x.branch}（${x.strength}）`).join("、")}中有根，根氣不深`;
}
function helpPhrase(c) {
  const f = c.factors;
  const stems = f.born.filter(x => x.part === "stem").map(x => ({ role: x.role, stem: x.name }));
  const branches = f.born.filter(x => x.part === "branch").map(x => ({ role: x.role, name: x.name }));
  const born = [stems.length ? stemsWords(stems) : "", branches.length ? branchesWords(branches) : ""].filter(Boolean).join("與");
  const parts = [];
  if (born) parts.push(`${born}生身`);
  if (f.helped.length) parts.push(`${stemsWords(f.helped.map(x => ({ role: x.role, stem: x.name })))}幫身`);
  return parts.join("，");
}
function strengthSentence(c) {
  const f = c.factors, s = c.a.strength, root = rootPhrase(c), help = helpPhrase(c);
  const g = drainGroup(c), drain = `${GROUP_WORD[g]}（${c.ge[g]}）${DRAIN_WORD[g]}較重`;
  if (s === "身強" || s === "專旺") {
    const deep = f.ling || f.roots.some(r => r.strength === "本氣");
    const verdict = s === "專旺" ? "日主極旺，近於專旺" : "身強";
    return `${root}，${help ? `${deep ? "又有" : "但"}${help}` : "又得月令之氣"}，綜合下來${verdict}，強在${strongSource(c) === "印" ? "印星" : "比劫"}。`;
  }
  if (s === "身弱") return `${root}${help ? `，雖有${help}` : ""}，但${drain}，綜合下來身弱。`;
  if (s === "從弱") return `${root}，${help ? `只有${help}，` : "生扶極少，"}${drain}，日主極弱而有從勢，屬於從弱。`;
  if (s === "中和") return `${root}${help ? `，${help}` : ""}，生扶與剋洩的力量大致相當，強弱屬於中和。`;
  return `${root}${help ? `，${help}` : ""}，綜合下來判為${s}。`;
}

function summary(c) {
  const { a, dm, de, mb } = c;
  const wang = elementInState(c, "旺"), st = c.states[de];
  const chartName = `${c.male ? "乾造" : "坤造"}${c.names.join("、")}${c.hourKnown ? "" : "（時辰不詳，以三柱論）"}`;
  const s1 = `${c.name ? `${c.name}的命盤為` : ""}${chartName}，日主${dm}${de}如${DAY_MASTER_TEXT[dm].image}，生於${mb}月${wang}旺之時，${de}${st === "旺" ? "當令而旺" : `處於「${st}」`}，${c.factors.ling ? "得令" : "失令"}。`;
  const s2 = strengthSentence(c);
  const main = c.P.month.branch.hidden[0];
  const shown = c.pillars.filter(p => p.role !== "day" && p.stem.name === main.name).map(p => p.role);
  const s3 = `月令${mb}的本氣${main.name}${main.element}是${main.god}，${shown.length ? `透出${rolesWord(shown, "干")}` : "藏而不透"}，取${a.pattern}。`;
  const ex = excessLine(c);
  const lead = ex ? `全局${ex.element}重，正應了古訣「${ex.line}」；` : "";
  const u = a.useful;
  const s4 = u.length
    ? `${lead}以${u[0]}為用神，${useFunction(c, u[0])}${u.length > 1 ? `，${u.slice(1).join("、")}為喜` : ""}${a.avoid.length ? `，忌${a.avoid.join("、")}` : ""}。`
    : `${lead}各派喜忌互相抵消，五行沒有特別突出的用神，取用以維持平衡為主。`;
  return section("summary", [s1 + s2 + s3 + s4]);
}

// ---------- 2 五行與旺衰 ----------
const PALACE_BRANCH = { year: "祖上與童年", month: "父母兄弟與成長環境", day: "配偶宮", hour: "子女與晚年" };
const PALACE_STEM = { year: "祖上長輩", month: "父母", day: "自己", hour: "子女" };
const REL_MEANING = {
  天干五合: () => "天干相合，主有情、互相牽絆",
  天干相沖: () => "天干相沖，想法與做法容易互相拉扯",
  六合: () => "地支六合，主和合、有助力，也有牽絆不易分開之意",
  六沖: () => "地支相沖，主變動與對立，所牽動的人事容易聚少離多或起伏較大",
  相刑: () => "地支相刑，主摩擦與壓力，相處上要多些包容",
  自刑: () => "同一地支自刑，主自己和自己拉扯、容易想太多",
  六害: () => "地支相害，主暗中的耗損與誤會，凡事宜把話說清楚",
  相破: () => "地支相破，主小破損或計畫被打斷，影響通常不大",
  半合: r => `半合${r.element}局，${r.element}的力量被帶起來`,
  拱合: r => `拱合${r.element}局（缺中間的旺支），暗中有${r.element}的氣勢`,
  三合: r => `三合成${r.element}局，${r.element}的力量大增`,
  三會: r => `三會${SIDE[r.element]}${r.element}，${r.element}的氣勢極強`,
  三刑: () => "三刑俱全，傳統上主壓力與是非較多，行事宜守法、謹慎",
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
function relLabel(c, r) {
  const roles = orderedRoles(c, r);
  const chars = roles.map(role => (r.part === "stem" ? c.P[role].stem.name : c.P[role].branch.name)).join("");
  const name = {
    天干五合: `${chars}合${r.element}`, 天干相沖: `${chars}相沖`, 六合: `${chars}合${r.element}`, 六沖: `${chars}相沖`, 相刑: `${chars}相刑`,
    自刑: `${chars}自刑`, 六害: `${chars}相害`, 相破: `${chars}相破`, 半合: `${chars}半合${r.element}局`, 拱合: `${chars}拱${r.element}局`,
    三合: `${chars}三合${r.element}局`, 三會: `${chars}三會${SIDE[r.element] || ""}${r.element}`, 三刑: `${chars}三刑`,
  }[r.kind] || r.text;
  return `${name}（${roles.map(role => `${ROLE_ZH[role]}${r.part === "stem" ? "干" : "支"}`).join("・")}）`;
}

function relText(c, r) {
  const palaces = uniq(r.roles.map(role => (r.part === "stem" ? PALACE_STEM : PALACE_BRANCH)[role]));
  const meaning = (REL_MEANING[r.kind] || (() => r.text))(r);
  let t = `${meaning}，牽動${listWords(palaces)}`;
  if (r.element) {
    const role = c.roles[r.element], combine = ["六合", "天干五合"].includes(r.kind);
    t += `；${combine ? `合出的${r.element}` : r.element}是${role}，${ROLE_NOTE[role]}`;
    // 合絆: the 用神 tied up by a combination that turns toward an unfavourable element.
    const u0 = c.a.useful[0];
    if (combine && roleIsBad(role) && u0 && u0 !== r.element) {
      const tied = r.roles.map(x => c.P[x]).find(p => !(r.part === "stem" && p.role === "day") && (r.part === "stem" ? p.stem.element : p.branch.element) === u0);
      if (tied) t += `；${r.part === "stem" ? tied.stem.name : tied.branch.name}${u0}本是用神，被合住而轉向${r.element}，作用打了折扣，也就是合絆`;
    }
  }
  if (r.kind === "天干五合" && r.roles.includes("day")) t += "；日干逢合，為人重情，也容易被人情牽絆";
  if (["天干五合", "六合"].includes(r.kind) && r.roles.some(role => c.relations.filter(x => x.kind === r.kind && x.roles.includes(role)).length > 1)) {
    t += `；同一${r.part === "stem" ? "干" : "支"}被兩方相合，稱爭合，合力分散`;
  }
  if (r.kind === "六沖" && r.roles.includes("month")) t += "；月令受沖，成長環境與事業根基較多變動";
  if (r.kind === "六沖" && r.roles.includes("day")) t += "；日支是配偶宮，感情與居住上較多變化";
  return `${t}。`;
}

function elementsSection(c) {
  const { chart, a, mb, de } = c;
  const order = ELEMENTS.slice().sort((x, y) => a.scores[y] - a.scores[x]);
  const [top, second] = order, weak = order[4];
  const counts = ELEMENTS.map(e => `${e} ${chart.elements[e]}`).join("、");
  const weakWord = c.share[weak] < 0.005 ? `${weak}${weak === de ? "除了日主本身" : ""}完全不見`
    : weak === de ? `${weak}除了日主本身只佔約 ${pct(c.share[weak])}，最弱` : `${weak}最弱（約 ${pct(c.share[weak])}）`;
  const s1 = `${c.hourKnown ? "八" : "年、月、日六"}個字的五行是${counts}；連同地支藏干與月令的分量一起計算，${top}最旺（約 ${pct(c.share[top])}），${second}次之，${weakWord}。`;
  const seq = ["旺", "相", "休", "囚", "死"].map(s => `${elementInState(c, s)}${s}`).join("、");
  const s2 = `${mb}月${SEASON_WORD[mb]}，五行旺相休囚死依序為${seq}，日主${c.dm}${de}正處「${c.states[de]}」${STATE_NOTE[c.states[de]]}。`;
  const MISSING_NOTE = { 用神: "大運流年補到時最有感", 喜神: "補到時有助力", 忌神: "缺了反而少一分干擾", 仇神: "缺了也無妨", 閒神: "補不補都無妨" };
  const parts = chart.missing.map(e => {
    const hid = presence(c, e).hid, role = c.roles[e];
    return hid.length
      ? `表面上缺${e}，但${uniq(hid.map(h => `${h.branch}中藏${h.stem}${e}`)).join("、")}，屬於藏而不透；${e}是${role}，${MISSING_NOTE[role]}`
      : `${e}連藏干都沒有，是真正的缺${e}；${e}是${role}，${MISSING_NOTE[role]}`;
  });
  if (c.share[top] >= HEAVY) {
    const role = c.roles[top];
    parts.push(`${top}佔全局約 ${pct(c.share[top])}，明顯偏重${roleIsBad(role) ? `，而且是${role}，化解它是這張盤的主要課題` : roleIsGood(role) ? `，好在是${role}` : ""}`);
  }
  const s3 = `${chart.missing.length ? "" : "五行俱全，沒有缺；"}${parts.length ? parts.join("；") : "各五行的分量沒有特別懸殊"}。`;
  const items = c.relations.map(r => ({ label: relLabel(c, r), text: relText(c, r) }));
  const s4 = items.length ? "" : "四柱之間沒有明顯的合、沖、刑、害，結構單純、彼此干擾少。";
  return section("elements", [s1 + s2 + s3 + s4], items);
}

// ---------- 3 日主強弱 ----------
function strengthSection(c) {
  const { a, dm, de, mb } = c, f = c.factors, yin = c.ge.印;
  const ling = `${dm}${de}生於${mb}月，${mb}月${elementInState(c, "旺")}旺，${de}處「${f.state}」，${f.ling ? "得令" : "失令"}。`;
  let root;
  if (f.roots.length) {
    const list = f.roots.map(r => {
      const p = c.P[r.role], h = p.branch.hidden.find(x => x.element === de);
      const mark = p.terrain === "臨官" ? "，是日主的祿位" : p.terrain === "帝旺" ? "，是日主的刃位" : "";
      return `${ROLE_ZH[r.role]}支${r.branch}（${r.strength}${h ? `${h.name}${h.element}` : ""}${mark}）`;
    });
    const depth = f.roots.some(r => r.strength === "本氣") ? "根深而穩" : f.roots.some(r => r.strength === "中氣") ? "根氣中等" : "根淺";
    root = `日主在${list.join("、")}通根，${depth}。`;
  } else root = `地支沒有${de}，日主不通根，根基較虛。`;
  const bornStems = f.born.filter(x => x.part === "stem"), bornBranches = f.born.filter(x => x.part === "branch");
  let born;
  if (f.born.length) {
    const stemsPart = bornStems.length
      ? `${bornStems.map(x => `${ROLE_ZH[x.role]}干${x.name}`).join("、")}（${uniq(bornStems.map(x => c.P[x.role].stem.god)).join("、")}，${yin}）透出` : "";
    const branchPart = bornBranches.length ? `${bornBranches.map(x => `${ROLE_ZH[x.role]}支${x.name}`).join("、")}的本氣${bornStems.length ? "也" : ""}是${yin}` : "";
    born = `${[stemsPart, branchPart].filter(Boolean).join("，")}，${f.born.length === 1 ? "只有一處" : `共${COUNT[f.born.length]}處`}印星生身。`;
  } else born = `命中沒有${yin}，也就是沒有印星生身。`;
  const helped = f.helped.length
    ? `${f.helped.map(x => `${ROLE_ZH[x.role]}干${x.name}`).join("、")}和日主同為${de}（比劫），在天干幫身。`
    : "天干沒有比肩、劫財這類比劫幫身。";
  const items = [{ label: "得令", text: ling }, { label: "得地", text: root }, { label: "得生", text: born }, { label: "得助", text: helped }];
  const shallow = f.roots.length && f.roots.every(r => r.strength === "餘氣");
  const have = [f.ling && "得令", f.roots.length && (shallow ? "得地（根淺）" : "得地"), f.born.length && "得生", f.helped.length && "得助"].filter(Boolean);
  const lack = ["得令", "得地", "得生", "得助"].filter(x => !have.some(h => h.startsWith(x)));
  const s1 = `四項之中${have.length ? `占了${have.join("、")}` : "一項都不占"}${have.length && lack.length ? `，缺${lack.join("、")}` : ""}；生扶日主的力量約佔全局 ${pct(a.support)}（一般命局約四成），判為${a.strength}。`;
  let s2;
  if (a.strength === "身強") s2 = strongSource(c) === "印"
    ? `力量主要來自印星（${yin}）的生扶，屬於「印旺身強」：靠學習、長輩與環境撐起來的強，和同類幫身的強不同。`
    : `力量主要來自同類的${de}，屬於「比劫身強」：自我與行動力都強，需要有出口或約束。`;
  else if (a.strength === "身弱") {
    const g = drainGroup(c);
    s2 = `最耗日主的是${GROUP_WORD[g]}（${c.ge[g]}），屬於「${{ 食傷: "洩多身弱", 財: "財多身弱", 官殺: "殺重身輕" }[g]}」，凡事宜先求穩、再求進。`;
  } else if (a.strength === "中和") s2 = `生扶與剋洩大致平衡，喜忌也就較溫和，整體${leansStrong(c) ? "略偏強" : "略偏弱"}一些。`;
  else if (a.strength === "從弱") s2 = `日主幾乎無根、生扶極少，傳統上可視為從格：不再扶身，而是順從最旺的${GROUP_WORD[drainGroup(c)]}。`;
  else if (a.strength === "專旺") s2 = "日主之氣佔了全局大半，傳統上可視為專旺格：順其旺氣，忌強行剋制。";
  else s2 = `${leansStrong(c) ? "整體偏強，宜洩、宜耗" : "整體偏弱，宜生、宜扶"}，取用以平衡為原則。`;
  return section("strength", [s1 + s2, schoolsSentence(c)], items);
}

// What each school thinks, and where they agree or split.
function schoolsSentence(c) {
  const a = c.a;
  const likesOf = s => ELEMENTS.filter(e => (a.schools[s].element[e] || 0) > 0).sort((x, y) => a.schools[s].element[y] - a.schools[s].element[x]);
  const fy = likesOf("扶抑"), gj = likesOf("格局"), th = a.schools.調候;
  const parts = [`扶抑一派看強弱（${a.schools.扶抑.verdict}），${fy.length ? `喜${fy.join("、")}` : "沒有明顯偏好"}`];
  if (th.abstain) parts.push(`調候一派認為${th.verdict}寒暖適中，不特別偏好`);
  else if (th.stems && th.stems.length) parts.push(`調候一派依《窮通寶鑑》取${th.stems.join("、")}`);
  else parts.push(`調候一派${likesOf("調候").length ? `喜${likesOf("調候").join("、")}` : "沒有明顯偏好"}`);
  parts.push(`格局一派以${a.pattern}論，${gj.length ? `喜${gj.join("、")}` : "沒有明顯偏好"}`);
  const voting = SCHOOLS.filter(s => !a.schools[s].abstain);
  const all = voting.length >= 2 ? ELEMENTS.filter(e => a.views[e].likes.length === voting.length) : [];
  const split = ELEMENTS.filter(e => a.views[e].likes.length && a.views[e].dislikes.length);
  const tail = [];
  if (all.length) tail.push(`${COUNT[voting.length]}派都喜${all.join("、")}`);
  if (split.length) tail.push(`在${split.join("、")}上意見分歧（${split.map(e => `${a.views[e].likes.join("、")}喜${e}，${a.views[e].dislikes.join("、")}忌${e}`).join("；")}）`);
  // A single school in charge (the page lets the reader pick one) shows as favour equal to that school's votes.
  const same = s => ELEMENTS.every(e => Math.abs((a.favor[e] || 0) - (a.schools[s].element[e] || 0)) < 0.011);
  const alike = SCHOOLS.every(s => ELEMENTS.every(e => (a.schools[s].element[e] || 0) === (a.schools.扶抑.element[e] || 0)));
  const only = !alike && SCHOOLS.filter(same).length === 1 ? SCHOOLS.find(same) : null;
  return `各派看法：${parts.join("；")}。${tail.length ? `${tail.join("，")}，` : ""}${only ? `本報告依${only}一派取用` : "本報告以各派加權綜合取用"}。`;
}

// ---------- 4 格局與用神 ----------
const whereVisible = (c, group) => stemsWords(visibleOf(c, group).map(x => ({ role: x.role, stem: x.stem })));
// 「食神（日支丑、時支子）」 for the 本氣 and 中氣 of a group.
function whereHidden(c, group) {
  const list = hiddenOf(c, group, ["本氣", "中氣"]);
  return `${uniq(list.map(h => h.god)).join("、")}（${uniq(list.map(h => `${ROLE_ZH[h.role]}支${h.branch}`)).join("、")}）`;
}
// 成格／破格 in simple terms (simplified from 子平真詮): what helps the structure, what is only hidden, what breaks it.
function patternCheck(c) {
  const a = c.a, s = a.strength, pat = a.pattern;
  // A 從 or 專旺 chart is read as that special structure: the ordinary 成格／破格 rules assume a balanced day master.
  if (s === "從弱") return { good: [], hidden: "", bad: [], verdict: `日主從勢，改以從格論：順著最旺的${GROUP_WORD[drainGroup(c)]}走，格局反而清；最怕行運再見印比扶身` };
  if (s === "專旺") return { good: [], hidden: "", bad: [], verdict: "日主一氣獨旺，改以專旺格論：順其旺氣、喜食傷洩秀，最怕官殺逆勢剋制" };
  const vis = g => visibleOf(c, g).length > 0, hid = g => hiddenOf(c, g, ["本氣", "中氣"]).length > 0;
  const okStrength = s === "身強" || s === "中和" || s === "專旺";
  const good = [], hidden = [], bad = [];
  const support = (g, text) => {
    if (vis(g)) good.push(`${whereVisible(c, g)}透出，${text}`);
    else if (hid(g)) hidden.push({ where: whereHidden(c, g), text });
  };
  switch (pat) {
    case "正官格":
      support("財", "財星生官"); support("印", "印星護官");
      if (okStrength) good.push("日主足以任官"); else if (!vis("印")) bad.push("身弱難以任官");
      if (visGod(c, "傷官") && !vis("印")) bad.push("傷官透出剋官（傷官見官）");
      if (visGod(c, "七殺")) bad.push("七殺也透出，官殺混雜");
      break;
    case "七殺格":
      if (visGod(c, "食神")) good.push(`${stemsWords(c.gods.食神.visible)}透出，食神制殺`);
      else if (visGod(c, "傷官")) good.push(`${stemsWords(c.gods.傷官.visible)}透出，傷官駕殺`);
      else if (hid("食傷")) hidden.push({ where: whereHidden(c, "食傷"), text: "制殺" });
      support("印", "印星化殺");
      if (s === "身強") good.push("身強能敵殺");
      if (vis("財") && !vis("食傷") && !vis("印")) bad.push("財星生殺而無制");
      if (isWeak(c) && !vis("印") && !vis("食傷")) bad.push("身弱殺重而無制化");
      if (visGod(c, "正官")) bad.push("正官也透出，官殺混雜");
      break;
    case "正財格": case "偏財格":
      support("食傷", "食傷生財"); support("官殺", "財旺生官");
      if (okStrength) good.push(s === "中和" ? "日主能任財" : "日主身強能任財");
      else if (vis("印") || vis("比劫")) good.push("身弱而有印比相扶，仍能任財");
      else bad.push("財多身弱，力不從心");
      if (vis("比劫") && !vis("官殺")) bad.push("比劫透出，有奪財之憂");
      else if (!vis("比劫")) good.push("比劫不透，財星不被爭奪");
      break;
    case "正印格": case "偏印格":
      support("官殺", "官殺生印");
      if (s === "身弱" || s === "中和") good.push("日主得印生扶");
      if (s === "身強" && vis("財")) good.push("印旺身強，有財星制印");
      if (vis("財") && isWeak(c)) bad.push("財星透出壞印");
      if (pat === "偏印格" && visGod(c, "食神") && !vis("財")) bad.push("偏印與食神同透（梟神奪食）");
      if (s === "身強" && !vis("財") && !vis("食傷")) bad.push("印多身旺而缺少出口");
      break;
    case "食神格":
      support("財", "食神生財");
      if (visGod(c, "七殺")) good.push("食神制殺");
      if (okStrength) good.push("日主能洩");
      if (visGod(c, "偏印") && !vis("財")) bad.push("偏印透出奪食（梟神奪食）");
      if (isWeak(c) && !vis("印")) bad.push("身弱洩氣太過");
      break;
    case "傷官格":
      support("財", "傷官生財");
      if (vis("印") && !isStrong(c)) good.push("傷官佩印");
      if (visGod(c, "正官") && !vis("財") && !vis("印")) bad.push("傷官見官");
      if (isWeak(c) && !vis("印")) bad.push("身弱洩氣太過");
      break;
    case "建祿格": case "月刃格": {
      const lu = pat === "建祿格";
      if (visGod(c, "正官")) good.push(`${stemsWords(c.gods.正官.visible)}透出，${lu ? "建祿用官" : "官星制刃"}`);
      if (visGod(c, "七殺")) good.push(`${stemsWords(c.gods.七殺.visible)}透出，${lu ? "七殺制身" : "陽刃駕殺"}`);
      if (!vis("官殺") && hid("官殺")) hidden.push({ where: whereHidden(c, "官殺"), text: lu ? "制祿" : "制刃" });
      if (vis("食傷")) good.push(`${whereVisible(c, "食傷")}透出，食傷洩秀`);
      if (vis("財") && (vis("食傷") || vis("官殺"))) good.push("財星得用");
      if (!vis("官殺") && !vis("食傷")) bad.push("缺少透出的官殺或食傷來疏導");
      if (vis("比劫") && !vis("官殺")) bad.push("比劫透出而無制");
      break;
    }
    default: break;
  }
  let verdict;
  if (!bad.length) verdict = good.length >= 2 ? (hidden.length ? "屬於成格，行運引出藏干時更能發揮" : "格局清純，屬於成格")
    : good.length ? "格局尚稱完整" : hidden.length ? "格局之氣多藏在地支，成就要靠行運引出" : "格局平淡，成敗多看行運";
  else verdict = good.length || hidden.length ? "成中帶破，屬中等格局，行運補其不足時最能發揮" : "格局受損（俗稱破格），成就更依賴後天努力與行運";
  // A clash on the month branch shakes the structure rather than breaking it: said, but not counted against it.
  if (monthClashed(c)) verdict += "；只是月令受沖，格局根基較易動搖，遇到沖月令的年份要穩住本業";
  const hiddenText = hidden.length ? `${hidden.map(h => h.where).join("與")}${hidden.length > 1 ? "都" : ""}藏而未透，暗有${hidden.map(h => h.text).join("、")}之勢` : "";
  return { good, hidden: hiddenText, bad, verdict };
}

// Each school's reason for liking or disliking an element (null when it has none to give).
function schoolReason(c, school, e, like) {
  const g = c.eg[e], s = c.a.strength, pat = c.a.pattern;
  if (school === "扶抑") {
    if (s === "從弱") return like ? "從弱宜順從旺勢" : "從弱忌逆勢生扶";
    if (s === "專旺") return like ? "專旺宜順其旺氣" : "專旺忌逆勢剋耗";
    const mild = s === "中和" ? "略" : "";
    if (leansStrong(c)) return (like ? { 食傷: `身${mild}強宜洩，食傷洩秀`, 財: `身${mild}強能任財`, 官殺: `身${mild}強宜剋，官殺制身` } : { 比劫: `身${mild}強忌再幫身`, 印: `身${mild}強忌再生身` })[g] || null;
    return (like ? { 印: `身${mild}弱宜生，印星生身`, 比劫: `身${mild}弱宜幫，比劫助身` } : { 食傷: `身${mild}弱忌洩`, 財: `身${mild}弱忌耗`, 官殺: `身${mild}弱忌剋` })[g] || null;
  }
  if (school === "調候") {
    if (like) { const st = (c.a.schools.調候.stems || []).filter(x => STEM_EL[x] === e); return st.length ? `《窮通寶鑑》取${st.join("、")}` : "依季節調候"; }
    return { 水: "冬天水寒，忌再添水", 火: "夏天火燥，忌再添火" }[e] || "依季節調候所忌";
  }
  const reason = ((like ? PATTERN_LIKES : PATTERN_DISLIKES)[pat] || {})[g];
  return `${pat}${like ? "喜" : "忌"}${reason || GROUP_WORD[g]}`;
}
function roleText(c, e) {
  const v = c.a.views[e], role = c.roles[e];
  const fmt = (list, like) => list.map(s => [schoolReason(c, s, e, like), s]).filter(([r]) => r).map(([r, s]) => `${r}（${s}）`);
  if (role === "閒神") {
    const all = [...fmt(v.likes, true), ...fmt(v.dislikes, false)];
    return all.length ? `各派看法互相抵消：${all.join("；")}。` : "各派都沒有明顯的喜忌。";
  }
  const bad = roleIsBad(role);
  const main = fmt(bad ? v.dislikes : v.likes, !bad), other = fmt(bad ? v.likes : v.dislikes, bad);
  return `${main.join("；") || "加權後的取捨"}${other.length ? `；但${other.join("；")}` : ""}。`;
}

function patternSection(c) {
  const { a, dm, de, mb } = c;
  const main = c.P.month.branch.hidden[0];
  const shown = c.pillars.filter(p => p.role !== "day" && p.stem.name === main.name).map(p => p.role);
  const group = groupOf(de, main.element);
  const kin = visibleOf(c, group).filter(x => x.stem !== main.name);
  const own = main.god === "比肩" || main.god === "劫財";
  let s1 = `${mb}月本氣${main.name}${main.element}對${dm}${de}是${main.god}，`;
  // 建祿、月刃: the month holds the day master's own element, so there is nothing to "show"; the structure is read
  // from what controls or drains it.
  if (own) s1 = `${mb}月本氣${main.name}${main.element}和日主同類，是${dm}${de}的${main.god === "比肩" ? "祿（比肩）" : c.a.dayMaster.yang ? "陽刃（劫財）" : "月劫（劫財）"}，取${a.pattern}，成敗要看有沒有官殺制約或食傷疏導`;
  else if (shown.length) s1 += `並透出${rolesWord(shown, "干")}，取${a.pattern}，格局清楚`;
  else if (kin.length) s1 += `本身不透，但同屬${GROUP_WORD[group]}的${uniq(kin.map(x => `${x.stem}${STEM_EL[x.stem]}`)).join("、")}透出${rolesWord(kin.map(x => x.role), "干")}，仍取${a.pattern}`;
  else s1 += `藏而不透，仍取${a.pattern}，只是格局之氣較含蓄`;
  if (!shown.length || own) {
    const alt = c.P.month.branch.hidden.slice(1).find(h => h.god !== main.god && c.pillars.some(p => p.role !== "day" && p.stem.name === h.name));
    if (alt) {
      const roles = c.pillars.filter(p => p.role !== "day" && p.stem.name === alt.name).map(p => p.role);
      s1 += `；月令的${alt.type}${alt.name}${alt.element}（${alt.god}）透出${rolesWord(roles, "干")}，也有流派改取${alt.god === "比肩" ? "建祿格" : alt.god === "劫財" ? "月刃格" : `${alt.god}格`}`;
    }
  }
  s1 += "。";
  const pc = patternCheck(c);
  const parts = [pc.good.join("，"), pc.hidden, pc.bad.length ? `但${pc.bad.join("、")}` : ""].filter(Boolean);
  const s2 = `${parts.length ? `${parts.join("；")}，` : ""}${pc.verdict}。`;

  const u = a.useful, s = a.strength;
  const NEED = { 身強: "身強之局宜洩、宜耗、宜剋", 身弱: "身弱之局宜生、宜扶", 中和: "中和之局重在維持平衡", 從弱: "從弱之局宜順從旺勢、不宜扶身", 專旺: "專旺之局宜順其旺氣、不宜強剋" };
  const byRole = role => ELEMENTS.filter(e => c.roles[e] === role).sort((x, y) => (a.favor[y] || 0) - (a.favor[x] || 0));
  let s3, s4 = "", s5 = "";
  if (u.length) {
    const xi = byRole("喜神"), ji = byRole("忌神"), qiu = byRole("仇神"), xian = byRole("閒神");
    s3 = `${NEED[s] || NEED.中和}：以${u[0]}（${GROUP_WORD[c.eg[u[0]]]}）為用神，${useFunction(c, u[0])}`
      + `${xi.length ? `；${xi.join("、")}為喜神` : ""}${ji.length ? `，${ji.join("、")}為忌神` : ""}`
      + `${qiu.length ? `，${qiu.join("、")}為仇神` : ""}${xian.length ? `，${xian.join("、")}為閒神` : ""}。`;
    const e = u[0], pr = presence(c, e), st = c.states[e];
    const stems = EL_STEMS[e].join("、"), branches = EL_BRANCHES[e].join("、");
    if (pr.vis.length && pr.hid.length) s4 = `用神${e}透出${stemsWords(pr.vis)}，地支也有根（${hiddenBrief(pr.hid)}），有根有苗，在${mb}月處「${st}」。`;
    else if (pr.vis.length) s4 = `用神${e}透出${stemsWords(pr.vis)}，但地支無根，力量較浮，大運流年遇到${branches}時才更穩。`;
    else if (pr.hid.length) s4 = `用神${e}沒有透出天干，只藏在${hiddenBrief(pr.hid)}，有根而未透，大運流年遇到${stems}時最能發揮。`;
    else s4 = `用神${e}在命中不見，是最需要靠大運流年補足的五行，逢${stems}、${branches}的運最為得力。`;
    const verse = (VERSES[dm] || []).find(v => v.when(c));
    if (verse) s5 = `《滴天髓》說${dm}${de}「${verse.line}」，${verse.text}。`;
  } else s3 = `${NEED[s] || NEED.中和}，但各派喜忌互相抵消，五行沒有明顯的用神，取用以平衡為主，行運的影響也較溫和。`;

  const items = [];
  if (u.length) items.push({ label: `用神・${u[0]}（${GROUP_WORD[c.eg[u[0]]]}）`, text: roleText(c, u[0]) });
  for (const role of ["喜神", "忌神", "仇神"]) for (const e of byRole(role)) items.push({ label: `${role}・${e}（${GROUP_WORD[c.eg[e]]}）`, text: roleText(c, e) });
  const xian = byRole("閒神");
  if (xian.length && u.length) items.push({ label: `閒神・${xian.join("、")}`, text: xian.length === 1 ? roleText(c, xian[0]) : xian.length === 2 ? xian.map(e => `${e}：${roleText(c, e)}`).join("") : "這幾個五行各派看法互相抵消，加權後影響不大。" });
  items.push({ label: "調候用神", text: tiaohouText(c) });
  return section("pattern", [s1 + s2, s3 + s4 + s5], items);
}

function tiaohouText(c) {
  const { a, dm, de, mb } = c, th = a.schools.調候, stems = th.stems || [];
  if (!stems.length) return `${th.note}。`;
  const present = [], absent = [];
  for (const s of stems) {
    const vis = c.pillars.filter(p => p.role !== "day" && p.stem.name === s).map(p => p.role);
    const hid = uniq(c.pillars.filter(p => p.branch.hidden.some(h => h.name === s)).map(p => `${ROLE_ZH[p.role]}支${p.branch.name}`));
    if (vis.length) present.push(`${s}${STEM_EL[s]}透出${rolesWord(vis, "干")}`);
    else if (hid.length) present.push(`${s}${STEM_EL[s]}藏在${hid.join("、")}`);
    else absent.push(`${s}${STEM_EL[s]}`);
  }
  const state = [present.join("，"), absent.length ? `${absent.join("、")}命中不見` : ""].filter(Boolean).join("；");
  const hit = stems.find(s => STEM_EL[s] === a.useful[0]), near = stems.find(s => a.useful.includes(STEM_EL[s]));
  const agree = !a.useful.length ? "" : hit ? `其中${hit}${STEM_EL[hit]}正是用神的方向，調候與用神一致。`
    : near ? `其中${near}${STEM_EL[near]}屬喜神，方向相近。` : "調候所需和用神不同，傳統上會在行運中兼顧。";
  return `依《窮通寶鑑》，${dm}${de}生於${mb}月，調候以${stems.join("、")}為要：${state}。${agree}`;
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
    [visGod(c, "七殺") && vis("印") && !isStrong(c), "七殺有印星化解（殺印相生），能把壓力轉成成長，有擔當也有權威感"],
    [visGod(c, "七殺") && visGod(c, "食神"), "食神制住七殺，有智慧化解壓力，越難的局面越能展現能力"],
    [visGod(c, "傷官") && vis("印") && !isStrong(c), "傷官配上印星（傷官佩印），才華有學養約束，適合走專業與學術"],
    [visGod(c, "正官") && visGod(c, "七殺"), "正官、七殺同時透出（官殺混雜），選擇多、方向容易搖擺，宜先定下主軸"],
    [vis("財") && visGod(c, "正官") && !isWeak(c), "財星與正官相生（財官雙美），務實又重名譽，在組織裡容易被重用"],
    [vis("食傷") && vis("財") && !isWeak(c), "食傷生財，腦筋靈活、懂得把想法變成收入"],
    [c.share[c.ge.財] >= HEAVY && isWeak(c), "財多身弱，機會多、壓力也多，容易為責任與金錢操心"],
    [c.share[c.ge.官殺] >= HEAVY && isWeak(c), "官殺重而身弱，責任感強、自我要求高，也容易把壓力往肚裡吞"],
    [c.share[c.ge.比劫] >= HEAVY && isStrong(c), "比劫成群，自我意識與競爭心都強，講義氣也好勝"],
    [c.share[c.ge.印] >= HEAVY && isStrong(c), "印星重而身強，思慮周全、重視安全感，也要提醒自己少一點顧慮、多一點行動"],
    [c.share[c.ge.食傷] >= HEAVY && !isStrong(c), "食傷洩氣重，才華與表達欲旺盛，付出多也容易累，要懂得保留精力"],
  ];
  const hit = list.find(([ok]) => ok);
  return hit ? hit[1] : null;
}
function characterSection(c) {
  const { a, dm, de } = c, info = DAY_MASTER_TEXT[dm];
  const s1 = `${dm}${de}日主，《滴天髓》開篇說「${info.verse}」，性格如${info.image}：${info.nature}。`;
  const s2 = `需要留意的是，${info.blind}。`;
  const ranked = Object.entries(c.counts).sort((x, y) => y[1].weight - x[1].weight || y[1].visible.length - x[1].visible.length);
  const [god, cnt] = ranked[0], t = TEN_GOD_TEXT[god];
  const where = [cnt.visible.length ? `${rolesWord(cnt.visible, "干")}透出` : "", cnt.hidden.length ? `${rolesWord(cnt.hidden, "支")}${cnt.visible.length ? "也有" : "藏有"}` : ""].filter(Boolean).join("，");
  const combo = godCombo(c);
  const s3 = `十神之中${god}最重（${where}），${t.trait}；${combo || (cnt.weight >= 2 ? `但${god}太重時${t.heavy}` : `盲點是${t.blind}`)}。`;
  const db = c.P.day.branch, dg = db.god;
  const s4 = `${a.pattern}的人${PATTERN_TEXT[a.pattern] ? PATTERN_TEXT[a.pattern].nature : "各有所長"}；日坐${db.name}${db.element}${dg}，${TEN_GOD_TEXT[dg].seat}。`;
  const picked = [];
  for (const [star, text] of CHAR_STARS) {
    if (picked.length >= 3) break;
    const w = starWhere(c, star);
    if (w && !picked.some(x => x.text === text)) picked.push({ star, text, where: w });
  }
  const s5 = picked.length ? `神煞方面，${picked.map((x, i) => `${i && picked[i - 1].where === x.where ? "又見" : `${x.where}見`}${x.star}，${x.text}`).join("；")}。` : "";
  return section("character", [s1 + s2, s3 + s4 + s5]);
}

// ---------- 6 六親 ----------
function familySection(c) {
  const { P, dm, de } = c;
  const good = [], bad = [];
  const MEAN_GOOD = { year: "祖上與早年環境有庇蔭", month: "父母與成長環境是助力", day: "配偶能給你助力", hour: "子女與晚年較有福" };
  const MEAN_BAD = { year: "祖上庇蔭有限，早年多靠自己", month: "成長環境的壓力較大", day: "婚姻需要多花心力經營", hour: "子女與晚年的事要多費心" };
  for (const p of c.pillars) {
    const w = favorWord(pillarFavor(c, p)), name = p.role === "day" ? `日支${p.branch.name}` : `${p.label}${p.name}`;
    if (w === "喜") good.push({ p, name }); else if (w === "忌") bad.push({ p, name });
  }
  const meaning = [...good.map(x => MEAN_GOOD[x.p.role]), ...bad.map(x => MEAN_BAD[x.p.role])].join("，") || "六親助力平均，各有往來";
  const lean = [good.length ? `${good.map(x => x.name).join("、")}落在喜用` : "", bad.length ? `${bad.map(x => x.name).join("、")}偏忌` : ""].filter(Boolean).join("，");
  const s1 = `以${dm}${de}日主來看，${lean || "四柱的喜忌大致平均"}：${meaning}。`;
  const s2 = `以十神論六親，${dm}${de}的母親星是${c.ge.印}（正印）、父親星是${c.ge.財}（偏財）、兄弟姊妹是${de}（比劫），`
    + `${c.male ? `妻星是${c.ge.財}（財星）、子女星是${c.ge.官殺}（官殺）` : `夫星是${c.ge.官殺}（官殺）、子女星是${c.ge.食傷}（食傷）`}。`;

  // 父母：正印為母、偏財為父（男女同論）
  const motherGod = hasGod(c, "正印") ? "正印" : hasGod(c, "偏印") ? "偏印" : null;
  const fatherGod = hasGod(c, "偏財") ? "偏財" : hasGod(c, "正財") ? "正財" : null;
  const kinWhere = god => {
    const g = c.gods[god], roots = g.hidden.filter(x => x.type !== "餘氣");
    if (g.visible.length) return `透出${rolesWord(g.visible.map(x => x.role), "干")}${roots.length ? "，地支也有根" : ""}`;
    return `只藏在${uniq(g.hidden.map(x => `${ROLE_ZH[x.role]}支${x.branch}`)).join("、")}中`;
  };
  let mother, father;
  if (motherGod) {
    const role = c.roles[c.ge.印];
    mother = `母親星${motherGod === "偏印" ? "以偏印代" : "正印"}（${c.ge.印}）${kinWhere(motherGod)}，${visGod(c, motherGod) ? "母親的照顧與影響明顯" : "母親的影響較含蓄"}`
      + (roleIsGood(role) ? "；印星是喜用，母親的支持對你幫助很大。" : roleIsBad(role) ? `；但印星屬${role}，母親的關愛有時會變成壓力或過度保護，彼此保留空間更好。` : "。");
  } else mother = `命中不見印星（${c.ge.印}），和母親各有各的生活重心，靠自己的時候多。`;
  if (fatherGod) {
    const role = c.roles[c.ge.財];
    father = `父親星${fatherGod === "正財" ? "以正財代" : "偏財"}（${c.ge.財}）${kinWhere(fatherGod)}，${visGod(c, fatherGod) ? "父親在你成長中的角色鮮明" : "父親的角色較低調，相處時間可能較少"}`
      + (c.share[c.ge.比劫] >= 0.3 && !visGod(c, fatherGod) ? "，比劫又重，傳統上說父親較辛勞" : "")
      + (roleIsGood(role) ? "；財星是喜用，父親對你仍有實質的支持。" : roleIsBad(role) ? `；財星屬${role}，和父親在觀念與金錢上宜多溝通。` : "。");
  } else father = `命中不見財星（${c.ge.財}），和父親的緣分較淡，或相處時間較少。`;

  // 兄弟：比劫與月柱
  const bjVis = visibleOf(c, "比劫"), bjHid = hiddenOf(c, "比劫"), bjRole = c.roles[de];
  const bjMain = bjHid.filter(x => x.type === "本氣");
  const siblings = `${bjVis.length ? `比劫透出${stemsWords(bjVis)}，兄弟姊妹或朋友在你生命中份量不輕`
    : bjMain.length ? `比劫藏在${uniq(bjMain.map(x => x.branch)).join("、")}的本氣，手足緣分不淺，只是各有各的發展`
      : bjHid.length ? `比劫只藏在${uniq(bjHid.map(x => x.branch)).join("、")}中，兄弟姊妹各自獨立，助力有限` : "命中不見比劫，凡事多靠自己，和手足各忙各的"}`
    + `${roleIsGood(bjRole) ? "；比劫是喜用，手足與朋友是助力，合作共事有好處。" : roleIsBad(bjRole) ? `；比劫屬${bjRole}，和手足、朋友合夥或有金錢往來時，要先把話講清楚。` : "。"}`;

  // 配偶：日支與配偶星（婚姻感情一節再細看）
  const star = c.male ? "財" : "官殺", starEl = c.ge[star], starRole = c.roles[starEl];
  const starGods = GROUP_GODS[star].filter(g => hasGod(c, g));
  const spouse = `配偶宮日支${P.day.branch.name}坐${P.day.branch.god}，${SPOUSE_BY_GOD[P.day.branch.god]}；`
    + (starGods.length ? `${c.male ? "妻星" : "夫星"}${starGods.join("、")}（${starEl}）${roleIsGood(starRole) ? "是喜用，另一半能帶給你實質的幫助" : roleIsBad(starRole) ? "偏忌，兩人需要在相處中多磨合" : "平穩，相處貴在互相體諒"}。`
      : `${c.male ? "妻星" : "夫星"}（${starEl}）在命中不顯，緣分可能來得較晚，或需要自己主動經營。`);

  // 子女：時柱；男命官殺、女命食傷
  const kid = c.male ? "官殺" : "食傷", kidEl = c.ge[kid], kidGods = GROUP_GODS[kid].filter(g => hasGod(c, g)), kidRole = c.roles[kidEl];
  const kidStar = `${c.male ? "男命以官殺" : "女命以食傷"}為子女星，${kidGods.length ? `${kidGods.join("、")}（${kidEl}）${kidGods.some(g => visGod(c, g)) ? "透出天干，與子女的緣分明朗" : "藏而不透，與子女的緣分需要時間經營"}` : `${kidEl}在命中不顯，子女緣來得較晚或子女較少`}${roleIsGood(kidRole) ? "，子女星是喜用，日後子女是你的助力" : ""}`;
  let children;
  if (P.hour) {
    const hs = c.roles[P.hour.stem.element], hb = c.roles[P.hour.branch.element];
    const flow = roleIsBad(hs) && roleIsGood(hb) ? "先難後易，晚年漸入佳境" : roleIsGood(hs) && roleIsBad(hb) ? "先易後難，晚年宜早作安排"
      : roleIsGood(hs) && roleIsGood(hb) ? "晚年較有福氣" : roleIsBad(hs) && roleIsBad(hb) ? "養育子女要多花心力，晚年宜自己預作安排" : "晚年平穩";
    children = `${kidStar}；時柱${P.hour.name}（時干屬${hs}、時支屬${hb}），${flow}。`;
  } else children = `時辰不詳，子女宮無法細看，只從子女星論：${kidStar}。`;

  const items = [
    { label: "父母", text: mother + father }, { label: "兄弟姊妹", text: siblings },
    { label: "配偶", text: spouse }, { label: "子女", text: children },
  ];
  return section("family", [s1 + s2], items);
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
  const { a, dm, de } = c, pt = PATTERN_TEXT[a.pattern];
  const s1 = pt ? `${dm}${de}${a.pattern}的人${pt.nature}，傳統上適合${pt.careers.join("、")}等工作。`
    : `${dm}${de}日主以${a.pattern}論，選擇工作時宜順著用神的五行與自己的專長。`;
  const drivers = ["官殺", "食傷", "財", "印", "比劫"].filter(g => visibleOf(c, g).length).sort((x, y) => c.share[c.ge[y]] - c.share[c.ge[x]]).slice(0, 2);
  const shownAs = g => { const v = visibleOf(c, g); return `${GROUP_WORD[g]}${uniq(v.map(x => `${x.stem}${STEM_EL[x.stem]}`)).join("、")}透出${rolesWord(v.map(x => x.role), "干")}`; };
  const s2 = drivers.length ? `${drivers.map(g => `${shownAs(g)}，${DRIVER[g]}`).join("；")}。` : "命中十神多藏而不透，做事低調務實，實力要靠時間慢慢被看見。";
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
  const way = own >= job + 2 ? "具備自己開創的條件，適合創業、自營，或在組織裡擔任開疆闢土的角色"
    : job >= own + 2 ? "較適合在穩定的組織裡發揮專業、按部就班升遷；若想創業，宜先累積資源與人脈"
      : "受雇與自營都可行：前期在組織裡累積實力，等資源與時機成熟再考慮自立";
  const stars = CAREER_STARS.map(([star, text]) => [star, text, starWhere(c, star)]).filter(x => x[2]).slice(0, 2);
  const s3 = `整體而言，${way}${stars.length ? `；${stars.map(([star, text, w]) => `${w}見${star}，${text}`).join("，")}` : ""}。`;
  const items = a.useful.slice(0, 3).map((e, i) => ({ label: `${i ? "喜神" : "用神"}・${e}`, text: `${ELEMENT_INDUSTRIES[e].join("、")}。` }));
  if (!items.length) items.push({ label: "五行行業", text: "命局喜忌不明顯，選擇行業時可以興趣與專長為主。" });
  return section("career", [s1 + s2 + s3], items);
}

// ---------- 8 財運 ----------
function wealthSection(c) {
  const { a, dm, de } = c, ce = c.ge.財;
  const g = god => c.gods[god] || { visible: [], hidden: [] };
  const desc = god => {
    const { visible: v, hidden: h } = g(god);
    if (v.length) return `${god}${uniq(v.map(x => `${x.stem}${STEM_EL[x.stem]}`)).join("、")}透出${rolesWord(v.map(x => x.role), "干")}`;
    return h.length ? `${god}${uniq(h.map(x => `${x.stem}${STEM_EL[x.stem]}`)).join("、")}藏在${uniq(h.map(x => `${ROLE_ZH[x.role]}支${x.branch}`)).join("、")}中` : "";
  };
  const both = [desc("正財"), desc("偏財")].filter(Boolean);
  const pr = presence(c, ce);
  const power = pr.vis.length && pr.hid.length ? "財星有根有苗" : pr.vis.length ? "財星透而無根，來得快也去得快" : pr.hid.length ? "財星藏而不透，屬於暗財，宜穩紮穩打" : "財星不顯";
  const s1 = `${dm}${de}以${ce}為財星：${both.length ? `${both.join("，")}，在${c.mb}月處「${c.states[ce]}」，${power}` : `命中不見${ce}，${power}，財富多靠專業與機運引出`}。`;
  const strongEnough = isStrong(c) || a.strength === "中和";
  const s2 = a.strength === "從弱" ? (a.useful.includes(ce) ? "從格順勢，財星為用時反而能借勢得財。" : "從格順勢，財富宜跟著大環境走，不宜逆勢硬拚。")
    : a.strength === "專旺" ? "專旺之局不宜強求財，靠專業與名聲帶財較順。"
      : strongEnough && c.share[ce] >= 0.2 ? `日主${a.strength === "中和" ? "強弱適中" : "身強"}，擔得起財，屬於「身財兩停」，財富靠能力穩步累積。`
        : strongEnough ? "日主有力而財星偏弱，有能力卻要自己開創財源，越主動越有收穫。"
          : c.share[ce] >= 0.3 ? "財多身弱，機會多但壓力也大，宜量力而為，借重團隊或專業。"
            : "身弱財也不旺，宜以專業技能換取穩定收入，不宜冒進。";
  const zw = (c.counts.正財 || {}).weight || 0, pw = (c.counts.偏財 || {}).weight || 0;
  const zv = g("正財").visible.length, pv = g("偏財").visible.length;
  const kind = zv && pv ? "正偏財並透，收入來源多元，也要避免分散"
    : zw > pw ? "正財重於偏財，宜靠薪資、本業與長期投資累積" : pw > zw ? "偏財重於正財，生意、投資與業外收入的機會多，也要設好停損"
      : zw ? "正偏財份量相當，收入有固定的一份，也有機會財" : "正偏財不顯，財源以穩定工作為主";
  const tomb = TOMB[ce], tombAt = c.pillars.filter(p => p.branch.name === tomb);
  const tombClash = tombAt.length && c.relations.some(r => r.kind === "六沖" && r.roles.some(role => c.P[role].branch.name === tomb));
  const ku = tombAt.length ? `命帶財庫（${rolesWord(tombAt.map(p => p.role), "支")}${tomb}），有存錢、置產的本能${tombClash ? (isStrong(c) ? "；財庫逢沖，身強沖開財庫，反而有大筆進帳的機會" : "；財庫逢沖，容易財來財去，宜把錢放在不易動用的地方") : ""}`
    : `${ce}的財庫在${tomb}，命中沒有，存錢要靠紀律而不是本能`;
  const s3 = `${kind}；${ku}。`;
  const bjVis = visibleOf(c, "比劫").length > 0, bjRole = c.roles[de];
  const keep = bjVis && roleIsBad(bjRole) && (hasGod(c, "正財") || hasGod(c, "偏財")) ? "比劫透出又屬忌，合夥、借貸與作保要格外謹慎，財務最好和朋友分開"
    : bjVis && roleIsGood(bjRole) ? "比劫為喜，和朋友、夥伴合作反而能共同生財"
      : c.share[ce] >= 0.3 && isWeak(c) ? "守財的關鍵是量入為出，以穩健的工具累積"
        : visibleOf(c, "食傷").length && strongEnough ? "最適合把技術、口碑與作品變成收入"
          : zw >= pw ? "最適合自動轉存、定期定額這類「先存再花」的做法，讓收入慢慢累積成資產" : "投資宜設停損、獲利落袋為安，別讓偏財來得快也去得快";
  return section("wealth", [s1 + s2, `${s3}${keep}。`]);
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
  const { a, P, dm, de } = c, db = P.day.branch;
  const s1 = `日支${db.name}是配偶宮，坐${db.god}、星運「${P.day.terrain}」：${SPOUSE_BY_GOD[db.god]}；${TERRAIN_TEXT[P.day.terrain].spouse}。`;
  // 配偶星
  const star = c.male ? "財" : "官殺", el = c.ge[star], word = c.male ? "妻星" : "夫星";
  const vis = visibleOf(c, star), hid = hiddenOf(c, star), role = c.roles[el];
  let s2 = `${c.male ? "男命" : "女命"}的配偶星是${GROUP_WORD[star]}，${dm}${de}的${word}是${el}：`;
  if (vis.length) s2 += `${stemsWords(vis)}透出${hid.length ? "、地支有根" : "但地支無根"}，${word}${hid.length ? "明朗有力" : "明顯而力量偏浮"}`;
  else if (hid.length) s2 += `藏在${uniq(hid.map(x => `${ROLE_ZH[x.role]}支${x.branch}`)).join("、")}中、不透天干，感情較含蓄，緣分需要時間醞釀`;
  else s2 += "命中不見，緣分可能來得較晚，需要自己多主動";
  const issues = [];
  if (c.male && visGod(c, "正財") && visGod(c, "偏財")) issues.push("正偏財並透，異性緣佳，感情上要專一");
  if (c.male && visibleOf(c, "比劫").length && (vis.length || hid.length) && roleIsBad(c.roles[de])) issues.push("比劫透出爭財，感情裡要防朋友或第三者介入");
  if (!c.male && visGod(c, "正官") && visGod(c, "七殺")) issues.push("官殺並透，追求者多，宜慎選、不急著定下來");
  if (!c.male && visGod(c, "傷官") && hasGod(c, "正官")) issues.push("傷官見官，對另一半要求高，相處時宜多欣賞、少挑剔");
  if (c.share[el] >= HEAVY && isWeak(c)) issues.push(`${word}太重而日主弱，容易在感情中委屈自己，宜保持自我`);
  s2 += issues.length ? `；${issues.join("；")}。` : "。";
  // 日支與其他柱的關係
  // The day branch's relations, one clause per kind (a 三刑 replaces its pairs).
  const own = c.relations.filter(r => r.part === "branch" && r.roles.includes("day"));
  const tri = own.some(r => r.kind === "三刑");
  const withWhom = kind => uniq(own.filter(r => r.kind === kind).flatMap(r => r.roles.filter(x => x !== "day"))).sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
  const others = kind => withWhom(kind).map(x => `${ROLE_ZH[x]}支${P[x].branch.name}`).join("、");
  const REL_LOVE = {
    六合: () => `日支與${others("六合")}六合，夫妻感情有黏著力${withWhom("六合").includes("hour") ? "，也重視家庭與孩子" : ""}`,
    半合: () => `日支與${others("半合")}半合，兩人容易有共同目標`,
    拱合: () => `日支與${others("拱合")}拱合，感情裡暗中有互相成全的力量`,
    三合: () => "日支參與三合局，夫妻之間凝聚力強",
    三會: () => "日支參與三會局，家庭觀念重",
    六沖: () => `日支與${others("六沖")}相沖，感情與居住較多變動，宜多溝通、給彼此空間`,
    相刑: () => (tri ? "" : `日支與${others("相刑")}相刑，相處中容易有摩擦，宜多包容`),
    自刑: () => "日支自刑，感情裡容易自尋煩惱，想法說出來就好",
    三刑: () => "日支捲入三刑，相處中容易有摩擦，要特別多些耐心",
    六害: () => `日支與${others("六害")}相害，要防誤會累積`,
    相破: () => `日支與${others("相破")}相破，${withWhom("相破").includes("year") ? "和長輩之間要多體諒" : withWhom("相破").includes("month") ? "和原生家庭之間要多協調" : "小事要及時溝通"}`,
  };
  const rel = uniq(own.map(r => r.kind)).map(k => (REL_LOVE[k] || (() => ""))()).filter(Boolean);
  // The palace (日支) and the star can disagree: the person helps while the marriage itself needs work, or the reverse.
  const palace = c.roles[db.element], pGood = roleIsGood(palace), pBad = roleIsBad(palace), sGood = roleIsGood(role), sBad = roleIsBad(role);
  const blend = pBad && sGood ? `配偶宮${db.name}${db.element}屬${palace}、${word}卻是喜用：另一半本身有助力，婚姻的課題在相處模式`
    : pGood && sBad ? `配偶宮為喜而${word}偏忌：婚姻生活本身和樂，另一半的個性需要磨合`
      : pGood && sGood ? `配偶宮與${word}都是喜用，婚姻是你的助力`
        : pBad && sBad ? `配偶宮與${word}都偏忌，感情需要比別人多一分經營，找到對的相處節奏就能穩定`
          : sGood ? `${word}是${role}，另一半對你有助益` : sBad ? `${word}屬${role}，感情裡的拉扯要用溝通化解`
            : pGood ? `配偶宮${db.name}${db.element}屬喜用，婚姻生活是你的避風港` : pBad ? `配偶宮${db.name}${db.element}屬${palace}，婚姻需要多花心力經營` : "";
  const s3 = `${[...rel, blend].filter(Boolean).join("；") || "日支在命局中沒有合沖刑害，感情結構單純穩定"}。`;
  const u0 = a.useful[0];
  const s4 = `適合${PARTNER[db.god] || "互相體諒"}的伴侶${u0 ? `；從五行看，個性${ELEMENT_LUCK[u0].trait}、或八字${u0}旺的人，較能補足你` : ""}。`;
  const items = [];
  const peach = starWhere(c, "桃花");
  if (peach) {
    const inner = ["day", "hour"].some(r => (c.stars[r] || []).includes("桃花")), outer = ["year", "month"].some(r => (c.stars[r] || []).includes("桃花"));
    items.push({ label: `桃花（${peach}）`, text: `${[inner ? "日、時見桃花稱「牆內桃花」，異性緣多能用在經營婚姻上" : "", outer ? "年、月見桃花稱「牆外桃花」，社交圈廣、異性緣好，婚後宜保持分寸" : ""].filter(Boolean).join("；")}。` });
  }
  for (const [star2, text] of Object.entries(LOVE_STARS)) {
    const w = starWhere(c, star2);
    if (w) items.push({ label: `${star2}（${w}）`, text: `${text}。` });
  }
  const combine = SIX_COMBINE[db.name], triad = [...TRIADS.find(t => t.includes(db.name))].filter(b => b !== db.name);
  const hong = branchesWithStar(c, "紅鸞"), xi = branchesWithStar(c, "天喜");
  items.push({ label: "感情較有進展的年份", text: `流年逢${word}（${EL_STEMS[el].join("、")}年或${EL_BRANCHES[el].join("、")}年），流年地支逢${combine}（與日支六合）或${triad.join("、")}（與日支三合），以及紅鸞${hong.length ? `（${hong.join("、")}）` : ""}、天喜${xi.length ? `（${xi.join("、")}）` : ""}之年，感情較容易有進展；實際年份請看流年詳批。` });
  return section("marriage", [s1 + s2, s3 + s4], items);
}

// ---------- 10 健康 ----------
function healthSection(c) {
  const { a, dm, de } = c;
  const order = ELEMENTS.slice().sort((x, y) => a.scores[x] - a.scores[y]);
  const weak = order[0], strong = order[4], ji = a.avoid[0];
  const where = e => { const pr = presence(c, e); return pr.vis.length ? `只透出${stemsWords(pr.vis)}` : pr.hid.length ? `只藏在${uniq(pr.hid.map(x => x.branch)).join("、")}中` : "命中不見"; };
  const weakWhat = weak === de ? `除了日主本身，${weak}${where(weak).replace(/^只/, "也只")}，是全局最弱的一環` : `${weak}最弱（${where(weak)}）`;
  const s1 = `傳統說法以五行對應臟腑。這張${dm}${de}命盤${weakWhat}，${weak}主${ELEMENT_ORGANS[weak].organs}，平時宜多保養：${ELEMENT_ORGANS[weak].care}；${SEASON_OF[CONTROLLED_BY[weak]]}${CONTROLLED_BY[weak]}旺剋${weak}時尤其要留意。`;
  const s2 = c.share[strong] >= 0.3 ? `${strong}最旺（約 ${pct(c.share[strong])}），${strong}主${ELEMENT_ORGANS[strong].organs}，過旺也是負擔，${ELEMENT_ORGANS[strong].care}。` : "";
  const s3 = ji && ji !== weak && ji !== strong ? `忌神${ji}當令的${SEASON_OF[ji]}，作息宜放慢，${ELEMENT_ORGANS[ji].organs}方面多照顧。` : "";
  return section("health", [`${s1}${s2}${s3}以上是傳統說法，身體狀況請以醫師診斷為準。`]);
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
function adviceSection(c, adv) {
  const { a, dm, de } = c, yb = c.P.year.branch.name, db = c.P.day.branch.name;
  const base = a.useful.length ? `這張${dm}${de}命盤開運以用神${a.useful[0]}為主${a.useful.length > 1 ? `，喜神${listWords(a.useful.slice(1))}為輔` : ""}${a.avoid.length ? `，忌神${a.avoid[0]}不宜過多` : ""}。`
    : `這張${dm}${de}命盤喜忌不明顯，開運以補足最弱的${adv.elements[0]}為主。`;
  const animals = b => { const f = friendsOf(b); return { triad: listWords(f.triad.map(x => ZODIAC_ANIMAL[x])), combine: ZODIAC_ANIMAL[f.combine] }; };
  const fy = animals(yb), fd = animals(db);
  const zod = yb === db ? `生肖方面，與年、日支${yb}三合的${fy.triad}、六合的${fy.combine}，較容易投緣。`
    : `生肖方面，與年支${yb}三合的${fy.triad}、六合的${fy.combine}，以及與日支${db}三合的${fd.triad}、六合的${fd.combine}，較容易投緣。`;
  const tag = e => `（${e}）`;
  const avoidColor = a.avoid.length ? `；忌神${a.avoid[0]}的${ELEMENT_LUCK[a.avoid[0]].colors.join("、")}色不宜大面積使用` : "";
  const items = [
    { label: "顏色", text: `${adv.elements.map(e => `${ELEMENT_LUCK[e].colors.join("、")}${tag(e)}`).join("，")}${avoidColor}。` },
    { label: "方位", text: `${adv.elements.map(e => `${ELEMENT_LUCK[e].direction}${tag(e)}`).join("，")}，求學、工作或居家擺設可多往這些方向。` },
    { label: "數字", text: `${adv.elements.map(e => `${ELEMENT_LUCK[e].numbers.join("、")}${tag(e)}`).join("，")}，取自河圖數，可用在車牌、門牌或密碼等小地方。` },
    { label: "行業", text: `${adv.industries.join("、")}。` },
    { label: "生活習慣", text: `${adv.habits.join("；")}。` },
  ];
  return section("advice", [base + zod], items);
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
    title: "八字命理詳批",
    basics: basics(c),
    table: table(c),
    sections,
    advice: adv,
    notes: (chart.warnings || []).map(w => w.text),
    disclaimer: DISCLAIMER,
  };
}
