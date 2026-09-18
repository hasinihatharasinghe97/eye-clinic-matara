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
        `Backup created: ${result.zipName} (${formatSize(result.size)}). Download it below and copy to Google Drive / USB.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBusy(false);
    }
  }

  const keep = settings?.backupKeepCount ?? (settings?.cloudMode ? 7 : 14);

  return (
    <>
      <div className="card">
        <h2>Backup &amp; Settings</h2>
        {settings?.cloudMode ? (
          <p className="muted">
            Cloud mode: patient data, uploads, and the last {keep} ZIP backups are stored in MySQL.
            The server also creates a backup automatically when the last one is older than ~20 hours
            (important on free hosts that sleep). Always download a copy to Google Drive or USB —
            do not rely only on the cloud database.
          </p>
        ) : (
          <p className="muted">
            Patient data is in MySQL. Uploads and ZIP backups stay on this PC (last {keep} kept).
            Back up regularly and copy ZIPs to Google Drive, OneDrive, or USB so records survive PC
            failure.
          </p>
        )}
        <p className="muted">
          Last backup:{' '}
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
        <h3>Offsite backup (required)</h3>
        <ol className="muted" style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
          <li>Click <strong>Backup now</strong>, then <strong>Download latest</strong>.</li>
          <li>Save the ZIP into Google Drive / OneDrive / a USB stick (weekly at minimum).</li>
          <li>
            Keep at least two copies in different places (example: Drive + USB at the hospital).
          </li>
        </ol>
      </div>

      <div className="card">
        <h3>How to restore</h3>
        <p className="muted">
          Each ZIP contains <code>snapshot.json</code>, <code>uploads/</code>, and{' '}
          <code>README-RESTORE.txt</code>. On a PC with Node + this project:
        </p>
        <pre className="code-block" style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
{`# Point MYSQL_* at the destination (empty DB preferred)
$env:STORE_FILES_IN_DB="1"   # cloud only
node scripts/restore-from-backup.mjs .\\EyeClinic-Backup-....zip`}
        </pre>
        <p className="muted">
          Full hosting and restore steps: see <code>docs/HOSTING.md</code> in the project.
        </p>
      </div>

      <div className="card">
        <h3>Saved backups</h3>
        {backups.length === 0 ? (
          <p className="empty">No backups yet.</p>
        ) : (
          <>
            <div className="table-wrap desktop-only">
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
            <ul className="mobile-list mobile-only">
              {backups.map((b) => (
                <li key={b.id} className="mobile-list-card">
                  <div className="mobile-list-item static">
                    <span className="mobile-list-title">{b.zipName}</span>
                    <span className="mobile-list-meta">
                      {new Date(b.createdAt).toLocaleString()} · {formatSize(b.size)}
                    </span>
                  </div>
                  <div className="mobile-list-actions">
                    <a className="btn secondary" href={api.backupDownloadUrl(b.id)}>
                      Download
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <form className="card" onSubmit={saveSettings}>
        {!settings?.cloudMode && (
          <>
            <h3>Backup destination folder</h3>
            <p className="muted">
              Leave the project default (<code>data/backups</code>) so it follows this folder on any PC. Or
              set a path inside Google Drive / OneDrive on <em>this</em> computer so backups sync
              automatically.
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

        <h3 className="section-title">Change clinic password</h3>
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
