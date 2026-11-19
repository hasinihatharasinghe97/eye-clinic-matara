#!/usr/bin/env node
/**
 * Turn an encrypted backup (.zip.enc) back into a normal ZIP.
 *
 *   node scripts/decrypt-backup.mjs <EyeClinic-Backup-....zip.enc> [output.zip]
 *
 * The backup password comes from BACKUP_PASSWORD (environment or the project .env);
 * if neither has it, you are asked to type it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { decryptBackup, isEncryptedBackup } from '../server/src/backupCrypto.js';
import { resolveBackupPassword } from './backupPassword.mjs';

const input = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!input || !fs.existsSync(input)) {
  console.error('Usage: node scripts/decrypt-backup.mjs <backup.zip.enc> [output.zip]');
  process.exit(1);
}
const output = process.argv[3]
  ? path.resolve(process.argv[3])
  : input.replace(/\.enc$/i, '').replace(/(\.zip)?$/i, '.zip');

const data = fs.readFileSync(input);
if (!isEncryptedBackup(data)) {
  console.error('This file is not an encrypted Eye Clinic backup (it may already be a normal ZIP).');
  process.exit(1);
}
if (fs.existsSync(output)) {
  console.error(`Output already exists, not overwriting: ${output}`);
  process.exit(1);
}

try {
  const zip = decryptBackup(data, await resolveBackupPassword());
  fs.writeFileSync(output, zip);
  console.log(`Decrypted → ${output}`);
  console.log('This ZIP contains patient records unencrypted. Delete it when you are done.');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
