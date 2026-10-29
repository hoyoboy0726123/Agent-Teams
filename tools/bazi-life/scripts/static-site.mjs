// How Cloudflare serves public/ as Workers Static Assets (wrangler.jsonc "assets"): npm run build writes these next to
// the pages, and test/helpers/static-site.mjs serves public/ by the same rules in the browser tests.
//
// Static assets are free and unlimited on the Workers Free plan and do not count against its 100,000 Worker requests
// a day, so the pages keep loading when that quota is used up (only /api/* and /admin run the Worker).
// html_handling is "none" (a path is a file name, nothing is redirected), so the clean URLs are rewrites (status 200):
// the address stays as it is and the file behind it is served, exactly as when the Worker served the pages itself.
export const REDIRECTS = `# 命盤人生's clean URLs (scripts/static-site.mjs). 200 = served in place, the address does not change.
/ /life.html 200
/life /life.html 200
/chart /index.html 200
/privacy /privacy.html 200
/terms /terms.html 200
`;

// The headers the Worker used to set. Pages: checked on every visit (no-cache, with the ETag static assets add, so an
// unchanged page is a 304 and a new deploy shows at once). The share image and the English story: a day's cache.
// A rule's "! Cache-Control" drops the one /* set, so each file carries exactly one.
const DAY = ["  ! Cache-Control", "  Cache-Control: public, max-age=86400"];
export const HEADERS = [
  "# Headers for the static files (scripts/static-site.mjs). The Worker's own answers (/api/*, /admin) set theirs.",
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "  Cache-Control: no-cache",
  "/og.png", ...DAY,
  "/i18n/*", ...DAY,
  "",
].join("\n");

export const ROBOTS = "User-agent: *\nDisallow: /admin\nDisallow: /api/\n";

// Any path that is not a file (not_found_handling "404-page"): Chinese, with the English below.
export const NOT_FOUND_HTML = `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>找不到這個頁面｜命盤人生</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box;font:16px/1.7 system-ui,"PingFang TC","Noto Sans TC",sans-serif;background:#eef1f0;color:#1c2330;text-align:center}main{max-width:28em}h1{font-size:22px;margin:0 0 8px}p{margin:4px 0}a{color:#b5332a}@media (prefers-color-scheme:dark){body{background:#11151b;color:#e5e9ed}a{color:#ec6a57}}</style>
</head>
<body>
<main>
<h1>找不到這個頁面。</h1>
<p><a href="/">回到命盤人生</a></p>
<p lang="en">This page isn't here. <a href="/">Back to BaZi Life</a></p>
</main>
</body>
</html>
`;
