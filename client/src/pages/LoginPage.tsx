import { useState, type FormEvent } from 'react';
import { api, type AppUser } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { Button, Notice, TextField } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { consumeSignOutReason } from '@/app/useAuth';
import { IDLE_LOGOUT_LABEL } from '@/hooks/useIdleLogout';

export function LoginPage({ onSignedIn }: { onSignedIn: (user: AppUser) => void }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedOutIdle] = useState(() => consumeSignOutReason() === 'idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.login(username.trim(), password);
      setPassword('');
      onSignedIn(res.user);
    } catch (err) {
      toast.error(errorMessage(err, 'Sign-in failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Nethraloka Ayurvedic Eye Clinic</h1>
        <p className="muted">Sign in to continue</p>
        {signedOutIdle && (
          <Notice>
            You were signed out after {IDLE_LOGOUT_LABEL} without activity, to keep patient records
            private.
          </Notice>
        )}
        <TextField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
          fieldClassName="login-first-field"
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <Button
          type="submit"
          block
          busy={busy}
          busyLabel="Signing in…"
          style={{ marginTop: '0.85rem' }}
        >
          Sign in
        </Button>
      </form>
    </div>
  );
}
