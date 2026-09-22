#!/usr/bin/env node
// Agent Teams server entry point.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { handleApi } from './api.js';
import { serveStatic, send, parseCookies } from './http.js';
import { userForToken } from './users.js';
import { attachRealtime } from './ws.js';
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
      if (await serveStatic(WEB, path, res)) return;
      if (await serveStatic(WEB, '/index.html', res)) return; // SPA fallback
      send(res, 404, 'Not found');
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: e.message || 'Server error' });
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
  setInterval(purgeExpired, 3600_000).unref();
  startScheduler();
  const server = createApp();
  server.listen(config.port, config.host, () => {
    console.log(`\n  🤝 Agent Teams is running → http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}\n  data: ${config.dbFile}\n`);
  });
}
