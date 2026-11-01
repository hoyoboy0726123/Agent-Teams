// Builds the site into public/ (npm run build):
//   public/index.html     the game (src/index.html + src/app.js bundled in, one self-contained page)
//   public/privacy.html   the privacy policy (src/legal.js)
//   public/terms.html     the terms of use (src/legal.js)
//   public/og.png, public/fonts/   copied from assets/ (the share picture; the Fraunces files, src/fonts.js: no Google
//                         Fonts)
//   public/404.html, public/robots.txt, public/_redirects, public/_headers   how Cloudflare serves public/ as Workers
//                         Static Assets (scripts/static-site.mjs): the clean URLs /, /privacy, /terms, the headers, the
//                         404 page
// Everything in public/ is a static asset (wrangler.jsonc "assets"): served without running the Worker, so the site
// keeps working when the Free plan's daily Worker requests run out. The Worker only answers /api/* and /admin.
//   --stats-url <url>   where the page sends its anonymous counts (default /api/stats, the Worker's own;
//                       pass "" for a copy hosted without the Worker, which then sends nothing)
import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PRIVACY_HTML, TERMS_HTML } from "../src/legal.js";
import { FONT_CSS, FONT_PRELOAD } from "../src/fonts.js";
import { REDIRECTS, HEADERS, ROBOTS, NOT_FOUND_HTML } from "./static-site.mjs";

const at = p => fileURLToPath(new URL(`../${p}`, import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] ?? "" : fallback; };
const inline = js => js.replace(/<\/script/gi, "<\\/script");

await mkdir(at("public"), { recursive: true });
const bundled = await build({
  entryPoints: [at("src/app.js")], bundle: true, minify: true, format: "iife", target: "es2020", write: false,
  legalComments: "none", logLevel: "error",
  banner: { js: "/* Written in the Stars. Includes astronomy-engine (MIT License, Copyright (c) 2019-2023 Don Cross). */" },
});
const source = await readFile(at("src/index.html"), "utf8");
const body = source.replaceAll("__STATS_URL__", arg("--stats-url", "/api/stats")).replace("<!--__FONT_PRELOAD__-->", FONT_PRELOAD).replace("/*__FONTS__*/", () => FONT_CSS).replace("/*__APP__*/", () => inline(bundled.outputFiles[0].text));
const split = body.indexOf('<div class="page">');
const head = body.slice(0, split).trim(), rest = body.slice(split).trim();
const doc = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${rest}\n</body>\n</html>\n`;
await writeFile(at("public/index.html"), doc);
await writeFile(at("public/privacy.html"), PRIVACY_HTML);
await writeFile(at("public/terms.html"), TERMS_HTML);
console.log(`public/index.html ${(doc.length / 1024).toFixed(0)} KB, public/privacy.html, public/terms.html`);
// The files the Worker used to import: public/ is not in git, so they are copied in on every build.
await copyFile(at("assets/og.png"), at("public/og.png"));
await mkdir(at("public/fonts"), { recursive: true });
const fonts = (await readdir(at("assets/fonts"))).filter(f => /\.woff2$|^OFL\.txt$/.test(f));
for (const f of fonts) await copyFile(at(`assets/fonts/${f}`), at(`public/fonts/${f}`));
await writeFile(at("public/_redirects"), REDIRECTS);
await writeFile(at("public/_headers"), HEADERS);
await writeFile(at("public/robots.txt"), ROBOTS);
await writeFile(at("public/404.html"), NOT_FOUND_HTML);
console.log(`public/og.png, public/fonts/ (${fonts.join(", ")}), public/_redirects, public/_headers, public/robots.txt, public/404.html`);
