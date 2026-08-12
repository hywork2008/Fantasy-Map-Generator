import { sum } from "d3";
import { DEFAULT_CULTURE_TYPE, type Zone } from "../../hostTypes";
import { getLatitude, getSeason, getSeasonalityStrength, rn, type Season } from "../../hostUtils";
import {
  getCultivableArea,
  getCultivatedArea,
  getFoodPotential,
  getGoodCellColumn,
  getGoods,
  getSimulationMonth,
  getWorldContext
} from "../economyContext";
import { getCropMix } from "./agriculturalLandUse";
import { getMilkOutput } from "./dairy";
import { drawDomesticatedFaunaOfftake, previewDomesticatedFaunaOfftake } from "./faunaPopulation";
import { getForestStockMultiplier } from "./forestStock";
import { type Good, Goods, isGoodEnabled } from "./goods-generator";
import { getHusbandryWorkerFactor, isGrazedLivestockGood } from "./husbandry";
import { isMineSuppliedGoodName } from "./mineralResources";
import { getFishingWorkerFactor, getHuntingGameOutput, previewHuntingGameOutput } from "./ruralOccupationAllocation";
import { getPerennialHarvestOutputs } from "./viticulture";
import { getWoolOutput } from "./woolProduction";

export const BONUS_RURAL_PRODUCTION = 0.25;
export const MAX_BONUS_PRODUCTION = 5;

let zoneCellSets: Map<number, Set<number>> | null = null;
let zoneCellSetsSource: Zone[] | null = null;

export function getZoneCellSets(): Map<number, Set<number>> {
  const zones = getWorldContext().pack.zones || [];
  if (zoneCellSets && zoneCellSetsSource === zones) return zoneCellSets;

  const sets = new Map<number, Set<number>>();
  for (const zone of zones) sets.set(zone.i, new Set(zone.cells));
  zoneCellSets = sets;
  zoneCellSetsSource = zones;
  return sets;
}

export function getModifiers(good: Good, cellId: number): number {
  const mult = good.multipliers;
  if (!mult) return 1;

  const biomeId = getWorldContext().pack.cells.biomeCode[cellId];
  const cultureId = getWorldContext().pack.cells.culture[cellId];
  const stateId = getWorldContext().pack.cells.state[cellId];
  const religionId = getWorldContext().pack.cells.religion[cellId];

  const burgId = getWorldContext().pack.cells.burg[cellId];
  const cultureType =
    (burgId ? getWorldContext().pack.burgs[burgId]?.type : getWorldContext().pack.cultures[cultureId]?.type) ??
    DEFAULT_CULTURE_TYPE;

  let modifier =
    (mult.cultureType?.[cultureType] ?? 1) *
    (mult.culture?.[cultureId] ?? 1) *
    (mult.state?.[stateId] ?? 1) *
    (mult.religion?.[religionId] ?? 1) *
    (mult.biome?.[biomeId] ?? 1);

  if (mult.zone) {
    const sets = getZoneCellSets();
    for (const zoneIdStr in mult.zone) {
      const value = mult.zone[+zoneIdStr];
      if (value === undefined || value === 1) continue;
      if (sets.get(+zoneIdStr)?.has(cellId)) modifier *= value;
    }
  }

  return modifier;
}

/** Wood supply is proportional to the cell's single standing-timber stock. */
function getForestStockProductionMultiplier(good: Good, cellId: number): number {
  if (good.name !== "Wood") return 1;
  return getForestStockMultiplier(cellId);
}

/**
 * Per-season output multiplier for food-tagged goods (Grain, etc.) at full latitudinal
 * seasonality (high latitudes), modeling a real annual harvest cycle instead of a flat
 * year-round trickle: most of the year's yield lands at once in autumn, with fields largely
 * dormant the rest of the year. Averages to exactly 1 across the four seasons, so annual total
 * food production at high latitude is unchanged from the old always-1x baseline — only its
 * distribution across the year changes. This is what makes grain cheap right after harvest and
 * expensive in the lean season before the next one: the existing demand/stock price formula in
 * markets-generator.ts reacts to the resulting stock swing with no separate price-modifier code
 * needed (see docs/simulation/seasons.md).
 */
const SEASONAL_FOOD_PRODUCTION_MULTIPLIER: Record<Season, number> = {
  spring: 0.3,
  summer: 0.3,
  autumn: 3.0,
  winter: 0.4
};

/**
 * Blends the full-swing multiplier above toward a flat 1x baseline as latitude approaches the
 * equator (getSeasonalityStrength -> 0), since near-equatorial climates don't have the
 * temperate single-autumn-harvest cycle the table models. The blend is linear in the deviation
 * from 1, so the four-season average stays exactly 1 at every latitude, not just at the poles.
 */
export function getSeasonalFoodProductionMultiplier(good: Good, cellId: number, month: number): number {
  if (!good.tags.includes("food")) return 1;

  const worldContext = getWorldContext();
  const point = worldContext.pack.cells.p[cellId];
  if (!point) return 1;

  const latitude = getLatitude(point[1], worldContext.mapCoordinates, worldContext.graphHeight);
  const season = getSeason(latitude, month);
  const strength = getSeasonalityStrength(latitude);
  return 1 + (SEASONAL_FOOD_PRODUCTION_MULTIPLIER[season] - 1) * strength;
}

function getSeasonalProductionMultiplier(good: Good, cellId: number): number {
  const seasonal = getSeasonalFoodProductionMultiplier(good, cellId, getSimulationMonth());

  return seasonal;
}

export type RuralProductionContribution = { goodId: number; amount: number };

export function getRuralCellPopulation(cellId: number): number {
  const cells = getWorldContext().pack.cells;
  if (cells.h[cellId] >= 20) return cells.pop[cellId];
  return sum(cells.c[cellId].map(neighborId => cells.pop[neighborId])) || 0;
}

/**
 * Returns the pre-season quantities for this cell. The market
 * production index uses these stable contributions to aggregate rural output
 * once per topology/goods change, then applies time-varying factors at settlement.
 *
 * `options.preview` (default false, i.e. real/mutating): Game and grazed-livestock amounts are
 * capped by Phase 2's fauna stock model (faunaPopulation.ts §4), which by default *draws down*
 * (culls) that stock as a side effect. The real production pipeline (markets-generator.ts) wants
 * that. Every other caller — map redraw (draw-goods.ts/economyWebglLayers.ts), CellInfo/tooltip
 * hover (tooltipHandler.ts), the Goods editor's cell preview — only wants to know what *would* be
 * produced and must stay read-only per the Renderer-purity rule (AGENTS.md §1); pass
 * `{ preview: true }` there. Omitting it previously culled live animals on every mouse-over/redraw
 * (found 2026-08-07).
 */
export function getRuralProductionContributions(
  cellId: number,
  biomeProduction: Record<number, { goodId: number; production: number }[]>,
  options: { preview?: boolean } = {}
): RuralProductionContribution[] {
  const { preview = false } = options;
  const worldContext = getWorldContext();
  const cells = worldContext.pack.cells;
  const population = getRuralCellPopulation(cellId);
  if (population <= 0) return [];

  const contributions: RuralProductionContribution[] = [];
  for (const { goodId, production } of biomeProduction[cells.biomeCode[cellId]] || []) {
    const good = Goods.get(goodId);
    // Salt is a state-operated utility: saltworks.ts supplies it to city markets from
    // dedicated national sites. Excluding legacy biome entries also keeps older saves from
    // reintroducing scattered climate-agnostic Salt production.
    if (!good || !isGoodEnabled(good) || isMineSuppliedGoodName(good.name) || good.name === "Salt") continue;

    // Rural Occupation Allocator (docs/plan/biome-goods-producer-ecosystem.md §3) gates these by
    // actual assigned workers instead of raw population — Phase 1 of that redesign.
    if (good.name === "Game") {
      const amount = preview ? previewHuntingGameOutput(cellId) : getHuntingGameOutput(cellId);
      if (amount > 0) contributions.push({ goodId, amount: amount * getModifiers(good, cellId) });
      continue;
    }

    let amount = population * production;
    if (good.tags.includes("liveAnimal")) {
      // Husbandry (§5.4, Phase 3): grazed species (Cattle/Sheep/Goats/Horses/Camels) are gated by
      // herder labour the same way Wine is gated by viticulture labour, always-on regardless of
      // ruralEcosystemDetail (§11.2 — Phase 1's labour allocator is never toggled off). Pig/
      // Chicken/Cats/Dogs aren't herded on open pasture, so they skip this gate (husbandry.ts's
      // module doc-comment explains the scope split).
      if (isGrazedLivestockGood(good.name)) amount *= getHusbandryWorkerFactor(cellId);
      // Phase 2 fauna stock model (docs/plan/biome-goods-producer-ecosystem.md §4): caps the
      // (now possibly husbandry-gated) rate by the domesticated stock's actual harvestable
      // headcount. A pass-through to `amount` unchanged when options.ruralEcosystemDetail === "simplified".
      amount = preview
        ? previewDomesticatedFaunaOfftake(cellId, good, amount)
        : drawDomesticatedFaunaOfftake(cellId, good, amount);
    }
    contributions.push({ goodId, amount: amount * getModifiers(good, cellId) });
  }

  // Vines and orchards are climate-, land-, and labour-gated. They intentionally carry no
  // biomeOutputByTag, so an olive grove cannot appear merely because a cell is scrubland.
  for (const output of getPerennialHarvestOutputs(cellId)) {
    const good = Goods.get(output.goodId);
    if (!good || !isGoodEnabled(good) || isMineSuppliedGoodName(good.name) || output.amount <= 0) continue;
    contributions.push({ goodId: output.goodId, amount: output.amount * getModifiers(good, cellId) });
  }

  // Milk (docs/plan/fauna-biome-realism.md §3 Phase K): local dairy-headcount-driven harvest,
  // mirroring Grapes above — see dairy.ts's module doc-comment. Cheese itself is a regular
  // burg-craft recipe good again (`{ Milk: 3, Salt/Vinegar }`, goods-generator.ts), restored so
  // Salt/Vinegar logistics and craft employment flow through the standard pipeline; Milk staying a
  // freshFood-tagged, cell-local harvest is what keeps Cheese-making tied to where the animals are.
  const milkGood = getGoods().find(good => good.name === "Milk");
  if (milkGood && isGoodEnabled(milkGood) && !isMineSuppliedGoodName(milkGood.name)) {
    const amount = getMilkOutput(cellId);
    if (amount > 0) contributions.push({ goodId: milkGood.i, amount: amount * getModifiers(milkGood, cellId) });
  }

  // Wool (docs/plan/fauna-biome-realism.md's Wool/Sheep investigation, 2026-08-08): local
  // Sheep-headcount-driven shearing yield, mirroring Milk above — see woolProduction.ts's module
  // doc-comment. Cloth stays a regular burg-craft recipe good (`recipes: [{ Wool: 1 }, ...]`,
  // goods-generator.ts), unchanged.
  const woolGood = getGoods().find(good => good.name === "Wool");
  if (woolGood && isGoodEnabled(woolGood) && !isMineSuppliedGoodName(woolGood.name)) {
    const amount = getWoolOutput(cellId);
    if (amount > 0) contributions.push({ goodId: woolGood.i, amount: amount * getModifiers(woolGood, cellId) });
  }

  const bonusGoodId = getGoodCellColumn()[cellId];
  if (bonusGoodId) {
    const good = Goods.get(bonusGoodId);
    if (good && isGoodEnabled(good) && !isMineSuppliedGoodName(good.name) && good.name !== "Salt") {
      let bonus = Math.min(population * BONUS_RURAL_PRODUCTION, MAX_BONUS_PRODUCTION);
      if (good.name === "Fish") bonus *= getFishingWorkerFactor(cellId);
      contributions.push({ goodId: bonusGoodId, amount: bonus * getModifiers(good, cellId) });
    }
  }

  return contributions;
}

export function getCellProduction(
  cellId: number,
  biomeProduction: Record<number, { goodId: number; production: number }[]>,
  options: { preview?: boolean } = {}
): Record<number, number> {
  const produced: Record<number, number> = {};

  const add = (goodId: number, amount: number) => {
    produced[goodId] = rn((produced[goodId] || 0) + amount, 2);
  };

  for (const contribution of getRuralProductionContributions(cellId, biomeProduction, options)) {
    const good = Goods.get(contribution.goodId);
    if (!good) continue;
    // Grain is owned by Food Ledger land-use calculations. Its biome output is
    // retained only as a catalog compatibility value and must not make an intact
    // forest look like an active grain field on the Goods layer.
    if (good.tags.includes("stapleFood")) continue;
    const multiplier = getForestStockProductionMultiplier(good, cellId) * getSeasonalProductionMultiplier(good, cellId);
    add(contribution.goodId, contribution.amount * multiplier);
  }

  const cropGoods = getGoods().filter(good => good.crop && isGoodEnabled(good));
  const cropMix = getCropMix(getWorldContext(), cellId, cropGoods);
  const stapleOutput = getCellStapleFoodProduction(cellId);
  if (cropMix.length && stapleOutput > 0) {
    // The Food Ledger still settles this same total through its aggregate Grain commodity.
    // These separate entries are the crop-level local diet shown by the Goods layer/tooltips.
    for (const entry of cropMix) produced[entry.good.i] = (produced[entry.good.i] || 0) + stapleOutput * entry.share;
  } else {
    const stapleFoodGood = getGoods().find(good => good.tags.includes("stapleFood"));
    if (stapleFoodGood && stapleOutput > 0) {
      // Legacy catalogues without crop profiles retain the aggregate Grain display.
      produced[stapleFoodGood.i] = (produced[stapleFoodGood.i] || 0) + stapleOutput;
    }
  }

  return produced;
}

/**
 * Returns a cell's actual annual staple output using the same active-field
 * coverage calculation as FoodProduction's market Food Ledger. `cultivatedArea`
 * means a field is already planted and maintained; labour columns describe the
 * labour it requires for migration/employment, rather than cancelling the
 * field's production when city residents are counted in its food demand.
 * A missing agriculture slice intentionally produces zero: the renderer must
 * not fall back to the old biome-only Grain preview.
 */
export function getCellStapleFoodProduction(cellId: number): number {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const cultivableArea = getCultivableArea();
  const cultivatedArea = getCultivatedArea();
  const foodPotential = getFoodPotential();
  const cellCount = cells?.i?.length ?? 0;
  if (
    cellId < 0 ||
    cellId >= cellCount ||
    cultivableArea.length !== cellCount ||
    cultivatedArea.length !== cellCount ||
    foodPotential.length !== cellCount
  )
    return 0;

  const cultivable = Math.max(0, cultivableArea[cellId] ?? 0);
  const cultivated = Math.max(0, cultivatedArea[cellId] ?? 0);
  const landCoverage = cultivable > 0 ? Math.min(1, cultivated / cultivable) : 0;
  return Math.max(0, foodPotential[cellId] * landCoverage);
}
