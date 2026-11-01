// Line-based three-way merge, so two people (or a person and an agent) editing the same
// artifact from the same starting version don't silently overwrite each other.

// Hunks turning a into b: [{ start, end, lines }] — a[start:end] is replaced by `lines`.
export function diffLines(a, b) {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf);
  const B = b.slice(pre, b.length - suf);
  if (!A.length && !B.length) return [];
  // Large, unrelated middles: one replacement hunk instead of a quadratic LCS.
  if (!A.length || !B.length || A.length * B.length > 4_000_000) return [{ start: pre, end: pre + A.length, lines: B }];
  // LCS table (suffix lengths), then walk it to emit hunks.
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hunks = [];
  let i = 0, j = 0, cur = null;
  const flush = () => { if (cur) { hunks.push(cur); cur = null; } };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { flush(); i++; j++; continue; }
    cur ||= { start: pre + i, end: pre + i, lines: [] };
    if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { cur.lines.push(B[j]); j++; }
    else { i++; cur.end = pre + i; }
  }
  flush();
  return hunks;
}

// Merge `ours` and `theirs`, both edited from `base`.
// Returns { ok, text, conflicts } — on conflict, `text` carries git-style markers.
export function merge3(base, ours, theirs, { oursLabel = 'yours', theirsLabel = 'latest', prefer = null } = {}) {
  if (ours === theirs) return { ok: true, text: ours, conflicts: 0 };
  if (base === theirs) return { ok: true, text: ours, conflicts: 0 };
  if (base === ours) return { ok: true, text: theirs, conflicts: 0 };
  const b = base.split('\n'), o = ours.split('\n'), t = theirs.split('\n');
  const all = [
    ...diffLines(b, o).map((h) => ({ ...h, side: 'o' })),
    ...diffLines(b, t).map((h) => ({ ...h, side: 't' })),
  ].sort((x, y) => x.start - y.start || x.end - y.end);

  // Group hunks whose base ranges overlap (insertions at the same point count as overlapping).
  const groups = [];
  for (const h of all) {
    const g = groups.at(-1);
    if (g && (h.start < g.end || (h.start === g.end && (h.start === h.end || g.start === g.end)))) {
      g.hunks.push(h);
      g.end = Math.max(g.end, h.end);
    } else groups.push({ start: h.start, end: h.end, hunks: [h] });
  }

  // Text of base[start:end] after applying one side's hunks from this group.
  const sideText = (g, side) => {
    const out = [];
    let pos = g.start;
    for (const h of g.hunks.filter((x) => x.side === side)) {
      out.push(...b.slice(pos, h.start), ...h.lines);
      pos = h.end;
    }
    out.push(...b.slice(pos, g.end));
    return out;
  };

  const out = [];
  let pos = 0, conflicts = 0;
  for (const g of groups) {
    out.push(...b.slice(pos, g.start));
    const sides = new Set(g.hunks.map((h) => h.side));
    if (sides.size === 1) out.push(...sideText(g, [...sides][0]));
    else {
      const O = sideText(g, 'o'), T = sideText(g, 't');
      if (O.join('\n') === T.join('\n')) out.push(...O);
      else if (prefer) out.push(...(prefer === 'ours' ? O : T));
      else {
        conflicts++;
        out.push(`<<<<<<< ${oursLabel}`, ...O, '=======', ...T, `>>>>>>> ${theirsLabel}`);
      }
    }
    pos = g.end;
  }
  out.push(...b.slice(pos));
  return { ok: conflicts === 0, text: out.join('\n'), conflicts };
}
