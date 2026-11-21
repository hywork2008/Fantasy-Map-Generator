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
  /**
   * How the tanners' row meets the river's bends: `continuous` (default when absent) keeps one row with one lane
   * round them; `leat` digs a tanners' leat wherever the bends break the row into several reaches.
   */
  tanneryBends?: TanneryBends;
  /** Street blocks of house-sized lots (`compact`, absent) or historical burgage plots
   * (docs/plan/ce-burgage-plot-fabric.md). */
  plotFabric?: import("../contracts/burgage").PlotFabric;
}
export type TanneryBends = "continuous" | "leat";
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
  /** A facility's second building on its plot (the rear works behind a shop-house, docs/plan/ce-town-trade-rear-works.md
   * R2): the placement it belongs to. The facility is reported once, by that placement. */
  annexOf?: string;
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
  unplacedFacilities: {
    id: string;
    /** `offMap`: taken to stand beyond the map's edge (kiln works out along the roads), not a shortfall. */
    reason: "space" | "river" | "district" | "budget" | "unsearched" | "frame" | "plot" | "offMap";
  }[];
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
 * walls (P4b). v14: house storeys by the economic ward of the street block (P6g). v15: roadside ribbon beyond the wall (P7a). v16: park wards laid out as lawns (P7c); water points (P7d). v18: facility mode lays the CE street blocks round its facilities. v19: burgage plots (`plotFabric`; compact
 * street blocks stay v18). v20: dense burgage plots. v21–v23: compact, burgage and dense burgage with the Opus
 * shop-house workhomes, their street fronts saved and, on plots, fitted to one plot each
 * (docs/plan/bv-workhome-facade-variation.md W3, W4). v61: compact lots in medium-sized lane-bounded blocks
 * (`compact-medium`, `compactBlockScale`). Saved output of
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
  | "vector-urban-v17"
  | "vector-urban-v18"
  | "vector-urban-v19"
  | "vector-urban-v20"
  | "vector-urban-v21"
  | "vector-urban-v22"
  | "vector-urban-v23"
  | "vector-urban-v24"
  | "vector-urban-v25"
  | "vector-urban-v26"
  | "vector-urban-v27"
  | "vector-urban-v28"
  | "vector-urban-v29"
  | "vector-urban-v30"
  | "vector-urban-v31"
  | "vector-urban-v32"
  | "vector-urban-v33"
  | "vector-urban-v34"
  | "vector-urban-v35"
  | "vector-urban-v36"
  | "vector-urban-v37"
  | "vector-urban-v38"
  | "vector-urban-v39"
  | "vector-urban-v40"
  | "vector-urban-v41"
  | "vector-urban-v42"
  | "vector-urban-v43"
  | "vector-urban-v44"
  | "vector-urban-v45"
  | "vector-urban-v46"
  | "vector-urban-v47"
  | "vector-urban-v48"
  | "vector-urban-v49"
  | "vector-urban-v50"
  | "vector-urban-v51"
  | "vector-urban-v52"
  | "vector-urban-v53"
  | "vector-urban-v54"
  | "vector-urban-v55"
  | "vector-urban-v56"
  | "vector-urban-v57"
  | "vector-urban-v58"
  | "vector-urban-v59"
  | "vector-urban-v60"
  | "vector-urban-v61";
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
