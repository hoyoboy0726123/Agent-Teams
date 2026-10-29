// 今天的 AI 額度用完了：the Worker answered "quota" (Workers AI's daily free allocation, which starts again at 00:00 UTC,
// 08:00 in Taiwan). Until the UTC day changes, this tab neither shows the AI parts nor sends anything: the end page's AI
// card, the play screen's 結局自動 AI 解讀 and the 合婚 tab's AI 深度合婚 stay hidden. Only the date is kept, in this tab
// (sessionStorage, like the drafts); where storage is blocked it is kept until the page is closed.
const KEY = "bazi-life.aiOut";
let kept = null;
const today = () => new Date().toISOString().slice(0, 10);

export function aiOutToday() {
  let day = kept;
  try { day = sessionStorage.getItem(KEY) || kept; } catch { /* storage blocked */ }
  return day === today();
}

export function markAiOut() {
  kept = today();
  try { sessionStorage.setItem(KEY, kept); } catch { /* storage blocked */ }
}
