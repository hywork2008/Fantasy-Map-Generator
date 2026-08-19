/**
 * Bessemer-converter steel plants — the second, State-funded supply route for the `Steel` Good.
 * Design: docs/plan/modern-steelmaking-and-high-pressure-apparatus.md §3.2.
 *
 * A separate file from chemistryTypes.ts: this is a metallurgy domain, not chemistry/medicine.
 */

export type SteelConverterFailureReason = "materialShortage" | "fundingCut";

/**
 * Same minimal shape as HospitalInstallation (chemistryTypes.ts): the plant holds its own
 * documentedRuns directly, with no ChemistryTrial indirection. A converter is not tied to a
 * specific mine, and unlike AcidPlant/PhosphateFertilizerPlant there is no shared trial-row
 * semantics to preserve across technologies.
 */
export interface SteelConverterPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  lastFailureReason?: SteelConverterFailureReason;
}
