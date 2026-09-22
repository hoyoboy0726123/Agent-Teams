// Provider-agnostic agent protocol. Agents act by emitting fenced blocks, which works
// identically on Claude, GPT, Gemini, local Ollama models and subscription CLIs:
//
//   ```artifact type="slides" title="Q3 plan"   → creates / versions an artifact
//   ```remember scope="channel"                  → stores durable memories (one per line)
//   ```tool                                      → calls a tool, result is fed back
//   {"name": "web_fetch", "args": {"url": "..."}}
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { config } from '../config.js';
import { recall } from '../memory/store.js';
import { listArtifacts, getArtifact, findByTitle } from '../artifacts/store.js';

const BLOCK = /```(artifact|remember|tool)([^\n]*)\n([\s\S]*?)\n?```/g;

export function parseAttrs(s) {
  const out = {};
  for (const m of String(s).matchAll(/(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g)) out[m[1]] = m[2] ?? m[3] ?? m[4];
  return out;
}

// Pull every complete directive block out of the text.
export function extractBlocks(text) {
  const blocks = [];
  for (const m of text.matchAll(BLOCK)) blocks.push({ kind: m[1], attrs: parseAttrs(m[2]), body: m[3], raw: m[0], index: m.index });
  return blocks;
}

// What humans see while/after the agent writes: directives become placeholders/cards.
export function displayText(text, { artifacts = {} } = {}) {
  let s = text.replace(BLOCK, (raw, kind, attrs) => {
    if (kind === 'artifact') {
      const a = parseAttrs(attrs);
      const saved = artifacts[a.title || ''];
      return saved ? `[[artifact:${saved}]]` : `[[artifact-draft:${(a.title || 'Untitled').replace(/[\]\n]/g, '')}]]`;
    }
    return '';
  });
  // Hide an incomplete trailing directive while it is still streaming.
  const open = /```(artifact|remember|tool)([^\n]*)(\n[\s\S]*)?$/.exec(s);
  if (open) {
    const a = parseAttrs(open[2] || '');
    s = s.slice(0, open.index) + (open[1] === 'artifact' ? `[[artifact-draft:${(a.title || 'Untitled').replace(/[\]\n]/g, '')}]]` : open[1] === 'tool' ? '[[tool-running]]' : '');
  }
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------- tools

export const TOOL_DOCS = {
  web_fetch: '{"name":"web_fetch","args":{"url":"https://..."}} — download a web page and read it as text.',
  recall: '{"name":"recall","args":{"query":"..."}} — search team memory beyond what is shown above.',
  artifacts: '{"name":"read_artifact","args":{"title":"..."}} — read the current content of an artifact in this channel.',
  calc: '{"name":"calc","args":{"expression":"(1200*1.08)/12"}} — exact arithmetic.',
};

const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
export function isPrivateAddress(ip) {
  if (isIP(ip) === 4) return PRIVATE_V4.some((r) => r.test(ip));
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

async function assertPublic(u) {
  if (config.allowPrivateFetch) return;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) throw new Error('Blocked: private network address');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error('Blocked: private network address');
}

async function webFetch({ url }, { signal }) {
  let u;
  try { u = new URL(url); } catch { throw new Error('Invalid URL'); }
  const ctl = AbortSignal.any([signal, AbortSignal.timeout(15000)].filter(Boolean));
  let res;
  // Follow redirects manually so every hop passes the private-network check.
  for (let hop = 0; ; hop++) {
    if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs are allowed');
    await assertPublic(u);
    res = await fetch(u, { signal: ctl, redirect: 'manual', headers: { 'user-agent': 'AgentTeams/0.1 (+https://github.com/hoyoboy0726123/agent-teams)' } });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      if (hop >= 5) throw new Error('Too many redirects');
      u = new URL(loc, u);
      continue;
    }
    break;
  }
  const type = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer()).subarray(0, 2_000_000).toString('utf8');
  const text = /html/i.test(type) ? htmlToText(buf) : buf;
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(buf)?.[1]?.trim();
  return `HTTP ${res.status} ${u.href}${title ? `\nTitle: ${title}` : ''}\n\n${text.slice(0, 12000)}${text.length > 12000 ? '\n…(truncated)' : ''}`;
}

// Safe arithmetic: numbers, + - * / % ^, parentheses, and a few Math functions.
export function calc(expression) {
  const src = String(expression).replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/×/g, '*').replace(/÷/g, '/');
  let i = 0;
  const FN = { sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, log: Math.log10, ln: Math.log, exp: Math.exp, min: Math.min, max: Math.max, pow: Math.pow };
  const ws = () => { while (src[i] === ' ') i++; };
  const expr = () => { let v = term(); for (ws(); src[i] === '+' || src[i] === '-'; ws()) v = src[i++] === '+' ? v + term() : v - term(); return v; };
  const term = () => { let v = factor(); for (ws(); '*/%'.includes(src[i]) && src[i]; ws()) { const op = src[i++]; const r = factor(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; } return v; };
  const factor = () => { const b = unary(); ws(); if (src[i] === '^') { i++; return b ** factor(); } return b; };
  const unary = () => { ws(); if (src[i] === '-') { i++; return -unary(); } if (src[i] === '+') { i++; return unary(); } return atom(); };
  const atom = () => {
    ws();
    if (src[i] === '(') { i++; const v = expr(); ws(); if (src[i++] !== ')') throw new Error('Missing )'); return v; }
    const num = /^\d*\.?\d+(e[+-]?\d+)?%?/i.exec(src.slice(i));
    if (num) { i += num[0].length; return num[0].endsWith('%') ? parseFloat(num[0]) / 100 : parseFloat(num[0]); }
    const name = /^[a-z]+/i.exec(src.slice(i));
    if (name) {
      i += name[0].length;
      const n = name[0].toLowerCase();
      if (n === 'pi') return Math.PI;
      if (n === 'e') return Math.E;
      if (!FN[n]) throw new Error(`Unknown function ${n}`);
      ws(); if (src[i++] !== '(') throw new Error('Expected (');
      const args = [expr()];
      for (ws(); src[i] === ','; ws()) { i++; args.push(expr()); }
      if (src[i++] !== ')') throw new Error('Missing )');
      return FN[n](...args);
    }
    throw new Error(`Unexpected "${src[i] ?? 'end'}"`);
  };
  const v = expr();
  ws();
  if (i < src.length) throw new Error(`Unexpected "${src[i]}"`);
  return v;
}

export async function runTool(call, ctx) {
  const { name, args = {} } = call;
  switch (name) {
    case 'web_fetch':
      if (!ctx.tools.includes('web_fetch')) throw new Error('web_fetch is not enabled for this agent');
      return webFetch(args, ctx);
    case 'recall': {
      const hits = recall({ scopes: ctx.scopes, query: args.query || '', limit: 15 });
      return hits.length ? hits.map((m) => `- (${m.scope}) ${m.content}`).join('\n') : 'No matching memories.';
    }
    case 'read_artifact': {
      const a = args.id ? getArtifact(args.id) : findByTitle(ctx.channelId, args.title || '') && getArtifact(findByTitle(ctx.channelId, args.title).id);
      if (!a) return `No artifact found. Available: ${listArtifacts({ channelIds: [ctx.channelId] }).map((x) => x.title).join(', ') || 'none'}`;
      return `# ${a.title} (${a.type}, v${a.version})\n\n${a.content.slice(0, 20000)}`;
    }
    case 'calc':
      return String(calc(args.expression));
    default:
      throw new Error(`Unknown tool "${name}"`);
  }
}
