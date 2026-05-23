"use strict";

export type LegacyRuntime = typeof globalThis & Record<string, any>;

export const legacyRuntime = globalThis as LegacyRuntime;

export function ensureLegacyElement<T extends HTMLElement = HTMLElement>(id: string): T {
  return legacyRuntime.ensureEl(id) as T;
}
