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
  /**
   * Estimated new dwellings in the construction pipeline (labor-limited annual throughput).
   * "—" without a construction operation.
   */
  underConstruction: string;
  /** Mason + carpenter workers assigned to this burg (population points). */
  constructionWorkers: string;
  /**
   * Pregnancy observability (PR-P1): pregnant headcount and expected births lower bound / year.
   * "—" when no stock or economy disabled. Does not yet change demography (PR-P2).
   */
  pregnant: string;
  expectedBirths: string;
  /** Housing settlement value (replacement cost × fortification). "—" without a construction op. */
  settlementValue: string;
}

export const burgEconomyExtensions: {
  getBurgEconomySummary?: (burgId: number) => BurgEconomySummary | null;
} = {};
