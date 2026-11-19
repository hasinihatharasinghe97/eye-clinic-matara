import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, UPLOADS_DIR, getSettings, IS_CLOUD, readUploadFile } from './db.js';
import { startDailyBackupScheduler } from './backup.js';
import { requireAuth } from './auth.js';
import { ensureUsers } from './users.js';
import usersRouter from './routes/users.js';
import { startAutoCloudSync } from './cloudSync.js';
import patientsRouter from './routes/patients.js';
import visitsRouter from './routes/visits.js';
import progressRouter from './routes/progress.js';
import attachmentsRouter from './routes/attachments.js';
import diseaseAssessmentsRouter from './routes/diseaseAssessments.js';
import systemRouter from './routes/system.js';
import statsRouter from './routes/stats.js';
import diseaseFormsRouter from './routes/diseaseForms.js';
import { migrateCustomPrefixedFormIds } from './migrateCustomFormIds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

// Create the first admin / move an old clinic password into app_users before serving.
await ensureUsers();

const app = express();
app.disable('x-powered-by');

// On Render the app sits behind one proxy; trust it so req.ip is the real client IP
// (used by the login lockout). Elsewhere set TRUST_PROXY=1 only if behind a proxy.
if (process.env.RENDER || process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

// Browser security headers. The policy only allows this app's own scripts, so an
// injected script or a malicious uploaded file can't run or send data elsewhere.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        // Only upgrade to HTTPS on Render: the clinic laptop/LAN is served over plain http.
        ...(process.env.RENDER ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    // HSTS only matters over HTTPS (Render); browsers ignore it on http://.
    strictTransportSecurity: process.env.RENDER
      ? { maxAge: 31536000, includeSubDomains: true }
      : false,
    // Tokens appear in file-download URLs; never leak them to other sites.
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false,
  })
);
app.use((_req, res, next) => {
  // Camera is used for patient photos; nothing else is needed.
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
  next();
});

// The web app is served by this same server (and Vite proxies in development), so
// cross-site requests are refused unless an origin is listed in CORS_ORIGINS.
const corsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins.length ? corsOrigins : false }));

app.use(express.json({ limit: '2mb' }));

// Patient data must never be kept by the browser or a proxy cache.
app.use(['/api', '/uploads'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(requireAuth);

/** Only these file types are ever served from /uploads, each with a fixed Content-Type. */
const UPLOAD_TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

app.use('/uploads', async (req, res, next) => {
  try {
    let relative;
    try {
      relative = decodeURIComponent(req.path || '').replace(/^\/+/, '');
    } catch {
      return res.status(400).json({ error: 'Invalid path' });
    }
    if (!relative || relative.includes('..') || relative.includes('\0')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    const type = UPLOAD_TYPES[path.extname(relative).toLowerCase()];
    if (!type) return res.status(404).end();

    let buf;
    if (!IS_CLOUD) {
      const root = path.resolve(UPLOADS_DIR);
      const full = path.resolve(root, relative);
      if (!full.startsWith(root + path.sep) || !fs.existsSync(full)) {
        return res.status(404).end();
      }
      buf = await fs.promises.readFile(full);
    } else {
      buf = await readUploadFile(relative);
      if (!buf) return res.status(404).end();
    }
    // Fixed type + nosniff + sandbox: an uploaded file can never run as a web page.
    res.setHeader('Content-Type', type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (type !== 'application/pdf') {
      // (Not for PDFs: Chrome refuses to show a PDF in a sandboxed document.)
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
      );
    }
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

app.get('/api/health', async (_req, res) => {
  let dbOk = false;
  let dbMs = null;
  try {
    const t0 = Date.now();
    await db.prepare('SELECT 1 AS ok').get();
    dbMs = Date.now() - t0;
    dbOk = true;
  } catch (err) {
    console.error('[health] db check failed:', err?.message || err);
  }
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    clinic: 'Nethraloka Ayurvedic Eye Clinic',
    cloud: IS_CLOUD,
    dbMs,
  });
});

app.use('/api/system', systemRouter);
app.use('/api/users', usersRouter);
app.use('/api/stats', statsRouter);
app.use('/api/disease-forms', diseaseFormsRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/patients/:patientId/visits', visitsRouter);
app.use('/api/patients/:patientId/progress', progressRouter);
app.use('/api/patients/:patientId/attachments', attachmentsRouter);
app.use('/api/patients/:patientId/disease-assessments', diseaseAssessmentsRouter);

const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, _next) => {
  console.error(`[error] ${req.method} ${req.path}:`, err);
  // Malformed JSON / oversized body: the client's fault, safe to explain.
  const status = Number(err.status || err.statusCode) || 500;
  if (status >= 400 && status < 500) {
    const message =
      status === 413
        ? 'The data sent is too large'
        : err.type === 'entity.parse.failed'
          ? 'Invalid request data'
          : 'Bad request';
    return res.status(status).json({ error: message });
  }
  // Never send database or stack details to the browser.
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

app.listen(PORT, '0.0.0.0', async () => {
  try {
    await migrateCustomPrefixedFormIds();
  } catch (err) {
    console.warn('[db] custom form id migration skipped:', err.message || err);
  }
  const settings = await getSettings();
  console.log(`Nethraloka Ayurvedic Eye Clinic API listening on http://0.0.0.0:${PORT}`);
  console.log(
    `Mode: MySQL${IS_CLOUD ? ' (files stored in DB)' : ' (uploads/backups on disk)'}`
  );
  console.log(`Backup folder: ${settings.backupFolder}`);
  console.log('Sign-in: per-user accounts (manage under Users)');
  startDailyBackupScheduler();
  startAutoCloudSync();
});
