import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const dbPath = path.join(dataDir, 'patients.db');
const uploadsDir = path.join(dataDir, 'uploads');
const settingsPath = path.join(dataDir, 'settings.json');

let backupFolder = path.join(dataDir, 'backups');
try {
  if (fs.existsSync(settingsPath)) {
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (s.backupFolder) backupFolder = s.backupFolder;
  }
} catch {
  /* defaults */
}

fs.mkdirSync(backupFolder, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const zipPath = path.join(backupFolder, `EyeClinic-Backup-${stamp}.zip`);

await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(output);
  if (fs.existsSync(dbPath)) archive.file(dbPath, { name: 'patients.db' });
  if (fs.existsSync(`${dbPath}-wal`)) archive.file(`${dbPath}-wal`, { name: 'patients.db-wal' });
  if (fs.existsSync(`${dbPath}-shm`)) archive.file(`${dbPath}-shm`, { name: 'patients.db-shm' });
  if (fs.existsSync(uploadsDir)) archive.directory(uploadsDir, 'uploads');
  if (fs.existsSync(settingsPath)) archive.file(settingsPath, { name: 'settings.json' });
  archive.finalize();
});

if (fs.existsSync(settingsPath)) {
  const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  s.lastBackupAt = new Date().toISOString();
  fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
}

console.log(`Backup created: ${zipPath}`);
