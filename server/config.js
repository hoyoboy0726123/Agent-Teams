// Runtime configuration (env vars override defaults).
import { resolve } from 'node:path';

const dataDir = resolve(process.env.AGENT_TEAMS_DATA || './data');

export const config = {
  port: Number(process.env.PORT || 3789),
  host: process.env.HOST || '127.0.0.1',
  dataDir,
  dbFile: process.env.AGENT_TEAMS_DB || resolve(dataDir, 'agent-teams.db'),
  keyFile: resolve(dataDir, 'secret.key'),
  // Allow agents' web_fetch tool to reach private network addresses (off by default: SSRF guard).
  allowPrivateFetch: process.env.ALLOW_PRIVATE_FETCH === '1',
  // Max chained agent→agent hand-offs triggered by a single human message.
  maxHandoffDepth: Number(process.env.MAX_HANDOFF_DEPTH || 4),
  // How many recent messages go verbatim into an agent's context window.
  contextMessages: Number(process.env.CONTEXT_MESSAGES || 30),
  sessionDays: 30,
  // Public origin (e.g. https://team.example.com) for OAuth redirects when behind a proxy; else taken from the request.
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
};
