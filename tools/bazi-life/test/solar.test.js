import { test } from "node:test";
import assert from "node:assert/strict";
import * as Astronomy from "astronomy-engine";
import { equationOfTime, solarFields } from "../src/core/solar.js";
import { formatFields } from "../src/core/time.js";

// Reference: the Sun's apparent hour angle at Greenwich from astronomy-engine, minus mean solar time (UT).
function referenceEot(ms) {
  const ha = Astronomy.HourAngle(Astronomy.Body.Sun, new Date(ms), new Astronomy.Observer(0, 0, 0));
  const ut = ((ms / 3600000) % 24 + 24) % 24;
  return (((ha + 12 - ut) % 24 + 36) % 24 - 12) * 60;
}

test("equation of time is within 5 seconds of astronomy-engine, 1900–2100", () => {
  let worst = 0;
  for (let y = 1900; y <= 2100; y++) {
    for (let k = 0; k < 24; k++) {
      const ms = Date.UTC(y, 0, 1, (k * 7) % 24) + k * 15.2 * 86400000;
      worst = Math.max(worst, Math.abs(equationOfTime(ms) - referenceEot(ms)) * 60);
    }
  }
  assert.ok(worst < 5, `worst ${worst.toFixed(2)} s`);
});

test("equation of time has its well-known extremes", () => {
  assert.ok(Math.abs(equationOfTime(Date.parse("2024-02-11T04:00Z")) - -14.2) < 0.1);
  assert.ok(Math.abs(equationOfTime(Date.parse("2024-11-03T04:00Z")) - 16.5) < 0.1);
});

test("true solar time in Taipei", () => {
  // 2024-02-11 12:00 in Taipei: +6.2 minutes for longitude 121.56°E, −14.2 minutes equation of time.
  const { fields, shift } = solarFields(Date.parse("2024-02-11T04:00Z"), 121.56);
  assert.equal(formatFields(fields), "2024-02-11 11:52");
  assert.ok(Math.abs(shift.longitude - 486.24) < 0.01);
});

test("mean solar time ignores the equation of time", () => {
  const { fields } = solarFields(Date.parse("2024-02-11T04:00Z"), 121.56, "mean");
  assert.equal(formatFields(fields), "2024-02-11 12:06");
});
