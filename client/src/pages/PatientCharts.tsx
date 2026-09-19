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
  visionRight: '',
  visionLeft: '',
  contrastRight: '/10',
  contrastLeft: '/10',
  colorVision: '',
  nearRight: '',
  nearLeft: '',
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
  const [metric, setMetric] = useState('visionRight');

  useEffect(() => {
    setBusy(true);
    api
      .getPatientCharts(patientId)
      .then((d) => {
        setData(d);
        setError('');
        const preferred = [
          'visionRight',
          'visionLeft',
          'contrastRight',
          'iopRight',
          'nearRight',
          'colorVision',
          'improvementRight',
          'cmt',
          'iop',
          'csgs',
          'hba1c',
          'srf',
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

  const visionCompare = useMemo(
    () => pairSeries(data?.series.visionRight, data?.series.visionLeft),
    [data]
  );
  const contrastCompare = useMemo(
    () => pairSeries(data?.series.contrastRight, data?.series.contrastLeft),
    [data]
  );
  const nearCompare = useMemo(
    () => pairSeries(data?.series.nearRight, data?.series.nearLeft),
    [data]
  );
  const pressureCompare = useMemo(
    () => pairSeries(data?.series.iopRight, data?.series.iopLeft),
    [data]
  );
  const scoreCompare = useMemo(
    () => pairSeries(data?.series.improvementRight, data?.series.improvementLeft),
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
          { label: 'Screening visits', value: data.counts.visits },
          { label: 'Assessments', value: data.counts.assessments },
          { label: 'Progress entries', value: data.counts.progress },
          { label: 'Attendance days', value: data.counts.attendance },
        ]}
      />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>How to chart improvement</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          Record distance vision, near vision, contrast (1–10), color vision, and IOP (R/L) on each{' '}
          <strong>screening visit</strong> (Visits tab). Progress-tab scores (0–10) and disease
          assessment numbers (CMT, CSGS, HbA1c, SRF) also appear below.
        </p>
      </div>

      <div className="stats-grid">
        <ChartCard
          title="Vision improvement"
          subtitle="Distance VA scored 1–10 from screening visits (higher is better: 6/6 = 10)"
          empty={visionCompare.length === 0}
          emptyText="Add distance vision (R/L) on Visits screening forms to see this chart."
        >
          <div className="chart-frame">
            <MonthLineChart series={visionCompare} />
          </div>
        </ChartCard>

        <ChartCard
          title="Contrast improvement"
          subtitle="Contrast sensitivity 1–10 from screening visits / assessment follow-ups"
          empty={contrastCompare.length === 0}
          emptyText="Add contrast R/L on Visits or assessment follow-ups to see this chart."
        >
          <div className="chart-frame">
            <MonthLineChart series={contrastCompare} />
          </div>
        </ChartCard>

        <ChartCard
          title="Color vision"
          subtitle="Color vision score from screening visits / follow-ups"
          empty={colorPoints.length === 0}
          emptyText="Set color vision on Visits or assessment follow-ups to see this chart."
        >
          <div className="chart-frame">
            <MetricLineChart data={colorPoints} />
          </div>
        </ChartCard>

        <ChartCard
          title="Near vision"
          subtitle="Near acuity from screening visits (higher score = better)"
          empty={nearCompare.length === 0}
          emptyText="Add near vision (R/L) on Visits screening forms to see this chart."
        >
          <div className="chart-frame">
            <MonthLineChart series={nearCompare} />
          </div>
        </ChartCard>

        <ChartCard
          title="Eye pressure"
          subtitle="IOP mmHg — from Visits and/or disease assessments"
          empty={pressureCompare.length === 0 && (data.series.iop || []).length === 0}
          emptyText="Enter IOP on a Visit or assessment to see this chart."
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
      </div>

      <ChartCard
        title="Other clinical metrics"
        subtitle="CMT, assessment IOP, CSGS, HbA1c, SRF, and visit-derived series"
        empty={chartPoints.length < 1}
        emptyText="No numeric trend data yet for this patient."
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
        subtitle="Attendance, screening visits, assessments, and progress by month"
        empty={data.activity.length === 0}
      >
        <div className="chart-frame">
          <ActivityBarChart data={data.activity} />
        </div>
      </ChartCard>
    </>
  );
}
