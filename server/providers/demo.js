// Offline demo provider: lets you try the whole workspace with zero setup,
// and powers the automated tests. It produces deterministic, feature-exercising replies.
export const demo = {
  type: 'demo',
  label: 'Demo (offline, no key)',
  kind: 'local',
  needsKey: false,
  defaultModel: 'demo',
  fallbackModels: ['demo'],

  async listModels() { return ['demo']; },
  async test() { return 'ok'; },

  async *stream(_p, { system, messages }) {
    const last = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const name = /You are "([^"]+)"/.exec(system || '')?.[1] || 'Agent';
    const ask = last.split('\n').filter(Boolean).pop()?.replace(/^\[[^\]]+\]:\s*/, '').slice(0, 200) || '';
    let out;
    const revise = /Revise the existing artifact titled "([^"]+)" \(type (\w+)\)/.exec(system || '');
    if (revise) {
      const current = /<current_artifact>\n([\s\S]*?)\n<\/current_artifact>/.exec(system)?.[1] || '';
      const changed = revise[2] === 'website'
        ? current.replace(/<body([^>]*)>/i, '<body$1><div style="background:#16a34a;color:#fff;padding:8px;text-align:center">✓ Revised by demo agent</div>')
        : `${current}\n\n_(revised by demo agent)_`;
      out = `Updated.\n\n\`\`\`artifact type="${revise[2]}" title="${revise[1]}"\n${changed}\n\`\`\`\n\n- Applied the requested changes`;
    } else if (/Summarize|摘要/.test(system || '') && /conversation/i.test(system || '')) {
      out = `Summary: ${ask.slice(0, 120)}`;
    } else if (/Extract durable facts/.test(system || '')) {
      out = '[]';
    } else if (/Pick the best agent/.test(system || '')) {
      out = /"handle":"([^"]+)"/.exec(last)?.[1] || 'none';
    } else if (/簡報|slides/i.test(ask)) {
      out = `${name} here — I drafted a deck for you.\n\n\`\`\`artifact type="slides" title="Demo deck"\n# ${ask}\n\n---\n\n## Key points\n- Point one\n- Point two\n\n---\n\n## Next steps\n- Review with the team\n\`\`\``;
    } else if (/dashboard|儀表板/i.test(ask)) {
      out = `Here is a dashboard.\n\n\`\`\`artifact type="dashboard" title="Demo dashboard"\n{"title":"Demo","kpis":[{"label":"Users","value":"1,204","delta":"+12%"}],"charts":[{"type":"bar","title":"Weekly","labels":["Mon","Tue","Wed"],"series":[{"name":"Visits","data":[3,7,5]}]}]}\n\`\`\``;
    } else if (/網頁|website|html|landing/i.test(ask)) {
      out = `Building a page for you — watch it render live.\n\n\`\`\`artifact type="website" title="Demo page"\n<!doctype html><html><head><meta charset="utf-8"><title>Demo</title><style>body{margin:0;font-family:system-ui;background:linear-gradient(135deg,#fdf2f8,#eef2ff);color:#1f2330}header{padding:72px 24px;text-align:center}.pill{display:inline-block;background:#f9a8d4;color:#fff;border-radius:999px;padding:6px 18px;letter-spacing:.2em;font-size:12px}h1{font:600 48px Georgia,serif;margin:18px 0}em{color:#c084fc}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;max-width:900px;margin:0 auto;padding:0 24px 60px}.card{background:#fff;border-radius:18px;padding:20px;box-shadow:0 8px 30px rgba(0,0,0,.06)}</style></head><body><header><span class="pill">DEMO PLAN</span><h1>Your <em>4-Week</em> Plan</h1><p>${ask.replace(/[<>]/g, '')}</p></header><section class="grid"><div class="card"><h3>Week 1</h3><p>Gentle start</p></div><div class="card"><h3>Week 2</h3><p>Build habits</p></div><div class="card"><h3>Week 3</h3><p>Level up</p></div><div class="card"><h3>Week 4</h3><p>Celebrate</p></div></section></body></html>\n\`\`\`\n\n\`\`\`suggest\nAdd a printable weekly checklist\nMake a dark-mode version\n\`\`\``;
    } else if (/任務|tasks?\b|分派/i.test(ask)) {
      out = `Here is the plan.\n\n\`\`\`task assignee="@writer" due="2026-12-01"\nDraft the announcement\n\`\`\`\n\`\`\`task assignee="@designer"\nDesign the launch page\n\`\`\``;
    } else if (/記住|remember/i.test(ask)) {
      out = `Got it, I'll remember that.\n\n\`\`\`remember\n${ask}\n\`\`\``;
    } else {
      out = `**${name}** (demo mode): I received “${ask}”. Connect a real provider in Settings → Providers to get real answers.\n\n\`\`\`suggest\nTry: build a website\nTry: split this into tasks\n\`\`\``;
    }
    const slow = out.length > 600; // long outputs stream visibly so live previews can be seen
    for (const piece of out.match(/[\s\S]{1,12}/g) || []) {
      if (slow) await new Promise((r) => setTimeout(r, 12));
      yield { type: 'text', text: piece };
    }
    yield { type: 'usage', input: Math.ceil(last.length / 4), output: Math.ceil(out.length / 4) };
  },
};
