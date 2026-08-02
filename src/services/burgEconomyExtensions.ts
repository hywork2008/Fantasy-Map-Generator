export interface BurgEconomySummary {
  production: string;
  wealth: string;
  treasury: string;
  /** Human-readable share of the burg's residents supported by imported food. */
  foodImportDependency: string;
  /**
   * Basic (administration + mining + smelting + trade) and derived service employment demand,
   * in adult-worker points (docs/plan/urban-employment-demand.md §3.1/§3.5). "—" when the
   * economy extension has not yet computed this burg's basicEmploymentSummary (e.g. no basic
   * industry present, or before the first annual reconciliation).
   */
  basicEmploymentDemand: string;
  serviceEmploymentDemand: string;
  /**
   * Housing ledger (docs/plan/urban-housing-system.md): built dwellings / required, gap %.
   * "—" when the burg has no ConstructionOperation (fort, no market, economy disabled).
   */
  dwellings: string;
  housingGap: string;
}

export const burgEconomyExtensions: {
  getBurgEconomySummary?: (burgId: number) => BurgEconomySummary | null;
} = {};
