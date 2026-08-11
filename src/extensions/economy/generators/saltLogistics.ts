import { rn } from "../../hostUtils";
import {
  getGoods,
  getMarketCellColumn,
  getMarkets,
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

type MarketDemand = {
  market: Market;
  population: number;
  provisionBags: number;
  householdBags: number;
};

function getSaltGood() {
  return getGoods().find(good => good.name === "Salt" && isGoodEnabled(good));
}

function getMarketStateId(market: Market): number {
  const burg = getWorldContext().pack.burgs[market.centerBurgId];
  return burg?.removed ? 0 : (burg?.state ?? 0);
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
  const coastal = (cells.c[cellId] ?? []).some(neighbor => cells.h[neighbor] < 20);
  if (coastal) return "saltPan";
  if ((cells.h[cellId] ?? 0) >= 50) return "rockSaltMine";
  return "brineWell";
}

function stateCandidateCells(stateId: number): number[] {
  const world = getWorldContext();
  const marketColumn = getMarketCellColumn();
  const marketIds = new Set(getMarkets().map(market => market.i));
  const candidates: { cellId: number; score: number }[] = [];
  for (const cellId of world.pack.cells.i) {
    if (world.pack.cells.h[cellId] < 20 || world.pack.cells.state[cellId] !== stateId) continue;
    if (!marketIds.has(marketColumn[cellId])) continue;
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

/** State-owned saltworks replace Salt's former biome-scatter production. */
export class SaltLogisticsModule {
  generate(): void {
    const operations: Saltworks[] = [];
    const states = getWorldContext().pack.states ?? [];
    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const demands = stateMarketDemands(state.i);
      const annualNeed = demands.reduce((sum, demand) => sum + demand.provisionBags * 12, 0);
      if (annualNeed <= 0) continue;

      const candidates = stateCandidateCells(state.i);
      const fallbackCell = getMarkets().find(market => getMarketStateId(market) === state.i)?.centerBurgId;
      const cells = candidates.length
        ? candidates
        : fallbackCell === undefined
          ? []
          : [getWorldContext().pack.burgs[fallbackCell]?.cell];
      const validCells = cells.filter((cellId): cellId is number => Number.isInteger(cellId));
      if (!validCells.length) continue;

      const siteCount = Math.min(validCells.length, Math.max(1, Math.ceil(annualNeed / SALTWORK_ANNUAL_CAPACITY_BAGS)));
      const annualCapacityBags = (annualNeed * SALTWORK_OPERATING_RESERVE) / siteCount;
      for (let index = 0; index < siteCount; index++) {
        const cellId = validCells[index];
        const marketId = getMarketCellColumn()[cellId] || demands[0].market.i;
        operations.push({
          i: operations.length + 1,
          stateId: state.i,
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

  /** Produces domestic Salt, dispatches it to state markets, then records household retail sales. */
  settleMonth(): void {
    const salt = getSaltGood();
    if (!salt) return;

    const marketsById = new Map(getMarkets().map(market => [market.i, market]));
    const operations = getSaltworks();
    for (const operation of operations) {
      operation.monthlyOutputBags = 0;
      if (!operation.active) continue;
      const market = marketsById.get(operation.marketId);
      if (!market) continue;
      const output = Math.max(0, operation.annualCapacityBags / 12);
      const marketGood = getMarketGood(market, salt.i, salt.value);
      marketGood.stock = rn(marketGood.stock + output, 4);
      operation.monthlyOutputBags = rn(output, 4);
      recordGoodFlow({
        direction: "source",
        category: "mineSupply",
        goodId: salt.i,
        units: output,
        marketId: market.i
      });
    }

    const shipments: SaltShipment[] = [];
    const ledgers: StateSaltLedger[] = [];
    const stateIds = [...new Set(operations.map(operation => operation.stateId))].sort((a, b) => a - b);
    for (const stateId of stateIds) {
      const stateOperations = operations.filter(operation => operation.active && operation.stateId === stateId);
      const demands = stateMarketDemands(stateId);
      let delivered = 0;
      let householdSales = 0;
      let unmetHousehold = 0;

      for (const demand of demands) {
        let remaining = demand.provisionBags;
        for (const operation of stateOperations) {
          if (remaining <= 0) break;
          const source = marketsById.get(operation.marketId);
          if (!source) continue;
          const sourceGood = getMarketGood(source, salt.i, salt.value);
          const bags = Math.min(remaining, Math.max(0, sourceGood.stock));
          if (bags <= 0) continue;
          sourceGood.stock = rn(sourceGood.stock - bags, 4);
          const destinationGood = getMarketGood(demand.market, salt.i, salt.value);
          destinationGood.stock = rn(destinationGood.stock + bags, 4);
          remaining -= bags;
          delivered += bags;
          shipments.push({
            stateId,
            saltworksId: operation.i,
            fromMarketId: source.i,
            toMarketId: demand.market.i,
            bags: rn(bags, 4),
            travelDays: marketTravelDays(source, demand.market),
            unitPrice: destinationGood.price
          });
        }

        const destinationGood = getMarketGood(demand.market, salt.i, salt.value);
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
        monthlyDeliveredBags: rn(delivered, 4),
        monthlyHouseholdSalesBags: rn(householdSales, 4),
        monthlyUnmetHouseholdBags: rn(unmetHousehold, 4),
        saltworksIds: stateOperations.map(operation => operation.i)
      });
    }
    setSaltShipments(shipments);
    setStateSaltLedgers(ledgers);
  }
}

export const SaltLogistics = new SaltLogisticsModule();
