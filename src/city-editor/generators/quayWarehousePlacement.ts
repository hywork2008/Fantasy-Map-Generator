import { historicalPeriodIndex } from "../../types/historicalPeriod";
import type { PortWarehouseLayout, SitePortWarehouse, SiteStorageYard } from "../types/contracts/burgSiteEconomy";
import type { HistoricalPeriod, Id, Point } from "../types/document";
import { polygonArea } from "./geom";
import type { GuildSiteView } from "./guildFacilityPlacement";
import { facePoints } from "./mesh";

/**
 * Port warehouses from BurgSiteEconomy.portWarehouse (docs/plan/port-freight-queue-and-warehouses.md §6).
 *
 * Every port studied kept its warehouses behind the landing place or on a cut led into the plot:
 * Bryggen's gabled rows ran back from the wharf, the Steelyard and the Fondaco dei Tedeschi stood
 * on the water with their own landing, and the Asakusa rice store had eight cuts for its boats.
 * Large warehouses never stood in the middle of a town; stores away from the water were small.
 */

export type QuayWarehouseLayout = Exclude<PortWarehouseLayout, "merchantHouses">;

export interface QuayWarehouse {
  id: Id;
  layout: QuayWarehouseLayout;
  name: string;
  footprint: Point[];
  /** Roof ridge. Absent on a courtyard compound. */
  ridge?: [Point, Point];
  /** Open court of a compound. */
  court?: Point[];
  areaM2: number;
  storeys: number;
  mainGoods: string[];
  queuedSlots: number;
  year: number;
}

export interface QuaySiteView extends GuildSiteView {
  wardsUnder(polygon: Point[]): Set<string>;
}

const NAMES: Record<QuayWarehouseLayout, string> = {
  quayRow: "Quay Warehouse",
  compound: "Merchants' Compound",
  stateStore: "Storehouse",
  dock: "Dock Warehouse"
};

/** Building size per layout: width along the shore, depth back from it (m), and gap between buildings. */
const PIECE: Record<QuayWarehouseLayout, { along: number; depth: number; gap: number; gableToWater: boolean }> = {
  // Narrow gabled stores running back from the wharf (Bryggen, Lübeck Salzspeicher).
  quayRow: { along: 10, depth: 24, gap: 3, gableToWater: true },
  // One walled compound on the water (Steelyard 5,250 m², Fondaco about 2,200 m² a floor).
  compound: { along: 70, depth: 50, gap: 0, gableToWater: false },
  // Long storehouses side by side along the bank (horrea, rice stores).
  stateStore: { along: 40, depth: 14, gap: 4, gableToWater: false },
  // West India Docks blocks, about 68 × 35 m.
  dock: { along: 68, depth: 35, gap: 6, gableToWater: false }
};

const BLOCKED_WARDS = new Set(["castle", "market", "cemetery", "park"]);
/** Furthest a warehouse's front may stand from the water. */
const SHORE_REACH = 45;
/** Quay left between the water and a warehouse front. */
const QUAY_SETBACK = 6;
const PROBE_STEP = 3;
const PROBE_DIRECTIONS = 12;
const MAX_PIECES = 24;
/** Port warehouses cover at most this share of the town. */
const TOWN_SHARE_CAP = 0.12;
/** Courtyard ranges are this deep. */
const COMPOUND_RANGE_DEPTH = 9;
/** Furthest outside the town a warehouse may stand (a rice store on the edge of town). */
const OUTSIDE_TOWN_REACH = 150;

/** Storeys by period: two in antiquity and the early middle ages, up to five or six with the docks. */
export function quayWarehouseStoreys(period: HistoricalPeriod): number {
  const index = historicalPeriodIndex(period);
  if (index < 0) return 3;
  if (index < historicalPeriodIndex("highMedieval")) return 2;
  if (index < historicalPeriodIndex("ageOfExploration")) return 3;
  if (index < historicalPeriodIndex("steamEra")) return 4;
  return 5;
}

/** Ground area the profile asks for, after storeys and the town-share cap. */
export function quayWarehouseGroundArea(
  warehouse: SitePortWarehouse,
  period: HistoricalPeriod,
  townAreaM2: number
): number {
  if (warehouse.layout === "merchantHouses" || !(warehouse.floorAreaM2 > 0)) return 0;
  const ground = warehouse.floorAreaM2 / quayWarehouseStoreys(period);
  return Math.min(ground, Math.max(0, townAreaM2) * TOWN_SHARE_CAP);
}

function square(centre: Point, half: number): Point[] {
  return [
    [centre[0] - half, centre[1] - half],
    [centre[0] + half, centre[1] - half],
    [centre[0] + half, centre[1] + half],
    [centre[0] - half, centre[1] + half]
  ];
}

function centroid(points: Point[]): Point {
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length
  ];
}

function bounds(points: Point[], grow: number): Point[] {
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const x0 = Math.min(...xs) - grow,
    x1 = Math.max(...xs) + grow,
    y0 = Math.min(...ys) - grow,
    y1 = Math.max(...ys) + grow;
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1]
  ];
}

/** Direction and distance to the nearest water within reach, probing a ring of rays. */
function shoreFrom(site: GuildSiteView, centre: Point): { normal: Point; dist: number } | null {
  let best: { normal: Point; dist: number } | null = null;
  for (let k = 0; k < PROBE_DIRECTIONS; k++) {
    const angle = (k / PROBE_DIRECTIONS) * Math.PI * 2;
    const normal: Point = [Math.cos(angle), Math.sin(angle)];
    for (let d = PROBE_STEP; d <= SHORE_REACH + QUAY_SETBACK && (!best || d < best.dist); d += PROBE_STEP) {
      if (!site.hitsWater(square([centre[0] + normal[0] * d, centre[1] + normal[1] * d], 0.5), 0)) continue;
      best = { normal, dist: d };
      break;
    }
  }
  return best;
}

interface Spot {
  centre: Point;
  normal: Point;
  dist: number;
  score: number;
}

function spots(site: QuaySiteView): Spot[] {
  const found: Spot[] = [];
  for (const face of Object.values(site.document.mesh.faces)) {
    const props = face.properties;
    if (props.water !== "land" || BLOCKED_WARDS.has(props.ward ?? "")) continue;
    const polygon = facePoints(site.document.mesh, face);
    if (polygon.length < 3) continue;
    // Cheap test first: is any water within reach of the face at all?
    if (!site.hitsWater(bounds(polygon, SHORE_REACH), 0)) continue;
    const centre = centroid(polygon);
    const inside = site.insideTown(centre);
    if (!inside && site.townDistance(centre) > OUTSIDE_TOWN_REACH) continue;
    const shore = shoreFrom(site, centre);
    if (!shore) continue;
    const score = -shore.dist + (inside ? 12 : 0) - Math.hypot(centre[0], centre[1]) * 0.01;
    found.push({ centre, normal: shore.normal, dist: shore.dist, score });
  }
  return found.sort((a, b) => b.score - a.score);
}

function rectAt(centre: Point, normal: Point, along: number, depth: number): Point[] {
  const tangent: Point = [-normal[1], normal[0]];
  const corner = (u: number, v: number): Point => [
    centre[0] + tangent[0] * u + normal[0] * v,
    centre[1] + tangent[1] * u + normal[1] * v
  ];
  const polygon = [
    corner(-along / 2, -depth / 2),
    corner(along / 2, -depth / 2),
    corner(along / 2, depth / 2),
    corner(-along / 2, depth / 2)
  ];
  return polygonArea(polygon) < 0 ? polygon.reverse() : polygon;
}

function fits(site: QuaySiteView, polygon: Point[]): boolean {
  if (!site.inFrame(polygon, 2)) return false;
  if (site.hitsWater(polygon, 1)) return false;
  if (site.hitsRoutes(polygon, 1) || site.hitsBlocked(polygon) || site.hitsLanes(polygon)) return false;
  for (const ward of site.wardsUnder(polygon)) if (BLOCKED_WARDS.has(ward)) return false;
  return true;
}

/** The strip in front of a warehouse reaches the water across the quay, so a row ends where the bank turns away. */
function facesWater(site: QuaySiteView, centre: Point, normal: Point, along: number, depth: number): boolean {
  const reach = QUAY_SETBACK + 4;
  const front: Point = [
    centre[0] + normal[0] * (depth / 2 + reach / 2),
    centre[1] + normal[1] * (depth / 2 + reach / 2)
  ];
  return site.hitsWater(rectAt(front, normal, along * 0.6, reach), 0);
}

/**
 * Lays the port's warehouses along the shore, nearest the water and the town first. A quay row is
 * gabled to the water; storehouses and dock warehouses run along it; a compound is one walled
 * court on the water. Stops when the profile's ground area is placed or the shore runs out.
 */
export function placeQuayWarehouses(
  site: QuaySiteView,
  warehouse: SitePortWarehouse | undefined,
  period: HistoricalPeriod,
  year: number
): QuayWarehouse[] {
  if (!warehouse || warehouse.layout === "merchantHouses" || site.town.length < 3) return [];
  const layout = warehouse.layout;
  const target = quayWarehouseGroundArea(warehouse, period, Math.abs(polygonArea(site.town)));
  const piece = PIECE[layout];
  const storeys = quayWarehouseStoreys(period);
  let along = piece.along;
  let depth = piece.depth;
  if (layout === "compound") {
    // One court sized to the profile, within the Steelyard's order of size.
    const area = Math.min(target, piece.along * piece.depth);
    along = Math.sqrt(area * 1.4);
    depth = area / along;
  }
  if (!(target >= Math.min(along * depth, piece.along * piece.depth) * 0.5)) return [];
  const maxPieces = layout === "compound" ? 1 : MAX_PIECES;

  const placed: QuayWarehouse[] = [];
  let left = target;
  for (const spot of spots(site)) {
    if (left <= 0 || placed.length >= maxPieces) break;
    const back = spot.dist - QUAY_SETBACK - depth / 2;
    if (back < -depth / 2) continue;
    const base: Point = [spot.centre[0] + spot.normal[0] * back, spot.centre[1] + spot.normal[1] * back];
    const tangent: Point = [-spot.normal[1], spot.normal[0]];
    // Fill outwards along the shore from this spot: 0, +1, -1, +2, -2 …
    for (let step = 0; step < 2 * MAX_PIECES && left > 0 && placed.length < maxPieces; step++) {
      const index = step % 2 === 0 ? step / 2 : -(step + 1) / 2;
      const offset = index * (along + piece.gap);
      const centre: Point = [base[0] + tangent[0] * offset, base[1] + tangent[1] * offset];
      const footprint = rectAt(centre, spot.normal, along, depth);
      if (!fits(site, footprint) || !facesWater(site, centre, spot.normal, along, depth)) continue;
      site.claim(footprint);
      const half = piece.gableToWater ? depth / 2 - 1 : along / 2 - 1;
      const axis: Point = piece.gableToWater ? spot.normal : tangent;
      const ridge: [Point, Point] = [
        [centre[0] - axis[0] * half, centre[1] - axis[1] * half],
        [centre[0] + axis[0] * half, centre[1] + axis[1] * half]
      ];
      const court =
        layout === "compound" && along > COMPOUND_RANGE_DEPTH * 2 + 6 && depth > COMPOUND_RANGE_DEPTH * 2 + 6
          ? rectAt(centre, spot.normal, along - COMPOUND_RANGE_DEPTH * 2, depth - COMPOUND_RANGE_DEPTH * 2)
          : undefined;
      const area = Math.round(Math.abs(polygonArea(footprint)));
      placed.push({
        id: `quay-warehouse-${placed.length}`,
        layout,
        name: NAMES[layout],
        footprint,
        ...(layout === "compound" ? {} : { ridge }),
        ...(court ? { court } : {}),
        areaM2: area,
        storeys,
        mainGoods: warehouse.mainGoods.slice(0, 3),
        queuedSlots: warehouse.queuedSlots,
        year
      });
      left -= area;
    }
  }
  return placed;
}

/**
 * Stock yards of sea goods are what lies in the port warehouses. Waterborne warehouse and granary
 * yards shrink by the ground the quay warehouses already cover, so the same goods are not drawn twice.
 */
export function subtractQuayCover(
  yards: readonly SiteStorageYard[],
  quay: readonly QuayWarehouse[]
): SiteStorageYard[] {
  let cover = quay.reduce((sum, item) => sum + item.areaM2, 0);
  if (!(cover > 0)) return [...yards];
  return yards.map(yard => {
    if (cover <= 0 || !yard.waterborne || (yard.form !== "warehouse" && yard.form !== "granary") || yard.origin)
      return yard;
    const taken = Math.min(cover, yard.areaM2);
    cover -= taken;
    return { ...yard, areaM2: yard.areaM2 - taken };
  });
}
