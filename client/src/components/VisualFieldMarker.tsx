import type { VisualFieldEye, VisualFieldData } from '../api';

const EMPTY_EYE: VisualFieldEye = { tl: false, tr: false, bl: false, br: false };

export const emptyVisualField = (): VisualFieldData => ({
  r: { ...EMPTY_EYE },
  l: { ...EMPTY_EYE },
  notes: '',
});

type Quadrant = keyof VisualFieldEye;

type Props = {
  value: VisualFieldData;
  onChange: (next: VisualFieldData) => void;
};

function EyeCircle({
  label,
  eye,
  onToggle,
  onClear,
}: {
  label: 'R' | 'L';
  eye: VisualFieldEye;
  onToggle: (q: Quadrant) => void;
  onClear: () => void;
}) {
  const quadrants: Array<{ key: Quadrant; x: number; y: number; title: string }> = [
    { key: 'tl', x: 0, y: 0, title: 'Upper-left quadrant' },
    { key: 'tr', x: 70, y: 0, title: 'Upper-right quadrant' },
    { key: 'bl', x: 0, y: 70, title: 'Lower-left quadrant' },
    { key: 'br', x: 70, y: 70, title: 'Lower-right quadrant' },
  ];

  return (
    <div className="vf-eye">
      <div className="vf-eye-label">{label}</div>
      <svg viewBox="0 0 140 140" className="vf-svg" role="img" aria-label={`${label} eye visual field`}>
        <defs>
          <pattern
            id={`hatch-${label}`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#1c2a22" strokeWidth="2" />
          </pattern>
          <clipPath id={`clip-${label}`}>
            <circle cx="70" cy="70" r="68" />
          </clipPath>
        </defs>

        <g clipPath={`url(#clip-${label})`}>
          {quadrants.map((q) => (
            <rect
              key={q.key}
              x={q.x}
              y={q.y}
              width="70"
              height="70"
              fill={eye[q.key] ? `url(#hatch-${label})` : '#fffdf8'}
              className="vf-quad"
              onClick={() => onToggle(q.key)}
            >
              <title>{q.title} — click to toggle defect</title>
            </rect>
          ))}
        </g>

        <circle cx="70" cy="70" r="68" fill="none" stroke="#1c2a22" strokeWidth="2.5" />
        <line x1="70" y1="2" x2="70" y2="138" stroke="#1c2a22" strokeWidth="2" />
        <line x1="2" y1="70" x2="138" y2="70" stroke="#1c2a22" strokeWidth="2" />
        <text
          x="70"
          y="78"
          textAnchor="middle"
          fontSize="28"
          fontWeight="700"
          fill="#1c2a22"
          pointerEvents="none"
        >
          {label}
        </text>
      </svg>
      <button type="button" className="btn secondary vf-clear" onClick={onClear}>
        Clear {label}
      </button>
    </div>
  );
}

export function VisualFieldMarker({ value, onChange }: Props) {
  const data = value || emptyVisualField();

  function toggle(side: 'r' | 'l', q: Quadrant) {
    onChange({
      ...data,
      [side]: {
        ...data[side],
        [q]: !data[side][q],
      },
    });
  }

  function clear(side: 'r' | 'l') {
    onChange({
      ...data,
      [side]: { tl: false, tr: false, bl: false, br: false },
    });
  }

  return (
    <div className="vf-marker">
      <p className="muted" style={{ marginTop: 0 }}>
        Tap a quadrant to mark visual field loss (hatched = defect), same as the paper chart.
      </p>
      <div className="vf-eyes">
        <EyeCircle
          label="R"
          eye={data.r || EMPTY_EYE}
          onToggle={(q) => toggle('r', q)}
          onClear={() => clear('r')}
        />
        <div className="vf-divider" aria-hidden />
        <EyeCircle
          label="L"
          eye={data.l || EMPTY_EYE}
          onToggle={(q) => toggle('l', q)}
          onClear={() => clear('l')}
        />
      </div>
      <div className="field" style={{ marginTop: '0.75rem' }}>
        <label>Visual field notes (optional)</label>
        <input
          value={data.notes || ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
          placeholder="Extra notes…"
        />
      </div>
    </div>
  );
}
