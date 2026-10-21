import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const bad = (msg: string) => new HttpError(400, msg);
export const forbidden = (msg = 'You are not allowed to do that') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);

export function newId(prefix = ''): string {
  return prefix + randomBytes(9).toString('base64url');
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) throw bad('Request too large');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw bad('Invalid JSON');
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  const h = req.headers.cookie;
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function str(v: unknown, field: string, min: number, max: number): string {
  if (typeof v !== 'string') throw bad(`${field} is required`);
  const s = v.trim().replace(/\s+/g, ' ');
  if (s.length < min || s.length > max) throw bad(`${field} must be ${min}–${max} characters`);
  return s;
}

export function oneOf<T extends string>(v: unknown, opts: readonly T[], field: string): T {
  if (typeof v !== 'string' || !opts.includes(v as T)) throw bad(`Invalid ${field}`);
  return v as T;
}

export function hexColor(v: unknown, field: string): string {
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw bad(`Invalid ${field}`);
  return v.toLowerCase();
}
