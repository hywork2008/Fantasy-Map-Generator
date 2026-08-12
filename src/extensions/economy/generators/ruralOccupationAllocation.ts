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

import type { WorldContext } from "../../hostCore";
import {
  getFishingRequiredWorkers,
  getFishingWorkers,
  getGoodCellColumn,
  getGoods,
  getHuntingWorkers
} from "../economyContext";
import {
  type AgriculturalLandProfile,
  FARM_LABOUR_SAFETY_MARGIN,
  WORKABLE_DAYS_PER_ADULT,
  WORKABLE_DAYS_PER_ADULT_PER_MONTH
} from "./agriculturalLandUse";
import { drawWildFaunaOfftake, hasWildGameHabitat, previewWildFaunaOfftake } from "./faunaPopulation";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { isGoodEnabled } from "./goods-generator";
import { calculateHusbandryDemand } from "./husbandry";
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
 * Local stand-ins for production-utils.ts's BONUS_RURAL_PRODUCTION/MAX_BONUS_PRODUCTION, kept as
 * separate constants rather than an import to avoid a production-utils.ts <->
 * ruralOccupationAllocation.ts import cycle (production-utils.ts calls into this module for the
 * gating functions below). Keep in sync by eye if the bonus-good formula changes.
 */
const FISHING_BONUS_OUTPUT_SHARE = 0.25;
const FISHING_BONUS_OUTPUT_CAP = 5;

export interface RuralOccupationAllocation {
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
  /** Peak common rural workload after allocated occupations, in population points. */
  readonly farmLaborRequired: Float32Array;
  /** Adults available for migration after the common monthly peak and safety margin. */
  readonly migratableAdults: Float32Array;
  /** Work-days that would need seasonal hires after the safe migration release, `cellId * 12 + month`. */
  readonly seasonalLaborShortage: Float32Array;
  /** Residual after Grain + hunting + fishing + viticulture + husbandry claims; feeds ruralLaborRelease.ts. */
  readonly ruralReleasePressure: Float32Array;
}

type RuralLaborPlan = Pick<
  AgriculturalLandProfile,
  "cropLaborDaysByMonth" | "minimumCropLaborDaysByMonth" | "farmLaborRequired" | "migratableAdults"
>;

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
      farmLaborRequired,
      migratableAdults,
      seasonalLaborShortage,
      ruralReleasePressure
    };
  }

  const goodsByName = new Map(getGoods().map(good => [good.name, good]));
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
      else if (candidate.kind === "husbandry") husbandryWorkers[cellId] += assign;
      else fishingWorkers[candidate.holderId!] += assign;
      budget -= assign;
    }

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
  const farmLaborRequired = new Float32Array(count);
  const migratableAdults = new Float32Array(count);
  const seasonalLaborShortage = new Float32Array(count * 12);
  const ruralReleasePressure = new Float32Array(count);
  if (
    !count ||
    laborPlan.cropLaborDaysByMonth.length !== count * 12 ||
    laborPlan.minimumCropLaborDaysByMonth.length !== count * 12
  ) {
    return allocateRuralOccupationsFromSurplus(world, laborPlan.migratableAdults);
  }

  const goodsByName = new Map(getGoods().map(good => [good.name, good]));
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
    const huntingRequired = hasWildGameHabitat(cellId) ? getHuntingSubsistenceClaim(residentAdults) : 0;
    addWorkerDays(desiredDays, huntingRequired, UNIFORM_MONTHLY_WEIGHTS);
    const huntingFactor = getMaximumAssignableFactor(
      currentDays,
      huntingRequired,
      UNIFORM_MONTHLY_WEIGHTS,
      residentAdults
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
      const factor = getMaximumAssignableFactor(
        currentDays,
        candidate.requiredWorkers,
        candidate.monthlyWeights,
        residentAdults
      );
      const assigned = candidate.requiredWorkers * factor;
      if (candidate.kind === "viticulture") viticultureWorkers[cellId] += assigned;
      else if (candidate.kind === "husbandry") husbandryWorkers[cellId] += assigned;
      else fishingWorkers[candidate.holderId!] += assigned;
      addWorkerDays(currentDays, assigned, candidate.monthlyWeights);
      addWorkerDays(minimumDays, assigned, candidate.monthlyWeights);
    }

    const peakCurrentAdults = getPeakRequiredAdults(currentDays);
    const peakMinimumAdults = getPeakRequiredAdults(minimumDays);
    farmLaborRequired[cellId] = peakCurrentAdults / populationRate;
    migratableAdults[cellId] = Math.max(
      0,
      ruralAdultPoints - (peakCurrentAdults / populationRate) * FARM_LABOUR_SAFETY_MARGIN
    );
    ruralReleasePressure[cellId] = Math.max(
      0,
      ruralAdultPoints - (peakMinimumAdults / populationRate) * FARM_LABOUR_SAFETY_MARGIN
    );

    const adultsAfterMigration = Math.max(0, residentAdults - migratableAdults[cellId] * populationRate);
    for (let month = 0; month < 12; month++) {
      seasonalLaborShortage[cellId * 12 + month] = Math.max(
        0,
        desiredDays[month] - adultsAfterMigration * WORKABLE_DAYS_PER_ADULT_PER_MONTH
      );
    }
  }

  return {
    huntingWorkers,
    fishingWorkers,
    fishingRequiredWorkers,
    viticultureWorkers,
    viticultureRequiredWorkers,
    husbandryWorkers,
    husbandryRequiredWorkers,
    farmLaborRequired,
    migratableAdults,
    seasonalLaborShortage,
    ruralReleasePressure
  };
}

function copyMonthlyDays(source: Float32Array, cellId: number): number[] {
  return Array.from(source.subarray(cellId * 12, cellId * 12 + 12));
}

function addWorkerDays(target: number[], workers: number, monthlyWeights: readonly number[]): void {
  const annualDays = Math.max(0, workers) * WORKABLE_DAYS_PER_ADULT;
  for (let month = 0; month < 12; month++) target[month] += annualDays * (monthlyWeights[month] ?? 0);
}

function getMaximumAssignableFactor(
  existingDays: readonly number[],
  requiredWorkers: number,
  monthlyWeights: readonly number[],
  residentAdults: number
): number {
  if (requiredWorkers <= 0 || residentAdults <= 0) return 0;
  let factor = 1;
  for (let month = 0; month < 12; month++) {
    const candidateDays = requiredWorkers * WORKABLE_DAYS_PER_ADULT * (monthlyWeights[month] ?? 0);
    if (candidateDays <= 0) continue;
    const availableDays = Math.max(0, residentAdults * WORKABLE_DAYS_PER_ADULT_PER_MONTH - existingDays[month]);
    factor = Math.min(factor, availableDays / candidateDays);
  }
  return Math.max(0, Math.min(1, factor));
}

function getPeakRequiredAdults(monthlyDays: readonly number[]): number {
  return Math.max(0, ...monthlyDays.map(days => days / WORKABLE_DAYS_PER_ADULT_PER_MONTH));
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
