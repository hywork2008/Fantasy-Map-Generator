import type { TFunction } from "i18next";

/** Loose translate signature used by helpers that take dynamic keys. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Adapts i18next's strictly typed TFunction to the loose Translate signature. */
export function toTranslate(t: TFunction): Translate {
  return (key, options) => String(t(key, (options ?? {}) as never));
}
