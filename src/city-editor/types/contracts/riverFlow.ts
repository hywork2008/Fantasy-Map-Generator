import type { Point } from "../primitives";

export interface RiverFlow {
  /** FMG river id. */
  riverId: number;
  name: string;
  /** Centreline, upstream → downstream, local metres. */
  points: Point[];
  widthMeters: number;
  /** Fitted fall along the centreline (m); 0 when the terrain is too flat to decide. */
  dropMeters: number;
  /** What decided the direction. */
  basis: "fmgElevation" | "localElevation" | "descriptor";
}
