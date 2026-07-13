export interface NightscapePopulationGlow {
  /** Relative brightness from a barely visible settlement (0) to a star-like city (1). */
  intensity: number;
  /** A small fixed range used to batch halo point sizes and emissive materials. */
  level: number;
}

export const NIGHTSCAPE_GLOW_LEVELS = 5;

/**
 * Compresses city populations logarithmically so every settlement remains visible while the
 * largest city still reads as a bright landmark. The result is intentionally relative to the
 * currently rendered map, rather than depending on a world-size-specific population threshold.
 */
export function getNightscapePopulationGlow(
  population: number | undefined,
  largestPopulation: number
): NightscapePopulationGlow {
  const safePopulation = Math.max(1, Number.isFinite(population) ? (population ?? 1) : 1);
  const safeLargestPopulation = Math.max(1, largestPopulation);
  const normalized = Math.min(1, Math.log1p(safePopulation) / Math.log1p(safeLargestPopulation));
  const intensity = 0.06 + 0.94 * normalized ** 1.55;
  const level = Math.min(NIGHTSCAPE_GLOW_LEVELS - 1, Math.floor(intensity * NIGHTSCAPE_GLOW_LEVELS));

  return { intensity, level };
}
