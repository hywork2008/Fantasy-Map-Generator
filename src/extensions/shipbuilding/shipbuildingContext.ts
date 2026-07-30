/**
 * Module-level context holder for the shipbuilding extension.
 * Populated once by init(api) in index.ts; read by all shipbuilding sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { ExtensionAPI } from "../hostTypes";
import type { ShipHull, ShipyardQueueEntry, SurplusShipyardQueueEntry } from "./generators/shipyardQueueTypes";

let _api: ExtensionAPI | null = null;

export interface ShipbuildingRuntimeState {
  queues: Record<number, ShipyardQueueEntry>;
  surplusQueues: Record<number, SurplusShipyardQueueEntry>;
  stateTechPoints: Record<number, number>;
  completedHulls: Record<string, number>;
  hulls: Record<number, ShipHull>;
  nextHullId: number;
}

const fallbackRuntimeState: ShipbuildingRuntimeState = createRuntimeState();

function createRuntimeState(): ShipbuildingRuntimeState {
  return { queues: {}, surplusQueues: {}, stateTechPoints: {}, completedHulls: {}, hulls: {}, nextHullId: 1 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRuntimeState(value: unknown): value is ShipbuildingRuntimeState {
  return (
    isRecord(value) &&
    isRecord(value.queues) &&
    isRecord(value.surplusQueues) &&
    isRecord(value.stateTechPoints) &&
    isRecord(value.completedHulls) &&
    isRecord(value.hulls) &&
    typeof value.nextHullId === "number"
  );
}

/** Serializable queue, hull and tech state owned by the Shipbuilding extension slice. */
export function getShipbuildingRuntimeState(): ShipbuildingRuntimeState {
  const simulation = _api?.simulationContext;
  if (!simulation?.extensions) return fallbackRuntimeState;
  const slice = simulation.extensions.shipbuilding ?? {};
  simulation.extensions.shipbuilding = slice;
  const existing = slice.runtimeState;
  if (isRuntimeState(existing)) return existing;
  const runtimeState = createRuntimeState();
  slice.runtimeState = runtimeState;
  return runtimeState;
}

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
