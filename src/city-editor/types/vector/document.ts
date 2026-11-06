import type { HistoricalPeriod, Point } from "../primitives";

export type VectorHandleMode = "corner" | "aligned" | "symmetric";
export type VectorSegment = (
  | { id: string; kind: "line"; from: Point; to: Point }
  | { id: string; kind: "cubic"; from: Point; control1: Point; control2: Point; to: Point }
) & { startMode?: VectorHandleMode };

export interface CurveAnchor {
  pathId: string;
  segmentId: string;
  t: number;
}

export type VectorPreset = {
  kind: "preset";
  center: Point;
  widthMeters: number;
  heightMeters: number;
  /** Bearing of the local width axis: north 0, clockwise. */
  bearingDegrees: number;
  cornerRadiusMeters?: number;
} & ({ preset: "ellipse" | "rectangle" } | { preset: "polygon"; sides: number });

export type VectorPathSource =
  | VectorPreset
  | {
      kind: "curve";
      closed: boolean;
      segments: VectorSegment[];
      freehandToleranceMeters?: number;
    };

export interface WidthStation {
  anchor: CurveAnchor;
  leftMeters: number;
  rightMeters: number;
}

export interface VectorPath {
  id: string;
  revision: number;
  role: "road" | "river" | "wall";
  origin: "imported" | "automatic" | "manual";
  editPolicy: "fixed" | "editable";
  source: VectorPathSource;
  width: { leftMeters: number; rightMeters: number; stations: WidthStation[]; interpolation?: "linear" };
}

export interface VectorNode {
  id: string;
  position: Point;
  anchors: CurveAnchor[];
}

export interface VectorRoadEdge {
  id: string;
  pathId: string;
  fromNodeId: string;
  toNodeId: string;
  from: CurveAnchor;
  to: CurveAnchor;
}

export interface VectorGate {
  id: string;
  wallPathId: string;
  nodeId: string;
  anchor: CurveAnchor;
  widthMeters: number;
  kind: "passage" | "water";
  circuitId?: string;
}

export interface VectorBridge {
  id: string;
  roadPathId: string;
  riverAnchor: CurveAnchor;
  from: CurveAnchor;
  to: CurveAnchor;
  structure: "stone" | "timber";
  dryLandingMeters: number;
  editPolicy: VectorPath["editPolicy"];
}

export interface VectorWallCircuit {
  id: string;
  pathId: string;
  parentCircuitId?: string;
}

export interface VectorRegion {
  id: string;
  kind: "district" | "reservation" | "forest" | "farm" | "park" | "cemetery";
  outer: Point[];
  holes: Point[][];
}

export interface VectorPlacement {
  id: string;
  modelId: string;
  position: Point;
  facingDegrees: number;
  origin: VectorPath["origin"];
  editPolicy: VectorPath["editPolicy"];
  site: { outer: Point[]; holes: Point[][] };
  accesses: CurveAnchor[];
}

/** Saved geometry ledger. No editable cell mesh or render-time generation. */
export interface VectorCityDocument {
  format: "fmg-vector-city";
  version: 3;
  revision: number;
  frame: { extentMeters: number };
  context: { historicalPeriod: HistoricalPeriod; targetPopulation: number; bridgeSkewTier?: 0 | 1 | 2 };
  paths: Record<string, VectorPath>;
  connections: {
    nodes: Record<string, VectorNode>;
    edges: Record<string, VectorRoadEdge>;
    gates: Record<string, VectorGate>;
    circuits: Record<string, VectorWallCircuit>;
    bridges: Record<string, VectorBridge>;
    wallRoads: Record<
      string,
      { id: string; pathId: string; outerCircuitId: string; innerCircuitId: string; clearanceMeters: number }
    >;
  };
  regions: Record<string, VectorRegion>;
  placements: Record<string, VectorPlacement>;
  recipe: { algorithm: "vector-city-v1"; seed: string };
}
