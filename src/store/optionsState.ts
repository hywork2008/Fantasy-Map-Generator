import { create } from "zustand";
import type { HeightmapTemplateRandomization } from "../data";
import {
  DEFAULT_RACE_PERSON_NAME_SPHERES,
  type RacePersonNameMapping,
  resolveRacePersonNameMapping
} from "../data/racePersonNameConfig";
import type { BiomeRegionProfile } from "../types/biomeRegion";
import type {
  ConflictAutonomy,
  EconomyStartMode,
  FrontierStartMode,
  InitialSettlementPattern
} from "../types/WorldState";
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
   * Historical-technology backdrop for water/sanitation tech ceilings and other period-flavored
   * generation choices (docs/plan/guns-era.md). Default "ageOfExploration" (~1450-1600 Europe)
   * — gunpowder-era Goods/military units are independently controlled by `gunpowderEraEnabled`
   * below and default enabled, so this period no longer needs to precede gunpowder content.
   */
  historicalPeriod: "earlyMedieval" | "highMedieval" | "lateMedieval" | "ageOfExploration";
  template: string;
  /** Restricts unlocked random heightmap selection by the templates' mean land coverage. */
  templateRandomization: HeightmapTemplateRandomization;
  cultures: number;
  culturesSet: string;
  /**
   * Race → person-name sphere (real-world name_base_id) for long-lived character names.
   * Applied when generating High/Dark Fantasy cultures (and any culture with raceKey).
   * Always persisted to localStorage as JSON (`racePersonNameSpheres`).
   */
  racePersonNameSpheres: RacePersonNameMapping;
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
   * How pack.cells.enclosure (harbor/mooring calmness, 0 = open sea, 100 = fully sheltered) is
   * scored for ocean-connected water cells. All three modes override every lake cell to fully
   * enclosed (100) except "radius" — OceanCurrentsModule never models lake current, so there's
   * no current-derived signal for a lake cell either mode-with-currents could use.
   * - "oceanCurrents": reads the resolved current speed at the cell itself
   *   (grid.cells.currentSpeed). Land-shape-responsive, but almost every cell touching land reads
   *   near-zero speed regardless of whether the shore is a sheltered bay or an exposed open
   *   coastline — a structural no-slip boundary-layer effect of the LBM solve — so this mode
   *   saturates most coastal water toward 100 and gives little spread for siting decisions
   *   right at the shoreline (e.g. harbor placement).
   * - "oceanCurrentsAmbient": reads grid.cells.ambientCurrentSpeed instead — currentSpeed
   *   smoothed across nearby ocean cells, so a coastal cell reflects the speed a short distance
   *   offshore rather than the boundary-layer value at the shore itself. Distinguishes a
   *   genuinely enclosed bay (still slow a few hops out) from an exposed coastline (picks up
   *   real open-water speed within a couple of hops) — the mode intended for shoreline siting
   *   decisions.
   * - "radius": the legacy fixed 6-hop land-blocked-ratio heuristic, left completely unmodified
   *   as a genuine point of comparison against both current-based modes.
   * See FeatureModule.applyOceanCurrentEnclosure() (features.ts) and
   * docs/simulation/ocean-currents.md §6.
   */
  enclosureCalculationMode: "oceanCurrents" | "oceanCurrentsAmbient" | "radius";
  /**
   * How the "Ocean Currents" WebGL layer (toggleOceanCurrents) visualizes grid.cells.currentAngle/
   * currentSpeed. "path" draws a short directional line segment per ocean cell, colored by
   * waterTemp — skips any cell reading exactly 0 speed entirely (nothing to draw), so a calm patch
   * is visually indistinguishable from a gap. "intensity" instead fills every ocean cell's polygon
   * by currentSpeed alone (pale = calm, dark = strong), giving full, gapless coverage — useful for
   * spotting continuous calm/rough regions a sparse arrow field can hide. See
   * buildOceanCurrentPaths()/buildOceanCurrentIntensityPolygons() (deckDataAdapters.ts).
   */
  oceanCurrentRenderMode: "path" | "intensity";
  /**
   * "simple" keeps the classic fixed field-army cap (MAX_FIELD_ARMIES in military-generator.ts).
   * "dynamic" opts into docs/plan/military-movement.md Phase 4: field armies can split off
   * ~150-troop detachments to react to a second simultaneous threat and merge back once it's
   * gone. Read live each movement tick by regimentMovement.ts, not a generation-time-only setting.
   */
  militaryHierarchy: "simple" | "dynamic";
  /**
   * Default for newly generated maps; saved maps retain their value in WorldOptions.
   * Defaults `true` (docs/plan/guns-era.md 2026-08-14 addendum) so Gunpowder/Artillery/Sulfur/
   * Bullets and the "artillery" military unit are visible and producing out of the box —
   * flip off in Military Options to restore the original gunpowder-free default.
   */
  gunpowderEraEnabled: boolean;
  /**
   * New maps normally treat existing firearm units as already equipped. Enable this to begin
   * Muskets and Artillery at zero serviceable units and procure them through the economy.
   */
  initialFirearmsUnstocked: boolean;
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
  /**
   * Foundation-map starting realm size in cells (1 = capital only, 30 = compact
   * core). Oikoumene land share still decides how much countryside is populated.
   * Ignored for `standard`.
   */
  initialPolityRealmSize: number;
  /**
   * Frontier opening story. Ignored unless `initialSettlementPattern` is
   * `frontier`. See docs/simulation/frontier-start-modes.md.
   */
  frontierStartMode: FrontierStartMode;
  /** Biome regional profile for auto-assignment masks (Phase 3). */
  biomeRegionProfile: BiomeRegionProfile;
  /**
   * Chance (0-100%) that a single, dominant Hill placement during heightmap generation
   * (count === 1, rolled height >= VolcanoConstants.MIN_PEAK_HEIGHT — see data/constants.ts)
   * becomes a tagged volcanic peak instead of an ordinary mountain. Checked once per qualifying
   * Hill call; most maps end up with only a handful of eligible calls, so even a high value
   * rarely produces more than a few volcanoes. 0 disables volcano tagging entirely.
   */
  volcanismChance: number;
  /**
   * Of the volcanic peaks actually rolled (see volcanismChance), the % flagged "active"
   * (molten `lavaField` crater) rather than dormant (bare `volcanicBarrens` cone whose summit
   * is carved into a crater lake). Read once per tagged volcano at generation time.
   */
  volcanoActiveChance: number;
  /**
   * How aggressively the fertile `volcanicSoil` ring around a volcano's flanks overrides the
   * ordinary climate biome, 0-100. 0 collapses the ring into the barren crater biome only; 100
   * extends it far down the flank. Read by biome assignment (see biomeAssignment.ts's
   * volcanicSoilThreshold) whenever Biomes.define() runs — a new map generation, or the Biomes
   * Editor's recalculate action — unlike volcanismChance/volcanoActiveChance it doesn't require
   * a new heightmap, since it only rescales an already-tagged per-cell intensity value.
   */
  volcanicSoilStrength: number;
  /**
   * Fauna population stock model detail level (docs/plan/biome-goods-producer-ecosystem.md §11).
   * "detailed" (default) runs the annual fauna cohort/breeding/carrying-capacity model that gates
   * Game and liveAnimal-tagged goods by a real per-cell headcount. "simplified" skips that model
   * entirely and falls back to Phase 1's cheaper "labour/rate-gated, no population ceiling"
   * formula — a performance escape hatch for large maps once cohort updates get expensive.
   */
  ruralEcosystemDetail: "detailed" | "simplified";
  /** Economy initial-capital and maintenance preset, applied when generating a new map. */
  economyStartMode: EconomyStartMode;
  /** Minimum iron-bearing mineral deposits per active state, applied when generating a new map. */
  ironDepositsPerState: number;
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
  /**
   * Master switch for the Danger/Threat system (monsters, dungeon bosses, the
   * danger field they paint). Defaults on for High/Dark Fantasy culture sets
   * (see changeCultureSet in controllers/options.ts) and off otherwise. When
   * off, Threats.generate/Dungeons.generate leave cells.danger at all-zero,
   * so dangerExpandPolicy's expand cost/ban and settlement suitability
   * penalties never trigger — states and the oikoumene can fill land without
   * the "wilderness stays wild" constraint (docs/plan/wild-oikoumene-frontier.md).
   */
  dangerEnabled: boolean;
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
  /**
   * How the Population cell heatmap maps values to color (SVG choropleth + WebGL).
   * - capacity: rural pop / cell capacity (default) — near-full cells are darkest
   * - relativeDensity: legacy density vs densest cell on the map
   */
  populationColorScale: "capacity" | "relativeDensity";
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
  /** Recalibrated from the generated map's Earth-relative extent. */
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
  historicalPeriod: "ageOfExploration",
  template: "highIsland",
  templateRandomization: "all",
  cultures: 12,
  culturesSet: "world",
  racePersonNameSpheres: resolveRacePersonNameMapping(DEFAULT_RACE_PERSON_NAME_SPHERES),
  statesNumber: 15,
  provincesRatio: 20,
  sizeVariety: 4,
  growthRate: 1,
  manors: 1000,
  religionsNumber: 6,
  stateLabelsMode: "auto",
  resolveDepressionsSteps: 250,
  lakeElevationLimit: 20,
  threatCalculation: "nonlinear",
  enclosureCalculationMode: "oceanCurrentsAmbient",
  oceanCurrentRenderMode: "path",
  militaryHierarchy: "simple",
  gunpowderEraEnabled: true,
  initialFirearmsUnstocked: false,
  initialPopulationSaturation: 60,
  initialSettlementPattern: "standard",
  oikoumeneLandShare: 0.45,
  initialPolityRealmSize: 30,
  frontierStartMode: "landOrigin",
  biomeRegionProfile: "global",
  volcanismChance: 30,
  volcanoActiveChance: 25,
  volcanicSoilStrength: 50,
  ruralEcosystemDetail: "detailed",
  economyStartMode: "balanced",
  ironDepositsPerState: 0.4,
  demographicBirthRate: 0.25,
  demographicChildMortalityRate: 0.2,
  goldToSilverRate: DEFAULT_GOLD_TO_SILVER_RATE,
  silverToCopperRate: DEFAULT_SILVER_TO_COPPER_RATE,
  simDemographics: true,
  simManpower: true,
  simMilitaryRecovery: true,
  ruralUrbanMigration: "independent",
  femaleLevyEnabled: false,
  recruitQualityEnabled: true,
  conflictAutonomy: DEFAULT_CONFLICT_AUTONOMY,
  warFrequency: 1.0,
  diplomacyHistoryAttempts: 1,

  dangerEnabled: false,
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

  mapSize: 12.9,
  latitude: 0,
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
  populationColorScale: "capacity",
  heightmapRenderingMode: "labeledContours",
  dangerRenderingMode: "choropleth",
  combatDeathsRenderingMode: "contour",

  setOption: (key, value) => {
    // A lock is represented by a localStorage entry bearing the option key.
    // Keep that entry current when a user changes an already locked setting;
    // otherwise the old value would be restored on the next page load.
    // Complex objects (race person-name map) always serialize as JSON.
    if (key === "racePersonNameSpheres") {
      localStorage.setItem(key, JSON.stringify(value));
    } else if (localStorage.getItem(key) !== null) {
      localStorage.setItem(key, String(value));
    }
    set({ [key]: value });
  },
  setOptions: updates => {
    // Preset controls can update several options together. Apply the same
    // invariant as setOption to each value that already has a lock.
    for (const [key, value] of Object.entries(updates)) {
      if (key === "racePersonNameSpheres") {
        localStorage.setItem(key, JSON.stringify(value));
      } else if (localStorage.getItem(key) !== null) {
        localStorage.setItem(key, String(value));
      }
    }
    set(updates);
  }
}));
