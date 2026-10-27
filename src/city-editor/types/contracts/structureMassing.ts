import type { Point } from "../primitives";
import type { RoofMaterial } from "./buildingMassing";

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
  /** Optional linear RGB for a dedicated assembly surface such as a cistern. */
  color?: readonly [number, number, number];
  /** Ribbon centre line. Absent when `footprint` is set. */
  centerline?: Point[];
  /** Ribbon footing levels in the local mesh frame, one per centre-line vertex. */
  baseElevationsMeters?: number[];
  /** Walk levels independent of the footing, preserving defensive height beside terraces. */
  topElevationsMeters?: number[];
  /** Unit-width miter offsets interpolated from the original ribbon before terrain sampling. */
  ribbonOffsets?: Point[];
  widthMeters?: number;
  /** Connection geometry owns these stairs or open parapets; do not replace it with a wall prototype. */
  wallWalkModified?: boolean;
  /** Closed ring. Absent or empty `holes` leaves a solid cap. */
  footprint?: Point[];
  /** Clockwise rings cut out of `footprint`. */
  holes?: Point[][];
  /** Matched CCW rings, in plan metres, for battered masonry and sloping ramps.
   * Elevations are absolute in the local 3D frame, one per footprint vertex. */
  sections?: Array<{ footprint: Point[]; elevationsMeters: number[] }>;
  /** Body height above `baseElevationMeters`. Roof rise is extra. */
  heightMeters: number;
  baseElevationMeters: number;
  roof: StructureRoof;
  /** Catalogue roof attributes. Omitted structures retain their default cap. */
  roofPitchDeg?: number;
  roofMaterial?: RoofMaterial;
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
