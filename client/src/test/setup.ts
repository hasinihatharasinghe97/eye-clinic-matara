// Adds DOM matchers such as toBeInTheDocument() / toHaveAccessibleName() to expect().
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no layout engine, so it lacks these browser APIs; minimal stand-ins.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??=
  NoopIntersectionObserver as unknown as typeof IntersectionObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

afterEach(() => {
  cleanup();
  window.location.hash = '';
});
