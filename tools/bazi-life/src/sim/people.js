// 故事裡的人：另一半、孩子、朋友、同事。每個人有名字、年紀和個性，故事會一直叫他們的名字。
import { givenName, randomSurname } from "./random-name.js";
import { splitName } from "../core/name.js";

// A partner's nature changes the odds of a marriage crisis a little; the multipliers average 1 across the list, so
// the calibrated divorce rate holds.
export const PARTNER_NATURES = [
  { word: "溫柔", crisis: 0.9 }, { word: "直率", crisis: 1.05 }, { word: "幽默", crisis: 1 }, { word: "務實", crisis: 1 },
  { word: "浪漫", crisis: 1 }, { word: "工作狂", crisis: 1.1 }, { word: "顧家", crisis: 0.9 }, { word: "愛自由", crisis: 1.1 },
];
const FRIEND_NATURES = ["愛熱鬧", "講義氣", "安靜", "愛搞笑", "很會讀書", "運動神經好", "什麼都敢試", "很念舊"];

// The protagonist's surname: from the name given, else the father's, else drawn once at birth.
export function surnameOf(s) {
  if (!s.surname) s.surname = s.name ? splitName(s.name).surname.join("") : s.father.name ? splitName(s.father.name).surname.join("") : null;
  return s.surname;
}

// How the protagonist calls someone in the story.
function callOf(role, surname, given, rng) {
  if (role === "friend") return rng() < 0.4 ? `${rng() < 0.5 ? "阿" : "小"}${[...given].pop()}` : given;
  return given;
}

//   role: "partner" | "kid" | "friend"   sex: "male" | "female"   birthYear: their birth year
export function newPerson(s, ctx, { role, sex, birthYear, surname = null, how = "", nature = null }) {
  const rng = ctx.rng;
  const sn = surname || randomSurname(rng), given = givenName(rng, birthYear, sex);
  const p = {
    id: `${role}${(s.seq = (s.seq || 0) + 1)}`, role, sex, birthYear, name: sn + given, call: callOf(role, sn, given, rng), how,
    nature: nature || (role === "partner" ? rng.pick(PARTNER_NATURES) : role === "friend" ? rng.pick(FRIEND_NATURES) : null),
    bond: 0.5, alive: true,
  };
  return p;
}
export const ageOf = (s, p) => s.year - p.birthYear;

// 他 / 她
export const pronoun = p => (p && p.sex === "female" ? "她" : "他");

// A child takes the father's surname, as most families in Taiwan still do.
export function newKid(s, ctx) {
  const sex = ctx.rng() < 0.512 ? "male" : "female";   // about 105 boys per 100 girls at birth
  const surname = s.sex === "male" ? surnameOf(s) || randomSurname(ctx.rng) : s.partner ? [...s.partner.name][0] : randomSurname(ctx.rng);
  const kid = newPerson(s, ctx, { role: "kid", sex, birthYear: s.year, surname });
  kid.age = 0;
  return kid;
}

// Where two people meet depends on age and era: 相親 was common before the 1990s, chat rooms around 2000,
// dating apps from about 2013.
export function meetPlace(s, ctx) {
  const options = [];
  if (s.age <= 24) options.push(["同學", 3]);
  if (s.employed) options.push(["同事", 2.5]);
  options.push(["朋友介紹", 2.5], ["社團活動", 1]);
  if (s.year < 1995) options.push(["長輩安排的相親", s.age >= 26 ? 2 : 0.8]);
  else if (s.age >= 33) options.push(["相親", 0.8]);
  if (s.year >= 1997 && s.year <= 2010) options.push(["網路聊天室", 1]);
  if (s.year >= 2013) options.push(["交友軟體", s.age <= 40 ? 2 : 0.8]);
  if (s.year >= 2000) options.push(["健身房", 0.5]);
  options.push(["旅行途中", 0.4]);
  return ctx.rng.weighted(options);
}
