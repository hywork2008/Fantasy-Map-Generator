/**
 * Hides and tallow sold off the map from the port markets (docs/plan/byproduct-export.md §3), as
 * the staple ports shipped them to the Low Countries for cloth and wine. Each month a port market
 * sells `byproductExportShare` of its stock above `byproductExportReserveMonths` of its own use,
 * and takes foreign goods of the same value in return: no money comes in from off the map.
 */
import { getMarketSettings } from "../../../simulation/marketSettings";
import { rn } from "../../hostUtils";
import { getGoods, getMarkets, getOrCreateMarketGoodProductionTotals, getWorldContext } from "../economyContext";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { Good } from "./goodsGeneratorTypes";
import type { Market } from "./marketTypes";

export const EXPORTED_BYPRODUCTS = ["Leather", "Tallow"] as const;
/** Weight of the latest month in a market's running monthly use of a by-product. */
const USE_SMOOTHING = 0.2;

const isFood = (good: Good) => good.tags.some(tag => tag === "food" || tag === "freshFood" || tag === "stapleFood");
const isLuxury = (good: Good) => good.tags.some(tag => tag === "luxury" || tag === "art" || tag === "gift");

function portMarketIds(): Set<number> {
  const ids = new Set<number>();
  for (const burg of getWorldContext().pack.burgs ?? []) {
    if (burg?.i && !burg.removed && burg.port && burg.market) ids.add(burg.market);
  }
  return ids;
}

/**
 * Updates each market's running use of the by-products (what came in less what its stock grew,
 * less its own exports) and ships the ports' surplus. Returns the value exported.
 */
export function settleByproductExport(): number {
  const settings = getMarketSettings();
  const goods = getGoods();
  const byproducts = EXPORTED_BYPRODUCTS.map(name => goods.find(good => good.name === name)).filter(
    (good): good is Good => Boolean(good)
  );
  if (!byproducts.length) return 0;
  const intake = getOrCreateMarketGoodProductionTotals() ?? {};
  const ports = portMarketIds();
  const imports = goods.filter(
    good => isLuxury(good) && !isFood(good) && !EXPORTED_BYPRODUCTS.includes(good.name as never)
  );
  let total = 0;
  for (const market of getMarkets()) {
    if (!market) continue;
    if (!market.byproductUse) market.byproductUse = {};
    const ledger = market.byproductUse;
    let exportedValue = 0;
    for (const good of byproducts) {
      const row = market.goods[good.i];
      const stock = Math.max(0, row?.stock ?? 0);
      const came = intake[`${market.i}:${good.i}`] ?? 0;
      const entry = ledger[good.i];
      if (entry) {
        const used = Math.max(0, came - entry.intake - (stock - entry.stock) - entry.exported);
        entry.use = entry.use === undefined ? used : entry.use + USE_SMOOTHING * (used - entry.use);
      }
      const next = { intake: came, stock, exported: 0, use: entry?.use };
      ledger[good.i] = next;
      if (settings.byproductExport !== "staple" || !ports.has(market.i) || !row || next.use === undefined) continue;
      const surplus = stock - next.use * settings.byproductExportReserveMonths;
      const units = rn(Math.max(0, surplus) * settings.byproductExportShare, 4);
      if (!(units > 0) || !(row.price > 0)) continue;
      row.stock = rn(row.stock - units, 4);
      next.stock = row.stock;
      next.exported = units;
      recordGoodFlow({ direction: "sink", category: "stapleExport", goodId: good.i, units, marketId: market.i });
      exportedValue += units * row.price;
    }
    if (exportedValue > 0) takeForeignGoods(market, imports, exportedValue);
    total += exportedValue;
  }
  return rn(total, 4);
}

/** The foreign goods of `value` the ship brings back: the luxury dearest at home against its base value. */
function takeForeignGoods(market: Market, imports: readonly Good[], value: number): void {
  let best: { good: Good; price: number; ratio: number } | undefined;
  for (const good of imports) {
    const price = market.goods[good.i]?.price ?? good.value;
    if (!(price > 0) || !(good.value > 0)) continue;
    const ratio = price / good.value;
    if (!best || ratio > best.ratio) best = { good, price, ratio };
  }
  if (!best) return;
  const units = rn(value / best.price, 4);
  const row = market.goods[best.good.i] ?? { stock: 0, price: best.price };
  row.stock = rn(row.stock + units, 4);
  market.goods[best.good.i] = row;
  recordGoodFlow({ direction: "source", category: "stapleImport", goodId: best.good.i, units, marketId: market.i });
}
