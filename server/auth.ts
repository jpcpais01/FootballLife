import type { IncomingMessage } from 'node:http';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from './db.ts';
import { bad, HttpError, newId, parseCookies, str } from './http.ts';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = 'fl_session';
const SESSION_DAYS = 60;

async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32);
  return `s1$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [, saltB64, keyB64] = stored.split('$');
  if (!saltB64 || !keyB64) return false;
  const key = await scrypt(pw, Buffer.from(saltB64, 'base64'), 32);
  const want = Buffer.from(keyB64, 'base64');
  return key.length === want.length && timingSafeEqual(key, want);
}

export interface User {
  id: string;
  username: string;
}

function validUsername(v: unknown): string {
  const u = str(v, 'Username', 3, 20);
  if (!/^[A-Za-z0-9_.-]+$/.test(u)) throw bad('Username can use letters, numbers, dot, dash and underscore');
  return u;
}

function validPassword(v: unknown): string {
  if (typeof v !== 'string' || v.length < 6 || v.length > 200) throw bad('Password must be at least 6 characters');
  return v;
}

export async function register(db: Db, body: Record<string, unknown>) {
  const username = validUsername(body.username);
  const password = validPassword(body.password);
  const exists = await db.query('SELECT 1 FROM users WHERE username_lc = $1', [username.toLowerCase()]);
  if (exists.length) throw bad('That username is taken');
  const id = newId('u_');
  await db.query('INSERT INTO users (id, username, username_lc, pass_hash) VALUES ($1, $2, $3, $4)', [id, username, username.toLowerCase(), await hashPassword(password)]);
  return createSession(db, id);
}

export async function login(db: Db, body: Record<string, unknown>) {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const rows = await db.query<{ id: string; pass_hash: string }>('SELECT id, pass_hash FROM users WHERE username_lc = $1', [username.toLowerCase()]);
  if (!rows.length || !(await verifyPassword(password, rows[0].pass_hash))) throw new HttpError(401, 'Wrong username or password');
  return createSession(db, rows[0].id);
}

async function createSession(db: Db, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, userId, expires.toISOString()]);
  return { token, expires };
}

export async function logout(db: Db, req: IncomingMessage) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) await db.query('DELETE FROM sessions WHERE token = $1', [token]);
}

export async function currentUser(db: Db, req: IncomingMessage): Promise<User | null> {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const rows = await db.query<User>(
    'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > now()',
    [token],
  );
  return rows[0] ?? null;
}

export function sessionCookie(token: string, expires: Date, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure ? '; Secure' : ''}`;
}

export function clearCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
