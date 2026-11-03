import type { MarketSite } from "./contracts/market";
import type { HistoricalPeriod, Id, Point } from "./primitives";
import type { FreeformWay, TerrainFieldRecipe, TerrainRiverCorridor } from "./terrain";

/** One hand edit of the height field. Replayed in order. The brush UI is not part of F3. */
export interface SculptStroke {
  id: Id;
  kind: "raise" | "lower" | "smooth";
  center: Point;
  radiusMeters: number;
  /** Metres added, removed, or the smooth strength. */
  meters: number;
}

/** Forest, farm, or park. A polygon in the local frame, with no cell underneath. */
export interface LandZone {
  id: Id;
  kind: "forest" | "farm" | "park";
  polygon: Point[];
}

/** One placed BV model. The front faces `facingDegrees` (north 0, clockwise). */
export interface FreeformPlacement {
  id: Id;
  modelId: string;
  quality?: "low" | "high" | "ultra";
  palette?: import("../../buildings/medieval/marketAppearance").MarketPalette;
  marketActivity?: "market-day" | "closed";
  locked?: boolean;
  position: Point;
  facingDegrees: number;
  plotId: Id;
}

/** Level pad owned by one placement. The outline is the footprint grown by the margin. */
export interface FreeformPlot {
  id: Id;
  ownerId: Id;
  outline: Point[];
  levelMeters: number;
  edge: { kind: "wall" } | { kind: "slope"; runMeters: number };
  marginMeters: number;
}

/**
 * Saved freeform city. Metres, local frame, +Y north.
 * The height field, meshes, and walls are rebuilt from this ledger and are not stored.
 */
export interface FreeformCity {
  format: "fmg-freeform-city";
  version: 1;
  frame: { extentMeters: number };
  historicalPeriod?: HistoricalPeriod;
  maxBridgeSkewDegrees?: number;
  ground: TerrainFieldRecipe;
  sculpt: SculptStroke[];
  plots: FreeformPlot[];
  placements: FreeformPlacement[];
  ways: FreeformWay[];
  rivers: TerrainRiverCorridor[];
  zones: LandZone[];
  markets?: MarketSite[];
}
