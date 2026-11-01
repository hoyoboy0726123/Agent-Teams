#!/usr/bin/env node
// Stand-in for the `claude` CLI in tests: prints stream-json. With --tools WebSearch,WebFetch
// it "searches" first; otherwise it reports that no search tools were available.
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('9.9.9 (fake)'); process.exit(0); }
const tools = args[args.indexOf('--tools') + 1];
const out = (o) => console.log(JSON.stringify(o));
const delta = (text) => out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
let input = '';
process.stdin.on('data', (d) => { input += d; }).on('end', () => {
  if (tools === 'WebSearch,WebFetch' && args.includes('--allowedTools') && /built-in web tools/.test(args[args.indexOf('--system-prompt') + 1] || '')) {
    delta('Let me check.');
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu_1', name: 'WebSearch', input: { query: 'node lts' } }] } });
    out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: [{ type: 'text', text: 'Node.js 24 is the active LTS' }] }] } });
    delta('Node.js 24 is the active LTS ([nodejs.org](https://nodejs.org)).');
  } else {
    delta(`NO SEARCH (tools=${JSON.stringify(tools)})`);
  }
  out({ type: 'result', subtype: 'success', is_error: false, result: '', usage: { input_tokens: 10, output_tokens: 5 } });
});
