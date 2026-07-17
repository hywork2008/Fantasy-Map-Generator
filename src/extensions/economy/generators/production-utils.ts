import { sum } from "d3";
import { foodStressProductionMultiplier } from "../../hostCore";
import { DEFAULT_CULTURE_TYPE, type Zone } from "../../hostTypes";
import { getLatitude, getSeason, getSeasonalityStrength, rn, type Season } from "../../hostUtils";
import { getGoodCellColumn, getWorldContext } from "../economyContext";
import { getDepletionFactor } from "./forestDepletion";
import { type Good, Goods, isGoodEnabled } from "./goods-generator";

export const BONUS_RURAL_PRODUCTION = 0.25;
export const MAX_BONUS_PRODUCTION = 5;

let zoneCellSets: Map<number, Set<number>> | null = null;
let zoneCellSetsSource: Zone[] | null = null;

export function getZoneCellSets(): Map<number, Set<number>> {
  const zones = getWorldContext().pack.zones || [];
  if (zoneCellSets && zoneCellSetsSource === zones) return zoneCellSets;

  const sets = new Map<number, Set<number>>();
  for (const zone of zones) sets.set(zone.i, new Set(zone.cells));
  zoneCellSets = sets;
  zoneCellSetsSource = zones;
  return sets;
}

export function getModifiers(good: Good, cellId: number): number {
  const mult = good.multipliers;
  if (!mult) return 1;

  const biomeId = getWorldContext().pack.cells.biome[cellId];
  const cultureId = getWorldContext().pack.cells.culture[cellId];
  const stateId = getWorldContext().pack.cells.state[cellId];
  const religionId = getWorldContext().pack.cells.religion[cellId];

  const burgId = getWorldContext().pack.cells.burg[cellId];
  const cultureType =
    (burgId ? getWorldContext().pack.burgs[burgId]?.type : getWorldContext().pack.cultures[cultureId]?.type) ??
    DEFAULT_CULTURE_TYPE;

  let modifier =
    (mult.cultureType?.[cultureType] ?? 1) *
    (mult.culture?.[cultureId] ?? 1) *
    (mult.state?.[stateId] ?? 1) *
    (mult.religion?.[religionId] ?? 1) *
    (mult.biome?.[biomeId] ?? 1);

  if (mult.zone) {
    const sets = getZoneCellSets();
    for (const zoneIdStr in mult.zone) {
      const value = mult.zone[+zoneIdStr];
      if (value === undefined || value === 1) continue;
      if (sets.get(+zoneIdStr)?.has(cellId)) modifier *= value;
    }
  }

  return modifier;
}

/** Wood is the only good whose local supply is depleted by Shipbuilding's logging ticks. */
function getDepletionMultiplier(good: Good, cellId: number): number {
  if (good.name !== "Wood") return 1;
  return 1 - getDepletionFactor(cellId);
}

/**
 * Per-season output multiplier for food-tagged goods (Grain, etc.) at full latitudinal
 * seasonality (high latitudes), modeling a real annual harvest cycle instead of a flat
 * year-round trickle: most of the year's yield lands at once in autumn, with fields largely
 * dormant the rest of the year. Averages to exactly 1 across the four seasons, so annual total
 * food production at high latitude is unchanged from the old always-1x baseline — only its
 * distribution across the year changes. This is what makes grain cheap right after harvest and
 * expensive in the lean season before the next one: the existing demand/stock price formula in
 * markets-generator.ts reacts to the resulting stock swing with no separate price-modifier code
 * needed (see docs/simulation/seasons.md).
 */
const SEASONAL_FOOD_PRODUCTION_MULTIPLIER: Record<Season, number> = {
  spring: 0.3,
  summer: 0.3,
  autumn: 3.0,
  winter: 0.4
};

/**
 * Blends the full-swing multiplier above toward a flat 1x baseline as latitude approaches the
 * equator (getSeasonalityStrength -> 0), since near-equatorial climates don't have the
 * temperate single-autumn-harvest cycle the table models. The blend is linear in the deviation
 * from 1, so the four-season average stays exactly 1 at every latitude, not just at the poles.
 */
export function getSeasonalFoodProductionMultiplier(good: Good, cellId: number, month: number): number {
  if (!good.tags.includes("food")) return 1;

  const worldContext = getWorldContext();
  const point = worldContext.pack.cells.p[cellId];
  if (!point) return 1;

  const latitude = getLatitude(point[1], worldContext.mapCoordinates, worldContext.graphHeight);
  const season = getSeason(latitude, month);
  const strength = getSeasonalityStrength(latitude);
  return 1 + (SEASONAL_FOOD_PRODUCTION_MULTIPLIER[season] - 1) * strength;
}

function getSeasonalProductionMultiplier(good: Good, cellId: number): number {
  const worldContext = getWorldContext();
  const seasonal = getSeasonalFoodProductionMultiplier(good, cellId, worldContext.options.month ?? 1);

  // Spring/autumn war disruption (manpower-ecosystem §18) — 1 when foodStress is 0
  const stateId = worldContext.pack.cells.state[cellId] ?? 0;
  return seasonal * foodStressProductionMultiplier(stateId);
}

export type RuralProductionContribution = { goodId: number; amount: number };

export function getRuralCellPopulation(cellId: number): number {
  const cells = getWorldContext().pack.cells;
  if (cells.h[cellId] >= 20) return cells.pop[cellId];
  return sum(cells.c[cellId].map(neighborId => cells.pop[neighborId])) || 0;
}

/**
 * Returns the pre-season, pre-depletion quantities for this cell. The market
 * production index uses these stable contributions to aggregate rural output
 * once per topology/goods change, then applies time-varying factors at settlement.
 */
export function getRuralProductionContributions(
  cellId: number,
  biomeProduction: Record<number, { goodId: number; production: number }[]>
): RuralProductionContribution[] {
  const worldContext = getWorldContext();
  const cells = worldContext.pack.cells;
  const population = getRuralCellPopulation(cellId);
  if (population <= 0) return [];

  const contributions: RuralProductionContribution[] = [];
  for (const { goodId, production } of biomeProduction[cells.biome[cellId]] || []) {
    const good = Goods.get(goodId);
    if (good && isGoodEnabled(good)) {
      contributions.push({ goodId, amount: population * production * getModifiers(good, cellId) });
    }
  }

  const bonusGoodId = getGoodCellColumn()[cellId];
  if (bonusGoodId) {
    const good = Goods.get(bonusGoodId);
    if (good && isGoodEnabled(good)) {
      const bonus = Math.min(population * BONUS_RURAL_PRODUCTION, MAX_BONUS_PRODUCTION);
      contributions.push({ goodId: bonusGoodId, amount: bonus * getModifiers(good, cellId) });
    }
  }

  return contributions;
}

export function getCellProduction(
  cellId: number,
  biomeProduction: Record<number, { goodId: number; production: number }[]>
): Record<number, number> {
  const produced: Record<number, number> = {};

  const add = (goodId: number, amount: number) => {
    produced[goodId] = rn((produced[goodId] || 0) + amount, 2);
  };

  for (const contribution of getRuralProductionContributions(cellId, biomeProduction)) {
    const good = Goods.get(contribution.goodId);
    if (!good) continue;
    const multiplier = getDepletionMultiplier(good, cellId) * getSeasonalProductionMultiplier(good, cellId);
    add(contribution.goodId, contribution.amount * multiplier);
  }

  return produced;
}
