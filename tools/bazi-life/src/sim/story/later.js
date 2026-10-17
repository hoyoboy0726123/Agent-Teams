// 後半生（55 歲以後）：孩子長大離家、成家，含飴弄孫；退休以後的日子；老夫老妻、一個人過日子；老朋友；
// 身體的小毛病；還有把一生整理好的那些事。
//
// 這裡的機率都是寫故事用的假設，沒有官方統計：每件事一年幾個百分點，再用 once / max / cooldown 讓它在一生裡
// 出現的次數看起來合理。真實的只有時間點：長輩普遍用智慧型手機是 2012 年以後；長照 2.0 和 1966 專線 2017 年
// 起；《都市危險及老舊建築物加速重建條例》2017 年起；公教年金改革 2018-07-01 上路（era.js 寫了上路那一年，
// 這裡寫之後的調整）；《病人自主權利法》2019-01-06 施行。
//
// 這個模組不寫任何人的死亡或重病（在 core.js），也不讓主角結婚、離婚、生小孩、買房或退休。會動到 hr 的只有
// 膝蓋退化、喪偶後的生活、照顧另一半三件事，每次最多乘 0.97 或 1.03，好壞都有，平均起來幾乎不變。
import { bornSiblings, yearsMarried, tier, exam15Name } from "../world.js";
import { siblingCall } from "../words.js";
import { pronoun } from "../people.js";

// ---------- who is around ----------
const married = s => s.rel === "married" && !!s.partner;
const adultKids = (s, min = 22) => s.kids.filter(k => k.age >= min);
const kidVars = k => ({ name: k.call, t: pronoun(k) });
const parentWord = s => (s.sex === "male" ? "爸爸" : "媽媽");
const spend = (s, x) => { s.savings = Math.max(0, s.savings - x); };
// The husband or wife who died: core's widowed event keeps them in s.exes with alive = false.
const lateSpouse = s => [...s.exes].reverse().find(p => p.alive === false) || null;
// Retired within the last n years (a retirement the player wrote in has no s.last.retire).
const justRetired = (s, n) => s.retired && s.age - (s.last.retire ?? s.age) <= n;
// Grown children not married yet in this story.
const unwed = s => s.kids.filter(k => k.age >= 26 && k.age <= 40 && !k.married);
const sibPronoun = x => (/Brother/.test(x.relation) ? "他" : "她");

// An old friend: one already in the story, or a new one about the same age.
function oldFriend(s, ctx, how = "老朋友") {
  const alive = s.friends.filter(f => f.alive !== false);
  if (alive.length) return ctx.rng.pick(alive);
  const sex = ctx.rng() < 0.7 ? s.sex : s.sex === "male" ? "female" : "male";
  const f = ctx.person({ role: "friend", sex, birthYear: s.birthYear + ctx.rng.int(5) - 2, how });
  s.friends.push(f);
  return f;
}

// Grandchildren. core.js only counts them (s.flags.grandkids) and remembers your age at the latest birth
// (s.last.grandchild); the stories here give the latest one a name the first time they talk about it, and keep it.
function grandkids(s, ctx) {
  const list = s.flags.l_grands || (s.flags.l_grands = []);
  const born = s.year - (s.age - (s.last.grandchild ?? s.age - 1));
  if ((s.flags.grandkids || 0) > list.length && !list.some(g => g.birthYear === born)) {
    const sex = ctx.rng() < 0.512 ? "male" : "female";
    const grown = adultKids(s, 24), wed = grown.filter(k => k.married);
    const parent = wed.length ? ctx.rng.pick(wed) : grown.length ? ctx.rng.pick(grown) : null;
    list.push({ call: ctx.person({ role: "kid", sex, birthYear: born }).call, sex, birthYear: born, parent: parent ? parent.call : "孩子" });
  }
  return list.map(g => ({ ...g, age: s.year - g.birthYear }));
}
const grandVars = g => ({ g: g.call, gt: g.sex === "female" ? "她" : "他", pk: g.parent, gw: g.sex === "female" ? "女兒" : "兒子" });

// A walk near home, by county.
const TRAILS = {
  臺北市: ["象山步道", "仙跡岩步道", "劍潭山步道", "七星山步道"], 新北市: ["觀音山步道", "天上山步道", "獅仔頭山步道"], 基隆市: ["紅淡山步道"],
  桃園市: ["虎頭山步道"], 新竹市: ["十八尖山步道"], 新竹縣: ["飛鳳山步道"], 苗栗縣: ["挑鹽古道"], 臺中市: ["大坑步道", "大肚山步道"],
  彰化縣: ["八卦山步道"], 南投縣: ["猴探井步道"], 雲林縣: ["草嶺步道"], 嘉義市: ["蘭潭後山步道"], 嘉義縣: ["獨立山步道"],
  臺南市: ["關子嶺步道", "虎頭埤環湖步道"], 高雄市: ["柴山步道"], 宜蘭縣: ["林美石磐步道"], 花蓮縣: ["鯉魚山步道"], 臺東縣: ["鯉魚山步道"],
  金門縣: ["太武山步道"],
};
const trail = (s, ctx) => (TRAILS[s.county] ? ctx.rng.pick(TRAILS[s.county]) : "附近的郊山步道");
// Where old apartments get rebuilt (都更、危老).
const URBAN = ["臺北市", "新北市", "基隆市", "桃園市", "新竹市", "臺中市", "臺南市", "高雄市", "嘉義市"];
// Birthplaces nobody goes "back to the countryside" to.
const CITY = ["臺北市", "基隆市", "新竹市", "嘉義市"];
const SHOPS = ["早餐店", "麵店", "咖啡館", "雜貨店", "花店", "二手書店", "包子店"];
// What a retiree learns: [skill, shown on a stage or on a wall]
const SKILLS = [["陶笛", "stage"], ["薩克斯風", "stage"], ["烏克麗麗", "stage"], ["國標舞", "stage"], ["水墨畫", "wall"], ["攝影", "wall"], ["陶藝", "wall"]];
const plan = (s, kind, what = "", more = {}) => { s.flags.l_plan = { kind, what, at: s.age, ...more }; };

// Years after the first knee pain (health.js h_knee): whether to replace the joint.
function kneeLater(s, ctx, t) {
  const ks = adultKids(s, 22), close = ks.length > 0 || married(s);
  const v = { trail: t, them: ks.length > 1 ? "孩子們" : ks.length ? ks[0].call : married(s) ? s.partner.call : "家人" };
  return {
    prompt: ctx.w([
      "膝蓋的老毛病越來越嚴重，{復健和吃藥都沒什麼用了，|上下樓梯都要扶著牆，}骨科醫生說，可以考慮換人工關節了。要怎麼決定？",
      "膝蓋痛了好幾年，{最近連走去市場都要休息兩次，|晚上常常痛到睡不著，}醫生拿著 X 光片說，軟骨已經磨得差不多了。要開刀嗎？",
      "醫生說你的膝蓋已經退化得很嚴重，建議換人工關節。一想到要開刀，你心裡就七上八下。你的決定是？",
    ], v),
    options: [
      {
        id: "l_knee.replace", label: "開刀換人工關節", hint: "痛一陣子，換往後好走", act: "seeDoctor", style: "risk", weight: 0.3,
        apply: (s2, c) => { s2.health.hr *= 0.99; spend(s2, 0.05); return { text: c.w("膝蓋的老毛病拖了好幾年，你終於決定換人工關節。{手術很順利，|住院一個星期，}{接下來三個月每天都要復健，痛得咬牙，|你扶著助行器在走廊來回地走，}{半年後，你又能自己去走{trail}了。|現在上下樓梯一點都不痛了。}", v), mood: 2 }; },
      },
      {
        id: "l_knee.opinion", label: "再問一位醫生", hint: "聽聽不同的說法", act: "seeDoctor", style: "learn", weight: 0.15,
        apply: (s2, c) => {
          s2.health.hr *= 0.99;
          return { text: c.rng() < 0.5
            ? c.w("要不要換人工關節，你又去問了另一位骨科醫生。{第二位醫生的說法一樣，|第二位醫生把 X 光片一張一張解釋給你聽，}你才放心排了刀，{半年後走路比以前輕鬆多了。|復健完，又能自己去菜市場了。}")
            : c.w("要不要換人工關節，你又去問了另一位骨科醫生。{醫生說還可以再保守治療幾年，|醫生教你每天在家做抬腿運動，}{你照著做，膝蓋真的沒那麼痛了。|開刀的事，就先放著。}"), mood: 1 };
        },
      },
      {
        id: "l_knee.family", label: "和家人一起商量", hint: "開刀後需要人照顧", act: "talk", style: "family", weight: 0.2, when: () => close,
        apply: (s2, c) => { s2.health.hr *= 0.99; return { text: c.w("要不要換人工關節，你找{them}一起商量。{大家排好了輪流照顧的時間，|{them}說開刀那幾天會請假陪你，}{你這才安心地開了刀。|你點點頭，決定開刀。}{出院那天，全家一起來接你。|半年後，你又能自己出門散步了。}", v), mood: 2 }; },
      },
      {
        id: "l_knee.walker", label: "改用拐杖或助行器", hint: "不開刀，走慢一點", act: "wait", style: "safe", weight: 0.15,
        apply: (s2, c) => ({ text: c.w("醫生建議換人工關節，你想了想，{買了一支四腳拐杖，|推起了有輪子的助行器，}{出門慢一點，但還是每天去公園。|你說，能自己走就好。}"), mood: 0 }),
      },
      {
        id: "l_knee.bear", label: "再撐幾年", hint: "不想開刀", act: "pushThrough", style: "self", weight: 0.2,
        apply: (s2, c) => { s2.health.hr *= 1.03; return { text: c.w("醫生建議換人工關節，你還是不想開刀，{貼著痠痛藥布撐著，|能不出門就不出門，}{後來走路越來越少，體力也跟著差了。|爬樓梯變成一天裡最難的一件事。}"), mood: -3 }; },
      },
    ],
  };
}

// ---------- scenes ----------
// One situation for a choice, so the same question reads differently from life to life. `list` holds the scenes
// that fit now (null for one that does not), each with a weight `w` (higher for one made for this moment of life,
// default 1); a scene this life has not had for the question comes first (s.flags["<id>:scenes"] keeps the told
// ones). The question, the buttons and every answer are written from the scene that comes back.
function pickScene(s, ctx, id, list) {
  const ok = list.filter(Boolean), key = `${id}:scenes`, told = s.flags[key] || (s.flags[key] = []);
  const fresh = ok.filter(x => !told.includes(x.key));
  const sc = ctx.rng.weighted((fresh.length ? fresh : ok).map(x => [x, x.w ?? 1]));
  told.push(sc.key);
  return sc;
}

// l_grandkidHelp: why the young family needs a hand. `g` is the newest grandchild; the templates use grandVars
// ({g} {gt} {pk} {gw}). Each answer is [label, hint, templates].
function grandHelpScenes(s, g) {
  const age = g.age === 0 ? "剛滿月" : g.age === 1 ? "一歲多了" : "兩歲了";
  const nursery = s.year >= 2000 ? "托嬰中心" : "托兒所", school = s.year >= 2012 ? "幼兒園" : "幼稚園";
  const daily = [
    "{pk}他們要上班，你答應白天幫忙帶{g}。{每天早上七點，{pk}就把{g}抱過來，|客廳的地板鋪滿了巧拼和玩具，}{一天下來腰都直不起來，但{g}第一次叫「{grand}」的時候，什麼都值得了。|你又重新學了一次怎麼泡奶、換尿布、哄睡。}",
    "你成了{g}的白天保母，{推著娃娃車去菜市場，|在公園跟其他{grand}交換帶孫心得，}{連攤販都認得{g}了。|每天傍晚把{g}交回{pk}手上時，你又累又捨不得。}",
  ];
  const weekend = [
    `你跟{pk}說好，平日{g}去${nursery}，週末再帶來給你顧。{星期六一早，你就在門口等。|週末的家裡，又有了小孩的哭聲和笑聲。|你在冰箱裡塞滿了{gt}愛吃的東西。}`,
    "你答應週末幫忙顧{g}，{平日照樣去爬山、上課，|平日的時間還是留給自己，}{到了星期五晚上就開始期待。|星期天晚上{pk}來接人時，{g}抱著你不放。}",
  ];
  const move = ["搬到孩子家附近", "就近照應", "為了幫忙帶{g}，你搬到{pk}家附近，{走路五分鐘就到，|就隔一條巷子，|每天傍晚去接{g}回家，}{一家人常常一起吃晚飯。|{pk}說這樣安心多了。|{g}學會走路以後，最常走的就是到你家的那條路。}"];
  const money = ["出錢請保母", "出錢不出力", `你沒辦法天天帶{g}，{就每個月幫{pk}出一半的保母費，|幫忙付了${nursery}的費用，|包了一個大紅包，說是給{g}的保母費，}{週末再去看{gt}。|{pk}說這樣就幫了大忙。|你說錢的事不用擔心。}`];
  const no = (asked, after) => ["婉拒，過自己的生活", "身體和日子也要顧", `{pk}${asked}，你{想了很久，|老實說了自己的身體狀況，}{還是婉拒了。|說想把這幾年留給自己。}{pk}{有點失望，但說能理解。|${after}}`];
  const share = ["和親家輪流", "兩邊的長輩一起來", `你和親家說好輪流帶{g}，{一三五你顧，二四換他們，|一邊顧白天，一邊顧晚上，|一家顧一個星期，}{{g}${g.age >= 2 ? "在兩家之間跑來跑去" : "在兩家之間輪流住"}，被兩邊的長輩寵上了天。|週末兩家人常常一起吃飯。|你和親家反而成了好朋友。}`];
  return [
    {
      key: "work", lead: `{pk}的{gw}{g}${age}，{pk}他們兩個都要上班，白天找不到人顧`, ask: "{pk}問你能不能白天幫忙帶，你怎麼打算？",
      daily: ["白天幫忙帶", "累，但看著孫子長大", daily], weekend: ["只幫忙週末", "平日留給自己", weekend], move, money,
      no: no("問你能不能幫忙帶{g}", "後來找到了一位很好的保母。"), share,
    },
    {
      key: "daycare", lead: `{g}${age}，${s.year >= 2011 ? "公托沒抽中，私立的托嬰中心也要排半年" : s.year >= 2000 ? "托嬰中心排不到位子" : "附近的托兒所不收這麼小的孩子"}，{pk}打電話來，問你能不能幫忙帶`, ask: "你的決定是？",
      daily: ["白天先幫忙帶", "等排到位子再說", ["{pk}找不到地方送托，你答應白天先幫忙帶{g}。{每天早上{pk}把{g}抱過來，傍晚再接回去，|你在客廳鋪了巧拼，把危險的東西都收到高處，}{等排到位子時，{g}已經會叫「{grand}」了。|你又重新學了一次怎麼泡奶、換尿布、哄睡。}", daily[1]]],
      weekend: ["一個星期幫兩三天", "其他天讓他們想辦法", ["你答應一個星期幫忙顧{g}兩三天，{其他時間{pk}請了臨時保母，|其他天{pk}他們輪流請假，}{你的日子沒有全被打亂。|{g}來的那幾天，你都特別早起。}"]],
      move,
      money: s.year >= 2000
        ? ["出錢上私立托嬰", "出錢不出力", ["你沒辦法天天帶{g}，{就幫{pk}付了私立托嬰中心的費用，|每個月幫忙出一半的托嬰費，}{週末再去看{gt}。|{pk}說這樣就幫了大忙。|你說錢的事不用擔心。}"]]
        : money,
      no: no("問你能不能幫忙帶{g}", `後來排到了${nursery}的位子。`), share,
    },
    (s.year >= 2002 || g.age === 0) && g.age <= 1 && {
      key: "leave", lead: `{pk}的${s.year >= 2002 ? "育嬰假" : "產假"}快結束了，{g}還不到兩歲，{pk}吞吞吐吐地問你能不能幫忙`, ask: "要怎麼回答？",
      daily: ["接手白天帶", "累，但看著孫子長大", ["{pk}回去上班以後，你接手白天帶{g}。{每天早上七點，{pk}就把{g}抱過來，|客廳的地板鋪滿了巧拼和玩具，}{一天下來腰都直不起來，但{g}第一次叫「{grand}」的時候，什麼都值得了。|你又重新學了一次怎麼泡奶、換尿布、哄睡。}", daily[1]]],
      weekend: ["只幫忙週末", "平日留給自己", weekend], move, money,
      no: no("回去上班前問你能不能幫忙帶{g}", "後來找到了一位很好的保母。"), share,
    },
    g.age >= 1 && {
      key: "nanny", lead: `{g}還沒到上${school}的年紀，{pk}他們請的保母卻突然不做了`, ask: "要怎麼幫忙？",
      daily: ["白天先接手帶", "等找到新保母再說", ["保母不做了，你答應白天先接手帶{g}。{每天早上{pk}把{g}抱過來，|你把客廳的茶几收起來，鋪上了巧拼，}{本來說好帶一個月，結果一帶就是一年。|你又重新學了一次怎麼哄睡、怎麼餵副食品。}", daily[1]]],
      weekend: ["只在週末幫忙", "平日留給自己", ["你跟{pk}說好，平日由他們再找保母，週末再把{g}帶來給你顧。{星期六一早，你就在門口等。|週末的家裡，又有了小孩的哭聲和笑聲。|你在冰箱裡塞滿了{gt}愛吃的東西。}"]],
      move,
      money: ["出錢請新保母", "出錢不出力", ["你沒辦法天天帶{g}，{就幫{pk}找了一位新的保母，每個月出一半的錢，|包了一個大紅包，說是給新保母的薪水，}{週末再去看{gt}。|{pk}說這樣就幫了大忙。}"]],
      no: no("問你能不能先幫忙帶{g}", "後來找到了一位很好的保母。"), share,
    },
    {
      key: "far", lead: "{pk}他們在外縣市上班，想把{g}送回來給你帶，週末再來接", ask: "你怎麼打算？",
      daily: [`把${g.call}接來家裡帶`, "週一到週五住你家", ["你把{g}接回家裡帶，{週一到週五都住你家，|嬰兒床就擺在你的床旁邊，}{星期天晚上{pk}來接人時，{g}抱著你不放。|你又重新學了一次怎麼泡奶、換尿布、哄睡。}", "{g}住進你家以後，{你推著娃娃車去菜市場，連攤販都認得{gt}了，|你在公園跟其他{grand}交換帶孫心得，}{每個星期天晚上，你都在門口揮手，揮到車子轉彎。|家裡又有了小孩的哭聲和笑聲。}"]],
      weekend: ["只在週末帶", "平日還是跟著爸媽", [`你跟{pk}說，孩子還是跟在爸媽身邊比較好，平日{g}留在那邊上${nursery}，週末和放假再帶回來給你顧。{每個星期五晚上，你就開始期待。|你在冰箱裡塞滿了{gt}愛吃的東西。}`]],
      move: ["搬去孩子家住一陣子", "平日幫忙，週末回家", ["你收拾了一箱衣服，搬去{pk}家住了一陣子，{平日幫忙帶{g}，週末再回自己家，|白天帶{g}去公園，晚上一家人一起吃飯，}{{pk}說這樣安心多了。|{g}學會走路以後，最愛跟在你後面跑。}"]],
      money: ["出錢請保母", "出錢不出力", ["你沒辦法天天帶{g}，{就每個月幫{pk}出一半的保母費，|幫{pk}在他們家附近找了一位保母，錢由你出，}{週末再去看{gt}。|{pk}說這樣就幫了大忙。}"]],
      no: ["婉拒，過自己的生活", "身體和日子也要顧", "{pk}想把{g}送回來給你帶，你{想了很久，|老實說了自己的身體狀況，}{還是婉拒了。|說孩子還是跟在爸媽身邊比較好。}{pk}{有點失望，但說能理解。|後來在他們家附近找到了一位很好的保母。}"],
      share,
    },
    // 2021–2022 年疫情期間，托嬰中心一有確診就停托。
    s.year >= 2021 && s.year <= 2022 && {
      key: "covid", w: 2, lead: `疫情期間，${nursery}{一有確診就停托|三天兩頭停課}，{pk}他們在家上班還要顧{g}`, ask: "要怎麼幫忙？",
      daily: ["白天過去幫忙顧", "戴好口罩照樣去", ["{pk}他們在家上班，你每天戴好口罩過去，白天幫忙顧{g}。{你在客廳陪{g}玩，{pk}他們關在房間裡開視訊會議，|中午你幫大家煮一鍋稀飯，}{一天下來腰都直不起來，但{g}第一次叫「{grand}」的時候，什麼都值得了。|疫情那一年，你是{g}最常見到的人。}"]],
      weekend: ["只在停托的日子幫忙", "平日留給自己", [`你跟{pk}說好，${nursery}停托的那幾天你再過去幫忙。{接到電話，你就提著${s.year >= 2022 ? "快篩" : "口罩"}和一袋菜出門。|那陣子你的手機一響，就知道是{g}要來了。}`]],
      move: ["搬去孩子家住一陣子", "就近照應", ["疫情期間，你收拾了一箱衣服，搬去{pk}家住了一陣子，{白天幫忙顧{g}，晚上一家人一起吃飯，|{pk}他們終於能安心開會，}{那段時間雖然擠，卻是一家人最常聚在一起的日子。|{g}最愛在走廊上追著你跑。}"]],
      money: ["出錢請到府保母", "出錢不出力", ["疫情期間你不方便天天出門，{就幫{pk}出錢請了一位到家裡的保母，|每個月幫忙出一半的保母費，}{每天用視訊陪{g}唱兒歌。|{pk}說這樣就幫了大忙。}"]],
      no: ["婉拒，先顧好自己", "疫情期間少出門", ["{pk}問你能不能幫忙顧{g}，你想到自己的年紀和疫情，{還是婉拒了。|說等疫情過了再說。}{pk}說能理解，{每天傳{g}的影片給你看。|後來他們夫妻輪流進辦公室。}"]],
      share,
    },
    g.age === 0 && s.year >= 2000 && {
      key: "confinement", w: 2, lead: "{g}剛從月子中心回家，{pk}他們手忙腳亂，問你能不能過去幫忙一陣子", ask: "要怎麼幫忙？",
      daily: ["每天過去幫忙", "泡奶、洗澡、哄睡", ["{g}剛從月子中心回家，你每天一早就過去幫忙，{教{pk}怎麼幫{g}洗澡，|半夜也幫忙泡奶、哄睡，}{一個月下來腰都直不起來，但看到{g}對你笑，什麼都值得了。|你又重新學了一次怎麼換尿布、拍嗝。}"]],
      weekend: ["只在週末過去", "平日留給自己", ["你跟{pk}說好，週末再過去幫忙，{星期六一早就提著一鍋雞湯出門，|週末讓{pk}他們好好補眠，}{平日照樣去爬山、上課。|每到星期五晚上就開始期待。}"]],
      move,
      money: ["出錢請到府保母", "出錢不出力", ["你沒辦法天天過去，{就幫{pk}出錢請了一位到府的保母，|包了一個大紅包，說是給{g}請保母的錢，}{週末再去看{gt}。|{pk}說這樣就幫了大忙。}"]],
      no: no("問你能不能過去幫忙", "後來請了一位到府的保母。"),
      share: ["和親家輪流", "兩邊的長輩一起來", "你和親家說好輪流過去幫忙，{一個顧白天，一個顧晚上，|一家幫一個星期，}{{pk}他們終於能好好睡一覺。|你和親家反而成了好朋友。}"],
    },
  ];
}

// l_retiredLife: the moment the question comes up (`prompt`), how the answers begin (`open`, before 你…), and the
// buttons a scene names its own way (`labels`: option → [label, hint]). {f} is an old friend, {k} a grown child.
function retireScenes(s, pro, pal) {
  const office = s.job && !["自營", "家業"].includes(s.job.field);
  // 公教 have a monthly pension (月退); 勞保 pays one (勞保年金) from 2009, from 60 on; otherwise it is a lump sum.
  const civil = s.job && ["公部門", "教育"].includes(s.job.field), monthly = civil || (s.year >= 2009 && s.age >= 60);
  const pension = civil ? "月退" : monthly ? "勞保年金" : "退休金";
  const grown = adultKids(s, 22).length > 0;
  return [
    { key: "sunday", prompt: "退休了，每天都是星期天。接下來的日子，你想怎麼過？", open: "退休後，" },
    { key: "clean", prompt: "退休後的第一個月，你把家裡打掃了三遍。接下來的日子要怎麼安排？", open: "把家裡打掃了三遍以後，" },
    { key: "lastday", prompt: "最後一天下班以後，時間突然多了出來。你想把退休生活花在哪裡？", open: "時間多了出來，" },
    office && {
      key: "farewell", prompt: "退休歡送會上，同事送你一束花和一張寫滿祝福的大卡片，每個人都問你接下來要做什麼。你想怎麼過？", open: "歡送會過後，",
      labels: { consult: pro ? ["答應回去當顧問", "老本行還用得上"] : ["答應回去帶新人", "老本行還用得上"] },
    },
    office && {
      key: "pension", prompt: `${monthly ? "第一筆" : ""}${pension}入帳了，你${s.year >= 2025 ? "盯著手機裡的入帳通知" : "拿著存摺在銀行門口"}看了好一會兒。退休的日子要怎麼過？`, open: `${pension}入帳以後，`,
      labels: { travel: ["拿退休金去旅行", "趁走得動多看看"], shop: ["拿退休金開一間小店", "圓一個當老闆的夢"] },
    },
    married(s) && {
      key: "spouse", prompt: "退休後你整天待在家裡，{partner}說你跟前跟後、什麼都要管，叫你去找點事做。接下來要把時間花在哪裡？", open: "被{partner}念了幾次以後，",
      labels: { travel: [`和${s.partner.call}去旅行`, "趁走得動多看看"], learn: ["學一樣才藝", "給自己找個新樂趣"] },
    },
    grown && {
      key: "kids", prompt: s.year >= 2011 ? "{k}在家族的 LINE 群組裡傳了好幾個{旅行團|社區大學|志工招募}的連結，問你退休後有什麼打算。你想怎麼過？" : "{k}打電話來問你退休後有什麼打算，叫你不要整天待在家裡。你想怎麼過？",
      open: s.year >= 2011 ? "看完{k}傳來的那些連結，" : "聽了{k}的話，",
      labels: { learn: [s.year >= 1998 ? "去社區大學上課" : "學一樣才藝", "樂器、跳舞、畫畫"], volunteer: ["報名當志工", "把時間給需要的人"] },
    },
    pal && { key: "friend", prompt: "{f}比你早退休幾年，常說退休以後最怕的就是沒事做。你想把退休的日子花在哪裡？", open: "想起{f}說的話，", labels: { volunteer: ["跟著去當志工", "把時間給需要的人"] } },
    { key: "calendar", prompt: "退休後，你翻開新的月曆，上面一個行程也沒有。接下來的日子要怎麼安排？", open: "看著空白的月曆，" },
    office && { key: "box", prompt: "你把辦公桌上的東西收進一個紙箱帶回家，名片和筆記本一疊一疊堆在客廳。退休以後要做什麼？", open: "收好那一箱辦公室的東西以後，" },
  ];
}

// l_directive: what brings 預立醫療決定 to mind. `then` begins the answers, `away` is how it is put off; a scene can
// name buttons its own way (`labels`). {kin} is the one you would ask to come along, {f} an old friend.
function directiveScenes(s, hasKin, kidKin) {
  const docs = `存摺${s.home === "own" ? "、房屋權狀" : ""}和保單`;
  return [
    {
      key: "tv", lead: "電視上在介紹《病人自主權利法》", ask: "你想到，如果有一天自己病重又沒辦法表達，要不要插管、急救，該由誰來決定？你打算怎麼做？",
      then: "看完那段節目，", away: "把節目裡的諮詢電話抄在月曆上",
      labels: { ask: ["下次回診問醫師", "先弄懂再決定"] },
    },
    {
      key: "friend", lead: "{f}說{ft}剛簽了「預立醫療決定書」", ask: "你也開始想：如果有一天自己沒辦法說話了，想被怎麼照顧？",
      then: "聽完{f}的經驗，", away: "把{f}給你的那張說明單收進抽屜",
      labels: { sign: ["像{f}一樣去諮商、簽下來", "把自己的意願寫清楚"] },
    },
    {
      key: "poster", lead: "回診時，看到醫院牆上貼著「預立醫療照護諮商」的海報", ask: "你站在那裡看了很久。要怎麼做？",
      then: "看完那張海報，", away: "從海報旁邊拿了一張說明單，回家就收進抽屜",
      labels: { sign: ["照海報上的電話預約諮商", "把自己的意願寫清楚"], ask: ["進診間先問醫師", "先弄懂再決定"] },
    },
    {
      key: "talk", lead: "里民活動中心辦了一場預立醫療的講座，{里長|社工}在會後發給你一張諮商的報名表", ask: "要怎麼做？",
      then: "聽完那場講座，", away: "把報名表收進抽屜",
      labels: { sign: ["填好報名表去諮商", "把自己的意願寫清楚"], wait: ["把報名表收起來", "還沒準備好面對"], ask: ["會後找台上的醫師問", "先弄懂再決定"] },
      askOpen: "講座結束後，你留下來問台上的醫師什麼是預立醫療決定。",
    },
    hasKin && {
      key: "app", lead: "{kin}幫你在手機裝了健保的 App，你看到裡面「預立醫療決定」那一欄還是空白的", ask: "要怎麼辦？",
      then: "看到那一欄還空著，", away: "把手機關上，那一欄繼續空著",
      labels: { sign: ["去醫院諮商，把那一欄填上", "把自己的意願寫清楚"], wait: ["先空著再說", "還沒準備好面對"] },
    },
    {
      key: "checkup", lead: `${s.health.chronic ? "回診拿慢性病的藥" : "做老人健檢"}時，家醫科醫師順口問你，有沒有想過預立醫療決定`, ask: "要怎麼做？",
      then: "聽了醫師的話，", away: "笑著跟醫師說還早",
      labels: { sign: ["請醫師安排諮商門診", "把自己的意願寫清楚"], wait: ["笑笑說還早", "還沒準備好面對"], ask: ["請醫師多說一點", "先弄懂再決定"] },
      askOpen: "你請醫師多說一點。",
    },
    {
      key: "papers", lead: `你在整理${docs}的時候，想到還有一件事沒交代清楚：如果有一天自己沒辦法說話了，要不要插管急救`, ask: "要怎麼做？",
      then: "整理完那些文件，", away: "把這件事跟那些文件一起放回抽屜",
      labels: { talk: ["把想法說給家人聽", "讓大家知道你的想法"], wait: ["先放回抽屜", "還沒準備好面對"] },
    },
    kidKin && {
      key: "kin", lead: "{kin}{看了一篇報導|聽完一場講座}，吃飯時小心翼翼地問你，以後如果病重了，想不想被插管急救", ask: "你怎麼想？",
      then: "那頓飯以後，", away: "跟{kin}說以後再談",
      labels: { sign: ["帶{kin}一起去諮商", "把自己的意願寫清楚"], talk: ["好好跟{kin}談一次", "讓孩子知道你的想法"], wait: ["說以後再談", "還沒準備好面對"] },
    },
  ];
}

export const LATER = [
  // ---------- children grown up ----------
  {
    // The youngest child moves out for good.
    id: "l_emptyNest", domain: "family", channel: "change", tags: ["children"], once: true, ages: [55, 80],
    when: s => s.kids.length > 0 && s.kids[s.kids.length - 1].age >= 20 && s.kids[s.kids.length - 1].age <= 32, p: () => 0.15,
    choice: (s, ctx) => {
      const k = s.kids[s.kids.length - 1], v = kidVars(k), video = s.year >= 2011;
      const left = married(s) ? "家裡只剩下你和{partner}兩個人" : "家裡只剩下你一個人";
      return {
        prompt: ctx.w([
          `${s.kids.length > 1 ? "最小的{name}也" : "{name}"}搬出去住了，${left}。空下來的日子要怎麼過？`,
          `{name}拖著行李箱搬去外地工作，{房間一下子空了|門口少了一雙鞋}，${left}。接下來想怎麼過？`,
          `晚餐又煮了太多菜——{name}已經搬出去了。${left}，你想怎麼過接下來的日子？`,
        ], v),
        options: [
          {
            id: "l_emptyNest.room", label: "把孩子的房間改成自己的空間", hint: "書房、畫室或泡茶的角落", act: "hobby", style: "self", weight: 0.2,
            apply: (s2, c) => ({ text: c.w([
              "{name}搬出去以後，你把{t}的房間改成了{書房|畫室|縫紉間|泡茶的小角落}，{撕下牆上的海報時，背面還有{t}國中時寫的名字。|書櫃最上層，還是留著{t}的獎狀和畢業紀念冊。}",
              "孩子都搬出去了，你把{name}的房間{漆成淡淡的綠色，|擺進一張大桌子，}{這輩子第一次有了一間自己的房間。|每天下午在那裡{練字|畫畫|聽老歌}。}",
            ], v), mood: 3 }),
          },
          {
            id: "l_emptyNest.date", label: "和另一半重新約會", hint: "找回兩個人的日子", act: "pursue", style: "family", weight: 0.25, when: married,
            apply: (s2, c) => ({ text: c.w([
              "孩子都搬出去了，你和{partner}{每個星期三晚上固定出去吃飯，|又開始一起去看電影，|週末騎機車去吃年輕時約會常去的那家{牛肉麵|冰店|豆花}，}{好像回到剛認識的時候。|兩個人的話反而變多了。}",
              "家裡只剩下兩個人，{partner}{買了兩張音樂會的票，|提議每天晚飯後一起去散步，}{你們重新學著當一對身邊沒有孩子的夫妻。|你發現{ta}笑起來還是跟年輕時一樣。}",
            ]), mood: 4 }),
          },
          {
            id: "l_emptyNest.class", label: "報名一直想學的課", hint: "社區大學、才藝班", act: "hobby", style: "learn", weight: 0.2,
            apply: (s2, c) => ({ text: c.w("孩子都長大了，你終於報名了{社區大學的{日文|水彩|攝影|烏克麗麗}課|一直想學的{陶藝|古箏|國標舞}}，{每週最期待的就是上課那天。|班上的同學年紀都跟你差不多，下課常常一起去吃飯。|{name}回家時，你還會把作業拿出來給{t}看。}", v), mood: 3 }),
          },
          {
            id: "l_emptyNest.call", label: video ? "固定和孩子視訊" : "固定和孩子通電話", hint: "每週約好一個晚上", act: "talk", style: "family", weight: 0.2,
            apply: (s2, c) => ({ text: c.w([
              `{name}搬出去後，你們說好每個{星期天|星期三}晚上${video ? "視訊" : "通電話"}，{你總是提早十分鐘就坐在${video ? "手機" : "電話"}旁邊。|你會先把要講的事寫在月曆上。|講不到幾句，就開始叮嚀{t}要多吃青菜。}`,
              `{name}搬出去後，你學會了等{t}的${video ? "視訊" : "電話"}，{每次一響就跑過去接，|一講就是一個小時，}{掛掉以後，家裡又安靜下來。|{t}說你比以前還囉唆，語氣卻很開心。}`,
            ], v), mood: 2 }),
          },
          {
            id: "l_emptyNest.dog", label: "領養一隻狗", hint: "每天早晚出門遛狗", act: "care", style: "health", weight: 0.1,
            apply: (s2, c) => ({ text: c.w("家裡太安靜了，你去{收容所|動物之家}領養了一隻{黑色的米克斯|黃色的土狗}，取名叫{旺財|阿福|黑糖|來福}，{每天早晚帶牠去公園散步。|現在換牠每天在門口等你回家。}"), mood: 4 }),
          },
          {
            id: "l_emptyNest.friends", label: "多約朋友出門", hint: "喝茶、爬山、唱歌", act: "socialize", style: "social", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("孩子都搬出去了，你開始{常常|每個週末}約{f}{去喝下午茶，|去爬郊山，|去唱卡拉 OK，|去逛老街，}{才發現自己好久沒有自己的時間了。|手機相簿裡，孩子的照片慢慢換成了朋友的照片。}", { f: oldFriend(s2, c).call }), mood: 3 }),
          },
        ],
      };
    },
  },
  {
    // A grown child gets married (the grandchildren themselves are born in core.js).
    id: "l_kidWedding", domain: "family", channel: "good", tags: ["children"], ages: [55, 95], cooldown: 2,
    when: s => unwed(s).length > 0, p: () => 0.08,
    choice: (s, ctx) => {
      const k = ctx.rng.pick(unwed(s)), son = k.sex === "male";
      const same = s.year >= 2019 && ctx.rng() < 0.02;   // same-sex marriage is legal from 2019-05-24
      const p = ctx.person({ role: "partner", sex: same ? k.sex : son ? "female" : "male", birthYear: k.birthYear + ctx.rng.int(7) - 3 });
      const first = !s.kids.some(x => x.married);
      const v = { ...kidVars(k), inl: p.call, it: pronoun(p), dad: parentWord(s), n: 1 + ctx.rng.int(6), nat: p.nature.word === "工作狂" ? "工作狂" : `${p.nature.word}的人` };
      const wed = out => { k.married = true; k.spouse = p.call; return { ...out, big: first }; };
      return {
        prompt: ctx.w([
          "{name}帶交往{n}年的{inl}回家吃飯，{it}是個{nat}。兩個人說，想要結婚了。這場婚事你想怎麼參與？",
          "{name}打電話回家：「{dad}，我們決定結婚了。」對象是交往{n}年的{inl}。你想怎麼幫這對新人？",
          "{name}和{inl}要結婚了，喜帖的樣本已經放在桌上。你打算怎麼做？",
        ], v),
        options: [
          {
            id: "l_kidWedding.pay", label: "幫忙出錢辦婚禮", hint: "喜宴、婚紗都幫一把", act: "lend", style: "family", weight: 0.3,
            apply: (s2, c) => { spend(s2, 0.6); return wed({ text: c.w("{name}和{inl}結婚，你拿出存了好幾年的一筆錢，{幫忙辦了{二十|三十|四十}桌喜宴，|包下了婚紗照和喜宴的錢，}{敬酒時你一桌一桌跟著走，笑到臉都痠了。|新人上台時，你在台下偷偷擦眼淚。}", v), mood: 6 }); },
          },
          {
            id: "l_kidWedding.respect", label: "尊重他們的決定", hint: "簡單登記也好", act: "reconcile", style: "self", weight: 0.25,
            apply: (s2, c) => wed({ text: c.w("{name}和{inl}要結婚了，兩個人不想辦桌，{只想去戶政事務所登記。|想把錢省下來{付頭期款|去度蜜月}。}你{想了一個晚上，|雖然有點捨不得，}{還是點頭了。登記那天，兩家人一起吃了一頓飯。|最後只請兩家人吃了一頓飯，大家反而聊得很開心。}", v), mood: 3 }),
          },
          {
            id: "l_kidWedding.custom", label: son ? "照老規矩準備聘禮" : "照老規矩準備嫁妝", hint: "提親、訂婚、喜餅，一樣都不少", act: "negotiate", style: "safe", weight: 0.2, when: () => !same,
            apply: (s2, c) => {
              spend(s2, 0.3);
              return wed({ text: son
                ? c.w("{name}要娶{inl}，你{照老規矩準備了大聘、小聘和{十二禮|六禮}，|請了媒人，挑好日子去提親，}{訂婚那天，親家把大聘原封不動退了回來，只收下小聘。|兩家人坐在一起吃飯，聊到很晚。|{兩百|三百}盒喜餅送到了女方家。}", v)
                : c.w("{name}要嫁給{inl}，你{幫{t}準備了一套金飾和一床新棉被當嫁妝，|照老規矩準備了嫁妝，挑好了喜餅的口味，|陪{t}去挑了婚紗，又準備了一份嫁妝，}{出門那天，你在門口潑了一碗水，轉身就紅了眼眶。|親家送來的大聘，你只收下小聘，其他的都退了回去。|上禮車前，{t}回頭跟你說了一聲謝謝。}", v), mood: 4 });
            },
          },
          {
            id: "l_kidWedding.save", label: "提醒他們先存錢", hint: "婚禮一天，日子一輩子", act: "save", style: "safe", weight: 0.15,
            apply: (s2, c) => wed({ text: c.w("{name}和{inl}要結婚了，你{把兩個人叫到家裡，|趁著吃飯的時候，}{提醒他們別把錢都花在婚禮上，先存一筆{頭期款|緊急預備金}。|拿出自己年輕時記帳的本子給他們看。}{inl}{聽得很認真。|笑著說回去就做一張表。}", v), mood: 2 }),
          },
          {
            id: "l_kidWedding.speech", label: "在婚禮上致詞", hint: "把心裡的話說出來", act: "talk", style: "social", weight: 0.1,
            apply: (s2, c) => wed({ text: c.w("{name}和{inl}結婚了。婚禮上，你上台致詞，{準備好的稿子一個字也沒念，|拿著麥克風的手一直在抖，|一開口就哽咽了，}{說起{name}小時候{第一次騎腳踏車|半夜發燒，你抱著{t}跑急診}的事，全場都安靜了。|最後只說了一句：「要好好過日子。」台下的掌聲響了好久。}", v), mood: 5 }),
          },
          {
            id: "l_kidWedding.handmade", label: "親手準備婚禮小物", hint: "喜帖、謝卡、伴手禮", act: "hobby", style: "learn", weight: 0.1,
            apply: (s2, c) => wed({ text: c.w("{name}要結婚了，你{一筆一筆手寫了喜帖上的名字，|學著做了兩百份手工{牛軋糖|鳳梨酥}當婚禮小物，|把{t}從小到大的照片剪成一段婚禮上播的影片，}{新人看了，抱著你哭了。|來的客人都說好用心。}", v), mood: 4 }),
          },
        ],
      };
    },
  },
  {
    // A new grandchild and two working parents: will you help raise the baby? Why they need a hand this time, see
    // grandHelpScenes.
    id: "l_grandkidHelp", domain: "family", channel: "change", tags: ["children"], ages: [55, 80], cooldown: 5, max: 2,
    when: s => s.flags.grandkids > 0 && s.age - (s.last.grandchild ?? -99) <= 2 && !s.abroad && !s.health.serious, p: () => 0.3,
    choice: (s, ctx) => {
      const gs = grandkids(s, ctx), g = gs[gs.length - 1], v = grandVars(g);
      const sc = pickScene(s, ctx, "l_grandkidHelp", grandHelpScenes(s, g)), lead = ctx.w(sc.lead, v);
      const { daily, weekend, move, money, no, share } = sc;
      return {
        prompt: ctx.w(`${lead}。${sc.ask}`, v),
        options: [
          { id: "l_grandkidHelp.daily", label: daily[0], hint: daily[1], act: "care", style: "family", weight: 0.35, apply: (s2, c) => ({ text: c.w(daily[2], v), mood: 3 }) },
          { id: "l_grandkidHelp.weekend", label: weekend[0], hint: weekend[1], act: "care", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(weekend[2], v), mood: 2 }) },
          { id: "l_grandkidHelp.move", label: move[0], hint: move[1], act: "moveHome", style: "family", weight: 0.1, apply: (s2, c) => ({ text: c.w(move[2], v), mood: 2 }) },
          { id: "l_grandkidHelp.money", label: money[0], hint: money[1], act: "hireCare", style: "self", weight: 0.15, apply: (s2, c) => { spend(s2, 0.3); return { text: c.w(money[2], v), mood: 1 }; } },
          { id: "l_grandkidHelp.no", label: no[0], hint: no[1], act: "wait", style: "health", weight: 0.1, apply: (s2, c) => ({ text: c.w(no[2], v), mood: -1 }) },
          { id: "l_grandkidHelp.share", label: share[0], hint: share[1], act: "shareCare", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(share[2], v), mood: 3 }) },
        ],
      };
    },
  },
  {
    id: "l_grandkidDays", domain: "family", channel: "good", tags: ["children"], ages: [55, 105], cooldown: 3,
    when: s => s.flags.grandkids > 0 && !s.abroad, p: () => 0.08,
    apply: (s, ctx) => {
      const g = ctx.rng.pick(grandkids(s, ctx)), v = { ...grandVars(g), exam: exam15Name(s.year) };
      const lines = g.age <= 2 ? [
        "{g}會走路了，搖搖晃晃地撲進你懷裡，{你抱著{gt}轉了一圈。|你笑得比{gt}還開心。}",
        "{g}第一次清楚地叫了一聲「{grand}」，{你高興得打電話告訴每一個人。|你要{pk}再錄一次給你。}",
      ] : g.age <= 6 ? [
        "帶{g}去公園溜滑梯，{你在旁邊追得氣喘吁吁，|{gt}一直喊「{grand}再一次」，}{回家的路上，{gt}在你背上睡著了。|你說明天還要再來。}",
        "{g}在幼兒園畫了一張全家福，{把你畫得最大，|把你的頭髮塗成了紫色，}{你把它貼在冰箱上。|你說這是你收過最好的禮物。}",
      ] : g.age <= 12 ? [
        "每天下午去國小門口接{g}放學，{順路買一杯紅茶給{gt}，|一路聽{gt}講班上的八卦，}{這是你一天裡最期待的時間。|{gt}的書包都是你在揹。}",
        "寒假{g}來住了一個星期，{你教{gt}包水餃，|兩個人每天晚上一起看卡通，}{臨走前{gt}抱著你說還要再來。|你把{gt}留下的畫收進了抽屜。}",
        "{g}教你玩手機遊戲，{你一直輸，|你怎麼按都按不對，}{{gt}笑到在沙發上打滾。|最後{gt}說：「{grand}，我讓你一次。」}",
      ] : g.age <= 18 ? [
        `{g}上${g.age <= 15 ? "國中" : "高中"}了，週末還是會來陪你吃飯，{滑手機的時間比說話多，但你不介意。|還會用新學的英文考你。}`,
        g.age === 15 || g.age === 16
          ? "{g}考完{exam}，你包了一個大紅包，{gt}{害羞地說謝謝。|偷偷跟你說，其實考得不太好。}{你說考得怎樣都沒關係。|你說{grand}以前也考過不好。}"
          : "{g}的{畢業典禮|運動會}，你坐在最前排，{幫{gt}拍了好多照片。|{gt}在台上偷偷跟你揮手。}",
      ] : g.age <= 22 ? [
        "{g}上大學了，臨走前{抱了你一下，|塞給你一張手寫的卡片，}{你站在門口看了好久。|說放假就回來看你。}",
        "{g}放假回來，{第一件事就是來找你吃飯，|帶了一盒學校附近有名的點心給你，}{講了一整個下午的大學生活。|你聽不太懂，卻一直點頭。}",
      ] : [
        "{g}領到第一份薪水，{請你去吃了一頓飯，|買了一件外套送你，}{你逢人就說。|你捨不得穿，掛在衣櫃最外面。}",
        "{g}工作以後，還是每個月回來看你，{帶你去吃{gt}公司附近的餐廳，|幫你把手機裡的照片整理好，}{你看著{gt}，想起{gt}小時候黏著你的樣子。|臨走前，{gt}塞了一個紅包給你。}",
      ];
      return { text: ctx.w(lines, v), mood: 3 };
    },
  },

  // ---------- retirement ----------
  {
    // The first months of retirement. The moment the question comes up, and how its answers begin, see retireScenes.
    id: "l_retiredLife", once: true, ages: [55, 80], when: s => justRetired(s, 2) && !s.abroad, p: () => 0.45,
    choice: (s, ctx) => {
      const gs = s.flags.grandkids > 0 ? grandkids(s, ctx) : [], g = gs.length ? gs[gs.length - 1] : null;
      const home = s.birthCounty && s.birthCounty !== s.county && !CITY.includes(s.birthCounty) ? s.birthCounty : null;
      const pro = ["college", "graduate"].includes(tier(s.edu)) || s.career >= 2;
      const share = s.kids.length ? "孩子" : "老朋友";
      const grown = adultKids(s, 22), pals = s.friends.filter(x => x.alive !== false && x.call);
      const sv = { f: pals.length ? ctx.rng.pick(pals).call : "老朋友", k: grown.length ? ctx.rng.pick(grown).call : "孩子" };
      const sc = pickScene(s, ctx, "l_retiredLife", retireScenes(s, pro, pals.length > 0)), open = ctx.w(sc.open, sv);
      const named = (key, label, hint) => (sc.labels && sc.labels[key] ? { label: sc.labels[key][0], hint: sc.labels[key][1] } : { label, hint });
      const travel = {
        id: "l_retiredLife.travel", ...named("travel", "到處去旅行", "趁走得動多看看"), act: "travel", style: "self", weight: 0.25,
        apply: (s2, c) => { plan(s2, "travel"); c.remember("l_retiredLife", "退休後開始到處旅行", { mood: 4 }); spend(s2, 0.3); return { text: c.w([
          `${open}${married(s2) ? "你和{partner}說走就走" : "你一個人背起了背包"}，{第一站就去了{trip}，|一年出去{兩|三}趟，}{行李箱上的貼紙一年比一年多。|手機裡存滿了風景照，每一張都要傳給${share}看。}`,
          `${open}你{報名了旅行團，|和老同事組了一個旅遊團，}{把以前沒空去的地方一個一個去，|第一站就去了{trip}，}{家裡的冰箱貼滿了各地的磁鐵。|你說以前上班沒空，現在要一次補回來。}`,
        ]), mood: 5 }; },
      };
      const volunteer = {
        id: "l_retiredLife.volunteer", ...named("volunteer", "去當志工", "把時間給需要的人"), act: "volunteer", style: "social", weight: 0.2,
        apply: (s2, c) => {
          const place = c.rng.pick(["火車站的服務台", "博物館", "社區關懷據點", "動物收容所", "國小的圖書室", "公園的導覽站"]);
          plan(s2, "volunteer", place); c.remember("l_retiredLife", `退休後開始到${place}當志工`, { mood: 4 });
          return { text: c.w([
            `${open}你到{place}當志工，{穿上背心的那一刻，覺得自己又有了一份工作。|認識了一群一起值班的新朋友。|每週固定去{兩|三}個早上，比上班還準時。}`,
            `${open}你每週去{place}幫忙，{有人叫你一聲「志工{elder}」，你就笑開了。|你說，被需要的感覺真好。}`,
          ], { place, elder: s2.sex === "male" ? "阿伯" : "阿姨" }), mood: 4 };
        },
      };
      const learn = {
        id: "l_retiredLife.learn", ...named("learn", "學一樣才藝", "樂器、跳舞、畫畫"), act: "hobby", style: "learn", weight: 0.2,
        apply: (s2, c) => {
          const [skill, show] = c.rng.pick(SKILLS);
          plan(s2, "learn", skill, { show }); c.remember("l_retiredLife", `退休後開始學${skill}`, { mood: 4 });
          return { text: c.w([
            `${open}你開始學{skill}，{每天在家練一個小時，|每週去{city}的文化中心上課，}{老師說你進步得很快。|你說，學東西真的不怕晚。}`,
            `${open}你報名了{skill}課，{班上同學的平均年紀七十歲，|第一堂課你就坐在第一排，}{你是最認真做筆記的那一個。|下課後大家還會一起去喝茶。}`,
          ], { skill }), mood: 4 };
        },
      };
      const grand = g && {
        id: "l_retiredLife.grandkids", ...named("grandkids", `專心陪${g.call}長大`, "含飴弄孫"), act: "care", style: "family", weight: 0.25,
        apply: (s2, c) => { plan(s2, "grandkids", g.call); c.remember("l_retiredLife", `退休後專心陪${g.call}長大`, { mood: 4 }); return { text: c.w([
          `${open}你把大部分的時間給了{g}：${g.age < 3 ? "{每天幫忙泡奶、哄睡，|推著娃娃車到處逛，}" : "{每天接送上下學，|陪{gt}寫功課、去公園，}"}{你說這比上班還累，臉上卻一直在笑。|{pk}說幸好有你。|鄰居都說你看起來年輕了十歲。}`,
          `${open}你成了{g}最好的玩伴，{一起在陽台種豆芽，|一起去圖書館聽故事，|一起去公園餵魚，}{{gt}最常說的一句話是「{grand}陪我」。|你的行事曆上寫滿了{g}的名字。}`,
        ], grandVars(g)), mood: 4 }; },
      };
      const farm = {
        id: "l_retiredLife.farm", ...named("farm", home ? "回鄉下種田" : "去郊區租地種菜", home ? `回${home}的老家` : "當個假日農夫"), act: "familyBusiness", style: "health", weight: 0.15,
        apply: (s2, c) => {
          const crop = c.rng.pick(["高麗菜", "地瓜", "絲瓜", "芭樂", "玉米", "空心菜"]);
          plan(s2, "farm", crop); c.remember("l_retiredLife", home ? `退休後搬回${home}的老家種田` : "退休後在郊區租了一塊地種菜", { mood: 4 });
          if (home) s2.county = home;
          return { text: home
            ? c.w(`${open}你搬回{home}的老家，{整理了荒廢多年的那塊田，|在老家後面闢了一塊菜園，}種起了{crop}，{每天天一亮就去巡田。|收成時分送給左鄰右舍。}`, { home, crop })
            : c.w(`${open}你在郊區租了一小塊地，{每個週末去種{crop}，|跟著老農夫學怎麼堆肥、搭棚架，}{第一次收成時，你拍照傳給所有人看。|曬得黑黑的，身體反而比上班時好。}`, { crop }), mood: 4 };
        },
      };
      const shop = s.savings >= 1.2 && !s.health.serious && {
        id: "l_retiredLife.shop", ...named("shop", "開一間小店", "圓一個當老闆的夢"), act: "startup", style: "risk", weight: 0.1,
        apply: (s2, c) => {
          const kind = c.rng.pick(SHOPS);
          plan(s2, "shop", kind); spend(s2, 0.8); c.arc.start("l_shop", { kind }, 2);
          // big: the first clause is what memoryLane quotes years later, so it stays 退休後你在巷口開了一間…
          return { text: c.w(`退休後你在巷口開了一間{kind}，用的是${sc.key === "pension" ? "退休金和" : ""}存了半輩子的錢。{每天一早就去開門，|店裡的擺設都是自己一樣一樣挑的，}{開幕那天，老同事都來捧場。|第一個月，熟客就記住了你的名字。}`, { kind }), mood: 4, big: true };
        },
      };
      const consult = s.job && s.job.field !== "家業" && {
        id: "l_retiredLife.consult", ...named("consult", pro ? "兼差當顧問" : "回去帶新人", "老本行還用得上"), act: "sideJob", style: "safe", weight: 0.1,
        apply: (s2, c) => {
          plan(s2, "consult", pro ? "顧問" : "帶新人"); s2.savings += 0.3; c.remember("l_retiredLife", pro ? "退休後回去當顧問" : "退休後回去帶新人", { mood: 3 });
          return { text: pro
            ? c.w(`${open}{以前的公司|老客戶|朋友的公司}找你回去當顧問，{一個星期去兩天，|有案子才去，}{薪水不多，但被需要的感覺很好。|你把幾十年的經驗一點一點交給年輕人。}`)
            : c.w(`${open}以前的老闆找你回去帶新人，{一個星期去三個早上，|只教不做，}{你把當{job}幾十年的訣竅一點一點教給年輕人。|年輕人都叫你一聲{前輩|老師}。}`), mood: 3 };
        },
      };
      const options = [travel, volunteer, learn, grand, farm, shop, consult].filter(Boolean);
      // Six at most: when everything applies, one of the side paths waits for another life.
      if (options.length > 6) options.splice(options.indexOf(ctx.rng() < 0.5 ? shop : consult), 1);
      if (options.length > 6) options.pop();
      return { prompt: ctx.w(sc.prompt, sv), options };
    },
  },
  {
    id: "l_firstWeekday", once: true, ages: [55, 80], when: s => justRetired(s, 1) && !s.abroad, p: () => 0.4,
    apply: (s, ctx) => ({ text: ctx.w([
      "退休後的第一個星期一，你不用趕著出門，{去菜市場繞了一圈，才發現平日早上的市場這麼熱鬧。|在公園看了一整個早上的人下棋。|坐在早餐店裡，把報紙從第一版看到最後一版。}",
      `退休後的第一個上班日，{鬧鐘沒響，你卻還是準時醒來。|${s.year >= 2012 ? "你醒來時，手機裡的工作群組還在跳訊息。" : "電話一響，你還以為是公司打來的。"}}{你躺回床上，對著天花板笑了。|你乾脆起床，去河堤走了一圈。}`,
      "退休後第一次在平日{去銀行|去郵局|去回診}，{不用請假，也不用趕時間，|排隊的人都跟你一樣頭髮花白，}{你忽然覺得有點好笑。|心裡有一種說不出的輕鬆。}",
      married(s)
        ? "退休後的第一個月，你{把家裡每一個抽屜都整理了一遍，|把陽台的花全部換過一輪，}{partner}{笑你閒不下來。|說家裡突然多了一個管家。}"
        : "退休後的第一個月，你{把家裡每一個抽屜都整理了一遍，|把陽台的花全部換過一輪，}{才發現自己不太知道怎麼休息。|鄰居笑你比上班還忙。}",
    ]), mood: 2 }),
  },
  {
    // Some years into the retirement chosen in l_retiredLife.
    id: "l_planLater", once: true, ages: [58, 95], p: () => 0.12,
    when: s => s.flags.l_plan && s.flags.l_plan.kind !== "shop" && s.age - s.flags.l_plan.at >= 3 && s.age - s.flags.l_plan.at <= 10 && !s.health.serious,
    apply: (s, ctx) => {
      const { kind, what, show } = s.flags.l_plan, share = s.kids.length ? "孩子和老朋友" : "老朋友";
      if (kind === "travel") return { text: ctx.w("退休後到處旅行了幾年，{行李箱換了第二個，|家裡的冰箱貼滿了各地的磁鐵，}{你把每一趟的照片都做成相簿，一本一本排在書架上。|朋友都說你比年輕人還常出門。}"), mood: 4 };
      if (kind === "volunteer") return { text: ctx.w("在{place}當志工滿{三|五}年，{拿到了一張服務獎狀，|大家幫志工們辦了一場感恩茶會，}{你把背心洗得乾乾淨淨，繼續值班。|你說這是退休後做過最有意義的事。}", { place: what }), mood: 4 };
      if (kind === "learn") return { text: ctx.w(show === "stage"
        ? "學{skill}學了好幾年，{你在{city}文化中心的成果發表會上台表演，|社區晚會請你上台表演一段，}{台下的掌聲響了好久。|家人都坐在第一排幫你錄影。}"
        : "學{skill}學了好幾年，{你的作品在{city}文化中心的成果展展出，|你的作品被掛在社區活動中心的牆上，}{家人都來看了。|你站在作品旁邊，笑得有點害羞。}", { skill: what }), mood: 4 };
      if (kind === "grandkids") {
        const gs = grandkids(s, ctx), g = gs.find(x => x.call === what) || gs[0];
        return { text: g
          ? ctx.w(g.age < 6
            ? "你陪著長大的{g}{會自己騎腳踏車了，|會自己綁鞋帶了，}{每次看到你就撲過來抱你。|最愛吃{grand}煮的稀飯。}"
            : g.age <= 11
              ? `你陪著長大的{g}${g.age <= 7 ? "上國小了，" : "在學校拿到了一張獎狀，"}{{gt}在作文裡寫：「我最喜歡的人是{grand}。」|放學回家的第一件事，就是跑來跟你說學校的事。}`
              : `你陪著長大的{g}${g.age <= 15 ? "上國中了" : g.age <= 18 ? "上高中了" : "上大學了"}，{還是常常打電話給你。|放假時常回來陪你吃飯。|個子都比你高了，還是會跟你撒嬌。}`, grandVars(g))
          : ctx.w("退休後陪孫子的這幾年，{你的手機裡全是孩子們的照片，|你學會了好幾首兒歌，}{你說這是你最忙、也最開心的日子。|你覺得自己好像也跟著長大了一次。}"), mood: 4 };
      }
      if (kind === "farm") return { text: ctx.w(`種菜種了幾年，{你種的{crop}今年大豐收，|你的菜園成了左鄰右舍的菜市場，}{寄了好幾箱給${share}。|皮膚曬得黑黑的，身體比上班時還好。}`, { crop: what }), mood: 4 };
      return { text: ctx.w(what === "顧問"
        ? "當了幾年顧問，{你帶過的年輕人都升上主管了，|你把幾十年的筆記整理成一本手冊，}{你決定這次真的退休了。|最後一次開會，大家幫你辦了一場小小的歡送會。}"
        : "帶新人帶了幾年，{你教出來的徒弟都能獨當一面了，|你把幾十年的訣竅寫成一本筆記，}{你決定這次真的退休了。|最後一天，年輕人合送了你一個蛋糕。}"), mood: 4 };
    },
  },
  {
    // The little shop opened in l_retiredLife: two years in, and later handed on.
    id: "l_shopYear", domain: "wealth", channel: "change", ages: [55, 110],
    when: (s, ctx) => ctx.arc.at("l_shop", "start") || ctx.arc.at("l_shop", "keep"), p: () => 1,
    apply: (s, ctx) => {
      const a = s.arcs.l_shop, v = { kind: a.data.kind, boss: s.sex === "male" ? "老闆" : "老闆娘" };
      if (a.stage === "keep") {
        ctx.arc.end("l_shop", "handedOn");
        return { text: ctx.w([
          "{kind}開了好幾年，{你的體力大不如前，|膝蓋站一整天受不了了，}你把店交給了一直來幫忙的年輕人，{偶爾還是會回去坐坐。|熟客說，店裡的感覺一點都沒變。}",
          "{kind}開了好幾年，你決定在生日那天熄燈。{最後一天，熟客排到了巷口。|你親手把招牌擦得乾乾淨淨。}{你說，這幾年賺到最多的是朋友。|關上鐵門時，你笑著跟大家揮手。}",
        ], v), mood: 2 };
      }
      if (ctx.roll("wealth", "good", 0.45)) {
        s.savings += 0.3; ctx.arc.go("l_shop", "keep", 4 + ctx.rng.int(4));
        return { text: ctx.w([
          "你的{kind}開了兩年，{熟客越來越多，|成了巷子裡大家聊天的地方，}{雖然賺得不多，每個月都打平了。|你說這是退休後最好的決定。}",
          "{kind}開到第二年，{附近的學生都叫你{boss}，|你記得每一位熟客的喜好，}{生意不大，卻很穩。|你每天都有說不完的話。}",
        ], v), mood: 6 };
      }
      spend(s, 0.3); ctx.arc.end("l_shop", "closed");
      return { text: ctx.w("你的{kind}撐了兩年，{房租和材料一直漲，|客人始終不夠多，}{最後還是收了。|最後一天，熟客送了你一束花。}{你說，至少圓了一個夢。|賠了一些錢，但你不後悔。}", v), mood: -3 };
    },
  },
  {
    id: "l_seniorCollege", domain: "study", channel: "good", once: true, ages: [60, 85], when: s => (s.retired || s.age >= 65) && !s.abroad && !s.health.serious, p: () => 0.025,
    apply: (s, ctx) => ({ text: ctx.w([
      "報名了{city}的長青學苑，{選了{日文|英文|電腦|歌唱|手機攝影}班，|一口氣報了兩門課，}{班上年紀最大的同學已經八十八歲了。|期末成果發表會上，你站在第一排。}",
      "去長青學苑上課，{老師年輕得可以當你的孩子，|同學們上課前會先互相量血壓，}{大家都叫你「{senior}」。|下課後一群人一起去吃豆花。}",
      "長青學苑開學那天，你{背著新買的帆布袋，|帶著老花眼鏡和筆記本，}{像小學生一樣提早半小時到。|在教室門口遇到了好多年沒見的老鄰居。}",
    ], { senior: s.sex === "male" ? "學長" : "學姊" }), mood: 3 }),
  },
  {
    id: "l_communityMeal", ages: [65, 105], cooldown: 4, max: 3, when: s => !s.abroad, p: () => 0.04,
    apply: (s, ctx) => {
      const late = s.rel === "widowed" ? lateSpouse(s) : null;
      return { text: ctx.w([
        "里民活動中心每週辦長輩共餐，{每週二、四的中午|每個星期三}你都去報到，{吃完飯還量血壓、做健康操。|志工阿姨記得你不吃香菜。|大家輪流帶自己種的菜來加菜。}",
        "去社區關懷據點共餐，{一桌十個人圍著圓桌，|大家各自帶了一道小菜，}{聊的都是孫子和膝蓋。|吃完飯一起唱卡拉 OK。|飯後還有志工來教大家玩桌遊。}",
        "社區共餐{遇到過節加菜，|今天換成辦桌，}{你帶了自己滷的{豆干|海帶|滷蛋}去分大家。|里長也來跟大家一起吃。}",
        "社區共餐那天，{你被排去幫忙打菜，|輪到你帶大家做飯前操，}{一邊忙一邊跟老鄰居說笑。|大家都說今天的菜特別好吃。}",
        late && "{late}走了以後，你很少好好吃飯。里長邀你去社區共餐，{第一次去就被大家拉著坐在中間。|現在每週都去，那裡有人會等你。}",
      ].filter(Boolean), { late: late ? late.call : "" }), mood: 3 };
    },
  },
  {
    id: "l_hiking", domain: "health", channel: "good", ages: [55, 85], cooldown: 5, max: 2, when: s => !s.abroad && !s.health.serious, p: () => 0.04,
    apply: (s, ctx) => ({ text: ctx.w([
      "跟著社區的健行隊去走{trail}，{一群人邊走邊唱歌，|中途在涼亭分水果吃，}{走完全程時，隊長給你比了一個讚。|那天晚上你睡得特別好。}",
      "每天清晨五點半去走{trail}，{步道旁的涼亭有一群固定的老朋友，|半路上的奉茶站總有人泡好一壺熱茶，}{大家叫不出彼此的名字，但每天都會打招呼。|有人帶收音機，有人帶甩手操。}",
      "{加入了里長辦的|跟著社區發展協會辦的}健走活動，{拿著登山杖、戴著斗笠，|一路走一路認路邊的野花，}{一年下來走了{二十|三十}幾條步道。|走得比年輕人還快。}",
    ], { trail: trail(s, ctx) }), mood: 3 }),
  },
  {
    id: "l_roundIsland", domain: "move", channel: "change", once: true, ages: [58, 80], when: s => !s.abroad && !s.health.serious, p: () => 0.02,
    choice: (s, ctx) => {
      const gs = s.flags.grandkids > 0 ? grandkids(s, ctx).filter(x => x.age >= 6 && x.age <= 18) : [];
      const g = gs.length ? ctx.rng.pick(gs) : null;
      const group = s.year >= 2012 ? "回來後多了一個 LINE 群組。" : "回來後通訊錄裡多了好幾個電話。";
      const keep = (c, how) => c.remember("l_roundIsland", how, { mood: 5 });
      return {
        prompt: ctx.w([
          "一直想環島一圈，這次終於排出了時間。要怎麼去？",
          "看到新聞說好多長輩都在環島，你也心動了。要怎麼環島？",
          married(s) ? "{partner}說：「趁還走得動，我們去環島吧。」要怎麼去？" : "{age} 歲生日那天，你決定今年一定要環島一圈。要怎麼去？",
        ]),
        options: [
          {
            id: "l_roundIsland.train", label: "搭火車慢慢晃", hint: "一站一站停，吃遍鐵路便當", act: "travel", style: "learn", weight: 0.3,
            apply: (s2, c) => { spend(s2, 0.1); keep(c, "搭火車環島一圈"); return { text: c.w([
              "你搭火車環島，{在{池上|關山|福隆}下車吃便當，|每到一站就買一個當地的便當，}{花東的海一路陪著你。|十二天後回到家，曬黑了一圈。}",
              "你買了一張環島的火車票，{坐在靠窗的位子看了一路的稻田和海，|在{台東|花蓮|屏東}的小站下車亂逛，}{遇到一位也在環島的{阿伯|阿姨}，兩個人聊了一路。|你把每一張車票都收進了筆記本。}",
            ]), mood: 5 }; },
          },
          {
            id: "l_roundIsland.drive", label: "自己開車", hint: "想停就停", act: "travel", style: "self", weight: 0.25,
            apply: (s2, c) => { spend(s2, 0.15); keep(c, "開車環島一圈"); return { text: c.w(`${married(s2) ? "你載著{partner}" : "你一個人"}開車環島，{走蘇花公路時，一邊是山，一邊是海，|在南迴公路旁的小攤買了一袋{釋迦|洛神花}，}{想停就停，走了兩個星期。|在每一個休息站都蓋了紀念章。}`), mood: 5 }; },
          },
          {
            id: "l_roundIsland.bike", label: "騎腳踏車環島", hint: "挑戰自己的體力", act: "exercise", style: "risk", weight: 0.1, when: s2 => s2.age <= 72,
            apply: (s2, c) => { keep(c, "騎腳踏車環島一圈"); return { text: c.w("{age} 歲的你騎腳踏車環島，{九天騎了九百多公里，|每天騎八十公里，}{在{楓港|壽豐|池上}的路邊，老闆請了你一杯冬瓜茶。|回到起點時，車友們拉起布條歡迎你。}{膝蓋痠了一個星期，但你一點都不後悔。|你在終點拍了一張照片，傳給所有人看。}"), mood: 6 }; },
          },
          {
            id: "l_roundIsland.tour", label: "跟旅行團", hint: "什麼都不用煩惱", act: "travel", style: "safe", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.12); keep(c, "跟著旅行團環島一圈"); return { text: c.w(`你跟著{農會|社區|旅行社}辦的環島團，{一車都是年紀差不多的人，|導遊一路講笑話，}{八天七夜吃了好多{海產|小吃}，|在太魯閣幫大家拍了團體照，}{${group}|還和團員約好明年再一起出去。}`), mood: 4 }; },
          },
          {
            id: "l_roundIsland.friends", label: "和老朋友一起", hint: "幾個人包一台車", act: "socialize", style: "social", weight: 0.15,
            apply: (s2, c) => { keep(c, "和老朋友一起環島"); return { text: c.w("你和{f}幾個老朋友{包了一台小巴|租了一台九人座}環島，{一路上講年輕時的糗事，|每晚在民宿打牌聊天到半夜，}{笑到肚子痛。|約好每年都要再來一次。}", { f: oldFriend(s2, c).call }), mood: 5 }; },
          },
          {
            id: "l_roundIsland.grandkid", label: g ? `帶${g.call}一起去` : "帶孫子一起去", hint: "三代同遊", act: "travel", style: "family", weight: 0.15, when: () => !!g,
            apply: (s2, c) => { spend(s2, 0.12); keep(c, `帶著${g.call}環島`); return { text: c.w("你帶著{g}環島，{一路教{gt}認台灣的地名，|在墾丁的沙灘上一起堆沙堡，}{{gt}說這是最棒的暑假。|回來後，{gt}把照片做成了學校的作業。}", grandVars(g)), mood: 6 }; },
          },
        ],
      };
    },
  },
  {
    // For 公部門 retirees once the 2018 pension reform is in force (era.js tells the year it started).
    id: "l_pension", domain: "wealth", channel: "bad", once: true, ages: [55, 105],
    when: s => s.year >= 2019 && s.year <= 2024 && s.retired && s.job && s.job.field === "公部門" && !s.abroad, p: () => 0.4,
    choice: (s, ctx) => {
      const ks = adultKids(s, 22), k = ks.length ? ctx.rng.pick(ks) : null;
      return {
        prompt: ctx.w([
          "公教年金改革上路後，你的月退一年比一年少一點。往後的日子要怎麼調整？",
          "年改之後，{優惠存款的利息砍了，|所得替代率每年往下調，}月退少了一截。你打算怎麼辦？",
          "和老同事聚會時，大家聊的都是年改後月退又少了多少。你的日子要怎麼調整？",
        ]),
        options: [
          {
            id: "l_pension.frugal", label: "精打細算過日子", hint: "少出國、少外食", act: "save", style: "safe", weight: 0.4,
            apply: (s2, c) => ({ text: c.w("年改後月退少了，你{開始記帳，|把出國旅行改成國內的小旅行，|改去黃昏市場買菜，|把家裡的第四台停了，}{一個月算下來，其實也過得去。|和老同事見面時，大家交換的都是省錢的撇步。|你說，日子簡單一點也好。}"), mood: -1 }),
          },
          {
            id: "l_pension.savings", label: "動用存款，照原本的生活", hint: "辛苦一輩子了", act: "wait", style: "self", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.3); return { text: c.w("年改後月退少了一截，你想了想，{還是照原本的步調過日子，|每年的旅行照樣去，|過年的紅包也照樣包，}{差額就從存款裡補。|你說辛苦了一輩子，不想再委屈自己。|存款少一點，心情好一點。}"), mood: 0 }; },
          },
          {
            id: "l_pension.side", label: "找份兼差", hint: "補上差額", act: "sideJob", style: "risk", weight: 0.15,
            apply: (s2, c) => { s2.savings += 0.2; return { text: c.w("年改後月退少了，你{去補習班兼課，|到社區大學開了一門課，|去朋友的公司幫忙處理文書，}{一個星期去兩三天，|賺的錢剛好補上差額，}{反而覺得日子更有勁。|你說，有事做比較不會胡思亂想。}"), mood: 1 }; },
          },
          {
            id: "l_pension.kids", label: "和孩子商量", hint: "一家人一起想辦法", act: "talk", style: "family", weight: 0.15, when: () => !!k,
            apply: (s2, c) => ({ text: c.w("年改後月退少了，你{找{name}商量，|吃飯時跟{kids}提起，}{{name}說以後每個月給你一點孝親費。|大家一起把家裡的開銷重新算了一遍。}{你嘴上說不用，心裡很暖。|你這才發現孩子真的長大了。}", k ? kidVars(k) : {}), mood: 2 }),
          },
          {
            id: "l_pension.plan", label: "重新規劃理財", hint: "請專業的人幫忙算", act: "invest", style: "learn", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("年改後月退少了，你{去銀行找理專，|上了幾堂理財課，}{把存款重新分配，買了一些債券和定存，|重新算了一次往後二十年的開銷，}{心裡踏實多了。|發現其實沒有想像中那麼糟。}"), mood: 1 }),
          },
        ],
      };
    },
  },

  // ---------- the body, gently ----------
  {
    id: "l_cataract", domain: "health", channel: "bad", ages: [60, 105], max: 2, cooldown: 3,
    when: s => !s.flags.l_eyes && !s.abroad, p: s => (s.age < 65 ? 0.02 : s.age < 75 ? 0.04 : 0.05),
    choice: (s, ctx) => {
      const ks = adultKids(s, 22), k = ks.length ? ctx.rng.pick(ks) : null;
      const gs = s.flags.grandkids > 0 ? grandkids(s, ctx) : [];
      const done = s2 => { s2.flags.l_eyes = true; };
      return {
        prompt: s.flags.l_eyesWait
          ? ctx.w("拖了幾年，眼前的霧越來越濃，{連樓梯都看不太清楚了。|看電視只看得到人影。}醫生說白內障該處理了。這次要怎麼做？")
          : ctx.w([
            "看東西越來越霧，晚上看路燈都有一圈光暈。眼科醫生說是白內障，建議開刀。要怎麼做？",
            `看報紙要拿得越來越遠，連${gs.length ? gs[0].call : "家人"}的臉都看不太清楚了。醫生說是白內障。要怎麼辦？`,
            "眼前好像蒙著一層毛玻璃。眼科醫生說，白內障已經可以開刀了。你的決定是？",
          ]),
        options: [
          {
            id: "l_cataract.nhi", label: "用健保開刀", hint: "單焦點的人工水晶體", act: "seeDoctor", style: "health", weight: 0.45,
            apply: (s2, c) => { done(s2); return { text: c.w("白內障開刀{只花了二十分鐘，|是局部麻醉，你全程都醒著，}{拆掉眼罩那天，你才發現家裡的牆原來這麼白。|隔天就看清楚了月曆上的小字。}{只是看近的時候還是要戴老花眼鏡。|醫生交代一個月內不要揉眼睛。}"), mood: 3 }; },
          },
          {
            id: "l_cataract.premium", label: "自費多焦點水晶體", hint: "看遠看近都清楚，比較貴", act: "seeDoctor", style: "self", weight: 0.2,
            apply: (s2, c) => { done(s2); spend(s2, 0.25); return { text: c.w("白內障開刀時，你自費換了{多焦點|延伸焦段}的人工水晶體，{兩隻眼睛加起來快二十萬，|一隻眼睛{七|八|九}萬多，}{開完刀連老花眼鏡都不用戴了。|晚上看燈還是有一點光圈，但看書、看手機都清楚了。}"), mood: 3 }; },
          },
          {
            id: "l_cataract.wait", label: "再等等，還看得到", hint: "一想到眼睛動刀就怕", act: "wait", style: "safe", weight: 0.2,
            apply: (s2, c) => { s2.flags.l_eyesWait = true; return { text: c.w("醫生說是白內障，你{覺得還看得到，|一聽到要在眼睛上動刀就怕，}決定再等等。{看報紙改用放大鏡，|晚上就不出門了，}{日子照樣過。|家人一直勸你早點去開。}"), mood: -1 }; },
          },
          {
            id: "l_cataract.kid", label: "請孩子陪你去開", hint: "有人陪比較安心", act: "seekHelp", style: "family", weight: 0.15, when: () => !!k,
            apply: (s2, c) => { done(s2); return { text: c.w("白內障開刀那天，{name}請假陪你去醫院，{手術完牽著你的手走出來，|之後一個月天天幫你點眼藥水，}{你想起{t}小時候，也是你這樣牽著{t}的。|你嘴上說自己可以，心裡卻很高興。}", k ? kidVars(k) : {}), mood: 4 }; },
          },
          {
            id: "l_cataract.second", label: "多問一家醫院", hint: "聽聽另一位醫生怎麼說", act: "seeDoctor", style: "learn", weight: 0.1,
            apply: (s2, c) => { done(s2); return { text: c.w("醫生說是白內障，你{又去了一家醫學中心|找了朋友推薦的眼科}再問一次，{兩位醫生的說法一樣，|第二位醫生畫圖解釋得很清楚，}{你才放心排了刀。開完刀，世界一下子亮了起來。|你安心地開了刀，現在看東西清楚多了。}"), mood: 3 }; },
          },
        ],
      };
    },
  },
  {
    id: "l_hearing", domain: "health", channel: "bad", ages: [63, 105], max: 2, cooldown: 4,
    when: s => !s.flags.l_hearingAid, p: s => (s.age < 70 ? 0.02 : 0.04),
    choice: (s, ctx) => {
      const ks = adultKids(s, 22), k = ks.length ? ctx.rng.pick(ks) : null;
      const gs = s.flags.grandkids > 0 ? grandkids(s, ctx) : [];
      const aid = s2 => { s2.flags.l_hearingAid = true; spend(s2, 0.15); };
      return {
        prompt: ctx.w([
          married(s) && "電視越開越大聲，{partner}說連隔壁都聽得到了；跟人說話時，你也常常要問「啊？」。要怎麼辦？",
          gs.length && `最近常聽不清楚別人說話，${gs[0].call}在電話裡講什麼，你都只能說「好、好」。要怎麼辦？`,
          "跟朋友吃飯時，大家都笑了，你卻沒聽到笑點。耳朵好像越來越不靈光了。要怎麼辦？",
          "最近常常有人叫你，你卻沒聽見，等對方拍了你的肩膀才回頭。要怎麼辦？",
        ].filter(Boolean)),
        options: [
          {
            id: "l_hearing.aid", label: "去配助聽器", hint: "花點錢，聽得清楚", act: "seeDoctor", style: "health", weight: 0.35,
            apply: (s2, c) => { aid(s2); return { text: c.w("你去耳鼻喉科做了聽力檢查，配了一副助聽器。{戴上的那一刻，你聽到了冷氣的聲音和窗外的鳥叫，|第一次戴著出門，連自己的腳步聲都覺得好大聲，}{差點哭出來。|過了兩個星期才慢慢習慣。}"), mood: 2 }; },
          },
          {
            id: "l_hearing.check", label: "先去檢查原因", hint: "說不定只是小問題", act: "seeDoctor", style: "learn", weight: 0.2,
            apply: (s2, c) => {
              if (c.rng() < 0.4) return { text: c.w("你去耳鼻喉科檢查，醫生說是耳垢塞住了。{清完的那一刻，世界突然變得好吵。|醫生笑著說，很多長輩都是這樣。}{回家後，你把電視的音量調小了一大半。|你有點不好意思，又覺得好笑。}"), mood: 3 };
              aid(s2);
              return { text: c.w("你去耳鼻喉科檢查，醫生說是年紀到了的聽力退化，{給你看了一張往下掉的聽力曲線，|建議你配助聽器，}{你挑了一副小小的耳內型助聽器。|你決定先從聚餐和看電視時戴起。}"), mood: 1 };
            },
          },
          {
            id: "l_hearing.cope", label: "將就一下", hint: "電視開字幕、請大家講大聲點", act: "wait", style: "safe", weight: 0.25,
            apply: (s2, c) => ({ text: c.w("耳朵越來越不靈光，你{把電視的字幕打開，|請家人講話時面對著你，}{能聽多少算多少。|日子也還過得去，只是聚會時話變少了。}"), mood: -1 }),
          },
          {
            id: "l_hearing.pretend", label: "裝作聽得到", hint: "不想被當成老人", act: "avoid", style: "self", weight: 0.1,
            apply: (s2, c) => ({ text: c.w("聽不清楚的時候，你{就笑一笑、點點頭，|就說「好、好、好」，}{結果答應了一件自己根本沒聽清楚的事。|把「去吃火鍋」聽成了「去買火鍋料」。}{後來大家才知道，你是沒聽到。|你自己也笑了出來。}"), mood: -2 }),
          },
          {
            id: "l_hearing.family", label: "請家人陪你挑助聽器", hint: "一起去比較放心", act: "seekHelp", style: "family", weight: 0.15, when: () => !!k,
            apply: (s2, c) => { aid(s2); return { text: c.w("耳朵越來越不靈光，{name}陪你去聽力中心，{一家一家試戴，|幫你問清楚保固和調整的事，}{最後挑了一副{name}說「完全看不出來」的助聽器。|回家的路上，你第一次聽清楚{name}說話的聲音有多溫柔。}", k ? kidVars(k) : {}), mood: 3 }; },
          },
        ],
      };
    },
  },
  {
    id: "l_memory", domain: "health", channel: "bad", ages: [66, 110], cooldown: 4, max: 3, p: () => 0.05,
    apply: (s, ctx) => {
      const gs = s.flags.grandkids > 0 ? grandkids(s, ctx) : [], g = gs.length ? ctx.rng.pick(gs) : null;
      const k = s.kids.length ? ctx.rng.pick(s.kids) : null;
      return { text: ctx.w([
        "{眼鏡明明掛在頭上，你卻找了一個早上。|出門走到巷口，才想起忘了帶鑰匙。}{你笑自己老了，|你嘆了一口氣，}{在門口貼了一張寫著「鑰匙、手機、錢包」的便條紙。|開始把東西固定放在玄關的小盤子裡。}",
        g && "叫{g}的時候，{連叫錯了好幾個名字才叫對，|把{gt}叫成了{pk}，}{全家都笑了，你也跟著笑。|{gt}說沒關係，{grand}每次都這樣。}",
        k && "同一個故事講了第三次，{name}還是聽得很認真。{後來你才想起自己早就講過了，|那天晚上睡前，你才想起這個故事已經講過好幾次，}{心裡有點不好意思。|原來孩子一直在讓你。}",
        "你開始把要做的事寫在月曆上：{回診、繳費、朋友的生日，|倒垃圾的時間、吃藥的時間，}{一格一格塞得滿滿的。|每做完一件就打一個勾。}",
        "醫生建議你{多動腦、多出門，|每天走路、多跟人聊天，}你{開始每天玩數獨，|去社區據點上健腦課，|和老朋友約好每週打一次麻將，}{說是預防失智，其實是找樂子。|反應好像真的變快了。}",
      ].filter(Boolean), { ...(g ? grandVars(g) : {}), name: k ? k.call : "" }), mood: -1 };
    },
  },
  {
    // Worn knees: exercise and rehab help a little, putting up with it does not (weighted by how often each is
    // chosen, about neutral). health.js tells the first years of knee pain (h_knee); when it has, this is the later
    // decision about replacing the joint, at least three years on, instead of the same story twice.
    id: "l_knee", domain: "health", channel: "bad", once: true, ages: [58, 95],
    when: s => s.last.h_knee === undefined || s.age - s.last.h_knee >= 3,
    p: s => (s.last.h_knee !== undefined ? 0.06 : s.age < 70 ? 0.015 : 0.03),
    choice: (s, ctx) => {
      const t = trail(s, ctx);
      if (s.last.h_knee !== undefined) return kneeLater(s, ctx, t);
      return {
        prompt: ctx.w([
          "上下樓梯時膝蓋越來越痛，蹲下去就站不太起來。骨科醫生說是退化性關節炎。要怎麼處理？",
          "膝蓋卡卡的，走一段路就得停下來休息。醫生看了 X 光，說軟骨磨損了。要怎麼辦？",
          "連去菜市場都要走走停停，膝蓋痛到晚上睡不好。醫生說是膝關節退化。你的決定是？",
        ]),
        options: [
          {
            id: "l_knee.surgery", label: "開刀換人工關節", hint: "一勞永逸，但要復健好幾個月", act: "seeDoctor", style: "risk", weight: 0.15,
            apply: (s2, c) => { s2.health.hr *= 0.99; spend(s2, 0.05); return { text: c.w("膝蓋退化，你開刀換了人工關節。{手術很順利，|住院一個星期，}{接下來三個月每天都要復健，痛得咬牙，|你扶著助行器在走廊來回地走，}{半年後，你又能自己去走{trail}了。|現在上下樓梯一點都不痛了。}", { trail: t }), mood: 1 }; },
          },
          {
            id: "l_knee.rehab", label: "去復健科復健", hint: "熱敷、電療、練肌力", act: "seeDoctor", style: "health", weight: 0.3,
            apply: (s2, c) => { s2.health.hr *= 0.99; return { text: c.w("膝蓋退化，你每週去復健科報到三次，{熱敷、電療、練大腿的肌力，|躺在復健床上和隔壁床的{阿伯|阿姨}聊天，}{半年後，膝蓋沒那麼痛了。|復健師說你是最認真的病人。}"), mood: 1 }; },
          },
          {
            id: "l_knee.swim", label: "開始游泳或水中走路", hint: "練肌肉來保護膝蓋", act: "exercise", style: "learn", weight: 0.2,
            apply: (s2, c) => { s2.health.hr *= 0.97; return { text: c.w("膝蓋退化，醫生說要練大腿的肌肉，你{去附近的游泳池學游泳，|每天早上去泳池做水中走路，|報名了運動中心的水中有氧，}{一開始只撐得了十分鐘，|一開始常常被救生員提醒動作，}{一年後，膝蓋好多了，體力也變好了。|現在你是那裡最早到的人。}"), mood: 3 }; },
          },
          {
            id: "l_knee.endure", label: "撐著，能走就好", hint: "不想麻煩別人", act: "pushThrough", style: "self", weight: 0.25,
            apply: (s2, c) => { s2.health.hr *= 1.03; return { text: c.w("膝蓋退化，你{貼了痠痛藥布，|買了一支拐杖，}{想說還能走就撐著。|能不出門就不出門。}{後來走路越來越少，體力也跟著差了。|爬樓梯變成一天裡最難的一件事。}"), mood: -3 }; },
          },
          {
            id: "l_knee.inject", label: "打玻尿酸或吃保健食品", hint: "先試試不開刀的方法", act: "seeDoctor", style: "safe", weight: 0.1,
            apply: (s2, c) => { spend(s2, 0.05); return { text: c.w(`膝蓋退化，你{去骨科打了玻尿酸，|每天吃葡萄糖胺和魚油，${s2.year >= 2015 ? "|聽朋友介紹去打了 PRP，" : ""}}{痛好像減輕了一點，|有沒有效你也說不準，}{至少現在走去公園沒問題。|你說先這樣，以後再說。}`), mood: 0 }; },
          },
        ],
      };
    },
  },

  // ---------- husband and wife ----------
  {
    id: "l_oldCouple", domain: "love", channel: "good", tags: ["spouse"], ages: [55, 105], cooldown: 3, when: married, p: () => 0.06,
    apply: (s, ctx) => {
      const long = yearsMarried(s) >= 20;
      return { text: ctx.w([
        "{每天傍晚，|吃完晚飯，}你和{partner}{一起去河堤散步，|一起去黃昏市場買菜，|在公園繞兩圈，}{走到第二圈，{ta}才會開始講今天的事。|兩個人不太說話，腳步卻一樣快。}",
        "你和{partner}為了{冷氣要開幾度|電視要看哪一台|醬油要買哪一牌}{吵了一架，|拌了幾句嘴，}{半小時後，{ta}還是削了一盤水果放在你面前。|晚上{ta}還是幫你把棉被拉好。}",
        "{partner}的鼾聲越來越大，{你買了耳塞，|你半夜推了{ta}好幾次，}{最後兩個人笑著決定分房睡，早上再一起吃早餐。|可是{ta}跟團出去玩的那幾天，你反而睡不著。}",
        s.health.chronic
          ? "{partner}把你的藥一顆一顆排好，{還在藥盒上貼了星期幾，|每天早上倒好一杯溫水等你，}{你嫌{ta}囉唆，但一顆也沒少吃。|你說自己會記得，其實心裡很受用。}"
          : "每天早上，{partner}都比你早起，{煮好一鍋稀飯，|泡好兩杯茶，}{等你起來一起吃。|這麼多年來沒有一天忘記。}",
        long
          ? "結婚這麼多年，你和{partner}{每年{ta}生日都去吃年輕時常去的那家{牛排館|台菜餐廳|日本料理}，|週末還是會一起去看早場電影，}{兩個人坐在老位子上，什麼都不用多說。|你說這是兩個人的小習慣。}"
          : "你和{partner}{一起去學跳舞，|週末一起去爬山，|一起報名了社區的烹飪班，}{你說，晚來的幸福更要好好珍惜。|朋友都說你們看起來像新婚。}",
        long && "{partner}翻出你年輕時寫的{情書|卡片}，{一字一句唸給你聽，|說要拿去裱框，}{你的臉都紅了。|兩個人笑到停不下來。}",
      ].filter(Boolean)), mood: 3 };
    },
  },
  {
    id: "l_coupleTrip", domain: "love", channel: "good", tags: ["spouse"], ages: [58, 82], cooldown: 6, max: 2,
    when: s => married(s) && !s.abroad && !s.health.serious, p: () => 0.05,
    choice: (s, ctx) => {
      const [jp, spot] = ctx.rng.pick([["京都", "哲學之道"], ["東京", "上野公園"], ["大阪", "大阪城公園"], ["熊本", "熊本城"]]);
      const wedYear = s.year - yearsMarried(s);
      const moon = wedYear < 1980 ? ctx.rng.pick(["日月潭", "阿里山", "溪頭", "花蓮"]) : ctx.rng.pick(["日月潭", "墾丁", "北海道", "峇里島", "關島", "沖繩"]);
      const ks = adultKids(s, 24), k = ks.length ? ctx.rng.pick(ks) : null;
      // A child who went abroad to study (adult.js) is visited there.
      const far = k && k.abroad ? k.abroad : ctx.rng() < 0.4 ? ctx.rng.pick(["美國", "日本", "新加坡", "澳洲", "上海"]) : ctx.rng.pick(["臺北市", "臺中市", "高雄市", "新竹市"].filter(c => c !== s.county));
      const v = { jp, spot, moon, far, ...(k ? kidVars(k) : {}) };
      return {
        prompt: ctx.w([
          "和{partner}說好，趁兩個人都還走得動，出去好好玩一趟。要怎麼安排？",
          k ? "{kids}出錢送你們一趟旅行，說要去哪裡都可以。要怎麼玩？" : "存了一筆旅費，你們說好今年要出去走走。要怎麼玩？",
          "{partner}說：「我們好久沒有兩個人出去了。」要怎麼安排這趟旅行？",
        ], v),
        options: [
          {
            id: "l_coupleTrip.japan", label: "跟團去日本賞櫻", hint: "輕鬆，什麼都有人安排", act: "travel", style: "safe", weight: 0.3,
            apply: (s2, c) => { spend(s2, 0.2); return { text: c.w("你和{partner}跟團去{jp}賞櫻，{在{spot}的櫻花樹下拍了好多照片，|住進一間有溫泉的旅館，}{{partner}說這是這輩子最好的一次旅行。|回來後，你把照片洗出來，貼滿了一整本相簿。}", v), mood: 5 }; },
          },
          {
            id: "l_coupleTrip.diy", label: "自助旅行", hint: "自己規劃，慢慢玩", act: "travel", style: "learn", weight: 0.15,
            apply: (s2, c) => { spend(s2, 0.25); return { text: c.w("你和{partner}自己規劃了一趟{歐洲|紐西蘭|日本鄉下}的自助旅行，{你負責查路線，{ta}負責看地圖，|在車站迷路了好幾次，}{一路上吵了幾次架，也笑了好幾回。|回來後，兩個人都覺得自己年輕了十歲。}"), mood: 5 }; },
          },
          {
            id: "l_coupleTrip.cruise", label: "搭郵輪", hint: "不用一直換飯店", act: "travel", style: "self", weight: 0.15,
            apply: (s2, c) => { spend(s2, 0.25); return { text: c.w("你和{partner}從基隆港搭郵輪去{沖繩|石垣島|九州}，{每天在甲板上看海、吃到飽，|晚上去看船上的表演，}{{partner}說這輩子沒這麼悠閒過。|回來一量體重，兩個人都胖了兩公斤。}"), mood: 5 }; },
          },
          {
            id: "l_coupleTrip.honeymoon", label: "回到當年蜜月的地方", hint: "重溫舊夢", act: "travel", style: "family", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.15); c.remember("l_coupleTrip", `和${s2.partner.call}回到當年蜜月的${moon}`, { mood: 5 }); return { text: c.w("你和{partner}回到當年度蜜月的{moon}，{找到當年住的那家旅館，已經改建了。|在同一個地方，用同樣的姿勢拍了一張照片。}{兩張照片放在一起，{ta}看了好久。|你們手牽著手，走得比當年慢一點。}", v), mood: 6 }; },
          },
          {
            id: "l_coupleTrip.spa", label: "國內小旅行泡溫泉", hint: "近一點、輕鬆一點", act: "travel", style: "health", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.05); return { text: c.w("你和{partner}去{北投|礁溪|關子嶺|知本|泰安|四重溪}泡溫泉，{住了兩個晚上，|每天早上泡湯、下午睡午覺，}{{ta}說膝蓋都不痛了。|回程兩個人在車上睡得好熟。}"), mood: 4 }; },
          },
          {
            id: "l_coupleTrip.visit", label: "去看住在外地的孩子", hint: "順便玩幾天", act: "travel", style: "social", weight: 0.15, when: () => !!k,
            apply: (s2, c) => { spend(s2, 0.15); return { text: c.w("你和{partner}去{far}看{name}，{住了兩個星期，|{name}請假帶你們到處玩，}{每天早上你都幫{name}煮一鍋稀飯。|臨走前，{name}抱著你們捨不得放手。}", v), mood: 5 }; },
          },
        ],
      };
    },
  },
  {
    // Your husband or wife needs care for a few months, and gets better (serious illness is in core.js).
    id: "l_nursePartner", domain: "family", channel: "bad", tags: ["spouse"], once: true, ages: [58, 100],
    when: s => married(s) && s.partner.age >= 65, p: () => 0.03,
    choice: (s, ctx) => {
      const ill = ctx.rng.pick(["跌倒骨折開了刀", "膝蓋開刀換了關節", "腰椎開了刀", "肩膀骨折，打了鋼釘", "感冒拖成肺炎，住院了一個多星期"]);
      const v = { ill };
      return {
        prompt: ctx.w([
          "{partner}{ill}，接下來好幾個月都需要人照顧。要怎麼安排？",
          "{partner}{ill}。醫生說要好好休養，身邊不能沒有人。你要怎麼照顧{ta}？",
          "{partner}{ill}，生活起居一下子都需要人幫忙。要怎麼安排？",
        ], v),
        options: [
          {
            id: "l_nursePartner.self", label: "自己照顧", hint: "累，但想親手照顧", act: "care", style: "family", weight: 0.4,
            apply: (s2, c) => { s2.health.hr *= 1.02; return { text: c.w("{partner}{ill}，你自己照顧{ta}：{每天幫{ta}擦澡、換藥、扶著{ta}走路，|半夜{ta}一翻身你就醒，}{幾個月下來你瘦了三公斤，但{ta}一天比一天好。|{ta}能自己走到巷口那天，你們都哭了。}", v), mood: -2 }; },
          },
          {
            id: "l_nursePartner.hire", label: "請看護", hint: "專業的人照顧，你也能喘口氣", act: "hireCare", style: "safe", weight: 0.2,
            apply: (s2, c) => { spend(s2, 0.4); return { text: c.w("{partner}{ill}，你們請了{一位外籍看護|一位有經驗的看護}，{你負責陪{ta}聊天、去回診，|專業的事交給專業的人，}{{ta}恢復得比預期還快。|晚上你終於又睡得著覺了。}", v), mood: -1 }; },
          },
          {
            id: "l_nursePartner.ltc", label: "申請長照服務", hint: "居家服務、復健到府", act: "hireCare", style: "learn", weight: 0.15, when: s2 => s2.year >= 2017,
            apply: (s2, c) => { spend(s2, 0.1); return { text: c.w("{partner}{ill}，你打 1966 長照專線申請了長照服務，{照服員每天來幫忙洗澡，|復健師每週到家裡來兩次，}{你這才知道原來有這麼多資源。|你不用再一個人硬撐了。}", v), mood: 0 }; },
          },
          {
            id: "l_nursePartner.kids", label: "請孩子回來輪流", hint: "一家人一起分擔", act: "shareCare", style: "social", weight: 0.15, when: s2 => adultKids(s2, 22).length > 0,
            apply: (s2, c) => ({ text: c.w("{partner}{ill}，你和{kids}排了班表，{週末{kids}回來顧，平日你來，|{kids}每天下班都繞過來幫忙，}{一家人好久沒有這麼常聚在一起了。|{partner}說，這場病讓{ta}看見{kids}真的長大了。}", v), mood: 0 }),
          },
          {
            id: "l_nursePartner.rehab", label: "陪著一起復健", hint: "兩個人一起動起來", act: "exercise", style: "health", weight: 0.1,
            apply: (s2, c) => { s2.health.hr *= 0.99; return { text: c.w("{partner}{ill}，醫生說要多活動，慢慢把體力找回來。你{每天陪{ta}做復健操，|牽著{ta}在公園一圈一圈慢慢地走，}{你自己的體力也跟著變好了。|三個月後，{ta}可以自己爬樓梯了。}", v), mood: 1 }; },
          },
          {
            id: "l_nursePartner.center", label: "先住進護理之家休養", hint: "短期照顧，好一點再回家", act: "hireCare", style: "self", weight: 0.05,
            apply: (s2, c) => { spend(s2, 0.3); return { text: c.w("{partner}{ill}，你們決定讓{ta}先住進{護理之家|復健中心}休養{兩個月|一陣子}，{你每天下午都去陪{ta}吃晚飯。|{ta}回家那天，你把家裡整理得乾乾淨淨。}", v), mood: -1 }; },
          },
        ],
      };
    },
  },
  {
    // The first years after your husband or wife has died.
    id: "l_aloneLife", domain: "family", channel: "change", once: true, ages: [55, 105],
    when: s => s.rel === "widowed" && s.age - (s.last.widowed ?? -99) <= 3 && !!lateSpouse(s), p: () => 0.35,
    choice: (s, ctx) => {
      const l = lateSpouse(s), ks = adultKids(s, 24), k = ks.length ? ctx.rng.pick(ks) : null;
      const v = { late: l.call, lt: pronoun(l), ...(k ? kidVars(k) : {}) };
      const grand = s.flags.grandkids > 0;
      return {
        prompt: ctx.w([
          "{late}走了以後，家裡只剩下你一個人。日子還要過下去，你想怎麼過？",
          "{late}的拖鞋還放在門口。一個人的日子，要從哪裡開始？",
          "{late}走後的第一個冬天，你一個人吃飯、一個人看電視。接下來要怎麼過？",
        ], v),
        options: [
          {
            id: "l_aloneLife.cook", label: "學著自己打理生活", hint: "煮飯、繳費、修水電", act: "hobby", style: "learn", weight: 0.25,
            apply: (s2, c) => { s2.health.hr *= 0.99; return { text: c.w("{late}走了以後，你學著{自己煮飯，從煎一顆荷包蛋開始，|自己繳水電費、跑銀行，|把{lt}以前做的事一件一件學起來，}{第一次煮出{lt}拿手的{滷肉|番茄炒蛋|竹筍湯}時，你一個人在廚房哭了。|慢慢地，你發現自己做得到。}", v), mood: 1 }; },
          },
          {
            id: "l_aloneLife.kid", label: "搬去和孩子住", hint: "不想一個人", act: "moveHome", style: "family", weight: 0.2, when: () => !!k,
            apply: (s2, c) => ({ text: c.w(`{late}走了以後，{name}把你接去一起住，{${grand ? "每天早上和孫子一起吃早餐，" : "每天晚上和{name}一起吃晚飯，"}|你在{name}家的陽台種了幾盆花，}{家裡很熱鬧，只是偶爾會想念老家的那張藤椅。|你慢慢習慣了新的生活。}`, v), mood: 1 }),
          },
          {
            id: "l_aloneLife.out", label: "多出門參加活動", hint: "社區、廟口、老人會", act: "socialize", style: "social", weight: 0.2,
            apply: (s2, c) => { s2.health.hr *= 0.99; return { text: c.w("{late}走了以後，你開始{每天去社區活動中心，|參加老人會辦的旅遊，|早上去公園跳土風舞，}{有人陪你說話，日子好過一點。|慢慢地，你又會笑了。}", v), mood: 2 }; },
          },
          {
            id: "l_aloneLife.stay", label: "守著老家，照原本的作息", hint: "這裡有你們的回憶", act: "wait", style: "safe", weight: 0.2,
            apply: (s2, c) => { s2.health.hr *= 1.02; return { text: c.w("{late}走了以後，你還是住在老房子裡，{每天早上照樣泡兩杯茶，|{lt}的東西一樣也沒動，}{日子很安靜。|家人常常打電話來問你好不好。}", v), mood: -2 }; },
          },
          {
            id: "l_aloneLife.group", label: "找人聊聊失去的心情", hint: "社工或宗教團體的陪伴", act: "counsel", style: "health", weight: 0.1,
            apply: (s2, c) => ({ text: c.w("{late}走了以後，你參加了{醫院社工辦的|教會的|社區的}{喪偶支持團體，|悲傷陪伴小組，}{第一次分享時，你一句話都說不出來。|聽到別人的故事，你才知道自己不是一個人。}{後來，你成了陪新成員的那個人。|你說，原來想念可以好好地說出來。}", v), mood: 2 }),
          },
          {
            id: "l_aloneLife.trip", label: "一個人去旅行", hint: "去你們說好要去的地方", act: "travel", style: "self", weight: 0.1,
            apply: (s2, c) => { spend(s2, 0.1); return { text: c.w("{late}走了以後，你一個人去了你們一直說要去的{trip}，{帶著{lt}的照片，|在{lt}會喜歡的那個角落坐了很久，}{回來後，心裡鬆了一點。|好像也替{lt}看了一次。}", v), mood: 2 }; },
          },
        ],
      };
    },
  },
  {
    // A new friend after being widowed. Only a friend: dating again is up to core.js.
    id: "l_danceFriend", once: true, ages: [58, 90], when: s => s.rel === "widowed" && s.age - (s.last.widowed ?? s.age) >= 1 && !s.abroad, p: () => 0.04,
    apply: (s, ctx) => {
      const f = ctx.person({ role: "friend", sex: ctx.rng() < 0.5 ? "male" : "female", birthYear: s.birthYear + ctx.rng.int(9) - 4, how: "社區舞會" });
      s.friends.push(f);
      const v = { f: f.call, ft: pronoun(f), nat: f.nature };
      return { text: ctx.w([
        "被鄰居拉去社區的{國標舞|土風舞|排舞}班，你和{f}剛好被排在一起，{兩個人都跳錯了好幾步，笑成一團。|{f}跳得很好，很有耐心地教你。}{後來每個星期都一起去跳。|跳完常常一起去吃豆花。}",
        "在{活動中心|公園}的{週末舞會|晨間排舞}認識了{f}，{一個{nat}的人，|和你一樣也是一個人生活，}{兩個人聊得很來，約好下次一起去看花展。|你發現自己又開始期待星期六了。}",
        "{f}是舞會上最會帶氣氛的人，{拉著你下場跳了一首{恰恰|吉魯巴|華爾滋}，|教你怎麼跟著拍子數一二三，}{你已經好多年沒有這樣笑過了。|從那天起，你每週都準時出現在舞會。}",
      ], v), mood: 4 };
    },
  },

  // ---------- old friends ----------
  {
    // adult.js has the reunions before 60; this waits a few years after one of those.
    id: "l_reunion", ages: [60, 88], cooldown: 6, max: 2, p: () => 0.04,
    when: s => [s.last.a_classReunion, s.last.a_reunion].every(x => x === undefined || s.age - x >= 5),
    choice: (s, ctx) => {
      const list = [["國小", 12]];
      if (s.edu !== "國小" && s.edu !== "none") list.push(["國中", 15]);
      if (["高中", "大學", "碩士", "博士"].includes(s.edu)) list.push(["高中", 18]);
      if (["高職", "科大"].includes(s.edu)) list.push(["高職", 18]);
      if (s.edu === "五專") list.push(["五專", 20]);
      if (["大學", "科大", "碩士", "博士"].includes(s.edu)) list.push([s.edu === "科大" ? "科大" : "大學", 22]);
      const [sch, at] = ctx.rng.pick(list);
      const f = ctx.person({ role: "friend", sex: ctx.rng() < 0.5 ? "male" : "female", birthYear: s.birthYear, how: `${sch}同學` });
      const meet = s2 => { if (!s2.friends.includes(f)) s2.friends.push(f); };
      const line = s.year >= 2012;
      const v = { sch, n: s.age - at, f: f.call, tage: s.age + 13 + ctx.rng.int(8) };
      return {
        prompt: ctx.w([
          `${line ? "{sch}同學的 LINE 群組裡" : "{sch}同學打電話來"}說，要辦畢業 {n} 年的同學會。要去嗎？`,
          "收到{sch}同學會的邀請，上一次見到大家，已經是好多年前的事了。要去嗎？",
          "{f}打電話來：「我們{sch}那一屆要辦同學會，你一定要來。」要去嗎？",
        ], v),
        options: [
          {
            id: "l_reunion.go", label: "去參加", hint: "看看大家過得怎麼樣", act: "socialize", style: "safe", weight: 0.4,
            apply: (s2, c) => { meet(s2); return { text: c.w("{sch}同學會那天，{當年的班長胖了一圈，|大家在餐廳門口互相認了好久，}{聊著聊著，好像又回到了教室裡。|有人已經當了阿公阿嬤，有人還在上班，有人剛從國外回來。}{散會時，你和{f}約好{明年|五年後}再見。|你帶回了一張全班的大合照。}", v), mood: 4 }; },
          },
          {
            id: "l_reunion.host", label: "主動幫忙籌辦", hint: "一個一個找回老同學", act: "socialize", style: "social", weight: 0.15,
            apply: (s2, c) => { meet(s2); return { text: c.w("你自告奮勇籌辦{sch}同學會，{花了兩個月一個一個打電話找人，|翻出畢業紀念冊，照著名字一個一個找，}{最後來了{二十|三十}幾個人，|連住在國外的同學都特地飛回來，}{大家輪流上台講這些年的事，你在台下笑得最開心。|散會時，大家都說明年還要你來辦。}", v), mood: 5 }; },
          },
          {
            id: "l_reunion.skip", label: "不去了", hint: "不想被比來比去", act: "avoid", style: "self", weight: 0.2,
            apply: (s2, c) => ({ text: c.w(`{sch}要辦同學會，你{想了想還是沒去，|說那天剛好有事，}{怕被問起這些年過得怎麼樣。|${line ? "後來在群組裡看到大家的合照，你看了很久。" : "後來{f}寄來大家的合照，你看了很久。"}}`, v), mood: -1 }),
          },
          {
            id: "l_reunion.album", label: "整理一份回憶給大家", hint: "把老照片做成影片或相簿", act: "hobby", style: "learn", weight: 0.1,
            apply: (s2, c) => { meet(s2); return { text: c.w([
              `{sch}同學會前，你把大家的老照片收集起來，學著用${s2.year >= 2015 ? "手機" : "電腦"}剪成一部影片。{播出來的時候，全場先是一片安靜，然後大家笑著指認畫面裡的自己。|有人看到一半就哭了。}`,
              "{sch}同學會前，你把大家的老照片收集起來，{做成一本厚厚的相簿，|印成一本小小的紀念冊，}{大家搶著翻看，笑到停不下來。|每個人都在自己的那一頁簽了名。}",
            ], v), mood: 4 }; },
          },
          {
            id: "l_reunion.teacher", label: "約幾個人去探望老師", hint: "趁現在還來得及", act: "talk", style: "family", weight: 0.15, when: s2 => s2.age <= 75,
            apply: (s2, c) => { meet(s2); return { text: c.w("你和{f}幾個同學約好去探望{sch}的導師，{老師已經{tage}歲了，還記得你坐在第幾排。|老師拿出一本泛黃的點名簿，一個一個念大家的名字。|老師的耳朵不太好了，卻一直握著你的手。}{離開時大家都紅了眼眶。|你們約好每年教師節都要再來。}", v), mood: 5 }; },
          },
        ],
      };
    },
  },
  {
    id: "l_friendMoves", once: true, ages: [62, 95], p: () => 0.02,
    apply: (s, ctx) => {
      const f = oldFriend(s, ctx);
      const place = ctx.rng() < 0.5 ? ctx.rng.pick(["美國", "加拿大", "澳洲", "上海"]) : ctx.rng.pick(["臺北市", "臺中市", "高雄市", "新竹市"].filter(c => c !== s.county));
      f.away = place;
      const v = { f: f.call, ft: pronoun(f), place, kid: ctx.rng.pick(["兒子", "女兒"]), talk: s.year >= 2011 ? "視訊" : "通電話" };
      return { text: ctx.w([
        "認識幾十年的{f}要搬去{place}和{kid}一起住了。{你幫忙打包了一整天，|你送了{ft}一盆自己種的{蘭花|多肉}，}{臨走前，{ft}說以後回來，第一個就要找你喝茶。|兩個人在巷口站了好久才說再見。}",
        "{f}{年紀大了，一個人住不方便，|跌倒過一次以後，}決定搬去{place}和{kid}住。{你們約好每個星期{talk}一次。|你答應有空就去看{ft}。}{巷口的那張長椅，現在只剩你一個人坐。|你突然覺得這條街變寬了。}",
        "{f}要搬去{place}了。搬家前一晚，你們{去吃了常去的那家{麵店|海產店|自助餐}，|在{ft}空蕩蕩的客廳裡泡了最後一壺茶，}{聊了一整晚以前的事。|誰也沒有提明天。}",
      ], v), mood: -2 };
    },
  },
  {
    id: "l_smartphone", domain: "study", channel: "good", once: true, ages: [55, 105],
    when: s => s.year >= 2012 && s.year <= 2028 && s.birthYear <= 1965, p: () => 0.15,
    choice: (s, ctx) => {
      const gs = s.flags.grandkids > 0 ? grandkids(s, ctx).filter(g => g.age >= 7) : [], ks = adultKids(s, 20);
      const tc = gs.length ? ctx.rng.pick(gs).call : ks.length ? ctx.rng.pick(ks).call : null;
      const pics = s.flags.grandkids > 0 ? "孫子" : "家人";
      const f = oldFriend(s, ctx), v = { tc: tc || "", f: f.call, ft: pronoun(f), pics };
      return {
        prompt: ctx.w([
          ks.length ? "孩子送你一支智慧型手機，說這樣就能用 LINE 看{pics}的照片。可是螢幕上那麼多圖示，要從哪裡學起？" : "手機行的店員說，現在大家都用智慧型手機了。螢幕上那麼多圖示，要從哪裡學起？",
          "身邊的朋友都在用 LINE 傳早安圖，只有你還拿著舊手機。要怎麼跟上？",
          "{f}換了一支智慧型手機，天天在群組裡聊天、傳照片。你要怎麼學？",
        ], v),
        options: [
          {
            id: "l_smartphone.family", label: tc ? `請${tc}教你` : "請家人教你", hint: "家裡的老師最有耐心……大概吧", act: "seekHelp", style: "family", weight: 0.3, when: () => !!tc,
            apply: (s2, c) => ({ text: c.w("你請{tc}教你用智慧型手機，{{tc}把每一個步驟寫在一張紙上，|同一件事教了三遍，{tc}的聲音越來越大，}{你學會了拍照、傳貼圖，還有視訊。|第一次自己打視訊電話時，家人都嚇了一跳。}", v), mood: 3 }),
          },
          {
            id: "l_smartphone.class", label: "去上手機課", hint: "社區、圖書館的長輩課程", act: "study", style: "learn", weight: 0.25,
            apply: (s2, c) => ({ text: c.w("你去{社區關懷據點|圖書館|區公所}上長輩的手機課，{老師一步一步教大家用 LINE、拍照、查公車，|同學們互相幫忙找按鍵在哪裡，}{你是全班第一個學會傳貼圖的人。|下課後，你還留下來問了好多問題。}"), mood: 3 }),
          },
          {
            id: "l_smartphone.friends", label: "和老朋友互相教", hint: "邊學邊聊", act: "socialize", style: "social", weight: 0.2,
            apply: (s2, c) => ({ text: c.w("你和{f}約在{公園|廟口|速食店}學用智慧型手機，{兩個人拿著手機互相研究，|你教{ft}拍照，{ft}教你傳貼圖，}{花了一個下午才學會建群組。|現在你們每天早上都互傳一張早安圖。}", v), mood: 3 }),
          },
          {
            id: "l_smartphone.self", label: "自己慢慢摸索", hint: "按錯了再說", act: "hobby", style: "risk", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("你拿著智慧型手機自己慢慢摸索，{按錯了好幾次，不小心打了視訊電話給{f}，|不小心把字體調到最大，}{一個月後，你已經會自己上網查{食譜|天氣|公車什麼時候到}了。|現在你傳的長輩圖比誰都多。}", v), mood: 2 }),
          },
          {
            id: "l_smartphone.keypad", label: "用按鍵手機就好", hint: "能打電話就夠了", act: "wait", style: "safe", weight: 0.15,
            apply: (s2, c) => { s2.flags.l_noSmart = true; return { text: c.w([
              "你覺得智慧型手機太複雜了，{繼續用你的按鍵手機，|請店員幫你換了一支大字大按鍵的手機，}{能打電話就好。|有事大家就打給你，你也覺得自在。|你說，不用一直盯著手機，眼睛反而比較舒服。}",
              "你試了幾天智慧型手機，{還是把它收進了抽屜，|又換回了原本的舊手機，}{你說，想聯絡的人，打電話就找得到。|群組裡說了什麼，就請{f}打電話告訴你。}",
            ], v), mood: 0 }; },
          },
        ],
      };
    },
  },
  {
    id: "l_lineFriends", ages: [60, 105], cooldown: 4, max: 3, p: () => 0.04,
    apply: (s, ctx) => {
      const away = s.friends.filter(x => x.alive !== false && x.away);
      const f = away.length && ctx.rng() < 0.6 ? ctx.rng.pick(away) : oldFriend(s, ctx);
      const v = { f: f.away ? `搬去${f.away}的${f.call}` : f.call, ff: f.call, ft: pronoun(f) };
      const line = s.year >= 2012 && !s.flags.l_noSmart;
      return { text: ctx.w(line ? [
        "每天早上，你都會傳一張{開滿荷花|太陽升起|寫著「平安喜樂」}的早安圖到老朋友的 LINE 群組，{{ff}總是第一個回貼圖。|哪天沒傳，就會有人私訊問你還好嗎。}",
        "你在 LINE 上和{f}聊起{當年一起{偷摘芭樂|騎腳踏車去海邊|在冰果室打工}的事，|小時候住的那條巷子，}{傳著傳著，兩個人約了下個月見面。|{ft}傳來一張你們年輕時的合照，你存進了手機。}",
        "{f}傳來一段語音訊息，{講了五分鐘，|聲音還是跟以前一樣大，}{你聽了三遍。|你也錄了一段長長的回覆。}",
      ] : [
        "你寫了一封信給{f}，{用你最好看的字，|寫了滿滿三張信紙，}{一個月後收到回信，裡面夾著一張照片。|回信裡說，{ft}最近開始學畫畫了。}",
        "晚上打電話給{f}，{一講就是一個小時，|聊到話筒都發燙了，}{兩個人約好過年回老家見面。|掛電話前，你們都說要保重身體。}",
        "{f}寄來一張賀年卡，{上面是{ft}歪歪斜斜的字，|夾著一張{ft}和家人的合照，}{你把它放在電視旁邊，看了好幾天。|你馬上回了一張，寫得比{ft}還長。}",
      ], v), mood: 2 };
    },
  },

  // ---------- putting a life in order ----------
  {
    id: "l_photos", ages: [62, 105], cooldown: 8, max: 2, p: () => 0.03,
    apply: (s, ctx) => {
      const k = s.kids.length ? ctx.rng.pick(s.kids) : null;
      const v = { ...(k ? kidVars(k) : {}), age0: 20 + ctx.rng.int(15), army: s.sex === "male" ? "當兵時的照片" : "畢業典禮的照片", wed: s.marriages > 0 ? "結婚那天的合照" : "畢業旅行的合照" };
      const album = "你把舊相簿一本一本搬出來，攤滿了整個客廳。{透明膠膜都黃了，照片撕不下來。|有好幾張已經褪成了淡淡的咖啡色。}{看到年輕時的自己，你笑說那時候頭髮真多。|你挑了幾張放進相框，擺在電視旁邊。}";
      const lines = s.birthYear < 1965 ? [
        "整理衣櫃時翻出一盒老照片：{黑白的大頭照、{army}、{wed}，|你小時候在{三合院前|老家門口}拍的全家福，}{有些人已經叫不出名字了。|你一張一張在背後寫上年份和名字，留給家人。}",
        album,
        k && "在抽屜深處找到一疊沖洗店的照片袋，{裡面是{name}小時候的生日派對，|還有你年輕時去{墾丁|阿里山|日月潭}玩的照片，}{有好幾張都過曝了，你還是捨不得丟。|你把它們一張一張貼進新的相簿。}",
      ] : s.birthYear < 1990 ? [
        album,
        "在抽屜深處找到一疊沖洗店的照片袋，{裡面是你學生時代的畢業旅行，|還有你年輕時去{墾丁|阿里山|日月潭}玩的照片，}{有好幾張都過曝了，你還是捨不得丟。|你把它們一張一張掃描進電腦。}",
        k && "你翻出一台老數位相機，充好電一開機，{裡面還存著{name}小時候的照片，|裡面存著二十幾年前的家族旅行，}{你看了一整個下午。|你把照片傳給家人，大家都說好懷念。}",
      ] : [
        "手機和雲端裡存了好幾萬張照片，你花了一個月慢慢整理，{挑出每一年最喜歡的一張，|做成一本一本的相片書，}{翻到年輕時的自己，你忍不住笑出來。|原來日子都留在這裡。}",
        "你把舊手機裡的照片一張一張備份下來，{有一張是你 {age0} 歲時的自拍，|有好多張都是吃過的東西，}{你看了好久。|你傳了好幾張給老朋友，大家笑成一團。}",
        k && "你把{name}從出生到現在的照片剪成一部影片，{在{name}生日那天播給{t}看，|配上{name}小時候最愛的那首歌，}{{t}看著看著就哭了。|全家人笑著指認畫面裡的每一個人。}",
      ];
      return { text: ctx.w(lines.filter(Boolean), v), mood: 2 };
    },
  },
  {
    id: "l_memoir", domain: "study", channel: "good", once: true, ages: [68, 95], p: () => 0.015,
    choice: (s, ctx) => {
      const ks = adultKids(s, 20), k = ks.length ? ctx.rng.pick(ks) : null;
      const gs = s.flags.grandkids > 0 ? grandkids(s, ctx).filter(g => g.age >= 10) : [];
      const tl = gs.length ? ctx.rng.pick(gs).call : k ? k.call : null;
      const sp = s.partner || lateSpouse(s);
      const v = { ...(k ? kidVars(k) : {}), tl: tl || "", from: s.birthCounty || "老家", meet: sp ? `怎麼認識${sp.call}的` : "年輕時的夢想", helper: k ? k.call : "朋友" };
      return {
        prompt: ctx.w([
          k ? "{name}說：「你的故事好精彩，要不要寫下來？」你想用什麼方式，留下這一生？" : "整理抽屜時，翻出年輕時的日記。你也想把這一生留下來，要怎麼做？",
          "活了大半輩子，很多事再不記下來，就要忘了。你想怎麼留下自己的故事？",
          "社區大學開了一門「寫自己的故事」的課。你也想把這一生留下來，要怎麼做？",
        ], v),
        options: [
          {
            id: "l_memoir.write", label: "自己一筆一筆寫", hint: "從小時候寫起", act: "hobby", style: "learn", weight: 0.3,
            apply: (s2, c) => ({ text: c.w("為了寫回憶錄，你買了{一疊稿紙|一本厚厚的筆記本}，{每天早上寫一頁，|從在{from}的童年寫起，}{寫了兩年，寫滿了{三|五}本。|寫到最難過的那一段時，你停筆了好幾天。}{你在最後一頁寫：謝謝這一生遇見的每一個人。|你把它收在床頭的抽屜裡，等哪天家人想看。}", v), mood: 4 }),
          },
          {
            id: "l_memoir.record", label: "說給家人錄下來", hint: "口述，讓孩子或孫子錄音", act: "talk", style: "family", weight: 0.3, when: () => !!tl,
            apply: (s2, c) => ({ text: c.w("你每個週末說一段往事，讓{tl}用手機錄下來：{小時候在{from}的日子、第一份工作、{meet}，|颱風天淹水的那一年、第一次離家的那一天，}{錄了{二十|三十}幾段。|{tl}把它們整理好，傳給家裡的每一個人。}", v), mood: 5 }),
          },
          {
            id: "l_memoir.class", label: "去上生命故事寫作班", hint: "和同年紀的人一起寫", act: "study", style: "social", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("你報名了{社區大學|圖書館}的生命故事寫作班，{班上每個人的故事都不一樣，|老師要大家從一張老照片寫起，}{你寫的那篇〈{我的第一份工作|那年的颱風|阿母的灶腳|第一次離家}〉被印進了班上的作品集。|朗讀那天，你唸到一半就哽咽了，同學們都安靜地等著你。}"), mood: 4 }),
          },
          {
            id: "l_memoir.book", label: "印成一本書", hint: "自費出版，送給親友", act: "hobby", style: "self", weight: 0.1,
            apply: (s2, c) => { spend(s2, 0.1); c.remember("l_memoir", "把自己的故事印成了一本書", { mood: 5 }); return { text: c.w("你把寫好的故事{交給印刷廠，|請{helper}幫忙排版，}印成一本{兩百|三百}頁的書，{封面是你年輕時的照片。|送給每一位親戚和老朋友。}{有人打電話來說看到哭了。|你在扉頁上一本一本簽名。}", v), mood: 5 }; },
          },
          {
            id: "l_memoir.none", label: "算了，有些事放在心裡就好", hint: "不是每件事都要說", act: "wait", style: "safe", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("想寫回憶錄，你想了很久，{還是沒有動筆。|只寫了一頁就收起來了。|又把筆記本放回了抽屜。}{有些事，你想留在心裡就好。|你說，日子過了就過了，記得的人會記得。|你只把幾個好笑的故事，在吃飯時說給大家聽。}"), mood: 0 }),
          },
        ],
      };
    },
  },
  {
    // 預立醫療決定 under the 病人自主權利法 (in force 2019-01-06): counselling at a hospital with family, then the
    // decision is noted on the 健保卡. The simpler 安寧緩和意願書 has existed since 2000. What brings it to mind this
    // time, see directiveScenes.
    id: "l_directive", domain: "health", channel: "change", ages: [60, 105], max: 2, cooldown: 5,
    when: s => s.year >= 2019 && !s.flags.l_adDone && !s.abroad, p: () => 0.02,
    choice: (s, ctx) => {
      // Brothers and sisters are never written out of the story, so they only stand in while you are under 80.
      const ks = adultKids(s, 20), k = ks.length ? ctx.rng.pick(ks) : null, sibs = s.flags.estranged || s.age >= 80 ? [] : bornSiblings(s, 18);
      const kin = k ? k.call : married(s) ? s.partner.call : sibs.length ? siblingCall(sibs[0]) : null;
      const f = oldFriend(s, ctx);
      const v = { kin: kin || "最信任的朋友", f: f.call, ft: pronoun(f), all: s.kids.length > 1 ? "孩子們" : s.kids.length ? s.kids[0].call : married(s) ? s.partner.call : "最親近的人" };
      const done = s2 => { s2.flags.l_adDone = true; };
      const sc = pickScene(s, ctx, "l_directive", directiveScenes(s, !!kin, !!k)), lead = ctx.w(sc.lead, v), then = ctx.w(sc.then, v);
      // A button: the scene's own words when it has them ({kin}, {f} filled in), else the usual ones.
      const named = (key, label, hint) => {
        const [l, h] = (sc.labels && sc.labels[key]) || [label, hint];
        return { label: l.replace(/\{(\w+)\}/g, (m, x) => v[x] ?? m), hint: h };
      };
      return {
        prompt: `${lead}。${s.count.l_directive > 1 ? "上次你把這件事放著，這幾年又想起來好幾次。這次要怎麼做？" : ctx.w(sc.ask, v)}`,
        options: [
          {
            id: "l_directive.sign", ...named("sign", "去醫院諮商，簽下預立醫療決定", "把自己的意願寫清楚"), act: "seeDoctor", style: "self", weight: 0.25,
            apply: (s2, c) => { done(s2); return { text: c.w([
              `${then}你帶著${kin ? "{kin}" : "一位信任的朋友"}去醫院做了預立醫療照護諮商，{醫師、護理師和社工一條一條解釋給你們聽，|你一題一題想清楚，}簽下了預立醫療決定書。{健保卡上多了一個註記，你覺得心裡一塊石頭放下了。|回家的路上，你們去吃了一頓飯，聊的都是開心的事。}`,
              `${then}你去醫院做了諮商。{你說得很平靜：「如果有一天沒辦法好轉，不要插管、不要電擊，讓我舒服地走。」|你說，不想讓家人替你做那個最難的決定。}簽下預立醫療決定書以後，{你把文件交給{kin}收好。|健保卡註記好的那天，你睡得特別安穩。}`,
            ], v), mood: 1 }; },
          },
          {
            id: "l_directive.talk", ...named("talk", "先和家人討論", "讓大家知道你的想法"), act: "talk", style: "family", weight: 0.3,
            apply: (s2, c) => ({ text: c.w([
              `${then}你找了一個週末，把{all}找來，{泡了一壺茶，|吃完晚飯後，}慢慢說出自己的想法：如果有一天沒辦法好轉，不要插管急救。{一開始大家都不想談，說到後來，{kin}握著你的手說會尊重你。|這是你們家最難、也最溫暖的一次談話。|有人哭了，也有人笑你想太多，但大家都記住了。}`,
              `${then}你把自己對臨終照顧的想法寫在一張紙上，{趁過年大家都在的時候拿出來，|一個一個打電話說，}{大家雖然捨不得，還是答應會照你的意思。|說完以後，你覺得心裡輕鬆多了。}`,
            ], v), mood: 1 }),
          },
          {
            id: "l_directive.wait", ...named("wait", "再想想", "還沒準備好面對"), act: "wait", style: "safe", weight: 0.25,
            apply: (s2, c) => ({ text: c.w([
              `${then}你${sc.away}，{說等身體真的不好再說。|想說家人還沒準備好聽這些。|告訴自己，下次回診再問問看。}`,
              `${then}要不要簽預立醫療決定，你想了好幾個晚上，{還是覺得太早了。|一想到要寫下這些就鼻酸，}{決定過一陣子再說。|你把這件事放在心裡，沒有跟任何人提。}`,
            ], v), mood: 0 }),
          },
          {
            id: "l_directive.ask", ...named("ask", "請醫師說明清楚", "先弄懂再決定"), act: "seeDoctor", style: "learn", weight: 0.2,
            apply: (s2, c) => ({ text: c.w(`${sc.askOpen || `${then}你趁回診時問醫師什麼是預立醫療決定。`}{醫師畫了一張圖，解釋什麼是維持生命治療、什麼是安寧照護，|醫師請你去掛諮商門診，護理師花了一個小時跟你說明，|醫師說，這是替自己做決定，也是替家人減輕負擔，}{你把問題寫在小本子上，一題一題地問。|聽完以後，你說要回家跟家人商量。|你拿了一份文件回家，放在桌上看了好幾天。}`), mood: 1 }),
          },
          {
            id: "l_directive.hospice", ...named("hospice", "先簽安寧緩和意願書", "簡單、不用錢，也能註記在健保卡"), act: "seeDoctor", style: "health", weight: 0.1,
            apply: (s2, c) => { done(s2); return { text: c.w(`${then}你先簽了一份安寧緩和醫療意願書，{請兩位朋友當見證人，|在醫院的社工室就辦好了，}{十分鐘就完成，也不用花錢。|過了幾個星期，健保卡上就有了註記。}{你說，至少最重要的一件事先講清楚了。|你把影本交給{kin}收著。}`, v), mood: 1 }; },
          },
        ],
      };
    },
  },
  {
    // Making peace with a brother or sister after years of silence (core's inheritance can leave you estranged).
    id: "l_mend", domain: "family", channel: "good", tags: ["siblings"], about: "siblings", once: true, ages: [55, 85],
    when: s => s.flags.estranged && bornSiblings(s, 18).length > 0, p: () => 0.06,
    choice: (s, ctx) => {
      const sib = ctx.rng.pick(bornSiblings(s, 18));
      // A go-between of the right generation: aunts and uncles while you are younger, nephews and cousins later.
      const v = { x: siblingCall(sib), xt: sibPronoun(sib), rel: ctx.rng.pick(s.age < 68 ? ["表哥", "舅舅", "姑姑", "堂姊"] : ["表妹", "堂弟", "姪子", "外甥女"]) };
      const made = (s2, c, text, mood) => { s2.flags.estranged = false; c.remember("l_mend", `和${v.x}和好了`, { mood }); return { text, mood }; };
      return {
        prompt: ctx.w([
          s.age <= 70
            ? "和{x}為了老家的事鬧翻以後，已經好多年沒有說話了。最近聽說{xt}退休了，你心裡一直放不下。要怎麼做？"
            : "和{x}為了老家的事鬧翻以後，已經好多年沒有說話了。最近你常常想起{xt}，心裡一直放不下。要怎麼做？",
          "{rel}的孩子結婚，你和{x}被排在同一桌。你們已經好多年沒有說話了。要怎麼做？",
          "整理老照片時，翻到你和{x}小時候在老家門口的合照。好多年沒聯絡了，要怎麼做？",
        ], v),
        options: [
          {
            id: "l_mend.call", label: "主動打電話", hint: "先開口的人不是輸", act: "reconcile", style: "family", weight: 0.3,
            apply: (s2, c) => c.roll("family", "good", 0.6)
              ? made(s2, c, c.w("和{x}好多年沒說話了，你撥了那個好久沒撥的號碼。{x}接起電話，{沉默了好久，|愣了一下，}{說：「我也一直想打給你。」|兩個人聊到天都黑了。}", v), 6)
              : { text: c.w("和{x}好多年沒說話了，你鼓起勇氣打給{xt}，{x}{沒有接。|只說了幾句就掛了。}{你留了一段語音，說你隨時都在。|至少，你先開口了。}", v), mood: -1 },
          },
          {
            id: "l_mend.letter", label: "寫一封信", hint: "有些話寫比說容易", act: "talk", style: "safe", weight: 0.2,
            apply: (s2, c) => c.roll("family", "good", 0.5)
              ? made(s2, c, c.w("和{x}好多年沒說話了，你寫了一封長長的信給{xt}。{寄出去三個星期後，|過了一個多月，}{收到一張寫著「回老家吃個飯吧」的卡片。|{x}打電話來，第一句話是：「信我看了。」}", v), 5)
              : { text: c.w("和{x}好多年沒說話了，你寫了一封長長的信給{xt}，{寄出去以後一直沒有回音。|信被退了回來，原來{xt}已經搬家了。}{你把草稿收進抽屜，告訴自己已經盡力了。|你說，至少想說的話都寫下來了。}", v), mood: -1 },
          },
          {
            id: "l_mend.relative", label: "請長輩或親戚居中", hint: "找個和事佬", act: "seekHelp", style: "social", weight: 0.2,
            apply: (s2, c) => c.roll("family", "good", 0.55)
              ? made(s2, c, c.w("和{x}好多年沒說話了，你請{rel}出面約了一頓飯。{你和{x}一開始都不說話，|飯吃到一半，}{{x}先幫你夾了一塊{雞肉|魚}。|後來兩個人終於笑了出來。}", v), 5)
              : { text: c.w("和{x}好多年沒說話了，你請{rel}出面約了一頓飯，{x}{沒有來。|來了，卻只坐了十分鐘。}{rel}說，再給{xt}一點時間。", v), mood: -2 },
          },
          {
            id: "l_mend.visit", label: "直接回老家找對方", hint: "見面三分情", act: "reconcile", style: "risk", weight: 0.15,
            apply: (s2, c) => c.roll("family", "good", 0.5)
              ? made(s2, c, c.w("和{x}好多年沒說話了，你沒有先說，直接去按了{xt}家的門鈴。{x}開門看到你，{愣了好久，然後說：「進來坐吧。」|眼眶一下子就紅了。}", v), 6)
              : { text: c.w("和{x}好多年沒說話了，你直接去按了{xt}家的門鈴，{x}隔著門說不想見你。你在門口站了一會兒，把帶來的{水果|伴手禮}放在門口。", v), mood: -3 },
          },
          {
            id: "l_mend.letgo", label: "就這樣吧", hint: "不勉強了", act: "avoid", style: "self", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("和{x}好多年沒說話了，你想了很久，還是沒有聯絡{xt}。{有些結，你覺得就讓它留在那裡吧。|你只在心裡祝{xt}一切都好。}", v), mood: -2 }),
          },
        ],
      };
    },
  },
  {
    // Rebuilding an old apartment block: 都更 with a developer, or the owners' own 危老 rebuild from 2017.
    id: "l_renewal", domain: "wealth", channel: "change", tags: ["home"], once: true, ages: [55, 88],
    when: s => s.year >= 2010 && s.home === "own" && URBAN.includes(s.county) && !s.abroad, p: () => 0.02,
    choice: (s, ctx) => {
      const k = s.kids.length ? ctx.rng.pick(s.kids) : null;
      const v = { ...(k ? kidVars(k) : {}), floor: ctx.rng.pick(["四", "五"]) };
      return {
        prompt: ctx.w([
          "你住了幾十年的老公寓，建商來談都更。左鄰右舍有人同意、有人反對。你要怎麼做？",
          `老公寓沒有電梯，爬{floor}樓越來越吃力。${s.year >= 2017 ? "鄰居說可以申請危老重建，也有建商來談都更。" : "里長說，有建商想來談都更。"}你怎麼打算？`,
          "社區公布欄貼出了都更說明會的通知，整棟樓的人都在討論。你的想法是？",
        ], v),
        options: [
          {
            id: "l_renewal.agree", label: "簽都更同意書", hint: "換一間有電梯的新房子", act: "negotiate", style: "risk", weight: 0.3,
            apply: (s2, c) => ({ text: c.w("老公寓要都更，你簽了同意書，{在附近租了三年房子，|拿著建商的租金補貼搬到附近，}{三年後搬進了有電梯的新大樓，|新家分到的坪數比原本小一點，}{你在新家門口放了一串鞭炮。|只是再也看不到以前那棵老芒果樹了。}"), mood: 3 }),
          },
          {
            id: "l_renewal.wait", label: "等等看大家怎麼決定", hint: "不當第一個", act: "wait", style: "safe", weight: 0.3,
            apply: (s2, c) => ({ text: c.w("都更的事吵了好幾年，你{一直沒有表態，|每次開會都坐在最後一排，}{後來因為湊不到足夠的同意，案子停了下來。|到現在，那棟老公寓還在，你也還住在那裡。}"), mood: -1 }),
          },
          {
            id: "l_renewal.refuse", label: "不簽，住慣了", hint: "這裡有一輩子的回憶", act: "insist", style: "self", weight: 0.15,
            apply: (s2, c) => ({ text: c.w(`建商來談都更，你{不肯簽同意書|說這間房子不賣也不拆}。${k ? "門框上還有{name}小時候的身高刻痕，" : "陽台上那盆老蘭花養了二十年，"}鄰居來勸了好幾次，你還是搖頭。{後來案子沒過，你繼續爬你的{floor}樓。|你說，住慣了，哪裡都不想去。|搬走的老鄰居回來看你，說還是這裡住得最舒服。}`, v), mood: 0 }),
          },
          {
            id: "l_renewal.advice", label: "找律師和建築師問清楚", hint: "弄懂權利再決定", act: "dispute", style: "learn", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("老公寓要都更，你{去參加了{city}政府辦的說明會，|請教了律師和建築師，}{把權利變換的算法弄懂了，|發現建商開的條件比行情差，}{幫整棟樓的住戶談到了更好的條件。|後來大家都說幸好有你。}"), mood: 2 }),
          },
          {
            id: "l_renewal.rebuild", label: "和鄰居申請危老重建", hint: "自己找建築師，不靠建商", act: "negotiate", style: "social", weight: 0.1, when: s2 => s2.year >= 2017,
            apply: (s2, c) => { spend(s2, 0.3); return { text: c.w("你和{幾戶|整棟的}鄰居一起申請危老重建，{挨家挨戶去說明，|開了十幾次住戶會議，}{花了好幾年，終於拆掉重蓋。|新大樓落成那天，大家在一樓大廳一起吃了一頓飯。}"), mood: 4 }; },
          },
        ],
      };
    },
  },
  {
    id: "l_faith", once: true, ages: [60, 105], p: () => 0.02,
    choice: (s, ctx) => {
      const l = s.rel === "widowed" ? lateSpouse(s) : null, f = oldFriend(s, ctx);
      const v = { f: f.call, late: l ? l.call : "", bro: s.sex === "male" ? "師兄" : "師姊", sis: s.sex === "male" ? "弟兄" : "姊妹" };
      return {
        prompt: ctx.w([
          "年紀越大，越常想一些以前沒空想的事。{f}約你去{廟裡|教會|道場}走走。你想怎麼安頓自己的心？",
          l ? "{late}走了以後，你開始想找一個讓心安定下來的地方。你想怎麼做？" : `${s.retired ? "退休以後" : "這幾年"}日子慢了下來，你開始想找一個讓心安定下來的地方。你想怎麼做？`,
          "清晨在公園，看到一群人安安靜靜地打坐，你看了好久。你也想找一個讓心靜下來的方法嗎？",
        ], v),
        options: [
          {
            id: "l_faith.temple", label: "去廟裡當志工", hint: "幫忙點燈、整理供品", act: "spiritual", style: "safe", weight: 0.25,
            apply: (s2, c) => ({ text: c.w("你開始每週去{家附近的媽祖廟|巷口的土地公廟|山上的寺廟}幫忙，{整理供品、教香客怎麼點光明燈，|過年時幫忙發平安符，}{廟裡的人都叫你一聲{bro}。|那裡的香味讓你覺得很安心。}", v), mood: 3 }),
          },
          {
            id: "l_faith.church", label: "跟著去教會", hint: "唱詩歌、讀經", act: "spiritual", style: "learn", weight: 0.2,
            apply: (s2, c) => ({ text: c.w("你跟著{f}去了教會，{第一次聽詩班唱歌就紅了眼眶，|週三晚上的查經班成了你最期待的時間，}{大家叫你{sis}，牧師也記得你的名字。|你說不一定信什麼，但在那裡心很平靜。|你開始每天睡前禱告。}", v), mood: 3 }),
          },
          {
            id: "l_faith.sit", label: "學打坐禪修", hint: "練習讓心靜下來", act: "spiritual", style: "health", weight: 0.2,
            apply: (s2, c) => ({ text: c.w("你參加了{道場|社區}的禪修班，{每天早上靜坐半小時，|學著數自己的呼吸，}{一開始腳麻得站不起來，|一開始腦袋怎麼都停不下來，}{慢慢地，你晚上睡得比較好了。|你說，心靜下來，很多事就想開了。}"), mood: 3 }),
          },
          {
            id: "l_faith.pilgrim", label: "跟著媽祖遶境", hint: "走一段進香的路", act: "spiritual", style: "social", weight: 0.15, when: s2 => s2.age <= 80 && !s2.abroad,
            apply: (s2, c) => ({ text: c.w("你跟著{大甲媽祖|白沙屯媽祖}遶境，{走了{兩|三}天，|穿著香客的背心跟著隊伍走，}{沿路有人奉茶、送飯糰，|半夜在廟埕打地鋪，}{你說這輩子沒走過那麼多路，也沒看過那麼多善意。|腳起了水泡，心卻很輕。}"), mood: 4 }),
          },
          {
            id: "l_faith.sutra", label: "在家抄經", hint: "一個人安安靜靜的", act: "spiritual", style: "self", weight: 0.15,
            apply: (s2, c) => ({ text: c.w("你開始每天早上在家抄{心經|一段經文}，{一筆一畫，|抄完一張就折好收進盒子裡，}{一年下來抄了三百多張。|手不抖了，心也定了。}"), mood: 3 }),
          },
        ],
      };
    },
  },
];
