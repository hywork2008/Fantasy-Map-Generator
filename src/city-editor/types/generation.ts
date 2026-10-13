import type { EditorMessageKey } from "../../i18n/editorMessages";
import type { BurgSiteDescriptor } from "./contracts/burgSiteDescriptor";
import type { SiteConfig } from "./contracts/siteConfig";
import type { FarNodeMode } from "./contracts/streets";
import type { CityDocument, EdgeRef, Point } from "./document";

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

export interface GenerationSettings {
  /** Unset preserves the existing flood fill and outer residential belt. */
  urbanCoreMode?: "legacy" | "compact";
  moats?: { town?: boolean; castle?: boolean };
  /** Single generated river: pass through town, or skirt the planned wall by roughly 1–3 cells. */
  riverPlacement?: "through" | "outside" | "outsideNear";
  historicalPeriod?: import("./document").HistoricalPeriod;
  burialProfile?: import("../../data/burialCultures").BurialCultureProfile;
  buildingPattern?: import("./document").BuildingPattern;
  castle?: Partial<import("./document").CastleSettings>;
  /** Castle siting also checks C4 on street edges. Set by the attempt loop
   * after a castle town failed with unconnected gates. */
  castleStreetLinks?: boolean;
  castleOutward?: boolean;
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
}

/** One visible process, in order. `processStep` is the S-index it recomputes up to;
 * the grid step (S0) is intentionally absent — the mesh is the Document panel's. */
/** A stage that stops part-way through its `processStep` so each sub-process is visible on its own. */
export type StageCheckpoint =
  | "walls"
  | "riverPassages"
  | "passages"
  | "wards"
  | "streets"
  | "innerWall"
  | "innerGates"
  | "firstInnerGates";

export interface GenerationStageDefinition {
  id:
    | "coast"
    | "river"
    | "urban"
    | "walls"
    | "riverPassages"
    | "passages"
    | "gates"
    | "streets"
    | "wards"
    | "centerRoads"
    | "townStreets"
    | "innerWall"
    | "innerGates"
    | "geometry"
    | "blocks"
    | "buildings"
    | "conceal";
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17;
  /** Original planning pass; separate from the visible slider number. */
  processStep: number;
  wallCheckpoint?: StageCheckpoint;
  labelKey: EditorMessageKey;
  hintKey: EditorMessageKey;
}

export interface UrbanPatchStep {
  /** The document with only THIS step's cumulative cells marked buildable — null
   * if the mesh is unusable or the result fails validation. */
  document: CityDocument | null;
  /** Total flood-fill iterations for this `(document, settings, seed)` (0 when
   * there is no eligible land at all). */
  total: number;
  /** The step actually shown, clamped to `[0, total - 1]` (-1 when `total` is 0). */
  index: number;
  /** The cell id admitted to the urban core at this step, or null. */
  cellId: number | null;
}

export interface GenerationStepResult {
  /** The document with only this step's cumulative result shown — null if the
   * mesh is unusable or the result fails validation. */
  document: CityDocument | null;
  /** Total iterations for this `(document, settings, seed)` (0 = nothing to
   * step through, e.g. no coastline configured, or Walls is off for ④). */
  total: number;
  /** The step actually shown, clamped to `[0, total - 1]` (-1 when `total` is 0). */
  index: number;
  /** A short label for what this step is (e.g. "vertex 4/12", "gate 2/5"), or
   * null when `total` is 0. */
  detail: string | null;
  /** Raw graph-walk polylines to draw as an overlay (① a single shoreline, ②
   * one per configured river) — omitted for ④⑤⑥, whose partial result is
   * already visible on `document` itself (gates / roads / ward colours). */
  overlayPaths?: Point[][];
}

/** An urban-component outline: the exact mesh edges (for a Wall group) and their
 * vertex coordinates (for the generator's BorderLoop shape). */
export interface MeshBorderLoop {
  segments: EdgeRef[];
  points: Point[];
  cellIds: number[];
}

/** Localized presentation of a generation stage; constructed by the controller. */
export interface GenerationStage extends GenerationStageDefinition {
  readonly label: string;
  readonly hint: string;
}
