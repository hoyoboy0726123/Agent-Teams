// Sentence templates, so the same thing reads differently every time.
//
//   {a|b|c}      pick one alternative at random; alternatives nest ({after work|{on weekends|on Saturdays}}) and may
//                be empty ({|really })
//   {name}       a variable from `vars` (a string, a number, or a function returning one)
// A variable that is missing stays as {name} in the text, so the tests that look for braces catch it without the
// game ever crashing.
function closing(t, i) {
  let depth = 0;
  for (let j = i; j < t.length; j++) {
    if (t[j] === "{") depth++;
    else if (t[j] === "}" && --depth === 0) return j;
  }
  return -1;
}

function alternatives(inner) {
  const parts = [];
  let depth = 0, start = 0;
  for (let j = 0; j < inner.length; j++) {
    const c = inner[j];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "|" && depth === 0) { parts.push(inner.slice(start, j)); start = j + 1; }
  }
  parts.push(inner.slice(start));
  return parts;
}

export function expand(template, vars = {}, rng = Math.random) {
  let out = "";
  for (let i = 0; i < template.length;) {
    if (template[i] !== "{") { out += template[i++]; continue; }
    const end = closing(template, i);
    if (end < 0) { out += template.slice(i); break; }
    const inner = template.slice(i + 1, end), parts = alternatives(inner);
    if (parts.length > 1) out += expand(parts[Math.floor(rng() * parts.length)], vars, rng);
    else if (/^\w+$/.test(inner)) {
      const v = vars[inner];
      out += v === undefined || v === null ? `{${inner}}` : String(typeof v === "function" ? v() : v);
    } else out += expand(inner, vars, rng);
    i = end + 1;
  }
  return out;
}

// How many different sentences a template can make (for the variety tests).
export function variants(template) {
  let count = 1;
  for (let i = 0; i < template.length;) {
    if (template[i] !== "{") { i++; continue; }
    const end = closing(template, i);
    if (end < 0) break;
    const parts = alternatives(template.slice(i + 1, end));
    if (parts.length > 1) count *= parts.reduce((s, p) => s + variants(p), 0);
    i = end + 1;
  }
  return count;
}

// English tidying after expansion: an empty alternative can leave a double space or a space before punctuation, and
// a sentence after a full stop can start with a lowercase word. Capitalises each sentence after the first; with
// `first`, the first one too (a fragment such as "and then…" is left alone otherwise, for code that joins lines).
export function tidy(text, { first = false } = {}) {
  const t = String(text)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/([.!?]["”’)]?\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());
  return first ? cap(t) : t;
}
export const cap = text => (text ? text[0].toUpperCase() + text.slice(1) : "");
