// 健康與金錢（各年齡）：生活習慣、身心、小病小痛、理財投資、詐騙與日常開銷。
//
// Every probability in this file is an ASSUMPTION (a design value): no official statistic says how often someone is
// offered a cigarette, a stock tip or a wedding invitation in a year. They are kept modest (mostly 0.02–0.08 a year)
// and limited with cooldown / max / once, so the module adds colour without moving what test/calibration.test.js and
// test/life.test.js check:
//   health  every outcome changes s.health.hr through hr() below, by at most ×0.97 or ×1.03, and this module's own
//           share of it stays within ±10 % (kept in s.flags.hHr); good and bad habits roughly balance over a
//           population. Nobody dies or falls seriously ill here: s.health.chronic, serious and checkups are core.js's.
//   money   amounts are years of median pay, mostly 0.01–0.8; a new debt is at most 0.4 and is repaid by the yearly
//           instalment in life.js. Nothing here buys a home, marries, has children, retires or changes jobs.
// Era facts behind the wording (approximate): 全民健保 from March 1995 (IC card from 2004), 165 反詐騙專線 from 2004,
// 0050 (the first ETF) from 2003, Bitcoin talk from 2017, card debts peaking in 2005–2006, 標會 common until the
// 1990s, the oil shocks of 1973–74 and 1979–81, and the yearly market moves in MARKET below.

// ---------- helpers ----------

// Changes the death-risk multiplier by f (0.97–1.03), keeping this module's total share within ±10 %.
function hr(s, f) {
  const before = s.flags.hHr ?? 1;
  const after = Math.max(0.9, Math.min(1.1, before * f));
  s.flags.hHr = after;
  s.health.hr *= after / before;
}
// Spends from savings (never below zero) and returns what was paid.
const pay = (s, x) => { const paid = Math.max(0, Math.min(s.savings, x)); s.savings -= paid; return paid; };
const clampGain = x => Math.max(-0.8, Math.min(0.8, x));
const hasFamily = s => s.rel === "married" || s.kids.length > 0;
const parentAlive = s => s.father.alive || s.mother.alive;
const parentWord = s => (s.father.alive && s.mother.alive ? "爸媽" : s.father.alive ? "爸爸" : "媽媽");
const shop = s => (s.year >= 1985 ? "便利商店" : "雜貨店");
const device = s => (s.year >= 2008 ? "手機" : s.year >= 1975 ? "遙控器" : "收音機");

// Approximate yearly change of the Taiwan stock index (加權指數), gold and Bitcoin, used to size an investment story.
// Values before 1986, for Bitcoin and for 2025 are rough; a year without a value draws an ordinary year.
const MARKET = {
  stock: { 1972: 0.4, 1973: 0.8, 1974: -0.55, 1975: 0.8, 1976: 0, 1977: 0.2, 1978: 0.3, 1979: -0.05, 1980: 0, 1981: -0.05, 1982: -0.2, 1983: 0.7, 1984: 0.1, 1985: 0, 1986: 0.25, 1987: 1.25, 1988: 1.19, 1989: 0.88, 1990: -0.53, 1991: 0.01, 1992: -0.27, 1993: 0.8, 1994: 0.17, 1995: -0.27, 1996: 0.34, 1997: 0.18, 1998: -0.22, 1999: 0.32, 2000: -0.44, 2001: 0.17, 2002: -0.2, 2003: 0.32, 2004: 0.04, 2005: 0.07, 2006: 0.19, 2007: 0.09, 2008: -0.46, 2009: 0.78, 2010: 0.1, 2011: -0.21, 2012: 0.09, 2013: 0.12, 2014: 0.08, 2015: -0.1, 2016: 0.11, 2017: 0.15, 2018: -0.09, 2019: 0.23, 2020: 0.23, 2021: 0.24, 2022: -0.22, 2023: 0.27, 2024: 0.28, 2025: 0.2 },
  gold: { 1973: 0.7, 1974: 0.65, 1975: -0.25, 1976: -0.04, 1977: 0.23, 1978: 0.37, 1979: 1.26, 1980: 0.15, 1981: -0.32, 1982: 0.15, 1983: -0.17, 1984: -0.19, 1985: 0.06, 1986: 0.19, 1987: 0.22, 1988: -0.15, 1989: -0.02, 1990: -0.03, 1991: -0.1, 1992: -0.06, 1993: 0.17, 1994: -0.02, 1995: 0.01, 1996: -0.05, 1997: -0.22, 1998: -0.01, 1999: 0, 2000: -0.05, 2001: 0.02, 2002: 0.25, 2003: 0.2, 2004: 0.05, 2005: 0.18, 2006: 0.23, 2007: 0.31, 2008: 0.05, 2009: 0.24, 2010: 0.3, 2011: 0.1, 2012: 0.07, 2013: -0.28, 2014: -0.02, 2015: -0.1, 2016: 0.08, 2017: 0.13, 2018: -0.02, 2019: 0.18, 2020: 0.25, 2021: -0.04, 2022: 0, 2023: 0.13, 2024: 0.27, 2025: 0.5 },
  crypto: { 2017: 3, 2018: -0.73, 2019: 0.9, 2020: 3, 2021: 0.6, 2022: -0.64, 2023: 1.5, 2024: 1.2, 2025: -0.05 },
};
// One-year time deposit rate, roughly, by period.
const depositRate = y => (y < 1980 ? 0.1 : y < 1986 ? 0.08 : y < 1989 ? 0.05 : y < 1992 ? 0.09 : y < 1997 ? 0.07 : y < 2001 ? 0.05 : y < 2009 ? 0.02 : y < 2022 ? 0.011 : 0.016);

function yearReturn(kind, year, rng) {
  if (kind === "gold") return MARKET.gold[year] ?? 0.03 + 0.12 * rng.normal();
  if (kind === "crypto") return MARKET.crypto[year] ?? 0.1 + 0.6 * rng.normal();
  const index = MARKET.stock[year] ?? 0.06 + 0.18 * rng.normal();
  if (kind === "stock") return 1.1 * index + 0.2 * rng.normal();   // a few picked shares swing more than the index
  if (kind === "fund") return 0.7 * index + 0.05 * rng.normal();
  return 0.95 * index;                                              // etf
}
// Gain or loss on money held from the start of `from` to the end of `to`, nudged by the year's wealth luck.
function heldReturn(kind, from, to, ctx) {
  let v = 1;
  for (let y = from; y <= to; y++) v *= Math.max(0.1, 1 + yearReturn(kind, y, ctx.rng));
  const luck = (ctx.odds("wealth", "good", 0.5) - 0.5) * 0.4;
  return Math.max(-0.8, Math.min(1.5, v - 1 + luck));
}
const TENS = ["", "一", "兩", "三", "四", "五", "六", "七", "八", "九"];
function howMuch(r) {
  if (r >= 1) return "翻了一倍多";
  if (r >= 0.15) return `賺了${TENS[Math.min(9, Math.round(r * 10))]}成`;
  if (r >= 0.03) return "小賺了一點";
  if (r > -0.03) return "差不多打平";
  if (r > -0.15) return "小賠了一點";
  if (r > -0.6) return `賠了${TENS[Math.min(9, Math.round(-r * 10))]}成`;
  return "賠掉了一大半";
}
// The crash a holding period ran into, for the wording.
function crashNote(kind, from, to) {
  const hit = y => from <= y && y <= to;
  if (kind === "crypto") return hit(2022) ? "遇上 2022 年的幣圈寒冬，" : hit(2018) ? "遇上 2018 年的大崩跌，" : "";
  if (kind === "gold") return hit(1981) ? "遇上 1981 年金價大跌，" : hit(2013) ? "遇上 2013 年金價大跌，" : "";
  if (hit(1990)) return "遇上 1990 年股市從一萬兩千點崩跌，";
  if (hit(2000)) return "遇上網路泡沫破滅，";
  if (hit(2008)) return "遇上金融海嘯，";
  if (hit(2022)) return "遇上 2022 年的升息大跌，";
  if (hit(1974)) return "遇上石油危機的股災，";
  return "";
}
const KIND = { stock: "股票", fund: "基金", etf: "ETF", crypto: "加密貨幣", gold: "黃金" };
// A Latin word inside Chinese text gets spaces around it (買的 ETF 放了), but not next to punctuation or the line start.
const pad = (w, left = true, right = true) => (/^[A-Za-z]/.test(w) ? `${left ? " " : ""}${w}${right ? " " : ""}` : w);

// ---------- scenes ----------
// One situation for a choice, so the same question reads differently from life to life. `list` holds the scenes
// that fit now (null for one that does not), each with a weight `w` (higher for one made for this moment of life,
// default 1); a scene this life has not had for the question comes first (s.flags["<id>:scenes"] keeps the told
// ones). The question, the buttons and every answer are written from the scene that comes back.
function pickScene(s, ctx, id, list) {
  const ok = list.filter(Boolean), key = `${id}:scenes`, told = s.flags[key] || (s.flags[key] = []);
  const fresh = ok.filter(x => !told.includes(x.key));
  const sc = ctx.rng.weighted((fresh.length ? fresh : ok).map(x => [x, x.w ?? 1]));
  told.push(sc.key);
  return sc;
}

// h_tooth: where and how the toothache comes. `lead` restates it at the start of every answer; each answer is
// [label, hint, what happens], and the 看牙醫 line goes on from 你… after the visit.
function toothScenes(s) {
  const nhi = s.year >= 1995, card = nhi ? "，掛號時遞上健保卡" : "";
  const hint = nhi ? "健保有給付" : "要花一筆錢";
  const fixed = "{醫生說蛀到神經了，要做根管治療，|醫生說補一補就好，|醫生順便幫你洗了牙，}{前後跑了三趟診所，|打了麻藥，}{總算不痛了。|半邊臉麻了一下午。}";
  const late = "{醫生說再晚一點就要拔掉了。|只好多跑了好幾趟診所。}";
  const pill = ["先吃止痛藥", "撐過這幾天", "你先吞了兩顆止痛藥，{痛是壓下來了，|撐過了這個星期的事，}{但過一陣子又開始痛。|最後還是乖乖去看了牙醫。}"];
  const home = ["用老方法撐著", "含冰塊、鹽水漱口", "你照{阿嬤|媽媽}教的老方法，{含著冰塊、用鹽水漱口，|在臉頰上敷了冰毛巾，}{撐了好幾天，最後還是得去看牙醫。|勉強睡了一晚，痛總算慢慢退了。}"];
  const wait = ["忍到不行再說", "怕看牙醫", `你一直忍著，{忍了兩個星期，|拖了一個月，}最後痛到睡不著才去看牙醫，${late}`];
  const dentist = ["馬上看牙醫", hint, `你馬上去看牙醫${card}，${fixed}`];
  return [
    s.age >= 17 && s.age <= 30 && {
      key: "wisdom", w: 2, lead: "長智齒，牙齦腫了起來，",
      prompt: "{最裡面的牙齦|右下角的牙齦}腫了起來，原來是{一顆智齒|一顆歪著長的智齒}在作怪，{連張嘴都會痛。|吃飯只能用另一邊咬。}要怎麼辦？",
      dentist: ["馬上去拔智齒", hint, `你馬上去看牙醫${card}，醫生說這顆智齒乾脆拔掉，{打了麻藥，喀一聲就拔起來了。|你咬著棉花回家，腫了兩天才消。}`],
      wait: ["忍到消腫再說", "怕拔牙", `你一直忍著，{忍了兩個星期，|拖了一個月，}最後腫到張不開嘴才去看牙醫，{醫生說已經發炎了，要先消腫才能拔。|只好多跑了好幾趟診所。}`],
      pill, home: ["用老方法消腫", "含冰塊、鹽水漱口", home[2]],
    },
    { key: "ache", lead: "牙痛了好幾天，", prompt: "{吃冰的時候|半夜|咬到一顆小石頭之後}，{右邊|左下}的牙齒{一陣一陣地抽痛|痛到半邊臉都腫起來}。要怎麼辦？", dentist, wait, pill, home },
    { key: "soup", lead: "一顆牙一碰到熱的就痛，", prompt: "喝熱湯時，一顆牙突然{痛得你叫出聲|像被針刺了一下}，{之後越來越常痛。|晚上痛到睡不著。}要怎麼辦？", dentist, wait: ["先不吃熱的，忍著", "怕看牙醫", wait[2]], pill, home },
    { key: "cavity", lead: "一顆牙蛀了一個洞，", prompt: "{嘴巴裡|門牙後面}有一顆牙{黑了一塊|缺了一角}，{一碰到甜的就痛。|吃東西都要小心。}要怎麼辦？", dentist: ["去把蛀牙補起來", hint, dentist[2]], wait: ["能拖就拖", "怕聽到鑽牙的聲音", wait[2]], pill, home },
    s.studying && s.age <= 18 && {
      key: "exam", w: 2, lead: "考試前牙痛，", prompt: "{段考|期末考}前一個星期，一顆蛀牙開始抽痛，{寫考卷時一直分心|晚上痛到讀不下書}。要怎麼辦？",
      dentist: ["請假去看牙醫", hint, `你跟學校請了半天假去看牙醫${card}，{醫生說蛀到神經了，要做根管治療，|醫生說補一補就好，}{回到教室，同學問你臉怎麼腫了一邊。|總算可以專心準備考試了。}`],
      wait: ["考完再說", "怕耽誤讀書", `你咬著牙說考完再說，{寫考卷時一直用舌頭頂著那顆牙，|考完最後一科才去看牙醫，}${late}`],
      pill: ["先吃止痛藥", "撐過考試再說", "你先吞了兩顆止痛藥，{撐過了那個星期的考試，|痛是壓下來了，}{但考完又開始痛。|最後還是乖乖去看了牙醫。}"],
      home: ["用老方法撐著", "含冰塊、鹽水漱口", "你照{阿嬤|媽媽}教的老方法，{含著冰塊讀書，|用鹽水漱口，}{撐過了考試，最後還是得去看牙醫。|勉強睡了一晚，痛總算慢慢退了。}"],
    },
    s.age >= 20 && !s.abroad && {
      key: "away", lead: "出門在外牙痛，", prompt: `${s.employed ? "出差到外縣市" : "去外縣市玩"}的第二天，一顆牙開始抽痛，{臉頰腫了一圈|連喝水都痛}。要怎麼辦？`,
      dentist: ["在當地找牙醫", nhi ? "健保卡帶在身上" : "要花一筆錢", `你在附近找了一間牙醫診所${nhi ? "，還好健保卡就在皮夾裡" : ""}，{醫生先幫你把發炎的神經處理掉，要你回家再接著治療，|醫生說補一補就好，}{總算不痛了。|半邊臉麻了一下午。}`],
      wait: ["撐到回家再說", "人生地不熟", "你決定撐到回家再說，{一路上都用另一邊咬東西，|晚上痛到睡不著，}一回家就去看牙醫，{醫生說再晚一點就要拔掉了。|結果多跑了好幾趟診所。}"],
      pill: ["先去藥局買止痛藥", "撐過這幾天", "你先去藥局買了止痛藥，{痛是壓下來了，|撐完了這一趟，}{但回家後又開始痛。|最後還是乖乖去看了牙醫。}"],
      home: ["跟旅館要冰塊含著", "老方法撐一下", "你跟旅館櫃檯要了一袋冰塊，{含著冰塊、用鹽水漱口，|在臉頰上敷了冰毛巾，}{撐了好幾天，回家還是得去看牙醫。|勉強睡了一晚，痛總算慢慢退了。}"],
    },
    !s.abroad && {
      key: "newyear", lead: "過年咬裂了一顆牙，", prompt: "除夕夜吃年夜飯時，你咬到{一塊排骨的骨頭|一顆硬糖}，一顆牙{裂了|斷了一角}，{附近的診所都休到初五|附近的牙醫都放年假}。要怎麼辦？",
      dentist: ["找過年有開的牙醫", hint, `你${s.year >= 2000 ? "上網" : "打了好幾通電話"}找到一間過年也有開的牙醫診所${card}，{醫生說裂到神經了，要做根管治療，|醫生先幫你把裂掉的地方補起來，}{總算能好好吃年菜了。|半邊臉麻了一下午。}`],
      wait: ["撐到初五開診", "過年不想跑醫院", "你決定撐到初五，{整個年假都只用另一邊咬，|年菜一口都不敢多吃，}診所一開門就去看牙醫，{醫生說再晚一點就要拔掉了。|結果多跑了好幾趟診所。}"],
      pill: ["先吃止痛藥", "撐過年假再說", "你先吞了兩顆止痛藥，{撐過了拜年，|痛是壓下來了，}{但過完年又開始痛。|最後還是乖乖去看了牙醫。}"],
      home: ["用老方法撐著", "含冰塊、鹽水漱口", "你照{阿嬤|媽媽}教的老方法，{含著冰塊、用鹽水漱口，|在臉頰上敷了冰毛巾，}{撐過了年假，開工後還是得去看牙醫。|勉強睡了一晚，痛總算慢慢退了。}"],
    },
    s.age >= 35 && {
      key: "gum", lead: "牙齦一直流血，", prompt: "刷牙時牙齦一直流血，{有一顆牙還開始搖|嘴巴常常有怪味}，咬硬一點的東西就痠痛。要怎麼辦？",
      dentist: [s.year >= 2010 ? "去做牙周病治療" : "馬上看牙醫", hint, `你去看了牙醫${card}，{醫生說是牙周病，幫你把牙結石刮乾淨，|醫生教你用牙線和牙間刷，${s.year >= 2010 ? "還排了一整個療程的牙周治療，" : "還幫你洗了牙，"}}{前後跑了三趟診所，|刮完牙結石，牙縫空了一大圈，}{牙齦總算不再流血了。|你從此每天晚上都用牙線。}`],
      wait: ["等它自己好", "應該是火氣大", `你以為是火氣大，{喝了好幾天的青草茶，|一直拖著沒去看，}最後牙齒搖到不能咬才去看牙醫，{醫生說再晚一點就保不住了。|只好多跑了好幾趟診所。}`],
      pill: ["先吃消炎止痛藥", "撐過這幾天", "你先吃了消炎止痛藥，{血是少了一點，|痛是壓下來了，}{但過一陣子又開始流血。|最後還是乖乖去看了牙醫。}"],
      home: ["換軟毛牙刷、鹽水漱口", "老方法顧牙齦", "你換了一支軟毛牙刷，{每天用鹽水漱口，|照{阿嬤|媽媽}說的多吃青菜、少吃炸的，}{撐了好幾個星期，最後還是得去看牙醫。|血好像少了一點，但那顆牙還是有點搖。}"],
    },
    s.age >= 55 && {
      key: "denture", w: 2, lead: "牙齦被假牙磨得發痛，", prompt: "{以前做的假牙|戴了好多年的活動假牙}越來越鬆，底下的牙齦{磨破了一塊|腫了起來}，咬東西就痛。要怎麼辦？",
      dentist: ["回去找牙醫調整", "早點弄好比較省事", `你回去找做假牙的牙醫${card}，{醫生把假牙磨了幾下，又調了調鬆緊，|醫生說牙齦萎縮了，先幫你把假牙墊高一點，}{總算能好好咬東西了。|回家第一餐，你吃了一大碗滷肉飯。}`],
      wait: ["先拿下來不戴", "等不痛再說", "你乾脆把假牙拿下來，{好幾天只能喝粥，|吃飯都用牙齦慢慢磨，}最後痛到睡不著才去看牙醫，{醫生說牙齦發炎了，要先治療才能重新調整。|只好多跑了好幾趟診所。}"],
      pill: ["先吃止痛藥", "撐過這幾天", "你先吞了兩顆止痛藥，{痛是壓下來了，|撐過了這個星期，}{但假牙一戴上又開始痛。|最後還是乖乖去看了牙醫。}"],
      home: ["用鹽水漱口撐著", "讓牙齦休息幾天", "你每天用溫鹽水漱口，{晚上把假牙泡在杯子裡讓牙齦休息，|吃飯改吃軟一點的東西，}{撐了好幾天，最後還是得去看牙醫。|牙齦總算慢慢消腫了。}"],
    },
  ];
}

// h_knee: where the knee gives out. `lead` restates it at the start of every answer; each answer is
// [label, hint, what happens]. The 葡萄糖胺 line before 2000 is a 藥膏 one.
function kneeScenes(s) {
  const pills = s.year >= 2000
    ? ["買葡萄糖胺來吃", "聽說有保養效果", "你每天配早餐吃一顆葡萄糖胺，{好像有好一點，又好像沒有。|家人說那沒什麼用，你還是照吃。|吃了一年，錢花了不少。}"]
    : ["買藥膏來擦", "聽說有保養效果", "你每天晚上擦{電台推薦的|朋友介紹的}藥膏，{房間裡都是藥膏的味道。|好像有好一點，又好像沒有。}"];
  const rehab = ["去復健、練大腿肌肉", "醫生說肌肉是最好的護膝", "你照醫生說的去復健，{每天坐在椅子上抬腿，|跟著復健師練大腿的肌肉，}{半年後，上下樓梯輕鬆多了。|又能走到公園去了。}"];
  const swim = ["改去游泳、騎腳踏車", "對膝蓋比較好", "你改去{游泳|水中走路|騎腳踏車}，{膝蓋的負擔小了，|在泳池認識了一群老朋友，}{整個人也有精神多了。|每天早上都期待出門。}"];
  const swimBad = "你試著去游泳，{但冬天水太冷，去了幾次就停了。|游了幾次，總覺得不習慣。}";
  const inject = ["自費打玻尿酸", "要花一筆錢", "你自費打了{三劑|一個療程的}玻尿酸，{走路順多了，|醫生說效果大概能撐一年，}{心想這筆錢花得值得。|但想到價錢，心裡還是有點痛。}"];
  const weaker = "{腿越來越沒力，膝蓋反而更痛了。|體重慢慢往上跑，家人很擔心。}";
  const sit = ["少出門，能坐就坐", "反正年紀大了", `你乾脆少出門，{整天坐在家裡看電視，|連去市場都請人幫忙買，}${weaker}`];
  const base = { pills, rehab, swim, swimBad, inject, sit };
  return [
    { ...base, key: "stairs", lead: "膝蓋痛了一陣子，", prompt: "{爬樓梯|蹲下去撿東西|爬山下坡}的時候，膝蓋{卡卡的|一陣一陣地痛}，醫生說是{退化性關節炎|關節磨損}。要怎麼辦？" },
    { ...base, sit: ["早上就別出門了", "反正年紀大了", sit[2]], key: "morning", lead: "膝蓋一到早上就不聽使喚，", prompt: "早上起床，膝蓋{僵硬得要慢慢揉開|腫了一圈}，{走到巷口的市場都要休息兩次。|連最愛的散步都走不遠了。}要怎麼辦？" },
    { ...base, sit: ["一變天就待在家", "反正年紀大了", sit[2]], key: "weather", lead: "膝蓋一變天就不舒服，", prompt: "天氣一變，膝蓋就{痠痛|發出喀喀的聲音}，{你成了家裡的氣象台。|上下樓梯都要扶著欄杆。}要怎麼辦？" },
    s.age <= 80 && {
      ...base, key: "hike", lead: "爬山爬到膝蓋痛，", prompt: "跟{登山隊|健走團}去爬山，下坡時膝蓋{一軟|痛得要人扶}，醫生說是退化性關節炎。要怎麼辦？",
      rehab: ["去復健，練好再爬", "醫生說肌肉是最好的護膝", "你照醫生說的去復健，{每天坐在椅子上抬腿，|跟著復健師練大腿的肌肉，}{半年後，又跟著登山隊出門了，只是下坡改用登山杖。|上下樓梯輕鬆多了。}"],
      swim: ["改去游泳，不爬山了", "對膝蓋比較好", "你把登山鞋收起來，改去{游泳|水中走路}，{膝蓋的負擔小了，|在泳池認識了一群老朋友，}{整個人也有精神多了。|每天早上都期待出門。}"],
      sit: ["以後不爬了，在家休息", "反正年紀大了", `你從此不爬山了，{整天坐在家裡看電視，|${s.year >= 2012 ? "連登山隊的 LINE 群組都退了，" : "登山隊的聚會也不去了，"}}${weaker}`],
    },
    !s.abroad && {
      ...base, key: "walkup", lead: "爬公寓樓梯爬到膝蓋痛，", prompt: "你住的{四|五}樓公寓沒有電梯，每天提著菜爬上樓，膝蓋{越來越痛|一到三樓就開始抗議}。要怎麼辦？",
      sit: ["少出門，能不爬就不爬", "反正年紀大了", `你乾脆少出門，{菜請鄰居順便帶，|整天待在樓上看電視，}{腿越來越沒力，膝蓋反而更痛了。|爬一次樓梯要休息三次，家人很擔心。}`],
    },
    s.flags.grandkids > 0 && {
      ...base, key: "grandkid", w: 2, lead: "顧孫子顧到膝蓋痛，", prompt: "{抱著孫子上下樓梯|蹲下去幫孫子穿鞋}的時候，膝蓋{一陣一陣地痛|喀的響了一聲}，醫生說是退化性關節炎。要怎麼辦？",
      rehab: ["去復健、練大腿肌肉", "還想再抱孫子", "你照醫生說的去復健，{每天坐在椅子上抬腿，|跟著復健師練大腿的肌肉，}{半年後，又能抱著孫子去公園了。|上下樓梯輕鬆多了。}"],
      sit: ["孫子不抱了，能坐就坐", "反正年紀大了", `你只好跟孫子說{grand}抱不動了，{整天坐在沙發上，|連去市場都請人幫忙買，}${weaker}`],
    },
    !s.abroad && {
      ...base, key: "pilgrim", lead: "走了一天，膝蓋腫了起來，", prompt: "跟著廟裡的進香團走了一整天，回家膝蓋腫得像{饅頭|麵龜}，醫生說是退化性關節炎。要怎麼辦？",
      sit: ["明年不跟了，在家休息", "反正年紀大了", `你跟廟裡說明年不跟了，{整天坐在家裡看電視，|連去市場都請人幫忙買，}${weaker}`],
    },
    {
      ...base, key: "dance", lead: "跳舞時膝蓋痛了起來，", prompt: "在公園跳{土風舞|元極舞|國標舞}時一個轉身，膝蓋{痛了一下就腫起來|卡住了，好一陣子才伸直}，醫生說是關節退化。要怎麼辦？",
      rehab: ["去復健、練大腿肌肉", "練好了再回去跳", "你照醫生說的去復健，{每天坐在椅子上抬腿，|跟著復健師練大腿的肌肉，}{半年後，又回到公園跳舞了，只是轉身慢了一點。|上下樓梯輕鬆多了。}"],
      sit: ["舞不跳了，能坐就坐", "反正年紀大了", `你乾脆不去公園了，{整天坐在家裡看電視，|舞伴打電話來，你也推說不舒服，}${weaker}`],
    },
  ];
}

// h_gym: why the gym comes up. `open` restates it at the start of every answer; a scene can tell its own endings.
// {friend} is the same friend from the question to the answer.
function gymScenes(s, ctx) {
  const role = s.sex === "male" ? "伴郎" : "伴娘", dress = s.sex === "male" ? "西裝" : "禮服";
  const near = s.employed && ctx.rng() < 0.5 ? "公司對面" : "家樓下";
  const after = s.employed ? "下班" : "傍晚";
  const no = "教練推銷課程，你笑著說再考慮看看，{走出門就把傳單收進回收桶。|回家煮了一碗泡麵犒賞自己。}";
  const labels = { coach: ["簽下私人教練課", "有人盯比較有效"], monthly: ["只辦月費自己練", "便宜很多"], home: ["在家跟著影片練", "一毛錢都不用花"], buddy: ["和朋友互相督促", "揪團一起練"], no: ["婉拒，健身不適合我", "錢留著"] };
  return [
    { key: "friend", open: "和{friend}去健身房體驗完，", labels, no, prompt: "{friend}找你去{新開的健身房|二十四小時的健身房}體驗，結束後教練拿出平板，說{一次買三十堂比較划算|今天簽約就送兩個月}，一套課程要好幾萬塊。要怎麼辦？" },
    { key: "bodyfat", open: "量完體脂以後，", no, prompt: "健身房的體驗課上完，教練幫你量了體脂，{說你的肌肉量偏低，|說你的體態很有潛力，}拿出一張私人教練課的價目表。要怎麼辦？",
      labels: { ...labels, coach: ["照教練說的買課", "有人盯比較有效"], home: ["回家自己練", "一毛錢都不用花"] } },
    { key: "trend", open: "看大家都在健身，", labels, no, prompt: "身邊的人都在健身，{社群上滿滿是別人的腹肌照，|同事午休都在聊重訓，}你也去健身房體驗了一次，教練開始推銷課程。要怎麼辦？" },
    s.employed && s.job && !["自營", "家業"].includes(s.job.field) && {
      key: "checkup", open: "為了健檢報告上的紅字，", prompt: "公司的健檢報告出來，{體脂肪|腰圍|三酸甘油酯}多了一個紅字，公司附近的健身房剛好在發體驗券。要怎麼辦？",
      labels: { ...labels, monthly: ["拿體驗券去辦月費", "便宜很多"], buddy: ["找同事一起練", "揪團一起練"], no: ["報告收起來就好", "錢留著"] },
      buddyOk: "你找了幾個同事約好一起練，{每天在群組裡打卡，|午休一起去快走，}{誰偷懶就請喝飲料。|隔年的健檢，大家的紅字都少了一個。}",
      buddyBad: "你找了幾個同事約好一起練，{結果大家互相陪著偷懶。|練了一個月，群組就安靜了。}",
      no: "你看了看體驗券，{還是把它夾回健檢報告裡。|決定每天多走一站路就好。}",
    },
    s.rel !== "married" && s.age <= 40 && {
      key: "wedding", open: "為了{friend}的婚禮，", prompt: `{friend}的婚禮找你當${role}，還有三個月，你想在那之前瘦一圈。要怎麼辦？`,
      labels: { coach: ["找教練密集訓練", "三個月要看到效果"], monthly: ["辦月費自己練", "便宜很多"], home: ["在家跟著影片練", "一毛錢都不用花"], buddy: [`拉其他${role}一起練`, "揪團一起練"], no: ["算了，穿寬一點的", "錢留著包紅包"] },
      coachOk: `你找了教練密集訓練，{每週三次被操到腿軟，|教練連你吃什麼都要管，}{婚禮那天，${dress}穿起來剛剛好。|拍照時大家都說你瘦了一圈。}`,
      coachBad: `你找了教練，{上了十堂就開始找理由請假，|教練換了人，你也就不去了，}{婚禮那天，只好把${dress}的釦子偷偷鬆開一顆。|剩下的課到期都沒上完。}`,
      monthlyOk: `你辦了健身房的月費自己練，{每天${after}去跑步機上跑半小時，|跟著網路影片學動作，}{婚禮那天，${dress}穿起來剛剛好。|三個月瘦了好幾公斤。}`,
      homeOk: `你在客廳鋪了一張瑜伽墊，{每天跟著影片練二十分鐘，|跳完一套就滿身大汗，}{婚禮那天，${dress}穿起來剛剛好。|三個月都沒有中斷。}`,
      buddyOk: `你拉了其他${role}一起練，{每天在群組裡打卡，|每週一起去練三次，}{婚禮那天，大家都說你們是最上相的${role}團。|誰偷懶就請喝飲料。}`,
      buddyBad: `你拉了其他${role}一起練，{結果大家互相陪著偷懶。|練了一個月，群組就安靜了。}`,
      no: "你想了想，{決定穿寬一點的衣服就好。|說三個月也瘦不了多少，錢留著包紅包。}",
    },
    {
      key: "run", open: "為了那場路跑，", prompt: "{friend}幫你報名了{十公里|半程馬拉松}的路跑，你現在連三公里都跑不完。要怎麼辦？",
      labels: { coach: ["請教練排課表", "有人盯比較有效"], monthly: ["辦月費練跑步機", "便宜很多"], home: ["照網路課表自己練", "一毛錢都不用花"], buddy: ["跟朋友約好一起練跑", "揪團一起練"], no: ["跟朋友說你不跑了", "健身不適合我"] },
      coachOk: "你請教練排了一份課表，{每週練三次，|從三公里慢慢加到十公里，}{路跑那天，你跑完了全程。|衝過終點時，你差點哭出來。}",
      coachBad: "你請了教練，{上了幾堂就開始找理由請假，|教練換了人，你也就不去了，}{路跑那天只跑了一半就走回終點。|剩下的課到期都沒上完。}",
      monthlyOk: `你辦了健身房的月費，{每天${after}在跑步機上跑半小時，|週末再到河堤跑長距離，}{路跑那天，你跑完了全程。|成績比你想的還好。}`,
      monthlyBad: "你辦了健身房的月費，{去了幾次就懶得去了，|月費照扣，人都沒去，}{路跑那天只跑了一半就走回終點。|最後還是棄賽了。}",
      homeOk: "你照網路上的課表，{每天傍晚去河堤跑，|從走跑交替開始練，}{路跑那天，你跑完了全程。|跑完以後，你又報了下一場。}",
      homeBad: "你說要照網路上的課表自己練，{跑了三天就碰上下雨，|跑了一個星期就膝蓋痠，}{路跑那天只跑了一半就走回終點。|最後還是棄賽了。}",
      buddyOk: "你和{friend}約好每天一起練跑，{誰偷懶就請喝飲料，|在群組裡互相打卡，}{路跑那天，兩個人一起衝過終點。|一年後兩個人都瘦了一圈。}",
      buddyBad: "你和{friend}約好一起練跑，{結果兩個人互相陪著偷懶，|練了一個月，群組就安靜了，}{路跑那天兩個人一起用走的走完。|最後兩個人都棄賽了。}",
      no: "你跟{friend}說自己還是不跑了，{報名費就當作捐出去。|路跑那天，你在終點幫大家拍照。}",
    },
    {
      key: "newyear", open: "為了新年新希望，", prompt: "新年新希望寫了「今年要{瘦五公斤|練出腹肌}」，健身房一月的入會費打八折。要怎麼辦？",
      labels: { ...labels, monthly: ["趁打折辦月費", "便宜很多"], buddy: ["找朋友互相督促", "揪團一起練"], no: ["新年新希望留到明年", "錢留著"] },
      no: "你在入會單前猶豫了很久，{還是把筆放下了。|決定把錢留著，新年新希望改成多走路。}",
    },
    {
      key: "nearby", open: `${near}的健身房開幕，`, prompt: `${near}開了一間二十四小時的健身房，開幕優惠只到這個週末。要怎麼辦？`,
      labels: { ...labels, monthly: ["趁開幕辦月費", "便宜很多"], no: ["優惠就讓它過去", "錢留著"] },
      no: "你在門口看了看價目表，{還是走了過去。|心想等下一次優惠再說。}",
    },
    s.year >= 2015 && {
      key: "app", open: "被手機提醒了好幾天，", prompt: "手機的運動 App 一直提醒你今天走不到三千步，附近的健身房正好在推年度方案。要怎麼辦？",
      labels: { ...labels, no: ["把提醒關掉", "錢留著"] },
      no: "你把運動 App 的提醒關掉了，{年度方案的傳單也收進了回收桶。|說明天開始多走一點路就好。}",
    },
  ];
}

export const HEALTH = [
  // ---------- habits ----------
  {
    // 開始運動的契機
    id: "h_exercise", domain: "health", channel: "good", ages: [18, 75], cooldown: 8, max: 2, when: s => !s.health.serious,
    p: () => 0.025,
    choice: (s, ctx) => {
      const run = s.year >= 2010;
      const ball = s.year >= 2023 ? "{打羽球|打匹克球|打籃球}" : s.year >= 1990 ? "{打羽球|打籃球|打桌球}" : "{打籃球|打桌球|打棒球}";
      const park = s.age >= 45
        ? (s.year < 2000 ? "{跟著早覺會打外丹功|在公園跳土風舞|跟大家打太極拳}" : "{跟著鄰居在公園跳土風舞|去公園打太極拳|每天健走一萬步}")
        : "{下班後去公園快走|晚飯後沿著河堤走一圈|每天提早一站下車走回家}";
      const lasts = p => ctx.rng() < p;   // whether the new habit lasts
      const fit = () => { hr(s, 0.97); s.health.fitness = Math.min(1, s.health.fitness + 0.15); };
      return {
        prompt: ctx.w([
          "{公司|社區}的健康檢查報告上多了幾個紅字，醫生說你該動一動了。要怎麼開始運動？",
          "爬{三樓|天橋|車站的樓梯}就喘得說不出話，你嚇了一跳。要怎麼開始運動？",
          "{friend}傳來一張你們{學生時代|十年前}的合照：「你看你以前多瘦！」要怎麼開始運動？",
          "{過年|連假}胖了三公斤，褲子的釦子扣得好勉強。要怎麼開始運動？",
        ]),
        options: [
          {
            id: "h_exercise.run", label: run ? "報名一場路跑" : "每天早上去慢跑", hint: run ? "有目標比較不會偷懶" : "一雙球鞋就能開始", act: "exercise", style: "health", weight: 0.22,
            apply: () => {
              if (!lasts(0.45)) return { text: ctx.w(`想開始運動，${run ? "報名了一場路跑，" : "開始早上去慢跑，"}{跑了兩個星期，梅雨季一來就停了。|跑了一個月，膝蓋開始痠，就沒再跑了。|鬧鐘響了三次，你按掉了三次。}`), mood: 0 };
              fit();
              return { text: ctx.w(run ? "想開始運動，報名了{city}的{五公里|十公里|半程馬拉松}路跑，{每天下班去河堤練|跟著跑步 App 的課表練}。{衝過終點那一刻，腿軟但心裡好得意。|你把完賽獎牌掛在床頭。}" : "想開始運動，每天早上{去學校操場|到公園|沿著河堤}慢跑，{三個月後|半年後}{爬樓梯不喘了。|褲子鬆了一號。|整個人精神很多。}"), mood: 3 };
            },
          },
          {
            id: "h_exercise.ball", label: "揪朋友打球", hint: "有伴比較撐得下去", act: "socialize", style: "social", weight: 0.2,
            apply: () => {
              if (!lasts(0.5)) return { text: ctx.w(`想開始運動，約了{friend}去${ball}，{打了幾次，大家越來越難約，最後就散了。|打完一起去吃宵夜，吃的比消耗的還多。}`), mood: 1 };
              fit();
              return { text: ctx.w(`想開始運動，約了{friend}每週{二|四}晚上去${ball}，{一年下來，打出了一群固定的球友。|流一身汗，什麼煩惱都忘了。|打到後來，連週末都捨不得休息。}`), mood: 3 };
            },
          },
          {
            id: "h_exercise.gym", label: "加入健身房", hint: "要繳一筆會費", act: "exercise", style: "self", weight: 0.15, when: s2 => s2.year >= 1990,
            apply: () => {
              pay(s, s.year >= 2012 ? 0.03 : 0.05);
              if (!lasts(0.4)) return { text: ctx.w("想開始運動，辦了健身房的年費會員，{結果一年去不到十次。|去了三次就忙到忘記，會員卡一直躺在皮夾裡。}"), mood: -1 };
              fit();
              return { text: ctx.w("想開始運動，辦了健身房的會員，{每週去三次，|下班就直接去報到，}{半年後練出了一點肌肉線條。|體力好到同事都發現了。}"), mood: 3 };
            },
          },
          {
            id: "h_exercise.park", label: s.age >= 45 ? "去公園跟大家一起動" : "每天出門走一走", hint: "不用花錢，也不傷膝蓋", act: "exercise", style: "safe", weight: 0.2,
            apply: () => {
              if (!lasts(0.5)) return { text: ctx.w(`想開始運動，${park}，{但天氣一冷就懶得出門了。|走了幾天，就被電視和沙發打敗了。}`), mood: 0 };
              fit();
              return { text: ctx.w(`想開始運動，${park}，{一年下來，血壓穩了一些。|認識了一群每天見面的朋友。|胃口和睡眠都變好了。}`), mood: 3 };
            },
          },
          {
            id: "h_exercise.family", label: "週末帶家人去爬山", hint: "一家人一起動", act: "travel", style: "family", weight: 0.13, when: hasFamily,
            apply: () => {
              if (!lasts(0.45)) return { text: ctx.w("想開始運動，帶家人去爬了一次{郊山|家附近的步道}，{回來全身痠痛三天，就再也沒提了。|下次再約的時候，大家都說有事。}"), mood: 1 };
              fit();
              return { text: ctx.w("想開始運動，週末帶家人去爬{家附近的步道|郊山}，{山頂的那碗豆花成了全家的獎勵。|一路聊天，比在家看電視有意思。|爬到後來，大家都不想停下來。}"), mood: 4 };
            },
          },
          {
            id: "h_exercise.later", label: "下次再說", hint: "最近真的太忙", act: "wait", style: "risk", weight: 0.25,
            apply: () => ({ text: ctx.w(s.year >= 2010 ? "想開始運動，{下載了運動 App，|買了一雙新跑鞋，}{到現在還沒打開過。|鞋盒都還沒拆。}" : "想開始運動，{買了一雙新球鞋，|跟自己說下個月開始，}{到現在還放在鞋櫃裡。|下個月又變成了下個月。}"), mood: 0 }),
          },
        ],
      };
    },
  },
  {
    // 有人遞菸
    id: "h_smoke", domain: "health", channel: "bad", ages: [14, 60], cooldown: 6, max: 2, when: s => !s.health.smoke,
    p: s => (s.age < 18 ? 0.02 : (s.sex === "male" ? 1 : 0.4) * (s.year < 1997 ? 0.06 : s.year < 2009 ? 0.04 : 0.025)),
    choice: (s, ctx) => {
      const teen = s.age < 18, work = !teen && s.employed && ctx.rng() < 0.6;
      const who = ctx.rng.pick(teen ? ["同學", "學長"] : work ? ["同事", "客戶", "主管"] : ["朋友", "親戚"]);
      const prompt = teen
        ? ctx.w("{下課時間|畢業旅行的晚上|補習班下課後}，{who}在{廁所後面|頂樓|機車棚旁邊}偷抽菸，遞了一根給你：「試試看啦。」要接嗎？", { who })
        : work
          ? ctx.w([...(s.year < 1997 ? ["那個年代辦公室裡大家都抽菸，{who}順手遞了一根給你：「來一根？」要接嗎？"] : []), "{工地休息的時候|等客戶的空檔|加班到半夜，在樓梯間}，{who}遞了一根菸給你。要接嗎？"], { who })
          : ctx.w(["{喜宴上|廟口看戲的時候|朋友聚會時}，{who}遞了一根菸給你：「來，抽一根。」要接嗎？", "{過年打牌的時候|喝喜酒散場後|朋友家烤肉時}，{who}掏出一包菸，抽出一根遞給你。要接嗎？"], { who });
      const smokes = () => { s.health.smoke = true; hr(s, 1.03); };
      return {
        prompt,
        options: [
          {
            id: "h_smoke.take", label: "接過來抽", hint: teen ? "不想被說是乖寶寶" : "大家都在抽", act: "vice", style: "risk",
            weight: teen ? 0.12 : s.sex === "male" ? (s.year < 1997 ? 0.25 : 0.15) : 0.06,
            apply: () => { smokes(); return { text: ctx.w("{who}遞菸給你，你接過來抽了。{第一口嗆得眼淚直流，|點上之後，}{後來口袋裡就常放著一包菸。|就這樣抽上了。|之後心煩的時候，你也會去買一包。}", { who }), mood: 0 }; },
          },
          {
            id: "h_smoke.no", label: "笑著婉拒", hint: "不抽就是不抽", act: "quitHabit", style: "health", weight: 0.4,
            apply: () => ({ text: ctx.w("{who}遞菸給你，你笑著揮揮手：「{我不抽菸啦。|謝謝，我不會抽。}」{對方也沒多說什麼。|大家照樣聊得很開心。}", { who }), mood: 0 }),
          },
          {
            id: "h_smoke.once", label: "抽一根就好", hint: "給個面子", act: "socialize", style: "social", weight: 0.2,
            apply: () => {
              if (ctx.rng() < 0.25) { smokes(); return { text: ctx.w("{who}遞菸給你，你想說抽一根就好。{後來應酬的時候也跟人要一根，慢慢就抽上了。|沒想到一根變兩根，兩根變一包。}", { who }), mood: 0 }; }
              return { text: ctx.w("{who}遞菸給你，你抽了一根，{嗆得咳了好久，|覺得滿嘴都是怪味，}之後就沒再碰了。", { who }), mood: 0 };
            },
          },
          {
            id: "h_smoke.excuse", label: "找個理由推掉", hint: teen ? "說家裡管很嚴" : "說自己過敏", act: "avoid", style: "safe", weight: 0.15,
            apply: () => ({ text: ctx.w(`{who}遞菸給你，你說自己${teen ? "{家裡管很嚴|下星期要比賽}" : "{鼻子過敏|氣管不好|家裡有小孩}"}，{把菸推了回去。|順手遞了一顆口香糖回去。}`, { who }), mood: 0 }),
          },
          {
            id: "h_smoke.rule", label: "提醒室內不能抽", hint: "菸害防制法有規定", act: "negotiate", style: "self", weight: 0.1, when: s2 => s2.year >= 2009 && s2.age >= 18,
            apply: () => ({ text: ctx.w("{who}遞菸給你，你指了指牆上的禁菸標誌：「{現在室內不能抽啦。|被檢舉要罰錢喔。}」{大家只好到外面去抽。|對方摸摸鼻子，把菸收了起來。}", { who }), mood: 1 }),
          },
        ],
      };
    },
  },
  {
    // 戒菸的契機
    id: "h_quitSmoke", domain: "health", channel: "good", ages: [18, 85], cooldown: 4, when: s => s.health.smoke, p: () => 0.12,
    choice: (s, ctx) => {
      const why = ctx.w([
        ...(s.year >= 2009 ? ["菸又漲價了，一包菸的錢{夠吃一個便當|讓你心疼了好久}。"] : []),
        ...(s.kids.length ? ["{kid}捏著鼻子說你身上都是菸味。"] : []),
        "早上起床一直咳，{爬樓梯也喘。|喉嚨卡卡的。}",
        "{健康檢查|醫生}說你的肺功能變差了。",
      ]);
      const quits = () => { s.health.smoke = false; hr(s, 0.97); };
      const who = s.kids.length ? "{kid}" : "{partner}";
      return {
        prompt: `${why}要戒菸嗎？`,
        options: [
          {
            id: "h_quitSmoke.clinic", label: s.year >= 2002 ? "去看戒菸門診" : "請醫生幫忙戒", hint: s.year >= 2012 ? "健保有補助戒菸藥" : "醫生開藥幫忙", act: "seeDoctor", style: "health", weight: 0.2,
            apply: () => {
              if (ctx.rng() < 0.5) { quits(); return { text: ctx.w("為了戒菸，你去看了{戒菸門診|醫生}，{醫生開了戒菸的藥，|每兩個星期回診一次，}{三個月後，你把最後一包菸送人了。|半年沒碰菸，吃飯都變香了。}"), mood: 4 }; }
              return { text: ctx.w("為了戒菸，你去看了{戒菸門診|醫生}，{撐了兩個月，一次加班到半夜又破功了。|藥吃完了，你也回到了老樣子。}"), mood: -1 };
            },
          },
          {
            id: "h_quitSmoke.cold", label: "自己硬戒", hint: "把菸和打火機都丟掉", act: "quitHabit", style: "risk", weight: 0.25,
            apply: () => {
              if (ctx.rng() < 0.3) { quits(); return { text: ctx.w("下定決心戒菸，你把菸和打火機全丟了，{想抽的時候就嚼口香糖，|頭兩個星期脾氣很差，}{後來真的戒掉了。|一年後，你已經聞不慣菸味了。}"), mood: 4 }; }
              return { text: ctx.w(`下定決心戒菸，你把菸全丟了，{三天後又去${shop(s)}買了一包。|撐了一個月，一次喝酒又抽回來了。}`), mood: -1 };
            },
          },
          {
            id: "h_quitSmoke.family", label: "為了家人戒", hint: s.kids.length ? "答應孩子的事" : "答應另一半的事", act: "talk", style: "family", weight: 0.15, when: s2 => s2.kids.length > 0 || !!s2.partner,
            apply: () => {
              if (ctx.rng() < 0.55) { quits(); return { text: ctx.w(`為了戒菸，你跟${who}{打勾勾|約好}，{每天少抽一根，|一想抽就去陪${who}說說話，}{半年後真的戒掉了。|戒菸滿一年那天，家裡特地吃了一頓好的。}`), mood: 5 }; }
              return { text: ctx.w(`為了戒菸，你答應了${who}，{但還是常常躲到陽台偷抽。|戒了又抽，抽了又戒。}`), mood: -1 };
            },
          },
          {
            id: "h_quitSmoke.sport", label: "用運動取代抽菸", hint: "想抽的時候就去走路", act: "exercise", style: "learn", weight: 0.1,
            apply: () => {
              if (ctx.rng() < 0.35) { quits(); return { text: ctx.w("為了戒菸，你一想抽就出門{快走|爬樓梯|騎腳踏車}，{一個月、兩個月，菸癮慢慢淡了。|後來你說，戒菸最大的收穫是多了一個運動的習慣。}"), mood: 4 }; }
              return { text: ctx.w("為了戒菸，你一想抽就出門走路，{但走著走著，又走到了賣菸的店門口。|下雨天一來，計畫就中斷了。}"), mood: -1 };
            },
          },
          {
            id: "h_quitSmoke.less", label: "先抽少一點", hint: "一天一包變半包", act: "save", style: "safe", weight: 0.2,
            apply: () => ({ text: ctx.w("想戒菸，你先從一天一包減到半包，{省下的菸錢存進了撲滿。|但總是差那臨門一腳。}"), mood: 0 }),
          },
          {
            id: "h_quitSmoke.keep", label: "現在還戒不掉", hint: "壓力大的時候需要它", act: "vice", style: "self", weight: 0.2,
            apply: () => ({ text: ctx.w("想過要戒菸，但{工作壓力一大，|一坐下來泡茶，}{手又伸向了菸盒。|還是點了一根。}{也許下次吧。|你跟自己說明年再戒。}"), mood: -1 }),
          },
        ],
      };
    },
  },
  {
    // 應酬喝酒
    id: "h_drink", domain: "health", channel: "bad", ages: [22, 65], cooldown: 4, max: 2, when: s => s.employed && !s.retired,
    p: s => (s.year < 2013 ? 0.035 : 0.025) * (["業務", "營造", "自營", "金融"].includes(s.job && s.job.field) ? 1.6 : 1),
    choice: (s, ctx) => {
      const party = ctx.rng.pick(["尾牙", "春酒", "和客戶的飯局", "部門聚餐"]);
      const boss = ctx.rng.pick(party === "和客戶的飯局" ? ["客戶", "老闆"] : ["老闆", "主管", "董事長"]);
      const drinks = ctx.rng.pick(s.year >= 1990 ? ["啤酒", "高粱", "威士忌", "紅酒"] : ["啤酒", "紹興酒", "高粱", "米酒"]);
      const scene = `${party}上${boss}一直敬酒`;
      return {
        prompt: ctx.w([
          "{party}上，{boss}舉起杯子：「{乾啦！|不喝就是不給面子喔！}」桌上的{drinks}一瓶接一瓶。要怎麼辦？",
          "{party}上，{boss}一桌一桌敬酒，眼看就要敬到你這一桌，桌上擺滿了{drinks}。要怎麼辦？",
          "{party}吃到一半，{boss}拿著一杯{drinks}走過來，大家都在起鬨。要怎麼辦？",
        ], { party, boss, drinks }),
        options: [
          {
            id: "h_drink.bottoms", label: "乾杯奉陪", hint: "氣氛到了", act: "vice", style: "risk", weight: 0.3,
            apply: () => {
              s.health.drink = true; hr(s, 1.03);
              return { text: ctx.w(`${scene}，你一杯接一杯奉陪到底，{隔天醒來頭痛欲裂，請了半天假。|{boss}拍拍你的肩膀說你夠意思。|${s.year >= 2013 ? "最後叫了代駕回家。" : "最後搭計程車回家，在車上差點睡著。"}}`, { boss }), mood: 0 };
            },
          },
          {
            id: "h_drink.tea", label: "以茶代酒", hint: "說自己不能喝", act: "quitHabit", style: "health", weight: 0.2,
            apply: () => ({ text: ctx.w(`${scene}，你端起{烏龍茶|果汁}說：「我以茶代酒！」{boss}{愣了一下，還是笑著跟你碰杯。|唸了你兩句，但也沒有勉強。}`, { boss }), mood: 0 }),
          },
          {
            id: "h_drink.sip", label: "喝一杯意思意思", hint: "敬完就停", act: "socialize", style: "safe", weight: 0.25,
            apply: () => ({ text: ctx.w(`${scene}，你喝了一杯意思意思，{之後就一直幫大家倒茶。|再有人來敬，你就舉杯沾一下嘴唇。}`), mood: 1 }),
          },
          {
            id: "h_drink.drive", label: "說要開車", hint: "喝酒不開車", act: "avoid", style: "self", weight: 0.12,
            apply: () => ({ text: ctx.w(s.year >= 2013 ? `${scene}，你說等一下要開車，{大家馬上幫你換成汽水。|{boss}點點頭：「對，喝酒不開車。」}` : `${scene}，你說等一下要{開車|騎車}，{大家起鬨說一杯沒關係，你還是堅持只喝汽水。|被笑了一整晚，你還是一口都沒喝。}`, { boss }), mood: 0 }),
          },
          {
            id: "h_drink.shield", label: "請同事幫忙擋酒", hint: "找酒量好的救援", act: "seekHelp", style: "social", weight: 0.08,
            apply: () => ({ text: ctx.w(`${scene}，你偷偷拜託{酒量好的同事|坐旁邊的學長}幫你擋，{他一口氣幫你喝了三杯。|你答應下次請他吃飯。}`), mood: 1 }),
          },
          {
            id: "h_drink.cut", label: "以後少喝", hint: "健檢的肝指數紅字了", act: "seeDoctor", style: "health", weight: 0.25, when: s2 => s2.health.drink,
            apply: () => {
              s.health.drink = false; hr(s, 0.97);
              return { text: ctx.w(`${scene}，你想起健康檢查上紅字的肝指數，{只喝了一小杯就停了。|從那天起，應酬只喝茶。}{隔年的報告好看多了。|肝指數慢慢回到正常。}`), mood: 2 };
            },
          },
        ],
      };
    },
  },
  {
    // 減重
    id: "h_weight", domain: "health", channel: "change", ages: [20, 70], cooldown: 6, max: 2, p: () => 0.022,
    choice: (s, ctx) => {
      const works = p => { if (ctx.rng() >= p) return false; hr(s, 0.97); return true; };
      return {
        prompt: ctx.w([
          `{健康檢查|公司健檢}說你體重過重，${s.year >= 2000 ? "{BMI 超過標準|腰圍也超標了}" : "{醫生要你先瘦五公斤|血壓也偏高}"}。要減重嗎？`,
          "去年的褲子穿不下了，{拉鍊拉到一半就卡住。|只好買大一號的。}要減重嗎？",
          "同學會上，大家都說你「{發福|有福氣}了」，{拍照時你一直縮小腹。|回家後你站上體重計，嚇了一跳。}要減重嗎？",
        ]),
        options: [
          {
            id: "h_weight.diet", label: "少吃澱粉和甜的", hint: "從飲食開始", act: "quitHabit", style: "safe", weight: 0.3,
            apply: () => works(0.35)
              ? { text: ctx.w("為了減重，你{晚餐的飯減成半碗|戒掉了宵夜和含糖飲料}，{半年瘦了六公斤。|慢慢穿回了原本的褲子。}"), mood: 3 }
              : { text: ctx.w("為了減重，你{少吃了兩個星期|戒了一陣子宵夜}，{一次聚餐就全吃回來了。|瘦了三公斤又胖了回來。}"), mood: -1 },
          },
          {
            id: "h_weight.fast", label: s.year >= 2017 ? "試試 168 斷食" : "乾脆不吃晚餐", hint: "聽說最快", act: "pushThrough", style: "learn", weight: 0.15,
            apply: () => works(0.3)
              ? { text: ctx.w(`為了減重，你${s.year >= 2017 ? "開始 168 斷食" : "不吃晚餐"}，{餓了就喝水，|頭一個月很難熬，}{三個月瘦了五公斤。|慢慢習慣了，體重也降下來了。}`), mood: 2 }
              : { text: ctx.w(`為了減重，你${s.year >= 2017 ? "試了 168 斷食" : "不吃晚餐"}，撐了兩個星期，{半夜餓到去${shop(s)}買泡麵。|週末一口氣吃了兩頓。}`), mood: -1 },
          },
          {
            id: "h_weight.pills", label: "買減肥茶、減肥藥", hint: "聽說喝了就會瘦", act: "lottery", style: "risk", weight: 0.1,
            apply: () => {
              pay(s, ctx.rng.between(0.02, 0.04));
              if (ctx.rng() < 0.35) { hr(s, 1.03); return { text: ctx.w("為了減重，你買了{廣告上的減肥茶|朋友推薦的減肥藥}，{吃了以後心悸、睡不著，|喝到常常跑廁所，}{去看醫生才知道裡面有不該有的成分。|醫生要你馬上停掉。}"), mood: -3 }; }
              return { text: ctx.w("為了減重，你買了{減肥茶|代餐包}，{錢花了不少，體重一點都沒變。|喝了一個月，只瘦了皮夾。}"), mood: -1 };
            },
          },
          {
            id: "h_weight.clinic", label: s.year >= 2000 ? "去減重門診" : "請醫生教你怎麼吃", hint: "照專業的方法慢慢來", act: "seeDoctor", style: "health", weight: 0.15,
            apply: () => {
              pay(s, 0.01);
              return works(0.5)
                ? { text: ctx.w("為了減重，你去找{醫院的減重門診|營養師}，{每天記錄吃了什麼，|學會看食物的熱量，}{一年瘦了八公斤，血壓也降了。|慢慢瘦下來，沒有再胖回去。}"), mood: 4 }
                : { text: ctx.w("為了減重，你去找{減重門診|營養師}，{記錄了一個月的飲食就放棄了。|知道該怎麼吃，但就是管不住嘴。}"), mood: -1 };
            },
          },
          {
            id: "h_weight.family", label: "全家一起吃清淡", hint: "一個人比較難撐", act: "talk", style: "family", weight: 0.12, when: s2 => hasFamily(s2) || s2.home === "parents",
            apply: () => works(0.4)
              ? { text: ctx.w("為了減重，你跟家人說好{一起少油少鹽|晚餐多吃青菜}，{大家都瘦了一圈。|家裡的炸物不見了，飯後多了一起散步的時間。}"), mood: 4 }
              : { text: ctx.w("為了減重，你跟家人說好一起吃清淡，{結果第三天就有人叫了炸雞。|大家撐了一個星期，又回到原本的口味。}"), mood: 0 },
          },
          {
            id: "h_weight.fine", label: "胖一點也沒關係", hint: "吃得開心最重要", act: "wait", style: "self", weight: 0.18,
            apply: () => ({ text: ctx.w("說到減重，你想了想，{胖一點也是福氣。|今天的雞排還是要吃。|開心比瘦重要。}"), mood: 1 }),
          },
        ],
      };
    },
  },
  {
    // 熬夜和睡眠
    id: "h_sleep", domain: "health", channel: "bad", ages: [15, 65], cooldown: 5, max: 2, p: () => 0.025,
    choice: (s, ctx) => {
      const habits = s.year < 1990 ? ["看電視看到收播", "聽深夜的廣播節目", "看武俠小說"] : s.year < 2005 ? ["打電動", "看第四台的電影", "上網聊天"] : s.year < 2013 ? ["掛在 MSN 上聊天", "玩線上遊戲", "看部落格"] : ["滑手機", "追劇", "看短影音"];
      const habit = s.studying && ctx.rng() < 0.4 ? "準備考試" : s.employed && ctx.rng() < 0.4 ? ctx.rng.pick(["加班", "趕報告", "輪夜班"]) : ctx.rng.pick(habits);
      const day = s.studying ? "上課" : s.employed ? "上班" : "白天";
      const rests = (p, stress) => { if (ctx.rng() >= p) return false; hr(s, 0.97); s.health.stress = Math.max(0, s.health.stress - stress); return true; };
      return {
        prompt: ctx.w([
          "這陣子你每天{habit}，常常熬到凌晨兩三點，{{day}一直打哈欠。|黑眼圈越來越深。}要怎麼辦？",
          "為了{habit}，你已經連續好幾個星期睡不到五小時，{day}時頭一點一點的。要怎麼辦？",
          "又熬到天快亮才睡。{habit}的時候一點都不睏，躺下去反而睡不著。要怎麼辦？",
        ], { habit, day }),
        options: [
          {
            id: "h_sleep.early", label: "規定自己十二點前睡", hint: "把作息調回來", act: "quitHabit", style: "health", weight: 0.3,
            apply: () => rests(0.4, 0.05)
              ? { text: ctx.w("熬夜熬了好一陣子，你規定自己十二點前上床，{一個月後，早上不用鬧鐘也會醒。|氣色好到朋友都問你是不是談戀愛了。}"), mood: 3 }
              : { text: ctx.w(`熬夜熬了好一陣子，你規定自己十二點前上床，{撐了一個星期，又回到老樣子。|躺在床上，手還是忍不住伸向${device(s)}。}`), mood: -1 },
          },
          {
            id: "h_sleep.screen", label: s.year >= 2008 ? "手機不帶進房間" : "睡前不看電視", hint: "眼不見為淨", act: "avoid", style: "learn", weight: 0.15,
            apply: () => rests(0.45, 0.05)
              ? { text: ctx.w(`熬夜熬了好一陣子，你${s.year >= 2008 ? "把手機留在客廳充電" : "睡前一小時就把電視關掉"}，{改看一點書，|關燈聽一點音樂，}{沒多久就睡著了。|一覺睡到天亮。}`), mood: 3 }
              : { text: ctx.w(`熬夜熬了好一陣子，你${s.year >= 2008 ? "試著把手機留在客廳" : "試著睡前不看電視"}，{第三天就忍不住了。|結果躺著更睡不著，又爬起來。}`), mood: -1 },
          },
          {
            id: "h_sleep.weekend", label: "週末再補眠", hint: "平常先撐著", act: "rest", style: "safe", weight: 0.25,
            apply: () => ({ text: ctx.w("熬夜熬了好一陣子，你打算週末再補回來，{一睡就睡到下午，|星期天睡了一整天，}{醒來反而更累。|星期一又開始熬。}"), mood: 0 }),
          },
          {
            id: "h_sleep.coffee", label: s.year >= 1990 ? "靠咖啡撐著" : "靠濃茶撐著", hint: "一天三杯", act: "pushThrough", style: "risk", weight: 0.18,
            apply: () => { hr(s, 1.03); s.health.stress = Math.min(1, s.health.stress + 0.05); return { text: ctx.w(`熬夜熬了好一陣子，你${s.year >= 1990 ? "{一天灌三杯咖啡|靠提神飲料}" : "{一杯接一杯喝濃茶|泡了一大壺濃茶}"}撐著，{心臟常常跳得好快。|晚上更睡不著了。}`), mood: -2 }; },
          },
          {
            id: "h_sleep.doctor", label: s.year >= 2000 ? "去看睡眠門診" : "去看醫生", hint: "也許不只是習慣的問題", act: "seeDoctor", style: "health", weight: 0.12,
            apply: () => {
              pay(s, 0.005);
              return rests(0.5, 0.1)
                ? { text: ctx.w(s.year >= 2000 ? "熬夜熬了好一陣子，你去看了睡眠門診，{醫生教你白天多曬太陽、睡前不碰螢幕，|做了睡眠檢查，才知道自己睡覺時會呼吸中止，}{慢慢睡得比較好了。|你第一次知道一覺到天亮是什麼感覺。}" : "熬夜熬了好一陣子，你去看了醫生，{醫生要你白天多曬太陽、晚上少喝茶，|醫生說是太緊張了，}{慢慢睡得比較好了。|過了一個月，作息總算回到正軌。}"), mood: 3 }
                : { text: ctx.w("熬夜熬了好一陣子，你去看了醫生，{拿了助眠的藥，但藥一停又睡不著。|醫生的建議你做了幾天就放棄了。}"), mood: -1 };
            },
          },
        ],
      };
    },
  },
  {
    // 久坐腰痠、肩頸僵硬
    id: "h_backache", domain: "health", channel: "bad", ages: [25, 75], cooldown: 6, max: 2, when: s => s.employed || s.age >= 50, p: () => 0.025,
    choice: (s, ctx) => {
      const desk = s.employed && s.job && ["行政", "科技", "金融", "設計", "行銷", "媒體", "研究", "公部門", "教育", "業務"].includes(s.job.field);
      const prompt = !s.employed
        ? ctx.w(["{搬花盆|整理陽台|拖地|搬一箱水}的時候閃到腰，{痛到直不起身。|連穿襪子都要人幫忙。}要怎麼辦？", "早上起床，腰{僵得像一塊木板|一動就抽痛}，{在床上躺了好久才爬起來。|走路都要扶著牆。}要怎麼辦？"])
        : desk
          ? ctx.w(["每天坐在電腦前{八|十}個小時，{腰|肩頸}痠到{晚上翻身都會痛|轉頭都有困難}。要怎麼辦？", "{趕完一個專案|連續加班一個月}，你的{肩膀硬得像石頭|腰一直隱隱作痛}，{坐不到一小時就要換姿勢。|連拿滑鼠的手都在痠。}要怎麼辦？"])
          : ctx.w(["每天{搬貨|站一整天|彎腰工作|開長途車}，腰痠到{早上起床要扶著床|坐下去就站不太起來}。要怎麼辦？", "{搬一箱貨|彎腰撿東西}時，腰突然閃了一下，{整個人僵在原地。|痛到冒冷汗。}要怎麼辦？"]);
      const lead = !s.employed ? "腰痛了好一陣子，" : desk ? "久坐腰痠了好一陣子，" : "腰痠了好一陣子，";
      return {
        prompt,
        options: [
          {
            id: "h_backache.rehab", label: "去復健科", hint: s.year >= 1995 ? "拿健保卡去做熱敷、拉腰" : "要自費做電療", act: "seeDoctor", style: "health", weight: 0.3,
            apply: () => { pay(s, s.year >= 1995 ? 0.005 : 0.02); return { text: ctx.w(`${lead}你去了復健科，{連續去了一個月，|每天下班就去報到，}{熱敷、電療、拉腰輪著做，|跟一群阿伯阿姨一起排隊做復健，}{慢慢好多了。|醫生還教了你幾個伸展的動作。}`), mood: 1 }; },
          },
          {
            id: "h_backache.bonesetter", label: "去國術館推拿", hint: "老師傅一喬就好", act: "seekHelp", style: "safe", weight: 0.2,
            apply: () => {
              pay(s, 0.01);
              return ctx.rng() < 0.6
                ? { text: ctx.w(`${lead}你去巷口的國術館推拿，{老師傅喬了幾下，喀的一聲，|師傅一邊推一邊說你的筋太緊，}{走出來覺得整個人輕鬆多了。|隔天就能彎腰了。}`), mood: 1 }
                : { text: ctx.w(`${lead}你去國術館推拿，{推完反而痛了三天，|師傅說要多去幾次，}{最後還是去看了醫生。|錢花了，腰還是痠。}`), mood: -1 };
            },
          },
          {
            id: "h_backache.stretch", label: "常常起來動一動", hint: "設鬧鐘提醒自己", act: "exercise", style: "learn", weight: 0.2,
            apply: () => ctx.rng() < 0.6
              ? { text: ctx.w(`${lead}你${s.employed ? "每隔一小時就起來" : "每天早晚"}做幾個伸展，{一個月後腰痠少了很多。|${s.employed ? "旁邊的同事也跟著一起做。" : "連帶睡覺也安穩了。"}}`), mood: 2 }
              : { text: ctx.w(`${lead}你設了鬧鐘提醒自己起來動，{但一忙起來就按掉了。|做了一個星期就忘了。}`), mood: -1 },
          },
          {
            id: "h_backache.patch", label: "貼痠痛貼布撐著", hint: "先不管它", act: "pushThrough", style: "risk", weight: 0.25,
            apply: () => ({ text: ctx.w(`${lead}你貼滿痠痛貼布繼續忙，{整個人都是藥膏味。|有人說你走過去像一間中藥行。|痛的時候就多貼一片。}`), mood: -2 }),
          },
          {
            id: "h_backache.rest", label: "請假休息幾天", hint: "讓身體喘口氣", act: "rest", style: "self", weight: 0.1, when: s2 => s2.employed,
            apply: () => ({ text: ctx.w(`${lead}你請了幾天假，{躺在家裡好好休息，|什麼都不做，只是睡覺，}{回去上班時腰總算直起來了。|但一回到座位上，痠痛又慢慢回來了。}`), mood: 1 }),
          },
          {
            id: "h_backache.chair", label: "換一張好椅子", hint: "花點錢換舒服", act: "invest", style: "self", weight: 0.1, when: s2 => !!desk && s2.year >= 1995,
            apply: () => { pay(s, 0.02); return { text: ctx.w(`${lead}你咬牙買了一張{人體工學椅|有護腰的椅子}，{還把螢幕墊高了一點，|順便換了一個好一點的枕頭，}{坐一整天也沒那麼痠了。|你說這是今年最值得的一筆錢。}`), mood: 2 }; },
          },
        ],
      };
    },
  },
  {
    // 手搖飲和宵夜
    id: "h_sugar", domain: "health", channel: "change", ages: [12, 65], cooldown: 6, max: 2, when: s => s.year >= 1988, p: () => 0.022,
    choice: (s, ctx) => {
      const drink = s.year < 1996 ? "泡沫紅茶" : ctx.rng.pick(s.year >= 2018 ? ["黑糖珍奶", "全糖珍奶", "手搖飲"] : ["珍珠奶茶", "全糖珍奶", "手搖飲"]);
      const snack = ctx.rng.pick(["鹹酥雞", "雞排", "滷味"]);
      const teen = s.age < 18;
      const lead = `每天一杯${drink}的習慣，`;
      const sweet = p => { if (ctx.rng() >= p) return false; hr(s, 0.98); return true; };
      return {
        prompt: ctx.w([
          `${teen ? "放學後" : "{下午三點|每天下班}"}，一杯{drink}已經變成你的習慣，{一天不喝就渾身不對勁。|有時候一天還不只一杯。}最近體重往上跑。要怎麼辦？`,
          "{晚上十點|追劇的時候|讀書讀到一半}，你又{想吃|買了}{snack}配{drink}，{這個月已經是第十次了。|肚子上的肉越來越明顯。}要怎麼辦？",
          ...(s.year >= 2016 ? ["手機一按，{drink}和{snack}半小時就送到門口，你幾乎每天晚上都在等外送。要怎麼辦？"] : []),
        ], { drink, snack }),
        options: [
          {
            id: "h_sugar.keep", label: "照喝，人生苦短", hint: s.year >= 2010 ? "這是一天的小確幸" : "這是一天的快樂", act: "vice", style: "self", weight: 0.3,
            apply: () => { hr(s, 1.03); return { text: ctx.w(`${lead}你決定不改了，{冰塊、甜度一樣都不動。|店員看到你就知道要做什麼。}{喝完心情就好了。|健康的事明天再說。}`), mood: 2 }; },
          },
          {
            id: "h_sugar.less", label: "改半糖少冰", hint: "一步一步來", act: "quitHabit", style: "safe", weight: 0.3,
            apply: () => ({ text: ctx.w(`${lead}你從全糖改成半糖，{再慢慢改成微糖去冰，|一開始覺得淡淡的，}{後來反而喝不慣太甜的了。|一個月下來，褲頭鬆了一點。}`), mood: 1 }),
          },
          {
            id: "h_sugar.tea", label: "改喝無糖茶", hint: "從今天開始", act: "quitHabit", style: "health", weight: 0.15,
            apply: () => sweet(0.6)
              ? { text: ctx.w(`${lead}你改喝無糖的{綠茶|烏龍|青茶}，{頭兩個星期覺得像在喝白開水，|嘴巴想吃甜的時候就去走一走，}{三個月後，體重和血糖都降了一點。|現在聞到全糖的味道都覺得膩。}`), mood: 2 }
              : { text: ctx.w(`${lead}你試著改喝無糖茶，{撐了十天，一次加班又點了全糖。|喝了一個星期，又回到原本的口味。}`), mood: -1 },
          },
          {
            id: "h_sugar.group", label: teen ? "跟同學一人一杯" : "揪同事一起訂", hint: "大家一起喝比較開心", act: "socialize", style: "social", weight: 0.15,
            apply: () => {
              hr(s, 1.02);
              return { text: ctx.w(teen ? `${lead}你和同學{每天放學一人一杯，|輪流請客，}{邊走邊聊，那是一天最快樂的時候。|喝完才甘願去補習。}` : `${lead}你成了辦公室的飲料團長，{每天下午統計大家要喝什麼，|湊滿外送的門檻，}{大家都很期待你的訊息。|團購群組天天熱鬧。}`), mood: 3 };
            },
          },
          {
            id: "h_sugar.bottle", label: "帶水壺喝白開水", hint: "省錢又健康", act: "save", style: "learn", weight: 0.1,
            apply: () => sweet(0.5)
              ? { text: ctx.w(`${lead}你買了一個大水壺，{每天裝滿白開水，|在水壺上貼了刻度，}{嘴巴慢慢不想喝甜的了。|省下來的飲料錢，一個月夠吃好幾頓大餐。}`), mood: 2 }
              : { text: ctx.w(`${lead}你買了一個大水壺，{用了兩個星期就放在桌上積灰塵。|水壺裡的水常常一整天都沒少。}`), mood: 0 },
          },
        ],
      };
    },
  },
  {
    // 健身熱潮：教練課推銷。這一次為什麼走進健身房，見 gymScenes。
    id: "h_gym", domain: "wealth", channel: "change", ages: [20, 55], once: true, when: s => s.year >= 2012 && (s.employed || s.savings >= 0.3), p: () => 0.03,
    choice: (s, ctx) => {
      const lasts = p => { if (ctx.rng() >= p) return false; hr(s, 0.97); s.health.fitness = Math.min(1, s.health.fitness + 0.15); return true; };
      const sc = pickScene(s, ctx, "h_gym", gymScenes(s, ctx)), open = ctx.w(sc.open), L = sc.labels;
      // The scene's own ending when it has one, else the usual one; both begin with the scene (`open`).
      const say = (key, usual) => ctx.w(`${open}${sc[key] || usual}`);
      return {
        prompt: ctx.w(sc.prompt),
        options: [
          {
            id: "h_gym.coach", label: L.coach[0], hint: L.coach[1], act: "invest", style: "risk", weight: 0.25,
            apply: () => {
              pay(s, ctx.rng.between(0.06, 0.1));
              if (ctx.rng() < 0.07) return { text: ctx.w(`${open}你簽了私人教練課，上了沒幾堂，{健身房就無預警關門，|門口貼了一張停業公告，}剩下的課程費用{一直拿不回來。|只能跟其他會員一起去消保官那裡申訴。}`), mood: -5 };
              return lasts(0.55)
                ? { text: say("coachOk", "你簽了私人教練課，{每週兩次被教練操到腿軟，|教練連你吃什麼都要管，}{一年後深蹲的重量比體重還重。|體脂降了好幾趴，衣服都要重買。}"), mood: 3 }
                : { text: say("coachBad", "你簽了私人教練課，{上了十堂就開始找理由請假，|教練換了人，你也就不去了，}{剩下的課到期都沒上完。|課程卡收在抽屜最裡面。}"), mood: -2 };
            },
          },
          {
            id: "h_gym.monthly", label: L.monthly[0], hint: L.monthly[1], act: "exercise", style: "safe", weight: 0.3,
            apply: () => {
              pay(s, 0.015);
              return lasts(0.35)
                ? { text: say("monthlyOk", `你只辦了健身房的月費自己練，{跟著網路影片學動作，|${s.employed ? "下班" : "每天傍晚"}就去跑步機上跑半小時，}{半年後體力好了很多。|練出了一點手臂的線條。}`), mood: 2 }
                : { text: say("monthlyBad", "你只辦了健身房的月費自己練，{去了幾次，人太多就懶得去了。|月費照扣，人都沒去。}"), mood: -1 };
            },
          },
          {
            id: "h_gym.home", label: L.home[0], hint: L.home[1], act: "study", style: "learn", weight: 0.15,
            apply: () => lasts(0.3)
              ? { text: say("homeOk", "你沒有買課程，在客廳鋪了一張瑜伽墊，{每天跟著影片練二十分鐘，|跳完一套就滿身大汗，}{一年都沒有中斷。|樓下鄰居大概很困擾。}"), mood: 2 }
              : { text: say("homeBad", "你沒有買課程，在家跟著影片練，{練了三天，瑜伽墊就變成貓的床。|一個星期後，影片清單只剩下「稍後觀看」。}"), mood: 0 },
          },
          {
            id: "h_gym.buddy", label: L.buddy[0], hint: L.buddy[1], act: "socialize", style: "social", weight: 0.15,
            apply: () => lasts(0.45)
              ? { text: say("buddyOk", "你沒有買課程，和{friend}約好互相督促，{每天在群組裡打卡，|每週一起去練三次，}{誰偷懶就請喝飲料。|一年後兩個人都瘦了一圈。}"), mood: 3 }
              : { text: say("buddyBad", "你沒有買課程，和{friend}約好一起練，{結果兩個人互相陪著偷懶。|練了一個月，群組就安靜了。}"), mood: 0 },
          },
          {
            id: "h_gym.no", label: L.no[0], hint: L.no[1], act: "avoid", style: "self", weight: 0.15,
            apply: () => ({ text: ctx.w(`${open}${sc.no}`), mood: 0 }),
          },
        ],
      };
    },
  },

  // ---------- mind ----------
  {
    // 壓力大到焦慮或低落。只寫看得見的小事，不寫傷害自己的細節。
    id: "h_stress", domain: "health", channel: "bad", ages: [15, 90], cooldown: 6, max: 2,
    p: s => 0.018 + (s.unemployedFor ? 0.03 : 0) + (s.health.serious ? 0.03 : 0) + (s.studying && s.age <= 18 ? 0.01 : 0),
    choice: (s, ctx) => {
      // 2023 起政府補助年輕人三次免費心理諮商（2023 年 15–30 歲，2024 年起 15–45 歲）
      const free = (s.year === 2023 && s.age <= 30) || (s.year >= 2024 && s.age <= 45);
      const prompt = s.health.serious
        ? ctx.w(["生病以後，你常常{半夜醒來就睡不著|一個人發呆}，{心裡好像壓著一塊石頭。|對什麼都提不起勁。}要怎麼辦？", "治療的這段日子，你{笑得越來越少|不太想接朋友的電話}，{連喜歡的節目都不想看了。|常常一個人望著窗外。}要怎麼辦？"])
        : s.studying && s.age <= 24
          ? ctx.w(["{考試快到了|模擬考成績一直沒起色|報告一份接一份}，你開始{睡不好|吃不下飯|胸口悶悶的}，常常{莫名其妙想哭|心跳得好快}。要怎麼辦？", "每天睜開眼睛就想到{考試|成績|升學}，你{上課都在發呆|連喜歡的事都提不起勁}。要怎麼辦？"])
          : s.unemployedFor
            ? ctx.w(["沒有工作的這段時間，你{每天醒來都覺得好累|不太想出門|看到履歷就心慌}，{整個人提不起勁。|好像被困住了。}要怎麼辦？", "找工作找了好一陣子，{每次面試完都沒有下文，|看著存款一天天變少，}你{晚上常常睡不著|連家人的關心都不想回}。要怎麼辦？"])
            : s.age >= 60 && !s.employed
              ? ctx.w([`${s.retired ? "退休以後" : s.kids.length ? "孩子都搬出去以後" : "日子安靜下來以後"}，你常常{一個人坐在客廳發呆|覺得日子好空}，{話越來越少了。|連電視都不太想開。}要怎麼辦？`, "老朋友一個個{搬走|少聯絡}了，你{整天待在家裡|飯也吃得很少}，{不知道一天要怎麼過。|心裡空空的。}要怎麼辦？"])
              : ctx.w(["最近{工作|家裡|錢}的事一件接一件，你{連續好幾個晚上睡不著|胸口一直很緊|對什麼都提不起勁}。要怎麼辦？", "{早上要出門的時候|一個人的時候}，你常常{心跳得好快|突然很想哭}，{卻說不出為什麼。|自己也嚇了一跳。}要怎麼辦？"]);
      const lead = "那陣子心裡一直很沉，";
      const lighter = x => { s.health.stress = Math.max(0, s.health.stress - x); };
      return {
        prompt,
        options: [
          {
            id: "h_stress.doctor", label: s.year >= 2000 ? "去看身心科" : "去看醫生", hint: s.year >= 1995 ? "健保就能看，不用不好意思" : "找醫生聊聊", act: "seeDoctor", style: "safe", weight: 0.17,
            apply: () => { lighter(0.2); return { text: ctx.w(`${lead}你鼓起勇氣去看了${s.year >= 2000 ? "身心科" : "醫生"}，{醫生聽你說了很久，|醫生沒有急著開藥，先問你最近睡得好不好，}{幾個星期後，你終於睡了一個好覺。|你才知道，原來很多人都有一樣的困擾。}`), mood: 3 }; },
          },
          {
            id: "h_stress.counsel", label: s.year >= 2001 ? "找心理師談談" : s.year >= 1970 ? "打電話給張老師" : "找信任的長輩聊聊",
            hint: free ? "政府補助三次免費諮商" : s.year >= 2001 ? "一週一次，慢慢整理" : "有人願意聽你說", act: s.year >= 1970 ? "counsel" : "seekHelp", style: "learn", weight: 0.15,
            apply: () => {
              lighter(0.2);
              if (s.year >= 2001) { if (!free) pay(s, 0.03); return { text: ctx.w(`${lead}你${free ? "用政府補助的免費諮商，" : ""}找了一位心理師，{每週去談一次，|在小小的諮商室裡，}{把心裡的結一個一個說出來，|慢慢學會怎麼跟自己的情緒相處，}{幾個月後，你覺得自己又能好好呼吸了。|你發現，說出來真的有用。}`), mood: 3 }; }
              if (s.year >= 1970) return { text: ctx.w(`${lead}你半夜打了張老師的電話，{電話那頭的人一直聽你說，|說到後來你哭了，對方也沒有催你，}{掛上電話時天快亮了，心裡卻輕了很多。|你第一次覺得自己不是一個人。}`), mood: 3 };
              return { text: ctx.w(`${lead}你去找了{一位信任的長輩|以前的老師}，{對方泡了一壺茶，聽你說了一整個下午。|聽完只說了一句：「慢慢來，沒關係。」}`), mood: 3 };
            },
          },
          {
            id: "h_stress.friend", label: "跟朋友聊聊", hint: "說出來會好一點", act: "talk", style: "social", weight: 0.22,
            apply: () => { lighter(0.1); return { text: ctx.w(`${lead}你約{friend}出來，{在{咖啡店|路邊攤|河堤}聊到很晚，|把心裡的事一股腦說出來，}{對方沒有多說什麼，只是一直聽。|你哭了一場，回家睡得特別沉。}`), mood: 3 }; },
          },
          {
            id: "h_stress.move", label: "去運動流流汗", hint: "讓身體先動起來", act: "exercise", style: "health", weight: 0.14,
            apply: () => { lighter(0.1); if (ctx.rng() < 0.5) hr(s, 0.98); return { text: ctx.w(`${lead}你逼自己出門{快走|騎腳踏車|游泳}，{流了一身汗，腦袋清楚了一點。|每天動一動，晚上睡得比較好了。}`), mood: 2 }; },
          },
          {
            id: "h_stress.rest", label: s.employed || s.studying ? "請假休息幾天" : "出門走走散心", hint: "讓自己喘口氣", act: s.employed || s.studying ? "rest" : "travel", style: "self", weight: 0.12,
            apply: () => {
              lighter(0.15);
              if (s.employed || s.studying) return { text: ctx.w(`${lead}你請了幾天假，{關掉手機的通知，|什麼都不想，}{睡到自然醒，去{trip}走了走。|陪自己好好吃了幾頓飯。}`), mood: 3 };
              pay(s, 0.03);
              return { text: ctx.w(`${lead}你一個人去{trip}走走，{看著{海|山}發呆了一整個下午，|在民宿睡了好幾個晚上的好覺，}{回來時心裡鬆了一些。|好像把自己找回來了一點。}`), mood: 3 };
            },
          },
          {
            id: "h_stress.push", label: "撐著，不想麻煩別人", hint: "大家都是這樣過來的", act: "pushThrough", style: "risk", weight: 0.2,
            apply: () => {
              s.health.stress = Math.min(1, s.health.stress + 0.1); hr(s, 1.03);
              const line = s.year >= 2020 ? "後來在{車站|醫院的電梯裡|超商的公告欄}看到 1925 安心專線的海報，你把號碼存進了手機。" : "";
              return { text: ctx.w(`${lead}你什麼都沒說，{照常${s.studying ? "上課" : s.employed ? "上班" : "過日子"}，|把情緒收起來，}{但夜裡常常一個人醒著。|笑容越來越少。}${line}`), mood: -3 };
            },
          },
        ],
      };
    },
  },

  // ---------- minor illness (never serious) ----------
  {
    // 牙痛：在哪裡、怎麼痛起來的，見 toothScenes。
    id: "h_tooth", domain: "health", channel: "bad", ages: [13, 90], cooldown: 10, max: 2, p: () => 0.02,
    choice: (s, ctx) => {
      const cost = s.year >= 1995 ? 0.003 : s.age >= 18 ? 0.02 : 0;   // before 全民健保 a dentist was paid in full
      const sc = pickScene(s, ctx, "h_tooth", toothScenes(s)), { lead, dentist, wait, pill, home } = sc;
      return {
        prompt: ctx.w(sc.prompt),
        options: [
          { id: "h_tooth.dentist", label: dentist[0], hint: dentist[1], act: "seeDoctor", style: "health", weight: 0.4, apply: () => { pay(s, cost); return { text: ctx.w(`${lead}${dentist[2]}`), mood: 0 }; } },
          { id: "h_tooth.wait", label: wait[0], hint: wait[1], act: "pushThrough", style: "risk", weight: 0.25, apply: () => { pay(s, cost * 2); return { text: ctx.w(`${lead}${wait[2]}`), mood: -3 }; } },
          { id: "h_tooth.pill", label: pill[0], hint: pill[1], act: "wait", style: "safe", weight: 0.2, apply: () => ({ text: ctx.w(`${lead}${pill[2]}`), mood: -1 }) },
          { id: "h_tooth.home", label: home[0], hint: home[1], act: "avoid", style: "family", weight: 0.15, apply: () => ({ text: ctx.w(`${lead}${home[2]}`), mood: -2 }) },
        ],
      };
    },
  },
  {
    // 小時候的牙齒：蛀牙、換牙
    id: "h_cavity", domain: "health", channel: "bad", ages: [4, 11], cooldown: 3, max: 2, p: () => 0.06,
    apply: (s, ctx) => {
      if (ctx.rng() < 0.3) return { text: ctx.w(["門牙掉了，{你照阿嬤說的，把下排的牙丟到屋頂上、上排的放到床底下。|你把牙齒小心包好，說要留著當紀念。}", "換牙的時候，一顆牙搖了好幾天，{最後是咬蘋果咬下來的。|爸爸拿一條線，一拉就拔起來了。}{你對著鏡子看了好久缺了一顆的笑臉。|講話一直漏風。}"]), mood: 1 };
      const t = s.year < 1980
        ? ["{吃太多糖果|偷吃了好多麥芽糖}，蛀了好幾顆牙，{媽媽帶你去鎮上的牙醫，你哭得整條街都聽得到。|牙痛到臉腫起來，阿嬤叫你含一口鹽水。}", "{吃太多糖|睡前沒刷牙}，牙齒黑了好幾顆，{第一次坐上牙醫的椅子，你緊緊抓著扶手。|看牙醫花了不少錢，家裡說以後糖果要減量。}", "蛀牙了，家人帶你去看牙醫，{鑽牙的聲音讓你記了好多年。|回家的路上，你答應以後每天刷牙。}"]
        : s.year < 1995
          ? ["蛀牙了，{媽媽騎機車載你去牙醫診所，|爸爸一路騙你說只是看看，}{結果補了三顆。|鑽牙的聲音讓你記了好多年。}", "{吃太多糖果|喝太多汽水}，蛀了好幾顆牙，{那時候還沒有健保，看一次牙醫要花不少錢。|家人一邊付錢一邊唸你。}", "{吃太多糖果|喝太多汽水}，牙齒蛀了一個洞，{牙醫叔叔要你張大嘴巴，你緊張得直發抖。|補完牙，家人獎勵你一支冰棒，牙醫聽了直搖頭。}"]
          : ["{學校的口腔檢查單|牙醫的檢查}寫著要補牙，家人帶你去{家附近的|兒童}牙醫，{牙醫阿姨送你一張貼紙。|醫生說要少喝含糖飲料。}", `蛀牙了，家人拿著你的健保卡帶你去看牙醫，{補完牙，你拿到一個小玩具。|${s.year >= 2004 ? "醫生順便幫你塗了氟。" : "醫生教你怎麼刷牙。"}}`, "睡前偷吃糖果被發現，{沒多久就蛀了一顆牙，|牙醫說是長期累積的蛀牙，}{你發誓以後每天刷牙三次。|從此以後，家人每天晚上都要檢查你有沒有刷牙。}"];
      return { text: ctx.w(t), mood: -1 };
    },
  },
  {
    // 近視
    id: "h_myopia", domain: "health", channel: "bad", ages: [7, 15], once: true, p: s => (s.year < 1980 ? 0.04 : 0.09),
    choice: (s, ctx) => {
      const [cause, short] = s.year < 1983 ? ["看太多漫畫書", "看漫畫"] : s.year < 1996 ? ["打電動", "打電動"] : s.year < 2010 ? ["打電腦", "打電腦"] : ["滑平板", "滑平板"];
      const fam = parentAlive(s) ? parentWord(s) : "家人";
      return {
        prompt: ctx.w([
          "{學校的視力檢查|坐在後排看不清楚黑板}，{你的視力只剩 0.3|老師說你可能近視了}，{fam}皺著眉頭說都是{cause}害的。要怎麼辦？",
          "看黑板的時候，你發現自己要瞇著眼睛才看得清楚，檢查才知道近視了{兩百度|一百五十度}。要怎麼辦？",
          "{視力檢查單帶回家|眼科醫生說你近視了}，{fam}說一定是{cause}害的。要怎麼辦？",
        ], { cause, fam }),
        options: [
          {
            id: "h_myopia.glasses", label: "去配眼鏡", hint: "看得清楚最重要", act: "seeDoctor", style: "safe", weight: 0.4,
            apply: () => ({ text: ctx.w("近視了，你去配了第一副眼鏡，{戴上的那一刻，才發現樹上的葉子是一片一片的。|黑板上的字突然變清楚了。}{同學開始叫你「四眼田雞」。|第一天戴眼鏡上學，你有點不好意思。}"), mood: -1 }),
          },
          {
            id: "h_myopia.drops", label: "每天晚上點散瞳劑", hint: "控制度數，但白天會怕光", act: "seeDoctor", style: "health", weight: 0.2, when: s2 => s2.year >= 1995,
            apply: () => ({ text: ctx.w("近視了，眼科醫生開了散瞳劑，{每天睡前點，|白天出門看到太陽就瞇眼，}{度數總算控制住了。|升國中的時候只多了五十度。}"), mood: 0 }),
          },
          {
            id: "h_myopia.outside", label: "下課多去操場跑", hint: s.year >= 2010 ? "學校推天天戶外 120 分鐘" : "多看遠的地方", act: "exercise", style: "learn", weight: 0.15,
            apply: () => ({ text: ctx.w("近視了，你{下課就衝去操場|放學後多在外面玩}，{每天看看遠方的綠色，|跟同學打球打到天黑，}{度數加深得比較慢。|眼睛舒服多了。}"), mood: 1 }),
          },
          {
            id: "h_myopia.limit", label: `跟家人約好少${short}`, hint: "每天只玩一小時", act: "quitHabit", style: "family", weight: 0.15,
            apply: () => ({ text: ctx.w(`近視了，你跟{fam}約好每天只能${short}一小時，{時間一到，鬧鐘就響。|偶爾偷偷多玩了十分鐘。}{度數一年只多了一點。|你開始學著自己控制時間。}`, { fam }), mood: 0 }),
          },
          {
            id: "h_myopia.hide", label: "坐到前排，不想戴眼鏡", hint: "怕被同學笑", act: "avoid", style: "self", weight: 0.1,
            apply: () => ({ text: ctx.w("近視了，你跟老師說想坐前排，{瞇著眼睛撐了一學期，|頭痛了好幾次，}{最後還是被{fam}帶去配眼鏡。|度數又加深了一些。}", { fam }), mood: -2 }),
          },
        ],
      };
    },
  },
  {
    // 流感、重感冒
    id: "h_flu", domain: "health", channel: "bad", ages: [1, 100], cooldown: 3, p: () => 0.03,
    apply: (s, ctx) => {
      const kid = s.age <= 12, carer = s.mother.alive ? "媽媽" : s.father.alive ? "爸爸" : "家人";
      const card = s.year >= 2004 ? "插了健保卡" : "拿出健保卡";
      const sick = s.age >= 6 ? "發燒請假在家" : "發燒了好幾天", where = s.age >= 6 ? "班上" : s.age >= 4 ? "幼兒園" : "家裡";
      let t;
      if (s.year === 2009) {
        t = kid
          ? [`那年新流感鬧得很大，${s.age >= 6 ? "班上兩個同學確診，全班停課在家" : "家裡的大人都戴起了口罩"}，{你也發燒躺了三天。|你在家看了好幾天的卡通。}`, `新流感在${where}傳開，你也發燒了，{carer}{每天幫你量體溫，|陪你在家關了一個星期，}{好了以後，家裡每個角落都消毒過了。|燒退的那天，你吵著要吃冰。}`]
          : ["那年新流感鬧得很大，你也中了，{發燒到三十九度，|全身痠痛，}{吃了克流感，在家休息了一個星期。|戴著口罩在家關了好幾天。}", "新流感來勢洶洶，你{咳了兩個星期|燒了三天}，{家裡每個人都戴起了口罩。|連喝水都覺得喉嚨在割。}"];
      } else if (s.year < 1995) {
        t = kid
          ? ["發高燒，{carer}揹著你去診所，{打了一針才退燒。|一路上一直摸你的額頭。}", `得了重感冒，{carer}煮了一鍋薑湯，{要你喝完再蓋兩條棉被流汗。|你躺在床上聽收音機，${s.age >= 6 ? "好幾天沒上學" : "好幾天都沒出門"}。}`, `流行性感冒在${where}傳開，你也發燒了，{carer}熬了白稀飯配肉鬆。`]
          : ["得了重感冒，{發燒躺了三天，|咳到胸口都痛，}{那時候還沒有健保，能不看醫生就不看，只去西藥房買了成藥。|看一次醫生就花掉好幾天的菜錢。}", "流感來了，你{發燒到說話都沒力氣，|全身痠痛，}{家人煮了一鍋{薑湯|雞湯}，|硬撐著做事，}{躺了好幾天才好。|拖了快兩個星期才好。}", "換季感冒，{喉嚨痛又流鼻水，|一直打噴嚏，}{去西藥房買了感冒藥，|喝了一大壺熱茶，}{睡了兩天才好。|撐了一個星期才好。}"];
      } else {
        t = kid
          ? [`${sick}，{carer}拿著你的健保卡帶你去看醫生，{回家後你蓋著棉被看了一整天卡通。|你喝了好幾天的白稀飯。}`, `流感在${where}傳開，你也發燒了，{在家休息了三天，|吃了藥昏睡了一整天，}${s.age >= 6 ? "{回學校時功課堆成一座山。|醒來發現作業都還沒寫。}" : "{醒來時{carer}正在幫你換冰枕。|好了以後又活蹦亂跳。}"}`, "半夜發高燒，{carer}{抱著你去掛急診，|整晚坐在床邊幫你換冰枕，}{天亮時燒總算退了。|你醒來時看到{carer}趴在床邊睡著了。}"]
          : [
            "得了流感，{去診所{card}看醫生，|戴著口罩去診所拿了三天的藥，}{在家躺了三天。|喉嚨痛到吞口水都難。}",
            "換季感冒，{一直咳嗽|鼻塞到睡不著}，{去診所{card}看了醫生，|請了兩天假，}{喝了好多溫開水，慢慢好了。|吃完藥就昏昏沉沉地睡，三天後才好。}",
            "流感來勢洶洶，你{發燒到三十九度|全身痠痛}，{醫生說要多休息，|請了三天假，}{家人輪流煮粥給你吃。|一個人在家吃了好幾天的泡麵。}",
            ...(s.age >= 65 && s.year >= 2001 ? ["雖然打過流感疫苗，還是得了重感冒，{好在症狀比較輕，|醫生說還好有打疫苗，}休息幾天就好了。"] : []),
            ...(s.year >= 2022 ? ["喉嚨痛又發燒，快篩{只有一條線|是陰性}，{醫生說是流感，|原來只是流感，}{在家躺了三天。|吃了藥就慢慢好了。}"] : []),
          ];
      }
      return { text: ctx.w(t, { carer, card }), mood: -2 };
    },
  },
  {
    // 腸胃炎
    id: "h_stomach", domain: "health", channel: "bad", ages: [3, 95], cooldown: 3, p: () => 0.02,
    apply: (s, ctx) => {
      const carer = s.mother.alive ? "媽媽" : s.father.alive ? "爸爸" : "家人";
      const t = s.age <= 12
        ? ["{校外教學|遠足}的時候吃壞肚子，{在遊覽車上一路忍著，|半夜一直跑廁所，}{回家後只能喝白稀飯配肉鬆。|老師打電話叫家人來接。}", "夏天吃了{路邊的冰|放太久的便當}，上吐下瀉了一整晚，{{carer}抱著你去掛急診。|隔天整個人軟趴趴的。}", ...(s.year >= 2006 ? ["班上好幾個同學一起腸胃炎，醫生說是諾羅病毒，{你在家躺了兩天。|學校把教室全部消毒了一遍。}"] : ["{吃了太多冰|喝了生水}，肚子痛了一整天，{carer}{煮了一碗白稀飯給你，|一直幫你揉肚子，}{隔天才好。|你發誓再也不偷吃冰了。}"])]
        : ["喝了{喜酒|尾牙}之後，{上吐下瀉了一整晚，|跑了一整夜的廁所，}{隔天只能喝白稀飯配肉鬆。|整個人虛脫，請了兩天假。}", "吃了路邊攤的{生魚片|生蠔|涼麵}，{肚子絞痛到冒冷汗，|半夜跑了七八趟廁所，}{去診所打了點滴才好。|好幾天不敢再碰生食。}", "{夏天的便當放太久|吃到一盤不新鮮的海鮮}，你得了腸胃炎，{醫生要你只喝運動飲料和稀飯，|一下子瘦了兩公斤，}{三天後才恢復元氣。|家人說你臉色白得像紙。}", ...(s.year >= 2006 ? ["身邊好幾個人一起腸胃炎，醫生說是諾羅病毒，{你在家躺了兩天，|家裡的門把全都用漂白水擦過，}{總算慢慢好起來。|上吐下瀉，連水都喝不下。}"] : [])];
      return { text: ctx.w(t, { carer }), mood: -2 };
    },
  },
  {
    // 過敏
    id: "h_allergy", domain: "health", channel: "bad", ages: [3, 85], cooldown: 5, max: 3, p: () => 0.02,
    apply: (s, ctx) => {
      const who = s.age <= 12 ? (s.mother.alive ? "媽媽" : s.father.alive ? "爸爸" : "家人") : "你";
      return {
        text: ctx.w([
          "{換季的時候|梅雨季一到|每天早上起床}，鼻子過敏就發作，{噴嚏打個不停，|衛生紙一包一包地用，}{講話都帶著鼻音。|眼睛也癢得受不了。}",
          "{家裡的塵蟎讓你全身發癢，|異位性皮膚炎又發作了，}{{who}把棉被拿到頂樓曬太陽。|醫生說要把絨毛娃娃收起來。}",
          ...(s.year >= 1990 ? ["{梅雨季家裡濕答答，|牆角長了霉，}你的過敏越來越嚴重，{家裡買了一台除濕機，一個晚上就集滿一桶水。|醫生開了鼻噴劑，總算能好好呼吸。}"] : []),
          ...(s.year >= 2015 ? ["空氣品質 App 一片紫色，{你咳了好幾個星期，|鼻子和喉嚨一直不舒服，}{出門都戴著口罩。|家裡多了一台空氣清淨機。}"] : []),
        ], { who }),
        mood: -1,
      };
    },
  },
  {
    // 打疫苗：只寫那個年代真的有的（種牛痘到 1979 年、1982 小兒麻痺疫情、2009 新流感、2018 年底起國一女生公費 HPV 疫苗、65 歲以上公費流感疫苗）
    id: "h_shot", ages: [0, 100], cooldown: 4, max: 3, when: s => !s.abroad && shots(s).length > 0, p: () => 0.08,
    apply: (s, ctx) => ({ text: ctx.w(shots(s)), mood: 0 }),
  },
  {
    // 老花眼
    id: "h_presbyopia", domain: "health", channel: "bad", ages: [40, 56], once: true, p: () => 0.1,
    apply: (s, ctx) => ({
      text: ctx.w([
        s.year >= 2010 ? "看手機的時候，你不自覺把手伸得越來越遠，{原來是老花眼來了。|眼科醫生笑著說：「歡迎加入老花俱樂部。」}" : "看報紙的時候，你把報紙越拿越遠，{才發現自己有老花眼了。|穿針線要請家人幫忙。}",
        `配了第一副${s.year >= 2000 ? "{老花眼鏡|多焦點眼鏡}" : "老花眼鏡"}，{放在襯衫口袋裡，|戴上之後，}{看菜單終於不用瞇眼了。|你對著鏡子看了好一會兒。}`,
        "{餐廳的菜單|藥袋上的小字|說明書}怎麼看都模糊，{你拿遠一點、再遠一點，|你摘下眼鏡、又戴上，}{終於接受自己有老花眼了。|旁邊的人笑說你在跟字拔河。}",
      ]),
      mood: -1,
    }),
  },
  {
    // 膝蓋退化：在哪裡痛起來的，見 kneeScenes。
    id: "h_knee", domain: "health", channel: "bad", ages: [55, 90], cooldown: 8, max: 2, p: () => 0.03,
    choice: (s, ctx) => {
      const sc = pickScene(s, ctx, "h_knee", kneeScenes(s)), { lead, rehab, pills, swim, inject, sit } = sc;
      return {
        prompt: ctx.w(sc.prompt),
        options: [
          { id: "h_knee.rehab", label: rehab[0], hint: rehab[1], act: "seeDoctor", style: "health", weight: 0.3, apply: () => ({ text: ctx.w(`${lead}${rehab[2]}`), mood: 1 }) },
          { id: "h_knee.pills", label: pills[0], hint: pills[1], act: "save", style: "safe", weight: 0.25, apply: () => { pay(s, 0.02); return { text: ctx.w(`${lead}${pills[2]}`), mood: 0 }; } },
          {
            id: "h_knee.swim", label: swim[0], hint: swim[1], act: "exercise", style: "learn", weight: 0.15,
            apply: () => {
              if (ctx.rng() < 0.5) { hr(s, 0.98); return { text: ctx.w(`${lead}${swim[2]}`), mood: 3 }; }
              return { text: ctx.w(`${lead}${sc.swimBad}`), mood: 0 };
            },
          },
          { id: "h_knee.inject", label: inject[0], hint: inject[1], act: "seeDoctor", style: "self", weight: 0.1, when: s2 => s2.year >= 2005, apply: () => { pay(s, ctx.rng.between(0.03, 0.05)); return { text: ctx.w(`${lead}${inject[2]}`), mood: 1 }; } },
          { id: "h_knee.sit", label: sit[0], hint: sit[1], act: "rest", style: "risk", weight: 0.2, apply: () => { hr(s, 1.03); return { text: ctx.w(`${lead}${sit[2]}`), mood: -2 }; } },
        ],
      };
    },
  },
  {
    // 保健食品、電台賣藥、群組轉傳的偏方
    id: "h_supplement", domain: "wealth", channel: "bad", ages: [40, 95], cooldown: 6, max: 2, p: () => 0.025,
    choice: (s, ctx) => {
      const era = s.year < 1990 ? 0 : s.year < 2005 ? 1 : s.year < 2015 ? 2 : 3;
      const item = ctx.rng.pick([["顧筋骨的藥丸", "補氣的藥酒"], ["保肝丸", "關節藥", "降血壓的偏方"], ["酵素", "魚油", "保健食品"], ["降血糖茶", "保健食品", "排毒酵素"]][era]);
      const source = ["廟口賣藥的", "電台主持人", "電視購物台", "LINE 群組裡轉傳的影片"][era];
      const forParent = s.age < 62 && parentAlive(s) && ctx.rng() < 0.5;
      const pw = parentWord(s);
      const sideEffect = () => { if (ctx.rng() >= 0.25) return false; hr(s, 1.03); return true; };   // something in it that should not be there
      if (forParent) {
        return {
          prompt: ctx.w([`${pw}聽了{source}的推銷，想買{item}，說吃了就不用看醫生，一盒要好幾千塊。要怎麼辦？`, `${pw}打電話來說，{source}介紹的{item}很有效，要幫你也訂一份。要怎麼辦？`], { item, source }),
          options: [
            { id: "h_supplement.buyFor", label: `買給${pw}`, hint: "讓長輩開心", act: "care", style: "family", weight: 0.3, apply: () => { pay(s, ctx.rng.between(0.02, 0.05)); return { text: ctx.w(`${pw}想買{item}，你{二話不說幫忙下訂，|拗不過，只好幫忙付錢，}{${pw}吃得很開心，說精神好多了。|後來發現，${pw}根本沒在吃。}`, { item }), mood: 1 }; } },
            { id: "h_supplement.doctor", label: `陪${pw}去問醫生`, hint: "聽聽專業的說法", act: "seeDoctor", style: "health", weight: 0.25, apply: () => ({ text: ctx.w(`${pw}想買{item}，你陪著去看醫生，{醫生耐心解釋了半天，|醫生說那個跟維他命差不多，}{${pw}才打消念頭。|回家的路上，${pw}還有點不甘心。}`, { item }), mood: 1 }) },
            { id: "h_supplement.check", label: "查資料給長輩看", hint: "用證據說服", act: "study", style: "learn", weight: 0.2, apply: () => ({ text: ctx.w(`${pw}想買{item}，你${s.year >= 2005 ? "上網查了資料" : "翻報紙找了資料"}，{一條一條念給${pw}聽，|把闢謠的新聞拿回家，}{${pw}聽完說：「好啦，不買了。」|${pw}半信半疑，但總算沒買。}`, { item }), mood: 1 }) },
            { id: "h_supplement.also", label: "自己也一起吃", hint: "陪長輩吃比較放心", act: "lottery", style: "risk", weight: 0.1, apply: () => { pay(s, ctx.rng.between(0.04, 0.08)); return sideEffect() ? { text: ctx.w(`${pw}想買{item}，你也跟著一起吃，{吃了幾個月，你開始腳水腫，|吃了以後肚子一直不舒服，}{醫生要你們兩個都馬上停掉。|才知道裡面加了不該加的東西。}`, { item }), mood: -3 } : { text: ctx.w(`${pw}想買{item}，你也跟著一起吃，{兩個人吃了半年，錢花了不少。|一起吃久了，好像也就習慣了。}`, { item }), mood: 0 }; } },
            { id: "h_supplement.leave", label: "隨長輩高興", hint: "長輩開心就好", act: "wait", style: "self", weight: 0.15, apply: () => ({ text: ctx.w(`${pw}想買{item}，你想了想，{反正吃不壞，就隨${pw}去。|說了也不聽，就隨${pw}去了。}`, { item }), mood: 0 }) },
          ],
        };
      }
      const pitch = [
        ["廟口來了一團賣藥的，又唱歌又表演，說他們的{item}什麼病都能治，旁邊的人都在掏錢。要買嗎？", "夜市有人拿著麥克風賣{item}，講得口沫橫飛，說吃了{腰不痠了|眼睛都亮了}。要買嗎？"],
        ["{地下電台|收音機}的主持人天天推銷{item}，說吃了就不用看醫生，一罐要好幾千塊。要買嗎？", "電台節目裡，聽眾一個接一個打電話進來，說吃了{item}{病都好了|整個人年輕了十歲}。要買嗎？"],
        ["{電視購物台|做直銷的朋友}推薦{item}，說可以{排毒|顧血管|增強免疫力}，一套要好幾千塊。要買嗎？", "朋友的直銷說明會上，講師拿著{item}說得天花亂墜，旁邊的人都在刷卡。要買嗎？"],
        ["{LINE 群組|親戚}轉傳了一則影片，說{item}{每天一杯就能降血糖|是醫生都不會告訴你的祕方}，還附上購買連結。要買嗎？", "網紅在影片裡推薦{item}，說自己吃了{皮膚變好|睡得更好}，限時優惠只到今天。要買嗎？"],
      ][era];
      const asked = s.kids.length ? "{kid}" : "家人";
      return {
        prompt: ctx.w(pitch, { item }),
        options: [
          { id: "h_supplement.buy", label: "買來試試看", hint: "求個心安", act: "lottery", style: "risk", weight: 0.25, apply: () => { pay(s, ctx.rng.between(0.02, 0.06)); return sideEffect() ? { text: ctx.w("買了{item}來吃，{吃了一陣子，腳開始水腫，|吃了以後肚子一直不舒服，}{醫生問你最近吃了什麼，才知道是它惹的禍。|你把剩下的全丟了。}", { item }), mood: -3 } : { text: ctx.w("買了{item}來吃，{吃了三個月，身體沒什麼變化，|每天按時吃，}{錢倒是少了不少。|心裡好像比較安心。}", { item }), mood: 0 }; } },
          { id: "h_supplement.ask", label: "先問醫生或藥師", hint: "看到底有沒有用", act: "seeDoctor", style: "health", weight: 0.25, apply: () => ({ text: ctx.w("看到{item}的推銷，你先拿去問{家醫科醫生|社區藥局的藥師}，{對方搖搖頭：「這個不如好好吃飯、好好睡覺。」|才知道裡面的成分超市就買得到。}", { item }), mood: 1 }) },
          { id: "h_supplement.check", label: s.year >= 2005 ? "上網查證" : "看看報紙怎麼說", hint: "先查清楚", act: "study", style: "learn", weight: 0.15, apply: () => ({ text: ctx.w(s.year >= 2017 ? "看到{item}的推銷，你先上{事實查核的網站|查證平台}查，{發現是一則被闢謠好幾次的假消息。|把查到的結果傳回群組，還被長輩按了讚。}" : s.year >= 2005 ? "看到{item}的推銷，你先上網查，{發現好多人說被騙。|查到衛生局公布的違規名單裡就有它。}" : "看到{item}的推銷，你先翻了翻報紙，{剛好看到查獲不法藥品的新聞。|報紙上說這種藥根本沒有效。}", { item }), mood: 1 }) },
          { id: "h_supplement.family", label: s.kids.length ? "問問孩子的意見" : "問問家人的意見", hint: "多一個人想", act: "seekHelp", style: "family", weight: 0.15, apply: () => ({ text: ctx.w(`看到{item}的推銷，你先問了${asked}，{對方說：「那是騙人的啦！」|大家七嘴八舌，最後決定不買。}`, { item }), mood: 1 }) },
          { id: "h_supplement.no", label: "不買", hint: "天下沒有神藥", act: "save", style: "safe", weight: 0.2, apply: () => ({ text: ctx.w("看到{item}的推銷，你{笑著搖搖頭，|把傳單折一折收起來，}{錢還是留著買菜比較實在。|心想天下哪有什麼神藥。}", { item }), mood: 0 }) },
        ],
      };
    },
  },

  // ---------- investing: a choice now, a look back in a year or two (arc "m_stock") ----------
  {
    // 投資機會：賺賠看那幾年的行情（MARKET）和流年
    id: "m_invest", domain: "wealth", channel: "change", ages: [22, 80], cooldown: 4, max: 2,
    when: s => s.year >= 1965 && s.savings >= 0.4 && !s.studying && !s.arcs.m_stock,
    p: s => (s.year >= 1987 && s.year <= 1989 ? 0.08 : 0.03),
    choice: (s, ctx) => {
      const y = s.year, rate = Math.round(depositRate(y) * 1000) / 10;
      const stake = Math.min(0.8, Math.max(0.1, 0.35 * s.savings));
      const start = (kind, amount) => ctx.arc.start("m_stock", { kind, stake: amount, from: y }, ctx.rng.chance(0.5) ? 1 : 2);
      const prompt = y >= 1987 && y <= 1990
        ? ctx.w([`股市${y >= 1989 ? "衝破一萬點" : "天天漲停"}，{菜市場的阿姨都在聊股票，|號子裡擠滿了人，}{同事|鄰居}說現在不買就來不及了。你手上有一筆存款，要怎麼處理？`, "{報紙|電視}天天都在報股市又創新高，{同事午休都在算賺了多少，|連{grand}都在問要買哪一支，}你手上也有一筆存款。要怎麼處理？"])
        : y >= 1999 && y <= 2000
          ? ctx.w(["{科技股|電子股}漲翻天，{同事|朋友}說「網路是未來」，要你跟著買。你手上有一筆存款，要怎麼處理？", "網路公司一家接一家上市，{同事每天都在聊電子股，|報紙說新經濟來了，}你手上也有一筆存款。要怎麼處理？"])
          : y >= 2020 && y <= 2021
            ? ctx.w(["股市一路漲，{身邊的年輕人都在開戶，|同事午休都在看盤，}{連{friend}都在聊存股。|大家都說現在進場剛好。}你手上有一筆存款，要怎麼處理？"])
            : y >= 2017 && ctx.rng() < 0.3
              ? ctx.w(["{friend}說買{比特幣|加密貨幣}賺了一倍，{一直傳價格走勢圖給你看，|說現在上車還來得及，}你手上也有一筆存款。要怎麼處理？"])
              : y >= 1987 && s.home !== "own" && ctx.rng() < 0.25
                ? ctx.w(["{同事|親戚}說房價只會漲，{勸你趕快存頭期款，|說他前年買的預售屋已經漲了兩成，}你手上有一筆存款，還不夠買房。要怎麼處理？", "{假日跟朋友去看了幾間樣品屋，|電視上的房地產節目天天在講房價，}你算了算，存款離頭期款還有一段距離。要怎麼處理？"])
              : y >= 2003 && ctx.rng() < 0.5
                ? ctx.w(["{銀行理專|保險業務員}約你喝咖啡，{推薦了幾檔基金，|說現在可以開始定期定額，}你手上有一筆存款。要怎麼處理？", "銀行寄來一份理財講座的邀請，{講師說錢放銀行會被通膨吃掉，|台下的人都在抄筆記，}你手上也有一筆存款。要怎麼處理？"])
                : ctx.w(rate < 3
                  ? ["存款放在銀行好幾年了，{利息少得可憐，|定存利率才 {rate}%，}你開始想讓錢動起來。要怎麼處理？", "{發薪日|月底}看著存摺，{錢一直躺在那裡，|利息只夠吃一頓飯，}你開始想讓錢動起來。要怎麼處理？"]
                  : ["{定存利率還有 {rate}%，|郵局的利息還不錯，}但{同事|親戚}都說股票賺得比較快。你手上有一筆存款，要怎麼處理？", "{親戚|鄰居}說買股票比放銀行好，{說得天花亂墜，|說他去年賺了一倍，}你手上也有一筆存款。要怎麼處理？"], { rate });
      const etf = y >= 2020 ? "{0050|高股息 ETF}" : "0050";
      return {
        prompt,
        options: [
          {
            id: "m_invest.deposit", label: "放定存", hint: s.home === "own" ? `利率大約 ${rate}%，穩穩的` : `利率大約 ${rate}%，也能存著當頭期款`, act: "save", style: "safe", weight: 0.3,
            apply: () => { s.savings += stake * depositRate(y); return { text: ctx.w(rate >= 5 ? "想了想，你把存款放進定存，{那時候利率有 {rate}%，|每年領一次利息，}{利息拿得很開心。|心裡很踏實。}" : "想了想，你把存款放進定存，{利息雖然不多，|一年只多了一點點，}{但睡得很安穩。|至少不會少。}", { rate }), mood: 1 }; },
          },
          {
            id: "m_invest.etf", label: "定期定額買 ETF", hint: "跟著大盤，慢慢存", act: "invest", style: "safe", weight: 0.2, when: () => y >= 2003,
            apply: () => { start("etf", stake); return { text: ctx.w(`你把一部分存款拿去定期定額買${etf}，{每個月自動扣款，|設定好就不再管它，}{你說這是給未來的自己的禮物。|漲跌都不太去看。}`), mood: 1 }; },
          },
          {
            id: "m_invest.fund", label: "買基金", hint: "交給專業經理人", act: "invest", style: "learn", weight: 0.15, when: () => y >= 1986 && y < 2017,
            apply: () => { start("fund", stake); return { text: ctx.w(`聽了{理專|朋友}的建議，你買了${y < 2000 ? "一檔共同基金" : "{一檔科技基金|一檔全球股票基金|幾檔基金}"}，{每個月收到對帳單，|偶爾看看淨值，}{有點期待，也有點緊張。|開始留意國際新聞。}`), mood: 1 }; },
          },
          {
            id: "m_invest.stock", label: "買股票", hint: y >= 1987 && y <= 1990 ? "大家都在賺" : "自己挑公司", act: "invest", style: "risk", weight: 0.25,
            apply: () => {
              start("stock", stake);
              return { text: ctx.w(y < 1997
                ? "你{開了證券戶，|拿出存款的三分之一，}{每天一有空就跑去號子看盤，|跟著同事買了幾張{電子股|銀行股|報紙上推薦的股票}，}{看著黑板上的數字跳來跳去。|晚上睡覺都夢到 K 線。}"
                : y < 2010
                  ? "你{開了網路下單的帳戶，|拿出存款的三分之一，}{買了幾張{電子股|金融股|朋友報的明牌}，|每天盯著電腦看盤，}{心情跟著紅綠燈起起落落。|上班時偷偷看了好幾次。}"
                  : "你{用手機開了證券戶，|拿出存款的三分之一，}{買了幾張{電子股|金融股|朋友推薦的股票}，|每天打開看盤 App，}{心情跟著紅綠燈起起落落。|午休時間都在研究財報。}"), mood: 1 };
            },
          },
          {
            id: "m_invest.gold", label: "買黃金", hint: "老一輩說黃金最保值", act: "invest", style: "family", weight: 0.08,
            apply: () => { start("gold", stake); return { text: ctx.w(y < 2005 ? "你去銀樓買了{幾兩金子|一條金條|幾個金戒指}，{用紅布包好收在衣櫃深處。|跟老一輩一樣，覺得這樣最安心。}" : "你{去銀樓買了幾兩金子，|開了一個黃金存摺，}{金價每天都去看一下。|覺得有黃金在手，心裡比較安心。}"), mood: 1 }; },
          },
          {
            id: "m_invest.crypto", label: "買一點加密貨幣", hint: "可能翻倍，也可能歸零", act: "invest", style: "risk", weight: 0.07, when: () => y >= 2017,
            apply: () => { start("crypto", Math.min(0.4, 0.15 * s.savings + 0.05)); return { text: ctx.w("你在交易所開了帳戶，買了一點{比特幣|以太幣}，{半夜也忍不住起來看價格。|看著數字一天跳兩成，心臟都快受不了。}"), mood: 1 }; },
          },
          {
            id: "m_invest.none", label: "不懂的不碰", hint: "錢放著最安心", act: "wait", style: "safe", weight: 0.2,
            apply: () => ({ text: ctx.w("想了想，你決定{不懂的東西不碰，|錢還是放在戶頭裡，}{照樣每個月存一點。|心裡比較踏實。}"), mood: 0 }),
          },
        ],
      };
    },
  },
  {
    // 投資一兩年後：帳面上賺或賠，要賣、要抱還是加碼？
    id: "m_investCheck", domain: "wealth", channel: "change", when: (s, ctx) => ctx.arc.at("m_stock", "start"), p: () => 1,
    choice: (s, ctx) => {
      const a = s.arcs.m_stock.data, word = KIND[a.kind];
      const r = heldReturn(a.kind, a.from, s.year - 1, ctx), years = Math.max(1, s.year - a.from);
      const note = crashNote(a.kind, a.from, s.year - 1), up = r >= 0;
      const lead = `買的${pad(word)}放了 ${years} 年，${note}帳面上${howMuch(r)}，`;
      const realize = share => { const g = clampGain(a.stake * share * r); s.savings = Math.max(0, s.savings + g); return g; };
      const hold = n => ctx.arc.go("m_stock", "hold", n);
      const app = s.year >= 2010;
      return {
        prompt: ctx.w([`買的${pad(word)}放了 ${years} 年，${note}帳面上${howMuch(r)}。{接下來怎麼做？|要賣掉嗎？}`, `{打開對帳單|看了一下帳戶}，你的${pad(word)}${note}${howMuch(r)}。接下來怎麼做？`]),
        options: [
          {
            id: "m_investCheck.sell", label: up ? "全部賣掉，落袋為安" : "認賠賣掉", hint: up ? "賺到的才是自己的" : "不想再看它往下掉", act: "sellAsset", style: "safe", weight: up ? 0.35 : 0.25,
            apply: () => { realize(1); ctx.arc.end("m_stock", "sold"); return up ? { text: ctx.w(`${lead}你全部賣掉，{把賺的錢存進戶頭，|多了一筆錢，}{心裡踏實多了。|請家人吃了一頓好的。}`), mood: 4 } : { text: ctx.w(`${lead}你咬牙全部賣掉，{認賠出場。|賠掉的錢就當作繳學費。}{之後再也不聽明牌了。|心裡反而輕鬆了。}`), mood: -4 }; },
          },
          {
            id: "m_investCheck.hold", label: "繼續抱著", hint: up ? "讓它繼續長大" : "等它漲回來", act: "wait", style: up ? "safe" : "risk", weight: 0.3,
            apply: () => { hold(2 + ctx.rng.int(3)); return up ? { text: ctx.w(`${lead}你決定繼續抱著，{告訴自己這是長期投資。|不再天天看盤。}`), mood: 2 } : { text: ctx.w(`${lead}你不甘心認賠，決定繼續抱著，{等它漲回來。|${app ? "把看盤 App 移到手機的最後一頁。" : "不再天天去看報價。"}}`), mood: -2 }; },
          },
          {
            id: "m_investCheck.more", label: "再加碼", hint: up ? "趁勝追擊" : "攤平成本", act: "invest", style: "risk", weight: 0.15, when: s2 => s2.savings >= 0.3,
            apply: () => { a.add = { stake: Math.min(0.4, 0.2 * s.savings), from: s.year }; hold(2 + ctx.rng.int(3)); return { text: ctx.w(`${lead}你又拿出一筆錢加碼，{想把握這次機會。|${up ? "覺得還會再漲。" : "想把成本攤平。"}}`), mood: up ? 2 : -1 }; },
          },
          {
            id: "m_investCheck.half", label: "賣一半，留一半", hint: "兩邊都顧", act: "save", style: "safe", weight: 0.15,
            apply: () => { realize(0.5); a.stake *= 0.5; hold(2 + ctx.rng.int(3)); return { text: ctx.w(`${lead}你賣掉一半，${up ? "{先把一部分獲利放進口袋，|先拿回一點本錢，}" : "{先把一部分損失停住，|先拿回一點錢，}"}剩下的繼續抱著。`), mood: up ? 2 : -2 }; },
          },
          {
            id: "m_investCheck.forget", label: "放著不管，不看了", hint: "眼不見為淨", act: "avoid", style: "self", weight: 0.1,
            apply: () => { hold(4 + ctx.rng.int(3)); return { text: ctx.w(`${lead}你乾脆${app ? "{刪掉了看盤 App，|把對帳單收進抽屜，}" : "{把對帳單收進抽屜，|不再去看報價，}"}{決定幾年後再說。|讓時間去處理。}`), mood: 0 }; },
          },
          {
            id: "m_investCheck.treat", label: "賣掉請全家吃大餐", hint: "賺錢就要分享", act: "care", style: "family", weight: 0.1, when: () => r > 0.1,
            apply: () => { realize(1); pay(s, 0.02); ctx.arc.end("m_stock", "sold"); return { text: ctx.w(`${lead}你全部賣掉，{請全家去吃了一頓大餐，|帶家人去{trip}玩了一趟，}{大家都好開心。|剩下的錢存了起來。}`), mood: 5 }; },
          },
        ],
      };
    },
  },
  {
    // 抱了幾年之後
    id: "m_investEnd", domain: "wealth", channel: "change", when: (s, ctx) => ctx.arc.at("m_stock", "hold"), p: () => 1,
    apply: (s, ctx) => {
      const a = s.arcs.m_stock.data, word = KIND[a.kind];
      let g = a.stake * heldReturn(a.kind, a.from, s.year - 1, ctx), base = a.stake;
      if (a.add) { g += a.add.stake * heldReturn(a.kind, a.add.from, s.year - 1, ctx); base += a.add.stake; }
      g = clampGain(g);
      s.savings = Math.max(0, s.savings + g);
      ctx.arc.end("m_stock", g >= 0 ? "gain" : "loss");
      const years = Math.max(1, s.year - a.from), note = crashNote(a.kind, a.from, s.year - 1), how = howMuch(g / Math.max(0.05, base));
      if (g >= 0.02) return { text: ctx.w([`抱了 ${years} 年的${pad(word, true, false)}，${note}最後${how}，{你全部賣掉，存款多了一截。|你賣掉一部分，拿去{換了一台新冰箱|帶家人出去玩|存成定存}。}`, `${pad(word, false)}放了 ${years} 年，${note}{你終於賣掉，|你出清了，}最後${how}，{這是你第一次覺得「長期投資」是真的。|你跟家人說，耐心真的有回報。}`]), mood: 5 };
      if (g > -0.02) return { text: ctx.w([`抱了 ${years} 年的${pad(word, true, false)}，${note}最後差不多打平，{你全部賣掉，鬆了一口氣。|你說就當作上了一堂理財課。}`, `${pad(word, false)}放了 ${years} 年，${note}算一算{只比放定存好一點點，|跟當初差不多，}{你全部賣掉，不再想了。|你決定以後錢就放定存。}`]), mood: 0 };
      return { text: ctx.w([`抱了 ${years} 年的${pad(word, true, false)}，${note}最後還是${how}，{你認賠賣掉，|你終於死心賣掉，}{從此只放定存。|記取教訓，再也不聽明牌。}`, `${pad(word, false)}放了 ${years} 年，${note}{一直沒有漲回來，|越等越低，}最後${how}。{你把對帳單收進抽屜，|你嘆了一口氣，}{跟自己說，至少學到了一課。|賣掉以後，心裡反而輕鬆了。}`]), mood: -5 };
    },
  },

  // ---------- scams, by era ----------
  {
    // 詐騙：手法跟著年代變。165 反詐騙諮詢專線 2004 年開始。
    id: "m_scam", domain: "wealth", channel: "bad", ages: [16, 95], cooldown: 8, max: 2,
    when: s => !s.abroad && (s.savings > 0.05 || s.employed || s.age >= 60),
    p: s => (s.year < 1990 ? 0.015 : s.year < 2004 ? 0.025 : 0.035) * (s.age >= 65 ? 1.3 : 1),
    choice: (s, ctx) => {
      const y = s.year, grown = s.kids.filter(k => k.age >= 15);
      const kid = grown.length ? ctx.rng.pick(grown).call : "";
      const f = s.friends.filter(x => x.alive), pal = f.length ? ctx.rng.pick(f).call : "老同學";
      // Each scam: prompts, lead (what happened, for the result line), what complying cost, who to check with, the act
      // when complying, who can stop it at the counter (bank teller or convenience-store clerk) and whether a quick
      // report can get part of the money back.
      const scam = (prompts, lead, cost, ask, act, rescue = "bank", recover = true) => ({ prompts, lead, cost, ask, act, rescue, recover });
      const list = [];
      if (y < 1990) {
        list.push(scam(["{在市場|在公車站|在廟口}，一個陌生人說他撿到一條金項鍊，{要跟你平分，要你先拿一筆錢當押金。|說他急著用錢，要便宜賣給你。}旁邊還有人一直附和。要怎麼辦？"], "陌生人說撿到一條金項鍊要跟你分，", "你把身上的錢都拿給他，{回家一看，金項鍊是鍍金的。|一轉身，那幾個人就不見了。}", "家人", "lottery", null, false));
        if (y >= 1980) list.push(scam(["{鄰居|同事}說有一家投資公司每個月配好幾趴的利息，{大家都把錢放進去了，|還有人已經領了好幾個月，}要你也一起。要怎麼辦？"], "有人找你投資一家利息高得嚇人的公司，", "你把一筆存款放進去，{頭幾個月真的有領到利息，|起初每個月都有配息，}{後來公司突然關門，老闆跑了。|有一天，辦公室人去樓空。}", "銀行的朋友", "invest", null, false));
      } else if (y < 2004) {
        list.push(scam(["{接到一通電話|收到一封信}，對方說你{中了大獎|抽中一台汽車}，{只要先匯一筆稅金，|先付手續費，}獎品就寄給你。要怎麼辦？"], "有人說你中了大獎、要先匯稅金，", "你照著匯了錢，{等了好幾個星期，什麼都沒收到。|再打過去，電話已經是空號。}", "那家公司的總機", "lottery"));
        if (y >= 2000) list.push(scam(["手機收到簡訊：「恭喜您中了{刮刮樂|手機門號抽獎}二獎，請撥打以下電話領獎。」要怎麼辦？"], "收到一則中獎簡訊，", "你打過去，對方要你去 ATM 操作「確認身分」，{戶頭裡的錢一下子少了一大截。|按完才發現，錢是轉出去，不是轉進來。}", "銀行", "lottery", null));
      } else {
        if (y < 2013) list.push(scam(["電話裡自稱是{健保局|地檢署}的人說你的{健保卡|帳戶}被盜用、涉及洗錢，要你把錢轉到「監管帳戶」。要怎麼辦？"], "有人打電話說你的帳戶涉及洗錢，", "你嚇壞了，照著指示{把存款轉了出去，|去銀行領了一筆錢交給「專員」，}{後來才知道根本沒有監管帳戶這種東西。|再打過去，電話已經打不通。}", "警察局", "lend"));
        if (y >= 2007 && y < 2018) list.push(scam(["接到一通「{網購|拍賣}客服」的電話，說你{被誤設成分期付款，|被設成重複扣款，}要你去 ATM 解除。要怎麼辦？"], "有「客服」打來說要去 ATM 解除分期付款，", "你照著電話裡的指示按 ATM，{按完才發現帳戶少了一大筆錢。|對方一直說「再按一次就好」。}", "銀行", "lend", null));
        if (kid) list.push(scam([`電話那頭有人說${kid}出了車禍撞到人，{對方要你馬上匯和解金，|說不匯錢就要告到底，}背景還有哭聲。要怎麼辦？`], `電話裡有人說${kid}出了事要你匯錢，`, `你慌得馬上去匯錢，{後來打給${kid}，才知道${kid}好好地在上課。|匯完才打通${kid}的電話，${kid}根本什麼事都沒有。}`, kid, "lend"));
        if (y >= 2012) list.push(scam([`${pal}的 LINE 突然傳來：「在嗎？可以幫我買兩張點數卡嗎？急用，明天還你。」要怎麼辦？`], `${pal}的帳號傳訊息要你幫忙買點數卡，`, `你去便利商店買了點數卡，把序號傳了過去，{後來才知道${pal}的帳號被盜了。|隔天${pal}打來說：「我沒傳過訊息給你啊！」}`, pal, "lend", "store", false));
        if (y >= 2016) list.push(scam(["社群網站上跳出一個{名牌包|家電|保健食品}的廣告，便宜得不像話，{只能貨到付款，|還倒數計時說限時特價，}要怎麼辦？"], "看到一個便宜得不像話的網路廣告，", "你下了單，{收到的是一個完全不一樣的便宜貨，|包裹打開是一包衛生紙，}{客服電話再也打不通。|網站沒多久就消失了。}", "消費者服務專線", "lottery", null, false));
        if (y >= 2018) list.push(scam(["你被加進一個「投資群組」，{老師|助理}天天曬對帳單，說{跟著買穩賺不賠|保證獲利三成}，要你先匯一筆錢進平台。要怎麼辦？"], "有個投資群組說跟著老師買穩賺不賠，", "你匯了一筆錢進去，{平台上的數字一直漲，想領出來時卻說要先繳「保證金」。|一開始真的賺到一點，後來越投越多，平台卻突然關了。}", "銀行", "invest"));
        if (y >= 2019 && s.rel !== "married" && s.age >= 25) list.push(scam(["在交友軟體上認識的人聊了好幾個月，{有一天說有一個穩賺的投資平台，|說家裡出事急需用錢，}要你先匯一筆錢。要怎麼辦？"], "網路上認識的人開口要你匯錢，", "你匯了錢，{對方又說要再匯一筆才能領出來，|沒多久對方就把你封鎖了，}{你才明白這一切都是假的。|你在房間裡坐了很久。}", "朋友", "lend"));
        if (y >= 2012) list.push(scam([`收到一則簡訊：「您的${y === 2023 ? "普發現金" : "退稅"}尚未領取，請點連結登記帳戶。」要怎麼辦？`], "收到要你點連結領錢的簡訊，", "你點了連結，輸入了{信用卡號|網路銀行的帳號}，{隔天就收到好幾筆刷卡通知。|帳戶裡的錢被轉走了一大筆。}", "銀行", "lottery", null));
        if (s.age >= 60) list.push(scam(["電話那頭的人說：「{猜猜我是誰？|是我啦，聽不出來喔？}」說自己是你多年不見的{姪子|老同事}，換了新號碼，隔天就開口借錢。要怎麼辦？"], "一個自稱多年不見的親戚打來借錢，", "你照著對方給的帳號匯了錢，{後來打給真正的親戚，對方說根本沒打過電話。|再打過去，號碼已經停話。}", "親戚", "lend"));
      }
      const { prompts, lead, cost, ask, act, rescue, recover } = ctx.rng.pick(list);
      return {
        prompt: ctx.w(prompts),
        options: [
          {
            id: "m_scam.comply", label: "照對方說的做", hint: "對方說得很急", act, style: "risk", weight: 0.12,
            apply: () => {
              // Tellers ask older customers about big transfers (2010s on); convenience-store clerks ask anyone buying game points.
              if (rescue === "bank" && y >= 2010 && s.age >= 55 && ctx.rng() < 0.35) return { text: ctx.w(`${lead}你去銀行準備匯錢，{行員多問了幾句，|行員覺得不對勁，}{幫你打了 165，才知道是詐騙。|及時把你攔了下來。}`), mood: -1 };
              if (rescue === "store" && ctx.rng() < 0.3) return { text: ctx.w(`${lead}你去便利商店要買點數卡，{店員多問了一句：「是不是有人叫你買的？」|店員看你一次買好幾張，覺得不對勁，}{你這才驚覺是詐騙。|幫你打了 165。}`), mood: -1 };
              const lost = pay(s, Math.min(0.8, Math.max(0.03, 0.25 * s.savings)));
              const back = recover && y >= 2004 && lost > 0.01 && ctx.rng() < 0.25;
              if (back) s.savings += lost / 2;
              const tail = lost <= 0.01 ? "還好戶頭裡本來就沒多少錢。" : back ? "{打 165 報案後，|報警以後，}{警察即時凍結了帳戶，拿回了一部分。|追回了一部分的錢。}" : "";
              return { text: ctx.w(`${lead}${cost}${tail}`), mood: back || lost <= 0.01 ? -4 : -7 };
            },
          },
          {
            id: "m_scam.check", label: "先打電話查證", hint: `問${ask}`, act: "talk", style: "safe", weight: 0.3,
            apply: () => ({ text: ctx.w(`${lead}你先{打給${ask}問清楚，|打電話向${ask}確認，}{才知道根本沒這回事。|對方說這是最近很常見的詐騙。}`), mood: 1 }),
          },
          {
            id: "m_scam.ignore", label: "不理它", hint: "聽起來就怪怪的", act: "avoid", style: "self", weight: 0.3,
            apply: () => ({ text: ctx.w(`${lead}你覺得怪怪的，{直接不理它，|封鎖了對方，}{繼續做自己的事。|天下沒有白吃的午餐。}`), mood: 0 }),
          },
          {
            id: "m_scam.165", label: "打 165 檢舉", hint: "反詐騙諮詢專線", act: "dispute", style: "social", weight: 0.15, when: () => y >= 2004,
            apply: () => ({ text: ctx.w(`${lead}你撥了 165，{警察說這是最近很流行的手法，|值班的警察幫你把資料通報上去，}{還提醒你家裡的長輩也要小心。|${y >= 2008 ? "你把經過寫成一篇貼文提醒朋友。" : "你回家把這件事告訴了家人。"}}`), mood: 2 }),
          },
          {
            id: "m_scam.family", label: "先問家人的意見", hint: "多一個人想", act: "seekHelp", style: "family", weight: 0.13,
            apply: () => ({ text: ctx.w(`${lead}你先問了${s.kids.length && !kid ? "{kid}" : "家人"}，{對方一聽就說：「那是詐騙啦！」|大家七嘴八舌，最後決定不理它。}`), mood: 1 }),
          },
        ],
      };
    },
  },

  // ---------- 標會 (rotating savings, common until the 1990s): join now, settle two years later (arc "m_hui") ----------
  {
    id: "m_hui", domain: "wealth", channel: "change", ages: [20, 75], cooldown: 6, max: 2,
    when: s => s.year <= 1999 && !s.abroad && !s.studying && !s.arcs.m_hui && (s.employed || s.savings >= 0.2), p: () => 0.05,
    choice: (s, ctx) => {
      const amount = s.year < 1970 ? "兩百塊" : s.year < 1980 ? "五百塊" : s.year < 1990 ? "兩千塊" : "五千塊";
      const head = ctx.rng.pick(["鄰居阿姨", "菜市場的王大姐", "公司的李大姐", "隔壁的阿桑"]);
      const join = (stake, checked) => ctx.arc.start("m_hui", { stake, checked, head }, 2);
      return {
        prompt: ctx.w(["{head}在起一個會，{二十個會腳|十幾個人}，每個月{amount}，{標到的人可以先拿一筆錢。|一直沒標的人最後能多領利息。}她問你要不要跟。要怎麼辦？", "{head}來家裡泡茶，說她新起了一個會，每個月{amount}，{大家都是熟人，|已經有十幾個人跟了，}問你要不要跟一會。要怎麼辦？"], { head, amount }),
        options: [
          {
            id: "m_hui.join", label: "跟一會", hint: "每個月存一點，還有利息", act: "save", style: "social", weight: 0.35,
            apply: () => { join(ctx.rng.between(0.2, 0.35), false); return { text: ctx.w("{head}起的會，你跟了一會，{每個月把會錢交給{head}，|每個月按時繳錢，}{順便聊聊天。|存摺以外，又多了一種存錢的方法。}", { head }), mood: 1 }; },
          },
          {
            id: "m_hui.two", label: "跟兩會", hint: "想多賺一點利息", act: "invest", style: "risk", weight: 0.1,
            apply: () => { join(ctx.rng.between(0.5, 0.7), false); return { text: ctx.w("{head}起的會，你一口氣跟了兩會，{每個月的會錢要從薪水裡省下來，|算一算，滿期的利息比郵局好多了，}{你覺得很划算。|有點吃緊，但你覺得值得。}", { head }), mood: 1 }; },
          },
          {
            id: "m_hui.ask", label: "先打聽會頭的為人", hint: "倒會的新聞太多了", act: "seekHelp", style: "learn", weight: 0.2,
            apply: () => {
              if (ctx.rng() < 0.75) { join(ctx.rng.between(0.2, 0.35), true); return { text: ctx.w("{head}起的會，你先到處打聽，{知道她做人很實在，|聽說她起了十幾年的會都沒出過事，}才放心跟了一會。", { head }), mood: 1 }; }
              return { text: ctx.w("{head}起的會，你先到處打聽，{聽說她最近手頭很緊，|聽說她同時起了好幾個會，}你就客氣地婉拒了。", { head }), mood: 0 };
            },
          },
          {
            id: "m_hui.post", label: "錢放郵局就好", hint: "穩穩的", act: "wait", style: "safe", weight: 0.25,
            apply: () => ({ text: ctx.w("{head}起的會，你笑著婉拒了，{錢照樣存在郵局，|每個月照樣存進郵局的存簿，}{少一點利息，多一點安心。|{head}也沒有不高興。}", { head }), mood: 0 }),
          },
          {
            id: "m_hui.lead", label: "自己來當會頭", hint: "先拿第一筆，但要負責收錢", act: "borrow", style: "risk", weight: 0.05, when: s2 => s2.age >= 30,
            apply: () => {
              s.savings += 0.25; ctx.arc.start("m_hui", { stake: 0.25, lead: true, head: "你" }, 2);
              return { text: ctx.w("你自己起了一個會，找了{十幾個|二十個}親友當會腳，{第一筆會錢先拿去{週轉|添購家電|修房子}，|每個月挨家挨戶去收會錢，}{你把帳記得清清楚楚。|責任重大，一點都不敢馬虎。}"), mood: 1 };
            },
          },
        ],
      };
    },
  },
  {
    // 會期結束：拿回會錢和利息，或是倒會
    id: "m_huiEnd", domain: "wealth", channel: "bad", when: (s, ctx) => ctx.arc.at("m_hui", "start"), p: () => 1,
    apply: (s, ctx) => {
      const a = s.arcs.m_hui.data, head = a.head;
      if (a.lead) {
        if (ctx.roll("wealth", "bad", 0.12)) {
          pay(s, a.stake + ctx.rng.between(0.1, 0.25)); ctx.arc.end("m_hui", "short");
          return { text: ctx.w("你起的會，有一個會腳標走會錢以後就{跑了，|不繳了，}{你只好自己掏錢補上。|你挨家挨戶去道歉，自己貼了一大筆。}"), mood: -6 };
        }
        pay(s, a.stake * 1.08); ctx.arc.end("m_hui", "done");
        return { text: ctx.w("你起的會順利結束，{每個會腳都拿到該拿的錢，|最後一次收完會錢，}{大家說下次還要跟你的會。|你在帳本上畫了一個大大的圈。}"), mood: 2 };
      }
      if (ctx.roll("wealth", "bad", a.checked ? 0.05 : 0.15)) {
        pay(s, a.stake * ctx.rng.between(0.5, 1)); ctx.arc.end("m_hui", "collapsed");
        return { text: ctx.w("{head}起的會倒了，{她說週轉不靈，|有一天她突然搬走了，}{會腳們在她家門口等了好幾天，|大家一起去警察局備案，}{錢只拿回一點點。|你繳的會錢大半都拿不回來了。}", { head }), mood: -6 };
      }
      s.savings += a.stake * ctx.rng.between(0.08, 0.18); ctx.arc.end("m_hui", "done");
      return { text: ctx.w("{head}起的會{滿期了|結束了}，{你在急用錢的那個月標了下來，|你一直沒標，最後收了一筆利息，}{剛好拿去{換了一台機車|繳了學費|存成定存}。|一筆錢拿得剛剛好。}", { head }), mood: 3 };
    },
  },

  // ---------- spending and borrowing ----------
  {
    // 雙卡風暴前後（2001–2007）：路邊辦卡送贈品、現金卡、循環利息
    id: "m_cards", domain: "wealth", channel: "bad", ages: [20, 50], once: true, when: s => s.year >= 2001 && s.year <= 2007 && !s.abroad && !s.studying, p: () => 0.08,
    choice: (s, ctx) => {
      const gift = ctx.rng.pick(["行李箱", "保溫杯", "玩偶", "電影票"]);
      const lead = "那幾年人手好幾張卡，";
      return {
        prompt: ctx.w([
          "{百貨公司門口|捷運站出口|夜市}有人在辦信用卡，{辦一張就送{gift}，|說年費全免，}你的皮夾裡已經有三張卡了。要怎麼辦？",
          "銀行一直打電話來推銷現金卡，說{隨借隨還、按日計息|額度馬上就下來}，{同事也有好幾張。|電視上天天打廣告。}要怎麼辦？",
          "這個月的帳單來了，{三張卡加起來|信用卡加現金卡}的金額讓你倒抽一口氣，{最低應繳只要幾千塊。|循環利息的數字越滾越大。}要怎麼辦？",
        ], { gift }),
        options: [
          {
            id: "m_cards.more", label: "再辦一張拿贈品", hint: "反正不一定要刷", act: "hobby", style: "self", weight: 0.25,
            apply: () => {
              if (ctx.roll("wealth", "bad", 0.35)) { s.debt += 0.25; return { text: ctx.w(`${lead}你又辦了一張，{贈品拿了，卡也越刷越多，|一張刷不夠就刷另一張，}{後來每個月只繳最低應繳，循環利息滾得比薪水還快。|帳單一來，你都不太敢打開。}`), mood: -4 }; }
              return { text: ctx.w(`${lead}你又辦了一張，{贈品拿回家，卡收在抽屜裡沒怎麼用。|只在週年慶的時候刷了一次。}`), mood: 1 };
            },
          },
          {
            id: "m_cards.cash", label: "辦現金卡應急", hint: "手頭緊的時候方便", act: "borrow", style: "risk", weight: 0.12,
            apply: () => {
              s.savings += 0.1; s.debt += 0.2;
              if (ctx.roll("wealth", "bad", 0.4)) { s.debt += 0.15; return { text: ctx.w(`${lead}你辦了現金卡，{第一次領錢時覺得好方便，|額度用完又申請調高，}{借了又借，最後光利息就繳不完。|欠的錢越來越多，連催收的電話都來了。}`), mood: -5 }; }
              return { text: ctx.w(`${lead}你辦了現金卡，{只在月底手頭緊的時候借一點，|借了一筆應急，}{發薪水就馬上還清。|三個月就還完了。}`), mood: 0 };
            },
          },
          {
            id: "m_cards.full", label: "每個月全額繳清", hint: "只刷付得起的", act: "save", style: "safe", weight: 0.3,
            apply: () => ({ text: ctx.w(`${lead}你給自己定了規矩：{每個月全額繳清，|只刷付得起的東西，}{從來不碰循環利息。|多的卡全部停掉。}`), mood: 0 }),
          },
          {
            id: "m_cards.cut", label: "把多的卡剪掉", hint: "只留一張", act: "quitHabit", style: "learn", weight: 0.2,
            apply: () => ({ text: ctx.w(`${lead}你拿出剪刀，{把多的卡一張一張剪掉，|只留下一張最常用的，}{開始記帳。|皮夾一下子變薄了，心裡卻輕了。}`), mood: 1 }),
          },
          {
            id: "m_cards.negotiate", label: "去銀行談債務協商", hint: "談成分期慢慢還", act: "negotiate", style: "social", weight: 0.2, when: s2 => s2.year >= 2006 && s2.debt > 0,
            apply: () => { s.debt *= 0.7; return { text: ctx.w(`${lead}你的卡債越滾越大，只好去銀行談債務協商，{談成分好幾年慢慢還，|利息降了一些，}{每個月繳得出來，心裡踏實多了。|你發誓再也不碰循環利息。}`), mood: 1 }; },
          },
          {
            id: "m_cards.ask", label: "問懂理財的朋友", hint: "聽聽別人怎麼做", act: "seekHelp", style: "social", weight: 0.13,
            apply: () => ({ text: ctx.w(`${lead}你去問了{friend}，{對方拿出自己的記帳本給你看，|對方說「卡是工具，不是錢」，}{你回家把每張卡的額度都調低了。|你開始學著記帳。}`), mood: 1 }),
          },
        ],
      };
    },
  },
  {
    // 買車（不是買房：車貸小，幾年就還完）
    id: "m_car", domain: "wealth", channel: "change", ages: [25, 65], cooldown: 8, max: 2, p: s => (s.home === "own" ? 0.05 : 0.025),
    // Home first: before owning one, only savings well above the down payment (core.js) leave room for a car.
    when: s => s.employed && s.year >= 1975 && !s.abroad && s.savings >= (s.home === "own" ? 0.8 : 2.5),
    choice: (s, ctx) => {
      const y = s.year, fam = hasFamily(s);
      const mrt = { 臺北市: 1996, 新北市: 1996, 高雄市: 2008, 桃園市: 2017, 臺中市: 2021 }[s.county];
      const transit = mrt && y >= mrt ? "捷運" : "公車和客運";
      const lead = "想買車想了好一陣子，";
      return {
        prompt: ctx.w([
          "{每天騎機車上班淋雨，|下雨天騎車實在太辛苦，}你開始想買一台車，存款也夠付頭款了。要買嗎？",
          ...(fam ? ["{假日想帶家人出遊，|全家出門總是大包小包，}你開始看車。要買嗎？"] : []),
          ...(y < 1990 ? ["{同事|鄰居}陸續買了自用車，{假日開車載全家出遊，|停在巷口擦得發亮，}你也開始心動。要買車嗎？"] : []),
          ...(y >= 2018 ? ["路上的電動車越來越多，{充電站|充電樁}也越蓋越多，{friend}一直推薦你換電動車。要買車嗎？"] : []),
        ]),
        options: [
          {
            id: "m_car.new", label: "買一台新車", hint: "貸款買，每個月繳車貸", act: "borrow", style: fam ? "family" : "self", weight: 0.3,
            apply: () => { pay(s, Math.min(0.4, 0.25 * s.savings)); s.debt += 0.3; return { text: ctx.w(`${lead}你簽約買了一台新車，{交車那天，你開著新車去廟裡過爐。|第一次載家人兜風，你開得特別慢。|在後照鏡上掛了一個平安符。}`), mood: 5 }; },
          },
          {
            id: "m_car.used", label: "買二手車", hint: "便宜一點，要看運氣", act: "lottery", style: "safe", weight: 0.25,
            apply: () => {
              pay(s, ctx.rng.between(0.2, 0.3));
              if (ctx.rng() < 0.2) { pay(s, 0.05); return { text: ctx.w(`${lead}你買了一台二手車，{沒多久就開始修東修西，|冷氣壞了、電瓶也沒電了，}{修車錢都快趕上車價了。|你跟修車廠的老闆變成了熟人。}`), mood: -1 }; }
              return { text: ctx.w(`${lead}你買了一台{開了五年|開了八年}的二手車，{車況還不錯，|價錢只要新車的一半，}{假日終於可以開車出去走走了。|你每個週末都自己洗車。}`), mood: 3 };
            },
          },
          {
            id: "m_car.ev", label: "買電動車", hint: "省油錢，要找地方充電", act: "invest", style: "learn", weight: 0.12, when: () => y >= 2018,
            apply: () => { pay(s, Math.min(0.45, 0.3 * s.savings)); s.debt += 0.3; return { text: ctx.w(`${lead}你買了一台電動車，{在家裡的車位裝了充電樁，|第一次開上高速公路，安靜得不習慣，}{出門前要先查哪裡有充電站。|加油錢省下了一大筆。}`), mood: 4 }; },
          },
          {
            id: "m_car.scooter", label: y >= 2016 ? "換一台電動機車就好" : "換一台新機車就好", hint: "在台灣騎機車最方便", act: "save", style: "self", weight: 0.18,
            apply: () => { pay(s, ctx.rng.between(0.05, 0.08)); return { text: ctx.w(`${lead}你想想還是機車最方便，換了一台${y >= 2016 ? "{電動機車|新機車}" : "新機車"}，{停車不用繞圈圈，|鑽小巷子也不怕，}{省下來的錢存了起來。|上下班照樣快。}`), mood: 2 }; },
          },
          {
            id: "m_car.no", label: `先不買，搭${transit}`, hint: "車子是錢坑", act: "wait", style: "safe", weight: 0.2,
            apply: () => ({ text: ctx.w(`${lead}你算了算油錢、停車費和保險，{還是決定先不買。|覺得搭${transit}就夠了。}{需要的時候再租車。|省下來的錢存了起來。}`), mood: 0 }),
          },
        ],
      };
    },
  },
  {
    // 換手機：大哥大、B.B.Call、掀蓋機、智慧型手機
    id: "m_phone", domain: "wealth", channel: "change", ages: [18, 80], cooldown: 8, max: 2, when: s => s.year >= 1990 && !s.abroad, p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year, pw = parentWord(s), day = s.studying ? "放學" : s.employed ? "下班" : "晚上";
      const cost = y < 1997 ? 0.15 : y < 2008 ? 0.03 : 0.06;   // years of median pay
      const prompt = y < 1997
        ? ctx.w(["{同事|朋友}拿出一支大哥大，{講話的聲音整個餐廳都聽得到。|你羨慕得不得了。}一支要好幾萬塊。要買嗎？", "身邊的人腰上都掛著一台 B.B.Call，{一響就要找公用電話回電。|你覺得自己好像跟不上了。}要跟著買嗎？"])
        : y < 2002
          ? ctx.w(["手機越來越便宜，{可以傳簡訊|有中文輸入|可以換鈴聲}的新手機{剛上市|在電視上打廣告}，{身邊的人幾乎都有一支了。|你的 B.B.Call 好像落伍了。}要買嗎？"])
          : y < 2008
            ? ctx.w(["{彩色螢幕|和弦鈴聲|可以照相|掀蓋}的新手機{剛上市|在電視上打廣告}，你的舊手機{只能玩貪食蛇|按鍵都磨亮了}。要換嗎？"])
            : y < 2014
              ? ctx.w(["大家都在換智慧型手機，{滑來滑去的觸控螢幕|可以裝 App}，你的舊手機{連上網都慢|被笑是古董}。要換嗎？"])
              : y === 2018
                ? ctx.w(["電信公司推出 499 吃到飽，{門市外大排長龍，|網路上吵翻天，}{friend}約你一起去排隊換約。要怎麼辦？", "新手機{發表了|開賣了}，你的手機{電池撐不到{day}|摔到螢幕裂了一條線}，剛好電信公司在推 499 吃到飽。要換嗎？"], { day })
                : y < 2030
                  ? ctx.w(["新手機{發表了|開賣了}，{相機又更強了|螢幕更大了}，你的手機{電池撐不到{day}|摔到螢幕裂了一條線}。要換嗎？"], { day })
                  : ctx.w(["新一代的手機{又輕又快|多了好幾個新功能}，你的手機已經用了好幾年，{反應越來越慢。|電池也不太行了。}要換嗎？"]);
      return {
        prompt,
        options: [
          {
            id: "m_phone.newest", label: y < 1997 ? "買一支大哥大" : "買最新款", hint: y < 1997 ? "一支要好幾萬塊" : "一次到位", act: "hobby", style: "self", weight: 0.25,
            apply: () => {
              pay(s, cost * ctx.rng.between(0.8, 1.3));
              return { text: ctx.w(y < 1997 ? "你咬牙買了一支大哥大，{走到哪裡都拿在手上，|第一通電話打給家人，}{通話費貴得嚇人，講話都要很快。|朋友都跑來借看。}" : y < 2008 ? "你換了一支{新上市的|最流行的}手機，{第一件事就是換一個新鈴聲。|拿它拍了好多模糊的照片。|把通訊錄一個一個重新輸入。}" : "你換了最新的手機，{第一天就把照片都搬了過去，|貼好保護貼、套上手機殼，}{拍照好看到捨不得放下。|跟舊手機合照了一張才收起來。}"), mood: 3 };
            },
          },
          {
            id: "m_phone.contract", label: "綁約拿便宜手機", hint: "月租費貴一點", act: "negotiate", style: "safe", weight: 0.25, when: () => y >= 1997,
            apply: () => { pay(s, cost * 0.3); return { text: ctx.w(y === 2018 ? "你排了好久的隊，{終於辦到 499 吃到飽，|在門市外等到半夜才輪到你，}{手機也順便換了一支。|上網再也不用省著用。}" : `你到門市綁了{兩年|三十個月}的約，{手機幾乎不用錢，|月租費多了一點，}{店員還送了你一個${y >= 2012 ? "{手機殼|行動電源}" : "{手機吊飾|皮套}"}。|合約到期的日子你記在月曆上。}`), mood: 2 }; },
          },
          {
            id: "m_phone.installment", label: "刷卡分期", hint: "零利率分 24 期", act: "borrow", style: "risk", weight: 0.15, when: s2 => y >= 2003 && s2.age >= 20,
            apply: () => { s.debt += cost; return { text: ctx.w("你刷卡分了{二十四|十二}期，{每個月的帳單多了一筆，|零利率聽起來很划算，}{手機到手的時候還是很開心。|你跟自己說，分期也是一種理財。}"), mood: 2 }; },
          },
          {
            id: "m_phone.keep", label: "舊的還能用", hint: "壞了再換", act: "save", style: "safe", weight: 0.25,
            apply: () => ({ text: ctx.w(y < 1997 ? "你想了想，{公用電話也很方便，|還是先不要，}{把錢存了下來。|等價錢降了再說。}" : "你看了看手上的舊手機，{螢幕裂了也還能用，|貼一張新的保護貼就好，}{決定再撐一年。|錢先留著。}"), mood: 0 }),
          },
          {
            id: "m_phone.pager", label: "先買一台 B.B.Call", hint: "便宜，有人找就回電", act: "wait", style: "social", weight: 0.2, when: () => y < 2000,
            apply: () => { pay(s, 0.01); return { text: ctx.w(`你先買了一台 B.B.Call 掛在腰上，{一響就到處找公用電話回電，|朋友用數字暗號傳訊息給你，}{覺得自己終於跟上流行了。|${s.age <= 22 ? "收到第一個 520 的時候，你偷偷笑了一整天。" : "你背熟了好幾組數字暗號。"}}`), mood: 2 }; },
          },
          {
            id: "m_phone.used", label: "買二手的", hint: "便宜一半", act: "lottery", style: "learn", weight: 0.1,
            apply: () => { pay(s, cost * 0.5); return { text: ctx.w(y < 1997 ? "你跟朋友買了一支二手的大哥大，{便宜了好幾千塊，|外殼有一點刮痕，}{講起電話來一樣大聲。|電池沒多久就不太行了。}" : `你在${y >= 2000 ? "{網拍|朋友那裡}" : "朋友那裡"}買了一支二手手機，{便宜了一半，|只有角落有一點刮痕，}{用起來跟新的差不多。|電池沒多久就不太行了。}`), mood: 1 }; },
          },
          {
            id: "m_phone.parents", label: `順便幫${pw}換一支`, hint: y >= 2012 ? "長輩也想用 LINE" : "讓長輩找得到你", act: "care", style: "family", weight: 0.15, when: s2 => y >= 2000 && s2.age >= 25 && parentAlive(s2),
            apply: () => { pay(s, cost * 1.5); return { text: ctx.w(`你也幫${pw}換了一支新手機，{教了好幾個晚上才學會傳訊息，|幫${pw}把字體調到最大，}${y >= 2012 ? "{從此每天早上都收到長輩圖。|" : "{從此你常常接到家裡打來的電話。|"}${pw}一直跟鄰居炫耀。}`), mood: 3 }; },
          },
        ],
      };
    },
  },
  {
    // 一筆意外之財（比 core.js 的 windfall 小）
    id: "m_bonus", domain: "wealth", channel: "good", ages: [18, 90], cooldown: 6, max: 2, when: s => !s.studying || s.age >= 20, p: () => 0.025,
    choice: (s, ctx) => {
      const y = s.year, pw = parentWord(s);
      const sources = [["統一發票對中了二獎", 0.07], ["統一發票對中了頭獎", 0.3]];
      if (s.employed) sources.push(["年終獎金比預期多了兩個月", 0.15 * s.income], [`尾牙抽中了${y >= 2005 ? "{現金大獎|一台液晶電視|一台機車}" : "{現金大獎|一台電視|一台機車}"}`, 0.08]);
      if (y >= 2002) sources.push(["刮刮樂刮中了一萬塊", 0.02]);
      if (s.age >= 50 && y >= 1995) sources.push(["多年前買的儲蓄險到期，領回了一筆錢", 0.3]);
      const [src0, x] = ctx.rng.pick(sources);
      const src = ctx.w(src0);
      return {
        prompt: ctx.w([`${src}，{多了一筆錢。|戶頭裡突然多了一筆。}要怎麼用？`, `${src}！{你盯著數字看了好幾遍。|你高興得跳了起來。}這筆錢要怎麼用？`]),
        options: [
          {
            id: "m_bonus.save", label: "存起來", hint: "以後用得到", act: "save", style: "safe", weight: 0.35,
            apply: () => { s.savings += x; return { text: ctx.w(`${src}，你把錢{全部存了起來，|存進定存，}{以備不時之需。|存摺上的數字讓你很安心。}`), mood: 3 }; },
          },
          {
            id: "m_bonus.invest", label: "拿去投資", hint: "讓錢滾錢", act: "invest", style: "risk", weight: 0.15,
            apply: () => {
              const r = Math.max(-0.6, Math.min(1, 0.8 * (MARKET.stock[y] ?? 0.06) + 0.25 * ctx.rng.normal() + (ctx.odds("wealth", "good", 0.5) - 0.5) * 0.4));
              s.savings += x * (1 + r);
              return r >= 0 ? { text: ctx.w(`${src}，你把這筆錢拿去{買股票|買基金}，{一年下來又多賺了一些。|運氣不錯，又滾出了一點利潤。}`), mood: 4 } : { text: ctx.w(`${src}，你把這筆錢拿去{買股票|買基金}，{遇到大盤下跌，|買在高點，}{一年後只剩下一部分。|帳面上一片綠油油。}`), mood: -2 };
            },
          },
          {
            id: "m_bonus.treat", label: "犒賞自己", hint: "辛苦這麼久了", act: "travel", style: "self", weight: 0.2,
            apply: () => { s.savings += 0.3 * x; return { text: ctx.w(`${src}，你{去{trip}好好玩了一趟，|買了一直捨不得買的{相機|包包|按摩椅}，}{開心了好幾個月。|覺得值得。}`), mood: 5 }; },
          },
          {
            id: "m_bonus.debt", label: "先還債", hint: "無債一身輕", act: "borrow", style: "safe", weight: 0.3, when: s2 => s2.debt > 0,
            apply: () => { const p = Math.min(s.debt, x); s.debt -= p; s.savings += x - p; return { text: ctx.w(`${src}，你拿去{還了一部分的債，|把欠的錢一口氣繳清，}{每個月的壓力小了很多。|心裡的大石頭總算放下了。}`), mood: 4 }; },
          },
          {
            id: "m_bonus.family", label: parentAlive(s) ? `包紅包給${pw}` : "帶家人吃大餐", hint: "一起分享", act: "care", style: "family", weight: 0.2, when: s2 => parentAlive(s2) || s2.kids.length > 0,
            apply: () => { s.savings += 0.5 * x; return { text: ctx.w(parentAlive(s) ? `${src}，你包了一個大紅包給${pw}，{${pw}嘴上說不用，還是笑著收下了。|${pw}拿去跟鄰居炫耀了好幾天。}` : `${src}，你帶{kids}去吃了一頓大餐，{大家吃得好開心。|大家舉杯說要常常中獎。}`), mood: 4 }; },
          },
          {
            id: "m_bonus.donate", label: "捐一部分出去", hint: "分一點給需要的人", act: "donate", style: "social", weight: 0.05,
            apply: () => { s.savings += 0.7 * x; ctx.nudge("warmth", 0.02); return { text: ctx.w(`${src}，你把一部分捐給了{育幼院|偏鄉學校|動物收容所|急難救助}，{收到一張手寫的謝卡。|心裡很踏實。}`), mood: 3 }; },
          },
        ],
      };
    },
  },
  {
    // 物價上漲：石油危機（1973–74、1979–81）、2008 油價、2018 衛生紙之亂、2022–23 通膨和缺蛋
    id: "m_prices", domain: "wealth", channel: "bad", ages: [18, 95], cooldown: 4, max: 2,
    when: s => !s.abroad && [1973, 1974, 1979, 1980, 1981, 2008, 2018, 2022, 2023].includes(s.year), p: () => 0.12,
    choice: (s, ctx) => {
      const y = s.year, lead = "物價一直漲，";
      const prompt = y <= 1974
        ? ctx.w(["石油危機，{油價和電費一下子漲了好多，|菜市場的價錢一天一個樣，}{薪水卻沒跟著漲。|家裡每次買菜回來都在嘆氣。}要怎麼辦？", "{米|沙拉油|公車票}又漲價了，報紙上天天都是石油危機的新聞，手上的錢越來越薄。要怎麼辦？"])
        : y <= 1981
          ? ctx.w(["第二次石油危機，{公車票|米|沙拉油}又漲價了，{薪水追不上物價。|手上的錢越來越薄。}要怎麼辦？", "{加油站的價錢牌|菜市場的價錢}一直往上跳，大家都在說第二次石油危機，{你算了算，每個月的開銷多了一大截。|存款好像越存越少。}要怎麼辦？"])
          : y === 2008
            ? ctx.w(["國際油價漲不停，{泡麵、麵包|加油錢、菜錢}全都漲了，{薪水卻沒動。|每個月的開銷多了一截。}要怎麼辦？", "{早餐店|便當店}貼出漲價的公告，{加油時看著跳表的數字，|超市的泡麵也漲了，}你開始覺得錢不夠用。要怎麼辦？"])
            : y === 2018
              ? ctx.w(["{新聞說衛生紙要漲價，|大賣場的衛生紙被搶光了，}{排隊結帳的人推車上都堆得滿滿的。|你家附近的超市只剩空架子。}要怎麼辦？", "聽說衛生紙下個月要漲三成，{到處的賣場都在排隊搶，|{friend}已經扛了十串回家，}要怎麼辦？"])
              : ctx.w(["{便當、雞蛋、外食|菜價、外食、房租}樣樣都漲，{一顆茶葉蛋都漲價了，|市場的雞蛋一早就被搶光，}{薪水卻沒動。|每個月的開銷多了一截。}要怎麼辦？", "{早餐店|自助餐}又漲價了，{房租也跟著漲，|電費也調了，}你看著記帳 App 裡的數字直嘆氣。要怎麼辦？"]);
      return {
        prompt,
        options: [
          {
            id: "m_prices.frugal", label: "省吃儉用", hint: "能省就省", act: "save", style: "safe", weight: 0.35,
            apply: () => ({ text: ctx.w(y < 1990 ? `${lead}你{把每一塊錢都記在帳本上，|中午改帶便當，}{衣服補了又穿，|菜改買便宜的，}{總算撐過了那一年。|月底還能存下一點。}` : `${lead}你{開始記帳，|中午改自己帶便當，}{能不買的就不買，|比價比成了專家，}{總算撐過了那一年。|月底還能存下一點。}`), mood: -1 }),
          },
          {
            id: "m_prices.side", label: "下班兼差多賺一點", hint: "讓收入追上物價", act: "sideJob", style: "self", weight: 0.2, when: s2 => s2.employed,
            apply: () => {
              s.savings += ctx.rng.between(0.04, 0.08); s.health.stress = Math.min(1, s.health.stress + 0.05);
              return { text: ctx.w(y < 1990 ? `${lead}你{下班後接了家庭代工回家做，|晚上去夜市擺攤，|假日幫人做手工，}{雖然累，|手指都磨出繭了，}{總算多了一點收入。|家裡的開銷撐過來了。}` : y >= 2016 ? `${lead}你{下班後跑外送，|晚上接案子，|假日去擺攤，}{雖然累，|常常忙到半夜，}{多賺的錢剛好補上漲價的部分。|存款總算沒有變少。}` : `${lead}你{下班後去當家教，|晚上接了一些案子，|假日去打工，}{雖然累，|常常忙到很晚，}{多賺的錢剛好補上漲價的部分。|存款總算沒有變少。}`), mood: -1 };
            },
          },
          {
            id: "m_prices.hoard", label: y === 2018 ? "也去排隊搶衛生紙" : "先囤一些米和油", hint: "以免再漲", act: "lottery", style: "family", weight: 0.15,
            apply: () => { pay(s, 0.02); return { text: ctx.w(y === 2018 ? `${lead}你也去賣場排隊，{推著推車排了半小時，|跟陌生人搶最後幾串，}{扛回家的衛生紙塞滿了儲藏室，|結果用了一年多才用完，}{後來才知道漲價沒那麼多。|家人笑你是囤貨大王。}` : `${lead}你{趁還沒漲之前|一口氣}囤了好幾包{米|麵粉}和{沙拉油|罐頭}，{家裡的櫃子塞得滿滿的。|心裡比較踏實。|結果有一部分放到過期。}`), mood: 0 }; },
          },
          {
            id: "m_prices.gold", label: "把一部分存款換成黃金", hint: "錢會變薄，黃金不會", act: "invest", style: "risk", weight: 0.12, when: s2 => s2.savings >= 0.2,
            apply: () => {
              const r = MARKET.gold[y + 1] ?? 0.05, g = clampGain(Math.min(0.5, 0.25 * s.savings) * r);
              s.savings = Math.max(0, s.savings + g);
              return r >= 0 ? { text: ctx.w(`${lead}你去銀樓把一部分存款換成金子，{隔年金價漲了，|後來金價果然往上走，}{你賣掉一部分，多了一筆錢。|你覺得老一輩說的果然沒錯。}`), mood: 3 } : { text: ctx.w(`${lead}你去銀樓把一部分存款換成金子，{沒想到隔年金價大跌，|後來金價掉了一大截，}{只好放著等它回來。|白白賠了一些錢。}`), mood: -3 };
            },
          },
          {
            id: "m_prices.bike", label: "改騎腳踏車省油錢", hint: "順便運動", act: "exercise", style: "health", weight: 0.13,
            apply: () => { if (ctx.rng() < 0.5) hr(s, 0.98); return { text: ctx.w(`${lead}你改騎腳踏車{上班|出門買菜}，{每天騎二十分鐘，|一開始騎到滿身大汗，}{一個月省下不少油錢。|半年後體力也變好了。}{家人笑說你是為了省錢才運動。|你覺得一舉兩得。}`), mood: 1 }; },
          },
          {
            id: "m_prices.same", label: "照常過日子", hint: "日子還是要過", act: "wait", style: "self", weight: 0.15,
            apply: () => { pay(s, 0.02); return { text: ctx.w(`${lead}你照常過日子，{只是買菜時多看了兩眼價錢。|月底的存款少了一點。|跟家人說，撐過去就好。}`), mood: -1 }; },
          },
        ],
      };
    },
  },
  {
    // 五月報稅
    id: "m_tax", domain: "wealth", channel: "change", ages: [22, 85], cooldown: 5, max: 1,
    when: s => !s.abroad && s.year >= 1985 && ((s.employed && s.income >= 0.6) || (s.retired && s.savings >= 1)), p: () => 0.025,
    choice: (s, ctx) => {
      const y = s.year, pw = parentWord(s), office = y < 1991 ? "稅捐處" : "國稅局";   // 國稅局 from 1991; before that the 稅捐處 took income tax
      // A refund (or a small extra payment), in years of median pay.
      const settle = (lo, hi) => {
        const d = ctx.rng.between(lo, hi);
        if (d >= 0) { s.savings += d; return ctx.w("{退了一點稅，|收到一筆退稅，}{剛好拿去吃一頓好的。|存了起來。}"); }
        pay(s, -d); return ctx.w("{還要補繳一點，|補了一筆稅，}{心痛了一下。|你說明年要早點規畫。}");
      };
      return {
        prompt: ctx.w([
          `五月報稅季到了，{一疊扣繳憑單攤在桌上，|${s.partner ? "{partner}問你今年的稅報了沒，" : "同事都在聊今年要繳多少稅，"}}要怎麼報？`,
          `又到了五月，${y < 1998 ? `${office}外面排起了長長的隊伍` : y < 2017 ? "報稅的網站開始塞車" : "手機跳出報稅的提醒"}，你的稅還沒報。要怎麼報？`,
          "{收到扣繳憑單|拿到年終的扣繳資料}，你想到又要報稅了，{去年好像多繳了一點。|今年多了一筆獎金，不知道要繳多少。}要怎麼報？",
        ]),
        options: [
          {
            id: "m_tax.self", label: y < 1998 ? "自己填申報書" : y < 2017 ? "自己上網報" : "用手機報", hint: y < 1998 ? "照著說明一格一格填" : y < 2009 ? "第一次試試網路報稅" : y < 2017 ? "插自然人憑證就能報" : "三分鐘就報完", act: "save", style: "safe", weight: 0.35,
            apply: () => ({ text: ctx.w(y < 1998 ? "五月報稅，你照著說明一格一格填申報書，{算了一個晚上，|計算機按到手痠，}" : y < 2017 ? "五月報稅，你自己上網申報，{照著步驟一頁一頁填，|研究了半天，}" : "五月報稅，你用手機{驗證完身分，|點了幾下，}{三分鐘就報完了，|比叫外送還快，}") + settle(-0.01, 0.02), mood: 1 }),
          },
          {
            id: "m_tax.deduct", label: "研究扣除額", hint: "保險費、醫藥費都能扣", act: "study", style: "learn", weight: 0.2,
            apply: () => ({ text: ctx.w("五月報稅，你把{保險費|醫藥費|捐款}的收據全部翻出來，{一項一項列舉扣除額，|研究了一整個晚上，}") + settle(0.005, 0.03), mood: 2 }),
          },
          {
            id: "m_tax.pro", label: y < 2000 ? `請${office}的人幫忙填` : "請會計師幫忙", hint: y < 2000 ? "服務台會幫忙算" : "花點錢省麻煩", act: "seekHelp", style: "social", weight: 0.1,
            apply: () => {
              if (y < 2000) return { text: ctx.w(`五月報稅，你帶著扣繳憑單去${office}的服務台，{櫃檯的人一格一格幫你填，|服務的志工耐心地幫你算，}`) + settle(0, 0.015), mood: 1 };
              pay(s, 0.005); return { text: ctx.w("五月報稅，你把資料全部交給會計師，{對方幫你找出好幾項可以扣的，|一個下午就辦好了，}") + settle(0, 0.02), mood: 1 };
            },
          },
          {
            id: "m_tax.trial", label: "用稅額試算直接確認", hint: "最省事", act: "wait", style: "self", weight: 0.2, when: () => y >= 2008,
            apply: () => ({ text: ctx.w("五月報稅，你收到稅額試算通知書，{看了一眼就回覆確認，|三分鐘就搞定了，}{完全不想多研究。|省下的時間拿去睡午覺。}"), mood: 1 }),
          },
          {
            id: "m_tax.last", label: "拖到最後一天", hint: "還有時間", act: "avoid", style: "risk", weight: 0.15,
            apply: () => ({ text: ctx.w(`五月報稅，你拖到最後一天才報，${y < 1998 ? `{${office}外面排了長長的隊，|排到中午才輪到你，}` : "{報稅網站塞車塞到半夜，|一直轉圈圈，}"}{最後一刻才送出。|發誓明年要早一點。}`), mood: -1 }),
          },
          {
            id: "m_tax.family", label: `順便幫${pw}報稅`, hint: "長輩不太會用電腦", act: "care", style: "family", weight: 0.1, when: s2 => y >= 1998 && s2.age >= 30 && parentAlive(s2),
            apply: () => ({ text: ctx.w(`五月報稅，你順便幫${pw}報稅，{教了半天，最後還是你自己來。|${pw}在旁邊一直問會不會退稅。}{${pw}說你真孝順。|報完一起去吃了一碗麵。}`), mood: 2 }),
          },
        ],
      };
    },
  },
  {
    // 紅色炸彈：喜帖
    id: "m_redBomb", domain: "wealth", channel: "change", ages: [22, 60], cooldown: 6, max: 2, when: s => !s.abroad, p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year;
      const gift = y < 1985 ? "六百" : y < 1995 ? "一千二" : y < 2008 ? "一千六" : "兩千";
      const n = ctx.rng.pick(["兩", "三"]);
      const far = y >= 2008 ? "只在臉書上按過讚" : "只在同學會見過一次";
      return {
        prompt: ctx.w([
          `這個月收到${n}張喜帖，{一張是{大學同學|以前的同事}，一張是很久沒聯絡的{國中同學|遠房親戚}。|其中一張來自一個${far}的老同學。}要怎麼辦？`,
          `同一個月有${n}場喜宴，{你看著月曆上的紅圈圈嘆氣。|錢包還沒從上個月恢復過來。}要怎麼辦？`,
          "{以前的室友|老同事}傳來喜帖的照片，說「一定要來喔」，{這已經是今年的第五張了。|你們已經好幾年沒見面了。}要怎麼辦？",
        ]),
        options: [
          {
            id: "m_redBomb.go", label: "人到禮到", hint: `包個${gift}，坐下來吃一桌`, act: "socialize", style: "social", weight: 0.35,
            apply: () => { pay(s, ctx.rng.between(0.02, 0.04)); return { text: ctx.w("收到喜帖，你{一個月裡喝了好幾場喜酒，|穿上最好的衣服去喝喜酒，|包紅包時特地避開四開頭，}{在喜宴上遇到好多老同學。|桌上的佛跳牆讓你覺得紅包包得值得。|跟新人合照時，你真心替他們高興。}"), mood: 2 }; },
          },
          {
            id: "m_redBomb.gift", label: "只包禮金，人不到", hint: "心意到了就好", act: "wait", style: "safe", weight: 0.25,
            apply: () => { pay(s, ctx.rng.between(0.015, 0.025)); return { text: ctx.w(`收到喜帖，你請人把紅包帶過去，{包了${gift}，|在紅包袋上寫了祝福，}{自己在家看了一整天電視。|聽說新人有看到你的祝福。}`), mood: 0 }; },
          },
          {
            id: "m_redBomb.pick", label: "熟的才去", hint: "量力而為", act: "talk", style: "self", weight: 0.2,
            apply: () => { pay(s, 0.015); return { text: ctx.w("收到喜帖，你想了想，{只去了最熟的那一場，|不熟的就回說剛好有事，}{省下了一些紅包錢。|心裡有一點點不好意思。}"), mood: 0 }; },
          },
          {
            id: "m_redBomb.decline", label: "都婉拒", hint: "不熟就不去", act: "avoid", style: "risk", weight: 0.1,
            apply: () => ({ text: ctx.w(`收到喜帖，你一場都沒去，{只在${y >= 2011 ? "LINE" : "電話"}裡說聲恭喜，|說剛好要出差，}{省下了好幾千塊。|後來在路上遇到，有點尷尬。}`), mood: 0 }),
          },
          {
            id: "m_redBomb.helper", label: "去幫忙當招待", hint: "好朋友的大日子", act: "volunteer", style: "family", weight: 0.1, when: s2 => s2.age <= 40,
            apply: () => { pay(s, 0.02); return { text: ctx.w(`收到最好朋友的喜帖，你一口答應去當{招待|${s.sex === "male" ? "伴郎" : "伴娘"}}，{在門口收了一下午的禮金，|幫忙擋了好多杯酒，}{累得半死，但看到新人笑得好開心。|新人最後抱了你一下。}`), mood: 3 }; },
          },
          {
            id: "m_redBomb.big", label: "包一個大紅包", hint: "交情不一樣", act: "donate", style: "family", weight: 0.05, when: s2 => s2.savings >= 1,
            apply: () => { pay(s, ctx.rng.between(0.04, 0.06)); return { text: ctx.w("收到老朋友的喜帖，你包了一個{六千六|八千八}的大紅包，{新人收到時愣了一下，|你說「交情不一樣」，}{婚禮上特別來你這桌敬酒。|你覺得這錢花得值得。}"), mood: 2 }; },
          },
        ],
      };
    },
  },
  {
    // 壓歲錢
    id: "m_redMoney", domain: "wealth", channel: "good", ages: [6, 14], cooldown: 2, max: 3, p: () => 0.1,
    choice: (s, ctx) => {
      const y = s.year;
      const sum = y < 1970 ? "好幾十塊" : y < 1985 ? "好幾百塊" : y < 2000 ? "一兩千塊" : "好幾千塊";
      const where = ctx.rng.pick(["阿公阿嬤家", "外婆家", "伯父家"]);
      const keeper = s.mother.alive ? "媽媽" : s.father.alive ? "爸爸" : "阿嬤";
      const lead = "過年的壓歲錢，";
      return {
        prompt: ctx.w([
          `過年跟著家人回{where}，{拜了一整天的年，|一進門就說了好多句恭喜發財，}{收到好幾個紅包，|口袋裡的紅包鼓鼓的，}偷偷數了數有${sum}。要怎麼用？`,
          `除夕夜圍爐後，{長輩們|阿公阿嬤}一個一個發紅包，{你收得手都軟了，|你說了一整晚的吉祥話，}一算竟然有${sum}。要怎麼用？`,
          `過年{拜年|走春}收到的壓歲錢有${sum}，{你把紅包袋一個一個攤在床上。|你把錢摺好藏在枕頭底下。}要怎麼用？`,
        ], { where }),
        options: [
          {
            id: "m_redMoney.keeper", label: `交給${keeper}保管`, hint: `${keeper}說幫你存起來`, act: "lend", style: "family", weight: 0.4,
            apply: () => ({ text: ctx.w(`${lead}你全部交給${keeper}，{說好幫你存起來，後來就再也沒看過那筆錢。|${keeper}說要幫你存大學的學費。|${keeper}說等你長大再還你，你到現在還記得。}`), mood: 0 }),
          },
          {
            id: "m_redMoney.post", label: "自己存進郵局", hint: "看著存簿的數字變多", act: "save", style: "safe", weight: 0.2,
            apply: () => { s.savings += 0.005; return { text: ctx.w(`${lead}你{第一次自己去郵局開戶，|把錢存進郵局的存簿，}{看著存簿上的數字，覺得自己好有錢。|櫃檯阿姨誇你很會存錢。}`), mood: 2 }; },
          },
          {
            id: "m_redMoney.buy", label: "買一直想要的東西", hint: "這是我的錢", act: "hobby", style: "self", weight: 0.25,
            apply: () => ({ text: ctx.w(y < 1980 ? `${lead}你拿去買了{一盒彈珠|一整套漫畫|一個鐵皮玩具}，{開心得捨不得放下。|玩了一整個寒假。}` : y < 1996 ? `${lead}你拿去買了{一台掌上型電動|一套遊戲卡帶|一雙新球鞋}，{開心得睡不著。|被家人唸了一頓。}` : y < 2010 ? `${lead}你拿去買了{遊戲點數卡|一台 MP3|一雙新球鞋}，{開心了好幾天。|開學時還跟同學炫耀。}` : `${lead}你拿去{買了遊戲裡的造型|買了一副藍牙耳機|存起來準備買手機}，{開心了好幾天。|被家人唸說太浪費。}`), mood: 3 }),
          },
          {
            id: "m_redMoney.split", label: "一半存起來，一半自己花", hint: "跟家人談好條件", act: "negotiate", style: "learn", weight: 0.15,
            apply: () => { s.savings += 0.003; return { text: ctx.w(`${lead}你跟家人討價還價，{最後說好一半存起來、一半自己花。|說好自己記帳，你買了一本記帳本。}`), mood: 1 }; },
          },
          {
            id: "m_redMoney.treat", label: "請表兄弟姊妹吃東西", hint: "有福同享", act: "socialize", style: "social", weight: 0.1,
            apply: () => ({ text: ctx.w(`${lead}你拿去請表兄弟姊妹吃{雞蛋糕|冰淇淋|炸雞}，{大家都叫你${s.sex === "male" ? "大哥" : "大姐"}。|你覺得自己好大方。}`), mood: 2 }),
          },
        ],
      };
    },
  },
  {
    // 朋友開口借錢（借出去的錢在 m_loanBack 收尾）
    id: "m_friendLoan", domain: "wealth", channel: "bad", ages: [20, 80], cooldown: 6, max: 2, when: s => s.savings >= 0.3 && !s.flags.lent, p: () => 0.02,
    choice: (s, ctx) => {
      const f = s.friends.filter(x => x.alive), pal = f.length ? ctx.rng.pick(f) : null;
      const who = pal ? pal.call : "老同學", ta = pal && pal.sex === "female" ? "她" : "他";
      const why = ctx.rng.pick(["生意週轉不過來", "家裡出了一點事", "信用卡快繳不出來", "被公司資遣了"]);
      const lend = (amount, back, iou = false) => { const paid = pay(s, amount); s.flags.lent = { age: s.age, back: ctx.rng.chance(back), amount: paid, who, iou }; };
      const lead = `${who}說${why}，`;
      return {
        prompt: ctx.w([
          "{who}{打電話來|約你吃飯}，{支支吾吾了很久，|喝了兩杯以後}才開口：「{why}，可以借我一筆錢嗎？」要怎麼辦？",
          "好久沒聯絡的{who}突然{msg}，說{why}，想跟你借一筆錢，{下個月就還。|說得很急。}要怎麼辦？",
          `{who}紅著眼睛說{why}，{問你能不能先借${ta}週轉。|說只有你能幫忙了。}要怎麼辦？`,
        ], { who, why, msg: s.year >= 2000 ? "傳訊息來" : "打電話來" }),
        options: [
          {
            id: "m_friendLoan.all", label: `借給${ta}`, hint: "朋友有難", act: "lend", style: "family", weight: 0.3,
            apply: () => { lend(Math.min(0.5, 0.3 * s.savings + 0.1), 0.55); return { text: ctx.w(`${lead}你{二話不說|想了一個晚上，還是}把錢借了出去，{${ta}握著你的手說了好幾聲謝謝。|${ta}說一定會還。}`), mood: 0 }; },
          },
          {
            id: "m_friendLoan.part", label: "借一部分", hint: "借出去就當作送的", act: "lend", style: "safe", weight: 0.3,
            apply: () => { lend(Math.min(0.2, 0.15 * s.savings + 0.05), 0.65); return { text: ctx.w(`${lead}你借了一部分，{跟自己說借出去就當作送的。|說這是你能力範圍內最多的了。}`), mood: 0 }; },
          },
          {
            id: "m_friendLoan.no", label: "婉拒", hint: "朋友之間不談錢", act: "avoid", style: "self", weight: 0.2,
            apply: () => ({ text: ctx.w(`${lead}想跟你借錢，你想了很久，還是說了抱歉。{之後兩個人見面有點尷尬。|${ta}說沒關係，你心裡卻悶了好幾天。}`), mood: -2 }),
          },
          {
            id: "m_friendLoan.help", label: "幫忙想其他辦法", hint: "陪對方去銀行或找資源", act: "seekHelp", style: "social", weight: 0.12,
            apply: () => ({ text: ctx.w(`${lead}你沒有直接借錢，{陪${ta}去銀行談分期，|幫${ta}找了可以申請的補助，}{${ta}後來說，這比借錢還有用。|事情慢慢有了轉機。}`), mood: 1 }),
          },
          {
            id: "m_friendLoan.iou", label: "借，但請對方寫借據", hint: "親兄弟明算帳", act: "negotiate", style: "learn", weight: 0.08,
            apply: () => { lend(Math.min(0.5, 0.3 * s.savings + 0.1), 0.7, true); return { text: ctx.w(`${lead}你答應借錢，但請${ta}寫了一張借據，{兩個人都覺得這樣比較安心。|${ta}愣了一下，還是簽了名。}`), mood: 0 }; },
          },
        ],
      };
    },
  },
  {
    // 借出去的錢有沒有回來（也接住 act.js 一般行動「借錢給對方」留下的 s.flags.lent）
    id: "m_loanBack", domain: "wealth", channel: "change", when: s => !!s.flags.lent && s.age - s.flags.lent.age >= 2, p: () => 0.5,
    apply: (s, ctx) => {
      const l = s.flags.lent, who = l.who || "對方";
      s.flags.lent = null;
      if (l.back) {
        s.savings += l.amount ?? 0.3;
        return { text: ctx.w(["當年借給{who}的錢，{分了好幾次還清了，|一次還清，還多包了一個紅包，}{你們的交情反而更好了。|你鬆了一口氣。}", "{who}拿著一個信封來找你：「那時候謝謝你。」{裡面是當年借的錢，一毛不少。|還附了一張手寫的卡片。}", "你都快忘了借錢的事，{who}突然把錢匯了回來，{附上一句「讓你等了」。|說這幾年總算站穩了。}"], { who }), mood: 4 };
      }
      return { text: ctx.w(["當年借給{who}的錢，{一拖再拖，最後連電話都不接了。|你決定不再提了，就當作學費。}", "你又打了一次電話給{who}，{對方說再等等，之後就沒有下文了。|號碼已經換了。}{你把這件事放下了。|你告訴自己，錢沒了，至少學到了。}", `借給{who}的錢一直沒有回來，${l.iou ? "{那張借據還收在抽屜裡，|你看著那張借據，}" : "{你想過去要，|你想了好幾次，}"}{最後還是沒有開口。|你決定不再追了。}`], { who }), mood: -3 };
    },
  },
];

// Health and money choices come a little less often than the life-stage stories, so they stay in the background of
// a life (about 8 choices out of 40). Follow-ups of a storyline (m_investCheck) keep their timing.
for (const ev of HEALTH) if (ev.choice && ev.id !== "m_investCheck") { const p = ev.p; ev.p = (s, ctx) => 0.6 * p(s, ctx); }

// Vaccinations a person of this age could really have had that year (see h_shot).
function shots(s) {
  const y = s.year, a = s.age, out = [];
  if (a <= 6 && y >= 1965 && y < 1990) out.push("打了卡介苗，{肩膀上|手臂上}留下一個小小的疤，家人說每個小孩都有。");
  if (a >= 4 && a <= 12 && y < 1979) out.push("學校排隊種牛痘，{左手臂上留下一個小小的疤。|你緊張得一直拉著前面同學的衣服。}");
  if (a <= 15 && y === 1982) out.push("那年小兒麻痺疫情，家人帶你去衛生所排隊，{吃了一劑口服疫苗。|隊伍一路排到馬路上。}");
  if (a <= 6 && y >= 1986) out.push("家人把你的黃色預防接種卡收在抽屜裡，{每打完一劑疫苗就蓋一個章。|去衛生所打針時，你哭得比旁邊的小孩還大聲。}");
  if (a >= 6 && a <= 18 && y === 2009) out.push("那年新流感，你在學校排隊打了疫苗，{手臂痠了兩天。|打完還拿到一張貼紙。}");
  if (a >= 6 && a <= 12 && y >= 2014) out.push("學校集中打流感疫苗，{全班排隊，前面的同學一哭，後面的都怕了。|你閉著眼睛，打完才發現一點都不痛。}");
  if (s.sex === "female" && a >= 12 && a <= 13 && y >= 2019) out.push("國一的時候，學校安排女生打公費的 HPV 疫苗，{你緊張到不敢看針頭。|打完手臂痠了一整天。}");
  if (a >= 65 && y >= 2001) out.push("{秋天|天氣一轉涼}，你到{衛生所|附近的診所|里民活動中心}打公費的流感疫苗，{順便量了血壓。|護理師說今年的疫苗不太痛。|排隊時遇到好幾個老鄰居。}");
  return out;
}
