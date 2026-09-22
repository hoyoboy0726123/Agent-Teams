// WebSocket fan-out: each client only receives events for channels it can read.
import { WebSocketServer } from 'ws';
import { bus } from './bus.js';
import { parseCookies } from './http.js';
import { userForToken } from './users.js';
import { getChannel, canRead } from './channels.js';

export function attachRealtime(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const online = new Map(); // userId → count

  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/ws')) return socket.destroy();
    const user = userForToken(parseCookies(req.headers.cookie).at_session);
    if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, user));
  });

  const broadcastPresence = () => {
    const payload = JSON.stringify({ kind: 'presence', online: [...online.keys()] });
    for (const c of wss.clients) if (c.readyState === 1) c.send(payload);
  };

  wss.on('connection', (ws, user) => {
    ws.user = user;
    ws.alive = true;
    online.set(user.id, (online.get(user.id) || 0) + 1);
    broadcastPresence();
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw);
        if (m.kind === 'typing' && m.channelId) {
          const c = getChannel(m.channelId);
          if (c && canRead(user, c)) bus.emit('event', { kind: 'typing', channelId: c.id, userId: user.id, on: !!m.on });
        }
      } catch {}
    });
    ws.on('close', () => {
      const n = (online.get(user.id) || 1) - 1;
      if (n <= 0) online.delete(user.id); else online.set(user.id, n);
      broadcastPresence();
    });
  });

  const cache = new Map(); // `${userId}:${channelId}` → bool (short-lived)
  setInterval(() => cache.clear(), 5000).unref();
  const allowed = (user, channelId) => {
    if (!channelId) return true;
    const k = `${user.id}:${channelId}`;
    if (!cache.has(k)) { const c = getChannel(channelId); cache.set(k, !c ? true : canRead(user, c)); }
    return cache.get(k);
  };

  bus.on('event', (ev) => {
    if (ev.kind === 'channel.updated') cache.clear();
    const payload = JSON.stringify(ev);
    for (const c of wss.clients) {
      if (c.readyState !== 1) continue;
      if (ev.kind === 'typing' && ev.userId === c.user.id) continue;
      if (allowed(c.user, ev.channelId)) c.send(payload);
    }
  });

  const ping = setInterval(() => {
    for (const c of wss.clients) { if (!c.alive) { c.terminate(); continue; } c.alive = false; c.ping(); }
  }, 30000);
  ping.unref();
  return wss;
}
