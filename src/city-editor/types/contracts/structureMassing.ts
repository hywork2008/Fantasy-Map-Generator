import type { Point } from "../primitives";

export type StructureKind = "wall" | "tower" | "gate" | "bridge" | "landmark";
export type StructureMaterial = "stone" | "wood";
export type StructureRoof = "none" | "flat" | "gable" | "hip" | "pyramid";
/** A parapet is a low lip, not a row of separate merlons. */
export type ParapetMode = "none" | "outer" | "both";

/**
 * Drawing attributes for one wall, tower, gate, bridge, or landmark.
 * Derived when the 3D view opens. Not stored on the city document.
 */
export interface StructureMassing {
  id: string;
  kind: StructureKind;
  /** Proper name of a landmark or castle part. Document content, not UI chrome. */
  name?: string;
  material: StructureMaterial;
  /** Ribbon centre line. Absent when `footprint` is set. */
  centerline?: Point[];
  widthMeters?: number;
  /** Closed ring. Holes are not cut out. */
  footprint?: Point[];
  /** Body height above `baseElevationMeters`. Roof rise is extra. */
  heightMeters: number;
  baseElevationMeters: number;
  roof: StructureRoof;
  /** Ridge direction for a gable or hip, radians, `atan2(dy, dx)`. */
  ridgeAzimuth?: number;
  parapet: ParapetMode;
  parapetMeters: number;
  parapetWidthMeters: number;
  /** The outer parapet moves away from this point. */
  anchor?: Point;
  /** Cone standing on the footprint centroid, starting at the eave. */
  spire: boolean;
}
