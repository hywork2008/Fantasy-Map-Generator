import type { CityProgram } from "../cityProgram";

/** Urban morphological layout pattern:
 * - `auto`: resolved from size/seed (tiny maps roll Circulade, Bram or Organic)
 * - `organic`: traditional irregular medieval cranked-block layout
 * - `circulade`: Languedoc circulade concentric-ring village with core plaza, attached church, and concentric houses
 * - `bram`: Polygonal circulade core (3 rings, ~240m) with peripheral Voronoi blocks
 * - `classic`: boundary-aligned Voronoi blocks with compact attached houses */
export type CityLayout = "auto" | "organic" | "circulade" | "bram" | "classic";

export interface SiteConfig {
  coast: CoastShape;
  /** 0..2 rivers, each by where it runs (`RiverPlacement`). The old values that named a channel form
   * (`straight`, `meander`, `greatBend`) still read as a river through the town of that form. */
  rivers: RiverShape[];
  /** The channel form of each river, by index (`riverSettings`); absent, a river keeps the form its `rivers` value
   * implies, a gentle meander for a placement. */
  riverForms?: RiverForm[];
  /** Hilltop terrain — orthogonal to water; no classification effect. */
  relief: boolean;
  /** Built programme the standalone user toggles (Port / Walls / …). Written
   * straight onto the synthetic descriptor's `burg.*` flags (synthSite.ts). */
  features: CityFeatureSet;
  /** Wall-pattern overrides applied on top of the matrix plan (S4 only). */
  wall: WallChoice;
  /** Urban morphology layout (Bram circulade or Organic). Default is "auto". */
  layout?: CityLayout;
}

export type CoastShape = "none" | "straight" | "bay" | "cape";

/** Where a river runs: through the town (the town on one bank), beside it, or through it out to the sea. */
export type RiverPlacement = "through" | "beside" | "toCoast";
/** The channel's form, whatever its placement: straight, a gentle meander, a pronounced meander, or one great bend
 * at the town. */
export type RiverForm = "straight" | "gentle" | "meander" | "greatBend";
/** A `rivers` entry: a placement, or (older settings) a channel form of a river through the town. */
export type RiverShape = RiverPlacement | Exclude<RiverForm, "gentle">;
/** One river's placement and form, as `riverSettings` reads them from a `SiteConfig`. */
export interface RiverSetting {
  placement: RiverPlacement;
  form: RiverForm;
}

/** The editable half of CityProgram — `capital` / `wallPlan` are never set by the
 * standalone Feature toggles. */
export type CityFeatureSet = Omit<CityProgram, "capital" | "wallPlan">;

export interface WallChoice {
  envelope: WallEnvelopeChoice;
  coast: WallCoastChoice;
  line: WallLineChoice;
  material?: WallMaterialChoice;
}

/** Standalone wall-pattern overrides; "auto" defers to the wall-patterns.md §8
 * matrix (`siteInput.ts` `siteToWallPlan`). M4b exposes the implemented members. */
export type WallEnvelopeChoice = "auto" | "hull" | "notchFilled";

/** `opening` keeps the sea wall and leaves a single gap at the harbour. */
export type WallCoastChoice = "auto" | "open" | "seaWall" | "opening";

export type WallLineChoice = "auto" | "polygonal" | "organic";

export type WallMaterialChoice = "auto" | "stone" | "wood";
