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

/** Output of `generateCity`. M1 covers S0 only. */
export interface GenerationResult {
  params: CityParams;
  /** S0 evolution: [0] = initial scatter, last = relaxed grid. */
  gridStages: GridStage[];
  /** Final cells (identical to `gridStages.at(-1).cells`). */
  cells: Cell[];
}
