/**
 * Module-level context holder for the nobility extension.
 * Populated once by init(api) in index.tsx; read by all nobility sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { ExtensionAPI } from "../../types/extension-api";

let _api: ExtensionAPI | null = null;

export function initNobilityContext(api: ExtensionAPI): void {
  _api = api;
}

export function clearNobilityContext(): void {
  _api = null;
}

/** Supports pure generator helpers that are exercised without the extension lifecycle in unit tests. */
export function hasNobilityContext(): boolean {
  return _api !== null;
}

export function getApi(): ExtensionAPI {
  if (!_api) throw new Error("[nobility] Extension context not initialized — call init(api) first");
  return _api;
}

export function getWorldContext() {
  return getApi().worldContext;
}
