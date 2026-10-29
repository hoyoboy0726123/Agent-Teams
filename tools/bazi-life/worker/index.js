// The Worker's entry (wrangler.jsonc): only the dynamic routes, /api/* and /admin (worker/app.js). The pages, the share
// image and the English story are Workers Static Assets from public/ (npm run build; scripts/static-site.mjs), served
// by Cloudflare without running this Worker, so they keep loading when the Free plan's daily requests run out.
import { makeApp } from "./app.js";
export { StatsStore } from "./stats-store.js";

export default makeApp();
