import db from './db.js';

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

export function formNameToId(title) {
  return String(title || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\/#?&%]/g, '-')
    .slice(0, 120);
}

function isBuiltin(id) {
  const lower = String(id || '').toLowerCase();
  for (const b of BUILTIN_IDS) {
    if (b.toLowerCase() === lower) return true;
  }
  return false;
}

function parseConditions(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Guess a human name from an old custom_slug id. */
function humanizeCustomId(id) {
  return formNameToId(
    String(id || '')
      .replace(/^custom_/i, '')
      .replace(/_/g, ' ')
  );
}

/**
 * Rename a custom form primary key and rewrite assessments + patient conditions.
 */
export async function renameCustomFormId(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return newId;

  const clash = await db.prepare('SELECT id FROM custom_disease_forms WHERE id = ?').get(newId);
  if (clash) {
    throw new Error(`A form named “${newId}” already exists`);
  }
  if (isBuiltin(newId)) {
    throw new Error(`“${newId}” matches a built-in disease form`);
  }

  const row = await db.prepare('SELECT * FROM custom_disease_forms WHERE id = ?').get(oldId);
  if (!row) throw new Error('Form not found');

  await db
    .prepare(
      `INSERT INTO custom_disease_forms (id, title, short_title, fields, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(newId, row.title, row.short_title, row.fields, row.created_at, row.updated_at);

  await rewriteFormTypeReferences(oldId, newId);

  await db.prepare('DELETE FROM custom_disease_forms WHERE id = ?').run(oldId);
  return newId;
}

async function rewriteFormTypeReferences(oldId, newId) {
  await db
    .prepare('UPDATE disease_assessments SET form_type = ? WHERE form_type = ?')
    .run(newId, oldId);

  const patients = await db.prepare('SELECT id, conditions FROM patients').all();
  for (const p of patients) {
    const conditions = parseConditions(p.conditions);
    if (!conditions.includes(oldId)) continue;
    const next = [...new Set(conditions.map((c) => (c === oldId ? newId : c)))];
    await db
      .prepare('UPDATE patients SET conditions = ? WHERE id = ?')
      .run(JSON.stringify(next), p.id);
  }
}

/**
 * Fix forms / assessments / patient conditions that still use custom_… ids.
 */
export async function migrateCustomPrefixedFormIds() {
  const allForms = await db.prepare('SELECT * FROM custom_disease_forms').all();
  const byId = new Map(allForms.map((f) => [f.id, f]));

  // 1) Rename form rows that still use custom_… primary keys
  let renamed = 0;
  const prefixedForms = allForms.filter((row) => String(row.id || '').startsWith('custom_'));
  for (const row of prefixedForms) {
    let newId = formNameToId(row.title || row.short_title) || humanizeCustomId(row.id);
    if (!newId || newId === row.id) continue;
    if (isBuiltin(newId)) newId = formNameToId(`${row.title || newId} (custom)`);

    let candidate = newId;
    let n = 2;
    while (byId.has(candidate) && candidate !== row.id) {
      candidate = `${newId} (${n})`;
      n += 1;
    }
    if (candidate === row.id) continue;

    try {
      await renameCustomFormId(row.id, candidate);
      byId.delete(row.id);
      byId.set(candidate, { ...row, id: candidate });
      renamed += 1;
      console.log(`[db] Renamed disease form “${row.id}” → “${candidate}”`);
    } catch (err) {
      console.warn(`[db] Could not rename form “${row.id}”:`, err.message || err);
    }
  }

  // Refresh form list after renames
  const formsNow = await db.prepare('SELECT * FROM custom_disease_forms').all();
  const titleToId = new Map();
  for (const f of formsNow) {
    titleToId.set(String(f.title || '').toLowerCase(), f.id);
    titleToId.set(String(f.short_title || '').toLowerCase(), f.id);
    titleToId.set(humanizeCustomId(f.id).toLowerCase(), f.id);
    titleToId.set(String(f.id).toLowerCase(), f.id);
  }

  // 2) Rewrite leftover assessment form_type values that still start with custom_
  const staleAssessments = await db
    .prepare(`SELECT DISTINCT form_type FROM disease_assessments WHERE form_type LIKE 'custom\\_%' ESCAPE '\\\\'`)
    .all()
    .catch(async () => {
      const all = await db.prepare('SELECT DISTINCT form_type FROM disease_assessments').all();
      return all.filter((r) => String(r.form_type || '').startsWith('custom_'));
    });

  let assessmentsFixed = 0;
  for (const row of staleAssessments) {
    const oldType = row.form_type;
    if (!String(oldType).startsWith('custom_')) continue;
    const human = humanizeCustomId(oldType);
    const mapped =
      titleToId.get(String(oldType).toLowerCase()) ||
      titleToId.get(human.toLowerCase()) ||
      formsNow.find((f) => humanizeCustomId(oldType).toLowerCase() === String(f.title).toLowerCase())
        ?.id ||
      formsNow.find((f) =>
        String(f.title || '')
          .toLowerCase()
          .includes(human.toLowerCase().split(' ')[0] || '___')
      )?.id ||
      human;

    if (mapped && mapped !== oldType) {
      await rewriteFormTypeReferences(oldType, mapped);
      assessmentsFixed += 1;
      console.log(`[db] Updated assessments “${oldType}” → “${mapped}”`);
    }
  }

  // 3) Clean patient condition lists that still mention custom_… ids
  const patients = await db.prepare('SELECT id, conditions FROM patients').all();
  let patientsFixed = 0;
  for (const p of patients) {
    const conditions = parseConditions(p.conditions);
    let changed = false;
    const next = [];
    for (const c of conditions) {
      let mapped = c;
      if (String(c).startsWith('custom_')) {
        const human = humanizeCustomId(c);
        mapped =
          titleToId.get(String(c).toLowerCase()) ||
          titleToId.get(human.toLowerCase()) ||
          formsNow.find((f) =>
            String(f.title || '')
              .toLowerCase()
              .startsWith((human.split(' ')[0] || '').toLowerCase())
          )?.id ||
          human;
        if (mapped !== c) changed = true;
      }
      if (mapped && !next.includes(mapped)) next.push(mapped);
      else if (mapped && next.includes(mapped) && mapped === c) {
        // duplicate of an existing entry
        changed = true;
      } else if (mapped && next.includes(mapped) && mapped !== c) {
        changed = true;
      }
    }
    // Also collapse accidental duplicates even without custom_ prefix
    const deduped = [...new Set(next)];
    if (deduped.length !== conditions.length) changed = true;
    if (changed) {
      await db
        .prepare('UPDATE patients SET conditions = ? WHERE id = ?')
        .run(JSON.stringify(deduped), p.id);
      patientsFixed += 1;
    }
  }

  if (renamed || assessmentsFixed || patientsFixed) {
    console.log(
      `[db] Custom form cleanup: ${renamed} form(s), ${assessmentsFixed} assessment type(s), ${patientsFixed} patient(s)`
    );
  }
}
