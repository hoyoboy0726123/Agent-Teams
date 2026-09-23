#!/usr/bin/env node
// Agent Teams server entry point.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { handleApi } from './api.js';
import './api-extra.js';
import { get as dbGet } from './db.js';
import { renderArtifact } from '../web/render.js';
import { getArtifact } from './artifacts/store.js';
import { expireStale } from './approvals.js';
import { findByHook, startWorkflow } from './workflows/engine.js';
import { readJson } from './http.js';
import { serveStatic, send, parseCookies, sendFile } from './http.js';
import { mediaByToken } from './media/store.js';
import { userForToken } from './users.js';
import { attachRealtime } from './ws.js';
import { flushAll } from './collab.js';
import { startScheduler } from './workflows/engine.js';
import { purgeExpired } from './memory/store.js';
import { run } from './db.js';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');

export function createApp() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const path = url.pathname;
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'same-origin');
    try {
      if (path.startsWith('/api/')) {
        // CSRF: state-changing requests must be JSON (browsers can't send that cross-site without CORS).
        if (req.method !== 'GET' && req.method !== 'HEAD' && !/application\/json/.test(req.headers['content-type'] || '')) {
          return send(res, 415, { error: 'Content-Type must be application/json' });
        }
        const token = parseCookies(req.headers.cookie).at_session;
        return await handleApi({ req, res, path, query: url.searchParams, token, user: userForToken(token) });
      }
      // Inbound webhooks trigger automations: POST /hooks/<token> with JSON or text.
      const hook = /^\/hooks\/([A-Za-z0-9_-]{20,})$/.exec(path);
      if (hook && req.method === 'POST') {
        const w = findByHook(hook[1]);
        if (!w || !w.enabled) return send(res, 404, { error: 'Unknown or disabled hook' });
        let input = '';
        if (/json/.test(req.headers['content-type'] || '')) { const b = await readJson(req, 1_000_000); input = typeof b.text === 'string' ? b.text : JSON.stringify(b, null, 2); }
        else { const chunks = []; for await (const c of req) chunks.push(c); input = Buffer.concat(chunks).toString('utf8'); }
        const { runId } = startWorkflow(w.id, { input: input.slice(0, 20000) });
        return send(res, 202, { ok: true, runId });
      }
      // Generated media (AI clips) at unguessable URLs, so sandboxed previews can play them.
      const media = /^\/media\/([A-Za-z0-9_-]{20,})\.\w+$/.exec(path);
      if (media && (req.method === 'GET' || req.method === 'HEAD')) {
        const m = mediaByToken(media[1]);
        if (!m) return send(res, 404, 'Not found');
        return await sendFile(req, res, m.path, { type: m.mime, headers: { 'cache-control': 'private, max-age=86400', 'access-control-allow-origin': '*' } });
      }
      // Public, read-only share links for artifacts (opt-in per artifact, revocable).
      const share = /^\/s\/([A-Za-z0-9_-]{20,})$/.exec(path);
      if (share) {
        const row = dbGet('SELECT id FROM artifacts WHERE share_token = ?', share[1]);
        if (!row) return send(res, 404, 'This link is no longer shared.');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "sandbox allow-scripts allow-popups allow-modals; default-src 'none'; img-src * data: blob:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; script-src 'unsafe-inline'; media-src * data: blob:", 'cache-control': 'no-store' });
        return res.end(renderArtifact(getArtifact(row.id)));
      }
      if (await serveStatic(WEB, path, res, req)) return;
      if (await serveStatic(WEB, '/index.html', res, req)) return; // SPA fallback
      send(res, 404, 'Not found');
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: e.message || 'Server error', ...(e.body || {}) });
      else res.end();
    }
  });
  attachRealtime(server);
  return server;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  // Any message left "streaming" by a crash is marked as interrupted.
  run("UPDATE messages SET status = 'error', meta_json = json_set(meta_json, '$.error', 'Interrupted by server restart') WHERE status = 'streaming'");
  purgeExpired();
  expireStale();
  setInterval(purgeExpired, 3600_000).unref();
  startScheduler();
  const server = createApp();
  server.listen(config.port, config.host, () => {
    console.log(`\n  🤝 Agent Teams is running → http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}\n  data: ${config.dbFile}\n`);
  });
  // Save documents people are co-editing before exiting.
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { try { flushAll(); } finally { process.exit(0); } });
}
