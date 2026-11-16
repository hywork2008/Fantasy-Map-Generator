/** One physical pasture/hay budget per cell; farmers and the army share real Fodder market stock. */

import { getMarketSettings } from "../../../simulation/marketSettings";
import { rn } from "../../hostUtils";
import { getRuralHouseholdFoodStock, setRuralHouseholdFoodStock } from "../context/agriculture";
import { getCropResidueState } from "../context/cropResidues";
import { getMilitaryResourceLedgers } from "../context/fiscal";
import {
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getOrCreateFaunaStockTable,
  getOrCreateLivestockFeedTable,
  getWorldContext
} from "../economyContext";
import { recordCountrysideFlow } from "./approachLedger";
import { consumeCropResidues } from "./cropResidues";
import { getMarketPriceLevel } from "./currencySufficiency";
import { getMilkOutput } from "./dairy";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { RURAL_HOUSEHOLD_FOOD_RESERVE_YEARS } from "./foodProduction";
import { WAIN_KG } from "./goodMeasureCatalog";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { HERD_MEAT_OFFTAKE } from "./herdDiet";
import {
  creditRuralHouseholdWealth,
  debitRuralHouseholdWealth,
  getRuralHouseholdWealth,
  repayRuralHay
} from "./householdWealth";
import { calculateHusbandryDemand, getForageAreaHectares, getGrazedCarryingCapacity } from "./husbandry";
import { getHusbandryLaborBudget } from "./husbandryLabor";
import {
  ANNUAL_FEED_DM_KG_PER_HEAD,
  FODDER_DM_KG_PER_LOT,
  FODDER_STOCK_YEARS,
  getLivestockHayPlan,
  getPastureGrowth,
  HAY_DRY_MATTER_RETENTION,
  HAY_STORAGE_LOSS_PER_MONTH,
  HAY_WORK_DAYS_PER_TONNE_DM,
  LIVESTOCK_FEED_CASH_SHARE,
  type LivestockFeedLedger,
  STANDING_GRASS_LOSS_PER_MONTH
} from "./livestockFeedPolicy";
import { livestockFeedMonth, livestockFeedPeriod } from "./livestockFeedState";
import { getRawGoodTargetPrice } from "./marketPricing";
import type { Market } from "./marketTypes";
import { drawTradeableStapleCrop, getTradeableStapleCropUnits } from "./stapleCropInventory";
import { getWoolOutput } from "./woolProduction";

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

/**
 * Annual feed need of the herd the cell will winter: each species' larger of its present heads and
 * its supported herd. The herd is sold down through the year and refilled by the January renewal,
 * so the summer's present herd under-plans the winter's hay (docs/plan/hay-plan-herd.md).
 */
function getWinteredHerdAnnualNeedKg(cellId: number): number {
  const table = getOrCreateFaunaStockTable();
  const goods = getGoods();
  return Object.entries(ANNUAL_FEED_DM_KG_PER_HEAD).reduce((sum, [name, kg]) => {
    const herd = table?.[`${cellId}:${name}`];
    const heads = herd ? Math.max(0, herd.young) + Math.max(0, herd.breeding) + Math.max(0, herd.old) : 0;
    const good = goods.find(row => row.name === name);
    const supported = good && isGoodEnabled(good) ? getGrazedCarryingCapacity(cellId, good) : 0;
    return sum + Math.max(heads, supported) * kg;
  }, 0);
}

/** Same forecast as the worker plan, evaluated against the wintered (or, with `hayPlanHerd` current, the present) animals and maintained land. */
function getCellHayPlan(cellId: number) {
  const annualNeedKg =
    getMarketSettings().hayPlanHerd === "current"
      ? getLivestockMonthlyFeedNeedKg(cellId) * 12
      : getWinteredHerdAnnualNeedKg(cellId);
  return getLivestockHayPlan(getWorldContext(), cellId, annualNeedKg, getForageAreaHectares(cellId));
}

function reserveAfterFeedingKg(cellId: number): number {
  return getCellHayPlan(cellId).reserveAfterMonthKg[livestockFeedMonth() - 1];
}

/**
 * World birth (docs/plan/livestock-world-birth-herds.md, B1): each cell's barn holds what its own hay
 * plan keeps at the start of the birth month, made the summer before the world began. Without it a
 * world born in winter starves its first winter and the fed-share history cuts every herd.
 */
export function stockWorldBirthHay(): void {
  const table = getOrCreateLivestockFeedTable();
  if (!table) return;
  const before = (livestockFeedMonth() + 10) % 12;
  for (const cell of getWorldContext().pack.cells?.i ?? []) {
    if (!(getLivestockMonthlyFeedNeedKg(cell) > 0)) continue;
    table[cell] ??= emptyLedger();
    const row = table[cell];
    row.hayKg = Math.max(row.hayKg, getCellHayPlan(cell).reserveAfterMonthKg[before] ?? 0);
  }
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
  // Hay still missing from each herd's winter reserve plan after its own cut.
  const shortfalls = new Map<number, { cell: number; kg: number }[]>();
  for (const cell of world.pack.cells?.i ?? []) {
    if (world.pack.cells.h[cell] < 20) continue;
    if (!(getForageAreaHectares(cell) > 0) && !(getLivestockMonthlyFeedNeedKg(cell) > 0) && !(table[cell]?.hayKg > 0))
      continue;
    table[cell] ??= emptyLedger();
    const row = table[cell];
    if (row.harvestPeriod !== undefined && row.harvestPeriod >= period) continue;
    const growth = getPastureGrowth(world, cell);
    const grown = getForageAreaHectares(cell) * growth.annualKgPerHa * growth.weights[month];
    const need = getLivestockMonthlyFeedNeedKg(cell);
    const grazing = Math.min(grown, need);
    const surplus = Math.max(0, grown - grazing);
    const plan = getCellHayPlan(cell);
    // Only last month's shut-up growth is still standing; older uncut grass has been lost.
    const standingIn = (row.standingKg ?? 0) * (1 - STANDING_GRASS_LOSS_PER_MONTH);
    const demand = calculateHusbandryDemand(world, cell);
    const workDays = getHusbandryLaborBudget(cell, month, demand).hayCapacityDays;
    const harvested = Math.min(standingIn + surplus, (workDays / HAY_WORK_DAYS_PER_TONNE_DM) * 1000);
    const received = harvested * HAY_DRY_MATTER_RETENTION;
    const storageLoss = Math.max(0, row.hayKg) * HAY_STORAGE_LOSS_PER_MONTH;
    const remainingHay = Math.max(0, row.hayKg - storageLoss);
    const ownHay = Math.min(received, Math.max(0, plan.reserveAfterMonthKg[month] - remainingHay));
    const ownHarvest = ownHay / HAY_DRY_MATTER_RETENTION;
    row.hayKg = remainingHay + ownHay;
    const uncutGrowth = Math.min(surplus, standingIn + surplus - harvested);
    const standingOut = plan.shutUpMonth === month ? uncutGrowth : 0;
    Object.assign(row, {
      harvestPeriod: period,
      pastureGrownKg: grown,
      grazingReservedKg: grazing,
      harvestedKg: ownHarvest,
      harvestLossKg: ownHarvest - ownHay,
      storageLossKg: storageLoss,
      standingInKg: standingIn,
      standingKg: standingOut,
      unharvestedKg: standingIn + surplus - ownHarvest - standingOut,
      soldKg: 0,
      purchasedKg: 0,
      cropResidueFeedKg: 0,
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
    const shortKg = need > 0 ? Math.max(0, plan.reserveAfterMonthKg[month] - row.hayKg) : 0;
    if (fodder && shortKg > 0 && marketCells[cell]) {
      const list = shortfalls.get(marketCells[cell]) ?? [];
      list.push({ cell, kg: shortKg });
      shortfalls.set(marketCells[cell], list);
    }
  }
  if (!fodder) return;
  const { hayTrade, hayPayment } = getMarketSettings();
  for (const market of getMarkets()) {
    if (!market.foodLedger) continue;
    const ledger = market.foodLedger;
    // A market without a record starts from this month's herd orders, as a year's use.
    ledger.fodderAnnualUseLots =
      ledger.fodderAnnualUseLots === undefined
        ? getLivestockFodderOrderLots(market) * 12
        : (ledger.fodderAnnualUseLots * 11) / 12;
    const list = offers.get(market.i);
    if (!list?.length) continue;
    ledger.fodderCutPeriod = period;
    market.goods[fodder.i] ??= { stock: 0, price: fodder.value };
    const stock = market.goods[fodder.i];
    if (!(stock.price > 0) || !Number.isFinite(stock.price)) continue;
    const short = shortfalls.get(market.i) ?? [];
    if (hayTrade === "farmsFirst")
      tradeHayBetweenFarms(table, list, short, getFodderClearingPrice(market, stock.stock) * 0.8);
    // The market buys the grass its herds will eat: what its farms still lack for their winter
    // reserves and can pay for before the next cut, or a year's sales if larger, above its stock.
    // Sales alone shrank year by year, since a market short of stock sold less and then bought less
    // (docs/analytics/hay-surplus-20261031.md); the farms' whole shortfall bought hay they could not
    // afford, which lay in stock at the floor price (approach-commerce-readiness-20261101.md §7).
    const shortLots = short.reduce((sum, entry) => sum + entry.kg, 0) / FODDER_DM_KG_PER_LOT;
    const seasonLots = getFodderSeasonDemandLots(market, getFodderClearingPrice(market, stock.stock));
    const wantedLots = Math.max(
      0,
      Math.max(ledger.fodderAnnualUseLots * FODDER_STOCK_YEARS, Math.min(shortLots, seasonLots)) -
        Math.max(0, stock.stock)
    );
    const offeredKg = list.reduce((sum, offer) => sum + offer.kg, 0);
    if (!(offeredKg > 0)) continue;
    const totalKg = Math.min(offeredKg, wantedLots * FODDER_DM_KG_PER_LOT);
    const treasury = market.marketTreasury;
    // The new crop is bought at the price it clears at once in stock, not at last month's: that was
    // the dear price of the empty market before the cut, and the hay then sold to the same farms at
    // a fraction of it (docs/analytics/hay-trade-modes-20261101.md §3).
    const price = getFodderClearingPrice(market, stock.stock + totalKg / FODDER_DM_KG_PER_LOT) * 0.8;
    if (!treasury) continue;
    // On credit the market sells the farms' hay for them and pays them what it fetches, as it sells;
    // a price fixed at the cut left the gap to the dearer winter price in the treasury
    // (approach-commerce-readiness-20261101.md §7). With cash it buys outright, as far as it holds.
    const onCredit = hayPayment === "onCredit";
    const value = (totalKg / FODDER_DM_KG_PER_LOT) * price;
    const bill = onCredit ? 0 : Math.floor(Math.min(Math.max(0, treasury.balance), value) * 100) / 100;
    if (!onCredit && !(bill > 0)) continue;
    const boughtKg = onCredit ? totalKg : (bill / price) * FODDER_DM_KG_PER_LOT;
    for (const offer of list) {
      const row = table[offer.cell];
      const kg = (boughtKg * offer.kg) / offeredKg;
      const rawHarvest = kg / HAY_DRY_MATTER_RETENTION;
      row.harvestedKg += rawHarvest;
      row.harvestLossKg += rawHarvest - kg;
      row.unharvestedKg = Math.max(0, row.unharvestedKg - rawHarvest);
      row.soldKg += kg;
      row.revenue += (bill * offer.kg) / offeredKg;
    }
    if (onCredit)
      treasury.ruralHayConsignedLots = (treasury.ruralHayConsignedLots ?? 0) + boughtKg / FODDER_DM_KG_PER_LOT;
    else {
      treasury.balance = rn(treasury.balance - bill, 2);
      creditRuralHouseholdWealth(market, bill);
    }
    stock.stock += boughtKg / FODDER_DM_KG_PER_LOT;
    stock.price = getFodderClearingPrice(market, stock.stock);
    recordCountrysideFlow(market.i, market.centerBurgId ?? 0, fodder.i, boughtKg / FODDER_DM_KG_PER_LOT, "inbound");
    recordGoodFlow({
      direction: "source",
      category: "ruralHarvest",
      goodId: fodder.i,
      units: boughtKg / FODDER_DM_KG_PER_LOT,
      marketId: market.i
    });
  }
}

/** Months the market's hay stock must still last: a year from its last cut, at least this month. */
function monthsToNextCut(market: Market): number {
  const cut = market.foodLedger?.fodderCutPeriod;
  return cut === undefined ? 1 : Math.max(1, 12 - (livestockFeedPeriod() - cut));
}

/**
 * Fodder the market's stock is priced and traded against: until the next cut, the farms' need or what
 * they spend on feed at `price` if less, and the army's ration. Hay is cut once a year and bought
 * over the months after, so one month's orders against a year's stock priced it at the floor after
 * the cut, and the farms' whole need priced it beyond their purse (docs/analytics/hay-trade-modes-20261101.md).
 */
export function getFodderSeasonDemandLots(market: Market, price: number): number {
  const months = monthsToNextCut(market);
  const army = getMilitaryResourceLedgers()
    .filter(ledger => ledger.supplyMarketId === market.i)
    .reduce((sum, ledger) => sum + (ledger.annualDemand.fodder ?? 0) / 12, 0);
  const spend = price > 0 ? (getRuralHouseholdWealth(market) * LIVESTOCK_FEED_CASH_SHARE * months) / price : 0;
  return Math.min(getLivestockFodderNeedLots(market), spend) + army * months;
}

/**
 * Fodder price at which the season's demand meets `stockLots` in stock, as the monthly price pass
 * reckons it (markets-generator.ts `initializeMarketPrices`, without its smoothing from the last
 * price). Farm spending falls as the price rises, so it is iterated by geometric means.
 */
export function getFodderClearingPrice(market: Market, stockLots: number): number {
  const fodder = getGoods().find(good => good.name === "Fodder" && isGoodEnabled(good));
  if (!fodder) return 0;
  const baseValue = fodder.value * getMarketPriceLevel(market);
  let price = baseValue;
  for (let step = 0; step < 8; step++)
    price = Math.sqrt(
      price * getRawGoodTargetPrice(fodder, baseValue, getFodderSeasonDemandLots(market, price), stockLots)
    );
  return price;
}

/**
 * Spare hay goes straight from farms with more than their reserve plan to short farms of the same
 * market, in proportion on both sides. Both pay from and into the one rural purse, so no cash moves;
 * the price is only recorded. The offers and shortfalls are reduced by what was moved.
 */
function tradeHayBetweenFarms(
  table: Record<number, LivestockFeedLedger>,
  offers: { cell: number; kg: number }[],
  shortfalls: { cell: number; kg: number }[],
  price: number
): void {
  const offeredKg = offers.reduce((sum, offer) => sum + offer.kg, 0);
  const shortKg = shortfalls.reduce((sum, entry) => sum + entry.kg, 0);
  const movedKg = Math.min(offeredKg, shortKg);
  if (!(movedKg > 0)) return;
  for (const offer of offers) {
    const row = table[offer.cell];
    const kg = (movedKg * offer.kg) / offeredKg;
    const rawHarvest = kg / HAY_DRY_MATTER_RETENTION;
    row.harvestedKg += rawHarvest;
    row.harvestLossKg += rawHarvest - kg;
    row.unharvestedKg = Math.max(0, row.unharvestedKg - rawHarvest);
    row.soldKg += kg;
    row.revenue += (kg / FODDER_DM_KG_PER_LOT) * price;
    offer.kg -= kg;
  }
  for (const entry of shortfalls) {
    const row = table[entry.cell];
    const kg = (movedKg * entry.kg) / shortKg;
    row.hayKg += kg;
    row.purchasedKg += kg;
    row.spending += (kg / FODDER_DM_KG_PER_LOT) * price;
    entry.kg -= kg;
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
  const treasury = market.marketTreasury;
  treasury.balance = rn(treasury.balance + paid, 2);
  // The farms' consigned hay sells first, and what it fetches is theirs.
  const soldLots = kg / FODDER_DM_KG_PER_LOT;
  const consigned = Math.min(treasury.ruralHayConsignedLots ?? 0, stock.stock + soldLots);
  const farmLots = Math.min(soldLots, consigned);
  let proceeds = 0;
  if (farmLots > 0) {
    treasury.ruralHayConsignedLots = consigned - farmLots;
    proceeds = rn((paid * farmLots) / soldLots, 2);
    treasury.balance = rn(treasury.balance - proceeds, 2);
    creditRuralHouseholdWealth(market, proceeds);
  }
  // Hay a save bought on credit at a fixed price is still owed.
  repayRuralHay(market, rn(paid - proceeds, 2));
  for (const entry of entries) {
    const row = table[entry.cell];
    row.hayKg += (kg * entry.kg) / need;
    row.purchasedKg += (kg * entry.kg) / need;
    row.spending += (paid * entry.kg) / need;
  }
  market.foodLedger.fodderAnnualUseLots = (market.foodLedger.fodderAnnualUseLots ?? 0) + kg / FODDER_DM_KG_PER_LOT;
  recordCountrysideFlow(market.i, market.centerBurgId ?? 0, fodder.i, kg / FODDER_DM_KG_PER_LOT, "outbound");
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

/** Grains fed to stock short of hay: oats first, as on the manors (Langdon), then barley and pulses. */
const FODDER_GRAINS = ["Oats", "Barley", "Peas", "Broad Beans"] as const;
/** Dry matter of stored grain. */
const GRAIN_DRY_MATTER_SHARE = 0.87;
/**
 * Hay dry matter one kg of grain dry matter stands for: metabolisable energy of about 11.5 MJ/kg DM for oats
 * against about 8 for meadow hay (modern feed tables; docs/plan/livestock-feed-shortfall.md §2).
 */
export const GRAIN_FEED_HAY_EQUIVALENT = 1.4;

/**
 * Feed still short after pasture, residues and bought hay is made up with fodder grain from the market's spare
 * grain: what can leave the Food Ledger without touching its protected food reserve, so a market short of bread
 * feeds none. Paid from the farms' feed money at the grain's market price; each short cell gets its share.
 */
function feedGrain(market: Market, entries: { cell: number; kg: number }[], budget: number): number {
  if (getMarketSettings().grainFeed !== "fodderGrains" || !market.foodLedger) return 0;
  const table = getOrCreateLivestockFeedTable()!;
  const short = entries
    .map(entry => {
      const row = table[entry.cell];
      return {
        cell: entry.cell,
        kg: Math.max(
          0,
          row.requiredKg - row.pastureConsumedKg - (row.cropResidueFeedKg ?? 0) - row.hayKg - (row.grainFeedKg ?? 0)
        )
      };
    })
    .filter(entry => entry.kg > 0);
  const hayKgPerUnit = WAIN_KG * GRAIN_DRY_MATTER_SHARE * GRAIN_FEED_HAY_EQUIVALENT;
  feedOwnGrain(table, short, hayKgPerUnit);
  let needKg = short.reduce((sum, entry) => sum + entry.kg, 0);
  if (!(needKg > 0)) return 0;
  let spent = 0;
  for (const name of FODDER_GRAINS) {
    if (!(needKg > 1e-6) || !(budget - spent > 0)) break;
    // Bought grain: only what the farms' monthly feed money pays for.
    const good = getGoods().find(row => row.name === name && isGoodEnabled(row));
    if (!good) continue;
    const spare = getTradeableStapleCropUnits(market.foodLedger, good.i) ?? 0;
    const price = market.goods[good.i]?.price ?? good.value;
    if (!(spare > 0) || !(price > 0) || !Number.isFinite(price)) continue;
    const wanted = Math.min(spare, needKg / hayKgPerUnit, (budget - spent) / price);
    const units = drawTradeableStapleCrop(market.foodLedger, good.i, Math.floor(wanted * 100) / 100);
    if (!(units > 0)) continue;
    const paid = debitRuralHouseholdWealth(market, rn(units * price, 2));
    market.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
    market.marketTreasury.balance = rn(market.marketTreasury.balance + paid, 2);
    spent += paid;
    const fedKg = units * hayKgPerUnit;
    for (const entry of short) {
      const row = table[entry.cell];
      const kg = Math.min(entry.kg, (fedKg * entry.kg) / needKg);
      row.grainFeedKg = (row.grainFeedKg ?? 0) + kg;
      row.spending += (paid * entry.kg) / needKg;
      entry.kg -= kg;
    }
    needKg = short.reduce((sum, entry) => sum + entry.kg, 0);
    recordCountrysideFlow(market.i, market.centerBurgId ?? 0, good.i, units, "outbound");
    recordGoodFlow({ direction: "sink", category: "livestockFeed", goodId: good.i, units, marketId: market.i });
  }
  return spent;
}

/**
 * The farms' own grain first, as manor stock ate grain in the sheaf in winter (Morden): only what each cell holds
 * above a year's food for all its rural people (RURAL_HOUSEHOLD_FOOD_RESERVE_YEARS), so no family goes short.
 */
function feedOwnGrain(
  table: Record<number, LivestockFeedLedger>,
  short: { cell: number; kg: number }[],
  hayKgPerUnit: number
): void {
  const stock = getRuralHouseholdFoodStock();
  const cells = getWorldContext().pack.cells;
  const rate = Math.max(1, getWorldContext().populationRate || 1);
  let changed = false;
  for (const entry of short) {
    if (!(entry.kg > 0) || entry.cell >= stock.length) continue;
    const reserve =
      Math.max(0, cells.pop?.[entry.cell] ?? 0) * rate * GROSS_FOOD_NEED * RURAL_HOUSEHOLD_FOOD_RESERVE_YEARS;
    const units = Math.min(Math.max(0, stock[entry.cell] - reserve), entry.kg / hayKgPerUnit);
    if (!(units > 0)) continue;
    stock[entry.cell] -= units;
    changed = true;
    const row = table[entry.cell];
    row.grainFeedKg = (row.grainFeedKg ?? 0) + units * hayKgPerUnit;
    row.ownGrainFeedKg = (row.ownGrainFeedKg ?? 0) + units * hayKgPerUnit;
    entry.kg -= units * hayKgPerUnit;
  }
  if (changed) setRuralHouseholdFoodStock(stock);
}

/**
 * Stock short of feed lose condition and eat it back on grass left uncut or ungrazed
 * (docs/plan/livestock-lean-condition.md): the deficit grows by the month's unmet feed and falls by the spare grass
 * eaten, at most `leanRefeedShare` of a month's need. Animals sold or dead since the last month take their part
 * of it with them. Beyond the body reserve the weakest die (`leanDeaths`): the overflow over the reserve is the
 * share of the herd lost, returned for the caller to remove. Where the reserve is spent beyond
 * `leanCullThreshold`, keepers sell next month the mouths they could not feed this month (`leanCull`).
 */
export function settleLeanCondition(row: LivestockFeedLedger, monthlyNeedKg: number): number {
  const { leanCondition, leanReserveMonths, leanRefeedShare, leanCull, leanCullThreshold, leanDeaths } =
    getMarketSettings();
  row.refedKg = 0;
  row.leanCullShare = 0;
  row.leanDeathShare = 0;
  if (leanCondition === "off" || !(monthlyNeedKg > 0)) {
    row.leanDeficitKg = 0;
    row.leanNeedKg = monthlyNeedKg;
    return 0;
  }
  const herdKept = row.leanNeedKg && row.leanNeedKg > 0 ? Math.min(1, monthlyNeedKg / row.leanNeedKg) : 1;
  const reserve = leanReserveMonths * monthlyNeedKg;
  const owed = (row.leanDeficitKg ?? 0) * herdKept + row.unmetKg;
  const dead = leanDeaths === "die" ? Math.min(1, Math.max(0, owed - reserve) / reserve) : 0;
  const deficit = Math.min(reserve, owed) * (1 - dead);
  const refed = Math.max(0, Math.min(deficit, row.unharvestedKg, leanRefeedShare * monthlyNeedKg));
  row.unharvestedKg -= refed;
  row.refedKg = refed;
  row.leanDeficitKg = deficit - refed;
  row.leanNeedKg = monthlyNeedKg * (1 - dead);
  row.leanDeathShare = dead;
  if (leanCull === "unfed" && row.requiredKg > 0 && row.leanDeficitKg >= leanCullThreshold * reserve)
    row.leanCullShare = Math.min(1, row.unmetKg / row.requiredKg);
  return dead;
}

/** Removes a share of every grazing herd in the cell, the animals that died of hunger. */
function removeStarvedStock(cell: number, share: number): void {
  const table = getOrCreateFaunaStockTable();
  if (!table || !(share > 0)) return;
  for (const name of Object.keys(ANNUAL_FEED_DM_KG_PER_HEAD)) {
    const herd = table[`${cell}:${name}`];
    if (!herd) continue;
    herd.young *= 1 - share;
    herd.breeding *= 1 - share;
    herd.old *= 1 - share;
  }
}

/** Price of a kg of hay dry matter in this market, as hay and as the cheapest fodder grain; Infinity where none. */
function feedPricesPerKg(market: Market): { hay: number; grain: number } {
  const fodder = getGoods().find(good => good.name === "Fodder" && isGoodEnabled(good));
  const hayPrice = fodder ? market.goods[fodder.i]?.price : undefined;
  const grainPrices = FODDER_GRAINS.map(name => getGoods().find(good => good.name === name && isGoodEnabled(good)))
    .map(good => (good ? market.goods[good.i]?.price : undefined))
    .filter((price): price is number => price !== undefined && price > 0);
  return {
    hay: hayPrice !== undefined && hayPrice > 0 ? hayPrice / FODDER_DM_KG_PER_LOT : Infinity,
    grain: grainPrices.length
      ? Math.min(...grainPrices) / (WAIN_KG * GRAIN_DRY_MATTER_SHARE * GRAIN_FEED_HAY_EQUIVALENT)
      : Infinity
  };
}

const goodPrice = (market: Market, name: string): number => {
  const good = getGoods().find(row => row.name === name && isGoodEnabled(row));
  return good ? Math.max(0, market.goods[good.i]?.price ?? good.value) : 0;
};

/**
 * What a kg of feed the cell goes without costs its keepers, at this market's prices (docs/plan/livestock-feed-shortfall.md
 * §10.2): the carcass weight it takes off at slaughter, this month's milk and wool it withholds, and the milk lost
 * while the stock stay lean, about half the months refeeding takes.
 */
export function getUnfedValuePerKg(market: Market, cell: number, requiredKg: number): number {
  const { leanMaxCarcassLoss, leanReserveMonths, leanMilkLoss, leanRefeedShare } = getMarketSettings();
  const need = getLivestockMonthlyFeedNeedKg(cell);
  if (!(need > 0) || !(requiredKg > 0)) return 0;
  const herds = getOrCreateFaunaStockTable();
  let carcassKg = 0;
  for (const [name, offtake] of Object.entries(HERD_MEAT_OFFTAKE)) {
    const herd = herds?.[`${cell}:${name}`];
    if (herd)
      carcassKg += (Math.max(0, herd.young) + Math.max(0, herd.breeding) + Math.max(0, herd.old)) * offtake.edibleKg;
  }
  const reserveKg = leanReserveMonths * need;
  const meat = (leanMaxCarcassLoss * carcassKg * goodPrice(market, "Meat")) / WAIN_KG / reserveKg;
  const milkMonth = getMilkOutput(cell) * goodPrice(market, "Milk");
  const lingerMonths = leanRefeedShare > 0 ? 0.5 / leanRefeedShare : 0;
  const milk = milkMonth / requiredKg + (leanMilkLoss * milkMonth * lingerMonths) / reserveKg;
  const wool = (getWoolOutput(cell) * goodPrice(market, "Wool")) / requiredKg;
  return meat + milk + wool;
}

/**
 * Feed bought beyond the month's feed purse (docs/plan/livestock-feed-shortfall.md §10), up to `feedCrisisCashShare`
 * of the farms' cash, the cheaper feed first. `nearCull`: only for cells whose deficit with this month's remaining
 * shortage reaches the selling threshold. `worth`: also for any cell whose unfed feed costs it more in meat, milk
 * and wool than the feed costs, each feed bought only for the cells it is worth to.
 */
function feedBeyondPurse(market: Market, cells: number[], table: Record<number, LivestockFeedLedger>): void {
  const { feedCrisisBudget, feedCrisisCashShare, leanCondition, leanCull, leanCullThreshold, leanReserveMonths } =
    getMarketSettings();
  if (feedCrisisBudget === "off" || leanCondition === "off") return;
  const remaining = (cell: number) =>
    Math.max(
      0,
      table[cell].requiredKg -
        table[cell].pastureConsumedKg -
        (table[cell].cropResidueFeedKg ?? 0) -
        (table[cell].grainFeedKg ?? 0) -
        table[cell].hayKg
    );
  const prices = feedPricesPerKg(market);
  const short = cells
    .map(cell => {
      const kg = remaining(cell);
      const near =
        leanCull !== "off" &&
        (table[cell].leanDeficitKg ?? 0) + kg >=
          leanCullThreshold * leanReserveMonths * getLivestockMonthlyFeedNeedKg(cell);
      const value =
        feedCrisisBudget === "worth" && kg > 0 ? getUnfedValuePerKg(market, cell, table[cell].requiredKg) : 0;
      return { cell, kg, near, value };
    })
    .filter(entry => entry.kg > 0);
  if (!short.length) return;
  const wanted = (price: number) =>
    short
      .filter(entry => entry.near || entry.value > price)
      .map(entry => ({ cell: entry.cell, kg: remaining(entry.cell) }))
      .filter(entry => entry.kg > 0);
  let budget = Math.floor(getRuralHouseholdWealth(market) * feedCrisisCashShare * 100) / 100;
  const hayFirst = prices.hay < prices.grain;
  for (const feed of hayFirst ? (["hay", "grain"] as const) : (["grain", "hay"] as const)) {
    const entries = wanted(prices[feed]);
    if (!entries.length || !(budget > 0)) continue;
    budget = Math.max(
      0,
      budget - (feed === "hay" ? buyFeed(market, entries, budget) : feedGrain(market, entries, budget))
    );
  }
}

/** Runs after trade; existing army procurement has already removed its share of the same stock. */
export function settleLivestockFeed(): void {
  const table = getOrCreateLivestockFeedTable();
  if (!table) return;
  const period = livestockFeedPeriod();
  const marketCells = getMarketCellColumn();
  const groups = new Map<number, number[]>();
  const active: number[] = [];
  const residues = getCropResidueState();
  for (const cell of getWorldContext().pack.cells?.i ?? []) {
    const row = table[cell];
    if (!row || row.harvestPeriod !== period || (row.feedPeriod !== undefined && row.feedPeriod >= period)) continue;
    row.requiredKg = getLivestockMonthlyFeedNeedKg(cell);
    row.pastureConsumedKg = Math.min(row.requiredKg, row.grazingReservedKg);
    row.hayConsumedKg = 0;
    const residue = residues?.cells[cell];
    row.grainFeedKg = 0;
    row.ownGrainFeedKg = 0;
    row.cropResidueFeedKg = residue
      ? consumeCropResidues(
          residue,
          period,
          row.requiredKg,
          Math.max(0, row.requiredKg - row.pastureConsumedKg - row.hayKg)
        )
      : 0;
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
      kg: Math.max(
        0,
        table[cell].requiredKg -
          table[cell].pastureConsumedKg -
          (table[cell].cropResidueFeedKg ?? 0) -
          table[cell].hayKg
      )
    }));
    budget = Math.max(0, budget - buyFeed(market, shortage, budget));
    budget = Math.max(0, budget - feedGrain(market, shortage, budget));
    feedBeyondPurse(market, cells, table);
    const reserves = cells.map(cell => ({
      cell,
      kg: Math.max(
        0,
        table[cell].requiredKg +
          reserveAfterFeedingKg(cell) -
          table[cell].pastureConsumedKg -
          (table[cell].cropResidueFeedKg ?? 0) -
          table[cell].hayKg
      )
    }));
    buyFeed(market, reserves, budget);
  }
  for (const cell of active) {
    const row = table[cell];
    row.hayConsumedKg = Math.min(
      Math.max(0, row.requiredKg - row.pastureConsumedKg - (row.cropResidueFeedKg ?? 0) - (row.grainFeedKg ?? 0)),
      row.hayKg
    );
    row.hayKg = Math.max(0, row.hayKg - row.hayConsumedKg);
    row.unmetKg = Math.max(
      0,
      row.requiredKg - row.pastureConsumedKg - row.hayConsumedKg - (row.cropResidueFeedKg ?? 0) - (row.grainFeedKg ?? 0)
    );
    row.coverage = row.requiredKg > 0 ? Math.max(0, Math.min(1, 1 - row.unmetKg / row.requiredKg)) : 1;
    removeStarvedStock(cell, settleLeanCondition(row, getLivestockMonthlyFeedNeedKg(cell)));
    row.feedPeriod = period;
    row.samples = row.samples.filter(sample => sample.period > period - 12 && sample.period !== period);
    row.samples.push({
      period,
      requiredKg: row.requiredKg,
      fedKg: row.pastureConsumedKg + row.hayConsumedKg + (row.cropResidueFeedKg ?? 0) + (row.grainFeedKg ?? 0),
      cropResidueFeedKg: row.cropResidueFeedKg,
      grainFeedKg: row.grainFeedKg,
      purchasedKg: row.purchasedKg,
      soldKg: row.soldKg,
      harvestLossKg: row.harvestLossKg,
      storageLossKg: row.storageLossKg
    });
  }
}

/**
 * Hay the farms of a market still lack for this month and their winter reserve plans, whatever they
 * can pay this month. Hay is cut once a year and bought over the months after, so this, not one
 * month's orders, is what the market's stock is priced and traded against.
 */
export function getLivestockFodderNeedLots(market: Market): number {
  const table = getOrCreateLivestockFeedTable();
  if (!table || !market.foodLedger) return 0;
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
  return need / FODDER_DM_KG_PER_LOT;
}

/** This month's farm orders: their need, within the cash they spend on feed in a month. */
export function getLivestockFodderOrderLots(market: Market): number {
  const fodder = getGoods().find(good => good.name === "Fodder" && isGoodEnabled(good));
  const price = fodder ? (market.goods[fodder.i]?.price ?? fodder.value) : 0;
  if (!(price > 0) || !Number.isFinite(price)) return 0;
  return Math.min(
    getLivestockFodderNeedLots(market),
    (getRuralHouseholdWealth(market) * LIVESTOCK_FEED_CASH_SHARE) / price
  );
}
