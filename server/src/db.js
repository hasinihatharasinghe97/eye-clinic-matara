import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const defaultDataDir = path.resolve(__dirname, '../../data');
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : defaultDataDir;
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'patients.db');
export const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

/** True when using hosted Turso instead of a local SQLite file. */
export const IS_CLOUD = Boolean(process.env.TURSO_DATABASE_URL);

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

const tursoUrl = process.env.TURSO_DATABASE_URL;
const client = createClient(
  tursoUrl
    ? {
        url: tursoUrl,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }
    : {
        url: pathToFileURL(DB_PATH).href,
      }
);

function normalizeRow(row) {
  if (!row) return undefined;
  if (Array.isArray(row)) return row;
  // libSQL may return Row objects; spread into a plain object
  return { ...row };
}

function prepare(sql) {
  return {
    async all(...args) {
      const rs = await client.execute({ sql, args });
      return rs.rows.map(normalizeRow);
    },
    async get(...args) {
      const rs = await client.execute({ sql, args });
      return normalizeRow(rs.rows[0]);
    },
    async run(...args) {
      return client.execute({ sql, args });
    },
  };
}

async function exec(sql) {
  await client.executeMultiple(sql);
}

export const db = { prepare, exec, client };

await exec(`
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

  CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
  CREATE INDEX IF NOT EXISTS idx_patients_opd ON patients(opd_ad_no);
  CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
  CREATE INDEX IF NOT EXISTS idx_patients_id_number ON patients(id_number);

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
    updated_at TEXT NOT NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id);
  CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);

  CREATE TABLE IF NOT EXISTS progress_logs (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    log_date TEXT NOT NULL,
    right_eye TEXT,
    left_eye TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_progress_patient ON progress_logs(patient_id);

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    visit_id TEXT,
    relative_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_attachments_patient ON attachments(patient_id);

  CREATE TABLE IF NOT EXISTS attachment_files (
    relative_path TEXT PRIMARY KEY,
    content BLOB NOT NULL
  );

  CREATE TABLE IF NOT EXISTS backup_archives (
    id TEXT PRIMARY KEY,
    zip_name TEXT NOT NULL,
    content BLOB NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const SETTINGS_KEY = 'clinic_settings';

async function ensureSettingsRow() {
  await exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

await ensureSettingsRow();

function defaultSettings() {
  return {
    clinicPassword: process.env.CLINIC_PASSWORD || 'clinic123',
    backupFolder: process.env.BACKUP_FOLDER || BACKUPS_DIR,
    lastBackupAt: null,
  };
}

export async function getSettings() {
  const defaults = defaultSettings();
  try {
    if (!IS_CLOUD && fs.existsSync(SETTINGS_PATH)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) };
    }
    const row = await db.prepare('SELECT value FROM app_settings WHERE key = ?').get(SETTINGS_KEY);
    if (row?.value) {
      return { ...defaults, ...JSON.parse(row.value) };
    }
  } catch {
    /* use defaults */
  }
  return defaults;
}

export async function saveSettings(partial) {
  const next = { ...(await getSettings()), ...partial };
  const payload = JSON.stringify(next, null, 2);
  if (!IS_CLOUD) {
    fs.writeFileSync(SETTINGS_PATH, payload, 'utf8');
  }
  await db
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export async function storeUploadFile(relativePath, buffer) {
  if (!IS_CLOUD) {
    const full = path.join(UPLOADS_DIR, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buffer);
    return;
  }
  await db
    .prepare(
      `INSERT INTO attachment_files (relative_path, content) VALUES (?, ?)
       ON CONFLICT(relative_path) DO UPDATE SET content = excluded.content`
    )
    .run(relativePath, buffer);
}

export async function readUploadFile(relativePath) {
  if (!IS_CLOUD) {
    const full = path.join(UPLOADS_DIR, relativePath);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full);
  }
  const row = await db
    .prepare('SELECT content FROM attachment_files WHERE relative_path = ?')
    .get(relativePath);
  if (!row?.content) return null;
  return Buffer.from(row.content);
}

export async function deleteUploadFile(relativePath) {
  if (!IS_CLOUD) {
    const full = path.join(UPLOADS_DIR, relativePath);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return;
  }
  await db.prepare('DELETE FROM attachment_files WHERE relative_path = ?').run(relativePath);
}

export default db;
