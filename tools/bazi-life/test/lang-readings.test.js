// The readings' English layer (src/core/tr.js) must leave the Chinese exactly as it was: 40 charts' every reading
// (natal, decades, years, event reasons, name, overall, partner, 合婚, the three schools, the whole report), as one
// digest per chart, recorded before any reading was touched. Regenerate only for a deliberate change to Chinese text:
// UPDATE_ZH_READINGS=1 node --test test/lang-readings.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readingsOf } from "./helpers/readings.js";
import { setReadingLang, readingLang } from "../src/core/tr.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/zh-readings.json", import.meta.url));
const digest = x => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 32);
export const READING_CHARTS = 40;

test("Chinese readings are unchanged: 40 charts, every reading, as before the English layer", async () => {
  setReadingLang(null);
  assert.equal(readingLang(), "zh");
  const now = Array.from({ length: READING_CHARTS }, (_, i) => digest(readingsOf(i)));
  if (process.env.UPDATE_ZH_READINGS) await writeFile(FIXTURE, JSON.stringify({ charts: READING_CHARTS, digests: now }, null, 1) + "\n");
  const fixture = JSON.parse(await readFile(FIXTURE, "utf8"));
  assert.deepEqual(now, fixture.digests);
});
