// Small, safe Markdown → HTML renderer shared by the browser and the server.
// All raw HTML is escaped; only http(s)/mailto links and relative anchors are emitted.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const safeUrl = (u) => (/^(https?:|mailto:|#|\/)/i.test(u.trim()) ? u.trim() : '#');

export function inline(text, opts = {}) {
  const stash = [];
  const put = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  let s = String(text).replace(/`([^`\n]+)`/g, (_, c) => put(`<code>${esc(c)}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => put(`<img alt="${esc(alt)}" src="${esc(safeUrl(url))}" loading="lazy">`));
  s = s.replace(/(^|[\s(（：:])(\/media\/[A-Za-z0-9_-]{20,}\.(?:mp4|webm))(?=$|[\s)）。，,.])/gm, (_, pre, url) => pre + put(`<video class="md-video" controls preload="metadata" playsinline src="${esc(url)}"></video>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => put(`<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`));
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>)\]]+)/g, (_, pre, url) => pre + put(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`));
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  if (opts.mentions) s = s.replace(/(?<![A-Za-z0-9_.+-])@([\p{L}\p{N}_-]+)/gu, (_, h) => `<span class="mention" data-handle="${h}">@${h}</span>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
}

export function markdown(src, opts = {}) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join('\n'), opts).replace(/\n/g, '<br>')}</p>`); para.length = 0; } };

  while (i < lines.length) {
    const line = lines[i];
    let m;
    if ((m = /^(\s*)(```|~~~)\s*([^\s`]*)(.*)$/.exec(line))) {
      flush();
      const fence = m[2], lang = m[3];
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) buf.push(lines[i++]);
      i++;
      if (opts.fence) { const r = opts.fence(lang, buf.join('\n'), m[4]); if (r != null) { out.push(r); continue; } }
      out.push(`<pre><code${lang ? ` class="lang-${esc(lang)}"` : ''}>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { flush(); out.push(`<h${m[1].length}>${inline(m[2], opts)}</h${m[1].length}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${markdown(buf.join('\n'), opts)}</blockquote>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${inline(h, opts)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, opts)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const l = lines[i++];
        if (/^\s*([-*+]|\d+[.)])\s+/.test(l) && !/^\s{2,}/.test(l)) items.push([l.replace(/^\s*([-*+]|\d+[.)])\s+/, '')]);
        else items[items.length - 1].push(l.replace(/^\s{2,4}/, ''));
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map(([first, ...rest]) => {
        const task = /^\[( |x)\]\s+/i.exec(first);
        const head = task ? `<input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(first.slice(task[0].length), opts)}` : inline(first, opts);
        return `<li>${head}${rest.length ? markdown(rest.join('\n'), opts) : ''}</li>`;
      }).join('')}</${tag}>`);
      continue;
    }
    para.push(line);
    i++;
  }
  flush();
  return out.join('\n');
}
