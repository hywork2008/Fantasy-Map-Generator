import type { VectorPolygon } from "./generation";

/** What the open land beyond the town is used for (pre-acceptance U5b). `wild` is woodland where trees grow. */
export const VECTOR_LAND_USE_KINDS = ["arable", "meadow", "pasture", "wild"] as const;
export type VectorLandUseKind = (typeof VECTOR_LAND_USE_KINDS)[number];

/** The farming the biome allows, which sets how far each use reaches. */
export const VECTOR_LAND_USE_CLASSES = ["temperate", "boreal", "steppe", "desert", "wetland", "moor", "cold"] as const;
export type VectorLandUseClass = (typeof VECTOR_LAND_USE_CLASSES)[number];

/** The open land beyond the town split by use: by the biome and the distance from the town and its roads. */
export interface VectorLandUse {
  version: 1;
  landClass: VectorLandUseClass;
  zones: { kind: VectorLandUseKind; regions: VectorPolygon[]; areaM2: number }[];
  /** Open-field furlongs on the arable (U5c); the arable between them is headland and field track. */
  furlongs?: VectorFurlong[];
}

/** This year's course of a great field: winter corn (wheat, rye), spring corn (barley, oats, pulse) or fallow. */
export const VECTOR_FURLONG_COURSES = ["winter", "spring", "fallow"] as const;
export type VectorFurlongCourse = (typeof VECTOR_FURLONG_COURSES)[number];

/** A bundle of parallel ploughed strips (selions) sharing one direction, ending on its headlands. */
export interface VectorFurlong {
  id: string;
  /** Direction of the strips, radians from the +x axis. */
  angle: number;
  /** The great field it lies in (0-based) and that field's course this year. */
  field: number;
  course: VectorFurlongCourse;
  /** The bundle's ground, inside the arable. */
  outline: VectorPolygon[];
  /** The strips side by side, each bending in a gentle reversed S (the ox plough's turn). */
  strips: VectorPolygon[];
}
