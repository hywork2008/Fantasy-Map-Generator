import { featureGroupVertices } from "../features";
import { townGates } from "../fortifications";
import type { ApproachBeyond, CityDocument, Id, Point } from "../types";
import { evaluateApproachBeyond, externalGateRoads, normalizeApproachBeyond } from "./approachBeyond";
import type { DistrictFabric } from "./blockInfill";
import {
  barbicanEra,
  curtainSegments,
  type GlacisBarbican,
  glacisOutworks,
  MAX_BARBICAN_REACH_METERS,
  polygonClearsGlacis,
  polygonClearsOutworks
} from "./defenseClearance";
import { nearestOnPolyline, polygonArea, polygonCentroid } from "./geom";
import { chord, isSuburb } from "./localInfill";
import { type RoadUse, roadUse, TRADE_RANK, tradeRibbonMeters } from "./roadTraffic";

export type SuburbanProfile = "trade" | "granary" | "frontier" | "rural";

export interface ApproachBand {
  groupId: Id;
  /** Gate end first, then the road out to the map boundary. */
  points: Point[];
  profile: SuburbanProfile;
  clearance: number;
  length: number;
  gateVertexId?: Id;
}

/**
 * A recorded traffic rank replaces the neighbour's usefulness as the trade test.
 * Defence still keeps a glacis, and a quiet road can stay a food village.
 * Without traffic the neighbour's role decides, as before.
 */
export function suburbanProfile(
  beyond: ApproachBeyond | undefined,
  extentMeters: number,
  hasWalls: boolean,
  use: RoadUse | null
): { profile: SuburbanProfile; clearance: number; length: number } {
  const norm = normalizeApproachBeyond(beyond);
  const assessment = evaluateApproachBeyond(beyond, { extentMeters, hasWalls });
  const frontier = assessment?.defenseLevel === "high" || assessment?.defenseLevel === "critical";
  const granary = norm?.settlement.role === "granary" || norm?.settlement.scale === "village";
  const profile: SuburbanProfile = frontier
    ? "frontier"
    : use
      ? use.trafficRank >= TRADE_RANK
        ? "trade"
        : granary
          ? "granary"
          : "rural"
      : granary
        ? "granary"
        : assessment?.utilityLevel === "high" || assessment?.utilityLevel === "critical"
          ? "trade"
          : "rural";
  const clearance = profile === "frontier" ? 70 : profile === "rural" ? 30 : 25;
  const length = profile === "trade" ? (use ? tradeRibbonMeters(use.traffic) : 200) : profile === "granary" ? 50 : 60;
  return { profile, clearance, length };
}

/** Extra roadside length held until a barbican's real reach replaces it. */
export function outworkSlackMeters(document: CityDocument): number {
  if (!barbicanEra(document.historicalPeriod)) return 0;
  if (!document.featureGroups.some(group => group.kind === "wall")) return 0;
  return MAX_BARBICAN_REACH_METERS;
}

/** One band per external gate road, gate end first. */
export function approachBands(document: CityDocument): ApproachBand[] {
  const hasWalls = document.featureGroups.some(group => group.kind === "wall");
  const gateVertices = new Set(townGates(document).map(gate => gate.vertexId));
  const half = document.frame.extentMeters / 2;
  return externalGateRoads(document).flatMap(({ group }) => {
    const ids = featureGroupVertices(document, group);
    const points = ids.map(id => document.mesh.vertices[id]?.point).filter((p): p is Point => !!p);
    if (points.length < 2) return [];
    const boundaryDistance = (p: Point) => half - Math.max(Math.abs(p[0]), Math.abs(p[1]));
    if (boundaryDistance(points[0]) < boundaryDistance(points.at(-1)!)) points.reverse();
    const band = suburbanProfile(
      group.beyond,
      document.frame.extentMeters,
      hasWalls,
      roadUse(document, group.sourceRoad?.index, group.sourceRoad?.routeId)
    );
    return [{ groupId: group.id, points, gateVertexId: ids.find(id => gateVertices.has(id)), ...band }];
  });
}

/** Apply the land-use bands to existing mesh-owned lots. No new street or
 * rectangular field geometry is laid over the block and farm systems. */
export function shapeSuburbanFabric(document: CityDocument, fabric: DistrictFabric): DistrictFabric {
  const walls = curtainSegments(document);
  const approaches = approachBands(document);
  if (!approaches.length) return fabric;
  // A barbican is placed later. Hold the far end of the ribbon until its reach is known.
  const slack = outworkSlackMeters(document);
  const wallDistance = (p: Point) =>
    walls.length ? Math.min(...walls.map(segment => nearestOnPolyline(p, segment).dist)) : Infinity;
  const nearest = (p: Point) =>
    approaches
      .map(road => ({
        road,
        distance: nearestOnPolyline(p, road.points).dist,
        gateDistance: Math.hypot(p[0] - road.points[0][0], p[1] - road.points[0][1])
      }))
      .sort((a, b) => a.distance - b.distance)[0];
  const outskirts = (id: string) => document.mesh.faces[id]?.properties.settlement === "outskirts";
  // A residential suburb (faubourg, gate suburb, harbour) is a built-up
  // district, not roadside ribbon. It keeps its blocks and only clears the
  // glacis outside the wall.
  const districtOf = new Map(
    (document.fabric?.districts ?? []).flatMap(d => d.faceIds.map(id => [id, d.parameters] as const))
  );
  const suburb = (id: string) => {
    const face = document.mesh.faces[id];
    return !!face && isSuburb(face, districtOf.get(id));
  };
  const buildings = fabric.buildings.filter(building => {
    if (!outskirts(building.faceId)) return true;
    const center = polygonCentroid(building.polygon);
    const near = nearest(center);
    if (suburb(building.faceId)) {
      const glacis = near?.road.clearance ?? 25;
      return !building.polygon.some(p => wallDistance(p) < glacis);
    }
    if (
      !near ||
      near.road.profile === "frontier" ||
      near.distance > 20 ||
      near.gateDistance < near.road.clearance ||
      near.gateDistance > near.road.clearance + near.road.length + slack ||
      wallDistance(center) < near.road.clearance
    )
      return false;
    // Keep only modest, existing face-owned roadside lots. A union block can
    // otherwise yield a house larger than the homes inside the wall.
    const area = Math.abs(polygonArea(building.polygon));
    if (area > 220 || area < 20) return false;
    if (building.polygon.some(p => wallDistance(p) < near.road.clearance)) return false;
    const spacing = near.road.profile === "trade" ? 0.62 : near.road.profile === "granary" ? 0.24 : 0.2;
    const hash = [...`${building.faceId}:${center[0].toFixed(1)}:${center[1].toFixed(1)}`].reduce(
      (n, c) => (n * 33 + c.charCodeAt(0)) >>> 0,
      5381
    );
    return hash / 0xffffffff < spacing;
  });
  const farms = fabric.farms.flatMap(farm => {
    const face = document.mesh.faces[farm.faceId];
    if (!face || face.properties.settlement !== "outskirts") return [farm];
    const center = polygonCentroid(farm.polygon);
    const near = nearest(center);
    if (
      !near ||
      near.road.profile === "frontier" ||
      wallDistance(center) < near.road.clearance ||
      near.gateDistance < near.road.clearance
    )
      return [];
    const min = near.road.profile === "granary" ? 20 : 18;
    const max = near.road.profile === "granary" ? 155 : near.road.profile === "trade" ? 150 : 115;
    if (near.distance < min || near.distance > max || !farm.polygon.every(p => wallDistance(p) >= near.road.clearance))
      return [];
    const garden = near.distance < 45 && near.road.profile !== "granary";
    const road = near.road.points;
    const nearestSegment = road
      .slice(1)
      .map((end, i) => ({
        start: road[i],
        end,
        distance: nearestOnPolyline(center, [road[i], end]).dist
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    const dx = nearestSegment.end[0] - nearestSegment.start[0];
    const dy = nearestSegment.end[1] - nearestSegment.start[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return [farm];
    const normal: Point = [-dy / length, dx / length];
    const values = farm.polygon.map(p => p[0] * normal[0] + p[1] * normal[1]);
    const spacing = garden ? 2.7 : 4;
    const rows: Point[][] = [];
    for (let offset = Math.min(...values) + spacing; offset < Math.max(...values) - spacing / 2; offset += spacing) {
      const ends = chord(farm.polygon, normal, offset);
      if (!ends) continue;
      const span = Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]);
      if (span < (garden ? 7 : 12)) continue;
      const inset = Math.min(garden ? 1.5 : 0.8, span / 5);
      const unit: Point = [(ends[1][0] - ends[0][0]) / span, (ends[1][1] - ends[0][1]) / span];
      rows.push([
        [ends[0][0] + unit[0] * inset, ends[0][1] + unit[1] * inset],
        [ends[1][0] - unit[0] * inset, ends[1][1] - unit[1] * inset]
      ]);
    }
    return rows.length >= 2
      ? [{ ...farm, kind: garden ? ("kitchen-garden" as const) : ("open-field" as const), rows }]
      : [];
  });
  return { ...fabric, buildings, farms, lanes: fabric.lanes.filter(lane => !outskirts(lane.faceId)) };
}

/**
 * Drop outskirts lots that sit in a barbican's glacis, and trim the roadside
 * window to the real outwork. A plain gate keeps the profile measured from the wall.
 */
export function enforceDefenseClearance<T extends { faceId: string; polygon: Point[] }>(
  document: CityDocument,
  items: T[],
  barbicans: readonly GlacisBarbican[],
  kind: "building" | "farm"
): T[] {
  const slack = outworkSlackMeters(document);
  if (!barbicans.length && slack === 0) return items;
  const bands = approachBands(document);
  if (!bands.length) return items;
  const outworks = glacisOutworks(document, barbicans, bands);
  if (!outworks.length && slack === 0) return items;
  const districtOf = new Map(
    (document.fabric?.districts ?? []).flatMap(d => d.faceIds.map(id => [id, d.parameters] as const))
  );
  const outskirts = (id: string) => document.mesh.faces[id]?.properties.settlement === "outskirts";
  const suburb = (id: string) => {
    const face = document.mesh.faces[id];
    return !!face && isSuburb(face, districtOf.get(id));
  };
  const nearest = (p: Point) =>
    bands
      .map(road => ({
        road,
        distance: nearestOnPolyline(p, road.points).dist,
        gateDistance: Math.hypot(p[0] - road.points[0][0], p[1] - road.points[0][1])
      }))
      .sort((a, b) => a.distance - b.distance)[0];
  const reachOf = (gateVertexId: Id | undefined) =>
    outworks.find(work => work.gateVertexId === gateVertexId)?.reachMeters ?? 0;
  return items.filter(item => {
    if (!outskirts(item.faceId)) return true;
    if (kind === "building" && !suburb(item.faceId)) {
      const near = nearest(polygonCentroid(item.polygon));
      if (near && near.gateDistance > near.road.clearance + near.road.length + reachOf(near.road.gateVertexId))
        return false;
    }
    return polygonClearsOutworks(item.polygon, outworks);
  });
}

/** Wall profile plus every barbican. Open towns have no glacis. */
export function respectsDefenseClearance(
  document: CityDocument,
  polygon: Point[],
  barbicans: readonly GlacisBarbican[],
  minClearance = 0
): boolean {
  const walls = curtainSegments(document);
  if (!walls.length) return true;
  const bands = approachBands(document);
  return polygonClearsGlacis(
    polygon,
    { active: true, walls, bands, outworks: glacisOutworks(document, barbicans, bands) },
    minClearance
  );
}
