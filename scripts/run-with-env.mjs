/**
 * Load a specific env file into process.env, then run another script.
 * Usage: node scripts/run-with-env.mjs .env.clinic-pc scripts/export-mysql-snapshot.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const envFile = process.argv[2];
const script = process.argv[3];
const scriptArgs = process.argv.slice(4);

if (!envFile || !script) {
  console.error(
    'Usage: node scripts/run-with-env.mjs <env-file> <script.mjs> [args...]'
  );
  process.exit(1);
}

const envPath = path.resolve(root, envFile);
if (!fs.existsSync(envPath)) {
  console.error(`Env file not found: ${envPath}`);
  process.exit(1);
}

let text = fs.readFileSync(envPath, 'utf8');
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

const env = { ...process.env };
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
  env[key] = value;
}

const scriptPath = path.resolve(root, script);
console.log(`Using env from ${envPath}`);
console.log(
  `MySQL → ${env.MYSQL_USER}@${env.MYSQL_HOST}:${env.MYSQL_PORT}/${env.MYSQL_DATABASE}` +
    (env.MYSQL_SSL === '1' ? ' (SSL)' : '')
);

const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
  cwd: root,
  stdio: 'inherit',
  env,
});

process.exit(result.status ?? 1);
