/**
 * Pure overseas-voyage math: climate-gap risk, shipwreck/piracy composition, PowerTier pricing.
 * Same shape as escortRouteThreat.ts's pure threat+fee math — no economyContext imports.
 *
 * Design: docs/plan/distant-realms-overseas-trade.md §3, §6.
 *
 * Phase 1 simplification vs. the design doc: risk is resolved once for the whole round trip
 * (as if it were two independent legs compounded together) instead of once per leg with an
 * intermediate "at realm" state. Phase 2 callers supply the convoy's escort ratio, reducing
 * piracy risk without changing the shipwreck calculation.
 */

import type { ClimateBand, DistanceBand, ExpeditionPurpose, PowerTier } from "./overseasRelationsTypes";
import { CLIMATE_BANDS } from "./overseasRelationsTypes";

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Ordinal position used only to measure "how different" two climates are, not real distance. */
export function climateGapSteps(a: ClimateBand, b: ClimateBand): number {
  return Math.abs(CLIMATE_BANDS.indexOf(a) - CLIMATE_BANDS.indexOf(b));
}

/** One-way sail days and days spent loading/trading at the far port, by distance band. */
export const DISTANCE_BAND_DAYS: Record<DistanceBand, { oneWay: number; stay: number }> = {
  nearAbroad: { oneWay: 42, stay: 10 },
  farAbroad: { oneWay: 85, stay: 15 },
  remote: { oneWay: 145, stay: 20 }
};

export function getExpeditionDurationDays(distanceBand: DistanceBand): number {
  const { oneWay, stay } = DISTANCE_BAND_DAYS[distanceBand];
  return oneWay * 2 + stay;
}

/** Baseline per-leg shipwreck/piracy rates. Tunable defaults — see docs/plan doc §6. */
const BASE_WRECK_RATE_PER_LEG: Record<DistanceBand, number> = {
  nearAbroad: 0.03,
  farAbroad: 0.06,
  remote: 0.1
};
const BASE_PIRACY_RATE_PER_LEG: Record<DistanceBand, number> = {
  nearAbroad: 0.02,
  farAbroad: 0.05,
  remote: 0.09
};

/** Indexed by ShipClassDefinition.tier (0 sloop .. 3 steamship). Higher = safer. */
export const SEAWORTHINESS_BY_TIER: readonly number[] = [0.1, 0.45, 0.7, 0.85];
/** Ship tier assumed when Shipbuilding hasn't resolved a concrete hull (abstract water mode). */
export const FALLBACK_SHIP_TIER = 1;

/** Risk inflation per climate-band step away from home — long, unfamiliar routes are more hazardous. */
export const CLIMATE_GAP_WEIGHT = 0.12;

/** Max piracy-risk reduction from a full-escort convoy (escortRatio 1). Unused until Phase 2. */
export const ESCORT_EFFECTIVENESS = 0.6;

export function computeShipwreckRisk(params: {
  distanceBand: DistanceBand;
  shipTier: number;
  climateSteps: number;
}): number {
  const seaworthiness = SEAWORTHINESS_BY_TIER[params.shipTier] ?? SEAWORTHINESS_BY_TIER[0];
  const climateMultiplier = 1 + CLIMATE_GAP_WEIGHT * params.climateSteps;
  return clamp01(BASE_WRECK_RATE_PER_LEG[params.distanceBand] * (1 - seaworthiness) * climateMultiplier);
}

export function computePiracyRisk(params: { distanceBand: DistanceBand; escortRatio: number }): number {
  const escortRatio = clamp01(params.escortRatio);
  return clamp01(BASE_PIRACY_RATE_PER_LEG[params.distanceBand] * (1 - escortRatio * ESCORT_EFFECTIVENESS));
}

/** Compound shipwreck/piracy into one leg's loss chance, then compound two legs into a round trip. */
export function computeRoundTripLossRisk(params: {
  distanceBand: DistanceBand;
  shipTier: number;
  climateSteps: number;
  escortRatio: number;
}): { legLossRisk: number; roundTripLossRisk: number; shipwreckRisk: number; piracyRisk: number } {
  const shipwreckRisk = computeShipwreckRisk(params);
  const piracyRisk = computePiracyRisk(params);
  const legLossRisk = 1 - (1 - shipwreckRisk) * (1 - piracyRisk);
  const roundTripLossRisk = 1 - (1 - legLossRisk) ** 2;
  return { legLossRisk, roundTripLossRisk, shipwreckRisk, piracyRisk };
}

/** ratio = state.overseasProjectionScore / realm.powerScore. */
export function getPowerTier(ratio: number): PowerTier {
  if (ratio < 0.7) return "stronger";
  if (ratio <= 1.4) return "comparable";
  return "weaker";
}

/** Treasury cost/return multipliers by how the realm compares to the trading state. Tunable defaults. */
const BUY_COST_MULTIPLIER: Record<PowerTier, number> = { stronger: 1.15, comparable: 1.0, weaker: 0.75 };
const RETURN_MULTIPLIER: Record<PowerTier, number> = { stronger: 1.15, comparable: 1.35, weaker: 1.6 };
const DISTANCE_COST_FACTOR: Record<DistanceBand, number> = { nearAbroad: 1.0, farAbroad: 1.15, remote: 1.35 };

/** Value points per unit of distancePremium (GoodTradeProfile's -2..3 trend) applied to the return leg. */
const DISTANCE_PREMIUM_STEP = 0.1;

/**
 * Treasury outlay to fund one expedition's purchase abroad. Deliberately anchored to a small,
 * flat base rather than good.value × full ship-hold units — state.treasury runs in the same
 * tens-scale as other fiscal levers (see docs/plan/state-treasury-department-budget.md), not the
 * larger scale Market-level goods trade can reach.
 */
const EXPEDITION_BASE_INVESTMENT = 8;
/** good.value is normalized against this before scaling — most catalogue goods sit near this value. */
const GOOD_VALUE_NORMALIZER = 10;

export function computeExpeditionBuyCost(params: {
  goodValue: number;
  distanceBand: DistanceBand;
  powerTier: PowerTier;
}): number {
  return (
    EXPEDITION_BASE_INVESTMENT *
    (params.goodValue / GOOD_VALUE_NORMALIZER) *
    DISTANCE_COST_FACTOR[params.distanceBand] *
    BUY_COST_MULTIPLIER[params.powerTier]
  );
}

export function computeExpeditionReturn(params: {
  buyCost: number;
  powerTier: PowerTier;
  distancePremium: number;
}): number {
  const premiumBonus = 1 + params.distancePremium * DISTANCE_PREMIUM_STEP;
  return params.buyCost * RETURN_MULTIPLIER[params.powerTier] * premiumBonus;
}

/** Probability that an armed coercion expedition succeeds after reaching the Realm. */
export function computeCoercionSuccessChance(params: {
  purpose: Extract<ExpeditionPurpose, "tribute" | "raid">;
  powerTier: PowerTier;
  defenseScore: number;
  escortCount: number;
  relationScore: number;
}): number {
  const base = params.purpose === "tribute" ? 0.64 : 0.56;
  const powerBonus = params.powerTier === "weaker" ? 0.16 : params.powerTier === "comparable" ? 0 : -0.2;
  const escortBonus = Math.min(0.24, Math.max(0, params.escortCount) * 0.08);
  const defensePenalty = clamp01(Math.max(0, params.defenseScore) / 250) * 0.38;
  const relationBonus = clamp01(params.relationScore / 100) * 0.08;
  return clamp01(base + powerBonus + escortBonus + relationBonus - defensePenalty);
}

/** Treasury-scale rewards from the Realm's abstract wealth; avoids injecting market-scale values. */
export function computeCoercionRevenue(params: {
  purpose: Extract<ExpeditionPurpose, "tribute" | "raid">;
  wealthLevel: number;
}): number {
  const share = params.purpose === "tribute" ? 0.025 : 0.08;
  return Math.max(0, params.wealthLevel) * share;
}

/** Small recurring monthly revenue after a successful tribute demand. */
export function computeMonthlyTributeRevenue(wealthLevel: number): number {
  return Math.max(0, wealthLevel) * 0.003;
}

/** Abstract naval/mercantile reach a state can project overseas. Tunable defaults. */
const MERCHANT_TONNAGE_WEIGHT = 0.05;
const TREASURY_WEIGHT = 0.3;

export function computeOverseasProjectionScore(params: {
  merchantCargoCapacitySlots: number;
  treasury: number;
}): number {
  return params.merchantCargoCapacitySlots * MERCHANT_TONNAGE_WEIGHT + Math.max(0, params.treasury) * TREASURY_WEIGHT;
}
