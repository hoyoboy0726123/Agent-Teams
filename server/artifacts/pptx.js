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

function contentSlide(pptx, parsed) {
  const s = pptx.addSlide({ masterName: 'CONTENT' });
  s.addText(parsed.title || '', { x: 0.6, y: 0.35, w: W - 1.2, h: 0.9, fontFace: FONT, fontSize: 30, bold: true, color: INK, valign: 'middle', fit: 'shrink' });
  let y = 1.4;
  const bottom = H - 0.75;
  const textBlocks = parsed.blocks.filter((b) => b.kind !== 'table');
  const lineCount = textBlocks.reduce((n, b) => n + (b.kind === 'bullets' ? b.items.length : b.kind === 'code' ? b.text.split('\n').length * 0.7 : Math.ceil((b.text || '').length / 70)), 0);
  const size = lineCount > 12 ? 14 : lineCount > 8 ? 16 : lineCount > 5 ? 19 : 22;
  for (const b of parsed.blocks) {
    const room = bottom - y;
    if (room < 0.4) break;
    if (b.kind === 'bullets') {
      const h = Math.min(room, b.items.length * size * 0.028 + 0.3);
      s.addText(b.items.map((it) => ({
        text: it.text,
        options: { bullet: it.numbered ? { type: 'number' } : { code: it.indent ? '2013' : '25CF' }, indentLevel: it.indent, fontSize: it.indent ? size - 2 : size, color: it.indent ? MUTED : INK, paraSpaceAfter: 6 },
      })), { x: 0.75, y, w: W - 1.5, h, fontFace: FONT, valign: 'top', fit: 'shrink' });
      y += h + 0.1;
    } else if (b.kind === 'heading') {
      s.addText(b.text, { x: 0.75, y, w: W - 1.5, h: 0.5, fontFace: FONT, fontSize: size + 2, bold: true, color: ACCENT });
      y += 0.55;
    } else if (b.kind === 'para') {
      const h = Math.min(room, Math.ceil(b.text.length / 80) * size * 0.022 + 0.35);
      s.addText(b.text, { x: 0.75, y, w: W - 1.5, h, fontFace: FONT, fontSize: size, color: INK, valign: 'top', fit: 'shrink' });
      y += h + 0.1;
    } else if (b.kind === 'code') {
      const h = Math.min(room, b.text.split('\n').length * 0.25 + 0.3);
      s.addText(b.text, { x: 0.75, y, w: W - 1.5, h, fontFace: 'Consolas', fontSize: 12, color: INK, fill: { color: 'F4F5F9' }, valign: 'top', fit: 'shrink' });
      y += h + 0.1;
    } else if (b.kind === 'table' && b.rows.length) {
      const [head, ...rows] = b.rows;
      const fs = rows.length > 8 ? 11 : 13;
      s.addTable([
        head.map((c) => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: ACCENT } } })),
        ...rows.map((r, ri) => r.map((c) => ({ text: c, options: { fill: { color: ri % 2 ? 'F7F8FB' : 'FFFFFF' } } }))),
      ], { x: 0.75, y, w: W - 1.5, fontFace: FONT, fontSize: fs, color: INK, border: { type: 'solid', color: 'E6E8EE', pt: 0.75 }, autoPage: false });
      y += Math.min(room, (rows.length + 1) * 0.4) + 0.15;
    }
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
    const cw = (W - 1.2 - (cols - 1) * 0.3) / cols;
    kpis.forEach((k, i) => {
      const x = 0.6 + (i % cols) * (cw + 0.3);
      const y = 1.5 + Math.floor(i / cols) * 2.5;
      s.addShape(pptx.ShapeType.roundRect, { x, y, w: cw, h: 2.2, fill: { color: 'F7F8FB' }, line: { color: 'E6E8EE' }, rectRadius: 0.12 });
      s.addText(String(k.label ?? ''), { x: x + 0.25, y: y + 0.2, w: cw - 0.5, h: 0.45, fontFace: FONT, fontSize: 14, color: MUTED });
      s.addText(String(k.value ?? ''), { x: x + 0.25, y: y + 0.65, w: cw - 0.5, h: 0.9, fontFace: FONT, fontSize: 34, bold: true, color: INK, fit: 'shrink' });
      const delta = String(k.delta ?? '');
      if (delta) s.addText(delta, { x: x + 0.25, y: y + 1.55, w: cw - 0.5, h: 0.45, fontFace: FONT, fontSize: 14, bold: true, color: delta.trim().startsWith('-') ? 'EF4444' : '10B981' });
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
