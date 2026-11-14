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
}
