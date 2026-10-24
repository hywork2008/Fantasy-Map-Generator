/** Render quality tiers for detailed 3D models; a model may ship only some of them. */
export const MODEL_QUALITIES = ["low", "standard", "high"] as const;
export type ModelQuality = (typeof MODEL_QUALITIES)[number];

/**
 * The tier a model renders at: the requested one if it exists, otherwise the next lower tier,
 * and the lowest available tier when nothing at or below the request exists.
 */
export function resolveModelQuality<T extends ModelQuality>(requested: ModelQuality, available: readonly T[]): T {
  for (let i = MODEL_QUALITIES.indexOf(requested); i >= 0; i--) {
    const tier = MODEL_QUALITIES[i] as T;
    if (available.includes(tier)) return tier;
  }
  const lowest = MODEL_QUALITIES.find(tier => available.includes(tier as T));
  if (!lowest) throw new Error("A model must offer at least one quality tier");
  return lowest as T;
}
