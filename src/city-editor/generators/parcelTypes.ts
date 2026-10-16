import type { OpenSpace } from "../types/contracts/parcelTypes";
import type { Id, Point, WardKind } from "../types/primitives";
import type { BuildingLot } from "./buildingLots.types";

import type { ParcelArchetype } from "./parcelArchetypes";

export { PARCEL_ARCHETYPES, type ParcelArchetype } from "./parcelArchetypes";

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
