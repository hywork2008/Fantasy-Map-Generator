import type { Id, Point } from "../types/primitives";
import type { TerrainCircle, TerrainFeature, TerrainPlatform, TerrainRingCut } from "../types/terrain";

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
}

export type ResolvedTerrainPlatform = Omit<TerrainPlatform, "summit"> & {
  summit: ({ kind: "circle" } & TerrainCircle) | TerrainOutline;
};
export type ResolvedTerrainFeature = ResolvedTerrainPlatform | TerrainRingCut;

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Replaces cell-shaped summits by their outline. Fort features, being analytic, need no resolver. */
export function resolveTerrainFeatures(
  features: readonly TerrainFeature[],
  outline?: (faceIds: readonly Id[]) => OutlineSegment[]
): ResolvedTerrainFeature[] {
  return features.flatMap((feature): ResolvedTerrainFeature[] => {
    if (feature.kind !== "platform" || feature.summit.kind !== "faces") return [feature as ResolvedTerrainFeature];
    const segments = outline?.(feature.summit.faceIds) ?? [];
    if (!segments.length) return [];
    const xs = segments.flatMap(s => [s.a[0], s.b[0]]),
      ys = segments.flatMap(s => [s.a[1], s.b[1]]);
    return [
      {
        ...feature,
        summit: {
          kind: "outline",
          faceIds: new Set(feature.summit.faceIds),
          segments,
          bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
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

/** Even-odd test over the outline; it encloses holes and separate islands alike. */
function insideOutline(point: Point, outline: TerrainOutline): boolean {
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
  const d = Math.min(...summit.segments.map(segment => segmentDistance(point, segment)));
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
      Math.min(...feature.summit.segments.map(segment => segmentDistance(point, segment))) < CLIFF_BAND_METERS - 1e-6
  );
}

/** Points near which render meshes are subdivided to follow curved earthworks. */
export function terrainFeatureFoci(features: readonly ResolvedTerrainFeature[]): Point[] {
  return features.flatMap(feature =>
    feature.kind === "platform" && feature.summit.kind === "circle" ? [feature.summit.center] : []
  );
}
