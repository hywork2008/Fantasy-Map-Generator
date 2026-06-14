/**
 * Typed accessor for legacy window globals during React migration.
 * Replace with proper imports once each global is refactored into modules.
 */
type WinGlobals = Window & Record<string, unknown>;

const w = window as WinGlobals;

export function getWindowFn(name: string): ((...args: unknown[]) => void) | undefined {
  const fn = w[name];
  return typeof fn === "function" ? (fn as (...args: unknown[]) => void) : undefined;
}

export function callWindowFn(name: string, ...args: unknown[]): void {
  getWindowFn(name)?.(...args);
}

export function getWindowProp<T>(name: string): T | undefined {
  return w[name] as T | undefined;
}
