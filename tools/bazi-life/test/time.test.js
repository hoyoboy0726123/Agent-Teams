import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWallTime, clockNotes, offsetAt, formatOffset } from "../src/core/time.js";

const TPE = "Asia/Taipei";
const iso = ms => new Date(ms).toISOString().slice(0, 16);
const resolve = (y, m, d, h, mi, tz = TPE) => resolveWallTime({ y, m, d, h, mi, s: 0 }, tz);
const kinds = (ms, tz = TPE) => clockNotes(ms, tz).notes.map(n => n.kind);

test("ordinary Taiwan time is UTC+8", () => {
  const r = resolve(2000, 1, 1, 12, 0);
  assert.equal(r.status, "ok");
  assert.equal(iso(r.instants[0]), "2000-01-01T04:00");
  assert.deepEqual(kinds(r.instants[0]), []);
});

test("Taiwan summer time 1950 is UTC+9", () => {
  const r = resolve(1950, 7, 1, 12, 0);
  assert.equal(iso(r.instants[0]), "1950-07-01T03:00");
  assert.deepEqual(kinds(r.instants[0]), ["dst"]);
});

test("Taiwan war time 1937-10-01 to 1945-09-21 is UTC+9 standard time, not summer time", () => {
  for (const [y, m, d] of [[1937, 11, 1], [1940, 1, 1], [1945, 9, 1]]) {
    const r = resolve(y, m, d, 12, 0);
    assert.equal(iso(r.instants[0]).slice(11), "03:00", `${y}-${m}-${d}`);
    assert.deepEqual(kinds(r.instants[0]), ["standard"], `${y}-${m}-${d}`);
  }
  assert.equal(iso(resolve(1937, 9, 30, 12, 0).instants[0]).slice(11), "04:00");
  assert.equal(iso(resolve(1945, 9, 22, 12, 0).instants[0]).slice(11), "04:00");
});

test("every Taiwan summer time period is detected", () => {
  for (const y of [1946, 1947, 1948, 1949, 1950, 1951, 1952, 1953, 1954, 1955, 1956, 1957, 1958, 1959, 1960, 1961, 1974, 1975, 1979]) {
    const r = resolve(y, 8, 15, 12, 0);
    assert.equal(offsetAt(r.instants[0], TPE), 540, String(y));
    assert.deepEqual(kinds(r.instants[0]), ["dst"], String(y));
  }
  for (const y of [1962, 1973, 1976, 1978, 1980]) assert.equal(offsetAt(resolve(y, 8, 15, 12, 0).instants[0], TPE), 480, String(y));
});

test("1979-09-30 23:30 happened twice in Taiwan", () => {
  const r = resolve(1979, 9, 30, 23, 30);
  assert.equal(r.status, "ambiguous");
  assert.deepEqual(r.instants.map(iso), ["1979-09-30T14:30", "1979-09-30T15:30"]);
});

test("1979-07-01 00:30 never happened in Taiwan; read as standard time", () => {
  const r = resolve(1979, 7, 1, 0, 30);
  assert.equal(r.status, "gap");
  assert.equal(r.skipped, 60);
  assert.deepEqual(r.instants.map(iso), ["1979-06-30T16:30"]);
});

test("China summer time 1986–1991", () => {
  const r = resolve(1988, 7, 1, 12, 0, "Asia/Shanghai");
  assert.equal(iso(r.instants[0]), "1988-07-01T03:00");
  assert.deepEqual(kinds(r.instants[0], "Asia/Shanghai"), ["dst"]);
});

test("US winter time is standard time, summer time is detected, gaps and repeats are found", () => {
  const ny = "America/New_York";
  const winter = resolve(1990, 3, 10, 10, 0, ny);
  assert.equal(iso(winter.instants[0]), "1990-03-10T15:00");
  assert.deepEqual(kinds(winter.instants[0], ny), []);
  assert.deepEqual(kinds(resolve(1990, 7, 10, 10, 0, ny).instants[0], ny), ["dst"]);
  assert.equal(resolve(2021, 3, 14, 2, 30, ny).status, "gap");
  assert.equal(resolve(2021, 11, 7, 1, 30, ny).status, "ambiguous");
});

test("southern hemisphere summer time spans the new year", () => {
  const syd = "Australia/Sydney";
  assert.deepEqual(kinds(resolve(2020, 1, 15, 12, 0, syd).instants[0], syd), ["dst"]);
  assert.deepEqual(kinds(resolve(2020, 7, 15, 12, 0, syd).instants[0], syd), []);
});

test("local mean time before standard time", () => {
  const r = resolve(1890, 1, 1, 12, 0);
  assert.equal(formatOffset(offsetAt(r.instants[0], TPE)), "+8:06");
  assert.deepEqual(kinds(r.instants[0]), ["lmt"]);
});
