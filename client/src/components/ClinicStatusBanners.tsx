import { useEffect, useState, type MouseEvent } from 'react';
import { api, type SystemSettings } from '@/lib/api';
import { Notice } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

const BACKUP_STALE_DAYS = 2;

type Props = { onNavigate: (path: string) => void };

/**
 * Reminders at the top of the patient list: overdue backup, and (on the clinic laptop)
 * work that hasn't reached the online app yet.
 */
export function ClinicStatusBanners({ onNavigate }: Props) {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [unsyncedTables, setUnsyncedTables] = useState<string[]>([]);
  const [autoSync, setAutoSync] = useState<{ enabled: boolean; blocked: string | null } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((s) => !cancelled && setSettings(s))
      .catch(() => {
        /* reminders only */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settings?.cloudSync) return;
    let cancelled = false;
    api
      .getCloudSync()
      .then((s) => {
        if (cancelled || !s.configured) return;
        setUnsyncedTables(s.pending?.changedTables || []);
        setAutoSync({ enabled: s.auto.enabled, blocked: s.auto.blocked });
      })
      .catch(() => {
        /* reminders only */
      });
    return () => {
      cancelled = true;
    };
  }, [settings?.cloudSync]);

  const backupStale =
    settings !== null &&
    (!settings.lastBackupAt ||
      (Date.now() - new Date(settings.lastBackupAt).getTime()) / 86_400_000 > BACKUP_STALE_DAYS);

  const toBackup = (e: MouseEvent) => {
    e.preventDefault();
    onNavigate('/backup');
  };
  const backupLink = (text: string) => (
    <a href="#/backup" onClick={toBackup}>
      {text}
    </a>
  );

  return (
    <>
      {autoSync?.blocked ? (
        <Notice tone="warning">
          Automatic sync with the online app is paused to protect your records.{' '}
          {backupLink('Open Backup & Settings')} to see why.
        </Notice>
      ) : unsyncedTables.length > 0 && autoSync?.enabled ? (
        <Notice>
          Some work on this laptop is not in the online app yet. It will be sent automatically when
          the laptop has a stable internet connection.
        </Notice>
      ) : unsyncedTables.length > 0 ? (
        <Notice tone="warning">
          Today’s work on this laptop is not in the online app yet. When you have internet,{' '}
          {backupLink('sync to cloud')}.
        </Notice>
      ) : null}
      {backupStale && (
        <Notice tone="warning">
          {settings?.lastBackupAt
            ? `Last backup was on ${formatDateTime(settings.lastBackupAt)}. `
            : 'No backup has been made yet. '}
          Please {backupLink('run or download a backup')}
          {settings?.cloudMode
            ? ' (auto-backup runs daily in the cloud).'
            : ' and keep the ZIP on Google Drive, OneDrive, or a USB drive.'}
        </Notice>
      )}
    </>
  );
}
