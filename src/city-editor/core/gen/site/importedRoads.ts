import { townMeshExtentMeters } from "../../document";
import type { CityGeography, Point } from "../types";
import type { BurgSiteDescriptor } from "./burgSiteDescriptor";

/** Stop at the first town-mesh crossing. A widened display still shows the
 * river, but the source road meets the mesh edge instead of that outer frame. */
export function importedRoadsForSite(site: BurgSiteDescriptor): NonNullable<CityGeography["importedRoads"]> {
  const half = townMeshExtentMeters(site.frame) / 2;
  return site.roads.flatMap((road, sourceIndex) => {
    if (road.group === "searoutes" || road.path.length < 2) return [];
    const path: Point[] = [[...road.path[0]]];
    for (let i = 1; i < road.path.length; i++) {
      const a = road.path[i - 1],
        b = road.path[i];
      let t = 1;
      for (let axis = 0; axis < 2; axis++) {
        if (b[axis] > half) t = Math.min(t, (half - a[axis]) / (b[axis] - a[axis]));
        if (b[axis] < -half) t = Math.min(t, (-half - a[axis]) / (b[axis] - a[axis]));
      }
      path.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      if (t < 1) break;
    }
    const terminal = path.at(-1)!;
    const landing =
      road.sharedCrossingId !== undefined && Math.max(Math.abs(terminal[0]), Math.abs(terminal[1])) < half - 1e-7;
    return [{ sourceIndex, routeId: road.routeId, path, ...(landing ? { riverLanding: true } : {}) }];
  });
}
