// 事件庫：台灣人一生會遇到的事。
//
// Each event has:
//   domain, channel   which yearly luck channel tilts it (luck.js); omitted for fixed milestones
//   ages, when        when it can happen; once / cooldown limit repeats
//   p(s, ctx)         base probability for this year, from rates.js (Taiwan statistics)
//   apply(s, ctx)     what happens: changes the state and returns { text, mood, big }
//   choice(s, ctx)    instead of apply: a decision with options; auto mode picks by each option's weight
// Events run in this order every year, so a milestone (school, a first job) comes before what follows from it.
import { analyseText } from "./words.js";
import { interp } from "./rates.js";

// Pick a wording this life has not used yet, so repeated events read differently.
function say(ctx, list, vars = {}) {
  const used = ctx.s.used || (ctx.s.used = new Set());
  const fresh = list.filter(t => !used.has(t));
  const text = ctx.rng.pick(fresh.length ? fresh : list);
  used.add(text);
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
const kidWord = rng => rng.pick(["兒子", "女兒"]);

export const COUNTIES = [
  ["新北市", 404], ["臺中市", 286], ["高雄市", 272], ["臺北市", 248], ["桃園市", 233], ["臺南市", 185], ["彰化縣", 122],
  ["屏東縣", 79], ["雲林縣", 66], ["新竹縣", 59], ["苗栗縣", 53], ["南投縣", 47], ["嘉義縣", 48], ["新竹市", 45],
  ["宜蘭縣", 45], ["基隆市", 36], ["花蓮縣", 32], ["嘉義市", 26], ["臺東縣", 21], ["金門縣", 14], ["澎湖縣", 11],
];   // population in ten thousands (approximate, 2024), used only to weight where people move
const ABROAD = [["中國大陸", 3], ["美國", 2], ["日本", 1.5], ["新加坡", 1], ["越南", 1], ["澳洲", 0.8], ["加拿大", 0.6], ["德國", 0.4]];

const JOBS = {
  basic: [["工廠作業員", 0.75], ["餐廳廚房", 0.72], ["營造工地", 0.85], ["貨運司機", 0.85], ["市場攤商", 0.78]],
  high: [["門市人員", 0.8], ["工廠技術員", 0.92], ["行政助理", 0.85], ["水電師傅", 1.0], ["美髮師", 0.85], ["汽車維修", 0.95]],
  college: [["業務", 1.0], ["工程師", 1.25], ["護理師", 1.05], ["會計", 0.95], ["設計師", 0.95], ["老師", 1.05], ["公務員", 1.0], ["行銷企劃", 0.95], ["社工", 0.85]],
  graduate: [["研發工程師", 1.45], ["研究員", 1.25], ["藥師", 1.3], ["資料分析師", 1.35], ["大學講師", 1.2]],
};
const tier = edu => ({ none: "basic", 國小: "basic", 國中: "basic", 高中: "high", 高職: "high", 五專: "college", 科大: "college", 大學: "college", 碩士: "graduate", 博士: "graduate" })[edu] || "basic";
// Pay relative to the national median: job, age (主計總處 2024 medians by age), career level, and luck of the draw.
const wage = (s, factor, ctx) => Math.max(0.35, factor * interp(ctx.R.PAY_BY_AGE, s.age) * (1 + 0.12 * s.career) * Math.exp(0.15 * ctx.rng.normal()));

function startJob(s, ctx) {
  const [title, factor] = ctx.rng.pick(JOBS[tier(s.edu)]);
  s.employed = true; s.job = { title, factor }; s.unemployedFor = 0;
  s.income = wage(s, factor, ctx);
  if (s.home === "parents" && s.age >= 22 && ctx.rng.chance(0.4)) s.home = "rent";
  return title;
}
const moveTo = (s, ctx) => {
  const options = COUNTIES.filter(([c]) => c !== s.county);
  s.county = ctx.rng.weighted(options);
  return s.county;
};
const yearsMarried = s => (s.since === null ? 0 : s.age - s.since);

export const EVENTS = [
  // ---------- birth and childhood ----------
  {
    id: "birth", once: true, ages: [0, 0], big: true, p: () => 1,
    apply: (s, ctx) => ({ text: analyseText(ctx.analysis, ctx.chart, s), mood: 0, big: true }),
  },
  {
    id: "sibling", domain: "family", channel: "good", tags: ["siblings"], ages: [1, 12], when: s => s.siblings.younger > 0,
    p: () => 0.32,
    apply: (s, ctx) => { s.siblings.younger -= 1; s.siblings.born = (s.siblings.born || 0) + 1; return { text: say(ctx, ["{x}出生了，家裡更熱鬧了。", "你多了一個{x}，你偷偷覺得自己長大了。"], { x: ctx.rng.pick(["弟弟", "妹妹"]) }), mood: 3 }; },
  },
  {
    id: "kindergarten", once: true, ages: [4, 4], p: (s, ctx) => ctx.R.kindergarten(s.year),
    apply: (s, ctx) => ({ text: say(ctx, ["上幼兒園了，第一天哭著不讓媽媽走。", "上幼兒園了，很快就交到第一個好朋友。"]), mood: 1 }),
  },
  {
    id: "primary", once: true, ages: [6, 7], p: (s, ctx) => (s.age === 7 ? 1 : 0.85),
    apply: (s, ctx) => { s.edu = "國小"; s.studying = true; s.track = "國小"; return { text: say(ctx, ["上國小了，揹著新書包走進校門。", "上國小一年級，最期待的是下課鐘聲。"]), mood: 2 }; },
  },
  {
    id: "childIllness", domain: "health", channel: "bad", ages: [0, 12], cooldown: 4, p: () => 0.006,
    apply: (s, ctx) => ({ text: say(ctx, ["生了一場大病，住院兩個星期，爸媽輪流守在床邊，後來康復了。", "得了嚴重的肺炎，住院一陣子才好。"]), mood: -6 }),
  },
  {
    id: "familyMove", domain: "move", channel: "change", ages: [1, 17], cooldown: 3, p: () => 0.025,
    apply: (s, ctx) => ({ text: `跟著家人搬到${moveTo(s, ctx)}，要重新認識新同學。`, mood: -1 }),
  },
  {
    id: "parentsDivorce", once: true, domain: "family", channel: "bad", tags: ["father", "mother"], ages: [2, 17], when: s => s.father.alive && s.mother.alive,
    p: (s, ctx) => ctx.R.divorce(s.age + 3, s.year) * 0.8,
    apply: (s, ctx) => { s.flags.parentsSplit = true; return { text: say(ctx, ["爸媽離婚了，你跟著其中一方生活，兩邊都還是很疼你。", "爸媽決定分開，家裡安靜了很多。"]), mood: -10 }; },
  },

  // ---------- school ----------
  {
    id: "junior", once: true, ages: [12, 13], when: s => s.edu === "國小", p: (s, ctx) => (s.age === 13 ? ctx.R.juniorHigh(s.year) : 0),
    apply: (s, ctx) => { s.edu = "國中"; s.track = "國中"; return { text: say(ctx, ["上國中了，開始有寫不完的考卷。", "上國中了，第一次參加社團。"]), mood: 1 }; },
  },
  {
    id: "leaveAfterPrimary", once: true, ages: [13, 13], when: s => s.edu === "國小" && s.studying, p: () => 1,
    apply: (s, ctx) => { s.studying = false; return { text: "國小畢業後沒有繼續升學，開始幫家裡做事。", mood: -2 }; },
  },
  {
    id: "exam15", once: true, ages: [15, 15], when: s => s.edu === "國中" && s.studying, p: () => 1,
    choice: (s, ctx) => {
      const w = ctx.R.seniorHigh(s.year), good = ctx.rng() < ctxTilt(ctx, s, "study", "good", 0.35);
      const score = good ? "考得很好" : ctx.rng.pick(["考得普通", "考得不太理想"]);
      return {
        prompt: `國中畢業，升學考試${score}。接下來想讀什麼？`,
        options: [
          { label: "讀高中", hint: "三年後再考大學", weight: w.高中 * (good ? 1.3 : 0.8), apply: s2 => { s2.track = "高中"; return { text: `考試${score}，進了高中。`, mood: good ? 6 : 1 }; } },
          { label: "讀高職", hint: "早點學一技之長", weight: w.高職, apply: s2 => { s2.track = "高職"; return { text: `考試${score}，選了高職，想早點學一技之長。`, mood: 2 }; } },
          { label: "讀五專", hint: "五年一貫，畢業就是專科", weight: w.五專, apply: s2 => { s2.track = "五專"; return { text: `考試${score}，進了五專。`, mood: 2 }; } },
          { label: "先去工作", hint: "提早賺錢", weight: w.就業, apply: s2 => { s2.studying = false; return { text: "國中畢業就先出社會工作。", mood: -1 }; } },
        ],
      };
    },
  },
  {
    id: "exam18", once: true, ages: [18, 18], when: s => s.studying && (s.track === "高中" || s.track === "高職"), p: () => 1,
    choice: (s, ctx) => {
      const enter = ctx.R.college(s.year, s.track), good = ctx.rng() < ctxTilt(ctx, s, "study", "good", 0.35);
      s.edu = s.track;
      const where = good ? ctx.rng.pick(["理想的科系", "第一志願"]) : ctx.rng.pick(["還可以的學校", "離家有點遠的學校"]);
      return {
        prompt: `${s.track}畢業了，大學考試考上${where}。要去讀嗎？`,
        options: [
          { label: s.track === "高中" ? "去讀大學" : "去讀科大", hint: "四年後畢業", weight: enter, apply: s2 => { s2.track = s2.track === "高中" ? "大學" : "科大"; return { text: `考上${where}，開始大學生活。`, mood: good ? 7 : 3 }; } },
          { label: "先去工作", hint: "邊做邊想", weight: 1 - enter, apply: s2 => { s2.studying = false; return { text: `${s2.edu}畢業後先去工作。`, mood: 0 }; } },
        ],
      };
    },
  },
  {
    id: "graduate5", once: true, ages: [20, 20], when: s => s.studying && s.track === "五專", p: () => 1,
    apply: (s, ctx) => { s.edu = "五專"; s.studying = false; return { text: "五專畢業了。", mood: 3 }; },
  },
  {
    id: "graduateUni", once: true, ages: [22, 22], when: s => s.studying && (s.track === "大學" || s.track === "科大"), p: () => 1,
    choice: (s, ctx) => {
      s.edu = s.track;
      const p = ctx.R.master(s.year);
      return {
        prompt: `${s.track}畢業了！接下來呢？`,
        options: [
          { label: "考研究所", hint: "多讀兩年", weight: p, apply: s2 => { s2.track = "碩士"; return { text: say(ctx, ["大學畢業，接著考上研究所。", "大學畢業，決定再讀兩年研究所。"]), mood: 4 }; } },
          { label: "直接工作", hint: "開始賺錢", weight: 1 - p, apply: s2 => { s2.studying = false; return { text: "大學畢業了，準備找工作。", mood: 3 }; } },
        ],
      };
    },
  },
  {
    id: "graduateMaster", once: true, ages: [24, 24], when: s => s.studying && s.track === "碩士", p: () => 1,
    apply: (s, ctx) => { s.edu = "碩士"; s.studying = false; return { text: say(ctx, ["碩士畢業，論文口試順利通過。", "熬了好幾個通宵，終於拿到碩士學位。"]), mood: 5 }; },
  },
  {
    id: "studyAward", domain: "study", channel: "good", ages: [7, 24], cooldown: 3, when: s => s.studying, p: () => 0.05,
    apply: (s, ctx) => ({ text: say(ctx, ["拿到全班第一名，獎狀貼在客廳牆上。", "參加比賽得獎了。", "拿到獎學金，請全家吃了一頓。"]), mood: 4 }),
  },
  {
    id: "studySetback", domain: "study", channel: "bad", ages: [10, 24], cooldown: 3, when: s => s.studying, p: () => 0.04,
    apply: (s, ctx) => ({ text: say(ctx, ["成績退步很多，被叫去辦公室談話。", "考試考砸了，關在房間一整天。"]), mood: -3 }),
  },
  {
    id: "military", once: true, ages: [18, 26], when: s => s.sex === "male" && !s.studying && s.age >= 18, p: () => 0.9,
    apply: (s, ctx) => { const m = ctx.R.military(s.birthYear, s.year); return { text: m.text, mood: -1 }; },
  },

  // ---------- work ----------
  {
    id: "firstJob", once: true, ages: [14, 40], when: s => !s.studying && !s.employed && (s.sex === "female" || s.done.has("military") || s.age >= 26 || s.age < 18),
    p: (s, ctx) => ctx.R.jobFind(s.age),
    apply: (s, ctx) => ({ text: `找到第一份工作：${startJob(s, ctx)}。`, mood: 5, big: true }),
  },
  {
    id: "findJob", domain: "career", channel: "good", ages: [16, 64], when: s => !s.studying && !s.employed && s.done.has("firstJob") && !s.retired,
    p: () => 0.6,
    apply: (s, ctx) => ({ text: `重新找到工作：${startJob(s, ctx)}。`, mood: 6 }),
  },
  {
    id: "promotion", domain: "career", channel: "good", ages: [23, 64], cooldown: 2, when: s => s.employed && !s.retired && s.career < 5,
    p: (s, ctx) => ctx.R.promotion(s.age),
    apply: (s, ctx) => { s.career += 1; s.income *= ctx.rng.between(1.08, 1.22); return { text: say(ctx, ["升職了，薪水加了一級。", "被主管提拔，開始帶人。", "工作表現被看見，升上新的職位。"]), mood: 6 }; },
  },
  {
    id: "jobChange", domain: "career", channel: "change", ages: [22, 60], cooldown: 2, when: s => s.employed && !s.retired,
    p: (s, ctx) => ctx.R.jobChange(s.age),
    apply: (s, ctx) => {
      const before = s.job.title;
      s.income *= ctx.rng.between(0.92, 1.25);
      if (ctx.rng() < 0.25) { const [title, factor] = ctx.rng.pick(JOBS[tier(s.edu)].filter(([t]) => t !== before)); s.job = { title, factor }; return { text: `轉換跑道，從${before}換成${title}。`, mood: 2 }; }
      return { text: say(ctx, ["換了一家公司，繼續當{t}。", "跳槽到另一家公司，薪水和環境都換了。"], { t: before }), mood: 2 };
    },
  },
  {
    id: "layoff", domain: "career", channel: "bad", ages: [20, 64], cooldown: 3, when: s => s.employed && !s.retired,
    p: (s, ctx) => ctx.R.layoff(s.year),
    choice: (s, ctx) => {
      s.employed = false; s.unemployedFor = 1;
      return {
        prompt: say(ctx, ["公司裁員，你被列在名單上。接下來怎麼辦？", "公司收掉了，你突然沒了工作。接下來怎麼辦？"]),
        options: [
          { label: "馬上找同類工作", hint: "收入比較快回來", weight: 0.6, apply: () => ({ text: "被裁員了，你馬上開始投履歷。", mood: -8 }) },
          { label: "趁機進修轉行", hint: "慢一點，但可能更好", weight: 0.25, apply: s2 => { s2.flags.retrained = true; s2.income *= 1.08; return { text: "被裁員了，決定去上課學新技能，準備轉行。", mood: -5 }; } },
          { label: "先休息一陣子", hint: "照顧自己", weight: 0.15, apply: s2 => { s2.happiness += 4; return { text: "被裁員了，先讓自己好好休息幾個月。", mood: -4 }; } },
        ],
      };
    },
  },
  {
    id: "startup", once: true, domain: "career", channel: "change", ages: [28, 50], when: s => s.employed && s.savings >= 1.5,
    p: () => 0.015,
    choice: (s, ctx) => ({
      prompt: "有個創業的機會，存款也夠撐一陣子。要辭職創業嗎？",
      options: [
        { label: "辭職創業", hint: "風險大，可能大好或大壞", weight: 0.35, apply: s2 => { s2.flags.startup = s2.age; s2.savings -= 1.5; return { text: "辭掉工作，開了自己的店。", mood: 3, big: true }; } },
        { label: "繼續上班", hint: "穩穩的比較安心", weight: 0.65, apply: () => ({ text: "有個創業的機會，想了很久，還是決定繼續上班。", mood: 0 }) },
      ],
    }),
  },
  {
    id: "startupResult", once: true, domain: "wealth", channel: "good", when: s => s.flags.startup !== undefined && s.age - s.flags.startup >= 3 && !s.done.has("startupFail"), p: () => 0.4,
    apply: (s, ctx) => { s.income *= 1.8; s.savings += 3; s.career = Math.min(5, s.career + 2); return { text: "創業撐過了最難的頭幾年，生意越做越好。", mood: 12, big: true }; },
  },
  {
    id: "startupFail", once: true, domain: "wealth", channel: "bad", when: s => s.flags.startup !== undefined && s.age - s.flags.startup >= 2 && !s.done.has("startupResult"), p: () => 0.35,
    apply: (s, ctx) => { s.savings = Math.max(0, s.savings - 2); s.employed = false; s.unemployedFor = 1; return { text: "店撐不下去，收掉了，還背了一些債。", mood: -12, big: true }; },
  },
  {
    id: "burnout", domain: "health", channel: "bad", ages: [25, 60], cooldown: 5, when: s => s.employed, p: () => 0.02,
    choice: (s, ctx) => ({
      prompt: "工作壓力大到睡不著，身體開始出狀況。要怎麼辦？",
      options: [
        { label: "請長假休息", hint: "收入少一點，身體要緊", weight: 0.5, apply: s2 => { s2.income *= 0.95; return { text: "工作壓力大到睡不著，你請了長假，好好睡了一個月。", mood: 2 }; } },
        { label: "咬牙撐下去", hint: "對身體不好", weight: 0.5, apply: s2 => { s2.health.hr *= 1.05; return { text: "工作壓力大到睡不著，你咬牙撐了過去，但身體記得這一年。", mood: -5 }; } },
      ],
    }),
  },
  {
    id: "retire", once: true, ages: [55, 75], when: s => s.employed && !s.retired, p: (s, ctx) => ctx.R.retire(s.age, s.sex, s.year),
    apply: (s, ctx) => { s.retired = true; s.employed = false; return { text: say(ctx, ["退休了，同事幫你辦了歡送會。", "退休了，第一天早上還是習慣六點起床。"]), mood: 4, big: true }; },
  },

  // ---------- love ----------
  {
    id: "crush", domain: "love", channel: "good", ages: [12, 18], cooldown: 3, p: () => 0.15,
    apply: (s, ctx) => ({ text: say(ctx, ["偷偷喜歡班上的一個同學，每天都期待上學。", "收到人生第一封情書。"]), mood: 2 }),
  },
  {
    id: "dating", domain: "love", channel: "good", tags: ["spouse"], ages: [17, 75], when: s => s.rel === "single" || s.rel === "divorced" || s.rel === "widowed",
    p: (s, ctx) => ctx.R.dating(s.age, s.rel, s.year),
    apply: (s, ctx) => {
      s.prevRel = s.rel; s.rel = "dating"; s.partnerAge = s.age + Math.round(ctx.rng.between(-3, 4)) * (s.sex === "male" ? -1 : 1); s.datingSince = s.age;
      return { text: say(ctx, ["在{where}認識了一個人，開始交往。", "朋友介紹認識了一個人，聊著聊著就在一起了。", "和{where}認識的人在一起了。"], { where: ctx.rng.pick(["工作上", "朋友聚會", "社團", "交友軟體", "健身房"]) }), mood: 6 };
    },
  },
  {
    id: "breakup", domain: "love", channel: "bad", tags: ["spouse"], cooldown: 1, when: s => s.rel === "dating" && s.age > s.datingSince, p: (s, ctx) => ctx.R.breakup(s.age),
    apply: (s, ctx) => { s.rel = s.prevRel === "divorced" || s.prevRel === "widowed" ? s.prevRel : "single"; s.partnerAge = null; return { text: say(ctx, ["和交往的人分手了，難過了好一陣子。", "兩個人想要的生活不一樣，和平分手。"]), mood: -6 }; },
  },
  {
    id: "proposal", domain: "love", channel: "good", tags: ["spouse"], when: s => s.rel === "dating" && s.age > s.datingSince, p: (s, ctx) => ctx.R.proposal(s.age, s.sex, s.year, s.marriages),
    choice: (s, ctx) => ({
      prompt: `和交往的對象走到要不要結婚這一步。要結婚嗎？`,
      options: [
        { label: "結婚", hint: "一起建立家庭", weight: 0.85, apply: s2 => { s2.rel = "married"; s2.marriages += 1; s2.since = s2.age; s2.crisis = 0; if (s2.home === "parents") s2.home = "rent"; return { text: s2.marriages > 1 ? "再一次走進婚姻，這次更懂得珍惜。" : say(ctx, ["結婚了！婚禮上爸媽哭得比你還兇。", "結婚了，簡單登記，請兩邊家人吃了一頓飯。"]), mood: 10, big: true }; } },
        { label: "再等等", hint: "還沒準備好", weight: 0.15, apply: () => ({ text: "交往的對象想結婚，你覺得還沒準備好，決定再等等。", mood: -1 }) },
      ],
    }),
  },
  {
    id: "crisis", domain: "love", channel: "bad", tags: ["spouse"], cooldown: 4, when: s => s.rel === "married", p: (s, ctx) => ctx.R.crisis(yearsMarried(s)),
    choice: (s, ctx) => ({
      prompt: `婚姻出現危機，兩個人越來越常吵架。要怎麼面對？`,
      options: [
        { label: "好好溝通", hint: "把話說開", weight: 0.45, apply: s2 => { s2.guard = 3; return { text: "婚姻出現危機。兩個人坐下來把話說開，關係慢慢回溫。", mood: -2 }; } },
        { label: "一起去婚姻諮商", hint: "找專業的人幫忙", weight: 0.2, apply: s2 => { s2.guard = 5; return { text: "婚姻出現危機。你們一起去婚姻諮商，學會用新的方式相處。", mood: -1 }; } },
        { label: "冷處理", hint: "先不談", weight: 0.35, apply: s2 => { s2.crisis = 3; return { text: "婚姻出現危機。誰也不想先開口，家裡越來越安靜。", mood: -6 }; } },
      ],
    }),
  },
  {
    id: "divorce", domain: "love", channel: "bad", tags: ["spouse"], when: s => s.rel === "married",
    p: (s, ctx) => ctx.R.divorce(yearsMarried(s), s.year) * (s.guard > 0 ? 0.4 : 1) * (s.crisis > 0 ? 2.5 : 1),
    apply: (s, ctx) => { s.rel = "divorced"; s.divorces += 1; s.partnerAge = null; s.since = null; return { text: say(ctx, ["離婚了。簽字那天，兩個人都很平靜。", "走了 {n} 年，還是決定分開。"], { n: Math.max(1, yearsMarried(s)) }), mood: -12, big: true }; },
  },
  {
    id: "widowed", domain: "family", channel: "bad", tags: ["spouse"], when: s => s.rel === "married" && s.partnerAge !== null,
    p: (s, ctx) => ctx.R.deathRaw(s.partnerAge, s.sex === "male" ? "female" : "male", s.year),
    apply: (s, ctx) => { s.rel = "widowed"; s.partnerAge = null; s.since = null; return { text: say(ctx, ["另一半先走了。家裡少了一個人，好安靜。", "牽了大半輩子的手放開了，你學著一個人生活。"]), mood: -16, big: true }; },
  },

  // ---------- family ----------
  {
    id: "baby", domain: "family", channel: "good", tags: ["children"], when: s => s.rel === "married" && !s.flags.noMoreKids,
    p: (s, ctx) => ctx.R.birth(s.sex === "female" ? s.age : s.partnerAge, s.kids.length, s.year),
    apply: (s, ctx) => { s.kids.push(0); return { text: s.kids.length === 1 ? say(ctx, ["當爸媽了！{x}出生，抱在懷裡好小好軟。", "第一個孩子出生了，是個{x}。"], { x: kidWord(ctx.rng) }) : `第 ${s.kids.length} 個孩子出生了，是個${kidWord(ctx.rng)}。`, mood: 9, big: s.kids.length === 1 }; },
  },
  {
    id: "moreKids", domain: "family", channel: "change", tags: ["children"], cooldown: 3, when: s => s.rel === "married" && s.kids.length >= 1 && !s.flags.noMoreKids && (s.sex === "female" ? s.age : s.partnerAge) <= 42 && s.kids[s.kids.length - 1] >= 1,
    p: () => 0.35,
    choice: (s, ctx) => ({
      prompt: `孩子${s.kids.length > 1 ? "們" : ""}慢慢長大了。還想再生一個嗎？`,
      options: [
        { label: "想再生一個", hint: "家裡更熱鬧", weight: s.kids.length === 1 ? 0.45 : 0.15, apply: () => ({ text: "兩個人討論後，想再生一個孩子。", mood: 1 }) },
        { label: "這樣就好", hint: "專心陪現在的孩子", weight: s.kids.length === 1 ? 0.55 : 0.85, apply: s2 => { s2.flags.noMoreKids = true; return { text: "兩個人討論後，決定不再生了，好好陪現在的孩子長大。", mood: 1 }; } },
      ],
    }),
  },
  {
    id: "kidMilestone", ages: [25, 90], cooldown: 6, when: s => s.kids.some(k => k === 6 || k === 18 || k === 22), p: () => 0.6,
    apply: (s, ctx) => { const k = s.kids.find(x => x === 6 || x === 18 || x === 22); return { text: k === 6 ? "孩子上國小了，你在校門口看了好久。" : k === 18 ? "孩子考上大學，搬出去住了。" : "孩子大學畢業，開始工作了。", mood: 4 }; },
  },
  {
    id: "parentCare", domain: "family", channel: "bad", tags: ["father", "mother"], cooldown: 6, when: s => (s.father.alive && s.father.age >= 70) || (s.mother.alive && s.mother.age >= 70), p: () => 0.05,
    choice: (s, ctx) => {
      const who = s.father.alive && s.father.age >= 70 ? "爸爸" : "媽媽";
      const options = [
        { label: "自己照顧", hint: "累，但安心", weight: 0.4, apply: s2 => { s2.income *= 0.92; return { text: `${who}年紀大了需要照顧。你減少工作，自己照顧，累，但每天都看得到。`, mood: -4 }; } },
        { label: "請看護", hint: "花錢，但專業", weight: 0.4, apply: s2 => { s2.savings = Math.max(0, s2.savings - 0.6); return { text: `${who}年紀大了需要照顧。你請了看護，每個週末回去陪。`, mood: -2 }; } },
      ];
      if (s.siblings.older + (s.siblings.born || 0) > 0) options.push({ label: "兄弟姊妹輪流", hint: "大家一起分擔", weight: 0.4, apply: () => ({ text: `${who}年紀大了需要照顧，你和兄弟姊妹排班輪流。`, mood: -2 }) });
      return { prompt: `${who}年紀大了，需要人照顧。要怎麼安排？`, options };
    },
  },
  {
    id: "fatherDeath", domain: "family", channel: "bad", tags: ["father"], when: s => s.father.alive, p: (s, ctx) => ctx.R.deathRaw(s.father.age, "male", s.year),
    apply: (s, ctx) => { s.father.alive = false; s.savings += s.age >= 25 ? ctx.rng.between(0, 1.5) : 0; return { text: say(ctx, ["爸爸走了，享年 {a} 歲。你才發現自己好多話還沒跟他說。", "爸爸在 {a} 歲那年離開。"], { a: s.father.age }), mood: -14, big: true }; },
  },
  {
    id: "motherDeath", domain: "family", channel: "bad", tags: ["mother"], when: s => s.mother.alive, p: (s, ctx) => ctx.R.deathRaw(s.mother.age, "female", s.year),
    apply: (s, ctx) => { s.mother.alive = false; s.savings += s.age >= 25 ? ctx.rng.between(0, 1.5) : 0; return { text: say(ctx, ["媽媽走了，享年 {a} 歲。再也吃不到她煮的菜了。", "媽媽在 {a} 歲那年離開。"], { a: s.mother.age }), mood: -15, big: true }; },
  },
  {
    id: "grandchild", ages: [45, 100], cooldown: 4, when: s => s.kids.some(k => k >= 26), p: () => 0.12,
    apply: (s, ctx) => { s.flags.grandkids = (s.flags.grandkids || 0) + 1; return { text: s.flags.grandkids === 1 ? `當${s.sex === "female" ? "阿嬤" : "阿公"}了！第一次抱孫，手都在抖。` : "又多了一個孫子。", mood: 7 }; },
  },

  // ---------- money and home ----------
  {
    id: "buyHome", domain: "wealth", channel: "good", tags: ["home"], ages: [25, 60], cooldown: 2, when: (s, ctx) => s.home !== "own" && s.savings >= ctx.R.DOWN_PAYMENT && s.employed, p: (s, ctx) => ctx.R.homeBuy(s.age),
    choice: (s, ctx) => ({
      prompt: "存到一筆頭期款了。要買房子嗎？",
      options: [
        { label: "買房子", hint: "背 20 年房貸", weight: 0.75, apply: s2 => { s2.home = "own"; s2.savings -= ctx.R.DOWN_PAYMENT; return { text: `在${s2.county || "家附近"}買了房子，拿到鑰匙那天開心得睡不著。`, mood: 8, big: true }; } },
        { label: "繼續租", hint: "保留彈性", weight: 0.25, apply: () => ({ text: "存到了頭期款，算了算還是決定先繼續租。", mood: 0 }) },
      ],
    }),
  },
  {
    id: "windfall", domain: "wealth", channel: "good", ages: [22, 90], cooldown: 3, p: () => 0.03,
    apply: (s, ctx) => { const x = ctx.rng.between(0.5, 2.5); s.savings += x; return { text: say(ctx, ["投資賺了一筆。", "年終獎金比預期多很多。", "股票漲了一波，存款多了一些。", "公司分紅比預期多。", "發票中了兩百萬，又驚又喜。"]), mood: 6 }; },
  },
  {
    id: "loss", domain: "wealth", channel: "bad", ages: [22, 90], cooldown: 3, p: () => 0.03,
    apply: (s, ctx) => { s.savings = Math.max(0, s.savings - ctx.rng.between(0.5, 2)); return { text: say(ctx, ["投資失利，賠掉一大筆存款。", "借錢給朋友，結果要不回來了。", "被詐騙集團騙走一筆錢。"]), mood: -7 }; },
  },

  // ---------- health ----------
  {
    id: "chronic", domain: "health", channel: "bad", ages: [30, 100], when: s => !s.health.chronic, p: (s, ctx) => ctx.R.chronic(s.age, s.sex),
    apply: (s, ctx) => { s.health.chronic = true; s.health.hr *= 1.3; return { text: say(ctx, ["健康檢查發現血壓偏高，開始每天吃藥。", "被診斷出糖尿病，開始學著控制飲食。"]), mood: -3 }; },
  },
  {
    id: "checkups", once: true, ages: [40, 40], p: () => 1,
    choice: (s, ctx) => ({
      prompt: "40 歲了，收到成人健康檢查的通知。要定期去檢查嗎？",
      options: [
        { label: "每年都去", hint: "早期發現比較好治", weight: 0.55, apply: s2 => { s2.health.checkups = true; return { text: "開始每年做健康檢查。", mood: 0 }; } },
        { label: "有空再說", hint: "現在身體還不錯", weight: 0.45, apply: () => ({ text: "收到健康檢查的通知，覺得身體還不錯，先放著。", mood: 0 }) },
      ],
    }),
  },
  {
    id: "serious", domain: "health", channel: "bad", ages: [1, 110], when: s => !s.health.serious, p: (s, ctx) => ctx.R.serious(s.age, s.sex),
    apply: (s, ctx) => {
      const type = ctx.R.seriousType(s.age, s.sex, ctx.rng);
      s.health.serious = { type, since: s.age }; s.health.everSerious = (s.health.everSerious || 0) + 1;
      return { text: say(ctx, [`被診斷出${type}，開始治療。家人輪流陪你回診。`, `${type}來得突然，你住進了醫院。`]) + (s.health.checkups && type === "癌症" ? "還好是定期檢查發現的，發現得早。" : ""), mood: -15, big: true };
    },
  },
  {
    id: "recovered", when: s => s.health.serious && s.age - s.health.serious.since >= 5, p: () => 1,
    apply: (s, ctx) => { const t = s.health.serious.type; s.health.serious = null; return { text: `${t}治療告一段落，追蹤了五年都穩定，醫生說可以放心了。`, mood: 8 }; },
  },
  {
    id: "accident", domain: "health", channel: "bad", ages: [5, 90], cooldown: 5, p: () => 0.008,
    apply: (s, ctx) => ({ text: say(ctx, ["騎車發生車禍，骨折休養了三個月。", "爬山時扭傷，拄了一陣子拐杖。"]), mood: -5 }),
  },

  // ---------- moving ----------
  {
    id: "move", domain: "move", channel: "change", ages: [18, 80], cooldown: 3, when: s => !s.abroad, p: (s, ctx) => ctx.R.move(s.age),
    apply: (s, ctx) => ({ text: say(ctx, ["搬到{c}，開始新的生活。", "因為工作搬到{c}。"], { c: moveTo(s, ctx) }), mood: 1 }),
  },
  {
    id: "abroad", domain: "move", channel: "change", ages: [22, 50], cooldown: 5, when: s => !s.abroad && !s.studying, p: (s, ctx) => ctx.R.abroad(s.age),
    choice: (s, ctx) => {
      const where = ctx.rng.weighted(ABROAD);
      return {
        prompt: `有一個去${where}工作的機會。要去嗎？`,
        options: [
          { label: "去", hint: "看看外面的世界", weight: 0.45, apply: s2 => { s2.abroad = where; s2.income *= 1.2; return { text: `到${where}工作，一切從頭開始。`, mood: 4, big: true }; } },
          { label: "留在台灣", hint: "家人朋友都在這裡", weight: 0.55, apply: () => ({ text: `有去${where}工作的機會，想了想，還是留在台灣。`, mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "returnHome", when: s => s.abroad && s.age - s.last.abroad >= 2, p: () => 0.2,
    apply: (s, ctx) => { const was = s.abroad; s.abroad = null; return { text: `結束在${was}的日子，回到台灣。`, mood: 3 }; },
  },

  // ---------- later life ----------
  {
    id: "hobby", ages: [60, 100], cooldown: 8, when: s => s.retired || s.age >= 65, p: () => 0.12,
    apply: (s, ctx) => ({ text: say(ctx, ["開始學書法，每天寫一張。", "加入社區的土風舞隊。", "去醫院當志工。", "和老朋友組了一個登山隊。"]), mood: 4 }),
  },
  {
    id: "milestoneAge", ages: [80, 100], when: s => s.age === 80 || s.age === 90 || s.age === 100, p: () => 1,
    apply: (s, ctx) => ({ text: s.age === 100 ? "滿 100 歲了！里長帶著賀禮來祝壽。" : `${s.age} 歲生日，${s.kids.length ? "孩子們" : "朋友們"}幫你辦了一桌。`, mood: 4 }),
  },
];

// Not in the yearly list: life.js checks death at the end of each year.
export const deathEvent = {
  id: "death", domain: "health", channel: "bad", big: true,
  apply: (s, ctx) => {
    const age = s.age;
    let text;
    if (s.health.serious) text = `在 ${age} 歲因為${s.health.serious.type}離開人世。`;
    else if (age >= 85) text = say(ctx, [`在 ${age} 歲那年，安詳地離開了。`, `${age} 歲，在家人陪伴下安靜地走完這一生。`]);
    else if (age < 40) text = `一場意外，讓這段人生停在 ${age} 歲。`;
    else text = say(ctx, [`在 ${age} 歲因病離開人世。`, `${age} 歲那年，身體撐不住了，離開了大家。`]);
    return { text, mood: 0, big: true };
  },
};

// The probability of a "good" or "bad" outcome inside a choice, tilted by this year's luck.
function ctxTilt(ctx, s, domain, channel, p) {
  const l = ctx.luckAt(s.age);
  const lnm = l ? l.m[domain][channel] : 0;
  const z = Math.log(p / (1 - p)) + lnm;
  return 1 / (1 + Math.exp(-z));
}
