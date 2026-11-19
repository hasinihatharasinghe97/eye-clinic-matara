import crypto from 'node:crypto';
import db from './db.js';
import { getUserById, publicUser } from './users.js';

/** How long a login stays valid (default 12 hours). */
const TOKEN_TTL_MS = (Number(process.env.AUTH_TOKEN_TTL_HOURS) || 12) * 60 * 60 * 1000;
const USER_CACHE_MS = 5_000;
const SECRET_KEY = 'auth_signing_secret';

// ---------------------------------------------------------------------------
// Signing secret: AUTH_SECRET env, else a random secret created once and kept in MySQL
// (app_settings) — never in a file — so logins survive restarts.
// ---------------------------------------------------------------------------

let signingKeyPromise = null;

async function readSecretRow() {
  const row = await db.prepare('SELECT value FROM app_settings WHERE `key` = ?').get(SECRET_KEY);
  return row?.value || '';
}

async function loadSigningKey() {
  let secret = String(process.env.AUTH_SECRET || '');
  if (!secret) {
    secret = await readSecretRow();
    if (!secret) {
      // INSERT IGNORE: if two processes race, both then read back the same winner.
      await db
        .prepare('INSERT IGNORE INTO app_settings (`key`, value) VALUES (?, ?)')
        .run(SECRET_KEY, crypto.randomBytes(48).toString('base64url'));
      secret = await readSecretRow();
    }
  }
  return crypto.createHash('sha256').update(`eye-clinic-auth\0${secret}`).digest();
}

function signingKey() {
  if (!signingKeyPromise) {
    signingKeyPromise = loadSigningKey().catch((err) => {
      signingKeyPromise = null;
      throw err;
    });
  }
  return signingKeyPromise;
}

function sign(key, payload) {
  return crypto.createHmac('sha256', key).update(payload).digest('base64url');
}

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------------------
// Login tokens: `<expiresAtMs>.<userId>.<nonce>.<signature>`
// The signature also covers the user's token_version, so changing a password, disabling
// an account or changing a role signs that user out on every device.
// ---------------------------------------------------------------------------

// Short cache so every API call doesn't hit MySQL; revocations apply within seconds.
const userCache = new Map(); // id -> { user, at }

async function loadUser(id) {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < USER_CACHE_MS) return hit.user;
  const user = await getUserById(id);
  userCache.set(id, { user, at: Date.now() });
  return user;
}

/** Call after changing a user so the next request sees it immediately. */
export function forgetCachedUser(id) {
  userCache.delete(Number(id));
}

export async function issueToken(user) {
  const key = await signingKey();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${expiresAt}.${user.id}.${crypto.randomBytes(16).toString('base64url')}`;
  const sig = sign(key, `${payload}.${user.token_version}`);
  return { token: `${payload}.${sig}`, expiresAt };
}

/** Returns the signed-in user row, or null. */
export async function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4) return null;
  const [exp, uid, nonce, sig] = parts;
  const expiresAt = Number(exp);
  const userId = Number(uid);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const user = await loadUser(userId);
  if (!user || !user.active) return null;
  const expected = sign(await signingKey(), `${exp}.${uid}.${nonce}.${user.token_version}`);
  return safeEqual(sig, expected) ? user : null;
}

/**
 * <img src>, <a href> and file downloads can't send headers, so ?access_token= is
 * accepted — but only for GET requests that fetch files, never for the data API.
 */
function queryTokenAllowed(req, p) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  return p.startsWith('/uploads/') || /^\/api\/system\/backups\/[^/]+\/download$/.test(p);
}

function tokenFromRequest(req, p) {
  const header = String(req.get('Authorization') || '');
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (queryTokenAllowed(req, p) && typeof req.query.access_token === 'string') {
    return req.query.access_token;
  }
  return '';
}

const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/system/login',
  '/api/system/cron/drive-backup', // protected by BACKUP_CRON_SECRET
]);

/** Paths a user who must change their password may still use. */
const PASSWORD_CHANGE_PATHS = new Set(['/api/users/me', '/api/users/me/password', '/api/system/session']);

/** Rejects /api/* (except public routes) and /uploads/* without a valid login; sets req.user. */
export async function requireAuth(req, res, next) {
  // Express matches routes case-insensitively, so compare in lower case.
  const p = req.path.toLowerCase();
  const isProtected = p.startsWith('/api/') || p === '/api' || p.startsWith('/uploads');
  const bare = p.replace(/\/+$/, '');
  if (!isProtected || PUBLIC_API_PATHS.has(bare)) return next();
  try {
    const user = await verifyToken(tokenFromRequest(req, p));
    if (!user) return res.status(401).json({ error: 'Please sign in again' });
    req.user = publicUser(user);
    if (req.user.mustChangePassword && !PASSWORD_CHANGE_PATHS.has(bare)) {
      return res
        .status(403)
        .json({ error: 'Please change your password first', mustChangePassword: true });
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** For routes only administrators may use (managing users, clinic settings). */
export function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  res.status(403).json({ error: 'Only an administrator can do this' });
}

// ---------------------------------------------------------------------------
// Brute-force protection for password checks (login and password change)
// ---------------------------------------------------------------------------

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const BASE_LOCK_MS = 60 * 1000;
const MAX_LOCK_MS = 60 * 60 * 1000;
const failures = new Map(); // ip -> { count, first, lockedUntil, locks }

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

/** Returns seconds to wait if this client is locked out, else 0. */
export function lockoutSeconds(req) {
  const entry = failures.get(clientKey(req));
  if (!entry || !entry.lockedUntil) return 0;
  const left = entry.lockedUntil - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

export function recordFailedAttempt(req) {
  const key = clientKey(req);
  const now = Date.now();
  let entry = failures.get(key);
  if (!entry || now - entry.first > FAILURE_WINDOW_MS) {
    entry = { count: 0, first: now, lockedUntil: 0, locks: entry?.locks || 0 };
  }
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    // Each lockout doubles: 1 min, 2, 4, … up to 1 hour.
    const lockMs = Math.min(BASE_LOCK_MS * 2 ** entry.locks, MAX_LOCK_MS);
    entry.lockedUntil = now + lockMs;
    entry.locks += 1;
    entry.count = 0;
    entry.first = now;
    console.warn(`[auth] Too many wrong passwords from ${key}; locked for ${lockMs / 1000}s`);
  }
  failures.set(key, entry);
}

export function clearFailedAttempts(req) {
  failures.delete(clientKey(req));
}

/** Sends 429 and returns true when this client is locked out. */
export function tooManyAttempts(req, res) {
  const wait = lockoutSeconds(req);
  if (!wait) return false;
  res.setHeader('Retry-After', String(wait));
  res.status(429).json({
    error: `Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} minute(s).`,
  });
  return true;
}

// Forget stale entries so the map can't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, e] of failures) {
    if (e.lockedUntil < now && now - e.first > MAX_LOCK_MS) failures.delete(key);
  }
}, 10 * 60 * 1000).unref();
