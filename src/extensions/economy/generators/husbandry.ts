/**
 * Open-pasture husbandry: one shared land budget for Cattle, Sheep, Goats, Horses and Camels.
 * Pig, Chicken, Cats and Dogs retain their separate yard/woodland models.
 *
 * Species divide pasture by relative habitat suitability: the biome rate divided by that
 * species' best biome rate. This dimensionless proxy is invariant to market-lot size and does
 * not compare raw monthly flows with standing animal stocks. These are model allocation weights,
 * not historical herd shares or extra fodder.
 * The partition does not read live herd counts, so lazy stock seeding and query order cannot
 * change another species' capacity. Existing animals still need herders even above their target.
 *
 * Legacy pasture is labor-gated. Resolved land ledgers already account for maintained pasture;
 * that footprint is used once, without applying worker coverage to the land a second time.
 * Output is gated by herder and recent feed coverage. The separate feed ledger accounts for
 * seasonal pasture, hay and paid Fodder; crop residues are not inferred from this partition.
 *
 * Working-dog multipliers retain the existing policy (Arnott et al. 2014 and the model baselines
 * in biome-goods-producer-ecosystem.md). The fauna stock lookup is local to avoid a cycle with
 * faunaPopulation.ts, which imports the pasture capacity functions.
 */

import { resolveBiomeOutputRate } from "../../../data/biomeEconomy";
import type { MonthlyWeights } from "../../../data/cropCalendars";
import type { BiomeTag } from "../../../types/biome";
import type { WorldContext } from "../../hostCore";
import {
  getCultivatedArea,
  getGoods,
  getHusbandryRequiredWorkers,
  getHusbandryWorkers,
  getOrCreateFaunaStockTable,
  getWorldContext
} from "../economyContext";
import {
  calculateBurgBuiltAreaHectares,
  calculatePhysicalAreaHectares,
  calculateTerrainWorkableShare,
  WORKABLE_DAYS_PER_ADULT
} from "./agriculturalLandUse";
import type { Good } from "./goods-generator";
import { isGoodEnabled } from "./goods-generator";
import { ANNUAL_FEED_DM_KG_PER_HEAD, getLivestockHayPlan, HAY_WORK_DAYS_PER_TONNE_DM } from "./livestockFeedPolicy";
import { getAnnualLivestockFeedFactor } from "./livestockFeedState";

// ---- Placeholder constants (calibration TBD, §9.3 policy; see module doc-comment for sourcing) ----

/** Pasture land-suitability ceiling by biome tag — mirrors agriculturalLandUse.ts's methodology. */
const PASTURE_BIOME_TAG_CEILING: Partial<Record<BiomeTag, number>> = {
  grassland: 0.85,
  nomadic: 0.75,
  scrub: 0.45,
  dry: 0.3,
  mountain: 0.25
};
/** Marginal grazing ceiling for land without a dedicated pasture-suitable tag. */
const PASTURE_DEFAULT_CEILING = 0.1;

/**
 * Hectares of pasture one REAL resident's worth of local demand could realistically keep stocked
 * — mirrors viticulture.ts's `VINEYARD_AREA_HECTARES_PER_PERSON` in spirit (see module doc-comment's
 * "requiredWorkers redefinition" entry), but per actual person, not per raw `cells.pop` unit. Found
 * 2026-08-07 (real-map verification via Playwright after this constant still produced a near-empty
 * herd everywhere): `cells.pop[cellId]` is a "population point" — `agriculturalLandUse.ts`'s own
 * `currentPeople = cells.pop[cellId] * populationRate` is the established real-headcount conversion
 * (`populationRate` was 1000 on a real generated map, with `cells.pop` typically 1-20 per cell — i.e.
 * a raw-point-based desiredArea of "population x 1 ha" was on the order of a few HECTARES per cell,
 * not a few THOUSAND, making every grazed species' capacity round to ~0). Multiplying by
 * `populationRate` first fixes the unit mismatch; this constant itself stays a placeholder,
 * calibration TBD (§9.3). `viticulture.ts`'s `VINEYARD_AREA_PER_POPULATION_POINT` had the identical
 * raw-`cells.pop` pattern — confirmed under-scaled the same way and fixed the same day
 * (renamed `VINEYARD_AREA_HECTARES_PER_PERSON`) as part of the labour-scarcity investigation in
 * docs/plan/fauna-biome-realism.md §2.5.
 */
const HUSBANDRY_LAND_HECTARES_PER_PERSON = 1;

/**
 * Heads sustainably supported per hectare of actively-used pasture (ecological ceiling,
 * independent of herder labour). Order-of-magnitude estimate from general historical/extensive-
 * grazing figures, not a single verified study — flagged for recalibration.
 */
export const STOCKING_DENSITY_PER_HECTARE: Readonly<Record<string, number>> = {
  Cattle: 0.5,
  Horses: 0.4,
  Sheep: 3,
  Goats: 2.5,
  Camels: 0.15
};

export function getGrazedStockingDensity(goodName: string): number {
  return STOCKING_DENSITY_PER_HECTARE[goodName] ?? 0;
}

export interface HusbandrySpeciesProfile {
  /** Heads one full-time herder can manage without dogs (§10.3, user-confirmed 2026-08-06). */
  readonly baselineHeadsPerHerder: number;
  /** Multiplier at full working-dog coverage (Arnott et al. 2014's reported ceiling where available). */
  readonly dogMultiplier: number;
  /** Routine care is year-round; annual special tasks create the seasonal peak. */
  readonly routineCareMonthlyWeights: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ];
  readonly seasonalEventMonths: readonly number[];
  /** Share of annual herding work reserved for shearing, calving, movement, and winter-feed events. */
  readonly seasonalEventLaborShare: number;
}

const ROUTINE_CARE_MONTHLY_WEIGHTS = [
  1 / 12,
  1 / 12,
  1 / 12,
  1 / 12,
  1 / 12,
  1 / 12,
  1 / 12,
  1 / 12,
  1 / 12,
  1 / 12,
  1 / 12,
  1 / 12
] as const;

const HUSBANDRY_SPECIES_PROFILES: Record<string, HusbandrySpeciesProfile> = {
  Sheep: {
    baselineHeadsPerHerder: 200,
    dogMultiplier: 10,
    routineCareMonthlyWeights: ROUTINE_CARE_MONTHLY_WEIGHTS,
    seasonalEventMonths: [5, 9],
    seasonalEventLaborShare: 0.2
  }, // 200 * 10 = 2,000, matches Arnott's sheep ceiling
  Goats: {
    baselineHeadsPerHerder: 180,
    dogMultiplier: 10,
    routineCareMonthlyWeights: ROUTINE_CARE_MONTHLY_WEIGHTS,
    seasonalEventMonths: [5, 9],
    seasonalEventLaborShare: 0.2
  }, // flocking browser, same multiplier class as Sheep
  Cattle: {
    baselineHeadsPerHerder: 60,
    dogMultiplier: 8,
    routineCareMonthlyWeights: ROUTINE_CARE_MONTHLY_WEIGHTS,
    seasonalEventMonths: [4, 10],
    seasonalEventLaborShare: 0.2
  }, // 60 * 8 = 480, ~matches Arnott's 500-head cattle ceiling
  Horses: {
    baselineHeadsPerHerder: 40,
    dogMultiplier: 8,
    routineCareMonthlyWeights: ROUTINE_CARE_MONTHLY_WEIGHTS,
    seasonalEventMonths: [4, 10],
    seasonalEventLaborShare: 0.2
  }, // needs more individual attention than cattle
  Camels: {
    baselineHeadsPerHerder: 50,
    dogMultiplier: 8,
    routineCareMonthlyWeights: ROUTINE_CARE_MONTHLY_WEIGHTS,
    seasonalEventMonths: [3, 9],
    seasonalEventLaborShare: 0.2
  }
};

export function getHusbandrySpeciesProfile(goodName: string): HusbandrySpeciesProfile | undefined {
  return HUSBANDRY_SPECIES_PROFILES[goodName];
}

/** Working dogs needed per herder for "full" dog-team coverage — a secondary sizing knob (typical
 * sheepdog operations run 2-4 dogs per musterer), not the headline capacity number from §10.3. */
const DOGS_PER_HERDER_FOR_FULL_COVERAGE = 3;

const DOGS_GOOD_NAME = "Dogs";
const GRAZED_LIVESTOCK_GOOD_NAMES = new Set(Object.keys(HUSBANDRY_SPECIES_PROFILES));

/** True for open-pasture species husbandry.ts gates by land+labour (see module doc-comment scope). */
export function isGrazedLivestockGood(goodName: string): boolean {
  return GRAZED_LIVESTOCK_GOOD_NAMES.has(goodName);
}

export interface HusbandryDemand {
  /** Aggregate herders this cell could use across every grazed species present in its biome. */
  readonly requiredWorkers: number;
  /** Additional haymaking crew, unaffected by herding-dog efficiency. */
  readonly hayWorkers?: number;
  readonly hayMonthlyLaborWeights?: readonly number[];
  readonly careWorkers?: number;
  /** Care-headcount-weighted average good.value, for the greedy allocator's value-ranking (§3.1). */
  readonly value: number;
  /** Normalized distribution of this cell's annual herding work, when the cell has a herd. */
  readonly monthlyLaborWeights?: MonthlyWeights;
}

/**
 * `cellId:speciesKey`-keyed lookup duplicated from faunaPopulation.ts's stock table format
 * (see module doc-comment for why this isn't an import).
 */
function getDogsHeadcount(cellId: number): number {
  const table = getOrCreateFaunaStockTable();
  if (!table) return 0;
  const cohorts = table[`${cellId}:${DOGS_GOOD_NAME}`];
  if (!cohorts) return 0;
  return cohorts.young + cohorts.breeding + cohorts.old;
}

function calculatePastureCeilingAreaHectares(world: Readonly<WorldContext>, cellId: number): number {
  const cells = world.pack.cells;
  const physicalHectares = calculatePhysicalAreaHectares(world, cellId);
  if (physicalHectares <= 0) return 0;

  const biomeCode = cells.biomeCode[cellId] ?? 0;
  const habitability = Math.max(0, world.biomesData.habitability[biomeCode] ?? 0);
  if (habitability <= 0) return 0;

  const cultivated = world.pack.landUse?.cells[cellId]?.allocatedAreaHa ?? getCultivatedArea()[cellId] ?? 0;
  const burgArea = calculateBurgBuiltAreaHectares(world, cellId);
  const unclaimedArea = Math.max(0, physicalHectares - cultivated - burgArea);
  if (unclaimedArea <= 0) return 0;

  const tags = world.biomesData.tags?.[biomeCode] ?? [];
  const ceiling = tags.reduce(
    (max, tag) => Math.max(max, PASTURE_BIOME_TAG_CEILING[tag] ?? 0),
    PASTURE_DEFAULT_CEILING
  );
  const terrainShare = calculateTerrainWorkableShare(cells.h[cellId] ?? 0);
  return unclaimedArea * terrainShare * ceiling;
}

/** The land-suitability ceiling clamped by population-scaled local demand — mirrors
 * viticulture.ts's `calculateDesiredVineyardAreaHectares()` (see module doc-comment). */
export function calculateDesiredPastureAreaHectares(
  world: Readonly<WorldContext>,
  cellId: number,
  planning = false
): number {
  const reserved = world.pack.landUse?.cells[cellId]?.patches
    .filter(p => p.kind === "pasture" || p.kind === "wood_pasture")
    .reduce((s, p) => s + p.areaHa, 0);
  // New ledgers contain an explicit husbandry contract; legacy ledgers retain old suitability.
  if (!planning && world.pack.landUse?.cells[cellId]?.diagnostics.includes("resolved-livestock-land"))
    return reserved ?? 0;
  const ceiling = calculatePastureCeilingAreaHectares(world, cellId);
  if (ceiling <= 0) return 0;
  const populationPoints = Math.max(0, world.pack.cells.pop[cellId] ?? 0);
  const realPopulation = populationPoints * Math.max(1, world.populationRate || 1);
  return Math.min(ceiling, realPopulation * HUSBANDRY_LAND_HECTARES_PER_PERSON);
}

export interface GrazingLandAllocation {
  readonly goodName: string;
  readonly density: number;
  readonly areaHa: number;
  readonly capacityHeads: number;
}

/** Allocates a single shared pasture budget without seeding, clipping or otherwise changing herds. */
export function calculateGrazingLandAllocation(
  world: Readonly<WorldContext>,
  cellId: number,
  areaHa = calculateDesiredPastureAreaHectares(world, cellId)
): GrazingLandAllocation[] {
  if (!(areaHa > 0) || !Number.isFinite(areaHa)) return [];
  const biome = world.pack.cells.biomeCode[cellId] ?? 0;
  const goods: Pick<Good, "name" | "biomeOutput" | "biomeOutputByTag">[] = getGoods().filter(isGoodEnabled);
  const candidates = goods.flatMap(good => {
    const density = getGrazedStockingDensity(good.name);
    if (!(density > 0)) return [];
    const rate = resolveBiomeOutputRate(biome, good.biomeOutput, good.biomeOutputByTag, world.biomesData);
    const peakRate = [
      ...Object.values(good.biomeOutput ?? {}),
      ...Object.values(good.biomeOutputByTag ?? {})
    ].reduce<number>((peak, value) => Math.max(peak, Number.isFinite(value) ? (value ?? 0) : 0), 0);
    const weight = peakRate > 0 ? rate / peakRate : 0;
    return Number.isFinite(weight) && weight > 0 ? [{ name: good.name, density, weight }] : [];
  });
  const totalWeight = candidates.reduce((sum, row) => sum + row.weight, 0);
  if (!(totalWeight > 0)) return [];
  return candidates.map(row => {
    const area = (areaHa * row.weight) / totalWeight;
    return { goodName: row.name, density: row.density, areaHa: area, capacityHeads: area * row.density };
  });
}

/** Existing herds use one herder/dog budget; land targets are only a pre-seeding fallback. */
export function calculateHusbandryDemand(world: Readonly<WorldContext>, cellId: number): HusbandryDemand {
  const cells = world.pack.cells;
  const population = Math.max(0, cells.pop[cellId] ?? 0);
  const plannedHeads = new Map(
    (population > 0 ? calculateGrazingLandAllocation(world, cellId) : []).map(row => [row.goodName, row.capacityHeads])
  );
  const goodsByName = new Map(getGoods().map(good => [good.name, good]));
  const stock = getOrCreateFaunaStockTable();
  const perGoodDemand: { careHeads: number; profile: HusbandrySpeciesProfile }[] = [];
  let totalCareHeads = 0;
  let workersNoDogs = 0;
  let weightedValue = 0;
  let annualFeedNeedKg = 0;

  // Habitat and land constrain new targets, not the care owed to animals already present.
  for (const [name, profile] of Object.entries(HUSBANDRY_SPECIES_PROFILES)) {
    const herd = stock?.[`${cellId}:${name}`];
    const existingHeads = herd ? Math.max(0, herd.young) + Math.max(0, herd.breeding) + Math.max(0, herd.old) : 0;
    // An observed herd (including an empty cohort) needs care for its actual animals.
    // Ecological capacity is not a second herd or a standing job vacancy. Until the first
    // stock is seeded, retain the land plan so initial occupation allocation can run.
    const careHeads = herd ? existingHeads : (plannedHeads.get(name) ?? 0);
    if (!(careHeads > 0)) continue;
    totalCareHeads += careHeads;
    annualFeedNeedKg += careHeads * (ANNUAL_FEED_DM_KG_PER_HEAD[name] ?? 0);
    workersNoDogs += careHeads / profile.baselineHeadsPerHerder;
    weightedValue += careHeads * (goodsByName.get(name)?.value ?? 0);
    perGoodDemand.push({ careHeads, profile });
  }

  if (!perGoodDemand.length) return { requiredWorkers: 0, value: 0 };

  const dogsNeededForFullCoverage = workersNoDogs * DOGS_PER_HERDER_FOR_FULL_COVERAGE;
  const dogCoverageFraction =
    dogsNeededForFullCoverage > 0 ? Math.min(1, getDogsHeadcount(cellId) / dogsNeededForFullCoverage) : 0;

  let requiredWorkers = 0;
  const weightedMonthlyLabor = Array.from({ length: 12 }, () => 0);
  for (const { careHeads, profile } of perGoodDemand) {
    const effectiveHeadsPerHerder =
      profile.baselineHeadsPerHerder * (1 + (profile.dogMultiplier - 1) * dogCoverageFraction);
    const speciesWorkers = careHeads / effectiveHeadsPerHerder;
    requiredWorkers += speciesWorkers;
    const weights = getHusbandryMonthlyLaborWeights(profile);
    for (let month = 0; month < 12; month++) weightedMonthlyLabor[month] += speciesWorkers * weights[month];
  }

  const hayPlan = getLivestockHayPlan(
    world,
    cellId,
    annualFeedNeedKg,
    calculateDesiredPastureAreaHectares(world, cellId)
  );
  const hayWorkers = ((hayPlan.rawHarvestKg / 1000) * HAY_WORK_DAYS_PER_TONNE_DM) / WORKABLE_DAYS_PER_ADULT;
  for (let month = 0; month < 12; month++) weightedMonthlyLabor[month] += hayWorkers * hayPlan.harvestWeights[month];
  const careWorkers = requiredWorkers;
  requiredWorkers += hayWorkers;
  return {
    requiredWorkers,
    hayWorkers,
    hayMonthlyLaborWeights: hayPlan.harvestWeights,
    careWorkers,
    value: weightedValue / totalCareHeads,
    monthlyLaborWeights: normalizeMonthlyWeights(weightedMonthlyLabor)
  };
}

function getHusbandryMonthlyLaborWeights(profile: HusbandrySpeciesProfile): MonthlyWeights {
  const weights = Array.from({ length: 12 }, (_, month) => {
    return profile.routineCareMonthlyWeights[month] * (1 - profile.seasonalEventLaborShare);
  });
  const eventShare = profile.seasonalEventMonths.length
    ? profile.seasonalEventLaborShare / profile.seasonalEventMonths.length
    : 0;
  for (const month of profile.seasonalEventMonths) weights[month % 12] += eventShare;
  return normalizeMonthlyWeights(weights);
}

function normalizeMonthlyWeights(weights: readonly number[]): MonthlyWeights {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return ROUTINE_CARE_MONTHLY_WEIGHTS;
  return weights.map(value => value / total) as unknown as MonthlyWeights;
}

/** 0..1 labour-sufficiency ratio gating grazed-species output at `cellId` (mirrors getViticultureWorkerFactor). */
export function getHusbandryWorkerFactor(cellId: number): number {
  const required = getHusbandryRequiredWorkers()[cellId] ?? 0;
  if (required <= 0) return 0;
  const assigned = getHusbandryWorkers()[cellId] ?? 0;
  return Math.min(1, assigned / required);
}

/**
 * One grazing footprint for the whole cell, also subtracted once from wild habitat.
 * Resolved ledgers supply their maintained pasture; legacy suitability is labor-gated here.
 */
export function getPastureAreaUsedHectares(cellId: number): number {
  const world = getWorldContext();
  const desiredArea = calculateDesiredPastureAreaHectares(world, cellId);
  if (desiredArea <= 0) return 0;
  if (world.pack.landUse?.cells[cellId]?.diagnostics.includes("resolved-livestock-land")) return desiredArea;
  return desiredArea * getHusbandryWorkerFactor(cellId);
}

/** Per-species share of the one maintained pasture budget, expressed in real animals. */
export function getGrazedCarryingCapacity(
  cellId: number,
  good: Pick<Good, "name" | "biomeOutput" | "biomeOutputByTag">
): number {
  const world = getWorldContext();
  const area = getPastureAreaUsedHectares(cellId);
  const targets = calculateGrazingLandAllocation(world, cellId, area);
  const heads = targets.find(row => row.goodName === good.name)?.capacityHeads ?? 0;
  return heads * getAnnualLivestockFeedFactor(cellId, area, targets);
}
