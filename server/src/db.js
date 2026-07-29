import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

/** Load KEY=VALUE pairs from a .env file into process.env. */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  // Strip UTF-8 BOM if Notepad/Windows saved one
  let text = fs.readFileSync(filePath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let loaded = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Prefer .env values over empty shell vars (common on Windows)
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
      loaded += 1;
    }
  }
  return loaded > 0;
}

const envPath = path.join(PROJECT_ROOT, '.env');
const envLocalPath = path.join(PROJECT_ROOT, '.env.local');
const loadedEnv = loadEnvFile(envPath) || loadEnvFile(envLocalPath);
if (!loadedEnv && !fs.existsSync(envPath)) {
  console.warn(`No .env file found at ${envPath}`);
}

const defaultDataDir = path.resolve(PROJECT_ROOT, 'data');
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : defaultDataDir;
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
/** @deprecated Kept for backup script compatibility; MySQL replaces the SQLite file. */
export const DB_PATH = path.join(DATA_DIR, 'patients.db');
export const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const MYSQL_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD ?? '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'eye_clinic';

if (!MYSQL_PASSWORD) {
  console.error(`\nMYSQL_PASSWORD is empty.`);
  console.error(`Open ${envPath} and set it on this line (no spaces around =):`);
  console.error('  MYSQL_PASSWORD=YourActualPassword');
  console.error('Save the file (Ctrl+S), then restart the app.\n');
  throw new Error(`MYSQL_PASSWORD is not set in ${envPath}`);
}

/**
 * When true, uploads and ZIP backups are stored in MySQL (needed on hosts with
 * ephemeral disks such as Render). Local clinic PCs keep files on disk.
 */
export const IS_CLOUD =
  process.env.STORE_FILES_IN_DB === '1' ||
  process.env.STORE_FILES_IN_DB === 'true' ||
  Boolean(process.env.RENDER);

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

async function ensureDatabaseExists() {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      multipleStatements: true,
    });
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (err) {
    if (err?.code === 'ER_ACCESS_DENIED_ERROR') {
      const envPath = path.join(PROJECT_ROOT, '.env');
      console.error('\nMySQL login failed for user:', MYSQL_USER);
      console.error(
        MYSQL_PASSWORD
          ? 'Password was sent, but MySQL rejected it.'
          : 'No password was set (MYSQL_PASSWORD is empty).'
      );
      console.error(`Edit ${envPath} and set MYSQL_USER / MYSQL_PASSWORD to your MySQL account.`);
      console.error('Example:');
      console.error('  MYSQL_HOST=127.0.0.1');
      console.error('  MYSQL_USER=root');
      console.error('  MYSQL_PASSWORD=your_mysql_password');
      console.error('  MYSQL_DATABASE=eye_clinic\n');
    }
    throw err;
  } finally {
    if (conn) await conn.end();
  }
}

await ensureDatabaseExists();

const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,
});

function prepare(sql) {
  return {
    async all(...args) {
      const [rows] = await pool.execute(sql, args);
      return rows;
    },
    async get(...args) {
      const [rows] = await pool.execute(sql, args);
      return rows[0];
    },
    async run(...args) {
      const [result] = await pool.execute(sql, args);
      return result;
    },
  };
}

async function exec(sql) {
  const statements = String(sql)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const conn = await pool.getConnection();
  try {
    for (const statement of statements) {
      await conn.query(statement);
    }
  } finally {
    conn.release();
  }
}

/** CREATE INDEX compatible with MySQL 5.7 / MariaDB (no IF NOT EXISTS). */
async function ensureIndex(indexName, tableName, columnList) {
  try {
    await exec(`CREATE INDEX ${indexName} ON ${tableName}(${columnList})`);
  } catch (err) {
    // 1061 = duplicate key name
    if (err?.errno !== 1061 && err?.code !== 'ER_DUP_KEYNAME') throw err;
  }
}

export const db = { prepare, exec, pool };

await exec(`
  CREATE TABLE IF NOT EXISTS patients (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    age INT NULL,
    gender VARCHAR(32) NULL,
    registration_date VARCHAR(32) NULL,
    opd_ad_no VARCHAR(128) NULL,
    occupation VARCHAR(255) NULL,
    id_number VARCHAR(128) NULL,
    address TEXT NULL,
    phone VARCHAR(64) NULL,
    conditions TEXT NULL,
    medicines_sent TEXT NULL,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS visits (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    visit_date VARCHAR(32) NOT NULL,
    co_complaints TEXT NULL,
    oc_other TEXT NULL,
    family_history TEXT NULL,
    exam_external TEXT NULL,
    vision TEXT NULL,
    inspection TEXT NULL,
    slit_lamp TEXT NULL,
    cataract TEXT NULL,
    ix_history TEXT NULL,
    diagnosis TEXT NULL,
    iop TEXT NULL,
    color_vision TEXT NULL,
    visual_field TEXT NULL,
    notes TEXT NULL,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    CONSTRAINT fk_visits_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS progress_logs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    log_date VARCHAR(32) NOT NULL,
    right_eye TEXT NULL,
    left_eye TEXT NULL,
    right_score DOUBLE NULL,
    left_score DOUBLE NULL,
    created_at VARCHAR(64) NOT NULL,
    CONSTRAINT fk_progress_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS attachments (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    visit_id INT NULL,
    relative_path VARCHAR(512) NOT NULL,
    original_name VARCHAR(512) NOT NULL,
    mime_type VARCHAR(128) NULL,
    created_at VARCHAR(64) NOT NULL,
    CONSTRAINT fk_attachments_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_attachments_visit
      FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS attachment_files (
    relative_path VARCHAR(512) PRIMARY KEY,
    content LONGBLOB NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS backup_archives (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    zip_name VARCHAR(255) NOT NULL,
    content LONGBLOB NOT NULL,
    created_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS disease_assessments (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    form_type VARCHAR(128) NOT NULL,
    assessment_date VARCHAR(32) NOT NULL,
    eye VARCHAR(16) NULL,
    \`data\` LONGTEXT NULL,
    notes TEXT NULL,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    CONSTRAINT fk_disease_patient
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS app_settings (
    \`key\` VARCHAR(128) PRIMARY KEY,
    value LONGTEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS custom_disease_forms (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    short_title VARCHAR(255) NOT NULL,
    fields LONGTEXT NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);

await ensureIndex('idx_patients_name', 'patients', 'name');
await ensureIndex('idx_patients_opd', 'patients', 'opd_ad_no');
await ensureIndex('idx_patients_phone', 'patients', 'phone');
await ensureIndex('idx_patients_id_number', 'patients', 'id_number');
await ensureIndex('idx_visits_patient', 'visits', 'patient_id');
await ensureIndex('idx_visits_date', 'visits', 'visit_date');
await ensureIndex('idx_progress_patient', 'progress_logs', 'patient_id');
await ensureIndex('idx_attachments_patient', 'attachments', 'patient_id');
await ensureIndex('idx_disease_assessments_patient', 'disease_assessments', 'patient_id');
await ensureIndex('idx_disease_assessments_type', 'disease_assessments', 'form_type');

async function tableColumns(tableName) {
  const rows = await db
    .prepare(
      `SELECT COLUMN_NAME AS name, DATA_TYPE AS dataType
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`
    )
    .all(tableName);
  return rows.map((r) => ({
    name: r.name ?? r.NAME ?? r.COLUMN_NAME,
    dataType: String(r.dataType ?? r.DATA_TYPE ?? r.datatype ?? '').toLowerCase(),
  }));
}

/** Convert legacy UUID/VARCHAR ids to INT AUTO_INCREMENT, preserving rows. */
async function migrateIdsToAutoIncrement() {
  const patientCols = await tableColumns('patients');
  const idCol = patientCols.find((c) => c.name === 'id');
  if (!idCol || idCol.dataType === 'int' || idCol.dataType === 'bigint') return;

  console.log('[db] Migrating primary keys from UUID/VARCHAR to AUTO_INCREMENT integers…');

  const patients = await db.prepare('SELECT * FROM patients ORDER BY created_at, id').all();
  const visits = await db.prepare('SELECT * FROM visits ORDER BY created_at, id').all();
  const progress = await db.prepare('SELECT * FROM progress_logs ORDER BY created_at, id').all();
  const attachments = await db.prepare('SELECT * FROM attachments ORDER BY created_at, id').all();
  const assessments = await db
    .prepare('SELECT * FROM disease_assessments ORDER BY created_at, id')
    .all();
  let backups = [];
  try {
    backups = await db.prepare('SELECT * FROM backup_archives ORDER BY created_at, id').all();
  } catch {
    backups = [];
  }

  await exec(`
    SET FOREIGN_KEY_CHECKS = 0;
    DROP TABLE IF EXISTS disease_assessments;
    DROP TABLE IF EXISTS attachments;
    DROP TABLE IF EXISTS progress_logs;
    DROP TABLE IF EXISTS visits;
    DROP TABLE IF EXISTS patients;
    DROP TABLE IF EXISTS backup_archives;
    SET FOREIGN_KEY_CHECKS = 1;
  `);

  await exec(`
    CREATE TABLE patients (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      age INT NULL,
      gender VARCHAR(32) NULL,
      registration_date VARCHAR(32) NULL,
      opd_ad_no VARCHAR(128) NULL,
      occupation VARCHAR(255) NULL,
      id_number VARCHAR(128) NULL,
      address TEXT NULL,
      phone VARCHAR(64) NULL,
      conditions TEXT NULL,
      medicines_sent TEXT NULL,
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE visits (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      visit_date VARCHAR(32) NOT NULL,
      co_complaints TEXT NULL,
      oc_other TEXT NULL,
      family_history TEXT NULL,
      exam_external TEXT NULL,
      vision TEXT NULL,
      inspection TEXT NULL,
      slit_lamp TEXT NULL,
      cataract TEXT NULL,
      ix_history TEXT NULL,
      diagnosis TEXT NULL,
      iop TEXT NULL,
      color_vision TEXT NULL,
      visual_field TEXT NULL,
      notes TEXT NULL,
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NOT NULL,
      CONSTRAINT fk_visits_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE progress_logs (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      log_date VARCHAR(32) NOT NULL,
      right_eye TEXT NULL,
      left_eye TEXT NULL,
      right_score DOUBLE NULL,
      left_score DOUBLE NULL,
      created_at VARCHAR(64) NOT NULL,
      CONSTRAINT fk_progress_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE attachments (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      visit_id INT NULL,
      relative_path VARCHAR(512) NOT NULL,
      original_name VARCHAR(512) NOT NULL,
      mime_type VARCHAR(128) NULL,
      created_at VARCHAR(64) NOT NULL,
      CONSTRAINT fk_attachments_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      CONSTRAINT fk_attachments_visit
        FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE disease_assessments (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      form_type VARCHAR(128) NOT NULL,
      assessment_date VARCHAR(32) NOT NULL,
      eye VARCHAR(16) NULL,
      \`data\` LONGTEXT NULL,
      notes TEXT NULL,
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NOT NULL,
      CONSTRAINT fk_disease_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE backup_archives (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      zip_name VARCHAR(255) NOT NULL,
      content LONGBLOB NOT NULL,
      created_at VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const patientMap = new Map();
  for (const row of patients) {
    const result = await db
      .prepare(
        `INSERT INTO patients (
          name, age, gender, registration_date, opd_ad_no, occupation,
          id_number, address, phone, conditions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.name,
        row.age,
        row.gender,
        row.registration_date,
        row.opd_ad_no,
        row.occupation,
        row.id_number,
        row.address,
        row.phone,
        row.conditions ?? null,
        row.created_at,
        row.updated_at
      );
    patientMap.set(String(row.id), result.insertId);
  }

  const visitMap = new Map();
  for (const row of visits) {
    const patientId = patientMap.get(String(row.patient_id));
    if (!patientId) continue;
    const result = await db
      .prepare(
        `INSERT INTO visits (
          patient_id, visit_date, co_complaints, oc_other, family_history,
          exam_external, vision, inspection, slit_lamp, cataract, ix_history,
          diagnosis, iop, color_vision, visual_field, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        patientId,
        row.visit_date,
        row.co_complaints,
        row.oc_other,
        row.family_history,
        row.exam_external,
        row.vision,
        row.inspection,
        row.slit_lamp,
        row.cataract,
        row.ix_history,
        row.diagnosis,
        row.iop,
        row.color_vision,
        row.visual_field,
        row.notes,
        row.created_at,
        row.updated_at
      );
    visitMap.set(String(row.id), result.insertId);
  }

  for (const row of progress) {
    const patientId = patientMap.get(String(row.patient_id));
    if (!patientId) continue;
    await db
      .prepare(
        `INSERT INTO progress_logs (
          patient_id, log_date, right_eye, left_eye, right_score, left_score, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        patientId,
        row.log_date,
        row.right_eye,
        row.left_eye,
        row.right_score,
        row.left_score,
        row.created_at
      );
  }

  for (const row of attachments) {
    const patientId = patientMap.get(String(row.patient_id));
    if (!patientId) continue;
    const visitId = row.visit_id ? visitMap.get(String(row.visit_id)) ?? null : null;
    await db
      .prepare(
        `INSERT INTO attachments (
          patient_id, visit_id, relative_path, original_name, mime_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        patientId,
        visitId,
        row.relative_path,
        row.original_name,
        row.mime_type,
        row.created_at
      );
  }

  for (const row of assessments) {
    const patientId = patientMap.get(String(row.patient_id));
    if (!patientId) continue;
    await db
      .prepare(
        `INSERT INTO disease_assessments (
          patient_id, form_type, assessment_date, eye, \`data\`, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        patientId,
        row.form_type,
        row.assessment_date,
        row.eye,
        row.data,
        row.notes,
        row.created_at,
        row.updated_at
      );
  }

  for (const row of backups) {
    await db
      .prepare(`INSERT INTO backup_archives (zip_name, content, created_at) VALUES (?, ?, ?)`)
      .run(row.zip_name, row.content, row.created_at);
  }

  await ensureIndex('idx_patients_name', 'patients', 'name');
  await ensureIndex('idx_patients_opd', 'patients', 'opd_ad_no');
  await ensureIndex('idx_patients_phone', 'patients', 'phone');
  await ensureIndex('idx_patients_id_number', 'patients', 'id_number');
  await ensureIndex('idx_visits_patient', 'visits', 'patient_id');
  await ensureIndex('idx_visits_date', 'visits', 'visit_date');
  await ensureIndex('idx_progress_patient', 'progress_logs', 'patient_id');
  await ensureIndex('idx_attachments_patient', 'attachments', 'patient_id');
  await ensureIndex('idx_disease_assessments_patient', 'disease_assessments', 'patient_id');
  await ensureIndex('idx_disease_assessments_type', 'disease_assessments', 'form_type');

  console.log(
    `[db] Migration complete: ${patients.length} patients, ${visits.length} visits → integer ids`
  );
}

await migrateIdsToAutoIncrement();

// Migrate older DBs that predate newer columns
{
  const patientCols = await tableColumns('patients');
  if (!patientCols.some((c) => c.name === 'conditions')) {
    await exec('ALTER TABLE patients ADD COLUMN conditions TEXT NULL');
  }
  if (!patientCols.some((c) => c.name === 'medicines_sent')) {
    await exec('ALTER TABLE patients ADD COLUMN medicines_sent TEXT NULL');
  }
  const progressCols = await tableColumns('progress_logs');
  if (!progressCols.some((c) => c.name === 'right_score')) {
    await exec('ALTER TABLE progress_logs ADD COLUMN right_score DOUBLE NULL');
  }
  if (!progressCols.some((c) => c.name === 'left_score')) {
    await exec('ALTER TABLE progress_logs ADD COLUMN left_score DOUBLE NULL');
  }
}

const SETTINGS_KEY = 'clinic_settings';

function defaultSettings() {
  return {
    clinicPassword: process.env.CLINIC_PASSWORD || 'clinic123',
    // Empty string = project default (portable across PCs / folder moves)
    backupFolder: process.env.BACKUP_FOLDER || '',
    lastBackupAt: null,
  };
}

/** Paths that look like the in-project default (…/data/backups), not a custom Drive folder. */
function looksLikeProjectDefaultBackup(folder) {
  const resolved = path.resolve(folder);
  const base = path.basename(resolved).toLowerCase();
  const parent = path.basename(path.dirname(resolved)).toLowerCase();
  return base === 'backups' && parent === 'data';
}

function isCloudSyncPath(folder) {
  const lower = String(folder).toLowerCase();
  return (
    lower.includes('google drive') ||
    lower.includes('onedrive') ||
    lower.includes('dropbox')
  );
}

/** True when a saved path clearly belongs to another PC/user and is not usable here. */
function pathLooksUnusableOnThisPc(folder) {
  const resolved = path.resolve(folder);
  const root = path.parse(resolved).root;
  if (root && process.platform === 'win32' && !fs.existsSync(root)) {
    return true;
  }

  const match = resolved.match(/^([A-Za-z]:)[/\\]Users[/\\]([^/\\]+)[/\\]/i);
  if (!match) return false;

  const home = process.env.USERPROFILE || '';
  if (!home) return false;
  const currentUser = path.basename(home);
  const savedUser = match[2];
  if (!currentUser || savedUser.toLowerCase() === currentUser.toLowerCase()) {
    return false;
  }
  // Another Windows user's path — only reset if it does not exist on this PC
  return !fs.existsSync(resolved);
}

/**
 * Resolve a stored backup folder to an absolute path on this PC.
 * Handles moved project folders and handover to another laptop.
 */
export function resolveBackupFolder(saved) {
  if (process.env.BACKUP_FOLDER) return path.resolve(process.env.BACKUP_FOLDER);
  if (!saved || !String(saved).trim()) return BACKUPS_DIR;

  const resolved = path.resolve(String(saved).trim());
  const currentDefault = path.resolve(BACKUPS_DIR);
  if (resolved.toLowerCase() === currentDefault.toLowerCase()) return currentDefault;

  if (pathLooksUnusableOnThisPc(resolved)) return currentDefault;

  if (looksLikeProjectDefaultBackup(resolved) && !isCloudSyncPath(resolved)) {
    return currentDefault;
  }
  return resolved;
}

/** Persist default as empty so settings.json has no machine-specific path. */
function toStoredBackupFolder(resolvedAbsolute) {
  if (
    path.resolve(resolvedAbsolute).toLowerCase() === path.resolve(BACKUPS_DIR).toLowerCase()
  ) {
    return '';
  }
  return path.resolve(resolvedAbsolute);
}

async function persistSettingsObject(next) {
  const toWrite = { ...next };
  if (!IS_CLOUD && Object.prototype.hasOwnProperty.call(toWrite, 'backupFolder')) {
    const resolved = resolveBackupFolder(toWrite.backupFolder);
    toWrite.backupFolder = toStoredBackupFolder(resolved);
  }
  const payload = JSON.stringify(toWrite, null, 2);
  if (!IS_CLOUD) {
    fs.writeFileSync(SETTINGS_PATH, payload, 'utf8');
  }
  await db
    .prepare(
      `INSERT INTO app_settings (\`key\`, value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`
    )
    .run(SETTINGS_KEY, JSON.stringify(toWrite));
}

export async function getSettings() {
  const defaults = defaultSettings();
  let loaded = defaults;
  try {
    if (!IS_CLOUD && fs.existsSync(SETTINGS_PATH)) {
      loaded = { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) };
    } else {
      const row = await db
        .prepare('SELECT value FROM app_settings WHERE `key` = ?')
        .get(SETTINGS_KEY);
      if (row?.value) {
        loaded = { ...defaults, ...JSON.parse(row.value) };
      }
    }
  } catch {
    loaded = defaults;
  }

  const resolved = resolveBackupFolder(loaded.backupFolder);
  const portable = toStoredBackupFolder(resolved);

  // Normalize settings.json (absolute defaults / other-PC paths → portable form)
  if (!IS_CLOUD && String(loaded.backupFolder ?? '') !== portable) {
    try {
      await persistSettingsObject({ ...loaded, backupFolder: portable });
    } catch {
      /* still return corrected path even if write fails */
    }
  }

  return { ...loaded, backupFolder: resolved };
}

export async function saveSettings(partial) {
  const next = { ...(await getSettings()), ...partial };
  if (!IS_CLOUD) {
    next.backupFolder = resolveBackupFolder(
      Object.prototype.hasOwnProperty.call(partial || {}, 'backupFolder')
        ? partial.backupFolder
        : next.backupFolder
    );
  }
  await persistSettingsObject(next);
  return { ...next, backupFolder: resolveBackupFolder(next.backupFolder) };
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
       ON DUPLICATE KEY UPDATE content = VALUES(content)`
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
