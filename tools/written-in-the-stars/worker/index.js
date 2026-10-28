// The Worker's entry (wrangler.jsonc): the built pages, imported as text (run `npm run build` first), and the app.
import GAME from "../public/index.html";
import PRIVACY from "../public/privacy.html";
import TERMS from "../public/terms.html";
import { makeApp } from "./app.js";
export { StatsStore } from "./stats-store.js";

export default makeApp({
  "/": GAME, "/index.html": GAME,
  "/privacy": PRIVACY, "/privacy.html": PRIVACY,
  "/terms": TERMS, "/terms.html": TERMS,
});
