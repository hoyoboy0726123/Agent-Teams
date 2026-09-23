# Architecture

Zero-build Node.js app: one dependency for WebSockets (`ws`), the official Anthropic SDK for the Claude API provider, and Node's built-in `node:sqlite`. The browser client is plain ES modules.

```
server/
  index.js              HTTP server, static files, CSRF guard, startup tasks
  api.js                REST API (every route permission-checked)
  ws.js                 WebSocket fan-out, filtered by channel visibility; presence
  bus.js                in-process event bus
  db.js                 schema + tiny query helpers
  secrets.js            AES-256-GCM for API keys, scrypt passwords
  users.js channels.js  accounts, roles, channels, membership, messages
  seed.js               first-run provider auto-detection + starter team
  providers/            adapters: { listModels(p), async *stream(p, opts) }
    anthropic.js        official SDK, streaming, refusal fallback
    openai.js           OpenAI + 10 OpenAI-compatible presets
    gemini.js ollama.js
    cli.js              Claude Code / Codex / Gemini CLIs (subscriptions)
    demo.js             offline deterministic provider
  agents/
    store.js            agent CRUD + role templates
    runtime.js          context building, streaming, tool loop, directives
    orchestrator.js     routing, hand-offs, synthesis, memory upkeep
    tools.js            directive protocol, web_fetch (SSRF-guarded), calc
  memory/               scoped memory store + BM25 (CJK bigram) retrieval
  artifacts/            versioned store + HTML renderers (docs, slides, dashboards, sites)
  workflows/            engine (multi-step / parallel), schedule.js (cron + time zones),
                        templates.js (work & life automations), digest.js ({{digest}})
  mcp/index.js          MCP client manager (stdio / HTTP / SSE), presets, approval policy, OAuth flow
  mcp/oauth.js          OAuth client provider for remote MCP servers (encrypted per-server state)
  approvals.js          human-in-the-loop approvals for side-effecting tool calls
  tasks.js files.js     task board; uploads + text extraction (PDF, DOCX, XLSX, PPTX)
  agents/library.js     47 role templates, 8 team bundles
  api-extra.js          routes for MCP, approvals, tasks, files, feedback, bookmarks,
                        sharing, library/teams, automations, studio comments & revisions
web/                    SPA: app.js (chat), views.js (agents, automations, tasks, memory,
                        outputs), studio.js, panels.js, settings.js,
                        md.js + render.js (shared with the server)
test/                   node:test integration + unit tests
```

## Message flow

1. `POST /api/channels/:id/messages` stores the human message and returns immediately.
2. `orchestrator.handleHumanMessage` (serialised per channel) picks responders:
   explicit `@mentions` → `@all` → DM agent → channel mode (`mention` / `roundtable` / `auto`).
   `auto` uses the optional LLM router, else BM25 over agent role descriptions with stickiness toward the agent that just spoke.
3. `runtime.runAgent` builds the context — persona, team roster, channel summary, recalled memories, artifact list, action protocol, then the recent transcript as alternating turns (own messages = `assistant`, everyone else = `user` prefixed with speaker name) — and streams deltas over the bus.
4. Directives in the reply are applied: ` ```artifact ` blocks become versioned artifacts, ` ```remember ` blocks become memories, ` ```tool ` blocks run and their results are fed back for another round (max 5).
5. If the agent `@mentions` teammates, they are queued (depth-limited); the delegating agent then gets a synthesis turn.
6. In the background, `maintainChannel` rolls older messages into the channel summary and extracts durable facts into channel memory.

## Tools, MCP and approvals

Built-in tools (`web_search`, `web_fetch`, `recall`, `read_artifact`, `calc`) and MCP tools share the same
` ```tool ` protocol; MCP tools appear to the agent as `<server-slug>.<tool>`. Before an MCP call runs, the
server's approval policy is checked (`auto` = read-only tools run, others need a human; `always`; `never`).
A pending call pauses the agent's turn and shows an Approve / Deny card in the message; the decision (or a
15-minute timeout) resumes it. Every call is audited.

Remote servers can use **OAuth sign-in** instead of pasted tokens. `POST /api/mcp/servers/:id/oauth/start`
runs the SDK's discovery (RFC 9728 protected-resource metadata → RFC 8414 authorization server), dynamic
client registration (RFC 7591, or an admin-supplied client ID) and PKCE, and returns the authorization URL;
the settings page opens it in a popup. The provider redirects to `/api/mcp/oauth/callback`, which checks the
single-use `state` and that the same admin is signed in, exchanges the code, and posts the result back to the
opener. Tokens, client registration and verifier are stored AES-encrypted per server (`oauth_enc`) and never
sent to the browser; expired access tokens are refreshed automatically, and when refresh fails the server
shows "Sign-in required". Set `PUBLIC_URL` when behind a reverse proxy so the redirect URL is correct.

## Automations

Workflows gain a trigger (`manual` | `schedule` | `webhook`). Schedules (daily / weekly / monthly /
interval / cron) are evaluated every 30 s in the workspace time zone and fire at most once per slot.
Webhooks are `POST /hooks/<token>`; the body becomes `{{input}}`.

## Live previews and Studio

While an agent streams an ` ```artifact ` block, the runtime emits throttled `artifact.draft` events; the
client renders them with the same renderer the server uses (`web/render.js`) into a sandboxed `srcdoc`
iframe. Studio revisions post a message asking the agent to output the complete next version with the same
title, which `upsertArtifact` stores as a new version; addressed comments are then resolved.

## Why a text directive protocol instead of native tool calling?

It works identically on every backend — Claude, GPT, Gemini, 3B-parameter Ollama models and the subscription CLIs (which don't expose custom tools) — so an agent can be moved between providers without changing behaviour.

## Security model

- Session cookie is `HttpOnly; SameSite=Lax`; all writes must be `application/json` (no cross-site form posts).
- API keys are encrypted at rest and never serialised to the client.
- Artifacts are served with `Content-Security-Policy: sandbox …` and shown in a sandboxed iframe, so agent-written HTML/JS runs in an opaque origin with no access to the session or API.
- `web_fetch` resolves DNS and blocks private/loopback/link-local ranges on every redirect hop (opt out with `ALLOW_PRIVATE_FETCH=1`).
- Realtime events are delivered only to users who can read the channel.
