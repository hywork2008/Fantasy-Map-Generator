/**
 * Staple grain in a rural household's diet (docs/plan/rural-food-labor-audit.md, problem A).
 *
 * A cell's settlement capacity counts fishing, herding and foraging as well as fields
 * (host subsistenceCapacity.ts). Those households ate much of their own catch, milk and meat and
 * bartered the rest for grain — northern Norwegian fishermen traded stockfish for grain at Bergen —
 * so the Food Ledger asks them only for the grain part of their diet.
 */

import { WET_TOLERANCE_AT_MAX } from "../../../data/stapleCrops";

/** Share of a fully non-agricultural household's food that its own livelihood supplies. */
export const NON_GRAIN_DIET_SHARE_MAX = 0.6;

/**
 * Wet, cool lands lived on milk and meat more than on grain (docs/plan/wet-region-pastoral-economy.md
 * §2.1): dairy gave 30-50% of the food in medieval Ireland and highland Scotland (Kelly 1997, Early
 * Irish Farming; Dodgshon 1998), grain about half on Norwegian farms. Reached where the crop mix's
 * wet-side rainfall suitability falls to WET_TOLERANCE_AT_MAX.
 */
export const WET_PASTORAL_DIET_SHARE_MAX = 0.5;
/** Grain never falls below this share of a rural diet. */
export const GRAIN_DIET_SHARE_FLOOR = 1 - NON_GRAIN_DIET_SHARE_MAX;

interface RuralDietCells {
  readonly subsistenceNonAgriculturalCapacity?: ArrayLike<number>;
  /** Milk-and-meat share of the diet from too much rain for grain (getWetPastoralDietShare). */
  readonly wetPastoralDietShare?: ArrayLike<number>;
}

/** Milk-and-meat share of the diet for a crop mix's wet-side rainfall suitability `p` (0..1). */
export function getWetPastoralDietShare(p: number): number {
  if (!(p < 1)) return 0;
  return Math.min(
    1 - GRAIN_DIET_SHARE_FLOOR,
    (WET_PASTORAL_DIET_SHARE_MAX * (1 - Math.max(0, p))) / (1 - WET_TOLERANCE_AT_MAX)
  );
}

function getLivelihoodGrainDietShare(
  cells: RuralDietCells,
  cellId: number,
  ruralFoodCapacity: ArrayLike<number> | undefined
): number {
  const nonAgricultural = Math.max(0, cells.subsistenceNonAgriculturalCapacity?.[cellId] ?? 0);
  if (!(nonAgricultural > 0)) return 1;
  const fields = Math.max(0, ruralFoodCapacity?.[cellId] ?? 0);
  return 1 - NON_GRAIN_DIET_SHARE_MAX * (nonAgricultural / (nonAgricultural + fields));
}

/**
 * Share (0.4..1) of a rural resident's food need that must be grain. The cell's fishing, herding
 * and foraging capacity, against that plus its field capacity (`ruralFoodCapacity`, both in rural
 * population points), stands for the households living by those trades. Too much rain for grain
 * lowers it too; the stronger of the two applies, so the same herding households are not counted twice.
 * Maps without either column eat grain only, as before.
 */
export function getRuralGrainDietShare(
  cells: RuralDietCells,
  cellId: number,
  ruralFoodCapacity: ArrayLike<number> | undefined
): number {
  const livelihood = getLivelihoodGrainDietShare(cells, cellId, ruralFoodCapacity);
  const wet = Math.max(0, cells.wetPastoralDietShare?.[cellId] ?? 0);
  return Math.max(GRAIN_DIET_SHARE_FLOOR, Math.min(livelihood, 1 - wet));
}

/**
 * People per point of field capacity, relative to a livelihood-only diet (>= 1). Fields sized for
 * the grain part of a wet-land diet feed more people than their grain alone, the rest living on
 * milk and meat; the livelihood part is already counted in the non-agricultural capacity
 * (docs/plan/wet-region-pastoral-economy.md §3.6).
 */
export function getWetPastoralFieldCapacityMultiplier(
  cells: RuralDietCells,
  cellId: number,
  ruralFoodCapacity: ArrayLike<number> | undefined
): number {
  if (!((cells.wetPastoralDietShare?.[cellId] ?? 0) > 0)) return 1;
  return (
    getLivelihoodGrainDietShare(cells, cellId, ruralFoodCapacity) /
    getRuralGrainDietShare(cells, cellId, ruralFoodCapacity)
  );
}
