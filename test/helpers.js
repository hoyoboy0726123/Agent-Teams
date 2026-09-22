// Boots an isolated server (in-memory DB, demo provider only) for integration tests.
process.env.AGENT_TEAMS_DB = ':memory:';
process.env.AGENT_TEAMS_NO_DETECT = '1';

export async function boot() {
  const { createApp } = await import('../server/index.js');
  const server = createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '';
    const call = async (method, path, body) => {
      const res = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json', cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, data, headers: res.headers };
    };
    return { call, get cookie() { return cookie; } };
  };
  return { server, base, client, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}

export async function waitFor(fn, { timeout = 5000, every = 30 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, every));
  }
}
