// File attachments: stored on disk, text extracted once so agents can read them.
// Supports text/markdown/CSV/JSON/HTML/code, PDF, and Office files (DOCX/XLSX/PPTX).
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { config } from './config.js';
import { all, get, run, id, now } from './db.js';
import { htmlToText } from './agents/tools.js';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const TEXTY = /^(text\/|application\/(json|xml|javascript|x-yaml|yaml|csv|sql|x-sh))/;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|css|js|ts|jsx|tsx|py|rb|go|rs|java|kt|c|h|cpp|cs|php|sql|sh|log|ini|toml|env)$/i;

const dir = () => { const d = join(config.dataDir, 'files'); mkdirSync(d, { recursive: true }); return d; };
const toFile = (r) => r && { id: r.id, channelId: r.channel_id, name: r.name, mime: r.mime, size: r.size, hasText: !!r.text, createdBy: r.created_by, createdAt: r.created_at };

export const getFile = (fid) => toFile(get('SELECT * FROM files WHERE id = ?', fid));
export const fileText = (fid) => get('SELECT text FROM files WHERE id = ?', fid)?.text || '';
export const fileBytes = (fid) => { const r = get('SELECT path FROM files WHERE id = ?', fid); return r ? readFileSync(r.path) : null; };
export const listFiles = (channelId) => all('SELECT * FROM files WHERE channel_id = ? ORDER BY created_at DESC', channelId).map(toFile);

// Minimal ZIP reader (enough for Office Open XML files).
export function unzip(buf) {
  const files = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    files[name] = () => (method === 8 ? inflateRawSync(data) : data);
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

const xmlText = (xml, paraTag) => xml.replace(new RegExp(`</${paraTag}>`, 'g'), '\n').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

async function extract(name, mime, buf) {
  const ext = (name.match(/\.(\w+)$/)?.[1] || '').toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    return text.map((t, i) => `--- page ${i + 1} ---\n${t}`).join('\n');
  }
  if (ext === 'docx') return xmlText(unzip(buf)['word/document.xml']().toString('utf8'), 'w:p');
  if (ext === 'pptx') {
    const z = unzip(buf);
    return Object.keys(z).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0])
      .map((k, i) => `--- slide ${i + 1} ---\n${xmlText(z[k]().toString('utf8'), 'a:p')}`).join('\n');
  }
  if (ext === 'xlsx') {
    const z = unzip(buf);
    const shared = z['xl/sharedStrings.xml'] ? [...z['xl/sharedStrings.xml']().toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1], 'r')) : [];
    return Object.keys(z).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort().map((k, i) => {
      const rows = [...z[k]().toString('utf8').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => [...r[1].matchAll(/<c[^>]*?(t="(\w+)")?[^>]*>(?:<f>[\s\S]*?<\/f>)?(?:<v>([\s\S]*?)<\/v>|<is>([\s\S]*?)<\/is>)?<\/c>/g)]
        .map((c) => (c[2] === 's' ? shared[+c[3]] ?? '' : c[4] ? xmlText(c[4], 't') : c[3] ?? '')).join('\t'));
      return `--- sheet ${i + 1} ---\n${rows.join('\n')}`;
    }).join('\n');
  }
  if (/html?$/.test(ext) || mime === 'text/html') return htmlToText(buf.toString('utf8'));
  if (TEXTY.test(mime) || TEXT_EXT.test(name)) return buf.toString('utf8');
  return null; // images and other binaries: stored, not read
}

export async function saveUpload({ channelId, name, mime, data, userId }) {
  const buf = Buffer.from(String(data || ''), 'base64');
  if (!buf.length) throw Object.assign(new Error('Empty file'), { status: 400 });
  if (buf.length > MAX_FILE_BYTES) throw Object.assign(new Error('File is larger than 15 MB'), { status: 413 });
  name = String(name || 'file').replace(/[\\/\0]/g, '_').slice(0, 160);
  mime = String(mime || 'application/octet-stream').slice(0, 100);
  const fid = id('fil_');
  const path = join(dir(), fid);
  writeFileSync(path, buf);
  let text = null;
  try { text = await extract(name, mime, buf); } catch (e) { text = null; console.warn('[files] extract failed:', name, e.message); }
  run('INSERT INTO files(id, channel_id, name, mime, size, path, text, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    fid, channelId, name, mime, buf.length, path, text ? text.slice(0, 400_000) : null, userId, now());
  return getFile(fid);
}

export function deleteFile(fid) {
  const r = get('SELECT path FROM files WHERE id = ?', fid);
  if (!r) return false;
  rmSync(r.path, { force: true });
  run('DELETE FROM files WHERE id = ?', fid);
  return true;
}

// Text block injected into an agent's view of a message that has attachments.
export function fileContext(m) {
  const files = m.meta?.files || [];
  if (!files.length) return '';
  let budget = 30_000;
  return files.map((f) => {
    const text = fileText(f.id);
    if (!text) return `[Attached ${/^image\//.test(f.mime) ? 'image' : 'file'}: ${f.name} (${Math.round(f.size / 1024)} KB, contents not readable as text)]\n`;
    const part = text.slice(0, Math.max(budget, 0));
    budget -= part.length;
    return `[Attached file: ${f.name}]\n${part}${text.length > part.length ? '\n…(truncated)' : ''}\n[End of ${f.name}]\n`;
  }).join('\n') + '\n';
}
