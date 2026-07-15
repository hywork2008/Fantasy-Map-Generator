import { create } from "zustand";
import type { HeightmapTemplateRandomization } from "../data";
import type { ConflictAutonomy } from "../types/WorldState";

export interface OptionsState {
  // Map settings
  mapWidth: number;
  mapHeight: number;
  seed: string;
  points: number;
  mapName: string;
  year: number;
  era: string;
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
  demographicBirthRate: number;
  demographicChildMortalityRate: number;
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
  transparency: number;
  autosaveInterval: number;
  onloadBehavior: string;
  azgaarAssistant: "show" | "hide";
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
  dangerRenderingMode: "contour" | "choropleth";
  /** Contour = density heatmap; choropleth = per-cell battlefield intensity. */
  combatDeathsRenderingMode: "contour" | "choropleth";

  // Actions
  setOption: <K extends keyof Omit<OptionsState, "setOption">>(key: K, value: OptionsState[K]) => void;
  setOptions: (updates: Partial<Omit<OptionsState, "setOption" | "setOptions">>) => void;
}

export const useOptionsState = create<OptionsState>(set => ({
  mapWidth: 960,
  mapHeight: 540,
  seed: "",
  points: 4, // 10K cells
  mapName: "",
  year: 100,
  era: "Era",
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
  demographicBirthRate: 0.25,
  demographicChildMortalityRate: 0.2,
  simDemographics: true,
  simManpower: true,
  simAgriculture: true,
  simMilitaryRecovery: true,
  femaleLevyEnabled: false,
  recruitQualityEnabled: true,
  conflictAutonomy: "autonomous",
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

  populationRate: 1000,
  distanceScale: 3,
  urbanization: 1,
  urbanDensity: 10,

  uiSize: 1,
  tooltipSize: 14,
  themeColor: "#997787",
  transparency: 5,
  autosaveInterval: 15,
  onloadBehavior: "random",
  azgaarAssistant: "show",
  speakerVoice: "",
  emblemShape: "culture",
  temperatureScale: localStorage.getItem("temperatureScale") ?? "°C",

  distanceUnit: localStorage.getItem("distanceUnit") ?? "km",
  heightUnit: localStorage.getItem("heightUnit") ?? "m",
  areaUnit: localStorage.getItem("areaUnit") ?? "square",
  weightUnit: localStorage.getItem("weightUnit") ?? "kg",
  heightExponent: Number(localStorage.getItem("heightExponent") ?? 1.8),

  zoomExtentMin: 1,
  zoomExtentMax: 20,

  shapeRendering: "optimizeSpeed",
  rescaleLabels: true,
  hideLabels: false,
  populationRenderingMode: "choropleth",
  dangerRenderingMode: "contour",
  combatDeathsRenderingMode: "contour",

  setOption: (key, value) => set({ [key]: value }),
  setOptions: updates => set(updates)
}));
