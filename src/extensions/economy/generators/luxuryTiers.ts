/**
 * Price tiers of consumer luxury demand (docs/plan/luxury-value-demand.md §3.1). A good serves
 * luxury demand when its catalogue `demandCoverage.luxury` is positive; its tier follows its
 * base value so the split stays stable while market prices move.
 */
import type { Good } from "./goodsGeneratorTypes";

export const LUXURY_TIERS = ["common", "fine", "precious"] as const;
export type LuxuryTier = (typeof LUXURY_TIERS)[number];

/** Base value from which a luxury good is `fine`. */
export const LUXURY_FINE_MIN_VALUE = 10;
/** Base value from which a luxury good is `precious`. */
export const LUXURY_PRECIOUS_MIN_VALUE = 20;

export function isLuxuryDemandGood(good: Pick<Good, "demandCoverage">): boolean {
  return (good.demandCoverage?.luxury ?? 0) > 0;
}

export function luxuryTierOf(good: Pick<Good, "value">): LuxuryTier {
  if (good.value >= LUXURY_PRECIOUS_MIN_VALUE) return "precious";
  if (good.value >= LUXURY_FINE_MIN_VALUE) return "fine";
  return "common";
}
