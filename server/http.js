// Tiny zero-dependency HTTP router with JSON helpers, cookie auth and static files.
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handler });
    return this;
  }
  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }
  match(method, path) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(path);
      if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

export async function readJson(req, limit = 5_000_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) fail(413, 'Request body too large');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Invalid JSON body'); }
}

export function send(res, status, body, headers = {}) {
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
    res.end(body);
  } else {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
    res.end(JSON.stringify(body ?? null));
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const gzCache = new Map(); // file → { mtime, gz }

export async function serveStatic(root, urlPath, res, req) {
  const rootAbs = resolve(root);
  let file = normalize(join(rootAbs, decodeURIComponent(urlPath)));
  if (!file.startsWith(rootAbs)) return false;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, 'index.html');
    let data = await readFile(file);
    const headers = {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    };
    // Compress larger text assets (e.g. the editor bundle) once and keep them in memory.
    if (data.length > 20_000 && /\.(js|css|html|svg|json)$/.test(file) && /\bgzip\b/.test(req?.headers['accept-encoding'] || '')) {
      const st = await stat(file);
      let c = gzCache.get(file);
      if (!c || c.mtime !== st.mtimeMs) { c = { mtime: st.mtimeMs, gz: (await import('node:zlib')).gzipSync(data) }; gzCache.set(file, c); }
      data = c.gz;
      headers['content-encoding'] = 'gzip';
      headers.vary = 'accept-encoding';
    }
    res.writeHead(200, headers);
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

// Stream a file with HTTP Range support (video players seek with ranges).
export async function sendFile(req, res, path, { type = 'application/octet-stream', headers = {} } = {}) {
  const { stat } = await import('node:fs/promises');
  const { createReadStream } = await import('node:fs');
  const { size } = await stat(path);
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let start = 0, end = size - 1, status = 200;
  if (m && (m[1] || m[2])) {
    start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
    status = 206;
  }
  res.writeHead(status, {
    'content-type': type, 'accept-ranges': 'bytes', 'content-length': end - start + 1,
    ...(status === 206 ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}), ...headers,
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(path, { start, end }).pipe(res);
}
