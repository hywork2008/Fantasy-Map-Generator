export interface SmelterOperation {
  i: number;
  depositId: number;
  cell: number;
  burgId: number;
  marketId: number;
  waterPower: number;
  fuelAccess: number;
  technology: number;
  /**
   * 0..1 EWMA of annual Tools investment coverage, independent of `technology`
   * (docs/plan/rural-agtech-investment.md §6.2). Undefined (pre-Phase-2 saves/fixtures) is 0.
   */
  toolsInvestmentStock?: number;
  smeltingYield: number;
  annualCapacityTons: number;
  /** Actual employed adults, a subset of the owning Burg's population (docs/plan/urban-employment-demand.md §0). */
  workers: number;
  /** Configured share (0..1) of the site's maximum state-funded security. */
  securityInvestment: number;
  /** Treasury actually paid for this site's security in the latest production month. */
  lastSecurityUpkeep: number;
  /** Ingot units stolen before they reached the market in the latest production month. */
  lastTheftLoss: number;
  /** Highest per-batch theft probability used in the latest production month. */
  lastTheftRisk: number;
  active: boolean;
}
