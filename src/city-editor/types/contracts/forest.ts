import type { Id, Point } from "../primitives";

/** CE scenery only; never changes FMG agriculture or timber stocks. */
export interface ForestSettings {
  version: 1;
  mode: "legacy" | "farmland" | "surroundings";
  density: "sparse" | "standard" | "dense";
}

export type LandCoverOverride = "forest" | "open";

/** Extra drawn footprints, such as the visible beach or a windmill's sails. */
export interface ForestKeepOut {
  polygons: Point[][];
  discs: { center: Point; radius: number }[];
}

/** Derived, meter-scale geometry shared by SVG and WebGL. Never serialized. */
export interface ForestRegion {
  id: string;
  outer: Point[];
  holes: Point[][];
  sourceFaceIds: Id[];
  areaM2: number;
  bounds: [number, number, number, number];
}

export interface ForestPlan {
  regions: ForestRegion[];
  forestFaceIds: Id[];
  areaM2: number;
  protectedFarmCount: number;
  protectedFarmAreaM2: number;
}
