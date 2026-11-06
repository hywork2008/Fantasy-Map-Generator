import type { BurgSiteDescriptor } from "../contracts/burgSiteDescriptor";
import type { Point } from "../primitives";
import type { VectorNode, VectorPath } from "./document";
export interface VectorPolygon {
  outer: Point[];
  holes: Point[][];
}
export interface VectorSite {
  kind: "fmg" | "synthetic";
  id: string;
  revision: number;
  transform: { originMapUnits: Point; metersPerMapUnit: number; localAxes: "east-north" };
  center: Point;
  domain: VectorPolygon[];
  water: { id: string; riverPathId?: string; polygons: VectorPolygon[] }[];
  fixedPaths: VectorPath[];
  crossings: {
    id: number;
    riverId: number;
    geometryVersion: number;
    bridgeId: string;
    routeIds: number[];
    waterA: Point;
    waterB: Point;
    deckA: Point;
    deckB: Point;
    approachA: Point;
    approachB: Point;
  }[];
  descriptor?: BurgSiteDescriptor;
}
export interface VectorGenerationSettings {
  seed: string;
  roadWidthMeters: number;
  clearanceMeters: number;
  branches: number;
  wall: "none" | "rectangle" | "ellipse";
}
export interface VectorBlock extends VectorPolygon {
  id: string;
  areaMeters2: number;
  frontage: { pathId: string; from: Point; to: Point; lengthMeters: number }[];
  reachable: boolean;
}
export interface VectorGeneration {
  algorithm: "vector-skeleton-v1";
  sourceRevision: number;
  settings: VectorGenerationSettings;
  pathRevisions: Record<string, number>;
  connectionFingerprint: string;
  blocks: VectorBlock[];
  diagnostics: { code: string; entityId: string; severity: "warning" | "error" }[];
  inputRevision: number;
  inputNodes: VectorNode[];
}
