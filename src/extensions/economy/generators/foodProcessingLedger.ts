import { getHouseholdHoneyKilograms } from "../../../simulation/householdHoneySettings";
import { getMarketSettings } from "../../../simulation/marketSettings";
import { getTreelessTownAleWoodland } from "../../../simulation/townAleSettings";
import { getTownMeadLiters } from "../../../simulation/townMeadSettings";
import { rn } from "../../hostUtils";
import {
  getGoods,
  getMarkets,
  getUrbanWaterSystems,
  getWorldContext,
  recordCumulativeCellFoodProcessing
} from "../economyContext";
import {
  getAleDemandMultiplier,
  getAleSanitationFallbackRisk,
  getAleWaterRisk,
  getTownAleLitersPerAdultYear
} from "./aleDemand";
import { debitHouseholdWealth } from "./burgMarketLedgers";
import { releaseConsignedUnpaid } from "./craftConsignment";
import {
  ALE_TARGETS,
  DAIRY_TARGETS,
  GRAPE_TARGETS,
  isOrchardDrink,
  isReturnedCaskDrink,
  KILOGRAMS_PER_CHEESE_LOT,
  KILOGRAMS_PER_GRAPES_LOT,
  KILOGRAMS_PER_ORCHARD_FRUIT_LOT,
  KILOGRAMS_PER_RAISINS_LOT,
  LITERS_PER_BEER_LOT,
  LITERS_PER_MEAD_LOT,
  LITERS_PER_MILK_LOT,
  LITERS_PER_ORCHARD_DRINK_LOT,
  LITERS_PER_WINE_LOT,
  MEAD_TARGETS,
  MILK_LOTS_PER_CHEESE_LOT,
  ORCHARD_TARGETS,
  WINE_TARGETS
} from "./foodLots";
import { GOOD_MEASURES } from "./goodMeasureCatalog";
import { isFreshFoodGood } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import {
  debitRuralHouseholdWealth,
  getRuralHouseholdWealth,
  getUrbanHouseholdSpendable,
  RURAL_HOUSEHOLD_TOWN_SPEND_SHARE
} from "./householdWealth";
import { getMarketRuralPopulation, getMarketWoodlandShares } from "./marketPopulation";
import type { FoodProcessingGoodLedger, Market, ReturnableContainerLedger } from "./marketTypes";

const TRACKED_GOODS = new Set([
  "Milk",
  "Cheese",
  "Grapes",
  "Raisins",
  "Wine",
  "Beer",
  "Apples",
  "Pears",
  "Cider",
  "Perry",
  "Honey",
  "Mead"
]);
const BEER_RESERVE_MONTHS = 1;

export type AleDemandSnapshot = {
  baselineDemand: number;
  waterSafetyDemand: number;
  monthlyDemand: number;
  drinkingWaterRisk: number;
};

const aleDemandByMarket = new Map<number, AleDemandSnapshot>();

/** Cheese can hold for a year, unlike the same-month Milk/Grapes retail pools. */
export const CHEESE_RESERVE_MONTHS = 12;
/**
 * A bounded share of locally surplus Milk is worth preserving as Cheese. The stock ceiling below
 * prevents this from inventing an unlimited export sink when a dairy market has no buyers.
 */
export const CHEESE_SURPLUS_MILK_CONVERSION_SHARE = 0.25;

function emptyGoodLedger(): FoodProcessingGoodLedger {
  return {
    marketIntake: 0,
    householdConsumption: 0,
    localHouseholdConsumptionThisCycle: 0,
    processingConsumption: 0,
    spoilage: 0,
    deliveredExport: 0,
    unmetDemand: 0
  };
}

function getGoodLedger(market: Market, goodName: string): FoodProcessingGoodLedger | null {
  if (!TRACKED_GOODS.has(goodName)) return null;
  if (!market.foodProcessingLedger) market.foodProcessingLedger = {};
  const ledger = market.foodProcessingLedger[goodName as keyof NonNullable<typeof market.foodProcessingLedger>];
  if (ledger) return ledger;
  const next = emptyGoodLedger();
  market.foodProcessingLedger[goodName as keyof NonNullable<typeof market.foodProcessingLedger>] = next;
  return next;
}

export function recordFoodMarketIntake(market: Market, goodName: string, units: number): void {
  const ledger = getGoodLedger(market, goodName);
  if (ledger && units > 0) ledger.marketIntake += units;
}

/** Records cargo that physically arrived from another market; it is also market intake, not a sale. */
export function recordFoodDeliveredExport(market: Market, goodName: string, units: number): void {
  const ledger = getGoodLedger(market, goodName);
  if (!ledger || units <= 0) return;
  ledger.deliveredExport += units;
  ledger.marketIntake += units;
}

/** Called by the manufacturing path after recipe ingredients have actually been acquired. */
export function recordFoodProcessingConsumption(market: Market, goodName: string, units: number): void {
  const ledger = getGoodLedger(market, goodName);
  if (!Number.isFinite(units) || units <= 0) return;
  if (ledger) ledger.processingConsumption += units;
  const good = getGoods().find(candidate => candidate.name === goodName);
  // Source-cell preservation also handles Fish/Game/Shellfish outside the retail ledger.
  // Keep their raw inputs visible without creating a new retail demand or duplicating tracked inputs.
  if (good && (ledger || isFreshFoodGood(good))) recordCumulativeCellFoodProcessing(good.i, units);
}

/**
 * Fresh food is now consumed at its source cell before it can enter a Market. Keep that physical
 * household use visible in the existing market-level diagnostics without putting raw stock into
 * the market pool.
 */
export function recordCellFoodHouseholdConsumption(market: Market, goodName: string, units: number): void {
  const ledger = getGoodLedger(market, goodName);
  if (!ledger || units <= 0) return;
  ledger.householdConsumption += units;
  ledger.localHouseholdConsumptionThisCycle = (ledger.localHouseholdConsumptionThisCycle ?? 0) + units;
}

export function recordWineCaskFilling(market: Market, wineLots: number, replacementCasks: number): void {
  if (wineLots <= 0) return;
  const containers = market.returnableContainerLedger ?? {
    wineCasksInService: 0,
    cumulativeWineCaskReturns: 0,
    cumulativeWineCaskReplacement: 0,
    beerCasksInService: 0,
    cumulativeBeerCaskReturns: 0,
    cumulativeBeerCaskReplacement: 0
  };
  // Saved maps created before Beer joined this ledger have only the wine fields.
  containers.beerCasksInService ??= 0;
  containers.cumulativeBeerCaskReturns ??= 0;
  containers.cumulativeBeerCaskReplacement ??= 0;
  containers.wineCasksInService += wineLots;
  containers.cumulativeWineCaskReplacement += Math.max(0, replacementCasks);
  market.returnableContainerLedger = containers;
}

export function recordBeerCaskFilling(market: Market, beerLots: number, replacementCasks: number): void {
  if (beerLots <= 0) return;
  const containers = market.returnableContainerLedger ?? {
    wineCasksInService: 0,
    cumulativeWineCaskReturns: 0,
    cumulativeWineCaskReplacement: 0,
    beerCasksInService: 0,
    cumulativeBeerCaskReturns: 0,
    cumulativeBeerCaskReplacement: 0
  };
  // Saves created before this contract lack Beer fields, while a Beer-only market may lack Wine fields.
  containers.wineCasksInService ??= 0;
  containers.cumulativeWineCaskReturns ??= 0;
  containers.cumulativeWineCaskReplacement ??= 0;
  containers.beerCasksInService ??= 0;
  containers.cumulativeBeerCaskReturns ??= 0;
  containers.cumulativeBeerCaskReplacement ??= 0;
  containers.beerCasksInService += beerLots;
  containers.cumulativeBeerCaskReplacement += Math.max(0, replacementCasks);
  market.returnableContainerLedger = containers;
}

export function recordOrchardCaskFilling(
  market: Market,
  name: keyof NonNullable<ReturnableContainerLedger["orchardCasks"]>,
  lots: number,
  replacements: number
): void {
  if (!(lots > 0)) return;
  // Initialize the shared legacy-compatible ledger without recording a fictitious Beer lot.
  if (!market.returnableContainerLedger) {
    market.returnableContainerLedger = {
      wineCasksInService: 0,
      cumulativeWineCaskReturns: 0,
      cumulativeWineCaskReplacement: 0,
      beerCasksInService: 0,
      cumulativeBeerCaskReturns: 0,
      cumulativeBeerCaskReplacement: 0
    };
  }
  market.returnableContainerLedger.orchardCasks ??= {};
  const orchard = market.returnableContainerLedger.orchardCasks;
  orchard[name] ??= { inService: 0, returns: 0, replacement: 0 };
  const row = orchard[name];
  row.inService += lots;
  row.replacement += Math.max(0, replacements);
}

function getMarketPeople(market: Market): number {
  const world = getWorldContext();
  const urban = world.pack.burgs.reduce((total, burg) => {
    if (!burg.i || burg.removed || burg.market !== market.i) return total;
    return total + (burg.population ?? 0) * Math.max(1, world.populationRate || 1) * (world.urbanization ?? 1);
  }, 0);
  return urban + getMarketRuralPopulation(world, market.i);
}

function getBurgPeople(population: number | undefined): number {
  const world = getWorldContext();
  return (population ?? 0) * Math.max(1, world.populationRate || 1) * (world.urbanization ?? 1);
}

/**
 * The market's ale is the towns' alone. Country households brewed their own from their own grain
 * (Bennett 1996), within the food they already eat, so they buy no ale, no casks and no malt
 * (urban-craft-staffing.md §10.10, §10.11).
 */
function calculateAleDemand(
  market: Market,
  woodlandShare = getMarketWoodlandShares(getWorldContext()).get(market.i) ?? 0
): AleDemandSnapshot {
  const world = getWorldContext();
  const systemsByBurgId = new Map(getUrbanWaterSystems().map(system => [system.burgId, system]));
  let urbanPeople = 0;
  let baselineDemand = 0;
  let waterSafetyDemand = 0;
  let riskWeightedPeople = 0;
  // A market that takes in grapes is wine country, and its towns drink wine (WINE_TARGETS).
  const wineCountry = (getGoodLedger(market, "Grapes")?.marketIntake ?? 0) > 0;
  const urbanLiters = getTownAleLitersPerAdultYear(wineCountry, woodlandShare, getTreelessTownAleWoodland(), {
    baseline: ALE_TARGETS.baselineLitersPerAdultYear,
    urban: ALE_TARGETS.urbanLitersPerAdultYear
  });

  for (const burg of world.pack.burgs) {
    if (!burg.i || burg.removed || burg.market !== market.i) continue;
    const people = getBurgPeople(burg.population);
    if (people <= 0) continue;
    const burgBaseline = (people * ALE_TARGETS.adultShare * urbanLiters) / 12 / LITERS_PER_BEER_LOT;
    const system = systemsByBurgId.get(burg.i);
    const waterRisk = system ? getAleWaterRisk(system) : getAleSanitationFallbackRisk(burg.sanitation);
    urbanPeople += people;
    baselineDemand += burgBaseline;
    waterSafetyDemand += burgBaseline * (getAleDemandMultiplier(waterRisk) - 1);
    riskWeightedPeople += people * waterRisk;
  }

  return {
    baselineDemand,
    waterSafetyDemand,
    monthlyDemand: baselineDemand + waterSafetyDemand,
    drinkingWaterRisk: urbanPeople > 0 ? riskWeightedPeople / urbanPeople : 0
  };
}

/** Rebuilt once before the Burg production loop, avoiding repeated water-system scans per recipe candidate. */
export function refreshAleHouseholdDemand(): void {
  aleDemandByMarket.clear();
  const woodland = getMarketWoodlandShares(getWorldContext());
  for (const market of getMarkets())
    aleDemandByMarket.set(market.i, calculateAleDemand(market, woodland.get(market.i) ?? 0));
}

export function getAleDemandSnapshot(market: Market): AleDemandSnapshot {
  return aleDemandByMarket.get(market.i) ?? calculateAleDemand(market);
}

/**
 * The towns' mead: their adults' litres a year, brewed from the market's honey. Country people made
 * theirs at home within the household honey, and the wine country drinks wine (docs/plan/mead.md §3).
 */
function getTownMeadDemand(market: Market): number {
  if ((getGoodLedger(market, "Grapes")?.marketIntake ?? 0) > 0) return 0;
  const liters = getTownMeadLiters();
  if (!(liters > 0)) return 0;
  let people = 0;
  for (const burg of getWorldContext().pack.burgs) {
    if (burg.i && !burg.removed && burg.market === market.i) people += getBurgPeople(burg.population);
  }
  return (people * MEAD_TARGETS.adultShare * liters) / 12 / LITERS_PER_MEAD_LOT;
}

export function getMonthlyHouseholdDemand(market: Market, goodName: string): number {
  const people = getMarketPeople(market);
  switch (goodName) {
    case "Apples":
      return (people * ORCHARD_TARGETS.freshAppleKilogramsPerPersonYear) / 12 / KILOGRAMS_PER_ORCHARD_FRUIT_LOT;
    case "Pears":
      return (people * ORCHARD_TARGETS.freshPearKilogramsPerPersonYear) / 12 / KILOGRAMS_PER_ORCHARD_FRUIT_LOT;
    case "Cider":
    case "Perry":
      return (
        (people *
          ORCHARD_TARGETS.adultShare *
          (goodName === "Cider" ? ORCHARD_TARGETS.ciderLitersPerAdultYear : ORCHARD_TARGETS.perryLitersPerAdultYear)) /
        12 /
        LITERS_PER_ORCHARD_DRINK_LOT
      );
    case "Milk":
      return (people * DAIRY_TARGETS.freshMilkLitersPerPersonYear) / 12 / LITERS_PER_MILK_LOT;
    case "Cheese":
      return (people * DAIRY_TARGETS.cheeseKilogramsPerPersonYear) / 12 / KILOGRAMS_PER_CHEESE_LOT;
    case "Grapes":
      return (people * GRAPE_TARGETS.freshKilogramsPerPersonYear) / 12 / KILOGRAMS_PER_GRAPES_LOT;
    case "Raisins":
      return (people * GRAPE_TARGETS.raisinsKilogramsPerPersonYear) / 12 / KILOGRAMS_PER_RAISINS_LOT;
    case "Wine": {
      const grapesLedger = getGoodLedger(market, "Grapes");
      const wineLiters =
        grapesLedger && grapesLedger.marketIntake > 0
          ? WINE_TARGETS.regionalLitersPerAdultYear
          : WINE_TARGETS.importedLitersPerAdultYear;
      return (people * WINE_TARGETS.adultShare * wineLiters) / 12 / LITERS_PER_WINE_LOT;
    }
    case "Beer":
      return getAleDemandSnapshot(market).monthlyDemand;
    case "Honey":
      return (people * getHouseholdHoneyKilograms()) / 12 / GOOD_MEASURES.Honey.kg;
    case "Mead":
      return getTownMeadDemand(market);
    default:
      return 0;
  }
}

/**
 * Units of `container` (Barrels) the market's household drinks wear out in a month: each drink's
 * monthly demand, ale with its water-safety share, times the container its recipes take per unit.
 * A per-head floor counted only the towns' ordinary ale (urban-craft-staffing.md §12 item 20).
 */
export function getMonthlyHouseholdContainerDemand(market: Market, container: { i: number }): number {
  let units = 0;
  for (const good of getGoods()) {
    const amounts = (good.recipes ?? []).map(recipe => recipe[container.i] ?? 0).filter(amount => amount > 0);
    if (!amounts.length) continue;
    const demand = getMonthlyHouseholdDemand(market, good.name);
    if (demand > 0) units += (demand * amounts.reduce((sum, amount) => sum + amount, 0)) / amounts.length;
  }
  return units;
}

/**
 * Processing must not create an unbounded stockpile merely because a recipe is profitable.
 * Raisins and Wine are held to three months of demand. Beer is a short-turnover daily beverage
 * held to one month. Cheese is a cheap, durable protein: a
 * one-year reserve may absorb a bounded share of local Milk that would otherwise spoil.
 */
export function getFoodProcessingProductionHeadroom(
  market: Market,
  goodName: string,
  privateInventory: number
): number {
  if (
    goodName !== "Beer" &&
    goodName !== "Cheese" &&
    goodName !== "Raisins" &&
    goodName !== "Wine" &&
    !isReturnedCaskDrink(goodName)
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const good = getGoods().find(candidate => candidate.name === goodName);
  if (!good) return 0;
  const marketStock = Math.max(0, market.goods[good.i]?.stock ?? 0);
  const heldStock = marketStock + Math.max(0, privateInventory);
  const reserveMonths = isOrchardDrink(goodName)
    ? ORCHARD_TARGETS.reserveMonths
    : goodName === "Mead"
      ? MEAD_TARGETS.reserveMonths
      : goodName === "Beer"
        ? BEER_RESERVE_MONTHS
        : 3;
  const householdHeadroom = Math.max(0, getMonthlyHouseholdDemand(market, goodName) * reserveMonths - heldStock);
  if (goodName !== "Cheese") return householdHeadroom;

  const milk = getGoods().find(candidate => candidate.name === "Milk");
  const milkStock = milk ? Math.max(0, market.goods[milk.i]?.stock ?? 0) : 0;
  const milkHouseholdDemand = getMonthlyHouseholdDemand(market, "Milk");
  const surplusMilk = Math.max(0, milkStock - milkHouseholdDemand);
  const surplusCheeseHeadroom = (surplusMilk * CHEESE_SURPLUS_MILK_CONVERSION_SHARE) / MILK_LOTS_PER_CHEESE_LOT;
  const reserveHeadroom = Math.max(0, getMonthlyHouseholdDemand(market, "Cheese") * CHEESE_RESERVE_MONTHS - heldStock);

  return Math.max(householdHeadroom, Math.min(surplusCheeseHeadroom, reserveHeadroom));
}

/**
 * What a market's households may spend this month on the drinks and foods they take from its stock:
 * each town its cash above the buffer it keeps for food and rent, and the countryside the share of
 * its purse it spends in town each month. Bread comes first; these never eat into it
 * (docs/plan/market-goods-settlement.md §2.1).
 */
type HouseholdGoodsPurses = {
  towns: { id: number; people: number; spendable: number }[];
  rural: number;
  ruralPeople: number;
};

function getHouseholdGoodsPurses(market: Market): HouseholdGoodsPurses {
  const world = getWorldContext();
  const towns = world.pack.burgs
    .filter(burg => burg.i && !burg.removed && burg.market === market.i)
    .map(burg => ({
      id: burg.i!,
      people: getBurgPeople(burg.population),
      spendable: getUrbanHouseholdSpendable(burg)
    }));
  return {
    towns,
    rural: getRuralHouseholdWealth(market) * RURAL_HOUSEHOLD_TOWN_SPEND_SHARE,
    ruralPeople: getMarketRuralPopulation(world, market.i)
  };
}

/**
 * The market's people pay for `units` at `price`, each by their share of the buyers: the towns by
 * their people and, unless only the towns buy (ale, mead), the countryside by its people, each as far as
 * its purse for these goods holds. The cash goes into the market treasury; returns the units they
 * paid for.
 */
function payForHouseholdGoods(
  market: Market,
  purses: HouseholdGoodsPurses,
  units: number,
  price: number,
  townsOnly: boolean
): number {
  if (!(units > 0) || !(price > 0)) return units;
  const rural = townsOnly ? 0 : purses.ruralPeople;
  const people = purses.towns.reduce((total, town) => total + town.people, rural);
  if (!(people > 0)) return 0;
  const bill = units * price;
  let paid = 0;
  let short = false;
  const charge = (amount: number, budget: number, debit: (amount: number) => number): number => {
    const got = debit(rn(Math.min(amount, Math.max(0, budget)), 2));
    paid += got;
    if (got + 1e-9 < amount) short = true;
    return got;
  };
  for (const town of purses.towns) {
    if (!(town.people > 0)) continue;
    town.spendable -= charge(rn((bill * town.people) / people, 2), town.spendable, amount =>
      debitHouseholdWealth(town.id, amount)
    );
  }
  if (rural > 0)
    purses.rural -= charge(rn((bill * rural) / people, 2), purses.rural, amount =>
      debitRuralHouseholdWealth(market, amount)
    );
  if (paid > 0) {
    market.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
    market.marketTreasury.balance = rn(market.marketTreasury.balance + paid, 2);
  }
  // Every purse paid its share (to the cent): they take it all.
  return short ? Math.min(units, paid / price) : units;
}

function drawHouseholdDemand(
  market: Market,
  goodName: string,
  demand: number,
  purses: HouseholdGoodsPurses | null
): void {
  const good = getGoods().find(candidate => candidate.name === goodName);
  const ledger = getGoodLedger(market, goodName);
  if (!good || !ledger || demand <= 0) return;
  const marketGood = market.goods[good.i];
  // Source-cell household use has already been recorded before the production cycle reaches this
  // market-level settlement. Only the remaining demand may draw from Market stock.
  const remainingDemand = Math.max(0, demand - (ledger.localHouseholdConsumptionThisCycle ?? 0));
  const available = Math.max(0, marketGood?.stock ?? 0);
  let consumed = Math.min(available, remainingDemand);
  // Households pay the market for what they take, and take only what they can pay for.
  if (consumed > 0 && purses)
    consumed = payForHouseholdGoods(
      market,
      purses,
      consumed,
      marketGood?.price ?? 0,
      goodName === "Beer" || goodName === "Mead"
    );
  // Taken without payment, the towns' consigned goods bring in nothing to pay them with.
  else if (consumed > 0) releaseConsignedUnpaid(market, good.i, consumed);
  if (marketGood) marketGood.stock = Math.max(0, marketGood.stock - consumed);
  if (consumed > 0) {
    recordGoodFlow({
      direction: "sink",
      category: "householdFood",
      goodId: good.i,
      units: consumed,
      marketId: market.i
    });
  }
  ledger.householdConsumption += consumed;
  ledger.unmetDemand += Math.max(0, remainingDemand - consumed);
  if (isReturnedCaskDrink(goodName) && consumed > 0) {
    const row = market.returnableContainerLedger?.orchardCasks?.[goodName];
    if (row) {
      const returned = Math.min(row.inService, consumed);
      row.inService -= returned;
      row.returns += returned;
    }
  }
  if (goodName === "Wine" && consumed > 0 && market.returnableContainerLedger) {
    const containers = market.returnableContainerLedger;
    const returned = Math.min(containers.wineCasksInService, consumed);
    containers.wineCasksInService -= returned;
    containers.cumulativeWineCaskReturns += returned;
  }
  if (goodName === "Beer" && consumed > 0 && market.returnableContainerLedger) {
    const containers = market.returnableContainerLedger;
    const returned = Math.min(containers.beerCasksInService ?? 0, consumed);
    containers.beerCasksInService = (containers.beerCasksInService ?? 0) - returned;
    containers.cumulativeBeerCaskReturns = (containers.cumulativeBeerCaskReturns ?? 0) + returned;
  }
}

/**
 * Settles food households after all local processing has claimed its inputs. Milk and Grapes have
 * no cold-chain: stock remaining after same-month household purchases is recorded as spoilage and
 * removed. Cheese, Raisins, and Wine remain market stock for later months.
 */
export function settleFoodProcessingHouseholds(): void {
  const pay = getMarketSettings().householdGoodsPayment === "pay";
  for (const market of getMarkets()) {
    const purses = pay ? getHouseholdGoodsPurses(market) : null;
    drawHouseholdDemand(market, "Milk", getMonthlyHouseholdDemand(market, "Milk"), purses);
    drawHouseholdDemand(market, "Cheese", getMonthlyHouseholdDemand(market, "Cheese"), purses);
    drawHouseholdDemand(market, "Grapes", getMonthlyHouseholdDemand(market, "Grapes"), purses);
    drawHouseholdDemand(market, "Raisins", getMonthlyHouseholdDemand(market, "Raisins"), purses);
    drawHouseholdDemand(market, "Wine", getMonthlyHouseholdDemand(market, "Wine"), purses);
    drawHouseholdDemand(market, "Honey", getMonthlyHouseholdDemand(market, "Honey"), purses);
    for (const name of ["Apples", "Pears", "Cider", "Perry", "Mead"] as const)
      drawHouseholdDemand(market, name, getMonthlyHouseholdDemand(market, name), purses);
    const aleDemand = getAleDemandSnapshot(market);
    const beerLedger = getGoodLedger(market, "Beer");
    if (beerLedger) {
      beerLedger.baselineHouseholdDemand = aleDemand.baselineDemand;
      beerLedger.waterSafetyDemand = aleDemand.waterSafetyDemand;
      beerLedger.drinkingWaterRisk = aleDemand.drinkingWaterRisk;
    }
    drawHouseholdDemand(market, "Beer", aleDemand.monthlyDemand, purses);

    for (const name of ["Milk", "Grapes"] as const) {
      const good = getGoods().find(candidate => candidate.name === name);
      const ledger = getGoodLedger(market, name);
      if (!good || !ledger) continue;
      const remaining = Math.max(0, market.goods[good.i]?.stock ?? 0);
      if (remaining <= 0) continue;
      market.goods[good.i].stock = 0;
      ledger.spoilage += remaining;
      recordGoodFlow({ direction: "sink", category: "spoilage", goodId: good.i, units: remaining, marketId: market.i });
    }

    // Raw fish/meat/shellfish shares the no-cold-chain lifecycle even though these goods do not
    // have the specialised Milk/Grapes household ledger. Preserve this tag-driven path so future
    // fresh goods cannot silently become permanent market stock.
    for (const good of getGoods()) {
      if (!isFreshFoodGood(good) || good.name === "Milk" || good.name === "Grapes") continue;
      const remaining = Math.max(0, market.goods[good.i]?.stock ?? 0);
      if (remaining <= 0) continue;
      market.goods[good.i].stock = 0;
      recordGoodFlow({ direction: "sink", category: "spoilage", goodId: good.i, units: remaining, marketId: market.i });
    }

    // This field coordinates the source-cell phase with this cycle's Market demand draw. The
    // cumulative householdConsumption field is intentionally retained for diagnostics, but must
    // never suppress household demand in later cycles.
    for (const ledger of Object.values(market.foodProcessingLedger ?? {})) {
      ledger.localHouseholdConsumptionThisCycle = 0;
    }
  }
}
