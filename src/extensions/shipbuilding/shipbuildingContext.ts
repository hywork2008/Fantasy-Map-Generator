/**
 * Module-level context holder for the shipbuilding extension.
 * Populated once by init(api) in index.ts; read by all shipbuilding sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { ExtensionAPI, SimulationExtensionAPI } from "../hostTypes";
import type {
  MerchantHullOrder,
  ShipHull,
  ShipyardQueueEntry,
  SurplusShipyardQueueEntry
} from "./generators/shipyardQueueTypes";

let _api: SimulationExtensionAPI | null = null;

export interface ShipbuildingRuntimeState {
  queues: Record<number, ShipyardQueueEntry>;
  surplusQueues: Record<number, SurplusShipyardQueueEntry>;
  stateTechPoints: Record<number, number>;
  completedHulls: Record<string, number>;
  hulls: Record<number, ShipHull>;
  nextHullId: number;
  /**
   * Hulls Economy asked for, by ordering market, for sea trade it could not book
   * (docs/plan/long-distance-merchant-reach-capital.md §17). The nearest merchant yard's next hull
   * goes to `homeBurgId`. Absent in older saves.
   */
  merchantHullOrders?: Record<number, MerchantHullOrder>;
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

export function initShipbuildingContext(api: SimulationExtensionAPI): void {
  _api = api;
}

export function clearShipbuildingContext(): void {
  _viewApi = null;
  _api = null;
}

/**
 * The full browser API, bound by the UI entry (index) after the simulation entry has set the
 * context. Only UI code (controllers, renderers, dialogs) may use it; the simulation core never
 * does, so it runs without a view (docs/plan/simulation-core-separation.md §7).
 */
let _viewApi: ExtensionAPI | null = null;

export function bindShipbuildingView(api: ExtensionAPI | null): void {
  _viewApi = api;
}

export function getViewApi(): ExtensionAPI {
  if (!_viewApi) throw new Error("[shipbuilding] View API not bound — the UI entry has not run");
  return _viewApi;
}

/** The view API when a UI is attached, otherwise null (headless runs, isolated tests). */
export function getOptionalViewApi(): ExtensionAPI | null {
  return _viewApi;
}

export function getApi(): SimulationExtensionAPI {
  if (!_api) throw new Error("[shipbuilding] Extension context not initialized — call init(api) first");
  return _api;
}

export function getWorldContext() {
  return getApi().worldContext;
}

/** Historical period, or undefined before init (unit tests drive the queue without an API). */
export function getHistoricalPeriodIfReady(): string | undefined {
  return _api?.worldContext.options?.historicalPeriod;
}

export function getShipyardsLayer() {
  return getViewApi().getSvgLayer("shipyards");
}
