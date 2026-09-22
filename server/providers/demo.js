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
    if (/Summarize|摘要/.test(system || '') && /conversation/i.test(system || '')) {
      out = `Summary: ${ask.slice(0, 120)}`;
    } else if (/Extract durable facts/.test(system || '')) {
      out = '[]';
    } else if (/Pick the best agent/.test(system || '')) {
      out = /"handle":"([^"]+)"/.exec(last)?.[1] || 'none';
    } else if (/簡報|slides/i.test(ask)) {
      out = `${name} here — I drafted a deck for you.\n\n\`\`\`artifact type="slides" title="Demo deck"\n# ${ask}\n\n---\n\n## Key points\n- Point one\n- Point two\n\n---\n\n## Next steps\n- Review with the team\n\`\`\``;
    } else if (/dashboard|儀表板/i.test(ask)) {
      out = `Here is a dashboard.\n\n\`\`\`artifact type="dashboard" title="Demo dashboard"\n{"title":"Demo","kpis":[{"label":"Users","value":"1,204","delta":"+12%"}],"charts":[{"type":"bar","title":"Weekly","labels":["Mon","Tue","Wed"],"series":[{"name":"Visits","data":[3,7,5]}]}]}\n\`\`\``;
    } else if (/記住|remember/i.test(ask)) {
      out = `Got it, I'll remember that.\n\n\`\`\`remember\n${ask}\n\`\`\``;
    } else {
      out = `**${name}** (demo mode): I received “${ask}”. Connect a real provider in Settings → Providers to get real answers.`;
    }
    for (const piece of out.match(/[\s\S]{1,12}/g) || []) yield { type: 'text', text: piece };
    yield { type: 'usage', input: Math.ceil(last.length / 4), output: Math.ceil(out.length / 4) };
  },
};
