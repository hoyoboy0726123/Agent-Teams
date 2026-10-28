// 童年（0–12 歲）：學走路、阿公阿嬤、第一個好朋友、寵物、才藝班、校外教學、運動會、過年紅包、卡通和玩具，
// 還有國小的日常：當幹部、被老師誤會、弄壞同學的東西、撿到錢、考卷要家長簽名、兄弟姊妹誰背黑鍋、同學都有的玩具、挑食……
//
// 機率都是假設：這些小事沒有官方統計，每個事件一年的機率大多在 0.03–0.2，再用 once / max / cooldown 限制次數，
// 讓一個童年平均有七八件故事、其中三四件要做選擇，不會把人生塞滿。
// 同一個抉擇每一生看起來不一樣：問題出現時先依年代、年級、家人和家裡的錢挑一個情境（pickScene），題目、按鈕和結果
// 都從那個情境來；選項的 id、act、style、weight 和效果不跟著變。
// 這裡不碰學歷、工作、婚姻、生育、房子和健康風險；那些在 core.js，依台灣統計校準。
//
// The probabilities are assumptions (no statistics exist for these events), set so a childhood holds seven or eight
// of them, three or four of them choices. A choice picks one situation for this life (pickScene) and builds its
// question, buttons and results from it. Nothing here touches schooling, work, marriage, births, homes or health risk.
//
// The English edition (README「英文版（翻譯層）」, src/i18n/en/child.json) looks each template up as written here, so
// the sentences are {var} templates rather than template literals: a piece with its own {a|b} is written into the
// template ({{at0}|{at1}} when it was "書桌底下的{臉盆|玻璃罐}裡"), and a sentence whose shape changes with the year
// is written out once for each shape. The Chinese and its draws are what they were.
//
// Left for later modules:
//   s.flags.bff          id of the best friend in s.friends (memory kind "bestFriend" has the name)
//   s.flags.pet          { kind, name, noun, since }          s.flags.talent       piano, art, abacus, code, …, none
//   s.flags.familyShop   the family's shop (柑仔店, 早餐店…)    s.flags.grandRaised  raised by grandparents as a baby
//   s.flags.liveWith     "father" | "mother": who you live with after the parents split
//   s.flags.homeMoney    "tight" | "ok": money at home while you grow up (homeMoney)
//   s.flags.cadre        the class job you were chosen for (班長, 數學小老師, 路隊長…; memory kind "c_cadre")
import { bornSiblings } from "../world.js";
import { siblingCall } from "../words.js";
import { fill } from "../grammar.js";

// ---------- helpers, shared with teen.js ----------
// The best friend, while still in the story.
export const bestFriend = s => s.friends.find(f => f.id === s.flags.bff && f.alive !== false) || null;
export const friendName = (s, fallback) => { const f = bestFriend(s); return f ? f.call : fallback; };

// Someone new to be friends with (most childhood friends are the same sex); the best friend when there is none.
// 「志明是個安靜的男生」, one sentence for each nature a friend can have (people.js FRIEND_NATURES), so the English
// can say each its own way.
const FRIEND_INTRO = {
  愛熱鬧: "{fname}是個愛熱鬧的{boy}", 講義氣: "{fname}是個講義氣的{boy}", 安靜: "{fname}是個安靜的{boy}", 愛搞笑: "{fname}是個愛搞笑的{boy}",
  很會讀書: "{fname}是個很會讀書的{boy}", 運動神經好: "{fname}是個運動神經好的{boy}", 什麼都敢試: "{fname}是個什麼都敢試的{boy}", 很念舊: "{fname}是個很念舊的{boy}",
};

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
// pad() in Chinese only: an English sentence has its own spaces.
const padIn = (ctx, w, f = x => x) => (ctx.lang === "en" ? w : f(pad(w)));
// How a child phones home: the corner shop's phone, a public phone (one coin), a mobile, a kids' watch.
const callHome = y => (y < 1975 ? "跑去雜貨店借電話打回家" : y < 2008 ? "投了一塊錢打公共電話回家" : y < 2015 ? "用手機打回家" : "用兒童手錶打回家");

// ctx.w for an event that can come more than once with other {vars}: as when these were template literals, a template
// counts as told only with the same values, so the draws are what they were (s.used, life.js words).
function wAgain(ctx, list, vars) {
  const used = ctx.s.used, filled = list.map(t => fill(t, vars));
  list.forEach((t, k) => (used.has(filled[k]) ? used.add(t) : used.delete(t)));
  const text = ctx.w(list, vars);
  list.forEach((t, k) => { if (used.has(t)) used.add(filled[k]); });
  return text;
}

// One situation for a question, from those that fit this life: a falsy entry does not fit, `w` weighs an entry
// (default 1). Like core.js's scene(), with weights.
export const pickScene = (ctx, list) => ctx.rng.weighted(list.filter(Boolean).map(x => [x, x.w ?? 1]));

// Money at home while you grow up, drawn once a life: "tight" or "ok". An assumption (there is no statistic per
// family here): tight more often in the poorer decades, in big families and after the parents split.
export function homeMoney(s, ctx) {
  if (!s.flags.homeMoney) {
    const y = s.birthYear, p = (y < 1960 ? 0.5 : y < 1975 ? 0.35 : y < 1990 ? 0.22 : 0.18) + (s.siblings.list.length >= 3 ? 0.1 : 0) + (s.flags.parentsSplit ? 0.1 : 0);
    s.flags.homeMoney = ctx.rng() < p ? "tight" : "ok";
  }
  return s.flags.homeMoney;
}

// A pet that turns up, by year, and the way it turns up (黃金鼠 from the 1990s; 蠶寶寶 in primary schools from the
// 1970s; 十姊妹 in many homes until the 1990s; 巴西龜 and 孔雀魚 from the late 1970s). Each way has its own ending
// when the pet is not kept (`away`); `duty` is what you promise to do, `hide` where you would hide it. A child not at
// school yet has no classmates: the ways through school are left out, and a classmate's litter is a neighbour's
// (NEIGHBOURS). `hideAt` is a place, or two that were "{a|b}" in one sentence; `vars` are the words of the ways.
const NEIGHBOURS = {
  "{同學|鄰居}家的狗生了一窩小狗，問你要不要抱一隻回家": "鄰居家的狗生了一窩小狗，問你要不要抱一隻回家",
  "{鄰居|同學}家的貓生了一窩小貓，問你要不要抱一隻回家": "鄰居家的貓生了一窩小貓，問你要不要抱一隻回家",
};
function petFound(s, ctx) {
  const y = s.year, rel = ctx.rng.pick(["表姊", "堂哥", "表哥"]);
  const list = [
    [{ kind: "dog", noun: "小狗", names: ["小黑", "小白", "阿福", "旺財", "來福", "豆豆"], tip: "要打哪些預防針", vet: true, duty: "每天自己遛牠", hide: "養在頂樓", hideAt: ["頂樓水塔旁的紙箱裡", "頂樓曬衣架下的紙箱裡"],
      ways: [["{傍晚|下雨天}，一隻淋濕的小土狗一路跟著你回家", "被巷口機車行的老闆收養了"], ["{同學|鄰居}家的狗生了一窩小狗，問你要不要抱一隻回家", "被另一戶人家抱走了"], ["阿公從鄉下抱回一隻剛斷奶的小土狗，說要看家裡同不同意", "被阿公帶回了鄉下"]] }, 3],
    [{ kind: "cat", noun: "小貓", names: ["咪咪", "小花", "阿橘", "球球", "喵喵"], tip: y >= 1990 ? "貓砂要怎麼換" : "要餵牠吃什麼", vet: true, duty: "每天自己餵牠", hide: "藏在房間", hideAt: ["床底下的紙箱裡", "衣櫃最下層"],
      ways: [["{鄰居|同學}家的貓生了一窩小貓，問你要不要抱一隻回家", "被一位愛貓的阿姨抱走了"], ["一隻瘦巴巴的小貓天天蹲在你家門口，你偷偷餵了牠好幾天", "被巷口麵攤的老闆收養，每天都在攤子旁邊睡午覺"]] }, 2],
    [{ kind: "fish", noun: "金魚", names: ["小紅", "小金", "泡泡"], tip: "水要先放一天再換", duty: "自己換水", hide: "藏在書桌底下", hideAt: ["書桌底下的臉盆裡", "書桌底下的玻璃罐裡"],
      ways: [["在{fair}撈金魚，撈了好幾次，終於撈到一隻", y >= 1995 ? "被放進了學校的生態池" : "被放進了廟口的放生池"], ...(y >= 1975 ? [["舅舅家的孔雀魚生了一大群小魚，裝了一小袋要送你", "被送回了舅舅家的魚缸", "孔雀魚"]] : [])] }, 1.5],
    [{ kind: "beetle", noun: "獨角仙", names: ["大力", "阿角", "黑金剛"], tip: y >= 1995 ? "要準備多少腐植土" : "要餵牠吃什麼", duty: y >= 1995 ? "自己換木屑和果凍" : "自己找香蕉皮餵牠", hide: "藏在床底下", hideAt: "床底下的鞋盒裡",
      ways: [["{阿公|叔叔}從山上帶回一隻獨角仙", "被你放回了山上的樹林"], ["暑假去阿公家，你在路燈下撿到一隻獨角仙", "被你放回了阿公家後面的樹林"]] }, 1],
  ];
  if (y >= 1970) list.push([{ kind: "silkworm", noun: "蠶寶寶", names: null, tip: "桑葉要擦乾才能餵", duty: "自己去採桑葉", hide: "養在鞋盒裡", hideAt: "書桌下的鞋盒裡",
    ways: [["同學分給你一隻蠶寶寶", "被送給了學校的自然老師"], ["自然課要觀察蠶寶寶，老師說可以帶幾隻回家養", "被你帶回學校，放回了班上的飼養箱"]] }, 1.5]);
  if (y >= 1995) list.push([{ kind: "hamster", noun: "黃金鼠", names: ["布丁", "球球", "豆豆"], tip: "籠子要多久清一次", duty: "自己清籠子", hide: "藏在衣櫃裡", hideAt: "衣櫃最下層的紙箱裡",
    ways: [["{表哥|阿姨}送你一隻黃金鼠", "被送回了原本的主人家"], ["同學家的黃金鼠生了一窩，問你要不要一隻", "被另一個同學領養了"]] }, 1.5]);
  if (y >= 1975) list.push([{ kind: "rabbit", noun: "小兔子", names: ["小白", "棉花", "跳跳"], tip: "兔子不能吃太濕的菜葉", vet: true, duty: "自己去拔草餵牠", hide: "養在陽台", hideAt: "陽台角落的紙箱裡",
    ways: [["學校養的兔子生了一窩小兔子，老師問誰要帶一隻回家", "被送回了學校的兔子籠"], ["{鄰居|親戚}家的兔子生了小兔子，要送你一隻", "被另一戶人家領養了"]] }, 1]);
  if (y >= 1980) list.push([{ kind: "turtle", noun: "小烏龜", names: ["阿龜", "小綠", "慢慢"], tip: "水要多久換一次", duty: "自己換水", hide: "藏在浴室", hideAt: "浴室的水桶裡",
    ways: [["{rel}要搬家，把養了一年的小烏龜託給你", ctx.f("被送回了{rel}的新家", { rel })]] }, 1]);
  if (y < 1995) list.push([{ kind: "bird", noun: "十姊妹", names: ["小黃", "啾啾", "嘟嘟"], tip: "飼料和水要每天換", duty: "每天換水、添小米", hide: "掛在頂樓", hideAt: "頂樓曬衣架旁的鳥籠裡",
    ways: [["隔壁阿伯養的十姊妹孵了一窩小鳥，說要送你一隻", "被留在隔壁阿伯家，你常常過去看牠"]] }, 1]);
  const fits = list.map(([p, w]) => [{ ...p, ways: s.studying ? p.ways : p.ways.map(([how, ...rest]) => [NEIGHBOURS[how] ?? how, ...rest]).filter(([how]) => !/同學|自然課|學校/.test(how)) }, w]);
  const pet = ctx.rng.weighted(fits.filter(([p]) => p.ways.length)), [how, away, noun] = ctx.rng.pick(pet.ways);
  return { ...pet, how, away, noun: noun || pet.noun, vars: { fair: y < 1970 ? "廟會" : "夜市", rel } };
}

// Something a child borrows and breaks, by year: [what, what happened to it, how you would mend it].
function brokenToy(y, ctx) {
  const glue = y < 1975 ? "漿糊" : "三秒膠", card = ["最稀有的那張卡被你折到一角", "用厚厚的字典壓了一整個晚上"];
  const [what, broke, mend] = ctx.rng.pick(y < 1975 ? [["陀螺", "陀螺撞到石頭，裂了一道縫"], ["竹蜻蜓", "竹蜻蜓的翅膀斷了一邊"], ["鐵皮青蛙", "鐵皮青蛙的發條再也轉不動"]]
    : y < 1990 ? [["遙控車", "遙控車撞到牆，掉了一個輪子"], ["電子錶", "電子錶的錶帶斷了"], ["多功能鉛筆盒", "鉛筆盒的按鈕卡住，再也打不開"]]
    : y < 2000 ? [["掌上型電動", "掌上型電動掉在地上，螢幕裂了一條線"], y >= 1995 ? ["四驅車", "四驅車的馬達燒壞了"] : ["大富翁", "大富翁的卡片被你弄丟了好幾張", "自己畫了幾張一模一樣的卡片補上"], y >= 1997 ? ["電子雞", "電子雞的螢幕不亮了"] : ["遙控車", "遙控車撞到牆，掉了一個輪子"]]
    : y < 2010 ? [["神奇寶貝卡", ...card], y >= 2002 ? ["戰鬥陀螺", "戰鬥陀螺的外圈裂開了"] : ["四驅車", "四驅車的馬達燒壞了"], ["掌上型電動", "掌上型電動掉在地上，螢幕裂了一條線"]]
    : y < 2020 ? [["樂高", "蓋好的城堡被你摔散，還少了好幾塊", "照著說明書一塊一塊拼回去"], y >= 2015 ? ["妖怪手錶", "妖怪手錶的錶帶斷了"] : ["戰鬥陀螺", "戰鬥陀螺的外圈裂開了"], ["遊戲王卡", ...card]]
    : [["樂高", "蓋好的城堡被你摔散，還少了好幾塊", "照著說明書一塊一塊拼回去"], ["Switch 的手把", "手把掉在地上，按鍵卡住了"], [y >= 2021 ? "寶可夢卡" : "遊戲王卡", ...card]]);
  return [what, broke, mend || (glue === "漿糊" ? "用漿糊和膠帶修了一整個晚上" : "用三秒膠和膠帶修了一整個晚上")];
}

// What everyone at school had and you wanted, by year: [it, its price, too dear to save up for, what you could make
// instead]. Prices are rough amounts of the time.
function wantedToy(s, ctx) {
  const y = s.year;
  return ctx.rng.pick(y < 1965 ? [["一顆新的木頭陀螺", "一塊錢", false, "找了一塊木頭，削了一顆陀螺"], ["一大把尪仔標", "五毛錢", false, "用厚紙板畫了一疊尪仔標"]]
    : y < 1980 ? [s.sex === "female" ? ["一套紙娃娃", "五塊錢", false, "在厚紙板上畫了一套紙娃娃"] : ["一整套尪仔標", "十塊錢", false, "用厚紙板畫了一疊尪仔標"], ["一台鐵皮玩具車", "三十塊", true, "用火柴盒做了一台小車"]]
    : y < 1990 ? [["一台遙控車", "五百多塊", true, "用鞋盒做了一台小車"], ["一個多功能鉛筆盒", "兩百多塊", false, "在舊鉛筆盒上貼滿了自己畫的貼紙"], y >= 1986 ? ["一台紅白機", "兩千多塊", true, "用紙箱做了一台假的紅白機"] : ["一支電子錶", "一百多塊", false, "在手腕上畫了一支手錶"]]
    : y < 2000 ? [["一台掌上型電動", "一千多塊", true, "用紙箱做了一台假的電動"], y >= 1995 ? ["一台四驅車", "兩三百塊", false, "用紙盒和瓶蓋做了一台四驅車"] : ["一盒大富翁", "三百多塊", false, "在紙上畫了一整盤大富翁"], ...(y >= 1997 ? [["一隻電子雞", "三百多塊", false, "在紙上畫了一隻電子雞，每天假裝餵牠"]] : [])]
    : y < 2010 ? [["一整盒神奇寶貝卡", "一百多塊", false, "在紙上畫了一整疊神奇寶貝卡"], y >= 2002 ? ["一顆戰鬥陀螺", "三百多塊", false, "用瓶蓋和牙籤做了一顆陀螺"] : ["一台四驅車", "兩三百塊", false, "用紙盒和瓶蓋做了一台四驅車"], ["一台掌上型電動", "三千多塊", true, "用紙箱做了一台假的遊戲機"]]
    : y < 2020 ? [["一盒樂高", "一千多塊", true, "用紙箱蓋了一座城堡"], y >= 2015 ? ["一個妖怪手錶", "一千多塊", true, "用紙做了一個妖怪手錶戴在手上"] : ["一顆戰鬥陀螺", "三百多塊", false, "用瓶蓋和牙籤做了一顆陀螺"], ...(y >= 2017 ? [["一台 Switch", "一萬多塊", true, "用紙箱做了一台假的 Switch"]] : [])]
    : y < 2026 ? [["一台 Switch", "一萬多塊", true, "用紙箱做了一台假的 Switch"], ["一盒樂高", "兩千多塊", true, "用紙箱蓋了一座城堡"], ...(y >= 2021 ? [["一整盒寶可夢卡", "幾百塊", false, "在紙上畫了一整疊寶可夢卡"]] : [])]
    : [["一台新出的遊戲機", "一萬多塊", true, "用紙箱做了一台假的遊戲機"], ["一個會說話的機器人玩具", "兩三千塊", true, "用紙箱做了一個機器人"]]);
}

export const CHILD = [
  {
    // 第一句話、學走路
    id: "c_firstWord", once: true, ages: [1, 2], p: () => 0.35,
    apply: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx);
      const word = ctx.rng.pick(["媽媽", "爸爸", "阿嬤", "ㄋㄟㄋㄟ", "抱抱", "車車"].filter(w => (w !== "媽媽" || s.mother.alive) && (w !== "爸爸" || s.father.alive)));
      const tell = y < 1975 ? "到處跟鄰居說" : "打電話跟親戚說";
      return { text: wAgain(ctx, [
        word === "ㄋㄟㄋㄟ" ? "你說出的第一句話是「ㄋㄟㄋㄟ」，{{who}樂得{tell}。|全家人輪流逗你，想讓你再說一次。|{who}說這一刻等了好久。}"
          : "你說出的第一句話是「{word}」，{{who}樂得{tell}。|全家人輪流逗你，想讓你再說一次。|{who}說這一刻等了好久。}",
        y < 1965 ? "你在三合院的稻埕上扶著{藤椅|茶几|{who}的手}，搖搖晃晃走了三步，{一屁股坐在地上，自己笑了起來。|全家人一起拍手。}"
          : y < 1990 ? "你在{磨石子地|榻榻米}上扶著{藤椅|茶几|{who}的手}，搖搖晃晃走了三步，{一屁股坐在地上，自己笑了起來。|全家人一起拍手。}"
            : "你在客廳的{巧拼|木頭地板}上扶著{藤椅|茶几|{who}的手}，搖搖晃晃走了三步，{一屁股坐在地上，自己笑了起來。|全家人一起拍手。}",
        "{walker}學走路的那陣子，{你一放手就往門口衝，|你追著滾來滾去的皮球跑，}{who}只好{把茶几的四個角都包起來。|在樓梯口擋了一塊木板。}",
      ], { who, word, tell, walker: y >= 1970 && y < 2010 ? "坐在學步車裡" : "扶著牆" }), mood: 3 };
    },
  },
  {
    // 爸媽要上班，交給阿公阿嬤帶
    id: "c_grandRaised", domain: "family", channel: "good", once: true, ages: [2, 4], when: s => s.father.alive || s.mother.alive, p: () => 0.08,
    apply: (s, ctx) => {
      s.flags.grandRaised = true;
      const y = s.year, parents = liveWith(s, ctx);
      // why you went: one reason, or two or three that were {a|b} in the sentence ({{b0}|{b1}})
      const busy = (y < 1966 ? ["{parents}到城裡的工廠上班", "{parents}在外地工作"] : y < 1975 ? ["{parents}到城裡的工廠上班", "{parents}去加工區做工", "{parents}在外地工作"]
        : y < 2000 ? ["{parents}白天都要上班"] : ["{parents}都要上班", "{parents}每天加班到很晚"]).map(t => ctx.f(t, { parents }));
      const tv = y < 1965 ? "收音機永遠在播歌仔戲" : y < 2000 ? "電視永遠在播歌仔戲" : "電視永遠在播台語八點檔";
      const v = { b0: busy[0], b1: busy[1], b2: busy[2], parents, tv, ride: y < 1965 ? "腳踏車" : "機車" };
      return { text: wAgain(ctx, busy.length === 1 ? [
        "{b0}，你被送到{鄉下的|南部的|隔壁鎮的}阿嬤家。{每天跟著阿嬤去菜市場，|阿公每天騎著{ride}載你去買早餐，}{你學會的第一首歌是阿嬤唱的{台語|}童謠。|阿嬤總是把最大塊的肉夾到你碗裡。}",
        "{b0}，平常由阿公阿嬤帶你。{阿嬤背著你去{田裡|市場}，|阿公在門口的榕樹下教你認字，}{一直到要上學才回到{parents}身邊。|你最早的記憶都是阿嬤家的味道。}",
        "{b0}，週一到週五你住在阿嬤家，週末才被接回家。{每次要走，你都抱著阿嬤的腿哭。|阿嬤家的{tv}。}",
      ] : busy.length === 2 ? [
        "{{b0}|{b1}}，你被送到{鄉下的|南部的|隔壁鎮的}阿嬤家。{每天跟著阿嬤去菜市場，|阿公每天騎著{ride}載你去買早餐，}{你學會的第一首歌是阿嬤唱的{台語|}童謠。|阿嬤總是把最大塊的肉夾到你碗裡。}",
        "{{b0}|{b1}}，平常由阿公阿嬤帶你。{阿嬤背著你去{田裡|市場}，|阿公在門口的榕樹下教你認字，}{一直到要上學才回到{parents}身邊。|你最早的記憶都是阿嬤家的味道。}",
        "{{b0}|{b1}}，週一到週五你住在阿嬤家，週末才被接回家。{每次要走，你都抱著阿嬤的腿哭。|阿嬤家的{tv}。}",
      ] : [
        "{{b0}|{b1}|{b2}}，你被送到{鄉下的|南部的|隔壁鎮的}阿嬤家。{每天跟著阿嬤去菜市場，|阿公每天騎著{ride}載你去買早餐，}{你學會的第一首歌是阿嬤唱的{台語|}童謠。|阿嬤總是把最大塊的肉夾到你碗裡。}",
        "{{b0}|{b1}|{b2}}，平常由阿公阿嬤帶你。{阿嬤背著你去{田裡|市場}，|阿公在門口的榕樹下教你認字，}{一直到要上學才回到{parents}身邊。|你最早的記憶都是阿嬤家的味道。}",
        "{{b0}|{b1}|{b2}}，週一到週五你住在阿嬤家，週末才被接回家。{每次要走，你都抱著阿嬤的腿哭。|阿嬤家的{tv}。}",
      ], v), mood: 2 };
    },
  },
  {
    // 第一個好朋友：之後的事件會叫他的名字（s.flags.bff）
    id: "c_bestFriend", once: true, ages: [4, 9], when: s => !s.flags.bff && !s.abroad, p: () => 0.22,
    apply: (s, ctx) => {
      const y = s.year, school = s.studying ? "國小" : y < 2012 ? "幼稚園" : "幼兒園";
      const near = !s.studying && !s.done.has("kindergarten") ? true : ctx.rng() < 0.25;
      const f = makeFriend(s, ctx, near ? "鄰居" : school + "同學", 0.85);
      const boy = f.sex === "male" ? "男生" : "女生", toy = ctx.rng.pick(kidsCulture(y).toys);
      // what you played: three things, which were {a|b|c} in the sentence ({{p0}|{p1}|{p2}})
      const [p0, p1, p2] = y < 1965 ? ["去大水溝抓大肚魚", "爬上龍眼樹摘龍眼", "在稻埕上玩尪仔標"] : y < 1985 ? ["在柑仔店門口玩尪仔標", "放學後在巷子裡玩紅綠燈", "一起去河邊抓蝌蚪"] : y < 2000 ? ["交換貼紙", "一起跳橡皮筋", "下課搶著去盪鞦韆"] : y < 2015 ? ["交換卡片", "下課搶著去盪鞦韆", "一起在公園溜滑梯"] : ["一起在公園溜滑梯", "下課在走廊玩鬼抓人", "交換貼紙"];
      const v = { how: f.how, fname: f.call, intro: ctx.f(FRIEND_INTRO[f.nature] || "{fname}是個{nature}的{boy}", { fname: f.call, nature: f.nature, boy }), p0, p1, p2, toy: padIn(ctx, toy), school };
      const firstDay = (s.studying ? s.last.primary : s.last.kindergarten) === s.age;
      const meet = near ? "住在{隔壁|同一條巷子}的{fname}，{第一次見面就把{toy}分你玩，|在巷口跟你比誰跑得快，}從此你們{天天玩在一起。|成了最好的朋友。}"
        : firstDay && s.studying ? "上國小的第一天，坐你旁邊的{fname}{借你一塊橡皮擦，|分你半塊餅乾，}從此你們{天天一起上學。|成了最好的朋友。}"
          : firstDay ? "上{school}的第一天，坐你旁邊的{fname}{借你一塊橡皮擦，|分你半塊餅乾，}從此你們{天天一起玩。|成了最好的朋友。}"
            : s.studying ? "{換座位|分組做報告}那天，坐你旁邊的{fname}{借你一塊橡皮擦，|分你半塊餅乾，}從此你們{天天一起上學。|成了最好的朋友。}"
              : "{分組|戶外教學}那天，坐你旁邊的{fname}{借你一塊橡皮擦，|分你半塊餅乾，}從此你們{天天一起玩。|成了最好的朋友。}";
      return { text: wAgain(ctx, [
        "{how}{intro}。你們{{p0}|{p1}|{p2}}，{好到連上廁所都要一起去。|每天都黏在一起。}",
        meet,
        "你和{fname}{打勾勾|蓋手印}約好，{長大要一起開一間{冰店|麵包店|漫畫店}。|以後要讀同一所學校。}{{intro}，|你們{{p0}|{p1}|{p2}}，}那是你第一個最好的朋友。",
      ], v), mood: 3 };
    },
  },
  {
    // 想養寵物：什麼寵物、怎麼來的就是情境（petFound），按鈕的字跟著變
    id: "c_pet", domain: "family", channel: "good", once: true, ages: [5, 12], when: s => !s.abroad, p: () => 0.05,
    choice: (s, ctx) => {
      const pet = petFound(s, ctx), who = grownUp(s, ctx), f = bestFriend(s);
      const name = pet.names ? ctx.rng.pick(pet.names) : pet.noun;
      const keep = s2 => { s2.flags.pet = { kind: pet.kind, name, noun: pet.noun, since: s2.age }; };
      const named = pet.names ? ctx.f("你給牠取名叫{name}。", { name }) : "";
      const lead = ctx.w(pet.how, pet.vars), school = s.studying;
      const hid = Array.isArray(pet.hideAt), v = { lead, who, named, duty: pet.duty, noun: pet.noun, tip: pet.tip, away: pet.away, fname: f && f.call, at: pet.hideAt, at0: pet.hideAt[0], at1: pet.hideAt[1] };
      return {
        prompt: ctx.f("{lead}。你好想養，要怎麼辦？", { lead }),
        options: [
          {
            id: "c_pet.promise", label: ctx.f("拜託{who}讓你養", { who }), hint: ctx.f("答應{duty}", { duty: pet.duty }), act: "care", style: "family", weight: 0.3,
            apply: (s2, c) => {
              if (!pet.vet || c.rng() < 0.8) {
                keep(s2);
                return { text: c.w(school ? "{lead}。你拜託{who}讓你養，答應{duty}，{{who}答應了。|{who}拗不過你，點頭了。}{named}{每天放學第一件事就是去看牠。|寫功課的時候牠就待在你旁邊。}"
                  : "{lead}。你拜託{who}讓你養，答應{duty}，{{who}答應了。|{who}拗不過你，點頭了。}{named}{每天一睡醒第一件事就是去看牠。|吃飯的時候牠就待在你旁邊。}", v), mood: 4 };
              }
              return { text: c.w("{lead}。你拜託{who}讓你養，但家裡實在不方便，{who}幫牠找了{住在鄉下的叔公|開雜貨店的阿姨}收養，{說放假可以去看牠。|你後來去看過好幾次。}", v), mood: -1 };
            },
          },
          {
            id: "c_pet.read", label: "先查好怎麼養", hint: s.year >= 2000 ? "上網查清楚" : "去圖書館借書", act: "study", style: "learn", weight: 0.15,
            apply: (s2, c) => {
              keep(s2);
              const young = s2.age <= 6, net = s2.year >= 2000;
              return { text: c.w(young && net ? "{lead}。你請{who}陪你上網查了怎麼養{noun}，{把要準備的東西一條一條畫在本子上，|連{tip}都弄清楚了，}{who}看你這麼認真，答應讓你養。{named}"
                : young ? "{lead}。你請{who}陪你去圖書館查了怎麼養{noun}，{把要準備的東西一條一條畫在本子上，|連{tip}都弄清楚了，}{who}看你這麼認真，答應讓你養。{named}"
                  : net ? "{lead}。你先上網查了怎麼養{noun}，{把要準備的東西一條一條抄在本子上，|連{tip}都弄清楚了，}{who}看你這麼認真，答應讓你養。{named}"
                    : "{lead}。你先去圖書館查了怎麼養{noun}，{把要準備的東西一條一條抄在本子上，|連{tip}都弄清楚了，}{who}看你這麼認真，答應讓你養。{named}", v), mood: 3 };
            },
          },
          {
            id: "c_pet.hide", label: ctx.f("先偷偷{hide}", { hide: pet.hide }), hint: "藏起來再說", act: "avoid", style: "risk", weight: 0.12,
            apply: (s2, c) => {
              const ok = c.rng() < 0.5;
              if (ok) keep(s2);
              const text = ok
                ? (hid ? "{lead}。你把{noun}藏在{{at0}|{at1}}，{三天後|不到一個星期}就被{who}發現了。{{who}嘆了一口氣，說：「好啦，養吧。」|{who}看你哭成那樣，只好讓你養。}"
                  : "{lead}。你把{noun}藏在{at}，{三天後|不到一個星期}就被{who}發現了。{{who}嘆了一口氣，說：「好啦，養吧。」|{who}看你哭成那樣，只好讓你養。}")
                : (hid ? "{lead}。你把{noun}藏在{{at0}|{at1}}，{三天後|不到一個星期}就被{who}發現了。{{who}把牠送給了想養的鄰居。|{who}說家裡真的不能養，幫牠找了新主人。}"
                  : "{lead}。你把{noun}藏在{at}，{三天後|不到一個星期}就被{who}發現了。{{who}把牠送給了想養的鄰居。|{who}說家裡真的不能養，幫牠找了新主人。}");
              return { text: c.w(text, v), mood: ok ? 3 : -2 };
            },
          },
          {
            id: "c_pet.friend", label: f ? ctx.f("問{fname}家要不要養", { fname: f.call }) : s.studying ? "問同學誰想養" : "問鄰居誰想養", hint: "讓牠有個好人家", act: "seekHelp", style: "social", weight: 0.13,
            apply: (s2, c) => ({ text: c.w(f ? "{lead}。你問{fname}家要不要養，{{fname}家剛好想養，|{fname}拜託了家人好幾天，終於答應了，}{你常常跑去看牠。|牠在新家過得很好。}"
              : s2.studying ? "{lead}。你問遍了全班，{有個同學家裡有院子，願意收養，|隔壁班的同學說家裡正想養，}{你常常跑去看牠。|牠在新家過得很好。}"
                : "{lead}。你拉著{who}一家一家去問，{巷口的阿姨說家裡正想養，|有一戶有院子的人家願意收養，}{你常常跑去看牠。|牠在新家過得很好。}", v), mood: 1 }),
          },
          {
            id: "c_pet.no", label: "聽家人的，不養", hint: pet.vet ? "家裡沒地方養" : "家裡不方便", act: "wait", style: "safe", weight: 0.18,
            apply: (s2, c) => ({ text: c.w(s2.studying ? "{lead}。{who}說家裡沒辦法養，你{難過了一個晚上，|在日記裡畫了一張牠的畫，}後來牠{away}。"
              : "{lead}。{who}說家裡沒辦法養，你{難過了一個晚上，|在圖畫紙上畫了一張牠的畫，}後來牠{away}。", v), mood: -2 }),
          },
          {
            id: "c_pet.vet", label: "先帶去給獸醫看", hint: "確定牠健康", act: "seeDoctor", style: "health", weight: 0.12, when: () => !!pet.vet,
            apply: (s2, c) => {
              keep(s2);
              return { text: c.w(s2.year < 1980 ? "{lead}。{who}陪你把牠帶去給鎮上的獸醫看，{打了預防針、除了跳蚤，|獸醫說牠很健康，}{who}就答應讓你養了。{named}"
                : "{lead}。{who}陪你把牠帶去{獸醫院|動物醫院}，{打了預防針、除了跳蚤，|獸醫說牠很健康，}{who}就答應讓你養了。{named}", v), mood: 4 };
            },
          },
        ],
      };
    },
  },
  {
    // 才藝班：怎麼開始的（傳單、巷口的珠算班、同學的表演、暑假、學校的課後社團、家裡錢不多）依年代和家境挑一個
    id: "c_talent", domain: "study", channel: "good", once: true, ages: [5, 10], when: s => !s.abroad, p: () => 0.09,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), calc = y < 1980 ? "珠算" : "心算";
      const mate = (bestFriend(s) || ctx.person({ role: "friend", sex: s.sex, birthYear: s.birthYear })).call;
      const play = y < 1985 ? "巷子裡" : "公園", screen = y >= 2012 ? "滑平板" : y >= 1990 ? "打電動" : "看電視";
      // pre: how the result starts, so it follows the question; none: the answer of a child who wants none of it
      // pre: how the result starts ("" when it starts with the lesson; two openings that were {a|b} in one, pre0/pre1)
      const sc = pickScene(ctx, [
        y >= 1970 && { make: () => ({ prompt: ctx.w("{who}在{菜市場|巷口}拿到一張才藝班的傳單，回家問你想不想去學。想學什麼？", { who }), pre: "你拿著傳單去報了名，", none: "你說什麼都不想學，{週末都在{play}玩到天黑。|{who}嘆了一口氣，把傳單收進抽屜。}" }) },
        y < 1980 && { w: 1.2, make: () => ({ prompt: ctx.f("巷口開了一間{calc}班，{who}問你想不想去學點東西。要學什麼？", { calc, who }), pre: "", none: "你說什麼都不想學，{放學後都在巷子裡玩到天黑。|{who}說不學也好，省下一筆學費。}" }) },
        s.studying && { make: () => ({ prompt: ctx.f("{mate}在同樂會上表演了一段才藝，全班拍手拍得好大聲，{who}問你要不要也去學一樣。想學什麼？", { mate, who }), pre: ctx.f("看了{mate}的表演，你也", { mate }), none: "你說看別人表演就好，自己什麼都不想學，{放學後照樣在{play}玩到天黑。|下一次同樂會，你負責拍手拍得最大聲。}" }) },
        y >= 1985 && { make: () => ({ prompt: ctx.f("暑假到了，{who}不想讓你整天在家{screen}，說要幫你報才藝班。想學什麼？", { who, screen }), pre: "那個暑假，你", none: "你說暑假就是要玩，{每天在{play}玩到天黑。|{who}拗不過你，只好讓你在家{screen}。}" }) },
        y >= 2000 && s.studying && { make: () => ({
          club: true, prompt: "學校發了課後社團的報名表，放學後留在學校上課，只能挑一樣。想學什麼？", pre: "你報了學校的課後社團，", none: "你一樣都沒勾，{放學就直接回家{screen}。|{who}看著空白的報名表，嘆了一口氣。}",
          hints: { piano: "在音樂教室上課", art: "美術社", abacus: "心算社", code: "在電腦教室上課", kick: "在活動中心練", swim: "學校的游泳池", none: "放學直接回家" },
        }) },
        homeMoney(s, ctx) === "tight" && { w: 2, make: () => ({
          prompt: ctx.f("家裡的錢不多，{who}還是想讓你學一樣才藝，說學費會想辦法。想學什麼？", { who }), pre: null, pre0: ctx.f("{who}省下了買新衣服的錢，讓你", { who }), pre1: ctx.f("{who}省下了自己吃早餐的錢，讓你", { who }), none: "你說不想學，想把學費省下來，{{who}摸摸你的頭，沒有再說什麼。|那筆錢後來買了你的新書包。}",
          hints: { piano: "學費最貴", art: "一盒水彩就能開始", abacus: "學費便宜又實用", code: "要用到電腦", callig: "一支毛筆就夠", kick: "要買一套道服", swim: "要買泳衣和泳帽", none: "幫家裡省錢" },
        }) },
      ]).make();
      const hint = (key, fallback) => (sc.hints && sc.hints[key]) || fallback;
      const [ab0, ab1] = y < 1980 ? ["算盤打得劈啪響，", "每天背著一把算盤去上課，"] : ["手指在桌上撥著看不見的算盤，", "考試時手指在桌子底下偷偷撥算盤，"];
      const v = { who, play, screen, calc, pre: sc.pre, pre0: sc.pre0, pre1: sc.pre1, ab0, ab1 };
      // each lesson: [no opening, an opening, one of two openings]
      const learn = (key, texts, mood = 3) => (s2, c) => { s2.flags.talent = key; return { text: c.w(typeof texts === "string" ? texts : sc.pre === "" ? texts[0] : sc.pre === null ? texts[2] : texts[1], v), mood }; };
      const piano = sc.club ? ["", "{pre}開始學鋼琴，每個星期{二|三}放學後在音樂教室上課，{〈小蜜蜂〉彈到全家都會唱。|拜爾練到一半，手指頭痠得要命。|第一次上台發表，彈完才發現自己一直在抖。}", ""]
        : ["開始學鋼琴，每個星期六去老師家上課，{〈小蜜蜂〉彈到全家都會唱。|拜爾練到一半，手指頭痠得要命。|第一次上台發表，彈完才發現自己一直在抖。}",
          "{pre}開始學鋼琴，每個星期六去老師家上課，{〈小蜜蜂〉彈到全家都會唱。|拜爾練到一半，手指頭痠得要命。|第一次上台發表，彈完才發現自己一直在抖。}",
          "{{pre0}|{pre1}}開始學鋼琴，每個星期六去老師家上課，{〈小蜜蜂〉彈到全家都會唱。|拜爾練到一半，手指頭痠得要命。|第一次上台發表，彈完才發現自己一直在抖。}"];
      return {
        prompt: sc.prompt,
        options: [
          { id: "c_talent.piano", label: "鋼琴", hint: hint("piano", "每週去老師家上課"), act: "hobby", style: "learn", weight: 0.2, when: () => y >= 1970, apply: learn("piano", piano) },
          { id: "c_talent.art", label: "畫畫", hint: hint("art", "蠟筆、水彩、素描"), act: "hobby", style: "learn", weight: 0.2, apply: learn("art", [
            "去學畫畫，{蠟筆換成了水彩，|每週都畫滿一整本圖畫紙，}{你畫的{家裡的貓|阿嬤的菜園|校門口的大榕樹}被貼在教室後面。|寫生比賽還拿了佳作。}",
            "{pre}去學畫畫，{蠟筆換成了水彩，|每週都畫滿一整本圖畫紙，}{你畫的{家裡的貓|阿嬤的菜園|校門口的大榕樹}被貼在教室後面。|寫生比賽還拿了佳作。}",
            "{{pre0}|{pre1}}去學畫畫，{蠟筆換成了水彩，|每週都畫滿一整本圖畫紙，}{你畫的{家裡的貓|阿嬤的菜園|校門口的大榕樹}被貼在教室後面。|寫生比賽還拿了佳作。}"]) },
          { id: "c_talent.abacus", label: calc, hint: hint("abacus", y < 1980 ? "學打算盤" : "手指上的算盤"), act: "study", style: "safe", weight: 0.18, when: () => y < 2015, apply: learn("abacus", [
            "去學{calc}，{{ab0}|{ab1}}{算錢算得比大人還快。|後來檢定考過了{三|四}級。}",
            "{pre}去學{calc}，{{ab0}|{ab1}}{算錢算得比大人還快。|後來檢定考過了{三|四}級。}",
            "{{pre0}|{pre1}}去學{calc}，{{ab0}|{ab1}}{算錢算得比大人還快。|後來檢定考過了{三|四}級。}"]) },
          { id: "c_talent.code", label: "程式積木", hint: hint("code", "讓機器人動起來"), act: "study", style: "learn", weight: 0.12, when: () => y >= 2015, apply: learn("code", [
            "去上程式積木課，{用積木讓小車子轉彎，|做了一個會跑的小遊戲，}{得意地表演給全家看。|回家一直問電腦為什麼聽得懂。}",
            "{pre}去上程式積木課，{用積木讓小車子轉彎，|做了一個會跑的小遊戲，}{得意地表演給全家看。|回家一直問電腦為什麼聽得懂。}",
            "{{pre0}|{pre1}}去上程式積木課，{用積木讓小車子轉彎，|做了一個會跑的小遊戲，}{得意地表演給全家看。|回家一直問電腦為什麼聽得懂。}"]) },
          { id: "c_talent.callig", label: "書法", hint: hint("callig", "磨墨、寫大字"), act: "hobby", style: "safe", weight: 0.15, when: () => y < 1985, apply: learn("calligraphy", [
            "去學書法，{每天磨墨寫大字，|手上永遠沾著墨，}{過年時寫了一張春聯貼在門口。|老師說你的字很端正。}",
            "{pre}去學書法，{每天磨墨寫大字，|手上永遠沾著墨，}{過年時寫了一張春聯貼在門口。|老師說你的字很端正。}",
            "{{pre0}|{pre1}}去學書法，{每天磨墨寫大字，|手上永遠沾著墨，}{過年時寫了一張春聯貼在門口。|老師說你的字很端正。}"]) },
          { id: "c_talent.kick", label: "跆拳道", hint: hint("kick", "從白帶開始練"), act: "exercise", style: "health", weight: 0.12, when: () => y >= 1985, apply: learn("taekwondo", [
            "去學跆拳道，{從白帶練到了綠帶，|每次喊「嘿！」都特別大聲，}{整個人變得很有精神。|踢破木板那天，你回家講了一整晚。}",
            "{pre}去學跆拳道，{從白帶練到了綠帶，|每次喊「嘿！」都特別大聲，}{整個人變得很有精神。|踢破木板那天，你回家講了一整晚。}",
            "{{pre0}|{pre1}}去學跆拳道，{從白帶練到了綠帶，|每次喊「嘿！」都特別大聲，}{整個人變得很有精神。|踢破木板那天，你回家講了一整晚。}"]) },
          { id: "c_talent.swim", label: "游泳", hint: hint("swim", "學會換氣"), act: "exercise", style: "health", weight: 0.12, when: () => y >= 1995, apply: learn("swim", [
            "去學游泳，{第一堂課抱著浮板不敢放手，|嗆了好幾口水，}{後來可以一口氣游二十五公尺。|學會換氣那天，你在水裡笑得好開心。}",
            "{pre}去學游泳，{第一堂課抱著浮板不敢放手，|嗆了好幾口水，}{後來可以一口氣游二十五公尺。|學會換氣那天，你在水裡笑得好開心。}",
            "{{pre0}|{pre1}}去學游泳，{第一堂課抱著浮板不敢放手，|嗆了好幾口水，}{後來可以一口氣游二十五公尺。|學會換氣那天，你在水裡笑得好開心。}"]) },
          { id: "c_talent.none", label: "不想學，想玩", hint: hint("none", "週末要拿來玩"), act: "rest", style: "self", weight: y < 1975 ? 0.4 : 0.2, apply: learn("none", sc.none, 1) },
        ],
      };
    },
  },
  {
    // 被同學欺負（不寫細節）
    id: "c_bullied", domain: "study", channel: "bad", max: 1, ages: [7, 12], when: s => s.studying && !s.abroad, p: () => 0.035,
    choice: (s, ctx) => {
      const what = ctx.rng.pick(["幫你取難聽的綽號", "把你的鉛筆盒藏起來", "下課不讓你一起玩", "在你的課本上亂畫", "學你講話的口音"]);
      const who = grownUp(s, ctx), f = bestFriend(s), lead = ctx.f("班上有幾個同學一直{what}", { what });
      const v = { lead, who, fname: f && f.call };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          {
            id: "c_bullied.teacher", label: "告訴老師", hint: "請大人處理", act: "seekHelp", style: "social", weight: 0.28,
            // Corporal punishment in schools was banned in 2006.
            apply: (s2, c) => ({ text: c.w(s2.year < 2006 ? "{lead}，你告訴了老師。老師把那幾個同學叫到{講台前打手心，|走廊罰站，}{後來他們就不敢了。|之後再也沒有人找你麻煩。}" : "{lead}，你告訴了老師。老師{找那幾個同學和家長來談，|在班會上讓大家討論這件事，}{他們跟你道了歉。|後來就沒有人再這樣了。}", v), mood: 1 }),
          },
          { id: "c_bullied.home", label: ctx.f("回家告訴{who}", { who }), hint: "說出來", act: "talk", style: "family", weight: 0.22, apply: (s2, c) => ({ text: c.w("{lead}，你回家告訴了{who}。{who}{隔天親自到學校找老師談，|抱著你說「這不是你的錯」，}{你終於睡了一個好覺。|那幾個同學後來收斂了。}", v), mood: 1 }) },
          { id: "c_bullied.endure", label: "忍耐", hint: "也許過一陣子就好", act: "pushThrough", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}，你決定忍耐，{每天下課都躲在圖書館看書。|假裝不在意，回家才偷偷哭。}{一直到重新分班，事情才結束。|過了一個學期，事情才慢慢過去。}", v), mood: -4 }) },
          { id: "c_bullied.friend", label: f ? ctx.f("找{fname}陪你", { fname: f.call }) : "找朋友陪你", hint: "不要一個人", act: "seekHelp", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(f ? "{lead}，你找{fname}{下課陪你一起，|一起走路回家，}{兩個人在一起，那幾個人就不敢亂來了。|有人陪著，你沒那麼怕了。}" : "{lead}，你找隔壁班的朋友{下課陪你一起，|一起走路回家，}{兩個人在一起，那幾個人就不敢亂來了。|有人陪著，你沒那麼怕了。}", v), mood: 1 }) },
          { id: "c_bullied.stand", label: "當面說「不要」", hint: "自己站出來", act: "insist", style: "risk", weight: 0.1, apply: (s2, c) => ({ text: c.w("{lead}，你{站起來大聲說：「不要再這樣了！」|走到他們面前，把話說清楚。}{全班都安靜了，|他們愣了一下，}{之後就沒有再找你麻煩。|雖然手在發抖，你很驕傲。}", v), mood: 2 }) },
          { id: "c_bullied.counsel", label: "去輔導室", hint: "找輔導老師聊", act: "counsel", style: "health", weight: 0.05, when: () => s.year >= 1985, apply: (s2, c) => ({ text: c.w("{lead}，你去了輔導室。輔導老師{聽你說了一整節課，|陪你一起想辦法，}{後來還找那幾個同學一起聊。|你知道有人站在你這邊。}", v), mood: 1 }) },
        ],
      };
    },
  },
  {
    // 遠足、校外教學
    id: "c_fieldTrip", max: 2, cooldown: 2, ages: [7, 12], when: s => s.studying && !s.abroad, p: () => 0.1,
    apply: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), f = friendName(s, "同學");
      if (y < 1975) {
        const snack = ctx.rng.pick(snackOf(y));
        return { text: wAgain(ctx, [
          "學校遠足，全班排著隊走了好遠的路去{後山|河邊|海邊}，{便當裡有一顆滷蛋。|回程腳都起水泡了。}{你一路上都在唱歌。|那天晚上你一沾枕頭就睡著了。}",
          "遠足的前一晚你興奮得睡不著，{一早就把水壺裝滿，|書包裡塞滿了{snack}，}{走到半路就喊累了。|和{f}一路比賽誰走得快。}",
          "遠足去{附近的大廟|山上的水庫}，{who}{幫你煮了兩顆茶葉蛋。|前一天晚上就把便當準備好。}{你和同學在樹下分著吃。|回家累到倒頭就睡。}",
        ], { snack, f, who }), mood: 3 };
      }
      const places = ["動物園", "故宮", "海邊的漁港"];
      if (y >= 1980) places.push("六福村");
      if (y >= 1985) places.push("小人國");
      if (y >= 1987) places.push("九族文化村");
      if (y >= 1990) places.push("科博館");
      if (y >= 1991) places.push("劍湖山");
      if (y >= 2000) places.push("海生館");
      if (y >= 2005) places.push("觀光工廠");
      const place = ctx.rng.pick(places), sing = y >= 1988 ? "遊覽車上大家輪流唱卡拉OK，" : "遊覽車上大家一起唱歌，";
      return { text: wAgain(ctx, [
        "校外教學去{place}，{{sing}|一上遊覽車就開始吃零食，}{你把零用錢全買了紀念品。|回程在車上睡得東倒西歪。}",
        "校外教學去{place}，{who}幫你準備的便當{有你最愛的炸排骨，|被同學羨慕了一整天，}{你回家後講了一整晚。|那天的照片你一直留著。}",
        "校外教學去{place}，{你和{f}跑在最前面，|老師一路上一直數人頭，}{差點跟丟了隊伍。|你回家把看到的東西全部講了一遍。}",
      ], { place, sing, who, f }), mood: 3 };
    },
  },
  {
    // 運動會：大隊接力、進場（大會操或創意進場）、趣味競賽、班際拔河、低年級的賽跑、親子接力，依年代、年級和家人挑一個。
    // Each scene gives every option [label, hint, text] (the relay: [label, hint, it went well, it did not]).
    id: "c_sportsDay", domain: "health", channel: "good", max: 1, ages: [7, 12], when: s => s.studying && !s.abroad, p: () => 0.08,
    choice: (s, ctx) => {
      const y = s.year, f = bestFriend(s), mate = f ? f.call : "隔壁班的同學", snack = ctx.rng.pick(snackOf(y)), stick = y >= 1985 ? "寶特瓶裝沙子" : "舊報紙捲";
      const who = grownUp(s, ctx), home = liveWith(s, ctx), bare = y < 1970;
      const sc = pickScene(ctx, [
        { make: () => ({
          prompt: "運動會快到了，老師在挑大隊接力的選手，還缺幾個人。你要怎麼做？",
          relay: ["自願跑大隊接力", "全校都在看", bare ? "運動會那天你自願跑大隊接力，打著赤腳{跑最後一棒，在彎道追過兩個人，|一路衝過終點線，}{全班衝進跑道把你圍住。|你們班拿了第一名。}" : "運動會那天你自願跑大隊接力，{跑最後一棒，在彎道追過兩個人，|一路衝過終點線，}{全班衝進跑道把你圍住。|你們班拿了第一名。}", "運動會那天你自願跑大隊接力，交棒時一不小心，棒子掉在地上。{你撿起來繼續跑，|你咬著牙追上去，}{最後全班還是為你拍手。|下了跑道，老師拍拍你的肩膀說你跑得很好。}"],
          tug: ["參加拔河", "大家一起出力", "運動會你參加拔河，全班一起喊「{一、二，拉！|嘿咻！嘿咻！}」，{手掌磨得紅紅的，|最後只輸了一點點，}{大家還是笑成一團。|那是你第一次覺得全班是一體的。}"],
          practice: ["每天早上練跑", "想跑得更快", "為了運動會，你每天提早半小時到學校練跑，{比賽那天，六十公尺跑了第{二|三}名。|雖然沒得名，但跑出了自己最快的成績。|{who}說你最近吃飯都吃兩碗。}"],
          flag: ["負責畫班旗", "不用跑也能幫忙", "運動會你負責畫班旗，{用水彩畫了一隻大老虎，|熬了兩個晚上才畫完，}{進場時，全班舉著你畫的旗子走過司令台。|校長在司令台上特別誇了一句。}"],
          cheer: ["當啦啦隊", "在旁邊加油", "運動會你當啦啦隊，{用{stick}做了加油棒，|在跑道旁喊到喉嚨都啞了，}{你們班的選手跑過來時，你喊得最大聲。|那天晚上回家，你連說話都沙沙的。}"],
          shade: ["躲在司令台下乘涼", "反正不是你的事", "運動會那天，你躲在司令台下的陰影裡乘涼，{和{mate}偷吃{snack}，|看著別人跑來跑去，}{結果被老師抓去幫忙搬椅子。|那是你曬得最少的一次運動會。}"],
        }) },
        y < 1990 ? { make: () => ({
          prompt: "運動會前一個月，全校每天早上都在操場練大會操，你們班排在司令台正前方。你要怎麼做？",
          relay: ["自願站第一排", "做錯了全校都看得到", "運動會那天你站在大會操的第一排，{伸手、踢腿，一個拍子都沒錯，|每個動作都跟著口令做得整整齊齊，}{校長在司令台上點名誇你們班。|下了場，老師說你們班是全校最整齊的。}", "運動會那天你站在大會操的第一排，{一緊張轉錯了方向，|做到一半忘了下一個動作，}{你趕快偷看旁邊的人跟上，|後排的同學小聲提醒你，}{下了場，老師笑著說看得出你很用心。|全班還是幫你拍拍手。}"],
          tug: ["跟全班一起練隊形", "整齊要靠大家", "為了大會操，你和全班每天放學留下來排隊形，{班長在前面喊拍子，|大家互相提醒手要舉多高，}{運動會那天，你們班的隊伍像一條直線。|那是你第一次覺得全班是一體的。}"],
          practice: ["回家對著鏡子練", "把每個動作做熟", "為了大會操，你每天回家對著{衣櫃的鏡子|窗戶的倒影}練，{練到{who}都會跟著做了。|運動會那天，你的動作一個都沒錯。}"],
          flag: ["幫全班做彩球", "用皺紋紙做道具", "大會操要拿彩球，你負責幫全班做，{把皺紋紙剪成一條一條，綁了三十幾顆，|手指被膠水黏得脫了一層皮，}{進場時全班的彩球一起搖，好壯觀。|老師把你做的那一顆放在講台上當樣品。}"],
          cheer: ["站在最後一排跟著做", "不出錯就好", "練大會操時，你挑了最後一排的位置，{跟著前面同學的動作做，|太陽很大，你一直在心裡數還剩幾拍，}{運動會那天順順地做完了。|那天回家，你的脖子曬成了兩種顏色。}"],
          shade: ["說頭暈去保健室躲太陽", "練操太曬了", "練大會操的那幾個星期，你{說頭暈|說肚子痛}，跑去保健室躲太陽，{結果被護士阿姨看穿，又被送回操場。|躲了兩次，第三次老師就不信了。}"],
        }) } : { make: () => ({
          prompt: "運動會的班級進場要比創意，全班正在討論要扮成什麼。你要怎麼做？",
          relay: ["自願扮吉祥物走第一個", "全場都會看著你", "運動會那天你扮成{一隻大恐龍|一顆會走路的{costume}|一隻大公雞}走在最前面，{一進場全校就笑成一片，|還在司令台前轉了一圈，}{你們班拿到了進場第一名。|校長特別走下來跟你握手。}", "運動會那天你扮成{一隻大恐龍|一顆會走路的{costume}|一隻大公雞}走在最前面，{頭套太大，走到一半滑了下來，|走到司令台前，尾巴卡在隊伍裡，}{全場哄堂大笑，你也只好跟著笑。|下了場，老師說你是全班最勇敢的人。}"],
          tug: ["跟全班一起排進場舞", "大家一起想動作", "為了進場表演，你和全班每天{午休前|放學後}在走廊排舞，{大家為了一個動作吵了好久，|班長拿著{player}在前面數拍子，}{進場那天全班的動作整整齊齊。|那是你第一次覺得全班是一體的。}"],
          practice: ["每天下課練舞步", "不想在全校面前出錯", "為了進場表演，你每天{下課|回家}都在練舞步，{練到{who}都會跟著跳了，|連走路都在數拍子，}{進場那天，你一步都沒跳錯。|老師說你是全班跳得最好的。}"],
          flag: ["負責做道具和班旗", "畫畫、剪紙板", "進場表演的道具交給你，{你用紙箱和保麗龍做了一整排大旗子，|你把班旗畫成一隻會噴火的龍，}{進場時全校都在看你們班的道具。|那面班旗後來掛在教室後面一整年。}"],
          cheer: ["在隊伍中間跟著走", "不用站最前面", "進場那天你走在隊伍中間，{跟著大家一起揮手，|戴著全班一樣的紙帽子，}{沒出什麼錯，也很開心。|你偷偷跟看台上的{who}揮了揮手。}"],
          shade: ["說要上廁所，溜去福利社", "練舞太無聊了", "排練進場舞的時候，你說要上廁所，{溜去福利社買了一包{snack}，|躲在樓梯間吃{snack}，}{結果被老師在走廊上逮個正著。|回來時舞已經排好了，你只好站在最後面。}"],
        }) },
        { make: () => ({
          prompt: "運動會除了賽跑，還有趣味競賽，老師把報名表貼在黑板上。你要怎麼做？",
          relay: ["報名障礙賽", "要鑽網子、跳麻布袋", "運動會的障礙賽，你{鑽過網子、跳過輪胎，|第一個從麻布袋裡跳出來，}一路衝到終點，{全班在跑道旁大聲喊你的名字。|拿到了一張第一名的獎狀。}", "運動會的障礙賽，你在{鑽網子|跳麻布袋}的時候卡住了，{爬出來時已經是最後一名，|整個人滾到了跑道邊的軟墊上，}{你還是笑著跑完全程。|全場反而為你拍手拍得最大聲。}"],
          tug: [f ? ctx.f("跟{mate}報兩人三腳", { mate }) : "找同學報兩人三腳", "兩個人要喊同一個拍子", f ? "運動會的兩人三腳，你和{mate}{綁著腳練了一個星期，|一邊走一邊喊「一、二，一、二」，}{比賽時摔了一跤，爬起來繼續跑，|居然跑了第二名，}{兩個人笑到停不下來。|下場時兩個人的腳踝都綁出了紅印子。}" : "運動會的兩人三腳，你和隔壁的同學{綁著腳練了一個星期，|一邊走一邊喊「一、二，一、二」，}{比賽時摔了一跤，爬起來繼續跑，|居然跑了第二名，}{兩個人笑到停不下來。|下場時兩個人的腳踝都綁出了紅印子。}"],
          practice: ["報名跳繩，每天練", "一分鐘要跳一百下", "你報名了跳繩比賽，每天放學在{騎樓下|操場邊}練，{從一分鐘六十下練到一百下，|比賽那天一下都沒絆到，}{拿了年級第{二|三}名。|跳出了自己最好的成績。}"],
          flag: ["幫忙做比賽的道具", "用紙箱做出來", "趣味競賽要用的{紙箱烏龜殼|紙箱坦克}交給你做，{你用紙箱和膠帶忙了好幾個晚上，|你還把它塗成了亮綠色，}{比賽時大家輪流鑽進去爬，笑翻了全場。|老師說明年還要拿出來用。}"],
          cheer: ["在終點幫老師發名次牌", "不用上場也有事做", "運動會那天你在終點線幫老師{發名次牌|記成績}，{看著同學一個一個衝過來，|每一個名次都經過你的手，}{你覺得自己也是比賽的一部分。|一天下來，你曬得跟選手一樣黑。}"],
          shade: ["什麼都不報", "坐在樹下看就好", "運動會那天你什麼都沒報，{坐在樹蔭下和{mate}分著吃{snack}，|在樹蔭下看著別人跑來跑去，}{結果被老師拉去幫忙收器材。|那是你曬得最少的一次運動會。}"],
        }) },
        { w: 0.8, make: () => ({
          prompt: "運動會的重頭戲是班際拔河，老師在排全班的位置，最後面押尾的人還沒決定。你要怎麼做？",
          relay: ["自願當押尾", "整條繩子靠你穩住", "班際拔河，你當押尾，雙手{握到發白|緊緊抓著繩子}，整個人往後倒，{最後一秒把紅布條拉過了中線，|你們班一路贏到冠軍，}{全班抱成一團。|你的手掌磨得通紅，卻一直在笑。}", "班際拔河，你當押尾，{對面一用力，你的腳就滑了出去，|兩邊僵持了好久，最後一點一點被拉了過去，}{你們班在第一輪就輸了。|大家還是互相拍拍肩膀。}"],
          tug: ["排在中間跟大家一起拉", "大家一起出力", "班際拔河，你排在繩子中間，全班一起喊「{一、二，拉！|嘿咻！嘿咻！}」，{手掌磨得紅紅的，|最後只輸了一點點，}{大家還是笑成一團。|那是你第一次覺得全班是一體的。}"],
          practice: ["每天回家做伏地挺身", "把力氣練起來", "為了拔河，你每天回家做{二十|三十}下伏地挺身，{手臂痠到拿筷子都在抖，|{who}笑你比選手還認真，}{比賽那天，你覺得自己拉得特別有力。|你們班撐到了第二輪。}"],
          flag: ["幫全班寫加油標語", "用海報紙畫", "你幫全班寫了加油標語，{在海報紙上寫了「一條心，拔山倒海」，|還想了一段押韻的口號，}{比賽時啦啦隊舉著它喊得震天響。|那張海報後來貼在教室後面好久。}"],
          cheer: ["在旁邊幫忙喊口令", "幫大家打拍子", "拔河比賽你負責在旁邊喊口令，{用{stick}敲出拍子，|一直喊到喉嚨都啞了，}{你們班的人說，聽到你的聲音就有力氣。|最後雖然輸了，大家都說你喊得最好。}"],
          shade: ["說手會痛，坐在旁邊看", "反正人夠多了", "拔河那天你說手會痛，坐在司令台下{和{mate}偷吃{snack}，|看別人拉來拉去，}{結果被老師叫去幫忙抬水桶。|那是你曬得最少的一次運動會。}"],
        }) },
        s.age <= 8 && { w: s.age === 7 ? 1.5 : 0.8, make: () => ({
          prompt: "低年級的運動會要跑六十公尺，你被排在跑最快的那一組。你要怎麼做？",
          relay: ["拚全力衝第一", "說不定跑得贏", "低年級的六十公尺，槍聲一響你就衝出去，{一路領先到終點，|在最後幾步超過了旁邊的人，}{{who}在跑道旁跳起來拍手。|你第一次拿到了第一名的貼紙。}", "低年級的六十公尺，你衝得太快，{跑到一半跌坐在跑道上，你爬起來繼續跑，到終點時大家都在為你拍手。|鞋子掉了一隻，你撿起鞋子跑完全程，老師說你最勇敢。}"],
          tug: ["跟旁邊的同學約好一起跑", "有伴就不怕", "低年級的六十公尺，你和旁邊的同學{手牽手約好一起跑，|說好誰都不能丟下誰，}{結果兩個人一起衝過終點，|跑完兩個人笑成一團，}{老師笑著說這是最可愛的一組。|名次是什麼，你們都忘了。}"],
          practice: ["每天傍晚練跑", y < 1985 ? "在巷子裡來回跑" : "在公園來回跑", "為了運動會，你每天傍晚在{play}來回跑，{{who}幫你計時，|{who}拿著毛巾在終點等你，}{比賽那天，你跑了第{二|三}名。|雖然沒得名，但你比練習時快了好多。}"],
          flag: ["幫班上畫加油海報", "用蠟筆畫大大的", "低年級的運動會，你負責畫班上的加油海報，{用蠟筆畫了全班手牽手，|畫了一個好大的太陽和跑道，}{老師把它貼在你們班的休息區。|{who}來看運動會時，一眼就認出是你畫的。}"],
          cheer: ["照平常的速度跑", "跑完就好", "低年級的六十公尺，你照平常的速度跑完，{得了第{四|五}名，|跑到一半還回頭看了一下，}{領到一包參加獎的糖果，你就很開心了。|下場後一直在幫同學加油。}"],
          shade: ["說腳痛不想跑", "好怕在大家面前跑", "要在全校面前賽跑，你緊張得說腳痛，{老師讓你坐在休息區，|你坐在旁邊幫大家顧水壺，}{看同學跑完，你也跟著拍手。|你偷偷跟自己說，明年一定要跑。}"],
        }) },
        y >= 1975 && home !== "阿嬤" && { w: 0.8, make: () => {
          const pa = home === "爸媽" ? ctx.rng.pick(["爸爸", "媽媽"]) : home, p = { pa };
          return {
            pa, prompt: ctx.f("運動會有一場親子接力，要家長和小孩一起跑，{pa}說那天一定會來。你要怎麼做？", p),
            relay: [ctx.f("拉{pa}一起報名", p), "大人小孩一起跑", "運動會的親子接力，你和{pa}一起上場，{你把棒子交給{pa}，{pa}一路衝到終點，|{pa}牽著你的手衝過終點線，}{全場的家長都在拍手。|那張你們一起衝線的照片，{pa}{kept}好多年。}", "運動會的親子接力，你和{pa}一起上場，{pa}跑到一半{拖鞋飛了出去，|喘到停了下來，}{你們兩個笑到跑不動，最後一名衝過終點。|全場都在為你們拍手。}{{pa}說明年要先練跑。|}"],
            tug: [ctx.f("和{pa}參加親子拔河", p), "全家一起出力", "運動會的親子拔河，你和{pa}{排在同一邊，|一前一後站在繩子旁，}{{pa}喊得比小朋友還大聲，|一用力兩個人一起跌坐在地上，}{全場笑成一片。|那是你們家最好笑的一張照片。}"],
            practice: [ctx.f("週末跟{pa}去操場練交棒", p), "想在比賽時表現", "為了親子接力，你每個週末和{pa}去{學校操場|河堤}練交棒，{練到不用回頭就能接到棒子，|{pa}跑完一圈就喘得說不出話，}{比賽那天你們跑了第{二|三}名。|你覺得那幾個週末比比賽還好玩。}"],
            flag: [ctx.f("幫{pa}做加油頭帶", p), "寫上你們的名字", "你用{紅布|色紙}幫{pa}做了一條加油頭帶，{上面寫著你們兩個的名字，|還畫了一顆大愛心，}{{pa}戴著它跑完全程。|那條頭帶後來一直收在抽屜裡。}"],
            cheer: [ctx.f("讓{pa}坐在看台上看就好", p), "你跑給大人看", y >= 2005 ? "運動會那天，{pa}坐在看台上看你跑，{{pa}拿著手機一直拍，|你每跑過一次就朝看台揮手，}{你覺得自己跑得特別快。|回家路上{pa}一直說你好棒。}" : "運動會那天，{pa}坐在看台上看你跑，{{pa}拿著相機一直拍，|你每跑過一次就朝看台揮手，}{你覺得自己跑得特別快。|回家路上{pa}一直說你好棒。}"],
            shade: ["說親子接力好丟臉，不要報", "怕被同學笑", "你跟{pa}說親子接力好丟臉，不想報，{結果那天看別人家跑得好開心，|{pa}只好坐在看台上幫你顧水壺，}{你有一點後悔。|回家路上{pa}還是請你吃了一支冰淇淋。}"],
          };
        } },
      ]).make();
      const v = { who, mate, snack, stick, pa: sc.pa, costume: y >= 2000 ? "珍珠奶茶" : "西瓜", player: y < 2005 ? "錄音機" : "音響", play: y < 1985 ? "巷子裡" : "公園", kept: y >= 2010 ? "設成了手機桌布" : "夾在皮夾裡" };
      return {
        prompt: sc.prompt,
        options: [
          {
            id: "c_sportsDay.relay", label: sc.relay[0], hint: sc.relay[1], act: "exercise", style: "risk", weight: 0.22,
            apply: (s2, c) => (c.roll("health", "good", 0.5) ? { text: c.w(sc.relay[2], v), mood: 6 } : { text: c.w(sc.relay[3], v), mood: -1 }),
          },
          { id: "c_sportsDay.tug", label: sc.tug[0], hint: sc.tug[1], act: "socialize", style: "social", weight: 0.22, apply: (s2, c) => ({ text: c.w(sc.tug[2], v), mood: 3 }) },
          { id: "c_sportsDay.practice", label: sc.practice[0], hint: sc.practice[1], act: "exercise", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w(sc.practice[2], v), mood: 3 }) },
          { id: "c_sportsDay.flag", label: sc.flag[0], hint: sc.flag[1], act: "hobby", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w(sc.flag[2], v), mood: 3 }) },
          { id: "c_sportsDay.cheer", label: sc.cheer[0], hint: sc.cheer[1], act: "wait", style: "safe", weight: 0.14, apply: (s2, c) => ({ text: c.w(sc.cheer[2], v), mood: 2 }) },
          { id: "c_sportsDay.shade", label: sc.shade[0], hint: sc.shade[1], act: "rest", style: "self", weight: 0.12, apply: (s2, c) => ({ text: c.w(sc.shade[2], v), mood: 1 }) },
        ],
      };
    },
  },
  {
    // 過年紅包
    id: "c_redEnvelope", domain: "wealth", channel: "good", once: true, ages: [4, 12], when: s => !s.abroad, p: () => 0.06,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), home = liveWith(s, ctx), keeper = home === "爸媽" ? "媽媽" : home;
      const amount = y < 1950 ? "幾個銅板" : y < 1970 ? "幾十塊" : y < 1980 ? "兩三百塊" : y < 1990 ? "一千多塊" : y < 2000 ? "三四千塊" : y < 2010 ? "五六千塊" : "快一萬塊";
      const buy = ctx.rng.pick(kidsCulture(y).buy);
      const lead = ctx.f("過年收了{amount}的紅包", { amount }), v = { lead, who, keeper, buy, book: y >= 1990 ? "繪本" : "圖畫書", draw: y < 1970 ? "抽籤" : "玩戳戳樂" };
      return {
        prompt: ctx.f("過年跟著{home}拜年，收了一疊紅包，加起來有{amount}。要怎麼用？", { home, amount }),
        options: [
          { id: "c_redEnvelope.save", label: "存起來", hint: "看著數字變多", act: "save", style: "safe", weight: 0.25, apply: (s2, c) => { s2.flags.saver = true; return { text: c.w(y < 1965 ? "{lead}，你全部存進竹筒撲滿，{看著數字一點一點變多，好有成就感。|說好要存到買一台腳踏車。}" : "{lead}，你全部存進{郵局的儲金簿|小豬撲滿}，{看著數字一點一點變多，好有成就感。|說好要存到買一台腳踏車。}", v), mood: 2 }; } },
          { id: "c_redEnvelope.toy", label: "買想要的玩具", hint: "終於可以買了", act: "hobby", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}，你拿去買了{buy}，{抱著它睡了好幾天。|那是你自己出錢買的第一樣東西。}", v), mood: 4 }) },
          { id: "c_redEnvelope.keeper", label: ctx.f("交給{keeper}保管", { keeper }), hint: "說是幫你存起來", act: "save", style: "family", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}，你全部交給{keeper}，{keeper}說要幫你存起來。{那筆錢從此下落不明，|後來那些錢都變成了你的學費和新制服，}{你長大才懂。|這是很多台灣小孩共同的回憶。}", v), mood: 0 }) },
          { id: "c_redEnvelope.gift", label: "買禮物送家人", hint: "換你送大家", act: "care", style: "family", weight: 0.12, apply: (s2, c) => ({ text: c.w("{lead}，{你幫阿嬤買了一條圍巾，阿嬤戴著它去菜市場逢人就說。|你買了一盒{who}愛吃的鳳梨酥，{who}笑說你長大了。|你畫了一張卡片，連同一個小紅包送給{keeper}，那張卡片被收在皮夾裡好多年。}", v), mood: 4 }) },
          { id: "c_redEnvelope.book", label: "買一套書", hint: s.age < 7 ? "故事書或繪本" : "故事書或漫畫", act: "study", style: "learn", weight: 0.1, apply: (s2, c) => ({ text: c.w(s2.age < 7 ? "{lead}，{who}帶你去書局買了{一整套故事書|一大本{book}}，{每天晚上都要{who}念一個故事才肯睡。|書角都被你翻爛了。}"
            : y >= 2000 ? "{lead}，你去書局買了{一整套故事書|一套漫畫|一本《哈利波特》}，{看到半夜被叫去睡覺。|書角都被你翻爛了。}" : "{lead}，你去書局買了{一整套故事書|一套漫畫}，{看到半夜被叫去睡覺。|書角都被你翻爛了。}", v), mood: 3 }) },
          {
            id: "c_redEnvelope.gamble", label: y < 2005 ? "去柑仔店抽獎" : "去夾娃娃", hint: "說不定中大獎", act: "lottery", style: "risk", weight: 0.08,
            apply: (s2, c) => ({ text: c.w(y < 2005 ? "{lead}，你拿去柑仔店{draw}，{換到一堆糖果和小玩具，|抽到了大獎，抱著獎品跑回家，}{被{who}唸了一頓。|還是覺得很值得。}" : "{lead}，你拿去夾娃娃，{夾了二十幾次才夾到一隻小熊，|一次都沒夾到，}{被{who}唸了一頓。|還是覺得很好玩。}", v), mood: 1 }),
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
      const mrt = metro && ctx.rng() < 0.4;
      const dest = ctx.rng.pick(["阿嬤家", "補習班", "圖書館", "同學家"]);
      const lead = ctx.f(mrt ? "第一次自己搭捷運去{dest}，結果{oops}" : "第一次自己搭公車去{dest}，結果{oops}", { dest, oops: ctx.rng.pick(["坐過站了", "坐錯方向了"]) });
      const v = { lead, who, dest, phone: callHome(y) };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "c_bus.ask", label: mrt ? "問站務人員" : "問司機", hint: "開口問大人", act: "seekHelp", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w(mrt ? "{lead}。你鼓起勇氣問站務人員，{站務人員告訴你在下一站下車，換到對面坐回去就好。|站務人員笑著說：「別緊張，我跟你說怎麼走。」}{你一路緊盯著站名。|到了以後，你大聲說了謝謝。}"
            : "{lead}。你鼓起勇氣問司機，{司機告訴你在下一站下車，換到對面坐回去就好。|司機笑著說：「別緊張，我跟你說怎麼走。」}{你一路緊盯著站名。|到了以後，你大聲說了謝謝。}", v), mood: 2 }) },
          { id: "c_bus.walk", label: "下車自己走回去", hint: "記得路就不怕", act: "wait", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。你在下一站下車，{沿著來時的路走回去，|看著路牌一條一條找，}{走了快半個小時才到。|到的時候滿頭大汗，但很得意。}", v), mood: 1 }) },
          { id: "c_bus.call", label: "打電話回家", hint: "找家人來接", act: "seekHelp", style: "family", weight: 0.25, when: () => y >= 1965, apply: (s2, c) => ({ text: c.w("{lead}。你{phone}，{who}{騎機車來接你，|趕過來找你，}{一路上沒罵你，只說下次要記得看站名。|回家後教你怎麼看路線圖。}", v), mood: 1 }) },
          { id: "c_bus.loop", label: "坐到終點站再坐回來", hint: "反正會繞回來", act: "wait", style: "risk", weight: 0.1, apply: (s2, c) => ({ text: c.w("{lead}。你乾脆坐到終點站，{一路看著窗外沒看過的風景，|在終點站等了好久才有回程的車，}{再坐回來時天都快黑了。|回到家才發現{who}急壞了。}", v), mood: 0 }) },
          { id: "c_bus.map", label: "看路線圖自己找", hint: "自己想辦法", act: "study", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w(mrt ? "{lead}。你下車研究牆上的路線圖，{找到了換車的方法，|看了好久，}{自己轉車到了{dest}。|從此你成了全家最會看路線圖的人。}"
            : "{lead}。你下車研究站牌上的路線圖，{找到了換車的方法，|看了好久，}{自己轉車到了{dest}。|從此你成了全家最會看路線圖的人。}", v), mood: 3 }) },
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
      return { text: wAgain(ctx, [
        "放學後你就在家裡的{shop}寫功課，{客人來了還會幫忙找錢。|熟客都叫你「小老闆」。}{{who}說你比大人還會招呼客人。|功課常常寫到一半就跑去幫忙。}",
        "週末你在家裡的{shop}幫忙，{幫客人裝袋、算錢，|整理架子、掃地，}{一個下午賺到{pay}零用錢。|{who}說你比請來的人還認真。}",
        "過年前家裡的{shop}忙翻了，你{踩著小板凳幫忙，|一直跑腿幫忙買東西，}{累到吃完年夜飯就睡著了。|那年的紅包特別厚。}",
      ], { shop, who, pay }), mood: 2 };
    },
  },
  {
    // 那個年代的卡通和玩具
    id: "c_cartoon", max: 2, cooldown: 3, ages: [4, 12], p: () => 0.09,
    apply: (s, ctx) => {
      const k = kidsCulture(s.year), watch = ctx.rng.pick(k.watch), toy = ctx.rng.pick(k.toys), f = friendName(s, "同學"), who = grownUp(s, ctx);
      return { text: wAgain(ctx, [
        "那幾年你{watch}，{連吃飯都捨不得離開。|隔天下課就和同學演一遍。|那是你一整天最期待的時間。}",
        "{toyA}是那幾年最流行的東西，你和{f}{下課就湊在一起玩，|比賽誰的比較厲害，}{有一次玩到忘了回家吃飯。|零用錢全花在上面。}",
        "班上最紅的是{toyB}，{你求了{who}好久，終於在生日那天拿到。|你沒有，只好每天借{f}的來玩。|你把它寫進了作文〈我最喜歡的東西〉。}",
      ], { watch, f, who, toyA: padIn(ctx, toy, w => w.trimStart()), toyB: padIn(ctx, toy, w => w.trimEnd()) }), mood: 2 };
    },
  },
  {
    // 暑假作業：一大疊作業和日記、讀書心得、勞作、觀察日記、訪問長輩、線上學習，依年代和年級挑一個。
    // Each scene gives every option [label, hint, text].
    id: "c_summerHw", domain: "study", channel: "change", max: 1, ages: [7, 12], when: s => s.studying && !s.abroad, p: () => 0.06,
    choice: (s, ctx) => {
      const y = s.year, old = olderSibs(s), helper = old.length ? siblingCall(ctx.rng.pick(old)) : grownUp(s, ctx), who = grownUp(s, ctx);
      const mate = (bestFriend(s) || ctx.person({ role: "friend", sex: s.sex, birthYear: s.birthYear })).call;
      const withMate = t => ctx.f(t, { mate }), clay = y >= 1985 ? "紙黏土" : "黏土";
      const sc = pickScene(ctx, [
        { make: () => {
          const lead = "暑假開始，老師發了一大疊暑假作業，還要每天寫日記";
          return {
            lead, prompt: ctx.f("{lead}。打算怎麼寫？", { lead }),
            early: ["第一週就寫完", "寫完才能痛快玩", "{lead}。你第一個星期就把作業寫完，{剩下的日子玩到曬成黑炭。|之後只剩日記每天寫一篇。}"],
            daily: ["每天寫一點", "照進度慢慢來", "{lead}。你每天寫兩頁，{開學那天交出整整齊齊的一本，|日記裡還畫了插圖，}{老師在上面蓋了一個「優」。|被老師拿去給全班看。}"],
            last: ["最後幾天再趕", "先玩再說", "{lead}。你玩了一整個暑假，最後三天才開始趕，{日記裡的天氣全部寫「晴」，|二十篇日記一個晚上補完，}{開學前一晚寫到半夜。|寫到手都抽筋了。}"],
            together: [withMate("跟{mate}一起寫"), "互相幫忙", "{lead}。你和{mate}每天下午{在{mate}家|在圖書館}一起寫，{寫一寫就聊起天來，|互相對答案，}{最後兩個人連錯字都一樣。|那是最好玩的一個暑假。}"],
            help: [ctx.f("拜託{helper}教你", { helper }), "數學有好幾題不會", "{lead}。數學有好幾題你怎麼都不會，{helper}{坐在你旁邊一題一題講，|拿出鉛筆畫圖給你看，}{你終於弄懂了。|講到後來，{helper}自己也算錯了一題，兩個人笑成一團。}"],
          };
        } },
        s.age >= 8 && y >= 1960 && { make: () => {
          const lead = "暑假作業裡有一項是讀完三本課外書，每本都要寫一篇讀書心得";
          return {
            lead, prompt: ctx.f("{lead}。打算怎麼做？", { lead }),
            early: ["放假第一週就讀完", "讀完才能痛快玩", "{lead}。你放假第一個星期就把三本書讀完、心得寫好，{剩下的日子都在外面玩，|後來又自己多讀了好幾本，}{開學時老師說你的心得寫得很完整。|{who}說你難得這麼自動。}"],
            daily: ["每天讀一章", "讀完一本就寫一篇", "{lead}。你每天讀一章，讀完一本就寫一篇，{心得寫得滿滿兩頁，|還在心得旁邊畫了書裡的場景，}{老師在上面寫了一句「寫得真好」。|被老師貼在教室後面的布告欄。}"],
            last: ["開學前再翻翻看", "看封底也能寫", "{lead}。你一直拖到開學前兩天，{只好照著封底的介紹寫心得，|一個晚上把三本書翻完，}{老師的評語是「請再讀一次」。|寫到眼皮都睜不開。}"],
            together: [withMate("跟{mate}交換書看"), "看完再互相講", "{lead}。你和{mate}交換書看，{每天{talk}講書裡的故事，|看完一本就換下一本，}{最後兩個人的心得開頭一模一樣。|你們還自己編了續集。}"],
            help: [ctx.f("請{helper}帶你去挑書", { helper }), "不知道要讀什麼", y < 1970 ? "{lead}。你不知道要讀什麼，{helper}帶你去書局挑了三本，{還陪你讀完了第一本。|回家的路上還幫你想好了心得的開頭。}" : "{lead}。你不知道要讀什麼，{helper}帶你去{圖書館|書局}挑了三本，{還陪你讀完了第一本。|回家的路上還幫你想好了心得的開頭。}"],
          };
        } },
        { make: () => {
          const lead = ctx.f("暑假作業裡有一份勞作，要用{stuff}做一個作品，開學要展覽", { stuff: y < 1985 ? "竹筷子和舊紙板" : "家裡的回收物" });
          return {
            lead, prompt: ctx.f("{lead}。打算怎麼做？", { lead }),
            early: ["放假第一週就做好", "做完才能放心玩", "{lead}。你放假第一週就{做了一艘會浮在水上的船，|做了一個有抽屜的筆筒，}{擺在書桌上看了一整個暑假。|開學展覽時被擺在第一排。}"],
            daily: ["每天做一點，慢慢修", "做到滿意為止", "{lead}。你每天做一點，{做出一座窗戶會開關的房子，|做出一台輪子會轉的車子，}{開學後被老師選去全校展覽。|同學一直圍過來問你是怎麼做的。}"],
            last: ["開學前一天再做", "隨便黏一黏就好", "{lead}。你拖到開學前一天才動手，{半夜還在家裡翻箱倒櫃找膠水，|最後交出一個歪歪的盒子，}{老師問這是什麼，你說是「抽象藝術」。|{who}被你拉起來陪你做到半夜。}"],
            together: [withMate("跟{mate}合做一個大的"), "兩個人點子比較多", "{lead}。你和{mate}合做了一個{紙箱機器人|有山有河的小模型}，{在{mate}家攤了一整個暑假，|兩個人為了顏色吵了好幾次，}{開學時兩個人一起抬到學校。|老師說這是全班最大的一件。}"],
            help: [ctx.f("拜託{helper}幫忙", { helper }), "勞作太難了", "{lead}。勞作太難了，{helper}幫你{{house}，|用{clay}捏了一隻恐龍，}{開學時老師問：「這是誰做的？」|你在旁邊負責塗顏色。}"],
          };
        } },
        s.age <= 10 && { make: () => {
          const lead = "暑假作業是一本觀察日記，要種一盆綠豆，每天記下它長多高";
          // the days you were away: two that were {a|b} in the sentence ({{aw0}|{aw1}})
          const [awayHint, aw0, aw1] = y < 1975 ? ["回鄉下時怕它乾掉", "你回鄉下叔公家住的那幾天", "你回鄉下姑婆家住的那幾天"] : ["去夏令營時怕它乾掉", "你去參加夏令營的那幾天", "你去參加學校的營隊的那幾天"];
          return {
            lead, aw0, aw1, prompt: ctx.f("{lead}。打算怎麼做？", { lead }),
            early: ["一次多種幾盆", "一盆死了還有別盆", "{lead}。你一口氣種了{三|五}盆，{果然有一盆被太陽曬乾了，|有一盆被{who}當成雜草拔掉了，}{還好其他的長得很好，日記一天都沒斷。|開學時你帶了長得最高的那一盆去學校。}"],
            daily: ["每天量、每天畫", "記下每一天的變化", "{lead}。你每天用尺量綠豆芽，畫在日記上，{發現它晚上長得比白天快，|還記下哪天下雨、哪天出大太陽，}{老師把你的日記拿去給全班看。|老師在上面寫了一句「你是小科學家」。}"],
            last: ["開學前再補", "憑印象畫就好", "{lead}。你玩了一整個暑假，綠豆早就乾掉了，最後三天{憑想像把三十天的日記一次補完，|畫了一株越長越高的豆芽，}{老師看了說：「你的綠豆長得好整齊。」|日記裡的天氣全部寫「晴」。}"],
            together: [withMate("跟{mate}比誰的長得高"), "互相看對方的", "{lead}。你和{mate}各種一盆，{每天跑去對方家比高度，|約好誰的長得比較高，另一個人就要請吃冰，}{最後你的多了一公分，{mate}請你吃了一支冰棒。|最後{mate}的贏了，你請了一支冰棒。}"],
            help: [ctx.f("拜託{helper}幫忙澆水", { helper }), awayHint, "{lead}。{{aw0}|{aw1}}，拜託{helper}幫忙澆水，{helper}{{water}，|一天都沒忘記，}{回來時豆芽長得比你走的時候高了一大截。|你在日記裡寫了一段謝謝{helper}的話。}"],
          };
        } },
        y >= 1990 && (s.father.alive || s.mother.alive) && { w: 0.8, make: () => {
          const elder = ctx.rng.pick(["阿公", "阿嬤", "外婆"]), lead = ctx.f("暑假作業有一張學習單，要訪問{elder}小時候的生活", { elder });
          return {
            lead, elder, prompt: ctx.f("{lead}。打算怎麼做？", { lead }),
            early: ["放假第一天就去問", "趁記得先寫好", "{lead}。你放假第一天就拿著學習單去問{elder}，{{elder}講了一整個下午，你寫滿了三張紙，|{elder}說小時候每天要走一個多小時的路去上學，}{剩下的暑假都在玩。|你第一次知道{elder}也當過小孩。}"],
            daily: ["每天晚飯後問一題", "慢慢聽", "{lead}。你每天晚飯後問{elder}一個問題，{{elder}拿出一本舊相簿，一張一張講給你聽，|聽到了好多你從沒聽過的事，}{學習單寫到要另外黏一張紙。|老師在學習單上寫：「請替我謝謝{elder}。」}"],
            last: ["開學前一天再問", "問兩三題就好", y >= 2012 ? "{lead}。你拖到開學前一天晚上才想起來，{趕快打視訊給{elder}問了三個問題，|{elder}已經準備睡了，只回答了兩題，}{學習單寫得短短的。|{elder}說：「早點問，我可以講更多。」}" : "{lead}。你拖到開學前一天晚上才想起來，{趕快打電話給{elder}問了三個問題，|{elder}已經準備睡了，只回答了兩題，}{學習單寫得短短的。|{elder}說：「早點問，我可以講更多。」}"],
            together: [withMate("跟{mate}互相訪問"), "去對方家聽故事", "{lead}。你和{mate}{一起去訪問兩家的長輩，|輪流去對方家問問題，}{聽到兩家的長輩小時候竟然住在同一個村子，|{mate}家的長輩還唱了一首以前的歌給你們聽，}{兩張學習單都寫得好精彩。|那是最好玩的一份作業。}"],
            help: [ctx.f("請{helper}幫你想問題", { helper }), "不知道要問什麼", "{lead}。你不知道要問什麼，{helper}幫你想了十個問題，{還坐在旁邊幫你把台語翻成國語寫下來，|一起聽{elder}講以前的事，}{學習單寫得好完整。|那天{helper}也聽得好入迷。}"],
          };
        } },
        y >= 2013 && { w: 1.2, make: () => {
          const lead = "暑假作業有一部分在網路上，老師開了線上學習的任務，每天要做幾題";
          return {
            lead, prompt: ctx.f("{lead}。打算怎麼做？", { lead }),
            early: ["第一週就全部做完", "一次把任務破完", "{lead}。你第一個星期就把線上任務全部做完，{排行榜上你的名字排在最前面，|拿到了滿滿一排徽章，}{剩下的時間都在外面玩。|{who}說你難得這麼認真。}"],
            daily: ["每天做一點", "一天做幾題", "{lead}。你每天吃完早餐就做幾題，{不會的就看教學影片，|做完還多看了幾支科學影片，}{開學時老師說你是全班最穩定的。|分數慢慢從六十幾分爬到九十幾分。}"],
            last: ["最後幾天一次刷完", "反正有影片可以看", "{lead}。你拖到開學前幾天才登入，{一個晚上看完二十幾支教學影片，|題目不會就一直猜，}{老師在後台看到你半夜還在線上。|做到眼睛都酸了。}"],
            together: [withMate("跟{mate}開視訊一起做"), "邊做邊聊", "{lead}。你和{mate}{開著視訊一起做，|約好每天下午比賽誰先做完，}{結果聊天的時間比寫作業還長。|兩個人的分數一模一樣。}"],
            help: [ctx.f("拜託{helper}教你", { helper }), "有幾題看不懂", "{lead}。有幾題你怎麼都看不懂，{helper}{坐在你旁邊一題一題講，|畫圖解釋給你看，}{你終於弄懂了{topic}。|講到後來，{helper}自己也算錯了一題，兩個人笑成一團。}"],
          };
        } },
      ]).make();
      const v = {
        lead: sc.lead, mate, helper, who, clay, elder: sc.elder, aw0: sc.aw0, aw1: sc.aw1, talk: y >= 1985 ? "在電話裡" : "在巷口",
        house: y < 1985 ? "用竹筷子搭了一棟房子" : "用冰棒棍搭了一棟房子", water: y >= 2012 ? "每天傳照片給你看" : y >= 1985 ? "每天打電話告訴你長多高了" : "每天幫你把高度記在紙上",
        topic: s.age >= 10 ? "分數的除法" : "乘法的直式",
      };
      return {
        prompt: sc.prompt,
        options: [
          { id: "c_summerHw.early", label: sc.early[0], hint: sc.early[1], act: "study", style: "safe", weight: 0.18, apply: (s2, c) => ({ text: c.w(sc.early[2], v), mood: 3 }) },
          { id: "c_summerHw.daily", label: sc.daily[0], hint: sc.daily[1], act: "study", style: "learn", weight: 0.22, apply: (s2, c) => ({ text: c.w(sc.daily[2], v), mood: 3 }) },
          { id: "c_summerHw.last", label: sc.last[0], hint: sc.last[1], act: "pushThrough", style: "risk", weight: 0.3, apply: (s2, c) => ({ text: c.w(sc.last[2], v), mood: -1 }) },
          { id: "c_summerHw.together", label: sc.together[0], hint: sc.together[1], act: "socialize", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(sc.together[2], v), mood: 3 }) },
          { id: "c_summerHw.help", label: sc.help[0], hint: sc.help[1], act: "seekHelp", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(sc.help[2], v), mood: 2 }) },
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
        ? ["生日那天，{who}煮了一碗豬腳麵線，{碗裡還多了一顆滷蛋。|你連湯都喝光了。}{那是一年裡最期待的一天。|{who}說吃了麵線會長命百歲。|{who}還偷偷塞給你一個小紅包。}",
          "生日那天沒有蛋糕，{who}{在你的便當裡多放了一顆蛋，|帶你去廟口吃了一碗麵，}{你覺得自己是全世界最幸福的人。|那天連功課都寫得特別快。}"]
        : ["生日那天，{who}{從麵包店買了一個鮮奶油蛋糕，你把蛋糕上的櫻桃留到最後才吃。|帶你去吃了一碗牛肉麵，還多加了一顆滷蛋。}{你許的願是想要{buy}。|那天你一直笑。}",
          "生日那天，{who}{買了一個小蛋糕，全家圍在桌邊幫你唱生日快樂歌，你吹蠟燭時許了一個不能說的願望。|煮了一碗豬腳麵線，說吃了會長命百歲，你連湯都喝光了。}",
          "生日那天，{who}{帶你去照相館拍了一張照片，|帶你去百貨公司頂樓的遊樂場玩，|在你的碗裡多放了一顆滷蛋，}{你覺得自己是全世界最幸福的人。|那天連功課都寫得特別快。}"];
      const v = { who, buy, fname: friendName(s, "同學") };
      if (y >= 1986 && y < 2010 && s.age >= 5) list.push(y >= 1990 ? "生日那天在麥當勞辦了慶生會，{請了班上的好朋友來，|{fname}送了你一張自己畫的卡片，}{大家戴著紙帽子唱生日快樂歌。|你第一次覺得自己是主角。}" : "生日那天在家裡辦了慶生會，{請了班上的好朋友來，|{fname}送了你一張自己畫的卡片，}{大家戴著紙帽子唱生日快樂歌。|你第一次覺得自己是主角。}");
      if (y >= 2000 && s.studying) list.push("生日那天，全班在教室一起唱生日快樂歌，{你分了小蛋糕給每個同學。|你收到一張全班簽名的卡片。}{{who}在家裡還準備了第二個蛋糕。|那天你笑得最開心。}");
      if (old.length) { v.sib = siblingCall(ctx.rng.pick(old)); list.push("{sib}用存了好久的零用錢，買了{buy}送你當生日禮物，{你高興得跳起來。|你們一起玩到半夜被罵。}"); }
      const away = s.flags.parentsSplit && (s.flags.liveWith === "mother" ? s.father.alive && "爸爸" : s.mother.alive && "媽媽");
      if (away) { v.away = away; list.push("那年生日，{away}特地{請假陪你過，|帶你去吃了一頓牛排，}{你把那天的照片貼在書桌前。|你許願明年還要一起過。}"); }
      return { text: wAgain(ctx, list, v), mood: 3 };
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
      // 工作 alone is the word for a job in the story's slots, so its sentence is written out
      const lead = topic === "工作" ? ctx.f("半夜被客廳的聲音吵醒，爸爸媽媽在為了工作吵架") : ctx.f("半夜被客廳的聲音吵醒，爸爸媽媽在為了{topic}吵架", { topic });
      const v = { lead, sib, music };
      return {
        prompt: ctx.f("{lead}。你要怎麼辦？", { lead }),
        options: [
          { id: "c_nightQuarrel.hide", label: "躲回被子裡", hint: "假裝沒聽到", act: "avoid", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w("{lead}。你把頭埋進被子裡，{數著時鐘的滴答聲，|小聲地哼著兒歌，}{不知道什麼時候睡著了。|隔天早上，餐桌上安安靜靜的。}", v), mood: -3 }) },
          { id: "c_nightQuarrel.stop", label: "走出去說「不要吵了」", hint: "說出你的害怕", act: "talk", style: "risk", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。你走出房間，哭著說「不要吵了」。{兩個人都愣住了，媽媽把你抱回房間。|爸爸蹲下來說：「對不起，嚇到你了。」}{之後他們吵架都會先關上門。|隔天他們一起帶你去吃早餐。}", v), mood: -1 }) },
          {
            id: "c_nightQuarrel.sib", label: sib ? ctx.f("去找{sib}", { sib }) : "去找兄弟姊妹", hint: "有人陪比較不怕", act: "seekHelp", style: "family", weight: 0.2, when: () => !!sib,
            apply: (s2, c) => ({ text: c.w(old.length ? "{lead}。你鑽進{sib}的被窩，{sib}{小聲講故事給你聽，|握著你的手說沒事，}{兩個人一起等到客廳安靜下來。|你們約好明天要去公園玩。}" : "{lead}。你跑去{sib}的床邊，怕{sib}被吵醒會哭，{小聲講故事給{sib}聽，|一直輕輕拍著{sib}的背，}{後來你們兩個都睡著了。|那晚你覺得自己長大了。}", v), mood: -2 }),
          },
          { id: "c_nightQuarrel.card", label: "隔天畫一張卡片", hint: "畫一家人手牽手", act: "talk", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。隔天你畫了一張卡片，{畫著一家人手牽手去公園，|寫著「爸爸媽媽不要吵架」，}{偷偷放在餐桌上。|塞進他們的枕頭底下。}{那天晚上，他們一起來你房間說晚安。|媽媽看著卡片，笑著擦了眼淚。}", v), mood: 1 }) },
          { id: "c_nightQuarrel.music", label: y < 1980 ? "打開收音機" : "戴上耳機", hint: "讓自己不要聽到", act: "rest", style: "self", weight: 0.12, apply: (s2, c) => ({ text: c.w("{lead}。你{music}，{把聲音開大一點，再大一點，|一直聽到睡著，}{隔天大家都裝作沒事。|那晚的事你一直沒問。}", v), mood: -2 }) },
          { id: "c_nightQuarrel.grandma", label: "隔天打電話給阿嬤", hint: "找大人說", act: "seekHelp", style: "social", weight: 0.08, when: () => y >= 1965, apply: (s2, c) => ({ text: c.w("{lead}。隔天放學你偷偷打電話給阿嬤，{阿嬤週末就來家裡住了幾天，|阿嬤說大人有時候會吵架，但都很愛你，}{家裡的氣氛好多了。|你心裡的石頭放下了一半。}", v), mood: 1 }) },
        ],
      };
    },
  },
  {
    // 爸媽分開以後，住在阿嬤家
    id: "c_grandmaHome", domain: "family", channel: "change", once: true, ages: [5, 12], when: s => s.flags.parentsSplit && !s.abroad, p: () => 0.3,
    apply: (s, ctx) => {
      const y = s.year, who = liveWith(s, ctx), gm = ctx.rng.pick(["阿嬤", "外婆"]);
      s.flags.grandmaHome = true;
      const v = { who, gm, stove: y < 1962 ? "灶" : "大同電鍋", night: y < 1965 ? "聽收音機裡的歌仔戲" : "看電視上的八點檔" };
      return { text: wAgain(ctx, [
        "爸媽分開以後，{週末|寒暑假}你都住在{gm}家。{{gm}每天早上五點就起床煮稀飯，|{gm}家的院子種了一棵芒果樹，}{你學會了用{stove}蒸饅頭。|晚上和{gm}一起{night}。}",
        s.studying ? "爸媽分開以後，{who}工作很忙，你搬去{gm}家住了{一年|兩年}。{每天放學，{gm}都在巷口等你，|{gm}總是把最大塊的肉夾到你碗裡，}{那是你最安心的一段日子。|你的書包裡永遠有一顆{gm}塞的橘子。}"
          : "爸媽分開以後，{who}工作很忙，你搬去{gm}家住了{一年|兩年}。{每天傍晚，{gm}都在巷口等你，|{gm}總是把最大塊的肉夾到你碗裡，}{那是你最安心的一段日子。|你的口袋裡永遠有一顆{gm}塞的橘子。}",
        "爸媽分開後的那個暑假，你住在{鄉下|海邊}的{gm}家，{跟著{gm}餵雞、晒菜乾，|跟著{gm}去{田裡|港邊}，}{晒得黑黑的才回家。|回家那天，{gm}塞了一大袋龍眼給你。}",
      ], v), mood: 1 };
    },
  },
  {
    // 搬家轉學（緊接在 core.js 的 familyMove 之後）
    id: "c_newSchool", domain: "move", channel: "change", cooldown: 2, ages: [7, 12], when: s => s.last.familyMove === s.age && s.studying && !s.abroad, p: () => 0.85,
    choice: (s, ctx) => {
      const y = s.year, f = bestFriend(s);
      const write = y < 1990 ? "寫了一封信給" : y < 2005 ? "打電話給" : y < 2011 ? "在 MSN 上敲" : "傳 LINE 給";
      const lead = ctx.f("搬到{county}，轉進新學校的第一個星期，下課都沒有人跟你說話", { county: String(s.county) });
      const v = { lead, write, fname: f && f.call, gripe: y >= 1985 ? "的營養午餐不好吃" : "離家好遠" };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "c_newSchool.reach", label: "主動借同學東西", hint: "先開口", act: "socialize", style: "social", weight: 0.3, apply: (s2, c) => { const n = makeFriend(s2, c, "國小同學", 0.8); return { text: c.w("{lead}。你主動{借隔壁的{name}一支筆，|問前面的{name}下一堂是什麼課，}{下課{name}就拉著你去打躲避球。|沒多久，你們就變成好朋友。}", { ...v, name: n.call }), mood: 3 }; } },
          { id: "c_newSchool.wait", label: "等別人來找你", hint: "慢慢來", act: "wait", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}。你每天安靜地坐在位子上{看書|畫畫}，{過了一個多月，才有同學來問你在做什麼。|直到分組做報告，才慢慢跟同學熟起來。}", v), mood: -1 }) },
          { id: "c_newSchool.team", label: "參加校隊", hint: "用運動交朋友", act: "exercise", style: "health", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。你參加了{躲避球隊|田徑隊|籃球隊}，{每天放學一起練球，|比賽那天全隊抱在一起，}{很快就跟隊友混熟了。|你終於覺得自己屬於這裡。}", v), mood: 3 }) },
          { id: "c_newSchool.old", label: f ? ctx.f("聯絡{fname}", { fname: f.call }) : "聯絡以前的同學", hint: "想念舊學校", act: "talk", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(f ? "{lead}。你{write}{fname}，{說新學校{gripe}，|說你好想大家，}{{fname}說放假要來找你玩。|聊完心裡舒服多了。}" : "{lead}。你{write}以前的同學，{說新學校{gripe}，|說你好想大家，}{對方說放假要來找你玩。|聊完心裡舒服多了。}", v), mood: 1 }) },
          { id: "c_newSchool.joke", label: "自我介紹時講個笑話", hint: "一次讓大家記住你", act: "socialize", style: "risk", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。班會時你上台講了一個笑話，{全班笑翻了，從此大家都叫你「開心果」。|結果沒人笑，你自己先笑了出來，反而大家都笑了。}", v), mood: 3 }) },
        ],
      };
    },
  },

  // ---------- 國小的日常：每一題先挑一個情境，題目、按鈕和結果都從那個情境來 ----------
  // A scene gives each option [label, hint, text]; an option with an outcome gives [label, hint, it went well, it did not].
  {
    // 當幹部：班長、小老師、沒人想當的股長、路隊長
    id: "c_cadre", domain: "study", channel: "good", once: true, ages: [8, 12], when: s => s.studying && !s.abroad, p: () => 0.05,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), play = y < 1985 ? "巷子裡" : "操場";
      const mate = (bestFriend(s) || ctx.person({ role: "friend", sex: s.sex, birthYear: s.birthYear })).call;
      const subject = ctx.rng.pick(["國語", "數學", y >= 2005 ? "英文" : "自然"]), duty = y >= 1995 ? "環保股長" : "衛生股長";
      const p = { who, mate, subject, duty, play };
      const sc = pickScene(ctx, [
        { make: () => ({
          role: "班長", prompt: "下星期的班會要選幹部，好幾個同學說要提名你當班長。要怎麼辦？",
          take: ["答應參選", "說不定真的選上", "你答應參選班長，{開票時黑板上你的「正」字最多，|最後以{三|五}票之差選上，}{從此每節上課都要喊「起立、敬禮」。|管秩序管到喉嚨都啞了，但你很得意。}", "你答應參選班長，{開票時差了幾票，|最後輸給了班上最會說笑話的同學，}{你在座位上用力拍手，|你被選成了副班長，}{回家路上卻一直踢著石頭。|{who}說能被提名就很厲害了。}"],
          vice: ["說只想當副班長", "幫忙就好，不用帶頭", "你說你只想當副班長，{每天幫班長收作業、登記遲到，|班長請假時才站上講台喊口令，}{做得穩穩當當。|老師說你是班上最可靠的人。}"],
          friend: [ctx.f("推薦{mate}當班長", p), "你覺得有人更適合", "班會上你舉手推薦{mate}，{結果真的選上了，下課還拉著你一起去辦公室領點名簿，|{mate}的臉一下子紅了，最後真的選上，}{後來班上有什麼事，{mate}都先來問你的意見。|你們兩個一起把班上管得好好的。}"],
          home: [ctx.f("先回家問{who}", p), "想好了再答應", "你回家問{who}要不要當班長，{who}{說當班長很辛苦，但可以學到很多，|說你想做就去做，家裡支持你，}{隔天你在班會上舉手說好。|你想了一個晚上，最後答應了。}"],
          decline: ["推掉，說不想當", "下課想好好玩", "你在班會上說你不想當班長，{下課照樣衝去{play}玩，|把下課時間都留給自己，}{一點也不後悔。|看著新班長每天被老師叫去辦公室，你偷偷鬆了一口氣。}"],
        }) },
        { make: () => ({
          role: subject + "小老師", prompt: ctx.f("老師下課把你叫到辦公室，問你願不願意當{subject}小老師，幫忙收作業、改考卷。要怎麼回答？", p),
          take: [ctx.f("答應當{subject}小老師", p), "每天要幫老師改作業", "你當了{subject}小老師，{每天早上幫老師收作業，|改考卷時比老師還嚴格，}{同學有不會的題目都跑來問你。|那學期你的{subject}考了全班最高分。}", "你當了{subject}小老師，{收作業時常常被同學拖拖拉拉，|有一次把考卷改錯了好幾題，}{被同學取笑了一個星期。|你才知道當小老師沒有想像中輕鬆。}"],
          vice: ["說只幫忙收作業就好", "改考卷太難了", "你跟老師說你可以幫忙收作業，但不想改考卷，{每天早上抱著一疊作業簿送到辦公室，|把沒交作業的名單寫在黑板角落，}{老師說這樣就幫了大忙。|一整個學期，一次都沒漏過。}"],
          friend: [ctx.f("推薦{mate}", p), ctx.f("{mate}的{subject}比你好", p), "你跟老師說{mate}的{subject}比你好，{老師就請{mate}當，|{mate}當上了小老師，}{有空就教你不會的題目。|後來你們兩個的{subject}都進步了。}"],
          home: [ctx.f("回家問{who}", p), "怕耽誤自己的功課", "你回家問{who}要不要當小老師，{who}{說幫助同學也是在幫自己，|說只要功課不落後就去做，}{隔天你跑去辦公室跟老師說好。|你當了一學期的小老師，功課反而更好了。}"],
          decline: ["婉拒老師", "下課想去玩", "你跟老師說你不想當，{下課照樣衝去{play}玩，|午休前的時間都留給自己看書，}{老師點點頭，請了別的同學。|你心裡有一點點可惜。}"],
        }) },
        { make: () => ({
          role: duty, prompt: ctx.f("這學期的{duty}沒有人想當，老師說願意當的人下課去找老師。要怎麼辦？", p),
          take: ["下課去找老師說你要當", "總要有人做", y < 1995 ? "你下課去找老師，接下了{duty}，{每天中午提著水桶帶大家擦窗戶，|把掃具櫃整理得整整齊齊，}{你們班拿到了整潔比賽的錦旗。|學期末老師在全班面前誇你負責。}" : "你下課去找老師，接下了{duty}，{每天中午帶著同學做資源回收，|把回收桶分得清清楚楚，}{你們班拿到了整潔比賽的錦旗。|學期末老師在聯絡簿上誇你負責。}", "你接下了{duty}，{每天追著同學去打掃，|垃圾常常倒不完，}{被同學嫌囉唆，|累到回家倒頭就睡，}{你有點後悔，但還是做完了一學期。|學期末才有同學跟你說謝謝。}"],
          vice: ["說可以幫忙，但不當股長", "當組員就好", "你說你可以幫忙，但不想當股長，{每天中午幫忙倒垃圾，|分到擦黑板的工作，}{做得乾乾淨淨。|老師說有你在，{duty}輕鬆多了。}"],
          friend: [ctx.f("拉{mate}一起當", p), "兩個人比較不累", "你拉著{mate}一起去找老師，兩個人一起當{duty}，{每天中午一起去倒垃圾，|一邊掃地一邊聊天，}{原本最討厭的工作變成最好玩的時間。|那學期你們變成了最好的搭檔。}"],
          home: [ctx.f("回家問{who}", p), "聽聽大人的意見", "你回家問{who}，{who}說{自己小時候也當過衛生股長，|做沒人想做的事最了不起，}{隔天你去找老師說你願意。|你想了一個晚上，最後去找老師接了下來。}"],
          decline: ["當作沒聽到", "反正會有人去", "你低著頭當作沒聽到，{最後老師直接用抽籤的，抽到了別人，|過了兩天，班長被老師指派去當，}{你偷偷鬆了一口氣。|看著那位同學每天提著垃圾袋，你有點不好意思。}"],
        }) },
        { make: () => {
          const shop = y < 1990 ? "柑仔店" : "便利商店";
          p.shop = shop;
          return {
            role: "路隊長", prompt: "放學的路隊少了一個路隊長，老師問你要不要舉著小旗子帶隊回家。要怎麼辦？",
            take: ["答應當路隊長", "要顧好大家的安全", "你當了路隊長，每天放學舉著小旗子走在最前面，{過馬路時伸手攔著大家，|一路點名，一個都沒少，}{巷口{shop}的老闆都叫你「小隊長」。|{who}說你走路的樣子越來越像大人。}", "你當了路隊長，{第一天就把隊伍帶錯了一條巷子，|有幾個同學一直脫隊去買零食，}{你急得滿頭大汗。|過了一個星期，你才把大家管好。}"],
            vice: ["說可以走最後面壓隊", "不想走最前面", "你說你可以走在最後面壓隊，{每天幫忙看有沒有人落後，|看到有人鞋帶鬆了就喊停，}{一整個學期一個人都沒走丟。|老師說壓隊的人最重要。}"],
            friend: [ctx.f("推薦{mate}當", p), "住同一個方向的人", "你推薦了{mate}當路隊長，自己走在旁邊，{兩個人一路聊天走回家，|{mate}舉旗，你負責喊口令，}{那是你們每天最期待的一段路。|後來你們連假日都約在路口見面。}"],
            home: [ctx.f("回家問{who}", p), "路上車子多不多", "你回家問{who}，{who}{陪你走了一趟放學的路，教你哪裡要特別小心，|說你長大了，可以試試看，}{隔天你就舉起了小旗子。|你答應了，每天都提早到集合的地方。}"],
            decline: ["推掉，想自己慢慢走", "可以邊走邊看", "你說不想當路隊長，{每天放學照樣在路隊裡慢慢走，|一路踢著石頭回家，}{偶爾還偷看一眼{shop}裡的新零食。|覺得這樣比較自在。}"],
          };
        } },
      ]).make();
      return {
        prompt: sc.prompt,
        options: [
          {
            id: "c_cadre.take", label: sc.take[0], hint: sc.take[1], act: "insist", style: "risk", weight: 0.25,
            apply: (s2, c) => {
              if (!c.roll("study", "good", 0.6)) return { text: c.w(sc.take[3], p), mood: -1 };
              s2.flags.cadre = sc.role; c.remember("c_cadre", c.f("當上了{role}", { role: sc.role }), { mood: 4 });
              return { text: c.w(sc.take[2], p), mood: 4 };
            },
          },
          { id: "c_cadre.vice", label: sc.vice[0], hint: sc.vice[1], act: "wait", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(sc.vice[2], p), mood: 2 }) },
          { id: "c_cadre.friend", label: sc.friend[0], hint: sc.friend[1], act: "socialize", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w(sc.friend[2], p), mood: 2 }) },
          { id: "c_cadre.home", label: sc.home[0], hint: sc.home[1], act: "talk", style: "family", weight: 0.15, apply: (s2, c) => ({ text: c.w(sc.home[2], p), mood: 2 }) },
          { id: "c_cadre.decline", label: sc.decline[0], hint: sc.decline[1], act: "rest", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(sc.decline[2], p), mood: 1 }) },
        ],
      };
    },
  },
  {
    // 被老師誤會：作文被說不像自己寫的、考試撿橡皮擦、東西壞了被指認、上課有人講話（不寫體罰的細節）
    id: "c_misjudged", domain: "study", channel: "bad", once: true, ages: [7, 12], when: s => s.studying && !s.abroad, p: () => 0.04,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), snack = ctx.rng.pick(snackOf(y));
      const wit = (bestFriend(s) || ctx.person({ role: "friend", sex: s.sex, birthYear: s.birthYear })).call;
      const note = y >= 1990 ? "在聯絡簿上寫了一段話給老師" : "寫了一張紙條給老師", call = y >= 1975 ? "打電話跟老師說明" : "親自到學校找老師說明";
      const sc = pickScene(ctx, [
        s.age >= 8 && { make: () => {
          const lead = "你花了兩個晚上寫的作文，老師說不像你寫的，懷疑是大人幫忙";
          return {
            lead,
            explain: ["當場說是自己寫的", "這是你的作文", "{lead}。你當場站起來說是自己寫的，{還把其中一段背了出來，|把塗改得亂七八糟的草稿拿給老師看，}{老師愣了一下，跟你說對不起。|老師點點頭，把分數改了回來。}", "{lead}。你當場說是自己寫的，老師{半信半疑，|只說「好，我知道了」，}{你氣得一整天沒說話。|回家後你把作文簿塞到書包最底層。}"],
            later: ["下課再私下找老師", "不想在全班面前說", "{lead}。下課你到辦公室找老師，{把寫滿塗改的草稿一張一張拿出來，|說你是怎麼想到那些句子的，}{老師說錯怪你了，還在作文上加了一個「佳」。|老師拍拍你的肩膀，說你寫得真好。}"],
            home: [ctx.f("回家告訴{who}", { who }), "請大人幫你說", "{lead}。你回家告訴{who}，{who}{{note}，|{call}，}{誤會總算解開了。|老師後來還在課堂上念了你的作文。}"],
            witness: [ctx.f("請{wit}作證", { wit }), "有人看過你寫", "{lead}。你請{wit}作證，{wit}{跟老師說那幾天下課都看到你在寫，|說你寫到一半還拿草稿來問過意見，}{老師這才相信你。|老師跟你說了一聲對不起。}"],
            prove: ["當著老師的面再寫一篇", "用實力證明", "{lead}。你說可以當著老師的面再寫一篇，{下課十分鐘就寫滿了一頁，|題目是老師當場出的，}{老師看完，把你的作文貼到了布告欄。|從此老師再也不懷疑你。}"],
            swallow: ["算了，不解釋", "反正你知道是自己寫的", "{lead}。你什麼都沒說，{把作文簿收進抽屜，|回家把那篇作文撕了下來，}{後來寫作文都故意寫得普普通通。|那件事你記了好多年。}"],
          };
        } },
        { make: () => {
          const lead = "考試考到一半你彎腰撿橡皮擦，老師以為你在偷看隔壁的考卷，把你的考卷收走了";
          return {
            lead,
            explain: ["當場舉起橡皮擦說明", "你只是在撿東西", "{lead}。你馬上舉起橡皮擦說你只是在撿東西，{老師看了看地上，把考卷還給你，|旁邊的同學也跟著點頭，}{你寫完了考卷，還考了九十幾分。|老師下課特別跟你說了聲抱歉。}", "{lead}。你舉起橡皮擦想解釋，老師說{下課再說，|考完再來辦公室，}{你只好坐著等鐘響，眼淚在眼眶裡打轉。|那一節課好長好長。}"],
            later: ["考完去辦公室說明", "不想打擾大家考試", "{lead}。你忍到考完，才去辦公室找老師，{把事情從頭講了一遍，|說你的橡皮擦滾到了隔壁的椅子下，}{老師讓你在辦公室把考卷寫完。|老師想了一下，說錯怪你了。}"],
            home: [ctx.f("回家告訴{who}", { who }), "請大人去說", "{lead}。你回家告訴{who}，{who}{{note}，|{call}，}{老師讓你把那張考卷重寫一次。|老師後來找你聊了一下，說是誤會一場。}"],
            witness: [ctx.f("請{wit}作證", { wit }), "旁邊的人都看到了", "{lead}。坐你旁邊的{wit}舉手說你真的在撿橡皮擦，{好幾個同學也跟著點頭，|還說你的頭根本沒轉過去，}{老師把考卷還給你，讓你寫完。|老師說謝謝大家說實話。}"],
            prove: ["請老師讓你重考一次", "用分數證明", "{lead}。你請老師讓你重考，{一個人坐在辦公室寫完一整張新的考卷，|老師另外出了一張考卷給你，}{考了九十幾分，老師說錯怪你了。|分數比原本那張還高。}"],
            swallow: ["什麼都不說", "怕越描越黑", "{lead}。你低著頭什麼都沒說，{那一科被扣了好多分，|下課有同學在背後指指點點，}{你委屈了好幾天。|後來考試時，你連橡皮擦掉了都不敢撿。}"],
          };
        } },
        { make: () => {
          const [thing, cause] = ctx.rng.pick([["教室窗戶的玻璃破了", "是一陣大風把窗戶甩上才破的"], ["掃具櫃的門壞了", "門上的螺絲早就鬆了"], [y < 1980 ? "講台上的花瓶破了" : "教室後面的魚缸破了", "是值日生擦桌子時不小心撞到的"]]);
          const lead = ctx.f("{thing}，有同學說是你下課在那裡玩的時候弄的，老師要你留下來", { thing }), shop = y >= 1990;
          return {
            lead, cause,
            explain: ["當場說不是你", "你那時候不在教室", shop ? "{lead}。你當場說你那時候在{福利社|操場|圖書館}，{老師去問了其他同學，|值日生也說你根本不在教室，}{誤會一下子就解開了。|老師拍拍你的肩膀，要你別放在心上。}" : "{lead}。你當場說你那時候在{操場|圖書館}，{老師去問了其他同學，|值日生也說你根本不在教室，}{誤會一下子就解開了。|老師拍拍你的肩膀，要你別放在心上。}", "{lead}。你急著說不是你，可是越急越說不清楚，{老師要你先回去想想，|你還是被留下來寫了一張說明，}{你回家路上一直覺得委屈。|那天的晚飯你吃得很少。}"],
            later: ["等大家走了再說", "冷靜下來再講", shop ? "{lead}。等同學都走了，你才跟老師說那時候你在{福利社|操場|圖書館}，{老師去問了幾個同學，|老師想了想，}{隔天在班上說不是你弄的。|跟你說了聲對不起。}" : "{lead}。等同學都走了，你才跟老師說那時候你在{操場|圖書館}，{老師去問了幾個同學，|老師想了想，}{隔天在班上說不是你弄的。|跟你說了聲對不起。}"],
            home: [ctx.f("回家告訴{who}", { who }), "請大人幫忙說", "{lead}。你回家告訴{who}，{who}{{call}，|陪你一起去找老師，}{老師後來找到了真正的原因。|事情總算弄清楚了。}"],
            witness: [ctx.f("請{wit}作證", { wit }), "下課你們在一起", "{lead}。{wit}跟老師說下課你們一直在{操場打球|走廊跳格子}，{老師這才知道弄錯人了。|說你的那位同學也跟你道了歉。}"],
            prove: ["自己去問清楚", "找出到底怎麼回事", "{lead}。你下課跑去問了好幾個同學，才知道{cause}，{老師聽完，跟你說了對不起。|全班都說你好像偵探。}"],
            swallow: ["認了算了", "不想再吵", "{lead}。你沒有再辯解，{{penalty}，|被留下來把東西收拾好，}{那天回家你一句話都沒說。|過了好久，你才跟{who}說起這件事。}"],
          };
        } },
        { make: () => {
          const lead = "上課時後面有人一直講話，老師回頭剛好看到你轉頭，就在黑板角落寫上了你的名字";
          return {
            lead,
            explain: ["舉手說不是你", "你只是回頭看一下", "{lead}。你舉手說講話的不是你，{後面的同學低著頭承認了，|老師看了看全班，想了一下，}{把你的名字擦掉了。|說下次會看清楚。}", "{lead}。你舉手說不是你，老師說{上課不要頂嘴，|下課再說，}{你的名字在黑板上掛了一整天。|你氣得一整節課都聽不進去。}"],
            later: ["下課再跟老師說", "私下講比較好", "{lead}。下課你去找老師，{說你只是回頭看後面的時鐘，|說你是聽到聲音才轉頭的，}{老師點點頭，把你的名字擦掉了。|老師說謝謝你來說清楚。}"],
            home: [ctx.f("回家告訴{who}", { who }), "說你好委屈", "{lead}。你回家告訴{who}，{who}{聽完摸摸你的頭，說你沒做錯事就好，|{note}，}{你心裡好過了一點。|隔天老師找你聊了一下，說是誤會一場。}"],
            witness: ["請後面的同學出來說", "講話的人不是你", "{lead}。你轉頭看著後面那兩個同學，{其中一個紅著臉舉手承認了，|兩個人互看了一眼，最後站起來說是他們，}{老師把你的名字擦掉了。|下課他們請你吃了一包{snack}。}"],
            prove: ["之後每堂課都坐得端端正正", "讓老師自己看", "{lead}。你沒有多說，{之後每一堂課都坐得端端正正，|上課抄筆記抄得比誰都認真，}{一個星期後，老師在班上誇你最專心。|老師後來私下跟你說，那天可能看錯了。}"],
            swallow: ["算自己倒楣", "不想多說", "{lead}。你嘆了一口氣，什麼都沒說，{下課被叫去{scold}，|那節下課不能出去玩，}{心裡悶了一整天。|後來你上課都不敢再回頭。}"],
          };
        } },
      ]).make();
      const v = { lead: sc.lead, who, wit, note, call, snack, cause: sc.cause, penalty: y < 2006 ? "被罰站了一節課" : "被留下來寫了一張悔過書", scold: y < 2006 ? "走廊罰站" : "辦公室聽了一頓訓" };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead: sc.lead }),
        options: [
          { id: "c_misjudged.explain", label: sc.explain[0], hint: sc.explain[1], act: "insist", style: "risk", weight: 0.2, apply: (s2, c) => (c.roll("study", "good", 0.55) ? { text: c.w(sc.explain[2], v), mood: 2 } : { text: c.w(sc.explain[3], v), mood: -2 }) },
          { id: "c_misjudged.later", label: sc.later[0], hint: sc.later[1], act: "talk", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(sc.later[2], v), mood: 1 }) },
          { id: "c_misjudged.home", label: sc.home[0], hint: sc.home[1], act: "seekHelp", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(sc.home[2], v), mood: 1 }) },
          { id: "c_misjudged.witness", label: sc.witness[0], hint: sc.witness[1], act: "seekHelp", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(sc.witness[2], v), mood: 1 }) },
          { id: "c_misjudged.prove", label: sc.prove[0], hint: sc.prove[1], act: "study", style: "learn", weight: 0.1, apply: (s2, c) => ({ text: c.w(sc.prove[2], v), mood: 2 }) },
          { id: "c_misjudged.swallow", label: sc.swallow[0], hint: sc.swallow[1], act: "pushThrough", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w(sc.swallow[2], v), mood: -3 }) },
        ],
      };
    },
  },
  {
    // 不小心弄壞同學的東西：借來的玩具（依年代）、打掃時撞倒的勞作、走廊上撞掉的眼鏡或水壺、借來的文具
    id: "c_broke", domain: "wealth", channel: "bad", once: true, ages: [6, 12], when: s => s.studying && !s.abroad, p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), snack = ctx.rng.pick(snackOf(y)), glue = y < 1975 ? "漿糊" : "三秒膠", shop = y < 1990 ? "柑仔店" : "福利社";
      // the apology; {how} is how it starts in each scene
      const sorry = () => ["馬上跟同學道歉", "說清楚是你不小心", "{lead}。{how}{說是你不小心的，|一直說對不起，}{同學愣了一下，說沒關係。|同學紅著眼睛，還是點了點頭。}{後來你們又一起玩了。|從此你借東西都特別小心。}"];
      const sc = pickScene(ctx, [
        { make: () => {
          const [toy, broke, mend] = brokenToy(y, ctx), lead = ctx.f("你跟同學借了{toy}回家玩，結果{broke}", { toy: padIn(ctx, toy), broke });
          return {
            lead, mend, how: "隔天你一到學校就跟同學道歉，", sorry: sorry(),
            pay: ["用零用錢賠一個", "存幾個星期也要賠", "{lead}。你存了{兩|三}個星期的零用錢，{買了新的賠給同學，|錢不夠，{who}幫你補了一半，買了新的賠給同學，}{那幾個星期你連{snack}都沒買。|同學後來把新的借你玩了好幾次。}"],
            fix: ["自己想辦法修好", "說不定修得好", "{lead}。你{mend}，{居然修得看不太出來，|修好以後還多貼了一張貼紙，}{同學拿回去時還誇你手巧。|你把修理的經過講給同學聽，同學笑了。}", "{lead}。你{mend}，{結果越弄越糟，|弄到半夜還是不行，}{最後還是老老實實跟同學道歉。|只好拿著它去跟同學說對不起。}"],
            home: [ctx.f("回家跟{who}說", { who }), "請大人幫忙處理", "{lead}。你回家跟{who}說了，{who}{陪你去同學家道歉，|帶你去店裡買了新的賠給同學，}{還多帶了一盒餅乾。|回家路上跟你說，做錯事要自己說出口。}"],
            hide: ["先藏起來，說還沒玩完", "拖一天算一天", "{lead}。你把它藏在書包最底層，跟同學說還沒玩完，{同學問了好幾天，你心虛得吃不下飯，最後還是說了出來。|拖了一個星期，同學自己猜到了，好幾天不跟你說話。}"],
          };
        } },
        { make: () => {
          const lead = y < 1985 ? ctx.w("打掃時你拿著掃把一轉身，撞倒了同學放在教室後面的勞作，一艘竹筷子做的船斷成了兩截") : ctx.w("打掃時你拿著掃把一轉身，撞倒了同學放在教室後面的勞作，{一座紙黏土城堡塌了一角|一台紙盒機器人的手臂掉了}");
          return {
            lead, how: "你馬上跑去跟同學道歉，", sorry: sorry(),
            pay: ["用零用錢買材料賠", "陪同學重做一個", "{lead}。你用零用錢買了{{stuff}和顏料|新的材料}，{陪同學花了兩個下午重做，|放學留下來幫忙補好，}{同學說新的比原本的還好看。|那幾個星期你連{snack}都沒買。}"],
            fix: [ctx.f("用{glue}黏回去", { glue }), "趁上課前修好", "{lead}。你趁上課前用{glue}一點一點黏回去，{居然看不太出來，|還順手把掉色的地方補上了，}{同學看了說沒關係。|老師說你很有責任感。}", "{lead}。你趁上課前用{glue}想黏回去，{結果越黏越歪，|{glue}沾得到處都是，}{最後還是老老實實跟同學道歉。|只好紅著臉跟同學說對不起。}"],
            home: [ctx.f("回家跟{who}說", { who }), "請大人幫忙處理", "{lead}。你回家跟{who}說了，{who}{陪你去跟同學和老師道歉，|要你寫一張道歉的卡片給同學，}{還讓你帶了一盒餅乾去。|跟你說做錯事要自己說出口。}"],
            hide: ["假裝不知道", "反正沒人看到", "{lead}。你趕快把它擺回原位，假裝不知道，{同學發現時哭了，你心虛得一整天都不敢看同學，第二天還是說了出來。|老師在班上問是誰弄的，你心裡一直怦怦跳，最後還是舉手承認了。}"],
          };
        } },
        { make: () => {
          const glasses = ctx.rng() < 0.5, item = glasses ? "眼鏡" : "水壺";
          const lead = ctx.f("下課在走廊跑，你撞到了同學，{what}", { what: glasses ? "同學的眼鏡掉在地上，鏡腳斷了" : y < 1990 ? "同學的鋁製水壺摔凹了一大塊" : "同學的水壺摔裂了" });
          return {
            lead, item,
            sorry: ["馬上扶起同學道歉", "先看看對方有沒有事", "{lead}。你趕快扶起同學，一直說對不起，{還陪同學去保健室看有沒有受傷，|幫忙把東西撿起來，}{同學說沒關係，下次小心就好。|後來你在走廊上再也不敢用跑的。}"],
            pay: ["說要賠修理的錢", "用存了好久的零用錢", "{lead}。你把存了好久的零用錢拿出來，說要賠{item}，{同學的家長只收了一半，說你很誠實，|同學說家裡會處理，只收下了你的心意，}{你還是覺得應該的。|那幾個星期你連{snack}都沒買。}"],
            fix: glasses ? ["陪同學去眼鏡行修", "說不定換個零件就好", "{lead}。你放學陪同學去眼鏡行，{老闆說換一根鏡腳就好，|老闆幾分鐘就把鏡腳裝回去了，}{你用零用錢付了錢。|同學戴上眼鏡，跟你說沒事了。}", "{lead}。你放學陪同學去眼鏡行，老闆說整副都要換，{你只好回家跟{who}說，|你看著價錢，不知道該怎麼辦，}{最後是兩家的大人一起處理的。|你跟同學說了好多次對不起。}"]
              : ["自己想辦法弄好", "說不定還能用", "{lead}。你{dent}，{雖然不太好看，還能用。|同學笑著說這樣比較有個性。}", "{lead}。你{dentTry}，{結果越弄越糟，|還是一直漏水，}{最後{who}帶你去買了一個新的賠給同學。|只好老老實實跟同學說對不起。}"],
            home: [ctx.f("回家跟{who}說", { who }), "請大人幫忙處理", y >= 1975 ? "{lead}。你回家跟{who}說了，{who}{打電話給同學的家長道歉，說會賠修理的錢，|隔天陪你去同學家道歉，}{還讓你帶了一盒餅乾去。|跟你說做錯事要自己說出口。}" : "{lead}。你回家跟{who}說了，{who}{去找同學的家長道歉，說會賠修理的錢，|隔天陪你去同學家道歉，}{還讓你帶了一盒餅乾去。|跟你說做錯事要自己說出口。}"],
            hide: ["趕快跑走", "假裝不是你撞的", "{lead}。你嚇得趕快跑走，{一整節課都不敢回頭，|躲在廁所等到上課鐘響，}{後來還是去跟同學道歉了。|下課同學跑來找你，你只好紅著臉說對不起。}"],
          };
        } },
        { make: () => {
          const [pen, broke] = y < 1980 ? ["鋼筆", "一不小心把筆尖壓歪了"] : y < 2000 ? ["自動鉛筆", "一不小心坐在上面，筆管裂了"] : ["一盒彩色筆", "一不小心把好幾支的筆頭壓扁了"];
          const lead = ctx.f("你借了同學的{pen}，{broke}", { pen, broke });
          return {
            lead, how: "你拿著它去跟同學道歉，", sorry: sorry(),
            pay: ["用零用錢買新的賠", "不能讓同學吃虧", "{lead}。你用零用錢去{shop}買了新的賠給同學，{那幾天你連{snack}都沒買。|同學說新的比原本的還好用。}"],
            fix: ["自己想辦法修好", "說不定還能用", "{lead}。你{用指甲一點一點把它弄回原樣，|拿膠帶小心地纏好，}{同學說還能用。|居然看不太出來。}", "{lead}。你想自己修，{結果越修越糟，|弄得滿手都是墨水，}{最後還是老老實實跟同學道歉。|只好拿著它去跟同學說對不起。}"],
            home: [ctx.f("回家跟{who}說", { who }), "請大人幫忙處理", "{lead}。你回家跟{who}說了，{who}{帶你去文具店買了新的，|陪你想好要怎麼跟同學說，}{隔天你連同一張道歉的小卡片一起交給同學。|跟你說做錯事要自己說出口。}"],
            hide: ["偷偷放回去", "說不定沒發現", "{lead}。你把它偷偷放回同學的鉛筆盒，{同學發現時一直問是誰弄的，你心虛得吃不下飯，第二天還是說了出來。|同學一直沒發現，可是你每次看到那個同學就心虛。}"],
          };
        } },
      ]).make();
      const v = {
        lead: sc.lead, how: sc.how, mend: sc.mend, item: sc.item, who, snack, glue, shop, stuff: y >= 1985 ? "紙黏土" : "竹筷子",
        dent: y < 1990 ? "借了一把槌子，把凹下去的地方一點一點敲回來" : "用膠帶把裂縫纏得緊緊的", dentTry: y < 1990 ? "借了一把槌子想把凹下去的地方敲回來" : "用膠帶想把裂縫纏起來",
      };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead: sc.lead }),
        options: [
          { id: "c_broke.sorry", label: sc.sorry[0], hint: sc.sorry[1], act: "talk", style: "social", weight: 0.3, apply: (s2, c) => ({ text: c.w(sc.sorry[2], v), mood: 0 }) },
          { id: "c_broke.pay", label: sc.pay[0], hint: sc.pay[1], act: "save", style: "safe", weight: 0.2, apply: (s2, c) => { s2.savings = Math.max(0, s2.savings - 0.002); return { text: c.w(sc.pay[2], v), mood: 0 }; } },
          { id: "c_broke.fix", label: sc.fix[0], hint: sc.fix[1], act: "hobby", style: "learn", weight: 0.15, apply: (s2, c) => (c.rng() < 0.6 ? { text: c.w(sc.fix[2], v), mood: 1 } : { text: c.w(sc.fix[3], v), mood: -1 }) },
          { id: "c_broke.home", label: sc.home[0], hint: sc.home[1], act: "seekHelp", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(sc.home[2], v), mood: 0 }) },
          { id: "c_broke.hide", label: sc.hide[0], hint: sc.hide[1], act: "avoid", style: "risk", weight: 0.15, apply: (s2, c) => ({ text: c.w(sc.hide[2], v), mood: -2 }) },
        ],
      };
    },
  },
  {
    // 撿到錢：路上的錢包、店門口的紙鈔、教室裡的班費、公園裡的手機（2012 年起）；金額依年代
    id: "c_found", domain: "wealth", channel: "good", once: true, ages: [7, 12], when: s => !s.abroad, p: () => 0.035,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), snack = ctx.rng.pick(snackOf(y)), buy = ctx.rng.pick(kidsCulture(y).buy), drink = y < 1975 ? "彈珠汽水" : y < 1995 ? "汽水" : "飲料";
      const sc = pickScene(ctx, [
        { make: () => {
          const cash = y < 1965 ? "幾十塊錢" : y < 1980 ? "好幾百塊" : y < 2000 ? "好幾千塊" : "一疊千元鈔票";
          const lead = ctx.w("回家路上，你在{騎樓下|公車站牌旁|巷口的電線桿下}撿到一個錢包，裡面有{cash}和{card}", { cash, card: y >= 1980 ? "一張名片" : "一張身分證" });
          return {
            lead,
            hand: ["送到派出所", "交給警察處理", "{lead}。你把錢包送到派出所，{值班的警察幫你填了一張單子，|警察伯伯摸摸你的頭，}{幾天後失主寄了一張謝卡到你家。|朝會時校長在司令台上表揚你拾金不昧。}"],
            wait: ["在原地等失主回來", "失主一定很著急", "{lead}。你站在原地等了{半個小時|快一個小時}，{一位阿姨急急忙忙跑回來，|一位阿伯一路低著頭找回來，}{一直跟你道謝，還塞給你一顆糖。|說裡面有要繳的錢，差點急哭了。}"],
            search: [y >= 1980 ? "照名片上的電話打過去" : "照身分證上的地址送回去", "自己找到失主", y >= 1980 ? "{lead}。你回家照著名片上的號碼打過去，{電話那頭的叔叔一直說謝謝，|失主半個小時後就趕來了，}{還請你喝了一瓶{drink}。|說要寫信到學校謝謝你。}" : "{lead}。你照著身分證上的地址，{一條巷子一條巷子找，|問了好幾個路人，}{終於找到那戶人家，開門的阿嬤一直說你是好孩子。|失主請你喝了一瓶{drink}。}"],
            home: [ctx.f("拿回家交給{who}", { who }), "大人比較知道怎麼辦", "{lead}。你把錢包拿回家交給{who}，{who}{帶著你一起送到派出所，|照著裡面的資料聯絡上了失主，}{失主後來送了一盒水果來家裡。|{who}說你做得很對。}"],
            keep: ["偷偷留下來", "反正沒人看到", "{lead}。你把錢包塞進書包，{一整個晚上都睡不著，|吃晚飯時一直不敢看{who}，}{隔天一早還是把它送到了派出所。|最後還是拿出來交給了{who}。}", "{lead}。你把錢包裡的錢偷偷留下來，買了{buy}，{可是每次玩的時候心裡都怪怪的。|後來那個空錢包一直塞在抽屜最裡面，你再也不想看到它。}"],
          };
        } },
        { make: () => {
          const shop = y < 1990 ? "柑仔店" : ctx.rng.pick(["福利社", "便利商店"]), keeper = shop === "福利社" ? "福利社的阿姨" : shop === "便利商店" ? "店員" : "柑仔店的老闆";
          const lead = ctx.f("你在{shop}門口撿到{bill}，四周都沒有人在找", { shop, bill: y < 1965 ? "一張五塊錢" : y < 1985 ? "一張五十塊" : y < 2000 ? "一張一百塊" : "一張五百塊" });
          return {
            lead, shop, keeper, till: shop === "柑仔店" ? "放錢的鐵盒" : "收銀機",
            hand: [ctx.f("交給{keeper}", { keeper }), "失主也許會回來找", "{lead}。你把錢交給{keeper}，{{keeper}把它收在{till}旁邊，說有人來找就還給對方，|{keeper}誇你誠實，}{第二天真的有人回來找。|從此{keeper}每次看到你都笑咪咪的。}"],
            wait: ["在門口等一下", "失主可能就在附近", "{lead}。你在門口等了一會兒，{一個小朋友哭著走回來，|一位阿伯急急忙忙走回來，低著頭在地上找，}{你把錢還給對方，對方一直說謝謝。|看到你手上的錢，對方鬆了一大口氣。}"],
            search: ["問問附近的人是誰掉的", "大聲問一圈", "{lead}。你拿著錢問了一圈是誰掉的，{一個大姊姊說是她剛剛買東西時掉的，|問到第三個人才找到失主，}{對方高興得一直說謝謝。|你回家後興奮地講了一整晚。}"],
            home: [ctx.f("帶回家問{who}", { who }), "不知道該怎麼辦", "{lead}。你把錢帶回家問{who}，{who}{陪你回去把錢交給{keeper}，|說找不到失主的話，就拿去廟裡添香油錢，}{你覺得心裡踏實多了。|{who}說你是個誠實的孩子。}"],
            keep: ["收進口袋", "撿到就是你的", "{lead}。你把錢收進口袋，{who}{發現你多了錢，問清楚以後，|晚上問你錢是哪裡來的，}{帶你回去交給了{keeper}。|陪你一起把錢送回{shop}。}", "{lead}。你把錢收進口袋，買了一大包{snack}，{可是吃起來沒有想像中好吃。|後來你每次經過{shop}，心裡都怪怪的。}"],
          };
        } },
        s.studying && { make: () => {
          const lead = ctx.f(y >= 1990 ? "午休時，你在教室地上撿到一個小錢包，裡面有{inside}，好像是同學要交的班費" : "下課時，你在教室地上撿到一個小錢包，裡面有{inside}，好像是同學要交的班費", { inside: y < 1970 ? "幾個銅板" : "一些零錢和摺好的紙鈔" });
          return {
            lead,
            hand: ["交給老師", "老師會找到主人", "{lead}。你把錢包交給老師，{老師在班上問了一下，原來是坐在後面的同學掉的，|老師一下子就找到了主人，}{那位同學下課請你吃了一包{snack}。|{praised}}"],
            wait: ["放回原處，等主人回來找", "主人會回來找", "{lead}。你把錢包放回原來的地方，坐在旁邊等，{沒多久一個同學慌慌張張地跑回來，|鐘響前，一個同學低著頭一路找回來，}{看到錢包，那位同學鬆了一口氣，一直跟你說謝謝。|你們從那天起變成了朋友。}"],
            search: ["一個一個問是誰掉的", "自己找到主人", "{lead}。你拿著錢包一排一排問，{問到第三排才找到主人，|最後在走廊找到急著翻書包的同學，}{那位同學差點哭出來，一直跟你說謝謝。|後來你們變成了好朋友。}"],
            home: [ctx.f("帶回家問{who}", { who }), "怕被誤會是你拿的", "{lead}。你怕被誤會，把錢包帶回家問{who}，{who}{說明天一早就要交給老師，|陪你一起寫了一張紙條給老師，}{隔天老師找到了主人，還誇你想得周到。|主人拿回錢包，一直跟你道謝。}"],
            keep: ["偷偷收起來", "反正沒人看到", "{lead}。你偷偷把錢包收進書包，{結果那位同學急得在班上哭了，|下午老師在班上問是誰撿到了錢包，}{你心裡好難受，趕快舉手說是你撿到的。|你心裡好難受，下課偷偷放回了那位同學的抽屜。}", "{lead}。你偷偷把錢包收進書包，{一整個下午都心神不寧，|上課一直偷看那位同學，}{放學前還是偷偷放回了那位同學的抽屜。|最後還是交給了老師，說是剛剛撿到的。}"],
          };
        } },
        y >= 2012 && { w: 0.8, make: () => {
          const lead = "你在公園的溜滑梯下撿到一支手機，螢幕上一直跳出「媽媽」的來電";
          return {
            lead,
            hand: ["送到附近的派出所", "交給警察", "{lead}。你把手機送到附近的派出所，{警察接起電話，請失主來領，|值班的警察誇你很懂事，}{失主是一位國中生，來的時候一直鞠躬道謝。|朝會時校長在台上表揚了你。}"],
            wait: ["坐在原地等失主回來", "失主一定會回來找", "{lead}。你坐在溜滑梯旁邊等，{十分鐘後，一個大哥哥滿頭大汗地跑回來，|過了一會兒，一位阿姨一路找了回來，}{你把手機還給對方，對方一直說謝謝。|對方說手機裡有好多照片，差點急死了。}"],
            search: ["接起電話", "跟打來的人說手機在你這裡", "{lead}。你鼓起勇氣接起電話，說手機是在公園撿到的，{電話那頭的媽媽一直說謝謝，|對方說女兒馬上就過來拿，}{十分鐘後，一個姊姊跑來拿走手機，還送你一瓶飲料。|你覺得自己做了一件很大的事。}"],
            home: [ctx.f("拿回家給{who}", { who }), "大人比較知道怎麼辦", "{lead}。你把手機拿回家交給{who}，{who}{接起下一通電話，約了失主在公園門口見面，|陪你把手機送到派出所，}{失主送了你一盒巧克力。|{who}說你做得很好。}"],
            keep: ["先偷偷玩一下", "裡面有好多遊戲", "{lead}。你忍不住打開來玩了一下遊戲，{手機又響了，你嚇得趕快接起來，|被路過的阿姨看到，問你是不是你的，}{最後還是把手機還給了失主。|你紅著臉把手機交了出去。}", "{lead}。你忍不住打開來玩了一下遊戲，{玩到一半手機沒電了，|一抬頭天都快黑了，}{你嚇得趕快把手機送到派出所。|心裡一直怪怪的，隔天就拿去交給了警察。}"],
          };
        } },
      ]).make();
      const v = { lead: sc.lead, who, snack, buy, drink, shop: sc.shop, keeper: sc.keeper, till: sc.till, praised: y >= 1990 ? "老師在聯絡簿上寫了一句誇你的話。" : "老師在全班面前誇你誠實。" };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead: sc.lead }),
        options: [
          { id: "c_found.hand", label: sc.hand[0], hint: sc.hand[1], act: "seekHelp", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w(sc.hand[2], v), mood: 3 }) },
          { id: "c_found.wait", label: sc.wait[0], hint: sc.wait[1], act: "wait", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(sc.wait[2], v), mood: 3 }) },
          { id: "c_found.search", label: sc.search[0], hint: sc.search[1], act: "talk", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w(sc.search[2], v), mood: 3 }) },
          { id: "c_found.home", label: sc.home[0], hint: sc.home[1], act: "seekHelp", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(sc.home[2], v), mood: 2 }) },
          { id: "c_found.keep", label: sc.keep[0], hint: sc.keep[1], act: "save", style: "self", weight: 0.2, apply: (s2, c) => (c.rng() < 0.7 ? { text: c.w(sc.keep[2], v), mood: -1 } : { text: c.w(sc.keep[3], v), mood: -2 }) },
        ],
      };
    },
  },
  {
    // 考差了，考卷、成績單或聯絡簿要給家長簽名（成績單蓋家長的印章，是很多人共同的回憶）
    id: "c_testSign", domain: "study", channel: "bad", once: true, ages: [8, 12], when: s => s.studying && !s.abroad, p: () => 0.04,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), f = bestFriend(s), mate = f ? f.call : "隔壁的同學", old = olderSibs(s);
      const ally = old.length ? siblingCall(ctx.rng.pick(old)) : who !== "阿嬤" ? "阿嬤" : null;
      const subject = ctx.rng.pick(["數學", "國語", y >= 2005 ? "英文" : "自然"]), tv = y >= 1965 ? "看電視" : "出去玩";
      const sc = pickScene(ctx, [
        { make: () => ({ paper: "考卷", lead: ctx.f("{subject}考卷發回來，你只考了{score}分，老師說要拿回家給家長簽名", { subject, score: ctx.rng.pick(["五十八", "四十六", "三十九"]) }) }) },
        { make: () => ({ paper: "成績單", card: true, stamp: y < 2005, lead: ctx.f("學期末發了成績單，{result}，成績單要{sign}", { result: y < 2000 ? "你的名次掉到了全班倒數幾名" : ctx.f("你的{subject}拿了「待加強」", { subject }), sign: y < 2005 ? "蓋家長的印章" : "給家長簽名" }) }) },
        y >= 1990 && { make: () => ({ paper: "聯絡簿", lead: ctx.f("老師在聯絡簿上用紅筆寫著你{subject}小考不及格，要家長簽名", { subject }) }) },
      ]).make();
      const { lead, paper } = sc, done = sc.stamp ? "蓋了章" : "簽了名", crooked = sc.stamp ? "印章蓋得歪歪的" : "名字簽得歪歪扭扭的";
      const forgeDo = sc.stamp ? ctx.f("趁{who}不在，偷偷拿出印章蓋了下去", { who }) : ctx.f("練了好幾遍{who}的簽名，自己簽了上去", { who });
      const v = {
        lead, paper, who, ally, mate, done, crooked, forgeDo, tv, review: sc.card ? "陪你把每一科的分數看了一遍。" : "陪你把錯的地方一題一題看過。",
        summon: y >= 1975 ? "打電話到家裡" : "請家長到學校一趟", after: y >= 1965 ? "看完電視" : "洗完澡",
      };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "c_testSign.honest", label: sc.stamp ? ctx.f("直接拿給{who}蓋章", { who }) : ctx.f("直接拿給{who}簽名", { who }), hint: "早點說早點結束", act: "talk", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w("{lead}。你一回家就把{paper}拿給{who}，{who}{看了很久，嘆了一口氣，|皺著眉頭，}{還是{done}，說下次要加油。|{review}|罰你一個星期不能{tv}。}", v), mood: -1 }) },
          {
            id: "c_testSign.forge", label: sc.stamp ? "偷蓋家裡的印章" : ctx.f("模仿{who}的簽名", { who }), hint: "說不定看不出來", act: "avoid", style: "risk", weight: 0.15,
            apply: (s2, c) => (c.rng() < 0.5
              ? { text: c.w("{lead}。你{forgeDo}，{老師一眼就看出不對，|可是{crooked}，老師一看就知道，}{{summon}，你被罵得更慘。|{who}知道以後，比看到分數還生氣。}", v), mood: -4 }
              : { text: c.w("{lead}。你{forgeDo}，老師沒有發現，{可是你心虛了好幾天，|每次{who}問起學校的事，你都不敢看{who}的眼睛，}{下一次考試你讀得特別用功。|後來你還是自己跟{who}說了。}", v), mood: -1 }),
          },
          { id: "c_testSign.ally", label: ctx.f("先拿給{ally}看", { ally: String(ally) }), hint: "請人幫你說好話", act: "seekHelp", style: "family", weight: 0.2, when: () => !!ally, apply: (s2, c) => ({ text: c.w("{lead}。你先拿給{ally}看，{ally}{陪你一起拿給{who}，|幫你在{who}面前說了好多好話，}{{who}只說了一句「下次加油」就{done}。|{who}嘆了一口氣，還是{done}。}", v), mood: 0 }) },
          {
            id: "c_testSign.fix", label: sc.card ? "先寫好下學期的讀書計畫" : "先訂正好再拿", hint: "讓家人看到你有在努力", act: "study", style: "learn", weight: 0.2,
            apply: (s2, c) => ({ text: c.w(sc.card
              ? "{lead}。你先寫了一張下學期的讀書計畫，{把每天要讀的科目排得清清楚楚，|貼在書桌前面，}再拿給{who}。{{who}看了，摸摸你的頭說好。|{who}{done}，說會陪你一起照著做。}"
              : "{lead}。你先把錯的地方一題一題訂正，{還在旁邊寫上為什麼錯，|不會的題目跑去問了{mate}，}再拿給{who}。{{who}看你這麼認真，沒有多罵。|{who}{done}，在旁邊多寫了一句「加油」。}", v), mood: 1 }),
          },
          { id: "c_testSign.timing", label: ctx.f("等{who}心情好再拿", { who }), hint: "吃完晚飯再說", act: "wait", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。你一直等到{吃完晚飯，|{who}{after}，}才拿出{paper}，{結果{who}還是發了一頓脾氣。|{who}心情不錯，只說下次要注意。|拖到太晚，隔天早上{who}趕著出門，{crooked}。}", v), mood: 0 }) },
        ],
      };
    },
  },
  {
    // 兄弟姊妹弄壞了東西，誰背黑鍋（東西依年代）：弟弟妹妹求你別說、哥哥姊姊要你保密、大人以為是你
    id: "c_sibBlame", domain: "family", channel: "bad", tags: ["siblings"], about: "siblings", once: true, ages: [6, 12],
    when: s => !s.abroad && (olderSibs(s).length > 0 || youngerSibs(s, 4).length > 0), p: () => 0.05,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), old = olderSibs(s), young = youngerSibs(s, 4), snack = ctx.rng.pick(snackOf(y)), tv = y >= 1965 ? "看電視" : "出去玩";
      // what broke, and how two children would try to mend it
      const [thing, fixHow] = ctx.rng.pick(y < 1965 ? [["阿公的茶壺", "用漿糊把裂縫黏起來"], ["神明桌上的花瓶", "用漿糊把碎片黏回去"], ["家裡的收音機", "把它拆開來修"]]
        : y < 1985 ? [["電視的轉台旋鈕", "拿鉗子夾著轉台"], ["神明桌上的花瓶", "用三秒膠把碎片黏回去"], ["家裡的收音機", "把它拆開來修"]]
        : y < 2005 ? [["錄放影機", "把它拆開來修"], ["客廳的魚缸", "用膠帶把裂縫貼起來"], ["客廳的花瓶", "用三秒膠把碎片黏回去"]]
        : [["平板的螢幕", "貼一張新的保護貼蓋住裂痕"], ["遊戲機的手把", "把它拆開來修"], ["客廳的花瓶", "用三秒膠把碎片黏回去"]]);
      const fix = (label, hint) => [label, hint, "{lead}。你和{sib}{fixHow}，{居然看不太出來，|放回原位時兩個人的手都在抖，}{到現在{who}都還不知道。|那成了你們兩個人的祕密。}", "{lead}。你和{sib}想{fixHow}，{結果越弄越糟，|才放回去沒多久就被看出來了，}{兩個人一起被罵了一頓。|{who}說，弄壞了不說比弄壞還嚴重。}"];
      const sc = pickScene(ctx, [
        young.length && { make: () => {
          const sib = siblingCall(ctx.rng.pick(young)), p = { sib, who, thing }, lead = ctx.f("{sib}在客廳玩球，把{thing}弄壞了，拉著你的衣角拜託你不要說", p);
          return {
            lead, sib, gift: y < 1975 ? "尪仔標" : "貼紙",
            tell: [ctx.f("跟{who}說是{sib}弄的", p), "誰弄的就是誰", "{lead}。{who}一回家，你就說是{sib}弄的，{{sib}被罰站在牆角，一直瞪著你。|{sib}被唸了一頓，哭得好大聲。}{晚上你偷偷分了一半的{snack}給{sib}。|兩個人冷戰了一天，隔天又玩在一起了。}"],
            cover: ["說是你弄的", ctx.f("{sib}還小，你來扛", p), "{lead}。你跟{who}說是你弄的，{被罰一個星期不能{tv}，|被唸了一整個晚上，}{{sib}偷偷把最喜歡的{gift}送給你。|那天晚上{sib}抱著你說謝謝。}"],
            urge: [ctx.f("陪{sib}去跟{who}說", p), "一起去比較不怕", "{lead}。你牽著{sib}去跟{who}說，{{sib}一邊哭一邊說對不起，|你站在旁邊幫忙說明，}{{who}看兩個人這麼誠實，只說下次要小心。|{who}沒有罵人，三個人一起把東西收拾好。}"],
            fix: fix(ctx.f("和{sib}偷偷修好", p), "說不定大人不會發現"),
            deal: ["答應保密，但有條件", ctx.f("{sib}以後玩具都要先讓你玩", p), "{lead}。你答應保密，條件是{sib}以後玩具都要先讓你玩，{{sib}乖乖照做了一個禮拜，|{sib}嘟著嘴答應了，}{結果第三天{who}就自己發現了，兩個人一起被罵。|事情一直沒被發現，你們又多了一個祕密。}"],
          };
        } },
        old.length && { make: () => {
          const sib = siblingCall(ctx.rng.pick(old)), p = { sib, who, thing }, lead = ctx.f("{sib}趁大人不在，把{thing}弄壞了，警告你不准說出去", p);
          return {
            lead, sib,
            tell: [ctx.f("跟{who}說是{sib}弄的", p), "不想跟著一起被罵", "{lead}。你還是跟{who}說了，{{sib}被罵了一頓，好幾天不跟你說話。|{sib}被罰洗一個禮拜的碗，一邊洗一邊瞪你。}{後來{sib}自己也說，是該說出來。|過了幾天，兩個人又和好了。}"],
            cover: [ctx.f("幫{sib}扛下來", p), "說是你弄的", "{lead}。{who}問起時，你說是你弄的，{被罵了一整個晚上，|被罰一個星期不能{tv}，}{{sib}偷偷把零用錢塞給你。|從那天起，{sib}走到哪裡都罩著你。}"],
            urge: [ctx.f("勸{sib}自己去說", p), "自己說比較不會被罵", "{lead}。你勸{sib}自己去說，{{sib}猶豫了好久，終於去跟{who}認錯，|你陪{sib}一起站在{who}面前，}{{who}說敢承認就好。|{who}只罰{sib}幫忙打掃，沒有多罵。}"],
            fix: fix(ctx.f("幫{sib}一起修好", p), "趁大人回家前"),
            deal: ["答應保密，換一個條件", ctx.f("{sib}要幫你洗一個禮拜的碗", p), "{lead}。你答應保密，條件是{sib}要幫你洗一個禮拜的碗，{{sib}咬著牙答應了，|{sib}瞪了你一眼，還是點了頭，}{結果第三天{who}就自己發現了，兩個人一起被罵。|事情一直沒被發現，那個禮拜的碗都是{sib}洗的。}"],
          };
        } },
        { make: () => {
          const x = ctx.rng.pick([...old, ...young]), sib = siblingCall(x), favor = x.older ? "幫你洗一個禮拜的碗" : "把最喜歡的玩具借你玩一個禮拜";
          const punish = x.older ? "洗一個禮拜的碗" : ctx.f("一個星期不能{tv}", { tv }), p = { sib, who, thing }, lead = ctx.f("{thing}壞了，{who}一回家就問是不是你弄的，其實是{sib}", p);
          return {
            lead, sib, favor, punish, blamed: true,
            tell: [ctx.f("說出是{sib}弄的", p), "不想背黑鍋", "{lead}。你說是{sib}弄的，{{sib}紅著臉承認了，{who}跟你說錯怪你了。|{who}看看你、又看看{sib}，最後罰{sib}{punish}。}"],
            cover: ["認了算了", ctx.f("不想害{sib}被罵", p), "{lead}。你低著頭認了，{被唸了好久，|被罰一個星期不能{tv}，}{{sib}晚上偷偷跑來跟你說對不起。|後來{who}知道了真相，摸摸你的頭，什麼也沒說。}"],
            urge: [ctx.f("等{sib}自己承認", p), "給對方一個機會", "{lead}。你沒有說話，只是看著{sib}，{{sib}終於低著頭說是自己弄的，|過了一會兒，{sib}小聲地承認了，}{{who}說兩個人都很誠實，誰都沒罰。|{who}說下次要早點說。}"],
            fix: ["說你們會想辦法修好", "先修再說", "{lead}。你說你會和{sib}一起想辦法，兩個人{fixHow}，{{who}看你們這麼認真，氣也消了。|雖然沒有完全修好，{who}還是笑了。}", "{lead}。你說你會和{sib}一起想辦法，兩個人{fixHow}，{結果越弄越糟，|弄了一整個下午還是不行，}{最後{who}只好拿去給師傅修。|{who}嘆了一口氣，說下次不要在客廳玩了。}"],
            deal: [ctx.f("私下跟{sib}談條件", p), "你先扛，但要有交換", "{lead}。你先認了下來，回房間跟{sib}談好條件：{sib}要{favor}。{{sib}乖乖照做了。|{sib}只做了三天就忘了，你氣得追著{sib}跑。}"],
          };
        } },
      ]).make();
      const v = { lead: sc.lead, sib: sc.sib, who, snack, tv, fixHow, gift: sc.gift, favor: sc.favor, punish: sc.punish };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead: sc.lead }),
        options: [
          { id: "c_sibBlame.tell", label: sc.tell[0], hint: sc.tell[1], act: "talk", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w(sc.tell[2], v), mood: sc.blamed ? 0 : -1 }) },
          { id: "c_sibBlame.cover", label: sc.cover[0], hint: sc.cover[1], act: "care", style: "family", weight: 0.2, apply: (s2, c) => ({ text: c.w(sc.cover[2], v), mood: sc.blamed ? -1 : 0 }) },
          { id: "c_sibBlame.urge", label: sc.urge[0], hint: sc.urge[1], act: "talk", style: "social", weight: 0.25, apply: (s2, c) => ({ text: c.w(sc.urge[2], v), mood: 1 }) },
          { id: "c_sibBlame.fix", label: sc.fix[0], hint: sc.fix[1], act: "avoid", style: "risk", weight: 0.15, apply: (s2, c) => (c.rng() < 0.5 ? { text: c.w(sc.fix[2], v), mood: 1 } : { text: c.w(sc.fix[3], v), mood: -2 }) },
          { id: "c_sibBlame.deal", label: sc.deal[0], hint: sc.deal[1], act: "negotiate", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w(sc.deal[2], v), mood: 0 }) },
        ],
      };
    },
  },
  {
    // 想要同學都有的玩具（依年代）：班上都有、過年看到表哥堂姊的、生日想要的；家裡的錢緊不緊，家人的回答不一樣
    id: "c_wantToy", domain: "wealth", channel: "change", once: true, ages: [7, 12], when: s => !s.abroad, p: () => 0.04,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), snack = ctx.rng.pick(snackOf(y)), bank = y < 1965 ? "竹筒撲滿" : "小豬撲滿", exam = y < 1980 ? "月考" : "段考";
      const mate = (bestFriend(s) || ctx.person({ role: "friend", sex: s.sex, birthYear: s.birthYear })).call, outdoor = y < 1985 ? "跳格子" : "鬼抓人";
      const [toy, price, dear, diy] = wantedToy(s, ctx), tight = homeMoney(s, ctx) === "tight";
      const sc = pickScene(ctx, [
        s.studying && { make: () => ({ lead: ctx.w("班上{好多同學|幾乎每個同學}都有{toy}，下課大家都在玩，只有你沒有", { toy }) }) },
        { make: () => {
          // 外婆家 is the mother's side: the cousins there are 表 cousins; at 阿公阿嬤家 they may be 堂 or 表. Paper dolls belong to a girl cousin.
          const where = ctx.rng.pick(["阿公阿嬤家", "外婆家"]), side = where === "外婆家" ? ["表哥", "表姊"] : ["堂哥", "堂姊", "表哥", "表姊"];
          const cousin = ctx.rng.pick(/紙娃娃/.test(toy) ? side.filter(x => x.endsWith("姊")) : side);
          return { cousin, lead: ctx.f("過年回{where}，{cousin}拿出{toy}，大家圍著看，你也好想要", { where, cousin, toy }) };
        } },
        { make: () => ({ birthday: true, lead: ctx.f("生日快到了，你最想要的是{toy}，可是要{price}", { toy, price }) }) },
      ]).make();
      const { lead } = sc, v = { lead, who, snack, bank, exam, mate, outdoor, diy, cousin: sc.cousin };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          {
            id: "c_wantToy.save", label: "存零用錢自己買", hint: ctx.f("要{price}", { price }), act: "save", style: "safe", weight: 0.25,
            apply: (s2, c) => { s2.flags.saver = true; return dear
              ? { text: c.w("{lead}。你開始把零用錢存在{bank}裡，{存了半年還差一大截，|每天數一次，數字卻漲得好慢，}{{who}看你這麼認真，答應過年時補上不夠的錢。|後來你把存下來的錢拿去買了別的東西，也很開心。}", v), mood: 2 }
              : { text: c.w("{lead}。你開始把零用錢存在{bank}裡，{連{snack}都不買了，|每天晚上都數一次存了多少，}{存了{一|兩}個月，終於自己買到了。|存夠的那天，你一路跑去店裡。}", v), mood: 4 }; },
          },
          {
            id: "c_wantToy.ask", label: ctx.f("拜託{who}買給你", { who }), hint: sc.birthday ? "當作生日禮物" : "說大家都有", act: "talk", style: "family", weight: 0.2,
            apply: (s2, c) => (tight
              ? { text: c.w("{lead}。你拜託{who}買給你，{who}說家裡的錢要先{繳學費|付水電費|買米}，{摸摸你的頭說等以後。|帶你去夜市買了一個便宜的代替。}", v), mood: -2 }
              : c.rng() < 0.6
                ? { text: c.w("{lead}。你拜託了好幾天，{who}{終於在你生日那天買給你，|說下次{exam}考好就買，結果真的買了，}{你抱著它睡了好幾天。|那是你最寶貝的東西。}", v), mood: 4 }
                : { text: c.w("{lead}。你拜託了好幾天，{who}說{家裡的玩具已經夠多了，|不能人家有什麼你就要什麼，}{你氣得不吃晚飯。|你在日記裡寫了好長一段抗議。}", v), mood: -2 }),
          },
          {
            id: "c_wantToy.deal", label: ctx.f("跟{who}談條件", { who }), hint: ctx.f("{exam}考一百分就買", { exam }), act: "negotiate", style: "risk", weight: 0.15,
            apply: (s2, c) => (c.roll("study", "good", 0.5)
              ? { text: c.w("{lead}。你跟{who}約好，{exam}{考一百分|進步十名}就買給你，{你每天多讀一個小時，|你把錯的題目抄在小本子上反覆練，}{真的做到了，{who}說話算話。|最後真的做到了，你自己都不敢相信。}", v), mood: 5 }
              : { text: c.w("{lead}。你跟{who}約好，{exam}{考一百分|進步十名}就買給你，{結果差了一點點，|考試那天太緊張，}{{who}說約定就是約定，下次再努力。|你難過了好幾天，但沒有再吵。}", v), mood: -2 }),
          },
          {
            id: "c_wantToy.borrow", label: sc.cousin ? ctx.f("跟{cousin}借來玩", { cousin: sc.cousin }) : ctx.f("跟{mate}借來玩", { mate }), hint: "輪流玩也很好", act: "socialize", style: "social", weight: 0.15,
            apply: (s2, c) => ({ text: c.w(sc.cousin
              ? "{lead}。過年那幾天你一直黏著{cousin}，{{cousin}教你怎麼玩，|兩個人輪流玩到半夜，}{回家時{cousin}還說下次再借你。|你覺得這樣也很好。}"
              : "{lead}。你跟{mate}借來玩，{兩個人約好一人玩一天，|下課就湊在一起輪流玩，}{你們變得更要好了。|玩久了，你覺得有沒有自己的也沒那麼重要。}", v), mood: 2 }),
          },
          { id: "c_wantToy.make", label: "自己動手做一個", hint: "自己做的最特別", act: "hobby", style: "learn", weight: 0.1, apply: (s2, c) => ({ text: c.w(sc.cousin ? "{lead}。你{diy}，{{cousin}先是笑你，後來又搶著要玩。|{who}看了直說你手真巧。}{你把它擺在書桌上好久。|那是你最得意的作品。}" : "{lead}。你{diy}，{同學先是笑你，後來又搶著要玩。|{who}看了直說你手真巧。}{你把它擺在書桌上好久。|那是你最得意的作品。}", v), mood: 2 }) },
          {
            id: "c_wantToy.skip", label: "算了，玩別的", hint: "沒有也沒關係", act: "wait", style: "self", weight: 0.15,
            apply: (s2, c) => ({ text: c.w(sc.cousin
              ? "{lead}。你決定不要了，{跑去跟其他小孩在門口玩捉迷藏，|跟著大人去廟口看熱鬧，}{玩得一樣開心。|過完年，你也就忘了這件事。}"
              : "{lead}。你決定不要了，{跑去跟{mate}玩{outdoor}，|跑去操場打躲避球，}{玩得一樣開心。|過了一陣子，那陣風潮就過去了。}", v), mood: 1 }),
          },
        ],
      };
    },
  },
  {
    // 挑食：營養午餐（1990 年代起）、全校比賽廚餘最少（2000 年代起）、蒸便當、家裡的晚餐
    id: "c_lunch", domain: "health", channel: "change", once: true, ages: [6, 10], when: s => !s.abroad, p: () => 0.045,
    choice: (s, ctx) => {
      const y = s.year, who = grownUp(s, ctx), bin = y >= 2000 ? "廚餘桶" : "餿水桶", sibs = bornSiblings(s, 3);
      const mate = (bestFriend(s) || ctx.person({ role: "friend", sex: s.sex, birthYear: s.birthYear })).call;
      const [food, dish] = ctx.rng.pick([["苦瓜", "苦瓜炒鹹蛋"], ["茄子", "九層塔炒茄子"], ["青椒", "青椒炒肉絲"], ["紅蘿蔔", "紅蘿蔔炒蛋"], ["肥肉", "切得細細的肉燥"], ["芹菜", "芹菜炒花枝"]]);
      const sib = sibs.length ? siblingCall(ctx.rng.pick(sibs)) : null, dog = s.flags.pet && s.flags.pet.kind === "dog" ? s.flags.pet.name : null;
      const p = { who, mate, food, dish, bin, sib, dog };
      // At school: trade the food for your 滷蛋, tell the teacher, or ask for it cooked another way at home.
      const school = () => ({
        trade: [ctx.f("跟{mate}交換", p), "用你的滷蛋換", "{lead}。你用{tray}裡的滷蛋跟{mate}換，{{mate}最愛吃{food}，高興得不得了，|兩個人趁老師不注意偷偷交換，}{從此你們每天中午都在交換。|{mate}說以後你的{food}都歸{mate}。}"],
        tell: ["跟老師說你吃不下", "說清楚比較好", "{lead}。你舉手跟老師說你真的吃不下{food}，{老師說那就先吃一小口試試看，|老師點點頭，讓你只吃一口就好，}{你咬了一小口，好像也還好。|老師說下次再挑戰多一點。}"],
        cook: [ctx.f("回家請{who}換個煮法", p), "換個做法說不定就敢吃", "{lead}。你回家請{who}換個煮法，{who}做了{dish}，{你居然配了一整碗飯。|你發現{food}原來沒那麼可怕。}"],
      });
      const sc = pickScene(ctx, [
        y >= 1990 && s.studying && { make: () => ({
          ...school(), tray: "餐盤", lead: ctx.f("今天的營養午餐有你最怕的{food}，老師說吃完才能去午休", p), praise: "老師",
          dump: [ctx.f("偷偷倒進{bin}", p), "趁老師不注意", "{lead}。你趁老師不注意，把{food}倒進了{bin}，{結果被值日生看到，告訴了老師，|才倒完就被老師叫住了，}{老師要你下次至少吃一口。|全班都轉頭看你，你的臉一下子紅了。}", "{lead}。你趁老師不注意，把{food}倒進了{bin}，{一整個下午都有點心虛。|那天午休你睡得特別不安穩。}"],
        }) },
        y >= 2000 && s.studying && { make: () => ({
          ...school(), tray: "餐盤", lead: ctx.f("營養午餐有你最怕的{food}，全校在比賽哪一班的廚餘最少，大家都盯著你的餐盤", p), praise: "全班",
          dump: ["趁大家不注意倒掉", "反正沒人看到", "{lead}。你趁大家不注意把{food}倒掉，{結果被值日生看到了，|倒到一半被班長發現，}{那天你們班的廚餘最多，大家都看著你。|老師要你下次至少吃一口。}", "{lead}。你趁大家不注意把{food}倒掉，{一直沒被發現，|你們班還是拿到了廚餘最少的獎牌，}{可是你一整個下午都有點心虛。|那天午休你睡得特別不安穩。}"],
        }) },
        y < 1990 && s.studying && { make: () => ({
          ...school(), tray: "便當", lead: y < 1965 ? ctx.f("中午打開便當，{who}又放了一大堆你最怕的{food}", p) : ctx.f("中午打開蒸好的便當，{who}又放了一大堆你最怕的{food}", p), praise: "老師",
          tell: [ctx.f("回家跟{who}說不要再放", p), "說好以後換別的菜", "{lead}。晚上你跟{who}說{food}真的吃不下，{{who}說那就換成你愛吃的菜，|{who}跟你約好一個星期只放一次，}{隔天的便當多了一顆滷蛋。|你覺得自己被聽懂了。}"],
          dump: [ctx.f("偷偷倒進學校的{bin}", p), "反正沒人知道", "{lead}。你把{food}偷偷倒進學校的{bin}，{結果被老師看到了，|被同學看到，跑去告訴了老師，}{老師要你下次至少吃一口。|全班都轉頭看你，你的臉一下子紅了。}", "{lead}。你把{food}偷偷倒進學校的{bin}，{回家把空便當盒交給{who}時有點心虛。|{who}還誇你今天吃得很乾淨，你不敢看{who}的眼睛。}"],
        }) },
        { make: () => ({
          lead: ctx.f("晚餐桌上有一盤{food}，{who}說小孩不可以挑食，夾了一大筷子到你碗裡", p), praise: who,
          trade: sib ? [ctx.f("偷偷夾給{sib}", p), ctx.f("{sib}不怕{food}", p), "{lead}。你趁{who}不注意，把{food}偷偷夾到{sib}碗裡，{{sib}沒說什麼就吃掉了，|{sib}瞪了你一眼，還是吃了，}{你欠了{sib}一個人情。|後來換{sib}把不敢吃的夾給你。}"]
            : dog ? [ctx.f("偷偷餵給{dog}", p), "牠什麼都吃", "{lead}。你趁{who}不注意，把{food}偷偷丟到桌子底下給{dog}，{{dog}聞了聞，居然不吃，|{dog}吃得津津有味，}{{who}早就看到了，只是沒說破。|那成了你和{dog}的祕密。}"] : null,
          tell: [ctx.f("跟{who}說你真的不敢吃", p), "好好講", "{lead}。你跟{who}說你真的不敢吃{food}，{{who}說那就先吃三口，|{who}嘆了一口氣，把你碗裡的夾走了一半，}{你皺著眉頭吃完了。|你們約好下次換個做法。}"],
          cook: [ctx.f("請{who}教你換個做法", p), "自己動手試試看", "{lead}。你說你想自己試試看，{who}教你做了{dish}，{你吃了好幾口，覺得味道不一樣了。|從此你最愛的一道菜就是它。}"],
          dump: ["藏在碗底的飯下面", "等一下再說", "{lead}。你把{food}藏在碗底的飯下面，{結果收碗時被{who}發現了，|{who}一眼就看穿了，}{只好一口一口吃完。|{who}罰你洗碗。}", "{lead}。你把{food}藏在碗底的飯下面，{趁{who}去廚房時倒掉了，|最後偷偷倒進了廚房的垃圾桶，}{一直沒被發現，但你心裡有點不安。|後來{who}很少再煮{food}，你一直覺得是自己的功勞。}"],
        }) },
      ]).make();
      const { lead, trade } = sc, v = { ...p, lead, tray: sc.tray, praise: sc.praise };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "c_lunch.swallow", label: "捏著鼻子吞下去", hint: "配一大口飯", act: "pushThrough", style: "health", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}。你捏著鼻子，配著一大口飯把{food}吞下去，{眼淚都快掉出來了，|吞完馬上灌了一大口湯，}{後來你發現好像也沒那麼難吃。|{praise}誇你好勇敢。}", v), mood: 1 }) },
          { id: "c_lunch.trade", label: trade ? trade[0] : "偷偷給別人吃", hint: trade ? trade[1] : "", act: "socialize", style: "social", weight: 0.2, when: () => !!trade, apply: (s2, c) => ({ text: c.w(trade[2], v), mood: 2 }) },
          { id: "c_lunch.dump", label: sc.dump[0], hint: sc.dump[1], act: "avoid", style: "risk", weight: 0.2, apply: (s2, c) => (c.rng() < 0.5 ? { text: c.w(sc.dump[2], v), mood: -1 } : { text: c.w(sc.dump[3], v), mood: 0 }) },
          { id: "c_lunch.tell", label: sc.tell[0], hint: sc.tell[1], act: "talk", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(sc.tell[2], v), mood: 1 }) },
          { id: "c_lunch.cook", label: sc.cook[0], hint: sc.cook[1], act: "hobby", style: "learn", weight: 0.15, apply: (s2, c) => ({ text: c.w(sc.cook[2], v), mood: 2 }) },
        ],
      };
    },
  },
];
