/** Drawing attributes for one CE building. Assigned once per fabric build. Renderers do not invent them. */
export type FloorUse =
  | "residential"
  | "retail"
  | "craft"
  | "storage"
  | "stable"
  | "civic"
  | "religious"
  | "military"
  | "service";

export type RoofForm = "gable" | "hip" | "flat" | "lean-to" | "pyramid" | "conical" | "dome" | "spire";

export type WallMaterial = "timber-frame" | "stone" | "brick" | "mudbrick" | "wattle" | "plaster";
export type RoofMaterial = "thatch" | "tile" | "slate" | "shingle" | "lead" | "turf";

export interface FloorSpec {
  /** 0 = ground floor. Cellars are not a level and are not drawn. */
  level: number;
  use: FloorUse;
  heightMeters: number;
}

export interface BuildingMassing {
  /** Same number `residentialCapacity` uses (`storeys` or 1 when a house omits it). */
  storeys: number;
  floors: FloorSpec[];
  cellar: boolean;
  /** Metres of overhang added at each floor above the ground. 0 for stone and non-medieval walls. */
  jettyMeters: number;
  eaveHeightMeters: number;
  roof: {
    form: RoofForm;
    pitchDeg: number;
    /** Ridge direction in radians, CE local frame (`atan2(dy, dx)`). */
    ridgeAzimuth: number;
    material: RoofMaterial;
  };
  wall: WallMaterial;
  /** Metres above sea level. CE's local ground is flat, so this is 0 until FMG placement. */
  baseElevationMeters: number;
  /** Shading only. Does not move vertices. */
  tint: number;
}
