// The year and month pillars hinge on the moments of the 12 節. tyme4ts computes them with the 壽星 algorithms;
// here they are checked against an independent ephemeris (astronomy-engine) for every year 1900–2100.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Astronomy from "astronomy-engine";
import { SolarTerm } from "tyme4ts";

test("the 12 節 agree with astronomy-engine within 90 seconds, 1900–2100", () => {
  let worst = 0, where = "";
  for (let y = 1900; y <= 2100; y++) {
    for (let i = 1; i <= 23; i += 2) {
      const term = SolarTerm.fromIndex(y, i);
      const t = term.getJulianDay().getSolarTime();
      const ms = Date.UTC(t.getYear(), t.getMonth() - 1, t.getDay(), t.getHour(), t.getMinute(), t.getSecond()) - 8 * 3600000;
      const ref = Astronomy.SearchSunLongitude((270 + 15 * i) % 360, new Date(ms - 3 * 86400000), 6).date.getTime();
      const diff = Math.abs(ms - ref) / 1000;
      if (diff > worst) { worst = diff; where = `${y} ${term.getName()}`; }
    }
  }
  assert.ok(worst < 90, `worst ${worst.toFixed(1)} s at ${where}`);
});

test("立春 2024 is at 16:27 in UTC+8", () => {
  const t = SolarTerm.fromIndex(2024, 3).getJulianDay().getSolarTime();
  assert.equal(`${t.getMonth()}-${t.getDay()} ${t.getHour()}:${t.getMinute()}`, "2-4 16:27");
});
