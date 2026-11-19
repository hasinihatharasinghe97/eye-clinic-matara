import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import db, { storeUploadFile, deleteUploadFile, getPatientOpd } from '../db.js';
import { nowClinic } from '../clinicDate.js';
import { parsePagination, paginationMeta } from '../pagination.js';

const router = Router({ mergeParams: true });

function now() {
  return nowClinic();
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

/**
 * Identify the file from its first bytes ("magic numbers"). Anything that isn't a real
 * JPEG, PNG, GIF, WebP or PDF (HTML, SVG, scripts renamed to .png, …) is rejected.
 */
function detectFileType(buf) {
  if (!buf || buf.length < 12) return null;
  const hex = buf.subarray(0, 12).toString('hex');
  if (hex.startsWith('ffd8ff')) return { ext: '.jpg', mime: 'image/jpeg' };
  if (hex.startsWith('89504e470d0a1a0a')) return { ext: '.png', mime: 'image/png' };
  if (hex.startsWith('474946383761') || hex.startsWith('474946383961')) {
    return { ext: '.gif', mime: 'image/gif' };
  }
  if (hex.startsWith('52494646') && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { ext: '.webp', mime: 'image/webp' };
  }
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { ext: '.pdf', mime: 'application/pdf' };
  }
  return null;
}

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
  const { page, pageSize, offset } = parsePagination(req.query);
  const countRow = await db
    .prepare('SELECT COUNT(*) AS total FROM attachments WHERE patient_id = ?')
    .get(req.params.patientId);
  const total = Number(countRow?.total || 0);
  const rows = await db
    .prepare(
      `SELECT * FROM attachments WHERE patient_id = ?
       ORDER BY created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    )
    .all(req.params.patientId);
  res.json({
    attachments: rows.map(mapAttachment),
    ...paginationMeta(page, pageSize, total),
  });
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

      // Trust the file's actual bytes, not the browser-supplied name or MIME type.
      const detected = detectFileType(req.file.buffer);
      if (!detected) {
        return res.status(400).json({ error: 'Only JPEG, PNG, WebP, GIF images and PDF reports are allowed' });
      }

      const ts = now();
      const filename = `${randomUUID()}${detected.ext}`;
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

      const opdAdNo = await getPatientOpd(req.params.patientId);
      const result = await db
        .prepare(
          `INSERT INTO attachments (patient_id, opd_ad_no, visit_id, relative_path, original_name, mime_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          req.params.patientId,
          opdAdNo,
          visitId,
          relativePath,
          String(req.file.originalname || 'file').replace(/[\u0000-\u001f<>"\\/]/g, '_').slice(0, 200),
          detected.mime,
          ts
        );

      await db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(ts, req.params.patientId);
      const row = await db.prepare('SELECT * FROM attachments WHERE id = ?').get(result.insertId);
      res.status(201).json(mapAttachment(row));
    } catch (e) {
      console.error('[upload] failed:', e);
      res.status(500).json({ error: 'Upload failed. Please try again.' });
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
