// Local accounts, sessions and roles. The first account created becomes the owner.
import { randomBytes } from 'node:crypto';
import { all, get, run, id, now, audit } from './db.js';
import { hashPassword, verifyPassword } from './secrets.js';
import { config } from './config.js';

export const ROLES = ['owner', 'admin', 'member', 'guest'];
const RANK = { owner: 3, admin: 2, member: 1, guest: 0 };
export const atLeast = (user, role) => !!user && RANK[user.role] >= RANK[role];

const toUser = (r) => r && { id: r.id, username: r.username, displayName: r.display_name, role: r.role, avatar: r.avatar, createdAt: r.created_at };

export const userCount = () => get('SELECT COUNT(*) AS n FROM users').n;
export const listUsers = () => all('SELECT * FROM users ORDER BY created_at').map(toUser);
export const getUser = (uid) => toUser(get('SELECT * FROM users WHERE id = ?', uid));

export function createUser({ username, password, displayName, role }) {
  username = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_.-]{2,32}$/.test(username)) throw Object.assign(new Error('Username must be 2–32 chars: a-z 0-9 _ . -'), { status: 400 });
  if (String(password || '').length < 6) throw Object.assign(new Error('Password must be at least 6 characters'), { status: 400 });
  if (get('SELECT 1 FROM users WHERE username = ?', username)) throw Object.assign(new Error('Username already taken'), { status: 409 });
  const first = userCount() === 0;
  const uid = id('usr_');
  run('INSERT INTO users(id, username, display_name, password_hash, role, created_at) VALUES (?,?,?,?,?,?)',
    uid, username, displayName || username, hashPassword(password), first ? 'owner' : ROLES.includes(role) ? role : 'member', now());
  audit('user', uid, 'user.create', uid, { username });
  return getUser(uid);
}

export function login(username, password) {
  const r = get('SELECT * FROM users WHERE username = ?', String(username || '').trim().toLowerCase());
  if (!r || !verifyPassword(String(password || ''), r.password_hash)) return null;
  return { user: toUser(r), token: createSession(r.id) };
}

export function createSession(uid) {
  const token = randomBytes(32).toString('base64url');
  run('INSERT INTO sessions(token, user_id, expires_at) VALUES (?,?,?)', token, uid, now() + config.sessionDays * 86400000);
  return token;
}

export function userForToken(token) {
  if (!token) return null;
  const r = get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?', token, now());
  return toUser(r);
}

export const logout = (token) => run('DELETE FROM sessions WHERE token = ?', token);

export function updateUser(uid, patch) {
  const r = get('SELECT * FROM users WHERE id = ?', uid);
  if (!r) return null;
  run('UPDATE users SET display_name = ?, role = ?, avatar = ? WHERE id = ?',
    patch.displayName ?? r.display_name, patch.role && ROLES.includes(patch.role) ? patch.role : r.role, patch.avatar ?? r.avatar, uid);
  if (patch.password) {
    if (String(patch.password).length < 6) throw Object.assign(new Error('Password must be at least 6 characters'), { status: 400 });
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(patch.password), uid);
    run('DELETE FROM sessions WHERE user_id = ?', uid);
  }
  return getUser(uid);
}

export const deleteUser = (uid) => run('DELETE FROM users WHERE id = ?', uid).changes > 0;
