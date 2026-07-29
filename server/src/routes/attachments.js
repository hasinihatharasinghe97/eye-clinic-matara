import { Router } from 'express';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import db, { storeUploadFile, deleteUploadFile } from '../db.js';

const router = Router({ mergeParams: true });

function now() {
  return new Date().toISOString();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
      return cb(new Error('Only images and PDF reports are allowed'));
    }
    cb(null, true);
  },
});

function mapAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    visitId: row.visit_id,
    relativePath: row.relative_path,
    originalName: row.original_name,
    mimeType: row.mime_type,
    createdAt: row.created_at,
    url: `/uploads/${row.relative_path.replace(/\\/g, '/')}`,
  };
}

router.get('/', async (req, res) => {
  const patient = await db.prepare('SELECT id FROM patients WHERE id = ?').get(req.params.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const rows = await db
    .prepare('SELECT * FROM attachments WHERE patient_id = ? ORDER BY created_at DESC')
    .all(req.params.patientId);
  res.json(rows.map(mapAttachment));
});

router.post('/', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const patient = await db
        .prepare('SELECT id FROM patients WHERE id = ?')
        .get(req.params.patientId);
      if (!patient) return res.status(404).json({ error: 'Patient not found' });

      const ts = now();
      const ext = path.extname(req.file.originalname) || '';
      const filename = `${randomUUID()}${ext}`;
      const relativePath = `${req.params.patientId}/${filename}`;
      const visitId = req.body.visitId || null;

      if (visitId) {
        const visit = await db
          .prepare('SELECT id FROM visits WHERE id = ? AND patient_id = ?')
          .get(visitId, req.params.patientId);
        if (!visit) {
          return res.status(400).json({ error: 'Invalid visit id' });
        }
      }

      await storeUploadFile(relativePath, req.file.buffer);

      const result = await db
        .prepare(
          `INSERT INTO attachments (patient_id, visit_id, relative_path, original_name, mime_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          req.params.patientId,
          visitId,
          relativePath,
          req.file.originalname,
          req.file.mimetype,
          ts
        );

      await db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(ts, req.params.patientId);
      const row = await db.prepare('SELECT * FROM attachments WHERE id = ?').get(result.insertId);
      res.status(201).json(mapAttachment(row));
    } catch (e) {
      res.status(500).json({ error: e.message || 'Upload failed' });
    }
  });
});

router.delete('/:attachmentId', async (req, res) => {
  const row = await db
    .prepare('SELECT * FROM attachments WHERE id = ? AND patient_id = ?')
    .get(req.params.attachmentId, req.params.patientId);
  if (!row) return res.status(404).json({ error: 'Attachment not found' });

  await deleteUploadFile(row.relative_path);
  await db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.attachmentId);
  res.json({ ok: true });
});

export default router;
