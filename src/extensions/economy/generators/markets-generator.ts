import Alea from "alea";
import { quadtree } from "d3-quadtree";
import FlatQueue from "flatqueue";
import { deliverConversionTimber } from "../../../generators/landUse";
import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { pow } from "../../../simulation/deterministicMath";
import type { Burg, ShipGoodName, ShipGoodStock } from "../../hostTypes";
import {
  SHIPBUILDING_MATERIAL_IDS,
  type ShipbuildingMaterialRequestResult,
  type ShipbuildingMaterialShortage,
  type ShipbuildingMaterials
} from "../../hostTypes";
import { getColors, getRandomColor, minmax, rn, TIME } from "../../hostUtils";
import {
  getColdStorageDepots,
  getDeals,
  getGoodCellColumn,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getMetallurgWorkOrders,
  getOrCreateCellFoodReserves,
  getOrCreateCumulativeGoodsSales,
  getOrCreateMarketGoodProductionTotals,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext,
  recordCumulativeCellFoodHarvest,
  recordCumulativeCellFoodReserveOutput,
  setDeals,
  setMarketCellColumn,
  setMarkets,
  setStrategicLaborMarkets
} from "../economyContext";
import { getEconomyCalibrationState } from "../state/economyCalibrationStore";
import { getFarmToolsDemandByMarket } from "./agTechInvestment";
import { getBurgMarketLedger, syncBurgMarketLedgers } from "./burgMarketLedgers";
import { CaravanMovement } from "./caravanMovement";
import { getChilledFreshFoodExportUnits, planCellFoodRescue } from "./cellFoodRescue";
import type { CellFreshFoodInput } from "./cellFoodRescueTypes";
import {
  consumerCoverageForCategory,
  getCalibratedMonthlyLots,
  getGoodDemandCalibration,
  recipesForIndustrialDemand
} from "./craftDemandCalibration";
import { laborPeople } from "./craftScale";
import { getMarketPriceLevel, getMintPriceFloor, getMoneyPriceLevelForMarket } from "./currencySufficiency";
import { ExportStaging } from "./exportStaging";
import {
  recordCellFoodHouseholdConsumption,
  recordFoodMarketIntake,
  recordFoodProcessingConsumption
} from "./foodProcessingLedger";
import { getFellableWood, harvestWood, woodUnitsForCoverage } from "./forestStock";
import type { DemandCategory, Good } from "./goods-generator";
import {
  DEMAND_PRIORITY,
  DEMAND_TARGET_FACTORS,
  expandRecipeByproducts,
  GOODS_DATA,
  Goods,
  getFreshFoodProfile,
  isGoodEnabled,
  isPreservedFoodGood
} from "./goods-generator";
import { type GoodFlowCategory, recordGoodFlow } from "./goodsBalanceLedger";
import { floorToRetailLot, getMarketTradeMinimumUnits, getRetailLotSize } from "./goodsTradeLots";
import { getCraftDomainForGood } from "./guildKnowledgeTypes";
import { getMonthlyHouseholdFuelDemands, getWoodSupplyMonthKey } from "./heating";
import { moveRuralPursesWithFarms } from "./householdWealth";
import { getHouseTimberShare, getHousingRecipe } from "./housingRecipes";
import { type IncrementalBatchOptions, runBatchedYielding } from "./incrementalBatching";
import { getLiveAnimalCatchKey, rollLiveAnimalCatch } from "./liveAnimalCatch";
import { isLuxuryValueDemandEnabled, luxuryBudgetByMarketTier, luxuryStockTarget } from "./luxuryDemand";
import { isHighValueTradeGood, isLuxuryDemandGood, type LuxuryTier } from "./luxuryTiers";
import {
  computeMarketGoodFlowBudget,
  TRADE_RESERVE_FACTOR as FLOW_TRADE_RESERVE_FACTOR,
  getDefaultMonthsOfCover
} from "./marketFlowBudget";
import { syncMarketManagers } from "./marketManagers";
import type { Deal, Market, TradeRouteSegment } from "./marketTypes";
import {
  forgetLapsedRumours,
  hearPriceGapRumour,
  housesPresentIn,
  knownPrice,
  recordMarketPriceSnapshot,
  seedForeignFactories,
  seedMerchantBranches
} from "./merchantIntelligence";
import {
  explainMarketTradeRefusal,
  getOrganizationMaxTradeDays,
  HIGH_VALUE_MAX_TRADE_DAYS,
  isMarketTradePermitted
} from "./merchantOrganizations";
import {
  getImporterPurchaseRoom,
  getUncommittedTradeCapital,
  isLongDistanceTradeEnabled,
  MerchantTradeCapital
} from "./merchantTradeCapital";
import { LAND_HIRE_FREIGHT_MULTIPLIER, MerchantTransportAssets } from "./merchantTransportAssets";
import { applyPriceElasticity, relaxMarketPrice } from "./priceElasticity";
import {
  getRuralCellPopulation,
  getRuralProductionContributions,
  getSeasonalFoodProductionMultiplier
} from "./production-utils";
import { addWholesaleGoodStock, getRetailLocalityMultiplier } from "./retailInventory";
import { seaDeparturePortBurgId } from "./seaRoutePorts";
import { getMarketTextileDemandProfile } from "./textileDemand";
import { getGoodCargoSlotsPerUnit } from "./tradeCargo";
import { TradeLogisticsSettings } from "./tradeLogisticsSettings";
import {
  estimateSpeculativeTrade,
  getCaravanMaintenanceCost,
  getLocalTradePriceMultiplier,
  getNetTradeProfit,
  getRouteMaxTemperatureC,
  getTradeAccountingPeriodDays,
  getTransportCost,
  isGoodTradePermittedForShipment,
  MIN_TRADE_PROFIT
} from "./tradeOpportunityEstimator";
import { choosePaymentTerms } from "./tradePaymentTerms";
import { calculateRouteDurationDays, getRouteDistanceMapUnits } from "./tradeRouteDuration";
import { TradeRoutePlanner } from "./tradeRoutePlanner";
import { maxWaitDaysForRoute } from "./tradeSailSchedule";
import { getTradeStageObserver } from "./tradeStageObserver";
import {
  buildTransportRoom,
  ownLandRoomSlots,
  seaRoomSlots,
  type TransportRoom,
  takeTransportRoom,
  transportRoomSlots
} from "./tradeTransportRoom";
import { TransportAssetOrders } from "./transportAssetOrders";

const PRICE_FLOOR_FACTOR = 0.25;
/**
 * Rural woodcutters sell what the market draws down, not what the forest could give: they keep
 * this many months of the market's smoothed Wood draw in stock (docs/plan/farm-labour-calibration.md §19).
 */
export const WOOD_STOCK_COVER_MONTHS = 6;
/** EWMA weight of one month's measured Wood draw. */
export const WOOD_DRAW_SMOOTHING = 1 / 6;
/**
 * Most of a market territory's standing forest its rural people can fell in one month (1%, up to
 * 12% a year): the forest near the villages goes first, and demand beyond it is short or imported
 * (docs/plan/farm-labour-calibration.md §22).
 */
export const RURAL_MONTHLY_FELLING_SHARE = 0.01;
/**
 * Wood a year per 1,000 rural residents of all-timber houses to repair and rebuild their houses
 * and barns (0.25 m³ a head: a farmstead of 40–60 m³ rebuilt every 20–50 years for five people)
 * and their fences, poles and hurdles (0.15 m³), cut by themselves: 0.4 m³ = 0.04 units a head
 * (docs/plan/farm-labour-calibration.md §21.2, §22).
 */
export const RURAL_BUILDING_TIMBER_PER_1000_RESIDENTS_ANNUAL = 40;
const PRICE_CEILING_FACTOR = 3.0;
const LAPLACE_PRICE_SMOOTHING = 5;
const MARKET_PRESSURE_FACTOR = 0.01;
const MARKET_MARGIN = 0.1;
/** Extra import-reserve share per point of burg warIntensity for military/essential goods. */
export const WARTIME_TRADE_RESERVE_PER_INTENSITY = 0.5;

/** Military and essential goods are hoarded in wartime; luxury/strategic are not. */
export function isWartimeImportDemandGood(good: Pick<Good, "warEconomyType" | "name" | "tags">): boolean {
  const warType = good.warEconomyType ?? GOODS_DATA.find(candidate => candidate.name === good.name)?.warEconomyType;
  return warType === "military" || warType === "essential" || Boolean(good.tags?.includes("military"));
}

export function wartimeTradeReserveMultiplier(
  intensity: number,
  good: Pick<Good, "warEconomyType" | "name" | "tags">
): number {
  if (!(intensity > 0) || !isWartimeImportDemandGood(good)) return 1;
  return 1 + intensity * WARTIME_TRADE_RESERVE_PER_INTENSITY;
}

/** Returns the outputs accompanying a cell-local recipe conversion. */
export function getCommercialRecipeByproducts(
  outputGood: Pick<Good, "recipes" | "byproducts">,
  sourceGoodId: number,
  sourceInputPerOutput: number,
  outputUnits: number
): { goodId: number; units: number }[] {
  if (outputUnits <= 0 || !outputGood.recipes?.length || !outputGood.byproducts?.length) return [];
  const recipeIndex = outputGood.recipes.findIndex(recipe => recipe[sourceGoodId] === sourceInputPerOutput);
  if (recipeIndex < 0) return [];
  return expandRecipeByproducts(outputGood.byproducts, recipeIndex, outputUnits);
}

interface MarketTradeRoute {
  distance: number;
  distanceKm: number;
  durationDays: number;
  segments: TradeRouteSegment[];
  /** Hottest cell temperature (°C) the route passes through; see getRouteMaxTemperatureC. */
  maxTemperatureC: number | undefined;
}

type MarketTradeRoutes = Record<number, Record<number, MarketTradeRoute>>;

type MarketGoodTotals = Map<number, number>;
/** Market → collection Burg (0 when none exists) → Good → units. */
type RuralTotalsByMarket = Map<number, Map<number, MarketGoodTotals>>;
/** State → collection Burg (0 when none exists) → Good → monthly units. */
type FoodTotalsByState = Map<number, Map<number, Map<number, number[]>>>;
type WoodContribution = { marketId: number; collectionBurgId: number; goodId: number; amount: number };
type FreshFoodContribution = {
  cellId: number;
  marketId: number;
  collectionBurgId: number;
  goodId: number;
  monthlyUnits: number[];
};
type RuralWoodPlan = {
  market: Market;
  potential: number;
  ruralFuelDemand: number;
  ruralBuildingDemand: number;
  fuelLeft: number;
  saleLeft: number;
  ruralFuelWood: number;
  marketWood: number;
  clearanceBurned: number;
  smoothedDraw: number;
};
type RuralProductionIndex = {
  populationSnapshotPeriod: string;
  standard: RuralTotalsByMarket;
  food: Map<number, FoodTotalsByState>;
  woodByCell: Map<number, WoodContribution[]>;
  /** Annual rural building timber by market (RURAL_BUILDING_TIMBER_PER_1000_RESIDENTS_ANNUAL). */
  buildingTimberByMarket: Map<number, number>;
  freshFood: FreshFoodContribution[];
};

function getMarketDistanceMapUnits(source: Pick<Burg, "x" | "y">, target: Pick<Burg, "x" | "y">): number {
  const dx = Math.abs(source.x - target.x);
  const dy = Math.abs(source.y - target.y);
  return dx > dy ? dx + 0.414 * dy : dy + 0.414 * dx;
}

interface MarketTradeOpportunity {
  exporter: Market;
  importer: Market;
  reserveExporter: number;
  reserveImporter: number;
  transportCost: number;
  exporterTaxPerUnit: number;
  importerDutyPerUnit: number;
  units: number;
  unitProfit: number;
  /** Quoted prices the trading house believes from its letters (merchantIntelligence.ts). */
  knownExporterPrice?: number;
  knownImporterPrice?: number;
  /** Net of the route's shared maintenanceCost (see routeKey/isRouteViable below). */
  totalProfit: number;
  distance: number;
  distanceKm: number;
  durationDays: number;
  maintenanceCost: number;
  routeSegments: TradeRouteSegment[];
  /** A State Metallurg order funds this route even when its commercial margin is small. */
  stateProcurement: boolean;
  targetSalePrice?: number;
}

/**
 * Same exporter/importer market pair shares one caravan and pays `maintenanceCost` once,
 * regardless of how many distinct goods ride along (see runGlobalTrade's route-viability pass).
 */
function tradeRouteKey(exporterId: number, importerId: number): string {
  return `${exporterId}-${importerId}`;
}

/** Shared setup computed once per runGlobalTrade()/runGlobalTradeIncrementally() pass. */
interface GlobalTradeContext {
  goods: Good[];
  consumerDemandFactors: number[];
  industrialDemandFactors: number[];
  /** Unfinished State armory orders, indexed by destination market then finished Good. */
  strategicDemandByMarket: Map<number, Map<number, number>>;
  populationByMarket: number[];
  textilePopulationByMarket: number[];
  mapDiagonal: number;
  tradeReserveFactor: number;
  travelRoutes: MarketTradeRoutes;
  /**
   * Luxury budget per market and price tier when the value demand is on
   * (docs/plan/luxury-value-demand.md §3.5); null keeps the unit-count luxury demand.
   */
  luxuryBudgets: Map<number, Record<LuxuryTier, number>> | null;
  /**
   * Cash each importing market can still pay for cargo when it is paid for
   * (docs/plan/long-distance-merchant-reach-capital.md §5.1); null when cargo is not paid for.
   */
  importerPurchaseRoom: Map<number, number> | null;
  /** Long-distance reach rules (long-distance-merchant-reach-capital.md §4) are on. */
  longDistanceTrade: boolean;
  /** What each exporter's fleet can still carry this cycle (long-distance-merchant-reach-capital.md §17). */
  transportRoom: TransportRoom;
}

export type { Deal, Market } from "./marketTypes";

/** Goods whose supply is a mine or a furnace rather than a cell distribution or a recipe. */
/** Lowest price a good falls to: a quarter of its value, or the mint price for minted metal. */
function getPriceFloor(good: Pick<Good, "unit" | "value">, baseValue: number): number {
  const floor = baseValue * PRICE_FLOOR_FACTOR;
  const mintFloor = getMintPriceFloor(good);
  return mintFloor === undefined ? floor : Math.max(floor, mintFloor);
}

function isMineOrFurnaceGood(good: Pick<Good, "tags">): boolean {
  return good.tags.some(tag => tag === "ore" || tag === "ingot" || tag === "mineral");
}

export class MarketsModule {
  private get worldContext() {
    return getWorldContext();
  }

  /** Worst-case commercial loading wait, included in fresh cargo's shelf-life check. */
  /**
   * The route between two markets when `good` survives the trip and the wait for a sailing on it
   * (the cargo rule of global trade), else null. Used to stock the start-of-map export warehouse.
   */
  getShippableTradeRoute(
    sourceMarketId: number,
    targetMarketId: number,
    good: Good
  ): { durationDays: number; distanceKm: number } | null {
    const route = this.getCachedMarketTradeRoutes()[sourceMarketId]?.[targetMarketId];
    if (!route || !Number.isFinite(route.durationDays)) return null;
    const permitted = isGoodTradePermittedForShipment(
      good,
      route.durationDays,
      this.getExpectedLoadingWaitDays(route),
      route.segments,
      route.maxTemperatureC
    );
    return permitted ? { durationDays: route.durationDays, distanceKm: route.distanceKm } : null;
  }

  private getExpectedLoadingWaitDays(route: Pick<MarketTradeRoute, "segments" | "distanceKm">): number {
    const logistics = TradeLogisticsSettings.getOptions();
    return maxWaitDaysForRoute(route.segments, route.distanceKm, {
      maxWaitDaysLand: logistics.maxWaitDaysLand,
      maxWaitDaysSea: logistics.maxWaitDaysSea,
      maxWaitDaysShortSea: logistics.maxWaitDaysShortSea,
      shortSeaDistanceKm: logistics.shortSeaDistanceKm
    });
  }

  private getSalesTax(burg: { state?: number }): number {
    const stateId = burg.state || 0;
    if (!stateId) return 0;
    return this.worldContext.pack.states?.[stateId]?.salesTax ?? 0;
  }

  /**
   * Import duty the importer's state charges on this trade — 0 whenever the trade is domestic
   * (both center burgs belong to the same state, including both neutral/unclaimed). Unlike
   * `getSalesTax`, which taxes every sale regardless of who the buyer is, a duty only exists at
   * a border: taxing a state's own internal inter-market trade as if it were foreign would be
   * backwards. docs/plan/economy-coupling-audit.md L10.
   */
  private getImportDuty(
    exporterCenter: { state?: number } | undefined,
    importerCenter: { state?: number } | undefined
  ): number {
    const exporterStateId = exporterCenter?.state || 0;
    const importerStateId = importerCenter?.state || 0;
    if (!importerStateId || importerStateId === exporterStateId) return 0;
    return this.worldContext.pack.states?.[importerStateId]?.importDuty ?? 0;
  }

  private marketById: Market[] = [];
  private tradeRouteCache: { key: string; routes: MarketTradeRoutes } | null = null;
  private ruralProductionIndex: RuralProductionIndex | null = null;

  /** Returns the current market stock for the three ship-class Goods. */
  getShipGoodStock(marketId: number): ShipGoodStock | undefined {
    const market = this.get(marketId);
    if (!market) return undefined;

    const stock = {} as Record<ShipGoodName, number>;
    for (const name of ["Sloop", "Caravel", "Galleon"] as const) {
      const good = getGoods().find(candidate => candidate.name === name);
      if (!good || !isGoodEnabled(good)) return undefined;
      stock[name] = market.goods[good.i]?.stock ?? 0;
    }
    return stock;
  }

  /** Adds a finished generic hull to the local market's ship-class Good stock. */
  addSurplusShipStock(marketId: number, shipClassId: string): "fulfilled" | "noMarket" | "missingGood" {
    const market = this.get(marketId);
    if (!market) return "noMarket";

    const goodName = { sloop: "Sloop", caravel: "Caravel", galleon: "Galleon" }[shipClassId];
    if (!goodName) return "missingGood";
    const good = getGoods().find(candidate => candidate.name === goodName);
    const marketGood = good ? market.goods[good.i] : undefined;
    if (!good || !marketGood || !isGoodEnabled(good)) return "missingGood";

    marketGood.stock = rn(marketGood.stock + 1, 2);
    recordGoodFlow({ direction: "source", category: "burgCraft", goodId: good.i, units: 1, marketId });
    return "fulfilled";
  }

  /** Adds material extracted by a mine before monthly market-price calculation. */
  addMineSupply(
    marketId: number,
    goodId: number,
    amount: number,
    category: "mineSupply" | "smelterSupply" | "clearanceSupply" = "mineSupply"
  ): number {
    const market = this.get(marketId);
    const good = Goods.get(goodId);
    if (!market || !good || !isGoodEnabled(good) || amount <= 0) return 0;
    const supplied = rn(amount, 4);
    const marketGood = this.getMarketGood(market, good);
    marketGood.stock = rn(marketGood.stock + supplied, 4);
    recordGoodFlow({ direction: "source", category, goodId, units: supplied, marketId });
    return supplied;
  }

  /** Adds refined material from a smelter before monthly market-price calculation. */
  addSmelterSupply(marketId: number, goodId: number, amount: number): number {
    return this.addMineSupply(marketId, goodId, amount, "smelterSupply");
  }

  /**
   * Smelters consume a bounded share of local Ore stock so markets keep material
   * available for trade while refining capacity is developing.
   */
  consumeForSmelting(
    marketId: number,
    goodId: number,
    requestedUnits: number,
    stockShare: number,
    category: "smelting" | "construction" = "smelting"
  ): number {
    const market = this.get(marketId);
    const marketGood = market?.goods[goodId];
    if (!marketGood || requestedUnits <= 0 || stockShare <= 0) return 0;
    const consumed = rn(Math.min(requestedUnits, marketGood.stock * Math.min(1, stockShare)), 4);
    if (consumed <= 0) return 0;
    marketGood.stock = rn(Math.max(0, marketGood.stock - consumed), 4);
    recordGoodFlow({ direction: "sink", category, goodId, units: consumed, marketId });
    return consumed;
  }

  /**
   * Masons/carpenters draw a bounded share of local Stone/Wood stock, mirroring
   * consumeForSmelting (docs/plan/urban-construction-industry.md §3.3). A free, bounded draw
   * rather than a paid investment: construction consumes raw material as an internal
   * production input the same way smelting consumes ore, not as capital spending.
   */
  consumeForConstruction(marketId: number, goodId: number, requestedUnits: number, stockShare: number): number {
    return this.consumeForSmelting(marketId, goodId, requestedUnits, stockShare, "construction");
  }

  /**
   * Removes no more than one fifth of a metal's local stock for state minting.
   * The cap leaves a market reserve for private trade and production; the caller
   * records the resulting currency in its own ledger rather than creating Coins Good stock.
   */
  consumeForMint(marketId: number, goodId: number, requestedUnits: number): number {
    const market = this.get(marketId);
    const marketGood = market?.goods[goodId];
    if (!marketGood || requestedUnits <= 0) return 0;
    const consumed = rn(Math.min(requestedUnits, marketGood.stock * 0.2), 4);
    if (consumed <= 0) return 0;
    marketGood.stock = rn(Math.max(0, marketGood.stock - consumed), 4);
    recordGoodFlow({ direction: "sink", category: "minting", goodId, units: consumed, marketId });
    return consumed;
  }

  /**
   * State armories may draw from a market, but retain two thirds of each stock
   * for civilian workshops and trade. The caller records any shortage in its
   * military-resource ledger.
   */
  consumeForMilitary(marketId: number, goodId: number, requestedUnits: number): number {
    const market = this.get(marketId);
    const marketGood = market?.goods[goodId];
    if (!marketGood || requestedUnits <= 0) return 0;
    const consumed = rn(Math.min(requestedUnits, marketGood.stock / 3), 4);
    if (consumed <= 0) return 0;
    marketGood.stock = rn(Math.max(0, marketGood.stock - consumed), 4);
    recordGoodFlow({ direction: "sink", category: "military", goodId, units: consumed, marketId });
    return consumed;
  }

  /**
   * Delivers finished Goods to an accepted Metallurg work order. It shares the armory's
   * conservative stock cap so an order cannot drain the market before civilian demand and trade.
   * The caller selects the accounting category: state armories are military; urban Tool work is
   * ordinary Burg demand.
   */
  consumeForMetallurg(
    marketId: number,
    goodId: number,
    requestedUnits: number,
    category: "military" | "burgDemand"
  ): number {
    const market = this.get(marketId);
    const marketGood = market?.goods[goodId];
    if (!marketGood || requestedUnits <= 0) return 0;
    const consumed = rn(Math.min(requestedUnits, marketGood.stock / 3), 4);
    if (consumed <= 0) return 0;
    marketGood.stock = rn(Math.max(0, marketGood.stock - consumed), 4);
    recordGoodFlow({ direction: "sink", category, goodId, units: consumed, marketId });
    return consumed;
  }

  /**
   * Buys up to `requestedUnits` of a Good from local market stock at the going customer price,
   * capped by available stock, `budget`, and (optionally) `maxStockShare`. Unlike
   * consumeForSmelting/consumeForMilitary (free draws recorded elsewhere), this spends real money
   * and reports the cost so the caller can debit its own account (e.g. MarketTreasury.balance in
   * AgTechInvestment.settleAnnual — docs/plan/rural-agtech-investment.md §3.3). Charges no
   * Deal/tax; this is capital investment by the market itself, not a Burg purchase.
   *
   * `maxStockShare` (0..1, default 1 — every existing caller predates this parameter and keeps its
   * exact prior behavior by omitting it) caps the draw to that fraction of CURRENT stock, the same
   * "leave the rest for other consumers" idea consumeForConstruction/consumeForMint/
   * consumeForMilitary/consumeForMetallurg already apply to their own free draws below. Pass it
   * whenever this Good already has another, more established consumer sharing the same market
   * stock with no coordination between the two — e.g. urbanWaterModernTreatment.ts's Alum/Lime
   * purchases, which would otherwise be able to exhaust a market's entire Lime stock ahead of
   * constructionEmployment.ts's Roman Concrete manufacturing (or vice versa) purely by which one's
   * settle step happens to run first in a given cycle.
   */
  consumeForMarketInvestment(
    marketId: number,
    goodId: number,
    requestedUnits: number,
    budget: number,
    maxStockShare: number = 1
  ): { units: number; cost: number } {
    const market = this.get(marketId);
    const marketGood = market?.goods[goodId];
    const good = Goods.get(goodId);
    if (!market || !marketGood || !good || !isGoodEnabled(good) || requestedUnits <= 0 || budget <= 0) {
      return { units: 0, cost: 0 };
    }

    const price = this.customerBuyPrice(marketGood.price, market.centerBurgId, goodId);
    if (price <= 0) return { units: 0, cost: 0 };

    const affordableUnits = budget / price;
    const stockCap = marketGood.stock * Math.min(1, Math.max(0, maxStockShare));
    const units = rn(Math.min(requestedUnits, stockCap, affordableUnits), 4);
    if (units <= 0) return { units: 0, cost: 0 };

    const cost = rn(units * price, 2);
    marketGood.stock = rn(Math.max(0, marketGood.stock - units), 4);
    recordGoodFlow({ direction: "sink", category: "marketInvestment", goodId, units, marketId });
    // The market sold the goods: the buyer's money reaches its cash (docs/plan/money-supply-mint.md §4.2).
    const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
    treasury.balance = rn(treasury.balance + cost, 2);
    market.marketTreasury = treasury;
    return { units, cost };
  }

  generate(regenerate: boolean = false): Market[] {
    TIME && console.time("generateMarkets");
    this.invalidateTradeRouteCache();
    this.invalidateRuralProductionCache();
    if (!regenerate) Math.random = Alea(this.worldContext.seed);
    const markets = this.createMarkets();
    this.expandMarkets(markets);

    setMarkets(markets);
    setDeals([]);
    MerchantTransportAssets.clear();
    TransportAssetOrders.clear();
    // Market ids are regenerated together with territories, so a cohort tied to a
    // previous market map must not be reused for a different settlement network.
    setStrategicLaborMarkets([]);
    syncMarketManagers(markets);
    syncBurgMarketLedgers(markets);

    TIME && console.timeEnd("generateMarkets");
    return markets;
  }

  /**
   * Frontier-style maps keep political control on small homelands. The merchants
   * who opened those homelands stay with the polity: one market per state, and
   * the market's catchment is exactly the state's governed land.
   */
  usesStateBoundedTerritories(): boolean {
    const pattern = this.worldContext.options?.initialSettlementPattern;
    return pattern === "frontier" || pattern === "marches" || pattern === "scattered";
  }

  /**
   * Frontier merchants stay with their polity. A missing or foreign state id is
   * not a domestic pair, even when a river happens to connect two capitals.
   */
  isDomesticTradePair(source: Pick<Burg, "state" | "cell">, target: Pick<Burg, "state" | "cell">): boolean {
    if (!this.usesStateBoundedTerritories()) return true;
    const states = this.worldContext.pack.cells.state;
    const sourceState = source.state || states?.[source.cell] || 0;
    const targetState = target.state || states?.[target.cell] || 0;
    return sourceState > 0 && sourceState === targetState;
  }

  /**
   * Re-stamps every claimed cell onto its state's market. Returns true when any
   * cell or burg assignment changed, so callers can rebuild rural caches.
   */
  syncStateBoundedTerritories(): boolean {
    if (!this.usesStateBoundedTerritories()) return false;
    const markets = getMarkets();
    if (!markets.length) return false;

    const previous = getMarketCellColumn();
    this.indexMarkets(markets);
    const next = this.assignMarketsToStateTerritories(markets);
    const changed = previous.length !== next.length || previous.some((marketId, cellId) => marketId !== next[cellId]);
    if (changed) {
      moveRuralPursesWithFarms(previous, next);
      this.invalidateRuralProductionCache();
    }
    return changed;
  }

  private createMarkets(): Market[] {
    this.marketById = [];
    const markets = this.usesStateBoundedTerritories() ? this.createOneMarketPerState() : this.createSpacedMarkets();
    const colors = getColors(markets.length);
    markets.forEach((m, i) => {
      m.color = colors[i];
    });
    return markets;
  }

  private createOneMarketPerState(): Market[] {
    const { burgs, states } = this.worldContext.pack;
    const markets: Market[] = [];

    for (const state of states ?? []) {
      if (!state?.i || state.removed) continue;
      const capital = burgs[state.capital];
      const center =
        capital?.i && !capital.removed
          ? capital
          : burgs.find(burg => burg.i && !burg.removed && burg.state === state.i);
      if (!center?.i) continue;

      const market = this.makeEmptyMarket(markets.length + 1, center.i);
      markets.push(market);
      this.marketById[market.i] = market;
    }

    return markets;
  }

  private createSpacedMarkets(): Market[] {
    // Score each burg by population; capitals and ports are weighted higher
    const scored = this.worldContext.pack.burgs
      .map(burg => {
        let score = burg.population || 0;
        if (burg.capital) score *= 2.5;
        if (burg.port) score *= 1.2;
        score *= Math.random() * 2 + 0.5; // add some noise
        return { burg, score };
      })
      .sort((a, b) => b.score - a.score);

    // minSpacing scales with map size relative to burg count
    let minSpacing =
      (((this.worldContext.graphWidth + this.worldContext.graphHeight) * 2) /
        pow(this.worldContext.pack.burgs.length, 0.6)) |
      0;

    const markets: Market[] = [];
    const tree = quadtree<[number, number, number]>(
      [],
      d => d[0],
      d => d[1]
    );

    for (const { burg } of scored) {
      if (!burg.i || burg.removed) continue;
      const { x, y } = burg;
      const nearest = tree.find(x, y, minSpacing);
      if (!nearest) {
        const market = this.makeEmptyMarket(markets.length + 1, burg.i);
        markets.push(market);
        this.marketById[market.i] = market;
        tree.add([x, y, market.i]);
        minSpacing += 1;
      }
    }

    return markets;
  }

  private makeEmptyMarket(marketId: number, centerBurgId: number): Market {
    return {
      i: marketId,
      centerBurgId,
      color: "",
      goods: {},
      warehouseSecurity: 50,
      warehouseSanitation: 50
    };
  }

  expandTerritories(markets: Market[] = getMarkets()): Uint16Array {
    this.indexMarkets(markets);
    const previous = getMarketCellColumn();
    const territories = this.expandMarkets(markets);
    moveRuralPursesWithFarms(previous, territories);
    this.invalidateRuralProductionCache();
    return territories;
  }

  private indexMarkets(markets: Market[] = getMarkets()): void {
    this.marketById = [];
    for (const market of markets) if (market) this.marketById[market.i] = market;
  }

  public sync(): void {
    this.indexMarkets();
    // A loaded map replaces route and market objects in place. Drop any routes
    // retained from the previous map before its first trade settlement.
    this.invalidateTradeRouteCache();
    this.invalidateRuralProductionCache();
  }

  private expandMarkets(markets: Market[]): Uint16Array {
    return this.usesStateBoundedTerritories()
      ? this.assignMarketsToStateTerritories(markets)
      : this.floodFillMarketTerritories(markets);
  }

  private findMarketForState(stateId: number, markets: Market[] = getMarkets()): Market | undefined {
    if (!stateId) return undefined;
    const { burgs, states } = this.worldContext.pack;
    const capitalId = states?.[stateId]?.capital;
    if (capitalId) {
      const capitalMarket = markets.find(market => market.centerBurgId === capitalId);
      if (capitalMarket) return capitalMarket;
    }
    return markets.find(market => burgs[market.centerBurgId]?.state === stateId);
  }

  /**
   * One market per polity: every governed land cell belongs to that state's
   * merchants. Wilderness stays unassigned so a three-cell opening does not
   * swallow the continent.
   */
  private assignMarketsToStateTerritories(markets: Market[]): Uint16Array {
    const cells = this.worldContext.pack.cells;
    const burgs = this.worldContext.pack.burgs;
    const goodCellColumn = getGoodCellColumn();
    const cellMarket = new Uint16Array(cells.i.length);
    const marketByState = new Map<number, number>();
    const tradeCenters = {} as Record<number, boolean>;

    for (const market of markets) {
      const centerBurg = burgs[market.centerBurgId];
      if (!centerBurg) continue;
      tradeCenters[centerBurg.i!] = true;
      const stateId = centerBurg.state || cells.state?.[centerBurg.cell] || 0;
      if (stateId && !marketByState.has(stateId)) marketByState.set(stateId, market.i);
      cellMarket[centerBurg.cell] = market.i;
    }

    for (const cellId of cells.i) {
      const stateId = cells.state?.[cellId] ?? 0;
      const marketId = marketByState.get(stateId);
      if (!marketId) continue;
      if (cells.h[cellId] < 20 && !goodCellColumn[cellId]) continue;
      cellMarket[cellId] = marketId;
    }

    // Coastal water goods belong to the adjacent homeland, not a void market.
    for (const cellId of cells.i) {
      if (cellMarket[cellId] || cells.h[cellId] >= 20 || !goodCellColumn[cellId]) continue;
      for (const neighborId of cells.c[cellId] ?? []) {
        const neighborMarket = cellMarket[neighborId];
        if (neighborMarket) {
          cellMarket[cellId] = neighborMarket;
          break;
        }
      }
    }

    setMarketCellColumn(cellMarket);

    for (const burg of burgs) {
      if (!burg.i || burg.removed) continue;
      burg.market = cellMarket[burg.cell] || 0;
      burg.plaza = burg.plaza || tradeCenters[burg.i] ? 1 : 0;
    }

    return cellMarket;
  }

  private floodFillMarketTerritories(markets: Market[]): Uint16Array {
    const cells = this.worldContext.pack.cells;
    const goodCellColumn = getGoodCellColumn();
    const cellMarket = new Uint16Array(cells.i.length);
    const costs: number[] = [];
    type QueueEntry = { cellId: number; marketId: number; burg: Burg; priority: number };
    const queue = new FlatQueue<QueueEntry>();

    const MIN_COST = 1;
    const BASE_COST = 10;
    const DIFFERENT_STATE_COST = 100;
    const WATER_COST = 50;
    const WATER_COST_FOR_NON_PORTS = 50;
    const ISLAND_CHANGE_COST = 100;

    const tradeCenters = {} as Record<number, boolean>;
    for (const market of markets) {
      const centerBurg = this.worldContext.pack.burgs[market.centerBurgId];
      if (!centerBurg) continue;
      tradeCenters[centerBurg.i!] = true;

      const startCell = centerBurg.cell;
      cellMarket[startCell] = market.i;
      costs[startCell] = MIN_COST;

      queue.push({ cellId: startCell, marketId: market.i, burg: centerBurg, priority: 0 }, 0);
    }

    while (queue.length) {
      const { cellId, marketId, burg, priority } = queue.pop()!;

      for (const neighborId of cells.c[cellId]) {
        const isWater = cells.h[neighborId] < 20;
        let cost = BASE_COST;
        if (isWater) {
          cost += WATER_COST;
          if (burg.port !== cells.f[neighborId]) cost += WATER_COST_FOR_NON_PORTS;
        } else {
          if (cells.f[burg.cell] !== cells.f[neighborId]) cost += ISLAND_CHANGE_COST;
          if (cells.state[neighborId] && burg.state !== cells.state[neighborId]) cost += DIFFERENT_STATE_COST;
        }

        const totalCost = priority + cost;
        if (!costs[neighborId] || totalCost < costs[neighborId]) {
          costs[neighborId] = totalCost;
          queue.push({ cellId: neighborId, marketId, burg, priority: totalCost }, totalCost);

          const hasGood = Boolean(goodCellColumn[neighborId]);
          if (isWater && !hasGood) continue; // exclude water cells without goods

          cellMarket[neighborId] = marketId;
        }
      }
    }

    setMarketCellColumn(cellMarket);

    for (const burg of this.worldContext.pack.burgs) {
      if (!burg.i || burg.removed) continue;
      burg.market = cellMarket[burg.cell] || 0;
      burg.plaza = burg.plaza || tradeCenters[burg.i] ? 1 : 0;
    }

    return cellMarket;
  }

  collectRuralProduction(): void {
    const populationSnapshotPeriod = this.getRuralPopulationSnapshotPeriod();
    const index =
      this.ruralProductionIndex?.populationSnapshotPeriod === populationSnapshotPeriod
        ? this.ruralProductionIndex
        : this.buildRuralProductionIndex(populationSnapshotPeriod);
    const monthIndex = Math.max(0, Math.min(11, getSimulationMonth() - 1));

    const wood = getGoods().find(g => g.name === "Wood");
    if (wood && isGoodEnabled(wood)) this.supplyRuralWood(wood, index);

    this.applyRuralTotals(index.standard);

    this.settleCellFreshFood(index.freshFood, monthIndex);

    for (const [marketId, totalsByState] of index.food) {
      for (const totalsByCollectionBurg of totalsByState.values()) {
        for (const [collectionBurgId, totals] of totalsByCollectionBurg) {
          for (const [goodId, monthlyTotals] of totals) {
            this.addRuralOutput(marketId, collectionBurgId, goodId, monthlyTotals[monthIndex]);
          }
        }
      }
    }
  }

  /**
   * Rural Wood (docs/plan/farm-labour-calibration.md §19). Rural households cut their own heating
   * and cooking fuel first; clearance timber serves that fuel before standing forest is cut. Wood
   * for sale is cut only up to the stock the market draws down; unneeded clearance timber is
   * burned where it fell and unneeded standing forest is left standing.
   */
  private supplyRuralWood(wood: Good, index: RuralProductionIndex): void {
    const fuelDemands = getMonthlyHouseholdFuelDemands();
    // What each inhabited forest cell could give this month, split among the collection towns
    // that gather from it in proportion to their share of its wood.
    const cellPotentials: { cellId: number; marketId: number; collectionBurgId: number; units: number }[] = [];
    const potentialByMarket = new Map<number, number>();
    for (const [cellId, contributions] of index.woodByCell) {
      const woodContributions = contributions.filter(contribution => contribution.goodId === wood.i);
      const weight = woodContributions.reduce((sum, contribution) => sum + contribution.amount, 0);
      if (!(weight > 0)) continue;
      const fellable = getFellableWood(cellId) * RURAL_MONTHLY_FELLING_SHARE;
      if (!(fellable > 0)) continue;
      for (const contribution of woodContributions) {
        const units = (fellable * contribution.amount) / weight;
        cellPotentials.push({ cellId, ...contribution, units });
        potentialByMarket.set(contribution.marketId, (potentialByMarket.get(contribution.marketId) ?? 0) + units);
      }
    }

    const plans = new Map<number, RuralWoodPlan>();
    for (const market of getMarkets()) {
      const potential = potentialByMarket.get(market.i) ?? 0;
      const demand = fuelDemands.get(market.i);
      const ruralFuelDemand = demand?.ruralDemand ?? 0;
      const ruralBuildingDemand = (index.buildingTimberByMarket.get(market.i) ?? 0) / 12;
      const urbanDemand = demand?.urbanDemand ?? 0;
      const stock = market.goods[wood.i]?.stock ?? 0;
      const previous = market.woodSupply;
      // Town households always buy; rural ones buy what their own forest cannot give.
      const knownDraw = urbanDemand + Math.max(0, ruralFuelDemand - potential);
      const smoothedDraw = previous
        ? previous.smoothedDraw +
          (Math.max(0, previous.stockAfterSupply - stock) - previous.smoothedDraw) * WOOD_DRAW_SMOOTHING
        : knownDraw;
      const targetStock = WOOD_STOCK_COVER_MONTHS * Math.max(smoothedDraw, knownDraw);
      plans.set(market.i, {
        market,
        potential,
        ruralFuelDemand,
        ruralBuildingDemand,
        // Fuel and building timber are cut together; heating takes its share first.
        fuelLeft: ruralFuelDemand + ruralBuildingDemand,
        saleLeft: Math.max(0, targetStock - stock),
        ruralFuelWood: 0,
        marketWood: 0,
        clearanceBurned: 0,
        smoothedDraw
      });
    }

    // Clearance timber is already felled: it serves rural fuel, then sale, and the rest is burned
    // on the spot, so every pending receipt is settled this month.
    deliverConversionTimber(this.worldContext, (cellId, coverage) => {
      const plan = plans.get(getMarketCellColumn()[cellId]);
      if (!plan) return 0;
      const units = woodUnitsForCoverage(cellId, coverage);
      const fuel = Math.min(units, plan.fuelLeft);
      plan.fuelLeft -= fuel;
      plan.ruralFuelWood += fuel;
      const sale = Math.min(units - fuel, plan.saleLeft);
      const sold = sale > 0 ? this.addMineSupply(plan.market.i, wood.i, sale, "clearanceSupply") : 0;
      plan.saleLeft -= sold;
      plan.marketWood += sold;
      plan.clearanceBurned += units - fuel - sold;
      return coverage;
    });

    const cutShares = new Map<number, number>();
    for (const plan of plans.values()) {
      if (plan.potential > 0)
        cutShares.set(plan.market.i, Math.min(1, (plan.fuelLeft + plan.saleLeft) / plan.potential));
    }
    const harvestByMarket = new Map<number, Map<number, number>>();
    for (const contribution of cellPotentials) {
      const share = cutShares.get(contribution.marketId) ?? 0;
      if (share <= 0) continue;
      const harvested = harvestWood(contribution.cellId, contribution.units * share);
      if (harvested <= 0) continue;
      const byBurg = harvestByMarket.get(contribution.marketId) ?? new Map<number, number>();
      byBurg.set(contribution.collectionBurgId, (byBurg.get(contribution.collectionBurgId) ?? 0) + harvested);
      harvestByMarket.set(contribution.marketId, byBurg);
    }

    const monthKey = getWoodSupplyMonthKey();
    for (const plan of plans.values()) {
      const byBurg = harvestByMarket.get(plan.market.i);
      const harvested = byBurg ? [...byBurg.values()].reduce((sum, units) => sum + units, 0) : 0;
      const fuel = Math.min(harvested, plan.fuelLeft);
      plan.ruralFuelWood += fuel;
      const saleShare = harvested > 0 ? (harvested - fuel) / harvested : 0;
      if (byBurg && saleShare > 0) {
        for (const [collectionBurgId, units] of byBurg) {
          this.addRuralOutput(plan.market.i, collectionBurgId, wood.i, units * saleShare);
        }
        plan.marketWood += harvested - fuel;
      }
      plan.market.woodSupply = {
        monthKey,
        ruralFuelDemand: rn(plan.ruralFuelDemand, 4),
        ruralBuildingDemand: rn(plan.ruralBuildingDemand, 4),
        ruralFuelWood: rn(plan.ruralFuelWood, 4),
        marketWood: rn(plan.marketWood, 4),
        clearanceBurned: rn(plan.clearanceBurned, 4),
        stockAfterSupply: rn(plan.market.goods[wood.i]?.stock ?? 0, 4),
        smoothedDraw: rn(plan.smoothedDraw, 4)
      };
    }
  }

  /** Rebuild rural market totals after an editor changes market territories or source data. */
  invalidateRuralProductionCache(): void {
    this.ruralProductionIndex = null;
  }

  private getMarketGood(market: Market, good: Good): Market["goods"][number] {
    const existing = market.goods[good.i];
    if (existing) return existing;

    const initial: Market["goods"][number] = { stock: 0, price: good.value };
    market.goods[good.i] = initial;
    return initial;
  }

  // getRuralProductionContributions() bakes in getModifiers(), which can key off
  // state/religion/culture/zone (not just cultureType/biome). Those only change via
  // conquest, conversion, migration, or zone edits, none of which call
  // invalidateRuralProductionCache() today, so such a multiplier would stay stale
  // until the next quarterly rebuild. Harmless while every good's multipliers key
  // only on cultureType/biome (static per cell) — revisit if that changes.
  private buildRuralProductionIndex(populationSnapshotPeriod: string): RuralProductionIndex {
    const index: RuralProductionIndex = {
      populationSnapshotPeriod,
      standard: new Map(),
      food: new Map(),
      woodByCell: new Map(),
      buildingTimberByMarket: new Map(),
      freshFood: []
    };
    const { cells } = this.worldContext.pack;
    const markets = getMarkets();
    const marketCellColumn = getMarketCellColumn();
    const marketIds = new Set(markets.map(market => market.i));
    const collectionBurgsByMarket = this.getCollectionBurgsByMarket();
    const biomeProduction = Goods.getBiomesProduction();
    const populationRate = Math.max(1, this.worldContext.populationRate ?? 1);

    for (const cellId of cells.i) {
      const marketId = marketCellColumn[cellId];
      if (!marketId || !marketIds.has(marketId)) continue;
      const collectionBurgId = this.getCollectionBurgId(cellId, marketId, collectionBurgsByMarket);
      if ((cells.h?.[cellId] ?? 0) >= 20 && (cells.pop?.[cellId] ?? 0) > 0) {
        const recipe = getHousingRecipe({
          cultureType: this.worldContext.pack.cultures?.[cells.culture?.[cellId] ?? 0]?.type,
          hasQuarryAccess: true,
          highFantasy: false,
          brickAvailable: true
        });
        const timber =
          ((cells.pop[cellId] * populationRate) / 1000) *
          RURAL_BUILDING_TIMBER_PER_1000_RESIDENTS_ANNUAL *
          getHouseTimberShare(recipe);
        index.buildingTimberByMarket.set(marketId, (index.buildingTimberByMarket.get(marketId) ?? 0) + timber);
      }

      for (const contribution of getRuralProductionContributions(cellId, biomeProduction)) {
        const good = Goods.get(contribution.goodId);
        if (!good || !isGoodEnabled(good) || contribution.amount <= 0) continue;
        // stapleFood (Grain in v1) is produced/consumed by the Food Ledger's own quarterly/monthly
        // pipeline (foodProduction.ts / foodLedgerConsumption.ts) instead of this generic path.
        if (good.tags.includes("stapleFood")) continue;

        if (good.name === "Wood") {
          const entries = index.woodByCell.get(cellId) ?? [];
          entries.push({ marketId, collectionBurgId, goodId: good.i, amount: contribution.amount });
          index.woodByCell.set(cellId, entries);
          continue;
        }

        if (getFreshFoodProfile(good)) {
          index.freshFood.push({
            cellId,
            marketId,
            collectionBurgId,
            goodId: good.i,
            monthlyUnits: Array.from(
              { length: 12 },
              (_, monthIndex) => contribution.amount * getSeasonalFoodProductionMultiplier(good, cellId, monthIndex + 1)
            )
          });
          continue;
        }

        if (good.tags.includes("food")) {
          const stateId = cells.state?.[cellId] ?? 0;
          const totalsByState = index.food.get(marketId) ?? new Map<number, Map<number, Map<number, number[]>>>();
          const totalsByCollectionBurg = totalsByState.get(stateId) ?? new Map<number, Map<number, number[]>>();
          const totals = totalsByCollectionBurg.get(collectionBurgId) ?? new Map<number, number[]>();
          const monthlyTotals = totals.get(good.i) ?? Array.from({ length: 12 }, () => 0);
          for (let month = 1; month <= 12; month++) {
            monthlyTotals[month - 1] += contribution.amount * getSeasonalFoodProductionMultiplier(good, cellId, month);
          }
          totals.set(good.i, monthlyTotals);
          totalsByCollectionBurg.set(collectionBurgId, totals);
          totalsByState.set(stateId, totalsByCollectionBurg);
          index.food.set(marketId, totalsByState);
          continue;
        }

        this.addRuralGoodTotal(index.standard, marketId, collectionBurgId, good.i, contribution.amount);
      }
    }

    this.ruralProductionIndex = index;
    return index;
  }

  /**
   * Rural population changes continuously under the demographics simulation, so a
   * topology cache cannot be permanent. Refreshing at the quarterly food-ledger
   * cadence bounds that drift while reducing the normal 12 monthly cell scans to
   * four snapshots per simulated year.
   */
  private getRuralPopulationSnapshotPeriod(): string {
    const month = getSimulationMonth();
    const year = getSimulationYear();
    return `${year}:${Math.floor((month - 1) / 3)}`;
  }

  private applyRuralTotals(totalsByMarket: RuralTotalsByMarket): void {
    for (const [marketId, totalsByCollectionBurg] of totalsByMarket) {
      for (const [collectionBurgId, totals] of totalsByCollectionBurg) {
        for (const [goodId, amount] of totals) this.addRuralOutput(marketId, collectionBurgId, goodId, amount);
      }
    }
  }

  /**
   * Fresh food is a cell-local activity. It is consumed or preserved before reaching the Market;
   * only shelf-stable output above the cell's own reserve becomes normal commercial stock.
   */
  private settleCellFreshFood(entries: readonly FreshFoodContribution[], monthIndex: number): void {
    const entriesByCell = new Map<number, FreshFoodContribution[]>();
    for (const entry of entries) {
      const units = entry.monthlyUnits[monthIndex] ?? 0;
      if (units <= 0) continue;
      const group = entriesByCell.get(entry.cellId) ?? [];
      group.push(entry);
      entriesByCell.set(entry.cellId, group);
    }

    // State-wide cold-chain pool (docs/plan/mechanical-refrigeration-and-cold-chain.md §3.5
    // decision 1 — no two-stage local/State-wide split like powerGrid). Annual storageCapacity is
    // month-sliced here and shared across every cell in the same state processed by this call;
    // an un-adopted State's depots simply do not exist, so its pool is naturally 0 — no separate
    // technology-stage check is needed (§3.7).
    const cellStates = this.worldContext.pack.cells.state;
    const coldStorageCapacityByState = new Map<number, number>();
    for (const depot of getColdStorageDepots()) {
      if (!depot.active) continue;
      const monthly = depot.storageCapacity / 12;
      coldStorageCapacityByState.set(depot.stateId, (coldStorageCapacityByState.get(depot.stateId) ?? 0) + monthly);
    }

    const reserves = getOrCreateCellFoodReserves();
    for (const [cellId, cellEntries] of entriesByCell) {
      const residentWorkforce = getRuralCellPopulation(cellId);
      const inputs: CellFreshFoodInput[] = [];
      const marketBySourceGood = new Map<number, FreshFoodContribution>();
      const harvestedBySourceGood = new Map<number, number>();

      for (const entry of cellEntries) {
        const sourceGood = Goods.get(entry.goodId);
        const freshFoodProfile = sourceGood ? getFreshFoodProfile(sourceGood) : null;
        if (!sourceGood || !freshFoodProfile) continue;
        const reservePath = this.getCellFoodReservePath(sourceGood);
        const commercialPath = this.getCellFoodCommercialPath(sourceGood, reservePath);
        const market = this.marketById[entry.marketId];
        if (!market) continue;
        const exportDemandUnits = commercialPath
          ? this.getCellPreservedFoodExportDemand(market, commercialPath.outputGoodId, residentWorkforce)
          : 0;
        inputs.push({
          sourceGoodId: sourceGood.i,
          harvestedUnits: entry.monthlyUnits[monthIndex] ?? 0,
          householdDemandUnits: residentWorkforce * freshFoodProfile.householdDemandPerPopulationMonth,
          maxFreshHouseholdShare: freshFoodProfile.maxFreshHouseholdShare,
          emergencyReserveDemandUnits:
            (market.foodLedger?.ruralFoodStressQuarters ?? 0) > 0
              ? residentWorkforce * freshFoodProfile.householdDemandPerPopulationMonth
              : 0,
          preservationLaborPerUnit: freshFoodProfile.preservationLaborPerUnit,
          reservePath,
          commercialPath,
          exportDemandUnits,
          // Food-preservation supplies are reserved ahead of all non-food work. A future local
          // disaster/siege system may set this false; the planner then records the sole valid spoilage path.
          preservationSuppliesAvailable: reservePath !== null && commercialPath !== null
        });
        marketBySourceGood.set(sourceGood.i, entry);
        harvestedBySourceGood.set(sourceGood.i, entry.monthlyUnits[monthIndex] ?? 0);
      }

      if (!inputs.length) continue;
      const plan = planCellFoodRescue(inputs, reserves?.[cellId] ?? {}, residentWorkforce);
      if (reserves) reserves[cellId] = plan.nextReserve;

      for (const outcome of plan.outcomes) {
        const entry = marketBySourceGood.get(outcome.sourceGoodId);
        const sourceGood = Goods.get(outcome.sourceGoodId);
        const market = entry ? this.marketById[entry.marketId] : undefined;
        if (!entry || !sourceGood || !market) continue;

        // The planner deliberately leaves unhandled potential unproduced. H therefore records
        // only the actual harvest that was eaten, preserved, sold, or (only when supplies fail) spoiled.
        recordCumulativeCellFoodHarvest(sourceGood.i, outcome.producedUnits);
        recordCellFoodHouseholdConsumption(market, sourceGood.name, outcome.eatenFreshUnits);
        if (outcome.reserveInputUnits > 0) {
          recordFoodProcessingConsumption(market, sourceGood.name, outcome.reserveInputUnits);
        }
        const reservePath = this.getCellFoodReservePath(sourceGood);
        if (reservePath && outcome.reserveOutputUnits > 0) {
          recordCumulativeCellFoodReserveOutput(reservePath.outputGoodId, outcome.reserveOutputUnits);
        }
        if (outcome.spoiledForMissingSuppliesUnits > 0) {
          recordGoodFlow({
            direction: "sink",
            category: "spoilage",
            goodId: sourceGood.i,
            units: outcome.spoiledForMissingSuppliesUnits,
            marketId: market.i,
            burgId: entry.collectionBurgId || undefined
          });
        }

        // Cold-chain export: rescues the gap the planner otherwise leaves unrecorded
        // (harvestedUnits - producedUnits) as the raw sourceGood itself, no conversion recipe —
        // independent of whether a commercial (preserved-good) path/demand exists this month.
        // docs/plan/mechanical-refrigeration-and-cold-chain.md §3.6-3.7.
        const stateId = cellStates?.[cellId] ?? 0;
        const availableColdStorage = coldStorageCapacityByState.get(stateId) ?? 0;
        if (availableColdStorage > 0) {
          const harvested = harvestedBySourceGood.get(outcome.sourceGoodId) ?? 0;
          const chilled = getChilledFreshFoodExportUnits(harvested, outcome.producedUnits, availableColdStorage);
          if (chilled > 0) {
            this.addRuralOutput(entry.marketId, entry.collectionBurgId, sourceGood.i, chilled);
            coldStorageCapacityByState.set(stateId, availableColdStorage - chilled);
          }
        }

        const commercialPath = this.getCellFoodCommercialPath(sourceGood, this.getCellFoodReservePath(sourceGood));
        if (!commercialPath || outcome.exportOutputUnits <= 0) continue;
        recordFoodProcessingConsumption(
          market,
          sourceGood.name,
          outcome.exportOutputUnits * commercialPath.inputPerOutput
        );
        this.addRuralOutput(
          entry.marketId,
          entry.collectionBurgId,
          commercialPath.outputGoodId,
          outcome.exportOutputUnits
        );
        this.addCommercialRecipeByproducts(
          entry.marketId,
          entry.collectionBurgId,
          sourceGood,
          commercialPath.outputGoodId,
          commercialPath.inputPerOutput,
          outcome.exportOutputUnits
        );
      }
    }
  }

  /**
   * Cell-local preservation can place recipe outputs (notably Grapes → Wine) directly into a
   * market. Mirror the generic manufacturing engine's m:n contract here so those direct outputs
   * also retain their residue instead of silently discarding it.
   */
  private addCommercialRecipeByproducts(
    marketId: number,
    collectionBurgId: number,
    sourceGood: Good,
    outputGoodId: number,
    sourceInputPerOutput: number,
    outputUnits: number
  ): void {
    const outputGood = Goods.get(outputGoodId);
    if (!outputGood) return;
    for (const byproduct of getCommercialRecipeByproducts(
      outputGood,
      sourceGood.i,
      sourceInputPerOutput,
      outputUnits
    )) {
      this.addRuralOutput(marketId, collectionBurgId, byproduct.goodId, byproduct.units);
    }
  }

  private getCellFoodReservePath(sourceGood: Good): { outputGoodId: number; inputPerOutput: number } | null {
    return this.getCellFoodPath(sourceGood, outputGood => isPreservedFoodGood(outputGood));
  }

  private getCellFoodCommercialPath(
    sourceGood: Good,
    reservePath: { outputGoodId: number; inputPerOutput: number } | null
  ): { outputGoodId: number; inputPerOutput: number } | null {
    // Grapes exist primarily for wine. Raisins remain the source-cell reserve, while this tagged
    // commercial path sends every post-reserve grape lot toward Wine instead of treating raisins
    // as an unlimited export sink.
    const grapeWinePath = this.getCellFoodPath(sourceGood, outputGood => outputGood.tags.includes("grapeWine"));
    return grapeWinePath ?? reservePath;
  }

  private getCellFoodPath(
    sourceGood: Good,
    acceptsOutput: (outputGood: Good) => boolean
  ): { outputGoodId: number; inputPerOutput: number } | null {
    let selected: { outputGoodId: number; inputPerOutput: number; value: number } | null = null;
    for (const outputGood of getGoods()) {
      if (!isGoodEnabled(outputGood) || !acceptsOutput(outputGood)) continue;
      for (const recipe of outputGood.recipes ?? []) {
        const inputPerOutput = recipe[sourceGood.i];
        if (!inputPerOutput || inputPerOutput <= 0) continue;
        if (!selected || outputGood.value > selected.value) {
          selected = { outputGoodId: outputGood.i, inputPerOutput, value: outputGood.value };
        }
      }
    }
    return selected ? { outputGoodId: selected.outputGoodId, inputPerOutput: selected.inputPerOutput } : null;
  }

  /**
   * Commercial food is deliberately modest: safety reserves are filled first, then a price signal
   * may request a small export batch. This prevents a cell from assigning its whole population to
   * preservation while still allowing Cheese, Raisins and preserved meat/fish into the market.
   */
  private getCellPreservedFoodExportDemand(market: Market, goodId: number, residentWorkforce: number): number {
    const good = Goods.get(goodId);
    if (!good || residentWorkforce <= 0) return 0;
    const marketGood = this.getMarketGood(market, good);
    const pricePressure = Math.max(0.25, (marketGood.price || good.value) / Math.max(good.value, 0.001) - 0.75);
    return residentWorkforce * 0.1 * Math.min(1, pricePressure);
  }

  private addRuralOutput(marketId: number, collectionBurgId: number, goodId: number, amount: number): void {
    if (amount <= 0) return;
    const market = this.get(marketId);
    const good = Goods.get(goodId);
    if (!market || !good || !isGoodEnabled(good)) return;

    // Live creatures arrive as lumpy integer catches, not a continuous trickle — see
    // liveAnimalCatch.ts. Banking `amount` below its 1-unit threshold most months is what
    // produces the "catch one, then quiet for a while" pattern instead of a flat monthly gain.
    const resolvedAmount = good.tags.includes("liveAnimal")
      ? rollLiveAnimalCatch(getLiveAnimalCatchKey(marketId, collectionBurgId, goodId), amount)
      : amount;
    if (resolvedAmount <= 0) return;

    const marketGood = this.getMarketGood(market, good);
    marketGood.stock = rn(marketGood.stock + resolvedAmount, 2);
    recordGoodFlow({
      direction: "source",
      category: "ruralHarvest",
      goodId,
      units: resolvedAmount,
      marketId,
      burgId: collectionBurgId || undefined
    });
    recordFoodMarketIntake(market, good.name, resolvedAmount);
    if (collectionBurgId) addWholesaleGoodStock(collectionBurgId, marketId, goodId, resolvedAmount);

    // 2026-08-08 (docs/temp/0807-alcoholic.md): rural/biome-produced goods (Grapes, Milk, Fish, Game,
    // Wood, ...) enter a market's stock through this path, never through sell() below — they're not
    // burg-manufactured, so no Deal/craft-sale event exists for them. Left unrecorded, the Goods
    // Editor's cumulative-sales counter (added earlier this session) only ever moved for craft goods
    // (Wine, Cheese), while their own raw ingredients — produced and consumed just as continuously —
    // sat at ~0, reading as though those goods were never actually reaching the market. Count a rural
    // harvest reaching the market as "sold" too, symmetric with sell()'s own event, and with how
    // getProduction() (economyTotals.ts) already folds rural cell output and burg output into one
    // "Produced" figure.
    const salesTable = getOrCreateCumulativeGoodsSales();
    if (salesTable) salesTable[good.i] = rn((salesTable[good.i] ?? 0) + resolvedAmount, 2);

    // Market-scoped counterpart — see the matching call site in sell() above.
    const marketProductionTable = getOrCreateMarketGoodProductionTotals();
    if (marketProductionTable) {
      const key = `${marketId}:${goodId}`;
      marketProductionTable[key] = rn((marketProductionTable[key] ?? 0) + resolvedAmount, 2);
    }
  }

  private addRuralGoodTotal(
    totalsByMarket: RuralTotalsByMarket,
    marketId: number,
    collectionBurgId: number,
    goodId: number,
    amount: number
  ): void {
    const totalsByCollectionBurg = totalsByMarket.get(marketId) ?? new Map<number, MarketGoodTotals>();
    const totals = totalsByCollectionBurg.get(collectionBurgId) ?? new Map<number, number>();
    totals.set(goodId, (totals.get(goodId) ?? 0) + amount);
    totalsByCollectionBurg.set(collectionBurgId, totals);
    totalsByMarket.set(marketId, totalsByCollectionBurg);
  }

  /** Valid Burg depots grouped by the market they physically serve. */
  private getCollectionBurgsByMarket(): Map<number, Burg[]> {
    const byMarket = new Map<number, Burg[]>();
    for (const burg of this.worldContext.pack.burgs) {
      if (!burg.i || burg.removed || !burg.market) continue;
      const burgs = byMarket.get(burg.market) ?? [];
      burgs.push(burg);
      byMarket.set(burg.market, burgs);
    }
    return byMarket;
  }

  /**
   * Rural output is collected at the closest active Burg in the same market.
   * A missing depot deliberately returns 0: the canonical market stock still increases and
   * reconciliation later places it at the market center once the topology has a Burg again.
   */
  private getCollectionBurgId(cellId: number, marketId: number, burgsByMarket: ReadonlyMap<number, Burg[]>): number {
    const burgs = burgsByMarket.get(marketId);
    if (!burgs?.length) return 0;

    const point = this.worldContext.pack.cells.p?.[cellId];
    if (!point) {
      const market = this.marketById[marketId];
      return burgs.find(burg => burg.i === market?.centerBurgId)?.i ?? burgs[0].i!;
    }

    let closest = burgs[0];
    let closestDistance = Math.hypot((closest.x ?? 0) - point[0], (closest.y ?? 0) - point[1]);
    for (const burg of burgs.slice(1)) {
      const distance = Math.hypot((burg.x ?? 0) - point[0], (burg.y ?? 0) - point[1]);
      if (distance < closestDistance || (distance === closestDistance && burg.i! < closest.i!)) {
        closest = burg;
        closestDistance = distance;
      }
    }
    return closest.i!;
  }

  initializeMarketPrices(): void {
    // stapleFood (Grain) pricing is owned by foodLedgerConsumption.ts's monthly settlement.
    const goods = getGoods()
      .filter(isGoodEnabled)
      .filter(good => !good.tags.includes("stapleFood"));
    const consumerDemandFactors = this.collectConsumerDemand(goods);
    const industrialDemandFactors = this.collectIndustrialDemand(goods, consumerDemandFactors);
    const avgIngredientsCostByGood = this.calculateAverageBaseCostByGood(goods);
    const populationByMarket = this.calculatePopulationByMarket();
    const textilePopulationByMarket = this.calculateTextilePopulationByMarket();
    // Ore and Ingots have no cell distribution and no recipe, so neither pass priced them: their
    // price only moved when a sale or a failed purchase pushed it, and a town that never saw an
    // Ingot kept the stale price that made nobody carry one there (docs/plan/farm-labour-calibration.md §17).
    const metalDemandByMarket = this.collectOutstandingStateMetallurgDemand(goods);
    this.addCalibratedMetalInputDemand(goods, metalDemandByMarket);

    for (const market of getMarkets()) {
      const population = populationByMarket[market.i] || 0;
      // Money-supply price level (docs/plan/money-supply-mint.md §4.3): the value every price and
      // price band is reckoned from. 1 when the setting is off.
      const priceLevel = getMarketPriceLevel(market);

      // First pass: raw goods - price from demand/supply ratio
      for (const good of goods) {
        const mineOrFurnaceGood = isMineOrFurnaceGood(good);
        if (!good.distribution && !mineOrFurnaceGood) continue;
        const marketGood = this.getMarketGood(market, good);
        const consumerDemand = consumerDemandFactors[good.i] || 0;
        const industrialDemand = industrialDemandFactors[good.i] || 0;
        const demand =
          this.calculateGoodDemand(
            good,
            population,
            textilePopulationByMarket[market.i] || population,
            consumerDemand,
            industrialDemand,
            marketGood.price
          ) + (mineOrFurnaceGood ? (metalDemandByMarket.get(market.i)?.get(good.i) ?? 0) : 0);
        const ratio = (demand + LAPLACE_PRICE_SMOOTHING) / (marketGood.stock + LAPLACE_PRICE_SMOOTHING);
        const baseValue = good.value * priceLevel;
        const floor = getPriceFloor(good, baseValue);
        const targetPrice = minmax(baseValue * ratio, floor, baseValue * PRICE_CEILING_FACTOR);
        const prevPrice = marketGood.price > 0 ? marketGood.price : baseValue;
        marketGood.price = relaxMarketPrice(prevPrice, targetPrice, floor, baseValue * PRICE_CEILING_FACTOR);
      }

      // Second pass: manufactured goods - average local ingredient cost + demand-scaled value-added.
      // The value-added slice (not the ingredient-cost slice, which stays cost-reflective) shrinks
      // toward zero once a market is oversupplied relative to modeled demand for that specific good
      // and grows when scarce, using the same demand/stock ratio shape as the raw-goods pass above.
      // Without this, a manufactured good's price — and thus its guild's margin-based income
      // (guildTreasury.ts) and the production-decision algorithm's projected gain for it
      // (production-generator.ts) — never responded to how much of it had already piled up unsold,
      // so a handful of high-markup/cheap-input goods (e.g. Paper, Cloth) stayed the most profitable
      // thing to manufacture forever, in every burg, regardless of realistic demand.
      for (const good of goods) {
        if (!good.recipes?.length) continue;
        const marketGood = this.getMarketGood(market, good);
        let totalMarketCost = 0;
        for (const recipe of good.recipes) {
          for (const [ingIdStr, amount] of Object.entries(recipe)) {
            const ingId = +ingIdStr;
            const ing = Goods.get(ingId);
            if (!ing || !isGoodEnabled(ing)) continue;
            totalMarketCost += amount * this.getMarketGood(market, ing).price;
          }
        }
        const avgMarketCost = totalMarketCost / good.recipes.length;
        marketGood.costBasis = rn(avgMarketCost, 2);

        const avgBaseCost = avgIngredientsCostByGood[good.i] ?? 0;
        const baseMarkup = Math.max(0, good.value - avgBaseCost) * priceLevel;

        const consumerDemand = consumerDemandFactors[good.i] || 0;
        const industrialDemand = industrialDemandFactors[good.i] || 0;
        const demand = this.calculateGoodDemand(
          good,
          population,
          textilePopulationByMarket[market.i] || population,
          consumerDemand,
          industrialDemand,
          marketGood.price
        );
        const supplyRatio = (demand + LAPLACE_PRICE_SMOOTHING) / (marketGood.stock + LAPLACE_PRICE_SMOOTHING);
        const demandMarkup = baseMarkup * minmax(supplyRatio, PRICE_FLOOR_FACTOR, PRICE_CEILING_FACTOR);

        const demandPrice = avgMarketCost + demandMarkup;
        const baseValue = good.value * priceLevel;
        const targetPrice = minmax(demandPrice, baseValue * PRICE_FLOOR_FACTOR, baseValue * PRICE_CEILING_FACTOR);
        const prevPrice = marketGood.price > 0 ? marketGood.price : baseValue;
        marketGood.price = relaxMarketPrice(
          prevPrice,
          targetPrice,
          baseValue * PRICE_FLOOR_FACTOR,
          baseValue * PRICE_CEILING_FACTOR
        );
      }
    }
    this.applyLocalTradePriceBias(populationByMarket);
    this.applyMoneySupplyPriceLevel();
  }

  public get(marketId: number | undefined): Market | undefined {
    if (!marketId) return undefined;
    const indexed = this.marketById[marketId];
    if (indexed) return indexed;
    // Loaded maps restore the market array before this in-memory index is rebuilt.
    const market = getMarkets().find(candidate => candidate.i === marketId);
    if (market) this.marketById[marketId] = market;
    return market;
  }

  private applyLocalTradePriceBias(populationByMarket: number[]): void {
    for (const market of getMarkets()) {
      const population = populationByMarket[market.i] || 0;
      const priceLevel = getMarketPriceLevel(market);
      for (const good of getGoods().filter(isGoodEnabled)) {
        if (good.tags.includes("stapleFood")) continue;
        const marketGood = this.getMarketGood(market, good);
        const multiplier = getLocalTradePriceMultiplier({
          good,
          marketId: market.i,
          stock: marketGood.stock,
          population
        });
        const baseValue = good.value * priceLevel;
        marketGood.price = rn(
          minmax(getPriceFloor(good, baseValue), marketGood.price * multiplier, baseValue * PRICE_CEILING_FACTOR),
          2
        );
      }
    }
  }

  /**
   * L7: scale every non-staple mid-price by the state's mint sufficiency. Missing ledgers and
   * the 6–12 month band are a no-op (`getMoneyPriceLevel` = 1), so existing tests and a healthy
   * mint do not move. stapleFood stays on the food-ledger grain price. Under the money-supply
   * model the level is already in each good's base value above, so this is a no-op.
   */
  private applyMoneySupplyPriceLevel(): void {
    for (const market of getMarkets()) {
      const multiplier = getMoneyPriceLevelForMarket(market);
      if (multiplier === 1) continue;
      for (const good of getGoods().filter(isGoodEnabled)) {
        if (good.tags.includes("stapleFood")) continue;
        const marketGood = this.getMarketGood(market, good);
        marketGood.price = rn(
          minmax(marketGood.price * multiplier, good.value * PRICE_FLOOR_FACTOR, good.value * PRICE_CEILING_FACTOR),
          2
        );
      }
    }
  }

  // Display name: the custom name if set, otherwise derived from the center burg.
  public getName(market: Market): string {
    return market.name || this.worldContext.pack.burgs[market.centerBurgId]?.name || `Market ${market.i}`;
  }

  addMarket(burgId: number): Market | null {
    const burg = (this.worldContext.pack.burgs as Burg[])[burgId];
    if (!burg || burg.removed) return null;

    const markets = getMarkets();
    if (markets.some(m => m.centerBurgId === burgId)) {
      return null;
    }

    // A new frontier village is supplied by the merchants who already serve
    // that polity. Do not plant a second market inside the same state.
    if (this.usesStateBoundedTerritories()) {
      const stateId = burg.state || this.worldContext.pack.cells.state?.[burg.cell] || 0;
      const existing = this.findMarketForState(stateId, markets);
      if (existing) {
        const column = getMarketCellColumn();
        if (burg.cell >= 0 && burg.cell < column.length) column[burg.cell] = existing.i;
        burg.market = existing.i;
        burg.plaza = burg.plaza || 1;
        return null;
      }
    }

    const maxId = markets.reduce((max, m) => Math.max(max, m.i), 0);
    const marketId = maxId + 1;
    const market: Market = {
      i: marketId,
      centerBurgId: burgId,
      color: getRandomColor(),
      goods: {},
      warehouseSecurity: 50,
      warehouseSanitation: 50
    };
    markets.push(market);
    setDeals([]);
    this.invalidateTradeRouteCache();
    this.invalidateRuralProductionCache();

    this.indexMarkets();
    getMarketCellColumn()[burg.cell] = marketId;
    burg.market = marketId;
    burg.plaza = 1;
    syncMarketManagers([market]);
    syncBurgMarketLedgers();

    return market;
  }

  removeMarket(marketId: number): boolean {
    const markets = getMarkets();
    const marketIndex = markets.findIndex(m => m.i === marketId);
    if (marketIndex === -1) return false;

    const market = markets[marketIndex];
    const centerBurg = (this.worldContext.pack.burgs as Burg[])[market.centerBurgId];
    if (centerBurg) centerBurg.plaza = 0;

    markets.splice(marketIndex, 1);
    setDeals([]);
    this.invalidateTradeRouteCache();
    this.invalidateRuralProductionCache();

    if (markets.length) {
      this.expandTerritories();
    } else {
      getMarketCellColumn().fill(0);
      for (const burg of this.worldContext.pack.burgs as Burg[]) {
        if (!burg.i || burg.removed) continue;
        burg.market = 0;
        burg.plaza = 0;
      }
    }

    syncBurgMarketLedgers();

    return true;
  }

  quoteMarket(market: Market, goodId: number): { stock: number; buyPrice: number; sellPrice: number } {
    const good = Goods.get(goodId);
    if (!good || !isGoodEnabled(good)) return { stock: 0, buyPrice: 0, sellPrice: 0 };
    const row = this.getMarketGood(market, good);
    return {
      stock: row.stock,
      buyPrice: this.customerBuyPrice(row.price, market.centerBurgId, goodId),
      sellPrice: this.customerSellPrice(row.price, market.centerBurgId, goodId)
    };
  }

  buy({
    burg,
    good,
    units,
    budget = Infinity,
    flow
  }: {
    burg: Burg;
    good: Good;
    units: number;
    budget?: number;
    flow?: {
      category: GoodFlowCategory;
      guildDomain?: ReturnType<typeof getCraftDomainForGood>;
      relatedGoodId?: number;
    };
  }): Deal | null {
    if (!isGoodEnabled(good)) return null;
    // Grain's market row is a mirror of the Food Ledger. Milling debits the tradeable
    // surplus itself. A purchase here would shrink the mirror and leave the reserve.
    if (good.tags?.includes("stapleFood")) return null;
    const market = this.get(burg.market);
    if (!market) return null;

    const marketGood = this.getMarketGood(market, good);
    const unitPrice = this.customerBuyPrice(marketGood.price, burg.i, good.i);

    const actualUnits = rn(Math.min(units, marketGood.stock, budget / unitPrice), 2);
    if (actualUnits < 0.01) return null;

    const deals = getDeals();
    const deal: Deal = {
      i: deals.length,
      seller: market.i,
      sellerType: "market",
      buyer: burg.i!,
      buyerType: "burg",
      good: good.i,
      units: actualUnits,
      price: unitPrice,
      tax: 0
    };
    deals.push(deal);

    marketGood.stock = rn(Math.max(0, marketGood.stock - actualUnits), 2);
    // A Burg purchase is the Market's cash receipt. Without this counterpart, a Market
    // could pay producers but never replenish the purchasing power required next cycle.
    const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
    treasury.balance = rn(treasury.balance + actualUnits * unitPrice, 2);
    market.marketTreasury = treasury;
    recordGoodFlow({
      direction: "sink",
      category: flow?.category ?? "burgDemand",
      goodId: good.i,
      units: actualUnits,
      marketId: market.i,
      burgId: burg.i,
      guildDomain: flow?.guildDomain ?? undefined,
      relatedGoodId: flow?.relatedGoodId
    });
    marketGood.price = rn(this.applyMarketPressure(good.value, marketGood.price, actualUnits), 2);
    return deal;
  }

  sell({
    burg,
    good,
    units,
    taxRate,
    budget = Infinity
  }: {
    burg: Burg;
    good: Good;
    units: number;
    taxRate: number;
    /** Producer-purchase cash reserved for this Burg in the current production cycle. */
    budget?: number;
  }): Deal | null {
    if (!isGoodEnabled(good)) return null;
    const market = this.get(burg.market);
    if (!market || units <= 0) return null;

    const marketGood = this.getMarketGood(market, good);
    const price = this.customerSellPrice(marketGood.price, burg.i, good.i);
    const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
    // General-goods sales are actual wholesale purchases. A Market cannot create a
    // producer's revenue merely by accepting inventory: it needs cash on hand first.
    // `budget` additionally prevents an earlier Burg from consuming another Burg's
    // population-weighted share of that cash.
    const maintenanceReach = 0.25 + 0.75 * (market.maintenanceCondition ?? 1);
    const actualUnits = rn(Math.min(units, budget / price, (treasury.balance * maintenanceReach) / price), 2);
    if (actualUnits < 0.01) return null;
    const grossRevenue = rn(actualUnits * price, 2);
    const tax = rn(actualUnits * price * taxRate, 2);
    treasury.balance = rn(Math.max(0, treasury.balance - grossRevenue), 2);
    market.marketTreasury = treasury;
    marketGood.stock = rn(marketGood.stock + actualUnits, 2);
    recordGoodFlow({
      direction: "source",
      category: "burgCraft",
      goodId: good.i,
      units: actualUnits,
      marketId: market.i,
      burgId: burg.i,
      guildDomain: getCraftDomainForGood(good.name) ?? undefined
    });
    recordFoodMarketIntake(market, good.name, actualUnits);
    // A burg's automatic production reaches its own collection/wholesale depot first.
    // Market.goods remains the canonical market-wide total; this records its physical location.
    addWholesaleGoodStock(burg.i!, market.i, good.i, actualUnits);

    const deals = getDeals();
    const deal: Deal = {
      i: deals.length,
      seller: burg.i!,
      sellerType: "burg",
      buyer: market.i,
      buyerType: "market",
      good: good.i,
      units: actualUnits,
      price,
      tax
    };
    deals.push(deal);

    marketGood.price = rn(this.applyMarketPressure(good.value, marketGood.price, -actualUnits), 2);

    // Cumulative-sales counter for the Goods Editor (docs/temp/0807-alcoholic.md's Balance History
    // investigation surfaced the need for a session-long "units sold" figure distinct from the
    // per-cycle `production` snapshot and the deals list, which is wiped every cycle). Persists until
    // explicitly reset. addRuralOutput() below records the same counter for rural/biome-produced goods,
    // which never reach the market through this burg-manufacture path.
    const salesTable = getOrCreateCumulativeGoodsSales();
    if (salesTable) salesTable[good.i] = rn((salesTable[good.i] ?? 0) + actualUnits, 2);

    // Market-scoped counterpart of the above, keyed "marketId:goodId" — see
    // getOrCreateMarketGoodProductionTotals()'s doc-comment for the consumer (faunaPopulation.ts's
    // §4.5 demand sampling) that needs per-market granularity the world-wide table above can't give.
    const marketProductionTable = getOrCreateMarketGoodProductionTotals();
    if (marketProductionTable) {
      const key = `${market.i}:${good.i}`;
      marketProductionTable[key] = rn((marketProductionTable[key] ?? 0) + actualUnits, 2);
    }

    return deal;
  }

  /**
   * Atomically consumes construction materials from one market for Shipbuilding.
   * Unlike buy(), Phase 8 intentionally does not create a Deal or charge an owner;
   * it only models the physical inventory draw and resulting market price pressure.
   */
  /**
   * `timberCellId` is the woodland the shipyard fells for its own timber: Wood is cut there first
   * and only the rest is bought from the market (docs/plan/farm-labour-calibration.md §21).
   */
  tryConsumeShipbuildingMaterials(
    marketId: number,
    materials: ShipbuildingMaterials,
    timberCellId?: number
  ): ShipbuildingMaterialRequestResult {
    // `marketById` is populated during generation; saved maps can reach this path
    // before an explicit `Markets.sync()`, so retain a canonical pack fallback.
    const market = this.get(marketId) ?? getMarkets().find(candidate => candidate.i === marketId);
    if (!market) return { status: "noMarket" };

    const required: Array<{ good: Good; amount: number; stock: { stock: number; price: number } }> = [];
    const missing: ShipbuildingMaterialShortage = {};

    const fellable = timberCellId !== undefined ? getFellableWood(timberCellId) : 0;
    let felled = 0;
    for (const material of SHIPBUILDING_MATERIAL_IDS) {
      let amount = materials[material];
      const good = getGoods().find(candidate => candidate.name === material);
      if (!good || !isGoodEnabled(good)) return { status: "missingGood" };
      if (material === "Wood") {
        felled = Math.min(amount, fellable);
        amount -= felled;
      }
      if (amount <= 0.000001) continue;

      // Do not call getMarketGood() while validating: creating an empty stock row
      // would itself violate the all-or-nothing contract on a failed request.
      const stock = market.goods[good.i];
      if (!stock || stock.stock + 0.000001 < amount) {
        missing[material] = rn(Math.max(0, amount - (stock?.stock ?? 0)), 2);
        continue;
      }
      required.push({ good, amount, stock });
    }

    // Validate every material before touching a single stock row.
    if (Object.keys(missing).length) return { status: "insufficientMaterials", missing };

    if (felled > 0 && timberCellId !== undefined) harvestWood(timberCellId, felled);
    for (const { good, amount, stock } of required) {
      stock.stock = rn(Math.max(0, stock.stock - amount), 2);
      stock.price = rn(this.applyMarketPressure(good.value, stock.price, amount), 2);
      recordGoodFlow({ direction: "sink", category: "shipbuilding", goodId: good.i, units: amount, marketId });
    }

    return { status: "fulfilled" };
  }

  private buildGlobalTradeContext(): GlobalTradeContext {
    const goods = getGoods().filter(isGoodEnabled);
    const luxuryValueDemand = isLuxuryValueDemandEnabled();
    const fullConsumerDemandFactors = this.collectConsumerDemand(goods);
    // With the value demand on, luxuries are asked for by the towns' budgets instead of per head.
    // Their ingredients keep the per-head derivation so the crafts that make them still source inputs.
    const consumerDemandFactors = luxuryValueDemand
      ? this.collectConsumerDemand(goods, true)
      : fullConsumerDemandFactors;
    const industrialDemandFactors = this.collectIndustrialDemand(goods, fullConsumerDemandFactors);
    const strategicDemandByMarket = this.collectOutstandingStateMetallurgDemand(goods);
    this.addCalibratedMetalInputDemand(goods, strategicDemandByMarket);
    this.addFarmToolsDemand(goods, strategicDemandByMarket);
    const populationByMarket = this.calculatePopulationByMarket();
    const textilePopulationByMarket = this.calculateTextilePopulationByMarket();
    const mapDiagonal = Math.hypot(this.worldContext.graphWidth, this.worldContext.graphHeight) || 1;
    const travelRoutes = this.getCachedMarketTradeRoutes();
    const daysBetween = (from: number, to: number) => travelRoutes[from]?.[to]?.durationDays ?? null;
    seedMerchantBranches(daysBetween, getOrganizationMaxTradeDays("major"));
    const longDistanceTrade = isLongDistanceTradeEnabled();
    if (longDistanceTrade) {
      seedForeignFactories(daysBetween, HIGH_VALUE_MAX_TRADE_DAYS);
      forgetLapsedRumours();
    }

    return {
      goods,
      consumerDemandFactors,
      industrialDemandFactors,
      strategicDemandByMarket,
      populationByMarket,
      textilePopulationByMarket,
      mapDiagonal,
      tradeReserveFactor: FLOW_TRADE_RESERVE_FACTOR,
      travelRoutes,
      luxuryBudgets: luxuryValueDemand ? luxuryBudgetByMarketTier(this.worldContext.pack.burgs) : null,
      importerPurchaseRoom: longDistanceTrade ? getImporterPurchaseRoom() : null,
      longDistanceTrade,
      transportRoom: buildTransportRoom(
        getMarkets().map(market => market.i),
        (from, to) => travelRoutes[from]?.[to]?.segments,
        segments => calculateRouteDurationDays(segments, this.worldContext.distanceScale)
      )
    };
  }

  /**
   * State armories place their equipment orders through MetallurgWork rather than population
   * demand. Treat an open order as finished-Good demand at its destination market so a surplus
   * produced elsewhere can reach the armory instead of remaining stranded at its source. Every
   * open forge order (the town smiths' Tools as well as the State's) also asks for its materials
   * — Ingots, Bronze, Charcoal — at its destination, so a furnace's Ingots can travel to the towns
   * that forge them (docs/plan/farm-labour-calibration.md §17).
   */
  private collectOutstandingStateMetallurgDemand(goods: readonly Good[]): Map<number, Map<number, number>> {
    const enabledGoodIds = new Set(goods.map(good => good.i));
    const demandByMarket = new Map<number, Map<number, number>>();
    const add = (marketId: number, goodId: number, units: number): void => {
      if (!(units > 0) || !enabledGoodIds.has(goodId)) return;
      const demandByGood = demandByMarket.get(marketId) ?? new Map<number, number>();
      demandByGood.set(goodId, (demandByGood.get(goodId) || 0) + units);
      demandByMarket.set(marketId, demandByGood);
    };

    for (const order of getMetallurgWorkOrders()) {
      if (order.status === "completed") continue;
      const outstandingUnits = Math.max(0, order.requestedUnits - order.completedUnits);
      if (outstandingUnits <= 0) continue;

      if (order.ownerKind === "state") add(order.destinationMarketId, order.productGoodId, outstandingUnits);
      const requestedUnits = Math.max(0.001, order.requestedUnits);
      for (const material of order.materials) {
        add(order.destinationMarketId, material.goodId, material.units * (outstandingUnits / requestedUnits));
      }
    }

    return demandByMarket;
  }

  /**
   * The town smiths forge Tools and the other household metal goods to a per-head lot target
   * (craftDemandCalibration.ts), not to market demand, so their Ingots never showed up as demand
   * anywhere a furnace's surplus could be sent. Adds each market's monthly Ore and Ingot need for
   * its towns' calibrated lots, through each good's typical recipe (docs/plan/farm-labour-calibration.md §17).
   */
  private addCalibratedMetalInputDemand(
    goods: readonly Good[],
    demandByMarket: Map<number, Map<number, number>>
  ): void {
    if (!getEconomyCalibrationState().applyCalibration) return;
    const goodsById = new Map(goods.map(good => [good.i, good]));
    const recipeCost = (recipe: Record<string, number>): number =>
      Object.entries(recipe).reduce((sum, [id, amount]) => sum + amount * (goodsById.get(+id)?.value ?? 0), 0);
    const metalRecipes = goods.flatMap(good => {
      if (!getGoodDemandCalibration(good.name)) return [];
      const [recipe] = recipesForIndustrialDemand(good, true, recipeCost);
      const inputs = Object.entries(recipe ?? {}).flatMap(([id, amount]) => {
        const ingredient = goodsById.get(+id);
        return ingredient && isMineOrFurnaceGood(ingredient) ? [{ goodId: ingredient.i, amount }] : [];
      });
      return inputs.length ? [{ good, inputs }] : [];
    });
    if (!metalRecipes.length) return;

    const populationRate = Math.max(0, this.worldContext.populationRate ?? 0) || 1;
    for (const burg of this.worldContext.pack.burgs) {
      const population = burg?.population ?? 0;
      if (!burg?.i || burg.removed || !burg.market || !(population > 0)) continue;
      const laborPeopleBurg = laborPeople(population, populationRate);
      for (const { good, inputs } of metalRecipes) {
        const lots = getCalibratedMonthlyLots({
          goodName: good.name,
          laborPeopleBurg,
          port: Boolean(burg.port),
          capital: Boolean(burg.capital)
        });
        if (!(lots > 0)) continue;
        const demandByGood = demandByMarket.get(burg.market) ?? new Map<number, number>();
        for (const { goodId, amount } of inputs)
          demandByGood.set(goodId, (demandByGood.get(goodId) || 0) + lots * amount);
        demandByMarket.set(burg.market, demandByGood);
      }
    }
  }

  /**
   * Farms buy Tools once a year through their market (agTechInvestment.ts), but Tools carry no
   * household demand (`residualWeight: 0`), so no market asked for them and they stayed where they
   * were forged. Adds the Tools each market's farms will buy (docs/plan/farm-labour-calibration.md §19).
   */
  private addFarmToolsDemand(goods: readonly Good[], demandByMarket: Map<number, Map<number, number>>): void {
    const tools = goods.find(good => good.name === "Tools");
    if (!tools) return;
    for (const [marketId, units] of getFarmToolsDemandByMarket(tools)) {
      const demandByGood = demandByMarket.get(marketId) ?? new Map<number, number>();
      demandByGood.set(tools.i, (demandByGood.get(tools.i) || 0) + units);
      demandByMarket.set(marketId, demandByGood);
    }
  }

  private getStrategicFinishedGoodDemand(ctx: GlobalTradeContext, marketId: number, goodId: number): number {
    return ctx.strategicDemandByMarket.get(marketId)?.get(goodId) || 0;
  }

  private calculateMarketTradeDemand(
    good: Good,
    marketId: number,
    population: number,
    textilePopulation: number,
    consumerDemandFactor: number,
    industrialDemandFactor: number,
    ctx: GlobalTradeContext
  ): number {
    const laggedPrice = this.get(marketId)?.goods[good.i]?.price;
    return (
      this.calculateGoodDemand(
        good,
        population,
        textilePopulation,
        consumerDemandFactor,
        industrialDemandFactor,
        laggedPrice
      ) +
      this.getStrategicFinishedGoodDemand(ctx, marketId, good.i) +
      this.getLuxuryBudgetDemand(ctx, marketId, good)
    );
  }

  /**
   * Units of a luxury the market keeps for its towns: each tier's budget, split by the good's share
   * of the tier's coverage, at the market price, for LUXURY_STOCK_CYCLES cycles
   * (docs/plan/luxury-value-demand.md §3.5). Budget over price already falls as the price rises, so
   * no further elasticity is applied.
   */
  private getLuxuryBudgetDemand(ctx: GlobalTradeContext, marketId: number, good: Good): number {
    if (!ctx.luxuryBudgets || !isLuxuryDemandGood(good)) return 0;
    const price = this.get(marketId)?.goods[good.i]?.price || good.value;
    return luxuryStockTarget(ctx.luxuryBudgets.get(marketId), good, price);
  }

  /**
   * Pass 1 (per good): collect this good's candidate trade opportunities without gating on
   * whether the good alone would justify a dedicated trip — a shared caravan/route only pays
   * maintenanceCost once, so admission is decided per-route (pass 2) after every good sharing
   * that exporter/importer pair is known. A high-value good can fund the trip while cheaper
   * goods ride along for their own positive-but-thin margin. Mutates `opportunitiesByGood` /
   * `routeMarginalProfit` / `routeMaintenanceCost` in place so runGlobalTrade() and
   * runGlobalTradeIncrementally() can share this exact per-good logic while looping over
   * `ctx.goods` either synchronously or in yielded batches.
   */
  private collectGlobalTradeOpportunitiesForGood(
    good: Good,
    ctx: GlobalTradeContext,
    opportunitiesByGood: Map<number, MarketTradeOpportunity[]>,
    routeMarginalProfit: Map<string, number>,
    routeMaintenanceCost: Map<string, number>
  ): void {
    // Mined and smelted Goods have neither a cell distribution nor a recipe — mines and furnaces
    // supply them — and were skipped here, so Ore and Ingots never left their mining district
    // while the towns' smiths stood idle (docs/plan/farm-labour-calibration.md §17).
    if (!good.distribution && !good.recipes?.length && !isMineOrFurnaceGood(good)) return;

    const {
      consumerDemandFactors,
      industrialDemandFactors,
      populationByMarket,
      textilePopulationByMarket,
      mapDiagonal,
      tradeReserveFactor,
      travelRoutes
    } = ctx;
    const minUnit = getMarketTradeMinimumUnits(good);
    const observe = getTradeStageObserver();
    const cargo = { metal: isMineOrFurnaceGood(good), highValue: isHighValueTradeGood(good) };
    // Houses hear of lasting price gaps in high-value goods where none of them is present at both
    // ends, and send an agent (long-distance-merchant-reach-capital.md §4.3).
    const hearsRumours = ctx.longDistanceTrade && cargo.highValue;

    const exporters: { market: Market; reserve: number }[] = [];
    const importers: { market: Market; reserve: number }[] = [];

    for (const market of getMarkets()) {
      const population = populationByMarket[market.i] || 0;
      const demand = this.calculateMarketTradeDemand(
        good,
        market.i,
        population,
        textilePopulationByMarket[market.i] || population,
        consumerDemandFactors[good.i] || 0,
        industrialDemandFactors[good.i] || 0,
        ctx
      );
      const warIntensity = getBurgMarketLedger(market.centerBurgId)?.warIntensity ?? 0;
      const reserve = demand * (1 + tradeReserveFactor) * wartimeTradeReserveMultiplier(warIntensity, good);

      const marketGood = this.getMarketGood(market, good);
      if (marketGood.stock > reserve) {
        exporters.push({ market, reserve });
      } else if (marketGood.stock < reserve) {
        importers.push({ market, reserve });
      }
    }

    const opportunities: MarketTradeOpportunity[] = [];

    if (exporters.length && importers.length) {
      for (const exporter of exporters) {
        const routes = travelRoutes[exporter.market.i];
        if (!routes) continue;

        const exporterGood = this.getMarketGood(exporter.market, good);
        const available = Math.max(0, exporterGood.stock - exporter.reserve);
        if (available < minUnit) continue;

        const exporterCenter = this.worldContext.pack.burgs[exporter.market.centerBurgId];
        const exporterTaxPerUnit = this.getSalesTax(exporterCenter) * exporterGood.price;
        const refrigeratedTransport = isTechnologyStageAtLeast(
          getTechnologyStage("mechanicalRefrigeration", exporterCenter?.state ?? 0),
          "adopted"
        );

        for (const importer of importers) {
          const importerGood = this.getMarketGood(importer.market, good);
          const needed = Math.max(0, importer.reserve - importerGood.stock);
          const units = Math.min(available, needed);
          if (units < minUnit) continue;
          const pair = { goodId: good.i, exporterId: exporter.market.i, importerId: importer.market.i };
          observe?.({ stage: "pair", ...pair });

          const route = routes[importer.market.i];
          if (!route) {
            observe?.({ stage: "noRoute", ...pair });
            continue;
          }
          const leg = { ...pair, durationDays: route.durationDays, distanceKm: route.distanceKm };
          if (
            !isGoodTradePermittedForShipment(
              good,
              route.durationDays,
              this.getExpectedLoadingWaitDays(route),
              route.segments,
              route.maxTemperatureC,
              refrigeratedTransport
            )
          ) {
            observe?.({ stage: "shipmentRule", ...leg });
            continue;
          }
          const importerCenter = this.worldContext.pack.burgs[importer.market.centerBurgId];
          const importerDutyPerUnit = this.getImportDuty(exporterCenter, importerCenter) * importerGood.price;
          const transportCost = getTransportCost(route.distance, mapDiagonal, good);
          const hearOfPriceGap = () => {
            const landedCost =
              this.getTradeQuotedPrice(exporter.market, good, exporterGood.price) +
              transportCost +
              exporterTaxPerUnit +
              importerDutyPerUnit;
            if (this.getTradeQuotedPrice(importer.market, good, importerGood.price) <= landedCost) return;
            hearPriceGapRumour(
              exporter.market.i,
              importer.market.i,
              (from, to) => travelRoutes[from]?.[to]?.durationDays ?? null,
              HIGH_VALUE_MAX_TRADE_DAYS
            );
          };
          if (!isMarketTradePermitted(exporter.market, importer.market, route.durationDays, cargo)) {
            const reason = explainMarketTradeRefusal(exporter.market, importer.market, route.durationDays, cargo);
            observe?.({ stage: "orgReach", ...leg, reason: reason ?? undefined });
            // Agents at both ends would lift these gates (merchantOrganizations.ts isInHomeGround,
            // the village limit for high-value cargo).
            if (hearsRumours && (reason === "smallVillage" || reason === "outsideHomeGround")) hearOfPriceGap();
            continue;
          }

          // Only a house with agents in both markets trades between them, and it judges by the
          // prices its letters have brought home, not today's (merchantIntelligence.ts).
          const known = this.knownTradePrices(
            exporter.market,
            importer.market,
            good,
            exporterGood.price,
            importerGood.price,
            travelRoutes
          );
          if (!known) {
            observe?.({ stage: "noHouse", ...leg });
            if (hearsRumours) hearOfPriceGap();
            continue;
          }
          const unitProfit =
            known.importerPrice - (known.exporterPrice + transportCost + exporterTaxPerUnit + importerDutyPerUnit);
          if (unitProfit <= 0) {
            observe?.({ stage: "unprofitable", ...leg });
            continue;
          }
          observe?.({ stage: "candidate", ...leg, units });
          const totalProfit = getNetTradeProfit(unitProfit, units, route.durationDays);

          opportunities.push({
            exporter: exporter.market,
            importer: importer.market,
            reserveExporter: exporter.reserve,
            reserveImporter: importer.reserve,
            transportCost,
            exporterTaxPerUnit,
            importerDutyPerUnit,
            units,
            unitProfit,
            totalProfit,
            distance: route.distance,
            distanceKm: route.distanceKm,
            durationDays: route.durationDays,
            maintenanceCost: getCaravanMaintenanceCost(route.durationDays),
            routeSegments: route.segments,
            knownExporterPrice: known.exporterPrice,
            knownImporterPrice: known.importerPrice,
            stateProcurement: this.getStrategicFinishedGoodDemand(ctx, importer.market.i, good.i) > 0
          });
        }
      }
    }

    // Speculation moves goods by supply alone. Luxuries under the value demand travel only where a
    // town budget asks for them, so stock no buyer wants stops piling up in the import markets.
    if (!opportunities.length && !(ctx.luxuryBudgets && isLuxuryDemandGood(good))) {
      this.addSpeculativeGlobalTradeOpportunities({
        good,
        populationByMarket,
        travelRoutes,
        mapDiagonal,
        opportunities
      });
      for (const opportunity of opportunities)
        observe?.({
          stage: "speculative",
          goodId: good.i,
          exporterId: opportunity.exporter.i,
          importerId: opportunity.importer.i,
          durationDays: opportunity.durationDays,
          distanceKm: opportunity.distanceKm,
          units: opportunity.units
        });
    }

    opportunities.sort((a, b) => b.totalProfit - a.totalProfit || b.units - a.units);
    opportunitiesByGood.set(good.i, opportunities);

    for (const opportunity of opportunities) {
      const key = tradeRouteKey(opportunity.exporter.i, opportunity.importer.i);
      // totalProfit is already net of this route's maintenanceCost; add it back once per
      // candidate so goods sharing a route can be summed before the fixed cost is deducted.
      const marginalProfit = opportunity.totalProfit + opportunity.maintenanceCost;
      routeMarginalProfit.set(key, (routeMarginalProfit.get(key) || 0) + marginalProfit);
      routeMaintenanceCost.set(key, opportunity.maintenanceCost);
    }
  }

  /**
   * Pass 2: a route "launches" once the combined margin of every good crossing it clears
   * the route's one-time maintenanceCost. Once launched, every candidate on that route rides
   * along regardless of whether its own margin alone would have cleared the bar. Cheap relative
   * to passes 1/3 (bounded by distinct route pairs, not goods × markets), so neither
   * runGlobalTrade() nor runGlobalTradeIncrementally() batches this one.
   */
  private resolveViableGlobalTradeRoutes(
    routeMarginalProfit: Map<string, number>,
    routeMaintenanceCost: Map<string, number>,
    opportunitiesByGood: ReadonlyMap<number, readonly MarketTradeOpportunity[]>
  ): Set<string> {
    const stateProcurementRoutes = new Set<string>();
    for (const opportunities of opportunitiesByGood.values()) {
      for (const opportunity of opportunities) {
        if (opportunity.stateProcurement) {
          stateProcurementRoutes.add(tradeRouteKey(opportunity.exporter.i, opportunity.importer.i));
        }
      }
    }

    const viableRoutes = new Set<string>();
    for (const [key, marginalProfit] of routeMarginalProfit) {
      const maintenanceCost = routeMaintenanceCost.get(key) || 0;
      // A State armory order is a committed procurement, not optional merchant speculation.
      // It underwrites one caravan even when a small initial artillery batch cannot alone cover
      // the commercial maintenance threshold; other goods can still share that same trip.
      if (stateProcurementRoutes.has(key) || marginalProfit - maintenanceCost >= MIN_TRADE_PROFIT) {
        viableRoutes.add(key);
      }
    }
    return viableRoutes;
  }

  /**
   * Pass 3 (per good): emit deals and apply price/stock effects — only the admission gate
   * (route viability instead of per-good totalProfit) differs from a naive per-good cutoff.
   */
  private emitGlobalTradeDealsForGood(
    good: Good,
    ctx: GlobalTradeContext,
    opportunitiesByGood: Map<number, MarketTradeOpportunity[]>,
    viableRoutes: Set<string>
  ): void {
    const opportunities = opportunitiesByGood.get(good.i);
    if (!opportunities?.length) return;

    const { consumerDemandFactors, industrialDemandFactors, populationByMarket, tradeReserveFactor } = ctx;
    const minUnit = getMarketTradeMinimumUnits(good);
    const importerStockAdjustments = new Map<number, number>();
    const observe = getTradeStageObserver();

    for (const opportunity of opportunities) {
      const leg = {
        goodId: good.i,
        exporterId: opportunity.exporter.i,
        importerId: opportunity.importer.i,
        durationDays: opportunity.durationDays,
        distanceKm: opportunity.distanceKm
      };
      if (!viableRoutes.has(tradeRouteKey(opportunity.exporter.i, opportunity.importer.i))) {
        observe?.({ stage: "routeNotViable", ...leg });
        continue;
      }

      const exporterGood = this.getMarketGood(opportunity.exporter, good);
      const importerGood = this.getMarketGood(opportunity.importer, good);

      const available = Math.max(0, exporterGood.stock - opportunity.reserveExporter);
      const importerAdj = importerStockAdjustments.get(opportunity.importer.i) || 0;
      const needed = Math.max(0, opportunity.reserveImporter - (importerGood.stock + importerAdj));
      // Soft export budget for natural surplus trades: keep target months-of-cover in retail.
      // Speculative opportunities (targetSalePrice set) keep the classic available/needed clamp —
      // they already use a different reserve definition and would otherwise be zeroed by cover.
      let units = Math.min(available, needed);
      if (opportunity.targetSalePrice === undefined) {
        const population = populationByMarket[opportunity.exporter.i] || 0;
        const cycleDemand =
          population * ((consumerDemandFactors[good.i] || 0) + (industrialDemandFactors[good.i] || 0)) +
          this.getStrategicFinishedGoodDemand(ctx, opportunity.exporter.i, good.i);
        const flowBudget = computeMarketGoodFlowBudget({
          marketId: opportunity.exporter.i,
          goodId: good.i,
          stock: exporterGood.stock,
          cycleDemand,
          monthsOfCover: getDefaultMonthsOfCover(good),
          cargoSlotsPerUnit: getGoodCargoSlotsPerUnit(good),
          tradeReserveFactor
        });
        units = Math.min(units, flowBudget.exportBudget);
      }
      // Indivisible units ("head" livestock, ships, etc. — see INDIVISIBLE_UNITS in
      // goodsTradeLots.ts) must not fraction across a caravan trip either: a market can't
      // wholesale 0.4 of a live animal any more than a player can retail-buy one.
      units = floorToRetailLot(units, getRetailLotSize(good));
      if (units < minUnit) {
        observe?.({ stage: "belowFlowBudget", ...leg });
        continue;
      }

      // The deal is struck on what the house believes (its letters), not on today's prices.
      const quotedExporterPrice =
        opportunity.knownExporterPrice ?? this.getTradeQuotedPrice(opportunity.exporter, good, exporterGood.price);
      const quotedImporterPrice =
        opportunity.knownImporterPrice ?? this.getTradeQuotedPrice(opportunity.importer, good, importerGood.price);
      const quotedLandedCost =
        quotedExporterPrice +
        opportunity.transportCost +
        opportunity.exporterTaxPerUnit +
        opportunity.importerDutyPerUnit;
      const quotedSalePrice = opportunity.targetSalePrice ?? quotedImporterPrice;
      if (quotedSalePrice - quotedLandedCost <= 0) {
        observe?.({ stage: "quoteUnprofitable", ...leg });
        continue;
      }

      // A house does not ship more than the buyer can pay for: its cash, less what it already owes
      // and what is already on the way to it.
      const purchaseRoom = ctx.importerPurchaseRoom;
      if (purchaseRoom && quotedSalePrice > 0 && !opportunity.stateProcurement) {
        const room = purchaseRoom.get(opportunity.importer.i) ?? 0;
        units = Math.min(units, floorToRetailLot(Math.max(0, room) / quotedSalePrice, getRetailLotSize(good)));
        if (units < minUnit) {
          observe?.({ stage: "noBuyerCash", ...leg });
          continue;
        }
      }

      // A house books no more than its carts and hulls can carry this month (§17). Carts beyond its
      // own are hired at a dearer freight, and hulls of other markets in its ports carry freight
      // (port-freight-queue-and-warehouses.md §3, §4.2). A sea leg no hull can take is asked of the
      // shipyards; until one is built or one comes in, the pair waits.
      const slotsPerUnit = getGoodCargoSlotsPerUnit(good);
      const { transportRoom } = ctx;
      let hireSurcharge = 0;
      const carriable = transportRoomSlots(
        transportRoom,
        opportunity.exporter.i,
        opportunity.routeSegments,
        opportunity.durationDays
      );
      if (Number.isFinite(carriable)) {
        const seaSlots = seaRoomSlots(
          transportRoom,
          opportunity.exporter.i,
          opportunity.routeSegments,
          opportunity.durationDays
        );
        if (seaSlots + 0.000001 < units * slotsPerUnit)
          MerchantTransportAssets.recordSeaHullShortfall(
            opportunity.exporter.i,
            units * slotsPerUnit - seaSlots,
            seaDeparturePortBurgId(opportunity.routeSegments)
          );
        units = Math.min(units, floorToRetailLot(carriable / slotsPerUnit, getRetailLotSize(good)));
        if (units < minUnit) {
          observe?.({ stage: "noTransport", ...leg, transportLimit: seaSlots <= carriable ? "sea" : "land" });
          continue;
        }
        const ownSlots = ownLandRoomSlots(
          transportRoom,
          opportunity.exporter.i,
          opportunity.routeSegments,
          opportunity.durationDays
        );
        const slots = units * slotsPerUnit;
        if (slots > ownSlots + 0.000001) {
          const hiredShare = 1 - ownSlots / slots;
          hireSurcharge = opportunity.transportCost * (LAND_HIRE_FREIGHT_MULTIPLIER - 1) * hiredShare;
          if (quotedSalePrice - quotedLandedCost - hireSurcharge <= 0) {
            // Hired carts do not pay on this good: ship only what the house's own carts carry.
            hireSurcharge = 0;
            units = floorToRetailLot(ownSlots / slotsPerUnit, getRetailLotSize(good));
            if (units < minUnit) {
              observe?.({ stage: "noTransport", ...leg, transportLimit: "ownLand" });
              continue;
            }
          }
        }
      }

      const freightUnitCost = opportunity.transportCost + hireSurcharge;
      const landedCost =
        exporterGood.price + freightUnitCost + opportunity.exporterTaxPerUnit + opportunity.importerDutyPerUnit;

      const deals = getDeals();
      const deal: Deal = {
        i: deals.length,
        seller: opportunity.exporter.i,
        sellerType: "market",
        buyer: opportunity.importer.i,
        buyerType: "market",
        good: good.i,
        units,
        remainingUnits: units,
        price: landedCost,
        tax: opportunity.exporterTaxPerUnit * units,
        importTax: opportunity.importerDutyPerUnit * units,
        distance: rn(opportunity.distanceKm, 2),
        durationDays: opportunity.durationDays,
        maintenanceCost: rn(opportunity.maintenanceCost, 2),
        accountingPeriodDays: getTradeAccountingPeriodDays(opportunity.durationDays)
      };

      // Retail → export warehouse (single stock deduct). Caravan load takes from the lot later.
      const stockBeforeBooking = exporterGood.stock;
      const lot = ExportStaging.bookFromRetail({
        marketId: opportunity.exporter.i,
        destinationMarketId: opportunity.importer.i,
        goodId: good.i,
        units,
        unitCost: landedCost,
        dealId: deal.i,
        distance: deal.distance,
        durationDays: deal.durationDays,
        maintenanceCost: deal.maintenanceCost,
        taxPerUnit: opportunity.exporterTaxPerUnit,
        goodsUnitCost: exporterGood.price,
        freightUnitCost,
        saleUnitPrice: quotedSalePrice,
        paymentTerms:
          purchaseRoom && !opportunity.stateProcurement
            ? choosePaymentTerms(opportunity.exporter, opportunity.importer, opportunity.durationDays)
            : undefined,
        // State procurement underwrites its own committed shipment; it must not be blocked by
        // the exporting market's optional merchant working-capital pool. Once cargo is paid for,
        // the house pays for it like any other: unpaid cargo would be sold to the importer for
        // nothing (long-distance-merchant-reach-capital.md §15).
        requireCapital: !opportunity.stateProcurement || ctx.longDistanceTrade
      });
      if (!lot) {
        if (observe) {
          const treasury = opportunity.exporter.marketTreasury;
          observe({
            stage: "noCapital",
            ...leg,
            units,
            capitalNeeded: units * landedCost,
            capitalAvailable: MerchantTradeCapital.peekAvailableCapital(opportunity.exporter),
            capitalCash: getUncommittedTradeCapital(treasury)
          });
        }
        continue;
      }
      deal.stagingLotId = lot.id;
      takeTransportRoom(
        transportRoom,
        opportunity.exporter.i,
        opportunity.routeSegments,
        opportunity.durationDays,
        Math.max(0, stockBeforeBooking - exporterGood.stock) * slotsPerUnit
      );
      if (isLongDistanceTradeEnabled()) {
        // Capital may clamp the booking; the deal's taxes are what the house actually paid for.
        const booked = rn(Math.max(0, stockBeforeBooking - exporterGood.stock), 2);
        if (booked + 0.000001 < units && units > 0) {
          const share = booked / units;
          deal.units = booked;
          deal.remainingUnits = booked;
          deal.tax = rn(deal.tax * share, 2);
          if (deal.importTax !== undefined) deal.importTax = rn(deal.importTax * share, 2);
        }
        if (purchaseRoom && !opportunity.stateProcurement) {
          const room = purchaseRoom.get(opportunity.importer.i) ?? 0;
          purchaseRoom.set(opportunity.importer.i, room - booked * quotedSalePrice);
        }
      }
      deals.push(deal);
      observe?.({ stage: "deal", ...leg, units, value: units * landedCost });

      exporterGood.price = rn(this.applyMarketPressure(good.value, exporterGood.price, units), 2);
      importerGood.price = rn(this.applyMarketPressure(good.value, importerGood.price, -units), 2);
      importerStockAdjustments.set(opportunity.importer.i, importerAdj + units);
      // Note: importerGood.stock is NO LONGER instantly increased. Caravans physically transport it.
    }
  }

  runGlobalTrade(): void {
    recordMarketPriceSnapshot();
    const ctx = this.buildGlobalTradeContext();
    const opportunitiesByGood = new Map<number, MarketTradeOpportunity[]>();
    const routeMarginalProfit = new Map<string, number>();
    const routeMaintenanceCost = new Map<string, number>();

    for (const good of ctx.goods) {
      this.collectGlobalTradeOpportunitiesForGood(
        good,
        ctx,
        opportunitiesByGood,
        routeMarginalProfit,
        routeMaintenanceCost
      );
    }

    const viableRoutes = this.resolveViableGlobalTradeRoutes(
      routeMarginalProfit,
      routeMaintenanceCost,
      opportunitiesByGood
    );

    for (const good of ctx.goods) {
      this.emitGlobalTradeDealsForGood(good, ctx, opportunitiesByGood, viableRoutes);
    }
  }

  /**
   * Same trade-matching pass as runGlobalTrade() (identical output — both loop over `ctx.goods`
   * calling the same per-good helpers), but yields to the browser between good-sized batches so
   * a newly generated map's initial trade pass doesn't block the main thread for its whole cost
   * in one block. Used only by the "Preparing economy" Map Ready task (economy/index.tsx) —
   * every other caller (Advance Time, the "regenerate" extension command, tests) keeps using the
   * synchronous runGlobalTrade(). Returns false if cancelled before completion.
   */
  async runGlobalTradeIncrementally(options: IncrementalBatchOptions = {}): Promise<boolean> {
    recordMarketPriceSnapshot();
    const ctx = this.buildGlobalTradeContext();
    const opportunitiesByGood = new Map<number, MarketTradeOpportunity[]>();
    const routeMarginalProfit = new Map<string, number>();
    const routeMaintenanceCost = new Map<string, number>();

    const collected = await runBatchedYielding(
      ctx.goods,
      good =>
        this.collectGlobalTradeOpportunitiesForGood(
          good,
          ctx,
          opportunitiesByGood,
          routeMarginalProfit,
          routeMaintenanceCost
        ),
      options
    );
    if (!collected) return false;

    const viableRoutes = this.resolveViableGlobalTradeRoutes(
      routeMarginalProfit,
      routeMaintenanceCost,
      opportunitiesByGood
    );

    return runBatchedYielding(
      ctx.goods,
      good => this.emitGlobalTradeDealsForGood(good, ctx, opportunitiesByGood, viableRoutes),
      options
    );
  }

  private addSpeculativeGlobalTradeOpportunities({
    good,
    populationByMarket,
    travelRoutes,
    mapDiagonal,
    opportunities
  }: {
    good: Good;
    populationByMarket: number[];
    travelRoutes: Record<number, Record<number, MarketTradeRoute>>;
    mapDiagonal: number;
    opportunities: MarketTradeOpportunity[];
  }): void {
    const markets = getMarkets();
    for (const exporter of markets) {
      const routes = travelRoutes[exporter.i];
      if (!routes) continue;

      const exporterGood = this.getMarketGood(exporter, good);
      if (exporterGood.stock < getMarketTradeMinimumUnits(good)) continue;

      const exporterCenter = this.worldContext.pack.burgs[exporter.centerBurgId];
      const quotedExporterGood = {
        ...exporterGood,
        price: this.getTradeQuotedPrice(exporter, good, exporterGood.price)
      };
      const exporterTaxPerUnit = this.getSalesTax(exporterCenter) * exporterGood.price;
      const refrigeratedTransport = isTechnologyStageAtLeast(
        getTechnologyStage("mechanicalRefrigeration", exporterCenter?.state ?? 0),
        "adopted"
      );

      for (const importer of markets) {
        if (importer.i === exporter.i) continue;
        const route = routes[importer.i];
        if (
          !route ||
          !isGoodTradePermittedForShipment(
            good,
            route.durationDays,
            this.getExpectedLoadingWaitDays(route),
            route.segments,
            route.maxTemperatureC,
            refrigeratedTransport
          ) ||
          !isMarketTradePermitted(exporter, importer, route.durationDays, { highValue: isHighValueTradeGood(good) })
        ) {
          continue;
        }

        const importerGood = this.getMarketGood(importer, good);
        const quotedImporterGood = {
          ...importerGood,
          price: this.getTradeQuotedPrice(importer, good, importerGood.price)
        };
        const importerCenter = this.worldContext.pack.burgs[importer.centerBurgId];
        const importerDutyPerUnit = this.getImportDuty(exporterCenter, importerCenter) * importerGood.price;
        const estimate = estimateSpeculativeTrade({
          good,
          sourceMarketId: exporter.i,
          targetMarketId: importer.i,
          sourceGood: quotedExporterGood,
          targetGood: quotedImporterGood,
          sourcePopulation: populationByMarket[exporter.i] || 0,
          targetPopulation: populationByMarket[importer.i] || 0,
          distance: route.distance,
          mapDiagonal,
          routeSegments: route.segments,
          distanceScale: this.worldContext.distanceScale,
          routeMaxTemperatureC: route.maxTemperatureC
        });
        if (!estimate) continue;

        const landedCost = quotedExporterGood.price + estimate.transportCost + exporterTaxPerUnit + importerDutyPerUnit;
        const unitProfit = estimate.sellPrice - landedCost;
        const totalProfit = estimate.totalProfit;

        opportunities.push({
          exporter,
          importer,
          reserveExporter: Math.max(0, exporterGood.stock - estimate.maxUnits),
          reserveImporter: importerGood.stock + estimate.maxUnits,
          transportCost: estimate.transportCost,
          exporterTaxPerUnit,
          importerDutyPerUnit,
          units: estimate.maxUnits,
          unitProfit,
          totalProfit,
          distance: route.distance,
          distanceKm: route.distanceKm,
          durationDays: route.durationDays,
          maintenanceCost: estimate.maintenanceCost,
          routeSegments: route.segments,
          stateProcurement: false,
          targetSalePrice: estimate.sellPrice
        });
      }
    }
  }

  private getMarketTradeRoute(source: Burg, target: Burg): MarketTradeRoute | null {
    if (source.i === target.i) return null;
    if (!this.isDomesticTradePair(source, target)) return null;

    const routePath = this.worldContext.pack.cells?.routes
      ? TradeRoutePlanner.findRoutePath(source.cell, target.cell)
      : null;
    // Frontier homelands have no pilgrimage trails. A missing path means the
    // two markets are not yet connected; do not invent a straight-line deal.
    if (!routePath?.segments?.length && this.usesStateBoundedTerritories()) return null;
    const segments: TradeRouteSegment[] = routePath?.segments?.length
      ? routePath.segments.map(segment => ({
          type: segment.type,
          // Preserve cell ids for grade-aware duration / pathfinding consistency (Phase 1).
          points: segment.points.map((p): TradeRouteSegment["points"][number] =>
            typeof p[2] === "number" ? [p[0], p[1], p[2]] : [p[0], p[1]]
          ),
          pavedShare: segment.pavedShare
        }))
      : [
          {
            type: "land",
            points: [
              [source.x, source.y, source.cell],
              [target.x, target.y, target.cell]
            ]
          }
        ];
    const routeDistance = getRouteDistanceMapUnits(segments);
    if (routeDistance <= 0) return null;

    // Keep the existing distance-based transport-price model intact. Step 1 only changes
    // eligibility and fixed maintenance to route travel days; sea-priority and route-cost
    // pricing remain deferred to the next routing phase.
    const distance = getMarketDistanceMapUnits(source, target);
    const distanceKm = distance * this.worldContext.distanceScale;
    if (distance <= 0 || distanceKm <= 0) return null;

    return {
      distance,
      distanceKm,
      durationDays: calculateRouteDurationDays(segments, this.worldContext.distanceScale),
      segments,
      maxTemperatureC: getRouteMaxTemperatureC(
        segments,
        this.worldContext.pack.cells?.g,
        this.worldContext.grid.cells?.temp
      )
    };
  }

  /**
   * Market-to-market paths depend on the market centres, route geometry/link graph,
   * distance scale, and caravan speeds — not on monthly stock or prices. Building
   * them involves one route search per ordered market pair, so retain that immutable
   * topology result across production cycles. The key deliberately includes the
   * mutable route graph contents because route editing mutates pack in place.
   */
  private getCachedMarketTradeRoutes(): MarketTradeRoutes {
    const key = this.getTradeRouteCacheKey();
    if (this.tradeRouteCache?.key === key) return this.tradeRouteCache.routes;

    const routes: MarketTradeRoutes = {};
    const markets = getMarkets();
    for (const sourceMarket of markets) {
      routes[sourceMarket.i] = {};
      const sourceBurg = this.worldContext.pack.burgs[sourceMarket.centerBurgId];
      if (!sourceBurg) continue;

      for (const targetMarket of markets) {
        const targetBurg = this.worldContext.pack.burgs[targetMarket.centerBurgId];
        if (!targetBurg) continue;
        const route = this.getMarketTradeRoute(sourceBurg, targetBurg);
        if (route) routes[sourceMarket.i][targetMarket.i] = route;
      }
    }

    this.tradeRouteCache = { key, routes };
    return routes;
  }

  private getTradeRouteCacheKey(): string {
    const { pack, distanceScale } = this.worldContext;
    const movement = CaravanMovement.getOptions();
    const marketCentres = getMarkets()
      .map(market => {
        const burg = pack.burgs[market.centerBurgId];
        return `${market.i}:${market.centerBurgId}:${burg?.cell}:${burg?.x}:${burg?.y}`;
      })
      .join("|");
    const routeGeometry = (pack.routes ?? [])
      .map(route => `${route.i}:${route.group}:${route.points.map(point => point.join(",")).join("/")}`)
      .join("|");
    const routeLinks = Object.entries(pack.cells?.routes ?? {})
      .map(
        ([fromCellId, links]) =>
          `${fromCellId}:${Object.entries(links)
            .map(([to, route]) => `${to},${route}`)
            .join("/")}`
      )
      .join("|");

    return [
      distanceScale,
      movement.landKmPerDay,
      movement.seaKmPerDay,
      movement.gradeEffectStrength,
      movement.merchantRoutePreference,
      marketCentres,
      routeGeometry,
      routeLinks
    ].join(";");
  }

  private invalidateTradeRouteCache(): void {
    this.tradeRouteCache = null;
  }

  /** Mid-market price as traders value it, including wartime scarcity — not the retail margin. */
  /**
   * The best (exporter, importer) quoted prices any house with agents in both markets believes,
   * or null when no house is present in both. Home prices are current; branch prices are as old
   * as the journey from that branch to the house's home.
   */
  private knownTradePrices(
    exporter: Market,
    importer: Market,
    good: Good,
    exporterPrice: number,
    importerPrice: number,
    travelRoutes: MarketTradeRoutes
  ): { exporterPrice: number; importerPrice: number } | null {
    let best: { exporterPrice: number; importerPrice: number; margin: number } | null = null;
    for (const home of housesPresentIn(exporter.i, importer.i)) {
      const daysTo = (marketId: number) =>
        marketId === home
          ? 0
          : (travelRoutes[home]?.[marketId]?.durationDays ?? travelRoutes[marketId]?.[home]?.durationDays);
      const exporterDays = daysTo(exporter.i);
      const importerDays = daysTo(importer.i);
      if (exporterDays === undefined || importerDays === undefined) continue;
      const knownExporter = this.getTradeQuotedPrice(
        exporter,
        good,
        knownPrice(home, exporter.i, good.i, exporterDays, exporterPrice)
      );
      const knownImporter = this.getTradeQuotedPrice(
        importer,
        good,
        knownPrice(home, importer.i, good.i, importerDays, importerPrice)
      );
      const margin = knownImporter - knownExporter;
      if (!best || margin > best.margin) best = { exporterPrice: knownExporter, importerPrice: knownImporter, margin };
    }
    return best && { exporterPrice: best.exporterPrice, importerPrice: best.importerPrice };
  }

  private getTradeQuotedPrice(market: Market, good: Good, midPrice: number): number {
    return midPrice * this.getWarPriceModifier(market.centerBurgId, good.i);
  }

  getWarPriceModifier(burgId: number | undefined, goodId: number | undefined): number {
    if (!burgId || goodId === undefined || goodId === null) {
      return 1;
    }
    const ledger = getBurgMarketLedger(burgId);
    if (!ledger) {
      return 1;
    }

    const good = Goods.get(goodId);
    if (!good) {
      return 1;
    }

    const intensity = ledger.warIntensity || 0;
    if (intensity === 0) {
      return 1;
    }

    const durationTicks = ledger.warDurationTicks || 0;
    const durationFactor = Math.min(1.0, durationTicks / 10);

    let warType = good.warEconomyType;
    if (!warType) {
      const defaultGood = GOODS_DATA.find((g: { name: string; warEconomyType?: string }) => g.name === good.name);
      warType = defaultGood?.warEconomyType;
    }

    if (!warType) {
      return 1;
    }

    let baseMultiplier = 0;
    switch (warType) {
      case "military":
        baseMultiplier = 1.5;
        break;
      case "essential":
        baseMultiplier = 1.2;
        break;
      case "strategic":
        baseMultiplier = 0.8;
        break;
      case "luxury": {
        const dropFactor = 0.3;
        const luxuryMod = Math.max(0.1, 1 - dropFactor * intensity);
        return luxuryMod; // food stress does not apply to luxuries
      }
      default:
        return 1;
    }

    const warMod = 1 + baseMultiplier * intensity * (1 + durationFactor);
    return warMod;
  }

  customerBuyPrice(midPrice: number, burgId?: number, goodId?: number): number {
    const warMod = this.getWarPriceModifier(burgId, goodId);
    return rn(midPrice * warMod * (1 + MARKET_MARGIN), 2);
  }

  customerSellPrice(midPrice: number, burgId?: number, goodId?: number): number {
    const warMod = this.getWarPriceModifier(burgId, goodId);
    return rn(midPrice * warMod * (1 - MARKET_MARGIN), 2);
  }

  /** Player-facing over-the-counter price, including the delivered shelf's route-cost premium. */
  retailBuyPrice(midPrice: number, burgId: number, marketId: number, goodId: number): number {
    return rn(
      midPrice *
        this.getWarPriceModifier(burgId, goodId) *
        (1 + MARKET_MARGIN) *
        getRetailLocalityMultiplier(burgId, marketId, goodId),
      2
    );
  }

  /** Player-facing purchase offer for goods sold into this Burg's market. */
  retailSellPrice(midPrice: number, burgId: number, marketId: number, goodId: number): number {
    return rn(
      midPrice *
        this.getWarPriceModifier(burgId, goodId) *
        (1 - MARKET_MARGIN) *
        (1 / getRetailLocalityMultiplier(burgId, marketId, goodId)),
      2
    );
  }

  /**
   * Apply supply pressure from a player-facing commerce command without creating an automatic
   * production Deal. Positive units are removed from the market; negative units are supplied.
   */
  applyPlayerTradePressure(market: Market, good: Good, units: number): void {
    const row = market.goods[good.i];
    if (!row) return;
    row.price = rn(this.applyMarketPressure(good.value, row.price, units), 2);
  }

  private applyMarketPressure(basePrice: number, currentPrice: number | undefined, units: number): number {
    const price = currentPrice ?? basePrice;
    const floor = basePrice * PRICE_FLOOR_FACTOR;
    const ceiling = basePrice * PRICE_CEILING_FACTOR;
    return minmax(floor, price + units * basePrice * MARKET_PRESSURE_FACTOR, ceiling);
  }

  private collectConsumerDemand(goods: Good[], excludeLuxury = false): number[] {
    const applyCalibration = getEconomyCalibrationState().applyCalibration;
    const categories = excludeLuxury ? DEMAND_PRIORITY.filter(category => category !== "luxury") : DEMAND_PRIORITY;
    const totalCoverageByCategory = Object.fromEntries(
      categories.map(category => [
        category,
        goods.reduce((sum, g) => sum + consumerCoverageForCategory(g, category, applyCalibration), 0) || 1
      ])
    ) as Record<DemandCategory, number>;

    const demandFactor: number[] = [];
    for (const good of goods) {
      demandFactor[good.i] = categories.reduce((sum, category) => {
        const share =
          consumerCoverageForCategory(good, category, applyCalibration) / (totalCoverageByCategory[category] || 1);
        return sum + share * DEMAND_TARGET_FACTORS[category];
      }, 0);
    }
    return demandFactor;
  }

  private collectIndustrialDemand(goods: Good[], consumerDemandFactors: number[]): number[] {
    // Per-capita demand for ingredients driven by consumer demand for their manufactured outputs.
    const applyCalibration = getEconomyCalibrationState().applyCalibration;
    const recipeCost = (recipe: Record<string, number>): number => {
      let cost = 0;
      for (const [ingredientIdStr, amount] of Object.entries(recipe)) {
        const ingredient = Goods.get(+ingredientIdStr);
        if (ingredient && isGoodEnabled(ingredient)) cost += amount * ingredient.value;
      }
      return cost;
    };
    const demandFactor: number[] = [];
    for (const good of goods) {
      if (!good.recipes?.length) continue;
      const outputDemand = consumerDemandFactors[good.i] || 0;
      const recipes = recipesForIndustrialDemand(good, applyCalibration, recipeCost);
      for (const recipe of recipes) {
        for (const [ingredientIdStr, amount] of Object.entries(recipe)) {
          const ingredientId = +ingredientIdStr;
          const ingredient = Goods.get(ingredientId);
          if (!ingredient || !isGoodEnabled(ingredient)) continue;
          demandFactor[ingredientId] = (demandFactor[ingredientId] || 0) + amount * outputDemand;
        }
      }
    }
    return demandFactor;
  }

  private calculateAverageBaseCostByGood(goods: Good[]): number[] {
    const avgBaseCostByGood = new Array(goods.length);
    for (const good of goods) {
      if (!good.recipes?.length) continue;
      let totalBaseCost = 0;
      for (const recipe of good.recipes) {
        for (const [ingIdStr, amount] of Object.entries(recipe)) {
          const ing = Goods.get(+ingIdStr);
          if (ing && isGoodEnabled(ing)) totalBaseCost += amount * ing.value;
        }
      }
      avgBaseCostByGood[good.i] = totalBaseCost / good.recipes.length;
    }
    return avgBaseCostByGood;
  }

  private calculatePopulationByMarket(): number[] {
    const populationByMarket: number[] = [];
    for (const burg of this.worldContext.pack.burgs) {
      if (!burg.i || burg.removed || !burg.market || !burg.population) continue;
      if (!populationByMarket[burg.market]) populationByMarket[burg.market] = 0;
      populationByMarket[burg.market] += burg.population;
    }
    return populationByMarket;
  }

  /** Actual residents in thousand-person wardrobe lots, including every rural market cell. */
  private calculateTextilePopulationByMarket(): number[] {
    const populationByMarket: number[] = [];
    for (const market of getMarkets())
      populationByMarket[market.i] = getMarketTextileDemandProfile(market.i).populationLots;
    return populationByMarket;
  }

  /**
   * Ordinary consumer categories retain the established urban population-point scale. Clothing is
   * the exception: its four-year replacement demand is calculated from real urban and rural people
   * in textileDemand.ts, then normalized back to thousand-person market lots.
   */
  private calculateGoodDemand(
    good: Good,
    urbanPopulation: number,
    textilePopulation: number,
    consumerDemand: number,
    industrialDemand: number,
    laggedPrice?: number
  ): number {
    const clothingFactor = good.demandCoverage?.clothing ? DEMAND_TARGET_FACTORS.clothing : 0;
    const nonClothingConsumerDemand = Math.max(0, consumerDemand - clothingFactor);
    const baseDemand =
      urbanPopulation * (nonClothingConsumerDemand + industrialDemand) + textilePopulation * clothingFactor;
    // 1-period lag: this cycle's demand uses last cycle's price (Stewardship-style).
    // docs/plan/economy-coupling-audit.md L1.
    return applyPriceElasticity(baseDemand, good, laggedPrice);
  }
}

export const Markets = new MarketsModule();
