import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type AppUser, type UserRole } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  LoadingBlock,
  SelectField,
  TextField,
  type Column,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';

const MIN_PASSWORD = 8;

const ROLE_OPTIONS: ReadonlyArray<{ value: UserRole; label: string }> = [
  { value: 'staff', label: 'Staff - patients, visits, reports, backups' },
  { value: 'admin', label: 'Administrator - also manages users and settings' },
];

const roleName = (role: UserRole) => (role === 'admin' ? 'Administrator' : 'Staff');

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

  async function submit(e: FormEvent) {
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
      toast.error(errorMessage(err, 'Could not change password'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <TextField
        label="Current password"
        type="password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        autoComplete="current-password"
        required
      />
      <TextField
        label="New password"
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        maxLength={200}
        placeholder={`At least ${MIN_PASSWORD} characters`}
        required
      />
      <TextField
        label="Confirm new password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        required
      />
      <Button type="submit" busy={busy} busyLabel="Saving…">
        {submitLabel}
      </Button>
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

  async function submit(e: FormEvent) {
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
      toast.error(errorMessage(err, 'Could not add user'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="users-add">
      <TextField
        label="Full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        maxLength={128}
        required
      />
      <TextField
        label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase())}
        pattern="[a-z0-9._\-]{3,32}"
        title="3-32 characters: letters, numbers, dot, dash or underscore"
        autoComplete="off"
        required
      />
      <TextField
        label="Temporary password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={MIN_PASSWORD}
        maxLength={200}
        autoComplete="new-password"
        placeholder={`At least ${MIN_PASSWORD} characters`}
        required
      />
      <SelectField
        label="Role"
        value={role}
        onChange={(e) => setRole(e.target.value as UserRole)}
        options={ROLE_OPTIONS}
      />
      <Button type="submit" busy={busy} busyLabel="Adding…">
        Add user
      </Button>
    </form>
  );
}

function ResetPasswordForm({
  user,
  onSubmit,
  onCancel,
}: {
  user: AppUser;
  onSubmit: (password: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  return (
    <form
      className="users-reset"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit(password);
      }}
    >
      <h4>Reset password for {user.fullName}</h4>
      <p className="muted">
        Give them this temporary password in person. They will be signed out everywhere and must
        choose a new password when they next sign in.
      </p>
      <TextField
        label="Temporary password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={MIN_PASSWORD}
        maxLength={200}
        autoComplete="new-password"
        required
        autoFocus
      />
      <div className="row">
        <Button type="submit">Set temporary password</Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ManageUsers({ me }: { me: AppUser }) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [resetFor, setResetFor] = useState<AppUser | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await api.listUsers());
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load users'));
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs a change, shows the result, then reloads the list. */
  async function act(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      toast.success(done);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'Action failed'));
    }
  }

  async function deleteUser(u: AppUser) {
    const ok = await confirm({
      title: 'Delete user?',
      message: `Delete ${u.fullName} (${u.username})? They will be signed out and can't sign in again. Patient records are not affected. To keep their account for later, use Disable instead.`,
      confirmLabel: 'Delete user',
      danger: true,
    });
    if (ok) await act(() => api.deleteUser(u.id), `Deleted ${u.fullName}.`);
  }

  const columns: ReadonlyArray<Column<AppUser>> = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <>
          {u.fullName}
          {u.id === me.id && <span className="muted"> (you)</span>}
        </>
      ),
    },
    { key: 'username', header: 'Username', render: (u) => u.username },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <select
          value={u.role}
          disabled={u.id === me.id}
          aria-label={`Role for ${u.fullName}`}
          onChange={(e) => {
            const role = e.target.value as UserRole;
            void act(
              () => api.updateUser(u.id, { role }),
              `${u.fullName} is now ${roleName(role).toLowerCase()}.`
            );
          }}
        >
          <option value="staff">Staff</option>
          <option value="admin">Administrator</option>
        </select>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) =>
        u.active ? (u.mustChangePassword ? 'Must change password' : 'Active') : 'Disabled',
    },
    {
      key: 'lastLogin',
      header: 'Last sign-in',
      render: (u) => formatDateTime(u.lastLoginAt),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) =>
        u.id === me.id ? null : (
          <div className="row users-actions">
            <Button variant="secondary" onClick={() => setResetFor(u)}>
              Reset password
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                act(
                  () => api.updateUser(u.id, { active: !u.active }),
                  u.active
                    ? `${u.fullName} can no longer sign in.`
                    : `${u.fullName} can sign in again.`
                )
              }
            >
              {u.active ? 'Disable' : 'Enable'}
            </Button>
            <Button variant="danger-outline" onClick={() => void deleteUser(u)}>
              Delete
            </Button>
          </div>
        ),
    },
  ];

  return (
    <>
      <Card title="Users">
        {users === null ? (
          <LoadingBlock label="Loading users…" />
        ) : users.length === 0 ? (
          <EmptyState title="No users" />
        ) : (
          <DataTable caption="Clinic users" columns={columns} rows={users} rowKey={(u) => u.id} />
        )}
        {resetFor && (
          <ResetPasswordForm
            user={resetFor}
            onCancel={() => setResetFor(null)}
            onSubmit={async (password) => {
              await act(
                () => api.resetUserPassword(resetFor.id, password),
                `Temporary password set for ${resetFor.fullName}. They must change it when they sign in.`
              );
              setResetFor(null);
            }}
          />
        )}
      </Card>

      <Card title="Add a user">
        <p className="muted">
          Give each person their own account - never share one. Staff can work with patients,
          reports and backups; administrators can also manage users and clinic settings.
        </p>
        <AddUserForm onAdded={load} />
      </Card>
    </>
  );
}

export function UsersPage({ me, onMeChanged }: { me: AppUser; onMeChanged: (u: AppUser) => void }) {
  return (
    <>
      <Card title="My account">
        <p className="muted">
          Signed in as <strong>{me.fullName}</strong> ({me.username}) · {roleName(me.role)}
        </p>
        <h4 style={{ marginBottom: '0.5rem' }}>Change my password</h4>
        <p className="muted" style={{ marginTop: 0 }}>
          Changing it signs you out on every other device.
        </p>
        <ChangePasswordForm onChanged={onMeChanged} />
      </Card>
      {me.role === 'admin' && <ManageUsers me={me} />}
    </>
  );
}
