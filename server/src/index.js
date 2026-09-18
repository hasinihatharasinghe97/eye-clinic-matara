import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, UPLOADS_DIR, getSettings, IS_CLOUD, readUploadFile } from './db.js';
import { startDailyBackupScheduler } from './backup.js';
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

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/uploads', async (req, res, next) => {
  try {
    const relative = decodeURIComponent(req.path || '').replace(/^\/+/, '');
    if (!relative || relative.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    if (!IS_CLOUD) {
      const full = path.join(UPLOADS_DIR, relative);
      if (!full.startsWith(UPLOADS_DIR) || !fs.existsSync(full)) {
        return res.status(404).end();
      }
      return res.sendFile(full);
    }
    const buf = await readUploadFile(relative);
    if (!buf) return res.status(404).end();
    const ext = path.extname(relative).toLowerCase();
    const types = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
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
    clinic: 'District Ayurvedic Hospital Matara — Eye Clinic',
    cloud: IS_CLOUD,
    dbMs,
  });
});

app.use('/api/system', systemRouter);
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
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, '0.0.0.0', async () => {
  try {
    await migrateCustomPrefixedFormIds();
  } catch (err) {
    console.warn('[db] custom form id migration skipped:', err.message || err);
  }
  const settings = await getSettings();
  console.log(`Eye Clinic API listening on http://0.0.0.0:${PORT}`);
  console.log(
    `Mode: MySQL${IS_CLOUD ? ' (files stored in DB)' : ' (uploads/backups on disk)'}`
  );
  console.log(`Backup folder: ${settings.backupFolder}`);
  console.log('Login password: use Backup & Settings (default on first install is clinic123)');
  startDailyBackupScheduler();
});
