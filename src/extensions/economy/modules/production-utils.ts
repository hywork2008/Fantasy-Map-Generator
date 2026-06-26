import { sum } from "d3";
import type { Zone } from "../../../types/models";
import { DEFAULT_CULTURE_TYPE } from "../../../types/models";
import { rn } from "../../../utils/numberUtils";
import { getWorldContext } from "../economyContext";
import { type Good, Goods } from "./goods-generator";

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

export function getCellProduction(
  cellId: number,
  biomeProduction: Record<number, { goodId: number; production: number }[]>
): Record<number, number> {
  const produced: Record<number, number> = {};

  const modifier = (good: Good) => getModifiers(good, cellId);
  const add = (goodId: number, amount: number) => {
    produced[goodId] = rn((produced[goodId] || 0) + amount, 2);
  };

  const isWater = getWorldContext().pack.cells.h[cellId] < 20;
  const pop = isWater
    ? sum(getWorldContext().pack.cells.c[cellId].map(c => getWorldContext().pack.cells.pop[c])) || 0
    : getWorldContext().pack.cells.pop[cellId];

  if (pop > 0) {
    for (const { goodId, production } of biomeProduction[getWorldContext().pack.cells.biome[cellId]] || []) {
      const good = Goods.get(goodId);
      if (good) add(goodId, pop * production * modifier(good));
    }

    const bonusGoodId = getWorldContext().pack.cells.good[cellId];
    if (bonusGoodId) {
      const good = Goods.get(bonusGoodId);
      if (good) {
        const bonus = Math.min(pop * BONUS_RURAL_PRODUCTION, MAX_BONUS_PRODUCTION);
        add(bonusGoodId, bonus * modifier(good));
      }
    }
  }

  return produced;
}
