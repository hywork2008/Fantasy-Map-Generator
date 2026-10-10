import type { WorldContext } from "../context/worldContext";
import { MIN_NAVIGABLE_FLUX } from "../generators/river-generator";
import { drawnFeatureShape, type FractalizedShape, sampleCoastlineShape } from "../renderers/coastline-fractal";
import type { Burg } from "../types/models";
import { PORT_SHORE_INLAND_METERS } from "./portShorePosition";
import { pointInWater, segmentsTouch } from "./riverPhysicalGeometry";

type Point = readonly [number, number];

/** Use topology, not a previously clipped CE window or a downstream ocean id. */
export function dualPortHaven(world: Readonly<WorldContext>, burg: Readonly<Burg>): number | null {
  const { cells, features } = world.pack;
  if (!burg.port || !cells.r?.[burg.cell] || !(cells.fl?.[burg.cell] >= MIN_NAVIGABLE_FLUX)) return null;
  const haven = cells.haven?.[burg.cell];
  return haven && features[cells.f[haven]]?.type === "ocean" ? haven : null;
}

function nearest(point: Point, ring: readonly Point[]): { point: Point; distance: number } {
  let best: Point = point,
    distance = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length)) : 0;
    const p: Point = [a[0] + dx * t, a[1] + dy * t];
    const d = Math.hypot(point[0] - p[0], point[1] - p[1]);
    if (d < distance) {
      best = p;
      distance = d;
    }
  }
  return { point: best, distance };
}

/** A local, metre-precision survey of the same coastline FMG draws. */
export function dualPortShore(
  world: Readonly<WorldContext>,
  burg: Readonly<Burg>,
  scale: number,
  radius: number,
  maxMove: number,
  shapes: Map<number, FractalizedShape | null>
) {
  if (dualPortHaven(world, burg) === null || !(scale > 0)) return null;
  const { pack } = world;
  const feature = pack.features[pack.cells.f[burg.cell]];
  if (!feature?.vertices?.length) return null;
  if (!shapes.has(feature.i)) shapes.set(feature.i, drawnFeatureShape(world, feature));
  const shape = shapes.get(feature.i);
  if (!shape) return null;
  const center = pack.cells.p[burg.cell] as Point;
  const reach = (maxMove + 2 * radius + 120) / scale;
  const ring = sampleCoastlineShape(shape, 1 / scale, {
    minX: center[0] - reach,
    maxX: center[0] + reach,
    minY: center[1] - reach,
    maxY: center[1] + reach
  }).map(p => [p[0] * scale, p[1] * scale] as Point);
  if (ring.length < 3) return null;
  // The town reservation must fit inland; allow a short frontage beyond it.
  const maxDistance = radius + 2 * PORT_SHORE_INLAND_METERS;
  return {
    ring,
    origin: nearest([center[0] * scale, center[1] * scale], ring).point,
    accepts(point: Point) {
      return nearest(point, ring).distance <= maxDistance;
    },
    supports(footprint: readonly Point[]) {
      if (!footprint.every(p => pointInWater(p, { id: feature.i, rings: [ring] }))) return false;
      return !footprint.some((p, j) =>
        ring.some((a, i) => segmentsTouch(p, footprint[(j + 1) % footprint.length], a, ring[(i + 1) % ring.length]))
      );
    }
  };
}
