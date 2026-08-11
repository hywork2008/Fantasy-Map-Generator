import { rn } from "../../hostUtils";
import {
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getOrCreateCumulativeMarketIntake,
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
import type { Market } from "./marketTypes";
import type { SaltShipment, Saltworks, StateSaltLedger } from "./saltLogisticsTypes";

/** The normalized physical quantity represented by Salt's `bag` Good unit. */
export const SALT_KILOGRAMS_PER_BAG = 60;
/** Ordinary household cooking and dietary use: 3.6 kg/person/year (10 g/day planning baseline). */
export const SALT_HOUSEHOLD_KILOGRAMS_PER_PERSON_YEAR = 3.6;
/** Additional market allocation retained for curing, dairying, and other food processing. */
export const SALT_PROCESSING_KILOGRAMS_PER_PERSON_YEAR = 2.4;
/** Total national provision target: 6 kg/person/year, or one tenth of a bag. */
export const SALT_PROVISION_KILOGRAMS_PER_PERSON_YEAR =
  SALT_HOUSEHOLD_KILOGRAMS_PER_PERSON_YEAR + SALT_PROCESSING_KILOGRAMS_PER_PERSON_YEAR;

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
};

function getSaltGood() {
  return getGoods().find(good => good.name === "Salt" && isGoodEnabled(good));
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
    if (!burg.i || burg.removed || burg.state !== stateId || !burg.market || !byId.has(burg.market)) continue;
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
        provisionBags: (population * SALT_PROVISION_KILOGRAMS_PER_PERSON_YEAR) / SALT_KILOGRAMS_PER_BAG / 12,
        householdBags: (population * SALT_HOUSEHOLD_KILOGRAMS_PER_PERSON_YEAR) / SALT_KILOGRAMS_PER_BAG / 12
      };
    })
    .filter((demand): demand is MarketDemand => demand !== null)
    .sort((a, b) => a.market.i - b.market.i);
}

function getSaltworkKind(cellId: number): Saltworks["kind"] {
  const cells = getWorldContext().pack.cells;
  if (hasSaltSourceWaterAccess(cellId)) return "saltPan";
  if ((cells.h[cellId] ?? 0) >= 50) return "rockSaltMine";
  return "brineWell";
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

function stateHasSaltSourceWaterAccess(stateId: number): boolean {
  const { cells } = getWorldContext().pack;
  return cells.i.some(
    cellId => cells.state[cellId] === stateId && cells.h[cellId] >= 20 && hasSaltSourceWaterAccess(cellId)
  );
}

function stateCandidateCells(stateId: number): number[] {
  const world = getWorldContext();
  const marketColumn = getMarketCellColumn();
  const marketIds = new Set(getMarkets().map(market => market.i));
  const candidates: { cellId: number; score: number }[] = [];
  for (const cellId of world.pack.cells.i) {
    if (world.pack.cells.h[cellId] < 20 || world.pack.cells.state[cellId] !== stateId) continue;
    if (!marketIds.has(marketColumn[cellId])) continue;
    if (!hasSaltSourceWaterAccess(cellId)) continue;
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
    const producerStateIds = [...demandsByStateId.keys()].filter(stateHasSaltSourceWaterAccess);
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
   * Saltworks keep enough capacity for preservation demand, but do not turn unused theoretical capacity into
   * physical stock: the next batch is made only after household sales or recipe inputs create room for it.
   */
  settleMonth(): void {
    const salt = getSaltGood();
    if (!salt) return;

    const marketsById = new Map(getMarkets().map(market => [market.i, market]));
    const operations = getSaltworks();
    const advanced = advanceShipments(getSaltShipments(), marketsById, salt.i, salt.value);
    const shipments: SaltShipment[] = [...advanced.inTransit, ...advanced.delivered];
    let nextShipmentId = shipments.reduce((maximum, shipment) => Math.max(maximum, shipment.i), 0) + 1;
    const remainingCapacityBySaltworksId = new Map(
      operations.map(operation => [operation.i, Math.max(0, operation.annualCapacityBags / 12)])
    );

    for (const operation of operations) {
      operation.monthlyOutputBags = 0;
    }

    const ledgers: StateSaltLedger[] = [];
    const demandsByStateId = new Map<number, MarketDemand[]>();
    const marketReserveBagsById = new Map<number, number>();
    for (const state of getWorldContext().pack.states ?? []) {
      if (!state?.i || state.removed) continue;
      const demands = stateMarketDemands(state.i);
      if (!demands.length) continue;
      demandsByStateId.set(state.i, demands);
      for (const demand of demands) {
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
      return Number(rightProduces) - Number(leftProduces) || left - right;
    });
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
      let unmetHousehold = 0;

      for (const demand of demands) {
        const destinationGood = getMarketGood(demand.market, salt.i, salt.value);
        const reserveBags = demand.provisionBags * SALT_MARKET_RESERVE_MONTHS;
        const inboundBags = inboundBagsByMarketId.get(demand.market.i) ?? 0;
        let remaining = Math.max(0, demand.householdBags + reserveBags - destinationGood.stock - inboundBags);
        const supplierOperations = (
          stateOperations.length
            ? stateOperations
            : operations.filter(operation => operation.active && operation.stateId !== stateId)
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
          const bags = Math.min(remaining, Math.max(0, sourceGood.stock - sourceReserve));
          if (bags <= 0) continue;
          sourceGood.stock = rn(sourceGood.stock - bags, 4);
          remaining -= bags;
          dispatched += bags;
          const travelDays = marketTravelDays(source, demand.market);
          const shipment: SaltShipment = {
            i: nextShipmentId++,
            exporterStateId: operation.stateId,
            importerStateId: stateId,
            saltworksId: operation.i,
            fromMarketId: source.i,
            toMarketId: demand.market.i,
            bags: rn(bags, 4),
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
          const output = Math.min(remaining, remainingCapacity);
          if (output <= 0) continue;
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

        const sold = Math.min(demand.householdBags, Math.max(0, destinationGood.stock));
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
      }

      const population = demands.reduce((sum, demand) => sum + demand.population, 0);
      const delivered = shipments
        .filter(shipment => shipment.status === "delivered" && getShipmentImporterStateId(shipment) === stateId)
        .reduce((sum, shipment) => sum + shipment.bags, 0);
      const inTransit = shipments
        .filter(shipment => shipment.status === "inTransit" && getShipmentImporterStateId(shipment) === stateId)
        .reduce((sum, shipment) => sum + shipment.bags, 0);
      ledgers.push({
        stateId,
        population: rn(population, 0),
        monthlyProvisionBags: rn(
          demands.reduce((sum, demand) => sum + demand.provisionBags, 0),
          4
        ),
        monthlyHouseholdDemandBags: rn(
          demands.reduce((sum, demand) => sum + demand.householdBags, 0),
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
  }
}

export const SaltLogistics = new SaltLogisticsModule();
