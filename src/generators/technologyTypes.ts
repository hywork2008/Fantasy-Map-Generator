/**
 * Host-owned technology graph types.
 * Design: docs/plan/technology-development-roadmap.md §12.
 *
 * Stages separate knowing a principle from institutional adoption.
 * Progress is live simulation state (not a generation option) and is scoped
 * primarily to political states for era 0–5 nodes.
 */

export const TECHNOLOGY_STAGES = ["locked", "known", "demonstrated", "adopted", "diffused"] as const;
export type TechnologyStage = (typeof TECHNOLOGY_STAGES)[number];

export const TECHNOLOGY_SCOPES = ["burg", "state", "network"] as const;
export type TechnologyScope = (typeof TECHNOLOGY_SCOPES)[number];

/** Roadmap eras through early steam (5) and industrial chemistry (6). */
export type TechnologyEraBand = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TechnologyProgress {
  technologyId: string;
  scope: TechnologyScope;
  ownerId: number;
  stage: TechnologyStage;
  discoveredYear?: number;
  demonstratedYear?: number;
  adoptedYear?: number;
  /** 0..1 progress from adopted toward diffused (or network spread). */
  diffusion: number;
}

/**
 * Per-owner signal snapshot used by the annual evaluator.
 * Built from pack + optional extension slices without importing extension modules.
 */
export interface TechnologySignals {
  treasury: number;
  urbanPopulation: number;
  portCount: number;
  coastalBurgCount: number;
  mineCount: number;
  smelterWorkers: number;
  pyrotechnics: number;
  metallurgy: number;
  woodworking: number;
  printing: number;
  administration: number;
  masonry: number;
  gunpowderDemand: number;
  shipTechPoints: number;
  completedHulls: number;
  urbanWaterMaxTier: number;
  instruments: number;
  deepMineCount: number;
  coalMineCount: number;
  /** 0..1 derived drainage/investment pressure on active mines. */
  mineDrainagePressure: number;
  /** Consecutive viable steam-trial years in this state. */
  steamTrialYears: number;
  /** Fueled atmospheric steam installations on this state's mines. */
  steamInstallations: number;
  glassware: number;
  naturalPhilosophy: number;
  medicine: number;
  sulfurAccess: number;
  urbanSanitationPressure: number;
  epidemicPressure: number;
  battleWoundPressure: number;
  soapGlassPressure: number;
  gunpowderSulfurPressure: number;
  medicineDemandPressure: number;
  /** Reserved; computed in the sulfuric-acid phase. */
  foodFertilizerPressure: number;
  /** Reserved; computed in the sulfuric-acid phase. */
  lateChemistryDemandPressure: number;
  labVesselQuality: number;
  pumiceCoverage: number;
  pozzolanPractice: number;
  obsidianPractice: number;
  labGlassPracticeYears: number;
  apothecaryTrialYears: number;
  hospitalTrialYears: number;
  acidPlantTrialYears: number;
  hospitalInstallations: number;
  acidPlantInstallations: number;
  /** 0..1 market-stock coverage of Phosphate Rock, same shape as sulfurAccess. */
  phosphateRockAccess: number;
  /**
   * Consecutive documented-run years of a running ChemistryTrial(kind="phosphateFertilizerPlant"),
   * same shape as acidPlantTrialYears. See docs/plan/phosphate-fertilizer-vertical-slice.md §3.6-3.7.
   */
  phosphateFertilizerTrialYears: number;
  /** Count of active PhosphateFertilizerPlant entries, same shape as acidPlantInstallations. */
  phosphateFertilizerPlantCount: number;
  experimentRecord: number;
  urbanWaterMaxMunicipalSanitation: number;
  atWar: boolean;
  capitalPort: boolean;
}

export type TechnologySignalKey = keyof TechnologySignals;

export interface TechnologyThresholds {
  /** Minimum signal values that must all hold. */
  readonly min?: Partial<Record<TechnologySignalKey, number>>;
  /** Boolean signals that must be true when set. */
  readonly flags?: Partial<Record<"atWar" | "capitalPort", boolean>>;
}

export interface TechnologyDefinition {
  readonly id: string;
  readonly label: string;
  readonly era: TechnologyEraBand;
  readonly scope: TechnologyScope;
  readonly prerequisites: readonly string[];
  /** World-level gates (e.g. gunpowder must exist in this map). */
  readonly worldGates?: readonly ("gunpowderWorld" | "shipbuildingWorld")[];
  /** Starting profile: seeded as this stage for every valid owner at map init. */
  readonly startStage?: TechnologyStage;
  readonly known: TechnologyThresholds;
  readonly demonstrated: TechnologyThresholds;
  readonly adopted: TechnologyThresholds;
  /**
   * Years that must elapse at the previous stage before climbing.
   * Compressed by Options → Simulation technology development speed and
   * requirement ease (floor of requiredYears / speed / ease).
   */
  readonly minimumYearsAtPreviousStage?: Partial<Record<"known" | "demonstrated" | "adopted", number>>;
}

export interface TechnologySimulationState {
  /** Year of last successful annual evaluation (null before first run). */
  lastEvaluatedYear: number | null;
  progress: TechnologyProgress[];
}

export function createEmptyTechnologySimulationState(): TechnologySimulationState {
  return { lastEvaluatedYear: null, progress: [] };
}

const STAGE_RANK: Record<TechnologyStage, number> = {
  locked: 0,
  known: 1,
  demonstrated: 2,
  adopted: 3,
  diffused: 4
};

export function technologyStageRank(stage: TechnologyStage): number {
  return STAGE_RANK[stage];
}

export function isTechnologyStageAtLeast(stage: TechnologyStage, minimum: TechnologyStage): boolean {
  return STAGE_RANK[stage] >= STAGE_RANK[minimum];
}

export function progressKey(technologyId: string, scope: TechnologyScope, ownerId: number): string {
  return `${technologyId}:${scope}:${ownerId}`;
}
