import type { Burg, PackedGraph } from "../../hostTypes";
import type { UrbanWaterSystem } from "./urbanWaterTypes";

export interface InheritedSewerRoute {
  id: string;
  burgId: number;
  outfallCell: number;
  outfallKind: "river" | "coast" | "storage";
  /** The downstream trunk this branch joins, when its own route does not reach the outfall. */
  joinsRouteId?: string;
  source: [number, number];
  destination: [number, number];
}

type SewerCells = Pick<PackedGraph["cells"], "f" | "h" | "haven" | "i" | "r" | "state"> & {
  /** Legacy simulation fixtures can omit geometry; fall back to packed-cell proximity there. */
  p?: PackedGraph["cells"]["p"];
};
type RiverMeta = Pick<PackedGraph["rivers"][number], "i" | "source"> &
  Partial<Pick<PackedGraph["rivers"][number], "mouth">>;
type WaterFeature = Pick<PackedGraph["features"][number], "i" | "type" | "closed">;
type Point = [number, number];
type SewerJoin = { point: Point; trunkT: number };
type SewerOutfall = { cell: number; kind: InheritedSewerRoute["outfallKind"] };

export type GiantSewerClimateOptions = {
  /** Burgs whose winter freezes exposed treatment while their brief summer can run infiltration beds. */
  seasonalColdBurgIds?: ReadonlySet<number>;
  /** Needed to distinguish a river mouth in the ocean from a land terminus or closed lake. */
  features?: readonly WaterFeature[];
};

const SEWER_MERGE_DISTANCE = 10;

/**
 * Determine the Giant inherited trunk-sewer route for each served settlement.
 * Outfalls stay on the same landmass and must be no higher than the settlement. A river is used
 * only when it is nearer than the coast, preventing a remote river line from crossing lowland
 * that could discharge directly into the nearby sea.
 */
export function buildInheritedSewerRoutes(args: {
  burgs: readonly (Burg | undefined)[];
  cells: SewerCells;
  rivers?: readonly RiverMeta[];
  climate?: GiantSewerClimateOptions;
  systems: readonly UrbanWaterSystem[];
}): InheritedSewerRoute[] {
  const directRoutes: InheritedSewerRoute[] = [];
  for (const system of args.systems) {
    // Older saves used the combined waterworks flag; retain their trunk sewer when loading them.
    if (!(system.hasInheritedRomanSewer ?? system.hasInheritedRomanWaterworks)) continue;
    const burg = args.burgs[system.burgId];
    if (!burg?.i) continue;
    const outfall = chooseSameLandSewerOutfall(burg, args.cells, args.rivers, args.climate);
    if (outfall === undefined) continue;
    const destination = args.cells.p?.[outfall.cell];
    if (!destination) continue;
    directRoutes.push({
      id: `roman-sewer-${burg.i}`,
      burgId: burg.i,
      outfallCell: outfall.cell,
      outfallKind: outfall.kind,
      source: [burg.x, burg.y],
      destination: [destination[0], destination[1]]
    });
  }
  return consolidateNearbySewerRoutes(directRoutes, args.cells);
}

/** True if a gravity trunk sewer can reach a lower river or coast on the same landmass. */
export function hasSameLandSewerOutfall(
  burg: Burg,
  cells: SewerCells,
  rivers?: readonly RiverMeta[],
  climate?: GiantSewerClimateOptions
): boolean {
  return chooseSameLandSewerOutfall(burg, cells, rivers, climate) !== undefined;
}

function chooseSameLandSewerOutfall(
  burg: Burg,
  cells: SewerCells,
  rivers?: readonly RiverMeta[],
  climate?: GiantSewerClimateOptions
): SewerOutfall | undefined {
  const landFeature = cells.f?.[burg.cell];
  const burgHeight = cells.h[burg.cell] ?? 0;
  const cellIds = cells.i?.length ? cells.i : Array.from({ length: cells.r.length }, (_value, cell) => cell);
  const sameLandLower = cellIds.filter(
    cell => (!cells.f || cells.f[cell] === landFeature) && (cells.h[cell] ?? 0) <= burgHeight
  );
  // The source cell is an inviolate headwater intake. A trunk sewer can join only the second
  // mapped cell or later, even when the source happens to be the closest river point.
  const riverHeadCells = getRiverHeadCells(cells, rivers);
  const seasonalCold = Boolean(burg.i && climate?.seasonalColdBurgIds?.has(burg.i));
  const closedRiverIds = seasonalCold ? getClosedRiverIds(cells, rivers, climate?.features) : new Set<number>();
  const river = sameLandLower.filter(
    cell => cells.r[cell] && !riverHeadCells.has(cell) && !closedRiverIds.has(cells.r[cell]!)
  );
  const coast = sameLandLower.filter(cell => cells.haven?.[cell]);
  const nearestRiver = nearestByDistance(river, burg, cells);
  const nearestCoast = nearestByDistance(coast, burg, cells);
  if (nearestRiver === undefined && nearestCoast === undefined) {
    const storage = seasonalCold ? chooseSameLandStorageSite(sameLandLower, burg, cells) : undefined;
    return storage === undefined ? undefined : { cell: storage, kind: "storage" };
  }
  if (nearestRiver === undefined) return { cell: nearestCoast!, kind: "coast" };
  if (nearestCoast === undefined) return { cell: nearestRiver, kind: "river" };
  return distanceToBurg(nearestRiver, burg, cells) <= distanceToBurg(nearestCoast, burg, cells)
    ? { cell: nearestRiver, kind: "river" }
    : { cell: nearestCoast, kind: "coast" };
}

function chooseSameLandStorageSite(cells: Iterable<number>, burg: Burg, sewerCells: SewerCells): number | undefined {
  return nearestByDistance(
    Array.from(cells).filter(cell => cell !== burg.cell && !sewerCells.r[cell] && !sewerCells.haven?.[cell]),
    burg,
    sewerCells
  );
}

function getClosedRiverIds(
  cells: SewerCells,
  rivers?: readonly RiverMeta[],
  features?: readonly WaterFeature[]
): Set<number> {
  const featureById = new Map(features?.map(feature => [feature.i, feature]));
  const closed = new Set<number>();
  for (const river of rivers ?? []) {
    if (!Number.isInteger(river.mouth) || river.mouth! < 0 || river.mouth! >= cells.r.length) continue;
    const mouth = river.mouth!;
    const feature = featureById.get(cells.f?.[mouth] ?? -1);
    if ((cells.h[mouth] ?? 0) >= 20 || (feature && (feature.type !== "ocean" || feature.closed))) closed.add(river.i);
  }
  return closed;
}

function getRiverHeadCells(cells: SewerCells, rivers?: readonly RiverMeta[]): Set<number> {
  const headCells = new Set<number>();
  const explicitRiverIds = new Set<number>();
  for (const river of rivers ?? []) {
    if (!Number.isInteger(river.source) || river.source < 0 || river.source >= cells.r.length) continue;
    headCells.add(river.source);
    explicitRiverIds.add(river.i);
  }

  // Legacy fixtures and old saves can lack River.source. Fall back to each river's highest packed
  // cell, which is the same headwater convention used by river generation.
  const highestByRiver = new Map<number, number>();
  const cellIds = cells.i?.length ? cells.i : Array.from({ length: cells.r.length }, (_value, cell) => cell);
  for (const cell of cellIds) {
    const riverId = cells.r[cell];
    if (!riverId || explicitRiverIds.has(riverId)) continue;
    const current = highestByRiver.get(riverId);
    if (
      current === undefined ||
      (cells.h[cell] ?? 0) > (cells.h[current] ?? 0) ||
      ((cells.h[cell] ?? 0) === (cells.h[current] ?? 0) && cell < current)
    ) {
      highestByRiver.set(riverId, cell);
    }
  }
  for (const cell of highestByRiver.values()) headCells.add(cell);
  return headCells;
}

/**
 * Turn intersecting or close parallel drains into a tree of branch sewers and shared trunks.
 * Routes are considered in longest-first order so a short local branch joins the already drawn
 * downstream trunk instead of both routes running independently beside one another to a river.
 */
function consolidateNearbySewerRoutes(routes: InheritedSewerRoute[], cells: SewerCells): InheritedSewerRoute[] {
  if (!cells.p?.length || routes.length < 2) return routes;

  const network: InheritedSewerRoute[] = [];
  for (const route of [...routes].sort((a, b) => routeLength(b) - routeLength(a) || a.burgId - b.burgId)) {
    const join = network
      .filter(trunk => canShareDownstreamTrunk(route, trunk, cells))
      .map(trunk => ({ trunk, join: findSewerJoin(route, trunk) }))
      .filter((candidate): candidate is { trunk: InheritedSewerRoute; join: SewerJoin } => candidate.join !== undefined)
      .sort((a, b) => a.join.trunkT - b.join.trunkT || a.trunk.burgId - b.trunk.burgId)[0];

    if (join) {
      route.destination = join.join.point;
      route.joinsRouteId = join.trunk.id;
      // The branch drains through its trunk's actual outfall, so the rendered endpoint and
      // metadata both describe one shared discharge rather than two parallel discharges.
      route.outfallCell = join.trunk.outfallCell;
      route.outfallKind = join.trunk.outfallKind;
    }
    network.push(route);
  }
  return network.sort((a, b) => a.burgId - b.burgId);
}

function canShareDownstreamTrunk(route: InheritedSewerRoute, trunk: InheritedSewerRoute, cells: SewerCells): boolean {
  if (route.outfallKind !== trunk.outfallKind) return false;
  if (route.outfallKind === "river") return cells.r[route.outfallCell] === cells.r[trunk.outfallCell];
  // Coast outfalls do not carry a stable shoreline ID. Limit joining to nearby coastal discharge
  // points so two distant shores on the same island never become one artificial trunk.
  return pointDistance(route.destination, trunk.destination) <= SEWER_MERGE_DISTANCE * 3;
}

function findSewerJoin(route: InheritedSewerRoute, trunk: InheritedSewerRoute): SewerJoin | undefined {
  const intersection = segmentIntersection(route.source, route.destination, trunk.source, trunk.destination);
  if (intersection && isInterior(intersection.trunkT) && isInterior(intersection.routeT)) {
    return { point: pointAt(trunk.source, trunk.destination, intersection.trunkT), trunkT: intersection.trunkT };
  }

  // A source, midpoint, or discharge point running near a trunk joins it directly. The midpoint
  // case catches parallel routes whose endpoints are not themselves close to the other segment.
  const closest = [route.source, midpoint(route.source, route.destination), route.destination]
    .map(point => projectPointOnSegment(point, trunk.source, trunk.destination))
    .filter(
      projection =>
        isInterior(projection.t) && pointDistance(projection.point, projection.input) <= SEWER_MERGE_DISTANCE
    )
    .sort((a, b) => a.t - b.t)[0];
  if (closest) return { point: closest.point, trunkT: closest.t };

  // Fan-shaped branches aimed at the same river can still be close only near the outfall. Join
  // them at the earliest common downstream section, which removes the visibly parallel tails.
  for (const t of [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]) {
    const branchPoint = pointAt(route.source, route.destination, t);
    const trunkPoint = pointAt(trunk.source, trunk.destination, t);
    if (pointDistance(branchPoint, trunkPoint) <= SEWER_MERGE_DISTANCE) return { point: trunkPoint, trunkT: t };
  }
  return undefined;
}

function segmentIntersection(a: Point, b: Point, c: Point, d: Point): { routeT: number; trunkT: number } | undefined {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const cdx = d[0] - c[0];
  const cdy = d[1] - c[1];
  const denominator = abx * cdy - aby * cdx;
  if (Math.abs(denominator) < 0.0001) return undefined;
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const routeT = (acx * cdy - acy * cdx) / denominator;
  const trunkT = (acx * aby - acy * abx) / denominator;
  return routeT >= 0 && routeT <= 1 && trunkT >= 0 && trunkT <= 1 ? { routeT, trunkT } : undefined;
}

function projectPointOnSegment(input: Point, start: Point, end: Point): { input: Point; point: Point; t: number } {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((input[0] - start[0]) * dx + (input[1] - start[1]) * dy) / lengthSquared))
    : 0;
  return { input, point: pointAt(start, end, t), t };
}

function isInterior(t: number): boolean {
  return t > 0.04 && t < 0.96;
}

function midpoint(a: Point, b: Point): Point {
  return pointAt(a, b, 0.5);
}

function pointAt(start: Point, end: Point, t: number): Point {
  return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
}

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function routeLength(route: InheritedSewerRoute): number {
  return pointDistance(route.source, route.destination);
}

function nearestByDistance(candidates: Iterable<number>, burg: Burg, cells: SewerCells): number | undefined {
  return Array.from(candidates).sort(
    (a, b) => distanceToBurg(a, burg, cells) - distanceToBurg(b, burg, cells) || a - b
  )[0];
}

function distanceToBurg(cell: number, burg: Burg, cells: SewerCells): number {
  const point = cells.p?.[cell];
  if (!point) return Math.abs(cell - burg.cell);
  return Math.hypot(point[0] - burg.x, point[1] - burg.y);
}
