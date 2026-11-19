import { Button, Modal } from '@/components/ui';
import { IDLE_LOGOUT_LABEL } from '@/hooks/useIdleLogout';

type Props = {
  /** Seconds until automatic sign-out, or null when no warning is due. */
  secondsLeft: number | null;
  onStay: () => void;
  onSignOut: () => void;
};

/** "Still there?" countdown before the automatic sign-out. */
export function IdleWarningDialog({ secondsLeft, onStay, onSignOut }: Props) {
  return (
    <Modal
      open={secondsLeft !== null}
      role="alertdialog"
      title="Still there?"
      // useIdleLogout ignores mouse movement while this marker is on screen, so only
      // the button below keeps the session alive.
      overlayProps={{ 'data-idle-warning': true }}
      actions={
        <>
          <Button variant="secondary" onClick={onSignOut}>
            Sign out now
          </Button>
          <Button onClick={onStay} autoFocus>
            Stay signed in
          </Button>
        </>
      }
    >
      For patient privacy you will be signed out in <strong>{secondsLeft}</strong> second
      {secondsLeft === 1 ? '' : 's'} because nobody has used the app for {IDLE_LOGOUT_LABEL}. Save
      any open form to keep your changes.
    </Modal>
  );
}
