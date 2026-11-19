import { useEffect } from 'react';

/**
 * "You have unsaved changes" protection for forms.
 *
 * A form calls useLeaveGuard(dirty). While dirty, in-app navigation (menu links, Back,
 * "Back without saving") asks before leaving, and closing or reloading the tab shows the
 * browser's own warning. After a successful save, call clearLeaveGuard() before moving on.
 */
const MESSAGE = 'You have unsaved changes on this form. Leave without saving?';

let active = false;

export function clearLeaveGuard() {
  active = false;
}

/** Returns true when it's fine to leave the current page. */
export function confirmLeave(): boolean {
  if (!active) return true;
  if (window.confirm(MESSAGE)) {
    active = false;
    return true;
  }
  return false;
}

export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    active = dirty;
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!active) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      active = false;
    };
  }, [dirty]);
}
