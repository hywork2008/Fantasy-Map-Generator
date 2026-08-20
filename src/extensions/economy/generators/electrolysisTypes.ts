/**
 * Electrolytic reduction plants — the sole supply route for the Aluminum Good.
 * Design: docs/plan/electrolytic-industry-vertical-slice.md §3.7.
 *
 * A separate file from steelConverterTypes.ts/electricalTypes.ts: this is the electrolytic
 * metallurgy domain, not ferrous metallurgy or electrical engineering. Same minimal shape as
 * SteelConverterPlant/PowerStation — no ChemistryTrial indirection, same reasoning as
 * modern-steelmaking-and-high-pressure-apparatus.md §7 decision 2.
 */

export type ElectrolysisFailureReason = "materialShortage" | "powerShortage" | "fundingCut";

/**
 * Unlike SteelConverterPlant/ChlorinePlant, utilization is capped by two independent
 * constraints: Alumina/Coke/Firebrick market stock AND Market.electricityStock coverage
 * (§3.7) — the first State capital equipment in the economy to read the electricity capacity
 * service rather than only Good stock.
 */
export interface ElectrolysisPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  lastFailureReason?: ElectrolysisFailureReason;
}
