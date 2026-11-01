// How Cloudflare serves public/ as Workers Static Assets (wrangler.jsonc "assets"): npm run build writes these next to
// the pages, and test/helpers/static-site.mjs serves public/ by the same rules in the browser test.
//
// Static assets are free and unlimited on the Workers Free plan and do not count against its 100,000 Worker requests
// a day, so the site keeps loading when that quota is used up (only /api/* and /admin run the Worker).
// html_handling is "none" (a path is a file name, nothing is redirected), so the clean URLs are rewrites (status 200):
// the address stays as it is and the file behind it is served, exactly as when the Worker served the pages itself.
export const REDIRECTS = `# Written in the Stars' clean URLs (scripts/static-site.mjs). 200 = served in place, the address does not change.
/ /index.html 200
/privacy /privacy.html 200
/terms /terms.html 200
`;

// The headers the Worker used to set. Pages: checked on every visit (no-cache, with the ETag static assets add, so an
// unchanged page is a 304 and a new deploy shows at once), no framing. The share image, the fonts and robots.txt: a
// day's cache. A rule's "! Cache-Control" drops the one /* set, so each file carries exactly one.
const DAY = ["  ! Cache-Control", "  Cache-Control: public, max-age=86400"];
export const HEADERS = [
  "# Headers for the static files (scripts/static-site.mjs). The Worker's own answers (/api/*, /admin) set theirs.",
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "  X-Frame-Options: DENY",
  "  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "  Cache-Control: no-cache",
  "/og.png", ...DAY,
  "/fonts/*", ...DAY,
  "/robots.txt", ...DAY,
  "",
].join("\n");

export const ROBOTS = "User-agent: *\nDisallow: /admin\nDisallow: /api/\n";

// Any path that is not a file (not_found_handling "404-page").
export const NOT_FOUND_HTML = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Not found · Written in the Stars</title><body style="font:16px/1.6 system-ui,sans-serif;background:#0b1026;color:#eceaf8;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center"><main><h1 style="font-family:Georgia,serif;font-weight:500">This page isn't in the stars.</h1><p><a style="color:#f0cd84" href="/">Back to the game</a></p></main></body></html>
`;
