import type { Point } from "../primitives";

/** Saved reservations; each stall's pose and BV tier remain on its CityElement. */
export interface MarketSite {
  version: 1;
  id: string;
  setting: "plaza" | "river-port" | "sea-port";
  anchorElementId: string;
  boundary: Point[];
  accessPaths: Point[][];
  reservedAreas: Point[][];
  stallElementIds: string[];
  /** Protected freight routes, separate from the four-metre customer aisles. */
  cargoAccessPaths?: Point[][];
}
