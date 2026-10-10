import { facePoints } from "../mesh";
import { flowingRivers } from "../riverFlow";
import type { CityDocument, Id, Point } from "../types";
import { nearestOnPolyline, pointInPolygon, polygonArea } from "./geom";
import type { PlannedGuildFacility } from "./guildFacilities";
import { fixedBankOffset } from "./watermillFabric";

/**
 * Places one hall and the domain's yards for each planned guild.
 * Headcount does not gate this: a chapter with zero craftsmen still gets the buildings.
 */

export interface GuildHall {
  id: Id;
  domain: string;
  name: string;
  practitioners: number;
  year: number;
  footprint: Point[];
  ridge: [Point, Point];
  tower?: Point[];
}

export type GuildYardKind = "bleachingField" | "timberYard" | "stoneYard" | "limeKiln" | "smithyYard" | "sandYard";

export interface GuildYard {
  id: Id;
  domain: string;
  kind: GuildYardKind;
  name: string;
  practitioners: number;
  year: number;
  polygon: Point[];
  frames?: Array<[Point, Point]>;
}

export interface GuildSiteView {
  document: CityDocument;
  town: Point[];
  insideTown(point: Point): boolean;
  townDistance(point: Point): number;
  inFrame(polygon: Point[], margin?: number): boolean;
  hitsWater(polygon: Point[], clearance?: number): boolean;
  hitsRoutes(polygon: Point[], clearance: number): boolean;
  hitsBlocked(polygon: Point[]): boolean;
  hitsLanes(polygon: Point[]): boolean;
  buildingsIn(polygon: Point[]): readonly { polygon: Point[] }[];
  claim(polygon: Point[]): void;
}

const HALL_NAME: Record<string, string> = {
  textiles: "Cloth Hall",
  leather: "Tanners' Hall",
  woodworking: "Carpenters' Hall",
  masonry: "Masons' Lodge",
  metallurgy: "Smiths' Hall",
  glassware: "Glaziers' Hall",
  instruments: "Instrument Makers' Hall",
  printing: "Printers' Hall"
};

const YARD_NAME: Record<GuildYardKind, string> = {
  bleachingField: "Bleaching Field",
  timberYard: "Timber Yard",
  stoneYard: "Stone Yard",
  limeKiln: "Lime Kiln",
  smithyYard: "Smithy Yard",
  sandYard: "Sand Yard"
};

const YARD_SIZE: Record<GuildYardKind, [number, number]> = {
  bleachingField: [34, 16],
  timberYard: [24, 14],
  stoneYard: [22, 14],
  limeKiln: [12, 10],
  smithyYard: [14, 10],
  sandYard: [18, 12]
};

const EDGE_DOMAINS = new Set(["metallurgy", "glassware", "leather"]);
const BLOCKED_WARDS = new Set(["castle", "market", "cemetery", "harbor", "park"]);

function frame(origin: Point, angle: number) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  return (u: number, v: number): Point => [origin[0] + ux * u - uy * v, origin[1] + uy * u + ux * v];
}

function rect(at: (u: number, v: number) => Point, u0: number, v0: number, u1: number, v1: number): Point[] {
  return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
}

function orient(polygon: Point[]): Point[] {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? [...polygon].reverse() : polygon;
}

function centroid(points: Point[]): Point {
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length
  ];
}

function insideRing(polygon: Point[], ring: Point[], margin: number): boolean {
  if (!polygon.every(point => pointInPolygon(point, ring))) return false;
  const closed = [...ring, ring[0]];
  return polygon.every(point => nearestOnPolyline(point, closed).dist >= margin);
}

interface FaceSpot {
  id: Id;
  centre: Point;
  polygon: Point[];
  dist: number;
}

function coreFaces(site: GuildSiteView, outside: boolean): FaceSpot[] {
  const spots: FaceSpot[] = [];
  for (const face of Object.values(site.document.mesh.faces)) {
    const props = face.properties;
    if (props.water !== "land" || BLOCKED_WARDS.has(props.ward ?? "")) continue;
    const polygon = facePoints(site.document.mesh, face);
    if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 180) continue;
    const centre = centroid(polygon);
    const inTown = site.insideTown(centre);
    if (outside ? inTown : !inTown) continue;
    if (!outside && props.settlement && props.settlement !== "core") continue;
    spots.push({ id: face.id, centre, polygon, dist: Math.hypot(centre[0], centre[1]) });
  }
  return spots;
}

function hallFits(site: GuildSiteView, spot: FaceSpot, footprint: Point[], tower?: Point[]): boolean {
  if (!insideRing(footprint, spot.polygon, 1)) return false;
  if (!footprint.every(point => site.insideTown(point))) return false;
  if (!site.inFrame(footprint, 2)) return false;
  if (site.hitsWater(footprint, 0.6) || site.hitsRoutes(footprint, 0.8) || site.hitsBlocked(footprint)) return false;
  if (!tower) return true;
  return (
    insideRing(tower, spot.polygon, 0.6) &&
    site.inFrame(tower, 2) &&
    !site.hitsWater(tower, 0.4) &&
    !site.hitsRoutes(tower, 0.6) &&
    !site.hitsBlocked(tower)
  );
}

function placeHall(site: GuildSiteView, facility: PlannedGuildFacility, year: number, used: Set<Id>): GuildHall | null {
  const preferEdge = EDGE_DOMAINS.has(facility.domain);
  const spots = coreFaces(site, false).sort((a, b) => (preferEdge ? b.dist - a.dist : a.dist - b.dist));
  const sizes: Array<[number, number]> = facility.belfry
    ? [
        [26, 11],
        [20, 10],
        [16, 8]
      ]
    : [
        [22, 12],
        [16, 9],
        [12, 8]
      ];
  for (const spot of spots) {
    if (used.has(spot.id)) continue;
    const radial = Math.atan2(spot.centre[1], spot.centre[0]);
    const angles = [radial + Math.PI / 2, radial, radial + 0.5, radial + 1];
    for (const [length, depth] of sizes) {
      for (const angle of angles) {
        const at = frame(spot.centre, angle);
        const footprint = orient(rect(at, -length / 2, -depth / 2, length / 2, depth / 2));
        const tower = facility.belfry ? orient(rect(at, length / 2 - 0.5, -3.2, length / 2 + 6, 3.2)) : undefined;
        const withTower = tower && hallFits(site, spot, footprint, tower);
        if (!withTower && !hallFits(site, spot, footprint)) continue;
        used.add(spot.id);
        const hall: GuildHall = {
          id: `guild-hall-${facility.domain}`,
          domain: facility.domain,
          name: HALL_NAME[facility.domain] ?? "Guild Hall",
          practitioners: facility.practitioners,
          year,
          footprint,
          ridge: [at(-length / 2 + 1, 0), at(length / 2 - 1, 0)]
        };
        if (withTower && tower) hall.tower = tower;
        site.claim(hall.footprint);
        if (hall.tower) site.claim(hall.tower);
        return hall;
      }
    }
  }
  return null;
}

function yardFits(site: GuildSiteView, spot: FaceSpot, polygon: Point[]): boolean {
  if (!insideRing(polygon, spot.polygon, 0.8)) return false;
  if (polygon.some(point => site.insideTown(point))) return false;
  if (!site.inFrame(polygon, 4)) return false;
  if (
    site.hitsWater(polygon, 0.8) ||
    site.hitsRoutes(polygon, 1.2) ||
    site.hitsBlocked(polygon) ||
    site.hitsLanes(polygon)
  )
    return false;
  return site.townDistance(centroid(polygon)) >= 8;
}

function placeOpenYard(
  site: GuildSiteView,
  facility: PlannedGuildFacility,
  kind: GuildYardKind,
  year: number
): GuildYard | null {
  const [length, depth] = YARD_SIZE[kind];
  const prefer = kind === "limeKiln" || kind === "smithyYard" ? Math.PI / 5 : kind === "timberYard" ? Math.PI / 2 : 0;
  let best: { score: number; yard: GuildYard } | null = null;
  for (const spot of coreFaces(site, true)) {
    const away = site.townDistance(spot.centre);
    if (away < 10 || away > 160) continue;
    const radial = Math.atan2(spot.centre[1], spot.centre[0]);
    for (const angle of [radial + Math.PI / 2, radial]) {
      const at = frame(spot.centre, angle);
      const polygon = orient(rect(at, -length / 2, -depth / 2, length / 2, depth / 2));
      if (!yardFits(site, spot, polygon)) continue;
      const anglePenalty = Math.abs(Math.atan2(Math.sin(radial - prefer), Math.cos(radial - prefer)));
      const score = -away * 0.02 - site.buildingsIn(polygon).length * 0.4 - anglePenalty;
      if (best && score <= best.score) continue;
      best = {
        score,
        yard: {
          id: `guild-yard-${facility.domain}-${kind}`,
          domain: facility.domain,
          kind,
          name: YARD_NAME[kind],
          practitioners: facility.practitioners,
          year,
          polygon
        }
      };
    }
  }
  if (!best) return null;
  site.claim(best.yard.polygon);
  return best.yard;
}

function placeBleaching(site: GuildSiteView, facility: PlannedGuildFacility, year: number): GuildYard | null {
  const [length, depth] = YARD_SIZE.bleachingField;
  const townCentre = site.town.length >= 3 ? centroid(site.town) : ([0, 0] as Point);
  let best: { score: number; yard: GuildYard } | null = null;
  for (const river of flowingRivers(site.document)) {
    const points = river.points;
    const half = river.widthMeters / 2;
    let entry = Infinity;
    let walked = 0;
    const segments: Array<{ a: Point; t: Point; length: number; start: number }> = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const tx = span > 1e-6 ? (b[0] - a[0]) / span : 0;
      const ty = span > 1e-6 ? (b[1] - a[1]) / span : 0;
      if (span < 1e-6) continue;
      segments.push({ a, t: [tx, ty], length: span, start: walked });
      const count = Math.ceil(span / 2);
      for (let j = 0; j <= count; j++) {
        const s = (j / count) * span;
        const p: Point = [a[0] + tx * s, a[1] + ty * s];
        if (site.insideTown(p) || site.townDistance(p) <= half + 25) entry = Math.min(entry, walked + s);
      }
      walked += span;
    }
    if (!Number.isFinite(entry) || entry < length) continue;
    for (const segment of segments) {
      for (let s = 0; s < segment.length && segment.start + s < entry - length / 2; s += 8) {
        const p: Point = [segment.a[0] + segment.t[0] * s, segment.a[1] + segment.t[1] * s];
        for (const side of [1, -1]) {
          const normal: Point = [-segment.t[1] * side, segment.t[0] * side];
          const offset = river.surveyed
            ? fixedBankOffset(site.document, p, normal, half, segment.t, length / 2)
            : half + 1.5;
          if (offset === null) continue;
          const origin: Point = [p[0] + normal[0] * (offset + 0.4), p[1] + normal[1] * (offset + 0.4)];
          const angle = Math.atan2(segment.t[1], segment.t[0]);
          const at = frame(origin, angle);
          const polygon = orient(rect(at, -length / 2, 0, length / 2, side * depth));
          if (!site.inFrame(polygon, 6)) continue;
          if (polygon.some(point => site.insideTown(point))) continue;
          if (site.hitsWater(polygon, 0.5) || site.hitsRoutes(polygon, 1.5) || site.hitsBlocked(polygon)) continue;
          const townSide = normal[0] * (townCentre[0] - p[0]) + normal[1] * (townCentre[1] - p[1]) > 0;
          const score = (townSide ? 3 : 0) - Math.abs(entry - (segment.start + s) - 40) * 0.02;
          if (best && score <= best.score) continue;
          const frames: Array<[Point, Point]> = [];
          for (let u = -length / 2 + 3; u < length / 2 - 2; u += 4)
            frames.push([at(u, side * 2), at(u, side * (depth - 2))]);
          best = {
            score,
            yard: {
              id: `guild-yard-${facility.domain}-bleachingField`,
              domain: facility.domain,
              kind: "bleachingField",
              name: YARD_NAME.bleachingField,
              practitioners: facility.practitioners,
              year,
              polygon,
              frames
            }
          };
        }
      }
    }
  }
  if (!best) return null;
  site.claim(best.yard.polygon);
  return best.yard;
}

export function placeGuildWorks(
  site: GuildSiteView,
  facilities: readonly PlannedGuildFacility[],
  year: number
): { halls: GuildHall[]; yards: GuildYard[] } {
  const halls: GuildHall[] = [];
  const yards: GuildYard[] = [];
  const used = new Set<Id>();
  for (const facility of facilities) {
    if (!facility.hall || site.town.length < 3) continue;
    const hall = placeHall(site, facility, year, used);
    if (hall) halls.push(hall);
  }
  for (const facility of facilities) {
    for (const kind of facility.ancillary) {
      if (kind === "tannery") continue;
      const yard =
        kind === "bleachingField" ? placeBleaching(site, facility, year) : placeOpenYard(site, facility, kind, year);
      if (yard) yards.push(yard);
    }
  }
  return { halls, yards };
}
