// The welcome page's live numbers when the Worker's daily quota is used up (src/ui/live-pause.js), as in bazi-life:
// any answer that is not the JSON is a failure, two in a row pause the numbers, and the notice says when they come back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readLive, liveTracker, resumeTime, pausedText } from "../src/ui/live-pause.js";

const answer = (status, body, type) => async () => new Response(body, { status, headers: { "content-type": type } });

test("only an OK JSON answer counts: Cloudflare's 1027 page, a 5xx, a non-JSON body or no network are failures", async () => {
  assert.deepEqual(await readLive("/api/live", answer(200, '{"total":3}', "application/json; charset=utf-8")), { total: 3 });
  assert.equal(await readLive("/api/live", answer(429, "<html>error code: 1027</html>", "text/html")), null);
  assert.equal(await readLive("/api/live", answer(503, '{"error":"unavailable"}', "application/json")), null);
  assert.equal(await readLive("/api/live", answer(200, "<html>error code: 1027</html>", "text/html")), null);
  assert.equal(await readLive("/api/live", async () => { throw new TypeError("Failed to fetch"); }), null);
});

test("two failures in a row pause the numbers; one does not, and an answer starts over", () => {
  const t = liveTracker();
  assert.equal(t.fail(), false);
  t.ok();
  assert.equal(t.fail(), false);
  assert.equal(t.fail(), true);
  assert.equal(t.paused, true);
  t.ok();
  assert.equal(t.paused, false);
});

test("the notice gives the next 00:00 UTC in the viewer's time, with the weekday when it is not today", () => {
  const now = new Date("2026-10-29T15:00:00Z");
  assert.equal(resumeTime(now, { locale: "en-US", timeZone: "America/New_York" }), "8:00 PM");
  // Kolkata: 20:30 on Thursday, and 00:00 UTC is 05:30 on Friday; Tokyo is already Friday, so no weekday.
  assert.equal(resumeTime(now, { locale: "en-US", timeZone: "Asia/Kolkata" }), "Friday 5:30 AM");
  assert.equal(resumeTime(now, { locale: "en-US", timeZone: "Asia/Tokyo" }), "9:00 AM");
  assert.equal(pausedText("8:00 PM"), "So many lives today that the live numbers are paused until 8:00 PM your time. The game still works.");
});
