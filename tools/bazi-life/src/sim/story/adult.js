// 成家立業（30–55 歲）：婚姻裡的日常、孩子從坐月子到出國讀書、職場的中段、房貸和理財、老朋友。
//
// 這裡每一個機率都沒有官方統計可以依據，全部是設計上的假設（design）：大多數事件一年只有幾個百分點，再用
// cooldown / max / once 限制次數，讓 30–55 歲這二十多年遇到十幾件、其中大約一半要做選擇。
// 為了不推動 test/calibration.test.js 的人口統計，這個模組：
//   - 不結婚、不離婚、不生小孩、不買房、不退休，也不讓任何人死亡或重病（那些都在 core.js）；
//   - 婚姻只用 s.guard = 2（保護接下來的一年）和小幅的 s.crisis，兩邊大致抵銷；「越線」照 act.js 的 affair 一樣小；
//   - 不會讓人丟掉工作：轉行、跳槽都還是有工作（轉行用 world.js 的 otherJob / startJob），而且很少；
//   - 錢的進出都在一年薪水的幾成以內，有花有賺；健康只有 hr ×0.98（開始運動）和 ×1.02（硬撐）兩處。
//
// Probabilities in this file are design assumptions, not statistics (see above). Event ids start with "a_".
//
// The English edition (README「英文版（翻譯層）」, src/i18n/en/adult.json): every sentence is a template with {vars}
// rather than a `…${x}…` literal, so its English can be found by the Chinese as written. An answer that goes on from
// the situation is one template that starts with {lead}, the situation as already told; a piece that differs from
// scene to scene and has alternatives of its own is a group of vars ({{a}|{b}}), each a plain sentence with its own
// English. A value whose English here is not the shared word's (補習班 as a kind of business, 滑手機 for someone else)
// goes through ctx.f, so it takes this file's English. The Chinese, and every draw, are as they were.
import { yearsMarried, bornSiblings, otherJob, startJob, exam15Name, exam18Name } from "../world.js";
import { pronoun, partnerMember, sameSexCouple } from "../people.js";
import { callName } from "../words.js";
import { clash } from "../../core/detail.js";
import { fill } from "../grammar.js";

// ---------- helpers ----------
const UNI = ["大學", "科大", "碩士", "博士"];
const married = s => s.rel === "married" && !!s.partner;
const youngest = s => s.kids[s.kids.length - 1];
const kidsAged = (s, lo, hi) => s.kids.filter(k => k.age >= lo && k.age <= hi);
const kidsWord = s => (s.kids.length > 1 ? "孩子們" : "孩子");
// Five eras for the everyday details: before 1990, the 1990s, the 2000s, the 2010s, and 2020 on.
const era = s => (s.year < 1990 ? 0 : s.year < 2000 ? 1 : s.year < 2010 ? 2 : s.year < 2020 ? 3 : 4);
const byEra = (s, list) => list[Math.min(list.length - 1, era(s))];
const spend = (s, x) => { const paid = Math.min(s.savings, x); s.savings -= paid; return paid; };
const stress = (s, d) => { s.health.stress = Math.max(0, Math.min(1, s.health.stress + d)); };
const guardUp = (s, n) => { s.guard = Math.max(s.guard, n); };
const crisisUp = (s, n) => { s.crisis = Math.max(s.crisis, n); };
const frugal = (s, years) => { s.flags.frugalUntil = Math.max(s.flags.frugalUntil || 0, s.age + years); };
// Works for an employer (not the family shop, not one's own business).
const corp = s => s.employed && !!s.job && !["自營", "家業"].includes(s.job.field);
const parentsWord = s => (s.father.alive && s.mother.alive ? "爸媽" : s.father.alive ? "爸爸" : s.mother.alive ? "媽媽" : null);
const pick2 = (ctx, list) => { const i = ctx.rng.int(list.length); let j = ctx.rng.int(list.length - 1); if (j >= i) j += 1; return [list[i], list[j]]; };
const contactWord = s => (s.year >= 2011 ? "互加了 LINE" : s.year >= 2005 ? "互加了 MSN" : s.year >= 1998 ? "交換了手機號碼" : "留了電話");
// 日支相沖 between you and the partner from the family input (家人合盤的伴侶), only while that person is your partner.
const rhythmClash = (s, ctx) => {
  const m = s.partner && s.partner.real ? partnerMember(ctx.family) : null;
  return !!(m && m.chart) && clash(ctx.chart.pillars[2].name[1], m.chart.pillars[2][1]);
};
// 哥哥志明, or just 哥哥 (words.js siblingCall), as a template so the English has the name too.
const siblingOf = (ctx, x) => (x.name ? ctx.f("{rel}{name}", { rel: x.label, name: callName(x.name) }) : x.label);

// A string shown as a button or hint that the story also writes inside a sentence: the same Chinese, and in English
// the sentence's words with a capital letter.
const asLabel = (ctx, x) => ctx.f("{asLabel}", { asLabel: x });

// ctx.w over a list of templates that were `…${x}…` literals before the English edition. ctx.w passes over the
// templates this life has already told (s.used); a literal was a different string for each x, so whether a template
// was told is asked of what its literal read, fill(t, vars), and the Chinese reads as it did. `more`: the story's own
// words ({n}, {kids}, {partner}…), which the literals had as they are.
function wordsAs(s, ctx, list, vars, more = {}) {
  const was = t => fill(t, vars);
  for (const t of list) { if (s.used.has(was(t))) s.used.add(t); else s.used.delete(t); }
  const text = ctx.w(list, { ...vars, ...more });
  for (const t of list) if (s.used.has(t)) s.used.add(was(t));
  return text;
}

// Where 生活節奏不同 shows: the situation, what adapting to the partner means there (the whole answer, from {lead}),
// and what giving each other room means there (the same). Living together (married, or moved in while dating) or not;
// `night` is what the night owl stays up for. `v` holds the values the lead had written in.
function rhythmScenes(s, home, night) {
  const msg = s.year >= 1998;
  if (!home) {
    return [
      {
        lead: "你習慣早睡，{partner}卻是夜貓子，{late}", v: { late: msg ? "常常半夜還傳訊息給你" : "總是半夜才打電話給你" },
        adapt: msg ? "{lead}。你決定配合{partner}，晚一點睡，手機開著等{ta}的訊息。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}" : "{lead}。你決定配合{partner}，晚一點睡，把電話放在床邊等{ta}打來。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}",
        space: "{lead}。你們說好不勉強對方配合：說好晚上十一點以後不吵對方，有話隔天再說。{見面的時候反而更珍惜。|你自在多了，{partner}也是。|吵架的次數少了很多。}",
      },
      {
        lead: "{partner}週末喜歡把行程排得滿滿的，你只想{好好睡一覺|待在家裡休息}，約會常常為了要去哪裡{僵持不下|討論好久}", v: {},
        adapt: "{lead}。你決定配合{partner}，跟著{ta}跑完一整天的行程。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}",
        space: "{lead}。你們說好不勉強對方配合：週末各自先過半天，下午再見面。{見面的時候反而更珍惜。|你自在多了，{partner}也是。|吵架的次數少了很多。}",
      },
      {
        lead: "你做事喜歡先計畫，{partner}卻總是臨時約你，{{soon}|說走就走}", v: { soon: s.employed ? "常常下班前一個小時才說要見面" : "常常一個小時前才說要見面" },
        adapt: "{lead}。你決定配合{partner}，把自己的時間空下來，{ta}一約就到。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}",
        space: "{lead}。你們說好不勉強對方配合：說好臨時的邀約可以說不，不用勉強。{見面的時候反而更珍惜。|你自在多了，{partner}也是。|吵架的次數少了很多。}",
      },
      ...(s.employed ? [{
        lead: "你和{partner}一個{上早班|朝九晚五}、一個{上晚班|常常加班到很晚}，{一週只見得到一次面|想見面總是對不上時間}", v: { unanswered: msg ? "沒回訊息" : "沒打電話" },
        adapt: "{lead}。你決定配合{partner}，配合{ta}的時間，{ta}一下班你就去找{ta}。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}",
        space: "{lead}。你們說好不勉強對方配合：見不到面的日子各忙各的，不再為了{unanswered}生氣。{見面的時候反而更珍惜。|你自在多了，{partner}也是。|吵架的次數少了很多。}",
      }] : []),
    ];
  }
  const little = s.rel === "married" && s.kids.some(k => k.age <= 6);
  return [
    {
      lead: "你習慣{十點|十一點}就上床，{partner}卻常常{night}到半夜{一兩點|兩三點}", v: { night },
      adapt: "{lead}。你決定配合{partner}，{晚一點睡，陪{ta}{night}|把上床的時間往後挪了一個小時}。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}",
      space: "{lead}。你們說好不勉強對方配合：{晚睡的人改到客廳，不吵醒先睡的人|你戴上眼罩，{ta}也把燈調暗}。{兩個人在一起的時候反而更輕鬆。|你自在多了，{partner}也是。|吵架的次數少了很多。}",
    },
    {
      lead: "{partner}每天{五點半|六點}就起床{去運動|準備早餐|出門晨跑}，你卻總要賴床到最後一刻", v: {},
      adapt: "{lead}。你決定配合{partner}，{跟著{ta}早起，陪{ta}去運動|把鬧鐘往前調了一個小時，和{ta}一起吃早餐}。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}",
      space: "{lead}。你們說好不勉強對方配合：{ta}照樣早起，你照樣睡到最後一刻，晚上再一起吃飯。{兩個人在一起的時候反而更輕鬆。|你自在多了，{partner}也是。|吵架的次數少了很多。}",
    },
    {
      lead: "一到週末，{partner}就想{出門走走|找朋友聚餐|去爬山}，你只想待在家裡{補眠|看電視|整理東西}", v: {},
      adapt: "{lead}。你決定配合{partner}，週末跟著{ta}出門，{爬山、逛街|和{ta}的朋友聚餐}都陪著。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}",
      space: "{lead}。你們說好不勉強對方配合：週末{ta}去找朋友，你在家裡{補眠|看書}，晚上再一起吃飯。{兩個人在一起的時候反而更輕鬆。|你自在多了，{partner}也是。|吵架的次數少了很多。}",
    },
    {
      lead: "你什麼事都喜歡先排好計畫，{partner}卻常常想到什麼就做什麼，{連晚餐要吃什麼都臨時才決定|出門旅行從來不先訂房}", v: {},
      adapt: "{lead}。你決定配合{partner}，試著不排行程，跟著{ta}{說走就走|臨時決定}。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}",
      space: "{lead}。你們說好不勉強對方配合：你照樣排你的計畫，{ta}照樣臨時起意，誰也不管誰。{兩個人在一起的時候反而更輕鬆。|你自在多了，{partner}也是。|吵架的次數少了很多。}",
    },
    {
      lead: "你吃飯、走路、做事都很快，{partner}卻什麼都慢慢來，{每次出門你都在門口等{ta}|你常常忍不住催{ta}}", v: {},
      adapt: "{lead}。你決定配合{partner}，放慢腳步，{陪{ta}慢慢吃完一頓飯|出門前不再催{ta}}。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}",
      space: "{lead}。你們說好不勉強對方配合：出門前誰先準備好，就先下樓等，不再催對方。{兩個人在一起的時候反而更輕鬆。|你自在多了，{partner}也是。|吵架的次數少了很多。}",
    },
    ...(s.employed ? [{
      lead: "你和{partner}一個{上早班|朝九晚五}、一個{上晚班|常常加班到很晚}，{回到家另一個人已經睡了|一天說不上幾句話}", v: {},
      adapt: "{lead}。你決定配合{partner}，把自己的作息往{ta}那邊調，等{ta}下班再睡。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}",
      space: "{lead}。你們說好不勉強對方配合：說好不再等門，先睡的人留一張紙條給對方。{兩個人在一起的時候反而更輕鬆。|你自在多了，{partner}也是。|吵架的次數少了很多。}",
    }] : []),
    ...(little ? [{
      lead: "有了{kid}以後，你和{partner}一個顧早上、一個顧晚上，兩個人像在輪班，{好久沒有好好說話|一天說不上幾句話}", v: {},
      adapt: "{lead}。你決定配合{partner}，多接了幾個晚上，好讓{ta}多睡一點。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}",
      space: "{lead}。你們說好不勉強對方配合：一人顧一個時段，輪到休息的人就出門走走，不用陪著。{兩個人在一起的時候反而更輕鬆。|你自在多了，{partner}也是。|吵架的次數少了很多。}",
    }] : []),
    ...(s.age >= 60 ? [{
      lead: "{since}，你每天一早就去{公園運動|市場買菜|爬山}，{partner}卻喜歡在家裡{泡茶|看電視|看報紙}到很晚才睡", v: { since: s.retired ? "退休以後" : "這幾年" },
      adapt: "{lead}。你決定配合{partner}，{晚一點出門，陪{ta}吃完早餐|晚上陪{ta}看完電視再睡}。{累是累了點，{partner}都看在眼裡。|有時候會覺得，自己好像不太像自己了。|{ta}笑著說，沒想到你願意為{ta}改。}",
      space: "{lead}。你們說好不勉強對方配合：早上你出門，{ta}睡到自然醒，下午再一起去散步。{兩個人在一起的時候反而更輕鬆。|你自在多了，{partner}也是。|吵架的次數少了很多。}",
    }] : []),
  ];
}

// A friend for the story: one already in it, or an old classmate who joins the story now.
function friendOf(s, ctx, how = "同學") {
  const known = s.friends.filter(f => f && f.alive !== false && f.call);
  if (known.length) return { f: ctx.rng.pick(known), fresh: false };
  const sex = ctx.rng() < 0.7 ? s.sex : s.sex === "male" ? "female" : "male";
  const f = ctx.person({ role: "friend", sex, birthYear: s.birthYear + ctx.rng.int(5) - 2, how });
  s.friends.push(f);
  return { f, fresh: true };
}
// Someone from school days the reunion can bring back: an ex who was a classmate (only while there has been no
// divorce, so it is never a former spouse), else a crush the story remembered (kind "crush", possibly unnamed).
// Never the current partner.
function oldFlame(s) {
  const now = s.partner ? s.partner.call : null;
  if (!s.divorces) {
    const ex = s.exes.find(x => x && x.alive !== false && x.call && (x.how === "同學" || x.how === "老同學") && x.call !== now);
    if (ex) return { kind: "ex", name: ex.call, school: UNI.includes(s.edu) ? "大學" : "高中" };
  }
  const m = [...s.memory].reverse().find(x => x && x.kind === "crush");
  if (!m) return null;
  const name = [m.call, m.name, m.who, m.person && m.person.call].find(v => typeof v === "string" && v.trim() && !/[{}|]/.test(v)) || null;
  if (name && name === now) return null;
  const at = Number.isFinite(m.age) ? m.age : null;
  return { kind: "crush", name, at, school: at === null ? "高中" : at <= 15 ? "國中" : at <= 18 ? "高中" : "大學" };
}

// ---------- scenes ----------
// One situation for a choice, so the same question reads differently from life to life. `list` holds the scenes
// that fit now (null for one that does not), each with a weight `w` (higher for one made for this moment of life,
// default 1); a scene this life has not had for the question comes first (s.flags["<id>:scenes"] keeps the told
// ones). The question, the buttons and every answer are written from the scene that comes back: each answer is
// [label, hint, what happens], what happens starting from {lead}, and `v` holds the values its templates use.
function pickScene(s, ctx, id, list) {
  const ok = list.filter(Boolean), key = `${id}:scenes`, told = s.flags[key] || (s.flags[key] = []);
  const fresh = ok.filter(x => !told.includes(x.key));
  const sc = ctx.rng.weighted((fresh.length ? fresh : ok).map(x => [x, x.w ?? 1]));
  told.push(sc.key);
  return sc;
}

// a_chores: what the quarrel over housework is about this time. `p` is the partner's name, `ta` 他／她.
function choresScenes(s, ctx, p, ta) {
  const kid = youngest(s), school = kidsAged(s, 6, 12), sk = school.length ? school[school.length - 1].call : null;
  const v = {
    p, ta, kn: kid ? kid.call : null, sk,
    pile: byEra(s, ["衣服還沒洗、還沒晾，晚飯也還沒燒", "電鍋和洗衣機都有了，碗盤還是每天堆在水槽", "已經八點多了，碗盤和衣服還在等著", "掃地機器人只會掃地，碗、衣服和垃圾還是要有人顧", "家電一樣比一樣聰明，碗、衣服和垃圾還是要有人顧"]),
    homework: kidsAged(s, 6, 15).length ? "，孩子的聯絡簿也還沒簽" : "",
    help: byEra(s, ["請了一位阿姨每週來兩次幫忙打掃", "請了一位每週來一次的打掃阿姨", "買了烘衣機，每兩週請鐘點清潔來一次", "買了洗碗機和掃地機器人，每個月叫一次到府清潔"]),
    lighter: s.kids.length ? "省下來的時間拿來陪孩子。" : "省下來的時間拿來陪彼此。",
    back: s.employed ? "下班回家" : "忙了一整天",
    kidsChore: s.kids.length ? "孩子也分到擦桌子和摺衣服。" : "誰忘了就請對方喝飲料。",
    recycle: s.year >= 1998 ? "和回收" : "", screen: ctx.f(s.year >= 2010 ? "滑手機" : "看電視"),
    trashRule: s.year >= 1998 ? "回收另外排，誰把瓶瓶罐罐洗好，誰就少倒一天。" : "誰忘了就請對方吃宵夜。",
    putDown: s.year >= 2010 ? "放下手機" : "看完電視",
    desk: s.kids.length ? "孩子分到擦自己的書桌。" : "誰先做完，誰決定年夜飯吃什麼。",
    daytime: s.employed ? "白天上班時，你常常坐在位子上打瞌睡。" : kid ? ctx.f("白天你常常抱著{kn}就睡著了。", { kn: kid.call }) : null,
    early: s.employed ? "提早一個小時下班，" : "早早就",
    slump: s.year >= 2010 ? "躺在沙發上滑手機" : "坐在電視前面不動",
    rain: s.county === "基隆市" ? "基隆的雨" : "梅雨季的雨",
  };
  const feel = ctx.f("讓{ta}知道你的感受", { ta });
  const scenes = [
    {
      key: "evening", lead: "{back}，{pile}{homework}。你覺得家事都落在自己身上，和{p}開始互相計較",
      list: ["列一張家事表", "誰做什麼寫清楚", "{lead}。你們在冰箱上貼了一張家事表：{你洗碗、{p}倒垃圾，|{p}洗衣服、你煮飯，|一人一天輪流，}{週末一起大掃除。|{kidsChore}}{吵架的次數少了一半。|雖然常常有人忘記，但至少有個依據。}"],
      talk: ["說出自己的累", feel, "{lead}。你找了一個晚上跟{p}說，自己不是想吵架，只是真的累了。{{p}沉默了一會，隔天默默把碗洗了。|{p}抱了抱你，說以後一起做。|{p}說{ta}也很累，兩個人第一次把心裡話講開。}"],
      buy: ["花錢買時間", era(s) < 2 ? "請人來幫忙打掃" : "請人打掃，或買家電", "{lead}。{你們決定花錢買時間，|兩個人算了算，乾脆花點錢解決，}{help}，{{lighter}|錢花了，心情卻輕鬆很多。}"],
      more: ["自己多做一點", "不想為這種事吵", "{lead}。你決定不吵了，{自己把碗洗完、把衣服摺好，|每天晚上一個人把家裡收拾乾淨，}{{p}過了好幾個月才發現。|只是有時候，你會覺得很累。}"],
      strike: ["擺著不做", "看誰先受不了", "{lead}。你決定什麼都不做，{碗在水槽裡堆了三天，|髒衣服堆成一座小山，}{兩個人誰也不先開口。|家裡的空氣越來越僵。}"],
    },
    // 垃圾車放〈少女的祈禱〉〈給愛麗絲〉，台灣各地都聽得到；資源回收另外排，大約從 1998 年的「四合一」起。
    s.year >= 1985 && !s.abroad && {
      key: "trash", lead: "晚上{八|九}點，巷口傳來垃圾車〈{少女的祈禱|給愛麗絲}〉的音樂，又是你一個人提著垃圾{recycle}衝出門，{p}還坐在沙發上{screen}",
      list: ["排一張倒垃圾的輪值表", "誰倒哪幾天寫清楚", "{lead}。你們在月曆上排好倒垃圾的日子：{一三五你、二四六{p}，|平日{p}倒、週末你倒，}{{trashRule}|音樂一響，輪到的人就得出門。}{追垃圾車的人終於不只你一個。|雖然偶爾有人忘記，但至少不用再為這個吵。}"],
      talk: ["說出自己的累", feel, "{lead}。你等{p}{putDown}，跟{ta}說自己不是在計較一包垃圾，是覺得這個家好像只有你在顧。{隔天晚上音樂一響，{p}已經提著袋子站在門口。|{p}愣了一下，說{ta}一直以為你喜歡順便出去走走。|兩個人第一次把心裡話講開。}"],
      buy: s.year >= 2015
        ? ["請人代收垃圾", "一個月幾百塊", "{lead}。你們找了代收垃圾的服務，{每天晚上把垃圾袋放在門口就好，|一個月付幾百塊，}{再也不用追著音樂跑。|錢花了，心情卻輕鬆很多。}"]
        : ["請打掃阿姨幫忙", "連垃圾一起處理", "{lead}。你們請了一位打掃阿姨每週來兩次，{順便把垃圾{recycle}拿去丟，|連廚房的油垢都一起刷乾淨，}{{lighter}|錢花了，心情卻輕鬆很多。}"],
      more: ["反正順路，自己倒", "不想為這種事吵", "{lead}。你決定不吵了，{每天晚上照樣自己提著垃圾出門，|順便在巷口繞一圈當散步，}{{p}過了好幾個月才發現。|只是有時候，你會覺得很累。}"],
      strike: ["這次不倒了", "看誰先受不了", "{lead}。你決定不倒了，{垃圾袋在門口堆了三天，|廚房開始飄出怪味，}{兩個人誰也不先開口。|家裡的空氣越來越僵。}"],
    },
    {
      key: "newyear", lead: "過年前要大掃除，{p}說要等週末，週末到了又說太累，{窗戶和抽油煙機|浴室和陽台}還是只有你一個人在刷",
      list: ["把大掃除分區包下來", "誰擦窗、誰刷浴室寫清楚", "{lead}。你們把家裡分成幾區：{你包廚房和浴室，{p}包窗戶和陽台，|{p}負責高的地方，你負責低的地方，}{{desk}|一人一張清單，做完一項就打一個勾。}{除夕前一天，家裡終於亮晶晶。|雖然拖到最後一天，總算掃完了。}"],
      talk: ["說出自己的累", feel, "{lead}。你放下抹布，跟{p}說自己不是要{ta}幫忙，是想要兩個人一起顧這個家。{{p}沒說什麼，捲起袖子去刷了浴室。|{p}說{ta}以為你喜歡自己來，兩個人都笑了出來。|兩個人第一次把心裡話講開。}"],
      buy: s.year >= 1995
        ? ["請清潔公司來大掃除", "花錢買一個乾淨的年", "{lead}。你們請了清潔公司，{兩個師傅一個下午就把抽油煙機和窗戶洗得發亮，|連冷氣的濾網都洗乾淨了，}{你們用省下來的時間去辦年貨。|錢花了，心情卻輕鬆很多。}"]
        : ["請鄰居阿姨來幫忙", "包個紅包給她", "{lead}。你們請隔壁的阿姨來幫忙掃了兩天，{包了一個紅包給她，|事後送了她一盒年糕，}{家裡總算在除夕前掃完了。|錢花了，心情卻輕鬆很多。}"],
      more: ["自己一個人掃完", "不想為這種事吵", "{lead}。你不想吵，{一個人從廚房刷到浴室，|爬上爬下把每一扇窗戶擦完，}{除夕那天腰痠得直不起來。|{p}過了好幾天才發現窗戶是乾淨的。}"],
      strike: ["乾脆不掃了", "看誰先受不了", "{lead}。你決定不掃了，{抹布丟在水桶裡，一放就是一個星期，|窗戶上的灰一直留到過年，}{親戚來拜年時，兩個人都有點尷尬。|兩個人誰也不先開口。}"],
    },
    kid && kid.age <= 1 && {
      key: "baby", w: 3, lead: "{kn}晚上要喝{兩|三}次奶，誰起來泡奶、誰洗奶瓶，你和{p}天天在計較",
      list: ["排好夜奶的班表", "一人一晚輪流", "{lead}。你們排好了班表：{一人一晚輪流起來，|十二點前{p}顧、十二點後你顧，}{沒輪到的人戴上耳塞好好睡。|奶瓶誰用誰洗。}{兩個人的黑眼圈總算淡了一點。|雖然還是很累，但至少不用再吵誰比較累。}"],
      talk: ["說出自己的累", ctx.f("讓{ta}知道你多久沒睡好", { ta }), "{lead}。你趁{kn}睡著的空檔，跟{p}說自己不是想吵架，只是真的快撐不住了。{{p}說{ta}也一樣，兩個人抱在一起笑了。|那天晚上，{p}主動說下半夜換{ta}起來。|兩個人第一次把心裡話講開。}"],
      buy: s.year >= 1995
        ? ["請保母幫忙幾個晚上", "花錢換睡眠", "{lead}。你們請了一位保母，一個星期來顧{kn}幾個晚上，{那天你睡了一整夜，醒來差點哭出來。|錢花了，兩個人終於能好好睡一覺。}"]
        : ["請隔壁阿姨幫忙顧", "每個月包個紅包", "{lead}。你們請隔壁帶過好幾個孩子的阿姨，一個星期幫忙顧{kn}兩個晚上，{每個月包一個紅包給她，|錢不多，阿姨也很樂意，}{那天你睡了一整夜。|兩個人終於能好好睡一覺。}"],
      more: ["自己多起來幾次", "不想為這種事吵", "{lead}。你不想吵，{{kn}一哭就自己起來泡奶，|半夜自己把奶瓶洗好、消毒好，}{{p}睡得很熟，什麼都不知道。|{daytime}}"],
      strike: ["假裝睡著", "看誰先受不了", "{lead}。{kn}半夜哭了，你翻過身假裝沒聽見，{{p}也一動不動，|兩個人比誰撐得久，}{最後是{kn}哭到兩個人都坐了起來。|隔天早上，誰也不跟誰說話。}"],
    },
    sk && {
      key: "school", w: 2, lead: "{sk}每天下午四點放學，誰去接、誰陪寫功課、誰簽聯絡簿，你和{p}從來沒有說好",
      list: ["把接送和功課排成表", "誰負責哪一天寫清楚", "{lead}。你們在冰箱上貼了一張表：{一三五你接、二四{p}接，|你負責接送，{p}負責陪寫功課，}{聯絡簿誰看到誰簽。|週五晚上一起檢查作業。}{{sk}說終於不會在校門口等到最後一個了。|雖然偶爾有人忘記，但至少不用每天吵。}"],
      talk: ["說出自己的累", feel, "{lead}。你等{sk}睡了，跟{p}說自己不是想吵架，只是每天下午都在跟時間賽跑。{{p}沉默了一會，隔天下午出現在校門口。|{p}說{ta}以為你都安排好了，兩個人第一次把心裡話講開。|{p}抱了抱你，說以後一起做。}"],
      buy: s.year >= 1990
        ? ["讓孩子去安親班", "花錢買時間", "{lead}。你們讓{sk}放學後去安親班，{老師會盯著寫功課、幫忙看聯絡簿，|一個月的學費不便宜，}{你們下班再去接。|兩個人總算不用再為接送吵架。}"]
        : ["請鄰居阿姨幫忙接送", "每個月包一點錢", "{lead}。你們請鄰居阿姨放學時順便把{sk}接回她家，{每個月包一點錢給她，|功課也順便幫忙看一看，}{你們下班再去接。|兩個人總算不用再為接送吵架。}"],
      more: ["自己多做一點", s.employed ? "每天提早下班去接" : "每天自己去接", "{lead}。你不想吵，{每天{early}去校門口等，|晚上自己陪{sk}把功課寫完、把聯絡簿簽好，}{{p}過了好幾個月才發現。|只是有時候，你會覺得很累。}"],
      strike: ["這個星期不管了", "看誰先受不了", "{lead}。你決定這個星期不管了，{聯絡簿連著三天沒有人簽，|老師打電話來問怎麼都沒人看功課，}{兩個人誰也不先開口。|家裡的空氣越來越僵。}"],
    },
    {
      key: "dinner", lead: "{p}一回到家就{slump}，晚餐又是你一個人在廚房裡{洗菜、切菜、炒菜|忙進忙出}",
      list: ["說好誰煮飯、誰洗碗", "分工寫清楚", "{lead}。你們說好：{你煮飯、{p}洗碗，|平日你煮、週末{p}煮，|一人一天輪流下廚，}{{p}煮的第一頓是兩包泡麵加蛋，你還是吃完了。|洗碗的人可以決定明天吃什麼。}{吵架的次數少了一半。|雖然常常有人偷懶，但至少有個依據。}"],
      talk: ["說出自己的累", feel, "{lead}。你把鍋鏟放下，跟{p}說自己不是想吵架，只是也想有人問一句今天累不累。{隔天晚上，{p}站在你旁邊學切菜。|{p}說{ta}也很累，兩個人第一次把心裡話講開。|{p}抱了抱你，說以後一起做。}"],
      buy: s.year >= 2016
        ? ["晚餐改叫外送", "花錢買時間", "{lead}。你們決定平日的晚餐改叫外送，{手機點一點，半小時就送到門口，|一個月多花了一筆錢，}{{lighter}|錢花了，心情卻輕鬆很多。}"]
        : ["晚餐改買外面的", "花錢買時間", "{lead}。你們決定平日的晚餐改買{巷口的自助餐|附近的便當}，{一個月多花了一筆錢，|省得每天開伙，}{{lighter}|錢花了，心情卻輕鬆很多。}"],
      more: ["自己煮就好", "不想為這種事吵", "{lead}。你決定不吵了，{每天照樣一個人煮完、一個人洗完，|自己把三菜一湯端上桌，}{{p}吃得很開心，什麼都沒發現。|只是有時候，你會覺得很累。}"],
      strike: ["今晚不煮了", ctx.f("看{ta}會不會餓", { ta }), "{lead}。你決定不煮了，{冰箱裡的菜放到黃掉，|兩個人各自泡了一碗泡麵，}{兩個人誰也不先開口。|家裡的空氣越來越僵。}"],
    },
    !s.abroad && {
      key: "laundry", lead: "{rain}一連下了兩個星期，陽台掛滿了晾不乾的衣服，收衣服、摺衣服又都是你一個人",
      list: ["說好誰洗、誰收、誰摺", "分工寫清楚", "{lead}。你們說好：{{p}洗、你晾，收下來一人摺一半，|一人負責一個星期，}{摺衣服的時候一起看電視。|誰的衣服誰自己收進衣櫃。}{吵架的次數少了一半。|雖然常常有人忘記，但至少有個依據。}"],
      talk: ["說出自己的累", feel, "{lead}。你抱著一籃還有點潮的衣服，跟{p}說自己不是想吵架，只是真的累了。{{p}接過籃子，坐下來陪你一起摺。|{p}說{ta}一直沒注意到，兩個人第一次把心裡話講開。|{p}抱了抱你，說以後一起做。}"],
      buy: s.year >= 2005
        ? ["買一台烘衣機", "花錢買時間", "{lead}。你們買了一台烘衣機，{下雨天也不怕衣服晾不乾，|洗好的衣服一烘就是一整籃，}{陽台終於空了出來。|錢花了，心情卻輕鬆很多。}"]
        : s.year >= 1995
          ? ["送去自助洗衣店", "花錢買時間", "{lead}。你們決定雨天把衣服送去巷口的自助洗衣店，{投幣烘乾，四十分鐘就好，|一邊等一邊在隔壁的麵店吃晚餐，}{陽台終於空了出來。|錢花了，心情卻輕鬆很多。}"]
          : ["送去洗衣店", "花錢買時間", "{lead}。你們決定雨天把衣服送去洗衣店，{隔天就能拿回乾乾淨淨的衣服，|老闆娘還幫忙燙好了襯衫，}{陽台終於空了出來。|錢花了，心情卻輕鬆很多。}"],
      more: ["自己收、自己摺", "不想為這種事吵", "{lead}。你決定不吵了，{每天晚上一個人把衣服收進來、一件一件摺好，|拿吹風機把{p}明天要穿的衣服吹乾，}{{p}過了好幾個月才發現。|只是有時候，你會覺得很累。}"],
      strike: ["衣服堆著不收", "看誰先受不了", "{lead}。你決定不收了，{衣服在陽台掛了一個星期，|乾淨的衣服和髒衣服堆成一座小山，}{{p}找不到乾淨的襪子，也不肯開口。|家裡的空氣越來越僵。}"],
    },
  ];
  return scenes.map(x => x && { ...x, v });
}

// a_midManager: what makes the new manager's job hard this time. The endings of 上管理課, 全部自己扛 and 找以前的主管
// are written in the event from the scene's pieces in `v`: the course ({c1} {c2}, {learnt}), what you carry
// ({carryX}{carryA}{carryB}), its bad turn ({badB}) and good one ({okA}), and what the old boss says ({saysA}{saysB},
// {endA}).
function managerScenes(s, ctx, { f, title, boss, always }) {
  const top = { 公部門: "上面要成果", 教育: "上面要評鑑", 醫療: "上面要績效", 營造: "上面要進度" }[f] || "上面要業績";
  const orgIn = { 公部門: "機關要導入", 教育: "學校要導入", 醫療: "醫院要導入", 社福: "機構要導入", 法律: "事務所要導入" }[f] || "公司要導入";
  const course = f === "公部門" ? "主管研習班，" : f === "教育" ? "行政主管的研習，" : "公司的主管培訓，";
  const [goalA, goalB] = { 公部門: ["計畫的執行率要再拉高", "預算砍一成、業務卻一樣也不能少"], 教育: ["明年的招生人數要再拉高", "評鑑的資料一個月內要補齊"], 醫療: ["門診量要再拉高兩成", "人力不補、病床卻要多開"], 營造: ["工程進度要提前一個月", "預算砍一成、工期卻不能延"] }[f] || ["下一季的業績要再拉高兩成", "預算砍一成、業績還要往上拉"];
  const slip = { 公部門: "一份公文的日期", 教育: "整個年級的成績", 醫療: "整個月的排班表", 科技: "出貨的規格", 製造: "一批貨的規格", 金融: "客戶的一筆匯款", 餐飲: "一場喜宴的訂單", 營造: "一張施工圖", 運輸: "整個星期的班表", 零售: "整季的進貨量", 法律: "一份訴狀的期限", 行政: "一份合約的日期", 業務: "客戶的報價單", 行銷: "活動的日期", 設計: "印刷的稿子", 媒體: "一則新聞的人名", 不動產: "一份買賣契約", 觀光: "一整團的機票", 社福: "一份補助的申請", 研究: "一份計畫的預算", 服務: "客人的預約" }[f] || "客戶的一份訂單";
  const [sysA, sysB] = f === "公部門" ? (s.year >= 2000 ? ["電子公文系統", "新的績效考核"] : ["電腦化作業", "新的考核制度"])
    : f === "醫療" ? (s.year >= 2005 ? ["電子病歷", "新的排班系統"] : ["電腦化作業", "新的排班制度"])
      : f === "教育" ? (s.year >= 2000 ? ["新的校務系統", "新的教師評鑑"] : ["電腦化作業", "新的評鑑制度"])
        : s.year >= 2015 ? ["雲端的新系統", "新的績效制度"] : s.year >= 2000 ? ["新的 ERP 系統", "新的績效制度"] : ["電腦化作業", "新的考核制度"];
  const kid = kidsAged(s, 3, 15).pop();
  const shared = {
    title, boss, always, top, orgIn, slip, goalA, goalB, sysA, sysB, kn: kid ? kid.call : null,
    c1: ctx.f("你報名了{course}", { course }), c2: "你報名了外面的管理課程，",
    okA: "你卻在頒獎時差點睡著。", badB: "組員卻一個個說想調走，", endA: "你回去後試著改變做法，壓力小了一些。",
  };
  const back = ["回去當專業職", "不帶人，做擅長的事", "{lead}。你跟{boss}說想回去做專業的工作，{{boss}雖然惋惜，還是答應了。|薪水少了一點，}{你又開始享受工作了。|每天準時下班，晚餐又能在家吃。}"];
  const scenes = [
    {
      key: "squeeze", lead: "升上{title}之後，{top}、下面要人情，你夾在中間，{每天最早到、最晚走|{always}|開會開到連午餐都沒時間吃}",
      delegate: ["學著把工作分出去", "相信你的組員", "{lead}。你學著把工作分出去，{第一次把重要的案子交給組員，|每週一開會把事情分清楚，}{雖然出了幾次包，但你終於能準時下班了。|團隊反而做得比你想的好。}"],
      course: ["去上管理課", "學怎麼帶人"], carry: ["全部自己扛", "做到最好再說"], mentor: ["找以前的主管請教", "聽聽過來人怎麼說"], back,
      v: { learnt: "學會怎麼開一場不冗長的會。", carryX: "你什麼都自己扛，", carryA: "連續三個月每天加班到十點，", carryB: "手機二十四小時開著，", saysA: "對方笑著說：「我當年也一樣。」", saysB: "聽對方講了一個下午的帶人心得，" },
    },
    {
      key: "senior", lead: "升上{title}之後，組裡有一位比你資深{十年|十幾年}的前輩，開會時常常{當眾唱反調|說以前不是這樣做的}",
      delegate: ["把重要的案子交給前輩", "讓前輩有舞台", "{lead}。你把下一個重要的案子交給那位前輩負責，{開會時請對方先講，|自己退到後面幫忙協調，}{前輩愣了一下，之後開會再也沒有唱反調。|案子做得比你想的還好，你也終於能準時下班了。}"],
      course: ["去上管理課", "學怎麼帶比你資深的人"], carry: ["事情都自己來", "不靠前輩也做得完"], mentor: ["找以前的主管請教", "問問怎麼跟前輩相處"],
      back: ["回去當專業職", "位子讓給想坐的人", "{lead}。你跟{boss}說想回去做專業的工作，{{boss}雖然惋惜，還是答應了。|{title}的位子後來給了那位前輩，}{你又開始享受工作了。|每天準時下班，晚餐又能在家吃。}"],
      v: { learnt: "剛好有一堂課在講怎麼帶比自己資深的部屬。", carryX: "你不想跟前輩起衝突，", carryA: "把重要的事都攬到自己身上，", carryB: "每天留到最後一個才走，", badB: "前輩在背後說你什麼都不放心交給別人，", saysA: "對方說：「先讓對方覺得被尊重，事情就好辦了。」", saysB: "對方說自己當年也帶過比自己資深的人，", endA: "你回去後試著改變做法，和前輩的關係慢慢緩和下來。" },
    },
    {
      key: "quit", lead: "升上{title}的第一年，組裡{半年內走了三個人|新人一個接一個離職}，離職面談時大家都說壓力太大",
      delegate: ["把工作攤開來重新分", "讓每個人知道自己負責什麼", "{lead}。你把組裡的工作全部攤開來重新分配，{每個人負責的事寫在白板上，|資深的帶新人、新人先做一半，}{這一年沒有人再遞辭呈。|你自己也終於能準時下班了。}"],
      course: ["去上帶人的課", "學怎麼留住人"], carry: ["缺的人手自己補", "撐到補到人再說"], mentor: ["找以前的主管請教", "問問當年怎麼留人"],
      back: ["回去當專業職", "不帶人，做擅長的事", "{lead}。你跟{boss}說自己不適合帶人，想回去做專業的工作，{{boss}雖然惋惜，還是答應了。|薪水少了一點，}{你又開始享受工作了。|每天準時下班，晚餐又能在家吃。}"],
      v: { learnt: "學會每個月跟組員一對一聊一次。", carryX: "走掉的人留下的工作你全接過來，", carryA: "連續三個月每天加班到十點，", carryB: "週末也還在加班，", badB: "剩下的組員看你這樣，也一個個說想調走，", saysA: "對方笑著說：「我第一年也走掉一半的人。」", saysB: "對方教你先找最想走的那個人好好聊一次，" },
    },
    {
      key: "target", lead: "{boss}說{{goalA}|{goalB}}，你帶的組員卻已經天天在加班",
      delegate: ["把目標拆給每個人", "大家一起扛", "{lead}。你把目標拆成一小塊一小塊，{每個人認領自己做得到的那一份，|每週一開會對一次進度，}{最後差一點點達標，但沒有人累倒。|團隊反而做得比你想的好。}"],
      course: ["去上管理課", "學怎麼訂目標、排優先"], carry: ["自己跳下去衝", "做到最好再說"], mentor: ["找以前的主管請教", "問問數字怎麼跟上面談"], back,
      v: { learnt: "學會先把不重要的事砍掉。", carryX: "你自己跳下去扛最難的那一塊，", carryA: "連續三個月每天加班到十點，", carryB: "手機二十四小時開著，", saysA: ctx.f("對方教你把做不到的部分先跟{boss}講清楚，", { boss }), saysB: "對方笑著說：「目標是用來談的。」" },
    },
    {
      key: "slip", lead: "組員把{slip}弄錯了，{boss}把你叫進辦公室，要你這個{title}負責",
      delegate: ["讓組員自己去補救", "相信你的組員，你在後面撐", "{lead}。你沒有把事情搶過來，{讓出錯的組員自己去說明、補救，|陪組員把錯在哪裡一條一條找出來，}{事情補好了，那位組員之後做事特別仔細。|團隊反而做得比你想的好，你也終於能準時下班了。}"],
      course: ["去上管理課", "學怎麼把關、怎麼帶人"], carry: ["自己熬夜補好", "不讓組員挨罵"], mentor: ["找以前的主管請教", "問問這種事怎麼收尾"],
      back: ["回去當專業職", "不想再替別人扛", back[2]],
      v: { learnt: "學會把檢查的步驟排進每一個流程。", carryX: "你把責任攬下來，", carryA: "連續好幾個晚上留下來重做，", carryB: "從此每一份東西都自己再檢查一遍，", badB: "組員反而什麼都等你檢查，", saysA: "對方說：「主管就是負責道歉的人。」", saysB: "對方教你先收拾、再檢討、最後才追究，" },
    },
    kid && {
      key: "family", w: 2,
      lead: kid.age <= 6 ? "升上{title}之後，{每天最早到、最晚走|{always}}，{kn}的{{school}親子日|{school}的畢業典禮}你已經缺席兩次了" : "升上{title}之後，{每天最早到、最晚走|{always}}，{kn}的{運動會|家長日|校慶}你已經缺席兩次了",
      delegate: ["把工作分出去，準時下班", "相信你的組員", "{lead}。你學著把工作分出去，{第一次把重要的案子交給組員，|每週一開會把事情分清楚，}{下一次{kn}學校有活動，你坐在第一排。|雖然出了幾次包，但你終於能準時下班了。}"],
      course: ["去上管理課", "學怎麼帶人、怎麼排時間"], carry: ["先把工作顧好", "孩子以後會懂"], mentor: ["找以前的主管請教", "問問人家怎麼兼顧"],
      back: ["回去當專業職", "把時間還給家裡", "{lead}。你跟{boss}說想回去做專業的工作，{{boss}雖然惋惜，還是答應了。|薪水少了一點，}{下一次{kn}學校有活動，你一場都沒錯過。|每天準時下班，晚餐又能在家吃。}"],
      v: { school: s.year >= 2012 ? "幼兒園" : "幼稚園", learnt: "學會把會議砍掉一半。", carryX: ctx.f("你跟{kn}說下次一定去，", { kn: kid.call }), carryA: "還是連續三個月每天加班到十點，", carryB: "手機還是二十四小時開著，", okA: ctx.f("{kn}卻說你答應的事都沒做到。", { kn: kid.call }), saysA: "對方說自己最後悔的，就是錯過孩子長大。", saysB: "對方教你把孩子的事也寫進行事曆，" },
    },
    s.year >= 1985 && {
      key: "system", lead: "{orgIn}{{sysA}|{sysB}}，{boss}指定你的組先試行，組員抱怨連連",
      delegate: ["找兩個組員當種子", "相信你的組員", "{lead}。你找了兩個學得快的組員當種子，{讓他們先學會再教大家，|每個人負責教會一個同事，}{一個月後，抱怨的人少了一半。|團隊反而做得比你想的好，你也終於能準時下班了。}"],
      course: ["先去把新制度學懂", "自己懂了才帶得動人"], carry: ["下班留下來自己弄", "做到最好再說"], mentor: ["找以前的主管請教", "聽聽過來人怎麼說"], back,
      v: { c1: "你先去上了好幾堂教育訓練，", c2: "你先去上了外面的課程，", learnt: "成了組裡第一個搞懂的人。", carryX: "組員弄不來的部分你全接過來，", carryA: "連續三個月每天加班到十點，", carryB: "週末也還在加班，", saysA: "對方說每次換新制度，最難的都是人，不是系統。", saysB: "對方笑著說：「我當年也一樣。」" },
    },
  ];
  return scenes.map(x => x && { ...x, v: { ...shared, ...x.v } });
}

// a_insurance: how buying insurance comes up this time.
function insuranceScenes(s, ctx) {
  const kid = youngest(s), pw = parentsWord(s), infant = !!kid && kid.age <= 1;
  const seller = ctx.rng.pick([UNI.includes(s.edu) ? "大學同學" : "高中同學", "表姊", "以前的同事", "鄰居阿姨"]);
  const full = s.year >= 2000 ? "壽險、醫療險、長照險" : "壽險、醫療險、意外險", fullHint = asLabel(ctx, full);
  const kw = kidsWord(s);
  const v = {
    seller, pw, full, kn: kid ? kid.call : null,
    medical: s.year >= 2005 ? "實支實付的醫療險" : "醫療險",
    compare: s.year >= 2005 ? "上網比較了好幾家，" : "拿回家研究了好幾個晚上，",
    fam: married(s) ? (s.kids.length ? ctx.f("{p}和{kw}", { p: s.partner.call, kw }) : s.partner.call) : s.kids.length ? ctx.f("家人和{kw}", { kw }) : "家人",
    alsoCare: s.year >= 2000 ? "醫療險和長照險" : "醫療險和意外險",
  };
  const saving = ["買儲蓄險當存錢", "強迫自己存錢", "{lead}。你買了{一張六年期的儲蓄險，|一張儲蓄型的保單，}{當作強迫自己存錢。|每年繳一筆，像是在幫未來的自己存錢。}"];
  const ask = ["先問懂保險的朋友", "比清楚再買", "{lead}。你沒有馬上決定，{請一位懂保險的朋友幫你看，|{compare}}{最後只買了真正需要的。|刪掉了一半用不到的附約。}"];
  const mortgage = s.home === "own" && s.ownedAt !== undefined && s.age - s.ownedAt <= 20;
  const scenes = [
    {
      key: "seller", lead: s.year >= 2000 ? "{seller}{在當保險經紀人|在做保險業務}，約你喝咖啡，拿出一整本建議書" : "{seller}在做保險業務，約你喝咖啡，拿出一整本建議書",
      basic: ["只買醫療險和意外險", "基本保障就好", "{lead}。你只挑了{medical}和意外險，{每個月的保費不多，|{seller}有點失望，還是幫你辦好了，}{心裡踏實了一點。|就當以防萬一。}"],
      full: ["一次買齊", fullHint, "{lead}。你{一口氣|聽完說明就}把{full}都買齊了，{每年的保費不便宜，|{seller}開心地請你吃了一頓飯，}{但你覺得家人有了保障。|你把保單收進抽屜最裡面。}"],
      saving,
      ask: ["先問懂保險的朋友", "比清楚再買", "{lead}。你沒有當場簽，{請另一位懂保險的朋友幫你看建議書，|{compare}}{最後只買了真正需要的。|刪掉了一半用不到的附約。}"],
      no: ["不買，自己存錢", "保費拿去存", "{lead}。你婉拒了，{說會再考慮看看。|說自己想先把錢存起來。}{{seller}笑笑說沒關係，下次再約。|那天的咖啡是你請的。}"],
    },
    {
      // {friend} is the same friend from the question to the answer.
      key: "accident", lead: s.year >= 1995 ? "{friend}騎機車{摔車|被擦撞}，{腳骨折|鎖骨裂了}住院一個星期，健保不給付的骨材和病房差額都靠保險理賠才付得出來" : "{friend}騎機車{摔車|被擦撞}，{腳骨折|鎖骨裂了}住院一個星期，住院和開刀的錢都靠保險理賠才付得出來",
      basic: ["買醫療險和意外險", "基本保障就好", "{lead}。你只挑了{medical}和意外險，{每個月的保費不多，|保單上「意外住院」那一欄你看了兩次，}{心裡踏實了一點。|就當以防萬一。}"],
      full: ["一次買齊", fullHint, "{lead}。你找了{friend}的業務員，把{full}都買齊了，{保單厚得像一本書。|每年的保費不便宜，但你覺得家人有了保障。}"],
      saving: ["買儲蓄險當存錢", "萬一有事，至少有一筆錢", "{lead}。你想了想，買了{一張六年期的儲蓄險，|一張儲蓄型的保單，}{說萬一有事，至少有一筆錢。|每年繳一筆，像是在幫未來的自己存錢。}"],
      ask: ["先看朋友的保單怎麼買", "比清楚再買", "{lead}。你去醫院看{friend}的時候，{借了對方的保單回家研究，|問清楚對方買的是哪幾種，}{最後只買了真正需要的。|刪掉了一半用不到的附約。}"],
      no: ["不買，自己存錢", "存款就是保險", "{lead}。你覺得保費不如自己存，{每個月固定存一筆當緊急預備金，|把保險的錢拿去定存，}{就當自己替自己保險。|{friend}出院那天，你去接對方回家。}"],
    },
    pw && {
      key: "elders", w: infant ? 3 : 1, lead: infant ? (kid.age === 0 ? "{kn}才剛滿月，{pw}一直提醒你要買保險，還把熟識的業務員電話抄給你" : "{kn}剛滿一歲，{pw}一直提醒你要買保險，還把熟識的業務員電話抄給你") : "你成家以後，{pw}一直提醒你要買保險，還把熟識的業務員電話抄給你",
      basic: [infant ? "先買醫療險和意外險" : "只買醫療險和意外險", infant ? "孩子和自己都有基本保障" : "基本保障就好", "{lead}。你打給那位業務員，只挑了{medical}和意外險，{每個月的保費不多，|{pw}說這樣也好，}{心裡踏實了一點。|就當以防萬一。}"],
      full: ["全家一次買齊", fullHint, "{lead}。你{一口氣|聽完說明就}把全家的{full}都買齊了，{{pw}聽了很放心。|每年的保費不便宜，但你覺得家人有了保障。}"],
      saving: infant ? ["買儲蓄險，幫孩子存錢", "強迫自己存錢", "{lead}。你買了{一張六年期的儲蓄險，|一張儲蓄型的保單，}{說是要幫{kn}存一筆長大以後的錢。|每年繳一筆，像是在幫{kn}存錢。}"] : saving,
      ask,
      no: ["先不買，自己存錢", "保費拿去存", "{lead}。你跟{pw}說會再考慮，{把保費的錢拿去存，|每個月固定存一筆緊急預備金，}{{pw}念了你好幾次。|那張抄著電話的紙條，一直貼在冰箱上。}"],
    },
    s.year >= 2000 && {
      key: "bank", lead: "去銀行{存錢|辦事}時，理專把你請進小房間，推薦一張{利率比定存高的儲蓄險|六年期的儲蓄險}",
      basic: ["改問醫療險和意外險", "保障比儲蓄重要", "{lead}。你說自己比較需要保障，請理專改介紹{medical}和意外險，{每個月的保費不多，|理專有點失望，還是幫你辦好了，}{心裡踏實了一點。|就當以防萬一。}"],
      full: ["保障型的一次買齊", fullHint, "{lead}。你請理專把{full}都規劃進去，{一口氣全部簽了。|每年的保費不便宜，但你覺得家人有了保障。}"],
      saving: ["照理專說的買儲蓄險", "強迫自己存錢", "{lead}。你照理專說的買了{一張六年期的儲蓄險，|一張儲蓄型的保單，}{當作強迫自己存錢。|每年繳一筆，像是在幫未來的自己存錢。}"],
      ask: ["拿回家比一比", "比清楚再買", "{lead}。你沒有當場簽，{把建議書帶回家，上網比較了好幾家，|請懂保險的朋友幫你看，}{最後只買了一張真正需要的醫療險。|才發現儲蓄險的利率沒有說得那麼好，最後只買了一張醫療險。}"],
      no: ["不買，錢放定存", "保費拿去存", "{lead}。你說要再想想，{把錢放回定存，|拿著一疊傳單走出銀行，}{理專說隨時歡迎再來。|你覺得錢放在自己看得到的地方比較安心。}"],
    },
    mortgage && {
      key: "mortgage", w: 2, lead: "每個月繳房貸的時候，你常想到萬一自己出了什麼意外，{fam}要怎麼繳下去",
      basic: ["只買醫療險和意外險", "基本保障就好", "{lead}。你只挑了{medical}和意外險，{每個月的保費不多，|保費比你想的便宜，}{心裡踏實了一點。|就當以防萬一。}"],
      full: ["連房貸壽險一起買齊", "房貸、壽險、醫療都顧到", "{lead}。你找了業務員，除了房貸壽險，{alsoCare}也一起買齊了，{每年的保費不便宜，但你覺得家人有了保障。|保單和房屋權狀收在同一個抽屜裡。}"],
      saving, ask,
      no: ["不買，專心還房貸", "保費拿去還房貸", "{lead}。你算了算，{決定把保費的錢存起來，準備提前還房貸，|覺得早點把房貸還完最實在，}{每個月多存一點，心裡比較踏實。|你把這個念頭收了起來。}"],
    },
    s.year >= 2000 && corp(s) && !["公部門", "教育"].includes(s.job.field) && {
      key: "group", lead: s.job.field === "醫療" ? "醫院的團保說明會上，人資提醒大家：團保只保在職的時候，離職或退休就沒了" : "公司的團保說明會上，人資提醒大家：團保只保在職的時候，離職或退休就沒了",
      basic: ["自己加買醫療險和意外險", "補上團保的缺口", "{lead}。你自己加買了{medical}和意外險，{每個月的保費不多，|就算換工作也不怕斷掉，}{心裡踏實了一點。|就當以防萬一。}"],
      full: ["一次買齊", fullHint, "{lead}。你找了業務員，把{full}都買齊了，{每年的保費不便宜，但你覺得家人有了保障。|你把保單收進抽屜最裡面。}"],
      saving, ask,
      no: ["有團保就夠了", "保費拿去存", "{lead}。你覺得公司的團保就夠了，{把保費的錢存了起來，|說等換工作再說，}{那份說明會的講義被你拿去墊便當。|人資的提醒，你聽聽就算了。}"],
    },
    s.year >= 2015 && {
      key: "online", lead: "手機跳出網路投保的廣告，意外險和醫療險在網路上按幾下就能買，保費還比較便宜",
      basic: ["上網買醫療險和意外險", "便宜，基本保障就好", "{lead}。你在網路上比了幾家，買了{medical}和意外險，{十分鐘就投保完成，|保費比你想的便宜，}{心裡踏實了一點。|就當以防萬一。}"],
      full: ["找業務員一次買齊", fullHint, "{lead}。你覺得網路上的不夠，找了業務員把{full}都買齊了，{業務員來家裡講了一整個晚上。|每年的保費不便宜，但你覺得家人有了保障。}"],
      saving, ask,
      no: ["不買，自己存錢", "保費拿去存", "{lead}。你把廣告滑掉了，{決定把保費的錢存起來，|說自己身體還很好，}{每個月固定轉一筆到另一個帳戶。|手機之後還是一直跳出保險廣告。}"],
    },
  ];
  return scenes.map(x => x && { ...x, v });
}

// a_relativeLoan: why the relative needs the money this time, and how they ask. `who` is the relative (哥哥志明,
// 表哥…), `ta` 他／她; an older relative (姑丈, 舅舅…) only asks while you are under 46, and a wedding is a cousin's.
// Each lead ends with how they ask ({開口|…}跟你借{amount}), which has one more way from 2011 (LINE).
function loanScenes(s, ctx, { who, ta, elder, younger }) {
  const line = s.year >= 2011, ask = (before, after) => (line ? after : before);
  const v = {
    who, ta, amount: s.year < 1995 ? "十幾萬" : s.year < 2015 ? "三十萬" : "五十萬",
    shop: ctx.rng.pick(s.year < 1995 ? ["五金行", "小吃店", "家庭工廠", "布莊"] : s.year < 2010 ? ["五金行", "小吃店", "機車行", "水電行"] : ["小吃店", "機車行", "水電行", "網路商店"]),
    open: ctx.rng.pick(s.year < 1995 ? ["早餐店", "麵攤", "自助餐店", "冰果室"] : s.year < 2010 ? ["早餐店", "便當店", "飲料店", "小吃攤"] : ["早午餐店", "便當店", "飲料店", "咖啡店"]),
    abroad: ctx.rng.pick(s.year < 2000 ? ["美國", "日本", "加拿大"] : ["美國", "英國", "澳洲", "日本", "德國"]),
    laidOff: s.year >= 2008 && s.year <= 2009 ? "的公司遇上金融海嘯，放了好幾個月的無薪假" : s.year >= 1990 && s.year < 2005 ? "上班的工廠搬到大陸，失業了半年" : "的公司收掉了，找了半年還沒找到工作",
    costA: ta === "她" ? "喜宴和婚紗" : "聘金和喜宴", costB: ta === "她" ? "喜宴和新房家具" : "喜宴和婚紗",
    firstHome: s.year >= 2010 ? "查到一個青年首購的優惠貸款，" : "把每一家的利率比了一遍，",
  };
  const part = ["借一部分，寫借據", "說好什麼時候還", "{lead}。你借了一部分，{兩個人寫了一張借據，|說好每個月還一點，}{{who}有點尷尬，但也覺得這樣比較好。|親兄弟明算帳，你心裡比較踏實。}"];
  const gift = ["包一筆不用還的", "錢不多，但不傷感情", "{lead}。你沒有借那麼多，{包了一個紅包說不用還，|塞了一筆錢給{who}，說是一點心意，}{{who}收下時眼眶紅了。|你知道錢回不來，但感情還在。}"];
  const busy = "{lead}。你說家裡最近也要用錢，婉拒了。{過年見面時，大家還是笑著打招呼，只是聊得少了。|後來聽說{who}跟別人借到了。}";
  const scenes = [
    {
      key: "business", lead: ask("{who}的{shop}{月底要付貨款|下個月要發薪水}，週轉不過來，{開口|打電話來|特地上門|過年見面時開口}跟你借{amount}", "{who}的{shop}{月底要付貨款|下個月要發薪水}，週轉不過來，{開口|打電話來|特地上門|過年見面時開口|傳了一長串 LINE 訊息}跟你借{amount}"),
      all: [ctx.f("全部借{ta}週轉", { ta }), "月底的錢不能拖", "{lead}。你{二話不說|想了一個晚上，還是}把錢借給了{who}。{{who}說月底收到貨款就還。|你們沒有寫借據，覺得自己人不用。}"],
      part, gift,
      help: [ctx.f("不借錢，陪{ta}去談貸款", { ta }), s.year < 1990 ? "農會的利息比較低" : "銀行的利息比較低", s.year < 1990 ? "{lead}。你沒有借錢，而是陪{who}去農會問週轉金貸款，{幫忙把這幾個月的帳整理成一張表，|在行員面前幫{ta}把話說清楚，}{{who}說這樣也好。|事情慢慢有了眉目。}" : "{lead}。你沒有借錢，而是陪{who}去銀行問週轉金貸款，{幫忙把這幾個月的帳整理成一張表，|在行員面前幫{ta}把話說清楚，}{{who}說這樣也好。|事情慢慢有了眉目。}"],
      no: ["婉拒", "生意的事你幫不上", "{lead}。你說生意的事你幫不上，家裡最近也要用錢，婉拒了。{過年見面時，大家還是笑著打招呼，只是聊得少了。|後來聽說{who}跟別人借到了。}"],
    },
    {
      key: "shop", lead: ask("{who}想開一間{open}，{頂讓金|裝潢和設備}還差一筆錢，{開口|打電話來|特地上門|過年見面時開口}跟你借{amount}", "{who}想開一間{open}，{頂讓金|裝潢和設備}還差一筆錢，{開口|打電話來|特地上門|過年見面時開口|傳了一長串 LINE 訊息}跟你借{amount}"),
      all: [ctx.f("全部借{ta}開店", { ta }), "自己人，能幫就幫", "{lead}。你{二話不說|想了一個晚上，還是}把錢借出去了。{{who}說開幕那天第一個請你去吃。|你們沒有寫借據，覺得自己人不用。}"],
      part: ["借一部分，寫借據", "賺了錢再分期還", "{lead}。你借了一部分，{兩個人寫了一張借據，|說好店開了以後每個月還一點，}{{who}有點尷尬，但也覺得這樣比較好。|親兄弟明算帳，你心裡比較踏實。}"],
      gift: ["包一個開店紅包", "不用還，當作祝賀", "{lead}。你沒有借那麼多，{包了一個開店的紅包說不用還，|說這筆錢是祝{ta}開市大吉，}{{who}收下時眼眶紅了。|你知道錢回不來，但感情還在。}"],
      help: ["不借錢，幫忙算帳", "先看划不划得來", "{lead}。你沒有借錢，而是陪{who}把房租、人事和材料的帳{算了一整個晚上，|一條一條列出來，}{{who}決定先去別人的店裡做半年再說。|事情慢慢有了眉目。}"],
      no: ["婉拒", "開店的風險太大", "{lead}。你說開店的風險太大，自己家裡也要用錢，婉拒了。{過年見面時，大家還是笑著打招呼，只是聊得少了。|後來聽說{who}跟別人借到了。}"],
    },
    !elder && s.age >= 42 && {
      key: "study", lead: ask("{who}的孩子申請上{abroad}的研究所，學費和生活費還差一筆，{開口|打電話來|特地上門|過年見面時開口}跟你借{amount}", "{who}的孩子申請上{abroad}的研究所，學費和生活費還差一筆，{開口|打電話來|特地上門|過年見面時開口|傳了一長串 LINE 訊息}跟你借{amount}"),
      all: ["全部借給孩子讀書", "讀書的錢不能省", "{lead}。你{二話不說|想了一個晚上，還是}把錢借出去了。{{who}說孩子畢業工作以後一定還。|你們沒有寫借據，覺得自己人不用。}"],
      part,
      gift: ["包一筆給孩子當學費", "不用還，當作鼓勵", "{lead}。你沒有借那麼多，{包了一個紅包給孩子，說是買機票的錢，|塞了一筆錢給{who}，說是給孩子的一點心意，}{{who}收下時眼眶紅了。|孩子出國前，特地來跟你道謝。}"],
      help: ["不借錢，幫忙找獎學金", "問問學校和銀行的管道", "{lead}。你沒有借錢，而是{幫忙查了留學貸款的資料，|陪{who}一起找了幾個獎學金，}{{who}說這樣也好。|孩子後來申請到一筆獎學金。}"],
      no: ["婉拒", s.kids.length ? "家裡的孩子也要讀書" : "家裡也要用錢", s.kids.length ? "{lead}。你說家裡的孩子也要讀書，婉拒了。{過年見面時，大家還是笑著打招呼，只是聊得少了。|後來聽說{who}跟別人借到了。}" : busy],
    },
    !elder && {
      key: "house", lead: ask("{who}看好一間房子，{下訂前一天|簽約前一個星期}才發現頭期款還差一點，{開口|打電話來|特地上門|過年見面時開口}跟你借{amount}", "{who}看好一間房子，{下訂前一天|簽約前一個星期}才發現頭期款還差一點，{開口|打電話來|特地上門|過年見面時開口|傳了一長串 LINE 訊息}跟你借{amount}"),
      all: [ctx.f("全部借{ta}湊頭期款", { ta }), "成家立業是大事", "{lead}。你{二話不說|想了一個晚上，還是}把錢借出去了。{{who}說交屋那天要請你去看新家。|你們沒有寫借據，覺得自己人不用。}"],
      part: ["借一部分，寫借據", "說好每個月還一點", part[2]],
      gift: ["包一個入厝紅包", "不用還，當作賀禮", "{lead}。你沒有借那麼多，{提早包了一個入厝的紅包，|說這筆錢是給新家買家具的，}{{who}收下時眼眶紅了。|你知道錢回不來，但感情還在。}"],
      help: ["不借錢，幫忙問房貸", "也許能多貸一點", "{lead}。你沒有借錢，而是陪{who}跑了{兩|三}家銀行，{問到一個成數比較高的房貸，|{firstHome}}{{who}說這樣也好。|事情慢慢有了眉目。}"],
      no: ["婉拒", "買房要量力而為", "{lead}。你說買房要量力而為，自己家裡也要用錢，婉拒了。{後來{who}換看了一間小一點的。|後來聽說{who}跟別人借到了。}"],
    },
    younger && s.age <= 45 && {
      key: "wedding", lead: ask("{who}下個月要結婚，{{costA}|{costB}}的錢還差一點，{開口|打電話來|特地上門|過年見面時開口}跟你借{amount}", "{who}下個月要結婚，{{costA}|{costB}}的錢還差一點，{開口|打電話來|特地上門|過年見面時開口|傳了一長串 LINE 訊息}跟你借{amount}"),
      all: [ctx.f("全部借{ta}辦婚事", { ta }), "人生大事，能幫就幫", "{lead}。你{二話不說|想了一個晚上，還是}把錢借出去了。{{who}說收了禮金就還你。|你們沒有寫借據，覺得自己人不用。}"],
      part: ["借一部分，寫借據", "收了禮金再還", "{lead}。你借了一部分，{兩個人寫了一張借據，|說好收了禮金先還一半，}{{who}有點尷尬，但也覺得這樣比較好。|親兄弟明算帳，你心裡比較踏實。}"],
      gift: ["包一個大紅包", "不用還，當作禮金", "{lead}。你沒有借那麼多，{在喜宴上包了一個大紅包，|把禮金包得特別厚，}{{who}敬酒時特地多敬了你一杯。|你知道錢回不來，但感情還在。}"],
      help: ["不借錢，幫忙省預算", "喜宴不一定要辦那麼大", "{lead}。你沒有借錢，而是幫{who}{把喜宴的桌數重新算了一遍，|介紹了一家價錢實在的婚紗店，}{{who}說這樣也好。|預算一下子省了一截。}"],
      no: ["婉拒", "結婚的錢該自己存", "{lead}。你說結婚的錢還是自己存比較好，婉拒了。{喜宴那天，大家還是笑著打招呼，只是聊得少了。|後來聽說{who}跟別人借到了。}"],
    },
    {
      key: "jobless", lead: ask("{who}{laidOff}，{開口|打電話來|特地上門|過年見面時開口}跟你借{amount}", "{who}{laidOff}，{開口|打電話來|特地上門|過年見面時開口|傳了一長串 LINE 訊息}跟你借{amount}"),
      all: [ctx.f("全部借{ta}撐過去", { ta }), "先把日子顧好", "{lead}。你{二話不說|想了一個晚上，還是}把錢借出去了。{{who}說找到工作就還。|你們沒有寫借據，覺得自己人不用。}"],
      part: ["先借幾個月的生活費", "寫借據，找到工作再還", "{lead}。你先借了幾個月的生活費，{兩個人寫了一張借據，|說好找到工作以後每個月還一點，}{{who}有點尷尬，但也覺得這樣比較好。|親兄弟明算帳，你心裡比較踏實。}"],
      gift: ["包一筆不用還的", "雪中送炭", "{lead}。你沒有借那麼多，{包了一個紅包說不用還，|塞了一筆錢給{who}，說先拿去買菜，}{{who}收下時眼眶紅了。|你知道錢回不來，但感情還在。}"],
      help: ["不借錢，幫忙找工作", "問問認識的老闆", "{lead}。你沒有借錢，而是{幫{who}問了幾個認識的老闆，|幫{who}把履歷改了一遍，|陪{who}去就業服務站登記，}{{who}說這樣也好。|一個月後，{who}有了面試的機會。}"],
      no: ["婉拒", "家裡也要用錢", busy],
    },
    // 標會倒會多在 1990 年代以前；卡債風暴在 2005–2006 年，銀行公會的債務協商從 2006 年起。
    (s.year < 1995 || (s.year >= 2006 && s.year <= 2010)) && {
      key: "debt",
      lead: s.year < 1995
        ? ask("{who}跟的會被倒了，繳出去的會錢一毛都拿不回來，{開口|打電話來|特地上門|過年見面時開口}跟你借{amount}", "{who}跟的會被倒了，繳出去的會錢一毛都拿不回來，{開口|打電話來|特地上門|過年見面時開口|傳了一長串 LINE 訊息}跟你借{amount}")
        : ask("{who}的信用卡和現金卡{越欠越多|只繳得出最低應繳}，催收的電話天天打來，{開口|打電話來|特地上門|過年見面時開口}跟你借{amount}", "{who}的信用卡和現金卡{越欠越多|只繳得出最低應繳}，催收的電話天天打來，{開口|打電話來|特地上門|過年見面時開口|傳了一長串 LINE 訊息}跟你借{amount}"),
      all: s.year < 1995
        ? [ctx.f("全部借{ta}應急", { ta }), "先把日子顧好", "{lead}。你{二話不說|想了一個晚上，還是}把錢借給了{who}。{{who}說一定會慢慢還。|你們沒有寫借據，覺得自己人不用。}"]
        : [ctx.f("幫{ta}一次還清", { ta }), "先把利息止住", "{lead}。你{二話不說|想了一個晚上，還是}拿錢幫{who}把卡債還清了。{{who}說一定會慢慢還你。|你們沒有寫借據，覺得自己人不用。}"],
      part, gift,
      help: s.year < 1995
        ? ["不借錢，幫忙討會錢", "和其他會腳一起想辦法", "{lead}。你沒有借錢，而是陪{who}去找其他會腳，{一起去會頭家裡談，|把每個人繳了多少一筆一筆列清楚，}{{who}說這樣也好。|事情慢慢有了眉目。}"]
        : [ctx.f("不借錢，陪{ta}去談協商", { ta }), "銀行有債務協商", "{lead}。你沒有借錢，而是陪{who}去銀行談債務協商，{把每一張卡欠多少列成一張表，|幫{ta}把還款的計畫寫清楚，}{{who}說這樣也好。|利息總算降了下來。}"],
      no: ["婉拒", "這個洞你補不起", "{lead}。你說這個洞自己補不起，婉拒了。{過年見面時，大家還是笑著打招呼，只是聊得少了。|後來聽說{who}跟別人借到了。}"],
    },
  ];
  return scenes.map(x => x && { ...x, v });
}


export const ADULT = [
  // ---------- married life ----------
  {
    // 婆媳、岳家：結了婚，多了一整個家要相處。
    id: "a_inlaws", domain: "family", channel: "bad", tags: ["spouse"], ages: [27, 55], cooldown: 6, max: 2,
    when: s => married(s) && !s.abroad && !sameSexCouple(s),
    p: () => 0.04,
    choice: (s, ctx) => {
      const p = s.partner.call, ta = pronoun(s.partner), kids = s.kids.length > 0;
      // A wife with her mother-in-law; a husband between his mother and his wife, or with his wife's family.
      const kind = s.sex === "female" ? "婆家" : s.mother.alive && ctx.rng() < 0.6 ? "婆媳" : "岳家";
      const who = { 婆家: "婆婆", 婆媳: "媽媽", 岳家: "岳母" }[kind];
      const lead = ctx.rng.pick({
        婆家: ["婆婆要你們每個週末都回去吃飯，一待就是一整天", "婆婆常常沒說一聲就來你們家，還順手把冰箱整理了一遍", kids ? "婆婆對你帶孩子的方式意見很多，連奶粉要泡幾匙都要管" : "婆婆每次見面都問你們什麼時候要生", "婆婆規定過年要在婆家待到初三，才能回娘家"],
        婆媳: [ctx.f("媽媽和{p}為了{about}起了口角，兩個人都來跟你抱怨", { p, about: kids ? "孩子穿多穿少" : "晚餐要煮什麼" }), ctx.f("媽媽常常在你面前念{p}{fault}", { p, fault: ctx.rng.pick(["太會花錢", "不會煮飯", "工作太忙、不顧家"]) }), ctx.f("媽媽和{p}為了過年要先回哪一邊僵持不下", { p })],
        岳家: ["岳母希望你們搬到離娘家近一點的地方", "岳母常常拿你和別人家的女婿比較", ctx.f("岳母每個週末都要{p}回娘家幫忙，你覺得自己像外人", { p })],
      }[kind]);
      const v = { lead, p, ta, who, guests: kind === "婆媳" ? ctx.f("媽媽和{p}", { p }) : who, whose: kids ? "孩子的事" : "小家庭的事" };
      const partnerText = {
        婆家: "{lead}。你先找{p}商量，{{p}答應由{ta}去跟婆婆說。|{p}說：「我媽那邊我來講。」}{之後婆婆的話少了一些。|事情沒有馬上變好，但你知道自己不是一個人。}",
        婆媳: "{lead}。你先聽{p}把委屈說完，{再回家跟媽媽說：「{ta}是我太太，也是妳的家人。」|和{p}說好，媽媽那邊由你去溝通。}{家裡的氣氛慢慢緩和下來。|{p}知道你站在{ta}這邊。}",
        岳家: "{lead}。你先找{p}商量，{{p}答應回娘家時幫你說幾句話。|{p}說：「我媽就是嘴巴念，不是針對你。」}{你心裡舒服多了。|下次回娘家，岳母多夾了一塊肉給你。}",
      }[kind];
      const directOk = {
        婆家: "{lead}。你找了一個下午陪婆婆{去市場買菜|去看醫生}，在車上把話說開，{婆婆說：「我也是第一次當婆婆。」|才知道婆婆只是怕你們太累。}",
        婆媳: "{lead}。你單獨帶媽媽去吃飯，聽她把不滿說完，{媽媽最後說：「我只是捨不得你。」|媽媽嘆了一口氣，說以後會少講一點。}",
        岳家: "{lead}。你自己找岳母聊，{才知道她只是捨不得女兒。|岳母笑著說你比她想的還貼心。}",
      }[kind];
      const directBad = "{lead}。你鼓起勇氣找{who}聊，{話說到一半就僵住了，|{who}只回了一句「我是為你們好」，}{之後見面，大家都有點客氣。|你決定先緩一緩。}";
      const rules = kind === "婆媳"
        ? "{lead}。你和媽媽、{p}一起把規矩講好：{媽媽要來之前先打個電話，|{whose}由你們自己決定，}{過年初二一定陪{p}回娘家。|大家有了默契，摩擦少了很多。}"
        : "{lead}。你和{p}把規矩講好：{一個月回去兩次，|隔週回去一次，}{過年初二一定回娘家。|假日留一天給自己的小家庭。}{一開始{who}有點不習慣，後來也就接受了。|大家有了預期，摩擦少了很多。}";
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "a_inlaws.partner", label: ctx.f("先和{p}商量", { p }), hint: kind === "婆媳" ? ctx.f("先聽{p}怎麼說", { p }) : ctx.f("讓{ta}去跟自己的家人說", { ta }), act: "talk", style: "social", weight: 0.3, apply: (s2, c) => { guardUp(s2, 2); return { text: c.w(partnerText, v), mood: 1 }; } },
          { id: "a_inlaws.direct", label: ctx.f("自己找{who}聊聊", { who }), hint: "當面把話說開", act: "talk", style: "family", weight: 0.2, apply: (s2, c) => (c.roll("family", "good", 0.5) ? { text: c.w(directOk, v), mood: 2 } : { text: c.w(directBad, v), mood: -1 }) },
          { id: "a_inlaws.rules", label: "把規矩講好", hint: "多久回去、誰管什麼，先說清楚", act: "negotiate", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w(rules, v), mood: 1 }) },
          { id: "a_inlaws.endure", label: "先忍下來", hint: "家和萬事興", act: "pushThrough", style: "safe", weight: 0.2, apply: (s2, c) => { stress(s2, 0.05); return { text: c.w("{lead}。你把話吞了回去，{告訴自己家和萬事興。|只在洗碗的時候多嘆了幾口氣。}{日子照樣過，只是你越來越少笑。|有幾個晚上，你一個人在陽台站了很久。}", v), mood: -3 }; } },
          { id: "a_inlaws.meal", label: ctx.f("請{who}吃頓飯", { who }), hint: "用行動拉近距離", act: "reconcile", style: "family", weight: 0.1, apply: (s2, c) => { spend(s2, 0.02); return { text: c.w("{lead}。你訂了{一間台菜餐廳|港式飲茶|{who}愛吃的海產店}，請{guests}一起吃飯，{席間{who}難得笑得很開心。|{who}嘴上說浪費錢，卻把每道菜都吃完了。}", v), mood: 2 }; } },
        ],
      };
    },
  },
  {
    // 家事分工：誰洗碗、誰倒垃圾，吵的往往不是家事本身。這一次吵的是哪一件，見 choresScenes。
    id: "a_chores", domain: "love", channel: "bad", tags: ["spouse"], ages: [27, 55], cooldown: 6, max: 2,
    when: s => married(s), p: () => 0.035,
    choice: (s, ctx) => {
      const sc = pickScene(s, ctx, "a_chores", choresScenes(s, ctx, s.partner.call, pronoun(s.partner))), lead = ctx.w(sc.lead, sc.v);
      const { list, talk, buy, more, strike } = sc, v = { ...sc.v, lead };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "a_chores.list", label: list[0], hint: list[1], act: "negotiate", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w(list[2], v), mood: 1 }) },
          { id: "a_chores.talk", label: talk[0], hint: talk[1], act: "talk", style: "social", weight: 0.25, apply: (s2, c) => { guardUp(s2, 2); return { text: c.w(talk[2], v), mood: 2 }; } },
          { id: "a_chores.buy", label: buy[0], hint: buy[1], act: "hireCare", style: "self", weight: 0.2, apply: (s2, c) => { spend(s2, 0.04); return { text: c.w(buy[2], v), mood: 2 }; } },
          { id: "a_chores.more", label: more[0], hint: more[1], act: "reconcile", style: "family", weight: 0.15, apply: (s2, c) => { stress(s2, 0.03); return { text: c.w(more[2], v), mood: -2 }; } },
          { id: "a_chores.strike", label: strike[0], hint: strike[1], act: "avoid", style: "self", weight: 0.1, apply: (s2, c) => { crisisUp(s2, 2); return { text: c.w(strike[2], v), mood: -3 }; } },
        ],
      };
    },
  },
  {
    // 結婚紀念日：每五年一次的整數年。
    id: "a_anniversary", domain: "love", channel: "good", tags: ["spouse"], ages: [25, 62],
    when: s => married(s) && [5, 10, 15, 20, 25].includes(yearsMarried(s)), p: () => 0.4,
    apply: (s, ctx) => {
      const n = yearsMarried(s), p = s.partner.call, wedYear = s.year - n;
      const video = wedYear < 1998 ? "婚禮的錄影帶" : wedYear < 2010 ? "婚禮光碟" : "婚禮影片";
      const photo = s.year < 2000 ? "去照相館拍了一張合照" : "重拍了一組婚紗照";
      const t = [
        "結婚 {n} 週年，你們{回到當年拍婚紗的地方，|去吃了第一次約會的那家餐廳，|把{video}翻出來看，}{p}笑你當年{好緊張。|頭髮好多。|敬酒敬到臉都紅了。}",
        "結婚 {n} 週年那天，{p}{送你一束花，|下廚煮了一桌菜，|寫了一張卡片，}{你才發現自己忘了，趕快衝去買蛋糕。|你也準備了禮物，兩個人笑成一團。|兩個人窩在沙發上，聊起剛認識的時候。}",
        s.kids.length ? "結婚 {n} 週年，你和{p}{photo}，{{kids}在旁邊扮鬼臉。|照片裡兩個人都笑得很開，後來一直掛在客廳。}" : "結婚 {n} 週年，你和{p}{photo}，{攝影師說你們很有默契。|照片裡兩個人都笑得很開，後來一直掛在客廳。}",
      ];
      if (n === 25) t.push(s.kids.length ? "結婚二十五週年，銀婚。{kids}幫你們訂了一桌，{p}在大家面前說：「謝謝你這些年。」{你一下子說不出話。|你偷偷擦了一下眼角。}" : "結婚二十五週年，銀婚。你和{p}{去{trip}走了一趟，|回到當年蜜月的地方，}{在同一個位置又拍了一張照片。|兩個人都說，時間怎麼過得這麼快。}");
      return { text: wordsAs(s, ctx, t, { p, video, photo }, { n }), mood: 4 };
    },
  },
  {
    // 外遇的誘惑。不寫細節；「越線」的影響和 act.js 的 affair 一樣。
    id: "a_temptation", domain: "love", channel: "bad", tags: ["spouse"], ages: [30, 55], max: 1,
    when: s => married(s) && yearsMarried(s) >= 3, p: () => 0.025,
    choice: (s, ctx) => {
      const p = s.partner.call, phone = s.year >= 2000;
      const where = ctx.rng.pick([...(s.employed ? ["同事", "客戶"] : []), "健身房", "同學", ...(s.year >= 2012 ? ["社群"] : [])]);
      const who = { 同事: "一起加班的同事", 客戶: "常聯絡的客戶", 健身房: "健身房認識的朋友", 同學: "同學會重逢的老同學", 社群: "在社群上重新聯絡上的舊識" }[where];
      const lead = ctx.f("{who}對你特別好，{how}，你察覺自己有點動心", { who, how: phone ? "常常傳訊息問你吃飯了沒" : "常常約你下班一起吃飯" });
      const away = { 同事: "申請調到另一個部門", 客戶: "把這個客戶交接給同事", 健身房: "換了一家健身房", 同學: "退出了同學的聊天群組", 社群: "把對方的動態設成不看" }[where];
      const awayHint = { 同事: "申請調部門", 客戶: "把客戶交接出去", 健身房: "換一家健身房", 同學: "退出同學的群組", 社群: "不再看對方的動態" }[where];
      const v = { lead, p, who, away, cool: phone ? "把訊息的回覆越拖越慢" : "婉拒了下班後的邀約" };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "a_temptation.distance", label: "保持距離", hint: "只談該談的事", act: "cutOff", style: "safe", weight: 0.45, apply: (s2, c) => ({ text: c.w("{lead}。你{cool}，{只談該談的事，|不再單獨見面，}{慢慢就淡了。|那陣子你特別早回家。|你沒有跟任何人說，心裡卻鬆了一口氣。}", v), mood: -1 }) },
          { id: "a_temptation.tell", label: ctx.f("坦白告訴{p}", { p }), hint: "說出來，它就不會長大", act: "talk", style: "family", weight: 0.15, apply: (s2, c) => { guardUp(s2, 2); return { text: c.w("{lead}。你回家跟{p}說了。{p}沉默了好一會兒，{說：「謝謝你跟我說。」|握了握你的手。}{那天晚上你們聊到很晚。|你們約好，每個月至少要有一次兩個人的約會。}", v), mood: 0 }; } },
          { id: "a_temptation.away", label: "換個環境避開", hint: awayHint, act: where === "同事" ? "negotiate" : "cutOff", style: "safe", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。你{away}，{從環境上把距離拉開。|眼不見，心也就靜了。}{過了幾個月，那份心動像沒發生過一樣。|你知道自己做了對的事。}", v), mood: 0 }) },
          { id: "a_temptation.home", label: "把心思放回家裡", hint: ctx.f("約{p}去約會", { p }), act: "pursue", style: "family", weight: 0.2, apply: (s2, c) => { guardUp(s2, 2); return { text: c.w(phone ? "{lead}。你沒有多說什麼，只是{訂了你們第一次約會的那家餐廳，|把週末都留給{p}{andKids}，|陪{p}去看了一場電影，}{那些訊息你沒有再回應。|心裡那點晃動，慢慢就停了。}" : "{lead}。你沒有多說什麼，只是{訂了你們第一次約會的那家餐廳，|把週末都留給{p}{andKids}，|陪{p}去看了一場電影，}{那些邀約你沒有再回應。|心裡那點晃動，慢慢就停了。}", { ...v, andKids: s2.kids.length ? "和孩子" : "" }), mood: 1 }; } },
          {
            id: "a_temptation.cross", label: "越線", hint: "走進不該開始的關係", act: "affair", style: "risk", weight: 0.05,
            apply: (s2, c) => {
              crisisUp(s2, 4); s2.flags.affair = s2.age;
              if (c.rng.chance(0.5)) { s2.guard = 0; return { text: c.w("和{who}越了線，{沒多久就被{p}發現了。|{found}|紙包不住火，{p}還是知道了。}家裡{吵翻了天。|安靜得可怕。}", { ...v, found: c.f(phone ? "{p}看到了手機裡的訊息。" : "{p}發現了你藏在抽屜裡的信。", { p }) }), mood: -6, big: true }; }
              return { text: c.w(phone ? "和{who}越了線，{開始了一段祕密的關係，|瞞著{p}和對方見面，}{每次手機一響，你就心跳加速。|回家看到{p}，心裡的愧疚越來越重。}" : "和{who}越了線，{開始了一段祕密的關係，|瞞著{p}和對方見面，}{每次電話一響，你就心跳加速。|回家看到{p}，心裡的愧疚越來越重。}", v), mood: -2 };
            },
          },
        ],
      };
    },
  },
  {
    // 中年危機：日子一成不變，突然想知道自己還要什麼。
    id: "a_midlife", domain: "career", channel: "change", ages: [38, 52], once: true, p: () => 0.04,
    choice: (s, ctx) => {
      const daily = s.employed ? ctx.rng.pick(["通勤、開會、加班", "打卡上班、打卡下班", "趕報表、趕進度"]) : s.kids.length ? ctx.rng.pick(["煮飯、打掃、接送孩子", "買菜、做家事、等孩子放學"]) : ctx.rng.pick(["買菜、煮飯、看電視", "打掃、散步、早早睡覺"]);
      const where = ctx.rng.pick(["看著鏡子裡冒出來的白頭髮", s.employed ? "塞在下班的車陣裡" : "等紅燈的時候", "一個人坐在深夜的客廳"]);
      const lead = ctx.f("{age} 歲的某個晚上，你{where}，突然覺得每天{daily}，日子像一直重播的連續劇", { age: s.age, where, daily });
      const sport = byEra(s, ["每天去公園慢跑", "每天去河濱慢跑", "騎單車、爬山", "報名路跑，練跑馬拉松", "報名路跑，練跑馬拉松"]);
      const sportMemory = byEra(s, ["開始每天慢跑", "開始每天慢跑", "開始騎單車、爬山", "開始練跑馬拉松", "開始練跑馬拉松"]);
      // How far you get: in the first two eras three months or six ({三個月後|半年後}), later half a year.
      const goal = byEra(s, ["五公里", "十公里", "半年後，你騎完了人生第一次環島", "半年後，你跑完了人生第一場半程馬拉松", "半年後，你跑完了人生第一場半程馬拉松"]), early = era(s) < 2;
      const school = byEra(s, ["夜間部", "空中大學", "在職專班", "在職專班", "在職專班"]);
      const craft = ctx.rng.pick(["爵士鼓", "衝浪", "陶藝", "攝影", "木工", "油畫"]);
      const p = married(s) ? s.partner.call : null;
      const switchOk = s.employed && s.job && !["家業", "公部門"].includes(s.job.field) && s.age <= 50;
      return {
        prompt: ctx.f("{lead}。接下來想怎麼過？", { lead }),
        options: [
          { id: "a_midlife.run", label: "開始運動", hint: asLabel(ctx, sport), act: "exercise", style: "health", weight: 0.25, apply: (s2, c) => { s2.health.fitness = Math.min(1, s2.health.fitness + 0.1); s2.health.hr = Math.max(0.8, s2.health.hr * 0.98); c.nudge("health", 0.03); c.remember("a_midlife", sportMemory, { mood: 2 }); return { text: c.w(early ? "{lead}。你決定{sport}，{每天早上五點半出門，|{when}換上球鞋就出門，}{三個月後|半年後}，你可以一口氣跑完{goal}。" : "{lead}。你決定{sport}，{每天早上五點半出門，|{when}換上球鞋就出門，}{goal}。", { lead, sport, goal, when: s2.employed ? "下班後" : "每天傍晚" }), mood: 3 }; } },
          { id: "a_midlife.study", label: "回學校讀書", hint: asLabel(ctx, school), act: "study", style: "learn", weight: 0.15, when: s2 => !s2.arcs.study, apply: (s2, c) => { spend(s2, 0.2); c.arc.start("study", { kind: school, from: s2.age }, 2); return { text: c.w("{lead}。你報名了{school}，{{evenings}背著書包走進教室，同學都和你差不多年紀。|第一堂課坐在第一排，抄了滿滿三頁筆記。|週末在圖書館讀到閉館，好像回到二十歲。}", { lead, school, evenings: s2.employed ? "下班後" : "每週三個晚上" }), mood: 2 }; } },
          { id: "a_midlife.hobby", label: ctx.f("學{craft}", { craft }), hint: "一直想學卻沒時間的事", act: "hobby", style: "learn", weight: 0.2, apply: (s2, c) => { spend(s2, 0.05); c.nudge("curiosity", 0.03); return { text: c.w("{lead}。你報名了{craft}課，{第一堂課就被老師稱讚有天分。|班上最年輕的同學才二十歲，你們變成了朋友。|每週最期待的就是那兩個小時。}", { lead, craft }), mood: 3 }; } },
          { id: "a_midlife.trip", label: "一個人去旅行", hint: "離開幾天，想清楚", act: "travel", style: "self", weight: 0.15, apply: (s2, c) => { spend(s2, 0.1); return { text: c.w("{lead}。你{week}，一個人去{trip}，{在陌生的街上走了一整天，|坐在海邊看了一下午的浪，}{回來時，覺得自己可以再出發了。|想通了一些事。}", { lead, week: s2.employed ? "請了一週假" : "給自己放了一週假" }), mood: 3 }; } },
          { id: "a_midlife.talk", label: p ? ctx.f("跟{p}聊聊", { p }) : "找老朋友聊聊", hint: "說出來就輕了一半", act: "talk", style: "social", weight: 0.2, apply: (s2, c) => { if (p) return { text: c.w("{lead}。那天晚上你跟{p}說了，{p}{沒有笑你，只說：「那我們一起想想看。」|說{pta}也有一樣的感覺。}{你們開始每個週末去一個沒去過的地方。|你才發現，原來不是只有你在撐。}", { lead, p, pta: pronoun(s2.partner) }), mood: 2 }; const { f } = friendOf(s2, c); return { text: c.w("{lead}。你約老朋友{fc}出來喝一杯，{兩個人聊到店家打烊。|{fc}說：「我們這個年紀，大家都一樣。」}{回家的路上，你覺得輕鬆多了。|你們約好每個月見一次面。}", { lead, fc: f.call }), mood: 2 }; } },
          {
            id: "a_midlife.switch", label: "轉換跑道", hint: "從頭開始，收入會先少一些", act: "careerSwitch", style: "risk", weight: 0.05, when: () => switchOk,
            apply: (s2, c) => {
              const before = s2.job.title, title = startJob(s2, c, otherJob(s2, c));
              s2.income *= 0.88; s2.career = Math.max(0, s2.career - 1); s2.flags.retrained = true;
              c.remember("a_midlife", c.f("轉行當{title}", { title }), { mood: 2 });
              return { text: c.w("{lead}。你決定轉行，從{before}變成{title}，{一切從新人做起，|收入先少了一截，}{但你每天早上都想去上班。|心裡反而踏實。}", { lead, before, title }), mood: 2 };
            },
          },
        ],
      };
    },
  },
  {
    // 夫妻一起的新嗜好。
    id: "a_hobbyTogether", domain: "love", channel: "good", tags: ["spouse"], ages: [30, 58], cooldown: 8, max: 2,
    when: s => married(s), p: () => 0.03,
    apply: (s, ctx) => {
      guardUp(s, 2);
      const h = ctx.rng.pick(byEra(s, [
        ["去社區的土風舞班", "參加救國團的登山隊", "去卡拉OK唱歌"],
        ["爬郊山", "打保齡球", "去 KTV 唱歌"],
        ["騎單車", "學國標舞", "爬山"],
        ["露營", "路跑", "騎單車環島"],
        ["露營", "爬百岳", "打匹克球", "學做麵包"],
      ]));
      return { text: wordsAs(s, ctx, ["{partner}拉你一起{h}，{一開始你只是陪著，後來比{ta}還投入。|兩個人好像又回到剛交往的時候。}", "你和{partner}迷上了{h}，{每個週末多了一個期待。|家裡多了一整櫃的裝備。|認識了一群年紀差不多的朋友。}", yearsMarried(s) >= 8 ? "結婚這麼多年，你和{partner}終於找到一件可以一起做的事：{h}。{你們約好每個月至少去一次。|回家的路上，兩個人有說不完的話。}" : "你和{partner}找到了一件可以一起做的事：{h}。{你們約好每個月至少去一次。|回家的路上，兩個人有說不完的話。}"], { h }), mood: 3 };
    },
  },
  {
    // 生活節奏不同（研究四）：家人資料裡的伴侶和你的日支相沖，兩個人的作息和步調對不上，要找到相處的方式。只在和這位
    // 伴侶交往（第二年起）或結婚時、而且兩人的日支相沖才會發生，不限 30–55 歲；沒有填伴侶的人生裡永遠不會出現（rare）。
    // 一年 8% 是假設的；影響和其他婚姻小事一樣小：好好談給 s.guard，不去管它給小幅的 s.crisis。合盤的說明一定是
    // 日支相沖那一條（bondNote，life.js）。
    id: "a_rhythm", domain: "love", channel: "bad", tags: ["spouse"], about: "partner", bondNote: "日支相沖", rare: true,
    ages: [18, 90], cooldown: 4, max: 3,
    when: (s, ctx) => (s.rel === "dating" || s.rel === "married") && s.age > s.datingSince && rhythmClash(s, ctx), p: () => 0.08,
    choice: (s, ctx) => {
      const ta = pronoun(s.partner), home = s.rel === "married" || s.flags.y_cohabit === s.partner.id;
      const night = ctx.f(ctx.rng.pick([s.year >= 2015 ? "追劇" : "看電視", s.year >= 2010 ? "滑手機" : "聽廣播", s.year >= 1995 ? "打電動" : "看小說"]));
      // A situation this life has not had yet, if there is one: ctx.w remembers the template, and the lead as it reads
      // with its values is what counts (wordsAs).
      const scenes = rhythmScenes(s, home, night), told = x => fill(x.lead, x.v), fresh = scenes.filter(x => !s.used.has(told(x)));
      const scene = ctx.rng.pick(fresh.length ? fresh : scenes), lead = ctx.w(scene.lead, scene.v);
      s.used.add(told(scene));
      const v = { ...scene.v, lead, call: s.year >= 2011 ? "每天睡前視訊十分鐘" : "每天睡前通一次電話" };
      return {
        prompt: ctx.w("{lead}。{兩個人的生活節奏很不一樣，|你們的步調總是對不上，}{最近常常為了小事鬧彆扭。|你開始覺得有點累。}要怎麼辦？", { lead }),
        options: [
          { id: "a_rhythm.talk", label: "好好談一次", hint: "說出彼此的習慣和需要", act: "talk", style: "social", weight: 0.3, apply: (s2, c) => { guardUp(s2, 2); return { text: c.w("{lead}。你們找了{一個週末的下午|一個安靜的晚上}坐下來好好談，{把彼此在意的事一件一件說出來，|你才知道{partner}也一直在遷就你，}{最後說好誰都不用完全改變自己。|兩個人都鬆了一口氣。}", v), mood: 2 }; } },
          { id: "a_rhythm.routine", label: "約好共同的時間", hint: "每天或每週留一段給兩個人", act: "negotiate", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w(home ? "{lead}。你們約好{每天一起吃晚餐|每個週六早上一起去市場|睡前留半個小時聊天|每個星期留一個晚上約會}，{其他時間各忙各的。|那段時間不做別的事，只陪對方。}{日子久了，那成了你們最期待的時候。|雖然偶爾會忘記，但兩個人多了一段固定相處的時間。}" : "{lead}。你們約好{每個星期固定見兩次面|{call}|每個週末留一天給彼此}，{其他時間各忙各的。|那段時間不做別的事，只陪對方。}{日子久了，那成了你們最期待的時候。|雖然偶爾會忘記，但兩個人多了一段固定相處的時間。}", v), mood: 2 }) },
          { id: "a_rhythm.space", label: "給彼此空間", hint: "各照自己的節奏，不勉強對方", act: "wait", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w(scene.space, v), mood: 1 }) },
          { id: "a_rhythm.adapt", label: ctx.f("配合{ta}的步調", { ta }), hint: "自己調整一點", act: "reconcile", style: "family", weight: 0.1, apply: (s2, c) => ({ text: c.w(scene.adapt, v), mood: -1 }) },
          { id: "a_rhythm.ignore", label: "不去管它", hint: "日子久了就習慣了", act: "avoid", style: "risk", weight: 0.15, apply: (s2, c) => { crisisUp(s2, 2); return { text: c.w(home ? "{lead}。你覺得沒什麼好談的，{日子照樣過，|誰也沒有開口，}{只是兩個人越來越像室友。|小小的不滿一點一點累積起來。}" : "{lead}。你覺得沒什麼好談的，{日子照樣過，|誰也沒有開口，}{只是見面的次數越來越少。|小小的不滿一點一點累積起來。}", v), mood: -3 }; } },
        ],
      };
    },
  },

  // ---------- children ----------
  {
    // 坐月子：孩子出生的那一年。
    id: "a_confinement", domain: "family", channel: "change", tags: ["children"], ages: [18, 55], max: 4,
    when: s => married(s) && s.kids.length > 0 && youngest(s).age === 0 && !s.abroad,
    p: s => (s.kids.length === 1 ? 0.7 : 0.45),
    choice: (s, ctx) => {
      const k = youngest(s), kn = k.call, p = s.partner.call, ta = pronoun(s.partner), me = s.sex === "female";
      const lead = me ? ctx.f("{kn}出生了，你要坐月子", { kn }) : ctx.f("{kn}出生了，{p}要坐月子", { kn, p });
      const v = { lead, kn, p, ta, grandpa: me && s.father.alive ? "爸爸每天站在嬰兒床邊傻笑。" : ctx.f("媽媽抱著{kn}就捨不得放下。", { kn }) };
      return {
        prompt: ctx.f("{lead}。要怎麼安排？", { lead }),
        options: [
          { id: "a_confinement.center", label: "住月子中心", hint: "專業照顧，費用不低", act: "hireCare", style: "safe", weight: s.year >= 2005 ? 0.35 : 0.15, when: s2 => s2.year >= 1995, apply: (s2, c) => { spend(s2, 0.25); return { text: me ? c.w("{lead}。你住進月子中心，{每天三餐有人送來麻油雞和月子餐，|護理師半夜幫忙照顧{kn}，}{這是生完以來第一次好好睡一覺。|你只要專心休息和餵奶。}", v) : c.w("{lead}。{p}住進月子中心，{你每天{visit}就去陪{ta}，|你週末都睡在月子中心的沙發上，}{跟護理師學會了幫{kn}洗澡。|第一次換尿布就被噴了一身。}", { ...v, visit: s2.employed ? "下班" : "一早" }), mood: 2 }; } },
          { id: "a_confinement.family", label: me ? "請婆婆來幫忙" : "請媽媽來幫忙", hint: "家裡的老方法", act: "seekHelp", style: "family", weight: 0.25, when: s2 => me || s2.mother.alive, apply: (s2, c) => { spend(s2, 0.03); const good = c.rng() < 0.6, helper = me ? "婆婆" : "你媽媽"; return { text: c.w(good ? "{lead}。{helper}搬來住了一個月，{每天燉麻油雞、煮生化湯，|規定不能洗頭、不能碰冷水，}{全家都跟著吃胖了一圈。|把大人小孩都照顧得無微不至。}" : "{lead}。{helper}搬來住了一個月，{每天燉麻油雞、煮生化湯，|規定不能洗頭、不能碰冷水，}{兩代人為了能不能吹冷氣爭了好幾次。|觀念不同，常常有點小摩擦。}", { ...v, helper }), mood: good ? 2 : 0 }; } },
          { id: "a_confinement.home", label: me ? "回娘家坐月子" : ctx.f("讓{p}回娘家坐月子", { p }), hint: "媽媽最懂女兒", act: "seekHelp", style: "family", weight: 0.15, when: s2 => !me || s2.mother.alive, apply: (s2, c) => { spend(s2, 0.02); return { text: me ? c.w("{lead}。你回娘家坐月子，{媽媽每天變著花樣煮月子餐，|媽媽半夜起來幫你顧{kn}，}{你好像又變回媽媽的女兒。|{grandpa}}", v) : c.w("{lead}。{p}回娘家坐月子，{你每天都繞過去看，|你週末都住在岳家，}{岳母把{p}和{kn}照顧得很好。|看著岳父抱著{kn}傻笑，你也跟著笑。}", v), mood: 2 }; } },
          { id: "a_confinement.auntie", label: "請月子阿姨到家裡", hint: "不用出門，有人照顧", act: "hireCare", style: "safe", weight: 0.1, apply: (s2, c) => { spend(s2, 0.15); return { text: c.w("{lead}。你們請了一位月子阿姨到家裡，{每天煮月子餐、教你們幫{kn}洗澡，|白天幫忙顧{kn}、晚上教你們怎麼拍嗝，}{一個月後，你們已經是熟練的新手爸媽。|阿姨離開那天，大家都有點捨不得。}", v), mood: 1 }; } },
          { id: "a_confinement.relatives", label: "請親戚輪流來幫", hint: "阿姨、嬸嬸都有經驗", act: "shareCare", style: "social", weight: 0.05, apply: (s2, c) => { spend(s2, 0.02); return { text: c.w(s2.year < 1990 ? "{lead}。{阿姨|嬸嬸|大姑}和{表姊|鄰居}輪流來幫忙，{每天提著一鍋麻油雞進門，|教你們怎麼幫{kn}洗澡、怎麼拍嗝，}{還幫忙洗了一個月的布尿布。|家裡每天都很熱鬧。}" : "{lead}。{阿姨|嬸嬸|大姑}和{表姊|鄰居}輪流來幫忙，{每天提著一鍋麻油雞進門，|教你們怎麼幫{kn}洗澡、怎麼拍嗝，}{家裡每天都很熱鬧。|你們學會了好多老人家的偏方。}", v), mood: 1 }; } },
          { id: "a_confinement.self", label: "自己來", hint: "累，但自在也省錢", act: "care", style: "self", weight: 0.1, apply: (s2, c) => { stress(s2, 0.05); return { text: me ? c.w("{lead}。你決定自己坐月子，{{meals}|{p}請了假在家幫忙，}{半夜餵奶餵到眼睛都睜不開。|累歸累，看著{kn}就覺得值得。}", { ...v, meals: s2.year >= 2000 ? "叫了外送的月子餐，" : "照著媽媽教的方法煮麻油雞，" }) : c.w("{lead}。你{leave}，自己照顧{p}和{kn}，{學會了煮麻油雞。|半夜起來泡奶，泡到手都熟了。|才知道照顧新生兒有多累。}", { ...v, leave: !s2.employed ? "整天在家" : s2.year >= 2002 ? "請了陪產假" : "請了幾天假" }), mood: -1 }; } },
        ],
      };
    },
  },
  {
    // 育嬰留職停薪：性別工作平等法 2002 年施行；就業保險的津貼 2009 年起（六成），2021 年起加上補助到八成，
    // 2022 年起父母可以同時請。
    id: "a_parentalLeave", domain: "career", channel: "change", tags: ["children"], ages: [20, 55], cooldown: 3, max: 2,
    when: s => s.year >= 2002 && married(s) && corp(s) && !s.abroad && s.kids.length > 0 && youngest(s).age <= 2 && !(youngest(s).age === 0 && s.last.a_confinement === s.age),
    p: () => 0.2,
    choice: (s, ctx) => {
      const k = youngest(s), kn = k.call, p = s.partner.call, ta = pronoun(s.partner), dad = s.sex === "male";
      const pay = s.year < 2009 ? "只是還沒有津貼，請了就沒有收入" : s.year < 2021 ? "就業保險會發六成薪的津貼" : "津貼加上政府的補助，大約有八成薪";
      const cost = s.year < 2009 ? 0.35 : s.year < 2021 ? 0.2 : 0.12;
      const lead = ctx.f("{kn}還不到三歲，你可以申請育嬰留職停薪，{pay}", { kn, pay });
      const v = { lead, kn, p, ta };
      return {
        prompt: ctx.f("{lead}。要請嗎？", { lead }),
        options: [
          { id: "a_parentalLeave.year", label: "請一整年", hint: ctx.f("陪{kn}走過最小的時候", { kn }), act: "care", style: "family", weight: dad ? 0.08 : 0.3, apply: (s2, c) => { spend(s2, cost); return { text: c.w(dad ? "{lead}。你請了一年育嬰留停，{主管愣了一下，還是簽了。|你是部門裡少數請育嬰假的爸爸，同事半開玩笑叫你奶爸。}{這一年，你看著{kn}第一次翻身、第一次叫人。|你每天推著嬰兒車去公園，認識了一群新手爸媽。}{回公司時，桌上的盆栽還活著。|回到公司，系統全換了，花了一個月才跟上。}" : "{lead}。你請了一年育嬰留停。{這一年，你看著{kn}第一次翻身、第一次叫人。|你每天推著嬰兒車去公園，認識了一群新手爸媽。}{回公司時，桌上的盆栽還活著。|回到公司，系統全換了，花了一個月才跟上。}", v), mood: 4 }; } },
          { id: "a_parentalLeave.half", label: "先請半年", hint: "孩子和工作都顧到", act: "care", style: "safe", weight: 0.2, apply: (s2, c) => { spend(s2, cost / 2); return { text: c.w("{lead}。你先請了半年，{剛好陪{kn}度過最難帶的那段時間。|半年後回去上班，{kn}已經會坐了。}{第一天回公司，你在茶水間看了好幾次手機裡的照片。|同事早就幫你把位子整理好了。}", v), mood: 3 }; } },
          { id: "a_parentalLeave.partner", label: ctx.f("讓{p}請", { p }), hint: "你繼續上班", act: "wait", style: "self", weight: dad ? 0.35 : 0.12, apply: (s2, c) => ({ text: c.w("{lead}。最後是{p}請了育嬰留停，你{下班就接手洗澡和哄睡，|一到家就換{ta}休息，}{週末換你帶，讓{p}出門喘口氣。|看著{p}的黑眼圈，你把家事都包了。}", v), mood: 1 }) },
          { id: "a_parentalLeave.both", label: "兩個人輪流請", hint: s.year >= 2022 ? "現在兩個人可以同時請" : "一人請一段時間", act: "shareCare", style: "family", weight: 0.1, apply: (s2, c) => { spend(s2, cost * 0.6); return { text: c.w(s2.year >= 2022 ? "{lead}。你和{p}{一起請了幾個月，|錯開時間各請了半年，}{{kn}的每個第一次，兩個人都在。|輪到你在家的那幾個月，你學會了單手泡奶。}" : "{lead}。你和{p}輪流各請了半年，{{kn}的每個第一次，兩個人都在。|輪到你在家的那幾個月，你學會了單手泡奶。}", v), mood: 3 }; } },
          { id: "a_parentalLeave.no", label: "不請", hint: "怕影響工作", act: "pushThrough", style: "safe", weight: 0.3, apply: (s2, c) => ({ text: c.w("{lead}。你想了想還是沒有請，{怕位子被別人坐走，|手上的專案走不開，}{每天下班衝回家抱{kn}。|錯過了{kn}第一次走路，是家人傳影片給你看的。}", v), mood: -1 }) },
        ],
      };
    },
  },
  {
    // 誰帶小孩：雙薪家庭最常見的難題。
    id: "a_whoCares", domain: "family", channel: "change", tags: ["children"], ages: [20, 55], cooldown: 2, max: 3,
    when: s => married(s) && s.employed && !s.abroad && s.kids.length > 0 && youngest(s).age >= 1 && youngest(s).age <= 2 && !youngest(s).a_care && s.last.a_parentalLeave !== s.age,
    p: () => 0.35,
    choice: (s, ctx) => {
      const k = youngest(s), kn = k.call, p = s.partner.call, me = s.sex === "female";
      k.a_care = true;   // asked once per child
      const grandma = s.mother.alive ? (me ? "娘家媽媽" : "媽媽") : me ? "婆婆" : "岳母";
      const lead = ctx.f(k.age === 1 ? "{kn}滿週歲了，你和{p}都要上班，白天要有人帶" : "{kn}兩歲了，你和{p}都要上班，白天要有人帶", { kn, p });
      const v = { lead, kn, p, grandma };
      return {
        prompt: ctx.f("{lead}。要交給誰？", { lead }),
        options: [
          { id: "a_whoCares.grandma", label: "交給阿嬤帶", hint: ctx.f("請{grandma}幫忙", { grandma }), act: "seekHelp", style: "family", weight: 0.35, apply: (s2, c) => { spend(s2, 0.05); return { text: c.w("{lead}。你們請{grandma}幫忙帶，{{kn}週一到週五住在阿嬤家，週五晚上再接回來。|你每天上班前把{kn}送過去，下班再接回家。}{{kn}學會說的第一句台語，是阿嬤教的。|每個月你都塞一個紅包給阿嬤，阿嬤每次都推回來。}", v), mood: 1 }; } },
          { id: "a_whoCares.nanny", label: "找保母", hint: s.year >= 2018 ? "準公共化保母有補助" : s.year >= 2014 ? "找有登記的居家保母" : "找鄰居介紹的保母", act: "hireCare", style: "safe", weight: 0.3, apply: (s2, c) => { spend(s2, s2.year >= 2018 ? 0.1 : 0.15); return { text: c.w("{lead}。你們{面試了三位保母，|透過鄰居介紹，}找到一位帶過十幾個孩子的保母，{每天早上把{kn}和尿布、奶粉一起送過去。|保母每天在聯絡簿上寫{kn}吃了多少、睡了多久。}", v), mood: 1 }; } },
          { id: "a_whoCares.center", label: "送托嬰中心", hint: s.year >= 2012 ? "可以抽公共托嬰" : "有老師，也有同伴", act: "hireCare", style: "safe", weight: 0.15, when: s2 => s2.year >= 1995, apply: (s2, c) => { spend(s2, s2.year >= 2012 ? 0.08 : 0.12); return { text: c.w("{lead}。你們把{kn}送進{nursery}，{第一個星期每天哭著被抱進去，|很快就交到小朋友，}{一個月後，換成你捨不得放手。|開始學會自己拿湯匙吃飯。}", { ...v, nursery: s2.year >= 2012 ? "抽中的公共托嬰中心" : "巷口的托嬰中心" }), mood: 1 }; } },
          { id: "a_whoCares.self", label: "自己帶", hint: "收入少一點，陪伴多一點", act: "care", style: "family", weight: me ? 0.15 : 0.06, apply: (s2, c) => { s2.income *= 0.88; return { text: c.w("{lead}。你決定自己帶，{跟公司談好改成兼職，|{piecework}}{收入少了，但{kn}的每個第一次你都在。|每天忙得團團轉，卻很踏實。}", { ...v, piecework: era(s2) < 2 ? "改在家接家庭代工，" : "改在家接案，" }), mood: 1 }; } },
          { id: "a_whoCares.partner", label: ctx.f("讓{p}在家帶", { p }), hint: "你負責賺錢", act: "wait", style: "self", weight: me ? 0.06 : 0.15, apply: (s2, c) => { spend(s2, 0.1); return { text: c.w("{lead}。{p}決定{辭掉工作|先停下工作}在家帶{kn}，{家裡少了一份薪水，你們重新算了每個月的開銷。|你下班就接手，讓{p}喘口氣。}", v), mood: 0 }; } },
        ],
      };
    },
  },
  {
    // 孩子半夜發燒：小病，但每個爸媽都記得那個晚上。
    id: "a_nightFever", domain: "family", channel: "bad", tags: ["children"], ages: [18, 62], cooldown: 3, max: 3,
    when: s => kidsAged(s, 0, 6).length > 0, p: () => 0.06,
    apply: (s, ctx) => {
      const k = ctx.rng.pick(kidsAged(s, 0, 6)), kn = k.call, kta = pronoun(k);
      const v = {
        kn, kta,
        card: s.year >= 1995 ? "抓了健保卡和兒童健康手冊" : ctx.f("用小被子把{kta}包好", { kta }),
        check: s.year >= 1995 ? "拿著耳溫槍量體溫，" : ctx.f("一直摸{kta}的額頭，", { kta }),
        both: married(s) ? ctx.f("你和{pc}輪流", { pc: s.partner.call }) : "你一個人",
        next: s.employed ? "隔天你頂著黑眼圈去上班。" : "隔天你整個人昏昏沉沉。",
      };
      const t = [
        "{kn}半夜發燒到三十九度，你{card}，衝去掛急診，{等到天亮才回家。|醫生說是病毒感染，多喝水、多休息就好。}",
        "{kn}半夜咳個不停，{both}{抱著{kta}坐在客廳，|{check}}{一夜沒睡。|天亮{kn}才睡著。}{next}",
        s.employed ? "{kn}燒了兩天，你{請假在家顧{kta}，|把冰枕換了一顆又一顆，}{第三天早上{kn}退燒了，吵著要吃布丁。|燒一退，{kn}又在床上跳來跳去。}" : "{kn}燒了兩天，你{整天在家顧{kta}，|把冰枕換了一顆又一顆，}{第三天早上{kn}退燒了，吵著要吃布丁。|燒一退，{kn}又在床上跳來跳去。}",
      ];
      if (k.age <= 2) t.push("{kn}燒了三天，退燒後身上冒出紅疹，醫生說是玫瑰疹，{你這才鬆了一口氣。|你抱著{kta}在診間外坐了好一會兒。}");
      return { text: wordsAs(s, ctx, t, v), mood: -2 };
    },
  },
  {
    // 孩子上國小以後的日常：聯絡簿、運動會、安親班。
    id: "a_schoolDays", domain: "family", channel: "good", tags: ["children"], ages: [25, 65], cooldown: 4, max: 2,
    when: s => kidsAged(s, 6, 11).length > 0 && !s.abroad, p: () => 0.06,
    apply: (s, ctx) => {
      const k = ctx.rng.pick(kidsAged(s, 6, 11)), kn = k.call;
      const t = [
        "每天晚上簽{kn}的聯絡簿，{老師寫「上課很專心」，你看了好幾遍。|看到{kn}被記了一筆「忘記帶作業」，你忍住沒罵。|{kn}在聯絡簿角落畫了一個笑臉給你。}",
        "{kn}學校運動會，你{how}去跑家長接力，{跌了一跤還是跑完了。|你們這隊拿了第二名。|{kn}在終點線大喊你的名字。}",
        "{kn}放學後去{after}，你{每天七點去接，{kn}總是最後幾個被接走的。|週五會{early}帶{kn}去吃一碗剉冰。}",
        s.year >= 1992 ? "{kn}學校園遊會，班上在賣{烤香腸|珍珠奶茶|章魚燒}，你一口氣買了二十張園遊券。" : "{kn}學校園遊會，班上在賣{烤香腸|愛玉冰|彈珠汽水}，你一口氣買了二十張園遊券。",
      ];
      if (s.year >= 2012) t.push("{kn}班上的家長 LINE 群組，為了{校外教學要去哪裡|班費要怎麼用}討論了一整晚，你默默按了好幾個貼圖。");
      return { text: wordsAs(s, ctx, t, { kn, how: s.employed ? "請假" : "特地", after: s.year >= 1990 ? "安親班" : "鄰居家寫功課", early: s.employed ? "提早下班，" : "早一點去，" }), mood: 2 };
    },
  },
  {
    // 補習和才藝：身邊的孩子都在學，你家的要不要？
    id: "a_cram", domain: "family", channel: "change", tags: ["children"], ages: [27, 65], cooldown: 4, max: 2,
    when: s => kidsAged(s, 5, 12).length > 0 && !s.abroad, p: () => 0.06,
    choice: (s, ctx) => {
      const k = ctx.rng.pick(kidsAged(s, 5, 12)), kn = k.call, kta = pronoun(k);
      const [a, b] = pick2(ctx, byEra(s, [["珠心算", "鋼琴", "書法", "美術"], ["美語", "鋼琴", "珠心算", "電腦"], ["美語", "作文", "鋼琴", "跆拳道"], ["美語", "程式", "游泳", "畫畫"], ["程式", "美語", "游泳", "機器人"]]));
      const wish = ctx.rng.pick(["畫畫", "打鼓", "游泳", "下圍棋", "跳舞", "籃球", "做實驗"]);
      // The lessons as the story writes them (ctx.f: class names, this file's English); k.a_hobby keeps the word itself.
      const lesson = { a: ctx.f(a), b: ctx.f(b), wish: ctx.f(wish) };
      const lead = ctx.f("{kn} {kage} 歲，班上同學放學後都在學{a}和{b}", { kn, kage: k.age, a: lesson.a, b: lesson.b });
      const v = { lead, kn, kta, ...lesson };
      return {
        prompt: ctx.f("{lead}。要讓{kn}去補習或學才藝嗎？", { lead, kn }),
        options: [
          { id: "a_cram.many", label: "多報幾樣", hint: "不要輸在起跑點", act: "study", style: "risk", weight: 0.2, apply: (s2, c) => { spend(s2, 0.12); k.a_hobby = a; return { text: c.w("{lead}。你幫{kn}報了{a}和{b}，{一週有五天下課都在趕場。|{kn}在車上吃晚餐，吃著吃著就睡著了。}{{kn}的{a}進步很多，只是笑容少了一點。|你算了算學費，嚇了一跳。}", v), mood: -1 }; } },
          { id: "a_cram.ask", label: ctx.f("問{kn}想學什麼", { kn }), hint: ctx.f("讓{kta}自己選", { kta }), act: "talk", style: "family", weight: 0.35, apply: (s2, c) => { spend(s2, 0.05); k.a_hobby = wish; return { text: c.w("{lead}。你問{kn}想學什麼，{kn}說想學{wish}。{沒想到一學就是好幾年。|每次上完課，{kn}都興奮地講個不停。|{kn}第一次上台表演，你在台下拍了一百張照片。}", v), mood: 2 }; } },
          { id: "a_cram.one", label: "只學一樣", hint: ctx.f("剩下的時間讓{kta}玩", { kta }), act: "save", style: "safe", weight: 0.25, apply: (s2, c) => { spend(s2, 0.03); k.a_hobby = a; return { text: c.w("{lead}。你只讓{kn}學{a}，{其他時間讓{kta}自己安排。|週末留給全家一起出去走走。}{{kn}學得很開心。|你覺得這樣剛剛好。}", v), mood: 1 }; } },
          { id: "a_cram.home", label: ctx.f("自己陪{kta}讀", { kta }), hint: "省錢，但要花時間", act: "care", style: "family", weight: 0.1, apply: (s2, c) => { stress(s2, 0.03); return { text: c.w("{lead}。你決定不送補習班，每天晚上陪{kn}寫功課，{一起讀英文繪本。|考{kta}九九乘法。|週末一起去圖書館。}{有時候兩個人都累到想哭，|{kn}的成績沒有變好，}{但你們聊天的時間變多了。|你知道這段時間不會再回來。}", v), mood: 1 }; } },
          { id: "a_cram.none", label: "不補，讓孩子去玩", hint: "童年只有一次", act: "wait", style: "self", weight: 0.1, apply: (s2, c) => ({ text: c.w("{lead}。你決定不補，放學讓{kn}去{公園|廟口|社區中庭}跑，{膝蓋常常帶著傷回家，|晒得黑黑的，}{笑得很大聲。|交了一群好朋友。}", v), mood: 1 }) },
        ],
      };
    },
  },
  {
    // 青春期：房門一關，什麼都不說。
    id: "a_rebel", domain: "family", channel: "bad", tags: ["children"], ages: [30, 70], cooldown: 3, max: 2,
    when: s => kidsAged(s, 13, 17).length > 0, p: () => 0.06,
    choice: (s, ctx) => {
      const k = ctx.rng.pick(kidsAged(s, 13, 17)), kn = k.call, kta = pronoun(k);
      const sign = ctx.rng.pick(byEra(s, [
        ["放學常常跑去撞球間，成績一路往下掉", "整天窩在漫畫店，跟你講不到三句話就頂嘴"],
        ["迷上電動玩具，常常很晚才回家", "房門一關就是一整晚，叫也不應"],
        ["每天泡在網咖，回家就關進房間", "在 MSN 上聊到半夜，跟你講話只回一個「喔」"],
        ["手機不離手，跟你講不到三句話就吵起來", "沉迷手遊，半夜還在打", "回家就戴上耳機，房門一關就是一整晚"],
        ["手機不離手，跟你講不到三句話就吵起來", "回家就戴上耳機，房門一關就是一整晚"],
      ]));
      const lead = ctx.f("{kn}上了{school}，{sign}", { kn, school: k.age <= 15 ? "國中" : "高中", sign });
      const v = { lead, kn, kta };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "a_rebel.date", label: ctx.f("單獨帶{kta}出去吃飯", { kta }), hint: "不說教，只聽", act: "talk", style: "family", weight: 0.3, apply: (s2, c) => ({ text: c.w("{lead}。你約{kn}去吃{kta}最愛的{牛排|拉麵|火鍋}，{一句教訓都沒說，只聽{kta}講。|沒有問成績，只問{kta}最近在聽什麼歌。}{回家路上，{kn}主動說了學校的事。|{kn}嘴上說無聊，下個週末卻問你還要不要去。}", v), mood: 2 }) },
          { id: "a_rebel.rules", label: "訂規矩", hint: "門禁、手機，講清楚", act: "insist", style: "safe", weight: 0.25, apply: (s2, c) => (c.roll("family", "good", 0.5) ? { text: c.w(s2.year >= 2005 ? "{lead}。你和{kn}把規矩講清楚：{晚上十點以後手機交出來，|平日先寫完功課才能玩，}{{kn}抱怨了幾天，後來也就照做了。|{kn}跟你討價還價了半小時，最後兩個人各退一步。}" : "{lead}。你和{kn}把規矩講清楚：{晚上十點以後電話交出來，|平日先寫完功課才能玩，}{{kn}抱怨了幾天，後來也就照做了。|{kn}跟你討價還價了半小時，最後兩個人各退一步。}", v), mood: 1 } : { text: c.w("{lead}。你訂了規矩，{kn}{摔門進房間，三天不跟你說話。|說你根本不懂{kta}，家裡冷了好一陣子。}", v), mood: -3 }) },
          { id: "a_rebel.space", label: ctx.f("給{kta}空間", { kta }), hint: "青春期，過了就好", act: "wait", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。你決定給{kta}一點空間，{只在房門口放一盤切好的水果。|每天只問一句「吃飽了沒」。}{過了半年，{kn}慢慢又會跟你開玩笑了。|有一天{kn}突然說：「謝謝你沒有一直念我。」}", v), mood: 0 }) },
          { id: "a_rebel.teacher", label: "找導師聊聊", hint: "多一個大人幫忙", act: "seekHelp", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。你打電話給{kn}的導師，{才知道{kta}在學校跟好朋友鬧翻了。|才知道{kta}被選進校隊，卻不敢跟你說。|老師說{kn}在學校其實很乖，只是累了。}{你終於知道該怎麼開口。|那天晚上，你多煮了一道{kn}愛吃的菜。}", v), mood: 1 }) },
          { id: "a_rebel.join", label: ctx.f("陪{kta}做喜歡的事", { kta }), hint: "打球、看表演、打電動都好", act: "hobby", style: "family", weight: 0.1, apply: (s2, c) => { spend(s2, 0.02); return { text: c.w("{lead}。你{陪{kn}去看{kta}喜歡的樂團表演，|請{kn}教你玩{kta}在玩的遊戲，|約{kn}週末去打球，}{被嫌很遜，但{kta}笑了。|那天{kn}的話特別多。}", v), mood: 3 }; } },
        ],
      };
    },
  },
  {
    // 陪考：國中升高中、高中升大學的考試那幾天。
    id: "a_examSupport", domain: "family", channel: "good", tags: ["children"], ages: [30, 75], cooldown: 2, max: 3,
    when: s => !s.abroad && s.kids.some(k => k.age === 15 || k.age === 18), p: () => 0.25,
    apply: (s, ctx) => {
      const k = ctx.rng.pick(s.kids.filter(x => x.age === 15 || x.age === 18)), kn = k.call, kta = pronoun(k);
      const exam = k.age === 15 ? exam15Name(s.year) : exam18Name(s.year);
      const july = k.age === 15 ? s.year < 2001 : s.year < 2002;   // the old joint entrance exams were held in July
      const t = [
        "{kn}考{exam}前一天，你去廟裡幫{kta}拜文昌帝君，{供了包子和粽子，求個「包中」。|把准考證影本放在供桌上，還帶了一把蔥。}",
        "{kn}考{exam}的前一晚，你{煮了一碗{kta}最愛的麵，什麼都沒多說。|在{kta}的書桌上放了一張紙條，只寫了「盡力就好」。|陪{kta}在巷口散步了一圈，聊的都是考試以外的事。}",
      ];
      if (july) t.push("{kn}考{exam}那兩天熱得要命，你在考場外的樹下等，{帶著冰毛巾和一壺綠豆湯。|和一群家長擠在樹蔭下搧扇子。}{kn}走出考場時，你什麼也沒問。");
      else if (exam === "學測") t.push("{kn}考學測那兩天剛好寒流，你{帶著暖暖包和熱薑茶在場外等，|在車上開著暖氣等{kta}出來，}{kn}出來時說：「還好啦。」你就放心了。");
      else t.push("{kn}考{exam}，你{請了兩天假，|一早就去考場佔休息區的位子，}{幫{kta}準備了巧克力和保溫瓶。|看著{kn}走進考場的背影，比自己考試還緊張。}");
      return { text: wordsAs(s, ctx, t, { kn, kta, exam }), mood: 1 };
    },
  },
  {
    // 選系：孩子想讀的，和大人覺得有前途的。
    id: "a_major", domain: "family", channel: "change", tags: ["children"], ages: [33, 75], max: 3,
    when: s => s.kids.some(k => k.age === 18 && !k.a_major), p: () => 0.35,
    choice: (s, ctx) => {
      const k = ctx.rng.pick(s.kids.filter(x => x.age === 18 && !x.a_major)), kn = k.call, kta = pronoun(k);
      k.a_major = true;
      const fromHobby = { 畫畫: "設計系", 美術: "美術系", 打鼓: "音樂系", 鋼琴: "音樂系", 跳舞: "舞蹈系", 籃球: "體育系", 游泳: "體育系", 程式: "資工系", 機器人: "機械系", 做實驗: "化學系", 下圍棋: "數學系", 書法: "中文系", 作文: "中文系", 美語: "外文系", 電腦: "資訊系" };
      const wish = (k.a_hobby && fromHobby[k.a_hobby]) || ctx.rng.pick(byEra(s, [["中文系", "歷史系", "美術系", "社工系"], ["中文系", "大眾傳播系", "美術系", "社工系"], ["設計系", "傳播系", "餐旅系", "心理系"], ["遊戲設計系", "心理系", "動畫系", "運動管理系"], ["遊戲設計系", "心理系", "動畫系", "社工系"]]));
      const hot = ctx.rng.pick(byEra(s, [["醫科", "電機系"], ["醫學系", "電機系"], ["電機系", "醫學系"], ["醫學系", "資工系"], ["資工系", "醫學系"]]).filter(x => x !== wish));
      const others = ctx.rng.pick(["親戚們", "補習班老師", "身邊的大人"]);
      const lead = ctx.f("{kn}考完{exam}，{when}，{kta}想讀{wish}，{others}卻都說{hot}比較有前途", { kn, exam: exam18Name(s.year), when: s.year < 2002 ? "要選填志願了" : "要選科系了", kta, wish, others, hot });
      const chose = (c, p) => (c.rng() < p ? wish : hot);
      const v = { lead, kn, kta, wish, hot };
      return {
        prompt: ctx.f("{lead}。要怎麼做？", { lead }),
        options: [
          { id: "a_major.respect", label: ctx.f("尊重{kn}的選擇", { kn }), hint: "路是孩子自己走的", act: "reconcile", style: "family", weight: 0.3, apply: (s2, c) => { k.major = wish; c.remember("a_major", c.f("支持{kn}去讀{wish}", { kn, wish }), { mood: 2 }); return { text: c.w("{lead}。你對{kn}說：「你想清楚了，我們就支持你。」{{kn}愣了一下，眼眶紅了。|{kn}抱了你一下，說會好好讀。}", v), mood: 2 }; } },
          { id: "a_major.advise", label: "給建議，讓孩子自己選", hint: "把看到的現實說清楚", act: "talk", style: "social", weight: 0.3, apply: (s2, c) => { const m = chose(c, 0.6); k.major = m; return { text: c.w("{lead}。你把{wish}和{hot}的出路都講給{kn}聽，最後{kta}選了{m}。{你們都覺得這是一起做的決定。|那天晚上，你們聊到很晚。}", { ...v, m }), mood: 1 }; } },
          { id: "a_major.insist", label: "要求讀熱門科系", hint: ctx.f("{hot}比較穩", { hot }), act: "insist", style: "safe", weight: 0.15, apply: (s2, c) => { k.major = hot; k.a_forced = true; return { text: c.w("{lead}。你堅持要{kn}填{hot}，{kn}{一句話也沒說，把房門關上了。|最後照你的意思填了，卻好幾天不跟你說話。}", v), mood: -2 }; } },
          { id: "a_major.visit", label: "一起去參觀學校", hint: "看了再決定", act: "travel", style: "learn", weight: 0.2, apply: (s2, c) => { spend(s2, 0.01); const m = chose(c, 0.7); k.major = m; return { text: c.w("{lead}。你陪{kn}{跑了幾所大學的校園參觀日，|去逛大學博覽會，|{train}}{在系館前，{kn}的眼睛在發亮，|聽完學長姊的分享，{kn}心裡有了答案，}最後選了{m}。", { ...v, m, train: s2.year >= 2007 ? "搭高鐵去看學校，" : "坐火車去看學校，" }), mood: 2 }; } },
          { id: "a_major.senior", label: "找學長姊聊聊", hint: "聽聽過來人怎麼說", act: "seekHelp", style: "social", weight: 0.05, apply: (s2, c) => { const m = chose(c, 0.5); k.major = m; return { text: c.w("{lead}。你幫{kn}約了{讀{wish}的學長姊|親戚家讀大學的孩子}出來吃飯，{三個人聊了一個下午，|聽了好多系上的真實生活，}{kn}最後填了{m}。", { ...v, m }), mood: 1 }; } },
        ],
      };
    },
  },
  {
    // 孩子想出國讀書。
    id: "a_studyAbroadKid", domain: "family", channel: "change", tags: ["children"], ages: [40, 70], cooldown: 3, max: 2,
    when: s => s.year >= 1980 && s.kids.some(k => k.age >= 21 && k.age <= 25 && !k.a_abroad), p: () => 0.05,
    choice: (s, ctx) => {
      const k = ctx.rng.pick(s.kids.filter(x => x.age >= 21 && x.age <= 25 && !x.a_abroad)), kn = k.call;
      k.a_abroad = true;   // asked once per child
      const where = ctx.rng.weighted(s.year < 2000 ? [["美國", 5], ["日本", 1], ["英國", 1]] : [["美國", 3], ["英國", 2], ["日本", 2], ["澳洲", 1], ["德國", 1]]);
      const cost = where === "德國" ? "學費不貴，但生活費一年也要幾十萬" : s.year < 2000 ? "一年的花費抵得上家裡好幾年的積蓄" : where === "日本" ? "一年學費加生活費要一百多萬" : "一年學費加生活費要兩百多萬";
      const lead = ctx.f("{kn}{grad}，想去{where}讀研究所，{cost}", { kn, grad: k.major ? ctx.f("{major}畢業", { major: k.major }) : "大學畢業", where, cost });
      const v = { lead, kn, airport: s.year < 2006 ? "中正機場" : "桃園機場" };
      const off = (s2, c) => { k.abroad = where; c.remember("a_kidAbroad", c.f("送{kn}去{where}讀書", { kn, where }), { mood: 3 }); };
      return {
        prompt: ctx.f("{lead}。要怎麼支持？", { lead }),
        options: [
          { id: "a_studyAbroadKid.pay", label: "拿存款全力支持", hint: s.flags.a_eduFund ? "動用存了很久的教育基金" : "這是存了很久的錢", act: "lend", style: "family", weight: s.flags.a_eduFund ? 0.5 : 0.3, when: s2 => s2.savings >= 1, apply: (s2, c) => { spend(s2, 0.8); off(s2, c); return { text: c.w("{lead}。你把定存解約，{在{airport}送{kn}出關，|幫{kn}把兩個大行李箱塞滿泡麵和乾燥劑，}{回家的路上你一直看手機。|{kn}走到轉角才回頭揮手。}", v), mood: 3 }; } },
          { id: "a_studyAbroadKid.half", label: "出一半，其他自己想辦法", hint: "申請獎學金或留學貸款", act: "lend", style: "safe", weight: 0.3, apply: (s2, c) => { spend(s2, 0.4); off(s2, c); return { text: c.w("{lead}。你出了一半，另一半{kn}{申請了留學貸款，|靠打工和獎學金，}{出發前一晚，全家去吃了一頓火鍋。|{kn}說畢業後的第一份薪水要還你。}", v), mood: 2 }; } },
          { id: "a_studyAbroadKid.scholar", label: "鼓勵孩子申請獎學金", hint: "靠自己的實力", act: "seekHelp", style: "learn", weight: 0.2, apply: (s2, c) => { if (c.roll("family", "good", 0.45)) { off(s2, c); return { text: c.w("{lead}。你鼓勵{kn}自己申請獎學金，{{kn}熬了好幾個月寫申請文件，|{kn}考了好幾次語言檢定，}{最後真的拿到了獎學金。|收到錄取信那天，全家在客廳尖叫。}", v), mood: 4 }; } return { text: c.w("{lead}。你鼓勵{kn}自己申請獎學金，{這次沒有申請到，|差了一點點，}{kn}決定先工作，{存一筆錢再出發。|過兩年再試一次。}", v), mood: -1 }; } },
          { id: "a_studyAbroadKid.wait", label: "勸孩子先工作幾年", hint: "存了錢再去", act: "wait", style: "safe", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。你勸{kn}先在台灣工作幾年，{{kn}有點失望，還是答應了。|{kn}說好，但要你答應到時候不能再反對。}", v), mood: -1 }) },
          { id: "a_studyAbroadKid.loan", label: "跟銀行貸款", hint: "每個月慢慢還", act: "borrow", style: "risk", weight: 0.05, apply: (s2, c) => { s2.debt += 0.6; off(s2, c); return { text: c.w("{lead}。你去銀行貸了一筆錢，讓{kn}安心去讀書。{出發那天，你什麼都沒說，只塞了一個紅包。|你沒有告訴{kn}這筆錢是借來的。}", v), mood: 1 }; } },
        ],
      };
    },
  },

  // ---------- career, the middle stretch ----------
  {
    // 升上中階主管：上有老闆、下有組員。這一次難在哪裡，見 managerScenes。
    id: "a_midManager", domain: "career", channel: "change", ages: [28, 55], cooldown: 6, max: 2,
    when: s => corp(s) && s.career >= 2 && s.career <= 4, p: () => 0.05,
    choice: (s, ctx) => {
      const f = s.job.field;
      const t = s.job.title;
      const titles = t === "護理師" ? ["護理長", "副護理長"] : t === "大學講師" ? ["系主任", "中心主任"] : t === "美髮師" || f === "零售" ? ["店長", "區經理"]
        : { 公部門: ["科長", "股長"], 醫療: ["主任", "組長"], 教育: ["組長", "主任"], 科技: ["課長", "經理"], 製造: ["組長", "課長"], 金融: ["襄理", "經理"], 餐飲: ["店長", "主廚"], 營造: ["工地主任", "領班"], 運輸: ["車隊組長", "調度主任"], 服務: ["組長", "主任"], 法律: ["合夥律師", "資深律師"] }[f] || ["主管", "經理", "組長"];
      const title = ctx.rng.pick(titles);
      const boss = { 公部門: "長官", 教育: "校長", 醫療: "院長" }[f] || "老闆";
      const always = s.year >= 2011 ? "假日也在回 LINE" : s.year >= 2000 ? "假日也在回 email" : "假日也常常被叫回公司";
      const sc = pickScene(s, ctx, "a_midManager", managerScenes(s, ctx, { f, title, boss, always })), lead = ctx.w(sc.lead, sc.v);
      const { delegate, course, carry, mentor, back } = sc;
      const v = { ...sc.v, lead, grade: f === "公部門" ? "甲等" : "優等" };
      return {
        prompt: ctx.f("{lead}。要怎麼調整？", { lead }),
        options: [
          { id: "a_midManager.delegate", label: delegate[0], hint: delegate[1], act: "negotiate", style: "social", weight: 0.25, apply: (s2, c) => { stress(s2, -0.05); return { text: c.w(delegate[2], v), mood: 2 }; } },
          { id: "a_midManager.course", label: course[0], hint: course[1], act: "study", style: "learn", weight: 0.15, apply: (s2, c) => { spend(s2, 0.03); const ok = c.roll("career", "good", 0.4); if (ok) s2.income *= 1.04; return { text: c.w(ok ? "{lead}。{{c1}|{c2}}{{learnt}|才發現帶人和做事是兩回事。}年底考核，{boss}說你帶的團隊進步很多。" : "{lead}。{{c1}|{c2}}{{learnt}|才發現帶人和做事是兩回事。}{一開始不太順，|課上學的不一定用得上，}但你慢慢抓到訣竅。", v), mood: ok ? 3 : 1 }; } },
          {
            id: "a_midManager.carry", label: carry[0], hint: carry[1], act: "pushThrough", style: "risk", weight: 0.3,
            apply: (s2, c) => {
              stress(s2, 0.1);
              if (c.roll("career", "good", 0.4)) { s2.income *= 1.05; return { text: c.w("{lead}。{carryX}{{carryA}|{carryB}}年底考績拿了{grade}，{{okA}|加薪了，肩膀也硬得像石頭。}", v), mood: 1 }; }
              s2.health.hr *= 1.02;
              return { text: c.w("{lead}。{carryX}{{carryA}|{carryB}}{身體開始抗議，|{badB}}你開始懷疑自己是不是做錯了。", v), mood: -4 };
            },
          },
          { id: "a_midManager.mentor", label: mentor[0], hint: mentor[1], act: "seekHelp", style: "social", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。你約以前的主管{喝咖啡，|吃飯，}{{saysA}|{saysB}}{{endA}|你把對方說的話抄在筆記本第一頁，慢慢找到自己的節奏。}", v), mood: 2 }) },
          { id: "a_midManager.back", label: back[0], hint: back[1], act: "negotiate", style: "self", weight: 0.1, apply: (s2, c) => { s2.career = Math.max(0, s2.career - 1); s2.income *= 0.95; stress(s2, -0.1); return { text: c.w(back[2], v), mood: 2 }; } },
        ],
      };
    },
  },
  {
    // 被主管搶功。
    id: "a_creditStolen", domain: "career", channel: "bad", ages: [26, 55], cooldown: 5, max: 2,
    when: s => corp(s), p: () => 0.035,
    choice: (s, ctx) => {
      const f = s.job.field;
      const work = ctx.rng.pick({ 科技: ["新產品的設計", "良率改善報告"], 業務: ["大客戶的提案", "年度業績報告"], 行銷: ["年度行銷企劃", "新品上市活動"], 金融: ["客戶的資產配置報告", "風險控管報告"], 教育: ["教學計畫", "評鑑資料"], 公部門: ["計畫書", "預算報告"], 醫療: ["品管報告", "新的照護流程"], 設計: ["整套設計稿", "品牌提案"], 媒體: ["專題報導", "節目企劃"] }[f] || ["企劃案", "改善報告", "整份報告"]);
      const where = ctx.rng.pick({ 公部門: ["業務會報上", "長官面前"], 教育: ["校務會議上", "校長面前"], 醫療: ["科務會議上", "院長面前"] }[f] || ["月會上", "老闆面前", "客戶簡報時"]);
      // The boss in between (主任 at schools and hospitals, 科長 in government) and the one above.
      const head = { 公部門: "科長", 教育: "主任", 醫療: "主任" }[f] || "主管";
      const boss = { 公部門: "上面的長官", 教育: "校長", 醫療: "院長" }[f] || "大老闆";
      const elsewhere = { 教育: "另一所學校", 醫療: "另一家醫院" }[f] || "另一家公司";
      const lead = ctx.f("你熬了好幾個晚上做的{work}，在{where}被{head}講成是自己的成果", { work, where, head });
      const v = { lead, head, boss, elsewhere, cc: s.year >= 2000 ? ctx.f("寄信時副本給{boss}，", { boss }) : ctx.f("多印一份交給{boss}，", { boss }) };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "a_creditStolen.talk", label: ctx.f("私下找{head}談", { head }), hint: "把話講開", act: "talk", style: "social", weight: 0.25, apply: (s2, c) => (c.roll("career", "good", 0.45) ? { text: c.w("{lead}。你私下找{head}談，{{head}有點尷尬，說是自己疏忽了。|{head}沉默了一下，說下次會講清楚。}{下次開會，{head}特別提了你的名字。|之後的報告，你的名字都排在第一個。}", v), mood: 1 } : { text: c.w("{lead}。你私下找{head}談，{head}{裝作聽不懂，|說「團隊的成果就是大家的」，}{你走出辦公室時，手還在抖。|你心裡涼了一半。}", v), mood: -2 }) },
          { id: "a_creditStolen.record", label: "留下紀錄", hint: ctx.f("下次讓{boss}也看到", { boss }), act: "insist", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}。你什麼都沒說，只是從此每份文件都{寫上自己的名字和日期，|{cc}}{半年後，{boss}在會議上點名問你的意見。|{head}再也沒這麼做過。}", v), mood: 0 }) },
          { id: "a_creditStolen.escalate", label: "越級報告", hint: "可能贏，也可能鬧僵", act: "dispute", style: "risk", weight: 0.08, apply: (s2, c) => { if (c.roll("career", "good", 0.4)) { s2.income *= 1.05; return { text: c.w("{lead}。你直接去找{boss}說明，{{boss}翻了你的工作紀錄，|{boss}聽完點點頭，}{這件事後來交給你負責。|年底你的考績比{head}還好。}", v), mood: 3 }; } return { text: c.w("{lead}。你直接去找{boss}說明，{{boss}說會了解，之後就沒有下文，|消息很快傳回{head}耳裡，}{你和{head}的關係從此很僵。|你開始被排除在重要的會議之外。}", v), mood: -4 }; } },
          { id: "a_creditStolen.swallow", label: "吞下去", hint: "以和為貴", act: "pushThrough", style: "safe", weight: 0.27, apply: (s2, c) => { stress(s2, 0.05); return { text: c.w("{lead}。你把這口氣吞了下去，{下班後在車上坐了很久才回家。|告訴自己：真正懂的人會知道。}{之後做事，你多留了一個心眼。|那個月你特別常去運動。}", v), mood: -3 }; } },
          { id: "a_creditStolen.leave", label: "開始投履歷", hint: "換一個看得見你的地方", act: "jobHop", style: "self", weight: 0.15, when: () => f !== "公部門", apply: (s2, c) => { if (c.roll("career", "change", 0.5)) { s2.income *= c.rng.between(0.98, 1.15); return { text: c.w("{lead}。你開始投履歷，{三個月後|半年後}換到{elsewhere}，繼續當{title}。{新的{head}第一次開會就介紹了你的經歷。|離開那天，你把桌子收得乾乾淨淨。}", { ...v, title: s2.job.title }), mood: 2 }; } return { text: c.w("{lead}。你開始投履歷，{投了幾家都沒有下文，|面試了兩家都不太合適，}你決定先留下來，{把作品整理好再說。|但心裡已經有了打算。}", v), mood: -1 }; } },
        ],
      };
    },
  },
  {
    // 帶新人。
    id: "a_mentor", domain: "career", channel: "good", ages: [30, 58], cooldown: 4, max: 3,
    when: s => s.employed && !!s.job && s.job.field !== "家業" && s.career >= 1, p: () => 0.05,
    apply: (s, ctx) => {
      const sex = ctx.rng() < 0.5 ? "male" : "female";
      const nc = ctx.person({ role: "friend", sex, birthYear: s.year - 22 - ctx.rng.int(4), how: "同事" });
      if (ctx.rng() < 0.3) s.friends.push(nc);
      const n = nc.call, nta = pronoun(nc), own = s.job.field === "自營";
      // where the new colleague came: the unit and 來了一個, as one phrase
      const arrived = { 教育: "學校來了一個", 醫療: "醫院來了一個", 公部門: "單位來了一個", 餐飲: "店裡來了一個", 零售: "店裡來了一個", 自營: "店裡來了一個" }[s.job.field] || "部門來了一個";
      const fresh = sex === "male" && ctx.rng() < 0.5 ? "剛退伍" : "剛畢業";
      const call = own ? "老闆" : "前輩";
      return { text: wordsAs(s, ctx, [
        "{arrived}{fresh}的新人{n}，你帶{nta}做了三個月，{{n}送你一張手寫卡片，說你是{nta}遇過最好的{call}。|{n}第一次獨立完成工作那天，跑來跟你比了一個讚。}",
        "你帶的新人{n}第一次自己{上台報告，|面對客人，|值班，}{結束後笑著跟你說：「沒有想像中可怕。」|出了一點小包，你陪{nta}一起收拾到很晚。}",
        "新人{n}問你：「{call}，你當初是怎麼撐過來的？」你想了很久，{請{nta}喝了一杯咖啡，講了自己第一年的糗事。|只說：「不懂就問，問完記下來。」}",
      ], { arrived, fresh, n, nta, call }), mood: 3 };
    },
  },
  {
    // 公司被併購。
    id: "a_merger", domain: "career", channel: "change", ages: [28, 60], max: 1,
    when: s => s.year >= 1990 && s.employed && !!s.job && ["科技", "金融", "製造", "媒體", "零售", "行銷", "業務", "醫療", "設計", "觀光", "不動產"].includes(s.job.field),
    p: () => 0.02,
    apply: (s, ctx) => {
      const f = s.job.field, good = ctx.roll("career", "good", 0.5);
      // What happened, and how it went: [better off, worse off].
      let what;
      if (f === "金融" && s.year >= 2001 && s.year <= 2012) what = ["{金控整併，|銀行被併進金控，}你待的分行換了招牌，{制服和名片全部重做。|你花了半年才熟悉新的系統。}{還好新公司調了薪水，|新公司的福利比較好，}你鬆了一口氣。", "{金控整併，|銀行被併進金控，}你待的分行換了招牌，{制服和名片全部重做。|你花了半年才熟悉新的系統。}{好幾個熟悉的同事離開了，|新主管要大家重寫所有流程，}你常常覺得{很累。|自己又變回了新人。}"];
      else if (f === "科技") what = ["公司被{一家大廠|一家外商}併購，{識別證換了顏色，|晨會開始夾著英文，}{連分紅制度都跟著改了。|老同事一半被調到新部門。}{還好新公司調了薪水，|新公司的福利比較好，}你鬆了一口氣。", "公司被{一家大廠|一家外商}併購，{識別證換了顏色，|晨會開始夾著英文，}{連分紅制度都跟著改了。|老同事一半被調到新部門。}{好幾個熟悉的同事離開了，|新主管要大家重寫所有流程，}你常常覺得{很累。|自己又變回了新人。}"];
      else if (f === "醫療") what = ["醫院被{醫療集團|財團}併購，{院長換人了，|招牌換了，}{連掛號系統都重做了。|你們的制服也換了顏色。}{還好新公司調了薪水，|新公司的福利比較好，}你鬆了一口氣。", "醫院被{醫療集團|財團}併購，{院長換人了，|招牌換了，}{連掛號系統都重做了。|你們的制服也換了顏色。}{好幾個熟悉的同事離開了，|新主管要大家重寫所有流程，}你常常覺得{很累。|自己又變回了新人。}"];
      else what = ["公司被併購了，{新老闆第一天就來各部門巡視，|連招牌和名片都換了，}{你得重新跟客戶自我介紹。|很多做法都要重新來過。}{還好新公司調了薪水，|新公司的福利比較好，}你鬆了一口氣。", "公司被併購了，{新老闆第一天就來各部門巡視，|連招牌和名片都換了，}{你得重新跟客戶自我介紹。|很多做法都要重新來過。}{好幾個熟悉的同事離開了，|新主管要大家重寫所有流程，}你常常覺得{很累。|自己又變回了新人。}"];
      if (good) s.income *= 1.05; else stress(s, 0.05);
      return { text: ctx.w(what[good ? 0 : 1]), mood: good ? 2 : -3 };
    },
  },
  {
    // 年終和分紅：科技業 1990 年代到 2007 年的員工分紅配股（2008 年起費用化）、銀行的年終、工廠的尾牙。
    id: "a_bonus", domain: "wealth", channel: "good", ages: [28, 60], cooldown: 3,
    when: s => s.employed && !!s.job && !s.abroad, p: () => 0.06,
    apply: (s, ctx) => {
      const f = s.job.field, y = s.year;
      let gain = ctx.rng.between(0.05, 0.25), t;
      if (f === "科技" && y >= 1995 && y <= 2007) {
        gain = ctx.rng.between(0.3, 0.9);
        t = ["公司發員工分紅配股，{同事都在算自己拿了幾張，|股價一路漲，}{你第一次覺得「科技新貴」這四個字跟自己有關。|你把股票存起來，沒有馬上賣。}", "{年中|年底}的分紅配股入帳，{你算了算，抵得上好幾個月的薪水。|你幫爸媽換了一台新冰箱。}", "股票分紅發下來那天，{辦公室裡大家都在討論要換什麼車。|你偷偷打電話告訴家人，聲音壓得很低。}"];
      } else if (f === "科技") t = ["{年中|年底}的員工酬勞入帳，{比去年多了一些。|你拿去付了一部分房貸。|你存進了孩子的教育帳戶。}", "公司營收創新高，年終{加碼|多發了兩個月}，{同事在群組裡狂刷貼圖。|你請整組喝了手搖飲。}", "年終入帳那天，你{把一半存起來，另一半帶家人去吃大餐。|終於換掉了用了很多年的舊電腦。}"];
      else if (f === "金融") t = ["年終加績效獎金領了{四|五|六}個月，{你在 ATM 前多看了兩眼餘額。|請全家去吃了一頓好的。}", "{銀行|公司}今年獲利不錯，{年終多發了一個月。|主管說大家辛苦了，每個人加發一筆獎金。}", "年終入帳，你{照例存一半、花一半。|幫家裡換了一台洗衣機。}"];
      else if (f === "公部門") t = ["考績甲等，年終一個半月，{你拿去繳了孩子的學費。|過年包紅包比較不心疼。}", "年終入帳，你{照例存一半、花一半。|幫家裡換了一台洗衣機。}", "考績拿了甲等，{同事笑你今年運氣好。|你請辦公室喝了一輪飲料。}"];
      else if (f === "自營") t = ["年底結帳，今年{比去年好|生意不錯}，你{幫自己包了一個紅包。|把多出來的錢存進定存。}", "年底盤點完，{帳本上終於是黑字，|今年多賺了一點，}{你請幫忙的人吃了一頓尾牙。|你帶家人去吃了一頓好的。}", "過年前的生意特別好，{你忙到半夜才收攤，|店門口排了好長的隊，}算一算今年{比預期還好。|總算沒有白忙。}"];
      else if (f === "家業") t = parentsWord(s) ? ["過年前{pw}塞給你一個紅包，說今年{店裡|家裡}生意不錯。", "年底結算，家裡的生意今年有賺，{你們全家去吃了一頓好的。|你把多出來的錢存了起來。}", "過年前忙完最後一批貨，{家裡的帳終於算清楚，|今年的收入比去年好，}{你鬆了一口氣。|你多買了一些年菜。}"] : ["年底結算，家裡的生意今年有賺，{你們全家去吃了一頓好的。|你把多出來的錢存了起來。}", "過年前忙完最後一批貨，{家裡的帳終於算清楚，|今年的收入比去年好，}{你鬆了一口氣。|你多買了一些年菜。}", "{年底|過年前}{店裡|家裡}的生意特別好，{你多包了幾個紅包。|你替祖先多上了一炷香。}"];
      else t = ["公司尾牙抽獎，你抽中了{一台機車|一台冷氣|一台電視|現金五萬元}，{同事在台下起鬨要你上台唱歌。|你舉著獎品跟老闆合照。}", "年終發了{兩個月|一個半月}，{你存了一半，另一半帶家人去吃大餐。|你換了一台新的機車。}", "今年{訂單多|生意好}，老闆{在尾牙上宣布加發獎金，|多包了一個紅包給每個人，}{大家笑得合不攏嘴。|你回家時腳步特別輕。}"];
      s.savings += gain;
      return { text: wordsAs(s, ctx, t, { pw: parentsWord(s) }), mood: 4 };
    },
  },
  {
    // 辦公室政治：兩派人馬都來拉你。
    id: "a_officePolitics", domain: "career", channel: "bad", ages: [28, 55], cooldown: 5, max: 2,
    when: s => corp(s), p: () => 0.035,
    choice: (s, ctx) => {
      const f = s.job.field, lecturer = s.job.title === "大學講師";
      const [a, b, place, dept] = f === "公部門" ? ["新上任的首長", "資深的老科長", "機關", "單位"]
        : f === "教育" ? (lecturer ? ["新來的系主任", "資深的老教授", "系上", "研究室"] : ["新來的校長", "資深的老主任", "學校", "處室"])
        : f === "醫療" ? ["新來的院長", "資深的老主任", "醫院", "科別"]
        : [ctx.rng.pick(["空降的副總", "新來的總經理", ctx.f("老闆的{child}", { child: ctx.rng.pick(["兒子", "女兒"]) })]), ctx.rng.pick(["跟了老闆二十年的協理", "資深的老經理"]), "公司", "部門"];
      // The workplace and the other unit, each as the phrase it is written in.
      const split = { 機關: "機關裡分成兩派", 系上: "系上裡分成兩派", 學校: "學校裡分成兩派", 醫院: "醫院裡分成兩派", 公司: "公司裡分成兩派" }[place];
      const transfer = { 單位: "申請調到別的單位", 研究室: "申請調到別的研究室", 處室: "申請調到別的處室", 科別: "申請調到別的科別", 部門: "申請調到別的部門" }[dept];
      const lead = ctx.f("{split}，{a}和{b}互不相讓，兩邊都找你吃飯", { split, a, b });
      const v = { lead, a, b, transfer };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "a_officePolitics.neutral", label: "誰也不站", hint: "把自己的事做好", act: "wait", style: "safe", weight: 0.4, apply: (s2, c) => ({ text: c.w("{lead}。你兩邊的飯都吃，誰也不得罪，{只把手上的事做好。|開會時只講數字。}{幾個月後風波過去，你還在原位。|有人說你是牆頭草，你笑笑沒回。}", v), mood: -1 }) },
          { id: "a_officePolitics.new", label: ctx.f("站在{a}這邊", { a }), hint: "押寶新的力量", act: "insist", style: "risk", weight: 0.15, apply: (s2, c) => { if (c.roll("career", "good", 0.45)) { s2.income *= 1.06; return { text: c.w("{lead}。你選擇站在{a}這邊，{後來{a}坐穩了位子，|{a}的改革成功了，}{你被找去負責新的計畫，薪水也調了。|你在會議上的意見開始被聽見。}", v), mood: 3 }; } return { text: c.w("{lead}。你選擇站在{a}這邊，{沒想到不到半年{a}就離開了，|{a}的計畫推不動，}{你被晾在一邊好一陣子。|你在會議上越來越說不上話。}", v), mood: -4 }; } },
          { id: "a_officePolitics.old", label: ctx.f("站在{b}這邊", { b }), hint: "跟著有交情的人", act: "reconcile", style: "family", weight: 0.15, apply: (s2, c) => { if (c.roll("career", "good", 0.45)) { s2.income *= 1.03; return { text: c.w("{lead}。你選擇站在{b}這邊，{{b}穩住了局面，|風波過後，}{你們這一組沒有被拆散。|{b}在會議上替你說了好話。}", v), mood: 2 }; } return { text: c.w("{lead}。你選擇站在{b}這邊，{後來{b}被調走了，|新的一派占了上風，}{你也被調去冷門的位置。|你手上的案子一個個被拿走。}", v), mood: -4 }; } },
          { id: "a_officePolitics.transfer", label: asLabel(ctx, transfer), hint: "離開戰場", act: "negotiate", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w("{lead}。你{transfer}，{雖然要重新熟悉業務，|一切從頭開始，}{但耳根清靜多了。|新同事都很好相處。}", v), mood: 1 }) },
          { id: "a_officePolitics.leave", label: "趁機跳槽", hint: "外面的機會也不少", act: "jobHop", style: "risk", weight: 0.1, when: () => f !== "公部門", apply: (s2, c) => { s2.income *= c.rng.between(0.98, 1.15); return { text: c.w("{lead}。你趁機換到{elsewhere}，繼續當{title}，{離開那天，兩派的人都來跟你道別。|新環境單純多了。}", { ...v, elsewhere: { 學校: "另一所學校", 系上: "另一所大學", 醫院: "另一家醫院" }[place] || "另一家公司", title: s2.job.title }), mood: 1 }; } },
        ],
      };
    },
  },
  {
    // 同事離職潮。
    id: "a_exodus", domain: "career", channel: "change", ages: [28, 60], cooldown: 5, max: 2,
    when: s => corp(s) && !s.abroad, p: () => 0.03,
    apply: (s, ctx) => {
      stress(s, 0.05);
      const f = s.job.field;
      const t = [
        "{跟你最好的同事|一起進公司的同梯}遞了辭呈，{你們在巷口的熱炒店喝到很晚。|你幫對方把紙箱搬上車。}{之後午餐常常只剩你一個人。|你接下了對方留下的工作。}",
        "{年後|一領完年終}，{部門|身邊}走了好幾個人，{新人還沒補進來，|主管天天在面試，}{你每天加班到九點。|你一個人做兩個人的事。}",
      ];
      if (s.year >= 2021) t.push("一波離職潮，{三個月走了五個同事，|部門走了快一半的人，}{你的工作量一下子變成兩倍。|你在歡送會上一直想：下一個會不會是我？}");
      else if (s.year >= 1990 && s.year < 2010 && ["科技", "製造"].includes(f)) t.push("好幾個同事被挖角去{上海|深圳|蘇州}，{辦公室突然空了一排。|你接下了他們留下來的客戶。}");
      else t.push("{一個做了二十年的老同事|你帶過的新人}也走了，{歡送會上大家都喝多了。|你把對方送的馬克杯留在桌上。}");
      return { text: ctx.w(t), mood: -2 };
    },
  },

  // ---------- money and home ----------
  {
    // 房貸壓力：買了房以後的頭二十年。
    id: "a_mortgage", domain: "wealth", channel: "bad", tags: ["home"], ages: [28, 62], cooldown: 5, max: 2,
    when: s => s.home === "own" && s.ownedAt !== undefined && s.age - s.ownedAt >= 1 && s.age - s.ownedAt <= 20, p: () => 0.05,
    choice: (s, ctx) => {
      const rate = s.year < 1995 ? "房貸利率還有八、九趴" : s.year < 2003 ? "利率還有五、六趴" : s.year < 2022 ? "利率雖然低，本金還是很重" : "利率又往上調了";
      const tuition = kidsAged(s, 6, 22).length ? (s.kids.length > 1 ? "，孩子們的學費也快要繳了" : "，孩子的學費也快要繳了") : "";
      const lead = ctx.f("每個月房貸一繳完，{left}，{rate}{tuition}", { left: s.employed ? "薪水就剩沒多少" : "存款就少了一截", rate, tuition });
      const par = parentsWord(s), them = par === "爸媽" ? "他們" : par === "爸爸" ? "他" : "她";
      const v = { lead, par, them };
      return {
        prompt: ctx.f("{lead}。要怎麼辦？", { lead }),
        options: [
          { id: "a_mortgage.bank", label: "跟銀行談", hint: "轉貸或延長年限", act: "negotiate", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。你跑了好幾家銀行，{把房貸轉到利率低一點的地方，|跟銀行談好延長年限，}每個月少繳{幾千塊，|一點，}{總算喘了一口氣。|心裡踏實多了。}", v), mood: 1 }) },
          { id: "a_mortgage.frugal", label: "全家一起省", hint: "少外食、少出遊", act: "save", style: "safe", weight: 0.25, apply: (s2, c) => { frugal(s2, 2); return { text: c.w("{lead}。你和家人說好一起省，{午餐改帶便當，|週末改去公園野餐，|冷氣只在最熱的時候開，}{一年下來竟然多存了一筆。|日子緊了一點，但每個人都有幫上忙。}", v), mood: -1 }; } },
          { id: "a_mortgage.side", label: s.employed ? "下班兼差" : "找兼差", hint: "多一份收入", act: "sideJob", style: "risk", weight: 0.15, apply: (s2, c) => { s2.income *= 1.04; stress(s2, 0.05); return { text: c.w(s2.employed ? (s2.year >= 2016 ? "{lead}。你下班後{跑外送，|接案，}{多賺一點是一點。|累，但看到帳戶慢慢回來很安心。}" : "{lead}。你下班後{去當家教，|週末去擺攤，}{多賺一點是一點。|累，但看到帳戶慢慢回來很安心。}") : s2.year >= 2016 ? "{lead}。你開始{跑外送，|接案，}{多賺一點是一點。|累，但看到帳戶慢慢回來很安心。}" : "{lead}。你開始{去當家教，|週末去擺攤，}{多賺一點是一點。|累，但看到帳戶慢慢回來很安心。}", v), mood: -1 }; } },
          { id: "a_mortgage.prepay", label: s.employed ? "拿年終提前還本金" : "拿一筆存款提前還", hint: "少付一點利息", act: "save", style: "safe", weight: 0.15, when: s2 => s2.savings >= 0.5, apply: (s2, c) => { spend(s2, 0.2); stress(s2, -0.05); return { text: c.w(s2.employed ? "{lead}。你把年終拿去提前還了一部分本金，{看著貸款餘額往下掉，|算了算少付的利息，}{心裡輕鬆不少。|覺得離無債一身輕又近了一點。}" : "{lead}。你把一筆存款拿去提前還了一部分本金，{看著貸款餘額往下掉，|算了算少付的利息，}{心裡輕鬆不少。|覺得離無債一身輕又近了一點。}", v), mood: 2 }; } },
          { id: "a_mortgage.parents", label: ctx.f("請{par}幫忙", { par: par || "家人" }), hint: "先週轉一下", act: "seekHelp", style: "family", weight: 0.1, when: () => !!par, apply: (s2, c) => { s2.savings += 0.15; return { text: c.w("{lead}。{par}知道了，{塞了一個信封給你，|二話不說拿出一筆錢，}{說是早就幫你存的。|叫你不要跟{them}客氣。}你收下了，心裡有點不好意思。", v), mood: 0 }; } },
          { id: "a_mortgage.endure", label: "咬牙撐下去", hint: "再過幾年就輕鬆了", act: "pushThrough", style: "safe", weight: 0.15, when: s2 => s2.savings < 0.5, apply: (s2, c) => { stress(s2, 0.05); return { text: c.w("{lead}。你{告訴自己再撐幾年就好，|什麼都沒改，只是咬著牙繼續繳，}{每個月繳完房貸，就把存摺收進抽屜。|想到這是自己的家，就覺得還撐得下去。}", v), mood: -2 }; } },
          { id: "a_mortgage.rent", label: "把一間房間租出去", hint: "多一筆收入", act: "sideJob", style: "social", weight: 0.08, when: s2 => s2.kids.length <= 1, apply: (s2, c) => { s2.income *= 1.03; return { text: c.w("{lead}。你把{多出來的那間|後面那間}房間租給{附近的大學生，|一位上班族，}{每個月多了一筆房租。|家門口多了一雙拖鞋。}", v), mood: 0 }; } },
        ],
      };
    },
  },
  {
    // 想換房：只是想，不在這裡買（買房在 core.js）。
    id: "a_upgrade", domain: "wealth", channel: "change", tags: ["home"], ages: [35, 58], max: 1,
    when: s => s.home === "own" && s.kids.length > 0 && s.age - (s.ownedAt ?? s.age) >= 5 && !s.abroad, p: () => 0.03,
    choice: (s, ctx) => {
      const place = ctx.rng.pick(s.year >= 1996 ? ["重劃區", "捷運站旁", "明星學區"] : ["重劃區", "新市鎮", "明星學區"]);
      const kw = kidsWord(s);
      const lead = married(s) ? ctx.f("{kw}長大了，家裡越住越擠，{p}週末拉你去看{place}的新建案", { kw, p: s.partner.call, place }) : ctx.f("{kw}長大了，家裡越住越擠，你週末去看了{place}的新建案", { kw, place });
      const v = { lead, kw };
      return {
        prompt: ctx.f("{lead}。要換房嗎？", { lead }),
        options: [
          { id: "a_upgrade.renovate", label: "不換，重新裝潢", hint: "把現在的家住得舒服", act: "wait", style: "safe", weight: 0.3, apply: (s2, c) => { spend(s2, 0.15); return { text: c.w("{lead}。最後沒有換房，{請師傅把兩房隔成三房，|把舊廚房拆掉重做，}{{kw}終於有了自己的房間。|住了這麼多年的家像新的一樣。}", v), mood: 2 }; } },
          { id: "a_upgrade.save", label: "先存錢，過幾年再說", hint: "頭期款還要再存", act: "save", style: "safe", weight: 0.3, apply: (s2, c) => { frugal(s2, 2); return { text: c.w("{lead}。你算了算，頭期款還差一截，{決定先存錢，過幾年再說。|在冰箱上貼了一張存錢的目標表。}", v), mood: 0 }; } },
          { id: "a_upgrade.look", label: "看看就好", hint: "看房子也是一種休閒", act: "wait", style: "self", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。之後幾乎每個週末都去看{樣品屋，|接待中心，}{拿回一疊廣告單，|喝了很多杯免費的咖啡，}{最後還是覺得現在的家最好。|說好等{kw}上大學再說。}", v), mood: 1 }) },
          { id: "a_upgrade.kids", label: "錢留給孩子讀書", hint: "房子夠住就好", act: "save", style: "family", weight: 0.2, apply: (s2, c) => { s2.flags.a_eduFund = true; return { text: c.w("{lead}。你想了想，{把換房的錢留給{kw}讀書，|覺得房子夠住就好，}{幫{kw}開了一個教育基金的帳戶。|心裡反而踏實。}", v), mood: 1 }; } },
        ],
      };
    },
  },
  {
    // 理財：定存、基金、股票、跟會，每個年代流行的不一樣。
    id: "a_investing", domain: "wealth", channel: "change", ages: [30, 55], cooldown: 6, max: 2,
    when: s => s.savings >= 0.5, p: () => 0.04,
    choice: (s, ctx) => {
      const lead = byEra(s, [
        "定存利率還有八、九趴，鄰居和同事卻都在跟會、討論股票",
        "號子裡天天有人在報明牌，銀行定存的利息也還不錯",
        "銀行理專一直打電話來推基金和連動債，定存利率越來越低",
        "同事都在討論定期定額買 ETF，定存利率只剩一趴多",
        "身邊的人都在買 ETF，還有人在聊美股和虛擬貨幣",
      ]);
      const etf = era(s) >= 3, fund = etf ? "定期定額買 ETF" : "買基金";
      const crash = [1990, 2000, 2001, 2008, 2022].includes(s.year);
      const v = { lead };
      return {
        prompt: ctx.f("{lead}。手上這筆存款要怎麼處理？", { lead }),
        options: [
          { id: "a_investing.deposit", label: "放定存就好", hint: "穩穩的", act: "save", style: "safe", weight: 0.3, apply: (s2, c) => { s2.savings += era(s2) < 2 ? 0.06 : 0.01; return { text: c.w("{lead}。你還是把錢放定存，{每年領一點利息，|雖然賺得不多，}{晚上睡得很安穩。|至少不用每天看盤。}", v), mood: 0 }; } },
          { id: "a_investing.fund", label: asLabel(ctx, fund), hint: "每個月扣一點，慢慢來", act: "invest", style: "safe", weight: 0.3, apply: (s2, c) => { if (crash) { s2.savings = Math.max(0, s2.savings - c.rng.between(0.05, 0.15)); return { text: c.w(etf ? "{lead}。你開始定期定額買 ETF，{才扣了幾個月就遇上大跌，|帳面上一下子少了一截，}{你咬著牙沒有停扣。|你告訴自己這是長期的事。}" : "{lead}。你開始買基金，{才扣了幾個月就遇上大跌，|帳面上一下子少了一截，}{你咬著牙沒有停扣。|你告訴自己這是長期的事。}", v), mood: -2 }; } s2.savings += c.rng.between(0, 0.12); return { text: c.w(etf ? "{lead}。你開始定期定額買 ETF，{一年下來帳面上多了一些。|每個月扣一點，幾乎感覺不到。}{你把對帳單收進資料夾。|你發現存錢沒有想像中難。}" : "{lead}。你開始買基金，{一年下來帳面上多了一些。|每個月扣一點，幾乎感覺不到。}{你把對帳單收進資料夾。|你發現存錢沒有想像中難。}", v), mood: 1 }; } },
          { id: "a_investing.stock", label: "自己研究買股票", hint: "可能賺，也可能賠", act: "invest", style: "risk", weight: 0.2, apply: (s2, c) => { const x = c.rng.between(0.1, 0.4), w = { ...v, when: s2.employed ? "下班後" : "每天" }; if (c.roll("wealth", "good", crash ? 0.3 : 0.5)) { s2.savings += x; return { text: c.w("{lead}。你{when}開始研究財報，挑了幾支股票，{運氣不錯，一年下來賺了一些。|抱了一年，漲了不少。}{你請家人吃了一頓好的。|你提醒自己別得意忘形。}", w), mood: 3 }; } s2.savings = Math.max(0, s2.savings - x); return { text: c.w("{lead}。你{when}開始研究財報，挑了幾支股票，{結果遇上一波大跌，|買在高點，}{賠了一筆，你把看盤軟體刪了。|帳面一片綠油油，你學到了一課。}", w), mood: -4 }; } },
          { id: "a_investing.hui", label: "跟會", hint: "親戚朋友起的會", act: "invest", style: "social", weight: 0.15, when: s2 => s2.year < 2005, apply: (s2, c) => { if (c.roll("wealth", "bad", 0.12)) { s2.savings = Math.max(0, s2.savings - 0.3); return { text: c.w("{lead}。你跟了{鄰居|同事|親戚}起的會，{沒想到會頭捲款跑了，|半年後就倒會了，}{你繳的錢全拿不回來。|一群會腳在會頭家門口等了一整晚。}", v), mood: -6 }; } s2.savings += 0.05; return { text: c.w("{lead}。你跟了{鄰居|同事|親戚}起的會，{每個月繳一點，|標會那天大家擠在客廳，}{最後標到一筆不錯的利息。|一年下來多了一筆錢。}", v), mood: 2 }; } },
          { id: "a_investing.learn", label: "先去上理財課", hint: "搞懂了再說", act: "study", style: "learn", weight: 0.1, apply: (s2, c) => { spend(s2, 0.01); return { text: c.w("{lead}。你先去上了{幾堂理財課，|社區大學的投資課，}{開始每個月記帳，|學會看懂基金的對帳單，}{錢還沒賺到，但心裡有底了。|才知道自己以前花錢有多隨便。}", v), mood: 1 }; } },
          { id: "a_investing.crypto", label: "買一點虛擬貨幣", hint: "漲跌很刺激", act: "invest", style: "risk", weight: 0.04, when: s2 => s2.year >= 2017, apply: (s2, c) => { const x = c.rng.between(0.05, 0.4); if (c.roll("wealth", "good", 0.4)) { s2.savings += x; return { text: c.w("{lead}。你拿一小筆錢買了虛擬貨幣，{剛好碰上一波大漲，|半夜爬起來看行情，}{賺了一筆就趕快出場。|最後小賺一點，你決定見好就收。}", v), mood: 3 }; } s2.savings = Math.max(0, s2.savings - Math.min(x, 0.3)); return { text: c.w("{lead}。你拿一小筆錢買了虛擬貨幣，{幾個月內跌掉一大半，|交易所出了事，}{你決定當作繳學費。|你把軟體刪了，再也不看。}", v), mood: -4 }; } },
        ],
      };
    },
  },
  {
    // 買保險：朋友來推銷的那一杯咖啡，或是銀行理專、家裡長輩、朋友住院那一次。見 insuranceScenes。
    id: "a_insurance", domain: "wealth", channel: "change", ages: [30, 50], once: true,
    when: s => !s.abroad && !s.flags.insured && (married(s) || s.kids.length > 0), p: () => 0.05,
    choice: (s, ctx) => {
      const sc = pickScene(s, ctx, "a_insurance", insuranceScenes(s, ctx)), lead = ctx.w(sc.lead, sc.v);
      const { basic, full, saving, ask, no } = sc, v = { ...sc.v, lead };
      const life = s.kids.length ? (parentsWord(s) ? "上有爸媽、下有孩子" : "家裡有孩子要養") : "剛成家";
      return {
        prompt: ctx.f("{lead}。你{life}，要買保險嗎？", { lead, life }),
        options: [
          { id: "a_insurance.basic", label: basic[0], hint: basic[1], act: "insurance", style: "health", weight: 0.35, apply: (s2, c) => { s2.flags.insured = true; spend(s2, 0.02); return { text: c.w(basic[2], v), mood: 1 }; } },
          { id: "a_insurance.full", label: full[0], hint: full[1], act: "insurance", style: "safe", weight: 0.2, apply: (s2, c) => { s2.flags.insured = true; spend(s2, 0.08); return { text: c.w(full[2], v), mood: 1 }; } },
          { id: "a_insurance.saving", label: saving[0], hint: saving[1], act: "save", style: "safe", weight: 0.15, apply: (s2, c) => { frugal(s2, 2); return { text: c.w(saving[2], v), mood: 0 }; } },
          { id: "a_insurance.ask", label: ask[0], hint: ask[1], act: "seekHelp", style: "learn", weight: 0.15, apply: (s2, c) => { s2.flags.insured = true; spend(s2, 0.02); return { text: c.w(ask[2], v), mood: 1 }; } },
          { id: "a_insurance.no", label: no[0], hint: no[1], act: "save", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w(no[2], v), mood: 0 }) },
        ],
      };
    },
  },
  {
    // 親戚開口借錢；借出去的錢，幾年後才知道回不回得來（a_loanReturn）。為什麼要借、怎麼開口，見 loanScenes。
    id: "a_relativeLoan", domain: "wealth", channel: "bad", ages: [30, 60], cooldown: 6, max: 2,
    when: s => s.savings >= 0.3 && !s.arcs.a_loan, p: () => 0.035,
    choice: (s, ctx) => {
      const sibs = s.flags.estranged ? [] : bornSiblings(s, 18);
      const sib = sibs.length && ctx.rng() < 0.35 ? ctx.rng.pick(sibs) : null;
      const elders = s.age <= 45 ? ["姑丈", "舅舅", "阿姨", "叔叔"] : [];
      const who = sib ? siblingOf(ctx, sib) : ctx.rng.pick(["表哥", "堂弟", "表弟", "表妹", "堂姊", "表姊", ...elders]);
      const ta = (sib ? /Sister/.test(sib.relation) : ["表妹", "堂姊", "表姊", "阿姨"].includes(who)) ? "她" : "他";
      const sc = pickScene(s, ctx, "a_relativeLoan", loanScenes(s, ctx, { who, ta, elder: elders.includes(who), younger: !sib && ["堂弟", "表弟", "表妹"].includes(who) }));
      const lead = ctx.w(sc.lead, sc.v);
      const { all, part, gift, help, no } = sc, v = { ...sc.v, lead };
      const lend = (s2, c, x, odds) => { const lent = spend(s2, x); c.arc.start("a_loan", { who, lent, odds }, 2 + c.rng.int(3)); };
      return {
        prompt: ctx.f("{lead}。要借嗎？", { lead }),
        options: [
          { id: "a_relativeLoan.all", label: all[0], hint: all[1], act: "lend", style: "family", weight: 0.3, apply: (s2, c) => { lend(s2, c, 0.45, 0.55); return { text: c.w(all[2], v), mood: 0 }; } },
          { id: "a_relativeLoan.part", label: part[0], hint: part[1], act: "lend", style: "safe", weight: 0.3, apply: (s2, c) => { lend(s2, c, 0.2, 0.75); return { text: c.w(part[2], v), mood: 0 }; } },
          { id: "a_relativeLoan.gift", label: gift[0], hint: gift[1], act: "donate", style: "family", weight: 0.1, apply: (s2, c) => { spend(s2, 0.08); return { text: c.w(gift[2], v), mood: 1 }; } },
          { id: "a_relativeLoan.help", label: help[0], hint: help[1], act: "seekHelp", style: "social", weight: 0.15, apply: (s2, c) => ({ text: c.w(help[2], v), mood: 0 }) },
          { id: "a_relativeLoan.no", label: no[0], hint: no[1], act: "insist", style: "self", weight: 0.15, apply: (s2, c) => ({ text: c.w(no[2], v), mood: -2 }) },
        ],
      };
    },
  },
  {
    // a_relativeLoan 借出去的錢，兩到四年後的結果。
    id: "a_loanReturn", domain: "wealth", channel: "good", when: (s, ctx) => ctx.arc.at("a_loan", "start"), p: () => 1,
    apply: (s, ctx) => {
      const a = s.arcs.a_loan.data, who = a.who;
      const back = ctx.roll("wealth", "good", a.odds);
      ctx.arc.end("a_loan", back ? "repaid" : "lost");
      if (back) {
        s.savings += a.lent;
        return { text: wordsAs(s, ctx, ["{who}把當年借的錢還你了，{還多帶了一盒伴手禮。|附上一張寫著「謝謝」的紙條。}", "當年借給{who}的錢，{who}{一次|分好幾次}還清了，{你們一起去吃了一頓飯。|你才發現自己早就不擔心了。}", "{who}的日子好轉了，{特地上門把錢還你，|把錢一分不少地還給你，}{還說謝謝你當年肯幫忙。|你們聊了一整個下午。}"], { who }), mood: 4 };
      }
      return { text: wordsAs(s, ctx, ["借給{who}的錢{過了好幾年|一直}沒有還，你{沒有再提，|只當作幫了一個忙，}{過年見面還是會打招呼。|心裡有點疙瘩，但不想為錢撕破臉。}", "{who}說錢還要再等等，{你知道那筆錢大概回不來了。|你嘆了一口氣，沒有再追問。}", "當年借給{who}的錢沒有回來，{你學會了以後只借自己捨得的數目。|你和{who}之間，好像多了一層薄薄的牆。}"], { who }), mood: -3 };
    },
  },

  // ---------- friends ----------
  {
    // 同學會，遇到當年喜歡的人或以前交往過的同學。溫和地收尾，不發展成新的感情。
    id: "a_reunion", domain: "love", channel: "change", ages: [30, 58], max: 1,
    when: s => !s.abroad && !!oldFlame(s), p: () => 0.03,
    choice: (s, ctx) => {
      const o = oldFlame(s);
      const who = o.kind === "ex" ? ctx.f("以前交往過的{name}", { name: o.name }) : o.name ? ctx.f("當年你偷偷喜歡的{name}", { name: o.name }) : "當年你偷偷喜歡的那個同學";
      const gap = o.at !== null && o.at !== undefined && s.age - o.at >= 5 ? ctx.f("{n} 年", { n: s.age - o.at }) : "好多年";
      const lead = ctx.f("{school}同學會上，{who}也來了", { school: o.school, who });
      const there = ctx.rng.pick(["台北", "台中", "高雄", "新竹", "國外"]), job2 = ctx.rng.pick(["老師", "工程師", "護理師", "公務員", "設計師", "開餐廳"]);
      const now = job2 === "開餐廳" ? (there === "國外" ? ctx.f("在國外開餐廳") : ctx.f("在{there}開餐廳", { there })) : there === "國外" ? ctx.f("在國外當{job2}", { job2 }) : ctx.f("在{there}當{job2}", { there, job2 });
      const p = married(s) ? s.partner.call : null;
      const v = { lead, now, p };
      return {
        prompt: ctx.f("{school}同學會，{gap}沒見的同學都來了，{who}也來了。要怎麼面對？", { school: o.school, gap, who }),
        options: [
          { id: "a_reunion.greet", label: "大方打招呼", hint: "聊聊近況", act: "socialize", style: "social", weight: 0.35, apply: (s2, c) => ({ text: c.w("{lead}。你走過去說了聲「好久不見」，{對方笑著說你一點都沒變。|兩個人聊起各自的工作和家人，}{原來對方現在{now}。|散場時{contact}，說有空再約大家出來。}", { ...v, contact: contactWord(s2) }), mood: 2 }) },
          { id: "a_reunion.past", label: "聊起當年", hint: "把那一頁輕輕翻過去", act: "talk", style: "social", weight: 0.2, apply: (s2, c) => { c.remember("a_reunion", o.name ? c.f("在同學會上和{name}把當年的事說開了", { name: o.name }) : "在同學會上和當年喜歡的同學把當年的事說開了", { mood: 2 }); return { text: o.kind === "ex" ? c.w("{lead}。你們聊起當年分手的事，{原來都只是太年輕。|彼此說了一句「對不起」，也說了一句「謝謝」。}{那一頁就這樣輕輕翻過去。|散場時，你覺得心裡很平靜。}", v) : c.w("{lead}。你笑著說出當年偷偷喜歡過對方，{對方愣了一下，說：「我那時候其實有感覺。」|對方大笑，說早就知道了。}{兩個人都笑了，那一頁就這樣輕輕翻過去。|你心裡那個十幾歲的自己，好像終於放下了。}", v), mood: 3 }; } },
          { id: "a_reunion.nod", label: "遠遠點個頭就好", hint: "過去的就讓它過去", act: "avoid", style: "safe", weight: 0.2, apply: (s2, c) => ({ text: c.w("{lead}。隔著兩桌，你們{點了點頭，|對看了一眼，}{散場時對方已經先走了。|就這樣過了一整晚。}{你心裡有一點空，又覺得這樣剛好。|有些人，放在記憶裡就好。}", v), mood: -1 }) },
          { id: "a_reunion.group", label: "把大家拉進群組", hint: "約好以後常聚", act: "socialize", style: "social", weight: 0.15, apply: (s2, c) => { const f = c.person({ role: "friend", sex: c.rng() < 0.5 ? "male" : "female", birthYear: s2.birthYear + c.rng.int(3) - 1, how: "同學" }); s2.friends.push(f); return { text: c.w("{lead}。你{made}，把大家都拉了進來，{老同學{fc}自告奮勇當下一屆的召集人。|和{fc}約好明年換{fta}來辦。}{說好以後每年聚一次。|那天大家拍了好多張合照。}", { ...v, made: s2.year >= 2011 ? "開了一個 LINE 群組" : "整理了一份通訊錄", fc: f.call, fta: pronoun(f) }), mood: 2 }; } },
          { id: "a_reunion.leave", label: p ? ctx.f("早點回家陪{p}", { p }) : "早點離開", hint: "見過就好", act: p ? "care" : "rest", style: "family", weight: 0.1, apply: (s2, c) => (p ? { text: c.w("{lead}。你打完招呼就先離開了，{回家的路上買了{p}愛吃的鹹酥雞。|到家時{p}問你好不好玩，你說：「大家都老了。」}", v), mood: 1 } : { text: c.w("{lead}。你坐了一會兒就先離開了，{在回家的路上聽了一首老歌。|那天晚上翻出了畢業紀念冊。}", v), mood: 0 }) },
        ],
      };
    },
  },
  {
    // 一般的同學會。
    id: "a_classReunion", ages: [30, 59], cooldown: 8, max: 2,   // later.js has the reunions from 60 on
    when: s => !s.abroad && s.edu !== "none" && s.last.a_reunion !== s.age, p: () => 0.03,
    apply: (s, ctx) => {
      // The schools this person finished, with the age they left, at least ten years ago.
      const schools = [["國小", 12]];
      if (s.edu !== "國小") schools.push(["國中", 15]);
      if (s.edu === "高職" || s.edu === "科大") schools.push(["高職", 18]);
      else if (s.edu === "高中" || UNI.includes(s.edu)) schools.push(["高中", 18]);
      if (s.edu === "五專") schools.push(["五專", 20]);
      if (UNI.includes(s.edu)) schools.push([s.edu === "科大" ? "科大" : "大學", 22]);
      const ends = schools.filter(([, end]) => s.age - end >= 10);
      const [school, end] = ends.length ? ctx.rng.pick(ends) : ["國小", 12];
      const n = Math.floor((s.age - end) / 5) * 5;
      const { f } = friendOf(s, ctx);
      return { text: wordsAs(s, ctx, [
        "{school}同學會，當年的{班長|風紀股長|最皮的那個同學}{變成了醫生，|當上了里長，|已經是三個孩子的爸媽，}{大家笑著互揭當年的糗事。|最後拍了一張全班大合照。}",
        "畢業 {n} 週年的{school}同學會，{大家的話題從考試變成了房貸和孩子。|你和{fc}坐在同一桌，好像又回到教室最後一排。}",
        "{school}同學會上，當年的導師也來了，{頭髮全白了，還記得你坐在哪個位子。|拿出一本舊點名簿，一個一個叫大家的名字。}",
      ], { school, fc: f.call }, { n }), mood: 2 };
    },
  },
  {
    // 好朋友離婚了。
    id: "a_friendDivorce", ages: [30, 60], cooldown: 8, max: 2, p: () => 0.025,
    apply: (s, ctx) => {
      const { f, fresh } = friendOf(s, ctx), n = f.call, fta = pronoun(f), who = fresh ? ctx.f("老朋友{n}", { n }) : n;
      f.a_divorced = true;
      return { text: wordsAs(s, ctx, [
        "{who}離婚了，半夜打電話給你，你們在{二十四小時營業的速食店|河堤邊|便利商店門口}聊到天亮。",
        "{who}離婚後搬回老家，你{{went}去幫{fta}搬家，|幫{fta}把箱子一箱一箱扛上樓，}{最後兩個人坐在紙箱上吃便當。|{n}說：「還好有你。」}",
        married(s) ? "{who}說要離婚了，你沒有多問，只是{約{fta}每週一起吃一次飯。|陪{fta}去爬了一趟山。}那天回家，你多看了{partner}一眼。" : "{who}說要離婚了，你沒有多問，只是{約{fta}每週一起吃一次飯，|陪{fta}去爬了一趟山，}{陪{fta}慢慢走出來。|讓{fta}知道身邊還有人。}",
      ], { who, n, fta, went: s.employed ? "請假" : "特地" }), mood: -1 };
    },
  },
  {
    // 好朋友創業，來找你；入股和作保的結果在 a_stakeResult。
    id: "a_friendStartup", domain: "career", channel: "change", ages: [30, 55], max: 1,
    when: s => !s.arcs.startup && !s.arcs.a_stake && !s.abroad, p: () => 0.025,
    choice: (s, ctx) => {
      const { f, fresh } = friendOf(s, ctx), n = f.call, fta = pronoun(f), who = fresh ? ctx.f("老朋友{n}", { n }) : n;
      const kind = ctx.f(ctx.rng.pick(byEra(s, [["貿易公司", "電子零件行", "補習班", "小吃店"], ["貿易公司", "電腦公司", "補習班", "咖啡店"], ["網路公司", "咖啡店", "設計工作室", "早午餐店"], ["App 新創", "手搖飲店", "網路商店", "選物店"], ["新創公司", "手搖飲店", "網路商店", "寵物用品店"]])));
      const lead = ctx.f("{who}辭職開了一間{kind}，找你一起幫忙", { who, kind });
      const stake = (s2, c, data) => c.arc.start("a_stake", { who: n, kind, ...data }, 3);
      const v = { lead, n, kind };
      return {
        prompt: ctx.f("{lead}。要怎麼支持？", { lead }),
        options: [
          { id: "a_friendStartup.stake", label: "出一點錢當小股東", hint: "賺了一起分，賠了也認", act: "invest", style: "risk", weight: 0.2, when: s2 => s2.savings >= 0.4, apply: (s2, c) => { const put = spend(s2, 0.3); stake(s2, c, { put }); return { text: c.w("{lead}。你拿出一筆錢當小股東，{開幕那天送了一個花籃過去，|在店門口和{n}拍了一張合照，}{{n}說：「不會讓你賠的。」|你告訴自己，就當是支持朋友。}", v), mood: 1 }; } },
          { id: "a_friendStartup.help", label: s.employed ? "下班去幫忙" : "去店裡幫忙", hint: "出力不出錢", act: "sideJob", style: "social", weight: 0.25, apply: (s2, c) => { stress(s2, 0.05); return { text: c.w("{lead}。你{when}去{n}的{kind}幫忙{記帳，|顧店，|跑業務，}{累，但看到客人越來越多很有成就感。|兩個人好像回到學生時代一起做報告的日子。}", { ...v, when: s2.employed ? "下班和週末" : "每天" }), mood: 2 }; } },
          { id: "a_friendStartup.refer", label: "幫忙介紹客人", hint: "用人脈支持", act: "seekHelp", style: "social", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}。你沒有出錢，而是把身邊的朋友都介紹過去，{{n}說你是最強的業務。|{promo}}", { ...v, promo: c.f(s2.year >= 2010 ? "還在網路上幫{fta}寫了一篇推薦。" : "還幫{fta}發了好幾百張傳單。", { fta }) }), mood: 2 }) },
          { id: "a_friendStartup.guarantee", label: "幫忙當保證人", hint: ctx.f("讓{fta}跟銀行借得到錢", { fta }), act: "lend", style: "family", weight: 0.05, apply: (s2, c) => { stake(s2, c, { put: 0, guarantor: true }); return { text: c.w("{lead}。{n}跟銀行借錢需要保證人，你在文件上簽了名，{{n}紅著眼眶說謝謝。|家人知道後念了你好幾天。}", v), mood: 0 }; } },
          { id: "a_friendStartup.decline", label: "婉拒，祝福對方", hint: "交情歸交情", act: "wait", style: "safe", weight: 0.25, apply: (s2, c) => ({ text: c.w("{lead}。你說自己不懂做生意，{開幕那天送了一盆花過去。|{cheer}}", { ...v, cheer: s2.year >= 2010 ? c.f("在{fta}的粉絲專頁按了讚，也介紹了幾個朋友去。", { fta }) : "介紹了幾個朋友去捧場。" }), mood: 0 }) },
        ],
      };
    },
  },
  {
    // a_friendStartup 入股或作保之後三年的結果。
    id: "a_stakeResult", domain: "wealth", channel: "good", when: (s, ctx) => ctx.arc.at("a_stake", "start"), p: () => 1,
    apply: (s, ctx) => {
      const a = s.arcs.a_stake.data, v = { n: a.who, kind: a.kind };
      if (a.guarantor) {
        const ok = ctx.roll("wealth", "good", 0.7);
        ctx.arc.end("a_stake", ok ? "fine" : "paid");
        if (ok) return { text: wordsAs(s, ctx, ["當年幫{n}作保的貸款還清了，{{n}特地請你吃了一頓飯。|{n}把銀行的結清證明拿給你看。}", "{n}的{kind}撐過來了，{貸款準時還完，|生意穩定下來，}{你心裡的大石頭終於放下。|你們舉杯，說這幾年不容易。}", "幫{n}作保的那筆貸款，{{n}一期都沒有遲繳，|最後一期繳完那天，{n}打電話給你，}{你才發現自己捏了好幾年的冷汗。|兩個人在電話兩頭都笑了。}"], v), mood: 3 };
        s.savings = Math.max(0, s.savings - 0.5);
        return { text: wordsAs(s, ctx, ["{n}的{kind}收掉了，貸款還不出來，銀行找上了當保證人的你，{你只好拿存款幫忙還。|你一邊還錢，一邊想起長輩說的「不要幫人作保」。}", "幫{n}作保的貸款出了問題，{你收到銀行的催繳單，|{n}躲了好一陣子，}{最後是你把剩下的錢還清的。|你和{n}好一陣子沒有說話。}", "{n}的{kind}沒有撐下去，{當保證人的你只好分期幫忙還，|你接到銀行電話的那天晚上一夜沒睡，}{後來{n}慢慢把錢還了一部分給你。|你學到了一課。}"], v), mood: -6 };
      }
      const ok = ctx.roll("wealth", "good", 0.4);
      ctx.arc.end("a_stake", ok ? "paid off" : "closed");
      if (ok) { s.savings += a.put * 2; return { text: wordsAs(s, ctx, ["當初入股{n}的{kind}賺錢了，{分紅比本金還多。|{n}親自把分紅送到你家。}", "{n}的{kind}越做越好，{年底你拿到第一筆分紅，|開了第二間店，}{你們約好每年一起吃尾牙。|你說當初沒看錯人。}", "{n}的{kind}撐過了最難的頭三年，{你當初投的錢翻了一倍。|生意穩定了，你拿回了本金還多一些。}"], v), mood: 5 }; }
      return { text: wordsAs(s, ctx, ["{n}的{kind}收掉了，你投的錢拿不回來，{還好友情還在。|{n}一直跟你說對不起。}", "{n}的{kind}撐了三年還是收了，{最後一天你去幫忙搬東西，|你們在空蕩蕩的店裡喝了一瓶啤酒，}{投的錢就當是陪朋友圓一個夢。|{n}說以後一定會還你。}", "當初入股{n}的{kind}，最後還是沒有做起來，{你把那筆錢當作學費。|{n}去找了一份工作，你們偶爾還是會約吃飯。}"], v), mood: -3 };
    },
  },
  {
    // 老朋友漸行漸遠。
    id: "a_driftApart", ages: [30, 60], cooldown: 8, max: 2, p: () => 0.035,
    apply: (s, ctx) => {
      const { f, fresh } = friendOf(s, ctx), n = f.call, fta = pronoun(f), who = fresh ? ctx.f("以前很要好的{n}", { n }) : n;
      f.bond = Math.max(0, (f.bond ?? 0.5) - 0.2);
      const t = ["以前無話不談的{n}，現在見面只剩{聊天氣和房價，|彼此孩子的近況，}{你們都忙，也都知道這樣很正常。|回家的路上，你有點想念以前的你們。}"];
      if (s.year < 1990) t.push("每年都會寄賀年卡給{who}，今年的卡片{只寫了短短一句「新年快樂」。|晚了一個月才寄到。}{你把卡片收進抽屜，想著有空要回一封長一點的信。|你想不起來上一次見面是什麼時候。}");
      else if (s.year < 2000) t.push("{who}搬家換了電話，你翻著通訊錄想打過去，{又不知道要說什麼。|撥到一半又掛掉了。}");
      else if (s.year < 2005) t.push("手機通訊錄裡，{who}的號碼還在，只是很久沒有打了。{你按下撥號鍵，又取消了。|你想不起來最後一次通電話是什麼時候。}");
      else if (s.year < 2011) t.push("MSN 上，{who}的名字{已經好幾年沒有亮過。|一直是離線。}{你點開對話框，打了幾個字又刪掉。|你想不起來最後一次聊天是什麼時候。}");
      else t.push("和{who}的 LINE 對話，停在{三|五}年前的「新年快樂」。{你看著{fta}的大頭貼換成了孩子的照片。|你按了一個讚，就沒有下文了。}");
      t.push("{生日|過年}的時候想起{who}，{{wish}|才發現已經好多年沒有見面了。}{有些朋友，就是這樣慢慢走散的。|你沒有怪誰，只是有點感傷。}");
      return { text: wordsAs(s, ctx, t, { n, who, fta, wish: s.year >= 2000 ? "你傳了一句祝福，對方隔了兩天才回。" : "你寄了一張卡片，對方過了很久才回。" }), mood: -1 };
    },
  },
];
