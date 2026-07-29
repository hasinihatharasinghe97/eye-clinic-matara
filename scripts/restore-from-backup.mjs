/**
 * Restore clinic data from a Backup ZIP or an extracted folder / snapshot.json.
 *
 * WARNING: Imports into the MySQL pointed to by MYSQL_* (adds rows; does not wipe).
 * Prefer an empty destination database for a clean restore.
 *
 * Usage (PowerShell):
 *   $env:MYSQL_HOST="..."
 *   $env:MYSQL_USER="..."
 *   $env:MYSQL_PASSWORD="..."
 *   $env:MYSQL_DATABASE="eye_clinic"
 *   $env:STORE_FILES_IN_DB="1"   # cloud / Oracle HeatWave via Render
 *   node scripts/restore-from-backup.mjs .\EyeClinic-Backup-....zip
 *
 * Or after unzipping:
 *   node scripts/restore-from-backup.mjs .\extracted-folder
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const input = process.argv[2] ? path.resolve(process.argv[2]) : null;

if (!input || !fs.existsSync(input)) {
  console.error('Usage: node scripts/restore-from-backup.mjs <backup.zip|folder|snapshot.json>');
  process.exit(1);
}

function findSnapshot(dir) {
  const direct = path.join(dir, 'snapshot.json');
  if (fs.existsSync(direct)) return direct;
  const nested = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(dir, d.name, 'snapshot.json'))
    .find((p) => fs.existsSync(p));
  return nested || null;
}

let workDir = null;
let snapshotPath = null;
let cleanup = null;

const st = fs.statSync(input);
if (st.isFile() && input.toLowerCase().endsWith('.json')) {
  snapshotPath = input;
} else if (st.isFile() && input.toLowerCase().endsWith('.zip')) {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eye-clinic-restore-'));
  cleanup = () => {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  console.log(`Extracting ${input} …`);
  // Prefer tar (Windows 10+ / Node hosts) or PowerShell Expand-Archive
  let ok = false;
  if (process.platform === 'win32') {
    const ps = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${input.replace(/'/g, "''")}' -DestinationPath '${workDir.replace(/'/g, "''")}' -Force`],
      { encoding: 'utf8' }
    );
    ok = ps.status === 0;
    if (!ok) console.error(ps.stderr || ps.stdout);
  }
  if (!ok) {
    const tar = spawnSync('tar', ['-xf', input, '-C', workDir], { encoding: 'utf8' });
    ok = tar.status === 0;
    if (!ok) {
      console.error(tar.stderr || tar.stdout);
      cleanup?.();
      console.error('Could not unzip backup. Unzip manually and pass the folder path.');
      process.exit(1);
    }
  }
  snapshotPath = findSnapshot(workDir);
  if (!snapshotPath) {
    cleanup?.();
    console.error('No snapshot.json found inside the ZIP.');
    process.exit(1);
  }
  // Prefer uploads next to snapshot for STORE_FILES_IN_DB import
  const uploadsBeside = path.join(path.dirname(snapshotPath), 'uploads');
  if (fs.existsSync(uploadsBeside)) {
    const destUploads = path.join(root, 'data', 'uploads');
    // Leave uploads in extract dir; migrate script looks beside snapshot
  }
} else if (st.isDirectory()) {
  snapshotPath = findSnapshot(input);
  if (!snapshotPath) {
    console.error(`No snapshot.json under ${input}`);
    process.exit(1);
  }
} else {
  console.error('Unsupported input. Pass a .zip, a folder, or snapshot.json');
  process.exit(1);
}

console.log(`Restoring from ${snapshotPath}`);
console.log('Destination MySQL: use the MYSQL_* env vars currently set / in .env');

const migrate = path.join(root, 'scripts', 'migrate-sqlite-to-mysql.mjs');
const result = spawnSync(process.execPath, [migrate, snapshotPath], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

cleanup?.();
process.exit(result.status ?? 1);
