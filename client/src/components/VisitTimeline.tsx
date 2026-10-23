import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Visit } from '../api';
import { fetchAllVisits, VISIT_SECTIONS } from '../visitSummary';
import { EmptyState, LoadingBlock } from './PageNav';

type Props = {
  patientId: string;
  onEditVisit?: (visitId: string) => void;
};

const ALL = 'all';

/**
 * Every eye screening form for one patient as a register: one row per visit
 * (oldest at the top, newest at the bottom), one column per field of the chosen
 * section. Suited to long histories (e.g. 100 visits). Values that differ from
 * the visit in the row above are highlighted.
 */
export function VisitTimeline({ patientId, onEditVisit }: Props) {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [error, setError] = useState('');
  const [sectionKey, setSectionKey] = useState<string>(VISIT_SECTIONS[2].title);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setVisits(null);
    setError('');
    fetchAllVisits(patientId)
      .then((all) => {
        if (!cancelled) setVisits(all);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load visits');
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  // Oldest → newest (fetchAllVisits already sorts by date).
  const rows = useMemo(() => visits || [], [visits]);

  const sections = useMemo(
    () =>
      sectionKey === ALL ? VISIT_SECTIONS : VISIT_SECTIONS.filter((s) => s.title === sectionKey),
    [sectionKey]
  );
  const fields = useMemo(() => sections.flatMap((s) => s.rows), [sections]);
  const values = useMemo(() => rows.map((v) => fields.map((f) => f.get(v))), [rows, fields]);

  // Start scrolled to the bottom so the newest visits are in view.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [values]);

  if (error) return <EmptyState title="Could not load screening forms" hint={error} />;
  if (!visits) return <LoadingBlock label="Loading screening forms…" />;
  if (rows.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        No screening forms recorded for this patient yet.
      </p>
    );
  }

  const multi = sections.length > 1;

  return (
    <>
      <div className="visit-history-toolbar">
        <label className="muted" style={{ fontSize: '0.82rem' }}>
          Section{' '}
          <select value={sectionKey} onChange={(e) => setSectionKey(e.target.value)}>
            {VISIT_SECTIONS.map((s) => (
              <option key={s.title} value={s.title}>
                {s.title}
              </option>
            ))}
            <option value={ALL}>All sections</option>
          </select>
        </label>
        <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
          All {rows.length} screening form{rows.length === 1 ? '' : 's'}, oldest at the top,
          newest at the bottom. <span className="visit-history-changed-key">Highlighted</span> =
          changed since the visit above.
        </p>
      </div>
      <div ref={scrollRef} className="visit-history visit-timeline">
        <table className="table visit-history-table">
          <thead>
            {multi && (
              <tr className="visit-timeline-groups">
                <th className="visit-history-label" rowSpan={2}>
                  Visit date
                </th>
                {sections.map((s) => (
                  <th key={s.title} colSpan={s.rows.length}>
                    {s.title}
                  </th>
                ))}
              </tr>
            )}
            <tr className={multi ? 'visit-timeline-fields' : undefined}>
              {!multi && <th className="visit-history-label">Visit date</th>}
              {fields.map((f, i) => (
                <th key={`${i}-${f.label}`}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((visit, r) => (
              <tr key={visit.id}>
                <th className="visit-history-label" scope="row">
                  {visit.visitDate}
                  {onEditVisit && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onEditVisit(visit.id)}
                    >
                      Edit
                    </button>
                  )}
                </th>
                {values[r].map((value, c) => {
                  const changed = r > 0 && value !== values[r - 1][c];
                  return (
                    <td key={c} className={changed ? 'changed' : undefined}>
                      {value || <span className="muted">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
