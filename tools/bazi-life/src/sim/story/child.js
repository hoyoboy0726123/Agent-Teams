// 童年（0–12 歲）：學走路、阿公阿嬤、第一個好朋友、寵物、才藝班、校外教學、運動會、過年紅包、卡通和玩具……
//
// 機率都是假設：這些小事沒有官方統計，每個事件一年的機率大多在 0.03–0.2，再用 once / max / cooldown 限制次數，
// 讓一個童年平均有六件左右的故事、其中兩三件要做選擇，不會把人生塞滿。
// 這裡不碰學歷、工作、婚姻、生育、房子和健康風險；那些在 core.js，依台灣統計校準。
//
// The probabilities are assumptions (no statistics exist for these events), set so a childhood holds about six of
// them, two or three of them choices. Nothing here touches schooling, work, marriage, births, homes or health risk.
//
// Left for later modules:
//   s.flags.bff          id of the best friend in s.friends (memory kind "bestFriend" has the name)
//   s.flags.pet          { kind, name, noun, since }          s.flags.talent       piano, art, abacus, code, …, none
//   s.flags.familyShop   the family's shop (柑仔店, 早餐店…)    s.flags.grandRaised  raised by grandparents as a baby
//   s.flags.liveWith     "father" | "mother": who you live with after the parents split
import { bornSiblings } from "../world.js";
import { siblingCall } from "../words.js";

// ---------- helpers, shared with teen.js ----------
// The best friend, while still in the story.
export const bestFriend = s => s.friends.find(f => f.id === s.flags.bff && f.alive !== false) || null;
export const friendName = (s, fallback) => { const f = bestFriend(s); return f ? f.call : fallback; };

// Someone new to be friends with (most childhood friends are the same sex); the best friend when there is none.
export function makeFriend(s, ctx, how, same = 0.85) {
  const sex = ctx.rng() < same ? s.sex : s.sex === "male" ? "female" : "male";
  const f = ctx.person({ role: "friend", sex, birthYear: s.birthYear + (ctx.rng() < 0.8 ? 0 : ctx.rng.int(3) - 1), how });
  s.friends.push(f);
  if (!bestFriend(s)) { s.flags.bff = f.id; f.bond = 0.7; ctx.remember("bestFriend", f.call, { name: f.call, call: f.call, sex: f.sex }); }
  return f;
}

// Who you live with: 爸媽; after a divorce the parent you stay with; the parent still alive; 阿嬤 when neither is.
// Custody went mostly to fathers before the 1996 civil code reform and mostly to mothers after it; the shares
// below are an assumption from that history.
export function liveWith(s, ctx) {
  const f = s.father.alive, m = s.mother.alive;
  if (f && m && !s.flags.parentsSplit) return "爸媽";
  if (f && m) {
    if (!s.flags.liveWith) s.flags.liveWith = ctx.rng() < (s.birthYear + (s.last.parentsDivorce ?? s.age) < 1996 ? 0.4 : 0.65) ? "mother" : "father";
    return s.flags.liveWith === "mother" ? "媽媽" : "爸爸";
  }
  return m ? "媽媽" : f ? "爸爸" : "阿嬤";
}
// One grown-up at home for a sentence (媽媽 more often than 爸爸 when both are there).
export const grownUp = (s, ctx) => { const h = liveWith(s, ctx); return h === "爸媽" ? (ctx.rng() < 0.65 ? "媽媽" : "爸爸") : h; };

// Brothers and sisters already born: older ones, and younger ones at least `minAge` years old.
export const olderSibs = s => bornSiblings(s).filter(x => x.older);
export const youngerSibs = (s, minAge = 3) => bornSiblings(s, minAge).filter(x => !x.older);

// What children watched and played with, by year: only things that were around in Taiwan that year (radio from
// the late 1920s, television from 1962, 黃俊雄's 布袋戲 at noon 1970–74, and so on); years after 2025 stay generic.
//   watch: what you did after school   toys: what everyone had   buy: something a child could buy
export function kidsCulture(y) {
  if (y < 1962) return { watch: [...(y >= 1930 ? ["每天守在收音機前聽廣播劇"] : []), "跟著大人擠在廟口看布袋戲", "跑去看廟口的野台戲"], toys: ["尪仔標", "彈珠", "竹蜻蜓", "陀螺"], buy: ["一大把尪仔標", "一袋彈珠", "一顆新陀螺"] };
  if (y < 1970) return { watch: ["跑去有電視的鄰居家看電視", "跟著大人擠在廟口看布袋戲", "每天守在收音機前聽廣播劇"], toys: ["尪仔標", "彈珠", "紙娃娃", "陀螺"], buy: ["一大把尪仔標", "一套紙娃娃", "一顆新陀螺"] };
  if (y < 1978) return { watch: [y < 1975 ? "每天中午守在電視前看布袋戲" : "放學後守在電視前看卡通", "跟著大人擠在廟口看布袋戲"], toys: ["尪仔標", "彈珠", "紙娃娃", "大同寶寶"], buy: ["一大把尪仔標", "一套紙娃娃", "一袋彈珠"] };
  if (y < 1990) return { watch: ["放學後守在電視前看《無敵鐵金剛》", "放學後守在電視前看《科學小飛俠》", ...(y >= 1980 ? ["放學後守在電視前看《小甜甜》", "躲在被窩裡看《小叮噹》漫畫"] : [])], toys: ["尪仔標", "紙娃娃", "戳戳樂", y >= 1986 ? "紅白機" : "彈珠"], buy: ["一台遙控車", "一套紙娃娃", y >= 1986 ? "一片紅白機的卡匣" : "一大把尪仔標"] };
  if (y < 1995) return { watch: ["放學後守在電視前看《七龍珠》", "躲在被窩裡看《小叮噹》漫畫", y >= 1992 ? "放學後守在電視前看《櫻桃小丸子》" : "放學後守在電視前看卡通"], toys: ["掌上型電動", "紅白機", "大富翁"], buy: ["一台掌上型電動", "一盒大富翁", "一套漫畫"] };
  if (y < 2000) return { watch: ["每個星期追著看《灌籃高手》", "每個星期追著看《美少女戰士》", "放學後守在電視前看《七龍珠》", y >= 1997 ? "放學後守在電視前看《哆啦A夢》" : "躲在被窩裡看《小叮噹》漫畫"], toys: ["四驅車", "掌上型電動", y >= 1997 ? "電子雞" : "大富翁"], buy: ["一台四驅車", "一台掌上型電動", y >= 1997 ? "一隻電子雞" : "一套漫畫"] };
  if (y < 2010) return { watch: ["放學後守在電視前看《神奇寶貝》", "放學後守在電視前看《名偵探柯南》", "放學後守在電視前看《哆啦A夢》", "放學後守在電視前看《蠟筆小新》"], toys: ["神奇寶貝卡", "掌上型電動", y >= 2002 ? "戰鬥陀螺" : "四驅車", y >= 2003 ? "遊戲王卡" : "大富翁"], buy: ["一整包神奇寶貝卡", "一台掌上型電動", y >= 2002 ? "一顆戰鬥陀螺" : "一台四驅車"] };
  if (y < 2020) return { watch: [y >= 2012 ? "每天用平板看 YouTube 上的卡通" : "每天用電腦看 YouTube 上的卡通", y >= 2014 ? "把《冰雪奇緣》看了好幾遍" : "放學後守在電視前看《哆啦A夢》", y >= 2015 ? "放學後守在電視前看《妖怪手錶》" : "放學後守在電視前看《海綿寶寶》"], toys: [y >= 2012 ? "平板" : "掌上型電動", "樂高", y >= 2016 ? "寶可夢 GO" : "戰鬥陀螺", y >= 2017 ? "Switch" : "遊戲王卡"], buy: ["一盒樂高", y >= 2017 ? "一片 Switch 的遊戲" : "一顆戰鬥陀螺", y >= 2015 ? "一個妖怪手錶" : "一整包遊戲王卡"] };
  if (y < 2026) return { watch: ["每天用平板看 YouTube 上的卡通", "追著看《鬼滅之刃》", "放學後守在電視前看《汪汪隊立大功》"], toys: ["Switch", "樂高", y >= 2021 ? "寶可夢卡" : "平板"], buy: ["一盒樂高", "一片 Switch 的遊戲", y >= 2021 ? "一整包寶可夢卡" : "一盒積木"] };
  return { watch: ["每天用平板看最新的動畫", "放學後追著看最紅的卡通"], toys: ["新出的遊戲機", "樂高", "會說話的機器人玩具"], buy: ["一盒樂高", "一個會說話的機器人玩具"] };
}
// Snacks from the corner shop, by year (乖乖 1968, 王子麵 1970, 可樂果 1975, 科學麵 1978).
export const snackOf = y => (y < 1970 ? ["麥芽糖", "龍眼乾", "李仔糖"] : y < 1990 ? ["王子麵", "乖乖", "麥芽餅"] : y < 2010 ? ["科學麵", "乖乖", "可樂果"] : ["科學麵", "洋芋片", "乖乖"]);
// A word with Latin letters (Switch, 寶可夢 GO) gets a space where it meets Chinese text.
export const pad = w => (/^[A-Za-z0-9]/.test(w) ? " " : "") + w + (/[A-Za-z0-9]$/.test(w) ? " " : "");
// How a child phones home: the corner shop's phone, a public phone (one coin), a mobile, a kids' watch.
const callHome = y => (y < 1975 ? "跑去雜貨店借電話打回家" : y < 2008 ? "投了一塊錢打公共電話回家" : y < 2015 ? "用手機打回家" : "用兒童手錶打回家");

// A pet that turns up, by year (黃金鼠 from the 1990s; 蠶寶寶 in primary schools from the 1970s).
function petFound(y, ctx) {
  const list = [
    [{ kind: "dog", noun: "小狗", how: "放學路上，一隻淋濕的小土狗一路跟著你回家", names: ["小黑", "小白", "阿福", "旺財", "來福", "豆豆"], tip: "要打哪些預防針", away: "被巷口機車行的老闆收養了", vet: true }, 3],
    [{ kind: "cat", noun: "小貓", how: "{鄰居|同學}家的貓生了一窩小貓，問你要不要抱一隻回家", names: ["咪咪", "小花", "阿橘", "球球", "喵喵"], tip: "貓砂要怎麼換", away: "被一位愛貓的阿姨抱走了", vet: true }, 2],
    [{ kind: "fish", noun: "金魚", how: `在${y < 1970 ? "廟會" : "夜市"}撈金魚，撈了好幾次，終於撈到一隻`, names: ["小紅", "小金", "泡泡"], tip: "水要先放一天再換", away: "被放進了學校的生態池" }, 1.5],
    [{ kind: "beetle", noun: "獨角仙", how: "{阿公|叔叔}從山上帶回一隻獨角仙", names: ["大力", "阿角", "黑金剛"], tip: "要準備多少腐植土", away: "被你放回了山上的樹林" }, 1],
  ];
  if (y >= 1970) list.push([{ kind: "silkworm", noun: "蠶寶寶", how: "同學分給你一隻蠶寶寶", names: null, tip: "桑葉要擦乾才能餵", away: "被送給了學校的自然老師" }, 1.5]);
  if (y >= 1995) list.push([{ kind: "hamster", noun: "黃金鼠", how: "{表哥|阿姨}送你一隻黃金鼠", names: ["布丁", "球球", "豆豆"], tip: "籠子要多久清一次", away: "被送回了原本的主人家" }, 1.5]);
  return ctx.rng.weighted(list);
}

export const CHILD = [
  {
    // 第一句話、學走路
    id: "c_firstWord", once: true, ages: [1, 2], p: () => 0.35,
    apply: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx);
      const word = ctx.rng.pick(["媽媽", "爸爸", "阿嬤", "ㄋㄟㄋㄟ", "抱抱", "車車"].filter(w => (w !== "媽媽" || s.mother.alive) && (w !== "爸爸" || s.father.alive)));
      const floor = y < 1965 ? "三合院的稻埕上" : y < 1990 ? "{磨石子地|榻榻米}上" : "客廳的{巧拼|木頭地板}上";
      const tell = y < 1975 ? "到處跟鄰居說" : "打電話跟親戚說";
      return { text: ctx.w([
        `你說出的第一句話是「${word}」，{${who}樂得${tell}。|全家人輪流逗你，想讓你再說一次。|${who}說這一刻等了好久。}`,
        `你在${floor}扶著{藤椅|茶几|${who}的手}，搖搖晃晃走了三步，{一屁股坐在地上，自己笑了起來。|全家人一起拍手。}`,
        `${y >= 1970 && y < 2010 ? "坐在學步車裡" : "扶著牆"}學走路的那陣子，{你一放手就往門口衝，|你追著滾來滾去的皮球跑，}${who}只好{把茶几的四個角都包起來。|在樓梯口擋了一塊木板。}`,
      ]), mood: 3 };
    },
  },
  {
    // 爸媽要上班，交給阿公阿嬤帶
    id: "c_grandRaised", domain: "family", channel: "good", once: true, ages: [2, 4], when: s => s.father.alive || s.mother.alive, p: () => 0.08,
    apply: (s, ctx) => {
      s.flags.grandRaised = true;
      const y = s.year, parents = liveWith(s, ctx);
      const busy = y < 1966 ? `${parents}{到城裡的工廠上班|在外地工作}` : y < 1975 ? `${parents}{到城裡的工廠上班|去加工區做工|在外地工作}` : y < 2000 ? `${parents}白天都要上班` : `${parents}{都要上班|每天加班到很晚}`;
      const tv = y < 1965 ? "收音機永遠在播歌仔戲" : y < 2000 ? "電視永遠在播歌仔戲" : "電視永遠在播台語八點檔";
      return { text: ctx.w([
        `${busy}，你被送到{鄉下的|南部的|隔壁鎮的}阿嬤家。{每天跟著阿嬤去菜市場，|阿公每天騎著${y < 1965 ? "腳踏車" : "機車"}載你去買早餐，}{你學會的第一首歌是阿嬤唱的{台語|}童謠。|阿嬤總是把最大塊的肉夾到你碗裡。}`,
        `${busy}，平常由阿公阿嬤帶你。{阿嬤背著你去{田裡|市場}，|阿公在門口的榕樹下教你認字，}{一直到要上學才回到${parents}身邊。|你最早的記憶都是阿嬤家的味道。}`,
        `${busy}，週一到週五你住在阿嬤家，週末才被接回家。{每次要走，你都抱著阿嬤的腿哭。|阿嬤家的${tv}。}`,
      ]), mood: 2 };
    },
  },
  {
    // 第一個好朋友：之後的事件會叫他的名字（s.flags.bff）
    id: "c_bestFriend", once: true, ages: [4, 9], when: s => !s.flags.bff && !s.abroad, p: () => 0.22,
    apply: (s, ctx) => {
      const y = s.year, school = s.studying ? "國小" : y < 2012 ? "幼稚園" : "幼兒園";
      const near = !s.studying && !s.done.has("kindergarten") ? true : ctx.rng() < 0.25;
      const f = makeFriend(s, ctx, near ? "鄰居" : `${school}同學`, 0.85);
      const kid = f.sex === "male" ? "男生" : "女生", toy = ctx.rng.pick(kidsCulture(y).toys);
      const play = y < 1965 ? "{去大水溝抓大肚魚|爬上龍眼樹摘龍眼|在稻埕上玩尪仔標}" : y < 1985 ? "{在柑仔店門口玩尪仔標|放學後在巷子裡玩紅綠燈|一起去河邊抓蝌蚪}" : y < 2000 ? "{交換貼紙|一起跳橡皮筋|下課搶著去盪鞦韆}" : y < 2015 ? "{交換卡片|下課搶著去盪鞦韆|一起在公園溜滑梯}" : "{一起在公園溜滑梯|下課在走廊玩鬼抓人|交換貼紙}";
      const meet = near
        ? `住在{隔壁|同一條巷子}的${f.call}，{第一次見面就把${pad(toy)}分你玩，|在巷口跟你比誰跑得快，}從此你們{天天玩在一起。|成了最好的朋友。}`
        : `${(s.studying ? s.last.primary : s.last.kindergarten) === s.age ? `上${school}的第一天` : s.studying ? "{換座位|分組做報告}那天" : "{分組|戶外教學}那天"}，坐你旁邊的${f.call}{借你一塊橡皮擦，|分你半塊餅乾，}從此你們{天天一起${s.studying ? "上學" : "玩"}。|成了最好的朋友。}`;
      return { text: ctx.w([
        `${f.how}${f.call}是個${f.nature}的${kid}。你們${play}，{好到連上廁所都要一起去。|每天都黏在一起。}`,
        meet,
        `你和${f.call}{打勾勾|蓋手印}約好，{長大要一起開一間{冰店|麵包店|漫畫店}。|以後要讀同一所學校。}{${f.call}是個${f.nature}的${kid}，|你們${play}，}那是你第一個最好的朋友。`,
      ]), mood: 3 };
    },
  },
  {
    // 想養寵物
    id: "c_pet", domain: "family", channel: "good", once: true, ages: [5, 12], when: s => !s.abroad, p: () => 0.05,
    choice: (s, ctx) => {
      const pet = petFound(s.year, ctx), who = grownUp(s, ctx), f = bestFriend(s);
      const name = pet.names ? ctx.rng.pick(pet.names) : pet.noun;
      const keep = s2 => { s2.flags.pet = { kind: pet.kind, name, noun: pet.noun, since: s2.age }; };
      const named = pet.names ? `你給牠取名叫${name}。` : "";
      const lead = ctx.w(pet.how);
      return {
        prompt: `${lead}。你好想養，要怎麼辦？`,
        options: [
          {
            id: "c_pet.promise", label: "拜託家人讓你養", hint: "答應每天自己照顧", act: "care", style: "family", weight: 0.3,
            apply: (s2, c) => {
              if (!pet.vet || c.rng() < 0.8) { keep(s2); return { text: c.w(`${lead}。你拜託${who}讓你養，{${who}答應了，條件是你要自己照顧牠。|${who}拗不過你，點頭了。}${named}{每天放學第一件事就是去看牠。|寫功課時牠就待在你旁邊。}`), mood: 4 }; }
              return { text: c.w(`${lead}。你拜託${who}讓你養，但家裡實在不方便，${who}幫牠找了{住在鄉下的叔公|開雜貨店的阿姨}收養，{說放假可以去看牠。|你後來去看過好幾次。}`), mood: -1 };
            },
          },
          {
            id: "c_pet.read", label: "先查好怎麼養", hint: "去圖書館或上網查", act: "study", style: "learn", weight: 0.15,
            apply: (s2, c) => { keep(s2); return { text: c.w(`${lead}。你先${s2.year >= 2000 ? "{上網|去圖書館}" : "去圖書館"}查了怎麼養${pet.noun}，{把要準備的東西一條一條抄在本子上，|連${pet.tip}都弄清楚了，}${who}看你這麼認真，答應讓你養。${named}`), mood: 3 }; },
          },
          {
            id: "c_pet.hide", label: "先偷偷養", hint: "藏起來再說", act: "avoid", style: "risk", weight: 0.12,
            apply: (s2, c) => {
              const ok = c.rng() < 0.5;
              if (ok) keep(s2);
              return { text: c.w(`${lead}。你把${pet.noun}藏在{頂樓水塔旁的紙箱|床底下的鞋盒|陽台的角落}裡，{三天後|不到一個星期}就被${who}發現了。${ok ? `{${who}嘆了一口氣，說：「好啦，養吧。」|${who}看你哭成那樣，只好讓你養。}` : `{${who}把牠送給了想養的鄰居。|${who}說家裡真的不能養，幫牠找了新主人。}`}`), mood: ok ? 3 : -2 };
            },
          },
          {
            id: "c_pet.friend", label: "送給想養的同學", hint: "讓牠有個好人家", act: "seekHelp", style: "social", weight: 0.13,
            apply: (s2, c) => ({ text: c.w(`${lead}。你問遍了全班，${f ? `${f.call}家剛好想養` : "有個同學家裡有院子，願意收養"}，{你常常跑去看牠。|牠在新家過得很好。}`), mood: 1 }),
          },
          {
            id: "c_pet.no", label: "聽家人的，不養", hint: "家裡不方便", act: "wait", style: "safe", weight: 0.18,
            apply: (s2, c) => ({ text: c.w(`${lead}。${who}說家裡沒辦法養，你{難過了一個晚上，|在日記裡畫了一張牠的畫，}後來牠${pet.away}。`), mood: -2 }),
          },
          {
            id: "c_pet.vet", label: "先帶去給獸醫看", hint: "確定牠健康", act: "seeDoctor", style: "health", weight: 0.12, when: () => !!pet.vet,
            apply: (s2, c) => { keep(s2); return { text: c.w(`${lead}。${who}陪你把牠帶去{獸醫院|動物醫院}，{打了預防針、除了跳蚤，|獸醫說牠很健康，}${who}就答應讓你養了。${named}`), mood: 4 }; },
          },
        ],
      };
    },
  },
  {
    // 才藝班
    id: "c_talent", domain: "study", channel: "good", once: true, ages: [5, 10], when: s => !s.abroad, p: () => 0.09,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), calc = y < 1980 ? "珠算" : "心算";
      const learn = (key, text, mood = 3) => (s2, c) => { s2.flags.talent = key; return { text: c.w(text), mood }; };
      return {
        prompt: y < 1970 ? `巷口開了一間${calc}班，${who}問你想不想去學點東西。要學什麼？` : `${who}拿著一張才藝班的傳單問你：想學什麼？`,
        options: [
          { id: "c_talent.piano", label: "鋼琴", hint: "每週去老師家上課", act: "hobby", style: "learn", weight: 0.2, when: () => y >= 1970, apply: learn("piano", "開始學鋼琴，每個星期六去老師家上課，{〈小蜜蜂〉彈到全家都會唱。|拜爾練到一半，手指頭痠得要命。|第一次上台發表，彈完才發現自己一直在抖。}") },
          { id: "c_talent.art", label: "畫畫", hint: "蠟筆、水彩、素描", act: "hobby", style: "learn", weight: 0.2, apply: learn("art", "去學畫畫，{蠟筆換成了水彩，|每週都畫滿一整本圖畫紙，}{你畫的{家裡的貓|阿嬤的菜園|校門口的大榕樹}被貼在教室後面。|寫生比賽還拿了佳作。}") },
          { id: "c_talent.abacus", label: calc, hint: "手指上的算盤", act: "study", style: "safe", weight: 0.18, when: () => y < 2015, apply: learn("abacus", `去學${calc}，{手指在桌上撥著看不見的算盤，|考試時手指在桌子底下偷偷撥算盤，}{算錢算得比大人還快。|後來檢定考過了{三|四}級。}`) },
          { id: "c_talent.code", label: "程式積木", hint: "讓機器人動起來", act: "study", style: "learn", weight: 0.12, when: () => y >= 2015, apply: learn("code", "去上程式積木課，{用積木讓小車子轉彎，|做了一個會跑的小遊戲，}{得意地表演給全家看。|回家一直問電腦為什麼聽得懂。}") },
          { id: "c_talent.callig", label: "書法", hint: "磨墨、寫大字", act: "hobby", style: "safe", weight: 0.15, when: () => y < 1985, apply: learn("calligraphy", "去學書法，{每天磨墨寫大字，|手上永遠沾著墨，}{過年時寫了一張春聯貼在門口。|老師說你的字很端正。}") },
          { id: "c_talent.kick", label: "跆拳道", hint: "從白帶開始練", act: "exercise", style: "health", weight: 0.12, when: () => y >= 1985, apply: learn("taekwondo", "去學跆拳道，{從白帶練到了綠帶，|每次喊「嘿！」都特別大聲，}{整個人變得很有精神。|踢破木板那天，你回家講了一整晚。}") },
          { id: "c_talent.swim", label: "游泳", hint: "學會換氣", act: "exercise", style: "health", weight: 0.12, when: () => y >= 1995, apply: learn("swim", "去學游泳，{第一堂課抱著浮板不敢放手，|嗆了好幾口水，}{後來可以一口氣游二十五公尺。|學會換氣那天，你在水裡笑得好開心。}") },
          { id: "c_talent.none", label: "不想學，想玩", hint: "週末要拿來玩", act: "rest", style: "self", weight: y < 1975 ? 0.4 : 0.2, apply: learn("none", `你說什麼都不想學，{週末都在${y < 1985 ? "巷子裡" : "公園"}玩到天黑。|${who}嘆了一口氣，把傳單收進抽屜。}`, 1) },
        ],
      };
    },
  },
  {
    // 被同學欺負（不寫細節）
    id: "c_bullied", domain: "study", channel: "bad", max: 1, ages: [7, 12], when: s => s.studying && !s.abroad, p: () => 0.035,
    choice: (s, ctx) => {
      const what = ctx.rng.pick(["幫你取難聽的綽號", "把你的鉛筆盒藏起來", "下課不讓你一起玩", "在你的課本上亂畫", "學你講話的口音"]);
      const who = grownUp(s, ctx), f = bestFriend(s), lead = `班上有幾個同學一直${what}`;
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          {
            id: "c_bullied.teacher", label: "告訴老師", hint: "請大人處理", act: "seekHelp", style: "social", weight: 0.28,
            // Corporal punishment in schools was banned in 2006.
            apply: (s2, c) => ({ text: c.w(s2.year < 2006 ? `${lead}，你告訴了老師。老師把那幾個同學叫到{講台前打手心，|走廊罰站，}{後來他們就不敢了。|之後再也沒有人找你麻煩。}` : `${lead}，你告訴了老師。老師{找那幾個同學和家長來談，|在班會上讓大家討論這件事，}{他們跟你道了歉。|後來就沒有人再這樣了。}`), mood: 1 }),
          },
          { id: "c_bullied.home", label: `回家告訴${who}`, hint: "說出來", act: "talk", style: "family", weight: 0.22, apply: (s2, c) => ({ text: c.w(`${lead}，你回家告訴了${who}。${who}{隔天親自到學校找老師談，|抱著你說「這不是你的錯」，}{你終於睡了一個好覺。|那幾個同學後來收斂了。}`), mood: 1 }) },
          { id: "c_bullied.endure", label: "忍耐", hint: "也許過一陣子就好", act: "pushThrough", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${lead}，你決定忍耐，{每天下課都躲在圖書館看書。|假裝不在意，回家才偷偷哭。}{一直到重新分班，事情才結束。|過了一個學期，事情才慢慢過去。}`), mood: -4 }) },
          { id: "c_bullied.friend", label: f ? `找${f.call}陪你` : "找朋友陪你", hint: "不要一個人", act: "seekHelp", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}，你找${f ? f.call : "隔壁班的朋友"}{下課陪你一起，|一起走路回家，}{兩個人在一起，那幾個人就不敢亂來了。|有人陪著，你沒那麼怕了。}`), mood: 1 }) },
          { id: "c_bullied.stand", label: "當面說「不要」", hint: "自己站出來", act: "insist", style: "risk", weight: 0.1, apply: (s2, c) => ({ text: c.w(`${lead}，你{站起來大聲說：「不要再這樣了！」|走到他們面前，把話說清楚。}{全班都安靜了，|他們愣了一下，}{之後就沒有再找你麻煩。|雖然手在發抖，你很驕傲。}`), mood: 2 }) },
          { id: "c_bullied.counsel", label: "去輔導室", hint: "找輔導老師聊", act: "counsel", style: "health", weight: 0.05, when: () => s.year >= 1985, apply: (s2, c) => ({ text: c.w(`${lead}，你去了輔導室。輔導老師{聽你說了一整節課，|陪你一起想辦法，}{後來還找那幾個同學一起聊。|你知道有人站在你這邊。}`), mood: 1 }) },
        ],
      };
    },
  },
  {
    // 遠足、校外教學
    id: "c_fieldTrip", max: 2, cooldown: 2, ages: [7, 12], when: s => s.studying && !s.abroad, p: () => 0.1,
    apply: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), f = friendName(s, "同學");
      if (y < 1975) return { text: ctx.w([
        "學校遠足，全班排著隊走了好遠的路去{後山|河邊|海邊}，{便當裡有一顆滷蛋。|回程腳都起水泡了。}{你一路上都在唱歌。|那天晚上你一沾枕頭就睡著了。}",
        `遠足的前一晚你興奮得睡不著，{一早就把水壺裝滿，|書包裡塞滿了${ctx.rng.pick(snackOf(y))}，}{走到半路就喊累了。|和${f}一路比賽誰走得快。}`,
        `遠足去{附近的大廟|山上的水庫}，${who}{幫你煮了兩顆茶葉蛋。|前一天晚上就把便當準備好。}{你和同學在樹下分著吃。|回家累到倒頭就睡。}`,
      ]), mood: 3 };
      const places = ["動物園", "故宮", "海邊的漁港"];
      if (y >= 1980) places.push("六福村");
      if (y >= 1985) places.push("小人國");
      if (y >= 1987) places.push("九族文化村");
      if (y >= 1990) places.push("科博館");
      if (y >= 1991) places.push("劍湖山");
      if (y >= 2000) places.push("海生館");
      if (y >= 2005) places.push("觀光工廠");
      const place = ctx.rng.pick(places), sing = y >= 1988 ? "遊覽車上大家輪流唱卡拉OK，" : "遊覽車上大家一起唱歌，";
      return { text: ctx.w([
        `校外教學去${place}，{${sing}|一上遊覽車就開始吃零食，}{你把零用錢全買了紀念品。|回程在車上睡得東倒西歪。}`,
        `校外教學去${place}，${who}幫你準備的便當{有你最愛的炸排骨，|被同學羨慕了一整天，}{你回家後講了一整晚。|那天的照片你一直留著。}`,
        `校外教學去${place}，{你和${f}跑在最前面，|老師一路上一直數人頭，}{差點跟丟了隊伍。|你回家把看到的東西全部講了一遍。}`,
      ]), mood: 3 };
    },
  },
  {
    // 運動會
    id: "c_sportsDay", domain: "health", channel: "good", max: 1, ages: [7, 12], when: s => s.studying && !s.abroad, p: () => 0.08,
    choice: (s, ctx) => {
      const f = bestFriend(s), snack = ctx.rng.pick(snackOf(s.year)), stick = s.year >= 1985 ? "寶特瓶裝沙子" : "舊報紙捲";
      return {
        prompt: "運動會快到了，老師在挑大隊接力的選手，還缺幾個人。你要怎麼做？",
        options: [
          {
            id: "c_sportsDay.relay", label: "自願跑大隊接力", hint: "全校都在看", act: "exercise", style: "risk", weight: 0.22,
            apply: (s2, c) => (c.roll("health", "good", 0.5)
              ? { text: c.w("運動會那天你自願跑大隊接力，{跑最後一棒，在彎道追過兩個人，|一路衝過終點線，}{全班衝進跑道把你圍住。|你們班拿了第一名。}"), mood: 6 }
              : { text: c.w("運動會那天你自願跑大隊接力，交棒時一不小心，棒子掉在地上。{你撿起來繼續跑，|你咬著牙追上去，}{最後全班還是為你拍手。|下了跑道，老師拍拍你的肩膀說你跑得很好。}"), mood: -1 }),
          },
          { id: "c_sportsDay.tug", label: "參加拔河", hint: "大家一起出力", act: "socialize", style: "social", weight: 0.22, apply: (s2, c) => ({ text: c.w("運動會你參加拔河，全班一起喊「{一、二，拉！|嘿咻！嘿咻！}」，{手掌磨得紅紅的，|最後只輸了一點點，}{大家還是笑成一團。|那是你第一次覺得全班是一體的。}"), mood: 3 }) },
          { id: "c_sportsDay.practice", label: "每天早上練跑", hint: "想跑得更快", act: "exercise", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w("為了運動會，你每天提早半小時到學校練跑，{比賽那天，六十公尺跑了第{二|三}名。|雖然沒得名，但跑出了自己最快的成績。}"), mood: 3 }) },
          { id: "c_sportsDay.flag", label: "負責畫班旗", hint: "不用跑也能幫忙", act: "hobby", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w("運動會你負責畫班旗，{用水彩畫了一隻大老虎，|熬了兩個晚上才畫完，}{進場時，全班舉著你畫的旗子走過司令台。|校長在司令台上特別誇了一句。}"), mood: 3 }) },
          { id: "c_sportsDay.cheer", label: "當啦啦隊", hint: "在旁邊加油", act: "wait", style: "safe", weight: 0.14, apply: (s2, c) => ({ text: c.w(`運動會你當啦啦隊，{用${stick}做了加油棒，|在跑道旁喊到喉嚨都啞了，}{你們班的選手跑過來時，你喊得最大聲。|那天晚上回家，你連說話都沙沙的。}`), mood: 2 }) },
          { id: "c_sportsDay.shade", label: "躲在司令台下乘涼", hint: "反正不是你的事", act: "rest", style: "self", weight: 0.12, apply: (s2, c) => ({ text: c.w(`運動會那天，你躲在司令台下的陰影裡乘涼，{和${f ? f.call : "隔壁班的同學"}偷吃${snack}，|看著別人跑來跑去，}{結果被老師抓去幫忙搬椅子。|那是你曬得最少的一次運動會。}`), mood: 1 }) },
        ],
      };
    },
  },
  {
    // 過年紅包
    id: "c_redEnvelope", domain: "wealth", channel: "good", max: 2, cooldown: 4, ages: [4, 12], when: s => !s.abroad, p: () => 0.06,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), home = liveWith(s, ctx), keeper = home === "爸媽" ? "媽媽" : home;
      const amount = y < 1950 ? "幾個銅板" : y < 1970 ? "幾十塊" : y < 1980 ? "兩三百塊" : y < 1990 ? "一千多塊" : y < 2000 ? "三四千塊" : y < 2010 ? "五六千塊" : "快一萬塊";
      const bank = y < 1965 ? "竹筒撲滿" : "{郵局的儲金簿|小豬撲滿}", buy = ctx.rng.pick(kidsCulture(y).buy);
      const lead = `過年收了${amount}的紅包`;
      return {
        prompt: `過年跟著${home}拜年，收了一疊紅包，加起來有${amount}。要怎麼用？`,
        options: [
          { id: "c_redEnvelope.save", label: "存起來", hint: "看著數字變多", act: "save", style: "safe", weight: 0.25, apply: (s2, c) => { s2.flags.saver = true; return { text: c.w(`${lead}，你全部存進${bank}，{看著數字一點一點變多，好有成就感。|說好要存到買一台腳踏車。}`), mood: 2 }; } },
          { id: "c_redEnvelope.toy", label: "買想要的玩具", hint: "終於可以買了", act: "hobby", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${lead}，你拿去買了${buy}，{抱著它睡了好幾天。|那是你自己出錢買的第一樣東西。}`), mood: 4 }) },
          { id: "c_redEnvelope.keeper", label: `交給${keeper}保管`, hint: "說是幫你存起來", act: "save", style: "family", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${lead}，你全部交給${keeper}，${keeper}說要幫你存起來。{那筆錢從此下落不明，|後來那些錢都變成了你的學費和新制服，}{你長大才懂。|這是很多台灣小孩共同的回憶。}`), mood: 0 }) },
          { id: "c_redEnvelope.gift", label: "買禮物送家人", hint: "換你送大家", act: "care", style: "family", weight: 0.12, apply: (s2, c) => ({ text: c.w(`${lead}，{你幫阿嬤買了一條圍巾，阿嬤戴著它去菜市場逢人就說。|你買了一盒${who}愛吃的鳳梨酥，${who}笑說你長大了。|你畫了一張卡片，連同一個小紅包送給${keeper}，那張卡片被收在皮夾裡好多年。}`), mood: 4 }) },
          { id: "c_redEnvelope.book", label: "買一套書", hint: "故事書或漫畫", act: "study", style: "learn", weight: 0.1, apply: (s2, c) => ({ text: c.w(`${lead}，你去書局買了{一整套故事書|一套漫畫${y >= 2000 ? "|一本《哈利波特》" : ""}}，{看到半夜被叫去睡覺。|書角都被你翻爛了。}`), mood: 3 }) },
          {
            id: "c_redEnvelope.gamble", label: y < 2005 ? "去柑仔店抽獎" : "去夾娃娃", hint: "說不定中大獎", act: "lottery", style: "risk", weight: 0.08,
            apply: (s2, c) => ({ text: c.w(y < 2005 ? `${lead}，你拿去柑仔店${y < 1970 ? "抽籤" : "玩戳戳樂"}，{換到一堆糖果和小玩具，|抽到了大獎，抱著獎品跑回家，}{被${who}唸了一頓。|還是覺得很值得。}` : `${lead}，你拿去夾娃娃，{夾了二十幾次才夾到一隻小熊，|一次都沒夾到，}{被${who}唸了一頓。|還是覺得很好玩。}`), mood: 1 }),
          },
        ],
      };
    },
  },
  {
    // 第一次自己搭車
    id: "c_bus", domain: "move", channel: "change", once: true, ages: [8, 12], when: s => !s.abroad, p: () => 0.07,
    choice: (s, ctx) => {
      const y = s.year, here = s.county || "", who = grownUp(s, ctx);
      const metro = (["臺北市", "新北市"].includes(here) && y >= 1997) || (here === "高雄市" && y >= 2009) || (here === "臺中市" && y >= 2021);
      const mrt = metro && ctx.rng() < 0.4, ride = mrt ? "捷運" : "公車", staff = mrt ? "站務人員" : "司機";
      const dest = ctx.rng.pick(["阿嬤家", "補習班", "圖書館", "同學家"]);
      const lead = `第一次自己搭${ride}去${dest}，結果${ctx.rng.pick(["坐過站了", "坐錯方向了"])}`;
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          { id: "c_bus.ask", label: `問${staff}`, hint: "開口問大人", act: "seekHelp", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${lead}。你鼓起勇氣問${staff}，{${staff}告訴你在下一站下車，換到對面坐回去就好。|${staff}笑著說：「別緊張，我跟你說怎麼走。」}{你一路緊盯著站名。|到了以後，你大聲說了謝謝。}`), mood: 2 }) },
          { id: "c_bus.walk", label: "下車自己走回去", hint: "記得路就不怕", act: "wait", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(`${lead}。你在下一站下車，{沿著來時的路走回去，|看著路牌一條一條找，}{走了快半個小時才到。|到的時候滿頭大汗，但很得意。}`), mood: 1 }) },
          { id: "c_bus.call", label: "打電話回家", hint: "找家人來接", act: "seekHelp", style: "family", weight: 0.25, when: () => y >= 1965, apply: (s2, c) => ({ text: c.w(`${lead}。你${callHome(y)}，${who}{騎機車來接你，|趕過來找你，}{一路上沒罵你，只說下次要記得看站名。|回家後教你怎麼看路線圖。}`), mood: 1 }) },
          { id: "c_bus.loop", label: "坐到終點站再坐回來", hint: "反正會繞回來", act: "wait", style: "risk", weight: 0.1, apply: (s2, c) => ({ text: c.w(`${lead}。你乾脆坐到終點站，{一路看著窗外沒看過的風景，|在終點站等了好久才有回程的車，}{再坐回來時天都快黑了。|回到家才發現${who}急壞了。}`), mood: 0 }) },
          { id: "c_bus.map", label: "看路線圖自己找", hint: "自己想辦法", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你下車研究${mrt ? "牆上" : "站牌上"}的路線圖，{找到了換車的方法，|看了好久，}{自己轉車到了${dest}。|從此你成了全家最會看路線圖的人。}`), mood: 3 }) },
        ],
      };
    },
  },
  {
    // 家裡開店，放學就在店裡幫忙
    id: "c_shop", domain: "family", channel: "good", max: 2, cooldown: 3, ages: [6, 12], when: s => (s.father.alive || s.mother.alive) && !s.abroad, p: () => 0.04,
    apply: (s, ctx) => {
      const y = s.year;
      if (!s.flags.familyShop) s.flags.familyShop = ctx.rng.pick(y < 1980 ? ["柑仔店", "麵攤", "腳踏車行", "理髮店", "雜貨店"] : y < 2000 ? ["柑仔店", "早餐店", "五金行", "麵店", "文具店", "機車行"] : ["早餐店", "小吃店", "飲料店", "便當店", "夜市攤位"]);
      const shop = s.flags.familyShop, who = liveWith(s, ctx), pay = y < 1975 ? "五塊錢" : y < 1995 ? "五十塊" : "一百塊";
      return { text: ctx.w([
        `放學後你就在家裡的${shop}寫功課，{客人來了還會幫忙找錢。|熟客都叫你「小老闆」。}{${who}說你比大人還會招呼客人。|功課常常寫到一半就跑去幫忙。}`,
        `週末你在家裡的${shop}幫忙，{幫客人裝袋、算錢，|整理架子、掃地，}{一個下午賺到${pay}零用錢。|${who}說你比請來的人還認真。}`,
        `過年前家裡的${shop}忙翻了，你{踩著小板凳幫忙，|一直跑腿幫忙買東西，}{累到吃完年夜飯就睡著了。|那年的紅包特別厚。}`,
      ]), mood: 2 };
    },
  },
  {
    // 那個年代的卡通和玩具
    id: "c_cartoon", max: 2, cooldown: 3, ages: [4, 12], p: () => 0.09,
    apply: (s, ctx) => {
      const k = kidsCulture(s.year), watch = ctx.rng.pick(k.watch), toy = ctx.rng.pick(k.toys), f = friendName(s, "同學"), who = grownUp(s, ctx);
      return { text: ctx.w([
        `那幾年你${watch}，{連吃飯都捨不得離開。|隔天下課就和同學演一遍。|那是你一整天最期待的時間。}`,
        `${pad(toy).trimStart()}是那幾年最流行的東西，你和${f}{下課就湊在一起玩，|比賽誰的比較厲害，}{有一次玩到忘了回家吃飯。|零用錢全花在上面。}`,
        `班上最紅的是${pad(toy).trimEnd()}，{你求了${who}好久，終於在生日那天拿到。|你沒有，只好每天借${f}的來玩。|你把它寫進了作文〈我最喜歡的東西〉。}`,
      ]), mood: 2 };
    },
  },
  {
    // 暑假作業
    id: "c_summerHw", domain: "study", channel: "change", max: 1, ages: [7, 12], when: s => s.studying && !s.abroad, p: () => 0.06,
    choice: (s, ctx) => {
      const f = bestFriend(s), old = olderSibs(s), helper = old.length ? siblingCall(ctx.rng.pick(old)) : grownUp(s, ctx);
      const lead = "暑假開始，老師發了一大疊暑假作業，還要每天寫日記";
      return {
        prompt: `${lead}。打算怎麼寫？`,
        options: [
          { id: "c_summerHw.early", label: "第一週就寫完", hint: "寫完才能痛快玩", act: "study", style: "safe", weight: 0.18, apply: (s2, c) => ({ text: c.w(`${lead}。你第一個星期就把作業寫完，{剩下的日子玩到曬成黑炭。|之後只剩日記每天寫一篇。}`), mood: 3 }) },
          { id: "c_summerHw.daily", label: "每天寫一點", hint: "照進度慢慢來", act: "study", style: "learn", weight: 0.22, apply: (s2, c) => ({ text: c.w(`${lead}。你每天寫兩頁，{開學那天交出整整齊齊的一本，|日記裡還畫了插圖，}{老師在上面蓋了一個「優」。|被老師拿去給全班看。}`), mood: 3 }) },
          { id: "c_summerHw.last", label: "最後幾天再趕", hint: "先玩再說", act: "pushThrough", style: "risk", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${lead}。你玩了一整個暑假，最後三天才開始趕，{日記裡的天氣全部寫「晴」，|二十篇日記一個晚上補完，}{開學前一晚寫到半夜。|寫到手都抽筋了。}`), mood: -1 }) },
          { id: "c_summerHw.together", label: f ? `跟${f.call}一起寫` : "跟同學一起寫", hint: "互相幫忙", act: "socialize", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你和${f ? f.call : "同學"}每天下午{在${f ? f.call : "同學"}家|在圖書館}一起寫，{寫一寫就聊起天來，|互相對答案，}{最後兩個人連錯字都一樣。|那是最好玩的一個暑假。}`), mood: 3 }) },
          { id: "c_summerHw.help", label: `拜託${helper}幫忙`, hint: "勞作太難了", act: "seekHelp", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。勞作太難了，${helper}幫你{用冰棒棍搭了一棟房子，|用紙黏土捏了一隻恐龍，}{開學時老師問：「這是誰做的？」|你在旁邊負責塗顏色。}`), mood: 2 }) },
        ],
      };
    },
  },
  {
    // 生日
    id: "c_birthday", domain: "family", channel: "good", max: 2, cooldown: 3, ages: [3, 12], p: () => 0.07,
    apply: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), old = olderSibs(s), buy = ctx.rng.pick(kidsCulture(y).buy);
      const list = y < 1975
        ? [`生日那天，${who}煮了一碗豬腳麵線，{碗裡還多了一顆滷蛋。|你連湯都喝光了。}{那是一年裡最期待的一天。|${who}說吃了麵線會長命百歲。|${who}還偷偷塞給你一個小紅包。}`,
          `生日那天沒有蛋糕，${who}{在你的便當裡多放了一顆蛋，|帶你去廟口吃了一碗麵，}{你覺得自己是全世界最幸福的人。|那天連功課都寫得特別快。}`]
        : [`生日那天，${who}{從麵包店買了一個鮮奶油蛋糕，你把蛋糕上的櫻桃留到最後才吃。|帶你去吃了一碗牛肉麵，還多加了一顆滷蛋。}{你許的願是想要${buy}。|那天你一直笑。}`,
          `生日那天，${who}{買了一個小蛋糕，全家圍在桌邊幫你唱生日快樂歌，你吹蠟燭時許了一個不能說的願望。|煮了一碗豬腳麵線，說吃了會長命百歲，你連湯都喝光了。}`,
          `生日那天，${who}{帶你去照相館拍了一張照片，|帶你去百貨公司頂樓的遊樂場玩，|在你的碗裡多放了一顆滷蛋，}{你覺得自己是全世界最幸福的人。|那天連功課都寫得特別快。}`];
      if (y >= 1986 && y < 2010 && s.age >= 5) list.push(`生日那天在${y >= 1990 ? "麥當勞" : "家裡"}辦了慶生會，{請了班上的好朋友來，|${friendName(s, "同學")}送了你一張自己畫的卡片，}{大家戴著紙帽子唱生日快樂歌。|你第一次覺得自己是主角。}`);
      if (y >= 2000 && s.studying) list.push(`生日那天，全班在教室一起唱生日快樂歌，{你分了小蛋糕給每個同學。|你收到一張全班簽名的卡片。}{${who}在家裡還準備了第二個蛋糕。|那天你笑得最開心。}`);
      if (old.length) list.push(`${siblingCall(ctx.rng.pick(old))}用存了好久的零用錢，買了${buy}送你當生日禮物，{你高興得跳起來。|你們一起玩到半夜被罵。}`);
      const away = s.flags.parentsSplit && (s.flags.liveWith === "mother" ? s.father.alive && "爸爸" : s.mother.alive && "媽媽");
      if (away) list.push(`那年生日，${away}特地{請假陪你過，|帶你去吃了一頓牛排，}{你把那天的照片貼在書桌前。|你許願明年還要一起過。}`);
      return { text: ctx.w(list), mood: 3 };
    },
  },
  {
    // 半夜聽到爸媽吵架
    id: "c_nightQuarrel", domain: "family", channel: "bad", tags: ["father", "mother"], max: 1, ages: [5, 12],
    when: s => s.father.alive && s.mother.alive && !s.flags.parentsSplit && !s.abroad, p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year, topic = ctx.rng.pick(["錢", "爸爸太晚回家", "阿公阿嬤的事", "工作", "你的功課"]);
      const old = olderSibs(s), young = youngerSibs(s, 3), sib = old.length ? siblingCall(ctx.rng.pick(old)) : young.length ? siblingCall(ctx.rng.pick(young)) : null;
      const music = y < 1980 ? "把收音機貼在耳邊" : y < 2005 ? "戴上隨身聽的耳機" : y < 2012 ? "戴上 MP3 的耳機" : "戴上耳機看平板";
      const lead = `半夜被客廳的聲音吵醒，爸爸媽媽在為了${topic}吵架`;
      return {
        prompt: `${lead}。你要怎麼辦？`,
        options: [
          { id: "c_nightQuarrel.hide", label: "躲回被子裡", hint: "假裝沒聽到", act: "avoid", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w(`${lead}。你把頭埋進被子裡，{數著時鐘的滴答聲，|小聲地哼著兒歌，}{不知道什麼時候睡著了。|隔天早上，餐桌上安安靜靜的。}`), mood: -3 }) },
          { id: "c_nightQuarrel.stop", label: "走出去說「不要吵了」", hint: "說出你的害怕", act: "talk", style: "risk", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你走出房間，哭著說「不要吵了」。{兩個人都愣住了，媽媽把你抱回房間。|爸爸蹲下來說：「對不起，嚇到你了。」}{之後他們吵架都會先關上門。|隔天他們一起帶你去吃早餐。}`), mood: -1 }) },
          {
            id: "c_nightQuarrel.sib", label: sib ? `去找${sib}` : "去找兄弟姊妹", hint: "有人陪比較不怕", act: "seekHelp", style: "family", weight: 0.2, when: () => !!sib,
            apply: (s2, c) => ({ text: c.w(old.length ? `${lead}。你鑽進${sib}的被窩，${sib}{小聲講故事給你聽，|握著你的手說沒事，}{兩個人一起等到客廳安靜下來。|你們約好明天要去公園玩。}` : `${lead}。你跑去${sib}的床邊，怕${sib}被吵醒會哭，{小聲講故事給${sib}聽，|一直輕輕拍著${sib}的背，}{後來你們兩個都睡著了。|那晚你覺得自己長大了。}`), mood: -2 }),
          },
          { id: "c_nightQuarrel.card", label: "隔天畫一張卡片", hint: "畫一家人手牽手", act: "talk", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。隔天你畫了一張卡片，{畫著一家人手牽手去公園，|寫著「爸爸媽媽不要吵架」，}{偷偷放在餐桌上。|塞進他們的枕頭底下。}{那天晚上，他們一起來你房間說晚安。|媽媽看著卡片，笑著擦了眼淚。}`), mood: 1 }) },
          { id: "c_nightQuarrel.music", label: y < 1980 ? "打開收音機" : "戴上耳機", hint: "讓自己不要聽到", act: "rest", style: "self", weight: 0.12, apply: (s2, c) => ({ text: c.w(`${lead}。你${music}，{把聲音開大一點，再大一點，|一直聽到睡著，}{隔天大家都裝作沒事。|那晚的事你一直沒問。}`), mood: -2 }) },
          { id: "c_nightQuarrel.grandma", label: "隔天打電話給阿嬤", hint: "找大人說", act: "seekHelp", style: "social", weight: 0.08, when: () => y >= 1965, apply: (s2, c) => ({ text: c.w(`${lead}。隔天放學你偷偷打電話給阿嬤，{阿嬤週末就來家裡住了幾天，|阿嬤說大人有時候會吵架，但都很愛你，}{家裡的氣氛好多了。|你心裡的石頭放下了一半。}`), mood: 1 }) },
        ],
      };
    },
  },
  {
    // 爸媽分開以後，住在阿嬤家
    id: "c_grandmaHome", domain: "family", channel: "change", once: true, ages: [5, 12], when: s => s.flags.parentsSplit && !s.abroad, p: () => 0.3,
    apply: (s, ctx) => {
      const y = s.year, who = liveWith(s, ctx), gm = ctx.rng.pick(["阿嬤", "外婆"]), after = s.studying ? "每天放學" : "每天傍晚", bag = s.studying ? "書包" : "口袋";
      s.flags.grandmaHome = true;
      return { text: ctx.w([
        `爸媽分開以後，{週末|寒暑假}你都住在${gm}家。{${gm}每天早上五點就起床煮稀飯，|${gm}家的院子種了一棵芒果樹，}{你學會了用${y < 1962 ? "灶" : "大同電鍋"}蒸饅頭。|晚上和${gm}一起${y < 1965 ? "聽收音機裡的歌仔戲" : "看電視上的八點檔"}。}`,
        `爸媽分開以後，${who}工作很忙，你搬去${gm}家住了{一年|兩年}。{${after}，${gm}都在巷口等你，|${gm}總是把最大塊的肉夾到你碗裡，}{那是你最安心的一段日子。|你的${bag}裡永遠有一顆${gm}塞的橘子。}`,
        `爸媽分開後的那個暑假，你住在{鄉下|海邊}的${gm}家，{跟著${gm}餵雞、晒菜乾，|跟著${gm}去{田裡|港邊}，}{晒得黑黑的才回家。|回家那天，${gm}塞了一大袋龍眼給你。}`,
      ]), mood: 1 };
    },
  },
  {
    // 搬家轉學（緊接在 core.js 的 familyMove 之後）
    id: "c_newSchool", domain: "move", channel: "change", cooldown: 2, ages: [7, 12], when: s => s.last.familyMove === s.age && s.studying && !s.abroad, p: () => 0.85,
    choice: (s, ctx) => {
      const y = s.year, f = bestFriend(s);
      const write = y < 1990 ? "寫了一封信給" : y < 2005 ? "打電話給" : y < 2011 ? "在 MSN 上敲" : "傳 LINE 給";
      const lead = `搬到${s.county}，轉進新學校的第一個星期，下課都沒有人跟你說話`;
      return {
        prompt: `${lead}。要怎麼辦？`,
        options: [
          { id: "c_newSchool.reach", label: "主動借同學東西", hint: "先開口", act: "socialize", style: "social", weight: 0.3, apply: (s2, c) => { const n = makeFriend(s2, c, "國小同學", 0.8); return { text: c.w(`${lead}。你主動{借隔壁的${n.call}一支筆，|問前面的${n.call}下一堂是什麼課，}{下課${n.call}就拉著你去打躲避球。|沒多久，你們就變成好朋友。}`), mood: 3 }; } },
          { id: "c_newSchool.wait", label: "等別人來找你", hint: "慢慢來", act: "wait", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w(`${lead}。你每天安靜地坐在位子上{看書|畫畫}，{過了一個多月，才有同學來問你在做什麼。|直到分組做報告，才慢慢跟同學熟起來。}`), mood: -1 }) },
          { id: "c_newSchool.team", label: "參加校隊", hint: "用運動交朋友", act: "exercise", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你參加了{躲避球隊|田徑隊|籃球隊}，{每天放學一起練球，|比賽那天全隊抱在一起，}{很快就跟隊友混熟了。|你終於覺得自己屬於這裡。}`), mood: 3 }) },
          { id: "c_newSchool.old", label: f ? `聯絡${f.call}` : "聯絡以前的同學", hint: "想念舊學校", act: "talk", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。你${write}${f ? f.call : "以前的同學"}，{說新學校${y >= 1985 ? "的營養午餐不好吃" : "離家好遠"}，|說你好想大家，}{${f ? f.call : "對方"}說放假要來找你玩。|聊完心裡舒服多了。}`), mood: 1 }) },
          { id: "c_newSchool.joke", label: "自我介紹時講個笑話", hint: "一次讓大家記住你", act: "socialize", style: "risk", weight: 0.15, apply: (s2, c) => ({ text: c.w(`${lead}。班會時你上台講了一個笑話，{全班笑翻了，從此大家都叫你「開心果」。|結果沒人笑，你自己先笑了出來，反而大家都笑了。}`), mood: 3 }) },
        ],
      };
    },
  },
];
