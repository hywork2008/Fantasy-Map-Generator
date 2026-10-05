import type { WorldContext } from "../context/worldContext";
import { estimateCellFoodProduction } from "./estimatedFoodProduction";
import {
  ANNUAL_SOWN_SHARE,
  EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK,
  STAPLE_NEED_KG_PER_PERSON_YEAR
} from "./settlementClearance";

/** Dominant local food strategy. Codes keep the packed map serializable. */
export const LIVELIHOOD_CODE = {
  none: 0,
  agriculture: 1,
  fishing: 2,
  pastoral: 3,
  foraging: 4,
  mixed: 5
} as const;

export type LivelihoodKind = keyof typeof LIVELIHOOD_CODE;

export function getLivelihoodKind(code: number | undefined): LivelihoodKind {
  return (Object.entries(LIVELIHOOD_CODE).find(([, value]) => value === code)?.[0] ?? "none") as LivelihoodKind;
}

type CapacityColumns = {
  readonly capacity: ArrayLike<number>;
  readonly subsistenceCapacity?: ArrayLike<number>;
  readonly subsistenceNonAgriculturalCapacity?: ArrayLike<number>;
};

/**
 * Returns the local, self-sustaining rural capacity when it has been generated.
 * `cells.capacity` remains the older broad terrain/habitability ceiling, so
 * existing political and terrain systems do not accidentally interpret food
 * scarcity as impassable terrain.
 */
export function getCellSubsistenceCapacity(cells: CapacityColumns, cellId: number): number {
  return cells.subsistenceCapacity?.[cellId] ?? cells.capacity[cellId] ?? 0;
}

/**
 * Applies the Economy's independently calculated agricultural food capacity without making the
 * host depend on the Economy extension. Non-agricultural livelihoods remain available underneath.
 */
export function reconcileSubsistenceCapacityFromFood(
  cells: {
    readonly capacity: ArrayLike<number>;
    subsistenceCapacity?: Float32Array;
    readonly subsistenceNonAgriculturalCapacity?: Float32Array;
  },
  agriculturalFoodCapacity: ArrayLike<number>
): void {
  const target = cells.subsistenceCapacity;
  if (!target || target.length !== agriculturalFoodCapacity.length) return;
  for (let cellId = 0; cellId < target.length; cellId++) {
    const terrainCapacity = Math.max(0, cells.capacity[cellId] ?? 0);
    // Legacy maps have no separated baseline. Retain their historical local capacity instead of
    // erasing fishing and pastoral livelihoods when the Economy extension is first enabled.
    const nonAgricultural = Math.max(0, cells.subsistenceNonAgriculturalCapacity?.[cellId] ?? target[cellId] ?? 0);
    const agriculture = Math.max(0, agriculturalFoodCapacity[cellId] ?? 0);
    target[cellId] = Math.min(terrainCapacity, nonAgricultural + agriculture);
  }
}

/**
 * Builds the food-derived rural capacity used by initial settlement and annual
 * rural demography. Agriculture can approach the terrain ceiling; fishing,
 * pastoralism, and foraging support lower densities instead of being erased.
 */
export function generateSubsistenceCapacity(world: WorldContext): void {
  const cells = world.pack.cells;
  const count = cells.i.length;
  const subsistenceCapacity = new Float32Array(count);
  const subsistenceNonAgriculturalCapacity = new Float32Array(count);
  const livelihood = new Uint8Array(count);

  const food = estimateCellFoodProduction(world);
  const populationRate = Math.max(1, world.populationRate || 1);

  for (const cellId of cells.i) {
    const terrainCapacity = cells.capacity[cellId] ?? 0;
    if (terrainCapacity <= 0 || (cells.h[cellId] ?? 0) < 20) continue;

    const tags = world.biomesData.tags[cells.biomeCode[cellId] ?? 0] ?? [];
    const temperature = world.grid.cells.temp[cells.g[cellId] ?? cellId] ?? 12;
    const agriculturalCapacity =
      (food.cultivableAreaHa[cellId] *
        food.yieldKgPerHa[cellId] *
        ANNUAL_SOWN_SHARE *
        EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK) /
      STAPLE_NEED_KG_PER_PERSON_YEAR /
      populationRate;
    const agriculture = Math.min(1, agriculturalCapacity / terrainCapacity);
    const fishing = getFishingSupport(cells, cellId, tags);
    const pastoral = getPastoralSupport(temperature, tags);
    const foraging = getForagingSupport(temperature, tags);
    const supports = [agriculture, fishing, pastoral, foraging];
    const nonAgriculturalSupport = Math.min(1, fishing + pastoral + foraging);
    const totalSupport = Math.min(1, agriculture + nonAgriculturalSupport);

    subsistenceCapacity[cellId] = terrainCapacity * totalSupport;
    subsistenceNonAgriculturalCapacity[cellId] = terrainCapacity * nonAgriculturalSupport;
    livelihood[cellId] = getLivelihoodCode(supports);
  }

  cells.subsistenceCapacity = subsistenceCapacity;
  cells.subsistenceNonAgriculturalCapacity = subsistenceNonAgriculturalCapacity;
  cells.livelihood = livelihood;
}

/** Replaces a saved/extension agricultural result with the host estimate after load or disable. */
export function refreshEstimatedSubsistenceCapacity(world: WorldContext): void {
  const cells = world.pack.cells;
  if (!cells.i?.length || !world.grid?.cells?.temp?.length) return;
  if (
    cells.subsistenceNonAgriculturalCapacity?.length !== cells.i.length ||
    cells.subsistenceCapacity?.length !== cells.i.length
  ) {
    generateSubsistenceCapacity(world);
  }
  const food = estimateCellFoodProduction(world);
  const rate = Math.max(1, world.populationRate || 1);
  if (cells.livelihood?.length !== cells.i.length) cells.livelihood = new Uint8Array(cells.i.length);
  for (const id of cells.i) {
    const agriculture =
      (food.cultivableAreaHa[id] * food.yieldKgPerHa[id] * ANNUAL_SOWN_SHARE * EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK) /
      STAPLE_NEED_KG_PER_PERSON_YEAR /
      rate;
    cells.subsistenceCapacity![id] = Math.min(
      Math.max(0, cells.capacity[id] ?? 0),
      (cells.subsistenceNonAgriculturalCapacity![id] ?? 0) + (cells.subterraneanCapacity?.[id] ?? 0) + agriculture
    );
    const tags = world.biomesData.tags?.[cells.biomeCode[id]] ?? [];
    const temperature = world.grid.cells.temp?.[cells.g?.[id] ?? id] ?? 12;
    cells.livelihood[id] = getLivelihoodCode([
      agriculture / Math.max(1e-6, cells.capacity[id] ?? 0),
      getFishingSupport(cells, id, tags),
      getPastoralSupport(temperature, tags),
      getForagingSupport(temperature, tags)
    ]);
  }
}

function getFishingSupport(cells: WorldContext["pack"]["cells"], cellId: number, tags: readonly string[]): number {
  const river = Boolean(cells.r[cellId]);
  const coast = cells.t[cellId] === 1;
  const lake = Boolean(cells.harbor[cellId]) && !coast;
  const flux = cells.fl[cellId] ?? 0;
  const riverSupport = river ? 0.18 + Math.min(0.18, Math.log1p(flux) / 36) : 0;
  const coastalSupport = coast ? 0.34 + (cells.harbor[cellId] ? 0.1 : 0) : 0;
  const lakeSupport = lake ? 0.28 : 0;
  const wetlandSupport = tags.includes("wetland") ? 0.08 : 0;
  return Math.min(0.55, riverSupport + coastalSupport + lakeSupport + wetlandSupport);
}

function getPastoralSupport(temperature: number, tags: readonly string[]): number {
  if (temperature < -14) return 0;
  if (tags.includes("grassland") || tags.includes("nomadic")) return tags.includes("desert") ? 0.16 : 0.3;
  if (tags.includes("scrub")) return 0.2;
  if (tags.includes("dry")) return 0.12;
  return 0;
}

function getForagingSupport(temperature: number, tags: readonly string[]): number {
  if (temperature < -22) return 0;
  let support = 0;
  if (tags.includes("forest")) support += tags.includes("cold") ? 0.12 : 0.18;
  if (tags.includes("wetland")) support += 0.15;
  if (tags.includes("cold")) support += 0.08;
  if (tags.includes("scrub")) support += 0.06;
  return Math.min(0.28, support);
}

function getLivelihoodCode(supports: readonly number[]): number {
  const ranked = supports
    .map((support, index) => ({ support, index }))
    .sort((left, right) => right.support - left.support);
  const primary = ranked[0];
  const secondary = ranked[1];
  if (!primary || primary.support <= 0) return LIVELIHOOD_CODE.none;
  if (secondary && secondary.support >= primary.support * 0.6) return LIVELIHOOD_CODE.mixed;
  return [LIVELIHOOD_CODE.agriculture, LIVELIHOOD_CODE.fishing, LIVELIHOOD_CODE.pastoral, LIVELIHOOD_CODE.foraging][
    primary.index
  ]!;
}
