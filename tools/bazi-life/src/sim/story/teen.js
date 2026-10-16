// 青少年（12–18 歲）：補習、選組、社團、叛逆、初戀、告白、畢業旅行、追星、第一支手機、沉迷、考試壓力……
//
// 機率都是假設：這些事沒有官方統計，每個事件一年的機率大多在 0.04–0.15，再用 once / max / cooldown 限制次數，
// 讓一段青春期平均有五、六件故事，其中四、五件要做選擇。選組（高中生每人都要選）是唯一必定發生的。
// 這裡不改學歷和升學路線（會考、學測在 core.js），也不碰交往狀態：青春期的戀愛只留在故事和記憶裡，
// 不會改變 core.js 依統計校準的交往、初婚年齡。
//
// The probabilities are assumptions (no statistics exist for these events), set so the teenage years hold five or
// six of them, four or five of them choices; 選組 is the one every 高中 student meets. Nothing here changes the
// school track or s.rel, so the calibrated schooling, dating and marriage figures stay as they are.
//
// Left for later modules:
//   s.flags.major        "自然組" | "社會組" (高中 students), with s.flags.majorWhy (self, interest, parents, friend, test;
//                        unknown when the player answered in their own words)
//   s.flags.club, s.flags.cram, s.flags.parttime, s.flags.careerView, s.flags.firstLove ({ name, together, way })
//   memory kinds "crush" ({ name, call, sex }: the first love) and "admirer" (someone who confessed to you)
import { exam15Name, exam18Name } from "../world.js";
import { pronoun } from "../people.js";
import { bestFriend, friendName, makeFriend, grownUp, snackOf, pad } from "./child.js";

// ---------- helpers ----------
const inSchool = s => s.studying && !s.abroad && ["國中", "高中", "高職", "五專"].includes(s.track);
const senior = s => s.studying && !s.abroad && ["高中", "高職", "五專"].includes(s.track);
// The next big exam: 會考 (or its earlier names) in junior high, 學測 in senior high, 統測 (from 2001) in vocational.
const nextExam = s => (s.track === "國中" ? exam15Name(s.year + Math.max(1, 15 - s.age)) : s.track === "高職" ? (s.year + 1 >= 2001 ? "統測" : "聯招") : exam18Name(s.year + 1));
// What music played on: the radio, then a 隨身聽 (cassette, CD or MP3), then the phone.
const player = y => (y < 1980 ? "收音機" : y < 2011 ? "隨身聽" : "手機");
// How a teenager got a message to a friend.
const sendTo = y => (y < 1990 ? "寫了一張紙條給" : y < 2000 ? "打電話給" : y < 2005 ? "傳簡訊給" : y < 2011 ? "在 MSN 上敲" : "傳 LINE 給");
const comfortFood = ctx => ctx.rng.pick(["牛肉麵", "滷肉飯", "綠豆湯", "鹹酥雞"]);

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

export const TEEN = [
  {
    // 補習
    id: "t_cram", domain: "study", channel: "change", once: true, ages: [13, 17], when: inSchool, p: () => 0.12,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx);
      const where = y < 1980 ? "數學老師家" : s.county === "臺北市" ? "南陽街的補習班" : "火車站附近的補習班";
      const why = ctx.rng.pick(["段考成績單發下來", "班上一半的同學都去補習了", ...(s.track === "五專" ? [] : [`離${nextExam(s)}越來越近`])]);
      const lead = `${why}，${who}問你要不要去補習`;
      const set = (s2, k) => { s2.flags.cram = k; };
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          { id: "t_cram.math", label: "補數理", hint: "數學和理化", act: "study", style: "learn", weight: 0.25, apply: (s2, c) => { set(s2, "math"); return { text: c.w(`${lead}。你去${where}補數學和理化，{每天放學${y >= 1990 ? "在樓下買一份雞排" : "塞一個麵包"}就進教室，|${y >= 2000 ? "教室擠了上百個人，你坐在只看得到螢幕的最後一排，" : "小小的教室擠了好幾十個人，"}}{成績慢慢追上來了。|最喜歡那個會講笑話的老師。}`), mood: 1 }; } },
          { id: "t_cram.english", label: "補英文", hint: "背單字、練聽力", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => { set(s2, "english"); return { text: c.w(`${lead}。你去補英文，{每天背五十個單字，|上課一直${y >= 1985 ? "聽英文歌學發音" : "跟著老師念課文"}，}{第一次聽懂了外國電影裡的一句台詞。|單字本被你翻到脫頁。}`), mood: 1 }; } },
          { id: "t_cram.all", label: "補全科", hint: "一次全部顧到", act: "pushThrough", style: "safe", weight: 0.2, apply: (s2, c) => { set(s2, "all"); s2.health.stress = Math.min(1, s2.health.stress + 0.05); return { text: c.w(`${lead}。你補全科，{每天晚上十點才下課，|週末也被考卷塞滿，}{回家的公車上總是睡著。|書包重得像磚頭。}`), mood: -2 }; } },
          { id: "t_cram.none", label: "不補，自己讀", hint: "把時間留給自己", act: "wait", style: "self", weight: 0.2, apply: (s2, c) => { set(s2, "none"); return { text: c.w(`${lead}。你決定不補習，{放學就回家自己讀，|把不會的題目留到隔天問老師，}{成績普普通通，但睡得很飽。|多出來的時間拿去打球。}`), mood: 1 }; } },
          { id: "t_cram.online", label: "上線上課程", hint: "在家看影片學", act: "study", style: "learn", weight: 0.12, when: () => y >= 2015, apply: (s2, c) => { set(s2, "online"); return { text: c.w(`${lead}。你買了線上課程，{在家用平板看老師的影片，|不懂的地方就按暫停重看，}{省下不少通勤的時間。|有幾天看著看著就睡著了。}`), mood: 1 }; } },
          { id: "t_cram.tutor", label: "請家教", hint: "一對一比較清楚", act: "study", style: "social", weight: 0.08, apply: (s2, c) => { set(s2, "tutor"); return { text: c.w(`${lead}。${who}請了一位大學生來家裡當家教，{每週兩次坐在客廳的餐桌上，|講解得很清楚，|講話很有趣，}{你第一次覺得數學沒那麼可怕。|你們常常聊到忘了時間。}`), mood: 2 }; } },
        ],
      };
    },
  },
  {
    // 高一下學期選組：每個高中生都要選，記在 s.flags.major
    id: "t_major", domain: "study", channel: "change", once: true, ages: [15, 18], p: () => 1,
    when: s => s.studying && !s.abroad && s.track === "高中" && s.age === (s.flags.trackAt ?? 15) + 1,
    choice: (s, ctx) => {
      const who = grownUp(s, ctx), f = bestFriend(s);
      const lead = `高一下學期要選組了，${ctx.rng.pick([`${s.year >= 1975 ? "輔導老師" : "導師"}發下了選組單`, "下課時大家都在討論要選哪一組", `${who}已經在問你的打算`])}`;
      const set = (s2, major, how) => { s2.flags.major = major; s2.flags.majorWhy = how; return major; };
      // About six in ten 高中 students end up in 自然組 (an assumption close to recent years).
      const draw = (c, science) => (c.rng() < science ? "自然組" : "社會組");
      // A provisional stream, so later modules find one even when the player answers in their own words.
      set(s, draw(ctx, 0.58), "unknown");
      return {
        prompt: `${lead}。要選哪一組？`,
        options: [
          { id: "t_major.science", label: "自然組", hint: "理工、醫藥、生科", act: "study", style: "safe", weight: 0.35, apply: (s2, c) => { set(s2, "自然組", "self"); return { text: c.w(`${lead}。你選了自然組，{物理和化學課本疊起來比磚頭還厚。|第一次段考，數學難到全班都在哀號。|你開始覺得實驗課是一週最好玩的時間。}`), mood: 1 }; } },
          { id: "t_major.social", label: "社會組", hint: "文、法、商、傳播", act: "study", style: "learn", weight: 0.25, apply: (s2, c) => { set(s2, "社會組", "self"); return { text: c.w(`${lead}。你選了社會組，{開始背歷史年表和地理圖，|國文課變成你最期待的一堂，}{有親戚說社會組以後不好找工作，你笑笑沒回答。|你發現自己很會寫作文。}`), mood: 1 }; } },
          { id: "t_major.heart", label: "跟著興趣走", hint: "選自己喜歡的", act: "insist", style: "self", weight: 0.15, apply: (s2, c) => { const m = set(s2, draw(c, ["art", "piano", "calligraphy"].includes(s2.flags.talent) ? 0.3 : 0.55), "interest"); return { text: c.w(`${lead}。你想了很久，照著自己的興趣選了${m}，{雖然有人說你選錯了，|就算那不是你分數最好的科目，}{你覺得每天上課都很有意思。|你知道自己為什麼坐在這裡。}`), mood: 2 }; } },
          { id: "t_major.parents", label: `聽${who}的`, hint: "家人比較有經驗", act: "talk", style: "family", weight: 0.1, apply: (s2, c) => { const m = set(s2, draw(c, 0.8), "parents"); return { text: c.w(`${lead}。你聽了${who}的建議，選了${m}。{${who}說${m === "自然組" ? "這樣以後比較好找工作" : "你的國文一直比數學好"}。|${who}鬆了一口氣，你也是。}{你心裡還是有點不確定。|你決定先試試看。}`), mood: 0 }; } },
          { id: "t_major.friend", label: f ? `跟${f.call}選同一組` : "跟死黨選同一組", hint: "至少有人作伴", act: "socialize", style: "social", weight: 0.08, when: () => !!f, apply: (s2, c) => { const m = set(s2, draw(c, 0.55), "friend"); return { text: c.w(`${lead}。你和${f.call}說好一起選${m}，{結果被分到同一班，兩個人高興得跳起來。|結果被分到不同班，下課還是黏在一起。}`), mood: 2 }; } },
          { id: "t_major.test", label: "先做性向測驗", hint: "問問輔導老師", act: "counsel", style: "learn", weight: 0.07, when: () => s.year >= 1975, apply: (s2, c) => { const m = set(s2, draw(c, 0.55), "test"); return { text: c.w(`${lead}。你去找輔導老師做了性向測驗，{結果說你適合${m}，|老師陪你看了好多科系的介紹，}{你就照著選了${m}。|最後選了${m}，心裡比較踏實。}`), mood: 1 }; } },
        ],
      };
    },
  },
  {
    // 社團
    id: "t_club", domain: "study", channel: "good", once: true, ages: [13, 17], when: inSchool, p: () => 0.12,
    choice: (s, ctx) => {
      const y = s.year, music = y < 1985 ? "國樂社" : y < 1995 ? "吉他社" : "熱音社", scout = y < 1985 ? "童軍團" : "康輔社";
      const lead = y < 2000 ? "學校的社團活動課要選社團了" : "社團博覽會上，學長姊在走廊擺攤拉人";
      // Without a best friend yet, the club brings one.
      const pal = (s2, c, how) => { if (bestFriend(s2)) return ""; const f = makeFriend(s2, c, how, 0.75); return `在社團認識的${f.call}，後來成了你的死黨。`; };
      const join = (key, how, text, mood = 3) => (s2, c) => { s2.flags.club = key; const p = how ? pal(s2, c, how) : ""; return { text: c.w(`${lead}，${text}`) + p, mood }; };
      return {
        prompt: `${lead}。想參加哪一個？`,
        options: [
          { id: "t_club.music", label: music, hint: "學一樣樂器", act: "hobby", style: "learn", weight: 0.2, apply: join("music", "社團的朋友", `你參加了${music}，{${y < 1985 ? "學會了吹笛子和拉二胡，" : "第一個學會的和弦是 C 和 G，"}|手指磨出了繭，}{成果發表會上台時腿一直抖。|和社員約好畢業前要辦一場演出。}`) },
          { id: "t_club.ball", label: "球隊", hint: "每天練到天黑", act: "exercise", style: "health", weight: 0.22, apply: join("ball", "隊友", `你加入了{籃球隊|排球隊|${y >= 1970 ? "棒球隊" : "田徑隊"}|桌球隊}，{每天放學練到天黑，|假日也去學校練球，}{第一次上場比賽緊張到同手同腳。|曬得跟木炭一樣黑。}`) },
          { id: "t_club.scout", label: scout, hint: "露營、營火晚會", act: "socialize", style: "social", weight: 0.15, apply: join("scout", "社團的朋友", `你參加了${scout}，{學會了打各種繩結，|在營火晚會上帶大家跳舞，}{露營那晚，大家圍著營火聊到半夜。|交到一群很愛鬧的朋友。}`) },
          { id: "t_club.drama", label: "話劇社", hint: "站上舞台", act: "hobby", style: "risk", weight: 0.1, apply: join("drama", "社團的朋友", "你參加了話劇社，{第一次上台就忘詞，|演了一棵不用說話的樹，|在成果發表會演了主角，}{台下的笑聲你一直記得。|後來你上台再也不怕了。}") },
          { id: "t_club.comic", label: "漫研社", hint: "畫漫畫、聊動漫", act: "hobby", style: "self", weight: 0.13, when: () => y >= 1995, apply: join("comic", "同好", "你參加了漫研社，{和社員一起畫了一本同人誌，|每週社課都在聊最新一集的動畫，}{第一次覺得有人懂你。|你畫的四格漫畫被貼在社團教室的牆上。}") },
          { id: "t_club.none", label: "不參加，回家讀書", hint: "時間比較多", act: "wait", style: "safe", weight: 0.2, apply: join("none", null, "你沒有參加社團，{社團時間都在自習教室讀書，|放學就直接回家，}{成績穩穩的，只是偶爾有點羨慕別人。|你把時間留給了自己喜歡的書。}", 0) },
        ],
      };
    },
  },
  {
    // 叛逆期
    id: "t_rebel", domain: "family", channel: "bad", tags: ["father", "mother"], once: true, ages: [13, 17], when: s => (s.father.alive || s.mother.alive) && !s.abroad, p: () => 0.05,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), f = bestFriend(s), food = comfortFood(ctx);
      const lead = ctx.w(`這陣子你${ctx.rng.pick(["回家就把自己關在房間裡", "跟家裡講話越來越衝", "覺得大人什麼都不懂"])}，${who}{敲了你的房門，說想跟你談談|在晚餐桌上又開始唸你}`);
      // 髮禁 was lifted in 2005 and school dress rules were relaxed in 2016; 教官 left the schools in 2023.
      const officer = s.track === "國中" ? "生教組長" : s.year < 2023 ? "教官" : "學務主任";
      const look = y >= 2016 ? "染了一頭淺色的頭髮" : y >= 2005 ? "偷偷把頭髮染成咖啡色" : s.sex === "female" ? "偷偷把制服裙改短" : "偷偷把制服褲改成窄管";
      const after = y >= 2016 ? `{同學都說很好看，|${who}看了好幾天才習慣，}{你覺得自己終於像自己了。|那是你第一次自己決定自己的樣子。}` : `{被${officer}叫去談話，|被記了一支警告，}{回家又被唸了一頓。|但你覺得很值得。}`;
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          { id: "t_rebel.talk", label: "把心裡的話說出來", hint: "吵一架也好", act: "talk", style: "social", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${lead}。你把憋了很久的話一口氣說出來，{你們都哭了。|${who}聽完沉默了很久，說：「我以前也是這樣。」}{後來家裡的門比較少被甩上了。|那晚你們聊到很晚。}`), mood: 1 }) },
          { id: "t_rebel.door", label: "甩上房門", hint: "不想說話", act: "avoid", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${lead}。你把房門甩上，{戴上耳機，把${player(y)}的音量開到最大。|整個學期跟家裡說不到十句話。}{過了好一陣子，那股氣才慢慢消了。|直到有一天，${who}在門口放了一碗你最愛吃的${food}。}`), mood: -3 }) },
          { id: "t_rebel.look", label: y >= 2005 ? "去染頭髮" : "偷改制服", hint: "我想要自己的樣子", act: "insist", style: "self", weight: 0.15, when: () => s.studying, apply: (s2, c) => ({ text: c.w(`${lead}。你${look}，${after}`), mood: 1 }) },
          { id: "t_rebel.out", label: f ? `跑去${f.call}家住一晚` : "跑去同學家住一晚", hint: "先離開一下", act: "avoid", style: "risk", weight: 0.08, apply: (s2, c) => ({ text: c.w(`${lead}。你收了幾件衣服，跑到${f ? f.call : "同學"}家住了一晚，${f ? f.call : "同學"}的媽媽偷偷打電話給你${who}。{隔天你回家，${who}什麼都沒說，只問你吃飯了沒。|回家後你們大吵了一架，吵完反而輕鬆了。}`), mood: -1 }) },
          { id: "t_rebel.sport", label: "出去把氣發洩掉", hint: "打球或騎車", act: "exercise", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你{抓起籃球出門，在球場投了兩個小時的籃，|騎上腳踏車，沿著河堤騎到天黑，}{回家時氣已經消了一半。|回家後主動說了一聲「我回來了」。}`), mood: 1 }) },
          { id: "t_rebel.letter", label: "寫一封信", hint: "當面說不出口", act: "talk", style: "family", weight: 0.12, apply: (s2, c) => ({ text: c.w(`${lead}。你寫了一封長長的信放在${who}的桌上，{隔天早上，信封裡多了一張回信。|${who}看完，敲門進來抱了你一下。}{原來大家都很在乎對方。|你們約好以後有話直說。}`), mood: 2 }) },
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
      const lead = `${ctx.rng.pick(["隔壁班", "補習班"])}認識的幾個朋友常約你${what}，說「一次就好啦」`;
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          { id: "t_wildFriends.once", label: "跟去一次", hint: "看看也好", act: "socialize", style: "risk", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${lead}。你跟去了一次，{玩得很開心，|玩到忘了時間，}{結果被${who}在門口逮個正著。|隔天上課一直打瞌睡。|回家的路上，你覺得好像也沒那麼好玩。}`), mood: 1 }) },
          { id: "t_wildFriends.join", label: "常常跟他們出去", hint: "跟他們在一起很自在", act: "socialize", style: "self", weight: 0.15, apply: (s2, c) => { s2.flags.wild = true; return { text: c.w(`${lead}。你開始常常跟他們出去，{成績一路往下掉，|回家的時間越來越晚，}{直到導師打電話到家裡。|有一天你突然覺得這樣好累。}`), mood: -2 }; } },
          { id: "t_wildFriends.refuse", label: "找藉口推掉", hint: "說要補習", act: "wait", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${lead}。你每次都說要補習，{後來他們就不約你了。|漸漸地他們也不找你了，你鬆了一口氣，又有點寂寞。}`), mood: 0 }) },
          { id: "t_wildFriends.ball", label: "約他們改去打球", hint: "換個玩法", act: "exercise", style: "health", weight: 0.18, apply: (s2, c) => { const n = makeFriend(s2, c, "打球的朋友", 0.9); return { text: c.w(`${lead}。你約他們改去打籃球，{沒想到他們真的來了，|一群人在球場上打到滿身大汗，}{後來每個星期六都固定打一場，${n.call}每次都最早到。|其中的${n.call}後來變成你很好的朋友。}`), mood: 2 }; } },
          {
            id: "t_wildFriends.ask", label: f ? `找${f.call}商量` : `找${who}商量`, hint: "聽聽別人怎麼說", act: "seekHelp", style: "social", weight: 0.12,
            apply: (s2, c) => ({ text: c.w(f ? `${lead}。你跟${f.call}說了這件事，${f.call}說：「{你想去就去，不想就拒絕，我挺你。|那幾個人我知道，你自己要想清楚。}」{你決定不去了。|那天你們兩個去吃了一碗${food}。}` : `${lead}。你跟${who}說了這件事，${who}{沒有罵你，只要你自己想清楚。|說：「朋友是要選的。」}{你決定不去了。|你想了一個晚上。}`), mood: 1 }),
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
      const lead = `暑假到了，你想${ctx.rng.pick([`存錢買${want}`, "自己賺零用錢", "幫家裡分擔一點"])}，在考慮要不要去打工`;
      // A summer's pay is a few percent of a year's median pay.
      const paid = (s2, k) => { s2.flags.parttime = k; s2.savings += 0.02; };
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          { id: "t_parttime.food", label: y >= 1985 ? "去速食店" : "去餐廳端盤子", hint: "學會跟客人說話", act: "sideJob", style: "social", weight: 0.25, apply: (s2, c) => { paid(s2, "food"); return { text: c.w(`${lead}。你去${y >= 1985 ? "速食店" : "餐廳"}打工，{每天在櫃檯喊「歡迎光臨」，|${y >= 1985 ? "炸薯條炸到手臂都是油點，" : "端盤子端到手臂發痠，"}}{領到第一份薪水時，你在回家的公車上偷偷笑了好久。|學會了怎麼跟各種客人說話。}`), mood: 3 }; } },
          { id: "t_parttime.store", label: y >= 1990 ? "去便利商店" : "去工廠做暑期工", hint: y >= 1990 ? "排班、補貨、收銀" : "論件計酬", act: "sideJob", style: "safe", weight: 0.2, apply: (s2, c) => { paid(s2, "store"); return { text: c.w(y >= 1990 ? `${lead}。你去便利商店打工，{學會了收銀、補貨和煮茶葉蛋，|站了一整個暑假的櫃檯，}{第一次知道錢有多難賺。|還被店長稱讚做事很細心。}` : `${lead}。你去附近的工廠做暑期工，{一整天坐在生產線旁邊，|做的是論件計酬的手工，}{薪水全交給了${who}。|第一次知道錢有多難賺。}`), mood: 1 }; } },
          { id: "t_parttime.tutor", label: y >= 1980 ? "去補習班當工讀生" : "幫鄰居小孩補習", hint: "改考卷、教功課", act: "sideJob", style: "learn", weight: 0.15, apply: (s2, c) => { paid(s2, "tutor"); return { text: c.w(`${lead}。你${y >= 1980 ? "去補習班當工讀生，{幫忙改考卷、發講義，有學生跑來問你問題，你發現自己很會教人。|坐在櫃檯接電話、排課表，學會了怎麼跟家長說話。}" : "幫鄰居的小孩補習，{教他們算數學，你發現自己很會教人。|陪他們寫暑假作業，賺的錢不多，但很有成就感。}"}`), mood: 2 }; } },
          {
            id: "t_parttime.family", label: shop ? `回家裡的${shop}幫忙` : y >= 1965 && y < 2000 ? "在家做家庭代工" : "去親戚的店幫忙", hint: "錢不多，但跟家人在一起", act: "familyBusiness", style: "family", weight: 0.15,
            apply: (s2, c) => { paid(s2, "family"); return { text: c.w(shop ? `${lead}。你在家裡的${shop}幫了一整個暑假，{${who}說要付你薪水，你說不用了。|${who}第一次把收錢的工作交給你。}{你這才知道${who}每天有多辛苦。|晚上收店後，你們一起吃宵夜。}` : y >= 1965 && y < 2000 ? `${lead}。你在家幫忙做家庭代工，{客廳堆滿了要組裝的零件，|全家人圍著桌子一起趕貨，}{手做到痠了也不停。|你這才知道${who}每天有多辛苦。}` : `${lead}。你去親戚的店幫了一整個暑假，{從洗碗做到幫忙點餐，|每天一早就去開店，}{親戚包了一個大紅包給你。|你這才知道做生意有多辛苦。}`), mood: 2 }; },
          },
          { id: "t_parttime.none", label: "不打工，好好放假", hint: "暑假只有一次", act: "rest", style: "self", weight: 0.25, apply: (s2, c) => { s2.flags.parttime = "none"; return { text: c.w(`${lead}，最後還是決定不打工，{和${f}騎腳踏車到處跑，|每天睡到中午，}{那是最後一個無憂無慮的暑假。|開學時被問暑假做了什麼，你說「長大」。}`), mood: 3 }; } },
        ],
      };
    },
  },
  {
    // 初戀：記下名字（memory kind "crush"），之後的人生可以回頭提起；結局在 t_heartbreak
    id: "t_firstLove", domain: "love", channel: "good", once: true, ages: [13, 15], when: s => s.studying && s.rel === "single" && !s.abroad && !s.arcs.t_love, p: () => 0.1,
    choice: (s, ctx) => {
      const y = s.year, sex = ctx.rng() < 0.95 ? (s.sex === "male" ? "female" : "male") : s.sex;
      const p = ctx.person({ role: "friend", sex, birthYear: s.birthYear + ctx.rng.int(3) - 1, how: "同學" });
      const name = p.call, ta = pronoun(p), f = bestFriend(s);
      const where = ctx.rng.pick(["坐你前面的", "隔壁班的", "每天同一班公車的", ...(s.flags.club && s.flags.club !== "none" ? ["同一個社團的"] : []), ...(s.flags.cram && s.flags.cram !== "none" ? ["補習班的"] : [])]);
      const sign = ctx.rng.pick(where === "坐你前面的" ? [`每次${ta}回頭傳考卷，你的心跳都會漏一拍`, `${ta}借你的那支筆，你一直捨不得還`] : where === "每天同一班公車的" ? [`每天早上你都故意搭同一班車，只為了看${ta}一眼`, `${ta}下車前回頭看了你一眼，你記了一整天`] : [`你總是在人群裡第一眼就找到${ta}`, `${ta}借你的那支筆，你一直捨不得還`, `${ta}跟你說話的時候，你連自己說了什麼都不記得`]);
      const lead = `你發現自己很在意${where}${name}：${sign}`;
      ctx.remember("crush", name, { name, call: name, sex });
      const start = (s2, together, way) => { s2.flags.firstLove = { name, together, way }; ctx.arc.start("t_love", { name, sex, together, way }, Math.max(1, Math.min(1 + ctx.rng.int(2), 16 - s2.age))); };
      const confess = y < 1995 ? `寫了一封信，偷偷夾在${ta}的課本裡` : y < 2000 ? `在${ta}的 BB.Call 留了「520」` : y < 2005 ? `傳了一封打了又刪、刪了又打的簡訊給${ta}` : y < 2011 ? "在 MSN 上打了好長一段話，最後按下送出" : `在 LINE 上傳了一段好長的訊息給${ta}`;
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          {
            id: "t_firstLove.confess", label: "鼓起勇氣告白", hint: "把心意說出來", act: "pursue", style: "risk", weight: 0.22,
            apply: (s2, c) => {
              const yes = c.roll("love", "good", 0.45);
              start(s2, yes, "confess");
              return yes
                ? { text: c.w(`${lead}。你${confess}。{隔天，${name}紅著臉說：「我也是。」|${name}回你：「其實我也注意你很久了。」}{你們開始一起放學回家。|那個學期，你們在走廊上偷偷傳紙條。}`), mood: 7 }
                : { text: c.w(`${lead}。你${confess}。${name}說：「我們當朋友就好。」{你難過了一個星期，|那天的天氣你到現在還記得，}{但後來你們還是會打招呼。|你把那份心意好好收了起來。}`), mood: -4 };
            },
          },
          { id: "t_firstLove.secret", label: "默默喜歡就好", hint: "不讓任何人知道", act: "wait", style: "safe", weight: 0.3, apply: (s2, c) => { start(s2, false, "secret"); return { text: c.w(`${lead}。你什麼都沒說，{只在日記裡寫滿了${ta}的名字。|每天只敢在${name}經過走廊時偷看一眼。|把${name}的側臉畫在課本的角落。}`), mood: 2 }; } },
          { id: "t_firstLove.close", label: "先當好朋友", hint: "慢慢靠近", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => { const yes = c.rng() < 0.35; start(s2, yes, "close"); return { text: c.w(`${lead}。你開始找機會跟${name}說話，{借筆記、一起留下來做壁報，|放學一起等公車，}${yes ? `{一個學期後，${name}先跟你告白了。|有一天${name}問你：「我們要不要在一起？」}` : "{兩個人越來越熟，|你們聊天的時間越來越長，}卻誰也沒說破。"}`), mood: 3 }; } },
          {
            id: "t_firstLove.ask", label: f ? `請${f.call}幫忙打聽` : "請朋友幫忙打聽", hint: `先知道${ta}的心意`, act: "seekHelp", style: "social", weight: 0.1, when: () => !!f,
            apply: (s2, c) => {
              const yes = c.roll("love", "good", 0.4);
              start(s2, yes, "ask");
              return { text: c.w(yes ? `${lead}。你拜託${f.call}去打聽，${f.call}回來說：「${ta}好像也喜歡你耶。」{你緊張到整晚睡不著，隔天終於約了${name}一起回家。|後來你們就在一起了。}` : `${lead}。你拜託${f.call}去打聽，${f.call}支支吾吾地說：「${ta}好像有喜歡的人了。」{你假裝不在意，|你笑著說沒關係，}{回家卻把棉被蓋過頭。|那天${f.call}陪你吃了一碗冰。}`), mood: yes ? 6 : -3 };
            },
          },
          { id: "t_firstLove.study", label: "把心思放回課本", hint: "考完再說", act: "study", style: "learn", weight: 0.18, apply: (s2, c) => { start(s2, false, "study"); return { text: c.w(`${lead}。你告訴自己現在要專心讀書，{把${name}的名字寫在講義的角落，又擦掉。|把那份心意藏進鉛筆盒的最底層。}`), mood: 0 }; } },
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
        ? ctx.w(`和${name}在一起{三個月|半年|快一年}，{因為考上不同的學校，|${ta}說想專心準備考試，|兩個人越來越少話聊，}你們分手了`)
        : a.way === "confess" || a.way === "ask"
          ? ctx.w(`${name}後來{跟別人在一起了|轉學了}，你以為自己早就放下，心裡還是空了一塊`)
          : ctx.w(`${name}{跟別人在一起了|要轉學了|畢業後去讀了別的學校}，那份沒說出口的喜歡，只能放下了`);
      const songs = y < 1980 ? "守著收音機，等著點播的情歌，" : `把${player(y)}裡的情歌反覆聽了好幾遍，`;
      return {
        prompt: `${lead}。要怎麼走出來？`,
        options: [
          { id: "t_heartbreak.friend", label: f ? `找${f.call}哭一場` : "找朋友哭一場", hint: "有人陪", act: "seekHelp", style: "social", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${lead}。${f ? f.call : "同學"}陪你在{操場邊|河堤上}坐到天黑，{什麼都沒問，只是一直遞衛生紙給你。|最後兩個人一起大喊了一聲，心裡好多了。}`), mood: -2 }) },
          { id: "t_heartbreak.study", label: "把心思放在讀書", hint: "化悲憤為力量", act: "study", style: "learn", weight: 0.2, when: () => s.studying, apply: (s2, c) => ({ text: c.w(`${lead}。你把自己埋進考卷裡，{那次段考考了全班第{三|五}名。|讀到半夜，眼淚滴在講義上。}`), mood: -2 }) },
          { id: "t_heartbreak.run", label: "去運動流汗", hint: "累了就不想了", act: "exercise", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你每天放學去{操場跑步|球場打球}，{跑到喘不過氣，心裡就沒那麼痛了。|一個月後，你發現自己能笑著提起${name}了。}`), mood: -1 }) },
          { id: "t_heartbreak.songs", label: "聽情歌", hint: "讓自己好好難過", act: "rest", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${lead}。你${songs}{每一句歌詞好像都在寫你。|哭完一場，好像就放下了一點。}`), mood: -3 }) },
          { id: "t_heartbreak.box", label: "把回憶收起來", hint: "跟過去說再見", act: "wait", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${lead}。你把${a.together ? `${name}送的{卡片|紙鶴|手鍊}` : "偷偷留著的{合照|紙條}"}收進抽屜最裡面，{告訴自己要往前走。|抽屜關上的那一刻，你好像長大了一點。}`), mood: -2 }) },
        ],
      };
    },
  },
  {
    // 被告白
    id: "t_confession", domain: "love", channel: "good", once: true, ages: [14, 17], when: s => s.studying && s.rel === "single" && !s.abroad && !s.arcs.t_love, p: () => 0.05,
    choice: (s, ctx) => {
      const y = s.year;
      const p = ctx.person({ role: "friend", sex: s.sex === "male" ? "female" : "male", birthYear: s.birthYear + ctx.rng.int(3) - 1, how: "同學" });
      const name = p.call, ta = pronoun(p);
      const where = ctx.rng.pick(["同班的", "隔壁班的", ...(s.flags.club && s.flags.club !== "none" ? ["社團的"] : []), ...(s.flags.cram && s.flags.cram !== "none" ? ["補習班的"] : [])]);
      const face = y < 1993 && ctx.rng() < 0.5;
      const how = face ? "放學時在校門口叫住你，" : y < 1993 ? "託同學送來一封信，" : y < 2000 ? ctx.rng.pick(["在你的 BB.Call 留了「520」，", "託同學送來一封信，"]) : y < 2005 ? "傳簡訊" : y < 2011 ? "在 MSN 上" : "在 LINE 上";
      const lead = `${where}${name}${how}跟你告白了`;
      const talk = y < 1990 ? "互相寫信寫了一整本" : y < 2000 ? "每天晚上講電話講到被催" : "每天傳訊息傳到半夜";
      ctx.remember("admirer", name, { name, call: name, sex: p.sex });
      return {
        prompt: `${lead}。要怎麼回應？`,
        options: [
          { id: "t_confession.yes", label: "答應交往", hint: "試試看", act: "pursue", style: "risk", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${lead}。你答應了。{那段時間，你們每天一起走路回家，|你們${talk}，}{後來因為考試越來越忙，慢慢就分開了，|交往了幾個月，發現還是比較適合當朋友，}{但那是很甜的一段日子。|你一直記得${name}的好。}`), mood: 4 }) },
          { id: "t_confession.no", label: "婉拒", hint: "謝謝，但不喜歡", act: "wait", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${lead}。你很認真地跟${name}說謝謝，{但你對${ta}沒有那種感覺。|說你現在只想專心讀書。}{後來你們見面還是會打招呼。|${name}說沒關係，你卻愧疚了好幾天。}`), mood: 0 }) },
          { id: "t_confession.friends", label: "先當朋友", hint: "慢慢認識", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${lead}。你說可以先當朋友，{後來你們變成無話不談的好朋友。|後來你們一起準備考試，互相打氣。}`), mood: 2 }) },
          { id: "t_confession.dodge", label: face ? "紅著臉跑掉" : y >= 2011 ? "已讀不回" : "假裝沒收到", hint: "不知道怎麼回", act: "avoid", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你${face ? "紅著臉跑掉了" : y >= 2011 ? "已讀不回" : "假裝沒收到"}，{結果在走廊遇到時，兩個人都尷尬得要命。|過了好久，你才鼓起勇氣跟${ta}說對不起。}`), mood: -1 }) },
          { id: "t_confession.other", label: "說心裡有喜歡的人", hint: "誠實說", act: "talk", style: "social", weight: 0.1, when: () => s.memory.some(m => m.kind === "crush"), apply: (s2, c) => ({ text: c.w(`${lead}。你老實說心裡已經有喜歡的人了，${name}{笑著說：「我猜到了。」|點點頭，說謝謝你這麼誠實。}`), mood: 0 }) },
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
      const photo = y >= 1997 ? "還和同學擠進大頭貼機拍了一整排" : y >= 1988 ? "還和同學合買了一台即可拍" : `還借了${who}的相機拍了一整卷底片`;
      return { text: ctx.w([
        `${stage}畢業旅行去${place}，{${ride}，和${f}拍了一張好醜的合照。|晚上在${room}的房間玩撲克牌到半夜，被老師查房抓個正著。|一路玩到忘了時間，回來的時候曬黑了一圈。}`,
        `${stage}畢業旅行的最後一晚，{大家在房間裡聊到天亮，|${y >= 1990 ? "全班圍成一圈玩真心話大冒險，" : "全班圍著營火唱歌，"}}{有人哭了，說捨不得畢業。|你把那一晚記得好清楚。}`,
        `${stage}畢業旅行去${place}，{你把零用錢全拿去買紀念品給家人，|第一次離家睡在外面，興奮得睡不著，}{${photo}。|回家時${who}在校門口等你。}`,
      ]), mood: 4 };
    },
  },
  {
    // 追星
    id: "t_idol", once: true, ages: [13, 17], when: s => !s.abroad, p: () => 0.06,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), idol = idolOf(y, ctx), them = pad(idol.again);
      const show = y < 1985 ? `要到${s.county || "附近"}登台演唱` : "要開演唱會了";
      const price = y < 1970 ? "十幾塊" : y < 1980 ? "一百多塊" : y < 1990 ? "五百塊" : y < 2000 ? "一千多塊" : y < 2010 ? "兩千多塊" : "三千多塊";
      const lead = `你迷上了${pad(idol.who).trimEnd()}，${y < 1985 ? "剪報貼滿了一整本簿子" : "房間牆上貼滿了海報"}。${them.trimStart()}${show}，票要${price}`;
      const screen = y >= 2008 ? "守在電腦前看直播" : y >= 1970 ? `守在電視前，等${them}上綜藝節目` : `守在收音機前，等著聽${them}的歌`;
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          { id: "t_idol.save", label: "存零用錢買票", hint: "省吃儉用幾個月", act: "save", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${lead}。你{每天中午只吃一個麵包，|把零用錢一塊一塊存起來，}{終於買到了票，那天你喊到喉嚨都啞了。|存了三個月，終於坐進了最後一排。}`), mood: 5 }) },
          { id: "t_idol.deal", label: `跟${who}談條件`, hint: s.studying ? "用成績交換" : "多幫忙做事", act: "negotiate", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${lead}。你跟${who}談好：${s2.studying ? "段考進步十名" : "幫家裡多做一個月的事"}就讓你去。{你真的做到了，|你差了一點點，${who}還是心軟了，}{那是你第一次去看${y < 1985 ? "登台演唱" : "演唱會"}。|那晚你開心得睡不著。}`), mood: 4 }) },
          { id: "t_idol.fans", label: "和同好一起排隊", hint: "一起追星比較好玩", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${lead}。你和幾個同好{${y < 2005 ? "在售票處門口排了一整晚的隊" : "一起守在電腦前搶票"}，|一起做了應援的海報，}{認識的朋友後來一直有聯絡。|那晚大家一起大合唱。}`), mood: 4 }) },
          { id: "t_idol.home", label: y >= 2008 ? "在家看直播" : y >= 1970 ? "在家看電視" : "在家聽廣播", hint: "不花錢也能看", act: "wait", style: "self", weight: 0.1, apply: (s2, c) => ({ text: c.w(`${lead}。你沒去，{${screen}，跟著一起唱。|把${them}的歌聽了一遍又一遍。}`), mood: 1 }) },
          { id: "t_idol.skip", label: "翹課去排隊", hint: "被抓到就完了", act: "avoid", style: "risk", weight: 0.1, when: () => s.studying, apply: (s2, c) => ({ text: c.w(`${lead}。你{翹了一整天的課|跟老師說肚子痛早退}去排隊，{買到了票，|排到的時候票剛好賣完，}{隔天被叫到辦公室。|回家被${who}禁足了一個月。}`), mood: 0 }) },
          { id: "t_idol.study", label: "先把書讀好", hint: "考完再去也不遲", act: "study", style: "learn", weight: 0.1, when: () => s.studying, apply: (s2, c) => ({ text: c.w(`${lead}。你把${y < 1985 ? "剪報" : "海報"}收好，{跟自己約定考完試再去看。|把偶像的照片貼在書桌前當動力。}{那一年你讀得特別認真。|你在日記裡寫：下次一定要去。}`), mood: 1 }) },
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
        ...(y >= 1965 ? [`家裡裝了第一支電話，黑色的轉盤電話放在客廳最顯眼的地方，{鄰居有事都會來借打。|你接電話時都會先清喉嚨。|${who}規定講電話不能超過三分鐘。}`] : []),
      ] : y < 1993 ? [
        `家裡的電話放在客廳，{你和同學講太久，${who}就在旁邊咳嗽。|你學會把電話線拉到房間門口偷偷講。}{一講就是一個小時。|電話費帳單來的那天，你躲得遠遠的。}`,
        "你有了一本自己的電話簿，{抄滿了同學家的電話，|每個名字旁邊都畫了小圖案，}{晚上打去同學家，接電話的總是對方的爸爸。|撥號前你都要先深呼吸。}",
        `你在學校旁的公共電話${y >= 1990 ? "{投了一塊錢|插了電話卡}" : "投了一塊錢"}打給${who}，{說今天要留下來練球。|說會晚一點回家。}{那是你第一次覺得自己長大了。|電話那頭只說了一句「早點回來」。}`,
      ] : y < 2000 ? [
        "你有了第一台 BB.Call，{腰上掛著它，走路都有風。|收到「530」就跑去找公共電話回電。}{同學之間流行用數字傳暗號，520 是什麼意思大家都知道。|有一次上課時它突然叫起來，全班都轉頭看你。}",
        `你存錢買了一台 BB.Call，{第一則留言是${f}傳的電話號碼，|每天都在等它震動，}{你把它收在書包的小口袋裡，當寶貝一樣。|${who}說你根本不需要那個東西。}`,
        `家裡多裝了一支電話分機，{你終於可以在房間裡講電話。|你和同學每天晚上講到電話發燙。}{有一次${who}拿起分機，你們都嚇了一跳。|那是你房間裡最重要的東西。}`,
      ] : y < 2011 ? [
        `${who}買了一支${y < 2004 ? "{直立式|摺疊}" : "摺疊"}手機給你，{一則簡訊要一塊多，你每個字都斟酌半天。|你花了一個晚上研究怎麼換鈴聲。|你最常做的事是換手機的桌布。}`,
        `你用打工和紅包錢買了第一支手機，{${y >= 2003 ? `拍的第一張照片是${f}的鬼臉，` : "存了全班的電話號碼，"}|每天晚上都在算這個月還剩幾則免費簡訊，}{手機吊飾比手機還重。|你把它放在枕頭邊才睡得著。}`,
        `有了手機以後，{你和同學用簡訊約放學去哪裡，|${who}每天晚上都會打來問你在哪裡，}{你學會了用注音飛快地打字。|你第一次覺得自己長大了。}`,
      ] : y < 2026 ? [
        `拿到第一支智慧型手機，{第一件事是${y >= 2012 ? "下載 LINE，加入全班的群組" : "下載通訊軟體，和同學互加好友"}。|你拍的第一張照片是窗外的天空。}{你和${who}約好晚上十點以後手機要放在客廳。|才一個月，螢幕就裂了一條線。}`,
        `有了智慧型手機以後，{你每天放學都在班上的群組聊到半夜。|你學會用手機查公車什麼時候來。}{${who}說你的頭都快黏在螢幕上了。|你第一次覺得自己長大了。}`,
        `${who}把用舊的手機給了你，{你換了一個透明的手機殼，|你下載了一堆遊戲又全部刪掉，}{每天都捨不得放下。|才發現原來有那麼多東西可以看。}`,
      ] : [
        `拿到第一支自己的手機，{你和${who}約好了使用的時間。|你第一件事是加入了全班的群組。}{每天都捨不得放下。|才發現原來有那麼多東西可以看。}`,
        `有了自己的手機以後，{你每天都和同學聊到半夜，|你學會自己查路線、自己訂票，}{${who}說你的頭都快黏在螢幕上了。|你第一次覺得自己長大了。}`,
        `${who}把用舊的手機給了你，{你換了一個透明的手機殼，|你把桌布換成和${f}的合照，}{每天都捨不得放下。|才一個月，螢幕就裂了一條線。}`,
      ];
      return { text: ctx.w(list), mood: 2 };
    },
  },
  {
    // 沉迷：武俠小說、漫畫、電動、線上遊戲、手遊、短影音
    id: "t_hooked", domain: "study", channel: "bad", once: true, ages: [13, 17], when: inSchool, p: () => 0.05,
    choice: (s, ctx) => {
      const who = grownUp(s, ctx), f = bestFriend(s), h = hookOf(s.year, ctx);
      const lead = `你迷上了${h.thing}，${ctx.rng.pick([`每天${h.verb}到半夜`, `段考前一天還在${h.verb}`, "上課時腦袋裡也全是它"])}`;
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          { id: "t_hooked.deal", label: `跟${who}約好時間`, hint: "週末才可以", act: "negotiate", style: "family", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${lead}。你和${who}約好{只有週末能${h.verb}兩個小時，|段考完才能碰，}{一開始很難熬，後來慢慢習慣了。|你偷偷破戒了幾次，但成績總算回來了。}`), mood: 0 }) },
          { id: "t_hooked.quit", label: "直接戒掉", hint: h.quit, act: "quitHabit", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你下定決心${h.quit}，{頭幾天手癢得要命，|空出來的時間不知道要做什麼，}{後來重新找回了打球的樂趣。|你發現一天其實很長。}`), mood: 1 }) },
          { id: "t_hooked.more", label: `繼續${h.verb}`, hint: "現在最快樂", act: "vice", style: "self", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${lead}。你繼續${h.verb}，{成績從前段掉到後段，|常常上課打瞌睡，}{直到${who}被老師請到學校。|有一天你突然覺得好空虛。}`), mood: -2 }) },
          { id: "t_hooked.craft", label: "把興趣變專長", hint: h.craft, act: "hobby", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你決定${h.craft}，{後來還在比賽得了獎。|雖然沒有成名，卻學到了很多。}`), mood: 3 }) },
          { id: "t_hooked.out", label: f ? `約${f.call}出去` : "約朋友出去", hint: "出去走走", act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${lead}。你約${f ? f.call : "同學"}出去{打球|騎腳踏車|逛街}，{${h.verb}的時間慢慢變少了。|你發現跟朋友出去比較好玩。}`), mood: 2 }) },
        ],
      };
    },
  },
  {
    // 大考前一年的壓力（國中、高中職各一次）
    id: "t_examStress", domain: "study", channel: "bad", max: 2, cooldown: 2, ages: [14, 17], p: () => 0.3,
    when: s => !s.abroad && s.studying && ((s.age === 14 && s.track === "國中") || (["高中", "高職"].includes(s.track) && s.age === (s.flags.trackAt ?? 15) + 2)),
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), f = bestFriend(s);
      const lead = `離${nextExam(s)}剩不到一年，${ctx.rng.pick([...(y >= 1975 ? ["教室後面的倒數計時牌每天少一天"] : []), "模擬考的成績一次比一次差", "每天讀到半夜，還是覺得讀不完", `${who}每天都問你讀得怎麼樣`])}`;
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          { id: "t_examStress.cram", label: "拚命讀", hint: "睡少一點", act: "pushThrough", style: "risk", weight: 0.3, apply: (s2, c) => { s2.health.stress = Math.min(1, s2.health.stress + 0.05); return { text: c.w(`${lead}。你每天讀到凌晨一點，{泡麵成了每天的宵夜，|黑眼圈越來越深，}{模擬考進步了，人卻瘦了一圈。|有一天在公車上睡過了站。}`), mood: -2 }; } },
          { id: "t_examStress.rest", label: "放鬆一下", hint: "週末留給自己", act: "rest", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${lead}。你決定週末留一天給自己，{睡到自然醒，|去看了一場電影，}{星期一回到教室，反而讀得比較進去。|有點罪惡感，但心情好多了。}`), mood: 2 }) },
          { id: "t_examStress.talk", label: "找人聊聊", hint: "說出來比較好", act: "talk", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你跟${f ? `{${f.call}|導師}` : "{導師|輔導老師}"}聊了一個下午，{原來大家都一樣怕。|對方說：「盡力就好，考完你還是你。」}{那晚你睡了一個好覺。|心裡的石頭輕了一些。}`), mood: 2 }) },
          { id: "t_examStress.run", label: "去運動", hint: "每天跑幾圈操場", act: "exercise", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你每天傍晚去操場跑三圈，{跑完腦袋清楚多了。|流完汗，焦慮好像也跟著流掉了一點。}`), mood: 2 }) },
          { id: "t_examStress.pray", label: "去拜文昌帝君", hint: "求個考運", act: "spiritual", style: "safe", weight: 0.12, apply: (s2, c) => ({ text: c.w(`${lead}。你和${who}去廟裡拜文昌帝君，{供了蔥、芹菜和一顆包子，|在紙上寫了名字和學校，}{求一個「包中」的好兆頭。|心裡安定了不少。}`), mood: 2 }) },
          { id: "t_examStress.group", label: "組讀書會", hint: "大家一起讀", act: "study", style: "learn", weight: 0.08, apply: (s2, c) => ({ text: c.w(`${lead}。你和${f ? f.call : "幾個同學"}組了讀書會，{每天放學在${y >= 1990 ? "麥當勞讀到打烊" : "圖書館讀到關門"}，|互相出題考對方，}{讀書變得沒那麼孤單。|你們約好考完要一起去${c.rng.pick(["墾丁", "花蓮", "日月潭", "澎湖"])}。}`), mood: 2 }) },
        ],
      };
    },
  },
  {
    // 和死黨吵架
    id: "t_friendFight", once: true, ages: [13, 17], when: s => !!bestFriend(s) && !s.abroad, p: () => 0.05,
    choice: (s, ctx) => {
      const y = s.year, f = bestFriend(s), ta = pronoun(f), snack = ctx.rng.pick(snackOf(y)), drink = y < 1980 ? "汽水" : y < 1995 ? "鋁箔包紅茶" : "珍珠奶茶";
      const topic = ctx.rng.pick(["分組報告誰沒做事", `你忘了${ta}的生日`, "借的漫畫被你弄丟了", "一句不經意的玩笑話", "你最近跟別人比較好"]);
      const lead = ctx.w(`和${f.call}為了${topic}吵架，已經{一個星期|三天|半個月}沒說話了`);
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          { id: "t_friendFight.sorry", label: "主動道歉", hint: "先低頭", act: "reconcile", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${lead}。你先開口說了對不起，${f.call}{愣了一下，然後笑了：「我也有不對啦。」|丟了一句「白癡喔」，你們就和好了。}`), mood: 3 }) },
          { id: "t_friendFight.write", label: y < 1990 ? "寫紙條說清楚" : y < 2000 ? "打電話說清楚" : "傳訊息說清楚", hint: "把話一次講完", act: "talk", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${lead}。你${sendTo(y)}${f.call}，把心裡的話一次說清楚。{隔天，${f.call}在你桌上放了一瓶${drink}。|${f.call}回了一句：「明天一起吃午餐？」}`), mood: 3 }) },
          { id: "t_friendFight.wait", label: "等對方先開口", hint: "又不是我的錯", act: "avoid", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${lead}。你等${f.call}先開口，${f.call}也在等你。{整整一個月，兩個人在走廊上擦肩而過。|後來你生日那天，抽屜裡多了一張${f.call}寫的卡片，你們才和好。}`), mood: -2 }) },
          { id: "t_friendFight.mediator", label: "請朋友當和事佬", hint: "找共同的朋友", act: "seekHelp", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。共同的朋友約你們一起去{吃冰|看電影}，{兩個人一開始都不說話，最後卻笑成一團。|散場的時候，你們又跟以前一樣了。}`), mood: 2 }) },
          { id: "t_friendFight.gift", label: `帶${snack}去找${ta}`, hint: "用行動和好", act: "reconcile", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你買了${f.call}最愛的${snack}，在${ta}家樓下等了半小時。{${f.call}下樓時，你們都沒提吵架的事。|${f.call}接過去，說：「你很煩欸。」然後笑了。}`), mood: 3 }) },
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
        `${worry}讓你好在意，{拍照時總是躲到最後一排。|照鏡子的時間越來越長。}後來${f}說：「{你想太多了啦。|大家都在煩自己的事好嗎。}」你才慢慢沒那麼在意。`,
        `${worry}讓你好在意，{每天出門前都要在鏡子前站好久，|連上台報告都想請假，}{${who}說：「你這樣很好看。」|${who}帶你去剪了一個新髮型，}{你嘴上說才不是，心裡卻偷偷開心。|那天你抬頭挺胸走進教室。}`,
        `${worry}讓你好在意，{你在日記裡寫了好多次「好想變成別人」。|你把房間的鏡子轉過去面對牆壁。}過了一陣子，你忙著{社團|考試|打球}，{突然發現已經好久沒想起這件事了。|才發現長大本來就是這個樣子。}`,
      ]), mood: 0 };
    },
  },
  {
    // 生涯迷惘
    id: "t_lost", domain: "study", channel: "change", once: true, ages: [16, 17], when: senior, p: () => 0.1,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx);
      const lead = `同學好像都知道自己以後要做什麼，你卻${ctx.rng.pick(["連自己喜歡什麼都說不出來", "看著科系介紹發呆了好幾個晚上", "越想越不知道"])}`;
      const set = (s2, k) => { s2.flags.careerView = k; };
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          { id: "t_lost.ask", label: y >= 2000 ? "去大學的營隊看看" : "去問學長姊", hint: "聽聽過來人怎麼說", act: "seekHelp", style: "social", weight: 0.28, apply: (s2, c) => { set(s2, "explore"); return { text: c.w(`${lead}。你${y >= 2000 ? "報名了大學的營隊，{第一次走進大學校園，|聽學長姊講大學在學什麼，}" : "跑去問畢業的學長姊，{聽他們講大學和工作的事，|他們給了你一大疊筆記和建議，}"}{心裡慢慢有了方向。|才發現原來有那麼多沒聽過的科系。}`), mood: 2 }; } },
          { id: "t_lost.family", label: `跟${who}聊聊`, hint: "聽聽家人的想法", act: "talk", style: "family", weight: 0.2, apply: (s2, c) => { set(s2, "family"); return { text: c.w(`${lead}。你跟${who}聊了一個晚上，${who}說：「{你喜歡就好，我們都支持你。|先讀一個以後找得到工作的吧。|我年輕的時候也不知道，走著走著就知道了。}」你把這句話放在心上。`), mood: 1 }; } },
          { id: "t_lost.read", label: "自己找資料", hint: y >= 2005 ? "上網看各種工作的介紹" : "去圖書館借書", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => { set(s2, "read"); return { text: c.w(`${lead}。你${y >= 2005 ? "上網看了好多不同工作的介紹" : "去圖書館借了好幾本職業介紹和人物傳記"}，{把有興趣的寫在一張紙上，|一個一個刪掉不喜歡的，}{最後剩下兩三個方向。|第一次覺得未來有了一點形狀。}`), mood: 2 }; } },
          { id: "t_lost.score", label: "先照分數選", hint: "以後再說", act: "wait", style: "safe", weight: 0.25, apply: (s2, c) => { set(s2, "score"); return { text: c.w(`${lead}。你決定先照分數選，{告訴自己以後再慢慢找方向。|反正很多人也是這樣。}`), mood: 0 }; } },
          { id: "t_lost.dream", label: "選自己喜歡的", hint: "就算冷門也沒關係", act: "insist", style: "risk", weight: 0.12, apply: (s2, c) => { set(s2, "dream"); return { text: c.w(`${lead}。你決定往自己喜歡的方向走，{就算親戚說那條路沒前途。|你在心裡偷偷做了決定，誰也沒說。}`), mood: 2 }; } },
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
        const job = ["貨運司機", "保全"].includes(s.job.title) ? null : s.job.title, work = job ? `當${job}` : "出來工作";
        return { text: ctx.w([
          `${s.age} 歲就${work}，{看著以前的同學穿著制服經過，心裡有點羨慕，也有點驕傲。|領到第一份薪水的那天，你把一半交給了${who}。}`,
          `${work}的這幾年，{你已經做得比剛來的大人還快，|老闆開始讓你自己處理一些事，}{下班回家，${who}總是留著一碗熱湯給你。|你偷偷存著錢，想學更多本事。}`,
          `每天一早就出門${job ? `去當${job}` : "上工"}，{同齡的人還在背課文，你已經學會怎麼跟客人說話。|手上的繭越來越厚。}{有時候你會想，如果繼續讀書會怎樣。|你告訴自己，這也是一條路。}`,
        ]), mood: 0 };
      }
      return { text: ctx.w(s.year < 1980 ? [
        "沒有繼續讀書，你跟著師傅當學徒，{學做木工，|學修腳踏車，|學做裁縫，}{從掃地、倒茶開始學，|晚上就睡在店裡的閣樓，}三年四個月才能出師。",
        `十幾歲就跟著師傅學手藝，{師傅脾氣不好，但教得很仔細。|你把師傅的每個動作都記在心裡。}{過年回家，${who}說你長高了。|第一次自己完成一件作品時，你偷偷笑了好久。}`,
        `沒有繼續讀書，你在家裡幫忙，{每天天還沒亮就起床，|跟著${who}{下田|顧店|做手工}，}{手上的繭越來越厚。|你告訴自己，這也是一條路。}`,
      ] : [
        `沒有繼續升學，你{在家裡幫忙，每天一早就起床。|跟著親戚學一技之長，師傅說你手很巧。}{看著以前的同學穿著制服經過，心裡有點複雜。|你告訴自己，這也是一條路。}`,
        `不讀書以後，你跟著${who}{顧店|做事}，{學會了怎麼算帳、怎麼跟客人說話，|才知道大人每天有多辛苦，}{你偷偷存著錢，想學更多本事。|有時候你會想，如果繼續讀書會怎樣。}`,
        "沒有繼續升學，你{白天幫忙家裡，晚上去學{修機車|美髮|做麵包}，|在親戚的店裡從學徒做起，}{手上的工夫一天比一天熟。|你發現自己很喜歡用雙手做東西。}",
      ]), mood: 0 };
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
