import type { Id, Point } from "../primitives";

/** A river height layer with an upstream-first centre line, bed profile, and banks. */
export interface TerrainRiverCorridor {
  kind: "riverCorridor";
  id: Id;
  /** Source feature group or river flow, so an edit of that line can rebuild the corridor. */
  sourceId: Id;
  /** Upstream first. */
  centerline: Point[];
  /** Water width at each centre-line point, in metres. */
  widthsMeters: number[];
  /** Absolute bed height at each centre-line point. Never rises downstream. */
  bedMeters: number[];
  /** Water depth above the bed. The surface is level across the width. */
  depthMeters: number;
  /** Derived local water depths for the hydraulic model; absent on legacy saved corridors. */
  depthsMeters?: number[];
  bank: { kind: "slope"; runMeters: number } | { kind: "quay"; heightMeters: number };
}

export interface RiverHydraulicStation {
  point: Point;
  left: Point;
  right: Point;
  leftBankMeters: number;
  rightBankMeters: number;
  distanceMeters: number;
  widthMeters: number;
  surfaceMeters: number;
  bedMeters: number;
  depthMeters: number;
  velocityMps: number;
  energyHeadMeters: number;
}

/** Steady rectangular-channel flow. Values are absolute metres, seconds, and cubic metres. */
export interface RiverHydraulicProfile {
  sourceId: string;
  bankDropMeters: number;
  dischargeM3s: number;
  roughness: number;
  stations: RiverHydraulicStation[];
  corridor: TerrainRiverCorridor;
}
