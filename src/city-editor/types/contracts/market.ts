import type { Point } from "../primitives";

/** Saved reservations; each stall's pose and BV tier remain on its CityElement. */
export interface MarketSite {
  version: 1;
  id: string;
  setting: "plaza";
  anchorElementId: string;
  boundary: Point[];
  accessPaths: Point[][];
  reservedAreas: Point[][];
  stallElementIds: string[];
}
