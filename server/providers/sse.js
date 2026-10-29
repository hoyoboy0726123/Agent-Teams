// Minimal streaming helpers shared by HTTP providers.

// Parse a text/event-stream body into { event, data } records.
export async function* sse(res) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
      let event = 'message';
      const data = [];
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length) yield { event, data: data.join('\n') };
    }
  }
}

// Parse a newline-delimited JSON body (Ollama).
export async function* ndjson(res) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buf.trim()) yield JSON.parse(buf);
}

export async function httpError(res, label) {
  let body = '';
  try { body = await res.text(); } catch {}
  let msg = body;
  try { const j = JSON.parse(body); msg = j.error?.message || j.error || j.message || body; } catch {}
  const err = new Error(`${label} ${res.status}: ${String(msg).slice(0, 400)}`);
  err.status = res.status;
  return err;
}
