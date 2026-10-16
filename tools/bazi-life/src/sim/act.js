// 行動的結果：一個行動不管是按鈕還是玩家自己寫的，都照同一套規則算。
//
// act(id, s, ctx, sit) returns { text, mood, big? }, or { infeasible: reason } when the action cannot happen now
// (no partner to marry, no money for a down payment). `sit` says where it was chosen:
//   situation  the event id        domain  the event's domain      about  the family member it is about
//   summary    the player's own words, when they wrote the choice     label  the button text, when they tapped one
// Effects stay within what the buttons of the same kind do, so writing a choice never beats the rules.
import { ACTIONS } from "./actions.js";
import { startJob, otherJob, moveTo, wage, ABROAD, bornSiblings, yearsMarried } from "./world.js";
import { siblingCall } from "./words.js";

// The situation in a few words, then the player's own words, so the line reads on its own in the story.
const lead = sit => [sit.topic, sit.summary].filter(Boolean).map(x => `${x.replace(/[。，,.!！？?\s]+$/, "")}。`).join("");
const no = infeasible => ({ infeasible });
// The youngest age for each action: work from 15 (勞動基準法), adult matters from 18 (marriage, contracts, lottery).
const MIN_AGE = {
  jobSearch: 15, jobHop: 15, sideJob: 15, quitJob: 15, careerSwitch: 18, civilService: 18, startup: 18, dispute: 18, workAbroad: 18, retire: 30,
  invest: 18, buyHome: 18, sellAsset: 18, borrow: 18, lend: 18, insurance: 18, lottery: 18,
  marry: 18, haveChild: 18, noChild: 18, affair: 18, hireCare: 18, shareCare: 18, moveHome: 18, emigrate: 18,
  pursue: 12, vice: 13, studyAbroad: 12, volunteer: 10,
};
function tooYoung(id, s) {
  if (!MIN_AGE[id] || s.age >= MIN_AGE[id]) return null;
  if (MIN_AGE[id] === 15) return "還不到可以工作的年紀（15 歲），現在先好好長大。";
  if (id === "retire") return "現在談退休還太早了。";
  if (id === "pursue") return "年紀還小，先當好朋友吧。";
  if (id === "studyAbroad") return "還太小，一個人出國讀書要等長大一點。";
  if (s.age < 13) return "這是大人的事，等長大以後再說吧。";
  return "還沒滿 18 歲，這件事要等成年以後。";
}
// A child or a teen still at school: some actions mean something smaller (補習 instead of 在職專班).
const young = s => s.age < 18;
// Where a choice belongs: its domain first, then the core event ids that are known to be about work or love.
const WORK_IDS = ["layoff", "burnout", "firstJob", "startupOffer", "startupYear1", "civilExam"];
const LOVE_IDS = ["crisis", "proposal", "a_temptation", "a_chores", "a_inlaws"];
const work = sit => sit.domain === "career" || WORK_IDS.includes(sit.situation);
const love = sit => sit.domain === "love" || LOVE_IDS.includes(sit.situation);

// Marriages are kept as spells { from, to, end } for the statistics (test/calibration.test.js).
export function closeSpell(s, end) {
  const last = s.spells[s.spells.length - 1];
  if (last && last.to === null) { last.to = s.age; last.end = end; }
}
export function endRelationship(s, ctx) {
  if (s.rel === "married") {
    s.rel = "divorced"; s.divorces += 1; if (s.partner) s.exes.push(s.partner); s.partner = null; s.since = null;
    closeSpell(s, "divorce");
    return "married";
  }
  if (s.rel === "dating") {
    s.rel = s.prevRel === "divorced" || s.prevRel === "widowed" ? s.prevRel : "single"; if (s.partner) s.exes.push(s.partner); s.partner = null;
    return "dating";
  }
  return null;
}
export function marry(s) {
  s.rel = "married"; s.marriages += 1; s.since = s.age; s.crisis = 0; s.guard = 0;
  s.spells.push({ from: s.age, to: null, end: null });
  if (s.home === "parents") s.home = "rent";
}
export function ownHome(s) {
  s.home = "own";
  if (s.ownedAt === undefined) s.ownedAt = s.age;
}
const loseJob = s => { s.employed = false; s.unemployedFor = 1; };
const spend = (s, x) => { const paid = Math.min(s.savings, x); s.savings -= paid; return paid; };

const HANDLERS = {
  // ---------- work and study ----------
  jobSearch(s, ctx, sit) {
    if (s.retired || s.age >= 66) return no("已經過了退休的年紀，找工作不容易了。");
    if (s.studying && s.age < 18) return no("還在讀書，先把書讀完吧。");
    if (s.employed) {
      s.income *= ctx.rng.between(0.95, 1.18);
      return { text: lead(sit) + ctx.w("{投了幾家公司|請朋友幫忙推薦}，{兩個月後|沒多久}換到另一家公司，一樣當{job}。"), mood: 2 };
    }
    if (ctx.roll("career", "good", 0.6)) return { text: lead(sit) + ctx.w("{投了二十幾封履歷|面試了好幾家}，{終於|第三個月}找到新工作：{title}。", { title: startJob(s, ctx) }), mood: 5 };
    return { text: lead(sit) + ctx.w("{履歷投出去大多沒有回音|面試了幾家都沒下文}，你{一邊找一邊打零工|繼續找}。"), mood: -3 };
  },
  jobHop(s, ctx, sit) {
    if (s.retired || s.age >= 66) return no("已經退休了。");
    if (!s.employed && !s.done.has("firstJob")) return no("還沒有開始工作。");
    const [title, factor, field, element] = otherJob(s, ctx);
    const before = s.job ? s.job.title : "";
    s.employed = true; s.unemployedFor = 0; s.job = { title, factor, field, element, since: s.age };
    s.income = wage(s, factor, ctx) * ctx.rng.between(0.95, 1.15);
    s.health.stress = Math.max(0, s.health.stress - 0.1);
    return { text: lead(sit) + ctx.w("{換到一家新公司|跳槽了}，{從{before}換成|改當}{title}。{新環境要重新適應，但心情輕鬆不少。|薪水差不多，壓力小很多。|同事人都不錯。}", { before: before || "原本的工作", title }), mood: 3 };
  },
  careerSwitch(s, ctx, sit) {
    if (s.age >= 60) return no("這個年紀轉行太辛苦了。");
    const [title, factor, field, element] = otherJob(s, ctx);
    s.employed = true; s.unemployedFor = 0; s.job = { title, factor, field, element, since: s.age };
    s.income = wage(s, factor, ctx) * 0.85; s.career = Math.max(0, s.career - 1); s.flags.retrained = true;
    ctx.nudge("curiosity", 0.03);
    return { text: lead(sit) + ctx.w("{花了一年學新東西，|從頭學起，}轉行當{title}。{一開始薪水少了一截，|一切從新人做起，}{但你覺得值得。|心裡反而踏實。}", { title }), mood: 2 };
  },
  study(s, ctx, sit) {
    if (/exam15|exam18/.test(sit.situation || "")) {
      s.flags[`retake_${sit.situation}`] = true; s.done.delete(sit.situation);
      return { text: lead(sit) + ctx.w("決定{重考|再拚一年}，{每天到補習班報到|把自己關在書桌前}。"), mood: -2 };
    }
    if (young(s) || (s.studying && s.age < 25)) {
      ctx.nudge("curiosity", 0.02);
      return { text: lead(sit) + ctx.w("{報名了補習班，|每天{放學|下課}後多讀一個小時，|把不會的題目整理成一本筆記，}{成績慢慢進步了。|雖然累，但看得到進步。|讀出了一點興趣。}"), mood: 1 };
    }
    if (s.age >= 70) return no("年紀大了，可以把它當興趣學。");
    if (s.arcs.study) return no("你已經在進修了，先把它讀完吧。");
    const kind = ctx.rng.pick(["在職專班", "證照課程", "研究所", "語言課"]);
    ctx.arc.start("study", { kind, from: s.age }, ctx.rng.chance(0.5) ? 1 : 2);
    spend(s, 0.3); ctx.nudge("curiosity", 0.03);
    return { text: lead(sit) + ctx.w("{報名了|去讀}{kind}，{下班後|週末}{背著書包|拿著筆記}回到教室。", { kind }), mood: 1 };
  },
  studyAbroad(s, ctx, sit) {
    if (s.age > 40) return no("出國讀書的年紀有點晚了，可以考慮出國進修短期課程。");
    if (s.age >= 25 && s.savings < 1.5) return no("存款不夠出國讀書。");
    const where = ctx.rng.weighted([["美國", 3], ["英國", 1.5], ["日本", 2], ["澳洲", 1.5], ["加拿大", 1], ["德國", 0.8]]);
    if (s.age >= 25) spend(s, 1.5);
    s.abroad = where; s.leftAt = s.age; s.flags.studyAbroad = s.age;
    if (/exam15/.test(sit.situation || "")) { s.track = "高中"; s.studying = true; }
    return { text: lead(sit) + ctx.w("飛到{where}讀書，{第一個月每天都在想家|很快就交到各國的朋友}。", { where }), mood: 3, big: true };
  },
  civilService(s, ctx, sit) {
    if (s.age < 18 || s.age > 55) return no("公職考試的年齡不太適合。");
    if (s.job && s.job.field === "公部門") return no("你已經在公部門工作了。");
    ctx.arc.start("civil", { tries: 0, quit: !s.employed || ctx.rng.chance(0.4) }, 1);
    if (s.arcs.civil.data.quit && s.employed) loseJob(s);
    return { text: lead(sit) + ctx.w("{買齊了考古題|報名了補習班}，{每天讀到半夜|把作息改成跟考生一樣}，準備明年的{高普考|國家考試}。"), mood: -1 };
  },
  startup(s, ctx, sit) {
    if (s.age < 18) return no("還太小，先存點經驗。");
    if (s.arcs.startup) return no("你已經在創業了。");
    if (s.retired && s.age >= 75) return no("這個年紀開店太辛苦了，可以把它當成興趣做。");
    const kind = ctx.rng.pick(["咖啡店", "早午餐店", "網路商店", "工作室", "手搖飲加盟店", "小吃店", "設計公司"]);
    const money = Math.min(s.savings, 1.5);
    if (money < 0.5) s.debt += 1; else spend(s, money);
    if (s.employed) loseJob(s);
    s.unemployedFor = 0;
    ctx.arc.start("startup", { kind, from: s.age, cash: 0 }, 1);
    ctx.nudge("drive", 0.04);
    return { text: lead(sit) + ctx.w("{辭掉工作，|把存款押上，}開了一間{kind}。{開幕那天，親朋好友送的花擺滿門口。|招牌是你自己設計的。}", { kind }), mood: 4, big: true };
  },
  sideJob(s, ctx, sit) {
    if (s.age < 15) return no("還太小了。");
    const gig = ctx.rng.pick(s.year >= 2016 ? ["跑外送", "接案", "週末擺攤", "當家教"] : ["當家教", "週末擺攤", "晚上去餐廳打工", "幫人代工"]);
    if (s.employed) s.income *= 1.08; else { s.income = Math.max(s.income * 0.5, 0.35); }
    s.health.stress = Math.min(1, s.health.stress + 0.05);
    return { text: lead(sit) + ctx.w("{下班後|一有空就}{gig}，{多賺一點是一點。|累，但看到存款慢慢變多很安心。}", { gig }), mood: 0 };
  },
  negotiate(s, ctx, sit) {
    if (work(sit)) {
      if (!s.employed) return no("現在沒有工作可以談。");
      if (ctx.roll("career", "good", 0.4)) { s.income *= 1.08; return { text: lead(sit) + ctx.w("{準備了一整份資料|找了適當的時機}去談，{主管點頭了。|沒想到公司答應了。}"), mood: 4 }; }
      return { text: lead(sit) + ctx.w("鼓起勇氣去談，{主管說會再考慮，之後就沒有下文了。|公司說目前沒辦法。}"), mood: -2 };
    }
    return { text: lead(sit) + ctx.w("{坐下來把條件一條一條講清楚，|大家各退一步，}{最後談出一個都能接受的辦法。|雖然花了好幾個晚上，總算有了共識。}"), mood: 1 };
  },
  dispute(s, ctx, sit) {
    if (/inherit/.test(sit.situation || "")) { s.savings += 0.8; s.flags.estranged = ctx.rng.chance(0.5); return { text: lead(sit) + ctx.w("{請了律師，|上了法院，}{官司拖了兩年，總算分清楚了，|最後照法律分了，}但{兄弟姊妹之間|家裡}{再也回不到從前。|多了一道疤。}"), mood: -4 }; }
    if (work(sit)) {
      if (ctx.rng.chance(0.6)) { s.savings += 0.3; return { text: lead(sit) + ctx.w("{去勞工局申請調解，|找了勞工律師，}{公司補了一筆錢。|拿回了應得的資遣費。}"), mood: 2 }; }
      return { text: lead(sit) + ctx.w("{跑了好幾趟勞工局，|調解了兩次，}{結果不如預期。|公司只願意照最低標準給。}"), mood: -3 };
    }
    return { text: lead(sit) + ctx.w("{找律師諮詢，|問了法律扶助基金會，}{弄清楚了自己的權利。|心裡比較有底了。}"), mood: 0 };
  },
  quitJob(s, ctx, sit) {
    if (!s.employed) return no("你現在沒有工作。");
    loseJob(s); s.health.stress = Math.max(0, s.health.stress - 0.2);
    return { text: lead(sit) + ctx.w("{遞出辭呈，|最後一天上班，}{走出公司那一刻，覺得肩膀輕了。|收拾東西時有點捨不得。}"), mood: 1 };
  },
  workAbroad(s, ctx, sit) {
    if (s.age > 60) return no("這個年紀出國工作太辛苦了。");
    if (s.age < 18) return no("還太小了。");
    const where = /abroad/.test(sit.situation || "") && s.flags.offerAbroad ? s.flags.offerAbroad : ctx.rng.weighted(ABROAD);
    s.abroad = where; s.leftAt = s.age;
    if (s.employed) s.income *= 1.2; else startJob(s, ctx);
    return { text: lead(sit) + ctx.w("到{where}工作，{一切從頭開始。|住進一間小小的宿舍。|第一個月連超市都逛不習慣。}", { where }), mood: 3, big: true };
  },
  familyBusiness(s, ctx, sit) {
    if (!s.father.alive && !s.mother.alive) return no("爸媽都不在了，家裡沒有家業可以接。");
    // A child, or a teen still at school, helps out at home; only a grown-up takes over the family trade.
    if (s.age < 15 || (young(s) && s.studying)) return { text: lead(sit) + ctx.w("{放學後|假日}幫忙家裡{顧店|做事|下田}，{爸媽誇你長大了。|學會了算錢找錢。|累，但很有成就感。}"), mood: 1 };
    if (s.birthCounty) s.county = s.birthCounty;
    s.done.add("firstJob");
    s.employed = true; s.unemployedFor = 0;
    const title = ctx.rng.pick(["家裡的店", "家裡的田", "家裡的小工廠"]);
    s.job = { title, factor: 0.75, field: "家業", since: s.age }; s.income = wage(s, 0.75, ctx);
    return { text: lead(sit) + ctx.w("回到{city}，{每天跟著爸媽|一早就}{顧店|下田|在工廠忙}。{收入少了，但吃得到家裡的飯。|爸媽嘴上不說，其實很開心。}"), mood: 2 };
  },
  pushThrough(s, ctx, sit) {
    s.health.stress = Math.min(1, s.health.stress + 0.1);
    if (/burnout/.test(sit.situation || "")) s.health.hr *= 1.03;
    return { text: lead(sit) + ctx.w("{咬著牙|告訴自己再撐一下，}{繼續撐下去。|日子照過。}{有幾個晚上還是睡不著。|撐過來了，但很累。}"), mood: -3 };
  },
  retire(s, ctx, sit) {
    if (s.retired) return no("你已經退休了。");
    if (s.age < 50 && s.savings < 10) return no("存款還不夠提早退休。");
    if (s.age < 60 && s.savings < 4) return no("存款還不夠退休。");
    s.retired = true; s.employed = false;
    return { text: lead(sit) + ctx.w("{辦了退休，|交接完最後一份工作，}{開始過自己的日子。|第一個早上睡到自然醒。}"), mood: 4, big: true };
  },

  // ---------- money ----------
  save(s, ctx, sit) {
    if (young(s)) return { text: lead(sit) + ctx.w("把{零用錢|紅包錢}{存進撲滿，|交給媽媽存起來，}{想買的東西先忍一忍。|看著存的錢慢慢變多。}"), mood: 0 };
    s.flags.frugalUntil = s.age + 3;
    return { text: lead(sit) + ctx.w("{開始記帳，|把每個月的開銷砍了一半，}{午餐自己帶便當。|能省就省。}"), mood: -1 };
  },
  invest(s, ctx, sit) {
    if (s.savings < 0.2) return no("存款太少了，先存點錢再說。");
    const stake = Math.min(s.savings, Math.max(0.3, s.savings * 0.5));
    const era = s.year === 1990 ? -0.45 : s.year === 2000 || s.year === 2001 ? -0.25 : s.year === 2008 ? -0.3 : s.year === 2020 || s.year === 2021 ? 0.3 : s.year === 2022 ? -0.15 : 0.05;
    const r = Math.max(-0.7, era + 0.2 * ctx.rng.normal() + (ctx.odds("wealth", "good", 0.5) - 0.5) * 0.3);
    s.savings += stake * r;
    return r >= 0
      ? { text: lead(sit) + ctx.w("{把一部分存款拿去投資，|開始買股票，}{一年下來賺了一些。|運氣不錯，帳面上漲了。}"), mood: 3 }
      : { text: lead(sit) + ctx.w("{把一部分存款拿去投資，|跟著大家進場，}{結果遇到大跌，賠了不少。|帳面上一片綠油油。}"), mood: -4 };
  },
  buyHome(s, ctx, sit) {
    if (s.home === "own") return no("你已經有自己的房子了。");
    if (s.savings < ctx.R.DOWN_PAYMENT) return no("存款還不夠付頭期款。");
    ownHome(s); s.savings -= ctx.R.DOWN_PAYMENT;
    return { text: lead(sit) + ctx.w("在{city}買了房子，{拿到鑰匙那天開心得睡不著。|背上二十年的房貸，心裡卻很踏實。}"), mood: 7, big: true };
  },
  sellAsset(s, ctx, sit) {
    if (/inherit/.test(sit.situation || "")) { s.savings += 1; return { text: lead(sit) + ctx.w("把老房子賣了，{錢照比例分掉。|大家各自拿了一份。}{簽約那天，你多看了老家幾眼。|搬東西時翻出好多小時候的照片。}"), mood: -1 }; }
    if (s.home !== "own") return no("你沒有房子可以賣。");
    s.home = "rent"; s.savings += 3;
    return { text: lead(sit) + ctx.w("把房子賣了，{手上多了一筆現金。|搬去租屋，心裡有點空。}"), mood: -2 };
  },
  borrow(s, ctx, sit) {
    s.savings += 0.8; s.debt += 0.9;
    return { text: lead(sit) + ctx.w("{跟銀行貸了一筆錢，|向家人借了錢，}{每個月都要還。|暫時渡過了難關。}"), mood: -1 };
  },
  lend(s, ctx, sit) {
    if (s.savings < 0.3) return no("你自己的存款也不多了。");
    spend(s, 0.3); s.flags.lent = { age: s.age, back: ctx.rng.chance(0.55) };
    return { text: lead(sit) + ctx.w("{二話不說|想了一個晚上，還是}把錢借出去了。"), mood: 0 };
  },
  insurance(s, ctx, sit) {
    s.flags.insured = true; spend(s, 0.05);
    return { text: lead(sit) + ctx.w("{找業務員|比了好幾家}，買了{醫療險|長照險|壽險}，{每個月多一筆保費，|心裡踏實一點，}以防萬一。"), mood: 1 };
  },
  lottery(s, ctx, sit) {
    spend(s, 0.01);
    if (ctx.rng() < 0.0003) { s.savings += 8; return { text: lead(sit) + "對獎的時候手在抖：中了頭獎！", mood: 15, big: true }; }
    if (ctx.rng() < 0.05) { s.savings += 0.02; return { text: lead(sit) + ctx.w("{中了小獎，|對中兩個號碼，}{請大家喝了飲料。|拿去買了一頓好的。}"), mood: 2 }; }
    return { text: lead(sit) + ctx.w("{買了幾張彩券，|試試手氣，}{一個號碼都沒中。|只中了一張安慰獎。}"), mood: 0 };
  },
  donate(s, ctx, sit) {
    const gave = spend(s, Math.min(1, s.savings * 0.3));
    ctx.nudge("warmth", 0.03);
    return { text: lead(sit) + ctx.w(gave > 0.01 ? "{捐了一筆錢給|把錢捐給}{育幼院|偏鄉學校|醫院的急難救助|動物收容所}，{心裡很平靜。|收到一張手寫的謝卡。}" : "{手頭不寬裕，|錢不多，}就{去當一天志工|捐了發票}。"), mood: 3 };
  },

  // ---------- love and family ----------
  talk(s, ctx, sit) {
    if (love(sit) && (s.rel === "married" || s.rel === "dating")) {
      s.guard = Math.max(s.guard, 3); s.crisis = Math.max(0, s.crisis - 2);
      return { text: lead(sit) + ctx.w("{找了一個安靜的晚上，|把孩子送去爸媽家，}和{partner}{把話說開。|好好聊了一次。}{兩個人都哭了，也都鬆了一口氣。|雖然沒有全部解決，但關係慢慢回溫。}"), mood: 2 };
    }
    return { text: lead(sit) + ctx.w("{坐下來好好談，|把心裡的話說出來，}{對方比你想的更願意聽。|雖然有點尷尬，說完舒服多了。}"), mood: 2 };
  },
  counsel(s, ctx, sit) {
    if (young(s)) {
      s.health.stress = Math.max(0, s.health.stress - 0.15);
      return { text: lead(sit) + ctx.w("{去輔導室找輔導老師聊了幾次，|跟學校的輔導老師約了時間，}{心裡輕鬆多了。|知道有人願意聽你說。}"), mood: 2 };
    }
    spend(s, 0.05);
    if (love(sit) && s.partner) { s.guard = Math.max(s.guard, 5); return { text: lead(sit) + ctx.w("{和{partner}一起去婚姻諮商，|每週一次去找諮商師，}{學會用新的方式吵架。|第一次聽懂{ta}在氣什麼。}"), mood: 1 }; }
    s.health.stress = Math.max(0, s.health.stress - 0.2);
    return { text: lead(sit) + ctx.w("{去找心理師聊了幾次，|掛了身心科，}{慢慢睡得著了。|知道自己不是一個人。}"), mood: 3 };
  },
  avoid(s, ctx, sit) {
    if (love(sit) && s.partner) s.crisis = Math.max(s.crisis, 3);
    return { text: lead(sit) + ctx.w("{誰也不想先開口，|先把事情放著，}{家裡越來越安靜。|表面上相安無事。}"), mood: -4 };
  },
  separate(s, ctx, sit) {
    const years = Math.max(1, yearsMarried(s));
    const was = endRelationship(s, ctx);
    if (!was) return no("現在沒有交往或結婚的對象。");
    return was === "married"
      ? { text: lead(sit) + ctx.w("{走了 {n} 年，|簽字那天，}{還是決定分開。|兩個人都很平靜。}", { n: years }), mood: -10, big: true }
      : { text: lead(sit) + ctx.w("{和交往的人分手了，|把話講清楚，好聚好散，}{難過了好一陣子。|走出來花了半年。}"), mood: -5 };
  },
  marry(s, ctx, sit) {
    if (s.rel === "married") return no("你已經結婚了。");
    if (s.rel !== "dating" || !s.partner) return no("現在沒有交往的對象。");
    marry(s);
    return { text: lead(sit) + ctx.w("和{partner}結婚了！{婚禮上爸媽哭得比你還兇。|簡單登記，請兩邊家人吃了一頓飯。}"), mood: 9, big: true };
  },
  wait(s, ctx, sit) {
    return { text: lead(sit) + ctx.w("{決定先等等，|先不做決定，}{再看看情況。|讓時間給答案。}"), mood: 0 };
  },
  pursue(s, ctx, sit) {
    if (s.rel === "married") { s.guard = Math.max(s.guard, 2); return { text: lead(sit) + ctx.w("{重新追了{partner}一次：|偷偷安排了一場約會，}{訂了你們第一次約會的餐廳。|買了{ta}一直想要的東西。}"), mood: 3 }; }
    if (young(s) && s.rel !== "dating") return { text: lead(sit) + ctx.w("{鼓起勇氣，|下課的時候，}{傳了紙條給喜歡的人。|約喜歡的人一起去圖書館。}{心跳得好快。|對方笑了。}"), mood: 2 };
    s.flags.pursueUntil = s.age + 1;
    return { text: lead(sit) + ctx.w("{鼓起勇氣，|不再等緣分，}{主動約了喜歡的人。|開始多參加聚會、認識新朋友。}"), mood: 2 };
  },
  haveChild(s, ctx, sit) {
    if (s.rel !== "married") return no("現在還沒有結婚的另一半。");
    const motherAge = s.sex === "female" ? s.age : s.partner ? s.partner.age : 99;
    if (motherAge > 45) return no("已經過了適合生育的年紀。");
    s.flags.noMoreKids = false; s.flags.tryUntil = s.age + 3;
    return { text: lead(sit) + ctx.w("和{partner}{商量好了，|決定，}{想要一個孩子。|再生一個。}"), mood: 2 };
  },
  noChild(s, ctx, sit) {
    s.flags.noMoreKids = true;
    return { text: lead(sit) + ctx.w("{決定不生了，|兩個人說好，}{把日子過好就好。|陪好現在的家人。}"), mood: 1 };
  },
  care(s, ctx, sit) {
    ctx.nudge("warmth", 0.03);
    if (young(s)) return { text: lead(sit) + ctx.w("{放學就回家，|主動幫忙做家事，}{陪家人吃飯聊天。|爸媽說你變懂事了。}"), mood: 1 };
    if (s.employed) s.income *= 0.92;
    // Who needs care: the parent the choice is about, else an elderly parent who is still alive.
    const who = sit.about === "father" && s.father.alive ? "爸爸" : sit.about === "mother" && s.mother.alive ? "媽媽"
      : sit.situation === "parentCare" ? (s.mother.alive && s.mother.age >= 70 ? "媽媽" : s.father.alive ? "爸爸" : null) : null;
    return { text: lead(sit) + ctx.w(who ? "{減少工作，|搬回去住，}自己照顧{who}。{累，但每天都看得到{who}。|陪{who}看電視、散步、回診。}" : "{多花時間陪家人，|把重心放回家裡，}{家裡的笑聲多了。|日子慢了下來。}", { who: who || "" }), mood: 1 };
  },
  hireCare(s, ctx, sit) {
    spend(s, 0.6);
    return { text: lead(sit) + ctx.w("{請了看護，|申請了長照服務，}{每個週末回去陪。|專業的人照顧，你比較放心。}"), mood: -1 };
  },
  shareCare(s, ctx, sit) {
    const adults = bornSiblings(s, 18);
    if (!adults.length) return no("你沒有兄弟姊妹可以一起分擔。");
    const who = adults.length === 1 ? siblingCall(adults[0]) : "兄弟姊妹";
    return { text: lead(sit) + ctx.w("和{who}{排了班表，|說好分工，}{一人顧幾天。|錢和時間大家一起出。}", { who }), mood: -1 };
  },
  reconcile(s, ctx, sit) {
    if (love(sit) && s.partner) { s.guard = Math.max(s.guard, 2); s.crisis = 0; }
    if (/inherit/.test(sit.situation || "")) s.flags.estranged = false;
    ctx.nudge("warmth", 0.02);
    return { text: lead(sit) + ctx.w("{退了一步，|選擇原諒，}{心裡的結慢慢鬆開了。|關係回到從前。}"), mood: 2 };
  },
  insist(s, ctx, sit) {
    if (/inherit/.test(sit.situation || "")) { s.savings += 1.2; s.flags.estranged = true; return { text: lead(sit) + ctx.w("{堅持拿回自己的份，|一步也不讓，}{錢拿到了，|事情解決了，}{但兄弟姊妹從此很少聯絡。|過年再也聚不齊。}"), mood: -6 }; }
    if (work(sit) && s.employed) {
      if (ctx.roll("career", "good", 0.35)) { s.income *= 1.1; return { text: lead(sit) + "你堅持到底，對方終於讓步。", mood: 3 }; }
      return { text: lead(sit) + ctx.w("{你堅持到底，|一步不讓，}{結果和主管鬧得很僵。|事情沒有解決，你被貼上難搞的標籤。}"), mood: -4 };
    }
    return { text: lead(sit) + ctx.w("{你堅持自己的想法，|沒有讓步，}{對方最後接受了。|吵了好幾次，總算有個結果。}"), mood: 0 };
  },
  cutOff(s, ctx, sit) {
    if (sit.about === "siblings" || /inherit|sibling/.test(sit.situation || "")) s.flags.estranged = true;
    return { text: lead(sit) + ctx.w("{封鎖了對方，|不再聯絡，}{心裡有一塊空了，|眼不見為淨，}{但你不後悔。|日子安靜多了。}"), mood: -3 };
  },
  seekHelp(s, ctx, sit) {
    const sibs = bornSiblings(s, 18);
    const helper = s.friends.length && ctx.rng() < 0.5 ? ctx.rng.pick(s.friends).call : sibs.length ? siblingCall(ctx.rng.pick(sibs)) : "以前的朋友";
    if (work(sit) && !s.employed && ctx.rng.chance(0.5)) return { text: lead(sit) + ctx.w("{打給{helper}，|請{helper}幫忙，}{對方介紹了一份工作：{title}。|幫你牽線，你找到工作：{title}。}", { helper, title: startJob(s, ctx) }), mood: 4 };
    if (love(sit) && s.partner) s.guard = Math.max(s.guard, 2);
    return { text: lead(sit) + ctx.w("找{helper}{商量，|幫忙，}{對方二話不說就來了。|聊完心裡清楚多了。}", { helper }), mood: 2 };
  },
  affair(s, ctx, sit) {
    if (s.rel !== "married" && s.rel !== "dating") return no("你現在沒有另一半。");
    s.crisis = Math.max(s.crisis, 4); s.flags.affair = s.age;
    if (ctx.rng.chance(0.5)) { s.guard = 0; return { text: lead(sit) + ctx.w("{和別人越了線，|走進了一段不該開始的感情，}{沒多久就被{partner}發現了。|{partner}看到手機裡的訊息。}家裡吵翻了天。"), mood: -6, big: true }; }
    return { text: lead(sit) + ctx.w("{和別人越了線，|開始了一段祕密的關係，}{每天都提心吊膽。|心裡的愧疚越來越重。}"), mood: -2 };
  },

  // ---------- health and self ----------
  rest(s, ctx, sit) {
    if (s.employed && /burnout/.test(sit.situation || "")) s.income *= 0.95;
    s.health.stress = Math.max(0, s.health.stress - 0.25);
    if (young(s)) return { text: lead(sit) + ctx.w("{週末什麼都不做，|早點上床睡覺，}{好好睡了一覺。|把自己放空一天。}{精神好多了。|整個人輕鬆不少。}"), mood: 2 };
    return { text: lead(sit) + ctx.w("{請了長假，|什麼都不做，}{好好睡了一個月。|每天睡到自然醒。}{身體慢慢回來了。|整個人都鬆了。}"), mood: 3 };
  },
  travel(s, ctx, sit) {
    if (young(s)) return { text: lead(sit) + ctx.w("{放假時|趁著連假，}{跟家人|全家}去{trip}玩了幾天，{回來時心情輕鬆多了。|拍了好多照片。}"), mood: 3 };
    spend(s, 0.15);
    if (love(sit) && s.partner) s.guard = Math.max(s.guard, 2);
    return { text: lead(sit) + ctx.w("{去{trip}待了幾天，|一個人去{trip}走走，|到{trip}玩了一趟，}{回來時心情輕鬆多了。|拍了好多照片。|好像把自己找回來了。}"), mood: 4 };
  },
  exercise(s, ctx, sit) {
    s.health.fitness = Math.min(1, s.health.fitness + 0.15); s.health.hr = Math.max(0.8, s.health.hr * 0.97); ctx.nudge("health", 0.05);
    const sport = ctx.rng.pick(["跑步", "游泳", "爬山", "騎腳踏車", "上健身房", "打羽球", "跳舞"]);
    return { text: lead(sit) + ctx.w("{開始每天|每週固定三天去}{sport}，{三個月後|半年後}{體力好了很多。|褲子鬆了一號。}", { sport }), mood: 3 };
  },
  seeDoctor(s, ctx, sit) {
    if (s.age >= 40) s.health.checkups = true;
    if (s.health.chronic) s.health.hr = Math.max(0.8, s.health.hr * 0.97);
    s.health.stress = Math.max(0, s.health.stress - 0.1);
    return { text: lead(sit) + ctx.w("{去醫院掛號，|做了一次完整的檢查，}{醫生說要好好照顧自己。|照著醫囑吃藥、回診。}"), mood: 1 };
  },
  quitHabit(s, ctx, sit) {
    s.health.smoke = false; s.health.drink = false; s.health.hr = Math.max(0.8, s.health.hr * 0.97); ctx.nudge("health", 0.05);
    if (young(s)) return { text: lead(sit) + ctx.w("{下定決心不再熬夜，|把{電動|手機遊戲}的時間減半，|改掉挑食的習慣，}{頭幾天很難熬，|一開始渾身不對勁，}{後來精神好多了。|爸媽都看到你的改變。}"), mood: 1 };
    return { text: lead(sit) + ctx.w("{下定決心改掉壞習慣，|把菸酒戒了、作息調正常，}{頭兩個星期很難熬，|一開始渾身不對勁，}{後來越來越有精神。|身體好像年輕了幾歲。}"), mood: 1 };
  },
  vice(s, ctx, sit) {
    if (young(s)) {
      s.health.smoke = true; s.health.hr *= 1.02;
      return { text: lead(sit) + ctx.w("{跟同學學抽菸，|躲在廁所抽了第一根菸，}{嗆得一直咳。|被老師抓到，記了一支警告。|回家前拚命嚼口香糖。}"), mood: -1 };
    }
    s.health.drink = true; s.health.hr *= 1.03;
    return { text: lead(sit) + ctx.w("{每天晚上喝兩杯才睡得著，|用菸酒把煩惱壓下去，}{隔天醒來，問題還在。|身體開始抗議。}"), mood: -1 };
  },
  hobby(s, ctx, sit) {
    spend(s, 0.05); ctx.nudge("curiosity", 0.03);
    const h = ctx.rng.pick(["學吉他", "畫水彩", "攝影", "烘焙", "書法", "種花", "寫作"]);
    return { text: lead(sit) + ctx.w("開始{h}，{每週固定上課。|沒想到一學就停不下來。}", { h }), mood: 3 };
  },
  volunteer(s, ctx, sit) {
    ctx.nudge("warmth", 0.03);
    return { text: lead(sit) + ctx.w("{去{醫院|圖書館|社福機構|淨灘活動}當志工，|每週去幫忙一個下午，}{認識了很多新朋友。|覺得自己還能幫上忙。}"), mood: 3 };
  },
  socialize(s, ctx, sit) {
    const f = ctx.person({ role: "friend", sex: ctx.rng() < 0.5 ? "male" : "female", birthYear: s.birthYear + (young(s) ? 0 : ctx.rng.int(5) - 2), how: young(s) ? "同學" : "聚會" });
    s.friends.push(f);
    if (young(s)) return { text: lead(sit) + ctx.w("{下課主動找同學玩，|參加了社團，}認識了{f}，{很快就變成好朋友。|兩個人常常一起回家。}", { f: f.call }), mood: 3 };
    return { text: lead(sit) + ctx.w("{多參加聚會，|主動約人吃飯，}認識了{f}，{很快就變成可以聊心事的朋友。|兩個人一見如故。}", { f: f.call }), mood: 3 };
  },
  moveHome(s, ctx, sit) {
    const to = moveTo(s, ctx);
    return { text: lead(sit) + ctx.w("{搬到{to}，|在{to}找了新住處，}{開始新的生活。|一切重新開始。}", { to }), mood: 1 };
  },
  emigrate(s, ctx, sit) {
    if (s.savings < 1.5 && !s.employed) return no("存款不夠移民。");
    const where = ctx.rng.weighted([["美國", 2], ["加拿大", 2], ["澳洲", 1.5], ["日本", 1], ["紐西蘭", 0.8], ["新加坡", 0.8]]);
    s.abroad = where; s.leftAt = s.age; s.flags.emigrated = true; spend(s, 1);
    return { text: lead(sit) + ctx.w("{辦好手續，|賣掉大部分家當，}移民到{where}。{在機場和家人抱了好久。|新的國家，新的開始。}", { where }), mood: 2, big: true };
  },
  spiritual(s, ctx, sit) {
    const l = ctx.luckAt(s.age);
    const reason = l && l.reasons.length ? ctx.rng.pick(l.reasons).text.split("：")[1] || "" : "";
    return { text: lead(sit) + ctx.w(reason ? "{去廟裡拜拜，|找算命老師看了命盤，}{老師說今年|籤詩上說}{reason}。{你半信半疑，但心裡安定多了。|心裡踏實了一點。}" : "{去廟裡拜拜，|點了一盞光明燈，}{心裡安定多了。|求了平安符放在皮夾裡。}", { reason }), mood: 2 };
  },
};

export function act(id, s, ctx, sit = {}) {
  const h = HANDLERS[id];
  if (!h) return { text: `${lead(sit)}你照自己的意思去做了。`, mood: 0 };
  const why = tooYoung(id, s);
  return why ? no(why) : h(s, ctx, sit);
}
export const HANDLED = Object.keys(HANDLERS);
export const UNHANDLED = Object.keys(ACTIONS).filter(id => !HANDLERS[id]);
