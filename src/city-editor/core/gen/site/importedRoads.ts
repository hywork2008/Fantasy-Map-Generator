import type { CityGeography, Point } from "../types";
import type { BurgSiteDescriptor } from "./burgSiteDescriptor";

/** Stop at the first frame crossing; a fitted city must keep the source road's
 * intersection with its smaller frame, rather than inventing a radial exit. */
export function importedRoadsForSite(site: BurgSiteDescriptor): NonNullable<CityGeography["importedRoads"]> {
  const half = site.frame.extentMeters / 2;
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
    return [{ sourceIndex, routeId: road.routeId, path }];
  });
}
