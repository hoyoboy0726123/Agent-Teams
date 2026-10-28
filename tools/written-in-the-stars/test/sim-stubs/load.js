// Loads the engine for the tests. The modules of the other tracks are used when they exist; a missing one (the US
// data, the chart engine, the story) is replaced by its stand-in in this folder, through a resolve hook registered
// before the engine is imported. `stubbed` says which ones are stand-ins in this run.
import { register } from "node:module";
import { existsSync } from "node:fs";

const SRC = new URL("../../src/", import.meta.url);
const STAND_INS = { "data/us-rates.js": "us-rates.js", "astro/index.js": "astro.js", "sim/story/index.js": "story.js" };
export const stubbed = {};
let ready = null;

export function loadSim() {
  if (!ready) {
    const stubs = {};
    for (const [real, stand] of Object.entries(STAND_INS)) {
      stubbed[real] = !existsSync(new URL(real, SRC));
      if (stubbed[real]) stubs[`/src/${real}`] = new URL(stand, import.meta.url).href;
    }
    if (Object.keys(stubs).length) register(new URL("./hooks.mjs", import.meta.url), { data: { stubs } });
    ready = (async () => {
      const [seam, life, monte, rates, world, people, words, act, actions, intent, interpret, privacy, grammar, traits, setup, story, compare, rng, randomName] = await Promise.all([
        "seam.js", "life.js", "monte.js", "rates.js", "world.js", "people.js", "words.js", "act.js", "actions.js", "intent.js", "interpret.js", "privacy.js", "grammar.js", "traits.js", "setup.js", "story/index.js", "compare.js", "rng.js", "random-name.js",
      ].map(f => import(new URL(`sim/${f}`, SRC).href)));
      // The stand-in story is also loaded on its own, so the engine tests can run on it even when the real story is in.
      const stubStory = await import(new URL("story.js", import.meta.url).href);
      return { seam, life, monte, rates, world, people, words, act, actions, intent, interpret, privacy, grammar, traits, setup, story, compare, rng, randomName, stubStory, stubbed };
    })();
  }
  return ready;
}
