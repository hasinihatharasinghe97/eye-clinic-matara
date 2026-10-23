import crypto from 'node:crypto';
import { getSettings } from './db.js';

/** How long a login stays valid (default 12 hours). */
const TOKEN_TTL_MS = (Number(process.env.AUTH_TOKEN_TTL_HOURS) || 12) * 60 * 60 * 1000;
const KEY_CACHE_MS = 30_000;

let cachedKey = null;
let cachedAt = 0;

/**
 * Tokens are HMAC-signed with a key derived from AUTH_SECRET (optional env) and the
 * clinic password, so they survive server restarts and changing the password signs
 * everyone out.
 */
async function signingKey() {
  if (cachedKey && Date.now() - cachedAt < KEY_CACHE_MS) return cachedKey;
  const settings = await getSettings();
  cachedKey = crypto
    .createHash('sha256')
    .update(`${process.env.AUTH_SECRET || ''}\0${settings.clinicPassword || ''}`)
    .digest();
  cachedAt = Date.now();
  return cachedKey;
}

/** Call after the clinic password changes. */
export function clearAuthKeyCache() {
  cachedKey = null;
}

function sign(key, payload) {
  return crypto.createHmac('sha256', key).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function passwordMatches(provided, expected) {
  return Boolean(expected) && safeEqual(provided, expected);
}

/** Token format: `<expiresAtMs>.<nonce>.<signature>` */
export async function issueToken() {
  const key = await signingKey();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${expiresAt}.${crypto.randomBytes(16).toString('base64url')}`;
  return { token: `${payload}.${sign(key, payload)}`, expiresAt };
}

export async function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts;
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return safeEqual(sig, sign(await signingKey(), `${exp}.${nonce}`));
}

function tokenFromRequest(req) {
  const header = String(req.get('Authorization') || '');
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  // <img src>, <a href> and file downloads can't send headers; allow ?access_token= for reads.
  if (req.method === 'GET' && typeof req.query.access_token === 'string') {
    return req.query.access_token;
  }
  return '';
}

const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/system/login',
  '/api/system/cron/drive-backup', // protected by BACKUP_CRON_SECRET
]);

/** Rejects /api/* (except public routes) and /uploads/* without a valid login token. */
export async function requireAuth(req, res, next) {
  // Express matches routes case-insensitively, so compare in lower case.
  const p = req.path.toLowerCase();
  const isProtected = p.startsWith('/api/') || p === '/api' || p.startsWith('/uploads');
  if (!isProtected || PUBLIC_API_PATHS.has(p.replace(/\/+$/, ''))) return next();
  try {
    if (await verifyToken(tokenFromRequest(req))) return next();
    res.status(401).json({ error: 'Please sign in again' });
  } catch (err) {
    next(err);
  }
}
