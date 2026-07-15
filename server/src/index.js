import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UPLOADS_DIR, getSettings, IS_CLOUD, readUploadFile } from './db.js';
import { startDailyBackupScheduler } from './backup.js';
import patientsRouter from './routes/patients.js';
import visitsRouter from './routes/visits.js';
import progressRouter from './routes/progress.js';
import attachmentsRouter from './routes/attachments.js';
import systemRouter from './routes/system.js';

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

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    clinic: 'District Ayurvedic Hospital Matara — Eye Clinic',
    cloud: IS_CLOUD,
  });
});

app.use('/api/system', systemRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/patients/:patientId/visits', visitsRouter);
app.use('/api/patients/:patientId/progress', progressRouter);
app.use('/api/patients/:patientId/attachments', attachmentsRouter);

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
  const settings = await getSettings();
  console.log(`Eye Clinic API listening on http://0.0.0.0:${PORT}`);
  console.log(`Mode: ${IS_CLOUD ? 'cloud (Turso)' : 'local SQLite'}`);
  console.log(`Backup folder: ${settings.backupFolder}`);
  console.log('Default login password: clinic123 (change in Backup & Settings)');
  startDailyBackupScheduler();
});
