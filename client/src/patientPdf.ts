import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import {
  api,
  localClinicDate,
  withAuth,
  type Attachment,
  type ChartPoint,
  type DiseaseAssessment,
  type Patient,
  type PatientCharts,
  type ProgressLog,
  type Visit,
} from './api';
import { DISTANCE_SCALE, NEAR_SCALE, visionLabel, type VisionScale } from './charts/visionScale';
import { diseaseFormTitle, getDiseaseForm } from './diseaseForms/catalog';
import {
  fetchAll,
  fetchAllVisits,
  formatValue,
  hasValue,
  VISIT_SECTIONS,
} from './visitSummary';

const HEAD_COLOR: [number, number, number] = [15, 76, 92];
const MARGIN = 14;

/** jsPDF's built-in fonts only cover Latin-1; swap common symbols and drop the rest. */
function pdfText(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/[–—−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/→/g, '->')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/µ/g, 'u')
    .replace(/[^\t\n\r -~ -ÿ]/g, '?');
}

function humanize(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

class PdfBuilder {
  doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  y = 16;
  private footerLabel: string;

  constructor(footerLabel: string) {
    this.footerLabel = footerLabel;
  }

  get pageHeight() {
    return this.doc.internal.pageSize.getHeight();
  }

  get pageWidth() {
    return this.doc.internal.pageSize.getWidth();
  }

  ensure(space: number) {
    if (this.y + space > this.pageHeight - 16) {
      this.doc.addPage();
      this.y = 16;
    }
  }

  heading(text: string, size = 13) {
    this.ensure(14);
    this.y += size >= 13 ? 4 : 2;
    this.doc.setFontSize(size);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(...HEAD_COLOR);
    this.doc.text(pdfText(text), MARGIN, this.y);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(0);
    this.y += size >= 13 ? 3 : 2;
  }

  note(text: string) {
    this.ensure(8);
    this.doc.setFontSize(9);
    this.doc.setTextColor(110);
    this.doc.text(pdfText(text), MARGIN, this.y + 4);
    this.doc.setTextColor(0);
    this.y += 7;
  }

  table(head: string[] | null, body: RowInput[], opts: Parameters<typeof autoTable>[1] = {}) {
    if (body.length === 0) return;
    autoTable(this.doc, {
      startY: this.y + 1,
      head: head ? [head.map(pdfText)] : undefined,
      body: body.map((row) =>
        Array.isArray(row) ? row.map((c) => (typeof c === 'object' && c ? c : pdfText(c))) : row
      ) as RowInput[],
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 8.5, cellPadding: 1.6, overflow: 'linebreak' },
      headStyles: { fillColor: HEAD_COLOR, textColor: 255 },
      ...opts,
    });
    this.y =
      (this.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      this.y;
    this.y += 3;
  }

  /** Two-column label/value table; rows with empty values are skipped. */
  details(rows: Array<[string, unknown]>, title?: string) {
    const body = rows
      .filter(([, v]) => hasValue(v))
      .map(([k, v]) => [k, formatValue(v)]);
    if (body.length === 0) return;
    if (title) this.heading(title, 10);
    this.table(null, body, {
      columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold', textColor: 60 } },
      theme: 'grid',
    });
  }

  finish(fileName: string) {
    const total = this.doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(8);
      this.doc.setTextColor(120);
      this.doc.text(
        pdfText(`${this.footerLabel} - generated ${localClinicDate()} - page ${i} of ${total}`),
        MARGIN,
        this.pageHeight - 8
      );
    }
    this.doc.save(fileName);
  }
}

/**
 * One screening visit: every field of the screening form, grouped by the form's
 * sections (empty fields left blank), so each visit reads like the form.
 */
function addVisit(pdf: PdfBuilder, v: Visit, index: number) {
  pdf.heading(`Visit ${index + 1} - ${v.visitDate}`, 11);
  const body: RowInput[] = [];
  for (const section of VISIT_SECTIONS) {
    body.push([
      {
        content: pdfText(section.title),
        colSpan: 2,
        styles: { fillColor: [228, 242, 236], textColor: HEAD_COLOR, fontStyle: 'bold' },
      },
    ]);
    for (const row of section.rows) {
      // Empty fields stay blank: "-" already means blind (vision) or negative (glare/halo).
      body.push([row.label, row.get(v)]);
    }
  }
  pdf.table(null, body, {
    theme: 'grid',
    columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold', textColor: 60 } },
    rowPageBreak: 'avoid',
  });
}

function addAssessment(pdf: PdfBuilder, a: DiseaseAssessment) {
  pdf.heading(`${diseaseFormTitle(a.formType)} - ${a.assessmentDate}`, 11);
  const def = getDiseaseForm(a.formType);
  const data = a.data || {};
  const used = new Set<string>();
  let rows: Array<[string, unknown]> = [['Eye', a.eye]];
  let sectionTitle: string | undefined;

  const flush = () => {
    pdf.details(rows, sectionTitle);
    rows = [];
  };

  for (const field of def?.fields || []) {
    if (field.type === 'section') {
      flush();
      sectionTitle = field.title;
      continue;
    }
    used.add(field.key);
    const value = data[field.key];
    if (field.type === 'followup') {
      const list = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
      const filled = list.filter((r) => field.columns.some((c) => hasValue(r?.[c.key])));
      if (filled.length === 0) continue;
      flush();
      sectionTitle = undefined;
      pdf.heading(field.label, 10);
      pdf.table(
        field.columns.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label)),
        filled.map((r) => field.columns.map((c) => formatValue(r[c.key]))),
        { theme: 'grid' }
      );
      continue;
    }
    if (field.type === 'score' && hasValue(value)) {
      const opt = field.options.find((o) => o.value === Number(value));
      rows.push([field.label, opt ? `${opt.value} - ${opt.label}` : value]);
      continue;
    }
    rows.push([field.label, value]);
  }
  flush();

  // Values saved under keys the current form no longer defines.
  const extra = Object.entries(data).filter(
    ([k, v]) => !used.has(k) && k !== 'eyeDetail' && hasValue(v)
  );
  pdf.details(
    extra.map(([k, v]) => [humanize(k), v]),
    extra.length ? 'Other recorded values' : undefined
  );
  pdf.details([['Notes', a.notes]]);
}

async function loadImage(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    // Re-encode through a canvas so any browser-readable format becomes a JPEG.
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.82), w: canvas.width, h: canvas.height };
  } catch {
    return null;
  }
}

type PdfSeries = { name: string; color: [number, number, number]; points: ChartPoint[] };
type PdfChart = { title: string; subtitle: string; series: PdfSeries[]; scale?: VisionScale };

/** Right = blue, Left = orange: easy to tell apart, also for colour-blind readers. */
const RIGHT_COLOR: [number, number, number] = [31, 95, 191];
const LEFT_COLOR: [number, number, number] = [217, 72, 15];

function niceStep(range: number) {
  const raw = range / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/** Draw one line chart (dates across, values up) inside the given box. */
function drawChart(doc: jsPDF, chart: PdfChart, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(210);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 1.5, 1.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...HEAD_COLOR);
  doc.text(pdfText(chart.title), x + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(110);
  doc.text(pdfText(chart.subtitle), x + 3, y + 8.8, { maxWidth: w - 6 });

  const series = chart.series.filter((s) => s.points.length > 0);
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const values = series.flatMap((s) => s.points.map((p) => p.value));

  let lo: number;
  let hi: number;
  let ticks: number[];
  const scale = chart.scale;
  if (scale) {
    lo = 1;
    hi = scale.max;
    ticks = Array.from({ length: scale.max }, (_, i) => i + 1);
  } else {
    lo = Math.min(0, ...values);
    hi = Math.max(...values);
    if (hi === lo) hi = lo + 1;
    const step = niceStep(hi - lo);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    ticks = [];
    for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toFixed(6)));
  }
  const tickLabel = (t: number) => (scale ? visionLabel(scale, t) : String(t));

  const left = x + (scale ? 15 : 11);
  const right = x + w - 9;
  const top = y + 13;
  const bottom = y + h - 13;
  // Vision scales: best (1) at the top. Numeric: larger values at the top.
  const py = (v: number) =>
    scale
      ? top + ((v - lo) / (hi - lo)) * (bottom - top)
      : bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const px = (date: string) => {
    const i = dates.indexOf(date);
    return dates.length === 1 ? (left + right) / 2 : left + (i / (dates.length - 1)) * (right - left);
  };

  doc.setFontSize(scale ? 5.5 : 6);
  for (const t of ticks) {
    const ty = py(t);
    doc.setDrawColor(230);
    doc.setLineWidth(0.15);
    doc.line(left, ty, right, ty);
    doc.setTextColor(100);
    doc.text(pdfText(tickLabel(t)), left - 1.5, ty + 0.8, { align: 'right' });
  }
  doc.setDrawColor(150);
  doc.setLineWidth(0.25);
  doc.line(left, top, left, bottom);
  doc.line(left, bottom, right, bottom);

  const every = Math.max(1, Math.ceil(dates.length / 5));
  doc.setFontSize(5.5);
  dates.forEach((d, i) => {
    if (i % every !== 0 && i !== dates.length - 1) return;
    doc.text(d, px(d), bottom + 3.5, { align: 'center' });
  });

  for (const s of series) {
    const pts = [...s.points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    doc.setDrawColor(...s.color);
    doc.setFillColor(...s.color);
    doc.setLineWidth(0.5);
    pts.forEach((p, i) => {
      if (i > 0) doc.line(px(pts[i - 1].date), py(pts[i - 1].value), px(p.date), py(p.value));
    });
    for (const p of pts) doc.circle(px(p.date), py(p.value), 0.7, 'F');
  }

  let lx = left;
  doc.setFontSize(6.5);
  for (const s of series) {
    doc.setFillColor(...s.color);
    doc.rect(lx, y + h - 6.2, 3, 1.6, 'F');
    doc.setTextColor(60);
    doc.text(pdfText(s.name), lx + 4, y + h - 4.8);
    lx += doc.getTextWidth(pdfText(s.name)) + 9;
  }
  doc.setTextColor(0);
}

function buildCharts(data: PatientCharts): PdfChart[] {
  const s = (key: string) => data.series[key] || [];
  const rl = (rKey: string, lKey: string, prefix = ''): PdfSeries[] => [
    { name: `${prefix}Right (R)`, color: RIGHT_COLOR, points: s(rKey) },
    { name: `${prefix}Left (L)`, color: LEFT_COLOR, points: s(lKey) },
  ];
  const one = (key: string, name: string): PdfSeries[] => [
    { name, color: RIGHT_COLOR, points: s(key) },
  ];
  const pressure = s('iopRight').length || s('iopLeft').length
    ? rl('iopRight', 'iopLeft')
    : one('iop', 'IOP');
  const charts: PdfChart[] = [
    {
      title: 'Vision improvement',
      subtitle: 'Distance VA (6/6 = 1 best ... PL = 11 worst; - = blind)',
      series: rl('visionRight', 'visionLeft'),
      scale: DISTANCE_SCALE,
    },
    {
      title: 'Pinhole (PH) improvement',
      subtitle: 'Distance VA with pinhole - R ph vs L ph',
      series: rl('phRight', 'phLeft', 'PH '),
      scale: DISTANCE_SCALE,
    },
    {
      title: 'Contrast improvement',
      subtitle: 'Contrast sensitivity 1-10',
      series: rl('contrastRight', 'contrastLeft'),
    },
    {
      title: 'Color vision (R vs L)',
      subtitle: 'Color vision score (1-30)',
      series: rl('colorVisionRight', 'colorVisionLeft'),
    },
    {
      title: 'Near vision',
      subtitle: 'Near vision (1 = best ... 12 = worst; - = blind)',
      series: rl('nearRight', 'nearLeft'),
      scale: NEAR_SCALE,
    },
    { title: 'Eye pressure', subtitle: 'IOP mmHg', series: pressure },
    {
      title: 'Improvement scores (R vs L)',
      subtitle: 'From Progress tab scores (0-10)',
      series: rl('improvementRight', 'improvementLeft'),
    },
    { title: 'CMT', subtitle: 'Central macular thickness (um)', series: one('cmt', 'CMT') },
    { title: 'CSGS score', subtitle: 'From disease assessments', series: one('csgs', 'CSGS') },
    { title: 'HbA1c', subtitle: 'HbA1c (%)', series: one('hba1c', 'HbA1c') },
    { title: 'SRF height', subtitle: 'SRF height (um)', series: one('srf', 'SRF') },
  ];
  return charts.filter((c) => c.series.some((x) => x.points.length > 0));
}

function addCharts(pdf: PdfBuilder, data: PatientCharts) {
  const charts = buildCharts(data);
  pdf.heading('Charts');
  if (charts.length === 0) {
    pdf.note('No chart data recorded yet.');
    return;
  }
  const gap = 5;
  const w = (pdf.pageWidth - MARGIN * 2 - gap) / 2;
  const h = 64;
  for (let i = 0; i < charts.length; i += 2) {
    pdf.ensure(h + gap);
    drawChart(pdf.doc, charts[i], MARGIN, pdf.y + 1, w, h);
    if (charts[i + 1]) drawChart(pdf.doc, charts[i + 1], MARGIN + w + gap, pdf.y + 1, w, h);
    pdf.y += h + gap;
  }
}

/** Build and download a PDF with the full patient profile. */
export async function downloadPatientProfilePdf(patient: Patient) {
  const id = patient.id;
  const [visits, assessments, progress, attachments, attendance, charts] = await Promise.all([
    fetchAllVisits(id),
    fetchAll<DiseaseAssessment>(async (p, s) => {
      const r = await api.listDiseaseAssessments(id, undefined, p, s);
      return { ...r, items: r.assessments };
    }),
    fetchAll<ProgressLog>(async (p, s) => {
      const r = await api.listProgress(id, p, s);
      return { ...r, items: r.logs };
    }),
    fetchAll<Attachment>(async (p, s) => {
      const r = await api.listAttachments(id, p, s);
      return { ...r, items: r.attachments };
    }),
    fetchAll<{ date: string }>(async (p, s) => {
      const r = await api.getAttendance(id, undefined, p, s);
      return { ...r, items: r.dates };
    }),
    api.getPatientCharts(id),
  ]);

  const byDate = <T,>(key: (x: T) => string) => (a: T, b: T) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  assessments.sort(byDate((a) => a.assessmentDate));
  progress.sort(byDate((l) => l.logDate));
  attendance.sort(byDate((d) => d.date));

  const pdf = new PdfBuilder(`${patient.name} (OPD ${patient.opdAdNo || '-'})`);
  const { doc } = pdf;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Nethraloka Ayurvedic Eye Clinic', MARGIN, pdf.y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text('Patient profile', MARGIN, pdf.y + 7);
  doc.setTextColor(0);
  pdf.y += 10;

  pdf.heading('Patient details');
  pdf.details([
    ['Name', patient.name],
    ['OPD AD NO', patient.opdAdNo],
    ['Age', patient.age],
    ['Gender', patient.gender],
    ['Registration date', patient.registrationDate],
    ['Occupation', patient.occupation],
    ['ID number', patient.idNumber],
    ['WhatsApp / Telephone', patient.phone],
    ['Address', patient.address],
    ['Conditions monitored', (patient.conditions || []).map(diseaseFormTitle)],
    ['Medicines sent', (patient.medicinesSent || []).join(', ')],
  ]);

  pdf.heading(`Clinic attendance (${attendance.length})`);
  if (attendance.length) pdf.details([['Dates attended', attendance.map((d) => d.date).join(', ')]]);
  else pdf.note('No attendance recorded.');

  addCharts(pdf, charts);

  pdf.heading(`Eye screening visits (${visits.length})`);
  if (visits.length === 0) pdf.note('No screening visits recorded.');
  visits.forEach((v, i) => addVisit(pdf, v, i));

  pdf.heading(`Disease assessments (${assessments.length})`);
  if (assessments.length === 0) pdf.note('No disease assessments recorded.');
  for (const a of assessments) addAssessment(pdf, a);

  pdf.heading(`Progress notes (${progress.length})`);
  if (progress.length === 0) pdf.note('No progress notes recorded.');
  pdf.table(
    ['Date', 'Right eye', 'R score', 'Left eye', 'L score'],
    progress.map((l) => [
      l.logDate,
      l.rightEye || '',
      l.rightScore != null ? String(l.rightScore) : '',
      l.leftEye || '',
      l.leftScore != null ? String(l.leftScore) : '',
    ]),
    { columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 16 }, 4: { cellWidth: 16 } } }
  );

  pdf.heading(`Images and files (${attachments.length})`);
  if (attachments.length === 0) pdf.note('No images or files uploaded.');
  const maxW = pdf.pageWidth - MARGIN * 2;
  for (const file of attachments) {
    const label = `${file.originalName} - ${String(file.createdAt || '').slice(0, 10)}`;
    const isImage = (file.mimeType || '').startsWith('image/');
    // Uploads need the login token, sent as ?access_token= like the Images tab does.
    const img = isImage ? await loadImage(withAuth(file.url)) : null;
    if (!img) {
      pdf.note(label);
      continue;
    }
    let w = maxW;
    let h = (img.h / img.w) * w;
    if (h > 110) {
      h = 110;
      w = (img.w / img.h) * h;
    }
    pdf.ensure(h + 10);
    pdf.note(label);
    doc.addImage(img.data, 'JPEG', MARGIN, pdf.y, w, h);
    pdf.y += h + 4;
  }

  // File is named by patient name + OPD number (e.g. "Kamala Silva - OPD-1024.pdf").
  const fileName = [patient.name, patient.opdAdNo]
    .map((part) => String(part || '').trim().replace(/[\\/:*?"<>|]+/g, '_'))
    .filter(Boolean)
    .join(' - ');
  pdf.finish(`${fileName || 'patient'}.pdf`);
}
