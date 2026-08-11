/**
 * World-wide aggregate readers for Goods and Population — split out of goods-editor.ts (2026-08-08)
 * so they can be shared with the Goods Editor's table/CSV export *and* the Balance History snapshot
 * (balanceSnapshot.ts) without either depending on the other's controller-layer code. Pure reads
 * only: no mutation, no DOM/store side effects (`getAllStockData()` still reconciles retail
 * inventory into physical stock as a read-normalization step — see its own doc-comment).
 */

import { rn } from "../../hostUtils";
import {
  getBurgProductionRecords,
  getBurgRetailInventories,
  getBurgWholesaleInventories,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getSaltworks,
  getWorldContext
} from "../economyContext";
import { Goods, isGoodEnabled } from "./goods-generator";
import { Production } from "./production-generator";
import { getCellProduction } from "./production-utils";
import { reconcileRetailInventory } from "./retailInventory";
import { getTradeableStapleCropUnits } from "./stapleCropInventory";

export type StockSource = { name: string; type: "market" | "burg"; x: number; y: number; id: number; stock: number };

export type GoodProduction = { burg: number; cell: number; industrial: number; market: Record<number, number> };

/**
 * Every enabled Good's current world-wide stock, broken down by where it physically sits
 * (market territory pools vs. burg retail/wholesale inventories). Reconciles retail inventory
 * first so the numbers reflect actual shelved/depot stock rather than the per-cycle production
 * accounting journal (see reconcileRetailInventory()'s own doc-comment).
 */
export function getAllStockData(): Record<number, { total: number; sources: StockSource[] }> {
  const result: Record<number, { total: number; sources: StockSource[] }> = {};
  for (const good of getGoods().filter(isGoodEnabled)) {
    result[good.i] = { total: 0, sources: [] };
  }

  reconcileRetailInventory();

  for (const market of getMarkets()) {
    const center = getWorldContext().pack.burgs[market.centerBurgId];
    const addMarketSource = (goodId: number, stock: number): void => {
      if (!result[goodId] || !(stock > 0)) return;
      result[goodId].total += stock;
      result[goodId].sources.push({
        name: market.name || center?.name || `Market ${market.i}`,
        type: "market",
        x: center?.x ?? 0,
        y: center?.y ?? 0,
        id: market.i,
        stock: rn(stock, 2)
      });
    };

    for (const [goodIdStr, { stock }] of Object.entries(market.goods)) {
      const goodId = +goodIdStr;
      if (!result[goodId] || stock <= 0) continue;
      const good = Goods.get(goodId);
      if (good?.tags.includes("stapleFood")) {
        // Grain is a derived Food Ledger view. Read the ledger rather than a
        // persisted market.goods cache, which can be stale between settlements.
        const ledgerStock = market.foodLedger
          ? rn(Math.max(0, market.foodLedger.exportable) + Math.max(0, market.foodLedger.storageOverflow), 2)
          : stock;
        addMarketSource(goodId, ledgerStock);
        continue;
      }
      // Named crop lots are owned by the Food Ledger below, not market.goods.
      if (good?.tags.includes("stapleCrop") && market.foodLedger?.stapleCropInventories?.[goodId]) continue;
      result[goodId].total += stock;
    }

    const ledger = market.foodLedger;
    if (!ledger) continue;
    for (const goodIdStr of Object.keys(ledger.stapleCropInventories ?? {})) {
      const goodId = Number(goodIdStr);
      const good = Goods.get(goodId);
      if (!good?.tags.includes("stapleCrop")) continue;
      const stock = getTradeableStapleCropUnits(ledger, goodId);
      if (stock !== null) addMarketSource(goodId, stock);
    }
  }

  const stockByBurgAndGood = new Map<string, number>();
  const addPhysicalStock = (burgId: number, goodId: number, units: number): void => {
    if (!result[goodId] || !(units > 0.001)) return;
    const key = `${burgId}:${goodId}`;
    stockByBurgAndGood.set(key, (stockByBurgAndGood.get(key) ?? 0) + units);
  };
  for (const inventory of getBurgRetailInventories()) {
    for (const [goodId, stock] of Object.entries(inventory.goods)) {
      addPhysicalStock(inventory.burgId, Number(goodId), stock.onHand);
    }
  }
  for (const inventory of getBurgWholesaleInventories()) {
    for (const [goodId, units] of Object.entries(inventory.goods)) {
      addPhysicalStock(inventory.burgId, Number(goodId), units);
    }
  }
  for (const [key, stock] of stockByBurgAndGood) {
    const [burgIdString, goodIdString] = key.split(":");
    const burgId = Number(burgIdString);
    const goodId = Number(goodIdString);
    const burg = getWorldContext().pack.burgs[burgId];
    if (!burg || burg.removed || !result[goodId]) continue;
    result[goodId].sources.push({
      name: burg.name || `Burg ${burgId}`,
      type: "burg",
      x: burg.x ?? 0,
      y: burg.y ?? 0,
      id: burgId,
      stock: rn(stock, 2)
    });
  }

  for (const good of getGoods().filter(isGoodEnabled)) {
    result[good.i].total = rn(result[good.i].total, 2);
  }

  return result;
}

/**
 * Every Good's current production (cell + burg, split out per market), by good id.
 * `preview: true` in `getCellProduction()` keeps this a read-only report — it must not cull fauna
 * stock (see `getRuralProductionContributions()`'s doc-comment in production-utils.ts), since it
 * runs from report/table contexts (Goods editor table, Balance History snapshot), not the real
 * production cycle.
 */
export function getProduction(): Record<number, GoodProduction> {
  const production: Record<number, GoodProduction> = {};
  const addProduction = (goodId: number, amount: number, type: "burg" | "cell" | "industrial", marketId?: number) => {
    if (!production[goodId]) production[goodId] = { burg: 0, cell: 0, industrial: 0, market: {} };
    production[goodId][type] += amount;
    if (marketId) production[goodId].market[marketId] = (production[goodId].market[marketId] ?? 0) + amount;
  };

  const productionByBiome = Goods.getBiomesProduction();
  const marketCells = getMarketCellColumn();
  for (const cellId of getWorldContext().pack.cells.i) {
    const produced = getCellProduction(cellId, productionByBiome, { preview: true });
    for (const goodId in produced) {
      addProduction(Number(goodId), produced[goodId] || 0, "cell", marketCells[cellId]);
    }
  }

  for (const burg of getWorldContext().pack.burgs) {
    if (!burg || burg.removed || !getBurgProductionRecords(burg).length) continue;
    const produced = Production.getBurgProduction(burg);
    for (const goodId in produced) {
      addProduction(Number(goodId), produced[goodId] || 0, "burg", burg.market);
    }
  }

  const saltGood = getGoods().find(good => good.name === "Salt" && isGoodEnabled(good));
  if (saltGood) {
    for (const saltworks of getSaltworks()) {
      if (!saltworks.active || saltworks.monthlyOutputBags <= 0) continue;
      addProduction(saltGood.i, saltworks.monthlyOutputBags, "industrial", saltworks.marketId);
    }
  }

  return production;
}

/**
 * Real (post-populationRate/urbanization) world population, split rural/urban. Rural comes from
 * `pack.cells.pop` (rural headcount points), urban from each Burg's `population` field — both are
 * scaled the same way the demographics/food systems scale them.
 */
export function getPopulationBreakdown(): { rural: number; urban: number; total: number } {
  const { pack, populationRate, urbanization } = getWorldContext();
  const rate = populationRate || 1;
  const urbanScale = rate * (urbanization || 1);
  let ruralPoints = 0;
  for (const cellId of pack.cells.i) ruralPoints += pack.cells.pop[cellId] ?? 0;
  const rural = ruralPoints * rate;
  const urban = pack.burgs.reduce((sum, burg) => sum + (burg?.removed ? 0 : (burg?.population ?? 0)), 0) * urbanScale;
  return { rural, urban, total: rural + urban };
}

/** Total world population — convenience wrapper around `getPopulationBreakdown()`. */
export function getTotalPopulation(): number {
  return getPopulationBreakdown().total;
}
