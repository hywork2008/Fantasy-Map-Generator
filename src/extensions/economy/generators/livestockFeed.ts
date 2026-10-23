/** One physical pasture/hay budget per cell; farmers and the army share real Fodder market stock. */
import { rn } from "../../hostUtils";
import {
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getOrCreateFaunaStockTable,
  getOrCreateLivestockFeedTable,
  getWorldContext
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { creditRuralHouseholdWealth, debitRuralHouseholdWealth, getRuralHouseholdWealth } from "./householdWealth";
import { calculateHusbandryDemand, getPastureAreaUsedHectares } from "./husbandry";
import { getHusbandryLaborBudget } from "./husbandryLabor";
import {
  ANNUAL_FEED_DM_KG_PER_HEAD,
  FODDER_DM_KG_PER_LOT,
  getLivestockHayPlan,
  getPastureGrowth,
  HAY_DRY_MATTER_RETENTION,
  HAY_STORAGE_LOSS_PER_MONTH,
  HAY_WORK_DAYS_PER_TONNE_DM,
  LIVESTOCK_FEED_CASH_SHARE,
  type LivestockFeedLedger
} from "./livestockFeedPolicy";
import { livestockFeedMonth, livestockFeedPeriod } from "./livestockFeedState";
import type { Market } from "./marketTypes";

export function getLivestockMonthlyFeedNeedKg(cellId: number): number {
  const table = getOrCreateFaunaStockTable();
  return Object.entries(ANNUAL_FEED_DM_KG_PER_HEAD).reduce((sum, [name, kg]) => {
    const herd = table?.[`${cellId}:${name}`];
    const heads = herd ? Math.max(0, herd.young) + Math.max(0, herd.breeding) + Math.max(0, herd.old) : 0;
    return sum + (heads * kg) / 12;
  }, 0);
}

function emptyLedger(): LivestockFeedLedger {
  return {
    hayKg: 0,
    pastureGrownKg: 0,
    grazingReservedKg: 0,
    harvestedKg: 0,
    harvestLossKg: 0,
    storageLossKg: 0,
    unharvestedKg: 0,
    soldKg: 0,
    purchasedKg: 0,
    requiredKg: 0,
    pastureConsumedKg: 0,
    hayConsumedKg: 0,
    unmetKg: 0,
    coverage: 1,
    spending: 0,
    revenue: 0,
    samples: []
  };
}

/** Same forecast as the worker plan, evaluated against actual animals and maintained land. */
function reserveAfterFeedingKg(cellId: number): number {
  return getLivestockHayPlan(
    getWorldContext(),
    cellId,
    getLivestockMonthlyFeedNeedKg(cellId) * 12,
    getPastureAreaUsedHectares(cellId)
  ).reserveAfterMonthKg[livestockFeedMonth() - 1];
}

/** Runs before military procurement. Only unused pasture growth can become hay or market Fodder. */
export function harvestLivestockForage(): void {
  const table = getOrCreateLivestockFeedTable();
  if (!table) return;
  const world = getWorldContext();
  const period = livestockFeedPeriod();
  const month = livestockFeedMonth() - 1;
  const marketCells = getMarketCellColumn();
  const fodder = getGoods().find(good => good.name === "Fodder" && isGoodEnabled(good));
  const offers = new Map<number, { cell: number; kg: number }[]>();
  for (const cell of world.pack.cells?.i ?? []) {
    if (world.pack.cells.h[cell] < 20) continue;
    if (
      !(getPastureAreaUsedHectares(cell) > 0) &&
      !(getLivestockMonthlyFeedNeedKg(cell) > 0) &&
      !(table[cell]?.hayKg > 0)
    )
      continue;
    table[cell] ??= emptyLedger();
    const row = table[cell];
    if (row.harvestPeriod !== undefined && row.harvestPeriod >= period) continue;
    const growth = getPastureGrowth(world, cell);
    const grown = getPastureAreaUsedHectares(cell) * growth.annualKgPerHa * growth.weights[month];
    const need = getLivestockMonthlyFeedNeedKg(cell);
    const grazing = Math.min(grown, need);
    const surplus = Math.max(0, grown - grazing);
    const demand = calculateHusbandryDemand(world, cell);
    const workDays = getHusbandryLaborBudget(cell, month, demand).hayCapacityDays;
    const harvested = Math.min(surplus, (workDays / HAY_WORK_DAYS_PER_TONNE_DM) * 1000);
    const received = harvested * HAY_DRY_MATTER_RETENTION;
    const storageLoss = Math.max(0, row.hayKg) * HAY_STORAGE_LOSS_PER_MONTH;
    const remainingHay = Math.max(0, row.hayKg - storageLoss);
    const ownHay = Math.min(received, Math.max(0, reserveAfterFeedingKg(cell) - remainingHay));
    const ownHarvest = ownHay / HAY_DRY_MATTER_RETENTION;
    row.hayKg = remainingHay + ownHay;
    Object.assign(row, {
      harvestPeriod: period,
      pastureGrownKg: grown,
      grazingReservedKg: grazing,
      harvestedKg: ownHarvest,
      harvestLossKg: ownHarvest - ownHay,
      storageLossKg: storageLoss,
      unharvestedKg: surplus - ownHarvest,
      soldKg: 0,
      purchasedKg: 0,
      spending: 0,
      revenue: 0
    });
    // Never sell last month's bought fodder back as a new rural harvest.
    const sellKg = received - ownHay;
    if (fodder && sellKg > 0 && marketCells[cell]) {
      const list = offers.get(marketCells[cell]) ?? [];
      list.push({ cell, kg: sellKg });
      offers.set(marketCells[cell], list);
    }
  }
  if (!fodder) return;
  for (const market of getMarkets()) {
    const list = offers.get(market.i);
    if (!list?.length || !market.foodLedger) continue;
    market.goods[fodder.i] ??= { stock: 0, price: fodder.value };
    const stock = market.goods[fodder.i];
    if (!(stock.price > 0) || !Number.isFinite(stock.price)) continue;
    const totalKg = list.reduce((sum, offer) => sum + offer.kg, 0);
    const treasury = market.marketTreasury;
    const price = stock.price * 0.8;
    const bill =
      Math.floor(Math.min(Math.max(0, treasury?.balance ?? 0), (totalKg / FODDER_DM_KG_PER_LOT) * price) * 100) / 100;
    if (!(bill > 0) || !treasury) continue;
    const boughtKg = (bill / price) * FODDER_DM_KG_PER_LOT;
    for (const offer of list) {
      const row = table[offer.cell];
      const kg = (boughtKg * offer.kg) / totalKg;
      const rawHarvest = kg / HAY_DRY_MATTER_RETENTION;
      row.harvestedKg += rawHarvest;
      row.harvestLossKg += rawHarvest - kg;
      row.unharvestedKg = Math.max(0, row.unharvestedKg - rawHarvest);
      row.soldKg += kg;
      row.revenue += (bill * offer.kg) / totalKg;
    }
    treasury.balance = rn(treasury.balance - bill, 2);
    creditRuralHouseholdWealth(market, bill);
    stock.stock += boughtKg / FODDER_DM_KG_PER_LOT;
    recordGoodFlow({
      direction: "source",
      category: "ruralHarvest",
      goodId: fodder.i,
      units: boughtKg / FODDER_DM_KG_PER_LOT,
      marketId: market.i
    });
  }
}

/** Paid requests for current shortage first; winter-reserve replenishment gets only the remainder. */
function buyFeed(market: Market, entries: { cell: number; kg: number }[], budget: number): number {
  const table = getOrCreateLivestockFeedTable()!;
  const fodder = getGoods().find(good => good.name === "Fodder" && isGoodEnabled(good));
  if (!fodder || !market.foodLedger) return 0;
  const stock = market.goods[fodder.i];
  if (!stock || !(stock.price > 0) || !Number.isFinite(stock.price)) return 0;
  const need = entries.reduce((sum, entry) => sum + entry.kg, 0);
  if (!(need > 0)) return 0;
  const cost =
    Math.floor(
      Math.min(budget, (need / FODDER_DM_KG_PER_LOT) * stock.price, Math.max(0, stock.stock) * stock.price) * 100 + 1e-9
    ) / 100;
  if (!(cost > 0)) return 0;
  const paid = debitRuralHouseholdWealth(market, cost);
  const kg = (paid / stock.price) * FODDER_DM_KG_PER_LOT;
  stock.stock = Math.max(0, stock.stock - kg / FODDER_DM_KG_PER_LOT);
  market.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
  market.marketTreasury.balance = rn(market.marketTreasury.balance + paid, 2);
  for (const entry of entries) {
    const row = table[entry.cell];
    row.hayKg += (kg * entry.kg) / need;
    row.purchasedKg += (kg * entry.kg) / need;
    row.spending += (paid * entry.kg) / need;
  }
  // Bought hay is transferred into private reserves; final feeding is recorded in the dry-matter ledger.
  recordGoodFlow({
    direction: "sink",
    category: "livestockFeed",
    goodId: fodder.i,
    units: kg / FODDER_DM_KG_PER_LOT,
    marketId: market.i
  });
  return paid;
}

/** Runs after trade; existing army procurement has already removed its share of the same stock. */
export function settleLivestockFeed(): void {
  const table = getOrCreateLivestockFeedTable();
  if (!table) return;
  const period = livestockFeedPeriod();
  const marketCells = getMarketCellColumn();
  const groups = new Map<number, number[]>();
  const active: number[] = [];
  for (const cell of getWorldContext().pack.cells?.i ?? []) {
    const row = table[cell];
    if (!row || row.harvestPeriod !== period || (row.feedPeriod !== undefined && row.feedPeriod >= period)) continue;
    row.requiredKg = getLivestockMonthlyFeedNeedKg(cell);
    row.pastureConsumedKg = Math.min(row.requiredKg, row.grazingReservedKg);
    row.hayConsumedKg = 0;
    active.push(cell);
    const list = groups.get(marketCells[cell]) ?? [];
    list.push(cell);
    groups.set(marketCells[cell], list);
  }
  for (const market of getMarkets()) {
    const cells = groups.get(market.i) ?? [];
    if (!cells.length) continue;
    let budget = Math.floor(getRuralHouseholdWealth(market) * LIVESTOCK_FEED_CASH_SHARE * 100) / 100;
    const shortage = cells.map(cell => ({
      cell,
      kg: Math.max(0, table[cell].requiredKg - table[cell].pastureConsumedKg - table[cell].hayKg)
    }));
    budget = Math.max(0, budget - buyFeed(market, shortage, budget));
    const reserves = cells.map(cell => ({
      cell,
      kg: Math.max(
        0,
        table[cell].requiredKg + reserveAfterFeedingKg(cell) - table[cell].pastureConsumedKg - table[cell].hayKg
      )
    }));
    buyFeed(market, reserves, budget);
  }
  for (const cell of active) {
    const row = table[cell];
    row.hayConsumedKg = Math.min(Math.max(0, row.requiredKg - row.pastureConsumedKg), row.hayKg);
    row.hayKg = Math.max(0, row.hayKg - row.hayConsumedKg);
    row.unmetKg = Math.max(0, row.requiredKg - row.pastureConsumedKg - row.hayConsumedKg);
    row.coverage = row.requiredKg > 0 ? Math.max(0, Math.min(1, 1 - row.unmetKg / row.requiredKg)) : 1;
    row.feedPeriod = period;
    row.samples = row.samples.filter(sample => sample.period > period - 12 && sample.period !== period);
    row.samples.push({
      period,
      requiredKg: row.requiredKg,
      fedKg: row.pastureConsumedKg + row.hayConsumedKg,
      purchasedKg: row.purchasedKg,
      soldKg: row.soldKg,
      harvestLossKg: row.harvestLossKg,
      storageLossKg: row.storageLossKg
    });
  }
}

/** Remaining private demand, used by trade without adding generic population/category demand. */
export function getLivestockFodderOrderLots(market: Market): number {
  const table = getOrCreateLivestockFeedTable();
  if (!table || !market.foodLedger) return 0;
  const fodder = getGoods().find(good => good.name === "Fodder" && isGoodEnabled(good));
  const price = fodder ? (market.goods[fodder.i]?.price ?? fodder.value) : 0;
  if (!(price > 0) || !Number.isFinite(price)) return 0;
  const marketCells = getMarketCellColumn();
  let need = 0;
  for (const cell of getWorldContext().pack.cells?.i ?? []) {
    if (marketCells[cell] !== market.i) continue;
    const row = table[cell];
    need += Math.max(
      0,
      getLivestockMonthlyFeedNeedKg(cell) +
        reserveAfterFeedingKg(cell) -
        (row?.grazingReservedKg ?? 0) -
        (row?.hayKg ?? 0)
    );
  }
  return Math.min(need / FODDER_DM_KG_PER_LOT, (getRuralHouseholdWealth(market) * LIVESTOCK_FEED_CASH_SHARE) / price);
}
