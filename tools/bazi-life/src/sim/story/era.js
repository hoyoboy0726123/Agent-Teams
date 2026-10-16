// 時代事件：1950 年以後台灣發生的大事，依主角那一年的年紀、住的地方和工作，寫成身邊看得到的樣子。
//
// Each happens at most once, in its own year (p = 1 when the condition holds, or a share of people when only some
// were touched). Only facts with well-known dates are used, and the wording stays with what a person saw at home,
// at school or at work; no opinions about politics. These events change mood and a little money only.
import { regionOf } from "../world.js";

const at = (year, ages, more = () => true) => s => s.year === year && s.age >= ages[0] && s.age <= ages[1] && !s.abroad && more(s);
const field = s => (s.job ? s.job.field : "");

export const ERA = [
  {
    id: "e_1959flood", once: true, when: at(1959, [3, 90], s => ["central", "south"].includes(regionOf(s.county))), p: () => 0.6,
    apply: (s, ctx) => ({ text: ctx.w(["八七水災，{大水淹進家裡，|雨下了好幾天，}{全家搬到樓上躲水。|退水後，牆上留著一條泥巴線。}", "那年八月的大水，你記得{大人們整夜把家具往高處搬。|鄰居划著木盆來救人。}"]), mood: -4 }),
  },
  {
    id: "e_1968school", once: true, when: at(1968, [12, 13], s => s.edu === "國小" || s.edu === "國中"), p: () => 1,
    apply: (s, ctx) => ({ text: ctx.w(["那年開始實施九年國民教育，你{不用考初中聯考，就直接上國中。|成了第一批國中生。}", "九年國教上路，{學校操場邊多了幾間新教室。|你們這一屆不用再擠初中聯考。}"]), mood: 2 }),
  },
  {
    id: "e_1971un", once: true, when: at(1971, [10, 90]), p: () => 0.5,
    apply: (s, ctx) => ({ text: ctx.w(["那年秋天，收音機一直在播退出聯合國的新聞，{大人們的臉色都很凝重。|爸爸聽完新聞，默默抽了一根菸。}", "退出聯合國的那幾天，{學校的升旗典禮特別嚴肅。|街上的人都在談這件事。}"]), mood: -1 }),
  },
  {
    id: "e_1973oil", once: true, when: at(1974, [15, 90]), p: () => 0.6,
    apply: (s, ctx) => { s.savings = Math.max(0, s.savings - 0.05); return { text: ctx.w(["石油危機，{油價和米價一起漲，|什麼都在漲，}{家裡的菜錢不夠用了。|媽媽開始算著錢買菜。}", "物價漲得很兇，{你的薪水好像一下子變薄了。|連一碗陽春麵都漲價了。}"]), mood: -2 }; },
  },
  {
    id: "e_1975funeral", once: true, when: at(1975, [6, 90]), p: () => 0.5,
    apply: (s, ctx) => ({ text: ctx.w(["那年四月，蔣中正過世，{大家都配戴著黑紗。|電視台停播了娛樂節目。}", "全國哀悼的那一個月，{娛樂節目都停了。|街上安靜了好一陣子。}"]), mood: -1 }),
  },
  {
    id: "e_1979travel", once: true, when: at(1979, [20, 70], s => s.savings >= 1), p: () => 0.15,
    apply: (s, ctx) => { s.savings = Math.max(0, s.savings - 0.2); return { text: ctx.w(["政府開放出國觀光，你跟著旅行團去了{日本|香港|泰國}，{第一次坐飛機，緊張得一直握著扶手。|帶回來的伴手禮讓鄰居羨慕好久。}"]), mood: 5 }; },
  },
  {
    id: "e_1979ties", once: true, when: at(1979, [12, 90]), p: () => 0.4,
    apply: (s, ctx) => ({ text: ctx.w(["那年元旦，美國和台灣斷交，{電視上一直在播這個新聞。|大人們在巷口議論了好幾天。}"]), mood: -1 }),
  },
  {
    id: "e_1985lottery", once: true, domain: "wealth", channel: "change", when: s => s.year >= 1985 && s.year <= 1988 && s.age >= 20 && s.age <= 70 && !s.abroad, p: () => 0.12,
    choice: (s, ctx) => ({
      prompt: "「大家樂」簽賭風靡全台，同事們天天在研究明牌。你要跟嗎？",
      options: [
        { id: "e_1985lottery.no", label: "不碰", hint: "賭博不是好事", act: "save", style: "safe", weight: 0.5, apply: () => ({ text: "大家樂正熱的時候，同事都在求明牌，你一張也沒簽。", mood: 0 }) },
        { id: "e_1985lottery.little", label: "小玩一下", hint: "湊個熱鬧", act: "lottery", style: "social", weight: 0.3, apply: s2 => { s2.savings = Math.max(0, s2.savings - 0.03); return { text: ctx.w("大家樂正熱，你也跟著簽了幾次，{一次都沒中。|中過一次小的，請同事吃了宵夜。}"), mood: 1 }; } },
        { id: "e_1985lottery.temple", label: "跟著去廟裡求明牌", hint: "看看熱鬧", act: "spiritual", style: "risk", weight: 0.1, apply: () => ({ text: "大家樂正熱，你跟同事半夜去廟裡求明牌，那裡擠滿了人。", mood: 1 }) },
        { id: "e_1985lottery.big", label: "下重本", hint: "可能大賺，也可能大賠", act: "lottery", style: "risk", weight: 0.1, apply: (s2, c) => { if (c.rng() < 0.08) { s2.savings += 1.5; return { text: "大家樂正熱，你下了重本，竟然真的中了一筆。", mood: 8 }; } s2.savings = Math.max(0, s2.savings - 0.5); return { text: "大家樂正熱，你下了重本，結果賠掉好幾個月的薪水。", mood: -6 }; } },
      ],
    }),
  },
  {
    id: "e_1987martial", once: true, when: at(1987, [15, 90]), p: () => 0.5,
    apply: (s, ctx) => ({ text: ctx.w(["那年七月解除戒嚴，{報紙上的字好像變多了。|大家說話的聲音好像大了一點。}", "解嚴的那個夏天，{你在電視上看著新聞，覺得有什麼不一樣了。|家裡的長輩聊天聊到很晚。}"]), mood: 1 }),
  },
  {
    id: "e_1987visit", once: true, when: s => s.year === 1988 && s.age >= 30 && !s.abroad, p: () => 0.08,
    apply: (s, ctx) => ({ text: ctx.w(["開放大陸探親後，{家裡的長輩|隔壁的伯伯}帶著大包小包回老家，{四十年沒見的親人在機場抱頭痛哭。|回來時說老家全變了。}"]), mood: 1 }),
  },
  {
    id: "e_1990stocks", once: true, domain: "wealth", channel: "bad", when: s => s.year === 1990 && s.age >= 25 && s.savings >= 0.5 && !s.abroad, p: () => 0.25,
    apply: (s, ctx) => { s.savings = Math.max(0, s.savings - Math.min(1, s.savings * 0.35)); return { text: ctx.w(["股市從一萬兩千多點崩到兩千多點，{你跟著大家買的股票套牢了。|號子裡有人當場哭出來。}", "那年股市大崩盤，{帳面上的錢少了一大半。|你發誓再也不聽明牌。}"]), mood: -7 }; },
  },
  {
    id: "e_1995nhi", once: true, when: at(1995, [0, 100]), p: () => 0.5,
    apply: (s, ctx) => ({ text: ctx.w(s.age < 12 ? ["那年開始有全民健保，{媽媽說以後帶你看醫生不用再那麼心疼了。|你拿到一張印著自己名字的健保卡。}"] : ["全民健保開辦，{看醫生只要付掛號費，|爸媽終於肯去看拖了很久的病，}{大家都說這是好事。|你把健保卡收進皮夾。}"]), mood: 1 }),
  },
  {
    id: "e_1996vote", once: true, when: at(1996, [20, 100]), p: () => 0.8,
    apply: (s, ctx) => ({ text: ctx.w(["那年三月第一次總統直選，{你拿著身分證去投票，|全家一起去投票所，}{排隊時心裡有點激動。|蓋完章還特地看了一下指頭上的印泥。}"]), mood: 2 }),
  },
  {
    id: "e_1999quake", once: true, when: at(1999, [2, 100]), p: () => 1,
    apply: (s, ctx) => {
      const near = ["central"].includes(regionOf(s.county));
      if (near) { s.savings = Math.max(0, s.savings - 0.3); return { text: ctx.w(["九二一大地震那晚，{家裡的牆裂了一條大縫，|整棟房子搖得像要倒下來，}全家人{抱著棉被跑到空地上，|在車上睡了好幾個晚上，}{餘震一直沒停。|天亮後才敢回去拿東西。}"]), mood: -8, big: true }; }
      return { text: ctx.w(["九二一大地震那晚，{你被搖醒，|停電了，}{整晚聽著收音機裡的消息。|第二天，全台都在看中部的新聞。}", "九二一大地震後，{你捐了一些錢和物資到災區。|公司組隊去中部幫忙清理。}"]), mood: -3 };
    },
  },
  {
    id: "e_2001nari", once: true, when: at(2001, [3, 100], s => ["臺北市", "新北市", "基隆市"].includes(s.county)), p: () => 0.5,
    apply: (s, ctx) => ({ text: ctx.w(["納莉颱風把台北淹成一片，{捷運站變成水池，|騎樓的水淹到膝蓋，}{你停課停班了好幾天。|水退了以後，街上堆滿泡水的家具。}"]), mood: -3 }),
  },
  {
    id: "e_2003sars", once: true, when: at(2003, [3, 100]), p: () => 1,
    apply: (s, ctx) => {
      if (field(s) === "醫療") return { text: ctx.w(["SARS 爆發，你在醫院上班，{穿著悶熱的防護衣值班，|好幾個星期不敢回家，}{家人每天打電話問你還好嗎。|那是你最害怕、也最驕傲的一段日子。}"]), mood: -5, big: true };
      return { text: ctx.w(["SARS 那年，{每天進學校都要量體溫。|搭捷運的人都戴著口罩。}{大家見面都不握手了。|有一陣子連聚餐都取消了。}", "SARS 那個春天，{量體溫成了每天的例行公事。|口罩和酒精一下子被搶光。}"]), mood: -2 };
    },
  },
  {
    id: "e_2004taipei101", once: true, when: at(2004, [8, 80], s => s.county === "臺北市" || s.county === "新北市"), p: () => 0.2,
    apply: (s, ctx) => ({ text: ctx.w(["那年跨年，台北 101 第一次放煙火，{你和朋友在信義區擠了好幾個小時，|你在電視前跟著倒數，}{煙火從大樓一層一層炸開。|大家一起尖叫。}"]), mood: 3 }),
  },
  {
    id: "e_2005carddebt", once: true, domain: "wealth", channel: "bad", when: s => (s.year === 2005 || s.year === 2006) && s.age >= 20 && s.age <= 45 && s.savings < 0.3 && !s.abroad, p: () => 0.06,
    apply: (s, ctx) => { s.debt += 0.3; return { text: ctx.w(["卡債風暴那幾年，{你的信用卡和現金卡越刷越多，|一張卡繳另一張卡，}{每個月的利息就吃掉一大半薪水。|銀行的催繳電話讓你不敢接手機。}"]), mood: -5 }; },
  },
  {
    id: "e_2007hsr", once: true, when: at(2007, [10, 90]), p: () => 0.25,
    apply: (s, ctx) => ({ text: ctx.w(["高鐵通車了，{你第一次只花一個半小時就從北部到了高雄。|回老家的時間少了一大半。}{你在車上看著窗外的稻田飛過去。|便當還沒吃完就到了。}"]), mood: 2 }),
  },
  {
    id: "e_2008crisis", once: true, domain: "career", channel: "bad", when: s => (s.year === 2008 || s.year === 2009) && s.employed && ["製造", "科技"].includes(field(s)) && !s.abroad, p: () => 0.35,
    apply: (s, ctx) => { s.income *= 0.92; return { text: ctx.w(["金融海嘯，公司開始放無薪假，{你一個月只上兩個星期的班。|薪水少了一截，你開始帶便當。}", "金融海嘯那年，{訂單一夕之間不見了，|工廠的機台停了一半，}{公司要大家輪流放無薪假。|你每天都擔心下一個被裁的是自己。}"]), mood: -6 }; },
  },
  {
    id: "e_2009morakot", once: true, when: at(2009, [3, 100], s => ["south", "east"].includes(regionOf(s.county))), p: () => 0.6,
    apply: (s, ctx) => ({ text: ctx.w(["莫拉克颱風帶來八八水災，{山上的路斷了好幾段，|雨下了三天三夜，}{電視上的畫面讓你整晚睡不著。|你跟著教會和社區去災區送物資。}"]), mood: -4 }),
  },
  {
    id: "e_2009grad22k", once: true, when: s => s.year >= 2009 && s.year <= 2012 && s.age >= 22 && s.age <= 25 && s.employed && s.job && s.job.since === s.age, p: () => 0.5,
    apply: (s, ctx) => ({ text: ctx.w(["剛畢業那年，大家都在說「22K」，{你的起薪也差不多，|扣掉房租和吃飯就所剩無幾，}{爸媽說他們那時候也是這樣熬過來的。|你開始記帳，每一筆都算得很仔細。}"]), mood: -2 }),
  },
  {
    id: "e_2011plasticizer", once: true, when: at(2011, [10, 90]), p: () => 0.3,
    apply: (s, ctx) => ({ text: ctx.w(["塑化劑事件爆發，{你把家裡的運動飲料和果汁全倒掉了。|媽媽開始自己打果汁。}", "那年的新聞全是塑化劑，{你開始仔細看每一瓶飲料的標籤。|手搖飲店門口貼滿了檢驗報告。}"]), mood: -1 }),
  },
  {
    id: "e_2014sunflower", once: true, when: at(2014, [18, 26], s => s.studying), p: () => 0.25,
    apply: (s, ctx) => ({ text: ctx.w(["那年三月，立法院外面聚集了很多學生，{你的同學有人去了現場，有人在網路上看直播。|課堂上大家都在討論這件事。}{你也去看了一次，|你在宿舍看了一整晚的直播，}{記住了那個春天。|那幾個星期，校園的氣氛很不一樣。}"]), mood: 1 }),
  },
  {
    id: "e_2015partydust", once: true, when: at(2015, [16, 30], s => ["臺北市", "新北市"].includes(s.county)), p: () => 0.15,
    apply: (s, ctx) => ({ text: ctx.w(["八仙樂園粉塵爆炸那晚，{你的手機一直收到朋友報平安的訊息。|你一個朋友的同學也在現場。}{你和朋友去捐了血。|那個夏天，大家都在關心燒燙傷的傷患。}"]), mood: -4 }),
  },
  {
    id: "e_2016tainan", once: true, when: at(2016, [3, 100], s => ["臺南市", "高雄市"].includes(s.county)), p: () => 0.6,
    apply: (s, ctx) => ({ text: ctx.w(["除夕前的地震，{你在凌晨被搖醒，|整棟樓晃了好久，}{隔天看到新聞，倒塌的大樓就在不遠處。|那年的年夜飯，大家都吃得很安靜。}"]), mood: -4 }),
  },
  {
    id: "e_2017universiade", once: true, when: at(2017, [10, 70], s => ["臺北市", "新北市", "桃園市"].includes(s.county)), p: () => 0.15,
    apply: (s, ctx) => ({ text: ctx.w(["台北世大運那個夏天，{你買票去看了一場比賽，|你在電視前看了好多場比賽，}{跟著全場一起喊加油。|台灣選手拿金牌時，你差點哭出來。}"]), mood: 3 }),
  },
  {
    id: "e_2018pension", once: true, when: s => s.year === 2018 && s.job && s.job.field === "公部門" && (s.retired || s.age >= 50), p: () => 1,
    apply: (s, ctx) => { s.savings = Math.max(0, s.savings - 0.2); return { text: ctx.w(["公教年金改革上路，{你的退休金每個月少了一些，|你重新算了一次退休後的開銷，}{和老同事聚會時，大家聊的都是這件事。|你決定生活再省一點。}"]), mood: -3 }; },
  },
  {
    id: "e_2019marriage", once: true, when: at(2019, [18, 90]), p: () => 0.3,
    apply: (s, ctx) => ({ text: ctx.w(["五月，同性婚姻專法通過，{新聞上，第一批登記的新人在戶政事務所前合照。|你的同事開心地說，他終於可以和交往十年的伴侶結婚了。}"]), mood: 1 }),
  },
  {
    id: "e_2020covid", once: true, when: at(2020, [3, 100]), p: () => 1,
    choice: (s, ctx) => ({
      prompt: "新冠肺炎疫情爆發，口罩要排隊買，出國旅行全部取消。這一年你怎麼過？",
      options: [
        { id: "e_2020covid.home", label: "少出門，待在家", hint: "安全第一", act: "rest", style: "safe", weight: 0.4, apply: () => ({ text: ctx.w("疫情那年，你{每週排隊買口罩，|幾乎不出門，}{學會了在家做麵包。|和家人一起看了很多部劇。}"), mood: -1 }) },
        { id: "e_2020covid.local", label: "改成國內旅遊", hint: "出不了國，就玩台灣", act: "travel", style: "social", weight: 0.25, apply: s2 => { s2.savings = Math.max(0, s2.savings - 0.1); return { text: ctx.w("疫情那年出不了國，你{改去環島，|跑遍了台灣的小鎮，}{發現台灣好多地方都還沒去過。|民宿老闆說這是他們最忙的一年。}"), mood: 3 }; } },
        { id: "e_2020covid.learn", label: "趁機學新東西", hint: "線上課程", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => { c.nudge("curiosity", 0.03); return { text: "疫情那年，你上了好幾門線上課程，學會了一項新技能。", mood: 2 }; } },
        { id: "e_2020covid.help", label: "幫忙需要的人", hint: "當志工或捐物資", act: "volunteer", style: "family", weight: 0.1, apply: () => ({ text: "疫情那年，你幫社區的長輩代購口罩和生活用品。", mood: 3 }) },
        { id: "e_2020covid.work", label: "專心工作", hint: "有些行業反而更忙", act: "pushThrough", style: "risk", weight: 0.1, when: s2 => s2.employed, apply: s2 => ({ text: ctx.w(`疫情那年，你的${s2.job ? s2.job.title : "工作"}反而更忙，{每天戴著口罩加班。|視訊會議一場接一場。}`), mood: -1 }) },
      ],
    }),
  },
  {
    id: "e_2021level3", once: true, when: at(2021, [3, 100]), p: () => 0.9,
    apply: (s, ctx) => ({ text: ctx.w(s.studying ? ["三級警戒那個夏天，學校停課，{你每天對著電腦上課，|鏡頭關著偷偷睡覺，}{好想念學校的福利社。|同學都只剩下螢幕上的一個小方格。}"] : s.employed ? ["三級警戒那兩個多月，{公司改成在家上班，|餐廳只能外帶，}{你每天在餐桌上開視訊會議。|街上安靜得像過年。}"] : ["三級警戒那兩個多月，{你幾乎足不出戶，|每天看著疫情記者會，}{家人只能透過視訊見面。|連菜市場都要分流。}"]), mood: -3 }),
  },
  {
    id: "e_2022omicron", once: true, domain: "health", channel: "bad", when: at(2022, [3, 100]), p: () => 0.5,
    apply: (s, ctx) => ({ text: ctx.w(["2022 年疫情大流行，你也確診了，{發燒三天，|在家隔離了一個星期，}{喉嚨痛到像吞刀片。|家人把飯放在房門口。}{好了以後，你覺得體力差了一陣子。|還好打過疫苗，症狀不算重。}"]), mood: -3 }),
  },
  {
    id: "e_2024hualien", once: true, when: at(2024, [3, 100]), p: () => 0.6,
    apply: (s, ctx) => regionOf(s.county) === "east"
      ? { text: ctx.w(["四月三日早上的大地震，{花蓮的房子搖到傾斜，|你家的櫃子全倒了，}{你們在操場的帳篷裡住了好幾天。|太魯閣的山路崩了好幾處。}"]), mood: -6, big: true }
      : { text: ctx.w(["四月三日早上，{全台都感覺到那場大地震，|你正在上班，大樓晃了好久，}{手機的地震警報同時響起。|大家都打電話給花蓮的朋友。}"]), mood: -2 },
  },
];
