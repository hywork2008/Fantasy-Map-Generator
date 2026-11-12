/**
 * Hides and tallow sold off the map from the port markets (docs/plan/byproduct-export.md §3), as
 * the staple ports shipped them to the Low Countries for cloth and wine. Each month a port market
 * sells `byproductExportShare` of its stock above `byproductExportReserveMonths` of its own use,
 * and takes foreign goods of the same value in return (STAPLE_RETURN_GOODS): no money comes in
 * from off the map. It sells only as much as it can take back in return goods that reach it from
 * nowhere on the map, up to `byproductReturnMonths` of its own use, the shortest first (§7.3):
 * bay salt for its hides would undersell the map's own saltworks.
 */
import { getMarketSettings } from "../../../simulation/marketSettings";
import { rn } from "../../hostUtils";
import { getGoods, getMarkets, getOrCreateMarketGoodProductionTotals, getWorldContext } from "../economyContext";
import { getCalibratedMonthlyLots } from "./craftDemandCalibration";
import { laborPeople } from "./craftScale";
import { getMonthlyHouseholdDemand } from "./foodProcessingLedger";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { Good } from "./goodsGeneratorTypes";
import { LUXURY_STOCK_CYCLES, luxuryBudgetByMarketTier, luxuryStockTarget } from "./luxuryDemand";
import type { LuxuryTier } from "./luxuryTiers";
import type { Market } from "./marketTypes";

export const EXPORTED_BYPRODUCTS = ["Leather", "Tallow"] as const;
/**
 * What the staple ships brought back from the Low Countries and Gascony: Flemish cloth, wine, bay
 * salt, and the spices and silk of Bruges (docs/plan/byproduct-export.md §3.2).
 */
export const STAPLE_RETURN_GOODS = ["Fine Wool Cloth", "Wine", "Salt", "Spices", "Silk"] as const;

/** Weight of the latest month in a market's running monthly use of a good. */
const USE_SMOOTHING = 0.2;
/** Inflow from the map, as a share of its use, under which a return good counts as not made for this market. */
const DOMESTIC_INFLOW_SHARE = 0.05;

function portMarketIds(): Set<number> {
  const ids = new Set<number>();
  for (const burg of getWorldContext().pack.burgs ?? []) {
    if (burg?.i && !burg.removed && burg.port && burg.market) ids.add(burg.market);
  }
  return ids;
}

function findGoods(names: readonly string[]): Good[] {
  const goods = getGoods();
  return names
    .map(name => goods.find(good => good.name === name))
    .filter((good): good is Good => Boolean(good && isGoodEnabled(good)));
}

/**
 * The market's running monthly use of a good: what came into its stock and its own staple imports,
 * less what it shipped out and what its stock grew. Undefined in the first month it is seen.
 */
function updateUse(market: Market, good: Good, intake: Record<string, number>): { use?: number; inflow?: number } {
  if (!market.byproductUse) market.byproductUse = {};
  const ledger = market.byproductUse;
  const stock = Math.max(0, market.goods[good.i]?.stock ?? 0);
  const came = intake[`${market.i}:${good.i}`] ?? 0;
  const entry = ledger[good.i];
  let use = entry?.use;
  let inflow = entry?.inflow;
  if (entry) {
    const arrived = Math.max(0, came - entry.intake);
    const used = Math.max(0, arrived - (stock - entry.stock) - entry.shipped);
    use = use === undefined ? used : use + USE_SMOOTHING * (used - use);
    inflow = inflow === undefined ? arrived : inflow + USE_SMOOTHING * (arrived - inflow);
  }
  ledger[good.i] = { intake: came, stock, shipped: 0, use, inflow };
  return { use, inflow };
}

/**
 * A return good's monthly need in the market: its household demand, its towns' calibrated lots
 * and their monthly luxury budget for it (spices, silk, fine cloth; docs/plan/byproduct-export.md §7.4).
 * A good no one sends shows no use of its own, so its need sets the target instead.
 */
function getReturnGoodNeed(market: Market, good: Good, luxuryBudgets: Record<LuxuryTier, number> | undefined): number {
  const world = getWorldContext();
  const rate = Math.max(1, world.populationRate ?? 1000);
  let need = getMonthlyHouseholdDemand(market, good.name);
  for (const burg of world.pack.burgs ?? []) {
    if (!burg?.i || burg.removed || burg.market !== market.i) continue;
    need += getCalibratedMonthlyLots({
      goodName: good.name,
      laborPeopleBurg: laborPeople(burg.population ?? 0, rate),
      port: Boolean(burg.port),
      capital: Boolean(burg.capital),
      market
    });
  }
  const price = market.goods[good.i]?.price || good.value;
  need += luxuryStockTarget(luxuryBudgets, good, price) / LUXURY_STOCK_CYCLES;
  return Math.max(0, need);
}

/** Records a staple shipment (positive out, negative in) against this month's use snapshot. */
function recordShipped(market: Market, good: Good, units: number): void {
  const entry = market.byproductUse?.[good.i];
  if (!entry) return;
  entry.shipped = rn(entry.shipped + units, 4);
  entry.stock = Math.max(0, market.goods[good.i]?.stock ?? 0);
}

/** Updates each market's running use of the by-products and return goods, and ships the ports' surplus. Returns the value exported. */
export function settleByproductExport(): number {
  const settings = getMarketSettings();
  const byproducts = findGoods(EXPORTED_BYPRODUCTS);
  if (!byproducts.length) return 0;
  const returns = findGoods(STAPLE_RETURN_GOODS);
  const intake = getOrCreateMarketGoodProductionTotals() ?? {};
  const ports = portMarketIds();
  const luxuryBudgets = luxuryBudgetByMarketTier(getWorldContext().pack.burgs ?? []);
  let total = 0;
  for (const market of getMarkets()) {
    if (!market) continue;
    const byproductUse = byproducts.map(good => ({ good, use: updateUse(market, good, intake).use }));
    const returnUse = returns.map(good => {
      const observed = updateUse(market, good, intake);
      const need = getReturnGoodNeed(market, good, luxuryBudgets.get(market.i));
      return { good, inflow: observed.inflow, use: Math.max(observed.use ?? 0, need) };
    });
    if (settings.byproductExport !== "staple" || !ports.has(market.i)) continue;
    // The return goods no one on the map sends it, the fewest months of stock first, and the value
    // that fills them to the target.
    const shortages = returnUse
      .filter(({ use, inflow }) => use > 0 && inflow !== undefined && inflow < use * DOMESTIC_INFLOW_SHARE)
      .map(({ good, use }) => {
        const row = market.goods[good.i];
        const price = row?.price ?? good.value;
        const stock = Math.max(0, row?.stock ?? 0);
        const room = Math.max(0, use * settings.byproductReturnMonths - stock);
        return { good, price, room, months: stock / use };
      })
      .filter(entry => entry.room > 1e-6 && entry.price > 0)
      .sort((a, b) => a.months - b.months);
    let returnValue = shortages.reduce((sum, entry) => sum + entry.room * entry.price, 0);
    if (!(returnValue > 0)) continue;
    let exportedValue = 0;
    for (const { good, use } of byproductUse) {
      const row = market.goods[good.i];
      if (!row || use === undefined || !(row.price > 0) || !(returnValue > 1e-9)) continue;
      const surplus = Math.max(0, row.stock - use * settings.byproductExportReserveMonths);
      const units = rn(Math.min(surplus * settings.byproductExportShare, returnValue / row.price), 4);
      if (!(units > 0)) continue;
      row.stock = rn(row.stock - units, 4);
      recordShipped(market, good, units);
      recordGoodFlow({ direction: "sink", category: "stapleExport", goodId: good.i, units, marketId: market.i });
      exportedValue += units * row.price;
      returnValue -= units * row.price;
    }
    if (exportedValue > 0) takeForeignGoods(market, shortages, exportedValue);
    total += exportedValue;
  }
  return rn(total, 4);
}

/** The foreign goods of `value` the ship brings back, filling the shortest return goods first. */
function takeForeignGoods(
  market: Market,
  shortages: readonly { good: Good; price: number; room: number }[],
  value: number
): void {
  let left = value;
  for (const { good, price, room } of shortages) {
    if (!(left > 1e-9)) break;
    const units = rn(Math.min(room, left / price), 4);
    if (!(units > 0)) continue;
    const row = market.goods[good.i] ?? { stock: 0, price };
    row.stock = rn(row.stock + units, 4);
    market.goods[good.i] = row;
    recordShipped(market, good, -units);
    recordGoodFlow({ direction: "source", category: "stapleImport", goodId: good.i, units, marketId: market.i });
    left -= units * price;
  }
}
