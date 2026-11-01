const root = process.argv[2], file = process.argv[3];
const { readingRequest, readReadingRequest, readingPart, contentProblems } = await import(`${root}/src/ai-reading.js`);
const { findPlace } = await import(`${root}/src/core/places.js`);
const fs = await import("node:fs");
const input = { date: { y: 1990, m: 6, d: 21 }, time: { h: 12, mi: 0 }, place: findPlace("臺北市"), sex: "female" };
const parts = ["a", "b", "decades", "years0", "years1", "years2", "years3", "years4"];
const ps = parts.map(p => readingPart(readReadingRequest(JSON.parse(JSON.stringify(readingRequest(input, "full", { part: p })))), { now: 2026 }));
// One check context over every part's facts: what a whole book may say.
const C = { ...ps[0].check, facts: ps.map(p => p.facts).join("\n"), pillars: new Set(ps.flatMap(p => [...p.check.pillars])) };
const html = fs.readFileSync(file, "utf8").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
const text = html.replace(/<[^>]+>/g, "\n").replace(/&[a-z]+;/g, " ").split("\n").map(t => t.trim()).filter(Boolean).join("\n");
const r = contentProblems(text, C);
console.log("characters", (text.match(/[一-鿿]/g) || []).length);
console.log("problems", r.problems.length ? r.problems : "none");
console.log("warnings", r.warnings.length ? r.warnings : "none");
