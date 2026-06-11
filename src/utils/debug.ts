/**
 * Logging verbosity flags — imported by renderers and modules.
 * Kept as simple constants so bundlers can tree-shake dead branches in production.
 */
export const TIME: boolean = true;
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
