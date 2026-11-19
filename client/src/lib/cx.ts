/** Joins class names, skipping empty / false values: cx('btn', busy && 'is-busy'). */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
