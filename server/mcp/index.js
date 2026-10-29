// Model Context Protocol (MCP) integration: connect agents to external tools
// (GitHub, Slack, Notion, Gmail, file systems, databases, browsers, …).
// Supports stdio, Streamable HTTP and legacy SSE servers via the official SDK.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { auth as runAuth, UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { all, get, run, id, now, json, audit } from '../db.js';
import { encrypt, decrypt } from '../secrets.js';
import { ServerOAuthProvider, loadOAuth, saveOAuth, pending } from './oauth.js';

const toServer = (r, withSecrets = false) => r && ({
  id: r.id, name: r.name, slug: r.slug, preset: r.preset, transport: r.transport, command: r.command,
  args: json(r.args_json, []), url: r.url, approval: r.approval, enabled: !!r.enabled, createdAt: r.created_at,
  env: withSecrets ? json(decrypt(r.env_enc) || '{}', {}) : Object.fromEntries(Object.keys(json(decrypt(r.env_enc) || '{}', {})).map((k) => [k, '••••'])),
  headers: withSecrets ? json(decrypt(r.headers_enc) || '{}', {}) : Object.fromEntries(Object.keys(json(decrypt(r.headers_enc) || '{}', {})).map((k) => [k, '••••'])),
  auth: r.auth === 'oauth' ? 'oauth' : 'none',
  oauth: oauthInfo(json(decrypt(r.oauth_enc) || '{}', {}), withSecrets),
});

const oauthInfo = ({ config = {}, tokens, signedInAt }, withSecrets) => ({
  clientId: config.clientId || '', scope: config.scope || '',
  clientSecret: withSecrets ? config.clientSecret || '' : config.clientSecret ? '••••' : '',
  signedIn: !!tokens?.access_token, signedInAt: signedInAt || null,
});

export const listServers = () => all('SELECT * FROM mcp_servers ORDER BY created_at').map((r) => {
  const s = toServer(r);
  const status = statusOf(r.id);
  // Never signed in: say so without trying to connect.
  return { ...s, status: status.state === 'idle' && s.auth === 'oauth' && !s.oauth.signedIn ? { state: 'auth_required' } : status };
});
export const getServer = (sid, withSecrets = false) => toServer(get('SELECT * FROM mcp_servers WHERE id = ?', sid), withSecrets);

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'mcp';

// Keep the stored secret for any field the client sent back masked.
const mergeSecrets = (incoming, previous) => Object.fromEntries(Object.entries(incoming || {})
  .filter(([k]) => k.trim())
  .map(([k, v]) => [k.trim(), v === '••••' ? previous[k] ?? '' : String(v)]));

export function saveServer(input, user, sid = null) {
  const prev = sid ? getServer(sid, true) : null;
  if (sid && !prev) return null;
  const transport = ['stdio', 'http', 'sse'].includes(input.transport) ? input.transport : 'stdio';
  if (transport === 'stdio' && !String(input.command || '').trim()) throw Object.assign(new Error('Command is required for stdio servers'), { status: 400 });
  if (transport !== 'stdio' && !/^https?:\/\//.test(input.url || '')) throw Object.assign(new Error('A valid http(s) URL is required'), { status: 400 });
  const env = mergeSecrets(input.env, prev?.env || {});
  const headers = mergeSecrets(input.headers, prev?.headers || {});
  const args = Array.isArray(input.args) ? input.args.map(String) : String(input.args || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const approval = ['auto', 'always', 'never'].includes(input.approval) ? input.approval : 'auto';
  const authMode = transport !== 'stdio' && input.auth === 'oauth' ? 'oauth' : 'none';
  const oauthConfig = {
    clientId: String(input.oauth?.clientId || '').trim(),
    clientSecret: input.oauth?.clientSecret === '••••' ? prev?.oauth.clientSecret || '' : String(input.oauth?.clientSecret || '').trim(),
    scope: String(input.oauth?.scope || '').trim(),
  };
  if (sid) {
    run('UPDATE mcp_servers SET name=?, transport=?, command=?, args_json=?, env_enc=?, url=?, headers_enc=?, approval=?, enabled=?, auth=? WHERE id=?',
      input.name || prev.name, transport, input.command || null, JSON.stringify(args), encrypt(JSON.stringify(env)), input.url || null,
      encrypt(JSON.stringify(headers)), approval, input.enabled === false ? 0 : 1, authMode, sid);
    // A different server or client invalidates tokens and registrations; otherwise keep the sign-in.
    const old = loadOAuth(sid);
    const same = prev.url === (input.url || null) && (old.config?.clientId || '') === oauthConfig.clientId && (old.config?.clientSecret || '') === oauthConfig.clientSecret;
    saveOAuth(sid, { config: oauthConfig }, { replace: !same });
    disconnect(sid);
  } else {
    sid = id('mcp_');
    let slug = slugify(input.slug || input.name);
    for (let i = 2; get('SELECT 1 FROM mcp_servers WHERE slug = ?', slug); i++) slug = `${slugify(input.slug || input.name)}${i}`;
    run(`INSERT INTO mcp_servers(id, name, slug, preset, transport, command, args_json, env_enc, url, headers_enc, approval, enabled, created_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      sid, input.name || slug, slug, input.preset || null, transport, input.command || null, JSON.stringify(args),
      encrypt(JSON.stringify(env)), input.url || null, encrypt(JSON.stringify(headers)), approval, user?.id ?? null, now());
    run('UPDATE mcp_servers SET auth = ? WHERE id = ?', authMode, sid);
    saveOAuth(sid, { config: oauthConfig }, { replace: true });
  }
  audit('user', user?.id, sid && prev ? 'mcp.update' : 'mcp.create', sid, { transport });
  return getServer(sid);
}

export function deleteServer(sid, user) {
  disconnect(sid);
  run('DELETE FROM mcp_servers WHERE id = ?', sid);
  audit('user', user?.id, 'mcp.delete', sid, {});
}

// ------------------------------------------------------------ connections

const conns = new Map(); // serverId → { client, tools, error, authRequired, connecting }

export const AUTH_REQUIRED = 'OAuth sign-in required — open Settings → Integrations and click "Sign in"';

export function statusOf(sid) {
  const c = conns.get(sid);
  if (!c) return { state: 'idle' };
  if (c.connecting) return { state: 'connecting' };
  if (c.authRequired) return { state: 'auth_required', error: c.error };
  if (c.error) return { state: 'error', error: c.error };
  return { state: 'connected', tools: c.tools.length };
}

function makeTransport(s, authProvider) {
  if (s.transport === 'stdio') {
    return new StdioClientTransport({
      command: s.command,
      args: s.args,
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => typeof v === 'string')), ...s.env },
      stderr: 'pipe',
    });
  }
  const opts = { requestInit: { headers: s.headers }, ...(authProvider ? { authProvider } : {}) };
  return s.transport === 'sse' ? new SSEClientTransport(new URL(s.url), opts) : new StreamableHTTPClientTransport(new URL(s.url), opts);
}

export async function connect(sid, { timeoutMs = 60_000 } = {}) {
  const existing = conns.get(sid);
  if (existing?.client && !existing.error) return existing;
  if (existing?.connecting) return existing.connecting;
  const s = getServer(sid, true);
  if (!s) throw new Error('MCP server not found');
  if (!s.enabled) throw new Error(`MCP server "${s.name}" is disabled`);
  const entry = { client: null, tools: [], error: null, authRequired: false, connecting: null };
  conns.set(sid, entry);
  const provider = s.auth === 'oauth' ? new ServerOAuthProvider(s) : null;
  entry.connecting = (async () => {
    const client = new Client({ name: 'agent-teams', version: '0.2.0' });
    if (provider && !s.oauth.signedIn) {
      Object.assign(entry, { error: AUTH_REQUIRED, authRequired: true, connecting: null });
      throw new Error(AUTH_REQUIRED);
    }
    const transport = makeTransport(s, provider);
    let stderr = '';
    transport.stderr?.on?.('data', (d) => { stderr = (stderr + d).slice(-2000); });
    try {
      await withTimeout(client.connect(transport), timeoutMs, `Timed out connecting to ${s.name}`);
      const tools = [];
      let cursor;
      do {
        const page = await client.listTools(cursor ? { cursor } : {});
        tools.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor);
      entry.client = client;
      entry.tools = tools;
      transport.onclose = () => { if (conns.get(sid) === entry) conns.delete(sid); };
      return entry;
    } catch (e) {
      // Expired and not refreshable: the SDK wanted to send the user to the authorization page.
      if (provider && (e instanceof UnauthorizedError || provider.authorizationUrl)) {
        Object.assign(entry, { error: AUTH_REQUIRED, authRequired: true });
        try { await client.close(); } catch {}
        throw new Error(AUTH_REQUIRED);
      }
      entry.error = `${e.message}${stderr ? ` — ${stderr.trim().split('\n').slice(-3).join(' ')}` : ''}`;
      try { await client.close(); } catch {}
      throw new Error(entry.error);
    } finally {
      entry.connecting = null;
    }
  })();
  return entry.connecting;
}

export function disconnect(sid) {
  const c = conns.get(sid);
  conns.delete(sid);
  c?.client?.close().catch(() => {});
}

export async function closeAll() {
  await Promise.all([...conns.keys()].map((k) => conns.get(k)?.client?.close().catch(() => {})));
  conns.clear();
}

function withTimeout(p, ms, msg) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); })]).finally(() => clearTimeout(t));
}

export async function listTools(sid) {
  const c = await connect(sid);
  return c.tools;
}

// Tools an agent may call, as { fq: "slug.tool", server, tool }.
export async function toolsForAgent(agent) {
  const out = [];
  for (const sid of agent.mcpServers || []) {
    const s = getServer(sid);
    if (!s?.enabled) continue;
    try {
      for (const t of await listTools(sid)) out.push({ fq: `${s.slug}.${t.name}`, server: s, tool: t });
    } catch (e) {
      out.push({ fq: `${s.slug}.*`, server: s, error: e.message });
    }
  }
  return out;
}

// Compact one-line signature for prompts: name(arg: type*, …) — description
export function describeTool({ fq, tool, error }) {
  if (error) return `${fq} — (unavailable: ${error.slice(0, 120)})`;
  const props = tool.inputSchema?.properties || {};
  const req = new Set(tool.inputSchema?.required || []);
  const sig = Object.entries(props).slice(0, 12).map(([k, v]) => `${k}${req.has(k) ? '' : '?'}: ${v.type || (v.enum ? v.enum.join('|') : 'any')}`).join(', ');
  return `${fq}(${sig}) — ${(tool.description || '').replace(/\s+/g, ' ').slice(0, 200)}`;
}

const WRITE_WORDS = /(create|update|delete|remove|send|post|write|push|merge|comment|publish|upload|move|rename|edit|insert|execute|run|reply|archive|close|assign|add|set|invite|fork|transfer|approve|pay|book|draft)/i;

export function needsApproval(server, tool) {
  if (server.approval === 'always') return true;
  if (server.approval === 'never') return false;
  if (tool?.annotations?.readOnlyHint === true) return false;
  if (tool?.annotations?.destructiveHint === true) return true;
  return WRITE_WORDS.test(tool?.name || '');
}

export async function callTool(sid, name, args, { signal } = {}) {
  const c = await connect(sid);
  let res;
  try {
    res = await c.client.callTool({ name, arguments: args || {} }, undefined, { signal, timeout: 120_000 });
  } catch (e) {
    if (e instanceof UnauthorizedError) { disconnect(sid); throw new Error(AUTH_REQUIRED); }
    throw e;
  }
  const parts = (res.content || []).map((p) => (p.type === 'text' ? p.text : p.type === 'resource' ? (p.resource?.text || `[resource ${p.resource?.uri}]`) : `[${p.type}]`));
  if (res.structuredContent && !parts.length) parts.push(JSON.stringify(res.structuredContent));
  const text = parts.join('\n').slice(0, 15000);
  if (res.isError) throw new Error(text || 'Tool returned an error');
  return text || '(empty result)';
}

// ------------------------------------------------------------ OAuth sign-in

// Step 1: returns the authorization page the user must visit (or { authorized } if no visit is needed).
export async function beginOAuth(sid, redirectUrl, user) {
  const s = getServer(sid, true);
  if (!s) throw Object.assign(new Error('MCP server not found'), { status: 404 });
  if (s.auth !== 'oauth') throw Object.assign(new Error('This integration does not use OAuth'), { status: 400 });
  disconnect(sid);
  const stored = loadOAuth(sid);
  // Dynamically registered clients are bound to their redirect URL.
  saveOAuth(sid, { redirectUrl, tokens: undefined, verifier: undefined, signedInAt: undefined, ...(stored.redirectUrl !== redirectUrl ? { client: undefined } : {}) });
  const provider = new ServerOAuthProvider(s, { userId: user?.id });
  let result;
  try {
    result = await runAuth(provider, { serverUrl: s.url });
  } catch (e) {
    throw Object.assign(new Error(`OAuth setup failed: ${e.message}`), { status: 502 });
  }
  if (result === 'AUTHORIZED') return { authorized: true };
  if (!provider.authorizationUrl) throw Object.assign(new Error('The server did not provide an authorization page'), { status: 502 });
  audit('user', user?.id, 'mcp.oauth.start', sid, { host: provider.authorizationUrl.host });
  return { url: provider.authorizationUrl.href };
}

// Step 2: the browser comes back with ?code&state; exchange the code for tokens.
export async function finishOAuth({ state, code, error, errorDescription }, user) {
  const p = pending.get(state || '');
  if (!p || p.expires < Date.now()) throw Object.assign(new Error('This sign-in link has expired — start again from Settings'), { status: 400 });
  pending.delete(state);
  if (p.userId && p.userId !== user?.id) throw Object.assign(new Error('Sign-in was started by another user'), { status: 403 });
  const s = getServer(p.sid, true);
  if (!s) throw Object.assign(new Error('MCP server not found'), { status: 404 });
  if (error) {
    audit('user', user?.id, 'mcp.oauth.denied', s.id, { error });
    throw Object.assign(new Error(`${s.name}: ${errorDescription || error}`), { status: 400 });
  }
  try {
    await runAuth(new ServerOAuthProvider(s), { serverUrl: s.url, authorizationCode: code });
  } catch (e) {
    throw Object.assign(new Error(`${s.name}: token exchange failed — ${e.message}`), { status: 502 });
  }
  saveOAuth(s.id, { verifier: undefined });
  disconnect(s.id);
  audit('user', user?.id, 'mcp.oauth.connected', s.id, {});
  return getServer(s.id);
}

export function signOutOAuth(sid, user) {
  saveOAuth(sid, { tokens: undefined, verifier: undefined, signedInAt: undefined });
  disconnect(sid);
  audit('user', user?.id, 'mcp.oauth.signout', sid, {});
  return getServer(sid);
}

// ------------------------------------------------------------ presets

// {{KEY}} placeholders in args are filled from the form; env/header fields are stored encrypted.
export const PRESETS = [
  { key: 'github', name: 'GitHub', icon: '🐙', category: 'dev', transport: 'http', url: 'https://api.githubcopilot.com/mcp/',
    headers: [{ key: 'Authorization', label: 'Personal access token', secret: true, template: 'Bearer {{value}}' }],
    description: 'Issues, pull requests, code search, repos (official GitHub MCP server).', docs: 'https://github.com/github/github-mcp-server' },
  { key: 'slack', name: 'Slack', icon: '💬', category: 'comms', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'],
    env: [{ key: 'SLACK_BOT_TOKEN', label: 'Bot token (xoxb-…)', secret: true }, { key: 'SLACK_TEAM_ID', label: 'Team ID (T…)' }],
    description: 'Read channels, post messages, reply in threads, add reactions.', docs: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/slack' },
  { key: 'notion', name: 'Notion', icon: '📓', category: 'docs', transport: 'stdio', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'],
    env: [{ key: 'NOTION_TOKEN', label: 'Integration token (ntn_…)', secret: true }],
    description: 'Search, read and create Notion pages and databases.', docs: 'https://github.com/makenotion/notion-mcp-server' },
  { key: 'gmail', name: 'Gmail', icon: '✉️', category: 'comms', transport: 'stdio', command: 'npx', args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
    env: [], note: 'Community server. Run `npx @gongrzhe/server-gmail-autoauth-mcp auth` once on this machine to sign in with Google.',
    description: 'Search, read, draft and send email; manage labels.', docs: 'https://github.com/GongRzhe/Gmail-MCP-Server' },
  { key: 'google-calendar', name: 'Google Calendar', icon: '📅', category: 'productivity', transport: 'stdio', command: 'npx', args: ['-y', '@cocal/google-calendar-mcp'],
    env: [{ key: 'GOOGLE_OAUTH_CREDENTIALS', label: 'Path to OAuth credentials JSON' }],
    description: 'List, create and update calendar events — great for meeting-prep automations.', docs: 'https://github.com/nspady/google-calendar-mcp' },
  { key: 'filesystem', name: 'Files (local folder)', icon: '📁', category: 'data', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '{{FOLDER}}'],
    fields: [{ key: 'FOLDER', label: 'Folder the agents may access', placeholder: '/home/me/team-docs' }],
    description: 'Read and write files inside one folder you choose.', docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem' },
  { key: 'brave-search', name: 'Brave Search', icon: '🦁', category: 'research', transport: 'stdio', command: 'npx', args: ['-y', '@brave/brave-search-mcp-server'],
    env: [{ key: 'BRAVE_API_KEY', label: 'Brave Search API key', secret: true }],
    description: 'High-quality web, news and local search.', docs: 'https://github.com/brave/brave-search-mcp-server' },
  { key: 'fetch', name: 'Fetch (web → markdown)', icon: '🌐', category: 'research', transport: 'stdio', command: 'uvx', args: ['mcp-server-fetch'],
    description: 'Fetch any URL and convert it to markdown (requires uv).', docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch' },
  { key: 'playwright', name: 'Browser (Playwright)', icon: '🧭', category: 'dev', transport: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest', '--headless'],
    description: 'Let agents drive a real browser: navigate, click, fill forms, take snapshots.', docs: 'https://github.com/microsoft/playwright-mcp' },
  { key: 'postgres', name: 'PostgreSQL', icon: '🐘', category: 'data', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', '{{DATABASE_URL}}'],
    fields: [{ key: 'DATABASE_URL', label: 'Connection string (read-only user recommended)', placeholder: 'postgresql://user:pass@host/db', secret: true }],
    description: 'Inspect schemas and run read-only SQL queries.', docs: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/postgres' },
  { key: 'sqlite', name: 'SQLite', icon: '🗃️', category: 'data', transport: 'stdio', command: 'uvx', args: ['mcp-server-sqlite', '--db-path', '{{DB_PATH}}'],
    fields: [{ key: 'DB_PATH', label: 'Database file path', placeholder: '/data/app.db' }],
    description: 'Query and analyse a local SQLite database (requires uv).', docs: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sqlite' },
  { key: 'linear', name: 'Linear', icon: '📐', category: 'productivity', transport: 'http', url: 'https://mcp.linear.app/mcp', auth: 'oauth',
    description: 'Create and update issues, projects and cycles. Sign in with your Linear account.', docs: 'https://linear.app/docs/mcp' },
  { key: 'sentry', name: 'Sentry', icon: '🛡️', category: 'dev', transport: 'http', url: 'https://mcp.sentry.dev/mcp', auth: 'oauth',
    description: 'Look up errors, issues and releases. Sign in with your Sentry account.', docs: 'https://docs.sentry.io/product/sentry-mcp/' },
  { key: 'notion-oauth', name: 'Notion (sign in)', icon: '📓', category: 'docs', transport: 'http', url: 'https://mcp.notion.com/mcp', auth: 'oauth',
    description: 'Notion\'s hosted MCP server: sign in with your Notion account, no integration token needed.', docs: 'https://developers.notion.com/docs/mcp' },
  { key: 'atlassian', name: 'Jira & Confluence', icon: '🧭', category: 'productivity', transport: 'sse', url: 'https://mcp.atlassian.com/v1/sse', auth: 'oauth',
    description: 'Search and update Jira issues and Confluence pages (Atlassian Remote MCP).', docs: 'https://support.atlassian.com/rovo/docs/getting-started-with-the-atlassian-remote-mcp-server/' },
  { key: 'asana', name: 'Asana', icon: '✅', category: 'productivity', transport: 'sse', url: 'https://mcp.asana.com/sse', auth: 'oauth',
    description: 'Tasks, projects and goals in Asana.', docs: 'https://developers.asana.com/docs/using-asanas-mcp-server' },
  { key: 'canva', name: 'Canva', icon: '🎨', category: 'docs', transport: 'http', url: 'https://mcp.canva.com/mcp', auth: 'oauth',
    description: 'Search, create and export Canva designs.', docs: 'https://www.canva.dev/docs/mcp/' },
  { key: 'stripe', name: 'Stripe', icon: '💳', category: 'data', transport: 'http', url: 'https://mcp.stripe.com', auth: 'oauth',
    description: 'Customers, payments, invoices and docs search. Payment actions need approval.', docs: 'https://docs.stripe.com/mcp' },
  { key: 'time', name: 'Time & time zones', icon: '🕒', category: 'productivity', transport: 'stdio', command: 'uvx', args: ['mcp-server-time'],
    description: 'Current time and timezone conversion (requires uv).', docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/time' },
  { key: 'custom-stdio', name: 'Custom (local command)', icon: '🧩', category: 'custom', transport: 'stdio', command: '', args: [], description: 'Any MCP server started as a local command.' },
  { key: 'custom-http', name: 'Custom (remote URL)', icon: '🔗', category: 'custom', transport: 'http', url: '', headers: [], description: 'Any remote MCP server (Streamable HTTP or SSE), with headers or OAuth sign-in.' },
];

// Build a server config from a preset + user-supplied values.
export function fromPreset(key, values = {}) {
  const p = PRESETS.find((x) => x.key === key);
  if (!p) throw Object.assign(new Error('Unknown MCP preset'), { status: 400 });
  const fill = (s) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? '');
  return {
    name: values.name || p.name, preset: p.key, transport: p.transport,
    command: p.command, args: (p.args || []).map(fill),
    url: p.url || values.url,
    env: Object.fromEntries((p.env || []).map((e) => [e.key, values[e.key] ?? '']).filter(([, v]) => v !== '')),
    headers: Object.fromEntries((p.headers || []).map((h) => [h.key, h.template ? h.template.replace('{{value}}', values[h.key] ?? '') : values[h.key] ?? '']).filter(([, v]) => v && !/Bearer\s*$/.test(v))),
    approval: values.approval || 'auto',
    auth: p.auth || 'none',
    oauth: p.auth === 'oauth' ? { clientId: values.clientId, clientSecret: values.clientSecret, scope: values.scope } : undefined,
  };
}
