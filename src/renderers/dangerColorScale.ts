/**
 * Shared Magma intensity mapping for the Danger layer.
 *
 * Two SVG modes:
 * - **Smooth Contours** — KDE density field. Neighboring cells *do* influence the
 *   painted value; color is not a 1:1 map of `cells.danger[i]`.
 * - **Cell Heatmap** — one polygon per cell, color from `cells.danger[i]` only
 *   (absolute 0–255 via dangerValueToMagmaT). Neighbors never influence the color.
 *
 * Magma window: edges purple-gray, peak deep red (not pale yellow at t=1).
 */

/** Magma t at the outer, lowest painted danger (dark purple / near-black). */
export const DANGER_MAGMA_EDGE_T = 0.08;

/**
 * Magma t at peak threat — deep red / coral, not pale yellow.
 * Matches the Contours visual peak (historically domain stretch ≈ 2/3).
 */
export const DANGER_MAGMA_PEAK_T = 2 / 3;

/** `pack.cells.danger` is a Uint8 field; full scale is 0–255. */
export const DANGER_VALUE_MAX = 255;

/** Discrete heat bands for Cell Heatmap path merging (0 = weakest painted, 9 = strongest). */
export const DANGER_HEAT_BUCKET_COUNT = 10;

/**
 * Map normalized danger intensity in [0, 1] to a Magma interpolator parameter
 * (edges purple-gray, center red).
 */
export function dangerIntensityToMagmaT(intensity01: number): number {
  const t = Number.isFinite(intensity01) ? Math.max(0, Math.min(1, intensity01)) : 0;
  return DANGER_MAGMA_EDGE_T + t * (DANGER_MAGMA_PEAK_T - DANGER_MAGMA_EDGE_T);
}

/**
 * Absolute cell danger → Magma t. Same danger number always paints the same color
 * (independent of other cells / map-wide max).
 */
export function dangerValueToMagmaT(danger: number): number {
  if (!(danger > 0) || !Number.isFinite(danger)) return DANGER_MAGMA_EDGE_T;
  return dangerIntensityToMagmaT(Math.min(1, danger / DANGER_VALUE_MAX));
}

/**
 * Absolute cell danger → discrete heat bucket for choropleth isolines.
 * Returns -1 when danger ≤ 0 (unpainted).
 *
 * Buckets partition 1…255 evenly so neighbors only share a color when their own
 * values fall in the same band — not because of spatial smoothing.
 */
export function dangerValueToBucket(danger: number, bucketCount: number = DANGER_HEAT_BUCKET_COUNT): number {
  if (!(danger > 0) || !Number.isFinite(danger) || !(bucketCount > 0)) return -1;
  const ratio = Math.min(1, danger / DANGER_VALUE_MAX);
  return Math.min(bucketCount - 1, Math.floor(ratio * bucketCount));
}

/**
 * Heat bucket 0…n-1 → Magma t (Cell Heatmap / WebGL path colors).
 */
export function dangerBucketToMagmaT(bucket: number, bucketCount: number = DANGER_HEAT_BUCKET_COUNT): number {
  if (!(bucketCount > 0)) return DANGER_MAGMA_EDGE_T;
  // Midpoint of the bucket band for a stable absolute color.
  const intensity = (bucket + 0.5) / bucketCount;
  return dangerIntensityToMagmaT(intensity);
}
