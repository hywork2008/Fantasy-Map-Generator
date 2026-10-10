import { type PhysicalWaterPolygon, pointInWater } from "../../../../services/riverPhysicalGeometry";
import { resolveBridgeCrossingLimit } from "../../../../utils/bridgeCrossingPolicy";
import { planRiverCrossing, RIVER_CARGO_VESSEL } from "../../../../utils/riverCrossing";
import { townMeshExtentMeters } from "../../document";
import type { CityGeography, Point } from "../types";
import type { BurgSiteDescriptor, BurgSiteRiver } from "./burgSiteDescriptor";

type ImportedRoad = NonNullable<CityGeography["importedRoads"]>[number];

/** Stop at the first town-mesh crossing. A widened display still shows the
 * river, but the source road meets the mesh edge instead of that outer frame.
 * When that edge sits in a surveyed river, stop on the town side of the water.
 * The frame road carries the crossing. */
export function importedRoadsForSite(site: BurgSiteDescriptor): NonNullable<CityGeography["importedRoads"]> {
  const half =
    townMeshExtentMeters(
      site.frame,
      site.burg.waterAccess?.port.river === true,
      site.burg.riverPlacement?.bankDistanceMeters
    ) / 2;
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
    const wet = (point: Point) => waters.some(water => pointInWater(point, water));
    const landed = dryTownTerminal(path, wet);
    if (landed) {
      path.length = 0;
      path.push(...landed);
    }
    const terminal = path.at(-1)!;
    // A road that FMG runs into the river with no surveyed bridge is a ferry:
    // it ends at a landing on the town bank (Toyora's 2.5 km river).
    const ferry = landed ? ferryRiver(site, road.path.at(-1)!) : null;
    const landing =
      (road.sharedCrossingId !== undefined || ferry !== null) &&
      Math.max(Math.abs(terminal[0]), Math.abs(terminal[1])) < half - 1e-7;
    // Batonykut: the ferry road stopped short of the bank with no landing.
    // Carry the crossing so the town road reaches a landing on the bank.
    const riverConnection =
      landing && ferry && road.sharedCrossingId === undefined
        ? ferryConnection(site, sourceIndex, road.path, terminal, ferry, wet)
        : null;
    return [
      {
        sourceIndex,
        routeId: road.routeId,
        path,
        ...(landing ? { riverLanding: true } : {}),
        ...(riverConnection ? { riverConnection } : {})
      }
    ];
  });
}

/** The surveyed river holding the road's end when no era's bridge spans it. */
function ferryRiver(site: BurgSiteDescriptor, end: readonly [number, number]): BurgSiteRiver | null {
  const limit = resolveBridgeCrossingLimit(site.historicalPeriod, site.transport);
  for (const river of site.fixedCrossings?.rivers ?? []) {
    const item = site.rivers.find(entry => entry.riverId === river.id);
    if ((item?.widthMeters ?? 0) > limit && pointInWater([end[0], end[1]], { id: river.id, rings: river.rings }))
      return item!;
  }
  return null;
}

/** Ferry leg from the town landing across the water, ending on the far bank
 * or where the road leaves the town frame mid-river. */
function ferryConnection(
  site: BurgSiteDescriptor,
  sourceIndex: number,
  source: readonly (readonly [number, number])[],
  landing: Point,
  river: BurgSiteRiver,
  wet: (point: Point) => boolean
): ImportedRoad["riverConnection"] | null {
  const crossing =
    river.crossing ??
    planRiverCrossing({
      widthMeters: river.widthMeters ?? 0,
      depthMeters: river.depthMeters,
      period: site.historicalPeriod,
      transport: site.transport,
      vessel: river.navigationVessel ?? RIVER_CARGO_VESSEL
    });
  if (crossing.kind === "fixedBridge" || crossing.kind === "movableBridge") return null;
  // The town mesh clips the road at the near bank; the ferry leg runs on to
  // the far shore, or to the edge of the displayed frame mid-river.
  const half = site.frame.extentMeters / 2;
  const leg = source.map(point => [point[0], point[1]] as Point);
  let index = leg.findIndex(point => wet(point));
  if (index < 1) return null;
  while (index < leg.length && wet(leg[index])) index += 1;
  const inFrame = (point: Point) => Math.max(Math.abs(point[0]), Math.abs(point[1])) <= half;
  const clip = (a: Point, b: Point): Point => {
    let t = 1;
    for (let axis = 0; axis < 2; axis++) {
      if (b[axis] > half) t = Math.min(t, (half - a[axis]) / (b[axis] - a[axis]));
      if (b[axis] < -half) t = Math.min(t, (-half - a[axis]) / (b[axis] - a[axis]));
    }
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  let farTip: Point;
  const farRoad: Point[] = [];
  if (index < leg.length) {
    // Bisect the far shore on the leg that leaves the water.
    let lo = leg[index - 1];
    let hi = leg[index];
    for (let i = 0; i < 16; i++) {
      const mid: Point = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
      if (wet(mid)) lo = mid;
      else hi = mid;
    }
    farTip = inFrame(hi) ? hi : clip(leg[index - 1], hi);
    if (inFrame(hi)) {
      farRoad.push(hi);
      for (let i = index; i < leg.length; i++) {
        if (inFrame(leg[i])) farRoad.push(leg[i]);
        else {
          farRoad.push(clip(leg[i - 1], leg[i]));
          break;
        }
      }
    }
  } else {
    const out = leg.findIndex(point => !inFrame(point));
    farTip = out > 0 ? clip(leg[out - 1], leg[out]) : leg.at(-1)!;
  }
  if (Math.hypot(farTip[0] - landing[0], farTip[1] - landing[1]) < 1) return null;
  return {
    sourceIndex,
    farRoad,
    townRoad: [landing],
    banks: [[...landing], [...farTip]],
    ...(river.hydrology?.surfaceVelocity ? { currentMetersPerSecond: river.hydrology.surfaceVelocity } : {}),
    crossing
  };
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
