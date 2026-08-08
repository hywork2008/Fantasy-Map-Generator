import { getGoods, getMarkets, getWorldContext } from "../economyContext";
import {
  DAIRY_TARGETS,
  GRAPE_TARGETS,
  KILOGRAMS_PER_CHEESE_LOT,
  KILOGRAMS_PER_GRAPES_LOT,
  KILOGRAMS_PER_RAISINS_LOT,
  LITERS_PER_MILK_LOT,
  LITERS_PER_WINE_LOT,
  WINE_TARGETS
} from "./foodLots";
import { getMarketRuralPopulation } from "./foodProduction";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { FoodProcessingGoodLedger, Market } from "./marketTypes";

const TRACKED_GOODS = new Set(["Milk", "Cheese", "Grapes", "Raisins", "Wine"]);

function emptyGoodLedger(): FoodProcessingGoodLedger {
  return {
    marketIntake: 0,
    householdConsumption: 0,
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
  if (ledger && units > 0) ledger.processingConsumption += units;
}

export function recordWineCaskFilling(market: Market, wineLots: number, replacementCasks: number): void {
  if (wineLots <= 0) return;
  const containers = market.returnableContainerLedger ?? {
    wineCasksInService: 0,
    cumulativeWineCaskReturns: 0,
    cumulativeWineCaskReplacement: 0
  };
  containers.wineCasksInService += wineLots;
  containers.cumulativeWineCaskReplacement += Math.max(0, replacementCasks);
  market.returnableContainerLedger = containers;
}

function getMarketPeople(market: Market): number {
  const world = getWorldContext();
  const urban = world.pack.burgs.reduce((total, burg) => {
    if (!burg.i || burg.removed || burg.market !== market.i) return total;
    return total + (burg.population ?? 0) * Math.max(1, world.populationRate || 1) * (world.urbanization ?? 1);
  }, 0);
  return urban + getMarketRuralPopulation(world, market.i);
}

function getMonthlyHouseholdDemand(market: Market, goodName: string): number {
  const people = getMarketPeople(market);
  switch (goodName) {
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
    default:
      return 0;
  }
}

/**
 * Processing preserves food, but it must not create an unbounded stockpile merely because a
 * recipe is profitable. Three months of projected household demand gives artisans time to work
 * ahead of seasonal harvest while leaving no artificial export sink.
 */
export function getFoodProcessingProductionHeadroom(
  market: Market,
  goodName: string,
  privateInventory: number
): number {
  if (goodName !== "Cheese" && goodName !== "Raisins" && goodName !== "Wine") return Number.POSITIVE_INFINITY;
  const good = getGoods().find(candidate => candidate.name === goodName);
  if (!good) return 0;
  const marketStock = Math.max(0, market.goods[good.i]?.stock ?? 0);
  return Math.max(0, getMonthlyHouseholdDemand(market, goodName) * 3 - marketStock - Math.max(0, privateInventory));
}

function drawHouseholdDemand(market: Market, goodName: string, demand: number): void {
  const good = getGoods().find(candidate => candidate.name === goodName);
  const ledger = getGoodLedger(market, goodName);
  if (!good || !ledger || demand <= 0) return;
  const marketGood = market.goods[good.i];
  const available = Math.max(0, marketGood?.stock ?? 0);
  const consumed = Math.min(available, demand);
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
  ledger.unmetDemand += Math.max(0, demand - consumed);
  if (goodName === "Wine" && consumed > 0 && market.returnableContainerLedger) {
    const containers = market.returnableContainerLedger;
    const returned = Math.min(containers.wineCasksInService, consumed);
    containers.wineCasksInService -= returned;
    containers.cumulativeWineCaskReturns += returned;
  }
}

/**
 * Settles food households after all local processing has claimed its inputs. Milk and Grapes have
 * no cold-chain: stock remaining after same-month household purchases is recorded as spoilage and
 * removed. Cheese, Raisins, and Wine remain market stock for later months.
 */
export function settleFoodProcessingHouseholds(): void {
  for (const market of getMarkets()) {
    drawHouseholdDemand(market, "Milk", getMonthlyHouseholdDemand(market, "Milk"));
    drawHouseholdDemand(market, "Cheese", getMonthlyHouseholdDemand(market, "Cheese"));
    drawHouseholdDemand(market, "Grapes", getMonthlyHouseholdDemand(market, "Grapes"));
    drawHouseholdDemand(market, "Raisins", getMonthlyHouseholdDemand(market, "Raisins"));
    drawHouseholdDemand(market, "Wine", getMonthlyHouseholdDemand(market, "Wine"));

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
  }
}
