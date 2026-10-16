import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChart } from "../src/core/chart.js";
import { findPlace } from "../src/core/places.js";
import { analyse } from "../src/core/analysis.js";
import { elementRoles } from "../src/core/detail.js";
import { analyseName, LEVEL_NAME } from "../src/core/name.js";
import { BY_STROKES } from "../src/core/name-data.js";
import { SHULI_TEXTS, SANCAI_TEXTS, YUNSHI } from "../src/core/name-texts.js";
import { nameReading, SCORE_LABEL } from "../src/core/name-reading.js";

const chartOf = (y, m, d, h, mi, sex = "male") => computeChart({ date: { y, m, d }, time: { h, mi }, place: findPlace("臺北市"), sex });
const ANALYSES = [chartOf(1988, 2, 15, 23, 30), chartOf(1975, 7, 3, 9, 0, "female"), chartOf(2001, 11, 20, 14, 45)].map(c => analyse(c.pillars.map(p => p.name)));
const NAMES = ["陳怡君", "王明", "張簡成研"];
const EL = "木火土金水";
const LEVELS = ["大吉", "吉", "半吉", "凶", "大凶"];
const GRIDS = ["天格", "人格", "地格", "外格", "總格"];
const FORTUNES = [["成功運", "天格"], ["基礎運", "地格"], ["社交運", "外格"]];
const wrap = n => ((n - 1) % 80) + 1;

// Common Simplified-only characters: opencc-js changes each of them, and none is in Taiwan's character set (CNS 11643
// planes 1–2, the characters of name-data.js). The first 331 are every such character in the Simplified source texts.
const SIMPLIFIED_ONLY = "数开头从无独见强旧业础渐过则亲为劳权贵长创双经验实现两仪阴阳进细坚间纵难处缘择动摇调备达艺显颖辈携发聪须谦变灭败诸顺谋将际换专锋刚济温张圆禄来门寿终满稳庆荫运泽绵时断认转养贯彻恒虽迟尽兴险当穷结虚赋壮却屡称谨减叶凭营户财骤孙荣担弃损撑学临纷乱绪众辩观负沦应报内广愤积压载宽纳乐别带铁镜轻顿获随风举违伤碍灾测踬霁领资决争丽东贱华骄敛钱俭贤锐识势语讽酿澜叠袭产诽谤讦设矫诚阔忧迁属会声贪条侥个统宝马义鸾凤远龃龉敌静畅侠肠计给牺禀针砺胆径纯杂蝉猎样叹论们节倾祸对扬纬奥虑缜脉络罗缧绁点鹤师树这盘错输关预扩挥觉抢参闷恶还着偿补环纸质赢颓试习惯罚紧选摆毁谈滞频归驱键缩战线务惨废凉劲残讲牵润热浇较缓费荡冲层奋烦烧继拢图笃钝夹单腾该标写缀块档剑灵顶续锻顾挠赖绕飘帮闹挤谁让浅说国问电话车鸟鱼龙书买卖读议记许请词证评谢货购赏赞责贫审寻导岁岛币帅库弹录忆态总恋悬惧戏执扫抚抛护拟拣拥挡挣捡摄摊晋晓晕暂杀杨枪栋栏桥梦检楼横歼殴毕汇汉汤沟没沥沧泪泻泼浆浑浓涛涝涡涨涩渊渔渗湾湿溃滤滥滨滩灯灿炉炼烁烂烛烟烫焕爱爷犹狈狭狮狱猪猫献琐画疗疮疯盏盐监盖矿码砖礼窃窍窜竖竞笔笼筛简粮纠红纤约级纪纱纲纹纺练组织绍绑绘绝绩绳维综绿编缠罢耸耻聋职联肃肤肿胀胁胶脏脑脚脸舰艰艳苍苏茎药莲萧蓝蚀蛮衬装览规视讨训讯访诉译诗询详误课谅谊谓贝贞贡账贩贴贷贸贺赌赐赔赚赛赠趋跃践踪轨轮软轰辅辆辉辑辞边辽迈连逊递遗邓邮邻郑酱释钓钟钢钥钩铃铜铭链销锁锅锦镇闪闭闯闲闻阁阅队阵阶陆陈隐雾项顽题颜额飞饭饮饰饱饼馆驶驻驾骑骗骚鲁鲜鸡鸣鸭鸿鹅鹰麦黄齐齿龟严丧乔乡亏亚亿仅仓伞伟传伦伪侣侦侧侨债储兑兰兹兽冯况冻净凑凯击刘删剂剧劝办励勋匀协卢卫厅历厉厌厕厢厦厨县号吓吕吗启吴员响哑哗唤团园围场坛坝坟坠垄垒垦垫墙壳壶够夺奖妆妇妈娄娱婴婶孪宫宾寝尔尘尝尧届岂岗峡峦巩帐帜帼庐庙弥弯彦惩惫惭惮懒";
// Valid Traditional characters and words that are wrong in these texts: the traps the generator fixes (兇 … 過載), and
// common ones the converter itself has to get right (后, 里, 余, 干).
const TRAPS = ["兇", "巖", "受託", "系", "迴圈", "全域性", "永珍", "過載", "后", "里", "余", "干"];
const TAIWAN = new Set(Object.values(BY_STROKES).join(""));

const tableTexts = () => [
  ...Object.values(SHULI_TEXTS).flatMap(e => [e.poem, ...e.keywords, e.text]),
  ...Object.values(SANCAI_TEXTS),
  ...Object.values(YUNSHI).flatMap(rows => Object.values(rows).map(e => e.text)),
];
// Every string in a reading, with where it sits.
function strings(value, path = "reading", out = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out);
  return out;
}
function assertClean(value, path = "reading") {
  if (typeof value === "string") assert.ok(!/undefined|null|NaN|[{}]/.test(value), `${path}: ${value}`);
  else if (typeof value === "number") assert.ok(Number.isFinite(value), `${path}: ${value}`);
  else if (typeof value === "boolean") return;
  else if (Array.isArray(value)) value.forEach((v, i) => assertClean(v, `${path}[${i}]`));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) assertClean(v, `${path}.${k}`);
  else assert.fail(`${path} is ${value}`);
}

test("the generated tables cover the 81 numbers, the 125 三才 and the 75 三運", () => {
  assert.deepEqual(Object.keys(SHULI_TEXTS).map(Number), Array.from({ length: 81 }, (_, i) => i + 1));
  for (const [n, e] of Object.entries(SHULI_TEXTS)) {
    assert.ok(e.poem && e.text.length > 40 && e.keywords.length, n);
    for (const k of e.keywords) assert.ok(!LEVELS.includes(k) && k !== e.poem, `${n}: ${k}`);   // levels are the project's own
  }
  const combos = [...EL].flatMap(a => [...EL].flatMap(b => [...EL].map(c => a + b + c)));
  assert.deepEqual(Object.keys(SANCAI_TEXTS).sort(), combos.sort());
  assert.deepEqual(Object.keys(YUNSHI), ["成功運", "基礎運", "社交運"]);
  let count = 0;
  for (const rows of Object.values(YUNSHI)) for (const a of EL) for (const b of EL) {
    assert.ok(LEVELS.includes(rows[a + b].level) && rows[a + b].text, a + b);
    count++;
  }
  assert.equal(count, 75);
  // The key is 人格's element, then the other grid's: 天格 木 生 人格 火 is the best 成功運, 外格 火 剋 人格 金 a poor 社交運.
  assert.equal(YUNSHI.成功運.火木.level, "大吉");
  assert.match(YUNSHI.成功運.火木.text, /長上如薪相助/);
  assert.match(YUNSHI.社交運.金火.text, /外來相剋/);
  for (const [n, poem] of [[1, "太極之數"], [21, "明月中天"], [46, "羅網離身"], [66, "岩頭步馬"], [81, "萬物回春"]]) assert.equal(SHULI_TEXTS[n].poem, poem);
});

test("no Simplified character, conversion trap or remark of the source is left in the texts", () => {
  for (const ch of SIMPLIFIED_ONLY) assert.ok(!TAIWAN.has(ch), `${ch} is also a Traditional character`);
  for (const t of tableTexts()) {
    for (const ch of t) {
      assert.ok(!SIMPLIFIED_ONLY.includes(ch), `${ch} in ${t}`);
      if (/\p{Script=Han}/u.test(ch)) assert.ok(TAIWAN.has(ch), `${ch} is not in Taiwan's character set: ${t}`);
    }
    for (const trap of TRAPS) assert.ok(!t.includes(trap), `${trap} in ${t}`);
    assert.ok(!/[A-Za-z⚠]|我們/u.test(t), t);
  }
  // The hand fixes are in place.
  assert.match(SHULI_TEXTS[21].text, /萬象昭然.*性情明朗/);
  assert.match(SHULI_TEXTS[34].text, /累及全局/);
  assert.match(SHULI_TEXTS[46].text, /羅網繫身.*歧途/);
  assert.match(SHULI_TEXTS[77].poem, /^半吉半凶$/);
  assert.match(SHULI_TEXTS[81].text, /數理循環/);
  assert.match(SANCAI_TEXTS.木火木, /循環相生/);
  assert.match(SANCAI_TEXTS.木木土, /木剋土/);
  assert.match(SHULI_TEXTS[61].text, /克己/);   // self-discipline keeps 克
});

test("the readings of 陳怡君, 王明 and 張簡成研 have every grid, 三才, the three 運 and the 八字 comparison", () => {
  for (const full of NAMES) for (const a of ANALYSES) {
    const n = analyseName(full, a), r = nameReading(n, a), roles = elementRoles(a);
    assert.ok(r.summary.startsWith(`「${full}」`), r.summary);
    assert.equal(r.scoreLabel, SCORE_LABEL);
    assert.equal(SCORE_LABEL, "傳統姓名學評分（僅供參考）");
    assert.ok(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100, String(r.score));
    assert.deepEqual(r.grids.map(g => g.key), GRIDS);
    for (const g of r.grids) {
      const own = n.grids[g.key], t = SHULI_TEXTS[wrap(own.value)];
      assert.equal(g.value, own.value);
      assert.deepEqual([g.poem, g.keywords, g.text], [t.poem, t.keywords, t.text]);
      assert.ok(g.formula.endsWith(`= ${own.value}`), g.formula);
      if (g.key === "天格") {
        assert.equal(g.level, "不論吉凶");
        assert.match(g.note, /多數流派不論吉凶/);
      } else assert.equal(g.level, LEVEL_NAME[own.level]);   // the project's own level, not the source's
      if (g.level === "凶") assert.match(g.note, /只是命理裡很小的一環.*不需要為此改名/);
    }
    assert.deepEqual([r.sancai.elements, r.sancai.level, r.sancai.text], [n.sancai.elements, n.sancai.name, SANCAI_TEXTS[n.sancai.elements]]);
    assert.deepEqual(Object.keys(r.yunshi), FORTUNES.map(([name]) => name));
    for (const [name, other] of FORTUNES) {
      const y = r.yunshi[name];
      assert.deepEqual([y.from, y.to, y.elements], ["人格", other, n.grids.人格.element + n.grids[other].element]);
      assert.deepEqual({ level: y.level, text: y.text }, YUNSHI[name][y.elements]);
    }
    assert.deepEqual([r.elements.useful, r.elements.avoid], [a.useful, a.avoid]);
    assert.equal(r.elements.chars.length, [...n.given].length);
    for (const c of r.elements.chars) {
      assert.ok(r.elements.text.includes(`「${c.ch}」`), c.ch);
      assert.equal(c.numberRole, roles[c.number]);
      if (c.form) assert.equal(c.formRole, roles[c.form]);
      else assert.match(c.text, /字形五行不明確，只看數理/);
      assert.ok(c.verdict, c.ch);
    }
    assert.match(r.elements.text, new RegExp(`^八字日主是${a.dayMaster.stem}${a.dayMaster.element}`));
    assert.ok(r.notes.length && r.credit.includes("MIT"));
  }
});

test("characters with disputed strokes are named, with every reading and what it changes", () => {
  const r = nameReading(analyseName("張簡成研", ANALYSES[0]), ANALYSES[0]);
  assert.match(r.disputed, /「成」有 6、7 畫.*「研」有 9、11 畫.*總格在 4 種算法裡有 2 種是吉/);
  assert.match(r.grids[4].note, /也可能是 45（吉）、46（凶）、47（吉）/);
  assert.match(r.elements.text, /6 畫屬土（另一種算法 7 畫屬金）/);
  assert.equal(r.strokes, "張 11、簡 18、成 6 或 7、研 9 或 11");
  assert.equal(nameReading(analyseName("陳怡君")).disputed, "");   // nothing to say
});

test("nothing in a reading is undefined, null, NaN or an unfilled template", () => {
  for (const full of [...NAMES, "陳靈", "歐陽娜娜", "陳研", "林美玲"]) {
    for (const a of [...ANALYSES, null]) {
      const r = nameReading(analyseName(full, a), a);
      assertClean(r);
      for (const [path, s] of strings(r)) {
        for (const ch of s) assert.ok(!SIMPLIFIED_ONLY.includes(ch), `${path}: ${ch} in ${s}`);
        for (const trap of TRAPS) assert.ok(!s.includes(trap), `${path}: ${trap} in ${s}`);
      }
    }
  }
});

test("where the two 81-number tables differ the grid is 半吉 and the note says so", () => {
  const r = nameReading(analyseName("陳靈"));
  for (const g of [r.grids[1], r.grids[4]]) {
    assert.equal(g.value, 40);
    assert.equal(g.level, "半吉");
    assert.match(g.note, /兩種數理表說法不同（一說凶、一說半吉），這裡算半吉/);
  }
});

test("凶 numbers are read calmly, and the score follows its documented formula", () => {
  const a = ANALYSES[0], r = nameReading(analyseName("王明", a), a);
  for (const g of r.grids.slice(1)) assert.equal(g.level, "凶");
  assert.match(r.summary, /四格都是凶數.*不需要為此改名/);
  for (const [, s] of strings(r)) assert.ok(!/建議改名|應該改名|必須改名|一定要改名/.test(s), s);
  // Without a chart: 五格數理 75 % (all 凶: 50 points) and 三才 25 % (土木水 凶, level −1: 62.5 points).
  const plain = nameReading(analyseName("王明"));
  assert.deepEqual(plain.scoreParts.map(p => [p.part, p.weight]), [["五格數理", 75], ["三才", 25]]);
  assert.equal(plain.score, Math.round(0.75 * 50 + 0.25 * 62.5));
  assert.match(plain.elements.text, /^沒有命盤資料/);
  assert.match(plain.scoreNote, /五格數理占 75%.*三才占 25%/);
  // A 凶 主運 caps the verdict, however the rest scores (張簡一: 人格 19).
  assert.match(nameReading(analyseName("張簡一")).summary, /^「張簡一」整體普通，有幾處不理想：.*主運人格是凶數/);
  // 陳怡君 is 吉 in every scored grid and 三才 金土土 大吉; the 八字 part is 75 + 25 × the name's balance.
  for (const b of ANALYSES) {
    const roles = elementRoles(b), sign = e => (/用神|喜神/.test(roles[e]) ? 1 : /忌神|仇神/.test(roles[e]) ? -1 : 0);
    const balance = (sign("水") + sign("金")) / 2;   // 怡 9 畫 水, 君 7 畫 金, neither has a 字形五行
    assert.equal(nameReading(analyseName("陳怡君", b), b).score, Math.round(0.6 * 100 + 0.2 * 100 + 0.2 * (75 + 25 * balance)));
  }
});

test("人格 and 外格 can never be 1, and a name that cannot be analysed passes its error on", () => {
  const n = analyseName("陳怡君");
  const odd = { ...n, grids: { ...n.grids, 外格: { ...n.grids.外格, value: 1 } } };
  assert.match(nameReading(odd).grids[3].note, /人格和外格最小是 2/);
  assert.ok(nameReading(analyseName("王")).error);
  assert.ok(nameReading(analyseName("王𠀋")).error);
});
