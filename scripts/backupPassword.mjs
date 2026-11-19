/** Find BACKUP_PASSWORD for the backup scripts: environment → project .env → prompt. */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fromEnvFile() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return '';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*BACKUP_PASSWORD\s*=(.*)$/);
    if (m) return m[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return '';
}

/** Ask without echoing the password to the screen. */
function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = false;
    rl._writeToOutput = (s) => {
      if (!rl.stdoutMuted) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
    rl.stdoutMuted = true;
  });
}

export async function resolveBackupPassword() {
  const pw = process.env.BACKUP_PASSWORD || fromEnvFile();
  if (pw) return pw;
  if (!process.stdin.isTTY) throw new Error('Set BACKUP_PASSWORD to decrypt this backup');
  return prompt('Backup password: ');
}
