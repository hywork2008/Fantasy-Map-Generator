import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getOrCreateCumulativeMarketIntake,
  getSaltShipments,
  getSaltworks,
  getStateSaltLedgers,
  initEconomyContext,
  setGoods,
  setMarketCellColumn,
  setMarkets,
  setSaltShipments
} from "../economyContext";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { SALT_HOUSEHOLD_KILOGRAMS_PER_PERSON_YEAR, SALT_KILOGRAMS_PER_BAG, SaltLogistics } from "./saltLogistics";

function setUpWorld(): void {
  worldContext.pack = {
    burgs: [
      { i: 0, removed: true },
      { i: 1, cell: 0, x: 0, y: 0, market: 1, state: 1, population: 10 },
      { i: 2, cell: 1, x: 80, y: 0, market: 2, state: 2, population: 20 }
    ],
    states: [
      { i: 0, name: "Neutral", removed: true },
      { i: 1, name: "North", capital: 1 },
      { i: 2, name: "South", capital: 2 }
    ],
    cells: {
      i: [0, 1],
      p: [
        [0, 0],
        [80, 0]
      ],
      h: Uint8Array.from([35, 55]),
      c: [[1], [0]],
      r: Uint16Array.from([0, 0]),
      state: Uint16Array.from([1, 2]),
      pop: Uint16Array.from([10, 20]),
      routes: {}
    }
  } as unknown as PackedGraph;
  worldContext.populationRate = 1000;
  worldContext.urbanization = 1;
  setGoods([
    { i: 1, name: "Salt", tags: ["preservative", "mineral"], value: 3, unit: "bag", icon: "salt", color: "#fff" }
  ]);
  setMarkets([
    { i: 1, centerBurgId: 1, color: "#111", goods: {} },
    { i: 2, centerBurgId: 2, color: "#222", goods: {} }
  ]);
  setMarketCellColumn(Uint16Array.from([1, 2]));
  Goods.sync();
  Markets.sync();
}

describe("SaltLogisticsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext, simulationContext: { extensions: {} } } as unknown as ExtensionAPI);
    setUpWorld();
  });
  afterEach(() => clearEconomyContext());

  it("creates at least one population-scaled saltworks for every populated state", () => {
    SaltLogistics.generate();

    const works = getSaltworks();
    expect(works.map(operation => operation.stateId).sort()).toEqual([1, 2]);
    expect(works.every(operation => operation.annualCapacityBags > 0)).toBe(true);
  });

  it("wholesales domestic Salt to each city market and sells the household share", () => {
    SaltLogistics.generate();
    SaltLogistics.settleMonth();

    const ledgers = getStateSaltLedgers();
    expect(ledgers).toHaveLength(2);
    expect(ledgers.every(ledger => ledger.monthlyDeliveredBags > 0)).toBe(true);
    expect(ledgers.every(ledger => ledger.monthlyHouseholdSalesBags > 0)).toBe(true);
    expect(ledgers.every(ledger => ledger.monthlyUnmetHouseholdBags === 0)).toBe(true);
    expect(getMarkets().every(market => (market.goods[1]?.stock ?? 0) > 0)).toBe(true);
    expect(getSaltShipments()).toHaveLength(2);
    expect(getOrCreateCumulativeMarketIntake()?.[1] ?? 0).toBeGreaterThan(0);
  });

  it("does not make one state pay another state's household requirement", () => {
    SaltLogistics.generate();
    SaltLogistics.settleMonth();

    const stateByMarket = new Map(
      getMarkets().map(market => [market.i, worldContext.pack.burgs[market.centerBurgId].state])
    );
    for (const shipment of getSaltShipments()) {
      expect(stateByMarket.get(shipment.fromMarketId)).toBe(shipment.stateId);
      expect(stateByMarket.get(shipment.toMarketId)).toBe(shipment.stateId);
    }
    const expectedHouseholdBags =
      ((10_000 + 10_000) * SALT_HOUSEHOLD_KILOGRAMS_PER_PERSON_YEAR) / SALT_KILOGRAMS_PER_BAG / 12;
    expect(getStateSaltLedgers()[0].monthlyHouseholdSalesBags).toBeCloseTo(expectedHouseholdBags, 3);
  });

  it("keeps cargo in transit until its travel time elapses", () => {
    SaltLogistics.generate();
    setSaltShipments([
      {
        i: 99,
        stateId: 1,
        saltworksId: 1,
        fromMarketId: 1,
        toMarketId: 1,
        bags: 2,
        travelDays: 35,
        remainingDays: 35,
        status: "inTransit",
        unitPrice: 3
      }
    ]);

    SaltLogistics.settleMonth();
    expect(getSaltShipments().find(shipment => shipment.i === 99)).toMatchObject({
      status: "inTransit",
      remainingDays: 5
    });

    SaltLogistics.settleMonth();
    expect(getSaltShipments().find(shipment => shipment.i === 99)).toMatchObject({
      status: "delivered",
      remainingDays: 0
    });
  });

  it("caps stock at the market reserve while output continues to replace household sales", () => {
    SaltLogistics.generate();
    for (let month = 0; month < 6; month++) SaltLogistics.settleMonth();
    const initialStock = getMarkets().reduce((sum, market) => sum + (market.goods[1]?.stock ?? 0), 0);
    const initialOutput = getOrCreateCumulativeMarketIntake()?.[1] ?? 0;

    for (let month = 0; month < 24; month++) SaltLogistics.settleMonth();

    const finalStock = getMarkets().reduce((sum, market) => sum + (market.goods[1]?.stock ?? 0), 0);
    const finalOutput = getOrCreateCumulativeMarketIntake()?.[1] ?? 0;
    expect(finalStock).toBeCloseTo(initialStock, 2);
    expect(finalOutput).toBeGreaterThan(initialOutput);
  });
});
