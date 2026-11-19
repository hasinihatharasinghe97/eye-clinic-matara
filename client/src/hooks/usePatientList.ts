import { useCallback, useEffect, useState } from 'react';
import { api, localClinicDate, type Patient } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { PAGE_SIZE_OPTIONS } from '@/components/Pagination';
import { useToast } from '@/components/Toast';

export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const SEARCH_DEBOUNCE_MS = 200;

/** Searchable, paged patient list with today's "visited" ticks. */
export function usePatientList() {
  const toast = useToast();
  const [query, setQueryState] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<PageSize>(PAGE_SIZE_OPTIONS[0]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [visitedToday, setVisitedToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const today = localClinicDate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const list = await api.listPatients(query, today, page, pageSize);
        if (cancelled) return;
        // The page we were on no longer exists (e.g. after a search): go back to page 1.
        if (list.total > 0 && list.patients.length === 0 && page > 1) {
          setPage(1);
          return;
        }
        setPatients(list.patients);
        setTotal(list.total);
        setVisitedToday(list.visitedToday);
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Failed to load patients'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, today, page, pageSize, toast]);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setPage(1);
  }, []);

  const setPageSize = useCallback((n: number) => {
    setPageSizeState(n as PageSize);
    setPage(1);
  }, []);

  const toggleVisited = useCallback(
    async (patientId: string, visited: boolean) => {
      setTogglingId(patientId);
      try {
        await api.setAttendance(patientId, visited, today);
        setPatients((prev) =>
          prev.map((p) => (p.id === patientId ? { ...p, visitedToday: visited } : p))
        );
        setVisitedToday((c) => Math.max(0, c + (visited ? 1 : -1)));
      } catch (err) {
        toast.error(errorMessage(err, 'Could not update visit mark'));
      } finally {
        setTogglingId(null);
      }
    },
    [today, toast]
  );

  return {
    query,
    setQuery,
    page,
    setPage,
    pageSize,
    setPageSize,
    patients,
    total,
    visitedToday,
    loading,
    togglingId,
    toggleVisited,
  };
}
