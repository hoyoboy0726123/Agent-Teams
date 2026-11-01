// OAuth sign-in for remote MCP servers, end to end against a local OAuth-protected MCP server:
// discovery → dynamic registration → browser redirect → callback → tools → refresh → re-sign-in.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { startOAuthMcpServer } from './fixtures/oauth-mcp-server.js';

const app = await boot();
const remote = await startOAuthMcpServer();
const mcp = await import('../server/mcp/index.js');
after(async () => { await mcp.closeAll(); await remote.close(); await app.close(); });

const admin = app.client();
await admin.call('POST', '/api/auth/register', { username: 'owner', password: 'secret123' });

// Follow the authorization page like a browser would, then land on our callback with the session cookie.
async function browserSignIn(authUrl, { deny = false, cookie = admin.cookie } = {}) {
  const u = new URL(authUrl);
  if (deny) u.searchParams.set('deny', '1');
  const r = await fetch(u, { redirect: 'manual' });
  assert.equal(r.status, 302);
  const back = new URL(r.headers.get('location'));
  assert.equal(back.origin + back.pathname, `${app.base}/api/mcp/oauth/callback`);
  const cb = await fetch(back, { headers: { cookie } });
  return { status: cb.status, html: await cb.text(), callback: back.href };
}

test('OAuth sign-in connects a protected remote MCP server and keeps secrets server-side', async () => {
  const { data: s } = await admin.call('POST', '/api/mcp/servers', { name: 'Secure', transport: 'http', url: remote.url, auth: 'oauth' });
  assert.equal(s.auth, 'oauth');
  assert.equal(s.oauth.signedIn, false);

  // Before signing in: status says so and connecting fails with a clear message.
  const list = (await admin.call('GET', '/api/mcp/servers')).data;
  assert.equal(list.find((x) => x.id === s.id).status.state, 'auth_required');
  const pre = (await admin.call('POST', `/api/mcp/servers/${s.id}/connect`, {})).data;
  assert.equal(pre.ok, false);
  assert.match(pre.error, /sign-in required/);

  const start = (await admin.call('POST', `/api/mcp/servers/${s.id}/oauth/start`, {})).data;
  const authUrl = new URL(start.url);
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authUrl.searchParams.get('redirect_uri'), `${app.base}/api/mcp/oauth/callback`);
  assert.ok(authUrl.searchParams.get('state'));
  assert.equal(remote.stats.registrations, 1);

  const cb = await browserSignIn(start.url);
  assert.equal(cb.status, 200);
  assert.match(cb.html, /"type":"mcp-oauth","ok":true/);
  // The state is single-use: replaying the callback fails.
  const replay = await fetch(cb.callback, { headers: { cookie: admin.cookie } });
  assert.equal(replay.status, 400);

  const after1 = (await admin.call('GET', '/api/mcp/servers')).data.find((x) => x.id === s.id);
  assert.equal(after1.oauth.signedIn, true);
  assert.ok(!JSON.stringify(after1).includes('access_token'), 'tokens never leave the server');

  const conn = (await admin.call('POST', `/api/mcp/servers/${s.id}/connect`, {})).data;
  assert.equal(conn.ok, true, conn.error);
  assert.deepEqual(conn.tools.map((t) => t.name), ['whoami']);
  assert.equal(await mcp.callTool(s.id, 'whoami', {}), 'signed in via OAuth');

  // Access token expires: the SDK refreshes with the stored refresh token, no user action.
  remote.expireAccess();
  mcp.disconnect(s.id);
  assert.equal(await mcp.callTool(s.id, 'whoami', {}), 'signed in via OAuth');
  assert.equal(remote.stats.refreshes, 1);

  // Everything revoked: the server reports that a new sign-in is needed.
  remote.revokeAll();
  mcp.disconnect(s.id);
  await assert.rejects(mcp.callTool(s.id, 'whoami', {}), /sign-in required/);
  assert.equal(mcp.statusOf(s.id).state, 'auth_required');

  // Sign in again reuses the registered client.
  const again = (await admin.call('POST', `/api/mcp/servers/${s.id}/oauth/start`, {})).data;
  assert.equal((await browserSignIn(again.url)).status, 200);
  assert.equal(remote.stats.registrations, 1);
  assert.equal(await mcp.callTool(s.id, 'whoami', {}), 'signed in via OAuth');

  // Sign out forgets the tokens.
  const out = (await admin.call('POST', `/api/mcp/servers/${s.id}/oauth/signout`, {})).data;
  assert.equal(out.oauth.signedIn, false);
  await assert.rejects(mcp.callTool(s.id, 'whoami', {}), /sign-in required/);
});

test('OAuth callback rejects denied, replayed, forged and foreign sign-ins', async () => {
  const { data: s } = await admin.call('POST', '/api/mcp/servers', { name: 'Secure2', transport: 'http', url: remote.url, auth: 'oauth' });

  const denied = await browserSignIn((await admin.call('POST', `/api/mcp/servers/${s.id}/oauth/start`, {})).data.url, { deny: true });
  assert.equal(denied.status, 400);
  assert.match(denied.html, /access_denied/);

  const forged = await fetch(`${app.base}/api/mcp/oauth/callback?code=x&state=not-a-real-state`, { headers: { cookie: admin.cookie } });
  assert.equal(forged.status, 400);
  assert.match(await forged.text(), /expired/);

  // A signed-out browser (no session cookie) cannot complete someone else's sign-in.
  const url = (await admin.call('POST', `/api/mcp/servers/${s.id}/oauth/start`, {})).data.url;
  const stranger = await browserSignIn(url, { cookie: '' });
  assert.equal(stranger.status, 400);
  assert.equal((await admin.call('GET', '/api/mcp/servers')).data.find((x) => x.id === s.id).oauth.signedIn, false);

  // Callback HTML escapes provider-supplied error text.
  const start = (await admin.call('POST', `/api/mcp/servers/${s.id}/oauth/start`, {})).data.url;
  const state = new URL(start).searchParams.get('state');
  const xss = await fetch(`${app.base}/api/mcp/oauth/callback?state=${state}&error=x&error_description=${encodeURIComponent('<img src=x onerror=alert(1)>')}`, { headers: { cookie: admin.cookie } });
  const html = await xss.text();
  assert.ok(!html.includes('<img'), 'error text is escaped');
});

test('OAuth presets and client settings', async () => {
  const cfg = mcp.fromPreset('linear', {});
  assert.equal(cfg.auth, 'oauth');
  assert.deepEqual(cfg.headers, {});
  const { data: s } = await admin.call('POST', '/api/mcp/servers', { name: 'Own client', transport: 'http', url: remote.url, auth: 'oauth', oauth: { clientId: 'my-app', clientSecret: 'shh', scope: 'read' } });
  assert.equal(s.oauth.clientId, 'my-app');
  assert.equal(s.oauth.clientSecret, '••••');
  assert.equal(s.oauth.scope, 'read');
  // Saving the masked secret back keeps it; stdio servers never use OAuth.
  const { data: s2 } = await admin.call('PATCH', `/api/mcp/servers/${s.id}`, { oauth: { clientId: 'my-app', clientSecret: '••••', scope: 'read' } });
  assert.equal(mcp.getServer(s2.id, true).oauth.clientSecret, 'shh');
  const { data: st } = await admin.call('POST', '/api/mcp/servers', { name: 'Local', transport: 'stdio', command: 'echo', auth: 'oauth' });
  assert.equal(st.auth, 'none');
});
