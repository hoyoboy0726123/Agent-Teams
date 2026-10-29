// Human-in-the-loop approval for agent actions with side effects (e.g. sending an
// email or merging a PR through MCP). The agent's turn pauses until a human decides.
import { all, get, run, id, now, json, audit } from './db.js';
import { emit } from './bus.js';

const waiting = new Map(); // approvalId → resolve(decision)
const TIMEOUT_MS = 15 * 60_000;

const toApproval = (r) => r && ({
  id: r.id, channelId: r.channel_id, messageId: r.message_id, agentId: r.agent_id, tool: r.tool, args: json(r.args_json, {}),
  status: r.status, decidedBy: r.decided_by, createdAt: r.created_at, decidedAt: r.decided_at,
});

export const getApproval = (aid) => toApproval(get('SELECT * FROM approvals WHERE id = ?', aid));
export const pendingApprovals = (channelIds) => all("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC").map(toApproval)
  .filter((a) => !channelIds || channelIds.includes(a.channelId));

// Resolves to 'approved' | 'denied' | 'expired'.
export function requestApproval({ channelId, messageId, agentId, tool, args, signal, onCreate }) {
  const aid = id('apr_');
  run('INSERT INTO approvals(id, channel_id, message_id, agent_id, tool, args_json, created_at) VALUES (?,?,?,?,?,?,?)',
    aid, channelId, messageId, agentId, tool, JSON.stringify(args ?? {}), now());
  const approval = getApproval(aid);
  onCreate?.(approval);
  emit('approval.updated', { channelId, approval });
  return new Promise((resolve) => {
    const finish = (status, by = null) => {
      if (!waiting.has(aid)) return;
      waiting.delete(aid);
      clearTimeout(timer);
      run('UPDATE approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?', status, by, now(), aid);
      emit('approval.updated', { channelId, approval: getApproval(aid) });
      resolve(status);
    };
    const timer = setTimeout(() => finish('expired'), TIMEOUT_MS);
    signal?.addEventListener('abort', () => finish('denied', 'stopped'), { once: true });
    waiting.set(aid, finish);
  });
}

export function decide(aid, approved, user) {
  const a = getApproval(aid);
  if (!a) return null;
  const finish = waiting.get(aid);
  if (!finish) {
    if (a.status === 'pending') run("UPDATE approvals SET status = 'expired', decided_at = ? WHERE id = ?", now(), aid);
    return getApproval(aid);
  }
  finish(approved ? 'approved' : 'denied', user.id);
  audit('user', user.id, approved ? 'approval.approve' : 'approval.deny', aid, { tool: a.tool });
  return getApproval(aid);
}

// Approvals cannot survive a restart (the waiting agent turn is gone).
export function expireStale() {
  run("UPDATE approvals SET status = 'expired', decided_at = ? WHERE status = 'pending'", now());
}
