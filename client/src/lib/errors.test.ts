import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it('uses the message of an Error', () => {
    expect(errorMessage(new Error('Patient not found'), 'fallback')).toBe('Patient not found');
  });

  it('uses a thrown string', () => {
    expect(errorMessage('Offline', 'fallback')).toBe('Offline');
  });

  it('falls back for empty or unknown values', () => {
    expect(errorMessage(new Error(''), 'Could not save')).toBe('Could not save');
    expect(errorMessage({ code: 500 }, 'Could not save')).toBe('Could not save');
    expect(errorMessage(undefined)).toBe('Something went wrong');
  });
});
