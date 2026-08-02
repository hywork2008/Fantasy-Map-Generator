/**
 * Dependency-free types for market flow budgets / A0 diagnostics.
 * Kept separate so economyContext can store history without importing generators
 * that themselves import economyContext (madge cycle).
 */

/** One market×good observation for a single production cycle. */
export type MarketGoodCycleSample = {
  marketId: number;
  goodId: number;
  /** Local demand this cycle (consumer + industrial). */
  cycleDemand: number;
  /**
   * Net production credited this cycle (rural + burg + industrial nets).
   * May be estimated from stock deltas when exact ledgers are unavailable.
   */
  cycleProduction: number;
  /** Units booked as market→market export deals this cycle. */
  cycleExport: number;
  /** Units booked as market→market import deals this cycle. */
  cycleImport: number;
  /** Retail stock after production, trade booking, and demand fill. */
  endStock: number;
  cargoSlotsPerUnit: number;
  monthsOfCover?: number;
};

export type CaravanUtilizationStats = {
  count: number;
  meanUtilization: number;
  medianUtilization: number;
  shareUnder10pct: number;
  shareUnder20pct: number;
  totalUsedSlots: number;
  totalCapacitySlots: number;
};

export type FlowCycleSnapshot = {
  /** Monotonic cycle index (0-based within a session). */
  cycleIndex: number;
  year: number;
  month: number;
  day: number;
  samples: MarketGoodCycleSample[];
  caravanUtilization?: CaravanUtilizationStats;
};
