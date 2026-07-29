import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import archiver from 'archiver';
import {
  db,
  DATA_DIR,
  UPLOADS_DIR,
  BACKUPS_DIR,
  IS_CLOUD,
  getSettings,
  saveSettings,
  readUploadFile,
} from './db.js';

/** How many ZIP backups to keep. Cloud default is lower to save MySQL disk. */
const KEEP_BACKUPS = Number(process.env.BACKUP_KEEP || (IS_CLOUD ? 7 : 14)) || 14;

/** Create a backup if last one is older than this many hours (covers Render sleep). */
const STALE_HOURS = Number(process.env.BACKUP_STALE_HOURS || 20) || 20;

function stampName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  return `EyeClinic-Backup-${stamp}.zip`;
}

async function collectZipToBuffer() {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const pass = new PassThrough();
  const chunks = [];
  pass.on('data', (c) => chunks.push(c));

  const done = pipeline(archive, pass);

  const patients = await db.prepare('SELECT * FROM patients').all();
  const visits = await db.prepare('SELECT * FROM visits').all();
  const progress = await db.prepare('SELECT * FROM progress_logs').all();
  const attachments = await db.prepare('SELECT * FROM attachments').all();
  const diseaseAssessments = await db.prepare('SELECT * FROM disease_assessments').all();
  let customForms = [];
  try {
    customForms = await db.prepare('SELECT * FROM custom_disease_forms').all();
  } catch {
    customForms = [];
  }
  const settings = await getSettings();

  archive.append(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        version: 2,
        patients,
        visits,
        progress_logs: progress,
        attachments: attachments.map(({ ...a }) => a),
        disease_assessments: diseaseAssessments,
        custom_disease_forms: customForms,
        settings: {
          backupFolder: settings.backupFolder,
          lastBackupAt: settings.lastBackupAt,
          hasPassword: Boolean(settings.clinicPassword),
        },
      },
      null,
      2
    ),
    { name: 'snapshot.json' }
  );

  archive.append(
    [
      'Eye Clinic Matara — Backup ZIP',
      '',
      'Contents:',
      '  snapshot.json  — full database export (restore source)',
      '  uploads/       — attached images and PDFs',
      '',
      'Restore (empty target MySQL recommended):',
      '  1. Unzip this file',
      '  2. Point MYSQL_* at the destination database',
      '  3. For cloud hosts: set STORE_FILES_IN_DB=1',
      '  4. node scripts/restore-from-backup.mjs <path-to-this-zip-or-folder>',
      '',
      'Also keep a copy on Google Drive / USB — do not rely only on the server.',
      `Created: ${new Date().toISOString()}`,
      '',
    ].join('\n'),
    { name: 'README-RESTORE.txt' }
  );

  if (!IS_CLOUD && fs.existsSync(UPLOADS_DIR)) {
    archive.directory(UPLOADS_DIR, 'uploads');
  } else {
    for (const row of attachments) {
      const buf = await readUploadFile(row.relative_path);
      if (buf) {
        archive.append(buf, { name: `uploads/${row.relative_path.replace(/\\/g, '/')}` });
      }
    }
  }

  if (!IS_CLOUD && fs.existsSync(path.join(DATA_DIR, 'settings.json'))) {
    archive.file(path.join(DATA_DIR, 'settings.json'), { name: 'settings.json' });
  }

  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}

async function pruneOldBackups() {
  if (IS_CLOUD) {
    const rows = await db
      .prepare('SELECT id FROM backup_archives ORDER BY created_at DESC')
      .all();
    for (const row of rows.slice(KEEP_BACKUPS)) {
      await db.prepare('DELETE FROM backup_archives WHERE id = ?').run(row.id);
    }
    return;
  }
  if (!fs.existsSync(BACKUPS_DIR)) return;
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('EyeClinic-Backup-') && f.endsWith('.zip'))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const file of files.slice(KEEP_BACKUPS)) {
    fs.unlinkSync(path.join(BACKUPS_DIR, file.name));
  }
}

/**
 * Creates a ZIP backup. Returns metadata + optional buffer for download.
 */
export async function createBackup({ persist = true } = {}) {
  const zipName = stampName();
  const buffer = await collectZipToBuffer();
  const createdAt = new Date().toISOString();

  if (persist) {
    if (IS_CLOUD) {
      await db
        .prepare(`INSERT INTO backup_archives (zip_name, content, created_at) VALUES (?, ?, ?)`)
        .run(zipName, buffer, createdAt);
    } else {
      const settings = await getSettings();
      const folder = settings.backupFolder || BACKUPS_DIR;
      fs.mkdirSync(folder, { recursive: true });
      const zipPath = path.join(folder, zipName);
      await new Promise((resolve, reject) => {
        const output = createWriteStream(zipPath);
        output.on('close', resolve);
        output.on('error', reject);
        output.end(buffer);
      });
    }
    await pruneOldBackups();
    await saveSettings({ lastBackupAt: createdAt });
  }

  return { zipName, createdAt, buffer, size: buffer.length };
}

export async function listBackups() {
  if (IS_CLOUD) {
    const rows = await db
      .prepare(
        'SELECT id, zip_name, created_at, LENGTH(content) AS size FROM backup_archives ORDER BY created_at DESC'
      )
      .all();
    return rows.map((r) => ({
      id: r.id,
      zipName: r.zip_name,
      createdAt: r.created_at,
      size: r.size,
    }));
  }
  const settings = await getSettings();
  const folder = settings.backupFolder || BACKUPS_DIR;
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter((f) => f.startsWith('EyeClinic-Backup-') && f.endsWith('.zip'))
    .map((f) => {
      const full = path.join(folder, f);
      const st = fs.statSync(full);
      return {
        id: f,
        zipName: f,
        createdAt: st.mtime.toISOString(),
        size: st.size,
        path: full,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getBackupBuffer(id) {
  if (IS_CLOUD) {
    const row = await db
      .prepare('SELECT zip_name, content FROM backup_archives WHERE id = ?')
      .get(id);
    if (!row) return null;
    return { zipName: row.zip_name, buffer: Buffer.from(row.content) };
  }
  const settings = await getSettings();
  const folder = settings.backupFolder || BACKUPS_DIR;
  const safe = path.basename(id);
  const full = path.join(folder, safe);
  if (!fs.existsSync(full)) return null;
  return { zipName: safe, buffer: fs.readFileSync(full) };
}

export function isBackupStale(lastBackupAt, now = Date.now()) {
  if (!lastBackupAt) return true;
  const t = Date.parse(lastBackupAt);
  if (Number.isNaN(t)) return true;
  return now - t > STALE_HOURS * 60 * 60 * 1000;
}

let lastAutoDate = null;

export function startDailyBackupScheduler() {
  const tick = async () => {
    try {
      const settings = await getSettings();
      const today = new Date().toISOString().slice(0, 10);
      const hour = new Date().getHours();

      // If last backup is stale (e.g. Render slept through evening), back up on wake.
      if (isBackupStale(settings.lastBackupAt)) {
        await createBackup({ persist: true });
        lastAutoDate = today;
        console.log(`[backup] Stale/missing backup refreshed for ${today}`);
        return;
      }

      if (lastAutoDate === today) return;
      if (settings.lastBackupAt?.startsWith(today)) {
        lastAutoDate = today;
        return;
      }
      // Evening window (local server time) for a second copy on always-on hosts
      if (hour < 18 && hour > 2) return;

      await createBackup({ persist: true });
      lastAutoDate = today;
      console.log(`[backup] Daily backup completed for ${today}`);
    } catch (err) {
      console.error('[backup] Daily backup failed:', err);
    }
  };

  setInterval(tick, 30 * 60 * 1000);
  setTimeout(tick, 20_000);
}
