// OAuth 2.1 sign-in for remote MCP servers (Notion, Linear, Sentry, Atlassian, Asana, …).
// The SDK does discovery (RFC 9728 / RFC 8414), dynamic client registration (RFC 7591), PKCE
// and token refresh; this provider persists its state encrypted per server.
import { randomBytes } from 'node:crypto';
import { get, run, json } from '../db.js';
import { encrypt, decrypt } from '../secrets.js';

// { config: {clientId, clientSecret, scope}, redirectUrl, client, tokens, verifier, discovery, signedInAt }
export const loadOAuth = (sid) => json(decrypt(get('SELECT oauth_enc FROM mcp_servers WHERE id = ?', sid)?.oauth_enc) || '{}', {});

export function saveOAuth(sid, patch, { replace = false } = {}) {
  const next = { ...(replace ? {} : loadOAuth(sid)), ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  run('UPDATE mcp_servers SET oauth_enc = ? WHERE id = ?', encrypt(JSON.stringify(next)), sid);
  return next;
}

// Browser round trips in flight: state → { sid, userId, expires }.
export const pending = new Map();

export class ServerOAuthProvider {
  constructor(server, { userId = null } = {}) {
    this.sid = server.id;
    this.userId = userId;
    this.authorizationUrl = null;
  }

  get stored() { return loadOAuth(this.sid); }
  get redirectUrl() { return this.stored.redirectUrl; }

  get clientMetadata() {
    const { config = {} } = this.stored;
    return {
      client_name: 'Agent Teams',
      redirect_uris: this.redirectUrl ? [String(this.redirectUrl)] : [],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: config.clientSecret ? 'client_secret_post' : 'none',
      ...(config.scope ? { scope: config.scope } : {}),
    };
  }

  state() {
    const state = randomBytes(24).toString('base64url');
    for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k);
    pending.set(state, { sid: this.sid, userId: this.userId, expires: Date.now() + 15 * 60_000 });
    return state;
  }

  // A client ID entered by the admin wins over one obtained by dynamic registration.
  clientInformation() {
    const { config = {}, client } = this.stored;
    if (config.clientId) return { client_id: config.clientId, ...(config.clientSecret ? { client_secret: config.clientSecret } : {}) };
    return client;
  }
  saveClientInformation(client) { saveOAuth(this.sid, { client }); }

  tokens() { return this.stored.tokens; }
  saveTokens(tokens) { saveOAuth(this.sid, { tokens, signedInAt: this.stored.tokens ? this.stored.signedInAt : Date.now() }); }

  // Server side we cannot open a browser: remember where the user has to go.
  redirectToAuthorization(url) { this.authorizationUrl = url; }

  saveCodeVerifier(verifier) { saveOAuth(this.sid, { verifier }); }
  codeVerifier() {
    const v = this.stored.verifier;
    if (!v) throw new Error('No PKCE verifier saved — start the sign-in again');
    return v;
  }

  saveDiscoveryState(discovery) { saveOAuth(this.sid, { discovery }); }
  discoveryState() { return this.stored.discovery; }

  invalidateCredentials(scope) {
    const drop = {
      all: { client: undefined, tokens: undefined, verifier: undefined, discovery: undefined, signedInAt: undefined },
      client: { client: undefined },
      tokens: { tokens: undefined, signedInAt: undefined },
      verifier: { verifier: undefined },
      discovery: { discovery: undefined },
    }[scope];
    if (drop) saveOAuth(this.sid, drop);
  }
}
