export interface QuarryOperation {
  i: number;
  burgId: number;
  marketId: number;
  quarryWorkers: number;
  stoneRatio: number;
  marbleRatio: number;
  /**
   * 0..1 EWMA of annual construction-technology investment coverage (docs/plan/
   * urban-construction-industry.md §3.4, not yet implemented — Phase 3). Undefined is
   * treated as 0, mirroring MineOperation.toolsInvestmentStock.
   */
  toolsInvestmentStock?: number;
  annualOutputTons: { stone?: number; marble?: number };
  active: boolean;
}
