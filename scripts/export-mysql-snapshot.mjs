/**
 * Export the current MySQL database to snapshot.json (same shape as in-app Backup ZIPs).
 * Use this before importing into a cloud MySQL (Aiven + Render).
 *
 * Usage (PowerShell) — uses .env / MYSQL_* for the *source* database:
 *   node scripts/export-mysql-snapshot.mjs
 *   node scripts/export-mysql-snapshot.mjs D:\backups\snapshot.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outPath = path.resolve(
  process.argv[2] || path.join(root, 'data', 'backups', 'snapshot.json')
);

const { db, getSettings } = await import('../server/src/db.js');

const patients = await db.prepare('SELECT * FROM patients').all();
const visits = await db.prepare('SELECT * FROM visits').all();
const progress_logs = await db.prepare('SELECT * FROM progress_logs').all();
const attachments = await db.prepare('SELECT * FROM attachments').all();
const disease_assessments = await db.prepare('SELECT * FROM disease_assessments').all();

let custom_disease_forms = [];
try {
  custom_disease_forms = await db.prepare('SELECT * FROM custom_disease_forms').all();
} catch {
  /* table may not exist on older DBs */
}

const settings = await getSettings();

const snap = {
  exportedAt: new Date().toISOString(),
  patients,
  visits,
  progress_logs,
  attachments,
  disease_assessments,
  custom_disease_forms,
  settings: {
    backupFolder: settings.backupFolder,
    lastBackupAt: settings.lastBackupAt,
    hasPassword: Boolean(settings.clinicPassword),
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(snap, null, 2), 'utf8');

console.log(`Wrote ${outPath}`);
console.log(
  `${patients.length} patients, ${visits.length} visits, ${progress_logs.length} progress, ${attachments.length} attachments, ${disease_assessments.length} assessments, ${custom_disease_forms.length} custom forms`
);
console.log('Next: import into cloud MySQL with STORE_FILES_IN_DB=1 — see docs/HOSTING.md');
process.exit(0);
