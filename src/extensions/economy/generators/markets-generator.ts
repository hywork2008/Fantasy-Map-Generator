import Alea from "alea";
import { quadtree } from "d3-quadtree";
import FlatQueue from "flatqueue";
import { foodStressPriceMultiplier, foodStressProductionMultiplier } from "../../hostCore";
import type { Burg, ShipGoodName, ShipGoodStock } from "../../hostTypes";
import {
  SHIPBUILDING_MATERIAL_IDS,
  type ShipbuildingMaterialRequestResult,
  type ShipbuildingMaterialShortage,
  type ShipbuildingMaterials
} from "../../hostTypes";
import { getColors, getRandomColor, minmax, rn, TIME } from "../../hostUtils";
import {
  getDeals,
  getGoodCellColumn,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext,
  setDeals,
  setMarketCellColumn,
  setMarkets,
  setStrategicLaborMarkets
} from "../economyContext";
import { getBurgMarketLedger, syncBurgMarketLedgers } from "./burgMarketLedgers";
import { CaravanMovement } from "./caravanMovement";
import { getDepletedCells } from "./forestDepletion";
import type { DemandCategory, Good } from "./goods-generator";
import { DEMAND_PRIORITY, DEMAND_TARGET_FACTORS, GOODS_DATA, Goods, isGoodEnabled } from "./goods-generator";
import { syncMarketManagers } from "./marketManagers";
import type { Deal, Market, TradeRouteSegment } from "./marketTypes";
import { isMarketTradePermitted } from "./merchantOrganizations";
import { getRuralProductionContributions, getSeasonalFoodProductionMultiplier } from "./production-utils";
import { TradeAnimation } from "./trade-animation";
import {
  estimateSpeculativeTrade,
  getCaravanMaintenanceCost,
  getLocalTradePriceMultiplier,
  getNetTradeProfit,
  getTradeAccountingPeriodDays,
  getTransportCost,
  isGoodTradePermitted,
  MIN_TRADE_PROFIT
} from "./tradeOpportunityEstimator";
import { calculateRouteDurationDays, getRouteDistanceMapUnits } from "./tradeRouteDuration";

const PRICE_FLOOR_FACTOR = 0.25;
const PRICE_CEILING_FACTOR = 3.0;
const LAPLACE_PRICE_SMOOTHING = 5;
const MARKET_PRESSURE_FACTOR = 0.01;
const MARKET_MARGIN = 0.1;

interface MarketTradeRoute {
  distance: number;
  distanceKm: number;
  durationDays: number;
  segments: TradeRouteSegment[];
}

type MarketTradeRoutes = Record<number, Record<number, MarketTradeRoute>>;

type MarketGoodTotals = Map<number, number>;
type FoodTotalsByState = Map<number, Map<number, number[]>>;
type WoodContribution = { marketId: number; goodId: number; amount: number };
type RuralProductionIndex = {
  populationSnapshotPeriod: string;
  standard: Map<number, MarketGoodTotals>;
  food: Map<number, FoodTotalsByState>;
  wood: Map<number, MarketGoodTotals>;
  woodByCell: Map<number, WoodContribution[]>;
};

function getMarketDistanceMapUnits(source: Pick<Burg, "x" | "y">, target: Pick<Burg, "x" | "y">): number {
  const dx = Math.abs(source.x - target.x);
  const dy = Math.abs(source.y - target.y);
  return dx > dy ? dx + 0.414 * dy : dy + 0.414 * dx;
}

export type { Deal, Market } from "./marketTypes";

export class MarketsModule {
  private get worldContext() {
    return getWorldContext();
  }

  private getSalesTax(burg: { state?: number }): number {
    const stateId = burg.state || 0;
    if (!stateId) return 0;
    return this.worldContext.pack.states?.[stateId]?.salesTax ?? 0;
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
    return "fulfilled";
  }

  /** Adds material extracted by a mine before monthly market-price calculation. */
  addMineSupply(marketId: number, goodId: number, amount: number): number {
    const market = this.get(marketId);
    const good = Goods.get(goodId);
    if (!market || !good || !isGoodEnabled(good) || amount <= 0) return 0;
    const supplied = rn(amount, 4);
    const marketGood = this.getMarketGood(market, good);
    marketGood.stock = rn(marketGood.stock + supplied, 4);
    return supplied;
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
    return consumed;
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
    // Market ids are regenerated together with territories, so a cohort tied to a
    // previous market map must not be reused for a different settlement network.
    setStrategicLaborMarkets([]);
    syncMarketManagers(markets);
    syncBurgMarketLedgers(markets);

    TIME && console.timeEnd("generateMarkets");
    return markets;
  }

  private createMarkets(): Market[] {
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
        this.worldContext.pack.burgs.length ** 0.6) |
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
        // Create a new market anchored at this burg
        const marketId = markets.length + 1;
        const market = { i: marketId, centerBurgId: burg.i, color: "", goods: {} };
        markets.push(market);
        this.marketById[marketId] = market;
        tree.add([x, y, marketId]);
        minSpacing += 1;
      }
    }

    const colors = getColors(markets.length);
    markets.forEach((m, i) => {
      m.color = colors[i];
    });

    return markets;
  }

  expandTerritories(markets: Market[] = getMarkets()): Uint16Array {
    this.indexMarkets(markets);
    const territories = this.expandMarkets(markets);
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
    const woodAdjustments = new Map<number, MarketGoodTotals>();

    for (const [cellId, depletion] of getDepletedCells()) {
      for (const contribution of index.woodByCell.get(cellId) ?? []) {
        this.addMarketGoodTotal(
          woodAdjustments,
          contribution.marketId,
          contribution.goodId,
          -contribution.amount * depletion
        );
      }
    }

    this.applyRuralTotals(index.standard);

    for (const [marketId, totalsByState] of index.food) {
      for (const [stateId, totals] of totalsByState) {
        const multiplier = foodStressProductionMultiplier(stateId);
        for (const [goodId, monthlyTotals] of totals) {
          this.addRuralOutput(marketId, goodId, monthlyTotals[monthIndex] * multiplier);
        }
      }
    }

    for (const [marketId, totals] of index.wood) {
      const adjustments = woodAdjustments.get(marketId);
      for (const [goodId, amount] of totals) {
        this.addRuralOutput(marketId, goodId, amount + (adjustments?.get(goodId) ?? 0));
      }
    }
  }

  /** Rebuild rural market totals after an editor changes market territories or source data. */
  invalidateRuralProductionCache(): void {
    this.ruralProductionIndex = null;
  }

  private getMarketGood(market: Market, good: Good) {
    const existing = market.goods[good.i];
    if (existing) return existing;

    const initial = { stock: 0, price: good.value };
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
      wood: new Map(),
      woodByCell: new Map()
    };
    const { cells } = this.worldContext.pack;
    const markets = getMarkets();
    const marketCellColumn = getMarketCellColumn();
    const marketIds = new Set(markets.map(market => market.i));
    const biomeProduction = Goods.getBiomesProduction();

    for (const cellId of cells.i) {
      const marketId = marketCellColumn[cellId];
      if (!marketId || !marketIds.has(marketId)) continue;

      for (const contribution of getRuralProductionContributions(cellId, biomeProduction)) {
        const good = Goods.get(contribution.goodId);
        if (!good || !isGoodEnabled(good) || contribution.amount <= 0) continue;

        if (good.name === "Wood") {
          this.addMarketGoodTotal(index.wood, marketId, good.i, contribution.amount);
          const entries = index.woodByCell.get(cellId) ?? [];
          entries.push({ marketId, goodId: good.i, amount: contribution.amount });
          index.woodByCell.set(cellId, entries);
          continue;
        }

        if (good.tags.includes("food")) {
          const stateId = cells.state?.[cellId] ?? 0;
          const totalsByState = index.food.get(marketId) ?? new Map<number, Map<number, number[]>>();
          const totals = totalsByState.get(stateId) ?? new Map<number, number[]>();
          const monthlyTotals = totals.get(good.i) ?? Array.from({ length: 12 }, () => 0);
          for (let month = 1; month <= 12; month++) {
            monthlyTotals[month - 1] += contribution.amount * getSeasonalFoodProductionMultiplier(good, cellId, month);
          }
          totals.set(good.i, monthlyTotals);
          totalsByState.set(stateId, totals);
          index.food.set(marketId, totalsByState);
          continue;
        }

        this.addMarketGoodTotal(index.standard, marketId, good.i, contribution.amount);
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

  private applyRuralTotals(totalsByMarket: Map<number, MarketGoodTotals>): void {
    for (const [marketId, totals] of totalsByMarket) {
      for (const [goodId, amount] of totals) this.addRuralOutput(marketId, goodId, amount);
    }
  }

  private addRuralOutput(marketId: number, goodId: number, amount: number): void {
    if (amount <= 0) return;
    const market = this.marketById[marketId];
    const good = Goods.get(goodId);
    if (!market || !good || !isGoodEnabled(good)) return;
    const marketGood = this.getMarketGood(market, good);
    marketGood.stock = rn(marketGood.stock + amount, 2);
  }

  private addMarketGoodTotal(
    totalsByMarket: Map<number, MarketGoodTotals>,
    marketId: number,
    goodId: number,
    amount: number
  ): void {
    const totals = totalsByMarket.get(marketId) ?? new Map<number, number>();
    totals.set(goodId, (totals.get(goodId) ?? 0) + amount);
    totalsByMarket.set(marketId, totals);
  }

  initializeMarketPrices(): void {
    const goods = getGoods().filter(isGoodEnabled);
    const consumerDemandFactors = this.collectConsumerDemand(goods);
    const industrialDemandFactors = this.collectIndustrialDemand(goods, consumerDemandFactors);
    const avgIngredientsCostByGood = this.calculateAverageBaseCostByGood(goods);
    const populationByMarket = this.calculatePopulationByMarket();

    for (const market of getMarkets()) {
      const population = populationByMarket[market.i] || 0;

      // First pass: raw goods - price from demand/supply ratio
      for (const good of goods) {
        if (!good.distribution) continue;
        const marketGood = this.getMarketGood(market, good);
        const consumerDemand = consumerDemandFactors[good.i] || 0;
        const industrialDemand = industrialDemandFactors[good.i] || 0;
        const demand = population * (consumerDemand + industrialDemand);
        const ratio = (demand + LAPLACE_PRICE_SMOOTHING) / (marketGood.stock + LAPLACE_PRICE_SMOOTHING);
        marketGood.price = rn(good.value * minmax(ratio, PRICE_FLOOR_FACTOR, PRICE_CEILING_FACTOR), 2);
      }

      // Second pass: manufactured goods - average local ingredient cost + base value-added
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
        const avgBaseCost = avgIngredientsCostByGood[good.i] ?? 0;
        const demandPrice = avgMarketCost + Math.max(0, good.value - avgBaseCost);
        marketGood.price = rn(
          minmax(demandPrice, good.value * PRICE_FLOOR_FACTOR, good.value * PRICE_CEILING_FACTOR),
          2
        );
      }
    }
    this.applyLocalTradePriceBias(populationByMarket);
  }

  public get(marketId: number | undefined): Market | undefined {
    if (!marketId) return undefined;
    return this.marketById[marketId];
  }

  private applyLocalTradePriceBias(populationByMarket: number[]): void {
    for (const market of getMarkets()) {
      const population = populationByMarket[market.i] || 0;
      for (const good of getGoods().filter(isGoodEnabled)) {
        const marketGood = this.getMarketGood(market, good);
        const multiplier = getLocalTradePriceMultiplier({
          good,
          marketId: market.i,
          stock: marketGood.stock,
          population
        });
        marketGood.price = rn(
          minmax(good.value * PRICE_FLOOR_FACTOR, marketGood.price * multiplier, good.value * PRICE_CEILING_FACTOR),
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

    const maxId = markets.reduce((max, m) => Math.max(max, m.i), 0);
    const marketId = maxId + 1;
    const market: Market = { i: marketId, centerBurgId: burgId, color: getRandomColor(), goods: {} };
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
    budget = Infinity
  }: {
    burg: Burg;
    good: Good;
    units: number;
    budget?: number;
  }): Deal | null {
    if (!isGoodEnabled(good)) return null;
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
    marketGood.price = rn(this.applyMarketPressure(good.value, marketGood.price, actualUnits), 2);
    return deal;
  }

  sell({ burg, good, units, taxRate }: { burg: Burg; good: Good; units: number; taxRate: number }): Deal | null {
    if (!isGoodEnabled(good)) return null;
    const market = this.get(burg.market);
    if (!market || units <= 0) return null;

    const marketGood = this.getMarketGood(market, good);
    const price = this.customerSellPrice(marketGood.price, burg.i, good.i);
    const tax = rn(units * price * taxRate, 2);
    marketGood.stock = rn(marketGood.stock + units, 2);

    const deals = getDeals();
    const deal: Deal = {
      i: deals.length,
      seller: burg.i!,
      sellerType: "burg",
      buyer: market.i,
      buyerType: "market",
      good: good.i,
      units: rn(units, 2),
      price,
      tax
    };
    deals.push(deal);

    marketGood.price = rn(this.applyMarketPressure(good.value, marketGood.price, -units), 2);
    return deal;
  }

  /**
   * Atomically consumes construction materials from one market for Shipbuilding.
   * Unlike buy(), Phase 8 intentionally does not create a Deal or charge an owner;
   * it only models the physical inventory draw and resulting market price pressure.
   */
  tryConsumeShipbuildingMaterials(
    marketId: number,
    materials: ShipbuildingMaterials
  ): ShipbuildingMaterialRequestResult {
    // `marketById` is populated during generation; saved maps can reach this path
    // before an explicit `Markets.sync()`, so retain a canonical pack fallback.
    const market = this.get(marketId) ?? getMarkets().find(candidate => candidate.i === marketId);
    if (!market) return { status: "noMarket" };

    const required: Array<{ good: Good; amount: number; stock: { stock: number; price: number } }> = [];
    const missing: ShipbuildingMaterialShortage = {};

    for (const material of SHIPBUILDING_MATERIAL_IDS) {
      const amount = materials[material];
      const good = getGoods().find(candidate => candidate.name === material);
      if (!good || !isGoodEnabled(good)) return { status: "missingGood" };

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

    for (const { good, amount, stock } of required) {
      stock.stock = rn(Math.max(0, stock.stock - amount), 2);
      stock.price = rn(this.applyMarketPressure(good.value, stock.price, amount), 2);
    }

    return { status: "fulfilled" };
  }

  runGlobalTrade(): void {
    const goods = getGoods().filter(isGoodEnabled);
    const consumerDemandFactors = this.collectConsumerDemand(goods);
    const industrialDemandFactors = this.collectIndustrialDemand(goods, consumerDemandFactors);
    const populationByMarket = this.calculatePopulationByMarket();

    const mapDiagonal = Math.hypot(this.worldContext.graphWidth, this.worldContext.graphHeight) || 1;
    const TRADE_RESERVE_FACTOR = 0.2;
    const MIN_UNIT = 0.1;
    const travelRoutes = this.getCachedMarketTradeRoutes();

    for (const good of goods) {
      if (!good.distribution && !good.recipes?.length) continue;

      const safetyReserves: number[] = [];
      const exporters: { market: Market; reserve: number }[] = [];
      const importers: { market: Market; reserve: number }[] = [];

      for (const market of getMarkets()) {
        const population = populationByMarket[market.i] || 0;
        const demand = population * ((consumerDemandFactors[good.i] || 0) + (industrialDemandFactors[good.i] || 0));
        const reserve = demand * (1 + TRADE_RESERVE_FACTOR);
        safetyReserves[market.i] = reserve;

        const marketGood = this.getMarketGood(market, good);
        if (marketGood.stock > reserve) {
          exporters.push({ market, reserve });
        } else if (marketGood.stock < reserve) {
          importers.push({ market, reserve });
        }
      }

      const opportunities: {
        exporter: Market;
        importer: Market;
        reserveExporter: number;
        reserveImporter: number;
        transportCost: number;
        exporterTaxPerUnit: number;
        units: number;
        unitProfit: number;
        totalProfit: number;
        distance: number;
        distanceKm: number;
        durationDays: number;
        maintenanceCost: number;
        routeSegments: TradeRouteSegment[];
        targetSalePrice?: number;
      }[] = [];

      const importerStockAdjustments = new Map<number, number>();

      if (exporters.length && importers.length) {
        for (const exporter of exporters) {
          const routes = travelRoutes[exporter.market.i];
          if (!routes) continue;

          const exporterGood = this.getMarketGood(exporter.market, good);
          const available = Math.max(0, exporterGood.stock - exporter.reserve);
          if (available < MIN_UNIT) continue;

          const exporterCenter = this.worldContext.pack.burgs[exporter.market.centerBurgId];
          const exporterTaxPerUnit = this.getSalesTax(exporterCenter) * exporterGood.price;

          for (const importer of importers) {
            const importerGood = this.getMarketGood(importer.market, good);
            const needed = Math.max(0, importer.reserve - importerGood.stock);
            const units = Math.min(available, needed);
            if (units < MIN_UNIT) continue;

            const route = routes[importer.market.i];
            if (
              !route ||
              !isGoodTradePermitted(good, route.durationDays, route.segments) ||
              !isMarketTradePermitted(exporter.market, importer.market, route.durationDays)
            ) {
              continue;
            }

            const transportCost = getTransportCost(route.distance, mapDiagonal) * good.value;
            const unitProfit = importerGood.price - (exporterGood.price + transportCost + exporterTaxPerUnit);
            const totalProfit = getNetTradeProfit(unitProfit, units, route.durationDays);
            if (totalProfit < MIN_TRADE_PROFIT) continue;

            opportunities.push({
              exporter: exporter.market,
              importer: importer.market,
              reserveExporter: exporter.reserve,
              reserveImporter: importer.reserve,
              transportCost,
              exporterTaxPerUnit,
              units,
              unitProfit,
              totalProfit,
              distance: route.distance,
              distanceKm: route.distanceKm,
              durationDays: route.durationDays,
              maintenanceCost: getCaravanMaintenanceCost(route.durationDays),
              routeSegments: route.segments
            });
          }
        }
      }

      if (!opportunities.length) {
        this.addSpeculativeGlobalTradeOpportunities({
          good,
          populationByMarket,
          travelRoutes,
          mapDiagonal,
          opportunities
        });
      }

      opportunities.sort((a, b) => b.totalProfit - a.totalProfit || b.units - a.units);
      for (const opportunity of opportunities) {
        const exporterGood = this.getMarketGood(opportunity.exporter, good);
        const importerGood = this.getMarketGood(opportunity.importer, good);

        const available = Math.max(0, exporterGood.stock - opportunity.reserveExporter);
        const importerAdj = importerStockAdjustments.get(opportunity.importer.i) || 0;
        const needed = Math.max(0, opportunity.reserveImporter - (importerGood.stock + importerAdj));
        const units = Math.min(available, needed);
        if (units < MIN_UNIT) continue;

        const landedCost = exporterGood.price + opportunity.transportCost + opportunity.exporterTaxPerUnit;
        const targetSalePrice = opportunity.targetSalePrice ?? importerGood.price;
        const totalProfit = getNetTradeProfit(targetSalePrice - landedCost, units, opportunity.durationDays);
        if (totalProfit < MIN_TRADE_PROFIT) continue;

        const deals = getDeals();
        const deal: Deal = {
          i: deals.length,
          seller: opportunity.exporter.i,
          sellerType: "market",
          buyer: opportunity.importer.i,
          buyerType: "market",
          good: good.i,
          units,
          price: landedCost,
          tax: opportunity.exporterTaxPerUnit * units,
          distance: rn(opportunity.distanceKm, 2),
          durationDays: opportunity.durationDays,
          maintenanceCost: rn(opportunity.maintenanceCost, 2),
          accountingPeriodDays: getTradeAccountingPeriodDays(opportunity.durationDays)
        };
        deals.push(deal);

        exporterGood.price = rn(this.applyMarketPressure(good.value, exporterGood.price, units), 2);
        importerGood.price = rn(this.applyMarketPressure(good.value, importerGood.price, -units), 2);
        exporterGood.stock = rn(exporterGood.stock - units, 2);
        importerStockAdjustments.set(opportunity.importer.i, importerAdj + units);
        // Note: importerGood.stock is NO LONGER instantly increased. Caravans physically transport it.
      }
    }
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
    opportunities: {
      exporter: Market;
      importer: Market;
      reserveExporter: number;
      reserveImporter: number;
      transportCost: number;
      exporterTaxPerUnit: number;
      units: number;
      unitProfit: number;
      totalProfit: number;
      distance: number;
      distanceKm: number;
      durationDays: number;
      maintenanceCost: number;
      routeSegments: TradeRouteSegment[];
      targetSalePrice?: number;
    }[];
  }): void {
    const markets = getMarkets();
    for (const exporter of markets) {
      const routes = travelRoutes[exporter.i];
      if (!routes) continue;

      const exporterGood = this.getMarketGood(exporter, good);
      if (exporterGood.stock < 0.1) continue;

      const exporterCenter = this.worldContext.pack.burgs[exporter.centerBurgId];
      const exporterTaxPerUnit = this.getSalesTax(exporterCenter) * exporterGood.price;

      for (const importer of markets) {
        if (importer.i === exporter.i) continue;
        const route = routes[importer.i];
        if (
          !route ||
          !isGoodTradePermitted(good, route.durationDays, route.segments) ||
          !isMarketTradePermitted(exporter, importer, route.durationDays)
        ) {
          continue;
        }

        const importerGood = this.getMarketGood(importer, good);
        const estimate = estimateSpeculativeTrade({
          good,
          sourceMarketId: exporter.i,
          targetMarketId: importer.i,
          sourceGood: exporterGood,
          targetGood: importerGood,
          sourcePopulation: populationByMarket[exporter.i] || 0,
          targetPopulation: populationByMarket[importer.i] || 0,
          distance: route.distance,
          mapDiagonal,
          routeSegments: route.segments,
          distanceScale: this.worldContext.distanceScale
        });
        if (!estimate) continue;

        const landedCost = exporterGood.price + estimate.transportCost + exporterTaxPerUnit;
        const unitProfit = estimate.sellPrice - landedCost;
        const totalProfit = estimate.totalProfit;

        opportunities.push({
          exporter,
          importer,
          reserveExporter: Math.max(0, exporterGood.stock - estimate.maxUnits),
          reserveImporter: importerGood.stock + estimate.maxUnits,
          transportCost: estimate.transportCost,
          exporterTaxPerUnit,
          units: estimate.maxUnits,
          unitProfit,
          totalProfit,
          distance: route.distance,
          distanceKm: route.distanceKm,
          durationDays: route.durationDays,
          maintenanceCost: estimate.maintenanceCost,
          routeSegments: route.segments,
          targetSalePrice: estimate.sellPrice
        });
      }
    }
  }

  private getMarketTradeRoute(source: Burg, target: Burg): MarketTradeRoute | null {
    if (source.i === target.i) return null;

    const routePath = this.worldContext.pack.cells?.routes
      ? TradeAnimation.findRoutePath(source.cell, target.cell)
      : null;
    const segments: TradeRouteSegment[] = routePath?.segments?.length
      ? routePath.segments.map(segment => ({
          type: segment.type,
          // Preserve cell ids for grade-aware duration / pathfinding consistency (Phase 1).
          points: segment.points.map((p): TradeRouteSegment["points"][number] =>
            typeof p[2] === "number" ? [p[0], p[1], p[2]] : [p[0], p[1]]
          )
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
      segments
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

  getWarPriceModifier(burgId: number | undefined, goodId: number | undefined): number {
    if (!burgId || !goodId) {
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

    const burg = this.worldContext.pack.burgs[burgId];
    const stateId = burg?.state ?? 0;
    const isFoodRelated = good.tags?.includes("food") || good.warEconomyType === "essential";
    const foodStressMod = isFoodRelated ? foodStressPriceMultiplier(stateId) : 1;

    const intensity = ledger.warIntensity || 0;
    if (intensity === 0) {
      return foodStressMod;
    }

    const durationTicks = ledger.warDurationTicks || 0;
    const durationFactor = Math.min(1.0, durationTicks / 10);

    let warType = good.warEconomyType;
    if (!warType) {
      const defaultGood = GOODS_DATA.find((g: { name: string; warEconomyType?: string }) => g.name === good.name);
      warType = defaultGood?.warEconomyType;
    }

    if (!warType) {
      return foodStressMod;
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
        return foodStressMod;
    }

    const warMod = 1 + baseMultiplier * intensity * (1 + durationFactor);
    // essential (and food-tagged goods using essential) get agricultural shock on top of war heat
    return warType === "essential" || good.tags?.includes("food") ? warMod * foodStressMod : warMod;
  }

  customerBuyPrice(midPrice: number, burgId?: number, goodId?: number): number {
    const warMod = this.getWarPriceModifier(burgId, goodId);
    return rn(midPrice * warMod * (1 + MARKET_MARGIN), 2);
  }

  customerSellPrice(midPrice: number, burgId?: number, goodId?: number): number {
    const warMod = this.getWarPriceModifier(burgId, goodId);
    return rn(midPrice * warMod * (1 - MARKET_MARGIN), 2);
  }

  private applyMarketPressure(basePrice: number, currentPrice: number | undefined, units: number): number {
    const price = currentPrice ?? basePrice;
    const floor = basePrice * PRICE_FLOOR_FACTOR;
    const ceiling = basePrice * PRICE_CEILING_FACTOR;
    return minmax(floor, price + units * basePrice * MARKET_PRESSURE_FACTOR, ceiling);
  }

  private collectConsumerDemand(goods: Good[]): number[] {
    const totalCoverageByCategory = Object.fromEntries(
      DEMAND_PRIORITY.map(category => [
        category,
        goods.reduce((sum, g) => sum + (g?.demandCoverage?.[category] || 0), 0) || 1
      ])
    ) as Record<DemandCategory, number>;

    const demandFactor: number[] = [];
    for (const good of goods) {
      demandFactor[good.i] = DEMAND_PRIORITY.reduce((sum, category) => {
        const share = (good?.demandCoverage?.[category] || 0) / (totalCoverageByCategory[category] || 1);
        return sum + share * DEMAND_TARGET_FACTORS[category];
      }, 0);
    }
    return demandFactor;
  }

  private collectIndustrialDemand(goods: Good[], consumerDemandFactors: number[]): number[] {
    // Per-capita demand for ingredients driven by consumer demand for their manufactured outputs.
    const demandFactor: number[] = [];
    for (const good of goods) {
      if (!good.recipes?.length) continue;
      const outputDemand = consumerDemandFactors[good.i] || 0;
      for (const recipe of good.recipes) {
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
}

export const Markets = new MarketsModule();
