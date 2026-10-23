/**
 * Small polyfills for older browsers (Safari 14, Chrome/Edge 88, Firefox 78).
 * Libraries in the bundle (charts, PDF image decoding) call these directly.
 */

if (!Object.hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    configurable: true,
    writable: true,
    value: (obj: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(obj, key),
  });
}

function at<T>(this: ArrayLike<T>, index: number): T | undefined {
  const n = Math.trunc(index) || 0;
  const i = n < 0 ? this.length + n : n;
  return i >= 0 && i < this.length ? this[i] : undefined;
}

for (const proto of [Array.prototype, String.prototype]) {
  if (!('at' in proto)) {
    Object.defineProperty(proto, 'at', { configurable: true, writable: true, value: at });
  }
}

if (typeof globalThis.structuredClone !== 'function') {
  // Only used by chart helpers to copy Error objects; a shallow copy is enough there.
  Object.defineProperty(globalThis, 'structuredClone', {
    configurable: true,
    writable: true,
    value: <T,>(value: T): T => {
      if (value instanceof Error) {
        const copy = new (value.constructor as ErrorConstructor)(value.message);
        copy.name = value.name;
        copy.stack = value.stack;
        return copy as T;
      }
      return JSON.parse(JSON.stringify(value)) as T;
    },
  });
}

export {};
