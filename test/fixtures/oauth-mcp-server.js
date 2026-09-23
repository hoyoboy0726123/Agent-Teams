// A remote MCP server protected by OAuth 2.1, for tests: protected-resource and
// authorization-server metadata, dynamic client registration, an auto-approving
// authorize endpoint, PKCE-checked token endpoint with refresh, and a Streamable HTTP MCP endpoint.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

export async function startOAuthMcpServer() {
  const clients = new Map(); // client_id → redirect_uris
  const codes = new Map(); // code → { challenge, clientId, redirectUri }
  const access = new Set();
  const refresh = new Set();
  const stats = { registrations: 0, tokens: 0, refreshes: 0 };
  let base;

  const body = async (req) => { const c = []; for await (const x of req) c.push(x); return Buffer.concat(c).toString('utf8'); };
  const sendJson = (res, status, obj, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };
  const issue = () => {
    const a = randomBytes(16).toString('hex'); const r = randomBytes(16).toString('hex');
    access.add(a); refresh.add(r); stats.tokens++;
    return { access_token: a, refresh_token: r, token_type: 'Bearer', expires_in: 3600 };
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, base);
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
      return sendJson(res, 200, { resource: `${base}/mcp`, authorization_servers: [base] });
    }
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return sendJson(res, 200, {
        issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, registration_endpoint: `${base}/register`,
        response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
      });
    }
    if (url.pathname === '/register' && req.method === 'POST') {
      const meta = JSON.parse(await body(req));
      const clientId = `client_${randomBytes(6).toString('hex')}`;
      clients.set(clientId, meta.redirect_uris);
      stats.registrations++;
      return sendJson(res, 201, { ...meta, client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000) });
    }
    if (url.pathname === '/authorize') {
      const q = url.searchParams;
      const redirectUri = q.get('redirect_uri');
      if (!clients.get(q.get('client_id'))?.includes(redirectUri)) return sendJson(res, 400, { error: 'invalid_client' });
      if (q.get('code_challenge_method') !== 'S256') return sendJson(res, 400, { error: 'invalid_request' });
      const back = new URL(redirectUri);
      if (q.get('deny')) back.searchParams.set('error', 'access_denied');
      else {
        const code = randomBytes(12).toString('hex');
        codes.set(code, { challenge: q.get('code_challenge'), clientId: q.get('client_id'), redirectUri });
        back.searchParams.set('code', code);
      }
      back.searchParams.set('state', q.get('state'));
      res.writeHead(302, { location: back.href });
      return res.end();
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      const p = new URLSearchParams(await body(req));
      if (p.get('grant_type') === 'refresh_token') {
        if (!refresh.delete(p.get('refresh_token'))) return sendJson(res, 400, { error: 'invalid_grant' });
        stats.refreshes++;
        return sendJson(res, 200, issue());
      }
      const c = codes.get(p.get('code'));
      codes.delete(p.get('code'));
      const challenge = createHash('sha256').update(p.get('code_verifier') || '').digest('base64url');
      if (!c || c.challenge !== challenge || c.clientId !== p.get('client_id') || c.redirectUri !== p.get('redirect_uri')) return sendJson(res, 400, { error: 'invalid_grant' });
      return sendJson(res, 200, issue());
    }
    if (url.pathname === '/mcp') {
      const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
      if (!access.has(token)) {
        return sendJson(res, 401, { error: 'invalid_token' }, { 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` });
      }
      const mcp = new McpServer({ name: 'secure-notes', version: '1.0.0' });
      mcp.registerTool('whoami', { description: 'Who is signed in', inputSchema: { greeting: z.string().optional() }, annotations: { readOnlyHint: true } },
        async () => ({ content: [{ type: 'text', text: 'signed in via OAuth' }] }));
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { transport.close(); mcp.close(); });
      await mcp.connect(transport);
      const raw = req.method === 'POST' ? await body(req) : '';
      return transport.handleRequest(req, res, raw ? JSON.parse(raw) : undefined);
    }
    sendJson(res, 404, { error: 'not_found' });
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  return {
    url: `${base}/mcp`, stats,
    revokeAll() { access.clear(); refresh.clear(); },
    expireAccess() { access.clear(); },
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  };
}
