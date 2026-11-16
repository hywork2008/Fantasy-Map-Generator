/**
 * Dairy demand from tradition and price instead of fixed per-head targets (docs/plan/dairy-demand.md).
 * Per market and month only: the tradition is a slow average of the milk the market's own herds give a
 * person, its cheese part is scaled by the cheese price against its value.
 */
import { pow } from "../../../simulation/deterministicMath";
import { getMarketSettings } from "../../../simulation/marketSettings";
import { getOrCreateFaunaStockTable } from "../context/cellTables";
import { getMarketCellColumn } from "../economyContext";
import { ANNUAL_LITERS_PER_LACTATING_FEMALE, LACTATING_SHARE_OF_BREEDING_COHORT } from "./dairyProductionPolicy";
import {
  DAIRY_TARGETS,
  KILOGRAMS_PER_CHEESE_LOT,
  LITERS_PER_MILK_LOT,
  MILK_LITERS_PER_CHEESE_KILOGRAM
} from "./foodLots";
import type { Market } from "./marketTypes";
import { CHEESE_PROTEIN_G_PER_KG, MEAT_PROTEIN_G_PER_KG, MILK_PROTEIN_G_PER_LITER } from "./nutritionAudit";

/** Share of the traditional milk drunk fresh: the old targets' 20 L against 25 kg of cheese (250 L). */
const FRESH_MILK_SHARE =
  DAIRY_TARGETS.freshMilkLitersPerPersonYear /
  (DAIRY_TARGETS.freshMilkLitersPerPersonYear +
    DAIRY_TARGETS.cheeseKilogramsPerPersonYear * MILK_LITERS_PER_CHEESE_KILOGRAM);
/** Cheese price factor bounds, so an empty or glutted market cannot swing demand without end. */
const PRICE_FACTOR_MIN = 0.25;
const PRICE_FACTOR_MAX = 2;

export type DairyDemandPerHead = { milkLiters: number; cheeseKilograms: number };

/** A year of milk the market's own herds give at full care and feed, litres; the tradition's first value. */
function getAnnualMilkPotential(marketId: number, cellIds: ArrayLike<number>): number {
  const table = getOrCreateFaunaStockTable();
  if (!table) return 0;
  const column = getMarketCellColumn();
  let liters = 0;
  for (let index = 0; index < cellIds.length; index++) {
    const cellId = cellIds[index];
    if (column[cellId] !== marketId) continue;
    for (const [species, annual] of Object.entries(ANNUAL_LITERS_PER_LACTATING_FEMALE)) {
      const breeding = table[`${cellId}:${species}`]?.breeding ?? 0;
      liters += breeding * LACTATING_SHARE_OF_BREEDING_COHORT * annual;
    }
  }
  return liters;
}

/** The tradition, set from the herds the first time it is read. */
export function getDairyTradition(market: Market, people: number, cellIds: ArrayLike<number>): number {
  if (market.dairyTraditionLitersPerHead === undefined)
    market.dairyTraditionLitersPerHead = people > 0 ? getAnnualMilkPotential(market.i, cellIds) / people : 0;
  return market.dairyTraditionLitersPerHead;
}

/**
 * Moves the tradition toward this month's milk a person, as a year's rate (lactating months count more,
 * dry months nothing, which averages to the year). Call once a month, before the cycle's harvest is reset.
 */
export function updateDairyTradition(market: Market, people: number, cellIds: ArrayLike<number>): void {
  if (getMarketSettings().dairyDemand !== "tradition" || !(people > 0)) return;
  const current = getDairyTradition(market, people, cellIds);
  const harvestLots = market.foodProcessingLedger?.Milk?.cellHarvestThisCycle ?? 0;
  const herds = (harvestLots * LITERS_PER_MILK_LOT * 12) / people;
  // What the people ate, own and bought in, as milk: a market without herds that keeps buying
  // cheese comes to want it (docs/plan/dairy-demand.md §3.1).
  const eatenLiters =
    (market.foodProcessingLedger?.Milk?.householdConsumption ?? 0) * LITERS_PER_MILK_LOT +
    (market.foodProcessingLedger?.Cheese?.householdConsumption ?? 0) *
      KILOGRAMS_PER_CHEESE_LOT *
      MILK_LITERS_PER_CHEESE_KILOGRAM;
  const eaten = (Math.max(0, eatenLiters - (market.dairyEatenLitersMark ?? eatenLiters)) * 12) / people;
  market.dairyEatenLitersMark = eatenLiters;
  const observed = getMarketSettings().dairyTraditionSource === "herdsAndPurchases" ? Math.max(herds, eaten) : herds;
  const months = Math.max(1, getMarketSettings().dairyTraditionHalfLifeYears * 12);
  const weight = 1 - pow(0.5, 1 / months);
  market.dairyTraditionLitersPerHead = current + (observed - current) * weight;
  // Meat comes in a few slaughter months, so its yearly rate is a one-year average, not the tradition's.
  const meat = ((market.meatKilogramsThisCycle ?? 0) * 12) / people;
  const meatWeight = 1 - pow(0.5, 1 / 12);
  const meatBefore = market.meatKilogramsPerHeadYear ?? meat;
  market.meatKilogramsPerHeadYear = meatBefore + (meat - meatBefore) * meatWeight;
  market.meatKilogramsThisCycle = 0;
}

/**
 * Drops dairy demand above the animal-protein cap left after the meat a person here eats
 * (docs/plan/dairy-demand.md §3.3). Cheese goes first; fresh milk keeps what is left.
 */
function capByAnimalProtein(market: Market, demand: DairyDemandPerHead): DairyDemandPerHead {
  const capKg = (getMarketSettings().animalProteinCapGramsPerDay * 365) / 1000;
  const meatKg = ((market.meatKilogramsPerHeadYear ?? 0) * MEAT_PROTEIN_G_PER_KG) / 1000;
  const roomKg = Math.max(0, capKg - meatKg);
  const milkKg = Math.min((demand.milkLiters * MILK_PROTEIN_G_PER_LITER) / 1000, roomKg);
  const cheeseKg = Math.min((demand.cheeseKilograms * CHEESE_PROTEIN_G_PER_KG) / 1000, roomKg - milkKg);
  return {
    milkLiters: (milkKg * 1000) / MILK_PROTEIN_G_PER_LITER,
    cheeseKilograms: (cheeseKg * 1000) / CHEESE_PROTEIN_G_PER_KG
  };
}

/** Last price of cheese against its value, raised to the elasticity, bounded. */
export function getCheesePriceFactor(price: number | undefined, value: number): number {
  if (!(price && price > 0) || !(value > 0)) return 1;
  const factor = pow(price / value, getMarketSettings().cheesePriceElasticity);
  return Math.min(PRICE_FACTOR_MAX, Math.max(PRICE_FACTOR_MIN, factor));
}

/** A person's yearly milk and cheese demand in this market. */
export function getDairyDemandPerHead(
  market: Market,
  people: number,
  cellIds: ArrayLike<number>,
  cheesePrice: number | undefined,
  cheeseValue: number
): DairyDemandPerHead {
  if (getMarketSettings().dairyDemand !== "tradition")
    return {
      milkLiters: DAIRY_TARGETS.freshMilkLitersPerPersonYear,
      cheeseKilograms: DAIRY_TARGETS.cheeseKilogramsPerPersonYear
    };
  const tradition = getDairyTradition(market, people, cellIds);
  // When the staple runs short, cheese fills the belly whatever it costs: dearness no longer cuts it.
  const priceFactor = getCheesePriceFactor(cheesePrice, cheeseValue);
  const hungry = (market.foodLedger?.ruralFoodStressQuarters ?? 0) > 0;
  return capByAnimalProtein(market, {
    milkLiters: tradition * FRESH_MILK_SHARE,
    cheeseKilograms:
      ((tradition * (1 - FRESH_MILK_SHARE)) / MILK_LITERS_PER_CHEESE_KILOGRAM) *
      (hungry ? Math.max(1, priceFactor) : priceFactor)
  });
}
