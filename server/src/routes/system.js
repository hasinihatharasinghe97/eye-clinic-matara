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
import { clearAuthKeyCache, issueToken, passwordMatches } from '../auth.js';
import { driveBackupStatus, isGoogleDriveConfigured } from '../googleDriveBackup.js';
import {
  cloudSyncStatus,
  isCloudSyncConfigured,
  localChangesSinceSync,
  pushToCloud,
  readSyncState,
} from '../cloudSync.js';
import { isReadOnly } from '../readOnly.js';

const router = Router();

function settingsPayload(s) {
  return {
    backupFolder: s.backupFolder,
    lastBackupAt: s.lastBackupAt,
    hasPassword: Boolean(s.clinicPassword),
    cloudMode: IS_CLOUD,
    /** Online copy that only mirrors the clinic laptop; edits are blocked. */
    readOnly: isReadOnly(),
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

router.put('/settings', async (req, res) => {
  const body = req.body || {};
  const patch = {};
  if (!IS_CLOUD && typeof body.backupFolder === 'string') {
    patch.backupFolder = body.backupFolder.trim();
  }
  if (typeof body.clinicPassword === 'string' && body.clinicPassword.length >= 4) {
    patch.clinicPassword = body.clinicPassword;
  }
  const next = await saveSettings(patch);
  if (patch.clinicPassword) clearAuthKeyCache();
  res.json(settingsPayload(next));
});

router.post('/login', async (req, res) => {
  const password = String(req.body?.password || '');
  const settings = await getSettings();
  if (!passwordMatches(password, settings.clinicPassword)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  const { token, expiresAt } = await issueToken();
  res.json({ ok: true, token, expiresAt });
});

/** Only reachable with a valid token (requireAuth); the client calls it on startup. */
router.get('/session', (_req, res) => {
  res.json({ ok: true });
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
  const provided = String(req.get('X-Cron-Secret') || req.query.secret || '').trim();
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await runGoogleDriveBackupNow();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Google Drive upload failed' });
  }
});

/** Laptop → cloud sync status: last sync, what changed since, and any sync in progress. */
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
    lastPushAt: state.lastPushAt || null,
    lastPullAt: state.lastPullAt || null,
    lastResult: state.lastResult || null,
    pending,
  });
});

/** Start a laptop → cloud sync in the background; poll GET /cloud-sync for the result. */
router.post('/cloud-sync', (req, res) => {
  if (!isCloudSyncConfigured()) {
    return res.status(400).json({ error: 'Cloud sync is not set up on this computer.' });
  }
  if (cloudSyncStatus().running) {
    return res.status(409).json({ error: 'A sync is already running.' });
  }
  const force = Boolean(req.body?.force);
  // Errors are saved in the sync state and shown by GET /cloud-sync.
  pushToCloud({ force }).catch((err) => console.error('[cloud-sync]', err.message));
  res.status(202).json({ started: true });
});

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
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${file.zipName}"`);
    res.send(file.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Download failed' });
  }
});

router.get('/backups/:id/download', async (req, res) => {
  try {
    const file = await getBackupBuffer(req.params.id);
    if (!file) return res.status(404).json({ error: 'Backup not found' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${file.zipName}"`);
    res.send(file.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Download failed' });
  }
});

export default router;
