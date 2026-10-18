import type { Burg } from "../../hostTypes";
import { minmax, rn } from "../../hostUtils";
import {
  getMarketCellColumn,
  getMarkets,
  getRuralFoodCapacity,
  getRuralHouseholdFoodStock,
  getSimulationMonth,
  getWorldContext
} from "../economyContext";
import { debitHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { BURG_TARGET_RESERVE_DAYS, getStapleFoodGood } from "./foodProduction";
import { creditRuralHouseholdWealth, debitRuralHouseholdWealth } from "./householdWealth";
import { getTemporaryLodgerPopulationPointsByBurg } from "./innStays";
import type { FoodLedger, Market } from "./marketTypes";
import { getGranaryReserveMultiplier } from "./publicWorks";
import { getRuralGrainDietShare } from "./ruralDiet";
import { drawStapleCropFood } from "./stapleCropInventory";

const STRESS_THRESHOLD = 0.05;
const SEVERE_DEFICIT_THRESHOLD = 0.1;
/**
 * Consecutive severe-deficit quarters before foodSecurity drops into the famine-death
 * band. One bad quarter only cuts births; two in a row can start killing.
 * Keep in lockstep with the 2-quarter gate described in economy-coupling-audit.md L3.
 */
const SEVERE_DEFICIT_QUARTERS_BEFORE_DEATH = 2;
/**
 * Host demography (`demography-simulator.ts` FOOD_FAMINE_DEATH_THRESHOLD) applies
 * famine deaths only below this foodSecurity. Keep the two constants in lockstep.
 */
export const URBAN_FOOD_FAMINE_DEATH_BAND = 0.85;
const PRICE_FLOOR = 0.8;
const PRICE_CEILING = 2.0;
const SHORTFALL_JITTER_MIN = 0.8;
const SHORTFALL_JITTER_SPAN = 0.4;
const DAYS_PER_YEAR = 365.2425;

function dailyNeedPerPerson(): number {
  return GROSS_FOOD_NEED / DAYS_PER_YEAR;
}

/** Deterministic per-market/quarter jitter in [0.8, 1.2), seeded from market id and calendar month. */
function getShortfallJitter(marketId: number, month: number): number {
  const seed = Math.sin(marketId * 12.9898 + month * 78.233) * 43758.5453;
  const fraction = seed - Math.floor(seed);
  return SHORTFALL_JITTER_MIN + fraction * SHORTFALL_JITTER_SPAN;
}

/** Draws up to `amount` from the ledger's stock, oldest bucket first. Returns the amount actually drawn. */
function drawFromLedgerFifo(ledger: FoodLedger, amount: number): number {
  if (amount <= 0) return 0;
  if (ledger.stapleCropInventories && Object.keys(ledger.stapleCropInventories).length) {
    return drawStapleCropFood(ledger, amount);
  }
  let remaining = amount;

  const fromAge3 = Math.min(ledger.foodStockAge3 ?? 0, remaining);
  ledger.foodStockAge3 = rn((ledger.foodStockAge3 ?? 0) - fromAge3, 2);
  remaining -= fromAge3;

  const fromAge2 = remaining > 0 ? Math.min(ledger.foodStockAge2, remaining) : 0;
  ledger.foodStockAge2 = rn(ledger.foodStockAge2 - fromAge2, 2);
  remaining -= fromAge2;

  const fromAge1 = remaining > 0 ? Math.min(ledger.foodStockAge1, remaining) : 0;
  ledger.foodStockAge1 = rn(ledger.foodStockAge1 - fromAge1, 2);
  remaining -= fromAge1;

  const fromAge0 = remaining > 0 ? Math.min(ledger.foodStockAge0, remaining) : 0;
  ledger.foodStockAge0 = rn(ledger.foodStockAge0 - fromAge0, 2);
  remaining -= fromAge0;

  return rn(amount - remaining, 2);
}

function getBurgDailyNeed(burg: Burg, populationRate: number, urbanization: number): number {
  return (burg.population ?? 0) * populationRate * urbanization * dailyNeedPerPerson();
}

function getTemporaryLodgerDailyNeed(populationPoints: number, populationRate: number, urbanization: number): number {
  return Math.max(0, populationPoints) * populationRate * urbanization * dailyNeedPerPerson();
}

/** Tops up a burg's small local reserve from the market pool, capped by what the market can spare. */
function topUpBurgFoodReserve(burg: Burg, ledger: FoodLedger, populationRate: number, urbanization: number): void {
  // A state-funded public granary deepens the buffer this burg tries to hold, which is what makes
  // the Public Works budget matter to the L3 famine loop (economy-coupling-audit.md L8 stage 2).
  const target =
    getBurgDailyNeed(burg, populationRate, urbanization) * BURG_TARGET_RESERVE_DAYS * getGranaryReserveMultiplier(burg);
  const shortfall = Math.max(0, target - (burg.foodReserve ?? 0));
  if (shortfall <= 0) return;
  const drawn = drawFromLedgerFifo(ledger, shortfall);
  burg.foodReserve = rn((burg.foodReserve ?? 0) + drawn, 2);
}

/**
 * Draws a burg's monthly urban need from its own reserve first, then the market pool for any
 * shortfall — capped by `maxAffordableUnits` (docs/plan/economy-coupling-audit.md L2 Phase 2/3):
 * a population whose household wallet cannot cover this month's retail bill simply does not eat
 * the rest, physical stock notwithstanding. That shortfall then reads exactly like any other
 * unmet urban need to `updateStressCounters`/`computeUrbanFoodSecurity` below — no separate L3
 * wiring needed, an empty purse already becomes a food-stress quarter.
 */
function drawBurgMonthlyNeed(
  burg: Burg,
  ledger: FoodLedger,
  monthlyNeed: number,
  maxAffordableUnits: number
): { satisfied: number; needed: number } {
  const affordableNeed = Math.max(0, Math.min(monthlyNeed, maxAffordableUnits));
  const fromReserve = Math.min(burg.foodReserve ?? 0, affordableNeed);
  burg.foodReserve = rn((burg.foodReserve ?? 0) - fromReserve, 2);
  const stillNeeded = affordableNeed - fromReserve;
  const fromMarket = stillNeeded > 0 ? drawFromLedgerFifo(ledger, stillNeeded) : 0;
  return {
    satisfied: rn(fromReserve + fromMarket, 2),
    needed: rn(monthlyNeed, 2)
  };
}

/** Temporary inn guests buy from the market directly; they do not draw a burg household reserve. */
function drawTemporaryLodgerMonthlyNeed(
  ledger: FoodLedger,
  monthlyNeed: number
): { satisfied: number; needed: number } {
  return {
    satisfied: drawFromLedgerFifo(ledger, monthlyNeed),
    needed: rn(monthlyNeed, 2)
  };
}

/**
 * Rural residents consume their cell's aggregate household provisions first.
 * Only the part their larder cannot cover is drawn from the Market's common
 * food ledger, preserving that ledger as a fallback rather than a compulsory
 * intermediary for every farm family's harvest.
 */
function drawRuralMonthlyNeed(
  marketId: number,
  ledger: FoodLedger,
  populationRate: number
): { satisfied: number; needed: number; fromMarket: number } {
  const worldContext = getWorldContext();
  const { cells } = worldContext.pack;
  const householdStock = getRuralHouseholdFoodStock();
  const marketCellColumn = getMarketCellColumn();
  const hasHouseholdStock = householdStock.length === cells.i.length;
  const ruralFoodCapacity = getRuralFoodCapacity();
  let satisfied = 0;
  let needed = 0;
  let boughtFromMarket = 0;

  for (const cellId of cells.i) {
    if (marketCellColumn[cellId] !== marketId || cells.h[cellId] < 20) continue;
    // Grain only: fishing and herding households eat part of their own produce
    // (docs/plan/rural-food-labor-audit.md, problem A).
    const monthlyNeed =
      (Math.max(0, cells.pop[cellId] ?? 0) *
        populationRate *
        GROSS_FOOD_NEED *
        getRuralGrainDietShare(cells, cellId, ruralFoodCapacity)) /
      12;
    needed += monthlyNeed;

    const hasCellHouseholdStock = hasHouseholdStock && cellId >= 0 && cellId < householdStock.length;
    const fromHousehold = hasCellHouseholdStock ? Math.min(Math.max(0, householdStock[cellId] ?? 0), monthlyNeed) : 0;
    if (hasCellHouseholdStock) householdStock[cellId] = rn(Math.max(0, householdStock[cellId] - fromHousehold), 2);
    const fromMarket = drawFromLedgerFifo(ledger, monthlyNeed - fromHousehold);
    satisfied += fromHousehold + fromMarket;
    boughtFromMarket += fromMarket;
  }

  return {
    satisfied: rn(satisfied, 2),
    needed: rn(needed, 2),
    fromMarket: rn(boughtFromMarket, 2)
  };
}

function updateStressCounters(ledger: FoodLedger, ruralShortfallRate: number, urbanShortfallRate: number): void {
  ledger.ruralFoodStressQuarters = ruralShortfallRate >= STRESS_THRESHOLD ? ledger.ruralFoodStressQuarters + 1 : 0;
  ledger.urbanFoodStressQuarters = urbanShortfallRate >= STRESS_THRESHOLD ? ledger.urbanFoodStressQuarters + 1 : 0;
  ledger.ruralSevereDeficitQuarters =
    ruralShortfallRate >= SEVERE_DEFICIT_THRESHOLD ? ledger.ruralSevereDeficitQuarters + 1 : 0;
  ledger.urbanSevereDeficitQuarters =
    urbanShortfallRate >= SEVERE_DEFICIT_THRESHOLD ? ledger.urbanSevereDeficitQuarters + 1 : 0;
}

/**
 * Maps this quarter's urban shortfall and consecutive severe-deficit streak onto
 * Burg.foodSecurity (0 = famine, 1 = fully fed). Duration gating lives here so
 * the host only reads a 0..1 field:
 * - 0–1 consecutive severe quarters: foodSecurity stays at or above
 *   URBAN_FOOD_FAMINE_DEATH_BAND, so demography reduces births but not deaths.
 * - 2+ consecutive severe quarters: foodSecurity drops below that band and
 *   demography applies famine mortality. Intensity deepens toward 0 over ~5
 *   quarters of total shortfall so a single empty granary does not erase a city.
 */
export function computeUrbanFoodSecurity(urbanShortfallRate: number, urbanSevereDeficitQuarters: number): number {
  const shortfall = minmax(urbanShortfallRate, 0, 1);
  if (shortfall <= 0) return 1;

  if (urbanSevereDeficitQuarters < SEVERE_DEFICIT_QUARTERS_BEFORE_DEATH) {
    return rn(1 - shortfall * (1 - URBAN_FOOD_FAMINE_DEATH_BAND), 4);
  }

  const durationFactor = minmax((urbanSevereDeficitQuarters - 1) / 4, 0.25, 1);
  const belowBand = URBAN_FOOD_FAMINE_DEATH_BAND * shortfall * durationFactor;
  return rn(minmax(URBAN_FOOD_FAMINE_DEATH_BAND - belowBand, 0, URBAN_FOOD_FAMINE_DEATH_BAND), 4);
}

/**
 * Monthly Food Ledger settlement: tops up each burg's local reserve, settles rural household
 * provisions before Market fallback, prices Grain, routes urban retail revenue to the market's treasury,
 * and writes `burg.foodSecurity` at quarter-end for host demography (economy-coupling-audit.md L3).
 * Called once per month from the "production.settle" command, after `Production.produce()`.
 */
export function settleMonthlyFoodConsumption(settlementMonth = getSimulationMonth()): void {
  const worldContext = getWorldContext();
  const { pack } = worldContext;
  if (!pack.burgs) return;

  const populationRate = worldContext.populationRate ?? 1000;
  const urbanization = worldContext.urbanization ?? 1;
  const temporaryLodgersByBurg = getTemporaryLodgerPopulationPointsByBurg();
  const stapleFoodGood = getStapleFoodGood();
  const isQuarterEnd = settlementMonth % 3 === 0;

  for (const market of getMarkets()) {
    const ledger = market.foodLedger;
    if (!ledger) continue;

    const marketBurgs = pack.burgs.filter(b => b.i && !b.removed && b.market === market.i);
    for (const burg of marketBurgs) topUpBurgFoodReserve(burg, ledger, populationRate, urbanization);

    const ruralSettlement = drawRuralMonthlyNeed(market.i, ledger, populationRate);
    ledger.ruralMarketDraw = rn((ledger.ruralMarketDraw ?? 0) * (11 / 12) + ruralSettlement.fromMarket, 2);
    const ruralMonthlyNeed = ruralSettlement.needed;
    const ruralDrawn = ruralSettlement.satisfied;

    let urbanMonthlyNeed = 0;
    let urbanDrawn = 0;
    let urbanRevenue = 0;
    const retailPrice = settleGrainPrice(
      ledger,
      marketBurgs,
      temporaryLodgersByBurg,
      populationRate,
      urbanization,
      settlementMonth
    );

    for (const burg of marketBurgs) {
      const burgId = burg.i ?? 0;
      const monthlyNeed = getBurgDailyNeed(burg, populationRate, urbanization) * (DAYS_PER_YEAR / 12);
      // L2 Phase 2/3: residents pay for their own food out of their own wallet, capped by what it
      // holds (docs/plan/economy-coupling-audit.md).
      const affordableUnits = retailPrice > 0 ? getHouseholdWealth(burgId) / retailPrice : monthlyNeed;
      const { satisfied, needed } = drawBurgMonthlyNeed(burg, ledger, monthlyNeed, affordableUnits);
      urbanMonthlyNeed += needed;
      urbanDrawn += satisfied;
      urbanRevenue += debitHouseholdWealth(burgId, rn(satisfied * retailPrice, 2));

      const temporaryMonthlyNeed =
        getTemporaryLodgerDailyNeed(temporaryLodgersByBurg.get(burgId) ?? 0, populationRate, urbanization) *
        (DAYS_PER_YEAR / 12);
      const temporaryDraw = drawTemporaryLodgerMonthlyNeed(ledger, temporaryMonthlyNeed);
      urbanMonthlyNeed += temporaryDraw.needed;
      urbanDrawn += temporaryDraw.satisfied;
      // Lodgers are mostly people of the surrounding countryside in town for the market, carting or
      // a pilgrimage: their meals are paid from the market's rural purse, as far as it holds. They
      // used to be paid with money from nowhere (docs/plan/initial-wealth-calibration.md §8).
      urbanRevenue += debitRuralHouseholdWealth(market, rn(temporaryDraw.satisfied * retailPrice, 2));
    }
    // Farm families whose own larder ran out buy the rest from the market, as far as their purse
    // allows (docs/plan/initial-wealth-calibration.md §5.2). What they cannot pay is still supplied,
    // as before; only the paid part reaches the market and repays its farmgate debt.
    urbanRevenue += debitRuralHouseholdWealth(market, rn(ruralSettlement.fromMarket * retailPrice, 2));
    urbanMonthlyNeed = rn(urbanMonthlyNeed, 2);
    urbanDrawn = rn(urbanDrawn, 2);

    settleUrbanRevenue(market, urbanRevenue);

    // exportable is a current surplus, not a quarterly snapshot. Monthly
    // household consumption must reduce it before Goods Editor or Trade reads it.
    const remainingStock = Math.max(
      0,
      ledger.foodStockAge0 + ledger.foodStockAge1 + ledger.foodStockAge2 + (ledger.foodStockAge3 ?? 0)
    );
    // The market keeps back its demand until the next harvest (docs/plan/grain-storage-life.md §3.5).
    const exportReserve = Math.max(Math.max(0, ledger.urbanNeed), ledger.exportReserve ?? 0);
    ledger.exportable = rn(Math.max(0, remainingStock - exportReserve), 2);

    if (isQuarterEnd) {
      const totalUnmetNeed = Math.max(0, ruralMonthlyNeed - ruralDrawn) + Math.max(0, urbanMonthlyNeed - urbanDrawn);
      const totalNeed = ruralMonthlyNeed + urbanMonthlyNeed;
      let ruralShortfallRate = 0;
      let urbanShortfallRate = 0;
      if (totalNeed > 0 && totalUnmetNeed > 0) {
        const commonShortfallRate = minmax(totalUnmetNeed / totalNeed, 0, 1);
        const jitter = getShortfallJitter(market.i, settlementMonth);
        ruralShortfallRate = minmax(commonShortfallRate * jitter, 0, 1);
        const ruralUnmet = ruralMonthlyNeed * ruralShortfallRate;
        urbanShortfallRate = urbanMonthlyNeed > 0 ? minmax((totalUnmetNeed - ruralUnmet) / urbanMonthlyNeed, 0, 1) : 0;
      }
      updateStressCounters(ledger, ruralShortfallRate, urbanShortfallRate);
      const foodSecurity = computeUrbanFoodSecurity(urbanShortfallRate, ledger.urbanSevereDeficitQuarters);
      for (const burg of marketBurgs) burg.foodSecurity = foodSecurity;
    }

    if (stapleFoodGood) {
      const marketGood = market.goods[stapleFoodGood.i] ?? {
        stock: 0,
        price: retailPrice
      };
      marketGood.price = rn(retailPrice, 2);
      marketGood.stock = rn(ledger.exportable, 2);
      market.goods[stapleFoodGood.i] = marketGood;
    }
  }
}

/**
 * Grain retail price from remaining-quarter coverage: current stock plus this quarter's expected
 * remaining local production, against this quarter's expected remaining demand. No FoodShipment
 * in-transit term yet — cross-market trade in this milestone stays on the interim capacity-only
 * resolver in `foodImportNetwork.ts`.
 */
function settleGrainPrice(
  ledger: FoodLedger,
  marketBurgs: Burg[],
  temporaryLodgersByBurg: ReadonlyMap<number, number>,
  populationRate: number,
  urbanization: number,
  simulationMonth: number
): number {
  const stapleFoodGood = getStapleFoodGood();
  const basePrice = stapleFoodGood?.value ?? 1;
  const currentStock = ledger.foodStockAge0 + ledger.foodStockAge1 + ledger.foodStockAge2 + (ledger.foodStockAge3 ?? 0);

  const urbanPopulation = marketBurgs.reduce(
    (sum, burg) =>
      sum + ((burg.population ?? 0) + (temporaryLodgersByBurg.get(burg.i ?? 0) ?? 0)) * populationRate * urbanization,
    0
  );
  // Rural households have their own cell-level provisions. Market price is
  // driven by the demand that buys from the Market: burgs, lodgers and farm buy-back.
  // Farm families buying back once their larders run out draw on the same stock
  // (docs/plan/craft-wage-subsistence-scale.md §11).
  const annualDemand = urbanPopulation * GROSS_FOOD_NEED + Math.max(0, ledger.ruralMarketDraw ?? 0);
  const positionInQuarter = ((simulationMonth - 1) % 3) + 1; // 1, 2, or 3
  const monthsRemainingInQuarter = 4 - positionInQuarter; // includes the current month
  const expectedRemainingDemand = (annualDemand / 12) * monthsRemainingInQuarter;
  // This quarter's production already landed at the quarter boundary (see foodProduction.ts),
  // so "expected remaining production" for the months left in the quarter is 0 — next quarter's
  // harvest is not yet confirmed and must not be counted as supply.
  const expectedSupply = currentStock;

  const coverageRatio = expectedRemainingDemand > 0 ? expectedSupply / expectedRemainingDemand : 1;
  const priceMultiplier = coverageRatio > 0 ? minmax(1 / coverageRatio, PRICE_FLOOR, PRICE_CEILING) : PRICE_CEILING;
  return rn(basePrice * priceMultiplier, 2);
}

/** Urban retail revenue repays outstanding rural debt first, remainder becomes merchant capital. */
function settleUrbanRevenue(market: Market, revenue: number): void {
  if (revenue <= 0) return;
  const treasury = market.marketTreasury ?? {
    balance: 0,
    ruralGrainPayable: 0
  };

  const repayment = Math.min(treasury.ruralGrainPayable, revenue);
  treasury.ruralGrainPayable = rn(treasury.ruralGrainPayable - repayment, 2);
  treasury.balance = rn(treasury.balance + (revenue - repayment), 2);
  market.marketTreasury = treasury;

  // L2 Phase 2: repaying the rural IOU is the deferred half of the farmgate payment finally
  // reaching farmers' own wallet (docs/plan/economy-coupling-audit.md).
  creditRuralHouseholdWealth(market, repayment);
}
