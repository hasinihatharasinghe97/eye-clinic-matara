import { useCallback, useEffect, useState } from 'react';
import { api, type CloudSyncResult, type CloudSyncStatus } from '../api';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';

const TABLE_LABELS: Record<string, string> = {
  patients: 'patients',
  custom_disease_forms: 'custom disease forms',
  visits: 'screening forms',
  progress_logs: 'progress notes',
  disease_assessments: 'disease assessments',
  clinic_attendance: 'attendance ticks',
  attachments: 'images / files',
};

const AUTO_OUTCOME: Record<string, string> = {
  'up-to-date': 'already in sync',
  offline: 'no internet',
  unstable: 'connection not stable yet, will retry',
  synced: 'synced',
  blocked: 'paused — needs your decision',
  failed: 'did not finish, will retry',
  busy: 'another sync was running',
  'needs-setup': 'waiting for first-time setup',
};

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'never';
}

function resultSummary(r: CloudSyncResult) {
  const t = Object.values(r.tables || {});
  const sum = (k: 'toCloud' | 'toLaptop' | 'deletedCloud' | 'deletedLaptop') =>
    t.reduce((n, s) => n + (s[k] || 0), 0);
  const up = sum('toCloud') + sum('deletedCloud');
  const down = sum('toLaptop') + sum('deletedLaptop');
  const parts = [];
  if (up) parts.push(`${up} change(s) sent to the cloud`);
  if (down) parts.push(`${down} change(s) received from the online app`);
  if (r.files?.uploaded) parts.push(`${r.files.uploaded} photo(s) uploaded`);
  if (r.files?.downloaded) parts.push(`${r.files.downloaded} photo(s) downloaded`);
  return parts.length ? parts.join(' · ') : 'Nothing to change — both were already the same.';
}

/**
 * Shown on the clinic laptop (offline setup): keeps the laptop and the online app in
 * step, both ways, automatically whenever the laptop has a stable connection.
 */
export function CloudSyncCard() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [status, setStatus] = useState<CloudSyncStatus | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const s = await api.getCloudSync();
    setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    load().catch((err) => toast.error(err instanceof Error ? err.message : 'Could not load sync status'));
  }, [load, toast]);

  const running = status?.configured && status.running;

  // Refresh now and then, so an automatic sync in the background shows up here.
  useEffect(() => {
    if (running) return;
    const timer = setInterval(() => {
      load().catch(() => {});
    }, 30_000);
    return () => clearInterval(timer);
  }, [running, load]);

  // Poll while a sync runs, then report how it went.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const s = await load();
        if (s.configured && !s.running && s.lastResult) {
          if (s.lastResult.ok) toast.success('Sync finished. The laptop and the online app match.');
          else toast.error(`Sync did not finish: ${s.lastResult.error}`);
        }
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [running, load, toast]);

  async function start(force: boolean) {
    if (force) {
      const ok = await confirm({
        title: 'Sync anyway?',
        message:
          'The sync stopped because it would delete many records on one side. Continue only if those records really were deleted on purpose.',
        confirmLabel: 'Sync anyway',
        danger: true,
      });
      if (!ok) return;
    }
    setStarting(true);
    try {
      await api.startCloudSync(force);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the sync');
    } finally {
      setStarting(false);
    }
  }

  if (!status?.configured) return null;

  const pending = status.pending;
  const last = status.lastResult;
  const auto = status.auto;
  const changed = pending?.changedTables || [];
  // A record-number clash can't be fixed by forcing; only a mass delete can be confirmed.
  const canForce =
    !running && (auto.blocked || (last && !last.ok && last.safety)) &&
    !/same number/.test(auto.blocked || last?.error || '');

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Sync with the online app</h3>
      <p className="muted">
        This laptop keeps working without internet.{' '}
        {auto.enabled ? (
          <>
            Whenever it has a <strong>stable internet connection</strong>, it syncs with the online
            app <strong>automatically, both ways</strong>: work done here goes up, and changes made
            in the online app come down to this laptop. If the same record was changed in both
            places, the newer edit is kept.
          </>
        ) : (
          <>
            Connect to the internet and press <strong>Sync now</strong> to sync both ways with the
            online app.
          </>
        )}
      </p>

      <p style={{ margin: '0.25rem 0' }}>
        Last sync: <strong>{when(status.lastSyncAt)}</strong>
        {last?.ok && last.trigger === 'auto' && <span className="muted"> (automatic)</span>}
      </p>
      {auto.enabled && (
        <p className="muted" style={{ margin: '0.25rem 0' }}>
          Automatic sync: checks every {auto.minutes} min
          {auto.lastCheckAt &&
            ` · last check ${when(auto.lastCheckAt)}: ${AUTO_OUTCOME[auto.outcome || ''] || auto.outcome}`}
        </p>
      )}
      {auto.blocked && !running && (
        <p className="error">Automatic sync is paused: {auto.blocked}</p>
      )}
      {pending?.error ? (
        <p className="muted">Could not check for unsynced changes: {pending.error}</p>
      ) : pending?.neverSynced ? (
        <p className="error">
          This laptop has not been set up for syncing yet. Run the first-time copy from the cloud
          (see the setup guide).
        </p>
      ) : changed.length ? (
        <p className="warn-text">
          Not yet in the online app: changes to {changed.map((t) => TABLE_LABELS[t] || t).join(', ')}.
        </p>
      ) : (
        <p className="muted">Everything done on this laptop is already in the online app.</p>
      )}

      {running ? (
        <p>
          <strong>Syncing…</strong> {status.progress} <span className="muted">(keep the internet on)</span>
        </p>
      ) : last && !last.ok ? (
        <p className="error">
          Last attempt ({when(last.finishedAt)}) did not finish: {last.error}
          {!last.safety && ' Nothing was half-changed; it will be retried.'}
        </p>
      ) : last?.ok ? (
        <>
          <p className="muted" style={{ margin: '0.25rem 0' }}>Last sync: {resultSummary(last)}</p>
          {last.conflicts && last.conflicts.length > 0 && (
            <details className="muted" style={{ fontSize: '0.85rem' }}>
              <summary>
                {last.conflicts.length} record(s) were changed both here and online — see which
                version was kept
              </summary>
              <ul>
                {last.conflicts.map((c) => (
                  <li key={`${c.table}-${c.key}`}>
                    {TABLE_LABELS[c.table] || c.table} #{c.key.replace('\u001f', ' ')}: {c.reason} — kept the{' '}
                    {c.kept === 'laptop' ? 'laptop' : 'online'} version
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : null}

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button
          className="btn"
          type="button"
          disabled={Boolean(running) || starting}
          onClick={() => void start(false)}
        >
          {running ? 'Syncing…' : 'Sync now'}
        </button>
        {canForce && (
          <button
            className="btn danger"
            type="button"
            disabled={starting}
            onClick={() => void start(true)}
          >
            Sync anyway
          </button>
        )}
      </div>
    </div>
  );
}
