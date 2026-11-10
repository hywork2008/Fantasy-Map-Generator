import type { Point } from "../primitives";
import type { ShipType } from "../ships";

export interface CargoQuay {
  id: string;
  craneId: string;
  landFaceId: string;
  waterFaceId: string;
  a: Point;
  b: Point;
  outward: Point;
  water: Point[];
  depth: number;
  axis: Point;
  reach: number;
  pulleyHeight: number;
  /** Water surface below the foundation; uses the same datum as rendered ocean water. */
  waterBelowQuay: number;
  /** Both heights are relative to the quay foundation. */
  transferHeight: number;
  landDrop: Point;
  swingDirections: number[];
  reservedWater: Point[];
}

export interface CargoBerthAssignment {
  kind: "cargo-quay" | "lighter-transfer";
  berthId: string;
  craneId: string;
  cargoAccessId: string;
  shipType: ShipType;
  sourceShipId?: string;
  /** Pose snapshot prevents a manually moved/resized ship retaining an active connection. */
  point: Point;
  rotation: number;
  length: number;
  hook: Point;
  landDrop: Point;
  swingAngleRad: number;
}
