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
  attachment_files: 'image files',
};

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'never';
}

function resultSummary(r: CloudSyncResult) {
  const parts = Object.entries(r.tables || {})
    .filter(([, s]) => s.written || s.deleted)
    .map(([t, s]) => {
      const bits = [];
      if (s.written) bits.push(`${s.written} added/updated`);
      if (s.deleted) bits.push(`${s.deleted} removed`);
      return `${TABLE_LABELS[t] || t}: ${bits.join(', ')}`;
    });
  if (r.files?.uploaded) parts.push(`${r.files.uploaded} photo(s) uploaded`);
  return parts.length ? parts.join(' · ') : 'No changes needed — the cloud already matched.';
}

/**
 * Shown on the clinic laptop (offline setup): sends the day's work to the cloud
 * database so the online app shows the same records.
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

  // Poll while a sync runs, then report how it went.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const s = await load();
        if (s.configured && !s.running && s.lastResult) {
          if (s.lastResult.ok) toast.success('Sync finished. The online app now has today’s work.');
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
        title: 'Overwrite the cloud copy?',
        message:
          'The cloud database will be made identical to this laptop. Anything that was added or changed online since the last sync will be lost. Continue only if this laptop has the correct records.',
        confirmLabel: 'Overwrite cloud',
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
  const changed = pending?.changedTables || [];

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Sync to cloud (online app)</h3>
      <p className="muted">
        This laptop keeps working without internet. When the day is done, connect to the internet
        (Wi-Fi or a phone hotspot) and press <strong>Sync to cloud now</strong>. The online app is
        then updated to match this laptop exactly.
      </p>

      <p style={{ margin: '0.25rem 0' }}>
        Last sync to cloud: <strong>{when(status.lastPushAt)}</strong>
      </p>
      {pending?.error ? (
        <p className="muted">Could not check for unsynced changes: {pending.error}</p>
      ) : pending?.neverSynced ? (
        <p className="error">
          This laptop has not been synced yet. Set it up with the first-time copy (see the setup
          guide) before syncing.
        </p>
      ) : changed.length ? (
        <p className="warn-text">
          Not yet in the cloud: changes to {changed.map((t) => TABLE_LABELS[t] || t).join(', ')}.
        </p>
      ) : (
        <p className="muted">Everything on this laptop is already in the cloud.</p>
      )}

      {running ? (
        <p>
          <strong>Syncing…</strong> {status.progress} <span className="muted">(keep the internet on)</span>
        </p>
      ) : last && !last.ok ? (
        <p className="error">
          Last attempt ({when(last.finishedAt)}) did not finish: {last.error}
          {!last.conflict && ' Nothing in the cloud was changed.'}
        </p>
      ) : last?.ok && last.direction === 'push' ? (
        <p className="muted">Last sync: {resultSummary(last)}</p>
      ) : null}

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button
          className="btn"
          type="button"
          disabled={Boolean(running) || starting}
          onClick={() => void start(false)}
        >
          {running ? 'Syncing…' : 'Sync to cloud now'}
        </button>
        {last && !last.ok && last.conflict && !running && (
          <button
            className="btn danger"
            type="button"
            disabled={starting}
            onClick={() => void start(true)}
          >
            Overwrite cloud with this laptop
          </button>
        )}
      </div>
    </div>
  );
}
