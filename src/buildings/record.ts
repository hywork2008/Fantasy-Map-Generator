import type { HistoricalPeriod } from "../types/historicalPeriod";

export const BUILDING_RECORD_FORMAT = "fmg-building-record" as const;
export const BUILDING_RECORD_VERSION = 1 as const;

export type BuildingKind = "castle" | "monastery" | "house" | "watermill" | "dungeon";

export type PlanFamily =
  | "rectangular-keep"
  | "keep-with-forebuilding"
  | "apsidal-keep"
  | "polygonal-keep"
  | "octagonal"
  | "concentric"
  | "quadrangular"
  | "tower-house"
  | "donjon-chemise"
  | "procedural-rooms"
  | "other";

export const CASTLE_PLAN_FAMILIES = [
  "rectangular-keep",
  "keep-with-forebuilding",
  "apsidal-keep",
  "polygonal-keep",
  "octagonal",
  "concentric",
  "quadrangular",
  "tower-house",
  "donjon-chemise"
] as const satisfies readonly PlanFamily[];

export const MEDIEVAL_PERIODS = [
  "earlyMedieval",
  "highMedieval",
  "lateMedieval"
] as const satisfies readonly HistoricalPeriod[];

export type Confidence = "measured" | "scholarly-reconstruction" | "approximate";
export type Point = [number, number];
export type PlacementStyle = "classic" | "norman-keep" | "concentric";

export interface WallLoop {
  id: string;
  kind: "curtain" | "keep" | "tower" | "range" | "partition" | "chemise";
  /** Solid between outer and holes. Thickness is the polygon, not an offset applied later. */
  outer: Point[];
  holes: Point[][];
  /** Label only. Curtains may exceed 2 m. */
  thicknessMeters: number;
  /** Required on kind "dungeon". Catalogue walls may omit it. */
  locked?: boolean;
}

export interface FloorPlate {
  id: string;
  use: string;
  outer: Point[];
  holes: Point[][];
  /** Required on kind "dungeon". */
  label?: string;
  kind?: "room" | "corridor" | "courtyard" | "yard" | "hall" | "court" | "other";
  roof?: "covered" | "open";
  locked?: boolean;
}

export interface FixtureRecord {
  id: string;
  plateId: string;
  kind: "well" | "table";
  footprint: Point[];
  /** v1 fixtures stay decorative. */
  blocking: false;
  locked: boolean;
}

/**
 * A gap between two plates. Not a wall and not a door.
 * Required on kind "dungeon" (the array may be empty). Other kinds omit the field.
 */
export interface OpenJoin {
  id: string;
  plateA: string;
  plateB: string;
  /**
   * Shared-edge length minus, at each end, the maximum of thicknessMeters / 2
   * among perpendicular barrier "wall" edges. Same quantity as boundaryClearance.
   */
  clearanceMeters: number;
}

/** null hole = that wall's outer ring. A number indexes WallLoop.holes. */
export interface OpeningRing {
  wallId: string;
  hole: number | null;
}

export interface OpeningRecord {
  id: string;
  ring: OpeningRing;
  /** Distance along that ring, from vertex 0 to the opening start. */
  offsetMeters: number;
  widthMeters: number;
  sillMeters: number;
  heightMeters: number;
  kind: "door" | "gate" | "arch" | "window" | "arrow-slit" | "postern";
  /** Required on kind "dungeon". Omitted on a catalogue castle. */
  state?: "open" | "closed" | "locked";
  visibility?: "visible" | "secret";
  role?: "main" | "secondary" | "none";
  locked?: boolean;
}

export interface LevelRecord {
  id: string;
  name: string;
  /** Metres above the local datum. A basement may be negative. */
  elevationMeters: number;
  /** Authoritative floor-to-floor height. Roof rise is not included. */
  floorToFloorMeters: number;
  plates: FloorPlate[];
  walls: WallLoop[];
  openings: OpeningRecord[];
  /** Required on kind "dungeon", and may be empty. Catalogue levels omit it. */
  openJoins?: OpenJoin[];
  fixtures: FixtureRecord[];
}

export interface VerticalLink {
  id: string;
  kind: "stair" | "ladder" | "ramp";
  fromLevelId: string;
  toLevelId: string;
  /** Footprint on the lower level. */
  footprint: Point[];
  widthMeters: number;
}

export interface RoofRecord {
  /** Wall or plate id the roof sits on. */
  baseId: string;
  form: "flat" | "gable" | "hip" | "pyramid" | "cone";
  pitchDeg: number;
  ridgeAzimuth?: number;
}

export interface Provenance {
  constructionPeriod: string;
  depictedPhase: string;
  omitted: string[];
  dimensionSource: string;
  /** "well-published-survey" means a plan exists but this document did not pin every side. */
  planClass: "published-dimensions" | "well-published-survey";
  confidence: Confidence;
  /** Original simplification, not a facsimile. */
  note: string;
}

/** Enough to regenerate a procedural dungeon. Moved off the old dungeon document. */
export interface DungeonGenerationSettings {
  strategy: "caravanserai" | "room-corridor";
  seed: string;
  widthMeters: number;
  depthMeters: number;
  courtyardWidthMeters: number;
  courtyardDepthMeters: number;
  roomBandDepthMeters: number;
  minRoomWidthMeters: number;
  corridorWidthMeters: number;
  entranceWidthMeters: number;
  entranceSide: "north" | "east" | "south" | "west";
  symmetric: boolean;
  outerWallMeters: number;
  partitionWallMeters: number;
  roomCount: number;
  loopCount: number;
  fixtures: boolean;
}

export interface BuildingRecord {
  format: typeof BUILDING_RECORD_FORMAT;
  version: typeof BUILDING_RECORD_VERSION;
  id: string;
  revision: number;
  contentHash: string;
  name: string;
  kind: BuildingKind;
  period: HistoricalPeriod;
  /** Optional for monastery, house, and watermill. Required for castle and dungeon. */
  planFamily?: PlanFamily;
  region: string;
  /** Axis-aligned size of the outer works at scale 1, in the local frame. */
  occupancyMeters: { width: number; depth: number };
  /**
   * Catalogue castles only. atan2(gy - cy, gx - cx) from the occupancy
   * centre through the main-gate outer face. Plan space, +Y north.
   */
  approachAzimuthRadians?: number;
  placementStyles: PlacementStyle[];
  levels: LevelRecord[];
  verticalLinks: VerticalLink[];
  roofs: RoofRecord[];
  materials: {
    wall: "stone" | "brick" | "timber";
    roof: "lead" | "tile" | "slate" | "thatch" | "flat-stone";
  };
  provenance: Provenance;
  source?: { catalogueId: string; revision: number; contentHash: string };
  generation?: {
    strategy: "caravanserai" | "room-corridor";
    seed: string;
    settings: DungeonGenerationSettings;
  };
}

/** Library-neutral mass. city3d extrudes this. Not stored. */
export interface CoarseSolid {
  id: string;
  kind: "wall" | "tower" | "gate" | "range";
  outer: Point[];
  holes: Point[][];
  baseElevationMeters: number;
  heightMeters: number;
  roof: "flat" | "gable" | "hip" | "pyramid" | "cone";
  ridgeAzimuth?: number;
}

export const MAX_LEVELS = 8;
export const MAX_FRAME_METERS = 400;
export const MAX_VERTICES_PER_LEVEL = 512;
export const MIN_VERTEX_SPACING_METERS = 0.05;
export const TRIANGLE_BUDGET = 4000;
