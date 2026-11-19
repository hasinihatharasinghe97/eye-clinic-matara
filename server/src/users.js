/**
 * Clinic user accounts, stored in the MySQL `app_users` table with scrypt password
 * hashes. Nothing about passwords is kept in settings.json or any other file.
 */
import db, {
  FALLBACK_CLINIC_PASSWORD,
  LEGACY_PASSWORD_KEYS,
  readRawSettings,
  writeRawSettings,
} from './db.js';
import { hashPassword, isPasswordHash, verifyPasswordHash } from './passwordHash.js';
import { nowClinic } from './clinicDate.js';

export const ROLES = ['admin', 'staff'];
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

/** Shape sent to the browser — never includes the hash or token version. */
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    active: Boolean(row.active),
    mustChangePassword: Boolean(row.must_change_password),
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at,
  };
}

export function normalizeUsername(v) {
  return String(v || '').trim().toLowerCase();
}

export function validateUsername(username) {
  if (!USERNAME_RE.test(username)) {
    return 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore';
  }
  return null;
}

export function validatePassword(pw) {
  const s = String(pw || '');
  if (s.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (s.length > MAX_PASSWORD_LENGTH) return 'Password is too long';
  return null;
}

export async function getUserById(id) {
  return db.prepare('SELECT * FROM app_users WHERE id = ?').get(Number(id));
}

export async function getUserByUsername(username) {
  return db.prepare('SELECT * FROM app_users WHERE username = ?').get(normalizeUsername(username));
}

export async function listUsers() {
  const rows = await db.prepare('SELECT * FROM app_users ORDER BY active DESC, full_name ASC').all();
  return rows.map(publicUser);
}

export async function countActiveAdmins(excludeId = null) {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM app_users WHERE role = 'admin' AND active = 1 AND id <> ?")
    .get(excludeId == null ? -1 : Number(excludeId));
  return Number(row?.c || 0);
}

export async function createUser({ username, fullName, password, role, mustChangePassword = true, passwordHash = null }) {
  const ts = nowClinic();
  const hash = passwordHash || (await hashPassword(password));
  const result = await db
    .prepare(
      `INSERT INTO app_users (username, full_name, password_hash, role, active, token_version,
         must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?)`
    )
    .run(normalizeUsername(username), String(fullName).trim(), hash, role, mustChangePassword ? 1 : 0, ts, ts);
  return getUserById(result.insertId);
}

/** Check a password; always runs scrypt so unknown usernames take as long as known ones. */
let dummyHash = null;
export async function checkPassword(user, password) {
  if (!user) {
    dummyHash = dummyHash || (await hashPassword('timing-equaliser'));
    await verifyPasswordHash(String(password), dummyHash);
    return false;
  }
  return verifyPasswordHash(String(password), user.password_hash);
}

/** Set a new password; bumping token_version signs that user out everywhere. */
export async function setPassword(id, newPassword, { mustChange = false } = {}) {
  await db
    .prepare(
      `UPDATE app_users SET password_hash = ?, must_change_password = ?,
         token_version = token_version + 1, updated_at = ? WHERE id = ?`
    )
    .run(await hashPassword(newPassword), mustChange ? 1 : 0, nowClinic(), Number(id));
  return getUserById(id);
}

export async function updateUser(id, { fullName, role, active }) {
  const user = await getUserById(id);
  if (!user) return null;
  const next = {
    full_name: fullName !== undefined ? String(fullName).trim() : user.full_name,
    role: role !== undefined ? role : user.role,
    active: active !== undefined ? (active ? 1 : 0) : user.active,
  };
  // Changing role or disabling an account ends that user's current sessions.
  const revoke = next.role !== user.role || Number(next.active) !== Number(user.active);
  await db
    .prepare(
      `UPDATE app_users SET full_name = ?, role = ?, active = ?,
         token_version = token_version + ?, updated_at = ? WHERE id = ?`
    )
    .run(next.full_name, next.role, next.active, revoke ? 1 : 0, nowClinic(), Number(id));
  return getUserById(id);
}

export async function deleteUser(id) {
  await db.prepare('DELETE FROM app_users WHERE id = ?').run(Number(id));
}

export async function recordLogin(id) {
  await db.prepare('UPDATE app_users SET last_login_at = ? WHERE id = ?').run(nowClinic(), Number(id));
}

/**
 * Runs once at startup, before the server accepts requests:
 *  - no users yet → create an `admin` account from the old clinic password (settings.json /
 *    MySQL settings), else CLINIC_PASSWORD, else the built-in default (must be changed);
 *  - always removes any old password (plain or hashed) from the stored settings.
 */
export async function ensureUsers() {
  let raw = null;
  try {
    raw = await readRawSettings();
  } catch (err) {
    console.warn('[users] Could not read old settings:', err?.message || err);
  }
  const row = await db.prepare('SELECT COUNT(*) AS c FROM app_users').get();
  if (Number(row?.c || 0) === 0) {
    let passwordHash = null;
    let mustChange = false;
    let source = '';
    if (raw && isPasswordHash(raw.clinicPasswordHash)) {
      passwordHash = raw.clinicPasswordHash;
      source = 'the existing clinic password';
    } else if (raw && typeof raw.clinicPassword === 'string' && raw.clinicPassword) {
      passwordHash = await hashPassword(raw.clinicPassword);
      source = 'the existing clinic password';
    } else if (process.env.CLINIC_PASSWORD) {
      passwordHash = await hashPassword(process.env.CLINIC_PASSWORD);
      source = 'CLINIC_PASSWORD';
    } else {
      passwordHash = await hashPassword(FALLBACK_CLINIC_PASSWORD);
      mustChange = true;
      source = 'the built-in default password (must be changed at first sign-in)';
    }
    await createUser({
      username: 'admin',
      fullName: 'Administrator',
      role: 'admin',
      passwordHash,
      mustChangePassword: mustChange,
    });
    console.log(`[users] Created user "admin" (administrator) using ${source}.`);
  }
  if (raw && LEGACY_PASSWORD_KEYS.some((k) => k in raw)) {
    const cleaned = { ...raw };
    for (const k of LEGACY_PASSWORD_KEYS) delete cleaned[k];
    await writeRawSettings(cleaned);
    console.log('[users] Removed the old clinic password from settings (now stored per user in MySQL).');
  }
}
