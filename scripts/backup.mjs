import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const settingsPath = path.join(dataDir, 'settings.json');
const defaultBackupsDir = path.join(dataDir, 'backups');

let backupFolder = defaultBackupsDir;
try {
  if (fs.existsSync(settingsPath)) {
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (s.backupFolder && String(s.backupFolder).trim()) {
      backupFolder = path.resolve(String(s.backupFolder).trim());
    }
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
  // Prefer the in-app ZIP (includes MySQL snapshot.json). This script only
  // archives local uploads + settings for a quick offline copy.
  if (fs.existsSync(uploadsDir)) archive.directory(uploadsDir, 'uploads');
  if (fs.existsSync(settingsPath)) archive.file(settingsPath, { name: 'settings.json' });
  archive.append(
    JSON.stringify(
      {
        note: 'Use Backup & Settings in the app for a full MySQL snapshot.json export.',
        createdAt: new Date().toISOString(),
      },
      null,
      2
    ),
    { name: 'README.txt' }
  );
  archive.finalize();
});

if (fs.existsSync(settingsPath)) {
  const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  s.lastBackupAt = new Date().toISOString();
  fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
}

console.log(`Backup created: ${zipPath}`);
console.log('Tip: use the app Backup & Settings page for a full database snapshot.');
