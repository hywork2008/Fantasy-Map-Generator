/**
 * Perennial horticulture. The historic filename and public viticulture exports
 * remain because the economy slice already persists the associated labour
 * columns under those names. Vines and orchards now share one climate-first,
 * land- and labour-gated production path.
 */

import {
  classifyAgriculturalClimateZone,
  classifySeasonRegion,
  getCropCalendar,
  type MonthlyWeights,
  SEASON_REGION_PROFILES
} from "../../../data/cropCalendars";
import {
  getPerennialCropSuitability,
  PERENNIAL_CROP_PROFILES,
  type PerennialCropProfile
} from "../../../data/perennialCrops";
import type { WorldContext } from "../../hostCore";
import { getLatitude } from "../../hostUtils";
import {
  getCultivatedArea,
  getGoods,
  getIrrigatedArea,
  getIrrigationDeliveredWater,
  getViticultureRequiredWorkers,
  getViticultureWorkers,
  getWorldContext
} from "../economyContext";
import {
  calculateBurgBuiltAreaHectares,
  calculatePhysicalAreaHectares,
  calculateTerrainWorkableShare,
  getCellSoilType,
  WORKABLE_DAYS_PER_ADULT
} from "./agriculturalLandUse";
import { type Good, isGoodEnabled } from "./goods-generator";
import { getPastureAreaUsedHectares } from "./husbandry";

export const GRAPE_YIELD_PER_HECTARE_PER_MONTH = PERENNIAL_CROP_PROFILES.Grapes.yieldLotsPerHectarePerMonth;

export interface ViticultureDemand {
  readonly requiredWorkers: number;
  readonly value: number;
}

/** Monthly orchard/vineyard labour, in adult work-days, before worker allocation. */
export function getPerennialMonthlyLabourDays(cellId: number, month: number): number {
  const world = getWorldContext();
  return getPerennialCropMix(world, cellId).reduce((total, entry) => {
    const weight = getPerennialMonthlyLaborWeights(world, cellId, [entry])[month];
    return total + entry.areaHectares * entry.profile.laborDaysPerHectare * weight;
  }, 0);
}

export interface PerennialCropMixEntry {
  readonly good: Good;
  readonly profile: PerennialCropProfile;
  readonly suitability: number;
  readonly areaHectares: number;
}

function getPerennialProfile(good: Good): PerennialCropProfile | undefined {
  // The name fallback lets pre-migration Grapes participate as soon as the
  // feature is loaded, and preserves compatibility with focused unit fixtures.
  return good.perennialCrop ?? PERENNIAL_CROP_PROFILES[good.name as keyof typeof PERENNIAL_CROP_PROFILES];
}

function getPerennialCandidates(world: Readonly<WorldContext>, cellId: number): PerennialCropMixEntry[] {
  const cells = world.pack.cells;
  if ((cells.h[cellId] ?? 0) < 20) return [];
  const biomeCode = cells.biomeCode[cellId] ?? 0;
  if ((world.biomesData.habitability?.[biomeCode] ?? 0) <= 0) return [];

  const gridCellId = cells.g?.[cellId] ?? cellId;
  const temperature = world.grid?.cells?.temp?.[gridCellId] ?? 12;
  const precipitation = world.grid?.cells?.prec?.[gridCellId] ?? 45;
  const soil = getCellSoilType(world, cellId);
  const irrigatedArea = getIrrigatedArea()[cellId] ?? 0;
  const irrigationSupplement = irrigatedArea > 0 ? (getIrrigationDeliveredWater()[cellId] ?? 0) / irrigatedArea : 0;
  const physicalHectares = calculatePhysicalAreaHectares(world, cellId);
  const unclaimedArea = Math.max(
    0,
    physicalHectares -
      (getCultivatedArea()[cellId] ?? 0) -
      getPastureAreaUsedHectares(cellId) -
      calculateBurgBuiltAreaHectares(world, cellId)
  );
  if (unclaimedArea <= 0) return [];

  const terrainShare = calculateTerrainWorkableShare(cells.h[cellId] ?? 0);
  const realPopulation = Math.max(0, cells.pop[cellId] ?? 0) * Math.max(1, world.populationRate || 1);
  if (realPopulation <= 0) return [];

  const candidates: PerennialCropMixEntry[] = [];
  for (const good of getGoods()) {
    if (!isGoodEnabled(good)) continue;
    const profile = getPerennialProfile(good);
    if (!profile) continue;
    const suitability = getPerennialCropSuitability(profile, temperature, precipitation, soil, irrigationSupplement);
    if (suitability <= 0.1) continue;
    const ceiling = unclaimedArea * terrainShare * profile.maximumLandShare * suitability;
    const desired = Math.min(ceiling, realPopulation * profile.areaHectaresPerPerson);
    if (desired > 0) candidates.push({ good, profile, suitability, areaHectares: desired });
  }
  return candidates;
}

/**
 * One dominant perennial crop represents a cell's managed orchard/vineyard.
 * This avoids overlapping every climate-compatible orchard on the same land;
 * a stable tiny tie-break keeps neighbouring viable regions varied.
 */
export function getPerennialCropMix(world: Readonly<WorldContext>, cellId: number): readonly PerennialCropMixEntry[] {
  const candidates = getPerennialCandidates(world, cellId);
  if (!candidates.length) return [];
  const selected = candidates.slice(1).reduce<PerennialCropMixEntry>((best, candidate) => {
    const candidateScore =
      candidate.suitability * candidate.good.value + stablePerennialNoise(cellId, candidate.good.i);
    const bestScore = best.suitability * best.good.value + stablePerennialNoise(cellId, best.good.i);
    return candidateScore > bestScore ? candidate : best;
  }, candidates[0]);
  return [selected];
}

function stablePerennialNoise(cellId: number, goodId: number): number {
  let hash = (cellId + 1) * 1103515245 + (goodId + 1) * 12345;
  hash = (hash ^ (hash >>> 16)) * 2246822519;
  return (((hash ^ (hash >>> 13)) >>> 0) / 0xffffffff) * 0.02;
}

export function calculateViticultureDemand(world: Readonly<WorldContext>, cellId: number): ViticultureDemand {
  const mix = getPerennialCropMix(world, cellId);
  if (!mix.length) return { requiredWorkers: 0, value: 0 };
  const requiredWorkers = mix.reduce(
    (total, entry) => total + (entry.areaHectares * entry.profile.laborDaysPerHectare) / WORKABLE_DAYS_PER_ADULT,
    0
  );
  const value =
    mix.reduce((total, entry) => total + entry.good.value * entry.areaHectares, 0) /
    Math.max(
      1e-6,
      mix.reduce((total, entry) => total + entry.areaHectares, 0)
    );
  return { requiredWorkers, value };
}

/** Normalized orchard/vineyard work distribution for the cell's selected perennial crop. */
export function getPerennialMonthlyLaborWeights(
  world: Readonly<WorldContext>,
  cellId: number,
  mix = getPerennialCropMix(world, cellId)
): MonthlyWeights {
  if (!mix.length)
    return [1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12];
  const cells = world.pack.cells;
  const point = cells.p?.[cellId];
  const gridCellId = cells.g?.[cellId] ?? cellId;
  if (!point || gridCellId < 0) {
    return [1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12];
  }
  const region = classifySeasonRegion(getLatitude(point[1], world.mapCoordinates, world.graphHeight));
  const zone = classifyAgriculturalClimateZone({
    annualTemperatureC: world.grid.cells.temp?.[gridCellId] ?? 12,
    annualPrecipitation: world.grid.cells.prec?.[gridCellId] ?? 45,
    irrigated: (getIrrigatedArea()[cellId] ?? 0) > 0
  });
  const weighted = Array.from({ length: 12 }, () => 0);
  const totalAnnualDays = mix.reduce(
    (total, entry) => total + entry.areaHectares * entry.profile.laborDaysPerHectare,
    0
  );
  for (const entry of mix) {
    const share = (entry.areaHectares * entry.profile.laborDaysPerHectare) / Math.max(1e-6, totalAnnualDays);
    const calendar = getCropCalendar(SEASON_REGION_PROFILES[region], zone, entry.profile.calendar);
    for (let month = 0; month < 12; month++) weighted[month] += share * calendar.labourWeights[month];
  }
  const total = weighted.reduce((sum, value) => sum + value, 0);
  if (!(total > 0))
    return [1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12, 1 / 12];
  return weighted.map(value => value / total) as unknown as MonthlyWeights;
}

export function getViticultureWorkerFactor(cellId: number): number {
  const required = getViticultureRequiredWorkers()[cellId] ?? 0;
  if (required <= 0) return 0;
  return Math.min(1, (getViticultureWorkers()[cellId] ?? 0) / required);
}

/** Total orchard and vineyard area currently maintained at this cell. */
export function getVineyardAreaUsedHectares(cellId: number): number {
  const mix = getPerennialCropMix(getWorldContext(), cellId);
  return mix.reduce((total, entry) => total + entry.areaHectares, 0) * getViticultureWorkerFactor(cellId);
}

export function getPerennialHarvestOutputs(cellId: number): readonly { goodId: number; amount: number }[] {
  const workerFactor = getViticultureWorkerFactor(cellId);
  if (workerFactor <= 0) return [];
  const world = getWorldContext();
  return getPerennialCropMix(world, cellId).map(entry => {
    // Retain the established minor river bonus for vineyards only; it is a
    // yield modifier, never a climate or biome eligibility shortcut.
    const riverBonus = entry.good.name === "Grapes" && world.pack.cells.r?.[cellId] ? 1.1 : 1;
    return {
      goodId: entry.good.i,
      amount: entry.areaHectares * workerFactor * entry.profile.yieldLotsPerHectarePerMonth * riverBonus
    };
  });
}

/** Compatibility wrapper retained for callers and tests that display grapes specifically. */
export function getGrapeHarvestOutput(cellId: number): number {
  const grapes = getGoods().find(good => good.name === "Grapes");
  if (!grapes) return 0;
  return getPerennialHarvestOutputs(cellId).find(output => output.goodId === grapes.i)?.amount ?? 0;
}
