/**
 * Turns anything thrown (Error, string, unknown) into a message to show the user.
 * Use instead of repeating `err instanceof Error ? err.message : '…'` everywhere.
 */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}
