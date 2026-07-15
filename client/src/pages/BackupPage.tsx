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
      setMessage(`Backup created: ${result.zipName} (${formatSize(result.size)}). You can download it below.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Backup &amp; Settings</h2>
        {settings?.cloudMode ? (
          <p className="muted">
            Cloud mode is on. Patient data is stored in the free Turso database. A ZIP backup is created
            automatically each evening (last 14 kept). Download copies to Google Drive or a phone for extra safety.
          </p>
        ) : (
          <p className="muted">
            All patient data lives in a local folder on this PC. Make a ZIP backup regularly and copy it to
            Google Drive, OneDrive, or a USB stick so records survive PC failure or accidental deletion.
          </p>
        )}
        <p className="muted">
          Last backup:{' '}
          {settings?.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : 'Never'}
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
        <h3>Saved backups</h3>
        {backups.length === 0 ? (
          <p className="empty">No backups yet.</p>
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
        {!settings?.cloudMode && (
          <>
            <h3>Backup destination folder</h3>
            <p className="muted">
              Tip: Install Google Drive for Desktop, then set this path to a folder inside your Drive so backups
              sync automatically.
            </p>
            <div className="field">
              <label>Full folder path on this PC</label>
              <input value={backupFolder} onChange={(e) => setBackupFolder(e.target.value)} required />
            </div>
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
