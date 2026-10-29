// Local birth time → UTC, with the historical rules of the IANA zones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localToUtc, resolveWallTime, offsetLabel } from "../src/astro/time.js";
import { PLACES, ALL_PLACES, findPlace } from "../src/astro/places.js";

const utc = (date, time, tz) => localToUtc(date, time, tz).date.toISOString();

test("historical US time zone rules", () => {
  // 1974: year-round daylight time from January 6.
  assert.equal(utc({ y: 1974, m: 1, d: 15 }, { h: 12, mi: 0 }, "America/New_York"), "1974-01-15T16:00:00.000Z");
  assert.equal(utc({ y: 1973, m: 1, d: 15 }, { h: 12, mi: 0 }, "America/New_York"), "1973-01-15T17:00:00.000Z");
  assert.equal(localToUtc({ y: 1974, m: 1, d: 15 }, { h: 12, mi: 0 }, "America/New_York").dst, true);
  // Arizona: no DST since 1968 (it had DST in 1967).
  assert.equal(utc({ y: 1990, m: 7, d: 1 }, { h: 12, mi: 0 }, "America/Phoenix"), "1990-07-01T19:00:00.000Z");
  assert.equal(utc({ y: 1967, m: 7, d: 1 }, { h: 12, mi: 0 }, "America/Phoenix"), "1967-07-01T18:00:00.000Z");
  // Indianapolis: Eastern with no DST 1971–2005, DST from 2006. Evansville and Gary: Central with DST.
  assert.equal(utc({ y: 1990, m: 7, d: 1 }, { h: 12, mi: 0 }, "America/Indiana/Indianapolis"), "1990-07-01T17:00:00.000Z");
  assert.equal(utc({ y: 2010, m: 7, d: 1 }, { h: 12, mi: 0 }, "America/Indiana/Indianapolis"), "2010-07-01T16:00:00.000Z");
  assert.equal(utc({ y: 1990, m: 7, d: 1 }, { h: 12, mi: 0 }, findPlace("Evansville", "IN").tz), "1990-07-01T17:00:00.000Z");
  // Hawaii: UTC−10:30 before 1947, no DST since.
  assert.equal(utc({ y: 1940, m: 6, d: 1 }, { h: 12, mi: 0 }, "Pacific/Honolulu"), "1940-06-01T22:30:00.000Z");
  assert.equal(utc({ y: 2001, m: 7, d: 4 }, { h: 12, mi: 0 }, "Pacific/Honolulu"), "2001-07-04T22:00:00.000Z");
  // Anchorage: UTC−10 in the 1960s, Alaska time (UTC−9, −8 in summer) since 1983.
  assert.equal(utc({ y: 1965, m: 1, d: 10 }, { h: 12, mi: 0 }, "America/Anchorage"), "1965-01-10T22:00:00.000Z");
  assert.equal(utc({ y: 2001, m: 7, d: 4 }, { h: 12, mi: 0 }, "America/Anchorage"), "2001-07-04T20:00:00.000Z");
  // DST dates: first Sunday of April before 2007, second Sunday of March since.
  assert.equal(localToUtc({ y: 2006, m: 3, d: 20 }, { h: 12, mi: 0 }, "America/Chicago").dst, false);
  assert.equal(localToUtc({ y: 2007, m: 3, d: 20 }, { h: 12, mi: 0 }, "America/Chicago").dst, true);
});

test("the fall-back hour takes the earlier instant, the spring-forward gap the pre-jump offset", () => {
  const fall = resolveWallTime({ y: 1985, m: 10, d: 27, h: 1, mi: 30 }, "America/New_York");
  assert.equal(fall.status, "ambiguous");
  assert.equal(fall.instants.length, 2);
  assert.equal(utc({ y: 1985, m: 10, d: 27 }, { h: 1, mi: 30 }, "America/New_York"), "1985-10-27T05:30:00.000Z");   // EDT
  const gap = resolveWallTime({ y: 2010, m: 3, d: 14, h: 2, mi: 30 }, "America/Chicago");
  assert.equal(gap.status, "gap");
  assert.equal(gap.skipped, 60);
  assert.equal(utc({ y: 2010, m: 3, d: 14 }, { h: 2, mi: 30 }, "America/Chicago"), "2010-03-14T08:30:00.000Z");     // read as CST
  assert.equal(localToUtc({ y: 2010, m: 3, d: 14 }, { h: 2, mi: 30 }, "America/Chicago").status, "gap");
});

test("unknown time is noon, flagged", () => {
  const r = localToUtc({ y: 1990, m: 8, d: 15 }, null, "America/New_York");
  assert.equal(r.timeKnown, false);
  assert.equal(r.date.toISOString(), "1990-08-15T16:00:00.000Z");
  assert.equal(offsetLabel(-300), "UTC−5");
  assert.equal(offsetLabel(-630), "UTC−10:30");
});

test("every fixture's UTC instant agrees with Python's zoneinfo", () => {
  const { cases } = JSON.parse(readFileSync(new URL("./fixtures/astro-swe.json", import.meta.url), "utf8"));
  for (const c of cases) {
    const r = localToUtc(c.date, c.time, c.place.tz);
    assert.equal(r.date.toISOString(), c.utc, `${c.kind} ${c.place.name} ${JSON.stringify(c.date)} ${JSON.stringify(c.time)}`);
  }
});

test("places: every state and DC, valid zones, findPlace", () => {
  assert.equal(PLACES.length, 51);
  assert.ok(ALL_PLACES.length >= 140, `${ALL_PLACES.length} places`);
  const keys = new Set(ALL_PLACES.map(p => `${p.name}|${p.state}`));
  assert.equal(keys.size, ALL_PLACES.length, "no duplicates");
  for (const p of ALL_PLACES) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en-US", { timeZone: p.tz }), p.name);
    assert.ok(p.lat > 18 && p.lat < 66 && p.lon < -66 && p.lon > -160, p.name);
  }
  assert.equal(findPlace("austin", "tx").tz, "America/Chicago");
  assert.equal(findPlace("Saint Louis", "MO").name, "St. Louis");
  assert.equal(findPlace("Portland", "ME").state, "ME");
  assert.equal(findPlace("Portland").state, "OR");   // no state: the larger one
  assert.equal(findPlace("Atlantis", "XX"), null);
});
