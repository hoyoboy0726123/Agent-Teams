// Language-agnostic lexical retrieval (BM25). CJK text is indexed as character bigrams
// so Chinese/Japanese/Korean work without a word segmenter.
const CJK = /[぀-ヿ㐀-鿿가-힯豈-﫿]/;
const STOP = new Set('the a an and or of to in on for is are was were be been it this that with as at by from we you i our your my me they them he she his her its do does did not no yes can could would should will just so if then than there here what which who how why when 的 了 是 在 我 你 他 她 它 們 和 與 也 就 都 而 及 或 一個'.split(' '));

export function tokenize(text) {
  const out = [];
  const lower = String(text || '').toLowerCase();
  for (const m of lower.matchAll(/[\p{L}\p{N}_]+/gu)) {
    const w = m[0];
    if (CJK.test(w)) {
      const chars = [...w].filter((c) => CJK.test(c) || /[a-z0-9]/.test(c));
      if (chars.length === 1) out.push(chars[0]);
      for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
    } else if (w.length > 1 && !STOP.has(w)) {
      out.push(w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);
    }
  }
  return out;
}

// docs: [{ id, text, ...rest }] → [{ ...doc, score }] sorted desc (score > 0 only).
export function bm25(query, docs, { k1 = 1.2, b = 0.75 } = {}) {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !docs.length) return [];
  const toks = docs.map((d) => tokenize(d.text));
  const avg = toks.reduce((s, t) => s + t.length, 0) / toks.length || 1;
  const df = new Map();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length;
  return docs
    .map((d, i) => {
      const tf = new Map();
      for (const w of toks[i]) tf.set(w, (tf.get(w) || 0) + 1);
      let score = 0;
      for (const w of q) {
        const f = tf.get(w);
        if (!f) continue;
        const idf = Math.log(1 + (N - df.get(w) + 0.5) / (df.get(w) + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks[i].length) / avg)));
      }
      return { ...d, score };
    })
    .filter((d) => d.score > 0)
    .sort((a, b2) => b2.score - a.score);
}

// Jaccard similarity over token sets — used to de-duplicate memories.
export function similarity(a, b) {
  const A = new Set(tokenize(a)), B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
