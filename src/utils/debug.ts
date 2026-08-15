/**
 * Logging verbosity flags — imported by renderers and modules.
 * Kept as simple constants so bundlers can tree-shake dead branches in production.
 */
// Timing output is useful while profiling a specific subsystem, but logging
// every monthly simulation settlement can itself dominate a long SVG advance.
export const TIME: boolean = false;
export const INFO: boolean = true;
export const WARN: boolean = true;
export const ERROR: boolean = true;

/** Feature-specific debug flags from localStorage, e.g. { stateLabels: true }. */
export const DEBUG: Record<string, boolean | undefined> = (() => {
  try {
    return JSON.parse(localStorage.getItem("debug") ?? "") || {};
  } catch {
    return {};
  }
})();
