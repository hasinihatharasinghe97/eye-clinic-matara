import { useCallback, useEffect, useState } from 'react';
import {
  api,
  AUTH_EXPIRED_EVENT,
  broadcastSignOut,
  SIGNOUT_BROADCAST_KEY,
  type AppUser,
} from '@/lib/api';
import { clearLeaveGuard, confirmLeave } from '@/hooks/useLeaveGuard';

/** sessionStorage key telling the login screen why the user was signed out. */
const SIGNOUT_REASON_KEY = 'eye-clinic-signout-reason';

export type AuthStatus = 'checking' | 'signed-in' | 'signed-out';

/** Reads (and clears) why the last sign-out happened, for the login screen. */
export function consumeSignOutReason(): 'idle' | null {
  try {
    const reason = sessionStorage.getItem(SIGNOUT_REASON_KEY);
    sessionStorage.removeItem(SIGNOUT_REASON_KEY);
    return reason === 'idle' ? 'idle' : null;
  } catch {
    return null;
  }
}

/** Ask the server to delete the session cookie, then tell the other tabs. */
async function endSession() {
  try {
    await api.logout();
  } catch {
    /* offline: the cookie still expires with its token */
  }
  broadcastSignOut();
}

/**
 * Who is signed in. The session lives in an HttpOnly cookie the page can't read, so on
 * start-up we simply ask the server (GET /api/system/session) whether it is still valid.
 */
export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    if (status !== 'checking') return;
    let cancelled = false;
    api
      .checkSession()
      .then((s) => {
        if (cancelled) return;
        setUser(s.user);
        setStatus('signed-in');
      })
      .catch(() => {
        if (!cancelled) setStatus('signed-out');
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // Expired session (any 401), or a sign-out in another tab, signs this tab out too.
  useEffect(() => {
    const onExpired = () => setStatus('signed-out');
    const onStorage = (e: StorageEvent) => {
      if (e.key === SIGNOUT_BROADCAST_KEY && e.newValue) setStatus('signed-out');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const signedIn = useCallback((u: AppUser) => {
    setUser(u);
    setStatus('signed-in');
  }, []);

  /** Normal sign-out; asks first if a form has unsaved changes. */
  const signOut = useCallback(() => {
    if (!confirmLeave()) return;
    setUser(null);
    setStatus('signed-out');
    void endSession();
  }, []);

  /** Automatic sign-out after inactivity; the login screen explains why. */
  const signOutIdle = useCallback(() => {
    clearLeaveGuard();
    try {
      sessionStorage.setItem(SIGNOUT_REASON_KEY, 'idle');
    } catch {
      /* private mode: the login screen just won't show the reason */
    }
    setStatus('signed-out');
    void endSession();
  }, []);

  return {
    status,
    user: status === 'signed-in' ? user : null,
    setUser,
    signedIn,
    signOut,
    signOutIdle,
  };
}
