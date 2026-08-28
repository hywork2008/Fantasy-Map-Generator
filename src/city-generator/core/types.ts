// Shared types for the City Generator pipeline. See docs/city-generator/design.md §4.

export type Point = [number, number];

/**
 * Everything the pipeline needs to produce a deterministic town plan. In the
 * local frame used throughout: origin = town center, +X = east, +Y = north,
 * unit = meters (matches BurgSiteDescriptor).
 */
export interface CityParams {
  /** Deterministic seed. Same seed + same params => byte-identical result. */
  seed: string;
  /** Side length of the square generation window, meters. */
  extentMeters: number;
  /** Built-up radius derived from population, meters. */
  cityRadiusMeters: number;
  /** Target Voronoi cell size (≈ edge length), meters. */
  cellSizeMeters: number;
  /** Number of Lloyd relaxation passes applied after the initial scatter. */
  lloydPasses: number;
}

/** One Voronoi cell of the macro grid, clipped to the generation window. */
export interface Cell {
  id: number;
  /** Generating site (moves toward the centroid on each Lloyd pass). */
  site: Point;
  /** Cell boundary, counter-clockwise, clipped to the window. */
  polygon: Point[];
  /** Area-weighted centroid of `polygon`. */
  centroid: Point;
  /** Ids of adjacent inner cells (guard-ring neighbors are dropped). */
  neighbors: number[];
  /** True when the cell was trimmed by / touches the window edge. */
  onBorder: boolean;
}

/** A snapshot of the grid at one point in the S0 evolution. */
export interface GridStage {
  label: string;
  cells: Cell[];
}

/** Classification a cell carries in a pipeline snapshot. The river is drawn as a
 * band on the cell edges, not by tagging cells — there is no "river water" tag. */
export type CellTag = "land" | "sea" | "urban" | "outskirts" | "rural";

/** A river as a wide "road" walked along the Voronoi cell-edge graph (design §4.1),
 * smoothed for drawing. Stops where it first meets the sea. */
export interface RiverPath {
  /** Centerline polyline, local meters, upstream → downstream (mouth). */
  points: Point[];
  /** Raw walk before smoothing: the chain of actual final-grid cell-edge vertices
   * `points` was smoothed from. Every consecutive pair is a real cell edge — this
   * is what "the river lies on the grid" means, so it is drawn as an inspection
   * overlay (the smoothed `points` drift up to ~1 cell off it). */
  edgeTrack: Point[];
  /** Per-vertex full width, meters (index-aligned with `points`). */
  widths: number[];
  cityBank: "left" | "right";
}

export type OverlayKind = "shoreline" | "gateBearing";

export interface Overlay {
  kind: OverlayKind;
  points: Point[];
}

export interface SnapshotPath {
  kind: "river" | "street" | "road";
  points: Point[];
  widths: number[];
}

/** One inspectable stage of the drawing process (S0 grid → S1 → S2 → S3). */
export interface Snapshot {
  label: string;
  cells: { polygon: Point[]; tag: CellTag }[];
  paths: SnapshotPath[];
  overlays: Overlay[];
}

/** Local geography the pipeline classifies against. The coast/river polylines are
 * ROUGH CORRIDORS (a few control points) — S1/S2 walk the Voronoi edge graph
 * along them, so the fine shape (and where it exits) is graph-derived, not
 * authored. Built from a BurgSiteDescriptor (site/siteInput.ts) or empty. */
export interface CityGeography {
  coast: { corridor: Point[]; waterAzimuthDeg: number } | null;
  rivers: { corridor: Point[]; widths: number[]; cityBank: "left" | "right" }[];
  /** Gate-candidate road bearings, compass degrees. */
  roadBearings: number[];
}

/** Output of `generateCity`. M2 covers S0–S3. */
export interface GenerationResult {
  params: CityParams;
  /** S0 evolution: [0] = initial scatter, last = relaxed grid. */
  gridStages: GridStage[];
  /** Drawing-process stages, [0] = base grid, last = urban core. */
  steps: Snapshot[];
  /** Final relaxed cells (identical to `gridStages.at(-1).cells`). */
  cells: Cell[];
  /** River centerlines used by S2, for downstream stages / debugging. */
  riverPaths: RiverPath[];
  /** Detailed graph-walked shoreline, or null when landlocked. */
  shoreline: Point[] | null;
  /** Closed polygon whose interior is the water, or null when landlocked. */
  waterPolygon: Point[] | null;
}
