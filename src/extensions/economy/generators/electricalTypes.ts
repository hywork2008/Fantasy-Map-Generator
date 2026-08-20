/**
 * Coal-fired power stations and telegraph lines — State-funded capital assets that back the
 * generatorAndMotor / electricTelegraph technology nodes.
 * Design: docs/plan/electric-power-and-telegraph.md §3.9.
 *
 * A separate file from chemistryTypes.ts/steelConverterTypes.ts: this is the electrical
 * engineering domain, not chemistry/medicine or metallurgy. Same minimal shape as
 * SteelConverterPlant — no ChemistryTrial indirection, same reasoning as
 * modern-steelmaking-and-high-pressure-apparatus.md §7 decision 2.
 */

export type PowerFailureReason = "materialShortage" | "fundingCut";

/**
 * Coal-only (hydro is out of scope, §1 non-goal). generationCapacity is recomputed every settled
 * year as a flow, not accumulated like a Good stock — Electricity is a capacity service, not a
 * market inventory.
 */
export interface PowerStation {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  generationCapacity: number;
  lastFailureReason?: PowerFailureReason;
}

/** No generationCapacity — the effect of a telegraph line is the electricTelegraph technology
 *  stage itself (docs/plan/electric-power-and-telegraph.md §3.12), not a per-line output. */
export interface TelegraphLine {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  lastFailureReason?: PowerFailureReason;
}
