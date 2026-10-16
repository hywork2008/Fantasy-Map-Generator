import type { RegionalContext } from "../../../types/cityRegional";
import type { Point } from "../primitives";

export interface CitySceneRegions {
  version: 1;
  coreBoundary: Point[];
  regionalContext: RegionalContext;
  connectors: RegionConnector[];
}

export interface RegionConnector {
  routeId: number;
  branchId: number;
  boundaryPoint: Point;
  corePoint?: Point;
  status: "connected" | "unresolved";
}
