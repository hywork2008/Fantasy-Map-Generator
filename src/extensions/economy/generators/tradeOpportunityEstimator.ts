import { type Good, type GoodTradeProfile, getDefaultGoodTradeProfile } from "./goods-generator";
import type { TradeRouteSegment } from "./marketTypes";
import { calculateRouteDurationDays } from "./tradeRouteDuration";

const DISTANCE_COST_FACTOR = 0.5;
export const MIN_TRADE_PROFIT = 1;
export const CARAVAN_DAILY_MAINTENANCE_COST = 0.5;
export const VALUE_DENSITY_BASE_MAX_DAYS = 12;
export const VALUE_DENSITY_MULTIPLIER = 4;
export const PERISHABLE_MAX_TRADE_DAYS = 10;

interface MarketGoodState {
  stock: number;
  price: number;
}

export interface SpeculativeTradeInput {
  good: Good;
  sourceMarketId: number;
  targetMarketId: number;
  sourceGood: MarketGoodState;
  targetGood: MarketGoodState;
  sourcePopulation: number;
  targetPopulation: number;
  distance: number;
  mapDiagonal: number;
  routeSegments?: readonly TradeRouteSegment[];
  distanceScale?: number;
  durationDays?: number;
  buyPrice?: number;
  sellPrice?: number;
}

interface LocalPriceBiasInput {
  good: Good;
  marketId: number;
  stock: number;
  population: number;
}

export interface SpeculativeTradeEstimate {
  buyPrice: number;
  sellPrice: number;
  transportCost: number;
  unitProfit: number;
  maxUnits: number;
  totalProfit: number;
  maintenanceCost: number;
}

const DEFAULT_TRADE_PROFILE: GoodTradeProfile = {
  weight: 3,
  bulk: 3,
  rarity: 2,
  distancePremium: 0,
  timeValueTrend: 0,
  durability: 3,
  lossRisk: 2
};

export function getTransportCost(distance: number, mapDiagonal: number): number {
  return (distance / mapDiagonal) * DISTANCE_COST_FACTOR;
}

export function getLocalTradePriceMultiplier({ good, marketId, stock, population }: LocalPriceBiasInput): number {
  const demandWeight = getDemandWeight(good);
  const reserve = Math.max(1, population * demandWeight);
  const stockRatio = stock / reserve;
  const trade = good.trade ?? DEFAULT_TRADE_PROFILE;
  const tradeSensitivity = 0.75 + trade.rarity * 0.08 + Math.max(0, trade.distancePremium) * 0.08;
  const scarcityPressure = clamp((1 - stockRatio) * 0.1, -0.18, 0.18);
  const localSupplyPressure = -getMarketBias(good.i, marketId) * 0.7 * tradeSensitivity;
  return clamp(1 + scarcityPressure + localSupplyPressure, 0.75, 1.45);
}

export function getGoodValueDensity(good: Good): number {
  const trade = good.trade ?? getDefaultGoodTradeProfile(good);
  return good.value / Math.max(1, trade.weight + trade.bulk);
}

export function getGoodMaxTradeDurationDays(good: Good): number {
  const trade = good.trade ?? getDefaultGoodTradeProfile(good);
  const densityLimit = Math.max(1, VALUE_DENSITY_BASE_MAX_DAYS * getGoodValueDensity(good) * VALUE_DENSITY_MULTIPLIER);
  return trade.timeValueTrend < 0 ? Math.min(densityLimit, PERISHABLE_MAX_TRADE_DAYS) : densityLimit;
}

export function isGoodTradePermitted(good: Good, durationDays: number): boolean {
  return Number.isFinite(durationDays) && durationDays <= getGoodMaxTradeDurationDays(good);
}

export function getCaravanMaintenanceCost(durationDays: number): number {
  return durationDays * CARAVAN_DAILY_MAINTENANCE_COST;
}

export function getNetTradeProfit(unitProfit: number, units: number, durationDays: number): number {
  return unitProfit * units - getCaravanMaintenanceCost(durationDays);
}

export function getTradeAccountingPeriodDays(durationDays: number): 7 | 30 {
  return durationDays <= 10 ? 7 : 30;
}

export function estimateSpeculativeTrade(input: SpeculativeTradeInput): SpeculativeTradeEstimate | null {
  const {
    good,
    sourceMarketId,
    targetMarketId,
    sourceGood,
    targetGood,
    sourcePopulation,
    targetPopulation,
    distance,
    mapDiagonal,
    routeSegments,
    distanceScale,
    durationDays: suppliedDurationDays
  } = input;
  if (sourceGood.stock < 0.1) return null;

  const durationDays =
    suppliedDurationDays ??
    (routeSegments && distanceScale !== undefined
      ? calculateRouteDurationDays(routeSegments, distanceScale)
      : Infinity);
  if (!isGoodTradePermitted(good, durationDays)) return null;

  const transportCost = getTransportCost(distance, mapDiagonal) * good.value;
  const demandWeight = getDemandWeight(good);
  const sourceReserve = Math.max(1, sourcePopulation * demandWeight);
  const targetReserve = Math.max(1, targetPopulation * demandWeight);
  const sourceAbundance = sourceGood.stock / sourceReserve;
  const targetScarcity = targetReserve / (targetGood.stock + 1);
  const sourceSupplyScore = getSupplyScore(good.i, sourceMarketId, sourceGood.stock, sourceReserve);
  const targetSupplyScore = getSupplyScore(good.i, targetMarketId, targetGood.stock, targetReserve);
  const supplyDelta = sourceSupplyScore - targetSupplyScore;
  if (supplyDelta <= 0) return null;

  const trade = good.trade ?? DEFAULT_TRADE_PROFILE;
  const distanceRatio = Math.min(1, distance / mapDiagonal);

  const rarityPremium = trade.rarity * 0.025;
  const distancePremium = Math.max(0, trade.distancePremium) * 0.05 * distanceRatio;
  const scarcityPremium = Math.min(0.35, targetScarcity * 0.05 + Math.max(0, sourceAbundance - 1) * 0.03);
  const cargoPenalty = Math.max(0, trade.weight + trade.bulk + trade.lossRisk - trade.durability - 6) * 0.015;
  const profitMargin = Math.max(0.06, rarityPremium + distancePremium + scarcityPremium - cargoPenalty);

  const sourceDiscount = Math.min(0.25, 0.04 + supplyDelta * 0.04);
  const targetPremium = Math.min(0.45, 0.06 + supplyDelta * 0.06 + scarcityPremium);
  const localBuyPrice = sourceGood.price * Math.max(0.75, 1.05 - sourceDiscount);
  const localSellPrice = targetGood.price * (0.95 + targetPremium);
  const buyPrice = roundPrice(Math.min(input.buyPrice ?? localBuyPrice, localBuyPrice));
  const quotedSellPrice = Math.max(input.sellPrice ?? localSellPrice, localSellPrice);
  const minimumSellPrice = buyPrice + transportCost + good.value * profitMargin;
  const sellPrice = roundPrice(Math.max(quotedSellPrice, minimumSellPrice));
  const unitProfit = roundPrice(sellPrice - buyPrice - transportCost);
  if (unitProfit <= 0) return null;

  const targetCapacity = Math.max(1, targetReserve * 0.5, sourceGood.stock * 0.1);
  const maxUnits = roundUnits(Math.min(sourceGood.stock * 0.25, targetCapacity));
  if (maxUnits < 0.1) return null;

  const maintenanceCost = getCaravanMaintenanceCost(durationDays);
  const totalProfit = getNetTradeProfit(unitProfit, maxUnits, durationDays);
  if (totalProfit < MIN_TRADE_PROFIT) return null;

  return {
    buyPrice,
    sellPrice,
    transportCost: roundPrice(transportCost),
    unitProfit,
    maxUnits,
    totalProfit: roundPrice(totalProfit),
    maintenanceCost: roundPrice(maintenanceCost)
  };
}

function getDemandWeight(good: Good): number {
  const consumerDemand = Object.values(good.demandCoverage ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
  if (consumerDemand > 0) return consumerDemand * 0.2;
  if (good.recipes?.length) return 0.1;
  return 0.05;
}

function getSupplyScore(goodId: number, marketId: number, stock: number, reserve: number): number {
  return stock / reserve + getMarketBias(goodId, marketId);
}

function getMarketBias(goodId: number, marketId: number): number {
  const value = (marketId * 1103515245 + goodId * 12345 + 0x9e3779b9) >>> 0;
  return ((value % 1000) / 1000 - 0.5) * 0.5;
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundUnits(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
