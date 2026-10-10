/**
 * Grain milling (docs/plan/fmg-economy-to-city-editor.md §8.1).
 *
 * Flour's catalog recipe is already `{ Grain: 1 }`. The worker loop cannot run it:
 * Grain is the Food Ledger, and buying the market mirror would not debit the reserve.
 * Each windmill or watermill applies that recipe once per production month, and only
 * to grain the ledger already marks tradeable (exportable surplus and storage overflow).
 * The famine reserve stays in the age buckets.
 *
 * Wind count is 0 or 1. `options.winds` is a compass bearing per latitude belt, not a
 * speed, and post mills are a high-medieval machine. Water count is one per dam site
 * in the town's market, plus one when the town cell itself is a formed river and no
 * dam site was counted. `RiverConstants.MIN_FLUX_TO_FORM_RIVER` (30) is that gate.
 */

import { RiverConstants } from "../../../data/constants";
import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  getDamSites,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getOrCreateCumulativeGoodsSales,
  getOrCreateMarketGoodProductionTotals,
  getWorldContext
} from "../economyContext";
import type { DamSite } from "./damTypes";
import { recordFoodMarketIntake, recordFoodProcessingConsumption } from "./foodProcessingLedger";
import type { Good } from "./goods-generator";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { FoodLedger, Market } from "./marketTypes";
import { drawTradeableStapleCrop } from "./stapleCropInventory";

export interface MillCounts {
  wind: number;
  water: number;
}

const WINDMILL_PERIODS = new Set([
  "highMedieval",
  "lateMedieval",
  "ageOfExploration",
  "maritimeEra",
  "preIndustrialEra",
  "steamEra",
  "industrialChemistryEra",
  "petroleumEra",
  "rocketryEra"
]);

/** An unset backdrop is a legacy high-medieval map, which already has post mills. */
export function windmillsAllowed(period: string | undefined): boolean {
  if (!period) return true;
  return WINDMILL_PERIODS.has(period);
}

/**
 * Compass bearing the wind blows toward (0 = north, clockwise).
 * Same rule as `prevailingWindDegAt` in services/burgSiteDescriptor.ts.
 * Undefined when the belts or the latitude frame cannot be read.
 */
export function prevailingWindDeg(burgY: number | undefined): number | undefined {
  const world = getWorldContext();
  const winds = world.options?.winds;
  const latN = world.mapCoordinates?.latN;
  const latT = world.mapCoordinates?.latT;
  const { graphHeight } = world;
  if (!Array.isArray(winds) || winds.length !== 6) return undefined;
  if (typeof latN !== "number" || !Number.isFinite(latN)) return undefined;
  if (typeof latT !== "number" || !Number.isFinite(latT)) return undefined;
  if (!Number.isFinite(graphHeight) || graphHeight <= 0) return undefined;
  if (typeof burgY !== "number" || !Number.isFinite(burgY)) return undefined;
  const latitude = latN - (burgY / graphHeight) * latT;
  if (!Number.isFinite(latitude)) return undefined;
  const tier = Math.min(5, Math.max(0, Math.floor(Math.abs(latitude - 89) / 30)));
  const deg = winds[tier];
  if (typeof deg !== "number" || !Number.isFinite(deg)) return undefined;
  return ((deg % 360) + 360) % 360;
}

function liveBurgs(): Burg[] {
  return (getWorldContext().pack.burgs ?? []).filter((burg): burg is Burg => Boolean(burg?.i) && !burg.removed);
}

function nearestBurg(pool: readonly Burg[], x: number, y: number): Burg | undefined {
  let best: Burg | undefined;
  let bestDistance = Infinity;
  for (const burg of pool) {
    if (typeof burg.x !== "number" || typeof burg.y !== "number") continue;
    const distance = Math.hypot(burg.x - x, burg.y - y);
    if (distance < bestDistance || (distance === bestDistance && (burg.i ?? 0) < (best?.i ?? Infinity))) {
      best = burg;
      bestDistance = distance;
    }
  }
  return best;
}

/** The town that mills this site: the burg on the cell, else the nearest burg of that market. */
export function burgForDamSite(
  site: DamSite,
  burgs: readonly Burg[],
  marketOfCell: (cell: number) => number
): Burg | undefined {
  const marketId = marketOfCell(site.cell) || burgs.find(burg => burg.cell === site.cell)?.market || 0;
  const pool = marketId
    ? burgs.filter(burg => burg.market === marketId || burg.cell === site.cell)
    : burgs.filter(burg => burg.cell === site.cell);
  if (!pool.length) return undefined;
  return pool.find(burg => burg.cell === site.cell) ?? nearestBurg(pool, site.x, site.y);
}

function damCountsByBurg(burgs: readonly Burg[]): Map<number, number> {
  const column = getMarketCellColumn();
  const counts = new Map<number, number>();
  for (const site of getDamSites()) {
    const owner = burgForDamSite(site, burgs, cell => column[cell] ?? 0);
    if (!owner?.i) continue;
    counts.set(owner.i, (counts.get(owner.i) ?? 0) + 1);
  }
  return counts;
}

function formedRiverAt(burg: Burg): boolean {
  const cells = getWorldContext().pack.cells;
  const cell = burg.cell;
  if (!cells?.r || !cells.fl || typeof cell !== "number" || cell < 0) return false;
  const height = cells.h?.[cell] ?? 0;
  return Boolean(cells.r[cell]) && height >= 20 && (cells.fl[cell] ?? 0) >= RiverConstants.MIN_FLUX_TO_FORM_RIVER;
}

/** Wind and water mills for one burg. Both are zero when the geography cannot be read. */
export function millCountsForBurg(burgId: number, burgs = liveBurgs(), dams = damCountsByBurg(burgs)): MillCounts {
  const burg = burgs.find(candidate => candidate.i === burgId);
  if (!burg) return { wind: 0, water: 0 };
  const wind =
    windmillsAllowed(getWorldContext().options?.historicalPeriod) && prevailingWindDeg(burg.y) !== undefined ? 1 : 0;
  const damMills = dams.get(burgId) ?? 0;
  const water = damMills > 0 ? damMills : formedRiverAt(burg) ? 1 : 0;
  return { wind, water };
}

/** Grain wains one Flour batch consumes. Zero when the catalog recipe is gone. */
export function grainPerFlourBatch(flour: Good, grain: Good): number {
  const recipe = flour.recipes?.find(candidate => (candidate[grain.i] ?? 0) > 0);
  const amount = recipe?.[grain.i] ?? 0;
  return amount > 0 ? amount : 0;
}

/**
 * Draws grain the ledger will sell. Crop lots are debited through the tradeable-crop
 * path. A legacy aggregate ledger gives up overflow first, then oldest buckets, and
 * never more than `exportable` from those buckets.
 */
export function drawTradeableGrain(ledger: FoodLedger, units: number): number {
  if (!(units > 0)) return 0;
  const crops = ledger.stapleCropInventories;
  const cropIds = crops
    ? Object.keys(crops)
        .map(Number)
        .sort((a, b) => a - b)
    : [];
  if (cropIds.length) {
    let left = units;
    let drawn = 0;
    for (const goodId of cropIds) {
      if (!(left > 1e-9)) break;
      const took = drawTradeableStapleCrop(ledger, goodId, left);
      drawn += took;
      left -= took;
    }
    return rn(drawn, 2);
  }

  let remaining = units;
  const fromOverflow = Math.min(Math.max(0, ledger.storageOverflow), remaining);
  ledger.storageOverflow = rn(Math.max(0, ledger.storageOverflow - fromOverflow), 2);
  remaining -= fromOverflow;

  const bucketBudget = Math.min(remaining, Math.max(0, ledger.exportable));
  let bucketsLeft = bucketBudget;
  for (const age of ["foodStockAge2", "foodStockAge1", "foodStockAge0"] as const) {
    if (!(bucketsLeft > 0)) break;
    const take = Math.min(Math.max(0, ledger[age]), bucketsLeft);
    ledger[age] = rn(Math.max(0, ledger[age] - take), 2);
    bucketsLeft -= take;
  }
  const bucketDrawn = bucketBudget - bucketsLeft;
  ledger.exportable = rn(Math.max(0, ledger.exportable - bucketDrawn), 2);
  return rn(fromOverflow + bucketDrawn, 2);
}

function creditOutput(market: Market, good: Good, units: number, burgId: number | undefined): void {
  const row = market.goods[good.i] ?? { stock: 0, price: good.value };
  market.goods[good.i] = row;
  row.stock = rn(row.stock + units, 2);
  recordGoodFlow({
    direction: "source",
    category: "burgCraft",
    goodId: good.i,
    units,
    marketId: market.i,
    burgId
  });
  recordFoodMarketIntake(market, good.name, units);
  const sales = getOrCreateCumulativeGoodsSales();
  if (sales) sales[good.i] = rn((sales[good.i] ?? 0) + units, 2);
  const produced = getOrCreateMarketGoodProductionTotals();
  if (produced) {
    const key = `${market.i}:${good.i}`;
    produced[key] = rn((produced[key] ?? 0) + units, 2);
  }
}

/** Mills every market's tradeable grain, one Flour batch per mill. Returns Flour sacks made. */
export function settleMilling(): number {
  const goods = getGoods();
  const flour = goods.find(good => good.name === "Flour");
  const grain = goods.find(good => good.tags?.includes("stapleFood"));
  if (!flour || !grain || !isGoodEnabled(flour)) return 0;
  const perBatch = grainPerFlourBatch(flour, grain);
  if (!(perBatch > 0)) return 0;

  const burgs = liveBurgs();
  const dams = damCountsByBurg(burgs);
  let produced = 0;
  for (const market of getMarkets()) {
    const ledger = market.foodLedger;
    if (!ledger) continue;
    const mills = burgs
      .filter(burg => burg.market === market.i)
      .reduce((sum, burg) => {
        const counts = millCountsForBurg(burg.i!, burgs, dams);
        return sum + counts.wind + counts.water;
      }, 0);
    if (mills <= 0) continue;
    const drawn = drawTradeableGrain(ledger, mills * perBatch);
    if (!(drawn > 0)) continue;
    const batches = rn(drawn / perBatch, 2);
    const grainRow = market.goods[grain.i] ?? { stock: 0, price: grain.value };
    market.goods[grain.i] = grainRow;
    grainRow.stock = rn(Math.max(0, ledger.exportable) + Math.max(0, ledger.storageOverflow), 2);
    recordGoodFlow({
      direction: "sink",
      category: "recipeInput",
      goodId: grain.i,
      units: drawn,
      marketId: market.i,
      burgId: market.centerBurgId,
      relatedGoodId: flour.i
    });
    recordFoodProcessingConsumption(market, grain.name, drawn);
    creditOutput(market, flour, batches, market.centerBurgId);
    produced += batches;
  }
  return rn(produced, 2);
}
