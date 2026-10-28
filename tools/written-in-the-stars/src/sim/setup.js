// From a birth input (and an optional name) to what the simulation needs: the chart engine does the astrology
// (src/astro/index.js prepareChart), and the result is checked against the seam (seam.js) before any life runs.
//
//   input   { date: {y,m,d}, time: {h,mi} | null, place: { name, state, lat, lon, tz }, sex: "male" | "female" }
//   name    the protagonist's name, if the player gave one ("Jane Doe"); it only appears in the story
//   family  a hook for later (parents', siblings' and a partner's charts); null for now
// → prep = { chart, luck, traits0, jobFit, intro, name, family, input }
import { prepareChart } from "../astro/index.js";
import { makePrep, MAX_AGE } from "./seam.js";

export function prepare(input, { name = "", family = null } = {}) {
  const { chart, luck, traits0, jobFit, intro } = prepareChart(input);
  return makePrep({ chart, luck, traits0, jobFit, intro }, { input, name, family, maxAge: MAX_AGE });
}
