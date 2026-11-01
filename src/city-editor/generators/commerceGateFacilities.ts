import type { ApproachProfile } from "../../services/approachProfile";
import type { CityDocument, EdgeFeatureGroup, Point } from "../types/document";
import { externalGateRoads } from "./approachBeyond";
import {
  type ApproachCommerceRoad,
  COMMERCE_CARGO_MARK,
  type CommerceGateShare,
  commerceGateShares
} from "./approachCommerce";
import { featureGroupVertices } from "./features";
import type { GateInn } from "./gateInnPlacement";
import { polygonArea } from "./geom";
import type { GuildSiteView } from "./guildFacilityPlacement";
import type { StorageYard } from "./storageYardPlacement";

/**
 * Cargo-specific gate works (approach-commerce-quarters.md §6.3).
 * Drawn only when approach commerce is on. Off keeps the existing yards and inns.
 * A khan label for caravanserai cultures is §6.5 and is not applied here.
 */

export type CommerceFacilityKind =
  | "livestockMarket"
  | "grainMarket"
  | "granary"
  | "bulkYard"
  | "retailMarket"
  | "caravanserai";

export interface CommerceFacilityRole {
  kind: CommerceFacilityKind;
  point: Point;
  /** Higher cargo wins when several gates ask for the same kind of pull. */
  weight: number;
  /** Descriptor road index. Absent for the central retail court and a sea landing. */
  roadIndex?: number;
}

type Cargo = ApproachProfile["cargo"];

/** True when `key` is present and no other class is strictly larger. A tie stays primary. */
function isPrimary(cargo: Cargo, key: string): boolean {
  const amount = cargo[key as keyof Cargo] ?? 0;
  if (!(amount > 0)) return false;
  for (const [other, value] of Object.entries(cargo)) {
    if (other !== key && (value ?? 0) > amount) return false;
  }
  return true;
}

function luxuryMass(share: CommerceGateShare): number {
  return Math.max(0, share.share) * Math.max(0, share.cargoValue.luxury ?? 0);
}

/** One role per qualifying gate. Retail is a single court at the plaza. */
export function facilityRolesFromShares(shares: readonly CommerceGateShare[], plaza: Point): CommerceFacilityRole[] {
  const roles: CommerceFacilityRole[] = [];
  const masses = shares.map(luxuryMass);
  const luxuryTotal = masses.reduce((sum, mass) => sum + mass, 0);
  let retail = 0;
  for (let index = 0; index < shares.length; index++) {
    const share = shares[index];
    const livestock = share.cargo.livestock ?? 0;
    const grain = share.cargo.grain ?? 0;
    const bulk = share.cargo.bulk ?? 0;
    const perishable = share.cargo.perishable ?? 0;
    const luxury = share.cargoValue.luxury ?? 0;
    const land = share.roadIndex != null;
    if (land && livestock >= COMMERCE_CARGO_MARK)
      roles.push({ kind: "livestockMarket", point: share.point, weight: livestock, roadIndex: share.roadIndex });
    if (land && isPrimary(share.cargo, "grain")) {
      roles.push({ kind: "grainMarket", point: share.point, weight: grain, roadIndex: share.roadIndex });
      roles.push({ kind: "granary", point: share.point, weight: grain, roadIndex: share.roadIndex });
    }
    if (land && bulk >= COMMERCE_CARGO_MARK)
      roles.push({ kind: "bulkYard", point: share.point, weight: bulk, roadIndex: share.roadIndex });
    if (perishable >= COMMERCE_CARGO_MARK || isPrimary(share.cargo, "perishable"))
      retail = Math.max(retail, perishable);
    const concentrated = luxuryTotal > 0 && masses[index] > luxuryTotal / 2;
    if (luxury >= COMMERCE_CARGO_MARK || concentrated)
      roles.push({
        kind: "caravanserai",
        point: share.point,
        weight: Math.max(luxury, masses[index]),
        ...(share.roadIndex != null ? { roadIndex: share.roadIndex } : {})
      });
  }
  if (retail > 0) roles.push({ kind: "retailMarket", point: plaza, weight: retail });
  return roles;
}

function plazaPoint(document: CityDocument): Point {
  const plaza = document.elements?.find(element => element.kind === "plaza" && element.point);
  return plaza?.point ?? [0, 0];
}

function harborPoint(document: CityDocument): Point | null {
  const harbor = document.elements?.find(element => element.kind === "harbor" && element.point);
  return harbor?.point ?? null;
}

/** Townward end first, so the tangent of the line points out of town. */
function approachLine(document: CityDocument, group: EdgeFeatureGroup): Point[] {
  const points = featureGroupVertices(document, group)
    .map(id => document.mesh.vertices[id]?.point)
    .filter((point): point is Point => !!point);
  if (points.length < 2) return points;
  const far = (point: Point) => Math.hypot(point[0], point[1]);
  return far(points[0]) <= far(points[points.length - 1]) ? points : [...points].reverse();
}

/**
 * Roles for the saved descriptor. Empty unless approach commerce is on.
 * Land roles take the real approach's townward end; a sea caravanserai uses the harbour.
 */
export function commerceFacilityRoles(document: CityDocument): CommerceFacilityRole[] {
  const settings = document.fabric?.generation?.settings;
  if (settings?.approachCommerce !== "on") return [];
  const roads = (settings.descriptor?.roads ?? []) as readonly ApproachCommerceRoad[];
  const port = settings.descriptor?.burg.port === true || settings.config?.features.port === true;
  const roles = facilityRolesFromShares(commerceGateShares(roads, port), plazaPoint(document));
  if (!roles.length) return [];
  const lines = new Map<number, Point[]>();
  for (const exit of externalGateRoads(document)) {
    const index = exit.group.sourceRoad?.index;
    if (index == null || lines.has(index)) continue;
    const line = approachLine(document, exit.group);
    if (line.length >= 2) lines.set(index, line);
  }
  const harbor = harborPoint(document);
  const placed: CommerceFacilityRole[] = [];
  for (const role of roles) {
    if (role.kind === "retailMarket") {
      placed.push(role);
      continue;
    }
    if (role.roadIndex == null) {
      if (role.kind === "caravanserai" && harbor) placed.push({ ...role, point: harbor });
      continue;
    }
    const line = lines.get(role.roadIndex);
    if (!line) continue;
    placed.push({ ...role, point: line[0] });
  }
  return placed;
}

export interface CommerceFacilityPlots {
  yards: StorageYard[];
  inns: GateInn[];
}

function hypot(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function unit(from: Point, to: Point): Point | null {
  const length = hypot(from, to);
  if (length < 1e-6) return null;
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
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

function sample(points: Point[], distance: number): { point: Point; tangent: Point } | null {
  let walked = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
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

function outsideFits(site: GuildSiteView, polygon: Point[]): boolean {
  if (polygon.some(point => site.insideTown(point) || site.townDistance(point) < 4)) return false;
  if (!site.inFrame(polygon, 4)) return false;
  if (site.hitsWater(polygon, 1) || site.hitsRoutes(polygon, 0.8) || site.hitsBlocked(polygon)) return false;
  if (site.hitsLanes(polygon) || !site.clearsGlacis(polygon)) return false;
  return true;
}

function insideFits(site: GuildSiteView, polygon: Point[]): boolean {
  if (!polygon.every(point => site.insideTown(point))) return false;
  if (!site.inFrame(polygon, 2)) return false;
  if (site.hitsWater(polygon, 0.6) || site.hitsRoutes(polygon, 0.6) || site.hitsBlocked(polygon)) return false;
  return !site.hitsLanes(polygon);
}

function yardOf(
  id: string,
  form: StorageYard["form"],
  name: string,
  polygon: Point[],
  outside: boolean,
  year: number
): StorageYard {
  return {
    id,
    form,
    name,
    areaM2: Math.round(Math.abs(polygonArea(polygon))),
    mainGoods: [],
    waterborne: false,
    year,
    outside,
    polygon
  };
}

function placeOutside(
  site: GuildSiteView,
  document: CityDocument,
  roadIndex: number,
  halfAlong: number,
  halfAcross: number
): Point[] | null {
  const exit = externalGateRoads(document).find(road => road.group.sourceRoad?.index === roadIndex);
  if (!exit) return null;
  const points = approachLine(document, exit.group);
  if (points.length < 2) return null;
  for (let extra = 0; extra <= 180; extra += 12) {
    const at = sample(points, 18 + extra);
    if (!at) break;
    for (const sign of [1, -1] as const) {
      const across: Point = [-at.tangent[1] * sign, at.tangent[0] * sign];
      const center: Point = [at.point[0] + across[0] * (halfAcross + 4), at.point[1] + across[1] * (halfAcross + 4)];
      const polygon = rect(center, at.tangent, across, halfAlong, halfAcross);
      if (outsideFits(site, polygon)) return polygon;
    }
  }
  return null;
}

function placeInside(
  site: GuildSiteView,
  gate: Point,
  plaza: Point,
  alongMeters: number,
  halfAlong: number,
  halfAcross: number
): Point[] | null {
  const inward = unit(gate, plaza);
  if (!inward) return null;
  for (const sign of [1, -1] as const) {
    const across: Point = [-inward[1] * sign, inward[0] * sign];
    const center: Point = [
      gate[0] + inward[0] * alongMeters + across[0] * (halfAcross + 6),
      gate[1] + inward[1] * alongMeters + across[1] * (halfAcross + 6)
    ];
    const polygon = rect(center, inward, across, halfAlong, halfAcross);
    if (insideFits(site, polygon)) return polygon;
  }
  return null;
}

function placeCaravanserai(
  site: GuildSiteView,
  role: CommerceFacilityRole,
  plaza: Point,
  year: number
): GateInn | null {
  const gate = role.point;
  for (const t of [0.35, 0.5, 0.22]) {
    const centerLine: Point = [plaza[0] + (gate[0] - plaza[0]) * t, plaza[1] + (gate[1] - plaza[1]) * t];
    const inward = unit(centerLine, plaza) ?? unit(gate, plaza);
    if (!inward) continue;
    for (const sign of [1, -1] as const) {
      const across: Point = [-inward[1] * sign, inward[0] * sign];
      const center: Point = [centerLine[0] + across[0] * 14, centerLine[1] + across[1] * 14];
      const footprint = rect(center, inward, across, 10, 8);
      if (!insideFits(site, footprint)) continue;
      const court = rect(center, inward, across, 6, 4.5);
      const index = role.roadIndex ?? "sea";
      return {
        id: `commerce-caravanserai-${index}`,
        kind: "caravanserai",
        name: "Caravanserai",
        stableSpaces: 8,
        count: 1,
        year,
        footprint,
        court,
        entrance: [midpoint(footprint[0], footprint[1]), midpoint(court[0], court[1])],
        stalls: []
      };
    }
  }
  return null;
}

function placeRetail(site: GuildSiteView, plaza: Point, year: number): StorageYard | null {
  const offsets: Point[] = [
    [14, 10],
    [-14, 10],
    [14, -10],
    [-14, -10]
  ];
  for (const offset of offsets) {
    const center: Point = [plaza[0] + offset[0], plaza[1] + offset[1]];
    const polygon = rect(center, [1, 0], [0, 1], 6, 4);
    if (!insideFits(site, polygon)) continue;
    return yardOf("commerce-retail", "warehouse", "Retail Market", polygon, false, year);
  }
  return null;
}

/** Livestock pens and grain yards, a central retail court, and a center-side caravanserai. */
export function placeCommerceFacilities(
  site: GuildSiteView,
  roles: readonly CommerceFacilityRole[],
  year = 0
): CommerceFacilityPlots {
  const yards: StorageYard[] = [];
  const inns: GateInn[] = [];
  const plaza = plazaPoint(site.document);
  const keep = (yard: StorageYard | null) => {
    if (!yard) return;
    yards.push(yard);
    site.claim(yard.polygon);
  };
  for (const role of roles) {
    const index = role.roadIndex;
    if (role.kind === "livestockMarket" && index != null) {
      const polygon = placeOutside(site, site.document, index, 9, 6);
      if (polygon) keep(yardOf(`commerce-livestock-${index}`, "livestockPen", "Livestock Market", polygon, true, year));
    } else if (role.kind === "grainMarket" && index != null) {
      const polygon = placeInside(site, role.point, plaza, 18, 8, 5);
      if (polygon) keep(yardOf(`commerce-grain-market-${index}`, "granary", "Grain Market", polygon, false, year));
    } else if (role.kind === "granary" && index != null) {
      const polygon = placeInside(site, role.point, plaza, 36, 7, 5);
      if (polygon) keep(yardOf(`commerce-granary-${index}`, "granary", "Granary", polygon, false, year));
    } else if (role.kind === "retailMarket") keep(placeRetail(site, role.point, year));
    else if (role.kind === "caravanserai") {
      const inn = placeCaravanserai(site, role, plaza, year);
      if (!inn) continue;
      inns.push(inn);
      site.claim(inn.footprint);
    }
  }
  return { yards, inns };
}

/** The bulk gate guild timber, stone, lime and smith yards should sit beside. */
export function bulkGatePoint(roles: readonly CommerceFacilityRole[]): Point | null {
  let best: CommerceFacilityRole | null = null;
  for (const role of roles) {
    if (role.kind !== "bulkYard") continue;
    if (!best || role.weight > best.weight) best = role;
  }
  return best?.point ?? null;
}
