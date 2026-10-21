import type { InfillLane } from "../types/contracts/localInfill";
import type { Id, Point } from "../types/primitives";
import type { BuildingLot } from "./buildingLots.types";

export interface FarmPlot {
  plotId?: string;
  orientationRadians?: number;
  managementGroupId?: string;
  system?: import("../types/contracts/ruralFields").RuralFieldSystem | "market-garden";
  cropState?: "winter-crop" | "spring-crop" | "fallow" | "horticulture" | "crop";
  rotationGroup?: number;
  holdingPolygon?: Point[];
  clippedByFrame?: boolean;
  tenureStrips?: Point[][];
  boundaryKind?: "hedge" | "wall";
  boundaries?: Point[][];
  sourceFaceIds?: Id[];
  faceId: Id;
  polygon: Point[];
  rows: Point[][];
  kind?: "open-field" | "kitchen-garden";
}

export interface CityFabric {
  parcels?: import("./parcelTypes").ParcelPlan[];
  openSpaces?: import("../types/contracts/parcelTypes").OpenSpace[];
  harbor?: import("./harborFabric").HarborPlan;
  farms?: FarmPlot[];
  parks?: import("./parkFabric").ParkLawn[];
  watermills?: import("./watermillFabric").WatermillPlan;
  buildings: BuildingLot[];
  lanes: InfillLane[];
  /** Portals shared by adjacent faces, or opening onto a major road. */
  entrances: Map<Id, Point[]>;
}
