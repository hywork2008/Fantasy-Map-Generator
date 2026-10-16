import type { AerialLandmarkPlan } from "./aerialLandmarks.types";
import type { CityFabric, FarmPlot } from "./localInfill.types";
import type { ParkLawn } from "./parkFabric";
import type { WatermillPlan } from "./watermillFabric";

export interface DistrictFabric extends CityFabric {
  farms: FarmPlot[];
  parks?: ParkLawn[];
  watermills?: WatermillPlan;
  /** Monasteries, windmills, barbicans, tanneries and gallows (aerialLandmarks.ts). */
  aerialLandmarks?: AerialLandmarkPlan;
}
