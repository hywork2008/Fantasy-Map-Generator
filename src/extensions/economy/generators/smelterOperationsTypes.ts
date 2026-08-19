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

/**
 * Real-people headcount for a smelter site, authored independently of getSmelterRequiredWorkers()
 * (smelterOperations.ts, docs/plan/craft-demand-calibration.md §2.0 P3). Decoupled from the
 * population-point reconcile loop in basicEmployment.ts — used only for the closed-inventory
 * guild-metallurgy input (capped at GUILD_SITE_KNOWLEDGE_CAP_PEOPLE) and for Calibration Overview
 * display. Kept in this dependency-free types module (not smelterOperations.ts, which imports
 * guildKnowledge.ts for getGuildBonus) so guildKnowledge.ts can import it without a cycle.
 */
export const SMELTER_EMPLOYMENT_BASE_PEOPLE = 8;
export const SMELTER_EMPLOYMENT_PEOPLE_PER_ANNUAL_TON = 2.5;
/** Single-source guild-metallurgy coverage cap: 6/12 = 0.50 (docs/plan/craft-demand-calibration.md §2.0). */
export const GUILD_SITE_KNOWLEDGE_CAP_PEOPLE = 6;

export function getSmelterEmploymentPeople(smelter: Pick<SmelterOperation, "annualCapacityTons">): number {
  return SMELTER_EMPLOYMENT_BASE_PEOPLE + smelter.annualCapacityTons * SMELTER_EMPLOYMENT_PEOPLE_PER_ANNUAL_TON;
}
