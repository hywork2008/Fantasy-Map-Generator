export type Id = string;
export type Point = [number, number];

export type WaterKind = "land" | "sea" | "lake" | "openWater";
export type WardKind = "market" | "castle" | "merchant" | "craftsmen" | "harbor" | "park" | "empty";

export interface FaceProperties {
  /** Generated land-use extent; local infill never changes mesh topology. */
  settlement?: "core" | "outskirts";
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
  kind: "road" | "wall" | "plank";
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

export type ElementKind = "plaza" | "citadel" | "temple" | "harbor" | "gate" | "tower" | "tree";

export interface CityElement {
  id: Id;
  kind: ElementKind;
  faceIds: Id[];
  /** Point-anchored elements such as imported MFCG trees do not belong to a face. */
  point?: Point;
  sizeMeters?: number;
  locked: boolean;
}

/** A gate is an opening in an outer wall, anchored to a Wall route vertex. */
export interface CityGate {
  id: Id;
  vertexId: Id;
  locked: boolean;
}

export interface CityDocument {
  format: "fmg-city-editor";
  version: 1;
  /** Absent on legacy documents, which keep their existing generation behavior. */
  gridKind?: "hex" | "voronoi" | "evolution";
  frame: { extentMeters: number; cityRadiusMeters: number; blockSizeMeters: number };
  /** Completed cities open in the building/ink view; editing uses the same mesh. */
  appearance?: "town";
  /** A non-editable source image, for example an imported MFCG SVG. */
  referenceImage?: { href: string; width: number; height: number };
  mesh: Mesh;
  featureGroups: FeatureGroup[];
  gates: CityGate[];
  /** Imported point decorations such as trees; Ward landmarks are derived at render time. */
  elements: CityElement[];
}

export type Tool = "select" | "vertex" | "road" | "wall" | "river" | "ward" | "sea" | "wardWall" | "junction" | "face";
