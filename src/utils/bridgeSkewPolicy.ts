/** How far a bridge axis may turn away from the river normal (0° = square crossing).
 * Shared by FMG, RE and CE. Research and rationale: docs/plan/bridge-skew-policy.md.
 *
 * Builders before the late 18th century bent the road to meet the river square
 * and only tolerated small skews; skew masonry arches needed the descriptive
 * geometry of the canal/railway age. A bridge running nearly along the river,
 * or turning 90° mid-stream, is never allowed in any era.
 */
import type { BridgeTransport } from "./bridgeCrossingPolicy";

/** Generators aim for this or less; it is not a hard limit. */
export const BRIDGE_SKEW_PREFERRED_DEGREES = 10;

/** The largest allowance of any era; data beyond it is never a valid bridge. */
export const BRIDGE_SKEW_MAX_DEGREES = 30;

/** Route-cost surcharge per degree beyond the preferred skew, so a square or
 * near-square crossing wins unless a skewed one saves a real detour. */
export const BRIDGE_SKEW_PENALTY_METERS_PER_DEGREE = 5;

export function bridgeSkewPenaltyMeters(skewDegrees: number): number {
  return Math.max(0, Math.abs(skewDegrees) - BRIDGE_SKEW_PREFERRED_DEGREES) * BRIDGE_SKEW_PENALTY_METERS_PER_DEGREE;
}

/** Candidate skews to try, square first: 0, ±preferred, ±limit (deduplicated, within the limit). */
export function bridgeSkewCandidates(limitDegrees: number): number[] {
  const limit = Math.max(0, Math.min(BRIDGE_SKEW_MAX_DEGREES, limitDegrees));
  const result = [0];
  for (const step of [Math.min(BRIDGE_SKEW_PREFERRED_DEGREES, limit), limit])
    if (step > 0 && !result.includes(step)) result.push(step, -step);
  return result;
}

export type BridgeStructure = "stone" | "timber";

/** Main roads get masonry bridges; trails and other land routes timber ones.
 * Region Editor uses the same split (highway → stone_arch, others → wooden). */
export function bridgeStructureForRouteGroup(group: string | undefined): BridgeStructure {
  return group === "roads" ? "stone" : "timber";
}

/** 0 = ancient/medieval, 1 = early modern surveying, 2 = skew-arch / modern engineering. */
export type BridgeSkewTier = 0 | 1 | 2;

const LIMIT_BY_TIER: Readonly<Record<BridgeSkewTier, Readonly<Record<BridgeStructure, number>>>> = {
  0: { stone: 15, timber: 20 },
  1: { stone: 25, timber: 25 },
  2: { stone: 30, timber: 30 }
};

const TIER_BY_PERIOD: Readonly<Record<string, BridgeSkewTier>> = {
  earlyMedieval: 0,
  highMedieval: 0,
  lateMedieval: 0,
  ageOfExploration: 1,
  maritimeEra: 1,
  preIndustrialEra: 2,
  steamEra: 2,
  industrialChemistryEra: 2,
  petroleumEra: 2,
  rocketryEra: 2
};

/** Technologies that raise a state's tier during play, at "adopted" or better.
 * mathAstronomyGeography: surveying/geometry for setting out oblique spans.
 * precisionBoringAndMeasurement: precise stone cutting and gauging for skew arches. */
export const BRIDGE_SKEW_TECHNOLOGY_GATES: readonly { tier: BridgeSkewTier; technologyId: string }[] = [
  { tier: 1, technologyId: "mathAstronomyGeography" },
  { tier: 2, technologyId: "precisionBoringAndMeasurement" }
];

/** Missing/unknown periods use the conservative medieval tier. */
export function bridgeSkewTierForPeriod(period?: string): BridgeSkewTier {
  return period && Object.hasOwn(TIER_BY_PERIOD, period) ? TIER_BY_PERIOD[period] : 0;
}

export function bridgeSkewLimitForTier(tier: BridgeSkewTier, structure: BridgeStructure = "stone"): number {
  return LIMIT_BY_TIER[tier][structure];
}

export function bridgeSkewLimitForPeriod(period?: string, structure: BridgeStructure = "stone"): number {
  return bridgeSkewLimitForTier(bridgeSkewTierForPeriod(period), structure);
}

/** An explicit per-burg limit (exported by FMG from the owning state's technology) wins;
 * otherwise the period default applies. */
export function resolveBridgeSkewLimit(
  period?: string,
  transport?: BridgeTransport,
  structure: BridgeStructure = "stone"
): number {
  const explicit = transport?.maxBridgeSkewDegrees;
  if (explicit !== undefined && Number.isFinite(explicit) && explicit >= 0) return Math.min(explicit, 89);
  return bridgeSkewLimitForPeriod(period, structure);
}

/** Degrees between a bridge axis and the river normal, from unit-free direction vectors. */
export function bridgeSkewDegrees(axis: readonly [number, number], riverTangent: readonly [number, number]): number {
  const a = Math.hypot(axis[0], axis[1]);
  const t = Math.hypot(riverTangent[0], riverTangent[1]);
  if (a < 1e-12 || t < 1e-12) return 90;
  const along = Math.abs(axis[0] * riverTangent[0] + axis[1] * riverTangent[1]) / (a * t);
  return (Math.asin(Math.min(1, along)) * 180) / Math.PI;
}

/** Small tolerance so a float-perfect square crossing never fails on rounding. */
export function withinBridgeSkewLimit(skewDegrees: number, limitDegrees: number): boolean {
  return skewDegrees <= limitDegrees + 1e-6;
}
