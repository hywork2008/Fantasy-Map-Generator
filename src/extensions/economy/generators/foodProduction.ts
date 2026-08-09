import { getSeasonalAmplitude, minmax, rn } from "../../hostUtils";
import {
  getCultivableArea,
  getCultivatedArea,
  getFoodPotential,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getRuralHouseholdFoodStock,
  getWorldContext,
  setRuralHouseholdFoodStock
} from "../economyContext";
import { getCropMix } from "./agriculturalLandUse";
import { getEconomyStartProfile } from "./economyStartMode";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { resolveFoodImportNetwork } from "./foodImportNetwork";
import type { Good } from "./goods-generator";
import type { FoodLedger, Market } from "./marketTypes";
import { markRetailInventoryDirty } from "./retailInventory";
import {
  advanceStapleCropInventoryQuarterly,
  applyStapleCropStorageCap,
  getStapleCropInventory,
  migrateLegacyGrainInventory,
  refreshLegacyFoodLedgerTotals
} from "./stapleCropInventory";

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
/** Days of a burg's own staple-food need kept on hand locally, independent of the Market pool. */
export const BURG_TARGET_RESERVE_DAYS = 10;
/** Rural households retain this many years of their own staple need before selling Grain. */
export const RURAL_HOUSEHOLD_FOOD_RESERVE_YEARS = 1;

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

/**
 * The single aggregate commodity that Food Ledger production/consumption/pricing owns. Crop
 * goods carry the local diet and are deliberately not separate ledgers; Grain remains the
 * shared store-of-calories and trade-price representation.
 */
export function getStapleFoodGood(): Good | undefined {
  return (
    getGoods().find(good => good.name === "Grain" && good.tags?.includes("stapleFood")) ??
    getGoods().find(good => good.tags?.includes("stapleFood"))
  );
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

export class FoodProductionModule {
  private get worldContext() {
    return getWorldContext();
  }

  /**
   * Creates the cell-level aggregate of household larders. This is deliberately
   * not one record per family: all households in a cell share the same food
   * accounting boundary while keeping their provisions outside Market stock.
   */
  private seedRuralHouseholdFoodStock(reset: boolean): void {
    const { cells } = this.worldContext.pack;
    const cellCount = cells?.i?.length ?? 0;
    if (!cellCount) return;

    const existing = getRuralHouseholdFoodStock();
    if (!reset && existing.length === cellCount) return;

    const populationRate = this.worldContext.populationRate ?? 1000;
    const stock = new Float32Array(cellCount);
    for (const cellId of cells.i) {
      if (cellId < 0 || cellId >= stock.length || cells.h[cellId] < 20) continue;
      const people = Math.max(0, cells.pop[cellId] ?? 0) * populationRate;
      stock[cellId] = people * GROSS_FOOD_NEED * RURAL_HOUSEHOLD_FOOD_RESERVE_YEARS;
    }
    setRuralHouseholdFoodStock(stock);
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
    const wheatGood = getGoods().find(good => good.name === "Wheat");
    const startingPrice = stapleFoodGood?.value ?? 1;
    const dailyNeedPerPerson = GROSS_FOOD_NEED / 365.2425;
    const economyProfile = getEconomyStartProfile(this.worldContext.options);

    // A newly generated world gets one year of private rural provisions just
    // like it gets its initial Market stock. Existing saves preserve this
    // mutable stock; old saves without it are migrated once at this boundary.
    this.seedRuralHouseholdFoodStock(markets.every(market => !market.foodLedger));

    for (const market of markets) {
      if (market.foodLedger) {
        if (wheatGood) migrateLegacyGrainInventory(market.foodLedger, wheatGood.i);
        continue;
      }

      const marketBurgs = pack.burgs.filter(b => b.i && !b.removed && b.market === market.i);
      const urbanPopulation = marketBurgs.reduce(
        (sum, b) => sum + (b.population ?? 0) * populationRate * urbanization,
        0
      );
      const annualDemand = urbanPopulation * GROSS_FOOD_NEED;
      const bucketSeed = rn(annualDemand * (INITIAL_STOCK_MONTHS_PER_BUCKET / 12), 2);
      const farmgateCost = rn(startingPrice * FARMGATE_PRICE_SHARE, 2);
      const initialStock = bucketSeed * 2;
      const exportReserve = annualDemand * (EXPORT_RESERVE_MONTHS / 12);
      const importTarget = annualDemand * (IMPORT_TARGET_MONTHS / 12);

      market.foodLedger = {
        ...emptyFoodLedger(),
        foodStockAge0: bucketSeed,
        foodStockAge1: bucketSeed,
        foodStockAge0UnitCost: farmgateCost,
        foodStockAge1UnitCost: farmgateCost,
        exportable: rn(Math.max(0, initialStock - exportReserve), 2),
        importNeed: rn(Math.max(0, importTarget - initialStock), 2),
        targetStock: rn(importTarget, 2)
      };
      if (wheatGood) {
        const wheat = getStapleCropInventory(market.foodLedger, wheatGood.i);
        wheat.age0 = bucketSeed;
        wheat.age1 = bucketSeed;
        wheat.age0UnitCost = farmgateCost;
        wheat.age1UnitCost = farmgateCost;
      }

      // Seed each Burg's own working capital first: burgTreasurySum below would otherwise always be
      // 0 on a fresh map (no production cycle has run yet), collapsing the Market's derived capital
      // to 0 as well.
      for (const burg of marketBurgs) {
        if (!burg.treasury) {
          burg.treasury = rn((burg.population ?? 0) * economyProfile.burgTreasuryPerPopulation, 2);
        }
      }

      const burgTreasurySum = marketBurgs.reduce((sum, b) => sum + Math.max(0, b.treasury ?? 0), 0);
      const [minimumTreasuryShare, maximumTreasuryShare] = economyProfile.marketTreasuryShare;
      const treasuryShare = minimumTreasuryShare + Math.random() * (maximumTreasuryShare - minimumTreasuryShare);
      // Trade working capital is a separate merchant-company pool (not debited from burg treasuries),
      // seeded as if the house already traded before the map opened (Phase D).
      const [minimumTradeShare, maximumTradeShare] = economyProfile.tradeCapitalShare;
      const tradeShare = minimumTradeShare + Math.random() * (maximumTradeShare - minimumTradeShare);
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
        // Grain remains a Food Ledger summary for overview/price displays. Player-facing
        // trade resolves the named crop lots above instead of this aggregate projection.
        market.goods[stapleFoodGood.i] = { stock: market.foodLedger.exportable, price: startingPrice };
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
    const foodPotential = getFoodPotential();
    this.seedRuralHouseholdFoodStock(false);
    const ruralHouseholdFoodStock = getRuralHouseholdFoodStock();
    const hasAgriculturalLandUse =
      cultivableArea.length === pack.cells.i.length &&
      cultivatedArea.length === pack.cells.i.length &&
      foodPotential.length === pack.cells.i.length;
    const hasRuralHouseholdFoodStock = ruralHouseholdFoodStock.length === pack.cells.i.length;

    const safeQuarterIndex = Math.max(0, Math.min(3, Math.floor(quarterIndex % 4)));
    const quarterlyWeights = getGlobalQuarterlyFoodWeights({
      mapCoordinates: this.worldContext.mapCoordinates,
      climate: this.worldContext.options
    });
    const quarterWeight = quarterlyWeights[safeQuarterIndex];
    const stapleFoodGood = getStapleFoodGood();
    const cropGoods = getGoods().filter(good => Boolean(good.crop));

    for (const market of markets) {
      let ruralPopulation = 0;
      let annualMarketFoodIntake = 0;
      const cropWholesale = new Map<number, number>();

      for (const cellId of pack.cells.i) {
        if (marketCellColumn[cellId] !== market.i || pack.cells.h[cellId] < 20) continue;

        const rural = pack.cells.pop[cellId] * populationRate;
        ruralPopulation += rural;
        let annualHarvest = 0;
        if (hasAgriculturalLandUse) {
          const landCoverage =
            cultivableArea[cellId] > 0 ? minmax(cultivatedArea[cellId] / cultivableArea[cellId], 0, 1) : 0;
          // cultivatedArea is the active, maintained field area. Farm-labour
          // columns are used by the employment model, but are not a second
          // production gate: ordinary burg cells reserve their own fields too.
          annualHarvest = foodPotential[cellId] * landCoverage;
        } else {
          // Compatibility path for tests and maps created before the agricultural
          // columns exist. New economy generation always takes the land-use path.
          const capacity = pack.cells.capacity[cellId] * populationRate;
          const saturation = capacity > 0 ? rural / capacity : 0;
          const cultivation = minmax(0.25 + 0.75 * saturation, 0.25, 1);
          annualHarvest = capacity * GROSS_FOOD_NEED * cultivation;
        }

        const harvest = annualHarvest * quarterWeight;
        const cropMix = getCropMix(this.worldContext, cellId, cropGoods);
        // A modern catalogue must not turn an unsuitable field into anonymous
        // Grain. Legacy catalogues without crop profiles retain the aggregate
        // Food Ledger behavior until they are migrated.
        if (cropGoods.length > 0 && !cropMix.length) continue;

        const hasCellHouseholdFoodStock =
          hasRuralHouseholdFoodStock && cellId >= 0 && cellId < ruralHouseholdFoodStock.length;
        let wholesale = harvest;
        if (!hasCellHouseholdFoodStock) {
          // Kept only for malformed legacy callers that have not gone through
          // the bootstrap migration. Normal maps always retain household stock.
        } else {
          const householdTarget = rural * GROSS_FOOD_NEED * RURAL_HOUSEHOLD_FOOD_RESERVE_YEARS;
          const householdShortfall = Math.max(0, householdTarget - ruralHouseholdFoodStock[cellId]);
          const retainedByHouseholds = Math.min(harvest, householdShortfall);
          ruralHouseholdFoodStock[cellId] += retainedByHouseholds;
          wholesale -= retainedByHouseholds;
        }
        annualMarketFoodIntake += wholesale;

        // Food Ledger keeps wheat-equivalent nutrition, while every unit also
        // retains a real crop identity for consumption and player trade.
        for (const entry of cropMix) {
          cropWholesale.set(entry.good.i, (cropWholesale.get(entry.good.i) ?? 0) + wholesale * entry.share);
        }
      }

      const urbanPopulation = pack.burgs
        .filter(b => b.i && !b.removed && b.market === market.i)
        .reduce((sum, b) => sum + (b.population ?? 0) * populationRate * urbanization, 0);

      const annualRuralNeed = ruralPopulation * GROSS_FOOD_NEED;
      const annualUrbanNeed = urbanPopulation * GROSS_FOOD_NEED;
      // Rural households normally eat their private provisions. Market stock
      // therefore targets urban demand; rural shortages draw from it later in
      // settleMonthlyFoodConsumption.
      const annualDemand = annualUrbanNeed;

      const foodProduced = rn(annualMarketFoodIntake, 2);
      const ruralNeed = rn(annualRuralNeed * 0.25, 2);
      const urbanNeed = rn(annualUrbanNeed * 0.25, 2);

      if (!market.foodLedger) market.foodLedger = emptyFoodLedger();
      const ledger = market.foodLedger;

      const previousPrice = stapleFoodGood ? (market.goods[stapleFoodGood.i]?.price ?? stapleFoodGood.value) : 1;
      const farmgateUnitCost = rn(previousPrice * FARMGATE_PRICE_SHARE, 2);
      this.settleFarmgatePayment(market, foodProduced, farmgateUnitCost);

      // A market with catalogued, cell-suitable crops ages and caps stock per named crop (Wheat,
      // Rye, Barley, ...) so each one's own bucket-and-overflow bookkeeping stays real — rather
      // than only the shared aggregate buckets, which used to leave every crop's own age1/age2/
      // overflow frozen at whatever the initial migration seeded (usually nothing), permanently
      // hiding real, unconsumed stock from the player-facing tradeable-stock view. Legacy maps/
      // tests with no crop catalogue keep the original aggregate-only path.
      const trackedCropGoodIds = new Set<number>([
        ...Object.keys(ledger.stapleCropInventories ?? {}).map(Number),
        ...cropWholesale.keys()
      ]);
      if (trackedCropGoodIds.size > 0) {
        for (const goodId of trackedCropGoodIds) {
          const inventory = getStapleCropInventory(ledger, goodId);
          advanceStapleCropInventoryQuarterly(inventory, cropWholesale.get(goodId) ?? 0, farmgateUnitCost);
        }
        applyStapleCropStorageCap(ledger, annualDemand * (STORAGE_CAP_MONTHS / 12));
        refreshLegacyFoodLedgerTotals(ledger);

        for (const [goodId, amount] of cropWholesale) {
          if (amount <= 0) continue;
          const good = cropGoods.find(candidate => candidate.i === goodId);
          if (!good) continue;
          const marketGood = market.goods[goodId] ?? { stock: 0, price: good.value };
          marketGood.stock = rn(marketGood.stock + amount, 2);
          market.goods[goodId] = marketGood;
        }
      } else {
        this.advanceQuarterlyStock(ledger, foodProduced, farmgateUnitCost);
        this.applyStorageCap(ledger, annualDemand);
      }

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
        markRetailInventoryDirty(market.i);
      }
    }

    resolveFoodImportNetwork(this.worldContext);
  }
}

export const FoodProduction = new FoodProductionModule();
