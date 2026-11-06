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
    accessIndex: number;
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
  unplacedFacilities: { id: string; reason: "space" | "river" | "district" | "budget" }[];
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
export interface VectorUrban {
  algorithm: "vector-urban-v1";
  inputRevision: number;
  settings: VectorUrbanSettings;
  baseGeneration: VectorGeneration;
  baseConnections: VectorCityDocument["connections"];
  baseContext: VectorCityDocument["context"];
  domain: VectorPolygon[];
  laneBlocks: VectorBlock[];
  residualLand: VectorPolygon[];
  districts: { id: string; use: VectorUse; inside: boolean; polygon: VectorPolygon }[];
  ownedPaths: string[];
  ownedPlacements: string[];
  adoptedFingerprint: string;
  checkpoints: VectorUrbanCheckpoint[];
  assignments: { placementId: string; dwellings: number; population: number }[];
  report: VectorUrbanReport;
}
