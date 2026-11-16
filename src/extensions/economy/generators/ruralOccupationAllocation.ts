/**
 * Rural Occupation Allocator — docs/plan/biome-goods-producer-ecosystem.md §3.
 *
 * The production path receives a staple-field monthly work plan from agriculturalLandUse.ts,
 * adds hunting, fishing, orchard, and herd work to the same resident capacity, and only then
 * derives migration surplus. This prevents a cell's annual average surplus from being spent by
 * two jobs that collide in its harvest month.
 *
 * Hunting keeps its small subsistence claim first. Fishing, viticulture, and husbandry then
 * compete in value order, but each is capped by every month's remaining capacity. The allocator
 * retains a legacy post-staple-surplus entry point for focused callers while production uses the
 * calendar path.
 *
 * Husbandry (§5.4, Phase 3) and viticulture (§5.3, Phase 4) own their own area/labour demand
 * calculations in husbandry.ts/viticulture.ts — `calculateHusbandryDemand`/`calculateViticultureDemand`
 * aggregate a cell's requirement into one candidate each; this module only runs the greedy pass and
 * persists the result. Fishing's bonus-good model (below) is the one candidate still computed inline.
 *
 * Legacy `migratableAdults` unit note (2026-08-07, docs/plan/fauna-biome-realism.md §2.5/§3 Phase E) —
 * `agriculturalLandUse.ts`'s `migratableAdults` is expressed in *rural population points* (the same
 * unit as `cells.pop`/`cells.maleAdults`/`cells.femaleAdults`, self-consistent with what
 * `ruralLaborRelease.ts` compares it against). This module's candidates, however, are all sized in
 * REAL headcounts: `HUNTING_MINIMUM_HEADCOUNT` is documented as "a hamlet too small to field 3
 * hunters" (a real body count, not population points), `GAME_YIELD_PER_HUNTER_PER_MONTH` is derived
 * from `GROSS_FOOD_NEED` the same way `agriculturalLandUse.ts`'s own `foodPotential` is (a real
 * person's food need), and husbandry.ts's/viticulture.ts's `requiredWorkers` are both real headcounts
 * by construction (`area × labourDays / WORKABLE_DAYS_PER_ADULT`, mirroring
 * `agriculturalLandUse.ts`'s own `requiredAdults` before ITS OWN `/ populationRate` step). Passing
 * population-point-scale `migratableAdults` straight into this module as if it were already a real
 * headcount made the whole budget spuriously tiny (population points are typically single digits per
 * cell) — small enough that hunting's fixed 3-headcount floor alone consumed the entire budget on
 * almost every cell with wild-game habitat, starving fishing/viticulture/husbandry map-wide regardless
 * of how large the underlying real population actually was. Fixed by scaling `migratableAdults` up to
 * a real headcount (`× world.populationRate`) once, at the top of `allocateRuralOccupations()` — every
 * candidate's `required` was already real-headcount-scale, so nothing downstream needed to change
 * except `ruralReleasePressure`, which is scaled back down (`÷ populationRate`) before being returned,
 * since `ruralLaborRelease.ts` still expects population points to match `cells.maleAdults`/`femaleAdults`.
 */

import { getMarketSettings } from "../../../simulation/marketSettings";
import { historicalPeriodIndex } from "../../../types/historicalPeriod";
import { LIVELIHOOD_CODE, type WorldContext } from "../../hostCore";
import {
  getFishingRequiredWorkers,
  getFishingWorkers,
  getGoodCellColumn,
  getGoods,
  getHuntingWorkers,
  getMarketCellColumn,
  getOrCreateFaunaStockTable
} from "../economyContext";
import {
  type AgriculturalLandProfile,
  FARM_LABOUR_SAFETY_MARGIN,
  getAnnualRequiredAdults,
  getMonthlyWorkDaysPerAdult,
  getReservedAdultOutflowPoints,
  PEAK_MONTH_WORK_MULTIPLIER,
  WORKABLE_DAYS_PER_ADULT,
  WORKABLE_DAYS_PER_ADULT_PER_MONTH
} from "./agriculturalLandUse";
import { drawWildFaunaOfftake, hasWildGameHabitat, previewWildFaunaOfftake } from "./faunaPopulation";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { isGoodEnabled } from "./goods-generator";
import { calculateHusbandryDemand, getForageAreaHectares } from "./husbandry";
import { ANNUAL_FEED_DM_KG_PER_HEAD, getPastureGrowth, HAY_WORK_DAYS_PER_TONNE_DM } from "./livestockFeedPolicy";
import { getFeedShortfallResponse } from "./livestockFeedState";
import { getRuralTextileRequiredWorkers } from "./textileHouseholdPolicy";
import { calculateViticultureDemand, getPerennialMonthlyLaborWeights } from "./viticulture";

// ---- Placeholder constants (§9.3 — calibration TBD alongside the rest of this ecosystem) ----

/**
 * Share of a forest cell's post-Grain adult surplus claimed for subsistence hunting once a
 * settlement is large enough for the share to dominate the fixed floor below. ~1%, mirroring
 * manpower.ts's PEACE_TARGET_MOBILIZATION — "about as many hunters as a peacetime army's
 * conscription rate" (§10.2).
 */
export const HUNTING_POPULATION_SHARE = 0.01;
/**
 * Minimum hunter headcount a forest cell keeps, regardless of settlement size (§10.2) — still
 * clamped to `availableAdults`, so a hamlet too small to field 3 hunters gives what it has. A
 * future refinement could scale this with local vermin/pest cell density once that's modeled
 * (§10.2's "害獣のセル密度次第" — not yet tracked anywhere in the codebase).
 */
export const HUNTING_MINIMUM_HEADCOUNT = 3;
/**
 * A subsistence hunter's monthly Game yield: enough to roughly cover their own annual food need
 * (GROSS_FOOD_NEED, the same constant Grain's food-ledger uses) plus a modest surplus for
 * market/family/barter — "someone who hunts just enough to feed themselves," not a market-maximizing
 * producer. See docs/plan/biome-goods-producer-ecosystem.md §9.3.
 */
export const HUNTER_SUBSISTENCE_SURPLUS_FACTOR = 1.5;
export const GAME_YIELD_PER_HUNTER_PER_MONTH = (GROSS_FOOD_NEED * HUNTER_SUBSISTENCE_SURPLUS_FACTOR) / 12;

/**
 * Workers needed to fully staff one unit/month of raw fishing bonus-good output potential (the
 * same "raw" rate production-utils.ts used to grant unconditionally). Mirrors mineOperations.ts's
 * getMineRequiredWorkers()/workerFactor pattern; fishing still lacks a real biomass-area labour
 * model (§5.2 leaves catch-luck/stock modeling for a later phase). Viticulture's own equivalent
 * constant (VINEYARD_LABOUR_DAYS_PER_HECTARE) moved to viticulture.ts with Phase 4's area model.
 */
export const FISHING_WORKERS_PER_UNIT_OUTPUT = 6;

/**
 * Harvest-month household helpers, as adult-equivalents. Children and elders are not in the
 * adult labour force (so they do not change unemployment) but historically joined the
 * reaping, binding, and preservation rush (boon work / Nachbarhilfe).
 */
export const HOUSEHOLD_HARVEST_CHILD_EQUIVALENT = 0.35;
export const HOUSEHOLD_HARVEST_ELDER_EQUIVALENT = 0.4;

/**
 * Local stand-ins for production-utils.ts's BONUS_RURAL_PRODUCTION/MAX_BONUS_PRODUCTION, kept as
 * separate constants rather than an import to avoid a production-utils.ts <->
 * ruralOccupationAllocation.ts import cycle (production-utils.ts calls into this module for the
 * gating functions below). Keep in sync by eye if the bonus-good formula changes.
 */
const FISHING_BONUS_OUTPUT_SHARE = 0.25;
const FISHING_BONUS_OUTPUT_CAP = 5;

export interface RuralOccupationAllocation {
  /** Unworked crop days, excluding vacancies in other occupations. Absent on the legacy surplus path. */
  readonly cropLaborShortage?: Float32Array;
  /** Fixed subsistence hunter headcount per (forest) cell — not gated by a "required" cap. */
  readonly huntingWorkers: Float32Array;
  /** Assigned/required fishing workers, keyed by the cell that holds the Fish bonus-good slot (may be water). */
  readonly fishingWorkers: Float32Array;
  readonly fishingRequiredWorkers: Float32Array;
  /** Assigned/required viticulture workers, keyed by the (land) producing cell. */
  readonly viticultureWorkers: Float32Array;
  readonly viticultureRequiredWorkers: Float32Array;
  /** Assigned/required husbandry workers (§5.4), keyed by the (land) producing cell. */
  readonly husbandryWorkers: Float32Array;
  readonly husbandryRequiredWorkers: Float32Array;
  readonly husbandryMonthlyWorkDays: Float32Array;
  /** Handcraft capacity reserved after existing occupations, in real worker-months per month. */
  readonly householdTextileWorkers: Float32Array;
  /** Peak common rural workload after allocated occupations, in population points. */
  readonly farmLaborRequired: Float32Array;
  /** Adults available for migration after the common monthly peak and safety margin. */
  readonly migratableAdults: Float32Array;
  /** Work-days that would need seasonal hires after the safe migration release, `cellId * 12 + month`. */
  readonly seasonalLaborShortage: Float32Array;
  /** Residual after Grain + hunting + fishing + viticulture + husbandry claims; feeds ruralLaborRelease.ts. */
  readonly ruralReleasePressure: Float32Array;
  /** Town adults' days in the fields and meadows, `burgId * 12 + month` (docs/plan/urban-harvest-help.md). */
  readonly townHarvestHelperDays?: Float32Array;
  /** Hay days carried from a short hay month to later months' regrowth, cell * 12 + month. */
  readonly hayCatchUpDays?: Float32Array;
  /** Off-field days left on rest days only, cell * 12 + month (docs/plan/livestock-feed-shortfall.md §9). */
  readonly restDayHayDays?: Float32Array;
}

type RuralLaborPlan = Pick<
  AgriculturalLandProfile,
  "cropLaborDaysByMonth" | "minimumCropLaborDaysByMonth" | "farmLaborRequired" | "migratableAdults"
> & {
  readonly reservedLaborExport?: Float32Array;
};

function getHuntingSubsistenceClaim(availableAdults: number): number {
  if (availableAdults <= 0) return 0;
  const share = availableAdults * HUNTING_POPULATION_SHARE;
  return Math.min(availableAdults, Math.max(HUNTING_MINIMUM_HEADCOUNT, share));
}

interface FishingOffer {
  readonly holderId: number;
  readonly share: number;
}

/**
 * Fish has no biomeOutputByTag — it only produces via the single "bonus good per cell" slot
 * (production-utils.ts's getGoodCellColumn()), which can land on a water cell. Labour to staff it
 * has to come from adjacent land, so each holder's requiredWorkers is split evenly across its
 * land neighbors (or claimed whole by itself, if the holder cell is land).
 */
function collectFishingOffers(
  world: Readonly<WorldContext>,
  fishGoodId: number,
  fishingRequiredWorkers: Float32Array
): Map<number, FishingOffer[]> {
  const offersByLandCell = new Map<number, FishingOffer[]>();
  const cells = world.pack.cells;
  const goodColumn = getGoodCellColumn();
  if (goodColumn.length !== cells.i.length) return offersByLandCell;

  for (const holderId of cells.i) {
    if (goodColumn[holderId] !== fishGoodId) continue;

    const isHolderLand = cells.h[holderId] >= 20;
    const popProxy = isHolderLand
      ? Math.max(0, cells.pop[holderId] ?? 0)
      : (cells.c[holderId] ?? []).reduce((total, n) => total + Math.max(0, cells.pop[n] ?? 0), 0);
    const rawOutput = Math.min(popProxy * FISHING_BONUS_OUTPUT_SHARE, FISHING_BONUS_OUTPUT_CAP);
    const required = rawOutput * FISHING_WORKERS_PER_UNIT_OUTPUT;
    fishingRequiredWorkers[holderId] = required;
    if (required <= 0) continue;

    if (isHolderLand) {
      const offers = offersByLandCell.get(holderId) ?? [];
      offers.push({ holderId, share: required });
      offersByLandCell.set(holderId, offers);
      continue;
    }

    const landNeighbors = (cells.c[holderId] ?? []).filter(n => cells.h[n] >= 20);
    if (!landNeighbors.length) continue;
    const share = required / landNeighbors.length;
    for (const landCellId of landNeighbors) {
      const offers = offersByLandCell.get(landCellId) ?? [];
      offers.push({ holderId, share });
      offersByLandCell.set(landCellId, offers);
    }
  }

  return offersByLandCell;
}

/**
 * Runs the allocator over every land cell and returns the resulting per-occupation columns.
 * `migratableAdults` must come from the same calculateAgriculturalLandProfile() pass that is
 * about to be persisted — this function only reallocates that budget, it does not recompute it.
 */
/**
 * Share of rural children who can mind animals: roughly those aged 7-14 of the under-adult cohort.
 * Medieval herding of sheep, swine, geese and cows was a common child's task (Hanawalt 1986,
 * The Ties That Bound, ch.10; Orme 2001, Medieval Children, ch.9). Model policy, not a measured share.
 */
export const CHILD_HERDING_SHARE = 0.35;
/**
 * Share of haymaking work children can take: tedding, raking and leading carts, while adults mow
 * and pitch (Hanawalt 1986, ch.10; Fox 1996, "Exploitation of the landless by lords and tenants").
 * Model policy (E1 §7.47), not a measured share.
 */
export const CHILD_HAYMAKING_SHARE = 0.3;
/** Routine, year-round share of herding work; matches the species profiles' seasonal event share. */
const HUSBANDRY_SEASONAL_EVENT_SHARE = 0.2;

function getRuralChildren(cells: WorldContext["pack"]["cells"], cellId: number): number {
  const adults = Math.max(0, cells.maleAdults?.[cellId] ?? 0) + Math.max(0, cells.femaleAdults?.[cellId] ?? 0);
  return Math.max(0, (cells.pop[cellId] ?? 0) - adults);
}

export function allocateRuralOccupations(
  world: Readonly<WorldContext>,
  laborPlan: RuralLaborPlan | Float32Array
): RuralOccupationAllocation {
  return laborPlan instanceof Float32Array
    ? allocateRuralOccupationsFromSurplus(world, laborPlan)
    : allocateRuralOccupationsFromCalendar(world, laborPlan);
}

/**
 * Compatibility path for direct callers/tests that still supply the old post-staple surplus.
 * Production uses `allocateRuralOccupationsFromCalendar` through the public dispatcher above.
 */
function allocateRuralOccupationsFromSurplus(
  world: Readonly<WorldContext>,
  migratableAdults: Float32Array
): RuralOccupationAllocation {
  const cells = world.pack.cells;
  const count = cells?.i?.length ?? 0;
  const huntingWorkers = new Float32Array(count);
  const fishingWorkers = new Float32Array(count);
  const fishingRequiredWorkers = new Float32Array(count);
  const viticultureWorkers = new Float32Array(count);
  const viticultureRequiredWorkers = new Float32Array(count);
  const husbandryWorkers = new Float32Array(count);
  const husbandryRequiredWorkers = new Float32Array(count);
  // This legacy allocator has no monthly crop calendar; do not invent peak reservations.
  const husbandryMonthlyWorkDays = new Float32Array();
  const householdTextileWorkers = new Float32Array(count);
  const farmLaborRequired = new Float32Array(count);
  const seasonalLaborShortage = new Float32Array(count * 12);
  const ruralReleasePressure = new Float32Array(count);
  if (!count || migratableAdults.length !== count) {
    return {
      huntingWorkers,
      fishingWorkers,
      fishingRequiredWorkers,
      viticultureWorkers,
      viticultureRequiredWorkers,
      husbandryWorkers,
      husbandryRequiredWorkers,
      husbandryMonthlyWorkDays,
      householdTextileWorkers,
      farmLaborRequired,
      migratableAdults,
      seasonalLaborShortage,
      ruralReleasePressure
    };
  }

  const enabledGoods = getGoods().filter(isGoodEnabled);
  const goodsByName = new Map(enabledGoods.map(good => [good.name, good]));
  const fishGood = goodsByName.get("Fish");

  const fishOffersByLandCell =
    fishGood && isGoodEnabled(fishGood) ? collectFishingOffers(world, fishGood.i, fishingRequiredWorkers) : new Map();

  // migratableAdults arrives in rural population points; every candidate below is sized in real
  // headcounts, so it's converted once here (see module doc-comment's "migratableAdults unit bug").
  const populationRate = Math.max(1, world.populationRate || 1);

  for (const cellId of cells.i) {
    if (cells.h[cellId] < 20) continue; // rural occupations claim land-cell labour only

    let budget = Math.max(0, migratableAdults[cellId] ?? 0) * populationRate;
    if (budget <= 0) continue;

    // No longer forest-only (2026-08-07, docs/plan/fauna-biome-realism.md §2.2/§3 Phase A) — the
    // hunting claim now follows the same wild-game biome eligibility as faunaPopulation.ts's
    // carrying capacity, instead of an independently-hardcoded forest tag check.
    const hunting = hasWildGameHabitat(cellId) ? getHuntingSubsistenceClaim(budget) : 0;
    huntingWorkers[cellId] = hunting;
    budget -= hunting;

    const candidates: {
      kind: "viticulture" | "fishing" | "husbandry";
      required: number;
      value: number;
      holderId?: number;
    }[] = [];

    const viticultureDemand = calculateViticultureDemand(world, cellId);
    viticultureRequiredWorkers[cellId] = viticultureDemand.requiredWorkers;
    if (viticultureDemand.requiredWorkers > 0)
      candidates.push({
        kind: "viticulture",
        required: viticultureDemand.requiredWorkers,
        value: viticultureDemand.value
      });

    for (const offer of fishOffersByLandCell.get(cellId) ?? []) {
      if (offer.share > 0)
        candidates.push({ kind: "fishing", required: offer.share, value: fishGood!.value, holderId: offer.holderId });
    }

    const husbandryDemand = calculateHusbandryDemand(world, cellId);
    husbandryRequiredWorkers[cellId] = husbandryDemand.requiredWorkers;
    if (husbandryDemand.requiredWorkers > 0)
      candidates.push({ kind: "husbandry", required: husbandryDemand.requiredWorkers, value: husbandryDemand.value });

    // Greedy, value-ranked allocation up to each candidate's requiredWorkers cap — the same
    // "simple sufficiency model" mineOperations.ts uses, not a linear-programming optimum (§3.1).
    candidates.sort((a, b) => b.value - a.value);
    for (const candidate of candidates) {
      if (budget <= 0) break;
      const assign = Math.min(budget, candidate.required);
      if (assign <= 0) continue;
      if (candidate.kind === "viticulture") viticultureWorkers[cellId] += assign;
      else if (candidate.kind === "husbandry") {
        husbandryWorkers[cellId] += assign;
      } else fishingWorkers[candidate.holderId!] += assign;
      budget -= assign;
    }

    const textileRequired = getRuralTextileRequiredWorkers(world, cellId, enabledGoods);
    const textileAssigned = Math.min(Math.max(0, budget), textileRequired);
    householdTextileWorkers[cellId] = textileAssigned;
    budget -= textileAssigned;
    farmLaborRequired[cellId] += textileAssigned / populationRate;
    migratableAdults[cellId] = Math.max(0, (migratableAdults[cellId] ?? 0) - textileAssigned / populationRate);

    // Back to population points — ruralLaborRelease.ts compares this against cells.maleAdults/femaleAdults.
    ruralReleasePressure[cellId] = Math.max(0, budget) / populationRate;
  }

  return {
    huntingWorkers,
    fishingWorkers,
    fishingRequiredWorkers,
    viticultureWorkers,
    viticultureRequiredWorkers,
    husbandryWorkers,
    husbandryRequiredWorkers,
    husbandryMonthlyWorkDays,
    householdTextileWorkers,
    farmLaborRequired,
    migratableAdults,
    seasonalLaborShortage,
    ruralReleasePressure
  };
}

const UNIFORM_MONTHLY_WEIGHTS = [
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

interface MonthlyLaborCandidate {
  readonly kind: "viticulture" | "fishing" | "husbandry";
  readonly requiredWorkers: number;
  readonly value: number;
  readonly monthlyWeights: readonly number[];
  readonly holderId?: number;
}

/**
 * Production path: staple fields, routine rural occupations, and seasonal work all consume the
 * same month-by-month resident capacity before migration surplus is calculated.
 */
function allocateRuralOccupationsFromCalendar(
  world: Readonly<WorldContext>,
  laborPlan: RuralLaborPlan
): RuralOccupationAllocation {
  const cells = world.pack.cells;
  const count = cells?.i?.length ?? 0;
  const huntingWorkers = new Float32Array(count);
  const fishingWorkers = new Float32Array(count);
  const fishingRequiredWorkers = new Float32Array(count);
  const viticultureWorkers = new Float32Array(count);
  const viticultureRequiredWorkers = new Float32Array(count);
  const husbandryWorkers = new Float32Array(count);
  const husbandryRequiredWorkers = new Float32Array(count);
  const husbandryMonthlyWorkDays = new Float32Array(count * 12);
  const haymakingShortfallDays = new Float32Array(count * 12);
  const householdTextileWorkers = new Float32Array(count);
  const farmLaborRequired = new Float32Array(count);
  const migratableAdults = new Float32Array(count);
  const seasonalLaborShortage = new Float32Array(count * 12);
  const cropLaborShortage = new Float32Array(count * 12);
  const ruralReleasePressure = new Float32Array(count);
  const currentDaysByCell = new Float32Array(count * 12);
  const desiredDaysByCell = new Float32Array(count * 12);
  const minimumDaysByCell = new Float32Array(count * 12);
  const workDaysPerAdultByCell = new Float32Array(count * 12);
  const offField: OffFieldDays = {
    cap: new Float32Array(count * 12),
    used: new Float32Array(count * 12),
    workdayCap: new Float32Array(count * 12),
    workdayUsed: new Float32Array(count * 12)
  };
  const offFieldMonthlyDays = getOffFieldMonthlyDaysPerAdult();
  const offFieldWorkdayDays = getOffFieldWorkdayDaysPerAdult(world.options?.historicalPeriod);
  if (
    !count ||
    laborPlan.cropLaborDaysByMonth.length !== count * 12 ||
    laborPlan.minimumCropLaborDaysByMonth.length !== count * 12
  ) {
    return allocateRuralOccupationsFromSurplus(world, laborPlan.migratableAdults);
  }

  const enabledGoods = getGoods().filter(isGoodEnabled);
  const goodsByName = new Map(enabledGoods.map(good => [good.name, good]));
  const fishGood = goodsByName.get("Fish");
  const fishOffersByLandCell =
    fishGood && isGoodEnabled(fishGood) ? collectFishingOffers(world, fishGood.i, fishingRequiredWorkers) : new Map();
  const populationRate = Math.max(1, world.populationRate || 1);

  for (const cellId of cells.i) {
    if (cells.h[cellId] < 20) continue;
    const ruralAdultPoints =
      Math.max(0, cells.maleAdults?.[cellId] ?? 0) + Math.max(0, cells.femaleAdults?.[cellId] ?? 0);
    const residentAdults = ruralAdultPoints * populationRate;
    const currentDays = copyMonthlyDays(laborPlan.cropLaborDaysByMonth, cellId);
    const minimumDays = copyMonthlyDays(laborPlan.minimumCropLaborDaysByMonth, cellId);
    const desiredDays = currentDays.slice();
    const workDaysPerAdult = getMonthlyWorkDaysPerAdult(laborPlan.cropLaborDaysByMonth, cellId * 12);
    workDaysPerAdultByCell.set(workDaysPerAdult, cellId * 12);
    for (let month = 0; month < 12; month++) {
      offField.cap[cellId * 12 + month] = residentAdults * Math.max(0, offFieldMonthlyDays - workDaysPerAdult[month]);
      offField.workdayCap[cellId * 12 + month] =
        residentAdults * Math.max(0, offFieldWorkdayDays - workDaysPerAdult[month]);
    }
    const huntingRequired = hasWildGameHabitat(cellId) ? getHuntingSubsistenceClaim(residentAdults) : 0;
    addWorkerDays(desiredDays, huntingRequired, UNIFORM_MONTHLY_WEIGHTS);
    const huntingFactor = getMaximumAssignableFactor(
      currentDays,
      huntingRequired,
      UNIFORM_MONTHLY_WEIGHTS,
      residentAdults,
      workDaysPerAdult
    );
    const assignedHunting = huntingRequired * huntingFactor;
    huntingWorkers[cellId] = assignedHunting;
    addWorkerDays(currentDays, assignedHunting, UNIFORM_MONTHLY_WEIGHTS);
    addWorkerDays(minimumDays, assignedHunting, UNIFORM_MONTHLY_WEIGHTS);

    const candidates: MonthlyLaborCandidate[] = [];
    const viticultureDemand = calculateViticultureDemand(world, cellId);
    viticultureRequiredWorkers[cellId] = viticultureDemand.requiredWorkers;
    if (viticultureDemand.requiredWorkers > 0) {
      candidates.push({
        kind: "viticulture",
        requiredWorkers: viticultureDemand.requiredWorkers,
        value: viticultureDemand.value,
        monthlyWeights: getPerennialMonthlyLaborWeights(world, cellId)
      });
    }
    for (const offer of fishOffersByLandCell.get(cellId) ?? []) {
      if (offer.share > 0) {
        candidates.push({
          kind: "fishing",
          requiredWorkers: offer.share,
          value: fishGood!.value,
          monthlyWeights: UNIFORM_MONTHLY_WEIGHTS,
          holderId: offer.holderId
        });
      }
    }
    const husbandryDemand = calculateHusbandryDemand(world, cellId);
    husbandryRequiredWorkers[cellId] = husbandryDemand.requiredWorkers;
    if (husbandryDemand.requiredWorkers > 0) {
      candidates.push({
        kind: "husbandry",
        requiredWorkers: husbandryDemand.requiredWorkers,
        value: husbandryDemand.value,
        monthlyWeights: husbandryDemand.monthlyLaborWeights ?? UNIFORM_MONTHLY_WEIGHTS
      });
    }

    for (const candidate of candidates) addWorkerDays(desiredDays, candidate.requiredWorkers, candidate.monthlyWeights);
    candidates.sort((a, b) => b.value - a.value);
    for (const candidate of candidates) {
      if (candidate.kind === "husbandry") {
        // These are month-local household tasks. One busy crop month must not cancel
        // care and seasonal work in every other month, or spend another month's slack.
        let annualAssignedDays = 0;
        const hayOnRestDays = getFeedShortfallResponse(cellId) === "work";
        // Children watch the flocks and herds day to day; adults take the seasonal work.
        const childDaysPerMonth =
          getRuralChildren(cells, cellId) * populationRate * CHILD_HERDING_SHARE * (WORKABLE_DAYS_PER_ADULT / 12);
        const routineCareDaysPerMonth =
          ((husbandryDemand.careWorkers ?? 0) * WORKABLE_DAYS_PER_ADULT * (1 - HUSBANDRY_SEASONAL_EVENT_SHARE)) / 12;
        for (let month = 0; month < 12; month++) {
          const requestedDays =
            candidate.requiredWorkers * WORKABLE_DAYS_PER_ADULT * (candidate.monthlyWeights[month] ?? 0);
          const careChildDays = Math.min(childDaysPerMonth, routineCareDaysPerMonth, requestedDays);
          const hayDays =
            (husbandryDemand.hayWorkers ?? 0) *
            WORKABLE_DAYS_PER_ADULT *
            (husbandryDemand.hayMonthlyLaborWeights?.[month] ?? 0);
          const childDays = Math.min(
            requestedDays,
            careChildDays + Math.min(childDaysPerMonth - careChildDays, hayDays * CHILD_HAYMAKING_SHARE)
          );
          const remainingDays = Math.max(0, residentAdults * workDaysPerAdult[month] - currentDays[month]);
          // Care goes on every day, rest days included; hay is servile work, made on working days only.
          const adultNeed = Math.max(0, requestedDays - childDays);
          const hayAdultNeed = Math.min(adultNeed, Math.max(0, hayDays - (childDays - careChildDays)));
          const offFieldCare = spendOffField(offField, cellId * 12 + month, adultNeed - hayAdultNeed, false);
          // After a year short of feed, keepers may make hay on rest days as work of necessity.
          const offFieldHay = spendOffField(offField, cellId * 12 + month, hayAdultNeed, !hayOnRestDays);
          const offFieldDays = offFieldCare + offFieldHay;
          const adultDays = offFieldDays + Math.min(adultNeed - offFieldDays, remainingDays);
          const assignedDays = childDays + adultDays;
          husbandryMonthlyWorkDays[cellId * 12 + month] = assignedDays;
          haymakingShortfallDays[cellId * 12 + month] = Math.min(hayDays, requestedDays - assignedDays);
          // Only the days taken from the field calendar count against the fields, migration and release.
          currentDays[month] += adultDays - offFieldDays;
          minimumDays[month] += adultDays - offFieldDays;
          annualAssignedDays += assignedDays;
        }
        husbandryWorkers[cellId] = annualAssignedDays / WORKABLE_DAYS_PER_ADULT;
        continue;
      }
      const factor = getMaximumAssignableFactor(
        currentDays,
        candidate.requiredWorkers,
        candidate.monthlyWeights,
        residentAdults,
        workDaysPerAdult
      );
      const assigned = candidate.requiredWorkers * factor;
      if (candidate.kind === "viticulture") viticultureWorkers[cellId] += assigned;
      else fishingWorkers[candidate.holderId!] += assigned;
      addWorkerDays(currentDays, assigned, candidate.monthlyWeights);
      addWorkerDays(minimumDays, assigned, candidate.monthlyWeights);
    }

    const textileRequired = getRuralTextileRequiredWorkers(world, cellId, enabledGoods);
    const reservedOutflow = Math.max(
      laborPlan.reservedLaborExport?.[cellId] ?? 0,
      getReservedAdultOutflowPoints(cells, cellId)
    );
    const textileAdults = Math.max(0, residentAdults - reservedOutflow * populationRate);
    const textileOffField = Array.from({ length: 12 }, (_, month) => getOffFieldLeft(offField, cellId * 12 + month));
    const textileAssigned =
      textileRequired *
      getMaximumAssignableFactor(
        // A field month over capacity must not eat into the off-field days.
        currentDays.map(
          (days, month) => Math.min(days, textileAdults * workDaysPerAdult[month]) - textileOffField[month]
        ),
        textileRequired,
        UNIFORM_MONTHLY_WEIGHTS,
        textileAdults,
        workDaysPerAdult
      );
    householdTextileWorkers[cellId] = textileAssigned;
    const textileMonthlyDays = (textileAssigned * WORKABLE_DAYS_PER_ADULT) / 12;
    for (let month = 0; month < 12; month++) {
      const offFieldDays = spendOffField(offField, cellId * 12 + month, textileMonthlyDays);
      currentDays[month] += textileMonthlyDays - offFieldDays;
      minimumDays[month] += textileMonthlyDays - offFieldDays;
      desiredDays[month] += textileMonthlyDays - offFieldDays;
    }

    writeMonthlyDays(currentDaysByCell, cellId, currentDays);
    writeMonthlyDays(desiredDaysByCell, cellId, desiredDays);
    writeMonthlyDays(minimumDaysByCell, cellId, minimumDays);
  }

  const aidReceivedByCell = applyHarvestMutualAid(world, currentDaysByCell, desiredDaysByCell, workDaysPerAdultByCell);
  const townHelp = createTownHarvestHelp(world);
  applyRegionalHarvestHelp(
    world,
    currentDaysByCell,
    desiredDaysByCell,
    workDaysPerAdultByCell,
    aidReceivedByCell,
    townHelp
  );
  applyHaymakingMutualAid(
    world,
    currentDaysByCell,
    desiredDaysByCell,
    workDaysPerAdultByCell,
    haymakingShortfallDays,
    husbandryMonthlyWorkDays,
    husbandryWorkers,
    townHelp,
    offField
  );
  const townHarvestHelperDays = spreadTownHarvestHelp(world, townHelp);
  const hayCatchUpDays = carryHayShortfall(
    world,
    currentDaysByCell,
    workDaysPerAdultByCell,
    haymakingShortfallDays,
    husbandryMonthlyWorkDays,
    husbandryWorkers,
    offField
  );

  for (const cellId of cells.i) {
    if (cells.h[cellId] < 20) continue;
    const ruralAdultPoints =
      Math.max(0, cells.maleAdults?.[cellId] ?? 0) + Math.max(0, cells.femaleAdults?.[cellId] ?? 0);
    const residentAdults = ruralAdultPoints * populationRate;
    const reservedLaborExport = Math.max(
      laborPlan.reservedLaborExport?.[cellId] ?? 0,
      getReservedAdultOutflowPoints(cells, cellId)
    );
    const currentDays = copyStoredMonthlyDays(currentDaysByCell, cellId);
    const desiredDays = copyStoredMonthlyDays(desiredDaysByCell, cellId);
    const minimumDays = copyStoredMonthlyDays(minimumDaysByCell, cellId);
    const annualCurrentAdults = getAnnualRequiredAdults(currentDays);
    const annualMinimumAdults = getAnnualRequiredAdults(minimumDays);
    farmLaborRequired[cellId] = annualCurrentAdults / populationRate;
    // Honour the land-use reserve (this year's urban-bound outflow). Harvest
    // mutual aid must not reclassify that cohort as year-round farm employment.
    // An annual average surplus is not safe to release if those residents are
    // still needed in a harvest month, including the work they do as helpers.
    let peakSafeOutflow = residentAdults;
    for (let month = 0; month < 12; month++) {
      const index = cellId * 12 + month;
      const workDays = workDaysPerAdultByCell[index] || WORKABLE_DAYS_PER_ADULT_PER_MONTH;
      const helperDays = getHouseholdHarvestHelperDays(cells, cellId, populationRate, workDays);
      const residentDays = Math.max(0, currentDays[month] - helperDays - (aidReceivedByCell[index] ?? 0));
      peakSafeOutflow = Math.min(peakSafeOutflow, Math.max(0, residentAdults - residentDays / workDays));
    }
    migratableAdults[cellId] = Math.max(
      reservedLaborExport,
      Math.min(
        peakSafeOutflow / populationRate,
        ruralAdultPoints - (annualCurrentAdults / populationRate) * FARM_LABOUR_SAFETY_MARGIN
      )
    );
    ruralReleasePressure[cellId] = Math.max(
      0,
      ruralAdultPoints - (annualMinimumAdults / populationRate) * FARM_LABOUR_SAFETY_MARGIN
    );

    applySubsistenceLivelihoodEmployment(
      cells.livelihood?.[cellId] ?? 0,
      ruralAdultPoints,
      getReservedAdultOutflowPoints(cells, cellId),
      farmLaborRequired,
      migratableAdults,
      ruralReleasePressure,
      cellId
    );

    const adultsAfterMigration = Math.max(0, residentAdults - migratableAdults[cellId] * populationRate);
    for (let month = 0; month < 12; month++) {
      const workDays = workDaysPerAdultByCell[cellId * 12 + month] || WORKABLE_DAYS_PER_ADULT_PER_MONTH;
      const helperDays = getHouseholdHarvestHelperDays(cells, cellId, populationRate, workDays);
      seasonalLaborShortage[cellId * 12 + month] = Math.max(
        0,
        desiredDays[month] -
          adultsAfterMigration * workDays -
          helperDays -
          (aidReceivedByCell[cellId * 12 + month] ?? 0)
      );
      // Desired jobs can remain unfilled after staple work has already been reserved.
      // Those vacancies must not erase a crop that the actual calendar can harvest.
      cropLaborShortage[cellId * 12 + month] = Math.min(
        Math.max(0, laborPlan.cropLaborDaysByMonth[cellId * 12 + month]),
        Math.max(
          0,
          currentDays[month] -
            adultsAfterMigration * workDays -
            helperDays -
            (aidReceivedByCell[cellId * 12 + month] ?? 0)
        )
      );
    }
  }

  return {
    cropLaborShortage,
    huntingWorkers,
    fishingWorkers,
    fishingRequiredWorkers,
    viticultureWorkers,
    viticultureRequiredWorkers,
    husbandryWorkers,
    husbandryRequiredWorkers,
    husbandryMonthlyWorkDays,
    householdTextileWorkers,
    farmLaborRequired,
    migratableAdults,
    seasonalLaborShortage,
    ruralReleasePressure,
    townHarvestHelperDays,
    hayCatchUpDays,
    restDayHayDays: Float32Array.from(offField.cap, (_, index) =>
      Math.max(0, getOffFieldLeft(offField, index, false) - getOffFieldLeft(offField, index))
    )
  };
}

function copyMonthlyDays(source: Float32Array, cellId: number): number[] {
  return Array.from(source.subarray(cellId * 12, cellId * 12 + 12));
}

function writeMonthlyDays(target: Float32Array, cellId: number, days: readonly number[]): void {
  target.set(days, cellId * 12);
}

function copyStoredMonthlyDays(source: Float32Array, cellId: number): number[] {
  return copyMonthlyDays(source, cellId);
}

function getHouseholdHarvestHelperDays(
  cells: WorldContext["pack"]["cells"],
  cellId: number,
  populationRate: number,
  workDaysPerAdult = WORKABLE_DAYS_PER_ADULT_PER_MONTH
): number {
  const children = Math.max(0, cells.children?.[cellId] ?? 0) * populationRate;
  const elders = Math.max(0, cells.elders?.[cellId] ?? 0) * populationRate;
  return (
    (children * HOUSEHOLD_HARVEST_CHILD_EQUIVALENT + elders * HOUSEHOLD_HARVEST_ELDER_EQUIVALENT) * workDaysPerAdult
  );
}

/**
 * Neighbour boon-work: a cell whose harvest/preservation month exceeds its own adults
 * draws unused monthly capacity from adjacent same-state land cells. Helpers become
 * employed (their currentDays rise) rather than remaining "unemployed surplus."
 */
function applyHarvestMutualAid(
  world: Readonly<WorldContext>,
  currentDaysByCell: Float32Array,
  desiredDaysByCell: Float32Array,
  workDaysPerAdultByCell: Float32Array
): Float32Array {
  const cells = world.pack.cells;
  const aidReceivedByCell = new Float32Array(Math.max(0, cells?.i?.length ?? 0) * 12);
  if (!cells?.i || !cells.c) return aidReceivedByCell;
  const populationRate = Math.max(1, world.populationRate || 1);

  for (let month = 0; month < 12; month++) {
    const slack = new Float32Array(cells.i.length);
    const shortage = new Float32Array(cells.i.length);
    for (const cellId of cells.i) {
      if ((cells.h[cellId] ?? 0) < 20) continue;
      const ruralAdultPoints =
        Math.max(0, cells.maleAdults?.[cellId] ?? 0) + Math.max(0, cells.femaleAdults?.[cellId] ?? 0);
      const workDays = workDaysPerAdultByCell[cellId * 12 + month] || WORKABLE_DAYS_PER_ADULT_PER_MONTH;
      const capacity = ruralAdultPoints * populationRate * workDays;
      const helperDays = getHouseholdHarvestHelperDays(cells, cellId, populationRate, workDays);
      const current = currentDaysByCell[cellId * 12 + month] ?? 0;
      slack[cellId] = Math.max(0, capacity - current);
      // Unfilled occupation requests are not booked work and cannot claim harvest hands.
      shortage[cellId] = Math.max(0, current - capacity - helperDays);
    }

    for (const cellId of cells.i) {
      let remaining = shortage[cellId];
      if (remaining <= 0) continue;
      const stateId = cells.state?.[cellId] ?? 0;
      if (!stateId) continue;
      for (const neighborId of cells.c[cellId] ?? []) {
        if (remaining <= 0) break;
        if ((cells.h[neighborId] ?? 0) < 20) continue;
        if ((cells.state?.[neighborId] ?? 0) !== stateId) continue;
        const transfer = Math.min(remaining, slack[neighborId] ?? 0);
        if (transfer <= 0) continue;
        currentDaysByCell[neighborId * 12 + month] += transfer;
        desiredDaysByCell[neighborId * 12 + month] += transfer;
        aidReceivedByCell[cellId * 12 + month] += transfer;
        slack[neighborId] -= transfer;
        remaining -= transfer;
      }
    }
  }
  return aidReceivedByCell;
}

/**
 * Hay boons: neighbours of the same state mow and cart hay that a cell's own adults cannot reach
 * that month (E1 §7.49), then hired hands from the market area (E1 §7.50). Runs after the grain
 * harvest aid, so only hands the harvest left idle help.
 */
function applyHaymakingMutualAid(
  world: Readonly<WorldContext>,
  currentDaysByCell: Float32Array,
  desiredDaysByCell: Float32Array,
  workDaysPerAdultByCell: Float32Array,
  shortfallDays: Float32Array,
  husbandryMonthlyWorkDays: Float32Array,
  husbandryWorkers: Float32Array,
  townHelp?: TownHarvestHelp,
  offField?: OffFieldDays
): void {
  const cells = world.pack.cells;
  if (!cells?.i || !cells.c) return;
  const populationRate = Math.max(1, world.populationRate || 1);
  const marketCellColumn = getMarketCellColumn();
  const mobility = getRegionalHarvestMobility(world.options?.historicalPeriod);
  for (let month = 0; month < 12; month++) {
    const slack = new Float32Array(cells.i.length);
    for (const cellId of cells.i) {
      if ((cells.h[cellId] ?? 0) < 20) continue;
      const ruralAdultPoints =
        Math.max(0, cells.maleAdults?.[cellId] ?? 0) + Math.max(0, cells.femaleAdults?.[cellId] ?? 0);
      const workDays = workDaysPerAdultByCell[cellId * 12 + month] || WORKABLE_DAYS_PER_ADULT_PER_MONTH;
      slack[cellId] =
        Math.max(0, ruralAdultPoints * populationRate * workDays - currentDaysByCell[cellId * 12 + month]) +
        getOffFieldLeft(offField, cellId * 12 + month);
    }
    for (const cellId of cells.i) {
      let remaining = shortfallDays[cellId * 12 + month];
      if (!(remaining > 0)) continue;
      const stateId = cells.state?.[cellId] ?? 0;
      if (!stateId) continue;
      for (const neighborId of cells.c[cellId] ?? []) {
        if (remaining <= 0) break;
        if ((cells.h[neighborId] ?? 0) < 20 || (cells.state?.[neighborId] ?? 0) !== stateId) continue;
        const transfer = Math.min(remaining, slack[neighborId]);
        if (!(transfer > 0)) continue;
        const fieldDays = transfer - spendOffField(offField, neighborId * 12 + month, transfer);
        currentDaysByCell[neighborId * 12 + month] += fieldDays;
        desiredDaysByCell[neighborId * 12 + month] += fieldDays;
        husbandryMonthlyWorkDays[cellId * 12 + month] += transfer;
        husbandryWorkers[cellId] += transfer / WORKABLE_DAYS_PER_ADULT;
        slack[neighborId] -= transfer;
        remaining -= transfer;
      }
      shortfallDays[cellId * 12 + month] = remaining;
    }
    // Hired hay hands from the rest of the market area, at the same travelling share as harvest gangs.
    if (marketCellColumn.length !== cells.i.length) continue;
    const pool = new Map<number, { slack: number; need: number }>();
    for (const cellId of cells.i) {
      const marketId = marketCellColumn[cellId] ?? 0;
      if (!marketId || (cells.h[cellId] ?? 0) < 20) continue;
      const row = pool.get(marketId) ?? { slack: 0, need: 0 };
      row.slack += slack[cellId] * mobility;
      row.need += Math.max(0, shortfallDays[cellId * 12 + month]);
      pool.set(marketId, row);
    }
    for (const cellId of cells.i) {
      const row = pool.get(marketCellColumn[cellId] ?? 0);
      if (!row || !(row.need > 0) || (cells.h[cellId] ?? 0) < 20) continue;
      const index = cellId * 12 + month;
      const fill = Math.min(1, row.slack / row.need);
      const hired = Math.max(0, shortfallDays[index]) * fill;
      if (hired > 0) {
        husbandryMonthlyWorkDays[index] += hired;
        husbandryWorkers[cellId] += hired / WORKABLE_DAYS_PER_ADULT;
        shortfallDays[index] -= hired;
      }
      const given = slack[cellId] * mobility * Math.min(1, row.need / Math.max(row.slack, 1e-9));
      if (given > 0) {
        const fieldDays = given - spendOffField(offField, index, given);
        currentDaysByCell[index] += fieldDays;
        desiredDaysByCell[index] += fieldDays;
      }
    }
    // Town adults go out to the meadows for what is still uncut, as artificers were called to the hay
    // and corn harvest (docs/plan/urban-harvest-help.md).
    if (!townHelp?.hay) continue;
    const needByMarket = new Map<number, number>();
    for (const cellId of cells.i) {
      const marketId = marketCellColumn[cellId] ?? 0;
      const need = shortfallDays[cellId * 12 + month];
      if (marketId && need > 0) needByMarket.set(marketId, (needByMarket.get(marketId) ?? 0) + need);
    }
    const fillByMarket = new Map<number, number>();
    for (const [marketId, need] of needByMarket) {
      const used = Math.min(need, townHelpLeft(townHelp, marketId, month));
      if (!(used > 0)) continue;
      consumeTownHelp(townHelp, marketId, month, used);
      fillByMarket.set(marketId, used / need);
    }
    for (const cellId of cells.i) {
      const fill = fillByMarket.get(marketCellColumn[cellId] ?? 0) ?? 0;
      const index = cellId * 12 + month;
      const helped = Math.max(0, shortfallDays[index]) * fill;
      if (!(helped > 0)) continue;
      husbandryMonthlyWorkDays[index] += helped;
      husbandryWorkers[cellId] += helped / WORKABLE_DAYS_PER_ADULT;
      shortfallDays[index] -= helped;
    }
  }
}

/**
 * Hay still uncut after every helper is cut from the regrowth of the following months by the cell's own
 * spare adults, as the manor of Chelsea hired mowers for the second hay crop (VCH Middlesex 12; docs/plan/
 * hay-catch-up.md). Field work keeps its days: only days left after the whole calendar are used.
 */
function carryHayShortfall(
  world: Readonly<WorldContext>,
  currentDaysByCell: Float32Array,
  workDaysPerAdultByCell: Float32Array,
  shortfallDays: Float32Array,
  husbandryMonthlyWorkDays: Float32Array,
  husbandryWorkers: Float32Array,
  offField?: OffFieldDays
): Float32Array {
  const cells = world.pack.cells;
  const carried = new Float32Array(shortfallDays.length);
  const settings = getMarketSettings();
  if (settings.hayCatchUp !== "aftermath" || !cells?.i) return carried;
  const populationRate = Math.max(1, world.populationRate || 1);
  for (const cellId of cells.i) {
    if ((cells.h[cellId] ?? 0) < 20) continue;
    const adults =
      (Math.max(0, cells.maleAdults?.[cellId] ?? 0) + Math.max(0, cells.femaleAdults?.[cellId] ?? 0)) * populationRate;
    let regrowthDays: number[] | undefined;
    const hayOnRestDays = getFeedShortfallResponse(cellId) === "work";
    for (let month = 0; month < 12; month++) {
      let remaining = shortfallDays[cellId * 12 + month];
      if (remaining > 0) regrowthDays ??= getRegrowthHayDays(world, cellId);
      for (let ahead = 1; ahead <= settings.hayCatchUpMonths && remaining > 0; ahead++) {
        const target = (month + ahead) % 12;
        const index = cellId * 12 + target;
        const workDays = workDaysPerAdultByCell[index] || WORKABLE_DAYS_PER_ADULT_PER_MONTH;
        // A month's regrowth bounds what it can make up; the rest goes on to the next month.
        const days = Math.min(
          remaining,
          Math.max(0, (regrowthDays?.[target] ?? 0) - carried[index]),
          Math.max(0, adults * workDays - currentDaysByCell[index]) + getOffFieldLeft(offField, index, !hayOnRestDays)
        );
        if (!(days > 0)) continue;
        currentDaysByCell[index] += days - spendOffField(offField, index, days, !hayOnRestDays);
        husbandryMonthlyWorkDays[index] += days;
        husbandryWorkers[cellId] += days / WORKABLE_DAYS_PER_ADULT;
        carried[index] += days;
        remaining -= days;
      }
      shortfallDays[cellId * 12 + month] = remaining;
    }
  }
  return carried;
}

/**
 * Mowing days the regrowth of each month could still take, beyond the grazing and the planned hay: the month's
 * growth on the forage area less the present herd's monthly need and the planned cut, at 3 days per t.
 * Fills the months after a short one in turn, so hay that one month's regrowth cannot take goes on to the next.
 */
function getRegrowthHayDays(world: Readonly<WorldContext>, cellId: number): number[] {
  const growth = getPastureGrowth(world, cellId);
  const area = getForageAreaHectares(cellId);
  // Without a forage record the cut itself, which reads the standing grass, is the only bound.
  if (!(area > 0)) return Array(12).fill(Number.POSITIVE_INFINITY);
  const table = getOrCreateFaunaStockTable();
  const needKg = Object.entries(ANNUAL_FEED_DM_KG_PER_HEAD).reduce((sum, [name, kg]) => {
    const herd = table?.[`${cellId}:${name}`];
    const heads = herd ? Math.max(0, herd.young) + Math.max(0, herd.breeding) + Math.max(0, herd.old) : 0;
    return sum + (heads * kg) / 12;
  }, 0);
  const demand = calculateHusbandryDemand(world, cellId);
  return Array.from({ length: 12 }, (_, month) => {
    const plannedKg =
      (((demand.hayWorkers ?? 0) * WORKABLE_DAYS_PER_ADULT * (demand.hayMonthlyLaborWeights?.[month] ?? 0)) /
        HAY_WORK_DAYS_PER_TONNE_DM) *
      1000;
    const surplusKg = area * growth.annualKgPerHa * (growth.weights[month] ?? 0) - needKg - plannedKg;
    return (Math.max(0, surplusKg) / 1000) * HAY_WORK_DAYS_PER_TONNE_DM;
  });
}

/**
 * Town adults who can go out to the fields in a month, by market, in work-days of a peak month, and
 * what has been used. `urbanHarvestHelp` townsAndHay: `urbanHarvestHelpShare` of the adults, for corn
 * and hay, as the Statute of Cambridge (1388) called town artificers to the corn harvest and the
 * Statute of Artificers (1563) to the hay and corn harvest. legacy: the period's share, corn only.
 */
interface TownHarvestHelp {
  readonly hay: boolean;
  readonly capacityByMarket: Map<number, number>;
  readonly usedByMarketMonth: Map<number, number[]>;
}

function createTownHarvestHelp(world: Readonly<WorldContext>): TownHarvestHelp {
  const settings = getMarketSettings();
  const hay = settings.urbanHarvestHelp === "cornAndHay";
  const share = hay ? settings.urbanHarvestHelpShare : getUrbanHarvestHelpShare(world.options?.historicalPeriod);
  const populationRate = Math.max(1, world.populationRate || 1);
  const urbanization = Math.max(0, world.urbanization ?? 1);
  const peakWorkDays = WORKABLE_DAYS_PER_ADULT_PER_MONTH * PEAK_MONTH_WORK_MULTIPLIER;
  const capacityByMarket = new Map<number, number>();
  for (const burg of world.pack.burgs ?? []) {
    if (!burg?.i || burg.removed || !burg.demographics || !burg.market) continue;
    const adults = Math.max(0, burg.demographics.maleAdults ?? 0) + Math.max(0, burg.demographics.femaleAdults ?? 0);
    const days = adults * populationRate * urbanization * share * peakWorkDays;
    if (days > 0) capacityByMarket.set(burg.market, (capacityByMarket.get(burg.market) ?? 0) + days);
  }
  return { hay, capacityByMarket, usedByMarketMonth: new Map() };
}

function townHelpLeft(help: TownHarvestHelp, marketId: number, month: number): number {
  return Math.max(0, (help.capacityByMarket.get(marketId) ?? 0) - (help.usedByMarketMonth.get(marketId)?.[month] ?? 0));
}

function consumeTownHelp(help: TownHarvestHelp, marketId: number, month: number, days: number): void {
  if (!(days > 0)) return;
  const used = help.usedByMarketMonth.get(marketId) ?? new Array<number>(12).fill(0);
  used[month] += days;
  help.usedByMarketMonth.set(marketId, used);
}

/** Each town's share of its market's helper days, by its adults (`burgId * 12 + month`). Empty under legacy, whose towns keep their work. */
function spreadTownHarvestHelp(world: Readonly<WorldContext>, help: TownHarvestHelp): Float32Array {
  const burgs = world.pack.burgs ?? [];
  const result = new Float32Array(help.hay ? burgs.length * 12 : 0);
  if (!help.hay) return result;
  const adultsByMarket = new Map<number, number>();
  const adultsOf = (burg: (typeof burgs)[number]) =>
    Math.max(0, burg?.demographics?.maleAdults ?? 0) + Math.max(0, burg?.demographics?.femaleAdults ?? 0);
  for (const burg of burgs)
    if (burg?.i && !burg.removed && burg.market)
      adultsByMarket.set(burg.market, (adultsByMarket.get(burg.market) ?? 0) + adultsOf(burg));
  for (const burg of burgs) {
    if (!burg?.i || burg.removed || !burg.market) continue;
    const used = help.usedByMarketMonth.get(burg.market);
    const total = adultsByMarket.get(burg.market) ?? 0;
    if (!used || !(total > 0)) continue;
    for (let month = 0; month < 12; month++) result[burg.i * 12 + month] = (used[month] * adultsOf(burg)) / total;
  }
  return result;
}

export const URBAN_HARVEST_HELP_SHARE_MEDIEVAL = 0.05;
export const URBAN_HARVEST_HELP_SHARE_EARLY_MODERN = 0.1;
export const URBAN_HARVEST_HELP_SHARE_LATER = 0.15;
/**
 * Share of the idle rural hands elsewhere in the market area (beyond the adjacent cells that
 * applyHarvestMutualAid reaches) who travel for harvest work. Hired occasional labour already
 * figured prominently on medieval demesnes; travelling harvest gangs grew in the early modern
 * period (docs/plan/farm-labour-calibration.md §3 proposal 5). Game calibrations.
 */
export const REGIONAL_HARVEST_MOBILITY_MEDIEVAL = 0.25;
export const REGIONAL_HARVEST_MOBILITY_EARLY_MODERN = 0.4;
export const REGIONAL_HARVEST_MOBILITY_LATER = 0.5;

function periodBand(historicalPeriod: string | undefined): 0 | 1 | 2 {
  const index = historicalPeriodIndex(historicalPeriod);
  if (index < 0) return 1;
  if (index <= historicalPeriodIndex("lateMedieval")) return 0;
  if (index <= historicalPeriodIndex("maritimeEra")) return 1;
  return 2;
}

/**
 * Share of a market town's adults who go out to the surrounding fields in a harvest month, by
 * historical period. Medieval harvests leaned on household help, boon work and hired local labour;
 * townspeople joining the harvest in numbers belongs to the early modern and later periods
 * (docs/plan/rural-food-labor-audit.md §1.2).
 */
export function getUrbanHarvestHelpShare(historicalPeriod: string | undefined): number {
  return [URBAN_HARVEST_HELP_SHARE_MEDIEVAL, URBAN_HARVEST_HELP_SHARE_EARLY_MODERN, URBAN_HARVEST_HELP_SHARE_LATER][
    periodBand(historicalPeriod)
  ];
}

export function getRegionalHarvestMobility(historicalPeriod: string | undefined): number {
  return [REGIONAL_HARVEST_MOBILITY_MEDIEVAL, REGIONAL_HARVEST_MOBILITY_EARLY_MODERN, REGIONAL_HARVEST_MOBILITY_LATER][
    periodBand(historicalPeriod)
  ];
}

/**
 * Seasonal harvest hands from within the market area: its towns' helpers (adults ×
 * getUrbanHarvestHelpShare, working a peak month) and the travelling share of idle rural adults in
 * its other cells (getRegionalHarvestMobility). In each month they cover the shortage left after
 * household help and neighbour aid, shared in proportion to each cell's shortage. The help counts as
 * aid received (not as the farm cell's resident work); travelling rural hands become employed in
 * their home cell's calendar, as neighbour aid does. The towns' own production is not reduced yet.
 */
function applyRegionalHarvestHelp(
  world: Readonly<WorldContext>,
  currentDaysByCell: Float32Array,
  desiredDaysByCell: Float32Array,
  workDaysPerAdultByCell: Float32Array,
  aidReceivedByCell: Float32Array,
  townHelp: TownHarvestHelp
): void {
  const cells = world.pack.cells;
  const marketCellColumn = getMarketCellColumn();
  if (!cells?.i || marketCellColumn.length !== cells.i.length) return;
  const mobility = getRegionalHarvestMobility(world.options?.historicalPeriod);
  const populationRate = Math.max(1, world.populationRate || 1);

  for (let month = 0; month < 12; month++) {
    const shortage = new Float32Array(cells.i.length);
    const slack = new Float32Array(cells.i.length);
    const shortageByMarket = new Map<number, number>();
    const slackByMarket = new Map<number, number>();
    for (const cellId of cells.i) {
      if ((cells.h[cellId] ?? 0) < 20) continue;
      const marketId = marketCellColumn[cellId] ?? 0;
      if (!marketId) continue;
      const index = cellId * 12 + month;
      const workDays = workDaysPerAdultByCell[index] || WORKABLE_DAYS_PER_ADULT_PER_MONTH;
      const ruralAdultPoints =
        Math.max(0, cells.maleAdults?.[cellId] ?? 0) + Math.max(0, cells.femaleAdults?.[cellId] ?? 0);
      const capacity = ruralAdultPoints * populationRate * workDays;
      const helperDays = getHouseholdHarvestHelperDays(cells, cellId, populationRate, workDays);
      const remaining = (currentDaysByCell[index] ?? 0) - capacity - helperDays - (aidReceivedByCell[index] ?? 0);
      if (remaining > 0) {
        shortage[cellId] = remaining;
        shortageByMarket.set(marketId, (shortageByMarket.get(marketId) ?? 0) + remaining);
      } else {
        // Travelling hands come from adults with an ordinary month to spare.
        const idle = Math.max(
          0,
          ruralAdultPoints * populationRate * WORKABLE_DAYS_PER_ADULT_PER_MONTH - currentDaysByCell[index]
        );
        slack[cellId] = idle * mobility;
        slackByMarket.set(marketId, (slackByMarket.get(marketId) ?? 0) + slack[cellId]);
      }
    }

    const usedRuralShare = new Map<number, number>();
    for (const [marketId, marketShortage] of shortageByMarket) {
      const town = townHelpLeft(townHelp, marketId, month);
      const rural = slackByMarket.get(marketId) ?? 0;
      const used = Math.min(marketShortage, town + rural);
      if (!(used > 0)) continue;
      // Towns' helpers are spent before rural hands leave their own villages.
      const ruralUsed = Math.max(0, used - town);
      consumeTownHelp(townHelp, marketId, month, used - ruralUsed);
      usedRuralShare.set(marketId, rural > 0 ? ruralUsed / rural : 0);
      for (const cellId of cells.i) {
        if (!(shortage[cellId] > 0) || marketCellColumn[cellId] !== marketId) continue;
        aidReceivedByCell[cellId * 12 + month] += (used * shortage[cellId]) / marketShortage;
      }
    }
    for (const cellId of cells.i) {
      const share = usedRuralShare.get(marketCellColumn[cellId] ?? 0) ?? 0;
      if (share > 0 && slack[cellId] > 0) {
        const transferred = slack[cellId] * share;
        currentDaysByCell[cellId * 12 + month] += transferred;
        desiredDaysByCell[cellId * 12 + month] += transferred;
      }
    }
  }
}

/**
 * Days of the rural work year outside the field calendar (docs/plan/rural-work-year.md): per cell and month,
 * the adults' days above the month's field capacity, up to the work year less housework. The 140 field days
 * stay the fields' measure (farm-labour-calibration.md §1.1); herds, hay and household cloth use these first.
 */
interface OffFieldDays {
  /** Every day of the work year less housework: herd care, which goes on through Sundays and feasts. */
  readonly cap: Float32Array;
  readonly used: Float32Array;
  /** Working days only (no rest days): hay, household cloth and hired hay hands, servile work. */
  readonly workdayCap: Float32Array;
  readonly workdayUsed: Float32Array;
}

/** Days per adult in a month of the work year left after housework; 0 under the legacy rule. */
export function getOffFieldMonthlyDaysPerAdult(): number {
  const settings = getMarketSettings();
  if (settings.ruralWorkYear !== "offField") return 0;
  return Math.max(0, settings.ruralWorkDaysPerYear - settings.ruralChoreDaysPerAdult) / 12;
}

/**
 * Sundays and holy days kept from servile work in a year (docs/plan/rural-work-year.md §2). byPeriod: 52 Sundays
 * and about 45 feasts to the late Middle Ages (the lists of Archbishops Mepham 1332 and Arundel 1400, 12 and 19
 * more than the 1549 Prayer Book), and about 27 feasts after the abrogation of 1536, which made most harvest-time
 * feasts working days.
 */
export function getRuralRestDaysPerYear(historicalPeriod: string | undefined): number {
  const settings = getMarketSettings();
  if (settings.ruralRestDays === "custom") return settings.ruralRestDaysCustom;
  return periodBand(historicalPeriod) === 0 ? 97 : 79;
}

/** Days per adult in a month of working days left after their share of housework; 0 under the legacy rule. */
export function getOffFieldWorkdayDaysPerAdult(historicalPeriod: string | undefined): number {
  const settings = getMarketSettings();
  if (settings.ruralWorkYear !== "offField" || !(settings.ruralWorkDaysPerYear > 0)) return 0;
  const workdays = Math.max(0, settings.ruralWorkDaysPerYear - getRuralRestDaysPerYear(historicalPeriod));
  const choreShare = Math.min(1, settings.ruralChoreDaysPerAdult / settings.ruralWorkDaysPerYear);
  return (workdays * (1 - choreShare)) / 12;
}

function getOffFieldLeft(offField: OffFieldDays | undefined, index: number, workday = true): number {
  if (!offField) return 0;
  const left = Math.max(0, offField.cap[index] - offField.used[index]);
  return workday ? Math.min(left, Math.max(0, offField.workdayCap[index] - offField.workdayUsed[index])) : left;
}

/**
 * Takes up to `days` from the off-field days, of working days unless `workday` is false (care); returns what it
 * took, the rest falls on the field calendar.
 */
function spendOffField(offField: OffFieldDays | undefined, index: number, days: number, workday = true): number {
  const taken = Math.min(Math.max(0, days), getOffFieldLeft(offField, index, workday));
  if (offField && taken > 0) {
    offField.used[index] += taken;
    if (workday) offField.workdayUsed[index] += taken;
  }
  return taken;
}

function addWorkerDays(target: number[], workers: number, monthlyWeights: readonly number[]): void {
  const annualDays = Math.max(0, workers) * WORKABLE_DAYS_PER_ADULT;
  for (let month = 0; month < 12; month++) target[month] += annualDays * (monthlyWeights[month] ?? 0);
}

function getMaximumAssignableFactor(
  existingDays: readonly number[],
  requiredWorkers: number,
  monthlyWeights: readonly number[],
  residentAdults: number,
  workDaysPerAdult?: readonly number[]
): number {
  if (requiredWorkers <= 0 || residentAdults <= 0) return 0;
  let factor = 1;
  for (let month = 0; month < 12; month++) {
    const candidateDays = requiredWorkers * WORKABLE_DAYS_PER_ADULT * (monthlyWeights[month] ?? 0);
    if (candidateDays <= 0) continue;
    const workDays = workDaysPerAdult?.[month] ?? WORKABLE_DAYS_PER_ADULT_PER_MONTH;
    const availableDays = Math.max(0, residentAdults * workDays - existingDays[month]);
    factor = Math.min(factor, availableDays / candidateDays);
  }
  return Math.max(0, Math.min(1, factor));
}

/**
 * Foraging, pastoral, and fishing cells were settled *because* those livelihoods can feed
 * the residents. The leftover adults are those workers, not an unemployed farm surplus.
 * Agricultural cells keep their export/migration reserve. Barren cells keep their surplus
 * so a later thin-to-livelihood pass can remove people who should not live there.
 */
function applySubsistenceLivelihoodEmployment(
  livelihood: number,
  ruralAdultPoints: number,
  reservedOutflow: number,
  farmLaborRequired: Float32Array,
  migratableAdults: Float32Array,
  ruralReleasePressure: Float32Array,
  cellId: number
): void {
  if (
    livelihood !== LIVELIHOOD_CODE.foraging &&
    livelihood !== LIVELIHOOD_CODE.pastoral &&
    livelihood !== LIVELIHOOD_CODE.fishing &&
    livelihood !== LIVELIHOOD_CODE.mixed
  ) {
    return;
  }
  const assigned = farmLaborRequired[cellId] ?? 0;
  const leftover = Math.max(0, ruralAdultPoints - assigned - reservedOutflow);
  if (leftover <= 0) return;
  farmLaborRequired[cellId] = assigned + leftover;
  migratableAdults[cellId] = reservedOutflow;
  ruralReleasePressure[cellId] = reservedOutflow;
}

// ---- Consumption side: read the persisted allocation to gate Game/Fish (production-utils.ts) ----
// Husbandry's/viticulture's own workerFactor getters live in husbandry.ts (getHusbandryWorkerFactor)
// and viticulture.ts (getViticultureWorkerFactor) since those modules already need them internally.

/**
 * Game's monthly output, driven by hunter headcount instead of population (§5.1). Pre-modifier.
 * `workers * GAME_YIELD_PER_HUNTER_PER_MONTH` is the "desired" labour-gated rate; Phase 2's fauna
 * stock model (faunaPopulation.ts, docs/plan/biome-goods-producer-ecosystem.md §4) further caps it
 * by the wild stock's actual harvestable headcount when `options.ruralEcosystemDetail ===
 * "detailed"` (the default) — a pass-through to the labour-gated rate otherwise (§11.2).
 */
export function getHuntingGameOutput(cellId: number): number {
  const workers = getHuntingWorkers()[cellId] ?? 0;
  const desired = workers * GAME_YIELD_PER_HUNTER_PER_MONTH;
  return drawWildFaunaOfftake(cellId, desired);
}

/**
 * Read-only counterpart to `getHuntingGameOutput` for non-production callers (map redraw,
 * CellInfo/tooltip hover, the Goods editor's cell preview) — see faunaPopulation.ts's
 * `previewWildFaunaOfftake` doc-comment for why this exists.
 */
export function previewHuntingGameOutput(cellId: number): number {
  const workers = getHuntingWorkers()[cellId] ?? 0;
  const desired = workers * GAME_YIELD_PER_HUNTER_PER_MONTH;
  return previewWildFaunaOfftake(cellId, desired);
}

/** 0..1 labour-sufficiency ratio gating Fish's bonus-good output at `cellId` (the holder cell). */
export function getFishingWorkerFactor(cellId: number): number {
  const required = getFishingRequiredWorkers()[cellId] ?? 0;
  if (required <= 0) return 0;
  const assigned = getFishingWorkers()[cellId] ?? 0;
  return Math.min(1, assigned / required);
}
