// Multi-agent workflows: an ordered list of agent steps (optionally parallel groups),
// run inside a channel so every step is visible, reviewable and remembered.
import { all, get, run, id, now, json, audit } from '../db.js';
import { emit } from '../bus.js';
import { createMessage, getChannel } from '../channels.js';
import { getAgent, getAgentByHandle } from '../agents/store.js';
import { runAgent } from '../agents/runtime.js';
import { enqueue, maintainChannel } from '../agents/orchestrator.js';
import { randomBytes } from 'node:crypto';
import { getSetting } from '../db.js';
import { validateSchedule, matches, minuteKey, nextRuns, describe } from './schedule.js';
import { buildDigest } from './digest.js';

export const workspaceTz = () => getSetting('timezone', null) || process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const toWorkflow = (r) => {
  if (!r) return r;
  // Legacy rows only had schedule_minutes.
  const schedule = json(r.schedule_json, null) || (r.schedule_minutes ? { kind: 'interval', minutes: r.schedule_minutes } : null);
  const trigger = r.trigger === 'manual' && schedule ? 'schedule' : r.trigger || 'manual';
  const wf = {
    id: r.id, name: r.name, description: r.description, steps: json(r.steps_json, []), channelId: r.channel_id,
    trigger, schedule, scheduleInput: r.schedule_input, enabled: r.enabled !== 0, category: r.category || '', icon: r.icon || '⚡',
    hookToken: r.hook_token || null, templateKey: r.template_key || null,
    lastRunAt: r.last_run_at, createdBy: r.created_by, createdAt: r.created_at,
  };
  wf.scheduleLabel = { zh: describe(trigger === 'schedule' ? schedule : null, 'zh'), en: describe(trigger === 'schedule' ? schedule : null, 'en') };
  if (trigger === 'schedule' && schedule) {
    try { wf.nextRuns = nextRuns(schedule, { tz: workspaceTz(), count: 2, lastRunAt: r.last_run_at }).map((d) => d.getTime()); } catch { wf.nextRuns = []; }
  }
  return wf;
};
const toRun = (r) => r && ({
  id: r.id, workflowId: r.workflow_id, channelId: r.channel_id, status: r.status, input: r.input,
  outputs: json(r.outputs_json, []), error: r.error, startedAt: r.started_at, finishedAt: r.finished_at,
});

export const listWorkflows = () => all('SELECT * FROM workflows ORDER BY created_at DESC').map(toWorkflow);
export const getWorkflow = (wid) => toWorkflow(get('SELECT * FROM workflows WHERE id = ?', wid));
export const listRuns = (wid) => all('SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 30', wid).map(toRun);

function cleanSteps(steps) {
  return (steps || []).map((s) => ({
    agentId: s.agentId || getAgentByHandle(s.handle || '')?.id || null,
    instruction: String(s.instruction || '').slice(0, 4000),
    parallel: !!s.parallel,
  })).filter((s) => s.agentId && s.instruction);
}

export function saveWorkflow(input, user, wid = null) {
  const steps = cleanSteps(input.steps);
  if (!input.name) throw Object.assign(new Error('Workflow name required'), { status: 400 });
  if (!steps.length) throw Object.assign(new Error('Add at least one step with an agent and instruction'), { status: 400 });
  let schedule = input.schedule ?? (input.scheduleMinutes ? { kind: 'interval', minutes: input.scheduleMinutes } : null);
  let trigger = ['manual', 'schedule', 'webhook'].includes(input.trigger) ? input.trigger : schedule ? 'schedule' : 'manual';
  if (trigger === 'schedule') {
    schedule = validateSchedule(schedule);
    if (!schedule) throw Object.assign(new Error('Choose when this automation should run'), { status: 400 });
    if (!input.channelId) throw Object.assign(new Error('Scheduled automations need a channel to post in'), { status: 400 });
  } else schedule = null;
  if (trigger === 'webhook' && !input.channelId) throw Object.assign(new Error('Webhook automations need a channel to post in'), { status: 400 });
  const prev = wid ? get('SELECT hook_token FROM workflows WHERE id = ?', wid) : null;
  const hook = trigger === 'webhook' ? prev?.hook_token || randomBytes(18).toString('base64url') : prev?.hook_token || null;
  const vals = [input.name, input.description || '', JSON.stringify(steps), input.channelId || null, input.scheduleInput || '', trigger,
    schedule ? JSON.stringify(schedule) : null, hook, input.enabled === false ? 0 : 1, input.category || '', input.icon || '⚡'];
  if (wid) {
    run('UPDATE workflows SET name=?, description=?, steps_json=?, channel_id=?, schedule_input=?, trigger=?, schedule_json=?, hook_token=?, enabled=?, category=?, icon=?, schedule_minutes=NULL WHERE id=?', ...vals, wid);
  } else {
    wid = id('wf_');
    run(`INSERT INTO workflows(name, description, steps_json, channel_id, schedule_input, trigger, schedule_json, hook_token, enabled, category, icon, id, created_by, created_at, template_key)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...vals, wid, user?.id ?? null, now(), input.templateKey || null);
  }
  audit('user', user?.id, 'workflow.save', wid, { trigger });
  emit('workflow.updated', { workflowId: wid });
  return getWorkflow(wid);
}

export function setEnabled(wid, enabled, user) {
  run('UPDATE workflows SET enabled = ? WHERE id = ?', enabled ? 1 : 0, wid);
  audit('user', user?.id, enabled ? 'workflow.enable' : 'workflow.disable', wid, {});
  emit('workflow.updated', { workflowId: wid });
  return getWorkflow(wid);
}

export const findByHook = (token) => toWorkflow(get('SELECT * FROM workflows WHERE hook_token = ? AND trigger = ?', token, 'webhook'));

export function deleteWorkflow(wid, user) {
  run('DELETE FROM workflows WHERE id = ?', wid);
  audit('user', user?.id, 'workflow.delete', wid, {});
  emit('workflow.updated', { workflowId: wid, deleted: true });
}

export const render = (tpl, vars) => String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (vars[k] ?? `{{${k}}}`));

// Group consecutive `parallel` steps so they run concurrently.
export function stages(steps) {
  const out = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (s.parallel && last && last[0].parallel) last.push(s);
    else out.push([s]);
  }
  return out;
}

export function startWorkflow(wid, { input = '', channelId, user } = {}) {
  const wf = getWorkflow(wid);
  if (!wf) throw Object.assign(new Error('Workflow not found'), { status: 404 });
  const cid = channelId || wf.channelId;
  if (!cid || !getChannel(cid)) throw Object.assign(new Error('Choose a channel to run this workflow in'), { status: 400 });
  const rid = id('run_');
  run('INSERT INTO workflow_runs(id, workflow_id, channel_id, status, input, started_at) VALUES (?,?,?,?,?,?)', rid, wid, cid, 'running', input, now());
  run('UPDATE workflows SET last_run_at = ? WHERE id = ?', now(), wid);
  emit('workflow.updated', { workflowId: wid, runId: rid });

  const job = enqueue(cid, async () => {
    const outputs = [];
    const vars = { input, prev: input, date: new Date().toLocaleDateString('en-CA', { timeZone: workspaceTz() }) };
    if (wf.steps.some((st) => /\{\{\s*digest/.test(st.instruction))) { vars.digest = buildDigest({ excludeChannelId: cid }); vars.digest_week = buildDigest({ hours: 168, excludeChannelId: cid }); }
    createMessage({ channelId: cid, authorType: 'system', authorId: user?.id, content: `▶ Workflow **${wf.name}** started${input ? `\n> ${input.replace(/\n/g, '\n> ')}` : ''}`, meta: { workflowRunId: rid } });
    try {
      let n = 0;
      for (const group of stages(wf.steps)) {
        const results = await Promise.all(group.map((s) => {
          const idx = ++n;
          const agent = getAgent(s.agentId);
          if (!agent) throw new Error(`Step ${idx}: agent no longer exists`);
          const instruction = `Workflow "${wf.name}", step ${idx}/${wf.steps.length}. ${render(s.instruction, vars)}`;
          return runAgent({ agentId: agent.id, channelId: cid, userId: user?.id, extraInstruction: instruction, workflowRunId: rid })
            .then((m) => ({ idx, m, agent }));
        }));
        for (const { idx, m, agent } of results) {
          if (m.status !== 'done' && m.status !== 'passed') throw new Error(`Step ${idx} (@${agent.handle}) failed: ${m.meta?.error || 'error'}`);
          vars[`step${idx}`] = m.content;
          vars.prev = m.content;
          outputs.push({ step: idx, agentId: agent.id, messageId: m.id });
        }
        run('UPDATE workflow_runs SET outputs_json = ? WHERE id = ?', JSON.stringify(outputs), rid);
      }
      run('UPDATE workflow_runs SET status = ?, finished_at = ? WHERE id = ?', 'done', now(), rid);
      createMessage({ channelId: cid, authorType: 'system', content: `✅ Workflow **${wf.name}** finished (${outputs.length} steps).`, meta: { workflowRunId: rid } });
      const last = outputs[outputs.length - 1];
      if (last) maintainChannel(cid, getAgent(last.agentId)).catch(() => {});
    } catch (e) {
      run('UPDATE workflow_runs SET status = ?, error = ?, finished_at = ? WHERE id = ?', 'error', e.message, now(), rid);
      createMessage({ channelId: cid, authorType: 'system', content: `⚠️ Workflow **${wf.name}** stopped: ${e.message}`, meta: { workflowRunId: rid } });
    }
    emit('workflow.updated', { workflowId: wid, runId: rid });
  });
  job.catch(() => {});
  return { runId: rid, channelId: cid, done: job };
}

// Scheduler: every 30 s, fire enabled scheduled automations whose slot matches "now".
let timer;
export function tickScheduler(at = new Date()) {
  const tz = workspaceTz();
  const fired = [];
  for (const r of all("SELECT * FROM workflows WHERE enabled = 1 AND (trigger = 'schedule' OR schedule_minutes IS NOT NULL)")) {
    const wf = toWorkflow(r);
    if (!wf.schedule || !wf.channelId) continue;
    try {
      if (wf.schedule.kind === 'interval') {
        if (wf.lastRunAt && at.getTime() - wf.lastRunAt < wf.schedule.minutes * 60_000) continue;
      } else {
        if (!matches(wf.schedule, at, tz)) continue;
        const key = minuteKey(at, tz);
        if (r.last_fire_key === key) continue;
        run('UPDATE workflows SET last_fire_key = ? WHERE id = ?', key, wf.id);
      }
      startWorkflow(wf.id, { input: wf.scheduleInput });
      fired.push(wf.id);
    } catch (e) { console.warn('[scheduler]', wf.name, e.message); }
  }
  return fired;
}

export function startScheduler() {
  clearInterval(timer);
  timer = setInterval(() => tickScheduler(), 30_000);
  timer.unref?.();
}

export { WORKFLOW_TEMPLATES, AUTOMATION_TEMPLATES } from './templates.js';
