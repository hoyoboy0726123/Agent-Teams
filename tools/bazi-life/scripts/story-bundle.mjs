// The English bundle of the story (README「英文版（翻譯層）」): src/i18n/en/*.json merged into one object, which
// scripts/build.mjs writes to public/i18n/story-en.json. The page fetches it only when English is on, so the Chinese
// page does not carry it. Each source file may hold
//   story  { Chinese template or string, as written in the code: English }   (one file per story file: era.json…)
//   words  { kind: { Chinese word: English } }                                (words.json)
//   names  { surnames, chars }                                                (names.json, scripts/romanise.mjs)
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { storyKey } from "../src/sim/lang.js";

const DIR = fileURLToPath(new URL("../src/i18n/en/", import.meta.url));

// { story, words, names, from }: from[Chinese] is the file its English came from (for the check).
export async function english() {
  const story = {}, words = {}, from = {};
  let names = null;
  for (const name of (await readdir(DIR)).filter(n => n.endsWith(".json")).sort()) {
    const json = JSON.parse(await readFile(join(DIR, name), "utf8"));
    for (const [zh, en] of Object.entries(json.story || {})) {
      if (Object.hasOwn(story, zh) && story[zh] !== en) throw new Error(`${name}: ${zh} has other English in ${from[zh]}`);
      story[zh] = en; from[zh] = name;
    }
    for (const section of Object.values(json.words || {})) {
      for (const [zh, en] of Object.entries(section)) {
        if (Object.hasOwn(words, zh) && words[zh] !== en) throw new Error(`${name}: the word ${zh} has two English words`);
        words[zh] = en;
      }
    }
    if (json.names) names = json.names;
  }
  return { story, words, names, from };
}

// What the page fetches. The story is keyed by a hash of the Chinese (lang.js storyKey) rather than the Chinese itself,
// which makes the bundle about 30 % smaller; two Chinese strings with the same hash stop the build.
export async function storyBundle() {
  const { story, words, names } = await english();
  const hashed = {}, seen = {};
  for (const [zh, en] of Object.entries(story)) {
    const k = storyKey(zh);
    if (Object.hasOwn(seen, k)) throw new Error(`same key ${k} for ${seen[k]} and ${zh}: lengthen storyKey`);
    seen[k] = zh; hashed[k] = en;
  }
  return { v: 1, keys: "fnv36", story: hashed, words, names };
}
