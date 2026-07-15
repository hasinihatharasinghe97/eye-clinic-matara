/**
 * Copy local data/patients.db (+ uploads) into a Turso database.
 *
 * Usage (PowerShell):
 *   $env:TURSO_DATABASE_URL="libsql://...."
 *   $env:TURSO_AUTH_TOKEN="...."
 *   node scripts/migrate-to-turso.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const dbPath = path.join(dataDir, 'patients.db');
const uploadsDir = path.join(dataDir, 'uploads');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before running.');
  process.exit(1);
}
if (!fs.existsSync(dbPath)) {
  console.error(`Local database not found: ${dbPath}`);
  process.exit(1);
}

const local = createClient({ url: pathToFileURL(dbPath).href });
const remote = createClient({ url, authToken });

async function all(client, sql) {
  const rs = await client.execute(sql);
  return rs.rows.map((r) => ({ ...r }));
}

console.log('Reading local database…');
const patients = await all(local, 'SELECT * FROM patients');
const visits = await all(local, 'SELECT * FROM visits');
const progress = await all(local, 'SELECT * FROM progress_logs');
const attachments = await all(local, 'SELECT * FROM attachments');

console.log(
  `Found ${patients.length} patients, ${visits.length} visits, ${progress.length} progress logs, ${attachments.length} attachments`
);

await remote.executeMultiple(`
  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER,
    gender TEXT,
    registration_date TEXT,
    opd_ad_no TEXT,
    occupation TEXT,
    id_number TEXT,
    address TEXT,
    phone TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    visit_date TEXT NOT NULL,
    co_complaints TEXT,
    oc_other TEXT,
    family_history TEXT,
    exam_external TEXT,
    vision TEXT,
    inspection TEXT,
    slit_lamp TEXT,
    cataract TEXT,
    ix_history TEXT,
    diagnosis TEXT,
    iop TEXT,
    color_vision TEXT,
    visual_field TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS progress_logs (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    log_date TEXT NOT NULL,
    right_eye TEXT,
    left_eye TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    visit_id TEXT,
    relative_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attachment_files (
    relative_path TEXT PRIMARY KEY,
    content BLOB NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS backup_archives (
    id TEXT PRIMARY KEY,
    zip_name TEXT NOT NULL,
    content BLOB NOT NULL,
    created_at TEXT NOT NULL
  );
`);

async function upsert(table, rows, columns) {
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  for (const row of rows) {
    const args = columns.map((c) => row[c] ?? null);
    await remote.execute({ sql, args });
  }
}

console.log('Uploading patients…');
await upsert(patients.length ? 'patients' : 'patients', patients, [
  'id',
  'name',
  'age',
  'gender',
  'registration_date',
  'opd_ad_no',
  'occupation',
  'id_number',
  'address',
  'phone',
  'created_at',
  'updated_at',
]);

console.log('Uploading visits…');
await upsert('visits', visits, [
  'id',
  'patient_id',
  'visit_date',
  'co_complaints',
  'oc_other',
  'family_history',
  'exam_external',
  'vision',
  'inspection',
  'slit_lamp',
  'cataract',
  'ix_history',
  'diagnosis',
  'iop',
  'color_vision',
  'visual_field',
  'notes',
  'created_at',
  'updated_at',
]);

console.log('Uploading progress…');
await upsert('progress_logs', progress, [
  'id',
  'patient_id',
  'log_date',
  'right_eye',
  'left_eye',
  'created_at',
]);

console.log('Uploading attachment metadata…');
await upsert('attachments', attachments, [
  'id',
  'patient_id',
  'visit_id',
  'relative_path',
  'original_name',
  'mime_type',
  'created_at',
]);

console.log('Uploading files…');
let files = 0;
for (const a of attachments) {
  const rel = String(a.relative_path).replace(/\\/g, '/');
  const full = path.join(uploadsDir, rel);
  if (!fs.existsSync(full)) {
    console.warn(`Missing file: ${full}`);
    continue;
  }
  const content = fs.readFileSync(full);
  await remote.execute({
    sql: `INSERT OR REPLACE INTO attachment_files (relative_path, content) VALUES (?, ?)`,
    args: [rel, content],
  });
  files += 1;
}

const settingsPath = path.join(dataDir, 'settings.json');
if (fs.existsSync(settingsPath)) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  await remote.execute({
    sql: `INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`,
    args: ['clinic_settings', JSON.stringify(settings)],
  });
}

console.log(`Done. Migrated ${files} upload files to Turso.`);
console.log('Deploy the Render app with the same TURSO_* env vars, then open the public URL.');
