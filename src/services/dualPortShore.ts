import type { WorldContext } from "../context/worldContext";
import { MIN_NAVIGABLE_FLUX } from "../generators/river-generator";
import type { Burg } from "../types/models";
import { drawnFeatureShape, type FractalizedShape, sampleCoastlineShape } from "../utils/coastlineFractal";
import { PORT_SHORE_INLAND_METERS } from "./portShorePosition";
import { pointInWater, segmentsTouch } from "./riverPhysicalGeometry";

type Point = readonly [number, number];

/** Spatial bucket for the river-mouth search; a mouth farther than this from the coast is not one. */
const MOUTH_BUCKET_METERS = 500;

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
    const d = Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dy * t));
    if (d < distance) {
      best = [a[0] + dx * t, a[1] + dy * t];
      distance = d;
    }
  }
  return { point: best, distance };
}

const BUCKET_Y_STRIDE = 1 << 20;
const bucketKey = (x: number, y: number) => x * BUCKET_Y_STRIDE + y;

/**
 * Ring edges bucketed for range queries. With `reach`, buckets are 2*reach wide and a long
 * edge is registered only where it passes (samples every `reach`), not across its whole
 * bounding box. A query then checks its own bucket +-1: every edge point within `reach`
 * of it lies within 1.5*reach of a sample, i.e. under one bucket away. Without `reach`
 * the full bounding box is filled (exact for any query distance up to `size`).
 */
function ringEdgeBuckets(ring: readonly Point[], size: number, sampled = false): Map<number, number[]> {
  const buckets = new Map<number, number[]>();
  const add = (x: number, y: number, i: number) => {
    const key = bucketKey(x, y);
    const list = buckets.get(key);
    if (list) {
      if (list[list.length - 1] !== i) list.push(i);
    } else buckets.set(key, [i]);
  };
  const step = size / 2;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const x0 = Math.floor(Math.min(a[0], b[0]) / size),
      x1 = Math.floor(Math.max(a[0], b[0]) / size);
    const y0 = Math.floor(Math.min(a[1], b[1]) / size),
      y1 = Math.floor(Math.max(a[1], b[1]) / size);
    if (sampled && (x1 - x0 + 1) * (y1 - y0 + 1) > 4) {
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
      for (let k = 0; k <= n; k++)
        add(
          Math.floor((a[0] + ((b[0] - a[0]) * k) / n) / size),
          Math.floor((a[1] + ((b[1] - a[1]) * k) / n) / size),
          i
        );
      continue;
    }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) add(x, y, i);
  }
  return buckets;
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
  // The town reservation must fit inland; allow a short quay strip beyond it,
  // the same waterfront gap the port check accepts (waterfrontSettlement.ts).
  const maxDistance = radius + PORT_SHORE_INLAND_METERS;
  const nearSize = Math.max(2 * maxDistance, 1);
  const nearBuckets = ringEdgeBuckets(ring, nearSize, true);
  let mouthIndex: Map<number, number[]> | undefined;
  const mouthBuckets = () => (mouthIndex ??= ringEdgeBuckets(ring, MOUTH_BUCKET_METERS));
  const water = { id: feature.i, rings: [ring] };
  return {
    ring,
    origin: nearest([center[0] * scale, center[1] * scale], ring).point,
    /** Where the river meets this coast: its water vertex nearest the drawn
     * shore. A coarse cell's nearest coast point can lie kilometres from the
     * mouth, leaving the joint river/coast site outside the candidate budget. */
    mouth(rings: readonly (readonly Point[])[]): Point | null {
      const size = MOUTH_BUCKET_METERS;
      const buckets = mouthBuckets();
      let best: Point | null = null,
        bestDistance = size;
      for (const water of rings)
        for (const p of water) {
          const bx = Math.floor(p[0] / size),
            by = Math.floor(p[1] / size);
          for (let x = bx - 1; x <= bx + 1; x++)
            for (let y = by - 1; y <= by + 1; y++)
              for (const i of buckets.get(bucketKey(x, y)) ?? []) {
                const d = nearest(p, [ring[i], ring[(i + 1) % ring.length]]).distance;
                if (d < bestDistance) [best, bestDistance] = [p, d];
              }
        }
      return best;
    },
    /** Same as `nearest(point, ring).distance <= maxDistance`, scanning only the edges within reach. */
    accepts(point: Point) {
      const bx = Math.floor(point[0] / nearSize),
        by = Math.floor(point[1] / nearSize);
      const limit = maxDistance * maxDistance;
      for (let x = bx - 1; x <= bx + 1; x++)
        for (let y = by - 1; y <= by + 1; y++) {
          const list = nearBuckets.get(bucketKey(x, y));
          if (!list) continue;
          for (const i of list) {
            const a = ring[i],
              b = ring[(i + 1) % ring.length];
            const dx = b[0] - a[0],
              dy = b[1] - a[1];
            const length = dx * dx + dy * dy;
            const t = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length)) : 0;
            const ex = point[0] - (a[0] + dx * t),
              ey = point[1] - (a[1] + dy * t);
            if (ex * ex + ey * ey <= limit) return true;
          }
        }
      return false;
    },
    supports(footprint: readonly Point[]) {
      if (!footprint.every(p => pointInWater(p, water))) return false;
      return !footprint.some((p, j) => {
        const q = footprint[(j + 1) % footprint.length];
        const x0 = Math.floor(Math.min(p[0], q[0]) / nearSize) - 1,
          x1 = Math.floor(Math.max(p[0], q[0]) / nearSize) + 1;
        const y0 = Math.floor(Math.min(p[1], q[1]) / nearSize) - 1,
          y1 = Math.floor(Math.max(p[1], q[1]) / nearSize) + 1;
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++)
            for (const i of nearBuckets.get(bucketKey(x, y)) ?? [])
              if (segmentsTouch(p, q, ring[i], ring[(i + 1) % ring.length])) return true;
        return false;
      });
    }
  };
}
