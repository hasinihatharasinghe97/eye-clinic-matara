import { Router } from 'express';
import {
  getSettings,
  saveSettings,
  IS_CLOUD,
  BACKUPS_DIR,
} from '../db.js';
import {
  createBackup,
  listBackups,
  getBackupBuffer,
  isBackupStale,
  runGoogleDriveBackupNow,
} from '../backup.js';
import {
  clearFailedAttempts,
  issueToken,
  recordFailedAttempt,
  requireAdmin,
  safeEqual,
  tooManyAttempts,
} from '../auth.js';
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  checkPassword,
  getUserByUsername,
  publicUser,
  recordLogin,
} from '../users.js';
import {
  ENCRYPTED_EXT,
  MIN_BACKUP_PASSWORD_LENGTH,
  backupPassword,
} from '../backupCrypto.js';
import { driveBackupStatus, isGoogleDriveConfigured } from '../googleDriveBackup.js';
import {
  autoSyncSettings,
  cloudSyncStatus,
  isCloudSyncConfigured,
  localChangesSinceSync,
  syncBoth,
  readSyncState,
} from '../cloudSync.js';

const router = Router();

function settingsPayload(s) {
  return {
    backupFolder: s.backupFolder,
    lastBackupAt: s.lastBackupAt,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    /** Backups are AES-256 encrypted (BACKUP_PASSWORD is set on the server). */
    backupEncryption: {
      enabled: Boolean(backupPassword()),
      weak: Boolean(backupPassword()) && backupPassword().length < MIN_BACKUP_PASSWORD_LENGTH,
      minLength: MIN_BACKUP_PASSWORD_LENGTH,
    },
    cloudMode: IS_CLOUD,
    /** This server is the clinic laptop and can sync to the cloud database. */
    cloudSync: isCloudSyncConfigured(),
    defaultBackupFolder: BACKUPS_DIR,
    backupOverdue: isBackupStale(s.lastBackupAt),
    backupKeepCount: Number(process.env.BACKUP_KEEP || (IS_CLOUD ? 7 : 14)) || 14,
    googleDrive: {
      configured: isGoogleDriveConfigured(),
      timezone: 'Asia/Colombo',
      schedule: '01:00',
      lastDriveBackupAt: s.lastDriveBackupAt || null,
      lastDriveBackupDate: s.lastDriveBackupDate || null,
      lastDriveFileName: s.lastDriveFileName || null,
      lastDriveError: s.lastDriveError || null,
    },
  };
}

router.get('/settings', async (_req, res) => {
  const s = await getSettings();
  res.json(settingsPayload(s));
});

/** Clinic-wide settings (backup folder) can only be changed by an administrator. */
router.put('/settings', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const patch = {};
  if (!IS_CLOUD && typeof body.backupFolder === 'string') {
    patch.backupFolder = body.backupFolder.trim();
  }
  const next = await saveSettings(patch);
  res.json(settingsPayload(next));
});

router.post('/login', async (req, res) => {
  if (tooManyAttempts(req, res)) return;
  const username = String(req.body?.username || '').slice(0, 64);
  const password = String(req.body?.password || '').slice(0, MAX_PASSWORD_LENGTH);
  const user = await getUserByUsername(username);
  // Same message and timing whether the username exists or not.
  const ok = (await checkPassword(user, password)) && Boolean(user?.active);
  if (!ok) {
    recordFailedAttempt(req);
    console.warn(`[auth] Failed login for "${username.replace(/[^\w.@-]/g, '?')}" from ${req.ip}`);
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  clearFailedAttempts(req);
  await recordLogin(user.id);
  console.log(`[auth] ${user.username} signed in from ${req.ip}`);
  const { token, expiresAt } = await issueToken(user);
  res.json({ ok: true, token, expiresAt, user: publicUser(user) });
});

/** Only reachable with a valid token (requireAuth); the client calls it on startup. */
router.get('/session', (req, res) => {
  res.json({ ok: true, user: req.user });
});

router.post('/backup', async (_req, res) => {
  try {
    const result = await createBackup({ persist: true });
    res.json({
      ok: true,
      zipName: result.zipName,
      lastBackupAt: result.createdAt,
      size: result.size,
      downloadUrl: `/api/system/backups/latest/download`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Backup failed' });
  }
});

router.get('/drive-backup', async (_req, res) => {
  try {
    res.json(await driveBackupStatus());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load Drive status' });
  }
});

router.post('/drive-backup', async (_req, res) => {
  try {
    const result = await runGoogleDriveBackupNow();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Google Drive upload failed' });
  }
});

/**
 * External cron (e.g. cron-job.org) can wake Render and trigger the daily Drive upload.
 * Set BACKUP_CRON_SECRET on Render and send header: X-Cron-Secret: <secret>
 */
router.post('/cron/drive-backup', async (req, res) => {
  const expected = String(process.env.BACKUP_CRON_SECRET || '').trim();
  if (!expected) {
    return res.status(503).json({
      error: 'BACKUP_CRON_SECRET is not set on the server',
    });
  }
  // Header only: secrets in the URL end up in proxy and access logs.
  const provided = String(req.get('X-Cron-Secret') || '').trim();
  if (!provided || !safeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await runGoogleDriveBackupNow();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Google Drive upload failed' });
  }
});

/** Laptop ↔ cloud sync status: last sync, laptop changes not yet synced, any sync running. */
router.get('/cloud-sync', async (_req, res) => {
  if (!isCloudSyncConfigured()) return res.json({ configured: false });
  const state = readSyncState();
  let pending = null;
  try {
    pending = await localChangesSinceSync();
  } catch (err) {
    pending = { error: err.message };
  }
  res.json({
    configured: true,
    ...cloudSyncStatus(),
    lastSyncAt: state.lastSyncAt || null,
    lastResult: state.lastResult || null,
    pending,
    auto: {
      ...autoSyncSettings(),
      lastCheckAt: state.auto?.lastCheckAt || null,
      outcome: state.auto?.outcome || null,
      message: state.auto?.message || null,
      /** Set when a sync stopped to protect data; automatic sync waits for the doctor. */
      blocked: state.autoBlocked || null,
    },
  });
});

/** Start a two-way sync in the background; poll GET /cloud-sync for the result. */
router.post('/cloud-sync', (req, res) => {
  if (!isCloudSyncConfigured()) {
    return res.status(400).json({ error: 'Cloud sync is not set up on this computer.' });
  }
  if (cloudSyncStatus().running) {
    return res.status(409).json({ error: 'A sync is already running.' });
  }
  const force = Boolean(req.body?.force);
  // Errors are saved in the sync state and shown by GET /cloud-sync.
  syncBoth({ force }).catch((err) => console.error('[cloud-sync]', err.message));
  res.status(202).json({ started: true });
});

function sendBackupFile(res, file) {
  const name = String(file.zipName).replace(/[^\w.-]/g, '_');
  res.setHeader(
    'Content-Type',
    name.endsWith(ENCRYPTED_EXT) ? 'application/octet-stream' : 'application/zip'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(file.buffer);
}

router.get('/backups', async (_req, res) => {
  try {
    res.json(await listBackups());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not list backups' });
  }
});

router.get('/backups/latest/download', async (_req, res) => {
  try {
    const list = await listBackups();
    if (!list.length) return res.status(404).json({ error: 'No backups found' });
    const file = await getBackupBuffer(list[0].id);
    if (!file) return res.status(404).json({ error: 'Backup file missing' });
    sendBackupFile(res, file);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Download failed' });
  }
});

router.get('/backups/:id/download', async (req, res) => {
  try {
    const file = await getBackupBuffer(req.params.id);
    if (!file) return res.status(404).json({ error: 'Backup not found' });
    sendBackupFile(res, file);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Download failed' });
  }
});

export default router;
