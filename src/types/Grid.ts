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
