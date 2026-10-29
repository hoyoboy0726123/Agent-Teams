// public/ served the way Cloudflare serves it as Workers Static Assets with this site's wrangler.jsonc, for the browser
// tests: html_handling "none" (a path is a file name), the 200 rewrites of public/_redirects, the headers of
// public/_headers, and public/404.html with a 404 for anything else (not_found_handling "404-page"). /api/* and /admin
// (run_worker_first) go to `worker(req, res)` when given, else get the Worker's JSON 404. Run `npm run build` first.
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".png": "image/png", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2" };
const pattern = p => new RegExp(`^${p.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);

// "/from /to 200" lines; only rewrites are used here.
export const parseRedirects = text => text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"))
  .map(l => l.split(/\s+/)).map(([from, to, status]) => ({ from, to, status: Number(status || 302) }));
// Blocks of a path line and indented "Name: value" or "! Name" lines.
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) { rules.push({ match: pattern(line.trim()), set: [], drop: [] }); continue; }
    const rule = rules[rules.length - 1], l = line.trim();
    if (l.startsWith("!")) rule.drop.push(l.slice(1).trim().toLowerCase());
    else { const i = l.indexOf(":"); rule.set.push([l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()]); }
  }
  return rules;
}
export function headersFor(rules, path) {
  const out = {};
  for (const r of rules) {
    if (!r.match.test(path)) continue;
    for (const k of r.drop) delete out[k];
    for (const [k, v] of r.set) out[k] = k in out ? `${out[k]}, ${v}` : v;
  }
  return out;
}

export async function staticSite(root, { worker } = {}) {
  const redirects = parseRedirects(await readFile(join(root, "_redirects"), "utf8"));
  const headers = parseHeaders(await readFile(join(root, "_headers"), "utf8"));
  const file = async p => { try { return await readFile(join(root, p)); } catch { return null; } };
  return async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.startsWith("/api/") || path === "/admin") {
      if (worker && (await worker(req, res, path)) !== false) return;
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" }); res.end('{"error":"not found"}'); return;
    }
    const rule = redirects.find(r => r.from === path && r.status === 200);
    const name = rule ? rule.to : path;
    const body = name.includes("..") || /\/_(headers|redirects)$/.test(name) || name.endsWith("/") ? null : await file(name.slice(1));
    const extra = headersFor(headers, path);
    if (!body) { res.writeHead(404, { ...extra, "content-type": TYPES[".html"] }); res.end(await file("404.html")); return; }
    res.writeHead(200, { ...extra, "content-type": TYPES[extname(name)] || "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : body);
  };
}
