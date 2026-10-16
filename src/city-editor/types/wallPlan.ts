/** Per-edge kind on a wall ring — decides how (and whether) that run is drawn.
 * See docs/city-generator/wall-patterns.md §6. */
export type WallSegmentKind = "land" | "coast" | "river" | "citadel";

/**
 * How S4 shapes and draws the wall ring (docs/city-generator/wall-patterns.md).
 * M4b implements `envelope` hull|notchFilled, `coast` open|seaWall, `line`
 * polygonal|organic, `extent` full|none. The remaining members are typed for the
 * §8 matrix / UI and fall back until M4b.1 (sectorPolygon/denseCore/expanded →
 * notchFilled, quayWall/harborBasin/setBack → seaWall, geometric → polygonal,
 * landwardOnly → drop non-land runs, rampart → full).
 */
export interface WallPlan {
  envelope: "hull" | "notchFilled" | "sectorPolygon" | "denseCore" | "expanded";
  coast: "open" | "quayWall" | "seaWall" | "harborBasin" | "setBack" | "opening";
  line: "organic" | "polygonal" | "geometric";
  extent: "full" | "landwardOnly" | "rampart" | "none";
  /** Bridge any inward pocket deeper than this × cellSize (envelope step). */
  notchDepth: number;
  /** Outer ditch along the land runs. Carried for the matrix; drawn in M4b.1. */
  moatOnLand: boolean;
}
