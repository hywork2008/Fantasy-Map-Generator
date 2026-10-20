import type { Id, Point } from "./document";

/** Authoring data in metres. Render meshes and sampled profiles are never persisted. */
export interface FortSite {
  version: 1;
  id: Id;
  castleId: Id;
  groundElevationMeters: number;
  /** Connected moat loops share one absolute water surface. */
  waterElevationMeters: number;
  motte: { center: Point; summitRadiusMeters: number; baseRadiusMeters: number; heightMeters: number };
  bailey: { center: Point; radiusMeters: number; elevationMeters: number };
  moats: Array<{
    id: Id;
    center: Point;
    radiusMeters: number;
    widthMeters: number;
    depthMeters: number;
    locked: boolean;
  }>;
  defenses: Array<{
    id: Id;
    center: Point;
    radiusMeters: number;
    heightMeters: number;
    widthMeters: number;
    locked: boolean;
  }>;
  gates: Array<{ id: Id; defenseId: Id; angleRadians: number; widthMeters: number; heightMeters: number }>;
  junctions: Array<{ id: Id; point: Point; elevationMeters: number }>;
  routes: Array<{
    id: Id;
    kind: "path" | "bridge" | "stairs";
    from: Id;
    to: Id;
    points: Point[];
    /** Absolute design levels, independent of the terrain under a bridge. */
    elevationsMeters: number[];
    widthMeters: number;
    locked: boolean;
  }>;
  buildings: Array<{
    partId: Id;
    use: "keep" | "hall" | "chapel" | "kitchen" | "barracks" | "blacksmith" | "workshop" | "stables" | "stores";
    heightMeters: number;
    material: "stone" | "wood";
    roof: "flat" | "gable";
    cornerTowerHeightMeters?: number;
  }>;
}
