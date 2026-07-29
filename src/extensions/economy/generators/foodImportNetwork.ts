import {
  buildLandRouteGraph,
  buildSeaRouteGraph,
  findLandRouteDistance,
  findSeaRouteDistance,
  type WorldContext
} from "../../hostCore";
import { rn } from "../../hostUtils";
import { getGoods, getMarkets } from "../economyContext";
import { getBurgMarketLedger } from "./burgMarketLedgers";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { Markets } from "./markets-generator";
import type { Market } from "./marketTypes";
import { calculateRouteDurationFromDistances } from "./tradeRouteDuration";
import { TradeSecurity } from "./tradeSecurity";

/** Grains and other durable staples remain usable for roughly one season in transit. */
export const FOOD_SPOILAGE_HALF_LIFE_DAYS = 90;
const QUARTERS_PER_YEAR = 4;

/** A resolved quarterly food shipment between two market hubs. */
export interface FoodFlowEdge {
  fromMarketId: number;
  toMarketId: number;
  /** Food loaded at the supplying market, before transit losses. */
  volume: number;
  travelDays: number;
  /** Fraction of cargo remaining after spoilage, from 0 through 1. */
  spoilageDecay: number;
  /** Probability-equivalent loss from banditry, piracy, and war along this journey. */
  securityRisk: number;
}

let lastFoodFlows: FoodFlowEdge[] = [];

/** Most recently resolved flows for diagnostics and a future trade-layer overlay. */
export function getFoodImportFlows(): readonly FoodFlowEdge[] {
  return lastFoodFlows;
}

interface FoodRoute {
  travelDays: number;
}

/**
 * Matches quarterly market food surpluses to deficits and writes the resulting carrying-capacity
 * support back to burg demographics. The method deliberately has no renderer dependency: food
 * flows are economic simulation data and visualization can consume the returned edges later.
 */
export function resolveFoodImportNetwork(worldContext: Readonly<WorldContext>): FoodFlowEdge[] {
  const { pack } = worldContext;
  const markets = getMarkets();
  const burgs = pack.burgs ?? [];

  resetEffectiveCapacities(burgs);
  for (const market of markets) {
    if (!market.foodLedger) continue;
    market.foodLedger.satisfiedImport = 0;
    market.foodLedger.importCapacityBonus = 0;
  }

  if (!markets.length || !pack.routes?.length) {
    lastFoodFlows = [];
    return lastFoodFlows;
  }

  const foodGood = getGoods().find(good => good.tags?.includes("food"));
  const landGraph = buildLandRouteGraph(pack, {
    month: worldContext.options.month ?? 1,
    mapCoordinates: worldContext.mapCoordinates,
    graphHeight: worldContext.graphHeight
  });
  const seaGraph = buildSeaRouteGraph(pack);
  const remainingExport = new Map<number, number>();
  for (const market of markets) {
    remainingExport.set(market.i, Math.max(0, market.foodLedger?.exportable ?? 0));
  }

  const importers = markets
    .filter(market => (market.foodLedger?.importNeed ?? 0) > 0)
    .sort((left, right) => getImportPriority(right, foodGood?.i) - getImportPriority(left, foodGood?.i));
  const flows: FoodFlowEdge[] = [];

  for (const importer of importers) {
    const ledger = importer.foodLedger;
    if (!ledger) continue;
    let remainingNeed = ledger.importNeed;
    const candidates = markets
      .filter(supplier => supplier.i !== importer.i && (remainingExport.get(supplier.i) ?? 0) > 0)
      .map(supplier => ({ supplier, route: getFoodRoute(worldContext, supplier, importer, landGraph, seaGraph) }))
      .filter((candidate): candidate is { supplier: Market; route: FoodRoute } => candidate.route !== null)
      .sort((left, right) => left.route.travelDays - right.route.travelDays || left.supplier.i - right.supplier.i);

    for (const { supplier, route } of candidates) {
      if (remainingNeed <= 0) break;
      const available = remainingExport.get(supplier.i) ?? 0;
      if (available <= 0) continue;

      const securityRisk = getSecurityRisk(importer, route.travelDays);
      const spoilageDecay = Math.exp(-route.travelDays / FOOD_SPOILAGE_HALF_LIFE_DAYS);
      const deliveredShare = spoilageDecay * (1 - securityRisk);
      if (deliveredShare <= 0) continue;

      // Load only what can reach the demand market usefully, subject to its finite surplus.
      const volume = Math.min(available, remainingNeed / deliveredShare);
      const delivered = Math.min(remainingNeed, volume * deliveredShare);
      if (volume <= 0 || delivered <= 0) continue;

      remainingExport.set(supplier.i, available - volume);
      remainingNeed -= delivered;
      ledger.satisfiedImport += delivered;
      flows.push({
        fromMarketId: supplier.i,
        toMarketId: importer.i,
        volume: rn(volume, 2),
        travelDays: route.travelDays,
        spoilageDecay: rn(spoilageDecay, 4),
        securityRisk: rn(securityRisk, 4)
      });
    }

    ledger.satisfiedImport = rn(Math.min(ledger.importNeed, ledger.satisfiedImport), 2);
    applyImportCapacity(importer, ledger.satisfiedImport, worldContext);
  }

  lastFoodFlows = flows;
  return lastFoodFlows;
}

/** Restores normal carrying capacity when the economy is disabled or has no viable routes. */
export function resetEffectiveCapacities(
  burgs: readonly { demographics?: { capacity: number; effectiveCapacity?: number } }[]
): void {
  for (const burg of burgs) {
    if (burg.demographics) burg.demographics.effectiveCapacity = burg.demographics.capacity;
  }
}

function getImportPriority(market: Market, foodGoodId: number | undefined): number {
  const price = foodGoodId === undefined ? 1 : (market.goods[foodGoodId]?.price ?? 1);
  return Markets.customerBuyPrice(price, market.centerBurgId, foodGoodId);
}

function getFoodRoute(
  worldContext: Readonly<WorldContext>,
  supplier: Market,
  importer: Market,
  landGraph: ReturnType<typeof buildLandRouteGraph>,
  seaGraph: ReturnType<typeof buildSeaRouteGraph>
): FoodRoute | null {
  const source = worldContext.pack.burgs[supplier.centerBurgId];
  const target = worldContext.pack.burgs[importer.centerBurgId];
  if (!source || !target || source.removed || target.removed) return null;

  const landDistance = findLandRouteDistance(landGraph, source.cell, target.cell);
  const seaDistance = findSeaRouteDistance(seaGraph, source.cell, target.cell);
  const landDays =
    landDistance === null
      ? Infinity
      : calculateRouteDurationFromDistances(landDistance * worldContext.distanceScale, 0, 0);
  const seaDays =
    seaDistance === null
      ? Infinity
      : calculateRouteDurationFromDistances(0, seaDistance * worldContext.distanceScale, 0);
  const travelDays = Math.min(landDays, seaDays);
  return Number.isFinite(travelDays) && travelDays > 0 ? { travelDays } : null;
}

function getSecurityRisk(importer: Market, travelDays: number): number {
  const warIntensity = getBurgMarketLedger(importer.centerBurgId)?.warIntensity ?? 0;
  const perDayRisk = TradeSecurity.getBanditRiskPerDay(importer.centerBurgId, warIntensity);
  return Math.max(0, Math.min(1, 1 - Math.exp(-Math.max(0, perDayRisk) * travelDays)));
}

function applyImportCapacity(market: Market, satisfiedImport: number, worldContext: Readonly<WorldContext>): void {
  const ledger = market.foodLedger;
  if (!ledger || satisfiedImport <= 0) return;

  // Food ledgers operate in actual people per quarter, while burg capacity is an annual
  // population-point limit. Annualize the delivered staple ration before converting units.
  const peoplePerPoint = Math.max(1, (worldContext.populationRate ?? 1) * (worldContext.urbanization ?? 1));
  const capacityBonus = (satisfiedImport * QUARTERS_PER_YEAR) / GROSS_FOOD_NEED / peoplePerPoint;
  ledger.importCapacityBonus = rn(capacityBonus, 3);

  const marketBurgs = worldContext.pack.burgs.filter(
    burg => burg.i && !burg.removed && burg.market === market.i && burg.demographics
  );
  const recipients = marketBurgs.length
    ? marketBurgs
    : [worldContext.pack.burgs[market.centerBurgId]].filter((burg): burg is (typeof worldContext.pack.burgs)[number] =>
        Boolean(burg?.demographics && !burg.removed)
      );
  const totalCapacity = recipients.reduce((sum, burg) => sum + Math.max(0, burg.demographics?.capacity ?? 0), 0);
  if (totalCapacity <= 0) return;

  for (const burg of recipients) {
    const baseCapacity = burg.demographics?.capacity ?? 0;
    if (!burg.demographics) continue;
    burg.demographics.effectiveCapacity = baseCapacity + capacityBonus * (baseCapacity / totalCapacity);
  }
}
