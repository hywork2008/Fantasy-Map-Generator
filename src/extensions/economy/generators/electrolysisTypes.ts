/**
 * Electrolytic State capital equipment: ElectrolysisPlant (the sole supply route for Aluminum)
 * and its sibling ChlorAlkaliPlant (a third supply route for Chlorine/Caustic Soda, alongside
 * their craft-worker recipes and — for Chlorine only — the Deacon-process ChlorinePlants).
 * Design: docs/plan/electrolytic-industry-vertical-slice.md §3.7,
 * docs/plan/chlor-alkali-electrolysis-vertical-slice.md §3.7.
 *
 * A separate file from steelConverterTypes.ts/electricalTypes.ts/chemistryTypes.ts: both types
 * here are the electrolytic-reduction domain (electricity substituting for a thermal/chemical
 * process), not ferrous metallurgy, electrical engineering, or the Deacon/causticization
 * chemistry chemistryTypes.ts already covers. Same minimal shape as SteelConverterPlant/
 * PowerStation — no ChemistryTrial indirection, same reasoning as modern-steelmaking-and-
 * high-pressure-apparatus.md §7 decision 2.
 */

/** Shared by ElectrolysisPlant and ChlorAlkaliPlant — both electrolytic capital equipment with
 *  the same three failure modes (material stock, Market.electricityStock coverage, treasury). */
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

/**
 * Brine electrolysis: Salt + Firebrick (cell lining) + Market.electricityStock coverage, same
 * two-constraint utilization shape as ElectrolysisPlant. Co-produces Chlorine and Caustic Soda
 * from a single reaction — the first true co-product capital-equipment module in the economy
 * (docs/plan/chlor-alkali-electrolysis-vertical-slice.md §3.1). Reuses ElectrolysisFailureReason
 * rather than declaring an identical sibling union.
 */
export interface ChlorAlkaliPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  lastFailureReason?: ElectrolysisFailureReason;
}
