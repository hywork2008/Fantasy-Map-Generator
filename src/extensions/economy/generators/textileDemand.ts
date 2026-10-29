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
import { setRuntimeOnly } from "./runtimeOnly";
import {
  estimateRuralTextileProduction,
  type RuralTextileProduction,
  settleRuralTextileProduction
} from "./ruralTextileProduction";
import { estimateTextileCommissions, settleTextileCommissions } from "./textileCommissions";
import {
  BEDDING_HOUSEHOLD_SIZE,
  BLANKET_REPLACEMENT_YEARS,
  BLANKETS_PER_LOT,
  getBeddingCashBudget,
  getBlanketsPerHousehold,
  getClothingClimateMultiplier,
  MONTHLY_HOUSEHOLD_TEXTILE_CASH_SHARE,
  PEOPLE_PER_TEXTILE_MARKET_LOT,
  WARDROBE_REPLACEMENT_YEARS
} from "./textileHouseholdPolicy";
import {
  CLOTH_LOTS_PER_GARMENT,
  COTTON_LOTS_PER_CLOTH,
  HEMP_LOTS_PER_CLOTH,
  HOUSEHOLD_GARMENT_NAMES,
  LINEN_BALES_PER_GARMENT
} from "./textileRecipeContracts";

export {
  BEDDING_HOUSEHOLD_SIZE,
  BLANKET_REPLACEMENT_YEARS,
  BLANKETS_PER_LOT,
  getClothingClimateMultiplier,
  MONTHLY_HOUSEHOLD_TEXTILE_CASH_SHARE,
  PEOPLE_PER_TEXTILE_MARKET_LOT,
  WARDROBE_REPLACEMENT_YEARS
} from "./textileHouseholdPolicy";

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

type MarketCellAggregates = {
  ruralPopulation: Map<number, number>;
  temperature: Map<number, { weighted: number; weight: number }>;
};

// Every market's countryside in one pass over the cells, held for one production cycle. The
// per-market scans ran several times per burg decision and were a sixth of the settlement.
let cycleCacheDepth = 0;
let cycleAggregates: MarketCellAggregates | null = null;

/** Runs `fn` with market cell aggregates cached; cells, territories and pop must not change inside. */
export function withTextileDemandCycleCache<T>(fn: () => T): T {
  cycleCacheDepth++;
  try {
    return fn();
  } finally {
    if (--cycleCacheDepth === 0) cycleAggregates = null;
  }
}

/** Drops the cycle's aggregates after a territory change. */
export function invalidateTextileDemandCache(): void {
  cycleAggregates = null;
}

function collectMarketCellAggregates(): MarketCellAggregates {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const marketCells = getMarketCellColumn();
  const temperatures = world.grid?.cells?.temp;
  const populationRate = Math.max(1, world.populationRate ?? 1);
  const ruralPopulation = new Map<number, number>();
  const temperature = new Map<number, { weighted: number; weight: number }>();
  for (const cellId of cells.i) {
    if (cells.h[cellId] < 20) continue;
    const marketId = marketCells[cellId];
    const pop = cells.pop?.[cellId] ?? 0;
    ruralPopulation.set(marketId, (ruralPopulation.get(marketId) ?? 0) + Math.max(0, pop) * populationRate);
    if (!temperatures) continue;
    const cellTemperature = temperatures[cells.g[cellId]];
    if (!Number.isFinite(cellTemperature)) continue;
    const populationWeight = Math.max(1, pop);
    const entry = temperature.get(marketId);
    if (entry) {
      entry.weighted += cellTemperature * populationWeight;
      entry.weight += populationWeight;
    } else temperature.set(marketId, { weighted: cellTemperature * populationWeight, weight: populationWeight });
  }
  return { ruralPopulation, temperature };
}

function marketCellAggregates(): MarketCellAggregates {
  if (!cycleCacheDepth) return collectMarketCellAggregates();
  cycleAggregates ??= collectMarketCellAggregates();
  return cycleAggregates;
}

function actualRuralPopulation(marketId: number): number {
  // Market-only tests and legacy transitional maps can have markets before the packed-cell columns
  // are present. They have no attributable countryside, so retain the urban-only fallback.
  if (!getWorldContext().pack.cells?.i?.length) return 0;
  return marketCellAggregates().ruralPopulation.get(marketId) ?? 0;
}

function getMarketTemperature(marketId: number): number {
  const world = getWorldContext();
  if (!world.pack.cells?.i?.length || !world.grid?.cells?.temp) return 10;
  const entry = marketCellAggregates().temperature.get(marketId);
  return entry && entry.weight > 0 ? entry.weighted / entry.weight : 10;
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
  const blanketsPerHousehold = getBlanketsPerHousehold(temperature);
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

/** Read-only observation copy that keeps the runtime-only settlement diagnostics a plain clone drops. */
export function cloneTextileLedgerObservation(ledger: TextileLedger | undefined): TextileLedger | null {
  if (!ledger) return null;
  return { ...structuredClone(ledger), settlementDiagnostics: structuredClone(ledger.settlementDiagnostics) };
}

type TextileBuyer = {
  burgId: number | null;
  priorityAllocatedBudget?: number;
  populationLots: number;
  budget: number;
  rural: boolean;
  debit: (amount: number) => number;
};

function getTextileBuyers(market: Market): TextileBuyer[] {
  const buyers: TextileBuyer[] = getWorldContext()
    .pack.burgs.filter((burg): burg is Burg => Boolean(burg?.i && !burg.removed && burg.market === market.i))
    .map(burg => ({
      burgId: burg.i ?? null,
      populationLots: actualUrbanPopulation(burg) / PEOPLE_PER_TEXTILE_MARKET_LOT,
      budget: Math.floor(getHouseholdWealth(burg.i) * MONTHLY_HOUSEHOLD_TEXTILE_CASH_SHARE * 100) / 100,
      rural: false,
      debit: amount => debitHouseholdWealth(burg.i, amount)
    }));
  buyers.push({
    burgId: null,
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
function affordableFinishedDemand(market: Market, blankets: boolean, home?: RuralTextileProduction): number {
  const wardrobe = getMarketTextileDemandProfile(market.i);
  if (!(wardrobe.populationLots > 0)) return 0;
  const bedding = blankets ? getMarketBlanketDemandProfile(market.i) : undefined;
  const garmentPrice = textilePrice(market, HOUSEHOLD_GARMENT_NAMES);
  const blanketPrice = textilePrice(market, BLANKET_NAMES);
  return getTextileBuyers(market).reduce((sum, buyer) => {
    const share = buyer.populationLots / wardrobe.populationLots;
    const wardrobeNeed = Math.max(0, wardrobe.monthlyDemand * share - (buyer.rural ? (home?.garments ?? 0) : 0));
    const budget = Math.max(
      0,
      buyer.budget - (buyer.rural ? (home?.garmentSpending ?? 0) + (home?.blanketSpending ?? 0) : 0)
    );
    if (!blankets) return sum + Math.min(wardrobeNeed, budget / garmentPrice);
    const wardrobeReserve = Number.isFinite(garmentPrice) ? Math.min(budget, wardrobeNeed * garmentPrice) : 0;
    const beddingNeed = Math.max(0, bedding!.monthlyDemand * share - (buyer.rural ? (home?.blankets ?? 0) : 0));
    return sum + Math.min(beddingNeed, Math.max(0, budget - wardrobeReserve) / blanketPrice);
  }, 0);
}

function settleHouseholdTextiles(
  market: Market,
  buyers: TextileBuyer[],
  names: ReadonlySet<string>,
  profile: TextileDemandProfile,
  previous: TextileLedger | undefined,
  homeProduction = 0,
  homeSpending = 0,
  commissionProduction = 0,
  commissionSpending = 0
): TextileLedger {
  const consumptionByBuyer = new Map<TextileBuyer, number>();
  const paidByBuyer = new Map<TextileBuyer, number>();
  const marketUnitsByBuyer = new Map<TextileBuyer, number>();
  const pricedGoods = getGoods().filter(
    good =>
      names.has(good.name) &&
      isGoodEnabled(good) &&
      Number.isFinite(market.goods[good.i]?.price) &&
      market.goods[good.i].price > 0
  );
  const referencePrice = pricedGoods.length ? Math.min(...pricedGoods.map(good => market.goods[good.i].price)) : null;
  const rural = buyers.find(buyer => buyer.rural);
  if (rural) consumptionByBuyer.set(rural, homeProduction + commissionProduction);
  let consumed = homeProduction + commissionProduction;
  let spending = homeSpending + commissionSpending;
  let ruralConsumption = homeProduction + commissionProduction;
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
      paidByBuyer.set(buyer, (paidByBuyer.get(buyer) ?? 0) + paid);
      marketUnitsByBuyer.set(buyer, (marketUnitsByBuyer.get(buyer) ?? 0) + units);
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
  const settlementDiagnostics: NonNullable<TextileLedger["settlementDiagnostics"]> = {
    buyers: buyers.map(buyer => {
      const need =
        profile.populationLots > 0 ? (profile.monthlyDemand * buyer.populationLots) / profile.populationLots : 0;
      const supplied = consumptionByBuyer.get(buyer) ?? 0;
      const unmet = Math.max(0, need - supplied);
      const held = buyer.priorityAllocatedBudget ?? 0;
      const priorityGap = referencePrice ? Math.min(unmet, held / referencePrice) : 0;
      const budgetGap = referencePrice
        ? Math.min(unmet - priorityGap, Math.max(0, unmet - (Math.max(0, buyer.budget) + held) / referencePrice))
        : 0;
      const remaining = Math.max(0, unmet - priorityGap - budgetGap);
      const remainingStock = pricedGoods.reduce((sum, good) => sum + Math.max(0, market.goods[good.i].stock), 0);
      const stockGap = referencePrice ? Math.max(0, remaining - remainingStock) : 0;
      const constraints: NonNullable<TextileLedger["settlementDiagnostics"]>["buyers"][number]["constraints"] = [];
      if (unmet > 1e-12) {
        if (!referencePrice) constraints.push("noPricedRoute");
        else {
          if (held > 0) constraints.push("priority");
          if (buyer.budget < unmet * referencePrice) constraints.push("budget");
          if (remainingStock < unmet) constraints.push("stock");
          if (remaining - stockGap > 1e-12) constraints.push("allocationOrRounding");
        }
      }
      return {
        burgId: buyer.burgId,
        rural: buyer.rural,
        need,
        supplied,
        marketSupplied: marketUnitsByBuyer.get(buyer) ?? 0,
        marketPaid: paidByBuyer.get(buyer) ?? 0,
        remainingBudget: buyer.budget,
        priorityAllocatedBudget: held,
        unmet,
        priorityGap,
        budgetGap,
        stockGap,
        allocationOrRoundingGap: referencePrice ? remaining - stockGap : 0,
        constraints,
        noPricedRouteGap: referencePrice ? 0 : unmet
      };
    })
  };
  const ledger: TextileLedger = {
    ...(previous ?? emptyLedger(profile)),
    ...profile,
    householdConsumption: rn(consumed, 2),
    unmetDemand: rn(unmetDemand, 2),
    householdSpending: rn(spending, 2),
    ruralHomeProduction: homeProduction,
    commissionDeliveries: commissionProduction,
    cumulativeCommissionDeliveries: (previous?.cumulativeCommissionDeliveries ?? 0) + commissionProduction,
    cumulativeRuralHomeProduction: (previous?.cumulativeRuralHomeProduction ?? 0) + homeProduction,
    urbanConsumption: rn(consumed - ruralConsumption, 2),
    ruralConsumption: rn(ruralConsumption, 2),
    cumulativeHouseholdConsumption: rn((previous?.cumulativeHouseholdConsumption ?? 0) + consumed, 2),
    cumulativeUnmetDemand: rn((previous?.cumulativeUnmetDemand ?? 0) + unmetDemand, 2),
    cumulativeHouseholdSpending: rn((previous?.cumulativeHouseholdSpending ?? 0) + spending, 2)
  };
  setRuntimeOnly(ledger, "settlementDiagnostics", settlementDiagnostics);
  return ledger;
}

function textileSettlementRequest(market: Market) {
  const buyers = getTextileBuyers(market);
  const wardrobe = getMarketTextileDemandProfile(market.i);
  const garmentPrice = textilePrice(market, HOUSEHOLD_GARMENT_NAMES);
  const beddingBudgets = buyers.map(buyer => {
    const wardrobeNeed =
      wardrobe.populationLots > 0 ? (wardrobe.monthlyDemand * buyer.populationLots) / wardrobe.populationLots : 0;
    return getBeddingCashBudget(buyer.budget, wardrobeNeed, garmentPrice);
  });
  const bedding = getMarketBlanketDemandProfile(market.i);
  const rural = buyers.find(buyer => buyer.rural);
  const ruralIndex = buyers.findIndex(buyer => buyer.rural);
  const ruralShare = wardrobe.populationLots > 0 ? (rural?.populationLots ?? 0) / wardrobe.populationLots : 0;
  const wardrobeStock = getGoods()
    .filter(good => HOUSEHOLD_GARMENT_NAMES.has(good.name) && isGoodEnabled(good))
    .reduce((sum, good) => sum + Math.max(0, market.goods[good.i]?.stock ?? 0), 0);
  const blanket = getGoods().find(good => good.name === "Wool Blankets" && isGoodEnabled(good));
  const blanketStock = blanket ? Math.max(0, market.goods[blanket.i]?.stock ?? 0) : 0;
  const request: Parameters<typeof settleRuralTextileProduction> = [
    market,
    Math.max(0, wardrobe.monthlyDemand - Math.min(wardrobeStock, affordableFinishedDemand(market, false))) * ruralShare,
    Math.max(0, bedding.monthlyDemand - Math.min(blanketStock, affordableFinishedDemand(market, true))) * ruralShare,
    Math.max(0, (rural?.budget ?? 0) - (beddingBudgets[ruralIndex] ?? 0)),
    beddingBudgets[ruralIndex] ?? 0,
    {
      wardrobeNeed: wardrobe.monthlyDemand * ruralShare,
      wardrobePrice: garmentPrice,
      blanketNeed: bedding.monthlyDemand * ruralShare,
      blanketStock: blanketStock * ruralShare,
      blanketPrice: textilePrice(market, BLANKET_NAMES)
    }
  ];
  return { buyers, rural, ruralIndex, beddingBudgets, request };
}

export interface TextileMarketOrders {
  wardrobes: number;
  blankets: number;
  inputs: Readonly<Record<number, number>>;
}

/** One cash/labor-constrained rural plan, shared by finished and intermediate demand. No settlement. */
export function getTextileMarketOrders(market: Market): TextileMarketOrders {
  const { request, rural } = textileSettlementRequest(market);
  const home = estimateRuralTextileProduction(...request);
  const commission = estimateTextileCommissions(market, home, {
    ...request[5]!,
    budget: rural?.budget ?? 0,
    garmentNeed: request[1]
  });
  const delivered = {
    ...home,
    garments: home.garments + commission.garments,
    blankets: home.blankets + commission.blankets,
    garmentSpending: home.garmentSpending + commission.garmentSpending,
    blanketSpending: home.blanketSpending + commission.blanketSpending
  };
  const inputs = { ...home.inputOrders };
  for (const job of commission.jobs) inputs[job.inputGoodId] = (inputs[job.inputGoodId] ?? 0) + job.inputUnits;
  return {
    wardrobes: affordableFinishedDemand(market, false, delivered),
    blankets: affordableFinishedDemand(market, true, delivered),
    inputs
  };
}

export function getAffordableTextileDemand(market: Market, blankets: boolean): number {
  const orders = getTextileMarketOrders(market);
  return blankets ? orders.blankets : orders.wardrobes;
}

/** Settles paid wardrobes first and independent bedding second after manufacturing and trade. */
export function settleTextileHouseholdDemand(onCommissionLabor?: (burgId: number, points: number) => void): void {
  for (const market of getMarkets()) {
    const { buyers, rural, ruralIndex, beddingBudgets, request } = textileSettlementRequest(market);
    const openingBudgets = buyers.map(buyer => buyer.budget);
    const home = settleRuralTextileProduction(...request);
    market.ruralTextileProduction = home;
    const reservation = request[5]!;
    const commission = settleTextileCommissions(
      market,
      home,
      {
        ...reservation,
        budget: rural?.budget ?? 0,
        garmentNeed: request[1]
      },
      onCommissionLabor
    );
    if (rural) {
      beddingBudgets[ruralIndex] = Math.max(
        0,
        getBeddingCashBudget(
          rural.budget,
          reservation.wardrobeNeed,
          reservation.wardrobePrice,
          home.garments + commission.garments,
          home.garmentSpending + commission.garmentSpending
        ) -
          home.blanketSpending -
          commission.blanketSpending
      );
      rural.budget = Math.max(
        0,
        rural.budget -
          home.garmentSpending -
          home.blanketSpending -
          commission.garmentSpending -
          commission.blanketSpending
      );
    }
    market.textileLedger = settleHouseholdTextiles(
      market,
      buyers,
      HOUSEHOLD_GARMENT_NAMES,
      getMarketTextileDemandProfile(market.i),
      market.textileLedger,
      home.garments,
      home.garmentSpending,
      commission.garments,
      commission.garmentSpending
    );
    for (const [index, buyer] of buyers.entries()) {
      const allowed = Math.min(buyer.budget, beddingBudgets[index]);
      buyer.priorityAllocatedBudget = Math.max(
        0,
        openingBudgets[index] - allowed - (buyer.rural ? home.blanketSpending + commission.blanketSpending : 0)
      );
      buyer.budget = allowed;
    }
    market.blanketLedger = settleHouseholdTextiles(
      market,
      buyers,
      BLANKET_NAMES,
      getMarketBlanketDemandProfile(market.i),
      market.blanketLedger,
      home.blankets,
      home.blanketSpending,
      commission.blankets,
      commission.blanketSpending
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
