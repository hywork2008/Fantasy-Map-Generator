import { getCropResidueWorkPlan } from "./cropResidueWorkPlan";
import { getHusbandryLaborBudget } from "./husbandryLabor";
import type { HusbandryDemand } from "./husbandryTypes";
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
  getHusbandryMonthlyWorkDays,
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
import {
  ANNUAL_FEED_DM_KG_PER_HEAD,
  calculateWinterFeedShare,
  getLivestockHayPlan,
  getPastureGrowth,
  HAY_WORK_DAYS_PER_TONNE_DM
} from "./livestockFeedPolicy";
import { getAnnualLivestockFeedFactor, getRecentlyFedHerdShare, livestockFeedMonth } from "./livestockFeedState";
import {
  CAMELS_PER_RURAL_PERSON,
  CATTLE_FOLLOWERS_PER_DRAUGHT_OX,
  CLEARED_PASTURE_PER_CULTIVATED_HA,
  DEFAULT_ANNUAL_SOWN_SHARE,
  DRAUGHT_HEADS_PER_CULTIVATED_HA,
  DRAUGHT_HEADS_PER_RURAL_PERSON_MAX,
  FALLOW_GRAZING_DM_KG_PER_HA,
  GOAT_SHARE_OF_SMALL_STOCK_IN_BROWSE,
  getHorseDraughtShare,
  PASTORAL_HEADS_PER_RURAL_PERSON,
  PASTURE_FEED_UTILIZATION,
  SHEEP_PER_RURAL_PERSON
} from "./livestockHerdTargetPolicy";
import { readAgriculturalClimate } from "./seasonalCropClimate";
import { getWinterSlaughterWorkPlan } from "./winterSlaughter";
import { EXPERIMENTAL_CARCASS_PROFILES } from "./winterSlaughterPolicy";

// ---- Placeholder constants (calibration TBD, §9.3 policy; see module doc-comment for sourcing) ----

export type { HusbandryDemand } from "./husbandryTypes";

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

export function calculatePastureCeilingAreaHectares(world: Readonly<WorldContext>, cellId: number): number {
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
  // Clearance for fields also opened grazing; the natural biome cover no longer sets the limit.
  const cleared = Math.min(unclaimedArea, cultivated * CLEARED_PASTURE_PER_CULTIVATED_HA);
  return Math.max(unclaimedArea * ceiling, cleared) * terrainShare;
}

function getCellCultivatedHectares(world: Readonly<WorldContext>, cellId: number): number {
  return Math.max(0, world.pack.landUse?.cells[cellId]?.allocatedAreaHa ?? getCultivatedArea()[cellId] ?? 0);
}

function biomeSuits(
  world: Readonly<WorldContext>,
  cellId: number,
  good: Pick<Good, "biomeOutput" | "biomeOutputByTag">
) {
  const rate = resolveBiomeOutputRate(
    world.pack.cells.biomeCode[cellId] ?? 0,
    good.biomeOutput,
    good.biomeOutputByTag,
    world.biomesData
  );
  return Number.isFinite(rate) && rate > 0;
}

/**
 * Mixed-farming herd targets in real animals (livestockHerdTargetPolicy.ts). Draught follows the
 * ploughed land, the rest of the herd follows the rural people it feeds and clothes. Cattle, Sheep
 * and Horses are kept wherever people live; Goats, Camels and pastoral herds only where the biome suits.
 * Land, feed and herders limit these separately; this is the demand side only.
 */
export function getLivestockHerdTargets(world: Readonly<WorldContext>, cellId: number): Record<string, number> {
  const cells = world.pack.cells;
  if ((cells.h[cellId] ?? 0) < 20) return {};
  const people = Math.max(0, cells.pop[cellId] ?? 0) * Math.max(1, world.populationRate || 1);
  if (!(people > 0)) return {};
  const cultivated = getCellCultivatedHectares(world, cellId);
  const goods = new Map(
    getGoods()
      .filter(good => isGrazedLivestockGood(good.name) && isGoodEnabled(good))
      .map(good => [good.name, good])
  );
  const tags = world.biomesData.tags?.[cells.biomeCode[cellId] ?? 0] ?? [];
  const pastoral = tags.includes("grassland") || tags.includes("nomadic");
  // Every farming household keeps some cattle, sheep or horses; only goats and camels need their biome.
  const kept = (name: string) => goods.has(name);
  const suited = (name: string) => {
    const good = goods.get(name);
    return Boolean(good && biomeSuits(world, cellId, good));
  };
  const pastoralHeads = (name: string) =>
    pastoral && suited(name) ? people * (PASTORAL_HEADS_PER_RURAL_PERSON[name] ?? 0) : 0;
  const draught = Math.min(cultivated * DRAUGHT_HEADS_PER_CULTIVATED_HA, people * DRAUGHT_HEADS_PER_RURAL_PERSON_MAX);
  const horseShare = kept("Horses") ? getHorseDraughtShare(world.options?.historicalPeriod) : 0;
  const goatShare = suited("Goats") ? GOAT_SHARE_OF_SMALL_STOCK_IN_BROWSE : 0;
  const targets: Record<string, number> = {};
  if (kept("Cattle"))
    targets.Cattle = draught * (1 - horseShare) * (1 + CATTLE_FOLLOWERS_PER_DRAUGHT_OX) + pastoralHeads("Cattle");
  if (kept("Horses")) targets.Horses = draught * horseShare + pastoralHeads("Horses");
  const smallStock = people * SHEEP_PER_RURAL_PERSON;
  if (kept("Sheep")) targets.Sheep = smallStock * (1 - goatShare) + pastoralHeads("Sheep");
  if (goatShare > 0) targets.Goats = smallStock * goatShare;
  if (suited("Camels")) targets.Camels = people * CAMELS_PER_RURAL_PERSON;
  for (const [name, heads] of Object.entries(targets)) if (!(heads > 0)) delete targets[name];
  return targets;
}

/** Pasture hectares that feed one animal for a year at local growth, after utilization losses. */
export function getPastureHectaresPerHead(world: Readonly<WorldContext>, cellId: number, goodName: string): number {
  const need = ANNUAL_FEED_DM_KG_PER_HEAD[goodName] ?? 0;
  const growth = getPastureGrowth(world, cellId).annualKgPerHa * PASTURE_FEED_UTILIZATION;
  if (need > 0 && growth > 0) return need / growth;
  const density = getGrazedStockingDensity(goodName);
  return density > 0 ? 1 / density : 0;
}

/** Grazed fallow inside the cropland, as pasture-equivalent hectares of forage. */
export function getGrazedFallowPastureEquivalentHectares(world: Readonly<WorldContext>, cellId: number): number {
  const pastureKgPerHa = getPastureGrowth(world, cellId).annualKgPerHa;
  if (!(pastureKgPerHa > 0)) return 0;
  const fallow = getCellCultivatedHectares(world, cellId) * (1 - DEFAULT_ANNUAL_SOWN_SHARE);
  return (fallow * Math.min(FALLOW_GRAZING_DM_KG_PER_HA, pastureKgPerHa)) / pastureKgPerHa;
}

/**
 * Planning sizes pasture for the demand-based herd target, after the grazed fallow. Ordinary capacity
 * queries use the committed land contract and never read or seed a herd. The plan is bounded by
 * the ecological ceiling here and by herders/annual adjustment in DevelopmentPotential.
 */
export function calculateDesiredPastureAreaHectares(
  world: Readonly<WorldContext>,
  cellId: number,
  planning = false,
  bootstrapLaborDays?: number
): number {
  const reserved = world.pack.landUse?.cells[cellId]?.patches
    .filter(p => p.kind === "pasture" || p.kind === "wood_pasture")
    .reduce((s, p) => s + p.areaHa, 0);
  // New ledgers contain an explicit husbandry contract, including an intentional zero.
  if (!planning && world.pack.landUse?.cells[cellId]?.diagnostics.includes("resolved-livestock-land"))
    return reserved ?? 0;
  const ceiling = calculatePastureCeilingAreaHectares(world, cellId);
  if (ceiling <= 0) return 0;
  if (!planning && reserved !== undefined && reserved > 0) return Math.min(ceiling, reserved);
  const targets = Object.entries(getLivestockHerdTargets(world, cellId));
  if (!targets.length) return 0;
  const grossHa = targets.reduce(
    (sum, [name, heads]) => sum + heads * getPastureHectaresPerHead(world, cellId, name),
    0
  );
  const needHa = Math.max(0, grossHa - getGrazedFallowPastureEquivalentHectares(world, cellId));
  if (bootstrapLaborDays === undefined || (reserved !== undefined && reserved > 0)) return Math.min(ceiling, needHa);
  // A first plan without established pasture cannot claim more land than the residual labor can herd.
  const daysPerHa = targets.reduce(
    (sum, [name, heads]) =>
      sum + (heads / grossHa / HUSBANDRY_SPECIES_PROFILES[name].baselineHeadsPerHerder) * WORKABLE_DAYS_PER_ADULT,
    0
  );
  return Math.min(ceiling, needHa, daysPerHa > 0 ? Math.max(0, bootstrapLaborDays) / daysPerHa : needHa);
}

export interface GrazingLandAllocation {
  readonly goodName: string;
  readonly density: number;
  readonly areaHa: number;
  readonly capacityHeads: number;
}

/**
 * Splits one grazing budget (pasture plus grazed fallow) by each species' feed need at its target.
 * Capacity never exceeds the target: spare grass is not a reason to keep more animals.
 */
export function calculateGrazingLandAllocation(
  world: Readonly<WorldContext>,
  cellId: number,
  areaHa = calculateDesiredPastureAreaHectares(world, cellId) + getGrazedFallowPastureEquivalentHectares(world, cellId)
): GrazingLandAllocation[] {
  if (!(areaHa > 0) || !Number.isFinite(areaHa)) return [];
  const candidates = Object.entries(getLivestockHerdTargets(world, cellId)).flatMap(([name, heads]) => {
    const haPerHead = getPastureHectaresPerHead(world, cellId, name);
    return haPerHead > 0 ? [{ name, heads, haPerHead, needHa: heads * haPerHead }] : [];
  });
  const totalNeed = candidates.reduce((sum, row) => sum + row.needHa, 0);
  if (!(totalNeed > 0)) return [];
  const share = Math.min(1, areaHa / totalNeed);
  return candidates.map(row => ({
    goodName: row.name,
    density: 1 / row.haPerHead,
    areaHa: row.needHa * share,
    capacityHeads: row.heads * share
  }));
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
    calculateDesiredPastureAreaHectares(world, cellId) + getGrazedFallowPastureEquivalentHectares(world, cellId)
  );
  const hayWorkers = ((hayPlan.rawHarvestKg / 1000) * HAY_WORK_DAYS_PER_TONNE_DM) / WORKABLE_DAYS_PER_ADULT;
  for (let month = 0; month < 12; month++) weightedMonthlyLabor[month] += hayWorkers * hayPlan.harvestWeights[month];
  const careWorkers = requiredWorkers;
  requiredWorkers += hayWorkers;
  const slaughterPlan =
    world.options.winterLivestockSlaughter === "experimental-temperate" &&
    world.options.ruralEcosystemDetail !== "simplified"
      ? getWinterSlaughterWorkPlan(
          Object.fromEntries(
            Object.keys(EXPERIMENTAL_CARCASS_PROFILES).flatMap(species => {
              const herd = stock?.[`${cellId}:${species}`];
              return herd ? [[species, herd]] : [];
            })
          ),
          Array.from(readAgriculturalClimate(world, cellId).monthlyMeanTemperatureC),
          population * (world.populationRate ?? 1000)
        )
      : { annualDays: 0, monthlyWeights: Array(12).fill(0) };
  const slaughterWorkers = slaughterPlan.annualDays / WORKABLE_DAYS_PER_ADULT;
  requiredWorkers += slaughterWorkers;
  for (let month = 0; month < 12; month++)
    weightedMonthlyLabor[month] += slaughterWorkers * slaughterPlan.monthlyWeights[month];
  const residuePlan = getCropResidueWorkPlan(world, cellId, annualFeedNeedKg);
  const residueWorkers = residuePlan.annualDays / WORKABLE_DAYS_PER_ADULT;
  requiredWorkers += residueWorkers;
  for (let month = 0; month < 12; month++)
    weightedMonthlyLabor[month] += residueWorkers * residuePlan.monthlyWeights[month];
  return {
    residueWorkers,
    residueMonthlyLaborWeights: residuePlan.monthlyWeights,
    requiredWorkers,
    slaughterWorkers,
    slaughterMonthlyLaborWeights: slaughterPlan.monthlyWeights,
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

/** Annual-equivalent labor coverage for land/stock planning; production reads current care instead. */
export function getHusbandryWorkerFactor(cellId: number): number {
  const required = getHusbandryRequiredWorkers()[cellId] ?? 0;
  if (required <= 0) return 0;
  const assigned = getHusbandryWorkers()[cellId] ?? 0;
  return Math.min(1, assigned / required);
}

/** Actual care coverage this period; seasonal processing workers do not license unfunded care. */
export function getHusbandryCareFactor(cellId: number): number {
  const world = getWorldContext();
  const calendar = getHusbandryMonthlyWorkDays();
  if (!calendar.length || calendar.length !== world.pack.cells.i.length * 12) return getHusbandryWorkerFactor(cellId);
  const labor = getHusbandryLaborBudget(cellId, livestockFeedMonth() - 1, calculateHusbandryDemand(world, cellId));
  return labor.careRequiredDays > 0 ? Math.min(1, labor.careDays / labor.careRequiredDays) : 0;
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

/** Forage area for feed: maintained pasture plus grazed fallow, which is not extra physical land. */
export function getForageAreaHectares(cellId: number): number {
  return getPastureAreaUsedHectares(cellId) + getGrazedFallowPastureEquivalentHectares(getWorldContext(), cellId);
}

/** Per-species share of the one grazing budget, capped at the herd target, in real animals. */
export function getGrazedCarryingCapacity(
  cellId: number,
  good: Pick<Good, "name" | "biomeOutput" | "biomeOutputByTag">
): number {
  const world = getWorldContext();
  const area = getForageAreaHectares(cellId);
  const targets = calculateGrazingLandAllocation(world, cellId, area);
  const heads = targets.find(row => row.goodName === good.name)?.capacityHeads ?? 0;
  const annualNeedKg = targets.reduce(
    (sum, row) => sum + row.capacityHeads * (ANNUAL_FEED_DM_KG_PER_HEAD[row.goodName] ?? 0),
    0
  );
  const growth = getPastureGrowth(world, cellId);
  // Winter, not the annual total, limits the herd a cell can keep (E1 §7.45).
  const winterShare = calculateWinterFeedShare(annualNeedKg, area * growth.annualKgPerHa, growth.weights);
  const landShare = Math.min(getAnnualLivestockFeedFactor(cellId, area, targets), winterShare);
  // Where last year's herd went hungry, keepers winter as many as they actually fed, or the land's
  // share scaled by the fed share if larger: a small shortfall must not drop a growing herd's
  // capacity to its current size (E1 §7.61).
  const fedShare = getRecentlyFedHerdShare(cellId);
  if (fedShare === null) return heads * landShare;
  const stock = getOrCreateFaunaStockTable();
  const herdHeads = targets.reduce((sum, row) => {
    const herd = stock?.[`${cellId}:${row.goodName}`];
    return sum + (herd ? Math.max(0, herd.young) + Math.max(0, herd.breeding) + Math.max(0, herd.old) : 0);
  }, 0);
  const plannedHeads = targets.reduce((sum, row) => sum + row.capacityHeads * landShare, 0);
  const fedLimit = plannedHeads > 0 ? Math.max(fedShare, Math.min(1, (herdHeads * fedShare) / plannedHeads)) : 1;
  return heads * landShare * fedLimit;
}
