// AES-256-GCM encryption for API keys at rest. The key lives in data/secret.key (0600)
// or comes from AGENT_TEAMS_SECRET. API keys are never sent back to the browser.
import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { config } from './config.js';

let key;
function masterKey() {
  if (key) return key;
  if (process.env.AGENT_TEAMS_SECRET) {
    key = createHash('sha256').update(process.env.AGENT_TEAMS_SECRET).digest();
  } else if (config.dbFile === ':memory:') {
    key = randomBytes(32);
  } else {
    mkdirSync(config.dataDir, { recursive: true });
    if (!existsSync(config.keyFile)) writeFileSync(config.keyFile, randomBytes(32).toString('base64'), { mode: 0o600 });
    key = Buffer.from(readFileSync(config.keyFile, 'utf8').trim(), 'base64');
  }
  return key;
}

export function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', masterKey(), iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(blob) {
  if (!blob) return '';
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', masterKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

export const mask = (s) => (!s ? '' : s.length <= 8 ? '••••' : `${s.slice(0, 3)}••••${s.slice(-4)}`);

export function hashPassword(pw) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(pw, salt, 64).toString('base64')}`;
}

export function verifyPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const expect = Buffer.from(hash, 'base64');
  const got = scryptSync(pw, Buffer.from(salt, 'base64'), expect.length);
  return timingSafeEqual(expect, got);
}
