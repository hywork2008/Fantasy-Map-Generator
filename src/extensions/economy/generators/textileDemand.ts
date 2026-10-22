import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getGoods, getMarketCellColumn, getMarkets, getWorldContext } from "../economyContext";
import { getEconomyCalibrationState } from "../state/economyCalibrationStore";
import { debitHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
import { laborPeople } from "./craftScale";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { debitRuralHouseholdWealth, getRuralHouseholdWealth } from "./householdWealth";
import type { Market, TextileLedger } from "./marketTypes";
import {
  CLOTH_LOTS_PER_GARMENT,
  COTTON_LOTS_PER_CLOTH,
  HEMP_LOTS_PER_CLOTH,
  HOUSEHOLD_GARMENT_NAMES,
  LINEN_BALES_PER_GARMENT
} from "./textileRecipeContracts";

export const PEOPLE_PER_TEXTILE_MARKET_LOT = 1_000;
export const WARDROBE_REPLACEMENT_YEARS = 4;
// Authored bedding and cash-budget assumptions, not historical measurements.
export const BEDDING_HOUSEHOLD_SIZE = 5;
export const BLANKETS_PER_LOT = 100;
export const BLANKET_REPLACEMENT_YEARS = 8;
export const MONTHLY_HOUSEHOLD_TEXTILE_CASH_SHARE = 0.05;
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
export function getHouseholdGarmentInventory(inventory: readonly number[]): number {
  return getGoods()
    .filter(good => HOUSEHOLD_GARMENT_NAMES.has(good.name))
    .reduce((sum, good) => sum + Math.max(0, inventory[good.i] ?? 0), 0);
}

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

/** Two blankets per household, plus one below 5 C and another below freezing. */
export function getMarketBlanketDemandProfile(marketId: number): TextileDemandProfile {
  const { populationLots } = getMarketTextileDemandProfile(marketId);
  const temperature = getMarketTemperature(marketId);
  const blanketsPerHousehold = 2 + (temperature < 5 ? 1 : 0) + (temperature < 0 ? 1 : 0);
  const annualDemand =
    (((populationLots * PEOPLE_PER_TEXTILE_MARKET_LOT) / BEDDING_HOUSEHOLD_SIZE) * blanketsPerHousehold) /
    BLANKET_REPLACEMENT_YEARS /
    BLANKETS_PER_LOT;
  return {
    populationLots,
    climateMultiplier: blanketsPerHousehold / 2,
    annualDemand,
    monthlyDemand: annualDemand / 12
  };
}

type TextileBuyer = {
  populationLots: number;
  budget: number;
  rural: boolean;
  debit: (amount: number) => number;
};

function getTextileBuyers(market: Market): TextileBuyer[] {
  const buyers: TextileBuyer[] = getWorldContext()
    .pack.burgs.filter((burg): burg is Burg => Boolean(burg?.i && !burg.removed && burg.market === market.i))
    .map(burg => ({
      populationLots: actualUrbanPopulation(burg) / PEOPLE_PER_TEXTILE_MARKET_LOT,
      budget: Math.floor(getHouseholdWealth(burg.i) * MONTHLY_HOUSEHOLD_TEXTILE_CASH_SHARE * 100) / 100,
      rural: false,
      debit: amount => debitHouseholdWealth(burg.i, amount)
    }));
  buyers.push({
    populationLots: actualRuralPopulation(market.i) / PEOPLE_PER_TEXTILE_MARKET_LOT,
    budget: Math.floor(getRuralHouseholdWealth(market) * MONTHLY_HOUSEHOLD_TEXTILE_CASH_SHARE * 100) / 100,
    rural: true,
    debit: amount => debitRuralHouseholdWealth(market, amount)
  });
  return buyers.filter(buyer => buyer.populationLots > 0);
}

function textilePrice(market: Market, names: ReadonlySet<string>): number {
  const prices = getGoods()
    .filter(good => names.has(good.name) && isGoodEnabled(good))
    .map(good => market.goods[good.i]?.price ?? good.value)
    .filter(price => Number.isFinite(price) && price > 0);
  return prices.length ? Math.min(...prices) : Infinity;
}

const BLANKET_NAMES: ReadonlySet<string> = new Set(["Wool Blankets"]);

/** Read-only order quantities, bounded by each buyer's own monthly purse allocation.
 * Wardrobes have first call on the same cash allocation; bedding never reuses that money.
 */
export function getAffordableTextileDemand(market: Market, blankets: boolean): number {
  const wardrobe = getMarketTextileDemandProfile(market.i);
  if (!(wardrobe.populationLots > 0)) return 0;
  const bedding = blankets ? getMarketBlanketDemandProfile(market.i) : undefined;
  const garmentPrice = textilePrice(market, HOUSEHOLD_GARMENT_NAMES);
  const blanketPrice = textilePrice(market, BLANKET_NAMES);
  return getTextileBuyers(market).reduce((sum, buyer) => {
    const share = buyer.populationLots / wardrobe.populationLots;
    const wardrobeNeed = wardrobe.monthlyDemand * share;
    if (!blankets) return sum + Math.min(wardrobeNeed, buyer.budget / garmentPrice);
    const wardrobeReserve = Number.isFinite(garmentPrice) ? Math.min(buyer.budget, wardrobeNeed * garmentPrice) : 0;
    return sum + Math.min(bedding!.monthlyDemand * share, Math.max(0, buyer.budget - wardrobeReserve) / blanketPrice);
  }, 0);
}

function settleHouseholdTextiles(
  market: Market,
  buyers: TextileBuyer[],
  names: ReadonlySet<string>,
  profile: TextileDemandProfile,
  previous: TextileLedger | undefined
): TextileLedger {
  const consumptionByBuyer = new Map<TextileBuyer, number>();
  let consumed = 0;
  let spending = 0;
  let ruralConsumption = 0;
  const available = getGoods()
    .filter(
      good =>
        names.has(good.name) &&
        isGoodEnabled(good) &&
        (market.goods[good.i]?.stock ?? 0) > 0 &&
        Number.isFinite(market.goods[good.i].price) &&
        market.goods[good.i].price > 0
    )
    .sort((a, b) => market.goods[a.i].price - market.goods[b.i].price || a.i - b.i);
  // Divide each available lot by outstanding paid orders so the first town cannot take all stock.
  for (const good of available) {
    const row = market.goods[good.i];
    const orders = buyers.map(buyer => {
      const need =
        profile.populationLots > 0 ? (profile.monthlyDemand * buyer.populationLots) / profile.populationLots : 0;
      return Math.min(Math.max(0, need - (consumptionByBuyer.get(buyer) ?? 0)), buyer.budget / row.price);
    });
    const totalOrders = orders.reduce((sum, units) => sum + units, 0);
    const stockShare = totalOrders > 0 ? Math.min(1, Math.max(0, row.stock) / totalOrders) : 0;
    for (const [index, buyer] of buyers.entries()) {
      // Whole cents cap the purchase before either goods or money move. No free fractional goods.
      const cost = Math.floor(Math.min(buyer.budget, orders[index] * stockShare * row.price) * 100 + 1e-9) / 100;
      if (!(cost > 0)) continue;
      const paid = buyer.debit(cost);
      const units = paid / row.price;
      if (!(units > 0)) continue;
      buyer.budget = Math.max(0, buyer.budget - paid);
      consumptionByBuyer.set(buyer, (consumptionByBuyer.get(buyer) ?? 0) + units);
      row.stock = Math.max(0, row.stock - units);
      market.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
      const treasury = market.marketTreasury;
      treasury.balance = rn(treasury.balance + paid, 2);
      consumed += units;
      spending += paid;
      if (buyer.rural) ruralConsumption += units;
      recordGoodFlow({ direction: "sink", category: "householdTextiles", goodId: good.i, units, marketId: market.i });
    }
  }
  const unmetDemand = Math.max(0, profile.monthlyDemand - consumed);
  return {
    ...(previous ?? emptyLedger(profile)),
    ...profile,
    householdConsumption: rn(consumed, 2),
    unmetDemand: rn(unmetDemand, 2),
    householdSpending: rn(spending, 2),
    urbanConsumption: rn(consumed - ruralConsumption, 2),
    ruralConsumption: rn(ruralConsumption, 2),
    cumulativeHouseholdConsumption: rn((previous?.cumulativeHouseholdConsumption ?? 0) + consumed, 2),
    cumulativeUnmetDemand: rn((previous?.cumulativeUnmetDemand ?? 0) + unmetDemand, 2),
    cumulativeHouseholdSpending: rn((previous?.cumulativeHouseholdSpending ?? 0) + spending, 2)
  };
}

/** Settles paid wardrobes first and independent bedding second after manufacturing and trade. */
export function settleTextileHouseholdDemand(): void {
  for (const market of getMarkets()) {
    const buyers = getTextileBuyers(market);
    const wardrobe = getMarketTextileDemandProfile(market.i);
    const garmentPrice = textilePrice(market, HOUSEHOLD_GARMENT_NAMES);
    const beddingBudgets = buyers.map(buyer => {
      const wardrobeNeed =
        wardrobe.populationLots > 0 ? (wardrobe.monthlyDemand * buyer.populationLots) / wardrobe.populationLots : 0;
      return Number.isFinite(garmentPrice) ? Math.max(0, buyer.budget - wardrobeNeed * garmentPrice) : buyer.budget;
    });
    market.textileLedger = settleHouseholdTextiles(
      market,
      buyers,
      HOUSEHOLD_GARMENT_NAMES,
      getMarketTextileDemandProfile(market.i),
      market.textileLedger
    );
    for (const [index, buyer] of buyers.entries()) buyer.budget = Math.min(buyer.budget, beddingBudgets[index]);
    market.blanketLedger = settleHouseholdTextiles(
      market,
      buyers,
      BLANKET_NAMES,
      getMarketBlanketDemandProfile(market.i),
      market.blanketLedger
    );
  }
}

export function getBlanketProductionHeadroom(market: Market, localInventory: number): number {
  const blanket = getGoods().find(good => good.name === "Wool Blankets");
  if (!blanket) return 0;
  return Math.max(
    0,
    getAffordableTextileDemand(market, true) -
      Math.max(0, market.goods[blanket.i]?.stock ?? 0) -
      Math.max(0, localInventory)
  );
}

/** Caps a single burg's Garment output to the market's next month of actual household replacement demand. */
export function getGarmentProductionHeadroom(market: Market, localInventory: number): number {
  const garments = getGoods().filter(good => HOUSEHOLD_GARMENT_NAMES.has(good.name));
  if (!garments.length) return 0;
  const profile = getMarketTextileDemandProfile(market.i);
  const marketStock = garments.reduce((sum, good) => sum + Math.max(0, market.goods[good.i]?.stock ?? 0), 0);
  return Math.max(
    0,
    Math.min(profile.monthlyDemand, getAffordableTextileDemand(market, false)) -
      marketStock -
      Math.max(0, localInventory)
  );
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

  const woolOrders = Math.max(0, market.goods[wool.i]?.stock ?? 0) / (6 * CLOTH_LOTS_PER_GARMENT);
  const hempOrders = Math.max(0, market.goods[hemp.i]?.stock ?? 0) / (HEMP_LOTS_PER_CLOTH * CLOTH_LOTS_PER_GARMENT);
  const cottonOrders =
    Math.max(0, market.goods[cotton.i]?.stock ?? 0) / (COTTON_LOTS_PER_CLOTH * CLOTH_LOTS_PER_GARMENT);
  const clothOrders = Math.max(0, market.goods[cloth.i]?.stock ?? 0) / CLOTH_LOTS_PER_GARMENT;
  const linenOrders = Math.max(0, market.goods[linen.i]?.stock ?? 0) / LINEN_BALES_PER_GARMENT;
  const woolCloth = getGoods().find(good => good.name === "Wool Cloth");
  const woolGarments = getGoods().find(good => good.name === "Wool Garments");
  const woolClothOrders =
    woolCloth && woolGarments ? Math.max(0, market.goods[woolCloth.i]?.stock ?? 0) / CLOTH_LOTS_PER_GARMENT : 0;
  // Raw wool is already included once above; alternative recipes must not duplicate that stock.
  const availableInputOrders = woolOrders + hempOrders + cottonOrders + clothOrders + linenOrders + woolClothOrders;
  const expectedOrders = Math.min(
    getAffordableTextileDemand(market, false) * INITIAL_TEXTILE_WORK_MONTHS,
    availableInputOrders
  );
  const garmentPrice = market.goods[garments.i]?.price ?? garments.value;
  const clothPrice = market.goods[cloth.i]?.price ?? cloth.value;
  const linenGarments = getGoods().find(good => good.name === "Linen Garments");
  const linenGarmentPrice = linenGarments
    ? (market.goods[linenGarments.i]?.price ?? linenGarments.value)
    : garmentPrice;
  const linenPrice = market.goods[linen.i]?.price ?? linen.value;
  const ordinaryOrders = woolOrders + hempOrders + cottonOrders + clothOrders;
  const availableMargin =
    ordinaryOrders * Math.max(0, garmentPrice - clothPrice * CLOTH_LOTS_PER_GARMENT) +
    linenOrders * Math.max(0, linenGarmentPrice - linenPrice * LINEN_BALES_PER_GARMENT) +
    woolClothOrders *
      Math.max(
        0,
        (woolGarments ? (market.goods[woolGarments.i]?.price ?? woolGarments.value) : garmentPrice) -
          (woolCloth ? (market.goods[woolCloth.i]?.price ?? woolCloth.value) : clothPrice) * CLOTH_LOTS_PER_GARMENT
      );
  const projectedMonthlyMargin =
    availableInputOrders > 0
      ? (availableMargin * (expectedOrders / availableInputOrders)) / INITIAL_TEXTILE_WORK_MONTHS
      : 0;
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
