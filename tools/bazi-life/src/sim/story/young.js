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
import { COUNTIES, JOBS, regionOf, moveTo } from "../world.js";
import { pronoun } from "../people.js";

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
// Where the work happens, for 「工廠缺人」.
const siteOf = s => ({ 製造: "工廠", 營造: "工地", 醫療: "醫院", 餐飲: "店裡", 零售: "店裡" }[s.job.field] || (SHOP.includes(s.job.title) ? "店裡" : "公司"));
// Who would try to hire you away.
const rivalOf = s => ({ 教育: "{另一間學校|一間私立學校}", 醫療: "{另一家醫院|一間診所}", 社福: "另一個社福機構" }[s.job.field] || (SHOP.includes(s.job.title) ? "{另一家店|附近新開的店}" : "{另一家公司|對手公司}"));
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

// ---------- friends ----------
const FRIEND_HOW = /同學|同事|室友|隊友|同梯|鄰居|社友|同好|朋友/;
// How the story first names a friend: 大學室友阿傑, or 好友阿傑 when we do not know how you met.
const friendIntro = f => (typeof f.how === "string" && f.how.length <= 6 && FRIEND_HOW.test(f.how) && !/[{}|]/.test(f.how) ? `${f.how}${f.call}` : `好友${f.call}`);
const defaultHow = s => (inCollege(s) || ["大學", "科大", "碩士", "博士"].includes(s.edu) ? "大學同學" : s.employed && s.age >= 20 ? "同事" : s.edu === "none" ? "朋友" : `${s.edu}同學`);
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
const majorLead = s => (s.edu === "高中" && (SCI.test(majorOf(s)) || ART.test(majorOf(s))) ? `高中念${majorOf(s)}，` : "");

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
const scooterOf = y => (y < 1974 ? "偉士牌機車" : y < 1990 ? "{偉士牌機車|野狼 125|光陽機車}" : y < 2003 ? "{光陽|三陽|山葉}機車" : y < 2016 ? "{勁戰|雷霆}" : "{新勁戰|雷霆| JET S}");

export const YOUNG = [
  // ---------- college ----------
  {
    // The first weeks of college. Picks the department and whether you live in a dorm, for the events after it.
    id: "y_freshman", once: true, domain: "study", channel: "good", ages: [17, 22],
    when: s => undergrad(s) && s.flags.uniAt === s.age, p: () => 0.75,
    apply: (s, ctx) => {
      const dept = deptOf(s, ctx), lead = majorLead(s), y = s.year;
      s.flags.dorm = ctx.rng() < 0.6;
      const t = y < 1985 ? [
        `${lead}進了{dept}。新生訓練完，學長姊帶全班去{郊遊|烤肉|爬山}，大家圍著營火{跳土風舞|唱歌}到半夜。`,
        `${lead}進了{dept}，系上辦了第一場{聯誼|舞會}，你{緊張得只敢站在牆邊。|連對方的名字都不敢問。|跳錯了好幾次舞步，大家笑成一團。}`,
        `${lead}開始讀{dept}，{第一次自己去郵局寄信回家報平安。|宿舍熄燈後，大家拿著手電筒在走廊聊天。|每個月最期待家裡寄來的生活費和一罐肉鬆。}`,
      ] : y < 2005 ? [
        `${lead}進了{dept}。迎新宿營三天兩夜，{你被抓上台跳了一支舞。|小隊輔帶著你們玩到天亮。|你認識了後來最常一起吃飯的同學。}`,
        `${lead}開始讀{dept}，直屬學長姊塞給你一疊{共筆|考古題}，說：「{這個比課本重要。|期中考全靠它了。}」`,
        y >= 1995
          ? `${lead}進了{dept}，{第一次學會上 BBS，|在宿舍接上了宿網，}{每天晚上都泡在看板上。|跟高中同學在網路上聊到半夜。}`
          : `${lead}進了{dept}，{學長姊帶著大家去夜市吃宵夜，|第一次參加系上的烤肉，}{你覺得大學生活好自由。|宿舍的門禁比家裡還晚。}`,
      ] : [
        `${lead}進了{dept}。迎新宿營三天兩夜，{你被抓上台跳了一支舞。|小隊輔帶著你們玩到天亮。|你認識了後來最常一起吃飯的同學。}`,
        `${lead}開始讀{dept}，{一入學就被拉進系上的${y < 2012 ? "臉書社團" : " LINE 群組"}，{訊息多到看不完。|學長姊每天都在上面公告活動。}|直屬學長姊傳了一份「必修課生存指南」給你，你默默把它存了起來。}`,
        `${lead}進了{dept}，第一次自己{上網選課，熱門的通識課一下就被搶光。|排課表，把早八全部避開。|在學校附近找到一家便宜又大碗的自助餐。}`,
      ];
      return { text: ctx.w(t, { dept }), mood: 4 };
    },
  },
  {
    id: "y_major", once: true, domain: "study", channel: "change", ages: [17, 24],
    when: s => undergrad(s) && !!s.flags.dept && uniYear(s) <= 2, p: () => 0.18,
    choice: (s, ctx) => {
      const dept = s.flags.dept, other = pickDept(s, ctx, s.track === "科大" ? "tech" : ctx.rng.pick(["science", "arts"]), dept);
      const who = parentsWord(s);
      const self = s.year >= 2008 ? "{上網看{other}的開放式課程|跑去旁聽{other}的課}" : "{找{other}的書來讀|跑去旁聽{other}的課}";
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
            id: "y_major.family", label: `回家跟${who}商量`, hint: "學費是家裡出的", act: "talk", style: "family", weight: 0.15, when: s2 => parentsAlive(s2),
            apply: (s2, c) => ({ text: c.w(`想讀{other}的事，你回家跟${who}說了。${who}{沉默了很久，最後說：「你自己決定就好。」|說：「讀什麼都好，你快樂比較重要。」|還是希望你讀完{dept}，你們說好先修{other}的課看看。}`, { dept, other }), mood: 1 }),
          },
          {
            id: "y_major.self", label: "把心力放在社團和自學", hint: "學校教的不是全部", act: "hobby", style: "self", weight: 0.15,
            apply: (s2, c) => ({ text: c.w(`對{dept}提不起勁，你把重心放到社團和自學，${self}，{成績普普通通，但每天都過得很充實。|期末差點被當，你一點也不後悔。}`, { dept, other }), mood: 2 }),
          },
        ],
      };
    },
  },
  {
    id: "y_dorm", once: true, ages: [17, 24], when: s => undergrad(s) && !!s.flags.dorm && uniYear(s) <= 3, p: () => 0.2,
    choice: (s, ctx) => {
      const y = s.year, they = s.sex === "female" ? "她們" : "他們";
      const late = y < 1990 ? "在寢室打牌打到半夜" : y < 2005 ? "上網打電動打到半夜三點" : "打線上遊戲打到半夜三點";
      const fuss = y >= 1995 ? "冷氣要開幾度" : "誰該掃地倒垃圾";
      return {
        prompt: ctx.w([
          `住宿舍{的第一年|以後}，室友{每天${late}|的鬧鐘一早響個不停，自己卻不起床|常常帶朋友回寢室聊到半夜}，你已經好幾個晚上沒睡好。要怎麼辦？`,
          `宿舍{四人|六人}一間，你和室友的作息完全相反：{你早睡早起，${they}是夜貓子。|你習慣安靜讀書，${they}喜歡開著${y < 1980 ? "收音機" : "音響"}。}要怎麼辦？`,
          `寢室裡{泡麵的味道散不掉|垃圾一個禮拜沒人倒|天天為了${fuss}鬥嘴}，室友之間的氣氛越來越僵。要怎麼辦？`,
        ]),
        options: [
          {
            id: "y_dorm.talk", label: "直接跟室友談", hint: "把話講開", act: "talk", style: "self", weight: 0.3,
            apply: (s2, c) => ({ text: c.w(`和宿舍室友處不來，你找了一個晚上跟${they}把話講開，{大家說好十二點以後戴耳機、關大燈。|沒想到${they}也覺得不好意思，之後安靜多了。|${they}答應會改，雖然只撐了兩個禮拜。}`), mood: 1 }),
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
            apply: (s2, c) => ({ text: c.w(`和宿舍室友處不來，你申請換寢室，{等了一個學期才換成。|新室友是個安靜的${s2.sex === "female" ? "學姊" : "學長"}，你終於睡得著了。}`), mood: 1 }),
          },
        ],
      };
    },
  },
  {
    id: "y_club", once: true, ages: [17, 24], when: s => undergrad(s) && uniYear(s) <= 2, p: () => 0.15,
    choice: (s, ctx) => {
      const y = s.year;
      const music = y >= 1977 && y < 1986 ? "民歌社" : y < 1995 ? "吉他社" : ctx.rng.pick(["吉他社", "熱音社"]);
      const booths = y < 1985 ? "{合唱團|國樂社|登山社|校刊社}" : y < 2005 ? "{吉他社|熱舞社|登山社|攝影社}" : "{熱音社|熱舞社|桌遊社|動漫社|山服社}";
      return {
        prompt: ctx.w(`開學的社團博覽會擺了一整排攤位，${booths}和系隊都在招新生。你想參加什麼？`),
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
            id: "y_club.music", label: `參加${music}`, hint: "學一樣樂器，上台表演", act: "hobby", style: "learn", weight: 0.2,
            apply: (s2, c) => ({ text: c.w(music === "民歌社"
              ? "校園民歌正流行，你參加了民歌社，{抱著吉他在草地上唱〈橄欖樹〉。|和社員組團去參加民歌比賽，雖然沒得名，卻唱得好開心。}"
              : `大學參加${music}，{從按不好和弦練到可以上台表演。|期末成果發表會上，你在台上{唱|彈}了一首歌，台下的同學一起拍手。|和社員組了一個樂團，每週在社辦練團到半夜。}`), mood: 3 }),
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
      const goods = y < 1995 ? "{飾品|髮夾|雞蛋糕}" : "{飾品|手機殼|雞蛋糕}";
      return {
        prompt: ctx.w(["{生活費有點不夠用|想自己賺點零用錢|看到同學都在打工}，你想去打工。要做什麼？", "{下學期的學費|想買的東西}還差一點，你打算找個打工。要做什麼？"]),
        options: [
          {
            id: "y_parttime.tutor", label: "當家教", hint: "時薪高，要會教", act: "sideJob", style: "learn", weight: 0.2,
            apply: (s2, c) => { s2.savings += 0.04; return { text: c.w("課餘去當家教，教{國中生數學|高中生英文|小學生寫功課}，{學生月考進步了二十分，家長送你一盒水果。|一個小時的家教費，抵得上在餐廳打工的兩倍。|你發現教會別人，比自己讀懂還難。}"), mood: 2 }; },
          },
          {
            id: "y_parttime.shop", label: `去${shop}打工`, hint: "排班制，薪水穩定", act: "sideJob", style: "self", weight: 0.3,
            apply: (s2, c) => {
              s2.savings += 0.05; stress(s2, 0.03);
              return { text: c.w(shop === "便利商店"
                ? "在便利商店打工，{值大夜班時，凌晨三點的店裡只剩你和冰櫃的聲音。|學會了繳費、寄包裹、煮關東煮，什麼都要會。|有個熟客每天都買一樣的早餐，你不用問就幫他拿好。}"
                : `在${shop}打工，{學會了一邊招呼客人一邊記住熟客的口味。|週末一站就是八個小時，下班時腳都腫了。|領到第一份薪水，你請室友吃了一頓宵夜。}`), mood: 1 };
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
                : `跟同學在夜市擺攤賣${goods}，{第一天只賣出三樣，|喊到喉嚨都啞了，}{一個學期下來竟然存了一筆錢。|學會了怎麼跟客人應對。}`), mood: 1 };
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
      const where = y >= 1984 ? "{二十四小時的麥當勞|系館| K 書中心}" : "{宿舍交誼廳|系館|圖書館}";
      const notes = y >= 1990 ? "{共筆|學長姊的考古題}" : "{學長姊的筆記|考古題}";
      const end = good ? "{一科都沒被當。|成績比想像中好。}" : "{還是被當了一科。|有一科低空飛過，有一科沒過。}";
      return {
        text: ctx.w([
          `期末考週，你和同學在${where}讀到天亮，${end}`,
          `期末考{前一週才開始讀，|全靠${notes}，}{熬了三個通宵，|喝掉了一整打提神飲料，}${end}`,
          `期中考週，{整棟宿舍半夜都還亮著燈，|全班擠在圖書館${y >= 2005 ? "搶插座" : "搶位子"}，}你{把一學期的課在三天裡讀完，|一邊讀一邊懷疑人生，}${end}`,
        ]),
        mood: good ? 2 : -2,
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
          `${inCollege(s) ? "{期末考完的那天晚上|畢業前的最後一個週末}" : "{領到薪水的那個週末|一個睡不著的週末夜裡}"}，一群人臨時起意騎車夜衝${spot}，{凌晨四點冷得發抖，|在便利商店門口吃了一碗泡麵，}{太陽出來的那一刻，大家都安靜了。|回程每個人都在打瞌睡。}`,
          `{半夜十二點|宵夜吃到一半}，{m}突然說：「走，夜衝${spot}！」{你們騎了兩個小時，|一路上只聽得到引擎聲，}{在那裡吹著風聊到天亮。|拍了一張每個人都很醜的合照。}`,
          `生日那天，{m}{載著你|找了一群朋友陪你}夜衝${spot}，{在路邊幫你點了一根蠟燭。|大家在冷風裡唱生日快樂歌。}`,
        ], { m }),
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
        prompt: ctx.w(`{學校的國際處|系上}公布了交換學生的名額，{${place}的姊妹校還有空位。|你一直很想去的${place}也在名單上。}要申請嗎？`),
        options: [
          {
            id: "y_exchange.term", label: `去${place}交換一學期`, hint: "花費不小，眼界會打開", act: "studyAbroad", style: "risk", weight: 0.25,
            apply: (s2, c) => { spend(s2, 0.05); went(s2); return { text: c.w(`申請到${place}交換一學期，{在宿舍的共用廚房學會了煮{咖哩|義大利麵}，|跟來自各國的同學一起上課、旅行，}{回台灣時，${lang}進步了，膽子也大了不少。|最後一天在機場哭得比誰都慘。}`), mood: 6, big: true }; },
          },
          {
            id: "y_exchange.year", label: "申請一整年", hint: "可能要延畢", act: "studyAbroad", style: "risk", weight: 0.1,
            apply: (s2, c) => {
              spend(s2, 0.08); went(s2);
              const late = c.rng() < 0.4 && canDelay(s2);
              if (late) s2.flags.uniAt += 1;
              return { text: c.w(`在${place}交換了一整年，{冬天第一次看到雪，|一個人去了好幾個國家，}{你開始想像畢業後在國外工作的樣子。|回來後覺得台灣的夜市好親切。}`) + (late ? "回來以後學分抵不完，只好延後一年畢業。" : ""), mood: 7, big: true };
            },
          },
          {
            id: "y_exchange.short", label: "改參加暑期遊學", hint: "一個月，比較便宜", act: "travel", style: "learn", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.03); s2.flags.beenAbroad = true; return { text: c.w(`沒有申請交換，改報名暑假到${school}的{語言學校|短期遊學團}，{一個月就花光了打工存的錢，|每天下課就去逛街吃東西，}{但看見了不一樣的世界。|回來後立刻報名了${lang}檢定。}`), mood: 3 }; },
          },
          {
            id: "y_exchange.money", label: "考慮家裡的經濟，先不去", hint: "不想讓家裡負擔", act: "save", style: "family", weight: 0.25,
            apply: (s2, c) => ({ text: c.w(`想去${place}交換，但算了算{機票和生活費|一學期的開銷}，你不想讓${who}負擔，{把申請表收進了抽屜。|決定先打工存錢，以後再說。}`), mood: -2 }),
          },
          {
            id: "y_exchange.stay", label: "留在台灣修課", hint: "怕延畢", act: "wait", style: "safe", weight: 0.2,
            apply: (s2, c) => ({ text: c.w(`沒有申請去${place}交換，你{怕延畢，|想先把必修修完，}留在台灣${s2.track === "碩士" ? "{專心寫論文。|跟著教授做計畫。}" : "{準備考研究所。|跟著教授做專題。|專心修課。}"}`), mood: 0 }),
          },
        ],
      };
    },
  },
  {
    id: "y_internship", once: true, domain: "career", channel: "good", ages: [19, 27],
    when: s => s.year >= 1995 && inCollege(s) && (s.track === "碩士" || uniYear(s) >= 3), p: () => 0.15,
    choice: (s, ctx) => {
      const y = s.year, when = s.track === "碩士" ? "研究所的暑假" : "大三升大四的暑假";
      const big = y >= 2005 ? "{一家外商|一間上市公司|一家科技大廠}" : "{一家大公司|一間上市公司}";
      const small = y >= 2010 ? "新創公司" : "小公司";
      return {
        prompt: ctx.w(`${when}到了，{系上|教授|學長姊}介紹了幾個實習機會。你想怎麼過這個暑假？`),
        options: [
          {
            id: "y_internship.big", label: "去大公司實習", hint: "學規矩，履歷好看", act: "jobSearch", style: "safe", weight: 0.25,
            apply: (s2, c) => { s2.flags.intern = "big"; return { text: c.w(`暑假到${big}實習，{每天穿著襯衫準時打卡，|跟著正職同事開會、做簡報，}{第一次知道職場是這個樣子。|實習結束時，主管說歡迎你畢業後回來。}`), mood: 3 }; },
          },
          {
            id: "y_internship.small", label: `去${small}實習`, hint: "什麼都要做，學最多", act: "sideJob", style: "risk", weight: 0.2,
            apply: (s2, c) => { s2.flags.intern = "small"; return { text: c.w(`暑假到一間${small}實習，{一個人當三個人用，什麼都要做。|老闆讓你直接負責一個小專案。}{累得要命，學到的卻最多。|你發現自己很喜歡這種節奏。}`), mood: 2 }; },
          },
          {
            id: "y_internship.lab", label: "跟著教授做研究", hint: "為研究所鋪路", act: "study", style: "learn", weight: 0.2,
            apply: (s2, c) => ({ text: c.w("暑假留在學校，跟著教授做{專題|研究計畫}，{每天泡在實驗室到半夜。|第一次把結果做成海報，拿去研討會發表。}"), mood: 2 }),
          },
          {
            id: "y_internship.ngo", label: "去非營利組織實習", hint: "錢很少，意義很多", act: "volunteer", style: "social", weight: 0.1,
            apply: (s2, c) => ({ text: c.w("暑假到{偏鄉的小學|社福團體|環保團體}實習，{跟著社工跑家訪，|幫忙辦了一場給孩子的夏令營，}{薪水很少，心裡很滿。|你開始想，以後的工作要能幫到人。}"), mood: 3 }),
          },
          {
            id: "y_internship.earn", label: "打工賺學費", hint: "先顧好生活", act: "sideJob", style: "family", weight: 0.15,
            apply: (s2, c) => { s2.savings += 0.05; return { text: c.w("暑假沒有去實習，你到{餐廳|工廠|補習班}打工，{存下了下學期的學費。|兩個月存了一筆錢，不用再跟家裡拿生活費。}"), mood: 1 }; },
          },
          {
            id: "y_internship.trip", label: "去旅行，好好休息", hint: "學生時代最後的暑假", act: "travel", style: "self", weight: 0.1,
            apply: (s2, c) => { spend(s2, 0.03); return { text: c.w("暑假沒有實習，你{騎著機車環島了一圈，|跟朋友去{墾丁|花蓮|台東|澎湖|綠島}玩了一趟，}{曬得黑黑的回來。|把學生時代最後的暑假留給自己。}"), mood: 4 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_capstone", once: true, domain: "study", channel: "change", ages: [19, 26], when: s => undergrad(s) && uniYear(s) >= 3, p: () => 0.12,
    choice: (s, ctx) => {
      const learnHow = s.year >= 2008 ? "每天上網看教學影片，" : "跑去圖書館借了一堆書，";
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
            apply: (s2, c) => ({ text: c.w(`畢業專題沒人會的部分，你乾脆自己學，{${learnHow}|跑去別的實驗室請教學長姊，}{把那門技術練成了你的強項。|後來面試時，主管對這段經驗特別有興趣。}`), mood: 2 }),
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
            id: "y_delay.family", label: `跟${who}說想延畢`, hint: "多讀一年要花錢", act: "talk", style: "family", weight: 0.1, when: s2 => parentsAlive(s2),
            apply: (s2, c) => { late(s2); return { text: c.w(`大四的學分不夠，你想延畢一年，鼓起勇氣跟${who}說了。${who}{嘆了一口氣，還是說：「多讀一年也好，想清楚就好。」|問你學費怎麼辦，你說會自己打工付。}`), mood: 0 }; },
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
        prompt: ctx.w([`研究所的論文{卡關了好幾個月|題目一直定不下來|${arts ? "資料一直整理不出頭緒" : "實驗一直做不出結果"}}，指導教授{每週都要你報告進度|說再這樣下去就要延畢}。要怎麼辦？`, `{${room}的學長姊都畢業了|教授忙著跑計畫，很少有空見你}，你的論文進度幾乎停住了。要怎麼辦？`]),
        options: [
          {
            id: "y_lab.grind", label: `每天待在${room}拚`, hint: "用時間換進度", act: "pushThrough", style: "risk", weight: 0.3,
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
    id: "y_loan", once: true, domain: "wealth", channel: "bad", ages: [21, 30],
    when: s => s.year >= 2000 && !s.studying && !s.abroad && (s.last.graduateUni === s.age || s.last.graduateMaster === s.age), p: () => 0.25,
    choice: (s, ctx) => {
      const owe = ctx.rng.pick(["二十幾", "三十幾", "四十幾"]), who = parentsWord(s);
      const loan = s2 => { s2.debt += 0.15; };
      return {
        prompt: `${s.edu}畢業了，就學貸款加起來欠了${owe}萬，畢業一年後開始要還。要怎麼還？`,
        options: [
          {
            id: "y_loan.plan", label: "照規定分期慢慢還", hint: "每個月固定繳", act: "save", style: "safe", weight: 0.35,
            apply: (s2, c) => { loan(s2); return { text: c.w(`就學貸款欠了${owe}萬，你決定分{八|十}年慢慢還，{設了自動扣款，|把它寫在記帳本的第一行，}當成每個月的固定開銷。`), mood: -1 }; },
          },
          {
            id: "y_loan.fast", label: "省吃儉用，兩年還清", hint: "早點無債一身輕", act: "save", style: "risk", weight: 0.15,
            apply: (s2, c) => { loan(s2); frugal(s2, 2); return { text: c.w(`就學貸款欠了${owe}萬，你決定兩年內還清，{天天帶便當、不買新衣服，|下班後再去兼差，}{最後一筆繳完那天，你去吃了一頓燒肉慶祝。|還清那天，你把收據拍照傳給家人。}`), mood: 1 }; },
          },
          {
            id: "y_loan.parents", label: `${who}說要幫忙還`, hint: "心裡過意不去", act: "borrow", style: "family", weight: 0.15, when: s2 => parentsAlive(s2),
            apply: (s2, c) => ({ text: c.w(`就學貸款欠了${owe}萬，${who}說要幫你先還掉。你{堅持每個月拿一點錢回家，|心裡過意不去，}{當作是慢慢還給家裡。|默默記下了這份恩情。}`), mood: 1 }),
          },
          {
            id: "y_loan.defer", label: "先申請緩繳", hint: "等薪水穩定再說", act: "wait", style: "self", weight: 0.15,
            apply: (s2, c) => { loan(s2); return { text: c.w(`就學貸款欠了${owe}萬，剛出社會薪水不高，你先申請{緩繳|只繳利息}，{等工作穩定再開始還。|讓自己先喘一口氣。}`), mood: 0 }; },
          },
          {
            id: "y_loan.side", label: "兼差加快還款", hint: "多賺一點，比較累", act: "sideJob", style: "risk", weight: 0.15,
            apply: (s2, c) => { loan(s2); s2.savings += 0.05; stress(s2, 0.05); return { text: c.w(`就學貸款欠了${owe}萬，你下班後{接案|兼家教|去餐廳打工}，{多賺的錢全部拿去還學貸。|一年就還掉了一半。}`), mood: -1 }; },
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
      const food = y >= 1984 ? "{麥當勞|雞排攤|牛肉麵店}" : "{牛肉麵店|滷肉飯攤|冰果室}";
      const t = [
        "新訓中心的第一個晚上，{整間寢室沒有人睡得著，|班長在走廊來回走，}{你盯著上鋪的床板想家。|你才知道什麼叫三分鐘洗好澡。}",
        `{第一次放假，|每次放假，}你{第一件事就是回家睡到中午。|跟同梯直奔${food}。|摸著剃短的頭髮，覺得鏡子裡的人好陌生。}`,
      ];
      if (months >= 18) t.push("抽籤那天抽到{金門|馬祖}，大家笑你抽到「金馬獎」。{你坐了一整夜的船才到。|好幾個月才能回台灣放一次假。}");
      else if (months <= 4) t.push("四個月的軍事訓練一下就過去了，{你學會了打綁腿、摺棉被。|結訓那天，你和同梯在營區門口拍了一張合照。}");
      else t.push("一年的役期裡，{你在營區站了好多個夜哨，|你跟同梯變成很好的朋友，}{退伍那天，大家在營區門口互相丟帽子。|退伍後，大家還常常約出來吃飯。}");
      if (dating(s)) t.push("當兵的那段日子，{partner}每個{週末|假日}都來會客，{帶著{滷味|水果|自己做的便當}。|你們隔著會客室的桌子說了好多話。}");
      if (parentsAlive(s)) t.push(`{懇親會那天，|休假回家時，}${who}{帶了一大袋吃的來看你，|一直說你曬黑了、變瘦了，}{你嘴上說沒什麼，心裡很暖。|你第一次發現${who}的頭髮白了不少。}`);
      return { text: ctx.w(t), mood: 1 };
    },
  },

  // ---------- work ----------
  {
    id: "y_firstWeek", once: true, domain: "career", channel: "change", ages: [15, 30],
    when: s => employee(s) && (s.jobsHeld || []).length <= 1 && (s.job.since ?? s.age) >= s.age - 1, p: () => 0.15,
    choice: (s, ctx) => {
      const y = s.year, boss = bossOf(s), bank = y >= 1997 ? "人力銀行" : "報紙的求才廣告";
      const learn = y >= 2008 ? "{上網找教學自己練，|去上了幾堂課，}" : "{去補習班上課，|買了幾本書回家讀，}";
      return {
        prompt: ctx.w([`當{job}的第一個月，{前輩丟給你一堆事情就去忙了，|${boss}講話很快，交代的事你只聽懂一半，|工作內容跟面試時說的不太一樣，}{你每天下班都覺得腦袋被掏空。|你常常躲在廁所偷偷查資料。}要怎麼辦？`, `第一份工作做了幾個禮拜，{你還是常常出錯，被${boss}念了好幾次。|同事都很忙，沒有人有空教你。|你每天都留到很晚，事情卻還是做不完。}{你開始懷疑自己是不是不適合。|星期天晚上一想到要上班就睡不著。}要怎麼辦？`]),
        options: [
          {
            id: "y_firstWeek.ask", label: "每天提早到，主動問前輩", hint: "臉皮厚一點", act: "seekHelp", style: "social", weight: 0.3,
            apply: (s2, c) => ({ text: c.w(`當{job}的第一個月，你每天提早半小時到，{把不懂的事寫在小本子上，一個一個去問。|買了飲料請前輩，前輩看你認真，開始願意教你。}{三個月後，大部分的事你都能自己處理了。|試用期結束，${boss}說你進步很快。}`), mood: 3 }),
          },
          {
            id: "y_firstWeek.learn", label: "下班後自己補能力", hint: "學校沒教的自己學", act: "study", style: "learn", weight: 0.2,
            apply: (s2, c) => { stress(s2, 0.03); return { text: c.w(`當{job}的第一個月，很多東西學校沒教，你下班後${learn}{慢慢跟上了大家的進度。|連週末都在練習。}`), mood: 1 }; },
          },
          {
            id: "y_firstWeek.endure", label: "默默撐過試用期", hint: "先別想太多", act: "pushThrough", style: "safe", weight: 0.2,
            apply: (s2, c) => { stress(s2, 0.05); return { text: c.w("當{job}的第一個月，你什麼都不敢多說，{默默把交代的事做完，|每天最後一個離開，}{總算撐過了三個月的試用期。|領到第一份全薪時，你鬆了一口氣。}"), mood: 0 }; },
          },
          {
            id: "y_firstWeek.boss", label: `跟${boss}說需要有人帶`, hint: "說出自己的需要", act: "negotiate", style: "self", weight: 0.1,
            apply: (s2, c) => (c.roll("career", "good", 0.55)
              ? { text: c.w(`當{job}的第一個月，你跟${boss}說需要有人帶，${boss}安排了一位{學長|學姊|資深同事}帶你，你很快就上手了。`), mood: 3 }
              : { text: `剛開始工作，你跟${boss}說需要有人帶，${boss}說「大家都是這樣過來的」，你只好自己摸索。`, mood: -2 }),
          },
          {
            id: "y_firstWeek.hunt", label: "騎驢找馬，邊做邊投履歷", hint: "先做著再說", act: "jobSearch", style: "risk", weight: 0.15,
            apply: (s2, c) => { s2.flags.hunting = s2.age; return { text: c.w(`當{job}的第一個月，你覺得這份工作不適合自己，{晚上回家就打開${bank}，|開始偷偷投履歷，}{先做著，等找到更好的再說。|告訴自己至少要待滿一年。}`), mood: -1 }; },
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
      const y = s.year, office = desk(s), boss = bossOf(s);
      const late = y >= 2011 ? "半夜十一點還在 LINE 上交代工作" : y >= 1997 ? "下班後還一直打手機交代工作" : "總是在下班前五分鐘交代明天要的東西";
      const proof = office && y >= 1998 ? "把每一次交辦都寫成 email 留下紀錄，" : "把每一次交辦都記在筆記本上，";
      const ask = office && y >= 2010 ? "請以前的同學幫忙內推，" : "請以前的同事幫忙介紹，";
      const other = office ? "{別的部門|另一個專案}" : "{別的分店|另一個班}";
      const place = placeOf(s);
      return {
        prompt: office
          ? ctx.w([`主管{常常在會議上當眾挑你的錯|交代的事一天到晚改來改去|${late}}，你已經{好幾個晚上睡不好|開始害怕星期一}。要怎麼辦？`, "主管{把最難的案子都丟給你，做好了是他的功勞，做不好是你的錯。|對你的每一份報告都要重寫三次。|只對你特別嚴格，同事都看在眼裡。}要怎麼辦？"])
          : ctx.w([`${boss}{常常當著大家的面罵你|排班總是把最累的時段丟給你|把別人的錯都算在你頭上}，你已經{好幾個晚上睡不好|開始害怕上班}。要怎麼辦？`, `${boss}只對你特別嚴格，{一點小錯就記你一筆，|休假總是排不到，}同事都看在眼裡。要怎麼辦？`]),
        options: [
          {
            id: "y_boss.endure", label: "忍下來，做好自己的事", hint: "不想把事情鬧大", act: "pushThrough", style: "safe", weight: 0.25,
            apply: (s2, c) => { stress(s2, 0.08); return { text: c.w(`${boss}處處刁難，你決定忍下來，{${proof}|把該做的事做到讓人挑不出毛病，}{一年後${boss}調走了。|日子雖然不開心，倒也學到了不少。}`), mood: -2 }; },
          },
          {
            id: "y_boss.talk", label: `找${boss}私下談`, hint: "也許是誤會", act: "talk", style: "social", weight: 0.25,
            apply: (s2, c) => (c.roll("career", "good", 0.5)
              ? { text: c.w(`${boss}處處刁難，你約了${boss}私下談，{原來對方也被上面壓得很緊。|講開之後，對方的態度軟化了不少。}{之後交代事情清楚多了。|你們找到了比較好的合作方式。}`), mood: 3 }
              : { text: c.w(`${boss}處處刁難，你約了${boss}私下談，對方{笑笑說你想太多，|聽完只說會注意，}{之後一切照舊。|反而更常挑你的錯。}`), mood: -3 }),
          },
          {
            id: "y_boss.escalate", label: "越級向上反映", hint: "有風險", act: "dispute", style: "risk", weight: 0.1,
            apply: (s2, c) => (c.roll("career", "good", 0.4)
              ? { text: c.w(`${boss}處處刁難，你向更上層的主管反映，{公司找你們談過之後，${boss}收斂了很多。|後來${boss}被調走了。}`), mood: 3 }
              : { text: c.w(`${boss}處處刁難，你越級反映，{上面說會處理，之後就沒有下文，|事情傳回了${boss}耳裡，}{你的日子更難過了。|你被冷凍了好幾個月。}`), mood: -5 }),
          },
          {
            id: "y_boss.transfer", label: office ? "申請調部門" : "申請換分店或換班", hint: "換個環境", act: "negotiate", style: "learn", weight: 0.15,
            apply: (s2, c) => (c.roll("career", "good", 0.5)
              ? { text: c.w(`${boss}處處刁難，你申請調到${other}，{新的主管很照顧人，|換了環境，}你又找回了上班的動力。`), mood: 3 }
              : { text: `${boss}處處刁難，你申請換個${office ? "部門" : "地方"}，公司說目前沒有缺，你只好先撐著。`, mood: -2 }),
          },
          {
            id: "y_boss.leave", label: "開始找下一份工作", hint: "此處不留人", act: "jobHop", style: "risk", weight: 0.17,
            apply: (s2, c) => { s2.income *= c.rng.between(0.93, 1.08); stress(s2, -0.1); return { text: c.w(`${boss}處處刁難，你{默默開始找工作，|${ask}}{兩個月後換到另一家${place}，一樣當{job}。|找到新工作才遞辭呈，走得乾乾淨淨。}`), mood: 2 }; },
          },
          {
            id: "y_boss.quit", label: "直接離職", hint: "先離開再說", act: "quitJob", style: "self", weight: 0.04,
            apply: (s2, c) => { s2.employed = false; s2.unemployedFor = 1; stress(s2, -0.15); return { text: c.w(`${boss}處處刁難，你{受不了了，|想了一個晚上，}隔天就遞了辭呈。{走出${place}的那一刻，你覺得肩膀輕了。|家人問你接下來怎麼辦，你說先休息一下。}`), mood: 0 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_overtime", domain: "career", channel: "bad", ages: [22, 30], cooldown: 4, max: 2, when: s => employee(s), p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year, office = desk(s), boss = bossOf(s), at = office ? "公司" : siteOf(s), place = placeOf(s);
      const tool = !office ? "把{工具|材料}和流程重新安排了一遍，" : y >= 2000 ? "{學了 Excel 巨集，|自學寫程式，|研究了新的軟體，}" : "{重新整理了一套表格，|把流程寫成一本手冊，}";
      const sport = ctx.rng.pick(["跑步", "游泳", "打羽球", y >= 2000 ? "上健身房" : "打籃球"]);
      return {
        prompt: office
          ? ctx.w(["公司的文化是{主管沒走，沒人敢走|責任制，加班沒有加班費|每天晚上九點，辦公室還是燈火通明}，你已經{好幾個禮拜|一個多月}沒在八點前下班了。要怎麼辦？", "{專案上線前|年底結帳的時候|旺季一到}，部門天天加班到{十點|半夜}，{週末也常常被叫回公司。|你的晚餐都是便利商店的微波便當。}要怎麼辦？"])
          : ctx.w(["{旺季一到|訂單一多|人手一直補不齊}，你已經連續{好幾個禮拜|一個多月}天天加班，{休假一直被取消。|下班回家只想倒頭就睡。}要怎麼辦？", `${siteOf(s)}缺人，大家天天加班到{十點|半夜}，{你的晚餐都是便利商店的微波便當。|你已經好久沒有一個完整的週末。}要怎麼辦？`]),
        options: [
          {
            id: "y_overtime.stay", label: "跟著大家加班", hint: "大家都這樣", act: "pushThrough", style: "risk", weight: 0.3,
            apply: (s2, c) => { s2.health.hr *= 1.02; stress(s2, 0.08); return { text: c.w(`${at}天天加班，你跟著大家留下來，{能力進步得很快，但常常累到在回家的車上睡著。|一年下來胖了五公斤，假日只想睡覺。|${boss}看在眼裡，說你是值得栽培的人。}`), mood: -2 }; },
          },
          {
            id: "y_overtime.leave", label: "準時下班，事情做完就走", hint: "可能被說不合群", act: "rest", style: "self", weight: 0.2,
            apply: (s2, c) => {
              s2.health.hr *= 0.99;
              return c.roll("career", "bad", 0.4)
                ? { text: c.w(`${at}天天加班，你堅持事情做完就準時下班，{被說不合群，年度考核被打了 B。|${boss}雖然沒說什麼，臉色卻不太好看。}`), mood: -1 }
                : { text: c.w(`${at}天天加班，你堅持事情做完就準時下班，{同事一開始覺得你怪，後來也跟著學。|${boss}發現你效率很好，也就不多說了。}`), mood: 3 };
            },
          },
          {
            id: "y_overtime.smart", label: office ? "提升效率，把重複的事自動化" : "改進做事的方法", hint: "用方法換時間", act: "study", style: "learn", weight: 0.15,
            apply: (s2, c) => ({ text: c.w(office
              ? `公司天天加班，你下班後${tool}把每天重複的工作{變成範本，|自動化，}{原本要做三小時的事，現在半小時就做完。|你終於可以準時下班了。}`
              : `${at}天天加班，你${tool}{原本要做三小時的事，現在兩小時就做完。|大家都跟著學，加班少了很多。}`), mood: 3 }),
          },
          {
            id: "y_overtime.negotiate", label: `跟${boss}談工作量`, hint: "把手上的事攤開來談", act: "negotiate", style: "social", weight: 0.15,
            apply: (s2, c) => (c.roll("career", "good", 0.45)
              ? { text: c.w(`${at}天天加班，你整理好手上的工作清單去找${boss}談，{${boss}把一部分工作分給了新人。|${boss}答應再補一個人。}`), mood: 3 }
              : { text: `${at}天天加班，你去跟${boss}談工作量，${boss}說「大家都很忙」，事情還是一樣多。`, mood: -2 }),
          },
          {
            id: "y_overtime.exercise", label: "下班後去運動抒壓", hint: "顧好身體", act: "exercise", style: "health", weight: 0.1,
            apply: (s2, c) => { s2.health.hr *= 0.98; s2.health.fitness = clamp(s2.health.fitness + 0.05); stress(s2, -0.05); return { text: c.w(`${at}天天加班，你規定自己每週${sport}三次，{雖然還是很忙，但睡得比較好了。|身體反而比剛進公司時還好。}`), mood: 2 }; },
          },
          {
            id: "y_overtime.hop", label: office ? "換一家不加班的公司" : "換一個不用天天加班的地方", hint: "薪水可能少一點", act: "jobHop", style: "risk", weight: 0.05,
            apply: (s2, c) => { s2.income *= c.rng.between(0.92, 1.05); stress(s2, -0.1); return { text: c.w(`${at}天天加班，你決定換個環境，{三個月後換到一家準時下班的${place}，|找到一家薪水少一點、但不用加班的${place}，}{一樣當{job}，|終於有了晚上的生活，}{你覺得少一點錢也值得。|下班後還能去上課、運動。}`), mood: 2 }; },
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
      const who = !desk(s) ? "{以前的同事|同業的朋友|以前的師傅}" : y >= 2010 ? "{以前的同事|大學同學|一位獵人頭|LinkedIn 上的獵人頭}" : "{以前的同事|大學同學|一位獵人頭}";
      const rival = rivalOf(s);
      const course = ctx.rng.pick(y >= 2015 ? ["證照課程", "夜間的進修課程", "線上課程"] : ["證照課程", "夜間的進修課程"]);
      return {
        prompt: ctx.w(`${who}找上你：${rival}想挖你過去當{job}，薪水多${more}。要去嗎？`),
        options: [
          {
            id: "y_poached.go", label: "跳槽", hint: "加薪，也要重新適應", act: "jobHop", style: "risk", weight: 0.3,
            apply: (s2, c) => { s2.income *= c.rng.between(1.03, 1.12); return { text: c.w(`被挖角，薪水多${more}，你{想了一個週末，|跟家人商量後，}決定跳槽。{新環境的節奏更快，你很快就適應了。|第一個月就接下了一個大案子。}`), mood: 4 }; },
          },
          {
            id: "y_poached.counter", label: "拿 offer 跟老闆談加薪", hint: "可能成功，也可能尷尬", act: "negotiate", style: "social", weight: 0.2,
            apply: (s2, c) => {
              if (c.roll("career", "good", 0.5)) { s2.income *= 1.04; return { text: c.w("有人來挖角，你拿著 offer 去跟老闆談，{老闆當場幫你加了薪。|公司為了留你，調了薪水，也給了你更多責任。}"), mood: 4 }; }
              return { text: "有人來挖角，你拿著 offer 去跟老闆談，老闆說公司有公司的制度。你最後還是留了下來，心裡卻多了一個疙瘩。", mood: -2 };
            },
          },
          {
            id: "y_poached.stay", label: "留下來", hint: "現在的環境比較安心", act: "wait", style: "safe", weight: 0.3,
            apply: (s2, c) => ({ text: c.w("有人來挖角，你想了想，{現在的公司離家近，每天可以回家吃晚飯，|現在的團隊很照顧你，}{還是決定留下來。|覺得錢不是全部。}"), mood: 1 }),
          },
          {
            id: "y_poached.scout", label: "先打聽對方的風評", hint: "謹慎一點", act: "seekHelp", style: "social", weight: 0.12,
            apply: (s2, c) => {
              if (c.roll("career", "good", 0.5)) { s2.income *= c.rng.between(1.03, 1.1); return { text: c.w("有人來挖角，你先找人打聽，{對方的風評不錯，|聽說那裡的主管很會帶人，}你放心地跳槽了。"), mood: 4 }; }
              return { text: c.w(`有人來挖角，你先找人打聽，{發現那個部門一年就換了一半的人，|在${y >= 2000 ? "網路上" : "業界"}聽到不少負評，}決定婉拒。`), mood: 1 };
            },
          },
          {
            id: "y_poached.rethink", label: "趁機想想自己要什麼", hint: "也許該學點新東西", act: "study", style: "learn", weight: 0.08, when: s2 => !s2.arcs.study,
            apply: (s2, c) => { c.arc.start("study", { kind: course, from: s2.age }, c.rng.chance(0.5) ? 1 : 2); spend(s2, 0.05); return { text: c.w(`有人來挖角，你反而開始想自己真正想做什麼，報名了${course}，{下班後回到教室。|想替自己多累積一點本事。}`), mood: 1 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_passion", once: true, domain: "career", channel: "change", ages: [23, 30], when: s => employee(s) && s.age - (s.job.since ?? s.age) >= 1, p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year, h = ctx.rng.pick(["畫畫", "攝影", "寫作", "音樂", "烘焙", "手作", ...(y >= 2010 ? ["拍影片"] : [])]);
      const sell = y >= 2010 ? "{開了一個粉絲專頁，|週末去文創市集擺攤，|在網路上接案，}" : y >= 2000 ? "{在網路上接案，|架了一個個人網站，}" : "{接朋友介紹的案子，|參加作品聯展，}";
      return {
        prompt: ctx.w([`工作穩定了，但你一直放不下${h}。{同事說你的作品很有水準，|有人問你接不接案，}{你開始想：要不要認真做？|你常常想像，如果當初選了這條路會怎樣。}要怎麼辦？`, `每天下班後，你都花兩三個小時在${h}上，{比上班還認真，|週末更是整天埋頭做，}你在想，這件事在你的人生裡該放在哪裡？`]),
        options: [
          {
            id: "y_passion.hobby", label: "當興趣慢慢做", hint: "工作和興趣各一半", act: "hobby", style: "self", weight: 0.35,
            apply: (s2, c) => ({ text: c.w(`放不下${h}，你決定把它當成興趣，{每週固定留兩個晚上給它。|週末去上進階課。}{工作和興趣各占一半，日子剛剛好。|那是你一週裡最快樂的時間。}`), mood: 3 }),
          },
          {
            id: "y_passion.side", label: "開始經營副業", hint: "多一份收入，也多一份累", act: "sideJob", style: "risk", weight: 0.15,
            apply: (s2, c) => { s2.income *= 1.03; stress(s2, 0.05); return { text: c.w(`放不下${h}，你開始${sell}{第一次有陌生人付錢買你的作品，你開心了好幾天。|副業的收入雖然不多，卻讓你很有成就感。}`), mood: 3 }; },
          },
          {
            id: "y_passion.course", label: "上專業課程，準備轉行", hint: "給自己一個機會", act: "study", style: "learn", weight: 0.15, when: s2 => !s2.arcs.study,
            apply: (s2, c) => { c.arc.start("study", { kind: `${h}的專業課程`, from: s2.age }, c.rng.chance(0.5) ? 1 : 2); spend(s2, 0.05); return { text: c.w(`放不下${h}，你報名了${h}的專業課程，{每週三個晚上去上課，|把年假都拿來上密集班，}{想給自己一個轉行的機會。|一步一步往想做的事靠近。}`), mood: 2 }; },
          },
          {
            id: "y_passion.focus", label: "先專心衝工作", hint: "等存夠錢再說", act: "pushThrough", style: "safe", weight: 0.2,
            apply: (s2, c) => ({ text: c.w(`工作越來越忙，你把${h}的東西收進櫃子，{專心在工作上，那年的考核拿了 A。|告訴自己等存夠了錢再說。}`), mood: -1 }),
          },
          {
            id: "y_passion.contest", label: "報名比賽或作品展", hint: "讓別人看看你的作品", act: "hobby", style: "risk", weight: 0.1,
            apply: (s2, c) => {
              if (c.roll("career", "good", 0.35)) { s2.savings += 0.03; return { text: c.w(`你把${h}的作品拿去{參加比賽，竟然得了佳作，獎金拿去買了新器材。|參加聯展，被一家公司看見，開始有人找你合作。}`), mood: 5 }; }
              return { text: `你把${h}的作品拿去參加比賽，沒有得名，但評審寫的一句鼓勵，讓你決定繼續做下去。`, mood: 1 };
            },
          },
          {
            id: "y_passion.friends", label: "找同好一起做", hint: "有伴比較走得久", act: "socialize", style: "social", weight: 0.05,
            apply: (s2, c) => { const f = friendOf(s2, c, { how: `${h}同好`, fresh: true }); return { text: c.w(`放不下${h}，你加入了一個${h}的同好社群，認識了{f}，{兩個人約好每個月一起完成一件作品。|大家互相打氣，誰也沒有放棄。}`, { f: f.call }), mood: 3 }; },
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
        prompt: ctx.w([`${where}的工作機會少，{台北|新竹}的公司開出比現在多{兩成|三成}的薪水。要北上嗎？`, "{同學一個個都北上了，|主管說公司要在台北開新的據點，問你要不要過去，}你在{city}的日子很安穩，卻也常常想：要不要去台北闖一闖？"]),
        options: [
          {
            id: "y_northbound.go", label: "北上工作", hint: "薪水高，房租也高", act: "moveHome", style: "risk", weight: 0.35,
            apply: (s2, c) => { s2.income *= c.rng.between(1.02, 1.1); const to = goNorth(s2, c); return { text: c.w(`決定北上，你拖著兩個行李箱搬到${to}，{租了一間{三坪|四坪}大的小套房，|第一個月光是房租就花掉了薪水的三分之一，}{週末常常打電話回家。|每次回家，${who}都說你瘦了。}`), mood: 2, big: true }; },
          },
          {
            id: "y_northbound.stay", label: "留在家鄉", hint: "離家近，生活費低", act: "wait", style: "family", weight: 0.35,
            apply: (s2, c) => ({ text: c.w(`想過要北上，最後還是留在{city}，{離家近，晚餐可以回家吃。|薪水少一點，但生活費也少一點。|週末可以陪${who}去{市場|廟裡拜拜|爬山}。}`), mood: 1 }),
          },
          {
            id: "y_northbound.city", label: "去中南部的大城市", hint: "折衷的選擇", act: "moveHome", style: "safe", weight: 0.12, when: () => cities.length > 0,
            apply: (s2, c) => { const to = moveTo(s2, c, cities); s2.income *= 1.03; if (s2.home === "parents") s2.home = "rent"; return { text: c.w(`不想去台北那麼遠，你搬到${to}工作，{回家只要一兩個小時，|房租比台北便宜一半，}{週末還能回家吃飯。|生活步調剛剛好。}`), mood: 2 }; },
          },
          y >= 2020 && desk(s)
            ? {
              id: "y_northbound.remote", label: "找遠距工作", hint: "領台北的薪水，住在家鄉", act: "negotiate", style: "learn", weight: 0.1,
              apply: (s2, c) => {
                if (c.roll("career", "good", 0.5)) { s2.income *= 1.03; return { text: c.w(`不想北漂，你應徵上一家台北公司的遠距職缺，{每個月北上開一次會，|在家裡的書桌前開視訊會議，}{領台北的薪水，住在家鄉。|${who}常好奇你在電腦前跟誰說話。}`), mood: 3 }; }
                return { text: c.w("不想北漂，你找了好幾家遠距的工作，{但大多還是要進辦公室，|面試了幾家都沒有下文，}只好先留在{city}。"), mood: -1 };
              },
            }
            : {
              id: "y_northbound.transfer", label: "請公司調你去台北", hint: "帶著原本的工作北上", act: "negotiate", style: "learn", weight: 0.1,
              apply: (s2, c) => {
                if (c.roll("career", "good", 0.5)) { s2.income *= 1.05; const to = goNorth(s2, c); return { text: c.w(`你向公司申請調到台北的分公司，{主管答應了，|公司幫你安排了宿舍，}{下個月就搬到${to}報到。|你帶著原本的工作，換了一座城市。}`), mood: 2 }; }
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
    id: "y_rent", once: true, domain: "move", channel: "change", ages: [22, 30], when: s => working(s) && s.home !== "own",
    p: s => (s.flags.movedNorth === s.age || s.last.move === s.age || s.last.firstJob === s.age ? 0.12 : 0.025),
    choice: (s, ctx) => {
      const y = s.year, home = s.home === "parents", who = parentsWord(s);
      const find = y >= 2007 ? "在租屋網上滑了好幾個晚上" : "在電線桿上找「吉屋出租」的紅紙條";
      const near = { 製造: "工廠", 科技: "園區", 醫療: "醫院" }[s.job.field];
      const lead = home ? "上班以後想搬出去住" : "在{city}找房子";
      return {
        prompt: home
          ? ctx.w(["上班以後，每天{通勤要一個多小時|要轉兩班車才到公司}，{你開始想搬出去住。|同事都在問你什麼時候要搬出來。}要怎麼安排？", "{住家裡很方便，|家裡說住家裡可以省很多錢，}但你也很想有自己的空間。要搬出去住嗎？"])
          : ctx.w([`剛到{city}工作，要找地方住。你${find}，{價錢和大小怎麼選都兩難。|看了好幾間，房東一個比一個難講話。}要租什麼樣的地方？`, "租約快到期了，房東說要漲房租。在{city}找房子不容易，要怎麼辦？"]),
        options: [
          {
            id: "y_rent.home", label: home ? "繼續住家裡" : "搬回家住", hint: "省房租，也有人照應", act: "moveHome", style: "family", weight: 0.3, when: s2 => parentsAlive(s2) && s2.county === s2.birthCounty,
            apply: (s2, c) => { s2.home = "parents"; frugal(s2, 2); return { text: c.w(`${lead}，你最後決定住家裡，{每個月拿一筆錢給${who}當生活費，|每天早一點出門通勤，}{存款比同事多了不少。|晚餐都有家裡的菜可以吃。}`), mood: 1 }; },
          },
          {
            id: "y_rent.room", label: "租雅房，浴室共用", hint: "最便宜", act: "save", style: "safe", weight: 0.2,
            apply: (s2, c) => { s2.home = "rent"; frugal(s2, 1); return { text: c.w(`${lead}，你租了一間{三坪|四坪}的雅房，{浴室要跟隔壁共用，|只放得下一張床和一張書桌，}{但房租便宜了一半。|每天下班回去只想躺平。}`), mood: 0 }; },
          },
          {
            id: "y_rent.studio", label: "租一間套房", hint: "貴一點，有自己的空間", act: "moveHome", style: "self", weight: 0.25,
            apply: (s2, c) => { s2.home = "rent"; spend(s2, 0.02); return { text: c.w(`${lead}，你租了一間有{小陽台|對外窗|獨立衛浴}的套房，{房租占了薪水的三分之一，但終於有了自己的空間。|週末在家煮一鍋咖哩，你覺得這才是長大的感覺。|下班回家關上門，整個世界都安靜了。}`), mood: 2 }; },
          },
          {
            id: "y_rent.share", label: "和朋友分租一層公寓", hint: "熱鬧，也要互相包容", act: "socialize", style: "social", weight: 0.15,
            apply: (s2, c) => {
              s2.home = "rent";
              const f = friendOf(s2, c, { sex: s2.sex }); bond(f, 0.05);
              return { text: c.w(`${lead}，你和{f}合租了一層老公寓，{客廳是大家的，冰箱門上貼滿了分帳的便利貼。|週末常常一起煮火鍋、看電影。|為了誰洗碗吵過幾次，但大多時候很開心。}`, { f: friendIntro(f) }), mood: 2 };
            },
          },
          {
            id: "y_rent.far", label: "租遠一點，空間大一點", hint: "通勤比較久", act: "moveHome", style: "risk", weight: 0.2,
            apply: (s2, c) => { s2.home = "rent"; return { text: c.w(`${lead}，你租在比較遠的{郊區|山邊|鄉下}，{房子大了一倍，還有一個小陽台，|房租便宜，空間又大，}{每天通勤要一個小時。|你在陽台種了幾盆花。}`), mood: 1 }; },
          },
          {
            id: "y_rent.dorm", label: "住公司宿舍", hint: "省錢省時間", act: "save", style: "safe", weight: 0.1, when: () => !!near,
            apply: (s2, c) => { s2.home = "rent"; frugal(s2, 2); return { text: c.w(`${lead}，你申請了公司宿舍，{四個人一間，下班後室友就是同事。|離${near}走路只要五分鐘，}{省下了房租和通勤時間。|生活很單純：上班、吃飯、睡覺。}`), mood: 0 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_firstSavings", once: true, domain: "wealth", channel: "good", ages: [20, 30], when: s => working(s) && s.savings >= 0.25 && s.savings < 0.8, p: () => 0.08,
    choice: (s, ctx) => {
      const y = s.year, who = parentsWord(s), months = Math.max(2, Math.round((s.savings / Math.max(0.3, s.income)) * 12));
      const buy = y < 1990 ? "{一台相機|一台隨身聽|一套好西裝}" : y < 2007 ? "{一台數位相機|一台筆電|一支新手機}" : "{一台筆電|一支新手機|一台微單眼}";
      const how = y < 1986 ? "{跟了一個會|跟著同事買了一點股票}" : y < 2003 ? "{開始買股票|買了一檔基金}" : y < 2015 ? "{開始定期定額買 0050|買了一檔基金}" : "{開始定期定額買 ETF|學人家存股}";
      const gain = y < 1986 ? "{一年下來多了一點利息。|股票漲了一些，你很開心。}" : "{一年下來賺了一點，|帳面上漲了一些，}{開始每天看盤。|覺得自己懂了一點理財。}";
      const loss = y < 1986 ? "{後來會頭跑了，被倒了一筆會錢。|後來股票跌了，賠了一點。}" : "{結果遇到大跌，帳面一片綠油油。|賠了一點，學到了「風險」兩個字怎麼寫。}";
      return {
        prompt: `工作了幾年，存摺裡終於有了一筆存款，差不多是 ${months} 個月的薪水。要怎麼用？`,
        options: [
          {
            id: "y_firstSavings.keep", label: "繼續存，放定存", hint: "安心最重要", act: "save", style: "safe", weight: 0.25,
            apply: (s2, c) => { frugal(s2, 2); return { text: c.w(`存到人生第一筆錢，你{全部放進定存，|另外開了一個只存不領的帳戶，}${y < 2000 ? "那時候的定存利息很不錯，" : "雖然利息少得可憐，"}{你告訴自己這是以後的頭期款。|每個月薪水一進來，就先轉一筆過去。}`), mood: 1 }; },
          },
          {
            id: "y_firstSavings.invest", label: "開始投資", hint: "可能賺，也可能賠", act: "invest", style: "risk", weight: 0.22,
            apply: (s2, c) => {
              const r = marketYear(y) + 0.15 * c.rng.normal();
              s2.savings = Math.max(0, s2.savings + 0.1 * r);
              return r >= 0 ? { text: c.w(`存到人生第一筆錢，你拿一部分${how}，${gain}`), mood: 3 } : { text: c.w(`存到人生第一筆錢，你拿一部分${how}，${loss}`), mood: -3 };
            },
          },
          {
            id: "y_firstSavings.parents", label: `包紅包給${who}`, hint: "謝謝家裡的照顧", act: "care", style: "family", weight: 0.15, when: s2 => parentsAlive(s2),
            apply: (s2, c) => { spend(s2, 0.04); return { text: c.w(`存到人生第一筆錢，你包了一個紅包給${who}，${who}{嘴上說不用，還是收進了抽屜。|拿去買了一台新電視，逢人就說是孩子買的。|帶你去吃了一頓好的，堅持要自己付錢。}`), mood: 3 }; },
          },
          {
            id: "y_firstSavings.treat", label: "犒賞自己", hint: "辛苦這麼久了", act: "hobby", style: "self", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.05); return { text: c.w(`存到人生第一筆錢，你犒賞自己買了${buy}，{拆開的時候開心得像個孩子。|用了好多年都捨不得換。}`), mood: 3 }; },
          },
          {
            id: "y_firstSavings.insure", label: "買保險", hint: "以防萬一", act: "insurance", style: "health", weight: 0.1,
            apply: (s2, c) => { s2.flags.insured = true; spend(s2, 0.02); return { text: c.w("存到人生第一筆錢，{當保險業務員的同學|做保險的親戚}幫你規劃了{醫療險|意外險}，{每個月多了一筆保費，|雖然有點心疼，}{心裡踏實多了。|你把保單收進了資料夾。}"), mood: 1 }; },
          },
          {
            id: "y_firstSavings.course", label: "拿去進修", hint: "投資自己", act: "study", style: "learn", weight: 0.1,
            apply: (s2, c) => { spend(s2, 0.05); return { text: c.w(`存到人生第一筆錢，你報名了{英文|日文|${y >= 2000 ? "程式" : "會計"}|證照}課，{下班後去補習班上課。|週末都在教室度過。}`), mood: 1 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_vehicle", once: true, domain: "wealth", channel: "change", ages: [18, 30], when: s => s.year >= 1965 && !s.abroad && (working(s) || inCollege(s)), p: () => 0.03,
    choice: (s, ctx) => {
      const y = s.year, go = working(s) ? "上班" : "上課", who = parentsWord(s), bike = scooterOf(y);
      const taipei = ["臺北市", "新北市"].includes(s.county);
      const transit = taipei && y >= 2012 ? "搭捷運，再騎一段 YouBike" : taipei && y >= 1997 ? "搭捷運和公車" : "搭公車";
      return {
        prompt: ctx.w([`每天{擠公車|騎家裡那台老機車}${go}，{常常遲到，|下雨天全身濕透，}你想要一台自己的車。要怎麼辦？`, `${go === "上班" ? "同事" : "同學"}都騎車${go}，你也存了一點錢，想要一台自己的車。要怎麼辦？`]),
        options: [
          {
            id: "y_vehicle.new", label: "分期買一台新機車", hint: "每個月繳一點", act: "borrow", style: "risk", weight: 0.25,
            apply: (s2, c) => { s2.debt += 0.08; return { text: c.w(`你分{十二|二十四}期買了一台${bike}，{第一天騎去${go}，覺得自己好帥。|每天出門前都要擦一遍。|在座墊下放了一件輕便雨衣，從此不怕下雨。}`), mood: 4 }; },
          },
          {
            id: "y_vehicle.used", label: "買一台二手機車", hint: "便宜，耐騎就好", act: "save", style: "safe", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.03); return { text: c.w(`你在{車行|${y >= 2000 ? "網路上" : "朋友介紹的地方"}}買了一台二手機車，{騎起來有點吵，但很耐操。|花不到一個月的薪水。|換了新輪胎，又能再騎好幾年。}`), mood: 2 }; },
          },
          {
            id: "y_vehicle.family", label: "騎家裡的舊車", hint: "不用花錢", act: "seekHelp", style: "family", weight: 0.15, when: s2 => parentsAlive(s2),
            apply: (s2, c) => ({ text: c.w(`${who}把家裡的舊機車整理好給你，{換了一顆新電瓶就騎得很順。|座墊有點破，你用膠帶貼一貼照樣騎。}`), mood: 2 }),
          },
          {
            id: "y_vehicle.bike", label: "買一台腳踏車就好", hint: "省錢，順便運動", act: "exercise", style: "health", weight: 0.1,
            apply: (s2, c) => { spend(s2, 0.01); s2.health.fitness = clamp(s2.health.fitness + 0.03); return { text: c.w(`你買了一台{二手的|新的}腳踏車，{每天騎去${go}，|騎了半年，}{腿變得好有力。|省下了車錢，也順便運動。}`), mood: 2 }; },
          },
          {
            id: "y_vehicle.transit", label: "搭大眾運輸就好", hint: "把錢存下來", act: "save", style: "safe", weight: 0.12,
            apply: (s2, c) => { frugal(s2, 1); return { text: c.w(`你算了算油錢和保養費，決定繼續${transit}，{把買車的錢存了下來。|通勤的時間剛好拿來看書。}`), mood: 0 }; },
          },
          {
            id: "y_vehicle.electric", label: "買一台電動機車", hint: "安靜，不用加油", act: "borrow", style: "learn", weight: 0.1, when: s2 => s2.year >= 2016,
            apply: (s2, c) => { spend(s2, 0.04); return { text: c.w("你買了一台電動機車，{在換電站換電池的時候，覺得自己走在時代的前面。|騎起來安靜得連鄰居的狗都沒發現你回家。}"), mood: 3 }; },
          },
        ],
      };
    },
  },
  {
    id: "y_firstTrip", once: true, domain: "move", channel: "change", ages: [19, 30],
    when: s => s.year >= 1980 && !beenAbroad(s) && ((working(s) && s.savings >= 0.15) || (inCollege(s) && s.year >= 1995)), p: () => 0.04,
    choice: (s, ctx) => {
      const y = s.year, who = parentsWord(s), they = s.father.alive && s.mother.alive ? "他們" : s.father.alive ? "他" : "她";
      const dest = ctx.rng.pick(y < 1990 ? ["香港", "日本", "泰國", "新加坡"] : y < 2005 ? ["日本", "香港", "泰國", "峇里島"] : y < 2015 ? ["日本", "韓國", "泰國", "香港"] : ["日本", "韓國", "泰國", "越南", "沖繩"]);
      const cheap = y >= 2014 ? "搶到廉航的便宜機票，" : "";
      const been = s2 => { s2.flags.beenAbroad = true; ctx.remember("y_firstTrip", `第一次出國去${dest}`); };
      return {
        prompt: ctx.w([`你還沒出過國，{同學|同事}都去過${dest}了。這次想第一次出國，要怎麼去？`, `存了一筆錢，你想第一次出國，去${dest}看看。要怎麼去？`]),
        options: [
          {
            id: "y_firstTrip.tour", label: "跟旅行團", hint: "不用煩惱，行程很滿", act: "travel", style: "safe", weight: 0.3,
            apply: (s2, c) => { spend(s2, 0.08); been(s2); return { text: c.w(`第一次出國，跟著旅行團去${dest}，{行程從早排到晚，|導遊一路講笑話，}{你買了一堆伴手禮回來分給大家。|在免稅店幫家人挑了好久的禮物。}`), mood: 4 }; },
          },
          {
            id: "y_firstTrip.friends", label: "和朋友自由行", hint: "自己安排，比較自由", act: "travel", style: "risk", weight: 0.25, when: () => y >= 1995,
            apply: (s2, c) => { spend(s2, 0.07); been(s2); const f = friendOf(s2, c); return { text: c.w(`第一次出國，你和{f}${cheap}自己去${dest}，{迷路了好幾次，|全靠一本旅遊書和比手畫腳，}{吃到了最道地的小吃。|回來後約好明年再一起去。}`, { f: f.call }), mood: 5 }; },
          },
          {
            id: "y_firstTrip.solo", label: "一個人背包旅行", hint: "什麼都要自己來", act: "travel", style: "risk", weight: 0.15,
            apply: (s2, c) => { spend(s2, 0.08); been(s2); return { text: c.w(`第一次出國，你一個人背著背包去${dest}，{住在青年旅館，和來自各國的旅人聊到半夜。|走錯路的時候，當地人陪你走到了車站。|每天走好幾萬步，晚上倒頭就睡。}`), mood: 6 }; },
          },
          {
            id: "y_firstTrip.parents", label: `帶${who}一起去`, hint: "花比較多錢", act: "travel", style: "family", weight: 0.15, when: s2 => parentsAlive(s2) && s2.employed,
            apply: (s2, c) => { spend(s2, 0.15); been(s2); return { text: c.w(`第一次出國，你帶${who}一起跟團去${dest}，${who}{一路上拍了好多照片，|在飯店房間裡偷偷算你花了多少錢，}{回來後跟親戚講了好幾個月。|說這是${they}最開心的一次旅行。}`), mood: 6 }; },
          },
          {
            id: "y_firstTrip.company", label: "跟公司的員工旅遊去", hint: "公司出大部分的錢", act: "travel", style: "social", weight: 0.1, when: s2 => s2.employed,
            apply: (s2, c) => { spend(s2, 0.03); been(s2); return { text: c.w(`第一次出國，是跟公司的員工旅遊去${dest}，{一整台遊覽車都是同事，|晚上在飯店和同事聊到半夜，}{你看見了主管不為人知的一面。|回來後跟同事熟了很多。}`), mood: 4 }; },
          },
          {
            id: "y_firstTrip.later", label: "先存起來，以後再去", hint: "錢留著比較安心", act: "save", style: "safe", weight: 0.1,
            apply: (s2, c) => { frugal(s2, 1); return { text: c.w(`想第一次出國去${dest}，算了算{機票|團費}，你決定先把錢存起來，{在牆上貼了一張世界地圖，|把旅遊書放在床頭，}{告訴自己明年一定要去。|等以後再出發。}`), mood: 0 }; },
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
      const away = s.county !== s.birthCounty, to = away ? "{city}" : inCollege(s) ? "宿舍" : "租屋處";
      const t = [
        `週末回家，媽媽塞了滿滿一袋{滷肉|水餃|水果|雞湯}讓你帶回${to}，{冰箱塞到關不起來。|你吃了一整個禮拜。}`,
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
          ? ctx.w([`和{partner}交往 ${n} 年，${who}一直問什麼時候要帶{ta}回家吃飯。要怎麼安排？`, `{過年|中秋節}快到了，${who}說想見見你的${bf}{partner}。要怎麼安排？`])
          : ctx.w([`和{partner}交往 ${n} 年，{partner}說爸媽想見見你。第一次去{ta}家吃飯，{你緊張到前一晚睡不著。|你不知道該帶什麼伴手禮。}要怎麼準備？`, "{過年|中秋節}前，{partner}問你要不要一起回{ta}家吃飯。要怎麼準備？"]),
        options: [
          {
            id: "y_meetFamily.gift", label: mine ? "事先準備，讓大家留個好印象" : "準備伴手禮，穿得正式一點", hint: "禮多人不怪", act: "talk", style: "safe", weight: 0.3,
            apply: (s2, c) => {
              met(s2);
              if (mine) return { text: c.w(`第一次帶{partner}回家，你事先{幫{ta}準備了伴手禮，|把家裡打掃了一遍，}${who}{煮了一大桌菜，|拿出了珍藏的茶葉，}{一頓飯吃得很和樂。|飯後還翻出你小時候的照片給{ta}看。}`), mood: 4 };
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
                ? { text: c.w(`第一次帶{partner}回家，你說就像平常一樣，${who}{問東問西，|一直問{ta}做什麼工作、家裡有幾個人，}{partner}{應對得很自然，你鬆了一口氣。|笑著一題一題回答。}`), mood: 3 }
                : { text: c.w(`第一次帶{partner}回家，你什麼都沒先交代，${who}{問了好多讓人尷尬的問題，|一直問什麼時候要結婚，}{partner}{整頓飯都很緊張。|回去的路上沉默了好久。}`), mood: -2 };
              return ok
                ? { text: c.w("第一次去{partner}家，你決定做自己，{輕鬆地跟{ta}爸爸聊起{棒球|釣魚|股票}，|陪{ta}媽媽在廚房邊洗碗邊聊天，}{一頓飯吃得很開心。|{ta}爸媽說你很實在。}"), mood: 4 }
                : { text: c.w(`第一次去{partner}家，你太輕鬆了，{穿著拖鞋就去，|吃完飯就${y >= 2010 ? "滑起了手機" : "坐在沙發上看電視"}，}回家後{partner}跟你說，{ta}爸媽有點意見。`), mood: -2 };
            },
          },
          {
            id: "y_meetFamily.ask", label: mine ? `先跟${who}打好招呼` : `先問${name}爸媽喜歡什麼`, hint: "做足功課", act: "seekHelp", style: "social", weight: 0.2,
            apply: (s2, c) => {
              met(s2);
              return mine
                ? { text: c.w(`第一次帶{partner}回家前，你先跟${who}打好招呼，{請家裡不要問太多，|提醒家裡{partner}不吃辣，}{那頓飯吃得很順利。|${who}很快就跟{partner}聊開了。}`), mood: 3 }
                : { text: c.w("第一次去{partner}家前，你先做足了功課，{知道{ta}爸爸愛喝茶、媽媽喜歡聽人稱讚她的菜，|問清楚了{ta}家裡的習慣，}{那頓飯你表現得很得體。|{ta}媽媽一直說你很有禮貌。}"), mood: 3 };
            },
          },
          {
            id: "y_meetFamily.help", label: "主動幫忙做家事", hint: "用行動表現", act: "care", style: "family", weight: 0.15,
            apply: (s2, c) => {
              met(s2);
              return mine
                ? { text: c.w(`第一次帶{partner}回家，{partner}主動進廚房幫忙，${who}{笑得合不攏嘴。|偷偷跟你說：「這個不錯。」}`), mood: 4 }
                : { text: c.w("第一次去{partner}家，吃完飯你主動{收碗、洗碗，|幫忙把桌子擦乾淨，}{ta}媽媽在廚房跟你聊了好久，{後來常常叫{partner}帶你回家吃飯。|偷偷跟{partner}說你是個好孩子。}"), mood: 3 };
            },
          },
          {
            id: "y_meetFamily.later", label: "還沒準備好，再等等", hint: "太緊張了", act: "avoid", style: "self", weight: 0.1,
            apply: (s2, c) => (mine
              ? { text: c.w(`${who}一直想見{partner}，你覺得還太早，{推說最近太忙，|說再等等，}${who}{嘆了一口氣，|說好啦好啦，}{之後每次打電話都會問一次。|開始自己想像{partner}長什麼樣子。}`), mood: -1 }
              : { text: c.w(`想到要見{partner}的爸媽，你太緊張了，跟{ta}說想再等等。{partner}{嘴上說沒關係，看得出來有點失望。|說好吧，${y >= 2008 ? "改成先讓你跟{ta}爸媽視訊打個招呼。" : "改成先讓你在電話裡跟{ta}爸媽打個招呼。"}}`), mood: -1 }),
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
      const cause = s.last.military === s.age && s.sex === "male" ? "你去當兵" : s.flags.y_awayAt === s.age ? "你出國交換"
        : s.flags.movedNorth === s.age || s.last.move === s.age ? "你搬到{city}"
          : ctx.rng.pick(["{partner}被公司派到{新竹|台中|高雄|台南}", "{partner}去{南部|北部}讀研究所", "{partner}換了一份在外縣市的工作"]);
      const ride = y >= 2007 ? "{高鐵|客運}" : "{火車|客運}";
      const army = cause === "你去當兵", overseas = cause === "你出國交換";
      const daily = y < 1990 ? `每週寫信給${ta}` : y < 1998 ? "每天講電話" : y < 2005 ? "每天傳簡訊、講電話" : y < 2011 ? "每天在 MSN 上聊天" : "每天視訊";
      const dailyText = y < 1990 ? "你們約好每週寫信，{信紙上寫滿了生活的小事，|你把{ta}的信收在一個餅乾盒裡，}{收到回信那天，是一週裡最開心的一天。|郵差都認得你了。}"
        : y < 1998 ? "你們每天晚上講電話，{電話費帳單嚇了家人一跳，|常常講到話筒發燙，}{再累也要說一聲晚安。|有時候只是聽著對方的呼吸聲。}"
          : y < 2005 ? "你們每天傳簡訊、講電話，{手機帳單一個月比一個月高，|一封簡訊要想好久才按下傳送，}{再累也要說一聲晚安。|{ta}的簡訊存到手機滿了，你都捨不得刪。}"
            : y < 2011 ? "你們每天晚上在 MSN 上聊天，{{ta}的暱稱換了什麼，你都第一個發現。|視訊畫面卡卡的，你們還是聊到半夜。}"
              : "你們每天視訊，{有時候只是開著鏡頭各做各的事，|LINE 的貼圖傳了好幾百張，}{再累也要說一聲晚安。|好像{ta}就在身邊。}";
      return {
        prompt: ctx.w(`${cause}，${cause.startsWith("{partner}") ? "兩個人" : "和{partner}"}變成了遠距離。要怎麼維持？`),
        options: [
          {
            id: "y_longDistance.daily", label: daily, hint: "再忙也要聯絡", act: "talk", style: "social", weight: 0.3,
            apply: (s2, c) => { warm(s2); return { text: c.w(`和{partner}變成遠距離，${dailyText}`), mood: 2 }; },
          },
          {
            id: "y_longDistance.visit", label: army ? `一放假就去找${ta}` : `每個週末去找${ta}`, hint: "車票錢不少", act: "travel", style: "family", weight: 0.25, when: () => !overseas,
            apply: (s2, c) => { spend(s2, 0.03); warm(s2); return { text: c.w(`和{partner}變成遠距離，你${army ? "一放假就" : "每個週末"}{搭${ride}去找{ta}，|跟{ta}約在兩個人中間的城市見面，}{車票錢花了不少，|在車上的時間都拿來補眠，}{但見面的那一刻，一切都值得。|兩個人把每次見面都當成約會。}`), mood: 3 }; },
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
            id: "y_longDistance.mail", label: `寄卡片和小包裹給${ta}`, hint: "見不到面，心意要到", act: "talk", style: "family", weight: 0.1,
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
        prompt: ctx.w([`和{partner}交往 ${n} 年，兩個人的房租加起來{好貴|快要一個月的薪水}，{ta}提議乾脆住在一起。要同居嗎？`, "{partner}的租約快到期了，{ta}問你：要不要一起租一間？", "你和{partner}常常待在彼此的住處，牙刷都放了兩支。要不要乾脆住在一起？"]),
        options: [
          {
            id: "y_cohabit.yes", label: "搬進同一間", hint: "省房租，也更了解彼此", act: "wait", style: "risk", weight: 0.25,
            apply: (s2, c) => { together(s2); return { text: c.w(`你和{partner}搬進一間{兩房的小公寓|有陽台的套房}，{才發現{ta}擠牙膏是從中間擠的。|第一個週末一起去${s2.year >= 1994 ? "IKEA" : "家具行"}買了好多東西。|兩個人輪流煮晚餐、分攤房租。}`), mood: 4 }; },
          },
          {
            id: "y_cohabit.own", label: "先各住各的", hint: "保留自己的空間", act: "wait", style: "self", weight: 0.3,
            apply: (s2, c) => ({ text: c.w("{partner}提議同居，你想保留自己的空間，{說好週末再一起過。|各住各的，見面反而更珍惜。}"), mood: 0 }),
          },
          {
            id: "y_cohabit.parents", label: `先跟${who}說`, hint: "家裡的觀念不一定接受", act: "talk", style: "family", weight: 0.15, when: s2 => parentsAlive(s2),
            apply: (s2, c) => {
              if (c.roll("family", "good", 0.5)) { together(s2); return { text: c.w(`想跟{partner}同居，你先跟${who}說了，${who}{雖然有點擔心，還是說「你們自己想清楚就好」。|要你們週末常回家吃飯。}`), mood: 2 }; }
              return { text: c.w(`想跟{partner}同居，你先跟${who}說了，${who}的觀念比較保守，{堅持要結婚才能住在一起，|唸了你好幾天，}你們決定先緩一緩。`), mood: -2 };
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
      const food = y >= 1988 ? "{雞排|珍珠奶茶|豆花|蛋糕}" : "{滷味|豆花|蛋糕}";
      return {
        prompt: ctx.w([`和{partner}為了${topic}吵了一架，{ta}${silent}。要怎麼辦？`, `因為${topic}，你和{partner}在{餐廳|回家的路上|電話裡}吵了起來，最後不歡而散。要怎麼辦？`]),
        options: [
          {
            id: "y_quarrel.sorry", label: "先道歉", hint: "退一步", act: "reconcile", style: "family", weight: 0.25,
            apply: (s2, c) => { warm(s2); return { text: c.w(`和{partner}為了${topic}吵架。你先開口道歉，{partner}{紅著眼睛說「我也有不對」。|愣了一下，還是笑了。}`), mood: 1 }; },
          },
          {
            id: "y_quarrel.talk", label: "冷靜一晚，再好好談", hint: "把在意的事說清楚", act: "talk", style: "social", weight: 0.25,
            apply: (s2, c) => { warm(s2); return { text: c.w(`和{partner}為了${topic}吵架。隔天你們找了{一家安靜的咖啡店|河堤邊}好好談，{才知道{ta}在意的其實是另一件事。|兩個人約好以後吵架不過夜。}`), mood: 2 }; },
          },
          {
            id: "y_quarrel.treat", label: `買${ta}愛吃的東西去找${ta}`, hint: "用行動和好", act: "talk", style: "risk", weight: 0.15,
            apply: (s2, c) => { warm(s2); return { text: c.w(`和{partner}為了${topic}吵架。你買了{ta}最愛的${food}，出現在{ta}家樓下，{partner}{嘴上說不要，還是吃完了。|一看到你就笑了。}`), mood: 2 }; },
          },
          {
            id: "y_quarrel.cold", label: "冷戰", hint: "誰也不想先低頭", act: "avoid", style: "self", weight: 0.25,
            apply: (s2, c) => { cool(s2); return { text: c.w(`和{partner}為了${topic}吵架，{兩個人冷戰了一個禮拜，|誰也不肯先低頭，}{最後是{ta}先${y >= 2011 ? "傳了一張貼圖" : "打了電話"}過來。|後來不了了之，心裡卻都有個結。}`), mood: -3 }; },
          },
          {
            id: "y_quarrel.friend", label: "找朋友訴苦", hint: "聽聽旁觀者怎麼說", act: "seekHelp", style: "social", weight: 0.1,
            apply: (s2, c) => { const f = friendOf(s2, c).call; return { text: c.w(`和{partner}為了${topic}吵架，你找{f}{吃宵夜|喝一杯}訴苦，{f}聽完說：「{你也有不對啦。|這種事大家都經歷過。}」{你想通了，回去主動和好。|心情好多了。}`, { f }), mood: 1 }; },
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
      const msg = y >= 1998 ? `每天傳訊息問你${work ? "下班" : "下課"}了沒` : "常常打電話給你";
      const found = y >= 2005 ? "直到{partner}看到你們的對話紀錄，" : "直到{partner}撞見你們一起吃飯，";
      return {
        prompt: ctx.w(`{${who}|一個好久不見的老同學}最近{常常約你吃飯|${msg}|總是對你特別好}，你發現自己有點期待對方的消息，心裡有點亂。要怎麼辦？`),
        options: [
          {
            id: "y_temptation.distance", label: "自然地提起自己有對象", hint: "把界線畫清楚", act: "talk", style: "social", weight: 0.35,
            apply: (s2, c) => { warm(s2); return { text: c.w("察覺到對方的好感，你在聊天時自然地提起{partner}，{之後對方也就保持了距離。|把單獨吃飯的邀約都改成大家一起去。}"), mood: 0 }; },
          },
          {
            id: "y_temptation.tell", label: `坦白告訴${name}`, hint: "不想有祕密", act: "talk", style: "family", weight: 0.2,
            apply: (s2, c) => {
              if (c.roll("love", "good", 0.6)) { warm(s2); return { text: c.w("察覺到有人對你有好感，你跟{partner}坦白了，{partner}{沉默了一下，然後握住你的手。|說：「謝謝你告訴我。」}你們反而更親近了。"), mood: 2 }; }
              return { text: c.w("察覺到有人對你有好感，你跟{partner}坦白了，{partner}{吃醋了好幾天，|問了好多問題，}{你花了一些時間才讓{ta}安心。|兩個人約好以後有事都要說。}"), mood: -1 };
            },
          },
          {
            id: "y_temptation.enjoy", label: "享受被欣賞，但不越線", hint: "只是朋友而已", act: "wait", style: "self", weight: 0.2,
            apply: (s2, c) => {
              if (c.roll("love", "bad", 0.4)) { cool(s2); return { text: c.w(`覺得只是朋友，你照樣跟對方吃飯聊天，${found}{兩個人大吵了一架。|{ta}有好一陣子不太跟你說話。}`), mood: -4 }; }
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
      const watch = y < 1985 ? "{聽了一整晚的唱片，|看了一部電視上的老電影，}" : y < 2000 ? "{租了幾支錄影帶，|看了一整晚的電視，}" : y < 2013 ? "{租了好幾片 DVD，|看了一整晚的電影，}" : "{追了一整晚的影集，|看了兩部電影，}";
      const t = [
        `和{partner}去${place}，{兩個人聊到忘了時間。|你偷偷拍了好多張{ta}的側臉。|回程時{ta}靠在你肩膀上睡著了。}`,
        `{颱風天|寒流來的晚上}，你和{partner}窩在家裡${watch}{煮了一鍋泡麵加蛋，|叫了一份鹹酥雞，}{覺得這樣就很幸福。|外面風雨再大都沒關係。}`,
        "{partner}生日那天，你{排了兩個小時的隊，買到{ta}一直想吃的蛋糕。|親手做了一本相簿，把你們的照片一張一張貼上去。}{ta}{抱著你哭了。|笑你傻，卻一直捧在手上。}",
      ];
      if (n >= 1) t.push(`交往${cn(n)}週年，{partner}{準備了一個小驚喜，|訂了你們第一次約會的餐廳，}{你感動得說不出話。|那天的晚餐你記了好久。}`);
      return { text: ctx.w(t), mood: 3 };
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
        prompt: `${bff ? `從小一起長大的${name}` : friendIntro(f)}要結婚了，找你當${role}。要怎麼回應？`,
        options: [
          {
            id: "y_bestman.yes", label: "一口答應，全力幫忙", hint: "從早忙到晚", act: "socialize", style: "social", weight: 0.35,
            apply: (s2, c) => {
              spend(s2, 0.02); bond(f, 0.1); c.remember("y_bestman", `當了${name}的${role}`);
              return { text: c.w(male
                ? `${name}結婚找你當伴郎，你一口答應，{迎娶那天一早五點就到${name}家，|幫忙跑腿、擋酒、招呼客人，}{陪著他一關一關闖過伴娘團的考驗。|喝了好幾杯喜酒，累到腳軟。}{看著${name}在台上紅了眼眶，你也跟著鼻酸。|婚禮結束時，${name}抱了你一下說謝謝。}`
                : `${name}結婚找你當伴娘，你一口答應，{一早就到新娘房幫忙，|幫她提裙襬、擋酒、補妝，}{穿著高跟鞋站了一整天。|累到腳軟，卻笑了一整天。}{看著${name}走上紅毯，你也跟著紅了眼眶。|送客時，${name}抱著你說謝謝。}`), mood: 4 };
            },
          },
          {
            id: "y_bestman.games", label: male ? "負責幫新郎闖關" : "負責設計闖關遊戲", hint: "讓婚禮熱鬧一點", act: "socialize", style: "risk", weight: 0.15, when: () => y >= 1990,
            apply: (s2, c) => ({ text: c.w(male
              ? `${name}結婚，你當伴郎負責幫他闖關，{替他做了五十個伏地挺身，|喝下了一大杯苦瓜汁，|在門口唱了一首情歌，}{總算把新娘娶出了門。|大家笑成一團。}`
              : `${name}結婚，你和伴娘團設計了迎娶的闖關遊戲，{要新郎說出新娘的十個優點，|讓新郎唱一首情歌，|在門口擋了新郎半個小時，}{大家笑到不行。|${name}笑著說你們太狠了。}`), mood: 4 }),
          },
          {
            id: "y_bestman.video", label: y >= 2005 ? "幫忙做婚禮影片" : "負責婚禮的攝影", hint: "用作品當賀禮", act: "hobby", style: "learn", weight: 0.15,
            apply: (s2, c) => ({ text: c.w(y >= 2005
              ? `${name}結婚，你熬了好幾個晚上，幫忙做了一支{成長影片|愛情故事影片}，{在婚宴上播放時，${name}的爸媽都哭了。|全場跟著一起拍手。}`
              : `${name}結婚，你負責婚禮的攝影，{拍了好幾卷底片，|跟著新人跑了一整天，}{後來那本相簿，${name}一直留著。|${name}說那是他們最喜歡的照片。}`), mood: 4 }),
          },
          {
            id: "y_bestman.decline", label: `婉拒當${role}，包個大紅包`, hint: "人到，心意到", act: "wait", style: "self", weight: 0.15,
            apply: (s2, c) => { spend(s2, 0.03); return { text: c.w(`${name}找你當${role}，你${male ? "{那陣子工作太忙，|怕自己太緊張出糗，}" : "{想起長輩說「當伴娘超過三次會嫁不出去」，|那陣子工作太忙，}"}婉拒了，{但包了一個大紅包，|喜宴那天還是第一個到，}${name}笑著說人來就好。`), mood: 1 }; },
          },
          {
            id: "y_bestman.speech", label: "答應，還上台致詞", hint: "要先寫講稿", act: "socialize", style: "family", weight: 0.1,
            apply: (s2, c) => { bond(f, 0.1); return { text: c.w(`${name}結婚，你當${role}，還在婚宴上致詞，{寫了好幾版講稿，|上台前手一直抖，}{講到你們以前的糗事，全場都笑了。|講到最後，${name}${male ? "哭得說不出話" : "哭得妝都花了"}。}`), mood: 4 }; },
          },
        ],
      };
    },
  },
  {
    // 好友遇到低潮，半夜找你。
    id: "y_friendDown", ages: [18, 29], cooldown: 4, max: 2, when: s => !s.abroad, p: () => 0.025,
    choice: (s, ctx) => {
      const y = s.year, f = friendOf(s, ctx), name = f.call, ta = pronoun(f);
      const what = ctx.rng.pick(s.age < 22 ? ["失戀了", "考試考砸了", "跟家裡大吵了一架", "被好朋友誤會了"] : ["失戀了", "被交往好幾年的對象分手了", "研究所沒考上", "工作被裁員了", "跟家裡大吵了一架"]);
      const call = y >= 2011 ? "傳了一句「睡了嗎？」" : y >= 1998 ? "打了你的手機" : "打電話到你家";
      const lead = `${name}${what}`;
      return {
        prompt: ctx.w(`半夜一點，${friendIntro(f)}${call}，說${what}，{聲音聽起來很糟。|一直說沒事，卻一直不掛電話。}要怎麼辦？`),
        options: [
          {
            id: "y_friendDown.go", label: `馬上去找${ta}`, hint: "人到最重要", act: "care", style: "family", weight: 0.25,
            apply: (s2, c) => { bond(f, 0.1); return { text: c.w(`${lead}，你{抓了外套就出門，|騎車穿過半個城市，}在{便利商店門口|河堤邊|${ta}家樓下}陪${ta}坐到天亮，{${ta}哭完說好多了。|兩個人沒說什麼話，只是一起看著天慢慢變亮。}`), mood: 1 }; },
          },
          {
            id: "y_friendDown.listen", label: "陪著講電話到天亮", hint: "先聽就好", act: "talk", style: "social", weight: 0.25,
            apply: (s2, c) => { bond(f, 0.05); return { text: c.w(`${lead}，你陪${ta}講電話講到天亮，{大部分的時間都是${ta}在說，你在聽。|話筒燙到不行，你們還是沒掛。}{隔天你一直打瞌睡，但一點也不後悔。|最後${ta}說：「謝謝你在。」}`), mood: 0 }; },
          },
          {
            id: "y_friendDown.trip", label: `週末約${ta}出去走走`, hint: "換個地方透透氣", act: "travel", style: "risk", weight: 0.15,
            apply: (s2, c) => { spend(s2, 0.02); return { text: c.w(`${lead}，你約${ta}週末{去墾丁看海，|去花蓮的海邊走走，|去淡水看夕陽，|上九份喝茶，|去日月潭騎腳踏車，}{兩個人一路上沒說太多話，|一路上吃吃喝喝，}{回來的時候，${ta}終於笑了。|${ta}說好像重新活過來了。}`), mood: 2 }; },
          },
          {
            id: "y_friendDown.gang", label: "找大家一起陪" + ta, hint: "人多比較熱鬧", act: "socialize", style: "social", weight: 0.12,
            apply: (s2, c) => ({ text: c.w(`${lead}，你找了幾個老朋友，{一起陪${ta}去吃熱炒，|${y >= 1988 ? "在 KTV 唱了一整晚，" : "在冰果室坐到打烊，"}}{大家輪流講自己的糗事逗${ta}笑。|${name}一直說：「有你們真好。」}`), mood: 2 }),
          },
          {
            id: "y_friendDown.space", label: `先讓${ta}靜一靜`, hint: "給對方一點時間", act: "wait", style: "self", weight: 0.23,
            apply: (s2, c) => ({ text: c.w(`${lead}，你覺得${ta}需要一點時間，{${y >= 2011 ? "回了一句「需要我的話，我都在」" : "說了一句「想說話就打給我」"}，${ta}後來說，那句話對${ta}很重要。|跟${ta}約好隔天一起吃飯，第二天${ta}準時出現，眼睛還是腫的。}`), mood: 0 }),
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
      const night = y >= 1988 ? "{在熱炒店喝到半夜，|去 KTV 唱到天亮，|在河堤邊聊了一整晚，}" : "{在冰果室聊到打烊，|在河堤邊聊了一整晚，}";
      const keep = y >= 2011 ? "{約好每個月視訊一次，|靠著 LINE 聯絡，}" : y >= 2005 ? "{約好每個月視訊一次，|靠著 MSN 聯絡，}" : "{約好常常寫信，|偶爾打一通越洋電話，}";
      const far = /美國|加拿大|德國/.test(dest) ? "時差讓你們常常一個在吃早餐、一個準備睡覺。|" : "";
      return {
        text: ctx.w([
          `${friendIntro(f)}要去${dest}，出發前一晚，你們${night}${name}說一定會回來。`,
          `你送${name}到${airport}，看著${pronoun(f)}拖著兩個大行李箱去${dest}，{在出境大廳揮手揮到看不見。|回程的車上，你一直看著窗外。}`,
          `${name}去${dest}以後，你們${keep}{${far}${name}寄來一張明信片，你貼在冰箱上。|每次${name}回台灣，你們都約出來吃一頓。}`,
        ]),
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
        prompt: ctx.w(`大學畢業 ${n} 年，${call}。{聽說有人當了主管，有人已經當爸媽了。|大家好久沒見了。}要去嗎？`),
        options: [
          {
            id: "y_reunion.go", label: "去，好好敘舊", hint: "好久不見", act: "socialize", style: "social", weight: 0.35,
            apply: (s2, c) => ({ text: c.w("大學同學會上，{大家聊起當年翹課、夜衝的糗事，笑到停不下來。|看著大家的變化，你發現大家其實都沒變。|有人帶著另一半，有人抱著孩子，熱鬧得不得了。}"), mood: 3 }),
          },
          {
            id: "y_reunion.skip", label: "不去，怕被比較", hint: "現在不想被問東問西", act: "avoid", style: "self", weight: 0.25,
            apply: (s2, c) => ({ text: c.w(`大學同學會，你想了想{還是沒去，|推說要加班，}${y >= 2008 ? "{在網路上看到大家的合照，默默按了讚。|晚上滑著大家的合照，有點後悔。}" : "{後來聽說大家玩得很開心。|隔天聽同學說了好多八卦。}"}`), mood: -1 }),
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
