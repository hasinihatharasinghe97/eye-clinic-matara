/**
 * Backup encryption (AES-256-GCM, key from BACKUP_PASSWORD via scrypt).
 *
 * No imports from the rest of the server, so scripts/decrypt-backup.mjs and
 * scripts/restore-from-backup.mjs can use it on their own.
 *
 * File layout (`.zip.enc`):
 *   "ECBK1\n" (6) | salt (16) | iv (12) | auth tag (16) | encrypted ZIP bytes
 * GCM's auth tag means a wrong password or a tampered/corrupted file is detected,
 * never silently turned into garbage.
 */
import crypto from 'node:crypto';

const MAGIC = Buffer.from('ECBK1\n', 'latin1');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN;
// scrypt cost: N=2^15, r=8 → ~32 MB RAM, ~0.1–0.3 s per backup. Slows password guessing.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const ENCRYPTED_EXT = '.zip.enc';
export const MIN_BACKUP_PASSWORD_LENGTH = 12;

/** BACKUP_PASSWORD from the environment / .env, or '' when backups are not encrypted. */
export function backupPassword() {
  return String(process.env.BACKUP_PASSWORD || '');
}

export function isBackupEncryptionOn() {
  return backupPassword().length > 0;
}

export function isEncryptedBackup(buf) {
  return Buffer.isBuffer(buf) && buf.length > HEADER_LEN && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

function deriveKey(password, salt) {
  return crypto.scryptSync(String(password), salt, 32, SCRYPT);
}

export function encryptBackup(zipBuffer, password) {
  if (!password) throw new Error('A backup password is required to encrypt');
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(zipBuffer), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decryptBackup(encBuffer, password) {
  if (!isEncryptedBackup(encBuffer)) throw new Error('This is not an encrypted Eye Clinic backup');
  let o = MAGIC.length;
  const salt = encBuffer.subarray(o, (o += SALT_LEN));
  const iv = encBuffer.subarray(o, (o += IV_LEN));
  const tag = encBuffer.subarray(o, (o += TAG_LEN));
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(encBuffer.subarray(o)), decipher.final()]);
  } catch {
    throw new Error('Wrong backup password, or the backup file is damaged');
  }
}

/** True for backup file names this app creates (plain or encrypted). */
export function isBackupFileName(name) {
  const n = String(name).toLowerCase();
  return n.startsWith('eyeclinic-backup-') && (n.endsWith('.zip') || n.endsWith(ENCRYPTED_EXT));
}
