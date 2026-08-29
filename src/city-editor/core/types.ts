export type Id = string;
export type Point = [number, number];

export type WaterKind = "land" | "sea" | "lake" | "openWater";
export type WardKind = "market" | "castle" | "merchant" | "craftsmen" | "harbor" | "park" | "empty";

export interface FaceProperties {
  /** Metres relative to sea level. `0` and below are water. */
  elevation: number;
  water: WaterKind;
  ward: WardKind | null;
  buildable: boolean;
  locked: boolean;
}

export interface Vertex {
  id: Id;
  point: Point;
  locked: boolean;
}

export interface Edge {
  id: Id;
  a: Id;
  b: Id;
  leftFace: Id | null;
  rightFace: Id | null;
  locked: boolean;
}

export interface EdgeRef {
  edgeId: Id;
  forward: boolean;
}

export interface Face {
  id: Id;
  boundary: EdgeRef[];
  site?: Point;
  properties: FaceProperties;
}

export interface Mesh {
  vertices: Record<Id, Vertex>;
  edges: Record<Id, Edge>;
  faces: Record<Id, Face>;
}

export interface LineStyle {
  widthMeters: number;
  color: string;
}

export interface EdgeFeatureGroup {
  id: Id;
  kind: "road" | "wall";
  name: string;
  segments: EdgeRef[];
  style: LineStyle;
  locked: boolean;
}

export interface RiverGroup {
  id: Id;
  kind: "river";
  name: string;
  /** Upstream → downstream. Each adjacent pair is connected by one Mesh edge. */
  vertices: Id[];
  source: { vertexId: Id; kind: "mapBoundary" | "spring" | "tributary" } | null;
  mouth: { vertexId: Id; kind: "mapBoundary" | "water" | "river"; targetId?: Id } | null;
  style: LineStyle;
  locked: boolean;
}

export type FeatureGroup = EdgeFeatureGroup | RiverGroup;

export type ElementKind = "plaza" | "citadel" | "temple" | "harbor" | "gate" | "tower";

export interface CityElement {
  id: Id;
  kind: ElementKind;
  faceIds: Id[];
  locked: boolean;
}

export interface CityDocument {
  format: "fmg-city-editor";
  version: 1;
  frame: { extentMeters: number; cityRadiusMeters: number };
  mesh: Mesh;
  featureGroups: FeatureGroup[];
  elements: CityElement[];
}

export type Tool = "select" | "vertex" | "road" | "wall" | "river" | "face";
