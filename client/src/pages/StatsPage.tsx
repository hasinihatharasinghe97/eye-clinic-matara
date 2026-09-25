import { useEffect, useMemo, useState } from 'react';
import { api, type ClinicStats } from '../api';
import { diseaseFormTitle } from '../diseaseForms/catalog';
import {
  ChartCard,
  MonthLineChart,
  SimpleBarChart,
  SimplePieChart,
  StatKpis,
} from '../charts/ChartWidgets';
import { EmptyState, LoadingBlock } from '../components/PageNav';
import { useToast } from '../components/Toast';
import { DateInput } from '../components/DateInput';

function labelCondition(id: string) {
  return diseaseFormTitle(id);
}

function formatDay(isoDay: string) {
  const [y, m, d] = isoDay.split('-').map(Number);
  if (!y || !m || !d) return isoDay;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function periodLabel(fromDate: string, toDate: string) {
  if (fromDate && toDate) {
    if (fromDate === toDate) return formatDay(fromDate);
    return `${formatDay(fromDate)} – ${formatDay(toDate)}`;
  }
  if (fromDate) return `From ${formatDay(fromDate)}`;
  if (toDate) return `Until ${formatDay(toDate)}`;
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
        toast.error(err instanceof Error ? err.message : 'Failed to load stats');
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
          <button
            className="btn secondary"
            type="button"
            disabled={!hasPeriod}
            onClick={() => {
              setFromDate('');
              setToDate('');
            }}
          >
            All time
          </button>
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

            <ChartCard title="Age groups" empty={stats.ageBands.length === 0}>
              <div className="chart-frame">
                <SimpleBarChart data={stats.ageBands} />
              </div>
            </ChartCard>

            <ChartCard
              title="Patients by disease form"
              subtitle="Based on conditions selected on patient records"
              empty={stats.conditions.length === 0}
              emptyText="Mark diseases on patient details to see this chart."
            >
              <div className="chart-frame">
                <SimpleBarChart
                  data={stats.conditions.map((c) => ({
                    name: labelCondition(c.name),
                    value: c.value,
                  }))}
                  color="#3b6ea5"
                />
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
