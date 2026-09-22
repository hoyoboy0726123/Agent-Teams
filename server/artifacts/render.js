// Render artifacts to standalone HTML pages (used for preview iframes and downloads).
import { markdown, esc } from '../../web/md.js';

const BASE_CSS = `
:root{--bg:#fff;--fg:#1f2330;--muted:#667085;--line:#e6e8ee;--accent:#6366f1;--card:#f7f8fb}
@media (prefers-color-scheme:dark){:root{--bg:#12141a;--fg:#e8eaf0;--muted:#98a2b3;--line:#2a2e39;--card:#1a1d25}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,-apple-system,"Segoe UI","Noto Sans TC","PingFang TC",sans-serif}
a{color:var(--accent)}code{background:var(--card);padding:.1em .35em;border-radius:4px;font-size:.9em}
pre{background:var(--card);padding:14px;border-radius:8px;overflow:auto}pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%}th,td{border:1px solid var(--line);padding:6px 10px;text-align:left}th{background:var(--card)}
.table-wrap{overflow-x:auto}blockquote{border-left:3px solid var(--accent);margin:0;padding:2px 14px;color:var(--muted)}img{max-width:100%}
`;

const page = (title, body, css = '', js = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${BASE_CSS}${css}</style></head><body>${body}${js ? `<script>${js}</script>` : ''}</body></html>`;

function renderDocument(a) {
  return page(a.title, `<article style="max-width:820px;margin:0 auto;padding:40px 24px 80px">${markdown(a.content)}</article>`);
}

function renderSlides(a) {
  const slides = a.content.split(/\n-{3,}\s*\n/).map((s) => {
    const [body, notes = ''] = s.split(/\n(?:Note|Notes|備註):\s*/i);
    return { body: markdown(body.trim()), notes: esc(notes.trim()) };
  });
  const css = `
body{overflow:hidden;height:100vh}.deck{height:100vh;display:flex;align-items:center;justify-content:center}
.slide{display:none;width:min(1100px,94vw);aspect-ratio:16/9;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:5% 7%;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.12)}
.slide.on{display:flex;flex-direction:column;justify-content:center}.slide h1{font-size:2.6em;margin:.2em 0;line-height:1.15}.slide h2{font-size:1.9em;color:var(--accent);margin:.2em 0 .5em}
.slide li{font-size:1.25em;margin:.35em 0}.bar{position:fixed;bottom:14px;left:0;right:0;display:flex;gap:10px;justify-content:center;align-items:center;color:var(--muted);font-size:14px}
.bar button{border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:8px;padding:4px 12px;cursor:pointer}
.notes{position:fixed;top:10px;right:14px;max-width:320px;font-size:13px;color:var(--muted);display:none}.show-notes .notes{display:block}
@media print{body{overflow:visible;height:auto}.deck{display:block;height:auto}.slide{display:flex!important;page-break-after:always;box-shadow:none;margin:0 auto 20px}.bar,.notes{display:none!important}}`;
  const body = `<div class="deck">${slides.map((s, i) => `<section class="slide${i ? '' : ' on'}">${s.body}</section>`).join('')}</div>
<div class="notes" id="notes"></div>
<div class="bar"><button id="prev">←</button><span id="n"></span><button id="next">→</button><button id="nt">Notes</button><button onclick="print()">PDF</button></div>`;
  const js = `const S=[...document.querySelectorAll('.slide')],N=${JSON.stringify(slides.map((s) => s.notes))};let i=0;
function go(k){i=Math.max(0,Math.min(S.length-1,k));S.forEach((s,j)=>s.classList.toggle('on',j===i));n.textContent=(i+1)+' / '+S.length;notes.innerHTML=N[i]||''}
prev.onclick=()=>go(i-1);next.onclick=()=>go(i+1);nt.onclick=()=>document.body.classList.toggle('show-notes');
addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key))go(i+1);if(['ArrowLeft','PageUp'].includes(e.key))go(i-1)});go(0)`;
  return page(a.title, body, css, js);
}

const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#ec4899', '#8b5cf6', '#14b8a6'];

function chartSvg(c) {
  const labels = c.labels || [];
  const series = (c.series || []).map((s) => ({ name: s.name || '', data: (s.data || []).map(Number) }));
  const W = 520, H = 260, P = { l: 44, r: 12, t: 12, b: 36 };
  if (c.type === 'pie') {
    const data = series[0]?.data || [];
    const total = data.reduce((a, b) => a + (b > 0 ? b : 0), 0) || 1;
    let ang = -Math.PI / 2;
    const cx = 130, cy = 130, r = 110;
    const arcs = data.map((v, i) => {
      const a0 = ang, a1 = ang + (Math.max(v, 0) / total) * Math.PI * 2;
      ang = a1;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      return `<path d="M${cx},${cy} L${p(a0)} A${r},${r} 0 ${large} 1 ${p(a1)} Z" fill="${PALETTE[i % PALETTE.length]}"><title>${esc(labels[i])}: ${v}</title></path>`;
    }).join('');
    const legend = labels.map((l, i) => `<g transform="translate(270,${24 + i * 22})"><rect width="12" height="12" rx="3" fill="${PALETTE[i % PALETTE.length]}"/><text x="18" y="11" font-size="13" fill="currentColor">${esc(l)} (${Math.round(((data[i] || 0) / total) * 100)}%)</text></g>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}">${arcs}${legend}</svg>`;
  }
  const values = series.flatMap((s) => s.data);
  const max = Math.max(0, ...values), min = Math.min(0, ...values);
  const span = max - min || 1;
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const y = (v) => P.t + ih - ((v - min) / span) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * span);
  let g = ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" stroke="currentColor" opacity=".12"/><text x="${P.l - 6}" y="${y(t) + 4}" font-size="11" text-anchor="end" fill="currentColor" opacity=".6">${+t.toFixed(2)}</text>`).join('');
  const step = iw / Math.max(labels.length, 1);
  g += labels.map((l, i) => `<text x="${P.l + step * i + step / 2}" y="${H - 12}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".7">${esc(String(l).slice(0, 12))}</text>`).join('');
  if (c.type === 'line') {
    g += series.map((s, si) => {
      const pts = s.data.map((v, i) => `${P.l + step * i + step / 2},${y(v)}`);
      return `<polyline fill="none" stroke="${PALETTE[si % PALETTE.length]}" stroke-width="2.5" points="${pts.join(' ')}"/>${s.data.map((v, i) => `<circle cx="${P.l + step * i + step / 2}" cy="${y(v)}" r="3.5" fill="${PALETTE[si % PALETTE.length]}"><title>${esc(s.name)} ${esc(labels[i])}: ${v}</title></circle>`).join('')}`;
    }).join('');
  } else {
    const bw = (step * 0.75) / Math.max(series.length, 1);
    g += series.map((s, si) => s.data.map((v, i) => {
      const x = P.l + step * i + step * 0.125 + bw * si;
      return `<rect x="${x}" y="${Math.min(y(v), y(0))}" width="${Math.max(bw - 2, 1)}" height="${Math.abs(y(v) - y(0))}" rx="3" fill="${PALETTE[si % PALETTE.length]}"><title>${esc(s.name)} ${esc(labels[i])}: ${v}</title></rect>`;
    }).join('')).join('');
  }
  const legend = series.length > 1 ? `<div class="legend">${series.map((s, i) => `<span><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}">${g}</svg>${legend}`;
}

export function parseDashboard(content) {
  const src = String(content).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  return JSON.parse(src);
}

function renderDashboard(a) {
  let d;
  try { d = parseDashboard(a.content); } catch (e) {
    return page(a.title, `<main style="padding:32px"><h2>${esc(a.title)}</h2><p>Dashboard JSON could not be parsed: ${esc(e.message)}</p><pre>${esc(a.content)}</pre></main>`);
  }
  const css = `main{max-width:1180px;margin:0 auto;padding:28px 20px 60px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:18px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}.kpi .v{font-size:1.9em;font-weight:700}.kpi .l{color:var(--muted);font-size:.9em}
.kpi .d{font-size:.85em;font-weight:600}.up{color:#10b981}.down{color:#ef4444}.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr));gap:14px}
.card h3{margin:0 0 8px;font-size:1em}.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--muted)}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}`;
  const kpis = (d.kpis || []).map((k) => {
    const delta = String(k.delta ?? '');
    return `<div class="card kpi"><div class="l">${esc(k.label)}</div><div class="v">${esc(k.value)}</div>${delta ? `<div class="d ${delta.trim().startsWith('-') ? 'down' : 'up'}">${esc(delta)}</div>` : ''}</div>`;
  }).join('');
  const charts = (d.charts || []).map((c) => `<div class="card"><h3>${esc(c.title || '')}</h3>${chartSvg(c)}</div>`).join('');
  const table = d.table ? `<div class="card" style="margin-top:14px"><div class="table-wrap"><table><thead><tr>${(d.table.columns || []).map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(d.table.rows || []).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>` : '';
  const notes = d.notes ? `<div class="card" style="margin-top:14px">${markdown(d.notes)}</div>` : '';
  return page(a.title, `<main><h1 style="margin:0">${esc(d.title || a.title)}</h1><div class="kpis">${kpis}</div><div class="charts">${charts}</div>${table}${notes}</main>`, css);
}

function renderWebsite(a) {
  const src = String(a.content).trim().replace(/^```(?:html)?\s*|\s*```$/g, '');
  if (/<html[\s>]/i.test(src) || /<!doctype/i.test(src)) return src;
  return page(a.title, src);
}

export function renderArtifact(a) {
  switch (a.type) {
    case 'slides': return renderSlides(a);
    case 'dashboard': return renderDashboard(a);
    case 'website': return renderWebsite(a);
    default: return renderDocument(a);
  }
}

export const downloadName = (a) => `${a.title.replace(/[^\p{L}\p{N}_ -]/gu, '').trim().replace(/\s+/g, '-') || 'artifact'}.${a.type === 'document' || a.type === 'research' ? 'md' : 'html'}`;
