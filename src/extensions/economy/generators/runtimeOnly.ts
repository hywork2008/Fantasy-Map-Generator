/**
 * Attaches a latest-cycle observation that callers in the same session can read but saves omit.
 * Save serialization and structuredClone copy only enumerable own properties, so a reload simply
 * starts without the observation until the next settlement records it again.
 */
export function setRuntimeOnly<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
  Object.defineProperty(target, key, { value, enumerable: false, writable: true, configurable: true });
}
