import { facePoints } from "../mesh";
import { flowingRivers } from "../riverFlow";
import type { Id, Point } from "../types";
import { nearestOnPolyline, pointInPolygon, polygonArea } from "./geom";
import type { GuildSiteView, GuildYard } from "./guildFacilityPlacement";
import type { SiteStorageYard, StorageForm } from "./site/burgSiteEconomy";

/**
 * Ground yards from BurgSiteEconomy.storage.
 * Cellars stay underground and do not take a plot.
 * A guild timber or stone yard already on the map covers that much of the same form.
 */

export interface StorageYard {
  id: Id;
  form: StorageForm;
  name: string;
  /** Placed ground area. A tight town may hold less than the profile asked for. */
  areaM2: number;
  mainGoods: string[];
  waterborne: boolean;
  year: number;
  /** False for a granary or warehouse inside the town. */
  outside: boolean;
  polygon: Point[];
}

const NAMES: Record<Exclude<StorageForm, "cellar">, string> = {
  livestockPen: "Livestock Market",
  timberYard: "Timber Yard",
  stoneYard: "Stone Yard",
  fuelStack: "Fuel Stack",
  granary: "Granary",
  warehouse: "Warehouse"
};

const OUTSIDE = new Set<StorageForm>(["livestockPen", "fuelStack", "timberYard", "stoneYard"]);
const SHARED_WITH_GUILD = new Set<StorageForm>(["timberYard", "stoneYard"]);
const BLOCKED_WARDS = new Set(["castle", "market", "cemetery", "harbor", "park"]);
const ASPECT = 1.7;
const MAX_PIECE_M2 = 1600;
const MIN_PIECE_M2 = 36;
const MAX_PIECES = 6;

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
  centre: Point;
  polygon: Point[];
}

function faces(site: GuildSiteView, outside: boolean): FaceSpot[] {
  const spots: FaceSpot[] = [];
  for (const face of Object.values(site.document.mesh.faces)) {
    const props = face.properties;
    if (props.water !== "land" || BLOCKED_WARDS.has(props.ward ?? "")) continue;
    const polygon = facePoints(site.document.mesh, face);
    if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 180) continue;
    const centre = centroid(polygon);
    if (outside ? site.insideTown(centre) : !site.insideTown(centre)) continue;
    if (!outside && props.settlement && props.settlement !== "core") continue;
    spots.push({ centre, polygon });
  }
  return spots;
}

function plotFits(site: GuildSiteView, spot: FaceSpot, polygon: Point[], outside: boolean): boolean {
  if (!insideRing(polygon, spot.polygon, 0.8)) return false;
  const centre = centroid(polygon);
  if (outside) {
    if (polygon.some(point => site.insideTown(point))) return false;
    if (site.townDistance(centre) < 8) return false;
  } else if (!polygon.every(point => site.insideTown(point))) return false;
  if (!site.inFrame(polygon, outside ? 4 : 2)) return false;
  if (site.hitsWater(polygon, 0.8) || site.hitsRoutes(polygon, 1.2) || site.hitsBlocked(polygon)) return false;
  if (site.hitsLanes(polygon)) return false;
  return true;
}

function dims(area: number): [number, number] {
  const depth = Math.sqrt(area / ASPECT);
  return [area / depth, depth];
}

function bearingDeg(point: Point): number {
  return (Math.atan2(point[0], point[1]) * 180) / Math.PI;
}

function angleDelta(a: number, b: number): number {
  const delta = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(delta, 360 - delta);
}

function guildCover(form: StorageForm, guildYards: readonly GuildYard[]): number {
  if (!SHARED_WITH_GUILD.has(form)) return 0;
  let area = 0;
  for (const yard of guildYards) {
    if (yard.kind !== form) continue;
    area += Math.abs(polygonArea(yard.polygon));
  }
  return area;
}

interface RiverPoint {
  dist: number;
  along: number;
}

function riverAt(point: Point, rivers: readonly Point[][]): RiverPoint {
  let dist = Number.POSITIVE_INFINITY;
  let along = 0;
  for (const points of rivers) {
    const hit = nearestOnPolyline(point, points);
    if (hit.dist >= dist) continue;
    dist = hit.dist;
    along = hit.segIndex + hit.t;
  }
  return { dist, along };
}

function placePiece(
  site: GuildSiteView,
  yard: SiteStorageYard,
  area: number,
  outside: boolean,
  rivers: readonly Point[][]
): Point[] | null {
  for (const scale of [1, 0.7, 0.45]) {
    const [length, depth] = dims(area * scale);
    if (length < 6 || depth < 5) continue;
    let best: { score: number; polygon: Point[] } | null = null;
    for (const spot of faces(site, outside)) {
      const away = site.townDistance(spot.centre);
      if (outside && (away < 10 || away > 180)) continue;
      const radial = Math.atan2(spot.centre[1], spot.centre[0]);
      for (const angle of [radial + Math.PI / 2, radial]) {
        const at = frame(spot.centre, angle);
        const polygon = orient(rect(at, -length / 2, -depth / 2, length / 2, depth / 2));
        if (!plotFits(site, spot, polygon, outside)) continue;
        const river = riverAt(spot.centre, rivers);
        let score = scale * 4 - site.buildingsIn(polygon).length * 0.35;
        if (yard.inflowAzimuthDeg != null) score -= angleDelta(bearingDeg(spot.centre), yard.inflowAzimuthDeg) * 0.04;
        if (outside) {
          score -= Math.abs(away - (yard.form === "fuelStack" ? 70 : 36)) * 0.03;
          if (yard.form === "livestockPen") score += river.along * 0.15;
        } else score -= Math.hypot(spot.centre[0], spot.centre[1]) * 0.012;
        if (yard.waterborne) score -= Math.min(river.dist, 400) * 0.02;
        if (!best || score > best.score) best = { score, polygon };
      }
    }
    if (best) return best.polygon;
  }
  return null;
}

/** One plot per piece, largest first, until the asked area is placed or the town runs out of room. */
export function placeStorageYards(
  site: GuildSiteView,
  yards: readonly SiteStorageYard[],
  guildYards: readonly GuildYard[],
  year: number
): StorageYard[] {
  if (site.town.length < 3) return [];
  const rivers = flowingRivers(site.document)
    .map(river => river.points)
    .filter(points => points.length >= 2);
  const placed: StorageYard[] = [];
  for (const yard of yards) {
    if (yard.form === "cellar" || !(yard.areaM2 >= MIN_PIECE_M2)) continue;
    if (!OUTSIDE.has(yard.form) && yard.form !== "granary" && yard.form !== "warehouse") continue;
    const outside = OUTSIDE.has(yard.form);
    let left = yard.areaM2 - guildCover(yard.form, guildYards);
    let index = 0;
    while (left >= MIN_PIECE_M2 && index < MAX_PIECES) {
      const polygon = placePiece(site, yard, Math.min(left, MAX_PIECE_M2), outside, rivers);
      if (!polygon) break;
      const area = Math.abs(polygonArea(polygon));
      site.claim(polygon);
      placed.push({
        id: `storage-${yard.form}-${index}`,
        form: yard.form,
        name: NAMES[yard.form],
        areaM2: Math.round(area),
        mainGoods: yard.mainGoods.slice(0, 3),
        waterborne: yard.waterborne,
        year,
        outside,
        polygon
      });
      left -= area;
      index += 1;
    }
  }
  return placed;
}
