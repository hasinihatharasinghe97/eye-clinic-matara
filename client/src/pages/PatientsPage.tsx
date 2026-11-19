import type { Patient } from '@/lib/api';
import { usePatientList } from '@/hooks/usePatientList';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  LoadingBlock,
  PageHeader,
  type Column,
} from '@/components/ui';
import { ClinicStatusBanners } from '@/components/ClinicStatusBanners';
import { Pagination } from '@/components/Pagination';
import { VisitTodayTick } from '@/components/VisitTodayTick';

type Props = { onNavigate: (path: string) => void };

const patientPath = (p: Patient) => `/patients/${p.id}/visits`;

/** Home screen: search patients, tick today's visits, open a patient. */
export function PatientsPage({ onNavigate }: Props) {
  const list = usePatientList();
  const { query, setQuery, patients, total, visitedToday, loading, togglingId, toggleVisited } =
    list;

  const visitedTick = (p: Patient) => (
    <VisitTodayTick
      checked={Boolean(p.visitedToday)}
      disabled={togglingId === p.id}
      label="Visited"
      onChange={(next) => toggleVisited(p.id, next)}
    />
  );

  const columns: ReadonlyArray<Column<Patient>> = [
    { key: 'today', header: 'Today', render: visitedTick, stopRowClick: true },
    {
      key: 'name',
      header: 'Name',
      render: (p) => (
        <a
          href={`#${patientPath(p)}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onNavigate(patientPath(p));
          }}
        >
          {p.name}
        </a>
      ),
    },
    { key: 'opd', header: 'OPD', render: (p) => p.opdAdNo || '-' },
    {
      key: 'ageGender',
      header: 'Age / Gender',
      render: (p) => `${p.age ?? '-'} / ${p.gender || '-'}`,
    },
    { key: 'phone', header: 'Phone', render: (p) => p.phone || '-' },
    {
      key: 'open',
      header: <span className="visually-hidden">Actions</span>,
      stopRowClick: true,
      render: (p) => (
        <Button
          variant="secondary"
          onClick={() => onNavigate(patientPath(p))}
          aria-label={`Open ${p.name}`}
        >
          Open
        </Button>
      ),
    },
  ];

  const subtitle = loading
    ? 'Loading…'
    : query
      ? `${total} match${total === 1 ? '' : 'es'}`
      : `${total} patient${total === 1 ? '' : 's'}${visitedToday ? ` · ${visitedToday} visited today` : ''}`;

  return (
    <>
      <ClinicStatusBanners onNavigate={onNavigate} />

      <PageHeader
        title="Patients"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => onNavigate('/stats')}>
              Clinic stats
            </Button>
            <Button onClick={() => onNavigate('/patients/new')}>New patient</Button>
          </>
        }
      />

      <div className="search" role="search">
        <input
          type="search"
          placeholder="Search name, OPD no, phone, or ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          aria-label="Search patients"
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >
            Clear
          </button>
        )}
      </div>

      <Card>
        {loading ? (
          <LoadingBlock label="Loading patients…" />
        ) : patients.length === 0 ? (
          <EmptyState
            title={query ? 'No patients match your search' : 'No patients yet'}
            hint={
              query
                ? 'Try another name, OPD number, phone, or ID.'
                : 'Register the first patient to start recording disease assessments.'
            }
            actionLabel={query ? 'Clear search' : 'New patient'}
            onAction={() => (query ? setQuery('') : onNavigate('/patients/new'))}
          />
        ) : (
          <>
            <DataTable
              className="desktop-only"
              caption="Patients"
              columns={columns}
              rows={patients}
              rowKey={(p) => p.id}
              onRowClick={(p) => onNavigate(patientPath(p))}
            />
            <ul className="mobile-list mobile-only">
              {patients.map((p) => (
                <li key={p.id}>
                  <div className="mobile-list-card">
                    {visitedTick(p)}
                    <button
                      type="button"
                      className="mobile-list-item"
                      onClick={() => onNavigate(patientPath(p))}
                    >
                      <span className="mobile-list-title">{p.name}</span>
                      <span className="mobile-list-meta">
                        OPD {p.opdAdNo || '-'} · {p.age ?? '-'} / {p.gender || '-'}
                      </span>
                      <span className="mobile-list-meta">{p.phone || 'No phone'}</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination
              total={total}
              page={list.page}
              pageSize={list.pageSize}
              disabled={loading}
              onPageChange={list.setPage}
              onPageSizeChange={list.setPageSize}
            />
          </>
        )}
      </Card>
    </>
  );
}
