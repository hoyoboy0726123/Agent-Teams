// The Worker's entry (wrangler.jsonc): the built pages, imported as text (run `npm run build` first), and the app.
import GAME from "../public/index.html";
import PRIVACY from "../public/privacy.html";
import TERMS from "../public/terms.html";
import OG from "../assets/og.png";
import { makeApp } from "./app.js";
export { StatsStore } from "./stats-store.js";

export default makeApp({
  "/": GAME, "/index.html": GAME,
  "/privacy": PRIVACY, "/privacy.html": PRIVACY,
  "/terms": TERMS, "/terms.html": TERMS,
}, {
  // The picture X, Facebook, Threads and others show with a shared link (og:image in src/index.html).
  "/og.png": { body: OG, type: "image/png" },
});
