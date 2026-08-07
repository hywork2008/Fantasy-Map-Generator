/**
 * Fauna Population Stock Model — docs/plan/biome-goods-producer-ecosystem.md §4 (Phase 2).
 *
 * Gives Game (wild) and liveAnimal-tagged goods (domesticated) a per-cell headcount stock instead
 * of an unlimited flat rate, so hunting/husbandry offtake can be capped by "how many are actually
 * out there" and heavy culling now measurably thins next year's breeding stock. Both share the
 * same 3-cohort (young/breeding/old) structure and logistic-growth annual update, but size their
 * ceiling (`carryingCapacity`) differently (§4.2):
 *   - Wild (Game): the cell's unclaimed land — physical area minus what farming and husbandry
 *     (husbandry.ts's pastureAreaUsed, §5.4) have already claimed — times a density that varies by
 *     the cell's dominant biome tag (`WILD_GAME_DENSITY_PER_HECTARE_BY_TAG`; forest is no longer a
 *     hard gate — see docs/plan/fauna-biome-realism.md §2.2/§3 Phase A, found 2026-08-07). Cropland/
 *     pasture always win first; game only lives on what's left.
 *   - Domesticated (liveAnimal): grazed species (Cattle/Sheep/Goats/Horses/Camels — husbandry.ts's
 *     `isGrazedLivestockGood`) size their ceiling from real pasture land x herder labour
 *     (husbandry.ts, §5.4, Phase 3). Non-grazed species (Pig/Chicken/Cats/Dogs) stay on the
 *     Phase 1/2 interim proxy below — see husbandry.ts's module doc-comment for the scope split.
 * Non-food domesticated species (Cats, Horses, Camels, Elephants, Dogs) get an additional
 * demand-absorption ceiling (§4.5) so an unsellable surplus slows breeding instead of piling up.
 *
 * Gated by `options.ruralEcosystemDetail` (§11): "simplified" makes every exported draw function
 * a pass-through to the caller's already-computed "desired" amount (Phase 1's uncapped, labour/
 * rate-gated formula) and the annual cohort update becomes a no-op — a loaded map never sees
 * numbers move purely from flipping the toggle mid-session, only from the next annual update (or
 * lack of one) actually running.
 *
 * Sex is not tracked per cohort (§4.1 permits omitting it — "多くの家畜は...省略可" for species
 * where the male/female ratio isn't the limiting factor); this first cut keeps every species on a
 * single sexless 3-cohort count. Revisit per-species if a specific one's flavor needs it later.
 */

import { resolveBiomeOutputRate } from "../../../data/biomeEconomy";
import type { BiomeTag } from "../../../types/biome";
import type { BiomesData } from "../../../types/WorldState";
import { foodStressProductionMultiplier } from "../../hostCore";
import { DEFAULT_CULTURE_TYPE } from "../../hostTypes";
import {
  getCultivatedArea,
  getFaunaPopulationLastSettledYear,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getOrCreateFaunaStockTable,
  getOrCreateMarketGoodProductionTotals,
  getOrCreateNonFoodFaunaDemandHistory,
  getOrCreateNonFoodFaunaDemandSnapshot,
  getOrCreateNonFoodFaunaProductionSnapshot,
  getSimulationYear,
  getWorldContext,
  setFaunaPopulationLastSettledYear
} from "../economyContext";
import { calculateBurgBuiltAreaHectares, calculatePhysicalAreaHectares } from "./agriculturalLandUse";
import type { FaunaCohorts } from "./faunaPopulationTypes";
import { type Good, isGoodEnabled } from "./goods-generator";
import { getGrazedCarryingCapacity, getPastureAreaUsedHectares, isGrazedLivestockGood } from "./husbandry";
import { getVineyardAreaUsedHectares } from "./viticulture";

/** The species key used for Game's wild stock — Game itself carries no `liveAnimal` tag (§4.1). */
export const WILD_SPECIES_KEY = "Game";

// ---- Placeholder constants (calibration TBD, matching the rest of this ecosystem's §9.3 stance) ----

/**
 * Sustainable wild headcount per hectare of unclaimed land, by the cell's dominant biome tag
 * (§4.2's `biomeBaseDensity(biome)` — the density model the spec always intended; the first cut
 * collapsed it to "forest only, else 0", found non-realistic 2026-08-07, see
 * docs/plan/fauna-biome-realism.md §2.2/§3 Phase A). Values are relative-ordering placeholders
 * (§9.3 policy): forest/wetland browse cover supports the densest wildlife, open grassland (which
 * also covers Savanna — it carries the "grassland" tag, not a dedicated one) a bit less, scrub/
 * mountain/cold biomes less still, arid biomes sparsest. `resolveBiomeOutputRate()`-style "best
 * matching tag wins" — see `getWildGameDensityPerHectare()`.
 */
export const WILD_GAME_DENSITY_PER_HECTARE_BY_TAG: Partial<Record<BiomeTag, number>> = {
  forest: 0.08,
  wetland: 0.06,
  grassland: 0.05,
  scrub: 0.03,
  mountain: 0.025,
  cold: 0.02,
  dry: 0.012,
  desert: 0.006
};
/** Any biome without a tag matched above still keeps SOME wildlife rather than exactly 0 — §4.2's
 * "unless ~100% developed, wildlife is always present somewhere" intent, now actually honored
 * outside forest (see the constant above's doc-comment). */
export const WILD_GAME_DEFAULT_DENSITY_PER_HECTARE = 0.01;
/**
 * Interim domesticated carrying-capacity proxy (§4.2) for non-grazed species (Pig/Chicken/Cats/
 * Dogs — husbandry.ts's `isGrazedLivestockGood` is false for these): treat the flat monthly
 * production rate as "how many months of that rate's worth of animals this land could plausibly
 * keep alive as breeding stock." Grazed species (Cattle/Sheep/Goats/Horses/Camels) use
 * husbandry.ts's real pasture/labour-based figure instead (Phase 3).
 */
export const DOMESTICATED_CAPACITY_MONTHS_PROXY = 24;

const NON_FOOD_DEMAND_QUARTERS_TRACKED = 4;
const NON_FOOD_DEMAND_BUFFER = 1.2;

/** Fraction of a freshly-discovered species' carrying capacity it starts at, split young/breeding/old. */
const INITIAL_STOCK_FRACTION_OF_CAPACITY = 0.6;
const INITIAL_COHORT_SPLIT = { young: 0.25, breeding: 0.5, old: 0.25 };

const MIN_SELECTIVITY = 0.1;
/** Wild culling selectivity (§4.4): Hunting culture is a trained professional class. */
const HUNTING_CULTURE_SELECTIVITY_PEACETIME = 0.9;
const GENERAL_CULTURE_SELECTIVITY_PEACETIME = 0.6;
const HUNTING_CULTURE_CRISIS_PULL = 0.3;
const GENERAL_CULTURE_CRISIS_PULL = 0.6;
/** Domesticated culling selectivity (§4.4): routine husbandry culls old/unproductive stock first. */
const DOMESTICATED_SELECTIVITY_PEACETIME = 0.85;
const DOMESTICATED_CRISIS_PULL = 0.5;

interface FaunaSpeciesProfile {
  /** Young produced per breeding individual per year, before the logistic carrying-capacity cap. */
  readonly annualBreedingRate: number;
  readonly youngMaturityYears: number;
  readonly breedingTenureYears: number;
  readonly oldLifespanYears: number;
}

const DEFAULT_SPECIES_PROFILE: FaunaSpeciesProfile = {
  annualBreedingRate: 0.6,
  youngMaturityYears: 2,
  breedingTenureYears: 5,
  oldLifespanYears: 3
};

/**
 * Per-species breeding/aging constants (placeholder, calibration TBD — §4.3's "既存
 * biomeOutputByTagのレート感を流用して初期値を決める" applied loosely: relative ordering matters
 * more than exact values here, e.g. Chicken breeds far faster than Elephants).
 */
const SPECIES_PROFILES: Record<string, FaunaSpeciesProfile> = {
  Game: { annualBreedingRate: 0.9, youngMaturityYears: 1, breedingTenureYears: 4, oldLifespanYears: 3 },
  Cattle: { annualBreedingRate: 0.5, youngMaturityYears: 2, breedingTenureYears: 6, oldLifespanYears: 4 },
  Horses: { annualBreedingRate: 0.4, youngMaturityYears: 3, breedingTenureYears: 8, oldLifespanYears: 5 },
  Sheep: { annualBreedingRate: 0.8, youngMaturityYears: 1, breedingTenureYears: 5, oldLifespanYears: 3 },
  Goats: { annualBreedingRate: 0.9, youngMaturityYears: 1, breedingTenureYears: 5, oldLifespanYears: 3 },
  Pig: { annualBreedingRate: 1.3, youngMaturityYears: 1, breedingTenureYears: 3, oldLifespanYears: 2 },
  Chicken: { annualBreedingRate: 3.0, youngMaturityYears: 0.5, breedingTenureYears: 2, oldLifespanYears: 1 },
  Camels: { annualBreedingRate: 0.3, youngMaturityYears: 4, breedingTenureYears: 10, oldLifespanYears: 6 },
  Elephants: { annualBreedingRate: 0.15, youngMaturityYears: 8, breedingTenureYears: 20, oldLifespanYears: 10 },
  Cats: { annualBreedingRate: 1.5, youngMaturityYears: 1, breedingTenureYears: 3, oldLifespanYears: 2 },
  Dogs: { annualBreedingRate: 1.0, youngMaturityYears: 1, breedingTenureYears: 4, oldLifespanYears: 3 }
};

function getSpeciesProfile(speciesKey: string): FaunaSpeciesProfile {
  return SPECIES_PROFILES[speciesKey] ?? DEFAULT_SPECIES_PROFILE;
}

function getStockKey(cellId: number, speciesKey: string): string {
  return `${cellId}:${speciesKey}`;
}

function cohortTotal(cohorts: FaunaCohorts): number {
  return cohorts.young + cohorts.breeding + cohorts.old;
}

function initializeStock(carryingCapacity: number): FaunaCohorts {
  const total = Math.max(0, carryingCapacity) * INITIAL_STOCK_FRACTION_OF_CAPACITY;
  return {
    young: total * INITIAL_COHORT_SPLIT.young,
    breeding: total * INITIAL_COHORT_SPLIT.breeding,
    old: total * INITIAL_COHORT_SPLIT.old
  };
}

/** Reads options.ruralEcosystemDetail off the live world context (§11); undefined preserves "detailed". */
export function getRuralEcosystemDetail(): "detailed" | "simplified" {
  return getWorldContext().options?.ruralEcosystemDetail === "simplified" ? "simplified" : "detailed";
}

// ---- Carrying capacity (§4.2) ----

/** Best-matching-tag density lookup, mirroring `resolveBiomeOutputRate()`'s "best tag wins" rule
 * and husbandry.ts's `PASTURE_BIOME_TAG_CEILING` reduce pattern. */
function getWildGameDensityPerHectare(biomeCode: number, biomesData: Pick<BiomesData, "tags">): number {
  const tags = biomesData.tags?.[biomeCode] ?? [];
  return tags.reduce(
    (max, tag) => Math.max(max, WILD_GAME_DENSITY_PER_HECTARE_BY_TAG[tag] ?? 0),
    WILD_GAME_DEFAULT_DENSITY_PER_HECTARE
  );
}

/** True when `cellId`'s biome supports wild game at all — i.e. not a habitability-0 biome like
 * glacier/marine. Cheap, tag/habitability-only eligibility check deliberately decoupled from the
 * full land-area accounting in `getWildCarryingCapacity()` below, so hunting-labor eligibility
 * (ruralOccupationAllocation.ts) doesn't depend on this cycle's not-yet-computed husbandry/
 * viticulture land-use figures — see docs/plan/fauna-biome-realism.md §3 Phase A. */
export function hasWildGameHabitat(cellId: number): boolean {
  const world = getWorldContext();
  const cells = world.pack.cells;
  if ((cells.h[cellId] ?? 0) < 20) return false;
  const biomeCode = cells.biomeCode[cellId] ?? 0;
  return (world.biomesData.habitability?.[biomeCode] ?? 0) > 0;
}

/**
 * Wild (Game) carrying capacity: a biome-tag-dependent density (`WILD_GAME_DENSITY_PER_HECTARE_BY_TAG`)
 * over whatever land farming, husbandry (husbandry.ts's pastureAreaUsed, §5.4, Phase 3), and
 * viticulture (viticulture.ts's vineyardAreaUsed, §5.3, Phase 4) haven't already claimed. No longer
 * forest-only (§4.2's `biomeBaseDensity(biome)` intent, restored 2026-08-07 — see
 * docs/plan/fauna-biome-realism.md §2.2/§3 Phase A); a habitability-0 biome (glacier/marine-like)
 * still yields 0.
 */
export function getWildCarryingCapacity(cellId: number): number {
  const world = getWorldContext();
  const cells = world.pack.cells;
  if ((cells.h[cellId] ?? 0) < 20) return 0;

  const biomeCode = cells.biomeCode[cellId] ?? 0;
  const habitability = Math.max(0, world.biomesData.habitability?.[biomeCode] ?? 0);
  if (habitability <= 0) return 0;

  const density = getWildGameDensityPerHectare(biomeCode, world.biomesData);

  const physicalArea = calculatePhysicalAreaHectares(world, cellId);
  const cultivated = getCultivatedArea()[cellId] ?? 0;
  const burgArea = calculateBurgBuiltAreaHectares(world, cellId);
  const pastureAreaUsed = getPastureAreaUsedHectares(cellId);
  const vineyardAreaUsed = getVineyardAreaUsedHectares(cellId);
  const wildHabitatArea = Math.max(0, physicalArea - cultivated - burgArea - pastureAreaUsed - vineyardAreaUsed);
  return density * wildHabitatArea;
}

function getDemandHistoryKey(marketId: number, goodId: number): string {
  return `${marketId}:${goodId}`;
}

/**
 * 0..1+ ceiling on a non-food species' capacity derived from how much of it the local market has
 * actually absorbed over the last few quarters (§4.5), so an unsellable surplus slows breeding
 * instead of piling up. Simplification: applied identically to every cell feeding the same
 * market rather than distributed proportionally across them — conservative (each cell alone could
 * reach the market's full cap) but avoids a separate per-market aggregation pass. Returns +Infinity
 * (uncapped) until at least one quarter of consumption history exists, so a fresh market doesn't
 * instantly starve a species nobody has had a chance to buy yet.
 */
function getNonFoodDemandAbsorptionCapacity(cellId: number, good: Good): number {
  const marketId = getMarketCellColumn()[cellId];
  if (!marketId) return Number.POSITIVE_INFINITY;
  const history = getOrCreateNonFoodFaunaDemandHistory()?.[getDemandHistoryKey(marketId, good.i)];
  if (!history?.length) return Number.POSITIVE_INFINITY;
  const average = history.reduce((sum, value) => sum + value, 0) / history.length;
  return average * NON_FOOD_DEMAND_BUFFER;
}

/**
 * Domesticated carrying capacity (§4.2). Grazed species (Cattle/Sheep/Goats/Horses/Camels) size
 * from husbandry.ts's real pasture/labour figure (Phase 3); everyone else keeps the interim
 * flat-rate proxy (`flatRateAmount` is the caller's already-computed pre-Phase-2 flat monthly rate,
 * population × biomeOutput). Non-food species are capped further by market demand either way (§4.5).
 */
export function getDomesticatedCarryingCapacity(cellId: number, good: Good, flatRateAmount: number): number {
  // Grazed species recompute their own ungated population x biome-rate demand internally (see
  // getGrazedLaborCapacityHeads()'s doc-comment) rather than trusting `flatRateAmount` here — at
  // production-utils.ts's call site it has already been multiplied by getHusbandryWorkerFactor(),
  // which would double-gate the labour-based herd ceiling below.
  const rawCapacity = isGrazedLivestockGood(good.name)
    ? getGrazedCarryingCapacity(cellId, good)
    : Math.max(0, flatRateAmount) * DOMESTICATED_CAPACITY_MONTHS_PROXY;
  if (good.tags.includes("food")) return rawCapacity;
  return Math.min(rawCapacity, getNonFoodDemandAbsorptionCapacity(cellId, good));
}

// ---- Age-selective culling (§4.4) ----

function getCellCultureType(cellId: number): string {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const burgId = cells.burg?.[cellId];
  const cultureId = cells.culture?.[cellId];
  return (burgId ? world.pack.burgs?.[burgId]?.type : world.pack.cultures?.[cultureId]?.type) ?? DEFAULT_CULTURE_TYPE;
}

function getCrisisStress(cellId: number): number {
  const stateId = getWorldContext().pack.cells.state?.[cellId] ?? 0;
  return 1 - foodStressProductionMultiplier(stateId);
}

/** 0 (fully indiscriminate) .. 1 (fully old-first-selective) draw weighting for wild hunting. */
export function getWildCullSelectivity(cellId: number): number {
  const isHunting = getCellCultureType(cellId) === "Hunting";
  const base = isHunting ? HUNTING_CULTURE_SELECTIVITY_PEACETIME : GENERAL_CULTURE_SELECTIVITY_PEACETIME;
  const crisisPull = isHunting ? HUNTING_CULTURE_CRISIS_PULL : GENERAL_CULTURE_CRISIS_PULL;
  return Math.max(MIN_SELECTIVITY, base - getCrisisStress(cellId) * crisisPull);
}

/** Same idea for domesticated herds — routine husbandry defaults more selective than wild hunting. */
export function getDomesticatedCullSelectivity(cellId: number): number {
  return Math.max(
    MIN_SELECTIVITY,
    DOMESTICATED_SELECTIVITY_PEACETIME - getCrisisStress(cellId) * DOMESTICATED_CRISIS_PULL
  );
}

/**
 * Draws `amount` out of `cohorts` in place, blending a fully-selective (old, then breeding, then
 * young) draw order with a fully-indiscriminate (proportional-to-share) draw by `selectivity`.
 * Returns the amount actually drawn (<= amount, bounded by the cohorts' total).
 */
function applyCull(cohorts: FaunaCohorts, amount: number, selectivity: number): number {
  const total = cohortTotal(cohorts);
  const draw = Math.min(Math.max(0, amount), total);
  if (draw <= 0) return 0;

  const proportional =
    total > 0
      ? {
          young: (draw * cohorts.young) / total,
          breeding: (draw * cohorts.breeding) / total,
          old: (draw * cohorts.old) / total
        }
      : { young: 0, breeding: 0, old: 0 };

  let remaining = draw;
  const takeOld = Math.min(remaining, cohorts.old);
  remaining -= takeOld;
  const takeBreeding = Math.min(remaining, cohorts.breeding);
  remaining -= takeBreeding;
  const takeYoung = Math.min(remaining, cohorts.young);
  const selective = { old: takeOld, breeding: takeBreeding, young: takeYoung };

  cohorts.old = Math.max(0, cohorts.old - (proportional.old * (1 - selectivity) + selective.old * selectivity));
  cohorts.breeding = Math.max(
    0,
    cohorts.breeding - (proportional.breeding * (1 - selectivity) + selective.breeding * selectivity)
  );
  cohorts.young = Math.max(0, cohorts.young - (proportional.young * (1 - selectivity) + selective.young * selectivity));
  return draw;
}

function ensureStock(
  table: Record<string, FaunaCohorts>,
  cellId: number,
  speciesKey: string,
  carryingCapacity: number
): FaunaCohorts {
  const key = getStockKey(cellId, speciesKey);
  const existing = table[key];
  if (existing) return existing;
  const seeded = carryingCapacity > 0 ? initializeStock(carryingCapacity) : { young: 0, breeding: 0, old: 0 };
  table[key] = seeded;
  return seeded;
}

/**
 * Caps a "desired" monthly offtake (already labour/rate-gated by the caller) by the actual
 * harvestable stock and draws it down cohort-by-cohort. Callers already checked
 * getRuralEcosystemDetail() before computing `capacity`, so this only handles the "no simulation
 * context" (minimal unit test) fallback — behave like Phase 1 there too.
 */
function drawOfftake(
  cellId: number,
  speciesKey: string,
  desiredAmount: number,
  selectivity: number,
  capacity: number
): number {
  if (desiredAmount <= 0) return 0;

  const table = getOrCreateFaunaStockTable();
  if (!table) return desiredAmount;

  const cohorts = ensureStock(table, cellId, speciesKey, capacity);
  const harvestable = cohortTotal(cohorts);
  const actual = Math.min(desiredAmount, harvestable);
  if (actual <= 0) return 0;

  applyCull(cohorts, actual, selectivity);
  table[getStockKey(cellId, speciesKey)] = cohorts;
  return actual;
}

/**
 * Game's monthly offtake, capped by the wild stock (§5.1). `desiredAmount` = hunters × yield. In
 * "simplified" mode this is a pass-through — the caller's desired amount comes back unchanged and
 * the stock table is never touched, matching §11.2's "no numbers move from flipping the toggle
 * mid-session" guarantee.
 */
export function drawWildFaunaOfftake(cellId: number, desiredAmount: number): number {
  if (getRuralEcosystemDetail() !== "detailed") return desiredAmount;
  return drawOfftake(
    cellId,
    WILD_SPECIES_KEY,
    desiredAmount,
    getWildCullSelectivity(cellId),
    getWildCarryingCapacity(cellId)
  );
}

/**
 * A liveAnimal good's monthly offtake, capped by its domesticated stock. `desiredAmount` = the
 * pre-Phase-2 flat rate (population × biomeOutput) — also used to size the interim capacity
 * proxy, so the non-food demand cap (§4.5) is the only way this can bind below Phase 1's number.
 * Same "simplified" pass-through guarantee as drawWildFaunaOfftake.
 */
export function drawDomesticatedFaunaOfftake(cellId: number, good: Good, desiredAmount: number): number {
  if (getRuralEcosystemDetail() !== "detailed") return desiredAmount;
  const capacity = getDomesticatedCarryingCapacity(cellId, good, desiredAmount);
  return drawOfftake(cellId, good.name, desiredAmount, getDomesticatedCullSelectivity(cellId), capacity);
}

/**
 * What a stock currently holds, without seeding/writing it (mirrors `ensureStock`'s "not yet
 * tracked" seeding math so a preview and a real first draw agree, but never touches the table).
 */
function peekHarvestableStock(cellId: number, speciesKey: string, capacity: number): number {
  const existing = getOrCreateFaunaStockTable()?.[getStockKey(cellId, speciesKey)];
  if (existing) return cohortTotal(existing);
  return capacity > 0 ? capacity * INITIAL_STOCK_FRACTION_OF_CAPACITY : 0;
}

/**
 * Read-only counterpart to `drawWildFaunaOfftake` — reports what *would* be harvested without
 * culling the stock. `getRuralProductionContributions()`/`getCellProduction()` (production-utils.ts)
 * are called from non-production contexts too (map redraw, CellInfo/tooltip hover, the Goods
 * editor's cell preview), which must stay read-only per the Renderer-purity rule (AGENTS.md §1) —
 * routing those through the mutating draw functions was silently culling live animals on every
 * mouse-over/redraw (found 2026-08-07, via CellInfo's Phase 2 fauna headcount display).
 */
export function previewWildFaunaOfftake(cellId: number, desiredAmount: number): number {
  if (getRuralEcosystemDetail() !== "detailed") return desiredAmount;
  if (desiredAmount <= 0) return 0;
  return Math.min(desiredAmount, peekHarvestableStock(cellId, WILD_SPECIES_KEY, getWildCarryingCapacity(cellId)));
}

/** Read-only counterpart to `drawDomesticatedFaunaOfftake` — see `previewWildFaunaOfftake`. */
export function previewDomesticatedFaunaOfftake(cellId: number, good: Good, desiredAmount: number): number {
  if (getRuralEcosystemDetail() !== "detailed") return desiredAmount;
  if (desiredAmount <= 0) return 0;
  const capacity = getDomesticatedCarryingCapacity(cellId, good, desiredAmount);
  return Math.min(desiredAmount, peekHarvestableStock(cellId, good.name, capacity));
}

// ---- Annual cohort update (§4.3) ----

function advanceCohortsOneYear(
  cohorts: FaunaCohorts,
  profile: FaunaSpeciesProfile,
  carryingCapacity: number
): FaunaCohorts {
  if (carryingCapacity <= 0) return { young: 0, breeding: 0, old: 0 };

  const total = cohortTotal(cohorts);
  const room = Math.max(0, 1 - total / carryingCapacity);
  const born = cohorts.breeding * profile.annualBreedingRate * room;

  const youngMaturing = cohorts.young / Math.max(0.1, profile.youngMaturityYears);
  const breedingAging = cohorts.breeding / Math.max(0.1, profile.breedingTenureYears);
  const oldDying = cohorts.old / Math.max(0.1, profile.oldLifespanYears);

  let next: FaunaCohorts = {
    young: Math.max(0, cohorts.young - youngMaturing + born),
    breeding: Math.max(0, cohorts.breeding - breedingAging + youngMaturing),
    old: Math.max(0, cohorts.old - oldDying + breedingAging)
  };

  const nextTotal = cohortTotal(next);
  if (nextTotal > carryingCapacity) {
    // Habitat/demand ceiling shrank faster than natural attrition (e.g. cropland just expanded,
    // or a non-food species' demand cap just collapsed) — model the excess as die-off/emigration.
    const scale = carryingCapacity / nextTotal;
    next = { young: next.young * scale, breeding: next.breeding * scale, old: next.old * scale };
  }
  return next;
}

function advanceStockOneYear(
  table: Record<string, FaunaCohorts>,
  cellId: number,
  speciesKey: string,
  carryingCapacity: number
): void {
  const key = getStockKey(cellId, speciesKey);
  const existing = table[key];
  if (!existing) {
    if (carryingCapacity > 0) table[key] = initializeStock(carryingCapacity);
    return; // Freshly seeded — breeding/aging starts from here next year.
  }

  const next = advanceCohortsOneYear(existing, getSpeciesProfile(speciesKey), carryingCapacity);
  if (cohortTotal(next) <= 0 && carryingCapacity <= 0)
    delete table[key]; // Habitat/demand gone — stop tracking.
  else table[key] = next;
}

/**
 * Runs one year of breeding/aging for every tracked (cell, species) pair. Self-guards to once per
 * simulation year and no-ops entirely in "simplified" mode (§11.3) — faunaStock is left untouched
 * rather than cleared, so switching back to "detailed" later resumes from wherever it was.
 */
export function updateAnnualFaunaCohorts(): boolean {
  if (getRuralEcosystemDetail() !== "detailed") return false;

  const year = getSimulationYear();
  if (getFaunaPopulationLastSettledYear() === year) return false;
  setFaunaPopulationLastSettledYear(year);

  const world = getWorldContext();
  const cells = world.pack.cells;
  if (!cells?.i?.length) return false;

  const table = getOrCreateFaunaStockTable();
  if (!table) return false;

  const domesticatedGoods = getGoods().filter(good => good.tags.includes("liveAnimal") && isGoodEnabled(good));

  for (const cellId of cells.i) {
    if ((cells.h[cellId] ?? 0) < 20) continue;

    advanceStockOneYear(table, cellId, WILD_SPECIES_KEY, getWildCarryingCapacity(cellId));
    if (!domesticatedGoods.length) continue;

    const biomeCode = cells.biomeCode[cellId] ?? 0;
    for (const good of domesticatedGoods) {
      const rate = resolveBiomeOutputRate(biomeCode, good.biomeOutput, good.biomeOutputByTag, world.biomesData);
      if (rate <= 0) continue;
      const flatRateAmount = Math.max(0, cells.pop[cellId] ?? 0) * rate;
      advanceStockOneYear(table, cellId, good.name, getDomesticatedCarryingCapacity(cellId, good, flatRateAmount));
    }
  }
  return true;
}

// ---- Non-food demand-absorption history (§4.5) ----

/**
 * Snapshots each market's non-food liveAnimal goods' stock AND cumulative production once per
 * quarter, deriving that quarter's "consumed" sample as
 * `max(0, producedThisQuarter + previousStock - currentStock)` — the standard stock/flow
 * accounting identity (`consumed = produced + previousStock - currentStock`).
 *
 * Found 2026-08-08 (real-map report: Sheep collapsing to near-zero within a year despite selling
 * well): the earlier version dropped the `producedThisQuarter` term and used a bare
 * `previousStock - currentStock` delta. That's correct only when nothing was produced during the
 * interval; for a good whose supply chronically can't keep up with demand (Sheep, entirely bought
 * up as Wool's `recipes: [{ Sheep: 1 }]` ingredient the moment it lands — see goods-generator.ts's
 * Wool entry) stock sits near-zero at EVERY quarter boundary even while large volumes are actually
 * changing hands. The bare delta reads two already-near-zero snapshots as "no demand" and crashes
 * the capacity exactly as if it were an unsellable surplus nobody wants, wiping the species out
 * within a year via §4.3's `carryingCapacity <= 0` hard-zero rule — the opposite of what the real
 * situation (undersupply, not oversupply) called for. Re-adding the production term recovers true
 * throughput regardless of how little stock ever had a chance to visibly pile up.
 *
 * Call from the same quarterly cadence as FoodProduction.generateQuarterlyLedger().
 */
export function recordQuarterlyNonFoodDemand(): void {
  if (getRuralEcosystemDetail() !== "detailed") return;

  const historyTable = getOrCreateNonFoodFaunaDemandHistory();
  const snapshotTable = getOrCreateNonFoodFaunaDemandSnapshot();
  const productionTotals = getOrCreateMarketGoodProductionTotals();
  const productionSnapshotTable = getOrCreateNonFoodFaunaProductionSnapshot();
  if (!historyTable || !snapshotTable || !productionTotals || !productionSnapshotTable) return;

  const goods = getGoods().filter(
    good => good.tags.includes("liveAnimal") && !good.tags.includes("food") && isGoodEnabled(good)
  );
  if (!goods.length) return;

  for (const market of getMarkets()) {
    for (const good of goods) {
      const key = getDemandHistoryKey(market.i, good.i);

      const currentProduced = productionTotals[key] ?? 0;
      const previousProduced = productionSnapshotTable[key] ?? currentProduced;
      const producedThisQuarter = Math.max(0, currentProduced - previousProduced);
      productionSnapshotTable[key] = currentProduced;

      const currentStock = market.goods[good.i]?.stock ?? 0;
      const previousStock = snapshotTable[key] ?? currentStock;
      const consumed = Math.max(0, producedThisQuarter + previousStock - currentStock);
      snapshotTable[key] = currentStock;

      const history = historyTable[key] ?? [];
      history.push(consumed);
      if (history.length > NON_FOOD_DEMAND_QUARTERS_TRACKED) history.shift();
      historyTable[key] = history;
    }
  }
}

// ---- CellInfo summary (read-only) ----

/** One domesticated species' current total headcount (cohorts summed, no age-band breakdown). */
export interface FaunaHeadcountEntry {
  readonly name: string;
  readonly count: number;
}

/**
 * Per-cell wild vs. domesticated headcount summary for the CellInfo dialog — cohorts collapsed to
 * a single total per species since CellInfo has no use for the young/breeding/old split (§4.1's
 * internal bookkeeping). Zero-count domesticated species (not tracked at this cell, or a species
 * whose stock has been fully culled/starved out) are omitted rather than listed at 0. Reads
 * whatever is in the stock table regardless of `ruralEcosystemDetail` — "simplified" mode freezes
 * further updates (§11.2) but does not erase prior counts, so this still reports the last-settled
 * figures rather than always showing "no data".
 */
export function getCellFaunaHeadcounts(cellId: number): {
  wild: number;
  domesticated: FaunaHeadcountEntry[];
} {
  const table = getOrCreateFaunaStockTable();

  const wildCohorts = table?.[getStockKey(cellId, WILD_SPECIES_KEY)];
  const wild = wildCohorts ? cohortTotal(wildCohorts) : 0;

  const domesticated = getGoods()
    .filter(good => good.tags.includes("liveAnimal") && isGoodEnabled(good))
    .map(good => {
      const cohorts = table?.[getStockKey(cellId, good.name)];
      return { name: good.name, count: cohorts ? cohortTotal(cohorts) : 0 };
    })
    .filter(entry => entry.count > 0);

  return { wild, domesticated };
}

/** World-wide (all cells) headcount for the wild stock and every liveAnimal-tagged domesticated species. */
export interface FaunaWorldHeadcountSummary {
  readonly wildTotal: number;
  readonly domesticatedTotal: number;
  /** Per-species world total, keyed by species (`WILD_SPECIES_KEY` for wild, else a Good's name). */
  readonly bySpecies: Readonly<Record<string, number>>;
}

/**
 * World-wide counterpart to `getCellFaunaHeadcounts()` — sums every (cell, species) stock entry
 * into per-species totals in a single pass over the stock table, for balance-tuning tools (e.g.
 * the Balance History snapshot, `generators/balanceSnapshot.ts`) that need "how many of this
 * species exist on the whole map right now" rather than a per-cell breakdown. Read-only: reads
 * `getOrCreateFaunaStockTable()`'s existing entries without seeding any new cell/species pair, so
 * calling this never creates stock for a cell that hasn't been touched yet (mirrors
 * `getCellFaunaHeadcounts()`'s read-only contract).
 */
export function getWorldFaunaHeadcountSummary(): FaunaWorldHeadcountSummary {
  const table = getOrCreateFaunaStockTable();
  const bySpecies: Record<string, number> = {};

  if (table) {
    for (const [key, cohorts] of Object.entries(table)) {
      const separatorIndex = key.indexOf(":");
      if (separatorIndex < 0) continue;
      const speciesKey = key.slice(separatorIndex + 1);
      bySpecies[speciesKey] = (bySpecies[speciesKey] ?? 0) + cohortTotal(cohorts);
    }
  }

  // Only report species the current Goods catalog still recognizes as a liveAnimal (plus the wild
  // stock) — a stale key from a removed/renamed Good would otherwise show up as an unlabeled entry.
  const domesticatedNames = new Set(
    getGoods()
      .filter(good => good.tags.includes("liveAnimal") && isGoodEnabled(good))
      .map(good => good.name)
  );

  let wildTotal = 0;
  let domesticatedTotal = 0;
  const filteredBySpecies: Record<string, number> = {};
  for (const [speciesKey, total] of Object.entries(bySpecies)) {
    if (speciesKey === WILD_SPECIES_KEY) {
      wildTotal += total;
      filteredBySpecies[speciesKey] = total;
    } else if (domesticatedNames.has(speciesKey)) {
      domesticatedTotal += total;
      filteredBySpecies[speciesKey] = total;
    }
  }

  return { wildTotal, domesticatedTotal, bySpecies: filteredBySpecies };
}

/** Clears all fauna-model state — called by the economy extension's "clear"/cleanup paths. */
export function clearFaunaPopulation(): void {
  const table = getOrCreateFaunaStockTable();
  if (table) for (const key of Object.keys(table)) delete table[key];
  const history = getOrCreateNonFoodFaunaDemandHistory();
  if (history) for (const key of Object.keys(history)) delete history[key];
  const snapshot = getOrCreateNonFoodFaunaDemandSnapshot();
  if (snapshot) for (const key of Object.keys(snapshot)) delete snapshot[key];
  const productionSnapshot = getOrCreateNonFoodFaunaProductionSnapshot();
  if (productionSnapshot) for (const key of Object.keys(productionSnapshot)) delete productionSnapshot[key];
}
