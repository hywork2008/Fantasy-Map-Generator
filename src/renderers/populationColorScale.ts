/**
 * Shared Population-layer color metrics for SVG choropleth and WebGL hybrid.
 *
 * - `capacity`: color by rural occupancy (pop / capacity). Near-full cells are darkest
 *   regardless of absolute population relative to other cells.
 * - `relativeDensity`: legacy scale — color by density relative to the densest cell on the map.
 *
 * Bucket contract (must stay compatible with `getIsolines`):
 * - `0` = no heat (falsy — skipped by getIsolines, so ocean/empty are never outlined as a type)
 * - `1`–`10` = heat bands (never return `-1`; that value is truthy and would build a mega-region
 *   over water + empty land, which breaks SVG choropleth fills)
 */

export type PopulationColorScale = "capacity" | "relativeDensity";

/** Heat intensity band for the Population cell heatmap: 0 = none, 1–10 = lightest→darkest. */
export type PopulationHeatBucket = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface PopulationColorInputs {
  cellIds: ArrayLike<number>;
  /** Rural population points per cell (same units as capacity). */
  pop: ArrayLike<number>;
  area: ArrayLike<number>;
  /** Rural carrying capacity points; optional for maps missing the column. */
  capacity?: ArrayLike<number> | null;
  /** Cell height; water (h &lt; 20) never receives a heat bucket. */
  height?: ArrayLike<number> | null;
  burgs: ReadonlyArray<{ i?: number; removed?: boolean; cell?: number; population?: number }>;
  populationRate: number;
  urbanization: number;
  colorScale: PopulationColorScale;
  isInScope: (cellId: number) => boolean;
}

export interface PopulationColorMetrics {
  /** Rural + urban population in people units (for unsettled / sparse checks). */
  totalPop: Float32Array;
  /**
   * Heatmap bucket 1–10, or 0 when the cell should not receive a filled heat color.
   * Safe to pass directly into `getIsolines` (0 is falsy and skipped).
   */
  getBucket: (cellId: number) => PopulationHeatBucket;
}

/** Map a 0–1 ratio onto heat bands 1–10 (0%+ → 1, ≥100% → 10). */
export function ratioToHeatBucket(ratio: number): PopulationHeatBucket {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return 0;
  // floor(ratio * 10) is 0..9 for ratio in (0, 1), 10+ when ratio ≥ 1; shift to 1..10.
  return Math.min(10, Math.floor(ratio * 10) + 1) as PopulationHeatBucket;
}

/** d3 / deck.gl sequential domain fraction for a heat bucket (1–10 → 0.1–1.0). */
export function heatBucketToColorT(bucket: number): number {
  if (bucket <= 0) return 0;
  return Math.min(1, bucket / 10);
}

/**
 * Build per-cell totals and a bucket function for the Population heatmap.
 */
export function buildPopulationColorMetrics(input: PopulationColorInputs): PopulationColorMetrics {
  const { cellIds, pop, area, capacity, height, burgs, populationRate, urbanization, colorScale, isInScope } = input;
  const n = cellIds.length;
  // Index by cell id (cells.i is dense 0..n-1 on pack graphs).
  const totalPop = new Float32Array(n);

  for (let idx = 0; idx < n; idx++) {
    const i = cellIds[idx] as number;
    if (!isInScope(i)) continue;
    totalPop[i] = (pop[i] as number) * populationRate;
  }

  for (const b of burgs) {
    if (!b.i || b.removed || b.cell === undefined || !isInScope(b.cell)) continue;
    const uPop = (b.population ?? 0) * populationRate * urbanization;
    if (b.cell < totalPop.length) totalPop[b.cell] += uPop;
  }

  const isLand = (cellId: number): boolean => {
    if (height == null) return true;
    return (height[cellId] as number) >= 20;
  };

  if (colorScale === "capacity") {
    return {
      totalPop,
      getBucket: (cellId: number): PopulationHeatBucket => {
        if (!isInScope(cellId) || !isLand(cellId)) return 0;
        const rural = pop[cellId] as number;
        if (!(rural > 0)) return 0;
        const cap = capacity?.[cellId] as number | undefined;
        if (cap === undefined || cap === null || !(cap > 0)) {
          // Populated land with no usable capacity: treat as saturated so it stays visible.
          return 10;
        }
        return ratioToHeatBucket(rural / cap);
      }
    };
  }

  // relativeDensity (legacy): log-scale density vs map-wide maximum.
  const densities = new Float32Array(n);
  let maxDensity = 0;

  for (let idx = 0; idx < n; idx++) {
    const i = cellIds[idx] as number;
    if (!isInScope(i) || !isLand(i)) continue;
    const cellArea = area[i] as number;
    if (cellArea > 0) {
      const density = totalPop[i] / cellArea;
      densities[i] = density;
      if (density > maxDensity) maxDensity = density;
    }
  }

  return {
    totalPop,
    getBucket: (cellId: number): PopulationHeatBucket => {
      if (!isInScope(cellId) || !isLand(cellId)) return 0;
      const density = densities[cellId];
      if (!(density >= 1)) return 0;
      if (maxDensity <= 1) return 1;
      const ratio = Math.log(density) / Math.log(maxDensity);
      return ratioToHeatBucket(ratio);
    }
  };
}
