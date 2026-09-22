// Export slide decks and dashboards as real, editable PowerPoint files (.pptx).
// Dashboards become KPI slides plus native (editable) PowerPoint charts.
import PptxGenJS from 'pptxgenjs';
import { parseDashboard } from './render.js';

const ACCENT = '6366F1';
const INK = '1F2330';
const MUTED = '667085';
const PALETTE = ['6366F1', '10B981', 'F59E0B', 'EF4444', '0EA5E9', 'EC4899', '8B5CF6', '14B8A6'];
const FONT = 'Microsoft JhengHei';
const W = 13.333, H = 7.5;

// Strip inline markdown down to plain text.
export const plain = (s) => String(s)
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2')
  .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/~~([^~]+)~~/g, '$1')
  .trim();

// Markdown slide → { title, subtitle, blocks: [{kind:'bullets'|'para'|'table'|'code', ...}] }
export function parseSlide(md) {
  const lines = md.split('\n');
  const slide = { title: '', level: 0, blocks: [] };
  let i = 0;
  const bullets = [];
  const flushBullets = () => { if (bullets.length) { slide.blocks.push({ kind: 'bullets', items: bullets.splice(0) }); } };
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) { i++; continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      flushBullets();
      if (!slide.title) { slide.title = plain(m[2]); slide.level = m[1].length; }
      else slide.blocks.push({ kind: 'heading', text: plain(m[2]) });
      i++;
      continue;
    }
    if (/^\s*(```|~~~)/.test(line)) {
      flushBullets();
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*(```|~~~)/.test(lines[i])) buf.push(lines[i++]);
      i++;
      slide.blocks.push({ kind: 'code', text: buf.join('\n') });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushBullets();
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|?\s*:?-{2,}/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => plain(c)));
        i++;
      }
      slide.blocks.push({ kind: 'table', rows });
      continue;
    }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line))) {
      bullets.push({ text: plain(m[3].replace(/^\[( |x)\]\s+/i, '')), indent: Math.min(Math.floor(m[1].replace(/\t/g, '  ').length / 2), 3), numbered: /\d/.test(m[2]) });
      i++;
      continue;
    }
    flushBullets();
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*([-*+]|\d+[.)])\s|\s*\||\s*```)/.test(lines[i])) para.push(plain(lines[i++].replace(/^>\s?/, '')));
    slide.blocks.push({ kind: 'para', text: para.join(' ') });
  }
  flushBullets();
  return slide;
}

export function splitDeck(content) {
  return String(content).split(/\n-{3,}\s*\n/).map((s) => {
    const [body, notes = ''] = s.split(/\n(?:Note|Notes|備註|講者備註)[:：]\s*/i);
    return { body: body.trim(), notes: notes.trim() };
  }).filter((s) => s.body);
}

function newDeck(title) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = title;
  pptx.company = 'Agent Teams';
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  pptx.defineSlideMaster({
    title: 'CONTENT',
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 0, w: 0.18, h: H, fill: { color: ACCENT } } },
      { line: { x: 0.6, y: H - 0.55, w: W - 1.2, h: 0, line: { color: 'E6E8EE', width: 0.75 } } },
      { text: { text: title, options: { x: 0.6, y: H - 0.5, w: 8, h: 0.35, fontFace: FONT, fontSize: 10, color: MUTED } } },
    ],
    slideNumber: { x: W - 1.1, y: H - 0.5, w: 0.6, h: 0.35, fontFace: FONT, fontSize: 10, color: MUTED, align: 'right' },
  });
  return pptx;
}

function titleSlide(pptx, title, subtitle) {
  const s = pptx.addSlide();
  s.background = { color: '1E1B4B' };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.35, w: W, h: 0.35, fill: { color: ACCENT } });
  s.addText(title, { x: 0.9, y: 2.3, w: W - 1.8, h: 1.8, fontFace: FONT, fontSize: 44, bold: true, color: 'FFFFFF', valign: 'bottom', fit: 'shrink' });
  if (subtitle) s.addText(subtitle, { x: 0.9, y: 4.25, w: W - 1.8, h: 1.0, fontFace: FONT, fontSize: 20, color: 'C7D2FE', valign: 'top', fit: 'shrink' });
  return s;
}

// Rough text metrics (inches) so layout can wrap CJK and Latin text without overlaps.
const charW = (ch, fs) => (/[⺀-￯]/.test(ch) ? 1 : /[A-Z0-9%$]/.test(ch) ? 0.62 : 0.52) * fs / 72;
const textWidth = (str, fs) => { let w = 0; for (const ch of String(str)) w += charW(ch, fs); return w; };
const wrapLines = (str, fs, width) => String(str).split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(textWidth(part, fs) / Math.max(width, 0.5))), 0);
const lineH = (fs) => (fs / 72) * 1.3;

const BODY_X = 0.75, BODY_W = W - 1.5, TOP = 1.4, BOTTOM = H - 0.75, GAP = 0.18;

function tableLayout(rows, fs, width) {
  const cols = Math.max(...rows.map((r) => r.length));
  const want = Array.from({ length: cols }, (_, c) => Math.min(Math.max(...rows.map((r) => textWidth(r[c] ?? '', fs))) + 0.3, width * 0.55));
  const minW = Math.min(1.1, width / cols);
  const raw = want.map((w) => Math.max(w, minW));
  const scale = width / raw.reduce((a, b) => a + b, 0);
  const colW = raw.map((w) => w * scale);
  const rowH = rows.map((r) => Math.max(...colW.map((cw, c) => wrapLines(r[c] ?? '', fs, cw - 0.2))) * lineH(fs) + 0.14);
  return { colW, rowH, height: rowH.reduce((a, b) => a + b, 0) };
}

function measure(b, fs) {
  if (b.kind === 'bullets') return b.items.reduce((h, it) => h + wrapLines(it.text, it.indent ? fs - 2 : fs, BODY_W - 0.45 - it.indent * 0.4) * lineH(it.indent ? fs - 2 : fs) + (fs / 72) * 0.35, 0) + 0.1;
  if (b.kind === 'heading') return lineH(fs + 2) + 0.08;
  if (b.kind === 'para') return wrapLines(b.text, fs, BODY_W - 0.2) * lineH(fs) + 0.1;
  if (b.kind === 'code') return b.text.split('\n').length * lineH(Math.min(fs - 4, 14)) + 0.25;
  if (b.kind === 'table' && b.rows.length) return tableLayout(b.rows, Math.max(fs - 4, 10), BODY_W).height;
  return 0;
}

function contentSlide(pptx, parsed) {
  const s = pptx.addSlide({ masterName: 'CONTENT' });
  s.addText(parsed.title || '', { x: 0.6, y: 0.35, w: W - 1.2, h: 0.9, fontFace: FONT, fontSize: 30, bold: true, color: INK, valign: 'middle', fit: 'shrink' });
  const blocks = parsed.blocks.filter((b) => b.kind !== 'table' || b.rows.length);
  const room = BOTTOM - TOP;
  // Largest font size at which everything fits.
  let fs = 12;
  for (const size of [24, 22, 20, 18, 17, 16, 15, 14, 13, 12]) {
    const total = blocks.reduce((h, b) => h + measure(b, size), 0) + GAP * Math.max(blocks.length - 1, 0);
    if (total <= room) { fs = size; break; }
  }
  let y = TOP;
  for (const b of blocks) {
    const h = Math.min(measure(b, fs), BOTTOM - y);
    if (h < 0.3) break;
    if (b.kind === 'bullets') {
      s.addText(b.items.map((it) => ({
        text: it.text,
        options: { bullet: it.numbered ? { type: 'number' } : { code: it.indent ? '2013' : '25CF' }, indentLevel: it.indent, fontSize: it.indent ? fs - 2 : fs, color: it.indent ? MUTED : INK, paraSpaceAfter: Math.round(fs * 0.35), breakLine: true },
      })), { x: BODY_X, y, w: BODY_W, h, fontFace: FONT, valign: 'top', margin: 0.05, fit: 'shrink' });
    } else if (b.kind === 'heading') {
      s.addText(b.text, { x: BODY_X, y, w: BODY_W, h, fontFace: FONT, fontSize: fs + 2, bold: true, color: ACCENT, margin: 0.05 });
    } else if (b.kind === 'para') {
      s.addText(b.text, { x: BODY_X, y, w: BODY_W, h, fontFace: FONT, fontSize: fs, color: INK, valign: 'top', margin: 0.05, fit: 'shrink' });
    } else if (b.kind === 'code') {
      s.addText(b.text, { x: BODY_X, y, w: BODY_W, h, fontFace: 'Consolas', fontSize: Math.min(fs - 4, 14), color: INK, fill: { color: 'F4F5F9' }, valign: 'top', fit: 'shrink' });
    } else if (b.kind === 'table') {
      const tfs = Math.max(fs - 4, 10);
      const { colW, rowH } = tableLayout(b.rows, tfs, BODY_W);
      const [head, ...rows] = b.rows;
      s.addTable([
        head.map((c) => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: ACCENT } } })),
        ...rows.map((r, ri) => head.map((_, c) => ({ text: r[c] ?? '', options: { fill: { color: ri % 2 ? 'F7F8FB' : 'FFFFFF' } } }))),
      ], { x: BODY_X, y, w: BODY_W, colW, rowH, fontFace: FONT, fontSize: tfs, color: INK, valign: 'middle', margin: 0.08, border: { type: 'solid', color: 'E6E8EE', pt: 0.75 }, autoPage: false });
    }
    y += h + GAP;
  }
  return s;
}

function deckFromSlides(a) {
  const pptx = newDeck(a.title);
  const deck = splitDeck(a.content);
  deck.forEach(({ body, notes }, idx) => {
    const parsed = parseSlide(body);
    const isTitle = idx === 0 && parsed.level === 1 && parsed.blocks.every((b) => b.kind === 'para' || b.kind === 'heading') && parsed.blocks.length <= 2;
    const s = isTitle
      ? titleSlide(pptx, parsed.title, parsed.blocks.map((b) => b.text).join('\n'))
      : contentSlide(pptx, parsed);
    if (notes) s.addNotes(notes);
  });
  return pptx;
}

const CHART_TYPE = { bar: 'bar', line: 'line', pie: 'pie' };

function deckFromDashboard(a) {
  const d = parseDashboard(a.content);
  const title = d.title || a.title;
  const pptx = newDeck(title);
  titleSlide(pptx, title, d.notes ? plain(d.notes).slice(0, 160) : 'Dashboard');
  if (d.kpis?.length) {
    const s = pptx.addSlide({ masterName: 'CONTENT' });
    s.addText('KPI', { x: 0.6, y: 0.35, w: W - 1.2, h: 0.9, fontFace: FONT, fontSize: 30, bold: true, color: INK });
    const kpis = d.kpis.slice(0, 8);
    const cols = Math.min(kpis.length, 4);
    const nRows = Math.ceil(kpis.length / cols);
    const cw = (W - 1.2 - (cols - 1) * 0.3) / cols;
    const ch = nRows === 1 ? 3.0 : 2.4;
    const top = 1.4 + (BOTTOM - 1.4 - (nRows * ch + (nRows - 1) * 0.3)) / 2;
    kpis.forEach((k, i) => {
      const x = 0.6 + (i % cols) * (cw + 0.3);
      const y = top + Math.floor(i / cols) * (ch + 0.3);
      s.addShape(pptx.ShapeType.roundRect, { x, y, w: cw, h: ch, fill: { color: 'F7F8FB' }, line: { color: 'E6E8EE' }, rectRadius: 0.12 });
      s.addShape(pptx.ShapeType.rect, { x, y: y + 0.25, w: 0.07, h: ch - 0.5, fill: { color: PALETTE[i % PALETTE.length] }, line: { color: PALETTE[i % PALETTE.length] } });
      s.addText(String(k.label ?? ''), { x: x + 0.3, y: y + 0.2, w: cw - 0.5, h: 0.75, fontFace: FONT, fontSize: 15, color: MUTED, valign: 'top', fit: 'shrink' });
      s.addText(String(k.value ?? ''), { x: x + 0.3, y: y + 0.95, w: cw - 0.5, h: 1.1, fontFace: FONT, fontSize: nRows === 1 ? 44 : 36, bold: true, color: INK, fit: 'shrink' });
      const delta = String(k.delta ?? '');
      if (delta) s.addText(delta, { x: x + 0.3, y: y + ch - 0.8, w: cw - 0.5, h: 0.5, fontFace: FONT, fontSize: 14, bold: true, color: delta.trim().startsWith('-') ? 'EF4444' : '10B981', fit: 'shrink' });
    });
  }
  for (const c of d.charts || []) {
    const s = pptx.addSlide({ masterName: 'CONTENT' });
    s.addText(c.title || '', { x: 0.6, y: 0.35, w: W - 1.2, h: 0.9, fontFace: FONT, fontSize: 28, bold: true, color: INK, fit: 'shrink' });
    const type = CHART_TYPE[c.type] || 'bar';
    const series = (c.series || []).map((sr) => ({ name: sr.name || '', labels: (c.labels || []).map(String), values: (sr.data || []).map(Number) }));
    if (!series.length) continue;
    s.addChart(type === 'pie' ? pptx.ChartType.pie : type === 'line' ? pptx.ChartType.line : pptx.ChartType.bar, type === 'pie' ? series.slice(0, 1) : series, {
      x: 0.8, y: 1.4, w: W - 1.6, h: H - 2.3,
      chartColors: PALETTE, showLegend: series.length > 1 || type === 'pie', legendPos: 'b', legendFontFace: FONT,
      catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11,
      dataLabelFontFace: FONT, showValue: type !== 'line', dataLabelFontSize: 11, showPercent: type === 'pie',
      lineSize: 3, lineDataSymbolSize: 8, barGapWidthPct: 60, valGridLine: { color: 'E6E8EE', size: 0.5 },
    });
  }
  if (d.table?.columns?.length) {
    const rows = d.table.rows || [];
    for (let start = 0; start < Math.max(rows.length, 1); start += 12) {
      contentSlide(pptx, { title: rows.length > 12 ? `${title} (${start / 12 + 1})` : title, blocks: [{ kind: 'table', rows: [d.table.columns.map(String), ...rows.slice(start, start + 12).map((r) => r.map((x) => String(x ?? '')))] }] });
    }
  }
  return pptx;
}

export const canExportPptx = (a) => a.type === 'slides' || a.type === 'dashboard';

export async function renderPptx(a) {
  const pptx = a.type === 'dashboard' ? deckFromDashboard(a) : deckFromSlides(a);
  return pptx.write({ outputType: 'nodebuffer' });
}
