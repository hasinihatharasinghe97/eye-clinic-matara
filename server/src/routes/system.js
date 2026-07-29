import { Router } from 'express';
import {
  getSettings,
  saveSettings,
  IS_CLOUD,
  BACKUPS_DIR,
} from '../db.js';
import { createBackup, listBackups, getBackupBuffer } from '../backup.js';

const router = Router();

router.get('/settings', async (_req, res) => {
  const s = await getSettings();
  res.json({
    backupFolder: s.backupFolder,
    lastBackupAt: s.lastBackupAt,
    hasPassword: Boolean(s.clinicPassword),
    cloudMode: IS_CLOUD,
    defaultBackupFolder: BACKUPS_DIR,
  });
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
  res.json({
    backupFolder: next.backupFolder,
    lastBackupAt: next.lastBackupAt,
    hasPassword: Boolean(next.clinicPassword),
    cloudMode: IS_CLOUD,
    defaultBackupFolder: BACKUPS_DIR,
  });
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
