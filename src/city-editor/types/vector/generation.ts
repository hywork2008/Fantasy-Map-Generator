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
  wall: "none" | "rectangle" | "ellipse" | import("../generation").WallShape;
  /** `polygon` and `bastioned` walls: number of sides (3–12). */
  wallSides?: number;
  /** Generated wall material; sets its thickness and 3D body. Absent keeps the 2 m wall of a preset. */
  wallMaterial?: "stone" | "wood";
  /** Double walls (P4b): an old-town wall of the same outline holding `share` of the walled area, standing or
   * razed to a boulevard; built after the streets (outer-first, default) or before them. */
  innerWall?: { share: number; state: "standing" | "razed"; order?: "outer-first" | "inner-first" };
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
