import type { FmgGlobalContext } from "@fmg/types";

export const requireFmgApi = <K extends keyof FmgGlobalContext>(key: K): NonNullable<FmgGlobalContext[K]> => {
  const api = (window.fmg as FmgGlobalContext | undefined)?.[key];
  if (!api) throw new Error(`window.fmg.${String(key)} is not available`);
  return api as NonNullable<FmgGlobalContext[K]>;
};
