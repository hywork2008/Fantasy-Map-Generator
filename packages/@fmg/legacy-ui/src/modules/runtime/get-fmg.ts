import type { FmgGlobalContext } from "@fmg/types";
import { getCoreFmgInstances } from "@fmg/core/modules/initialize-fmg";

export const getFmg = (): FmgGlobalContext | undefined => (window.fmg as FmgGlobalContext | undefined);

export const getFmgOptionalService = <K extends keyof FmgGlobalContext>(key: K): NonNullable<FmgGlobalContext[K]> | undefined => {
  const fmg = getFmg();
  if (fmg && key in fmg && (fmg as unknown as Record<string, unknown>)[key])
    {
      const val = (fmg as unknown as Record<string, unknown>)[key] as NonNullable<FmgGlobalContext[K]>;
      // If the runtime provided a function (likely a shim stub or constructor),
      // prefer the concrete core instance when available to guarantee the
      // expected instance shape (methods like `generate`). This avoids callers
      // receiving a queued-stub function that doesn't implement the API object.
      const core = getCoreFmgInstances() as unknown as Record<string, unknown> | undefined;
      if (typeof val === "function" && core && key in core && typeof core[key as string] === "object") {
        return core[key as string] as NonNullable<FmgGlobalContext[K]>;
      }

      // If the runtime value is an object, return it as-is.
      if (val && typeof val === "object") return val;

      // Otherwise, if it's a primitive or function that we should respect, return it.
      return val as NonNullable<FmgGlobalContext[K]>;
    }

  // Fallback to core instances when available (migration compatibility)
  const core = getCoreFmgInstances() as unknown as Record<string, unknown> | undefined;
  if (core && key in core) return core[key as string] as NonNullable<FmgGlobalContext[K]>;

  return undefined;
};

export default getFmg;

// Normalizes a service from `window.fmg`, preferring core instances when the
// runtime value is a queued stub or otherwise missing the expected shape.
export const normalizeFmgService = <K extends keyof FmgGlobalContext>(
  key: K,
  expectedMethods?: string | string[],
  allowFunction = false
): NonNullable<FmgGlobalContext[K]> | undefined => {
  const expected = Array.isArray(expectedMethods) ? expectedMethods : expectedMethods ? [expectedMethods] : [];
  const val = getFmgOptionalService(key);
  const core = getCoreFmgInstances() as unknown as Record<string, unknown> | undefined;

  if (val !== undefined) {
    // If no expected shape provided, guard against returning a function when
    // a concrete object is expected.
    if (expected.length === 0) {
      if (!allowFunction && typeof val === "function") {
        if (core && key in core) return core[key as string] as NonNullable<FmgGlobalContext[K]>;
        return undefined;
      }
      return val;
    }

    // If value is an object and exposes all expected methods, accept it.
    if (val && typeof val === "object") {
      const ok = expected.every(m => (val as any)[m] !== undefined);
      if (ok) return val;
    }

    // Fallback to core instance if it satisfies the expected shape.
    if (core && key in core) {
      const coreVal = core[key as string] as NonNullable<FmgGlobalContext[K]>;
      if (expected.length === 0) return coreVal;
      if (coreVal && typeof coreVal === "object" && expected.every(m => (coreVal as any)[m] !== undefined)) return coreVal;
    }

    // Allow functions when explicitly requested.
    if (allowFunction && typeof val === "function") return val;

    return val;
  }

  if (core && key in core) return core[key as string] as NonNullable<FmgGlobalContext[K]>;
  return undefined;
};
