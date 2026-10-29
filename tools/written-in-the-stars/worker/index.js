// The Worker's entry (wrangler.jsonc): the built pages, imported as text (run `npm run build` first), and the app.
import GAME from "../public/index.html";
import PRIVACY from "../public/privacy.html";
import TERMS from "../public/terms.html";
import OG from "../assets/og.png";
// The display face, Fraunces (OFL; src/fonts.js), served from the site itself instead of Google Fonts. The woff2 files
// are Data modules: wrangler.jsonc needs "**/*.woff2" in its Data rule.
import FRAUNCES from "../assets/fonts/fraunces-latin.woff2";
import FRAUNCES_EXT from "../assets/fonts/fraunces-latin-ext.woff2";
import FRAUNCES_ITALIC from "../assets/fonts/fraunces-italic-latin.woff2";
import FRAUNCES_ITALIC_EXT from "../assets/fonts/fraunces-italic-latin-ext.woff2";
import OFL from "../assets/fonts/OFL.txt";
import { makeApp } from "./app.js";
export { StatsStore } from "./stats-store.js";

export default makeApp({
  "/": GAME, "/index.html": GAME,
  "/privacy": PRIVACY, "/privacy.html": PRIVACY,
  "/terms": TERMS, "/terms.html": TERMS,
}, {
  // The picture X, Facebook, Threads and others show with a shared link (og:image in src/index.html).
  "/og.png": { body: OG, type: "image/png" },
  "/fonts/fraunces-latin.woff2": { body: FRAUNCES, type: "font/woff2" },
  "/fonts/fraunces-latin-ext.woff2": { body: FRAUNCES_EXT, type: "font/woff2" },
  "/fonts/fraunces-italic-latin.woff2": { body: FRAUNCES_ITALIC, type: "font/woff2" },
  "/fonts/fraunces-italic-latin-ext.woff2": { body: FRAUNCES_ITALIC_EXT, type: "font/woff2" },
  "/fonts/OFL.txt": { body: OFL, type: "text/plain; charset=utf-8" },
});
