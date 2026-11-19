import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatMonth, formatSize } from './format';

describe('formatDate', () => {
  it('shows calendar days as day month year', () => {
    expect(formatDate('2026-11-05')).toBe('5 Nov 2026');
  });

  it('never shifts a stored day to the previous day', () => {
    // new Date('2026-01-01') is UTC midnight and shows 31 Dec in timezones behind UTC.
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
  });

  it('always uses three-letter months', () => {
    expect(formatDate('2026-09-10')).toBe('10 Sep 2026');
  });

  it('can include the weekday', () => {
    expect(formatDate('2026-11-19', { weekday: true })).toBe('Thu, 19 Nov 2026');
  });

  it('handles missing and unreadable values', () => {
    expect(formatDate('')).toBe('-');
    expect(formatDate(null, { fallback: 'Never' })).toBe('Never');
    expect(formatDate('soon')).toBe('soon');
  });
});

describe('formatMonth', () => {
  it('names the month', () => {
    expect(formatMonth('2026-11')).toBe('November 2026');
  });
});

describe('formatSize', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('%i bytes → %s', (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });

  it('is empty for unknown sizes', () => {
    expect(formatSize(undefined)).toBe('');
    expect(formatSize(null)).toBe('');
    expect(formatSize(Number.NaN)).toBe('');
  });
});

describe('formatDateTime', () => {
  it('shows the fallback for missing or invalid dates', () => {
    expect(formatDateTime(null)).toBe('Never');
    expect(formatDateTime('', '-')).toBe('-');
    expect(formatDateTime('not a date', '-')).toBe('-');
  });

  it('formats a real date', () => {
    expect(formatDateTime('2026-11-19T10:00:00Z')).not.toBe('Never');
  });
});
