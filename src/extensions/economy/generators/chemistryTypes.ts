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
  | "chlorinePlant"
  | "mercuryPlant"
  | "oilRefineryPlant"
  | "lngPlant";

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

/**
 * Same shape as AcidPlant/PhosphateFertilizerPlant — cinnabar roasting is a genuinely chemical
 * process (mercury-vapor condensation), so it uses the ChemistryTrial indirection.
 * `contamination` is the "MercuryContaminationStock" roadmap §9.5 requires: an unavoidable,
 * monotonically-accumulating byproduct of every operating year (never reduced by avoiding
 * production — only partially relieved by a funded containment shutdown; see mercuryPlants.ts).
 * Design: docs/plan/cinnabar-mercury-vertical-slice.md §3.6-3.7.
 */
export interface MercuryPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  /** 0..1 cumulative local health/environment debt. */
  contamination: number;
}

/**
 * Same shape as PhosphateFertilizerPlant/SyntheticAmmoniaPlant. Unlike MercuryPlant, this plant
 * yields two Goods (Kerosene bulk + Lubricating Oil byproduct) from one Crude Oil input — the
 * first two-output plant in this economy. No contamination-style debt field — roadmap §10 does
 * not require one for refining, unlike §9.5's Mercury.
 * Design: docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.6-3.7.
 */
export interface OilRefineryPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
}

/**
 * Same shape as OilRefineryPlant, minus the second output — a cryogenic liquefaction plant that
 * turns Natural Gas into the single Good LNG. Design: docs/plan/natural-gas-lng-power-
 * generation.md §3.7-3.8.
 */
export interface LNGPlant {
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
