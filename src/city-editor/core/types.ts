export type Id = string;
export type Point = [number, number];

export type WaterKind = "land" | "sea" | "lake" | "openWater";
export type WardKind =
  | "market"
  | "castle"
  | "merchant"
  | "craftsmen"
  | "patriciate"
  | "harbor"
  | "park"
  | "farm"
  | "cemetery"
  | "empty";
export type BuildingPattern = "legacy" | "medieval";
export type BuildingComposition = "standard" | "commercial" | "warehouses" | "estates";
export type HarborPreset = "small" | "dense" | "warehouse";

export type HistoricalPeriod =
  | "classicalAntiquity"
  | "earlyMedieval"
  | "highMedieval"
  | "lateMedieval"
  | "ageOfExploration"
  | "maritimeEra"
  | "preIndustrialEra"
  | "steamEra"
  | "industrialChemistryEra"
  | "petroleumEra"
  | "rocketryEra";

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
  crossing?: import("../../utils/riverCrossing").RiverCrossingPlan;
  id: Id;
  kind: "road" | "wall" | "plank";
  name: string;
  segments: EdgeRef[];
  style: LineStyle;
  locked: boolean;
  /** Set on roads that leave an outer-wall gate for the map exterior. */
  beyond?: ApproachBeyond;
  /** Source FMG land-road leg; distinguishes external approaches from local streets. */
  sourceRoad?: { index: number; routeId: number };
  /** River-through-wall passages; distinct from gates that require road access. */
  riverPassages?: Id[];
}

export interface RiverGroup {
  crossing?: import("../../utils/riverCrossing").RiverCrossingPlan;
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

export type ElementKind = "plaza" | "citadel" | "temple" | "harbor" | "gate" | "tower" | "tree" | "ship";

export interface CityElement {
  id: Id;
  kind: ElementKind;
  faceIds: Id[];
  /** Point-anchored elements such as imported MFCG trees do not belong to a face. */
  point?: Point;
  sizeMeters?: number;
  /** Long-axis angle in radians, CCW from +X. Temples and ships use this. */
  rotation?: number;
  locked: boolean;
  shipType?: "small" | "medium" | "large" | "barge";
}

export interface LandmarkPolygon {
  outer: Point[];
  holes: Point[][];
}

export interface LandmarkAsset {
  id: string;
  revision: string;
  name: string;
  historicalPhase: string;
  referenceSizeMeters: [number, number];
  dimensionSource: string;
  footprint: LandmarkPolygon[];
  minimumSite: LandmarkPolygon[];
  entrances: Array<{ id: string; point: Point; outward: Point; widthMeters: number; required: boolean }>;
  /** Static, normalized SVG markup, retained with the document for offline display. */
  renderSvg: string;
  provenanceId: string;
}

export interface LandmarkInstance {
  id: Id;
  assetId: string;
  assetRevision: string;
  position: Point;
  rotation: number;
  scale: number;
  site: LandmarkPolygon[];
  accesses: Array<{
    entranceId: string;
    points: Point[];
    widthMeters: number;
    target: { kind: "road" | "lane"; id: string; point: Point };
  }>;
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
  /** Water ribbon derived from the physical curtain, outside the enclosed area. */
  moat?: { enabled: boolean; widthMeters: number };
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

export type CemeteryForm = "churchyard" | "cloister" | "field";

export type CemeteryPartRole = "chapel" | "ossuary" | "rectory" | "calvary" | "graves";

export interface CemeteryPart {
  id: Id;
  role: CemeteryPartRole;
  footprint: Point[];
  entrances: Point[];
  locked: boolean;
}

export interface CemeteryPlan {
  id: Id;
  version: 1;
  seed: string;
  form: CemeteryForm;
  faceId: Id;
  boundary: Point[];
  courtyards: Point[][];
  parts: CemeteryPart[];
  accesses: Array<{ points: Point[]; widthMeters: number }>;
  trees: Point[];
  gatePoint?: Point;
  provenance: "generated" | "manual" | "legacy";
  locked: boolean;
}

export interface DistrictParameters {
  composition?: BuildingComposition;
  /** Relative size variation within each archetype (0–1). */
  sizeVariation?: number;
  /** Relative amount of private garden / yard (0–1). */
  gardenAmount?: number;
  parcelCoverage?: number;
  harborPreset?: HarborPreset;
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
  version: 2 | 3 | 4 | 5;
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
  waterAccess?: import("../../types/burgWater").BurgWaterAccess;
  format: "fmg-city-editor";
  version: 1 | 2 | 3;
  landmarks?: LandmarkInstance[];
  landmarkAssets?: LandmarkAsset[];
  /** Generated ocean faces; distinguishes saltwater shore from lake shores. */
  coastalOceanFaceIds?: Id[];
  /** Number of source FMG land-road legs; absent for standalone/legacy documents. */
  importedRoadCount?: number;
  /** Continuous imported water, independent of the editable street-block mesh. */
  waterAreas?: { kind: "river"; polygon: Point[] }[];
  defenseCircuits?: DefenseCircuit[];
  castles?: CastlePlan[];
  cemeteries?: CemeteryPlan[];
  /** Absent on legacy documents, which keep their existing generation behavior. */
  gridKind?: "hex" | "voronoi" | "evolution";
  fabric?: FabricPlan;
  frame: { extentMeters: number; cityRadiusMeters: number; blockSizeMeters: number };
  /** Completed cities open in the building/ink view; editing uses the same mesh. */
  appearance?: "town";
  /** Historical backdrop / technological era. Defaults to "ageOfExploration". */
  historicalPeriod?: HistoricalPeriod;
  /** Missing on old maps: retain their original housing generator. */
  buildingPattern?: BuildingPattern;
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

export type Tool =
  | "select"
  | "vertex"
  | "road"
  | "wall"
  | "river"
  | "ward"
  | "sea"
  | "wardWall"
  | "junction"
  | "face"
  | "landmark"
  | "ship";
