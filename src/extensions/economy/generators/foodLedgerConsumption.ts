import { pow } from "../../../simulation/deterministicMath";
import { getMarketSettings, isGrainRepaymentMonth } from "../../../simulation/marketSettings";
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
import { recordCountrysideFlow } from "./approachLedger";
import { debitHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
import { getMarketPriceLevel } from "./currencySufficiency";
import { syncStapleCropMarketRows } from "./foodCoLoad";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { BURG_TARGET_RESERVE_DAYS, emptyFoodLedger, getStapleFoodGood } from "./foodProduction";
import { getHarvestBridgeReserve } from "./grainStorage";
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
/** Months of demand kept back before the first full year of farmers' offers is known. */
const BRIDGE_FLOOR_MONTHS = 3;
/**
 * King's law (Davenant 1699, 1690s England): harvest shortfall -> price relative to a normal year
 * (docs/plan/staple-price-harvest-coverage.md §3.2).
 */
const KING_LAW: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.1, 1.3],
  [0.2, 1.8],
  [0.3, 2.6],
  [0.4, 3.8],
  [0.5, 5.5]
];

function kingLawMultiplier(shortfall: number): number {
  for (let i = 1; i < KING_LAW.length; i++) {
    const [s1, p1] = KING_LAW[i];
    if (shortfall <= s1) {
      const [s0, p0] = KING_LAW[i - 1];
      return p0 + ((p1 - p0) * (shortfall - s0)) / (s1 - s0);
    }
  }
  const [sa, pa] = KING_LAW[KING_LAW.length - 2];
  const [sb, pb] = KING_LAW[KING_LAW.length - 1];
  return pb + ((pb - pa) * (shortfall - sb)) / (sb - sa);
}

/** Staple price multiple for stock / (demand until the next harvest + normal carry-over). */
export function getStaplePriceMultiplier(coverage: number): number {
  const { staplePriceCeiling, staplePriceFloor, stapleSurplusElasticity } = getMarketSettings();
  if (!(coverage > 0)) return staplePriceCeiling;
  const multiplier =
    coverage < 1 ? kingLawMultiplier(1 - coverage) : pow(coverage, -1 / Math.abs(stapleSurplusElasticity));
  return minmax(multiplier, staplePriceFloor, staplePriceCeiling);
}
const DAYS_PER_YEAR = 365.2425;

function dailyNeedPerPerson(): number {
  return GROSS_FOOD_NEED / DAYS_PER_YEAR;
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
    // A market founded between monthly cycles must settle its residents before production.
    // Keep existing cell/burg provisions and wallets; never run initial-world bootstrap here.
    market.foodLedger ??= emptyFoodLedger();
    const ledger = market.foodLedger;

    const marketBurgs = pack.burgs.filter(b => b.i && !b.removed && b.market === market.i);
    for (const burg of marketBurgs) topUpBurgFoodReserve(burg, ledger, populationRate, urbanization);

    const ruralSettlement = drawRuralMonthlyNeed(market.i, ledger, populationRate);
    ledger.ruralMarketDraw = rn((ledger.ruralMarketDraw ?? 0) * (11 / 12) + ruralSettlement.fromMarket, 2);
    const ruralMonthlyNeed = ruralSettlement.needed;
    const ruralDrawn = ruralSettlement.satisfied;

    let urbanMonthlyNeed = 0;
    let urbanDrawn = 0;
    let urbanRevenue = 0;
    const observation = {
      month: settlementMonth,
      ruralNeed: ruralMonthlyNeed,
      ruralSupplied: ruralDrawn,
      ruralFromHousehold: rn(ruralDrawn - ruralSettlement.fromMarket, 2),
      ruralFromMarket: ruralSettlement.fromMarket,
      ruralPaid: 0,
      urbanNeed: 0,
      urbanSupplied: 0,
      urbanPaid: 0,
      urbanBudgetGap: 0,
      urbanStockGap: 0,
      lodgerNeed: 0,
      lodgerSupplied: 0,
      lodgerPaid: 0
    };
    const retailPrice = settleGrainPrice(
      ledger,
      marketBurgs,
      temporaryLodgersByBurg,
      populationRate,
      urbanization,
      settlementMonth,
      getMarketPriceLevel(market)
    );

    for (const burg of marketBurgs) {
      const burgId = burg.i ?? 0;
      const monthlyNeed = getBurgDailyNeed(burg, populationRate, urbanization) * (DAYS_PER_YEAR / 12);
      // L2 Phase 2/3: residents pay for their own food out of their own wallet, capped by what it
      // holds (docs/plan/economy-coupling-audit.md).
      const affordableUnits = retailPrice > 0 ? getHouseholdWealth(burgId) / retailPrice : monthlyNeed;
      const { satisfied, needed } = drawBurgMonthlyNeed(burg, ledger, monthlyNeed, affordableUnits);
      recordCountrysideFlow(market.i, burgId, stapleFoodGood?.i, satisfied, "inbound");
      urbanMonthlyNeed += needed;
      urbanDrawn += satisfied;
      const paid = debitHouseholdWealth(burgId, rn(satisfied * retailPrice, 2));
      urbanRevenue += paid;
      observation.urbanNeed += needed;
      observation.urbanSupplied += satisfied;
      observation.urbanPaid += paid;
      const budgetGap = Math.min(needed, Math.max(0, rn(needed - affordableUnits, 2)));
      observation.urbanBudgetGap += budgetGap;
      observation.urbanStockGap += Math.max(0, rn(needed - satisfied - budgetGap, 2));

      const temporaryMonthlyNeed =
        getTemporaryLodgerDailyNeed(temporaryLodgersByBurg.get(burgId) ?? 0, populationRate, urbanization) *
        (DAYS_PER_YEAR / 12);
      const temporaryDraw = drawTemporaryLodgerMonthlyNeed(ledger, temporaryMonthlyNeed);
      urbanMonthlyNeed += temporaryDraw.needed;
      urbanDrawn += temporaryDraw.satisfied;
      // Lodgers are mostly people of the surrounding countryside in town for the market, carting or
      // a pilgrimage: their meals are paid from the market's rural purse, as far as it holds. They
      // used to be paid with money from nowhere (docs/plan/initial-wealth-calibration.md §8).
      const lodgerPaid = debitRuralHouseholdWealth(market, rn(temporaryDraw.satisfied * retailPrice, 2));
      urbanRevenue += lodgerPaid;
      observation.lodgerNeed += temporaryDraw.needed;
      observation.lodgerSupplied += temporaryDraw.satisfied;
      observation.lodgerPaid += lodgerPaid;
    }
    // Farm families whose own larder ran out buy the rest from the market, as far as their purse
    // allows (docs/plan/initial-wealth-calibration.md §5.2). What they cannot pay is still supplied,
    // as before; only the paid part reaches the market and repays its farmgate debt.
    observation.ruralPaid = debitRuralHouseholdWealth(market, rn(ruralSettlement.fromMarket * retailPrice, 2));
    urbanRevenue += observation.ruralPaid;
    ledger.monthlyConsumption = observation;
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
      // Each sector's own unmet share of what it actually drew this month. Splitting the combined
      // shortfall evenly used to record rural stress while every farm family had eaten, and moved the
      // towns' purse-limited shortfall onto them (docs/plan/farm-labour-calibration.md §10.3).
      const ruralShortfallRate =
        ruralMonthlyNeed > 0 ? minmax((ruralMonthlyNeed - ruralDrawn) / ruralMonthlyNeed, 0, 1) : 0;
      const urbanShortfallRate =
        urbanMonthlyNeed > 0 ? minmax((urbanMonthlyNeed - urbanDrawn) / urbanMonthlyNeed, 0, 1) : 0;
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
      syncStapleCropMarketRows(market, marketGood.price, stapleFoodGood.value);
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
  simulationMonth: number,
  priceLevel = 1
): number {
  const stapleFoodGood = getStapleFoodGood();
  // The staple's base price follows the money-supply price level, so the living wage (set by the
  // staple price) and food costs move together (docs/plan/money-supply-mint.md §4.3).
  const basePrice = (stapleFoodGood?.value ?? 1) * priceLevel;
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
  // Brewers draw on the same stock, as the quarterly purchase counts them; grain sent to other
  // markets answers their prices, not this one's (docs/plan/staple-price-harvest-coverage.md §7).
  const annualDemand =
    urbanPopulation * GROSS_FOOD_NEED +
    Math.max(0, ledger.ruralMarketDraw ?? 0) +
    Math.max(0, ledger.brewingGrainDemand ?? 0);
  // Stock is held to the next harvest, so it is weighed against the demand until the farmers'
  // next offers restock it plus a normal carry-over (docs/plan/staple-price-harvest-coverage.md §3.1).
  // This month's purchase lands after this settlement (generateMonthlyLedger), so no offer is in yet.
  const month = ((simulationMonth - 1) % 12) + 1;
  const neededStock =
    getHarvestBridgeReserve(annualDemand, ledger.offeredIntakeByMonth, month, BRIDGE_FLOOR_MONTHS, 0) +
    (annualDemand / 12) * getMarketSettings().stapleCarryoverMonths;
  // King's law relates price to the year's supply, so the gap to the needed stock is counted as a
  // share of a year's demand: half a month short before harvest is about 4%, not a third of the
  // few months left (docs/plan/staple-price-harvest-coverage.md §7).
  const yearSupplyNeed = annualDemand * (1 + getMarketSettings().stapleCarryoverMonths / 12);
  const coverageRatio = yearSupplyNeed > 0 ? Math.max(0, 1 + (currentStock - neededStock) / yearSupplyNeed) : 1;
  const priceMultiplier = getStaplePriceMultiplier(coverageRatio);
  return rn(basePrice * priceMultiplier, 2);
}

/**
 * Urban retail revenue repays outstanding rural debt first, remainder becomes merchant capital. With
 * quarter-day repayment the debt is repaid only in those months (docs/plan/grain-quarter-day-payment.md).
 */
function settleUrbanRevenue(market: Market, revenue: number): void {
  if (revenue <= 0) return;
  const treasury = market.marketTreasury ?? {
    balance: 0,
    ruralGrainPayable: 0
  };

  const repayment = isGrainRepaymentMonth(getSimulationMonth()) ? Math.min(treasury.ruralGrainPayable, revenue) : 0;
  treasury.ruralGrainPayable = rn(treasury.ruralGrainPayable - repayment, 2);
  treasury.balance = rn(treasury.balance + (revenue - repayment), 2);
  market.marketTreasury = treasury;

  // L2 Phase 2: repaying the rural IOU is the deferred half of the farmgate payment finally
  // reaching farmers' own wallet (docs/plan/economy-coupling-audit.md).
  creditRuralHouseholdWealth(market, repayment);
}
