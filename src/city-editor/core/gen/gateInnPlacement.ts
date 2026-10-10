import { featureGroupVertices } from "../features";
import type { CityDocument, EdgeFeatureGroup, Id, Point } from "../types";
import { externalGateRoads } from "./approachBeyond";
import { nearestOnPolyline } from "./geom";
import type { GuildSiteView } from "./guildFacilityPlacement";
import { cobbledApproach, cobbledWidthMeters, roadUse } from "./roadTraffic";
import { defaultRoadWidthMeters, townExtentMeters } from "./settlementExtent";
import type { SiteLodging } from "./site/burgSiteEconomy";

/**
 * Wayside inns and caravanserais sit outside the gate of the busiest road.
 * The open court is 12 m² per stall, and the rooms ring that court.
 */

export interface GateInn {
  id: Id;
  kind: SiteLodging["kind"];
  name: string;
  stableSpaces: number;
  count: number;
  year: number;
  footprint: Point[];
  court: Point[];
  entrance: [Point, Point];
  stalls: Array<[Point, Point]>;
}

/** One stall's share of the courtyard. */
export const STABLE_COURT_M2 = 12;
export const MIN_COURT_M2 = 64;
export const MAX_COURT_M2 = 1400;

const RING: Record<SiteLodging["kind"], number> = { inn: 5.5, caravanserai: 7.5 };
const NAME: Record<SiteLodging["kind"], string> = { inn: "Wayside Inn", caravanserai: "Caravanserai" };

export function courtAreaM2(stableSpaces: number): number {
  return Math.round(Math.min(MAX_COURT_M2, Math.max(MIN_COURT_M2, Math.max(0, stableSpaces) * STABLE_COURT_M2)));
}

function hypot(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function rect(center: Point, along: Point, across: Point, halfAlong: number, halfAcross: number): Point[] {
  const at = (u: number, v: number): Point => [
    center[0] + along[0] * u + across[0] * v,
    center[1] + along[1] * u + across[1] * v
  ];
  return [
    at(-halfAlong, -halfAcross),
    at(halfAlong, -halfAcross),
    at(halfAlong, halfAcross),
    at(-halfAlong, halfAcross)
  ];
}

function midpoint(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function stallMarks(court: Point[], spaces: number): Array<[Point, Point]> {
  const drawn = Math.min(8, Math.max(spaces > 0 ? 1 : 0, spaces));
  if (drawn < 1) return [];
  const farA = court[3];
  const farB = court[2];
  const near = midpoint(court[0], court[1]);
  const far = midpoint(farA, farB);
  const span = hypot(near, far) || 1;
  const inward: Point = [((near[0] - far[0]) / span) * 2.2, ((near[1] - far[1]) / span) * 2.2];
  const marks: Array<[Point, Point]> = [];
  for (let i = 1; i <= drawn; i++) {
    const t = i / (drawn + 1);
    const p: Point = [farA[0] + (farB[0] - farA[0]) * t, farA[1] + (farB[1] - farA[1]) * t];
    marks.push([p, [p[0] + inward[0], p[1] + inward[1]]]);
  }
  return marks;
}

function outsideScore(site: GuildSiteView, point: Point): number {
  return site.insideTown(point) ? 0 : site.townDistance(point) + 1;
}

function townFirst(site: GuildSiteView, points: Point[]): Point[] {
  if (points.length < 2) return points;
  return outsideScore(site, points.at(-1)!) >= outsideScore(site, points[0]) ? points : [...points].reverse();
}

function chainBeyond(cursor: Point, pieces: Point[][]): Point[] {
  const unused = pieces.filter(piece => piece.length >= 2).map(piece => piece.map(point => [...point] as Point));
  const extra: Point[] = [];
  let at = cursor;
  while (unused.length) {
    let best = -1;
    let bestDistance = 80;
    let reverse = false;
    for (let i = 0; i < unused.length; i++) {
      const piece = unused[i];
      const start = hypot(piece[0], at);
      const end = hypot(piece.at(-1)!, at);
      const distance = Math.min(start, end);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
        reverse = end < start;
      }
    }
    if (best < 0) break;
    const piece = unused.splice(best, 1)[0];
    if (reverse) piece.reverse();
    for (const point of piece) {
      if (hypot(point, at) > 0.4) extra.push(point);
      at = point;
    }
  }
  return extra;
}

function approachPoints(document: CityDocument, group: EdgeFeatureGroup, site: GuildSiteView): Point[] {
  const mesh = townFirst(
    site,
    featureGroupVertices(document, group)
      .map(id => document.mesh.vertices[id]?.point)
      .filter((point): point is Point => !!point)
  );
  if (mesh.length < 2) return mesh;
  const source = group.sourceRoad;
  const pieces = (document.frameRoads ?? [])
    .filter(leg => source && leg.sourceIndex === source.index && leg.routeId === source.routeId)
    .flatMap(leg => leg.pieces.filter(piece => piece.kind === "road").map(piece => piece.points));
  return [...mesh, ...chainBeyond(mesh.at(-1)!, pieces)];
}

function sample(points: Point[], distance: number): { point: Point; tangent: Point } | null {
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = hypot(a, b);
    if (length < 1e-6) continue;
    if (walked + length >= distance) {
      const t = (distance - walked) / length;
      return {
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        tangent: [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
      };
    }
    walked += length;
  }
  return null;
}

function exitDistance(site: GuildSiteView, points: Point[]): number {
  let walked = 0;
  let wasInside = site.insideTown(points[0]) || site.townDistance(points[0]) < 8;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = hypot(a, b);
    if (length < 1e-6) continue;
    const steps = Math.max(1, Math.ceil(length));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const outside = !site.insideTown(point) && site.townDistance(point) > 6;
      if (wasInside && outside) return walked + length * t;
      if (!outside) wasInside = true;
    }
    walked += length;
  }
  return site.insideTown(points[0]) ? walked : 12;
}

function fits(site: GuildSiteView, polygon: Point[], clearance: number): boolean {
  if (polygon.some(point => site.insideTown(point) || site.townDistance(point) < 4)) return false;
  if (!site.inFrame(polygon, 4)) return false;
  if (site.hitsWater(polygon, 1) || site.hitsRoutes(polygon, 0.8) || site.hitsBlocked(polygon)) return false;
  if (site.hitsLanes(polygon)) return false;
  // The near wall of the inn stays beyond the gate's glacis, plain or barbican.
  if (!site.clearsGlacis(polygon, clearance)) return false;
  return true;
}

function busiestGroup(document: CityDocument): EdgeFeatureGroup | null {
  let best: { group: EdgeFeatureGroup; traffic: number; rank: number } | null = null;
  for (const exit of externalGateRoads(document)) {
    const use = roadUse(document, exit.group.sourceRoad?.index, exit.group.sourceRoad?.routeId);
    if (!use || use.traffic <= 0) continue;
    if (!best || use.traffic > best.traffic || (use.traffic === best.traffic && use.trafficRank > best.rank))
      best = { group: exit.group, traffic: use.traffic, rank: use.trafficRank };
  }
  return best?.group ?? null;
}

function placeOne(
  site: GuildSiteView,
  lodging: SiteLodging,
  points: Point[],
  start: number,
  roadHalf: number,
  year: number,
  index: number,
  clearance: number,
  reach: number
): (GateInn & { station: number; span: number }) | null {
  const area = courtAreaM2(lodging.stableSpaces);
  const depth = Math.sqrt(area / 1.45);
  const courtAlong = area / depth / 2;
  const courtAcross = depth / 2;
  const ring = RING[lodging.kind];
  const halfAlong = courtAlong + ring;
  const halfAcross = courtAcross + ring;
  // Walk far enough to clear the curtain, or the barbican face, before the rooms start.
  for (let extra = 0; extra <= 200 + clearance + reach; extra += 14) {
    const at = sample(points, start + halfAcross + 16 + extra);
    if (!at) break;
    for (const sign of [1, -1] as const) {
      const away: Point = [-at.tangent[1] * sign, at.tangent[0] * sign];
      const center: Point = [
        at.point[0] + away[0] * (halfAcross + roadHalf + 2.5),
        at.point[1] + away[1] * (halfAcross + roadHalf + 2.5)
      ];
      const footprint = rect(center, at.tangent, away, halfAlong, halfAcross);
      if (!fits(site, footprint, clearance)) continue;
      const court = rect(center, at.tangent, away, courtAlong, courtAcross);
      return {
        id: `gate-inn-${lodging.kind}-${index}`,
        kind: lodging.kind,
        name: NAME[lodging.kind],
        stableSpaces: lodging.stableSpaces,
        count: lodging.count,
        year,
        footprint,
        court,
        entrance: [midpoint(footprint[0], footprint[1]), midpoint(court[0], court[1])],
        stalls: stallMarks(court, lodging.stableSpaces),
        station: start + halfAcross + 16 + extra,
        span: halfAlong * 2
      };
    }
  }
  return null;
}

export function placeGateInns(site: GuildSiteView, lodging: readonly SiteLodging[], year: number): GateInn[] {
  const wanted = lodging.filter(item => item.count > 0);
  if (!wanted.length) return [];
  const group = busiestGroup(site.document);
  if (!group) return [];
  const points = approachPoints(site.document, group, site);
  if (points.length < 2) return [];
  const use = roadUse(site.document, group.sourceRoad?.index, group.sourceRoad?.routeId);
  const base = defaultRoadWidthMeters(townExtentMeters(site.document.frame));
  const roadHalf = (cobbledApproach(use) ? cobbledWidthMeters(base) : base) / 2;
  const ordered = [...wanted].sort((a, b) => b.stableSpaces - a.stableSpaces || a.kind.localeCompare(b.kind));
  const placed: GateInn[] = [];
  let start = exitDistance(site, points);
  const clearance = site.approachClearance(group.id);
  const reach = site.outworkReach(group.id);
  ordered.forEach((item, index) => {
    const inn = placeOne(site, item, points, start, roadHalf, year, index, clearance, reach);
    if (!inn) return;
    site.claim(inn.footprint);
    placed.push(inn);
    start = inn.station + inn.span + 8;
  });
  return placed;
}

export function innClearsRoad(inn: GateInn, road: Point[], halfWidth: number): boolean {
  return inn.footprint.every(point => nearestOnPolyline(point, road).dist >= halfWidth);
}
