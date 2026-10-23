import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { DISTANCE_SCALE, visionLabel, type VisionScale } from './visionScale';

const COLORS = ['#0f6b4c', '#2a8f6a', '#c47b2b', '#3b6ea5', '#9b2c2c', '#6b5b95', '#5a6b60'];
/** Line series: the first two (Right / Left) are blue and orange so they differ at a glance. */
const LINE_COLORS = ['#1f5fbf', '#d9480f', '#0f6b4c', '#9b2c2c', '#6b5b95', '#5a6b60'];

type ChartCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  empty?: boolean;
  emptyText?: string;
};

export function ChartCard({
  title,
  subtitle,
  children,
  empty,
  emptyText = 'Not enough data yet.',
}: ChartCardProps) {
  return (
    <div className="card chart-card">
      <h3 style={{ margin: 0 }}>{title}</h3>
      {subtitle && (
        <p className="muted" style={{ margin: '0.35rem 0 0.75rem' }}>
          {subtitle}
        </p>
      )}
      {empty ? <p className="empty">{emptyText}</p> : children}
    </div>
  );
}

export function StatKpis({
  items,
}: {
  items: Array<{ label: string; value: number | string; hint?: string }>;
}) {
  return (
    <div className="stat-kpi-grid">
      {items.map((item) => (
        <div className="stat-kpi" key={item.label}>
          <div className="stat-kpi-value">{item.value}</div>
          <div className="stat-kpi-label">{item.label}</div>
          {item.hint && <div className="muted" style={{ fontSize: '0.8rem' }}>{item.hint}</div>}
        </div>
      ))}
    </div>
  );
}

type Point = { name: string; value: number };

export function SimpleBarChart({ data, color = COLORS[0] }: { data: Point[]; color?: string }) {
  const slanted = data.length > 6;
  // Slanted labels need room below the axis for the longest name (capped).
  const longest = Math.max(0, ...data.map((d) => String(d.name).length));
  const axisHeight = slanted ? Math.min(110, Math.max(60, 14 + longest * 3.2)) : 30;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2ddd2" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={slanted ? -25 : 0} textAnchor={slanted ? 'end' : 'middle'} height={axisHeight} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
        <Tooltip />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimplePieChart({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function MonthLineChart({
  series,
}: {
  series: Array<{ month: string; [key: string]: string | number | undefined | null }>;
}) {
  if (!series.length) return null;
  const keys = Object.keys(series[0] || {}).filter((k) => k !== 'month');
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2ddd2" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals tick={{ fontSize: 11 }} width={36} />
        <Tooltip />
        <Legend />
        {keys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Line chart on a vision scale: best vision at the top, blind at the bottom. */
export function VisionLineChart({
  series,
  scale = DISTANCE_SCALE,
}: {
  series: Array<{ month: string; [key: string]: string | number | undefined | null }>;
  scale?: VisionScale;
}) {
  if (!series.length) return null;
  const keys = Object.keys(series[0] || {}).filter((k) => k !== 'month');
  const visionTick = (v: number) => visionLabel(scale, v);
  const ticks = Array.from({ length: scale.max }, (_, i) => i + 1);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2ddd2" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis
          reversed
          domain={[1, scale.max]}
          ticks={ticks}
          interval={0}
          tickFormatter={visionTick}
          tick={{ fontSize: 10 }}
          width={58}
        />
        <Tooltip formatter={(value, name) => [visionTick(Number(value)), name]} />
        <Legend />
        {keys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MetricLineChart({
  data,
  unit,
}: {
  data: Array<{ date: string; value: number; label?: string }>;
  unit?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2ddd2" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={42} unit={unit ? '' : undefined} />
        <Tooltip formatter={(value) => [String(value) + (unit ? ` ${unit}` : ''), 'Value']} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={COLORS[0]}
          fill="#e4f2ec"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ActivityBarChart({
  data,
}: {
  data: Array<{
    month: string;
    attendance: number;
    visits: number;
    assessments: number;
    progress: number;
  }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2ddd2" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
        <Tooltip />
        <Legend />
        <Bar dataKey="attendance" name="Attendance" stackId="a" fill={COLORS[0]} />
        <Bar dataKey="visits" name="Screening visits" stackId="a" fill={COLORS[1]} />
        <Bar dataKey="assessments" name="Assessments" stackId="a" fill={COLORS[2]} />
        <Bar dataKey="progress" name="Progress" stackId="a" fill={COLORS[3]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
