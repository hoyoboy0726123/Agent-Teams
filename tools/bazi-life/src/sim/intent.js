// 判讀玩家自己寫的選擇（本機版）：不上網、不上傳，用詞語比對找出最接近的行動。
//
// The result is a ranked list; the page shows the top ones for the player to confirm, so a wrong guess costs one
// tap. Claude (sample capability) does the same job better when the viewer allows it; both map onto the same
// action ids, and the engine alone decides what happens.
import { ACTIONS } from "./actions.js";

// Never simulated: the page answers with help lines or asks for another choice.
// Tuned after the evaluation in 研究六 (the held-out numbers there were measured before these additions); the AI
// reading checks again, because wording can always slip past a list.
const SELF_HARM = /自殺|輕生|想不開|不想(再)?活|活不下去|活著(好|很|真)?(累|沒意思|沒意義)|結束(自己的|我的)?生命|結束這一切|了結(自己|生命)|想死|死一死|死了算了|不如死|從這個世界消失|消失算了|跳樓|跳河|割腕|燒炭|上吊|吞藥|安眠藥|不要醒來|自殘|自我了斷|kill myself|suicide|自杀|轻生/i;
const HARM = /殺(了|掉|死)?(他|她|人|對方|老闆|主管|全家|他們|她們)|打(死|傷)(他|她|人)|打(他|她|小孩|老婆|老公)|揍(他|她)|教訓(他|她|對方)|報復|砍人|下毒|毒死|縱火|放(一把)?火|綁架|強暴|性侵|家暴|虐待|丟(在家裡)?不管|販毒|吸毒|毒品|搶劫|搶銀行|去搶|偷(錢|東西)|詐騙(別人|他人|老人)|騙(投資人|保險|保險金)|假帳|偽造|改遺囑|洗錢|逃稅|酒駕|kill (him|her|them)/i;

export function safetyCheck(text) {
  const t = String(text || "");
  if (SELF_HARM.test(t)) return "self_harm";
  if (HARM.test(t)) return "harm";
  return "ok";
}

const FULL = /[！-～]/g;
export const normalise = text => String(text || "").replace(FULL, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\s+/g, "").toLowerCase();

// A word preceded by a negation (不要離婚, 不想結婚) does not count for its action.
const NEGATIONS = ["不要", "不想", "不會", "不用", "不必", "不再", "不打算", "沒有要", "拒絕", "別", "不"];
function negated(t, at) {
  const before = t.slice(Math.max(0, at - 3), at);
  return NEGATIONS.some(n => before.endsWith(n));
}

function score(t, words) {
  let total = 0;
  const strong = Math.ceil(words.length / 3);
  words.forEach((w, i) => {
    const word = normalise(w);
    if (!word) return;
    let at = t.indexOf(word);
    while (at >= 0) {
      if (!negated(t, at)) total += (i < strong ? 2 : 1) * (1 + 0.15 * Math.max(0, [...word].length - 2));
      at = t.indexOf(word, at + word.length);
    }
  });
  return total;
}

// Ranked guesses for what the player wrote.
//   options  this choice's own buttons, [{ id, words }]: they win ties over the general actions
//   only     limit the general actions to these ids (all of them by default)
export function matchIntent(text, { options = [], only = null } = {}) {
  const t = normalise(text);
  if (!t) return [];
  const general = Object.entries(ACTIONS).filter(([id]) => !only || only.includes(id)).map(([id, a]) => ({ id, words: a.words, own: false }));
  const all = [...options.map(o => ({ id: o.id, words: o.words || [], own: true })), ...general];
  return all
    .map(c => ({ id: c.id, score: score(t, c.words) + (c.own ? 0.25 : 0) }))
    .filter(c => c.score > 0.25)
    .sort((a, b) => b.score - a.score);
}
