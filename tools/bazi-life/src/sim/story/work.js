// 工作的故事線：創業、考公職、在職進修。每一條都會跨好幾年，中間有抉擇，結局看選擇和運氣。
//
// Arcs keep their state in s.arcs[id] (ctx.arc.start / at / go / end). A stage fires once its year comes:
// ctx.arc.at(id, stage) is true from s.arcs[id].next on.
import { startJob } from "../world.js";

export const WORK = [
  // ---------- startup ----------
  {
    id: "startupOffer", once: true, domain: "career", channel: "change", ages: [27, 52], when: s => s.employed && s.savings >= 1.5 && !s.arcs.startup, p: () => 0.02,
    choice: (s, ctx) => {
      const kind = ctx.rng.pick(["咖啡店", "早午餐店", "網路商店", "設計工作室", "手搖飲加盟店", "寵物美容店", "補習班", "民宿"]);
      return {
        prompt: `朋友找你一起開一間${kind}，存款也夠撐一陣子。要辭職創業嗎？`,
        options: [
          { id: "startup.go", label: "辭職創業", hint: "全力衝，風險大", act: "startup", style: "risk", weight: 0.22, apply: (s2, c) => { s2.savings -= 1.2; s2.employed = false; s2.unemployedFor = 0; c.arc.start("startup", { kind, partner: true }, 1); return { text: c.w(`辭掉工作，和朋友合開了一間${kind}。{開幕那天，親朋好友送的花擺滿門口。|招牌是你們自己設計的。}`), mood: 4, big: true }; } },
          { id: "startup.side", label: "下班時間先試做", hint: "穩一點", act: "sideJob", style: "safe", weight: 0.18, apply: (s2, c) => { s2.savings -= 0.4; c.arc.start("startup", { kind, side: true }, 1); return { text: `你沒有辭職，下班和假日跟朋友一起顧這間${kind}。`, mood: 1 }; } },
          { id: "startup.invest", label: "出錢不出力", hint: "當股東就好", act: "invest", style: "safe", weight: 0.1, apply: (s2, c) => { s2.savings -= 0.6; s2.flags.stake = { kind, at: s2.age }; return { text: `你出了一筆錢當${kind}的股東，自己繼續上班。`, mood: 1 }; } },
          { id: "startup.learn", label: "先去上創業課", hint: "準備好再說", act: "study", style: "learn", weight: 0.05, apply: (s2, c) => { c.arc.start("study", { kind: "創業課程", from: s2.age }, 1); return { text: `你想先把財務和行銷學起來，報名了創業課程，朋友的${kind}先由他自己開。`, mood: 0 }; } },
          { id: "startup.stay", label: "繼續上班", hint: "穩穩的比較安心", act: "wait", style: "safe", weight: 0.45, apply: () => ({ text: `朋友找你合開${kind}，你想了很久，還是決定繼續上班。`, mood: 0 }) },
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
          { id: "sy1.expand", label: busy ? "開第二家店" : "加碼行銷", hint: "要再投錢", act: "invest", style: "risk", weight: busy ? 0.35 : 0.2, apply: s2 => { s2.debt += 0.8; a.push = (a.push || 0) + (busy ? 0.25 : 0.12); ctx.arc.go("startup", "year2", 1); return { text: busy ? `${kind}生意好，你貸款開了第二家店。` : `你又投了一筆錢做行銷，請網紅來試吃。`, mood: 1 }; } },
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
      const k = s.flags.stake.kind;
      if (ctx.roll("wealth", "good", 0.4)) { s.savings += 1.5; return { text: `當初投資朋友的${k}賺錢了，分紅比本金還多。`, mood: 6 }; }
      return { text: `朋友的${k}收掉了，你投的錢拿不回來，還好友情還在。`, mood: -4 };
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
