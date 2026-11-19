import { useCallback, useEffect, useState } from 'react';
import { api, type AppUser, type UserRole } from '../api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { EmptyState, LoadingBlock } from '../components/PageNav';

const MIN_PASSWORD = 8;

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

/** Change your own password. Used on this page and on the forced first-sign-in screen. */
export function ChangePasswordForm({
  onChanged,
  submitLabel = 'Change password',
}: {
  onChanged: (user: AppUser) => void;
  submitLabel?: string;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < MIN_PASSWORD) {
      toast.error(`New password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (next !== confirm) {
      toast.error('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const user = await api.changeMyPassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password changed. You were signed out on other devices.');
      onChanged(user);
    } catch (err) {
      toast.error(errorText(err, 'Could not change password'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="pw-current">Current password</label>
        <input
          id="pw-current"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="pw-new">New password</label>
        <input
          id="pw-new"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          maxLength={200}
          placeholder={`At least ${MIN_PASSWORD} characters`}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="pw-confirm">Confirm new password</label>
        <input
          id="pw-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <button className="btn" type="submit" disabled={busy} style={{ marginTop: '0.5rem' }}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

function AddUserForm({ onAdded }: { onAdded: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await api.createUser({ username, fullName, password, role });
      toast.success(`Added ${u.fullName}. They must choose their own password at first sign-in.`);
      setUsername('');
      setFullName('');
      setPassword('');
      setRole('staff');
      onAdded();
    } catch (err) {
      toast.error(errorText(err, 'Could not add user'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="users-add">
      <div className="field">
        <label htmlFor="nu-name">Full name</label>
        <input id="nu-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={128} required />
      </div>
      <div className="field">
        <label htmlFor="nu-user">Username</label>
        <input
          id="nu-user"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          pattern="[a-z0-9._\-]{3,32}"
          title="3–32 characters: letters, numbers, dot, dash or underscore"
          autoComplete="off"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="nu-pw">Temporary password</label>
        <input
          id="nu-pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={MIN_PASSWORD}
          maxLength={200}
          autoComplete="new-password"
          placeholder={`At least ${MIN_PASSWORD} characters`}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="nu-role">Role</label>
        <select id="nu-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          <option value="staff">Staff — patients, visits, reports, backups</option>
          <option value="admin">Administrator — also manages users and settings</option>
        </select>
      </div>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Adding…' : 'Add user'}
      </button>
    </form>
  );
}

function ManageUsers({ me }: { me: AppUser }) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [resetFor, setResetFor] = useState<AppUser | null>(null);
  const [resetPw, setResetPw] = useState('');

  const load = useCallback(async () => {
    try {
      setUsers(await api.listUsers());
    } catch (err) {
      toast.error(errorText(err, 'Could not load users'));
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      toast.success(done);
      await load();
    } catch (err) {
      toast.error(errorText(err, 'Action failed'));
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetFor) return;
    const target = resetFor;
    await act(
      () => api.resetUserPassword(target.id, resetPw),
      `Temporary password set for ${target.fullName}. They must change it when they sign in.`
    );
    setResetFor(null);
    setResetPw('');
  }

  return (
    <>
      <div className="card">
        <h3>Users</h3>
        {users === null ? (
          <LoadingBlock label="Loading users…" />
        ) : users.length === 0 ? (
          <EmptyState title="No users" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === me.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        {u.fullName}
                        {self && <span className="muted"> (you)</span>}
                      </td>
                      <td>{u.username}</td>
                      <td>
                        <select
                          value={u.role}
                          disabled={self}
                          aria-label={`Role for ${u.fullName}`}
                          onChange={(e) =>
                            act(
                              () => api.updateUser(u.id, { role: e.target.value as UserRole }),
                              `${u.fullName} is now ${e.target.value === 'admin' ? 'an administrator' : 'staff'}.`
                            )
                          }
                        >
                          <option value="staff">Staff</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </td>
                      <td>
                        {u.active ? (u.mustChangePassword ? 'Must change password' : 'Active') : 'Disabled'}
                      </td>
                      <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                      <td>
                        {!self && (
                          <div className="row users-actions">
                            <button className="btn secondary" type="button" onClick={() => setResetFor(u)}>
                              Reset password
                            </button>
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() =>
                                act(
                                  () => api.updateUser(u.id, { active: !u.active }),
                                  u.active ? `${u.fullName} can no longer sign in.` : `${u.fullName} can sign in again.`
                                )
                              }
                            >
                              {u.active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              className="btn danger"
                              type="button"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: 'Delete user?',
                                  message: `Delete ${u.fullName} (${u.username})? They will be signed out and can't sign in again. Patient records are not affected. To keep their account for later, use Disable instead.`,
                                  confirmLabel: 'Delete user',
                                  danger: true,
                                });
                                if (ok) await act(() => api.deleteUser(u.id), `Deleted ${u.fullName}.`);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {resetFor && (
          <form onSubmit={submitReset} className="users-reset">
            <h4>Reset password for {resetFor.fullName}</h4>
            <p className="muted">
              Give them this temporary password in person. They will be signed out everywhere and must
              choose a new password when they next sign in.
            </p>
            <div className="field">
              <label htmlFor="rp-pw">Temporary password</label>
              <input
                id="rp-pw"
                type="password"
                value={resetPw}
                onChange={(e) => setResetPw(e.target.value)}
                minLength={MIN_PASSWORD}
                maxLength={200}
                autoComplete="new-password"
                required
                autoFocus
              />
            </div>
            <div className="row">
              <button className="btn" type="submit">
                Set temporary password
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setResetFor(null);
                  setResetPw('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h3>Add a user</h3>
        <p className="muted">
          Give each person their own account — never share one. Staff can work with patients, reports
          and backups; administrators can also manage users and clinic settings.
        </p>
        <AddUserForm onAdded={load} />
      </div>
    </>
  );
}

export function UsersPage({ me, onMeChanged }: { me: AppUser; onMeChanged: (u: AppUser) => void }) {
  return (
    <>
      <div className="card">
        <h3>My account</h3>
        <p className="muted">
          Signed in as <strong>{me.fullName}</strong> ({me.username}) ·{' '}
          {me.role === 'admin' ? 'Administrator' : 'Staff'}
        </p>
        <h4 style={{ marginBottom: '0.5rem' }}>Change my password</h4>
        <p className="muted" style={{ marginTop: 0 }}>
          Changing it signs you out on every other device.
        </p>
        <ChangePasswordForm onChanged={onMeChanged} />
      </div>
      {me.role === 'admin' && <ManageUsers me={me} />}
    </>
  );
}
