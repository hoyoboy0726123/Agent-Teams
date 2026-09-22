// Agent definitions: persona, model binding, tools, memory switch.
import { all, get, run, id, now, json, audit } from '../db.js';
import { emit } from '../bus.js';

export const TOOLS = ['web_fetch', 'recall', 'remember', 'artifacts', 'handoff', 'calc'];

export const toAgent = (r) => r && ({
  id: r.id, name: r.name, handle: r.handle, avatar: r.avatar, color: r.color, description: r.description,
  systemPrompt: r.system_prompt, providerId: r.provider_id, model: r.model, temperature: r.temperature,
  tools: json(r.tools_json, []), memoryEnabled: !!r.memory_enabled, createdBy: r.created_by, createdAt: r.created_at, archived: !!r.archived,
});

export const listAgents = ({ includeArchived = false } = {}) =>
  all(`SELECT * FROM agents ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY created_at`).map(toAgent);
export const getAgent = (aid) => toAgent(get('SELECT * FROM agents WHERE id = ?', aid));
export const getAgentByHandle = (h) => toAgent(get('SELECT * FROM agents WHERE lower(handle) = lower(?) AND archived = 0', h));

export function normalizeHandle(h) {
  return String(h || '').trim().replace(/^@/, '').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 32);
}

export function createAgent(input, user) {
  const handle = normalizeHandle(input.handle || input.name);
  if (!handle) throw Object.assign(new Error('Agent handle required'), { status: 400 });
  if (getAgentByHandle(handle)) throw Object.assign(new Error(`@${handle} is already taken`), { status: 409 });
  const aid = id('agt_');
  run(`INSERT INTO agents(id, name, handle, avatar, color, description, system_prompt, provider_id, model, temperature, tools_json, memory_enabled, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    aid, String(input.name || handle).slice(0, 60), handle, input.avatar || '🤖', input.color || '#6366f1', input.description || '',
    input.systemPrompt || '', input.providerId || null, input.model || null, input.temperature ?? null,
    JSON.stringify((input.tools || TOOLS).filter((t) => TOOLS.includes(t))), input.memoryEnabled === false ? 0 : 1, user?.id ?? null, now());
  audit('user', user?.id, 'agent.create', aid, { handle });
  emit('agent.updated', { agentId: aid });
  return getAgent(aid);
}

export function updateAgent(aid, patch, user) {
  const a = getAgent(aid);
  if (!a) return null;
  const handle = patch.handle != null ? normalizeHandle(patch.handle) : a.handle;
  const clash = getAgentByHandle(handle);
  if (clash && clash.id !== aid) throw Object.assign(new Error(`@${handle} is already taken`), { status: 409 });
  run(`UPDATE agents SET name=?, handle=?, avatar=?, color=?, description=?, system_prompt=?, provider_id=?, model=?, temperature=?, tools_json=?, memory_enabled=?, archived=? WHERE id=?`,
    patch.name ?? a.name, handle, patch.avatar ?? a.avatar, patch.color ?? a.color, patch.description ?? a.description,
    patch.systemPrompt ?? a.systemPrompt, patch.providerId !== undefined ? patch.providerId || null : a.providerId,
    patch.model !== undefined ? patch.model || null : a.model, patch.temperature !== undefined ? patch.temperature : a.temperature,
    JSON.stringify((patch.tools ?? a.tools).filter((t) => TOOLS.includes(t))),
    patch.memoryEnabled != null ? (patch.memoryEnabled ? 1 : 0) : a.memoryEnabled ? 1 : 0,
    patch.archived != null ? (patch.archived ? 1 : 0) : a.archived ? 1 : 0, aid);
  audit('user', user?.id, 'agent.update', aid, {});
  emit('agent.updated', { agentId: aid });
  return getAgent(aid);
}

export function deleteAgent(aid, user) {
  run('DELETE FROM channel_members WHERE member_type = ? AND member_id = ?', 'agent', aid);
  run('DELETE FROM agents WHERE id = ?', aid);
  audit('user', user?.id, 'agent.delete', aid, {});
  emit('agent.updated', { agentId: aid, deleted: true });
}

// A ready-made team. Prompts are English (models follow them best); agents answer in the user's language.
export const TEMPLATES = [
  {
    key: 'lead', name: '專案統籌 Lead', handle: 'lead', avatar: '🧭', color: '#6366f1',
    description: 'Breaks goals into tasks, delegates to the right teammate, tracks decisions and next steps.',
    systemPrompt: `You are the team lead and coordinator. When a request is large or multi-disciplinary:
1) restate the goal in one line, 2) break it into concrete sub-tasks, 3) delegate each by @mentioning the right teammate with a precise instruction, 4) after teammates reply, synthesize a final answer with decisions, owners and next steps.
For small questions just answer directly. Keep a crisp, structured style.`,
  },
  {
    key: 'researcher', name: '研究員 Researcher', handle: 'researcher', avatar: '🔎', color: '#0ea5e9',
    description: 'Deep research, fact-finding, source gathering and competitive analysis. Can fetch web pages.',
    systemPrompt: `You are a meticulous researcher. Gather facts, compare sources, separate evidence from opinion and state uncertainty explicitly.
Use the web_fetch tool when a URL is given or you need to read a page. Cite sources as markdown links. End with "Key findings" and "Open questions".
For long research reports, deliver them as an artifact of type "research".`,
  },
  {
    key: 'writer', name: '撰稿人 Writer', handle: 'writer', avatar: '✍️', color: '#f59e0b',
    description: 'Turns conversations into polished documents: specs, reports, emails, blog posts, meeting notes.',
    systemPrompt: `You are a senior writer and editor. Produce clear, well-structured prose that fits the audience.
When asked for a document, report, PRD, proposal or notes, deliver it as an artifact of type "document" (markdown). Otherwise reply concisely.`,
  },
  {
    key: 'designer', name: '設計師 Designer', handle: 'designer', avatar: '🎨', color: '#ec4899',
    description: 'Builds slide decks and websites/landing pages from the discussion.',
    systemPrompt: `You are a presentation and web designer.
Slides: deliver an artifact of type "slides" in markdown; separate slides with a line containing only ---; keep 3–6 bullets per slide; add speaker notes after "Note:".
Websites: deliver an artifact of type "website" containing one complete, self-contained HTML file (inline CSS/JS, responsive, accessible, no external requests).`,
  },
  {
    key: 'analyst', name: '資料分析師 Analyst', handle: 'analyst', avatar: '📊', color: '#10b981',
    description: 'Analyses numbers, builds KPI dashboards and charts, sanity-checks calculations.',
    systemPrompt: `You are a data analyst. Be precise with numbers and show your reasoning briefly; use the calc tool for arithmetic.
For dashboards, deliver an artifact of type "dashboard" whose body is JSON:
{"title": str, "kpis": [{"label": str, "value": str, "delta": str}], "charts": [{"type": "bar"|"line"|"pie", "title": str, "labels": [str], "series": [{"name": str, "data": [number]}]}], "table": {"columns": [str], "rows": [[...]]}, "notes": str}`,
  },
  {
    key: 'engineer', name: '工程師 Engineer', handle: 'engineer', avatar: '🛠️', color: '#8b5cf6',
    description: 'Architecture, code, debugging and technical reviews.',
    systemPrompt: `You are a pragmatic senior software engineer. Give working code with the minimum needed explanation, note trade-offs and risks, and prefer simple designs.`,
  },
  {
    key: 'critic', name: '審稿人 Critic', handle: 'critic', avatar: '🧐', color: '#ef4444',
    description: 'Red-teams plans and drafts: finds gaps, risks, weak arguments and factual errors.',
    systemPrompt: `You are a constructive critic. Review the latest proposal or draft and list the most important problems first (risks, missing evidence, unclear logic, factual errors), each with a concrete fix. Be direct but kind. Finish with a verdict: ship / revise / rethink.`,
  },
];
