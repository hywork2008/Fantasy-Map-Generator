/**
 * Extension API handle, simulation clock, and the shared economy-slice plumbing every other
context module is built on. This module owns `_api`, so it must stay a single module: the blob-URL
load path would otherwise hand sub-modules their own copy of it.
 *
 * Split out of the former single 2,452-line `economyContext.ts`, which had grown into a
 * 410-export module every one of this extension's ~180 files imported. `economyContext.ts` is now
 * a re-export barrel over these domain modules, so the public API is unchanged and no call site
 * moved. docs/plan/economy-coupling-audit.md T3.
 */

/**
 * Module-level context holder for the economy extension.
 * Populated once by init(api) in index.tsx; read by all economy sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type { ExtensionAPI } from "../../../types/extension-api";
import { addFrontierApplicants as addFrontierApplicantsToPool } from "../../hostCore";
import type { ProductionRecord } from "../generators/productionRecordTypes";

/**
 * Teardown hooks for the module-scope fallbacks the domain context modules hold. They exist only
 * for tests and headless callers that never install a simulation slice; live code always reads
 * through the slice. Registered at module evaluation time, which the `economyContext.ts` barrel
 * guarantees by re-exporting every domain module.
 */
const _fallbackResets: (() => void)[] = [];

export function registerContextFallbackReset(reset: () => void): void {
  _fallbackResets.push(reset);
}

let _api: ExtensionAPI | null = null;

export function initEconomyContext(api: ExtensionAPI): void {
  _api = api;
}

/**
 * Drops the API handle and every module-scope fallback the context modules keep for tests that
 * run without a simulation slice. Each domain module registers its own reset (see
 * `registerContextFallbackReset`) rather than being listed here, so a new fallback cannot be
 * added and then silently left out of the teardown.
 */
export function clearEconomyContext(): void {
  _api = null;
  for (const reset of _fallbackResets) reset();
}

export function getApi(): ExtensionAPI {
  if (!_api) throw new Error("[economy] Extension context not initialized — call init(api) first");
  return _api;
}

/**
 * True once init(api) has run. For cross-extension reads only (e.g. Nobility's
 * commanderPowerMultiplier reading getMartialDisciplineMultiplier, docs/plan/
 * knowledge-guild-system.md §9 Phase 5) — those callers may run before, or entirely without,
 * this extension's own init having been called (economy disabled, or a Nobility unit test that
 * only sets up its own context), and must degrade to "no bonus" instead of throwing. Economy's
 * own modules should keep using getApi()/getWorldContext() directly so a real init-ordering bug
 * still throws loudly.
 */
export function isEconomyContextReady(): boolean {
  return _api !== null;
}

export function getWorldContext() {
  return getApi().worldContext;
}

/**
 * Live simulation year/month. Falls back to generation options only when a
 * minimal test double omits simulationContext.
 */
export function getSimulationYear(): number {
  const year = _api?.simulationContext?.currentYear;
  if (typeof year === "number" && Number.isFinite(year)) return year;
  return Number(getWorldContext().options?.year) || 0;
}

export function getSimulationMonth(): number {
  const month = _api?.simulationContext?.currentMonth;
  if (typeof month === "number" && Number.isFinite(month) && month >= 1 && month <= 12) return month;
  const fallback = Number(getWorldContext().options?.month);
  return Number.isFinite(fallback) && fallback >= 1 && fallback <= 12 ? fallback : 1;
}

export function getSimulationDay(): number {
  const day = _api?.simulationContext?.currentDay;
  if (typeof day === "number" && Number.isFinite(day) && day >= 1) return Math.floor(day);
  const fallback = Number(getWorldContext().options?.day);
  return Number.isFinite(fallback) && fallback >= 1 ? Math.floor(fallback) : 1;
}

/** Live simulation context (wilderness cull projects, clock). Null only in minimal tests. */
export function getSimulationContext() {
  return _api?.simulationContext ?? null;
}

/**
 * Hands displaced adults to the host's (extension-agnostic) frontier applicant pool instead of
 * economy-only bookkeeping, so `advanceFrontierExpansion` can draw on them directly
 * (docs/plan/megacity-food-import-economy.md §4.1).
 */
export function addFrontierApplicants(stateId: number, maleAdults: number, femaleAdults: number): void {
  const frontier = _api?.simulationContext?.frontier;
  if (!frontier) return;
  addFrontierApplicantsToPool(frontier, stateId, maleAdults, femaleAdults);
}

export type EconomySlice = Record<string, unknown>;

/**
 * The economy extension's namespaced simulation slice, created on first access.
 * Returns null when `simulationContext` isn't provided (e.g. minimal `ExtensionAPI` test
 * doubles) — callers fall back to `pack`/`pack.cells` directly, mirroring
 * `getProductionTable()`'s fallback above.
 */
export function getEconomySlice(): EconomySlice | null {
  const simulation = _api?.simulationContext;
  if (!simulation) return null;
  if (!simulation.extensions) simulation.extensions = {};
  const existing = simulation.extensions.economy;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) return existing as EconomySlice;
  const slice: EconomySlice = {};
  simulation.extensions.economy = slice;
  return slice;
}

export function getLegacyPackFields(): Record<string, unknown> {
  return getWorldContext().pack as unknown as Record<string, unknown>;
}

export function getLegacyCellFields(): Record<string, unknown> {
  return getWorldContext().pack.cells as unknown as Record<string, unknown>;
}

export function getSliceArray<T>(field: string): T[] {
  const slice = getEconomySlice();
  const value = slice ? slice[field] : getLegacyPackFields()[field];
  return Array.isArray(value) ? (value as T[]) : [];
}

export function setSliceArray<T>(field: string, value: readonly T[]): void {
  const slice = getEconomySlice();
  if (slice) {
    slice[field] = value;
    return;
  }
  getLegacyPackFields()[field] = value;
}

export function getSliceNumber(field: string): number {
  const slice = getEconomySlice();
  const value = slice ? slice[field] : getLegacyPackFields()[field];
  return typeof value === "number" ? value : 0;
}

export function setSliceNumber(field: string, value: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice[field] = value;
    return;
  }
  getLegacyPackFields()[field] = value;
}

export function getSliceCellColumn(field: string): Uint16Array {
  const slice = getEconomySlice();
  const value = slice ? slice[field] : getLegacyCellFields()[field];
  return value instanceof Uint16Array ? value : new Uint16Array();
}

export function setSliceCellColumn(field: string, value: Uint16Array): void {
  const slice = getEconomySlice();
  if (slice) {
    slice[field] = value;
    return;
  }
  getLegacyCellFields()[field] = value;
}

export function getSliceFloat32Column(
  field: string,
  fallback: Float32Array<ArrayBufferLike>
): Float32Array<ArrayBufferLike> {
  const slice = getEconomySlice();
  const value = slice?.[field];
  return value instanceof Float32Array ? value : fallback;
}

export function setSliceFloat32Column(
  field: string,
  value: Float32Array<ArrayBufferLike>,
  setFallback: (value: Float32Array<ArrayBufferLike>) => void
): void {
  const slice = getEconomySlice();
  if (slice) {
    slice[field] = value;
    return;
  }
  setFallback(value);
}

export function yearFromSlice(field: string, fallback: number | null): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice[field];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return fallback;
}

export function writeYearToSlice(field: string, year: number, assignFallback: (value: number) => void): void {
  const slice = getEconomySlice();
  if (slice) {
    slice[field] = year;
    return;
  }
  assignFallback(year);
}

export function getViewContext() {
  return getApi().viewContext;
}

export function getAppServices() {
  return getApi().appServices;
}

export function getGoodsLayer() {
  return getApi().getSvgLayer("goods");
}

export function getMarketsLayer() {
  return getApi().getSvgLayer("marketsLayer");
}

export function getMarketsFillLayer() {
  return getApi().getSvgLayer("marketsLayerFill");
}

export function getTradeAnimLayer() {
  return getApi().getSvgLayer("tradeAnimation");
}

export function getMineralDepositsLayer() {
  return getApi().getSvgLayer("mineralDeposits");
}

export function getDamsLayer() {
  return getApi().getSvgLayer("dams");
}

export function getLeveesLayer() {
  return getApi().getSvgLayer("levees");
}

/**
 * The `productionByBurg` sub-slice, created on demand. Reaches `_api` nullsafely rather than
 * through `getApi()` so a caller with no simulation context gets null instead of a throw —
 * which is why it lives here with the other `_api` readers rather than beside its accessors.
 */
export function getProductionTable(): Record<number, ProductionRecord[]> | null {
  const simulation = _api?.simulationContext;
  if (!simulation?.extensions) return null;
  const economy = simulation.extensions.economy ?? {};
  simulation.extensions.economy = economy;
  const existing = economy.productionByBurg;
  if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
    return existing as Record<number, ProductionRecord[]>;
  }
  const productionByBurg: Record<number, ProductionRecord[]> = {};
  economy.productionByBurg = productionByBurg;
  return productionByBurg;
}
