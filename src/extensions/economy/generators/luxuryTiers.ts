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

/**
 * Luxury coverage for goods the catalogue leaves without one. Jewelry has no `demandCoverage`, so
 * the unit-count demand never bought it; the value demand counts it as a precious good. Kept out of
 * the catalogue so the unit-count path (luxuryValueDemand off) stays exactly as before.
 */
const LUXURY_COVERAGE_FALLBACK: Readonly<Record<string, number>> = { Jewelry: 1 };

export function luxuryCoverageOf(good: Pick<Good, "name" | "demandCoverage">): number {
  return good.demandCoverage?.luxury ?? LUXURY_COVERAGE_FALLBACK[good.name] ?? 0;
}

export function isLuxuryDemandGood(good: Pick<Good, "name" | "demandCoverage">): boolean {
  return luxuryCoverageOf(good) > 0;
}

export function luxuryTierOf(good: Pick<Good, "value">): LuxuryTier {
  if (good.value >= LUXURY_PRECIOUS_MIN_VALUE) return "precious";
  if (good.value >= LUXURY_FINE_MIN_VALUE) return "fine";
  return "common";
}

const HIGH_VALUE_CARGO_TAGS: ReadonlySet<string> = new Set(["luxury", "art", "gift", "ritual"]);

/**
 * Cargo a great house carried across a month or more of road and sea: luxuries, art, gifts and
 * ritual goods, or a fine or precious good of the luxury demand
 * (docs/plan/long-distance-merchant-reach-capital.md §4.2).
 */
export function isHighValueTradeGood(good: Pick<Good, "name" | "demandCoverage" | "value" | "tags">): boolean {
  if (good.tags?.some(tag => HIGH_VALUE_CARGO_TAGS.has(tag))) return true;
  return isLuxuryDemandGood(good) && luxuryTierOf(good) !== "common";
}
