// Multi-agent workflows: an ordered list of agent steps (optionally parallel groups),
// run inside a channel so every step is visible, reviewable and remembered.
import { all, get, run, id, now, json, audit } from '../db.js';
import { emit } from '../bus.js';
import { createMessage, getChannel } from '../channels.js';
import { getAgent, getAgentByHandle } from '../agents/store.js';
import { runAgent } from '../agents/runtime.js';
import { enqueue, maintainChannel } from '../agents/orchestrator.js';

const toWorkflow = (r) => r && ({
  id: r.id, name: r.name, description: r.description, steps: json(r.steps_json, []), channelId: r.channel_id,
  scheduleMinutes: r.schedule_minutes, scheduleInput: r.schedule_input, lastRunAt: r.last_run_at, createdBy: r.created_by, createdAt: r.created_at,
});
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
  const sched = input.scheduleMinutes ? Math.max(5, Number(input.scheduleMinutes)) : null;
  if (wid) {
    run('UPDATE workflows SET name=?, description=?, steps_json=?, channel_id=?, schedule_minutes=?, schedule_input=? WHERE id=?',
      input.name, input.description || '', JSON.stringify(steps), input.channelId || null, sched, input.scheduleInput || '', wid);
  } else {
    wid = id('wf_');
    run('INSERT INTO workflows(id, name, description, steps_json, channel_id, schedule_minutes, schedule_input, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      wid, input.name, input.description || '', JSON.stringify(steps), input.channelId || null, sched, input.scheduleInput || '', user?.id ?? null, now());
  }
  audit('user', user?.id, 'workflow.save', wid, {});
  emit('workflow.updated', { workflowId: wid });
  return getWorkflow(wid);
}

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
    const vars = { input, prev: input };
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
          if (m.status !== 'done') throw new Error(`Step ${idx} (@${agent.handle}) failed: ${m.meta?.error || 'error'}`);
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

// Minute-level scheduler for recurring workflows.
let timer;
export function startScheduler() {
  clearInterval(timer);
  timer = setInterval(() => {
    for (const wf of listWorkflows()) {
      if (!wf.scheduleMinutes || !wf.channelId) continue;
      if (wf.lastRunAt && Date.now() - wf.lastRunAt < wf.scheduleMinutes * 60_000) continue;
      try { startWorkflow(wf.id, { input: wf.scheduleInput }); } catch (e) { console.warn('[scheduler]', wf.name, e.message); }
    }
  }, 60_000);
  timer.unref?.();
}

export const WORKFLOW_TEMPLATES = [
  {
    key: 'research-report', name: '深度研究報告 Deep research report',
    description: 'Research → critique → polished report artifact.',
    steps: [
      { handle: 'researcher', instruction: 'Research this topic thoroughly and list key findings with sources: {{input}}' },
      { handle: 'critic', instruction: 'Review the research above. Point out gaps, weak sources and missing angles.' },
      { handle: 'writer', instruction: 'Write the final research report as an artifact of type "research", incorporating the critique. Topic: {{input}}' },
    ],
  },
  {
    key: 'pitch-deck', name: '簡報產生器 Pitch deck',
    description: 'Plan → numbers → slide deck.',
    steps: [
      { handle: 'lead', instruction: 'Outline the storyline (8–10 slides) for a presentation about: {{input}}. Do not delegate; just produce the outline.' },
      { handle: 'analyst', instruction: 'Add the key numbers, market sizing and metrics the outline needs. Be explicit about assumptions.' },
      { handle: 'designer', instruction: 'Build the final deck as a "slides" artifact from the outline and numbers above.' },
    ],
  },
  {
    key: 'kpi-dashboard', name: 'KPI 儀表板 KPI dashboard',
    description: 'Turn pasted data or a description into a dashboard.',
    steps: [
      { handle: 'analyst', instruction: 'Create a dashboard artifact (type "dashboard") for: {{input}}. Include KPIs, 2–4 charts and a short notes section.' },
    ],
  },
  {
    key: 'landing-page', name: '產品網站 Landing page',
    description: 'Copywriting and design in parallel, then a finished website.',
    steps: [
      { handle: 'writer', instruction: 'Write landing-page copy (hero, benefits, social proof, FAQ, CTA) for: {{input}}', parallel: true },
      { handle: 'critic', instruction: 'List the 5 most important things a landing page for this must get right: {{input}}', parallel: true },
      { handle: 'designer', instruction: 'Build the landing page as a "website" artifact using the copy and checklist above.' },
    ],
  },
];
