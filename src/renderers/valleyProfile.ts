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

/**
 * Measured valley sizes of one landscape (docs/analytics/japan-valley-profiles-20261117.md,
 * docs/analytics/alps-valley-profiles-20261118.md).
 */
export interface ValleyProfileTables {
  /** Medians by depth: floor-to-ridge distance and floor width (km). */
  depth: readonly { depthM: number; ridgeKm: number; floorKm: number }[];
  /** Median depth by floor elevation, the lower bound when the cells have no relief. */
  floorElevation: readonly { elevM: number; depthM: number }[];
  /** Left/right ridge ratio (p50) by depth. */
  sideRatio: readonly { depthM: number; ratio: number }[];
  /** Whether narrow gorges are common enough to draw (`tuning.gorge` still has to allow them). */
  gorges: boolean;
  /** How far across the river the relief is read on a real DEM, km. */
  probeKm: number;
}

/** Japan: measured medians by depth: floor-to-ridge distance and floor width (km). */
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
/** Share of the depth the lower side's relief must reach for a gorge. */
const GORGE_SIDE_SHARE = 0.5;
/** Measured left/right ridge ratio (p50) by depth; shallow valleys are capped at 1.6. */
const SIDE_RATIO_TABLE: readonly { depthM: number; ratio: number }[] = [
  { depthM: 100, ratio: 1.6 },
  { depthM: 225, ratio: 1.57 },
  { depthM: 450, ratio: 1.34 },
  { depthM: 800, ratio: 1.23 }
];
export const JAPAN_VALLEY_TABLES: ValleyProfileTables = {
  depth: DEPTH_TABLE,
  floorElevation: FLOOR_ELEVATION_DEPTH,
  sideRatio: SIDE_RATIO_TABLE,
  gorges: true,
  probeKm: 4
};

/**
 * Alps (Natural Earth rivers on Terrarium z10, ±10 km): glacial troughs are wider and deeper than
 * Japanese valleys, the floor is flatter and wider, and narrow gorges are rare (3.5 % of the
 * sections 300 m deep or more). The wall shape itself is close to the Japanese one.
 */
export const ALPINE_VALLEY_TABLES: ValleyProfileTables = {
  depth: [
    { depthM: 25, ridgeKm: 6.75, floorKm: 0.5 },
    { depthM: 100, ridgeKm: 6.94, floorKm: 1.38 },
    { depthM: 225, ridgeKm: 6.81, floorKm: 1.38 },
    { depthM: 450, ridgeKm: 6.88, floorKm: 1.38 },
    { depthM: 800, ridgeKm: 6.94, floorKm: 1.75 },
    { depthM: 1200, ridgeKm: 7.25, floorKm: 1.88 }
  ],
  // The measured depth by floor elevation (28 / 170 / 773 / 1,209 m) comes from the high troughs;
  // as a lower bound it flattened foothill plateaus (A5), so the floor keeps the Japanese bound and
  // Alpine depth comes from the relief around the river.
  floorElevation: FLOOR_ELEVATION_DEPTH,
  sideRatio: [
    { depthM: 100, ratio: 1.6 },
    { depthM: 225, ratio: 1.54 },
    { depthM: 450, ratio: 1.53 },
    { depthM: 800, ratio: 1.39 },
    { depthM: 1200, ratio: 1.19 }
  ],
  gorges: false,
  probeKm: 7
};

/** Tributary notches: spacing along the river and how far they widen the wall. */
const SPUR_SPACING_M = [1000, 2000] as const;
const SPUR_WIDEN = [0.25, 0.6] as const;
const SPUR_HALF_LENGTH_M = [200, 400] as const;
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
  /** Wall width on each side (left/right of the downstream direction); `wallM` is the wider. */
  wallLeftM: number;
  wallRightM: number;
}

/** Valley size at one river point. */
export function valleyDimensions(
  site: ValleySiteInput,
  tuning: ValleyTuning = DEFAULT_VALLEY_TUNING,
  tables: ValleyProfileTables = JAPAN_VALLEY_TABLES
): ValleyDimensions {
  const relief = Math.max(0, Math.max(site.reliefLeftM, site.reliefRightM)) * tuning.reliefShare;
  const floorGuess = Math.max(0, site.groundM - relief);
  const minDepth = lerpTable(
    tables.floorElevation,
    r => r.elevM,
    r => r.depthM,
    floorGuess
  );
  let depthM = Math.min(tuning.maxDepthM, Math.max(relief, minDepth));
  depthM = Math.max(0, Math.min(depthM, site.groundM - MIN_FLOOR_M));
  // Gorge: deep, and walled on both sides (the lower side still carries most of the depth).
  const lowSide = Math.min(site.reliefLeftM, site.reliefRightM) * tuning.reliefShare;
  const gorge = tuning.gorge && tables.gorges && depthM >= GORGE_MIN_DEPTH_M && lowSide >= depthM * GORGE_SIDE_SHARE;
  const ridgeKm = gorge
    ? GORGE_RIDGE_KM
    : lerpTable(
        tables.depth,
        r => r.depthM,
        r => r.ridgeKm,
        depthM
      );
  const floorKm = lerpTable(
    tables.depth,
    r => r.depthM,
    r => r.floorKm,
    depthM
  );
  const floorHalfM = Math.max(site.riverWidthM / 2, (floorKm * 1000) / 2);
  const wallM = ridgeKm * 1000 * tuning.widthScale;
  // Left/right difference: the side with less relief reaches its (lower) ridge sooner.
  let wallLeftM = wallM;
  let wallRightM = wallM;
  if (tuning.spurs) {
    const high = Math.max(site.reliefLeftM, site.reliefRightM);
    const low = Math.min(site.reliefLeftM, site.reliefRightM);
    const cap = lerpTable(
      tables.sideRatio,
      r => r.depthM,
      r => r.ratio,
      depthM
    );
    const ratio = Math.min(cap, low > 1 ? high / low : cap);
    if (site.reliefLeftM < site.reliefRightM) wallLeftM = wallM / ratio;
    else if (site.reliefRightM < site.reliefLeftM) wallRightM = wallM / ratio;
  }
  return { depthM, wallM, floorHalfM, gorge, wallLeftM, wallRightM };
}

/** Height at distance `distM` from the river, given the original ground and the river floor. */
export function valleyHeightAt(
  groundM: number,
  floorM: number,
  distM: number,
  dims: ValleyDimensions,
  wallM = dims.wallM
): number {
  if (groundM <= floorM) return groundM;
  const t = wallM > 0 ? (distM - dims.floorHalfM) / wallM : distM > dims.floorHalfM ? 1 : 0;
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
  tuning: ValleyTuning = DEFAULT_VALLEY_TUNING,
  tables: ValleyProfileTables = JAPAN_VALLEY_TABLES
): ValleyField {
  const dims = rivers.map(river => river.map(p => valleyDimensions(p, tuning, tables)));
  const floors = rivers.map((river, r) => {
    let min = Infinity;
    return river.map((p, i) => {
      min = Math.min(min, p.groundM - dims[r][i].depthM);
      return min;
    });
  });
  const widenMax = tuning.spurs ? 1 + SPUR_WIDEN[1] : 1;
  let maxReachM = 0;
  for (const list of dims) for (const d of list) maxReachM = Math.max(maxReachM, d.floorHalfM + d.wallM * widenMax);
  // Arc length from the source, and tributary notches placed along it from a per-river seed.
  const arc = rivers.map(river => {
    const out = [0];
    for (let i = 1; i < river.length; i++)
      out.push(out[i - 1] + Math.hypot(river[i].x - river[i - 1].x, river[i].y - river[i - 1].y));
    return out;
  });
  const notches = rivers.map((river, r) => {
    if (!tuning.spurs || !river.length) return [];
    const random = mulberry32((Math.round(river[0].x) * 73856093) ^ (Math.round(river[0].y) * 19349663));
    const lerp = (range: readonly [number, number]) => range[0] + (range[1] - range[0]) * random();
    const total = arc[r][arc[r].length - 1];
    const list: { s: number; side: 1 | -1; widen: number; half: number }[] = [];
    for (let s = lerp(SPUR_SPACING_M) / 2; s < total; s += lerp(SPUR_SPACING_M))
      list.push({ s, side: random() < 0.5 ? 1 : -1, widen: lerp(SPUR_WIDEN), half: lerp(SPUR_HALF_LENGTH_M) });
    return list;
  });
  const widenAt = (r: number, s: number, side: number) => {
    const list = notches[r];
    // Notches are in arc order: start at the first one that can still reach `s`.
    let lo = 0;
    let hi = list.length;
    const from = s - 3 * SPUR_HALF_LENGTH_M[1];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].s < from) lo = mid + 1;
      else hi = mid;
    }
    let widen = 0;
    for (let k = lo; k < list.length; k++) {
      const n = list[k];
      const u = (s - n.s) / n.half;
      if (u < -3) break;
      if (n.side !== side || u > 3) continue;
      widen = Math.max(widen, n.widen * Math.exp(-u * u));
    }
    return 1 + widen;
  };

  const cell = Math.max(1, maxReachM);
  const grid = new Map<number, Segment[]>();
  const key = (gx: number, gy: number) => gx * 1_000_003 + gy;
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
    gorge: t < 0.5 ? a.gorge : b.gorge,
    wallLeftM: a.wallLeftM + (b.wallLeftM - a.wallLeftM) * t,
    wallRightM: a.wallRightM + (b.wallRightM - a.wallRightM) * t
  });

  function valleyMetersAt(x: number, y: number): number {
    return carve(x, y, groundAt(x, y));
  }

  function carve(x: number, y: number, ground: number): number {
    if (maxReachM <= 0 || x < reach.minX || x > reach.maxX || y < reach.minY || y > reach.maxY) return ground;
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
          if (dist >= maxReachM) continue;
          const d = mix(dims[seg.river][seg.i], dims[seg.river][seg.i + 1], t);
          // Left of the downstream direction is a positive cross product.
          const side = vx * (y - a.y) - vy * (x - a.x) >= 0 ? 1 : -1;
          let wall = side > 0 ? d.wallLeftM : d.wallRightM;
          if (tuning.spurs) {
            const s = arc[seg.river][seg.i] + Math.sqrt(len2) * t;
            wall *= widenAt(seg.river, s, side);
          }
          if (dist >= d.floorHalfM + wall) continue;
          const f = floors[seg.river];
          const floor = f[seg.i] + (f[seg.i + 1] - f[seg.i]) * t;
          height = Math.min(height, valleyHeightAt(ground, floor, dist, d, wall));
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
    if (river.length >= 2 && river[0].groundM < river[river.length - 1].groundM) {
      river.reverse();
      // Left and right are relative to the downstream direction.
      for (const p of river) [p.reliefLeftM, p.reliefRightM] = [p.reliefRightM, p.reliefLeftM];
    }
    if (river.length >= 2) out.push(river);
  }
  return out;
}

/** Small seeded generator so notches stay put between redraws. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
