import { pointInWater } from "../../../../services/riverPhysicalGeometry";
import type { BurgSiteDescriptor, BurgSiteRoadEntry } from "./burgSiteDescriptor";

/** FMG can run a road into a river it never surveyed a crossing for, while
 * another road of the same town already crosses that river on a surveyed
 * bridge (Yayaropuz: the Yebla trail and the Esen road both cross the 609 m
 * river to the south bank). A second long bridge from the same bank to the
 * same far bank is unrealistic, so the stranded road shares the surveyed
 * crossing as one more branch, the way FMG shares converged facilities. */
export function joinStrandedRoadsToCrossings(site: BurgSiteDescriptor): BurgSiteDescriptor {
  const fixed = site.fixedCrossings;
  if (!fixed?.crossings.length) return site;
  const owners = site.roads.filter(
    road => road.sharedCrossingId !== undefined && road.sharedBranches?.length && road.path.length >= 2
  );
  if (!owners.length) return site;
  let changed = false;
  const roads = site.roads.map(road => {
    if (road.group === "searoutes" || road.sharedCrossingId !== undefined || road.path.length < 2) return road;
    const end = road.path.at(-1)!;
    const river = fixed.rivers.find(item => pointInWater([end[0], end[1]], { id: item.id, rings: item.rings }));
    if (!river) return road;
    const bank = road.path.find(at => !pointInWater([at[0], at[1]], { id: river.id, rings: river.rings }));
    let best: { owner: BurgSiteRoadEntry; gap: number } | null = null;
    for (const owner of owners) {
      const crossing = fixed.crossings.find(c => c.id === owner.sharedCrossingId);
      if (crossing?.riverId !== river.id) continue;
      const town = owner.path.at(-1)!;
      const gap = bank ? Math.hypot(town[0] - bank[0], town[1] - bank[1]) : 0;
      if (!best || gap < best.gap) best = { owner, gap };
    }
    if (!best) return road;
    const owner = best.owner;
    changed = true;
    return {
      ...road,
      path: owner.path.map(([x, y]) => [x, y] as [number, number]),
      entryAzimuthDeg: owner.entryAzimuthDeg,
      reachesEdge: owner.reachesEdge,
      sharedCrossingId: owner.sharedCrossingId,
      sharedRouteIds: [road.routeId],
      nextBurgs: road.nextBurg ? [road.nextBurg] : [],
      sharedBranches: [
        {
          routeId: road.routeId,
          path: owner.sharedBranches![0].path.map(([x, y]) => [x, y] as [number, number]),
          nextBurg: road.nextBurg ?? null
        }
      ]
    };
  });
  return changed ? { ...site, roads } : site;
}
