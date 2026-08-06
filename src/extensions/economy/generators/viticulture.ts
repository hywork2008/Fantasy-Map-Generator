/**
 * Viticulture — docs/plan/biome-goods-producer-ecosystem.md §5.3 (Phase 4).
 *
 * Grain-style area/yield/labour harvest model for Grapes, replacing Phase 1's population x rate
 * "viticulture" allocator candidate that used to size Wine directly (production-utils.ts's old
 * `if (good.name === "Wine") amount *= getViticultureWorkerFactor(cellId)` branch). Wine and
 * Raisins are now pure Burg-craft recipe goods (`{ Grapes, Barrels }` / `{ Grapes }`) consuming
 * harvested Grapes through the existing generic runWorkerLoop + craft-sector pipeline — no new
 * processing-stage code is needed for them (§5.3's "加工段階" note, mirroring Fish->Stockfish's
 * "zero new work" precedent — see §0's 2026-08-06 §5.2 事実誤認訂正 entry).
 *
 * `getViticultureWorkerFactor()` / `viticultureWorkers` / `viticultureRequiredWorkers`
 * (economyContext.ts) keep their Phase 1 names — only what feeds them (this module's area/labour
 * model, instead of a flat population x biomeOutputByTag rate) and what they gate (Grapes, instead
 * of Wine directly in production-utils.ts) change. This module now owns `getViticultureWorkerFactor`
 * itself (moved out of ruralOccupationAllocation.ts), mirroring husbandry.ts's precedent of owning
 * its own workerFactor getter since it needs it internally too.
 *
 * Unlike husbandry.ts's carrying capacity (a standing headcount ceiling), Grapes is a pure monthly
 * flow with no separate stock — so there's no analog of husbandry's "capacity" layer here, only a
 * labour-gated harvest rate. The vineyard's land-suitability ceiling is real
 * (calculateVineyardCeilingAreaHectares), but how much of it a settlement actually tries to work is
 * bounded by a population-scaled "desired area" (mirroring Grain's cultivableArea-vs-cultivatedArea
 * split) — without this second bound, a large vineyard-suitable cell with a tiny population would
 * demand an unrealistically huge workforce untethered from any actual local demand for grapes.
 */

import type { BiomeTag } from "../../../types/biome";
import type { WorldContext } from "../../hostCore";
import {
  getCultivatedArea,
  getGoods,
  getViticultureRequiredWorkers,
  getViticultureWorkers,
  getWorldContext
} from "../economyContext";
import {
  calculateBurgBuiltAreaHectares,
  calculatePhysicalAreaHectares,
  calculateTerrainWorkableShare,
  WORKABLE_DAYS_PER_ADULT
} from "./agriculturalLandUse";
import { isGoodEnabled } from "./goods-generator";

// ---- Placeholder constants (calibration TBD, §9.3 policy) ----

/**
 * Vineyard land-suitability ceiling by biome tag. `scrub` is the Mediterranean-climate proxy
 * (Wine's pre-Phase-4 distribution's primary `biomeTag("scrub")` clause); arable/grassland are
 * minor secondary support (its `biome(4) && random(50) && river()` clause). Narrower than Grain's
 * own ceiling table (§5.3: "稀少な土地利用という前提") and, unlike husbandry.ts's pasture, has no
 * marginal default fallback — grapes need real climate suitability, not "any leftover land."
 */
const VINEYARD_BIOME_TAG_CEILING: Partial<Record<BiomeTag, number>> = {
  scrub: 0.5,
  arable: 0.15,
  grassland: 0.1
};

/**
 * Hectares of vineyard a population point's worth of local demand (consumption + tradeable
 * surplus) could realistically keep worked — mirrors Grain's population-driven requiredArea, since
 * Grapes has no staple-food need equation to derive one from directly.
 */
const VINEYARD_AREA_PER_POPULATION_POINT = 0.5;
/** Grape yield, `Grapes`-unit output per hectare per month at full staffing. */
export const GRAPE_YIELD_PER_HECTARE_PER_MONTH = 0.03;
/**
 * Labour days per hectare for grape-growing — lower than Grain's LABOUR_DAYS_PER_HECTARE(30):
 * fruit crops don't concentrate annual labour the way grain's plant/harvest cycle does (§5.3).
 */
export const VINEYARD_LABOUR_DAYS_PER_HECTARE = 20;
/** River-adjacent vineyards get a modest yield bonus, echoing the old distribution's `river()` clause. */
const RIVER_YIELD_BONUS = 1.1;

export interface ViticultureDemand {
  readonly requiredWorkers: number;
  readonly value: number;
}

function calculateVineyardCeilingAreaHectares(world: Readonly<WorldContext>, cellId: number): number {
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
  const ceiling = tags.reduce((max, tag) => Math.max(max, VINEYARD_BIOME_TAG_CEILING[tag] ?? 0), 0);
  if (ceiling <= 0) return 0;

  const terrainShare = calculateTerrainWorkableShare(cells.h[cellId] ?? 0);
  return unclaimedArea * terrainShare * ceiling;
}

/** The land-suitability ceiling clamped by population-scaled local demand (see module doc-comment). */
function calculateDesiredVineyardAreaHectares(world: Readonly<WorldContext>, cellId: number): number {
  const ceiling = calculateVineyardCeilingAreaHectares(world, cellId);
  if (ceiling <= 0) return 0;
  const population = Math.max(0, world.pack.cells.pop[cellId] ?? 0);
  return Math.min(ceiling, population * VINEYARD_AREA_PER_POPULATION_POINT);
}

/**
 * Grape-growing labour demand at `cellId` — called from ruralOccupationAllocation.ts's per-cell
 * greedy loop, where `world` is already in scope.
 */
export function calculateViticultureDemand(world: Readonly<WorldContext>, cellId: number): ViticultureDemand {
  const grapesGood = getGoods().find(good => good.name === "Grapes");
  if (!grapesGood || !isGoodEnabled(grapesGood)) return { requiredWorkers: 0, value: 0 };

  const desiredArea = calculateDesiredVineyardAreaHectares(world, cellId);
  if (desiredArea <= 0) return { requiredWorkers: 0, value: 0 };

  const requiredWorkers = (desiredArea * VINEYARD_LABOUR_DAYS_PER_HECTARE) / WORKABLE_DAYS_PER_ADULT;
  return { requiredWorkers, value: grapesGood.value };
}

/**
 * 0..1 labour-sufficiency ratio gating Grapes' harvest at `cellId` (Phase 1's Wine-gating function,
 * moved here and repurposed — husbandry.ts's getHusbandryWorkerFactor is the sibling pattern).
 */
export function getViticultureWorkerFactor(cellId: number): number {
  const required = getViticultureRequiredWorkers()[cellId] ?? 0;
  if (required <= 0) return 0;
  const assigned = getViticultureWorkers()[cellId] ?? 0;
  return Math.min(1, assigned / required);
}

/**
 * Actual vineyard footprint at `cellId`: the population-bounded desired area scaled by labour
 * sufficiency. Used by faunaPopulation.ts's wildHabitatArea subtraction (§4.2).
 */
export function getVineyardAreaUsedHectares(cellId: number): number {
  const world = getWorldContext();
  const desiredArea = calculateDesiredVineyardAreaHectares(world, cellId);
  if (desiredArea <= 0) return 0;
  return desiredArea * getViticultureWorkerFactor(cellId);
}

/** Grapes' monthly harvest output (pre-modifier) at `cellId`. */
export function getGrapeHarvestOutput(cellId: number): number {
  const areaUsed = getVineyardAreaUsedHectares(cellId);
  if (areaUsed <= 0) return 0;
  const river = getWorldContext().pack.cells.r?.[cellId] ? RIVER_YIELD_BONUS : 1;
  return areaUsed * GRAPE_YIELD_PER_HECTARE_PER_MONTH * river;
}
