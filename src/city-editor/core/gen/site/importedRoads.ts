import { type PhysicalWaterPolygon, pointInWater } from "../../../../services/riverPhysicalGeometry";
import { townMeshExtentMeters } from "../../document";
import type { CityGeography, Point } from "../types";
import type { BurgSiteDescriptor } from "./burgSiteDescriptor";

/** Stop at the first town-mesh crossing. A widened display still shows the
 * river, but the source road meets the mesh edge instead of that outer frame.
 * When that edge sits in a surveyed river, stop on the town side of the water.
 * The frame road carries the crossing. */
export function importedRoadsForSite(site: BurgSiteDescriptor): NonNullable<CityGeography["importedRoads"]> {
  const half = townMeshExtentMeters(site.frame) / 2;
  const waters: PhysicalWaterPolygon[] = (site.fixedCrossings?.rivers ?? []).map(river => ({
    id: river.id,
    rings: river.rings
  }));
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
    const landed = dryTownTerminal(path, point => waters.some(water => pointInWater(point, water)));
    if (landed) {
      path.length = 0;
      path.push(...landed);
    }
    const terminal = path.at(-1)!;
    const landing =
      road.sharedCrossingId !== undefined && Math.max(Math.abs(terminal[0]), Math.abs(terminal[1])) < half - 1e-7;
    return [{ sourceIndex, routeId: road.routeId, path, ...(landing ? { riverLanding: true } : {}) }];
  });
}

/** Town-side point where the clipped road enters the water that holds its end. */
function dryTownTerminal(path: Point[], wet: (at: Point) => boolean): Point[] | null {
  if (path.length < 2 || !wet(path[path.length - 1])) return null;
  let index = path.length - 1;
  while (index > 0 && wet(path[index - 1])) index -= 1;
  if (index === 0) return null;
  const inner = path[index - 1];
  const outer = path[index];
  let lo = 0;
  let hi = 1;
  let best = inner;
  for (let i = 0; i < 16; i++) {
    const t = (lo + hi) / 2;
    const mid: Point = [inner[0] + (outer[0] - inner[0]) * t, inner[1] + (outer[1] - inner[1]) * t];
    if (wet(mid)) hi = t;
    else {
      best = mid;
      lo = t;
    }
  }
  const step = Math.hypot(best[0] - inner[0], best[1] - inner[1]);
  const pull = step > 4 ? 4 / step : 0;
  const landed: Point = [best[0] + (inner[0] - best[0]) * pull, best[1] + (inner[1] - best[1]) * pull];
  if (wet(landed) || Math.hypot(landed[0] - path[0][0], landed[1] - path[0][1]) < 1) return null;
  const kept = path.slice(0, index - 1);
  kept.push(landed);
  return kept.length >= 2 ? kept : [path[0], landed];
}
