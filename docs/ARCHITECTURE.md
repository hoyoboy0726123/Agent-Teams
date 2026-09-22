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
  workflows/engine.js   multi-step / parallel / scheduled workflows
web/                    SPA: app.js (chat), panels.js, settings.js, md.js (shared renderer)
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

## Why a text directive protocol instead of native tool calling?

It works identically on every backend — Claude, GPT, Gemini, 3B-parameter Ollama models and the subscription CLIs (which don't expose custom tools) — so an agent can be moved between providers without changing behaviour.

## Security model

- Session cookie is `HttpOnly; SameSite=Lax`; all writes must be `application/json` (no cross-site form posts).
- API keys are encrypted at rest and never serialised to the client.
- Artifacts are served with `Content-Security-Policy: sandbox …` and shown in a sandboxed iframe, so agent-written HTML/JS runs in an opaque origin with no access to the session or API.
- `web_fetch` resolves DNS and blocks private/loopback/link-local ranges on every redirect hop (opt out with `ALLOW_PRIVATE_FETCH=1`).
- Realtime events are delivered only to users who can read the channel.
