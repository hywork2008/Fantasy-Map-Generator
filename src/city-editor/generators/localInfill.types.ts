import type { InfillLane } from "../types/contracts/localInfill";
import type { FarmPlot } from "../types/contracts/ruralFields";
import type { Id, Point } from "../types/primitives";
import type { BuildingLot } from "./buildingLots.types";

export type { FarmPlot } from "../types/contracts/ruralFields";

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
