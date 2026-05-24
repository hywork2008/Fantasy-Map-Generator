import type { FmgGlobalContext } from "@fmg/types";

export const requireFmgApi = <K extends keyof FmgGlobalContext>(key: K): NonNullable<FmgGlobalContext[K]> => {
  const resolve = () => (window.fmg as FmgGlobalContext | undefined)?.[key] as NonNullable<FmgGlobalContext[K]> | undefined;

  const resolved = resolve();
  if (resolved) return resolved;

  const missingMessage = `window.fmg.${String(key)} is not available`;

  const lazyCallable = function(this: unknown, ...args: unknown[]) {
    const api = resolve();
    if (typeof api !== "function") throw new Error(missingMessage);
    return (api as (...a: unknown[]) => unknown).apply(this, args);
  };

  const proxy = new Proxy(lazyCallable as unknown as object, {
    get(_target, property) {
      const api = resolve();
      if (!api) throw new Error(missingMessage);
      const value = (api as Record<PropertyKey, unknown>)[property];
      return typeof value === "function" ? (value as Function).bind(api) : value;
    },
    apply(_target, thisArg, argArray) {
      const api = resolve();
      if (typeof api !== "function") throw new Error(missingMessage);
      return (api as (...a: unknown[]) => unknown).apply(thisArg, argArray as unknown[]);
    }
  });

  return proxy as NonNullable<FmgGlobalContext[K]>;
};
