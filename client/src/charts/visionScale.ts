/** Chart scale for a vision series: score → axis label. Lower score = better vision. */
export type VisionScale = { max: number; labels: Record<number, string> };

/** Distance VA (and pinhole): 1 = 6/6 best … 11 = PL worst; 12 = "-" (blind). */
export const DISTANCE_SCALE: VisionScale = {
  max: 12,
  labels: {
    1: '6/6',
    2: '6/9',
    3: '6/12',
    4: '6/18',
    5: '6/24',
    6: '6/36',
    7: '6/60',
    8: '3/60',
    9: 'CFS',
    10: 'HM',
    11: 'PL',
    12: 'Blind (-)',
  },
};

/** Near vision: 1 = best … 12 = worst; 13 = "-" (blind). */
export const NEAR_SCALE: VisionScale = {
  max: 13,
  labels: {
    ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, String(i + 1)])),
    13: 'Blind (-)',
  },
};

export function visionLabel(scale: VisionScale, value: number) {
  return scale.labels[value] ?? String(value);
}
