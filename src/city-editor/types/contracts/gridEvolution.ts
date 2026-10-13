import type { Cell, Point } from "../geometry";

export interface GridEvolutionStage {
  /** e.g. "scatter 42 / 120", "relax pass 2 / 3 (K=4)", "final". */
  label: string;
  /** The generating sites at this stage. */
  sites: Point[];
  /** Delaunay edges among `sites` (guard-ring edges excluded), as coordinate pairs. */
  delaunay: [Point, Point][];
  /** Window-clipped Voronoi cells for `sites`. */
  cells: Cell[];
}
