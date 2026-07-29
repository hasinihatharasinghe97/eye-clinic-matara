import { Router } from 'express';
import db from '../db.js';
import { formNameToId, renameCustomFormId } from '../migrateCustomFormIds.js';

const router = Router();

/** Built-in form ids that custom forms must not overwrite. */
const BUILTIN_IDS = new Set([
  'cataract',
  'diabetic_retinopathy',
  'armd',
  'cme',
  'hypertensive_retinopathy',
  'cscr',
  'retinal_vascular_occlusive',
  'retinitis_pigmentosa',
  'hereditary_retinal_dystrophies',
  'macular_dystrophy',
  'retinal_degenerations',
  'retinopathy_of_prematurity',
]);

const FIELD_TYPES = new Set([
  'section',
  'text',
  'date',
  'datetime',
  'number',
  'textarea',
  'select',
  'checkboxes',
  'radio',
  'followup',
]);

function now() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function parseFields(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeOptions(value) {
  if (Array.isArray(value)) {
    return value.map((o) => String(o).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,/)
      .map((o) => o.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeFollowupColumns(columns) {
  if (!Array.isArray(columns)) return [];
  const out = [];
  for (const col of columns) {
    if (!col || typeof col !== 'object') continue;
    const label = String(col.label || '').trim();
    if (!label) continue;
    const key = slugify(col.key || label) || `col_${out.length + 1}`;
    const inputType = ['text', 'date', 'datetime', 'number', 'tel'].includes(col.inputType)
      ? col.inputType
      : 'text';
    out.push({
      key,
      label,
      inputType,
      unit: col.unit ? String(col.unit) : undefined,
    });
  }
  return out;
}

function normalizeFields(fields) {
  if (!Array.isArray(fields)) return { error: 'Fields must be a list' };
  const out = [];
  const keys = new Set();

  for (const raw of fields) {
    if (!raw || typeof raw !== 'object') continue;
    const type = String(raw.type || '');
    if (!FIELD_TYPES.has(type)) continue;

    if (type === 'section') {
      const title = String(raw.title || '').trim();
      if (!title) continue;
      out.push({ type: 'section', title });
      continue;
    }

    const label = String(raw.label || '').trim();
    if (!label) continue;
    let key = slugify(raw.key || label);
    if (!key) key = `field_${out.length + 1}`;
    if (keys.has(key)) key = `${key}_${out.length + 1}`;
    keys.add(key);

    if (type === 'text') {
      out.push({
        type: 'text',
        key,
        label,
        placeholder: raw.placeholder ? String(raw.placeholder) : undefined,
        unit: raw.unit ? String(raw.unit) : undefined,
      });
    } else if (type === 'number') {
      out.push({
        type: 'number',
        key,
        label,
        placeholder: raw.placeholder ? String(raw.placeholder) : undefined,
        step: raw.step ?? 'any',
        unit: raw.unit ? String(raw.unit) : undefined,
      });
    } else if (type === 'date' || type === 'datetime') {
      out.push({ type, key, label });
    } else if (type === 'textarea') {
      out.push({
        type: 'textarea',
        key,
        label,
        rows: Number(raw.rows) > 0 ? Number(raw.rows) : 3,
      });
    } else if (type === 'select' || type === 'checkboxes' || type === 'radio') {
      const options = normalizeOptions(raw.options);
      if (options.length === 0) {
        return { error: `"${label}" needs at least one option` };
      }
      out.push({
        type,
        key,
        label,
        options,
        allowEmpty: type === 'select' ? true : undefined,
      });
    } else if (type === 'followup') {
      const columns = normalizeFollowupColumns(raw.columns);
      if (columns.length === 0) {
        return { error: `"${label}" follow-up table needs at least one column` };
      }
      out.push({ type: 'followup', key, label, columns });
    }
  }

  if (out.length === 0) return { error: 'Add at least one field to the form' };
  return { fields: out };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    shortTitle: row.short_title,
    fields: parseFields(row.fields),
    custom: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function makeId(title) {
  return formNameToId(title);
}

function builtinConflict(id) {
  const lower = id.toLowerCase();
  if (BUILTIN_IDS.has(lower)) return true;
  for (const builtin of BUILTIN_IDS) {
    if (builtin.toLowerCase() === lower) return true;
  }
  return false;
}

router.get('/', async (_req, res) => {
  const rows = await db
    .prepare('SELECT * FROM custom_disease_forms ORDER BY title ASC')
    .all();
  res.json(rows.map(mapRow));
});

router.get('/:id', async (req, res) => {
  const row = await db
    .prepare('SELECT * FROM custom_disease_forms WHERE id = ?')
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Form not found' });
  res.json(mapRow(row));
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const shortTitle = String(body.shortTitle || body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const normalized = normalizeFields(body.fields);
  if (normalized.error) return res.status(400).json({ error: normalized.error });

  let id = makeId(title);
  if (!id) return res.status(400).json({ error: 'Title is required' });
  if (builtinConflict(id)) {
    return res.status(400).json({
      error: 'That name matches a built-in disease form. Choose a different name.',
    });
  }

  const existing = await db.prepare('SELECT id FROM custom_disease_forms WHERE id = ?').get(id);
  if (existing) {
    return res.status(400).json({
      error: 'A form with that name already exists. Choose a different name.',
    });
  }

  const ts = now();
  await db
    .prepare(
      `INSERT INTO custom_disease_forms (id, title, short_title, fields, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, title, shortTitle || title, JSON.stringify(normalized.fields), ts, ts);

  const row = await db.prepare('SELECT * FROM custom_disease_forms WHERE id = ?').get(id);
  res.status(201).json(mapRow(row));
});

router.put('/:id', async (req, res) => {
  const existing = await db
    .prepare('SELECT * FROM custom_disease_forms WHERE id = ?')
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Form not found' });

  const body = req.body || {};
  const title = String(body.title || '').trim();
  const shortTitle = String(body.shortTitle || body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const normalized = normalizeFields(body.fields);
  if (normalized.error) return res.status(400).json({ error: normalized.error });

  const ts = now();
  let id = req.params.id;
  const desiredId = makeId(title);

  // If the form still has a custom_… id (or the name changed), rename to the real form name.
  if (desiredId && desiredId !== id) {
    if (builtinConflict(desiredId)) {
      return res.status(400).json({
        error: 'That name matches a built-in disease form. Choose a different name.',
      });
    }
    try {
      id = await renameCustomFormId(req.params.id, desiredId);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Could not rename form' });
    }
  }

  await db
    .prepare(
      `UPDATE custom_disease_forms
       SET title = ?, short_title = ?, fields = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(title, shortTitle || title, JSON.stringify(normalized.fields), ts, id);

  const row = await db.prepare('SELECT * FROM custom_disease_forms WHERE id = ?').get(id);
  res.json(mapRow(row));
});

router.delete('/:id', async (req, res) => {
  const existing = await db
    .prepare('SELECT id FROM custom_disease_forms WHERE id = ?')
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Form not found' });

  const usage = await db
    .prepare(
      'SELECT COUNT(*) AS c FROM disease_assessments WHERE form_type = ?'
    )
    .get(req.params.id);
  const count = Number(usage?.c || 0);
  if (count > 0 && !req.query.force) {
    return res.status(409).json({
      error: `This form has ${count} saved assessment(s). Delete those first, or confirm force delete.`,
      assessmentCount: count,
    });
  }

  await db.prepare('DELETE FROM custom_disease_forms WHERE id = ?').run(req.params.id);
  res.json({ ok: true, assessmentCount: count });
});

export default router;
