import { create } from "zustand";
import type { HeightmapTemplateRandomization } from "../data";
import type { BiomeRegionProfile } from "../types/biomeRegion";
import type { ConflictAutonomy, InitialSettlementPattern } from "../types/WorldState";
import { DEFAULT_CONFLICT_AUTONOMY } from "../utils/conflictAutonomy";
import { DEFAULT_GOLD_TO_SILVER_RATE, DEFAULT_SILVER_TO_COPPER_RATE } from "../utils/currency";

export interface OptionsState {
  // Map settings
  mapWidth: number;
  mapHeight: number;
  seed: string;
  points: number;
  mapName: string;
  year: number;
  era: string;
  /**
   * Historical-technology backdrop for goods/military gating. Default "highMedieval" targets
   * ~1100-1300 Europe (pre-gunpowder) for fantasy-setting consistency.
   */
  historicalPeriod: "earlyMedieval" | "highMedieval" | "lateMedieval";
  template: string;
  /** Restricts unlocked random heightmap selection by the templates' mean land coverage. */
  templateRandomization: HeightmapTemplateRandomization;
  cultures: number;
  culturesSet: string;
  statesNumber: number;
  provincesRatio: number;
  sizeVariety: number;
  growthRate: number;
  manors: number;
  religionsNumber: number;
  stateLabelsMode: "auto" | "short" | "full";
  resolveDepressionsSteps: number;
  lakeElevationLimit: number;
  threatCalculation: "additive" | "max" | "nonlinear";
  /**
   * "simple" keeps the classic fixed field-army cap (MAX_FIELD_ARMIES in military-generator.ts).
   * "dynamic" opts into docs/plan/military-movement.md Phase 4: field armies can split off
   * ~150-troop detachments to react to a second simultaneous threat and merge back once it's
   * gone. Read live each movement tick by regimentMovement.ts, not a generation-time-only setting.
   */
  militaryHierarchy: "simple" | "dynamic";
  /** Default for newly generated maps; saved maps retain their value in WorldOptions. */
  gunpowderEraEnabled: boolean;
  initialPopulationSaturation: number;
  /** Initial settlement distribution; Phase 0 keeps "standard" behavior unchanged. */
  initialSettlementPattern: InitialSettlementPattern;
  /**
   * Target share (0–1) of suitable land capacity inside the oikoumene for non-standard
   * settlement patterns. Overrides the pattern preset's settledFootprint when set.
   * Higher → larger state-controlled area; lower → more wilderness / shorter interstate borders.
   * Fantasy defaults use ~0.45 (Marches). Ignored for `standard`.
   */
  oikoumeneLandShare: number;
  /** Biome regional profile for auto-assignment masks (Phase 3). */
  biomeRegionProfile: BiomeRegionProfile;
  demographicBirthRate: number;
  demographicChildMortalityRate: number;
  /** Display-only denomination: silver pieces represented by one gold piece. */
  goldToSilverRate: number;
  /** Display-only denomination: copper pieces represented by one silver piece. */
  silverToCopperRate: number;
  /**
   * Advance-time simulation feature toggles — skip expensive subsystems when OFF.
   * Day is the base unit; month/year buttons are multi-day loops of the same ticks.
   */
  /** Aging, births, migration, overpopulation starvation. */
  simDemographics: boolean;
  /** Male civilian ↔ under-arms ledger, draft/fill/demobilize, combat loss bookkeeping. */
  simManpower: boolean;
  /** Spring/autumn war → foodStress → famine deaths (+ Economy multipliers when enabled). */
  simAgriculture: boolean;
  /** Regiment a→t recovery / dead-regiment cleanup (uses manpower pool when simManpower). */
  simMilitaryRecovery: boolean;
  /**
   * "independent" is the classic behavior: each settlement grows toward its own capacity via
   * births only, with no deliberate rural→urban labor movement. "megacity" additionally runs
   * docs/plan/megacity-food-import-economy.md's rural labor release once a year: each rural
   * cell's labor-safety-margined surplus adults migrate toward nearby cities (Economy must be
   * enabled — this reads Food Ledger-derived `migratableAdults`). Still under active development;
   * default "independent" keeps existing saves' growth behavior unchanged.
   */
  ruralUrbanMigration: "independent" | "megacity";
  /**
   * When true (and simManpower on), scarce male pools may draft a limited share of adult
   * females (manpower-ecosystem Phase 5). Default off.
   */
  femaleLevyEnabled: boolean;
  /**
   * When true, new recruits dilute regiment.quality and combat power scales by quality.
   * Default on with the manpower ledger.
   */
  recruitQualityEnabled: boolean;
  /** Default for newly generated maps; the active map stores its value in WorldOptions. */
  conflictAutonomy: ConflictAutonomy;
  warFrequency: number;
  diplomacyHistoryAttempts: number;

  // Danger settings
  dangerRarity5Min: number;
  dangerRarity5Max: number;
  dangerRarity5Power: number;
  dangerRarity5Type: string;
  dangerRarity4Min: number;
  dangerRarity4Max: number;
  dangerRarity4Power: number;
  dangerRarity4Type: string;
  dangerRarity3Min: number;
  dangerRarity3Max: number;
  dangerRarity3Power: number;
  dangerRarity3Type: string;
  dangerRarity1Min: number;
  dangerRarity1Max: number;
  dangerRarity1Power: number;
  dangerRarity1Type: string;

  // World Configurator settings
  mapSize: number;
  latitude: number;
  longitude: number;
  prec: number;

  // Style
  stylePreset: string;

  // Generation growth/expansion rates
  neutralRate: number;
  statesGrowthRate: number;

  // World scale settings
  populationRate: number;
  distanceScale: number;
  urbanization: number;
  urbanDensity: number;

  // Tool settings
  uiSize: number;
  tooltipSize: number;
  themeColor: string;
  radarChartColor: string;
  transparency: number;
  autosaveInterval: number;
  onloadBehavior: string;
  azgaarAssistant: "show" | "hide";
  /** Shows the current map magnification in the lower-left corner. */
  showZoomLevel: boolean;
  speakerVoice: string;
  emblemShape: string;
  temperatureScale: string;

  // Units settings
  distanceUnit: string;
  heightUnit: string;
  areaUnit: string;
  weightUnit: string;
  heightExponent: number;

  // Zoom settings
  zoomExtentMin: number;
  zoomExtentMax: number;

  // Rendering settings
  shapeRendering: "crispEdges" | "optimizeSpeed" | "geometricPrecision";
  rescaleLabels: boolean;
  hideLabels: boolean;
  populationRenderingMode: "original" | "contour" | "choropleth";
  /** SVG-only heightmap visualization. WebGL Hybrid continues to use its deck.gl terrain renderer. */
  heightmapRenderingMode: "heatmap" | "contours" | "labeledContours";
  dangerRenderingMode: "contour" | "choropleth";
  /** Contour = density heatmap; choropleth = per-cell battlefield intensity. */
  combatDeathsRenderingMode: "contour" | "choropleth";

  // Actions
  setOption: <K extends keyof Omit<OptionsState, "setOption">>(key: K, value: OptionsState[K]) => void;
  setOptions: (updates: Partial<Omit<OptionsState, "setOption" | "setOptions">>) => void;
}

/** UI settings used when neither the store nor localStorage provides a user preference. */
export const DEFAULT_UI_OPTIONS = {
  uiSize: 1,
  tooltipSize: 14,
  themeColor: "rgb(109, 149, 201)",
  radarChartColor: "rgb(16, 72, 132)", // "#104884"
  transparency: 70,
  autosaveInterval: 15,
  onloadBehavior: "random",
  azgaarAssistant: "show" as const,
  // Keep the indicator available while developing map interactions without
  // changing the production UI by default.
  showZoomLevel: import.meta.env.DEV,
  speakerVoice: "",
  emblemShape: "culture",
  zoomExtentMin: 1,
  zoomExtentMax: 20
};

/** Default units, including values reset by the Units Editor. */
export const DEFAULT_UNIT_OPTIONS = {
  temperatureScale: "°C",
  distanceUnit: "km",
  heightUnit: "m",
  areaUnit: "square",
  weightUnit: "kg",
  heightExponent: 1.8
};

/** Default world-scale values reset by the Units Editor. */
export const DEFAULT_WORLD_SCALE_OPTIONS = {
  populationRate: 1000,
  distanceScale: 3,
  urbanization: 1,
  urbanDensity: 10
};

export const useOptionsState = create<OptionsState>(set => ({
  mapWidth: 960,
  mapHeight: 540,
  seed: "",
  points: 4, // 10K cells
  mapName: "",
  year: 100,
  era: "Era",
  historicalPeriod: "highMedieval",
  template: "highIsland",
  templateRandomization: "all",
  cultures: 12,
  culturesSet: "world",
  statesNumber: 15,
  provincesRatio: 20,
  sizeVariety: 4,
  growthRate: 1,
  manors: 1000,
  religionsNumber: 6,
  stateLabelsMode: "auto",
  resolveDepressionsSteps: 250,
  lakeElevationLimit: 20,
  threatCalculation: "additive",
  militaryHierarchy: "simple",
  gunpowderEraEnabled: false,
  initialPopulationSaturation: 60,
  initialSettlementPattern: "standard",
  oikoumeneLandShare: 0.45,
  biomeRegionProfile: "global",
  demographicBirthRate: 0.25,
  demographicChildMortalityRate: 0.2,
  goldToSilverRate: DEFAULT_GOLD_TO_SILVER_RATE,
  silverToCopperRate: DEFAULT_SILVER_TO_COPPER_RATE,
  simDemographics: true,
  simManpower: true,
  simAgriculture: true,
  simMilitaryRecovery: true,
  ruralUrbanMigration: "independent",
  femaleLevyEnabled: false,
  recruitQualityEnabled: true,
  conflictAutonomy: DEFAULT_CONFLICT_AUTONOMY,
  warFrequency: 1.0,
  diplomacyHistoryAttempts: 1,

  dangerRarity5Min: 1,
  dangerRarity5Max: 2,
  dangerRarity5Power: 50,
  dangerRarity5Type: "Calamity",
  dangerRarity4Min: 2,
  dangerRarity4Max: 4,
  dangerRarity4Power: 30,
  dangerRarity4Type: "Arch-Beast",
  dangerRarity3Min: 5,
  dangerRarity3Max: 10,
  dangerRarity3Power: 20,
  dangerRarity3Type: "Greater Monster",
  dangerRarity1Min: 20,
  dangerRarity1Max: 40,
  dangerRarity1Power: 5,
  dangerRarity1Type: "Beast",

  mapSize: 100,
  latitude: 50,
  longitude: 50,
  prec: 100,

  stylePreset: "default",

  neutralRate: 1,
  statesGrowthRate: 1,

  ...DEFAULT_WORLD_SCALE_OPTIONS,
  ...DEFAULT_UI_OPTIONS,
  temperatureScale: localStorage.getItem("temperatureScale") ?? DEFAULT_UNIT_OPTIONS.temperatureScale,

  distanceUnit: localStorage.getItem("distanceUnit") ?? DEFAULT_UNIT_OPTIONS.distanceUnit,
  heightUnit: localStorage.getItem("heightUnit") ?? DEFAULT_UNIT_OPTIONS.heightUnit,
  areaUnit: localStorage.getItem("areaUnit") ?? DEFAULT_UNIT_OPTIONS.areaUnit,
  weightUnit: localStorage.getItem("weightUnit") ?? DEFAULT_UNIT_OPTIONS.weightUnit,
  heightExponent: Number(localStorage.getItem("heightExponent") ?? DEFAULT_UNIT_OPTIONS.heightExponent),

  shapeRendering: "optimizeSpeed",
  rescaleLabels: true,
  hideLabels: false,
  populationRenderingMode: "choropleth",
  heightmapRenderingMode: "labeledContours",
  dangerRenderingMode: "contour",
  combatDeathsRenderingMode: "contour",

  setOption: (key, value) => {
    // A lock is represented by a localStorage entry bearing the option key.
    // Keep that entry current when a user changes an already locked setting;
    // otherwise the old value would be restored on the next page load.
    if (localStorage.getItem(key) !== null) localStorage.setItem(key, String(value));
    set({ [key]: value });
  },
  setOptions: updates => {
    // Preset controls can update several options together. Apply the same
    // invariant as setOption to each value that already has a lock.
    for (const [key, value] of Object.entries(updates)) {
      if (localStorage.getItem(key) !== null) localStorage.setItem(key, String(value));
    }
    set(updates);
  }
}));
