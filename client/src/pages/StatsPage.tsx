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
import { LoadingBlock } from '../components/PageNav';

function labelCondition(id: string) {
  return diseaseFormTitle(id);
}

export function StatsPage() {
  const [stats, setStats] = useState<ClinicStats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setBusy(true);
    api
      .getStats()
      .then((s) => {
        setStats(s);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stats'))
      .finally(() => setBusy(false));
  }, []);

  const trend = useMemo(() => {
    if (!stats) return [];
    const months = new Set<string>();
    for (const r of stats.registrationsByMonth) months.add(r.month);
    for (const r of stats.visitsByMonth) months.add(r.month);
    for (const r of stats.assessmentsByMonth) months.add(r.month);
    const sorted = [...months].sort();
    const reg = Object.fromEntries(stats.registrationsByMonth.map((x) => [x.month, x.value]));
    const vis = Object.fromEntries(stats.visitsByMonth.map((x) => [x.month, x.value]));
    const ass = Object.fromEntries(stats.assessmentsByMonth.map((x) => [x.month, x.value]));
    return sorted.map((month) => ({
      month,
      patients: reg[month] || 0,
      visits: vis[month] || 0,
      assessments: ass[month] || 0,
    }));
  }, [stats]);

  if (busy) return <LoadingBlock label="Loading clinic stats…" />;
  if (error) {
    return (
      <div className="card">
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!stats) return null;

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Clinic statistics</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Overall patient load, disease mix, and activity for Nethraloka Ayurvedic Eye Clinic.
        </p>
      </div>

      <StatKpis
        items={[
          { label: 'Patients', value: stats.totals.patients },
          { label: 'Visits', value: stats.totals.visits, hint: `${stats.totals.visitsThisMonth} this month` },
          {
            label: 'Disease assessments',
            value: stats.totals.assessments,
            hint: `${stats.totals.assessmentsThisMonth} this month`,
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
          subtitle="New patients, visits, and assessments by month"
          empty={trend.length === 0}
        >
          <div className="chart-frame">
            <MonthLineChart series={trend} />
          </div>
        </ChartCard>

        <ChartCard
          title="Top visit diagnoses"
          empty={stats.diagnoses.length === 0}
          emptyText="Add diagnosis text on screening visits to populate this list."
        >
          <div className="chart-frame">
            <SimpleBarChart
              data={stats.diagnoses.map((d) => ({
                name: d.name.length > 18 ? `${d.name.slice(0, 18)}…` : d.name,
                value: d.value,
              }))}
              color="#9b2c2c"
            />
          </div>
        </ChartCard>
      </div>
    </>
  );
}
