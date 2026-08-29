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

export type OverlayKind = "shoreline" | "gateBearing" | "wall" | "citadelWall" | "gate" | "tower";

export interface Overlay {
  kind: OverlayKind;
  points: Point[];
  /** A port-facing gate; rendered as a water gate rather than a land gate. */
  water?: boolean;
}

/** A named, build-free area reserved before streets and wards are generated. */
export type PrecinctKind = "citadel" | "plaza";

export interface Precinct {
  kind: PrecinctKind;
  cellIds: number[];
  anchor: Point;
  label: string;
}

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
  coast: "open" | "quayWall" | "seaWall" | "harborBasin" | "setBack";
  line: "organic" | "polygonal" | "geometric";
  extent: "full" | "landwardOnly" | "rampart" | "none";
  /** Bridge any inward pocket deeper than this × cellSize (envelope step). */
  notchDepth: number;
  /** Outer ditch along the land runs. Carried for the matrix; drawn in M4b.1. */
  moatOnLand: boolean;
}

export const DEFAULT_WALL_PLAN: WallPlan = {
  envelope: "notchFilled",
  coast: "open",
  line: "polygonal",
  extent: "full",
  notchDepth: 3,
  moatOnLand: false
};

/** One closed circumference of an urban connected component. `segments[i]` tags
 * the edge `points[i] → points[(i+1) % n]`; `segments.length === points.length`. */
export interface BorderLoop {
  points: Point[];
  segments: WallSegmentKind[];
  urbanCellIds: number[];
}

/** A gate is deliberately a border vertex, ready for S5's graph routing. */
export interface Gate {
  point: Point;
  borderIndex: number;
  /** The port-facing gate, when the programme has a harbour. */
  water: boolean;
}

/**
 * S5 street network, all routed with A* over the Voronoi cell-edge graph
 * (design §4.2 S5, TownGeneratorTS 2.4 `buildStreets`).
 *
 * `streets` run gate → plaza (or the town centre when there is no plaza) INSIDE
 * the perimeter; they are deliberately NOT drawn — they resurface in S7 as the
 * setback gaps between blocks. `roads` run a far node in the gate's bearing → the
 * gate OUTSIDE the perimeter and ARE drawn, as a double line. `arteries` is the
 * tidied union of both (plaza edges dropped, chains split at every junction,
 * interior vertices smoothed with the endpoints — gates / junctions — fixed):
 * the "streets" S7 sets buildings back from.
 */
export interface StreetNetwork {
  streets: Point[][];
  roads: Point[][];
  arteries: Point[][];
}

export interface SnapshotPath {
  kind: "river" | "street" | "road";
  points: Point[];
  widths: number[];
}

/** One inspectable stage of the drawing process (S0 grid → S1 → S2 → S3). */
export interface Snapshot {
  label: string;
  /** The source grid-cell metadata is kept with each snapshot so renderers can
   * identify a clicked cell without having to infer it from its polygon. */
  cells: Array<
    Pick<Cell, "id" | "polygon" | "site" | "centroid" | "neighbors" | "onBorder"> & {
      tag: CellTag;
    }
  >;
  paths: SnapshotPath[];
  overlays: Overlay[];
  precincts: Precinct[];
}

/** Local geography the pipeline classifies against. The coast/river polylines are
 * ROUGH CORRIDORS (a few control points) — S1/S2 walk the Voronoi edge graph
 * along them, so the fine shape (and where it exits) is graph-derived, not
 * authored. Built from a BurgSiteDescriptor (site/siteInput.ts) or empty. */
export interface CityGeography {
  coast: { corridor: Point[]; waterAzimuthDeg: number } | null;
  rivers: {
    corridor: Point[];
    widths: number[];
    cityBank: "left" | "right";
    /** The FMG tributary ends in an imported open-water parent inside this
     * urban window. A direct final leg is valid if graph walking cannot close
     * the junction exactly. */
    joinsWater?: boolean;
  }[];
  /** Additional water boundaries. A major river is represented by its town-side
   * bank here instead of an impossibly wide river stroke. `coast` remains for
   * backwards-compatible standalone and exported inputs. */
  waterAreas?: { corridor: Point[]; waterAzimuthDeg: number; kind: "ocean" | "lake" | "river" }[];
  /** Gate-candidate road bearings, compass degrees. */
  roadBearings: number[];
  /** Road centre-lines, used by S4 to choose the corresponding gates. */
  roadPaths?: Point[][];
  /** FMG's desired number of land gates. Falls back to road bearings when absent. */
  suggestedGates?: number;
}

/**
 * The built programme the Burg-editor Features decide — what to place, as opposed
 * to the terrain to classify (CityGeography). Orthogonal to geography; all false
 * = an open settlement with nothing built. Sourced from a BurgSiteDescriptor's
 * `burg.*` flags (site/siteInput.ts `siteToProgram`).
 *
 * M4a wires the type and consumes only `walls` (S3 compaction). `citadel` /
 * `plaza` land in S4, `temple` / `port` / `shanty` in S6.
 */
export interface CityProgram {
  /** Walled town. Tightens the S3 urban core; S4 promotes the border ring to a
   * drawn wall. */
  walls: boolean;
  /** Fortified inner keep. Placeable with or without a wall. */
  citadel: boolean;
  /** Central market square, reserved as a build-free void. */
  plaza: boolean;
  /** Cathedral / temple precinct. */
  temple: boolean;
  /** Harbour. Only meaningful when a waterbody is present. */
  port: boolean;
  /** Extramural shanty (the slum-grade faubourg). */
  shanty: boolean;
  /** Capital. A light landmark-rank modifier only. */
  capital: boolean;
  /** How S4 shapes and draws the wall ring. Absent ⇒ `DEFAULT_WALL_PLAN`.
   * `site/siteInput.ts` `siteToProgram` fills it from the §8 matrix. */
  wallPlan?: WallPlan;
}

export const DEFAULT_PROGRAM: CityProgram = {
  walls: false,
  citadel: false,
  plaza: false,
  temple: false,
  port: false,
  shanty: false,
  capital: false
};

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
  /** S4 inner perimeters; present even for an unwalled settlement. */
  borders: BorderLoop[];
  /** S4 gates on `borders`. */
  gates: Gate[];
  /** S4 named inner precincts. */
  precincts: Precinct[];
  /** S5 street network. Only `streets.roads` is drawn; `streets` / `arteries`
   * feed the S7 setbacks. */
  streets: StreetNetwork;
}
