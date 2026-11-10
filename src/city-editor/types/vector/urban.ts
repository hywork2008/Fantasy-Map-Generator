import type { VectorCityDocument } from "./document";
import type { VectorBlock, VectorGeneration, VectorPolygon } from "./generation";
export type VectorStage = "inputs" | "skeleton" | "regions" | "blocksAndLanes" | "facilities" | "housing";
export type VectorUse = "commerce" | "craft" | "hazard" | "river" | "residential";
export interface VectorUrbanSettings {
  mode: "medieval" | "medieval-facilities";
  population: number;
  houseModelId: string;
  laneWidthMeters: number;
  laneSpacingMeters: number;
  maxLanes: number;
  clearanceMeters: number;
  allowExpansion: boolean;
  /** Share of CE lots built on (0.1–1), as CE's lot occupancy: 1 leaves no gaps, 0.5 builds every other lot.
   * Absent means 1. */
  lotOccupancy?: number;
}
export interface VectorBuilding {
  kind: "facility" | "housing";
  label: string;
  pool?: string;
  districtId: string;
  provenance: "bv" | "provisional";
  dimensionSource: string;
  heightMeters?: number;
  footprint: VectorPolygon[];
  reserved: VectorPolygon[];
  entrances: {
    id: string;
    point: [number, number];
    outward: [number, number];
    widthMeters: number;
    connector: [number, number][];
    /** Index into the placement's `accesses` (a `VectorPath`). Exactly one of this and `fabricLine`. */
    accessIndex?: number;
    /** A street or lane of the fabric records: `<district id>~s<n>` or `<street block id>~l<n>`. */
    fabricLine?: string;
  }[];
  dwellings: number;
  floorFootprintMeters2: number;
  storeys: number;
  residentialShare: number;
  riverbankDistanceMeters?: number;
}
export interface VectorUrbanReport {
  targetPopulation: number;
  requiredDwellings: number;
  capacityDwellings: number;
  assignedDwellings: number;
  unplacedDwellings: number;
  assignedPopulation: number;
  unplacedPopulation: number;
  mixedDwellings: number;
  capacityInside: number;
  capacityOutside: number;
  requiredFacilities: number;
  placedFacilities: number;
  provisionalFacilities: number;
  unplacedFacilities: { id: string; reason: "space" | "river" | "district" | "budget" | "unsearched" }[];
  housingBuildings: number;
  reasons: string[];
}
export interface VectorUrbanCheckpoint {
  id: VectorStage;
  pathIds: string[];
  placementIds: string[];
  capacityDwellings: number;
  assignedDwellings: number;
  assignedPopulation: number;
  unplacedPopulation: number;
}
/** v1: skeleton blocks filled without street blocks (to 2026-11-08). v2: CE coarse-mesh street blocks,
 * road facade clearance and wall orientation in the perimeter fabric. v3: each street block laid out on its
 * own random stream. v4: districts keyed by outline and fronting roads instead of block order. v5: medieval
 * districts, street blocks, lanes and houses saved as fabric records (native v8) instead of paths and
 * placements. v10: house storeys by the mesh editor's height variation and height limit (P3b). v11: lots kept off gate openings
 * and junction discs exactly (P4a). v12: wall shapes turned in 48 steps and checked against their gates; double
 * walls (P4b). v14: house storeys by the economic ward of the street block (P6g). v15: roadside ribbon beyond the wall (P7a). v16: park wards laid out as lawns (P7c); water points (P7d). Saved output of
 * an older version stays as adopted. */
export type VectorUrbanAlgorithm =
  | "vector-urban-v1"
  | "vector-urban-v2"
  | "vector-urban-v3"
  | "vector-urban-v4"
  | "vector-urban-v5"
  | "vector-urban-v6"
  | "vector-urban-v7"
  | "vector-urban-v8"
  | "vector-urban-v9"
  | "vector-urban-v10"
  | "vector-urban-v11"
  | "vector-urban-v12"
  | "vector-urban-v13"
  | "vector-urban-v14"
  | "vector-urban-v15"
  | "vector-urban-v16"
  | "vector-urban-v17";
export interface VectorUrban {
  algorithm: VectorUrbanAlgorithm;
  inputRevision: number;
  settings: VectorUrbanSettings;
  baseGeneration: VectorGeneration;
  baseConnections: VectorCityDocument["connections"];
  baseContext: VectorCityDocument["context"];
  domain: VectorPolygon[];
  laneBlocks: VectorBlock[];
  residualLand: VectorPolygon[];
  districts: {
    id: string;
    use: VectorUse;
    inside: boolean;
    polygon: VectorPolygon;
    /** The economic ward, by the mesh editor's ward mix (P6g); town districts only. */
    ward?: import("../geometry").WardKind;
    craftDomain?: import("../contracts/burgSiteEconomy").GuildDomain;
  }[];
  /** Park wards laid out as lawns by the mesh editor's park fabric (P7c); no house stands on them. */
  parks?: VectorPark[];
  /** Wells, cisterns, the plaza basin and the service pond, by the mesh editor's water points (P7d). */
  wells?: VectorWaterPoint[];
  ownedPaths: string[];
  ownedPlacements: string[];
  adoptedFingerprint: string;
  checkpoints: VectorUrbanCheckpoint[];
  assignments: { placementId: string; dwellings: number; population: number }[];
  report: VectorUrbanReport;
}

/** A park ward's lawn, by the mesh editor's park fabric (`layoutParkLawn`): lawns, a walkway, tufts and canopies. */
export interface VectorPark {
  /** The street block of the park ward. */
  id: string;
  lawns: [number, number][][];
  paths: [number, number][][];
  tufts: [number, number][];
  trees: { center: [number, number]; radius: number; subCircles: { offset: [number, number]; radius: number }[] }[];
}

/** A water point by the mesh editor's rules (`layoutDomesticWater`). */
export interface VectorWaterPoint {
  id: string;
  kind: "well" | "publicBasin" | "cistern" | "spring" | "pond";
  name: string;
  center: [number, number];
  radius: number;
  footprint: [number, number][];
  access: [number, number][];
  placement: "plaza" | "neighborhood" | "outskirts";
  use: "domestic" | "service";
}
