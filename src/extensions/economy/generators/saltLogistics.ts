import { rn } from "../../hostUtils";
import {
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getMineralDeposits,
  getOrCreateCumulativeMarketIntake,
  getOrCreateFaunaStockTable,
  getOrCreateMarketGoodProductionTotals,
  getSaltShipments,
  getSaltworks,
  getWorldContext,
  setSaltShipments,
  setSaltworks,
  setStateSaltLedgers
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { debitRuralHouseholdWealth, getRuralHouseholdWealth } from "./householdWealth";
import type { Market } from "./marketTypes";
import { getOpenAccountCommitments } from "./merchantTradeCapital";
import {
  buyHouseholdSalt,
  paySaltWholesale,
  priceSalt,
  saltFreightPerBag,
  saltInvoice,
  saltMarketCash
} from "./saltFinance";
import type { SaltShipment, Saltworks, StateSaltLedger } from "./saltLogisticsTypes";
import { getSaltworksOwner, migrateSaltworksOwnership } from "./saltOwnership";
import { createSaltProductionBudget } from "./saltProduction";

/** The normalized physical quantity represented by Salt's `bag` Good unit. */
export const SALT_KILOGRAMS_PER_BAG = 60;
/** Ordinary household cooking and dietary use: 3.6 kg/person/year (10 g/day planning baseline). */
export const SALT_HOUSEHOLD_KILOGRAMS_PER_PERSON_YEAR = 3.6;
/** Provisional model assumptions, not calibrated medieval purchase rates (Salt S0). */
export const SALT_LIVESTOCK_ANNUAL_KG: Readonly<Record<string, number>> = {
  Cattle: 20,
  Sheep: 1.4,
  Goats: 1.4,
  // Uncalibrated forage-intake scaling from the cattle assumption; fauna cohorts are real heads.
  Horses: (20 * 3500) / 3000,
  Camels: (20 * 6000) / 3000
};
/** No measured natural salt source exists yet; never fabricate a credit from forage mass alone. */
export const SALT_LIVESTOCK_NATURAL_SHARE = 0;

function livestockSalt(cellId: number): { total: number; natural: number; purchase: number } {
  const stocks = getOrCreateFaunaStockTable();
  let total = 0;
  for (const [name, annualKg] of Object.entries(SALT_LIVESTOCK_ANNUAL_KG)) {
    const herd = stocks?.[`${cellId}:${name}`];
    if (herd)
      total +=
        ((Math.max(0, herd.young) * 0.5 + Math.max(0, herd.breeding) + Math.max(0, herd.old)) * annualKg) /
        12 /
        SALT_KILOGRAMS_PER_BAG;
  }
  return { total, natural: total * SALT_LIVESTOCK_NATURAL_SHARE, purchase: total * (1 - SALT_LIVESTOCK_NATURAL_SHARE) };
}

function statePopulation(stateId: number): number {
  const world = getWorldContext();
  const rate = Math.max(1, world.populationRate ?? 1);
  return (
    Array.from(world.pack.cells.i).reduce(
      (sum, id) =>
        sum +
        (world.pack.cells.h[id] >= 20 && world.pack.cells.state[id] === stateId ? world.pack.cells.pop[id] * rate : 0),
      0
    ) +
    world.pack.burgs.reduce(
      (sum, burg) =>
        sum +
        (burg?.i && !burg.removed && (burg.state ?? 0) === stateId
          ? (burg.population ?? 0) * rate * Math.max(1, world.urbanization ?? 1)
          : 0),
      0
    )
  );
}

const SALTWORK_ANNUAL_CAPACITY_BAGS = 900;
const SALTWORK_OPERATING_RESERVE = 1.15;
/** City markets keep a small physical reserve without turning Salt into an infinite stockpile. */
const SALT_MARKET_RESERVE_MONTHS = 3;
const PRODUCTION_CYCLE_DAYS = 30;

type MarketDemand = {
  market: Market;
  population: number;
  provisionBags: number;
  householdBags: number;
  livestockBags: number;
  processingBags: number;
};

function getSaltGood() {
  return getGoods().find(good => good.name === "Salt" && isGoodEnabled(good));
}

/** Read-only demand boundary audit. Unserved residents are not silently assigned free state salt. */
export function auditSaltPopulationCoverage() {
  const world = getWorldContext();
  const markets = new Set(getMarkets().map(market => market.i));
  const states = new Set((world.pack.states ?? []).filter(state => state?.i && !state.removed).map(state => state.i));
  const column = getMarketCellColumn();
  const rate = Math.max(1, world.populationRate ?? 1);
  const urbanization = Math.max(1, world.urbanization ?? 1);
  const result = { coveredPeople: 0, neutralPeople: 0, inactiveStatePeople: 0, unmarketedPeople: 0 };
  const add = (people: number, state: number, market: number) => {
    if (!state) result.neutralPeople += people;
    else if (!states.has(state)) result.inactiveStatePeople += people;
    else if (!markets.has(market)) result.unmarketedPeople += people;
    else result.coveredPeople += people;
  };
  for (const id of world.pack.cells.i) {
    if (world.pack.cells.h[id] >= 20) add(world.pack.cells.pop[id] * rate, world.pack.cells.state[id], column[id]);
  }
  for (const burg of world.pack.burgs) {
    if (burg?.i && !burg.removed) add((burg.population ?? 0) * rate * urbanization, burg.state ?? 0, burg.market ?? 0);
  }
  return result;
}

function getMarketPopulation(marketId: number): number {
  const world = getWorldContext();
  const column = getMarketCellColumn();
  const rate = Math.max(1, world.populationRate ?? 1);
  return (
    Array.from(world.pack.cells.i).reduce(
      (sum, id) =>
        sum + (world.pack.cells.h[id] >= 20 && column[id] === marketId ? world.pack.cells.pop[id] * rate : 0),
      0
    ) +
    world.pack.burgs.reduce(
      (sum, burg) =>
        sum +
        (burg?.i && !burg.removed && burg.market === marketId
          ? (burg.population ?? 0) * rate * Math.max(1, world.urbanization ?? 1)
          : 0),
      0
    )
  );
}

function stateMarketDemands(stateId: number): MarketDemand[] {
  const world = getWorldContext();
  const markets = getMarkets();
  const byId = new Map(markets.map(market => [market.i, market]));
  const populationByMarket = new Map<number, number>();
  const marketColumn = getMarketCellColumn();
  const populationRate = Math.max(1, world.populationRate ?? 1);
  const urbanization = Math.max(1, world.urbanization ?? 1);

  for (const cellId of world.pack.cells.i) {
    if (world.pack.cells.h[cellId] < 20 || world.pack.cells.state[cellId] !== stateId) continue;
    const marketId = marketColumn[cellId];
    if (!byId.has(marketId)) continue;
    populationByMarket.set(
      marketId,
      (populationByMarket.get(marketId) ?? 0) + world.pack.cells.pop[cellId] * populationRate
    );
  }
  for (const burg of world.pack.burgs) {
    if (!burg.i || burg.removed || (burg.state ?? 0) !== stateId || !burg.market || !byId.has(burg.market)) continue;
    populationByMarket.set(
      burg.market,
      (populationByMarket.get(burg.market) ?? 0) + (burg.population ?? 0) * populationRate * urbanization
    );
  }

  return [...populationByMarket.entries()]
    .map(([marketId, population]) => {
      const market = byId.get(marketId);
      if (!market || population <= 0) return null;
      return {
        market,
        population,
        provisionBags: 0,
        livestockBags: Array.from(world.pack.cells.i).reduce(
          (sum, id) =>
            sum +
            (world.pack.cells.h[id] >= 20 && world.pack.cells.state[id] === stateId && marketColumn[id] === marketId
              ? livestockSalt(id).purchase
              : 0),
          0
        ),
        processingBags:
          ((market.saltProcessingForecastBags ?? 0) * population) / Math.max(1, getMarketPopulation(marketId)),
        householdBags: (population * SALT_HOUSEHOLD_KILOGRAMS_PER_PERSON_YEAR) / SALT_KILOGRAMS_PER_BAG / 12
      };
    })
    .filter((demand): demand is MarketDemand => demand !== null)
    .map(demand => ({ ...demand, provisionBags: demand.householdBags + demand.livestockBags + demand.processingBags }))
    .sort((a, b) => a.market.i - b.market.i);
}

function getSaltworkKind(cellId: number): Saltworks["kind"] {
  if (hasSaltSourceWaterAccess(cellId)) return "saltPan";
  // Evaporite is a geological candidate, not a conversion of saltpeter into edible Salt.
  const deposit = getMineralDeposits().find(d => d.cell === cellId && d.type === "evaporite");
  return deposit?.groundwaterPressure && deposit.groundwaterPressure >= 0.5 ? "brineWell" : "rockSaltMine";
}

/** True only for a sea shore or a shore of a feature classified by the host as a salt lake. */
function hasSaltSourceWaterAccess(cellId: number): boolean {
  const { pack } = getWorldContext();
  for (const neighbor of pack.cells.c[cellId] ?? []) {
    if (pack.cells.h[neighbor] >= 20) continue;
    const feature = pack.features?.[pack.cells.f?.[neighbor] ?? 0];
    // Older imported maps can lack feature metadata. Their only water body is treated as sea so
    // saved coastal states do not lose their established saltworks during migration.
    if (!feature) return true;
    if (feature.type === "ocean") return true;
    if (feature.type === "lake" && feature.group === "salt") return true;
  }
  return false;
}

function stateCandidateCells(stateId: number): number[] {
  const world = getWorldContext();
  const marketColumn = getMarketCellColumn();
  const marketIds = new Set(getMarkets().map(market => market.i));
  const candidates: { cellId: number; score: number }[] = [];
  const evaporites = new Set(
    getMineralDeposits()
      .filter(d => d.type === "evaporite")
      .map(d => d.cell)
  );
  for (const cellId of world.pack.cells.i) {
    if (world.pack.cells.h[cellId] < 20 || world.pack.cells.state[cellId] !== stateId) continue;
    if (!marketIds.has(marketColumn[cellId])) continue;
    if (!hasSaltSourceWaterAccess(cellId) && !evaporites.has(cellId)) continue;
    const kind = getSaltworkKind(cellId);
    const score = kind === "saltPan" ? 3 : kind === "rockSaltMine" ? 2 : 1;
    candidates.push({ cellId, score });
  }
  return candidates.sort((a, b) => b.score - a.score || a.cellId - b.cellId).map(candidate => candidate.cellId);
}

function getMarketGood(market: Market, goodId: number, defaultPrice: number): Market["goods"][number] {
  const existing = market.goods[goodId];
  if (existing) return existing;
  const created = { stock: 0, price: defaultPrice };
  market.goods[goodId] = created;
  return created;
}

function marketTravelDays(from: Market, to: Market): number {
  if (from.i === to.i) return 0;
  const burgs = getWorldContext().pack.burgs;
  const source = burgs[from.centerBurgId];
  const destination = burgs[to.centerBurgId];
  if (!source || !destination) return 0;
  const dx = Math.abs(source.x - destination.x);
  const dy = Math.abs(source.y - destination.y);
  const distance = dx > dy ? dx + 0.414 * dy : dy + 0.414 * dx;
  return Math.max(1, Math.round(distance / 20));
}

function addSaltMarketOutput(market: Market, saltGoodId: number, bags: number): void {
  if (bags <= 0) return;
  const cumulativeIntake = getOrCreateCumulativeMarketIntake();
  if (cumulativeIntake) cumulativeIntake[saltGoodId] = rn((cumulativeIntake[saltGoodId] ?? 0) + bags, 2);
  const marketProduction = getOrCreateMarketGoodProductionTotals();
  if (marketProduction) {
    const key = `${market.i}:${saltGoodId}`;
    marketProduction[key] = rn((marketProduction[key] ?? 0) + bags, 2);
  }
}

function getShipmentImporterStateId(shipment: SaltShipment): number {
  return shipment.importerStateId ?? shipment.stateId ?? 0;
}

function getShipmentExporterStateId(shipment: SaltShipment): number {
  return shipment.exporterStateId ?? shipment.stateId ?? 0;
}

function advanceShipments(
  shipments: readonly SaltShipment[],
  marketsById: ReadonlyMap<number, Market>,
  saltGoodId: number,
  defaultPrice: number
): { inTransit: SaltShipment[]; delivered: SaltShipment[] } {
  const inTransit: SaltShipment[] = [];
  const delivered: SaltShipment[] = [];
  for (const shipment of shipments) {
    if (shipment.status !== "inTransit") continue;
    const remainingDays = Math.max(0, shipment.remainingDays - PRODUCTION_CYCLE_DAYS);
    if (remainingDays > 0) {
      inTransit.push({ ...shipment, remainingDays });
      continue;
    }
    const destination = marketsById.get(shipment.toMarketId);
    if (!destination) continue;
    const destinationGood = getMarketGood(destination, saltGoodId, defaultPrice);
    destinationGood.stock = rn(destinationGood.stock + shipment.bags, 4);
    delivered.push({ ...shipment, remainingDays: 0, status: "delivered", unitPrice: destinationGood.price });
  }
  return { inTransit, delivered };
}

/** State-owned saltworks replace Salt's former biome-scatter production. */
export class SaltLogisticsModule {
  generate(): void {
    const operations: Saltworks[] = [];
    const states = getWorldContext().pack.states ?? [];
    const demandsByStateId = new Map<number, MarketDemand[]>();
    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const demands = stateMarketDemands(state.i);
      if (demands.length) demandsByStateId.set(state.i, demands);
    }
    const producerStateIds = [...demandsByStateId.keys()].filter(id => id > 0 && stateCandidateCells(id).length > 0);
    const annualCapacityNeedByProducerId = new Map<number, number>();
    for (const stateId of producerStateIds) {
      const annualNeed = (demandsByStateId.get(stateId) ?? []).reduce(
        (sum, demand) => sum + demand.provisionBags * 12,
        0
      );
      annualCapacityNeedByProducerId.set(stateId, annualNeed);
    }
    // A landlocked state's entire normal provision is contracted to the nearest salt-producing
    // country at generation time. The receiving state's works therefore have real export capacity,
    // rather than silently manufacturing only their own domestic ration.
    for (const [stateId, demands] of demandsByStateId) {
      if (producerStateIds.includes(stateId)) continue;
      const annualNeed = demands.reduce((sum, demand) => sum + demand.provisionBags * 12, 0);
      const destination = demands[0]?.market;
      if (!destination || annualNeed <= 0) continue;
      const supplierStateId = producerStateIds
        .map(candidateStateId => ({
          stateId: candidateStateId,
          market: demandsByStateId.get(candidateStateId)?.[0]?.market
        }))
        .filter((candidate): candidate is { stateId: number; market: Market } => candidate.market !== undefined)
        .toSorted(
          (left, right) =>
            marketTravelDays(left.market, destination) - marketTravelDays(right.market, destination) ||
            left.stateId - right.stateId
        )[0]?.stateId;
      if (supplierStateId === undefined) continue;
      annualCapacityNeedByProducerId.set(
        supplierStateId,
        (annualCapacityNeedByProducerId.get(supplierStateId) ?? 0) + annualNeed
      );
    }

    for (const stateId of producerStateIds) {
      const demands = demandsByStateId.get(stateId) ?? [];
      const annualNeed = annualCapacityNeedByProducerId.get(stateId) ?? 0;
      if (annualNeed <= 0) continue;

      const candidates = stateCandidateCells(stateId);
      const cells = candidates;
      const validCells = cells.filter((cellId): cellId is number => Number.isInteger(cellId));
      if (!validCells.length) continue;

      const siteCount = Math.min(validCells.length, Math.max(1, Math.ceil(annualNeed / SALTWORK_ANNUAL_CAPACITY_BAGS)));
      const annualCapacityBags = (annualNeed * SALTWORK_OPERATING_RESERVE) / siteCount;
      for (let index = 0; index < siteCount; index++) {
        const cellId = validCells[index];
        const marketId = getMarketCellColumn()[cellId] || demands[0].market.i;
        operations.push({
          i: operations.length + 1,
          stateId,
          owner: { kind: "state", id: stateId },
          marketId,
          cellId,
          kind: getSaltworkKind(cellId),
          annualCapacityBags: rn(annualCapacityBags, 2),
          monthlyOutputBags: 0,
          active: true
        });
      }
    }
    setSaltworks(operations);
    setSaltShipments([]);
    setStateSaltLedgers([]);
  }

  clear(): void {
    setSaltworks([]);
    setSaltShipments([]);
    setStateSaltLedgers([]);
  }

  /**
   * Advances merchant cargo, dispatches only the stock each market can absorb, and records household sales.
   * Processing forecasts follow actual prior recipe inputs; unused capacity never becomes
   * physical stock: the next batch is made only after household sales or recipe inputs create room for it.
   */
  settleMonth(): Map<number, number> {
    migrateSaltworksOwnership();
    const production = createSaltProductionBudget();
    const salt = getSaltGood();
    if (!salt) return production.charged;

    for (const market of getMarkets()) {
      market.saltProcessingForecastBags = Math.max(0, market.saltProcessingInputBags ?? 0);
      market.saltProcessingInputBags = 0;
    }
    const marketsById = new Map(getMarkets().map(market => [market.i, market]));
    const committedCash = getOpenAccountCommitments();
    const operations = getSaltworks();
    // Discover inland sources on legacy maps without resetting works, cargo, or installed capacity.
    for (const state of getWorldContext().pack.states ?? []) {
      if (!state?.i || state.removed || operations.some(o => o.stateId === state.i)) continue;
      const cellId = stateCandidateCells(state.i).find(cell => !hasSaltSourceWaterAccess(cell));
      if (cellId === undefined) continue;
      const annualNeed = stateMarketDemands(state.i).reduce((sum, d) => sum + d.provisionBags * 12, 0);
      if (!(annualNeed > 0)) continue;
      operations.push({
        i: Math.max(0, ...operations.map(o => o.i)) + 1,
        stateId: state.i,
        owner: { kind: "state", id: state.i },
        marketId: getMarketCellColumn()[cellId],
        cellId,
        kind: getSaltworkKind(cellId),
        annualCapacityBags: Math.min(SALTWORK_ANNUAL_CAPACITY_BAGS, annualNeed * SALTWORK_OPERATING_RESERVE),
        monthlyOutputBags: 0,
        active: true
      });
    }
    const advanced = advanceShipments(getSaltShipments(), marketsById, salt.i, salt.value);
    const shipments: SaltShipment[] = [...advanced.inTransit, ...advanced.delivered];
    let nextShipmentId = shipments.reduce((maximum, shipment) => Math.max(maximum, shipment.i), 0) + 1;
    const remainingCapacityBySaltworksId = new Map(
      operations.map(operation => [operation.i, production.capacity(operation)])
    );

    for (const operation of operations) {
      operation.monthlyOutputBags = 0;
    }

    const ledgers: StateSaltLedger[] = [];
    const demandsByStateId = new Map<number, MarketDemand[]>();
    const marketReserveBagsById = new Map<number, number>();
    const remainingHouseholdByMarket = new Map<number, number>();
    for (const state of [
      { i: 0, removed: false },
      ...(getWorldContext().pack.states ?? []).filter(state => state?.i)
    ]) {
      if (state.removed) continue;
      const demands = stateMarketDemands(state.i);
      if (!demands.length && statePopulation(state.i) <= 0) continue;
      demandsByStateId.set(state.i, demands);
      for (const demand of demands) {
        remainingHouseholdByMarket.set(
          demand.market.i,
          (remainingHouseholdByMarket.get(demand.market.i) ?? 0) + demand.householdBags
        );
        marketReserveBagsById.set(
          demand.market.i,
          (marketReserveBagsById.get(demand.market.i) ?? 0) + demand.provisionBags * SALT_MARKET_RESERVE_MONTHS
        );
      }
    }
    // Secure each salt-producing state's domestic reserve before landlocked buyers enter the same
    // merchant pool. This makes foreign Salt an actual surplus purchase rather than an implicit levy.
    const stateIds = [...demandsByStateId.keys()].sort((left, right) => {
      const leftProduces = operations.some(operation => operation.active && operation.stateId === left);
      const rightProduces = operations.some(operation => operation.active && operation.stateId === right);
      return Number(left === 0) - Number(right === 0) || Number(rightProduces) - Number(leftProduces) || left - right;
    });
    for (const market of getMarkets())
      priceSalt(market, salt, (marketReserveBagsById.get(market.i) ?? 0) / SALT_MARKET_RESERVE_MONTHS);
    const dispatchedShipmentIds = new Set<number>();
    for (const stateId of stateIds) {
      const stateOperations = operations.filter(operation => operation.active && operation.stateId === stateId);
      const demands = demandsByStateId.get(stateId) ?? [];
      const inboundBagsByMarketId = new Map<number, number>();
      for (const shipment of shipments) {
        if (shipment.status !== "inTransit" || getShipmentImporterStateId(shipment) !== stateId) continue;
        inboundBagsByMarketId.set(
          shipment.toMarketId,
          (inboundBagsByMarketId.get(shipment.toMarketId) ?? 0) + shipment.bags
        );
      }

      let dispatched = 0;
      let householdSales = 0;
      let householdPaid = 0;
      let livestockPaid = 0;
      const unmarketedPeople = Math.max(
        0,
        statePopulation(stateId) - demands.reduce((sum, demand) => sum + demand.population, 0)
      );
      const unmarketedHouseholdBags =
        (unmarketedPeople * SALT_HOUSEHOLD_KILOGRAMS_PER_PERSON_YEAR) / SALT_KILOGRAMS_PER_BAG / 12;
      let unmetHousehold = unmarketedHouseholdBags;
      let livestockSupplied = 0;
      const livestockTotals = Array.from(getWorldContext().pack.cells.i).reduce(
        (sum, id) => {
          if (getWorldContext().pack.cells.h[id] >= 20 && getWorldContext().pack.cells.state[id] === stateId) {
            const need = livestockSalt(id);
            sum.total += need.total;
            sum.natural += need.natural;
            sum.purchase += need.purchase;
          }
          return sum;
        },
        { total: 0, natural: 0, purchase: 0 }
      );
      let livestockUnmet = Math.max(
        0,
        livestockTotals.purchase - demands.reduce((sum, demand) => sum + demand.livestockBags, 0)
      );

      for (const demand of demands) {
        const destinationGood = getMarketGood(demand.market, salt.i, salt.value);
        const reserveBags = demand.provisionBags * SALT_MARKET_RESERVE_MONTHS;
        const inboundBags = inboundBagsByMarketId.get(demand.market.i) ?? 0;
        let remaining = Math.max(
          0,
          demand.householdBags + demand.livestockBags + reserveBags - destinationGood.stock - inboundBags
        );
        // Neutral households can use existing local retail stock, but do not order state-funded cargo.
        const supplierOperations = (
          stateId === 0
            ? []
            : stateOperations.length
              ? stateOperations
              : operations.filter(
                  operation =>
                    operation.active &&
                    operation.stateId !== stateId &&
                    getWorldContext().pack.states[operation.stateId]?.i &&
                    !getWorldContext().pack.states[operation.stateId].removed
                )
        ).toSorted((left, right) => {
          const leftMarket = marketsById.get(left.marketId);
          const rightMarket = marketsById.get(right.marketId);
          return (
            marketTravelDays(leftMarket ?? demand.market, demand.market) -
              marketTravelDays(rightMarket ?? demand.market, demand.market) || left.i - right.i
          );
        });

        // First release historical surplus. A source market retains its own reserve, so rebalancing old
        // stock cannot starve the city that hosts a saltworks or export a producer state's ration.
        for (const operation of supplierOperations) {
          if (remaining <= 0) break;
          const source = marketsById.get(operation.marketId);
          if (!source) continue;
          const sourceGood = getMarketGood(source, salt.i, salt.value);
          const sourceReserve = marketReserveBagsById.get(source.i) ?? 0;
          const travelDays = marketTravelDays(source, demand.market);
          const freight = saltFreightPerBag(source, demand.market, salt);
          const quote = Math.max(0.0001, sourceGood.price);
          const cashLimit =
            source.i === demand.market.i
              ? Infinity
              : Math.max(0, saltMarketCash(demand.market, committedCash) - 0.02) / (quote + freight);
          const bags = Math.min(remaining, Math.max(0, sourceGood.stock - sourceReserve), cashLimit);
          if (bags <= 0) continue;
          sourceGood.stock = rn(sourceGood.stock - bags, 4);
          remaining -= bags;
          dispatched += bags;
          const payment = paySaltWholesale(operation, source, demand.market, stateId, bags, quote, freight, false);
          if (source.i !== demand.market.i) demand.market.saltLandedUnitCost = quote + freight;
          const shipment: SaltShipment = {
            i: nextShipmentId++,
            exporterStateId: operation.stateId,
            importerStateId: stateId,
            saltworksId: operation.i,
            fromMarketId: source.i,
            toMarketId: demand.market.i,
            bags: rn(bags, 4),
            wholesalePaid: payment.goods,
            freightPaid: payment.freight,
            travelDays,
            remainingDays: travelDays,
            status: travelDays === 0 ? "delivered" : "inTransit",
            unitPrice: destinationGood.price
          };
          if (shipment.status === "delivered") destinationGood.stock = rn(destinationGood.stock + bags, 4);
          else {
            inboundBagsByMarketId.set(demand.market.i, (inboundBagsByMarketId.get(demand.market.i) ?? 0) + bags);
          }
          shipments.push(shipment);
          dispatchedShipmentIds.add(shipment.i);
        }

        // Make only the shortfall that existing domestic stock could not cover, limited by each
        // saltwork's sustainable monthly capacity. This is what prevents unused preservation capacity
        // from accumulating indefinitely at the origin market.
        for (const operation of supplierOperations) {
          if (remaining <= 0) break;
          const source = marketsById.get(operation.marketId);
          if (!source) continue;
          const remainingCapacity = remainingCapacityBySaltworksId.get(operation.i) ?? 0;
          const freight = saltFreightPerBag(source, demand.market, salt);
          // Inelastic provision is fulfilled when funded; a low retail quote does not erase need.
          // Require cost recovery for new wholesale batches, not a speculative profit maximizer.
          const quote = Math.max(
            salt.value * 0.5,
            (source.goods[salt.i]?.price ?? salt.value) * 0.8,
            production.unitCost(operation) * 1.05
          );
          const cashLimit = Math.max(0, saltMarketCash(demand.market, committedCash) - 0.02) / (quote + freight);
          const output = production.produce(operation, Math.min(remaining, remainingCapacity, cashLimit));
          if (output <= 0) continue;
          const payment = paySaltWholesale(operation, source, demand.market, stateId, output, quote, freight, true);
          demand.market.saltLandedUnitCost = production.unitCost(operation) * 1.05 + freight;
          const sourceGood = getMarketGood(source, salt.i, salt.value);
          sourceGood.stock = rn(sourceGood.stock + output, 4);
          operation.monthlyOutputBags = rn(operation.monthlyOutputBags + output, 4);
          addSaltMarketOutput(source, salt.i, output);
          recordGoodFlow({
            direction: "source",
            category: "mineSupply",
            goodId: salt.i,
            units: output,
            marketId: source.i
          });

          sourceGood.stock = rn(sourceGood.stock - output, 4);
          remainingCapacityBySaltworksId.set(operation.i, Math.max(0, remainingCapacity - output));
          remaining -= output;
          dispatched += output;
          const travelDays = marketTravelDays(source, demand.market);
          const shipment: SaltShipment = {
            i: nextShipmentId++,
            exporterStateId: operation.stateId,
            importerStateId: stateId,
            saltworksId: operation.i,
            fromMarketId: source.i,
            toMarketId: demand.market.i,
            bags: rn(output, 4),
            sellerOwner: { ...getSaltworksOwner(operation) },
            wholesalePaid: payment.goods,
            freightPaid: payment.freight,
            travelDays,
            remainingDays: travelDays,
            status: travelDays === 0 ? "delivered" : "inTransit",
            unitPrice: destinationGood.price
          };
          if (shipment.status === "delivered") destinationGood.stock = rn(destinationGood.stock + output, 4);
          else inboundBagsByMarketId.set(demand.market.i, (inboundBagsByMarketId.get(demand.market.i) ?? 0) + output);
          shipments.push(shipment);
          dispatchedShipmentIds.add(shipment.i);
        }

        const purchase = buyHouseholdSalt(
          demand.market,
          stateId,
          demand.householdBags,
          destinationGood.stock,
          destinationGood.price
        );
        const sold = purchase.bags;
        householdPaid += purchase.paid;
        destinationGood.stock = rn(destinationGood.stock - sold, 4);
        householdSales += sold;
        unmetHousehold += Math.max(0, demand.householdBags - sold);
        if (sold > 0) {
          recordGoodFlow({
            direction: "sink",
            category: "householdFood",
            goodId: salt.i,
            units: sold,
            marketId: demand.market.i
          });
        }
        const pendingHouseholds = Math.max(
          0,
          (remainingHouseholdByMarket.get(demand.market.i) ?? 0) - demand.householdBags
        );
        remainingHouseholdByMarket.set(demand.market.i, pendingHouseholds);
        const livestockLimit = Math.min(
          demand.livestockBags,
          Math.max(0, destinationGood.stock - pendingHouseholds),
          getRuralHouseholdWealth(demand.market) / Math.max(0.0001, destinationGood.price)
        );
        const livestockBill = saltInvoice(livestockLimit * destinationGood.price);
        const paid = debitRuralHouseholdWealth(demand.market, livestockBill);
        const livestock = livestockBill > 0 ? (livestockLimit * paid) / livestockBill : 0;
        livestockPaid += paid;
        demand.market.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
        demand.market.marketTreasury.balance += paid;
        destinationGood.stock = rn(destinationGood.stock - livestock, 4);
        livestockSupplied += livestock;
        livestockUnmet += demand.livestockBags - livestock;
        if (livestock > 0)
          recordGoodFlow({
            direction: "sink",
            category: "livestockFeed",
            goodId: salt.i,
            units: livestock,
            marketId: demand.market.i
          });
      }

      const population = statePopulation(stateId);
      const delivered = shipments
        .filter(shipment => shipment.status === "delivered" && getShipmentImporterStateId(shipment) === stateId)
        .reduce((sum, shipment) => sum + shipment.bags, 0);
      const inTransit = shipments
        .filter(shipment => shipment.status === "inTransit" && getShipmentImporterStateId(shipment) === stateId)
        .reduce((sum, shipment) => sum + shipment.bags, 0);
      ledgers.push({
        stateId,
        population: rn(population, 0),
        monthlyHouseholdPaid: rn(householdPaid, 2),
        monthlyLivestockPaid: rn(livestockPaid, 2),
        unmarketedPeople: rn(unmarketedPeople, 0),
        monthlyProcessingForecastBags: rn(
          demands.reduce((sum, demand) => sum + demand.processingBags, 0),
          4
        ),
        monthlyLivestockTotalRequirementBags: rn(livestockTotals.total, 4),
        monthlyLivestockNaturalBags: rn(livestockTotals.natural, 4),
        monthlyLivestockDemandBags: rn(livestockSupplied + livestockUnmet, 4),
        monthlyLivestockSuppliedBags: rn(livestockSupplied, 4),
        monthlyUnmetLivestockBags: rn(livestockUnmet, 4),
        monthlyProvisionBags: rn(
          demands.reduce((sum, demand) => sum + demand.provisionBags, 0) +
            unmarketedHouseholdBags +
            Math.max(0, livestockTotals.purchase - demands.reduce((sum, demand) => sum + demand.livestockBags, 0)),
          4
        ),
        monthlyHouseholdDemandBags: rn(
          demands.reduce((sum, demand) => sum + demand.householdBags, 0) + unmarketedHouseholdBags,
          4
        ),
        monthlyOutputBags: rn(
          stateOperations.reduce((sum, operation) => sum + operation.monthlyOutputBags, 0),
          4
        ),
        monthlyDispatchedBags: rn(dispatched, 4),
        monthlyDeliveredBags: rn(delivered, 4),
        monthlyImportedBags: rn(
          shipments
            .filter(
              shipment =>
                dispatchedShipmentIds.has(shipment.i) &&
                getShipmentImporterStateId(shipment) === stateId &&
                getShipmentExporterStateId(shipment) !== stateId
            )
            .reduce((sum, shipment) => sum + shipment.bags, 0),
          4
        ),
        monthlyExportedBags: rn(
          shipments
            .filter(
              shipment =>
                dispatchedShipmentIds.has(shipment.i) &&
                getShipmentExporterStateId(shipment) === stateId &&
                getShipmentImporterStateId(shipment) !== stateId
            )
            .reduce((sum, shipment) => sum + shipment.bags, 0),
          4
        ),
        monthlyHouseholdSalesBags: rn(householdSales, 4),
        monthlyUnmetHouseholdBags: rn(unmetHousehold, 4),
        inTransitBags: rn(inTransit, 4),
        saltworksIds: stateOperations.map(operation => operation.i)
      });
    }
    for (const ledger of ledgers) {
      ledger.monthlyImportsPaid = rn(
        shipments
          .filter(
            sh =>
              dispatchedShipmentIds.has(sh.i) &&
              getShipmentImporterStateId(sh) === ledger.stateId &&
              getShipmentExporterStateId(sh) !== ledger.stateId
          )
          .reduce((sum, sh) => sum + (sh.wholesalePaid ?? 0), 0),
        2
      );
      ledger.monthlyExportsReceived = rn(
        shipments
          .filter(
            sh =>
              dispatchedShipmentIds.has(sh.i) &&
              getShipmentExporterStateId(sh) === ledger.stateId &&
              getShipmentImporterStateId(sh) !== ledger.stateId
          )
          .reduce((sum, sh) => sum + (sh.wholesalePaid ?? 0), 0),
        2
      );
      ledger.monthlyOutputBags = rn(
        operations
          .filter(operation => operation.active && operation.stateId === ledger.stateId)
          .reduce((sum, operation) => sum + operation.monthlyOutputBags, 0),
        4
      );
      ledger.monthlyDispatchedBags = rn(
        shipments
          .filter(
            shipment => dispatchedShipmentIds.has(shipment.i) && getShipmentExporterStateId(shipment) === ledger.stateId
          )
          .reduce((sum, shipment) => sum + shipment.bags, 0),
        4
      );
      ledger.monthlyImportedBags = rn(
        shipments
          .filter(
            shipment =>
              dispatchedShipmentIds.has(shipment.i) &&
              getShipmentImporterStateId(shipment) === ledger.stateId &&
              getShipmentExporterStateId(shipment) !== ledger.stateId
          )
          .reduce((sum, shipment) => sum + shipment.bags, 0),
        4
      );
      ledger.monthlyExportedBags = rn(
        shipments
          .filter(
            shipment =>
              dispatchedShipmentIds.has(shipment.i) &&
              getShipmentExporterStateId(shipment) === ledger.stateId &&
              getShipmentImporterStateId(shipment) !== ledger.stateId
          )
          .reduce((sum, shipment) => sum + shipment.bags, 0),
        4
      );
    }
    setSaltShipments(shipments);
    setStateSaltLedgers(ledgers.toSorted((left, right) => left.stateId - right.stateId));
    return production.charged;
  }
}

export const SaltLogistics = new SaltLogisticsModule();
