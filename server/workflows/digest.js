// Workspace activity digest for briefing automations ({{digest}} / {{digest_week}}).
// Only public channels are included so briefs never leak private conversations.
import { all } from '../db.js';

export function buildDigest({ hours = 24, excludeChannelId = null } = {}) {
  const since = Date.now() - hours * 3600_000;
  const chans = all("SELECT id, name FROM channels WHERE kind = 'channel' AND private = 0 AND archived = 0");
  const agentName = Object.fromEntries(all('SELECT id, handle FROM agents').map((a) => [a.id, '@' + a.handle]));
  const userName = Object.fromEntries(all('SELECT id, display_name FROM users').map((u) => [u.id, u.display_name]));
  const parts = [];
  for (const c of chans) {
    if (c.id === excludeChannelId) continue;
    const msgs = all("SELECT * FROM messages WHERE channel_id = ? AND created_at > ? AND status = 'done' AND author_type != 'system' ORDER BY created_at", c.id, since);
    if (!msgs.length) continue;
    const lines = msgs.slice(-12).map((m) => `  - ${m.author_type === 'agent' ? agentName[m.author_id] || 'agent' : userName[m.author_id] || 'user'}: ${m.content.replace(/\[\[[^\]]+\]\]/g, '[artifact]').replace(/\s+/g, ' ').slice(0, 220)}`);
    parts.push(`#${c.name} (${msgs.length} messages)\n${lines.join('\n')}`);
  }
  const open = all("SELECT t.*, c.private FROM tasks t LEFT JOIN channels c ON c.id = t.channel_id WHERE t.status != 'done' AND (c.private = 0 OR c.private IS NULL) ORDER BY COALESCE(t.due_at, 9e15) LIMIT 30");
  const who = (t) => (t.assignee_type === 'agent' ? agentName[t.assignee_id] : userName[t.assignee_id]) || 'unassigned';
  const taskLines = open.map((t) => `  - [${t.status}] ${t.title} → ${who(t)}${t.due_at ? ` (due ${new Date(t.due_at).toISOString().slice(0, 10)}${t.due_at < Date.now() ? ', OVERDUE' : ''})` : ''}`);
  const arts = all('SELECT a.title, a.type, a.current_version FROM artifacts a LEFT JOIN channels c ON c.id = a.channel_id WHERE a.updated_at > ? AND (c.private = 0 OR c.private IS NULL) ORDER BY a.updated_at DESC LIMIT 15', since);
  return [
    `Activity in the last ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`}:`,
    parts.length ? parts.join('\n\n') : '(no channel activity)',
    `\nOpen tasks:\n${taskLines.length ? taskLines.join('\n') : '  (none)'}`,
    `\nArtifacts created or updated:\n${arts.length ? arts.map((a) => `  - "${a.title}" (${a.type}, v${a.current_version})`).join('\n') : '  (none)'}`,
  ].join('\n');
}
