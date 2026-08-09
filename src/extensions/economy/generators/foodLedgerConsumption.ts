import type { Burg } from "../../hostTypes";
import { minmax, rn } from "../../hostUtils";
import {
  getMarketCellColumn,
  getMarkets,
  getRuralHouseholdFoodStock,
  getSimulationMonth,
  getWorldContext
} from "../economyContext";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { BURG_TARGET_RESERVE_DAYS, getStapleFoodGood } from "./foodProduction";
import { getTemporaryLodgerPopulationPointsByBurg } from "./innStays";
import type { FoodLedger, Market } from "./marketTypes";

const STRESS_THRESHOLD = 0.05;
const SEVERE_DEFICIT_THRESHOLD = 0.1;
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
  let remaining = amount;

  const fromAge2 = Math.min(ledger.foodStockAge2, remaining);
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
  const target = getBurgDailyNeed(burg, populationRate, urbanization) * BURG_TARGET_RESERVE_DAYS;
  const shortfall = Math.max(0, target - (burg.foodReserve ?? 0));
  if (shortfall <= 0) return;
  const drawn = drawFromLedgerFifo(ledger, shortfall);
  burg.foodReserve = rn((burg.foodReserve ?? 0) + drawn, 2);
}

/** Draws a burg's monthly urban need from its own reserve first, then the market pool for any shortfall. */
function drawBurgMonthlyNeed(
  burg: Burg,
  ledger: FoodLedger,
  monthlyNeed: number
): { satisfied: number; needed: number } {
  const fromReserve = Math.min(burg.foodReserve ?? 0, monthlyNeed);
  burg.foodReserve = rn((burg.foodReserve ?? 0) - fromReserve, 2);
  const stillNeeded = monthlyNeed - fromReserve;
  const fromMarket = stillNeeded > 0 ? drawFromLedgerFifo(ledger, stillNeeded) : 0;
  return { satisfied: rn(fromReserve + fromMarket, 2), needed: rn(monthlyNeed, 2) };
}

/** Temporary inn guests buy from the market directly; they do not draw a burg household reserve. */
function drawTemporaryLodgerMonthlyNeed(
  ledger: FoodLedger,
  monthlyNeed: number
): { satisfied: number; needed: number } {
  return { satisfied: drawFromLedgerFifo(ledger, monthlyNeed), needed: rn(monthlyNeed, 2) };
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
): { satisfied: number; needed: number } {
  const worldContext = getWorldContext();
  const { cells } = worldContext.pack;
  const householdStock = getRuralHouseholdFoodStock();
  const marketCellColumn = getMarketCellColumn();
  const hasHouseholdStock = householdStock.length === cells.i.length;
  let satisfied = 0;
  let needed = 0;

  for (const cellId of cells.i) {
    if (marketCellColumn[cellId] !== marketId || cells.h[cellId] < 20) continue;
    const monthlyNeed = (Math.max(0, cells.pop[cellId] ?? 0) * populationRate * GROSS_FOOD_NEED) / 12;
    needed += monthlyNeed;

    const hasCellHouseholdStock = hasHouseholdStock && cellId >= 0 && cellId < householdStock.length;
    const fromHousehold = hasCellHouseholdStock ? Math.min(Math.max(0, householdStock[cellId] ?? 0), monthlyNeed) : 0;
    if (hasCellHouseholdStock) householdStock[cellId] = rn(Math.max(0, householdStock[cellId] - fromHousehold), 2);
    const fromMarket = drawFromLedgerFifo(ledger, monthlyNeed - fromHousehold);
    satisfied += fromHousehold + fromMarket;
  }

  return { satisfied: rn(satisfied, 2), needed: rn(needed, 2) };
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
 * Monthly Food Ledger settlement: tops up each burg's local reserve, settles rural household
 * provisions before Market fallback, prices Grain, and routes urban retail revenue to the market's treasury.
 * Called once per month from the "production.settle" command, after `Production.produce()`.
 */
export function settleMonthlyFoodConsumption(): void {
  const worldContext = getWorldContext();
  const { pack } = worldContext;
  if (!pack.burgs) return;

  const populationRate = worldContext.populationRate ?? 1000;
  const urbanization = worldContext.urbanization ?? 1;
  const temporaryLodgersByBurg = getTemporaryLodgerPopulationPointsByBurg();
  const stapleFoodGood = getStapleFoodGood();
  const simulationMonth = getSimulationMonth();
  const isQuarterEnd = simulationMonth % 3 === 0;

  for (const market of getMarkets()) {
    const ledger = market.foodLedger;
    if (!ledger) continue;

    const marketBurgs = pack.burgs.filter(b => b.i && !b.removed && b.market === market.i);
    for (const burg of marketBurgs) topUpBurgFoodReserve(burg, ledger, populationRate, urbanization);

    const ruralSettlement = drawRuralMonthlyNeed(market.i, ledger, populationRate);
    const ruralMonthlyNeed = ruralSettlement.needed;
    const ruralDrawn = ruralSettlement.satisfied;

    let urbanMonthlyNeed = 0;
    let urbanDrawn = 0;
    let urbanRevenue = 0;
    const retailPrice = settleGrainPrice(ledger, marketBurgs, temporaryLodgersByBurg, populationRate, urbanization);

    for (const burg of marketBurgs) {
      const burgId = burg.i ?? 0;
      const monthlyNeed = getBurgDailyNeed(burg, populationRate, urbanization) * (DAYS_PER_YEAR / 12);
      const { satisfied, needed } = drawBurgMonthlyNeed(burg, ledger, monthlyNeed);
      urbanMonthlyNeed += needed;
      urbanDrawn += satisfied;
      urbanRevenue += satisfied * retailPrice;

      const temporaryMonthlyNeed =
        getTemporaryLodgerDailyNeed(temporaryLodgersByBurg.get(burgId) ?? 0, populationRate, urbanization) *
        (DAYS_PER_YEAR / 12);
      const temporaryDraw = drawTemporaryLodgerMonthlyNeed(ledger, temporaryMonthlyNeed);
      urbanMonthlyNeed += temporaryDraw.needed;
      urbanDrawn += temporaryDraw.satisfied;
      urbanRevenue += temporaryDraw.satisfied * retailPrice;
    }
    urbanMonthlyNeed = rn(urbanMonthlyNeed, 2);
    urbanDrawn = rn(urbanDrawn, 2);

    settleUrbanRevenue(market, urbanRevenue);

    if (isQuarterEnd) {
      const totalUnmetNeed = Math.max(0, ruralMonthlyNeed - ruralDrawn) + Math.max(0, urbanMonthlyNeed - urbanDrawn);
      const totalNeed = ruralMonthlyNeed + urbanMonthlyNeed;
      if (totalNeed > 0 && totalUnmetNeed > 0) {
        const commonShortfallRate = minmax(totalUnmetNeed / totalNeed, 0, 1);
        const jitter = getShortfallJitter(market.i, simulationMonth);
        const ruralShortfallRate = minmax(commonShortfallRate * jitter, 0, 1);
        const ruralUnmet = ruralMonthlyNeed * ruralShortfallRate;
        const urbanShortfallRate =
          urbanMonthlyNeed > 0 ? minmax((totalUnmetNeed - ruralUnmet) / urbanMonthlyNeed, 0, 1) : 0;
        updateStressCounters(ledger, ruralShortfallRate, urbanShortfallRate);
      } else {
        updateStressCounters(ledger, 0, 0);
      }
    }

    if (stapleFoodGood) {
      const marketGood = market.goods[stapleFoodGood.i] ?? { stock: 0, price: retailPrice };
      marketGood.price = rn(retailPrice, 2);
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
  urbanization: number
): number {
  const stapleFoodGood = getStapleFoodGood();
  const basePrice = stapleFoodGood?.value ?? 1;
  const currentStock = ledger.foodStockAge0 + ledger.foodStockAge1 + ledger.foodStockAge2;

  const urbanPopulation = marketBurgs.reduce(
    (sum, burg) =>
      sum + ((burg.population ?? 0) + (temporaryLodgersByBurg.get(burg.i ?? 0) ?? 0)) * populationRate * urbanization,
    0
  );
  // Rural households have their own cell-level provisions. Market price is
  // driven by the demand that normally buys from the Market: burgs and lodgers.
  const annualDemand = urbanPopulation * GROSS_FOOD_NEED;
  const positionInQuarter = ((getSimulationMonth() - 1) % 3) + 1; // 1, 2, or 3
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
  const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };

  const repayment = Math.min(treasury.ruralGrainPayable, revenue);
  treasury.ruralGrainPayable = rn(treasury.ruralGrainPayable - repayment, 2);
  treasury.balance = rn(treasury.balance + (revenue - repayment), 2);
  market.marketTreasury = treasury;
}
