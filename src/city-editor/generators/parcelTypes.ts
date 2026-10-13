import type { OpenSpace } from "../types/contracts/parcelTypes";
import type { Id, Point, WardKind } from "../types/document";
import type { BuildingLot } from "./buildingLots";

export const PARCEL_ARCHETYPES = [
  "small-house",
  "shop-house",
  "workshop-house",
  "merchant-house",
  "warehouse-compound",
  "patrician-house",
  "elite-compound",
  "port-workyard"
] as const;
export type ParcelArchetype = (typeof PARCEL_ARCHETYPES)[number];

export interface ParcelAccess {
  kind: "street" | "cargo";
  points: Point[];
  widthMeters: number;
}
export interface ParcelPlan {
  id: Id;
  faceIds: Id[];
  polygon: Point[];
  ward: WardKind | null;
  archetype: ParcelArchetype;
  buildings: BuildingLot[];
  openSpaces: OpenSpace[];
  access: ParcelAccess[];
}
export interface ParcelFrontage {
  a: Point;
  b: Point;
  widthMeters: number;
  cargo?: boolean;
}
