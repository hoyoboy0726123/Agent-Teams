// AI 分析報告 is not open yet: the end page and the 合婚 tab offer a button that says 敬請期待 (and is counted, see
// stats.js), and the Worker turns /api/reading away (AI_READING in wrangler.jsonc). To try the real reading on a
// phone or in the tests, set localStorage "bazi-life.aiPreview" to "1"; it only works where the Worker writes readings.
export const AI_PREVIEW_KEY = "bazi-life.aiPreview";
export function aiSoon() {
  try { return localStorage.getItem(AI_PREVIEW_KEY) !== "1"; } catch { return true; }
}
