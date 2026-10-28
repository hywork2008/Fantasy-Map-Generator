import type { BurgSiteDescriptor } from "../../types/contracts/burgSiteDescriptor";
import type { Point } from "../../types/primitives";
import { azimuthToVec, nearestOnPolyline, pointInPolygon } from "../geom";
import { regionalSeaPolygon } from "../regionalCoast";
import { siteToGeography } from "./siteInput";

/** Reframe coarse, unsurveyed estuaries around dry town land. Water geometry is only translated. */
export function centerWideWaterfront(site: BurgSiteDescriptor): BurgSiteDescriptor {
  if (site.frame.urbanCenterOffsetMeters) return site;
  const radius = site.frame.cityRadiusMeters;
  if (!site.burg.port || !site.waterbody || site.fixedCrossings || !site.rivers.some(r => r.widthMeters >= radius * 2))
    return site;
  const geo = siteToGeography(site, true);
  const rivers = (geo.channels ?? []).map(channel => channel.polygon);
  if (!rivers.length || !geo.coast) return site;
  const shore = geo.coast.regionalShore ?? geo.coast.corridor;
  const toWater = azimuthToVec(geo.coast.waterAzimuthDeg);
  const hit = nearestOnPolyline([0, 0], shore).point;
  const sea = regionalSeaPolygon(shore, site.frame.extentMeters / 2, [
    [hit[0] + toWater[0] * 10, hit[1] + toWater[1] * 10]
  ]);
  if (!sea) return site;
  const wet = [...rivers, sea];
  const clear = (point: Point) =>
    wet.some(ring => pointInPolygon(point, ring))
      ? -1
      : Math.min(...wet.map(ring => nearestOnPolyline(point, [...ring, ring[0]]).dist));
  const clearance = radius * 1.5;
  if (clear([0, 0]) >= clearance - 0.01) return site;
  const step = Math.max(5, radius / 4);
  const reach = site.frame.extentMeters / 2 - clearance;
  let center: Point | undefined,
    score = Infinity;
  for (let x = -reach; x <= reach; x += step)
    for (let y = -reach; y <= reach; y += step) {
      const point: Point = [x, y];
      if (clear(point) < clearance) continue;
      const riverGap = Math.min(...rivers.map(ring => nearestOnPolyline(point, [...ring, ring[0]]).dist));
      const seaGap = nearestOnPolyline(point, shore).dist;
      // Keep both working waterfronts within the town's reach, rather than moving far inland.
      const candidate = Math.hypot(x, y) + Math.max(0, seaGap - radius * 2, riverGap - radius * 2) * 4;
      if (candidate < score) {
        center = point;
        score = candidate;
      }
    }
  if (!center) return site;
  const [cx, cy] = center;
  const point = (p: readonly number[]): Point => [p[0] - cx, p[1] - cy];
  const line = (points: readonly (readonly number[])[]) => points.map(point);
  const bounds = (b: { minX: number; minY: number; maxX: number; maxY: number }) => ({
    minX: b.minX - cx,
    minY: b.minY - cy,
    maxX: b.maxX - cx,
    maxY: b.maxY - cy
  });
  const next = structuredClone(site);
  next.frame.originMapUnits = [
    site.frame.originMapUnits[0] + cx / site.frame.metersPerMapUnit,
    site.frame.originMapUnits[1] - cy / site.frame.metersPerMapUnit
  ];
  // The opposite bank is context, not a mandatory feature of the urban display window.
  next.frame.urbanCenterOffsetMeters = [...center];
  next.frame.extentMeters = Math.min(
    site.frame.extentMeters - 2 * Math.max(Math.abs(cx), Math.abs(cy)),
    Math.max(300, Math.ceil((radius * 6) / 50) * 50)
  );
  if (site.frame.requiredBounds) next.frame.requiredBounds = bounds(site.frame.requiredBounds);
  next.waterbody!.shoreline = site.waterbody.shoreline.map(line);
  next.waterbody!.shoreDistanceMeters = Math.min(
    ...next.waterbody!.shoreline.map(shore => nearestOnPolyline([0, 0], shore).dist)
  );
  next.rivers = site.rivers.map(river => {
    const segments = river.segments.map(segment => ({ ...segment, points: line(segment.points) }));
    const offset = Math.min(...segments.map(segment => nearestOnPolyline([0, 0], segment.points).dist));
    return {
      ...river,
      segments,
      leftBankSegments: river.leftBankSegments.map(line),
      rightBankSegments: river.rightBankSegments.map(line),
      offsetMeters: offset,
      offsetRatio: offset / radius,
      crossesSite: offset < radius
    };
  });
  next.roads = site.roads.map(road => ({
    ...road,
    path: line(road.path),
    ...(road.sharedBranches
      ? { sharedBranches: road.sharedBranches.map(branch => ({ ...branch, path: line(branch.path) })) }
      : {})
  }));
  if (site.regionalContext)
    next.regionalContext = {
      ...site.regionalContext,
      coverageBounds: bounds(site.regionalContext.coverageBounds),
      roads: site.regionalContext.roads.map(road => ({ ...road, points: line(road.points) })),
      settlements: site.regionalContext.settlements.map(settlement => ({
        ...settlement,
        center: point(settlement.center),
        ...(settlement.outline ? { outline: line(settlement.outline) } : {})
      }))
    };
  if (site.regionalSurface)
    next.regionalSurface = {
      features: site.regionalSurface.features.map(feature => ({ ...feature, ring: line(feature.ring) })),
      unknown: site.regionalSurface.unknown.map(line)
    };
  // Resample the centred height lattice in the old frame; do not translate terrain independently of water.
  const field = site.terrain.heightfield;
  const size = field.size;
  const half = ((size - 1) * field.spacingMeters) / 2;
  const spacing = next.frame.extentMeters / (size - 1);
  const samples = Array.from({ length: size * size }, (_, i) => {
    const x = ((i % size) - (size - 1) / 2) * spacing + cx;
    const y = (Math.floor(i / size) - (size - 1) / 2) * spacing + cy;
    const gx = Math.max(0, Math.min(size - 1, (x + half) / field.spacingMeters));
    const gy = Math.max(0, Math.min(size - 1, (y + half) / field.spacingMeters));
    const ix = Math.min(size - 2, Math.floor(gx)),
      iy = Math.min(size - 2, Math.floor(gy));
    const tx = gx - ix,
      ty = gy - iy;
    const a = field.elevationsMeters[iy * size + ix] * (1 - tx) + field.elevationsMeters[iy * size + ix + 1] * tx;
    const b =
      field.elevationsMeters[(iy + 1) * size + ix] * (1 - tx) + field.elevationsMeters[(iy + 1) * size + ix + 1] * tx;
    return { height: a * (1 - ty) + b * ty, water: field.waterMask[Math.round(gy) * size + Math.round(gx)] };
  });
  next.terrain.heightfield = {
    size,
    spacingMeters: spacing,
    elevationsMeters: samples.map(s => s.height),
    waterMask: samples.map(s => s.water)
  };
  return next;
}
