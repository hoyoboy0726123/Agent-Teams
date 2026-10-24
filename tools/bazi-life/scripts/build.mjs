// Builds the pages from src/.
//   public/index.html   排盤引擎 (src/page.html + src/app.js)
//   public/life.html    人生模擬 (src/life.html + src/life-app.js)
// Both are complete documents with tyme4ts bundled in, for any static host (committed, so deploying needs no
// build step). For publishing as Claude artifacts, which load libraries from a CDN and are wrapped in their own
// document skeleton:
//   --fragment <file>        the 排盤 page without the skeleton, tyme4ts from unpkg (the same npm file)
//   --life-fragment <file>   the same for the 人生 page
//   --chart-url <url>        where the 人生 fragment links to the 排盤 page
// The full 人生 page asks the site's Worker (worker/index.js) at /api/interpret to read what the player writes, and at
// /api/reading for the AI 命理師解讀; the fragment has no Worker behind it, so it leaves both addresses empty: the page
// reads the words itself and says the AI reading is on the site. Both pages send anonymous counts to /api/stats
// (src/stats.js); the fragments send none.
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const TYME4TS_CDN = "https://unpkg.com/tyme4ts@1.5.2/dist/lib/index.mjs";
const at = p => fileURLToPath(new URL(`../${p}`, import.meta.url));
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const inline = js => js.replace(/<\/script/gi, "<\\/script");
const reset = "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>";

async function page({ html, js, out, fragment, links }) {
  let source = await readFile(at(html), "utf8");
  const bundled = await build({
    entryPoints: [at(js)], bundle: true, minify: true, format: "iife", target: "es2020", write: false,
    banner: { js: "/* 命盤人生. Includes tyme4ts (MIT License, Copyright (c) 2024 6tail). */" },
  });
  const fill = (text, map) => Object.entries(map).reduce((t, [k, v]) => t.replaceAll(k, v), text);
  const full = fill(source, links.standalone).replace("/*__APP__*/", () => inline(bundled.outputFiles[0].text));
  const split = full.indexOf('<div class="wrap">');
  const doc = `<!doctype html>\n<html lang="zh-Hant-TW">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${reset}\n${full.slice(0, split).trim()}\n</head>\n<body>\n${full.slice(split).trim()}\n</body>\n</html>\n`;
  await writeFile(at(out), doc);
  console.log(`${out} ${(doc.length / 1024).toFixed(0)} KB`);
  if (fragment) {
    const cdn = await build({
      entryPoints: [at(js)], bundle: true, format: "esm", target: "es2020", write: false,
      plugins: [{ name: "tyme4ts-cdn", setup(b) { b.onResolve({ filter: /^tyme4ts$/ }, () => ({ path: TYME4TS_CDN, external: true })); } }],
    });
    const frag = fill(source, links.artifact).replace('<script id="app">/*__APP__*/</script>', () => `<script type="module" id="app">\n${inline(cdn.outputFiles[0].text)}</script>`);
    await writeFile(fragment, frag);
    console.log(`${fragment} ${(frag.length / 1024).toFixed(0)} KB`);
  }
}

await page({ html: "src/page.html", js: "src/app.js", out: "public/index.html", fragment: arg("--fragment"), links: { standalone: { __STATS_URL__: "/api/stats" }, artifact: { __STATS_URL__: "" } } });
await page({
  html: "src/life.html", js: "src/life-app.js", out: "public/life.html", fragment: arg("--life-fragment"),
  links: {
    standalone: { __CHART_URL__: "index.html", __INTERPRET_URL__: "/api/interpret", __READING_URL__: "/api/reading", __STATS_URL__: "/api/stats" },
    artifact: { __CHART_URL__: arg("--chart-url") || "https://claude.ai/artifact/3a3ezBHmLKeKBxGaNveAV2", __INTERPRET_URL__: "", __READING_URL__: "", __STATS_URL__: "" },
  },
});
