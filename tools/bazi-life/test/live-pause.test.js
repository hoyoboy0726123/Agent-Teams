// The welcome page's live numbers when the Worker's daily quota is used up (src/live-pause.js): any answer that is not
// the JSON is a failure, two in a row pause the numbers, and the notice says when they come back in the viewer's time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readLive, liveTracker, resumeTime, PAUSED_ZH } from "../src/live-pause.js";
import EN from "../src/i18n/en.json" with { type: "json" };

const answer = (status, body, type) => async () => new Response(body, { status, headers: { "content-type": type } });

test("only an OK JSON answer counts: Cloudflare's 1027 page, a 5xx, a non-JSON body or no network are failures", async () => {
  assert.deepEqual(await readLive("/api/live", answer(200, '{"total":3}', "application/json; charset=utf-8")), { total: 3 });
  assert.equal(await readLive("/api/live", answer(429, "<html>error code: 1027</html>", "text/html")), null);
  assert.equal(await readLive("/api/live", answer(503, '{"error":"unavailable"}', "application/json")), null);
  assert.equal(await readLive("/api/live", answer(200, "<html>error code: 1027</html>", "text/html")), null);
  assert.equal(await readLive("/api/live", answer(200, "not json", "application/json")), null);
  assert.equal(await readLive("/api/live", answer(200, "[1]", "application/json")), null);
  assert.equal(await readLive("/api/live", async () => { throw new TypeError("Failed to fetch"); }), null);
});

test("two failures in a row pause the numbers; one does not, and an answer starts over", () => {
  const t = liveTracker();
  assert.equal(t.fail(), false);
  assert.equal(t.paused, false);
  t.ok();
  assert.equal(t.fail(), false, "a blip, an answer, a blip: never two in a row");
  assert.equal(t.fail(), true);
  assert.equal(t.paused, true);
  t.ok();
  assert.equal(t.paused, false);
});

test("the numbers come back at the next 00:00 UTC, in the viewer's time, with the weekday when it is not today", () => {
  const now = new Date("2026-10-29T15:00:00Z");
  // Taipei: 23:00 on Thursday, and 00:00 UTC is 08:00 on Friday.
  assert.equal(resumeTime(now, { locale: "en-US", timeZone: "Asia/Taipei" }), "Friday 8:00 AM");
  // New York: 11:00 on Thursday, and 00:00 UTC is 20:00 the same day.
  assert.equal(resumeTime(now, { locale: "en-US", timeZone: "America/New_York" }), "8:00 PM");
  assert.equal(resumeTime(new Date("2026-10-29T23:59:00Z"), { locale: "en-US", timeZone: "UTC" }), "Friday 12:00 AM");
  assert.match(resumeTime(), /\d:\d\d/);
});

test("the notice has its English, with the same {time}", () => {
  assert.equal(EN[PAUSED_ZH], "We've hit today's traffic limit. Please come back tomorrow (from about {time} your time) 🙏");
  assert.match(PAUSED_ZH, /\{time\}/);
});
