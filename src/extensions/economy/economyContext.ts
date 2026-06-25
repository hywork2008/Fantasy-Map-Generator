/**
 * Module-level context holder for the economy extension.
 * Populated once by init(api) in index.tsx; read by all economy sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { ExtensionAPI } from "../../types/extension-api";

let _api: ExtensionAPI | null = null;

export function initEconomyContext(api: ExtensionAPI): void {
  _api = api;
}

export function clearEconomyContext(): void {
  _api = null;
}

export function getApi(): ExtensionAPI {
  if (!_api) throw new Error("[economy] Extension context not initialized — call init(api) first");
  return _api;
}

export function getWorldContext() {
  return getApi().worldContext;
}

export function getViewContext() {
  return getApi().viewContext;
}
