// 工作的故事線：創業、考公職、在職進修。每一條都會跨好幾年，中間有抉擇，結局看選擇和運氣。
//
// Arcs keep their state in s.arcs[id] (ctx.arc.start / at / go / end). A stage fires once its year comes:
// ctx.arc.at(id, stage) is true from s.arcs[id].next on.
import { startJob } from "../world.js";

// startupOffer: who brings the idea and what kind of shop it is, so the offer reads differently from life to life.
// `kind` goes on into the storyline (startupYear1, startupYear2's 老闆 title, stakeResult), so it is always the short
// name of a shop or a studio. The friend is one already in the story when there is one. Each scene gives the
// question (`lead`), how its answers go (`verb`, `goEnd`, `side`, `stake`, `later`, `ask`, `stayEnd`) and the
// buttons a scene names its own way (`labels`: option → [label, hint]).
function startupScenes(s, ctx) {
  const pals = s.friends.filter(x => x && x.alive !== false && x.call);
  const pal = pals.length ? ctx.rng.pick(pals) : null;
  const who = pal ? pal.call : ["大學", "科大", "碩士", "博士"].includes(s.edu) ? "大學時的好朋友" : "從小一起長大的好朋友";
  const ta = pal ? (pal.sex === "female" ? "她" : "他") : "對方";
  const f = s.job.field, web = s.year >= 2000;
  const co = ctx.person({ role: "friend", sex: ctx.rng() < 0.5 ? "male" : "female", birthYear: s.birthYear + ctx.rng.int(7) - 3, how: "同事" });
  const cot = co.sex === "female" ? "她" : "他";
  const own = {
    科技: web ? ["軟體工作室", "網路商店"] : ["電腦公司", "軟體工作室"], 設計: ["設計工作室"], 餐飲: ["小餐館", "便當店"], 教育: ["補習班", "安親班"],
    公部門: ["公職補習班"], 營造: ["室內裝修工作室"], 媒體: ["影像工作室"], 零售: ["服飾店"], 觀光: ["旅行社"], 金融: ["記帳事務所"],
    醫療: [s.job.title === "藥師" ? "社區藥局" : "居家護理所"], 製造: ["機械加工廠"], 運輸: ["貨運行"], 業務: web ? ["網路商店"] : ["貿易公司"],
    行銷: web ? ["網路商店", "設計工作室"] : ["廣告工作室"], 法律: ["法律事務所"], 研究: ["顧問公司"], 社福: ["安親班"], 不動產: ["房屋仲介店"],
    服務: [s.job.title === "美髮師" ? "美髮沙龍" : "清潔公司"], 行政: web ? ["網路商店"] : ["貿易公司"],
  }[f] || ["小吃店"];
  const dream = ctx.rng.pick(s.year < 1990 ? ["麵包店", "西餐廳", "冰果室"] : s.year < 2000 ? ["泡沫紅茶店", "咖啡店", "花店"] : s.year < 2010 ? ["咖啡店", "花店", "麵包店"] : ["咖啡店", "早午餐店", "花店", "麵包店"]);
  const trend = ctx.rng.pick(s.year < 1990 ? ["錄影帶出租店", "電腦補習班"] : s.year < 1998 ? ["泡沫紅茶店", "漫畫租書店", "KTV"] : s.year < 2007 ? ["網咖", "手機通訊行", "手搖飲店"] : s.year < 2017 ? ["手搖飲店", "寵物美容店", "早午餐店"] : s.year < 2021 ? ["夾娃娃機店", "寵物美容店", "手搖飲店"] : ["寵物美容店", "手搖飲店", "早午餐店"]);
  const chain = ctx.rng.pick(s.year < 2005 ? ["早餐", "泡沫紅茶"] : ["手搖飲", "早餐", "炸雞"]);
  const corner = ctx.rng.pick(["早餐店", "麵店", "文具店", "自助餐店"]);
  const org = { 公部門: "機關", 教育: "學校", 醫療: "醫院", 法律: "事務所", 社福: "機構" }[f] || "公司";
  const RURAL = ["新竹縣", "苗栗縣", "南投縣", "雲林縣", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"];
  const opened = "{開幕那天，親朋好友送的花擺滿門口。|招牌是你們自己設計的。}";
  return [
    {
      key: "dream", kind: dream, who, ta, lead: `${who}一直想開一間${dream}，{連店名都想好了|看好了一間巷子裡的老房子}，找你一起合夥`,
      labels: { go: ["辭職一起圓夢", "全力衝，風險大"], stay: ["繼續上班", "穩穩的比較安心"] },
      goEnd: opened, side: `{下班和假日|每天下班以後}跟${who}一起顧這間${dream}。`, ask: `合開${dream}`,
      stayEnd: `{${who}說店開了，第一杯請你喝。|你們約好，店開了你一定去捧場。}`,
    },
    !["自營", "家業"].includes(f) && {
      key: "colleague", w: 2, kind: ctx.rng.pick(own), who: `同事${co.call}`, ta: cot, lead: `${org}裡最談得來的同事${co.call}想跳出去自己做，找你一起開一間{kind}`,
      labels: { go: ["一起跳出去做", "全力衝，風險大"], side: ["下班時間先幫忙", "穩一點"], invest: ["出錢當股東", `自己留在${org}`], stay: [`留在${org}`, "穩穩的比較安心"] },
      goEnd: "{開業那天，老同事都送了花來。|第一個月，你們每天都是最後一個離開。}", side: `下班和假日跟${co.call}一起顧這間{kind}。`, ask: "一起出去開{kind}",
      stayEnd: `{${co.call}離職那天，你請${cot}吃了一頓飯。|你留了下來，接手了${co.call}交接的工作。}`,
    },
    s.year >= 1995 && {
      key: "franchise", kind: `${chain}加盟店`, who, ta, lead: `${who}去逛了加盟展，帶回一疊${chain}加盟的資料，說兩個人合開回本比較快`,
      labels: { go: ["辭職去開加盟店", "全力衝，加盟金不便宜"], side: ["下班時間去顧店", "穩一點"], invest: ["出一半加盟金當股東", "店讓朋友顧"], learn: ["先去上創業課", "把帳算清楚再說"], stay: ["繼續上班", "加盟展的話聽聽就好"] },
      goEnd: "{總部派人來教了兩個星期。|開幕那天，門口排了一條長長的隊伍。}", side: `{下班和假日|每天晚上}去店裡跟${who}輪班。`, stake: `你出了一半的加盟金，當${chain}加盟店的股東，店交給${who}顧，自己繼續上班。`, ask: "合開加盟店",
      stayEnd: `{你把那疊加盟資料還給了${who}。|你算了算加盟金，還是覺得太冒險。}`,
    },
    {
      key: "takeover", kind: corner, who, ta, lead: `巷口那間開了{二十|三十}年的${corner}，老闆要退休了，想把店頂讓出去，${who}約你一起接手`, verb: "接手了巷口那間",
      labels: { go: ["辭職接手這間店", "全力衝，風險大"], side: ["假日先去店裡幫忙", "穩一點"], invest: ["出一半頂讓金當股東", "店讓朋友顧"], stay: ["繼續上班", "穩穩的比較安心"] },
      goEnd: "{老闆把做了幾十年的配方一樣一樣教給你們。|熟客說味道沒變，你們才鬆了一口氣。}", side: `假日就去店裡幫${who}的忙，跟老闆學做生意。`, stake: `你出了一半的頂讓金，當那間${corner}的股東，店交給${who}顧，自己繼續上班。`,
      later: `巷口那間${corner}先由${who}自己接手。`, ask: `一起接手那間${corner}`,
      stayEnd: `{後來那間店換了新老闆，你偶爾還是會去吃。|你跟老闆說，謝謝這些年的照顧。}`,
    },
    s.year >= 2005 && {
      key: "online", kind: "網路商店", who, ta, lead: `${who}在${s.year >= 2015 ? "網路上" : "拍賣網站上"}賣{手工皂|自己烘的咖啡豆|進口零食|手作飾品}，訂單多到忙不過來，想找你一起做成一間網路商店`,
      labels: { go: ["辭職全心做網店", "全力衝，風險大"], side: ["下班後先幫忙出貨", "穩一點"], stay: ["繼續上班", "穩穩的比較安心"] },
      goEnd: "{客廳堆滿了紙箱和泡泡紙。|你們租了一間小倉庫，每天打包到半夜。}", side: `每天下班後幫${who}打包出貨，{週末一起拍商品照。|客廳堆滿了紙箱。}`, later: `網路商店先由${who}自己做。`, ask: "一起做網路商店",
      stayEnd: `{${who}後來自己請了一個工讀生幫忙出貨。|你下單買了一份，當作支持。}`,
    },
    s.year >= 2002 && RURAL.includes(s.county) && {
      key: "bnb", kind: "民宿", who, ta, lead: `${who}在${s.county}鄉下的老家有一棟空著的透天厝，想改成民宿，找你一起出錢出力`,
      labels: { go: ["辭職一起經營民宿", "全力衝，風險大"], side: ["放假時過去幫忙", "穩一點"], invest: ["出整修的錢當股東", "民宿讓朋友顧"], stay: ["繼續上班", "放假再去住就好"] },
      goEnd: "{你們花了半年把老房子整修好。|第一組客人在留言本上畫了一張笑臉。}", side: `放假時就過去幫忙打掃、接待客人，{平日由${who}顧。|訂房的電話都轉到${who}那裡。}`, stake: "你出了一筆整修的錢，當民宿的股東，自己繼續上班。", ask: "合開民宿",
      stayEnd: `{你說等民宿開了，一定去住一晚。|${who}說房間會幫你留著。}`,
    },
    {
      key: "trend", kind: trend, who, ta, lead: `${who}說現在最流行的就是${trend}，{街上一間接一間開|開一間賺一間}，找你一起合開一間`,
      labels: { stay: ["繼續上班", "流行來得快，去得也快"] },
      goEnd: opened, side: `{下班和假日|每天下班以後}跟${who}一起顧這間${trend}。`, ask: `合開${trend}`,
      stayEnd: "{你說流行的東西來得快、去得也快。|後來看到那種店一間一間開，你心裡還是有點癢。}",
    },
  ];
}

export const WORK = [
  // ---------- startup ----------
  {
    id: "startupOffer", once: true, domain: "career", channel: "change", ages: [27, 52], when: s => s.employed && s.savings >= 1.5 && !s.arcs.startup, p: () => 0.02,
    choice: (s, ctx) => {
      // Who brings the idea and what kind of shop it is, see startupScenes; only the wording changes with it.
      const pool = startupScenes(s, ctx).filter(Boolean);
      const sc = ctx.rng.weighted(pool.map(x => [x, x.w ?? 1])), { kind, who, ta } = sc, title = s.job.title;
      const lead = ctx.w(sc.lead, { kind });
      const btn = (key, label, hint) => { const [l, h] = (sc.labels && sc.labels[key]) || [label, hint]; return { label: l, hint: h }; };
      return {
        prompt: `${lead}。你的存款也夠撐一陣子，要辭職創業嗎？`,
        options: [
          { id: "startup.go", ...btn("go", "辭職創業", "全力衝，風險大"), act: "startup", style: "risk", weight: 0.22, apply: (s2, c) => { s2.savings -= 1.2; s2.employed = false; s2.unemployedFor = 0; c.arc.start("startup", { kind, partner: true }, 1); return { text: c.w(`你和${who}${sc.verb || "合開了一間"}${kind}，辭掉了${title}的工作。${sc.goEnd}`), mood: 4, big: true }; } },
          { id: "startup.side", ...btn("side", "下班時間先試做", "穩一點"), act: "sideJob", style: "safe", weight: 0.18, apply: (s2, c) => { s2.savings -= 0.4; c.arc.start("startup", { kind, side: true }, 1); return { text: c.w(`你沒有辭職，${sc.side}`, { kind }), mood: 1 }; } },
          { id: "startup.invest", ...btn("invest", "出錢不出力", "當股東就好"), act: "invest", style: "safe", weight: 0.1, apply: (s2, c) => { s2.savings -= 0.6; s2.flags.stake = { kind, at: s2.age, who }; return { text: sc.stake || `你出了一筆錢當${who}那間${kind}的股東，自己繼續上班。`, mood: 1 }; } },
          { id: "startup.learn", ...btn("learn", "先去上創業課", "準備好再說"), act: "study", style: "learn", weight: 0.05, apply: (s2, c) => { c.arc.start("study", { kind: "創業課程", from: s2.age }, 1); return { text: `你想先把財務和行銷學起來，報名了創業課程，${sc.later || `${who}的${kind}先由${ta}自己開。`}`, mood: 0 }; } },
          { id: "startup.stay", ...btn("stay", "繼續上班", "穩穩的比較安心"), act: "wait", style: "safe", weight: 0.45, apply: (s2, c) => ({ text: c.w(`${who}找你${sc.ask}，你想了很久，還是決定繼續上班。${sc.stayEnd}`, { kind }), mood: 0 }) },
        ],
      };
    },
  },
  {
    id: "startupYear1", domain: "wealth", channel: "change", when: (s, ctx) => ctx.arc.at("startup", "start"),
    p: () => 1,
    choice: (s, ctx) => {
      const a = s.arcs.startup.data, kind = a.kind;
      const busy = ctx.roll("wealth", "good", 0.45);
      return {
        prompt: busy ? `${kind}開了一年，客人越來越多，但人手不夠、你每天忙到半夜。接下來呢？` : `${kind}開了一年，生意普通，每個月都在燒錢。接下來呢？`,
        options: [
          { id: "sy1.expand", label: busy ? "開第二家店" : "加碼行銷", hint: "要再投錢", act: "invest", style: "risk", weight: busy ? 0.35 : 0.2, apply: s2 => { s2.debt += 0.8; a.push = (a.push || 0) + (busy ? 0.25 : 0.12); ctx.arc.go("startup", "year2", 1); return { text: busy ? `${kind}生意好，你貸款開了第二家店。` : `你又投了一筆錢做行銷，${s.year >= 2015 ? (/咖啡|早午餐|早餐|麵|便當|飲|紅茶|炸雞|冰果|西餐|餐館|小吃/.test(kind) ? "請網紅來試吃" : "請網紅來介紹") : s.year >= 2000 ? "架了網站、印了一大疊傳單" : "在報紙上登廣告、印了一大疊傳單"}。`, mood: 1 }; } },
          { id: "sy1.hold", label: "穩穩經營", hint: "先不冒險", act: "pushThrough", style: "safe", weight: 0.4, apply: s2 => { a.push = (a.push || 0) + 0.05; ctx.arc.go("startup", "year2", 1); return { text: ctx.w(`${kind}{維持現在的規模|先不擴張}，你把心力放在{品質|老客人}上。`), mood: 0 }; } },
          { id: "sy1.pivot", label: "轉型", hint: "換個做法", act: "careerSwitch", style: "learn", weight: busy ? 0.05 : 0.2, apply: s2 => { a.push = (a.push || 0) + 0.1; a.kind = `${kind}（轉型後）`; ctx.arc.go("startup", "year2", 1); return { text: ctx.w(`你決定讓${kind}轉型，{改做外送和網購。|改成預約制。|增加課程和活動。}`), mood: 1 }; } },
          { id: "sy1.close", label: "收掉，停損", hint: "認賠回去上班", act: "quitJob", style: "safe", weight: busy ? 0.05 : 0.25, apply: (s2, c) => { ctx.arc.end("startup", "closed"); s2.savings = Math.max(0, s2.savings - 0.3); return { text: `${kind}收掉了，你算了算，賠的錢還在可以接受的範圍。`, mood: -5 }; } },
        ],
        // A written answer moves the story on too: giving up closes the shop, anything else carries on into year two.
        onFree: id => (["quitJob", "jobSearch", "jobHop", "careerSwitch", "civilService", "sellAsset", "retire", "workAbroad", "emigrate"].includes(id) ? ctx.arc.end("startup", "closed") : ctx.arc.go("startup", "year2", 1)),
      };
    },
  },
  {
    id: "startupYear2", domain: "wealth", channel: "change", when: (s, ctx) => ctx.arc.at("startup", "year2"), p: () => 1,
    apply: (s, ctx) => {
      const a = s.arcs.startup.data;
      const good = ctx.roll("wealth", "good", 0.35 + (a.push || 0));
      if (good) {
        ctx.arc.end("startup", "success");
        s.income = Math.max(s.income, 1.2) * 1.6; s.savings += 2.5; s.career = Math.min(5, s.career + 2); s.employed = true;
        s.job = { title: `${a.kind.replace(/（轉型後）/, "")}老闆`, factor: 1.6, field: "自營", since: s.age };
        return { text: ctx.w(`{撐過了最難的頭幾年，|口碑慢慢傳開，}${a.kind.replace(/（轉型後）/, "")}的生意越做越好，{你終於可以準時下班了。|開始有人來問加盟。}`), mood: 12, big: true };
      }
      ctx.arc.end("startup", "failed");
      s.savings = Math.max(0, s.savings - 1);
      if (!s.retired) { s.employed = false; s.unemployedFor = 1; }
      if (a.side) { s.employed = true; s.unemployedFor = 0; return { text: `${a.kind}撐不下去，收掉了。還好你沒辭職，賠的錢慢慢還。`, mood: -6 }; }
      return { text: ctx.w(`${a.kind}撐不下去，{收掉了，還背了一些債。|最後一天營業，老客人來跟你道別。}`), mood: -12, big: true };
    },
  },
  {
    id: "stakeResult", once: true, domain: "wealth", channel: "change", when: s => s.flags.stake && s.age - s.flags.stake.at >= 3, p: () => 0.5,
    apply: (s, ctx) => {
      const k = s.flags.stake.kind, who = s.flags.stake.who || "朋友";
      if (ctx.roll("wealth", "good", 0.4)) { s.savings += 1.5; return { text: `當初投資${who}的${k}賺錢了，分紅比本金還多。`, mood: 6 }; }
      return { text: `${who}的${k}收掉了，你投的錢拿不回來，還好交情還在。`, mood: -4 };
    },
  },

  // ---------- civil service exam ----------
  {
    id: "civilExam", domain: "career", channel: "good", when: (s, ctx) => ctx.arc.at("civil", "start"), p: () => 1,
    choice: (s, ctx) => {
      const a = s.arcs.civil.data;
      a.tries += 1;
      const pass = ctx.roll("career", "good", 0.25 + 0.1 * a.tries);
      if (pass) {
        ctx.arc.end("civil", "passed");
        s.employed = true; s.unemployedFor = 0; s.studying = false;
        s.job = { title: "公務員", factor: 1.0, field: "公部門", since: s.age }; s.income = Math.max(s.income, 0.95);
        return { prompt: "", options: [{ id: "civil.pass", label: "去報到", apply: () => ({ text: ctx.w(`準備了 ${a.tries} 年，{放榜那天在網路上看到自己的名字，|收到錄取通知，}{你叫出聲來。|你打電話給家人，聲音在抖。}考上公務員了。`), mood: 10, big: true }) }] };
      }
      return {
        prompt: `公職考試放榜，差了幾分沒考上（第 ${a.tries} 次）。要再考一次嗎？`,
        options: [
          { id: "civil.again", label: "再拚一年", hint: "離目標很近了", act: "civilService", style: "risk", weight: a.tries < 3 ? 0.55 : 0.2, apply: () => { ctx.arc.go("civil", "start", 1); return { text: "差幾分沒考上。你把錯的題目整理成一本筆記，再拚一年。", mood: -3 }; } },
          { id: "civil.cram", label: "去補習班衝刺", hint: "花錢，但讀得比較有方向", act: "study", style: "learn", weight: 0.12, apply: s2 => { s2.savings = Math.max(0, s2.savings - 0.15); ctx.arc.go("civil", "start", 1); return { text: "差幾分沒考上。你報名了補習班的衝刺班，每天從早讀到晚。", mood: -2 }; } },
          { id: "civil.switch", label: "改考別的類科", hint: "錄取率比較高", act: "civilService", style: "safe", weight: 0.08, apply: () => { ctx.arc.go("civil", "start", 1); return { text: "差幾分沒考上。你研究了各類科的錄取率，改考另一個類科。", mood: -2 }; } },
          { id: "civil.work", label: "邊工作邊考", hint: "有收入比較安心", act: "jobSearch", style: "safe", weight: 0.3, apply: s2 => { if (!s2.employed) startJob(s2, ctx); ctx.arc.go("civil", "start", 1); return { text: "差幾分沒考上。你先找了工作，晚上和週末繼續讀。", mood: -2 }; } },
          { id: "civil.quit", label: "放棄，回去找工作", hint: "換條路走", act: "jobSearch", style: "safe", weight: a.tries < 3 ? 0.15 : 0.5, apply: s2 => { ctx.arc.end("civil", "gaveUp"); return { text: "差幾分沒考上。你決定放棄公職，回到一般的工作。", mood: -4 }; } },
        ],
        // A written answer: studying on (or waiting) means another try next year; any other path gives the exam up.
        onFree: id => (["civilService", "study", "pushThrough", "wait", "sideJob", "rest", "spiritual"].includes(id) ? ctx.arc.go("civil", "start", 1) : ctx.arc.end("civil", "gaveUp")),
      };
    },
  },

  // ---------- study while working ----------
  {
    id: "studyDone", domain: "study", channel: "good", when: (s, ctx) => ctx.arc.at("study", "start"), p: () => 1,
    apply: (s, ctx) => {
      const a = s.arcs.study.data;
      ctx.arc.end("study", "done");
      if (a.kind === "研究所" && ["大學", "科大"].includes(s.edu)) s.edu = "碩士";
      if (s.employed && ctx.roll("career", "good", 0.5)) { s.income *= 1.1; s.career = Math.min(5, s.career + 1); return { text: ctx.w(`讀完${a.kind}，{拿到證書那天，你拍照傳給家人。|學到的東西馬上用在工作上，}主管{看在眼裡，|注意到了，}幫你調了薪。`), mood: 6 }; }
      if (!s.employed && ctx.roll("career", "good", 0.6)) return { text: ctx.w(`讀完${a.kind}，用新學的本事找到工作：{title}。`, { title: startJob(s, ctx) }), mood: 6 };
      return { text: ctx.w(`讀完${a.kind}，{雖然工作沒有馬上改變，|累了一年多，}但你覺得自己{多了一些底氣。|又往前走了一步。}`), mood: 3 };
    },
  },
];
