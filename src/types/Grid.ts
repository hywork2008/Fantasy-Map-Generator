import type { GridFeature } from "./models";
import type { TypedArray } from "./PackedGraph";
import type { Cells, Point, Vertices } from "./voronoi";

/** Grid-level cells: base voronoi topology plus all properties added by the generation pipeline */
export type GridCells = Cells & {
  h: TypedArray;
  t: TypedArray;
  f: TypedArray;
  temp: Int8Array;
  /**
   * Live "current effective temperature": `temp` plus the seasonal offset for the world's
   * configured axial tilt and the current simulation calendar date (see
   * `src/generators/seasonalClimate.ts`'s `updateSeasonalTemperature()`). Recomputed once per
   * calendar month, not every day (see docs/plan/seasonal-temperature-variation.md). `temp`
   * itself is never rewritten — it stays the generation-time annual average. Absent until the
   * first recompute runs (once per generation, right after `initSimulationClock()`).
   */
  seasonalTemp?: Int8Array;
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
  /**
   * Volcanic intensity, 0..1 (peak = 1, decaying outward with the tagged Hill's own falloff
   * shape). Written once by HeightmapModule.finalizeVolcanoes() (heightmap-generator.ts) for
   * any single, dominant Hill placement rolled as a volcano (see VolcanoConstants,
   * data/constants.ts). Absent (undefined) for maps generated before this feature existed, or
   * wherever no volcano was rolled — treat as 0 via `grid.cells.volcanic?.[i] ?? 0`.
   */
  volcanic?: Float32Array;
  /**
   * 1 for cells belonging to a volcano rolled "active" (lava crater + downhill flow) rather than
   * dormant (bare cone / freshwater crater lake) — see options.volcanoActiveChance. Only
   * meaningful where `volcanic` is at or above VolcanoConstants.CORE_MIN_INTENSITY; 0/undefined
   * elsewhere.
   */
  volcanicActive?: Uint8Array;
};

/** A tagged volcanic peak written by HeightmapModule.finalizeVolcanoes(). */
export interface GridVolcano {
  /** Grid cell of the carved crater (height dropped below the water line). */
  peakCell: number;
  /** True when the volcano rolled "active" (lava lake + lava flow). */
  active: boolean;
}

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
  /**
   * Volcanic peaks tagged during heightmap generation. Absent on maps generated before this
   * field existed, and empty when volcanismChance placed none.
   */
  volcanoes?: GridVolcano[];
}
