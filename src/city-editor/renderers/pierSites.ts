import type { HarborPlan } from "../generators/harborFabric";
import type { CityDocument, Point } from "../types/document";
import { fallbackHarborPiers, plannedHarborPiers } from "./harborPierFacts";

export interface PierSite {
  id: string;
  /** Shore-left, head-left, head-right, shore-right, matching the town SVG. */
  deck: Point[];
  depth: number;
}

/** Follow the SVG's planned/fallback choice, including removal of flooded harbor wards. */
export function collectPierSites(city: CityDocument, harbor: HarborPlan | undefined): PierSite[] {
  if (harbor?.piers.length) {
    return plannedHarborPiers(city, harbor).map(pier => ({ id: pier.id, deck: pier.polygon, depth: pier.depth }));
  }
  return fallbackHarborPiers(city).map((pier, index) => ({
    id: `fallback-pier:${pier.waterFaceId}:${index}`,
    deck: pier.deck,
    depth: pier.depthMeters
  }));
}
