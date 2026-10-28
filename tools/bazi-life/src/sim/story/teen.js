// 青少年（12–18 歲）：補習、選組、社團、叛逆、初戀、告白、畢業旅行、追星、第一支手機、沉迷、考試壓力、
// 段考作弊、被誤會、當幹部、筆友和網友、比賽、服儀、排擠、照顧弟妹……
//
// 機率都是假設：這些事沒有官方統計，每個事件一年的機率大多在 0.04–0.15，再用 once / max / cooldown 限制次數，
// 讓一段青春期平均有五、六件故事，其中三件左右要做選擇。選組（高中生每人都要選）是唯一必定發生的，排在最前面。
// 常見的抉擇有好幾種情境（sceneOf）：先看年代、年級、家裡的情形挑出合適的，再隨機選一個，問題、按鈕和結果都從
// 同一個情境寫出來，重玩時同一個抉擇會換一個樣子出現。
// 這裡不改學歷和升學路線（會考、學測在 core.js），也不碰交往狀態：青春期的戀愛只留在故事和記憶裡，
// 不會改變 core.js 依統計校準的交往、初婚年齡。
//
// The probabilities are assumptions (no statistics exist for these events), set so the teenage years hold five or
// six of them, about three of them choices; 選組 is the one every 高中 student meets, so it comes first. The
// frequent choices come in several scenes (sceneOf), and the prompt, the buttons and the results are written from the
// same scene. Nothing here changes the school track or s.rel, so the calibrated schooling, dating and marriage figures
// stay as they are.
//
// Left for later modules:
//   s.flags.major        "自然組" | "社會組" (高中 students), with s.flags.majorWhy (self, interest, parents, friend, test;
//                        unknown when the player answered in their own words)
//   s.flags.club, s.flags.cram, s.flags.parttime, s.flags.careerView, s.flags.firstLove ({ name, together, way })
//   s.flags.cadre        the class or club job you took on (班長, 風紀股長, 社長, 隊長, 總召, 畢冊總編輯, 學生會長)
//   memory kinds "crush" ({ name, call, sex }: the first love) and "admirer" (someone who confessed to you)
import { exam15Name, exam18Name, COUNTIES, bornSiblings } from "../world.js";
import { pronoun, keptForPartner } from "../people.js";
import { siblingCall } from "../words.js";
import { bestFriend, friendName, makeFriend, grownUp, liveWith, youngerSibs, homeMoney, snackOf, pad } from "./child.js";

// ---------- helpers ----------
const inSchool = s => s.studying && !s.abroad && ["國中", "高中", "高職", "五專"].includes(s.track);
const senior = s => s.studying && !s.abroad && ["高中", "高職", "五專"].includes(s.track);
// From the last year of primary school on: the questions about classmates and class jobs start at 12.
const pupil = s => s.studying && !s.abroad && ["國小", "國中", "高中", "高職", "五專"].includes(s.track);
// The next big exam: 會考 (or its earlier names) in junior high, 學測 in senior high, 統測 (from 2001) in vocational.
const nextExam = s => (s.track === "國中" ? exam15Name(s.year + Math.max(1, 15 - s.age)) : exam18Name(s.year + 1, s.track));
// What music played on: the radio, then a 隨身聽 (cassette, CD or MP3), then the phone.
const player = y => (y < 1980 ? "收音機" : y < 2011 ? "隨身聽" : "手機");
// How a teenager got a message to a friend.
const sendTo = y => (y < 1990 ? "寫了一張紙條給" : y < 2000 ? "打電話給" : y < 2005 ? "傳簡訊給" : y < 2011 ? "在 MSN 上敲" : "傳 LINE 給");
const comfortFood = ctx => ctx.rng.pick(["牛肉麵", "滷肉飯", "綠豆湯", "鹹酥雞"]);
// A word with Latin letters gets a space where it meets Chinese text (child.js pad); English needs none.
const padded = (ctx, w) => (ctx.lang === "en" ? w : pad(w));
// One situation for a question, out of those that fit this life (a scene with w: 0 does not), then at random.
const sceneOf = (ctx, list) => ctx.rng.weighted(list.filter(x => (x.w ?? 1) > 0).map(x => [x, x.w ?? 1]));
// Someone in class for one scene; they join s.friends only if the story makes you friends (befriend).
const classmate = (s, ctx, same = 0.6) => ctx.person({ role: "friend", sex: ctx.rng() < same ? s.sex : s.sex === "male" ? "female" : "male", birthYear: s.birthYear, how: "同學" });
function befriend(s, ctx, p) {
  if (!s.friends.includes(p)) s.friends.push(p);
  if (!bestFriend(s)) { s.flags.bff = p.id; p.bond = 0.7; ctx.remember("bestFriend", p.call, { name: p.call, call: p.call, sex: p.sex }); }
  return p;
}
// Who checks hair and uniforms: 訓導主任 (生教組長 once 訓導處 became 學務處 in 1999) up to junior high, 教官 in senior
// high until they left the schools in 2023; and the office you are sent to.
const officerOf = s => (["國小", "國中"].includes(s.track) ? (s.year < 1999 ? "訓導主任" : "生教組長") : s.year < 2023 ? "教官" : "學務主任");
const officeOf = s => (["國小", "國中"].includes(s.track) ? (s.year < 1999 ? "訓導處" : "學務處") : s.year < 2023 ? "教官室" : "學務處");
// Younger brothers and sisters of primary school age (4 to 11), the ones a teenager is asked to look after.
const littleSibs = s => youngerSibs(s, 4).filter(x => s.age - x.bornAt <= 11);
const stressBy = (s, d) => { s.health.stress = Math.max(0, Math.min(1, s.health.stress + d)); };

// Who teenagers were fans of, by year. Names only where the dates are sure (鄧麗君 from the late 1960s, 校園民歌
// 1977–85, 小虎隊 1988–92, 四大天王 from 1992, 張惠妹 from 1996, 五月天 from 1999, 周杰倫 from 2000, S.H.E and F4
// from 2001, 飛輪海 from 2005); later years stay generic.
function idolOf(y, ctx) {
  const pick = list => ctx.rng.pick(list), named = n => ({ who: n, again: n });
  const one = (who, again) => ({ who, again });
  if (y < 1950) return pick([one("歌仔戲班的一位小生", "那位小生"), one("收音機裡的一位歌星", "那位歌星")]);
  if (y < 1968) return one("收音機裡的一位歌星", "那位歌星");
  if (y < 1977) return named("鄧麗君");
  if (y < 1986) return pick([one("校園民歌", "民歌手們"), named("劉文正"), named("鳳飛飛")]);
  if (y < 1993) return y >= 1988 ? pick([named("小虎隊"), one("一位偶像歌手", "那位歌手")]) : one("一位偶像歌手", "那位歌手");
  if (y < 2000) return pick([named("四大天王"), y >= 1997 ? named("張惠妹") : one("一位日本偶像", "那位偶像")]);
  if (y < 2009) return pick([named(y >= 2001 ? "周杰倫" : "張惠妹"), named("五月天"), named(y >= 2005 ? "飛輪海" : y >= 2001 ? "F4" : "五月天"), named(y >= 2001 ? "S.H.E" : "張惠妹")]);
  if (y < 2026) return pick([named("五月天"), one("一個韓國偶像團體", "他們"), one("一個獨立樂團", "他們")]);
  return one("一個當紅的偶像團體", "他們");
}

// What a teenager could lose whole nights to, by year (租書店 novels and comics, arcades, consoles, 天堂 from 2000,
// 楓之谷 from 2005, 英雄聯盟 from 2011, 傳說對決 from 2017, short videos from 2019).
function hookOf(y, ctx) {
  const pick = list => ctx.rng.pick(list);
  if (y < 1980) return { thing: "租書店的武俠小說", verb: "看", quit: "把租來的書全部還回去", craft: "自己動筆寫武俠小說" };
  if (y < 1990) return pick([{ thing: "租書店的漫畫", verb: "看", quit: "把租來的漫畫全部還回去", craft: "自己畫漫畫" }, { thing: "電動玩具店的大型電玩", verb: "打", quit: "再也不踏進電動玩具店", craft: "研究電動是怎麼寫出來的" }]);
  if (y < 2000) return pick([{ thing: "電視遊樂器", verb: "打", quit: "把遊戲機收進櫃子", craft: "學寫程式做小遊戲" }, y >= 1995 ? { thing: "電腦遊戲《仙劍奇俠傳》", verb: "玩", quit: "把遊戲光碟送給同學", craft: "學寫程式做小遊戲" } : { thing: "租書店的漫畫", verb: "看", quit: "把租來的漫畫全部還回去", craft: "自己畫漫畫" }]);
  if (y < 2005) return { thing: "線上遊戲《天堂》", verb: "玩", quit: "把帳號送給同學", craft: "學做網頁" };
  if (y < 2011) return y < 2010 ? { thing: "線上遊戲《楓之谷》", verb: "玩", quit: "把帳號送給同學", craft: "學寫程式" } : { thing: "線上遊戲", verb: "玩", quit: "把遊戲刪掉", craft: "學寫程式" };
  if (y < 2017) return { thing: "線上遊戲《英雄聯盟》", verb: "打", quit: "把遊戲刪掉", craft: "參加電競社" };
  if (y < 2026) return pick([{ thing: "手遊《傳說對決》", verb: "打", quit: "把手遊刪掉", craft: "參加電競社" }, ...(y >= 2019 ? [{ thing: "手機上的短影音", verb: "滑", quit: "把 App 刪掉", craft: "自己拍影片" }] : [])]);
  return pick([{ thing: "線上遊戲", verb: "玩", quit: "把遊戲刪掉", craft: "參加電競社" }, { thing: "手機上的短影音", verb: "滑", quit: "把 App 刪掉", craft: "自己拍影片" }]);
}

// The graduation trip: one set of sentences for each school (國小 at 12, 國中, then 高中 or 高職), so the second trip of
// a life draws from a fresh set, as when the school was written into each sentence.
const TRIP_TEXT = {
  國小: [
    "國小畢業旅行去{place}，{{ride}，和{pal}拍了一張好醜的合照。|晚上在{room}的房間玩撲克牌到半夜，被老師查房抓個正著。|一路玩到忘了時間，回來的時候曬黑了一圈。}",
    "國小畢業旅行的最後一晚，{大家在房間裡聊到天亮，|{night}}{有人哭了，說捨不得畢業。|你把那一晚記得好清楚。}",
    "國小畢業旅行去{place}，{你把零用錢全拿去買紀念品給家人，|第一次離家睡在外面，興奮得睡不著，}{{photo}。|回家時{who}在校門口等你。}",
  ],
  國中: [
    "國中畢業旅行去{place}，{{ride}，和{pal}拍了一張好醜的合照。|晚上在{room}的房間玩撲克牌到半夜，被老師查房抓個正著。|一路玩到忘了時間，回來的時候曬黑了一圈。}",
    "國中畢業旅行的最後一晚，{大家在房間裡聊到天亮，|{night}}{有人哭了，說捨不得畢業。|你把那一晚記得好清楚。}",
    "國中畢業旅行去{place}，{你把零用錢全拿去買紀念品給家人，|第一次離家睡在外面，興奮得睡不著，}{{photo}。|回家時{who}在校門口等你。}",
  ],
  高中: [
    "高中畢業旅行去{place}，{{ride}，和{pal}拍了一張好醜的合照。|晚上在{room}的房間玩撲克牌到半夜，被老師查房抓個正著。|一路玩到忘了時間，回來的時候曬黑了一圈。}",
    "高中畢業旅行的最後一晚，{大家在房間裡聊到天亮，|{night}}{有人哭了，說捨不得畢業。|你把那一晚記得好清楚。}",
    "高中畢業旅行去{place}，{你把零用錢全拿去買紀念品給家人，|第一次離家睡在外面，興奮得睡不著，}{{photo}。|回家時{who}在校門口等你。}",
  ],
  高職: [
    "高職畢業旅行去{place}，{{ride}，和{pal}拍了一張好醜的合照。|晚上在{room}的房間玩撲克牌到半夜，被老師查房抓個正著。|一路玩到忘了時間，回來的時候曬黑了一圈。}",
    "高職畢業旅行的最後一晚，{大家在房間裡聊到天亮，|{night}}{有人哭了，說捨不得畢業。|你把那一晚記得好清楚。}",
    "高職畢業旅行去{place}，{你把零用錢全拿去買紀念品給家人，|第一次離家睡在外面，興奮得睡不著，}{{photo}。|回家時{who}在校門口等你。}",
  ],
};

export const TEEN = [
  {
    // 高一下學期選組：每個高中生都要選，記在 s.flags.major。排在最前面，同一年別的青春期抉擇不會把它擠掉。
    // 情境：選組單、下課的討論、家人在問、數學考壞了、畢業的學長姊回校分享（1980 年起）、死黨問你（高二要重新分班）。
    id: "t_major", domain: "study", channel: "change", once: true, ages: [15, 18], p: () => 1,
    when: s => s.studying && !s.abroad && s.track === "高中" && s.age === (s.flags.trackAt ?? 15) + 1,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), f = bestFriend(s);
      const sc = sceneOf(ctx, [
        { lead: y >= 1975 ? "輔導老師發下了選組單" : "導師發下了選組單" },
        { lead: "下課時大家都在討論要選哪一組" },
        { lead: ctx.f("{who}已經在問你的打算", { who }) },
        { lead: ctx.rng.pick(["這次段考的數學你只考了三十八分", "這次段考的數學你只考了四十一分", "這次段考的數學你只考了二十九分"]), sci: ["還是選自然組", "數學再拚就追得上", "還是選了自然組"], soc: ["改選社會組", "國文和歷史比較拿手", "改選了社會組"] },
        { lead: "學校請畢業的學長姊回來分享，自然組和社會組的人各說各的好", w: y >= 1980 ? 1 : 0, sci: ["自然組", "學長說理工的出路廣", "選了自然組"], soc: ["社會組", "學姊說文法商一樣精采", "選了社會組"] },
        { lead: f ? ctx.f("{pal}一直問你要選哪一組，說高二要照組別重新分班", { pal: f.call }) : "死黨一直問你要選哪一組，說高二要照組別重新分班", w: f ? 1 : 0 },
      ]);
      const sci = sc.sci || ["自然組", "理工、醫藥、生科", "選了自然組"], soc = sc.soc || ["社會組", "文、法、商、傳播", "選了社會組"];
      const lead = ctx.f("高一下學期要選組了，{lead}", { lead: sc.lead });
      const set = (s2, major, how) => { s2.flags.major = major; s2.flags.majorWhy = how; return major; };
      // About six in ten 高中 students end up in 自然組 (an assumption close to recent years).
      const draw = (c, science) => (c.rng() < science ? "自然組" : "社會組");
      // A provisional stream, so later modules find one even when the player answers in their own words.
      set(s, draw(ctx, 0.58), "unknown");
      return {
        prompt: ctx.f("{lead}。要選哪一組？", { lead }),
        options: [
          { id: "t_major.science", label: sci[0], hint: sci[1], act: "study", style: "safe", weight: 0.35, apply: (s2, c) => { set(s2, "自然組", "self"); return { text: c.w("{lead}。你{chose}，{物理和化學課本疊起來比磚頭還厚。|第一次段考，數學難到全班都在哀號。|你開始覺得實驗課是一週最好玩的時間。}", { lead, chose: sci[2] }), mood: 1 }; } },
          { id: "t_major.social", label: soc[0], hint: soc[1], act: "study", style: "learn", weight: 0.25, apply: (s2, c) => { set(s2, "社會組", "self"); return { text: c.w("{lead}。你{chose}，{開始背歷史年表和地理圖，|國文課變成你最期待的一堂，}{有親戚說社會組以後不好找工作，你笑笑沒回答。|你發現自己很會寫作文。}", { lead, chose: soc[2] }), mood: 1 }; } },
          { id: "t_major.heart", label: "跟著興趣走", hint: "選自己喜歡的", act: "insist", style: "self", weight: 0.15, apply: (s2, c) => { const m = set(s2, draw(c, ["art", "piano", "calligraphy"].includes(s2.flags.talent) ? 0.3 : 0.55), "interest"); const t = !sc.sci || sc.sci[0] !== "還是選自然組" ? "{lead}。你想了很久，照著自己的興趣選了{m}，{雖然有人說你選錯了，|就算那不是你分數最好的科目，}{你覺得每天上課都很有意思。|你知道自己為什麼坐在這裡。}" : m === "自然組" ? "{lead}。你想了很久，照著自己的興趣選了{m}，{雖然數學考成這樣，|就算大家都勸你再想想，}{你覺得每天上課都很有意思。|你知道自己為什麼坐在這裡。}" : "{lead}。你想了很久，照著自己的興趣選了{m}，{你早就知道自己喜歡的是文科，|數學考不好反而讓你下定了決心，}{你覺得每天上課都很有意思。|你知道自己為什麼坐在這裡。}"; return { text: c.w(t, { lead, m }), mood: 2 }; } },
          { id: "t_major.parents", label: ctx.f("聽{who}的", { who }), hint: "家人比較有經驗", act: "talk", style: "family", weight: 0.1, apply: (s2, c) => { const m = set(s2, draw(c, 0.8), "parents"); return { text: c.w("{lead}。你聽了{who}的建議，選了{m}。{{who}說{why}。|{who}鬆了一口氣，你也是。}{你心裡還是有點不確定。|你決定先試試看。}", { lead, who, m, why: m === "自然組" ? "這樣以後比較好找工作" : "你的國文一直比數學好" }), mood: 0 }; } },
          { id: "t_major.friend", label: f ? ctx.f("跟{pal}選同一組", { pal: f.call }) : "跟死黨選同一組", hint: "至少有人作伴", act: "socialize", style: "social", weight: 0.08, when: () => !!f, apply: (s2, c) => { const m = set(s2, draw(c, 0.55), "friend"); return { text: c.w("{lead}。你和{pal}說好一起選{m}，{結果被分到同一班，兩個人高興得跳起來。|結果被分到不同班，下課還是黏在一起。}", { lead, pal: f.call, m }), mood: 2 }; } },
          { id: "t_major.test", label: "先做性向測驗", hint: "問問輔導老師", act: "counsel", style: "learn", weight: 0.07, when: () => s.year >= 1975, apply: (s2, c) => { const m = set(s2, draw(c, 0.55), "test"); return { text: c.w("{lead}。你去找輔導老師做了性向測驗，{結果說你適合{m}，|老師陪你看了好多科系的介紹，}{你就照著選了{m}。|最後選了{m}，心裡比較踏實。}", { lead, m }), mood: 1 }; } },
        ],
      };
    },
  },
  {
    // 補習。情境：段考成績單、同學都去補、校門口的試聽券（1975 年起）、親戚考上第一志願、老師家的輔導班（1985 年以前）、
    // 家裡手頭緊、五專的專業科目跟不上。
    id: "t_cram", domain: "study", channel: "change", once: true, ages: [13, 17], when: inSchool, p: () => 0.12,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), five = s.track === "五專", tight = homeMoney(s, ctx) === "tight";
      const where = y < 1980 ? "數學老師家" : s.county === "臺北市" ? "南陽街的補習班" : "火車站附近的補習班";
      const cousin = ctx.rng.pick(["表哥", "表姊", "堂哥", "堂姊"]), cta = cousin.endsWith("哥") ? "他" : "她", subj = ctx.rng.pick(["微積分", "專業科目"]);
      const fee = y < 1970 ? "一百多塊" : y < 1980 ? "五百多塊" : y < 1990 ? "兩千多塊" : y < 2005 ? "四千多塊" : "六千多塊";
      const sc = sceneOf(ctx, [
        { key: "report", w: five ? 1 : 2, lead: ctx.f("{when}，{who}問你要不要去補習", { when: ctx.rng.pick(["段考成績單發下來", ...(five ? [] : [ctx.f("離{exam}越來越近", { exam: nextExam(s) })])]), who }), ask: "要怎麼辦？" },
        { key: "peers", w: five ? 0 : 2, lead: "班上一半的同學放學都去補習了，下課聊的全是補習班老師的笑話", ask: "你也要去補嗎？" },
        { key: "flyer", w: y >= 1975 && !five ? 1.5 : 0, lead: "放學時，補習班的人在校門口發傳單，塞給你一張免費試聽券", ask: "要去試試看嗎？" },
        { key: "cousin", w: five ? 0 : 1.5, lead: ctx.f("{cousin}考上了第一志願，{who}特地去打聽{cta}當年補的是哪一間", { cousin, who, cta }), ask: "你也要去補嗎？" },
        { key: "teacher", w: y < 1985 && !five ? 2 : 0, lead: "數學老師說放學後在家裡開了輔導班，班上一半的同學都去了", ask: "你也要去嗎？" },
        { key: "cost", w: tight && !five ? 2.5 : 0, lead: ctx.f("你想去補習，可是一個月的補習費要{fee}，{who}{calc}算了好久", { fee, who, calc: y < 1978 ? "打著算盤" : "拿著計算機" }), ask: "要怎麼辦？" },
        { key: "five", w: five ? 3 : 0, lead: ctx.f("五專的{subj}越來越難，期中考全班有一半不及格", { subj }), ask: "要去補習嗎？" },
      ]);
      const k = sc.key, lead = sc.lead, of = m => m[k] || m.report;
      // The words the results use (each result is a template of its own, opened by the scene's first sentence).
      const V = {
        lead, where, who, cousin, cta, subj,
        snack: y >= 1990 ? "在樓下買一份雞排" : "塞一個麵包", room: y >= 2000 ? "教室擠了上百個人，你坐在只看得到螢幕的最後一排，" : "小小的教室擠了好幾十個人，",
        share: y >= 1990 ? "分一份雞排" : "邊走邊啃麵包", place: y < 1980 ? "一位老師家" : "補習班", how: subj === "微積分" ? "老師從高中數學開始幫你複習" : "老師拿考古題一題一題帶你寫",
        drill: y >= 1985 ? "聽英文歌學發音" : "跟著老師念課文", tune: y >= 1985 ? "英文歌" : "順口溜", cards: y >= 1985 ? "便利貼" : "小卡片", copy: y >= 1980 ? "影印" : "抄",
      };
      // Each option in each scene: [button, hint, what happened after the scene's first sentence].
      const math = {
        report: ["補數理", "數學和理化", "{lead}。你去{where}補數學和理化，{每天放學{snack}就進教室，|{room}}{成績慢慢追上來了。|最喜歡那個會講笑話的老師。}"],
        peers: ["跟同學去補數理", "大家都在那一班", "{lead}。你跟著同學去{where}補數學和理化，{每天放學一群人{share}，再一起衝進教室，|你們搶著坐在同一排，}{成績慢慢追上來了。|你終於聽懂了下課大家在笑什麼。}"],
        flyer: ["去試聽數理班", "聽聽名師怎麼教", "{lead}。你去試聽了數理班，{台上的老師一邊解題一邊講笑話，|老師三兩下就把你卡了一整個禮拜的題目解開，}{你當天就回家請{who}幫你報名。|後來每週去報到三次，成績慢慢追上來了。}"],
        cousin: [ctx.f("去{cousin}補過的那一間", { cousin }), "數學和理化", "{lead}。你去了{cousin}當年補過的那一間，{{cousin}把當年的筆記全送給了你，|老師聽說你是{cousin}的親戚，特別照顧你，}{每週三天放學就去報到。|成績慢慢追上來了。}"],
        teacher: ["去老師家補", "跟同學一起去", "{lead}。你也去了數學老師家，{十幾個人擠在客廳的長桌上寫考卷，|師母還煮了一鍋綠豆湯給大家喝，}{成績慢慢追上來了。|你最怕老師家門口那隻會叫的狗。}"],
        cost: ["還是去補數理", ctx.f("{who}說錢的事不用你擔心", { who }), "{lead}。{who}說錢的事不用你擔心，你去{where}補了數學和理化，{每次繳費的信封都被你壓得平平整整，|上課從來不敢打瞌睡，}{成績慢慢追上來了。|你暗暗發誓要把這筆錢讀回來。}"],
        five: [ctx.f("去補{subj}", { subj }), "從頭打好基礎", "{lead}。你去{place}補{subj}，{跟一群要考插大的學長姊擠在同一間教室，|{how}，}{期末考終於及格了。|你第一次覺得{subj}好像有點道理。}"],
      };
      const english = {
        report: ["補英文", "背單字、練聽力", "{lead}。你去補英文，{每天背五十個單字，|上課一直{drill}，}{第一次聽懂了外國電影裡的一句台詞。|單字本被你翻到脫頁。}"],
        peers: ["去補英文", "先顧最弱的一科", "{lead}。你沒跟大家去同一間，自己去補了英文，{每天背五十個單字，|每週考一次聽力，}{第一次聽懂了外國電影裡的一句台詞。|單字本被你翻到脫頁。}"],
        flyer: ["去試聽英文班", y >= 1995 ? "聽說有外籍老師" : "聽說老師很會教文法", "{lead}。你去試聽了英文班，{老師用{tune}教文法，|一堂課就背了三十個單字，}{你決定留下來。|後來單字本被你翻到脫頁。}"],
        cousin: ["去補英文", "先顧最弱的一科", "{lead}。你覺得自己最弱的是英文，就去補了英文，{{cousin}教你用{cards}背單字，|每天背五十個單字，}{第一次覺得英文沒那麼可怕。|單字本被你翻到脫頁。}"],
        teacher: ["改去補英文", "數學自己讀", "{lead}。你沒去老師家，改去補了英文，{每天跟著收音機的英語教學節目念課文，|單字本被你翻到脫頁，}{第一次聽懂了外國電影裡的一句台詞。|英文成績慢慢爬上來了。}"],
        cost: ["只補英文就好", "一科就好，省一點", "{lead}。你跟家裡說只補英文就好，{每天背五十個單字，|數學就自己硬啃，}{第一次聽懂了外國電影裡的一句台詞。|單字本被你翻到脫頁。}"],
        five: ["補英文", "以後插大用得到", "{lead}。你去補了英文，{每天背五十個單字，|每週考一次聽力，}{{subj}還是很難，但英文成了你最穩的一科。|單字本被你翻到脫頁。}"],
      };
      const all = {
        report: ["補全科", "一次全部顧到", "{lead}。你補全科，{每天晚上十點才下課，|週末也被考卷塞滿，}{回家的公車上總是睡著。|書包重得像磚頭。}"],
        peers: ["補全科，跟上大家", "怕被拋在後面", "{lead}。你怕落後，一口氣報了全科，{每天晚上十點才下課，|週末也被考卷塞滿，}{回家的公車上總是睡著。|和同學見面的地方從教室換成了補習班。}"],
        flyer: ["報全科衝刺班", "一次全部顧到", "{lead}。試聽完你就報了全科班，{每天晚上十點才下課，|週末也被考卷塞滿，}{書包裡的講義越疊越厚。|回家的公車上總是睡著。}"],
        cousin: [ctx.f("照{cousin}的路補全科", { cousin }), "一次全部顧到", "{lead}。你照著{cousin}的路補了全科，{每天晚上十點才下課，|週末也被考卷塞滿，}{{who}說這樣才安心。|回家的公車上總是睡著。}"],
        teacher: ["數學英文都補", "一次全部顧到", "{lead}。你去老師家補數學，週末再去補英文，{每天回到家都快十點了，|連星期天都在寫考卷，}{書包重得像磚頭。|回家的路上總是在打瞌睡。}"],
        cost: ["咬牙補全科", "一次全部顧到", "{lead}。{who}多接了一份工，讓你補了全科，{每天晚上十點才下課，|週末也被考卷塞滿，}{回家的公車上總是睡著。|你連喝一杯飲料都捨不得。}"],
        five: ["每科都找人補", "一次全部顧到", "{lead}。你每一科都找了地方補，{每天晚上十點才回到家，|週末也被考卷塞滿，}{回家的客運上總是睡著。|書包重得像磚頭。}"],
      };
      const none = {
        report: ["不補，自己讀", "把時間留給自己", "{lead}。你決定不補習，{放學就回家自己讀，|把不會的題目留到隔天問老師，}{成績普普通通，但睡得很飽。|多出來的時間拿去打球。}"],
        peers: ["不補，自己讀", "別人是別人", "{lead}。你決定照自己的步調，{放學就回家自己讀，|把不會的題目留到隔天問老師，}{下課聽不懂他們的笑話，但你睡得很飽。|多出來的時間拿去打球。}"],
        flyer: ["把傳單收起來", "自己讀就好", "{lead}。你把傳單折成了紙飛機，{放學還是回家自己讀，|把不會的題目留到隔天問老師，}{成績普普通通，但睡得很飽。|多出來的時間拿去打球。}"],
        cousin: ["謝謝好意，自己讀", ctx.f("你不是{cousin}", { cousin }), "{lead}。你跟{who}說想先自己試試看，{放學就回家讀書，|把不會的題目留到隔天問老師，}{{who}嘆了口氣，還是答應了。|成績普普通通，但這是你自己的步調。}"],
        teacher: ["不去，自己讀", "把補習費省下來", "{lead}。你沒有去，{放學就回家自己讀，|把不會的題目留到隔天問同學，}{{who}用省下來的錢幫你買了一本參考書。|多出來的時間拿去幫家裡做事。}"],
        cost: ["不補了，自己讀", "把錢省下來", "{lead}。你跟{who}說不補了，{跟同學借了補習班的講義來{copy}，|每天在學校的圖書館讀到關門，}{成績沒有掉下去。|{who}什麼都沒說，隔天便當裡多了一顆滷蛋。}"],
        five: ["不補，去問學長姊", "自己想辦法", "{lead}。你沒有去補習，{抱著考古題去找學長姊，|跟同學在圖書館互相講題目，}{期末考低空飛過。|學長說他當年也是這樣過來的。}"],
      };
      const online = {
        report: ["上線上課程", "在家看影片學", "{lead}。你買了線上課程，{在家用平板看老師的影片，|不懂的地方就按暫停重看，}{省下不少通勤的時間。|有幾天看著看著就睡著了。}"],
        peers: ["上線上課程", "補在自己房間", "{lead}。你買了線上課程，{在家用平板看老師的影片，|不懂的地方就按暫停重看，}{同學問你補哪裡，你說「補在房間」。|有幾天看著看著就睡著了。}"],
        flyer: ["改上線上課程", "不用跑補習班", "{lead}。比起跑補習班，你選了線上課程，{在家用平板看老師的影片，|不懂的地方就按暫停重看，}{省下不少通勤的時間。|有幾天看著看著就睡著了。}"],
        cost: ["上便宜的線上課程", "比補習班省", "{lead}。你挑了一套便宜很多的線上課程，{在家用平板看老師的影片，|不懂的地方就按暫停重看，}{{who}說這樣錢花得值得。|有幾天看著看著就睡著了。}"],
        five: ["上線上課程", "在家看影片學", "{lead}。你買了線上的{subj}課程，{在家用平板看老師的影片，|不懂的地方就按暫停重看，}{期末考終於及格了。|有幾天看著看著就睡著了。}"],
      };
      const tutor = {
        report: ["請家教", "一對一比較清楚", "{lead}。{who}請了一位大學生來家裡當家教，{每週兩次坐在客廳的餐桌上，|講解得很清楚，|講話很有趣，}{你第一次覺得數學沒那麼可怕。|你們常常聊到忘了時間。}"],
        peers: ["請家教", "不想擠補習班", "{lead}。{who}覺得補習班人太多，請了一位大學生來家裡當家教，{每週兩次坐在客廳的餐桌上，|講解得很清楚，}{你第一次覺得數學沒那麼可怕。|下課同學聊補習班，你只能在旁邊聽。}"],
        flyer: ["請家教", "一對一比較清楚", "{lead}。你把試聽券送給了同學，{who}幫你請了一位大學生來家裡當家教，{每週兩次坐在客廳的餐桌上，|講解得很清楚，}{你第一次覺得數學沒那麼可怕。|你們常常聊到忘了時間。}"],
        cousin: [ctx.f("請{cousin}當家教", { cousin }), "自己人比較好問", "{lead}。{who}乾脆請{cousin}週末來家裡教你，{{cousin}講解得比老師還清楚，|兩個人常常講到一半就聊起天來，}{你第一次覺得數學沒那麼可怕。|{cousin}說你比{cta}當年還聰明。}"],
        cost: ["請鄰居的大學生教", "便宜一點", "{lead}。{who}拜託鄰居讀大學的孩子每週來教你兩次，{學費只收補習班的一半，|兩個人坐在客廳的餐桌上，}{你第一次覺得數學沒那麼可怕。|你們常常聊到忘了時間。}"],
        five: ["請家教", "一對一比較清楚", "{lead}。{who}請了一位大學生來家裡教你{subj}，{每週兩次坐在客廳的餐桌上，|講解得很清楚，}{你第一次覺得{subj}沒那麼可怕。|你們常常聊到忘了時間。}"],
      };
      const opt = (id, m, act, style, weight, mood, more = null) => {
        const [label, hint, text] = of(m);
        return { id: `t_cram.${id}`, label, hint, act, style, weight, apply: (s2, c) => { s2.flags.cram = id; if (more) more(s2); return { text: c.w(text, V), mood }; } };
      };
      return {
        prompt: ctx.f("{lead}。{ask}", { lead, ask: sc.ask }),
        options: [
          opt("math", math, "study", "learn", 0.25, 1),
          opt("english", english, "study", "learn", 0.15, 1),
          opt("all", all, "pushThrough", "safe", 0.2, -2, s2 => stressBy(s2, 0.05)),
          opt("none", none, "wait", "self", 0.2, 1),
          { ...opt("online", online, "study", "learn", 0.12, 1), when: () => y >= 2015 },
          opt("tutor", tutor, "study", "social", 0.08, 2),
        ],
      };
    },
  },
  {
    // 社團。情境：社團活動課的志願單（2000 年以前，國中一直都有）、社團博覽會（2000 年起）、迎新的社團表演、死黨拉你去、
    // 田徑隊教練或合唱團老師來找你、家裡手頭緊時社團要自己買樂器。
    id: "t_club", domain: "study", channel: "good", once: true, ages: [13, 17], when: inSchool, p: () => 0.12,
    choice: (s, ctx) => {
      const y = s.year, f = bestFriend(s), pal1 = f ? f.call : "死黨", tight = homeMoney(s, ctx) === "tight";
      const band = y < 1985 ? "國樂社" : y < 1995 ? "吉他社" : "熱音社", camp = y < 1985 ? "童軍團" : "康輔社";
      const sc = sceneOf(ctx, [
        { key: "form", w: y < 2000 ? 2 : s.track === "國中" ? 1 : 0, lead: "學校的社團活動課要選社團了，導師發下志願單，要填三個志願", ask: "第一志願要填哪一個？" },
        { key: "fair", w: y >= 2000 ? 2 : 0, lead: "社團博覽會上，學長姊在走廊擺攤拉人", ask: "想參加哪一個？" },
        { key: "show", w: y >= 1970 ? 1 : 0, lead: "開學的社團聯合迎新上，各社團輪流上台表演", ask: "想參加哪一個？" },
        { key: "pal", w: f ? 1.5 : 0, lead: ctx.f("{pal}拉著你去看社團招生，說要跟你參加同一個", { pal: pal1 }), ask: "要參加哪一個？" },
        { key: "coach", w: 0.8, lead: "體育課測八百公尺，你跑了全班第一，田徑隊的教練下課特地來找你", ask: "要加入田徑隊，還是參加別的社團？" },
        { key: "choir", w: 0.8, lead: "音樂課上老師點你起來獨唱，下課後合唱團的老師特地來找你", ask: "要加入合唱團，還是參加別的社團？" },
        { key: "cost", w: tight ? 1.5 : 0, lead: band === "國樂社" ? "你很想參加國樂社，可是社團規定要自己買一支笛子和一把二胡，你看著價錢猶豫了很久" : ctx.f("你很想參加{band}，可是社團規定要自己買一把吉他，你看著價錢猶豫了很久", { band }), ask: "要怎麼辦？" },
      ]);
      const k = sc.key, lead = sc.lead;
      const music = k === "choir" ? "合唱團" : band;
      const team = k === "coach" ? "田徑隊" : ctx.rng.pick(["籃球隊", "排球隊", y >= 1970 ? "棒球隊" : "田徑隊", "桌球隊"]);
      const stage = k === "fair" && ctx.rng() < 0.5 ? "熱舞社" : "話劇社", comic = k === "fair" ? "動漫社" : "漫研社";
      // Without a best friend yet, the club brings one.
      const pal = (s2, c, how) => { if (bestFriend(s2)) return ""; const n = makeFriend(s2, c, how, 0.75); return c.f("在社團認識的{name}，後來成了你的死黨。", { name: n.call }); };
      // Each result is one template, opened by the scene's first sentence: {lead}, then `open` (how you joined).
      const join = (key, how, text, mood = 3, more = {}) => (s2, c) => { s2.flags.club = key; const p = how ? pal(s2, c, how) : ""; const told = c.w(text, { lead, pal: pal1, music, team, ...more }); return { text: p ? c.f("{told}{met}", { told, met: p }) : told, mood }; };
      // What each club was like, by name.
      const tail = {
        國樂社: "{lead}，{open}{學會了吹笛子和拉二胡，|手指磨出了繭，}{成果發表會上台時腿一直抖。|和社員約好畢業前要辦一場演出。}",
        吉他社: "{lead}，{open}{第一個學會的和弦是 C 和 G，|按 F 和弦按到手指發紅，}{成果發表會上台時腿一直抖。|和社員約好畢業前要辦一場演出。}",
        熱音社: "{lead}，{open}{手指磨出了繭，|第一次在團練室和社員練到半夜，}{成果發表會上台時腿一直抖。|你們的樂團在校慶上唱了三首歌。}",
        合唱團: "{lead}，{open}{每天早自習都在音樂教室練發聲，|比賽時你站在第二排，}{全團唱完最後一個音，台下安靜了一秒才響起掌聲。|合唱比賽拿了第二名，大家抱在一起哭。}",
        田徑隊: "{lead}，{open}{每天清晨在操場跑二十圈，|小腿練出了兩塊結實的肌肉，}{第一次比賽緊張到差點搶跑。|曬得跟木炭一樣黑。}",
        球隊: "{lead}，{open}{每天放學練到天黑，|假日也去學校練球，}{第一次上場比賽緊張到同手同腳。|曬得跟木炭一樣黑。}",
        童軍團: "{lead}，{open}{學會了打各種繩結，|在營火晚會上帶大家跳舞，}{露營那晚，大家圍著營火聊到半夜。|交到一群很愛鬧的朋友。}",
        康輔社: "{lead}，{open}{學會了帶團康和一整套營火舞，|在迎新晚會上帶全場跳舞，}{社課的教室永遠最吵。|交到一群很愛鬧的朋友。}",
        話劇社: "{lead}，{open}{第一次上台就忘詞，|演了一棵不用說話的樹，|在成果發表會演了主角，}{台下的笑聲你一直記得。|後來你上台再也不怕了。}",
        熱舞社: "{lead}，{open}{每天在穿堂對著玻璃練舞，|第一次上台就跳錯了一拍，}{成果發表會上台下的尖叫聲你一直記得。|後來你上台再也不怕了。}",
        漫研社: "{lead}，{open}{和社員一起畫了一本同人誌，|每週社課都在聊最新一集的動畫，}{第一次覺得有人懂你。|你畫的四格漫畫被貼在社團教室的牆上。}",
      };
      tail.動漫社 = tail.漫研社;
      const tailOf = name => tail[name] || tail.球隊;
      // How the result opens in each scene; the club that came looking for you is joined, the others chosen instead.
      const open = (name, invited = false) => ({
        form: ctx.f("你第一志願填了{name}，", { name }), fair: ctx.f("你在{name}的攤位填了入社單，", { name }), show: ctx.f("看完表演，你加入了{name}，", { name }), pal: ctx.f("你和{pal}一起參加了{name}，", { pal: pal1, name }),
        coach: invited ? ctx.f("你答應了教練，加入{name}，", { name }) : ctx.f("你謝過教練，參加了{name}，", { name }), choir: invited ? ctx.f("你答應了老師，加入{name}，", { name }) : ctx.f("你謝過老師，參加了{name}，", { name }),
        cost: name === music ? (band === "國樂社" ? "你把零用錢和紅包存了兩個月，買了一把二手的二胡，" : "你把零用錢和紅包存了兩個月，買了一把二手吉他，") : ctx.f("你改參加了{name}，", { name }),
      }[k]);
      const L = {
        form: { music: [ctx.f("填{name}", { name: music }), "學一樣樂器"], ball: [ctx.f("填{name}", { name: team }), "每天練到天黑"], scout: [ctx.f("填{name}", { name: camp }), "露營、營火晚會"], drama: [ctx.f("填{name}", { name: stage }), "站上舞台"], comic: [ctx.f("填{name}", { name: comic }), "畫漫畫、聊動漫"], none: ["隨便填，社團課拿來讀書", "時間比較多"] },
        fair: { music: [music, "攤位前有人在刷吉他"], ball: [team, "學長在攤位前表演運球"], scout: [camp, "一直在跳團康舞拉人"], drama: [stage, "站上舞台"], comic: [comic, "攤位上擺滿了同人誌"], none: ["拿了傳單就走", "時間留給讀書"] },
        show: { music: [music, "台上那首歌你還在哼"], ball: [team, "學長表演了一段運球"], scout: [camp, "帶全場跳了一支團康舞"], drama: [stage, "那齣短劇讓全場笑翻"], comic: [comic, "社員穿著角色的衣服走台步"], none: ["看完表演就回家", "熱鬧看看就好"] },
        pal: { music: [ctx.f("一起去{name}", { name: music }), "學一樣樂器"], ball: [ctx.f("一起去{name}", { name: team }), "每天練到天黑"], scout: [ctx.f("一起去{name}", { name: camp }), "露營、營火晚會"], drama: [ctx.f("一起去{name}", { name: stage }), "站上舞台"], comic: [ctx.f("一起去{name}", { name: comic }), "畫漫畫、聊動漫"], none: [ctx.f("跟{pal}說你不參加", { pal: pal1 }), "想把時間留給讀書"] },
        coach: { music: [ctx.f("改參加{name}", { name: music }), "比起跑步，更想學樂器"], ball: ["加入田徑隊", "教練說你有天分"], scout: [ctx.f("參加{name}", { name: camp }), "露營、營火晚會"], drama: [ctx.f("參加{name}", { name: stage }), "站上舞台"], comic: [ctx.f("參加{name}", { name: comic }), "畫漫畫、聊動漫"], none: ["謝謝教練，回家讀書", "時間比較多"] },
        choir: { music: ["加入合唱團", "老師說你的聲音很乾淨"], ball: [ctx.f("去{name}", { name: team }), "比起唱歌更想流汗"], scout: [ctx.f("參加{name}", { name: camp }), "露營、營火晚會"], drama: [ctx.f("參加{name}", { name: stage }), "既然敢唱，也就敢演"], comic: [ctx.f("參加{name}", { name: comic }), "畫漫畫、聊動漫"], none: ["謝謝老師，回家讀書", "時間比較多"] },
        cost: { music: ["存錢買二手的", "自己想辦法"], ball: [ctx.f("改參加{name}", { name: team }), "球隊不用買樂器"], scout: [ctx.f("改參加{name}", { name: camp }), "露營、營火晚會"], drama: [ctx.f("改參加{name}", { name: stage }), "站上舞台"], comic: [ctx.f("改參加{name}", { name: comic }), "一支筆就夠了"], none: ["不參加了", "把錢留著"] },
      }[k];
      const noneText = {
        form: "{lead}，你隨便填了一個，{社團課都坐在最後一排寫參考書，|社團時間都拿來自習，}{成績穩穩的，只是偶爾有點羨慕別人。|你把時間留給了自己喜歡的書。}",
        fair: "{lead}，你拿了一疊傳單就走，{社團時間都在自習教室讀書，|放學就直接回家，}{成績穩穩的，只是偶爾有點羨慕別人。|你把時間留給了自己喜歡的書。}",
        show: "{lead}，你看完表演就回家了，{後來社團時間都在自習教室讀書，|一直沒有參加任何社團，}{成績穩穩的，只是偶爾有點羨慕台上的人。|你把時間留給了自己喜歡的書。}",
        pal: "{lead}，你跟{pal}說想把時間留給讀書，{pal}{自己去了{music}，|一個人去了{team}，}{偶爾回來跟你講社團的趣事。|你有點羨慕，但不後悔。}",
        coach: "{lead}，你謝過教練，說想專心讀書，{放學就直接回家，|社團時間都在自習教室讀書，}{偶爾經過操場，看到田徑隊在跑步，你會停下來看一會兒。|成績穩穩的，只是偶爾有點羨慕別人。}",
        choir: "{lead}，你謝過老師，說想專心讀書，{放學就直接回家，|社團時間都在自習教室讀書，}{合唱比賽那天，你在台下聽得好認真。|成績穩穩的，只是偶爾有點羨慕別人。}",
        cost: "{lead}，你沒有參加，把錢留了下來，{社團時間都在自習教室讀書，|放學就回家幫忙，}{偶爾聽到{music}在練習，你會在走廊停一下。|你把這個心願寫進了日記。}",
      }[k];
      const club = (key, id, name, how, act, style, weight, extra = {}) => ({ id: `t_club.${id}`, label: L[id][0], hint: L[id][1], act, style, weight, ...extra, apply: join(key, how, tailOf(name), 3, { open: open(name, (k === "coach" && id === "ball") || (k === "choir" && id === "music")) }) });
      return {
        prompt: ctx.f("{lead}。{ask}", { lead, ask: sc.ask }),
        options: [
          club("music", "music", music, "社團的朋友", "hobby", "learn", 0.2),
          club("ball", "ball", team, "隊友", "exercise", "health", 0.22),
          club("scout", "scout", camp, "社團的朋友", "socialize", "social", 0.15),
          club("drama", "drama", stage, "社團的朋友", "hobby", "risk", 0.1),
          club("comic", "comic", comic, "同好", "hobby", "self", 0.13, { when: () => y >= 1995 }),
          { id: "t_club.none", label: L.none[0], hint: L.none[1], act: "wait", style: "safe", weight: 0.2, apply: join("none", null, noneText, 0) },
        ],
      };
    },
  },
  {
    // 叛逆期
    id: "t_rebel", domain: "family", channel: "bad", tags: ["father", "mother"], once: true, ages: [13, 17], when: s => (s.father.alive || s.mother.alive) && !s.abroad, p: () => 0.05,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), f = bestFriend(s), food = comfortFood(ctx);
      const lead = ctx.w("這陣子你{lately}，{who}{敲了你的房門，說想跟你談談|在晚餐桌上又開始唸你}", { lately: ctx.rng.pick(["回家就把自己關在房間裡", "跟家裡講話越來越衝", "覺得大人什麼都不懂"]), who });
      // 髮禁 was lifted in 2005 and school dress rules were relaxed in 2016; 教官 left the schools in 2023.
      const officer = s.track === "國中" ? "生教組長" : s.year < 2023 ? "教官" : "學務主任";
      const look = y >= 2016 ? "染了一頭淺色的頭髮" : y >= 2005 ? "偷偷把頭髮染成咖啡色" : s.sex === "female" ? "偷偷把制服裙改短" : "偷偷把制服褲改成窄管";
      const after = y >= 2016 ? "{lead}。你{look}，{同學都說很好看，|{who}看了好幾天才習慣，}{你覺得自己終於像自己了。|那是你第一次自己決定自己的樣子。}" : "{lead}。你{look}，{被{officer}叫去談話，|被記了一支警告，}{回家又被唸了一頓。|但你覺得很值得。}";
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "t_rebel.talk", label: "把心裡的話說出來", hint: "吵一架也好", act: "talk", style: "social", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}。你把憋了很久的話一口氣說出來，{你們都哭了。|{who}聽完沉默了很久，說：「我以前也是這樣。」}{後來家裡的門比較少被甩上了。|那晚你們聊到很晚。}", { lead, who }), mood: 1 }) },
          { id: "t_rebel.door", label: "甩上房門", hint: "不想說話", act: "avoid", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}。你把房門甩上，{戴上耳機，把{player}的音量開到最大。|整個學期跟家裡說不到十句話。}{過了好一陣子，那股氣才慢慢消了。|直到有一天，{who}在門口放了一碗你最愛吃的{food}。}", { lead, player: player(y), who, food }), mood: -3 }) },
          { id: "t_rebel.look", label: y >= 2005 ? "去染頭髮" : "偷改制服", hint: "我想要自己的樣子", act: "insist", style: "self", weight: 0.15, when: () => s.studying, apply: (s2, c) => ({ text: c.w(after, { lead, look, who, officer }), mood: 1 }) },
          { id: "t_rebel.out", label: f ? ctx.f("跑去{pal}家住一晚", { pal: f.call }) : "跑去同學家住一晚", hint: "先離開一下", act: "avoid", style: "risk", weight: 0.08, apply: (s2, c) => ({ text: c.w(f ? "{lead}。你收了幾件衣服，跑到{pal}家住了一晚，{pal}的媽媽偷偷打電話給你{who}。{隔天你回家，{who}什麼都沒說，只問你吃飯了沒。|回家後你們大吵了一架，吵完反而輕鬆了。}" : "{lead}。你收了幾件衣服，跑到同學家住了一晚，同學的媽媽偷偷打電話給你{who}。{隔天你回家，{who}什麼都沒說，只問你吃飯了沒。|回家後你們大吵了一架，吵完反而輕鬆了。}", { lead, pal: f ? f.call : "", who }), mood: -1 }) },
          { id: "t_rebel.sport", label: "出去把氣發洩掉", hint: "打球或騎車", act: "exercise", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。你{抓起籃球出門，在球場投了兩個小時的籃，|騎上腳踏車，沿著河堤騎到天黑，}{回家時氣已經消了一半。|回家後主動說了一聲「我回來了」。}", { lead }), mood: 1 }) },
          { id: "t_rebel.letter", label: "寫一封信", hint: "當面說不出口", act: "talk", style: "family", weight: 0.12, apply: (s2, c) => ({ text: c.w("{lead}。你寫了一封長長的信放在{who}的桌上，{隔天早上，信封裡多了一張回信。|{who}看完，敲門進來抱了你一下。}{原來大家都很在乎對方。|你們約好以後有話直說。}", { lead, who }), mood: 2 }) },
        ],
      };
    },
  },
  {
    // 交到愛玩的朋友
    id: "t_wildFriends", domain: "study", channel: "bad", once: true, ages: [14, 17], when: inSchool, p: () => 0.04,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), f = bestFriend(s), food = comfortFood(ctx);
      const what = ctx.rng.pick(y < 1975 ? ["去冰果室混到很晚", "翹課去看電影"] : y < 1990 ? ["去電動玩具店打大型電玩", "去撞球間", "翹課去看電影"] : y < 2000 ? ["去撞球間", "去電動玩具店", ...(y >= 1993 ? ["去 KTV 唱到半夜"] : [])] : y < 2026 ? ["翹課去網咖", "去 KTV 夜唱", "在外面逛到半夜才回家"] : ["在外面逛到半夜才回家", "翹課出去玩"]);
      const lead = ctx.rng.pick([ctx.f("隔壁班認識的幾個朋友常約你{what}，說「一次就好啦」", { what }), ctx.f("補習班認識的幾個朋友常約你{what}，說「一次就好啦」", { what })]);
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "t_wildFriends.once", label: "跟去一次", hint: "看看也好", act: "socialize", style: "risk", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}。你跟去了一次，{玩得很開心，|玩到忘了時間，}{結果被{who}在門口逮個正著。|隔天上課一直打瞌睡。|回家的路上，你覺得好像也沒那麼好玩。}", { lead, who }), mood: 1 }) },
          { id: "t_wildFriends.join", label: "常常跟他們出去", hint: "跟他們在一起很自在", act: "socialize", style: "self", weight: 0.15, apply: (s2, c) => { s2.flags.wild = true; return { text: c.w("{lead}。你開始常常跟他們出去，{成績一路往下掉，|回家的時間越來越晚，}{直到導師打電話到家裡。|有一天你突然覺得這樣好累。}", { lead }), mood: -2 }; } },
          { id: "t_wildFriends.refuse", label: "找藉口推掉", hint: "說要補習", act: "wait", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w("{lead}。你每次都說要補習，{後來他們就不約你了。|漸漸地他們也不找你了，你鬆了一口氣，又有點寂寞。}", { lead }), mood: 0 }) },
          { id: "t_wildFriends.ball", label: "約他們改去打球", hint: "換個玩法", act: "exercise", style: "health", weight: 0.18, apply: (s2, c) => { const n = makeFriend(s2, c, "打球的朋友", 0.9); return { text: c.w("{lead}。你約他們改去打籃球，{沒想到他們真的來了，|一群人在球場上打到滿身大汗，}{後來每個星期六都固定打一場，{name}每次都最早到。|其中的{name}後來變成你很好的朋友。}", { lead, name: n.call }), mood: 2 }; } },
          {
            id: "t_wildFriends.ask", label: f ? ctx.f("找{pal}商量", { pal: f.call }) : ctx.f("找{who}商量", { who }), hint: "聽聽別人怎麼說", act: "seekHelp", style: "social", weight: 0.12,
            apply: (s2, c) => ({ text: c.w(f ? "{lead}。你跟{pal}說了這件事，{pal}說：「{你想去就去，不想就拒絕，我挺你。|那幾個人我知道，你自己要想清楚。}」{你決定不去了。|那天你們兩個去吃了一碗{food}。}" : "{lead}。你跟{who}說了這件事，{who}{沒有罵你，只要你自己想清楚。|說：「朋友是要選的。」}{你決定不去了。|你想了一個晚上。}", { lead, pal: f ? f.call : "", who, food }), mood: 1 }),
          },
        ],
      };
    },
  },
  {
    // 暑假打工（16 歲以上）
    id: "t_parttime", domain: "wealth", channel: "good", once: true, ages: [16, 17], when: s => !s.abroad && !s.employed, p: () => 0.15,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), shop = s.flags.familyShop, f = friendName(s, "同學");
      const want = ctx.rng.pick(y < 1980 ? ["一台收音機", "一雙球鞋"] : y < 1995 ? ["一台隨身聽", "一雙球鞋"] : y < 2005 ? ["一台 CD 隨身聽", "一支手機"] : ["一支新手機", "演唱會的門票"]);
      const lead = ctx.f("暑假到了，你想{plan}，在考慮要不要去打工", { plan: ctx.rng.pick([ctx.f("存錢買{want}", { want }), "自己賺零用錢", "幫家裡分擔一點"]) });
      // A summer's pay is a few percent of a year's median pay.
      const paid = (s2, k) => { s2.flags.parttime = k; s2.savings += 0.02; };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "t_parttime.food", label: y >= 1985 ? "去速食店" : "去餐廳端盤子", hint: "學會跟客人說話", act: "sideJob", style: "social", weight: 0.25, apply: (s2, c) => { paid(s2, "food"); return { text: c.w(y >= 1985 ? "{lead}。你去速食店打工，{每天在櫃檯喊「歡迎光臨」，|炸薯條炸到手臂都是油點，}{領到第一份薪水時，你在回家的公車上偷偷笑了好久。|學會了怎麼跟各種客人說話。}" : "{lead}。你去餐廳打工，{每天在櫃檯喊「歡迎光臨」，|端盤子端到手臂發痠，}{領到第一份薪水時，你在回家的公車上偷偷笑了好久。|學會了怎麼跟各種客人說話。}", { lead }), mood: 3 }; } },
          { id: "t_parttime.store", label: y >= 1990 ? "去便利商店" : "去工廠做暑期工", hint: y >= 1990 ? "排班、補貨、收銀" : "論件計酬", act: "sideJob", style: "safe", weight: 0.2, apply: (s2, c) => { paid(s2, "store"); return { text: c.w(y >= 1990 ? "{lead}。你去便利商店打工，{學會了收銀、補貨和煮茶葉蛋，|站了一整個暑假的櫃檯，}{第一次知道錢有多難賺。|還被店長稱讚做事很細心。}" : "{lead}。你去附近的工廠做暑期工，{一整天坐在生產線旁邊，|做的是論件計酬的手工，}{薪水全交給了{who}。|第一次知道錢有多難賺。}", { lead, who }), mood: 1 }; } },
          { id: "t_parttime.tutor", label: y >= 1980 ? "去補習班當工讀生" : "幫鄰居小孩補習", hint: "改考卷、教功課", act: "sideJob", style: "learn", weight: 0.15, apply: (s2, c) => { paid(s2, "tutor"); return { text: c.w(y >= 1980 ? "{lead}。你去補習班當工讀生，{幫忙改考卷、發講義，有學生跑來問你問題，你發現自己很會教人。|坐在櫃檯接電話、排課表，學會了怎麼跟家長說話。}" : "{lead}。你幫鄰居的小孩補習，{教他們算數學，你發現自己很會教人。|陪他們寫暑假作業，賺的錢不多，但很有成就感。}", { lead }), mood: 2 }; } },
          {
            id: "t_parttime.family", label: shop ? ctx.f("回家裡的{shop}幫忙", { shop }) : y >= 1965 && y < 2000 ? "在家做家庭代工" : "去親戚的店幫忙", hint: "錢不多，但跟家人在一起", act: "familyBusiness", style: "family", weight: 0.15,
            apply: (s2, c) => { paid(s2, "family"); return { text: c.w(shop ? "{lead}。你在家裡的{shop}幫了一整個暑假，{{who}說要付你薪水，你說不用了。|{who}第一次把收錢的工作交給你。}{你這才知道{who}每天有多辛苦。|晚上收店後，你們一起吃宵夜。}" : y >= 1965 && y < 2000 ? "{lead}。你在家幫忙做家庭代工，{客廳堆滿了要組裝的零件，|全家人圍著桌子一起趕貨，}{手做到痠了也不停。|你這才知道{who}每天有多辛苦。}" : "{lead}。你去親戚的店幫了一整個暑假，{從洗碗做到幫忙點餐，|每天一早就去開店，}{親戚包了一個大紅包給你。|你這才知道做生意有多辛苦。}", { lead, shop, who }), mood: 2 }; },
          },
          { id: "t_parttime.none", label: "不打工，好好放假", hint: "暑假只有一次", act: "rest", style: "self", weight: 0.25, apply: (s2, c) => { s2.flags.parttime = "none"; return { text: c.w("{lead}，最後還是決定不打工，{和{pal}騎腳踏車到處跑，|每天睡到中午，}{那是最後一個無憂無慮的暑假。|開學時被問暑假做了什麼，你說「長大」。}", { lead, pal: f }), mood: 3 }; } },
        ],
      };
    },
  },
  {
    // 初戀：記下名字（memory kind "crush"），之後的人生可以回頭提起；結局在 t_heartbreak。從合婚分頁開始的人生不會有
    // （people.js keptForPartner：遇到那個人之前，不會和別人談戀愛）。
    id: "t_firstLove", domain: "love", channel: "good", once: true, ages: [13, 15], when: (s, ctx) => s.studying && s.rel === "single" && !s.abroad && !s.arcs.t_love && !keptForPartner(s, ctx), p: () => 0.1,
    choice: (s, ctx) => {
      const y = s.year, sex = ctx.rng() < 0.95 ? (s.sex === "male" ? "female" : "male") : s.sex;
      const p = ctx.person({ role: "friend", sex, birthYear: s.birthYear + ctx.rng.int(3) - 1, how: "同學" });
      const name = p.call, ta = pronoun(p), f = bestFriend(s);
      const where = ctx.rng.pick(["坐你前面的", "隔壁班的", "每天同一班公車的", ...(s.flags.club && s.flags.club !== "none" ? ["同一個社團的"] : []), ...(s.flags.cram && s.flags.cram !== "none" ? ["補習班的"] : [])]);
      const sign = ctx.rng.pick(where === "坐你前面的" ? [ctx.f("每次{ta}回頭傳考卷，你的心跳都會漏一拍", { ta }), ctx.f("{ta}借你的那支筆，你一直捨不得還", { ta })] : where === "每天同一班公車的" ? [ctx.f("每天早上你都故意搭同一班車，只為了看{ta}一眼", { ta }), ctx.f("{ta}下車前回頭看了你一眼，你記了一整天", { ta })] : [ctx.f("你總是在人群裡第一眼就找到{ta}", { ta }), ctx.f("{ta}借你的那支筆，你一直捨不得還", { ta }), ctx.f("{ta}跟你說話的時候，你連自己說了什麼都不記得", { ta })]);
      const lead = ctx.f("你發現自己很在意{where}{name}：{sign}", { where, name, sign });
      ctx.remember("crush", name, { name, call: name, sex });
      const start = (s2, together, way) => { s2.flags.firstLove = { name, together, way }; ctx.arc.start("t_love", { name, sex, together, way }, Math.max(1, Math.min(1 + ctx.rng.int(2), 16 - s2.age))); };
      const confess = y < 1995 ? ctx.f("寫了一封信，偷偷夾在{ta}的課本裡", { ta }) : y < 2000 ? ctx.f("在{ta}的 BB.Call 留了「520」", { ta }) : y < 2005 ? ctx.f("傳了一封打了又刪、刪了又打的簡訊給{ta}", { ta }) : y < 2011 ? "在 MSN 上打了好長一段話，最後按下送出" : ctx.f("在 LINE 上傳了一段好長的訊息給{ta}", { ta });
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          {
            id: "t_firstLove.confess", label: "鼓起勇氣告白", hint: "把心意說出來", act: "pursue", style: "risk", weight: 0.22,
            apply: (s2, c) => {
              const yes = c.roll("love", "good", 0.45);
              start(s2, yes, "confess");
              return yes
                ? { text: c.w("{lead}。你{confess}。{隔天，{name}紅著臉說：「我也是。」|{name}回你：「其實我也注意你很久了。」}{你們開始一起放學回家。|那個學期，你們在走廊上偷偷傳紙條。}", { lead, confess, name }), mood: 7 }
                : { text: c.w("{lead}。你{confess}。{name}說：「我們當朋友就好。」{你難過了一個星期，|那天的天氣你到現在還記得，}{但後來你們還是會打招呼。|你把那份心意好好收了起來。}", { lead, confess, name }), mood: -4 };
            },
          },
          { id: "t_firstLove.secret", label: "默默喜歡就好", hint: "不讓任何人知道", act: "wait", style: "safe", weight: 0.3, apply: (s2, c) => { start(s2, false, "secret"); return { text: c.w("{lead}。你什麼都沒說，{只在日記裡寫滿了{ta}的名字。|每天只敢在{name}經過走廊時偷看一眼。|把{name}的側臉畫在課本的角落。}", { lead, ta, name }), mood: 2 }; } },
          { id: "t_firstLove.close", label: "先當好朋友", hint: "慢慢靠近", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => { const yes = c.rng() < 0.35; start(s2, yes, "close"); return { text: c.w(yes ? "{lead}。你開始找機會跟{name}說話，{借筆記、一起留下來做壁報，|放學一起等公車，}{一個學期後，{name}先跟你告白了。|有一天{name}問你：「我們要不要在一起？」}" : "{lead}。你開始找機會跟{name}說話，{借筆記、一起留下來做壁報，|放學一起等公車，}{兩個人越來越熟，|你們聊天的時間越來越長，}卻誰也沒說破。", { lead, name }), mood: 3 }; } },
          {
            id: "t_firstLove.ask", label: f ? ctx.f("請{pal}幫忙打聽", { pal: f.call }) : "請朋友幫忙打聽", hint: ctx.f("先知道{ta}的心意", { ta }), act: "seekHelp", style: "social", weight: 0.1, when: () => !!f,
            apply: (s2, c) => {
              const yes = c.roll("love", "good", 0.4);
              start(s2, yes, "ask");
              return { text: c.w(yes ? "{lead}。你拜託{pal}去打聽，{pal}回來說：「{ta}好像也喜歡你耶。」{你緊張到整晚睡不著，隔天終於約了{name}一起回家。|後來你們就在一起了。}" : "{lead}。你拜託{pal}去打聽，{pal}支支吾吾地說：「{ta}好像有喜歡的人了。」{你假裝不在意，|你笑著說沒關係，}{回家卻把棉被蓋過頭。|那天{pal}陪你吃了一碗冰。}", { lead, pal: f.call, ta, name }), mood: yes ? 6 : -3 };
            },
          },
          { id: "t_firstLove.study", label: "把心思放回課本", hint: "考完再說", act: "study", style: "learn", weight: 0.18, apply: (s2, c) => { start(s2, false, "study"); return { text: c.w("{lead}。你告訴自己現在要專心讀書，{把{name}的名字寫在講義的角落，又擦掉。|把那份心意藏進鉛筆盒的最底層。}", { lead, name }), mood: 0 }; } },
        ],
      };
    },
  },
  {
    // 初戀的結局：分手，或沒說出口就結束（t_firstLove 的故事線；故事線在這裡一定結束，不管選了什麼）
    id: "t_heartbreak", domain: "love", channel: "bad", max: 1, when: (s, ctx) => ctx.arc.at("t_love", "start"), p: () => 1,
    choice: (s, ctx) => {
      const a = s.arcs.t_love.data, name = a.name, ta = a.sex === "female" ? "她" : "他", f = bestFriend(s), y = s.year;
      ctx.arc.end("t_love", a.together ? "brokeUp" : "faded");
      const lead = a.together
        ? ctx.w("和{name}在一起{三個月|半年|快一年}，{因為考上不同的學校，|{ta}說想專心準備考試，|兩個人越來越少話聊，}你們分手了", { name, ta })
        : a.way === "confess" || a.way === "ask"
          ? ctx.w("{name}後來{跟別人在一起了|轉學了}，你以為自己早就放下，心裡還是空了一塊", { name })
          : ctx.w("{name}{跟別人在一起了|要轉學了|畢業後去讀了別的學校}，那份沒說出口的喜歡，只能放下了", { name });
      const songs = y < 1980 ? "守著收音機，等著點播的情歌，" : ctx.f("把{player}裡的情歌反覆聽了好幾遍，", { player: player(y) });
      return {
        prompt: ctx.f("{lead}。要怎麼走出來？", { lead }),
        options: [
          { id: "t_heartbreak.friend", label: f ? ctx.f("找{pal}哭一場", { pal: f.call }) : "找朋友哭一場", hint: "有人陪", act: "seekHelp", style: "social", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}。{pal}陪你在{操場邊|河堤上}坐到天黑，{什麼都沒問，只是一直遞衛生紙給你。|最後兩個人一起大喊了一聲，心裡好多了。}", { lead, pal: f ? f.call : "同學" }), mood: -2 }) },
          { id: "t_heartbreak.study", label: "把心思放在讀書", hint: "化悲憤為力量", act: "study", style: "learn", weight: 0.2, when: () => s.studying, apply: (s2, c) => ({ text: c.w("{lead}。你把自己埋進考卷裡，{那次段考考了全班第{三|五}名。|讀到半夜，眼淚滴在講義上。}", { lead }), mood: -2 }) },
          { id: "t_heartbreak.run", label: "去運動流汗", hint: "累了就不想了", act: "exercise", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。你每天放學去{操場跑步|球場打球}，{跑到喘不過氣，心裡就沒那麼痛了。|一個月後，你發現自己能笑著提起{name}了。}", { lead, name }), mood: -1 }) },
          { id: "t_heartbreak.songs", label: "聽情歌", hint: "讓自己好好難過", act: "rest", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。你{songs}{每一句歌詞好像都在寫你。|哭完一場，好像就放下了一點。}", { lead, songs }), mood: -3 }) },
          { id: "t_heartbreak.box", label: "把回憶收起來", hint: "跟過去說再見", act: "wait", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(a.together ? "{lead}。你把{name}送的{卡片|紙鶴|手鍊}收進抽屜最裡面，{告訴自己要往前走。|抽屜關上的那一刻，你好像長大了一點。}" : "{lead}。你把偷偷留著的{合照|紙條}收進抽屜最裡面，{告訴自己要往前走。|抽屜關上的那一刻，你好像長大了一點。}", { lead, name }), mood: -2 }) },
        ],
      };
    },
  },
  {
    // 被告白（從合婚分頁開始的人生不會有，同 t_firstLove）
    id: "t_confession", domain: "love", channel: "good", once: true, ages: [14, 17], when: (s, ctx) => s.studying && s.rel === "single" && !s.abroad && !s.arcs.t_love && !keptForPartner(s, ctx), p: () => 0.05,
    choice: (s, ctx) => {
      const y = s.year;
      const p = ctx.person({ role: "friend", sex: s.sex === "male" ? "female" : "male", birthYear: s.birthYear + ctx.rng.int(3) - 1, how: "同學" });
      const name = p.call, ta = pronoun(p);
      const where = ctx.rng.pick(["同班的", "隔壁班的", ...(s.flags.club && s.flags.club !== "none" ? ["社團的"] : []), ...(s.flags.cram && s.flags.cram !== "none" ? ["補習班的"] : [])]);
      const face = y < 1993 && ctx.rng() < 0.5;
      const how = face ? "放學時在校門口叫住你，" : y < 1993 ? "託同學送來一封信，" : y < 2000 ? ctx.rng.pick(["在你的 BB.Call 留了「520」，", "託同學送來一封信，"]) : y < 2005 ? "傳簡訊" : y < 2011 ? "在 MSN 上" : "在 LINE 上";
      // 傳簡訊 is also a word of the chat slot, so its sentence is a template of its own.
      const lead = how === "傳簡訊" ? ctx.f("{where}{name}傳簡訊跟你告白了", { where, name }) : ctx.f("{where}{name}{how}跟你告白了", { where, name, how });
      const talk = y < 1990 ? "互相寫信寫了一整本" : y < 2000 ? "每天晚上講電話講到被催" : "每天傳訊息傳到半夜";
      ctx.remember("admirer", name, { name, call: name, sex: p.sex });
      return {
        prompt: ctx.f("{lead}。要怎麼回應？", { lead }),
        options: [
          { id: "t_confession.yes", label: "答應交往", hint: "試試看", act: "pursue", style: "risk", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}。你答應了。{那段時間，你們每天一起走路回家，|你們{talk}，}{後來因為考試越來越忙，慢慢就分開了，|交往了幾個月，發現還是比較適合當朋友，}{但那是很甜的一段日子。|你一直記得{name}的好。}", { lead, talk, name }), mood: 4 }) },
          { id: "t_confession.no", label: "婉拒", hint: "謝謝，但不喜歡", act: "wait", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w("{lead}。你很認真地跟{name}說謝謝，{但你對{ta}沒有那種感覺。|說你現在只想專心讀書。}{後來你們見面還是會打招呼。|{name}說沒關係，你卻愧疚了好幾天。}", { lead, name, ta }), mood: 0 }) },
          { id: "t_confession.friends", label: "先當朋友", hint: "慢慢認識", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。你說可以先當朋友，{後來你們變成無話不談的好朋友。|後來你們一起準備考試，互相打氣。}", { lead }), mood: 2 }) },
          { id: "t_confession.dodge", label: face ? "紅著臉跑掉" : y >= 2011 ? "已讀不回" : "假裝沒收到", hint: "不知道怎麼回", act: "avoid", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w(face ? "{lead}。你紅著臉跑掉了，{結果在走廊遇到時，兩個人都尷尬得要命。|過了好久，你才鼓起勇氣跟{ta}說對不起。}" : y >= 2011 ? "{lead}。你已讀不回，{結果在走廊遇到時，兩個人都尷尬得要命。|過了好久，你才鼓起勇氣跟{ta}說對不起。}" : "{lead}。你假裝沒收到，{結果在走廊遇到時，兩個人都尷尬得要命。|過了好久，你才鼓起勇氣跟{ta}說對不起。}", { lead, ta }), mood: -1 }) },
          { id: "t_confession.other", label: "說心裡有喜歡的人", hint: "誠實說", act: "talk", style: "social", weight: 0.1, when: () => s.memory.some(m => m.kind === "crush"), apply: (s2, c) => ({ text: c.w("{lead}。你老實說心裡已經有喜歡的人了，{name}{笑著說：「我猜到了。」|點點頭，說謝謝你這麼誠實。}", { lead, name }), mood: 0 }) },
        ],
      };
    },
  },
  {
    // 畢業旅行：國小、國中、高中職（最多兩次）
    id: "t_gradTrip", max: 2, ages: [12, 17], when: s => !s.abroad && !!tripStage(s), p: () => 0.4,
    apply: (s, ctx) => {
      const y = s.year, stage = tripStage(s), who = grownUp(s, ctx), f = friendName(s, "同學");
      s.flags[`gradTrip_${stage}`] = true;
      const places = stage === "國小" ? ["臺北", "日月潭", "阿里山"].filter(x => x !== "臺北" || s.county !== "臺北市") : ["墾丁", "日月潭", "阿里山"];
      if (stage === "國小") { if (y >= 1980) places.push("六福村"); if (y >= 1985) places.push("小人國"); if (y >= 1987) places.push("九族文化村"); if (y >= 1991) places.push("劍湖山"); }
      else if (stage === "國中") { if (y >= 1987) places.push("九族文化村"); if (y >= 1991) places.push("劍湖山"); if (y >= 1994) places.push("六福村"); }
      else { places.push("花東", "澎湖"); if (y >= 2012 && ctx.rng() < 0.3) places.push("日本"); }
      const place = ctx.rng.pick(places), room = y >= 1980 ? "飯店" : "旅社", ride = y < 1965 ? "在火車上大家一起唱歌" : y >= 1988 ? "在遊覽車上輪流唱卡拉OK" : "在遊覽車上輪流唱歌";
      const photo = y >= 1997 ? "還和同學擠進大頭貼機拍了一整排" : y >= 1988 ? "還和同學合買了一台即可拍" : ctx.f("還借了{who}的相機拍了一整卷底片", { who });
      const night = y >= 1990 ? "全班圍成一圈玩真心話大冒險，" : "全班圍著營火唱歌，";
      // One set of sentences for each school (a life has two of these trips, and each set is fresh for its own).
      return { text: ctx.w(TRIP_TEXT[stage], { place, ride, pal: f, room, night, photo, who }), mood: 4 };
    },
  },
  {
    // 追星
    id: "t_idol", once: true, ages: [13, 17], when: s => !s.abroad, p: () => 0.06,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), idol = idolOf(y, ctx), them = padded(ctx, idol.again);
      const show = y >= 1985 ? "要開演唱會了" : s.county ? ctx.f("要到{county}登台演唱", { county: s.county }) : "要到附近登台演唱";
      const price = y < 1970 ? "十幾塊" : y < 1980 ? "一百多塊" : y < 1990 ? "五百塊" : y < 2000 ? "一千多塊" : y < 2010 ? "兩千多塊" : "三千多塊";
      const lead = ctx.f("你迷上了{idol}，{wall}。{them}{show}，票要{price}", { idol: padded(ctx, idol.who).trimEnd(), wall: y < 1985 ? "剪報貼滿了一整本簿子" : "房間牆上貼滿了海報", them: them.trimStart(), show, price });
      const screen = y >= 2008 ? "守在電腦前看直播" : y >= 1970 ? ctx.f("守在電視前，等{them}上綜藝節目", { them }) : ctx.f("守在收音機前，等著聽{them}的歌", { them });
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "t_idol.save", label: "存零用錢買票", hint: "省吃儉用幾個月", act: "save", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w("{lead}。你{每天中午只吃一個麵包，|把零用錢一塊一塊存起來，}{終於買到了票，那天你喊到喉嚨都啞了。|存了三個月，終於坐進了最後一排。}", { lead }), mood: 5 }) },
          { id: "t_idol.deal", label: ctx.f("跟{who}談條件", { who }), hint: s.studying ? "用成績交換" : "多幫忙做事", act: "negotiate", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。你跟{who}談好：{deal}就讓你去。{你真的做到了，|你差了一點點，{who}還是心軟了，}{那是你第一次去看{gig}。|那晚你開心得睡不著。}", { lead, who, deal: s2.studying ? "段考進步十名" : "幫家裡多做一個月的事", gig: y < 1985 ? "登台演唱" : "演唱會" }), mood: 4 }) },
          { id: "t_idol.fans", label: "和同好一起排隊", hint: "一起追星比較好玩", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。你和幾個同好{{queue}，|一起做了應援的海報，}{認識的朋友後來一直有聯絡。|那晚大家一起大合唱。}", { lead, queue: y < 2005 ? "在售票處門口排了一整晚的隊" : "一起守在電腦前搶票" }), mood: 4 }) },
          { id: "t_idol.home", label: y >= 2008 ? "在家看直播" : y >= 1970 ? "在家看電視" : "在家聽廣播", hint: "不花錢也能看", act: "wait", style: "self", weight: 0.1, apply: (s2, c) => ({ text: c.w("{lead}。你沒去，{{screen}，跟著一起唱。|把{them}的歌聽了一遍又一遍。}", { lead, screen, them }), mood: 1 }) },
          { id: "t_idol.skip", label: "翹課去排隊", hint: "被抓到就完了", act: "avoid", style: "risk", weight: 0.1, when: () => s.studying, apply: (s2, c) => ({ text: c.w("{lead}。你{翹了一整天的課|跟老師說肚子痛早退}去排隊，{買到了票，|排到的時候票剛好賣完，}{隔天被叫到辦公室。|回家被{who}禁足了一個月。}", { lead, who }), mood: 0 }) },
          { id: "t_idol.study", label: "先把書讀好", hint: "考完再去也不遲", act: "study", style: "learn", weight: 0.1, when: () => s.studying, apply: (s2, c) => ({ text: c.w("{lead}。你把{kept}收好，{跟自己約定考完試再去看。|把偶像的照片貼在書桌前當動力。}{那一年你讀得特別認真。|你在日記裡寫：下次一定要去。}", { lead, kept: y < 1985 ? "剪報" : "海報" }), mood: 1 }) },
        ],
      };
    },
  },
  {
    // 第一支電話、BB.Call、手機（1993 年起 BB.Call，2000 年起手機，2011 年起智慧型手機）
    id: "t_firstPhone", once: true, ages: [12, 17], when: s => !s.abroad, p: () => 0.15,
    apply: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), f = friendName(s, "同學");
      s.flags.firstPhone = y;
      const list = y < 1975 ? [
        "鎮上的雜貨店裝了電話，{你第一次拿起話筒，|有一次你幫家裡去借電話，}{緊張得不知道要說什麼。|把要說的話先寫在手心。}",
        "{學校|里長家}有一支電話，{有急事才能借來打，你幫家裡打過一次，緊張得手心都是汗。|你第一次聽到話筒裡傳來的聲音，嚇了一跳，回家跟大家講了一整晚。}",
        "巷口雜貨店的電話一響，老闆就站在門口大喊要找的是誰家，{有一次喊的是你家，你飛奔過去接。|你常常跑去等，看是不是有人找你。}{那是你第一次知道聲音可以跑那麼遠。|你覺得那支電話好神奇。}",
        ...(y >= 1965 ? ["家裡裝了第一支電話，黑色的轉盤電話放在客廳最顯眼的地方，{鄰居有事都會來借打。|你接電話時都會先清喉嚨。|{who}規定講電話不能超過三分鐘。}"] : []),
      ] : y < 1993 ? [
        "家裡的電話放在客廳，{你和同學講太久，{who}就在旁邊咳嗽。|你學會把電話線拉到房間門口偷偷講。}{一講就是一個小時。|電話費帳單來的那天，你躲得遠遠的。}",
        "你有了一本自己的電話簿，{抄滿了同學家的電話，|每個名字旁邊都畫了小圖案，}{晚上打去同學家，接電話的總是對方的爸爸。|撥號前你都要先深呼吸。}",
        y >= 1990 ? "你在學校旁的公共電話{投了一塊錢|插了電話卡}打給{who}，{說今天要留下來練球。|說會晚一點回家。}{那是你第一次覺得自己長大了。|電話那頭只說了一句「早點回來」。}" : "你在學校旁的公共電話投了一塊錢打給{who}，{說今天要留下來練球。|說會晚一點回家。}{那是你第一次覺得自己長大了。|電話那頭只說了一句「早點回來」。}",
      ] : y < 2000 ? [
        "你有了第一台 BB.Call，{腰上掛著它，走路都有風。|收到「530」就跑去找公共電話回電。}{同學之間流行用數字傳暗號，520 是什麼意思大家都知道。|有一次上課時它突然叫起來，全班都轉頭看你。}",
        "你存錢買了一台 BB.Call，{第一則留言是{pal}傳的電話號碼，|每天都在等它震動，}{你把它收在書包的小口袋裡，當寶貝一樣。|{who}說你根本不需要那個東西。}",
        "家裡多裝了一支電話分機，{你終於可以在房間裡講電話。|你和同學每天晚上講到電話發燙。}{有一次{who}拿起分機，你們都嚇了一跳。|那是你房間裡最重要的東西。}",
      ] : y < 2011 ? [
        y < 2004 ? "{who}買了一支{直立式|摺疊}手機給你，{一則簡訊要一塊多，你每個字都斟酌半天。|你花了一個晚上研究怎麼換鈴聲。|你最常做的事是換手機的桌布。}" : "{who}買了一支摺疊手機給你，{一則簡訊要一塊多，你每個字都斟酌半天。|你花了一個晚上研究怎麼換鈴聲。|你最常做的事是換手機的桌布。}",
        "你用打工和紅包錢買了第一支手機，{{first}|每天晚上都在算這個月還剩幾則免費簡訊，}{手機吊飾比手機還重。|你把它放在枕頭邊才睡得著。}",
        "有了手機以後，{你和同學用簡訊約放學去哪裡，|{who}每天晚上都會打來問你在哪裡，}{你學會了用注音飛快地打字。|你第一次覺得自己長大了。}",
      ] : y < 2026 ? [
        "拿到第一支智慧型手機，{第一件事是{app}。|你拍的第一張照片是窗外的天空。}{你和{who}約好晚上十點以後手機要放在客廳。|才一個月，螢幕就裂了一條線。}",
        "有了智慧型手機以後，{你每天放學都在班上的群組聊到半夜。|你學會用手機查公車什麼時候來。}{{who}說你的頭都快黏在螢幕上了。|你第一次覺得自己長大了。}",
        "{who}把用舊的手機給了你，{你換了一個透明的手機殼，|你下載了一堆遊戲又全部刪掉，}{每天都捨不得放下。|才發現原來有那麼多東西可以看。}",
      ] : [
        "拿到第一支自己的手機，{你和{who}約好了使用的時間。|你第一件事是加入了全班的群組。}{每天都捨不得放下。|才發現原來有那麼多東西可以看。}",
        "有了自己的手機以後，{你每天都和同學聊到半夜，|你學會自己查路線、自己訂票，}{{who}說你的頭都快黏在螢幕上了。|你第一次覺得自己長大了。}",
        "{who}把用舊的手機給了你，{你換了一個透明的手機殼，|你把桌布換成和{pal}的合照，}{每天都捨不得放下。|才一個月，螢幕就裂了一條線。}",
      ];
      const first = y >= 2003 ? ctx.f("拍的第一張照片是{pal}的鬼臉，", { pal: f }) : "存了全班的電話號碼，";
      const app = y >= 2012 ? "下載 LINE，加入全班的群組" : "下載通訊軟體，和同學互加好友";
      return { text: ctx.w(list, { who, pal: f, first, app }), mood: 2 };
    },
  },
  {
    // 沉迷：武俠小說、漫畫、電動、線上遊戲、手遊、短影音
    id: "t_hooked", domain: "study", channel: "bad", once: true, ages: [13, 17], when: inSchool, p: () => 0.05,
    choice: (s, ctx) => {
      const who = grownUp(s, ctx), f = bestFriend(s), h = hookOf(s.year, ctx);
      const lead = ctx.f("你迷上了{thing}，{habit}", { thing: h.thing, habit: ctx.rng.pick([ctx.f("每天{verb}到半夜", { verb: h.verb }), ctx.f("段考前一天還在{verb}", { verb: h.verb }), "上課時腦袋裡也全是它"]) });
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "t_hooked.deal", label: ctx.f("跟{who}約好時間", { who }), hint: "週末才可以", act: "negotiate", style: "family", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}。你和{who}約好{只有週末能{verb}兩個小時，|段考完才能碰，}{一開始很難熬，後來慢慢習慣了。|你偷偷破戒了幾次，但成績總算回來了。}", { lead, who, verb: h.verb }), mood: 0 }) },
          { id: "t_hooked.quit", label: "直接戒掉", hint: ctx.f("{quit}", { quit: h.quit }), act: "quitHabit", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。你下定決心{quit}，{頭幾天手癢得要命，|空出來的時間不知道要做什麼，}{後來重新找回了打球的樂趣。|你發現一天其實很長。}", { lead, quit: h.quit }), mood: 1 }) },
          { id: "t_hooked.more", label: ctx.f("繼續{verb}", { verb: h.verb }), hint: "現在最快樂", act: "vice", style: "self", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}。你繼續{verb}，{成績從前段掉到後段，|常常上課打瞌睡，}{直到{who}被老師請到學校。|有一天你突然覺得好空虛。}", { lead, verb: h.verb, who }), mood: -2 }) },
          { id: "t_hooked.craft", label: "把興趣變專長", hint: ctx.f("{craft}", { craft: h.craft }), act: "hobby", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。你決定{craft}，{後來還在比賽得了獎。|雖然沒有成名，卻學到了很多。}", { lead, craft: h.craft }), mood: 3 }) },
          { id: "t_hooked.out", label: f ? ctx.f("約{pal}出去", { pal: f.call }) : "約朋友出去", hint: "出去走走", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。你約{pal}出去{打球|騎腳踏車|逛街}，{{verb}的時間慢慢變少了。|你發現跟朋友出去比較好玩。}", { lead, pal: f ? f.call : "同學", verb: h.verb }), mood: 2 }) },
        ],
      };
    },
  },
  {
    // 大考前一年的壓力（國中、高中職各一次）。情境：倒數計時牌、模擬考退步、半夜睡不著、家人貼出的目標學校、晚自習、
    // 聯考一試定終身（聯考、聯招的年代）、學測加上學習歷程檔案（2020 年起的高中）。
    id: "t_examStress", domain: "study", channel: "bad", max: 2, cooldown: 2, ages: [14, 17], p: () => 0.3,
    when: s => !s.abroad && s.studying && ((s.age === 14 && s.track === "國中") || (["高中", "高職"].includes(s.track) && s.age === (s.flags.trackAt ?? 15) + 2)),
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), f = bestFriend(s), exam = nextExam(s);
      const sc = sceneOf(ctx, [
        { key: "board", w: y >= 1975 ? 1 : 0, lead: ctx.rng.pick([ctx.f("教室後面的倒數計時牌又翻了一頁，離{exam}只剩三百天", { exam }), ctx.f("教室後面的倒數計時牌又翻了一頁，離{exam}只剩兩百天", { exam }), ctx.f("教室後面的倒數計時牌又翻了一頁，離{exam}只剩一百五十天", { exam })]) },
        { key: "mock", lead: ctx.rng.pick(["模擬考的成績單發下來，你又退步了二十名", "模擬考的成績單發下來，你又退步了三十名", "模擬考的成績單發下來，你又退步了十幾名"]) },
        { key: "night", lead: ctx.f("凌晨兩點，你躺在床上盯著天花板，腦袋裡全是{exam}還沒讀完的範圍", { exam }) },
        { key: "wall", lead: y < 1972 ? ctx.f("{who}在你書桌前的牆上貼了一張紙，寫著你要考的學校", { who }) : ctx.f("{who}在冰箱門上貼了一張紙，寫著你要考的學校", { who }) },
        { key: "late", w: y >= 1975 ? 1 : 0, lead: ctx.f("離{exam}剩不到一年，學校開始留晚自習，教室裡安靜得只聽得到翻書的聲音", { exam }) },
        { key: "once", w: /聯考|聯招/.test(exam) ? 1 : 0, lead: ctx.f("大家都說{exam}一試定終身，考壞了就只能重考", { exam }) },
        { key: "portfolio", w: s.track === "高中" && y >= 2020 ? 1.5 : 0, lead: "準備學測之外，還要整理學習歷程檔案，每天的時間都不夠用" },
      ]);
      const k = sc.key, lead = sc.lead, listener = f ? f.call : k === "night" ? "輔導老師" : "導師", mates = f ? f.call : "幾個同學";
      const trip = ctx.rng.pick(["墾丁", "花蓮", "日月潭", "澎湖"]), noodle = y < 1972 ? "冷掉的饅頭" : "泡麵";
      // The buttons in each scene: [label, hint].
      const B = {
        cram: { board: ["跟著倒數拚到底", "睡少一點"], mock: ["把錯的題目全部重做", "今晚不睡了"], night: ["乾脆起來繼續讀", "反正也睡不著"], wall: [ctx.f("拚命讀，不讓{who}失望", { who }), "睡少一點"], late: ["留到最後一個才走", "大家都在拚"], once: ["拚命讀，一次考上", "沒有第二次機會"], portfolio: ["熬夜把兩邊都做完", "睡少一點"] },
        rest: { board: ["週末留一天給自己", "讀書也要喘口氣"], mock: ["先放自己一天假", "腦袋需要休息"], night: ["關燈，好好睡一覺", "先把覺睡飽"], wall: ["週末還是留一天給自己", "目標先放一邊"], late: ["準時回家睡覺", "照自己的步調"], once: ["週末還是去看場電影", "讀書也要喘口氣"], portfolio: ["先睡飽再說", "做不完也沒關係"] },
        talk: { board: [ctx.f("找{listener}聊聊", { listener }), "說出心裡的慌"], mock: ["拿成績單去找老師", "問問哪裡出了問題"], night: [ctx.f("隔天找{listener}說說", { listener }), "說出來比較好"], wall: [ctx.f("跟{who}說出你的壓力", { who }), "說出來比較好"], late: [f ? ctx.f("跟{pal}互相打氣", { pal: f.call }) : "找導師聊聊", "說出來比較好"], once: ["去找考過的學長姊", "聽聽過來人怎麼說"], portfolio: ["找導師討論怎麼排", "一個人想不出辦法"] },
        run: { board: ["每天傍晚去跑操場", "動一動腦袋比較清楚"], mock: ["去球場流一身汗", "把悶氣打掉"], night: ["早上提早起來慢跑", "把作息調回來"], wall: ["出門跑步透透氣", "先離開書桌"], late: ["下課去操場跑兩圈", "動一動比較清醒"], once: ["每天清晨去跑步", "身體顧好才撐得住"], portfolio: ["把運動排進行程", "動一動比較清醒"] },
        pray: { board: ["去拜文昌帝君", "求個考運"], mock: ["去廟裡求個考運", "求個心安"], night: ["去廟裡求個平安符", "求個安心"], wall: [ctx.f("跟{who}去拜文昌帝君", { who }), "一起求個考運"], late: ["去拜文昌帝君", "求個考運"], once: ["去拜文昌帝君", "求個考運"], portfolio: ["去拜文昌帝君", "求個考運"] },
        group: { board: ["找同學組讀書會", "大家一起讀"], mock: ["跟考好的同學一起讀", "看看別人怎麼讀"], night: ["白天找同學一起讀", "一個人讀太悶"], wall: ["跟同學去圖書館讀", "不想一直待在家"], late: ["約幾個同學一起讀", "互相出題"], once: [y >= 1980 ? "跟同學去K書中心" : "跟同學去圖書館讀", "大家一起讀"], portfolio: ["跟同學組讀書會", "互相看檔案"] },
      };
      const cramDo = { board: "每天讀到凌晨一點", mock: "把錯的題目一題一題重做，每天讀到凌晨一點", night: "爬起來打開檯燈，一路讀到天亮", wall: ctx.f("每天讀到凌晨一點，想讓{who}看到成績", { who }), late: "每天留晚自習到最後一個才走", once: "每天讀到凌晨一點，連洗澡都在背公式", portfolio: "每天熬到半夜，把考試和檔案一起趕完" }[k];
      // Each result is one template opened by the scene ({lead}), with these words.
      const V = { lead, who, listener, mates, trip, noodle, cramDo, pal: f ? f.call : "", fta: f ? pronoun(f) : "", offer: y >= 1985 ? "把准考證影本放在供桌上，" : "點了一盞光明燈，", spot: y < 1980 ? "圖書館讀到關門" : y < 1990 ? "K書中心讀到十點" : y < 2015 ? "麥當勞讀到打烊" : "自習室讀到關門" };
      const restText = {
        night: "{lead}。你把檯燈關掉，告訴自己明天的事明天再說，{一覺睡到鬧鐘響。|隔天上課頭一次沒打瞌睡。}{那天你讀得特別順。|你發現睡飽比多讀一小時有用。}",
        late: "{lead}。你沒有留晚自習，每天準時回家吃飯、睡覺，{有同學說你太悠哉，|{who}反而比你還緊張，}{但你的成績沒有退步。|你覺得這才是自己的步調。}",
        mock: "{lead}。你把成績單收進抽屜，放了自己一天假，{睡到自然醒，|去看了一場電影，}{隔天再拿出來看，好像也沒那麼可怕了。|有點罪惡感，但心情好多了。}",
        once: "{lead}。你週末還是去看了一場電影，{在黑漆漆的戲院裡，你兩個小時都沒想到考試。|散場後買了一包鹹酥雞邊走邊吃。}{星期一回到教室，反而讀得比較進去。|有點罪惡感，但心情好多了。}",
        portfolio: "{lead}。你決定先把覺睡飽，{一天只做一件事，|檔案寫不完就先放著，}{隔天反而做得比較快。|有點罪惡感，但心情好多了。}",
      }[k] || "{lead}。你決定週末留一天給自己，{睡到自然醒，|去看了一場電影，}{星期一回到教室，反而讀得比較進去。|有點罪惡感，但心情好多了。}";
      const talkText = {
        mock: "{lead}。你拿著成績單去找老師，老師{幫你把錯的題目分成「不會」和「粗心」兩堆，|陪你把剩下的進度重新排了一遍，}{你發現粗心的那一堆比較高。|心裡的石頭輕了一些。}",
        wall: "{lead}。你跟{who}說，每次看到那張紙都覺得喘不過氣，{{who}愣了一下，隔天那張紙就不見了。|{who}說：「我只是想幫你加油，考得怎樣都沒關係。」}{那晚你睡了一個好覺。|心裡的石頭輕了一些。}",
        once: "{lead}。你跑去找畢業的學長姊，{學姊說她當年也怕得要命，|學長把當年的筆記和考古題都給了你，}{你發現考試只是一天，人生還很長。|心裡的石頭輕了一些。}",
        portfolio: "{lead}。你找導師討論，{導師幫你把要做的事排成一張表，|導師說檔案不用寫得多，寫得真就好，}{你終於知道先做什麼了。|心裡的石頭輕了一些。}",
        late: f ? "{lead}。你和{pal}每天晚自習下課一起走去搭車，{原來{fta}也一樣怕。|{pal}說：「考完我們去吃一頓好的。」}{那段路成了你一天最輕鬆的時候。|心裡的石頭輕了一些。}" : null,
      }[k] || "{lead}。你跟{listener}聊了一個下午，{原來大家都一樣怕。|對方說：「盡力就好，考完你還是你。」}{那晚你睡了一個好覺。|心裡的石頭輕了一些。}";
      const runText = {
        mock: "{lead}。你抓起籃球去球場，{一個人投籃投到天黑，|跟隔壁班的人鬥牛鬥到滿身大汗，}{回家時悶氣已經消了一半。|流完汗，那張成績單好像也沒那麼重了。}",
        night: "{lead}。你把鬧鐘調早半小時，每天天一亮就出門慢跑，{晚上倒頭就睡著了。|一個月後，你又能一覺睡到天亮。}{|考前那幾個月，你一天都沒停過。}",
        wall: "{lead}。你換上球鞋出門，{沿著河堤跑了好幾公里，|在公園繞了一圈又一圈，}{回家時心情好多了。|跑完回家，那張紙看起來沒那麼刺眼了。}",
        late: "{lead}。你每節下課都去操場跑兩圈，{回到教室腦袋清楚多了。|同學笑你是全班唯一在流汗的人。}{晚自習反而讀得比較進去。|你覺得身體比腦袋先輕鬆了。}",
      }[k] || "{lead}。你每天傍晚去操場跑三圈，{跑完腦袋清楚多了。|流完汗，焦慮好像也跟著流掉了一點。}{|考前那幾個月，你一天都沒停過。}";
      const prayText = {
        night: "{lead}。週末你去廟裡拜了文昌帝君，求了一個平安符，{回家壓在枕頭下面，|掛在書包的拉鍊上，}{那晚睡得安穩多了。|心裡安定了不少。}",
        mock: "{lead}。你和{who}去廟裡拜文昌帝君，{擲了三次筊才拿到聖筊，|在紙上寫了名字和想考的學校，}{求一個「包中」的好兆頭。|心裡安定了不少。}",
      }[k] || "{lead}。你和{who}去廟裡拜文昌帝君，{供了蔥、芹菜和一顆包子，|在紙上寫了名字和學校，|{offer}}{求一個「包中」的好兆頭。|心裡安定了不少。}";
      const groupText = {
        mock: "{lead}。你厚著臉皮去找班上考最好的同學一起讀，{才發現對方也會粗心，|對方教你把錯的題目抄在一本小冊子上，}{讀書變得沒那麼孤單。|下一次模擬考，你們兩個都進步了。}",
        once: y >= 1980 ? "{lead}。你和{mates}每天放學去K書中心，{一人一格小隔間，讀到十點才回家，|休息時間在門口互相出題，}{讀書變得沒那麼孤單。|你們約好考完要一起去{trip}。}" : null,
        portfolio: "{lead}。你和{mates}組了讀書會，{一邊準備學測，一邊互相看對方的檔案，|用雲端共用筆記，誰讀完哪一章就打勾，}{讀書變得沒那麼孤單。|你們約好考完要一起去{trip}。}",
        wall: "{lead}。你和{mates}約好每天去圖書館讀，{讀到關門才回家，|中午就在附近吃一碗麵，}{讀書變得沒那麼孤單。|你們約好考完要一起去{trip}。}",
      }[k] || "{lead}。你和{mates}組了讀書會，{每天放學在{spot}，|互相出題考對方，}{讀書變得沒那麼孤單。|你們約好考完要一起去{trip}。}";
      const opt = (id, act, style, weight, text, mood, more = null) => ({ id: `t_examStress.${id}`, label: B[id][k][0], hint: B[id][k][1], act, style, weight, apply: (s2, c) => { if (more) more(s2); return { text: c.w(text, V), mood }; } });
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          opt("cram", "pushThrough", "risk", 0.3, "{lead}。你{cramDo}，{{noodle}成了每天的宵夜，|黑眼圈越來越深，}{模擬考進步了，人卻瘦了一圈。|有一天在公車上睡過了站。}", -2, s2 => stressBy(s2, 0.05)),
          opt("rest", "rest", "self", 0.2, restText, 2),
          opt("talk", "talk", "social", 0.15, talkText, 2),
          opt("run", "exercise", "health", 0.15, runText, 2),
          opt("pray", "spiritual", "safe", 0.12, prayText, 2),
          opt("group", "study", "learn", 0.08, groupText, 2),
        ],
      };
    },
  },
  {
    // 和死黨吵架
    id: "t_friendFight", once: true, ages: [13, 17], when: s => !!bestFriend(s) && !s.abroad, p: () => 0.05,
    choice: (s, ctx) => {
      const y = s.year, f = bestFriend(s), ta = pronoun(f), snack = ctx.rng.pick(snackOf(y)), drink = y < 1980 ? "汽水" : y < 1995 ? "鋁箔包紅茶" : "珍珠奶茶";
      const topic = ctx.rng.pick(["分組報告誰沒做事", ctx.f("你忘了{ta}的生日", { ta }), "借的漫畫被你弄丟了", "一句不經意的玩笑話", "你最近跟別人比較好"]);
      const lead = ctx.w("和{pal}為了{topic}吵架，已經{一個星期|三天|半個月}沒說話了", { pal: f.call, topic });
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "t_friendFight.sorry", label: "主動道歉", hint: "先低頭", act: "reconcile", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w("{lead}。你先開口說了對不起，{pal}{愣了一下，然後笑了：「我也有不對啦。」|丟了一句「白癡喔」，你們就和好了。}", { lead, pal: f.call }), mood: 3 }) },
          { id: "t_friendFight.write", label: y < 1990 ? "寫紙條說清楚" : y < 2000 ? "打電話說清楚" : "傳訊息說清楚", hint: "把話一次講完", act: "talk", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。你{send}{pal}，把心裡的話一次說清楚。{隔天，{pal}在你桌上放了一瓶{drink}。|{pal}回了一句：「明天一起吃午餐？」}", { lead, send: sendTo(y), pal: f.call, drink }), mood: 3 }) },
          { id: "t_friendFight.wait", label: "等對方先開口", hint: "又不是我的錯", act: "avoid", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。你等{pal}先開口，{pal}也在等你。{整整一個月，兩個人在走廊上擦肩而過。|後來你生日那天，抽屜裡多了一張{pal}寫的卡片，你們才和好。}", { lead, pal: f.call }), mood: -2 }) },
          { id: "t_friendFight.mediator", label: "請朋友當和事佬", hint: "找共同的朋友", act: "seekHelp", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。共同的朋友約你們一起去{吃冰|看電影}，{兩個人一開始都不說話，最後卻笑成一團。|散場的時候，你們又跟以前一樣了。}", { lead }), mood: 2 }) },
          { id: "t_friendFight.gift", label: ctx.f("帶{snack}去找{ta}", { snack, ta }), hint: "用行動和好", act: "reconcile", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。你買了{pal}最愛的{snack}，在{ta}家樓下等了半小時。{{pal}下樓時，你們都沒提吵架的事。|{pal}接過去，說：「你很煩欸。」然後笑了。}", { lead, pal: f.call, snack, ta }), mood: 3 }) },
        ],
      };
    },
  },
  {
    // 在意外表
    id: "t_looks", once: true, ages: [13, 16], when: s => !s.abroad, p: () => 0.05,
    apply: (s, ctx) => {
      const y = s.year, f = friendName(s, "同學"), who = grownUp(s, ctx);
      // Hair rules (髮禁) in junior and senior high were lifted in 2005.
      const hair = y < 2005 && s.studying ? [s.sex === "female" ? "學校規定的耳上三公分西瓜皮" : "學校規定的三分頭"] : [];
      const worry = ctx.rng.pick(["臉上一顆接一顆冒出來的青春痘", "一個暑假突然長高、短了一大截的制服", "新配的那副厚厚的眼鏡", ...(y >= 1980 ? ["剛戴上的牙套"] : []), ...hair]);
      return { text: ctx.w([
        "{worry}讓你好在意，{拍照時總是躲到最後一排。|照鏡子的時間越來越長。}後來{pal}說：「{你想太多了啦。|大家都在煩自己的事好嗎。}」你才慢慢沒那麼在意。",
        "{worry}讓你好在意，{每天出門前都要在鏡子前站好久，|連上台報告都想請假，}{{who}說：「你這樣很好看。」|{who}帶你去剪了一個新髮型，}{你嘴上說才不是，心裡卻偷偷開心。|那天你抬頭挺胸走進教室。}",
        "{worry}讓你好在意，{你在日記裡寫了好多次「好想變成別人」。|你把房間的鏡子轉過去面對牆壁。}過了一陣子，你忙著{社團|考試|打球}，{突然發現已經好久沒想起這件事了。|才發現長大本來就是這個樣子。}",
      ], { worry, pal: f, who }), mood: 0 };
    },
  },
  {
    // 生涯迷惘
    id: "t_lost", domain: "study", channel: "change", once: true, ages: [16, 17], when: senior, p: () => 0.1,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx);
      const lead = ctx.rng.pick(["同學好像都知道自己以後要做什麼，你卻連自己喜歡什麼都說不出來", "同學好像都知道自己以後要做什麼，你卻看著科系介紹發呆了好幾個晚上", "同學好像都知道自己以後要做什麼，你卻越想越不知道"]);
      const set = (s2, k) => { s2.flags.careerView = k; };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "t_lost.ask", label: y >= 2000 ? "去大學的營隊看看" : "去問學長姊", hint: "聽聽過來人怎麼說", act: "seekHelp", style: "social", weight: 0.28, apply: (s2, c) => { set(s2, "explore"); return { text: c.w(y >= 2000 ? "{lead}。你報名了大學的營隊，{第一次走進大學校園，|聽學長姊講大學在學什麼，}{心裡慢慢有了方向。|才發現原來有那麼多沒聽過的科系。}" : "{lead}。你跑去問畢業的學長姊，{聽他們講大學和工作的事，|他們給了你一大疊筆記和建議，}{心裡慢慢有了方向。|才發現原來有那麼多沒聽過的科系。}", { lead }), mood: 2 }; } },
          { id: "t_lost.family", label: ctx.f("跟{who}聊聊", { who }), hint: "聽聽家人的想法", act: "talk", style: "family", weight: 0.2, apply: (s2, c) => { set(s2, "family"); return { text: c.w("{lead}。你跟{who}聊了一個晚上，{who}說：「{你喜歡就好，我們都支持你。|先讀一個以後找得到工作的吧。|我年輕的時候也不知道，走著走著就知道了。}」你把這句話放在心上。", { lead, who }), mood: 1 }; } },
          { id: "t_lost.read", label: "自己找資料", hint: y >= 2005 ? "上網看各種工作的介紹" : "去圖書館借書", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => { set(s2, "read"); return { text: c.w("{lead}。你{how}，{把有興趣的寫在一張紙上，|一個一個刪掉不喜歡的，}{最後剩下兩三個方向。|第一次覺得未來有了一點形狀。}", { lead, how: y >= 2005 ? "上網看了好多不同工作的介紹" : "去圖書館借了好幾本職業介紹和人物傳記" }), mood: 2 }; } },
          { id: "t_lost.score", label: "先照分數選", hint: "以後再說", act: "wait", style: "safe", weight: 0.25, apply: (s2, c) => { set(s2, "score"); return { text: c.w("{lead}。你決定先照分數選，{告訴自己以後再慢慢找方向。|反正很多人也是這樣。}", { lead }), mood: 0 }; } },
          { id: "t_lost.dream", label: "選自己喜歡的", hint: "就算冷門也沒關係", act: "insist", style: "risk", weight: 0.12, apply: (s2, c) => { set(s2, "dream"); return { text: c.w("{lead}。你決定往自己喜歡的方向走，{就算親戚說那條路沒前途。|你在心裡偷偷做了決定，誰也沒說。}", { lead }), mood: 2 }; } },
        ],
      };
    },
  },
  {
    // 沒有繼續升學，提早出社會（1980 年以前多半是當學徒）
    id: "t_apprentice", domain: "career", channel: "change", max: 1, ages: [13, 17], when: s => !s.studying && !s.abroad, p: () => 0.4,
    apply: (s, ctx) => {
      const who = grownUp(s, ctx);
      if (s.employed && s.job) {
        // core.js can hand a 14-year-old any basic job; a driver or a guard is not one a minor can hold.
        const job = ["貨運司機", "保全"].includes(s.job.title) ? null : s.job.title;
        return { text: ctx.w([
          job ? "{age} 歲就當{job}，{看著以前的同學穿著制服經過，心裡有點羨慕，也有點驕傲。|領到第一份薪水的那天，你把一半交給了{who}。}" : "{age} 歲就出來工作，{看著以前的同學穿著制服經過，心裡有點羨慕，也有點驕傲。|領到第一份薪水的那天，你把一半交給了{who}。}",
          job ? "當{job}的這幾年，{你已經做得比剛來的大人還快，|老闆開始讓你自己處理一些事，}{下班回家，{who}總是留著一碗熱湯給你。|你偷偷存著錢，想學更多本事。}" : "出來工作的這幾年，{你已經做得比剛來的大人還快，|老闆開始讓你自己處理一些事，}{下班回家，{who}總是留著一碗熱湯給你。|你偷偷存著錢，想學更多本事。}",
          job ? "每天一早就出門去當{job}，{同齡的人還在背課文，你已經學會怎麼跟客人說話。|手上的繭越來越厚。}{有時候你會想，如果繼續讀書會怎樣。|你告訴自己，這也是一條路。}" : "每天一早就出門上工，{同齡的人還在背課文，你已經學會怎麼跟客人說話。|手上的繭越來越厚。}{有時候你會想，如果繼續讀書會怎樣。|你告訴自己，這也是一條路。}",
        ], { age: s.age, job, who }), mood: 0 };
      }
      return { text: ctx.w(s.year < 1980 ? [
        "沒有繼續讀書，你跟著師傅當學徒，{學做木工，|學修腳踏車，|學做裁縫，}{從掃地、倒茶開始學，|晚上就睡在店裡的閣樓，}三年四個月才能出師。",
        "十幾歲就跟著師傅學手藝，{師傅脾氣不好，但教得很仔細。|你把師傅的每個動作都記在心裡。}{過年回家，{who}說你長高了。|第一次自己完成一件作品時，你偷偷笑了好久。}",
        "沒有繼續讀書，你在家裡幫忙，{每天天還沒亮就起床，|跟著{who}{下田|顧店|做手工}，}{手上的繭越來越厚。|你告訴自己，這也是一條路。}",
      ] : [
        "沒有繼續升學，你{在家裡幫忙，每天一早就起床。|跟著親戚學一技之長，師傅說你手很巧。}{看著以前的同學穿著制服經過，心裡有點複雜。|你告訴自己，這也是一條路。}",
        "不讀書以後，你跟著{who}{顧店|做事}，{學會了怎麼算帳、怎麼跟客人說話，|才知道大人每天有多辛苦，}{你偷偷存著錢，想學更多本事。|有時候你會想，如果繼續讀書會怎樣。}",
        "沒有繼續升學，你{白天幫忙家裡，晚上去學{修機車|美髮|做麵包}，|在親戚的店裡從學徒做起，}{手上的工夫一天比一天熟。|你發現自己很喜歡用雙手做東西。}",
      ], { who }), mood: 0 };
    },
  },
  {
    // 考試時同學要答案。情境：考到一半、考前一天、早自習借抄作業、死黨拜託（考不及格東西就要被沒收）、外流的答案。
    id: "t_cheat", domain: "study", channel: "bad", once: true, ages: [13, 18], when: s => inSchool(s) && (s.age <= 17 || s.track === "五專"), p: () => 0.13,
    choice: (s, ctx) => {
      const y = s.year, f = bestFriend(s), m = classmate(s, ctx);
      const sc = sceneOf(ctx, [{ key: "exam", p: m }, { key: "night", p: m }, { key: "homework", p: m }, { key: "bff", p: f, w: f ? 1.2 : 0 }, { key: "leak", p: null }]);
      const k = sc.key, name = sc.p ? sc.p.call : "", ta = sc.p ? pronoun(sc.p) : "";
      const askBy = y < 1990 ? "放學時塞了一張紙條給你" : y < 2000 ? "打電話到你家" : y < 2005 ? "傳簡訊給你" : y < 2011 ? "在 MSN 上敲你" : "傳 LINE 給你";
      const lose = y < 1990 ? "漫畫" : y < 2005 ? "隨身聽" : "手機", drink = y < 1980 ? "一瓶汽水" : y < 1995 ? "一包鋁箔包紅茶" : "一杯珍珠奶茶";
      const seen = y >= 2011 ? "沒有點開" : "沒有接過來看";
      const lead = {
        exam: ctx.f("段考考到一半，坐你隔壁的{name}用腳輕輕踢你的椅子，小聲說「第五題」", { name }),
        night: ctx.f("段考前一天，{name}{askBy}，拜託你明天考試時把考卷往旁邊挪一點", { name, askBy }),
        homework: ctx.f("早自習的時候，{name}跑到你的座位旁，說第一節要交的作業借{ta}抄一下", { name, ta }),
        bff: ctx.f("{name}說這次段考再不及格，爸媽就要沒收{ta}的{lose}，拜託你考試時幫{ta}一把", { name, ta, lose }),
        leak: y >= 2011 ? "有人說拿到了明天段考的答案，下課時在班上的群組裡偷偷傳" : "有人說拿到了明天段考的答案，下課時在教室後面偷偷傳",
      }[k];
      // Each result is one template opened by the scene ({lead}), with these words.
      const V = {
        lead, name, ta, drink, seen,
        how: k === "exam" ? "你把考卷往旁邊挪了一點" : k === "night" ? "你答應了，隔天考試時把考卷往旁邊挪了一點" : ctx.f("你心一軟，考試時把考卷往{name}那邊挪了一點", { name }),
        call: y >= 2005 ? "開著視訊" : y >= 1990 ? "抱著電話" : "在巷口的路燈下", hang: y >= 1985 ? "速食店" : "圖書館", said: y >= 2011 ? "群組裡打了一句" : "教室後面說了一句",
      };
      const opt = (id, act, style, weight, labels, hints, run) => ({ id: `t_cheat.${id}`, label: labels[k], hint: hints[k] || hints.exam, act, style, weight, apply: (s2, c) => { const [text, mood] = run(c); return { text: c.w(text, V), mood }; } });
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          opt("give", "socialize", "risk", 0.15,
            { exam: "把考卷挪過去", night: ctx.f("答應幫{ta}", { ta }), homework: ctx.f("借{ta}抄", { ta }), bff: ctx.f("幫{name}這一次", { name }), leak: "也拿一份來看" },
            { exam: "就這一次", night: "朋友有難", homework: "只是作業而已", bff: "朋友有難", leak: "大家都在看" },
            c => {
              if (k === "leak") return ["{lead}。你也偷偷看了那份答案，{隔天一翻開考卷，題目跟那份答案完全對不上，|考卷發下來，題目根本不一樣，}{你只好硬著頭皮自己寫。|你氣自己前一晚沒有好好讀。}", -1];
              if (k === "homework") return ["{lead}。你把作業簿遞了過去，{{name}抄得太急，連你寫錯的地方都照抄，|{name}抄完還幫你把作業簿包上書套，}{老師改到你們兩本，抬頭看了你們一眼。|{name}說下次換{ta}請你吃早餐。}", 0];
              if (c.rng() < 0.3) return ["{lead}。{how}，{監考老師剛好走到你們這一排，|監考老師在講台上看得一清二楚，}{兩個人的考卷都被收走，那一科都是零分。|兩個人都被記了一支警告。}", -3];
              return ["{lead}。{how}，{心跳得比寫考卷時還快，|手心全是汗，}{還好監考老師一直盯著窗外。|結果那題你自己寫錯了，兩個人一起錯。}{考完你發誓再也不做這種事。|{name}下課請你喝了{drink}。}", 0];
            }),
          opt("ignore", "avoid", "safe", 0.35,
            { exam: "裝作沒聽到", night: y >= 2011 ? "已讀不回" : "假裝沒收到", homework: "說你也還沒寫完", bff: "假裝沒聽懂", leak: "不看，照自己讀的考" },
            { exam: "專心寫自己的", night: "明天再說", homework: "找個藉口", bff: "不想撕破臉", leak: "看了心會亂" },
            () => [{
              exam: "{lead}。你假裝沒聽到，{把考卷壓得更緊，|眼睛死盯著自己的考卷，}{{name}考完一整天都不跟你說話。|下課{name}嘟囔了一句「小氣」，隔天就忘了。}",
              night: y >= 2011 ? "{lead}。你已讀不回，隔天考試時把考卷壓得緊緊的，{{name}考完一整天都不跟你說話。|下課{name}嘟囔了一句「小氣」，隔天就忘了。}" : "{lead}。你假裝沒收到，隔天考試時把考卷壓得緊緊的，{{name}考完一整天都不跟你說話。|下課{name}嘟囔了一句「小氣」，隔天就忘了。}",
              homework: "{lead}。你說你也還沒寫完，{低頭假裝在趕作業，|把作業簿塞進抽屜最裡面，}{{name}又去找了別人。|你有點心虛，但也鬆了一口氣。}",
              bff: "{lead}。你笑笑說「你一定可以的啦」，考試時把考卷壓得緊緊的，{{name}考完沒說什麼，只是一路踢著石頭走回家。|成績發下來，{name}差兩分及格，你心裡很不好受。}",
              leak: "{lead}。你{seen}，{照原本的進度讀到半夜，|把那份答案的事拋在腦後，}{隔天才知道那份答案根本是假的。|考得普普通通，但每一題都是自己寫的。}",
            }[k], 0]),
          opt("teach", "study", "learn", 0.2,
            { exam: ctx.f("考完再教{ta}", { ta }), night: ctx.f("今晚先教{ta}", { ta }), homework: ctx.f("下課教{ta}寫", { ta }), bff: ctx.f("今晚陪{name}讀", { name }), leak: "約同學把範圍讀完" },
            { exam: "不給答案，教方法", night: "現在讀還來得及", homework: "抄了也學不會", bff: "臨時抱佛腳也好", leak: "與其看答案" },
            () => [{
              exam: "{lead}。你沒有理{ta}，考完卻{把第五題的解法寫在紙上給{name}，|放學留下來教{name}那幾題，}{{name}說原來沒那麼難。|下一次段考，{name}自己寫出來了。}",
              night: "{lead}。你回{ta}：「我現在教你，比明天偷看有用。」{你們{call}把重點講了一遍，|你把自己的筆記借給了{name}，}{隔天{name}自己寫完了整張考卷。|{name}說原來沒那麼難。}",
              homework: "{lead}。你說抄了也學不會，下課陪{name}把那幾題重寫一遍，{{name}寫到一半突然說「原來是這樣」。|第一節{name}遲交了，但每一題都是自己寫的。}{後來{name}常常拿題目來問你。|你發現教別人，自己也記得更牢。}",
              bff: "{lead}。你說：「答案不能給你，但今晚我陪你讀。」{你們在{name}家的書桌前讀到十一點，|你把考試範圍畫成一張重點表給{name}，}{成績發下來，{name}剛好及格，抱著你大叫。|{name}還是差了一點點，但說這是{ta}讀得最認真的一次。}",
              leak: "{lead}。你{seen}，放學約了幾個同學在{hang}把範圍讀完，{隔天發現那份答案根本是假的，看了的人都傻眼。|你們互相出題出到天黑。}",
            }[k], 2]),
          opt("refuse", "insist", "self", 0.18,
            { exam: "小聲說「不行」", night: "直接回絕", homework: ctx.f("叫{ta}自己寫", { ta }), bff: ctx.f("跟{name}說不行", { name }), leak: "叫大家不要再傳" },
            { exam: "把話說清楚", night: "這種事不幫", homework: "作業不是這樣用的", bff: "朋友也有不能做的事", leak: "這樣不公平" },
            () => [{
              exam: "{lead}。你小聲回了一句「不行」，{{name}瞪了你一眼，|整場考試你都覺得背後涼涼的，}{後來{name}跟你說，其實{ta}也知道不對。|過了幾天，兩個人又照樣一起去福利社。}",
              night: "{lead}。你直接回{ta}：「這個我不能幫。」{{name}回了一個「好啦」，|{name}好幾天不太理你，}{隔天考試，{name}自己埋頭寫到最後一分鐘。|後來{name}說，被你拒絕以後，{ta}反而認真讀了一次。}",
              homework: "{lead}。你說：「作業借不了，你自己寫吧。」{{name}翻了個白眼走開了，|{name}嘟著嘴回到座位，}{第一節還是遲交了。|後來找了別人借。}{你們好幾天沒說話。|過幾天兩個人又一起去福利社了。}",
              bff: "{lead}。你跟{name}說：「別的都可以，這個不行。」{{name}氣得一整天不跟你說話，|{name}愣了一下，說：「我知道啦，問問而已。」}{幾天後{ta}還是拉著你去福利社。|你們好像沒什麼改變，又好像更懂對方了一點。}",
              leak: "{lead}。你在{said}：「不要再傳了，這樣不公平。」{有人說你假清高，|好幾個人跟著說對，}{隔天才知道那份答案根本是假的。|那天放學，有個同學偷偷跟你說謝謝。}",
            }[k], 0]),
          opt("report", "seekHelp", "social", 0.12,
            { exam: "考完跟老師說", night: "先跟導師說", homework: ctx.f("陪{ta}去跟老師說", { ta }), bff: ctx.f("請老師幫{name}補救", { name }), leak: "去跟老師說" },
            { exam: "交給大人處理", night: "先讓老師知道", homework: "誠實比較好", bff: "找大人想辦法", leak: "讓老師處理" },
            () => [{
              exam: "{lead}。考完你去跟老師說了這件事，{老師沒有說是誰講的，只在班會上提醒大家考試的規矩。|老師找了{name}去談，{name}之後幾天都不太理你。}{你不確定這樣做對不對，但心裡比較踏實。|你知道自己守住了一件事。}",
              night: "{lead}。你把這件事告訴了導師，{隔天考試前，老師把座位全部拉開，什麼也沒說。|老師私下找{name}聊了一節下課。}{{name}後來沒再提這件事。|你不確定這樣做對不對，但心裡比較踏實。}",
              homework: "{lead}。你陪{name}去辦公室，跟老師說作業還沒寫完，{老師讓{name}放學前補交。|老師說誠實比抄來的作業好，讓{name}隔天再交。}{{name}鬆了一口氣。|後來{name}的作業都準時交了。}",
              bff: "{lead}。你陪{name}去找老師，說{ta}跟不上，{老師答應考前幫{ta}複習一次，|老師給了{ta}一份練習卷，}{{name}說謝謝你沒讓{ta}做傻事。|那次段考，{name}剛好及格。}",
              leak: "{lead}。你去辦公室跟老師說了，{老師連夜換了一份考卷，|老師笑說那份答案早就傳到辦公室了，是假的，}{隔天考試大家都只能靠自己。|你覺得心裡很踏實。}",
            }[k], 0]),
        ],
      };
    },
  },
  {
    // 被誤會。情境：班費不見、同學的東西不見、福利社說你沒付錢、文具店要你打開書包、小老師保管的答案卷不見；
    // 已經出去工作的，是店裡的收銀機少了錢或工廠的倉庫少了東西。真相最後都會水落石出（truth），不指認任何人。
    // The truth comes out in one of two ways ({{t1}|{t2}} in each result, as a {a|b} group would).
    id: "t_blamed", domain: "study", channel: "bad", once: true, ages: [12, 17],
    when: s => pupil(s) || (!s.studying && !s.abroad && s.employed && !!s.job && !["家業", "自營"].includes(s.job.field)), p: s => (s.age === 12 ? 0.14 : 0.11),
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), m = classmate(s, ctx), name = m.call, ta = pronoun(m), school = s.studying;
      const plant = !school && (s.job.field === "製造" || /工廠/.test(s.job.title)), clean = !school && /清潔/.test(s.job.title), boss = plant ? "領班" : clean ? "組長" : "老闆";
      const cash = y < 1970 ? "兩百塊" : y < 1990 ? "一千塊" : y < 2010 ? "兩千塊" : "三千塊";
      const fund = y < 1970 ? "五十塊" : y < 1990 ? "三百塊" : y < 2010 ? "一千塊" : "兩千塊";
      const thing = y < 1980 ? "鋼筆" : y < 1998 ? "隨身聽" : y < 2008 ? "MP3" : y < 2016 ? "手機" : "無線耳機";
      const shop = y < 1985 ? "書局" : "文具店", subj = ctx.rng.pick(["數學", "英文", "國文"]);
      const sc = sceneOf(ctx, [
        { key: "work", w: school ? 0 : 1,
          lead: plant ? "工廠的倉庫少了一箱零件，那天最後一個鎖門的是你" : clean ? "你負責打掃的辦公室有人掉了錢包，那天最後一個進去打掃的是你" : ctx.f("店裡的收銀機少了{cash}，那天最後一個關店的是你", { cash }),
          truth: plant ? ["後來領班在另一個倉庫找到了那箱零件，原來是早班的人搬錯了地方。", "月底盤點才發現，是出貨單寫錯了。"] : clean ? ["後來那個人在自己的車上找到了錢包，還託組長跟你說聲抱歉。", "過了兩天才知道，錢包早就被同事撿去交給了警衛室。"] : ["後來老闆在收銀機底下找到了那疊鈔票，原來是卡在抽屜後面。", "月底對帳才發現，是老闆娘拿去付了貨款，忘了說一聲。"] },
        { key: "fund", w: school ? 1 : 0, lead: ctx.f("班上放在講桌抽屜裡的班費少了{fund}，那天最後一個離開教室的是你", { fund }), truth: ["後來大家在掃具櫃後面找到了那個信封，原來是早上收錢時掉的。", "沒多久，總務股長紅著臉說，那筆錢夾在課本裡被帶回家了。"] },
        { key: "item", w: school ? 1 : 0, lead: ctx.f("{name}的{thing}不見了，有人說午休時看到你在{ta}的座位旁邊", { name, thing: padded(ctx, thing), ta }), truth: [ctx.f("過了兩天，{name}在自己的書包夾層裡找到了，紅著臉跟你道歉。", { name }), "後來才知道是坐後面的同學借去，忘了說一聲。"] },
        { key: "shop", w: school ? 1 : 0, lead: ctx.f("福利社的阿姨說你上次拿了一包{snack}沒付錢，當著排隊的同學叫住你", { snack: ctx.rng.pick(snackOf(y)) }), truth: ["阿姨翻了帳本，才發現是記錯人了，隔天多塞了一包給你。", "後來阿姨想起來，那天沒付錢的是另一個個子差不多的學生。"] },
        { key: "store", w: school ? 1 : 0, lead: ctx.f("放學後你在{shop}逛了一圈要走，店員突然擋在門口，要你把書包打開", { shop }), truth: ["你把書包整個倒出來，只有課本、便當盒和一包衛生紙，店員說了聲對不起。", y >= 1995 ? "後來看了監視器畫面，店員才知道是自己看錯了。" : "後來老闆問清楚了，店員才知道是自己看錯了。"] },
        { key: "key", w: school ? 1 : 0, lead: ctx.f("老師鎖在抽屜裡的考卷答案不見了，你是{subj}小老師，第一個被叫去辦公室問話", { subj }), truth: ["後來老師在另一個資料夾裡找到了，拍拍你的肩膀說抱歉。", "過了兩天，老師說答案卷被夾進了別班的作業簿裡。"] },
      ]);
      const k = sc.key, lead = sc.lead, store = k === "store";
      const V = {
        lead, who, boss, t1: sc.truth[0], t2: sc.truth[1], when: plant ? "鎖門前" : clean ? "打掃時" : "關店前",
        ask: y >= 1995 ? "店員調出監視器畫面" : "老闆出來看看", end: y >= 1995 ? "畫面裡你的雙手一直在外套口袋外面，店員紅著臉說了聲對不起。" : "老闆問清楚以後，說是店員看錯了，還送你一枝筆賠罪。",
        phone: y >= 2005 ? "用手機" : "借店裡的電話", next: school ? "隔天請假陪你到學校，跟老師把事情談清楚。" : ctx.f("隔天陪你去找{boss}，把事情談清楚。", { boss }), sleuth: y >= 1997 ? "很有柯南的架勢" : "像偵探一樣",
      };
      const told = (s2, c, text) => c.w(text, V);
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          {
            id: "t_blamed.explain", label: { work: "當場說清楚", fund: "當場說清楚", item: "說你只是經過", shop: "說你那天根本沒去", store: "打開書包給店員看", key: "把那天的事說清楚" }[k], hint: "沒做就是沒做", act: "talk", style: "self", weight: 0.3,
            apply: (s2, c) => ({ text: told(s2, c, {
              fund: "{lead}。你站起來，把那天放學的事一五一十說了一遍，{{t1}|{t2}}{你這才發現手心都是汗。|回家的路上，你一直在想要是沒人相信你怎麼辦。}",
              item: "{lead}。你說你只是經過，{看著大家的眼睛說「不是我」，|把那天午休做了什麼一件一件講出來，}{{t1}|{t2}}{你這才發現手心都是汗。|回家的路上，你一直在想要是沒人相信你怎麼辦。}",
              shop: "{lead}。你說你那天根本沒去福利社，{聲音大到整排的人都回頭看，|把當天的課表一節一節講給阿姨聽，}{{t1}|{t2}}{你這才發現手心都是汗。|回家的路上，你一直在想要是沒人相信你怎麼辦。}",
              store: "{lead}。你把書包打開放在櫃檯上，{說：「你看。」|手在發抖，聲音卻很穩，}{{t1}|{t2}}{你這才發現手心都是汗。|回家的路上，你一直在想要是沒人相信你怎麼辦。}",
              key: "{lead}。你在辦公室把那天的事一五一十說了一遍，{{t1}|{t2}}{你這才發現手心都是汗。|回家的路上，你一直在想要是沒人相信你怎麼辦。}",
              work: "{lead}。你把那天{when}做了哪些事，一件一件說給{boss}聽，{{t1}|{t2}}{你這才發現手心都是汗。|回家的路上，你一直在想要是沒人相信你怎麼辦。}",
            }[k]), mood: 0 }),
          },
          {
            id: "t_blamed.teacher", label: { work: plant ? "請領班一起盤點" : clean ? "請組長陪你去說明" : "請老闆一起對帳", fund: "請導師幫忙查", item: "請導師幫忙找", shop: "請導師陪你去說", store: y >= 1995 ? "請店員看監視器" : "請老闆出來", key: "請老師再找一次" }[k], hint: "交給大人查清楚", act: "seekHelp", style: "social", weight: 0.2,
            apply: (s2, c) => ({ text: told(s2, c, {
              fund: "{lead}。你請導師幫忙查，{導師一個一個問清楚，|導師陪你把那天放學的經過重新走了一遍，}{{t1}|{t2}}{你心裡的石頭終於落了地。|你發現遇到事情，先找對的人很重要。}",
              item: "{lead}。你請導師幫忙找，{導師請大家先翻翻自己的抽屜和書包，|導師陪你把那天午休的經過重新走了一遍，}{{t1}|{t2}}{你心裡的石頭終於落了地。|你發現遇到事情，先找對的人很重要。}",
              shop: "{lead}。你請導師陪你去福利社，{導師陪阿姨把那天的帳一筆一筆對過，|導師站在你旁邊，請阿姨再想想，}{{t1}|{t2}}{你心裡的石頭終於落了地。|你發現遇到事情，先找對的人很重要。}",
              key: "{lead}。你請老師再仔細找一次，{老師把抽屜裡的東西全部倒了出來，|老師一個資料夾一個資料夾地翻，}{{t1}|{t2}}{你心裡的石頭終於落了地。|你發現遇到事情，先找對的人很重要。}",
              work: plant ? "{lead}。你請領班陪你把倉庫重新點了一遍，{點到天都黑了，|兩個人一箱一箱搬開來看，}{{t1}|{t2}}{你心裡的石頭終於落了地。|你發現遇到事情，先找對的人很重要。}" : clean ? "{lead}。你請組長陪你去說明，{組長把那天的打掃紀錄翻了出來，|組長站在你旁邊，一句一句幫你說，}{{t1}|{t2}}{你心裡的石頭終於落了地。|你發現遇到事情，先找對的人很重要。}" : "{lead}。你請老闆陪你把那天的帳一筆一筆對過，{對到半夜，|老闆戴起老花眼鏡一張一張翻收據，}{{t1}|{t2}}{你心裡的石頭終於落了地。|你發現遇到事情，先找對的人很重要。}",
              store: "{lead}。你請{ask}，{在櫃檯邊等了好久，|旁邊的客人都在看你，}{end}{你心裡的石頭終於落了地。|你發現遇到事情，先找對的人很重要。}",
            }[k]), mood: 1 }),
          },
          {
            id: "t_blamed.home", label: store ? ctx.f("打電話請{who}來", { who }) : ctx.f("回家跟{who}說", { who }), hint: "家人會相信你", act: "seekHelp", style: "family", weight: 0.18,
            apply: (s2, c) => ({ text: told(s2, c, store
              ? "{lead}。你{phone}打給{who}，{who}{十分鐘就趕到了，|一進門就站到你旁邊，}{{t1}|{t2}}{回家的路上，{who}什麼都沒問，只買了一支冰棒給你。|{who}說：「我相信你。」}"
              : "{lead}。你回家跟{who}說了，{who}{只問了一句「你有沒有拿？」，聽到你說沒有，就說「那就好，我相信你」。|{next}}{{t1}|{t2}}"), mood: 2 }),
          },
          {
            id: "t_blamed.wait", label: "先忍下來", hint: "清者自清", act: "wait", style: "safe", weight: 0.2,
            apply: (s2, c) => ({ text: told(s2, c, store ? "{lead}。你什麼都沒說，默默把書包打開，{臉燙得像發燒，|旁邊的客人都在看，}{{t1}|{t2}}{那件事讓你學會不要急著懷疑別人。|你把那幾天的委屈都寫在日記裡。}" : school ? "{lead}。你什麼都沒多說，{那幾天走進教室，總覺得有人在背後看你，|一個人吃了好幾天的便當，}{{t1}|{t2}}{那件事讓你學會不要急著懷疑別人。|你把那幾天的委屈都寫在日記裡。}" : "{lead}。你什麼都沒多說，{那幾天上班，總覺得有人在背後看你，|一個人默默把工作做完，}{{t1}|{t2}}{那件事讓你學會不要急著懷疑別人。|你把那幾天的委屈都寫在日記裡。}"), mood: -2 }),
          },
          {
            id: "t_blamed.prove", label: store ? "要店員拿出證據" : "自己把真相找出來", hint: "找證據", act: "insist", style: "risk", weight: 0.12,
            apply: (s2, c) => ({ text: told(s2, c, store
              ? "{lead}。你站著不動，要店員先說清楚看到了什麼，{店員支支吾吾說不出來，|老闆走過來問發生了什麼事，}{{t1}|{t2}}{你走出店門時，腿才開始發軟。|從此你再也沒去過那家店。}"
              : school ? "{lead}。你決定自己把真相找出來，{下課就去問每一個那天在場的人，|把那天的每一節課都寫在紙上，}{{t1}|{t2}}{大家看你的眼神都不一樣了。|同學說你{sleuth}。}" : clean ? "{lead}。你決定自己把真相找出來，{把那天打掃的路線重新走了一遍，|去問每一個那天在辦公室的人，}{{t1}|{t2}}{大家看你的眼神都不一樣了。|同事說你{sleuth}。}" : "{lead}。你決定自己把真相找出來，{把那天的帳一筆一筆重算，|把那天經手的每一張單子都翻出來，}{{t1}|{t2}}{大家看你的眼神都不一樣了。|同事說你{sleuth}。}"), mood: 1 }),
          },
        ],
      };
    },
  },
  {
    // 當幹部（記在 s.flags.cadre）。情境：被起鬨選班長、被指定當風紀股長、接社長或隊長、園遊會總召、畢業紀念冊總編輯
    // （畢業那一年）、學生會長（1995 年起的高中職、五專）。
    id: "t_leader", domain: "study", channel: "good", once: true, ages: [12, 18], when: s => pupil(s) && (s.age <= 17 || s.track === "五專"), p: s => (s.age >= 16 ? 0.14 : s.age === 12 ? 0.12 : 0.1),
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), f = bestFriend(s), fc = f ? f.call : "";
      const club = s.flags.club && s.flags.club !== "none" ? s.flags.club : null, head = club === "ball" ? "隊長" : "社長", ball = club === "ball";
      const last = (s.track === "國小" && s.age === 12) || (s.track === "國中" && s.age === 14) || (["高中", "高職"].includes(s.track) && s.age === (s.flags.trackAt ?? 15) + 2);
      const food = ctx.rng.pick(y < 1985 ? ["愛玉冰", "粉圓冰"] : y < 2005 ? ["熱狗", "炒麵", "紅茶"] : ["雞蛋糕", "珍珠奶茶", "章魚燒"]);
      const sc = sceneOf(ctx, [
        { key: "class", role: "班長", lead: f ? ctx.f("開學選幹部，{pal}起鬨提名你當班長，全班都在拍手", { pal: f.call }) : "開學選幹部，後排的同學起鬨提名你當班長，全班都在拍手" },
        { key: "order", role: "風紀股長", lead: "導師指定你當風紀股長，以後自習課要在黑板上記下講話的人" },
        { key: "club", role: head, w: club && s.track !== "國小" ? 1.5 : 0, lead: ball ? "球隊的學長姊要畢業了，最後一次練球時，他們說想把隊長交給你" : "社團的學長姊要畢業了，最後一次社課時，他們說想把社長交給你" },
        { key: "fair", role: "總召", w: y >= 1970 ? 1 : 0, lead: "校慶園遊會班上要擺攤，導師問誰要當總召，全班的眼睛都看向你" },
        { key: "book", role: "畢冊總編輯", w: last ? 2 : 0, lead: "畢業紀念冊要開始做了，大家推你當總編輯" },
        { key: "council", role: "學生會長", w: senior(s) && y >= 1995 ? 1 : 0, lead: f ? ctx.f("學生會要改選，{pal}說你最適合，硬要你出來選會長", { pal: f.call }) : "學生會要改選，同學說你最適合，硬要你出來選會長" },
      ]);
      const k = sc.key, lead = sc.lead, role = sc.role, vote = k === "council";
      const take = s2 => { s2.flags.cadre = role; stressBy(s2, 0.03); };
      // Each result is one template opened by the scene ({lead}), with these words.
      const V = {
        lead, who, fc, food, mate: f ? fc : "同學",
        split: { class: ctx.f("你喊口令、排打掃，{fc}收作業、記聯絡事項，", { fc }), order: "兩個人輪流站講台，一個記名字、一個負責提醒，", club: ball ? "一個管練球、一個管招生，" : "一個管社課、一個管招生，", fair: "一個顧攤位、一個跑採買，", book: "一個收照片、一個寫文字，" }[k],
      };
      const opt = (id, act, style, weight, label, hint, run, extra = {}) => ({ id: `t_leader.${id}`, label, hint, act, style, weight, ...extra, apply: (s2, c) => { const win = !vote || c.roll("study", "good", 0.45); const [text, mood, took] = run(win, c); if (took && win) take(s2); return { text: c.w(text, V), mood }; } });
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          opt("yes", "volunteer", "risk", 0.25,
            { class: "答應當班長", order: "接下，照規矩記", club: ball ? "接下隊長" : "接下社長", fair: "接下總召", book: "接下總編輯", council: "出來選" }[k], "累，但值得",
            win => [{
              class: "{lead}。你答應了，{每天早上第一個到教室開窗、喊「起立、敬禮」，|開學第一週就把座位表和打掃表全部排好，}{有一次全班太吵，你被導師叫到走廊談話。|期末全班送你一張簽滿名字的卡片。}",
              order: f ? "{lead}。你答應了，每節自習課都站在講台上記名字，{有人在背後叫你「抓耙仔」，你假裝沒聽到。|你記的第一個名字是{fc}，{fc}氣了你一整天。}{學期末，導師說班上的秩序是全年級最好的。|你學會了不用討好每一個人，也能把事情做好。}" : "{lead}。你答應了，每節自習課都站在講台上記名字，{有人在背後叫你「抓耙仔」，你假裝沒聽到。|你記的第一個名字是自己的好朋友，對方氣了你一整天。}{學期末，導師說班上的秩序是全年級最好的。|你學會了不用討好每一個人，也能把事情做好。}",
              club: ball ? "{lead}。你接下了隊長，{招生的時候在攤位前喊到喉嚨都啞了，|每週的練球都要你排，}{成果發表那天，你在後台一直數人數。|學弟妹叫你「隊長」的時候，你還是有點不習慣。}" : "{lead}。你接下了社長，{招生的時候在攤位前喊到喉嚨都啞了，|每週的社課都要你排，}{成果發表那天，你在後台一直數人數。|學弟妹叫你「社長」的時候，你還是有點不習慣。}",
              fair: "{lead}。你答應了，{訂材料、排班表、借瓦斯爐，全是你一手包辦，|班上決定賣{food}，你連算了三個晚上的成本，}{園遊會那天，攤位賣到一半就缺貨了。|收攤時算錢，比預期多賺了一些，全班拿去吃了一頓。}",
              book: "{lead}。你答應了，{收全班的照片收到快崩潰，|每天放學留下來排版面，}{畢冊印出來那天，大家搶著在最後一頁簽名。|你把自己寫的序言讀了好幾遍。}",
              council: win ? "{lead}。你出來選了，{在穿堂發傳單、在朝會上發表政見，|和{mate}熬夜做海報，}{開票那天你贏了，第一件事是爭取讓福利社多賣一種飲料。|開票那天你贏了，緊張到上台忘了說謝謝。}" : "{lead}。你出來選了，{在穿堂發傳單、在朝會上發表政見，|和{mate}熬夜做海報，}{結果差了幾十票落選，你卻覺得學到最多。|最後落選了，但好幾個學弟妹跑來說有投給你。}",
            }[k], vote && !win ? 0 : 2, true]),
          opt("team", "socialize", "social", 0.2,
            { class: ctx.f("答應，但要{fc}當副班長", { fc }), order: ctx.f("答應，請{fc}一起幫忙", { fc }), club: ctx.f("找{fc}一起扛", { fc }), fair: ctx.f("拉{fc}一起當總召", { fc }), book: ctx.f("找{fc}當副總編", { fc }), council: ctx.f("找{fc}當競選搭檔", { fc }) }[k], "一個人扛不來",
            win => [vote
              ? (win ? "{lead}。你找{fc}當搭檔出來選，{兩個人每天早上站在校門口喊口號，|你們把政見編成一首歌，在午休的廣播裡播出來，}{開票那天你們贏了，兩個人抱在一起跳。|開票那天你們贏了，{fc}比你還激動。}" : "{lead}。你找{fc}當搭檔出來選，{兩個人每天早上站在校門口喊口號，|你們把政見編成一首歌，在午休的廣播裡播出來，}{結果差一點點落選，兩個人去吃了一碗冰。|最後落選了，你們說這是最好玩的一次失敗。}")
              : "{lead}。你說要{fc}一起才答應，{{split}|你們每天下課都在走廊開「祕密會議」，}{雖然吵過幾次架，事情最後都辦得很好。|那一年你們變得更有默契。}", vote && !win ? 1 : 3, true],
            { when: () => !!f }),
          opt("change", "insist", "self", 0.15,
            { class: "答應，但要改一個規矩", order: "答應，但只提醒不記名", club: ball ? "接下隊長，大改一番" : "接下社長，大改一番", fair: "接下，照你的點子做", book: "接下，做一本不一樣的", council: "出來選，政見寫得大膽" }[k], "照你的方式做",
            win => [{
              class: "{lead}。你答應了，第一件事就是{跟導師爭取讓大家自己選座位，|把打掃工作改成每週輪換，}{有人說你太囂張，也有人說早該這樣。|導師想了一個禮拜，竟然答應了。}",
              order: "{lead}。你答應了，但跟導師說好只提醒、不記名，{第一週全班吵到隔壁班跑來抗議，|大家反而比較聽你的，}{到了期中，自習課安靜了很多。|導師說你找到了自己的方法。}",
              club: ball ? "{lead}。你接下了隊長，{把練球改成每個人輪流上台帶一次，|開始帶著大家去校外比賽，}{有幾個老成員不習慣，退出了。|那一年多了好多新面孔。}" : "{lead}。你接下了社長，{把社課改成每個人輪流上台帶一次，|開始帶著大家去校外比賽，}{有幾個老成員不習慣，退出了。|那一年多了好多新面孔。}",
              fair: "{lead}。你答應了，但堅持要賣{自己發明的口味|班上沒人賣過的東西}，{第一個小時沒人買，你差點想收攤。|結果大排長龍，連老師都來排隊。}",
              book: "{lead}。你答應了，還決定{每個人都要寫一句話給十年後的自己，|把全班的糗照做成一整頁，}{有人說太丟臉，最後卻是大家最常翻的一頁。|畢冊發下來那天，全班笑成一團。}",
              council: win ? "{lead}。你出來選，{政見寫著「午休可以不用趴著睡」，|政見是讓福利社賣什麼由全校投票，}{結果高票當選，第一個月就把政見做到了一半。|開票那天你贏了，台下的歡呼聲你一直記得。}" : "{lead}。你出來選，{政見寫著「午休可以不用趴著睡」，|政見是讓福利社賣什麼由全校投票，}{結果落選了，但那條政見後來真的被學校採用了。|最後差了幾十票，你笑著說明年再來。}",
            }[k], vote && !win ? 1 : 2, true]),
          opt("no", "wait", "safe", 0.25,
            { class: "婉拒", order: "說你做不來", club: "推給別人", fair: "說你沒空", book: "婉拒", council: "說你不適合" }[k], "不想被綁住",
            () => [{
              class: "{lead}。你{搖搖頭說自己做不來，|推說要專心讀書，}班長後來由別人接下了，{你偶爾有點羨慕。|你鬆了一口氣，把時間留給自己。}",
              order: "{lead}。你{搖搖頭說自己做不來，|推說要專心讀書，}風紀股長後來由別人接下了，{你偶爾有點羨慕。|你鬆了一口氣，把時間留給自己。}",
              club: ball ? "{lead}。你{搖搖頭說自己做不來，|推說要專心讀書，}隊長後來由別人接下了，{你偶爾有點羨慕。|你鬆了一口氣，把時間留給自己。}" : "{lead}。你{搖搖頭說自己做不來，|推說要專心讀書，}社長後來由別人接下了，{你偶爾有點羨慕。|你鬆了一口氣，把時間留給自己。}",
              fair: "{lead}。你{搖搖頭說自己做不來，|推說要專心讀書，}總召後來由別人接下了，{你偶爾有點羨慕。|你鬆了一口氣，把時間留給自己。}",
              book: "{lead}。你{搖搖頭說自己做不來，|推說要專心讀書，}畢冊總編輯後來由別人接下了，{你偶爾有點羨慕。|你鬆了一口氣，把時間留給自己。}",
              council: "{lead}。你{搖搖頭說自己做不來，|推說要專心讀書，}學生會長後來由別人當上了，{你偶爾有點羨慕。|你鬆了一口氣，把時間留給自己。}",
            }[k], 0, false]),
          opt("family", "talk", "family", 0.15, ctx.f("回家問{who}", { who }), "聽聽家人的意見",
            win => [vote
              ? (win ? "{lead}。你回家問{who}，{who}{說：「去試試看，輸了也沒關係。」|說：「功課顧好就好，其他的你自己決定。」}你想了一晚，決定出來選，結果真的選上了。" : "{lead}。你回家問{who}，{who}{說：「去試試看，輸了也沒關係。」|說：「功課顧好就好，其他的你自己決定。」}你想了一晚，決定出來選，結果差一點點落選。")
              : "{lead}。你回家問{who}，{who}{說：「去試試看，做不好也沒關係。」你隔天就答應了。|說：「功課顧好就好，其他的你自己決定。」你想了一晚，還是答應了。|笑著說你小時候連排隊都排不好，現在要管這麼多人了。你決定試試看。}", vote && !win ? 0 : 2, true]),
        ],
      };
    },
  },
  {
    // 筆友和網友（依年代）：雜誌的筆友欄（1995 年以前）、英文課配的國外筆友（1975–1999 的學生）、BBS 和聊天室（1995–2003）、
    // 線上遊戲、無名小站、IG、手遊、Discord（2004 年起），網友一直要你的照片（2008 年起）。
    id: "t_penpal", once: true, ages: [13, 17], when: s => !s.abroad, p: s => (s.age >= 16 ? 0.14 : 0.1),
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), f = bestFriend(s), buddy = f ? f.call : "同學", city = s.county || "你住的城市";
      const sex = ctx.rng() < 0.6 ? s.sex : s.sex === "male" ? "female" : "male";
      const p = ctx.person({ role: "friend", sex, birthYear: s.birthYear + ctx.rng.int(3) - 1, how: y < 1995 ? "筆友" : "網友" });
      const name = p.call, ta = pronoun(p);
      const far = ctx.rng.pick(COUNTIES.map(c => c[0]).filter(c => c !== s.county && c !== "金門縣"));
      const fname = ctx.rng.pick(sex === "female" ? ["Emily", "Sarah", "Anna", "Yuki"] : ["Tom", "David", "Peter", "Kenji"]);
      const land = /Yuki|Kenji/.test(fname) ? "日本" : ctx.rng.pick(["美國", "加拿大", "澳洲", "英國"]), en = padded(ctx, fname).trimStart();
      const nick = ctx.rng.pick(["藍色天空", "夜貓子", "小熊軟糖", "星期五", "不睡覺的魚"]);
      const net = y < 2013 ? ctx.rng.pick(["線上遊戲的公會", "無名小站的留言板"]) : ctx.rng.pick(["手遊的公會", "IG 上追同一個偶像的帳號", ...(y >= 2018 ? ["Discord 的群組"] : [])]);
      const sc = sceneOf(ctx, [
        { key: "letter", w: y < 1995 ? 2 : 0, lead: ctx.f("你和雜誌筆友欄認識的{name}寫信寫了大半年，{ta}說暑假要來{city}，想跟你見一面", { name, ta, city }) },
        { key: "abroad", w: y >= 1975 && y < 2000 && s.studying ? 1 : 0, lead: ctx.f("英文老師幫全班配了國外的筆友，{land}的{fname}已經寄來第三封信，說明年暑假要跟家人來台灣，想去你家看看", { land, fname: padded(ctx, fname) }) },
        { key: "bbs", w: y >= 1995 && y < 2004 ? 2 : 0, lead: y < 1999 ? ctx.f("你在 BBS 的聊天版認識了網友「{nick}」，每天放學都聊到家裡的電話打不進來，最近{ta}說想約出來見面", { nick, ta }) : ctx.f("你在網路聊天室認識了網友「{nick}」，每天放學都聊到家裡的電話打不進來，最近{ta}說想約出來見面", { nick, ta }) },
        { key: "net", w: y >= 2004 ? 2 : 0, lead: ctx.f("你在{net}認識了網友{name}，每天都聊到半夜，{ta}說週末想約出來見面", { net: padded(ctx, net), name, ta }) },
        { key: "photo", w: y >= 2008 ? 1 : 0, lead: ctx.f("你在{net}認識的一個網友，聊了好幾個月，最近一直要你傳一張照片，還問你讀哪一所學校", { net: padded(ctx, net) }) },
      ]);
      const k = sc.key, lead = sc.lead, online = k === "bbs" || k === "net", them = k === "bbs" ? ctx.f("「{nick}」", { nick }) : name;
      // Each result is one template opened by the scene ({lead}), with these words.
      const V = { lead, who, buddy, name, ta, en, nick, them, far, county: s.county, star: y >= 2015 ? "網紅" : "明星", songs: y >= 1990 ? "國語流行歌" : "民歌" };
      const opt = (id, act, style, weight, labels, hints, texts, mood, more = null) => ({ id: `t_penpal.${id}`, label: labels[k], hint: hints[k] || hints.net, act, style, weight, apply: (s2, c) => { if (more) more(s2, c); return { text: c.w(texts[k], V), mood: typeof mood === "number" ? mood : mood[k] ?? mood.net }; } });
      const meetOk = (s2, c) => { if (k === "letter" || online) befriend(s2, c, p); };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          opt("meet", "socialize", "risk", 0.2,
            { letter: "約在車站見面", abroad: ctx.f("帶{fname}逛{city}", { fname: padded(ctx, fname), city }), bbs: "約在人多的地方見面", net: "約在人多的地方見面", photo: "傳一張照片過去" },
            { letter: "拉朋友一起去", abroad: "練英文的好機會", net: "拉朋友一起去", photo: "應該沒關係吧" },
            {
              letter: "{lead}。你們約在火車站前見面，你拉著{buddy}一起去，{{name}本人比信裡還害羞，你們吃了一碗冰就聊開了。|{name}一眼就認出你，說你跟信裡寫的一模一樣。}{那天之後，信寫得更勤了。|回家後，你把那天的車票夾進了日記本。}",
              abroad: "{lead}。你答應了，{en}來的那天，你{帶{ta}去夜市吃臭豆腐，|帶{ta}去廟裡看人拜拜，}{你的英文說得結結巴巴，兩個人比手畫腳也笑得很開心。|{ta}回國後寄來一張全家福，背面寫著你教{ta}的那句台語。}",
              bbs: "{lead}。你們約在車站前的速食店，你拉著{buddy}一起去。網友「{nick}」本名叫{name}，{本人比你想像的害羞，|講話比網路上還好笑，}{你們聊了一個下午。|回家後，你們在網路上聊得更起勁了。}",
              net: "{lead}。你們約在車站前的速食店，你拉著{buddy}一起去，{{name}本人跟照片差不多，就是比較害羞，|{name}比你想像的矮一點，講話很好笑，}{三個人聊了一個下午。|回家後，你們在網路上聊得更起勁了。}",
              photo: "{lead}。你挑了一張照片傳過去，{對方回傳的照片，卻是網路上一搜就找得到的{star}照，|對方接著一直問你家住在哪裡，}{你嚇了一跳，馬上封鎖了對方。|你把這件事告訴了{buddy}，兩個人越想越不對勁，一起把對方封鎖了。}",
            }, { net: 3, photo: -2 }, meetOk),
          opt("keep", "wait", "safe", 0.3,
            { letter: "繼續寫信就好", abroad: "寫信介紹台灣就好", bbs: "先在網路上聊就好", net: "先在網路上聊就好", photo: "不傳，換個話題" },
            { letter: "見面會不會很尷尬", abroad: "不麻煩人家", net: "不急著見面", photo: "照片不急" },
            {
              letter: "{lead}。你回信說還想再寫一陣子，{你們從考試寫到喜歡的歌，|信封上的郵票一張比一張漂亮，}{那疊信你一直收在餅乾鐵盒裡。|後來升學忙了，信越寫越少，卻一直沒斷。}",
              abroad: s.county ? "{lead}。你回信說家裡太小，改寄了一大包台灣的明信片給{ta}，{還附上一張你用英文寫的{county}介紹，|在信裡教{ta}寫「你好」兩個字，}{{ta}回信說要把明信片貼滿房間。|後來你們一直通信到大學。}" : "{lead}。你回信說家裡太小，改寄了一大包台灣的明信片給{ta}，{還附上一張你用英文寫的家鄉介紹，|在信裡教{ta}寫「你好」兩個字，}{{ta}回信說要把明信片貼滿房間。|後來你們一直通信到大學。}",
              bbs: "{lead}。你說還不想見面，{你們繼續在網路上聊，從功課聊到喜歡的歌，|「{nick}」也沒有勉強你，}{後來{ta}換了帳號，你們就慢慢斷了聯絡。|那段每天聊到半夜的日子，你一直記得。}",
              net: "{lead}。你說還不想見面，{你們繼續在網路上聊，從功課聊到喜歡的歌，|{name}也沒有勉強你，}{後來{name}換了帳號，你們就慢慢斷了聯絡。|那段每天聊到半夜的日子，你一直記得。}",
              photo: "{lead}。你說不想傳照片，{對方又問了好幾次，|對方說了一聲「好吧」就不太回了，}{你越想越不對勁，就沒再聊了。|你發現在網路上，有些事還是要留給自己。}",
            }, 1),
          opt("tell", "talk", "family", 0.2,
            { letter: ctx.f("先跟{who}說", { who }), abroad: ctx.f("先跟{who}說", { who }), bbs: ctx.f("先跟{who}說", { who }), net: ctx.f("先跟{who}說", { who }), photo: ctx.f("把對話拿給{who}看", { who }) },
            { net: "讓家人知道" },
            {
              letter: "{lead}。你把信拿給{who}看，{who}{看完笑說你們的字都好醜，答應讓{name}來家裡吃飯。那天{name}在你家吃了三碗飯。|說要陪你一起去車站，你嘴上抱怨，心裡卻安心多了。見完面，{who}還請你們吃了一碗冰。}{那是你第一次交到外地的朋友。|}",
              abroad: "{lead}。你跟{who}說了，{who}{緊張得把家裡大掃除了一遍，|特地去買了一本英文會話，}{{en}來的那天，{who}煮了一整桌菜。|那是你們家第一次來外國的客人。}",
              bbs: "{lead}。你把這件事告訴了{who}，{who}{沒有罵你，只要你約在白天、人多的地方，還要你隨時打電話回家。|說要陪你去，最後坐在隔壁桌假裝看報紙。}{見面那天一切順利，{them}就是一個跟你一樣的學生。|那天之後，你什麼事都比較敢跟{who}說了。}",
              net: "{lead}。你把這件事告訴了{who}，{who}{沒有罵你，只要你約在白天、人多的地方，還要你隨時打電話回家。|說要陪你去，最後坐在隔壁桌假裝在滑手機。}{見面那天一切順利，{them}就是一個跟你一樣的學生。|那天之後，你什麼事都比較敢跟{who}說了。}",
              photo: "{lead}。你把對話拿給{who}看，{who}皺起眉頭，{陪你一起把那個帳號封鎖了。|教你怎麼把個人資料設成不公開。}{你把手機裡的隱私設定都重新檢查了一遍。|你很慶幸自己先開了口。}",
            }, 2, meetOk),
          opt("stop", "cutOff", "self", 0.15,
            { letter: "不再回信", abroad: "不回信了", bbs: "不再上線找對方", net: "不再回了", photo: "直接封鎖" },
            { letter: "突然覺得有點怪", abroad: "用英文寫信好累", net: "突然覺得有點怪", photo: "這樣不對勁" },
            {
              letter: "{lead}。你一直沒有回信，{後來{name}又寄來兩封，你都沒有拆，|那年暑假你一直怕在路上遇到{ta}，}{很多年後整理抽屜看到那疊信，你有點後悔。|你把那幾封信收進抽屜最裡面。}",
              abroad: "{lead}。你一直拖著沒回信，{{en}又寄來一張聖誕卡，|英文課本裡還夾著{ta}的最後一封信，}{後來就沒有消息了。|很多年後，你還記得信封上那張外國郵票。}",
              bbs: "{lead}。你突然覺得有點怪，就不再上線找{ta}了，{「{nick}」留了好幾封站內信，|後來那個帳號再也沒亮過，}{你有時候會想，{ta}是不是真的只是想交朋友。|你覺得自己做得沒錯。}",
              net: "{lead}。你突然覺得有點怪，就不再回了，{{name}傳來的訊息一則一則堆著，|後來那個帳號再也沒亮過，}{你有時候會想，{ta}是不是真的只是想交朋友。|你覺得自己做得沒錯。}",
              photo: "{lead}。你直接封鎖了對方，{把那段對話全部刪掉，|順手把自己的帳號改成不公開，}{之後在網路上交朋友，你都多留了一個心眼。|你覺得自己做得沒錯。}",
            }, { letter: -1, net: 0 }),
          opt("share", "hobby", "learn", 0.15,
            { letter: y >= 1975 ? "交換自己錄的錄音帶" : "交換自己畫的明信片", abroad: "交換家鄉的歌", bbs: "一起寫接龍小說", net: ctx.f("跟{name}一起學東西", { name }), photo: "只聊興趣，不聊私事" },
            { abroad: "用音樂交朋友", net: "有共同的興趣", photo: "保持一點距離" },
            {
              letter: y >= 1975 ? "{lead}。你們約好每個月寄一捲自己錄的錄音帶，{你錄了廣播裡最喜歡的歌，|{name}錄了{ta}家附近夜市的聲音，}{你在那捲帶子裡聽到了另一個城市。|那幾捲錄音帶你一直留著。}" : "{lead}。你們約好每個月寄一張自己畫的明信片，{你畫了家門口的大榕樹，|{name}畫了{far}的老街，}{你把那些明信片貼滿了書桌前的牆。|那幾張明信片你一直留著。}",
              abroad: "{lead}。你們開始交換家鄉的歌，{你寄了一捲{songs}的錄音帶，|{en}寄來一捲{ta}最愛的樂團，}{你照著歌詞本一個字一個字查字典。|那是你英文進步最快的一年。}",
              bbs: "{lead}。你們決定先不見面，一起在版上寫一篇接龍小說，{你寫一段、「{nick}」接一段，|每天放學第一件事就是看{ta}寫到哪裡，}{版上竟然有人追著看。|那篇小說最後寫了三十幾集。}",
              net: "{lead}。你們先不見面，約好一起{學畫畫|學剪影片|練同一首歌}，{每天互傳自己的進度，|{name}教了你很多你不知道的技巧，}{你發現自己真的進步了。|那是你第一個不用見面的好朋友。}",
              photo: "{lead}。你說只聊興趣、不聊私事，{對方慢慢就不找你了，|後來你們只在群組裡打招呼，}{你覺得這樣剛剛好。|你學會了在網路上替自己留一道門。}",
            }, 2),
        ],
      };
    },
  },
  {
    // 比賽和功課卡在一起。情境：演講作文比賽遇上段考、校隊集訓、班際合唱比賽、暑假做科展、機器人比賽（2010 年起）。
    id: "t_contest", domain: "study", channel: "good", once: true, ages: [12, 18], when: s => pupil(s) && (s.age <= 17 || s.track === "五專"), p: s => (s.age >= 16 ? 0.16 : 0.12),
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), role = s.flags.talent === "piano" ? "伴奏" : "指揮";
      const kind = ctx.rng.pick(["演講", "作文", "朗讀", "書法", ...(y >= 1985 ? ["英文演講"] : [])]);
      const team = s.flags.club === "ball" ? "球隊" : ctx.rng.pick(["籃球隊", "田徑隊", "排球隊"]), track = team === "田徑隊";
      const sc = sceneOf(ctx, [
        { key: "speech", act: "hobby", coach: "老師", lead: ctx.f("老師推薦你代表班上參加{kind}比賽，比賽那週剛好是段考", { kind }) },
        { key: "team", act: "exercise", coach: "教練", w: s.flags.club === "ball" ? 3 : 1, lead: ctx.f(track ? "{team}要參加{level}了，教練要大家每天練到七點，你的成績卻一直往下掉" : "{team}要打{level}了，教練要大家每天練到七點，你的成績卻一直往下掉", { team, level: ctx.rng.pick(["縣賽", "區域賽", "全國賽"]) }) },
        { key: "choir", act: "hobby", coach: "導師", lead: ctx.f("班際合唱比賽快到了，導師要你當{role}，每天早自習和午休都要練", { role }) },
        { key: "fair", act: "hobby", coach: "自然老師", w: y >= 1965 ? 1 : 0, lead: ctx.rng.pick(["自然老師找你做科展，暑假每天都要到學校的實驗室記錄豆芽長多高", "自然老師找你做科展，暑假每天都要到學校的實驗室觀察螞蟻搬家", "自然老師找你做科展，暑假每天都要到學校的實驗室測河水的水質"]) },
        { key: "robot", act: "hobby", coach: "指導老師", w: y >= 2010 ? 1.2 : 0, lead: "學校的機器人社要參加比賽，社長拉你進隊，週末都要留在學校寫程式" },
      ]);
      const k = sc.key, lead = sc.lead, coach = sc.coach;
      const prep = { speech: kind === "書法" ? "每天放學在教室寫掉一大疊報紙" : kind === "作文" ? "每天寫一篇作文拿去給老師改" : "每天放學對著鏡子練到口乾舌燥", team: "每天練到天黑才回家", choir: role === "伴奏" ? "每天午休都在音樂教室練伴奏" : "每天對著鏡子練指揮的手勢", fair: "每天記錄、拍照、畫圖表", robot: "把程式改了一遍又一遍" }[k];
      // Going all out: [won, lost], each one template opened by the scene ({lead}).
      const all = {
        speech: ["{lead}。你決定全力拚比賽，{prep}，{結果拿了第{一|二|三}名，獎狀貼在客廳的牆上。|上台領獎時，你的腿還在抖。}{|那次段考退步了一點，你也認了。}", "{lead}。你決定全力拚比賽，{prep}，{結果沒有得名，你卻記得站在台上的每一秒。|最後只拿了佳作，你還是覺得很值得。}{|那次段考退步了一點，你也認了。}"],
        team: track
          ? ["{lead}。你決定全力拚比賽，{prep}，{比賽那天，你跑出了自己最好的成績。|你拿到了一面獎牌，教練拍了拍你的頭。}{|那次段考退步了一點，你也認了。}", "{lead}。你決定全力拚比賽，{prep}，{比賽那天你起跑慢了半步，沒有進決賽。|你沒拿到名次，但破了自己的紀錄。}{|那次段考退步了一點，你也認了。}"]
          : ["{lead}。你決定全力拚比賽，{prep}，{你們一路打進了前四強。|最後一球進的時候，全隊衝進場內抱成一團。}{|那次段考退步了一點，你也認了。}", "{lead}。你決定全力拚比賽，{prep}，{第一場就輸了，全隊在場邊哭成一團，教練說明年再來。|最後沒有晉級，但那是你最熱血的一段日子。}{|那次段考退步了一點，你也認了。}"],
        choir: ["{lead}。你決定全力拚比賽，{prep}，{全班拿到第一名，在台上抱在一起尖叫。|最後一個音落下，評審點了點頭，全班拿了第二名。}{|那次段考退步了一點，你也認了。}", "{lead}。你決定全力拚比賽，{prep}，{結果沒有得名，但大家唱完都笑了。|全班只拿了第五名，你還是覺得那首歌唱得最好聽。}{|那次段考退步了一點，你也認了。}"],
        fair: ["{lead}。你決定全力拚比賽，{prep}，{作品拿到了縣賽的優等，還被送去全國展覽。|評審問了你好多問題，你都答得出來。}", "{lead}。你決定全力拚比賽，{prep}，{作品沒有得獎，但你學會了怎麼做實驗。|評審說你的題目很有趣，只是數據不夠多。}"],
        robot: ["{lead}。你決定全力拚比賽，{prep}，{你們的機器人跑完全程，拿了第三名。|比賽那天你們修到最後一分鐘，機器人終於動了起來，還拿了佳作。}{|那次段考退步了一點，你也認了。}", "{lead}。你決定全力拚比賽，{prep}，{機器人比賽時突然卡住，你們只能看著它停在半路。|最後沒有得名，你們約好明年再來。}{|那次段考退步了一點，你也認了。}"],
      }[k];
      const doing = { speech: "練習比賽", team: track ? "練跑" : "練球", choir: "練唱", fair: "待在實驗室", robot: "寫程式" }[k];
      const V = {
        lead, who, role, coach, prep, doing,
        drop: { speech: "跟老師說要專心準備段考，把機會讓給了別人", team: "跟教練請了一個月的假", choir: ctx.f("請導師找別人當{role}", { role }), fair: "跟自然老師說暑假要補習", robot: "跟社長說要先顧功課" }[k],
        exam: k === "fair" ? "開學的段考" : "那次段考",
        watch: { speech: "只是比賽那天，你在台下看得心裡有點酸。", team: "只是比賽那天，你在看台上喊到喉嚨都啞了。", choir: "比賽那天，你站在隊伍裡跟著大家一起唱。", fair: "只是看到同學的作品得獎，你心裡有點酸。", robot: "只是看到隊友抱著獎盃回來，你心裡有點酸。" }[k],
      };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          {
            id: "t_contest.all", label: { speech: ctx.f("全力準備{kind}比賽", { kind }), team: track ? "全心練習" : "全心練球", choir: ctx.f("全心當好{role}", { role }), fair: "整個暑假泡在實驗室", robot: "週末都耗在社團教室" }[k], hint: "這是你喜歡的事", act: sc.act, style: "self", weight: 0.25,
            apply: (s2, c) => { const win = c.roll("study", "good", 0.4); return { text: c.w(win ? all[0] : all[1], V), mood: win ? 4 : 1 }; },
          },
          {
            id: "t_contest.both", label: "兩邊都顧，睡少一點", hint: "比賽和成績都要", act: "pushThrough", style: "risk", weight: 0.25,
            apply: (s2, c) => {
              stressBy(s2, 0.04); const win = c.roll("study", "good", 0.35);
              const text = k === "fair"
                ? (win ? "{lead}。你決定兩邊都顧，{白天待在實驗室，晚上去補習，|上午做實驗，下午寫暑假作業，}{比賽拿了名次，成績也沒掉，只是黑眼圈深了一圈。|最後比賽和成績都撐住了，你在公車上睡到過站。}" : "{lead}。你決定兩邊都顧，{白天待在實驗室，晚上去補習，|上午做實驗，下午寫暑假作業，}{比賽沒有得名，成績也只是普普通通，你累得在公車上睡過了站。|結果比賽和成績都差了一點點，你還是不後悔。}")
                : (win ? "{lead}。你決定兩邊都顧，{放學先{doing}，回家再讀書讀到半夜，|下課十分鐘也拿來背單字，}{比賽拿了名次，成績也沒掉，只是黑眼圈深了一圈。|最後比賽和成績都撐住了，你在公車上睡到過站。}" : "{lead}。你決定兩邊都顧，{放學先{doing}，回家再讀書讀到半夜，|下課十分鐘也拿來背單字，}{比賽沒有得名，成績也只是普普通通，你累得在公車上睡過了站。|結果比賽和成績都差了一點點，你還是不後悔。}");
              return { text: c.w(text, V), mood: win ? 2 : -1 };
            },
          },
          {
            id: "t_contest.study", label: { speech: "推掉比賽，專心考試", team: "先跟教練請假", choir: ctx.f("請導師換人當{role}", { role }), fair: "說暑假要補習", robot: "說要先顧功課" }[k], hint: "成績比較要緊", act: "study", style: "safe", weight: 0.2,
            apply: (s2, c) => ({ text: c.w("{lead}。你{drop}，{成績穩穩的，|{exam}考得不錯，}{{watch}|你告訴自己，以後還有機會。}", V), mood: 0 }),
          },
          {
            id: "t_contest.ask", label: { speech: "跟老師商量時間", team: "跟教練談練習時間", choir: "請大家一起調時間", fair: "跟老師商量進度", robot: "跟隊友重新分工" }[k], hint: "找出兩全的辦法", act: "negotiate", style: "social", weight: 0.15,
            apply: (s2, c) => {
              const win = c.roll("study", "good", 0.4);
              const text = {
                choir: win ? "{lead}。你去跟導師和同學商量，{大家決定段考前一週先停練，|大家把練唱改到午休的前半段，}{你兩邊都沒放棄，比賽還拿了名次。|比賽和功課都比你想的順利。}" : "{lead}。你去跟導師和同學商量，{大家決定段考前一週先停練，|大家把練唱改到午休的前半段，}{比賽沒得名，但功課穩住了。|兩邊都顧到了，你覺得自己長大了一點。}",
                fair: win ? "{lead}。你跟自然老師商量，{把實驗改成每週去三天，|老師答應讓你早上做實驗、下午去補習，}{你兩邊都沒放棄，比賽還拿了名次。|比賽和功課都比你想的順利。}" : "{lead}。你跟自然老師商量，{把實驗改成每週去三天，|老師答應讓你早上做實驗、下午去補習，}{比賽沒得名，但功課穩住了。|兩邊都顧到了，你覺得自己長大了一點。}",
                robot: win ? "{lead}。你跟隊友重新分工，{你負責寫程式、隊友負責組裝，|週末只去半天，晚上再各自在家改程式，}{你兩邊都沒放棄，比賽還拿了名次。|比賽和功課都比你想的順利。}" : "{lead}。你跟隊友重新分工，{你負責寫程式、隊友負責組裝，|週末只去半天，晚上再各自在家改程式，}{比賽沒得名，但功課穩住了。|兩邊都顧到了，你覺得自己長大了一點。}",
              }[k] || (win ? "{lead}。你去跟{coach}商量，{{coach}答應考前一週讓你先回家讀書，|{coach}把練習改到考完試以後，}{你兩邊都沒放棄，比賽還拿了名次。|比賽和功課都比你想的順利。}" : "{lead}。你去跟{coach}商量，{{coach}答應考前一週讓你先回家讀書，|{coach}把練習改到考完試以後，}{比賽沒得名，但功課穩住了。|兩邊都顧到了，你覺得自己長大了一點。}");
              return { text: c.w(text, V), mood: win ? 3 : 1 };
            },
          },
          {
            id: "t_contest.family", label: ctx.f("問{who}的意見", { who }), hint: "聽聽家人怎麼說", act: "talk", style: "family", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("{lead}。你回家問{who}，{who}{說：「成績我不擔心，你想比就去比。」比賽那天，{who}特地請假來看。|說：「先把書讀好，比賽以後還有。」你嘴上答應，心裡偷偷記下了明年比賽的日子。|想了很久，說：「你自己決定，我都支持你。」你想了一個晚上，做出了自己的決定。}", V), mood: 2 }),
          },
        ],
      };
    },
  },
  {
    // 服儀（依年代）：髮禁時代的頭髮檢查（2005 年以前）、朝會的服裝檢查（1995 年以前）、糾察隊（1985–2015）、
    // 冬天在制服外加穿自己的外套（2005–2015）、學生會提案穿便服（2016 年起）。
    id: "t_uniform", domain: "study", channel: "bad", once: true, ages: [13, 17], when: inSchool, p: () => 0.13,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), off = officerOf(s), office = officeOf(s), girl = s.sex === "female";
      const note = s.track === "國中" ? "聯絡簿" : "字條";
      const item = ctx.rng.pick([girl ? { it: "改短的裙子", fix: ctx.f("{who}連夜幫你把裙襬放了回去", { who }) } : { it: "改窄的褲管", fix: ctx.f("{who}帶你去修改店把褲管放了回去", { who }) }, { it: "白襪子上的花邊", fix: "你把襪子換成了學校規定的素面白襪" }, { it: "剪短背帶的書包", fix: ctx.f("{who}一邊幫你把背帶縫回去，一邊念你亂花心思", { who }) }, { it: "沒繡學號的制服", fix: ctx.f("{who}帶你去學校附近的繡學號攤，把學號繡了上去", { who }) }]);
      const miss = ctx.rng.pick([{ what: "戴名牌", fix: "把名牌別上" }, { what: girl ? "把襯衫紮進裙子裡" : "把襯衫紮進褲子裡", fix: "把襯衫紮好" }, { what: "穿學校規定的皮鞋", fix: "答應明天換上皮鞋" }]);
      const sc = sceneOf(ctx, [
        { key: "hair", w: y < 2005 ? 2 : 0, lead: girl ? ctx.f("早上進校門時，{off}拿著尺站在門口，說你的髮尾已經碰到衣領了", { off }) : ctx.f("早上進校門時，{off}拿著尺站在門口，說你的頭髮長到可以用手抓起來了", { off }) },
        { key: "check", w: y < 1995 ? 1.5 : 0, lead: ctx.f("朝會時{off}一排一排檢查服裝，你{it}被當場抓到", { off, it: item.it }) },
        { key: "patrol", w: y >= 1985 && y < 2016 ? 1 : 0, lead: ctx.f("你剛進校門，糾察隊的學長姊就把你攔下來，說你沒有{what}", { what: miss.what }) },
        { key: "coat", w: y >= 2005 && y < 2016 ? 2 : 0, lead: ctx.f("天氣變冷，你在制服外面套了一件自己的外套，在校門口被{off}攔下來", { off }) },
        { key: "vote", w: y >= 2016 ? 2 : 0, lead: "學生會提案讓大家可以穿便服上學，班會要討論，大家吵成一團" },
      ]);
      const k = sc.key, lead = sc.lead;
      // Each result is one template opened by the scene ({lead}), with these words.
      const V = {
        lead, who, off, office, note, fix: item.fix, mend: miss.fix,
        later: y >= 2000 ? "幾年後髮禁真的解除了，你想起那天還是有點驕傲。" : "那件事你到現在還記得。",
        hide: girl ? "把頭髮綁起來塞進衣領" : "每天早上用水把頭髮壓得扁扁的", ruling: y >= 2010 ? "隔年學校改了規定。" : "學校說會再研究。",
      };
      const opt = (id, act, style, weight, label, hint, text, mood) => ({ id: `t_uniform.${id}`, label, hint, act, style, weight, apply: (s2, c) => ({ text: c.w(text, V), mood }) });
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          opt("obey", "reconcile", "safe", 0.35, { hair: "放學就去剪", check: "乖乖改好", patrol: "當場改好", coat: "把外套脫掉", vote: "投給維持制服" }[k], k === "vote" ? "穿制服也沒什麼不好" : "規定就是規定", {
            hair: girl ? "{lead}。放學你就去巷口的家庭理髮店，{理髮師傅一刀剪到耳下，你看著鏡子差點哭出來，|剪完的瀏海齊得像用尺畫的，}{隔天同學笑你是西瓜皮。|{who}倒是說這樣看起來比較有精神。}" : "{lead}。放學你就去巷口的家庭理髮店，{師傅拿起電剪三兩下就推平了，|剪完摸著刺刺的後腦勺，}{隔天同學笑你像剛剃完毛的綿羊。|{who}倒是說這樣看起來比較有精神。}",
            check: "{lead}。{fix}，{之後你每天出門前都先檢查一遍。|那年你成了全班服裝最整齊的人。}",
            patrol: "{lead}。你當場{mend}，{學長姊點點頭讓你進去了，|還是被記了一次名字，}{之後每天出門前都先照一下鏡子。|你覺得有點丟臉，但也就這樣了。}",
            coat: "{lead}。你把外套脫下來塞進書包，{一整天冷得直搓手，|改穿了兩件學校的長袖制服，}{隔天{who}陪你去買了一件學校的外套。|你在週記上寫了這件事，導師回了一句「我也覺得冷」。}",
            vote: "{lead}。你投給維持穿制服，{覺得每天不用想穿什麼也不錯，|說制服會是畢業後最懷念的東西，}{結果只差兩票，|最後學校決定一週開放一天便服，}{大家吵完還是一起去吃午餐。|你覺得能這樣吵一吵也很好。}",
          }[k], 0),
          opt("argue", "insist", "risk", 0.15, { hair: ctx.f("跟{off}說規定不合理", { off }), check: ctx.f("跟{off}理論", { off }), patrol: "跟糾察隊理論", coat: ctx.f("跟{off}說真的很冷", { off }), vote: "上台支持穿便服" }[k], "說出你的想法", {
            hair: "{lead}。你跟{off}說，頭髮長短跟讀書沒有關係，{結果被記了一支警告，|{off}愣了一下，罰你去掃一個禮拜的廁所，}{但你一點都不後悔。|{later}}",
            check: "{lead}。你跟{off}爭了幾句，說這又不影響上課，{被記了一支警告，|被叫去{office}罰站了一節課，}{回家又被{who}念了一頓。|但你覺得很值得。}",
            patrol: "{lead}。你跟糾察隊的學長姊說規定沒寫得那麼細，{結果被記下名字送到{office}，|學長姊被你問得答不出來，揮揮手讓你進去了，}{你覺得自己說得沒錯。|你有點得意，又有點心虛。}",
            coat: "{lead}。你跟{off}說天氣真的很冷，學校的外套又不夠暖，{{off}看了你一眼，說下不為例，|還是被記了一次，}{後來班上好幾個同學都跟你一樣穿。|隔年冬天，學校開放可以在制服外面加穿外套。}",
            vote: "{lead}。你站上講台支持穿便服，{說一個人穿什麼不影響他讀書，|說制服太熱、太貴，又不好洗，}{台下有人鼓掌，也有人噓你。|最後學校開放每週一天便服日。}{|你第一次覺得自己的話有人聽。}",
          }[k], 1),
          opt("dodge", "avoid", "self", 0.2, { hair: girl ? "把頭髮綁起來藏好" : "用水把頭髮壓扁", check: "下次藏好一點", patrol: "明天早點到", coat: "進校門前先脫掉", vote: "不想管，反正都行" }[k], "不想多事", {
            hair: "{lead}。你{hide}，{每天早上從側門溜進學校，|看到{off}就繞路走，}{撐了一個多月還是被抓到，最後乖乖去剪了。|居然一直撐到學期末都沒被抓到。}",
            check: "{lead}。你嘴上說好，{之後每到朝會就換回規定的樣子，|只有朝會那天才乖乖照規定，}{{off}好像也睜一隻眼閉一隻眼。|一直到畢業都沒再被抓到。}",
            patrol: "{lead}。你決定隔天早一點到，{七點不到就溜進教室，|專挑糾察隊還沒站好的時候進校門，}{那學期你一次也沒被攔下來。|同學說你是全班最早到的人。}",
            coat: "{lead}。你每天走到校門口前就把外套脫掉塞進書包，{一進教室再穿回來，|在{off}看不到的地方才拿出來，}{一整個冬天都沒被抓到。|有一次忘了脫，被抓個正著。}",
            vote: "{lead}。你覺得穿什麼都可以，沒有舉手，{趴在桌上等大家吵完，|在底下偷偷寫數學作業，}{最後學校開放每週一天便服日，你還是每天穿制服。|結果是什麼你也沒放在心上。}",
          }[k], 1),
          opt("petition", "negotiate", "social", 0.15, { hair: "找同學一起向學校反映", check: "找同學一起向學校反映", patrol: "在班會上提出來", coat: "發起連署", vote: "幫忙整理大家的意見" }[k], "大家一起說比較有用", {
            hair: "{lead}。你和幾個同學在班會上提出來，{請班長把大家的意見寫進班會紀錄，|一起在週記裡寫了同一件事，}{學校沒有改規定，但{off}之後檢查時寬鬆了一點。|導師在週記上回了一句「我會幫你們反映」。}",
            check: "{lead}。你和幾個同學在班會上提出來，{請班長把大家的意見寫進班會紀錄，|一起在週記裡寫了同一件事，}{學校沒有改規定，但{off}之後檢查時寬鬆了一點。|導師在週記上回了一句「我會幫你們反映」。}",
            patrol: "{lead}。你在班會上提出糾察隊的標準不一致，{班長把它寫進了班會紀錄，|全班投票通過，送到了{office}，}{後來糾察隊的檢查表多了一條說明。|下個月，糾察隊檢查的方式真的改了。}",
            coat: "{lead}。你和幾個同學發起連署，請學校讓大家冬天可以在制服外加穿外套，{一個禮拜就收到了好幾百個簽名，|學生會也出來幫忙，}{{ruling}|你第一次知道，事情是可以去爭取的。}",
            vote: "{lead}。你自願幫忙整理大家的意見，{做了一張問卷發給全班，|把贊成和反對的理由整理成一張表，}{學生會說那是他們收到最清楚的一份。|最後學校開放每週一天便服日。}",
          }[k], 2),
          opt("family", "seekHelp", "family", 0.15, k === "vote" ? ctx.f("回家問{who}的看法", { who }) : ctx.f("請{who}寫{note}說明", { who, note }), k === "vote" ? "聽聽大人怎麼想" : "讓大人出面", {
            hair: "{lead}。你請{who}在{note}上寫幾句話，{{who}寫說你頭髮長得特別快，週末就會帶你去剪，|{who}看了一眼，說「規定就是規定」，週末就帶你去剪了，}{{off}看完{note}，揮揮手讓你過了。|你嘟著嘴，但也沒再說什麼。}",
            check: "{lead}。你請{who}在{note}上替你說幾句話，{who}{寫了好長一段，|只寫了「下次注意」四個字，}{{off}看完說下不為例。|你還是乖乖改好了。}",
            patrol: "{lead}。你請{who}在{note}上替你說幾句話，導師看了，{幫你去跟糾察隊說明，|笑著說下次記得就好，}{那次的紀錄被撤掉了。|你鬆了一口氣。}",
            coat: "{lead}。你請{who}在{note}上寫你怕冷，請學校通融，{{off}看完說下不為例。|隔週{who}乾脆幫你買了一件學校的外套。}",
            vote: "{lead}。你回家問{who}，{who}{說以前連頭髮長度都要管，現在的你們很幸福，|說穿什麼都好，重要的是你們自己決定，}{隔天你在班會上把這段話說給大家聽。|你決定投給自己真心想要的那一邊。}",
          }[k], 1),
        ],
      };
    },
  },
  {
    // 排擠（你是旁觀的人）。情境：小團體不跟某個同學說話、沒有某人的群組（2011 年起）、分組時沒人要的同學、新來的轉學生、
    // 桌上被寫了綽號。
    id: "t_clique", domain: "study", channel: "bad", once: true, ages: [12, 16], when: pupil, p: s => (s.age === 12 ? 0.15 : 0.12),
    choice: (s, ctx) => {
      const y = s.year, m = classmate(s, ctx, 0.7), name = m.call, ta = pronoun(m);
      const sc = sceneOf(ctx, [
        { key: "lunch", alone: "一個人吃便當的樣子", lead: `班上的小團體開始不跟${name}說話，還要大家午餐時別跟${ta}坐在一起` },
        { key: "group", alone: "下課一個人看著手機的樣子", w: y >= 2011 ? 1.5 : 0, lead: `你發現班上開了一個沒有${name}的群組，有人在裡面拿${ta}的照片開玩笑` },
        { key: "team", alone: "一個人站在講台旁的樣子", lead: `分組報告時，沒有一組願意收${name}，${ta}一個人站在講台旁邊` },
        { key: "new", alone: "下課一個人坐在位子上的樣子", lead: `班上轉來了${name}，才一個星期，就有人笑${ta}講話的口音，下課都不找${ta}` },
        { key: "desk", alone: "低頭擦桌子的樣子", w: y >= 1980 ? 1 : 0, lead: `有人用立可白在${name}的桌上寫了難聽的綽號，大家都在偷笑` },
      ]);
      const k = sc.key, lead = sc.lead;
      const opt = (id, act, style, weight, label, hint, text, mood, more = null) => ({ id: `t_clique.${id}`, label, hint, act, style, weight, apply: (s2, c) => { if (more) more(s2, c); return { text: c.w(`${lead}。${text}`), mood }; } });
      const friends = `{後來${name}成了你很好的朋友。|那學期你們每天中午都一起吃飯。}`;
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          opt("befriend", "socialize", "social", 0.25, { lunch: `端著便當去跟${name}坐`, group: `約${name}一起吃午餐`, team: `邀${name}進你們這組`, new: `下課主動找${name}聊天`, desk: `幫${name}把桌子擦乾淨` }[k], "總要有人先開始", {
            lunch: `你端著便當走到${name}旁邊坐下，{${name}愣了一下，把${ta}的滷蛋分了一半給你。|小團體的人瞪了你好幾眼，你假裝沒看到。}${friends}`,
            group: `你沒在群組裡說話，隔天卻約${name}一起吃午餐，{${name}有點驚訝，然後笑了。|你們聊著聊著，才發現喜歡同一個 YouTuber。}${friends}`,
            team: `你舉手說：「來我們這組。」{組員有人小聲抱怨，|${name}紅著臉走過來，}{結果${name}做的海報是全班最漂亮的。|報告那天，你們這組拿了最高分。}{後來${name}成了你很好的朋友。|}`,
            new: `你下課主動去找${name}，{問${ta}以前的學校是什麼樣子，|請${ta}教你講${ta}家鄉的話，}{後來${name}成了你很好的朋友。|沒多久，班上其他人也開始跟${ta}說話了。}`,
            desk: `你拿了濕抹布，陪${name}一點一點把桌上的字刮掉，{${name}一直低著頭說謝謝，|擦了整整一節下課，}{後來${name}成了你很好的朋友。|那天放學，你們一起走路回家。}`,
          }[k], 3, (s2, c) => befriend(s2, c, m)),
          opt("note", "talk", "safe", 0.2, `私下${y < 1990 ? "塞紙條給" : y < 2000 ? "打電話給" : "傳訊息給"}${name}`, "不想被小團體發現",
            `你${sendTo(y)}${name}，{${y < 1990 ? "寫" : "說"}「不要理他們，我覺得你很好」，|只${y < 1990 ? "寫" : "說"}了一句「明天見」，}{隔天${name}對你笑了一下。|${name}${y < 1990 ? "在紙條背面回" : "回你"}：「謝謝，真的。」}{你們在班上還是不太說話，但你知道${ta}沒那麼孤單了。|很多年後，${name}說那是${ta}那一年收到最好的東西。}`, 2),
          opt("speak", "insist", "risk", 0.15, { lunch: "跟小團體說不要這樣", group: "在群組裡說「夠了」", team: "說這樣不公平", new: `叫大家別再笑${ta}`, desk: "問是誰寫的" }[k], "站出來", {
            lunch: `你跟小團體的人說：「這樣很幼稚。」{有人翻白眼，|帶頭的那個愣了一下，}{接下來幾天，他們連你也不太理。|但沒多久，有幾個人也悄悄去跟${name}說話了。}`,
            group: "你在群組裡打了一句「夠了，這樣不好笑」，{群組安靜了好久，|有人默默退出了群組，}{隔天那張照片被收回了。|有人私訊跟你說，他其實也覺得不好笑。}",
            team: `你站起來說：「這樣不公平。」{老師點點頭，請大家重新分組，|全班安靜了一下，}{最後${name}被分到了你們這組。|下課時，${name}遠遠地對你點了點頭。}`,
            new: `你在大家笑的時候說：「有什麼好笑的？」{笑聲停了，|帶頭的那個臉紅了，}{之後就沒人再學${ta}講話了。|下課時，${name}遠遠地對你點了點頭。}`,
            desk: "你站上講台問是誰寫的，{全班安靜得連電風扇的聲音都聽得到，|沒有人承認，}{隔天那張桌子被換成了新的。|後來再也沒有人在桌上亂寫了。}",
          }[k], 1),
          opt("teacher", "seekHelp", "social", 0.15, k === "group" ? "截圖給導師看" : "告訴導師", "請大人處理",
            `你私下${k === "group" ? "把截圖拿給導師看" : "告訴了導師"}，{導師在班會上讓大家談談被冷落的感覺，|導師找了帶頭的幾個人去談，}{沒有人知道是你說的。|班上的氣氛慢慢變了。}{${name}後來在畢業紀念冊上寫了一句謝謝。|}`, 1),
          opt("follow", "wait", "self", 0.25, { lunch: "跟著大家，不想惹麻煩", group: "已讀，不說話", team: "低頭不說話", new: `跟大家一樣不理${ta}`, desk: "假裝沒看到" }[k], "不想被一起排擠",
            `你什麼都沒做，{跟著大家假裝沒看到，|低頭做自己的事，}{那學期就這樣過去了。|${name}後來轉學了，你連聲再見都沒說。}{很多年後，你還記得${name}${sc.alone}。|你一直不太喜歡想起那一年。}`, -2),
        ],
      };
    },
  },
  {
    // 照顧弟弟妹妹（4–11 歲）。情境：家裡的大人加班或顧店、安親班接送（1990 年起）、陪寫功課、暑假整天帶著。
    id: "t_siblingCare", domain: "family", channel: "change", tags: ["siblings"], about: "siblings", once: true, ages: [12, 17],
    when: s => !s.abroad && (s.father.alive || s.mother.alive) && littleSibs(s).length > 0, p: () => 0.2,
    choice: (s, ctx) => {
      const y = s.year, home = liveWith(s, ctx), who = grownUp(s, ctx), f = bestFriend(s), buddy = f ? f.call : "同學";
      const kid = ctx.rng.pick(littleSibs(s)), x = siblingCall(kid), xta = /Brother/.test(kid.relation) ? "他" : "她", xage = s.age - kid.bornAt;
      const me = s.sex === "male" ? "哥哥" : "姊姊", shop = s.flags.familyShop, tight = homeMoney(s, ctx) === "tight";
      const others = bornSiblings(s).filter(z => z !== kid && s.age - z.bornAt >= 10), other = others.length ? siblingCall(ctx.rng.pick(others)) : null;
      const helper = y < 1990 ? "隔壁的阿姨" : "樓下的鄰居阿姨";
      const busy = shop ? `家裡的${shop}最近生意正忙，${home}顧店顧到晚上八點` : `${home}${tight ? "為了多賺一點錢" : "最近"}${y < 1985 ? "在工廠趕貨" : "常常加班"}，晚上八點多才到家`;
      const after = s.flags.club === "ball" ? { what: "球隊練到六點", name: "球隊", where: "球場邊" } : s.flags.club && s.flags.club !== "none" ? { what: "社團忙到六點", name: "社團", where: "社團教室" } : { what: "跟同學打球打到六點", name: "打球", where: "球場邊" };
      const subj = xage <= 7 ? "注音" : ctx.rng.pick(["數學", "作文", ...(y >= 2005 ? ["英文"] : [])]);
      const sc = sceneOf(ctx, [
        { key: "late", lead: `${busy}，${s.studying ? "放學" : "下班"}後${x}都要由你顧` },
        { key: "pickup", w: y >= 1990 && s.studying && xage >= 6 ? 1 : 0, lead: `${x}的安親班五點下課，${who}要你每天先去接${xta}，可是你每天${after.what}` },
        { key: "homework", w: xage >= 6 ? 1 : 0, lead: `${x}的${subj}作業寫不出來，每天晚上都哭著來敲你的房門，可是${s.studying ? "你自己下禮拜也要段考" : "你白天上班已經累得要命"}` },
        { key: "summer", w: s.studying ? 1 : 0, lead: `暑假${home}都要上班，${x}整天跟在你後面，你原本跟${buddy}約好要出去玩` },
      ]);
      const k = sc.key, lead = sc.lead, cook = y < 1972 ? "熱了一鍋地瓜稀飯" : "煮了兩碗加蛋的泡麵";
      const opt = (id, act, style, weight, label, hint, text, mood) => ({ id: `t_siblingCare.${id}`, label, hint, act, style, weight, apply: (s2, c) => ({ text: c.w(`${lead}。${text}`), mood }) });
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          opt("care", "care", "family", 0.3, { late: `每天準時回家顧${x}`, pickup: `每天準時去接${x}`, homework: `陪${x}寫完作業`, summer: `整個暑假帶著${x}` }[k], "家裡需要你", {
            late: `你每天${s.studying ? "一放學" : "一下班"}就趕回家，{${cook}，和${x}一起吃，|幫${x}洗澡、陪${xta}寫功課、哄${xta}睡覺，}{${home}回到家，看到你們兩個都睡著了。|有一天${x}在作文裡寫：我的${me}是超人。}`,
            pickup: `你跟大家說每天要先走，{五點準時出現在安親班門口，|牽著${x}的手走路回家，路上買一支冰棒分著吃，}{${x}逢人就說你最準時。|${after.name}的事你只好週末再補回來。}`,
            homework: `你每天晚上先陪${x}把作業寫完，{${xta}寫一題你講一題，|教到一半，自己也弄懂了一個以前沒搞懂的地方，}{${x}的作業簿上多了好幾個${y < 2005 ? "「甲上」" : "笑臉章"}。|${s.studying ? "自己的書只好讀到半夜。" : `你常常比${x}還早睡著。`}}`,
            summer: `你跟${buddy}說改天再約，{整個暑假帶著${x}${y < 1980 ? "去河邊抓魚" : "去圖書館吹冷氣"}，|每天帶著${x}在巷口騎腳踏車，}{${x}曬得跟你一樣黑。|那是你們兩個最常待在一起的一個夏天。}`,
          }[k], 1),
          opt("bring", "socialize", "social", 0.2, { late: `帶${x}去${buddy}家寫功課`, pickup: `接了${x}再一起去${after.where}`, homework: `帶${x}去圖書館一起寫`, summer: `帶${x}一起去玩` }[k], "兩邊都顧到", {
            late: `你帶著${x}去${buddy}家寫功課，{${buddy}教${x}摺紙飛機，|${x}跟${buddy}家的狗玩成一片，}{${x}從此每天都吵著要去。|${buddy}的媽媽常常留你們吃晚飯。}`,
            pickup: `你接了${x}就帶${xta}一起去${after.where}，{${x}坐在旁邊安安靜靜地畫畫，|大家都把${x}當成吉祥物，}{${x}說長大也要跟你一樣。|你兩邊都沒放棄。}`,
            homework: `你帶著${x}去圖書館，{兩個人各寫各的，誰先寫完誰就可以去借漫畫，|你讀你的書，順便幫${xta}看作業，}{${x}${y >= 1980 ? "說圖書館的冷氣比家裡涼" : "說圖書館比家裡安靜"}。|你們每天都在圖書館關門前才回家。}`,
            summer: `你帶著${x}一起赴約，{${buddy}說多一個人更好玩，|大家輪流背${x}走回家，}{${x}從此把你的朋友都當成自己的朋友。|那天${x}笑得最大聲。}`,
          }[k], 2),
          opt("talk", "negotiate", "self", 0.15, `跟${home}商量`, "不能全部都我來",
            `你跟${home}說你也有自己的事，{你們說好一週三天由你顧，其他時間${home}再想辦法。|${home}想了想，說週末會多陪${x}，讓你喘口氣。}{你這才知道${home}也很為難。|那天晚上，${home}多煮了一道你愛吃的菜。}`, 1),
          opt("teach", "talk", "learn", 0.2, `教${x}自己來`, "總有一天要長大", {
            late: `你決定教${x}自己來，{教${xta}怎麼用電鍋熱飯，|教${xta}自己檢查書包、自己洗澡，}{一個月後，${x}已經會自己準備明天要帶的東西。|沒多久，${x}就得意地說自己是「小大人」了。}`,
            pickup: `你教${x}認路，讓${xta}跟同一個安親班的同學結伴走回家，{頭幾天你請了假，偷偷跟在後面，|你拜託路口雜貨店的老闆幫忙看著，}{一個月後，${x}已經會自己回家了。|沒多久，${x}就得意地說自己是「小大人」了。}`,
            homework: `你跟${x}說好，每一題先自己想十分鐘，想不出來再來問你，{${x}一開始嘟著嘴，|${x}想著想著就寫出來了，}{後來${xta}敲門的次數越來越少。|過了一個月，${x}得意地說自己是「小大人」了。}`,
            summer: `你幫${x}排了一張暑假作息表，{幾點寫功課、幾點出去玩都寫得清清楚楚，|教${xta}自己去巷口買早餐，}{${x}居然照著做了一整個暑假。|你終於有時間跟${buddy}出去了。}`,
          }[k], 2),
          {
            id: "t_siblingCare.share", label: other ? `跟${other}輪流` : `請${helper}幫忙`, hint: other ? "大家一起分擔" : "遠親不如近鄰", act: other ? "shareCare" : "seekHelp", style: "social", weight: 0.15,
            apply: (s2, c) => ({ text: c.w(other
              ? `${lead}。你跟${other}排了一張表，{一三五你顧、二四六${other}顧，|一個負責煮飯、一個負責陪寫功課，}{兩個人第一次合作得這麼好。|有時候還是會為了誰多顧一天吵架。}`
              : `${lead}。你拜託${helper}幫忙，{${helper}說${x}${k === "summer" ? "白天" : "放學"}可以先去她家，|${helper}每天傍晚會過來看一下，}{你帶了一盒水果去謝謝她。|你這才發現，鄰居也可以像家人一樣。}`), mood: 1 }),
          },
        ],
      };
    },
  },
  {
    // 已經出去工作的青少年（國小、國中畢業就工作，做滿一年以後；y_firstWeek 講的是第一個星期）。情境：師傅或領班答應
    // 教你真功夫（家裡的店不算）、晚上的技藝班在招生、下班遇到穿制服的老同學。
    id: "t_youngWorker", domain: "career", channel: "change", once: true, ages: [14, 17],
    when: s => !s.studying && !s.abroad && s.employed && !!s.job && s.job.field !== "自營" && s.age > (s.job.since ?? s.age), p: () => 0.5,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), title = s.job.title, family = s.job.field === "家業";
      const boss = family ? who : /工廠/.test(title) ? "領班" : /清潔/.test(title) ? "組長" : "師傅";
      const skill = /廚房/.test(title) ? "掌杓" : /工廠/.test(title) ? "操作機台" : /清潔/.test(title) ? "排班和帶新人" : /田/.test(title) ? "開耕耘機" : "進貨和算帳";
      const course = ctx.rng.pick(y < 1980 ? ["鎮上裁縫補習班的夜間班", "夜間的電工訓練班"] : y < 2000 ? ["補習班的夜間電腦班", "夜間的英文會話班", "職訓中心的夜間美髮班"] : ["職訓中心的夜間電腦繪圖班", "夜間的英文會話班", "社區大學的烘焙課"]);
      const exam = s.edu === "國小" ? exam15Name(y + 1) : exam18Name(y + 1);
      const sc = sceneOf(ctx, [
        { key: "skill", w: family ? 0 : 1, lead: `${boss}說要開始教你${skill}，可是以後每天要提早一個小時到` },
        { key: "night", lead: `你看到${course}在招生，上課時間是晚上七點，跟下班的時間只差半小時` },
        { key: "uniform", lead: `下班路上遇到以前的同學，他們穿著制服，聊的都是下個月的${exam}` },
      ]);
      const k = sc.key, lead = sc.lead;
      const opt = (id, act, style, weight, labels, hints, texts, mood, more = null) => ({ id: `t_youngWorker.${id}`, label: labels[k], hint: hints[k], act, style, weight, apply: (s2, c) => { if (more) more(s2); return { text: c.w(`${lead}。${texts[k]}`), mood }; } });
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          opt("push", "pushThrough", "risk", 0.25,
            { skill: "每天提早一個小時到", night: "下班直接衝去上課", uniform: "回去更拚命做" },
            { skill: "趁年輕多學一點", night: "累也要學", uniform: "這也是一條路" },
            {
              skill: `你每天天還沒亮就出門，{${boss}教得很仔細，也很兇，|你把${boss}說的每一句話都記在小本子上，}{三個月後，${boss}第一次放手讓你${skill}。|你發現自己做得比想像中好。}`,
              night: "你每天下班連飯都來不及吃，{啃著麵包就衝去上課，|騎著腳踏車一路趕過去，}{結業那天，你把證書拿回家給家人看。|雖然常常在課堂上打瞌睡，你一堂也沒缺過。}",
              uniform: `你回去以後做得更拚，{每天第一個到、最後一個走，|${boss}開始把重要的事交給你，}{你告訴自己，這也是一條路。|一年後，你做事已經比剛來的大人還俐落。}`,
            }, 0, s2 => stressBy(s2, 0.03)),
          opt("ask", "negotiate", "social", 0.2,
            { skill: `跟${boss}談時間`, night: `請${boss}讓你早點走`, uniform: `問${boss}能不能多學一點` },
            { skill: "早到可以，早點走", night: "說清楚為什麼", uniform: "主動開口" },
            {
              skill: `你跟${boss}說，早到可以，但想早一點下班，{${boss}想了想就答應了，|${boss}笑說你年紀小小就會談條件，}{你多了一段自己的時間。|你學得很快，也沒有累垮。}`,
              night: `你跟${boss}說想去上課，{${boss}答應讓你提早半小時下班，|${boss}說年輕人多學一點好，還幫你調了班，}{你每天準時趕到教室。|拿到結業證書那天，你第一個拿去給${boss}看。}`,
              uniform: `你主動問${boss}能不能多學一點，{${boss}愣了一下，開始帶你學${skill}，|${boss}說「肯學就好」，下班後多留半小時教你，}{你覺得自己每天都在進步。|你發現開口沒有想像中難。}`,
            }, 2),
          opt("learn", "study", "learn", 0.2,
            { skill: "先自己下功夫", night: "買書自己讀", uniform: "買參考書自己讀" },
            { skill: "不想麻煩別人", night: "比較省錢", uniform: "書不一定要在學校讀" },
            {
              skill: `你決定先自己下功夫，{下班後把${boss}教的在心裡一遍一遍重來，|把${boss}的每個步驟都記在小本子上，}{${boss}發現了，說你有心。|一個月後，你已經做得有模有樣。}`,
              night: "你沒有報名，去書局買了一本自學的書回家，{每天睡前讀一個小時，|看不懂的地方就畫起來，假日再去圖書館查，}{進度很慢，但你沒有放棄。|那本書被你翻到起了毛邊。}",
              uniform: "你去書局買了一套參考書，{每天下班後讀一個小時，|假日就去圖書館坐一整天，}{你發現自己其實很喜歡讀書。|你在書的第一頁寫下了一個目標。}",
            }, 2),
          opt("rest", "rest", "self", 0.2,
            { skill: "說現在還不行", night: "等以後再說", uniform: "先別想那麼多" },
            { skill: "先把身體顧好", night: "現在已經夠累了", uniform: "日子一天一天過" },
            {
              skill: `你跟${boss}說現在還不行，{每天下班就回家好好睡一覺，|假日騎車去河邊吹風，}{${boss}也沒有勉強你。|你覺得自己的日子剛剛好。}`,
              night: "你把招生的傳單收進抽屜，{下班就回家休息，|假日睡到自然醒，}{偶爾會拿出來看一看。|你告訴自己，等存夠了錢再說。}",
              uniform: "你笑著跟他們揮揮手，{回家吃了一大碗飯，|那天晚上早早就睡了，}{有些事，你決定先放在心裡。|你覺得自己過得也不差。}",
            }, 1),
          opt("family", "talk", "family", 0.15,
            { skill: `回家問${who}`, night: `跟${who}商量學費`, uniform: `回家跟${who}聊聊` },
            { skill: "聽聽家人的意見", night: "學費不便宜", uniform: "說出心裡話" },
            {
              skill: `你回家問${who}，${who}{說：「肯教你的人不多，要珍惜。」你隔天比平常早一個小時出門。|說：「別累壞了，身體最重要。」你想了一晚，跟${boss}說等過一陣子再學。}`,
              night: `你跟${who}商量學費，${who}{二話不說拿出了一個信封，|說要幫你出一半，另一半你自己存，}{你每天下班都準時去上課。|那張結業證書，${who}一直收著。}`,
              uniform: `你回家跟${who}說了這件事，${who}{說：「你想讀書，什麼時候都不嫌晚。」|說：「你做的每一件事，我們都看在眼裡。」}{那晚你們聊到很晚。|你心裡的結鬆開了一些。}`,
            }, 2),
        ],
      };
    },
  },
];

// Which graduation trip comes this year: 國小 at 12, 國中 in the year of the junior high exam, 高中 or 高職 two years
// into senior high; each once.
function tripStage(s) {
  const f = s.flags;
  if (s.age === 12 && s.track === "國小" && s.studying && !f.gradTrip_國小) return "國小";
  if (f.done15 && s.age === f.trackAt && !f.gradTrip_國中) return "國中";
  if (s.studying && ["高中", "高職"].includes(s.track) && s.age === (f.trackAt ?? 15) + 2 && !f[`gradTrip_${s.track}`]) return s.track;
  return null;
}
