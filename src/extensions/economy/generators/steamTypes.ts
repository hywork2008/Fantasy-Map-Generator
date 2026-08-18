/** Economy-owned atmospheric steam pump records (docs/plan/steam-industrial-implementation.md Phase 0). */

export type SteamPumpTrialStatus = "building" | "running" | "failed" | "retired";

export interface SteamPumpTrial {
  mineOperationId: number;
  burgId: number;
  stateId: number;
  status: SteamPumpTrialStatus;
  operatingYears: number;
  documentedRuns: number;
  fuelConsumed: number;
  maintenanceConsumed: number;
  lastOperatedYear: number;
  utilization: number;
}

export interface SteamInstallation {
  mineOperationId: number;
  technologyId: "atmosphericSteamPumping";
  installedYear: number;
  condition: number;
  utilization: number;
  lastFueledYear: number;
  annualCoalUsed: number;
  annualToolsUsed: number;
}

export interface RailwayLink {
  i: number;
  stateId: number;
  fromMarketId: number;
  toMarketId: number;
  utilization: number;
  lastFueledYear: number;
}

export interface SteamWaterworks {
  burgId: number;
  active: boolean;
  engines: number;
  condition: number;
  lastFueledYear: number;
  annualCoalUsed: number;
  utilization: number;
}
