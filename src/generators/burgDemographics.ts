import type { BurgDemographics } from "../types/models";
import { rn } from "../utils";

/**
 * Fractions of total population for age/sex buckets.
 * Shares for a given profile should sum to ~1.
 */
export interface DemographicShares {
  children: number;
  maleAdults: number;
  femaleAdults: number;
  elders: number;
}

/** Default medieval urban pyramid (~40% children, ~45% adults ~49:51 M:F, ~15% elders). */
export const DEFAULT_DEMOGRAPHIC_SHARES: DemographicShares = {
  children: 0.4,
  maleAdults: 0.2205,
  femaleAdults: 0.2295,
  elders: 0.15
};

/**
 * Rough group-based demographic profiles.
 *
 * Estimates are intentionally coarse medieval/fantasy heuristics:
 * - fort: pure garrison — no minors, ~8:2 male:female among adults
 * - monastery: lifelong residents, few novices, male-skewed monastics
 * - caravanserai / trading_post: more working-age men, fewer families
 * - village / hamlet: family-heavy rural settlement
 * - capital / city: slightly fewer children than the default town mix
 */
export const GROUP_DEMOGRAPHIC_SHARES: Record<string, DemographicShares> = {
  fort: {
    children: 0,
    // ~90% working-age garrison at 8:2 male:female; ~10% older veterans
    maleAdults: 0.72,
    femaleAdults: 0.18,
    elders: 0.1
  },
  monastery: {
    children: 0.05,
    maleAdults: 0.5,
    femaleAdults: 0.2,
    elders: 0.25
  },
  caravanserai: {
    children: 0.1,
    maleAdults: 0.55,
    femaleAdults: 0.25,
    elders: 0.1
  },
  trading_post: {
    children: 0.2,
    maleAdults: 0.4,
    femaleAdults: 0.3,
    elders: 0.1
  },
  village: {
    children: 0.42,
    maleAdults: 0.22,
    femaleAdults: 0.23,
    elders: 0.13
  },
  hamlet: {
    children: 0.45,
    maleAdults: 0.21,
    femaleAdults: 0.22,
    elders: 0.12
  },
  capital: {
    children: 0.38,
    maleAdults: 0.23,
    femaleAdults: 0.24,
    elders: 0.15
  },
  city: {
    children: 0.38,
    maleAdults: 0.23,
    femaleAdults: 0.24,
    elders: 0.15
  },
  town: DEFAULT_DEMOGRAPHIC_SHARES
};

export function getDemographicShares(group?: string | null): DemographicShares {
  if (group && group in GROUP_DEMOGRAPHIC_SHARES) {
    return GROUP_DEMOGRAPHIC_SHARES[group];
  }
  return DEFAULT_DEMOGRAPHIC_SHARES;
}

/** Build absolute demographic buckets from total population and burg group. */
export function buildBurgDemographics(
  population: number,
  capacity: number,
  group?: string | null,
  effectiveCapacity = capacity
): BurgDemographics {
  const shares = getDemographicShares(group);
  return {
    capacity,
    effectiveCapacity,
    children: rn(population * shares.children, 4),
    maleAdults: rn(population * shares.maleAdults, 4),
    femaleAdults: rn(population * shares.femaleAdults, 4),
    elders: rn(population * shares.elders, 4)
  };
}
