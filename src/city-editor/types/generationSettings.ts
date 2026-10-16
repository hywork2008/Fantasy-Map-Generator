import type { BurgSiteDescriptor } from "./contracts/burgSiteDescriptor";
import type { SiteConfig } from "./contracts/siteConfig";
import type { FarNodeMode } from "./contracts/streets";

/** The deliberate inputs the user picks. Neither the seed nor the map size is
 * here — the panel holds the seed, and the frame is the document's. */
export interface StreetSettings {
  farNode: FarNodeMode;
  manualBearings?: number[];
  /** When true (default), roads / walls / buildings may not sit in `waterPolygon`. */
  avoidSea: boolean;
  /** Phase G5: fold smoothed artery vertices back into the mesh. Default true. */
  foldSmoothing: boolean;
}

export type GenerationMethod = "mesh-first" | "skeleton-first";

/** Skeleton-first wall shape families (§4.3). `bastioned` needs the age of exploration or later. */
export type WallShape = "organic" | "round" | "oval" | "square" | "polygon" | "bastioned";

export type WallShapeChoice = "auto" | WallShape;

export interface GenerationSettings {
  population?: import("./contracts/population").PopulationGenerationSettings;
  /** Unset preserves the existing flood fill and outer residential belt. */
  urbanCoreMode?: "legacy" | "compact";
  moats?: { town?: boolean; castle?: boolean };
  /** Single generated river: pass through town, or skirt the planned wall by roughly 1–3 cells. */
  riverPlacement?: "through" | "outside" | "outsideNear";
  historicalPeriod?: import("./primitives").HistoricalPeriod;
  burialProfile?: import("../../data/burialCultures").BurialCultureProfile;
  buildingPattern?: import("./primitives").BuildingPattern;
  castle?: Partial<import("./castle").CastleSettings>;
  /** Castle siting also checks C4 on street edges. Set by the attempt loop
   * after a castle town failed with unconnected gates. */
  castleStreetLinks?: boolean;
  castleOutward?: boolean;
  /** The accepted retry of an earlier roll with this seed and input. Generation starts
   * at that attempt instead of re-running the rejected ones; it is ignored when the seed
   * or the input changed. Never stored in the result's recipe. */
  generationRetry?: GenerationRetry;
  /** Only used when replaying a pre-castle-city recipe. */
  legacyCastles?: boolean;
  config: SiteConfig;
  /** Urban morphology layout (Bram circulade or Organic). Unset = config.layout or "auto". */
  layout?: import("./contracts/siteConfig").CityLayout;
  /** Approximate fraction of built-up area enclosed by the main wall (0.05–1).
   * Unset: tiny/small 100%, medium 45%, large 20%. Ignored when walls are disabled.
   * Standalone grid evolution pulls a tiny curtain in by one cell, and a small curtain
   * in by one or two cells, so houses can sit outside that line. Bram keeps the
   * settlement edge so its spoke roads can reach the gates. FMG imports without
   * bridgeable rivers retain the supplied town radius without the random inset. */
  walledAreaShare?: number;
  /** "double" adds an old-town wall inside the outer wall (`walledAreaShare` then sizes
   * the old town and the outer wall encloses the whole built-up area). Circulade and
   * Bram layouts stay single. Default "single". */
  townWallRings?: "single" | "double";
  /** Double walls: preserve the historical outer-first algorithm, or build the old town first. */
  townWallBuildOrder?: "outer-first" | "inner-first";
  /** Lab-only factorial comparison. UI never sets "legacy" on inner-first towns. */
  townWallDefensePolicy?: "legacy" | "closed";
  /** Double walls only: "razed" turns the old-town wall into a ring road (§4.3). Default "standing". */
  innerWallState?: "standing" | "razed";
  /**
   * Debug/tuning override for the ③ urban-core stage: cap its flood-fill to the
   * first N cells in ascending-cost fill order (TownGeneratorTS-style "first
   * nPatches") instead of the default accumulated polygon-area budget. Unset =
   * actual area up to π R². See docs/city-generator/towngen-comparison.md §2.1.
   */
  urbanNPatches?: number;
  /** Phase G2 street-extension / sea-avoidance knobs. Unset = `defaultStreetSettings()`. */
  streets?: Partial<StreetSettings>;
  /** Real FMG (or shared) site. When set, geography and programme come from this
   * instead of `synthSite(config, seed)`. The document frame should match
   * `descriptor.frame` so corridors sit on the mesh. */
  descriptor?: BurgSiteDescriptor;
  /** Unset = "mesh-first" (the existing pipeline). See docs/city-editor/plan/skeleton-first-generation.md. */
  generationMethod?: GenerationMethod;
  /** skeleton-first only. Unset = "auto". */
  wallShape?: WallShapeChoice;
  /** skeleton-first `polygon` wall: number of sides. Unset = chosen from the seed (5–8). */
  wallSides?: number;
}

/** What the attempt loop had changed when it accepted attempt `attempt` (0 = first). */
export interface GenerationRetry {
  /** The accepted attempt's seed, `<seed>:junction-retry:<attempt>`. */
  seed: string;
  attempt: number;
  /** `generationInputKey` of the document and requested settings it was rolled from. */
  inputKey: string;
  castleStreetLinks?: boolean;
  castleOutward?: boolean;
  /** Set when the attempt fell back from double to single walls; the reason it records. */
  singleWallFallback?: string;
}
