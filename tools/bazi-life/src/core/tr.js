// The readings' English (README「英文版（翻譯層）」). The reading code (reading-*.js, detail.js, hehun.js, partner.js,
// family.js, name-*.js, report.js and the result cards in life-app.js) writes Chinese as always; every sentence it
// builds goes through tr(), which is the Chinese template filled in when no English is set (exactly what the old
// `…${x}…` template literal made), and its English, looked up by the Chinese template as written, when the page has
// set one (setReadingLang(makeLang(bundle)) from sim/lang.js; the bundle is the story's, src/i18n/en/*.json).
//   tr("{stem}日主，生於{month}月", { stem, month })   a sentence; values that are Chinese words go through the words
//   trw("比肩")                                          one word (a ten god, an element, a star's name…)
// Readings have no random alternatives; a template is filled, not expanded.
import { fill } from "../sim/grammar.js";

let L = null;
export function setReadingLang(english) { L = english || null; }
export const readingLang = () => (L ? "en" : "zh");
export const tr = (template, vars = {}) => (L ? L.f(template, vars) : fill(template, vars));
export const trw = word => (L && word != null ? L.word(word) : word);
// Joining a list: 、 and ， in Chinese, ", " in English.
export const trJoin = (list, zh = "、") => list.join(L ? ", " : zh);
