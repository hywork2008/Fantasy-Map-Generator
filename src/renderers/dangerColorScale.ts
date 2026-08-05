/**
 * Shared Magma intensity mapping for the Danger layer.
 *
 * SVG Smooth Contours use:
 *   d3.scaleSequential(d3.interpolateMagma).domain([0, maxValue * 1.5])
 * so the densest peaks land near Magma t ≈ 2/3 (deep red / coral), while outer
 * rings stay dark purple–gray. Pale yellow at Magma t=1 is never reached.
 *
 * Cell Heatmap (SVG choropleth + WebGL) previously used Magma((bucket+1)/10),
 * which put the strongest threats at t=1 (almost white-yellow) and made the
 * palette read as inverted relative to Contours. Both paths must use this helper.
 */

/** Magma t at the outer, lowest painted danger (dark purple / near-black). */
export const DANGER_MAGMA_EDGE_T = 0.08;

/**
 * Magma t at peak threat — matches contour domain stretch (max / (max * 1.5) = 2/3).
 * Deep red / coral, not pale yellow.
 */
export const DANGER_MAGMA_PEAK_T = 2 / 3;

/**
 * Map normalized danger intensity in [0, 1] to a Magma interpolator parameter
 * aligned with SVG Smooth Contours (edges purple-gray, center red).
 */
export function dangerIntensityToMagmaT(intensity01: number): number {
  const t = Number.isFinite(intensity01) ? Math.max(0, Math.min(1, intensity01)) : 0;
  return DANGER_MAGMA_EDGE_T + t * (DANGER_MAGMA_PEAK_T - DANGER_MAGMA_EDGE_T);
}

/**
 * Heat buckets used by choropleth / WebGL: 0 = weakest painted danger, 9 = strongest.
 * Maps onto the same Magma window as Contours.
 */
export function dangerBucketToMagmaT(bucket: number, bucketCount = 10): number {
  if (!(bucketCount > 0)) return DANGER_MAGMA_EDGE_T;
  // bucket 0 → weak (near edge), bucketCount-1 → peak red
  const intensity = (bucket + 1) / bucketCount;
  return dangerIntensityToMagmaT(intensity);
}
