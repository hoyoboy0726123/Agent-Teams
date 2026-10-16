// 人生的骨架：上學、工作、感情、生孩子、買房、生病、離世。這些事件的機率來自台灣統計（rates.js），
// test/calibration.test.js 檢查模擬出來的人口仍符合統計，所以這裡的機率和「自動選擇」的比重不能隨意改。
//
// Event fields (see story/README.md for the whole list):
//   domain, channel   which yearly luck channel tilts it (luck.js); omitted for fixed milestones
//   ages, when        when it can happen; once / cooldown / max limit repeats
//   p(s, ctx)         base probability for this year
//   apply(s, ctx)     what happens → { text, mood, big }
//   choice(s, ctx)    instead of apply → { prompt, options: [{ id, label, hint, act, style, weight, when, apply }] }
import { analyseText, siblingCall, listWords } from "../words.js";
import { RELATIONS } from "../../core/family.js";
import { JOBS, tier, jobsFor, startJob, otherJob, moveTo, yearsMarried, bornSiblings, ABROAD, exam15Name, exam18Name, wage, jobFit, fitsPattern } from "../world.js";
import { newKid, meetPlace, pronoun } from "../people.js";
import { marry, endRelationship, closeSpell, ownHome } from "../act.js";

// How two people met, as the start of a sentence.
const MET = { 同學: "在學校認識了同學", 同事: "在公司認識了同事", 朋友介紹: "朋友介紹認識了", 社團活動: "在社團活動認識了", 長輩安排的相親: "長輩安排相親，認識了", 相親: "去相親，認識了", 網路聊天室: "在網路聊天室認識了", 交友軟體: "在交友軟體上認識了", 健身房: "在健身房認識了", 旅行途中: "旅行途中認識了" };
const motherAge = s => (s.sex === "female" ? s.age : s.partner ? s.partner.age : 99);
const kidWord = k => (k.sex === "male" ? "兒子" : "女兒");

// A quarrel with one parent, as a choice. Teenagers quarrel about school and going out, adults about work and love.
function parentClash(who) {
  const label = RELATIONS[who], they = who === "father" ? "他" : "她";
  return {
    id: `${who}Clash`, domain: "family", channel: "bad", tags: [who], about: who, ages: [13, 30], cooldown: 4, when: s => s[who].alive,
    p: () => 0.03,
    choice: (s, ctx) => {
      const topic = ctx.rng.pick(s.age <= 18 ? ["成績", "滑手機", "晚回家", "交朋友", "選組"] : s.rel === "dating" ? ["交往的對象", "什麼時候結婚"] : s.rel === "married" ? ["過年要回哪一邊", "孩子的事"] : ["工作", "搬出去住", "花錢的方式"]);
      return {
        prompt: `你和${label}為了${topic}吵了一架，兩個人都在氣頭上。要怎麼辦？`,
        options: [
          { id: "clash.sorry", label: "先去道歉", hint: "退一步", act: "reconcile", style: "family", weight: 0.25, apply: (s2, c) => ({ text: c.w(`和${label}為了${topic}吵架。你先開口道歉，${label}{嘴上沒說什麼，晚餐卻多夾了一塊肉給你。|愣了一下，拍拍你的肩膀。}`), mood: 1 }) },
          { id: "clash.talk", label: "找時間好好談", hint: "說出自己的想法", act: "talk", style: "social", weight: 0.35, apply: (s2, c) => ({ text: c.w(`和${label}為了${topic}吵架。過了幾天兩個人好好談了一次，你才知道${they}其實是擔心你。`), mood: 2 }) },
          { id: "clash.letter", label: "寫一張紙條", hint: "當面說不出口", act: "talk", style: "family", weight: 0.1, apply: (s2, c) => ({ text: c.w(`和${label}為了${topic}吵架。你寫了一張紙條放在桌上，隔天早上，紙條背面多了${label}的回覆。`), mood: 2 }) },
          { id: "clash.help", label: "找家人幫忙說", hint: "請人當和事佬", act: "seekHelp", style: "social", weight: 0.1, apply: (s2, c) => ({ text: c.w(`和${label}為了${topic}吵架。{阿嬤|姑姑|舅舅}出面打圓場，兩個人才各退一步。`), mood: 1 }) },
          { id: "clash.cold", label: "冷戰", hint: "先不理對方", act: "avoid", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`和${label}為了${topic}吵架，{冷戰了好幾個星期。|好一陣子在家裡都不說話。}`), mood: -4 }) },
        ],
      };
    },
  };
}

export const CORE = [
  // ---------- birth and childhood ----------
  {
    id: "birth", once: true, ages: [0, 0], big: true, p: () => 1,
    apply: (s, ctx) => ({ text: analyseText(ctx.analysis, ctx.chart, s), mood: 0, big: true }),
  },
  {
    id: "sibling", domain: "family", channel: "good", tags: ["siblings"], ages: [1, 12], when: s => s.siblings.unborn > 0,
    p: () => 0.32,
    apply: (s, ctx) => {
      const relation = ctx.rng() < 0.5 ? "youngerBrother" : "youngerSister";
      s.siblings.unborn -= 1;
      s.siblings.list.push({ relation, label: RELATIONS[relation], name: "", older: false, bornAt: s.age, born: true });
      return { text: ctx.w(["{x}出生了，家裡更熱鬧了。", "你多了一個{x}，{你偷偷覺得自己長大了。|你天天跑去看{x}睡覺。}", "{x}出生那天，你在醫院走廊等了一整個下午。"], { x: RELATIONS[relation] }), mood: 3 };
    },
  },
  {
    // A younger brother or sister from the family input, born in the year of their birth date.
    id: "knownSibling", when: s => s.siblings.list.some(x => !x.born && x.bornAt === s.age), p: () => 1,
    apply: (s, ctx) => {
      const now = s.siblings.list.filter(x => !x.born && x.bornAt === s.age);
      for (const x of now) x.born = true;
      const who = listWords(now.map(siblingCall));
      if (s.age === 0) return { text: `同一年，${who}也出生了。`, mood: 2 };
      return { text: now.length > 1 ? `${who}出生了，家裡一下子熱鬧起來。` : ctx.w(["{x}出生了，家裡更熱鬧了。", "你多了一個{x}，你偷偷覺得自己長大了。"], { x: who }), mood: 3 };
    },
  },
  {
    id: "kindergarten", once: true, ages: [4, 4], p: (s, ctx) => ctx.R.kindergarten(s.year),
    apply: (s, ctx) => ({ text: ctx.w(["上幼兒園了，第一天哭著不讓{媽媽|阿嬤}走。", "上幼兒園了，{很快就交到第一個好朋友。|每天回家都要表演學到的兒歌。}", "背著小書包上幼兒園，{午睡時間永遠睡不著。|最喜歡點心時間。}"]), mood: 1 }),
  },
  {
    id: "primary", once: true, ages: [6, 7], p: (s, ctx) => (s.age === 7 ? 1 : 0.85),
    apply: (s, ctx) => { s.edu = "國小"; s.studying = true; s.track = "國小"; return { text: ctx.w(["上國小了，{揹著新書包|穿著有點太大的制服}走進校門，{一直回頭看{媽媽|阿嬤}還在不在。|第一天就交到一個朋友。|書包裡的鉛筆盒是你挑了好久的。}", "上國小一年級，{最期待的是下課鐘聲。|最喜歡的是營養午餐。|第一次學寫自己的名字。}", "上國小了，{第一次自己走路上學。|導師是個說話很溫柔的老師。|坐在你旁邊的同學{很愛講話|會分你零食}。}"]), mood: 2 }; },
  },
  {
    id: "childIllness", domain: "health", channel: "bad", grave: true, ages: [0, 12], cooldown: 4, p: () => 0.006,
    apply: (s, ctx) => ({ text: ctx.w(["生了一場大病，住院兩個星期，爸媽輪流守在床邊，後來康復了。", "得了嚴重的肺炎，住院一陣子才好。", "{半夜高燒不退，|發高燒抽筋，}被緊急送醫，{住了一個星期才出院。|爸媽嚇壞了。}"]), mood: -6 }),
  },
  {
    id: "familyMove", domain: "move", channel: "change", ages: [1, 17], cooldown: 3, p: () => 0.025,
    apply: (s, ctx) => ({ text: ctx.w(["跟著家人搬到{to}，要重新認識新同學。", "爸爸換工作，全家搬到{to}，{你哭著跟好朋友道別。|新家比較大，你有了自己的房間。}"], { to: moveTo(s, ctx) }), mood: -1 }),
  },
  {
    id: "parentsDivorce", once: true, domain: "family", channel: "bad", tags: ["father", "mother"], ages: [2, 17], when: s => s.father.alive && s.mother.alive,
    p: (s, ctx) => ctx.R.divorce(s.age + 3, s.year) * 0.8,
    apply: (s, ctx) => { s.flags.parentsSplit = true; return { text: ctx.w(["爸媽離婚了，你跟著其中一方生活，兩邊都還是很疼你。", "爸媽決定分開，家裡安靜了很多。", "爸媽離婚了，{你開始週末兩邊跑。|那年的生日蛋糕，是兩個人分別買的。}"]), mood: -10 }; },
  },
  {
    id: "siblingRivalry", domain: "family", channel: "bad", tags: ["siblings"], about: "siblings", ages: [5, 17], cooldown: 3,
    when: s => bornSiblings(s, 3).length > 0, p: () => 0.07,
    apply: (s, ctx) => {
      const x = siblingCall(ctx.rng.pick(bornSiblings(s, 3)));
      return { text: ctx.w(["和{x}為了搶{遙控器|電腦|最後一塊雞腿}大吵一架，兩個人一起被罰站。", "和{x}冷戰了三天，最後還是一起偷吃冰箱裡的布丁。", "總覺得爸媽比較疼{x}，偷偷生了好幾天悶氣。", "{x}弄壞了你最寶貝的{玩具|模型|筆記本}，你氣到{哭了|不吃晚飯}。"], { x }), mood: -2 };
    },
  },

  // ---------- school ----------
  {
    id: "junior", once: true, ages: [12, 13], when: s => s.edu === "國小", p: (s, ctx) => (s.age === 13 ? ctx.R.juniorHigh(s.year) : 0),
    apply: (s, ctx) => { s.edu = "國中"; s.track = "國中"; return { text: ctx.w(["上國中了，{開始有寫不完的考卷。|每天第八節都在考試。|書包重到肩膀痛。}", "上國中了，{第一次參加社團。|第一次換教室上課。|認識了一群新同學。}", "上國中了，{第一次穿制服，|頭髮被要求剪短，|第一次自己騎腳踏車上學，}{覺得自己變成大人了。|很不習慣。|心裡有點緊張。}"]), mood: 1 }; },
  },
  {
    id: "leaveAfterPrimary", once: true, ages: [13, 13], when: s => s.edu === "國小" && s.studying, p: () => 1,
    apply: (s, ctx) => { s.studying = false; return { text: ctx.w(["國小畢業後沒有繼續升學，開始幫家裡做事。", "國小畢業，家裡需要人手，你{去工廠當學徒|在家裡的店幫忙}。"]), mood: -2 }; },
  },
  {
    id: "exam15", calibrated: true, ages: [15, 16], when: s => s.edu === "國中" && s.studying && (s.age === 15 || s.flags.retake_exam15) && !s.flags.done15, p: () => 1,
    choice: (s, ctx) => {
      const w = ctx.R.seniorHigh(s.year), retake = !!s.flags.retake_exam15;
      const good = ctx.rng() < ctx.odds("study", "good", retake ? 0.5 : 0.35);
      const score = good ? "考得很好" : ctx.rng.pick(["考得普通", "考得不太理想"]);
      const exam = exam15Name(s.year);
      const done = s2 => { s2.flags.done15 = true; s2.flags.retake_exam15 = false; s2.flags.trackAt = s2.age; };
      return {
        prompt: `${retake ? "重考一年，" : "國中畢業，"}${exam}${score}。接下來想讀什麼？`,
        options: [
          { id: "exam15.high", label: "讀高中", hint: "三年後再考大學", act: "study", style: "learn", weight: w.高中 * (good ? 1.3 : 0.8), apply: s2 => { done(s2); s2.track = "高中"; return { text: ctx.w(`${exam}${score}，{進了高中。|考上{家附近的|離家有點遠的}高中。}`), mood: good ? 6 : 1 }; } },
          { id: "exam15.vocational", label: "讀高職", hint: "早點學一技之長", act: "careerSwitch", style: "safe", weight: w.高職, apply: s2 => { done(s2); s2.track = "高職"; return { text: ctx.w(`${exam}${score}，選了高職{電機科|餐飲科|商業科|汽修科|資訊科}，想早點學一技之長。`), mood: 2 }; } },
          { id: "exam15.five", label: "讀五專", hint: "五年一貫，畢業就是專科", act: "study", style: "safe", weight: w.五專, apply: s2 => { done(s2); s2.track = "五專"; return { text: ctx.w(`${exam}${score}，進了五專{護理科|電子科|外語科|機械科}。`), mood: 2 }; } },
          { id: "exam15.retake", label: "重考一年", hint: "再拚一次", act: "study", style: "risk", weight: retake ? 0 : 0.02, when: () => !retake, apply: s2 => { s2.flags.retake_exam15 = true; return { text: `${exam}${score}，你決定重考一年，每天到補習班報到。`, mood: -2 }; } },
          { id: "exam15.work", label: "先去工作", hint: "提早賺錢", act: "jobSearch", style: "self", weight: w.就業, apply: s2 => { done(s2); s2.studying = false; return { text: ctx.w("國中畢業就先出社會{工作|當學徒}。"), mood: -1 }; } },
        ],
      };
    },
  },
  {
    id: "exam18", calibrated: true, ages: [17, 21], when: s => s.studying && (s.track === "高中" || s.track === "高職") && (s.age >= (s.flags.trackAt ?? 15) + 3 || s.flags.retake_exam18) && !s.flags.done18, p: () => 1,
    choice: (s, ctx) => {
      const enter = ctx.R.college(s.year, s.track), retake = !!s.flags.retake_exam18;
      const good = ctx.rng() < ctx.odds("study", "good", retake ? 0.5 : 0.35);
      s.edu = s.track;
      const exam = exam18Name(s.year);
      const where = good ? ctx.rng.pick(["理想的科系", "第一志願"]) : ctx.rng.pick(["還可以的學校", "離家有點遠的學校"]);
      const done = s2 => { s2.flags.done18 = true; s2.flags.retake_exam18 = false; s2.flags.uniAt = s2.age; };
      const uni = s.track === "高中" ? "大學" : "科大";
      return {
        prompt: `${s.track}畢業了，${exam}考上${where}。要去讀嗎？`,
        options: [
          { id: "exam18.night", label: "白天工作，晚上讀夜間部", hint: "邊賺邊讀", act: "study", style: "safe", weight: enter * 0.05, apply: s2 => { done(s2); s2.track = uni; s2.flags.nightSchool = true; return { text: `考上${where}的夜間部。白天在外面打工，晚上拖著疲累的身體去上課。`, mood: 2 }; } },
          { id: "exam18.go", label: s.track === "高中" ? "去讀大學" : "去讀科大", hint: "四年後畢業", act: "study", style: "learn", weight: enter * 0.92, apply: s2 => { done(s2); s2.track = uni; return { text: ctx.w(`考上${where}，{開始大學生活。|搬進學校宿舍。|第一次離家住。}`), mood: good ? 7 : 3 }; } },
          { id: "exam18.retake", label: "重考一年", hint: "拚更好的學校", act: "study", style: "risk", weight: retake ? 0 : enter * 0.03, when: () => !retake, apply: s2 => { s2.flags.retake_exam18 = true; return { text: `考上${where}，但你不甘心，決定重考一年。`, mood: -2 }; } },
          { id: "exam18.abroad", label: "出國讀大學", hint: "需要家裡支持", act: "studyAbroad", style: "learn", weight: 0.01, when: s2 => s2.year >= 1980, apply: s2 => { done(s2); s2.track = "大學"; s2.abroad = ctx.rng.weighted([["美國", 3], ["日本", 2], ["英國", 1], ["澳洲", 1]]); s2.leftAt = s2.age; return { text: `到${s2.abroad}讀大學，一個人拖著兩個大行李箱出國。`, mood: 4, big: true }; } },
          { id: "exam18.work", label: "先去工作", hint: "邊做邊想", act: "jobSearch", style: "self", weight: (1 - enter) * 0.8, apply: s2 => { done(s2); s2.studying = false; return { text: `${s2.edu}畢業後先去工作。`, mood: 0 }; } },
          { id: "exam18.military", label: "先去當兵", hint: "當完兵再說", act: "wait", style: "safe", weight: (1 - enter) * 0.2, when: s2 => s2.sex === "male", apply: s2 => { done(s2); s2.studying = false; return { text: `${s2.edu}畢業，先去當兵，想清楚再決定。`, mood: 0 }; } },
        ],
      };
    },
  },
  {
    id: "graduate5", once: true, ages: [20, 22], when: s => s.studying && s.track === "五專" && s.age >= (s.flags.trackAt ?? 15) + 5, p: () => 1,
    apply: (s, ctx) => { s.edu = "五專"; s.studying = false; return { text: ctx.w(["五專畢業了。", "五專畢業，{拿到了護理師執照。|和同學約好十年後再見。}"]), mood: 3 }; },
  },
  {
    // Not everyone who starts college finishes: about 5 % leave without a degree (estimate; it brings the share of
    // 25–34-year-olds with a degree to the 主計總處 figure, since the 升學率 in rates.js count only who starts).
    id: "uniDropout", once: true, ages: [18, 25], when: s => s.studying && (s.track === "大學" || s.track === "科大") && s.age > (s.flags.uniAt ?? 18) && s.age < (s.flags.uniAt ?? 18) + 4, p: () => 0.017,
    apply: (s, ctx) => {
      s.studying = false; s.track = s.edu; s.flags.dropout = s.age;
      return { text: ctx.w(["大學讀到第{二|三}年，{覺得科系不適合自己，|家裡的經濟出了狀況，|一直提不起勁念書，}決定休學，先去工作。", "{學分一直被當，|打工越做越多，}{最後辦了休學。|書沒讀完就離開學校了。}爸媽嘆了一口氣，沒有多說什麼。"]), mood: -3 };
    },
  },
  {
    id: "graduateUni", calibrated: true, once: true, ages: [21, 26], when: s => s.studying && (s.track === "大學" || s.track === "科大") && s.age >= (s.flags.uniAt ?? 18) + 4, p: () => 1,
    choice: (s, ctx) => {
      s.edu = s.track;
      const p = ctx.R.master(s.year);
      return {
        prompt: `${s.track}畢業了！接下來呢？`,
        options: [
          { id: "uni.master", label: "考研究所", hint: "多讀兩年", act: "study", style: "learn", weight: p, apply: s2 => { s2.track = "碩士"; s2.flags.masterAt = s2.age; return { text: ctx.w(["大學畢業，接著考上研究所。", "大學畢業，決定再讀兩年研究所。"]), mood: 4 }; } },
          { id: "uni.work", label: "直接工作", hint: "開始賺錢", act: "jobSearch", style: "safe", weight: (1 - p) * 0.85, apply: s2 => { s2.studying = false; return { text: ctx.w(["{大學|四年}畢業了，{準備找工作。|把履歷修了一遍又一遍。|和室友約好要常聯絡。}", "穿著學士服拍完照，{開始投履歷。|隔週就去面試了。|在校門口和爸媽合照。}"]), mood: 3 }; } },
          { id: "uni.gap", label: "先去打工度假", hint: "看看世界", act: "workAbroad", style: "risk", weight: (1 - p) * 0.05, when: s2 => s2.year >= 2004, apply: s2 => { s2.studying = false; s2.abroad = ctx.rng.pick(["澳洲", "紐西蘭", "日本", "加拿大"]); s2.leftAt = s2.age; return { text: `大學畢業，先去${s2.abroad}打工度假一年，在農場和餐廳打工。`, mood: 5, big: true }; } },
          { id: "uni.abroad", label: "出國讀研究所", hint: "花費比較高", act: "studyAbroad", style: "learn", weight: p * 0.1, apply: s2 => { s2.track = "碩士"; s2.flags.masterAt = s2.age; s2.abroad = ctx.rng.weighted([["美國", 3], ["英國", 2], ["日本", 1], ["德國", 1]]); s2.leftAt = s2.age; return { text: `大學畢業，出國到${s2.abroad}讀研究所。`, mood: 5, big: true }; } },
          { id: "uni.rest", label: "先休息一陣子", hint: "想清楚再出發", act: "rest", style: "self", weight: (1 - p) * 0.1, apply: s2 => { s2.studying = false; return { text: ctx.w("大學畢業，{先在家休息幾個月，|打打工，}{想清楚自己要什麼。|陪家人過了一段悠閒的日子。}"), mood: 2 }; } },
        ],
      };
    },
  },
  {
    id: "graduateMaster", once: true, ages: [23, 30], when: s => s.studying && s.track === "碩士" && s.age >= (s.flags.masterAt ?? 22) + 2, p: s => (s.age >= (s.flags.masterAt ?? 22) + 3 ? 1 : 0.85),
    apply: (s, ctx) => { s.edu = "碩士"; s.studying = false; return { text: ctx.w(["碩士畢業，論文口試順利通過。", "熬了好幾個通宵，終於拿到碩士學位。", "碩士畢業，{指導教授請全實驗室吃飯。|爸媽特地上來參加畢業典禮。}"]), mood: 5 }; },
  },
  {
    id: "studyAward", domain: "study", channel: "good", ages: [7, 24], cooldown: 3, when: s => s.studying, p: () => 0.05,
    apply: (s, ctx) => ({ text: ctx.w(["拿到全班第一名，獎狀貼在客廳牆上。", "參加{作文|演講|科展|數學}比賽得獎了。", "拿到獎學金，請全家吃了一頓。", "被選為{模範生|班長}，{上台領獎時腿在抖。|爸媽笑得合不攏嘴。}"]), mood: 4 }),
  },
  {
    id: "studySetback", domain: "study", channel: "bad", ages: [10, 24], cooldown: 3, when: s => s.studying, p: () => 0.04,
    apply: (s, ctx) => ({ text: ctx.w(["成績退步很多，被叫去辦公室談話。", "考試考砸了，關在房間一整天。", "{數學|英文|物理}被當，{暑假要重修。|不敢告訴家裡。}"]), mood: -3 }),
  },
  {
    id: "military", once: true, ages: [18, 26], when: s => s.sex === "male" && !s.studying && s.age >= 18, p: () => 0.9,
    apply: (s, ctx) => { const m = ctx.R.military(s.birthYear, s.year); return { text: m.text.replace(/，.*$/, "") + ctx.w("，{在營區度過了好多個站哨的夜晚。|學會在五分鐘內整理好內務。|交到幾個一輩子的朋友。|退伍那天把軍帽丟得好高。|每次放假都搶第一班車回家。|被分到{外島|山上的營區|海邊的營區}，看了好多次日出。}"), mood: -1 }; },
  },

  // ---------- work ----------
  {
    // The first job: a few offers, likelier the ones that fit the chart (五行行業 and 格局, world.js).
    id: "firstJob", calibrated: true, once: true, ages: [14, 40], when: s => !s.studying && !s.employed && !s.arcs.startup && !s.arcs.civil && (s.sex === "female" || s.done.has("military") || s.age >= 26 || s.age < 18),
    p: (s, ctx) => ctx.R.jobFind(s.age),
    choice: (s, ctx) => {
      const list = jobsFor(s).slice(), offers = [];
      while (offers.length < Math.min(4, list.length)) {
        const j = ctx.rng.weighted(list.map(x => [x, jobFit(ctx.analysis, x, ctx.name)]));
        offers.push(j); list.splice(list.indexOf(j), 1);
      }
      const useful = ctx.analysis.useful;
      const hint = ([, , field, el]) => `${field}・屬${el}${useful.includes(el) ? "・命盤喜用" : ctx.analysis.avoid.includes(el) ? "・命盤較忌" : ""}${fitsPattern(ctx.analysis, field) ? `・合${ctx.analysis.pattern}` : ""}`;
      const done = (s2, job) => {
        const title = startJob(s2, ctx, job), el = job[3];
        const lead = useful.includes(el) ? `這份工作屬${el}，正是命盤的喜用。` : "";
        return { text: ctx.w(["找到第一份工作：{title}。{lead}", "第一份工作是{title}，{第一個月的薪水拿去請爸媽吃飯。|穿上新買的襯衫去報到。}{lead}", "當上{title}，{開始每天擠公車上班。|從最基層做起。}{lead}"], { title, lead }), mood: 5, big: true };
      };
      return {
        prompt: `${s.edu === "none" || s.edu === "國小" || s.edu === "國中" ? "開始找工作了" : `${s.edu}畢業，開始找工作`}。有幾個工作機會，你想做哪一個？`,
        options: [
          ...offers.map((job, i) => ({ id: `firstJob.${i}`, label: job[0], hint: hint(job), act: "jobSearch", weight: jobFit(ctx.analysis, job, ctx.name), apply: s2 => done(s2, job) })),
          { id: "firstJob.wait", label: "都不要，再找找看", hint: "可能要多等一陣子", act: "wait", style: "self", weight: 0.08, apply: () => ({ text: "看了幾個工作機會都不喜歡，你決定再找找看。", mood: -1 }) },
        ],
      };
    },
  },
  {
    id: "findJob", domain: "career", channel: "good", ages: [16, 64], when: s => !s.studying && !s.employed && s.done.has("firstJob") && !s.retired && !s.arcs.startup && !s.arcs.civil,
    p: () => 0.6,
    apply: (s, ctx) => {
      const first = !s.jobsHeld.length && !s.job;   // after "都不要，再找找看" the next job is still the first one
      const title = startJob(s, ctx);
      return first
        ? { text: ctx.w(["多找了一陣子，找到第一份工作：{title}。", "{投了幾十封履歷，|朋友幫忙介紹，}終於找到第一份工作：{title}。"], { title }), mood: 6, big: true }
        : { text: ctx.w(["重新找到工作：{title}。", "{投了幾十封履歷，|朋友幫忙介紹，}找到新工作：{title}。"], { title }), mood: 6 };
    },
  },
  {
    id: "promotion", domain: "career", channel: "good", ages: [23, 64], cooldown: 2, when: s => s.employed && !s.retired && s.career < 5 && s.job && s.job.field !== "家業",
    p: (s, ctx) => ctx.R.promotion(s.age),
    apply: (s, ctx) => {
      s.career += 1; s.income *= ctx.rng.between(1.08, 1.22);
      const boss = ctx.rng.pick(["經理", "主任", "老闆", "處長", "協理"]);
      return { text: ctx.w(["{升職了|調升了一級|升上{組長|課長|主任|資深職位}}，{薪水加了一級。|名片上的頭銜換了。|你打電話告訴{家人|爸媽}。}", "{有一天下班前，|年終考核後，|開完季會，}{boss}把你叫進辦公室：「{下個月起|明年開始}，{這個組|這個專案|新的部門}交給你帶。」", "{工作表現被看見，|做了幾年的專案終於有了成果，}升上新的職位，{回家的路上一直笑。|請團隊喝了飲料。|那天晚上睡得特別好。}", "{熬了好幾個專案，|加了無數次班，|默默做了好多年，}終於升{組長|主管|資深}了。"], { boss }), mood: 6 };
    },
  },
  {
    id: "jobChange", domain: "career", channel: "change", ages: [22, 60], cooldown: 2, when: s => s.employed && !s.retired && s.job && s.job.field !== "家業",
    p: (s, ctx) => ctx.R.jobChange(s.age),
    apply: (s, ctx) => {
      const before = s.job.title;
      s.income *= ctx.rng.between(0.92, 1.25);
      if (ctx.rng() < 0.25) { const [title, factor, field, element] = otherJob(s, ctx); s.job = { title, factor, field, element, since: s.age }; return { text: ctx.w("轉換跑道，從{before}換成{title}。", { before, title }), mood: 2 }; }
      return { text: ctx.w(["換了一家公司，繼續當{t}，{同事比較好相處。|離家近了很多。|薪水多了一些。}", "跳槽到{另一家公司|同業的對手公司|規模更大的公司}，{薪水和環境都換了。|通勤時間少了一半。|第一次有了自己的座位。}", "{被獵人頭挖角，|朋友找你過去，|在人力銀行看到一個好機會，}換到{一家新創|一家外商|一家大公司|一家中小企業}當{t}。"], { t: before }), mood: 2 };
    },
  },
  {
    id: "layoff", calibrated: true, domain: "career", channel: "bad", ages: [20, 64], cooldown: 3, when: s => s.employed && !s.retired && s.job && s.job.field !== "家業" && s.job.field !== "公部門",
    p: (s, ctx) => ctx.R.layoff(s.year),
    choice: (s, ctx) => {
      s.employed = false; s.unemployedFor = 1;
      return {
        prompt: ctx.w(["公司裁員，你被列在名單上。接下來怎麼辦？", "公司收掉了，你突然沒了工作。接下來怎麼辦？", "部門整個被裁撤，你拿到一筆資遣費。接下來怎麼辦？"]),
        options: [
          { id: "layoff.search", label: "馬上找同類工作", hint: "收入比較快回來", act: "jobSearch", style: "safe", weight: 0.45, apply: () => ({ text: ctx.w("被裁員了，你{馬上開始投履歷。|打給以前的同事打聽職缺。}"), mood: -8 }) },
          { id: "layoff.retrain", label: "趁機進修轉行", hint: "慢一點，但可能更好", act: "careerSwitch", style: "learn", weight: 0.18, apply: s2 => { s2.flags.retrained = true; s2.income *= 1.08; return { text: ctx.w("被裁員了，決定去{上課|職訓局}學新技能，準備轉行。"), mood: -5 }; } },
          { id: "layoff.civil", label: "考公職", hint: "穩定，但要準備一兩年", act: "civilService", style: "safe", weight: 0.06, when: s2 => s2.age <= 50, apply: (s2, c) => { c.arc.start("civil", { tries: 0, quit: true }, 1); return { text: "被裁員了，你決定拿這段時間準備公職考試。", mood: -5 }; } },
          { id: "layoff.rest", label: "先休息一陣子", hint: "照顧自己", act: "rest", style: "self", weight: 0.13, apply: s2 => { s2.happiness += 4; return { text: ctx.w("被裁員了，{先讓自己好好休息幾個月。|帶家人去走走，把心情整理好。}"), mood: -4 }; } },
          { id: "layoff.gig", label: "先打零工撐著", hint: "有收入比較安心", act: "sideJob", style: "safe", weight: 0.13, apply: s2 => { s2.income = Math.max(0.4, s2.income * 0.5); return { text: ctx.w(s2.year >= 2016 ? "被裁員了，先{跑外送|接案}撐著，一邊找工作。" : "被裁員了，先{打零工|到朋友店裡幫忙}撐著，一邊找工作。"), mood: -6 }; } },
          { id: "layoff.startup", label: "乾脆自己創業", hint: "用資遣費當本錢", act: "startup", style: "risk", weight: 0.05, when: s2 => s2.age >= 25 && s2.age <= 55, apply: (s2, c) => { const kind = c.rng.pick(["小吃店", "咖啡店", "網路商店", "工作室"]); c.arc.start("startup", { kind, from: s2.age }, 1); s2.unemployedFor = 0; return { text: `被裁員了，你拿資遣費開了一間${kind}。`, mood: -2, big: true }; } },
        ],
      };
    },
  },
  {
    id: "burnout", calibrated: true, domain: "health", channel: "bad", ages: [25, 60], cooldown: 5, when: s => s.employed, p: () => 0.02,
    choice: (s, ctx) => ({
      prompt: "工作壓力大到睡不著，身體開始出狀況。要怎麼辦？",
      options: [
        { id: "burnout.leave", label: "請長假休息", hint: "收入少一點，身體要緊", act: "rest", style: "health", weight: 0.35, apply: s2 => { s2.income *= 0.95; return { text: ctx.w("工作壓力大到睡不著，你請了長假，{好好睡了一個月。|去花東住了兩個星期。}"), mood: 2 }; } },
        { id: "burnout.doctor", label: "去看身心科", hint: "找專業的人", act: "counsel", style: "health", weight: 0.15, apply: s2 => { s2.health.stress = Math.max(0, s2.health.stress - 0.2); return { text: "工作壓力大到睡不著，你去看了身心科，醫生說你需要真正的休息。", mood: 1 }; } },
        { id: "burnout.talk", label: "跟主管談工作量", hint: "可能有轉機", act: "negotiate", style: "social", weight: 0.15, apply: (s2, c) => c.roll("career", "good", 0.5) ? { text: "工作壓力大到睡不著，你跟主管談了，主管把一部分工作分給別人。", mood: 3 } : { text: "工作壓力大到睡不著，你跟主管談了，主管說大家都很忙。", mood: -2 } },
        { id: "burnout.push", label: "咬牙撐下去", hint: "對身體不好", act: "pushThrough", style: "risk", weight: 0.3, apply: s2 => { s2.health.hr *= 1.05; return { text: "工作壓力大到睡不著，你咬牙撐了過去，但身體記得這一年。", mood: -5 }; } },
        { id: "burnout.quit", label: "辭職", hint: "先離開再說", act: "quitJob", style: "self", weight: 0.05, apply: s2 => { s2.employed = false; s2.unemployedFor = 1; return { text: "工作壓力大到睡不著，你遞了辭呈，決定先離開。", mood: 1 }; } },
      ],
    }),
  },
  {
    id: "retire", once: true, ages: [55, 75], when: s => s.employed && !s.retired, p: (s, ctx) => ctx.R.retire(s.age, s.sex, s.year),
    apply: (s, ctx) => { s.retired = true; s.employed = false; return { text: ctx.w(["退休了，{同事幫你辦了歡送會。|部門的年輕人送你一張全員簽名的卡片。|老闆親自來送行。}", "退休了，第一天早上{還是習慣六點起床。|不知道要做什麼，在家裡走來走去。|去公園散步，發現好多跟你一樣的人。}", "退休了，{收拾辦公桌時翻出第一份工作的名片。|最後一天下班，你在公司樓下站了好一會兒。|交出識別證的那一刻，有點捨不得。}"]), mood: 4, big: true }; },
  },

  // ---------- love ----------
  {
    id: "crush", domain: "love", channel: "good", ages: [12, 18], cooldown: 3, p: () => 0.15,
    apply: (s, ctx) => ({ text: ctx.w(s.year < 1995 ? ["偷偷喜歡{班上|隔壁班|樂隊}的一個同學，{每天都期待上學。|上課時一直偷看。}", "收到人生第一封情書，{夾在課本裡帶回家。|藏在枕頭底下。}", "喜歡上{隔壁班|補習班}的同學，{在日記裡寫滿了對方的名字。|放學故意繞路經過對方家。}"] : s.year < 2011 ? ["偷偷喜歡{班上|隔壁班|補習班}的一個同學，{每天都期待上學。|段考前還幫對方整理筆記。}", "每天晚上用{chat}跟喜歡的人聊到半夜，{隔天上課一直打瞌睡。|被爸媽發現電話費暴增。}", "收到人生第一封情書，{開心了一整個星期。|不知道怎麼回才好。}"] : ["偷偷喜歡{班上|隔壁班|補習班}的一個同學，{每天都期待上學。|一直找藉口跟對方說話。}", "跟喜歡的人在 LINE 上聊到半夜，{已讀不回時心都碎了。|貼圖傳了一百張。}", "收到人生第一封情書，{拍照傳給死黨看。|害羞到不敢回。}"]), mood: 2 }),
  },
  {
    id: "dating", domain: "love", channel: "good", tags: ["spouse"], ages: [17, 75], when: s => s.rel === "single" || s.rel === "divorced" || s.rel === "widowed",
    p: (s, ctx) => ctx.R.dating(s.age, s.rel, s.year) * (s.flags.pursueUntil >= s.age ? 1.8 : 1),
    apply: (s, ctx) => {
      s.prevRel = s.rel; s.rel = "dating"; s.datingSince = s.age;
      const partnerAge = Math.max(17, s.age + Math.round(ctx.rng.between(-3, 4)) * (s.sex === "male" ? -1 : 1));
      const how = meetPlace(s, ctx);
      const p = ctx.person({ role: "partner", sex: s.sex === "male" ? "female" : "male", birthYear: s.year - partnerAge, how });
      p.age = partnerAge; s.partner = p;
      const ta = pronoun(p), met = MET[how] || "認識了";
      return { text: ctx.w([`${met}{name}，一個${p.nature.word}的人，{開始交往。|兩個人很快就在一起了。}`, `${met}{name}，{聊著聊著就在一起了。|第一次約會就聊到餐廳打烊。}`, `${met}{name}。{你對${ta}的第一印象是：好${p.nature.word}。|兩個人第一次見面就很聊得來。}{沒多久就在一起了。|半年後，你們開始交往。}`], { name: p.call }), mood: 6 };
    },
  },
  {
    // A couple that talked things through (s.guard) breaks up less often; one in a crisis more often.
    id: "breakup", domain: "love", channel: "bad", tags: ["spouse"], cooldown: 1, when: s => s.rel === "dating" && s.age > s.datingSince,
    p: (s, ctx) => ctx.R.breakup(s.age) * (s.guard > 0 ? 0.6 : 1) * (s.crisis > 0 ? 1.5 : 1),
    apply: (s, ctx) => {
      const name = s.partner ? s.partner.call : "對方";
      endRelationship(s, ctx);
      return { text: ctx.w(["和{name}分手了，難過了好一陣子。", "和{name}想要的生活不一樣，和平分手。", "{name}說想冷靜一下，後來就沒有再聯絡了。", "和{name}分手那天，你{一個人在河堤坐到天亮。|把一起拍的照片收進盒子裡。}"], { name }), mood: -6 };
    },
  },
  {
    id: "proposal", calibrated: true, domain: "love", channel: "good", tags: ["spouse"], when: s => s.rel === "dating" && s.age > s.datingSince, p: (s, ctx) => ctx.R.proposal(s.age, s.sex, s.year, s.marriages),
    choice: (s, ctx) => {
      const name = s.partner ? s.partner.call : "對方";
      const again = s.marriages > 0;
      const wed = (s2, text) => { marry(s2); return { text: again ? `和${name}再一次走進婚姻，這次更懂得珍惜。` : text, mood: 10, big: true }; };
      return {
        prompt: `和${name}交往 ${Math.max(1, s.age - s.datingSince)} 年，走到要不要結婚這一步。要結婚嗎？`,
        options: [
          { id: "proposal.yes", label: "辦一場婚禮", hint: "請親朋好友來祝福", act: "marry", style: "family", weight: 0.42, apply: s2 => wed(s2, ctx.w(`和${name}結婚了！{婚禮上爸媽哭得比你還兇。|喜宴辦了{二十|三十}桌，敬酒敬到腳軟。}`)) },
          { id: "proposal.small", label: "簡單登記就好", hint: "省下的錢拿去蜜月", act: "marry", style: "safe", weight: 0.35, apply: s2 => wed(s2, ctx.w(`和${name}去戶政事務所登記結婚，{請兩邊家人吃了一頓飯。|把省下來的錢拿去{北海道|峇里島|歐洲}蜜月。}`)) },
          { id: "proposal.trip", label: "出國辦婚禮", hint: "兩個人的小婚禮", act: "marry", style: "risk", weight: 0.08, when: s2 => s2.year >= 1990, apply: s2 => wed(s2, ctx.w(`和${name}在{沖繩|峇里島|關島}辦了一場只有兩家人的小婚禮。`)) },
          { id: "proposal.wait", label: "再等等", hint: "還沒準備好", act: "wait", style: "safe", weight: 0.11, apply: () => ({ text: `${name}想結婚，你覺得還沒準備好，決定再等等。`, mood: -1 }) },
          { id: "proposal.no", label: "分手", hint: "想要的未來不一樣", act: "separate", style: "self", weight: 0.04, apply: (s2, c) => { endRelationship(s2, c); return { text: `走到要不要結婚這一步，你才發現和${name}想要的未來不一樣，兩個人分手了。`, mood: -6 }; } },
        ],
      };
    },
  },
  {
    id: "crisis", calibrated: true, domain: "love", channel: "bad", tags: ["spouse"], cooldown: 4, when: s => s.rel === "married",
    p: (s, ctx) => ctx.R.crisis(yearsMarried(s)) * (s.partner && s.partner.nature ? s.partner.nature.crisis : 1),
    choice: (s, ctx) => {
      const name = s.partner ? s.partner.call : "另一半";
      const topic = ctx.rng.pick(s.kids.length ? ["孩子的教養", "家事分工", "錢", "婆家和娘家", "工作太忙"] : ["家事分工", "錢", "要不要生小孩", "工作太忙", "婆家和娘家"]);
      return {
        prompt: `和${name}為了${topic}越來越常吵架，婚姻出現危機。要怎麼面對？`,
        options: [
          { id: "crisis.talk", label: "好好溝通", hint: "把話說開", act: "talk", style: "social", weight: 0.37, apply: s2 => { s2.guard = 3; return { text: ctx.w(`和${name}為了${topic}吵了好幾次。{兩個人坐下來把話說開，|你們找了一個晚上好好談，}關係慢慢回溫。`), mood: -2 }; } },
          { id: "crisis.counsel", label: "一起去婚姻諮商", hint: "找專業的人幫忙", act: "counsel", style: "health", weight: 0.17, apply: s2 => { s2.guard = 5; return { text: `和${name}為了${topic}吵了好幾次。你們一起去婚姻諮商，學會用新的方式相處。`, mood: -1 }; } },
          { id: "crisis.trip", label: "兩個人去旅行", hint: "找回當初的感覺", act: "travel", style: "family", weight: 0.08, apply: (s2, c) => { s2.guard = 2; s2.savings = Math.max(0, s2.savings - 0.15); return { text: c.w(`和${name}為了${topic}吵了好幾次。你們把孩子託給家人，去{trip}待了幾天，回來後{比較會笑了。|約好每個月要有一次約會。}`), mood: 1 }; } },
          { id: "crisis.cold", label: "冷處理", hint: "先不談", act: "avoid", style: "self", weight: 0.3, apply: s2 => { s2.crisis = 3; return { text: `和${name}為了${topic}吵了好幾次。誰也不想先開口，家裡越來越安靜。`, mood: -6 }; } },
          { id: "crisis.split", label: "提出離婚", hint: "不想再勉強", act: "separate", style: "self", weight: 0.08, apply: s2 => { s2.crisis = 6; s2.flags.askedDivorce = s2.age; return { text: `和${name}為了${topic}吵到最後，你說出了「離婚吧」。${pronoun(s2.partner)}愣住了，說要想一想。`, mood: -8 }; } },
        ],
      };
    },
  },
  {
    // Not in the wedding year itself: in a story told year by year, a wedding and a divorce in the same year read as a slip.
    id: "divorce", domain: "love", channel: "bad", tags: ["spouse"], when: s => s.rel === "married" && yearsMarried(s) >= 1,
    p: (s, ctx) => ctx.R.divorce(yearsMarried(s), s.year) * (s.guard > 0 ? 0.4 : 1) * (s.crisis > 0 ? 2.5 : 1) * (s.flags.askedDivorce >= s.age - 1 ? 3 : 1),
    apply: (s, ctx) => {
      const name = s.partner ? s.partner.call : "另一半", n = Math.max(1, yearsMarried(s));
      const last = s.kids.some(k => k.alive !== false) ? "{孩子問你為什麼，你想了很久才回答。|搬出去的那天，你把鑰匙放在桌上。}" : "搬出去的那天，你把鑰匙放在桌上。";
      endRelationship(s, ctx);
      return { text: ctx.w(["和{name}離婚了。簽字那天，兩個人都很平靜。", "和{name}走了 {n} 年，還是決定分開。", `和{name}離婚了，${last}`], { name, n }), mood: -12, big: true };
    },
  },
  {
    id: "widowed", domain: "family", channel: "bad", tags: ["spouse"], grave: true, when: s => s.rel === "married" && s.partner,
    p: (s, ctx) => ctx.R.deathRaw(s.partner.age, s.partner.sex, s.year),
    apply: (s, ctx) => {
      const name = s.partner.call, ta = pronoun(s.partner);
      s.partner.alive = false; s.exes.push(s.partner); s.partner = null; s.rel = "widowed"; s.since = null; closeSpell(s, "widowed");
      return { text: ctx.w(["{name}先走了。家裡少了一個人，好安靜。", "牽了大半輩子的手放開了，{name}走了，你學著一個人生活。", "{name}走的那天，{窗外下著小雨。|你握著{ta}的手，一直沒放開。}"], { name, ta }), mood: -16, big: true };
    },
  },

  // ---------- family ----------
  {
    id: "baby", domain: "family", channel: "good", tags: ["children"], when: s => s.rel === "married" && !s.flags.noMoreKids,
    p: (s, ctx) => Math.min(0.9, ctx.R.birth(motherAge(s), s.kids.length, s.year) * (s.flags.tryUntil >= s.age ? 1.8 : 1)),
    apply: (s, ctx) => {
      const kid = newKid(s, ctx);
      s.kids.push(kid);
      const first = s.kids.length === 1;
      return { text: first ? ctx.w(["當爸媽了！{name}出生，抱在懷裡好小好軟。", "第一個孩子出生了，是個{w}，取名{name}。", "{name}出生了，是個{w}。{你在產房外面來回走了一整晚。|第一次抱{name}，你緊張得不敢動。}"], { name: kid.call, w: kidWord(kid) }) : ctx.w(["第 {n} 個孩子{name}出生了，是個{w}。", "{name}出生了，{哥哥姊姊|大的}搶著要抱。"], { n: s.kids.length, name: kid.call, w: kidWord(kid) }), mood: 9, big: first };
    },
  },
  {
    id: "moreKids", calibrated: true, domain: "family", channel: "change", tags: ["children"], cooldown: 3, when: s => s.rel === "married" && s.kids.length >= 1 && !s.flags.noMoreKids && motherAge(s) <= 42 && s.kids[s.kids.length - 1].age >= 1,
    p: () => 0.35,
    choice: (s, ctx) => {
      const one = s.kids.length === 1, name = s.partner ? s.partner.call : "另一半";
      return {
        prompt: `${one ? s.kids[0].call : "孩子們"}慢慢長大了。和${name}聊到，還想再生一個嗎？`,
        options: [
          { id: "kids.more", label: "想再生一個", hint: "家裡更熱鬧", act: "haveChild", style: "family", weight: one ? 0.4 : 0.13, apply: () => ({ text: `和${name}討論後，想再生一個孩子。`, mood: 1 }) },
          { id: "kids.ask", label: "問問孩子的意見", hint: "想不想要弟弟妹妹", act: "talk", style: "social", weight: one ? 0.1 : 0.04, when: s2 => s2.kids[0].age >= 4, apply: (s2, c) => { const yes = c.rng() < 0.5, k = s2.kids[0].call; if (!yes) s2.flags.noMoreKids = true; return { text: c.w(yes ? `你問${k}想不想要弟弟妹妹，${k}{開心地跳起來。|說要把玩具分給弟弟妹妹。}你們決定再生一個。` : `你問${k}想不想要弟弟妹妹，${k}說不要。你們笑了笑，決定就這樣好好陪著${k}。`), mood: 2 }; } },
          { id: "kids.enough", label: "這樣就好", hint: "專心陪現在的孩子", act: "noChild", style: "safe", weight: one ? 0.35 : 0.68, apply: s2 => { s2.flags.noMoreKids = true; return { text: `和${name}討論後，決定不再生了，好好陪現在的孩子長大。`, mood: 1 }; } },
          { id: "kids.later", label: "過幾年再說", hint: "先把經濟顧好", act: "wait", style: "safe", weight: 0.08, apply: (s2, c) => ({ text: c.w("決定過幾年再說，先把{房貸|工作|身體}顧好。"), mood: 0 }) },
          { id: "kids.fund", label: "先存一筆教育基金", hint: "準備好了再說", act: "save", style: "safe", weight: 0.07, apply: s2 => { s2.flags.frugalUntil = s2.age + 2; return { text: "決定先替孩子存一筆教育基金，準備好了再說。", mood: 0 }; } },
        ],
      };
    },
  },
  {
    id: "kidMilestone", ages: [25, 95], cooldown: 3, when: s => s.kids.some(k => [6, 12, 15, 18, 22].includes(k.age)), p: () => 0.6,
    apply: (s, ctx) => {
      const k = s.kids.find(x => [6, 12, 15, 18, 22].includes(x.age));
      const t = { 6: ["{name}上國小了，你在校門口看了好久。", "送{name}去上小一，{name}頭也不回地跑進教室。"], 12: ["{name}國小畢業了，畢業典禮上{name}代表領獎。", "{name}上國中，開始不太愛跟你說話了。"], 15: ["{name}考完會考，全家一起去吃了一頓好的。", "{name}進了高中，每天補習到很晚。"], 18: ["{name}考上大學，搬出去住了。", "{name}上大學了，家裡突然好安靜。"], 22: ["{name}大學畢業，開始工作了。", "{name}領到第一份薪水，包了一個紅包給你。"] }[k.age];
      return { text: ctx.w(t, { name: k.call }), mood: 4 };
    },
  },
  parentClash("father"),
  parentClash("mother"),
  {
    id: "parentCare", domain: "family", channel: "bad", tags: ["father", "mother"], cooldown: 6, when: s => (s.father.alive && s.father.age >= 70) || (s.mother.alive && s.mother.age >= 70), p: () => 0.05,
    choice: (s, ctx) => {
      const who = s.father.alive && s.father.age >= 70 ? "爸爸" : "媽媽";
      const adults = bornSiblings(s, 18), with_ = adults.length === 1 ? siblingCall(adults[0]) : "兄弟姊妹";
      return {
        prompt: `${who}年紀大了，${ctx.rng.pick(["跌倒之後行動不方便", "記性越來越差", "一個人住讓人不放心", "出院後需要人照顧"])}。要怎麼安排？`,
        options: [
          { id: "care.self", label: "自己照顧", hint: "累，但安心", act: "care", style: "family", weight: 0.3, apply: s2 => { s2.income *= 0.92; return { text: `${who}需要照顧。你減少工作，自己照顧，累，但每天都看得到。`, mood: -4 }; } },
          { id: "care.move", label: "接來一起住", hint: "家裡要重新安排", act: "care", style: "family", weight: 0.12, apply: () => ({ text: ctx.w(`${who}需要照顧。你把${who}接來一起住，{孩子多了一個人陪。|家裡熱鬧了，你也比較放心。}`), mood: -2 }) },
          { id: "care.hire", label: "請看護", hint: "花錢，但專業", act: "hireCare", style: "safe", weight: 0.28, apply: s2 => { s2.savings = Math.max(0, s2.savings - 0.6); return { text: `${who}需要照顧。你請了看護，每個週末回去陪。`, mood: -2 }; } },
          { id: "care.daycare", label: "白天送日照中心", hint: "晚上接回家", act: "hireCare", style: "safe", weight: 0.12, when: s2 => s2.year >= 2007, apply: s2 => { s2.savings = Math.max(0, s2.savings - 0.25); return { text: `${who}需要照顧。白天送${who}去日照中心，晚上接回家，${who}在那裡交到了朋友。`, mood: -1 }; } },
          { id: "care.share", label: `和${with_}輪流`, hint: "大家一起分擔", act: "shareCare", style: "social", weight: 0.3, when: () => adults.length > 0, apply: () => ({ text: `${who}需要照顧，你和${with_}排班輪流。`, mood: -2 }) },
        ],
      };
    },
  },
  {
    id: "fatherDeath", domain: "family", channel: "bad", tags: ["father"], grave: true, when: s => s.father.alive, p: (s, ctx) => ctx.R.deathRaw(s.father.age, "male", s.year),
    apply: (s, ctx) => { s.father.alive = false; s.savings += s.age >= 25 ? ctx.rng.between(0, 1.5) : 0; return { text: ctx.w(["爸爸走了，享年 {a} 歲。你才發現自己好多話還沒跟他說。", "爸爸在 {a} 歲那年離開。", "爸爸走了，享年 {a} 歲。{整理遺物時，你找到他保存的、你小時候的成績單。|告別式上，你一直想起他教你騎腳踏車的樣子。}"], { a: s.father.age }), mood: -14, big: true }; },
  },
  {
    id: "motherDeath", domain: "family", channel: "bad", tags: ["mother"], grave: true, when: s => s.mother.alive, p: (s, ctx) => ctx.R.deathRaw(s.mother.age, "female", s.year),
    apply: (s, ctx) => { s.mother.alive = false; s.savings += s.age >= 25 ? ctx.rng.between(0, 1.5) : 0; return { text: ctx.w(["媽媽走了，享年 {a} 歲。再也吃不到她煮的菜了。", "媽媽在 {a} 歲那年離開。", "媽媽走了，享年 {a} 歲。{冰箱裡還有她包好的水餃。|你把她的手機留著，捨不得停話。}"], { a: s.mother.age }), mood: -15, big: true }; },
  },
  {
    id: "inheritance", once: true, domain: "family", channel: "bad", tags: ["siblings"], about: "siblings",
    when: s => !s.father.alive && !s.mother.alive && s.age >= 25 && Math.max(s.last.fatherDeath ?? -9, s.last.motherDeath ?? -9) >= s.age - 1 && bornSiblings(s, 18).length > 0,
    p: () => 0.25,
    choice: (s, ctx) => {
      const sibs = bornSiblings(s, 18), x = sibs.length <= 3 ? sibs.map(siblingCall).join("、") : "兄弟姊妹";
      return {
        prompt: `爸媽都走了，留下一間老房子。你和${x}對怎麼分有不同的想法。要怎麼做？`,
        options: [
          { id: "inherit.split", label: "照法律平分", hint: "公平，各拿各的", act: "negotiate", style: "safe", weight: 0.4, apply: s2 => { s2.savings += 0.6; return { text: `爸媽留下的老房子，你和${x}照法律平分。雖然捨不得，大家都沒有意見。`, mood: -1 }; } },
          { id: "inherit.sell", label: "賣掉分錢", hint: "乾脆", act: "sellAsset", style: "safe", weight: 0.15, apply: s2 => { s2.savings += 0.7; return { text: `你和${x}把老房子賣了，錢照比例分掉。簽約那天，你多看了老家幾眼。`, mood: -2 }; } },
          { id: "inherit.keep", label: "先留著不分", hint: "當大家的老家", act: "wait", style: "family", weight: 0.1, apply: () => ({ text: `你和${x}說好，老房子先留著，過年大家還是回來團圓。`, mood: 1 }) },
          { id: "inherit.give", label: "讓給對方", hint: "錢少一點，感情留著", act: "reconcile", style: "family", weight: 0.15, apply: () => ({ text: `爸媽留下的老房子，你讓給了${x}。大家說好，以後過年都回老家吃飯。`, mood: 1 }) },
          { id: "inherit.insist", label: "爭取自己的份", hint: "可能傷感情", act: "insist", style: "self", weight: 0.2, apply: s2 => { s2.savings += 1.2; s2.flags.estranged = true; return { text: `為了爸媽留下的老房子，你和${x}鬧得很僵，從此很少聯絡。`, mood: -7 }; } },
        ],
      };
    },
  },
  {
    id: "siblingHelp", domain: "family", channel: "good", tags: ["siblings"], about: "siblings", ages: [18, 90], cooldown: 5,
    when: s => !s.flags.estranged && bornSiblings(s, 18).length > 0, p: s => (s.unemployedFor || s.health.serious ? 0.25 : 0.04),
    apply: (s, ctx) => {
      const x = siblingCall(ctx.rng.pick(bornSiblings(s, 18)));
      if (s.health.serious) return { text: `生病的這段時間，${x}常常跑來醫院陪你，還幫你打理家裡的事。`, mood: 4 };
      if (s.unemployedFor) return { text: `沒有工作的那段時間，${x}二話不說借你一筆錢，還幫你打聽工作機會。`, mood: 4 };
      return { text: ctx.w(["過年和{x}一起圍爐，聊起小時候的糗事，笑到停不下來。", "{x}約你一起出國玩了一趟。", "搬家那天，{x}請假來幫你搬了一整天。", "心情低落的時候，{x}陪你聊到半夜。"], { x }), mood: 3 };
    },
  },
  {
    // A grandchild is born to a son or daughter of 26–45, and gets a name.
    id: "grandchild", ages: [45, 100], cooldown: 4, when: s => s.kids.some(k => k.age >= 26 && k.age <= 45), p: () => 0.12,
    apply: (s, ctx) => {
      s.flags.grandkids = (s.flags.grandkids || 0) + 1;
      const k = ctx.rng.pick(s.kids.filter(x => x.age >= 26 && x.age <= 45));
      const sex = ctx.rng() < 0.512 ? "male" : "female";
      const g = ctx.person({ role: "grandkid", sex, birthYear: s.year, surname: k.sex === "male" ? [...k.name][0] : null });
      g.parent = k.call; (s.grandkids = s.grandkids || []).push(g);
      const w = sex === "male" ? "孫子" : "孫女";
      return { text: s.flags.grandkids === 1 ? ctx.w(`{name}的孩子{g}出生了，你當{grand}了！{第一次抱{w}，手都在抖。|你把{w}的照片設成手機桌布。}`, { name: k.call, g: g.call, w }) : ctx.w(`{name}的{w}{g}出生了，家裡又多了一個小{w}。`, { name: k.call, g: g.call, w }), mood: 7 };
    },
  },
  {
    // A brother or sister dies; their age follows the life table like everyone else's.
    id: "siblingDeath", domain: "family", channel: "bad", tags: ["siblings"], grave: true, when: s => bornSiblings(s).some(x => s.age - x.bornAt >= 40),
    p: (s, ctx) => 1 - bornSiblings(s).filter(x => s.age - x.bornAt >= 40).reduce((q, x) => q * (1 - ctx.R.deathRaw(s.age - x.bornAt, /Brother/.test(x.relation) ? "male" : "female", s.year)), 1),
    apply: (s, ctx) => {
      const list = bornSiblings(s).filter(x => s.age - x.bornAt >= 40);
      const x = ctx.rng.weighted(list.map(y => [y, ctx.R.deathRaw(s.age - y.bornAt, /Brother/.test(y.relation) ? "male" : "female", s.year) + 1e-6]));
      x.alive = false;
      return { text: ctx.w(["{who}走了，享年 {a} 歲。{你們小時候一起{搶電視|偷吃冰箱裡的布丁|騎腳踏車}的樣子，一直浮現在眼前。|告別式上，你想起{who}小時候總是護著你。}", "{who}在 {a} 歲那年離開。{你翻出你們小時候的合照，看了很久。|兄弟姊妹又少了一個。}"], { who: siblingCall(x), a: s.age - x.bornAt }), mood: -10, big: true };
    },
  },

  // ---------- money and home ----------
  {
    id: "buyHome", calibrated: true, domain: "wealth", channel: "good", tags: ["home"], ages: [25, 60], cooldown: 2, when: (s, ctx) => s.home !== "own" && s.savings >= ctx.R.DOWN_PAYMENT && s.employed, p: (s, ctx) => ctx.R.homeBuy(s.age),
    choice: (s, ctx) => {
      const buy = (s2, kind) => { ownHome(s2); s2.savings -= ctx.R.DOWN_PAYMENT; return { text: ctx.w(`在${s2.county || "家附近"}買了一間${kind}，{拿到鑰匙那天開心得睡不著。|背上二十年房貸，心裡卻很踏實。|第一個晚上，你們在空蕩蕩的客廳吃泡麵。}`), mood: 8, big: true }; };
      return {
        prompt: "存到一筆頭期款了。要買房子嗎？",
        options: [
          { id: "home.new", label: "買新成屋", hint: "貴，但屋況好", act: "buyHome", style: "family", weight: 0.3, apply: s2 => buy(s2, "新房子") },
          { id: "home.old", label: "買中古屋", hint: "便宜一點，要整理", act: "buyHome", style: "safe", weight: 0.3, apply: s2 => buy(s2, "中古公寓") },
          { id: "home.presale", label: "買預售屋", hint: "要等兩三年交屋", act: "buyHome", style: "risk", weight: 0.15, when: s2 => s2.year >= 1990, apply: s2 => buy(s2, "預售屋") },
          { id: "home.rent", label: "繼續租", hint: "保留彈性", act: "wait", style: "self", weight: 0.17, apply: () => ({ text: "存到了頭期款，算了算還是決定先繼續租，把錢拿去做別的規畫。", mood: 0 }) },
          { id: "home.back", label: "搬回老家住", hint: "省下房租", act: "moveHome", style: "family", weight: 0.08, when: s2 => s2.father.alive || s2.mother.alive, apply: s2 => { if (s2.birthCounty) s2.county = s2.birthCounty; return { text: "存到了頭期款，最後決定搬回老家和爸媽住，把錢存下來。", mood: 1 }; } },
        ],
      };
    },
  },
  {
    id: "windfall", domain: "wealth", channel: "good", ages: [22, 90], cooldown: 3, p: () => 0.03,
    apply: (s, ctx) => { const x = ctx.rng.between(0.5, 2.5); s.savings += x; return { text: ctx.w(["{投資|放了好幾年的股票}賺了一筆，{剛好拿來還房貸。|請家人吃了一頓大餐。|你決定先存起來。}", "年終獎金比預期多{很多|兩個月}，{你在提款機前多看了兩眼。|拿去帶家人出國玩。}", "股票漲了一波，存款多了一些，{但你沒有加碼。|你獲利了結。}", "公司分紅比預期多，{同事們都笑得合不攏嘴。|你把它存進孩子的教育基金。}", "{發票|統一發票}中了{兩百萬|二十萬|一千萬}，{又驚又喜。|對了三次號碼才敢相信。}", "{多年前買的|朋友推薦的}基金漲了一倍。"]), mood: 6 }; },
  },
  {
    id: "loss", domain: "wealth", channel: "bad", ages: [22, 90], cooldown: 3, p: () => 0.03,
    apply: (s, ctx) => {
      s.savings = Math.max(0, s.savings - ctx.rng.between(0.5, 2));
      const scam = s.year >= 2018 ? "加入了一個「投資群組」，結果是詐騙" : s.year >= 2010 ? "接到「解除分期付款」的電話，照指示操作 ATM，被騙走一筆錢" : "被假的投資公司騙走一筆錢";
      return { text: ctx.w(["投資{失利|看錯方向|遇到大跌}，{賠掉一大筆存款。|幾年的積蓄少了一半。|你好幾個晚上睡不著。}", "借錢給{朋友|老同學|親戚}，{結果要不回來了。|對方後來就不接電話了。|錢和朋友一起沒了。}", `${scam}。{你難過又生氣。|報警後只追回一點點。|你把這件事告訴所有親朋好友，提醒他們小心。}`, "{幫朋友作保，|被倒會，}{結果賠了一大筆。|存款少了一半。}"]), mood: -7 };
    },
  },

  // ---------- health ----------
  {
    id: "chronic", domain: "health", channel: "bad", ages: [30, 100], when: s => !s.health.chronic, p: (s, ctx) => ctx.R.chronic(s.age, s.sex),
    apply: (s, ctx) => { s.health.chronic = true; s.health.hr *= 1.3; return { text: ctx.w(["健康檢查發現血壓偏高，{開始每天吃藥。|醫生要你少吃鹹。|你買了一台血壓計放在家裡。}", "被診斷出糖尿病，{開始學著控制飲食。|每天要量血糖。|戒掉了最愛的手搖飲。}", "{膽固醇|血糖|血壓}的數字紅字了，醫生要你{少吃油炸|每天走路三十分鐘|按時回診}。"]), mood: -3 }; },
  },
  {
    id: "checkups", calibrated: true, once: true, ages: [40, 40], p: () => 1,
    choice: (s, ctx) => ({
      prompt: "40 歲了，收到成人健康檢查的通知。要定期去檢查嗎？",
      options: [
        { id: "checkup.yearly", label: "每年都去", hint: "早期發現比較好治", act: "seeDoctor", style: "health", weight: 0.32, apply: (s2, c) => { s2.health.checkups = true; return { text: c.w("{開始每年做健康檢查，|把健康檢查排進每年的行事曆，}{抽血時還是會怕。|報告上的紅字越來越少。|醫生說繼續保持。}"), mood: 0 }; } },
        { id: "checkup.full", label: "自費做全身健檢", hint: "比較仔細，比較貴", act: "seeDoctor", style: "health", weight: 0.08, apply: (s2, c) => { s2.health.checkups = true; s2.savings = Math.max(0, s2.savings - 0.05); return { text: c.w("自費做了一次全身健康檢查，{連胃鏡大腸鏡都做了，|報告厚得像一本書，}之後每年都去。"), mood: 0 }; } },
        { id: "checkup.public", label: "做公費的基本檢查", hint: "三年一次，免費", act: "seeDoctor", style: "safe", weight: 0.15, apply: (s2, c) => { s2.health.checkups = true; return { text: c.w("{去附近的診所|拿著健保卡}做了公費的成人健康檢查，{之後每三年去一次。|醫生說數字都還在標準內。}"), mood: 0 }; } },
        { id: "checkup.habits", label: "先從生活習慣改起", hint: "少吃宵夜、多走路", act: "quitHabit", style: "health", weight: 0.12, apply: (s2, c) => { s2.health.hr = Math.max(0.8, s2.health.hr * 0.98); return { text: c.w("收到健康檢查的通知，你決定先{戒掉宵夜|每天走一萬步|早點睡}，明年再去檢查。"), mood: 1 }; } },
        { id: "checkup.later", label: "有空再說", hint: "現在身體還不錯", act: "wait", style: "risk", weight: 0.33, apply: (s2, c) => ({ text: c.w("收到健康檢查的通知，{覺得身體還不錯，先放著。|想說工作忙完再去，結果就忘了。|把通知單夾進抽屜裡。}"), mood: 0 }) },
      ],
    }),
  },
  {
    id: "serious", domain: "health", channel: "bad", grave: true, ages: [1, 110], when: s => !s.health.serious, p: (s, ctx) => ctx.R.serious(s.age, s.sex),
    apply: (s, ctx) => {
      const type = ctx.R.seriousType(s.age, s.sex, ctx.rng);
      s.health.serious = { type, since: s.age }; s.health.everSerious = (s.health.everSerious || 0) + 1;
      return { text: ctx.w([`被診斷出${type}，開始治療。家人輪流陪你回診。`, `${type}來得突然，你住進了醫院。`, `醫生拿著檢查報告，說是${type}。{你走出診間，在走廊坐了很久。|回家的路上，你一句話也沒說。}`]) + (s.health.checkups && type === "癌症" ? "還好是定期檢查發現的，發現得早。" : ""), mood: -15, big: true };
    },
  },
  {
    id: "recovered", when: s => s.health.serious && s.age - s.health.serious.since >= 5, p: () => 1,
    apply: (s, ctx) => { const t = s.health.serious.type; s.health.serious = null; return { text: ctx.w(`${t}治療告一段落，{追蹤了五年都穩定，醫生說可以放心了。|五年過去，你把最後一張回診單收進抽屜。}`), mood: 8 }; },
  },
  {
    id: "accident", domain: "health", channel: "bad", ages: [5, 90], cooldown: 5, p: () => 0.008,
    apply: (s, ctx) => ({ text: ctx.w(["騎車{上班途中|下雨天}發生車禍，{骨折休養了三個月。|腳打了石膏好幾個星期。}", "{爬山|打球|搬家}時扭傷，{拄了一陣子拐杖。|每週去做復健。}", "{下雨天|下樓梯時|在浴室}滑了一跤，{手腕骨折，|腰閃到，}休息了好幾個星期。"]), mood: -5 }),
  },

  // ---------- moving ----------
  {
    id: "move", domain: "move", channel: "change", ages: [18, 80], cooldown: 3, when: s => !s.abroad, p: (s, ctx) => ctx.R.move(s.age),
    apply: (s, ctx) => ({ text: ctx.w(["搬到{c}，開始新的生活。", "因為工作搬到{c}。", "搬到{c}，{住進一間有陽台的小公寓。|房東是個很照顧人的阿姨。}"], { c: moveTo(s, ctx) }), mood: 1 }),
  },
  {
    id: "abroad", calibrated: true, domain: "move", channel: "change", ages: [22, 50], cooldown: 5, when: s => !s.abroad && !s.studying, p: (s, ctx) => ctx.R.abroad(s.age),
    choice: (s, ctx) => {
      const where = ctx.rng.weighted(ABROAD);
      s.flags.offerAbroad = where;
      const family = s.rel === "married";
      return {
        prompt: `有一個去${where}工作的機會。要去嗎？`,
        options: [
          { id: "abroad.go", label: family ? "自己先去" : "去", hint: "看看外面的世界", act: "workAbroad", style: "risk", weight: 0.32, apply: s2 => { s2.abroad = where; s2.leftAt = s2.age; s2.income *= 1.2; return { text: ctx.w(`到${where}工作，{一切從頭開始。|住進公司安排的宿舍。}${family ? "家人留在台灣，每天視訊。" : ""}`), mood: 4, big: true }; } },
          { id: "abroad.family", label: "帶全家一起去", hint: "孩子要轉學", act: "workAbroad", style: "family", weight: 0.08, when: () => family, apply: s2 => { s2.abroad = where; s2.leftAt = s2.age; s2.income *= 1.15; return { text: `全家一起搬到${where}，孩子進了當地的學校。`, mood: 3, big: true }; } },
          {
            id: "abroad.negotiate", label: "談好條件再去", hint: "加薪或縮短期限", act: "negotiate", style: "social", weight: 0.05,
            apply: (s2, c) => {
              if (!c.roll("career", "good", 0.5)) return { text: "跟公司談條件，公司不肯讓步，你決定留在台灣。", mood: -1 };
              s2.abroad = where; s2.leftAt = s2.age; s2.income *= 1.3;
              return { text: `跟公司談好加薪和每季返台，你到${where}工作。`, mood: 4, big: true };
            },
          },
          { id: "abroad.partner", label: "問另一半要不要一起去", hint: "兩個人的決定", act: "talk", style: "social", weight: 0.05, when: s2 => s2.rel === "dating" && s2.partner, apply: (s2, c) => { if (c.rng() < 0.5) { s2.abroad = where; s2.leftAt = s2.age; s2.income *= 1.2; return { text: `你問${s2.partner.call}要不要一起去${where}，${pronoun(s2.partner)}答應了。兩個人一起搬了過去。`, mood: 5, big: true }; } return { text: `你問${s2.partner.call}要不要一起去${where}，${pronoun(s2.partner)}走不開。你決定留在台灣。`, mood: -1 }; } },
          { id: "abroad.trip", label: "先去出差一趟看看", hint: "了解環境再決定", act: "wait", style: "safe", weight: 0.06, apply: (s2, c) => ({ text: c.w(`你先到${where}出差了兩個星期，{覺得那裡的節奏不適合自己，|吃不慣那裡的食物，|想到家人就捨不得，}最後還是留在台灣。`), mood: 0 }) },
          { id: "abroad.stay", label: "留在台灣", hint: "家人朋友都在這裡", act: "wait", style: "family", weight: 0.44, apply: () => ({ text: `有去${where}工作的機會，想了想，還是留在台灣。`, mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "returnHome", when: s => s.abroad && !s.flags.emigrated && s.age - (s.leftAt ?? s.age) >= 2, p: () => 0.2,
    apply: (s, ctx) => { const was = s.abroad; s.abroad = null; return { text: ctx.w(`結束在${was}的日子，{回到台灣。|飛回台灣，一下飛機就去吃了一碗滷肉飯。}`), mood: 3 }; },
  },

  // ---------- later life ----------
  {
    id: "hobby", ages: [60, 100], cooldown: 8, when: s => s.retired || s.age >= 65, p: () => 0.12,
    apply: (s, ctx) => ({ text: ctx.w(["開始學{書法|國畫|二胡}，{每天寫一張。|老師說你很有天分。}", "加入社區的{土風舞隊|太極拳班|合唱團|槌球隊}，{每週練三次。|還去參加了比賽。}", "去{醫院|圖書館|廟裡}當志工，{每週去兩個早上。|認識了一群老朋友。}", "和老朋友組了一個{登山隊|健走團|釣魚社}，{每個月出去一次。|把台灣的郊山走了一大半。}", "在陽台種了一排{番茄|九層塔|蘭花|多肉}，每天早上去看。"]), mood: 4 }),
  },
  {
    // Looking back on a big moment from at least twenty years ago.
    id: "memoryLane", ages: [55, 105], cooldown: 7, when: s => s.memory.some(m => s.age - m.age >= 20 && m.kind !== "memoryLane"), p: () => 0.1,
    apply: (s, ctx) => {
      const m = ctx.rng.pick(s.memory.filter(x => s.age - x.age >= 20 && x.kind !== "memoryLane"));
      const gist = m.text.split(/[，。！]/)[0].replace(/^你/, "");
      const end = m.mood < 0 ? "{你在心裡說了幾句話。|眼眶有點濕。|那時候的心情，現在想起來還是很清楚。}" : "{好像昨天的事。|你笑了一下。|時間過得真快。}";
      return { text: ctx.w([`{整理老照片時|收拾抽屜時|和老朋友喝茶聊天時|孫子問起你年輕時的事}，想起 {a} 歲那年：{gist}。${end}`, `{a} 歲那年{gist}的事，{你又講給家人聽了一次。|你常常想起來。}`], { a: m.age, gist }), mood: m.mood < 0 ? -1 : 2 };
    },
  },
  {
    id: "milestoneAge", ages: [80, 100], when: s => s.age === 80 || s.age === 90 || s.age === 100, p: () => 1,
    apply: (s, ctx) => ({ text: s.age === 100 ? "滿 100 歲了！里長帶著賀禮來祝壽。" : ctx.w(`${s.age} 歲生日，${s.kids.length ? "{kids}" : "朋友們"}幫你辦了一桌{，|。}{你吹蠟燭時許了一個願。|大家輪流跟你拍照。}`), mood: 4 }),
  },
];

// Every core event draws from the separate fate stream in life.js.
for (const ev of CORE) ev.core = true;

// Not in the yearly list: life.js checks death at the end of each year.
export const deathEvent = {
  id: "death", domain: "health", channel: "bad", grave: true, big: true,
  apply: (s, ctx) => {
    const age = s.age;
    let text;
    if (s.health.serious) text = `在 ${age} 歲因為${s.health.serious.type}離開人世。`;
    else if (age >= 85) text = ctx.w([`在 ${age} 歲那年，安詳地離開了。`, `${age} 歲，在家人陪伴下安靜地走完這一生。`]);
    else if (age < 40) text = `一場意外，讓這段人生停在 ${age} 歲。`;
    else text = ctx.w([`在 ${age} 歲因病離開人世。`, `${age} 歲那年，身體撐不住了，離開了大家。`]);
    return { text, mood: 0, big: true };
  },
};

export { JOBS, tier, wage };
