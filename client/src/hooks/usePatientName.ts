import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** The patient's name for breadcrumbs and titles, or null while loading / unknown. */
export function usePatientName(patientId: string | null, enabled = true): string | null {
  const [loaded, setLoaded] = useState<{ id: string; name: string | null } | null>(null);

  useEffect(() => {
    if (!patientId || !enabled) return;
    let cancelled = false;
    api
      .getPatient(patientId)
      .then((p) => !cancelled && setLoaded({ id: patientId, name: p.name }))
      .catch(() => !cancelled && setLoaded({ id: patientId, name: null }));
    return () => {
      cancelled = true;
    };
  }, [patientId, enabled]);

  // Never show the previous patient's name while the next one loads.
  return patientId && enabled && loaded?.id === patientId ? loaded.name : null;
}
