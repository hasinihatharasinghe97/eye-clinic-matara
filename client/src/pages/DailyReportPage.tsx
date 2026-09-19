import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  api,
  localClinicDate,
  type DailyAttendancePatient,
} from '../api';
import { EmptyState, LoadingBlock } from '../components/PageNav';

type SortKey = 'visitDate' | 'name' | 'age' | 'opdAdNo' | 'address';
type SortDir = 'asc' | 'desc';

function compareRows(
  a: DailyAttendancePatient,
  b: DailyAttendancePatient,
  key: SortKey,
  dir: SortDir
) {
  const av = a[key];
  const bv = b[key];
  let cmp = 0;
  if (key === 'age') {
    const an = av == null || av === '' ? Number.NEGATIVE_INFINITY : Number(av);
    const bn = bv == null || bv === '' ? Number.NEGATIVE_INFINITY : Number(bv);
    cmp = an - bn;
  } else {
    cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' });
  }
  return dir === 'asc' ? cmp : -cmp;
}

function formatDisplayDate(isoDay: string) {
  const [y, m, d] = isoDay.split('-').map(Number);
  if (!y || !m || !d) return isoDay;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function rangeLabel(fromDate: string, toDate: string) {
  if (fromDate === toDate) return formatDisplayDate(fromDate);
  // ASCII only — jsPDF default fonts cannot render →
  return `${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}`;
}

function downloadDailyPdf(fromDate: string, toDate: string, rows: DailyAttendancePatient[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const title = 'Nethraloka Ayurvedic Eye Clinic';
  const subtitle = `Attendance - ${rangeLabel(fromDate, toDate)}`;
  const multiDay = fromDate !== toDate;

  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text(subtitle, 14, 23);
  doc.setFontSize(9);
  doc.text(`Rows: ${rows.length}`, 14, 29);
  doc.setTextColor(0);

  const head = multiDay
    ? [['#', 'Visit date', 'Patient name', 'Age', 'OPD No', 'Address']]
    : [['#', 'Patient name', 'Age', 'OPD No', 'Address']];

  const body = rows.map((r, i) => {
    const base = [
      String(i + 1),
      r.name || '-',
      r.age != null ? String(r.age) : '-',
      r.opdAdNo || '-',
      r.address || '-',
    ];
    if (multiDay) {
      return [base[0], r.visitDate || '-', base[1], base[2], base[3], base[4]];
    }
    return base;
  });

  autoTable(doc, {
    startY: 34,
    head,
    body,
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: [15, 76, 92], textColor: 255 },
    columnStyles: multiDay
      ? {
          0: { cellWidth: 10 },
          1: { cellWidth: 24 },
          2: { cellWidth: 38 },
          3: { cellWidth: 12 },
          4: { cellWidth: 24 },
          5: { cellWidth: 'auto' },
        }
      : {
          0: { cellWidth: 10 },
          1: { cellWidth: 45 },
          2: { cellWidth: 14 },
          3: { cellWidth: 28 },
          4: { cellWidth: 'auto' },
        },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Generated ${localClinicDate()} - page ${data.pageNumber}`,
        14,
        doc.internal.pageSize.getHeight() - 8
      );
    },
  });

  const file =
    fromDate === toDate
      ? `daily-attendance-${fromDate}.pdf`
      : `attendance-${fromDate}_to_${toDate}.pdf`;
  doc.save(file);
}

export function DailyReportPage() {
  const today = localClinicDate();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [rows, setRows] = useState<DailyAttendancePatient[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('visitDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const rangeFrom = fromDate <= toDate ? fromDate : toDate;
  const rangeTo = fromDate <= toDate ? toDate : fromDate;
  const multiDay = rangeFrom !== rangeTo;

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    api
      .getDailyAttendance(rangeFrom, rangeTo)
      .then((report) => {
        if (cancelled) return;
        setRows(report.patients);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setError(err instanceof Error ? err.message : 'Failed to load attendance');
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeFrom, rangeTo]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir)),
    [rows, sortKey, sortDir]
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function handleDownloadPdf() {
    setPdfBusy(true);
    try {
      downloadDailyPdf(rangeFrom, rangeTo, sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create PDF');
    } finally {
      setPdfBusy(false);
    }
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0 }}>Daily attendance</h2>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            Choose a date or range, then download a PDF for the doctor.
          </p>
        </div>
        <div className="page-toolbar-actions">
          <label className="daily-date-field">
            <span className="muted">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value || localClinicDate())}
            />
          </label>
          <label className="daily-date-field">
            <span className="muted">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value || localClinicDate())}
            />
          </label>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              const t = localClinicDate();
              setFromDate(t);
              setToDate(t);
            }}
          >
            Today
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy || pdfBusy || sorted.length === 0}
            onClick={handleDownloadPdf}
          >
            {pdfBusy ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      )}

      {busy ? (
        <LoadingBlock label="Loading attendance…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No visits in this range"
          hint={`Nobody was marked Visited for ${rangeLabel(rangeFrom, rangeTo)}. Tick patients on the Patients list first.`}
        />
      ) : (
        <div className="card daily-report-card">
          <div className="daily-report-meta">
            <strong>{rangeLabel(rangeFrom, rangeTo)}</strong>
            <span className="muted">Count: {sorted.length}</span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {multiDay && (
                    <th style={{ width: '8.5rem' }}>
                      <button
                        type="button"
                        className="th-sort"
                        onClick={() => toggleSort('visitDate')}
                      >
                        Visit date{sortMark('visitDate')}
                      </button>
                    </th>
                  )}
                  <th>
                    <button type="button" className="th-sort" onClick={() => toggleSort('name')}>
                      Patient name{sortMark('name')}
                    </button>
                  </th>
                  <th style={{ width: '5.5rem' }}>
                    <button type="button" className="th-sort" onClick={() => toggleSort('age')}>
                      Age{sortMark('age')}
                    </button>
                  </th>
                  <th style={{ width: '8rem' }}>
                    <button type="button" className="th-sort" onClick={() => toggleSort('opdAdNo')}>
                      OPD No{sortMark('opdAdNo')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="th-sort" onClick={() => toggleSort('address')}>
                      Address{sortMark('address')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={`${r.id}-${r.visitDate}`}>
                    {multiDay && <td>{r.visitDate}</td>}
                    <td>{r.name}</td>
                    <td>{r.age != null ? r.age : '—'}</td>
                    <td>{r.opdAdNo || '—'}</td>
                    <td>{r.address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
