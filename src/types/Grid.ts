import type { GridFeature } from "./models";
import type { TypedArray } from "./PackedGraph";
import type { Cells, Point, Vertices } from "./voronoi";

/** Grid-level cells: base voronoi topology plus all properties added by the generation pipeline */
export type GridCells = Cells & {
  h: TypedArray;
  t: TypedArray;
  f: TypedArray;
  temp: Int8Array;
  prec: TypedArray | number[];
  /**
   * Ocean current direction in degrees (0-359, standard math convention: 0 = +X axis,
   * increasing clockwise in screen space). Populated by `OceanCurrents.generate()`; 0 for
   * land and lake cells (see `docs/simulation/ocean-currents.md`).
   */
  currentAngle: Uint16Array;
  /** Ocean current speed, normalized 0-255. 0 for land and lake cells. */
  currentSpeed: Uint8Array;
  /**
   * `currentSpeed` smoothed by repeated ocean-neighbor averaging (see
   * `OceanCurrentConstants.AMBIENT_SMOOTHING_PASSES`), so a coastal cell reflects how fast the
   * surrounding water is a short distance offshore rather than the near-zero value every
   * shoreline cell reads due to the solver's no-slip boundary layer. Used by the
   * `"oceanCurrentsAmbient"` enclosure calculation mode; 0 for land and lake cells, same as
   * `currentSpeed`. See `docs/simulation/ocean-currents.md`.
   */
  ambientCurrentSpeed: Uint8Array;
  /**
   * Surface water temperature in degrees Celsius: the latitude-driven sea-level baseline
   * (same value as `temp` for water cells) advected along the current field for ocean cells.
   * Mirrors `temp` for land and lake cells, which carry no current.
   */
  waterTemp: Int8Array;
};

export interface Grid {
  spacing: number;
  cellsDesired: number;
  boundary: Point[];
  points: Point[];
  cellsX: number;
  cellsY: number;
  seed: string | number;
  cells: GridCells;
  vertices: Vertices;
  features: GridFeature[];
}
