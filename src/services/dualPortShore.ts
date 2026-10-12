import type { WorldContext } from "../context/worldContext";
import { MIN_NAVIGABLE_FLUX } from "../generators/river-generator";
import { drawnFeatureShape, type FractalizedShape, sampleCoastlineShape } from "../renderers/coastline-fractal";
import type { Burg } from "../types/models";
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

/** Ring edges bucketed by bounding box, so range queries skip the rest of a 1 m-sampled coastline. */
function ringEdgeBuckets(ring: readonly Point[], size: number): Map<number, number[]> {
  const buckets = new Map<number, number[]>();
  let lastList: number[] | undefined,
    lastX = 0,
    lastY = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const x0 = Math.floor(Math.min(a[0], b[0]) / size),
      x1 = Math.floor(Math.max(a[0], b[0]) / size);
    const y0 = Math.floor(Math.min(a[1], b[1]) / size),
      y1 = Math.floor(Math.max(a[1], b[1]) / size);
    // Consecutive 1 m edges almost always share a bucket; skip the map lookup.
    if (x0 === x1 && y0 === y1 && lastList && x0 === lastX && y0 === lastY) {
      lastList.push(i);
      continue;
    }
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const key = bucketKey(x, y);
        let list = buckets.get(key);
        if (list) list.push(i);
        else {
          list = [i];
          buckets.set(key, list);
        }
        if (x0 === x1 && y0 === y1) [lastList, lastX, lastY] = [list, x, y];
      }
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
  const nearSize = Math.max(maxDistance, 1);
  const nearBuckets = ringEdgeBuckets(ring, nearSize);
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
