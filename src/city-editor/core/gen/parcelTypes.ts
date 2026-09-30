import type { Id, Point, WardKind } from "../types";
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

export type OpenSpaceKind =
  | "backyard"
  | "kitchen-garden"
  | "workyard"
  | "courtyard"
  | "formal-garden"
  | "loading-yard"
  | "quay";
export interface OpenSpace {
  id: Id;
  faceId: Id;
  parcelId?: Id;
  kind: OpenSpaceKind;
  polygon: Point[];
  access: "private" | "shared";
}
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
