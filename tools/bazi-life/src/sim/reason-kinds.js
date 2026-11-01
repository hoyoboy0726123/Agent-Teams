// Which 命理 explanation an event gets (core/reading-year.js eventReason), and which events are the turning points
// that also open a 「為什麼在這個歲數」 note. Deaths are never explained by the chart: that would read as fate.
export const EVENT_KINDS = {
  crush: "dating", dating: "dating", proposal: "marriage", breakup: "breakup", crisis: "divorce", divorce: "divorce",
  baby: "childbirth", moreKids: "childbirth",
  serious: "illness", chronic: "illness", burnout: "illness", accident: "injury",
  firstJob: "job", findJob: "job", jobChange: "careerChange", promotion: "promotion", layoff: "layoff",
  startupOffer: "startup", startupYear1: "startup", startupYear2: "startup", stakeResult: "startup",
  civilExam: "exam", exam15: "exam", exam18: "exam", studyAward: "exam", studySetback: "exam",
  graduateUni: "graduate", graduateMaster: "graduate", graduate5: "graduate", studyDone: "graduate",
  buyHome: "home", windfall: "wealthGain", loss: "wealthLoss", inheritance: "wealthGain",
  move: "move", familyMove: "move", returnHome: "move", abroad: "abroad",
  parentCare: "parentIll", sibling: "siblings", siblingHelp: "siblings", siblingRivalry: "siblings",
  retire: "retire",
};
export const TURNING = new Set([
  "dating", "proposal", "breakup", "crisis", "divorce", "baby", "moreKids", "serious", "chronic", "accident", "burnout",
  "firstJob", "promotion", "layoff", "jobChange", "startupOffer", "buyHome", "abroad", "parentCare", "retire", "exam18", "graduateUni",
]);
const NEVER = new Set(["death", "widowed", "fatherDeath", "motherDeath", "siblingDeath", "childIllness", "birth"]);

// The kind for an event id, or null. Story events without a kind of their own are explained by their domain, when the
// year's reading of that domain is clear in the same direction as the event (see life-app.js).
export const kindOf = id => (NEVER.has(id) ? null : EVENT_KINDS[id] || null);
export const explainable = id => !NEVER.has(id);
