import type { WorldContext } from "../context/worldContext";
import { drawnFeatureShape, type FractalizedShape, sampleCoastlineShape } from "../renderers/coastline-fractal";

type Point = [number, number];

/** How far inland of the drawn shore a new harbour town's centre sits. The
 * City Editor window is ~1.5 km, so the shore must lie well inside it. */
export const PORT_SHORE_INLAND_METERS = 60;

function nearestOnPolyline(p: Point, line: Point[]): { point: Point; dist: number } {
  let best: Point = line[0];
  let bestDist = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
    const q: Point = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < bestDist) {
      bestDist = d;
      best = q;
    }
  }
  return { point: best, dist: bestDist };
}

function insideRing(p: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * `portCoastPlacement: "pinned"`: the port's shore edge is drawn unsimplified
 * and unfractalized (coastline-fractal `drawnFeatureShape`), so the drawn
 * B-spline passes through its midpoint. Sit the town a fixed distance inland
 * of that midpoint, toward the cell centre, which keeps it inside its cell.
 */
export function pinnedShorePortPosition(center: Point, edgeMidpoint: Point, metersPerMapUnit: number): Point {
  const dx = center[0] - edgeMidpoint[0],
    dy = center[1] - edgeMidpoint[1];
  const len = Math.hypot(dx, dy);
  const gap = Math.min(len / 2, PORT_SHORE_INLAND_METERS / metersPerMapUnit);
  if (!len) return [center[0], center[1]];
  const at: Point = [edgeMidpoint[0] + (dx / len) * gap, edgeMidpoint[1] + (dy / len) * gap];
  return [Math.round(at[0] * 1e4) / 1e4, Math.round(at[1] * 1e4) / 1e4];
}

/**
 * `portCoastPlacement: "drawn"`: place a harbour town a fixed number of metres
 * inland of the coast as the map draws it (simplified, fractalized, curved), near the cell's shared edge with
 * its haven. The legacy 95% slide toward the raw Voronoi edge leaves 5% of the
 * cell — 0.8–1.9 km on a 3.4 km-per-unit map (Senia: Kubutsk, Mopolch,
 * Sirdum) — between the town and the sea, so the City Editor window contained
 * no shore at all. The drawn coast can lie outside the town's own cell, so the
 * result may too. Returns null when no drawn shore is near the edge.
 */
export function drawnShorePortPosition(
  worldContext: Readonly<WorldContext>,
  cellId: number,
  haven: number,
  edgeMidpoint: Point,
  metersPerMapUnit: number,
  shapes: Map<number, FractalizedShape | null>
): Point | null {
  const { pack } = worldContext;
  const water = pack.features[pack.cells.f[haven]];
  if (!water) return null;
  const lake = water.type === "lake";
  // Lakes carry their own shore; the ocean coast is the land feature's outline.
  const feature = lake ? water : pack.features[pack.cells.f[cellId]];
  if (!feature?.vertices?.length) return null;
  if (!shapes.has(feature.i)) shapes.set(feature.i, drawnFeatureShape(worldContext, feature));
  const shape = shapes.get(feature.i);
  if (!shape) return null;

  const center = pack.cells.p[cellId] as Point;
  const reach = Math.hypot(edgeMidpoint[0] - center[0], edgeMidpoint[1] - center[1]) * 2 + 1;
  const ring = sampleCoastlineShape(shape, 1 / metersPerMapUnit, {
    minX: edgeMidpoint[0] - reach,
    maxX: edgeMidpoint[0] + reach,
    minY: edgeMidpoint[1] - reach,
    maxY: edgeMidpoint[1] + reach
  });
  if (ring.length < 3) return null;
  const shore = nearestOnPolyline(edgeMidpoint, [...ring, ring[0]]);
  if (shore.dist > reach) return null;

  const dx = center[0] - shore.point[0],
    dy = center[1] - shore.point[1];
  const len = Math.hypot(dx, dy);
  if (!len) return null;
  const onLand = (p: Point) => insideRing(p, ring) !== lake;
  // Step inland toward the cell centre; a fractal bay can need a longer step.
  for (const factor of [1, 2, 4]) {
    const gap = Math.min(len, (PORT_SHORE_INLAND_METERS * factor) / metersPerMapUnit);
    const at: Point = [shore.point[0] + (dx / len) * gap, shore.point[1] + (dy / len) * gap];
    if (onLand(at)) return [Math.round(at[0] * 1e4) / 1e4, Math.round(at[1] * 1e4) / 1e4];
  }
  return null;
}
