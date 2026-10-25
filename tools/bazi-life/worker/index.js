// The Worker's entry (wrangler.jsonc): the two built pages, imported as text, and the app (worker/app.js).
// 「命盤人生」is the site's front page; the 排盤引擎 it links to stays at /index.html.
import LIFE from "../public/life.html";
import CHART from "../public/index.html";
import OG from "../public/og.png";
import { makeApp } from "./app.js";
export { StatsStore } from "./stats-store.js";

// og.png is the picture Facebook and LINE show with a shared link (the og:image meta in src/life.html).
export default makeApp({ "/": LIFE, "/life": LIFE, "/life.html": LIFE, "/index.html": CHART, "/chart": CHART }, { "/og.png": { body: OG, type: "image/png" } });
