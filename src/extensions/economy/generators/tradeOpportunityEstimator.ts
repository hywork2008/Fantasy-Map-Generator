import { type Good, type GoodTradeProfile, getDefaultGoodTradeProfile, isFreshFoodGood } from "./goods-generator";
import { getMarketTradeMinimumUnits } from "./goodsTradeLots";
import type { TradeRoutePoint, TradeRouteSegment } from "./marketTypes";
import { calculateRouteDurationDays } from "./tradeRouteDuration";

const DISTANCE_COST_FACTOR = 0.5;
export const MIN_TRADE_PROFIT = 1;
export const CARAVAN_DAILY_MAINTENANCE_COST = 0.5;
export const VALUE_DENSITY_BASE_MAX_DAYS = 12;
export const VALUE_DENSITY_MULTIPLIER = 4;
export const PERISHABLE_MAX_TRADE_DAYS = 10;
/**
 * Sea-leg cap for dry-stored staples (grain), distinct from PERISHABLE_MAX_TRADE_DAYS (which
 * governs genuinely fast-rotting fresh food like Fish/Game). Grounded in bulk grain-by-sea
 * history rather than the value-density "worth the wagon" heuristic:
 * - Rome's Alexandria–Ostia grain fleet ran 18–25 days under normal wind, with adverse-wind
 *   voyages of 50–60 days still delivering usable cargo (not a spoilage failure case).
 * - Grain shipped dry (<12% moisture, the trading norm) stays stable for months without
 *   ventilation; deterioration on a ~6-week timescale only shows up at high moisture (>14%) and
 *   warm holds — i.e. dampness/temperature drive spoilage, not elapsed voyage days alone.
 * - Age-of-sail victualling routinely provisioned 4–8 months of grain-based rations (hardtack),
 *   corroborating multi-month viability for well-dried grain.
 * 30 days comfortably covers the historically "normal" case with margin, while still being
 * shorter than a fully durable good's reach (Major org cap is 50 days) to keep some at-sea
 * dampness risk in the model per the same reasoning that keeps land uncapped below.
 */
export const STAPLE_FOOD_SEA_MAX_TRADE_DAYS = 30;
/**
 * Day caps for "freshFood"-tagged goods (Fish, Game, Shellfish — raw, unprocessed protein, as
 * opposed to Grain/other `stapleFood`, which store for a year dry). Unlike staples, real spoilage
 * here is dominated by ambient heat, not elapsed transit time alone, so the cap is keyed off the
 * hottest cell the route actually passes through (see `getRouteMaxTemperatureC`):
 * - At or below FRESH_FOOD_COLD_MAX_TEMP_C (naturally cool/alpine terrain, effectively a moving
 *   icebox): treated like a durability good, capped only by PERISHABLE_MAX_TRADE_DAYS/density.
 * - Above that but at or below FRESH_FOOD_COOL_MAX_TEMP_C (temperate climate, no active cooling):
 *   a short multi-day window.
 * - Above FRESH_FOOD_COOL_MAX_TEMP_C (warm/hot climate): next to no window — raw fish/meat left
 *   at ambient warmth spoils within about a day without preservation (salting/drying/smoking,
 *   which are separate processed goods, not this good).
 * Route temperature is unavailable when a route carries no cell ids (e.g. the trade-opportunities
 * dialog's graph-distance estimate); callers pass `undefined` in that case and the rule fails
 * closed to the one-day hot-climate limit. Treating unknown exposure as a cool cellar used to let
 * legacy `[x, y]` caravan routes carry raw food for up to ten days.
 */
export const FRESH_FOOD_COLD_MAX_TEMP_C = 10;
export const FRESH_FOOD_COOL_MAX_TEMP_C = 20;
export const FRESH_FOOD_COOL_MAX_TRADE_DAYS = 2;
export const FRESH_FOOD_HOT_MAX_TRADE_DAYS = 1;

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
  routeMaxTemperatureC?: number;
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

/**
 * Reads the cell temperature (°C, grid-cell-indexed) each route point falls on and returns the
 * hottest one encountered — the leg that actually limits how long raw perishable cargo survives
 * the trip. `undefined` when no point on the route carries a cell id (see module doc above).
 */
export function getRouteMaxTemperatureC(
  routeSegments: readonly Pick<TradeRouteSegment, "points">[] | undefined,
  packCellGridIndex: ArrayLike<number> | undefined,
  gridCellTemperatureC: ArrayLike<number> | undefined
): number | undefined {
  if (!packCellGridIndex || !gridCellTemperatureC) return undefined;
  let maxTemp: number | undefined;
  for (const segment of routeSegments ?? []) {
    for (const point of segment.points) {
      const cellId = (point as TradeRoutePoint)[2];
      if (cellId === undefined) continue;
      const gridCellId = packCellGridIndex[cellId];
      const temp = gridCellId === undefined ? undefined : gridCellTemperatureC[gridCellId];
      if (temp === undefined) continue;
      if (maxTemp === undefined || temp > maxTemp) maxTemp = temp;
    }
  }
  return maxTemp;
}

function getFreshFoodMaxTradeDays(routeMaxTemperatureC: number | undefined): number {
  if (routeMaxTemperatureC === undefined) return FRESH_FOOD_HOT_MAX_TRADE_DAYS;
  if (routeMaxTemperatureC <= FRESH_FOOD_COLD_MAX_TEMP_C) return PERISHABLE_MAX_TRADE_DAYS;
  if (routeMaxTemperatureC <= FRESH_FOOD_COOL_MAX_TEMP_C) return FRESH_FOOD_COOL_MAX_TRADE_DAYS;
  return FRESH_FOOD_HOT_MAX_TRADE_DAYS;
}

export function getGoodMaxTradeDurationDays(
  good: Good,
  routeSegments?: readonly Pick<TradeRouteSegment, "type">[],
  routeMaxTemperatureC?: number,
  refrigeratedTransport?: boolean
): number {
  const trade = good.trade ?? getDefaultGoodTradeProfile(good);
  const densityLimit = Math.max(1, VALUE_DENSITY_BASE_MAX_DAYS * getGoodValueDensity(good) * VALUE_DENSITY_MULTIPLIER);

  if (good.tags.includes("stapleFood")) {
    // Dry-stored staples (grain: ~1 year shelf life) aren't decay-limited by elapsed transit time
    // on either leg — the density cap above represents "worth the wagon" bulk-transport
    // economics, not spoilage, so it doesn't apply to this good at all. Land-only routes are
    // bounded only by the merchant organization's own day cap (isMarketTradePermitted) and route
    // profitability. Sea routes get STAPLE_FOOD_SEA_MAX_TRADE_DAYS instead, reflecting real
    // (if modest, for well-dried cargo) dampness risk in a ship's hold.
    const hasSeaLeg = routeSegments?.some(segment => segment.type === "water" || segment.type === "sea") ?? false;
    return hasSeaLeg ? STAPLE_FOOD_SEA_MAX_TRADE_DAYS : Number.POSITIVE_INFINITY;
  }

  if (isFreshFoodGood(good)) {
    // Once refrigerated transport exists (mechanicalRefrigeration adopted at the origin, §3.8),
    // treat this good like any other durable good instead of routing through the climate-based
    // cap — docs/plan/mechanical-refrigeration-and-cold-chain.md §3.8.
    if (refrigeratedTransport) return densityLimit;
    return Math.min(densityLimit, getFreshFoodMaxTradeDays(routeMaxTemperatureC));
  }

  return trade.timeValueTrend < 0 ? Math.min(densityLimit, PERISHABLE_MAX_TRADE_DAYS) : densityLimit;
}

export function isGoodTradePermitted(
  good: Good,
  durationDays: number,
  routeSegments?: readonly Pick<TradeRouteSegment, "type">[],
  routeMaxTemperatureC?: number,
  refrigeratedTransport?: boolean
): boolean {
  // Without refrigeration nor a retail delivery model that can sell a raw cargo on its arrival
  // day, fresh goods must be consumed or processed locally; only their preserved recipes are
  // eligible for inter-market caravan trade. Once the origin State has adopted
  // mechanicalRefrigeration, refrigeratedTransport lifts this ban — docs/plan/mechanical-
  // refrigeration-and-cold-chain.md §3.8.
  if (isFreshFoodGood(good) && !refrigeratedTransport) return false;
  if (
    !Number.isFinite(durationDays) ||
    durationDays > getGoodMaxTradeDurationDays(good, routeSegments, routeMaxTemperatureC, refrigeratedTransport)
  )
    return false;
  return (
    !good.seaOnly ||
    (Boolean(routeSegments?.length) &&
      routeSegments?.every(segment => segment.type === "water" || segment.type === "sea") === true)
  );
}

/**
 * Fresh cargo starts ageing as soon as a merchant reserves it, not only once its caravan moves.
 * Reserve enough of its route-specific shelf-life for the longest permitted loading wait.
 * Other goods retain the existing route-duration-only economic rule.
 */
export function isGoodTradePermittedForShipment(
  good: Good,
  durationDays: number,
  maxLoadingWaitDays: number,
  routeSegments?: readonly Pick<TradeRouteSegment, "type">[],
  routeMaxTemperatureC?: number,
  refrigeratedTransport?: boolean
): boolean {
  const elapsedDays = isFreshFoodGood(good) ? durationDays + Math.max(0, maxLoadingWaitDays) : durationDays;
  return isGoodTradePermitted(good, elapsedDays, routeSegments, routeMaxTemperatureC, refrigeratedTransport);
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
    durationDays: suppliedDurationDays,
    routeMaxTemperatureC
  } = input;
  const minimumTradeUnits = getMarketTradeMinimumUnits(good);
  if (sourceGood.stock < minimumTradeUnits) return null;

  const durationDays =
    suppliedDurationDays ??
    (routeSegments && distanceScale !== undefined
      ? calculateRouteDurationDays(routeSegments, distanceScale)
      : Infinity);
  if (!isGoodTradePermitted(good, durationDays, routeSegments, routeMaxTemperatureC)) return null;

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
  if (maxUnits < minimumTradeUnits) return null;

  const maintenanceCost = getCaravanMaintenanceCost(durationDays);
  const totalProfit = getNetTradeProfit(unitProfit, maxUnits, durationDays);
  // Whether this trade alone justifies a dedicated trip is a route-level decision, not a
  // per-good one: a route bundles every good crossing it into one caravan/shipment, and the
  // route's shared maintenanceCost only needs to be covered once by the bundle as a whole
  // (see Markets.runGlobalTrade's route-viability pass and Caravans.selectRouteCargo).
  // Callers that evaluate a single good in isolation (e.g. the trade-opportunities browser)
  // must apply their own `totalProfit >= MIN_TRADE_PROFIT` check on the returned estimate.

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
