import { useEffect, useState } from 'react';
import { api, type SystemSettings, type BackupInfo } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { CloudSyncCard } from '@/components/CloudSyncCard';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatSize } from '@/lib/format';
import { Button, DataTable, type Column } from '@/components/ui';

const BACKUP_COLUMNS: ReadonlyArray<Column<BackupInfo>> = [
  { key: 'name', header: 'Name', render: (b) => b.zipName },
  { key: 'created', header: 'Created', render: (b) => formatDateTime(b.createdAt, '-') },
  { key: 'size', header: 'Size', render: (b) => formatSize(b.size) },
  {
    key: 'download',
    header: <span className="visually-hidden">Download</span>,
    render: (b) => (
      // A real link (not a button) so the browser downloads the file.
      <a className="btn secondary" href={api.backupDownloadUrl(b.id)}>
        Download
      </a>
    ),
  },
];

export function BackupPage({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [backupFolder, setBackupFolder] = useState('');
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [s, list] = await Promise.all([api.getSettings(), api.listBackups()]);
    setSettings(s);
    setBackupFolder(s.backupFolder);
    setBackups(list);
  }

  useEffect(() => {
    refresh().catch((err) => toast.error(errorMessage(err, 'Failed to load backup settings')));
  }, [toast]);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await api.updateSettings({ backupFolder });
      setSettings(s);
      setBackupFolder(s.backupFolder);
      toast.success('Settings saved.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save settings'));
    } finally {
      setBusy(false);
    }
  }

  async function runBackup() {
    setBusy(true);
    try {
      if (isAdmin && !settings?.cloudMode && backupFolder !== settings?.backupFolder) {
        await api.updateSettings({ backupFolder });
      }
      const result = await api.backup();
      await refresh();
      toast.success(
        settings?.cloudMode
          ? `Backup created: ${result.zipName} (${formatSize(result.size)}). It is stored in Oracle HeatWave. Download a copy below, or use Upload to Google Drive.`
          : `Backup created: ${result.zipName} (${formatSize(result.size)}). Download it below and copy to Google Drive / USB.`
      );
    } catch (err) {
      toast.error(errorMessage(err, 'Backup failed'));
    } finally {
      setBusy(false);
    }
  }

  async function runDriveUpload() {
    setBusy(true);
    try {
      const result = await api.uploadBackupToDrive();
      await refresh();
      toast.success(
        `Uploaded ${result.zipName} to Google Drive only (not stored again in HeatWave). Previous daily Drive backup was removed.`
      );
    } catch (err) {
      toast.error(errorMessage(err, 'Google Drive upload failed'));
    } finally {
      setBusy(false);
    }
  }

  const keep = settings?.backupKeepCount ?? (settings?.cloudMode ? 7 : 14);
  const cloud = Boolean(settings?.cloudMode);
  const drive = settings?.googleDrive;

  return (
    <>
      {settings?.cloudSync && <CloudSyncCard />}
      <div className="card">
        <h2>Backup &amp; Settings</h2>
        {cloud ? (
          <>
            <p className="muted" style={{ marginBottom: '0.75rem' }}>
              This clinic runs on <strong>Render</strong> (app) +{' '}
              <strong>Oracle HeatWave MySQL</strong> (database). Live patient records and
              photos/PDFs live in HeatWave. The important <strong>daily offsite ZIP</strong> goes to{' '}
              <strong>Google Drive</strong> (not kept again in HeatWave). Render’s free disk is
              temporary and is not used for clinic data.
            </p>
            <ul className="muted" style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }}>
              <li>
                <strong>Google Drive (recommended):</strong> every night at 1:00&nbsp;am
                Asia/Colombo uploads <code>Nethraloka-Daily-….zip</code> to Drive only, then deletes
                yesterday’s Drive file.
              </li>
              <li>
                <strong>Backup now</strong> is optional - it stores a ZIP in HeatWave (
                <code>backup_archives</code>) so you can download it from this page or keep a USB
                copy. Last {keep} HeatWave ZIPs are kept.
              </li>
              <li>
                If Drive is not set up yet, the server may also auto-create a HeatWave ZIP when the
                last one is older than ~20 hours (after Render wakes).
              </li>
            </ul>
          </>
        ) : (
          <p className="muted">
            Patient data is in MySQL. Uploads and ZIP backups stay on this PC (last {keep} kept).
            Back up regularly and copy ZIPs to Google Drive, OneDrive, or USB so records survive PC
            failure. Optional: enable Google Drive auto-upload (same env vars as cloud) for a
            nightly offsite copy.
          </p>
        )}
        {settings?.backupEncryption &&
          (settings.backupEncryption.enabled ? (
            <p className="muted">
              🔒 <strong>Backups are encrypted</strong> (AES-256). Files end in{' '}
              <code>.zip.enc</code> and can only be opened with the backup password - keep a copy of
              it somewhere safe, away from this computer. To open one:{' '}
              <code>node scripts/decrypt-backup.mjs &lt;file&gt;</code>
              {settings.backupEncryption.weak && (
                <span className="error">
                  {' '}
                  - the backup password is short; use at least {
                    settings.backupEncryption.minLength
                  }{' '}
                  characters.
                </span>
              )}
            </p>
          ) : (
            <p className="error">
              ⚠ Backups are <strong>not encrypted</strong>. Anyone with a copy of a backup ZIP can
              read every patient record. Set <code>BACKUP_PASSWORD</code> (at least{' '}
              {settings.backupEncryption.minLength} characters) in the server’s <code>.env</code>
              {cloud ? ' and in Render’s environment variables' : ''}, then restart the app.
            </p>
          ))}
        <p className="muted">
          Last HeatWave/local backup: {formatDateTime(settings?.lastBackupAt)}
          {settings?.backupOverdue ? (
            <span className="error"> - overdue: click Backup now, then Download latest</span>
          ) : null}
        </p>
        <div className="row">
          <Button onClick={runBackup} disabled={busy}>
            {busy ? 'Working…' : 'Backup now'}
          </Button>
          {backups[0] && (
            <a className="btn secondary" href={api.backupDownloadUrl(backups[0].id)}>
              Download latest
            </a>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Google Drive daily offsite copy</h3>
        {drive?.configured ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Enabled. Every day at <strong>1:00 am Asia/Colombo</strong> the server builds a ZIP
              and uploads <code>Nethraloka-Daily-YYYY-MM-DD.zip</code> to your Drive folder only -
              it is <strong>not</strong> kept again inside HeatWave. When today’s upload succeeds,
              yesterday’s Drive file is deleted (only the latest daily file stays on Drive).
            </p>
            <ul className="muted" style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }}>
              <li>
                Last Drive upload:{' '}
                {drive.lastDriveBackupAt
                  ? `${formatDateTime(drive.lastDriveBackupAt)} (${drive.lastDriveFileName || 'ZIP'})`
                  : 'Never'}
              </li>
              {drive.lastDriveError ? (
                <li>
                  <span className="error">Last error: {drive.lastDriveError}</span>
                </li>
              ) : null}
              <li>
                Free Render may sleep at 1:00 am - if so, the upload runs on the next wake after
                1:00 am, or via an external cron hitting{' '}
                <code>POST /api/system/cron/drive-backup</code> with <code>X-Cron-Secret</code>.
              </li>
            </ul>
            <Button variant="secondary" onClick={runDriveUpload} disabled={busy}>
              {busy ? 'Working…' : 'Upload to Google Drive now'}
            </Button>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Not configured yet. Without Drive, a HeatWave crash means you only have ZIPs you
              already downloaded manually.
            </p>
            <ol className="muted" style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
              <li>
                In Google Cloud Console create a project → enable <strong>Google Drive API</strong>{' '}
                → create a <strong>Service account</strong> → download its JSON key.
              </li>
              <li>
                In Google Drive, create a folder (e.g. <code>Nethraloka-Backups</code>), share it
                with the service account email (<code>…@….iam.gserviceaccount.com</code>) as{' '}
                <strong>Editor</strong>, and copy the folder ID from the URL.
              </li>
              <li>
                On Render (Environment), set:
                <pre
                  className="code-block"
                  style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', marginTop: '0.5rem' }}
                >
                  {`GOOGLE_DRIVE_FOLDER_ID=your_folder_id
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
BACKUP_CRON_SECRET=long-random-secret`}
                </pre>
                (Or set <code>GOOGLE_SERVICE_ACCOUNT_JSON_BASE64</code> if the JSON is awkward in
                the env UI.)
              </li>
              <li>
                Optional but recommended on free Render: schedule{' '}
                <a href="https://cron-job.org" target="_blank" rel="noreferrer">
                  cron-job.org
                </a>{' '}
                daily at 1:00 am Asia/Colombo to{' '}
                <code>POST https://YOUR-APP.onrender.com/api/system/cron/drive-backup</code> with
                header <code>X-Cron-Secret: your-secret</code> so the service wakes and uploads.
              </li>
            </ol>
            <p className="muted">
              Full steps: <code>docs/HOSTING.md</code> → Google Drive backups.
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h3>Manual offsite copy</h3>
        {cloud ? (
          <ol className="muted" style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
            <li>
              Primary offsite copy is <strong>Google Drive daily upload</strong> (above). That is
              what you restore from if HeatWave is lost.
            </li>
            <li>
              Optional: <strong>Backup now</strong> → <strong>Download latest</strong> for a USB /
              extra copy (those ZIPs live in HeatWave until you download them).
            </li>
          </ol>
        ) : (
          <ol className="muted" style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
            <li>
              Click <strong>Backup now</strong>, then <strong>Download latest</strong>.
            </li>
            <li>Save the ZIP into Google Drive / OneDrive / a USB stick (weekly at minimum).</li>
            <li>
              Keep at least two copies in different places (example: Drive + USB at the hospital).
            </li>
          </ol>
        )}
      </div>

      <div className="card">
        <h3>How to restore</h3>
        {cloud ? (
          <>
            <p className="muted">
              Each ZIP contains <code>snapshot.json</code>, <code>uploads/</code>, and{' '}
              <code>README-RESTORE.txt</code>. To restore into a{' '}
              <strong>new Oracle HeatWave</strong> instance (empty <code>eye_clinic</code> database
              recommended):
            </p>
            <pre className="code-block" style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
              {`# 1) Create a new HeatWave DB + NLB (same as first deploy)
# 2) CREATE DATABASE eye_clinic;  (via DBeaver / MySQL client)
# 3) Point MYSQL_* at the new NLB, then:
$env:MYSQL_HOST="new-nlb-public-ip"
$env:MYSQL_USER="..."
$env:MYSQL_PASSWORD="..."
$env:MYSQL_DATABASE="eye_clinic"
$env:STORE_FILES_IN_DB="1"
node scripts/restore-from-backup.mjs .\\Nethraloka-Daily-YYYY-MM-DD.zip
# (or any EyeClinic-Backup-....zip downloaded from Drive / Backup page)

# 4) Update Render MYSQL_* to the new NLB and redeploy / restart`}
            </pre>
            <p className="muted">
              That reloads patients, assessments, attendance, progress, custom forms, and uploaded
              images into the new HeatWave. Full steps: <code>docs/HOSTING.md</code>.
            </p>
          </>
        ) : (
          <>
            <p className="muted">
              Each ZIP contains <code>snapshot.json</code>, <code>uploads/</code>, and{' '}
              <code>README-RESTORE.txt</code>. On a PC with Node + this project:
            </p>
            <pre className="code-block" style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
              {`# Point MYSQL_* at the destination MySQL
node scripts/restore-from-backup.mjs .\\EyeClinic-Backup-....zip`}
            </pre>
            <p className="muted">
              For cloud/HeatWave restores, set <code>STORE_FILES_IN_DB=1</code> and see{' '}
              <code>docs/HOSTING.md</code>.
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h3>{cloud ? 'Optional ZIP backups in HeatWave' : 'Saved backups'}</h3>
        {cloud && (
          <p className="muted" style={{ marginTop: 0 }}>
            These are only from <strong>Backup now</strong> / stale auto-backup - useful for a quick
            download. Daily Drive uploads are <strong>not</strong> listed here (they are only on
            Google Drive).
          </p>
        )}
        {backups.length === 0 ? (
          <p className="empty">
            {cloud
              ? 'No HeatWave ZIPs yet. That is fine if Google Drive daily upload is working - or click Backup now for an optional in-app ZIP.'
              : 'No backups yet. Click Backup now to create the first ZIP.'}
          </p>
        ) : (
          <DataTable
            caption="Saved backups"
            columns={BACKUP_COLUMNS}
            rows={backups}
            rowKey={(b) => b.id}
          />
        )}
      </div>

      {!cloud && isAdmin && (
        <form className="card" onSubmit={saveSettings}>
          {
            <>
              <h3>Backup destination folder</h3>
              <p className="muted">
                Leave the project default (<code>data/backups</code>) so it follows this folder on
                any PC. Or set a path inside Google Drive / OneDrive on <em>this</em> computer so
                backups sync automatically.
              </p>
              <div className="field">
                <label>Full folder path on this PC</label>
                <input
                  value={backupFolder}
                  onChange={(e) => setBackupFolder(e.target.value)}
                  required
                />
              </div>
              {settings?.defaultBackupFolder && backupFolder !== settings.defaultBackupFolder && (
                <Button
                  variant="secondary"

                  style={{ marginBottom: '0.75rem' }}
                  onClick={() => setBackupFolder(settings.defaultBackupFolder || '')}
                >
                  Use project default folder
                </Button>
              )}
            </>
          }

          <Button
            variant="secondary"
            type="submit"
            disabled={busy}
            style={{ marginTop: '0.75rem' }}
          >
            Save settings
          </Button>
        </form>
      )}
    </>
  );
}
