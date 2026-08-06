/**
 * Rural Occupation Allocator — docs/plan/biome-goods-producer-ecosystem.md §3.
 *
 * Grain already claims farm labour out of a cell's adults via agriculturalLandUse.ts, leaving
 * `migratableAdults` as the post-Grain surplus. Before this module existed, that same surplus was
 * *also* implicitly assumed available in full by two unrelated things: the flat
 * population x biomeOutputByTag rate that drives Game/Wine (production-utils.ts), and
 * ruralLaborRelease.ts's urban migration release. Neither knew about the other, so a cell's
 * labour was being claimed three times over (§2.2's "triple claim" problem).
 *
 * This module resolves that by claiming a single ordered slice of `migratableAdults` per cell:
 *   1. Grain (already done upstream, not repeated here)
 *   2. Hunting's fixed subsistence claim (§5.1) — small and non-competing, taken first
 *   3. Fishing and viticulture (§5.2, §5.3 harvest stage), competing for the remainder in a
 *      simple greedy pass ordered by unit value (mineOperations.ts's workerFactor pattern)
 *   4. Whatever is left becomes `ruralReleasePressure`, which ruralLaborRelease.ts consumes.
 *
 * Husbandry (§5.4) is not part of this pass yet — it lands in Phase 3 once liveAnimal carrying
 * capacity exists to size it against. Fauna/biomass stock (§4) is Phase 2; until then Game and
 * Fish still draw on the same uncapped biome/bonus-good rates as before, just gated by labour
 * instead of running unconstrained off raw population.
 */

import { resolveBiomeOutputRate } from "../../../data/biomeEconomy";
import type { WorldContext } from "../../hostCore";
import {
  getFishingRequiredWorkers,
  getFishingWorkers,
  getGoodCellColumn,
  getGoods,
  getHuntingWorkers,
  getViticultureRequiredWorkers,
  getViticultureWorkers
} from "../economyContext";
import { drawWildFaunaOfftake } from "./faunaPopulation";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { isGoodEnabled } from "./goods-generator";

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
 * Workers needed to fully staff one unit/month of raw fishing or viticulture output potential
 * (the same "raw" rate production-utils.ts used to grant unconditionally). Mirrors
 * mineOperations.ts's getMineRequiredWorkers()/workerFactor pattern; standing in for the real
 * biomass/vineyard-area labour models that arrive in later phases.
 */
export const FISHING_WORKERS_PER_UNIT_OUTPUT = 6;
export const VITICULTURE_WORKERS_PER_UNIT_OUTPUT = 10;

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
  /** Residual after Grain + hunting + fishing + viticulture claims; feeds ruralLaborRelease.ts. */
  readonly ruralReleasePressure: Float32Array;
}

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
  migratableAdults: Float32Array
): RuralOccupationAllocation {
  const cells = world.pack.cells;
  const count = cells?.i?.length ?? 0;
  const huntingWorkers = new Float32Array(count);
  const fishingWorkers = new Float32Array(count);
  const fishingRequiredWorkers = new Float32Array(count);
  const viticultureWorkers = new Float32Array(count);
  const viticultureRequiredWorkers = new Float32Array(count);
  const ruralReleasePressure = new Float32Array(count);
  if (!count || migratableAdults.length !== count) {
    return {
      huntingWorkers,
      fishingWorkers,
      fishingRequiredWorkers,
      viticultureWorkers,
      viticultureRequiredWorkers,
      ruralReleasePressure
    };
  }

  const goodsByName = new Map(getGoods().map(good => [good.name, good]));
  const fishGood = goodsByName.get("Fish");
  const wineGood = goodsByName.get("Wine");

  const fishOffersByLandCell =
    fishGood && isGoodEnabled(fishGood) ? collectFishingOffers(world, fishGood.i, fishingRequiredWorkers) : new Map();

  for (const cellId of cells.i) {
    if (cells.h[cellId] < 20) continue; // rural occupations claim land-cell labour only

    let budget = Math.max(0, migratableAdults[cellId] ?? 0);
    if (budget <= 0) continue;

    const biomeCode = cells.biomeCode[cellId];
    const isForestCell = (world.biomesData.tags?.[biomeCode] ?? []).includes("forest");
    const hunting = isForestCell ? getHuntingSubsistenceClaim(budget) : 0;
    huntingWorkers[cellId] = hunting;
    budget -= hunting;

    const candidates: { kind: "viticulture" | "fishing"; required: number; value: number; holderId?: number }[] = [];

    if (wineGood && isGoodEnabled(wineGood)) {
      const wineRate = resolveBiomeOutputRate(
        biomeCode,
        wineGood.biomeOutput,
        wineGood.biomeOutputByTag,
        world.biomesData
      );
      if (wineRate > 0) {
        const rawOutput = Math.max(0, cells.pop[cellId] ?? 0) * wineRate;
        const required = rawOutput * VITICULTURE_WORKERS_PER_UNIT_OUTPUT;
        viticultureRequiredWorkers[cellId] = required;
        if (required > 0) candidates.push({ kind: "viticulture", required, value: wineGood.value });
      }
    }

    for (const offer of fishOffersByLandCell.get(cellId) ?? []) {
      if (offer.share > 0)
        candidates.push({ kind: "fishing", required: offer.share, value: fishGood!.value, holderId: offer.holderId });
    }

    // Greedy, value-ranked allocation up to each candidate's requiredWorkers cap — the same
    // "simple sufficiency model" mineOperations.ts uses, not a linear-programming optimum (§3.1).
    candidates.sort((a, b) => b.value - a.value);
    for (const candidate of candidates) {
      if (budget <= 0) break;
      const assign = Math.min(budget, candidate.required);
      if (assign <= 0) continue;
      if (candidate.kind === "viticulture") viticultureWorkers[cellId] += assign;
      else fishingWorkers[candidate.holderId!] += assign;
      budget -= assign;
    }

    ruralReleasePressure[cellId] = Math.max(0, budget);
  }

  return {
    huntingWorkers,
    fishingWorkers,
    fishingRequiredWorkers,
    viticultureWorkers,
    viticultureRequiredWorkers,
    ruralReleasePressure
  };
}

// ---- Consumption side: read the persisted allocation to gate Game/Fish/Wine (production-utils.ts) ----

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

/** 0..1 labour-sufficiency ratio gating Fish's bonus-good output at `cellId` (the holder cell). */
export function getFishingWorkerFactor(cellId: number): number {
  const required = getFishingRequiredWorkers()[cellId] ?? 0;
  if (required <= 0) return 0;
  const assigned = getFishingWorkers()[cellId] ?? 0;
  return Math.min(1, assigned / required);
}

/** 0..1 labour-sufficiency ratio gating Wine's biome-continuous output at `cellId`. */
export function getViticultureWorkerFactor(cellId: number): number {
  const required = getViticultureRequiredWorkers()[cellId] ?? 0;
  if (required <= 0) return 0;
  const assigned = getViticultureWorkers()[cellId] ?? 0;
  return Math.min(1, assigned / required);
}
