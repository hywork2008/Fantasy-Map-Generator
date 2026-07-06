/**
 * Module-level context holder for the shipbuilding extension.
 * Populated once by init(api) in index.ts; read by all shipbuilding sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { ExtensionAPI } from "../hostTypes";

let _api: ExtensionAPI | null = null;

export function initShipbuildingContext(api: ExtensionAPI): void {
  _api = api;
}

export function clearShipbuildingContext(): void {
  _api = null;
}

export function getApi(): ExtensionAPI {
  if (!_api) throw new Error("[shipbuilding] Extension context not initialized — call init(api) first");
  return _api;
}

export function getWorldContext() {
  return getApi().worldContext;
}

export function getShipyardsLayer() {
  return getApi().getSvgLayer("shipyards");
}
