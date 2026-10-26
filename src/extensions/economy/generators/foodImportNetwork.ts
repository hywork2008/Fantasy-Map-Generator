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
import { drawFoodForExport, receiveFoodImport, syncStapleFoodMarketStock } from "./foodCoLoad";
import { FOOD_SPOILAGE_HALF_LIFE_DAYS, GROSS_FOOD_NEED } from "./foodConstants";
import { applyHeatingCapacityBonus } from "./heating";
import { customerBuyPrice } from "./marketPricing";
import type { FoodLedger, Market } from "./marketTypes";
import { getTransportableStapleCropUnits } from "./stapleCropInventory";
import { calculateRouteDurationFromDistances } from "./tradeRouteDuration";
import { TradeSecurity } from "./tradeSecurity";

export { FOOD_SPOILAGE_HALF_LIFE_DAYS } from "./foodConstants";

const QUARTERS_PER_YEAR = 4;

/** A resolved quarterly food shipment between two market hubs. */
export interface FoodFlowEdge {
  fromMarketId: number;
  toMarketId: number;
  /** Actual crop carried by this shipment; never the retired aggregate Grain good. */
  goodId: number;
  /** Food loaded at the supplying market, before transit losses. */
  volume: number;
  travelDays: number;
  /** Fraction of cargo remaining after spoilage, from 0 through 1. */
  spoilageDecay: number;
  /** Probability-equivalent loss from banditry, piracy, and war along this journey. */
  securityRisk: number;
}

let lastFoodFlows: FoodFlowEdge[] = [];

export interface FoodImportAttempt {
  fromMarketId: number;
  toMarketId: number;
  outcome: "noRoute" | "noCrop" | "noCash" | "emptyCrop" | "belowQuantityPrecision" | "delivered";
  exportable: number;
  importNeed: number;
  travelDays?: number;
  goodId?: number;
  cash?: number;
  unitPrice?: number;
  affordableUnits?: number;
  availableCropUnits?: number | null;
  loaded?: number;
  delivered?: number;
}

// Latest pass only; diagnostics are never saved or used to choose supply or prices.
let lastFoodImportAttempts: FoodImportAttempt[] = [];

export function getFoodImportAttempts(): readonly FoodImportAttempt[] {
  return lastFoodImportAttempts;
}

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
  lastFoodImportAttempts = [];

  resetEffectiveCapacities(burgs);
  for (const market of markets) {
    if (!market.foodLedger) continue;
    market.foodLedger.satisfiedImport = 0;
    market.foodLedger.importCapacityBonus = 0;
  }

  if (!markets.length || !pack.routes?.length) {
    // Composes on top of the resetEffectiveCapacities() baseline above — see
    // applyHeatingCapacityBonus()'s own doc comment for why it must run after every reset/import
    // pass in this function, on both the early-return and full-run paths.
    applyHeatingCapacityBonus(burgs);
    lastFoodFlows = [];
    return lastFoodFlows;
  }

  const wheatGood = getGoods().find(good => good.name === "Wheat");
  const stapleFood = getGoods().find(good => good.tags.includes("stapleFood"));
  const landGraph = buildLandRouteGraph(pack, {
    month: worldContext.options.month ?? 1,
    mapCoordinates: worldContext.mapCoordinates,
    graphHeight: worldContext.graphHeight
  });
  const seaGraph = buildSeaRouteGraph(pack);
  const getFoodRoute = createFoodRouteResolver(worldContext, landGraph, seaGraph);
  const remainingExport = new Map<number, number>();
  for (const market of markets) {
    remainingExport.set(market.i, Math.max(0, market.foodLedger?.exportable ?? 0));
  }

  const importers = markets
    .filter(market => (market.foodLedger?.importNeed ?? 0) > 0)
    .sort((left, right) => getImportPriority(right, wheatGood?.i) - getImportPriority(left, wheatGood?.i));
  const flows: FoodFlowEdge[] = [];

  for (const importer of importers) {
    const ledger = importer.foodLedger;
    if (!ledger) continue;
    let remainingNeed = ledger.importNeed;
    const candidates = markets
      .filter(supplier => supplier.i !== importer.i && (remainingExport.get(supplier.i) ?? 0) > 0)
      .map(supplier => {
        const route = getFoodRoute(supplier, importer);
        if (!route)
          lastFoodImportAttempts.push({
            fromMarketId: supplier.i,
            toMarketId: importer.i,
            outcome: "noRoute",
            exportable: remainingExport.get(supplier.i) ?? 0,
            importNeed: remainingNeed
          });
        return { supplier, route };
      })
      .filter((candidate): candidate is { supplier: Market; route: FoodRoute } => candidate.route !== null)
      .sort((left, right) => left.route.travelDays - right.route.travelDays || left.supplier.i - right.supplier.i);

    for (const { supplier, route } of candidates) {
      if (remainingNeed <= 0) break;
      const available = remainingExport.get(supplier.i) ?? 0;
      if (available <= 0) continue;
      const exportedCrop = getExportCropGoodId(supplier);
      const attempt: FoodImportAttempt = {
        fromMarketId: supplier.i,
        toMarketId: importer.i,
        outcome: "noCrop",
        exportable: available,
        importNeed: remainingNeed,
        travelDays: route.travelDays
      };
      lastFoodImportAttempts.push(attempt);
      if (exportedCrop === null) continue;
      attempt.goodId = exportedCrop;

      const securityRisk = getSecurityRisk(importer, route.travelDays);
      const spoilageDecay = Math.exp(-route.travelDays / FOOD_SPOILAGE_HALF_LIFE_DAYS);
      const deliveredShare = spoilageDecay * (1 - securityRisk);
      if (deliveredShare <= 0) continue;

      // Load only what can reach the demand market usefully, subject to its finite surplus and to
      // what the importer can pay for at the supplier's cost (docs/plan/craft-wage-subsistence-scale.md
      // §11). The grain physically leaves the supplier's ledger and lands in the importer's: this
      // pass used to raise only the importer's carrying capacity, so towns grew on food that never came.
      const supplierLedger = supplier.foodLedger;
      if (!supplierLedger) continue;
      const wanted = Math.min(available, remainingNeed / deliveredShare);
      // The draw takes the crop's own aged lots, which can cost more than the ledger-wide average;
      // budget against the dearest lot so the payment never exceeds the importer's purse.
      const unitPrice = Math.max(0, getMaxDrawUnitCost(supplierLedger, exportedCrop));
      const purse = Math.max(0, importer.marketTreasury?.balance ?? 0);
      const affordable = unitPrice > 0 ? purse / unitPrice : wanted;
      attempt.cash = purse;
      attempt.unitPrice = unitPrice;
      attempt.affordableUnits = affordable;
      const availableCrop = getTransportableStapleCropUnits(supplierLedger, exportedCrop);
      attempt.availableCropUnits = availableCrop;
      const drawn = drawFoodForExport(supplierLedger, exportedCrop, Math.min(wanted, affordable));
      const volume = drawn.units;
      const delivered = Math.min(remainingNeed, volume * deliveredShare);
      attempt.loaded = volume;
      attempt.delivered = delivered;
      const loadLimit = Math.min(wanted, affordable, availableCrop ?? Infinity);
      attempt.outcome =
        affordable <= 0
          ? "noCash"
          : volume > 0
            ? "delivered"
            : loadLimit > 0 && loadLimit < 0.005
              ? "belowQuantityPrecision"
              : "emptyCrop";
      if (volume <= 0 || delivered <= 0) continue;

      const payment = Math.min(rn(volume * drawn.unitCost, 2), purse);
      if (payment > 0 && importer.marketTreasury && supplier.marketTreasury) {
        importer.marketTreasury.balance = rn(importer.marketTreasury.balance - payment, 2);
        supplier.marketTreasury.balance = rn(supplier.marketTreasury.balance + payment, 2);
      }
      receiveFoodImport(
        ledger,
        exportedCrop,
        delivered,
        deliveredShare > 0 ? rn(drawn.unitCost / deliveredShare, 2) : 0
      );

      remainingExport.set(supplier.i, available - volume);
      remainingNeed -= delivered;
      if (stapleFood) {
        syncStapleFoodMarketStock(supplier, stapleFood.i, stapleFood.value);
        syncStapleFoodMarketStock(importer, stapleFood.i, stapleFood.value);
      }
      flows.push({
        fromMarketId: supplier.i,
        toMarketId: importer.i,
        goodId: exportedCrop,
        volume: rn(volume, 2),
        travelDays: route.travelDays,
        spoilageDecay: rn(spoilageDecay, 4),
        securityRisk: rn(securityRisk, 4)
      });
    }

    ledger.satisfiedImport = rn(ledger.satisfiedImport, 2);
    applyImportCapacity(importer, ledger.satisfiedImport, worldContext);
  }

  // Runs last: composes an additive climate-tech top-up on top of every burg's now-final
  // (reset + import-bonus-adjusted) effectiveCapacity for this cycle — see its own doc comment.
  applyHeatingCapacityBonus(burgs);
  lastFoodFlows = flows;
  return lastFoodFlows;
}

/** Weighted farmgate cost of the supplier's stock, the price an importing market pays per unit. */
/** Dearest unit cost among the lots `drawFoodForExport` may take for this crop. */
function getMaxDrawUnitCost(ledger: FoodLedger, goodId: number): number {
  const crop = ledger.stapleCropInventories?.[goodId];
  const lots: [number, number][] = crop
    ? [
        [crop.age0, crop.age0UnitCost],
        [crop.age1, crop.age1UnitCost],
        [crop.age2, crop.age2UnitCost],
        [crop.age3 ?? 0, crop.age3UnitCost ?? 0]
      ]
    : [
        [ledger.foodStockAge0, ledger.foodStockAge0UnitCost],
        [ledger.foodStockAge1, ledger.foodStockAge1UnitCost],
        [ledger.foodStockAge2, ledger.foodStockAge2UnitCost],
        [ledger.foodStockAge3 ?? 0, ledger.foodStockAge3UnitCost ?? 0]
      ];
  return lots.reduce((max, [stock, cost]) => (stock > 0 && cost > max ? cost : max), 0);
}

/** Chooses the largest actual staple-crop lot available for export. */
function getExportCropGoodId(market: Market): number | null {
  const candidates = getGoods()
    .filter(good => good.tags.includes("stapleCrop"))
    .map(good => ({
      goodId: good.i,
      stock:
        (market.foodLedger ? getTransportableStapleCropUnits(market.foodLedger, good.i) : null) ??
        market.goods[good.i]?.stock ??
        0
    }))
    .filter(candidate => candidate.stock > 0)
    .sort((left, right) => right.stock - left.stock || left.goodId - right.goodId);
  return candidates[0]?.goodId ?? null;
}

/** Restores normal carrying capacity when the economy is disabled or has no viable routes. */
export function resetEffectiveCapacities(
  burgs: readonly {
    demographics?: { capacity: number; effectiveCapacity?: number };
  }[]
): void {
  for (const burg of burgs) {
    if (burg.demographics) burg.demographics.effectiveCapacity = burg.demographics.capacity;
  }
}

function getImportPriority(market: Market, foodGoodId: number | undefined): number {
  const price = foodGoodId === undefined ? 1 : (market.goods[foodGoodId]?.price ?? 1);
  return customerBuyPrice(price, market.centerBurgId, foodGoodId);
}

/** Reuses charted, seasonally open roads and sea lanes; never creates a cross-country leg. */
function createFoodRouteResolver(
  worldContext: Readonly<WorldContext>,
  landGraph: ReturnType<typeof buildLandRouteGraph>,
  seaGraph: ReturnType<typeof buildSeaRouteGraph>
): (supplier: Market, importer: Market) => FoodRoute | null {
  const portsByMarket = new Map<number, { cell: number; landDistance: number }[]>();
  const seaDistances = new Map<string, number | null>();
  const seaDistance = (from: number, to: number) => {
    const key = from < to ? `${from}:${to}` : `${to}:${from}`;
    if (!seaDistances.has(key)) seaDistances.set(key, findSeaRouteDistance(seaGraph, from, to));
    return seaDistances.get(key)!;
  };
  const portsFor = (market: Market) => {
    const existing = portsByMarket.get(market.i);
    if (existing) return existing;
    const center = worldContext.pack.burgs[market.centerBurgId];
    const ports = worldContext.pack.burgs.flatMap(burg => {
      if (!burg?.i || burg.removed || !burg.port || burg.market !== market.i || !center) return [];
      const distance = center.cell === burg.cell ? 0 : findLandRouteDistance(landGraph, center.cell, burg.cell);
      return distance === null ? [] : [{ cell: burg.cell, landDistance: distance }];
    });
    portsByMarket.set(market.i, ports);
    return ports;
  };

  return (supplier, importer) => {
    const source = worldContext.pack.burgs[supplier.centerBurgId];
    const target = worldContext.pack.burgs[importer.centerBurgId];
    if (!source || !target || source.removed || target.removed) return null;

    const landDistance = findLandRouteDistance(landGraph, source.cell, target.cell);
    const directSeaDistance = seaDistance(source.cell, target.cell);
    const scale = worldContext.distanceScale;
    const landDays = landDistance === null ? Infinity : calculateRouteDurationFromDistances(landDistance * scale, 0, 0);
    const seaDays =
      directSeaDistance === null ? Infinity : calculateRouteDurationFromDistances(0, directSeaDistance * scale, 0);
    let travelDays = Math.min(landDays, seaDays);
    // Keep established direct routes. The missing case is an inland hub on either shore.
    if (Number.isFinite(travelDays) && travelDays > 0) return { travelDays };
    for (const origin of portsFor(supplier)) {
      for (const destination of portsFor(importer)) {
        const sailed = seaDistance(origin.cell, destination.cell);
        if (!(sailed !== null && sailed > 0)) continue;
        const transfers = Number(origin.landDistance > 0) + Number(destination.landDistance > 0);
        const days = calculateRouteDurationFromDistances(
          (origin.landDistance + destination.landDistance) * scale,
          sailed * scale,
          transfers
        );
        if (days > 0 && days < travelDays) travelDays = days;
      }
    }
    return Number.isFinite(travelDays) && travelDays > 0 ? { travelDays } : null;
  };
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
