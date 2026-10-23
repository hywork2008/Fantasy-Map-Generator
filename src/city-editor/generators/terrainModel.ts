import type { Id, Point } from "../types/primitives";
import type { TerrainCircle, TerrainFeature, TerrainPlatform, TerrainRamp, TerrainRingCut } from "../types/terrain";

/** Horizontal width of a cliff face, inside the platform, so heights stay single-valued. */
export const CLIFF_BAND_METERS = 0.25;

/** One edge of a cell-shaped platform, with the unit normal pointing into the platform. */
export interface OutlineSegment {
  a: Point;
  b: Point;
  inward: Point;
}

/** A cell-shaped summit resolved against the mesh; faceIds tell seed triangles which side they are on. */
export interface TerrainOutline {
  kind: "outline";
  faceIds: ReadonlySet<Id>;
  segments: OutlineSegment[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Segments by grid cell, each entered in every cell within `reach` of it, for nearby-edge queries. */
  bins: Map<string, OutlineSegment[]>;
  reach: number;
  /** Face lookup: membership of the containing cell, or null on a cell edge or corner no cell claims. */
  contains?: (point: Point) => boolean | null;
}

const OUTLINE_BIN_METERS = 8;
const outlineBin = (x: number, y: number) => `${x},${y}`;

export type ResolvedTerrainPlatform = Omit<TerrainPlatform, "summit"> & {
  summit: ({ kind: "circle" } & TerrainCircle) | TerrainOutline;
};
export type ResolvedTerrainFeature = ResolvedTerrainPlatform | TerrainRingCut;

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Replaces cell-shaped summits by their outline. Fort features, being analytic, need no resolver. */
export function resolveTerrainFeatures(
  features: readonly TerrainFeature[],
  outline?: (faceIds: readonly Id[]) => OutlineSegment[],
  locate?: (point: Point) => Id | null
): ResolvedTerrainFeature[] {
  return features.flatMap((feature): ResolvedTerrainFeature[] => {
    if (feature.kind !== "platform" || feature.summit.kind !== "faces") return [feature as ResolvedTerrainFeature];
    const segments = outline?.(feature.summit.faceIds) ?? [];
    if (!segments.length) return [];
    const xs = segments.flatMap(s => [s.a[0], s.b[0]]),
      ys = segments.flatMap(s => [s.a[1], s.b[1]]);
    const reach = Math.max(CLIFF_BAND_METERS, feature.edge.kind === "slope" ? feature.edge.runMeters : 0) + 0.01;
    const bins = new Map<string, OutlineSegment[]>();
    for (const segment of segments)
      for (
        let x = Math.floor((Math.min(segment.a[0], segment.b[0]) - reach) / OUTLINE_BIN_METERS);
        x <= Math.floor((Math.max(segment.a[0], segment.b[0]) + reach) / OUTLINE_BIN_METERS);
        x++
      )
        for (
          let y = Math.floor((Math.min(segment.a[1], segment.b[1]) - reach) / OUTLINE_BIN_METERS);
          y <= Math.floor((Math.max(segment.a[1], segment.b[1]) + reach) / OUTLINE_BIN_METERS);
          y++
        ) {
          const id = outlineBin(x, y);
          const list = bins.get(id);
          if (list) list.push(segment);
          else bins.set(id, [segment]);
        }
    const faceIds = new Set(feature.summit.faceIds);
    return [
      {
        ...feature,
        summit: {
          kind: "outline",
          faceIds,
          segments,
          bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
          bins,
          reach,
          ...(locate
            ? {
                contains: (point: Point) => {
                  const id = locate(point);
                  return id === null ? null : faceIds.has(id);
                }
              }
            : {})
        }
      }
    ];
  });
}

function segmentDistance(point: Point, segment: OutlineSegment): number {
  const { a, b } = segment;
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? clamp01(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq) : 0;
  return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t);
}

/** Distance to the nearest outline edge, or Infinity beyond the outline's reach. */
function edgeDistance(outline: TerrainOutline, point: Point): number {
  let best = Number.POSITIVE_INFINITY;
  for (const segment of outline.bins.get(
    outlineBin(Math.floor(point[0] / OUTLINE_BIN_METERS), Math.floor(point[1] / OUTLINE_BIN_METERS))
  ) ?? [])
    best = Math.min(best, segmentDistance(point, segment));
  return best <= outline.reach ? best : Number.POSITIVE_INFINITY;
}

/** Even-odd test over the outline; it encloses holes and separate islands alike. */
function insideOutline(point: Point, outline: TerrainOutline): boolean {
  const located = outline.contains?.(point);
  if (located !== undefined && located !== null) return located;
  let inside = false;
  for (const { a, b } of outline.segments)
    if (a[1] > point[1] !== b[1] > point[1] && point[0] < a[0] + ((point[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
      inside = !inside;
  return inside;
}

/** Outer reach of a platform beyond its summit edge, where it still shapes the ground. */
function platformReach(feature: ResolvedTerrainPlatform): number {
  return feature.edge.kind === "slope" ? feature.edge.runMeters : 0;
}

/** Platform height at a point, or null where the platform does not reach. */
function platformLevel(feature: ResolvedTerrainPlatform, base: number, point: Point): number | null {
  const reach = platformReach(feature);
  const summit = feature.summit;
  if (summit.kind === "circle") {
    const d = distance(point, summit.center),
      r = summit.radiusMeters;
    if (feature.edge.kind === "slope" && reach > 0) {
      if (d > r + reach) return null;
      return base + clamp01((r + reach - d) / reach) * (feature.levelMeters - base);
    }
    return d <= r ? feature.levelMeters : null;
  }
  const { bounds } = summit;
  if (
    point[0] < bounds.minX - reach ||
    point[0] > bounds.maxX + reach ||
    point[1] < bounds.minY - reach ||
    point[1] > bounds.maxY + reach
  )
    return null;
  const d = edgeDistance(summit, point);
  if (insideOutline(point, summit))
    return feature.edge.kind === "cliff"
      ? base + clamp01(d / CLIFF_BAND_METERS) * (feature.levelMeters - base)
      : feature.levelMeters;
  if (reach <= 0 || d > reach) return null;
  return base + (1 - d / reach) * (feature.levelMeters - base);
}

/** Absolute height at a point: raise by platforms, then excavate outside every platform footprint. */
export function evaluateTerrainFeatures(
  features: readonly ResolvedTerrainFeature[],
  baseAt: (point: Point) => number,
  point: Point
): number {
  const base = baseAt(point);
  let level = base,
    dry = false;
  for (const feature of features) {
    if (feature.kind !== "platform") continue;
    const raised = platformLevel(feature, base, point);
    if (raised === null) continue;
    level = Math.max(level, raised);
    dry = true;
  }
  if (dry) return level;
  for (const feature of features) {
    if (feature.kind !== "ringCut") continue;
    const t = Math.abs(distance(point, feature.axis.center) - feature.axis.radiusMeters) / (feature.widthMeters / 2);
    const cut = feature.depthMeters * clamp01((1 - t) / feature.bankFraction);
    level = Math.min(level, feature.rimElevationMeters - cut);
  }
  return level;
}

/** Circles along which the terrain surface creases; render meshes split triangles on them. */
export function terrainFeatureBreaklines(features: readonly ResolvedTerrainFeature[]): TerrainCircle[] {
  return features.flatMap(feature => {
    if (feature.kind === "platform") {
      const summit = feature.summit;
      if (summit.kind !== "circle") return [];
      return feature.edge.kind === "slope"
        ? [summit, { center: summit.center, radiusMeters: summit.radiusMeters + feature.edge.runMeters }]
        : [summit];
    }
    const half = feature.widthMeters / 2,
      bank = half * (1 - feature.bankFraction);
    const offsets = [-half, -bank, bank, half];
    if (feature.waterElevationMeters !== undefined) {
      const waterDepth = Math.max(
        0,
        Math.min(feature.depthMeters, feature.waterElevationMeters - feature.rimElevationMeters + feature.depthMeters)
      );
      const waterHalf = half * (1 - feature.bankFraction * (1 - waterDepth / feature.depthMeters));
      offsets.push(-waterHalf, waterHalf);
    }
    return offsets.map(offset => ({ center: feature.axis.center, radiusMeters: feature.axis.radiusMeters + offset }));
  });
}

/** Lines parallel to cell-shaped platform edges: the cliff top inside, or the slope foot outside. */
export function terrainFeatureCreases(
  features: readonly ResolvedTerrainFeature[]
): Array<{ segment: OutlineSegment; offsetMeters: number }> {
  return features.flatMap(feature =>
    feature.kind === "platform" && feature.summit.kind === "outline"
      ? feature.summit.segments.map(segment => ({
          segment,
          offsetMeters: feature.edge.kind === "cliff" ? CLIFF_BAND_METERS : -feature.edge.runMeters
        }))
      : []
  );
}

/** True inside the cliff face band of a cell-shaped, cliff-edged platform. */
export function onTerrainEscarpment(features: readonly ResolvedTerrainFeature[], faceId: Id, point: Point): boolean {
  return features.some(
    feature =>
      feature.kind === "platform" &&
      feature.edge.kind === "cliff" &&
      feature.summit.kind === "outline" &&
      feature.summit.faceIds.has(faceId) &&
      edgeDistance(feature.summit, point) < CLIFF_BAND_METERS - 1e-6
  );
}

/** Points near which render meshes are subdivided to follow curved earthworks. */
export function terrainFeatureFoci(features: readonly ResolvedTerrainFeature[]): Point[] {
  return features.flatMap(feature =>
    feature.kind === "platform" && feature.summit.kind === "circle" ? [feature.summit.center] : []
  );
}

/**
 * The level a point stands on, as far as cliffs separate levels: a cliff-edged cell platform's id on its summit,
 * `"cliff"` on its cliff face, and null on the ground they rise from. Slopes join their levels and are not split;
 * only a road marked as connecting levels (a castle ramp) may pass between them.
 */
export function terrainLevelAt(features: readonly ResolvedTerrainFeature[], point: Point): string | null {
  for (const feature of features) {
    // Terrace walls do not separate levels: streets are graded or stepped across them.
    if (
      feature.kind !== "platform" ||
      feature.role === "terrace" ||
      feature.edge.kind !== "cliff" ||
      feature.summit.kind !== "outline"
    )
      continue;
    const { bounds } = feature.summit;
    if (point[0] < bounds.minX || point[0] > bounds.maxX || point[1] < bounds.minY || point[1] > bounds.maxY) continue;
    const d = edgeDistance(feature.summit, point);
    if (d < CLIFF_BAND_METERS) return "cliff";
    if (insideOutline(point, feature.summit)) return feature.id;
  }
  return null;
}

/** True on the flat summit of a castle platform, where graded roads keep its level instead of cutting it. */
export function onPlatformSummit(features: readonly ResolvedTerrainFeature[], point: Point): boolean {
  return features.some(feature => {
    // A street keeps climbing over a terrace; only a platform that roads may not cross holds them level.
    if (feature.kind !== "platform" || feature.role === "terrace") return false;
    const summit = feature.summit;
    if (summit.kind === "circle") return distance(point, summit.center) <= summit.radiusMeters;
    const { bounds } = summit;
    if (point[0] < bounds.minX || point[0] > bounds.maxX || point[1] < bounds.minY || point[1] > bounds.maxY)
      return false;
    if (!insideOutline(point, summit)) return false;
    return feature.edge.kind !== "cliff" || edgeDistance(summit, point) >= CLIFF_BAND_METERS;
  });
}

/** The ramp whose deck covers a point, and the deck's absolute level there. */
function rampAt(
  ramps: readonly TerrainRamp[],
  point: Point
): { ramp: TerrainRamp; levelMeters: number; offset: number } | null {
  let best: { ramp: TerrainRamp; levelMeters: number; offset: number } | null = null;
  for (const ramp of ramps) {
    const half = ramp.widthMeters / 2;
    for (let i = 1; i < ramp.centerline.length; i++) {
      const a = ramp.centerline[i - 1],
        b = ramp.centerline[i];
      if (
        point[0] < Math.min(a[0], b[0]) - half ||
        point[0] > Math.max(a[0], b[0]) + half ||
        point[1] < Math.min(a[1], b[1]) - half ||
        point[1] > Math.max(a[1], b[1]) + half
      )
        continue;
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq ? clamp01(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq) : 0;
      const offset = Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t);
      if (offset > half || (best && best.offset <= offset)) continue;
      const levelMeters = ramp.elevationsMeters[i - 1] + (ramp.elevationsMeters[i] - ramp.elevationsMeters[i - 1]) * t;
      best = { ramp, levelMeters, offset };
    }
  }
  return best;
}

/** Absolute deck level of the ramp under a point, or null off every ramp. */
export function rampDeckAt(ramps: readonly TerrainRamp[], point: Point): number | null {
  return rampAt(ramps, point)?.levelMeters ?? null;
}

function segmentGap(a: Point, b: Point, c: Point, d: Point): number {
  const cross = (o: Point, p: Point, q: Point) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a),
    d2 = cross(c, d, b),
    d3 = cross(a, b, c),
    d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  const toSegment = (p: Point, s: Point, e: Point) => segmentDistance(p, { a: s, b: e, inward: [0, 0] });
  return Math.min(toSegment(a, c, d), toSegment(b, c, d), toSegment(c, a, b), toSegment(d, a, b));
}

/** True when a ring touches a ramp's deck, so a building or field there would stand in the ramp. */
export function overlapsRamp(ring: readonly Point[], ramps: readonly TerrainRamp[]): boolean {
  if (ring.length < 3) return false;
  for (const ramp of ramps) {
    const half = ramp.widthMeters / 2;
    for (let i = 1; i < ramp.centerline.length; i++) {
      const a = ramp.centerline[i - 1],
        b = ramp.centerline[i];
      for (let k = 0; k < ring.length; k++)
        if (segmentGap(a, b, ring[k], ring[(k + 1) % ring.length]) < half) return true;
      if (pointInRing(a, ring)) return true;
    }
  }
  return false;
}

function pointInRing(point: Point, ring: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (a[1] > point[1] !== b[1] > point[1] && point[0] < a[0] + ((point[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
      inside = !inside;
  }
  return inside;
}
