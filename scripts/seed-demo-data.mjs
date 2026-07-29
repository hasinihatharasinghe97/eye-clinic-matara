/**
 * Seed demo patients for every disease form so Charts / Stats have realistic data.
 *
 * Usage:
 *   node scripts/seed-demo-data.mjs
 *   node scripts/seed-demo-data.mjs --clear   # remove previous DEMO-* patients first
 *
 * Requires MySQL + .env (MYSQL_*). Restart the clinic app after seeding if it is already running.
 */
import { db } from '../server/src/db.js';

const CLEAR = process.argv.includes('--clear');

const DISEASES = [
  {
    formType: 'cataract',
    name: 'Nimal Perera',
    age: 68,
    gender: 'M',
    diagnosis: 'Age-related cataract OU',
    metrics: (i) => ({
      csgsTotal: Math.max(2, 12 - i * 1.5),
      iop: 16 + (i % 3),
      followUps: [
        {
          date: null,
          vaRe: '6/36',
          vaLe: '6/24',
          csgs: String(Math.max(2, 12 - i * 1.5)),
          remarks: 'Improving after treatment',
        },
      ],
    }),
  },
  {
    formType: 'diabetic_retinopathy',
    name: 'Kamala Silva',
    age: 55,
    gender: 'F',
    diagnosis: 'Moderate NPDR with DME',
    metrics: (i) => ({
      cmt: 420 - i * 28,
      hba1c: 9.2 - i * 0.35,
      iop: 15 + (i % 2),
      followUps: [
        {
          date: null,
          eye: 'Both',
          va: '6/18',
          cmt: String(420 - i * 28),
          stage: i < 2 ? 'Moderate NPDR' : 'Mild NPDR',
          treatment: i === 0 ? 'Anti-VEGF' : 'Observation',
          remarks: 'CMT reducing',
        },
      ],
    }),
  },
  {
    formType: 'armd',
    name: 'Sunil Fernando',
    age: 72,
    gender: 'M',
    diagnosis: 'Wet AMD — right eye',
    metrics: (i) => ({
      cmt: 380 - i * 22,
      iop: 14,
      followUps: [
        {
          date: null,
          va: i < 2 ? '6/36' : '6/24',
          oct: `CMT ${380 - i * 22}`,
          stage: i < 2 ? 'Neovascular' : 'Stable wet',
          remarks: 'Anti-VEGF series',
        },
      ],
    }),
  },
  {
    formType: 'cme',
    name: 'Ranjani Jayawardena',
    age: 61,
    gender: 'F',
    diagnosis: 'Pseudophakic CME',
    metrics: (i) => ({
      cmt: 480 - i * 35,
      srfHeight: Math.max(0, 80 - i * 20),
      iop: 17,
      followUps: [
        {
          date: null,
          eye: 'Right (OD)',
          va: '6/18',
          cmt: String(480 - i * 35),
          cysts: i < 2 ? 'Moderate' : 'Mild',
          srf: String(Math.max(0, 80 - i * 20)),
          remarks: 'Responding to NSAID + steroid',
        },
      ],
    }),
  },
  {
    formType: 'hypertensive_retinopathy',
    name: 'Ajith Bandara',
    age: 58,
    gender: 'M',
    diagnosis: 'Hypertensive retinopathy Grade II',
    metrics: (i) => ({
      iop: 18 - (i % 2),
      followUps: [
        {
          date: null,
          bp: `${160 - i * 8}/${95 - i * 3}`,
          va: '6/9',
          grade: i < 2 ? 'Grade II' : 'Grade I',
          fundus: 'Improving AV changes',
          remarks: 'BP control improving',
        },
      ],
    }),
  },
  {
    formType: 'cscr',
    name: 'Dilshan Wickramasinghe',
    age: 42,
    gender: 'M',
    diagnosis: 'Acute CSCR left eye',
    metrics: (i) => ({
      cmt: 450 - i * 40,
      srfHeight: Math.max(0, 220 - i * 45),
      followUps: [
        {
          date: null,
          eye: 'Left (OS)',
          cmt: String(450 - i * 40),
          srf: String(Math.max(0, 220 - i * 45)),
          ped: i < 1 ? 'Yes' : 'No',
          rpe: 'Normal',
          remarks: 'SRF resolving',
        },
      ],
    }),
  },
  {
    formType: 'retinal_vascular_occlusive',
    name: 'Priyanka Rathnayake',
    age: 64,
    gender: 'F',
    diagnosis: 'BRVO with macular edema',
    metrics: (i) => ({
      cmt: 510 - i * 38,
      iop: 16 + i,
      followUps: [
        {
          date: null,
          va: i < 2 ? '6/36' : '6/18',
          iop: String(16 + i),
          oct: `CMT ${510 - i * 38}`,
          nv: 'None',
          plan: i === 0 ? 'Anti-VEGF' : 'Monitor',
        },
      ],
    }),
  },
  {
    formType: 'retinitis_pigmentosa',
    name: 'Chaminda Gunasekara',
    age: 34,
    gender: 'M',
    diagnosis: 'Typical RP — moderate stage',
    metrics: (i) => ({
      iop: 14,
      followUps: [
        {
          date: null,
          va: '6/12',
          field: i < 2 ? 'Constricted' : 'Stable constriction',
          oct: 'Outer thinning',
          erg: 'Reduced',
          remarks: 'Low vision support',
        },
      ],
    }),
  },
  {
    formType: 'hereditary_retinal_dystrophies',
    name: 'Sanduni Amarasinghe',
    age: 28,
    gender: 'F',
    diagnosis: 'Stargardt disease',
    metrics: (i) => ({
      followUps: [
        {
          date: null,
          va: i < 2 ? '6/24' : '6/18',
          field: 'Central scotoma',
          oct: 'Outer atrophy',
          ergEog: 'Reduced cones',
          diagnosis: 'Stargardt',
          remarks: 'UV protection counselling',
        },
      ],
    }),
  },
  {
    formType: 'macular_dystrophy',
    name: 'Tharindu Weerasinghe',
    age: 31,
    gender: 'M',
    diagnosis: 'Best disease Stage 2',
    metrics: (i) => ({
      cmt: 340 + i * 5,
      followUps: [
        {
          date: null,
          va: '6/18',
          oct: i < 2 ? 'Vitelliform' : 'Stable vitelliform',
          stage: 'Stage 2',
          remarks: 'Family screening done',
        },
      ],
    }),
  },
  {
    formType: 'retinal_degenerations',
    name: 'Malini Cooray',
    age: 49,
    gender: 'F',
    diagnosis: 'Lattice degeneration OU',
    metrics: (i) => ({
      followUps: [
        {
          date: null,
          va: '6/6',
          peripheral: i === 0 ? 'Lattice + hole OD' : 'Laser scars stable',
          oct: 'Normal macula',
          risk: i === 0 ? 'Moderate' : 'Low',
          plan: i === 0 ? 'Prophylactic laser' : 'Observe',
        },
      ],
    }),
  },
  {
    formType: 'retinopathy_of_prematurity',
    name: 'Baby Kasun (follow-up)',
    age: 4,
    gender: 'M',
    diagnosis: 'Treated ROP — chronic follow-up',
    metrics: (i) => ({
      iop: 12 + i,
      pma: 40,
      followUps: [
        {
          date: null,
          va: i < 2 ? 'Fixation fair' : 'Fixation good',
          retina: 'Attached',
          iop: String(12 + i),
          plan: 'Glasses + amblyopia therapy',
          remarks: 'Stable after laser',
        },
      ],
    }),
  },
];

function isoDaysAgo(days, withTime = false) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  if (!withTime) return d.toISOString().slice(0, 10);
  return d.toISOString().slice(0, 16);
}

function monthsAgoDate(months, dayOffset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setDate(d.getDate() - dayOffset);
  return d.toISOString().slice(0, 10);
}

async function clearDemoPatients() {
  const rows = await db
    .prepare(`SELECT id FROM patients WHERE opd_ad_no LIKE 'DEMO-%'`)
    .all();
  for (const row of rows) {
    await db.prepare('DELETE FROM patients WHERE id = ?').run(row.id);
  }
  console.log(`Cleared ${rows.length} previous DEMO patients.`);
}

async function seed() {
  if (CLEAR) await clearDemoPatients();

  let patientsCreated = 0;
  let visitsCreated = 0;
  let progressCreated = 0;
  let assessmentsCreated = 0;

  for (let p = 0; p < DISEASES.length; p++) {
    const def = DISEASES[p];
    const ts = new Date().toISOString();
    const regDate = monthsAgoDate(8 - Math.min(p, 6));
    const opd = `DEMO-${String(p + 1).padStart(3, '0')}`;

    const patientResult = await db
      .prepare(
        `INSERT INTO patients (
          name, age, gender, registration_date, opd_ad_no, occupation,
          id_number, address, phone, conditions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        def.name,
        def.age,
        def.gender,
        regDate,
        opd,
        p % 2 === 0 ? 'Retired' : 'Teacher',
        `NIC-DEMO-${p + 1}`,
        'Matara',
        `077${String(1000000 + p * 1111).slice(0, 7)}`,
        JSON.stringify([def.formType]),
        ts,
        ts
      );

    const patientId = patientResult.insertId;
    patientsCreated += 1;

    // 4 visits over ~6 months
    for (let v = 0; v < 4; v++) {
      const visitDate = monthsAgoDate(5 - v, v * 2);
      const vision = {
        distance: {
          rEye: ['6/36', '6/24', '6/18', '6/12'][v],
          rPh: ['6/24', '6/18', '6/12', '6/9'][v],
          lEye: ['6/24', '6/18', '6/12', '6/9'][v],
          lPh: ['6/18', '6/12', '6/9', '6/6'][v],
        },
        near: { rEye: String(8 - v), rPh: String(7 - v), lEye: String(7 - v), lPh: String(6 - v) },
      };
      const visualField = JSON.stringify({
        r: { tl: false, tr: v < 2, bl: false, br: v < 1 },
        l: { tl: v < 2, tr: v < 3, bl: v < 1, br: false },
        notes: v === 0 ? 'Initial field defects' : 'Improving',
      });

      await db
        .prepare(
          `INSERT INTO visits (
            patient_id, visit_date, co_complaints, oc_other, family_history,
            exam_external, vision, inspection, slit_lamp, cataract, ix_history,
            diagnosis, iop, color_vision, visual_field, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          patientId,
          visitDate,
          v === 0 ? 'Blurred vision' : 'Follow-up review',
          null,
          null,
          JSON.stringify({}),
          JSON.stringify(vision),
          JSON.stringify({}),
          JSON.stringify({}),
          JSON.stringify({}),
          null,
          def.diagnosis,
          String(14 + (v % 4)),
          String(12 + v),
          visualField,
          `Demo visit ${v + 1} for ${def.formType}`,
          ts,
          ts
        );
      visitsCreated += 1;
    }

    // Progress scores trending upward (improvement)
    for (let g = 0; g < 5; g++) {
      const logDate = monthsAgoDate(5 - g, 3);
      const base = 4 + g * 1.1;
      await db
        .prepare(
          `INSERT INTO progress_logs (
            patient_id, log_date, right_eye, left_eye, right_score, left_score, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          patientId,
          logDate,
          `R clearer — visit ${g + 1}`,
          `L clearer — visit ${g + 1}`,
          Math.min(10, Number(base.toFixed(1))),
          Math.min(10, Number((base - 0.4).toFixed(1))),
          ts
        );
      progressCreated += 1;
    }

    // 4 disease assessments with declining pathology metrics (improvement)
    for (let a = 0; a < 4; a++) {
      const assessmentDate = isoDaysAgo((3 - a) * 40 + 5, true);
      const raw = def.metrics(a);
      const followUps = (raw.followUps || []).map((fu) => ({
        ...fu,
        date: assessmentDate.slice(0, 10),
      }));
      const data = {
        ...raw,
        followUps,
        eyeDetail: a % 2 === 0 ? 'Both' : 'Right (OD)',
        bcva: ['6/36', '6/24', '6/18', '6/12'][a],
      };
      delete data.followUps;
      data.followUps = followUps;

      await db
        .prepare(
          `INSERT INTO disease_assessments (
            patient_id, form_type, assessment_date, eye, \`data\`, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          patientId,
          def.formType,
          assessmentDate.slice(0, 10),
          a % 2 === 0 ? 'Both' : 'Right (OD)',
          JSON.stringify(data),
          `Demo assessment ${a + 1}`,
          ts,
          ts
        );
      assessmentsCreated += 1;
    }
  }

  // One multi-disease patient for overall stats mix
  {
    const ts = new Date().toISOString();
    const conditions = ['cataract', 'diabetic_retinopathy', 'hypertensive_retinopathy'];
    const result = await db
      .prepare(
        `INSERT INTO patients (
          name, age, gender, registration_date, opd_ad_no, occupation,
          id_number, address, phone, conditions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'Multi-disease Demo Patient',
        70,
        'M',
        monthsAgoDate(10),
        'DEMO-MULTI',
        'Farmer',
        'NIC-DEMO-MULTI',
        'Matara',
        '0779998877',
        JSON.stringify(conditions),
        ts,
        ts
      );
    const patientId = result.insertId;
    patientsCreated += 1;

    for (const formType of conditions) {
      for (let a = 0; a < 3; a++) {
        const assessmentDate = monthsAgoDate(4 - a);
        const data = {
          cmt: formType === 'diabetic_retinopathy' ? 400 - a * 30 : undefined,
          csgsTotal: formType === 'cataract' ? 10 - a * 2 : undefined,
          iop: 15 + a,
          hba1c: formType === 'diabetic_retinopathy' ? 8.5 - a * 0.4 : undefined,
          followUps: [
            {
              date: assessmentDate,
              cmt: formType === 'diabetic_retinopathy' ? String(400 - a * 30) : '',
              csgs: formType === 'cataract' ? String(10 - a * 2) : '',
              iop: String(15 + a),
              remarks: 'Multi-disease demo',
            },
          ],
        };
        await db
          .prepare(
            `INSERT INTO disease_assessments (
              patient_id, form_type, assessment_date, eye, \`data\`, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            patientId,
            formType,
            assessmentDate,
            'Both',
            JSON.stringify(data),
            'Multi demo',
            ts,
            ts
          );
        assessmentsCreated += 1;
      }
    }

    for (let g = 0; g < 4; g++) {
      await db
        .prepare(
          `INSERT INTO progress_logs (
            patient_id, log_date, right_eye, left_eye, right_score, left_score, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          patientId,
          monthsAgoDate(3 - g),
          'Improving',
          'Improving',
          5 + g,
          4.5 + g,
          ts
        );
      progressCreated += 1;
    }
  }

  console.log('Demo seed complete.');
  console.log(`  Patients:     ${patientsCreated}`);
  console.log(`  Visits:       ${visitsCreated}`);
  console.log(`  Progress:     ${progressCreated}`);
  console.log(`  Assessments:  ${assessmentsCreated}`);
  console.log('');
  console.log('Open the app → Stats for clinic charts.');
  console.log('Open any DEMO-* patient → Charts for improvement trends.');
  console.log('Re-run with --clear to wipe DEMO patients and seed again.');
}

try {
  await seed();
  process.exit(0);
} catch (err) {
  console.error('Seed failed:', err.message || err);
  process.exit(1);
}
