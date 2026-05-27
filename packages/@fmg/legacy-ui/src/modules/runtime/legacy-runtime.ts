"use strict";

export type LegacyRuntime = typeof globalThis & Record<string, any>;

export const legacyRuntime = globalThis as LegacyRuntime;

export function getLegacyPack<T = unknown>(): T {
  return legacyRuntime.pack as T;
}

export function getLegacyGrid<T = unknown>(): T {
  return legacyRuntime.grid as T;
}

export function ensureLegacyElement<T extends HTMLElement = HTMLElement>(id: string): T {
  return legacyRuntime.ensureEl(id) as T;
}
