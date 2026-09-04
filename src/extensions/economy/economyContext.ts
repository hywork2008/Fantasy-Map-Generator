/**
 * Module-level context holder for the economy extension.
 * Populated once by init(api) in index.tsx; read by all economy sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 *
 * The implementation lives in `./context/*`, one module per domain. This file is a re-export
 * barrel and nothing else: every name it exported before the split is still exported from here,
 * so no call site changed. Add new accessors to the domain module they belong to — `export *`
 * picks them up automatically. `./context/economyApi` is re-exported by an explicit list instead,
 * because its slice helpers (`getSliceArray`, `yearFromSlice`, …) are shared plumbing for the
 * other context modules, not part of this extension's public surface.
 *
 * docs/plan/economy-coupling-audit.md T3.
 */

export * from "./context/agriculture";
export * from "./context/annualGates";
export * from "./context/cellTables";
export {
  addFrontierApplicants,
  clearEconomyContext,
  getApi,
  getAppServices,
  getDamsLayer,
  getGoodsLayer,
  getLeveesLayer,
  getMarketsFillLayer,
  getMarketsLayer,
  getMineralDepositsLayer,
  getSimulationContext,
  getSimulationDay,
  getSimulationMonth,
  getSimulationYear,
  getTradeAnimLayer,
  getViewContext,
  getWorldContext,
  initEconomyContext,
  isEconomyContextReady
} from "./context/economyApi";
export * from "./context/fiscal";
export * from "./context/industry";
export * from "./context/knowledge";
export * from "./context/population";
export * from "./context/settlements";
export * from "./context/trade";
