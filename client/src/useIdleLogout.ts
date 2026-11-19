import { useCallback, useEffect, useRef, useState } from 'react';

/** Sign out after this long with no mouse, keyboard or touch activity (8 hours). */
export const IDLE_LOGOUT_MINUTES = 8 * 60;
/** Human-readable form of IDLE_LOGOUT_MINUTES for messages. */
export const IDLE_LOGOUT_LABEL =
  IDLE_LOGOUT_MINUTES % 60 === 0
    ? `${IDLE_LOGOUT_MINUTES / 60} hour${IDLE_LOGOUT_MINUTES === 60 ? '' : 's'}`
    : `${IDLE_LOGOUT_MINUTES} minutes`;
/** Show a "still there?" warning this long before signing out. */
const WARNING_SECONDS = 60;

const ACTIVITY_KEY = 'eye-clinic-last-activity';
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
const WRITE_THROTTLE_MS = 5_000;
const TICK_MS = 1_000;

function readLastActivity(): number {
  try {
    const v = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? v : Date.now();
  } catch {
    return Date.now();
  }
}

function writeLastActivity(t: number) {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(t));
  } catch {
    /* private mode etc. — this tab still tracks activity in memory */
  }
}

/**
 * Signs the clinic out when the app is left unattended, so patient records aren't
 * left open on a shared clinic PC. Activity in any open tab keeps every tab signed in
 * (last activity is shared through localStorage).
 *
 * Returns the seconds left while the warning shows (null otherwise) and a function
 * that keeps the session alive.
 */
export function useIdleLogout(enabled: boolean, onTimeout: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(0);
  const lastWrite = useRef(0);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const markActive = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    if (now - lastWrite.current > WRITE_THROTTLE_MS) {
      lastWrite.current = now;
      writeLastActivity(now);
    }
  }, []);

  const stayActive = useCallback(() => {
    lastWrite.current = 0;
    markActive();
    setSecondsLeft(null);
  }, [markActive]);

  useEffect(() => {
    if (!enabled) return;
    // A fresh sign-in counts as activity (don't inherit an old timestamp).
    lastWrite.current = 0;
    markActive();

    const onActivity = () => {
      // While the warning is up, only the explicit button keeps the session alive,
      // so a stray mouse nudge doesn't hide the warning without the user seeing it.
      if (document.querySelector('[data-idle-warning]')) return;
      markActive();
    };
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });

    const idleMs = IDLE_LOGOUT_MINUTES * 60_000;
    const timer = window.setInterval(() => {
      const last = Math.max(lastActivity.current, readLastActivity());
      lastActivity.current = last;
      const left = Math.ceil((last + idleMs - Date.now()) / 1000);
      if (left <= 0) {
        setSecondsLeft(null);
        onTimeoutRef.current();
      } else if (left <= WARNING_SECONDS) {
        setSecondsLeft(left);
      } else {
        setSecondsLeft(null);
      }
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      setSecondsLeft(null);
    };
  }, [enabled, markActive]);

  return { secondsLeft: enabled ? secondsLeft : null, stayActive };
}
