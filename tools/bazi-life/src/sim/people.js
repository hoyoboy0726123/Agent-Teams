// 故事裡的人：另一半、孩子、朋友、同事。每個人有名字、年紀和個性，故事會一直叫他們的名字。
// 家人資料裡填了伴侶時，兩個人都滿 22 歲以後的第一段感情就是這個人；填了開始交往或結婚的年份，就照那些年份走（realPartnerDue）。
// 從合婚分頁開始的人生（only）：遇到這個人之前，不會和別人交往；交往期間不會無故分手（keptForPartner、realPartnerSteady）。
import { givenName, randomSurname } from "./random-name.js";
import { splitName } from "../core/name.js";
import { callName } from "./words.js";
import { SAME_SEX_MARRIAGE } from "../core/family.js";

// A partner's nature changes the odds of a marriage crisis a little; the multipliers average 1 across the list, so
// the calibrated divorce rate holds.
export const PARTNER_NATURES = [
  { word: "溫柔", crisis: 0.9 }, { word: "直率", crisis: 1.05 }, { word: "幽默", crisis: 1 }, { word: "務實", crisis: 1 },
  { word: "浪漫", crisis: 1 }, { word: "工作狂", crisis: 1.1 }, { word: "顧家", crisis: 0.9 }, { word: "愛自由", crisis: 1.1 },
];
const FRIEND_NATURES = ["愛熱鬧", "講義氣", "安靜", "愛搞笑", "很會讀書", "運動神經好", "什麼都敢試", "很念舊"];

// The surname in a name, or null for a nickname such as 小美, 阿明, 老王 or 美美 (the 合婚 tab asks for a name and a
// nickname is fine there): a child then takes a surname drawn once instead of 「小」.
export function surnameIn(full) {
  const name = String(full || "").replace(/\s+/g, ""), chars = [...name];
  if (chars.length < 2 || /^[小阿老]/.test(name) || (chars.length === 2 && chars[0] === chars[1])) return null;
  return splitName(name).surname.join("");
}

// The protagonist's surname: from the name given, else the father's, else drawn once (with `rng`) and kept, so all
// your children share it. Without `rng`, null when neither name has one.
export function surnameOf(s, rng = null) {
  if (!s.surname) s.surname = surnameIn(s.name) || surnameIn(s.father.name) || (rng ? randomSurname(rng) : null);
  return s.surname;
}

// How the protagonist calls someone in the story.
function callOf(role, surname, given, rng) {
  if (role === "friend") return rng() < 0.4 ? `${rng() < 0.5 ? "阿" : "小"}${[...given].pop()}` : given;
  return given;
}

//   role: "partner" | "kid" | "friend"   sex: "male" | "female"   birthYear: their birth year
//   name: a full name to use instead of a random one (the real partner); they are called by the given name
export function newPerson(s, ctx, { role, sex, birthYear, surname = null, how = "", nature = null, name = null }) {
  const rng = ctx.rng;
  let full, call;
  if (name) { full = String(name).replace(/\s+/g, ""); call = callName(full); }
  else { const sn = surname || randomSurname(rng), given = givenName(rng, birthYear, sex); full = sn + given; call = callOf(role, sn, given, rng); }
  const p = {
    id: `${role}${(s.seq = (s.seq || 0) + 1)}`, role, sex, birthYear, name: full, call, how,
    nature: nature || (role === "partner" ? rng.pick(PARTNER_NATURES) : role === "friend" ? rng.pick(FRIEND_NATURES) : null),
    bond: 0.5, alive: true,
  };
  return p;
}

// ---------- the real partner (伴侶, from the family input) ----------
export const partnerMember = family => (family && family.members.find(m => m.relation === "partner")) || null;

// The age both of you must have reached before the real partner can be the one you date, when you did not say when
// you got together: most couples who marry in Taiwan meet in their mid-twenties (first marriages come at 31–33), and
// a first love at 18 usually does not last, so starting at 22 makes the story's partner a plausible spouse.
export const REAL_PARTNER_AGE = 22;

// The years the family input gives: when you got together (metYear) and when you married (marriedYear). With only
// a wedding year, you meet two years before it.
export function realPartnerPlan(m) {
  const wed = m && Number.isInteger(m.marriedYear) ? m.marriedYear : null;
  const meet = m && Number.isInteger(m.metYear) ? m.metYear : wed !== null ? wed - 2 : null;
  return { meet, wed };
}

// The family's partner when this year's new relationship is with them, else null.
//   With the year you got together (realPartnerPlan): from that year on, until you meet (story/core.js
//   realPartnerMeet brings them in that very year). Earlier relationships do not end in marriage (realPartnerAhead).
//   Otherwise: you have not met yet, you are both at least REAL_PARTNER_AGE this year, and you were not married to
//   someone else in the year you both reached it (then the real partner never appears). A partner given only by name,
//   without a birth date, is your first partner from that age on.
export function realPartnerDue(s, ctx) {
  const m = partnerMember(ctx.family);
  if (!m || s.flags.realPartnerMet !== undefined) return null;
  const plan = realPartnerPlan(m);
  if (plan.meet !== null) return s.year >= plan.meet ? m : null;
  const min = REAL_PARTNER_AGE;
  if (s.age < min) return null;
  if (m.date && s.year - m.date.y < min) return null;
  const both = m.date ? Math.max(min, m.date.y + min - s.birthYear) : min;   // your age in the first year both reach it
  return s.spells.some(x => x.from <= both && (x.to === null || x.to > both)) ? null : m;
}

// From the 合婚 tab (only), the story is about you and this partner:
//   keptForPartner: until you meet them, nobody else comes into your love life (no dating, no first love at school);
//   realPartnerWaiting: they are not due yet (realPartnerDue: the year you got together, or both of you 22 and over);
//   once they are due you meet sooner (story/core.js dating), and while you date them you do not break up at random
//   (realPartnerSteady). Your own choices can still end it, and a marriage goes as any other.
export const onlyPartner = ctx => { const m = partnerMember(ctx.family); return !!(m && m.only); };
export const keptForPartner = (s, ctx) => onlyPartner(ctx) && s.flags.realPartnerMet === undefined;
export const realPartnerWaiting = (s, ctx) => keptForPartner(s, ctx) && !realPartnerDue(s, ctx);
export const realPartnerSteady = (s, ctx) => onlyPartner(ctx) && datingReal(s);

// True while the year you got together is still ahead: until then, relationships do not lead to marriage, so the
// story can reach that year with you free to meet.
export function realPartnerAhead(s, ctx) {
  const m = partnerMember(ctx.family), plan = realPartnerPlan(m);
  return !!(m && plan.meet !== null && s.flags.realPartnerMet === undefined && s.year < plan.meet);
}

// With a wedding year: while you date the real partner before it, the relationship holds (no breakup, no proposal),
// and in that year you marry (story/core.js realPartnerWedding). The player's own choices can still change course.
const datingReal = s => s.rel === "dating" && s.partner && s.partner.real;
export function realPartnerEngaged(s, ctx) {
  const wed = realPartnerPlan(partnerMember(ctx.family)).wed;
  return wed !== null && datingReal(s) && s.year < wed;
}
export function realPartnerWeddingDue(s, ctx) {
  const wed = realPartnerPlan(partnerMember(ctx.family)).wed;
  return wed !== null && datingReal(s) && s.year >= wed;
}

// The real partner as a person in the story: their name (called by the given name, 王小明 → 小明), or a random name
// when none was given; their sex and birth year (without a date, about your age, as a random partner would be); a
// nature drawn as usual. They did not go to school with you when they are more than three years apart.
export function realPartner(s, ctx, m) {
  const age = m.date ? s.year - m.date.y : Math.max(18, s.age + Math.round(ctx.rng.between(-3, 4)) * (s.sex === "male" ? -1 : 1));
  const how = meetPlace(s, ctx, { classmates: Math.abs(s.age - age) <= 3 });
  const sex = m.sex || (s.sex === "male" ? "female" : "male");
  const p = newPerson(s, ctx, { role: "partner", sex, birthYear: s.year - age, how, name: m.name || null });
  p.age = age; p.real = true;
  return p;
}

// How the story went with the real partner, for 同盤重跑: you met, married (life.js records the age), and divorced
// (they are among your exes and alive: being widowed is not a divorce).
export function realPartnerOutcome(s) {
  const p = [s.partner, ...s.exes].find(x => x && x.real);
  const married = !!p && s.flags.realPartnerWed !== undefined;
  return { met: !!p, married, divorced: married && p !== s.partner && p.alive !== false };
}
export const ageOf = (s, p) => s.year - p.birthYear;

// Two people of the same sex: they can marry from 2019 (core/family.js SAME_SEX_MARRIAGE), and the story has no
// births for them (story/core.js baby) nor the 婆婆 and 岳母 of a husband and wife (story/adult.js a_inlaws).
export const sameSexCouple = s => !!(s.partner && s.partner.sex === s.sex);
export const canMarry = s => !sameSexCouple(s) || s.year >= SAME_SEX_MARRIAGE;
// The sex of someone you date: the same as yours when the partner from the family input is, else the other one.
export function datingSex(s, ctx) {
  const m = partnerMember(ctx.family);
  return m && m.sex === s.sex ? s.sex : s.sex === "male" ? "female" : "male";
}

// 他 / 她
export const pronoun = p => (p && p.sex === "female" ? "她" : "他");

// A child takes the father's surname, as most families in Taiwan still do: a nickname such as 小明 has none, and then
// one is drawn once and kept (surnameOf, or on the partner).
export function newKid(s, ctx) {
  const sex = ctx.rng() < 0.512 ? "male" : "female";   // about 105 boys per 100 girls at birth
  const surname = (s.sex === "male" ? surnameOf(s, ctx.rng) : s.partner ? surnameIn(s.partner.name) || (s.partner.surname ||= randomSurname(ctx.rng)) : null) || randomSurname(ctx.rng);
  const kid = newPerson(s, ctx, { role: "kid", sex, birthYear: s.year, surname });
  kid.age = 0;
  return kid;
}

// Where two people meet depends on age and era: 相親 was common before the 1990s, chat rooms around 2000,
// dating apps from about 2013.
export function meetPlace(s, ctx, { classmates = true } = {}) {
  const options = [];
  // At school, a classmate; once you have left it, an old classmate met again at a reunion.
  if (s.age <= 24 && classmates) options.push(s.studying ? ["同學", 3] : ["老同學", 1.5]);
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
