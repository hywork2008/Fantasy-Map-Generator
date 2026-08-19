import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getGoods, getMarketCellColumn, getMarkets, getWorldContext } from "../economyContext";
import { getEconomyCalibrationState } from "../store/economyCalibrationState";
import { laborPeople } from "./craftScale";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { Market, TextileLedger } from "./marketTypes";

export const PEOPLE_PER_TEXTILE_MARKET_LOT = 1_000;
export const WARDROBE_REPLACEMENT_YEARS = 4;
export const INITIAL_TEXTILE_WORK_MONTHS = 3;
export const MIN_TEXTILE_MONTHLY_MARGIN_PER_WORKER = 1.05;

/**
 * Three constants split out of the former single MIN_TEXTILE_WORKERS = 2
 * (docs/plan/craft-demand-calibration.md §2.0, PR 3): a real-people burg-size floor, a lot-count
 * floor, and a margin floor. Under applyCalibration, the burg-size check compares real labor
 * people instead of raw population points — at the default populationRate 1000 this is numerically
 * identical to the legacy `burg.population >= 2` check.
 */
export const MIN_TEXTILE_BURG_PEOPLE = 2000;
export const MIN_TEXTILE_ORDER_LOTS = 2;
export const MIN_TEXTILE_MARGIN_FLOOR = MIN_TEXTILE_ORDER_LOTS * MIN_TEXTILE_MONTHLY_MARGIN_PER_WORKER;
/** Legacy points-scale burg-size floor, restored when applyCalibration is off. */
const MIN_TEXTILE_WORKERS = 2;

export type TextileDemandProfile = {
  populationLots: number;
  climateMultiplier: number;
  annualDemand: number;
  monthlyDemand: number;
};

export type TextileGuildWorkPlan = TextileDemandProfile & {
  expectedOrders: number;
  availableInputOrders: number;
  projectedMonthlyMargin: number;
  viable: boolean;
};

function actualUrbanPopulation(burg: Burg): number {
  const world = getWorldContext();
  return (
    Math.max(0, burg.population ?? 0) * Math.max(1, world.populationRate ?? 1) * Math.max(0, world.urbanization ?? 1)
  );
}

function actualRuralPopulation(marketId: number): number {
  const world = getWorldContext();
  const cells = world.pack.cells;
  // Market-only tests and legacy transitional maps can have markets before the packed-cell columns
  // are present. They have no attributable countryside, so retain the urban-only fallback.
  if (!cells?.i?.length) return 0;
  const marketCells = getMarketCellColumn();
  const populationRate = Math.max(1, world.populationRate ?? 1);
  let population = 0;
  for (const cellId of cells.i) {
    if (marketCells[cellId] !== marketId || cells.h[cellId] < 20) continue;
    population += Math.max(0, cells.pop[cellId] ?? 0) * populationRate;
  }
  return population;
}

function getMarketTemperature(marketId: number): number {
  const world = getWorldContext();
  const cells = world.pack.cells;
  if (!cells?.i?.length) return 10;
  const temperatures = world.grid?.cells?.temp;
  if (!temperatures) return 10;
  const marketCells = getMarketCellColumn();
  let weightedTemperature = 0;
  let weight = 0;
  for (const cellId of cells.i) {
    if (marketCells[cellId] !== marketId || cells.h[cellId] < 20) continue;
    const temperature = temperatures[cells.g[cellId]];
    if (!Number.isFinite(temperature)) continue;
    const populationWeight = Math.max(1, cells.pop[cellId] ?? 0);
    weightedTemperature += temperature * populationWeight;
    weight += populationWeight;
  }
  return weight > 0 ? weightedTemperature / weight : 10;
}

export function getClothingClimateMultiplier(temperatureC: number): number {
  if (temperatureC < 0) return 1.4;
  if (temperatureC < 5) return 1.2;
  if (temperatureC >= 15) return 0.9;
  return 1;
}

export function getMarketTextileDemandProfile(marketId: number): TextileDemandProfile {
  const world = getWorldContext();
  const urbanPopulation = world.pack.burgs
    .filter((burg): burg is Burg => Boolean(burg?.i && !burg.removed && burg.market === marketId))
    .reduce((total, burg) => total + actualUrbanPopulation(burg), 0);
  const populationLots = (urbanPopulation + actualRuralPopulation(marketId)) / PEOPLE_PER_TEXTILE_MARKET_LOT;
  const climateMultiplier = getClothingClimateMultiplier(getMarketTemperature(marketId));
  const annualDemand = (populationLots / WARDROBE_REPLACEMENT_YEARS) * climateMultiplier;
  return { populationLots, climateMultiplier, annualDemand, monthlyDemand: annualDemand / 12 };
}

function emptyLedger(profile: TextileDemandProfile): TextileLedger {
  return {
    ...profile,
    householdConsumption: 0,
    unmetDemand: 0,
    cumulativeHouseholdConsumption: 0,
    cumulativeUnmetDemand: 0
  };
}

/** Settles household wardrobe replacement after manufacturing and trade have supplied the market. */
export function settleTextileHouseholdDemand(): void {
  const garments = getGoods().find(good => good.name === "Garments");
  if (!garments) return;

  for (const market of getMarkets()) {
    const profile = getMarketTextileDemandProfile(market.i);
    const previous = market.textileLedger ?? emptyLedger(profile);
    const row = market.goods[garments.i];
    const consumed = Math.min(profile.monthlyDemand, Math.max(0, row?.stock ?? 0));
    const unmetDemand = Math.max(0, profile.monthlyDemand - consumed);
    if (row) row.stock = rn(Math.max(0, row.stock - consumed), 2);
    if (consumed > 0) {
      recordGoodFlow({
        direction: "sink",
        category: "householdTextiles",
        goodId: garments.i,
        units: consumed,
        marketId: market.i
      });
    }

    market.textileLedger = {
      ...previous,
      ...profile,
      householdConsumption: rn(consumed, 2),
      unmetDemand: rn(unmetDemand, 2),
      cumulativeHouseholdConsumption: rn(previous.cumulativeHouseholdConsumption + consumed, 2),
      cumulativeUnmetDemand: rn(previous.cumulativeUnmetDemand + unmetDemand, 2)
    };
  }
}

/** Caps a single burg's Garment output to the market's next month of actual household replacement demand. */
export function getGarmentProductionHeadroom(market: Market, localInventory: number): number {
  const garments = getGoods().find(good => good.name === "Garments");
  if (!garments) return 0;
  const profile = getMarketTextileDemandProfile(market.i);
  const marketStock = Math.max(0, market.goods[garments.i]?.stock ?? 0);
  return Math.max(0, profile.monthlyDemand - marketStock - Math.max(0, localInventory));
}

/**
 * Formal textile chapters require real short-horizon orders, material and margin. No stock or
 * working capital is created here; this is a read-only eligibility calculation for guild placement.
 */
export function getTextileGuildWorkPlan(burg: Burg): TextileGuildWorkPlan {
  const market = getMarkets().find(candidate => candidate.i === burg.market);
  const fallback: TextileDemandProfile = { populationLots: 0, climateMultiplier: 1, annualDemand: 0, monthlyDemand: 0 };
  if (!market)
    return { ...fallback, expectedOrders: 0, availableInputOrders: 0, projectedMonthlyMargin: 0, viable: false };

  const profile = getMarketTextileDemandProfile(market.i);
  const wool = getGoods().find(good => good.name === "Wool");
  const hemp = getGoods().find(good => good.name === "Hemp");
  const cotton = getGoods().find(good => good.name === "Cotton");
  const cloth = getGoods().find(good => good.name === "Cloth");
  const linen = getGoods().find(good => good.name === "Linen");
  const garments = getGoods().find(good => good.name === "Garments");
  if (!wool || !hemp || !cotton || !cloth || !linen || !garments) {
    return { ...profile, expectedOrders: 0, availableInputOrders: 0, projectedMonthlyMargin: 0, viable: false };
  }

  const woolOrders = Math.max(0, market.goods[wool.i]?.stock ?? 0) / 6;
  const hempOrders = Math.max(0, market.goods[hemp.i]?.stock ?? 0) / 6;
  const cottonOrders = Math.max(0, market.goods[cotton.i]?.stock ?? 0) / 6;
  const clothOrders = Math.max(0, market.goods[cloth.i]?.stock ?? 0);
  const linenOrders = Math.max(0, market.goods[linen.i]?.stock ?? 0) / 0.75;
  const availableInputOrders = woolOrders + hempOrders + cottonOrders + clothOrders + linenOrders;
  const expectedOrders = Math.min(profile.monthlyDemand * INITIAL_TEXTILE_WORK_MONTHS, availableInputOrders);
  const garmentPrice = market.goods[garments.i]?.price ?? garments.value;
  const clothPrice = market.goods[cloth.i]?.price ?? cloth.value;
  const projectedMonthlyMargin =
    Math.max(0, garmentPrice - clothPrice) * (expectedOrders / INITIAL_TEXTILE_WORK_MONTHS);
  const applyCalibration = getEconomyCalibrationState().applyCalibration;
  const burgMeetsSizeFloor = applyCalibration
    ? laborPeople(burg.population ?? 0, Math.max(0, getWorldContext().populationRate ?? 0) || 1) >=
      MIN_TEXTILE_BURG_PEOPLE
    : (burg.population ?? 0) >= MIN_TEXTILE_WORKERS;
  const viable =
    burgMeetsSizeFloor &&
    expectedOrders >= MIN_TEXTILE_ORDER_LOTS &&
    projectedMonthlyMargin >= MIN_TEXTILE_MARGIN_FLOOR;

  return { ...profile, expectedOrders, availableInputOrders, projectedMonthlyMargin, viable };
}

export function isTextileGuildWorkViable(burgId: number): boolean {
  const burg = getWorldContext().pack.burgs[burgId] as Burg | undefined;
  return Boolean(burg?.i && !burg.removed && getTextileGuildWorkPlan(burg).viable);
}
