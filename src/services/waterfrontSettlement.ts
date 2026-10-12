import type { WorldContext } from "../context/worldContext";
import { drawnFeatureShape, type FractalizedShape, sampleCoastlineShape } from "../renderers/coastline-fractal";
import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { rn } from "../utils";
import { burgLotOccupancy, occupancyRadiusMeters } from "../utils/cultureLotOccupancy";
import { PORT_SHORE_INLAND_METERS } from "./portShorePosition";

/** Dry strip FMG keeps between a river town's reservation and its bank. */
export const WATERFRONT_BANK_GAP_METERS = 20;
/** Quay strip allowed between a harbour town's edge and its drawn shore. A
 * river-mouth reservation is wholly dry, so its centre is at least one radius inland. */
export const WATERFRONT_SHORE_GAP_METERS = PORT_SHORE_INLAND_METERS;
/** Measurement slack for the waterfront check. */
const WATERFRONT_TOLERANCE_METERS = 1;

type Point = [number, number];

export interface WaterfrontIssue {
  kind: "shore-distance" | "shore-missing" | "bank-distance" | "river-unresolved";
  /** Metres beyond the allowed distance, for the distance kinds. */
  excessMeters?: number;
  reason?: string;
}

/** The town radius City Editor draws (Lot occupancy guide), from the burg's current population. */
export function burgCityRadiusMeters(
  pack: Pick<PackedGraph, "cultures" | "cells">,
  burg: Burg,
  populationRate: number,
  urbanization: number
): number {
  const population = rn((burg.population ?? 0) * populationRate * urbanization);
  return occupancyRadiusMeters(population, burgLotOccupancy(pack, burg), burg);
}

function insideRing(p: readonly number[], ring: readonly (readonly number[])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function cellContaining(pack: PackedGraph, x: number, y: number, hint: number): number | null {
  const polygon = (cell: number) => (pack.cells.v[cell] ?? []).map((v: number) => pack.vertices.p[v]);
  const queue = [hint, ...(pack.cells.c[hint] ?? [])];
  for (const cell of queue) if (insideRing([x, y], polygon(cell))) return cell;
  return null;
}

/**
 * Shrink a placed river reservation to the City Editor town radius, keeping the
 * same bank point and dry gap. The smaller square lies inside the surveyed one,
 * so terrain, slope, border and water checks still hold without a new search.
 */
export function settledRiverSite(
  pack: PackedGraph,
  burg: Readonly<Burg>,
  radiusMeters: number,
  metersPerMapUnit: number,
  /** Lower is better; picks where along the bank the smaller square sits (map units). */
  cost?: (x: number, y: number) => number
): Pick<Burg, "x" | "y" | "riverPlacement"> | null {
  const placement = burg.riverPlacement;
  const footprint = placement?.footprintMeters;
  const access = placement?.accessMeters;
  const accessFootprint = placement?.accessFootprintMeters;
  if (
    burg.riverSiteStatus?.status !== "placed" ||
    !placement ||
    footprint?.length !== 4 ||
    access?.length !== 2 ||
    accessFootprint?.length !== 4 ||
    placement.bankDistanceMeters === undefined ||
    !(metersPerMapUnit > 0)
  )
    return null;
  const [f0, f1, , f3] = footprint;
  const r = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]) / 2;
  const shift = r - radiusMeters;
  if (!(r > 0) || !(radiusMeters > 0) || shift < 0.5) return null;
  // footprint = point + along·u + normal·v, u,v ∈ [-r, r]; the bank lies at v = -(r + gap).
  const normal: Point = [(f3[0] - f0[0]) / (2 * r), (f3[1] - f0[1]) / (2 * r)];
  const along: Point = [(f1[0] - f0[0]) / (2 * r), (f1[1] - f0[1]) / (2 * r)];
  const s = radiusMeters;
  const centre = (u: number): Point => [
    burg.x * metersPerMapUnit - normal[0] * shift + along[0] * u,
    burg.y * metersPerMapUnit - normal[1] * shift + along[1] * u
  ];
  // Sliding along the bank stays inside the surveyed square, and within one
  // radius the original (tested) access path still meets the new square.
  let offset = 0;
  if (cost) {
    const reach = Math.min(shift, s);
    let best = Infinity;
    for (let k = -4; k <= 4; k++) {
      const u = (reach * k) / 4;
      const [cx, cy] = centre(u);
      const value = cost(cx / metersPerMapUnit, cy / metersPerMapUnit);
      if (value < best - 1e-9) [best, offset] = [value, u];
    }
  }
  const point = centre(offset);
  const accessStart = centre(0);
  const corner = (u: number, v: number): Point => [
    point[0] + along[0] * u + normal[0] * v,
    point[1] + along[1] * u + normal[1] * v
  ];
  const x = point[0] / metersPerMapUnit,
    y = point[1] / metersPerMapUnit;
  const physicalCellId =
    placement.physicalCellId === undefined ? undefined : cellContaining(pack, x, y, placement.physicalCellId);
  if (physicalCellId === null) return null;
  const nearer = (p: [number, number]): [number, number] => [p[0] - normal[0] * shift, p[1] - normal[1] * shift];
  return {
    x,
    y,
    riverPlacement: {
      ...placement,
      ...(physicalCellId === undefined ? {} : { physicalCellId }),
      bankDistanceMeters: placement.bankDistanceMeters - shift,
      footprintMeters: [corner(-s, -s), corner(s, -s), corner(s, s), corner(-s, s)],
      accessMeters: [accessStart, [access[1][0], access[1][1]]],
      accessFootprintMeters: [
        nearer(accessFootprint[0]),
        nearer(accessFootprint[1]),
        [accessFootprint[2][0], accessFootprint[2][1]],
        [accessFootprint[3][0], accessFootprint[3][1]]
      ]
    }
  };
}

/** Nearest point of the drawn sea or lake shore (the coast CE imports), in map units. */
export function drawnShoreNearBurg(
  world: Readonly<WorldContext>,
  burg: Readonly<Burg>,
  metersPerMapUnit: number,
  reachMeters: number,
  shapes: Map<number, FractalizedShape | null>
): {
  point: Point;
  distanceMeters: number;
  onLand: (p: readonly number[]) => boolean;
} | null {
  const { pack } = world;
  const haven = pack.cells.haven[burg.cell];
  if (!haven || !(metersPerMapUnit > 0)) return null;
  const water = pack.features[pack.cells.f[haven]];
  if (!water) return null;
  const lake = water.type === "lake";
  // Lakes carry their own shore; the ocean coast is the land feature's outline.
  const feature = lake ? water : pack.features[pack.cells.f[burg.cell]];
  if (!feature?.vertices?.length) return null;
  if (!shapes.has(feature.i)) shapes.set(feature.i, drawnFeatureShape(world, feature));
  const shape = shapes.get(feature.i);
  if (!shape) return null;
  const margin = reachMeters / metersPerMapUnit;
  const ring = sampleCoastlineShape(shape, 1 / metersPerMapUnit, {
    minX: burg.x - margin,
    maxX: burg.x + margin,
    minY: burg.y - margin,
    maxY: burg.y + margin
  });
  if (ring.length < 3) return null;
  let best: Point | null = null,
    bestDistance = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((burg.x - a[0]) * dx + (burg.y - a[1]) * dy) / length)) : 0;
    const q: Point = [a[0] + dx * t, a[1] + dy * t];
    const d = Math.hypot(burg.x - q[0], burg.y - q[1]);
    if (d < bestDistance) [best, bestDistance] = [q, d];
  }
  if (!best || bestDistance * metersPerMapUnit > reachMeters) return null;
  return {
    point: best,
    distanceMeters: bestDistance * metersPerMapUnit,
    onLand: p => insideRing(p, ring) !== lake
  };
}

/**
 * A sea or lake harbour town whose drawn shore lies beyond its City Editor
 * radius steps straight toward that shore, staying on its own land feature.
 */
export function settledShorePort(
  world: Readonly<WorldContext>,
  burg: Readonly<Burg>,
  radiusMeters: number,
  metersPerMapUnit: number,
  shapes: Map<number, FractalizedShape | null>
): Pick<Burg, "x" | "y"> | null {
  if (burg.riverPlacement || !(radiusMeters > 0)) return null;
  const shore = drawnShoreNearBurg(world, burg, metersPerMapUnit, radiusMeters * 6, shapes);
  if (!shore || shore.distanceMeters <= radiusMeters) return null;
  const inland = radiusMeters - Math.min(20, radiusMeters / 4);
  const k = inland / shore.distanceMeters;
  const x = shore.point[0] + (burg.x - shore.point[0]) * k,
    y = shore.point[1] + (burg.y - shore.point[1]) * k;
  if (!shore.onLand([x, y])) return null;
  const { pack } = world;
  const cell = cellContaining(pack, x, y, burg.cell);
  if (cell === null || pack.cells.h[cell] < 20 || pack.cells.f[cell] !== pack.cells.f[burg.cell]) return null;
  if (pack.cells.state && pack.cells.state[cell] !== pack.cells.state[burg.cell]) return null;
  return { x: rn(x, 4), y: rn(y, 4) };
}

/**
 * Waterfront acceptance for a port: a sea/lake shore within the quay strip of
 * the town edge, and a placed river bank within the dry gap of the town edge. A failure is a
 * defect in FMG settlement, road or river placement, never something City
 * Editor should correct.
 */
export function waterfrontIssues(
  world: Readonly<WorldContext>,
  burg: Readonly<Burg>,
  radiusMeters: number,
  metersPerMapUnit: number,
  shapes: Map<number, FractalizedShape | null>
): WaterfrontIssue[] {
  const port = burg.waterAccess?.port;
  if (!burg.port || !port) return [];
  const issues: WaterfrontIssue[] = [];
  if (port.sea || port.lake) {
    const shore = drawnShoreNearBurg(world, burg, metersPerMapUnit, Math.max(radiusMeters * 6, 2000), shapes);
    if (!shore) issues.push({ kind: "shore-missing" });
    else if (shore.distanceMeters - radiusMeters > WATERFRONT_SHORE_GAP_METERS + WATERFRONT_TOLERANCE_METERS)
      issues.push({
        kind: "shore-distance",
        excessMeters: rn(shore.distanceMeters - radiusMeters - WATERFRONT_SHORE_GAP_METERS)
      });
  }
  if (port.river) {
    const status = burg.riverSiteStatus;
    const bank = burg.riverPlacement?.bankDistanceMeters;
    if (status?.status !== "placed" || bank === undefined)
      issues.push({
        kind: "river-unresolved",
        reason: status?.reason ?? "unplaced"
      });
    else if (bank - radiusMeters > WATERFRONT_BANK_GAP_METERS + WATERFRONT_TOLERANCE_METERS)
      issues.push({
        kind: "bank-distance",
        excessMeters: rn(bank - radiusMeters - WATERFRONT_BANK_GAP_METERS)
      });
  }
  return issues;
}

export function describeWaterfrontIssue(issue: WaterfrontIssue): string {
  switch (issue.kind) {
    case "shore-distance":
      return `shore ${issue.excessMeters} m beyond the town edge`;
    case "shore-missing":
      return "no drawn shore near the harbour";
    case "bank-distance":
      return `river bank ${issue.excessMeters} m beyond the town edge`;
    case "river-unresolved":
      return `river site unresolved (${issue.reason})`;
  }
}
