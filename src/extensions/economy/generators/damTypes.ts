/**
 * River dams: geographic siting plus the State capital asset built on it, for flood control and
 * (once generatorAndMotor is known) hydroelectric power.
 * Design: docs/plan/dam-flood-control-and-hydropower.md §3.
 *
 * Two-layer shape borrowed from mineralResources.ts/mineOperations.ts: DamSite is a deterministic
 * geographic candidate generated once (like MineralDeposit), Dam is the State-funded capital asset
 * built on a site (like MineOperation), settled annually. No lake/reservoir is modeled — a dam is a
 * point on the river cell itself, in the same spirit as FrontierFort's chokepoint siting.
 */

export interface DamSite {
  i: number;
  cell: number;
  x: number;
  y: number;
  riverId: number;
  /** 0..1, normalized cells.fl at this cell. Higher means more hydroelectric potential. */
  dischargePotential: number;
  /** 0..1, normalized elevation drop to the next downstream river cell. A gorge/valley proxy. */
  headPotential: number;
  /** Combines dischargePotential and headPotential; ranks candidate sites within a State. */
  qualityScore: number;
  /** Downstream land river cells (via cells.riverDownstream), up to DOWNSTREAM_HOPS — the reach a
   *  dam here can raise floodProtectionByCell for. */
  downstreamCells: number[];
}

export type DamFailureReason = "materialShortage" | "fundingCut";

/**
 * Same shape as PowerStation/SteelConverterPlant — no ChemistryTrial indirection (§7 decision,
 * following modern-steelmaking-and-high-pressure-apparatus.md §7 decision 2 and
 * electric-power-and-telegraph.md §7 decision 2). Unlike PowerStation, a Dam has no name field —
 * matching PowerStation/TelegraphLine/SteelConverterPlant/MineOperation, none of which have one.
 */
export interface Dam {
  i: number;
  siteId: number;
  stateId: number;
  burgId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  /** True once this Dam's State reached generatorAndMotor >= known. Never reverts to false. */
  electrified: boolean;
  /** Same abstract unit as PowerStation.generationCapacity; PowerGridInvestment pools both. Only
   *  nonzero once electrified. */
  generationCapacity: number;
  /** 0..1. Used to raise floodProtectionByCell (a floor, not a replacement) at the site cell and
   *  its DamSite.downstreamCells. */
  floodProtectionRating: number;
  lastFailureReason?: DamFailureReason;
}
