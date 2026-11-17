/**
 * Valleys carved along FMG rivers (docs/plan/fmg-cell-valleys.md, V0).
 *
 * Instead of moving a river into the real valley, the valley is cut around the river: every
 * point within `floorHalf + wallWidth` of a river is lowered towards the river's floor along a
 * measured cross-section (docs/analytics/japan-valley-profiles-20261117.md). Ground outside the
 * valley is untouched. Pure functions only; wiring into the war window is V1.
 */

export interface ValleyTuning {
  /** false keeps the legacy narrow carve (callers check this; the functions here ignore it). */
  enabled: boolean;
  /** Share of the surrounding cell relief turned into valley depth. */
  reliefShare: number;
  /** Multiplies the measured wall width. Smaller looks more like a gorge. */
  widthScale: number;
  /** Allow gorge dimensions and the gorge wall curve. */
  gorge: boolean;
  /** Tributary notches and left/right ridge differences (V3; not applied yet). */
  spurs: boolean;
  /** Deepest valley in meters. */
  maxDepthM: number;
}

export const DEFAULT_VALLEY_TUNING: ValleyTuning = {
  enabled: true,
  reliefShare: 0.6,
  widthScale: 1,
  gorge: true,
  spurs: true,
  maxDepthM: 800
};

/** Height above the floor / depth at 0, 0.1, ..., 1 of the wall (median of 50–600 m valleys). */
export const VALLEY_WALL_CURVE: readonly number[] = [0, 0.11, 0.21, 0.29, 0.36, 0.46, 0.52, 0.62, 0.73, 0.88, 1];
/** Gorges (depth >= 300 m, half-depth width <= 1.5 km): steep beside the floor. */
export const GORGE_WALL_CURVE: readonly number[] = [0, 0.13, 0.3, 0.38, 0.45, 0.54, 0.6, 0.7, 0.8, 0.92, 1];

/** Measured medians by depth: floor-to-ridge distance and floor width (km). */
const DEPTH_TABLE: readonly { depthM: number; ridgeKm: number; floorKm: number }[] = [
  { depthM: 25, ridgeKm: 3.1, floorKm: 0.38 },
  { depthM: 100, ridgeKm: 3.2, floorKm: 0.5 },
  { depthM: 225, ridgeKm: 3.4, floorKm: 0.5 },
  { depthM: 450, ridgeKm: 3.6, floorKm: 0.63 },
  { depthM: 800, ridgeKm: 4.0, floorKm: 0.75 },
  { depthM: 1200, ridgeKm: 4.8, floorKm: 1.0 }
];
/** Median depth by floor elevation, used as the lower bound when the cells have no relief. */
const FLOOR_ELEVATION_DEPTH: readonly { elevM: number; depthM: number }[] = [
  { elevM: 100, depthM: 71 },
  { elevM: 350, depthM: 146 },
  { elevM: 750, depthM: 190 },
  { elevM: 1250, depthM: 256 }
];
const GORGE_MIN_DEPTH_M = 300;
const GORGE_RIDGE_KM = 2.7;
/** Keep the floor above sea level: land below 0 m is out of scope. */
const MIN_FLOOR_M = 1;

function lerpTable<T>(table: readonly T[], key: (row: T) => number, value: (row: T) => number, x: number): number {
  if (x <= key(table[0])) return value(table[0]);
  for (let i = 1; i < table.length; i++) {
    const k1 = key(table[i]);
    if (x <= k1) {
      const k0 = key(table[i - 1]);
      const t = (x - k0) / (k1 - k0);
      return value(table[i - 1]) + (value(table[i]) - value(table[i - 1])) * t;
    }
  }
  return value(table[table.length - 1]);
}

/** Wall height fraction at `t` (0 = floor edge, 1 = ridge), clamped. */
export function valleyWallFraction(t: number, gorge: boolean): number {
  const curve = gorge ? GORGE_WALL_CURVE : VALLEY_WALL_CURVE;
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  const s = t * 10;
  const i = Math.floor(s);
  return curve[i] + (curve[i + 1] - curve[i]) * (s - i);
}

export interface ValleySiteInput {
  /** Ground height at the river point (DEM or bilinear cells), meters. */
  groundM: number;
  /** Highest cell height minus the river cell height on each side, meters. */
  reliefLeftM: number;
  reliefRightM: number;
  /** Full river width, meters. */
  riverWidthM: number;
}

export interface ValleyDimensions {
  depthM: number;
  /** Wall width W from the floor edge to the ridge, meters. */
  wallM: number;
  /** Floor half-width F, meters. */
  floorHalfM: number;
  gorge: boolean;
}

/** Valley size at one river point. */
export function valleyDimensions(
  site: ValleySiteInput,
  tuning: ValleyTuning = DEFAULT_VALLEY_TUNING
): ValleyDimensions {
  const relief = Math.max(0, Math.max(site.reliefLeftM, site.reliefRightM)) * tuning.reliefShare;
  const floorGuess = Math.max(0, site.groundM - relief);
  const minDepth = lerpTable(
    FLOOR_ELEVATION_DEPTH,
    r => r.elevM,
    r => r.depthM,
    floorGuess
  );
  let depthM = Math.min(tuning.maxDepthM, Math.max(relief, minDepth));
  depthM = Math.max(0, Math.min(depthM, site.groundM - MIN_FLOOR_M));
  const gorge =
    tuning.gorge &&
    depthM >= GORGE_MIN_DEPTH_M &&
    Math.min(site.reliefLeftM, site.reliefRightM) * tuning.reliefShare >= GORGE_MIN_DEPTH_M;
  const ridgeKm = gorge
    ? GORGE_RIDGE_KM
    : lerpTable(
        DEPTH_TABLE,
        r => r.depthM,
        r => r.ridgeKm,
        depthM
      );
  const floorKm = lerpTable(
    DEPTH_TABLE,
    r => r.depthM,
    r => r.floorKm,
    depthM
  );
  const floorHalfM = Math.max(site.riverWidthM / 2, (floorKm * 1000) / 2);
  return { depthM, wallM: ridgeKm * 1000 * tuning.widthScale, floorHalfM, gorge };
}

/** Height at distance `distM` from the river, given the original ground and the river floor. */
export function valleyHeightAt(groundM: number, floorM: number, distM: number, dims: ValleyDimensions): number {
  if (groundM <= floorM) return groundM;
  const t = dims.wallM > 0 ? (distM - dims.floorHalfM) / dims.wallM : distM > dims.floorHalfM ? 1 : 0;
  return floorM + (groundM - floorM) * valleyWallFraction(t, dims.gorge);
}

export interface ValleyRiverPoint extends ValleySiteInput {
  /** Position in meters, ordered from source to mouth. */
  x: number;
  y: number;
}

export interface ValleyField {
  /** Height after carving; `groundAt(x, y)` where no valley reaches. */
  valleyMetersAt(x: number, y: number): number;
  /** Carves a ground height read elsewhere (another level of detail) at the same point. */
  carve(x: number, y: number, groundM: number): number;
  /** Bounding box of everything a valley reaches, meters. Empty when there are no rivers. */
  reach: { minX: number; minY: number; maxX: number; maxY: number };
  /** Floor height per river point (non-increasing downstream). */
  floors: number[][];
  /** Valley size per river point. */
  dimensions: ValleyDimensions[][];
  /** Widest reach `floorHalf + wall` of any river point, meters. */
  maxReachM: number;
}

interface Segment {
  river: number;
  i: number;
}

/**
 * Builds the valley height function for a set of rivers (coordinates in meters).
 * `groundAt` is the original ground (DEM or bilinear cells).
 */
export function createValleyField(
  rivers: readonly (readonly ValleyRiverPoint[])[],
  groundAt: (x: number, y: number) => number,
  tuning: ValleyTuning = DEFAULT_VALLEY_TUNING
): ValleyField {
  const dims = rivers.map(river => river.map(p => valleyDimensions(p, tuning)));
  const floors = rivers.map((river, r) => {
    let min = Infinity;
    return river.map((p, i) => {
      min = Math.min(min, p.groundM - dims[r][i].depthM);
      return min;
    });
  });
  let maxReachM = 0;
  for (const list of dims) for (const d of list) maxReachM = Math.max(maxReachM, d.floorHalfM + d.wallM);

  const cell = Math.max(1, maxReachM);
  const grid = new Map<string, Segment[]>();
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  rivers.forEach((river, r) => {
    for (let i = 0; i + 1 < river.length; i++) {
      const a = river[i];
      const b = river[i + 1];
      const x0 = Math.floor(Math.min(a.x, b.x) / cell);
      const x1 = Math.floor(Math.max(a.x, b.x) / cell);
      const y0 = Math.floor(Math.min(a.y, b.y) / cell);
      const y1 = Math.floor(Math.max(a.y, b.y) / cell);
      for (let gx = x0; gx <= x1; gx++)
        for (let gy = y0; gy <= y1; gy++) {
          const k = key(gx, gy);
          const list = grid.get(k);
          if (list) list.push({ river: r, i });
          else grid.set(k, [{ river: r, i }]);
        }
    }
  });

  const mix = (a: ValleyDimensions, b: ValleyDimensions, t: number): ValleyDimensions => ({
    depthM: a.depthM + (b.depthM - a.depthM) * t,
    wallM: a.wallM + (b.wallM - a.wallM) * t,
    floorHalfM: a.floorHalfM + (b.floorHalfM - a.floorHalfM) * t,
    gorge: t < 0.5 ? a.gorge : b.gorge
  });

  function valleyMetersAt(x: number, y: number): number {
    return carve(x, y, groundAt(x, y));
  }

  function carve(x: number, y: number, ground: number): number {
    if (maxReachM <= 0) return ground;
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    let height = ground;
    // A segment listed in two buckets is tested twice; min() makes that harmless.
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const list = grid.get(key(gx + dx, gy + dy));
        if (!list) continue;
        for (const seg of list) {
          const river = rivers[seg.river];
          const a = river[seg.i];
          const b = river[seg.i + 1];
          const vx = b.x - a.x;
          const vy = b.y - a.y;
          const len2 = vx * vx + vy * vy;
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / len2)) : 0;
          const dist = Math.hypot(x - (a.x + vx * t), y - (a.y + vy * t));
          const d = mix(dims[seg.river][seg.i], dims[seg.river][seg.i + 1], t);
          if (dist >= d.floorHalfM + d.wallM) continue;
          const f = floors[seg.river];
          const floor = f[seg.i] + (f[seg.i + 1] - f[seg.i]) * t;
          height = Math.min(height, valleyHeightAt(ground, floor, dist, d));
        }
      }
    return height;
  }

  const reach = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const river of rivers)
    for (const p of river) {
      reach.minX = Math.min(reach.minX, p.x - maxReachM);
      reach.minY = Math.min(reach.minY, p.y - maxReachM);
      reach.maxX = Math.max(reach.maxX, p.x + maxReachM);
      reach.maxY = Math.max(reach.maxY, p.y + maxReachM);
    }
  return { valleyMetersAt, carve, reach, floors, dimensions: dims, maxReachM };
}

export interface ValleyPath {
  /** Points in meters. */
  points: ReadonlyArray<readonly number[]>;
  /** Full river width per point, meters. */
  widths?: readonly number[];
}

/**
 * Resamples river paths every `stepM` and measures the relief on each side: the highest ground
 * within `probeM` across the river minus the ground at the river. Each river is ordered from its
 * higher end to its lower end.
 */
export function sampleValleyRivers(
  paths: readonly ValleyPath[],
  groundAt: (x: number, y: number) => number,
  options: { stepM: number; probeM: number; probes?: number }
): ValleyRiverPoint[][] {
  const step = Math.max(1, options.stepM);
  const probes = Math.max(1, options.probes ?? 4);
  const out: ValleyRiverPoint[][] = [];
  for (const path of paths) {
    const line: { x: number; y: number; w: number }[] = [];
    for (let i = 0; i + 1 < path.points.length; i++) {
      const [ax, ay] = path.points[i];
      const [bx, by] = path.points[i + 1];
      const wa = path.widths?.[i] ?? 0;
      const wb = path.widths?.[i + 1] ?? wa;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
      for (let k = 0; k < n; k++)
        line.push({ x: ax + ((bx - ax) * k) / n, y: ay + ((by - ay) * k) / n, w: wa + ((wb - wa) * k) / n });
    }
    const last = path.points[path.points.length - 1];
    if (!last || line.length < 1) continue;
    line.push({ x: last[0], y: last[1], w: path.widths?.[path.points.length - 1] ?? 0 });
    const river = line.map((p, i) => {
      const a = line[Math.max(0, i - 1)];
      const b = line[Math.min(line.length - 1, i + 1)];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / length;
      const ny = (b.x - a.x) / length;
      const groundM = groundAt(p.x, p.y);
      let left = groundM;
      let right = groundM;
      for (let k = 1; k <= probes; k++) {
        const d = (options.probeM * k) / probes;
        left = Math.max(left, groundAt(p.x + nx * d, p.y + ny * d));
        right = Math.max(right, groundAt(p.x - nx * d, p.y - ny * d));
      }
      return { x: p.x, y: p.y, groundM, reliefLeftM: left - groundM, reliefRightM: right - groundM, riverWidthM: p.w };
    });
    if (river.length >= 2 && river[0].groundM < river[river.length - 1].groundM) river.reverse();
    if (river.length >= 2) out.push(river);
  }
  return out;
}
