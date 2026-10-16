// Generates src/core/name-texts.js: the traditional readings of the 81 numbers, the 125 三才 and the 75 三運 used by the
// 姓名學 report (src/core/name-reading.js).
//
//   node scripts/make-name-texts.mjs <shunshi-naming data dir>
//
// Inputs (read only, nothing from them is executed): shuli-81.json.gz, sancai-125.json.gz and yunshi-75.json.gz of
// shunshi-naming-core 0.1.0 (MIT License, Copyright (c) 2026 Shunshi.AI). `npm pack shunshi-naming-core@0.1.0`, data/.
// The yunshi keys are "<base, succ or soc>|<人格的五行>|<the other grid's 五行>": 基礎運 (base) compares 人格 with 地格,
// 成功運 (succ) with 天格, 社交運 (soc) with 外格 (shunshi's dist/lib/wuge.js, yunshi()).
//
// The texts are in Simplified Chinese. They are converted with opencc-js (a devDependency, never bundled into the
// page; cn → twp, Taiwan wording). Every converted text was then read through: FIXES lists each wrong conversion found,
// KE puts the 五行 剋 in one form, and EDITS repairs the few defects of the source itself. The script stops if a fix no
// longer matches anything, or if a character that is only Simplified is left over.
//
// Only the texts are taken. The levels of the 81 numbers and of 三才 stay this project's own (src/core/name.js: two
// 81-number tables, 半吉 where they differ), so the source's level notes and its remarks about its own grading are
// left out, and so are level words among the keywords. The three fortunes have no other table here, so their levels
// are shunshi's.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import * as OpenCC from "opencc-js";

const [namingDir] = process.argv.slice(2);
if (!namingDir) { console.error("usage: node scripts/make-name-texts.mjs <shunshi-naming data dir>"); process.exit(1); }
const gz = p => JSON.parse(gunzipSync(readFileSync(`${namingDir}/${p}`)).toString());
const shuli = gz("shuli-81.json.gz"), sancai = gz("sancai-125.json.gz"), yunshi = gz("yunshi-75.json.gz");
const OPENCC_VERSION = JSON.parse(readFileSync(new URL("../node_modules/opencc-js/package.json", import.meta.url), "utf8")).version;
const toTaiwan = OpenCC.Converter({ from: "cn", to: "twp" });

// Wrong conversions, found by reading every converted text: [converted, right].
const FIXES = [
  // twp's phrase layer swaps in Taiwanese computer and place names.
  ["迴圈", "循環"],          // 數理循環, 循環相生: a cycle, not a program loop
  ["全域性", "全局"],        // 累及全局: the whole affair, not a global variable
  ["厚過載德", "厚重載德"],  // 厚重 carries 德; 重載 is not "overload" here
  ["永珍", "萬象"],          // 萬象昭然: all things, not Vientiane
  // Characters the converter picks wrongly in these texts.
  ["兇", "凶"],              // the 凶 of 吉凶: 凶數, 半吉半凶, 減其凶, 凶險
  ["巖", "岩"],              // 岩頭步馬, as the number is known in Taiwan
  ["受託", "受托"],          // 根基受托: held up, not entrusted
  ["羅網系身", "羅網繫身"],  // bound by the net (系 is 系統, 繫 is to tie)
  ["多悽", "多淒"],          // 晚境多淒, as in 淒涼
];
// 三才 and 三運 say how one element 克 another; Taiwan writes the 五行 sense 剋 (as this project does). The converter
// changes only the phrase 相克, so the rest is done here. The 81 texts keep 克, where it is 克己, self-discipline.
const KE = ["克", "剋"];
// Defects of the source: [entry, wrong, right].
const EDITS = [
  ["shuli 21", "temperament 明朗", "性情明朗"],   // an English word left in the sentence
  ["shuli 46", "岐途", "歧途"],                   // misspelt
  // This project's wording rules (README 姓名學): a name never speaks of death, and the traditional remarks that a
  // number is "too strong for a woman" are kept as advice for anyone strong-willed, not a judgement by sex.
  ["shuli 20", "短命、病弱、破財之象亦時見於此", "病弱、破財之象亦時見於此"],
  ["shuli 34", "破家亡身的大凶數", "破家的大凶數"],
  ["shuli 44", "愁眉難展的破家亡身數", "愁眉難展的破家數"],
  ["shuli 21", "唯女子得此數者，主見過強而每與人相爭，宜以柔濟剛。", "唯主見過強時易與人相爭，宜以柔濟剛。"],
  ["shuli 23", "唯盛極須防驕，女子得此則剛氣太重，宜自斂。", "唯盛極須防驕，剛氣太重時宜自斂。"],
  ["shuli 29", "女子得此更須防剛氣過盛，宜以知足自守。", "也須防剛氣過盛，宜以知足自守。"],
  ["shuli 31", "女子得此亦為吉，是少見的男女皆宜之數。", "是男女皆宜的吉數。"],
  ["shuli 33", "女子得此則剛氣太重，與人相處易生齟齬，宜自斂以柔濟之。", "剛氣太重時與人相處易生齟齬，宜自斂以柔濟之。"],
  ["shuli 39", "女子得此則失之於剛，易見孤寡。", "剛氣過盛時宜多經營人際與感情。"],
];
// Keywords that judge by sex (see EDITS), left out.
const DROP_KEYWORDS = new Set(["女性嫌剛", "女性嫌孤"]);
// The source's own remarks on how it graded a number (in its own voice, "我們不硬拍") end the texts of 42 and 49.
const REMARK = /\s*⚠️.*$/su;
// Keywords that only restate a level; the level shown is this project's own.
const LEVEL_WORDS = new Set(["大吉", "吉", "半吉", "凶", "大凶", "各派分歧"]);

// Valid Traditional characters that opencc-js, given the character alone, still changes: 凶 (吉凶; alone it becomes 兇),
// 咸 (上下咸宜, "all"; alone it becomes 鹹) and 岩 (the form used in Taiwan; alone it becomes 巖). Anything else it
// changes is Simplified and must not be left over.
const ALSO_TRADITIONAL = new Set([..."凶咸岩"]);

const used = new Map(FIXES.map(([a]) => [a, 0]));
let keCount = 0;
const edited = new Set();
function convert(text, { ke = false, entry = "" } = {}) {
  let t = toTaiwan(text.replace(REMARK, ""));
  for (const [a, b] of FIXES) {
    const n = t.split(a).length - 1;
    if (n) { used.set(a, used.get(a) + n); t = t.replaceAll(a, b); }
  }
  if (ke) { keCount += t.split(KE[0]).length - 1; t = t.replaceAll(KE[0], KE[1]); }
  for (const [where, a, b] of EDITS) {
    if (where !== entry) continue;
    if (!t.includes(a)) throw new Error(`edit for ${where} no longer matches: ${a}`);
    t = t.replace(a, b);
    edited.add(where);
  }
  return t;
}

const SHULI_TEXTS = {};
for (let n = 1; n <= 81; n++) {
  const e = shuli[String(n)];
  if (!e) throw new Error(`81 數理 ${n} missing`);
  const poem = convert(e.poem);
  const keywords = e.keywords.split(/\s+/).filter(k => k && !LEVEL_WORDS.has(k)).map(k => convert(k)).filter(k => k !== poem && !DROP_KEYWORDS.has(k));
  SHULI_TEXTS[n] = { poem, keywords, text: convert(e.text, { entry: `shuli ${n}` }) };
}

const EL = "木火土金水";
const SANCAI_TEXTS = {};
for (const a of EL) for (const b of EL) for (const c of EL) {
  const e = sancai[a + b + c];
  if (!e) throw new Error(`三才 ${a}${b}${c} missing`);
  SANCAI_TEXTS[a + b + c] = convert(e.text, { ke: true });
}

// shunshi's keys → this project's names. 成功運 first, as the reports in Taiwan list them.
const FORTUNES = [["成功運", "succ"], ["基礎運", "base"], ["社交運", "soc"]];
const LEVELS = new Set(["大吉", "吉", "半吉", "凶", "大凶"]);
const YUNSHI = {};
for (const [name, key] of FORTUNES) {
  YUNSHI[name] = {};
  for (const me of EL) for (const other of EL) {
    const e = yunshi[`${key}|${me}|${other}`];
    if (!e || !LEVELS.has(e.level)) throw new Error(`${name} ${me}${other} missing or without a level`);
    YUNSHI[name][me + other] = { level: e.level, text: convert(e.text, { ke: true }) };
  }
}

// Every fix and edit must still be needed, and nothing Simplified may be left.
for (const [a, n] of used) if (!n) throw new Error(`fix ${a} no longer matches anything`);
for (const [where] of EDITS) if (!edited.has(where)) throw new Error(`edit for ${where} was not applied`);
const everything = [
  ...Object.values(SHULI_TEXTS).flatMap(e => [e.poem, ...e.keywords, e.text]),
  ...Object.values(SANCAI_TEXTS),
  ...Object.values(YUNSHI).flatMap(f => Object.values(f).map(e => e.text)),
];
const left = new Set();
for (const text of everything) for (const ch of text) if (toTaiwan(ch) !== ch && !ALSO_TRADITIONAL.has(ch)) left.add(ch);
if (left.size) throw new Error(`Simplified characters left: ${[...left].join("")}`);
const stray = everything.filter(t => /[A-Za-z⚠]|我們/u.test(t));
if (stray.length) throw new Error(`source remarks or English left: ${stray[0]}`);

const replacements = [...used.values()].reduce((a, b) => a + b, 0) + keCount + EDITS.length;
const line = ([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`;
// The credit is a legal comment (//!), which esbuild keeps in the minified page.
const out = `// Generated by scripts/make-name-texts.mjs — do not edit by hand.
//! 姓名學 texts (81 數理, 三才, 三運) from shunshi-naming-core 0.1.0, MIT License, Copyright (c) 2026 Shunshi.AI.
// The readings of the 81 numbers, the 125 三才 and the 75 三運, converted to Traditional Chinese for Taiwan with
// opencc-js ${OPENCC_VERSION} (cn → twp), then corrected by hand (${FIXES.length + 1 + EDITS.length} rules, ${replacements} replacements). Only the texts come from
// there: the levels of the 81 numbers and of 三才 are this project's own (src/core/name.js).

// 81 數理: number → { poem, keywords, text }.
export const SHULI_TEXTS = {
${Object.entries(SHULI_TEXTS).map(line).join("\n")}
};

// 三才: the elements of 天格, 人格 and 地格 → the reading.
export const SANCAI_TEXTS = {
${Object.entries(SANCAI_TEXTS).map(line).join("\n")}
};

// 三運: the element of 人格 followed by that of the other grid → { level, text }. 成功運 compares 人格 with 天格,
// 基礎運 with 地格, 社交運 with 外格.
export const YUNSHI = {
${Object.entries(YUNSHI).map(([name, rows]) => `  ${name}: {\n${Object.entries(rows).map(r => `  ${line(r)}`).join("\n")}\n  },`).join("\n")}
};
`;
writeFileSync(fileURLToPath(new URL("../src/core/name-texts.js", import.meta.url)), out);
console.log(`81 numbers, ${Object.keys(SANCAI_TEXTS).length} 三才, ${Object.values(YUNSHI).reduce((s, f) => s + Object.keys(f).length, 0)} 三運; ` +
  `fixes ${[...used].map(([a, n]) => `${a}×${n}`).join(" ")}, 克→剋×${keCount}, ${EDITS.length} edits; ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB`);
