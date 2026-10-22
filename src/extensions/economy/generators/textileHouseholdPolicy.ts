/** Explicit household targets and handcraft labor assumptions; see the wool-products plan. */
import type { WorldContext } from "../../hostCore";
import { getGoodDemandCalibration } from "./craftDemandCalibration";
import type { Good } from "./goodsGeneratorTypes";
import { CLOTH_LOTS_PER_GARMENT, WOOL_CLOTH_LOTS_PER_BLANKET_LOT } from "./textileRecipeContracts";

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
  const names = new Set(goods.map(good => good.name));
  if (!names.has("Wool") || !names.has("Wool Cloth")) return 0;
  const cells = world.pack.cells;
  const people = Math.max(0, cells.pop[cellId] ?? 0) * Math.max(1, world.populationRate || 1);
  const temperature = world.grid?.cells?.temp?.[cells.g?.[cellId]] ?? 10;
  const labor = (name: string) => (getGoodDemandCalibration(name)?.laborPointsPerLotAtDefaultRate ?? 0) * 1000;
  const wardrobes = names.has("Wool Garments")
    ? (people / PEOPLE_PER_TEXTILE_MARKET_LOT / WARDROBE_REPLACEMENT_YEARS / 12) *
      getClothingClimateMultiplier(temperature)
    : 0;
  const blankets = names.has("Wool Blankets")
    ? ((people / BEDDING_HOUSEHOLD_SIZE) * getBlanketsPerHousehold(temperature)) /
      BLANKET_REPLACEMENT_YEARS /
      12 /
      BLANKETS_PER_LOT
    : 0;
  return (
    wardrobes * (labor("Wool Garments") + CLOTH_LOTS_PER_GARMENT * labor("Wool Cloth")) +
    blankets * (labor("Wool Blankets") + WOOL_CLOTH_LOTS_PER_BLANKET_LOT * labor("Wool Cloth"))
  );
}
