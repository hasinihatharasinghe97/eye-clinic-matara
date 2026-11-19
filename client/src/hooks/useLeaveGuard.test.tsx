import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { clearLeaveGuard, confirmLeave, useLeaveGuard } from './useLeaveGuard';

describe('useLeaveGuard', () => {
  it('lets you leave freely when nothing is unsaved', () => {
    const ask = vi.spyOn(window, 'confirm');
    renderHook(() => useLeaveGuard(false));
    expect(confirmLeave()).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks before leaving a form with unsaved changes', () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderHook(() => useLeaveGuard(true));
    expect(confirmLeave()).toBe(false);
    expect(ask).toHaveBeenCalledOnce();

    ask.mockReturnValue(true);
    expect(confirmLeave()).toBe(true);
    // Once the user chose to leave, it doesn't ask again.
    expect(confirmLeave()).toBe(true);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('stops asking after a successful save', () => {
    const ask = vi.spyOn(window, 'confirm');
    renderHook(() => useLeaveGuard(true));
    clearLeaveGuard();
    expect(confirmLeave()).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('stops asking when the form closes', () => {
    const ask = vi.spyOn(window, 'confirm');
    const { unmount } = renderHook(() => useLeaveGuard(true));
    unmount();
    expect(confirmLeave()).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
});
