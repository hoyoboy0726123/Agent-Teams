// Turns src/page.html (the same file published as the Claude artifact preview) into public/index.html:
// a full HTML document with the AI letter switched on.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const root = new URL("..", import.meta.url);
const page = readFileSync(new URL("src/page.html", root), "utf8");
const split = page.indexOf('<div class="wrap">');
if (split < 0) throw new Error('src/page.html: missing <div class="wrap">');
const head = page.slice(0, split).trim(), body = page.slice(split).trim();

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="pet-ai" content="/api/letter">
<meta name="description" content="世界上大約有十幾億隻狗和貓。隨機投胎成其中一隻，在像素場景裡走完牠的一生。">
<meta property="og:title" content="16億分之1 毛孩人生">
<meta property="og:description" content="隨機投胎成世界上的一隻狗或貓，走完僅此一次的一生。">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;
mkdirSync(new URL("public", root), { recursive: true });
writeFileSync(new URL("public/index.html", root), html);
console.log(`public/index.html ${(html.length / 1024).toFixed(0)} KB`);
