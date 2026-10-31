import type { Point } from "../primitives";
import type { TerrainRiverCorridor } from "../terrain";

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
