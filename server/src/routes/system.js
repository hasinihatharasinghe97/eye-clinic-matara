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
import { driveBackupStatus, isGoogleDriveConfigured } from '../googleDriveBackup.js';

const router = Router();

function settingsPayload(s) {
  return {
    backupFolder: s.backupFolder,
    lastBackupAt: s.lastBackupAt,
    hasPassword: Boolean(s.clinicPassword),
    cloudMode: IS_CLOUD,
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
  res.json(settingsPayload(next));
});

router.post('/login', async (req, res) => {
  const password = String(req.body?.password || '');
  const settings = await getSettings();
  if (password !== settings.clinicPassword) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  res.json({ ok: true, token: 'local-clinic' });
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
