import { useEffect, useMemo, useState } from 'react';
import { api, type ClinicStats } from '@/lib/api';
import { diseaseFormTitle } from '@/diseaseForms/catalog';
import {
  ChartCard,
  MonthLineChart,
  SimpleBarChart,
  SimplePieChart,
  StatKpis,
} from '@/components/charts/ChartWidgets';
import { Button, EmptyState, LoadingBlock } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { DateInput } from '@/components/DateInput';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';

const MAX_DIAGNOSIS_BARS = 12;

function labelCondition(id: string) {
  return diseaseFormTitle(id);
}

function periodLabel(fromDate: string, toDate: string) {
  if (fromDate && toDate) {
    if (fromDate === toDate) return formatDate(fromDate);
    return `${formatDate(fromDate)} - ${formatDate(toDate)}`;
  }
  if (fromDate) return `From ${formatDate(fromDate)}`;
  if (toDate) return `Until ${formatDate(toDate)}`;
  return 'All time';
}

export function StatsPage() {
  const toast = useToast();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [stats, setStats] = useState<ClinicStats | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(true);

  const hasPeriod = Boolean(fromDate || toDate);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    api
      .getStats(fromDate || undefined, toDate || undefined)
      .then((s) => {
        if (cancelled) return;
        setStats(s);
        setLoadFailed(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadFailed(true);
        toast.error(errorMessage(err, 'Failed to load stats'));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, toast]);

  const trend = useMemo(() => {
    if (!stats) return [];
    const months = new Set<string>();
    for (const r of stats.registrationsByMonth) months.add(r.month);
    for (const r of stats.attendanceByMonth) months.add(r.month);
    for (const r of stats.assessmentsByMonth) months.add(r.month);
    const sorted = [...months].sort();
    const reg = Object.fromEntries(stats.registrationsByMonth.map((x) => [x.month, x.value]));
    const att = Object.fromEntries(stats.attendanceByMonth.map((x) => [x.month, x.value]));
    const ass = Object.fromEntries(stats.assessmentsByMonth.map((x) => [x.month, x.value]));
    return sorted.map((month) => ({
      month,
      patients: reg[month] || 0,
      attendance: att[month] || 0,
      assessments: ass[month] || 0,
    }));
  }, [stats]);

  // Most common diagnoses as bars; the long tail is grouped so the chart stays readable.
  const diagnosisBars = useMemo(() => {
    const all = stats?.diagnoses || [];
    if (all.length <= MAX_DIAGNOSIS_BARS) return all;
    const rest = all.slice(MAX_DIAGNOSIS_BARS - 1);
    return [
      ...all.slice(0, MAX_DIAGNOSIS_BARS - 1),
      { name: `Other diagnoses (${rest.length})`, value: rest.reduce((n, d) => n + d.value, 0) },
    ];
  }, [stats]);

  return (
    <>
      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0 }}>Clinic statistics</h2>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            {hasPeriod
              ? `Showing ${periodLabel(fromDate, toDate)}. Clear the dates to load all data.`
              : 'All-time patient load, disease mix, and activity. Optionally choose a date range.'}
          </p>
        </div>
        <div className="page-toolbar-actions">
          <label className="daily-date-field">
            <span className="muted">From</span>
            <DateInput
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="Stats from date"
            />
          </label>
          <label className="daily-date-field">
            <span className="muted">To</span>
            <DateInput
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="Stats to date"
            />
          </label>
          <Button
            variant="secondary"

            disabled={!hasPeriod}
            onClick={() => {
              setFromDate('');
              setToDate('');
            }}
          >
            All time
          </Button>
        </div>
      </div>

      {busy ? (
        <LoadingBlock label="Loading clinic stats…" />
      ) : loadFailed ? (
        <EmptyState
          title="Could not load clinic statistics"
          hint="Check your connection and refresh the page."
        />
      ) : !stats ? null : (
        <>
          <StatKpis
            items={[
              { label: 'Patients', value: stats.totals.patients },
              {
                label: 'Attendance days',
                value: stats.totals.attendanceDays,
                hint: hasPeriod ? undefined : `${stats.totals.attendanceThisMonth} this month`,
              },
              {
                label: 'Disease assessments',
                value: stats.totals.assessments,
                hint: hasPeriod ? undefined : `${stats.totals.assessmentsThisMonth} this month`,
              },
              { label: 'Progress notes', value: stats.totals.progressLogs },
            ]}
          />

          <div className="stats-grid">
            <ChartCard title="Gender mix" empty={stats.gender.length === 0}>
              <div className="chart-frame">
                <SimplePieChart data={stats.gender} />
              </div>
            </ChartCard>

            <ChartCard
              title="Age groups"
              subtitle="Years: 0-15, 16-30, 31-45, 46-60, 61-75, 76 and above"
              empty={stats.ageBands.every((b) => b.value === 0)}
            >
              <div className="chart-frame">
                <SimpleBarChart data={stats.ageBands} />
              </div>
            </ChartCard>

            <ChartCard
              title="Patients by diagnosis"
              subtitle={`From the Diagnosis on screening forms${
                hasPeriod ? ' in this period' : ''
              } · ${stats.patientsWithDiagnosis} patient${
                stats.patientsWithDiagnosis === 1 ? '' : 's'
              } with a diagnosis (a patient can have more than one)`}
              empty={stats.diagnoses.length === 0}
              emptyText="Enter a Diagnosis on screening forms to see this chart."
            >
              <div className="chart-frame">
                <SimpleBarChart data={diagnosisBars} color="#3b6ea5" />
              </div>
            </ChartCard>

            <ChartCard
              title="Disease assessments by type"
              empty={stats.assessmentsByType.length === 0}
              emptyText="No disease assessments saved yet."
            >
              <div className="chart-frame">
                <SimpleBarChart
                  data={stats.assessmentsByType.map((c) => ({
                    name: labelCondition(c.name),
                    value: c.value,
                  }))}
                  color="#c47b2b"
                />
              </div>
            </ChartCard>

            <ChartCard
              title="Activity over time"
              subtitle={
                hasPeriod
                  ? `New patients, attendance ticks, and assessments by month (${periodLabel(fromDate, toDate)})`
                  : 'New patients, attendance ticks, and assessments by month (all time)'
              }
              empty={trend.length === 0}
            >
              <div className="chart-frame">
                <MonthLineChart series={trend} />
              </div>
            </ChartCard>
          </div>
        </>
      )}
    </>
  );
}
