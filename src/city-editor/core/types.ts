export type Id = string;
export type Point = [number, number];

export type WaterKind = "land" | "sea" | "lake" | "openWater";
export type WardKind = "market" | "castle" | "merchant" | "craftsmen" | "harbor" | "park" | "farm" | "empty";

export interface FaceProperties {
  /** Generated land-use extent; local infill never changes mesh topology. */
  settlement?: "core" | "outskirts";
  /** Metres relative to sea level. `0` and below are water. */
  elevation: number;
  /** Positive water depth in metres, independent of elevation. Legacy maps default to 3 m. */
  depth?: number;
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

/** FMG diplomacy relation keys. */
export type BeyondDiplomacyRelation =
  | "Ally"
  | "Friendly"
  | "Neutral"
  | "Suspicion"
  | "Enemy"
  | "Unknown"
  | "Rival"
  | "Vassal"
  | "Suzerain";

/** Realm status: either domestic (same state) or foreign diplomacy relation. */
export type BeyondRealmRelation = "domestic" | BeyondDiplomacyRelation;

export type SettlementScale = "hamlet" | "village" | "town" | "city";
export type SettlementRole = "generic" | "granary" | "market" | "fortress" | "capital";

/** Realm / diplomatic context of what lies beyond this road. */
export interface ApproachBeyondRealm {
  relation: BeyondRealmRelation;
  stateId?: number;
  stateName?: string;
}

/** Settlement / urban scale and economy of what lies beyond this road. */
export interface ApproachBeyondSettlement {
  scale: SettlementScale;
  role?: SettlementRole;
  name?: string;
  burgId?: number;
  population?: number;
  wealth?: number;
  treasury?: number;
  distanceMeters?: number;
}

/** Evaluation of the neighboring destination against the current city. */
export interface ApproachBeyondAssessment {
  utilityScore: number;
  utilityLevel: "low" | "medium" | "high" | "critical";
  utilityLabel: string;
  utilityReason: string;

  defenseScore: number;
  defenseLevel: "safe" | "low" | "medium" | "high" | "critical";
  defenseLabel: string;
  defenseReason: string;

  summary: string;
}

/** Structured indicator of what lies past the map frame at the end of an outer-gate road. */
export interface ApproachBeyondData {
  realm: ApproachBeyondRealm;
  settlement: ApproachBeyondSettlement;
  customLabel?: string;
}

/** What lies past the map frame at the end of an outer-gate road.
 * Supports modern structured object with separated realm & settlement dimensions,
 * as well as legacy short strings. */
export type ApproachBeyond = ApproachBeyondData | "city" | "granary" | "enemy" | "ally" | "hamlet";

export interface EdgeFeatureGroup {
  id: Id;
  kind: "road" | "wall" | "plank";
  name: string;
  segments: EdgeRef[];
  style: LineStyle;
  locked: boolean;
  /** Set on roads that leave an outer-wall gate for the map exterior. */
  beyond?: ApproachBeyond;
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
  /** Long-axis angle in radians, CCW from +X. Temples use this. */
  rotation?: number;
  locked: boolean;
}

/** A gate is an opening in an outer wall, anchored to a Wall route vertex. */
export interface CityGate {
  id: Id;
  vertexId: Id;
  locked: boolean;
  role?: "town" | "castle-main" | "postern" | "water";
  ownerCastleId?: Id;
  wallEdgeIds?: [Id, Id];
  passageWidthMeters?: number;
}

export interface DefenseCircuit {
  id: Id;
  scope: "town" | "castle";
  ownerCastleId?: Id;
  areaFaceIds: Id[];
  wallGroupIds: Id[];
  naturalBarriers: Array<{ kind: "waterfront" | "opening"; segments: EdgeRef[] }>;
  locked: boolean;
}

export interface CastlePart {
  id: Id;
  role: "keep" | "hall" | "range" | "service" | "chapel";
  footprint: Point[];
  entrances: Point[];
  locked: boolean;
}

export interface CastlePlan {
  id: Id;
  version: 1;
  seed: string;
  position: "edge" | "central";
  relationship: "integrated" | "detached";
  form: "keep-bailey" | "courtyard";
  circuitId: Id;
  courtyards: Point[][];
  parts: CastlePart[];
  accesses: Array<{ gateId: Id; points: Point[]; widthMeters: number }>;
  provenance: "generated" | "manual" | "legacy";
  locked: boolean;
}

export interface CastleSettings {
  position: "auto" | "edge" | "central";
  relationship: "auto" | "integrated" | "detached";
  form: "auto" | "keep-bailey" | "courtyard";
  size: "auto" | "small" | "standard" | "large";
}

export interface DistrictParameters {
  /** Fraction of eligible lots retained, not a guaranteed area coverage. */
  occupancy: number;
  /** Core: footprint fraction of each street block; outskirts: fraction of each lot. */
  coverage: number;
  lotArea: number;
  laneWidth: number;
  /** Preferred local street axes; buildings follow their actual frontage. */
  orientation: number;
}
export interface FabricDistrict {
  id: Id;
  faceIds: Id[];
  parameters: DistrictParameters;
}
export interface FabricPlan {
  /** v4 groups residential cells into road-bounded perimeter blocks. */
  version: 2 | 3 | 4;
  seed: string;
  districts: FabricDistrict[];
  /** Exact completed-generation settings; absent for manually upgraded maps. */
  generation?: {
    algorithm: "evolution-city-v3" | "castle-city-v1";
    seed: string;
    settings: import("./generate").GenerationSettings;
    input: Omit<CityDocument, "fabric">;
  };
}

export interface CityDocument {
  format: "fmg-city-editor";
  version: 1 | 2;
  defenseCircuits?: DefenseCircuit[];
  castles?: CastlePlan[];
  /** Absent on legacy documents, which keep their existing generation behavior. */
  gridKind?: "hex" | "voronoi" | "evolution";
  fabric?: FabricPlan;
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
  /** Urban morphology layout (circulade, bram, organic or classic) */
  layout?: import("./gen/site/siteConfig").CityLayout;
  /** The effective seed that succeeded in generation (including junction retries) */
  generationSeed?: string;
}

export type Tool = "select" | "vertex" | "road" | "wall" | "river" | "ward" | "sea" | "wardWall" | "junction" | "face";
