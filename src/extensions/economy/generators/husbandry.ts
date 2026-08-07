/**
 * Husbandry — docs/plan/biome-goods-producer-ecosystem.md §5.4 (Phase 3).
 *
 * Sizes liveAnimal domesticated carrying capacity (§4.2) from real pasture land and herder labour
 * instead of Phase 2's interim "flat rate x 24 months" proxy, and gives husbandry a seat in the
 * rural occupation allocator's greedy loop (§3.1) alongside fishing and viticulture(Wine).
 *
 * Scope: only open-pasture, herded species participate — Cattle/Sheep/Goats/Horses/Camels
 * (`GRAZED_LIVESTOCK_GOOD_NAMES` below). Pig/Chicken/Cats/Dogs stay on Phase 1/2's population-driven
 * flat rate (yard/woodland animals that don't compete for dedicated pasture or herder labour the
 * way an open-range flock/herd does) — a deliberate scope narrowing from §5.4's "liveAnimal家畜"
 * wording, documented in docs/plan/biome-goods-producer-ecosystem.md §0's Phase 3 entry.
 *
 * Two independent land/labour effects compose multiplicatively rather than as a separate min():
 *   - `pastureAreaUsed(cell) = pastureCeilingArea(cell) x husbandryWorkerFactor(cell)` — an
 *     understaffed cell doesn't just harvest less this month (workerFactor gates the flat rate in
 *     production-utils.ts, same as Wine), it also never gets the standing herd its land could
 *     support, because pastureAreaUsed feeds `getGrazedCarryingCapacity()` too. Both effects are
 *     intentional: chronic understaffing suppresses this month's yield AND next year's ceiling.
 *   - `getWildCarryingCapacity()` (faunaPopulation.ts) subtracts `pastureAreaUsed` from its
 *     wildHabitatArea, so wildlife gets back whatever land husbandry isn't actually using.
 *
 * Herder-per-head labour requirement (`HUSBANDRY_SPECIES_PROFILES`) folds in a working-dog
 * multiplier (docs/temp/herding-dogs.md, Arnott et al. 2014, Univ. of Sydney — a trained handler +
 * dog team musters up to 2,000 sheep / 500 cattle). Sheep/Cattle baselines (dogless headcount per
 * herder) are order-of-magnitude estimates from general pastoral-economy literature, user-confirmed
 * 2026-08-06 (docs/plan/biome-goods-producer-ecosystem.md §10.3) rather than a single citation —
 * Goats/Horses/Camels extend the same relative-ordering placeholder policy (§9.3) since no
 * species-specific study was found for them. Dog coverage is read from `Dogs`' own fauna stock
 * (faunaPopulation.ts) via a locally-duplicated stock-key lookup, not an import of that module —
 * husbandry.ts is imported BY faunaPopulation.ts (for the grazed-species capacity branch), so
 * importing back would cycle; see the "Local stand-ins" precedent in ruralOccupationAllocation.ts.
 *
 * `requiredWorkers` history (both fixes 2026-08-07, docs/plan/fauna-biome-realism.md §2.4/§3 Phase
 * B/案B1) — two problems, now both resolved by the SAME change:
 *   1. Pure land-gating alone under-constrained herd size: `getHusbandryWorkerFactor()` saturated
 *      at 1x as soon as assigned herders merely covered `requiredWorkers`, releasing the cell's
 *      ENTIRE pasture-suitable area regardless of how small that threshold was (a population of a
 *      few hundred "owning" a herd sized for the land's full ecological ceiling).
 *   2. A first-cut fix added a second, separately-computed labour-based headcount ceiling
 *      (`getGrazedLaborCapacityHeads()`, composed via `min()` with the land ceiling) — but
 *      `requiredWorkers` was `rawDemand / effectiveHeadsPerHerder`, where `rawDemand` (population x
 *      biome rate) is a MONTHLY FLOW figure, not a standing headcount. Dividing it by
 *      `effectiveHeadsPerHerder` (a real standing-flock-size constant, 60-2000) made `requiredWorkers`
 *      tautologically tiny for almost any population, collapsing that second ceiling to roughly "one
 *      month's flow" at full staffing — ~24x smaller than non-grazed species' `flatRateAmount x 24
 *      months` proxy. Grazed species (Cattle/Sheep/Goats/Horses/Camels) lost out to Pig/Chicken/
 *      Elephants everywhere, starving downstream craft goods (Cheese, Wool) that depend on them.
 *
 * Root cause of both: `requiredWorkers` was sized from a monthly FLOW, when it needs to represent a
 * standing STOCK. Fixed by sizing it from the LAND-based standing capacity instead
 * (`calculateDesiredPastureAreaHectares() x stockingDensity / effectiveHeadsPerHerder`), mirroring
 * viticulture.ts's `calculateDesiredVineyardAreaHectares()` precedent: the land-suitability ceiling
 * clamped by a population-scaled "desired" area, so a huge pasture-suitable cell with a tiny
 * population doesn't demand an unrealistically large labour force that would otherwise monopolize
 * the rural occupation allocator's greedy budget ahead of fishing/viticulture (§10 item 6 of the
 * parent spec documents viticulture hitting this exact issue first). With `requiredWorkers` now
 * land-based, `getGrazedCarryingCapacity()`'s land term (`pastureAreaUsed x density`) and the
 * separate labour-based ceiling became ALGEBRAICALLY IDENTICAL at every staffing level, not just
 * full coverage (both reduce to `workerFactor x desiredArea x density` once `effectiveHeadsPerHerder`
 * cancels out of the ratio) — so the second ceiling was removed as dead weight; a single land term,
 * correctly gated by the now-consistent `getPastureAreaUsedHectares()`, is sufficient again.
 */

import { resolveBiomeOutputRate } from "../../../data/biomeEconomy";
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
  calculateTerrainWorkableShare
} from "./agriculturalLandUse";
import type { Good } from "./goods-generator";
import { isGoodEnabled } from "./goods-generator";

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
 * — mirrors viticulture.ts's `VINEYARD_AREA_PER_POPULATION_POINT` in spirit (see module doc-comment's
 * "requiredWorkers redefinition" entry), but per actual person, not per raw `cells.pop` unit. Found
 * 2026-08-07 (real-map verification via Playwright after this constant still produced a near-empty
 * herd everywhere): `cells.pop[cellId]` is a "population point" — `agriculturalLandUse.ts`'s own
 * `currentPeople = cells.pop[cellId] * populationRate` is the established real-headcount conversion
 * (`populationRate` was 1000 on a real generated map, with `cells.pop` typically 1-20 per cell — i.e.
 * a raw-point-based desiredArea of "population x 1 ha" was on the order of a few HECTARES per cell,
 * not a few THOUSAND, making every grazed species' capacity round to ~0). Multiplying by
 * `populationRate` first fixes the unit mismatch; this constant itself stays a placeholder,
 * calibration TBD (§9.3). NOTE: `viticulture.ts`'s `VINEYARD_AREA_PER_POPULATION_POINT` has the
 * same raw-`cells.pop` pattern and is very likely under-scaled the same way — not fixed here since
 * it's outside today's Cattle/Sheep/Goats/Horses/Camels scope, but flagged in
 * docs/plan/fauna-biome-realism.md for follow-up.
 */
const HUSBANDRY_LAND_HECTARES_PER_PERSON = 1;

/**
 * Heads sustainably supported per hectare of actively-used pasture (ecological ceiling,
 * independent of herder labour). Order-of-magnitude estimate from general historical/extensive-
 * grazing figures, not a single verified study — flagged for recalibration.
 */
const STOCKING_DENSITY_PER_HECTARE: Record<string, number> = {
  Cattle: 0.5,
  Horses: 0.4,
  Sheep: 3,
  Goats: 2.5,
  Camels: 0.15
};
const DEFAULT_STOCKING_DENSITY_PER_HECTARE = 0.5;

interface HusbandrySpeciesProfile {
  /** Heads one full-time herder can manage without dogs (§10.3, user-confirmed 2026-08-06). */
  readonly baselineHeadsPerHerder: number;
  /** Multiplier at full working-dog coverage (Arnott et al. 2014's reported ceiling where available). */
  readonly dogMultiplier: number;
}

const HUSBANDRY_SPECIES_PROFILES: Record<string, HusbandrySpeciesProfile> = {
  Sheep: { baselineHeadsPerHerder: 200, dogMultiplier: 10 }, // 200 * 10 = 2,000, matches Arnott's sheep ceiling
  Goats: { baselineHeadsPerHerder: 180, dogMultiplier: 10 }, // flocking browser, same multiplier class as Sheep
  Cattle: { baselineHeadsPerHerder: 60, dogMultiplier: 8 }, // 60 * 8 = 480, ~matches Arnott's 500-head cattle ceiling
  Horses: { baselineHeadsPerHerder: 40, dogMultiplier: 8 }, // needs more individual attention than cattle
  Camels: { baselineHeadsPerHerder: 50, dogMultiplier: 8 }
};

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
  /** Land-capacity-weighted average good.value, for the greedy allocator's value-ranking (§3.1). */
  readonly value: number;
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

  const cultivated = getCultivatedArea()[cellId] ?? 0;
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
function calculateDesiredPastureAreaHectares(world: Readonly<WorldContext>, cellId: number): number {
  const ceiling = calculatePastureCeilingAreaHectares(world, cellId);
  if (ceiling <= 0) return 0;
  const populationPoints = Math.max(0, world.pack.cells.pop[cellId] ?? 0);
  const realPopulation = populationPoints * Math.max(1, world.populationRate || 1);
  return Math.min(ceiling, realPopulation * HUSBANDRY_LAND_HECTARES_PER_PERSON);
}

/**
 * Aggregate herder demand across every enabled grazed-species good with a positive biome rate at
 * `cellId`, folding in the working-dog labour multiplier. Called from ruralOccupationAllocation.ts's
 * per-cell greedy loop, where `world` is already in scope. Sized from land capacity, not monthly
 * flow (see module doc-comment's "requiredWorkers redefinition" entry) — every grazed species present
 * is treated as independently able to claim the full `desiredArea` (the pre-existing simplification
 * `getGrazedCarryingCapacity()` already made; land isn't partitioned across co-occurring species).
 */
export function calculateHusbandryDemand(world: Readonly<WorldContext>, cellId: number): HusbandryDemand {
  const cells = world.pack.cells;
  const population = Math.max(0, cells.pop[cellId] ?? 0);
  if (population <= 0) return { requiredWorkers: 0, value: 0 };

  const desiredArea = calculateDesiredPastureAreaHectares(world, cellId);
  if (desiredArea <= 0) return { requiredWorkers: 0, value: 0 };

  const biomeCode = cells.biomeCode[cellId] ?? 0;
  const goodsByName = new Map(getGoods().map(good => [good.name, good]));

  const perGoodDemand: { good: Good; landCapacity: number; profile: HusbandrySpeciesProfile }[] = [];
  let totalLandCapacity = 0;
  let workersNoDogs = 0;
  let weightedValue = 0;

  for (const [name, profile] of Object.entries(HUSBANDRY_SPECIES_PROFILES)) {
    const good = goodsByName.get(name);
    if (!good || !isGoodEnabled(good)) continue;
    const rate = resolveBiomeOutputRate(biomeCode, good.biomeOutput, good.biomeOutputByTag, world.biomesData);
    if (rate <= 0) continue; // species doesn't fit this biome at all

    const density = STOCKING_DENSITY_PER_HECTARE[name] ?? DEFAULT_STOCKING_DENSITY_PER_HECTARE;
    const landCapacity = desiredArea * density;
    if (landCapacity <= 0) continue;

    totalLandCapacity += landCapacity;
    workersNoDogs += landCapacity / profile.baselineHeadsPerHerder;
    weightedValue += landCapacity * good.value;
    perGoodDemand.push({ good, landCapacity, profile });
  }

  if (!perGoodDemand.length) return { requiredWorkers: 0, value: 0 };

  const dogsNeededForFullCoverage = workersNoDogs * DOGS_PER_HERDER_FOR_FULL_COVERAGE;
  const dogCoverageFraction =
    dogsNeededForFullCoverage > 0 ? Math.min(1, getDogsHeadcount(cellId) / dogsNeededForFullCoverage) : 0;

  let requiredWorkers = 0;
  for (const { landCapacity, profile } of perGoodDemand) {
    const effectiveHeadsPerHerder =
      profile.baselineHeadsPerHerder * (1 + (profile.dogMultiplier - 1) * dogCoverageFraction);
    requiredWorkers += landCapacity / effectiveHeadsPerHerder;
  }

  return { requiredWorkers, value: weightedValue / totalLandCapacity };
}

/** 0..1 labour-sufficiency ratio gating grazed-species output at `cellId` (mirrors getViticultureWorkerFactor). */
export function getHusbandryWorkerFactor(cellId: number): number {
  const required = getHusbandryRequiredWorkers()[cellId] ?? 0;
  if (required <= 0) return 0;
  const assigned = getHusbandryWorkers()[cellId] ?? 0;
  return Math.min(1, assigned / required);
}

/**
 * Actual grazing footprint at `cellId`: the population-bounded desired area (§ module doc-comment)
 * scaled by how well-staffed husbandry actually is. Used both by getGrazedCarryingCapacity() below
 * and by faunaPopulation.ts's wildHabitatArea subtraction.
 */
export function getPastureAreaUsedHectares(cellId: number): number {
  const world = getWorldContext();
  const desiredArea = calculateDesiredPastureAreaHectares(world, cellId);
  if (desiredArea <= 0) return 0;
  return desiredArea * getHusbandryWorkerFactor(cellId);
}

/**
 * Domesticated carrying capacity (§4.2) for a grazed-species good, replacing Phase 2's flat-rate
 * proxy: the land-suitability ceiling actually in use (`getPastureAreaUsedHectares()`, already
 * labour-gated via `getHusbandryWorkerFactor()` — see module doc-comment for why a separate
 * labour-based ceiling here would now be redundant with this term) times the species' stocking
 * density. Gated by this species having a positive biome rate at all — `pastureAreaUsed` is a
 * cell-level aggregate shared across every co-located grazed species, so without this check a
 * species absent from the biome (e.g. Camels queried on a temperate grassland cell) could still
 * read a nonzero capacity purely because some OTHER grazed species is active there. faunaPopulation.ts
 * layers the non-food demand-absorption cap (§4.5) on top of this for non-food grazed goods
 * (Camels/Horses).
 */
export function getGrazedCarryingCapacity(
  cellId: number,
  good: Pick<Good, "name" | "biomeOutput" | "biomeOutputByTag">
): number {
  const pastureAreaUsed = getPastureAreaUsedHectares(cellId);
  if (pastureAreaUsed <= 0) return 0;

  const world = getWorldContext();
  const biomeCode = world.pack.cells.biomeCode[cellId] ?? 0;
  const rate = resolveBiomeOutputRate(biomeCode, good.biomeOutput, good.biomeOutputByTag, world.biomesData);
  if (rate <= 0) return 0;

  const density = STOCKING_DENSITY_PER_HECTARE[good.name] ?? DEFAULT_STOCKING_DENSITY_PER_HECTARE;
  return pastureAreaUsed * density;
}
