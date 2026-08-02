import { foodStressProductionMultiplier } from "../../hostCore";
import { getSeasonalAmplitude, minmax, rn } from "../../hostUtils";
import {
  getCultivableArea,
  getCultivatedArea,
  getFarmLaborRequired,
  getFoodPotential,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getWorldContext
} from "../economyContext";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { resolveFoodImportNetwork } from "./foodImportNetwork";
import type { Good } from "./goods-generator";
import type { FoodLedger, Market } from "./marketTypes";

export { GROSS_FOOD_NEED } from "./foodConstants";

/** Uniform fallback for legacy maps or incomplete World Configurator settings. */
export const DEFAULT_QUARTERLY_WEIGHTS = [0.25, 0.25, 0.25, 0.25] as const;

export type QuarterlyFoodWeights = readonly [number, number, number, number];

type FoodSeasonalitySettings = {
  mapCoordinates?: { latN?: number; latS?: number };
  climate?: {
    temperatureEquator: number;
    temperatureNorthPole: number;
    temperatureSouthPole: number;
  };
};

/**
 * A deliberately mild northern-hemisphere reference harvest profile. It preserves the annual
 * total while putting a little more supply into July–September, without claiming to model a
 * specific crop calendar. Southern maps rotate this profile by half a year.
 */
const NORTHERN_HARVEST_PROFILE: QuarterlyFoodWeights = [0.2, 0.23, 0.34, 0.23];

/** Caps this global foundation below the strength of a future market- or crop-level calendar. */
const MAX_GLOBAL_SEASONAL_BLEND = 0.1;
const REFERENCE_SEASONAL_AMPLITUDE_C = 20;

/** Fraction of the current Grain retail price paid to rural producers at the farm gate. */
export const FARMGATE_PRICE_SHARE = 0.8;
/** Months of annual demand a Market may hold before staple food overflows with no export sink yet (v1). */
const STORAGE_CAP_MONTHS = 9;
/** Months of annual demand reserved before a Market may treat staple food as generally exportable. */
const EXPORT_RESERVE_MONTHS = 3;
/** Months of annual demand a deficit Market tries to recover toward via imports. */
const IMPORT_TARGET_MONTHS = 6;
/** Initial-map/first-enable seed: months of annual demand held in Age0 and in Age1 each. */
const INITIAL_STOCK_MONTHS_PER_BUCKET = 3;
/** Deterministic initial merchant capital as a fraction of the market's burgs' combined treasury. */
const INITIAL_TREASURY_MIN_SHARE = 0.5;
const INITIAL_TREASURY_SHARE_SPAN = 0.5;
/**
 * Starting working capital per raw population point, seeded once so a fresh Burg can afford a
 * few cycles of manufacturing ingredients before it earns its own market revenue (see
 * docs/temp/profits.md and executeManufacture's budget cap in production-generator.ts). Placeholder
 * magnitude — not yet balance-tuned. Exported for reuse as guildTreasury.ts's population-scaled
 * floor under getComfortableTreasuryLevel() (docs/plan/burg-treasury-equilibrium.md §3.3) — the
 * same "how much working capital does a Burg of this size need" question, just asked again for the
 * upper bound instead of the initial seed.
 */
export const STARTING_BURG_TREASURY_PER_POPULATION = 20;
/** Days of a burg's own staple-food need kept on hand locally, independent of the Market pool. */
export const BURG_TARGET_RESERVE_DAYS = 10;

function isFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function getMapReferenceLatitude(mapCoordinates: FoodSeasonalitySettings["mapCoordinates"]): number | null {
  if (!mapCoordinates) return null;
  const { latN, latS } = mapCoordinates;
  if (isFiniteNumber(latN) && isFiniteNumber(latS)) return (latN + latS) / 2;
  if (isFiniteNumber(latN)) return latN;
  if (isFiniteNumber(latS)) return latS;
  return null;
}

function rotateHalfYear(weights: QuarterlyFoodWeights): QuarterlyFoodWeights {
  return [weights[2], weights[3], weights[0], weights[1]];
}

/**
 * Calculates one harvest-timing profile for the whole map. It intentionally uses the map's
 * reference latitude rather than individual cell locations: this is a subtle common baseline
 * for the food ledger, not a replacement for later producer-level crop calendars.
 */
export function getGlobalQuarterlyFoodWeights({
  mapCoordinates,
  climate
}: FoodSeasonalitySettings): QuarterlyFoodWeights {
  const latitude = getMapReferenceLatitude(mapCoordinates);
  if (
    latitude === null ||
    !climate ||
    !isFiniteNumber(climate.temperatureEquator) ||
    !isFiniteNumber(climate.temperatureNorthPole) ||
    !isFiniteNumber(climate.temperatureSouthPole)
  ) {
    return DEFAULT_QUARTERLY_WEIGHTS;
  }

  const amplitude = getSeasonalAmplitude(latitude, climate);
  const climateStrength = minmax(amplitude / REFERENCE_SEASONAL_AMPLITUDE_C, 0, 1);
  const blend = climateStrength * MAX_GLOBAL_SEASONAL_BLEND;
  if (blend === 0) return DEFAULT_QUARTERLY_WEIGHTS;

  const harvestProfile = latitude < 0 ? rotateHalfYear(NORTHERN_HARVEST_PROFILE) : NORTHERN_HARVEST_PROFILE;
  return [
    DEFAULT_QUARTERLY_WEIGHTS[0] + (harvestProfile[0] - DEFAULT_QUARTERLY_WEIGHTS[0]) * blend,
    DEFAULT_QUARTERLY_WEIGHTS[1] + (harvestProfile[1] - DEFAULT_QUARTERLY_WEIGHTS[1]) * blend,
    DEFAULT_QUARTERLY_WEIGHTS[2] + (harvestProfile[2] - DEFAULT_QUARTERLY_WEIGHTS[2]) * blend,
    DEFAULT_QUARTERLY_WEIGHTS[3] + (harvestProfile[3] - DEFAULT_QUARTERLY_WEIGHTS[3]) * blend
  ];
}

/** The single Good (Grain in v1) that Food Ledger production/consumption/pricing owns. */
export function getStapleFoodGood(): Good | undefined {
  return getGoods().find(good => good.tags?.includes("stapleFood"));
}

function emptyFoodLedger(): FoodLedger {
  return {
    foodProduced: 0,
    ruralNeed: 0,
    urbanNeed: 0,
    exportable: 0,
    importNeed: 0,
    targetStock: 0,
    satisfiedImport: 0,
    importCapacityBonus: 0,
    foodStockAge0: 0,
    foodStockAge1: 0,
    foodStockAge2: 0,
    foodStockAge0UnitCost: 0,
    foodStockAge1UnitCost: 0,
    foodStockAge2UnitCost: 0,
    storageOverflow: 0,
    ruralFoodStressQuarters: 0,
    urbanFoodStressQuarters: 0,
    ruralSevereDeficitQuarters: 0,
    urbanSevereDeficitQuarters: 0
  };
}

/** Actual rural people (population points × populationRate) attributed to a market's cells. */
export function getMarketRuralPopulation(worldContext: ReturnType<typeof getWorldContext>, marketId: number): number {
  const pack = worldContext.pack;
  const marketCellColumn = getMarketCellColumn();
  const populationRate = worldContext.populationRate ?? 1000;
  let ruralPopulation = 0;
  for (const cellId of pack.cells.i) {
    if (marketCellColumn[cellId] !== marketId || pack.cells.h[cellId] < 20) continue;
    ruralPopulation += pack.cells.pop[cellId] * populationRate;
  }
  return ruralPopulation;
}

export class FoodProductionModule {
  private get worldContext() {
    return getWorldContext();
  }

  /**
   * One-time seed for a market with no Food Ledger yet: initial bucketed stock, initial merchant
   * capital, and each of its burgs' local food reserve. Called from generation-time hooks (fresh
   * map, first economy enable, legacy-save migration) — never inferred from field absence inside
   * the recurring quarterly cycle, which would be a fragile sentinel.
   */
  seedFoodLedgerBootstrap(): void {
    const pack = this.worldContext.pack;
    const markets = getMarkets();
    if (!markets.length || !pack.burgs) return;

    const populationRate = this.worldContext.populationRate ?? 1000;
    const urbanization = this.worldContext.urbanization ?? 1;
    const stapleFoodGood = getStapleFoodGood();
    const startingPrice = stapleFoodGood?.value ?? 1;
    const dailyNeedPerPerson = GROSS_FOOD_NEED / 365.2425;

    for (const market of markets) {
      if (market.foodLedger) continue;

      const marketBurgs = pack.burgs.filter(b => b.i && !b.removed && b.market === market.i);
      const ruralPopulation = getMarketRuralPopulation(this.worldContext, market.i);
      const urbanPopulation = marketBurgs.reduce(
        (sum, b) => sum + (b.population ?? 0) * populationRate * urbanization,
        0
      );
      const annualDemand = (ruralPopulation + urbanPopulation) * GROSS_FOOD_NEED;
      const bucketSeed = rn(annualDemand * (INITIAL_STOCK_MONTHS_PER_BUCKET / 12), 2);
      const farmgateCost = rn(startingPrice * FARMGATE_PRICE_SHARE, 2);

      market.foodLedger = {
        ...emptyFoodLedger(),
        foodStockAge0: bucketSeed,
        foodStockAge1: bucketSeed,
        foodStockAge0UnitCost: farmgateCost,
        foodStockAge1UnitCost: farmgateCost
      };

      // Seed each Burg's own working capital first: burgTreasurySum below would otherwise always be
      // 0 on a fresh map (no production cycle has run yet), collapsing the Market's derived capital
      // to 0 as well.
      for (const burg of marketBurgs) {
        if (!burg.treasury) {
          burg.treasury = rn((burg.population ?? 0) * STARTING_BURG_TREASURY_PER_POPULATION, 2);
        }
      }

      const burgTreasurySum = marketBurgs.reduce((sum, b) => sum + Math.max(0, b.treasury ?? 0), 0);
      const treasuryShare = INITIAL_TREASURY_MIN_SHARE + Math.random() * INITIAL_TREASURY_SHARE_SPAN;
      // Trade working capital is a separate merchant-company pool (not debited from burg treasuries),
      // seeded as if the house already traded before the map opened (Phase D).
      const tradeShare = 0.25 + Math.random() * 0.55;
      market.marketTreasury = {
        balance: rn(burgTreasurySum * treasuryShare, 2),
        ruralGrainPayable: 0,
        tradeWorkingCapital: rn(burgTreasurySum * tradeShare, 2),
        tradeCapitalLocked: 0
      };

      for (const burg of marketBurgs) {
        const burgDailyNeed = (burg.population ?? 0) * populationRate * urbanization * dailyNeedPerPerson;
        burg.foodReserve = rn(burgDailyNeed * BURG_TARGET_RESERVE_DAYS, 2);
      }

      if (stapleFoodGood) {
        market.goods[stapleFoodGood.i] = { stock: 0, price: startingPrice };
      }
    }
  }

  /**
   * Shifts buckets one quarter older (oldest bucket beyond the ledger's 9-month span becomes
   * unrecoverable `storageOverflow`), then lands this quarter's production in a now-empty Age0.
   * Must run before the cap check, which also overflows oldest-first.
   */
  private advanceQuarterlyStock(ledger: FoodLedger, producedThisQuarter: number, farmgateUnitCost: number): void {
    ledger.storageOverflow = rn(ledger.storageOverflow + ledger.foodStockAge2, 2);

    ledger.foodStockAge2 = ledger.foodStockAge1;
    ledger.foodStockAge2UnitCost = ledger.foodStockAge1UnitCost;
    ledger.foodStockAge1 = ledger.foodStockAge0;
    ledger.foodStockAge1UnitCost = ledger.foodStockAge0UnitCost;

    ledger.foodStockAge0 = rn(producedThisQuarter, 2);
    ledger.foodStockAge0UnitCost = producedThisQuarter > 0 ? farmgateUnitCost : 0;
  }

  /** Caps total stock at 9 months of annual demand, trimming the oldest bucket first into overflow. */
  private applyStorageCap(ledger: FoodLedger, annualDemand: number): void {
    const cap = annualDemand * (STORAGE_CAP_MONTHS / 12);
    let excess = ledger.foodStockAge0 + ledger.foodStockAge1 + ledger.foodStockAge2 - cap;
    if (excess <= 0) return;

    const fromAge2 = Math.min(ledger.foodStockAge2, excess);
    ledger.foodStockAge2 = rn(ledger.foodStockAge2 - fromAge2, 2);
    excess -= fromAge2;

    const fromAge1 = excess > 0 ? Math.min(ledger.foodStockAge1, excess) : 0;
    ledger.foodStockAge1 = rn(ledger.foodStockAge1 - fromAge1, 2);
    excess -= fromAge1;

    const fromAge0 = excess > 0 ? Math.min(ledger.foodStockAge0, excess) : 0;
    ledger.foodStockAge0 = rn(ledger.foodStockAge0 - fromAge0, 2);

    ledger.storageOverflow = rn(ledger.storageOverflow + fromAge2 + fromAge1 + fromAge0, 2);
  }

  /** Pays the farmgate cost from the market's treasury; any shortfall accrues as rural debt. */
  private settleFarmgatePayment(market: Market, producedThisQuarter: number, farmgateUnitCost: number): void {
    if (producedThisQuarter <= 0) return;
    const cost = rn(producedThisQuarter * farmgateUnitCost, 2);
    const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };

    const paidFromBalance = Math.min(Math.max(0, treasury.balance), cost);
    treasury.balance = rn(treasury.balance - paidFromBalance, 2);
    treasury.ruralGrainPayable = rn(treasury.ruralGrainPayable + (cost - paidFromBalance), 2);
    market.marketTreasury = treasury;
  }

  generateQuarterlyLedger(quarterIndex: number) {
    const pack = this.worldContext.pack;
    const markets = getMarkets();
    const marketCellColumn = getMarketCellColumn();

    if (!markets.length || !pack.cells || !pack.burgs) return;

    const populationRate = this.worldContext.populationRate ?? 1000;
    const urbanization = this.worldContext.urbanization ?? 1;
    const cultivableArea = getCultivableArea();
    const cultivatedArea = getCultivatedArea();
    const farmLaborRequired = getFarmLaborRequired();
    const foodPotential = getFoodPotential();
    const hasAgriculturalLandUse =
      cultivableArea.length === pack.cells.i.length &&
      cultivatedArea.length === pack.cells.i.length &&
      farmLaborRequired.length === pack.cells.i.length &&
      foodPotential.length === pack.cells.i.length;

    const safeQuarterIndex = Math.max(0, Math.min(3, Math.floor(quarterIndex % 4)));
    const quarterlyWeights = getGlobalQuarterlyFoodWeights({
      mapCoordinates: this.worldContext.mapCoordinates,
      climate: this.worldContext.options
    });
    const quarterWeight = quarterlyWeights[safeQuarterIndex];
    const stapleFoodGood = getStapleFoodGood();

    for (const market of markets) {
      let ruralPopulation = 0;
      let annualFoodProduced = 0;

      for (const cellId of pack.cells.i) {
        if (marketCellColumn[cellId] !== market.i || pack.cells.h[cellId] < 20) continue;

        const rural = pack.cells.pop[cellId] * populationRate;
        ruralPopulation += rural;
        const stateId = pack.cells.state?.[cellId] ?? 0;
        const productivityModifier = foodStressProductionMultiplier(stateId);
        if (hasAgriculturalLandUse) {
          const availableAdults =
            Math.max(0, pack.cells.maleAdults?.[cellId] ?? 0) + Math.max(0, pack.cells.femaleAdults?.[cellId] ?? 0);
          const requiredAdults = Math.max(0, farmLaborRequired[cellId] ?? 0);
          const labourCoverage = requiredAdults > 0 ? minmax(availableAdults / requiredAdults, 0, 1) : 0;
          const landCoverage =
            cultivableArea[cellId] > 0 ? minmax(cultivatedArea[cellId] / cultivableArea[cellId], 0, 1) : 0;
          annualFoodProduced += foodPotential[cellId] * landCoverage * labourCoverage * productivityModifier;
        } else {
          // Compatibility path for tests and maps created before the agricultural
          // columns exist. New economy generation always takes the land-use path.
          const capacity = pack.cells.capacity[cellId] * populationRate;
          const saturation = capacity > 0 ? rural / capacity : 0;
          const cultivation = minmax(0.25 + 0.75 * saturation, 0.25, 1);
          annualFoodProduced += capacity * GROSS_FOOD_NEED * cultivation * productivityModifier;
        }
      }

      const urbanPopulation = pack.burgs
        .filter(b => b.i && !b.removed && b.market === market.i)
        .reduce((sum, b) => sum + (b.population ?? 0) * populationRate * urbanization, 0);

      const annualRuralNeed = ruralPopulation * GROSS_FOOD_NEED;
      const annualUrbanNeed = urbanPopulation * GROSS_FOOD_NEED;
      const annualDemand = annualRuralNeed + annualUrbanNeed;

      const foodProduced = rn(annualFoodProduced * quarterWeight, 2);
      const ruralNeed = rn(annualRuralNeed * 0.25, 2);
      const urbanNeed = rn(annualUrbanNeed * 0.25, 2);

      if (!market.foodLedger) market.foodLedger = emptyFoodLedger();
      const ledger = market.foodLedger;

      const previousPrice = stapleFoodGood ? (market.goods[stapleFoodGood.i]?.price ?? stapleFoodGood.value) : 1;
      const farmgateUnitCost = rn(previousPrice * FARMGATE_PRICE_SHARE, 2);

      this.advanceQuarterlyStock(ledger, foodProduced, farmgateUnitCost);
      this.settleFarmgatePayment(market, foodProduced, farmgateUnitCost);
      this.applyStorageCap(ledger, annualDemand);

      const totalStock = ledger.foodStockAge0 + ledger.foodStockAge1 + ledger.foodStockAge2;
      const exportReserve = annualDemand * (EXPORT_RESERVE_MONTHS / 12);
      const importTarget = annualDemand * (IMPORT_TARGET_MONTHS / 12);

      ledger.foodProduced = foodProduced;
      ledger.ruralNeed = ruralNeed;
      ledger.urbanNeed = urbanNeed;
      ledger.exportable = rn(Math.max(0, totalStock - exportReserve), 2);
      ledger.importNeed = rn(Math.max(0, importTarget - totalStock), 2);
      ledger.targetStock = rn(importTarget, 2);
      // satisfiedImport/importCapacityBonus are reset and recomputed by resolveFoodImportNetwork() below.

      if (stapleFoodGood) {
        const marketGood = market.goods[stapleFoodGood.i] ?? { stock: 0, price: previousPrice };
        marketGood.stock = rn(ledger.exportable + ledger.storageOverflow, 2);
        market.goods[stapleFoodGood.i] = marketGood;
      }
    }

    resolveFoodImportNetwork(this.worldContext);
  }
}

export const FoodProduction = new FoodProductionModule();
