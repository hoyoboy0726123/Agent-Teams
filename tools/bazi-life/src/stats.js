// Anonymous counts for the site's back office (/admin): how many visits, how long the page was looked at, and which
// buttons were pressed. Only event names from a fixed list and a number of seconds are sent, to /api/stats on the
// site's own Worker; never a birthday, a name, an id or a cookie, and nothing is stored in the browser for it. The
// Worker adds them to daily totals and keeps nothing else (worker/stats.js). Without the Worker (a file, or the Claude
// artifact) nothing is sent.
const URL_ = (document.querySelector('meta[name="stats-endpoint"]') || {}).content || "";
const on = !!URL_ && /^https?:$/.test(location.protocol);
// The welcome page's numbers come from /api/live next to it (worker/app.js live).
export const LIVE_URL = on ? URL_.replace(/\/api\/stats$/, "/api/live") : "";
const MILESTONES = [[30, "t30"], [60, "t60"], [180, "t180"], [600, "t600"]];
let page = "life", queue = [], seconds = 0, since = null, flushTimer = null, life = null;
const once = new Set();

export function initStats(p) {
  page = p;
  if (!on) return;
  // Nothing is kept in the browser for the counts (no date of the last visit, no id), so there is no "visitor" or
  // "return" event any more: a visit is one "view". (The Worker still accepts those names, from older pages.)
  track("view");
  if (document.visibilityState !== "hidden") since = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { pause(); flush(); } else if (!since) since = Date.now();
  });
  addEventListener("pagehide", () => { pause(); flush(); });
  // Time on the page is the time it was on screen; it is sent in steps, so a phone that closes the tab quietly loses at
  // most the last minute. Each Worker request counts against the Free plan's daily quota, so the minute's post also
  // carries what needs no hurry: the milestones (t30…) and, while a life is played, the heartbeat. One post a minute.
  setInterval(() => {
    const total = visible();
    for (const [s, e] of MILESTONES) if (total >= s && !once.has(e)) { once.add(e); queue.push(e); }
    if (seconds + (since ? (Date.now() - since) / 1000 : 0) >= 60) {
      pause();
      if (document.visibilityState !== "hidden") { since = Date.now(); if (playing && playing()) queue.push("beat"); }
      flush();
    }
  }, 5000);
}

let shown = 0;   // seconds on screen already counted into `seconds` and sent
const visible = () => shown + seconds + (since ? (Date.now() - since) / 1000 : 0);
function pause() {
  if (since) { seconds += (Date.now() - since) / 1000; since = null; }
}

// A finished life's anonymous summary (worker/stats.js readLife): the decade of birth, the day stem, the age and three
// big things. It goes with the next batch; nothing else about the life or the person.
export function sendLife(summary) {
  if (!on) return;
  life = summary;   // the end itself is counted by the page's trackOnce("end"); this only rides along
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 2000);
}
// While a life is being played the page beats once a minute, so the welcome page can say how many are playing now.
// `isPlaying` says whether one is. The first beat goes at once, in the same post as the "start" counted with it; the
// next ones ride along with the minute's post (initStats), never a request of their own.
let playing = null;
export function heartbeat(isPlaying) {
  if (!on) return;
  playing = isPlaying;
  if (playing()) track("beat");
}

// One event; trackOnce also sends `${e}_u` the first time in this page load (how many visits did it at all).
export function track(e) {
  if (!on) return;
  queue.push(e);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 2000);
}
export function trackOnce(e, alsoEach = true) {
  if (!on) return;
  if (alsoEach) track(e);
  if (!once.has(e)) { once.add(e); track(alsoEach ? `${e}_u` : e); }
}

function flush() {
  clearTimeout(flushTimer);
  const s = Math.round(seconds);
  if (!queue.length && s < 1 && !life) return;
  shown += s; seconds -= s;
  const body = JSON.stringify({ p: page, e: queue.splice(0, 20), s, ...(life ? { life } : {}) });
  life = null;
  if (queue.length) flushTimer = setTimeout(flush, 500);
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(URL_, new Blob([body], { type: "text/plain" }))) return;
  } catch {}
  fetch(URL_, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
}
