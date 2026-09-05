/**
 * Mechanical cold-storage depots — State-funded capital assets that back the
 * mechanicalRefrigeration technology node's demonstrated/adopted thresholds and let a State's
 * surplus fresh-food harvest reach general Market stock instead of being silently lost.
 * Design: docs/plan/mechanical-refrigeration-and-cold-chain.md §3.4-3.5.
 *
 * A separate file from electricalTypes.ts: this is the mechanical/refrigeration engineering
 * domain (LNG-fueled compressors), not electrical engineering — same reasoning as
 * electricalTypes.ts itself being split out from chemistryTypes.ts/steelConverterTypes.ts.
 */

export type ColdStorageFailureReason = "materialShortage" | "fundingCut";

/**
 * LNG-fueled only (electric refrigeration is out of scope, §1 non-goal 3). storageCapacity is
 * recomputed every settled year as a flow, not accumulated like a Good stock. Unlike PowerStation/
 * powerGrid, this capacity is pooled State-wide from the start — no two-stage local/State-wide
 * abstraction (§3.5 decision 1).
 */
export interface ColdStorageDepot {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  storageCapacity: number;
  lastFailureReason?: ColdStorageFailureReason;
}
