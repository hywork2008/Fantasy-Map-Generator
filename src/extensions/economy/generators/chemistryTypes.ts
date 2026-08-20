/**
 * Chemistry / medicine workshops, trials, and civic medical-care rows.
 * Design: docs/plan/chemistry-medicine-knowledge-accumulation.md
 */

export type ChemistryTrialKind =
  | "compounding"
  | "laboratory"
  | "acidPlant"
  | "phosphateFertilizerPlant"
  | "syntheticAmmoniaPlant"
  | "chlorinePlant";

export type ChemistryFailureReason =
  | "materialShortage"
  | "contamination"
  | "invalidFormula"
  | "glassBreakage"
  | "fundingCut"
  | "pollutionLimit";

export interface ChemistryTrial {
  kind: ChemistryTrialKind;
  burgId: number;
  stateId: number;
  status: "building" | "running" | "failed" | "retired";
  operatingYears: number;
  documentedRuns: number;
  failureCount: number;
  lastFailureReason?: ChemistryFailureReason;
  inputsConsumed: number;
  outputsDelivered: number;
}

export interface ExperimentalWorkshop {
  burgId: number;
  sponsorStateId: number;
  active: boolean;
  researchers: number;
  annualBudget: number;
  experimentRecord: number;
  lastFundedYear: number;
}

export interface ApothecaryWorkshop {
  burgId: number;
  sponsorStateId: number;
  active: boolean;
  practitioners: number;
  annualBudget: number;
  compoundingRecord: number;
  lastFundedYear: number;
}

export interface HospitalInstallation {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  practitioners: number;
  condition: number;
  utilization: number;
  ratedCare: number;
  documentedRuns: number;
  lastFundedYear: number;
}

export interface AcidPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
}

/** Same shape as AcidPlant. Design: docs/plan/phosphate-fertilizer-vertical-slice.md §3.7. */
export interface PhosphateFertilizerPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
}

/**
 * Same shape as AcidPlant — a catalytic-oxidation (Deacon process) plant that turns Salt +
 * Sulfuric Acid into Chlorine, downstream of AcidPlants in the settle order.
 * Design: docs/plan/chlorine-production-vertical-slice.md §3.6.
 */
export interface ChlorinePlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
}

/**
 * Same shape as AcidPlant/PhosphateFertilizerPlant — a genuinely chemical-industry facility, so it
 * uses the ChemistryTrial indirection rather than SteelConverterPlant's self-held documentedRuns
 * (that exception is specific to the metallurgy domain, steelConverterTypes.ts).
 * Design: docs/plan/synthetic-ammonia-vertical-slice.md §3.6.
 */
export interface SyntheticAmmoniaPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
}

export interface ChemMedPracticeRecord {
  stateId: number;
  labGlassPracticeYears: number;
  pozzolanPractice: number;
  obsidianPractice: number;
  lastLabGlassYear?: number;
  lastPozzolanYear?: number;
  lastObsidianYear?: number;
}

export interface MedicalCareReliefRow {
  burgId: number;
  relief: number;
}
