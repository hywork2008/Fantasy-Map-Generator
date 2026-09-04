import type { Burg } from "../../hostTypes";
import { minmax, rn } from "../../hostUtils";
import { getMarketCellColumn, getMarkets, getRuralFoodCapacity, getWorldContext } from "../economyContext";

/**
 * Live `capacity` may shrink to this share of generation-time `seedCapacity` in a
 * food-poor hinterland, so one drought year cannot erase a city's site advantage.
 */
export const URBAN_CAPACITY_MIN_SEED_SHARE = 0.5;
/** Live `capacity` may grow to this multiple of `seedCapacity` when hinterland + imports allow. */
export const URBAN_CAPACITY_MAX_GROWTH_MULTIPLIER = 3;
const LAND_HEIGHT = 20;

/**
 * Rural-equivalent food surplus of one market's hinterland, converted to urban population
 * points. `ruralFoodCapacity` is already in rural points; urban points are smaller by
 * `urbanization` because one burg point represents more people.
 */
export function hinterlandSurplusUrbanPoints(
  marketId: number,
  cells: {
    readonly i: ArrayLike<number>;
    readonly h?: ArrayLike<number>;
    readonly pop?: ArrayLike<number>;
  },
  marketCellColumn: ArrayLike<number>,
  ruralFoodCapacity: ArrayLike<number>,
  urbanization: number
): number {
  let foodPoints = 0;
  let ruralPop = 0;
  const cellCount = cells.i.length;
  for (let index = 0; index < cellCount; index++) {
    const cellId = cells.i[index] as number;
    if (marketCellColumn[cellId] !== marketId) continue;
    if ((cells.h?.[cellId] ?? 0) < LAND_HEIGHT) continue;
    foodPoints += Math.max(0, ruralFoodCapacity[cellId] ?? 0);
    ruralPop += Math.max(0, cells.pop?.[cellId] ?? 0);
  }
  const surplusRuralPoints = Math.max(0, foodPoints - ruralPop);
  return surplusRuralPoints / Math.max(1e-6, urbanization);
}

/**
 * Annual urban carrying-capacity reconcile. Rural subsistenceCapacity is already
 * rewritten from the same `ruralFoodCapacity` column; this is the missing urban
 * counterpart (docs/plan/economy-coupling-audit.md L4).
 *
 * Food term is hinterland surplus plus last quarter's `importCapacityBonus` so a
 * grain-importing megacity does not collapse to `seedCapacity * MIN_SHARE` just
 * because its hinterland has no leftover. `applyImportCapacity` still adds this
 * quarter's bonus on top of `capacity`; the housing band [0.5, 1.3] clips that
 * overlay so stable imports cannot run away.
 *
 * Old saves with no `seedCapacity` record the current `capacity` as the seed and
 * skip the rewrite for this year, so load-day behaviour matches the pre-L4 map.
 *
 * @returns true when any burg's `capacity` changed.
 */
export function reconcileUrbanCapacityFromFood(): boolean {
  const world = getWorldContext();
  const { pack } = world;
  const cells = pack?.cells;
  const burgs = pack?.burgs;
  if (!cells?.i || !burgs) return false;

  const ruralFoodCapacity = getRuralFoodCapacity();
  if (ruralFoodCapacity.length !== cells.i.length) return false;

  const marketCellColumn = getMarketCellColumn();
  const urbanization = Math.max(1e-6, world.urbanization ?? 1);
  let changed = false;

  for (const market of getMarkets()) {
    const marketBurgs = burgs.filter(burg => burg.i && !burg.removed && burg.market === market.i && burg.demographics);
    if (!marketBurgs.length) continue;

    const ready: Burg[] = [];
    for (const burg of marketBurgs) {
      const demographics = burg.demographics;
      if (!demographics) continue;
      if (typeof demographics.seedCapacity !== "number" || !(demographics.seedCapacity > 0)) {
        demographics.seedCapacity = demographics.capacity;
        continue;
      }
      ready.push(burg);
    }
    if (!ready.length) continue;

    const hinterland = hinterlandSurplusUrbanPoints(market.i, cells, marketCellColumn, ruralFoodCapacity, urbanization);
    const importPoints = Math.max(0, market.foodLedger?.importCapacityBonus ?? 0);
    const foodPoints = hinterland + importPoints;
    const totalSeed = ready.reduce((sum, burg) => sum + (burg.demographics?.seedCapacity ?? 0), 0);
    if (totalSeed <= 0) continue;

    for (const burg of ready) {
      const demographics = burg.demographics;
      if (!demographics) continue;
      const seed = demographics.seedCapacity ?? demographics.capacity;
      const target = foodPoints * (seed / totalSeed);
      const next = rn(
        minmax(target, seed * URBAN_CAPACITY_MIN_SEED_SHARE, seed * URBAN_CAPACITY_MAX_GROWTH_MULTIPLIER),
        3
      );
      if (next !== demographics.capacity) {
        demographics.capacity = next;
        changed = true;
      }
    }
  }

  return changed;
}
