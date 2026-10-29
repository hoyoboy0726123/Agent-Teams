// The welcome page's live numbers when the Worker cannot answer. On the Workers Free plan the account has 100,000
// Worker requests a day (shared with the sister site); past that, Cloudflare answers every Worker route with its own
// error 1027 (status 429 or a 5xx, usually an HTML page) until 00:00 UTC. The pages are static assets and still load,
// so the game works; only /api/live and /api/stats fail. The page then hides the live strip and says when the numbers
// come back. Two failures in a row mean "paused" (the page retries once soon after the first): one network blip does
// not show the notice.

// One /api/live answer: its JSON object, or null for anything else (an error status, Cloudflare's HTML page, no answer).
export async function readLive(url, fetchFn = fetch) {
  try {
    const r = await fetchFn(url, { cache: "no-store" });
    if (!r.ok || !/json/i.test(r.headers.get("content-type") || "")) return null;
    const d = await r.json();
    return d && typeof d === "object" && !Array.isArray(d) ? d : null;
  } catch {
    return null;
  }
}

// Consecutive failures: fail() says whether the numbers now count as paused, ok() starts over.
export const PAUSE_AFTER = 2;
export function liveTracker() {
  let fails = 0;
  return {
    ok() { fails = 0; },
    fail() { fails += 1; return fails >= PAUSE_AFTER; },
    get paused() { return fails >= PAUSE_AFTER; },
    get fails() { return fails; },
  };
}

// When the daily quota comes back (the next 00:00 UTC), in the viewer's own time: "8:00 AM", with the weekday when that
// is not today where the viewer is ("Thursday 8:00 AM"). locale and timeZone are for the tests; the page passes none.
export function resumeTime(now = new Date(), { locale, timeZone } = {}) {
  const at = new Date(now.getTime());
  at.setUTCHours(24, 0, 0, 0);
  const day = d => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const today = day(at) === day(now);
  return new Intl.DateTimeFormat(locale, { timeZone, ...(today ? {} : { weekday: "long" }), hour: "numeric", minute: "2-digit" }).format(at);
}

// The notice, Chinese as the page writes it; i18n's t() gives the English (src/i18n/en.json).
export const PAUSED_ZH = "今天玩的人太多了，即時數字暫停更新，將在你的時間 {time} 恢復。遊戲照常可以玩 😊";
