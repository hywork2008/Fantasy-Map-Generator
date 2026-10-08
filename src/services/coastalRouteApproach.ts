import type { WorldContext } from "../context/worldContext";
import { defaultCoastSettings, drawnFeatureShape, sampleCoastlineShape } from "../renderers/coastline-fractal";
import { useOptionsState } from "../store/optionsState";
import { mapUnitMeters } from "../utils/mapUnitMeters";

/**
 * A coastal burg can sit on the vertex where several coast cells meet (Chateia
 * Venta). A land route leaving it straight toward the next cell then runs over
 * the drawn sea, and CE — which reads the same geometry — cannot connect it.
 * Bend the first stretch inland by the smallest angle that keeps it on the
 * drawn land with a little clearance.
 */

/** Stretch of the leg checked and, if needed, replaced by a detour waypoint. */
const PROBE_METERS = 1500;
/** The town itself stands on the shore; clearance is only required beyond it. */
const SHORE_TOWN_METERS = 150;
const CLEARANCE_METERS = 60;
const SAMPLE_METERS = 25;
const ANGLE_STEP_DEG = 2.5;
const MAX_TURN_DEG = 90;

type Pt = [number, number];
interface Coast {
  ring: Pt[];
  near: [Pt, Pt][];
}

const cache = new WeakMap<object, Map<number, Coast | null>>();

/** Dependencies shared by route preparation and its sampled coast cache. */
export function coastalRouteGeometryKey(world: Readonly<WorldContext>): string {
  const { pack } = world;
  return JSON.stringify([
    world.seed,
    world.graphWidth,
    world.graphHeight,
    world.distanceScale,
    world.options.portCoastPlacement,
    defaultCoastSettings,
    pack.features?.map(f => f && [f.i, f.type, f.vertices]),
    pack.vertices?.p,
    pack.vertices?.c,
    pack.cells.v,
    pack.cells.f,
    pack.cells.t,
    pack.cells.burg,
    pack.cells.haven,
    pack.burgs?.map(b => b && [b.i, b.x, b.y, b.cell, b.port, b.removed])
  ]);
}

export function clearCoastalRouteGeometry(world: Readonly<WorldContext>): void {
  cache.delete(world.pack);
}

function coastNear(world: Readonly<WorldContext>, burgId: number, radius: number): Coast | null {
  const { pack } = world;
  let perPack = cache.get(pack);
  if (!perPack) {
    perPack = new Map();
    cache.set(pack, perPack);
  }
  if (perPack.has(burgId)) return perPack.get(burgId)!;
  const burg = pack.burgs[burgId];
  const featureId = pack.cells.f?.[burg.cell];
  const feature = featureId === undefined ? undefined : pack.features?.[featureId];
  let coast: Coast | null = null;
  if (feature && typeof feature === "object" && feature.vertices?.length) {
    const shape = drawnFeatureShape(world, feature);
    if (shape) {
      const r = radius * 1.5;
      const tolerance = radius / PROBE_METERS; // ≈ 1 m
      const ring = sampleCoastlineShape(shape, tolerance, {
        minX: burg.x - r,
        maxX: burg.x + r,
        minY: burg.y - r,
        maxY: burg.y + r
      });
      const near: [Pt, Pt][] = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        if (Math.max(a[0], b[0]) < burg.x - r || Math.min(a[0], b[0]) > burg.x + r) continue;
        if (Math.max(a[1], b[1]) < burg.y - r || Math.min(a[1], b[1]) > burg.y + r) continue;
        near.push([a, b]);
      }
      if (near.length) coast = { ring, near };
    }
  }
  perPack.set(burgId, coast);
  return coast;
}

function insideRing(ring: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToCoast(near: [Pt, Pt][], x: number, y: number): number {
  let best = Infinity;
  for (const [a, b] of near) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
  }
  return best;
}

/** True when the segment stays on drawn land (with clearance once past the town). */
function segmentClear(coast: Coast, from: Pt, to: Pt, startAt: number, origin: Pt, mpu: number): boolean {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(1, Math.ceil((length * mpu) / SAMPLE_METERS));
  for (let s = 0; s <= steps; s++) {
    const x = from[0] + ((to[0] - from[0]) * s) / steps;
    const y = from[1] + ((to[1] - from[1]) * s) / steps;
    const fromTown = Math.hypot(x - origin[0], y - origin[1]) * mpu;
    if (fromTown < startAt) continue;
    if (fromTown > PROBE_METERS * 1.5) break; // the drawn coast is only refined this far
    if (!insideRing(coast.ring, x, y)) return false;
    if (fromTown > SHORE_TOWN_METERS && distanceToCoast(coast.near, x, y) * mpu < CLEARANCE_METERS) return false;
  }
  return true;
}

/** Detour waypoint for the leg origin → next, or null when the straight leg is fine. */
function detour(coast: Coast, origin: Pt, next: Pt, mpu: number): Pt | null {
  const legLength = Math.hypot(next[0] - origin[0], next[1] - origin[1]);
  if (!legLength) return null;
  const probe = Math.min(PROBE_METERS / mpu, legLength / 2);
  const start = SAMPLE_METERS;
  const bearing = Math.atan2(next[1] - origin[1], next[0] - origin[0]);
  const ahead: Pt = [origin[0] + Math.cos(bearing) * probe, origin[1] + Math.sin(bearing) * probe];
  if (segmentClear(coast, origin, ahead, start, origin, mpu)) return null;
  for (let turn = ANGLE_STEP_DEG; turn <= MAX_TURN_DEG; turn += ANGLE_STEP_DEG) {
    for (const sign of [1, -1]) {
      const a = bearing + (sign * turn * Math.PI) / 180;
      const w: Pt = [origin[0] + Math.cos(a) * probe, origin[1] + Math.sin(a) * probe];
      if (segmentClear(coast, origin, w, start, origin, mpu) && segmentClear(coast, w, next, 0, origin, mpu)) return w;
    }
  }
  return null;
}

/**
 * Insert a detour waypoint after/before every coastal burg on a land route whose
 * straight leg would run over the drawn sea. Points keep their [x, y, cell] shape.
 */
export function bendRouteAwayFromCoast(world: Readonly<WorldContext>, points: number[][]): number[][] {
  const { pack } = world;
  if (!pack?.burgs?.length || !pack.features?.length || points.length < 2) return points;
  const mpu = mapUnitMeters(world.distanceScale, useOptionsState.getState().distanceUnit);
  if (!(mpu > 0)) return points;
  let out: number[][] | null = null;
  for (let i = points.length - 1; i >= 0; i--) {
    const cell = points[i][2];
    const burgId = cell === undefined ? 0 : pack.cells.burg?.[cell];
    const burg = burgId ? pack.burgs[burgId] : undefined;
    if (!burg || (pack.cells.t?.[cell] !== 1 && !burg.port)) continue;
    if (Math.hypot(points[i][0] - burg.x, points[i][1] - burg.y) > 1e-7) continue;
    const coast = coastNear(world, burgId, PROBE_METERS / mpu);
    if (!coast) continue;
    const origin: Pt = [burg.x, burg.y];
    // Outgoing first so the incoming insertion does not shift its index.
    for (const j of [i + 1, i - 1]) {
      const neighbour = points[j];
      if (!neighbour) continue;
      const w = detour(coast, origin, [neighbour[0], neighbour[1]], mpu);
      if (!w) continue;
      out ??= points.slice();
      out.splice(j > i ? i + 1 : i, 0, [w[0], w[1], cell]);
    }
  }
  return out ?? points;
}

/** Smallest rotation of the neighbour point about the town that keeps the leg on drawn land, inside its own cell. */
function relocatedNeighbour(
  coast: Coast,
  origin: Pt,
  neighbour: Pt,
  after: Pt | undefined,
  cellRing: Pt[],
  mpu: number
): Pt | null {
  const dx = neighbour[0] - origin[0],
    dy = neighbour[1] - origin[1];
  const distance = Math.hypot(dx, dy);
  if (!distance) return null;
  const clear = (p: Pt) =>
    insideRing(cellRing, p[0], p[1]) &&
    segmentClear(coast, origin, p, SAMPLE_METERS, origin, mpu) &&
    (!after || segmentClear(coast, p, after, 0, origin, mpu));
  if (segmentClear(coast, origin, neighbour, SAMPLE_METERS, origin, mpu)) return null;
  const bearing = Math.atan2(dy, dx);
  for (let turn = ANGLE_STEP_DEG; turn <= MAX_TURN_DEG; turn += ANGLE_STEP_DEG)
    for (const sign of [1, -1])
      for (const scale of [1, 0.75, 0.5]) {
        const a = bearing + (sign * turn * Math.PI) / 180;
        const p: Pt = [origin[0] + Math.cos(a) * distance * scale, origin[1] + Math.sin(a) * distance * scale];
        if (clear(p)) return p;
      }
  return null;
}

/**
 * Move the stored point that follows a coastal burg on a land route to where
 * the straight leg from the town stays on the drawn land (Ventiarisio: the leg
 * toward the next cell clipped the drawn bay, and CE pushed the far bank out to
 * carry the road). Unlike the render-time bend this changes the route data, so
 * the river-crossing convergence and the CE site descriptor see the same road.
 * The point stays in its cell, so the cell graph is unchanged.
 */
export function relocateCoastalRouteNeighbours(world: Readonly<WorldContext>, unit: string): boolean {
  const { pack } = world;
  if (!pack?.burgs?.length || !pack.features?.length || !pack.vertices?.p || !pack.cells.v?.length) return false;
  const mpu = mapUnitMeters(world.distanceScale, unit);
  if (!(mpu > 0)) return false;
  let changed = false;
  for (const route of pack.routes ?? []) {
    if (route.lock || route.group === "searoutes" || route.registeredConnectionId !== undefined) continue;
    const points = route.points;
    for (let i = 0; i < points.length; i++) {
      const cell = points[i][2];
      const burgId = pack.cells.burg?.[cell];
      const burg = burgId ? pack.burgs[burgId] : undefined;
      if (!burg || burg.removed || (pack.cells.t?.[cell] !== 1 && !burg.port)) continue;
      if (Math.hypot(points[i][0] - burg.x, points[i][1] - burg.y) > 1e-7) continue;
      const coast = coastNear(world, burgId, PROBE_METERS / mpu);
      if (!coast) continue;
      const origin: Pt = [burg.x, burg.y];
      for (const step of [1, -1]) {
        const j = i + step;
        const neighbour = points[j];
        if (!neighbour || neighbour[2] === cell || pack.cells.burg?.[neighbour[2]]) continue;
        const cellRing = (pack.cells.v[neighbour[2]] ?? []).map(v => pack.vertices.p[v] as Pt);
        if (cellRing.length < 3) continue;
        const after = points[j + step];
        const p = relocatedNeighbour(
          coast,
          origin,
          [neighbour[0], neighbour[1]],
          after && [after[0], after[1]],
          cellRing,
          mpu
        );
        if (!p) continue;
        points[j] = [p[0], p[1], neighbour[2]];
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Smallest distance in metres from the given map-unit points to the drawn sea
 * around a coastal burg; 0 when a point already stands on the drawn sea.
 * Infinity for a burg with no drawn coast nearby.
 */
export function drawnSeaClearanceMeters(
  world: Readonly<WorldContext>,
  burgId: number,
  unit: string,
  points: readonly (readonly [number, number])[]
): number {
  const mpu = mapUnitMeters(world.distanceScale, unit);
  if (!(mpu > 0)) return Infinity;
  const coast = coastNear(world, burgId, PROBE_METERS / mpu);
  if (!coast) return Infinity;
  let best = Infinity;
  for (const [x, y] of points) {
    if (!insideRing(coast.ring, x, y)) return 0;
    best = Math.min(best, distanceToCoast(coast.near, x, y) * mpu);
  }
  return best;
}
