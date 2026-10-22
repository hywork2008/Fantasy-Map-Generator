/** Explicit household targets and handcraft labor assumptions; see the wool-products plan. */
import type { WorldContext } from "../../hostCore";
import type { Good } from "./goodsGeneratorTypes";
import { getRuralTextileChains } from "./ruralTextileChains";
import { HOUSEHOLD_GARMENT_NAMES } from "./textileRecipeContracts";

export const PEOPLE_PER_TEXTILE_MARKET_LOT = 1_000;
export const WARDROBE_REPLACEMENT_YEARS = 4;
export const BEDDING_HOUSEHOLD_SIZE = 5;
export const BLANKETS_PER_LOT = 100;
export const BLANKET_REPLACEMENT_YEARS = 8;
export const MONTHLY_HOUSEHOLD_TEXTILE_CASH_SHARE = 0.05;

export function getClothingClimateMultiplier(temperatureC: number): number {
  if (temperatureC < 0) return 1.4;
  if (temperatureC < 5) return 1.2;
  if (temperatureC >= 15) return 0.9;
  return 1;
}

export function getBlanketsPerHousehold(temperatureC: number): number {
  return 2 + (temperatureC < 5 ? 1 : 0) + (temperatureC < 0 ? 1 : 0);
}

/** Real full-time adult equivalents to meet a cell's own steady replacement targets. */
export function getRuralTextileRequiredWorkers(
  world: Readonly<WorldContext>,
  cellId: number,
  goods: readonly Good[]
): number {
  const chains = getRuralTextileChains(goods);
  const garmentLabor = Math.max(
    0,
    ...chains.filter(chain => HOUSEHOLD_GARMENT_NAMES.has(chain.product.name)).map(chain => chain.laborPerProduct)
  );
  const blanketLabor = Math.max(
    0,
    ...chains.filter(chain => chain.product.name === "Wool Blankets").map(chain => chain.laborPerProduct)
  );
  const cells = world.pack.cells;
  const people = Math.max(0, cells.pop[cellId] ?? 0) * Math.max(1, world.populationRate || 1);
  const temperature = world.grid?.cells?.temp?.[cells.g?.[cellId]] ?? 10;
  const wardrobes =
    garmentLabor > 0
      ? (people / PEOPLE_PER_TEXTILE_MARKET_LOT / WARDROBE_REPLACEMENT_YEARS / 12) *
        getClothingClimateMultiplier(temperature)
      : 0;
  const blankets =
    blanketLabor > 0
      ? ((people / BEDDING_HOUSEHOLD_SIZE) * getBlanketsPerHousehold(temperature)) /
        BLANKET_REPLACEMENT_YEARS /
        12 /
        BLANKETS_PER_LOT
      : 0;
  // Reserve enough for any supported fiber, never sum alternative wardrobe routes.
  return wardrobes * garmentLabor + blankets * blanketLabor;
}

/** Bedding receives savings only after paying for home wardrobes and reserving their remaining need. */
export function getBeddingCashBudget(
  budget: number,
  wardrobeNeed: number,
  wardrobePrice: number,
  homeGarments = 0,
  homeGarmentSpending = 0
): number {
  const remaining = Math.max(0, budget - homeGarmentSpending);
  const reserve = Number.isFinite(wardrobePrice) ? Math.max(0, wardrobeNeed - homeGarments) * wardrobePrice : 0;
  return Math.max(0, remaining - reserve);
}
