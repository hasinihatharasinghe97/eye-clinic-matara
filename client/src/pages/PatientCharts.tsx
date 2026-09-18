import { useEffect, useMemo, useState } from 'react';
import { api, type ChartPoint, type PatientCharts } from '../api';
import {
  ActivityBarChart,
  ChartCard,
  MetricLineChart,
  MonthLineChart,
  StatKpis,
} from '../charts/ChartWidgets';

type Props = {
  patientId: string;
};

const UNIT: Record<string, string> = {
  cmt: 'µm',
  iop: 'mmHg',
  iopRight: 'mmHg',
  iopLeft: 'mmHg',
  hba1c: '%',
  srf: 'µm',
  csgs: '',
  improvementRight: '/10',
  improvementLeft: '/10',
  contrastRight: '/10',
  contrastLeft: '/10',
  colorVision: '',
};

function pairSeries(
  right: ChartPoint[] | undefined,
  left: ChartPoint[] | undefined,
  rightLabel = 'Right (R)',
  leftLabel = 'Left (L)'
) {
  const r = right || [];
  const l = left || [];
  const dates = [...new Set([...r.map((p) => p.date), ...l.map((p) => p.date)])].sort();
  const rMap = Object.fromEntries(r.map((p) => [p.date, p.value]));
  const lMap = Object.fromEntries(l.map((p) => [p.date, p.value]));
  return dates.map((date) => ({
    month: date,
    [rightLabel]: rMap[date] ?? undefined,
    [leftLabel]: lMap[date] ?? undefined,
  }));
}

export function PatientChartsPanel({ patientId }: Props) {
  const [data, setData] = useState<PatientCharts | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [metric, setMetric] = useState('cmt');

  useEffect(() => {
    setBusy(true);
    api
      .getPatientCharts(patientId)
      .then((d) => {
        setData(d);
        setError('');
        const preferred = [
          'cmt',
          'iop',
          'iopRight',
          'iopLeft',
          'csgs',
          'hba1c',
          'srf',
          'contrastRight',
          'contrastLeft',
          'colorVision',
          'improvementRight',
          'improvementLeft',
        ];
        const first = preferred.find((k) => (d.series[k] || []).length > 0);
        if (first) setMetric(first);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load charts'))
      .finally(() => setBusy(false));
  }, [patientId]);

  const metricOptions = useMemo(() => {
    if (!data) return [];
    return data.metrics
      .map((m) => ({
        ...m,
        count: (data.series[m.key] || []).length,
      }))
      .filter((m) => m.count > 0);
  }, [data]);

  const chartPoints = useMemo(() => {
    if (!data) return [];
    return (data.series[metric] || []).map((p) => ({
      date: p.date,
      value: p.value,
      label: p.eye || p.source,
    }));
  }, [data, metric]);

  const pressureCompare = useMemo(
    () => pairSeries(data?.series.iopRight, data?.series.iopLeft),
    [data]
  );
  const scoreCompare = useMemo(
    () => pairSeries(data?.series.improvementRight, data?.series.improvementLeft),
    [data]
  );
  const contrastCompare = useMemo(
    () => pairSeries(data?.series.contrastRight, data?.series.contrastLeft),
    [data]
  );
  const colorPoints = useMemo(() => {
    if (!data) return [];
    return (data.series.colorVision || []).map((p) => ({
      date: p.date,
      value: p.value,
      label: p.source,
    }));
  }, [data]);

  if (busy) return <p className="muted">Loading improvement charts…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  return (
    <>
      <StatKpis
        items={[
          { label: 'Assessments', value: data.counts.assessments },
          { label: 'Progress entries', value: data.counts.progress },
          { label: 'Attendance days', value: data.counts.attendance },
        ]}
      />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>How to chart improvement</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          Save a <strong>New assessment</strong> on each review visit (CMT, IOP, CSGS, HbA1c, SRF,
          and follow-up contrast/color). Progress-tab scores (0–10) also appear below. Day attendance
          uses the Visited today tick.
        </p>
      </div>

      <div className="stats-grid">
        <ChartCard
          title="Eye pressure"
          subtitle="IOP mmHg from disease assessments — Right vs Left when recorded"
          empty={pressureCompare.length === 0 && (data.series.iop || []).length === 0}
          emptyText="Enter IOP on a disease assessment to see this chart."
        >
          <div className="chart-frame">
            {pressureCompare.length > 0 ? (
              <MonthLineChart series={pressureCompare} />
            ) : (
              <MetricLineChart
                data={(data.series.iop || []).map((p) => ({
                  date: p.date,
                  value: p.value,
                  label: p.eye || p.source,
                }))}
                unit="mmHg"
              />
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Improvement scores (R vs L)"
          subtitle="From Progress tab scores"
          empty={scoreCompare.length === 0}
          emptyText="Add 0–10 scores on Progress entries to see R/L trends."
        >
          <div className="chart-frame">
            <MonthLineChart series={scoreCompare} />
          </div>
        </ChartCard>

        <ChartCard
          title="Contrast (follow-up)"
          subtitle="From assessment follow-up rows when recorded"
          empty={contrastCompare.length === 0}
          emptyText="Add contrast values on assessment follow-ups to see this chart."
        >
          <div className="chart-frame">
            <MonthLineChart series={contrastCompare} />
          </div>
        </ChartCard>

        <ChartCard
          title="Color vision (follow-up)"
          subtitle="Numeric color vision from assessment follow-ups"
          empty={colorPoints.length === 0}
          emptyText="Add color vision numbers on assessment follow-ups to see this chart."
        >
          <div className="chart-frame">
            <MetricLineChart data={colorPoints} />
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Clinical metrics from assessments"
        subtitle="CMT, IOP, CSGS, HbA1c, SRF, and other numeric fields from New assessment"
        empty={chartPoints.length < 1}
        emptyText="No numeric trend data yet — save disease assessments with measurable values."
      >
        {metricOptions.length > 0 && (
          <div className="row" style={{ marginBottom: '0.75rem' }}>
            <label className="muted" htmlFor="metric-select">
              Metric
            </label>
            <select
              id="metric-select"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {metricOptions.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} ({m.count})
                </option>
              ))}
            </select>
          </div>
        )}
        {chartPoints.length > 0 && (
          <div className="chart-frame">
            <MetricLineChart data={chartPoints} unit={UNIT[metric]} />
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="Clinic activity for this patient"
        subtitle="Attendance ticks, disease assessments, and progress notes by month"
        empty={data.activity.length === 0}
      >
        <div className="chart-frame">
          <ActivityBarChart data={data.activity} />
        </div>
      </ChartCard>
    </>
  );
}
