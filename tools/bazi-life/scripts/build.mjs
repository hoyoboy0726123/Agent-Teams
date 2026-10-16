// Builds the page from src/page.html and src/app.js.
//   public/index.html   a complete document with tyme4ts bundled in, for any static host (committed, so
//                       deploying needs no build step)
//   --fragment <file>   also writes the page without the document skeleton, for publishing as a Claude artifact.
//                       Artifacts load libraries from a CDN, so there tyme4ts comes from unpkg (the same npm file).
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const TYME4TS_CDN = "https://unpkg.com/tyme4ts@1.5.2/dist/lib/index.mjs";
const at = p => fileURLToPath(new URL(`../${p}`, import.meta.url));
const source = await readFile(at("src/page.html"), "utf8");
const inline = js => js.replace(/<\/script/gi, "<\\/script");

const bundled = await build({
  entryPoints: [at("src/app.js")], bundle: true, minify: true, format: "iife", target: "es2020", write: false,
  banner: { js: "/* 命盤人生 排盤引擎預覽. Includes tyme4ts (MIT License, Copyright (c) 2024 6tail). */" },
});
const page = source.replace("/*__APP__*/", () => inline(bundled.outputFiles[0].text));
const split = page.indexOf('<div class="wrap">');
const reset = "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>";
const doc = `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${reset}
${page.slice(0, split).trim()}
</head>
<body>
${page.slice(split).trim()}
</body>
</html>
`;
await writeFile(at("public/index.html"), doc);
console.log(`public/index.html ${(doc.length / 1024).toFixed(0)} KB`);

const i = process.argv.indexOf("--fragment");
if (i > 0 && process.argv[i + 1]) {
  const cdn = await build({
    entryPoints: [at("src/app.js")], bundle: true, format: "esm", target: "es2020", write: false,
    plugins: [{ name: "tyme4ts-cdn", setup(b) { b.onResolve({ filter: /^tyme4ts$/ }, () => ({ path: TYME4TS_CDN, external: true })); } }],
  });
  const fragment = source.replace('<script id="app">/*__APP__*/</script>', () => `<script type="module" id="app">\n${inline(cdn.outputFiles[0].text)}</script>`);
  await writeFile(process.argv[i + 1], fragment);
  console.log(`${process.argv[i + 1]} ${(fragment.length / 1024).toFixed(0)} KB`);
}
