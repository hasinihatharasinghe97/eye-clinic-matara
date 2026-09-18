import { useEffect, useState } from 'react';
import { api, type SystemSettings, type BackupInfo } from '../api';

function formatSize(n?: number) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [backupFolder, setBackupFolder] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [s, list] = await Promise.all([api.getSettings(), api.listBackups()]);
    setSettings(s);
    setBackupFolder(s.backupFolder);
    setBackups(list);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body: { backupFolder?: string; clinicPassword?: string } = {};
      if (!settings?.cloudMode) body.backupFolder = backupFolder;
      if (newPassword.trim()) body.clinicPassword = newPassword.trim();
      const s = await api.updateSettings(body);
      setSettings(s);
      setBackupFolder(s.backupFolder);
      setNewPassword('');
      setMessage('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings');
    } finally {
      setBusy(false);
    }
  }

  async function runBackup() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!settings?.cloudMode && backupFolder !== settings?.backupFolder) {
        await api.updateSettings({ backupFolder });
      }
      const result = await api.backup();
      await refresh();
      setMessage(
        settings?.cloudMode
          ? `Backup created: ${result.zipName} (${formatSize(result.size)}). It is stored in Oracle HeatWave. Download a copy below, or use Upload to Google Drive.`
          : `Backup created: ${result.zipName} (${formatSize(result.size)}). Download it below and copy to Google Drive / USB.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBusy(false);
    }
  }

  async function runDriveUpload() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.uploadBackupToDrive();
      await refresh();
      setMessage(
        `Uploaded ${result.zipName} to Google Drive only (not stored again in HeatWave). Previous daily Drive backup was removed.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Drive upload failed');
    } finally {
      setBusy(false);
    }
  }

  const keep = settings?.backupKeepCount ?? (settings?.cloudMode ? 7 : 14);
  const cloud = Boolean(settings?.cloudMode);
  const drive = settings?.googleDrive;

  return (
    <>
      <div className="card">
        <h2>Backup &amp; Settings</h2>
        {cloud ? (
          <>
            <p className="muted" style={{ marginBottom: '0.75rem' }}>
              This clinic runs on <strong>Render</strong> (app) + <strong>Oracle HeatWave MySQL</strong>{' '}
              (database). Live patient records, photos/PDFs, and ZIP backups all live in HeatWave —
              Render’s free disk is temporary and is not used for clinic data.
            </p>
            <ul className="muted" style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }}>
              <li>
                <strong>Backup now</strong> builds a ZIP (<code>snapshot.json</code> +{' '}
                <code>uploads/</code>) and stores it in the HeatWave table{' '}
                <code>backup_archives</code>.
              </li>
              <li>
                The server also auto-creates a ZIP when the last one is older than ~20 hours (about 5
                minutes after Render wakes from sleep).
              </li>
              <li>
                Only the last <strong>{keep}</strong> ZIPs are kept in HeatWave (older ones are
                deleted to save the free 50&nbsp;GB).
              </li>
              <li>
                Configure <strong>Google Drive daily upload</strong> below so a copy leaves Oracle
                every night at 1:00&nbsp;am (Asia/Colombo).
              </li>
            </ul>
          </>
        ) : (
          <p className="muted">
            Patient data is in MySQL. Uploads and ZIP backups stay on this PC (last {keep} kept).
            Back up regularly and copy ZIPs to Google Drive, OneDrive, or USB so records survive PC
            failure. Optional: enable Google Drive auto-upload (same env vars as cloud) for a nightly
            offsite copy.
          </p>
        )}
        <p className="muted">
          Last HeatWave/local backup:{' '}
          {settings?.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : 'Never'}
          {settings?.backupOverdue ? (
            <span className="error"> — overdue: click Backup now, then Download latest</span>
          ) : null}
        </p>
        <div className="row">
          <button className="btn" type="button" onClick={runBackup} disabled={busy}>
            {busy ? 'Working…' : 'Backup now'}
          </button>
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
              Enabled. Every day at <strong>1:00 am Asia/Colombo</strong> the server builds a ZIP and
              uploads <code>Nethraloka-Daily-YYYY-MM-DD.zip</code> to your Drive folder only — it is{' '}
              <strong>not</strong> kept again inside HeatWave. When today’s upload succeeds,
              yesterday’s Drive file is deleted (only the latest daily file stays on Drive).
            </p>
            <ul className="muted" style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }}>
              <li>
                Last Drive upload:{' '}
                {drive.lastDriveBackupAt
                  ? `${new Date(drive.lastDriveBackupAt).toLocaleString()} (${drive.lastDriveFileName || 'ZIP'})`
                  : 'Never'}
              </li>
              {drive.lastDriveError ? (
                <li>
                  <span className="error">Last error: {drive.lastDriveError}</span>
                </li>
              ) : null}
              <li>
                Free Render may sleep at 1:00 am — if so, the upload runs on the next wake after
                1:00 am, or via an external cron hitting{' '}
                <code>POST /api/system/cron/drive-backup</code> with{' '}
                <code>X-Cron-Secret</code>.
              </li>
            </ul>
            <button className="btn secondary" type="button" onClick={runDriveUpload} disabled={busy}>
              {busy ? 'Working…' : 'Upload to Google Drive now'}
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Not configured yet. Without Drive, a HeatWave crash means you only have ZIPs you
              already downloaded manually.
            </p>
            <ol className="muted" style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
              <li>
                In Google Cloud Console create a project → enable <strong>Google Drive API</strong> →
                create a <strong>Service account</strong> → download its JSON key.
              </li>
              <li>
                In Google Drive, create a folder (e.g. <code>Nethraloka-Backups</code>), share it with
                the service account email (<code>…@….iam.gserviceaccount.com</code>) as{' '}
                <strong>Editor</strong>, and copy the folder ID from the URL.
              </li>
              <li>
                On Render (Environment), set:
                <pre className="code-block" style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', marginTop: '0.5rem' }}>
{`GOOGLE_DRIVE_FOLDER_ID=your_folder_id
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
BACKUP_CRON_SECRET=long-random-secret`}
                </pre>
                (Or set <code>GOOGLE_SERVICE_ACCOUNT_JSON_BASE64</code> if the JSON is awkward in the
                env UI.)
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
            <p className="muted">Full steps: <code>docs/HOSTING.md</code> → Google Drive backups.</p>
          </>
        )}
      </div>

      <div className="card">
        <h3>Manual offsite copy</h3>
        {cloud ? (
          <ol className="muted" style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
            <li>
              Click <strong>Backup now</strong>, then <strong>Download latest</strong> (ZIP comes
              from HeatWave through the Render app).
            </li>
            <li>Also keep a USB copy weekly if possible.</li>
            <li>
              Prefer Google Drive auto-upload above so recovery does not depend only on Oracle.
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
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
      </div>

      <div className="card">
        <h3>How to restore</h3>
        {cloud ? (
          <>
            <p className="muted">
              Each ZIP contains <code>snapshot.json</code>, <code>uploads/</code>, and{' '}
              <code>README-RESTORE.txt</code>. To restore into a <strong>new Oracle HeatWave</strong>{' '}
              instance (empty <code>eye_clinic</code> database recommended):
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
        <h3>{cloud ? 'ZIP backups in HeatWave' : 'Saved backups'}</h3>
        {cloud && (
          <p className="muted" style={{ marginTop: 0 }}>
            These ZIPs are stored inside Oracle MySQL (not on the Render filesystem). Download any
            row to keep an offsite copy.
          </p>
        )}
        {backups.length === 0 ? (
          <p className="empty">No backups yet. Click Backup now to create the first ZIP.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Created</th>
                  <th>Size</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td>{b.zipName}</td>
                    <td>{new Date(b.createdAt).toLocaleString()}</td>
                    <td>{formatSize(b.size)}</td>
                    <td>
                      <a className="btn secondary" href={api.backupDownloadUrl(b.id)}>
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form className="card" onSubmit={saveSettings}>
        {!cloud && (
          <>
            <h3>Backup destination folder</h3>
            <p className="muted">
              Leave the project default (<code>data/backups</code>) so it follows this folder on any
              PC. Or set a path inside Google Drive / OneDrive on <em>this</em> computer so backups
              sync automatically.
            </p>
            <div className="field">
              <label>Full folder path on this PC</label>
              <input value={backupFolder} onChange={(e) => setBackupFolder(e.target.value)} required />
            </div>
            {settings?.defaultBackupFolder && backupFolder !== settings.defaultBackupFolder && (
              <button
                className="btn secondary"
                type="button"
                style={{ marginBottom: '0.75rem' }}
                onClick={() => setBackupFolder(settings.defaultBackupFolder || '')}
              >
                Use project default folder
              </button>
            )}
          </>
        )}

        <h3 className={cloud ? undefined : 'section-title'}>Change clinic password</h3>
        {cloud && (
          <p className="muted" style={{ marginTop: 0 }}>
            This password protects the Render website login. It is separate from the Oracle HeatWave
            MySQL password (set in OCI / Render env vars).
          </p>
        )}
        <div className="field">
          <label>New password (leave blank to keep current)</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={4}
            placeholder="At least 4 characters"
          />
        </div>

        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}

        <button className="btn secondary" type="submit" disabled={busy} style={{ marginTop: '0.75rem' }}>
          Save settings
        </button>
      </form>
    </>
  );
}
