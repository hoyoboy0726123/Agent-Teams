// 大學與出社會（18–30 歲）：大學生活、當兵、第一份工作、租屋和北漂、交往中的兩個人、朋友。
//
// 這裡的機率都沒有官方統計可以對照，全部是假設的設計值：多數一年 2–15%，再用 once／cooldown／max 限制重複；
// 少數「剛好那一年」才會發生的事（大一新生、退伍、畢業時的學貸）機率高一些，但一生只有一次。
// 為了不動到 core.js 校準過的統計（生育、初婚、離婚、買房、升學、退休、壽命）：這裡不結婚、不分手、不生小孩、
// 不買房、不退休、不改學歷（延畢只把畢業往後延一年，而且一定趕得上 core.js 的畢業年齡）；錢的進出都很小、
// 有進有出；換工作很少，職稱不變，或交給 world.js 和 work.js 既有的故事線；hr 每次最多乘 0.98 或 1.02。
//
// Probabilities here are assumptions (design values, not statistics). Effects are small and two-sided so that
// test/calibration.test.js keeps passing.
//
// The English edition (README「英文版（翻譯層）」, src/i18n/en/young.json) looks each template up as written here, so
// what changes from life to life goes in as {vars}. A part that is itself a choice ({甲|乙}, picked as the sentence
// is told) stays in the template: a scene's own wording is a template of its own, and a choice among words that
// change with the era is written {{a}|{b}} with the words as vars, which draws the same as the words written in.
import { COUNTIES, JOBS, regionOf, moveTo, bornSiblings } from "../world.js";
import { pronoun } from "../people.js";
import { siblingCall } from "../words.js";
import { fill } from "../grammar.js";

// ---------- who is where ----------
const COLLEGE = ["大學", "科大"];
const undergrad = s => s.studying && COLLEGE.includes(s.track) && !s.abroad;
const inCollege = s => s.studying && (COLLEGE.includes(s.track) || s.track === "碩士") && !s.abroad;
const uniYear = s => s.age - (s.flags.uniAt ?? s.age) + 1;   // 1 = the first year of college
// Graduation (core.js graduateUni) waits for uniAt + 4 and must happen by 26, so a delay has to leave room for it.
const canDelay = s => typeof s.flags.uniAt === "number" && s.flags.uniAt + 5 <= 26 && s.track !== "碩士";
const working = s => s.employed && !!s.job && !s.studying && !s.abroad && !s.retired;
const employee = s => working(s) && !["家業", "自營"].includes(s.job.field);   // someone with a boss
// Office work, where bosses ask for reports and headhunters call; the rest work in shops, kitchens, sites and wards.
const DESK = ["科技", "金融", "行政", "業務", "行銷", "設計", "媒體", "研究", "教育", "公部門", "法律", "不動產", "社福"];
const desk = s => !!s.job && DESK.includes(s.job.field);
const BOSS = { 護理師: "護理長", 廚師: "主廚", 餐廳廚房: "主廚", 美髮師: "店長", 門市人員: "店長", 花藝師: "店長", 保全: "組長", 清潔人員: "組長", 工廠作業員: "領班", 工廠技術員: "領班", 營造工地: "領班", 水電師傅: "老闆", 汽車維修: "廠長" };
const bossOf = s => BOSS[s.job.title] || "主管";
const SHOP = ["美髮師", "門市人員", "花藝師", "廚師", "餐廳廚房"];
const placeOf = s => (SHOP.includes(s.job.title) ? "店" : "公司");
// Desk work that happens in an office (a florist or a hairdresser works in a shop, even in a 設計 or 服務 field).
const officeJob = s => desk(s) && !SHOP.includes(s.job.title);
// Where the work happens, for 「工廠缺人」.
const siteOf = s => ({ 製造: "工廠", 營造: "工地", 醫療: "醫院", 餐飲: "店裡", 零售: "店裡" }[s.job.field] || (SHOP.includes(s.job.title) ? "店裡" : "公司"));
// Who would try to hire you away: the two words of a {甲|乙} choice, or one word.
const rivalOf = s => ({ 教育: ["另一間學校", "一間私立學校"], 醫療: ["另一家醫院", "一間診所"], 社福: ["另一個社福機構"] }[s.job.field] || (SHOP.includes(s.job.title) ? ["另一家店", "附近新開的店"] : ["另一家公司", "對手公司"]));
const BASIC = new Set(JOBS.basic.map(j => j[0]));   // jobs nobody sends a headhunter for
const dating = s => s.rel === "dating" && !!s.partner;
const parentsAlive = s => s.father.alive || s.mother.alive;
const parentsWord = s => (s.father.alive && s.mother.alive ? "爸媽" : s.father.alive ? "爸爸" : s.mother.alive ? "媽媽" : "家裡");
const cn = n => ["零", "一", "兩", "三", "四", "五", "六", "七", "八", "九", "十"][n] || ` ${n} `;
const beenAbroad = s => !!(s.flags.beenAbroad || s.abroad || s.flags.studyAbroad !== undefined || s.flags.emigrated || s.done.has("returnHome"));

// ---------- small effects ----------
const clamp = v => Math.max(0, Math.min(1, v));
const stress = (s, d) => { s.health.stress = clamp(s.health.stress + d); };
const spend = (s, x) => { const paid = Math.min(s.savings, x); s.savings -= paid; return paid; };
const frugal = (s, years) => { s.flags.frugalUntil = Math.max(s.flags.frugalUntil ?? -1, s.age + years); };
// A good or bad turn while dating. Both last one year only: they run out before a wedding could start (and
// marry() clears s.crisis), so the calibrated divorce rate does not move.
const warm = s => { s.guard = Math.max(s.guard, 1); };
const cool = s => { s.crisis = Math.max(s.crisis, 1); };
// The same yearly market swings as the invest action (act.js).
const marketYear = y => (y === 1990 ? -0.45 : y === 2000 || y === 2001 ? -0.25 : y === 2008 ? -0.3 : y === 2020 || y === 2021 ? 0.3 : y === 2022 ? -0.15 : 0.05);

// ---------- wording ----------
// ctx.w for an event that comes back, with a list of templates whose {vars} change from one time to the next: a
// template counts as already told only when it was told with these same values (as when the values were written into
// it), so a later time picks among the same templates as before the values became {vars}.
function told(s, ctx, list, vars) {
  const id = t => fill(t, vars);
  const fresh = list.filter(t => !s.used.has(id(t)));
  const pool = fresh.length ? fresh : list;
  const had = pool.filter(t => s.used.has(t));
  for (const t of had) s.used.delete(t);
  const text = ctx.w(pool, vars);
  for (const t of pool) if (s.used.has(t)) { s.used.delete(t); s.used.add(id(t)); }
  for (const t of had) s.used.add(t);
  return text;
}

// ---------- scenes ----------
// A question told through one concrete situation out of several, so the same question reads differently from life to
// life. `list` holds scenes ({ key, when?, w?, … }; a falsy entry is left out): the ones that fit this life now,
// likelier by `w`, and one this life has not had yet when a question comes back. The prompt, the buttons and every
// result are built from the same scene, so they always match.
function sceneOf(s, ctx, id, list) {
  const fits = list.filter(x => x && (!x.when || x.when(s)));
  const had = s.flags[`${id}Scenes`] || [];
  const fresh = fits.filter(x => !had.includes(x.key));
  const sc = ctx.rng.weighted((fresh.length ? fresh : fits).map(x => [x, x.w ?? 1]));
  s.flags[`${id}Scenes`] = [...had, sc.key];
  return sc;
}
// A scene's buttons: for each option [label, hint, what you did, and sometimes how it went], the scene's own (`o`)
// or else the question's usual ones.
const buttonsOf = (base, sc) => ({ ...base, ...(sc.o || {}) });
// 臺南市 → 臺南, for 「回臺南」.
const town = c => (c === "連江縣" ? "馬祖" : String(c || "").replace(/[市縣]$/, ""));
// Years since leaving college or graduate school, or -1.
const sinceGrad = s => { const g = s.last.graduateMaster ?? s.last.graduateUni; return typeof g === "number" ? s.age - g : -1; };
// A student with a part-time job in mind, and a young worker in a small shop or company: who gets paid late.
const partTimer = s => s.studying && ["大學", "科大", "碩士", "五專"].includes(s.track) && s.age >= 18 && !s.abroad;
const smallShop = s => employee(s) && (BASIC.has(s.job.title) || SHOP.includes(s.job.title) || ["餐飲", "零售", "服務", "設計", "媒體", "觀光"].includes(s.job.field));

// ---------- friends ----------
const FRIEND_HOW = /同學|同事|室友|隊友|同梯|鄰居|社友|同好|朋友/;
// How the story first names a friend: 大學室友阿傑, or 好友阿傑 when we do not know how you met. A few ways of meeting
// have their own template, since their English word comes with "a" ("a classmate").
const INTRO = { 同學: "同學{name}", 同事: "同事{name}", 鄰居: "鄰居{name}", 老同學: "老同學{name}", 老朋友: "老朋友{name}" };
const friendIntro = (f, ctx) => (typeof f.how === "string" && f.how.length <= 6 && FRIEND_HOW.test(f.how) && !/[{}|]/.test(f.how)
  ? ctx.f(INTRO[f.how] || "{how}{name}", { how: f.how, name: f.call }) : ctx.f("好友{name}", { name: f.call }));
const defaultHow = s => (inCollege(s) || ["大學", "科大", "碩士", "博士"].includes(s.edu) ? "大學同學" : s.employed && s.age >= 20 ? "同事" : s.edu === "none" ? "朋友" : s.edu + "同學");
// A friend for the story: one from earlier in this life (preferably met the way `prefer` says), else someone new.
//   fresh   always someone new (a roommate, a teammate)
function friendOf(s, ctx, { sex = null, how = null, fresh = false, prefer = null } = {}) {
  if (!fresh) {
    let list = s.friends.filter(f => f.alive !== false && (!sex || f.sex === sex));
    if (prefer) list = list.filter(f => prefer.test(f.how || ""));
    if (list.length) return ctx.rng.pick(list);
  }
  const other = s.sex === "male" ? "female" : "male";
  const f = ctx.person({ role: "friend", sex: sex || (ctx.rng() < 0.65 ? s.sex : other), birthYear: s.birthYear + ctx.rng.int(3) - 1, how: how || defaultHow(s) });
  s.friends.push(f);
  return f;
}
const bond = (f, d) => { if (f) f.bond = clamp((f.bond ?? 0.5) + d); };

// ---------- departments ----------
// [name, the year it is plausible from]. s.flags.major (自然組/社會組…) may come from the teen years; never required.
const DEPTS = {
  science: [["電機系", 0], ["機械系", 0], ["化工系", 0], ["土木系", 0], ["物理系", 0], ["化學系", 0], ["數學系", 0], ["護理系", 0], ["資工系", 1980], ["材料系", 1985], ["生科系", 1990]],
  arts: [["中文系", 0], ["外文系", 0], ["歷史系", 0], ["法律系", 0], ["經濟系", 0], ["會計系", 0], ["社會系", 0], ["新聞系", 0], ["心理系", 1960], ["企管系", 1965], ["日文系", 1965], ["財金系", 1990]],
  tech: [["機械工程系", 0], ["電子工程系", 0], ["企業管理系", 0], ["化工系", 0], ["工業設計系", 1975], ["資訊管理系", 1985], ["幼兒保育系", 1990], ["餐旅管理系", 1995], ["觀光系", 1995], ["應用外語系", 1995]],
};
const SCI = /自然|理|二類|三類/, ART = /社會|文|一類/;
const majorOf = s => (typeof s.flags.major === "string" && s.flags.major.length <= 6 && !/[{}|]/.test(s.flags.major) ? s.flags.major : "");
function deptGroup(s) {
  if (s.track === "科大") return "tech";
  const m = majorOf(s);
  return SCI.test(m) ? "science" : ART.test(m) ? "arts" : null;
}
function pickDept(s, ctx, group = null, not = null) {
  const g = group || deptGroup(s) || ctx.rng.pick(["science", "arts"]);
  const list = DEPTS[g].filter(([d, from]) => from <= s.year && d !== not).map(([d]) => d);
  return ctx.rng.pick(list.length ? list : [DEPTS[g][0][0]]);
}
const deptOf = (s, ctx) => s.flags.dept || (s.flags.dept = pickDept(s, ctx));
const isArts = s => DEPTS.arts.some(([d]) => d === s.flags.dept);
// 「高中念自然組，」 when the teen years chose a group, else nothing.
const majorLead = (s, ctx) => (s.edu === "高中" && (SCI.test(majorOf(s)) || ART.test(majorOf(s))) ? ctx.f("高中念{major}，", { major: majorOf(s) }) : "");

// ---------- places and things by region and era ----------
const RIDE = {
  north: ["陽明山看夜景", "北海岸看日出", "頭城海邊看日出", "九份看夜景"],
  central: ["武嶺看日出", "合歡山看星星", "清境", "大坑看夜景"],
  south: ["墾丁看日出", "壽山看夜景", "關子嶺", "旗津海邊"],
  east: ["七星潭看日出", "太魯閣", "三仙台看日出"],
  islands: ["海邊看日出", "燈塔下看日出"],
};
const DATES = {
  north: [["淡水看夕陽", 0], ["西門町看電影", 0], ["陽明山看夜景", 0], ["士林夜市", 0], ["象山看夜景", 1995], ["華山文創園區看展", 2008]],
  central: [["東海大學的路思義教堂", 1965], ["逢甲夜市", 1985], ["日月潭騎腳踏車", 2000], ["高美濕地看夕陽", 2005], ["草悟道散步", 2010]],
  south: [["愛河邊散步", 0], ["安平老街", 0], ["西子灣看夕陽", 0], ["花園夜市", 2000], ["駁二看展", 2003]],
  east: [["七星潭看海", 0], ["鯉魚潭划船", 0], ["鐵花村聽音樂", 2010]],
  islands: [["海邊看夕陽", 0], ["老街吃小吃", 0]],
};
const pickSpot = (list, y, ctx) => ctx.rng.pick(list.filter(([, from]) => from <= y).map(([n]) => n));
// The scooter of the era: one model, or the models of a {甲|乙|丙} choice ("{光陽|三陽|山葉}機車" picks the same
// as three whole names). From 2016 the third is written with its space (一台 JET S), see y_vehicle.
const scooterOf = y => (y < 1974 ? ["偉士牌機車"] : y < 1990 ? ["偉士牌機車", "野狼 125", "光陽機車"] : y < 2003 ? ["光陽機車", "三陽機車", "山葉機車"] : y < 2016 ? ["勁戰", "雷霆"] : ["新勁戰", "雷霆", "JET S"]);

export const YOUNG = [
  // ---------- college ----------
  {
    // The first weeks of college. Picks the department and whether you live in a dorm, for the events after it.
    id: "y_freshman", once: true, domain: "study", channel: "good", ages: [17, 22],
    when: s => undergrad(s) && s.flags.uniAt === s.age, p: () => 0.75,
    apply: (s, ctx) => {
      const dept = deptOf(s, ctx), lead = majorLead(s, ctx), y = s.year;
      s.flags.dorm = ctx.rng() < 0.6;
      const t = y < 1985 ? [
        "{lead}進了{dept}。新生訓練完，學長姊帶全班去{郊遊|烤肉|爬山}，大家圍著營火{跳土風舞|唱歌}到半夜。",
        "{lead}進了{dept}，系上辦了第一場{聯誼|舞會}，你{緊張得只敢站在牆邊。|連對方的名字都不敢問。|跳錯了好幾次舞步，大家笑成一團。}",
        "{lead}開始讀{dept}，{第一次自己去郵局寄信回家報平安。|宿舍熄燈後，大家拿著手電筒在走廊聊天。|每個月最期待家裡寄來的生活費和一罐肉鬆。}",
      ] : y < 2005 ? [
        "{lead}進了{dept}。迎新宿營三天兩夜，{你被抓上台跳了一支舞。|小隊輔帶著你們玩到天亮。|你認識了後來最常一起吃飯的同學。}",
        "{lead}開始讀{dept}，直屬學長姊塞給你一疊{共筆|考古題}，說：「{這個比課本重要。|期中考全靠它了。}」",
        y >= 1995
          ? "{lead}進了{dept}，{第一次學會上 BBS，|在宿舍接上了宿網，}{每天晚上都泡在看板上。|跟高中同學在網路上聊到半夜。}"
          : "{lead}進了{dept}，{學長姊帶著大家去夜市吃宵夜，|第一次參加系上的烤肉，}{你覺得大學生活好自由。|宿舍的門禁比家裡還晚。}",
      ] : [
        "{lead}進了{dept}。迎新宿營三天兩夜，{你被抓上台跳了一支舞。|小隊輔帶著你們玩到天亮。|你認識了後來最常一起吃飯的同學。}",
        "{lead}開始讀{dept}，{一入學就被拉進系上的{group}，{訊息多到看不完。|學長姊每天都在上面公告活動。}|直屬學長姊傳了一份「必修課生存指南」給你，你默默把它存了起來。}",
        "{lead}進了{dept}，第一次自己{上網選課，熱門的通識課一下就被搶光。|排課表，把早八全部避開。|在學校附近找到一家便宜又大碗的自助餐。}",
      ];
      return { text: ctx.w(t, { dept, lead, group: y < 2012 ? "臉書社團" : " LINE 群組" }), mood: 4 };
    },
  },
  {
    id: "y_major", once: true, domain: "study", channel: "change", ages: [17, 24],
    when: s => undergrad(s) && !!s.flags.dept && uniYear(s) <= 2, p: () => 0.18,
    choice: (s, ctx) => {
      const dept = s.flags.dept, other = pickDept(s, ctx, s.track === "科大" ? "tech" : ctx.rng.pick(["science", "arts"]), dept);
      const who = parentsWord(s), online = s.year >= 2008;
      return {
        prompt: ctx.w([
          "讀了{一個學期|一年}的{dept}，你發現自己{對系上的課提不起勁|上課常常在想別的事}，反而對{other}比較有興趣。要怎麼辦？",
          "當初是看分數填了{dept}，讀了{一學期|一年}才發現，你真正想讀的是{other}。要怎麼辦？",
          "{dept}的專業必修讀得很痛苦，你常常跑去{other}旁聽，越聽越喜歡。要怎麼辦？",
        ], { dept, other }),
        options: [
          {
            id: "y_major.switch", label: "準備轉系考", hint: "要考試，名額不多", act: "study", style: "risk", weight: 0.2,
            apply: (s2, c) => {
              if (c.roll("study", "good", 0.45)) { s2.flags.dept = other; return { text: c.w("想讀{other}，你準備了一整個暑假的轉系考，{放榜那天在系辦的公告上看到自己的名字。|收到通過的通知，你高興得打電話回家。}下學期起改念{other}。", { other }), mood: 6 }; }
              return { text: c.w("想讀{other}，你去考了轉系，{差了幾分沒上。|名額只有三個，你排在第五。}你決定先選修{other}的課，{一門一門慢慢修。|把它當成第二專長。}", { other }), mood: -3 };
            },
          },
          {
            id: "y_major.minor", label: "修輔系或雙主修", hint: "多修很多學分，會很忙", act: "study", style: "learn", weight: 0.22,
            apply: (s2, c) => { s2.flags.minor = other; stress(s2, 0.05); return { text: c.w("想讀{other}，你申請了{other}的{輔系|雙主修}，{課表排得滿滿的，午餐都在兩個系館之間跑來跑去。|每學期多修了快十個學分，週末都泡在圖書館。}", { other }), mood: 1 }; },
          },
          {
            id: "y_major.stay", label: "先讀下去看看", hint: "說不定讀著讀著就喜歡了", act: "pushThrough", style: "safe", weight: 0.25,
            apply: (s2, c) => (c.roll("study", "good", 0.5)
              ? { text: c.w("對{dept}提不起勁，你還是決定先讀下去。{升上大二開始上專業課，反而越讀越有興趣。|後來修到一門很喜歡的課，才覺得讀{dept}也不錯。}", { dept }), mood: 2 }
              : { text: c.w("對{dept}提不起勁，你還是決定先讀下去，{把該修的學分一門一門修完。|每天告訴自己，至少要拿到畢業證書。}", { dept }), mood: -1 }),
          },
          {
            id: "y_major.family", label: ctx.f("回家跟{who}商量", { who }), hint: "學費是家裡出的", act: "talk", style: "family", weight: 0.15, when: s2 => parentsAlive(s2),
            apply: (s2, c) => ({ text: c.w("想讀{other}的事，你回家跟{who}說了。{who}{沉默了很久，最後說：「你自己決定就好。」|說：「讀什麼都好，你快樂比較重要。」|還是希望你讀完{dept}，你們說好先修{other}的課看看。}", { dept, other, who }), mood: 1 }),
          },
          {
            id: "y_major.self", label: "把心力放在社團和自學", hint: "學校教的不是全部", act: "hobby", style: "self", weight: 0.15,
            apply: (s2, c) => ({ text: c.w(online
              ? "對{dept}提不起勁，你把重心放到社團和自學，{上網看{other}的開放式課程|跑去旁聽{other}的課}，{成績普普通通，但每天都過得很充實。|期末差點被當，你一點也不後悔。}"
              : "對{dept}提不起勁，你把重心放到社團和自學，{找{other}的書來讀|跑去旁聽{other}的課}，{成績普普通通，但每天都過得很充實。|期末差點被當，你一點也不後悔。}", { dept, other }), mood: 2 }),
          },
        ],
      };
    },
  },
  {
    id: "y_dorm", once: true, ages: [17, 24], when: s => undergrad(s) && !!s.flags.dorm && uniYear(s) <= 3, p: () => 0.28,
    choice: (s, ctx) => {
      const y = s.year, they = s.sex === "female" ? "她們" : "他們";
      const late = y < 1990 ? "在寢室打牌打到半夜" : y < 2005 ? "上網打電動打到半夜三點" : "打線上遊戲打到半夜三點";
      const fuss = y >= 1995 ? "冷氣要開幾度" : "誰該掃地倒垃圾";
      const music = y < 1980 ? "收音機" : "音響";
      return {
        prompt: ctx.w([
          "住宿舍{的第一年|以後}，室友{每天{late}|的鬧鐘一早響個不停，自己卻不起床|常常帶朋友回寢室聊到半夜}，你已經好幾個晚上沒睡好。要怎麼辦？",
          "宿舍{四人|六人}一間，你和室友的作息完全相反：{你早睡早起，{they}是夜貓子。|你習慣安靜讀書，{they}喜歡開著{music}。}要怎麼辦？",
          "寢室裡{泡麵的味道散不掉|垃圾一個禮拜沒人倒|天天為了{fuss}鬥嘴}，室友之間的氣氛越來越僵。要怎麼辦？",
        ], { late, they, music, fuss }),
        options: [
          {
            id: "y_dorm.talk", label: "直接跟室友談", hint: "把話講開", act: "talk", style: "self", weight: 0.3,
            apply: (s2, c) => ({ text: c.w("和宿舍室友處不來，你找了一個晚上跟{they}把話講開，{大家說好十二點以後戴耳機、關大燈。|沒想到{they}也覺得不好意思，之後安靜多了。|{they}答應會改，雖然只撐了兩個禮拜。}", { they }), mood: 1 }),
          },
          {
            id: "y_dorm.rules", label: "訂一份寢室公約", hint: "大家一起遵守", act: "negotiate", style: "social", weight: 0.2,
            apply: (s2, c) => ({ text: c.w("和宿舍室友處不來，你提議訂一份寢室公約，{貼在門後：十二點熄燈、垃圾輪流倒。|大家都簽了名，雖然有點好笑，倒是真的有用。}"), mood: 1 }),
          },
          {
            id: "y_dorm.plugs", label: "戴耳塞，各過各的", hint: "不想起衝突", act: "avoid", style: "safe", weight: 0.2,
            apply: (s2, c) => ({ text: c.w("和宿舍室友處不來，你買了耳塞和眼罩，{各過各的，倒也相安無事。|每天比大家早出門，在圖書館待到閉館才回去。}"), mood: -1 }),
          },
          {
            id: "y_dorm.friends", label: "約室友吃宵夜，先混熟", hint: "熟了比較好說話", act: "socialize", style: "social", weight: 0.15,
            apply: (s2, c) => {
              const f = friendOf(s2, c, { sex: s2.sex, how: "大學室友", fresh: true }); bond(f, 0.1);
              return { text: c.w("和宿舍室友處不來，你乾脆約大家去吃宵夜。{一碗麵線|幾串鹽酥雞}下肚，{f}跟你聊到凌晨，{你們後來變成無話不談的朋友。|之後再有摩擦，都變成可以笑著講的事。}", { f: f.call }), mood: 3 };
            },
          },
          {
            id: "y_dorm.move", label: "申請換寢室", hint: "換個環境", act: "moveHome", style: "risk", weight: 0.15,
            apply: (s2, c) => ({ text: c.w(s2.sex === "female"
              ? "和宿舍室友處不來，你申請換寢室，{等了一個學期才換成。|新室友是個安靜的學姊，你終於睡得著了。}"
              : "和宿舍室友處不來，你申請換寢室，{等了一個學期才換成。|新室友是個安靜的學長，你終於睡得著了。}"), mood: 1 }),
          },
        ],
      };
    },
  },
  {
    id: "y_club", once: true, ages: [17, 24], when: s => undergrad(s) && uniYear(s) <= 2, p: () => 0.22,
    choice: (s, ctx) => {
      const y = s.year;
      const music = y >= 1977 && y < 1986 ? "民歌社" : y < 1995 ? "吉他社" : ctx.rng.pick(["吉他社", "熱音社"]);
      return {
        prompt: ctx.w(y < 1985 ? "開學的社團博覽會擺了一整排攤位，{合唱團|國樂社|登山社|校刊社}和系隊都在招新生。你想參加什麼？"
          : y < 2005 ? "開學的社團博覽會擺了一整排攤位，{吉他社|熱舞社|登山社|攝影社}和系隊都在招新生。你想參加什麼？"
            : "開學的社團博覽會擺了一整排攤位，{熱音社|熱舞社|桌遊社|動漫社|山服社}和系隊都在招新生。你想參加什麼？"),
        options: [
          {
            id: "y_club.team", label: "加入系隊", hint: "每天練球，也交到朋友", act: "exercise", style: "health", weight: 0.2,
            apply: (s2, c) => {
              s2.health.fitness = clamp(s2.health.fitness + 0.05);
              const f = friendOf(s2, c, { sex: s2.sex, how: "系隊隊友", fresh: true });
              return { text: c.w("大學加入系{籃|排|壘}，{每天傍晚在操場練球，週末去打系際盃。|練了兩年，終於在系際盃拿到冠軍。}隊友{f}{成了你在場上最有默契的搭檔。|後來也成了你最好的朋友之一。}", { f: f.call }), mood: 3 };
            },
          },
          {
            id: "y_club.music", label: music === "民歌社" ? "參加民歌社" : music === "吉他社" ? "參加吉他社" : "參加熱音社", hint: "學一樣樂器，上台表演", act: "hobby", style: "learn", weight: 0.2,
            apply: (s2, c) => ({ text: c.w(music === "民歌社"
              ? "校園民歌正流行，你參加了民歌社，{抱著吉他在草地上唱〈橄欖樹〉。|和社員組團去參加民歌比賽，雖然沒得名，卻唱得好開心。}"
              : music === "吉他社"
                ? "大學參加吉他社，{從按不好和弦練到可以上台表演。|期末成果發表會上，你在台上{唱|彈}了一首歌，台下的同學一起拍手。|和社員組了一個樂團，每週在社辦練團到半夜。}"
                : "大學參加熱音社，{從按不好和弦練到可以上台表演。|期末成果發表會上，你在台上{唱|彈}了一首歌，台下的同學一起拍手。|和社員組了一個樂團，每週在社辦練團到半夜。}"), mood: 3 }),
          },
          {
            id: "y_club.service", label: "參加服務性社團", hint: "寒暑假去偏鄉辦營隊", act: "volunteer", style: "social", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("大學參加了{山地服務隊|課輔社|慈幼社}，{寒假到{台東|屏東|南投}山上的小學辦營隊，|每週去育幼院陪小朋友寫功課，}{孩子們送你一張手畫的卡片。|回來以後，你對很多事情的看法都不一樣了。}"), mood: 4 }),
          },
          {
            id: "y_club.cadre", label: "當系學會幹部", hint: "辦活動，很忙也很有成就感", act: "socialize", style: "risk", weight: 0.15,
            apply: (s2, c) => { stress(s2, 0.05); return { text: c.w("大學被拉去當系學會的{活動長|公關|會長}，{辦迎新、宿營、系烤，忙到期中考差點被當。|第一次學會寫企劃書、跟廠商談贊助。|跟幹部們熬夜開會，吵過架也一起哭過。}"), mood: 2 }; },
          },
          {
            id: "y_club.mountain", label: "參加登山社", hint: "上山看雲海", act: "exercise", style: "risk", weight: 0.1,
            apply: (s2, c) => ({ text: c.w("大學參加登山社，{第一次背著大背包走上{雪山|玉山|合歡山}，|跟社員在山屋擠了一夜，|走了三天的山路，}{清晨看到滿天的雲海，你覺得一切都值得了。|下山後腳痛了一個禮拜，你卻馬上報名了下一次。}"), mood: 4 }),
          },
          {
            id: "y_club.none", label: "不參加，時間留給自己", hint: "打工、讀書或休息", act: "rest", style: "self", weight: 0.2,
            apply: (s2, c) => ({ text: c.w("大學沒有參加社團，你把時間留給自己，{下課就去打工存錢。|常常一個人去圖書館看閒書。|週末回家陪家人吃飯。}"), mood: 0 }),
          },
        ],
      };
    },
  },
  {
    id: "y_parttime", domain: "wealth", channel: "change", ages: [18, 26], cooldown: 3, max: 2,
    when: s => s.studying && ["大學", "科大", "碩士", "五專"].includes(s.track) && !s.abroad, p: () => 0.06,
    choice: (s, ctx) => {
      const y = s.year;
      const shop = ctx.rng.pick([...(y >= 1980 ? ["便利商店"] : []), ...(y >= 1985 ? ["速食店"] : []), ...(y >= 1990 ? ["飲料店"] : []), "餐廳", "書店"]);
      return {
        prompt: ctx.w(["{生活費有點不夠用|想自己賺點零用錢|看到同學都在打工}，你想去打工。要做什麼？", "{下學期的學費|想買的東西}還差一點，你打算找個打工。要做什麼？"]),
        options: [
          {
            id: "y_parttime.tutor", label: "當家教", hint: "時薪高，要會教", act: "sideJob", style: "learn", weight: 0.2,
            apply: (s2, c) => { s2.savings += 0.04; return { text: c.w("課餘去當家教，教{國中生數學|高中生英文|小學生寫功課}，{學生月考進步了二十分，家長送你一盒水果。|一個小時的家教費，抵得上在餐廳打工的兩倍。|你發現教會別人，比自己讀懂還難。}"), mood: 2 }; },
          },
          {
            id: "y_parttime.shop", label: ctx.f("去{shop}打工", { shop }), hint: "排班制，薪水穩定", act: "sideJob", style: "self", weight: 0.3,
            apply: (s2, c) => {
              s2.savings += 0.05; stress(s2, 0.03);
              return { text: c.w(shop === "便利商店"
                ? "在便利商店打工，{值大夜班時，凌晨三點的店裡只剩你和冰櫃的聲音。|學會了繳費、寄包裹、煮關東煮，什麼都要會。|有個熟客每天都買一樣的早餐，你不用問就幫他拿好。}"
                : "在{shop}打工，{學會了一邊招呼客人一邊記住熟客的口味。|週末一站就是八個小時，下班時腳都腫了。|領到第一份薪水，你請室友吃了一頓宵夜。}", { shop }), mood: 1 };
            },
          },
          {
            id: "y_parttime.campus", label: "在學校當工讀生", hint: "錢少，但時間彈性", act: "sideJob", style: "safe", weight: 0.15,
            apply: (s2, c) => { s2.savings += 0.02; return { text: c.w("在{系辦|圖書館|學校餐廳}當工讀生，{薪水不多，但可以邊顧櫃台邊讀書。|跟系上的助教混得很熟，選課都有人提醒。}"), mood: 1 }; },
          },
          {
            id: "y_parttime.hustle", label: y >= 2016 ? "跑外送" : "跟同學去夜市擺攤", hint: "賺得多，也比較累", act: "sideJob", style: "risk", weight: 0.15,
            apply: (s2, c) => {
              s2.savings += 0.06; stress(s2, 0.05);
              return { text: c.w(y >= 2016
                ? "下課後騎車跑外送，{一個晚上跑了十幾單，|下雨天單價比較高，你穿著雨衣跑到半夜，}{存到了下學期的學費。|整個城市的巷子你都摸熟了。}"
                : y < 1995
                  ? "跟同學在夜市擺攤賣{飾品|髮夾|雞蛋糕}，{第一天只賣出三樣，|喊到喉嚨都啞了，}{一個學期下來竟然存了一筆錢。|學會了怎麼跟客人應對。}"
                  : "跟同學在夜市擺攤賣{飾品|手機殼|雞蛋糕}，{第一天只賣出三樣，|喊到喉嚨都啞了，}{一個學期下來竟然存了一筆錢。|學會了怎麼跟客人應對。}"), mood: 1 };
            },
          },
          {
            id: "y_parttime.study", label: "不打工，專心讀書", hint: "把時間留給課業", act: "study", style: "learn", weight: 0.2,
            apply: (s2, c) => (c.roll("study", "good", 0.4)
              ? { text: c.w("{算了算時間，|和家裡談過以後，}你決定不打工、把時間留給課業，{那學期拿到了書卷獎。|成績進步了一大截。}"), mood: 3 }
              : { text: c.w("{算了算時間，|和家裡談過以後，}你決定不打工、專心讀書，{成績普普通通，但睡得很飽。|省吃儉用撐過了那個學期。}"), mood: 1 }),
          },
        ],
      };
    },
  },
  {
    id: "y_examWeek", ages: [17, 27], cooldown: 2, max: 2, when: s => inCollege(s), p: () => 0.12,
    apply: (s, ctx) => {
      const y = s.year, good = ctx.roll("study", "good", 0.55);
      // How the exams went: the two sentences of its {甲|乙} choice.
      const [e1, e2] = good ? ["一科都沒被當。", "成績比想像中好。"] : ["還是被當了一科。", "有一科低空飛過，有一科沒過。"];
      return {
        text: told(s, ctx, [
          y >= 1984 ? "期末考週，你和同學在{二十四小時的麥當勞|系館| K 書中心}讀到天亮，{{e1}|{e2}}" : "期末考週，你和同學在{宿舍交誼廳|系館|圖書館}讀到天亮，{{e1}|{e2}}",
          y >= 1990 ? "期末考{前一週才開始讀，|全靠{共筆|學長姊的考古題}，}{熬了三個通宵，|喝掉了一整打提神飲料，}{{e1}|{e2}}" : "期末考{前一週才開始讀，|全靠{學長姊的筆記|考古題}，}{熬了三個通宵，|喝掉了一整打提神飲料，}{{e1}|{e2}}",
          "期中考週，{整棟宿舍半夜都還亮著燈，|全班擠在圖書館{grab}，}你{把一學期的課在三天裡讀完，|一邊讀一邊懷疑人生，}{{e1}|{e2}}",
        ], { e1, e2, grab: y >= 2005 ? "搶插座" : "搶位子" }),
        mood: good ? 2 : -2,
      };
    },
  },
  {
    // 翹課：早上的課爬不起來、熬夜、打工排太多。大學生活的小事，最多是一門課被當。
    id: "y_skipClass", once: true, domain: "study", channel: "bad", ages: [18, 24],
    // Not for 夜間部 students: their classes are in the evening.
    when: s => undergrad(s) && !s.flags.nightSchool && typeof s.flags.uniAt === "number" && uniYear(s) <= 3, p: () => 0.45,
    choice: (s, ctx) => {
      const y = s.year, dept = deptOf(s, ctx), phone = y >= 2003, notes = y >= 1985 ? "共筆" : "筆記";
      const course = ctx.rng.pick(["大一英文", "通識課", ...(/電|機|化|土木|物理|數學|資|材料|工程|生科/.test(dept) ? ["微積分", "普通物理"] : ["大一國文"])]);
      const treat = ctx.rng.pick(y >= 1990 ? ["雞排", "早餐", "飲料"] : ["陽春麵", "早餐"]);
      // Staying up late, by era: cards in the dorm, BBS, the 網咖 years, MSN, phones. [what, button, what you did]
      const [late, unplugLabel, unplug] = ctx.rng.pick(y < 1995 ? [["在寢室打牌打到半夜", "平日不再打牌", "跟室友說好平日不打牌"]]
        : y < 2000 ? [["上 BBS 上到半夜", "十二點以後不開電腦", "說好十二點以後就不開電腦"], ...(y >= 1998 ? [["在網咖打星海爭霸打到天亮", "不再去網咖", "把網咖的會員卡剪了"]] : [])]
          : y < 2005 ? [["在網咖打{天堂|CS}打到天亮", "不再去網咖", "把網咖的會員卡剪了"], ["上 BBS 上到半夜", "十二點以後不開電腦", "說好十二點以後就不開電腦"]]
            : y < 2012 ? [["打線上遊戲打到半夜三點", "把遊戲刪掉，早點睡", "把遊戲從電腦裡刪掉"], ["掛在 MSN 上聊到半夜三點", "十二點就登出 MSN", "十二點一到就把 MSN 登出"]]
              : [["滑手機滑到凌晨三點", "睡前把手機放遠一點", "睡前把手機放到書桌上充電"], ["追劇追到凌晨三點", "說好一天只看一集", "跟自己說好一天只看一集"]]);
      // [label, hint, what you did]. What you did is told after the scene's lead; the usual 「借筆記」 and 「調整作息」 are
      // choices of their own ({甲|乙}), so they have templates of their own below (NOTES, HABIT).
      const base = {
        go: ["設三個鬧鐘，乖乖去上課", "把出席救回來", phone ? "設了三個鬧鐘，還把手機放在房間的另一頭" : "設了三個鬧鐘，還把鬧鐘放在房間的另一頭"],
        notes: [y >= 1985 ? "借共筆，考前再拚" : "借筆記，考前再拚", "省下來的時間拿去做別的", null],
        sign: ["請同學幫忙代點名", "被抓到就慘了", "請{f}幫忙點名，說好請吃{treat}"],
        habit: ["調整作息，早點睡", "把生活拉回正軌", null],
        prof: ["去找老師說明狀況", "說不定有轉機", "下課後去找老師，說明了自己的狀況"],
        drop: ["退選，下學期再修", "不想被當", "趁還來得及，把這門課退選了"],
      };
      const sc = sceneOf(s, ctx, "y_skipClass", [
        { key: "early", prompt: "這學期的{course}排在早上八點，你已經{連續三次睡過頭|缺了快一半的課}，{期中考快到了。|助教說再缺課就要扣考。}要怎麼辦？",
          lead: y >= 2005 ? ctx.f("{course}的早八一直爬不起來，", { course }) : ctx.f("早上第一節的{course}一直爬不起來，", { course }) },
        { key: "late", prompt: late.includes("{")
          ? "你常常在網咖打{天堂|CS}打到天亮，白天的課一堂接一堂睡掉，{course}{已經缺了好幾次。|上次小考只寫了名字。}要怎麼辦？"
          : "你常常{late}，白天的課一堂接一堂睡掉，{course}{已經缺了好幾次。|上次小考只寫了名字。}要怎麼辦？", lead: "晚上玩到太晚，白天的課一直缺，",
          o: { go: ["再累也硬撐著去上課", "把出席救回來", "再累也硬撐著去上課"], habit: [unplugLabel, "把生活拉回正軌", unplug] } },
        y >= 1980 && { key: "job", prompt: s.flags.dorm
          ? "打工的班排得太多，{晚班|大夜班}下班回到宿舍都快{兩點|天亮}了，早上的{course}{常常爬不起來。|已經缺了好幾次。}要怎麼辦？"
          : "打工的班排得太多，{晚班|大夜班}下班回到住的地方都快{兩點|天亮}了，早上的{course}{常常爬不起來。|已經缺了好幾次。}要怎麼辦？", lead: "打工排得太多，課一直缺，",
          o: { go: ["班照排，課也硬撐著去", "把出席救回來", "班照排，課也硬撐著去上"], habit: ["少排一點班，早點睡", "先顧好課業", "跟店長說好把班減掉一半，晚上早點睡"] } },
        { key: "dull", prompt: y >= 1995
          ? "{course}的老師{照著課本念|對著投影片念稿}，全班有一半的人在睡覺，{你已經好幾週沒去了。|你開始覺得去不去都一樣。}要怎麼辦？"
          : "{course}的老師照著課本念，全班有一半的人在睡覺，{你已經好幾週沒去了。|你開始覺得去不去都一樣。}要怎麼辦？", lead: ctx.f("覺得{course}去不去都一樣，", { course }),
          o: { go: ["坐第一排，逼自己聽", "把出席救回來", "坐到第一排，逼自己聽下去"], notes: [y >= 1985 ? "不去上，靠共筆自己讀" : "不去上，靠筆記自己讀", "省下來的時間拿去做別的", y >= 1985 ? "不去上了，靠共筆自己讀" : "不去上了，靠筆記自己讀"], habit: ["早點睡，上課才不會打瞌睡", "把生活拉回正軌", "開始早點睡，上課至少不再打瞌睡"] } },
        { key: "roll", prompt: "{course}每堂課都點名，同學說可以幫你答「有」，只要請一頓{treat}就好。要怎麼辦？", lead: "同學說可以幫你代點名，",
          o: { sign: ["請同學幫忙答「有」", "被抓到就慘了", "請{f}幫忙答「有」，說好請吃{treat}"], go: ["還是自己去上", "把出席救回來", "謝謝同學的好意，還是每堂自己去上"] } },
        dating(s) && { key: "date", prompt: "你和{partner}常常{約會|講電話}到很晚，{course}{已經連續缺了好幾堂。|上次小考只寫了名字。}要怎麼辦？", lead: "約會約到很晚，課一直缺，",
          o: { habit: [ctx.f("跟{name}約好平日早點回家", { name: s.partner.call }), "把生活拉回正軌", ctx.f("跟{partner}約好平日早點各自回家", { partner: s.partner.call })] } },
      ]);
      const B = buttonsOf(base, sc), lead = sc.lead;
      // The lead, what you did, how it went: {lead}你{did}，…
      const did = k => ({ lead, did: B[k][2] });
      return {
        prompt: ctx.w(sc.prompt, { course, late, treat }),
        options: [
          {
            id: "y_skipClass.go", label: B.go[0], hint: B.go[1], act: "study", style: "safe", weight: 0.3,
            apply: (s2, c) => (c.roll("study", "good", 0.55)
              ? { text: c.w("{lead}你{did}，{期末總算低空飛過。|老師說你後半學期進步很多。}", did("go")), mood: 2 }
              : { text: c.w("{lead}你{did}，{但前半學期落後太多，期末還是被當了。|出席救回來了，期中考卻沒考好。}", did("go")), mood: -1 }),
          },
          {
            id: "y_skipClass.notes", label: B.notes[0], hint: B.notes[1], act: "pushThrough", style: "self", weight: 0.25,
            apply: (s2, c) => (c.roll("study", "good", 0.5)
              ? { text: B.notes[2] ? c.w("{lead}你{did}，{總算低空飛過。|竟然考得比天天去上課的同學還好。}", did("notes")) : c.w("{lead}你跟同學借了{notes}，考前三天{一口氣讀完|熬夜猛 K}，{總算低空飛過。|竟然考得比天天去上課的同學還好。}", { lead, notes }), mood: 1 }
              : { text: B.notes[2] ? c.w("{lead}你{did}，{還是被當了，下學期要重修。|考卷上有一半的題目沒看過。}", did("notes")) : c.w("{lead}你跟同學借了{notes}，考前三天{一口氣讀完|熬夜猛 K}，{還是被當了，下學期要重修。|考卷上有一半的題目沒看過。}", { lead, notes }), mood: -3 }),
          },
          {
            id: "y_skipClass.sign", label: B.sign[0], hint: B.sign[1], act: "seekHelp", style: "risk", weight: 0.12,
            apply: (s2, c) => {
              const f = friendOf(s2, c, { prefer: /大學|室友|系隊/, how: "大學同學" }).call;
              const v = { lead, did: c.f(B.sign[2], { f, treat }) };
              return c.roll("study", "bad", 0.3)
                ? { text: c.w("{lead}你{did}，{結果老師當場抽點，兩個人都被記了曠課。|老師突然改成紙本簽到，你被扣了出席分數。}", v), mood: -3 }
                : { text: c.w("{lead}你{did}，{一整學期都沒被發現，|混過了點名，}{但期末考還是得自己來。|你心裡一直有點不踏實。}", v), mood: 0 };
            },
          },
          {
            id: "y_skipClass.habit", label: B.habit[0], hint: B.habit[1], act: "quitHabit", style: "health", weight: 0.15,
            apply: (s2, c) => { stress(s2, -0.03); return { text: B.habit[2] ? c.w("{lead}你{did}，{幾個禮拜後，早上的教室裡終於有你。|精神好多了，上課也聽得進去。}", did("habit")) : c.w("{lead}你{每天十二點前就關燈睡覺|把晚上的時間重新排過，早點上床}，{幾個禮拜後，早上的教室裡終於有你。|精神好多了，上課也聽得進去。}", { lead }), mood: 2 }; },
          },
          {
            id: "y_skipClass.prof", label: B.prof[0], hint: B.prof[1], act: "talk", style: "social", weight: 0.1,
            apply: (s2, c) => (c.roll("study", "good", 0.5)
              ? { text: c.w("{lead}你{did}，{老師讓你補交作業抵出席。|老師說只要期末考及格就讓你過。}", did("prof")), mood: 2 }
              : { text: c.w("{lead}你{did}，{老師說規定就是規定，你只好乖乖每堂都到。|老師點點頭，但缺的課還是補不回來。}", did("prof")), mood: -1 }),
          },
          {
            id: "y_skipClass.drop", label: B.drop[0], hint: B.drop[1], act: "wait", style: "safe", weight: 0.08,
            apply: (s2, c) => ({ text: c.w("{lead}你{did}，{下學期重修時，你挑了下午的班。|空出來的時間，你拿去{打工|參加社團}。}", did("drop")), mood: 0 }),
          },
        ],
      };
    },
  },
  {
    id: "y_nightRide", once: true, ages: [18, 24], when: s => s.year >= 1980 && !s.abroad && (inCollege(s) || s.age <= 22), p: () => 0.08,
    apply: (s, ctx) => {
      const spot = ctx.rng.pick(RIDE[regionOf(s.county)] || RIDE.islands);
      let mate = null;
      const m = () => (mate = mate || friendOf(s, ctx).call);
      return {
        text: ctx.w([
          inCollege(s)
            ? "{期末考完的那天晚上|畢業前的最後一個週末}，一群人臨時起意騎車夜衝{spot}，{凌晨四點冷得發抖，|在便利商店門口吃了一碗泡麵，}{太陽出來的那一刻，大家都安靜了。|回程每個人都在打瞌睡。}"
            : "{領到薪水的那個週末|一個睡不著的週末夜裡}，一群人臨時起意騎車夜衝{spot}，{凌晨四點冷得發抖，|在便利商店門口吃了一碗泡麵，}{太陽出來的那一刻，大家都安靜了。|回程每個人都在打瞌睡。}",
          "{半夜十二點|宵夜吃到一半}，{m}突然說：「走，夜衝{spot}！」{你們騎了兩個小時，|一路上只聽得到引擎聲，}{在那裡吹著風聊到天亮。|拍了一張每個人都很醜的合照。}",
          "生日那天，{m}{載著你|找了一群朋友陪你}夜衝{spot}，{在路邊幫你點了一根蠟燭。|大家在冷風裡唱生日快樂歌。}",
        ], { m, spot }),
        mood: 3,
      };
    },
  },
  {
    // 救國團的營隊和自強活動，1960–1990 年代很多年輕人的共同回憶。
    id: "y_youthCamp", once: true, ages: [18, 24], when: s => s.year >= 1960 && s.year <= 1992 && !s.abroad, p: () => 0.06,
    apply: (s, ctx) => ({
      text: ctx.w([
        "暑假參加救國團的{中橫健行隊，走了好幾天的山路，|溪頭自強活動，白天在森林裡健行、晚上玩團康，|蘭嶼探險隊，騎著腳踏車繞了島一圈，}{營火晚會上大家圍成一圈唱歌。|認識了好幾個外校的朋友，後來還通了好幾年的信。}",
        "寒假和同學{報名了合歡山的賞雪活動，第一次看到雪，興奮得在雪地裡打滾。|上阿里山看日出，清晨四點就爬起來，手都凍僵了，心裡卻很熱。|參加了溪頭的自強活動，在森林裡走了一整天，晚上擠在通鋪聊天。}",
        "和{同學|朋友}坐著遊覽車去{墾丁|日月潭|太魯閣}玩，{一路上唱了好多首歌，|在旅社的通鋪擠了兩個晚上，}{那幾張泛黃的照片，你保存了好多年。|回來後大家約好明年再去。}",
      ]),
      mood: 4,
    }),
  },
  {
    id: "y_exchange", once: true, domain: "move", channel: "change", ages: [19, 27],
    when: s => s.year >= 2000 && inCollege(s) && (s.track === "碩士" || (uniYear(s) >= 2 && uniYear(s) <= 3)), p: () => 0.06,
    choice: (s, ctx) => {
      const place = ctx.rng.weighted([["日本", 3], ["韓國", 1.5], ["美國", 1.5], ["德國", 1], ["荷蘭", 0.8], ["法國", 0.8], ["捷克", 0.5], ["瑞典", 0.5]]);
      const lang = { 日本: "日文", 韓國: "韓文", 德國: "德文", 法國: "法文" }[place] || "英文";
      const school = ["日本", "韓國", "德國", "法國", "美國"].includes(place) ? place : ctx.rng.pick(["英國", "澳洲", "加拿大"]);
      const who = parentsWord(s);
      const went = s2 => { s2.flags.beenAbroad = true; s2.flags.y_awayAt = s2.age; };
      return {
        prompt: ctx.w("{學校的國際處|系上}公布了交換學生的名額，{{place}的姊妹校還有空位。|你一直很想去的{place}也在名單上。}要申請嗎？", { place }),
        options: [
          {
            id: "y_exchange.term", label: ctx.f("去{place}交換一學期", { place }), hint: "花費不小，眼界會打開", act: "studyAbroad", style: "risk", weight: 0.25,
            apply: (s2, c) => { spend(s2, 0.05); went(s2); return { text: c.w("申請到{place}交換一學期，{在宿舍的共用廚房學會了煮{咖哩|義大利麵}，|跟來自各國的同學一起上課、旅行，}{回台灣時，{lang}進步了，膽子也大了不少。|最後一天在機場哭得比誰都慘。}", { place, lang }), mood: 6, big: true }; },
          },
          {
            id: "y_exchange.year", label: "申請一整年", hint: "可能要延畢", act: "studyAbroad", style: "risk", weight: 0.1,
            apply: (s2, c) => {
              spend(s2, 0.08); went(s2);
              const late = c.rng() < 0.4 && canDelay(s2);
              if (late) s2.flags.uniAt += 1;
              return { text: c.w(late
                ? "在{place}交換了一整年，{冬天第一次看到雪，|一個人去了好幾個國家，}{你開始想像畢業後在國外工作的樣子。|回來後覺得台灣的夜市好親切。}回來以後學分抵不完，只好延後一年畢業。"
                : "在{place}交換了一整年，{冬天第一次看到雪，|一個人去了好幾個國家，}{你開始想像畢業後在國外工作的樣子。|回來後覺得台灣的夜市好親切。}", { place }), mood: 7, big: true };
            },
          },
          {
            id: "y_exchange.short", label: "改參加暑期遊學", hint: "一個月，比較便宜", act: "travel", style: "learn", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.03); s2.flags.beenAbroad = true; return { text: c.w("沒有申請交換，改報名暑假到{school}的{語言學校|短期遊學團}，{一個月就花光了打工存的錢，|每天下課就去逛街吃東西，}{但看見了不一樣的世界。|回來後立刻報名了{lang}檢定。}", { school, lang }), mood: 3 }; },
          },
          {
            id: "y_exchange.money", label: "考慮家裡的經濟，先不去", hint: "不想讓家裡負擔", act: "save", style: "family", weight: 0.25,
            apply: (s2, c) => ({ text: c.w("想去{place}交換，但算了算{機票和生活費|一學期的開銷}，你不想讓{who}負擔，{把申請表收進了抽屜。|決定先打工存錢，以後再說。}", { place, who }), mood: -2 }),
          },
          {
            id: "y_exchange.stay", label: "留在台灣修課", hint: "怕延畢", act: "wait", style: "safe", weight: 0.2,
            apply: (s2, c) => ({ text: c.w(s2.track === "碩士"
              ? "沒有申請去{place}交換，你{怕延畢，|想先把必修修完，}留在台灣{專心寫論文。|跟著教授做計畫。}"
              : "沒有申請去{place}交換，你{怕延畢，|想先把必修修完，}留在台灣{準備考研究所。|跟著教授做專題。|專心修課。}", { place }), mood: 0 }),
          },
        ],
      };
    },
  },
  {
    id: "y_internship", once: true, domain: "career", channel: "good", ages: [19, 27],
    when: s => s.year >= 1995 && inCollege(s) && (s.track === "碩士" || uniYear(s) >= 3), p: () => 0.15,
    choice: (s, ctx) => {
      const y = s.year, master = s.track === "碩士", when = master ? "研究所的暑假" : "大三升大四的暑假";
      const small = y >= 2010 ? "新創公司" : "小公司", room = isArts(s) ? "研究室" : "實驗室", big3 = y >= 2005;
      // [label, hint] per option. What you did and how it went is one template per scene (T below), since most of what
      // you did is a choice of its own ({一家外商|一間上市公司}…).
      const base = {
        big: ["去大公司實習", "學規矩，履歷好看"],
        small: [ctx.f("去{small}實習", { small }), "什麼都要做，學最多"],
        lab: ["跟著教授做研究", "為研究所鋪路"],
        ngo: ["去非營利組織實習", "錢很少，意義很多"],
        earn: ["打工賺學費", "先顧好生活"],
        trip: ["去旅行，好好休息", "學生時代最後的暑假"],
      };
      // Where the summer's chances come from: introductions, the department's required internship credits (common from
      // the 2000s), job sites and career fairs (人力銀行 from 1996), or a professor who needs a hand.
      const sc = sceneOf(s, ctx, "y_internship", [
        { key: "offers", prompt: "{when}到了，{系上|教授|學長姊}介紹了幾個實習機會。你想怎麼過這個暑假？", lead: master ? "研究所的暑假，" : "大三升大四的暑假，" },
        y >= 2005 && !master && { key: "credit", w: 1.5, lead: "系上規定要修實習學分，",
          prompt: "系上規定畢業前要修實習學分，系辦外的公布欄貼滿了暑期實習的職缺，{熱門的名額一下就被登記走了。|大家都在搶大公司的名額。}你想怎麼安排？",
          o: {
            big: ["搶大公司的實習名額", "競爭激烈，履歷好看"],
            small: [ctx.f("登記{small}的名額", { small }), "什麼都要做，學最多"],
            lab: [ctx.f("在教授的{room}實習", { room }), "也能抵學分"],
            ngo: ["選非營利組織的實習", "錢很少，意義很多"],
            earn: ["實習排到下學期，暑假先打工", "先把學費賺起來"],
            trip: ["實習排到下學期，暑假先去玩", "學生時代最後的暑假"],
          } },
        y >= 1997 && { key: "fair", lead: "看了一圈暑期實習的職缺，",
          prompt: y >= 2003
            ? "{人力銀行上|校園徵才博覽會上}，好幾家公司在招暑期實習生，{要先寄履歷、再去面試。|攤位前排了好長的隊。}{when}要怎麼過？"
            : "校園徵才博覽會上，好幾家公司在招暑期實習生，{要先寄履歷、再去面試。|攤位前排了好長的隊。}{when}要怎麼過？",
          o: {
            big: ["投大公司的實習", "競爭激烈，履歷好看"],
            small: [ctx.f("投{small}的實習", { small }), "什麼都要做，學最多"],
            lab: ["不投了，留在學校做研究", "為研究所鋪路"],
            ngo: ["投非營利組織的實習", "錢很少，意義很多"],
            earn: ["不實習，先打工賺學費", "先顧好生活"],
            trip: ["不實習，去旅行", "學生時代最後的暑假"],
          } },
        { key: "prof", w: master ? 1.5 : 1, lead: "教授問你暑假要不要當研究助理，",
          prompt: "{教授的研究計畫暑假缺一個助理|系上的教授在找暑期的研究助理}，下課後教授把你叫到辦公室，問你要不要留下來。{同學們已經在投實習的履歷了。|系上也有公司來找實習生。}要怎麼選？",
          o: {
            lab: ["留下來當教授的助理", "為研究所鋪路"],
            big: ["婉拒，去大公司實習", "學規矩，履歷好看"],
            small: [ctx.f("婉拒，去{small}實習", { small }), "什麼都要做，學最多"],
            ngo: ["婉拒，去非營利組織實習", "錢很少，意義很多"],
            earn: ["婉拒，去打工賺學費", "先顧好生活"],
            trip: ["婉拒，去旅行好好休息", "學生時代最後的暑假"],
          } },
      ]);
      const B = buttonsOf(base, sc), k = sc.key, v = { lead: sc.lead, small, room };
      // What you did in each scene ({lead}你…，) and how it went, per option.
      const T = {
        big: big3 ? {
          offers: "{lead}你到{一家外商|一間上市公司|一家科技大廠}實習，{每天穿著襯衫準時打卡，|跟著正職同事開會、做簡報，}{第一次知道職場是這個樣子。|實習結束時，主管說歡迎你畢業後回來。}",
          credit: "{lead}你搶到了{一家外商|一間上市公司|一家科技大廠}的實習名額，{每天穿著襯衫準時打卡，|跟著正職同事開會、做簡報，}{第一次知道職場是這個樣子。|實習結束時，主管說歡迎你畢業後回來。}",
          fair: "{lead}你面試上了{一家外商|一間上市公司|一家科技大廠}的暑期實習，{每天穿著襯衫準時打卡，|跟著正職同事開會、做簡報，}{第一次知道職場是這個樣子。|實習結束時，主管說歡迎你畢業後回來。}",
          prof: "{lead}你婉拒了教授，到{一家外商|一間上市公司|一家科技大廠}實習，{每天穿著襯衫準時打卡，|跟著正職同事開會、做簡報，}{第一次知道職場是這個樣子。|實習結束時，主管說歡迎你畢業後回來。}",
        } : {
          offers: "{lead}你到{一家大公司|一間上市公司}實習，{每天穿著襯衫準時打卡，|跟著正職同事開會、做簡報，}{第一次知道職場是這個樣子。|實習結束時，主管說歡迎你畢業後回來。}",
          fair: "{lead}你面試上了{一家大公司|一間上市公司}的暑期實習，{每天穿著襯衫準時打卡，|跟著正職同事開會、做簡報，}{第一次知道職場是這個樣子。|實習結束時，主管說歡迎你畢業後回來。}",
          prof: "{lead}你婉拒了教授，到{一家大公司|一間上市公司}實習，{每天穿著襯衫準時打卡，|跟著正職同事開會、做簡報，}{第一次知道職場是這個樣子。|實習結束時，主管說歡迎你畢業後回來。}",
        },
        small: {
          offers: "{lead}你到一間{small}實習，{一個人當三個人用，什麼都要做。|老闆讓你直接負責一個小專案。}{累得要命，學到的卻最多。|你發現自己很喜歡這種節奏。}",
          credit: "{lead}你登記了一間{small}的名額，{一個人當三個人用，什麼都要做。|老闆讓你直接負責一個小專案。}{累得要命，學到的卻最多。|你發現自己很喜歡這種節奏。}",
          fair: "{lead}你去了一間{small}實習，{一個人當三個人用，什麼都要做。|老闆讓你直接負責一個小專案。}{累得要命，學到的卻最多。|你發現自己很喜歡這種節奏。}",
          prof: "{lead}你婉拒了教授，到一間{small}實習，{一個人當三個人用，什麼都要做。|老闆讓你直接負責一個小專案。}{累得要命，學到的卻最多。|你發現自己很喜歡這種節奏。}",
        },
        lab: {
          offers: "{lead}你留在學校，跟著教授做{專題|研究計畫}，{每天泡在{room}到半夜。|第一次把結果做成海報，拿去研討會發表。}",
          credit: "{lead}你在教授的{room}實習，跟著做{專題|研究計畫}，{每天泡在{room}到半夜。|第一次把結果做成海報，拿去研討會發表。}",
          fair: "{lead}你決定留在學校，跟著教授做{專題|研究計畫}，{每天泡在{room}到半夜。|第一次把結果做成海報，拿去研討會發表。}",
          prof: "{lead}你答應留下來，跟著做{研究計畫|專題}，{每天泡在{room}到半夜。|第一次把結果做成海報，拿去研討會發表。}",
        },
        ngo: {
          offers: "{lead}你到{偏鄉的小學|社福團體|環保團體}實習，{跟著社工跑家訪，|幫忙辦了一場給孩子的夏令營，}{薪水很少，心裡很滿。|你開始想，以後的工作要能幫到人。}",
          credit: "{lead}你選了{偏鄉的小學|社福團體|環保團體}的實習，{跟著社工跑家訪，|幫忙辦了一場給孩子的夏令營，}{薪水很少，心裡很滿。|你開始想，以後的工作要能幫到人。}",
          fair: "{lead}你選了{偏鄉的小學|社福團體|環保團體}的實習，{跟著社工跑家訪，|幫忙辦了一場給孩子的夏令營，}{薪水很少，心裡很滿。|你開始想，以後的工作要能幫到人。}",
          prof: "{lead}你婉拒了教授，到{偏鄉的小學|社福團體|環保團體}實習，{跟著社工跑家訪，|幫忙辦了一場給孩子的夏令營，}{薪水很少，心裡很滿。|你開始想，以後的工作要能幫到人。}",
        },
        earn: {
          offers: "{lead}你沒有去實習，到{餐廳|工廠|補習班}打工，{存下了下學期的學費。|兩個月存了一筆錢，不用再跟家裡拿生活費。}",
          credit: "{lead}你把實習排到下學期，暑假先到{餐廳|工廠|補習班}打工，{存下了下學期的學費。|兩個月存了一筆錢，不用再跟家裡拿生活費。}",
          fair: "{lead}你決定不實習，到{餐廳|工廠|補習班}打工，{存下了下學期的學費。|兩個月存了一筆錢，不用再跟家裡拿生活費。}",
          prof: "{lead}你婉拒了教授，到{餐廳|工廠|補習班}打工，{存下了下學期的學費。|兩個月存了一筆錢，不用再跟家裡拿生活費。}",
        },
        trip: {
          offers: "{lead}你沒有實習，{騎著機車環島了一圈|跟朋友去{墾丁|花蓮|台東|澎湖|綠島}玩了一趟}，{曬得黑黑的回來。|把學生時代最後的暑假留給自己。}",
          credit: "{lead}你把實習排到下學期，暑假{騎著機車環島了一圈|跟朋友去{墾丁|花蓮|台東|澎湖|綠島}玩了一趟}，{曬得黑黑的回來。|把學生時代最後的暑假留給自己。}",
          fair: "{lead}你決定不實習，{騎著機車環島了一圈|跟朋友去{墾丁|花蓮|台東|澎湖|綠島}玩了一趟}，{曬得黑黑的回來。|把學生時代最後的暑假留給自己。}",
          prof: "{lead}你婉拒了教授，{騎著機車環島了一圈|跟朋友去{墾丁|花蓮|台東|澎湖|綠島}玩了一趟}，{曬得黑黑的回來。|把學生時代最後的暑假留給自己。}",
        },
      };
      return {
        prompt: ctx.w(sc.prompt, { when }),
        options: [
          {
            id: "y_internship.big", label: B.big[0], hint: B.big[1], act: "jobSearch", style: "safe", weight: 0.25,
            apply: (s2, c) => { s2.flags.intern = "big"; return { text: c.w(T.big[k], v), mood: 3 }; },
          },
          {
            id: "y_internship.small", label: B.small[0], hint: B.small[1], act: "sideJob", style: "risk", weight: 0.2,
            apply: (s2, c) => { s2.flags.intern = "small"; return { text: c.w(T.small[k], v), mood: 2 }; },
          },
          {
            id: "y_internship.lab", label: B.lab[0], hint: B.lab[1], act: "study", style: "learn", weight: 0.2,
            apply: (s2, c) => ({ text: c.w(T.lab[k], v), mood: 2 }),
          },
          {
            id: "y_internship.ngo", label: B.ngo[0], hint: B.ngo[1], act: "volunteer", style: "social", weight: 0.1,
            apply: (s2, c) => ({ text: c.w(T.ngo[k], v), mood: 3 }),
          },
          {
            id: "y_internship.earn", label: B.earn[0], hint: B.earn[1], act: "sideJob", style: "family", weight: 0.15,
            apply: (s2, c) => { s2.savings += 0.05; return { text: c.w(T.earn[k], v), mood: 1 }; },
          },
          {
            id: "y_internship.trip", label: B.trip[0], hint: B.trip[1], act: "travel", style: "self", weight: 0.1,
            apply: (s2, c) => { spend(s2, 0.03); return { text: c.w(T.trip[k], v), mood: 4 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_capstone", once: true, domain: "study", channel: "change", ages: [19, 26], when: s => undergrad(s) && uniYear(s) >= 3, p: () => 0.12,
    choice: (s, ctx) => {
      const online = s.year >= 2008;
      return {
        prompt: ctx.w(["畢業專題做到一半，{有個組員幾乎都不出現|組員一直推說很忙}，{進度只剩你在推。|離期末展覽只剩一個月。}要怎麼辦？", "畢業專題{的題目太難|的實驗一直失敗|的作品一直做不出來}，組員們{開始互相推卸|越來越少來開會}。要怎麼辦？"]),
        options: [
          {
            id: "y_capstone.carry", label: "自己扛下來", hint: "累，但做得完", act: "pushThrough", style: "self", weight: 0.25,
            apply: (s2, c) => { stress(s2, 0.05); return { text: c.w("畢業專題卡住了，你一個人扛下大部分的工作，{熬了好幾個通宵，|系館的燈常常只剩你們這組，}{作品最後拿到系上的佳作。|做完之後，你什麼都會一點了。}"), mood: 0 }; },
          },
          {
            id: "y_capstone.talk", label: "找組員把話說開", hint: "重新分工", act: "talk", style: "social", weight: 0.25,
            apply: (s2, c) => (c.roll("study", "good", 0.55)
              ? { text: c.w("畢業專題卡住了，你約組員吃飯把話說開，{大家重新分工，最後一個月一起拚完了。|原來有人家裡出了點事，你們調整了分工。}"), mood: 2 }
              : { text: c.w("畢業專題卡住了，你約組員把話說開，{對方嘴上答應，還是沒做多少。|大家吵了一架，最後各做各的部分。}"), mood: -2 }),
          },
          {
            id: "y_capstone.advisor", label: "找指導教授幫忙", hint: "請老師出面", act: "seekHelp", style: "safe", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("畢業專題卡住了，你去找指導教授，教授{重新幫你們分配工作，|要你們每週回報進度，}{總算在展覽前完成。|組員也不敢再偷懶了。}"), mood: 1 }),
          },
          {
            id: "y_capstone.learn", label: "趁機學會新技術", hint: "缺什麼就自己學", act: "study", style: "learn", weight: 0.2,
            apply: (s2, c) => ({ text: c.w(online
              ? "畢業專題沒人會的部分，你乾脆自己學，{每天上網看教學影片，|跑去別的實驗室請教學長姊，}{把那門技術練成了你的強項。|後來面試時，主管對這段經驗特別有興趣。}"
              : "畢業專題沒人會的部分，你乾脆自己學，{跑去圖書館借了一堆書，|跑去別的實驗室請教學長姊，}{把那門技術練成了你的強項。|後來面試時，主管對這段經驗特別有興趣。}"), mood: 2 }),
          },
          {
            id: "y_capstone.restart", label: "換題目重做", hint: "風險大，時間很趕", act: "careerSwitch", style: "risk", weight: 0.15,
            apply: (s2, c) => (c.roll("study", "good", 0.5)
              ? { text: c.w("畢業專題做不下去，你們乾脆{換了一個題目，|砍掉重練，}{最後兩個月每天待在系館，|拚到展覽前一晚才完成，}成果反而比原本好。"), mood: 3 }
              : { text: c.w("畢業專題做不下去，你們{換了一個題目，|砍掉重練，}{時間太趕，|最後一週天天熬夜，}只勉強過關。"), mood: -1 }),
          },
        ],
      };
    },
  },
  {
    // 延畢：只把 core.js 的畢業往後延一年（canDelay 保證還趕得上畢業的年齡）。
    id: "y_delay", once: true, domain: "study", channel: "bad", ages: [20, 25], when: s => undergrad(s) && uniYear(s) === 4 && canDelay(s), p: () => 0.1,
    choice: (s, ctx) => {
      const who = parentsWord(s);
      const late = s2 => { s2.flags.uniAt += 1; };
      return {
        prompt: ctx.w(["大四下學期，你發現{還差一門必修沒過|畢業學分還差六學分|有一門必修已經被當了兩次}。要怎麼辦？", "大四了，{必修的{微積分|統計|會計}又被當，|你一直擋修的那門課還沒過，}同學都在準備畢業典禮了。要怎麼辦？"]),
        options: [
          {
            id: "y_delay.summer", label: "暑修補學分，準時畢業", hint: "拚一個暑假", act: "study", style: "safe", weight: 0.35,
            apply: (s2, c) => {
              if (c.roll("study", "good", 0.75)) return { text: c.w("大四的學分不夠，你去暑修，{上了一整個暑假的課，|每天一早就到學校，}{總算把學分補齊，|低空飛過，}準時畢業。"), mood: 2 };
              late(s2);
              return { text: "大四的學分不夠，你去暑修還是沒過，只好延畢一年。", mood: -4 };
            },
          },
          {
            id: "y_delay.master", label: "延畢一年，準備研究所", hint: "多一年時間", act: "study", style: "learn", weight: 0.15,
            apply: (s2, c) => { late(s2); return { text: c.w("大四的課修不完，你決定延畢一年，{把沒修完的課修完，順便準備研究所考試。|修了好幾門一直想上的課。}"), mood: 0 }; },
          },
          {
            id: "y_delay.work", label: "延畢一年，去實習打工", hint: "累積經驗", act: "sideJob", style: "risk", weight: 0.15,
            apply: (s2, c) => { late(s2); s2.savings += 0.05; return { text: c.w("大四的學分不夠，你決定延畢一年，{邊修最後幾個學分邊去公司實習，|白天上課、晚上打工，}{畢業時履歷上多了一段工作經驗。|存下了出社會的第一筆錢。}"), mood: 1 }; },
          },
          {
            id: "y_delay.professor", label: "去找教授商量", hint: "說不定有轉機", act: "negotiate", style: "social", weight: 0.15,
            apply: (s2, c) => (c.roll("study", "good", 0.5)
              ? { text: c.w("大四差一門課，你去找教授商量，教授讓你{補交報告|重考一次}，你總算過了，順利畢業。"), mood: 3 }
              : { text: "大四差一門課，你去找教授商量，教授說規定就是規定。你乖乖去暑修，總算趕上了畢業。", mood: -1 }),
          },
          {
            id: "y_delay.family", label: ctx.f("跟{who}說想延畢", { who }), hint: "多讀一年要花錢", act: "talk", style: "family", weight: 0.1, when: s2 => parentsAlive(s2),
            apply: (s2, c) => { late(s2); return { text: c.w("大四的學分不夠，你想延畢一年，鼓起勇氣跟{who}說了。{who}{嘆了一口氣，還是說：「多讀一年也好，想清楚就好。」|問你學費怎麼辦，你說會自己打工付。}", { who }), mood: 0 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_lab", once: true, domain: "study", channel: "bad", ages: [22, 30], when: s => s.studying && s.track === "碩士" && !s.abroad, p: () => 0.35,
    choice: (s, ctx) => {
      const arts = isArts(s), room = arts ? "研究室" : "實驗室";
      return {
        prompt: ctx.w(arts
          ? ["研究所的論文{卡關了好幾個月|題目一直定不下來|資料一直整理不出頭緒}，指導教授{每週都要你報告進度|說再這樣下去就要延畢}。要怎麼辦？", "{研究室的學長姊都畢業了|教授忙著跑計畫，很少有空見你}，你的論文進度幾乎停住了。要怎麼辦？"]
          : ["研究所的論文{卡關了好幾個月|題目一直定不下來|實驗一直做不出結果}，指導教授{每週都要你報告進度|說再這樣下去就要延畢}。要怎麼辦？", "{實驗室的學長姊都畢業了|教授忙著跑計畫，很少有空見你}，你的論文進度幾乎停住了。要怎麼辦？"]),
        options: [
          {
            id: "y_lab.grind", label: ctx.f("每天待在{room}拚", { room }), hint: "用時間換進度", act: "pushThrough", style: "risk", weight: 0.3,
            apply: (s2, c) => { stress(s2, 0.08); return { text: c.w(arts ? "論文卡關，你每天待在研究室到半夜，{終於在口試前把資料整理完。|讀完了一整櫃的文獻，週末也不例外。}" : "論文卡關，你每天待在實驗室到半夜，{終於在口試前把結果跑出來。|跟學弟妹輪流顧機器，週末也不例外。}"), mood: -1 }; },
          },
          {
            id: "y_lab.talk", label: "跟教授好好談", hint: "調整方向", act: "talk", style: "safe", weight: 0.2,
            apply: (s2, c) => ({ text: c.w("論文卡關，你找教授好好談了一次，{教授幫你把題目縮小，進度一下子順了。|原來教授也很擔心你，你們重新排了時程。}"), mood: 2 }),
          },
          {
            id: "y_lab.senior", label: "請學長姊幫忙", hint: "有經驗的人一點就通", act: "seekHelp", style: "social", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("論文卡關，你請已經畢業的{學長|學姊}幫忙看，{一個晚上就找到問題出在哪裡。|對方把以前的筆記都借給你。}"), mood: 2 }),
          },
          {
            id: "y_lab.assistant", label: "兼研究助理賺生活費", hint: "有收入比較安心", act: "sideJob", style: "self", weight: 0.2,
            apply: (s2, c) => { s2.savings += 0.04; return { text: c.w("論文卡關，你接了教授研究計畫的助理工作，{白天跑計畫、晚上寫論文，|有了收入比較安心，}{論文慢慢有了進度。|雖然累，但不用再跟家裡拿錢。}"), mood: 1 }; },
          },
          {
            id: "y_lab.rest", label: "先休息一陣子", hint: "換個角度再看", act: "rest", style: "health", weight: 0.15,
            apply: (s2, c) => { stress(s2, -0.1); return { text: c.w("論文卡關，你{回家休息了兩個禮拜，|去爬了一趟山，}{回來後腦袋清楚多了，|換個角度再看，}問題一下子就解開了。"), mood: 3 }; },
          },
        ],
      };
    },
  },
  {
    // 就學貸款，畢業滿一年開始還。畢業那一年已經有 core.js 的畢業抉擇（一年只問一個日常抉擇），所以在畢業後一、兩年問。
    id: "y_loan", once: true, domain: "wealth", channel: "bad", ages: [21, 30],
    when: s => s.year >= 2000 && !s.studying && !s.abroad && (sinceGrad(s) === 1 || sinceGrad(s) === 2), p: () => 0.25,
    choice: (s, ctx) => {
      const owe = ctx.rng.pick(["二十幾", "三十幾", "四十幾"]), who = parentsWord(s), job = s.employed;
      const loan = s2 => { s2.debt += 0.15; };
      const years = s.edu === "碩士" ? "大學加研究所" : "大學四年";
      const sc = sceneOf(s, ctx, "y_loan", [
        { key: "bill", prompt: sinceGrad(s) === 1 ? "畢業滿一年，就學貸款的第一張繳款通知寄來了，{years}加起來一共欠了{owe}萬。要怎麼還？" : "畢業兩年了，就學貸款的繳款通知寄來了，{years}加起來一共欠了{owe}萬。要怎麼還？" },
        job && { key: "payday", prompt: s.home === "rent" ? "領到薪水，你算了算：扣掉房租和生活費，每個月還要繳一筆就學貸款，{years}加起來一共欠了{owe}萬。要怎麼還？" : "領到薪水，你算了算：扣掉生活費，每個月還要繳一筆就學貸款，{years}加起來一共欠了{owe}萬。要怎麼還？" },
        { key: "friends", prompt: "同學聚會時大家聊起學貸，有人已經還完了，你算了算，自己還欠{owe}萬。要怎麼還？" },
      ]);
      return {
        prompt: ctx.f(sc.prompt, { years, owe }),
        options: [
          {
            id: "y_loan.plan", label: "照規定分期慢慢還", hint: "每個月固定繳", act: "save", style: "safe", weight: 0.35,
            apply: (s2, c) => { loan(s2); return { text: c.w("就學貸款欠了{owe}萬，你決定分{八|十}年慢慢還，{設了自動扣款，|把它寫在記帳本的第一行，}當成每個月的固定開銷。", { owe }), mood: -1 }; },
          },
          {
            id: "y_loan.fast", label: "省吃儉用，兩年還清", hint: "早點無債一身輕", act: "save", style: "risk", weight: 0.15,
            apply: (s2, c) => { loan(s2); frugal(s2, 2); return { text: c.w("就學貸款欠了{owe}萬，你決定兩年內還清，{天天帶便當、不買新衣服，|下班後再去兼差，}{最後一筆繳完那天，你去吃了一頓燒肉慶祝。|還清那天，你把收據拍照傳給家人。}", { owe }), mood: 1 }; },
          },
          {
            id: "y_loan.parents", label: ctx.f("{who}說要幫忙還", { who }), hint: "心裡過意不去", act: "borrow", style: "family", weight: 0.15, when: s2 => parentsAlive(s2),
            apply: (s2, c) => ({ text: c.w("就學貸款欠了{owe}萬，{who}說要幫你先還掉。你{堅持每個月拿一點錢回家，|心裡過意不去，}{當作是慢慢還給家裡。|默默記下了這份恩情。}", { owe, who }), mood: 1 }),
          },
          {
            id: "y_loan.defer", label: "先申請緩繳", hint: job ? "等薪水穩定再說" : "等找到工作再說", act: "wait", style: "self", weight: 0.15,
            apply: (s2, c) => { loan(s2); return { text: c.w(job ? "就學貸款欠了{owe}萬，剛出社會薪水不高，你先申請{緩繳|只繳利息}，{等工作穩定再開始還。|讓自己先喘一口氣。}" : "就學貸款欠了{owe}萬，還沒找到穩定的工作，你先申請{緩繳|只繳利息}，{等找到工作再開始還。|讓自己先喘一口氣。}", { owe }), mood: 0 }; },
          },
          {
            id: "y_loan.side", label: "兼差加快還款", hint: "多賺一點，比較累", act: "sideJob", style: "risk", weight: 0.15,
            apply: (s2, c) => { loan(s2); s2.savings += 0.05; stress(s2, 0.05); return { text: c.w(job ? "就學貸款欠了{owe}萬，你下班後{接案|兼家教|去餐廳打工}，{多賺的錢全部拿去還學貸。|一年就還掉了一半。}" : "就學貸款欠了{owe}萬，你{接案|兼家教|去餐廳打工}，{多賺的錢全部拿去還學貸。|一年就還掉了一半。}", { owe }), mood: -1 }; },
          },
        ],
      };
    },
  },

  // ---------- military ----------
  {
    // Color for the year core.js sent you to the army (s.last.military is this year).
    id: "y_draft", once: true, ages: [18, 27], when: s => s.sex === "male" && s.last.military === s.age && !s.abroad, p: () => 0.6,
    apply: (s, ctx) => {
      const months = ctx.R.military(s.birthYear, s.year).months, y = s.year, who = parentsWord(s);
      const t = [
        "新訓中心的第一個晚上，{整間寢室沒有人睡得著，|班長在走廊來回走，}{你盯著上鋪的床板想家。|你才知道什麼叫三分鐘洗好澡。}",
        y >= 1984
          ? "{第一次放假，|每次放假，}你{第一件事就是回家睡到中午。|跟同梯直奔{麥當勞|雞排攤|牛肉麵店}。|摸著剃短的頭髮，覺得鏡子裡的人好陌生。}"
          : "{第一次放假，|每次放假，}你{第一件事就是回家睡到中午。|跟同梯直奔{牛肉麵店|滷肉飯攤|冰果室}。|摸著剃短的頭髮，覺得鏡子裡的人好陌生。}",
      ];
      if (months >= 18) t.push("抽籤那天抽到{金門|馬祖}，大家笑你抽到「金馬獎」。{你坐了一整夜的船才到。|好幾個月才能回台灣放一次假。}");
      else if (months <= 4) t.push("四個月的軍事訓練一下就過去了，{你學會了打綁腿、摺棉被。|結訓那天，你和同梯在營區門口拍了一張合照。}");
      else t.push("一年的役期裡，{你在營區站了好多個夜哨，|你跟同梯變成很好的朋友，}{退伍那天，大家在營區門口互相丟帽子。|退伍後，大家還常常約出來吃飯。}");
      if (dating(s)) t.push("當兵的那段日子，{partner}每個{週末|假日}都來會客，{帶著{滷味|水果|自己做的便當}。|你們隔著會客室的桌子說了好多話。}");
      if (parentsAlive(s)) t.push("{懇親會那天，|休假回家時，}{who}{帶了一大袋吃的來看你，|一直說你曬黑了、變瘦了，}{你嘴上說沒什麼，心裡很暖。|你第一次發現{who}的頭髮白了不少。}");
      return { text: ctx.w(t, { who }), mood: 1 };
    },
  },

  // ---------- work ----------
  {
    id: "y_firstWeek", once: true, domain: "career", channel: "change", ages: [15, 30],
    when: s => employee(s) && (s.jobsHeld || []).length <= 1 && (s.job.since ?? s.age) >= s.age - 1, p: () => 0.15,
    choice: (s, ctx) => {
      const y = s.year, boss = bossOf(s), bank = y >= 1997 ? "人力銀行" : "報紙的求才廣告";
      return {
        prompt: ctx.w(["當{job}的第一個月，{前輩丟給你一堆事情就去忙了，|{boss}講話很快，交代的事你只聽懂一半，|工作內容跟面試時說的不太一樣，}{你每天下班都覺得腦袋被掏空。|你常常躲在廁所偷偷查資料。}要怎麼辦？", "第一份工作做了幾個禮拜，{你還是常常出錯，被{boss}念了好幾次。|同事都很忙，沒有人有空教你。|你每天都留到很晚，事情卻還是做不完。}{你開始懷疑自己是不是不適合。|星期天晚上一想到要上班就睡不著。}要怎麼辦？"], { boss }),
        options: [
          {
            id: "y_firstWeek.ask", label: "每天提早到，主動問前輩", hint: "臉皮厚一點", act: "seekHelp", style: "social", weight: 0.3,
            apply: (s2, c) => ({ text: c.w("當{job}的第一個月，你每天提早半小時到，{把不懂的事寫在小本子上，一個一個去問。|買了飲料請前輩，前輩看你認真，開始願意教你。}{三個月後，大部分的事你都能自己處理了。|試用期結束，{boss}說你進步很快。}", { boss }), mood: 3 }),
          },
          {
            id: "y_firstWeek.learn", label: "下班後自己補能力", hint: "學校沒教的自己學", act: "study", style: "learn", weight: 0.2,
            apply: (s2, c) => { stress(s2, 0.03); return { text: c.w(y >= 2008 ? "當{job}的第一個月，很多東西學校沒教，你下班後{上網找教學自己練，|去上了幾堂課，}{慢慢跟上了大家的進度。|連週末都在練習。}" : "當{job}的第一個月，很多東西學校沒教，你下班後{去補習班上課，|買了幾本書回家讀，}{慢慢跟上了大家的進度。|連週末都在練習。}"), mood: 1 }; },
          },
          {
            id: "y_firstWeek.endure", label: "默默撐過試用期", hint: "先別想太多", act: "pushThrough", style: "safe", weight: 0.2,
            apply: (s2, c) => { stress(s2, 0.05); return { text: c.w("當{job}的第一個月，你什麼都不敢多說，{默默把交代的事做完，|每天最後一個離開，}{總算撐過了三個月的試用期。|領到第一份全薪時，你鬆了一口氣。}"), mood: 0 }; },
          },
          {
            id: "y_firstWeek.boss", label: ctx.f("跟{boss}說需要有人帶", { boss }), hint: "說出自己的需要", act: "negotiate", style: "self", weight: 0.1,
            apply: (s2, c) => (c.roll("career", "good", 0.55)
              ? { text: c.w("當{job}的第一個月，你跟{boss}說需要有人帶，{boss}安排了一位{學長|學姊|資深同事}帶你，你很快就上手了。", { boss }), mood: 3 }
              : { text: c.f("剛開始工作，你跟{boss}說需要有人帶，{boss}說「大家都是這樣過來的」，你只好自己摸索。", { boss }), mood: -2 }),
          },
          {
            id: "y_firstWeek.hunt", label: "騎驢找馬，邊做邊投履歷", hint: "先做著再說", act: "jobSearch", style: "risk", weight: 0.15,
            apply: (s2, c) => { s2.flags.hunting = s2.age; return { text: c.w("當{job}的第一個月，你覺得這份工作不適合自己，{晚上回家就打開{bank}，|開始偷偷投履歷，}{先做著，等找到更好的再說。|告訴自己至少要待滿一年。}", { bank }), mood: -1 }; },
          },
          {
            id: "y_firstWeek.quit", label: "直接離職", hint: "不適合就早點走", act: "quitJob", style: "self", weight: 0.03,
            apply: (s2, c) => { s2.employed = false; s2.unemployedFor = 1; return { text: c.w("當{job}的第一個月，你越做越覺得不對，{撐到月底就遞了辭呈。|第二個月就離職了。}{家人唸了你好幾天，|朋友說你太衝動，}但你覺得早點離開比較好。"), mood: -2 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_boss", domain: "career", channel: "bad", ages: [20, 30], cooldown: 4, max: 2, when: s => employee(s), p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year, office = officeJob(s), boss = bossOf(s);
      const late = y >= 2011 ? "半夜十一點還在 LINE 上交代工作" : y >= 1997 ? "下班後還一直打手機交代工作" : "總是在下班前五分鐘交代明天要的東西";
      const proof = office && y >= 1998 ? "把每一次交辦都寫成 email 留下紀錄" : "把每一次交辦都記在筆記本上";
      const ask = office && y >= 2010 ? "請以前的同學幫忙內推" : "請以前的同事幫忙介紹";
      const place = placeOf(s);
      // [label, hint, what you did]. The usual ways to endure, ask for a transfer, look for work or quit are choices of
      // their own ({甲|乙}), so they have templates of their own below.
      const base = {
        endure: ["忍下來，做好自己的事", "不想把事情鬧大", null],
        talk: [ctx.f("找{boss}私下談", { boss }), "也許是誤會", ctx.f("約了{boss}私下談", { boss })],
        escalate: ["越級向上反映", "有風險", "向更上層的主管反映"],
        transfer: [office ? "申請調部門" : "申請換分店或換班", "換個環境", null],
        leave: ["開始找下一份工作", "此處不留人", null],
        quit: ["直接離職", "先離開再說", null],
      };
      // How the boss makes your days hard: in front of everyone, by redoing everything, by the rota, by blaming you, or
      // only you. A second time it is a different one.
      const sc = sceneOf(s, ctx, "y_boss", [
        { key: "public", lead: ctx.f("{boss}常常當眾挑你的錯，", { boss }),
          prompt: office
            ? "{boss}常常在會議上當眾挑你的錯，{連標點符號都不放過。|同事都不敢看你。}你已經{好幾個晚上睡不好|開始害怕星期一}。要怎麼辦？"
            : "{boss}常常當著{客人|大家}的面罵你，{一點小錯就唸個不停。|同事都不敢看你。}你已經{好幾個晚上睡不好|開始害怕上班}。要怎麼辦？" },
        office && { key: "redo", lead: ctx.f("{boss}交代的事一直改來改去，", { boss }),
          prompt: "{boss}交代的事一天到晚改來改去，你的一份{報告|企劃}已經重寫了{五|六}次，{改到最後又改回第一版。|{boss}還是說感覺不對。}要怎麼辦？",
          o: {
            endure: ["照改，每次都留下紀錄", "不想把事情鬧大", ctx.f("照著改，{proof}", { proof })],
            talk: [ctx.f("找{boss}問清楚到底要什麼", { boss }), "也許是誤會", ctx.f("約了{boss}，把需求一條一條問清楚", { boss })],
            escalate: ["把修改紀錄拿給更上層看", "有風險", "把修改紀錄整理好，拿給更上層的主管看"],
          } },
        office && y >= 1997 && { key: "late", lead: ctx.f("{boss}下班後還一直交代工作，", { boss }),
          prompt: "{boss}{late}，{隔天一早就要看到東西。|你已經不敢不帶手機進浴室。}要怎麼辦？",
          o: {
            endure: ["忍下來，隨傳隨到", "不想把事情鬧大", "決定忍下來，隨傳隨到"],
            talk: [ctx.f("找{boss}談下班後的聯絡", { boss }), "也許是誤會", ctx.f("找{boss}私下談，請{boss}有事盡量在上班時交代", { boss })],
          } },
        !office && { key: "rota", lead: ctx.f("{boss}在排班上處處刁難你，", { boss }),
          prompt: "{boss}排班總是把最累的{時段|夜班|週末}丟給你，{休假也總是排不到。|別人換班都可以，只有你不行。}要怎麼辦？",
          o: {
            endure: ["忍下來，照著班表上", "不想把事情鬧大", "決定忍下來，照著班表一天一天上"],
            talk: [ctx.f("找{boss}私下談班表", { boss }), "也許是誤會", ctx.f("約了{boss}私下談班表", { boss })],
            escalate: [ctx.f("向{boss}的上司反映", { boss }), "有風險", ctx.f("把這幾個月的班表整理好，向{boss}的上司反映", { boss })],
          } },
        { key: "blame", lead: ctx.f("{boss}把錯都推到你身上，", { boss }),
          prompt: "有一次出了包，{boss}當著大家的面把錯都算在你頭上，{可是那件事明明是照{boss}的意思做的。|你連解釋的機會都沒有。}要怎麼辦？",
          o: {
            endure: ["吞下來，以後凡事留紀錄", "不想把事情鬧大", ctx.f("把這口氣吞了下來，從此{proof}", { proof })],
            talk: [ctx.f("找{boss}私下把話說清楚", { boss }), "也許是誤會", ctx.f("約了{boss}，私下把那件事說清楚", { boss })],
            escalate: ["把經過寫下來向上反映", "有風險", "把事情的經過寫下來，向更上層反映"],
          } },
        { key: "strict", lead: ctx.f("{boss}只對你特別嚴格，", { boss }),
          prompt: "{boss}只對你特別嚴格，{一點小錯就記你一筆，|休假總是排不到，}同事都看在眼裡。要怎麼辦？" },
      ]);
      const B = buttonsOf(base, sc), lead = sc.lead, did = k => ({ lead, did: B[k][2], boss, place });
      return {
        prompt: ctx.w(sc.prompt, { boss, late }),
        options: [
          {
            id: "y_boss.endure", label: B.endure[0], hint: B.endure[1], act: "pushThrough", style: "safe", weight: 0.25,
            apply: (s2, c) => { stress(s2, 0.08); return { text: B.endure[2] ? c.w("{lead}你{did}，{一年後{boss}調走了。|日子雖然不開心，倒也學到了不少。}", did("endure")) : c.w("{lead}你決定忍下來，{{proof}|把該做的事做到讓人挑不出毛病}，{一年後{boss}調走了。|日子雖然不開心，倒也學到了不少。}", { lead, proof, boss }), mood: -2 }; },
          },
          {
            id: "y_boss.talk", label: B.talk[0], hint: B.talk[1], act: "talk", style: "social", weight: 0.25,
            apply: (s2, c) => (c.roll("career", "good", 0.5)
              ? { text: c.w("{lead}你{did}，{原來對方也被上面壓得很緊。|講開之後，對方的態度軟化了不少。}{之後交代事情清楚多了。|你們找到了比較好的合作方式。}", did("talk")), mood: 3 }
              : { text: c.w("{lead}你{did}，對方{笑笑說你想太多，|聽完只說會注意，}{之後一切照舊。|反而更常挑你的錯。}", did("talk")), mood: -3 }),
          },
          {
            id: "y_boss.escalate", label: B.escalate[0], hint: B.escalate[1], act: "dispute", style: "risk", weight: 0.1,
            apply: (s2, c) => (c.roll("career", "good", 0.4)
              ? { text: c.w("{lead}你{did}，{公司找你們談過之後，{boss}收斂了很多。|後來{boss}被調走了。}", did("escalate")), mood: 3 }
              : { text: c.w("{lead}你{did}，{上面說會處理，之後就沒有下文，|事情傳回了{boss}耳裡，}{你的日子更難過了。|你被冷凍了好幾個月。}", did("escalate")), mood: -5 }),
          },
          {
            id: "y_boss.transfer", label: B.transfer[0], hint: B.transfer[1], act: "negotiate", style: "learn", weight: 0.15,
            apply: (s2, c) => (c.roll("career", "good", 0.5)
              ? { text: c.w(office ? "{lead}你申請調到{別的部門|另一個專案}，{新的主管很照顧人，|換了環境，}你又找回了上班的動力。" : "{lead}你申請調到{別的分店|另一個班}，{新的主管很照顧人，|換了環境，}你又找回了上班的動力。", { lead }), mood: 3 }
              : { text: c.w(office ? "{lead}你申請調到{別的部門|另一個專案}，公司說目前沒有缺，你只好先撐著。" : "{lead}你申請調到{別的分店|另一個班}，公司說目前沒有缺，你只好先撐著。", { lead }), mood: -2 }),
          },
          {
            id: "y_boss.leave", label: B.leave[0], hint: B.leave[1], act: "jobHop", style: "risk", weight: 0.17,
            apply: (s2, c) => { s2.income *= c.rng.between(0.93, 1.08); stress(s2, -0.1); return { text: c.w("{lead}你{默默開始找工作|{ask}}，{兩個月後換到另一家{place}，一樣當{job}。|找到新工作才遞辭呈，走得乾乾淨淨。}", { lead, ask, place }), mood: 2 }; },
          },
          {
            id: "y_boss.quit", label: B.quit[0], hint: B.quit[1], act: "quitJob", style: "self", weight: 0.04,
            apply: (s2, c) => { s2.employed = false; s2.unemployedFor = 1; stress(s2, -0.15); return { text: c.w("{lead}你{受不了了|想了一個晚上}，隔天就遞了辭呈，{走出{place}的那一刻，你覺得肩膀輕了。|家人問你接下來怎麼辦，你說先休息一下。}", { lead, place }), mood: 0 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_overtime", domain: "career", channel: "bad", ages: [20, 30], cooldown: 4, max: 2, when: s => employee(s), p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year, office = officeJob(s), boss = bossOf(s), site = siteOf(s), place = placeOf(s);
      const sport = ctx.rng.pick(["跑步", "游泳", "打羽球", y >= 2000 ? "上健身房" : "打籃球"]);
      const supper = y >= 1995 ? "便利商店的微波便當" : "路邊攤的便當";
      const rush = ctx.rng.pick(office ? [y >= 1995 ? "專案上線前" : "趕一個大案子的時候", "年底結帳的時候", "旺季一到"] : ["旺季一到", "訂單一多", "過年前"]);
      // [label, hint, what you did]. The usual smarter way of working is a choice of its own ({甲|乙}), so it has
      // templates of its own below.
      const base = {
        stay: ["跟著大家加班", "大家都這樣", "跟著大家留下來"],
        leave: ["準時下班，事情做完就走", "可能被說不合群", "堅持事情做完就準時下班"],
        smart: [office ? "提升效率，把重複的事自動化" : "改進做事的方法", "用方法換時間", null],
        negotiate: [ctx.f("跟{boss}談工作量", { boss }), "把手上的事攤開來談", ctx.f("整理好手上的工作清單去找{boss}談", { boss })],
        exercise: ["下班後去運動抒壓", "顧好身體", ctx.f("規定自己每週{sport}三次", { sport })],
        hop: [office ? "換一家不加班的公司" : "換一個不用天天加班的地方", "薪水可能少一點", "決定換個環境"],
      };
      // Why the evenings are gone: the office's habits, a busy season, a colleague's work left to you, a client who keeps
      // changing things, or a rota with no days off. A second time it is a different one.
      const sc = sceneOf(s, ctx, "y_overtime", [
        office && { key: "culture", lead: "公司天天加班，",
          prompt: "{公司裡|部門裡}{habit}，你已經{好幾個禮拜|一個多月}沒在八點前下班了。要怎麼辦？", habit: ctx.rng.pick(["主管沒走就沒人敢走", "說好的責任制，加班從來沒有加班費", "晚上九點還燈火通明"]) },
        { key: "rush", lead: ctx.f("{rush}天天加班，", { rush }),
          prompt: "{rush}，{where}天天加班到{十點|半夜}，{週末也常常被叫回去。|你的晚餐都是{supper}。}要怎麼辦？",
          o: {
            stay: ["跟著大家拚過這一波", "忙完就好了", "跟著大家一起拚"],
            leave: ["自己的份做完就走", "可能被說不合群", "把自己的份做完就準時下班"],
            negotiate: [ctx.f("請{boss}調整人力", { boss }), "把手上的事攤開來談", ctx.f("去找{boss}，請{boss}調整人力", { boss })],
            hop: [office ? "忙完這一波就換工作" : "旺季過後就換個地方", "薪水可能少一點", "決定忙完這一波就換個環境"],
          } },
        { key: "leftover", lead: "同事離職以後，兩個人的工作都落在你身上，",
          prompt: office
            ? "{坐你隔壁|跟你同組}的同事離職了，{they}的工作全落到你身上，{boss}說先頂一下，一頂就是三個月。要怎麼辦？"
            : "{跟你同一班|跟你搭檔}的同事離職了，{they}的工作全落到你身上，{boss}說先頂一下，一頂就是三個月。要怎麼辦？", they: ctx.rng.pick(["他", "她"]),
          o: {
            stay: ["先扛下來", "給公司一點時間", "先扛了下來，天天加班"],
            leave: ["做不完的留到明天", "可能被說不合群", "做不完的就留到明天，照樣準時下班"],
            smart: ["把交接的事整理成流程", "用方法換時間", "把交接下來的工作整理成一套流程"],
            negotiate: [ctx.f("請{boss}趕快補人", { boss }), "把手上的事攤開來談", ctx.f("把兩個人的工作清單拿給{boss}看，請{boss}補人", { boss })],
            hop: ["也開始找下一份工作", "此處不留人", "也開始找下一份工作"],
          } },
        office && ["設計", "行銷", "業務", "科技", "媒體", "法律"].includes(s.job.field) && { key: "client", lead: "客戶一直臨時改需求，",
          prompt: "客戶{星期五下午才丟來新的需求，星期一一早就要|改了第七版，又說想回到第一版}，整個團隊{又要熬夜了。|連週末都在公司。}要怎麼辦？",
          o: {
            stay: ["陪團隊一起熬夜趕", "大家都這樣", "陪著團隊一起熬夜趕"],
            leave: ["跟客戶說清楚時程，到點就走", "可能被說不合群", "跟客戶說清楚時程，到點就下班"],
            negotiate: [ctx.f("請{boss}跟客戶談清楚範圍", { boss }), "把手上的事攤開來談", ctx.f("請{boss}出面跟客戶把範圍談清楚", { boss })],
          } },
        !office && { key: "shifts", lead: "連續排班、休假一直被取消，",
          prompt: "{site}人手一直補不齊，你已經連續上了{十|十二}天的班，休假一直被取消。要怎麼辦？",
          o: {
            stay: ["答應代班，多賺加班費", "大家都這樣", "答應繼續代班"],
            leave: ["堅持排休，不再代班", "可能被說不合群", "堅持該休的假一定要休"],
            negotiate: [ctx.f("跟{boss}談班表", { boss }), "把手上的事攤開來談", ctx.f("拿著班表去找{boss}談", { boss })],
            exercise: ["休假那天一定去運動", "顧好身體", ctx.f("規定自己休假那天一定去{sport}", { sport })],
          } },
      ]);
      const B = buttonsOf(base, sc), lead = sc.lead, did = k => ({ lead, did: B[k][2], boss, place });
      return {
        prompt: ctx.w(sc.prompt, { habit: sc.habit, rush, where: office ? "部門" : site, supper, they: sc.they, boss, site }),
        options: [
          {
            id: "y_overtime.stay", label: B.stay[0], hint: B.stay[1], act: "pushThrough", style: "risk", weight: 0.3,
            apply: (s2, c) => { s2.health.hr *= 1.02; stress(s2, 0.08); return { text: c.w("{lead}你{did}，{能力進步得很快，但常常累到在回家的車上睡著。|一年下來胖了五公斤，假日只想睡覺。|{boss}看在眼裡，說你是值得栽培的人。}", did("stay")), mood: -2 }; },
          },
          {
            id: "y_overtime.leave", label: B.leave[0], hint: B.leave[1], act: "rest", style: "self", weight: 0.2,
            apply: (s2, c) => {
              s2.health.hr *= 0.99;
              return c.roll("career", "bad", 0.4)
                ? { text: c.w("{lead}你{did}，{被說不合群，年度考核被打了 B。|{boss}雖然沒說什麼，臉色卻不太好看。}", did("leave")), mood: -1 }
                : { text: c.w("{lead}你{did}，{同事一開始覺得你怪，後來也跟著學。|{boss}發現你效率很好，也就不多說了。}", did("leave")), mood: 3 };
            },
          },
          {
            id: "y_overtime.smart", label: B.smart[0], hint: B.smart[1], act: "study", style: "learn", weight: 0.15,
            apply: (s2, c) => ({ text: B.smart[2]
              ? c.w(office ? "{lead}你{did}，{原本要做三小時的事，現在半小時就做完。|你終於可以準時下班了。}" : "{lead}你{did}，{原本要做三小時的事，現在兩小時就做完。|大家都跟著學，加班少了很多。}", did("smart"))
              : c.w(!office ? "{lead}你把{工具|材料}和流程重新安排了一遍，{原本要做三小時的事，現在兩小時就做完。|大家都跟著學，加班少了很多。}"
                : y >= 2000 ? "{lead}你下班後{學了 Excel 巨集|自學寫程式|研究了新的軟體}，把每天重複的工作{變成範本|自動化}，{原本要做三小時的事，現在半小時就做完。|你終於可以準時下班了。}"
                  : "{lead}你{重新整理了一套表格|把流程寫成一本手冊}，把每天重複的工作簡化，{原本要做三小時的事，現在半小時就做完。|你終於可以準時下班了。}", { lead }), mood: 3 }),
          },
          {
            id: "y_overtime.negotiate", label: B.negotiate[0], hint: B.negotiate[1], act: "negotiate", style: "social", weight: 0.15,
            apply: (s2, c) => (c.roll("career", "good", 0.45)
              ? { text: c.w("{lead}你{did}，{{boss}把一部分工作分給了新人。|{boss}答應再補一個人。}", did("negotiate")), mood: 3 }
              : { text: c.w("{lead}你{did}，{boss}說「大家都很忙」，事情還是一樣多。", did("negotiate")), mood: -2 }),
          },
          {
            id: "y_overtime.exercise", label: B.exercise[0], hint: B.exercise[1], act: "exercise", style: "health", weight: 0.1,
            apply: (s2, c) => { s2.health.hr *= 0.98; s2.health.fitness = clamp(s2.health.fitness + 0.05); stress(s2, -0.05); return { text: c.w("{lead}你{did}，{雖然還是很忙，但睡得比較好了。|身體反而比剛開始工作時還好。}", did("exercise")), mood: 2 }; },
          },
          {
            id: "y_overtime.hop", label: B.hop[0], hint: B.hop[1], act: "jobHop", style: "risk", weight: 0.05,
            apply: (s2, c) => { s2.income *= c.rng.between(0.92, 1.05); stress(s2, -0.1); return { text: c.w("{lead}你{did}，{三個月後換到一家準時下班的{place}，|找到一家薪水少一點、但不用加班的{place}，}{一樣當{job}，|終於有了晚上的生活，}{你覺得少一點錢也值得。|下班後還能去上課、運動。}", did("hop")), mood: 2 }; },
          },
        ],
      };
    },
  },
  {
    // 打工或小店小公司拖欠薪水、亂扣錢。錢都不多，有拿回來的，也有拿不回來的。
    id: "y_wageOwed", once: true, domain: "wealth", channel: "bad", ages: [18, 28],
    when: s => s.year >= 1970 && !s.abroad && (partTimer(s) || smallShop(s)),
    p: s => (partTimer(s) ? (s.done.has("y_parttime") ? 0.07 : 0.03) : 0.035),
    choice: (s, ctx) => {
      const y = s.year, student = partTimer(s), mates = student ? "工讀生" : "同事";
      const shop = ctx.rng.pick(["小吃店", "早餐店", "書店", ...(y >= 1990 ? ["飲料店"] : []), ...(y >= 1985 ? ["補習班"] : []), ...(y >= 1998 && y < 2012 ? ["網咖"] : [])]);
      const firm = student ? "店裡" : { 製造: "工廠", 營造: "包商", 運輸: "貨運行" }[s.job.field] || (SHOP.includes(s.job.title) ? "店裡" : "公司");
      const gone = student ? "把店收了" : "連人都找不到了";
      const cut = ctx.rng.pick([y >= 1990 ? "說試用期只能給一半的時薪" : "說新人的工錢只能給一半", ["小吃店", "早餐店", "飲料店"].includes(shop) ? "說你打破了一個杯子，要扣一天的薪水" : "說你結帳時算錯了錢，要從薪水裡扣", "在月底算錢時，少算了你好幾個小時"]);
      // Paid late, docked, overtime never counted, or a month's pay held back.
      const sc = sceneOf(s, ctx, "y_wageOwed", [
        student && { key: "late", lead: ctx.f("打工的{shop}一直拖欠薪水，", { shop }),
          prompt: "打工的{shop}老闆說最近生意不好，你的薪水已經{拖了兩個月|一延再延}，{每次問都說下禮拜。|上個月的錢到現在還沒拿到。}要怎麼辦？" },
        student && { key: "cut", lead: ctx.f("{shop}老闆亂扣你的薪水，", { shop }), prompt: "打工的{shop}老闆{cut}。要怎麼辦？" },
        !student && { key: "unpaid", lead: "薪水一直沒發，",
          prompt: "{firm}周轉不靈，這個月的薪水晚了兩個禮拜還沒發，老闆只說再等等。要怎麼辦？" },
        !student && { key: "overtime", lead: "加班費一直沒算，",
          prompt: "連續好幾個月都在加班，薪水單上卻一毛加班費都沒有，老闆說大家都這樣。要怎麼辦？" },
        !student && { key: "held", lead: "老闆押著你的薪水不發，",
          prompt: "老闆說新人第一個月的薪水要先押著，做滿一年才發，{同事說以前離職的人都沒拿到。|那是你一整個月的生活費。}要怎麼辦？" },
      ]);
      const lead = sc.lead;
      return {
        prompt: ctx.w(sc.prompt, { shop, cut, firm }),
        options: [
          {
            id: "y_wageOwed.talk", label: "好好跟老闆談", hint: "也許老闆真的有困難", act: "talk", style: "social", weight: 0.3,
            apply: (s2, c) => {
              if (c.roll("wealth", "good", 0.5)) return { text: c.w("{lead}你找老闆好好談，{老闆{紅著臉|嘆了一口氣}，隔週就把錢補齊了。|老闆說會分兩次給，最後真的一毛不少。}", { lead }), mood: 1 };
              spend(s2, 0.01);
              return { text: c.w("{lead}你找老闆好好談，{老闆一直說會給，後來{gone}，那筆錢再也沒拿回來。|談了好幾次，最後只拿回一半。}", { lead, gone }), mood: -2 };
            },
          },
          {
            id: "y_wageOwed.group", label: ctx.f("找其他{mates}一起去要", { mates }), hint: "人多比較有用", act: "negotiate", style: "social", weight: 0.2,
            apply: (s2, c) => {
              if (c.roll("wealth", "good", 0.6)) return { text: c.w("{lead}你找了其他{mates}，大家一起去找老闆，{老闆看大家都來了，當天就把錢補上。|老闆答應下個月一起補發，最後真的發了。}", { lead, mates }), mood: 2 };
              spend(s2, 0.01);
              return { text: c.w("{lead}你找了其他{mates}一起去要，{老闆翻臉說不做就走，大家只好各自認了。|拖到最後，大家各拿回一點。}", { lead, mates }), mood: -2 };
            },
          },
          y >= 1987
            ? {
              id: "y_wageOwed.report", label: "去勞工局申訴", hint: "走正式的管道", act: "dispute", style: "risk", weight: 0.15,
              apply: (s2, c) => {
                if (c.roll("wealth", "good", 0.6)) return { text: c.w("{lead}你去勞工局申訴，{勞工局發函以後，老闆馬上把錢補齊了。|勞資調解那天，老闆當場答應分期還清。}", { lead }), mood: 2 };
                spend(s2, 0.005);
                return { text: c.w("{lead}你去勞工局申訴，{調解拖了好幾個月，|老闆只願意給一半，}{你拿回一點，就不想再耗了。|但你學會了看清楚勞動契約。}", { lead }), mood: -1 };
              },
            }
            : {
              id: "y_wageOwed.elder", label: "請長輩出面幫忙討", hint: "有人撐腰比較好說話", act: "seekHelp", style: "family", weight: 0.15,
              apply: (s2, c) => (c.roll("wealth", "good", 0.5)
                ? { text: c.w("{lead}你請{里長|家裡的長輩}出面去跟老闆談，{老闆給了面子，把錢補齊了。|沒多久，錢就一毛不少地送來了。}", { lead }), mood: 2 }
                : { text: c.w("{lead}你請{里長|家裡的長輩}出面去跟老闆談，老闆嘴上答應，錢卻只補了一半。", { lead }), mood: -1 }),
            },
          {
            id: "y_wageOwed.wait", label: "先等等，相信老闆", hint: "老闆平常對你不錯", act: "wait", style: "safe", weight: 0.2,
            apply: (s2, c) => {
              if (c.roll("wealth", "good", 0.5)) return { text: c.w("{lead}你決定先等等，{兩個月後，老闆把錢一次補齊，還多包了一個紅包。|撐過那陣子，{firm}的生意慢慢好了起來，錢也補上了。}", { lead, firm }), mood: 1 };
              spend(s2, 0.01);
              return { text: c.w("{lead}你決定先等等，{等到最後，老闆{gone}，那筆錢就這樣沒了。|錢一直沒有下文，你心裡一直有個疙瘩。}", { lead, gone }), mood: -2 };
            },
          },
          {
            id: "y_wageOwed.quit", label: "不做了，換一家打工", hint: "此處不留人", act: "sideJob", style: "self", weight: 0.15, when: () => student,
            apply: (s2, c) => ({ text: c.w("{lead}你決定不做了，{換到另一家店打工，|改去當家教，}{新老闆每個月準時發薪水。|你學會了先問清楚發薪日。}", { lead }), mood: 1 }),
          },
          {
            id: "y_wageOwed.hunt", label: "邊做邊找下一份工作", hint: "此處不留人", act: "jobSearch", style: "risk", weight: 0.15, when: () => !student,
            apply: (s2, c) => { s2.flags.hunting = s2.age; return { text: c.w("{lead}你開始偷偷投履歷，{先做著，等找到更好的再說。|告訴自己找到下一份就走。}", { lead }), mood: -1 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_poached", once: true, domain: "career", channel: "good", ages: [24, 30],
    when: s => employee(s) && !BASIC.has(s.job.title) && s.job.field !== "公部門" && s.age - (s.job.since ?? s.age) >= 1 && !s.arcs.civil && !s.arcs.startup,
    p: s => (s.flags.hunting >= s.age - 2 ? 0.07 : 0.04),
    choice: (s, ctx) => {
      const y = s.year, more = ctx.rng.pick(["一成", "兩成", "三成"]);
      // Who calls ({甲|乙|丙}, by the kind of work and the era), and who wants you: [r1, r2] of a {甲|乙} choice, or one.
      const who = !desk(s) ? 0 : y >= 2010 ? 2 : 1;
      const [r1, r2] = rivalOf(s), two = !!r2;
      const course = ctx.rng.pick(y >= 2015 ? ["證照課程", "夜間的進修課程", "線上課程"] : ["證照課程", "夜間的進修課程"]);
      const boss = bossOf(s), shopFolk = SHOP.includes(s.job.title) || ["餐飲", "零售", "服務"].includes(s.job.field);
      // [label, hint, what you did]. Going and staying are told with a choice of their own ({甲|乙}), in GO and STAY.
      const base = {
        go: ["跳槽", "加薪，也要重新適應"],
        counter: ["拿 offer 跟老闆談加薪", "可能成功，也可能尷尬", "拿著 offer 去跟老闆談"],
        stay: ["留下來", "現在的環境比較安心"],
        scout: ["先打聽對方的風評", "謹慎一點", "先找人打聽"],
        rethink: ["趁機想想自己要什麼", "也許該學點新東西", "反而開始想自己真正想做什麼"],
      };
      // Who comes calling: a headhunter or an old friend, a former colleague now on the other side, a company that
      // found your résumé, a regular customer who opened a shop of their own, or your old boss taking a team along.
      const sc = sceneOf(s, ctx, "y_poached", [
        { key: "call", lead: "有人來挖角，", prompt: [
          ["{以前的同事|同業的朋友|以前的師傅}找上你：{{r1}|{r2}}想挖你過去當{job}，薪水多{more}。要去嗎？", "{以前的同事|同業的朋友|以前的師傅}找上你：{r1}想挖你過去當{job}，薪水多{more}。要去嗎？"],
          ["{以前的同事|大學同學|一位獵人頭}找上你：{{r1}|{r2}}想挖你過去當{job}，薪水多{more}。要去嗎？", "{以前的同事|大學同學|一位獵人頭}找上你：{r1}想挖你過去當{job}，薪水多{more}。要去嗎？"],
          ["{以前的同事|大學同學|一位獵人頭|LinkedIn 上的獵人頭}找上你：{{r1}|{r2}}想挖你過去當{job}，薪水多{more}。要去嗎？", "{以前的同事|大學同學|一位獵人頭|LinkedIn 上的獵人頭}找上你：{r1}想挖你過去當{job}，薪水多{more}。要去嗎？"],
        ][who][two ? 0 : 1] },
        { key: "former", lead: "以前的同事找你過去，",
          prompt: two ? "以前的同事跳槽到{{r1}|{r2}}以後，約你出來吃飯，說他們正缺一個{job}，薪水可以多{more}。要去嗎？" : "以前的同事跳槽到{r1}以後，約你出來吃飯，說他們正缺一個{job}，薪水可以多{more}。要去嗎？",
          o: {
            go: ["跟著前同事過去", "加薪，也要重新適應"],
            counter: ["拿這個條件跟老闆談", "可能成功，也可能尷尬", "拿著對方開的條件去跟老闆談"],
            stay: ["謝謝對方，留在原本的地方", "現在的環境比較安心"],
            scout: ["先問清楚那邊的狀況", "謹慎一點", "先跟其他人打聽那邊的狀況"],
          } },
        officeJob(s) && { key: "found", lead: "有公司主動來找你，",
          prompt: y >= 1997
            ? two ? "你放在人力銀行的履歷被{{r1}|{r2}}看到了，對方主動約你面試，開出的薪水比現在多{more}。要去嗎？" : "你放在人力銀行的履歷被{r1}看到了，對方主動約你面試，開出的薪水比現在多{more}。要去嗎？"
            : two ? "你放在朋友那裡的履歷被{{r1}|{r2}}看到了，對方主動約你面試，開出的薪水比現在多{more}。要去嗎？" : "你放在朋友那裡的履歷被{r1}看到了，對方主動約你面試，開出的薪水比現在多{more}。要去嗎？",
          o: {
            go: ["接下這個 offer", "加薪，也要重新適應"],
            stay: ["婉拒，留下來", "現在的環境比較安心"],
          } },
        shopFolk && { key: "regular", lead: "老客人找你過去，",
          prompt: "常來的一位老客人自己開了一間店，問你要不要過去幫忙，一樣當{job}，薪水多{more}。要去嗎？",
          o: {
            go: ["答應過去幫忙", "加薪，也要重新適應"],
            counter: ["跟老闆說有人在找你", "可能成功，也可能尷尬", "跟老闆說了有人在找你"],
            stay: ["婉拒，留在熟悉的地方", "現在的環境比較安心"],
            scout: ["先去對方的店看看", "謹慎一點", "先去對方的店裡坐了一個下午"],
          } },
        boss !== "老闆" && { key: "boss", lead: ctx.f("老{boss}要帶人一起跳槽，", { boss }),
          prompt: two ? "一直很照顧你的{boss}要跳槽到{{r1}|{r2}}，想帶幾個人一起過去，問你要不要跟，薪水多{more}。要去嗎？" : "一直很照顧你的{boss}要跳槽到{r1}，想帶幾個人一起過去，問你要不要跟，薪水多{more}。要去嗎？",
          o: {
            go: [ctx.f("跟著{boss}過去", { boss }), "加薪，也要重新適應"],
            counter: ["拿這件事跟公司談條件", "可能成功，也可能尷尬", "拿這件事去跟公司談條件"],
            stay: ["留下來，不跟著走", "現在的環境比較安心"],
            scout: [ctx.f("先問清楚{boss}那邊能給什麼", { boss }), "謹慎一點", ctx.f("先找{boss}問清楚那邊的狀況", { boss })],
          } },
      ]);
      const B = buttonsOf(base, sc), lead = sc.lead, did = k => ({ lead, did: B[k][2], more, course });
      // Going, and staying, in each scene.
      const GO = {
        call: "{lead}你{想了一個週末|跟家人商量後}，決定跳槽，薪水多了{more}，{新環境的節奏更快，你很快就適應了。|第一個月就接下了一個大案子。}",
        former: "{lead}你{想了一個週末|跟家人商量後}，決定跟著前同事過去，薪水多了{more}，{新環境的節奏更快，你很快就適應了。|第一個月就接下了一個大案子。}",
        found: "{lead}你去面試以後，{想了一個週末|跟家人商量後}，接下了 offer，薪水多了{more}，{新環境的節奏更快，你很快就適應了。|第一個月就接下了一個大案子。}",
        regular: "{lead}你{想了一個週末|跟家人商量後}，答應過去幫忙，薪水多了{more}，{新環境的節奏更快，你很快就適應了。|第一個月就接下了一個大案子。}",
        boss: "{lead}你{想了一個週末|跟家人商量後}，決定跟著{boss}過去，薪水多了{more}，{新環境的節奏更快，你很快就適應了。|第一個月就接下了一個大案子。}",
      };
      const STAY = {
        call: "{lead}你想了想，{現在的公司離家近，每天可以回家吃晚飯|現在的團隊很照顧你}，{還是決定留下來。|覺得錢不是全部。}",
        former: "{lead}你謝謝前同事的好意，{現在的公司離家近，每天可以回家吃晚飯|現在的團隊很照顧你}，{還是決定留下來。|覺得錢不是全部。}",
        found: "{lead}你去面試了一趟，最後還是婉拒了，{現在的公司離家近，每天可以回家吃晚飯|現在的團隊很照顧你}，{還是決定留下來。|覺得錢不是全部。}",
        regular: "{lead}你想了想，{現在的店離家近，每天可以回家吃晚飯|現在的同事都很照顧你}，{還是決定留下來。|覺得錢不是全部。}",
        boss: "{lead}你想了想，還是決定留下來，{現在的公司離家近，每天可以回家吃晚飯|捨不得現在的同事}，{還是決定留下來。|覺得錢不是全部。}",
      };
      return {
        prompt: ctx.w(sc.prompt, { r1, r2, more, boss }),
        options: [
          {
            id: "y_poached.go", label: B.go[0], hint: B.go[1], act: "jobHop", style: "risk", weight: 0.3,
            apply: (s2, c) => { s2.income *= c.rng.between(1.03, 1.12); return { text: c.w(GO[sc.key], { lead, more, boss }), mood: 4 }; },
          },
          {
            id: "y_poached.counter", label: B.counter[0], hint: B.counter[1], act: "negotiate", style: "social", weight: 0.2,
            apply: (s2, c) => {
              if (c.roll("career", "good", 0.5)) { s2.income *= 1.04; return { text: c.w("{lead}你{did}，{老闆當場幫你加了薪。|公司為了留你，調了薪水，也給了你更多責任。}", did("counter")), mood: 4 }; }
              return { text: c.w("{lead}你{did}，老闆說公司有公司的制度。你最後還是留了下來，心裡卻多了一個疙瘩。", did("counter")), mood: -2 };
            },
          },
          {
            id: "y_poached.stay", label: B.stay[0], hint: B.stay[1], act: "wait", style: "safe", weight: 0.3,
            apply: (s2, c) => ({ text: c.w(STAY[sc.key], { lead }), mood: 1 }),
          },
          {
            id: "y_poached.scout", label: B.scout[0], hint: B.scout[1], act: "seekHelp", style: "social", weight: 0.12,
            apply: (s2, c) => {
              if (c.roll("career", "good", 0.5)) { s2.income *= c.rng.between(1.03, 1.1); return { text: c.w("{lead}你{did}，{對方的風評不錯，|聽說那裡的主管很會帶人，}你放心地過去了。", did("scout")), mood: 4 }; }
              return { text: c.w(y >= 2000 ? "{lead}你{did}，{發現那邊一年就換了一半的人，|在網路上聽到不少負評，}決定婉拒。" : "{lead}你{did}，{發現那邊一年就換了一半的人，|在業界聽到不少負評，}決定婉拒。", did("scout")), mood: 1 };
            },
          },
          {
            id: "y_poached.rethink", label: B.rethink[0], hint: B.rethink[1], act: "study", style: "learn", weight: 0.08, when: s2 => !s2.arcs.study,
            apply: (s2, c) => { c.arc.start("study", { kind: course, from: s2.age }, c.rng.chance(0.5) ? 1 : 2); spend(s2, 0.05); return { text: c.w("{lead}你{did}，報名了{course}，{下班後回到教室。|想替自己多累積一點本事。}", did("rethink")), mood: 1 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_passion", once: true, domain: "career", channel: "change", ages: [23, 30], when: s => employee(s) && s.age - (s.job.since ?? s.age) >= 1, p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year, boss = bossOf(s), h = ctx.rng.pick(["畫畫", "攝影", "寫作", "音樂", "手作", ...(y >= 1990 ? ["烘焙"] : []), ...(y >= 2010 ? ["拍影片"] : [])]);
      // Ways to make it pay, by era: the parts of a {甲|乙|丙} or {甲|乙} choice.
      const sell = y >= 2010 ? ["開了一個粉絲專頁", "週末去文創市集擺攤", "在網路上接案"] : y >= 2000 ? ["在網路上接案", "架了一個個人網站接案"] : ["接朋友介紹的案子", "參加作品聯展、接一些小案子"];
      const [s1, s2, s3] = sell, three = sell.length === 3;
      // How the work is called: 畫畫作品, 寫的文章, 拍的影片.
      const work = { 寫作: "文章", 拍影片: "影片", 音樂: "歌" }[h] || h + "作品", piece = { 寫作: "寫的文章", 拍影片: "拍的影片", 音樂: "寫的歌" }[h] || h + "的作品";
      // Who might pay for it, and what a friend who made it a living has done.
      const ASK = {
        畫畫: [["朋友開的咖啡店", "畫一面牆"], ["親戚的小吃店", "設計一張新菜單"]],
        攝影: [["要結婚的同事", "拍婚禮"], ["朋友開的服飾店", "拍一組商品照"]],
        寫作: [["朋友的小公司", "寫一份品牌故事"], ["一家小雜誌社", "寫一篇稿子"]],
        音樂: [["要結婚的同學", "在婚宴上表演"], ["朋友的公司", "在尾牙上表演"]],
        烘焙: [["要結婚的同事", "做一百份婚禮小餅乾"], ["朋友開的咖啡店", "每週供應幾樣甜點"]],
        手作: [["要結婚的朋友", "做一批婚禮小物"], ["朋友的公司", "做一批週年禮物"]],
        拍影片: [["朋友開的餐廳", "拍一支宣傳影片"], ["要結婚的同學", "剪一支婚禮影片"]],
      };
      const PRO = { 畫畫: ["插畫家", "開了第一次個展，邀你去看"], 攝影: ["攝影師", "開了第一次攝影展，邀你去看"], 寫作: ["作家", "出了第一本書，邀你去新書發表會"], 音樂: ["音樂人", "辦了第一場售票演出，邀你去聽"], 烘焙: ["甜點師", "開了一間小小的甜點店，邀你去試吃"], 手作: ["手作職人", "開了自己的工作室，邀你去參觀"], 拍影片: ["影片創作者", "頻道訂閱破了十萬，邀你去見面會"] };
      const [asker, task] = ctx.rng.pick(ASK[h]), [pro, made] = PRO[h];
      // Where it is posted; 2004–2008 a {甲|乙} choice of its own.
      const where = h === "拍影片" ? "YouTube" : y >= 2013 ? "IG" : y >= 2009 ? "臉書" : y >= 2004 ? "blog" : null;
      const more = officeJob(s) ? "接下一個新專案" : "多負責一些事、排更多的班";
      // [label, hint, what you did]. What you did is null when it is a choice of its own, told in the templates below.
      const base = {
        hobby: ["當興趣慢慢做", "工作和興趣各一半", null],
        side: ["開始經營副業", "多一份收入，也多一份累", null],
        course: ["上專業課程，準備轉行", "給自己一個機會", null],
        focus: ["先專心衝工作", "等存夠錢再說", ctx.f("把{h}的東西收進櫃子，專心在工作上", { h })],
        contest: ["報名比賽或作品展", "讓別人看看你的作品", ctx.f("把{piece}拿去參加比賽", { piece })],
        friends: ["找同好一起做", "有伴比較走得久", "加入了一個{h}的同好社群，認識了{f}"],
      };
      // What brings the question up: the pull of it, someone who wants to pay for it, work seen by many online, a boss
      // who wants more of your time, a friend who made it a living, or a contest open for entries.
      const sc = sceneOf(s, ctx, "y_passion", [
        { key: "pull", lead: ctx.f("放不下{h}，", { h }),
          prompt: ["工作穩定了，但你一直放不下{h}。{同事說你的作品很有水準，|朋友常說你可以靠這個吃飯，}{你開始想：要不要認真做？|你常常想像，如果當初選了這條路會怎樣。}要怎麼辦？", "每天下班後，你都花兩三個小時在{h}上，{比上班還認真。|週末更是整天埋頭做。}這件事在你的人生裡，該放在哪裡？"] },
        { key: "ask", lead: ctx.f("{asker}想請你{task}，", { asker, task }),
          prompt: "{asker}聽說你會{h}，想付錢請你{task}。可是你下班後的時間本來就不多，{對方說價錢好商量。|時間又有點趕。}要怎麼辦？",
          o: {
            hobby: ["幫忙，但只收材料費", "當興趣做就好", null],
            side: ["收錢接下來，開始接案", "多一份收入，也多一份累", null],
            course: ["趁機去上課，練成專業", "給自己一個轉行的機會", ctx.f("接完這件，報名了{h}的專業課程", { h })],
            focus: ["婉拒，先顧好工作", "等存夠錢再說", "婉拒了，說最近工作太忙"],
            contest: ["接完這件，拿作品去投比賽", "讓別人看看你的作品", "接完這件，又把作品拿去參加比賽"],
            friends: [ctx.f("找會{h}的朋友一起接", { h }), "有伴比較走得久", "找了在{h}社群認識的{f}一起接"],
          } },
        where && { key: "seen", lead: ctx.f("{work}在網路上被很多人看見，", { work }),
          prompt: where === "blog"
            ? "你放在{無名小站|部落格}上的{work}，被{好幾千人|一個很有名的帳號}分享出去，一個晚上多了{好幾百|上千}個人來留言。要怎麼辦？"
            : "你放在{where}上的{work}，被{好幾千人|一個很有名的帳號}分享出去，一個晚上多了{好幾百|上千}個人追蹤。要怎麼辦？",
          o: {
            hobby: ["照自己的步調慢慢發", "不想被追著跑", null],
            side: [y >= 2010 ? "開始接業配、賣作品" : "開始在網路上接案", "多一份收入，也多一份累", y >= 2010 ? null : "開始在網路上接案"],
            course: ["去上專業課，認真走這條路", "給自己一個機會", ctx.f("報名了{h}的專業課程", { h })],
            focus: ["帳號先放著，專心工作", "熱度很快就會過", "把帳號先放著，專心在工作上"],
            contest: ["趁熱整理作品去投比賽", "讓更多人看到", "趁熱把作品整理好，拿去參加比賽"],
            friends: ["跟常來留言的同好約出來", "有伴比較走得久", "跟常來留言的{f}約出來見面"],
          } },
        { key: "more", lead: officeJob(s) ? ctx.f("{boss}要你接新專案，", { boss }) : ctx.f("{boss}要你多扛一些事，", { boss }),
          prompt: "{boss}問你要不要{more}，接了以後，留給{h}的時間就沒了。要怎麼選？",
          o: {
            hobby: [ctx.f("答應，但把{h}改到假日", { h }), "工作和興趣各一半", ctx.f("答應了，但把{h}改到假日做", { h })],
            side: [ctx.f("婉拒，把{h}做成副業", { h }), "多一份收入，也多一份累", null],
            course: [ctx.f("婉拒，去上{h}的專業課", { h }), "給自己一個轉行的機會", ctx.f("婉拒了，報名了{h}的專業課程", { h })],
            focus: [ctx.f("答應，{h}先放一邊", { h }), "等存夠錢再說", ctx.f("答應了，把{h}的東西收進櫃子", { h })],
            contest: ["答應之前，先把作品投出去比賽", "給自己一個交代", "答應之前，先把作品拿去參加比賽"],
            friends: ["找同好分工，兩邊都不放棄", "有伴比較走得久", "答應了，另外找一起{h}的{f}分工"],
          } },
        { key: "friend", lead: ctx.f("看到老朋友走上{h}這條路，", { h }),
          prompt: "以前一起{h}的{同學|社團朋友}辭掉工作，當了全職的{pro}，{made}。回家的路上，你一直想著自己。要怎麼辦？",
          o: {
            hobby: ["替對方開心，自己當興趣做", "各有各的路", ctx.f("替對方開心，自己還是把{h}當興趣", { h })],
            side: ["也開始試著接案", "多一份收入，也多一份累", null],
            course: ["報名專業課程，給自己一個機會", "準備轉行", ctx.f("報名了{h}的專業課程", { h })],
            focus: ["羨慕歸羨慕，先顧好工作", "等存夠錢再說", "羨慕歸羨慕，還是先專心在工作上"],
            contest: ["把作品整理出來去投比賽", "讓別人看看你的作品", "把作品整理出來，拿去參加比賽"],
            friends: ["請對方帶你認識同好", "有伴比較走得久", "請對方帶你進了同好的圈子，認識了{f}"],
          } },
        { key: "call", lead: ctx.f("看到{h}比賽在徵件，", { h }),
          prompt: y >= 2011
            ? "滑手機時看到一個{h}比賽在徵件，{截止日就在下個月，|首獎還有一筆獎金，}你把簡章看了好幾遍。要怎麼辦？"
            : y >= 2000
              ? "上網時看到一個{h}比賽在徵件，{截止日就在下個月，|首獎還有一筆獎金，}你把簡章看了好幾遍。要怎麼辦？"
              : "下班路上看到一個{h}比賽在徵件，{截止日就在下個月，|首獎還有一筆獎金，}你把簡章看了好幾遍。要怎麼辦？",
          o: {
            hobby: ["不比賽，當興趣慢慢做", "不想給自己壓力", "決定不比賽，還是當興趣慢慢做"],
            side: ["不比賽，直接接案賺錢", "多一份收入，也多一份累", null],
            course: ["先去上課，把基本功練好", "給自己一個機會", null],
            focus: ["工作太忙，這次先放過", "等存夠錢再說", "想了想工作的進度，把簡章收進抽屜"],
            contest: ["熬夜趕出作品去投", "讓別人看看你的作品", "熬了好幾個晚上，趕出作品去投"],
            friends: ["找同好組隊一起參加", "有伴比較走得久", "找了一起{h}的{f}組隊參加"],
          } },
      ]);
      const B = buttonsOf(base, sc), k = sc.key, lead = sc.lead;
      // {lead}你{what you did}，{how it went}: what you did from the buttons, or from these templates when it is a choice of
      // its own. Making it pay ({s1}, {s2}, {s3}) is said four ways.
      const HOBBY = {
        pull: "{lead}你決定把它當成興趣，{每週固定留兩個晚上給它|週末去上進階課}，{日子雖然忙，你卻覺得很充實。|那是你一週裡最期待的時間。|你發現自己還是最喜歡做這件事。}",
        ask: "{lead}你答應幫忙，但只收材料費，{花了三個週末才完成|下班後一點一點做完}，{日子雖然忙，你卻覺得很充實。|那是你一週裡最期待的時間。|你發現自己還是最喜歡做這件事。}",
        seen: "{lead}你還是照自己的步調，{想到才發一張|一個月更新一兩次}，{日子雖然忙，你卻覺得很充實。|那是你一週裡最期待的時間。|你發現自己還是最喜歡做這件事。}",
      };
      const SIDE = three ? {
        pull: "{lead}你開始{{s1}|{s2}|{s3}}，{第一次有陌生人付錢買你的作品，你開心了好幾天。|副業的收入雖然不多，卻讓你很有成就感。}",
        more: "{lead}你婉拒了，把下班的時間拿來經營副業，{{s1}|{s2}|{s3}}，{第一次有陌生人付錢買你的作品，你開心了好幾天。|副業的收入雖然不多，卻讓你很有成就感。}",
        friend: "{lead}你也開始{{s1}|{s2}|{s3}}，{第一次有陌生人付錢買你的作品，你開心了好幾天。|副業的收入雖然不多，卻讓你很有成就感。}",
        call: "{lead}你決定不比賽，直接{{s1}|{s2}|{s3}}，{第一次有陌生人付錢買你的作品，你開心了好幾天。|副業的收入雖然不多，卻讓你很有成就感。}",
      } : {
        pull: "{lead}你開始{{s1}|{s2}}，{第一次有陌生人付錢買你的作品，你開心了好幾天。|副業的收入雖然不多，卻讓你很有成就感。}",
        more: "{lead}你婉拒了，把下班的時間拿來經營副業，{{s1}|{s2}}，{第一次有陌生人付錢買你的作品，你開心了好幾天。|副業的收入雖然不多，卻讓你很有成就感。}",
        friend: "{lead}你也開始{{s1}|{s2}}，{第一次有陌生人付錢買你的作品，你開心了好幾天。|副業的收入雖然不多，卻讓你很有成就感。}",
        call: "{lead}你決定不比賽，直接{{s1}|{s2}}，{第一次有陌生人付錢買你的作品，你開心了好幾天。|副業的收入雖然不多，卻讓你很有成就感。}",
      };
      SIDE.ask = "{lead}你收了錢接下來，{之後也開始接別的案子|做完還整理了一本作品集}，{第一次有陌生人付錢買你的作品，你開心了好幾天。|副業的收入雖然不多，卻讓你很有成就感。}";
      SIDE.seen = "{lead}你開始接業配，{也開了一個賣作品的小店|週末去文創市集擺攤}，{第一次有陌生人付錢買你的作品，你開心了好幾天。|副業的收入雖然不多，卻讓你很有成就感。}";
      const COURSE = "{lead}你報名了{h}的專業課程，{每週三個晚上去上課|把年假都拿來上密集班}，{想給自己一個轉行的機會。|一步一步往想做的事靠近。}";
      const v = { lead, h, s1, s2, s3 };
      const said = (k2, tail, f) => ctx.w(tail, { lead, did: f ? ctx.f(B[k2][2], { h, f }) : B[k2][2] });
      return {
        prompt: ctx.w(sc.prompt, { h, asker, task, work, where, more, pro, made, boss }),
        options: [
          {
            id: "y_passion.hobby", label: B.hobby[0], hint: B.hobby[1], act: "hobby", style: "self", weight: 0.35,
            apply: () => ({ text: B.hobby[2] ? said("hobby", "{lead}你{did}，{日子雖然忙，你卻覺得很充實。|那是你一週裡最期待的時間。|你發現自己還是最喜歡做這件事。}") : ctx.w(HOBBY[k], v), mood: 3 }),
          },
          {
            id: "y_passion.side", label: B.side[0], hint: B.side[1], act: "sideJob", style: "risk", weight: 0.15,
            apply: s2 => { s2.income *= 1.03; stress(s2, 0.05); return { text: B.side[2] ? said("side", "{lead}你{did}，{第一次有陌生人付錢買你的作品，你開心了好幾天。|副業的收入雖然不多，卻讓你很有成就感。}") : ctx.w(SIDE[k], v), mood: 3 }; },
          },
          {
            id: "y_passion.course", label: B.course[0], hint: B.course[1], act: "study", style: "learn", weight: 0.15, when: s2 => !s2.arcs.study,
            apply: (s2, c) => { c.arc.start("study", { kind: h + "的專業課程", from: s2.age }, c.rng.chance(0.5) ? 1 : 2); spend(s2, 0.05); return { text: B.course[2] ? said("course", "{lead}你{did}，{想給自己一個轉行的機會。|一步一步往想做的事靠近。}") : ctx.w(COURSE, v), mood: 2 }; },
          },
          {
            id: "y_passion.focus", label: B.focus[0], hint: B.focus[1], act: "pushThrough", style: "safe", weight: 0.2,
            apply: () => ({ text: said("focus", "{lead}你{did}，{那年的考核拿了 A。|告訴自己等存夠了錢再說。}"), mood: -1 }),
          },
          {
            id: "y_passion.contest", label: B.contest[0], hint: B.contest[1], act: "hobby", style: "risk", weight: 0.1,
            apply: (s2, c) => {
              if (c.roll("career", "good", 0.35)) { s2.savings += 0.03; return { text: said("contest", "{lead}你{did}，{竟然得了佳作，獎金拿去買了新器材。|入圍了決選，被一家公司看見，開始有人找你合作。}"), mood: 5 }; }
              return { text: said("contest", "{lead}你{did}，沒有得名，但評審寫的一句鼓勵，讓你決定繼續做下去。"), mood: 1 };
            },
          },
          {
            id: "y_passion.friends", label: B.friends[0], hint: B.friends[1], act: "socialize", style: "social", weight: 0.05,
            apply: (s2, c) => { const f = friendOf(s2, c, { how: h + "同好", fresh: true }); return { text: said("friends", "{lead}你{did}，{兩個人約好每個月一起完成一件作品。|你們互相打氣，誰也沒有放棄。}", f.call), mood: 3 }; },
          },
        ],
      };
    },
  },

  {
    // 下班後的副業，依年代：客廳即工廠的家庭代工、補習班兼課、夜市擺攤、網拍、外送、私下接案。收入和累都只多一點。
    id: "y_sideHustle", once: true, domain: "wealth", channel: "change", ages: [20, 30],
    when: s => working(s) && !s.arcs.startup && s.age - (s.job.since ?? s.age) >= 1, p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year, aunt = s.mother.alive ? "媽媽" : "鄰居的阿姨";
      const course = ctx.rng.pick(y >= 2015 ? ["證照課程", "線上課程", "語言課"] : ["證照課程", "語言課", "夜間的進修課程"]);
      const goods = ctx.rng.pick(["雞蛋糕", "飾品", ...(y >= 2005 ? ["手機殼"] : []), ...(y >= 1990 ? ["珍珠奶茶"] : [])]);
      const gig = { 科技: "寫程式", 設計: "設計", 行銷: "寫文案", 媒體: "寫稿", 金融: "記帳", 教育: "編講義" }[s.job.field] || "翻譯";
      const studied = ["大學", "科大", "碩士", "博士", "五專"].includes(s.edu);
      const base = {
        yes: ["接下來，下班後做", "多一份收入，也多一份累", "接了下來，下班後就做"],
        weekend: ["只做週末，不影響本業", "量力而為", "只在週末做"],
        rest: ["不做，下班時間留給休息", "身體比較重要", "婉拒了，下班時間留給休息"],
        study: ["把時間拿來進修", "投資自己", ctx.f("婉拒了，把時間拿去上{course}", { course })],
        partner: ["找朋友一起做", "有伴比較好玩", "找了{f}一起做"],
      };
      // The side job of the times. [label, hint, what you did] per option.
      const sc = sceneOf(s, ctx, "y_sideHustle", [
        y < 1988 && { key: "piece", lead: aunt === "媽媽" ? "家裡在做代工，" : "鄰居在做代工，",
          prompt: "{aunt}拿了一大箱{聖誕燈泡|塑膠花|成衣}回家做代工，按件計酬，問你下班後要不要一起做。要怎麼辦？",
          o: { yes: ["下班後一起做代工", "多一份收入，也多一份累", aunt === "媽媽" ? "下班後就坐在客廳一起做到半夜" : "下班後就去鄰居家一起做到半夜"], weekend: ["只有週末幫忙", "量力而為", "只在週末幫忙做一些"], partner: ["拉朋友來一起做", "有伴比較好玩", "拉了{f}來一起做，邊做邊聊"] } },
        y < 2008 && studied && { key: "tutor", lead: "有人找你晚上去兼課，",
          prompt: "{補習班|朋友}問你晚上要不要去{兼課|當家教}，一個禮拜兩個晚上，{鐘點費不錯。|可以多存一點錢。}要怎麼辦？",
          o: { yes: ["接下來，一週兩個晚上", "多一份收入，也多一份累", "接了下來，一週兩個晚上去教課"], weekend: ["只接週末的課", "量力而為", "只接了週末的課"], partner: ["找朋友一起開個小班", "有伴比較好玩", "找了{f}一起開了一個小班"] } },
        y >= 1975 && { key: "stall", lead: "朋友找你去夜市擺攤，",
          prompt: "朋友在夜市擺攤賣{goods}，週末人手不夠，問你要不要一起合夥。要怎麼辦？",
          o: { yes: ["合夥，每個週末都去顧攤", "多一份收入，也多一份累", "跟朋友合夥，每個週末都去顧攤"], weekend: ["偶爾去幫忙就好", "量力而為", "只在人手不夠的時候去幫忙"], partner: ["再拉一個朋友，三個人輪班", "有伴比較好玩", "又拉了{f}一起加入，三個人輪班"] } },
        y >= 2002 && y < 2016 && { key: "shop", lead: "朋友找你一起做網拍，", who: ctx.rng.pick(["同事", "朋友"]),
          o: { yes: ["開一個賣場，下班後經營", "多一份收入，也多一份累", "開了一個網拍賣場，下班後拍照、上架、回訊息"], weekend: ["只在週末出貨", "量力而為", "開了一個小賣場，只在週末出貨"], partner: ["跟朋友合開一個賣場", "有伴比較好玩", "跟{f}合開了一個賣場，一個進貨、一個出貨"] } },
        y >= 2016 && { key: "delivery", lead: "同事找你一起跑外送，",
          prompt: "同事下班後跑外送，說一個晚上能多賺{好幾百|一千多}，問你要不要也試試看。要怎麼辦？",
          o: { yes: ["申請帳號，下班就跑", "多一份收入，也多一份累", "申請了外送的帳號，下班就騎車上線"], weekend: ["只在週末跑幾單", "量力而為", "只在週末跑幾單"], partner: ["跟同事一起跑，互相照應", "有伴比較好玩", "跟{f}一起跑，約好在同一家便利商店休息"] } },
        y >= 2008 && officeJob(s) && { key: "gig", lead: ctx.f("有人找你私下接{gig}的案子，", { gig }),
          prompt: "{以前的同學|朋友的公司}問你能不能私下接一個{gig}的案子，酬勞差不多是半個月的薪水。要怎麼辦？",
          o: { yes: ["接下來，熬夜趕完", "多一份收入，也多一份累", "接了下來，連續熬了好幾個晚上"], weekend: ["接，但只用週末做", "量力而為", "接了下來，但只用週末做"], partner: ["找朋友分工一起接", "有伴比較好玩", "找了{f}分工一起接"] } },
      ]);
      // The online shop's prompt: who sells there was drawn with the scenes.
      const prompt = sc.key !== "shop" ? sc.prompt : sc.who === "同事"
        ? "同事在網拍賣{衣服|飾品|日本零食}，一個月多賺好幾千，問你要不要一起做。要怎麼辦？"
        : "朋友在網拍賣{衣服|飾品|日本零食}，一個月多賺好幾千，問你要不要一起做。要怎麼辦？";
      const B = buttonsOf(base, sc), say = (k, tail, f) => ctx.w(tail, { lead: sc.lead, did: f ? ctx.f(B[k][2], { f }) : B[k][2], f });
      return {
        prompt: ctx.w(prompt, { aunt, goods, gig }),
        options: [
          {
            id: "y_sideHustle.yes", label: B.yes[0], hint: B.yes[1], act: "sideJob", style: "risk", weight: 0.3,
            apply: s2 => { s2.savings += 0.03; stress(s2, 0.05); return { text: say("yes", "{lead}你{did}，{一個月多了一筆收入，|錢是多了，}{但週末幾乎沒有休息。|你把多賺的錢另外存了起來。}"), mood: 1 }; },
          },
          {
            id: "y_sideHustle.weekend", label: B.weekend[0], hint: B.weekend[1], act: "sideJob", style: "safe", weight: 0.2,
            apply: s2 => { s2.savings += 0.015; stress(s2, 0.02); return { text: say("weekend", "{lead}你{did}，{收入不多，剛好夠付每個月的{水電|伙食}。|做了半年，你覺得這樣剛剛好。}"), mood: 1 }; },
          },
          {
            id: "y_sideHustle.rest", label: B.rest[0], hint: B.rest[1], act: "rest", style: "health", weight: 0.2,
            apply: s2 => { stress(s2, -0.03); return { text: say("rest", "{lead}你{did}，{晚上去散步、早早睡覺，|週末留給家人朋友，}{白天上班反而更有精神。|你覺得錢夠用就好。}"), mood: 1 }; },
          },
          {
            id: "y_sideHustle.study", label: B.study[0], hint: B.study[1], act: "study", style: "learn", weight: 0.15,
            apply: s2 => { spend(s2, 0.02); return { text: say("study", "{lead}你{did}，{把多出來的時間投資在自己身上。|一年後，履歷上多了一張證書。}"), mood: 1 }; },
          },
          {
            id: "y_sideHustle.partner", label: B.partner[0], hint: B.partner[1], act: "socialize", style: "social", weight: 0.15,
            apply: (s2, c) => {
              const f = friendOf(s2, c, sc.key === "delivery" ? { prefer: /同事/, how: "同事" } : {}); bond(f, 0.08); s2.savings += 0.02;
              return { text: say("partner", "{lead}你{did}，{賺得不多，卻一起熬過了好多個晚上。|後來{f}成了你最好的朋友之一。}", f.call), mood: 2 };
            },
          },
        ],
      };
    },
  },

  // ---------- where to live, money, travel ----------
  {
    // 北漂：從中南部、東部或離島到北部工作。
    id: "y_northbound", once: true, domain: "move", channel: "change", ages: [22, 30],
    when: s => working(s) && !!s.birthCounty && regionOf(s.birthCounty) !== "north" && s.county === s.birthCounty && s.job.field !== "家業" && !s.arcs.startup, p: () => 0.05,
    choice: (s, ctx) => {
      const where = { central: "中部", south: "南部", east: "東部", islands: "離島" }[regionOf(s.county)] || "家鄉";
      const who = parentsWord(s), y = s.year;
      const north = COUNTIES.filter(([c]) => ["臺北市", "新北市", "桃園市", "新竹市", "新竹縣"].includes(c));
      const goNorth = (s2, c) => { const to = moveTo(s2, c, north); if (s2.home === "parents") s2.home = "rent"; s2.flags.movedNorth = s2.age; return to; };
      const cities = COUNTIES.filter(([c]) => ["臺中市", "高雄市", "臺南市"].includes(c) && c !== s.county);
      return {
        prompt: ctx.w(["{where}的工作機會少，{台北|新竹}的公司開出比現在多{兩成|三成}的薪水。要北上嗎？", "{同學一個個都北上了，|主管說公司要在台北開新的據點，問你要不要過去，}你在{city}的日子很安穩，卻也常常想去台北闖一闖。要北上嗎？"], { where }),
        options: [
          {
            id: "y_northbound.go", label: "北上工作", hint: "薪水高，房租也高", act: "moveHome", style: "risk", weight: 0.35,
            apply: (s2, c) => { s2.income *= c.rng.between(1.02, 1.1); const to = goNorth(s2, c); return { text: c.w("決定北上，你拖著兩個行李箱搬到{to}，{租了一間{三坪|四坪}大的小套房，|第一個月光是房租就花掉了薪水的三分之一，}{週末常常打電話回家。|每次回家，{who}都說你瘦了。}", { to, who }), mood: 2, big: true }; },
          },
          {
            id: "y_northbound.stay", label: "留在家鄉", hint: "離家近，生活費低", act: "wait", style: "family", weight: 0.35,
            apply: (s2, c) => ({ text: c.w("想過要北上，最後還是留在{city}，{離家近，晚餐可以回家吃。|薪水少一點，但生活費也少一點。|週末可以陪{who}去{市場|廟裡拜拜|爬山}。}", { who }), mood: 1 }),
          },
          {
            id: "y_northbound.city", label: "去中南部的大城市", hint: "折衷的選擇", act: "moveHome", style: "safe", weight: 0.12, when: () => cities.length > 0,
            apply: (s2, c) => { const to = moveTo(s2, c, cities); s2.income *= 1.03; if (s2.home === "parents") s2.home = "rent"; return { text: c.w("不想去台北那麼遠，你搬到{to}工作，{回家只要一兩個小時，|房租比台北便宜一半，}{週末還能回家吃飯。|生活步調剛剛好。}", { to }), mood: 2 }; },
          },
          y >= 2020 && desk(s)
            ? {
              id: "y_northbound.remote", label: "找遠距工作", hint: "領台北的薪水，住在家鄉", act: "negotiate", style: "learn", weight: 0.1,
              apply: (s2, c) => {
                if (c.roll("career", "good", 0.5)) { s2.income *= 1.03; return { text: c.w("不想北漂，你應徵上一家台北公司的遠距職缺，{每個月北上開一次會，|在家裡的書桌前開視訊會議，}{領台北的薪水，住在家鄉。|{who}常好奇你在電腦前跟誰說話。}", { who }), mood: 3 }; }
                return { text: c.w("不想北漂，你找了好幾家遠距的工作，{但大多還是要進辦公室，|面試了幾家都沒有下文，}只好先留在{city}。"), mood: -1 };
              },
            }
            : {
              id: "y_northbound.transfer", label: "請公司調你去台北", hint: "帶著原本的工作北上", act: "negotiate", style: "learn", weight: 0.1,
              apply: (s2, c) => {
                if (c.roll("career", "good", 0.5)) { s2.income *= 1.05; const to = goNorth(s2, c); return { text: c.w("你向公司申請調到台北的分公司，{主管答應了，|公司幫你安排了宿舍，}{下個月就搬到{to}報到。|你帶著原本的工作，換了一座城市。}", { to }), mood: 2 }; }
                return { text: c.w("你申請調到台北的分公司，公司說目前沒有缺，你只好先留在{city}。"), mood: -1 };
              },
            },
          {
            id: "y_northbound.civil", label: "考公職留在家鄉", hint: "穩定，但要準備一兩年", act: "civilService", style: "safe", weight: 0.08, when: s2 => !s2.arcs.civil && s2.job.field !== "公部門",
            apply: (s2, c) => { c.arc.start("civil", { tries: 0, quit: false }, 1); return { text: c.w("不想北漂，你決定{買齊考古題，|報名補習班，}{下班後準備公職考試，|一邊工作一邊讀書，}想在家鄉找一份穩定的工作。"), mood: 0 }; },
          },
        ],
      };
    },
  },
  {
    // 家人要你回老家工作。只在你自己搬離出生的縣市、家裡也沒有搬過家的時候（爸媽還住在老家）。回去的話一樣做本行，
    // 薪水少一點、房租省下來。
    id: "y_comeHome", once: true, domain: "move", channel: "change", tags: ["father", "mother"], ages: [23, 30],
    when: s => employee(s) && parentsAlive(s) && s.rel !== "married" && !!s.birthCounty && !!s.county && s.county !== s.birthCounty && s.last.familyMove === undefined && !s.arcs.startup && !s.arcs.civil,
    p: () => 0.11,
    choice: (s, ctx) => {
      const y = s.year, who = parentsWord(s), home = town(s.birthCounty), here = town(s.county), office = officeJob(s), job = s.job.title;
      const park = (home === "新竹" && y >= 1981) || (home === "臺南" && y >= 1997) || (home === "高雄" && y >= 2001) || (home === "臺中" && y >= 2003) ? "科學園區" : "工業區";
      const send = y < 1998 ? "把報紙上的徵才廣告剪下來寄給你" : y < 2011 ? "把徵才的網頁寄給你" : "在 LINE 上傳了徵才的連結給你";
      const remote = office && y >= 2020;
      // [label, hint, what you did]. Staying and visiting more often is a choice of its own ({甲|乙}), told below.
      const base = {
        go: ["回老家工作", "離家近，薪水可能少一點", ctx.f("回到{home}，在當地找到一樣是{job}的工作，搬回家住", { home, job })],
        transfer: [remote ? "跟公司談遠距工作" : "申請調回老家附近", "帶著原本的工作回去", remote ? "跟公司談遠距工作" : ctx.f("向公司申請調回{home}附近", { home })],
        visit: ["留下來，但更常回家", "兩邊都顧", null],
        talk: [ctx.f("跟{who}說明自己的規劃", { who }), "讓家裡放心", ctx.f("把自己的工作和規劃，一五一十地跟{who}說", { who })],
        invite: [ctx.f("接{who}來{here}住幾天", { who, here }), "讓家裡看看你的生活", ctx.f("接{who}來{here}住了幾天，帶著到處走走", { who, here })],
        stay: ["堅持留下來打拚", "這裡才有你要的機會", ctx.f("跟{who}說，自己想在{here}再拚幾年", { who, here })],
      };
      const sc = sceneOf(s, ctx, "y_comeHome", [
        { key: "call", lead: ctx.f("{who}要你回{home}工作，", { who, home }), phone: true,
          prompt: "{who}打電話來，說{年紀大了|身體不比以前}，家裡需要有人在，問你要不要回{home}工作。要怎麼辦？" },
        { key: "newyear", lead: ctx.f("過年時{who}又要你回{home}，", { who, home }),
          prompt: "過年回{home}，團圓飯吃到一半，{who}又說外面那麼辛苦，不如回來，{親戚|鄰居}也在旁邊附和。要怎麼辦？" },
        ["科技", "製造"].includes(s.job.field) && { key: "park", lead: ctx.f("{home}的{park}在徵人，", { home, park }),
          prompt: "{home}的{park}在大舉徵人，{who}{send}，說回來一樣可以做本行。要怎麼辦？",
          o: { go: [ctx.f("回{home}的{park}上班", { home, park }), "離家近，薪水可能少一點", ctx.f("回到{home}，在{park}找到一樣是{job}的工作，搬回家住", { home, park, job })] } },
        { key: "visit", lead: ctx.f("看到{who}老了，", { who }),
          prompt: "回{home}過週末，你發現{{who}的頭髮白了好多|{who}走路慢了不少|家裡壞掉的燈泡都沒人換}，{who}送你到車站時，叮嚀你有空就回來。要怎麼辦？" },
      ]);
      const B = buttonsOf(base, sc), lead = sc.lead, did = k => ({ lead, did: B[k][2], who, here });
      const back = s2 => { s2.county = s2.birthCounty; s2.home = "parents"; };
      return {
        prompt: ctx.w(sc.prompt, { who, home, park, send }),
        options: [
          {
            id: "y_comeHome.go", label: B.go[0], hint: B.go[1], act: "familyBusiness", style: "family", weight: 0.2,
            apply: (s2, c) => { back(s2); frugal(s2, 2); s2.income *= c.rng.between(0.88, 1); return { text: c.w("{lead}你{did}，{薪水少了一點，但晚餐都有家裡的菜。|{who}每天早上都幫你準備早餐。|週末陪{who}去{市場|廟裡拜拜|爬山}。}", did("go")), mood: 2 }; },
          },
          {
            id: "y_comeHome.transfer", label: B.transfer[0], hint: B.transfer[1], act: "negotiate", style: "learn", weight: 0.12,
            apply: (s2, c) => {
              if (!c.roll("career", "good", 0.45)) return { text: c.w("{lead}你{did}，公司說目前沒有辦法，你只好先留在{here}。", did("transfer")), mood: -1 };
              back(s2); frugal(s2, 1);
              return { text: c.w(remote ? "{lead}你{did}，{公司答應了，你搬回家裡，每個月回公司開一次會。|公司答應了，你在老家的書桌前開視訊會議，{who}常好奇你在跟誰說話。}" : "{lead}你{did}，{主管答應了，|公司剛好在那裡有缺，}{下個月就回去報到。|你帶著原本的工作回到了老家。}", did("transfer")), mood: 3 };
            },
          },
          {
            id: "y_comeHome.visit", label: B.visit[0], hint: B.visit[1], act: "care", style: "safe", weight: 0.25,
            apply: (s2, c) => { spend(s2, 0.01); return { text: c.w(y >= 2011
              ? "{lead}你決定留在{here}，但{每個月回家一次|每兩個週末就回去一趟}，{{who}嘴上說不用那麼常回來，每次都煮一桌菜等你。|來回的車票錢不少，但你覺得值得。|你在家裡的 LINE 群組，每天傳一張照片報平安。}"
              : "{lead}你決定留在{here}，但{每個月回家一次|每兩個週末就回去一趟}，{{who}嘴上說不用那麼常回來，每次都煮一桌菜等你。|來回的車票錢不少，但你覺得值得。|你每天晚上打一通電話回家報平安。}", { lead, here, who }), mood: 1 }; },
          },
          {
            id: "y_comeHome.talk", label: B.talk[0], hint: B.talk[1], act: "talk", style: "social", weight: 0.2,
            apply: (s2, c) => ({ text: c.w("{lead}你{did}，{{who}聽完沒說什麼，只叫你照顧好身體。|{who}說你自己決定就好，家裡不用擔心。}", did("talk")), mood: 1 }),
          },
          {
            id: "y_comeHome.invite", label: B.invite[0], hint: B.invite[1], act: "travel", style: "family", weight: 0.1,
            apply: (s2, c) => { spend(s2, 0.01); return { text: c.w("{lead}你{did}，{{who}看了你住的地方，終於放心了一點。|{who}嫌你的房間太小，卻偷偷幫你把冰箱塞滿。}", did("invite")), mood: 3 }; },
          },
          {
            id: "y_comeHome.stay", label: B.stay[0], hint: B.stay[1], act: "insist", style: "self", weight: 0.13,
            apply: (s2, c) => ({ text: c.w(sc.phone ? "{lead}你{did}，{{who}嘆了一口氣，沒有再提。|電話那頭沉默了很久，最後只說了一句顧好身體。}" : "{lead}你{did}，{{who}嘆了一口氣，沒有再提。|{who}沉默了很久，最後只說了一句顧好身體。}", did("stay")), mood: -1 }),
          },
        ],
      };
    },
  },
  {
    id: "y_rent", once: true, domain: "move", channel: "change", ages: [20, 30], when: s => working(s) && s.home !== "own",
    p: s => (s.flags.movedNorth === s.age || s.last.move === s.age || s.last.firstJob === s.age ? 0.12 : 0.025),
    choice: (s, ctx) => {
      const y = s.year, home = s.home === "parents", who = parentsWord(s);
      const find = y >= 2007 ? "在租屋網上滑了好幾個晚上" : "在電線桿上找「吉屋出租」的紅紙條";
      const near = { 製造: "工廠", 科技: "園區", 醫療: "醫院" }[s.job.field];
      // 「在{city}找房子」 with the story's {city}, written in here because the lead goes into other sentences as a value.
      const lead = home ? "上班以後想搬出去住" : ctx.f("在{city}找房子", { city: s.abroad || s.county || ctx.chart.input.place.name });
      return {
        prompt: home
          ? ctx.w(["上班以後，每天{通勤要一個多小時|要轉兩班車才到公司}，{你開始想搬出去住。|同事都在問你什麼時候要搬出來。}要怎麼安排？", "{住家裡很方便，|家裡說住家裡可以省很多錢，}但你也很想有自己的空間。要搬出去住嗎？"])
          : ctx.w(["剛到{city}工作，要找地方住。你{find}，{價錢和大小怎麼選都兩難。|看了好幾間，房東一個比一個難講話。}要租什麼樣的地方？", "租約快到期了，房東說要漲房租。在{city}找房子不容易，要怎麼辦？"], { find }),
        options: [
          {
            id: "y_rent.home", label: home ? "繼續住家裡" : "搬回家住", hint: "省房租，也有人照應", act: "moveHome", style: "family", weight: 0.3, when: s2 => parentsAlive(s2) && s2.county === s2.birthCounty,
            apply: (s2, c) => { s2.home = "parents"; s2.flags.y_rentKind = "home"; frugal(s2, 2); return { text: c.w("{lead}，你最後決定住家裡，{每個月拿一筆錢給{who}當生活費，|每天早一點出門通勤，}{存款比同事多了不少。|晚餐都有家裡的菜可以吃。}", { lead, who }), mood: 1 }; },
          },
          {
            id: "y_rent.room", label: "租雅房，浴室共用", hint: "最便宜", act: "save", style: "safe", weight: 0.2,
            apply: (s2, c) => { s2.home = "rent"; s2.flags.y_rentKind = "room"; frugal(s2, 1); return { text: c.w("{lead}，你租了一間{三坪|四坪}的雅房，{浴室要跟隔壁共用，|只放得下一張床和一張書桌，}{但房租便宜了一半。|每天下班回去只想躺平。}", { lead }), mood: 0 }; },
          },
          {
            id: "y_rent.studio", label: "租一間套房", hint: "貴一點，有自己的空間", act: "moveHome", style: "self", weight: 0.25,
            apply: (s2, c) => { s2.home = "rent"; s2.flags.y_rentKind = "studio"; spend(s2, 0.02); return { text: c.w("{lead}，你租了一間有{小陽台|對外窗|獨立衛浴}的套房，{房租占了薪水的三分之一，但終於有了自己的空間。|週末在家煮一鍋咖哩，你覺得這才是長大的感覺。|下班回家關上門，整個世界都安靜了。}", { lead }), mood: 2 }; },
          },
          {
            id: "y_rent.share", label: "和朋友分租一層公寓", hint: "熱鬧，也要互相包容", act: "socialize", style: "social", weight: 0.15,
            apply: (s2, c) => {
              s2.home = "rent"; s2.flags.y_rentKind = "share";
              const f = friendOf(s2, c, { sex: s2.sex }); bond(f, 0.05);
              return { text: c.w("{lead}，你和{f}合租了一層老公寓，{客廳是大家的，冰箱門上貼滿了分帳的便利貼。|週末常常一起煮火鍋、看電影。|為了誰洗碗吵過幾次，但大多時候很開心。}", { lead, f: friendIntro(f, c) }), mood: 2 };
            },
          },
          {
            id: "y_rent.far", label: "租遠一點，空間大一點", hint: "通勤比較久", act: "moveHome", style: "risk", weight: 0.2,
            apply: (s2, c) => { s2.home = "rent"; s2.flags.y_rentKind = "far"; return { text: c.w("{lead}，你租在比較遠的{郊區|山邊|鄉下}，{房子大了一倍，還有一個小陽台，|房租便宜，空間又大，}{每天通勤要一個小時。|你在陽台種了幾盆花。}", { lead }), mood: 1 }; },
          },
          {
            id: "y_rent.dorm", label: "住公司宿舍", hint: "省錢省時間", act: "save", style: "safe", weight: 0.1, when: () => !!near,
            apply: (s2, c) => { s2.home = "rent"; s2.flags.y_rentKind = "dorm"; frugal(s2, 2); return { text: c.w("{lead}，你申請了公司宿舍，{四個人一間，下班後室友就是同事。|離{near}走路只要五分鐘，}{省下了房租和通勤時間。|生活很單純：上班、吃飯、睡覺。}", { lead, near }), mood: 0 }; },
          },
        ],
      };
    },
  },
  {
    // 租屋遇到難搞的房東：東西壞了不修、退租扣押金、提早收回房子、不讓房客申請補貼、自己開門進來。
    id: "y_landlord", once: true, domain: "move", channel: "bad", ages: [21, 30], when: s => working(s) && s.home === "rent", p: () => 0.08,
    choice: (s, ctx) => {
      const y = s.year, lord = ctx.rng.pick(["他", "她"]);
      const broken = ctx.rng.pick([...(y >= 1990 ? ["冷氣壞了"] : []), ...(y >= 1975 ? ["熱水器壞了"] : []), "天花板在漏水"]);
      const helper = parentsAlive(s) ? parentsWord(s) : "懂法律的朋友";
      const base = {
        talk: ["好好跟房東溝通", "說不定講開就好", "好好跟房東溝通"],
        yield: ["算了，自己處理", "不想吵", "決定自己處理"],
        evidence: ["照合約來，寄存證信函", "照規矩來", "拿出合約，寄了一封存證信函給房東"],
        move: ["乾脆搬家", "換個房東", "決定不續租，另外找房子"],
        help: [ctx.f("找{helper}幫忙", { helper }), "有人撐腰比較好說話", ctx.f("請{helper}陪你去跟房東談", { helper })],
      };
      // What goes wrong, and how it turns out when you push back: good and bad, each {lead}你{what you did}，….
      const sc = sceneOf(s, ctx, "y_landlord", [
        { key: "repair", lead: ctx.f("租的房子{broken}，房東一直不來修，", { broken }),
          prompt: "租的房子{broken}，你打給房東好幾次，房東都說過兩天，{一拖就是兩個禮拜。|最後乾脆不接電話。}要怎麼辦？",
          good: "{lead}你{did}，{隔天房東就找了師傅來修。|房東不好意思地說最近太忙，週末就來修好了。}", bad: "{lead}你{did}，{房東嘴上答應，還是一拖再拖。|房東說是你用壞的，要你自己出錢。}",
          o: { yield: ["自己花錢找師傅修", "不想吵", "自己花錢找了師傅來修"], evidence: ["拍照存證，寄存證信函", "照規矩來", "拍照存證，寄了一封存證信函給房東"] } },
        { key: "deposit", lead: "退租前房東要扣押金，",
          prompt: y >= 1990
            ? "租約快到期了，房東先放話說{牆上的釘孔|地板的刮痕|冷氣的清潔費}都要從押金扣，兩個月的押金可能拿不回來。要怎麼辦？"
            : "租約快到期了，房東先放話說{牆上的釘孔|地板的刮痕}都要從押金扣，兩個月的押金可能拿不回來。要怎麼辦？",
          good: "{lead}你{did}，{房東最後只扣了一點清潔費。|房東看了看，說那就算了，押金全退。}", bad: "{lead}你{did}，{房東還是扣了一個月的押金。|押金只拿回一半。}",
          o: {
            yield: ["認了，讓房東扣", "不想吵", "認了，讓房東扣"],
            evidence: [y >= 1980 ? "拿出入住時拍的照片對質" : "拿出合約一條一條對", "照規矩來", y >= 2005 ? "拿出入住時用手機拍的照片對質" : y >= 1980 ? "拿出入住時拍的照片對質" : "拿出合約一條一條跟房東對"],
            move: ["不耗了，另外找房子", "換個房東", "決定不跟房東耗了，另外找房子"],
          } },
        { key: "takeback", lead: "房東要你提前搬走，",
          prompt: "房東說房子{why}，要你兩個月內搬走，可是租約還有半年。要怎麼辦？", why: ctx.rng.pick(["要賣了", "要收回來給兒子結婚住"]),
          good: "{lead}你{did}，{房東答應讓你住到找到新房子，還退了一個月的房租。|房東答應補你一筆搬家費。}", bad: "{lead}你{did}，{房東不肯讓步，你只好趕快找房子。|房東說合約上沒寫，一毛都不補。}",
          o: {
            talk: ["跟房東談，住到找到房子", "說不定講開就好", "跟房東好好談，請房東讓你住到找到房子"],
            yield: ["算了，馬上找房子", "不想吵", "沒有多說什麼，馬上開始找房子"],
            evidence: ["照合約要求搬家補償", "照規矩來", "拿出租約，要求房東照規定補償"],
            move: ["趁機換一個更好的地方", "換個環境", "乾脆趁機換一個更好的地方"],
          } },
        y >= 2008 && { key: "subsidy", lead: "想申請租屋補貼，房東卻說要漲房租，",
          prompt: "你想申請租屋補貼，房東一聽就說，要報稅的話房租要漲兩千。要怎麼辦？",
          good: "{lead}你{did}，{房東想了想，答應照原價讓你申請。|兩個人各退一步，只漲了五百。}", bad: "{lead}你{did}，{房東堅持要漲，你只好放棄補貼。|房東說不要就搬走，你只好作罷。}",
          o: {
            yield: ["放棄補貼，照原價租", "不想吵", "放棄了補貼，照原價繼續租"],
            evidence: ["照規定申請，不怕房東", "照規矩來", "照規定把申請送了出去"],
            move: ["找願意報稅的房東", "換個房東", "開始找願意讓房客申請補貼的房子"],
          } },
        { key: "barge", lead: "房東常常自己開門進來，",
          prompt: y >= 1990
            ? "房東常常沒先說一聲，就用備份鑰匙開門進來{檢查冷氣|看看房子}，有一次你下班回家，發現{lord}就站在你的房間裡。要怎麼辦？"
            : "房東常常沒先說一聲，就用備份鑰匙開門進來看看房子，有一次你下班回家，發現{lord}就站在你的房間裡。要怎麼辦？",
          good: y >= 2000 ? "{lead}你{did}，{房東道了歉，答應以後先打電話。|房東有點尷尬，之後都會先傳訊息。}" : "{lead}你{did}，{房東道了歉，答應以後先打電話。|房東有點尷尬，之後都會先打電話。}",
          bad: "{lead}你{did}，{房東說房子是{lord}的，愛什麼時候來就什麼時候來。|房東嘴上答應，下個月又自己開門進來。}",
          o: {
            yield: ["自己加一道門鍊", "不想吵", "自己花錢在門內加了一道門鍊"],
            evidence: ["寄存證信函，要求先通知", "照規矩來", "寄了一封存證信函，要求房東進門前先通知"],
          } },
      ]);
      const B = buttonsOf(base, sc), did = k => ({ lead: sc.lead, did: B[k][2], lord });
      return {
        prompt: ctx.w(sc.prompt, { broken, why: sc.why, lord }),
        options: [
          {
            id: "y_landlord.talk", label: B.talk[0], hint: B.talk[1], act: "talk", style: "social", weight: 0.3,
            apply: (s2, c) => (c.roll("move", "good", 0.5) ? { text: c.w(sc.good, did("talk")), mood: 2 } : { text: c.w(sc.bad, did("talk")), mood: -2 }),
          },
          {
            id: "y_landlord.yield", label: B.yield[0], hint: B.yield[1], act: "reconcile", style: "safe", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.01); return { text: c.w("{lead}你{did}，{花了一點錢，換來耳根清靜。|你在記事本上寫下：下次租房子，合約要先看清楚。}", did("yield")), mood: -1 }; },
          },
          {
            id: "y_landlord.evidence", label: B.evidence[0], hint: B.evidence[1], act: "dispute", style: "risk", weight: 0.15,
            apply: (s2, c) => (c.roll("move", "good", 0.55) ? { text: c.w(sc.good, did("evidence")), mood: 3 } : { text: c.w(sc.bad, did("evidence")), mood: -2 }),
          },
          {
            id: "y_landlord.move", label: B.move[0], hint: B.move[1], act: "moveHome", style: "self", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.01); return { text: c.w(y >= 2007
              ? "{lead}你{did}，在租屋網上滑了好幾個晚上，{找到一間{房東很好相處|採光很好}的新住處。|搬家那天，朋友來幫忙扛了一整天。}"
              : "{lead}你{did}，{在電線桿上找「吉屋出租」的紅紙條|跑了好幾個週末看房子}，{找到一間{房東很好相處|採光很好}的新住處。|搬家那天，朋友來幫忙扛了一整天。}", did("move")), mood: 1 }; },
          },
          {
            id: "y_landlord.help", label: B.help[0], hint: B.help[1], act: "seekHelp", style: "family", weight: 0.15,
            apply: (s2, c) => (c.roll("move", "good", 0.6) ? { text: c.w(sc.good, did("help")), mood: 2 } : { text: c.w(sc.bad, did("help")), mood: -1 }),
          },
        ],
      };
    },
  },
  {
    // 合租的室友：想養寵物、另一半常來過夜、電費怎麼分、作息。一個人住套房、和另一半同住、已婚的人不會遇到。
    id: "y_flatmate", once: true, ages: [22, 30],
    when: s => working(s) && s.home === "rent" && s.rel !== "married" && !["studio", "far", "dorm"].includes(s.flags.y_rentKind) && !(dating(s) && s.flags.y_cohabit === s.partner.id),
    p: s => (["share", "room"].includes(s.flags.y_rentKind) ? 0.16 : 0.1),
    choice: (s, ctx) => {
      const y = s.year, f = friendOf(s, ctx, { sex: s.sex, how: "室友" }), name = f.call, ta = pronoun(f);
      const mate = f.how === "室友" ? ctx.f("室友{name}", { name }) : /鄰居/.test(f.how || "") ? ctx.f("和你合租的老朋友{name}", { name }) : ctx.f("和你合租的{intro}", { intro: friendIntro(f, ctx) });
      const pet = ctx.rng.pick(["貓", "狗"]), other = f.sex === "male" ? "女朋友" : "男朋友";
      const [noise, noisy] = ctx.rng.pick([["換到夜班，半夜回家總是乒乒乓乓", "半夜回家總是很吵"], y >= 2000 ? ["迷上了線上遊戲，半夜還在大聲叫喊", "半夜打電動很吵"] : ["常常帶朋友回來，聊到半夜", "常常帶朋友回來聊到半夜"], ...(y >= 2016 ? [["開始在房間開直播，一講就到半夜", "半夜開直播很吵"]] : [])]);
      // [label, hint, what you did and how it went] per option, whole sentences after the scene's lead ({lead}你…);
      // talk has [good, bad].
      const base = {
        talk: [ctx.f("找{name}好好談", { name }), "把在意的事說清楚", "{lead}你找{name}好好談，{name}點點頭，說以後會注意。", "{lead}你找{name}好好談，{name}聽完不太高興，兩個人尷尬了好幾天。"],
        deal: ["重新講好規則", "白紙黑字比較清楚", "{lead}你跟{name}重新講好規則，{寫好貼在冰箱上，大家都輕鬆多了。|一開始有點彆扭，後來也就習慣了。}"],
        yield: ["算了，退一步", "不想傷感情", "{lead}你決定退一步，{日子照過，倒也相安無事。|你在心裡記了一筆，但沒說出口。}"],
        avoid: ["不說破，各過各的", "不想起衝突", "{lead}你什麼都沒說，各過各的，{兩個人越來越少說話。|房子裡安靜了，心裡卻悶悶的。}"],
        move: ["自己搬出去", "換個環境", "{lead}你決定租約到期就搬走，{找到一間小套房，終於只有自己一個人。|搬走那天，{name}送了你一張卡片。}"],
        meal: [ctx.f("約{name}吃頓飯，好好聊", { name }), "熟了比較好說話", "{lead}你約{name}去吃了一頓{火鍋|熱炒}，{聊開之後，很多事都好說了。|你發現對方其實人很好。}"],
      };
      const sc = sceneOf(s, ctx, "y_flatmate", [
        y >= 1985 && { key: "pet", lead: ctx.f("{name}想養{pet}，", { name, pet }),
          prompt: pet === "貓" ? "{mate}說想養一隻貓，可是租約寫著不能養寵物，你也對貓毛有點過敏。要怎麼辦？" : "{mate}說想領養一隻流浪狗，可是租約寫著不能養寵物，你也怕狗叫吵到鄰居。要怎麼辦？",
          o: {
            talk: ["一起去問房東", "先把規矩問清楚", "{lead}你陪{name}去問房東，房東說只要不弄壞東西就可以，你們多付了一點清潔費。", "{lead}你陪{name}去問房東，房東一口回絕，{name}只好打消了念頭。"],
            deal: [ctx.f("講好{pet}不進你的房間", { pet }), "各退一步", "{lead}你跟{name}講好，{pet}不能進你的房間，費用{fta}自己出，{一開始有點彆扭，後來也就習慣了。|這樣的安排，兩個人都能接受。}"],
            yield: ["答應，自己多吸地板", "室友開心就好", "{lead}你答應了，還買了一台吸塵器，{後來那隻{pet}最愛睡在你的床上。|每天下班回家，{pet}都在門口等你。}"],
            avoid: ["不表態，各過各的", "不想起衝突", "{lead}你沒有正面回應，{{name}後來還是帶了一隻回來，你只好把房門關緊。|兩個人之間多了一點尷尬。}"],
            meal: [ctx.f("約{name}吃頓飯，好好聊", { name }), "熟了比較好說話", "{lead}你約{name}去吃了一頓{火鍋|熱炒}，{聊開之後，你們約好輪流餵食、輪流打掃。|{name}說等租約到期再養，你們還一起去看了收容所。}"],
          } },
        { key: "guest", lead: ctx.f("{name}的{other}常常來過夜，", { name, other }),
          prompt: "{mate}的{other}幾乎天天來過夜，{浴室早上要排隊，|冰箱裡的東西常常不見，}水電費卻還是兩個人分。要怎麼辦？",
          o: {
            talk: [ctx.f("找{name}好好談", { name }), "把在意的事說清楚", "{lead}你找{name}好好談，{name}不好意思地說會注意，之後來的次數少了一半。", "{lead}你找{name}好好談，{name}覺得你想太多，兩個人尷尬了好幾天。"],
            deal: ["提議水電改成三個人分", "按人頭算比較公平", "{lead}你提議水電費改成三個人分，{對方爽快答應，還買了一台新的吹風機放在浴室。|大家把帳記在冰箱門上，誰也不吃虧。}"],
            yield: ["算了，睜一隻眼閉一隻眼", "不想傷感情", "{lead}你決定睜一隻眼閉一隻眼，{早上改成提早半小時起床洗澡。|日子照過，只是有時候覺得自己像客人。}"],
            avoid: ["戴上耳機，少待在客廳", "不想起衝突", "{lead}你回家就待在自己房間，戴上耳機，{客廳漸漸變成了他們兩個人的地方。|你跟{name}的話越來越少。}"],
            meal: ["約三個人一起吃頓飯", "熟了比較好說話", "{lead}你約了{name}和{fta}的{other}一起吃火鍋，{聊開之後，對方主動說要分攤水電。|你發現對方其實人很好，相處起來也沒那麼難。}"],
          } },
        { key: "bill", lead: y >= 1990 ? ctx.f("電費要平分，{name}卻天天開整晚冷氣，", { name }) : ctx.f("電話費要平分，{name}卻常打長途電話，", { name }),
          prompt: y >= 1990
            ? "夏天的電費單來了，{name}的房間冷氣天天開整晚，帳單卻要平分，你這個月多付了{一千多|快兩千}塊。要怎麼辦？"
            : "電話費的帳單來了，{name}常常打長途電話回家，帳單卻要平分。要怎麼辦？",
          o: {
            talk: [ctx.f("找{name}好好談", { name }), "把在意的事說清楚", "{lead}你找{name}好好談，{name}說之前沒想到，主動多付了一些。", "{lead}你找{name}好好談，{name}覺得你太計較，兩個人冷了好幾天。"],
            deal: [y >= 1990 ? "裝分電錶，各付各的" : "各自記下打的電話", "按用量算比較公平", y >= 1990
              ? "{lead}你找人來裝了分電錶，各付各的，{從此帳單一目了然，誰也不吃虧。|多花了一點功夫，換來耳根清靜。}"
              : "{lead}你在電話旁邊放了一本簿子，各自記下打的長途電話，{從此帳單一目了然，誰也不吃虧。|多花了一點功夫，換來耳根清靜。}"],
            yield: ["算了，多付一點沒關係", "不想傷感情", "{lead}你決定多付一點就算了，{反正一個月也沒差多少。|你在心裡記了一筆，但沒說出口。}"],
            avoid: ["不說破，自己省著用", "不想起衝突", y >= 1990
              ? "{lead}你什麼都沒說，只是自己出門前一定關冷氣，{帳單還是一樣高。|你開始在外面待到很晚才回家。}"
              : "{lead}你什麼都沒說，自己少打一點電話，{帳單還是一樣高。|你開始在外面待到很晚才回家。}"],
            meal: [ctx.f("約{name}吃宵夜，順便提起", { name }), "熟了比較好說話", "{lead}你約{name}去吃宵夜，邊吃邊提起帳單，{{name}笑著說早說嘛，之後主動多付了一些。|兩個人邊吃邊算，把分帳的方式講好了。}"],
          } },
        { key: "noise", lead: ctx.f("{name}{noisy}，", { name, noisy }),
          prompt: "{mate}{noise}，你已經好幾個晚上沒睡好。要怎麼辦？",
          o: {
            talk: [ctx.f("找{name}好好談", { name }), "把在意的事說清楚", "{lead}你找{name}好好談，{name}答應十二點以後會小聲一點，還送了你一副耳塞賠罪。", "{lead}你找{name}好好談，{name}說會注意，過了兩個禮拜又恢復原狀。"],
            deal: ["訂幾條室友公約", "白紙黑字比較清楚", "{lead}你提議訂幾條室友公約，貼在冰箱上，{十二點以後保持安靜，雖然有點好笑，倒是真的有用。|大家都簽了名，吵的時候指一指公約就好。}"],
            yield: [ctx.f("配合{name}的作息", { name }), "不想傷感情", "{lead}你把自己的作息往後挪，配合{name}，{你們開始一起吃宵夜，反而變得很熟。|雖然累了一點，倒也相安無事。}"],
            avoid: ["戴耳塞，各過各的", "不想起衝突", "{lead}你買了耳塞和眼罩，各過各的，{兩個人越來越少說話。|房子安靜了一點，心裡卻悶悶的。}"],
            meal: [ctx.f("約{name}吃頓飯，順便聊聊", { name }), "熟了比較好說話", "{lead}你約{name}去吃了一頓{火鍋|熱炒}，{聊開之後，{name}主動說平日會早點收工。|你們講好了平日晚上的安靜時間。}"],
          } },
      ]);
      const B = buttonsOf(base, sc), v = { lead: sc.lead, name, fta: ta, pet, other };
      const share = s2 => { if (s2.flags.y_rentKind !== "studio") s2.flags.y_rentKind = "share"; };
      return {
        prompt: ctx.w(sc.prompt, { mate, other, name, noise }),
        options: [
          {
            id: "y_flatmate.talk", label: B.talk[0], hint: B.talk[1], act: "talk", style: "social", weight: 0.25,
            apply: (s2, c) => { share(s2); const ok = c.rng() < 0.55; if (ok) bond(f, 0.05); return { text: c.w(ok ? B.talk[2] : B.talk[3], v), mood: ok ? 2 : -2 }; },
          },
          {
            id: "y_flatmate.deal", label: B.deal[0], hint: B.deal[1], act: "negotiate", style: "self", weight: 0.2,
            apply: (s2, c) => { share(s2); return { text: c.w(B.deal[2], v), mood: 1 }; },
          },
          {
            id: "y_flatmate.yield", label: B.yield[0], hint: B.yield[1], act: "reconcile", style: "family", weight: 0.15,
            apply: (s2, c) => { share(s2); bond(f, 0.03); return { text: c.w(B.yield[2], v), mood: sc.key === "pet" ? 2 : 0 }; },
          },
          {
            id: "y_flatmate.avoid", label: B.avoid[0], hint: B.avoid[1], act: "avoid", style: "safe", weight: 0.15,
            apply: (s2, c) => { share(s2); bond(f, -0.05); return { text: c.w(B.avoid[2], v), mood: -1 }; },
          },
          {
            id: "y_flatmate.move", label: B.move[0], hint: B.move[1], act: "moveHome", style: "risk", weight: 0.1,
            apply: (s2, c) => { s2.flags.y_rentKind = "studio"; spend(s2, 0.01); return { text: c.w(B.move[2], v), mood: 0 }; },
          },
          {
            id: "y_flatmate.meal", label: B.meal[0], hint: B.meal[1], act: "socialize", style: "social", weight: 0.15,
            apply: (s2, c) => { share(s2); bond(f, 0.08); return { text: c.w(B.meal[2], v), mood: 2 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_firstSavings", once: true, domain: "wealth", channel: "good", ages: [20, 30], when: s => working(s) && s.savings >= 0.25 && s.savings < 0.8, p: () => 0.08,
    choice: (s, ctx) => {
      const y = s.year, who = parentsWord(s), months = Math.max(2, Math.round((s.savings / Math.max(0.3, s.income)) * 12));
      const item = ctx.w(y < 1980 ? "{一台相機|一套好西裝|一台手提收音機}" : y < 1990 ? "{一台相機|一台隨身聽|一套好西裝}" : y < 1998 ? "{一套音響|一台 CD 隨身聽|一台單眼相機}" : y < 2010 ? "{一台數位相機|一台筆電|一支新手機}" : "{一台筆電|一支新手機|一台微單眼}");
      // What the first investment was, and how it went, told the same way (a 會 is not a stock). Before 1986 it is one
      // thing ({how}) and one result; later a {甲|乙} choice of the era ({h1}, {h2}), with results of their own.
      const hui = y < 1986 && ctx.rng() < 0.5, old = y < 1986;
      const how = hui ? "跟了一個會" : "買了一點股票";
      const [h1, h2] = y < 2003 ? ["開始買股票", "買了一檔基金"] : y < 2015 ? ["開始定期定額買 0050", "買了一檔基金"] : ["開始定期定額買 ETF", "學人家存股"];
      const gain = hui ? "一年下來多了一點利息。" : "股票漲了一些，你很開心。";
      const loss = hui ? "後來會頭跑了，被倒了一筆會錢。" : "後來股票跌了，賠了一點。";
      const bday = s.father.alive && s.mother.alive ? ctx.rng.pick(["媽媽", "爸爸"]) : who;
      const [i1, i2] = y >= 1990 ? ["醫療險", "意外險"] : ["壽險", "意外險"], subj = y >= 2000 ? "程式" : "會計";
      // [label, hint, what you did]; what you did is null when it is a choice of its own, told in the templates below.
      const base = {
        keep: ["繼續存，放定存", "安心最重要", null],
        invest: ["開始投資", "可能賺，也可能賠", ctx.f("拿一部分{how}", { how })],
        parents: [ctx.f("包紅包給{who}", { who }), "謝謝家裡的照顧", ctx.f("包了一個紅包給{who}", { who })],
        treat: ["犒賞自己", "辛苦這麼久了", ctx.f("犒賞自己買了{item}", { item })],
        insure: ["買保險", "以防萬一", null],
        course: ["拿去進修", "投資自己", null],
      };
      // Where you notice the money: a passbook or a banking app, the year-end bonus, colleagues talking about
      // investing, something you have wanted for months, a parent's birthday, or a bank clerk with brochures.
      const sc = sceneOf(s, ctx, "y_firstSavings", [
        { key: "book", lead: y < 2012 ? "看著存摺上第一筆像樣的存款，" : "看著網銀上第一筆像樣的存款，",
          prompt: y < 2012
            ? "{到郵局|到銀行}刷了存摺，最後一行的數字差不多是 {months} 個月的薪水，是你工作以來存過最多的一次。要怎麼用這筆錢？"
            : "打開網銀 App，帳戶的餘額差不多是 {months} 個月的薪水，是你工作以來存過最多的一次。要怎麼用這筆錢？" },
        employee(s) && { key: "bonus", lead: "年終入帳，",
          prompt: "年終獎金入帳了，加上平常省下來的，帳戶裡第一次有了差不多 {months} 個月薪水的存款。要怎麼用這筆錢？",
          o: {
            keep: ["全部存進定存", "安心最重要", "把年終全部存進定存"],
            invest: ["拿年終開始投資", "可能賺，也可能賠", ctx.f("拿年終的一部分{how}", { how })],
            parents: [ctx.f("包一個大紅包給{who}過年", { who }), "謝謝家裡的照顧", ctx.f("過年包了一個大紅包給{who}", { who })],
            treat: ["用年終犒賞自己", "辛苦一整年了", ctx.f("用年終犒賞自己，買了{item}", { item })],
            insure: ["拿一部分年終買保險", "以防萬一", null],
            course: ["拿年終去報名課程", "投資自己", null],
          } },
        { key: "lunch", lead: "聽同事聊投資，才想起自己的錢一直放在活存，",
          prompt: y < 1986 ? "午休吃便當時，同事們在聊{跟會|標會}，你才想到自己存了快 {months} 個月薪水的錢，一直放在活存裡。要怎麼辦？"
            : y < 2003 ? "午休吃便當時，同事們在聊{股票|基金}，你才想到自己存了快 {months} 個月薪水的錢，一直放在活存裡。要怎麼辦？"
              : y < 2015 ? "午休吃便當時，同事們在聊{基金|0050}，你才想到自己存了快 {months} 個月薪水的錢，一直放在活存裡。要怎麼辦？"
                : "午休吃便當時，同事們在聊{ETF|存股}，你才想到自己存了快 {months} 個月薪水的錢，一直放在活存裡。要怎麼辦？",
          o: {
            keep: ["還是放定存最安心", "不跟風", null],
            invest: [y < 1986 ? "跟同事一起試試看" : y < 2003 ? "跟著同事開證券戶" : "跟著同事定期定額", "可能賺，也可能賠", ctx.f("跟著同事{how}", { how })],
            parents: [ctx.f("不跟風，先包紅包給{who}", { who }), "謝謝家裡的照顧", ctx.f("沒有跟風，先包了一個紅包給{who}", { who })],
            treat: ["不跟風，拿一點犒賞自己", "辛苦這麼久了", ctx.f("沒有跟風，拿一點犒賞自己，買了{item}", { item })],
            insure: ["先把保險買齊", "以防萬一", null],
            course: ["與其投資，不如投資自己", "拿去進修", null],
          } },
        { key: "wish", lead: ctx.f("想要{item}很久了，存款終於夠了，", { item }),
          prompt: y >= 2000
            ? "{item}你已經想了好久，{每次經過店門口都會多看兩眼|在網路上比價比了好幾個月}，現在存款有 {months} 個月的薪水，買得起了。要怎麼用這筆錢？"
            : "{item}你已經想了好久，{每次經過店門口都會多看兩眼|型錄都快翻爛了}，現在存款有 {months} 個月的薪水，買得起了。要怎麼用這筆錢？",
          o: {
            keep: ["忍住，繼續存", "錢留著比較安心", null],
            invest: ["先拿去投資，賺了再買", "可能賺，也可能賠", ctx.f("先拿一部分{how}，想說賺了再買", { how })],
            parents: [ctx.f("先包個紅包給{who}", { who }), "謝謝家裡的照顧", ctx.f("先包了一個紅包給{who}", { who })],
            treat: ["買下它，犒賞自己", "想了這麼久了", "終於把它買回家"],
            insure: ["先買保險，比較實際", "以防萬一", null],
            course: ["拿去上課，東西以後再買", "投資自己", null],
          } },
        parentsAlive(s) && { key: "family", lead: ctx.f("{bday}的生日快到了，", { bday }),
          prompt: "{bday}的生日快到了，你算了算，存款已經有 {months} 個月的薪水，第一次覺得自己有能力為家裡做點什麼。要怎麼用這筆錢？",
          o: {
            keep: ["先存起來，以後再孝順", "錢留著比較安心", null],
            invest: ["拿去投資，讓錢變多一點", "可能賺，也可能賠", ctx.f("拿一部分{how}", { how })],
            parents: [ctx.f("包一個大紅包給{bday}", { bday }), "謝謝家裡的照顧", ctx.f("包了一個大紅包給{bday}", { bday })],
            treat: ["禮物買小一點，先犒賞自己", "辛苦這麼久了", ctx.f("買了一個小禮物給{bday}，再犒賞自己買了{item}", { bday, item })],
            insure: ["幫自己買保險，不讓家裡擔心", "以防萬一", null],
            course: ["拿去進修，讓家裡放心", "投資自己", null],
          } },
        y >= 1995 && { key: "banker", lead: "銀行的理專一直推銷，",
          prompt: "去銀行辦事，櫃台的理專看了你的存款（差不多 {months} 個月的薪水），熱心地拿出一疊{基金|保單|外幣定存}的資料。要怎麼用這筆錢？",
          o: {
            keep: ["只要台幣定存就好", "安心最重要", "只開了一個台幣定存"],
            invest: ["聽理專的，買一檔基金", "可能賺，也可能賠", "買了一檔理專推薦的基金"],
            parents: [ctx.f("領一筆出來包給{who}", { who }), "謝謝家裡的照顧", ctx.f("領了一筆出來，包了一個紅包給{who}", { who })],
            treat: ["領一筆出來犒賞自己", "辛苦這麼久了", ctx.f("領了一筆出來，犒賞自己買了{item}", { item })],
            insure: ["買理專推薦的保單", "以防萬一", null],
            course: ["領出來報名課程", "投資自己", null],
          } },
      ]);
      const B = buttonsOf(base, sc), k = sc.key, lead = sc.lead;
      const v = { lead, did: null, h1, h2, i1, i2, subj, rate: y < 2000 ? "那時候的定存利息很不錯，" : "雖然利息少得可憐，" };
      const did = k2 => ({ ...v, did: B[k2][2] });
      // What you did when it is a choice of its own, with how it went: {lead}你…，….
      const KEEP = {
        book: "{lead}你{全部放進定存|另外開了一個只存不領的帳戶}，{rate}{你告訴自己這是以後的頭期款。|每個月薪水一進來，就先轉一筆過去。}",
        lunch: "{lead}你還是{全部放進定存|另外開了一個只存不領的帳戶}，{rate}{你告訴自己這是以後的頭期款。|每個月薪水一進來，就先轉一筆過去。}",
        wish: "{lead}你忍住沒買，{全部放進定存|另外開了一個只存不領的帳戶}，{rate}{你告訴自己這是以後的頭期款。|每個月薪水一進來，就先轉一筆過去。}",
        family: "{lead}你把錢{全部放進定存|另外存進一個只存不領的帳戶}，只買了一個小蛋糕，{rate}{你告訴自己這是以後的頭期款。|每個月薪水一進來，就先轉一筆過去。}",
      };
      const GAIN = {
        book: "{lead}你拿一部分{{h1}|{h2}}，{一年下來賺了一點，|帳面上漲了一些，}{開始每天看盤。|覺得自己懂了一點理財。}",
        bonus: "{lead}你拿年終的一部分{{h1}|{h2}}，{一年下來賺了一點，|帳面上漲了一些，}{開始每天看盤。|覺得自己懂了一點理財。}",
        lunch: "{lead}你跟著同事{{h1}|{h2}}，{一年下來賺了一點，|帳面上漲了一些，}{開始每天看盤。|覺得自己懂了一點理財。}",
        wish: "{lead}你先拿一部分{{h1}|{h2}}，想說賺了再買，{一年下來賺了一點，|帳面上漲了一些，}{開始每天看盤。|覺得自己懂了一點理財。}",
        banker: "{lead}你{did}，{一年下來賺了一點，|帳面上漲了一些，}{開始每天看盤。|覺得自己懂了一點理財。}",
      };
      const LOSS = {
        book: "{lead}你拿一部分{{h1}|{h2}}，{結果遇到大跌，帳面一片綠油油。|賠了一點，學到了「風險」兩個字怎麼寫。}",
        bonus: "{lead}你拿年終的一部分{{h1}|{h2}}，{結果遇到大跌，帳面一片綠油油。|賠了一點，學到了「風險」兩個字怎麼寫。}",
        lunch: "{lead}你跟著同事{{h1}|{h2}}，{結果遇到大跌，帳面一片綠油油。|賠了一點，學到了「風險」兩個字怎麼寫。}",
        wish: "{lead}你先拿一部分{{h1}|{h2}}，想說賺了再買，{結果遇到大跌，帳面一片綠油油。|賠了一點，學到了「風險」兩個字怎麼寫。}",
        banker: "{lead}你{did}，{結果遇到大跌，帳面一片綠油油。|賠了一點，學到了「風險」兩個字怎麼寫。}",
      };
      GAIN.family = GAIN.book; LOSS.family = LOSS.book;
      const INSURE = {
        book: "{lead}你請{當保險業務員的同學|做保險的親戚}幫你規劃了{{i1}|{i2}}，{每個月多了一筆保費，|雖然有點心疼，}{心裡踏實多了。|你把保單收進了資料夾。}",
        bonus: "{lead}你拿一部分年終，請{當保險業務員的同學|做保險的親戚}幫你規劃了{{i1}|{i2}}，{每個月多了一筆保費，|雖然有點心疼，}{心裡踏實多了。|你把保單收進了資料夾。}",
        lunch: "{lead}你先請{當保險業務員的同學|做保險的親戚}幫你把{{i1}|{i2}}買齊，{每個月多了一筆保費，|雖然有點心疼，}{心裡踏實多了。|你把保單收進了資料夾。}",
        wish: "{lead}你先請{當保險業務員的同學|做保險的親戚}幫你規劃了{{i1}|{i2}}，{每個月多了一筆保費，|雖然有點心疼，}{心裡踏實多了。|你把保單收進了資料夾。}",
        family: "{lead}你請{當保險業務員的同學|做保險的親戚}幫自己規劃了{{i1}|{i2}}，免得家裡擔心，{每個月多了一筆保費，|雖然有點心疼，}{心裡踏實多了。|你把保單收進了資料夾。}",
        banker: "{lead}你買了理專推薦的{{i1}|{i2}}，{每個月多了一筆保費，|雖然有點心疼，}{心裡踏實多了。|你把保單收進了資料夾。}",
      };
      const COURSE = {
        book: "{lead}你報名了{英文|日文|{subj}|證照}課，{下班後去補習班上課。|週末都在教室度過。}",
        bonus: "{lead}你拿年終報名了{英文|日文|{subj}|證照}課，{下班後去補習班上課。|週末都在教室度過。}",
        wish: "{lead}你把錢拿去報名了{英文|日文|{subj}|證照}課，{下班後去補習班上課。|週末都在教室度過。}",
        banker: "{lead}你領了一筆出來，報名了{英文|日文|{subj}|證照}課，{下班後去補習班上課。|週末都在教室度過。}",
      };
      COURSE.lunch = COURSE.book; COURSE.family = COURSE.book;
      return {
        prompt: ctx.w(sc.prompt, { months, item, bday }),
        options: [
          {
            id: "y_firstSavings.keep", label: B.keep[0], hint: B.keep[1], act: "save", style: "safe", weight: 0.25,
            apply: (s2, c) => { frugal(s2, 2); return { text: c.w(B.keep[2] ? "{lead}你{did}，{rate}{你告訴自己這是以後的頭期款。|每個月薪水一進來，就先轉一筆過去。}" : KEEP[k], did("keep")), mood: 1 }; },
          },
          {
            id: "y_firstSavings.invest", label: B.invest[0], hint: B.invest[1], act: "invest", style: "risk", weight: 0.22,
            apply: (s2, c) => {
              const r = marketYear(y) + 0.15 * c.rng.normal();
              s2.savings = Math.max(0, s2.savings + 0.1 * r);
              if (old) return r >= 0 ? { text: c.w("{lead}你{did}，{result}", { ...did("invest"), result: gain }), mood: 3 } : { text: c.w("{lead}你{did}，{result}", { ...did("invest"), result: loss }), mood: -3 };
              return r >= 0 ? { text: c.w(GAIN[k], did("invest")), mood: 3 } : { text: c.w(LOSS[k], did("invest")), mood: -3 };
            },
          },
          {
            id: "y_firstSavings.parents", label: B.parents[0], hint: B.parents[1], act: "care", style: "family", weight: 0.15, when: s2 => parentsAlive(s2),
            apply: (s2, c) => { spend(s2, 0.04); return { text: c.w("{lead}你{did}，{them}{嘴上說不用，還是收進了抽屜。|拿去買了一台新電視，逢人就說是孩子買的。|帶你去吃了一頓好的，堅持要自己付錢。}", { ...did("parents"), them: k === "family" ? bday : who }), mood: 3 }; },
          },
          {
            id: "y_firstSavings.treat", label: B.treat[0], hint: B.treat[1], act: "hobby", style: "self", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.05); return { text: c.w("{lead}你{did}，{拆開的時候開心得像個孩子。|用了好多年都捨不得換。}", did("treat")), mood: 3 }; },
          },
          {
            id: "y_firstSavings.insure", label: B.insure[0], hint: B.insure[1], act: "insurance", style: "health", weight: 0.1,
            apply: (s2, c) => { s2.flags.insured = true; spend(s2, 0.02); return { text: c.w(INSURE[k], v), mood: 1 }; },
          },
          {
            id: "y_firstSavings.course", label: B.course[0], hint: B.course[1], act: "study", style: "learn", weight: 0.1,
            apply: (s2, c) => { spend(s2, 0.05); return { text: c.w(COURSE[k], v), mood: 1 }; },
          },
        ],
      };
    },
  },
  {
    // 被拉去聽直銷說明會：1980 年代的老鼠會、1990–2000 年代的直銷熱，到 2010 年代社群上的「微創業」。錢的進出都很小。
    id: "y_mlm", once: true, domain: "wealth", channel: "bad", ages: [19, 30],
    when: s => s.year >= 1985 && !s.abroad && (working(s) || inCollege(s)), p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year, work = working(s), who = parentsWord(s);
      // Who brings it: an old classmate over coffee, a colleague's seminar, a friend online, a stranger with a
      // questionnaire at the school gate, or an aunt with free gifts.
      const k = sceneOf(s, ctx, "y_mlm", [{ key: "coffee" }, { key: "seminar" }, y >= 2014 && { key: "online" }, inCollege(s) && { key: "campus" }, { key: "relative" }]).key;
      const item = ctx.rng.pick(y >= 2014 ? ["面膜", "保健食品", "咖啡"] : ["保健食品", "清潔用品", "保養品", ...(y >= 1995 ? ["淨水器"] : [])]);
      const f = k === "coffee" || k === "online" ? friendOf(s, ctx, { prefer: /國小|國中|高中|高職/, how: ctx.rng.pick(["國中同學", "高中同學"]) }) : null;
      // Someone the story names by who they are to you (同事, 阿姨) is "your co-worker" in English: {yourRole}.
      const role = k === "seminar" ? (work ? "同事" : "學長") : k === "relative" ? ctx.rng.pick(["阿姨", "表姊", "舅媽"]) : null;
      const host = f ? f.call : role ? ctx.f("{yourRole}", { yourRole: role }) : "對方", campus = k === "campus";
      const event = y >= 2012 ? "財富自由講座" : "成功人士分享會";
      const intro = f && friendIntro(f, ctx), fta = f && pronoun(f);
      const S = {
        coffee: { lead: ctx.f("{host}約你喝咖啡，原來是要拉你做直銷，", { host }), prompt: y < 1998
          ? "好久沒聯絡的{intro}突然打電話約你喝咖啡，到了才發現{fta}帶了一位「{學長|老師}」，桌上攤著一本{產品型錄|事業計畫書}。要怎麼辦？"
          : y < 2011
            ? "好久沒聯絡的{intro}突然傳簡訊約你喝咖啡，到了才發現{fta}帶了一位「{學長|老師}」，桌上攤著一本{產品型錄|事業計畫書}。要怎麼辦？"
            : "好久沒聯絡的{intro}突然傳 LINE 約你喝咖啡，到了才發現{fta}帶了一位「{學長|老師}」，桌上攤著一本{產品型錄|事業計畫書}。要怎麼辦？" },
        seminar: { lead: ctx.f("被{host}拉去聽了一場{event}，", { host, event }), prompt: "{host}邀你去{飯店的宴會廳|一間很氣派的辦公室}聽一場「{event}」，台上的講師說自己{兼差一年就買了雙B|下班兼職月入十萬}，台下的人一直拍手。要怎麼辦？" },
        online: { lead: ctx.f("{host}拉你當{item}的代理，", { host, item }), prompt: y >= 2016
          ? "{intro}在IG上天天分享{item}的「微創業」，私訊問你要不要一起當代理，說入門只要{兩萬|三萬}，{之後躺著也能賺。|業績好還能出國旅遊。}要怎麼辦？"
          : "{intro}在臉書上天天分享{item}的「微創業」，私訊問你要不要一起當代理，說入門只要{兩萬|三萬}，{之後躺著也能賺。|業績好還能出國旅遊。}要怎麼辦？" },
        campus: { lead: "填了一份問卷，就被帶去聽說明會，", prompt: "在校門口被一位拿著問卷的{學長|學姊}攔下來，填完問卷，就被帶去附近的辦公室聽「打工創業說明會」。要怎麼辦？" },
        relative: { lead: ctx.f("{host}拉你去聽{item}的說明會，", { host, item }), prompt: "{host}拉你去聽{item}的說明會，說去聽聽就好，還有送贈品。要怎麼辦？" },
      }[k];
      const online = k === "online", ask = y >= 1998 ? null : parentsAlive(s) ? who : "老朋友";
      const v = { lead: S.lead, host, item };
      return {
        prompt: ctx.w(S.prompt, { intro, fta, host, event, item }),
        options: [
          {
            id: "y_mlm.leave", label: online ? "婉拒，說自己先不用" : "婉拒，起身離開", hint: "不想浪費時間", act: "avoid", style: "safe", weight: 0.3,
            apply: (s2, c) => ({ text: c.w(online ? "{lead}你回了一句謝謝，說自己先不用，{之後{host}的貼文，你都默默滑過。|{host}沒有再私訊你，你也鬆了一口氣。}" : "{lead}你說還有事，起身先走了，{走出門的時候，你鬆了一口氣。|之後再收到類似的邀約，你都推說很忙。}", v), mood: 0 }),
          },
          {
            id: "y_mlm.listen", label: "聽完，但不簽也不買", hint: "聽聽看也無妨", act: "wait", style: "learn", weight: 0.25,
            apply: (s2, c) => ({ text: c.w(online
              ? "{lead}你答應去聽一場說明會，但什麼都沒簽，{講師講了兩個小時，你只記得「被動收入」四個字。|你拿了一疊資料回家，看完就收進抽屜。|對方追問了好幾次，你都說要再想想。}"
              : "{lead}你耐著性子聽完，但什麼都沒簽，{講師講了兩個小時，你只記得「被動收入」四個字。|你拿了一疊資料回家，看完就收進抽屜。|對方追問了好幾次，你都說要再想想。}", v), mood: 0 }),
          },
          {
            id: "y_mlm.face", label: "買一點產品給個面子", hint: "不想傷感情", act: "reconcile", style: "family", weight: 0.15,
            apply: (s2, c) => { spend(s2, 0.015); return { text: c.w(campus ? "{lead}你跟對方買了一點{item}，{那些{item}在櫃子裡放了好久。|東西其實還不錯，只是貴了一點。}" : "{lead}你跟{host}買了一點{item}，{那些{item}在櫃子裡放了好久。|東西其實還不錯，只是貴了一點。}", v), mood: 0 }; },
          },
          {
            id: "y_mlm.join", label: "加入試試看", hint: "說不定真的能賺", act: "sideJob", style: "risk", weight: 0.1,
            apply: (s2, c) => {
              if (c.roll("wealth", "good", 0.2)) { s2.savings += 0.01; return { text: c.w("{lead}你{繳了入會費|先進了一批貨}，加入試試看，{靠著親友捧場，幾個月下來竟然小賺了一點。|賺了一點，但你發現自己最會賣的對象是家人。}", v), mood: 1 }; }
              spend(s2, 0.03);
              return { text: c.w(y >= 1998
                ? "{lead}你{繳了入會費|先進了一批貨}，加入試試看，{最後只賣出幾樣，房間裡堆滿了箱子。|拉了好幾個朋友，大家漸漸不太回你的訊息。}{你在年底退出了。|那筆錢，就當是繳了學費。}"
                : "{lead}你{繳了入會費|先進了一批貨}，加入試試看，{最後只賣出幾樣，房間裡堆滿了箱子。|拉了好幾個朋友，大家漸漸不太接你的電話。}{你在年底退出了。|那筆錢，就當是繳了學費。}", v), mood: -3 };
            },
          },
          {
            id: "y_mlm.check", label: ask ? ctx.f("回去問問{ask}", { ask }) : "先上網查查這家公司", hint: "謹慎一點", act: "seekHelp", style: "learn", weight: 0.1,
            apply: (s2, c) => ({ text: !ask
              ? c.w("{lead}你說要回去想想，上網查了這家公司，{在{board}上看到一長串的經驗分享，|查到好幾則相關的新聞，}{你決定不碰。|之後再有人約，你都知道怎麼回絕了。}", { ...v, board: y >= 2005 ? "PTT" : "BBS" })
              : ask === "老朋友"
                ? c.w("{lead}你說要回去想想，問了老朋友，老朋友聽完直搖頭，說天下沒有白吃的午餐。", v)
                : c.w("{lead}你說要回去想想，問了{ask}，{ask}聽完直搖頭，說天下沒有白吃的午餐。", { ...v, ask }), mood: 1 }),
          },
          {
            id: "y_mlm.warn", label: campus ? "回去提醒同學小心" : ctx.f("勸{host}別陷得太深", { host }), hint: "說出來比較好", act: "talk", style: "social", weight: 0.1,
            apply: (s2, c) => {
              if (campus) return { text: c.w("{lead}你回去以後提醒同學小心，{隔天就有同學說自己也被攔過。|大家從此都繞過那個路口。}", v), mood: 1 };
              const ok = c.rng() < 0.5;
              if (f) bond(f, ok ? 0.05 : -0.05);
              return { text: ok
                ? c.w(y >= 2011 ? "{lead}你勸{host}別陷得太深，{後來{host}退出了，還特地傳訊息來謝謝你。|{host}沉默了一下，說會再想想。}" : "{lead}你勸{host}別陷得太深，{後來{host}退出了，還特地打電話來謝謝你。|{host}沉默了一下，說會再想想。}", v)
                : c.w("{lead}你勸{host}別陷得太深，{host}有點不高興，過了好幾個月才又跟你聯絡。", v), mood: ok ? 1 : -1 };
            },
          },
        ],
      };
    },
  },
  {
    // 花錢的誘惑，依年代：電器行的分期付款、百貨週年慶、網拍、刷卡分期、雙十一、團購群組。錢的進出都很小。
    id: "y_spree", once: true, domain: "wealth", channel: "bad", ages: [19, 30], when: s => working(s), p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year, who = parentsWord(s), card = y >= 1995, noodle = y >= 1975 ? "泡麵" : "陽春麵";
      const appliance = ctx.rng.pick(y < 1978 ? ["一台電視", "一台電風扇", "一台收音機"] : ["一台彩色電視", "一套立體音響", "一台錄放影機"]);
      const gadget = ctx.rng.pick(y < 2005 ? ["一台筆電", "一套音響", "一台單眼相機"] : ["一台新筆電", "一台單眼相機", "一個名牌包"]);
      const goods = ctx.rng.pick(["保養品", "球鞋", "皮鞋", "化妝品", "家電"]);
      // [label, hint, what you did]; null when what you did is a choice of its own, told in the templates below.
      const base = {
        wait: ["先回家想三天", "說不定就不想要了", "決定先回家想三天"],
        buy: ["買下去，犒賞自己", "辛苦工作就是為了這一刻", "一口氣買了下來"],
        installment: [card ? "刷卡分期" : "分期付款買下來", "每個月繳一點", card ? null : "分期付款買了下來"],
        budget: ["開始記帳，設一個預算", "看清楚錢花去哪", y >= 2012 ? "開始用手機的記帳 App記下每一筆開銷" : "開始在筆記本上記下每一筆開銷"],
        family: [ctx.f("改買{who}用得到的東西", { who }), "錢花在家人身上", ctx.f("改買了一樣{who}用得到的東西", { who })],
        cut: ["下班直接回家，不去逛", "眼不見為淨", "決定下班直接回家，不去逛"],
      };
      const sc = sceneOf(s, ctx, "y_spree", [
        y < 1990 && { key: "store", lead: ctx.f("電器行的{appliance}可以分期，", { appliance }),
          prompt: "電器行在促銷{appliance}，老闆說可以分期付款，每個月只要繳一點點，{同事上個月才搬了一台回家。|你在店門口站了好久。}要怎麼辦？",
          o: { family: [ctx.f("買回家給{who}用", { who }), "錢花在家人身上", ctx.f("把{appliance}搬回家，放在客廳給{who}用", { appliance, who })] } },
        y >= 1988 && { key: "sale", lead: "百貨公司週年慶，",
          prompt: "百貨公司週年慶，{goods}滿{五千送五百|三千送三百}，{同事約你下班一起去排隊。|你已經在型錄上圈了好幾樣。}要怎麼辦？" },
        y >= 2002 && y < 2016 && { key: "auction", lead: "半夜逛網拍，",
          prompt: "半夜睡不著，你打開網拍一頁一頁地逛，{追蹤清單|購物車}裡已經塞了{十幾|二十幾}樣東西，{結帳只要按一下。|每一樣都寫著最後一件。}要怎麼辦？",
          o: {
            wait: ["先放購物車，冷靜三天", "說不定就不想要了", "先把東西留在購物車，冷靜三天"],
            buy: ["全部結帳，犒賞自己", "辛苦工作就是為了這一刻", "全部結了帳"],
            cut: ["把網拍的帳號登出", "眼不見為淨", "把網拍的帳號登出，書籤也刪了"],
          } },
        y >= 2015 && { key: "double11", lead: "雙十一的購物車塞滿了，",
          prompt: "雙十一前一個禮拜，手機不停跳出{限時搶購|滿千折百|免運}的通知，你的購物車已經{滑不到底|快塞滿了}。要怎麼辦？",
          o: {
            wait: ["先放購物車，冷靜三天", "說不定就不想要了", "先把東西留在購物車，冷靜三天"],
            buy: ["時間一到就全部結帳", "辛苦工作就是為了這一刻", "等到半夜十二點，全部結了帳"],
            cut: ["關掉通知，刪掉購物 App", "眼不見為淨", "關掉通知，把購物 App 刪了"],
          } },
        y >= 2000 && { key: "card", lead: ctx.f("想要{gadget}很久了，", { gadget }),
          prompt: "你想要{gadget}很久了，價錢差不多是一個月的薪水，店員說刷卡可以分{十二|二十四}期零利率。要怎麼辦？",
          o: { cut: ["把多辦的信用卡剪掉", "眼不見為淨", "回家把多辦的那張信用卡剪了"] } },
        y >= 2018 && { key: "group", lead: "團購群組天天在喊最後三組，",
          prompt: "同事拉你進了一個{團購群組|直播賣場}，每天都有人喊最後三組，你已經{一個禮拜下單五次|收包裹收到警衛都認得你}。要怎麼辦？",
          o: {
            wait: ["想買的先等三天再下單", "說不定就不想要了", "給自己定了規矩：想買的東西先等三天"],
            buy: ["喜歡就買，開心就好", "辛苦工作就是為了這一刻", "照樣喜歡就下單"],
            cut: ["退出團購群組", "眼不見為淨", "默默退出了團購群組"],
          } },
        { key: "payday", lead: "薪水一入帳就花掉，",
          prompt: y >= 1990
            ? "每個月薪水一入帳，你就忍不住{買衣服|買鞋子|吃大餐}，到了月底{只能吃{noodle}|帳戶只剩幾百塊}，這個月又是這樣。要怎麼辦？"
            : "每個月薪水一入帳，你就忍不住{買衣服|買鞋子|上館子}，到了月底{只能吃{noodle}|帳戶只剩幾百塊}，這個月又是這樣。要怎麼辦？",
          o: {
            wait: ["想買的先等三天", "說不定就不想要了", "給自己定了規矩：想買的東西先等三天"],
            buy: ["照樣花，辛苦就是要享受", "人生苦短", null],
            installment: [card ? "改成刷卡分期，慢慢繳" : "改成分期付款", "每個月繳一點", card ? "把想買的東西改成刷卡分期" : "把想買的東西改成分期付款"],
            budget: ["薪水一進來先存一半", "看清楚錢花去哪", "薪水一進來先轉一半到另一個帳戶，剩下的每一筆都記下來"],
          } },
      ]);
      const B = buttonsOf(base, sc), lead = sc.lead, did = k => ({ lead, did: B[k][2], noodle, who, bill: card ? "卡費" : "分期款", spent: y >= 1990 ? "飲料" : "宵夜" });
      return {
        prompt: ctx.w(sc.prompt, { appliance, goods, gadget, noodle }),
        options: [
          {
            id: "y_spree.wait", label: B.wait[0], hint: B.wait[1], act: "wait", style: "safe", weight: 0.25,
            apply: (s2, c) => ({ text: c.w("{lead}你{did}，{三天後再看，你已經沒那麼想要了。|最後只留下一樣真的需要的。}", did("wait")), mood: 1 }),
          },
          {
            id: "y_spree.buy", label: B.buy[0], hint: B.buy[1], act: "hobby", style: "self", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.02); return { text: c.w(B.buy[2] ? "{lead}你{did}，{拆開的時候很開心，|用起來真的很喜歡，}{只是月底吃了好幾天{noodle}。|你告訴自己下個月要省一點。}" : "{lead}你照樣花，{買了一雙新鞋|買了一件新外套}，{拆開的時候很開心，|用起來真的很喜歡，}{只是月底吃了好幾天{noodle}。|你告訴自己下個月要省一點。}", did("buy")), mood: 2 }; },
          },
          {
            id: "y_spree.installment", label: B.installment[0], hint: B.installment[1], act: "borrow", style: "risk", weight: 0.12,
            apply: (s2, c) => { s2.debt += 0.03; return { text: c.w(B.installment[2] ? "{lead}你{did}，{每個月要多繳一筆{bill}，|分期聽起來很划算，}{你提醒自己不要再加了。|繳完最後一期那天，你鬆了一口氣。}" : "{lead}你刷卡分了{十二|二十四}期，{每個月要多繳一筆{bill}，|分期聽起來很划算，}{你提醒自己不要再加了。|繳完最後一期那天，你鬆了一口氣。}", did("installment")), mood: 1 }; },
          },
          {
            id: "y_spree.budget", label: B.budget[0], hint: B.budget[1], act: "save", style: "learn", weight: 0.2,
            apply: (s2, c) => { frugal(s2, 1); return { text: c.w("{lead}你{did}，{三個月後，存款第一次比上個月多。|才發現每個月光是{spent}就花了不少錢。}", did("budget")), mood: 1 }; },
          },
          {
            id: "y_spree.family", label: B.family[0], hint: B.family[1], act: "care", style: "family", weight: 0.1, when: s2 => parentsAlive(s2),
            apply: (s2, c) => { spend(s2, 0.015); return { text: c.w("{lead}你{did}，{{who}嘴上唸你亂花錢，卻每天都用。|{who}開心地跟鄰居炫耀了好久。}", did("family")), mood: 2 }; },
          },
          {
            id: "y_spree.cut", label: B.cut[0], hint: B.cut[1], act: "quitHabit", style: "health", weight: 0.13,
            apply: (s2, c) => ({ text: c.w("{lead}你{did}，{少了那些誘惑，日子清靜了不少。|一開始很不習慣，後來發現也沒少什麼。}", did("cut")), mood: 0 }),
          },
        ],
      };
    },
  },
  {
    // 出社會以後，每個月要拿多少錢回家（孝親費）。
    id: "y_parentsMoney", once: true, domain: "family", channel: "change", tags: ["father", "mother"], ages: [18, 30],
    when: s => working(s) && parentsAlive(s), p: s => (s.age - (s.job.since ?? s.age) <= 1 ? 0.1 : 0.03),
    choice: (s, ctx) => {
      const y = s.year, who = parentsWord(s), sibs = bornSiblings(s, 20), older = sibs.filter(x => x.older), athome = s.home === "parents";
      const give = ctx.w(y < 1985 ? "{一千|兩千}" : y < 2000 ? "{三千|五千}" : "{五千|一萬}");
      const [need, payLabel, payDid] = ctx.rng.pick([...(y >= 1990 ? [["冷氣壞了", "幫家裡出修冷氣的錢", "出了修冷氣的錢"]] : []), ["機車要換了", "幫家裡出換機車的錢", "出了換機車的錢"], ["保險費要繳了", "幫家裡繳保險費", "幫家裡繳了保險費"], ["屋頂在漏水", "幫家裡出修屋頂的錢", "出了修屋頂的錢"]]);
      // A brother or sister as the story calls them: 哥哥志明, or 哥哥.
      const sib = x => { const call = siblingCall(x), name = call.slice(x.label.length); return name ? ctx.f("{sib}{name}", { sib: x.label, name }) : ctx.f("{sib}", { sib: x.label }); };
      const base = {
        fixed: ["每個月固定給一筆", "讓家裡安心", athome ? ctx.f("跟{who}說好，每個月固定拿{give}回家", { who, give }) : ctx.f("跟{who}說好，每個月固定匯{give}回家", { who, give })],
        less: ["先給少一點，自己也要存錢", "量力而為", ctx.f("跟{who}說剛開始薪水不多，先給一點", { who })],
        bills: [y >= 2010 ? "幫家裡繳水電和網路費" : "幫家裡繳水電和電話費", "用行動分擔", y >= 2010 ? "把家裡的水電和網路費接過來繳" : "把家裡的水電和電話費接過來繳"],
        talk: [ctx.f("跟{who}好好談收入", { who }), "把狀況說清楚", ctx.f("坐下來跟{who}算了算自己的收入和開銷", { who })],
        share: ["跟兄弟姊妹講好一起分攤", "大家一起分", ctx.f("找{sibs}商量，講好每個人每個月給多少", { sibs: sibs.length ? sib(sibs[0]) : "兄弟姊妹" })],
        keep: [ctx.f("幫{who}存一個帳戶", { who }), ctx.f("以後{who}要用就有", { who }), ctx.f("開了一個帳戶，每個月存一筆進去，說好是{who}的", { who })],
      };
      // What raises it: the pay envelope (when it was handed over whole), living at home, a call about something
      // broken while you rent elsewhere, an older sibling who already gives, or a bill posted in the family chat.
      const sc = sceneOf(s, ctx, "y_parentsMoney", [
        y < 1985 && athome && { key: "envelope", w: 2, lead: "領到薪水袋，",
          prompt: "領到薪水袋回家，{who}笑著在門口等你，那時候很多人都把薪水袋整包交給家裡。要怎麼辦？",
          o: {
            fixed: ["整包交給家裡，再拿零用錢", "家裡習慣這樣", ctx.f("把薪水袋整包交給{who}，再拿回一點零用錢", { who }), true],
            less: ["交一半，另一半自己存", "量力而為", ctx.f("交了一半給{who}，另一半自己存進郵局", { who })],
          } },
        athome && { key: "home", lead: "住在家裡，",
          prompt: "你住在家裡，水電、伙食都是{who}在付，{同事|朋友}說住家裡的人每個月都會拿錢回家。要給多少？" },
        !athome && { key: "away", lead: ctx.f("{who}說家裡的{need}，", { who, need }),
          prompt: y >= 1998
            ? "在{city}租房子，房租已經吃掉三分之一的薪水，{who}{打電話|傳訊息}來說家裡的{need}。要怎麼辦？"
            : "在{city}租房子，房租已經吃掉三分之一的薪水，{who}打電話來說家裡的{need}。要怎麼辦？",
          o: { bills: [payLabel, "用行動分擔", payDid] } },
        older.length > 0 && { key: "sibling", lead: ctx.f("{sib}每個月都拿錢回家，", { sib: sib(older[0]) }),
          prompt: "{sib}每個月給家裡{give}，過年吃團圓飯時，{親戚|{who}}隨口問起你一個月給家裡多少。要怎麼辦？" },
        y >= 2014 && { key: "chat", lead: ctx.f("{mum}在群組裡說最近開銷比較大，", { mum: s.mother.alive ? "媽媽" : "爸爸" }),
          prompt: "家族的 LINE 群組裡，{mum}傳了一張{水電費|保險費}繳費單的照片，後面加了一句最近開銷比較大。要怎麼辦？" },
      ]);
      const B = buttonsOf(base, sc), did = k => ({ lead: sc.lead, did: B[k][2], who });
      return {
        prompt: ctx.w(sc.prompt, { who, need, sib: older.length ? sib(older[0]) : "", give, mum: s.mother.alive ? "媽媽" : "爸爸" }),
        options: [
          {
            id: "y_parentsMoney.fixed", label: B.fixed[0], hint: B.fixed[1], act: "care", style: "family", weight: 0.35,
            apply: (s2, c) => { spend(s2, 0.03); return { text: c.w(B.fixed[3] ? "{lead}你{did}，{{who}把錢收進抽屜，又塞了一點回你口袋。|{who}拿去繳了會錢，說以後都是你的。}" : "{lead}你{did}，{{who}嘴上說不用，還是幫你存了起來。|{who}逢人就說孩子長大了。|雖然自己的存款少了一點，心裡卻很踏實。}", did("fixed")), mood: 2 }; },
          },
          {
            id: "y_parentsMoney.less", label: B.less[0], hint: B.less[1], act: "save", style: "self", weight: 0.2,
            apply: (s2, c) => { frugal(s2, 1); return { text: c.w("{lead}你{did}，{{who}說沒關係，先顧好自己。|你另外開了一個帳戶，說好加薪就多給。}", did("less")), mood: 0 }; },
          },
          {
            id: "y_parentsMoney.bills", label: B.bills[0], hint: B.bills[1], act: "care", style: "safe", weight: 0.12,
            apply: (s2, c) => { spend(s2, 0.02); return { text: c.w("{lead}你{did}，{{who}嘴上說不用，還是收下了。|{who}說這樣比拿現金還實在。}", did("bills")), mood: 1 }; },
          },
          {
            id: "y_parentsMoney.talk", label: B.talk[0], hint: B.talk[1], act: "talk", style: "social", weight: 0.13,
            apply: (s2, c) => ({ text: c.w("{lead}你{did}，{{who}聽完，說給多少都好。|你們講好了一個兩邊都能接受的數字。}", did("talk")), mood: 1 }),
          },
          {
            id: "y_parentsMoney.share", label: B.share[0], hint: B.share[1], act: "shareCare", style: "social", weight: 0.1, when: () => sibs.length > 0,
            apply: (s2, c) => ({ text: c.w(y >= 2011 ? "{lead}你{did}，{{who}收到你們一起給的錢，開心了好幾天。|大家在 LINE 群組裡記帳，誰也不吃虧。}" : "{lead}你{did}，{{who}收到你們一起給的錢，開心了好幾天。|大家說好輪流，誰也不吃虧。}", did("share")), mood: 2 }),
          },
          {
            id: "y_parentsMoney.keep", label: B.keep[0], hint: B.keep[1], act: "save", style: "safe", weight: 0.1,
            apply: (s2, c) => { frugal(s2, 2); return { text: c.w(y >= 2012 ? "{lead}你{did}，{{who}不知道有這個帳戶，你打算等過年的時候再說。|帳戶裡的數字一個月一個月慢慢變多。}" : "{lead}你{did}，{{who}不知道有這個帳戶，你打算等過年的時候再說。|存摺放在抽屜裡，一個月一個月慢慢變厚。}", did("keep")), mood: 1 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_vehicle", once: true, domain: "wealth", channel: "change", ages: [18, 30], when: s => s.year >= 1965 && !s.abroad && (working(s) || inCollege(s)), p: () => 0.03,
    choice: (s, ctx) => {
      const y = s.year, work = working(s), go = work ? "上班" : "上課", who = parentsWord(s), [b1, b2, b3] = scooterOf(y);
      const taipei = ["臺北市", "新北市"].includes(s.county);
      const transit = taipei && y >= 2012 ? "搭捷運，再騎一段 YouBike" : taipei && y >= 1997 ? "搭捷運和公車" : "搭公車";
      const plant = !!s.job && ["製造", "科技"].includes(s.job.field);
      const zone = ctx.rng.pick(plant ? ["工業區", ...(y >= 1981 ? ["科學園區"] : [])] : ["郊區", "山邊"]), [hill, town2] = ctx.rng.pick([["山上", "下山去市區"], ["郊區", "去市區"]]);
      // [label, hint, what you did]; null when what you did is a choice of its own, told in the templates below.
      const base = {
        new: ["分期買一台新機車", "每個月繳一點", null],
        used: ["買一台二手機車", "便宜，耐騎就好", null],
        family: ["騎家裡的舊車", "不用花錢", "騎上家裡那台舊機車"],
        bike: ["買一台腳踏車就好", "省錢，順便運動", null],
        transit: ["搭大眾運輸就好", "把錢存下來", ctx.f("算了算油錢和保養費，決定繼續{transit}", { transit })],
        electric: ["買一台電動機車", "安靜，不用加油", "買了一台電動機車"],
      };
      // Why you want wheels now: the bus, an old scooter that gave out, a workplace far from the bus, everyone else
      // riding, a campus on a hill, or friends in a city with an MRT who still swear by scooters.
      const sc = sceneOf(s, ctx, "y_vehicle", [
        { key: "bus", lead: ctx.f("受不了每天搭公車{go}，", { go }),
          prompt: "每天{擠公車|等公車}{go}，{常常遲到，|下雨天全身濕透，}你想要一台自己的車。要怎麼辦？" },
        y >= 1975 && { key: "old", lead: "老機車在半路熄火，",
          prompt: parentsAlive(s)
            ? "騎了好多年的家裡那台老機車在半路熄火，{推去車行，師傅說修不如換。|怎麼發都發不動，你推著它走了半個小時。}要怎麼辦？"
            : "騎了好多年的那台老機車在半路熄火，{推去車行，師傅說修不如換。|怎麼發都發不動，你推著它走了半個小時。}要怎麼辦？",
          o: {
            new: ["分期換一台新機車", "每個月繳一點", null],
            used: ["在車行換一台二手的", "便宜，耐騎就好", "在車行換了一台二手機車"],
            family: [ctx.f("請{who}出錢把老車修好", { who }), "不用花大錢", ctx.f("請{who}幫忙出了修車錢，把老車整個整理了一遍", { who })],
            bike: ["改騎腳踏車", "省錢，順便運動", null],
            transit: ["改搭公車就好", "把錢存下來", ctx.f("算了算修車錢和油錢，決定改成{transit}", { transit })],
            electric: ["換一台電動機車", "安靜，不用加油", "換了一台電動機車"],
          } },
        work && placeOf(s) === "公司" && (plant || !taipei) && { key: "far", lead: ctx.f("公司在{zone}，公車很少，", { zone }),
          prompt: "公司在{zone}，公車{一個小時才一班|要轉兩次}，{遲到了兩次以後，|看著同事一個個騎車來上班，}你想要一台自己的車。要怎麼辦？",
          o: { transit: ["早一點出門搭公車", "把錢存下來", "決定每天早一點出門搭公車"] } },
        { key: "peers", lead: work ? ctx.f("看同事都騎車{go}，", { go }) : ctx.f("看同學都騎車{go}，", { go }),
          prompt: work ? "同事都騎車{go}，你也存了一點錢，想要一台自己的車。要怎麼辦？" : "同學都騎車{go}，你也存了一點錢，想要一台自己的車。要怎麼辦？" },
        inCollege(s) && { key: "campus", lead: ctx.f("學校在{hill}，沒有車很不方便，", { hill }),
          prompt: "學校在{hill}，{從宿舍到教室|{town}打工}都要騎好一段路，沒有車哪裡都去不了。要怎麼辦？",
          o: {
            used: ["跟要畢業的學長姊買二手車", "便宜，耐騎就好", null],
            family: ["把家裡的舊車騎來學校", "不用花錢", "把家裡那台舊機車騎來學校"],
            transit: ["搭校車和公車就好", "把錢存下來", "算了算油錢和保養費，決定繼續搭校車和公車"],
          } },
        taipei && y >= 1997 && { key: "metro", lead: "捷運雖然方便，",
          prompt: work
            ? "住在{city}，捷運很方便，可是同事都說有一台機車才自由，{週末去哪都不用等車。|下雨天也不用排計程車。}要怎麼辦？"
            : "住在{city}，捷運很方便，可是同學都說有一台機車才自由，{週末去哪都不用等車。|下雨天也不用排計程車。}要怎麼辦？",
          o: {
            new: ["還是分期買一台新機車", "每個月繳一點", null],
            transit: ["繼續搭捷運就好", "把錢存下來", ctx.f("算了算油錢和停車費，決定繼續{transit}", { transit })],
          } },
      ]);
      const B = buttonsOf(base, sc), lead = sc.lead, k = sc.key, did = k2 => ({ lead, did: B[k2][2], go });
      // A new scooter, on instalments: bought, or in place of the old one ({verb}), or anyway ({still}); the model is the
      // era's (scooterOf), one or a {甲|乙} choice.
      const scooter = { lead, go, b1, b2, b3, still: k === "metro" ? "還是" : "", verb: k === "old" ? "換了" : "買了" };
      const NEW = !b2 ? "{lead}你{still}分{十二|二十四}期{verb}一台{b1}，{第一天騎去{go}，覺得自己好帥。|每天出門前都要擦一遍。|在座墊下放了一件輕便雨衣，從此不怕下雨。}"
        : !b3 ? "{lead}你{still}分{十二|二十四}期{verb}一台{{b1}|{b2}}，{第一天騎去{go}，覺得自己好帥。|每天出門前都要擦一遍。|在座墊下放了一件輕便雨衣，從此不怕下雨。}"
          : y >= 2016 ? "{lead}你{still}分{十二|二十四}期{verb}一台{{b1}|{b2}| {b3}}，{第一天騎去{go}，覺得自己好帥。|每天出門前都要擦一遍。|在座墊下放了一件輕便雨衣，從此不怕下雨。}"
            : "{lead}你{still}分{十二|二十四}期{verb}一台{{b1}|{b2}|{b3}}，{第一天騎去{go}，覺得自己好帥。|每天出門前都要擦一遍。|在座墊下放了一件輕便雨衣，從此不怕下雨。}";
      return {
        prompt: ctx.w(sc.prompt, { go, zone, hill, town: town2 }),
        options: [
          {
            id: "y_vehicle.new", label: B.new[0], hint: B.new[1], act: "borrow", style: "risk", weight: 0.25,
            apply: (s2, c) => { s2.debt += 0.08; return { text: c.w(NEW, scooter), mood: 4 }; },
          },
          {
            id: "y_vehicle.used", label: B.used[0], hint: B.used[1], act: "save", style: "safe", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.03); return { text: c.w(B.used[2] ? "{lead}你{did}，{騎起來有點吵，但很耐操。|花不到一個月的薪水。|換了新輪胎，又能再騎好幾年。}"
              : k === "campus" ? "{lead}你跟要畢業的{學長|學姊}買了一台二手機車，{騎起來有點吵，但很耐操。|花不到一個月的薪水。|換了新輪胎，又能再騎好幾年。}"
                : "{lead}你在{車行|{where}}買了一台二手機車，{騎起來有點吵，但很耐操。|花不到一個月的薪水。|換了新輪胎，又能再騎好幾年。}", { ...did("used"), where: y >= 2000 ? "網路上" : "朋友介紹的地方" }), mood: 2 }; },
          },
          {
            id: "y_vehicle.family", label: B.family[0], hint: B.family[1], act: "seekHelp", style: "family", weight: 0.15, when: s2 => parentsAlive(s2),
            apply: (s2, c) => ({ text: c.w("{lead}你{did}，{換了一顆新電瓶就騎得很順。|座墊有點破，你用膠帶貼一貼照樣騎。}", did("family")), mood: 2 }),
          },
          {
            id: "y_vehicle.bike", label: B.bike[0], hint: B.bike[1], act: "exercise", style: "health", weight: 0.1,
            apply: (s2, c) => { spend(s2, 0.01); s2.health.fitness = clamp(s2.health.fitness + 0.03); return { text: c.w(k === "old"
              ? "{lead}你改騎一台{二手的|新的}腳踏車，{每天騎去{go}，|騎了半年，}{腿變得好有力。|省下了車錢，也順便運動。}"
              : "{lead}你買了一台{二手的|新的}腳踏車，{每天騎去{go}，|騎了半年，}{腿變得好有力。|省下了車錢，也順便運動。}", did("bike")), mood: 2 }; },
          },
          {
            id: "y_vehicle.transit", label: B.transit[0], hint: B.transit[1], act: "save", style: "safe", weight: 0.12,
            apply: (s2, c) => { frugal(s2, 1); return { text: c.w("{lead}你{did}，{把買車的錢存了下來。|通勤的時間剛好拿來看書。}", did("transit")), mood: 0 }; },
          },
          {
            id: "y_vehicle.electric", label: B.electric[0], hint: B.electric[1], act: "borrow", style: "learn", weight: 0.1, when: s2 => s2.year >= 2016,
            apply: (s2, c) => { spend(s2, 0.04); return { text: c.w("{lead}你{did}，{在換電站換電池的時候，覺得自己走在時代的前面。|騎起來安靜得連鄰居的狗都沒發現你回家。}", did("electric")), mood: 3 }; },
          },
        ],
      };
    },
  },
  {
    // 考駕照：機車在監理站考筆試和路考，1980 年代起家裡開始有汽車、駕訓班越來越多。
    id: "y_license", once: true, ages: [18, 22], when: s => s.year >= 1975 && !s.abroad && !s.flags.license, p: () => 0.07,
    choice: (s, ctx) => {
      const y = s.year, who = parentsWord(s), go = s.employed ? "上班" : s.studying ? "上學" : "出門", work = s.employed;
      const boss = s.job ? bossOf(s) : "主管", rode = s.done.has("y_vehicle"), nag = parentsAlive(s);
      // Why now, and which licence: [scene, 汽車 or 機車].
      const sc = sceneOf(s, ctx, "y_license", [
        { key: "ride", kind: "機車", lead: "騎車騎了好一陣子，駕照卻還沒考，",
          prompt: rode
            ? nag ? "你常常騎車{go}，駕照卻一直沒去考，{上個月才在路口被警察攔下來，罰了一筆錢。|{who}每天都在唸。}要怎麼辦？" : "你常常騎車{go}，駕照卻一直沒去考，{上個月才在路口被警察攔下來，罰了一筆錢。|朋友每天都在唸。}要怎麼辦？"
            : nag ? "你常常騎家裡的機車{go}，駕照卻一直沒去考，{上個月才在路口被警察攔下來，罰了一筆錢。|{who}每天都在唸。}要怎麼辦？" : "你常常騎家裡的機車{go}，駕照卻一直沒去考，{上個月才在路口被警察攔下來，罰了一筆錢。|朋友每天都在唸。}要怎麼辦？" },
        { key: "mates", kind: y >= 1990 ? "汽車" : "機車", lead: "看大家都考到駕照，",
          prompt: y >= 1990
            ? work ? "同事一個個都考到駕照了，{週末出去玩，只有你不能換手開車。|聊天時大家都在比路考的糗事。}要怎麼辦？" : "同學一個個都考到駕照了，{週末出去玩，只有你不能換手開車。|聊天時大家都在比路考的糗事。}要怎麼辦？"
            : work ? "同事一個個都考到駕照了，{週末出去玩，只有你要人載。|聊天時大家都在比路考的糗事。}要怎麼辦？" : "同學一個個都考到駕照了，{週末出去玩，只有你要人載。|聊天時大家都在比路考的糗事。}要怎麼辦？" },
        inCollege(s) && { key: "campus", kind: y >= 1985 ? "汽車" : "機車", lead: "室友找你一起去考駕照，",
          prompt: y >= 2005
            ? "學校附近的駕訓班在校門口發傳單，{學生揪團報名打九折，|暑假班還有名額，}室友已經報名了。要怎麼辦？"
            : "學校附近的駕訓班在校門口發傳單，{幾個同學一起報名有打折，|暑假班還有名額，}室友已經報名了。要怎麼辦？" },
        employee(s) && s.job.title !== "貨運司機" && { key: "work", kind: "汽車", lead: ctx.f("{boss}要你去考駕照，", { boss }),
          prompt: "{boss}說以後要你{送貨|跑客戶|載東西}，問你有沒有駕照，{同事說趕快去考。|你只能說還沒有。}要怎麼辦？" },
        parentsAlive(s) && y >= 1985 && { key: "car", kind: "汽車", lead: "家裡買了車，",
          prompt: "家裡買了{第一台汽車|一台二手的國產車}，{who}希望你考到駕照，{週末可以載全家出去走走。|過年回老家可以換手開。}要怎麼辦？" },
      ]);
      const car = sc.kind === "汽車", lic = sc.kind + "駕照", lead = sc.lead;
      const got = s2 => { s2.flags.license = s2.age; };
      // Not now: [label, hint, and the whole sentence after the lead].
      const later = sc.key === "ride" ? ["先不騎了，以後再考", "現在用不到", "{lead}你決定先不騎車，以後再考，{每天早一點出門等公車。|要出門就請朋友載。}"]
        : sc.key === "work" ? [ctx.f("跟{boss}說晚點再考", { boss }), "現在太忙", "{lead}你跟{boss}說等忙完這陣子再去考，{{boss}後來也沒再提。|送貨跑腿的事，暫時交給別的同事。}"]
          : ["先不考，以後再說", "現在用不到", "{lead}你決定先不考，{等真的需要再說。|出門還是麻煩朋友載。|反正公車也還算方便。}"];
      return {
        prompt: ctx.w(sc.prompt, { go, who, boss }),
        options: [
          {
            id: "y_license.school", label: car ? "報名駕訓班" : "去駕訓班上課", hint: "花一筆錢，比較穩", act: "study", style: "learn", weight: 0.35,
            apply: (s2, c) => {
              spend(s2, 0.03); got(s2);
              return c.rng() < 0.8
                ? { text: c.w(car ? "{lead}你報名了駕訓班，{倒車入庫練到閉著眼睛都會，|跟著教練在場內繞了好幾個禮拜，}{路考一次就過。|拿到駕照那天，你開心得拍了一張照片。}" : "{lead}你報名了駕訓班，{在監理站的直線上騎得穩穩的，|筆試九十幾分，}{一次就考過了。|拿到駕照那天，你騎車繞了一大圈。}", { lead }), mood: 3 }
                : { text: c.w(car ? "{lead}你報名了駕訓班，{路考時壓到線，|緊張到忘了打方向燈，}{第二次才考過。|重考了一次才拿到駕照。}" : "{lead}你報名了駕訓班，{路考時腳一直落地，|筆試差兩題沒過，}{第二次才考過。|隔週再去一次才拿到駕照。}", { lead }), mood: 0 };
            },
          },
          {
            id: "y_license.self", label: "自己看題庫，直接去考", hint: "省錢，但不一定一次過", act: "pushThrough", style: "risk", weight: 0.15,
            apply: (s2, c) => {
              got(s2);
              return c.rng() < 0.5
                ? { text: c.w("{lead}你自己{把筆試題庫背了好幾遍|在空地練了好幾個晚上}，直接去監理站考{lic}，{竟然一次就過了。|省下了一筆駕訓班的錢，你得意了好幾天。}", { lead, lic }), mood: 3 }
                : { text: c.w(car
                  ? "{lead}你自己{把筆試題庫背了好幾遍|在空地練了好幾個晚上}，直接去監理站考{lic}，{路考時熄火了兩次，當場被判不及格，|倒車入庫壓到線，被請下車，}{隔了一個月再去考，才終於過了。|第二次總算考過了。}"
                  : "{lead}你自己{把筆試題庫背了好幾遍|在空地練了好幾個晚上}，直接去監理站考{lic}，{在直線上騎到一半就壓線出去，|筆試差兩題沒過，}{隔了一個月再去考，才終於過了。|第二次總算考過了。}", { lead, lic }), mood: -1 };
            },
          },
          {
            id: "y_license.family", label: ctx.f("請{who}在空地教", { who }), hint: "不用花錢", act: "seekHelp", style: "family", weight: 0.15, when: s2 => parentsAlive(s2),
            apply: (s2, c) => { got(s2); return { text: c.w(car
              ? "{lead}你請{who}{在河堤邊|在學校操場|在空地}教你開車，{{who}比教練還兇，|兩個人在車上吵了好幾次，}{最後還是一次就考過了。|考到駕照那天，{who}比你還開心。}"
              : "{lead}你請{who}{在河堤邊|在學校操場|在空地}教你騎車，{{who}比教練還兇，|兩個人在車上吵了好幾次，}{最後還是一次就考過了。|考到駕照那天，{who}比你還開心。}", { lead, who }), mood: 2 }; },
          },
          {
            id: "y_license.friend", label: work ? "跟同事一起報名" : "跟同學一起報名", hint: "有伴比較不緊張", act: "socialize", style: "social", weight: 0.15,
            apply: (s2, c) => {
              spend(s2, 0.03); got(s2);
              const f = friendOf(s2, c, s2.employed ? { prefer: /同事/, how: "同事" } : {});
              return { text: c.w("{lead}你跟{f}一起報名了駕訓班，{兩個人互相提醒路考的重點，|每天下課一起去練車，}{一起拿到了駕照。|{f}考了兩次，你在場外幫{fta}加油。}", { lead, f: f.call, fta: pronoun(f) }), mood: 3 };
            },
          },
          {
            id: "y_license.later", label: later[0], hint: later[1], act: "wait", style: "safe", weight: 0.2,
            apply: (s2, c) => ({ text: c.w(later[2], { lead, boss }), mood: 0 }),
          },
        ],
      };
    },
  },
  {
    id: "y_firstTrip", once: true, domain: "move", channel: "change", ages: [19, 30],
    // Not in 2020–2022, when the borders were all but closed.
    when: s => s.year >= 1980 && (s.year < 2020 || s.year > 2022) && !beenAbroad(s) && ((working(s) && s.savings >= 0.15) || (inCollege(s) && s.year >= 1995)), p: () => 0.04,
    choice: (s, ctx) => {
      const y = s.year, who = parentsWord(s), they = s.father.alive && s.mother.alive ? "他們" : s.father.alive ? "他" : "她", work = working(s);
      const dest = ctx.rng.pick(y < 1990 ? ["香港", "日本", "泰國", "新加坡"] : y < 2005 ? ["日本", "香港", "泰國", "峇里島"] : y < 2015 ? ["日本", "韓國", "泰國", "香港"] : ["日本", "韓國", "泰國", "越南", "沖繩"]);
      const been = s2 => { s2.flags.beenAbroad = true; ctx.remember("y_firstTrip", ctx.f("第一次出國去{dest}", { dest })); };
      // [label, hint, what you did]; with {f} for the friend you go with, and null when what you did is a choice of its own.
      const base = {
        tour: ["跟旅行團", "不用煩惱，行程很滿", ctx.f("跟著旅行團去{dest}", { dest })],
        friends: ["和朋友自由行", "自己安排，比較自由", y >= 2014 ? "和{f}搶到廉航的便宜機票，自己去{dest}" : "和{f}自己去{dest}"],
        solo: ["一個人背包旅行", "什麼都要自己來", ctx.f("一個人背著背包去{dest}", { dest })],
        parents: [ctx.f("帶{who}一起去", { who }), "花比較多錢", ctx.f("帶{who}一起跟團去{dest}", { who, dest })],
        company: ["跟公司的員工旅遊去", "公司出大部分的錢", ctx.f("跟著公司的員工旅遊去{dest}", { dest })],
        later: ["先存起來，以後再去", "錢留著比較安心", null],
      };
      // What makes this the year: everyone else has been, money saved up, a cheap fare or a travel fair, the years
      // right after overseas tourism opened (1979), parents who never went, or a graduation trip with classmates.
      const sc = sceneOf(s, ctx, "y_firstTrip", [
        { key: "peers", lead: "第一次出國，",
          prompt: work ? "你還沒出過國，{同事|朋友}都去過{dest}了。這次想第一次出國，要怎麼去？" : "你還沒出過國，{同學|室友}都去過{dest}了。這次想第一次出國，要怎麼去？" },
        { key: "saved", lead: "第一次出國，",
          prompt: work ? "存了一筆錢，你想第一次出國，去{dest}看看。要怎麼去？" : "打工存了一筆錢，你想第一次出國，去{dest}看看。要怎麼去？" },
        y >= 2014 && { key: "fare", lead: "看到廉航的特價，第一次出國，", want: "看到廉航的特價，",
          prompt: y >= 2016
            ? "廉航半夜開賣，到{dest}的來回機票{只要三千多|不到五千}，你守在手機前等到十二點。這是你第一次出國，要怎麼安排？"
            : "廉航半夜開賣，到{dest}的來回機票{只要三千多|不到五千}，你守在電腦前等到十二點。這是你第一次出國，要怎麼安排？",
          o: {
            tour: ["還是報旅行團比較放心", "不用煩惱，行程很滿", ctx.f("最後還是報了旅行團去{dest}", { dest })],
            friends: ["揪朋友一起搶票自由行", "自己安排，比較自由", "和{f}一起搶到了票，自己去{dest}"],
            solo: ["搶一張票，一個人去", "什麼都要自己來", ctx.f("搶到一張票，一個人背著背包去{dest}", { dest })],
            parents: [ctx.f("多搶兩張，帶{who}去", { who }), "花比較多錢", ctx.f("多搶了兩張，帶{who}一起去{dest}", { who, dest })],
            company: ["不搶了，等員工旅遊", "公司出大部分的錢", ctx.f("沒有搶票，等到公司的員工旅遊才去{dest}", { dest })],
            later: ["忍住，不衝動", "錢留著比較安心", "最後還是沒按下付款，把錢存了起來"],
          } },
        y >= 1987 && y < 2014 && { key: "fair", lead: "在旅展看到特價，第一次出國，", want: "在旅展看到特價，",
          prompt: y >= 2000
            ? "旅展上，到{dest}的{機加酒|旅行團}正在特價，攤位前擠滿了人，你手上拿著一疊傳單。這是你第一次出國，要怎麼安排？"
            : "旅展上，到{dest}的旅行團正在特價，攤位前擠滿了人，你手上拿著一疊傳單。這是你第一次出國，要怎麼安排？",
          o: {
            tour: ["在旅展訂一個旅行團", "不用煩惱，行程很滿", ctx.f("在旅展訂了一個去{dest}的旅行團", { dest })],
            friends: [y >= 2000 ? "揪朋友訂機加酒自由行" : "揪朋友自己訂機票旅館", "自己安排，比較自由", y >= 2000 ? "和{f}訂了機加酒，自己去{dest}" : "和{f}自己訂了機票和旅館，去{dest}"],
            later: ["只拿傳單，先不訂", "錢留著比較安心", "只拿了一疊傳單回家，決定先把錢存起來"],
          } },
        y < 1992 && { key: "open", lead: "第一次出國，",
          prompt: y < 1986
            ? "開放出國觀光沒幾年，你{去辦了第一本護照|看著鄰居從{dest}帶回來的伴手禮}，一直想去{dest}看看。要怎麼去？"
            : "出國觀光越來越熱門，你{去辦了第一本護照|看著鄰居從{dest}帶回來的伴手禮}，一直想去{dest}看看。要怎麼去？" },
        parentsAlive(s) && work && { key: "family", lead: "第一次出國，",
          prompt: "{who}一輩子沒出過國，常說想去{dest}看看。你存了一點錢，想第一次出國就帶上家人。要怎麼安排？",
          o: {
            parents: [ctx.f("帶{who}一起跟團", { who }), "花比較多錢", ctx.f("帶{who}一起跟團去{dest}", { who, dest })],
            tour: ["先自己跟團去看看", "下次再帶家人", ctx.f("先自己跟著旅行團去{dest}", { dest })],
            friends: ["先跟朋友去探路", "下次再帶家人", "先和{f}自己去{dest}探路"],
            solo: ["先一個人去看看", "什麼都要自己來", ctx.f("先一個人背著背包去{dest}", { dest })],
            company: ["先跟員工旅遊去", "公司出大部分的錢", ctx.f("先跟著公司的員工旅遊去{dest}", { dest })],
            later: [ctx.f("存夠了錢再帶{who}去", { who }), "錢留著比較安心", ctx.f("算了算團費，決定先存錢，等存夠了再帶{who}去", { who })],
          } },
        inCollege(s) && (s.track === "碩士" || uniYear(s) >= 3) && { key: "grad", lead: "畢業前第一次出國，", want: "畢業前想跟同學出國，",
          prompt: "畢業前，{同學|室友}約好要一起去{dest}畢業旅行，{連行程表都排好了。|大家{where}吵著要去哪裡。}這是你第一次出國，要怎麼去？",
          o: {
            friends: ["跟同學一起去", "自己安排，比較自由", "和{f}幾個同學一起去{dest}"],
            tour: ["大家一起報旅行團", "不用煩惱，行程很滿", ctx.f("和同學一起跟著旅行團去{dest}", { dest })],
            solo: ["不跟大家，自己背包旅行", "什麼都要自己來", ctx.f("一個人背著背包去{dest}", { dest })],
            later: ["先存錢，工作以後再去", "錢留著比較安心", "算了算旅費，決定先把錢存起來"],
          } },
      ]);
      const B = buttonsOf(base, sc), lead = sc.lead, did = (k, f) => ({ lead, did: f ? ctx.f(B[k][2], { f, dest }) : B[k][2], who, they });
      return {
        prompt: ctx.w(sc.prompt, { dest, who, where: y >= 2011 ? "在群組裡" : y >= 1998 ? "在 MSN 上" : "在教室裡" }),
        options: [
          {
            id: "y_firstTrip.tour", label: B.tour[0], hint: B.tour[1], act: "travel", style: "safe", weight: 0.3,
            apply: s2 => { spend(s2, 0.08); been(s2); return { text: ctx.w("{lead}你{did}，{行程從早排到晚，|導遊一路講笑話，}{你買了一堆伴手禮回來分給大家。|在免稅店幫家人挑了好久的禮物。}", did("tour")), mood: 4 }; },
          },
          {
            id: "y_firstTrip.friends", label: B.friends[0], hint: B.friends[1], act: "travel", style: "risk", weight: 0.25, when: () => y >= 1995,
            apply: (s2, c) => { spend(s2, 0.07); been(s2); const f = friendOf(s2, c, sc.key === "grad" ? { prefer: /大學|室友|系隊/, how: "大學同學" } : {}); return { text: ctx.w(y >= 2012 ? "{lead}你{did}，{迷路了好幾次，|全靠手機地圖和比手畫腳，}{吃到了最道地的小吃。|回來後約好明年再一起去。}" : "{lead}你{did}，{迷路了好幾次，|全靠一本旅遊書和比手畫腳，}{吃到了最道地的小吃。|回來後約好明年再一起去。}", did("friends", f.call)), mood: 5 }; },
          },
          {
            id: "y_firstTrip.solo", label: B.solo[0], hint: B.solo[1], act: "travel", style: "risk", weight: 0.15,
            apply: s2 => { spend(s2, 0.08); been(s2); return { text: ctx.w("{lead}你{did}，{住在青年旅館，和來自各國的旅人聊到半夜。|走錯路的時候，當地人陪你走到了車站。|每天走好幾萬步，晚上倒頭就睡。}", did("solo")), mood: 6 }; },
          },
          {
            id: "y_firstTrip.parents", label: B.parents[0], hint: B.parents[1], act: "travel", style: "family", weight: 0.15, when: s2 => parentsAlive(s2) && s2.employed,
            apply: s2 => { spend(s2, 0.15); been(s2); return { text: ctx.w("{lead}你{did}，{who}{一路上拍了好多照片，|在飯店房間裡偷偷算你花了多少錢，}{回來後跟親戚講了好幾個月。|說這是{they}最開心的一次旅行。}", did("parents")), mood: 6 }; },
          },
          {
            id: "y_firstTrip.company", label: B.company[0], hint: B.company[1], act: "travel", style: "social", weight: 0.1, when: s2 => s2.employed,
            apply: s2 => { spend(s2, 0.03); been(s2); return { text: ctx.w("{lead}你{did}，{一整台遊覽車都是同事，|晚上在飯店和同事聊到半夜，}{你看見了主管不為人知的一面。|回來後跟同事熟了很多。}", did("company")), mood: 4 }; },
          },
          {
            id: "y_firstTrip.later", label: B.later[0], hint: B.later[1], act: "save", style: "safe", weight: 0.1,
            apply: s2 => {
              frugal(s2, 1);
              const want = sc.want || ctx.f("想第一次出國去{dest}，", { dest });
              return { text: B.later[2]
                ? ctx.w("{want}你{did}，{在牆上貼了一張世界地圖，|把旅遊書放在床頭，}{告訴自己明年一定要去。|等以後再出發。}", { want, did: B.later[2] })
                : ctx.w("{want}你算了算{機票|團費}，決定先把錢存起來，{在牆上貼了一張世界地圖，|把旅遊書放在床頭，}{告訴自己明年一定要去。|等以後再出發。}", { want }), mood: 0 };
            },
          },
        ],
      };
    },
  },
  {
    id: "y_momPacks", domain: "family", channel: "good", tags: ["mother"], about: "mother", ages: [19, 30], cooldown: 3,
    // Only for someone living away from home: renting, or in a college dorm.
    when: s => s.mother.alive && !s.abroad && ((working(s) && s.home === "rent") || (inCollege(s) && !!s.flags.dorm)),
    p: () => 0.06,
    apply: (s, ctx) => {
      const away = s.county !== s.birthCounty;
      const t = [
        away ? "週末回家，媽媽塞了滿滿一袋{滷肉|水餃|水果|雞湯}讓你帶回{city}，{冰箱塞到關不起來。|你吃了一整個禮拜。}"
          : inCollege(s) ? "週末回家，媽媽塞了滿滿一袋{滷肉|水餃|水果|雞湯}讓你帶回宿舍，{冰箱塞到關不起來。|你吃了一整個禮拜。}"
            : "週末回家，媽媽塞了滿滿一袋{滷肉|水餃|水果|雞湯}讓你帶回租屋處，{冰箱塞到關不起來。|你吃了一整個禮拜。}",
        "{過年|中秋節}回家，媽媽一直問你{吃得好不好|住得習不習慣|錢夠不夠用}，{臨走前又偷偷在你包包裡塞了一個紅包。|送你到車站，一直揮手到車開走。}",
        "{颱風天|寒流來的時候}，媽媽打電話來問你{門窗關好了沒|衣服穿夠了沒}，{講了半個小時才掛。|你笑她囉唆，掛了電話卻有點想家。}",
      ];
      if (away) t.push("媽媽寄了一箱{家鄉的水果|自己做的菜|曬好的菜乾}到{city}，{紙箱上寫著：「記得冰起來。」|裡面還夾了一張寫滿叮嚀的紙條。}");
      return { text: ctx.w(t), mood: 3 };
    },
  },
  {
    id: "y_meetFamily", domain: "love", channel: "good", tags: ["spouse"], ages: [20, 30], cooldown: 3,
    when: s => dating(s) && s.age - s.datingSince >= 1 && s.flags.y_met !== s.partner.id, p: () => 0.1,
    choice: (s, ctx) => {
      const y = s.year, n = Math.max(1, s.age - s.datingSince), who = parentsWord(s), name = s.partner.call;
      const mine = parentsAlive(s) && ctx.rng() < 0.45;
      const bf = s.partner.sex === "male" ? "男朋友" : "女朋友";
      const met = s2 => { if (s2.partner) s2.flags.y_met = s2.partner.id; warm(s2); };
      return {
        prompt: mine
          ? told(s, ctx, ["和{partner}交往 {n} 年，{who}一直問什麼時候要帶{ta}回家吃飯。要怎麼安排？", "{過年|中秋節}快到了，{who}說想見見你的{bf}{partner}。要怎麼安排？"], { n, who, bf })
          : told(s, ctx, ["和{partner}交往 {n} 年，{partner}說爸媽想見見你。第一次去{ta}家吃飯，{你緊張到前一晚睡不著。|你不知道該帶什麼伴手禮。}要怎麼準備？", "{過年|中秋節}前，{partner}問你要不要一起回{ta}家吃飯。要怎麼準備？"], { n }),
        options: [
          {
            id: "y_meetFamily.gift", label: mine ? "事先準備，讓大家留個好印象" : "準備伴手禮，穿得正式一點", hint: "禮多人不怪", act: "talk", style: "safe", weight: 0.3,
            apply: (s2, c) => {
              met(s2);
              if (mine) return { text: c.w("第一次帶{partner}回家，你事先{幫{ta}準備了伴手禮，|把家裡打掃了一遍，}{who}{煮了一大桌菜，|拿出了珍藏的茶葉，}{一頓飯吃得很和樂。|飯後還翻出你小時候的照片給{ta}看。}", { who }), mood: 4 };
              return c.roll("love", "good", 0.65)
                ? { text: c.w("第一次去{partner}家，你帶了一盒{水果禮盒|鳳梨酥|茶葉}，{還特地穿了襯衫，|頭髮剪得短短的，}{ta}的爸媽{一直夾菜給你，|問了你的工作和家裡，}{飯後還留你下來喝茶。|臨走前說「下次再來」。}"), mood: 4 }
                : { text: c.w("第一次去{partner}家，你帶了一盒{水果禮盒|鳳梨酥}，{ta}的爸媽很客氣，卻一直問你{薪水多少、有沒有打算買房|家裡做什麼、以後要住哪裡}，你笑到臉都僵了。"), mood: -1 };
            },
          },
          {
            id: "y_meetFamily.natural", label: mine ? "像平常一樣就好" : "做自己就好", hint: "不想裝", act: "wait", style: "risk", weight: 0.25,
            apply: (s2, c) => {
              met(s2);
              const ok = c.roll("love", "good", 0.5);
              if (mine) return ok
                ? { text: c.w("第一次帶{partner}回家，你說就像平常一樣，{who}{問東問西，|一直問{ta}做什麼工作、家裡有幾個人，}{partner}{應對得很自然，你鬆了一口氣。|笑著一題一題回答。}", { who }), mood: 3 }
                : { text: c.w("第一次帶{partner}回家，你什麼都沒先交代，{who}{問了好多讓人尷尬的問題，|一直問什麼時候要結婚，}{partner}{整頓飯都很緊張。|回去的路上沉默了好久。}", { who }), mood: -2 };
              return ok
                ? { text: c.w("第一次去{partner}家，你決定做自己，{輕鬆地跟{ta}爸爸聊起{棒球|釣魚|股票}，|陪{ta}媽媽在廚房邊洗碗邊聊天，}{一頓飯吃得很開心。|{ta}爸媽說你很實在。}"), mood: 4 }
                : { text: c.w("第一次去{partner}家，你太輕鬆了，{穿著拖鞋就去，|吃完飯就{idle}，}回家後{partner}跟你說，{ta}爸媽有點意見。", { idle: y >= 2010 ? "滑起了手機" : "坐在沙發上看電視" }), mood: -2 };
            },
          },
          {
            id: "y_meetFamily.ask", label: mine ? ctx.f("先跟{who}打好招呼", { who }) : ctx.f("先問{name}爸媽喜歡什麼", { name }), hint: "做足功課", act: "seekHelp", style: "social", weight: 0.2,
            apply: (s2, c) => {
              met(s2);
              return mine
                ? { text: c.w("第一次帶{partner}回家前，你先跟{who}打好招呼，{請家裡不要問太多，|提醒家裡{partner}不吃辣，}{那頓飯吃得很順利。|{who}很快就跟{partner}聊開了。}", { who }), mood: 3 }
                : { text: c.w("第一次去{partner}家前，你先做足了功課，{知道{ta}爸爸愛喝茶、媽媽喜歡聽人稱讚她的菜，|問清楚了{ta}家裡的習慣，}{那頓飯你表現得很得體。|{ta}媽媽一直說你很有禮貌。}"), mood: 3 };
            },
          },
          {
            id: "y_meetFamily.help", label: "主動幫忙做家事", hint: "用行動表現", act: "care", style: "family", weight: 0.15,
            apply: (s2, c) => {
              met(s2);
              return mine
                ? { text: c.w("第一次帶{partner}回家，{partner}主動進廚房幫忙，{who}{笑得合不攏嘴。|偷偷跟你說：「這個不錯。」}", { who }), mood: 4 }
                : { text: c.w("第一次去{partner}家，吃完飯你主動{收碗、洗碗，|幫忙把桌子擦乾淨，}{ta}媽媽在廚房跟你聊了好久，{後來常常叫{partner}帶你回家吃飯。|偷偷跟{partner}說你是個好孩子。}"), mood: 3 };
            },
          },
          {
            id: "y_meetFamily.later", label: "還沒準備好，再等等", hint: "太緊張了", act: "avoid", style: "self", weight: 0.1,
            apply: (s2, c) => (mine
              ? { text: c.w("{who}一直想見{partner}，你覺得還太早，{推說最近太忙，|說再等等，}{who}{嘆了一口氣，|說好啦好啦，}{之後每次打電話都會問一次。|開始自己想像{partner}長什麼樣子。}", { who }), mood: -1 }
              : { text: c.w(y >= 2008
                ? "想到要見{partner}的爸媽，你太緊張了，跟{ta}說想再等等。{partner}{嘴上說沒關係，看得出來有點失望。|說好吧，改成先讓你跟{ta}爸媽視訊打個招呼。}"
                : "想到要見{partner}的爸媽，你太緊張了，跟{ta}說想再等等。{partner}{嘴上說沒關係，看得出來有點失望。|說好吧，改成先讓你在電話裡跟{ta}爸媽打個招呼。}"), mood: -1 }),
          },
        ],
      };
    },
  },
  {
    id: "y_longDistance", domain: "love", channel: "change", tags: ["spouse"], ages: [18, 30], cooldown: 5, when: s => dating(s),
    p: s => (s.flags.movedNorth === s.age || s.last.move === s.age || s.last.military === s.age || s.flags.y_awayAt === s.age ? 0.4 : 0.03),
    choice: (s, ctx) => {
      const y = s.year, ta = pronoun(s.partner);
      // Why you are apart; the prompt says it in its own words.
      const cause = s.last.military === s.age && s.sex === "male" ? 0 : s.flags.y_awayAt === s.age ? 1
        : s.flags.movedNorth === s.age || s.last.move === s.age ? 2
          : ctx.rng.pick([3, 4, 5]);
      const army = cause === 0, overseas = cause === 1, hsr = y >= 2007;
      const daily = y < 1990 ? ctx.f("每週寫信給{ta}", { ta }) : y < 1998 ? "每天講電話" : y < 2005 ? "每天傳簡訊、講電話" : y < 2011 ? "每天在 MSN 上聊天" : "每天視訊";
      const dailyText = y < 1990 ? "和{partner}變成遠距離，你們約好每週寫信，{信紙上寫滿了生活的小事，|你把{ta}的信收在一個餅乾盒裡，}{收到回信那天，是一週裡最開心的一天。|郵差都認得你了。}"
        : y < 1998 ? "和{partner}變成遠距離，你們每天晚上講電話，{電話費帳單嚇了家人一跳，|常常講到話筒發燙，}{再累也要說一聲晚安。|有時候只是聽著對方的呼吸聲。}"
          : y < 2005 ? "和{partner}變成遠距離，你們每天傳簡訊、講電話，{手機帳單一個月比一個月高，|一封簡訊要想好久才按下傳送，}{再累也要說一聲晚安。|{ta}的簡訊存到手機滿了，你都捨不得刪。}"
            : y < 2011 ? "和{partner}變成遠距離，你們每天晚上在 MSN 上聊天，{{ta}的暱稱換了什麼，你都第一個發現。|視訊畫面卡卡的，你們還是聊到半夜。}"
              : "和{partner}變成遠距離，你們每天視訊，{有時候只是開著鏡頭各做各的事，|LINE 的貼圖傳了好幾百張，}{再累也要說一聲晚安。|好像{ta}就在身邊。}";
      return {
        prompt: ctx.w([
          "你去當兵，和{partner}變成了遠距離。要怎麼維持？",
          "你出國交換，和{partner}變成了遠距離。要怎麼維持？",
          "你搬到{city}，和{partner}變成了遠距離。要怎麼維持？",
          "{partner}被公司派到{新竹|台中|高雄|台南}，兩個人變成了遠距離。要怎麼維持？",
          "{partner}去{南部|北部}讀研究所，兩個人變成了遠距離。要怎麼維持？",
          "{partner}換了一份在外縣市的工作，兩個人變成了遠距離。要怎麼維持？",
        ][cause]),
        options: [
          {
            id: "y_longDistance.daily", label: daily, hint: "再忙也要聯絡", act: "talk", style: "social", weight: 0.3,
            apply: (s2, c) => { warm(s2); return { text: c.w(dailyText), mood: 2 }; },
          },
          {
            id: "y_longDistance.visit", label: army ? ctx.f("一放假就去找{ta}", { ta }) : ctx.f("每個週末去找{ta}", { ta }), hint: "車票錢不少", act: "travel", style: "family", weight: 0.25, when: () => !overseas,
            apply: (s2, c) => { spend(s2, 0.03); warm(s2); return { text: c.w(army
              ? hsr ? "和{partner}變成遠距離，你一放假就{搭{高鐵|客運}去找{ta}，|跟{ta}約在兩個人中間的城市見面，}{車票錢花了不少，|在車上的時間都拿來補眠，}{但見面的那一刻，一切都值得。|兩個人把每次見面都當成約會。}"
                : "和{partner}變成遠距離，你一放假就{搭{火車|客運}去找{ta}，|跟{ta}約在兩個人中間的城市見面，}{車票錢花了不少，|在車上的時間都拿來補眠，}{但見面的那一刻，一切都值得。|兩個人把每次見面都當成約會。}"
              : hsr ? "和{partner}變成遠距離，你每個週末{搭{高鐵|客運}去找{ta}，|跟{ta}約在兩個人中間的城市見面，}{車票錢花了不少，|在車上的時間都拿來補眠，}{但見面的那一刻，一切都值得。|兩個人把每次見面都當成約會。}"
                : "和{partner}變成遠距離，你每個週末{搭{火車|客運}去找{ta}，|跟{ta}約在兩個人中間的城市見面，}{車票錢花了不少，|在車上的時間都拿來補眠，}{但見面的那一刻，一切都值得。|兩個人把每次見面都當成約會。}"), mood: 3 }; },
          },
          {
            id: "y_longDistance.plan", label: "約好搬到同一個城市", hint: "有目標比較撐得下去", act: "moveHome", style: "risk", weight: 0.12,
            apply: (s2, c) => { warm(s2); return { text: c.w("和{partner}變成遠距離，你們約好{一年後|等{ta}的工作告一段落，}要搬到同一個城市，{在月曆上畫了一個大圈。|開始一起存錢。}有了目標，等待好像也沒那麼難了。"), mood: 2 }; },
          },
          {
            id: "y_longDistance.space", label: "給彼此空間，順其自然", hint: "不想給對方壓力", act: "wait", style: "self", weight: 0.23,
            apply: (s2, c) => {
              if (c.roll("love", "bad", 0.4)) { cool(s2); return { text: c.w("和{partner}變成遠距離，你們各自忙著，{聯絡越來越少，|有時候一兩天都沒說話，}{你開始不確定你們會走到哪裡。|見面時，兩個人都有點陌生。}"), mood: -3 }; }
              return { text: c.w("和{partner}變成遠距離，你們都忙自己的事，見面時反而{更珍惜。|有說不完的話。}"), mood: 1 };
            },
          },
          {
            id: "y_longDistance.mail", label: ctx.f("寄卡片和小包裹給{ta}", { ta }), hint: "見不到面，心意要到", act: "talk", style: "family", weight: 0.1,
            apply: (s2, c) => { warm(s2); return { text: c.w("和{partner}變成遠距離，你常常寄{手寫卡片|家鄉的零食|一張明信片}給{ta}，{ta}把它們{貼滿了房間的牆。|收在一個餅乾盒裡。}"), mood: 3 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_cohabit", domain: "love", channel: "change", tags: ["spouse"], ages: [22, 30], cooldown: 3,
    when: s => dating(s) && s.year >= 1990 && s.age - s.datingSince >= 1 && working(s) && s.home !== "own" && s.flags.y_cohabit !== s.partner.id, p: () => 0.07,
    choice: (s, ctx) => {
      const n = Math.max(1, s.age - s.datingSince), who = parentsWord(s);
      const together = s2 => { if (s2.home !== "own") s2.home = "rent"; if (s2.partner) s2.flags.y_cohabit = s2.partner.id; frugal(s2, 1); warm(s2); };
      return {
        prompt: told(s, ctx, ["和{partner}交往 {n} 年，兩個人的房租加起來{好貴|快要一個月的薪水}，{ta}提議乾脆住在一起。要同居嗎？", "{partner}的租約快到期了，{ta}提議兩個人乾脆一起租一間。要同居嗎？", "你和{partner}常常待在彼此的住處，牙刷都放了兩支。要不要乾脆住在一起？"], { n }),
        options: [
          {
            id: "y_cohabit.yes", label: "搬進同一間", hint: "省房租，也更了解彼此", act: "wait", style: "risk", weight: 0.25,
            apply: (s2, c) => { together(s2); return { text: c.w("你和{partner}搬進一間{兩房的小公寓|有陽台的套房}，{才發現{ta}擠牙膏是從中間擠的。|第一個週末一起去{shop}買了好多東西。|兩個人輪流煮晚餐、分攤房租。}", { shop: s2.year >= 1994 ? "IKEA" : "家具行" }), mood: 4 }; },
          },
          {
            id: "y_cohabit.own", label: "先各住各的", hint: "保留自己的空間", act: "wait", style: "self", weight: 0.3,
            apply: (s2, c) => ({ text: c.w("{partner}提議同居，你想保留自己的空間，{說好週末再一起過。|各住各的，見面反而更珍惜。}"), mood: 0 }),
          },
          {
            id: "y_cohabit.parents", label: ctx.f("先跟{who}說", { who }), hint: "家裡的觀念不一定接受", act: "talk", style: "family", weight: 0.15, when: s2 => parentsAlive(s2),
            apply: (s2, c) => {
              if (c.roll("family", "good", 0.5)) { together(s2); return { text: c.w("想跟{partner}同居，你先跟{who}說了，{who}{雖然有點擔心，還是說「你們自己想清楚就好」。|要你們週末常回家吃飯。}", { who }), mood: 2 }; }
              return { text: c.w("想跟{partner}同居，你先跟{who}說了，{who}的觀念比較保守，{堅持要結婚才能住在一起，|唸了你好幾天，}你們決定先緩一緩。", { who }), mood: -2 };
            },
          },
          {
            id: "y_cohabit.trial", label: "先試住一個月", hint: "看看合不合得來", act: "wait", style: "learn", weight: 0.15,
            apply: (s2, c) => {
              if (c.roll("love", "good", 0.55)) { together(s2); return { text: c.w("你和{partner}先試住了一個月，{發現兩個人的作息很合，|雖然為了誰洗碗吵了幾次，}月底就把另一間退租了。"), mood: 3 }; }
              cool(s2);
              return { text: c.w("你和{partner}先試住了一個月，{才發現兩個人的生活習慣差好多，|為了冷氣溫度和誰洗碗吵了好幾次，}決定還是各住各的。"), mood: -1 };
            },
          },
          {
            id: "y_cohabit.wait", label: "等結婚再說", hint: "對兩邊家裡比較好交代", act: "wait", style: "safe", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("{partner}提議同居，你覺得{等結婚再住在一起比較好，|等結婚再住在一起，對兩邊家裡比較好交代，}{ta}也尊重你的想法。"), mood: 0 }),
          },
        ],
      };
    },
  },
  {
    id: "y_quarrel", domain: "love", channel: "bad", tags: ["spouse"], ages: [18, 30], cooldown: 2, when: s => dating(s) && s.age > s.datingSince, p: () => 0.08,
    choice: (s, ctx) => {
      const y = s.year, ta = pronoun(s.partner);
      const topic = ctx.rng.pick(["忘記紀念日的事", "花錢的習慣", "工作太忙、很少約會", "以後要住在哪裡", y >= 2011 ? "訊息已讀不回" : y >= 1998 ? "手機一直沒接" : "約會遲到", y >= 2008 ? "一直滑手機不理人" : "跟異性朋友走得太近"]);
      const silent = y >= 1998 ? "一整天都沒回你訊息" : "一整天都沒打電話給你";
      return {
        prompt: told(s, ctx, ["和{partner}為了{topic}吵了一架，{ta}{silent}。要怎麼辦？", "因為{topic}，你和{partner}在{餐廳|回家的路上|電話裡}吵了起來，最後不歡而散。要怎麼辦？"], { topic, silent }),
        options: [
          {
            id: "y_quarrel.sorry", label: "先道歉", hint: "退一步", act: "reconcile", style: "family", weight: 0.25,
            apply: (s2, c) => { warm(s2); return { text: c.w("和{partner}為了{topic}吵架。你先開口道歉，{partner}{紅著眼睛說「我也有不對」。|愣了一下，還是笑了。}", { topic }), mood: 1 }; },
          },
          {
            id: "y_quarrel.talk", label: "冷靜一晚，再好好談", hint: "把在意的事說清楚", act: "talk", style: "social", weight: 0.25,
            apply: (s2, c) => { warm(s2); return { text: c.w("和{partner}為了{topic}吵架。隔天你們找了{一家安靜的咖啡店|河堤邊}好好談，{才知道{ta}在意的其實是另一件事。|兩個人約好以後吵架不過夜。}", { topic }), mood: 2 }; },
          },
          {
            id: "y_quarrel.treat", label: ctx.f("買{ta}愛吃的東西去找{ta}", { ta }), hint: "用行動和好", act: "talk", style: "risk", weight: 0.15,
            apply: (s2, c) => { warm(s2); return { text: c.w(y >= 1988
              ? "和{partner}為了{topic}吵架。你買了{ta}最愛的{雞排|珍珠奶茶|豆花|蛋糕}，出現在{ta}家樓下，{partner}{嘴上說不要，還是吃完了。|一看到你就笑了。}"
              : "和{partner}為了{topic}吵架。你買了{ta}最愛的{滷味|豆花|蛋糕}，出現在{ta}家樓下，{partner}{嘴上說不要，還是吃完了。|一看到你就笑了。}", { topic }), mood: 2 }; },
          },
          {
            id: "y_quarrel.cold", label: "冷戰", hint: "誰也不想先低頭", act: "avoid", style: "self", weight: 0.25,
            apply: (s2, c) => { cool(s2); return { text: c.w(y >= 2011
              ? "和{partner}為了{topic}吵架，{兩個人冷戰了一個禮拜，|誰也不肯先低頭，}{最後是{ta}先傳了一張貼圖過來。|後來不了了之，心裡卻都有個結。}"
              : "和{partner}為了{topic}吵架，{兩個人冷戰了一個禮拜，|誰也不肯先低頭，}{最後是{ta}先打了電話過來。|後來不了了之，心裡卻都有個結。}", { topic }), mood: -3 }; },
          },
          {
            id: "y_quarrel.friend", label: "找朋友訴苦", hint: "聽聽旁觀者怎麼說", act: "seekHelp", style: "social", weight: 0.1,
            apply: (s2, c) => { const f = friendOf(s2, c).call; return { text: c.w("和{partner}為了{topic}吵架，你找{f}{吃宵夜|喝一杯}訴苦，{f}聽完說：「{你也有不對啦。|這種事大家都經歷過。}」{你想通了，回去主動和好。|心情好多了。}", { f, topic }), mood: 1 }; },
          },
        ],
      };
    },
  },
  {
    // 曖昧對象出現：只寫心裡的掙扎和怎麼面對，不寫越線。
    id: "y_temptation", domain: "love", channel: "bad", tags: ["spouse"], ages: [20, 29], max: 1, when: s => dating(s), p: () => 0.03,
    choice: (s, ctx) => {
      const y = s.year, work = working(s), name = s.partner.call;
      const who = ctx.rng.pick(work ? ["公司新來的同事", "常常一起開會的客戶", "健身房常遇到的人"] : ["社團認識的朋友", "同一堂課的同學", "打工認識的人"]);
      const msg = y < 1998 ? "常常打電話給你" : work ? "每天傳訊息問你下班了沒" : "每天傳訊息問你下課了沒";
      return {
        prompt: ctx.w("{{who}|一個好久不見的老同學}最近{常常約你吃飯|{msg}|總是對你特別好}，你發現自己有點期待對方的消息，心裡有點亂。要怎麼辦？", { who, msg }),
        options: [
          {
            id: "y_temptation.distance", label: "自然地提起自己有對象", hint: "把界線畫清楚", act: "talk", style: "social", weight: 0.35,
            apply: (s2, c) => { warm(s2); return { text: c.w("察覺到對方的好感，你在聊天時自然地提起{partner}，{之後對方也就保持了距離。|把單獨吃飯的邀約都改成大家一起去。}"), mood: 0 }; },
          },
          {
            id: "y_temptation.tell", label: ctx.f("坦白告訴{name}", { name }), hint: "不想有祕密", act: "talk", style: "family", weight: 0.2,
            apply: (s2, c) => {
              if (c.roll("love", "good", 0.6)) { warm(s2); return { text: c.w("察覺到有人對你有好感，你跟{partner}坦白了，{partner}{沉默了一下，然後握住你的手。|說：「謝謝你告訴我。」}你們反而更親近了。"), mood: 2 }; }
              return { text: c.w("察覺到有人對你有好感，你跟{partner}坦白了，{partner}{吃醋了好幾天，|問了好多問題，}{你花了一些時間才讓{ta}安心。|兩個人約好以後有事都要說。}"), mood: -1 };
            },
          },
          {
            id: "y_temptation.enjoy", label: "享受被欣賞，但不越線", hint: "只是朋友而已", act: "wait", style: "self", weight: 0.2,
            apply: (s2, c) => {
              if (c.roll("love", "bad", 0.4)) { cool(s2); return { text: c.w(y >= 2005 ? "覺得只是朋友，你照樣跟對方吃飯聊天，直到{partner}看到你們的對話紀錄，{兩個人大吵了一架。|{ta}有好一陣子不太跟你說話。}" : "覺得只是朋友，你照樣跟對方吃飯聊天，直到{partner}撞見你們一起吃飯，{兩個人大吵了一架。|{ta}有好一陣子不太跟你說話。}"), mood: -4 }; }
              return { text: c.w("你享受被欣賞的感覺，但始終守著界線，{慢慢地，對方也找到了自己的對象。|那段曖昧，最後只是一段小插曲。}"), mood: 0 };
            },
          },
          {
            id: "y_temptation.cut", label: "不再單獨見面", hint: "不讓事情變複雜", act: "cutOff", style: "safe", weight: 0.1,
            apply: (s2, c) => ({ text: c.w("察覺到對方的好感，你不想讓事情變複雜，{不再跟對方單獨見面，|慢慢減少了聯絡，}{雖然有點可惜，心裡卻踏實了。|也把這件事放下了。}"), mood: 0 }),
          },
          {
            id: "y_temptation.think", label: "認真想想自己要什麼", hint: "給自己一點時間", act: "wait", style: "learn", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("察覺到自己的心動，你一個人去{海邊|山上}走了一趟，{發現自己真正想要的，還是和{partner}一起的日子。|決定把心思放回{partner}身上，週末安排了一趟小旅行。}"), mood: 1 }),
          },
        ],
      };
    },
  },
  {
    id: "y_date", domain: "love", channel: "good", tags: ["spouse"], ages: [18, 30], cooldown: 3, when: s => dating(s) && !s.abroad, p: () => 0.08,
    apply: (s, ctx) => {
      const y = s.year, place = pickSpot(DATES[regionOf(s.county)] || DATES.islands, y, ctx), n = s.age - s.datingSince;
      // A night in, by era: the two parts of a {甲|乙} choice.
      const [w1, w2] = y < 1985 ? ["聽了一整晚的唱片，", "看了一部電視上的老電影，"] : y < 2000 ? ["租了幾支錄影帶，", "看了一整晚的電視，"] : y < 2013 ? ["租了好幾片 DVD，", "看了一整晚的電影，"] : ["追了一整晚的影集，", "看了兩部電影，"];
      const t = [
        "和{partner}去{place}，{兩個人聊到忘了時間。|你偷偷拍了好多張{ta}的側臉。|回程時{ta}靠在你肩膀上睡著了。}",
        "{颱風天|寒流來的晚上}，你和{partner}窩在家裡{{w1}|{w2}}{煮了一鍋泡麵加蛋，|叫了一份鹹酥雞，}{覺得這樣就很幸福。|外面風雨再大都沒關係。}",
        "{partner}生日那天，你{排了兩個小時的隊，買到{ta}一直想吃的蛋糕。|親手做了一本相簿，把你們的照片一張一張貼上去。}{ta}{抱著你哭了。|笑你傻，卻一直捧在手上。}",
      ];
      if (n >= 1) t.push(n <= 10 ? "交往{years}週年，{partner}{準備了一個小驚喜，|訂了你們第一次約會的餐廳，}{你感動得說不出話。|那天的晚餐你記了好久。}" : "交往 {n} 週年，{partner}{準備了一個小驚喜，|訂了你們第一次約會的餐廳，}{你感動得說不出話。|那天的晚餐你記了好久。}");
      return { text: told(s, ctx, t, { place, w1, w2, years: cn(n), n }), mood: 3 };
    },
  },

  // ---------- friends ----------
  {
    id: "y_bestman", once: true, ages: [23, 30], when: s => !s.abroad && s.rel !== "married", p: () => 0.04,
    choice: (s, ctx) => {
      const role = s.sex === "male" ? "伴郎" : "伴娘", y = s.year, male = s.sex === "male";
      const bff = s.friends.find(x => x.id === s.flags.bff && x.alive !== false && x.sex === s.sex);
      const f = bff || friendOf(s, ctx, { sex: s.sex }), name = f.call;
      return {
        prompt: ctx.f("{who}要結婚了，找你當{role}。要怎麼回應？", { who: bff ? ctx.f("從小一起長大的{name}", { name }) : friendIntro(f, ctx), role }),
        options: [
          {
            id: "y_bestman.yes", label: "一口答應，全力幫忙", hint: "從早忙到晚", act: "socialize", style: "social", weight: 0.35,
            apply: (s2, c) => {
              spend(s2, 0.02); bond(f, 0.1); c.remember("y_bestman", c.f("當了{name}的{role}", { name, role }));
              return { text: c.w(male
                ? "{name}結婚找你當伴郎，你一口答應，{迎娶那天一早五點就到{name}家，|幫忙跑腿、擋酒、招呼客人，}{陪著他一關一關闖過伴娘團的考驗。|喝了好幾杯喜酒，累到腳軟。}{看著{name}在台上紅了眼眶，你也跟著鼻酸。|婚禮結束時，{name}抱了你一下說謝謝。}"
                : "{name}結婚找你當伴娘，你一口答應，{一早就到新娘房幫忙，|幫她提裙襬、擋酒、補妝，}{穿著高跟鞋站了一整天。|累到腳軟，卻笑了一整天。}{看著{name}走上紅毯，你也跟著紅了眼眶。|送客時，{name}抱著你說謝謝。}", { name }), mood: 4 };
            },
          },
          {
            id: "y_bestman.games", label: male ? "負責幫新郎闖關" : "負責設計闖關遊戲", hint: "讓婚禮熱鬧一點", act: "socialize", style: "risk", weight: 0.15, when: () => y >= 1990,
            apply: (s2, c) => ({ text: c.w(male
              ? "{name}結婚，你當伴郎負責幫他闖關，{替他做了五十個伏地挺身，|喝下了一大杯苦瓜汁，|在門口唱了一首情歌，}{總算把新娘娶出了門。|大家笑成一團。}"
              : "{name}結婚，你和伴娘團設計了迎娶的闖關遊戲，{要新郎說出新娘的十個優點，|讓新郎唱一首情歌，|在門口擋了新郎半個小時，}{大家笑到不行。|{name}笑著說你們太狠了。}", { name }), mood: 4 }),
          },
          {
            id: "y_bestman.video", label: y >= 2005 ? "幫忙做婚禮影片" : "負責婚禮的攝影", hint: "用作品當賀禮", act: "hobby", style: "learn", weight: 0.15,
            apply: (s2, c) => ({ text: c.w(y >= 2005
              ? "{name}結婚，你熬了好幾個晚上，幫忙做了一支{成長影片|愛情故事影片}，{在婚宴上播放時，{name}的爸媽都哭了。|全場跟著一起拍手。}"
              : "{name}結婚，你負責婚禮的攝影，{拍了好幾卷底片，|跟著新人跑了一整天，}{後來那本相簿，{name}一直留著。|{name}說那是他們最喜歡的照片。}", { name }), mood: 4 }),
          },
          {
            id: "y_bestman.decline", label: ctx.f("婉拒當{role}，包個大紅包", { role }), hint: "人到，心意到", act: "wait", style: "self", weight: 0.15,
            apply: (s2, c) => { spend(s2, 0.03); return { text: c.w(male
              ? "{name}找你當伴郎，你{那陣子工作太忙，|怕自己太緊張出糗，}婉拒了，{但包了一個大紅包，|喜宴那天還是第一個到，}{name}笑著說人來就好。"
              : "{name}找你當伴娘，你{想起長輩說「當伴娘超過三次會嫁不出去」，|那陣子工作太忙，}婉拒了，{但包了一個大紅包，|喜宴那天還是第一個到，}{name}笑著說人來就好。", { name }), mood: 1 }; },
          },
          {
            id: "y_bestman.speech", label: "答應，還上台致詞", hint: "要先寫講稿", act: "socialize", style: "family", weight: 0.1,
            apply: (s2, c) => { bond(f, 0.1); return { text: c.w(male
              ? "{name}結婚，你當伴郎，還在婚宴上致詞，{寫了好幾版講稿，|上台前手一直抖，}{講到你們以前的糗事，全場都笑了。|講到最後，{name}哭得說不出話。}"
              : "{name}結婚，你當伴娘，還在婚宴上致詞，{寫了好幾版講稿，|上台前手一直抖，}{講到你們以前的糗事，全場都笑了。|講到最後，{name}哭得妝都花了。}", { name }), mood: 4 }; },
          },
        ],
      };
    },
  },
  {
    // 好友遇到低潮，半夜找你。
    id: "y_friendDown", ages: [18, 29], cooldown: 4, max: 2, when: s => !s.abroad, p: () => 0.025,
    choice: (s, ctx) => {
      const y = s.year, f = friendOf(s, ctx), name = f.call, fta = pronoun(f);
      const what = ctx.rng.pick(s.age < 22 ? ["失戀了", "考試考砸了", "跟家裡大吵了一架", "被好朋友誤會了"] : ["失戀了", "被交往好幾年的對象分手了", "研究所沒考上", "工作被裁員了", "跟家裡大吵了一架"]);
      const call = y >= 2011 ? "傳了一句「睡了嗎」" : y >= 1998 ? "打了你的手機" : "打電話到你家";
      const lead = ctx.f("{name}{what}", { name, what }), v = { lead, name, fta };
      return {
        prompt: ctx.w("半夜一點，{intro}{call}，說{what}，{聲音聽起來很糟。|一直說沒事，卻一直不掛電話。}要怎麼辦？", { intro: friendIntro(f, ctx), call, what }),
        options: [
          {
            id: "y_friendDown.go", label: ctx.f("馬上去找{fta}", { fta }), hint: "人到最重要", act: "care", style: "family", weight: 0.25,
            apply: (s2, c) => { bond(f, 0.1); return { text: c.w("{lead}，你{抓了外套就出門，|騎車穿過半個城市，}在{便利商店門口|河堤邊|{fta}家樓下}陪{fta}坐到天亮，{{fta}哭完說好多了。|兩個人沒說什麼話，只是一起看著天慢慢變亮。}", v), mood: 1 }; },
          },
          {
            id: "y_friendDown.listen", label: "陪著講電話到天亮", hint: "先聽就好", act: "talk", style: "social", weight: 0.25,
            apply: (s2, c) => { bond(f, 0.05); return { text: c.w("{lead}，你陪{fta}講電話講到天亮，{大部分的時間都是{fta}在說，你在聽。|話筒燙到不行，你們還是沒掛。}{隔天你一直打瞌睡，但一點也不後悔。|最後{fta}說：「謝謝你在。」}", v), mood: 0 }; },
          },
          {
            id: "y_friendDown.trip", label: ctx.f("週末約{fta}出去走走", { fta }), hint: "換個地方透透氣", act: "travel", style: "risk", weight: 0.15,
            apply: (s2, c) => { spend(s2, 0.02); return { text: c.w("{lead}，你約{fta}週末{去墾丁看海，|去花蓮的海邊走走，|去淡水看夕陽，|上九份喝茶，|去日月潭騎腳踏車，}{兩個人一路上沒說太多話，|一路上吃吃喝喝，}{回來的時候，{fta}終於笑了。|{fta}說好像重新活過來了。}", v), mood: 2 }; },
          },
          {
            id: "y_friendDown.gang", label: ctx.f("找大家一起陪{fta}", { fta }), hint: "人多比較熱鬧", act: "socialize", style: "social", weight: 0.12,
            apply: (s2, c) => ({ text: c.w(y >= 1988
              ? "{lead}，你找了幾個老朋友，{一起陪{fta}去吃熱炒，|在 KTV 唱了一整晚，}{大家輪流講自己的糗事逗{fta}笑。|{name}一直說：「有你們真好。」}"
              : "{lead}，你找了幾個老朋友，{一起陪{fta}去吃熱炒，|在冰果室坐到打烊，}{大家輪流講自己的糗事逗{fta}笑。|{name}一直說：「有你們真好。」}", v), mood: 2 }),
          },
          {
            id: "y_friendDown.space", label: ctx.f("先讓{fta}靜一靜", { fta }), hint: "給對方一點時間", act: "wait", style: "self", weight: 0.23,
            apply: (s2, c) => ({ text: c.w(y >= 2011
              ? "{lead}，你覺得{fta}需要一點時間，{回了一句「需要我的話，我都在」，{fta}後來說，那句話對{fta}很重要。|跟{fta}約好隔天一起吃飯，第二天{fta}準時出現，眼睛還是腫的。}"
              : "{lead}，你覺得{fta}需要一點時間，{說了一句「想說話就打給我」，{fta}後來說，那句話對{fta}很重要。|跟{fta}約好隔天一起吃飯，第二天{fta}準時出現，眼睛還是腫的。}", v), mood: 0 }),
          },
        ],
      };
    },
  },
  {
    id: "y_friendAway", once: true, ages: [20, 30], when: s => s.year >= 1975 && !s.abroad, p: () => 0.03,
    apply: (s, ctx) => {
      const y = s.year, f = friendOf(s, ctx), name = f.call;
      const dest = ctx.rng.pick(y < 1990 ? ["美國讀書", "日本讀書", "加拿大"] : y < 2004 ? ["美國讀研究所", "上海工作", "日本讀書", "加拿大"] : ["澳洲打工度假", "日本工作", "美國讀研究所", "新加坡工作", "上海工作", "德國讀書"]);
      const airport = y < 1979 ? "松山機場" : y < 2006 ? "中正機場" : "桃園機場";
      // Keeping in touch, by era: the two parts of a {甲|乙} choice; and from far away, a third.
      const [k1, k2] = y >= 2011 ? ["約好每個月視訊一次，", "靠著 LINE 聯絡，"] : y >= 2005 ? ["約好每個月視訊一次，", "靠著 MSN 聯絡，"] : ["約好常常寫信，", "偶爾打一通越洋電話，"];
      const far = /美國|加拿大|德國/.test(dest);
      return {
        text: ctx.w([
          y >= 1988
            ? "{intro}要去{dest}，出發前一晚，你們{在熱炒店喝到半夜，|去 KTV 唱到天亮，|在河堤邊聊了一整晚，}{name}說一定會回來。"
            : "{intro}要去{dest}，出發前一晚，你們{在冰果室聊到打烊，|在河堤邊聊了一整晚，}{name}說一定會回來。",
          "你送{name}到{airport}，看著{fta}拖著兩個大行李箱去{dest}，{在出境大廳揮手揮到看不見。|回程的車上，你一直看著窗外。}",
          far
            ? "{name}去{dest}以後，你們{{k1}|{k2}}{時差讓你們常常一個在吃早餐、一個準備睡覺。|{name}寄來一張明信片，你貼在冰箱上。|每次{name}回台灣，你們都約出來吃一頓。}"
            : "{name}去{dest}以後，你們{{k1}|{k2}}{{name}寄來一張明信片，你貼在冰箱上。|每次{name}回台灣，你們都約出來吃一頓。}",
        ], { intro: friendIntro(f, ctx), dest, name, airport, fta: pronoun(f), k1, k2 }),
        mood: -1,
      };
    },
  },
  {
    id: "y_reunion", ages: [24, 29], max: 1, when: s => !s.studying && !s.abroad && ["大學", "科大", "碩士"].includes(s.edu), p: () => 0.045,
    choice: (s, ctx) => {
      const y = s.year, n = Math.max(1, s.age - (s.last.graduateUni ?? s.age - 3));
      const call = y >= 2011 ? "班代在 LINE 群組上發起同學會" : y >= 2008 ? "班代在臉書上發起同學會" : y >= 1998 ? "班代寄了 email，約大家開同學會" : "班代一個一個打電話，約大家開同學會";
      return {
        prompt: ctx.w("大學畢業 {n} 年，{call}。{聽說有人當了主管，有人已經當爸媽了。|大家好久沒見了。}要去嗎？", { n, call }),
        options: [
          {
            id: "y_reunion.go", label: "去，好好敘舊", hint: "好久不見", act: "socialize", style: "social", weight: 0.35,
            apply: (s2, c) => ({ text: c.w("大學同學會上，{大家聊起當年翹課、夜衝的糗事，笑到停不下來。|看著大家的變化，你發現大家其實都沒變。|有人帶著另一半，有人抱著孩子，熱鬧得不得了。}"), mood: 3 }),
          },
          {
            id: "y_reunion.skip", label: "不去，怕被比較", hint: "現在不想被問東問西", act: "avoid", style: "self", weight: 0.25,
            apply: (s2, c) => ({ text: c.w(y >= 2008
              ? "大學同學會，你想了想{還是沒去，|推說要加班，}{在網路上看到大家的合照，默默按了讚。|晚上滑著大家的合照，有點後悔。}"
              : "大學同學會，你想了想{還是沒去，|推說要加班，}{後來聽說大家玩得很開心。|隔天聽同學說了好多八卦。}"), mood: -1 }),
          },
          {
            id: "y_reunion.network", label: "去，順便打聽工作機會", hint: "多認識一些人", act: "seekHelp", style: "risk", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("大學同學會上，你{跟幾個同業的同學交換了名片，|聽說誰的公司在找人，}{後來真的有人幫你牽了線。|多了好幾個可以請教的人。}"), mood: 2 }),
          },
          {
            id: "y_reunion.host", label: "乾脆自己來辦", hint: "要聯絡很多人", act: "socialize", style: "family", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("你主動把大學同學會辦了起來，{訂了一間熱炒店，|請了以前的導師一起來，}{來了二十幾個人，|大家一個拉一個地出現，}{熱鬧得像回到了大一。|老師說你們都長大了。}"), mood: 4 }),
          },
          {
            id: "y_reunion.few", label: "只約幾個最好的朋友", hint: "人少比較能聊", act: "socialize", style: "safe", weight: 0.1,
            apply: (s2, c) => { const f = friendOf(s2, c, { prefer: /大學|室友|系隊/, how: "大學同學" }); return { text: c.w("大學同學會人太多，你只約了{f}幾個最好的朋友吃飯，{聊到餐廳打烊。|聊彼此的工作和感情，像回到宿舍的夜晚。}", { f: f.call }), mood: 3 }; },
          },
        ],
      };
    },
  },
];
