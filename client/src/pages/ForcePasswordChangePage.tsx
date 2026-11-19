import type { AppUser } from '@/lib/api';
import { Button } from '@/components/ui';
import { ChangePasswordForm } from '@/pages/UsersPage';

type Props = {
  user: AppUser;
  onChanged: (user: AppUser) => void;
  onSignOut: () => void;
};

/** Shown after signing in with a temporary password: nothing else works until it's changed. */
export function ForcePasswordChangePage({ user, onChanged, onSignOut }: Props) {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Choose your password</h1>
        <p className="muted">
          Welcome, {user.fullName}. You signed in with a temporary password - choose your own to
          continue. Don&apos;t share it with anyone.
        </p>
        <ChangePasswordForm onChanged={onChanged} submitLabel="Save and continue" />
        <Button variant="link" onClick={onSignOut} style={{ marginTop: '0.75rem' }}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
