// 流年與大運的專業解讀，以及人生大事「為什麼在這個歲數」。
//
//   yearReading(chart, analysis, age)   one year of a simulated life: age 0 is the birth year (虛歲 1), the same key as
//                                       chart.years[age] and prep.luck[age]. The 大運 is the one whose 虛歲 range holds
//                                       age + 1; before the first one there is none (童限).
//   decadeReading(chart, analysis, i)   the i-th 大運 (chart.luck.decades[i])
//   eventReason(kind, reading, opts)    why an event fits this year: { short, why, basis, matched, direction }, or null
//                                       for a death. opts: { sex, direction, channel } (see eventReason).
//   yearTag(reading, { full })          「流年甲午（正財／七殺）・大運丁巳（七殺）」 for the status bar
//
// Everything a reading says comes from a signal { id, kind, tone, weight, domains, change, tags, text, short, notes }:
//   domains  how the signal moves each domain's level (summed and rounded to −2..2)
//   change   the domains it sets in motion (a move, a new job, a relationship that starts or ends)
//   tags     the event kinds it can explain (see KINDS); notes one clause per domain it speaks to
//   text     a bullet for the page; short a phrase for the story feed; lead the domains whose text it heads
// eventReason quotes only signals of the reading that speak to the event's domain and point the event's way, so every
// explanation can be traced to the chart. The ids (SIGNAL_FAMILIES) name the same things luck.js tilts by. Wording
// follows Taiwanese 命理 usage: the term first, then a few plain words; 凶 signals read 「要留意」「宜謹慎」 with the
// traditional remedy, never as a verdict. Readings are cached per chart and analysis: treat them as read-only.
import { pillarOf, groupOf, elementOf } from "./analysis.js";
import { luckRelations, luckStars, taisui, luckGods, elementRoles, natalStars, starContext, GOD_GROUP } from "./detail.js";
import { tr, trw, readingLang } from "./tr.js";
// English (README「英文版（翻譯層）」): every sentence goes through tr() and every lone word through trw(); the English
// is src/i18n/en/reading-year.json, the terms src/i18n/en/bazi-terms.json. The Chinese is exactly what it was. Text
// that is cut, joined or measured below is done the English way in English: sentences end in "." and are joined by a
// space, a signal's text starts with a capital, lengths allow for English being about 2.6 times longer.
const EN = () => readingLang() === "en";
const cap = s => (EN() && typeof s === "string" ? s.replace(/^(\W*)([a-z])/, (all, lead, ch) => lead + ch.toUpperCase()) : s);
const LIM = n => (EN() ? Math.round(n * 2.6) : n);
const SEMI = () => (EN() ? "; " : "；");
const unend = s => s.replace(EN() ? /\.$/ : /。$/, "");
// "Bing Wu (丙午)": a pillar's Chinese after its first mention in English.
const withZh = (text, zh) => (EN() ? text.replace(trw(zh), m => `${m} (${zh})`) : text);
// A list: 「甲、乙、丙」, "a, b and c".
const both = list => (list.length < 2 ? list[0] : tr("{yrFirst}、{yrSecond}", { yrFirst: list.slice(0, -1).join(EN() ? ", " : "、"), yrSecond: list[list.length - 1] }));
const PILLAR_ZH = { year: "年柱", month: "月柱", day: "日柱", hour: "時柱" };
const BRANCH_AT = { year: "年支{b}", day: "日支{b}", hour: "時支{b}" };
const STEM_AT = { year: "年干{s}", month: "月干{s}", hour: "時干{s}" };

// ---------- words ----------
const STEM_EL = { 甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水" };
const BRANCH_EL = { 子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火", 午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水" };
const ZODIAC = { 子: "鼠", 丑: "牛", 寅: "虎", 卯: "兔", 辰: "龍", 巳: "蛇", 午: "馬", 未: "羊", 申: "猴", 酉: "雞", 戌: "狗", 亥: "豬" };
const GENERATES = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const CONTROLS = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
// 五行對應的臟腑，傳統說法。
const ORGAN = { 木: "肝膽與筋骨", 火: "心血管與眼睛", 土: "脾胃與消化", 金: "肺、呼吸道與皮膚", 水: "腎與泌尿系統" };
// 墓庫：木庫未、火庫戌、金庫丑、水庫辰；土隨水火，辰戌都算土庫。
const KU = { 木: "未", 火: "戌", 金: "丑", 水: "辰", 土: "辰戌" };
const KU_OF = { 辰: "水", 戌: "火", 丑: "金", 未: "木" };
const MA = "寅申巳亥";   // 四馬之地
const KU_HOLDS = { 比劫: "手足與同輩的事", 食傷: "才華與表現的事", 財: "錢財", 官殺: "事業與責任的事", 印: "文書、房產與長輩的事" };
const ROLE_ZH = { year: "年", month: "月", day: "日", hour: "時" };
export const DOMAIN_NAME = { career: "事業", wealth: "財運", love: "感情", health: "健康", study: "學業", family: "家庭", move: "遷移" };
const DOMAINS = Object.keys(DOMAIN_NAME);
const GROUP_WORD = { 比劫: "比劫", 食傷: "食傷", 財: "財星", 官殺: "官殺", 印: "印星" };
const THEME = {
  adult: { 比劫: "同輩與競爭", 食傷: "才華與表現", 財: "錢財與成果", 官殺: "事業與責任", 印: "學習與貴人" },
  child: { 比劫: "兄弟與玩伴", 食傷: "玩心與才藝", 財: "家境與父親", 官殺: "規矩與管教", 印: "照顧與學習" },
  teen: { 比劫: "同儕與競爭", 食傷: "才藝與表現", 財: "家境與打工", 官殺: "課業與紀律", 印: "讀書與師長" },
  senior: { 比劫: "老友與手足", 食傷: "生活與興趣", 財: "財務與資產", 官殺: "責任與身體負擔", 印: "休養與心靈" },
};
const GOD_SHORT = { 比肩: "比肩主同輩", 劫財: "劫財主競爭", 食神: "食神主才華", 傷官: "傷官主創意", 偏財: "偏財主機會財", 正財: "正財主收入", 七殺: "七殺主壓力與權威", 正官: "正官主職位", 偏印: "偏印主專業與靈感", 正印: "正印主學業與貴人" };
const GOD_SHORT_KID = { 比劫: "比劫主兄弟玩伴", 食傷: "食傷主才藝", 財: "財星主家境", 官殺: "官殺主規矩管教", 印: "印星主照顧與學習" };
const GOD = {
  比肩: { theme: "比肩主同輩、朋友與自我主張", good: "朋友同事相挺，信心與行動力提升", bad: "同輩競爭多、主觀較強，合夥宜謹慎", mid: "和同輩、朋友的往來變多" },
  劫財: { theme: "劫財主競爭與破耗", good: "得朋友兄弟助力，敢衝敢做", bad: "花錢、借貸、作保容易出狀況，也要防衝動決定", mid: "人情與開銷變多" },
  食神: { theme: "食神主才華、表達與享受", good: "心情放鬆，作品與專業容易受肯定", bad: "付出多、精神容易疲倦，宜量力而為", mid: "想法與表現欲變多" },
  傷官: { theme: "傷官主創意、口才與突破", good: "點子多、表現亮眼，適合爭取表現機會", bad: "說話直、易與上司或體制起衝突，口舌要留意", mid: "敢說敢做，想突破現狀" },
  偏財: { theme: "偏財主機會財、投資與人脈", good: "業務、副業或投資有斬獲的機會", bad: "投機容易失手，錢來得快去得也快", mid: "錢財進出與應酬變多" },
  正財: { theme: "正財主正職收入與穩定的財", good: "努力有回報，收入穩定成長", bad: "為錢奔忙、開銷也大，宜守成", mid: "收入與支出都變多" },
  七殺: { theme: "七殺主壓力、挑戰與權威", good: "壓力化為動力，敢扛事、能掌權", bad: "壓力大、小人多，身心容易疲累", mid: "責任與壓力加重，也有突破的機會" },
  正官: { theme: "正官主職位、名聲與規範", good: "利升遷、考核，容易受上司肯定", bad: "規矩束縛多、上司要求嚴，宜按部就班", mid: "工作上的要求與責任變多" },
  偏印: { theme: "偏印主專業技術、靈感與偏門學問", good: "適合進修專業、鑽研技術", bad: "思慮多、易鑽牛角尖，計畫容易臨時改變", mid: "想法多、喜歡獨自鑽研" },
  正印: { theme: "正印主學業、文書、長輩照顧與名譽", good: "貴人長輩相助，利考試、證照與置產", bad: "依賴心重、想得多做得少，行動力下降", mid: "學習與文書的事變多" },
};
const st = s => `${s}${STEM_EL[s]}`;    // 甲木
const br = b => `${b}${BRANCH_EL[b]}`;  // 子水
// A natal branch or stem by its pillar: 「月令寅木」「日支丑土」「時干戊土」「日主辛金」, or the decade's.
const branchAt = (R, b) => (R === "month" ? tr("月令{b}", { b: br(b) }) : R === "decade" ? tr("大運{b}", { b: br(b) }) : tr(BRANCH_AT[R], { b: br(b) }));
const stemAt = (R, s) => (R === "day" ? tr("日主{s}", { s: st(s) }) : R === "decade" ? tr("大運{s}", { s: st(s) }) : tr(STEM_AT[R], { s: st(s) }));
const stageOf = age => (age < 12 ? "child" : age < 18 ? "teen" : age < 65 ? "adult" : "senior");
const grown = stage => stage === "adult" || stage === "senior";
const round2 = x => Math.round(x * 100) / 100;
const clampLevel = x => (x >= 1.5 ? 2 : x >= 0.5 ? 1 : x <= -1.5 ? -2 : x <= -0.5 ? -1 : 0);
const end = s => (EN() ? (/[.!?…]$/.test(s) ? s : `${s}.`) : /[。！？]$/.test(s) ? s : `${s}。`);
const joinNotes = list => (EN() ? list.map(end).join(" ") : end(list.join("；")));

// ---------- the chart, once ----------
const cache = new WeakMap();
function contextOf(chart, analysis) {
  let byAnalysis = cache.get(chart);
  if (!byAnalysis) cache.set(chart, (byAnalysis = new WeakMap()));
  // One context per language: the cached readings hold their text.
  let byLang = byAnalysis.get(analysis);
  if (!byLang) byAnalysis.set(analysis, (byLang = {}));
  const lang = readingLang();
  let c = byLang[lang];
  if (c) return c;
  const natal = chart.pillars.map(p => ({ role: p.role, name: p.name, stem: p.stem.name, branch: p.branch.name, stemEl: p.stem.element, branchEl: p.branch.element, stemGod: p.stem.god, branchGod: p.branch.god }));
  const byRole = Object.fromEntries(natal.map(n => [n.role, n]));
  // Where each ten god stands out in the chart: the stems (透干) and the month branch (月令).
  const shown = natal.filter(n => n.role !== "day").map(n => ({ god: n.stemGod, where: stemAt(n.role, n.stem), el: n.stemEl }));
  shown.push({ god: byRole.month.branchGod, where: branchAt("month", byRole.month.branch), el: byRole.month.branchEl });
  c = {
    chart, analysis, names: natal.map(n => n.name), natal, byRole, shown,
    sex: chart.input.sex === "female" ? "female" : "male",
    dayStem: chart.dayMaster.name, dm: chart.dayMaster.element, dayYang: chart.dayMaster.yang,
    roles: elementRoles(analysis), favor: analysis.favor, useful: analysis.useful[0] || null, avoid: analysis.avoid[0] || null,
    weak: analysis.strength === "身弱" || analysis.strength === "從弱",
    // 從格 and 專旺 like the opposite of what 身弱／身強 would, so the wording of 祿、刃 and 比劫 follows the strength itself.
    strength: analysis.strength, kind: analysis.special ? analysis.special.kind : null,
    stars: natalStars(chart), starCtx: starContext(chart), years: new Map(), decades: new Map(),
    yearBranch: byRole.year.branch, zodiac: ZODIAC[byRole.year.branch],
  };
  byLang[lang] = c;
  return c;
}
const fav = (c, e) => c.favor[e] || 0;
// 中和 charts lean one way only a little: they are 「日主能任」「日主偏強／偏弱」, not 身強／身弱.
const canTake = c => (c.strength === "中和" ? tr("日主能任") : tr("身強能任"));
const good = (c, e) => fav(c, e) >= 0.25;
const bad = (c, e) => fav(c, e) <= -0.25;
const markOf = v => (v >= 0.25 ? "喜" : v <= -0.25 ? "忌" : "平");
const roleSay = (c, e) => (c.roles[e] === "閒神" ? tr("{el}為閒神，影響不大", { el: e }) : tr("{el}是你的{role}", { el: e, role: c.roles[e] }));
const sideOf = (c, e) => (good(c, e) ? "good" : bad(c, e) ? "bad" : "mid");

function pillarInfo(c, name) {
  const p = pillarOf(name), g = luckGods(c.dayStem, name);
  return { name, stem: p.stem, branch: p.branch, stemEl: p.stemEl, branchEl: p.branchEl, yang: p.yang, gods: { stem: g.stem, branch: g.branch }, hidden: g.hidden };
}

function signal(id, o) {
  const notes = o.notes || {};
  if (EN()) for (const k of Object.keys(notes)) notes[k] = cap(notes[k]);
  const s = { id, kind: o.kind, tone: o.tone || "中", weight: o.weight || 3, domains: o.domains || {}, change: o.change || [], tags: o.tags || [], text: cap(end(o.text)), short: cap(o.short), notes };
  if (o.shorts) { s.shorts = o.shorts; if (EN()) for (const k of Object.keys(s.shorts)) s.shorts[k] = cap(s.shorts[k]); }
  if (o.headline) s.headline = cap(o.headline);
  if (o.point === false) s.point = false;
  if (o.context) s.context = true;
  if (o.amplify) s.amplify = o.amplify;
  if (o.only) s.only = o.only;
  if (o.bit) s.bit = o.bit;
  if (o.lead && o.lead.length) s.lead = o.lead;
  if (o.element) s.element = o.element;
  return s;
}

// ---------- 十神 ----------
// One signal per ten-god group the pillar brings (stem, and the branch's main hidden stem), as luck.js groups them.
function godSignals(c, W) {
  const P = W.P, parts = [
    { part: "stem", god: P.gods.stem, el: P.stemEl },
    { part: "branch", god: P.gods.branch, el: P.branchEl },
  ];
  const groups = new Map();
  for (const x of parts) {
    const g = GOD_GROUP[x.god];
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(x);
  }
  return [...groups].map(([group, xs]) => godSignal(c, W, group, xs));
}

function godLabel(W, xs) {
  const P = W.P, dec = W.mode !== "flow";
  if (xs.length === 2) {
    return xs[0].god === xs[1].god
      ? tr(dec ? "大運{name}干支皆{god}" : "{name}干支皆{god}", { name: P.name, god: xs[0].god })
      : tr(dec ? "大運{s}{god}、{b}{god2}" : "{s}{god}、{b}{god2}", { s: st(P.stem), god: xs[0].god, b: br(P.branch), god2: xs[1].god });
  }
  return xs[0].part === "stem" ? tr(dec ? "大運{s}{god}透干" : "{s}{god}透干", { s: st(P.stem), god: xs[0].god }) : tr(dec ? "大運{b}{god}坐支" : "{b}{god}坐支", { b: br(P.branch), god: xs[0].god });
}

function godSignal(c, W, group, xs) {
  const el = xs[0].el, side = sideOf(c, el), isGood = side === "good", isBad = side === "bad";
  const gods = [...new Set(xs.map(x => x.god))], god = gods[0], both = gods.length > 1;
  const lbl = godLabel(W, xs), say = roleSay(c, el), stage = W.stage, sex = c.sex, now = W.now;
  const sign = isGood ? 1 : isBad ? -1 : 0;
  const tone = isGood ? "吉" : isBad ? "凶" : "中";
  const notes = {}, domains = {}, change = [], tags = [], shorts = {};
  let theme = both ? null : tr(GOD[god].theme), core = both ? null : tr(GOD[god][side]), extra = "";
  switch (group) {
    case "官殺": {
      const sha = gods.includes("七殺"), guan = gods.includes("正官");
      if (both) { theme = tr("正官七殺同現（官殺並見），責任與壓力同時湧來"); core = isGood ? (c.weak ? tr("官殺為喜，權責加重而能擔當") : tr("{take}，權責一起加重", { take: canTake(c) })) : isBad ? tr("壓力與規矩兩頭夾，宜量力而為") : tr("工作上的責任加重"); }
      if (stage === "child") { theme = tr("官殺對孩子來說是規矩與管教"); core = tr("學校、家裡的要求變多"); }
      else if (stage === "teen") core = tr("考試與師長的要求變多，{how}", { how: isGood ? tr("壓力反而成為動力") : tr("容易感到緊繃") });
      notes.career = stage === "child" ? tr("{lbl}：規矩與管教變多，學校、家裡的要求比較嚴", { lbl })
        : stage === "teen" ? tr("{lbl}：考試與師長的要求變多，{how}", { lbl, how: isGood ? tr("壓力反而成為動力") : tr("容易感到緊繃，宜調整步調") })
          : tr("{lbl}，{say}：{what}", { lbl, say, what: isGood ? (sha && !guan ? tr("敢扛事、能掌權，有突破與升遷的機會") : tr("利升遷、考核，容易受上司肯定")) : isBad ? tr("責任與壓力偏重，宜量力而為、避免和上司硬碰硬") : tr("工作上責任加重，有壓力也有機會") });
      domains.career = grown(stage) ? 0.6 * sign : 0.2 * sign;
      change.push("career");
      tags.push(...(isGood ? ["promotion", "job"] : isBad ? ["conflict", "jobLoss", "job"] : ["job", "promotion"]));
      shorts.career = lbl;
      if (sex === "female" && stage !== "child") {
        notes.love = stage === "teen" ? tr("官殺是女命的異性緣星，容易有心儀或追求的對象")
          : stage === "senior" ? tr("官殺是女命的夫星，與老伴的相處被引動")
            : both ? tr("官殺並見，追求者多、感情容易複雜，宜專一")
              : guan ? tr("正官是女命的夫星，{now}被引動，感情容易有進展、利論及婚嫁", { now })
                : tr("七殺是女命的偏夫星，異性緣與情緣被引動，但對象可能較強勢，宜看清楚");
        domains.love = both ? -0.2 : guan ? 0.6 : 0.3;
        change.push("love");
        tags.push(guan && !both ? "marriage" : "romance");
        shorts.love = both ? tr("官殺並見，追求者多") : guan ? tr("正官夫星透出") : tr("七殺情緣星被引動");
        extra = guan && !both ? tr("女命正官是夫星，感情也被引動") : tr("女命官殺是夫星，感情也被引動");
      }
      if (sex === "male" && grown(stage)) {
        notes.family = stage === "senior" ? tr("男命官殺為子女星，子孫晚輩的事被引動") : tr("男命官殺為子女星，添丁或和孩子有關的事被引動");
        domains.family = 0.2;
        change.push("family");
        tags.push("children");
        shorts.family = tr("官殺子女星被引動");
        extra = extra || tr("男命官殺為子女星，和孩子的緣分被引動");
      }
      if (sha && isBad) {
        notes.health = tr("{lbl}且為忌神，壓力直接衝著自己，容易疲累、睡不好，宜多休息", { lbl });
        domains.health = -0.4;
        tags.push("health");
        shorts.health = tr("{lbl}，壓力衝著自己", { lbl });
      }
      if (stage === "teen" || (stage === "adult" && W.age < 24)) notes.study = tr("官殺代表考試與紀律，{how}", { how: isGood ? tr("有壓力也有動力，利拚考試") : tr("考試壓力偏重，宜按部就班準備") });
      break;
    }
    case "財": {
      const zheng = gods.includes("正財"), pian = gods.includes("偏財");
      if (both) { theme = tr("正偏財並見，財源多元"); core = isGood ? tr("財源多、收入有成長") : isBad ? tr("錢財進出大，開銷也多") : tr("錢財進出變多"); }
      if (isBad && c.weak && grown(stage)) core = tr("{core}（財多身弱）", { core });
      if (stage === "child") { theme = tr("財星對孩子來說代表父親與家境（偏財為父）"); core = isGood ? tr("家境較寬裕") : isBad ? tr("家中開銷較大") : tr("家境平穩"); }
      notes.wealth = stage === "child" ? tr("{lbl}：財星代表家境與父親，{how}", { lbl, how: isGood ? tr("家境較寬裕") : isBad ? tr("家中開銷較大") : tr("家境平穩") })
        : stage === "teen" ? (isBad ? tr("{lbl}：零用錢與打工的機會變多，花費也大", { lbl }) : tr("{lbl}：零用錢與打工的機會變多", { lbl }))
          : tr("{lbl}，{say}：{what}", { lbl, say, what: isGood ? (pian && !zheng ? tr("業務、副業或投資有斬獲的機會") : tr("努力有回報，正職收入穩定成長")) : isBad ? tr("{why}，投資宜保守、量入為出", { why: c.weak ? tr("財多身弱，為錢奔忙") : tr("錢財進出大") }) : tr("錢財進出變多，量入為出即可") });
      domains.wealth = grown(stage) ? (isGood ? 0.9 : isBad ? -0.6 : 0.1) : 0.3 * sign;
      change.push("wealth");
      tags.push(...(isGood ? ["gain"] : isBad ? ["loss"] : ["gain", "loss"]));
      shorts.wealth = isGood ? tr("{lbl}，財星為喜", { lbl }) : isBad ? tr("{lbl}，財星為忌", { lbl }) : lbl;
      if (sex === "male" && stage !== "child") {
        notes.love = stage === "teen" ? tr("財星是男命的異性緣星，容易有心儀的對象")
          : stage === "senior" ? tr("財星是男命的妻星，與老伴的相處被引動")
            : both ? tr("正偏財並見，異性緣旺，感情宜專一")
              : zheng ? tr("正財是男命的妻星，{now}被引動，感情容易有進展、利論及婚嫁", { now })
                : tr("偏財是男命的情緣星，異性緣變好，交往機會多");
        domains.love = zheng && !both ? 0.6 : 0.3;
        change.push("love");
        tags.push(zheng && !both ? "marriage" : "romance");
        shorts.love = zheng && !both ? tr("正財妻星透出") : tr("偏財情緣星被引動");
        extra = tr("男命財星也是妻星，感情容易有進展");
      }
      if (pian) {
        notes.family = tr("偏財也是父親星，{how}", { how: isGood ? tr("父親的助力多") : tr("和父親有關的事被引動，宜多關心父親") });
        tags.push("father");
        shorts.family = tr("偏財父親星被引動");
      }
      if (grown(stage)) notes.career = tr("財星主實際成果，工作以業績、收入為重");
      break;
    }
    case "印": {
      const zheng = gods.includes("正印");
      if (both) { theme = tr("正偏印並見，學習與思考的一年"); core = isGood ? tr("貴人與學習運都好") : isBad ? tr("想得多、做得少，宜設定期限推進") : tr("學習與文書的事變多"); }
      if (stage === "child") { theme = tr("印星代表長輩照顧與學習"); core = isGood ? tr("長輩照顧周到，學習有進步") : tr("長輩管得多，學習要多鼓勵"); }
      notes.study = stage === "child" ? tr("{lbl}：利學習，長輩的照顧與栽培多", { lbl })
        : stage === "senior" ? tr("{lbl}：適合培養興趣，親近宗教或心靈課程", { lbl })
          : tr("{lbl}，{say}：{what}", { lbl, say, what: isGood ? tr("利讀書、考試、證照與進修") : isBad ? tr("學習機會多但心思容易散，宜定下目標") : tr("適合安排進修與學習") });
      domains.study = isGood ? 0.8 : isBad ? -0.3 : 0.2;
      tags.push("study", isBad ? "examRisk" : "exam");
      shorts.study = isGood ? tr("{lbl}，印星為喜", { lbl }) : lbl;
      notes.family = zheng ? tr("正印是母親星，{how}", { how: isGood ? tr("母親的照顧與支持多") : tr("和母親有關的事被引動，宜多關心母親") }) : tr("偏印也代表長輩，家中長輩的事被引動");
      domains.family = 0.2 * sign;
      change.push("family");
      tags.push("mother");
      shorts.family = zheng ? tr("正印母親星被引動") : tr("偏印長輩星被引動");
      if (grown(stage)) {
        notes.wealth = tr("印也代表房產與文書，{how}", { how: isGood ? tr("置產、簽約的機會多") : tr("房產與合約文書要細看") });
        change.push("wealth");
        tags.push("home");
        shorts.wealth = tr("{lbl}，印主房產文書", { lbl });
        notes.career = tr("{lbl}：{how}", { lbl, how: isGood ? tr("有長官前輩提攜，利考取證照、升等") : tr("宜按部就班，靠資歷與專業取勝") });
        if (isGood) tags.push("helper");
      }
      if (isGood) { notes.health = tr("印星護身，身心較能休養"); domains.health = 0.2; }
      break;
    }
    case "食傷": {
      const shi = gods.includes("食神"), shang = gods.includes("傷官");
      if (both) { theme = tr("食神傷官並見，想法多、表現欲強"); core = isGood ? tr("才華與創意都能發揮") : isBad ? tr("付出多、說話也直，宜收斂") : tr("表現欲變強"); }
      if (stage === "child") { theme = tr("食傷對孩子來說是玩心、才藝與表達"); core = shang ? tr("比較有主見、愛頂嘴") : tr("適合多元學習、多表現"); }
      notes.career = stage === "child" ? (shang ? tr("{lbl}：玩心與才藝並進，適合多元學習；也比較有主見", { lbl }) : tr("{lbl}：玩心與才藝並進，適合多元學習", { lbl }))
        : stage === "teen" ? (shang ? tr("{lbl}：才藝表現與叛逆心並存，適合發展專長", { lbl }) : tr("{lbl}：才藝表現與興趣並存，適合發展專長", { lbl }))
          : tr("{lbl}，{say}：{what}", { lbl, say, what: isGood ? (shang ? tr("點子多、表現亮眼，適合爭取表現機會") : tr("專業與作品容易受肯定")) : isBad ? (shang ? tr("說話直、易與上司或體制起衝突，宜收斂鋒芒") : tr("付出多、回收慢，宜量力而為")) : tr("表現欲強、想法多，適合發揮專業") });
      domains.career = grown(stage) ? 0.4 * sign : 0;
      tags.push(...(isGood ? (shang ? ["startup", "jobChange"] : ["job", "startup"]) : isBad && shang ? ["conflict", "jobLoss"] : ["jobChange"]));
      shorts.career = shang ? tr("{lbl}，想突破現狀", { lbl }) : tr("{lbl}，才華有發揮", { lbl });
      notes.study = shi ? tr("{lbl}：學習有興趣、表達好", { lbl }) : tr("{lbl}：聰明但不耐規矩，考試宜多下工夫", { lbl });
      domains.study = shi ? 0.2 * (sign || 1) : -0.1;
      if (sex === "female" && grown(stage)) {
        notes.family = stage === "senior" ? tr("女命食傷為子女星，子孫晚輩的事被引動") : tr("女命食傷為子女星，添丁或和孩子有關的事被引動");
        domains.family = 0.2;
        change.push("family");
        tags.push("children");
        shorts.family = tr("食傷子女星被引動");
        extra = tr("女命食傷為子女星，和孩子的緣分被引動");
      }
      if (shi) { notes.health = isGood ? tr("食神主口福與放鬆，身心較舒坦") : tr("食神主口福，飲食與作息宜節制"); domains.health = isGood ? 0.2 : 0; }
      if (grown(stage)) {
        notes.wealth = tr("食傷是財之源，{how}", { how: isGood ? tr("靠專業與手藝賺錢") : tr("花在興趣與享受的錢變多") });
        if (isGood) tags.push("gain");
      }
      break;
    }
    case "比劫": {
      const jie = gods.includes("劫財");
      if (both) { theme = tr("比肩劫財並見，同輩與競爭是主題"); core = isGood ? tr("朋友同輩相挺") : isBad ? tr("競爭與開銷都多") : tr("人際往來變多"); }
      if (isGood && c.weak) core = tr("身弱得助，{core}", { core });
      if (stage === "child") { theme = tr("比劫對孩子來說是兄弟姊妹與玩伴"); core = tr("和同學朋友的互動變多"); }
      notes.wealth = stage === "child" ? tr("{lbl}：兄弟姊妹與玩伴的事多，東西常要和人分享", { lbl })
        : stage === "teen" ? tr("{lbl}：同儕影響大，花在朋友身上的錢變多", { lbl })
          : tr("{lbl}，{say}：{what}", { lbl, say, what: isGood ? tr("得朋友同輩相助，適合合作") : isBad ? (jie ? tr("劫財主破耗，競爭與開銷都多，借貸、作保、合夥宜謹慎") : tr("競爭與開銷都多，借貸、作保、合夥宜謹慎")) : tr("人情開銷變多") });
      domains.wealth = grown(stage) ? (isGood ? 0.3 : isBad ? -0.6 : -0.2) : 0;
      if (isBad) tags.push("loss");
      notes.family = tr("比劫是兄弟姊妹星，{how}", { how: isGood ? tr("手足之間互相扶持") : isBad ? tr("也容易為錢或家事起爭執") : tr("和兄弟姊妹的互動變多") });
      change.push("family");
      tags.push("siblings");
      shorts.family = tr("比劫手足星被引動");
      shorts.wealth = isBad ? tr("{lbl}，競爭與破耗多", { lbl }) : lbl;
      if (grown(stage) && (isGood || isBad)) notes.career = isGood ? tr("同事朋友相挺，適合團隊合作") : tr("同輩競爭多，功勞容易被分走，宜把成果留下紀錄");
      if (isGood) { notes.health = c.kind === "從強" ? tr("從強喜比劫順勢，精神與體力較好") : c.strength === "專旺" ? tr("專旺喜比劫順勢，精神與體力較好") : c.strength === "中和" ? tr("日主略偏弱，得比劫幫身，精神與體力較好") : tr("身弱得比劫幫身，精神與體力較好"); domains.health = 0.2; }
      break;
    }
    default: break;
  }
  const text = extra ? tr("{lbl}（{say}）：{theme}，{core}；{extra}", { lbl, say, theme, core, extra }) : tr("{lbl}（{say}）：{theme}，{core}", { lbl, say, theme, core });
  return signal(`god.${group}`, { kind: "god", tone, weight: 4, domains, change, tags, text, short: lbl, shorts, notes, point: false });
}

// ---------- 喜忌 (the year's base line) ----------
function favorSignal(c, W) {
  const P = W.P, fs = fav(c, P.stemEl), fb = fav(c, P.branchEl), ms = markOf(fs), mb = markOf(fb);
  const kid = W.stage === "child";
  const godBit = kid
    ? (GOD_GROUP[P.gods.stem] === GOD_GROUP[P.gods.branch] ? tr(GOD_SHORT_KID[GOD_GROUP[P.gods.stem]]) : tr("{godA}、{godB}", { godA: tr(GOD_SHORT_KID[GOD_GROUP[P.gods.stem]]), godB: tr(GOD_SHORT_KID[GOD_GROUP[P.gods.branch]]) }))
    : (P.gods.stem === P.gods.branch ? tr(GOD_SHORT[P.gods.stem]) : tr("{godA}、{godB}", { godA: tr(GOD_SHORT[P.gods.stem]), godB: tr(GOD_SHORT[P.gods.branch]) }));
  const roleBit = P.stemEl === P.branchEl ? tr("{el}為{role}", { el: P.stemEl, role: c.roles[P.stemEl] })
    : c.roles[P.stemEl] === c.roles[P.branchEl] ? tr("{el}、{el2}都是{role}", { el: P.stemEl, el2: P.branchEl, role: c.roles[P.stemEl] })
      : tr("{el}為{role}、{el2}為{role2}", { el: P.stemEl, role: c.roles[P.stemEl], el2: P.branchEl, role2: c.roles[P.branchEl] });
  const span = W.mode === "flow" ? [tr("上半年"), tr("下半年"), tr("流年天干管上半年、地支管下半年")] : [tr("前五年"), tr("後五年"), tr("大運前五年重天干、後五年重地支")];
  let verdict;
  if (ms === "喜" && mb === "喜") verdict = W.mode === "flow" ? tr("干支皆為喜用，是順勢而為的一年") : tr("干支皆為喜用，是一步向上的好運");
  else if (ms === "喜" && mb === "忌") verdict = tr("傳統上{rule}，{first}較順，{second}宜守成", { rule: span[2], first: span[0], second: span[1] });
  else if (ms === "忌" && mb === "喜") verdict = tr("傳統上{rule}，{first}阻力較多，{second}漸入佳境", { rule: span[2], first: span[0], second: span[1] });
  else if (ms === "忌" && mb === "忌") verdict = W.mode === "flow" ? tr("干支皆忌，這一年阻力較大，宜守不宜攻") : tr("干支皆忌，十年裡宜穩紮穩打、多累積實力");
  else if (ms === "喜" || mb === "喜") verdict = tr("喜用得力，整體小吉");
  else if (ms === "忌" || mb === "忌") verdict = tr("略有阻力，宜穩健行事");
  else verdict = tr("喜忌平和，以穩為主");
  // 干支的生剋：同氣、相生，或蓋頭（天干剋地支）、截腳（地支剋天干）讓喜用打折。
  let flowBit = "";
  if (P.stemEl === P.branchEl) flowBit = tr("干支同氣，力量集中");
  else if (CONTROLS[P.stemEl] === P.branchEl && mb === "喜") flowBit = tr("但天干剋地支（蓋頭），地支的喜用力量打折");
  else if (CONTROLS[P.branchEl] === P.stemEl && ms === "喜") flowBit = tr("但地支剋天干（截腳），天干的喜用力量打折");
  else if (GENERATES[P.stemEl] === P.branchEl) flowBit = tr("干生支，氣勢順");
  else if (GENERATES[P.branchEl] === P.stemEl) flowBit = tr("支生干，根基穩");
  const vars = { s: st(P.stem), gs: P.gods.stem, b: br(P.branch), gb: P.gods.branch, godBit, roleBit, verdict, flowBit };
  const text = flowBit ? tr("天干{s}{gs}、地支{b}{gb}（{godBit}），{roleBit}：{verdict}；{flowBit}", vars) : tr("天干{s}{gs}、地支{b}{gb}（{godBit}），{roleBit}：{verdict}", vars);
  const score = (fs + fb) / 2;
  const short = tr(ms === "喜" && mb === "喜" ? "干支皆為喜用" : ms === "忌" && mb === "忌" ? "干支皆忌" : ms === "喜" ? "天干為喜" : mb === "喜" ? "地支為喜" : ms === "忌" ? "天干為忌" : mb === "忌" ? "地支為忌" : "喜忌平和");
  const headline = ms === "喜" && mb === "喜" ? (W.mode === "flow" ? tr("干支皆為喜用，整體順勢") : tr("干支皆為喜用，運勢向上"))
    : ms === "喜" && mb === "忌" ? tr("天干為喜、地支為忌，{first}較順", { first: span[0] })
      : ms === "忌" && mb === "喜" ? tr("天干為忌、地支為喜，先難後易")
        : ms === "忌" && mb === "忌" ? tr("干支皆忌，宜守不宜攻")
          : ms === "喜" || mb === "喜" ? tr("喜用得力，小吉")
            : ms === "忌" || mb === "忌" ? tr("略有阻力，宜穩健")
              : tr("喜忌平和，以穩為主");
  return signal("favor", { kind: "favor", tone: score >= 0.25 ? "吉" : score <= -0.25 ? "凶" : "中", weight: 7, text, short, headline, context: true });
}

// ---------- 刑沖合害 ----------
const PUNISH_MEANING = { 無恩之刑: "好心未必有好報，人際宜留分寸", 恃勢之刑: "容易固執、仗勢起衝突", 無禮之刑: "言語容易失禮、起口角", 自刑: "容易自尋煩惱、鑽牛角尖" };
const punishMeaning = name => (PUNISH_MEANING[name] ? tr(PUNISH_MEANING[name]) : "");
const BRANCH_ORDER = ["六沖", "六合", "相刑", "自刑", "六害", "半合", "拱合", "相破"];
const KIND_ID = { 六沖: "clash", 六合: "combine", 相刑: "punish", 自刑: "punish", 六害: "harm", 半合: "half", 拱合: "arch", 相破: "break" };
const KIND_VERB = { 六沖: "沖", 六合: "合", 相刑: "刑", 自刑: "自刑", 六害: "害", 相破: "破" };
// 「相刑又相害」: the minor contacts that come with the main one.
function alsoBit(kinds, main) {
  const rest = BRANCH_ORDER.filter(k => k !== main && kinds.has(k) && KIND_VERB[k]);
  return rest.length ? tr("{mainVerb}中帶{restVerbs}", { mainVerb: KIND_VERB[main].replace("自刑", "刑"), restVerbs: both(rest.map(k => trw(KIND_VERB[k].replace("自刑", "刑")))) }) : "";
}

// The meaning of an element combination (半合、三合…) by the ten-god group it forms.
function formedBit(c, el, W) {
  const g = groupOf(c.dm, el), side = sideOf(c, el), kid = W.stage === "child";
  const M = {
    財: { good: kid ? "家境與父親的助力被引動" : "財源被引動，利收入", bad: kid ? "家中開銷變大" : "錢財進出大，宜守", mid: "錢財進出變多" },
    官殺: { good: kid ? "學校的表現被看見" : "事業上的機會被引動", bad: kid ? "規矩與管教偏嚴" : "壓力與責任變重", mid: "工作上的責任變多" },
    印: { good: "貴人與學習運被引動", bad: "想得多、行動慢", mid: "學習與文書的事變多" },
    食傷: { good: "才華與表現被引動", bad: "付出多、容易疲累", mid: "表現欲變強" },
    比劫: { good: "朋友同輩相助", bad: "競爭與開銷變多", mid: "人際往來變多" },
  };
  return { group: g, side, text: tr("{el}是你的{group}（{role}），{meaning}", { el, group: GROUP_WORD[g], role: c.roles[el], meaning: tr(M[g][side]) }) };
}
const FORMED = {   // domain and tags for each ten-god group an element combination forms
  財: { domain: "wealth", good: ["gain"], bad: ["loss"] },
  官殺: { domain: "career", good: ["promotion", "job"], bad: ["conflict"] },
  印: { domain: "study", good: ["study", "exam", "home"], bad: ["examRisk"] },
  食傷: { domain: "career", good: ["startup", "job"], bad: [] },
  比劫: { domain: "wealth", good: ["siblings"], bad: ["loss", "siblings"] },
};

// The relations between the focus pillar (流年, or the 大運 in a decade reading) and one other pillar, read as one
// contact: 反吟 and 伏吟 first, then the strongest branch relation, then the stems.
// The domain whose text a contact on this palace leads: 夫妻宮 for love, 月令 for career (a child's family), 時柱 for
// an adult's children.
const palaceLead = (other, stage) => {
  const young = stage === "child" || stage === "teen";
  if (other === "day") return stage === "child" ? ["health"] : ["love"];
  if (other === "month") return young ? ["family"] : ["career"];
  if (other === "hour") return young ? [] : ["family"];
  return [];
};

function pairSignals(c, W, other, list) {
  const out = [], P = W.P, kinds = new Set(list.map(r => r.kind)), kid = W.stage === "child", adult = grown(W.stage);
  const N = other === "decade" ? W.D : c.byRole[other];
  if (!N) return out;
  const me = W.mode === "flow" ? br(P.branch) : tr("大運{b}", { b: br(P.branch) });
  const at = branchAt(other, N.branch);
  const flowYear = W.mode === "flow";
  // 年支 contacts are 犯太歲 in a year reading (taisuiSignals); only the combinations stay here.
  const yearTaisui = flowYear && other === "year";
  const offended = yearTaisui && taisui(c.yearBranch, P.branch).kinds.length > 0;
  const nEl = BRANCH_EL[N.branch];
  const nRole = c.roles[nEl];
  // The natal branch's element: a clash on 用神 hurts, a clash on 忌神 clears the way.
  const usefulHit = other !== "decade" && c.useful === nEl;
  const qual = other === "decade" ? "" : good(c, nEl) ? tr("{b}是你的{role}，被沖宜多留意", { b: br(N.branch), role: nRole }) : bad(c, nEl) ? tr("{b}為{role}，沖去反有轉機", { b: br(N.branch), role: nRole }) : "";
  const qualShift = other === "decade" ? 0 : good(c, nEl) ? -0.2 : bad(c, nEl) ? 0.3 : 0;
  const stemBit = () => (CONTROLS[P.stemEl] === STEM_EL[N.stem] ? tr("{s}剋{t}", { s: st(P.stem), t: st(N.stem) }) : tr("{s}剋{t}", { s: st(N.stem), t: st(P.stem) }));
  const span = W.mode === "flow" ? tr("今年") : tr("這十年");

  if (kinds.has("反吟") && !yearTaisui) {
    const head = W.mode === "flow"
      ? (other === "decade" ? tr("流年{p}與大運{n}天剋地沖（歲運相戰）", { p: P.name, n: N.name }) : tr("流年{p}與{pillar}{n}天剋地沖（反吟）", { p: P.name, pillar: PILLAR_ZH[other], n: N.name }))
      : tr("大運{p}與{pillar}{n}天剋地沖（反吟）", { p: P.name, pillar: PILLAR_ZH[other], n: N.name });
    const how = tr("{stemBit}、{me}沖{at}", { stemBit: stemBit(), me, at });
    const o = { kind: "rel", tone: "凶", change: [], notes: {}, domains: {}, tags: [], shorts: {}, lead: palaceLead(other, W.stage) };
    if (other === "day") {
      o.weight = 10;
      o.text = kid ? tr("{head}：{how}，日柱代表自身，身體與生活環境容易有變動，照顧上要多費心", { head, how }) : tr("{head}：{how}，身體、婚姻、居所都容易變動，是{span}最需要穩住的地方，大事宜緩", { head, how, span });
      o.notes = kid ? { health: tr("{head}，身體與作息要多照顧", { head }), move: tr("生活環境也容易變動") }
        : { health: tr("{head}，身體要多照顧，傳統上宜多休息、定期檢查", { head }), love: tr("{head}，夫妻宮動盪，相處上宜多包容", { head }), move: tr("天剋地沖日柱，日支也代表居所，住處容易變動"), family: tr("天剋地沖日柱，家中容易有波折"), wealth: tr("天剋地沖日柱，財務上起伏大，宜保守") };
      o.domains = kid ? { health: -0.8 } : { health: -0.8, love: -0.8, family: -0.4, wealth: -0.4 };
      o.change = ["love", "move"];
      o.tags = ["illness", "health", "spouseClash", "spouseMove", "upheaval", "move"];
      o.headline = kid ? tr("與日柱天剋地沖，身體與環境宜多照顧") : tr("與日柱天剋地沖（反吟），身體、婚姻、居所宜穩");
    } else if (other === "month") {
      o.weight = 9;
      o.text = tr("{head}：{how}，月柱是父母宮也是事業根基，{what}", { head, how, what: kid ? tr("父母的工作或家宅容易有大變動") : tr("工作與家宅容易有大變動，也要多關心父母") });
      o.notes = { career: tr("{head}，事業根基大動，換工作、轉換跑道的機會大", { head }), family: tr("天剋地沖月柱，月柱是父母宮，宜多關心父母"), move: tr("天剋地沖月柱，家宅也容易變動") };
      if (kid) delete o.notes.career;
      o.domains = { career: kid ? 0 : -0.7, family: -0.5 };
      o.change = ["career", "move", "family"];
      o.tags = ["jobChange", "jobLoss", "parents", "move", "upheaval", "retire"];
      o.headline = tr("與月柱天剋地沖（反吟），工作與家宅宜穩");
    } else if (other === "hour") {
      o.weight = adult ? 8 : 5;
      o.text = adult ? tr("{head}：{how}，時柱是子女宮與晚年，也主晚輩與部屬，相關的事容易大起大落，宜多溝通陪伴", { head, how }) : tr("{head}：{how}，時柱主志向與將來，興趣與計畫容易大變", { head, how });
      o.notes = adult ? { family: tr("{head}，子女宮動盪，子女晚輩的事容易起伏", { head }), career: tr("天剋地沖時柱，時柱也主部屬與晚輩，團隊人事容易變動") } : { study: tr("天剋地沖時柱，時柱主志向與將來，興趣與計畫容易大變") };
      o.domains = adult ? { family: -0.5, career: -0.2 } : {};
      o.change = ["family"];
      o.tags = adult ? ["childrenCare"] : [];
      o.headline = adult ? tr("與時柱天剋地沖（反吟），子女與晚輩之事宜多照應") : tr("與時柱天剋地沖（反吟），計畫容易大變");
    } else if (other === "year") {
      o.weight = 7;
      o.text = tr("{head}：{how}，年柱主祖上與長輩，和家族、長輩有關的事容易有大變動，也常有離鄉發展的機會", { head, how });
      o.notes = { family: tr("{head}，年柱主祖上與長輩，宜多關心家中長輩", { head }), move: tr("天剋地沖年柱，容易離鄉發展、遷居") };
      o.domains = { family: -0.4 };
      o.change = ["move", "family"];
      o.tags = ["elders", "move", "abroad", "upheaval"];
      o.headline = tr("與年柱天剋地沖（反吟），長輩與家族之事宜多照應");
    } else {
      o.weight = 8;
      o.text = tr("{head}：十年運勢中的轉折年，起伏大，大事宜三思而後行", { head });
      o.notes = { career: tr("{head}，工作上變動大，宜穩不宜躁", { head }), wealth: tr("歲運相戰，財務起伏大，投資宜保守"), health: tr("歲運相戰，體力與作息要多照顧"), move: tr("歲運相戰，生活環境也容易變動") };
      o.domains = { career: -0.5, wealth: -0.4, health: -0.4 };
      o.change = ["career", "move"];
      o.tags = ["upheaval", "jobChange", "move", "illness"];
      o.headline = tr("與大運天剋地沖（歲運相戰），大事宜三思");
    }
    if (qual) o.text = tr("{text}。{qual}", { text: o.text, qual });
    o.short = other === "decade" ? tr("與大運{n}天剋地沖（反吟）", { n: N.name }) : tr("與{pillar}{n}天剋地沖（反吟）", { pillar: PILLAR_ZH[other], n: N.name });
    o.shorts = { health: o.short, love: o.short, career: o.short, family: o.short, move: o.short, wealth: o.short };
    out.push(signal(`rel.fanyin.${other}`, o));
    out.push(...clashExtras(c, W, other, N, me, at, usefulHit));
    const bits = out.slice(1).filter(z => z.bit).map(z => z.bit);
    if (bits.length) out[0].text = cap(end(tr("{text}；{bits}", { text: unend(out[0].text), bits: bits.join(SEMI()) })));
    return out;
  }

  if ((kinds.has("伏吟") || kinds.has("歲運並臨")) && !yearTaisui) {
    if (other === "decade") {
      const sc = (fav(c, P.stemEl) + fav(c, P.branchEl)) / 2;
      const text = tr("流年與大運同為{p}（歲運並臨）：吉凶都會被放大，{how}", { p: P.name, how: sc >= 0.25 ? tr("好運更旺，宜積極把握") : sc <= -0.25 ? tr("起伏更大，宜穩健保守、大事三思") : tr("宜穩健行事") });
      out.push(signal("rel.suiyun", { kind: "rel", tone: sc >= 0.25 ? "吉" : sc <= -0.25 ? "凶" : "中", weight: 9.5, text, short: tr("流年與大運同為{p}（歲運並臨）", { p: P.name }), headline: tr("歲運並臨，起伏放大"), amplify: 1.3, change: ["career", "move"], tags: ["upheaval"], notes: { career: tr("歲運並臨，工作上的起落都會被放大"), wealth: tr("歲運並臨，財務上的進出也被放大"), health: sc <= -0.25 ? tr("歲運並臨又逢忌神，體力與作息宜多照顧") : tr("歲運並臨，宜量力而為") } }));
      return out;
    }
    const head = W.mode === "flow" ? tr("流年{p}與{pillar}相同（伏吟）", { p: P.name, pillar: PILLAR_ZH[other] }) : tr("大運{p}與{pillar}相同（伏吟）", { p: P.name, pillar: PILLAR_ZH[other] });
    const o = { kind: "rel", tone: "凶", notes: {}, domains: {}, tags: [], change: [], lead: palaceLead(other, W.stage) };
    if (other === "day") {
      o.weight = kid ? 5 : 8;
      o.text = kid ? tr("{head}：伏吟主反覆，情緒較悶、小病容易反覆，照顧上多費心", { head }) : tr("{head}：伏吟主反覆、呻吟，身體、感情與自己的事容易舊事重演，心情也較沉悶，宜放慢步調", { head });
      o.notes = kid ? { health: tr("{head}，小病容易反覆", { head }) } : { health: tr("{head}，身體的老毛病容易反覆，宜多休息", { head }), love: tr("{head}，夫妻之間的舊問題容易重提", { head }), family: tr("伏吟日柱，家中的事容易反覆"), wealth: tr("伏吟日柱，財務上進展較慢，宜保守") };
      o.domains = kid ? { health: -0.4 } : { health: -0.5, love: -0.4, family: -0.3, wealth: -0.3 };
      o.tags = ["illness", "health", "spouseClash"];
      o.headline = tr("與日柱伏吟，舊事容易重演");
    } else if (other === "month") {
      o.weight = 6;
      o.text = tr("{head}：{what}", { head, what: kid ? tr("家中的舊事重提，宜多耐心") : tr("工作與家中的舊事重提，進展較慢，宜耐心處理") });
      o.notes = { career: tr("{head}，工作上進展較慢、舊事重提", { head }), family: tr("伏吟月柱，家中長輩的舊事重提，溝通多一點耐心") };
      if (kid) delete o.notes.career;
      o.domains = { career: kid ? 0 : -0.4, family: -0.3 };
      o.tags = ["parents"];
      o.headline = tr("與月柱伏吟，工作與家中進展較慢");
    } else if (other === "year") {
      o.weight = 4;
      o.text = tr("{head}：長輩與家族的舊事容易重提，宜多耐心", { head });
      o.notes = { family: tr("{head}，長輩與家族的舊事容易重提", { head }) };
      o.domains = { family: -0.2 };
      o.tags = ["elders"];
      o.headline = tr("與年柱伏吟，家族舊事重提");
    } else {
      o.weight = adult ? 4.5 : 3;
      o.text = tr("{head}：{what}", { head, what: adult ? tr("子女晚輩的事反覆，計畫容易拖延") : tr("計畫與興趣容易反覆") });
      o.notes = adult ? { family: tr("{head}，子女晚輩的事容易反覆", { head }) } : { study: tr("{head}，計畫與興趣容易反覆", { head }) };
      o.domains = adult ? { family: -0.3 } : {};
      o.tags = adult ? ["childrenCare"] : [];
      o.headline = tr("與時柱伏吟，計畫容易拖延");
    }
    o.short = tr("與{pillar}伏吟", { pillar: PILLAR_ZH[other] });
    out.push(signal(`rel.fuyin.${other}`, o));
    return out;
  }

  // Branch contacts.
  const main = BRANCH_ORDER.find(k => kinds.has(k));
  if (main && !offended && !(yearTaisui && ["六沖", "相刑", "自刑", "六害", "相破"].includes(main))) {
    const also = alsoBit(kinds, main);
    const rel = list.find(r => r.kind === main);
    out.push(...branchSignal(c, W, other, N, main, rel, { me, at, also, qual, qualShift, usefulHit }));
  }
  // Stem contacts.
  if (kinds.has("天干五合")) out.push(stemCombineSignal(c, W, other, N, list.find(r => r.kind === "天干五合")));
  if (kinds.has("天干相沖") && !(yearTaisui && kinds.has("反吟"))) out.push(stemClashSignal(c, W, other, N));
  return out;
}

// A clash also opens a 庫 (辰戌丑未), moves a 驛馬 (寅申巳亥), or hits the 用神: separate signals, said inside the
// clash's own bullet.
function clashExtras(c, W, other, N, me, at, usefulHit) {
  const out = [], P = W.P, stage = W.stage, young = stage === "child" || stage === "teen";
  if (other === "decade") return out;
  const caiEl = elementOf(c.dm, "財");
  if (KU_OF[N.branch]) {
    if (KU[caiEl].includes(N.branch)) {
      const isGood = good(c, caiEl), whose = young ? "家中財務" : "財務";
      out.push(signal("combo.沖開財庫", {
        kind: "combo", tone: "中", weight: 6, point: false, change: ["wealth"], domains: { wealth: isGood ? 0.3 : -0.3 },
        tags: young ? [] : ["gain", "loss", "home"],
        text: `沖開財庫：${me}沖${at}，${N.branch}是你的財庫（${KU_OF[N.branch]}庫），${whose}大進大出：有進財機會，也容易有大筆支出，宜事先規劃`,
        short: `${me}沖開財庫`, bit: `沖開財庫，${whose}大進大出`,
        notes: { wealth: young ? `${me}沖${at}，沖開財庫，家中財務大進大出` : `${me}沖${at}，沖開財庫：財務大進大出，有進財機會，也容易有購屋、投資之類的大筆支出` },
      }));
    } else {
      const kuEl = KU_OF[N.branch], g = groupOf(c.dm, kuEl), holds = KU_HOLDS[g];
      out.push(signal("combo.墓庫逢沖", {
        kind: "combo", tone: "中", weight: 3, point: false, change: [FORMED[g].domain],
        text: `墓庫逢沖：${me}沖${at}，${N.branch}是${kuEl}庫，藏著你的${GROUP_WORD[g]}，${holds}容易被引動、有變化`,
        short: `${me}沖開${N.branch}庫`, bit: `${N.branch}為${kuEl}庫，${holds}被引動`,
        notes: { [FORMED[g].domain]: `${me}沖${at}，${N.branch}是${kuEl}庫，${holds}容易被引動` },
      }));
    }
  }
  if (MA.includes(N.branch)) {
    const natalMa = (c.stars[other] || []).includes("驛馬");
    const go = stage === "child" ? "搬家、轉學、出遠門的機會多" : stage === "teen" ? "轉學、搬家、出遠門的機會多" : stage === "senior" ? "出遊、搬遷、換環境的機會多" : "主遠行、搬遷、換環境，出國、外派或調動的機會大";
    out.push(signal("combo.驛馬逢沖", {
      kind: "combo", tone: "中", weight: 5, point: false, change: ["move", "career"], domains: {},
      tags: stage === "adult" ? ["move", "abroad", "jobChange"] : ["move", "abroad"],
      text: `驛馬逢沖：${me}沖${at}（寅申巳亥為驛馬之地${natalMa ? "，命局的驛馬被沖動" : ""}），${go}`,
      short: `${me}沖動驛馬`, bit: "寅申巳亥相沖，驛馬也被沖動",
      notes: { move: `${me}沖${at}，驛馬逢沖，${go.replace(/^主/, "")}`, ...(stage === "adult" ? { career: "驛馬動也主調動、外派或換跑道" } : {}) },
    }));
  }
  if (usefulHit) {
    const e = BRANCH_EL[N.branch];
    out.push(signal("combo.用神受沖", {
      kind: "combo", tone: "凶", weight: 7, point: false, lead: ["health"], domains: { health: -0.6, career: grown(stage) ? -0.2 : 0, wealth: grown(stage) ? -0.2 : 0 },
      tags: grown(stage) ? ["illness", "health", "jobLoss", "loss"] : ["illness", "health"],
      text: `用神受沖：${at}是你的用神，被${W.mode === "flow" ? "流年" : "大運"}${br(P.branch)}沖動，整體的穩定度下降，身體與計畫都宜保守`,
      short: `用神${br(N.branch)}被${br(P.branch)}沖動`,
      notes: { health: `用神${br(N.branch)}被${br(P.branch)}沖動，${W.mode === "flow" ? "這一年" : "這十年"}身體的抵抗力較弱，傳統上對應${ORGAN[e]}，宜多休息、定期檢查`, ...(grown(stage) ? { career: "用神受沖，計畫容易生變，宜保守", wealth: "用神受沖，財務計畫容易生變，投資宜保守" } : {}) },
    }));
  }
  return out;
}

function branchSignal(c, W, other, N, main, rel, x) {
  const out = [], kid = W.stage === "child", teen = W.stage === "teen", senior = W.stage === "senior";
  const { me, at, also, qual, qualShift, usefulHit } = x;
  const head = (verb, palace) => `${me}${verb}${at}${palace ? `（${palace}${also ? `，${also}` : ""}）` : also ? `（${also}）` : ""}`;
  const o = { kind: "rel", notes: {}, domains: {}, tags: [], change: [], shorts: {}, lead: main === "相破" ? [] : palaceLead(other, W.stage) };
  const id = `rel.${KIND_ID[main]}.${other}`;
  const shift = (d, k = 1) => { o.domains[d] = (o.domains[d] || 0) + qualShift * k; };
  switch (main) {
    case "六沖": {
      o.tone = "中";
      if (other === "day") {
        o.weight = kid ? 6 : 8.5;
        o.text = kid ? `${head("沖", "日支主自身")}：作息、身體與生活環境容易有變化，搬家、轉學的機會也多`
          : teen ? `${head("沖", "日支主自身，也是將來的夫妻宮")}：心情與人際容易變動，也容易有心動的對象；作息與住處容易有變化`
            : senior ? `${head("沖", "夫妻宮受沖")}：與老伴的相處容易有摩擦，宜多體諒；日支也代表自身與居所，作息與住處容易有變化`
              : `${head("沖", "夫妻宮受沖")}：感情與相處模式容易變動，單身者反而容易遇到新對象；日支也代表自身與居所，作息與住處容易有變化`;
        if (!kid) o.notes.love = teen ? `${me}沖日支${br(N.branch)}（將來的夫妻宮），感情上容易有新的心動，也容易起波折` : senior ? `${me}沖日支${br(N.branch)}，夫妻宮受沖，與老伴相處宜多體諒` : `${me}沖日支${br(N.branch)}，夫妻宮受沖：感情與相處模式容易變動，單身者有新緣分，有伴者宜多溝通`;
        o.notes.move = kid ? `${me}沖日支${br(N.branch)}，搬家、轉學的機會多` : `日支也代表居所，${me}沖${br(N.branch)}，住處容易變動`;
        o.notes.health = kid ? `${me}沖日支${br(N.branch)}，作息與身體容易有變化，照顧上多費心` : `${me}沖日支${br(N.branch)}，日支也代表自身，作息與身體要多照顧`;
        o.domains = kid ? { health: -0.3 } : { love: -0.6, health: -0.3 };
        o.change = ["love", "move"];
        o.tags = kid ? ["move", "health"] : ["spouseMove", "spouseClash", "move", "health"];
        o.short = kid ? `${me}沖日支${br(N.branch)}` : `${me}沖日支${br(N.branch)}，夫妻宮受沖`;
        o.shorts = { move: `${me}沖日支${br(N.branch)}，居所易動`, health: `${me}沖日支${br(N.branch)}（日支主自身）` };
        o.headline = kid ? `${me}沖日支，作息與環境有變` : `${me}沖日支，夫妻宮有動`;
        shift(kid ? "health" : "love");
      } else if (other === "month") {
        o.weight = 8;
        o.text = kid ? `${head("沖", "父母宮受沖")}：父母的工作或家中環境容易變動`
          : teen ? `${head("沖", "父母宮受沖")}：讀書環境與家中容易變動，轉學、搬家的機會多，也要多關心父母`
            : senior ? `${head("沖", "父母宮、事業根基受沖")}：退休生活與家宅容易有變動，宜穩不宜躁`
              : `${head("沖", "父母宮、事業根基受沖")}：工作環境容易變動，換工作、調職的機會多，也要多關心父母`;
        if (!kid && !teen) o.notes.career = `${me}沖${at}（沖提綱），事業根基動搖，換工作、調職、轉換跑道的機會多`;
        if (teen) o.notes.study = `${me}沖${at}，讀書環境與作息容易變動`;
        o.notes.family = kid ? `${me}沖${at}，父母的工作或家中環境容易變動` : `月柱是父母宮，${me}沖${br(N.branch)}，宜多關心父母`;
        o.notes.move = `${me}沖${at}，家宅也容易變動`;
        o.domains = { career: kid || teen ? 0 : -0.5, family: -0.4 };
        o.change = ["career", "move", "family"];
        o.tags = ["jobChange", "jobLoss", "parents", "move", "retire"];
        o.short = `${me}沖${at}，事業根基受沖`;
        o.shorts = { family: `${me}沖${at}，父母宮受沖`, move: `${me}沖${at}，家宅易動` };
        o.headline = kid ? `${me}沖月令，家中環境有變` : `${me}沖月令，工作與家宅有動`;
        shift(kid || teen ? "family" : "career");
      } else if (other === "hour") {
        o.weight = kid ? 4 : 6.5;
        o.text = kid || teen ? `${head("沖")}：時柱主志向與將來，興趣與計畫容易變動` : `${head("沖", "子女宮受沖")}：時柱主子女、晚輩與晚年，相關的事容易起伏，宜多溝通陪伴`;
        if (kid || teen) o.notes.study = `${me}沖${at}，時柱主志向與將來，興趣與計畫容易變動`;
        else {
          o.notes.family = `${me}沖${at}，子女宮受沖：子女、晚輩的事容易起伏，宜多溝通陪伴`;
          o.notes.career = `${me}沖${at}，時柱也主部屬與晚輩，團隊人事容易變動`;
        }
        o.domains = kid || teen ? {} : { family: -0.4, career: -0.1 };
        o.change = ["family"];
        o.tags = kid || teen ? [] : ["childrenCare", "retire"];
        o.short = kid || teen ? `${me}沖${at}` : `${me}沖${at}，子女宮受沖`;
        o.headline = kid || teen ? `${me}沖時支，計畫容易變動` : `${me}沖時支，子女與晚輩之事宜多照應`;
        if (!kid && !teen) shift("family");
      } else if (other === "year") {
        o.weight = 6;
        o.text = `${head("沖", "年柱受沖")}：年柱主祖上與長輩，和家族、長輩的緣分容易變動，也常有離鄉發展的機會`;
        o.notes = { family: `${me}沖${at}，年柱主祖上與長輩，宜多關心家中長輩`, move: `${me}沖${at}，容易離鄉發展、遷居` };
        o.domains = { family: -0.3 };
        o.change = ["move", "family"];
        o.tags = ["elders", "move", "abroad"];
        o.short = `${me}沖${at}，年柱受沖`;
        o.headline = `${me}沖年支，長輩與家族之事有變`;
      } else {
        o.weight = 6.5;
        o.text = `流年${me}沖大運${br(N.branch)}（歲運相沖）：十年的運勢在這一年起伏特別大，大事宜穩不宜躁`;
        o.notes = { career: `流年${me}沖大運${br(N.branch)}（歲運相沖），工作上宜穩不宜躁`, wealth: "歲運相沖，財務上大進大出，宜保守", move: "歲運相沖，生活環境容易變動" };
        o.domains = { career: -0.3, wealth: -0.3, health: -0.2 };
        o.change = ["career", "move"];
        o.tags = ["upheaval", "jobChange", "move"];
        o.short = `流年${me}沖大運${br(N.branch)}（歲運相沖）`;
        o.headline = "歲運相沖，大事宜穩";
      }
      if (qual) o.text = `${o.text}。${qual}`;
      out.push(signal(id, o));
      out.push(...clashExtras(c, W, other, N, me, at, usefulHit));
      const bits = out.slice(1).filter(z => z.bit).map(z => z.bit);
      if (bits.length) out[0].text = end(`${out[0].text.replace(/。$/, "")}；${bits.join("；")}`);
      return out;
    }
    case "六合": {
      const el = rel.element;
      const elBit = good(c, el) ? `合出的${el}正是你的${c.roles[el]}` : bad(c, el) ? `合出的${el}是你的${c.roles[el]}，合中帶阻` : "";
      const k = good(c, el) ? 0.2 : bad(c, el) ? -0.2 : 0;
      o.tone = bad(c, el) ? "中" : "吉";
      if (other === "day") {
        o.weight = kid ? 3.5 : 7;
        o.text = kid ? `${head("合", `合${el}`)}：心情穩定、人緣好`
          : teen ? `${head("合", `合${el}`)}：人緣好，容易有心儀的對象`
            : senior ? `${head("合", `夫妻宮逢合，合${el}`)}：與老伴相處融洽，家中和樂`
              : `${head("合", `夫妻宮逢合，合${el}`)}：感情容易有進展，利交往、論及婚嫁，夫妻相處也較融洽`;
        if (!kid) o.notes.love = teen ? `${me}合日支${br(N.branch)}，人緣好，容易有心儀的對象` : senior ? `${me}合日支${br(N.branch)}，夫妻宮逢合，與老伴相處融洽` : `${me}合日支${br(N.branch)}，夫妻宮逢合：感情容易有進展，利交往、論及婚嫁`;
        o.domains = kid ? {} : { love: 0.7 + k };
        o.change = ["love"];
        o.tags = kid ? [] : ["marriage", "romance"];
        o.short = kid ? `${me}合日支${br(N.branch)}` : `${me}合日支${br(N.branch)}，夫妻宮逢合`;
        o.headline = kid ? `${me}合日支，人緣好` : `${me}合日支，夫妻宮逢合`;
      } else if (other === "month") {
        o.weight = 5.5;
        o.text = kid || teen ? `${head("合", `父母宮逢合，合${el}`)}：家中和順，父母的照顧多` : `${head("合", `父母宮、事業根基逢合，合${el}`)}：工作上容易有合作與穩定的機會，與父母相處也和順`;
        if (!kid && !teen) o.notes.career = `${me}合${at}，月令逢合：工作上容易有合作、貴人與穩定的機會`;
        o.notes.family = `月柱是父母宮，${me}合${br(N.branch)}，與父母相處和順`;
        o.domains = { career: kid || teen ? 0 : 0.4 + k, family: 0.3 };
        o.tags = ["job", "helper", "home"];
        o.short = `${me}合${at}，月令逢合`;
        o.headline = kid ? `${me}合月令，家中和順` : `${me}合月令，工作有合作與貴人`;
      } else if (other === "hour") {
        o.weight = kid ? 2.5 : 4.5;
        o.text = kid || teen ? `${head("合", `合${el}`)}：興趣與計畫有著落` : `${head("合", `子女宮逢合，合${el}`)}：利添丁，和子女晚輩的關係融洽`;
        if (!kid && !teen) o.notes.family = `${me}合${at}，子女宮逢合：利添丁，和子女晚輩的關係融洽`;
        o.domains = kid || teen ? {} : { family: 0.4 };
        o.change = ["family"];
        o.tags = kid || teen ? [] : ["birth", "children"];
        o.short = kid || teen ? `${me}合${at}` : `${me}合${at}，子女宮逢合`;
        o.headline = kid || teen ? `${me}合時支，計畫有著落` : `${me}合時支，利添丁`;
      } else if (other === "year") {
        o.weight = 4;
        o.text = `${head("合", W.mode === "flow" ? "合太歲" : `合${el}`)}：和長輩、家族的關係和順，傳統上主貴人多`;
        o.notes.family = `${me}合${at}，與長輩、家族的關係和順`;
        o.domains = { family: 0.3, career: kid ? 0 : 0.2 };
        o.tags = ["helper"];
        o.short = `${me}合${at}${W.mode === "flow" ? "（合太歲）" : ""}`;
        o.headline = `${me}合年支，長輩緣佳`;
      } else {
        o.weight = 4.5;
        o.text = `流年${me}合大運${br(N.branch)}（歲運相合，合${el}）：十年的主題在這一年順勢發展`;
        o.notes.career = `流年${me}合大運${br(N.branch)}（歲運相合），十年的主題在這一年順勢發展`;
        o.domains = { career: 0.3 + k };
        o.tags = ["helper"];
        o.short = `流年${me}合大運${br(N.branch)}（歲運相合）`;
        o.headline = "歲運相合，順勢發展";
      }
      if (elBit) o.text = `${o.text}。${elBit}`;
      out.push(signal(id, o));
      return out;
    }
    case "相刑":
    case "自刑": {
      const name = rel.name || (main === "自刑" ? "自刑" : "");
      const meaning = PUNISH_MEANING[name] || "";
      const verb = main === "自刑" ? "自刑" : `刑`;
      const what = main === "自刑" ? `${me}與${at}自刑` : `${me}刑${at}（${name}${also ? `，${also}` : ""}）`;
      o.tone = "凶";
      if (other === "day") {
        o.weight = kid ? 3.5 : 5.5;
        o.text = kid ? `${what}：情緒容易起伏，也要防小傷` : `${what}，夫妻宮逢刑：與伴侶容易互相挑剔、意見不合，${meaning}；刑也主小傷與手術，身體要多留意`;
        if (!kid) o.notes.love = `${what}，夫妻宮逢刑：與伴侶容易互相挑剔、意見不合`;
        o.notes.health = kid ? `${what}，要防小傷` : `${what}，刑也主小傷與手術，身體要多留意`;
        o.domains = kid ? { health: -0.2 } : { love: -0.4, health: -0.2 };
        o.tags = kid ? ["injury"] : ["spouseClash", "injury", "health"];
        o.short = kid ? what : `${what}，夫妻宮逢刑`;
        o.headline = kid ? `${me}${verb}日支，防小傷` : `${me}${verb}日支，夫妻宮逢刑`;
      } else if (other === "month") {
        o.weight = 4.5;
        o.text = `${what}：${kid ? "家中規矩多，與父母容易起摩擦" : `工作上多摩擦，合約與規章要細看，${meaning}`}`;
        if (!kid && !teen) o.notes.career = `${what}，工作上多摩擦，合約與規章要細看`;
        o.notes.family = `${what}，父母宮逢刑，宜多關心父母、溝通多一點耐心`;
        o.domains = { career: kid || teen ? 0 : -0.4, family: -0.2 };
        o.tags = ["conflict", "jobLoss", "parents"];
        o.short = what;
        o.headline = `${me}${verb}月令，工作多摩擦`;
      } else if (other === "hour") {
        o.weight = 3.5;
        o.text = `${what}：${kid || teen ? "計畫容易卡關" : "子女晚輩的事多操心"}`;
        if (!kid && !teen) o.notes.family = `${what}，子女晚輩的事多操心`;
        o.domains = kid || teen ? {} : { family: -0.3 };
        o.tags = kid || teen ? [] : ["childrenCare"];
        o.short = what;
        o.headline = `${me}${verb}時支，晚輩之事多操心`;
      } else if (other === "year") {
        o.weight = 3.5;
        o.text = `${what}：與長輩之間容易起摩擦，${meaning}`;
        o.notes.family = `${what}，與長輩之間容易起摩擦`;
        o.domains = { family: -0.2 };
        o.tags = ["elders"];
        o.short = what;
      } else {
        o.weight = 4;
        o.text = `流年${me}刑大運${br(N.branch)}：做事容易卡關、多波折，${meaning}`;
        o.notes.career = `流年${me}刑大運${br(N.branch)}，做事容易卡關、多波折`;
        o.domains = { career: -0.3 };
        o.tags = ["conflict"];
        o.short = `流年${me}刑大運${br(N.branch)}`;
      }
      out.push(signal(id, o));
      return out;
    }
    case "六害": {
      const what = `${me}害${at}${also ? `（${also}）` : ""}`;
      o.tone = "凶";
      if (other === "day") {
        o.weight = kid ? 3 : 5.5;
        o.text = kid ? `${what}：和玩伴容易有小摩擦` : `${what}，夫妻宮逢害：害主暗中不和，與伴侶容易有說不出口的心結，宜多溝通`;
        if (!kid) o.notes.love = `${what}，夫妻宮逢害：與伴侶容易有說不出口的心結，宜多溝通`;
        o.domains = kid ? {} : { love: -0.4 };
        o.tags = kid ? [] : ["spouseClash"];
        o.short = kid ? what : `${what}，夫妻宮逢害`;
        o.headline = kid ? `${me}害日支，人際小摩擦` : `${me}害日支，夫妻之間宜多溝通`;
      } else if (other === "month") {
        o.weight = 4;
        o.text = `${what}：${kid ? "與父母之間容易有誤會" : "工作上要防小人暗中掣肘，與父母之間也容易有誤會"}`;
        if (!kid && !teen) o.notes.career = `${what}，工作上要防小人暗中掣肘`;
        o.notes.family = `${what}，與父母之間容易有誤會，宜多關心、多溝通`;
        o.domains = { career: kid || teen ? 0 : -0.3, family: -0.1 };
        o.tags = ["conflict"];
        o.short = what;
        o.headline = `${me}害月令，防小人`;
      } else if (other === "hour") {
        o.weight = 3.5;
        o.text = `${what}：${kid || teen ? "計畫容易受阻" : "和子女晚輩之間容易有誤會，宜多傾聽"}`;
        if (!kid && !teen) o.notes.family = `${what}，和子女晚輩之間容易有誤會`;
        o.domains = kid || teen ? {} : { family: -0.3 };
        o.tags = kid || teen ? [] : ["childrenCare"];
        o.short = what;
      } else if (other === "year") {
        o.weight = 3;
        o.text = `${what}：與長輩之間容易有誤會`;
        o.notes.family = `${what}，與長輩之間容易有誤會`;
        o.domains = { family: -0.1 };
        o.tags = ["elders"];
        o.short = what;
      } else {
        o.weight = 3.5;
        o.text = `流年${me}害大運${br(N.branch)}：做事容易有暗阻`;
        o.notes.career = `流年${me}害大運${br(N.branch)}，做事容易有暗阻`;
        o.domains = { career: -0.2 };
        o.tags = ["conflict"];
        o.short = `流年${me}害大運${br(N.branch)}`;
      }
      out.push(signal(id, o));
      return out;
    }
    case "半合":
    case "拱合": {
      const el = rel.element, fb = formedBit(c, el, W), f = FORMED[fb.group];
      const word = main === "半合" ? "半合" : "拱合";
      const what = `${me}與${at}${word}${el}局`;
      o.element = el;
      const k = (main === "半合" ? 0.4 : 0.3) * (fb.side === "good" ? 1 : fb.side === "bad" ? -1 : 0);
      o.tone = fb.side === "good" ? "吉" : fb.side === "bad" ? "凶" : "中";
      o.weight = main === "半合" ? 4.5 : 3.5;
      o.text = `${what}：${fb.text}`;
      o.notes[f.domain] = `${what}，${fb.text}`;
      o.domains[f.domain] = kid && f.domain !== "study" ? k / 2 : k;
      o.tags = fb.side === "bad" ? [...f.bad] : fb.side === "good" ? [...f.good] : [];
      o.short = what;
      if (other === "day" && !kid) {
        o.weight += 1;
        o.notes.love = `${me}與日支${br(N.branch)}${word}，夫妻宮逢合，感情容易有進展`;
        o.domains.love = (o.domains.love || 0) + 0.3;
        o.tags.push("romance");
        o.text = `${o.text}；日支逢合，感情也容易有進展`;
      }
      if (other === "hour" && grown(W.stage)) { o.tags.push("children"); o.notes.family = `${me}與時支${br(N.branch)}${word}，子女宮逢合`; }
      if (fb.group === "比劫" && !o.notes.family) o.notes.family = `${what}，比劫是兄弟姊妹星，${fb.side === "good" ? "手足之間互相扶持" : "手足之間容易為錢或家事起爭執"}`;
      if (fb.group === "印" && !o.notes.family) { o.notes.family = `${what}，印是母親星，${fb.side === "bad" ? "宜多關心母親" : "母親與長輩的照顧多"}`; o.tags.push("mother"); }
      if (fb.group === "官殺" && c.sex === "female" && !kid && other !== "day") { o.notes.love = `${what}，女命官殺是夫星，感情也被牽動`; o.tags.push("romance"); }
      if (fb.group === "財" && c.sex === "male" && !kid && other !== "day") { o.notes.love = `${what}，男命財星是妻星，感情也被牽動`; o.tags.push("romance"); }
      out.push(signal(id, o));
      return out;
    }
    case "相破": {
      const what = `${me}破${at}`;
      const palace = { year: "和長輩有關的事", month: kid || teen ? "家中的事" : "工作與家中的事", day: kid || teen ? "生活作息" : "感情與相處", hour: kid || teen ? "興趣與計畫" : "子女晚輩的事", decade: "十年的計畫" }[other];
      o.tone = "中";
      o.weight = 2.5;
      o.text = `${what}：${palace}容易被打斷、有小破損，影響較輕`;
      const d = other === "day" ? (kid ? "health" : "love") : other === "month" ? (kid ? "family" : "career") : other === "hour" ? (kid ? "study" : "family") : other === "year" ? "family" : "career";
      o.notes[d] = `${what}，${palace}容易被打斷，影響較輕`;
      o.domains[d] = -0.15;
      o.tags = other === "day" && !kid ? ["spouseClash"] : [];
      o.short = what;
      out.push(signal(id, o));
      return out;
    }
    default: return out;
  }
}

function stemCombineSignal(c, W, other, N, rel) {
  const P = W.P, el = rel.element, kid = W.stage === "child";
  const s = W.mode === "flow" ? `流年${st(P.stem)}` : `大運${st(P.stem)}`;
  if (other === "day") {
    const god = P.gods.stem;   // the stem that combines the day master is 正財 (陽干) or 正官 (陰干)
    const spouse = (c.dayYang && c.sex === "male") || (!c.dayYang && c.sex === "female");
    const head = `${s}${god}合日主${st(N.stem)}（${P.stem}${N.stem}合${el}）`;
    if (kid) return signal("rel.stemCombine.day", { kind: "rel", tone: "吉", weight: 3, text: `${head}：人緣好、討人喜歡`, short: `${s}合日主`, notes: { family: `${head}，人緣好` } });
    if (spouse) {
      const who = c.sex === "male" ? "男命妻星合身" : "女命夫星合身";
      return signal("rel.stemCombine.day", {
        kind: "rel", tone: "吉", weight: 6, domains: { love: 0.7 }, change: ["love"], tags: ["marriage", "romance"],
        text: `${head}：${who}，${W.stage === "senior" ? "與老伴感情融洽" : "利戀愛、婚姻，有人主動靠近"}`, short: `${god}合日主，${who}`,
        notes: { love: `${head}，${who}，利戀愛、婚姻` }, headline: `${god}合日主，${who}`,
      });
    }
    return c.sex === "male"
      ? signal("rel.stemCombine.day", { kind: "rel", tone: "吉", weight: 5, domains: { career: 0.4 }, tags: ["promotion", "job"], text: `${head}：官星合身，利職位、名聲，也容易被責任綁住`, short: `${god}合日主，官星合身`, notes: { career: `${head}，官星合身，利職位、名聲` } })
      : signal("rel.stemCombine.day", { kind: "rel", tone: "吉", weight: 5, domains: { wealth: 0.4 }, tags: ["gain"], text: `${head}：財來就我，利收入與機會`, short: `${god}合日主，財來就我`, notes: { wealth: `${head}，財來就我，利收入與機會` } });
  }
  if (other === "decade") {
    return signal("rel.stemCombine.decade", { kind: "rel", tone: "中", weight: 2.5, text: `流年${st(P.stem)}合大運${st(N.stem)}（合${el}）：十年的主題在這一年有新的牽連`, short: `流年${P.stem}合大運${N.stem}`, notes: { career: `流年${st(P.stem)}合大運${st(N.stem)}，十年的主題有新的牽連` } });
  }
  const who = { year: "長輩", month: kid ? "父母" : "父母、同事", hour: kid ? "玩伴" : "子女、晚輩" }[other];
  const nEl = STEM_EL[N.stem];
  const tie = c.useful === nEl ? `；${N.stem}${nEl}是你的用神，被合住，相關的事容易被牽絆` : c.avoid === nEl ? `；${N.stem}${nEl}是你的忌神，合去忌神反而有利` : "";
  const d = other === "year" ? "family" : other === "month" ? (kid ? "family" : "career") : "family";
  return signal(`rel.stemCombine.${other}`, {
    kind: "rel", tone: c.avoid === nEl ? "吉" : c.useful === nEl ? "凶" : "中", weight: 2.5,
    domains: { [d]: c.useful === nEl ? -0.15 : c.avoid === nEl ? 0.15 : 0 },
    text: `${s}合${stemAt(other, N.stem)}（合${el}）：與${who}的互動變多，有合作也有牽絆${tie}`, short: `${s}合${stemAt(other, N.stem)}`,
    notes: { [d]: `${s}合${stemAt(other, N.stem)}，與${who}的互動變多` },
  });
}

function stemClashSignal(c, W, other, N) {
  const P = W.P, kid = W.stage === "child";
  const s = W.mode === "flow" ? `流年${st(P.stem)}` : `大運${st(P.stem)}`;
  if (other === "day") {
    const god = P.gods.stem;   // 甲庚、乙辛、丙壬、丁癸: the clashing stem is 七殺, or the day master clashes its 偏財
    const sha = god === "七殺";
    return signal("rel.stemClash.day", {
      kind: "rel", tone: "凶", weight: kid ? 3 : 4.5, domains: sha ? { health: -0.3, career: -0.2 } : { wealth: -0.2 },
      tags: sha ? ["conflict", "health"] : ["loss"],
      text: `${s}沖日主${st(N.stem)}：${st(P.stem)}是你的${god}，${sha ? "壓力直接衝著自己" : "求財心切、為錢奔波"}，心情與決策容易動搖`,
      short: `${s}沖日主`, notes: sha ? { health: `${s}沖日主，壓力直接衝著自己，宜多休息`, career: `${s}沖日主，工作上壓力大，決策宜謹慎` } : { wealth: `${s}沖日主，求財心切，投資宜謹慎` },
    });
  }
  if (other === "decade") {
    return signal("rel.stemClash.decade", { kind: "rel", tone: "凶", weight: 3.5, domains: { career: -0.2 }, tags: ["upheaval"], text: `流年${st(P.stem)}沖大運${st(N.stem)}：十年的主軸在這一年受到挑戰，宜穩`, short: `流年${P.stem}沖大運${N.stem}`, notes: { career: `流年${st(P.stem)}沖大運${st(N.stem)}，十年的主軸在這一年受到挑戰` } });
  }
  const who = { year: "長輩", month: kid ? "父母" : "父母、同事", hour: kid ? "玩伴" : "子女、晚輩" }[other];
  const d = other === "month" && !kid ? "career" : "family";
  return signal(`rel.stemClash.${other}`, {
    kind: "rel", tone: "凶", weight: 3, domains: { [d]: -0.15 }, tags: other === "month" ? ["conflict", "parents"] : other === "year" ? ["elders"] : [],
    text: `${s}沖${stemAt(other, N.stem)}：與${who}之間意見容易相左，宜多溝通`, short: `${s}沖${stemAt(other, N.stem)}`,
    notes: { [d]: `${s}沖${stemAt(other, N.stem)}，與${who}之間意見容易相左` },
  });
}

// 三合、三會、三刑 that the focus pillar takes part in.
function multiSignals(c, W, rels) {
  const out = [], P = W.P;
  for (const r of rels) {
    if (r.kind === "三刑") {
      out.push(signal("rel.punish3", {
        kind: "rel", tone: "凶", weight: 6.5, domains: { health: -0.5, career: W.stage === "child" ? 0 : -0.4 },
        tags: ["injury", "health", "conflict", "jobLoss"],
        text: `${r.text}俱全：傳統上要防官非口舌、手術與意外，凡事守規矩，出入多留意安全`, short: `${r.text.replace(/（.*$/, "")}俱全`,
        notes: { health: `${r.text}俱全，傳統上要防手術與意外，出入多留意安全`, career: "三刑也主官非口舌，簽約、開車守規矩" },
        headline: `${r.text.replace(/（.*$/, "")}俱全，宜防意外與口舌`,
      }));
      continue;
    }
    if (r.kind !== "三合" && r.kind !== "三會") continue;
    const el = r.element, fb = formedBit(c, el, W), f = FORMED[fb.group];
    const k = 0.7 * (fb.side === "good" ? 1 : fb.side === "bad" ? -1 : 0);
    const what = `${r.text}（${W.who}${br(P.branch)}引動）`;
    const notes = { [f.domain]: `${what}，${fb.text}` };
    const tags = fb.side === "bad" ? [...f.bad] : fb.side === "good" ? [...f.good] : [];
    if (fb.group === "比劫") notes.family = `${what}，比劫是兄弟姊妹星，${fb.side === "good" ? "手足之間互相扶持" : "手足之間容易為錢或家事起爭執"}`;
    if (fb.group === "印") { notes.family = `${what}，印是母親星，${fb.side === "bad" ? "宜多關心母親" : "母親與長輩的照顧多"}`; tags.push("mother"); }
    if (fb.group === "官殺" && c.sex === "female") { notes.love = `${what}，女命官殺是夫星，感情也被牽動`; tags.push("romance"); }
    if (fb.group === "財" && c.sex === "male") { notes.love = `${what}，男命財星是妻星，感情也被牽動`; tags.push("romance"); }
    out.push(signal(r.kind === "三合" ? "rel.triad" : "rel.meet", {
      kind: "rel", tone: fb.side === "good" ? "吉" : fb.side === "bad" ? "凶" : "中", weight: 6, element: el,
      domains: { [f.domain]: k }, tags, text: `${what}，${el}的力量集中：${fb.text}`, short: r.text, notes,
    }));
  }
  return out;
}

// ---------- 格局組合 ----------
function comboSignals(c, W) {
  const out = [], P = W.P, D = W.mode === "flow" ? W.D : null, stage = W.stage;
  const kid = stage === "child", teen = stage === "teen", senior = stage === "senior", adult = stage === "adult", grownUp = adult || senior;
  const who = W.who, span = W.mode === "flow" ? "這一年" : "這十年";
  const pool = [
    { god: P.gods.stem, where: `${who}${st(P.stem)}`, el: P.stemEl, flow: true },
    { god: P.gods.branch, where: `${who}${br(P.branch)}`, el: P.branchEl, flow: true },
    ...c.shown.map(x => ({ ...x, flow: false })),
    ...(D ? [{ god: D.gods.stem, where: `大運${st(D.stem)}`, el: D.stemEl, flow: false }, { god: D.gods.branch, where: `大運${br(D.branch)}`, el: D.branchEl, flow: false }] : []),
  ];
  const grp = x => GOD_GROUP[x.god];
  // Where two gods stand: 「流年甲木正財、午火七殺」 inside one pillar, 「月干甲木正財、流年午火七殺」 across two.
  const at2 = m => (m[0].flow && m[1].flow ? [m[0].where, m[1].where.slice(who.length)] : [m[0].where, m[1].where]);
  const pairWhere = m => { const [a, b] = at2(m); return `${a}${m[0].god}、${b}${m[1].god}`; };
  const find = (pa, pb, needFlowA = false) => {
    for (const x of pool) if (pa(x) && (!needFlowA || x.flow)) for (const y of pool) if (y !== x && pb(y) && (x.flow || y.flow)) return [x, y];
    return null;
  };
  const any = p => pool.find(p);
  const els = Object.fromEntries(["比劫", "食傷", "財", "官殺", "印"].map(g => [g, elementOf(c.dm, g)]));

  // 傷官見官
  let m = find(x => x.god === "傷官", y => y.god === "正官");
  if (m && !kid) {
    const [a, b] = at2(m), yin = any(x => grp(x) === "印"), female = c.sex === "female" && grownUp;
    const fix = yin ? `；好在${yin.where}${yin.god}能制傷官（傷官佩印），可化解一部分` : "";
    const body = teen ? "容易頂撞師長、和規範起衝突，說話留三分"
      : senior ? `${female ? "女命正官是夫星，與老伴容易起口角；" : ""}說話直、容易得罪人，凡事留三分`
        : `${female ? "女命正官是夫星，婚姻感情容易起口角、冷戰；" : ""}工作上也要防與上司、體制起衝突與口舌官非，說話留三分`;
    out.push(signal("combo.傷官見官", {
      kind: "combo", tone: "凶", weight: teen ? 6 : 8,
      domains: { career: adult ? -0.7 : 0, study: teen ? -0.3 : 0, love: female ? -0.8 : 0 },
      change: female ? ["love"] : [], tags: [...(female ? ["spouseClash"] : []), "conflict", ...(adult ? ["jobLoss"] : [])],
      text: `傷官見官：${a}傷官遇上${b}正官，${body}${fix}`,
      short: "傷官見官，口舌易起", shorts: { love: "傷官見官，夫星受剋", career: "傷官見官，易與上司衝突" },
      notes: {
        ...(adult ? { career: `傷官見官（${a}傷官遇${b}正官），易與上司、體制起衝突，口舌官非要留意` } : {}),
        ...(teen ? { study: `傷官見官（${a}傷官遇${b}正官），容易頂撞師長，宜收斂脾氣` } : {}),
        ...(female ? { love: "傷官見官，女命夫星受剋，婚姻感情容易起口角，宜多包容" } : {}),
      },
      headline: female ? "傷官見官，感情與工作都宜忍讓" : teen ? "傷官見官，宜收斂脾氣" : "傷官見官，防與上司衝突",
    }));
  }
  // 比劫奪財
  m = find(x => grp(x) === "比劫", y => grp(y) === "財");
  if (m && bad(c, els.比劫) && !kid) {
    const [a, b] = at2(m), male = c.sex === "male" && adult, pian = m[1].god === "偏財" && grownUp;
    const money = teen ? "零用錢容易花在朋友身上，借錢給人宜謹慎" : "錢財易進易出，合夥、借貸、作保宜謹慎";
    out.push(signal("combo.比劫奪財", {
      kind: "combo", tone: "凶", weight: teen ? 5 : 7, domains: { wealth: teen ? -0.4 : -0.9, love: male ? -0.5 : 0, family: pian ? -0.2 : 0 },
      tags: ["loss", ...(male ? ["rival"] : []), "siblings", ...(pian ? ["father"] : [])],
      text: `比劫奪財：${a}${m[0].god}與${b}${m[1].god}相爭，比劫是你的${c.roles[els.比劫]}，${money}${male ? "；男命財星是妻星，感情上也要防競爭或第三者" : ""}${pian ? "；偏財也是父親星，宜多關心父親" : ""}`,
      short: "比劫奪財，錢財易進易出", shorts: { love: "比劫奪財，感情有競爭", family: "比劫奪財，手足易為錢爭" },
      notes: { wealth: `比劫奪財（${a}${m[0].god}爭${b}${m[1].god}），${money}`, ...(male ? { love: "比劫奪財，男命妻星被爭，感情上要防競爭或第三者" } : {}), family: `比劫奪財，手足之間容易為錢起爭執${pian ? "，也宜多關心父親" : ""}` },
      headline: "比劫奪財，理財宜保守",
    }));
  }
  // 財星壞印
  m = find(x => grp(x) === "財", y => grp(y) === "印", true);
  if (m && good(c, els.印)) {
    const [a, b] = at2(m);
    const what = kid ? "學習容易分心" : teen ? "讀書考試容易分心" : senior ? "文書合約要細看" : "讀書考試容易分心、文書合約要細看";
    const fam = senior ? "印也代表房產與長輩，相關的事宜細看" : "印也是母親星，宜多關心母親";
    out.push(signal("combo.財星壞印", {
      kind: "combo", tone: "凶", weight: 6, domains: { study: senior ? -0.2 : -0.8, family: -0.3, career: adult ? -0.1 : 0 },
      tags: senior ? ["examRisk"] : ["examRisk", "mother", "parents"],
      text: `財星壞印：${a}${m[0].god}剋${b}${m[1].god}，印是你喜用的星，${what}；${fam}`,
      short: senior ? "財星壞印，文書宜細看" : "財星壞印，讀書易分心", shorts: { family: senior ? "財星壞印" : "財星壞印，宜多關心母親" },
      notes: { study: `財星壞印（${a}${m[0].god}剋${b}${m[1].god}），${senior ? "文書合約要細看" : "讀書考試容易分心，宜排除雜務"}`, family: senior ? "財星壞印，房產與長輩的事宜細看" : "財星壞印，印是母親星，宜多關心母親的健康" },
      headline: senior ? "財星壞印，文書合約宜細看" : "財星壞印，讀書與文書宜專心",
    }));
  }
  // 梟神奪食
  m = find(x => x.god === "偏印", y => y.god === "食神");
  if (m && !bad(c, els.食傷)) {
    const [a, b] = at2(m), zhi = any(x => x.god === "偏財"), mom = c.sex === "female" && adult, nana = c.sex === "female" && senior, young = kid || teen;
    out.push(signal("combo.梟神奪食", {
      kind: "combo", tone: "凶", weight: 6, domains: { health: -0.4, career: adult ? -0.3 : 0, study: young ? -0.2 : 0, family: mom ? -0.3 : 0 },
      tags: ["illness", "health", ...(mom ? ["childrenCare"] : [])],
      text: `梟神奪食：${a}偏印剋${b}食神，思慮多、胃口與睡眠容易受影響，${young ? "學習與興趣也容易半途而廢" : "計畫也容易臨時生變"}${mom ? "；女命食神是子女星，懷孕、生產與孩子的健康要多照顧" : nana ? "；女命食神也是子孫星，晚輩的健康宜多關心" : ""}${zhi ? `；${zhi.where}偏財能制梟，影響減輕` : ""}`,
      short: "梟神奪食，飲食睡眠宜顧", shorts: { family: "梟神奪食，子女宜多照顧" },
      notes: {
        health: `梟神奪食（${a}偏印剋${b}食神），胃口與睡眠容易受影響，傳統上要多顧${ORGAN.土}`,
        ...(adult ? { career: "梟神奪食，計畫容易臨時生變，宜留備案" } : {}),
        ...(young ? { study: "梟神奪食，學習與興趣容易半途而廢，多鼓勵" } : {}),
        ...(mom ? { family: "梟神奪食，女命食神是子女星，懷孕、生產與孩子的健康宜多照顧" } : {}),
      },
    }));
  }
  // 官殺混雜（身強喜官殺時是官殺並見）
  m = find(x => x.god === "正官", y => y.god === "七殺");
  if (m && !kid) {
    const ok = good(c, els.官殺), female = c.sex === "female" && adult;
    const work = teen ? "課業與師長的要求多頭並進" : senior ? "責任與雜事多頭並進" : "工作上多頭馬車、責任不清";
    const pre = c.weak ? "官殺為喜" : canTake(c);
    const loveBit = female ? (ok ? "；女命官殺都是夫星，追求者多，感情宜專一" : "；女命官殺都是夫星，感情對象容易複雜，宜專一") : c.sex === "female" && teen ? "；追求者多，交友宜謹慎" : "";
    out.push(signal("combo.官殺混雜", {
      kind: "combo", tone: ok ? "中" : "凶", weight: 5, domains: { career: adult ? (ok ? 0.1 : -0.5) : 0, love: female ? (ok ? -0.1 : -0.5) : 0 },
      tags: ok ? (adult ? ["promotion"] : []) : [...(female ? ["rival", "spouseClash"] : []), "conflict", ...(adult ? ["jobLoss"] : [])],
      text: ok ? `官殺並見：${pairWhere(m)}同現，${pre}，${teen ? "課業與責任一起加重" : "責任與權力一起加重"}${loveBit}` : `官殺混雜：${pairWhere(m)}同現，${work}，壓力偏大${loveBit}`,
      short: ok ? "官殺並見，權責加重" : "官殺混雜，壓力多頭", shorts: { love: ok ? "官殺並見，追求者多" : "官殺混雜，感情對象複雜" },
      notes: {
        ...(adult ? { career: ok ? `官殺並見，${pre}，責任與權力一起加重` : `官殺混雜（${pairWhere(m)}），工作上多頭馬車、壓力偏大` } : {}),
        ...(teen ? { study: `${ok ? "官殺並見" : "官殺混雜"}，課業與師長的要求多頭並進` } : {}),
        ...(female ? { love: ok ? "官殺並見，女命追求者多，感情宜專一" : "官殺混雜，女命夫星不專一，感情對象容易複雜，宜看清楚" } : {}),
      },
    }));
  }
  // 財官雙美（財滋七殺）
  m = find(x => grp(x) === "財", y => grp(y) === "官殺");
  if (m && good(c, els.財) && good(c, els.官殺) && grownUp) {
    const guan = m[1].god === "正官", name = guan ? "財官雙美" : "財滋七殺";
    const body = senior ? "財務與名聲都順，受人敬重" : guan ? "財生官、官護財，利升遷加薪" : c.weak ? "財殺皆為喜用，敢衝敢扛，事業財運並進" : `${canTake(c)}，敢衝敢扛，事業財運並進`;
    const spouse = !adult ? "" : c.sex === "male" ? "；財也是男命的妻星，感情亦順" : guan ? "；正官也是女命的夫星，利婚姻" : "；七殺也是女命的夫星（偏夫），感情亦有進展";
    const line = senior ? `${name}，財務名聲都順` : guan ? "財官雙美，利升遷加薪" : "財滋七殺，事業財運並進";
    out.push(signal("combo.財官雙美", {
      kind: "combo", tone: "吉", weight: 7, domains: { career: senior ? 0.3 : 0.9, wealth: 0.7 }, tags: senior ? ["gain"] : ["promotion", "gain", "job"],
      text: `${name}：${pairWhere(m)}都是喜用，${body}${spouse}`, short: line, headline: line,
      notes: { career: `${name}（${pairWhere(m)}皆為喜用），${senior ? "受人敬重" : "利升遷、加薪"}`, wealth: senior ? "財星與官星相生，財務穩健" : "財星與官星相生，收入隨職位一起成長" },
    }));
  }
  // 食神制殺
  m = find(x => x.god === "食神", y => y.god === "七殺");
  if (m && !good(c, els.官殺) && !kid) {
    const [a, b] = at2(m);
    const body = teen ? "能以才藝與實力化解壓力，在競爭中脫穎而出" : senior ? "能以經驗與智慧化解壓力" : "能以才華與專業化解壓力，在競爭中脫穎而出，利掌權、升遷";
    out.push(signal("combo.食神制殺", {
      kind: "combo", tone: "吉", weight: 6, domains: { career: adult ? 0.7 : 0, study: teen ? 0.4 : 0, health: 0.2 }, tags: adult ? ["promotion", "job"] : teen ? ["exam"] : [],
      text: `食神制殺：${a}食神制住${b}七殺，${body}`, short: "食神制殺，化壓力為表現",
      notes: adult ? { career: `食神制殺（${a}食神制${b}七殺），以專業化解壓力，利掌權、升遷` } : teen ? { study: `食神制殺（${a}食神制${b}七殺），以實力化解壓力，利考試競賽` } : { health: "食神制殺，壓力得以化解，身心較輕鬆" },
    }));
  }
  // 殺印相生、官印相生
  m = find(x => grp(x) === "官殺", y => grp(y) === "印");
  if (m && good(c, els.印) && !bad(c, els.官殺)) {
    const [a, b] = at2(m), sha = m[0].god === "七殺", name = sha ? "殺印相生" : "官印相生";
    const body = kid ? "受長輩師長栽培，利讀書" : teen ? "受師長栽培，利考試與升學" : senior ? "受人敬重，利文書與名聲" : sha ? "壓力轉為權力與名望，利升遷、考試與證照" : "利升遷、考核與考試，容易得到長官提拔";
    const gain = adult ? "利升遷考試" : kid ? "利讀書" : teen ? "利考試升學" : "受人敬重";
    out.push(signal(`combo.${name}`, {
      kind: "combo", tone: "吉", weight: 7, domains: { career: adult ? 0.8 : 0, study: senior ? 0.2 : 0.7 }, tags: adult ? ["promotion", "exam", "job", "study"] : ["exam", "study"],
      text: `${name}：${a}${m[0].god}生${b}${m[1].god}、印再生身，${body}`, short: `${name}，${gain}`, shorts: { study: `${name}，${senior ? "利學習" : "利考試"}` },
      notes: { ...(adult ? { career: `${name}（${a}${m[0].god}生${b}${m[1].god}），利升遷、受提拔` } : {}), study: `${name}，${kid ? "利讀書，受長輩師長栽培" : senior ? "利學習新事物" : "利考試、證照與升學"}` },
      headline: `${name}，${gain}`,
    }));
  }
  // 食傷生財
  m = find(x => grp(x) === "食傷", y => grp(y) === "財");
  if (m && good(c, els.財) && !bad(c, els.食傷) && grownUp) {
    const [a, b] = at2(m), body = senior ? "興趣與手藝也能帶來收入" : "靠專業、手藝與創意賺錢，副業、接案、創業都有機會";
    out.push(signal("combo.食傷生財", {
      kind: "combo", tone: "吉", weight: 6, domains: { wealth: 0.7, career: adult ? 0.3 : 0 }, tags: adult ? ["gain", "startup"] : ["gain"],
      text: `食傷生財：${a}${m[0].god}生${b}${m[1].god}，${body}`, short: "食傷生財，靠專業賺錢",
      notes: { wealth: `食傷生財（${a}${m[0].god}生${b}${m[1].god}），${senior ? "興趣與手藝也能帶來收入" : "靠專業、手藝與創意賺錢"}`, ...(adult ? { career: "食傷生財，適合接案、副業或創業" } : {}) },
    }));
  }
  // 七殺攻身（財生殺旺）
  const shaIn = pool.find(x => x.flow && x.god === "七殺");
  if (shaIn && bad(c, els.官殺) && !any(x => grp(x) === "印") && !any(x => x.god === "食神")) {
    const cai = pool.find(x => x.flow && grp(x) === "財");
    out.push(signal("combo.七殺攻身", {
      kind: "combo", tone: "凶", weight: 6, domains: { health: -0.6, career: adult ? -0.4 : 0 }, tags: adult ? ["illness", "health", "conflict", "jobLoss"] : ["illness", "health", "conflict"],
      text: `七殺攻身：${shaIn.where}七殺是你的${c.roles[els.官殺]}，又沒有印或食神化解${cai ? `，${cai.where.startsWith(who) && shaIn.where.startsWith(who) ? cai.where.slice(who.length) : cai.where}${cai.god}還生殺（財生殺旺）` : ""}，${kid ? "規矩與壓力偏重，容易疲累、鬧脾氣，宜多休息" : "壓力直接衝著自己，容易疲累、與人衝突，宜多休息、少逞強"}`,
      short: "七殺攻身，壓力衝著自己",
      notes: { health: `七殺攻身（${shaIn.where}七殺無制），${span}容易疲累，傳統上對應${ORGAN[c.dm]}，宜多休息、定期檢查`, ...(adult ? { career: "七殺攻身，壓力大、易與人衝突，宜少逞強" } : {}) },
      headline: "七殺攻身，宜多休息",
    }));
  }
  // 忌神當令
  if (c.avoid && P.branchEl === c.avoid && (fav(c, P.stemEl) <= 0 || (D && (D.stemEl === c.avoid || D.branchEl === c.avoid)))) {
    const e = c.avoid, hit = CONTROLS[e];
    const also = fav(c, P.stemEl) <= -0.25 ? `，天干${st(P.stem)}也不利` : D && (D.stemEl === e || D.branchEl === e) ? `，大運也帶${e}` : "";
    out.push(signal("combo.忌神當令", {
      kind: "combo", tone: "凶", weight: 6, lead: ["health"], domains: { health: -0.5, career: -0.2, wealth: -0.2, love: -0.1 }, tags: ["illness", "health", "loss", "jobLoss"],
      text: `忌神當令：${W.mode === "flow" ? "流年太歲" : "大運地支"}${br(P.branch)}正是你的忌神${e}${also}，${span}做事阻力較大，宜守不宜攻；健康上傳統要多保養${ORGAN[hit]}`,
      short: `忌神${e}當令`,
      notes: { health: `忌神${e}當令（${br(P.branch)}），${e}過旺剋${hit}，傳統上要多保養${ORGAN[hit]}，作息規律、定期檢查`, career: `忌神${e}當令，做事阻力較大，宜守不宜攻`, wealth: `忌神${e}當令，理財宜保守` },
      headline: `忌神${e}當令，宜守不宜攻`,
    }));
  }
  // At most two combinations get a bullet of their own; the rest stay as notes.
  out.filter(s => s.point !== false).sort((a, b) => b.weight - a.weight).slice(2).forEach(s => { s.point = false; });
  return out;
}

// ---------- 神煞 ----------
const STAR_YEAR = {
  天乙貴人: { w: 5, tone: "吉", d: { career: 0.4, wealth: 0.2, family: 0.2, health: 0.2 }, tags: ["helper", "promotion", "job", "gain", "healer"], t: "逢天乙貴人：遇到難處容易有人伸手相助，逢凶化吉", n: { career: "逢天乙貴人，工作上遇到難處容易有人相助", wealth: "逢天乙貴人，財路與人脈都有貴人", family: "逢天乙貴人，家中遇事容易有人幫忙", health: "逢天乙貴人，遇到狀況容易逢凶化吉" } },
  太極貴人: { w: 2.5, tone: "吉", d: { study: 0.2 }, tags: ["study"], t: "逢太極貴人：悟性高，適合進修、研究哲理或宗教" },
  文昌貴人: { w: 4.5, tone: "吉", d: { study: 0.7, career: 0.1 }, tags: ["exam", "study"], t: "逢文昌：思路清楚、文筆好，利讀書、考試、證照與寫作", n: { study: "逢文昌，利讀書、考試與證照", career: "文昌也利文書、企劃與寫作類的工作" } },
  國印貴人: { w: 3, tone: "吉", d: { career: 0.3 }, tags: ["job", "promotion"], t: "逢國印貴人：做事有分寸、受人信任，利公職、掌印或簽約" },
  福星貴人: { w: 2.5, tone: "吉", d: { wealth: 0.2, family: 0.2 }, tags: ["gain"], t: "逢福星貴人：福氣好，生活衣食無憂", n: { wealth: "逢福星貴人，衣食無憂、財運平順", family: "逢福星貴人，家中福氣好" } },
  天廚貴人: { w: 2, tone: "吉", d: { wealth: 0.1 }, tags: [], t: "逢天廚：口福好、生活享受多，也利餐飲相關" },
  學堂: { w: 3, tone: "吉", d: { study: 0.4 }, tags: ["study", "exam"], t: "逢學堂（日主長生之地）：學習力強，利進修與考試" },
  祿神: { w: 4, tone: "吉", d: { career: 0.4, wealth: 0.3 }, tags: ["job", "gain"], t: "逢祿（歲祿）：工作與收入有著落，利求職、加薪", n: { career: "逢祿（歲祿），工作有著落，利求職、加薪", wealth: "逢祿，收入穩定有著落" } },
  金輿: { w: 2.5, tone: "吉", d: { love: 0.2, wealth: 0.2 }, tags: ["romance"], t: "逢金輿：生活較舒適，也常得伴侶助力", n: { love: "逢金輿，常得伴侶助力", wealth: "逢金輿，生活較舒適" } },
  羊刃: { w: 5.5, tone: "凶", d: { health: -0.4, wealth: -0.2 }, tags: ["injury", "health", "loss"], t: "逢羊刃：衝勁強、敢做決定，但也要防衝動、受傷、開刀與破財", n: { health: "逢羊刃，要防受傷與開刀，開車運動多小心", wealth: "羊刃主衝動，大額花費宜三思" } },
  飛刃: { w: 3.5, tone: "凶", d: { health: -0.2, wealth: -0.2 }, tags: ["injury", "loss"], t: "逢飛刃：要防突發的小意外與破耗", n: { health: "逢飛刃，要防突發的小意外", wealth: "逢飛刃，要防突發的破耗" } },
  紅艷煞: { w: 3.5, tone: "中", d: { love: 0.2 }, change: ["love"], tags: ["romance", "temptation"], t: "逢紅艷：魅力與異性緣變強，感情豐富，也容易為情所困" },
  流霞: { w: 3, tone: "凶", d: { health: -0.2 }, tags: ["injury"], t: "逢流霞：傳統上要留意血光，出入小心" },
  桃花: { w: 5, tone: "中", d: { love: 0.4 }, change: ["love"], tags: ["romance", "temptation"], t: "逢桃花（咸池）：人緣與異性緣變好，單身者容易有對象；有伴者宜守分寸" },
  驛馬: { w: 5.5, tone: "中", d: { move: 0.3 }, change: ["move", "career"], tags: ["move", "abroad", "jobChange"], t: "逢驛馬：奔波、出差、搬遷、換環境的機會多", n: { move: "逢驛馬，搬遷、出國、換環境的機會多", career: "驛馬也主出差、外派或換跑道" } },
  華蓋: { w: 3.5, tone: "中", d: { study: 0.3, love: -0.1 }, tags: ["study", "retire", "lonely"], t: "逢華蓋：思想深、喜獨處，利研究、藝術與宗教，人際上較孤高", n: { study: "逢華蓋，利研究、藝術與宗教", love: "逢華蓋，人際上較孤高，感情宜多主動" } },
  將星: { w: 4.5, tone: "吉", d: { career: 0.5 }, tags: ["promotion", "job"], t: "逢將星：有主導權與威望，利升遷、帶團隊" },
  劫煞: { w: 4.5, tone: "凶", d: { wealth: -0.4, health: -0.2 }, tags: ["loss", "injury"], t: "逢劫煞：要防突發的破財、被騙或意外，大額交易多確認", n: { wealth: "逢劫煞，要防突發的破財或被騙，大額交易多確認", health: "逢劫煞，要防突發的意外" } },
  亡神: { w: 3, tone: "凶", d: { career: -0.2 }, tags: ["conflict"], t: "逢亡神：心思重、易捲入是非，說話做事宜光明磊落" },
  災煞: { w: 4.5, tone: "凶", d: { health: -0.4 }, tags: ["injury"], t: "逢災煞：出入交通、運動要多注意安全", n: { health: "逢災煞，出入交通、運動要多注意安全" } },
  孤辰: { w: 3.5, tone: "凶", d: { love: -0.3, family: -0.1 }, tags: ["lonely"], t: "逢孤辰：心境較孤獨，和家人或伴侶容易聚少離多，宜主動聯繫", n: { love: "逢孤辰，和伴侶容易聚少離多，宜主動聯繫", family: "逢孤辰，和家人聚少離多" } },
  寡宿: { w: 3.5, tone: "凶", d: { love: -0.3, family: -0.1 }, tags: ["lonely"], t: "逢寡宿：感情上容易感到寂寞，和親人緣分較淡，宜主動經營", n: { love: "逢寡宿，感情上容易感到寂寞，宜主動經營", family: "逢寡宿，和親人緣分較淡" } },
  勾絞: { w: 3, tone: "凶", d: { career: -0.2 }, tags: ["conflict"], t: "逢勾絞：容易捲入糾紛、口舌，合約與承諾要白紙黑字" },
  元辰: { w: 4, tone: "凶", d: { wealth: -0.4 }, tags: ["loss"], t: "逢元辰（大耗）：花費多、做事容易卡關，理財宜保守" },
  天德貴人: { w: 3, tone: "吉", d: { health: 0.3, family: 0.2 }, tags: ["helper", "healer"], t: "逢天德：上天庇佑，遇事容易轉圜、少災", n: { health: "逢天德，遇事容易轉圜、少災", family: "逢天德，家中平安" } },
  天德合: { w: 2, tone: "吉", d: { health: 0.2 }, tags: ["healer"], t: "逢天德合：作用近似天德，遇事容易轉圜" },
  月德貴人: { w: 3, tone: "吉", d: { health: 0.3, family: 0.2 }, tags: ["helper", "healer"], t: "逢月德：遇難易解，人際和順", n: { health: "逢月德，遇難易解", family: "逢月德，人際與家庭和順" } },
  月德合: { w: 2, tone: "吉", d: { health: 0.2 }, tags: ["healer"], t: "逢月德合：作用近似月德，遇難易解" },
  天醫: { w: 3, tone: "吉", d: { health: 0.3 }, tags: ["healer"], t: "逢天醫：生病容易遇到好醫生，也利醫療保健相關的學習與工作" },
  空亡: { w: 4, tone: "凶", d: { career: -0.2, wealth: -0.2 }, tags: ["loss"], t: "逢空亡：所求之事容易雷聲大雨點小，重要決定多確認、留備案", n: { career: "逢空亡，所求之事容易雷聲大雨點小，重要決定多確認", wealth: "逢空亡，投資容易落空，宜留備案" } },
  紅鸞: { w: 6.5, tone: "吉", d: { love: 0.8 }, change: ["love"], tags: ["marriage", "romance"], t: "紅鸞星動：姻緣之星，單身者容易談戀愛，交往中的容易論及婚嫁" },
  天喜: { w: 6, tone: "吉", d: { love: 0.5, family: 0.4 }, change: ["love", "family"], tags: ["marriage", "birth", "romance"], t: "逢天喜：喜慶之星，容易有婚嫁、添丁之類的喜事", n: { love: "逢天喜，容易有婚嫁的喜事", family: "逢天喜，家中容易有添丁之類的喜事" } },
};
const LOVE_STARS = new Set(["紅鸞", "天喜", "桃花", "紅艷煞", "金輿"]);
const STAR_SHORT = { 祿神: "祿", 文昌貴人: "文昌", 天德貴人: "天德", 月德貴人: "月德", 紅艷煞: "紅艷", 天廚貴人: "天廚" };
const STAR_GLOSS = { 天乙貴人: "貴人相助", 文昌貴人: "利讀書考試", 將星: "利掌權", 驛馬: "奔波遷動", 桃花: "人緣佳", 紅鸞: "姻緣", 天喜: "喜慶", 羊刃: "防衝動受傷", 華蓋: "利研究、防孤僻", 祿神: "收入穩定", 劫煞: "防破財意外", 災煞: "防意外" };

// Wording for children, teenagers and seniors where the adult wording does not fit.
const STAR_STAGE = {
  child: {
    將星: { t: "逢將星：有領導力，在班上容易當幹部", d: { study: 0.2 }, tags: [] },
    國印貴人: { t: "逢國印貴人：做事有分寸，受師長信任", d: { study: 0.1 }, tags: [] },
    祿神: { t: "逢祿：家境安穩，衣食有著落", d: { family: 0.2 }, tags: [] },
    勾絞: { t: "逢勾絞：和玩伴容易起口角，大人多留意", d: { family: -0.1 }, tags: [] },
    亡神: { t: "逢亡神：心思較重，宜多陪伴、多聊聊", d: { family: -0.1 }, tags: [] },
    元辰: { t: "逢元辰：家中花費較多，做事容易卡關", d: { family: -0.1 }, tags: [] },
    劫煞: { t: "逢劫煞：要防突發的小意外，東西也容易遺失", d: { health: -0.2 }, tags: ["injury"] },
    空亡: { t: "逢空亡：學習與活動容易半途而廢，多鼓勵", d: { study: -0.1 }, tags: [] },
    孤辰: { t: "逢孤辰：性格較獨立，宜多陪伴", d: { family: -0.1 }, tags: [] },
    寡宿: { t: "逢寡宿：容易感到寂寞，宜多陪伴", d: { family: -0.1 }, tags: [] },
    華蓋: { t: "逢華蓋：喜歡獨處、有藝術天分", d: { study: 0.2 }, tags: ["study"] },
    太極貴人: { t: "逢太極貴人：悟性高、好奇心強", d: { study: 0.2 }, tags: ["study"] },
    羊刃: { t: "逢羊刃：個性急、好動，要防跌倒受傷", d: { health: -0.3 }, tags: ["injury"] },
    飛刃: { t: "逢飛刃：要防突發的小意外", d: { health: -0.2 }, tags: ["injury"] },
    流霞: { t: "逢流霞：要留意跌倒、碰撞的小傷", d: { health: -0.2 }, tags: ["injury"] },
    天廚貴人: { t: "逢天廚：口福好，吃得好", d: { health: 0.1 }, tags: [] },
    福星貴人: { t: "逢福星貴人：福氣好，家中衣食無憂", d: { family: 0.2 }, tags: [] },
    驛馬: { t: "逢驛馬：搬家、轉學、出遊的機會多", d: { move: 0.3 }, tags: ["move"] },
    文昌貴人: { t: "逢文昌：聰明、記性好，利讀書學習", d: { study: 0.7 }, tags: ["exam", "study"] },
    學堂: { t: "逢學堂：學習力強，讀書有進步", d: { study: 0.4 }, tags: ["study", "exam"] },
  },
  teen: {
    將星: { t: "逢將星：有領導力，在班上或社團容易當幹部", d: { study: 0.2 }, tags: [] },
    國印貴人: { t: "逢國印貴人：做事有分寸，受師長信任", d: { study: 0.1 }, tags: [] },
    祿神: { t: "逢祿：零用錢與打工收入有著落", d: { wealth: 0.2 }, tags: ["gain"] },
    驛馬: { t: "逢驛馬：出遊、轉學、搬家的機會多", d: { move: 0.3 }, tags: ["move", "abroad"] },
    勾絞: { t: "逢勾絞：容易捲入口角是非，交友宜謹慎", d: {}, tags: ["conflict"] },
    元辰: { t: "逢元辰：花費多、做事容易卡關", d: { wealth: -0.2 }, tags: ["loss"] },
    劫煞: { t: "逢劫煞：要防突發的意外或財物遺失", d: { health: -0.2, wealth: -0.1 }, tags: ["injury", "loss"] },
    空亡: { t: "逢空亡：計畫容易雷聲大雨點小，重要的事多確認", d: { study: -0.1 }, tags: [] },
  },
  senior: {
    將星: { t: "逢將星：說話有分量，受晚輩敬重", d: { family: 0.2 }, tags: [] },
    國印貴人: { t: "逢國印貴人：做事有分寸、受人信任，利簽約與公務", d: { career: 0.2 }, tags: [] },
    文昌貴人: { t: "逢文昌：頭腦清楚，利寫作、學習新事物", d: { study: 0.4 }, tags: ["study"] },
    學堂: { t: "逢學堂：學習力好，適合上課、培養興趣", d: { study: 0.3 }, tags: ["study"] },
    祿神: { t: "逢祿：收入與退休金有著落", d: { wealth: 0.3 }, tags: ["gain"] },
    驛馬: { t: "逢驛馬：出遊、走動、搬遷的機會多", d: { move: 0.3 }, tags: ["move", "abroad"] },
  },
};

function starSignals(c, W, stars) {
  const out = [], P = W.P, stage = W.stage, kid = stage === "child", teen = stage === "teen", student = W.age >= 5 && W.age <= 24;
  const lead = W.mode === "flow" ? "流年" : "大運";
  for (const name of stars) {
    const s = STAR_YEAR[name];
    if (!s) continue;
    let t = s.t, d = { ...s.d }, tags = [...s.tags], w = s.w, tone = s.tone, notes = s.n ? { ...s.n } : null, change = s.change ? [...s.change] : [];
    const o = (STAR_STAGE[stage] || {})[name];
    if (o) { t = o.t; d = { ...o.d }; tags = [...o.tags]; notes = null; if (!d.move) change = []; }
    if (LOVE_STARS.has(name) && kid) {
      t = name === "天喜" ? "逢天喜：家中容易有喜事" : `逢${name}：年紀還小，多表現為人緣好、討人喜歡`;
      d = name === "天喜" ? { family: 0.3 } : {};
      tags = [];
      w = 2;
      notes = name === "天喜" ? { family: "逢天喜，家中容易有喜事" } : { family: `逢${name}，人緣好、討人喜歡` };
      change = [];
    } else if (LOVE_STARS.has(name) && teen) {
      t = name === "天喜" ? "逢天喜：家中容易有喜事，自己也容易有心動的對象" : `逢${name}：人緣好，容易有心儀的對象`;
      d = { love: 0.2 };
      w -= 1.5;
      tags = ["romance"];
      notes = null;
    } else if (LOVE_STARS.has(name) && stage === "senior") {
      if (name === "天喜") { t = "逢天喜：家中容易有喜事，如子孫的婚嫁、添丁"; d = { family: 0.4 }; tags = []; notes = { family: "逢天喜，家中容易有子孫婚嫁、添丁的喜事" }; }
      else { t = `逢${name}：人緣好、社交活動多，夫妻感情也容易回溫`; d = { love: 0.2, family: 0.1 }; tags = ["romance"]; w -= 2; notes = null; }
    }
    // 祿 and 羊刃 are the day master's own element: a strong chart takes them as more 比劫, a weak one as help.
    if (name === "祿神" && !o && bad(c, c.dm)) {
      const [who, short] = c.strength === "從弱" ? ["從格忌比劫幫身，逢祿反", "從格逢祿反"] : c.strength === "中和" ? ["日主略偏強，逢之也", "日主略偏強，逢祿也"] : ["身強逢之也", "身強逢祿也"];
      t = `${t}；不過祿也是比劫，${who}主開銷與競爭`; d = { career: 0.2, wealth: 0 }; tone = "中"; notes = { career: `逢祿，工作有著落，但${short}主開銷與競爭` };
    }
    if (name === "羊刃" && !o && good(c, c.dm)) { t = `逢羊刃：${c.strength === "專旺" ? "旺上加旺，順勢敢衝" : c.strength === "中和" ? "日主略偏弱，逢刃反能扛事" : "身弱逢刃，反能扛事"}、敢做決定；但也要防衝動與受傷`; tone = "中"; d = { health: -0.2 }; notes = { health: "逢羊刃，敢做決定，但也要防衝動與受傷" }; }
    if (name === "流霞" && c.sex === "female" && stage === "adult") t = `${t}；女命也要留意生產`;
    if ((name === "文昌貴人" || name === "學堂") && student) w += 1.5;
    const body = t.split("：").slice(1).join("：");
    const text = name === "空亡" ? `${lead}${br(P.branch)}落入日柱旬空（空亡）：${body}`
      : name === "桃花" ? `${lead}逢桃花（${P.branch}為咸池）：${body}`
        : name === "驛馬" ? `${lead}逢驛馬（${P.branch}為驛馬）：${body}`
          : name === "紅鸞" && !kid && !teen ? `${lead}紅鸞星動：${body}`
            : `${lead}${t}`;
    const short = name === "桃花" ? `${P.branch}是你的桃花` : name === "驛馬" ? `${P.branch}是你的驛馬` : name === "紅鸞" && !kid ? `${lead}紅鸞星動` : name === "空亡" ? `${lead}${P.branch}落入空亡` : `${lead}逢${STAR_SHORT[name] || name}`;
    const noteText = notes ? Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, `${lead}${v}`])) : Object.fromEntries(Object.keys(d).filter(k => d[k]).map(k => [k, text]));
    out.push(signal(`star.${name}`, { kind: "star", tone, weight: w, domains: d, change, tags, text, short, notes: noteText }));
  }
  return out;
}

// ---------- 太歲 ----------
const SPIRIT_YEAR = {
  太陽: { w: 3.5, tone: "吉", d: { career: 0.3 }, tags: ["helper", "promotion"], t: "流年太陽星照：容易得到男性長輩或上司的提拔" },
  太陰: { w: 3.5, tone: "吉", d: { family: 0.2, love: 0.1 }, tags: ["helper"], t: "流年太陰星照：容易得到女性貴人的幫忙，家庭和睦" },
  喪門: { w: 4.5, tone: "凶", d: { family: -0.3 }, tags: ["parents", "elders"], t: "流年逢喪門：傳統上要多關心家中長輩的健康，自己心情也容易低落，宜多安排開心的事" },
  官符: { w: 4, tone: "凶", d: { career: -0.3 }, tags: ["conflict", "jobLoss"], t: "流年逢官符：要防口舌是非與合約、官司糾紛，簽約與開車都守規矩" },
  死符: { w: 3.5, tone: "凶", d: { health: -0.2 }, tags: ["illness"], t: "流年逢死符：傳統上主小病與不順，宜保守、多休息" },
  龍德: { w: 4, tone: "吉", d: { career: 0.3, wealth: 0.2 }, tags: ["helper", "promotion", "gain"], t: "流年逢龍德：逢凶化吉，容易有貴人相助" },
  白虎: { w: 5.5, tone: "凶", d: { health: -0.4 }, tags: ["injury", "health"], t: "流年逢白虎：傳統上要防血光與開刀，開車、運動多小心" },
  福德: { w: 4, tone: "吉", d: { wealth: 0.3, family: 0.2 }, tags: ["gain", "helper"], t: "流年逢福德：福氣與財運都不錯，人緣也好" },
  吊客: { w: 3.5, tone: "凶", d: { family: -0.2 }, tags: ["parents", "elders"], t: "流年逢吊客：傳統上要多關心親友長輩的健康，心情容易低落" },
  病符: { w: 4.5, tone: "凶", d: { health: -0.4 }, tags: ["illness", "health"], t: "流年逢病符：要留意身體的小毛病，作息規律、定期檢查" },
};
const SPIRIT_STAGE = {
  child: {
    太陽: { t: "流年太陽星照：容易得到長輩、老師的疼愛", d: { family: 0.2 }, dom: "family", tags: [] },
    太陰: { t: "流年太陰星照：容易得到女性長輩的照顧，家庭和睦", d: { family: 0.2 }, dom: "family", tags: [] },
    官符: { t: "流年逢官符：要防口角，和同學好好相處", d: {}, dom: "family", tags: [] },
    白虎: { t: "流年逢白虎：傳統上要防跌倒、碰撞受傷，出入多小心", d: { health: -0.3 }, dom: "health", tags: ["injury"] },
    福德: { t: "流年逢福德：福氣好，人緣也好", d: { family: 0.2 }, dom: "family", tags: [] },
    龍德: { t: "流年逢龍德：逢凶化吉，容易有長輩照顧", d: { family: 0.2 }, dom: "family", tags: [] },
  },
  teen: {
    太陽: { t: "流年太陽星照：容易得到男性長輩或師長的提拔", d: { study: 0.2 }, dom: "study", tags: ["helper"] },
    官符: { t: "流年逢官符：要防口舌是非，和同學、師長好好溝通", d: {}, dom: "family", tags: ["conflict"] },
  },
  senior: {
    太陽: { t: "流年太陽星照：容易得到貴人照應，受晚輩敬重", d: { family: 0.2 }, dom: "family", tags: ["helper"] },
    官符: { t: "流年逢官符：要防口舌是非與合約糾紛，簽約、開車都守規矩", d: { family: -0.1 }, dom: "family", tags: ["conflict"] },
  },
};
const SPIRIT_DOMAIN = { 太陽: "career", 太陰: "family", 喪門: "family", 官符: "career", 死符: "health", 龍德: "career", 白虎: "health", 福德: "wealth", 吊客: "family", 病符: "health" };

function taisuiSignals(c, W, yearRels) {
  const P = W.P, fb = P.branch, yb = c.yearBranch, t = taisui(yb, fb), out = [];
  const kid = W.stage === "child";
  const kinds = new Set(yearRels.map(r => r.kind));
  let text = "";
  if (t.kinds.length) {
    const primary = t.kinds[0];
    const z = `屬${c.zodiac}逢${ZODIAC[fb]}年`;
    const young = W.stage === "child" || W.stage === "teen";
    const merged = ["相刑", "六害", "相破", "六合"].filter(k => kinds.has(k)).map(k => ({ 相刑: "相刑", 六害: "相害", 相破: "相破", 六合: "相合" })[k]);
    const how = merged.length > 2 ? `${merged.map(x => x.slice(1)).join("、")}並見` : merged.length > 1 ? merged.join("又") : merged[0] || "";
    const tail = "傳統上會到廟裡安太歲，祈求平安";
    let o;
    if (primary === "值太歲") {
      const self = "辰午酉亥".includes(fb) ? `；${fb}${fb}自刑，也容易自尋煩惱，放寬心最重要` : "";
      const fuyin = kinds.has("伏吟") ? `；流年與年柱完全相同（伏吟），長輩與家族的舊事容易重提` : "";
      o = {
        weight: 7.5, tone: "凶", domains: { health: -0.2, career: kid ? 0 : -0.1 }, change: ["career", "move", "family"], tags: ["upheaval", "jobChange", "move"],
        text: `本命年值太歲（${z}，流年${fb}與年支同支）：一年裡變動較多，凡事穩紮穩打；${tail}${self}${fuyin}`,
        short: "本命年值太歲",
        notes: { career: "本命年值太歲，工作上變動較多，宜穩紮穩打", move: "值太歲，生活環境容易變動", family: "值太歲，傳統上會安太歲，祈求闔家平安", health: "本命年作息宜規律" },
        headline: "本命年值太歲，宜穩紮穩打",
      };
      if (kid) delete o.notes.career;
    } else if (primary === "沖太歲") {
      const fan = kinds.has("反吟") ? `；流年與年柱${c.byRole.year.name}天剋地沖（反吟），長輩與家族的事更要多留意` : "";
      o = {
        weight: 7.5, tone: "凶", domains: { career: kid ? 0 : -0.2, wealth: -0.3, family: -0.3 }, change: ["career", "move", "family"], tags: ["upheaval", "move", "abroad", "jobChange", "elders"],
        text: `${br(fb)}沖年支${br(yb)}（沖太歲、歲破）：${z}，年柱主祖上與長輩，這一年變動大，${young ? "搬家、轉學的機會多" : W.stage === "senior" ? "搬遷、生活環境的變動多" : "搬遷、換工作的機會多"}，大事宜三思；${tail}${fan}`,
        short: `${fb}沖年支${yb}，沖太歲`,
        notes: { move: `${br(fb)}沖年支${br(yb)}（沖太歲、歲破），搬遷、離家的機會多`, career: "歲破之年，工作變動大，大事宜三思", family: `${br(fb)}沖年支${br(yb)}，年柱主長輩，宜多關心家中長輩`, wealth: "歲破主破耗，投資宜保守" },
        headline: "沖太歲（歲破），大事宜三思",
      };
      if (kid) delete o.notes.career;
    } else if (primary === "刑太歲") {
      const pu = yearRels.find(r => r.kind === "相刑");
      const name = pu ? pu.name : "";
      o = {
        weight: 5, tone: "凶", domains: { career: kid ? 0 : -0.2, family: -0.1 }, change: ["career"], tags: ["conflict", "upheaval"],
        text: `${br(fb)}與年支${br(yb)}${how || "相刑"}（刑太歲${name ? `，${name}` : ""}）：${young ? "和同學、長輩之間容易有摩擦" : "人際與合約上容易有摩擦"}，${PUNISH_MEANING[name] || "宜多忍讓"}；${tail}`,
        short: `${fb}刑年支${yb}，刑太歲`,
        notes: { career: `${br(fb)}刑年支${br(yb)}（刑太歲），人際與合約上容易有摩擦`, family: "刑太歲，與長輩溝通多一點耐心" },
      };
    } else if (primary === "害太歲") {
      o = {
        weight: 4.5, tone: "凶", domains: { career: kid ? 0 : -0.15 }, change: ["career"], tags: ["conflict"],
        text: `${br(fb)}與年支${br(yb)}${how || "相害"}（害太歲）：要防小人暗中掣肘，人際宜低調；${tail}`,
        short: `${fb}害年支${yb}，害太歲`,
        notes: { career: `${br(fb)}害年支${br(yb)}（害太歲），要防小人暗中掣肘` },
      };
    } else {
      o = {
        weight: 3.5, tone: "中", domains: {}, change: [], tags: [],
        text: `${br(fb)}與年支${br(yb)}${how || "相破"}（破太歲）：計畫容易被打斷，影響較輕；${tail}`,
        short: `${fb}破年支${yb}，破太歲`,
        notes: { family: `${br(fb)}破年支${br(yb)}（破太歲），計畫容易被打斷，影響較輕` },
      };
    }
    out.push(signal(`taisui.${primary}`, { kind: "taisui", ...o }));
    text = o.text;
  }
  if (t.spirit !== "太歲" && t.spirit !== "歲破") {
    const base = SPIRIT_YEAR[t.spirit], o = (SPIRIT_STAGE[W.stage] || {})[t.spirit];
    const body = o ? o.t : base.t, dom = o ? o.dom : SPIRIT_DOMAIN[t.spirit];
    out.push(signal(`spirit.${t.spirit}`, { kind: "spirit", tone: base.tone, weight: base.w, domains: o ? o.d : base.d, tags: o ? o.tags : base.tags, text: body, short: `流年逢${t.spirit}`, notes: { [dom]: body } }));
    if (!text) text = body;
  }
  return { list: out, taisui: { spirit: t.spirit, kinds: t.kinds, text: end(text) } };
}

// ---------- 大運 in a year ----------
// 「十年以事業與責任為主軸」, and whether the decade also carries the spouse star (男命財、女命官殺).
function decadeTheme(c, P, stage) {
  const T = THEME[stage] || THEME.adult;
  const gs = GOD_GROUP[P.gods.stem], gb = GOD_GROUP[P.gods.branch];
  const spouse = stage === "adult" && ((c.sex === "male" && (gs === "財" || gb === "財")) || (c.sex === "female" && (gs === "官殺" || gb === "官殺")));
  return { base: gs === gb ? T[gs] : `${T[gs]}、${T[gb]}`, spouse };
}
const themeLine = t => `十年以${t.base}為主軸${t.spouse ? "，感情婚姻也是重點" : ""}`;

// The decade's own signals (god, contacts with the chart, combinations, stars), with its notes per domain.
function decadeSignals(c, d, stage, age) {
  const P = pillarInfo(c, d.name);
  const W = { mode: "decade", who: "大運", now: "這十年", stage, age, P, D: null };
  const rels = luckRelations(c.names, d.name);
  const stars = luckStars(c.starCtx, d.name);
  const sigs = unique([...godSignals(c, W), ...pairsOf(c, W, rels), ...multiSignals(c, W, rels), ...comboSignals(c, W), ...starSignals(c, W, stars)]);
  return { P, W, rels, stars, sigs };
}

// The first signal of each id: the palaces are read day, month, hour, year, decade, so the closest palace speaks.
// A 半合 or 拱合 inside a whole 三合 or 三會 of the same element is part of it: it keeps its palace note but has no
// bullet and no effect of its own.
const unique = list => {
  const seen = new Set(), whole = new Set(list.filter(s => s.id === "rel.triad" || s.id === "rel.meet").map(s => s.element));
  return list.filter(s => !seen.has(s.id) && seen.add(s.id)).map(s => {
    if (!whole.has(s.element) || !/^rel\.(half|arch)\./.test(s.id)) return s;
    const folded = { ...s, point: false, domains: {} };
    delete folded.lead;
    return folded;
  });
};

function pairsOf(c, W, rels) {
  const focus = W.mode === "flow" ? "flow" : "decade";
  const byOther = new Map();
  for (const r of rels) {
    if (r.kind === "三合" || r.kind === "三會" || r.kind === "三刑") continue;
    const other = r.roles.find(x => x !== focus);
    if (!other) continue;
    if (!byOther.has(other)) byOther.set(other, []);
    byOther.get(other).push(r);
  }
  const order = ["day", "month", "hour", "year", "decade"];
  return [...byOther].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).flatMap(([other, list]) => pairSignals(c, W, other, list));
}

// The best note of each domain among signals, strongest first.
function notesByDomain(sigs) {
  const out = {};
  for (const d of DOMAINS) {
    const list = sigs.filter(s => s.notes[d] && !s.context).map(s => ({ s, score: (Math.abs(s.domains[d] || 0) + 0.3) * s.weight + (s.lead && s.lead.includes(d) ? 20 : 0) }));
    list.sort((a, b) => b.score - a.score);
    out[d] = list.map(x => ({ id: x.s.id, text: x.s.notes[d], short: (x.s.shorts && x.s.shorts[d]) || x.s.short, weight: x.s.weight, score: x.score, effect: x.s.domains[d] || 0 }));
  }
  return out;
}

// ---------- domains ----------
const BASE = { career: 0.8, wealth: 0.8, love: 0.5, health: 0.7, study: 0.6, family: 0.6, move: 0.4 };
// 遷移 is read by how much the year moves you (驛馬、沖日支、沖月令、沖太歲、交運…): a favourable year makes it a
// chance to go out (利於遷動), an unfavourable one busy travel or a forced move (奔波).
const MOVE_PUSH = 0.55;
function domainLevels(sigs, L, stage) {
  const amp = sigs.reduce((m, s) => Math.max(m, s.amplify || 1), 1);
  const out = {};
  for (const d of DOMAINS) {
    let x = BASE[d] * L;
    for (const s of sigs) if (!s.context) x += s.domains[d] || 0;
    if (d === "move") for (const s of sigs) if (!s.context && s.change.includes("move")) x += MOVE_PUSH * (L < -0.2 ? -1 : 1);
    x *= amp;
    out[d] = clampLevel(x);
    if (stage === "child" && (d === "career" || d === "love")) out[d] = 0;
  }
  return out;
}

function fallbackText(c, d, W) {
  const stage = W.stage, kid = stage === "child", teen = stage === "teen", span = W.mode === "flow" ? "今年" : "這十年";
  const day = c.byRole.day, month = c.byRole.month, cai = elementOf(c.dm, "財");
  switch (d) {
    case "career": return kid ? "年紀尚小，事業不論；這一項多看父母的工作與家運" : teen ? "學生以學業為重，工作運沒有特別的訊號" : `${span}和月令${br(month.branch)}（事業根基）沒有明顯的沖合，工作以穩定為主，按部就班即可`;
    case "wealth": return kid ? "家境平穩，沒有特別的財務訊號" : `${span}財星（${cai}）不現，也沒有沖動財庫，財運平平，以守成、量入為出為主`;
    case "love": return kid ? "年紀尚小，感情不論" : teen ? "感情上沒有特別的訊號，以學業和友誼為重" : `夫妻宮（日支${br(day.branch)}）${span}沒有逢沖合，${c.sex === "male" ? "財星" : "官星"}也不現，感情以平穩為主`;
    case "health": return c.useful ? `用神${c.useful}${span}未受沖剋，健康大致平穩，作息規律、定期檢查即可` : `${span}沒有明顯的健康警訊，作息規律即可`;
    case "study": return stage === "senior" ? "適合培養興趣、輕鬆學習，沒有特別的壓力" : `${span}印星與文昌不現，學習靠自己的規律與耐心`;
    case "family": return `年柱、月柱${c.byRole.hour ? "、時柱" : ""}${span}都沒有逢沖，家中大致和順`;
    case "move": return `${span}不逢驛馬，也沒有沖動日支、月令，生活環境以穩定為主`;
    default: return "";
  }
}

function domainsOf(c, W, sigs, L) {
  const levels = domainLevels(sigs, L, W.stage), byD = notesByDomain(sigs), out = {};
  for (const d of DOMAINS) {
    // The strongest note always stays; the second is the best one that agrees with the level; agreeing notes lead.
    const lv = levels[d], agree = x => (lv && x.effect && Math.sign(x.effect) === Math.sign(lv) ? 1 : 0);
    const all = byD[d].filter((x, i, a) => a.findIndex(y => y.text === x.text) === i);
    const top = all[0], rest = all.slice(1).sort((a, b) => agree(b) - agree(a) || b.score - a.score);
    const list = (top ? [top, ...rest.slice(0, 1)] : []).sort((a, b) => agree(b) - agree(a));
    const kidSkip = W.stage === "child" && (d === "career" || d === "love");
    const text = kidSkip || !list.length ? end(fallbackText(c, d, W)) : joinNotes(list.map(x => x.text));
    out[d] = { level: levels[d], text, basis: kidSkip ? [] : list.map(x => x.id) };
  }
  return out;
}

// ---------- the year ----------
function decadeOfAge(chart, xu) {
  const ds = chart.luck.decades;
  let i = ds.findIndex(d => xu >= d.startAge && xu <= d.endAge);
  if (i < 0 && xu > ds[ds.length - 1].endAge) i = ds.length - 1;
  return i;
}

// A decade's signals, cached per chart, decade and stage of life.
function decadeOf(c, di, stage, age) {
  const key = `${di}:${stage}`;
  if (!c.decades.has(key)) c.decades.set(key, decadeSignals(c, c.chart.luck.decades[di], stage, age));
  return c.decades.get(key);
}
const compact = s => ({ id: s.id, tone: s.tone, weight: s.weight, domains: s.domains, tags: s.tags, text: s.text, short: s.short, ...(s.shorts ? { shorts: s.shorts } : {}), notes: s.notes });

// One year, cached per chart: the signals and everything said from them. yearReading and the key years of a decade
// share it, so the page can ask for every age without recomputing.
function buildYear(c, age) {
  if (c.years.has(age)) return c.years.get(age);
  const chart = c.chart, flow = chart.years[age];
  if (!flow) return null;
  const xu = age + 1, di = decadeOfAge(chart, xu), dec = di >= 0 ? chart.luck.decades[di] : null;
  const stage = stageOf(age);
  const P = pillarInfo(c, flow.name);
  const D = dec ? pillarInfo(c, dec.name) : null;
  const W = { mode: "flow", who: "流年", now: "今年", stage, age, P, D };
  const rels = luckRelations(c.names, dec ? dec.name : null, flow.name);
  const stars = luckStars(c.starCtx, flow.name);
  const yearRels = rels.filter(r => r.roles.length === 2 && r.roles.includes("year") && r.roles.includes("flow"));
  const ts = taisuiSignals(c, W, yearRels);
  const sigs = unique([favorSignal(c, W), ...godSignals(c, W), ...pairsOf(c, W, rels), ...multiSignals(c, W, rels), ...comboSignals(c, W), ...ts.list, ...starSignals(c, W, stars)]);

  // The decade as context: its theme, its own signals (for eventReason) and the 交運 year.
  let decade = null;
  if (dec) {
    const ds = decadeOf(c, di, stage, age);
    const dscore = (fav(c, D.stemEl) + fav(c, D.branchEl)) / 2;
    const dtone = dscore >= 0.25 ? "吉" : dscore <= -0.25 ? "凶" : "平";
    const theme = decadeTheme(c, D, stage);
    decade = {
      index: di, name: dec.name, gods: { ...D.gods }, startAge: dec.startAge, endAge: dec.endAge, startYear: dec.startYear, endYear: dec.endYear,
      favor: { stem: markOf(fav(c, D.stemEl)), branch: markOf(fav(c, D.branchEl)), tone: dtone }, theme: theme.base,
      signals: ds.sigs.filter(x => !(stage === "child" && x.tags.length === 0 && x.kind === "star")).map(compact),
    };
    const roleBit = D.stemEl === D.branchEl ? `${D.stemEl}為${c.roles[D.stemEl]}`
      : c.roles[D.stemEl] === c.roles[D.branchEl] ? `${D.stemEl}、${D.branchEl}都是${c.roles[D.stemEl]}` : `${D.stemEl}為${c.roles[D.stemEl]}、${D.branchEl}為${c.roles[D.branchEl]}`;
    const toneBit = dtone === "吉" ? "整體向上" : dtone === "凶" ? "宜穩紮穩打" : "起伏平和";
    sigs.push(signal("decade", { kind: "decade", tone: dtone === "平" ? "中" : dtone, weight: 5, text: `大運${dec.name}（${D.gods.stem}／${D.gods.branch}），${roleBit}：${themeLine(theme)}，${toneBit}`, short: `走${dec.name}大運（${D.gods.stem}）`, context: true }));
    if (xu === dec.startAge) {
      const prev = di > 0 ? chart.luck.decades[di - 1] : null;
      const from = prev ? `從${prev.name}（${prev.gods.stem}／${prev.gods.branch}）換到${dec.name}（${D.gods.stem}／${D.gods.branch}）` : `從童限進入第一步大運${dec.name}（${D.gods.stem}／${D.gods.branch}）`;
      sigs.push(signal("decade.enter", {
        kind: "decade", tone: "中", weight: 7, change: ["career", "move"], tags: stage === "child" ? ["move"] : ["jobChange", "move", "retire"],
        text: `今年交入${dec.name}大運（虛歲 ${dec.startAge}）：${from}，生活重心與節奏容易明顯轉換，交運前後宜穩`,
        short: `交入${dec.name}大運`, headline: `交入${dec.name}大運，生活重心轉換`,
        notes: stage === "child" ? { move: "交運之年，生活環境容易有變動" } : { career: `交入${dec.name}大運，工作重心容易轉換`, move: "交運之年，生活環境容易有變動", family: "交運之年，家中的安排也容易跟著調整" },
      }));
    }
  } else {
    const first = chart.luck.decades[0];
    sigs.push(signal("childhood", { kind: "decade", tone: "中", weight: 2, text: `童限：${first.startYear} 年（虛歲 ${first.startAge}）起運前，命理上看本命與流年，小孩的流年多看健康、學習與父母`, short: "童限（尚未起運）", context: true }));
  }

  // Tone: the year's elements (0.6) and the decade's (0.4), as luck.js weighs them, nudged by the strongest contacts.
  const fs = fav(c, P.stemEl), fb = fav(c, P.branchEl);
  const dscore = D ? (fav(c, D.stemEl) + fav(c, D.branchEl)) / 2 : 0;
  const L = 0.6 * (fs + fb) / 2 + 0.4 * dscore;
  const nudge = sigs.filter(x => !x.context && x.kind !== "god" && x.kind !== "star").reduce((n, x) => n + (x.tone === "吉" ? 1 : x.tone === "凶" ? -1 : 0) * x.weight * 0.012, 0);
  const amp = sigs.reduce((m, x) => Math.max(m, x.amplify || 1), 1);
  const score = round2(Math.max(-1, Math.min(1, (L + nudge) * amp)));
  const tone = score >= 0.25 ? "吉" : score <= -0.25 ? "凶" : "平";

  const out = {
    year: flow.year, age, xu, pillar: flow.name, sex: c.sex, stage,
    gods: { stem: P.gods.stem, branch: P.gods.branch },
    hidden: P.hidden.map(h => ({ stem: h.stem, god: h.god })),
    decade,
    favor: { stem: markOf(fs), branch: markOf(fb), tone, score },
    relations: rels.map(r => ({ kind: r.kind, roles: r.roles, ...(r.element ? { element: r.element } : {}), ...(r.name ? { name: r.name } : {}), text: r.text })),
    stars: stars.filter(x => STAR_YEAR[x]).map(x => ({ name: x, nature: STAR_YEAR[x].tone, text: sigs.find(z => z.id === `star.${x}`).text })),
    taisui: ts.taisui,
    domains: domainsOf(c, W, sigs, L + nudge),
    headline: headlineOf(c, W, sigs, tone, dec),
    points: pointsOf(sigs),
    signals: sigs,
  };
  c.years.set(age, out);
  return out;
}

export function yearReading(chart, analysis, age) {
  const y = buildYear(contextOf(chart, analysis), age);
  return y ? { ...y } : null;
}

// The bullets: the base line (十神與喜忌) and the strongest signals by weight, the decade as background last.
function pointsOf(sigs) {
  const pool = sigs.filter(s => s.point !== false && (!s.context || s.id === "favor")).sort((a, b) => b.weight - a.weight);
  const ctx = sigs.some(s => s.id === "decade.enter") ? null : sigs.find(s => s.id === "decade" || s.id === "childhood");
  const list = pool.slice(0, ctx ? 7 : 8).map(s => s.text);
  if (ctx) list.push(ctx.text);
  return list;
}

// tone is the year's overall tone, which also weighs the decade (0.4): when the decade turns the year's own lean, the
// headline says so, so that a 喜用 year in a 忌 decade does not read 整體順勢 next to 平.
function headlineOf(c, W, sigs, tone, dec) {
  const P = W.P, D = W.D, gs = P.gods.stem, gb = P.gods.branch, Gs = GOD_GROUP[gs], Gb = GOD_GROUP[gb];
  const godBit = W.stage === "child" ? (Gs === Gb ? `${GROUP_WORD[Gs]}干支同現` : `${GROUP_WORD[Gs]}、${GROUP_WORD[Gb]}並見`)
    : gs === gb ? `${gs}干支同現` : `${gs}透干、${gb}坐支`;
  const fv = sigs.find(s => s.id === "favor");
  let top = sigs.filter(s => !s.context && s.kind !== "god" && s.point !== false && s.weight >= 6).sort((a, b) => b.weight - a.weight)[0];
  const dscore = D ? (fav(c, D.stemEl) + fav(c, D.branchEl)) / 2 : 0;
  const entering = top && top.id === "decade.enter";
  // The year's own lean against its overall tone: the decade (when it is clearly 喜 or 忌) or, failing that, the year's
  // contacts explain the difference.
  const own = fv.tone === "中" ? "平" : fv.tone;
  let favorBit = fv.headline, turned = false;
  if (own !== tone) {
    turned = true;
    const badDecade = dec && dscore <= -0.25, goodDecade = dec && dscore >= 0.25;
    if (badDecade && own === "吉") favorBit = `${fv.short}，但${entering ? `今年交入${dec.name}忌運` : `${dec.name}大運為忌`}，順中有阻`;
    else if (badDecade && own === "平" && tone === "凶") favorBit = `${fv.headline}，又逢${dec.name}忌運`;
    else if (goodDecade && own === "凶") favorBit = `${fv.short}，幸有${entering ? `新交的${dec.name}大運` : `${dec.name}大運`}扶持，阻力減輕`;
    else if (goodDecade && own === "平" && tone === "吉") favorBit = `${fv.headline}，得${dec.name}大運扶持`;
    else if (own === "吉") favorBit = `${fv.short}，${tone === "平" ? "整體平穩" : "但沖剋較重，宜穩"}`;
    else if (own === "凶") favorBit = `${fv.short}，${tone === "平" ? "但整體阻力不大" : "但整體仍有助力"}`;
    else turned = false;
  }
  if (entering && favorBit.includes("交")) top = null;
  const lead = `${P.name}年${godBit}，${favorBit}`;
  if (!top) return end(lead);
  const turn = !turned && ((top.tone === "凶" && fv.tone === "吉") || (top.tone === "吉" && fv.tone === "凶")) ? "；但" : "；";
  const line = `${lead}${turn}${top.headline || top.short}`;
  return end(line.length > 64 ? lead : line);
}

// ---------- the decade ----------
// keyYears: false leaves out the two key years of the decade (each needs the reading of all ten years), for a reader
// that lists every year anyway.
export function decadeReading(chart, analysis, index, { keyYears: withKeyYears = true } = {}) {
  const c = contextOf(chart, analysis);
  const d = chart.luck.decades[index];
  if (!d) return null;
  const midAge = Math.max(0, d.startAge + 3);
  const stage = stageOf(midAge);
  const { P, W, rels, stars, sigs } = decadeOf(c, index, stage, midAge);
  const fs = fav(c, P.stemEl), fb = fav(c, P.branchEl), score = round2((fs + fb) / 2);
  const tone = score >= 0.25 ? "吉" : score <= -0.25 ? "凶" : "平";
  const favor = { stem: markOf(fs), branch: markOf(fb), tone, score };
  const theme = decadeTheme(c, P, stage);
  const roleBit = P.stemEl === P.branchEl ? `${st(P.stem)}、${br(P.branch)}都是你的${c.roles[P.stemEl]}`
    : c.roles[P.stemEl] === c.roles[P.branchEl] ? `${st(P.stem)}、${br(P.branch)}都是你的${c.roles[P.stemEl]}` : `${st(P.stem)}為${c.roles[P.stemEl]}、${br(P.branch)}為${c.roles[P.branchEl]}`;
  const fv = favorSignal(c, W);
  const half = d.startYear + 4;
  const s1 = `${d.name}大運（虛歲 ${d.startAge}–${d.endAge}，${d.startYear}–${d.endYear} 年）：天干${st(P.stem)}為${P.gods.stem}、地支${br(P.branch)}為${P.gods.branch}，${themeLine(theme)}。`;
  const ms = favor.stem, mb = favor.branch;
  const verdict = ms === "喜" && mb === "喜" ? "干支皆為喜用，是一步向上的好運"
    : ms === "喜" && mb === "忌" ? `傳統看法前五年重天干、後五年重地支，前五年（${d.startYear}–${half}）較順，後五年（${half + 1}–${d.endYear}）宜守成`
      : ms === "忌" && mb === "喜" ? `傳統看法前五年重天干、後五年重地支，前五年（${d.startYear}–${half}）阻力較多，後五年（${half + 1}–${d.endYear}）漸入佳境`
        : ms === "忌" && mb === "忌" ? "干支皆忌，十年裡宜穩紮穩打、多累積實力，不宜冒進"
          : ms === "喜" || mb === "喜" ? "喜用得力，整體小吉"
            : ms === "忌" || mb === "忌" ? "略有阻力，宜穩健行事"
              : "喜忌平和，運勢起伏不大";
  const s2 = `${roleBit}，${verdict}。`;
  const contacts = sigs.filter(s => (s.kind === "rel" || s.kind === "combo") && s.point !== false).sort((a, b) => b.weight - a.weight).slice(0, 2);
  const s3 = contacts.length ? end(contacts.map(s => s.text.replace(/。$/, "")).join("；")) : "這步運和命局沒有明顯的刑沖合害，十年的走勢主要看喜忌。";
  // Rise and care: the decade's own domain levels.
  const levels = domainLevels(sigs, score, stage);
  const skip = x => stage === "child" && (x === "career" || x === "love");
  const rise = DOMAINS.filter(x => levels[x] >= 1 && !skip(x)).sort((a, b) => levels[b] - levels[a]).slice(0, 2);
  const care = DOMAINS.filter(x => levels[x] <= -1 && !skip(x)).sort((a, b) => levels[a] - levels[b]).slice(0, 2);
  const young = stage === "child" || stage === "teen";
  const keyStars = stars.filter(x => STAR_GLOSS[x] && !(young && LOVE_STARS.has(x))).slice(0, 2);
  const starBit = keyStars.length ? `大運帶${keyStars.map(x => `${x}（${STAR_GLOSS[x]}）`).join("、")}；` : "";
  const dn = x => (young && x === "wealth" ? "家境" : DOMAIN_NAME[x]);
  const s4 = rise.length || care.length
    ? `${starBit}這十年${rise.length ? `${rise.map(dn).join("、")}較有發揮` : ""}${rise.length && care.length ? "，" : ""}${care.length ? `${care.map(dn).join("、")}要多照顧` : ""}。`
    : `${starBit}這十年各方面起伏不大，穩中求進。`;
  const keyYears = withKeyYears ? keyYearsOf(c, d) : [];
  const keyBit = keyYears.length ? `；十年中 ${keyYears.map(k => `${k.year} ${k.pillar}年${k.note}`).join("、")}，較為關鍵` : "";
  const s5 = `${d.startYear} 年（虛歲 ${d.startAge}）交運，交運前後生活節奏容易轉換${keyBit}。`;
  const headline = end(`${d.name}大運（${P.gods.stem}／${P.gods.branch}）：${fv.headline}，十年以${theme.base}為主軸`);
  return {
    index, name: d.name, startAge: d.startAge, endAge: d.endAge, startYear: d.startYear, endYear: d.endYear,
    gods: { stem: P.gods.stem, branch: P.gods.branch }, favor, tone,
    relations: rels.map(r => ({ kind: r.kind, roles: r.roles, ...(r.element ? { element: r.element } : {}), ...(r.name ? { name: r.name } : {}), text: r.text })),
    stars: stars.filter(x => STAR_YEAR[x]).map(x => ({ name: x, nature: STAR_YEAR[x].tone, text: sigs.find(z => z.id === `star.${x}`).text })),
    headline, text: [s1, s2, s3, s4, s5].join(""), sentences: [s1, s2, s3, s4, s5],
    domains: Object.fromEntries(DOMAINS.map(x => [x, levels[x]])),
    keyYears, signals: sigs,
  };
}

// The years of a decade with the strongest contacts (反吟、歲運並臨、沖日支、沖月令、犯太歲…), at most two.
const KEY_NOTE = {
  "rel.fanyin.day": "與日柱天剋地沖", "rel.suiyun": "歲運並臨", "rel.fanyin.month": "與月柱天剋地沖", "rel.clash.day": "沖日支",
  "rel.fanyin.hour": "與時柱天剋地沖", "rel.fanyin.decade": "與大運天剋地沖", "rel.fuyin.day": "伏吟日柱", "rel.clash.month": "沖月令",
  "taisui.沖太歲": "沖太歲", "taisui.值太歲": "值太歲", "combo.傷官見官": "傷官見官", "rel.combine.day": "合日支", "star.紅鸞": "紅鸞星動",
};
const KEY = Object.keys(KEY_NOTE);
function keyYearsOf(c, d) {
  const out = [];
  for (let xu = d.startAge; xu <= d.endAge; xu++) {
    const y = buildYear(c, xu - 1);
    if (!y) continue;
    const hit = y.signals.filter(s => KEY.includes(s.id)).sort((a, b) => KEY.indexOf(a.id) - KEY.indexOf(b.id))[0];
    if (hit) out.push({ year: y.year, age: y.age, xu: y.xu, pillar: y.pillar, id: hit.id, note: KEY_NOTE[hit.id], rank: KEY.indexOf(hit.id) });
  }
  return out.sort((a, b) => a.rank - b.rank || a.year - b.year).slice(0, 2).sort((a, b) => a.year - b.year).map(k => { const out = { ...k }; delete out.rank; return out; });
}

// ---------- events ----------
// What explains each kind of event: signal tags, most fitting first, and the direction the signal must point. A tag
// only sits on a signal when it really says so for this chart and this sex (男命財為妻、女命官為夫…).
const KINDS = {
  dating: { domain: "love", noun: "感情", dir: "good", tags: ["marriage", "romance"] },
  marriage: { domain: "love", noun: "婚姻", dir: "good", tags: ["marriage", "romance"] },
  breakup: { domain: "love", noun: "感情", dir: "bad", tags: ["spouseClash", "rival", "lonely"] },
  divorce: { domain: "love", noun: "婚姻", dir: "bad", tags: ["spouseClash", "rival", "lonely", "upheaval"] },
  crisis: { domain: "love", noun: "婚姻", dir: "bad", tags: ["spouseClash", "rival", "lonely"] },
  childbirth: { domain: "family", noun: "子女", dir: "good", tags: ["birth", "children"] },
  illness: { domain: "health", noun: "健康", dir: "bad", tags: ["illness", "health", "upheaval"], care: true },
  injury: { domain: "health", noun: "健康", dir: "bad", tags: ["injury", "health", "upheaval"], care: true },
  job: { domain: "career", noun: "工作", dir: "good", tags: ["job", "promotion", "helper"] },
  layoff: { domain: "career", noun: "工作", dir: "bad", tags: ["jobLoss", "conflict", "upheaval"] },
  promotion: { domain: "career", noun: "事業", dir: "good", tags: ["promotion", "job", "helper"] },
  careerChange: { domain: "career", noun: "事業", dir: "change", tags: ["jobChange", "startup", "upheaval", "move"] },
  startup: { domain: "career", noun: "事業", dir: "change", tags: ["startup", "gain", "jobChange"] },
  wealthGain: { domain: "wealth", noun: "財運", dir: "good", tags: ["gain", "helper"] },
  wealthLoss: { domain: "wealth", noun: "財運", dir: "bad", tags: ["loss", "upheaval"] },
  home: { domain: "wealth", noun: "置產", dir: "good", tags: ["home", "gain"] },
  move: { domain: "move", noun: "遷移", dir: "change", tags: ["move", "upheaval"] },
  abroad: { domain: "move", noun: "遷移", dir: "change", tags: ["abroad", "move"] },
  exam: { domain: "study", noun: "考試", dir: "change", tags: ["exam", "study", "examRisk"] },
  graduate: { domain: "study", noun: "學業", dir: "good", tags: ["study", "exam"] },
  parentIll: { domain: "family", noun: "父母", dir: "bad", tags: ["parents", "elders", "father", "mother"] },
  siblings: { domain: "family", noun: "手足", dir: "change", tags: ["siblings"] },
  retire: { domain: "career", noun: "事業", dir: "change", tags: ["retire", "jobChange"] },
};
export const EVENT_KINDS = Object.keys(KINDS);
const DEATH = /death|died|widow|funeral|passed|喪|逝|過世|離世/i;
const TAIL = {
  love: "這一步更多是你的選擇與緣分。", health: "生病多半和作息、體質有關，定期檢查最實在。", career: "這一步更多是你的努力與時機。",
  wealth: "這一步更多是你的規劃與選擇。", study: "結果更多來自平時的累積。", family: "這一步更多是緣分與相處。", move: "這一步更多是你的選擇。",
};
const CLOSE = {
  good: "命盤說的是時機，把握住還是要靠你自己。",
  bad: "命盤說的是時機，不是定數，穩住腳步就能走過。",
  change: "命盤說的是時機與氛圍，怎麼走還是看你的選擇。",
};

// Whether a signal points the way of the event: a good event is explained only by supportive signals, a bad one only
// by unsettling ones, a change (a move, a new field) by either. A signal's effect on the event's domain decides;
// without one, its tone does.
function pointsWay(s, domain, dir) {
  if (dir === "change") return true;
  const v = s.domains && s.domains[domain];
  if (v) return dir === "good" ? v > 0 : v < 0;
  return dir === "good" ? s.tone !== "凶" : s.tone !== "吉";
}
function ranked(list, k, dir, sx) {
  return list
    .filter(s => !s.context && (!s.only || s.only === sx) && s.notes && s.notes[k.domain] && pointsWay(s, k.domain, dir))
    .map(s => ({ s, r: k.tags.findIndex(t => s.tags.includes(t)) }))
    .filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r || b.s.weight - a.s.weight);
}
const strip = t => t.replace(/。$/, "").replace(/^(流年|大運)/, "");
const cut = t => (t.length <= 60 ? t : `${t.slice(0, 59)}。`);

// eventReason(kind, reading, { sex, direction, channel }): direction ("good" | "bad" | "change") overrides the kind's
// own; channel (the story event's channel) sets it for kinds that can go either way (exam, move, careerChange…).
// Returns { short, why, basis, matched, direction }, or null for a death or an unknown kind.
export function eventReason(kind, reading, { sex, direction, channel } = {}) {
  if (!reading || typeof kind !== "string" || DEATH.test(kind)) return null;
  const k = KINDS[kind];
  if (!k) return null;
  const sx = sex || reading.sex;
  const dir = CLOSE[direction] ? direction : k.dir === "change" && CLOSE[channel] ? channel : k.dir;
  const pillar = `${reading.pillar}年`;
  const noteOf = x => strip(x.notes[k.domain]);
  const shortOf = x => strip((x.shorts && x.shorts[k.domain]) || x.short);
  const dec = reading.decade;

  // The year's signals that point the event's way: the best one, and a second one that adds something.
  const fit = ranked(reading.signals || [], k, dir, sx);
  const first = fit.length ? fit[0].s : null;
  const next = first && fit.slice(1).find(x => x.r <= fit[0].r + 1 && x.s.weight >= 3 && noteOf(x.s) !== noteOf(first));
  const second = next ? next.s : null;
  // The decade's, never repeating what the year says.
  const said = [first, second].filter(Boolean);
  const dfit = dec ? ranked(dec.signals || [], k, dir, sx).filter(x => !said.some(y => y.id === x.s.id || noteOf(y) === noteOf(x.s))) : [];
  const dsig = dfit.length ? dfit[0].s : null;
  const decSentence = dsig ? `你正走${dec.name}大運，${noteOf(dsig)}。` : "";

  // Illness and injury: careful words, and a 天醫、天德、月德、天乙 of the same year as the traditional comfort.
  let close = CLOSE[dir], healer = null;
  if (k.care) {
    healer = (reading.signals || []).find(x => !x.context && x.tags.includes("healer"));
    close = healer ? `命理上這一年要多留意身體；好在${healer.short}，傳統上主逢凶化吉、容易得遇良醫。` : "命理上這一年要多留意身體，傳統說法宜多休息、定期檢查；命盤說的是時機，不是定數。";
  }
  const extra = healer ? [healer.id] : [];

  if (!first) {
    if (dsig) {
      return {
        short: cut(`${pillar}：走${dec.name}大運，${shortOf(dsig)}。`),
        why: `${decSentence.replace(/。$/, "")}；今年流年本身沒有特別的${k.noun}訊號，主要是大運的底色。${close}`,
        basis: ["decade", ...extra], matched: true, direction: dir,
      };
    }
    const gentle = k.care ? `這一年命盤上沒有特別明顯的健康警訊，${TAIL.health}` : `這一年命盤上沒有特別明顯的${k.noun}訊號，${TAIL[k.domain]}`;
    return { short: cut(`${pillar}：命盤上沒有特別明顯的${k.care ? "健康警訊" : `${k.noun}訊號`}。`), why: gentle, basis: [], matched: false, direction: dir };
  }

  let short = `${pillar}：${shortOf(first)}${second ? `；${shortOf(second)}` : ""}。`;
  if (short.length > 60) short = `${pillar}：${shortOf(first)}。`;
  const one = `今年${reading.pillar}，${noteOf(first)}。`;
  let yearBit = second ? `今年${reading.pillar}，${noteOf(first)}；${noteOf(second)}。` : one;
  let both = !!second && yearBit.length <= 100;
  if (!both) yearBit = one;
  if (k.care && !healer && /定期檢查/.test(yearBit)) close = "命理上這一年要多留意身體；命盤說的是時機，不是定數。";
  let dec1 = decSentence;
  if ((dec1 + yearBit + close).length > 160) dec1 = "";
  if (both && (yearBit + close).length > 160) { both = false; yearBit = one; }
  const basis = [first.id, ...(both ? [second.id] : []), ...(dec1 ? ["decade"] : []), ...extra.filter(id => id !== first.id && !(both && id === second.id))];
  return { short: cut(short), why: `${dec1}${yearBit}${close}`, basis, matched: true, direction: dir };
}
// ---------- status bar ----------
// 「流年甲午（正財／七殺）・大運丁巳（七殺）」: the decade shows its stem's god, as 排盤 software lists it.
export function yearTag(reading, { full = false } = {}) {
  if (!reading) return "";
  const y = `流年${reading.pillar}（${reading.gods.stem}／${reading.gods.branch}）`;
  const d = reading.decade ? `大運${reading.decade.name}（${full ? `${reading.decade.gods.stem}／${reading.decade.gods.branch}` : reading.decade.gods.stem}）` : "童限";
  return `${y}・${d}`;
}

// ---------- the signal ids ----------
// For the luck model and the page: every id a reading can hold. 〈role〉 is year, month, day, hour or decade (the 大運
// in a year reading). In a year reading the contacts with the 年支 that are 犯太歲 are taisui.* ids instead of rel.*.
export const SIGNAL_FAMILIES = {
  favor: "流年干支的喜忌與十神（每年都有，是頁面的第一條）",
  decade: "所走的大運：十神主題與喜忌（背景，eventReason 引用大運時記為 decade）",
  "decade.enter": "交運之年",
  childhood: "童限：尚未起運",
  "god.〈比劫|食傷|財|官殺|印〉": "流年天干或地支本氣帶來的十神，和 luck.js 的 groups 相同；男命財為妻、官殺為子女，女命官殺為夫、食傷為子女，偏財為父、正印為母、比劫為手足",
  "rel.clash.〈role〉": "六沖；寅申巳亥另有 combo.驛馬逢沖，辰戌丑未另有 combo.沖開財庫或 combo.墓庫逢沖，沖到用神另有 combo.用神受沖",
  "rel.combine.〈role〉": "六合（year：合太歲）",
  "rel.punish.〈role〉": "相刑、自刑",
  "rel.harm.〈role〉": "六害",
  "rel.break.〈role〉": "相破",
  "rel.half.〈role〉": "半合（在完整三合之內時併入 rel.triad）",
  "rel.arch.〈role〉": "拱合（同上）",
  "rel.stemCombine.〈role〉": "天干五合（day：合日主，男命陽干、女命陰干時是配偶星合身）",
  "rel.stemClash.〈role〉": "天干相沖",
  "rel.fuyin.〈role〉": "伏吟（年柱的伏吟併入 taisui.值太歲）",
  "rel.fanyin.〈role〉": "反吟、天剋地沖，含該柱的六沖（年柱的反吟併入 taisui.沖太歲；decade 是歲運相戰）",
  "rel.suiyun": "歲運並臨（各領域的等級放大 1.3 倍）",
  "rel.triad": "三合局", "rel.meet": "三會方", "rel.punish3": "三刑俱全",
  "combo.傷官見官": "傷官遇正官：口舌、與上司衝突，女命婚姻不穩",
  "combo.比劫奪財": "比劫為忌又遇財星：破財、競爭，男命感情有競爭",
  "combo.財星壞印": "流年財星剋喜用的印：讀書分心、文書宜細看、關心母親",
  "combo.梟神奪食": "偏印剋食神：飲食睡眠、計畫生變，女命子女",
  "combo.官殺混雜": "正官七殺同現（官殺為喜時稱官殺並見）",
  "combo.財官雙美": "財與官殺都是喜用（七殺時稱財滋七殺）",
  "combo.食神制殺": "食神制住不喜的七殺",
  "combo.殺印相生": "七殺生喜用的印", "combo.官印相生": "正官生喜用的印",
  "combo.食傷生財": "食傷生喜用的財",
  "combo.七殺攻身": "七殺為忌又無印、食神化解",
  "combo.忌神當令": "流年地支正是忌神，天干或大運也不幫",
  "combo.用神受沖": "命局用神所在的地支被沖",
  "combo.沖開財庫": "財庫逢沖：財務大進大出", "combo.墓庫逢沖": "其他墓庫逢沖", "combo.驛馬逢沖": "寅申巳亥逢沖：遠行、搬遷",
  "star.〈神煞〉": "流年（或大運）帶來的神煞，名稱同 detail.js STARS",
  "taisui.〈值太歲|沖太歲|刑太歲|害太歲|破太歲〉": "犯太歲，一年只取最主要的一種",
  "spirit.〈太陽|喪門|太陰|官符|死符|龍德|白虎|福德|吊客|病符〉": "太歲十二神（太歲、歲破併入 taisui）",
};
