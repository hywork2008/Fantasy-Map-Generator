import type { WorldContext } from "../context/worldContext";
import {
  getStapleCropSuitability,
  STAPLE_CROP_LIST,
  type StapleCropKind,
  type StapleSoilType
} from "../data/stapleCrops";

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

  for (const cellId of cells.i) {
    const terrainCapacity = cells.capacity[cellId] ?? 0;
    if (terrainCapacity <= 0 || (cells.h[cellId] ?? 0) < 20) continue;

    const tags = world.biomesData.tags[cells.biomeCode[cellId] ?? 0] ?? [];
    const temperature = world.grid.cells.temp[cells.g[cellId] ?? cellId] ?? 12;
    const precipitation = world.grid.cells.prec[cells.g[cellId] ?? cellId] ?? 45;
    const soil = getCellSoil(tags, Boolean(cells.r[cellId]));
    const agriculture = getAgricultureSupport(temperature, precipitation, soil, tags);
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

function getAgricultureSupport(
  temperature: number,
  precipitation: number,
  soil: StapleSoilType,
  tags: readonly string[]
): number {
  if (tags.includes("desert")) return 0;
  const main = bestCropSuitability("cereal", temperature, precipitation, soil);
  const root = bestCropSuitability("tuber", temperature, precipitation, soil);
  const legume = bestCropSuitability("legume", temperature, precipitation, soil);
  const staple = Math.max(main, root);

  // A staple and a legume represent the normal rotation. A lone staple is
  // viable but deliberately receives a lower ceiling for soil exhaustion.
  if (staple > 0 && legume > 0) return 0.16 + (staple * 0.67 + legume * 0.33) * 0.84;
  if (staple > 0) return 0.08 + staple * 0.52;
  if (legume > 0) return 0.05 + legume * 0.28;
  return 0;
}

function bestCropSuitability(
  kind: StapleCropKind,
  temperature: number,
  precipitation: number,
  soil: StapleSoilType
): number {
  let best = 0;
  for (const crop of STAPLE_CROP_LIST) {
    if (crop.kind !== kind) continue;
    best = Math.max(best, getStapleCropSuitability(crop, temperature, precipitation, soil));
  }
  return best;
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

function getCellSoil(tags: readonly string[], hasRiver: boolean): StapleSoilType {
  if (hasRiver) return "alluvial";
  if (tags.includes("wetland")) return "clay";
  if (tags.includes("forest")) return "humus";
  if (tags.includes("desert")) return "sandy";
  if (tags.includes("mountain")) return "thin";
  return "loam";
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
