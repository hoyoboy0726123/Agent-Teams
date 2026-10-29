// The Worker's entry (wrangler.jsonc): only the dynamic routes, /api/stats, /api/live and /admin (worker/app.js). The
// pages, og.png, the fonts and robots.txt are Workers Static Assets from public/ (npm run build; scripts/static-site.mjs),
// served by Cloudflare without running this Worker, so they keep loading when the Free plan's daily requests run out.
import { makeApp } from "./app.js";
export { StatsStore } from "./stats-store.js";

export default makeApp();
