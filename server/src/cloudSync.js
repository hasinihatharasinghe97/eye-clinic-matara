/**
 * Offline laptop ↔ HeatWave sync.
 *
 * The clinic laptop runs its own MySQL (no internet at the clinic) and is the only
 * place records are changed. At the end of the day `pushToCloud()` makes the cloud
 * database (HeatWave, used by the online app) an exact copy of the laptop:
 * new/changed rows are written, rows deleted on the laptop are deleted, and new
 * photos (files on the laptop's disk) are uploaded into `attachment_files`.
 * `pullFromCloud()` is the one-time reverse copy used to set up a new laptop.
 *
 * Rows are compared by an MD5 fingerprint computed by MySQL on both sides, so only
 * rows that actually differ travel over the (slow) connection. Everything is written
 * in one transaction: a dropped connection leaves the target as it was.
 *
 * Safety: after each sync the target's table fingerprints are saved. If the cloud
 * no longer matches them at the next push, someone changed it online and the push
 * stops instead of overwriting those changes (unless forced).
 */
import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, UPLOADS_DIR } from './db.js';

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
/** Has a second unique key, so changed rows are replaced (delete + insert), not upserted. */
const REPLACE_TABLES = new Set(['clinic_attendance']);
const FILES_TABLE = 'attachment_files';
const BATCH = 200;
const STATE_PATH = path.join(DATA_DIR, 'cloud-sync-state.json');

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

async function connect(config, label) {
  try {
    return await mysql.createConnection({
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
  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2), 'utf8');
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

/** Columns both databases have, in the source's order. */
async function sharedColumns(source, target, table) {
  const [a, b] = await Promise.all([columnsOf(source, table), columnsOf(target, table)]);
  if (!a.length) throw new Error(`Table ${table} is missing in the source database`);
  if (!b.length) {
    throw new Error(
      `Table ${table} is missing in the target database. Start the app once against it so it creates its tables.`
    );
  }
  const inTarget = new Set(b);
  return a.filter((c) => inTarget.has(c));
}

/** SQL for an MD5 fingerprint of a row (NULL and '' are kept distinct). */
function rowHashSql(columns) {
  const parts = columns.map((c) => `COALESCE(CAST(${q(c)} AS CHAR), 0x00)`);
  return `MD5(CONCAT_WS(0x1F, ${parts.join(', ')}))`;
}

async function rowHashes(conn, table, pk, columns) {
  const [rows] = await conn.query(
    `SELECT CAST(${q(pk)} AS CHAR) AS k, ${rowHashSql(columns)} AS h FROM ${q(table)}`
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

async function databaseFingerprint(conn, columnsByTable) {
  const out = {};
  for (const table of TABLES) {
    out[table] = await tableFingerprint(conn, table, columnsByTable[table]);
  }
  out[FILES_TABLE] = await tableFingerprint(conn, FILES_TABLE, ['relative_path']);
  return out;
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

// ---------- mirroring ----------

/**
 * Make `target` rows of every synced table identical to `source`.
 * Returns per-table counts of rows added/updated and deleted.
 */
async function mirrorTables(source, target, columnsByTable, progress) {
  const summary = {};
  const plans = {};
  for (const table of TABLES) {
    const pk = await primaryKeyOf(source, table);
    const columns = columnsByTable[table];
    const [src, tgt] = await Promise.all([
      rowHashes(source, table, pk, columns),
      rowHashes(target, table, pk, columns),
    ]);
    const toDelete = [...tgt.keys()].filter((k) => !src.has(k));
    const toWrite = [...src.keys()].filter((k) => tgt.get(k) !== src.get(k));
    const toReplace = REPLACE_TABLES.has(table) ? toWrite.filter((k) => tgt.has(k)) : [];
    plans[table] = { pk, columns, toDelete, toWrite, toReplace };
    summary[table] = { written: toWrite.length, deleted: toDelete.length };
  }

  // Deletes children-first so parents are free to go; replaced rows are cleared too.
  for (const table of [...TABLES].reverse()) {
    const { pk, toDelete, toReplace } = plans[table];
    const ids = [...toDelete, ...toReplace];
    if (!ids.length) continue;
    progress(`Removing ${ids.length} row(s) from ${table}`);
    for (const part of chunks(ids, 500)) {
      await target.query(`DELETE FROM ${q(table)} WHERE ${q(pk)} IN (?)`, [part]);
    }
  }

  // Inserts/updates parents-first so foreign keys are satisfied.
  for (const table of TABLES) {
    const { pk, columns, toWrite } = plans[table];
    if (!toWrite.length) continue;
    progress(`Copying ${toWrite.length} row(s) of ${table}`);
    const colList = columns.map(q).join(', ');
    const update = columns
      .filter((c) => c !== pk)
      .map((c) => `${q(c)} = VALUES(${q(c)})`)
      .join(', ');
    for (const part of chunks(toWrite, BATCH)) {
      const [rows] = await source.query(
        `SELECT ${colList} FROM ${q(table)} WHERE ${q(pk)} IN (?)`,
        [part]
      );
      if (!rows.length) continue;
      const values = rows.map((r) => columns.map((c) => r[c]));
      await target.query(
        `INSERT INTO ${q(table)} (${colList}) VALUES ? ON DUPLICATE KEY UPDATE ${update}`,
        [values]
      );
    }
  }
  return summary;
}

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

/** Laptop disk → cloud `attachment_files`. Files never change, so only new ones are sent. */
async function pushFiles(local, cloud, progress) {
  const wanted = new Set(await attachmentPaths(local));
  const [rows] = await cloud.query(`SELECT relative_path AS p FROM ${FILES_TABLE}`);
  const present = new Set(rows.map((r) => String(r.p)));
  const missingOnDisk = [];
  let uploaded = 0;
  const toUpload = [...wanted].filter((p) => !present.has(p));
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
  const stale = [...present].filter((p) => !wanted.has(p));
  for (const part of chunks(stale, 500)) {
    await cloud.query(`DELETE FROM ${FILES_TABLE} WHERE relative_path IN (?)`, [part]);
  }
  return { uploaded, deleted: stale.length, missingOnDisk };
}

/** Cloud `attachment_files` → laptop disk (only files the laptop doesn't have yet). */
async function pullFiles(cloud, local, progress) {
  const wanted = await attachmentPaths(local);
  const missing = wanted.filter((p) => !fs.existsSync(localFilePath(p)));
  let downloaded = 0;
  const notInCloud = [];
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

// ---------- public operations ----------

let running = null;
let progressText = '';

export function cloudSyncStatus() {
  return { running: Boolean(running), operation: running, progress: progressText };
}

async function exclusive(operation, fn) {
  if (running) throw new Error(`A ${running} is already running. Please wait for it to finish.`);
  running = operation;
  progressText = 'Connecting…';
  try {
    return await fn((text) => {
      progressText = text;
    });
  } finally {
    running = null;
    progressText = '';
  }
}

async function openBoth() {
  const lc = localConfig();
  const cc = cloudConfig();
  if (!isCloudSyncConfigured()) {
    throw new Error('Cloud sync is not set up: add CLOUD_MYSQL_HOST, CLOUD_MYSQL_USER and CLOUD_MYSQL_PASSWORD to .env');
  }
  if (sameDatabase(lc, cc)) {
    throw new Error(
      'MYSQL_* and CLOUD_MYSQL_* point at the same database. On the laptop, MYSQL_* must be the local database.'
    );
  }
  const local = await connect(lc, 'local');
  let cloud;
  try {
    cloud = await connect(cc, 'cloud');
  } catch (err) {
    await local.end().catch(() => {});
    throw err;
  }
  return { local, cloud };
}

async function closeBoth({ local, cloud }) {
  await Promise.all([local.end().catch(() => {}), cloud.end().catch(() => {})]);
}

function changedTables(a = {}, b = {}) {
  return [...TABLES, FILES_TABLE].filter((t) => a[t] !== b[t]);
}

/**
 * Laptop → cloud. Makes the cloud an exact copy of the laptop.
 * @param {{ force?: boolean }} [opts] force: overwrite even if the cloud changed since the last sync.
 */
export async function pushToCloud({ force = false } = {}) {
  return exclusive('sync to cloud', async (progress) => {
    const conns = await openBoth();
    const { local, cloud } = conns;
    const startedAt = new Date().toISOString();
    try {
      const columnsByTable = {};
      for (const t of TABLES) columnsByTable[t] = await sharedColumns(local, cloud, t);

      progress('Checking the cloud for changes made online…');
      const state = readSyncState();
      const before = await databaseFingerprint(cloud, columnsByTable);
      if (!force) {
        if (!state.cloudFingerprint) {
          const cloudPatients = await countRows(cloud, 'patients');
          if (cloudPatients > 0) {
            throw new SyncConflictError(
              'This laptop has never synced with the cloud. Run the first-time copy (cloud → laptop) first, or choose "Overwrite cloud" if the laptop already has all the data.',
              []
            );
          }
        } else {
          const changed = changedTables(state.cloudFingerprint, before);
          if (changed.length) {
            throw new SyncConflictError(
              `The cloud database was changed since the last sync (${changed.join(', ')}). Syncing now would overwrite those changes.`,
              changed
            );
          }
        }
        const localPatients = await countRows(local, 'patients');
        const cloudPatients = await countRows(cloud, 'patients');
        if (localPatients === 0 && cloudPatients > 0) {
          throw new SyncConflictError(
            'The laptop database has no patients but the cloud has some. Syncing would delete them all from the cloud.',
            ['patients']
          );
        }
      }

      // Read the laptop as one consistent snapshot while the clinic keeps working.
      await local.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await local.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      await cloud.query('START TRANSACTION');
      let tables;
      let files;
      try {
        tables = await mirrorTables(local, cloud, columnsByTable, progress);
        files = await pushFiles(local, cloud, progress);
        progress('Saving…');
        await cloud.query('COMMIT');
      } catch (err) {
        await cloud.query('ROLLBACK').catch(() => {});
        throw err;
      }
      const localFingerprint = await databaseFingerprint(local, columnsByTable);
      await local.query('COMMIT');
      const cloudFingerprint = await databaseFingerprint(cloud, columnsByTable);

      const result = {
        ok: true,
        direction: 'push',
        startedAt,
        finishedAt: new Date().toISOString(),
        tables,
        files,
        forced: force,
      };
      writeSyncState({
        cloudFingerprint,
        localFingerprint,
        columns: columnsByTable,
        lastPushAt: result.finishedAt,
        lastResult: result,
      });
      return result;
    } catch (err) {
      writeSyncState({
        lastResult: {
          ok: false,
          direction: 'push',
          startedAt,
          finishedAt: new Date().toISOString(),
          error: err.message,
          conflict: err instanceof SyncConflictError,
        },
      });
      throw err;
    } finally {
      await closeBoth(conns);
    }
  });
}

/**
 * Cloud → laptop. One-time setup of a new laptop (makes the laptop a copy of the cloud).
 * @param {{ force?: boolean }} [opts] force: replace the laptop's data even if it has patients.
 */
export async function pullFromCloud({ force = false } = {}) {
  return exclusive('copy from cloud', async (progress) => {
    const conns = await openBoth();
    const { local, cloud } = conns;
    const startedAt = new Date().toISOString();
    try {
      const columnsByTable = {};
      for (const t of TABLES) columnsByTable[t] = await sharedColumns(cloud, local, t);

      if (!force && (await countRows(local, 'patients')) > 0) {
        throw new SyncConflictError(
          'The laptop database already has patients. Copying from the cloud would replace them.',
          ['patients']
        );
      }

      await cloud.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      await local.query('START TRANSACTION');
      let tables;
      try {
        tables = await mirrorTables(cloud, local, columnsByTable, progress);
        await local.query('COMMIT');
      } catch (err) {
        await local.query('ROLLBACK').catch(() => {});
        throw err;
      }
      const files = await pullFiles(cloud, local, progress);
      const cloudFingerprint = await databaseFingerprint(cloud, columnsByTable);
      await cloud.query('COMMIT');
      const localFingerprint = await databaseFingerprint(local, columnsByTable);

      const result = {
        ok: true,
        direction: 'pull',
        startedAt,
        finishedAt: new Date().toISOString(),
        tables,
        files,
      };
      writeSyncState({
        cloudFingerprint,
        localFingerprint,
        columns: columnsByTable,
        lastPullAt: result.finishedAt,
        lastResult: result,
      });
      return result;
    } catch (err) {
      writeSyncState({
        lastResult: {
          ok: false,
          direction: 'pull',
          startedAt,
          finishedAt: new Date().toISOString(),
          error: err.message,
          conflict: err instanceof SyncConflictError,
        },
      });
      throw err;
    } finally {
      await closeBoth(conns);
    }
  });
}

/**
 * Which tables changed on the laptop since the last sync (works offline: only the
 * local database is read).
 */
export async function localChangesSinceSync() {
  const state = readSyncState();
  if (!state.localFingerprint) return { neverSynced: true, changedTables: [] };
  const local = await connect(localConfig(), 'local');
  try {
    // Hash the same columns the last sync used, so the fingerprints are comparable.
    const columnsByTable = {};
    for (const t of TABLES) columnsByTable[t] = state.columns?.[t] || (await columnsOf(local, t));
    const now = await databaseFingerprint(local, columnsByTable);
    return { neverSynced: false, changedTables: changedTables(state.localFingerprint, now) };
  } finally {
    await local.end().catch(() => {});
  }
}

export class SyncConflictError extends Error {
  constructor(message, tables) {
    super(message);
    this.name = 'SyncConflictError';
    this.tables = tables;
  }
}
