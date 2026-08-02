import { rn } from "../../hostUtils";
import { getConstructionOperations, getGoods, getWorldContext } from "../economyContext";
import { getHousingRecipeForBurg, normalizeConstructionOperation } from "./constructionEmployment";
import type { HousingRecipe } from "./housingRecipes";

/**
 * Burg / state settlement valuation from housing stock
 * (docs/plan/urban-housing-system.md PR-V / K9).
 * Pure read of economy slice + pack; no war AI.
 */

/** Material units per dwelling at recipe weight 1.0 (valuation calibration only). */
export const WOOD_PER_DWELLING = 2.0;
export const STONE_PER_DWELLING = 1.6;
export const BRICK_PER_DWELLING = 1.6;

const WALLS_PREMIUM = 0.15;
const CITADEL_PREMIUM = 0.25;

export interface BurgSettlementValue {
  burgId: number;
  /** Replacement cost of built dwellings at current culture recipe. */
  housingValue: number;
  /** Civic/infrastructure residual — 0 in v1. */
  infrastructureValue: number;
  /** housingValue × (1 + fortificationPremium). */
  total: number;
  /** walls 0.15 + citadel 0.25 applied to housingValue. */
  fortificationPremium: number;
  unitCost: number;
  dwellingStock: number;
}

function goodValueByName(name: string): number {
  const good = getGoods().find(entry => entry.name.toLowerCase() === name.toLowerCase());
  return good?.value ?? 0;
}

/**
 * Replacement cost of one dwelling at the given material mix (current recipe, not historical).
 * Expected order-of-magnitude ~5–20 for Generic with default good values.
 */
export function unitCost(recipe: HousingRecipe): number {
  const wood = goodValueByName("Wood") * recipe.wood * WOOD_PER_DWELLING;
  const stone = goodValueByName("Stone") * recipe.stone * STONE_PER_DWELLING;
  const brick = goodValueByName("Brick") * recipe.brick * BRICK_PER_DWELLING;
  return wood + stone + brick;
}

export function fortificationPremium(burg: { walls?: number | boolean; citadel?: number | boolean }): number {
  return (burg.walls ? WALLS_PREMIUM : 0) + (burg.citadel ? CITADEL_PREMIUM : 0);
}

/**
 * Settlement value for one burg.
 * `null` when economy has no active ConstructionOperation (fort, no market, disabled, missing).
 */
export function getBurgSettlementValue(burgId: number): BurgSettlementValue | null {
  if (!burgId) return null;
  const { pack } = getWorldContext();
  const burg = pack.burgs?.[burgId];
  if (!burg?.i || burg.removed) return null;
  if (burg.group === "fort") return null;

  const operation = getConstructionOperations().find(op => op.active && op.burgId === burgId);
  if (!operation) return null;

  const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;
  const normalized = normalizeConstructionOperation(operation, burg, populationRate);
  const recipe = getHousingRecipeForBurg(burg, normalized.hasQuarryAccess);
  const cost = unitCost(recipe);
  const housingValue = Math.max(0, normalized.dwellingStock) * cost;
  const premium = fortificationPremium(burg);
  const total = housingValue * (1 + premium);

  return {
    burgId,
    housingValue: rn(housingValue, 2),
    infrastructureValue: 0,
    total: rn(total, 2),
    fortificationPremium: premium,
    unitCost: rn(cost, 4),
    dwellingStock: rn(normalized.dwellingStock, 4)
  };
}

/**
 * Sum of `getBurgSettlementValue(...).total` for all burgs owned by the state.
 * Returns 0 when none (including economy disabled / no ops).
 */
export function getStateSettlementValue(stateId: number): number {
  if (!stateId) return 0;
  const burgs = getWorldContext().pack.burgs ?? [];
  let sum = 0;
  for (const burg of burgs) {
    if (!burg?.i || burg.removed || burg.state !== stateId) continue;
    const value = getBurgSettlementValue(burg.i);
    if (value) sum += value.total;
  }
  return rn(sum, 2);
}
