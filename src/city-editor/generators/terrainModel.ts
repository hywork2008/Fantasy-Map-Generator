import type { Point } from "../types/primitives";
import type { TerrainCircle, TerrainFeature } from "../types/terrain";

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Outer radius of a platform, including its slope, where cuts are suppressed. */
function platformFootprint(feature: Extract<TerrainFeature, { kind: "platform" }>): number {
  return feature.summit.radiusMeters + (feature.edge.kind === "slope" ? feature.edge.runMeters : 0);
}

/** Absolute height at a point: raise by platforms, then excavate outside every platform footprint. */
export function evaluateTerrainFeatures(
  features: readonly TerrainFeature[],
  baseAt: (point: Point) => number,
  point: Point
): number {
  const base = baseAt(point);
  let level = base,
    dry = false;
  for (const feature of features) {
    if (feature.kind !== "platform") continue;
    const d = distance(point, feature.summit.center),
      r = feature.summit.radiusMeters;
    if (feature.edge.kind === "slope" && feature.edge.runMeters > 0) {
      const slope = clamp01((r + feature.edge.runMeters - d) / feature.edge.runMeters);
      level = Math.max(level, base + slope * (feature.levelMeters - base));
    } else if (d <= r) level = Math.max(level, feature.levelMeters);
    if (d <= platformFootprint(feature)) dry = true;
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
export function terrainFeatureBreaklines(features: readonly TerrainFeature[]): TerrainCircle[] {
  return features.flatMap(feature => {
    if (feature.kind === "platform")
      return feature.edge.kind === "slope"
        ? [feature.summit, { center: feature.summit.center, radiusMeters: platformFootprint(feature) }]
        : [feature.summit];
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

/** Points near which render meshes are subdivided to follow curved earthworks. */
export function terrainFeatureFoci(features: readonly TerrainFeature[]): Point[] {
  return features.flatMap(feature => (feature.kind === "platform" ? [feature.summit.center] : []));
}
