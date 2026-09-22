// Agent definitions: persona, model binding, tools, memory switch.
import { all, get, run, id, now, json, audit } from '../db.js';
import { emit } from '../bus.js';

export const TOOLS = ['web_search', 'web_fetch', 'recall', 'remember', 'artifacts', 'handoff', 'tasks', 'calc'];

export const toAgent = (r) => r && ({
  id: r.id, name: r.name, handle: r.handle, avatar: r.avatar, color: r.color, description: r.description,
  systemPrompt: r.system_prompt, providerId: r.provider_id, model: r.model, temperature: r.temperature,
  tools: json(r.tools_json, []), memoryEnabled: !!r.memory_enabled, createdBy: r.created_by, createdAt: r.created_at, archived: !!r.archived,
  mcpServers: json(r.mcp_json, []), category: r.category || '', starters: json(r.starters_json, []), templateKey: r.template_key || null,
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
  run(`INSERT INTO agents(id, name, handle, avatar, color, description, system_prompt, provider_id, model, temperature, tools_json, memory_enabled, created_by, created_at, mcp_json, category, starters_json, template_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    aid, String(input.name || handle).slice(0, 60), handle, input.avatar || '🤖', input.color || '#6366f1', input.description || '',
    input.systemPrompt || '', input.providerId || null, input.model || null, input.temperature ?? null,
    JSON.stringify((input.tools || TOOLS).filter((t) => TOOLS.includes(t))), input.memoryEnabled === false ? 0 : 1, user?.id ?? null, now(),
    JSON.stringify(input.mcpServers || []), input.category || '', JSON.stringify((input.starters || []).slice(0, 6)), input.templateKey || input.key || null);
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
  run('UPDATE agents SET mcp_json = ?, category = ?, starters_json = ? WHERE id = ?',
    JSON.stringify(patch.mcpServers ?? a.mcpServers), patch.category ?? a.category, JSON.stringify((patch.starters ?? a.starters).slice(0, 6)), aid);
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

// Role templates live in library.js (40+ roles across work and life).
export { LIBRARY as TEMPLATES } from './library.js';
