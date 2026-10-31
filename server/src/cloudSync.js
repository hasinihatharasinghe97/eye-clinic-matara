/**
 * Two-way sync between the clinic laptop's own MySQL and the cloud database (HeatWave).
 *
 * The clinic has no internet, so the doctor works on the laptop; with internet he may
 * also use the hosted app, even on the same day. `syncBoth()` brings both databases to
 * the same state:
 *   - rows changed/added/deleted on the laptop are applied to the cloud, and vice versa;
 *   - a row changed on both sides keeps the newer edit (updated_at / created_at);
 *   - photos are copied both ways (laptop files on disk ↔ cloud `attachment_files`).
 *
 * How changes are found: after every sync the MD5 fingerprint of every row on each side
 * is stored (the "base"). Comparing a side's current fingerprints with its base tells
 * exactly which rows that side changed, added or deleted since the last sync — no
 * schema changes or edit tracking in the app are needed. Fingerprints are computed by
 * MySQL, so only rows that actually changed travel over the connection.
 *
 * Record numbers never clash because the laptop creates even ids and cloud servers odd
 * ids (see ID_STEP / ID_OFFSET in db.js). If two different records still arrive with the
 * same number, the sync stops instead of overwriting one of them.
 *
 * Writes happen in one transaction per side, and a row is only written if the target
 * still matches what the sync read, so an edit made during a sync is never lost (it is
 * picked up by the next sync). If anything fails, the next sync simply finishes the job.
 *
 * `pullFromCloud()` (first-time laptop setup) and `overwriteCloud()` (recovery) make one
 * side an exact copy of the other.
 */
import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, UPLOADS_DIR, ID_STEP } from './db.js';

/** Synced tables, parents before children (inserts in this order, deletes reversed). */
const TABLES = [
  'patients',
  'custom_disease_forms',
  'visits',
  'progress_logs',
  'disease_assessments',
  'clinic_attendance',
  'attachments',
];
/**
 * Tables whose rows are matched by a natural key instead of the id: both sides may tick
 * the same patient's attendance for the same day, each with its own id.
 */
const NATURAL_KEYS = { clinic_attendance: ['patient_id', 'visit_date'] };
/** Tables with text ids chosen by the app (not AUTO_INCREMENT). */
const TEXT_ID_TABLES = new Set(['custom_disease_forms']);
const FILES_TABLE = 'attachment_files';
const BATCH = 200;
const STATE_PATH = path.join(DATA_DIR, 'cloud-sync-state.json');
const LAPTOP_ID_OFFSET = 2;
const CLOUD_ID_OFFSET = 1;
/** A sync that would delete more rows of a table than this needs confirmation. */
const MAX_DELETE_SHARE = 0.2;
const MAX_DELETE_FREE = 10;

function env(name) {
  return String(process.env[name] ?? '').trim();
}

function flag(name) {
  return ['1', 'true', 'required'].includes(env(name).toLowerCase());
}

function localConfig() {
  return {
    host: env('MYSQL_HOST') || '127.0.0.1',
    port: Number(env('MYSQL_PORT')) || 3306,
    user: env('MYSQL_USER') || 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: env('MYSQL_DATABASE') || 'eye_clinic',
    ssl: flag('MYSQL_SSL') ? { rejectUnauthorized: false } : undefined,
  };
}

function cloudConfig() {
  return {
    host: env('CLOUD_MYSQL_HOST'),
    port: Number(env('CLOUD_MYSQL_PORT')) || 3306,
    user: env('CLOUD_MYSQL_USER'),
    password: process.env.CLOUD_MYSQL_PASSWORD ?? '',
    database: env('CLOUD_MYSQL_DATABASE') || 'eye_clinic',
    ssl: flag('CLOUD_MYSQL_SSL') ? { rejectUnauthorized: false } : undefined,
  };
}

/** True on the laptop, where CLOUD_MYSQL_* points at HeatWave. */
export function isCloudSyncConfigured() {
  const c = cloudConfig();
  return Boolean(c.host && c.user && c.password);
}

function sameDatabase(a, b) {
  const host = (h) => (['localhost', '127.0.0.1', '::1'].includes(h) ? 'localhost' : h);
  return host(a.host) === host(b.host) && a.port === b.port && a.database === b.database;
}

async function connect(config, label, idOffset) {
  let conn;
  try {
    conn = await mysql.createConnection({
      ...config,
      charset: 'utf8mb4',
      dateStrings: true,
      connectTimeout: 20_000,
      supportBigNumbers: true,
    });
  } catch (err) {
    const offline = ['ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH'];
    if (label === 'cloud' && offline.includes(err.code)) {
      throw new Error(
        'Could not reach the cloud database. Check the internet connection and try again.'
      );
    }
    throw new Error(`Could not connect to the ${label} database: ${err.message}`);
  }
  // Rows the sync inserts without an id (attendance) follow that side's numbering.
  await conn
    .query(`SET SESSION auto_increment_increment = ${ID_STEP}, auto_increment_offset = ${idOffset}`)
    .catch(() => {});
  return conn;
}

// ---------- state ----------

export function readSyncState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeSyncState(patch) {
  const next = { ...readSyncState(), ...patch };
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(next), 'utf8');
  return next;
}

// ---------- schema helpers ----------

const q = (name) => `\`${String(name).replace(/`/g, '``')}\``;

async function columnsOf(conn, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [table]
  );
  return rows.map((r) => r.name);
}

async function primaryKeyOf(conn, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY ORDINAL_POSITION`,
    [table]
  );
  if (rows.length !== 1) throw new Error(`Table ${table} needs a single-column primary key`);
  return rows[0].name;
}

/**
 * How a table is synced: the columns both databases have, its id column, the natural
 * key (if rows are matched by it) and the columns that make up a row's fingerprint.
 */
async function tableSpec(a, b, table) {
  const [colsA, colsB] = await Promise.all([columnsOf(a, table), columnsOf(b, table)]);
  if (!colsA.length || !colsB.length) {
    throw new Error(
      `Table ${table} is missing in one of the databases. Start the app once against it so it creates its tables.`
    );
  }
  const inB = new Set(colsB);
  // Sorted, so fingerprints match whichever database is read first.
  const columns = colsA.filter((c) => inB.has(c)).sort();
  const pk = await primaryKeyOf(a, table);
  const natural = NATURAL_KEYS[table] || null;
  // Natural-key rows may have different ids on each side, so the id isn't part of them.
  const hashColumns = natural ? columns.filter((c) => c !== pk) : columns;
  return { table, columns, pk, natural, hashColumns };
}

async function tableSpecs(a, b) {
  const specs = {};
  for (const t of TABLES) specs[t] = await tableSpec(a, b, t);
  return specs;
}

/** SQL for an MD5 fingerprint of a row (NULL and '' are kept distinct). */
function rowHashSql(columns) {
  const parts = columns.map((c) => `COALESCE(CAST(${q(c)} AS CHAR), 0x00)`);
  return `MD5(CONCAT_WS(0x1F, ${parts.join(', ')}))`;
}

function keySql(spec) {
  return spec.natural
    ? `CONCAT_WS(0x1F, ${spec.natural.map((c) => `CAST(${q(c)} AS CHAR)`).join(', ')})`
    : `CAST(${q(spec.pk)} AS CHAR)`;
}

function keyWhere(spec, key) {
  if (spec.natural) {
    return {
      sql: spec.natural.map((c) => `${q(c)} = ?`).join(' AND '),
      params: String(key).split('\x1F'),
    };
  }
  return { sql: `${q(spec.pk)} = ?`, params: [key] };
}

/** Fingerprint of every row of a table: Map key → md5. */
async function hashesOf(conn, spec) {
  const [rows] = await conn.query(
    `SELECT ${keySql(spec)} AS k, ${rowHashSql(spec.hashColumns)} AS h FROM ${q(spec.table)}`
  );
  return new Map(rows.map((r) => [String(r.k), String(r.h)]));
}

/** Order-independent fingerprint of a whole table: row count + XOR of row hashes. */
async function tableFingerprint(conn, table, columns) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS n,
            COALESCE(BIT_XOR(CAST(CONV(SUBSTRING(${rowHashSql(columns)}, 1, 16), 16, 10) AS UNSIGNED)), 0) AS x
     FROM ${q(table)}`
  );
  return `${row.n}:${row.x}`;
}

/** The same table fingerprint, computed from stored row hashes. */
function fingerprintFromHashes(hashes = {}) {
  let x = 0n;
  let n = 0;
  for (const h of Object.values(hashes)) {
    x ^= BigInt(`0x${h.slice(0, 16)}`);
    n += 1;
  }
  return `${n}:${x.toString()}`;
}

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function countRows(conn, table) {
  const [[row]] = await conn.query(`SELECT COUNT(*) AS n FROM ${q(table)}`);
  return Number(row.n);
}

// ---------- single-row helpers (two-way merge) ----------

async function currentHash(conn, spec, key) {
  const w = keyWhere(spec, key);
  const [rows] = await conn.query(
    `SELECT ${rowHashSql(spec.hashColumns)} AS h FROM ${q(spec.table)} WHERE ${w.sql} FOR UPDATE`,
    w.params
  );
  return rows.length ? String(rows[0].h) : undefined;
}

async function readRow(conn, spec, key) {
  const w = keyWhere(spec, key);
  const [rows] = await conn.query(
    `SELECT ${spec.columns.map(q).join(', ')} FROM ${q(spec.table)} WHERE ${w.sql} FOR UPDATE`,
    w.params
  );
  return rows[0];
}

function sameContent(spec, a, b) {
  const norm = (row) =>
    JSON.stringify(
      spec.hashColumns.map((c) => {
        const v = row[c];
        if (v == null) return null;
        return Buffer.isBuffer(v) ? v.toString('base64') : String(v);
      })
    );
  return norm(a) === norm(b);
}

/** When a row was last changed, for "newer edit wins". */
function editedAt(row) {
  return String(row.updated_at || row.created_at || '');
}

async function writeRow(conn, spec, row) {
  if (spec.natural) {
    const key = spec.natural.map((c) => String(row[c])).join('\x1F');
    const w = keyWhere(spec, key);
    const [exists] = await conn.query(`SELECT 1 FROM ${q(spec.table)} WHERE ${w.sql}`, w.params);
    const cols = spec.hashColumns;
    if (exists.length) {
      await conn.query(
        `UPDATE ${q(spec.table)} SET ${cols.map((c) => `${q(c)} = ?`).join(', ')} WHERE ${w.sql}`,
        [...cols.map((c) => row[c]), ...w.params]
      );
    } else {
      await conn.query(
        `INSERT INTO ${q(spec.table)} (${cols.map(q).join(', ')}) VALUES (?)`,
        [cols.map((c) => row[c])]
      );
    }
    return;
  }
  const update = spec.columns
    .filter((c) => c !== spec.pk)
    .map((c) => `${q(c)} = VALUES(${q(c)})`)
    .join(', ');
  await conn.query(
    `INSERT INTO ${q(spec.table)} (${spec.columns.map(q).join(', ')}) VALUES (?)
     ON DUPLICATE KEY UPDATE ${update}`,
    [spec.columns.map((c) => row[c])]
  );
}

async function deleteRow(conn, spec, key) {
  const w = keyWhere(spec, key);
  await conn.query(`DELETE FROM ${q(spec.table)} WHERE ${w.sql}`, w.params);
}

// ---------- mirroring (first-time copy / recovery) ----------

/** Make every synced table of `target` identical to `source`. */
async function mirrorTables(source, target, specs, progress) {
  const summary = {};
  const plans = {};
  for (const table of TABLES) {
    // Mirror by id (copies ids too), using every shared column.
    const spec = { ...specs[table], natural: null, hashColumns: specs[table].columns };
    const [src, tgt] = await Promise.all([hashesOf(source, spec), hashesOf(target, spec)]);
    const toDelete = [...tgt.keys()].filter((k) => !src.has(k));
    const toWrite = [...src.keys()].filter((k) => tgt.get(k) !== src.get(k));
    // clinic_attendance has a second unique key: replace changed rows instead of upserting.
    const toReplace = NATURAL_KEYS[table] ? toWrite.filter((k) => tgt.has(k)) : [];
    plans[table] = { spec, toDelete, toWrite, toReplace };
    summary[table] = { written: toWrite.length, deleted: toDelete.length };
  }
  for (const table of [...TABLES].reverse()) {
    const { spec, toDelete, toReplace } = plans[table];
    const ids = [...toDelete, ...toReplace];
    if (!ids.length) continue;
    progress(`Removing ${ids.length} row(s) from ${table}`);
    for (const part of chunks(ids, 500)) {
      await target.query(`DELETE FROM ${q(table)} WHERE ${q(spec.pk)} IN (?)`, [part]);
    }
  }
  for (const table of TABLES) {
    const { spec, toWrite } = plans[table];
    if (!toWrite.length) continue;
    progress(`Copying ${toWrite.length} row(s) of ${table}`);
    const colList = spec.columns.map(q).join(', ');
    const update = spec.columns
      .filter((c) => c !== spec.pk)
      .map((c) => `${q(c)} = VALUES(${q(c)})`)
      .join(', ');
    for (const part of chunks(toWrite, BATCH)) {
      const [rows] = await source.query(
        `SELECT ${colList} FROM ${q(table)} WHERE ${q(spec.pk)} IN (?)`,
        [part]
      );
      if (!rows.length) continue;
      await target.query(
        `INSERT INTO ${q(table)} (${colList}) VALUES ? ON DUPLICATE KEY UPDATE ${update}`,
        [rows.map((r) => spec.columns.map((c) => r[c]))]
      );
    }
  }
  return summary;
}

// ---------- photos ----------

/** Paths of all uploaded files that attachment rows point to. */
async function attachmentPaths(conn) {
  const [rows] = await conn.query(
    `SELECT DISTINCT relative_path AS p FROM attachments WHERE relative_path IS NOT NULL AND relative_path <> ''`
  );
  return rows.map((r) => String(r.p));
}

function localFilePath(relativePath) {
  const full = path.resolve(UPLOADS_DIR, relativePath);
  if (!full.startsWith(path.resolve(UPLOADS_DIR))) throw new Error(`Bad file path: ${relativePath}`);
  return full;
}

/** Laptop disk → cloud `attachment_files`, for cloud attachments whose file is missing there. */
async function uploadMissingFiles(local, cloud, progress) {
  const wanted = await attachmentPaths(cloud);
  const [rows] = await cloud.query(`SELECT relative_path AS p FROM ${FILES_TABLE}`);
  const present = new Set(rows.map((r) => String(r.p)));
  const toUpload = wanted.filter((p) => !present.has(p));
  const missingOnDisk = [];
  let uploaded = 0;
  for (const p of toUpload) {
    const full = localFilePath(p);
    if (!fs.existsSync(full)) {
      missingOnDisk.push(p);
      continue;
    }
    progress(`Uploading photo ${uploaded + 1} of ${toUpload.length}`);
    await cloud.query(
      `INSERT INTO ${FILES_TABLE} (relative_path, content) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content)`,
      [p, fs.readFileSync(full)]
    );
    uploaded += 1;
  }
  return { uploaded, missingOnDisk };
}

/** Cloud `attachment_files` → laptop disk, for laptop attachments whose file is missing. */
async function downloadMissingFiles(cloud, local, progress) {
  const wanted = await attachmentPaths(local);
  const missing = wanted.filter((p) => !fs.existsSync(localFilePath(p)));
  const notInCloud = [];
  let downloaded = 0;
  for (const p of missing) {
    progress(`Downloading photo ${downloaded + 1} of ${missing.length}`);
    const [[row]] = await cloud.query(
      `SELECT content FROM ${FILES_TABLE} WHERE relative_path = ?`,
      [p]
    );
    if (!row?.content) {
      notInCloud.push(p);
      continue;
    }
    const full = localFilePath(p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.from(row.content));
    downloaded += 1;
  }
  return { downloaded, notInCloud };
}

// ---------- locking ----------

let running = null;
let progressText = '';

export function cloudSyncStatus() {
  return { running: Boolean(running), operation: running, progress: progressText };
}

const LOCK_PATH = path.join(DATA_DIR, 'cloud-sync.lock');
/** A lock older than this is from a crashed run and is ignored. */
const LOCK_STALE_MS = 30 * 60 * 1000;

/** Cross-process lock: the app and the background task must never sync at the same time. */
function acquireFileLock(operation) {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  try {
    const stat = fs.statSync(LOCK_PATH);
    if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) fs.rmSync(LOCK_PATH, { force: true });
  } catch {
    /* no lock yet */
  }
  try {
    fs.writeFileSync(
      LOCK_PATH,
      JSON.stringify({ pid: process.pid, operation, at: new Date().toISOString() }),
      { flag: 'wx' }
    );
    return true;
  } catch {
    return false;
  }
}

function releaseFileLock() {
  fs.rmSync(LOCK_PATH, { force: true });
}

async function exclusive(operation, fn) {
  if (running) throw new SyncBusyError(`A ${running} is already running. Please wait for it to finish.`);
  if (!acquireFileLock(operation)) {
    throw new SyncBusyError('Another sync is already running on this laptop. Please wait for it to finish.');
  }
  running = operation;
  progressText = 'Connecting…';
  try {
    return await fn((text) => {
      progressText = text;
    });
  } finally {
    running = null;
    progressText = '';
    releaseFileLock();
  }
}

async function openBoth() {
  const lc = localConfig();
  const cc = cloudConfig();
  if (!isCloudSyncConfigured()) {
    throw new Error(
      'Cloud sync is not set up: add CLOUD_MYSQL_HOST, CLOUD_MYSQL_USER and CLOUD_MYSQL_PASSWORD to .env'
    );
  }
  if (sameDatabase(lc, cc)) {
    throw new Error(
      'MYSQL_* and CLOUD_MYSQL_* point at the same database. On the laptop, MYSQL_* must be the local database.'
    );
  }
  const local = await connect(lc, 'local', LAPTOP_ID_OFFSET);
  let cloud;
  try {
    cloud = await connect(cc, 'cloud', CLOUD_ID_OFFSET);
  } catch (err) {
    await local.end().catch(() => {});
    throw err;
  }
  return { local, cloud };
}

async function closeBoth({ local, cloud }) {
  await Promise.all([local.end().catch(() => {}), cloud.end().catch(() => {})]);
}

/** Row fingerprints of both sides, stored as the base for the next two-way sync. */
async function snapshotBase(local, cloud, specs) {
  const base = { local: {}, cloud: {} };
  for (const t of TABLES) {
    base.local[t] = Object.fromEntries(await hashesOf(local, specs[t]));
    base.cloud[t] = Object.fromEntries(await hashesOf(cloud, specs[t]));
  }
  return base;
}

function hashColumnsOf(specs) {
  return Object.fromEntries(TABLES.map((t) => [t, specs[t].hashColumns]));
}

function failedResult(direction, startedAt, err, trigger) {
  return {
    ok: false,
    direction,
    startedAt,
    finishedAt: new Date().toISOString(),
    error: err.message,
    safety: err instanceof SyncSafetyError,
    trigger,
  };
}

// ---------- two-way sync ----------

/**
 * Bring the laptop and the cloud to the same state (see the module comment).
 * @param {{ force?: boolean, trigger?: 'manual'|'auto' }} [opts]
 *   force: go ahead even if the sync would delete many rows on one side.
 */
export async function syncBoth({ force = false, trigger = 'manual' } = {}) {
  const initial = readSyncState();
  if (!initial.base && initial.cloudFingerprint) return upgradeFromOneWay();
  return exclusive('sync', async (progress) => {
    const state = readSyncState();
    if (!state.base) {
      throw new SyncSetupError(
        'This laptop has not been set up for syncing yet. Run the first-time copy from the cloud (clinic-tools.bat, option 5).'
      );
    }
    const conns = await openBoth();
    const { local, cloud } = conns;
    const startedAt = new Date().toISOString();
    try {
      const specs = await tableSpecs(local, cloud);

      // 1. Work out what each side changed since the last sync.
      progress('Comparing the laptop and the cloud…');
      const plans = {};
      for (const t of TABLES) {
        const spec = specs[t];
        const [L, C] = await Promise.all([hashesOf(local, spec), hashesOf(cloud, spec)]);
        const BL = state.base.local?.[t] || {};
        const BC = state.base.cloud?.[t] || {};
        const keys = new Set([...L.keys(), ...C.keys(), ...Object.keys(BL), ...Object.keys(BC)]);
        const actions = [];
        for (const key of keys) {
          const l = L.get(key);
          const c = C.get(key);
          const lChanged = l !== BL[key];
          const cChanged = c !== BC[key];
          if (!lChanged && !cChanged) continue;
          let kind;
          if (lChanged && !cChanged) kind = l ? 'toCloud' : 'deleteCloud';
          else if (cChanged && !lChanged) kind = c ? 'toLaptop' : 'deleteLaptop';
          else if (!l && !c) kind = 'goneBoth';
          else if (!l) kind = 'keepCloudEdit'; // deleted on the laptop, changed online
          else if (!c) kind = 'keepLaptopEdit'; // deleted online, changed on the laptop
          else kind = 'bothChanged';
          actions.push({ key, kind, l, c, newBorn: BL[key] === undefined && BC[key] === undefined });
        }
        plans[t] = { spec, L, C, BL, BC, actions };
      }

      // 2. Safety: don't let a damaged or empty database wipe the other side.
      if (!force) {
        for (const t of TABLES) {
          const { actions, L, C } = plans[t];
          const delCloud = actions.filter((a) => a.kind === 'deleteCloud').length;
          const delLaptop = actions.filter((a) => a.kind === 'deleteLaptop').length;
          if (delCloud > Math.max(MAX_DELETE_FREE, C.size * MAX_DELETE_SHARE)) {
            throw new SyncSafetyError(
              `This sync would delete ${delCloud} of ${C.size} ${t} rows in the cloud because they are missing on the laptop.`
            );
          }
          if (delLaptop > Math.max(MAX_DELETE_FREE, L.size * MAX_DELETE_SHARE)) {
            throw new SyncSafetyError(
              `This sync would delete ${delLaptop} of ${L.size} ${t} rows on the laptop because they are missing in the cloud.`
            );
          }
        }
      }

      // 3. Apply, one transaction per side.
      await local.query('START TRANSACTION');
      await cloud.query('START TRANSACTION');
      const summary = {};
      const conflicts = [];
      const skipped = [];
      const newBase = { local: {}, cloud: {} };
      try {
        for (const t of TABLES) {
          newBase.local[t] = { ...plans[t].BL };
          newBase.cloud[t] = { ...plans[t].BC };
          summary[t] = { toCloud: 0, toLaptop: 0, deletedCloud: 0, deletedLaptop: 0 };
        }
        const setBase = (t, key, side, hash) => {
          if (hash === undefined) delete newBase[side][t][key];
          else newBase[side][t][key] = hash;
        };

        // Copy one row across; only if both sides still look as the sync read them.
        const copy = async (t, a, from) => {
          const spec = plans[t].spec;
          const [src, dst, srcHash, dstHash] =
            from === 'local' ? [local, cloud, a.l, a.c] : [cloud, local, a.c, a.l];
          if ((await currentHash(src, spec, a.key)) !== srcHash) return false;
          if ((await currentHash(dst, spec, a.key)) !== dstHash) return false;
          const row = await readRow(src, spec, a.key);
          try {
            await dst.query('SAVEPOINT row_write');
            await writeRow(dst, spec, row);
          } catch (err) {
            // A child row whose parent was just deleted on the other side: drop it.
            if (err.errno === 1452) {
              await dst.query('ROLLBACK TO SAVEPOINT row_write');
              return false;
            }
            throw err;
          }
          const written = await currentHash(dst, spec, a.key);
          if (from === 'local') {
            setBase(t, a.key, 'local', srcHash);
            setBase(t, a.key, 'cloud', written);
            summary[t].toCloud += 1;
          } else {
            setBase(t, a.key, 'cloud', srcHash);
            setBase(t, a.key, 'local', written);
            summary[t].toLaptop += 1;
          }
          return true;
        };

        const remove = async (t, a, on) => {
          const spec = plans[t].spec;
          const conn = on === 'cloud' ? cloud : local;
          const expected = on === 'cloud' ? a.c : a.l;
          if ((await currentHash(conn, spec, a.key)) !== expected) return false;
          await deleteRow(conn, spec, a.key);
          setBase(t, a.key, 'local', undefined);
          setBase(t, a.key, 'cloud', undefined);
          summary[t][on === 'cloud' ? 'deletedCloud' : 'deletedLaptop'] += 1;
          return true;
        };

        // Deletes first (children before parents), then copies (parents before children).
        for (const t of [...TABLES].reverse()) {
          progress(`Applying deletions (${t})…`);
          for (const a of plans[t].actions) {
            let done = true;
            if (a.kind === 'deleteCloud') done = await remove(t, a, 'cloud');
            else if (a.kind === 'deleteLaptop') done = await remove(t, a, 'local');
            else if (a.kind === 'goneBoth') {
              setBase(t, a.key, 'local', undefined);
              setBase(t, a.key, 'cloud', undefined);
            } else continue;
            if (!done) skipped.push({ table: t, key: a.key });
          }
        }
        for (const t of TABLES) {
          progress(`Copying changes (${t})…`);
          const spec = plans[t].spec;
          for (const a of plans[t].actions) {
            let done = true;
            if (a.kind === 'toCloud') done = await copy(t, a, 'local');
            else if (a.kind === 'toLaptop') done = await copy(t, a, 'cloud');
            else if (a.kind === 'keepCloudEdit') {
              done = await copy(t, a, 'cloud');
              if (done) conflicts.push({ table: t, key: a.key, kept: 'cloud', reason: 'deleted on the laptop but changed online' });
            } else if (a.kind === 'keepLaptopEdit') {
              done = await copy(t, a, 'local');
              if (done) conflicts.push({ table: t, key: a.key, kept: 'laptop', reason: 'deleted online but changed on the laptop' });
            } else if (a.kind === 'bothChanged') {
              const lRow = await readRow(local, spec, a.key);
              const cRow = await readRow(cloud, spec, a.key);
              if (!lRow || !cRow) {
                done = false;
              } else if (sameContent(spec, lRow, cRow)) {
                setBase(t, a.key, 'local', a.l);
                setBase(t, a.key, 'cloud', a.c);
              } else if (a.newBorn && !spec.natural && !TEXT_ID_TABLES.has(t)) {
                throw new SyncSafetyError(
                  `Two different ${t} records were created with the same number (${a.key}) on the laptop and online. ` +
                    'Check that the online app is running the latest version (it must use odd record numbers), then contact support.'
                );
              } else {
                const laptopNewer = editedAt(lRow) >= editedAt(cRow);
                done = await copy(t, a, laptopNewer ? 'local' : 'cloud');
                if (done) {
                  conflicts.push({
                    table: t,
                    key: a.key,
                    kept: laptopNewer ? 'laptop' : 'cloud',
                    reason: 'changed in both places; the newer edit was kept',
                  });
                }
              }
            } else continue;
            if (!done) skipped.push({ table: t, key: a.key });
          }
        }

        progress('Saving…');
        await cloud.query('COMMIT');
        await local.query('COMMIT');
      } catch (err) {
        await cloud.query('ROLLBACK').catch(() => {});
        await local.query('ROLLBACK').catch(() => {});
        throw err;
      }

      // 4. Photos both ways (files never change, only missing ones are copied).
      const up = await uploadMissingFiles(local, cloud, progress);
      const down = await downloadMissingFiles(cloud, local, progress);

      const result = {
        ok: true,
        direction: 'both',
        startedAt,
        finishedAt: new Date().toISOString(),
        trigger,
        forced: force,
        tables: summary,
        conflicts,
        skipped: skipped.length,
        files: { uploaded: up.uploaded, downloaded: down.downloaded, missingOnDisk: up.missingOnDisk, notInCloud: down.notInCloud },
      };
      writeSyncState({
        base: newBase,
        columns: hashColumnsOf(specs),
        lastSyncAt: result.finishedAt,
        autoBlocked: null,
        lastResult: result,
      });
      return result;
    } catch (err) {
      writeSyncState({ lastResult: failedResult('both', startedAt, err, trigger) });
      throw err;
    } finally {
      await closeBoth(conns);
    }
  });
}

/**
 * Cloud → laptop: makes the laptop an exact copy of the cloud. First-time laptop setup
 * (refuses if the laptop already has patients, unless forced).
 */
export async function pullFromCloud({ force = false } = {}) {
  return exclusive('copy from cloud', async (progress) => {
    const conns = await openBoth();
    const { local, cloud } = conns;
    const startedAt = new Date().toISOString();
    try {
      const specs = await tableSpecs(cloud, local);
      if (!force && (await countRows(local, 'patients')) > 0) {
        throw new SyncSafetyError(
          'The laptop database already has patients. Copying from the cloud would replace them.'
        );
      }
      await cloud.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      await local.query('START TRANSACTION');
      let tables;
      try {
        tables = await mirrorTables(cloud, local, specs, progress);
        await local.query('COMMIT');
      } catch (err) {
        await local.query('ROLLBACK').catch(() => {});
        throw err;
      }
      const base = await snapshotBase(local, cloud, specs);
      await cloud.query('COMMIT');
      const files = await downloadMissingFiles(cloud, local, progress);
      const result = { ok: true, direction: 'pull', startedAt, finishedAt: new Date().toISOString(), tables, files };
      writeSyncState({ base, columns: hashColumnsOf(specs), lastSyncAt: result.finishedAt, autoBlocked: null, lastResult: result });
      return result;
    } catch (err) {
      writeSyncState({ lastResult: failedResult('pull', startedAt, err, 'manual') });
      throw err;
    } finally {
      await closeBoth(conns);
    }
  });
}

/**
 * Laptop → cloud: makes the cloud an exact copy of the laptop (recovery only; the
 * normal sync is syncBoth). Refuses to empty the cloud from an empty laptop unless forced.
 */
export async function overwriteCloud({ force = false } = {}) {
  return exclusive('overwrite cloud', async (progress) => {
    const conns = await openBoth();
    const { local, cloud } = conns;
    const startedAt = new Date().toISOString();
    try {
      const specs = await tableSpecs(local, cloud);
      if (!force && (await countRows(local, 'patients')) === 0 && (await countRows(cloud, 'patients')) > 0) {
        throw new SyncSafetyError(
          'The laptop database has no patients but the cloud has some. Overwriting would delete them all from the cloud.'
        );
      }
      await local.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      await cloud.query('START TRANSACTION');
      let tables;
      try {
        tables = await mirrorTables(local, cloud, specs, progress);
        await cloud.query('COMMIT');
      } catch (err) {
        await cloud.query('ROLLBACK').catch(() => {});
        throw err;
      }
      const base = await snapshotBase(local, cloud, specs);
      await local.query('COMMIT');
      const files = await uploadMissingFiles(local, cloud, progress);
      const result = { ok: true, direction: 'push', startedAt, finishedAt: new Date().toISOString(), tables, files };
      writeSyncState({ base, columns: hashColumnsOf(specs), lastSyncAt: result.finishedAt, autoBlocked: null, lastResult: result });
      return result;
    } catch (err) {
      writeSyncState({ lastResult: failedResult('push', startedAt, err, 'manual') });
      throw err;
    } finally {
      await closeBoth(conns);
    }
  });
}

/**
 * A laptop set up with the earlier one-way version (laptop → cloud only) has no row
 * fingerprints yet. Its laptop was the master copy, so if the cloud is unchanged since
 * that version's last sync, send the laptop's pending work up once (overwriteCloud),
 * which also records the fingerprints two-way sync needs. If the cloud was changed
 * since, stop and let the doctor decide instead of guessing.
 */
async function upgradeFromOneWay() {
  const state = readSyncState();
  const cloud = await connect(cloudConfig(), 'cloud', CLOUD_ID_OFFSET);
  let changed = [];
  try {
    for (const t of TABLES) {
      const cols = state.columns?.[t];
      if (!cols || (await tableFingerprint(cloud, t, cols)) !== state.cloudFingerprint[t]) changed.push(t);
    }
  } finally {
    await cloud.end().catch(() => {});
  }
  if (changed.length) {
    throw new SyncSafetyError(
      `Upgrading to two-way sync: the cloud was changed since this laptop's last sync (${changed.join(', ')}). ` +
        'Choose which copy is correct: run "overwrite-cloud" to keep the laptop data, or "pull --force" to keep the cloud data.'
    );
  }
  appendLog('upgrade: first two-way sync (laptop was the master copy)');
  return overwriteCloud();
}

/** Tables whose current fingerprint differs from the last sync's base, for one side. */
async function changedTablesOn(conn, state, side) {
  const changed = [];
  for (const t of TABLES) {
    const cols = state.columns?.[t] || (await columnsOf(conn, t));
    const now = await tableFingerprint(conn, t, cols);
    if (now !== fingerprintFromHashes(state.base?.[side]?.[t])) changed.push(t);
  }
  return changed;
}

/** What changed on the laptop since the last sync (offline: only the laptop is read). */
export async function localChangesSinceSync() {
  const state = readSyncState();
  if (!state.base) return { neverSynced: true, changedTables: [] };
  const local = await connect(localConfig(), 'local', LAPTOP_ID_OFFSET);
  try {
    return { neverSynced: false, changedTables: await changedTablesOn(local, state, 'local') };
  } finally {
    await local.end().catch(() => {});
  }
}

// ---------- automatic sync ----------

const LOG_PATH = path.join(DATA_DIR, 'cloud-sync.log');
const STABLE_CHECKS = Math.max(1, Number(env('CLOUD_SYNC_STABLE_CHECKS')) || 3);
const STABLE_GAP_MS = 5_000;
const PING_TIMEOUT_MS = 5_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function appendLog(line) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > 512 * 1024) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.old`);
    }
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch {
    /* logging must never break syncing */
  }
}

/** Open a quick connection to the cloud, or null if it fails / is too slow. */
async function quickCloudConnection() {
  try {
    const conn = await mysql.createConnection({
      ...cloudConfig(),
      charset: 'utf8mb4',
      connectTimeout: PING_TIMEOUT_MS,
      supportBigNumbers: true,
    });
    await conn.query({ sql: 'SELECT 1', timeout: PING_TIMEOUT_MS });
    return conn;
  } catch {
    return null;
  }
}

async function pingCloud() {
  const conn = await quickCloudConnection();
  await conn?.end().catch(() => {});
  return Boolean(conn);
}

function describeResult(r) {
  const t = Object.values(r.tables || {});
  const up = t.reduce((s, x) => s + x.toCloud + x.deletedCloud, 0);
  const down = t.reduce((s, x) => s + x.toLaptop + x.deletedLaptop, 0);
  const parts = [`${up} change(s) sent to the cloud`, `${down} received from the cloud`];
  if (r.conflicts?.length) parts.push(`${r.conflicts.length} edited in both places (newer kept)`);
  return parts.join(', ');
}

/**
 * One automatic-sync check. Needs the cloud to compare against, so it first makes one
 * quick connection (offline → stops there). If neither side changed since the last
 * sync, that's all. Otherwise it waits until the cloud answered quickly STABLE_CHECKS
 * times in a row, so a flickering signal doesn't start a sync, then syncs both ways.
 * @returns {Promise<{ outcome: string, message?: string }>}
 */
export async function autoSyncOnce() {
  const checkedAt = new Date().toISOString();
  const record = (outcome, message = '') => {
    writeSyncState({ auto: { lastCheckAt: checkedAt, outcome, message } });
    if (!['up-to-date', 'offline'].includes(outcome)) {
      appendLog(`auto: ${outcome}${message ? ` - ${message}` : ''}`);
    }
    return { outcome, message };
  };

  if (!isCloudSyncConfigured()) return { outcome: 'not-configured' };
  const state = readSyncState();
  if (!state.base && !state.cloudFingerprint) {
    return record('needs-setup', 'Run the first-time copy from the cloud before automatic sync can start.');
  }
  if (!state.base) {
    // Laptop from the one-way version: upgrade with one sync when the connection is stable.
    if (state.autoBlocked) return record('blocked', state.autoBlocked);
    for (let i = 0; i < STABLE_CHECKS; i++) {
      if (i) await sleep(STABLE_GAP_MS);
      if (!(await pingCloud())) return record(i ? 'unstable' : 'offline', 'Waiting for a stable connection to upgrade to two-way sync.');
    }
    try {
      await syncBoth({ trigger: 'auto' });
      return record('synced', 'Upgraded to two-way sync.');
    } catch (err) {
      if (err instanceof SyncSafetyError) {
        writeSyncState({ autoBlocked: err.message });
        return record('blocked', err.message);
      }
      return record(err instanceof SyncBusyError ? 'busy' : 'failed', err.message);
    }
  }
  if (state.autoBlocked) return record('blocked', state.autoBlocked);
  if (running) return record('busy');

  const cloud = await quickCloudConnection();
  if (!cloud) return record('offline', 'No internet connection.');
  let changed;
  try {
    const local = await connect(localConfig(), 'local', LAPTOP_ID_OFFSET);
    try {
      changed = [
        ...(await changedTablesOn(local, state, 'local')),
        ...(await changedTablesOn(cloud, state, 'cloud')),
      ];
    } finally {
      await local.end().catch(() => {});
    }
  } catch (err) {
    return record('offline', `Lost the connection while checking: ${err.message}`);
  } finally {
    await cloud.end().catch(() => {});
  }
  if (!changed.length) return record('up-to-date');

  for (let i = 1; i < STABLE_CHECKS; i++) {
    await sleep(STABLE_GAP_MS);
    if (!(await pingCloud())) return record('unstable', 'Connection is not stable yet.');
  }

  try {
    const result = await syncBoth({ trigger: 'auto' });
    return record('synced', describeResult(result));
  } catch (err) {
    if (err instanceof SyncSafetyError) {
      writeSyncState({ autoBlocked: err.message });
      return record('blocked', err.message);
    }
    if (err instanceof SyncBusyError) return record('busy');
    if (err instanceof SyncSetupError) return record('needs-setup', err.message);
    return record('failed', err.message);
  }
}

let autoTimer = null;

export function autoSyncSettings() {
  return {
    enabled: isCloudSyncConfigured() && env('CLOUD_AUTO_SYNC') !== '0',
    minutes: Math.max(1, Number(env('CLOUD_AUTO_SYNC_MINUTES')) || 2),
  };
}

/**
 * Run automatic sync checks while the app is open (laptop only).
 * CLOUD_AUTO_SYNC=0 turns it off; CLOUD_AUTO_SYNC_MINUTES sets the gap (default 2).
 */
export function startAutoCloudSync() {
  const { enabled, minutes } = autoSyncSettings();
  if (!enabled || autoTimer) return false;
  const tick = async () => {
    try {
      await autoSyncOnce();
    } catch (err) {
      appendLog(`auto: error - ${err.message}`);
    }
    autoTimer = setTimeout(tick, minutes * 60_000);
  };
  // First check shortly after start-up (picks up online edits made while it was closed).
  autoTimer = setTimeout(tick, 15_000);
  console.log(`[cloud-sync] Two-way automatic sync on: checks every ${minutes} min`);
  return true;
}

// ---------- errors ----------

/** The sync stopped to protect data (mass deletion, record-number clash, …). */
export class SyncSafetyError extends Error {}
/** The laptop needs the first-time copy before it can sync. */
export class SyncSetupError extends Error {}
export class SyncBusyError extends Error {}
